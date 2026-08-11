import { keccak256, stringToHex, toFunctionSelector } from "viem";
import { z } from "zod";

export const ACTIVATION_POLICY_VERSION = "1.0.0-draft" as const;
const ACTIVATION_POLICY_HASH_DOMAIN = "ProofEra activation policy\n";
const MAX_UINT256 = (1n << 256n) - 1n;

function isCanonicalUint256(value: string, allowZero: boolean): boolean {
  const format = allowZero ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/;
  if (!format.test(value) || value.length > 78) return true;
  return BigInt(value) <= MAX_UINT256;
}

const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address.");
const selectorSchema = z.string().regex(/^0x[a-fA-F0-9]{8}$/, "Invalid function selector.");
const codeHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid EVM bytecode hash.");
const rawAmountSchema = z
  .string()
  .max(78, "Amount exceeds uint256 base units.")
  .regex(/^[1-9][0-9]*$/, "Amount must be positive canonical base units.")
  .refine((value) => isCanonicalUint256(value, false), "Amount exceeds uint256 base units.");
const minimumRawAmountSchema = z
  .string()
  .max(78, "Minimum amount exceeds uint256 base units.")
  .regex(/^(0|[1-9][0-9]*)$/, "Minimum amount must be canonical base units.")
  .refine((value) => isCanonicalUint256(value, true), "Minimum amount exceeds uint256 base units.");
const tokenIdSchema = z
  .string()
  .max(78, "Token ID exceeds uint256.")
  .regex(/^(0|[1-9][0-9]*)$/, "Token ID must be a canonical unsigned integer.")
  .refine((value) => isCanonicalUint256(value, true), "Token ID exceeds uint256.");
const functionSignatureSchema = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*\([A-Za-z0-9_,()[\]]*\)$/,
    "Use a canonical Solidity function signature."
  );

export const contractIdentitySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    codeHash: codeHashSchema,
    kind: z.literal("code_hash")
  }),
  z.strictObject({
    implementationAddress: evmAddressSchema,
    implementationCodeHash: codeHashSchema,
    kind: z.literal("implementation")
  })
]);

export type ContractIdentity = z.infer<typeof contractIdentitySchema>;

const callPermissionFields = {
  contractLabel: z.string().trim().min(1).max(80),
  expectedIdentity: contractIdentitySchema,
  operationKind: z.enum(["direct", "dispatcher"]),
  selector: selectorSchema,
  signature: functionSignatureSchema,
  to: evmAddressSchema
};

function addSelectorMismatchIssue(
  permission: { selector: string; signature: string },
  context: z.RefinementCtx
): void {
  let derivedSelector: string;
  try {
    derivedSelector = toFunctionSelector(
      permission.signature as `${string}(${string})`
    ).toLowerCase();
  } catch {
    context.addIssue({
      code: "custom",
      message: "Function signature cannot be parsed as a canonical Solidity signature.",
      path: ["signature"]
    });
    return;
  }
  if (derivedSelector !== permission.selector.toLowerCase()) {
    context.addIssue({
      code: "custom",
      message: `Selector does not match ${permission.signature}.`,
      path: ["selector"]
    });
  }
}

export const activationCallPermissionSchema = z
  .strictObject(callPermissionFields)
  .superRefine(addSelectorMismatchIssue);

export const reviewedContractManifestEntrySchema = z
  .strictObject({
    ...callPermissionFields,
    chainId: z.union([z.literal(56), z.literal(97)]),
    safeDirectOperation: z.boolean()
  })
  .superRefine(addSelectorMismatchIssue);

export type ReviewedContractManifestEntry = z.infer<typeof reviewedContractManifestEntrySchema>;

export const activationTokenSchema = z.strictObject({
  address: evmAddressSchema,
  amountRaw: rawAmountSchema,
  decimals: z.number().int().min(0).max(255),
  symbol: z.string().trim().min(1).max(16)
});

export const activationSpendPermissionSchema = z.strictObject({
  limitRaw: rawAmountSchema,
  period: z.enum(["minute", "hour", "day", "week", "month", "year"]),
  token: evmAddressSchema
});

export const activationMinimumAmountSchema = z.strictObject({
  amountRaw: minimumRawAmountSchema,
  token: evmAddressSchema
});

export const activationTickRangeSchema = z
  .strictObject({
    lower: z.number().int().min(-8_388_608).max(8_388_607),
    upper: z.number().int().min(-8_388_608).max(8_388_607)
  })
  .superRefine((range, context) => {
    if (range.lower >= range.upper) {
      context.addIssue({
        code: "custom",
        message: "Tick range lower bound must be below the upper bound.",
        path: ["lower"]
      });
    }
  });

export const activationEnforcementLayerSchema = z.enum([
  "altana_onchain",
  "proofera_runtime",
  "wallet_confirmation"
]);

export const activationEnforcementSchema = z.strictObject({
  callPermissions: z.literal("altana_onchain"),
  grantConfirmation: z.literal("wallet_confirmation"),
  runtimeConstraints: z.literal("proofera_runtime"),
  sessionExpiry: z.literal("altana_onchain"),
  spendLimits: z.literal("altana_onchain")
});

const runtimeFields = {
  deadlineSeconds: z.number().int().min(30).max(1_800),
  maxExecutionsPerDay: z.number().int().min(1).max(144),
  minimumAmounts: z.array(activationMinimumAmountSchema).min(1).max(8),
  recipient: evmAddressSchema,
  tickRange: activationTickRangeSchema,
  tokenId: tokenIdSchema,
  transactionDeadline: z.number().int().positive(),
  wallet: evmAddressSchema
};

export const activationRuntimeExpectationSchema = z.strictObject(runtimeFields);

export type ActivationRuntimeExpectation = z.infer<typeof activationRuntimeExpectationSchema>;

export const activationPolicySchema = z.strictObject({
  agentId: z.string().trim().min(1).max(160),
  calls: z.array(activationCallPermissionSchema).min(1).max(24),
  capital: z.array(activationTokenSchema).min(1).max(8),
  category: z.enum([
    "lp-rebalancing",
    "grid-trading",
    "yield-optimisation",
    "health-factor-monitoring"
  ]),
  chain: z.discriminatedUnion("environment", [
    z.strictObject({
      chainId: z.literal(56),
      environment: z.literal("mainnet"),
      name: z.literal("BSC")
    }),
    z.strictObject({
      chainId: z.literal(97),
      environment: z.literal("testnet"),
      name: z.literal("BSC Testnet")
    })
  ]),
  deadlineSeconds: runtimeFields.deadlineSeconds,
  emergency: z.strictObject({
    onDeviation: z.literal("block-and-alert"),
    onStaleQuote: z.literal("block"),
    userCanRevoke: z.literal(true)
  }),
  enforcement: activationEnforcementSchema,
  expiry: z.number().int().positive(),
  maxExecutionsPerDay: runtimeFields.maxExecutionsPerDay,
  minimumAmounts: runtimeFields.minimumAmounts,
  quote: z.strictObject({
    observedAt: z.iso.datetime({ offset: true }),
    sourceUrl: z.url({ protocol: /^https?$/ }),
    validUntil: z.iso.datetime({ offset: true })
  }),
  recipient: runtimeFields.recipient,
  registerInKeystore: z.literal(true),
  slippageBps: z.number().int().min(1).max(500),
  spend: z.array(activationSpendPermissionSchema).min(1).max(8),
  tickRange: runtimeFields.tickRange,
  tokenId: runtimeFields.tokenId,
  transactionDeadline: runtimeFields.transactionDeadline,
  version: z.literal(ACTIVATION_POLICY_VERSION),
  wallet: runtimeFields.wallet
});

export type ActivationPolicy = z.infer<typeof activationPolicySchema>;

export type ActivationPolicyIssueCode =
  | "WRONG_CHAIN"
  | "MAINNET_REQUIRES_APPROVAL"
  | "EXPIRY_TOO_SOON"
  | "EXPIRY_TOO_LONG"
  | "SLIPPAGE_TOO_HIGH"
  | "QUOTE_FROM_FUTURE"
  | "QUOTE_TOO_OLD"
  | "QUOTE_EXPIRED"
  | "QUOTE_INVALID_WINDOW"
  | "QUOTE_TTL_TOO_LONG"
  | "DUPLICATE_CAPITAL_TOKEN"
  | "UNKNOWN_SPEND_TOKEN"
  | "DUPLICATE_SPEND_PERMISSION"
  | "SPEND_EXCEEDS_CAPITAL"
  | "UNKNOWN_MINIMUM_TOKEN"
  | "DUPLICATE_MINIMUM_TOKEN"
  | "MINIMUM_AMOUNT_EXCEEDS_CAPITAL"
  | "DUPLICATE_CALL_PERMISSION"
  | "UNREVIEWED_CALL_PERMISSION"
  | "CONTRACT_LABEL_MISMATCH"
  | "CONTRACT_CODE_HASH_MISMATCH"
  | "CONTRACT_IMPLEMENTATION_MISMATCH"
  | "OPERATION_KIND_MISMATCH"
  | "OPERATION_NOT_APPROVED"
  | "BROAD_MULTICALL_NOT_ALLOWED"
  | "DANGEROUS_DISPATCHER_NOT_ALLOWED"
  | "WALLET_MISMATCH"
  | "RECIPIENT_MISMATCH"
  | "TOKEN_ID_MISMATCH"
  | "TICK_RANGE_MISMATCH"
  | "MINIMUM_AMOUNTS_MISMATCH"
  | "DEADLINE_MISMATCH"
  | "MAX_EXECUTIONS_MISMATCH"
  | "TRANSACTION_DEADLINE_INVALID"
  | "POLICY_HASH_MISMATCH";

export type ActivationPolicyIssue = {
  code: ActivationPolicyIssueCode;
  message: string;
  path: string;
};

export type ActivationPolicyValidationContext = {
  allowMainnet?: boolean;
  expectedChainId: 56 | 97;
  expectedPolicyHash?: `0x${string}`;
  expectedRuntime: ActivationRuntimeExpectation;
  maxExpirySeconds?: number;
  maxQuoteAgeSeconds?: number;
  maxQuoteTtlSeconds?: number;
  maxSlippageBps?: number;
  minimumLeadSeconds?: number;
  now: () => Date;
  reviewedContractManifest: readonly ReviewedContractManifestEntry[];
};

export type ActivationPolicyValidationResult = {
  issues: readonly ActivationPolicyIssue[];
  policy: ActivationPolicy;
  policyHash: `0x${string}`;
  valid: boolean;
};

function lower(value: string): string {
  return value.toLowerCase();
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeIdentity(identity: ContractIdentity): ContractIdentity {
  if (identity.kind === "code_hash") {
    return { codeHash: lower(identity.codeHash), kind: identity.kind };
  }

  return {
    implementationAddress: lower(identity.implementationAddress),
    implementationCodeHash: lower(identity.implementationCodeHash),
    kind: identity.kind
  };
}

function normalizePolicy(unparsedPolicy: unknown): ActivationPolicy {
  const policy = activationPolicySchema.parse(unparsedPolicy);
  const calls = policy.calls
    .map((call) => ({
      ...call,
      expectedIdentity: normalizeIdentity(call.expectedIdentity),
      selector: lower(call.selector),
      to: lower(call.to)
    }))
    .sort((left, right) =>
      compareStrings(
        `${left.to}:${left.selector}:${left.signature}:${left.contractLabel}`,
        `${right.to}:${right.selector}:${right.signature}:${right.contractLabel}`
      )
    );
  const capital = policy.capital
    .map((entry) => ({ ...entry, address: lower(entry.address) }))
    .sort((left, right) =>
      compareStrings(
        `${left.address}:${left.amountRaw}:${left.decimals}:${left.symbol}`,
        `${right.address}:${right.amountRaw}:${right.decimals}:${right.symbol}`
      )
    );
  const minimumAmounts = policy.minimumAmounts
    .map((entry) => ({ ...entry, token: lower(entry.token) }))
    .sort((left, right) =>
      compareStrings(`${left.token}:${left.amountRaw}`, `${right.token}:${right.amountRaw}`)
    );
  const spend = policy.spend
    .map((entry) => ({ ...entry, token: lower(entry.token) }))
    .sort((left, right) =>
      compareStrings(
        `${left.token}:${left.period}:${left.limitRaw}`,
        `${right.token}:${right.period}:${right.limitRaw}`
      )
    );

  return {
    ...policy,
    calls,
    capital,
    minimumAmounts,
    recipient: lower(policy.recipient),
    spend,
    wallet: lower(policy.wallet)
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort(compareStrings)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${entries.join(",")}}`;
  }

  throw new Error("Activation policy contains a non-canonical JSON value.");
}

/** Canonical preview/grant/worker payload. Arrays with set semantics are sorted. */
export function canonicalActivationPolicyJson(unparsedPolicy: unknown): string {
  return canonicalJson(normalizePolicy(unparsedPolicy));
}

/** Hash this at preview and require the same hash at grant and worker execution. */
export function hashActivationPolicy(unparsedPolicy: unknown): `0x${string}` {
  return keccak256(
    stringToHex(`${ACTIVATION_POLICY_HASH_DOMAIN}${canonicalActivationPolicyJson(unparsedPolicy)}`)
  );
}

/** Freeze this only from a reviewed server-side preview, never from a worker request payload. */
export function runtimeExpectationFromPolicy(
  unparsedPolicy: unknown
): ActivationRuntimeExpectation {
  const policy = normalizePolicy(unparsedPolicy);
  return {
    deadlineSeconds: policy.deadlineSeconds,
    maxExecutionsPerDay: policy.maxExecutionsPerDay,
    minimumAmounts: policy.minimumAmounts,
    recipient: policy.recipient,
    tickRange: policy.tickRange,
    tokenId: policy.tokenId,
    transactionDeadline: policy.transactionDeadline,
    wallet: policy.wallet
  };
}

function manifestKey(chainId: 56 | 97, address: string, selector: string): string {
  return `${chainId}:${lower(address)}:${lower(selector)}`;
}

function identitiesEqual(left: ContractIdentity, right: ContractIdentity): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "code_hash" && right.kind === "code_hash") {
    return lower(left.codeHash) === lower(right.codeHash);
  }
  if (left.kind === "implementation" && right.kind === "implementation") {
    return (
      lower(left.implementationAddress) === lower(right.implementationAddress) &&
      lower(left.implementationCodeHash) === lower(right.implementationCodeHash)
    );
  }
  return false;
}

const deniedOperationNames = new Set([
  "approve",
  "execute",
  "invalidatenonces",
  "lockdown",
  "permit",
  "permittransferfrom",
  "permitwitnesstransferfrom",
  "transfer",
  "transferfrom"
]);

function dangerousOperationName(signature: string): string | undefined {
  const name = signature.slice(0, signature.indexOf("(")).toLowerCase();
  if (
    name === "multicall" ||
    deniedOperationNames.has(name) ||
    name.startsWith("refund") ||
    name.startsWith("selfpermit") ||
    name.startsWith("sweep")
  ) {
    return name;
  }
  return undefined;
}

function minimumAmountsKey(amounts: readonly { amountRaw: string; token: string }[]): string {
  return amounts
    .map((entry) => `${lower(entry.token)}:${entry.amountRaw}`)
    .sort(compareStrings)
    .join("|");
}

function checkedLimit(name: string, value: number, minimum: number): number {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

export function validateActivationPolicy(
  unparsedPolicy: unknown,
  context: ActivationPolicyValidationContext
): ActivationPolicyValidationResult {
  const policy = normalizePolicy(unparsedPolicy);
  const policyHash = hashActivationPolicy(policy);
  const now = context.now();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("Activation validation requires a valid server-owned clock.");
  }
  const nowMs = now.getTime();

  const expectedRuntime = activationRuntimeExpectationSchema.parse(context.expectedRuntime);
  const manifest = z
    .array(reviewedContractManifestEntrySchema)
    .parse(context.reviewedContractManifest);
  const manifestByPermission = new Map<string, ReviewedContractManifestEntry>();
  for (const entry of manifest) {
    const key = manifestKey(entry.chainId, entry.to, entry.selector);
    if (manifestByPermission.has(key)) {
      throw new Error(`Reviewed contract manifest has a duplicate permission: ${key}.`);
    }
    manifestByPermission.set(key, entry);
  }

  const issues: ActivationPolicyIssue[] = [];
  const addIssue = (code: ActivationPolicyIssueCode, message: string, path: string): void => {
    issues.push({ code, message, path });
  };
  const maxExpirySeconds = checkedLimit(
    "maxExpirySeconds",
    context.maxExpirySeconds ?? 30 * 24 * 60 * 60,
    1
  );
  const minimumLeadSeconds = checkedLimit(
    "minimumLeadSeconds",
    context.minimumLeadSeconds ?? 5 * 60,
    0
  );
  const maxSlippageBps = checkedLimit("maxSlippageBps", context.maxSlippageBps ?? 100, 0);
  const maxQuoteAgeSeconds = checkedLimit(
    "maxQuoteAgeSeconds",
    context.maxQuoteAgeSeconds ?? 120,
    0
  );
  const maxQuoteTtlSeconds = checkedLimit(
    "maxQuoteTtlSeconds",
    context.maxQuoteTtlSeconds ?? 10 * 60,
    1
  );

  if (policy.chain.chainId !== context.expectedChainId) {
    addIssue(
      "WRONG_CHAIN",
      `Expected chain ${context.expectedChainId}, received ${policy.chain.chainId}.`,
      "chain.chainId"
    );
  }
  if (policy.chain.environment === "mainnet" && context.allowMainnet !== true) {
    addIssue(
      "MAINNET_REQUIRES_APPROVAL",
      "Mainnet activation is disabled until explicitly approved.",
      "chain.environment"
    );
  }

  const nowSeconds = Math.floor(nowMs / 1_000);
  if (policy.expiry < nowSeconds + minimumLeadSeconds) {
    addIssue(
      "EXPIRY_TOO_SOON",
      `Expiry must be at least ${minimumLeadSeconds} seconds after preview.`,
      "expiry"
    );
  }
  if (policy.expiry > nowSeconds + maxExpirySeconds) {
    addIssue(
      "EXPIRY_TOO_LONG",
      `Expiry exceeds the ${maxExpirySeconds}-second policy maximum.`,
      "expiry"
    );
  }
  if (policy.slippageBps > maxSlippageBps) {
    addIssue(
      "SLIPPAGE_TOO_HIGH",
      `Slippage ${policy.slippageBps} bps exceeds the ${maxSlippageBps} bps limit.`,
      "slippageBps"
    );
  }

  const quoteObservedMs = Date.parse(policy.quote.observedAt);
  const quoteValidUntilMs = Date.parse(policy.quote.validUntil);
  if (quoteObservedMs > nowMs) {
    addIssue(
      "QUOTE_FROM_FUTURE",
      "Quote observation time is later than the server clock.",
      "quote.observedAt"
    );
  }
  if (nowMs - quoteObservedMs > maxQuoteAgeSeconds * 1_000) {
    addIssue(
      "QUOTE_TOO_OLD",
      `Quote is older than the ${maxQuoteAgeSeconds}-second maximum.`,
      "quote.observedAt"
    );
  }
  if (quoteObservedMs > quoteValidUntilMs) {
    addIssue(
      "QUOTE_INVALID_WINDOW",
      "Quote observation must be at or before its validity deadline.",
      "quote.validUntil"
    );
  }
  if (quoteValidUntilMs - quoteObservedMs > maxQuoteTtlSeconds * 1_000) {
    addIssue(
      "QUOTE_TTL_TOO_LONG",
      `Quote validity window exceeds the ${maxQuoteTtlSeconds}-second maximum.`,
      "quote.validUntil"
    );
  }
  if (quoteValidUntilMs <= nowMs) {
    addIssue("QUOTE_EXPIRED", "Quote validity elapsed before confirmation.", "quote.validUntil");
  }

  const capitalByToken = new Map<string, bigint>();
  for (const [index, capital] of policy.capital.entries()) {
    const token = lower(capital.address);
    if (capitalByToken.has(token)) {
      addIssue(
        "DUPLICATE_CAPITAL_TOKEN",
        "Configured capital must contain each token only once.",
        `capital.${index}.address`
      );
    }
    capitalByToken.set(token, (capitalByToken.get(token) ?? 0n) + BigInt(capital.amountRaw));
  }

  const spendAggregates = new Map<string, { amount: bigint; firstIndex: number; token: string }>();
  for (const [index, spend] of policy.spend.entries()) {
    const token = lower(spend.token);
    const key = `${token}:${spend.period}`;
    const existing = spendAggregates.get(key);
    if (existing !== undefined) {
      addIssue(
        "DUPLICATE_SPEND_PERMISSION",
        "Each token and period may have only one spend cap.",
        `spend.${index}`
      );
    }
    spendAggregates.set(key, {
      amount: (existing?.amount ?? 0n) + BigInt(spend.limitRaw),
      firstIndex: existing?.firstIndex ?? index,
      token
    });
  }
  for (const aggregate of spendAggregates.values()) {
    const capital = capitalByToken.get(aggregate.token);
    if (capital === undefined) {
      addIssue(
        "UNKNOWN_SPEND_TOKEN",
        "Spend permission references a token outside configured capital.",
        `spend.${aggregate.firstIndex}.token`
      );
    } else if (aggregate.amount > capital) {
      addIssue(
        "SPEND_EXCEEDS_CAPITAL",
        "Aggregate token/period spend limit exceeds configured capital.",
        `spend.${aggregate.firstIndex}.limitRaw`
      );
    }
  }

  const seenMinimumTokens = new Set<string>();
  for (const [index, minimum] of policy.minimumAmounts.entries()) {
    const token = lower(minimum.token);
    if (seenMinimumTokens.has(token)) {
      addIssue(
        "DUPLICATE_MINIMUM_TOKEN",
        "Each token may have only one minimum output amount.",
        `minimumAmounts.${index}.token`
      );
    }
    seenMinimumTokens.add(token);
    const capital = capitalByToken.get(token);
    if (capital === undefined) {
      addIssue(
        "UNKNOWN_MINIMUM_TOKEN",
        "Minimum output references a token outside configured capital.",
        `minimumAmounts.${index}.token`
      );
    } else if (BigInt(minimum.amountRaw) > capital) {
      addIssue(
        "MINIMUM_AMOUNT_EXCEEDS_CAPITAL",
        "Minimum output amount exceeds configured capital.",
        `minimumAmounts.${index}.amountRaw`
      );
    }
  }

  const seenCalls = new Set<string>();
  for (const [index, call] of policy.calls.entries()) {
    const key = manifestKey(policy.chain.chainId, call.to, call.selector);
    if (seenCalls.has(key)) {
      addIssue(
        "DUPLICATE_CALL_PERMISSION",
        "Duplicate contract/function permission.",
        `calls.${index}`
      );
    }
    seenCalls.add(key);

    const reviewed = manifestByPermission.get(key);
    let bindingMatches = reviewed !== undefined;
    if (reviewed === undefined || reviewed.signature !== call.signature) {
      addIssue(
        "UNREVIEWED_CALL_PERMISSION",
        "Contract, chain, selector, and signature must match a reviewed manifest entry.",
        `calls.${index}`
      );
      bindingMatches = false;
    } else {
      if (reviewed.contractLabel !== call.contractLabel) {
        addIssue(
          "CONTRACT_LABEL_MISMATCH",
          "Displayed contract label does not match the reviewed manifest.",
          `calls.${index}.contractLabel`
        );
        bindingMatches = false;
      }
      if (reviewed.operationKind !== call.operationKind) {
        addIssue(
          "OPERATION_KIND_MISMATCH",
          "Operation kind does not match the reviewed manifest.",
          `calls.${index}.operationKind`
        );
        bindingMatches = false;
      }
      if (!identitiesEqual(reviewed.expectedIdentity, call.expectedIdentity)) {
        const code =
          reviewed.expectedIdentity.kind === "code_hash" &&
          call.expectedIdentity.kind === "code_hash"
            ? "CONTRACT_CODE_HASH_MISMATCH"
            : "CONTRACT_IMPLEMENTATION_MISMATCH";
        addIssue(
          code,
          "Expected deployed contract identity does not match the reviewed manifest.",
          `calls.${index}.expectedIdentity`
        );
        bindingMatches = false;
      }
      if (reviewed.operationKind !== "direct" || reviewed.safeDirectOperation !== true) {
        addIssue(
          "OPERATION_NOT_APPROVED",
          "Only positively reviewed direct operations may be activated.",
          `calls.${index}.signature`
        );
        bindingMatches = false;
      }
    }

    const dangerousName = dangerousOperationName(call.signature);
    if (
      (dangerousName !== undefined || call.operationKind === "dispatcher") &&
      !(
        bindingMatches &&
        reviewed?.operationKind === "direct" &&
        reviewed.safeDirectOperation === true
      )
    ) {
      addIssue(
        dangerousName === "multicall"
          ? "BROAD_MULTICALL_NOT_ALLOWED"
          : "DANGEROUS_DISPATCHER_NOT_ALLOWED",
        "Dispatcher, token-authority, sweep, refund, and self-permit operations are denied unless an exact manifest entry marks a safe direct operation.",
        `calls.${index}.signature`
      );
    }
  }

  if (lower(policy.wallet) !== lower(expectedRuntime.wallet)) {
    addIssue("WALLET_MISMATCH", "Execution wallet differs from the frozen preview.", "wallet");
  }
  if (lower(policy.recipient) !== lower(expectedRuntime.recipient)) {
    addIssue(
      "RECIPIENT_MISMATCH",
      "Execution recipient differs from the frozen preview.",
      "recipient"
    );
  }
  if (policy.tokenId !== expectedRuntime.tokenId) {
    addIssue("TOKEN_ID_MISMATCH", "Position token ID differs from the frozen preview.", "tokenId");
  }
  if (
    policy.tickRange.lower !== expectedRuntime.tickRange.lower ||
    policy.tickRange.upper !== expectedRuntime.tickRange.upper
  ) {
    addIssue("TICK_RANGE_MISMATCH", "Tick range differs from the frozen preview.", "tickRange");
  }
  if (
    minimumAmountsKey(policy.minimumAmounts) !== minimumAmountsKey(expectedRuntime.minimumAmounts)
  ) {
    addIssue(
      "MINIMUM_AMOUNTS_MISMATCH",
      "Minimum output amounts differ from the frozen preview.",
      "minimumAmounts"
    );
  }
  if (
    policy.deadlineSeconds !== expectedRuntime.deadlineSeconds ||
    policy.transactionDeadline !== expectedRuntime.transactionDeadline
  ) {
    addIssue(
      "DEADLINE_MISMATCH",
      "Execution deadline differs from the frozen preview.",
      "transactionDeadline"
    );
  }
  if (policy.maxExecutionsPerDay !== expectedRuntime.maxExecutionsPerDay) {
    addIssue(
      "MAX_EXECUTIONS_MISMATCH",
      "Maximum execution count differs from the frozen preview.",
      "maxExecutionsPerDay"
    );
  }

  const transactionDeadlineMs = policy.transactionDeadline * 1_000;
  if (
    transactionDeadlineMs <= nowMs ||
    transactionDeadlineMs > nowMs + policy.deadlineSeconds * 1_000 ||
    transactionDeadlineMs > quoteValidUntilMs ||
    policy.transactionDeadline > policy.expiry
  ) {
    addIssue(
      "TRANSACTION_DEADLINE_INVALID",
      "Transaction deadline must be future, bounded by the configured window, quote, and session expiry.",
      "transactionDeadline"
    );
  }

  if (
    context.expectedPolicyHash !== undefined &&
    lower(context.expectedPolicyHash) !== lower(policyHash)
  ) {
    addIssue(
      "POLICY_HASH_MISMATCH",
      "Policy hash differs from the wallet-confirmed preview.",
      "policyHash"
    );
  }

  return { issues, policy, policyHash, valid: issues.length === 0 };
}
