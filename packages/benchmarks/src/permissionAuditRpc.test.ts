import { describe, expect, it } from "vitest";

import { sha256Bytes, sha256Canonical } from "./canonical.js";
import { type PermissionAuditBundle } from "./permissionAudit.js";
import {
  buildPermissionAuditRpcPlan,
  validatePermissionAuditRpcResponse
} from "./permissionAuditRpc.js";

const target = `0x${"1".repeat(40)}`;
const recipient = `0x${"2".repeat(40)}`;
const token = `0x${"3".repeat(40)}`;
const code = "0x60006000";
const grantTransactionHash = `0x${"4".repeat(64)}`;
const grantBlockHash = `0x${"5".repeat(64)}`;
const revokeTransactionHash = `0x${"6".repeat(64)}`;
const revokeBlockHash = `0x${"7".repeat(64)}`;

function bundle(): PermissionAuditBundle {
  const call = {
    codeSha256: sha256Bytes(Buffer.from(code.slice(2), "hex")),
    recipient,
    selector: "0x12345678",
    target,
    token
  };
  const candidate = {
    calls: [call],
    chainId: 97,
    dispatcher: "direct-only" as const,
    expiresAtUtc: "2026-08-17T13:00:00.000Z",
    quoteObservedAtUtc: "2026-08-17T11:29:30.000Z",
    revokePath: "present" as const,
    sessionSignerExposure: "none" as const,
    spendCaps: [{ limitBaseUnits: "1000", periodSeconds: "300", token }],
    unknownOutcomePolicy: "halt-and-probe" as const
  };
  const evidence = ["proposal", "corpus", "lifecycle", "code", "sdk", "database"].map(
    (artifactId) => ({
      artifactId,
      locator: `evidence/${artifactId}.json`,
      sha256: sha256Canonical({ artifactId })
    })
  );
  return {
    activationProposal: { candidate, caseId: "activation", evidenceArtifactIds: ["proposal"] },
    adversarialCorpus: [{ candidate, caseId: "control", evidenceArtifactIds: ["corpus"] }],
    authorityLifecycle: {
      chainId: 97,
      executeBlockHash: `0x${"8".repeat(64)}`,
      executeObservedAtUtc: "2026-08-17T11:30:00.000Z",
      executeTransactionHash: `0x${"9".repeat(64)}`,
      finalAuthorityState: "revoked",
      grantBlockHash,
      grantObservedAtUtc: "2026-08-17T11:20:00.000Z",
      grantTransactionHash,
      revokeBlockHash,
      revokeObservedAtUtc: "2026-08-17T11:40:00.000Z",
      revokeTransactionHash
    },
    codeAuthorityAttestation: {
      attestedCalls: [call],
      blockHash: `0x${"8".repeat(64)}`,
      blockNumber: "125500000",
      chainId: 97
    },
    durableClaimState: {
      claimEvidenceLevel: "direct-record",
      claimEnforcementLayer: "postgresql-grant-claim",
      claimState: "claimed",
      databaseClaimRecordObserved: true,
      databaseDeploymentReceiptArtifactId: "database",
      reservationId: "reservation-001",
      unknownOutcomeRetryAllowed: false
    },
    evidence,
    expectedPolicy: {
      allowedCalls: [call],
      chainId: 97,
      expiresAtUtc: candidate.expiresAtUtc,
      maximumQuoteAgeSeconds: 60,
      requiredClaimEnforcementLayer: "postgresql-grant-claim",
      requiresDirectClaimEvidence: true,
      requiresDatabaseClaimRecord: true,
      spendCaps: candidate.spendCaps
    },
    frozenAtUtc: "2026-08-17T12:00:00.000Z",
    schemaVersion: "proofera-termix-permission-audit-bundle-v1.1.0",
    sdkBehavior: {
      callsIdRetainedAfterGrantException: "no",
      evidenceArtifactId: "sdk",
      packageBytesSha256: sha256Canonical({ sdk: "0.7.0" }),
      version: "0.7.0"
    },
    sourceBindings: {
      activationProposalArtifactId: "proposal",
      adversarialCorpusArtifactId: "corpus",
      authorityLifecycleReceiptsArtifactId: "lifecycle",
      codeAuthorityAttestationArtifactId: "code",
      sdkBehaviorEvidenceArtifactId: "sdk"
    }
  };
}

describe("permission audit fixed RPC plan", () => {
  it("builds chain, grant, revoke and exact-block code reads only", () => {
    const plan = buildPermissionAuditRpcPlan(bundle(), "audit-run");
    expect(plan.map(({ kind }) => kind)).toEqual([
      "chain-id",
      "grant-receipt",
      "revoke-receipt",
      "target-code"
    ]);
    expect(plan.every(({ requestBody }) => !requestBody.includes("eth_send"))).toBe(true);
    expect(plan[3]?.requestBody).toContain(bundle().codeAuthorityAttestation.blockHash);
  });

  it("accepts only exact successful lifecycle receipts and runtime bytes", () => {
    const input = bundle();
    const plan = buildPermissionAuditRpcPlan(input, "audit-run");
    const bodies = [
      { id: plan[0]?.exchangeId, jsonrpc: "2.0", result: "0x61" },
      {
        id: plan[1]?.exchangeId,
        jsonrpc: "2.0",
        result: { blockHash: grantBlockHash, status: "0x1", transactionHash: grantTransactionHash }
      },
      {
        id: plan[2]?.exchangeId,
        jsonrpc: "2.0",
        result: {
          blockHash: revokeBlockHash,
          status: "0x1",
          transactionHash: revokeTransactionHash
        }
      },
      { id: plan[3]?.exchangeId, jsonrpc: "2.0", result: code }
    ];
    plan.forEach((entry, index) =>
      expect(() =>
        validatePermissionAuditRpcResponse(entry, JSON.stringify(bodies[index]), input)
      ).not.toThrow()
    );
  });

  it("rejects wrong chain, receipt joins and code", () => {
    const input = bundle();
    const plan = buildPermissionAuditRpcPlan(input, "audit-run");
    const chain = plan[0];
    const grant = plan[1];
    const targetCode = plan[3];
    if (chain === undefined || grant === undefined || targetCode === undefined) {
      throw new Error("Missing RPC plan fixture");
    }
    expect(() =>
      validatePermissionAuditRpcResponse(
        chain,
        JSON.stringify({ id: chain.exchangeId, jsonrpc: "2.0", result: "0x38" }),
        input
      )
    ).toThrow("TERMIX_PERMISSION_AUDIT_RPC_CHAIN_MISMATCH");
    expect(() =>
      validatePermissionAuditRpcResponse(
        grant,
        JSON.stringify({
          id: grant.exchangeId,
          jsonrpc: "2.0",
          result: {
            blockHash: revokeBlockHash,
            status: "0x1",
            transactionHash: grantTransactionHash
          }
        }),
        input
      )
    ).toThrow("TERMIX_PERMISSION_AUDIT_RPC_RECEIPT_MISMATCH");
    expect(() =>
      validatePermissionAuditRpcResponse(
        targetCode,
        JSON.stringify({ id: targetCode.exchangeId, jsonrpc: "2.0", result: "0x6001" }),
        input
      )
    ).toThrow("TERMIX_PERMISSION_AUDIT_RPC_CODE_MISMATCH");
  });
});
