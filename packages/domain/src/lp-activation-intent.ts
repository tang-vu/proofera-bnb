import { keccak256, stringToHex, type Hex } from "viem";
import { z } from "zod";

import { PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION } from "./pancake-v3-liquidity-quote";

export const LP_ACTIVATION_INTENT_SCHEMA_VERSION = 1 as const;
export const LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION = 3 as const;
export const LP_ACTIVATION_QUOTE_ID_DOMAIN = "ProofEra:lp-quote:v3" as const;
export const LP_ACTIVATION_CONTEXT_ID_DOMAIN = "ProofEra:lp-context:v3" as const;

export const PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER =
  "0x427bf5b37357632377ecbec9de3626c71a5396c1" as const;
export const PANCAKE_V3_BSC_TESTNET_FACTORY = "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865" as const;
export const PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE =
  "https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscTestnet.json" as const;

const UINT256_MAX = (1n << 256n) - 1n;
const UINT160_MAX = (1n << 160n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const PANCAKE_V3_MIN_TICK = -887_272;
const PANCAKE_V3_MAX_TICK = 887_272;
const MAX_SLIPPAGE_BPS = 100;
const MIN_SESSION_DURATION_SECONDS = 5 * 60;
const MAX_SESSION_DURATION_SECONDS = 24 * 60 * 60;
const MIN_TX_DEADLINE_SECONDS = 30;
const MAX_TX_DEADLINE_SECONDS = 30 * 60;
const MAX_EXECUTIONS_PER_DAY = 144;
const MAX_CONTEXT_AGE_SECONDS = 120;
const MAX_CONTEXT_TTL_SECONDS = 120;
const MAX_BLOCK_AGE_SECONDS = 120;
const MAX_AUTHORIZATION_AGE_SECONDS = 120;
const MAX_QUOTE_AGE_SECONDS = 120;
const MAX_QUOTE_TTL_SECONDS = 60;

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 20-byte EVM address.")
  .transform((value) => value.toLowerCase())
  .refine((value) => value !== ZERO_ADDRESS, "The zero address is not allowed.");

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hexadecimal value.")
  .transform((value) => value.toLowerCase());

const nonZeroBytes32Schema = bytes32Schema.refine(
  (value) => value !== ZERO_BYTES32,
  "The zero bytes32 value is not allowed."
);

const boundedDecimalInputSchema = z.string().min(1).max(78);
const safeIntegerSchema = z.number().int().safe();
const utcSchema = z.iso.datetime({ offset: true });
const httpsUrlSchema = z
  .string()
  .max(2_048)
  .url({ protocol: /^https$/ });

const blockReferenceShape = {
  blockHash: nonZeroBytes32Schema,
  blockNumber: boundedDecimalInputSchema
} as const;

const tokenReferenceSchema = z.strictObject({
  address: addressSchema,
  decimals: z.number().int().min(0).max(255)
});

const codeIdentitySchema = z.strictObject({
  address: addressSchema,
  codeHash: nonZeroBytes32Schema
});

const reviewedTokenReferenceSchema = z.strictObject({
  address: addressSchema,
  codeHash: nonZeroBytes32Schema,
  decimals: z.number().int().min(0).max(255)
});

export const lpActivationIntentSchema = z.strictObject({
  schemaVersion: z.literal(LP_ACTIVATION_INTENT_SCHEMA_VERSION),
  chainId: z.literal(97),
  wallet: addressSchema,
  recipient: addressSchema,
  poolAddress: addressSchema,
  positionTokenId: boundedDecimalInputSchema,
  desiredTick: z.strictObject({
    lower: safeIntegerSchema,
    upper: safeIntegerSchema
  }),
  capital: z.strictObject({
    token0Raw: boundedDecimalInputSchema,
    token1Raw: boundedDecimalInputSchema
  }),
  maxSlippageBps: safeIntegerSchema,
  sessionDurationSeconds: safeIntegerSchema,
  txDeadlineSeconds: safeIntegerSchema,
  maxExecutionsPerDay: safeIntegerSchema
});

export type LpActivationIntent = z.infer<typeof lpActivationIntentSchema>;

export const lpActivationServerContextSchema = z.strictObject({
  schemaVersion: z.literal(LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION),
  contextId: nonZeroBytes32Schema,
  quoteId: nonZeroBytes32Schema,
  chainId: z.literal(97),
  environment: z.literal("testnet"),
  issuedAt: utcSchema,
  expiresAt: utcSchema,
  authenticatedWallet: addressSchema,
  intentBinding: lpActivationIntentSchema,
  reviewedDeployment: z.strictObject({
    protocol: z.literal("PancakeSwap V3"),
    reviewId: nonZeroBytes32Schema,
    reviewedAt: utcSchema,
    sourceUrl: httpsUrlSchema,
    fee: z.number().int().min(1).max(1_000_000),
    tickSpacing: safeIntegerSchema,
    token0: reviewedTokenReferenceSchema,
    token1: reviewedTokenReferenceSchema,
    positionManager: codeIdentitySchema,
    factory: codeIdentitySchema,
    pool: codeIdentitySchema,
    poolDeployer: codeIdentitySchema,
    wrappedNative: codeIdentitySchema
  }),
  observedDeployment: z.strictObject({
    ...blockReferenceShape,
    positionManager: codeIdentitySchema,
    factory: codeIdentitySchema,
    pool: codeIdentitySchema,
    poolDeployer: codeIdentitySchema,
    token0: codeIdentitySchema,
    token1: codeIdentitySchema,
    wrappedNative: codeIdentitySchema
  }),
  position: z.strictObject({
    fee: z.number().int().min(1).max(1_000_000),
    managerAddress: addressSchema,
    ownerAddress: addressSchema,
    poolAddress: addressSchema,
    tickLower: safeIntegerSchema,
    tickUpper: safeIntegerSchema,
    token0Address: addressSchema,
    token1Address: addressSchema,
    tokenId: boundedDecimalInputSchema
  }),
  pool: z.strictObject({
    address: addressSchema,
    currentTick: safeIntegerSchema,
    factoryAddress: addressSchema,
    fee: z.number().int().min(1).max(1_000_000),
    sqrtPriceX96: boundedDecimalInputSchema,
    tickSpacing: safeIntegerSchema,
    token0: tokenReferenceSchema,
    token1: tokenReferenceSchema
  }),
  factoryRelation: z.strictObject({
    factoryAddress: addressSchema,
    fee: z.number().int().min(1).max(1_000_000),
    poolAddress: addressSchema,
    tickSpacing: safeIntegerSchema,
    token0Address: addressSchema,
    token1Address: addressSchema
  }),
  authorization: z.strictObject({
    ...blockReferenceShape,
    authorizationKind: z.enum(["owner", "token_controller", "operator_controller"]),
    controllerAddress: addressSchema,
    controllerAuthorized: z.boolean(),
    observedAt: utcSchema,
    ownerAddress: addressSchema,
    positionTokenId: boundedDecimalInputSchema,
    source: z.literal("onchain_owner_and_controller_read")
  }),
  block: z.strictObject({
    hash: nonZeroBytes32Schema,
    number: boundedDecimalInputSchema,
    timestamp: utcSchema
  }),
  quote: z.strictObject({
    ...blockReferenceShape,
    capitalToken0Raw: boundedDecimalInputSchema,
    capitalToken1Raw: boundedDecimalInputSchema,
    calculation: z.strictObject({
      currentTick: safeIntegerSchema,
      exactLiquidityMatchRequired: z.literal(true),
      methodologyVersion: z.literal(PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION),
      preliminaryLiquidityRaw: boundedDecimalInputSchema,
      recomputedFromCalldataAtObservedPriceRaw: boundedDecimalInputSchema,
      sqrtPriceX96: boundedDecimalInputSchema,
      tickLower: safeIntegerSchema,
      tickUpper: safeIntegerSchema
    }),
    maxSlippageBps: safeIntegerSchema,
    observedAt: utcSchema,
    poolAddress: addressSchema,
    sourceKind: z.literal("pancake_v3_block_pinned_math"),
    sourceUrl: httpsUrlSchema,
    token0: z.strictObject({
      address: addressSchema,
      capitalNotSubmittedRaw: boundedDecimalInputSchema,
      desiredMaximumRaw: boundedDecimalInputSchema,
      minimumAmountRaw: boundedDecimalInputSchema
    }),
    token1: z.strictObject({
      address: addressSchema,
      capitalNotSubmittedRaw: boundedDecimalInputSchema,
      desiredMaximumRaw: boundedDecimalInputSchema,
      minimumAmountRaw: boundedDecimalInputSchema
    }),
    validUntil: utcSchema
  })
});

export type LpActivationServerContext = z.infer<typeof lpActivationServerContextSchema>;
export type LpActivationServerContextPayload = Omit<
  LpActivationServerContext,
  "contextId" | "quoteId"
>;

export function lpActivationContextPayloadForId(
  context: LpActivationServerContext
): LpActivationServerContextPayload {
  const payload: Record<string, unknown> = { ...context };
  delete payload.contextId;
  delete payload.quoteId;
  return payload as LpActivationServerContextPayload;
}

function recursivelySortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => recursivelySortJsonKeys(entry));
  if (value === null || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = recursivelySortJsonKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function hashLpBinding(domain: string, payload: unknown): Hex {
  return keccak256(
    stringToHex(`${domain}\u0000${JSON.stringify(recursivelySortJsonKeys(payload))}`)
  );
}

export function deriveLpActivationContextIds(
  intent: LpActivationIntent,
  context: LpActivationServerContextPayload,
  binding: Readonly<{ contextNonce: string; quoteNonce: string }>
): Readonly<{ contextId: Hex; quoteId: Hex }> {
  const contextNonce = nonZeroBytes32Schema.parse(binding.contextNonce);
  const quoteNonce = nonZeroBytes32Schema.parse(binding.quoteNonce);
  const quoteId = hashLpBinding(LP_ACTIVATION_QUOTE_ID_DOMAIN, {
    intent,
    context,
    nonce: quoteNonce
  });
  const contextId = hashLpBinding(LP_ACTIVATION_CONTEXT_ID_DOMAIN, {
    intent,
    context,
    quoteId,
    nonce: contextNonce
  });
  return Object.freeze({ contextId, quoteId });
}

export type LpActivationIntentIssueCode =
  | "INTENT_FIELD_NOT_ALLOWED"
  | "INTENT_SCHEMA_INVALID"
  | "SERVER_CONTEXT_SCHEMA_INVALID"
  | "RESOLVER_OPTIONS_INVALID"
  | "CLOCK_INVALID"
  | "WRONG_CHAIN"
  | "WALLET_RECIPIENT_MISMATCH"
  | "AUTHENTICATED_WALLET_MISMATCH"
  | "INTENT_BINDING_MISMATCH"
  | "POOL_BINDING_MISMATCH"
  | "POSITION_TOKEN_ID_MISMATCH"
  | "POSITION_TOKEN_ID_INVALID"
  | "CAPITAL_AMOUNT_INVALID"
  | "SLIPPAGE_OUT_OF_BOUNDS"
  | "SESSION_DURATION_OUT_OF_BOUNDS"
  | "TX_DEADLINE_OUT_OF_BOUNDS"
  | "TX_DEADLINE_EXCEEDS_SESSION"
  | "EXECUTION_LIMIT_OUT_OF_BOUNDS"
  | "TICK_OUT_OF_BOUNDS"
  | "TICK_ORDER_INVALID"
  | "TICK_SPACING_INVALID"
  | "DESIRED_TICK_NOT_ALIGNED"
  | "OFFICIAL_MANAGER_MISMATCH"
  | "OFFICIAL_FACTORY_MISMATCH"
  | "DEPLOYMENT_ADDRESS_COLLISION"
  | "CONTRACT_IDENTITY_MISMATCH"
  | "POSITION_RELATION_MISMATCH"
  | "POOL_RELATION_MISMATCH"
  | "TOKEN_RELATION_MISMATCH"
  | "DUPLICATE_POOL_TOKEN"
  | "AUTHORIZATION_EVIDENCE_MISMATCH"
  | "CONTROLLER_NOT_AUTHORIZED"
  | "CONTEXT_ID_MISMATCH"
  | "CONTEXT_INTEGRITY_MISMATCH"
  | "QUOTE_ID_MISMATCH"
  | "CONTEXT_REPLAYED"
  | "QUOTE_REPLAYED"
  | "CONTEXT_FROM_FUTURE"
  | "CONTEXT_STALE"
  | "CONTEXT_EXPIRED"
  | "CONTEXT_WINDOW_INVALID"
  | "BLOCK_FROM_FUTURE"
  | "BLOCK_STALE"
  | "BLOCK_IDENTITY_INVALID"
  | "EVIDENCE_BLOCK_MISMATCH"
  | "AUTHORIZATION_FROM_FUTURE"
  | "AUTHORIZATION_STALE"
  | "REVIEW_FROM_FUTURE"
  | "REVIEW_SOURCE_MISMATCH"
  | "EVIDENCE_TIME_ORDER_INVALID"
  | "QUOTE_FROM_FUTURE"
  | "QUOTE_TOO_OLD"
  | "QUOTE_EXPIRED"
  | "QUOTE_WINDOW_INVALID"
  | "QUOTE_TTL_TOO_LONG"
  | "QUOTE_BLOCK_MISMATCH"
  | "QUOTE_BINDING_MISMATCH"
  | "QUOTE_CALCULATION_MISMATCH"
  | "QUOTE_SOURCE_MISMATCH"
  | "POOL_PRICE_INVALID"
  | "LIQUIDITY_AMOUNT_INVALID"
  | "CALLDATA_AMOUNT_INVALID"
  | "CALLDATA_AMOUNT_RELATION_INVALID"
  | "MINIMUM_TOKEN_MISMATCH"
  | "MINIMUM_AMOUNT_INVALID"
  | "MINIMUM_EXCEEDS_CALLDATA"
  | "MINIMUM_EXCEEDS_CAPITAL"
  | "SESSION_QUOTE_RELATION_INVALID"
  | "DEADLINE_QUOTE_RELATION_INVALID";

export interface LpActivationIntentIssue {
  readonly code: LpActivationIntentIssueCode;
  readonly message: string;
  readonly path: string;
}

export interface ResolveLpActivationIntentOptions {
  readonly now: () => Date;
  readonly expectedContextId: string;
  readonly contextNonce: string;
  readonly quoteNonce: string;
  readonly consumedContextIds: readonly string[];
  readonly consumedQuoteIds: readonly string[];
}

type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

const USER_CONTROLLED_FIELDS = [
  "userIntent.schemaVersion",
  "userIntent.chainId",
  "userIntent.wallet",
  "userIntent.recipient",
  "userIntent.poolAddress",
  "userIntent.positionTokenId",
  "userIntent.desiredTick.lower",
  "userIntent.desiredTick.upper",
  "userIntent.capital.token0Raw",
  "userIntent.capital.token1Raw",
  "userIntent.maxSlippageBps",
  "userIntent.sessionDurationSeconds",
  "userIntent.txDeadlineSeconds",
  "userIntent.maxExecutionsPerDay"
] as const;

const SERVER_OWNED_FIELDS = [
  "trustedEvidence.contextId",
  "trustedEvidence.quoteId",
  "trustedEvidence.authenticatedWallet",
  "trustedEvidence.intentBinding",
  "trustedEvidence.reviewedDeployment",
  "trustedEvidence.observedDeployment",
  "trustedEvidence.position",
  "trustedEvidence.pool",
  "trustedEvidence.factoryRelation",
  "trustedEvidence.authorization",
  "trustedEvidence.block",
  "trustedEvidence.quote",
  "trustedEvidence.issuedAt",
  "trustedEvidence.expiresAt"
] as const;

const DERIVED_FIELDS = [
  "derived.resolvedAt",
  "derived.sessionExpiresAtUnixSeconds",
  "derived.sessionExpiresAtUtc",
  "derived.deadlineAtUnixSeconds",
  "derived.deadlineAtUtc"
] as const;

export interface ResolvedLpActivationIntentData {
  readonly schemaVersion: 1;
  readonly userIntent: DeepReadonly<LpActivationIntent>;
  readonly trustedEvidence: DeepReadonly<LpActivationServerContext>;
  readonly derived: {
    readonly resolvedAt: string;
    readonly sessionExpiresAtUnixSeconds: number;
    readonly sessionExpiresAtUtc: string;
    readonly deadlineAtUnixSeconds: number;
    readonly deadlineAtUtc: string;
  };
  readonly fieldProvenance: {
    readonly userControlled: readonly string[];
    readonly serverOwned: readonly string[];
    readonly derived: readonly string[];
  };
  readonly scopeBoundary: "Resolved data only. No policy, authority, submission, or execution has been created.";
}

export type ResolveLpActivationIntentResult =
  | {
      readonly status: "ready";
      readonly data: DeepReadonly<ResolvedLpActivationIntentData>;
      readonly issues: readonly LpActivationIntentIssue[];
    }
  | {
      readonly status: "blocked";
      readonly data: null;
      readonly issues: readonly LpActivationIntentIssue[];
    };

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function blocked(issues: readonly LpActivationIntentIssue[]): ResolveLpActivationIntentResult {
  return deepFreeze({ status: "blocked" as const, data: null, issues: [...issues] });
}

function zodPath(path: readonly PropertyKey[]): string {
  return path
    .map((segment) => (typeof segment === "symbol" ? (segment.description ?? "symbol") : segment))
    .join(".");
}

function schemaIssues(
  error: z.ZodError,
  target: "intent" | "serverContext"
): LpActivationIntentIssue[] {
  const issues: LpActivationIntentIssue[] = [];
  for (const issue of error.issues) {
    if (target === "intent" && issue.code === "unrecognized_keys") {
      const parent = zodPath(issue.path);
      for (const key of [...issue.keys].sort()) {
        issues.push({
          code: "INTENT_FIELD_NOT_ALLOWED",
          message: "This field is server-owned and cannot be supplied by user intent.",
          path: parent.length === 0 ? key : `${parent}.${key}`
        });
      }
      continue;
    }
    const path = zodPath(issue.path);
    issues.push({
      code: target === "intent" ? "INTENT_SCHEMA_INVALID" : "SERVER_CONTEXT_SCHEMA_INVALID",
      message: issue.message,
      path: path.length === 0 ? target : path
    });
  }
  return issues;
}

function canonicalUint256(value: string, allowZero: boolean): bigint | null {
  const pattern = allowZero ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/;
  if (!pattern.test(value) || value.length > 78) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= UINT256_MAX ? parsed : null;
  } catch {
    return null;
  }
}

function sameBlock(
  number: string,
  hash: string,
  block: LpActivationServerContext["block"]
): boolean {
  return number === block.number && hash === block.hash;
}

function sameIdentity(
  left: { readonly address: string; readonly codeHash: string },
  right: { readonly address: string; readonly codeHash: string }
): boolean {
  return left.address === right.address && left.codeHash === right.codeHash;
}

function sameIntent(left: LpActivationIntent, right: LpActivationIntent): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.chainId === right.chainId &&
    left.wallet === right.wallet &&
    left.recipient === right.recipient &&
    left.poolAddress === right.poolAddress &&
    left.positionTokenId === right.positionTokenId &&
    left.desiredTick.lower === right.desiredTick.lower &&
    left.desiredTick.upper === right.desiredTick.upper &&
    left.capital.token0Raw === right.capital.token0Raw &&
    left.capital.token1Raw === right.capital.token1Raw &&
    left.maxSlippageBps === right.maxSlippageBps &&
    left.sessionDurationSeconds === right.sessionDurationSeconds &&
    left.txDeadlineSeconds === right.txDeadlineSeconds &&
    left.maxExecutionsPerDay === right.maxExecutionsPerDay
  );
}

function addUniqueIssue(
  issues: LpActivationIntentIssue[],
  seen: Set<string>,
  issue: LpActivationIntentIssue
): void {
  const key = `${issue.code}:${issue.path}`;
  if (!seen.has(key)) {
    seen.add(key);
    issues.push(issue);
  }
}

export function resolveLpActivationIntent(
  unparsedIntent: unknown,
  unparsedServerContext: unknown,
  options: ResolveLpActivationIntentOptions
): ResolveLpActivationIntentResult {
  const parsedIntent = lpActivationIntentSchema.safeParse(unparsedIntent);
  const parsedContext = lpActivationServerContextSchema.safeParse(unparsedServerContext);
  if (!parsedIntent.success || !parsedContext.success) {
    return blocked([
      ...(parsedIntent.success ? [] : schemaIssues(parsedIntent.error, "intent")),
      ...(parsedContext.success ? [] : schemaIssues(parsedContext.error, "serverContext"))
    ]);
  }

  const intent = parsedIntent.data;
  const context = parsedContext.data;
  const issues: LpActivationIntentIssue[] = [];
  const seenIssues = new Set<string>();
  const addIssue = (code: LpActivationIntentIssueCode, path: string, message: string): void =>
    addUniqueIssue(issues, seenIssues, { code, message, path });

  const expectedContextId = bytes32Schema.safeParse(options.expectedContextId);
  const contextNonce = nonZeroBytes32Schema.safeParse(options.contextNonce);
  const quoteNonce = nonZeroBytes32Schema.safeParse(options.quoteNonce);
  const consumedContextIds = z
    .array(bytes32Schema)
    .max(10_000)
    .safeParse(options.consumedContextIds);
  const consumedQuoteIds = z.array(bytes32Schema).max(10_000).safeParse(options.consumedQuoteIds);
  if (!expectedContextId.success) {
    addIssue(
      "RESOLVER_OPTIONS_INVALID",
      "resolver.expectedContextId",
      "The expected one-time context ID is invalid."
    );
  }
  if (!contextNonce.success || !quoteNonce.success) {
    addIssue(
      "RESOLVER_OPTIONS_INVALID",
      "resolver.idBinding",
      "The server-held context and quote nonces must be nonzero bytes32 values."
    );
  }
  if (!consumedContextIds.success) {
    addIssue(
      "RESOLVER_OPTIONS_INVALID",
      "resolver.consumedContextIds",
      "Consumed context IDs must be a bounded list of bytes32 values."
    );
  }
  if (!consumedQuoteIds.success) {
    addIssue(
      "RESOLVER_OPTIONS_INVALID",
      "resolver.consumedQuoteIds",
      "Consumed quote IDs must be a bounded list of bytes32 values."
    );
  }

  let now: Date;
  try {
    now = options.now();
  } catch {
    return blocked([
      {
        code: "CLOCK_INVALID",
        message: "The injected server clock failed.",
        path: "resolver.now"
      }
    ]);
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return blocked([
      {
        code: "CLOCK_INVALID",
        message: "The injected server clock returned an invalid time.",
        path: "resolver.now"
      }
    ]);
  }
  const nowMs = now.getTime();

  if (expectedContextId.success && context.contextId !== expectedContextId.data) {
    addIssue(
      "CONTEXT_ID_MISMATCH",
      "serverContext.contextId",
      "The server evidence context does not match the expected one-time context ID."
    );
  }
  const claimedContextId = context.contextId;
  const claimedQuoteId = context.quoteId;
  const contextPayload = lpActivationContextPayloadForId(context);
  if (contextNonce.success && quoteNonce.success) {
    const derivedIds = deriveLpActivationContextIds(context.intentBinding, contextPayload, {
      contextNonce: contextNonce.data,
      quoteNonce: quoteNonce.data
    });
    if (claimedQuoteId !== derivedIds.quoteId) {
      addIssue(
        "QUOTE_ID_MISMATCH",
        "serverContext.quoteId",
        "The quote identifier does not authenticate the complete server context."
      );
    }
    if (claimedContextId !== derivedIds.contextId) {
      addIssue(
        "CONTEXT_INTEGRITY_MISMATCH",
        "serverContext.contextId",
        "The context identifier does not authenticate the complete server context."
      );
    }
  }
  if (consumedContextIds.success && consumedContextIds.data.includes(context.contextId)) {
    addIssue(
      "CONTEXT_REPLAYED",
      "serverContext.contextId",
      "This server evidence context has already been consumed."
    );
  }
  if (consumedQuoteIds.success && consumedQuoteIds.data.includes(context.quoteId)) {
    addIssue(
      "QUOTE_REPLAYED",
      "serverContext.quoteId",
      "This quote evidence identifier has already been consumed."
    );
  }

  if (intent.chainId !== 97 || context.chainId !== 97 || context.environment !== "testnet") {
    addIssue("WRONG_CHAIN", "chainId", "Only BSC testnet chain 97 is accepted.");
  }
  if (intent.wallet !== intent.recipient) {
    addIssue(
      "WALLET_RECIPIENT_MISMATCH",
      "recipient",
      "The recipient must equal the authenticated wallet requested by the user."
    );
  }
  if (intent.wallet !== context.authenticatedWallet) {
    addIssue(
      "AUTHENTICATED_WALLET_MISMATCH",
      "wallet",
      "The user wallet does not match server authentication evidence."
    );
  }
  if (!sameIntent(intent, context.intentBinding)) {
    addIssue(
      "INTENT_BINDING_MISMATCH",
      "serverContext.intentBinding",
      "Every execution-relevant intent field must exactly match the server-bound intent."
    );
  }
  if (intent.poolAddress !== context.reviewedDeployment.pool.address) {
    addIssue(
      "POOL_BINDING_MISMATCH",
      "poolAddress",
      "The requested pool does not match the reviewed server-owned pool."
    );
  }
  if (intent.positionTokenId !== context.position.tokenId) {
    addIssue(
      "POSITION_TOKEN_ID_MISMATCH",
      "positionTokenId",
      "The requested position token ID does not match pinned position evidence."
    );
  }

  const positionTokenId = canonicalUint256(intent.positionTokenId, true);
  if (positionTokenId === null) {
    addIssue(
      "POSITION_TOKEN_ID_INVALID",
      "positionTokenId",
      "Position token ID must be a canonical uint256 decimal string."
    );
  }
  const capital0 = canonicalUint256(intent.capital.token0Raw, false);
  const capital1 = canonicalUint256(intent.capital.token1Raw, false);
  if (capital0 === null) {
    addIssue(
      "CAPITAL_AMOUNT_INVALID",
      "capital.token0Raw",
      "Token 0 capital must be a positive canonical uint256 decimal string."
    );
  }
  if (capital1 === null) {
    addIssue(
      "CAPITAL_AMOUNT_INVALID",
      "capital.token1Raw",
      "Token 1 capital must be a positive canonical uint256 decimal string."
    );
  }

  if (intent.maxSlippageBps < 1 || intent.maxSlippageBps > MAX_SLIPPAGE_BPS) {
    addIssue(
      "SLIPPAGE_OUT_OF_BOUNDS",
      "maxSlippageBps",
      `Maximum slippage must be between 1 and ${MAX_SLIPPAGE_BPS} basis points.`
    );
  }
  if (
    intent.sessionDurationSeconds < MIN_SESSION_DURATION_SECONDS ||
    intent.sessionDurationSeconds > MAX_SESSION_DURATION_SECONDS
  ) {
    addIssue(
      "SESSION_DURATION_OUT_OF_BOUNDS",
      "sessionDurationSeconds",
      `Session duration must be between ${MIN_SESSION_DURATION_SECONDS} and ${MAX_SESSION_DURATION_SECONDS} seconds.`
    );
  }
  if (
    intent.txDeadlineSeconds < MIN_TX_DEADLINE_SECONDS ||
    intent.txDeadlineSeconds > MAX_TX_DEADLINE_SECONDS
  ) {
    addIssue(
      "TX_DEADLINE_OUT_OF_BOUNDS",
      "txDeadlineSeconds",
      `Deadline must be between ${MIN_TX_DEADLINE_SECONDS} and ${MAX_TX_DEADLINE_SECONDS} seconds.`
    );
  }
  if (intent.txDeadlineSeconds > intent.sessionDurationSeconds) {
    addIssue(
      "TX_DEADLINE_EXCEEDS_SESSION",
      "txDeadlineSeconds",
      "The deadline cannot outlast the requested session."
    );
  }
  if (intent.maxExecutionsPerDay < 1 || intent.maxExecutionsPerDay > MAX_EXECUTIONS_PER_DAY) {
    addIssue(
      "EXECUTION_LIMIT_OUT_OF_BOUNDS",
      "maxExecutionsPerDay",
      `Maximum executions per day must be between 1 and ${MAX_EXECUTIONS_PER_DAY}.`
    );
  }

  const desiredTick = intent.desiredTick;
  if (
    desiredTick.lower < PANCAKE_V3_MIN_TICK ||
    desiredTick.lower > PANCAKE_V3_MAX_TICK ||
    desiredTick.upper < PANCAKE_V3_MIN_TICK ||
    desiredTick.upper > PANCAKE_V3_MAX_TICK
  ) {
    addIssue(
      "TICK_OUT_OF_BOUNDS",
      "desiredTick",
      `Desired ticks must stay within ${PANCAKE_V3_MIN_TICK} and ${PANCAKE_V3_MAX_TICK}.`
    );
  }
  if (desiredTick.lower >= desiredTick.upper) {
    addIssue(
      "TICK_ORDER_INVALID",
      "desiredTick",
      "Desired lower tick must be strictly below the upper tick."
    );
  }
  if (
    context.pool.tickSpacing <= 0 ||
    context.pool.tickSpacing > PANCAKE_V3_MAX_TICK ||
    context.factoryRelation.tickSpacing !== context.pool.tickSpacing
  ) {
    addIssue(
      "TICK_SPACING_INVALID",
      "serverContext.pool.tickSpacing",
      "Pool and factory tick spacing evidence must match and be positive."
    );
  } else if (
    desiredTick.lower % context.pool.tickSpacing !== 0 ||
    desiredTick.upper % context.pool.tickSpacing !== 0
  ) {
    addIssue(
      "DESIRED_TICK_NOT_ALIGNED",
      "desiredTick",
      "Desired ticks must be exact multiples of the pinned pool tick spacing."
    );
  }
  if (
    context.pool.currentTick < PANCAKE_V3_MIN_TICK ||
    context.pool.currentTick > PANCAKE_V3_MAX_TICK ||
    context.position.tickLower < PANCAKE_V3_MIN_TICK ||
    context.position.tickUpper > PANCAKE_V3_MAX_TICK ||
    context.position.tickLower >= context.position.tickUpper
  ) {
    addIssue(
      "TICK_OUT_OF_BOUNDS",
      "serverContext.position",
      "Pinned pool and position ticks must be ordered within Pancake V3 bounds."
    );
  }
  if (
    context.pool.tickSpacing > 0 &&
    (context.position.tickLower % context.pool.tickSpacing !== 0 ||
      context.position.tickUpper % context.pool.tickSpacing !== 0)
  ) {
    addIssue(
      "POSITION_RELATION_MISMATCH",
      "serverContext.position",
      "Pinned position ticks must align to the pinned pool tick spacing."
    );
  }

  const reviewed = context.reviewedDeployment;
  const observed = context.observedDeployment;
  if (reviewed.positionManager.address !== PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER) {
    addIssue(
      "OFFICIAL_MANAGER_MISMATCH",
      "serverContext.reviewedDeployment.positionManager.address",
      "The reviewed manager is not the official Pancake V3 BSC testnet deployment."
    );
  }
  if (reviewed.factory.address !== PANCAKE_V3_BSC_TESTNET_FACTORY) {
    addIssue(
      "OFFICIAL_FACTORY_MISMATCH",
      "serverContext.reviewedDeployment.factory.address",
      "The reviewed factory is not the official Pancake V3 BSC testnet deployment."
    );
  }
  if (
    new Set([
      reviewed.positionManager.address,
      reviewed.factory.address,
      reviewed.pool.address,
      reviewed.poolDeployer.address
    ]).size !== 4
  ) {
    addIssue(
      "DEPLOYMENT_ADDRESS_COLLISION",
      "serverContext.reviewedDeployment",
      "Manager, factory, pool, and pool deployer must be distinct contracts."
    );
  }
  for (const [name, expected, actual] of [
    ["positionManager", reviewed.positionManager, observed.positionManager],
    ["factory", reviewed.factory, observed.factory],
    ["pool", reviewed.pool, observed.pool],
    ["poolDeployer", reviewed.poolDeployer, observed.poolDeployer],
    ["wrappedNative", reviewed.wrappedNative, observed.wrappedNative],
    ["token0", reviewed.token0, observed.token0],
    ["token1", reviewed.token1, observed.token1]
  ] as const) {
    if (!sameIdentity(expected, actual)) {
      addIssue(
        "CONTRACT_IDENTITY_MISMATCH",
        `serverContext.observedDeployment.${name}`,
        `Observed ${name} address and code hash must exactly match reviewed identity.`
      );
    }
  }

  if (
    context.position.managerAddress !== reviewed.positionManager.address ||
    context.position.poolAddress !== reviewed.pool.address ||
    context.position.tokenId !== context.authorization.positionTokenId
  ) {
    addIssue(
      "POSITION_RELATION_MISMATCH",
      "serverContext.position",
      "Position evidence must bind the reviewed manager, pool, and authorization token ID."
    );
  }
  if (
    context.pool.address !== reviewed.pool.address ||
    context.pool.factoryAddress !== reviewed.factory.address ||
    context.factoryRelation.factoryAddress !== reviewed.factory.address ||
    context.factoryRelation.poolAddress !== reviewed.pool.address ||
    context.position.fee !== context.pool.fee ||
    context.factoryRelation.fee !== context.pool.fee ||
    reviewed.fee !== context.pool.fee ||
    reviewed.tickSpacing !== context.pool.tickSpacing
  ) {
    addIssue(
      "POOL_RELATION_MISMATCH",
      "serverContext.pool",
      "Pool, position, and factory relation evidence must bind the same reviewed pool and fee."
    );
  }

  const token0 = context.pool.token0.address;
  const token1 = context.pool.token1.address;
  if (token0 === token1) {
    addIssue(
      "DUPLICATE_POOL_TOKEN",
      "serverContext.pool",
      "Pool token 0 and token 1 must be distinct."
    );
  }
  if (
    reviewed.token0.address !== token0 ||
    reviewed.token1.address !== token1 ||
    reviewed.token0.decimals !== context.pool.token0.decimals ||
    reviewed.token1.decimals !== context.pool.token1.decimals ||
    context.position.token0Address !== token0 ||
    context.position.token1Address !== token1 ||
    context.factoryRelation.token0Address !== token0 ||
    context.factoryRelation.token1Address !== token1
  ) {
    addIssue(
      "TOKEN_RELATION_MISMATCH",
      "serverContext.position",
      "Position, pool, and factory evidence must preserve the exact token 0/token 1 order."
    );
  }

  const authorization = context.authorization;
  if (
    authorization.ownerAddress !== context.position.ownerAddress ||
    authorization.positionTokenId !== context.position.tokenId ||
    authorization.controllerAddress !== context.authenticatedWallet
  ) {
    addIssue(
      "AUTHORIZATION_EVIDENCE_MISMATCH",
      "serverContext.authorization",
      "Owner, controller, and position authorization evidence must match the authenticated request."
    );
  }
  if (
    !authorization.controllerAuthorized ||
    (authorization.authorizationKind === "owner" &&
      authorization.controllerAddress !== authorization.ownerAddress)
  ) {
    addIssue(
      "CONTROLLER_NOT_AUTHORIZED",
      "serverContext.authorization.controllerAuthorized",
      "Pinned evidence does not establish the authenticated wallet as an authorized controller."
    );
  }

  const contextIssuedMs = Date.parse(context.issuedAt);
  const contextExpiresMs = Date.parse(context.expiresAt);
  const blockMs = Date.parse(context.block.timestamp);
  const authorizationMs = Date.parse(authorization.observedAt);
  const reviewedMs = Date.parse(reviewed.reviewedAt);
  const quoteObservedMs = Date.parse(context.quote.observedAt);
  const quoteValidUntilMs = Date.parse(context.quote.validUntil);

  if (contextIssuedMs > nowMs) {
    addIssue(
      "CONTEXT_FROM_FUTURE",
      "serverContext.issuedAt",
      "Server context issue time cannot be after the injected clock."
    );
  }
  if (nowMs - contextIssuedMs > MAX_CONTEXT_AGE_SECONDS * 1_000) {
    addIssue(
      "CONTEXT_STALE",
      "serverContext.issuedAt",
      `Server context is older than ${MAX_CONTEXT_AGE_SECONDS} seconds.`
    );
  }
  if (contextExpiresMs <= nowMs) {
    addIssue(
      "CONTEXT_EXPIRED",
      "serverContext.expiresAt",
      "Server context expired before resolution."
    );
  }
  if (
    contextExpiresMs <= contextIssuedMs ||
    contextExpiresMs - contextIssuedMs > MAX_CONTEXT_TTL_SECONDS * 1_000
  ) {
    addIssue(
      "CONTEXT_WINDOW_INVALID",
      "serverContext.expiresAt",
      `Server context lifetime must be positive and no longer than ${MAX_CONTEXT_TTL_SECONDS} seconds.`
    );
  }
  if (blockMs > nowMs) {
    addIssue(
      "BLOCK_FROM_FUTURE",
      "serverContext.block.timestamp",
      "Pinned block time cannot be after the injected clock."
    );
  }
  if (canonicalUint256(context.block.number, true) === null) {
    addIssue(
      "BLOCK_IDENTITY_INVALID",
      "serverContext.block.number",
      "Pinned block number must be a canonical uint256 decimal string."
    );
  }
  if (nowMs - blockMs > MAX_BLOCK_AGE_SECONDS * 1_000) {
    addIssue(
      "BLOCK_STALE",
      "serverContext.block.timestamp",
      `Pinned block is older than ${MAX_BLOCK_AGE_SECONDS} seconds.`
    );
  }
  if (
    !sameBlock(observed.blockNumber, observed.blockHash, context.block) ||
    !sameBlock(authorization.blockNumber, authorization.blockHash, context.block)
  ) {
    addIssue(
      "EVIDENCE_BLOCK_MISMATCH",
      "serverContext.block",
      "Contract and authorization evidence must share the exact pinned block number and hash."
    );
  }
  if (authorizationMs > nowMs) {
    addIssue(
      "AUTHORIZATION_FROM_FUTURE",
      "serverContext.authorization.observedAt",
      "Authorization evidence cannot postdate the injected clock."
    );
  }
  if (nowMs - authorizationMs > MAX_AUTHORIZATION_AGE_SECONDS * 1_000) {
    addIssue(
      "AUTHORIZATION_STALE",
      "serverContext.authorization.observedAt",
      `Authorization evidence is older than ${MAX_AUTHORIZATION_AGE_SECONDS} seconds.`
    );
  }
  if (reviewedMs > nowMs) {
    addIssue(
      "REVIEW_FROM_FUTURE",
      "serverContext.reviewedDeployment.reviewedAt",
      "Deployment review time cannot postdate the injected clock."
    );
  }
  if (reviewed.sourceUrl !== PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE) {
    addIssue(
      "REVIEW_SOURCE_MISMATCH",
      "serverContext.reviewedDeployment.sourceUrl",
      "The deployment review must cite the official Pancake V3 BSC testnet manifest."
    );
  }
  if (
    authorizationMs < blockMs ||
    quoteObservedMs < blockMs ||
    contextIssuedMs < authorizationMs ||
    contextIssuedMs < quoteObservedMs
  ) {
    addIssue(
      "EVIDENCE_TIME_ORDER_INVALID",
      "serverContext.issuedAt",
      "Block, authorization, quote, and context timestamps are not causally ordered."
    );
  }

  if (quoteObservedMs > nowMs) {
    addIssue(
      "QUOTE_FROM_FUTURE",
      "serverContext.quote.observedAt",
      "Quote observation cannot postdate the injected clock."
    );
  }
  if (nowMs - quoteObservedMs > MAX_QUOTE_AGE_SECONDS * 1_000) {
    addIssue(
      "QUOTE_TOO_OLD",
      "serverContext.quote.observedAt",
      `Quote evidence is older than ${MAX_QUOTE_AGE_SECONDS} seconds.`
    );
  }
  if (quoteValidUntilMs <= nowMs) {
    addIssue(
      "QUOTE_EXPIRED",
      "serverContext.quote.validUntil",
      "Quote evidence expired before resolution."
    );
  }
  if (quoteValidUntilMs <= quoteObservedMs) {
    addIssue(
      "QUOTE_WINDOW_INVALID",
      "serverContext.quote.validUntil",
      "Quote validity must end after its observation time."
    );
  }
  if (quoteValidUntilMs - quoteObservedMs > MAX_QUOTE_TTL_SECONDS * 1_000) {
    addIssue(
      "QUOTE_TTL_TOO_LONG",
      "serverContext.quote.validUntil",
      `Quote lifetime exceeds ${MAX_QUOTE_TTL_SECONDS} seconds.`
    );
  }
  if (!sameBlock(context.quote.blockNumber, context.quote.blockHash, context.block)) {
    addIssue(
      "QUOTE_BLOCK_MISMATCH",
      "serverContext.quote",
      "Quote and minimum-output evidence must reference the exact pinned block."
    );
  }
  const poolSqrtPriceX96 = canonicalUint256(context.pool.sqrtPriceX96, false);
  if (poolSqrtPriceX96 === null || poolSqrtPriceX96 > UINT160_MAX) {
    addIssue(
      "POOL_PRICE_INVALID",
      "serverContext.pool.sqrtPriceX96",
      "Pinned pool sqrt price must be a positive canonical uint160 decimal string."
    );
  }
  if (
    context.quote.poolAddress !== reviewed.pool.address ||
    context.quote.capitalToken0Raw !== intent.capital.token0Raw ||
    context.quote.capitalToken1Raw !== intent.capital.token1Raw ||
    context.quote.maxSlippageBps !== intent.maxSlippageBps ||
    context.quote.calculation.tickLower !== intent.desiredTick.lower ||
    context.quote.calculation.tickUpper !== intent.desiredTick.upper
  ) {
    addIssue(
      "QUOTE_BINDING_MISMATCH",
      "serverContext.quote",
      "Quote evidence must bind the reviewed pool, exact capital amounts, and requested slippage."
    );
  }
  if (
    context.quote.sourceUrl !== `https://testnet.bscscan.com/address/${context.quote.poolAddress}`
  ) {
    addIssue(
      "QUOTE_SOURCE_MISMATCH",
      "serverContext.quote.sourceUrl",
      "Quote provenance must cite the exact reviewed BSC testnet pool explorer page."
    );
  }
  const preliminaryLiquidity = canonicalUint256(
    context.quote.calculation.preliminaryLiquidityRaw,
    false
  );
  const recomputedLiquidity = canonicalUint256(
    context.quote.calculation.recomputedFromCalldataAtObservedPriceRaw,
    false
  );
  if (
    preliminaryLiquidity === null ||
    preliminaryLiquidity > UINT128_MAX ||
    recomputedLiquidity === null ||
    recomputedLiquidity > UINT128_MAX
  ) {
    addIssue(
      "LIQUIDITY_AMOUNT_INVALID",
      "serverContext.quote.calculation",
      "Both liquidity stages must be positive canonical uint128 decimal strings."
    );
  }
  if (
    context.quote.calculation.currentTick !== context.pool.currentTick ||
    context.quote.calculation.sqrtPriceX96 !== context.pool.sqrtPriceX96 ||
    preliminaryLiquidity !== recomputedLiquidity
  ) {
    addIssue(
      "QUOTE_CALCULATION_MISMATCH",
      "serverContext.quote.calculation",
      "Quote calculation must bind the pinned pool tick and price and reproduce identical preliminary and calldata liquidity."
    );
  }
  if (context.quote.token0.address !== token0 || context.quote.token1.address !== token1) {
    addIssue(
      "MINIMUM_TOKEN_MISMATCH",
      "serverContext.quote",
      "Minimum outputs must preserve the pinned pool token order."
    );
  }

  const desired0 = canonicalUint256(context.quote.token0.desiredMaximumRaw, true);
  const desired1 = canonicalUint256(context.quote.token1.desiredMaximumRaw, true);
  const notSubmitted0 = canonicalUint256(context.quote.token0.capitalNotSubmittedRaw, true);
  const notSubmitted1 = canonicalUint256(context.quote.token1.capitalNotSubmittedRaw, true);
  if (
    desired0 === null ||
    desired1 === null ||
    notSubmitted0 === null ||
    notSubmitted1 === null ||
    (desired0 === 0n && desired1 === 0n)
  ) {
    addIssue(
      "CALLDATA_AMOUNT_INVALID",
      "serverContext.quote",
      "Calldata maxima and non-submitted capital must be canonical uint256 values with at least one positive desired maximum."
    );
  }
  if (
    desired0 !== null &&
    desired1 !== null &&
    notSubmitted0 !== null &&
    notSubmitted1 !== null &&
    capital0 !== null &&
    capital1 !== null &&
    (desired0 + notSubmitted0 !== capital0 || desired1 + notSubmitted1 !== capital1)
  ) {
    addIssue(
      "CALLDATA_AMOUNT_RELATION_INVALID",
      "serverContext.quote",
      "Each calldata desired maximum plus capital not submitted must equal its exact configured capital ceiling."
    );
  }

  const minimum0 = canonicalUint256(context.quote.token0.minimumAmountRaw, true);
  const minimum1 = canonicalUint256(context.quote.token1.minimumAmountRaw, true);
  if (minimum0 === null) {
    addIssue(
      "MINIMUM_AMOUNT_INVALID",
      "serverContext.quote.token0.minimumAmountRaw",
      "Token 0 minimum must be a canonical uint256 decimal string."
    );
  }
  if (minimum1 === null) {
    addIssue(
      "MINIMUM_AMOUNT_INVALID",
      "serverContext.quote.token1.minimumAmountRaw",
      "Token 1 minimum must be a canonical uint256 decimal string."
    );
  }
  if (minimum0 !== null && capital0 !== null && minimum0 > capital0) {
    addIssue(
      "MINIMUM_EXCEEDS_CAPITAL",
      "serverContext.quote.token0.minimumAmountRaw",
      "Token 0 minimum exceeds its exact configured capital amount."
    );
  }
  if (minimum1 !== null && capital1 !== null && minimum1 > capital1) {
    addIssue(
      "MINIMUM_EXCEEDS_CAPITAL",
      "serverContext.quote.token1.minimumAmountRaw",
      "Token 1 minimum exceeds its exact configured capital amount."
    );
  }
  if (minimum0 !== null && desired0 !== null && minimum0 > desired0) {
    addIssue(
      "MINIMUM_EXCEEDS_CALLDATA",
      "serverContext.quote.token0.minimumAmountRaw",
      "Token 0 minimum exceeds its exact calldata desired maximum."
    );
  }
  if (minimum1 !== null && desired1 !== null && minimum1 > desired1) {
    addIssue(
      "MINIMUM_EXCEEDS_CALLDATA",
      "serverContext.quote.token1.minimumAmountRaw",
      "Token 1 minimum exceeds its exact calldata desired maximum."
    );
  }

  const sessionExpiresAtMs = nowMs + intent.sessionDurationSeconds * 1_000;
  const deadlineAtMs = nowMs + intent.txDeadlineSeconds * 1_000;
  if (quoteValidUntilMs > sessionExpiresAtMs || contextExpiresMs > sessionExpiresAtMs) {
    addIssue(
      "SESSION_QUOTE_RELATION_INVALID",
      "sessionDurationSeconds",
      "Quote and server context validity must not outlast the requested session."
    );
  }
  if (deadlineAtMs > quoteValidUntilMs) {
    addIssue(
      "DEADLINE_QUOTE_RELATION_INVALID",
      "txDeadlineSeconds",
      "The requested deadline must fit entirely inside the fresh quote validity window."
    );
  }

  if (issues.length > 0) return blocked(issues);

  const data: ResolvedLpActivationIntentData = {
    schemaVersion: 1,
    userIntent: intent,
    trustedEvidence: context,
    derived: {
      resolvedAt: now.toISOString(),
      sessionExpiresAtUnixSeconds: Math.floor(sessionExpiresAtMs / 1_000),
      sessionExpiresAtUtc: new Date(sessionExpiresAtMs).toISOString(),
      deadlineAtUnixSeconds: Math.floor(deadlineAtMs / 1_000),
      deadlineAtUtc: new Date(deadlineAtMs).toISOString()
    },
    fieldProvenance: {
      userControlled: [...USER_CONTROLLED_FIELDS],
      serverOwned: [...SERVER_OWNED_FIELDS],
      derived: [...DERIVED_FIELDS]
    },
    scopeBoundary:
      "Resolved data only. No policy, authority, submission, or execution has been created."
  };

  return deepFreeze({ status: "ready" as const, data, issues: [] as const });
}
