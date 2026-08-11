import { z } from "zod";

import {
  ACTIVATION_POLICY_VERSION,
  activationPolicySchema,
  canonicalActivationPolicyJson,
  hashActivationPolicy,
  type ActivationPolicy,
  type ContractIdentity
} from "./activation-policy";

export const PERMISSION_PREVIEW_SCHEMA_VERSION = 1 as const;

export const permissionPreviewEnforcementSchema = z.enum([
  "Altana/onchain",
  "ProofEra runtime",
  "wallet confirmation"
]);

export type PermissionPreviewEnforcement = z.infer<typeof permissionPreviewEnforcementSchema>;

/**
 * Untrusted labels are deliberately data, never markup. Consumers must render `text`
 * through a text node and must not pass it to an HTML interpreter.
 */
export const permissionPreviewPlainTextSchema = z.strictObject({
  renderAs: z.literal("text"),
  text: z.string()
});

const addressSchema = z.string().regex(/^0x[a-f0-9]{40}$/);
const bytes32Schema = z.string().regex(/^0x[a-f0-9]{64}$/);
const selectorSchema = z.string().regex(/^0x[a-f0-9]{8}$/);
const MAX_UINT256 = (1n << 256n) - 1n;

function isUint256(value: string): boolean {
  try {
    return BigInt(value) <= MAX_UINT256;
  } catch {
    return false;
  }
}

const canonicalUnsignedIntegerSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine(isUint256, "Value exceeds uint256.");
const positiveCanonicalUnsignedIntegerSchema = z
  .string()
  .max(78)
  .regex(/^[1-9][0-9]*$/)
  .refine(isUint256, "Value exceeds uint256.");
const rowIdSchema = z.string().min(1).max(320);
const worstCaseSchema = z.string().startsWith("Worst case:");

const tokenMetadataShape = {
  decimals: z.number().int().min(0).max(255).nullable(),
  metadataStatus: z.enum(["known", "missing", "ambiguous"]),
  symbol: permissionPreviewPlainTextSchema.nullable(),
  tokenAddress: addressSchema
} as const;

const identityPreviewSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    codeHash: bytes32Schema,
    enforcement: z.literal("ProofEra runtime"),
    kind: z.literal("code_hash"),
    worstCase: worstCaseSchema
  }),
  z.strictObject({
    enforcement: z.literal("ProofEra runtime"),
    implementationAddress: addressSchema,
    implementationCodeHash: bytes32Schema,
    kind: z.literal("implementation"),
    worstCase: worstCaseSchema
  })
]);

const policyBindingRowSchema = z.strictObject({
  enforcement: z.literal("wallet confirmation"),
  label: z.literal("Policy binding"),
  policyHash: bytes32Schema,
  policyVersion: z.literal(ACTIVATION_POLICY_VERSION),
  rowId: z.literal("policy-binding"),
  worstCase: worstCaseSchema
});

const networkRowSchema = z.strictObject({
  chainId: z.union([z.literal(56), z.literal(97)]),
  enforcement: z.literal("wallet confirmation"),
  environment: z.enum(["mainnet", "testnet"]),
  label: z.literal("Network"),
  name: z.enum(["BSC", "BSC Testnet"]),
  rowId: z.literal("network"),
  worstCase: worstCaseSchema
});

const walletRowSchema = z.strictObject({
  address: addressSchema,
  enforcement: z.literal("ProofEra runtime"),
  label: z.literal("Execution wallet"),
  rowId: z.literal("wallet"),
  worstCase: worstCaseSchema
});

const agentRowSchema = z.strictObject({
  agent: permissionPreviewPlainTextSchema,
  enforcement: z.literal("wallet confirmation"),
  label: z.literal("Agent"),
  rowId: z.literal("agent"),
  worstCase: worstCaseSchema
});

const expiryRowSchema = z.strictObject({
  enforcement: z.literal("Altana/onchain"),
  expiryUnixSeconds: z.number().int().positive(),
  expiryUtc: z.iso.datetime().nullable(),
  label: z.literal("Session expiry"),
  rowId: z.literal("expiry"),
  worstCase: worstCaseSchema
});

export const permissionPreviewCallRowSchema = z.strictObject({
  contractAddress: addressSchema,
  contractLabel: permissionPreviewPlainTextSchema,
  enforcement: z.literal("Altana/onchain"),
  expectedIdentity: identityPreviewSchema,
  label: z.literal("Allowed contract call"),
  operationKind: z.enum(["direct", "dispatcher"]),
  rowId: rowIdSchema,
  selector: selectorSchema,
  signature: z.string().min(1),
  worstCase: worstCaseSchema
});

export const permissionPreviewCapitalRowSchema = z.strictObject({
  amountRaw: positiveCanonicalUnsignedIntegerSchema,
  decimals: z.number().int().min(0).max(255),
  enforcement: z.literal("wallet confirmation"),
  label: z.literal("Configured capital"),
  period: z.null(),
  rowId: rowIdSchema,
  symbol: permissionPreviewPlainTextSchema,
  tokenAddress: addressSchema,
  worstCase: worstCaseSchema
});

export const permissionPreviewSpendCapRowSchema = z.strictObject({
  ...tokenMetadataShape,
  enforcement: z.literal("Altana/onchain"),
  label: z.literal("Token spend cap"),
  limitRaw: positiveCanonicalUnsignedIntegerSchema,
  period: z.enum(["minute", "hour", "day", "week", "month", "year"]),
  rowId: rowIdSchema,
  worstCase: worstCaseSchema
});

const recipientRowSchema = z.strictObject({
  address: addressSchema,
  enforcement: z.literal("ProofEra runtime"),
  kind: z.literal("recipient"),
  label: z.literal("Recipient"),
  rowId: z.literal("constraint:recipient"),
  worstCase: worstCaseSchema
});

const tokenIdRowSchema = z.strictObject({
  enforcement: z.literal("ProofEra runtime"),
  kind: z.literal("token_id"),
  label: z.literal("Position token ID"),
  rowId: z.literal("constraint:token-id"),
  tokenIdRaw: canonicalUnsignedIntegerSchema,
  worstCase: worstCaseSchema
});

const tickRangeRowSchema = z.strictObject({
  enforcement: z.literal("ProofEra runtime"),
  kind: z.literal("tick_range"),
  label: z.literal("Tick range"),
  lower: z.number().int(),
  rowId: z.literal("constraint:tick-range"),
  upper: z.number().int(),
  worstCase: worstCaseSchema
});

const minimumAmountEntrySchema = z.strictObject({
  ...tokenMetadataShape,
  amountRaw: canonicalUnsignedIntegerSchema
});

const minimumAmountsRowSchema = z.strictObject({
  amounts: z.array(minimumAmountEntrySchema).min(1),
  enforcement: z.literal("ProofEra runtime"),
  kind: z.literal("minimum_amounts"),
  label: z.literal("Minimum output amounts"),
  rowId: z.literal("constraint:minimum-amounts"),
  worstCase: worstCaseSchema
});

const slippageRowSchema = z.strictObject({
  enforcement: z.literal("ProofEra runtime"),
  kind: z.literal("slippage"),
  label: z.literal("Maximum slippage"),
  rowId: z.literal("constraint:slippage"),
  slippageBps: z.number().int().min(1).max(500),
  worstCase: worstCaseSchema
});

const quoteAgeRowSchema = z.strictObject({
  ageAtPreviewMilliseconds: z.null(),
  enforcement: z.literal("ProofEra runtime"),
  kind: z.literal("quote_age"),
  label: z.literal("Quote age and validity"),
  observedAt: z.iso.datetime({ offset: true }),
  rowId: z.literal("constraint:quote-age"),
  sourceUrl: z.url({ protocol: /^https?$/ }),
  validUntil: z.iso.datetime({ offset: true }),
  validityWindowMilliseconds: z.number().int(),
  worstCase: worstCaseSchema
});

const deadlineRowSchema = z.strictObject({
  deadlineSeconds: z.number().int().min(30).max(1_800),
  enforcement: z.literal("ProofEra runtime"),
  kind: z.literal("deadline"),
  label: z.literal("Transaction deadline"),
  rowId: z.literal("constraint:deadline"),
  transactionDeadlineUnixSeconds: z.number().int().positive(),
  transactionDeadlineUtc: z.iso.datetime().nullable(),
  worstCase: worstCaseSchema
});

const maxExecutionsRowSchema = z.strictObject({
  enforcement: z.literal("ProofEra runtime"),
  kind: z.literal("max_executions"),
  label: z.literal("Maximum executions"),
  maxExecutionsPerDay: z.number().int().min(1).max(144),
  period: z.literal("day"),
  rowId: z.literal("constraint:max-executions"),
  worstCase: worstCaseSchema
});

const emergencyRowSchema = z.strictObject({
  enforcement: z.literal("ProofEra runtime"),
  kind: z.literal("emergency"),
  label: z.literal("Emergency behavior"),
  onDeviation: z.literal("block-and-alert"),
  onStaleQuote: z.literal("block"),
  rowId: z.literal("constraint:emergency"),
  worstCase: worstCaseSchema
});

const revokeRowSchema = z.strictObject({
  completionRequirement: z.literal("fresh_authority_absence_probe"),
  enforcement: z.literal("wallet confirmation"),
  kind: z.literal("revoke"),
  label: z.literal("Emergency revoke"),
  rowId: z.literal("constraint:revoke"),
  userCanRevoke: z.literal(true),
  worstCase: worstCaseSchema
});

export const permissionPreviewConstraintRowSchema = z.discriminatedUnion("kind", [
  recipientRowSchema,
  tokenIdRowSchema,
  tickRangeRowSchema,
  minimumAmountsRowSchema,
  slippageRowSchema,
  quoteAgeRowSchema,
  deadlineRowSchema,
  maxExecutionsRowSchema,
  emergencyRowSchema,
  revokeRowSchema
]);

export const activationPermissionPreviewSchema = z.strictObject({
  worstCase: worstCaseSchema,
  schemaVersion: z.literal(PERMISSION_PREVIEW_SCHEMA_VERSION),
  policyHash: bytes32Schema,
  policyVersion: z.literal(ACTIVATION_POLICY_VERSION),
  overviewRows: z.strictObject({
    agent: agentRowSchema,
    expiry: expiryRowSchema,
    network: networkRowSchema,
    policyBinding: policyBindingRowSchema,
    wallet: walletRowSchema
  }),
  callRows: z.array(permissionPreviewCallRowSchema).min(1).max(24),
  capitalRows: z.array(permissionPreviewCapitalRowSchema).min(1).max(8),
  spendCapRows: z.array(permissionPreviewSpendCapRowSchema).min(1).max(8),
  constraintRows: z.array(permissionPreviewConstraintRowSchema).length(10),
  scopeBoundary: z.literal(
    "Altana/onchain constrains the listed contract addresses, function selectors, token spend caps, and session expiry. It does not constrain calldata arguments. ProofEra runtime must independently enforce recipient, token ID, ticks, minimum amounts, slippage, quote freshness, deadlines, wallet binding, emergency behavior, and execution count before submission."
  )
});

export type ActivationPermissionPreview = z.infer<typeof activationPermissionPreviewSchema>;

type TokenMetadata = {
  decimals: number | null;
  metadataStatus: "known" | "missing" | "ambiguous";
  symbol: z.infer<typeof permissionPreviewPlainTextSchema> | null;
  tokenAddress: string;
};

function plainText(text: string): z.infer<typeof permissionPreviewPlainTextSchema> {
  return { renderAs: "text", text };
}

function canonicalPolicy(unparsedPolicy: unknown): ActivationPolicy {
  const parsed = activationPolicySchema.parse(unparsedPolicy);
  return activationPolicySchema.parse(JSON.parse(canonicalActivationPolicyJson(parsed)));
}

function unixSecondsToIso(unixSeconds: number): string | null {
  const milliseconds = unixSeconds * 1_000;
  if (!Number.isSafeInteger(milliseconds)) return null;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toISOString();
  } catch {
    return null;
  }
}

function identityPreview(identity: ContractIdentity): z.infer<typeof identityPreviewSchema> {
  const common = {
    enforcement: "ProofEra runtime" as const,
    worstCase:
      "Worst case: a changed or unverified deployment could execute different code; ProofEra runtime must verify this identity before every submission."
  };
  if (identity.kind === "code_hash") {
    return { ...common, codeHash: identity.codeHash.toLowerCase(), kind: identity.kind };
  }
  return {
    ...common,
    implementationAddress: identity.implementationAddress.toLowerCase(),
    implementationCodeHash: identity.implementationCodeHash.toLowerCase(),
    kind: identity.kind
  };
}

function buildTokenMetadataIndex(capital: ActivationPolicy["capital"]): Map<string, TokenMetadata> {
  const grouped = new Map<string, ActivationPolicy["capital"]>();
  for (const entry of capital) {
    const tokenAddress = entry.address.toLowerCase();
    const current = grouped.get(tokenAddress) ?? [];
    current.push(entry);
    grouped.set(tokenAddress, current);
  }

  const index = new Map<string, TokenMetadata>();
  for (const [tokenAddress, entries] of grouped) {
    const entry = entries[0];
    if (entries.length !== 1 || entry === undefined) {
      index.set(tokenAddress, {
        decimals: null,
        metadataStatus: "ambiguous",
        symbol: null,
        tokenAddress
      });
      continue;
    }
    index.set(tokenAddress, {
      decimals: entry.decimals,
      metadataStatus: "known",
      symbol: plainText(entry.symbol),
      tokenAddress
    });
  }
  return index;
}

function tokenMetadata(token: string, index: Map<string, TokenMetadata>): TokenMetadata {
  const tokenAddress = token.toLowerCase();
  return (
    index.get(tokenAddress) ?? {
      decimals: null,
      metadataStatus: "missing",
      symbol: null,
      tokenAddress
    }
  );
}

/**
 * Builds display data only. The caller must separately require a successful
 * server-owned `validateActivationPolicy` result before asking for confirmation.
 */
export function buildActivationPermissionPreview(
  unparsedPolicy: unknown
): ActivationPermissionPreview {
  const policy = canonicalPolicy(unparsedPolicy);
  const policyHash = hashActivationPolicy(policy).toLowerCase() as `0x${string}`;
  const metadataIndex = buildTokenMetadataIndex(policy.capital);

  const callRows = policy.calls.map((call, index) => ({
    contractAddress: call.to.toLowerCase(),
    contractLabel: plainText(call.contractLabel),
    enforcement: "Altana/onchain" as const,
    expectedIdentity: identityPreview(call.expectedIdentity),
    label: "Allowed contract call" as const,
    operationKind: call.operationKind,
    rowId: `call:${index}:${call.to.toLowerCase()}:${call.selector.toLowerCase()}`,
    selector: call.selector.toLowerCase(),
    signature: call.signature,
    worstCase:
      call.operationKind === "dispatcher"
        ? "Worst case: this dispatcher can route encoded calldata beyond the displayed top-level call. Altana/onchain constrains only its target and selector, not nested calls or arguments; activation must remain blocked unless separately reviewed."
        : "Worst case: Altana/onchain permits this exact target and selector until expiry, subject to spend caps. The signature is paired to the selector for display, but calldata arguments are not constrained by Altana/onchain."
  }));

  const capitalRows = policy.capital.map((entry, index) => ({
    amountRaw: entry.amountRaw,
    decimals: entry.decimals,
    enforcement: "wallet confirmation" as const,
    label: "Configured capital" as const,
    period: null,
    rowId: `capital:${index}:${entry.address.toLowerCase()}`,
    symbol: plainText(entry.symbol),
    tokenAddress: entry.address.toLowerCase(),
    worstCase:
      "Worst case: all separately transferred or approved configured capital can be exposed to strategy outcomes. This row is not a balance, price, valuation, transfer, or spend-authority claim."
  }));

  const spendCapRows = policy.spend.map((entry, index) => ({
    ...tokenMetadata(entry.token, metadataIndex),
    enforcement: "Altana/onchain" as const,
    label: "Token spend cap" as const,
    limitRaw: entry.limitRaw,
    period: entry.period,
    rowId: `spend:${index}:${entry.token.toLowerCase()}:${entry.period}`,
    worstCase:
      "Worst case: the session may spend this entire raw-unit cap during every listed period until expiry; the cap is not a price or fee estimate."
  }));

  const validityWindowMilliseconds =
    Date.parse(policy.quote.validUntil) - Date.parse(policy.quote.observedAt);
  const minimumAmounts = policy.minimumAmounts.map((entry) => ({
    ...tokenMetadata(entry.token, metadataIndex),
    amountRaw: entry.amountRaw
  }));

  return activationPermissionPreviewSchema.parse({
    worstCase:
      "Worst case: until the listed expiry, the session may invoke every listed contract/function pair and spend every listed token/period cap. Runtime-only argument checks can fail independently, so the worker must block before submission whenever any frozen constraint cannot be verified.",
    schemaVersion: PERMISSION_PREVIEW_SCHEMA_VERSION,
    policyHash,
    policyVersion: policy.version,
    overviewRows: {
      agent: {
        agent: plainText(policy.agentId),
        enforcement: "wallet confirmation",
        label: "Agent",
        rowId: "agent",
        worstCase:
          "Worst case: this identifier is misleading or untrusted metadata; confirming it does not prove the agent's identity, code, or performance."
      },
      expiry: {
        enforcement: "Altana/onchain",
        expiryUnixSeconds: policy.expiry,
        expiryUtc: unixSecondsToIso(policy.expiry),
        label: "Session expiry",
        rowId: "expiry",
        worstCase:
          "Worst case: all listed onchain permissions remain usable until this exact expiry unless the authority is revoked earlier."
      },
      network: {
        chainId: policy.chain.chainId,
        enforcement: "wallet confirmation",
        environment: policy.chain.environment,
        label: "Network",
        name: policy.chain.name,
        rowId: "network",
        worstCase:
          "Worst case: confirming on the wrong network grants authority over different contracts or assets; the wallet must show this exact chain."
      },
      policyBinding: {
        enforcement: "wallet confirmation",
        label: "Policy binding",
        policyHash,
        policyVersion: policy.version,
        rowId: "policy-binding",
        worstCase:
          "Worst case: a different hash represents different permissions; grant and worker execution must reject any hash mismatch."
      },
      wallet: {
        address: policy.wallet.toLowerCase(),
        enforcement: "ProofEra runtime",
        label: "Execution wallet",
        rowId: "wallet",
        worstCase:
          "Worst case: submitting from a different wallet bypasses the reviewed binding; ProofEra runtime must block any mismatch before submission."
      }
    },
    callRows,
    capitalRows,
    spendCapRows,
    constraintRows: [
      {
        address: policy.recipient.toLowerCase(),
        enforcement: "ProofEra runtime",
        kind: "recipient",
        label: "Recipient",
        rowId: "constraint:recipient",
        worstCase:
          "Worst case: malicious calldata redirects assets; Altana/onchain does not inspect this argument, so ProofEra runtime must require this exact recipient."
      },
      {
        enforcement: "ProofEra runtime",
        kind: "token_id",
        label: "Position token ID",
        rowId: "constraint:token-id",
        tokenIdRaw: policy.tokenId,
        worstCase:
          "Worst case: malicious calldata modifies another position; Altana/onchain does not inspect this argument, so ProofEra runtime must require this exact token ID."
      },
      {
        enforcement: "ProofEra runtime",
        kind: "tick_range",
        label: "Tick range",
        lower: policy.tickRange.lower,
        rowId: "constraint:tick-range",
        upper: policy.tickRange.upper,
        worstCase:
          "Worst case: malicious calldata chooses an unsafe range; Altana/onchain does not inspect these arguments, so ProofEra runtime must require both exact ticks."
      },
      {
        amounts: minimumAmounts,
        enforcement: "ProofEra runtime",
        kind: "minimum_amounts",
        label: "Minimum output amounts",
        rowId: "constraint:minimum-amounts",
        worstCase:
          "Worst case: weak minimum outputs permit a materially worse execution; ProofEra runtime must require every exact raw-unit minimum before submission."
      },
      {
        enforcement: "ProofEra runtime",
        kind: "slippage",
        label: "Maximum slippage",
        rowId: "constraint:slippage",
        slippageBps: policy.slippageBps,
        worstCase:
          "Worst case: execution loses the full configured basis-point tolerance; this is a runtime bound, not an Altana/onchain calldata constraint or outcome guarantee."
      },
      {
        ageAtPreviewMilliseconds: null,
        enforcement: "ProofEra runtime",
        kind: "quote_age",
        label: "Quote age and validity",
        observedAt: policy.quote.observedAt,
        rowId: "constraint:quote-age",
        sourceUrl: policy.quote.sourceUrl,
        validUntil: policy.quote.validUntil,
        validityWindowMilliseconds,
        worstCase:
          "Worst case: the quote is stale despite its validity window. No build-time clock or price is inferred here; ProofEra runtime must recompute age and block stale or expired quotes before submission."
      },
      {
        deadlineSeconds: policy.deadlineSeconds,
        enforcement: "ProofEra runtime",
        kind: "deadline",
        label: "Transaction deadline",
        rowId: "constraint:deadline",
        transactionDeadlineUnixSeconds: policy.transactionDeadline,
        transactionDeadlineUtc: unixSecondsToIso(policy.transactionDeadline),
        worstCase:
          "Worst case: a transaction submitted near the deadline executes against changed conditions; ProofEra runtime must block after either deadline bound."
      },
      {
        enforcement: "ProofEra runtime",
        kind: "max_executions",
        label: "Maximum executions",
        maxExecutionsPerDay: policy.maxExecutionsPerDay,
        period: "day",
        rowId: "constraint:max-executions",
        worstCase:
          "Worst case: the strategy performs this full execution count each day until expiry; Altana/onchain does not enforce this counter."
      },
      {
        enforcement: "ProofEra runtime",
        kind: "emergency",
        label: "Emergency behavior",
        onDeviation: policy.emergency.onDeviation,
        onStaleQuote: policy.emergency.onStaleQuote,
        rowId: "constraint:emergency",
        worstCase:
          "Worst case: runtime monitoring is unavailable and cannot perform its promised block or alert; onchain spend caps, call scope, expiry, and user revoke remain the independent limits."
      },
      {
        completionRequirement: "fresh_authority_absence_probe",
        enforcement: "wallet confirmation",
        kind: "revoke",
        label: "Emergency revoke",
        rowId: "constraint:revoke",
        userCanRevoke: policy.emergency.userCanRevoke,
        worstCase:
          "Worst case: a relay reports success while authority remains active; revocation is final only after wallet confirmation and a fresh probe proves the session key absent."
      }
    ],
    scopeBoundary:
      "Altana/onchain constrains the listed contract addresses, function selectors, token spend caps, and session expiry. It does not constrain calldata arguments. ProofEra runtime must independently enforce recipient, token ID, ticks, minimum amounts, slippage, quote freshness, deadlines, wallet binding, emergency behavior, and execution count before submission."
  });
}
