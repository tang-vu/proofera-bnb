import { z } from "zod";

import {
  ACTIVATION_POLICY_VERSION,
  activationPolicySchema,
  activationRuntimeExpectationSchema,
  hashActivationPolicy,
  reviewedContractManifestEntrySchema,
  runtimeExpectationFromPolicy,
  validateActivationPolicy,
  type ActivationPolicy,
  type ActivationRuntimeExpectation,
  type ReviewedContractManifestEntry
} from "./activation-policy";
import {
  resolveLpActivationIntent,
  type LpActivationIntentIssue,
  type ResolveLpActivationIntentOptions
} from "./lp-activation-intent";
import { PROOFERA_PANCAKE_V3_DIRECT_CALLS } from "./write-target-attestation";

const MAX_SESSION_SECONDS = 24 * 60 * 60;
const MIN_SESSION_SECONDS = 5 * 60;
const MAX_QUOTE_AGE_SECONDS = 120;
const MAX_QUOTE_TTL_SECONDS = 10 * 60;
const MAX_SLIPPAGE_BPS = 100;
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hexadecimal value")
  .transform((value) => value.toLowerCase() as `0x${string}`)
  .refine((value) => value !== ZERO_BYTES32, "The zero bytes32 value is not allowed");
const firstPartyAgentIdSchema = z
  .string()
  .min(12)
  .max(96)
  .regex(
    /^proofera:[a-z0-9][a-z0-9._:-]*$/,
    "Agent ID must be a lowercase first-party proofera identifier"
  );
const plainTokenSymbolSchema = z
  .string()
  .min(1)
  .max(16)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Token symbol must be exact plain ASCII text");

const optionsDataSchema = z
  .strictObject({
    agentId: firstPartyAgentIdSchema,
    token0Symbol: plainTokenSymbolSchema,
    token1Symbol: plainTokenSymbolSchema,
    expectedContextId: bytes32Schema,
    contextNonce: bytes32Schema,
    quoteNonce: bytes32Schema,
    consumedContextIds: z.array(bytes32Schema).max(10_000),
    consumedQuoteIds: z.array(bytes32Schema).max(10_000)
  })
  .superRefine((options, context) => {
    if (options.token0Symbol === options.token1Symbol) {
      context.addIssue({
        code: "custom",
        path: ["token1Symbol"],
        message: "Distinct pool tokens require distinct exact symbols"
      });
    }
    if (new Set(options.consumedContextIds).size !== options.consumedContextIds.length) {
      context.addIssue({
        code: "custom",
        path: ["consumedContextIds"],
        message: "Consumed context IDs must be unique"
      });
    }
    if (new Set(options.consumedQuoteIds).size !== options.consumedQuoteIds.length) {
      context.addIssue({
        code: "custom",
        path: ["consumedQuoteIds"],
        message: "Consumed quote IDs must be unique"
      });
    }
  });

type ParsedOptionsData = z.infer<typeof optionsDataSchema>;

export interface BuildLpActivationPolicyOptions extends ParsedOptionsData {
  readonly now: () => unknown;
}

const builderIssueCodeSchema = z.enum([
  "OPTIONS_INVALID",
  "CLOCK_INVALID",
  "RESOLUTION_BLOCKED",
  "POLICY_VALIDATION_BLOCKED",
  "INTERNAL_VALIDATION_ERROR"
]);

export type LpActivationPolicyBuilderIssueCode = z.infer<typeof builderIssueCodeSchema>;

const builderIssueSchema = z.strictObject({
  code: builderIssueCodeSchema,
  sourceCode: z.string().min(1).max(96).nullable(),
  path: z.string().min(1).max(240),
  message: z.string().min(1).max(320)
});

export type LpActivationPolicyBuilderIssue = z.infer<typeof builderIssueSchema>;

const scopeBoundarySchema = z.strictObject({
  outputKind: z.literal("validated_policy_only"),
  authorityCreated: z.literal(false),
  permissionPreviewCreated: z.literal(false),
  walletSignatureRequested: z.literal(false),
  transactionCalldataCreated: z.literal(false),
  transactionSubmitted: z.literal(false),
  executionPerformed: z.literal(false),
  nativeAssetAuthority: z.literal(false)
});

const sourceBindingSchema = z.strictObject({
  contextId: bytes32Schema,
  quoteId: bytes32Schema,
  contextIssuedAt: z.iso.datetime({ offset: true }),
  contextExpiresAt: z.iso.datetime({ offset: true }),
  blockNumber: z
    .string()
    .min(1)
    .max(78)
    .regex(/^(0|[1-9][0-9]*)$/),
  blockHash: bytes32Schema,
  blockTimestamp: z.iso.datetime({ offset: true }),
  resolvedAt: z.iso.datetime({ offset: true }),
  quoteObservedAt: z.iso.datetime({ offset: true }),
  quoteValidUntil: z.iso.datetime({ offset: true })
});

const reviewedManifestSchema = z
  .array(reviewedContractManifestEntrySchema)
  .length(4)
  .superRefine((entries, context) => {
    const keys = entries.map(
      (entry) => `${entry.chainId}:${entry.to.toLowerCase()}:${entry.selector.toLowerCase()}`
    );
    if (new Set(keys).size !== entries.length) {
      context.addIssue({
        code: "custom",
        message: "Reviewed LP manifest entries must be unique"
      });
    }
  });

export const lpActivationPolicyReadyResultSchema = z.strictObject({
  status: z.literal("ready"),
  policy: activationPolicySchema,
  policyHash: bytes32Schema,
  reviewedManifest: reviewedManifestSchema,
  runtimeExpectation: activationRuntimeExpectationSchema,
  sourceBinding: sourceBindingSchema,
  scopeBoundary: scopeBoundarySchema,
  issues: z.array(builderIssueSchema).length(0)
});

export const lpActivationPolicyBlockedResultSchema = z.strictObject({
  status: z.literal("blocked"),
  policy: z.null(),
  policyHash: z.null(),
  reviewedManifest: z.array(z.never()).length(0),
  runtimeExpectation: z.null(),
  sourceBinding: z.null(),
  scopeBoundary: scopeBoundarySchema,
  issues: z.array(builderIssueSchema).min(1).max(128)
});

export const lpActivationPolicyBuilderResultSchema = z.discriminatedUnion("status", [
  lpActivationPolicyReadyResultSchema,
  lpActivationPolicyBlockedResultSchema
]);

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export type LpActivationPolicyBuilderResult = DeepReadonly<
  z.infer<typeof lpActivationPolicyBuilderResultSchema>
>;

const scopeBoundary = {
  outputKind: "validated_policy_only" as const,
  authorityCreated: false as const,
  permissionPreviewCreated: false as const,
  walletSignatureRequested: false as const,
  transactionCalldataCreated: false as const,
  transactionSubmitted: false as const,
  executionPerformed: false as const,
  nativeAssetAuthority: false as const
};

function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<Value>;
}

function issue(
  code: LpActivationPolicyBuilderIssueCode,
  path: string,
  message: string,
  sourceCode: string | null = null
): LpActivationPolicyBuilderIssue {
  const safePath = path.replace(/[^A-Za-z0-9_.\[\]-]/g, "_").slice(0, 240) || "unknown";
  const safeSourceCode =
    sourceCode === null ? null : sourceCode.replace(/[^A-Z0-9_]/g, "_").slice(0, 96) || "UNKNOWN";
  return builderIssueSchema.parse({
    code,
    path: safePath,
    message: message.slice(0, 320),
    sourceCode: safeSourceCode
  });
}

function blocked(
  issues: readonly LpActivationPolicyBuilderIssue[]
): DeepReadonly<LpActivationPolicyBuilderResult> {
  const boundedIssues =
    issues.length <= 128
      ? [...issues]
      : [
          ...issues.slice(0, 127),
          issue(
            "INTERNAL_VALIDATION_ERROR",
            "issues",
            "Additional validation failures were omitted; the build remains blocked.",
            "ADDITIONAL_ISSUES_OMITTED"
          )
        ];
  return deepFreeze(
    lpActivationPolicyBlockedResultSchema.parse({
      status: "blocked",
      policy: null,
      policyHash: null,
      reviewedManifest: [],
      runtimeExpectation: null,
      sourceBinding: null,
      scopeBoundary,
      issues:
        boundedIssues.length > 0
          ? boundedIssues
          : [
              issue(
                "INTERNAL_VALIDATION_ERROR",
                "builder",
                "The policy build failed without a validation issue."
              )
            ]
    })
  );
}

function parseOptions(input: unknown): { data: ParsedOptionsData; now: () => unknown } | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const expectedKeys = [
    "agentId",
    "consumedContextIds",
    "consumedQuoteIds",
    "contextNonce",
    "expectedContextId",
    "now",
    "quoteNonce",
    "token0Symbol",
    "token1Symbol"
  ];
  const actualKeys = Object.keys(descriptors).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return null;
  }
  const nowDescriptor = descriptors.now;
  if (
    nowDescriptor === undefined ||
    !("value" in nowDescriptor) ||
    typeof nowDescriptor.value !== "function"
  ) {
    return null;
  }
  const rawData: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    if (key === "now") continue;
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) return null;
    rawData[key] = descriptor.value;
  }
  const dataResult = optionsDataSchema.safeParse(rawData);
  if (!dataResult.success) return null;
  const nowFunction: (...arguments_: readonly unknown[]) => unknown = nowDescriptor.value;
  return {
    data: dataResult.data,
    now: () => Reflect.apply(nowFunction, undefined, [])
  };
}

function captureClock(now: () => unknown): Date | null {
  let value: unknown;
  try {
    value = now();
  } catch {
    return null;
  }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  return new Date(value.getTime());
}

function buildManifest(
  managerAddress: string,
  managerCodeHash: string
): ReviewedContractManifestEntry[] {
  return PROOFERA_PANCAKE_V3_DIRECT_CALLS.map(({ selector, signature }) => ({
    chainId: 97 as const,
    to: managerAddress,
    selector,
    signature,
    contractLabel: "PancakeSwap V3 Position Manager",
    expectedIdentity: { kind: "code_hash" as const, codeHash: managerCodeHash },
    operationKind: "direct" as const,
    safeDirectOperation: true
  }));
}

function policyCallsFromManifest(manifest: readonly ReviewedContractManifestEntry[]) {
  return manifest.map((entry) => ({
    contractLabel: entry.contractLabel,
    expectedIdentity: entry.expectedIdentity,
    operationKind: entry.operationKind,
    selector: entry.selector,
    signature: entry.signature,
    to: entry.to
  }));
}

function resolverIssues(
  issues: readonly LpActivationIntentIssue[]
): LpActivationPolicyBuilderIssue[] {
  return issues.map((entry) =>
    issue(
      "RESOLUTION_BLOCKED",
      entry.path,
      "Raw intent and server evidence did not resolve into an activation source.",
      entry.code
    )
  );
}

/**
 * Resolves raw inputs, constructs one canonical policy, then validates it. This
 * boundary does not create a preview, authority, signature request, calldata,
 * transaction, or execution.
 */
export function buildLpActivationPolicy(
  unparsedUserIntent: unknown,
  unparsedServerContext: unknown,
  unparsedOptions: unknown
): DeepReadonly<LpActivationPolicyBuilderResult> {
  let options: ReturnType<typeof parseOptions>;
  try {
    options = parseOptions(unparsedOptions);
  } catch {
    options = null;
  }
  if (options === null) {
    return blocked([
      issue(
        "OPTIONS_INVALID",
        "options",
        "Server-owned agent, token symbols, replay inputs, and clock must be strict and complete."
      )
    ]);
  }
  const capturedNow = captureClock(options.now);
  if (capturedNow === null) {
    return blocked([
      issue("CLOCK_INVALID", "options.now", "The injected server clock returned an invalid time.")
    ]);
  }
  const capturedMilliseconds = capturedNow.getTime();
  const capturedClock = (): Date => new Date(capturedMilliseconds);
  const resolverOptions: ResolveLpActivationIntentOptions = {
    now: capturedClock,
    expectedContextId: options.data.expectedContextId,
    contextNonce: options.data.contextNonce,
    quoteNonce: options.data.quoteNonce,
    consumedContextIds: options.data.consumedContextIds,
    consumedQuoteIds: options.data.consumedQuoteIds
  };

  let resolution: ReturnType<typeof resolveLpActivationIntent>;
  try {
    resolution = resolveLpActivationIntent(
      unparsedUserIntent,
      unparsedServerContext,
      resolverOptions
    );
  } catch {
    return blocked([
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "resolver",
        "Raw activation resolution failed without producing trusted output."
      )
    ]);
  }
  if (resolution.status !== "ready") return blocked(resolverIssues(resolution.issues));

  const resolved = resolution.data;
  const intent = resolved.userIntent;
  const evidence = resolved.trustedEvidence;
  const reviewed = evidence.reviewedDeployment;
  const manifest = buildManifest(
    reviewed.positionManager.address,
    reviewed.positionManager.codeHash
  );
  const unparsedPolicy: ActivationPolicy = {
    version: ACTIVATION_POLICY_VERSION,
    agentId: options.data.agentId,
    category: "lp-rebalancing",
    chain: { chainId: 97, environment: "testnet", name: "BSC Testnet" },
    calls: policyCallsFromManifest(manifest),
    capital: [
      {
        address: reviewed.token0.address,
        amountRaw: intent.capital.token0Raw,
        decimals: reviewed.token0.decimals,
        symbol: options.data.token0Symbol
      },
      {
        address: reviewed.token1.address,
        amountRaw: intent.capital.token1Raw,
        decimals: reviewed.token1.decimals,
        symbol: options.data.token1Symbol
      }
    ],
    spend: [
      { token: reviewed.token0.address, limitRaw: intent.capital.token0Raw, period: "day" },
      { token: reviewed.token1.address, limitRaw: intent.capital.token1Raw, period: "day" }
    ],
    minimumAmounts: [
      {
        token: evidence.quote.token0.address,
        amountRaw: evidence.quote.token0.minimumAmountRaw
      },
      {
        token: evidence.quote.token1.address,
        amountRaw: evidence.quote.token1.minimumAmountRaw
      }
    ],
    wallet: intent.wallet,
    recipient: intent.recipient,
    tokenId: intent.positionTokenId,
    tickRange: { lower: intent.desiredTick.lower, upper: intent.desiredTick.upper },
    slippageBps: intent.maxSlippageBps,
    expiry: resolved.derived.sessionExpiresAtUnixSeconds,
    deadlineSeconds: intent.txDeadlineSeconds,
    transactionDeadline: resolved.derived.deadlineAtUnixSeconds,
    maxExecutionsPerDay: intent.maxExecutionsPerDay,
    quote: {
      observedAt: evidence.quote.observedAt,
      validUntil: evidence.quote.validUntil,
      sourceUrl: evidence.quote.sourceUrl
    },
    registerInKeystore: true,
    emergency: {
      onDeviation: "block-and-alert",
      onStaleQuote: "block",
      userCanRevoke: true
    },
    enforcement: {
      callPermissions: "altana_onchain",
      spendLimits: "altana_onchain",
      sessionExpiry: "altana_onchain",
      runtimeConstraints: "proofera_runtime",
      grantConfirmation: "wallet_confirmation"
    }
  };

  let policy: ActivationPolicy;
  let runtimeExpectation: ActivationRuntimeExpectation;
  let validation: ReturnType<typeof validateActivationPolicy>;
  try {
    policy = activationPolicySchema.parse(unparsedPolicy);
    runtimeExpectation = runtimeExpectationFromPolicy(policy);
    const expectedPolicyHash = hashActivationPolicy(policy);
    validation = validateActivationPolicy(policy, {
      expectedChainId: 97,
      expectedPolicyHash,
      expectedRuntime: runtimeExpectation,
      reviewedContractManifest: manifest,
      now: capturedClock,
      maxExpirySeconds: MAX_SESSION_SECONDS,
      minimumLeadSeconds: MIN_SESSION_SECONDS,
      maxQuoteAgeSeconds: MAX_QUOTE_AGE_SECONDS,
      maxQuoteTtlSeconds: MAX_QUOTE_TTL_SECONDS,
      maxSlippageBps: MAX_SLIPPAGE_BPS
    });
  } catch {
    return blocked([
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "policy",
        "Canonical policy construction or validation failed closed."
      )
    ]);
  }
  if (!validation.valid) {
    return blocked(
      validation.issues.map((entry) =>
        issue(
          "POLICY_VALIDATION_BLOCKED",
          entry.path,
          "Constructed policy failed hardened activation validation.",
          entry.code
        )
      )
    );
  }

  try {
    return deepFreeze(
      lpActivationPolicyReadyResultSchema.parse({
        status: "ready",
        policy: validation.policy,
        policyHash: validation.policyHash,
        reviewedManifest: manifest,
        runtimeExpectation,
        sourceBinding: {
          contextId: evidence.contextId,
          quoteId: evidence.quoteId,
          contextIssuedAt: evidence.issuedAt,
          contextExpiresAt: evidence.expiresAt,
          blockNumber: evidence.block.number,
          blockHash: evidence.block.hash,
          blockTimestamp: evidence.block.timestamp,
          resolvedAt: resolved.derived.resolvedAt,
          quoteObservedAt: evidence.quote.observedAt,
          quoteValidUntil: evidence.quote.validUntil
        },
        scopeBoundary,
        issues: []
      })
    );
  } catch {
    return blocked([
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "result",
        "Validated policy output failed its strict publication schema."
      )
    ]);
  }
}
