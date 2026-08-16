import { z } from "zod";

import { canonicalJson, sha256Bytes } from "./canonical.js";
import { PermissionAuditBundleSchema, type PermissionAuditBundle } from "./permissionAudit.js";
import { BenchmarkIdSchema } from "./schemas.js";

export const PERMISSION_AUDIT_RPC_ENDPOINT = "https://bsc-testnet-rpc.publicnode.com" as const;
export const PERMISSION_AUDIT_RPC_PROVIDER = "PublicNode BSC Testnet JSON-RPC" as const;

const jsonRpcResponseSchema = z.strictObject({
  id: z.string().min(1).max(100),
  jsonrpc: z.literal("2.0"),
  result: z.unknown()
});

export type PermissionAuditRpcObservationKind =
  "chain-id" | "grant-receipt" | "revoke-receipt" | "target-code";

export interface PermissionAuditRpcPlanEntry {
  readonly exchangeId: string;
  readonly kind: PermissionAuditRpcObservationKind;
  readonly requestBody: string;
  readonly target?: string;
}

/** Build the complete fixed, read-only RPC plan required inside either timed lane. */
export function buildPermissionAuditRpcPlan(
  input: PermissionAuditBundle,
  idPrefix: string
): readonly PermissionAuditRpcPlanEntry[] {
  const bundle = PermissionAuditBundleSchema.parse(input);
  const prefix = BenchmarkIdSchema.parse(idPrefix);
  const targets = [
    ...new Set(
      bundle.codeAuthorityAttestation.attestedCalls.map(({ target }) => target.toLowerCase())
    )
  ].sort();
  const entries: PermissionAuditRpcPlanEntry[] = [
    rpcEntry(prefix, "chain", "chain-id", "eth_chainId", []),
    rpcEntry(prefix, "grant", "grant-receipt", "eth_getTransactionReceipt", [
      bundle.authorityLifecycle.grantTransactionHash
    ]),
    rpcEntry(prefix, "revoke", "revoke-receipt", "eth_getTransactionReceipt", [
      bundle.authorityLifecycle.revokeTransactionHash
    ])
  ];
  targets.forEach((target, index) => {
    entries.push(
      rpcEntry(
        prefix,
        `code-${index}`,
        "target-code",
        "eth_getCode",
        [target, { blockHash: bundle.codeAuthorityAttestation.blockHash, requireCanonical: true }],
        target
      )
    );
  });
  return entries;
}

/** Validate exact raw response bytes against one prebuilt plan entry and bundle. */
export function validatePermissionAuditRpcResponse(
  entry: PermissionAuditRpcPlanEntry,
  responseBody: string,
  input: PermissionAuditBundle
): void {
  const bundle = PermissionAuditBundleSchema.parse(input);
  let raw: unknown;
  try {
    raw = JSON.parse(responseBody) as unknown;
  } catch {
    throw new Error("TERMIX_PERMISSION_AUDIT_RPC_RESPONSE_JSON_INVALID");
  }
  const response = jsonRpcResponseSchema.parse(raw);
  if (response.id !== entry.exchangeId) {
    throw new Error("TERMIX_PERMISSION_AUDIT_RPC_RESPONSE_ID_MISMATCH");
  }
  if (entry.kind === "chain-id") {
    if (response.result !== "0x61") {
      throw new Error("TERMIX_PERMISSION_AUDIT_RPC_CHAIN_MISMATCH");
    }
    return;
  }
  if (entry.kind === "target-code") {
    const code = z
      .string()
      .regex(/^0x(?:[0-9a-fA-F]{2})+$/u)
      .parse(response.result);
    const expectedDigests = bundle.codeAuthorityAttestation.attestedCalls
      .filter(({ target }) => target.toLowerCase() === entry.target)
      .map(({ codeSha256 }) => codeSha256);
    if (
      expectedDigests.length === 0 ||
      new Set(expectedDigests).size !== 1 ||
      sha256Bytes(Buffer.from(code.slice(2), "hex")) !== expectedDigests[0]
    ) {
      throw new Error("TERMIX_PERMISSION_AUDIT_RPC_CODE_MISMATCH");
    }
    return;
  }
  const receipt = z
    .looseObject({
      blockHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/u),
      status: z.literal("0x1"),
      transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/u)
    })
    .parse(response.result);
  const expected =
    entry.kind === "grant-receipt"
      ? {
          blockHash: bundle.authorityLifecycle.grantBlockHash,
          transactionHash: bundle.authorityLifecycle.grantTransactionHash
        }
      : {
          blockHash: bundle.authorityLifecycle.revokeBlockHash,
          transactionHash: bundle.authorityLifecycle.revokeTransactionHash
        };
  if (
    receipt.blockHash.toLowerCase() !== expected.blockHash.toLowerCase() ||
    receipt.transactionHash.toLowerCase() !== expected.transactionHash.toLowerCase()
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_RPC_RECEIPT_MISMATCH");
  }
}

function rpcEntry(
  prefix: string,
  suffix: string,
  kind: PermissionAuditRpcObservationKind,
  method: "eth_chainId" | "eth_getCode" | "eth_getTransactionReceipt",
  params: readonly unknown[],
  target?: string
): PermissionAuditRpcPlanEntry {
  const exchangeId = BenchmarkIdSchema.parse(`${prefix}-${suffix}`);
  return {
    exchangeId,
    kind,
    requestBody: canonicalJson({ id: exchangeId, jsonrpc: "2.0", method, params }),
    ...(target === undefined ? {} : { target })
  };
}
