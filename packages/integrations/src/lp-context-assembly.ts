import {
  LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
  PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
  PANCAKE_V3_BSC_TESTNET_FACTORY,
  PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  deriveLpActivationContextIds,
  lpActivationIntentSchema,
  lpActivationServerContextSchema
} from "@proofera/domain/lp-activation-intent";
import {
  calculatePancakeV3LiquidityQuote,
  PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION
} from "@proofera/domain/pancake-v3-liquidity-quote";
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { z } from "zod";

import type { EvmCodeIdentityResult, EvmRuntimeCodeIdentity } from "./evm-code-identity";
import type { PancakeV3LatestSnapshotResult } from "./pancake-v3-latest";
import type { PancakeV3PositionAuthorityResult } from "./pancake-v3-authority";
import type { PancakeV3StaticContextResult } from "./pancake-v3-static-context";

const UINT256_MAX = (1n << 256n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;
const MAX_BLOCK_TIMESTAMP = 253_402_300_799n;
const MAX_BLOCK_AGE_MILLISECONDS = 120_000;
const MAX_CONTEXT_TTL_SECONDS = 120;
const MAX_QUOTE_TTL_SECONDS = 60;
const MAX_CONSUMED_IDS = 4_096;
const MAX_ISSUES = 48;
const MIN_TICK = -887_272;
const MAX_TICK = 887_272;
const MAX_SLIPPAGE_BPS = 100;
const MIN_SESSION_SECONDS = 300;
const MAX_SESSION_SECONDS = 86_400;
const MIN_DEADLINE_SECONDS = 30;
const MAX_DEADLINE_SECONDS = 1_800;
const MAX_EXECUTIONS_PER_DAY = 144;
const MAX_SNAPSHOT_DEPTH = 32;
const MAX_SNAPSHOT_NODES = 20_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

export const PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER =
  "0x41ff9aa7e16b8b1a8a8dc4f0efacd93d02d071c9" as const;
export const PANCAKE_V3_BSC_TESTNET_WRAPPED_NATIVE =
  "0xae13d989dac2f0debff460ac112a837c89baa7cd" as const;

const ASSEMBLY_OPTION_KEYS = Object.freeze([
  "authority",
  "codeIdentity",
  "consumedContextIds",
  "consumedQuoteIds",
  "contextNonce",
  "contextTtlSeconds",
  "latestSnapshot",
  "now",
  "quoteNonce",
  "quoteTtlSeconds",
  "reviewedDeployment",
  "staticContext"
] as const);

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value.toLowerCase() as Address)
  .refine((value) => value !== ZERO_ADDRESS);
const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hex);
const nonZeroBytes32Schema = bytes32Schema.refine((value) => value !== ZERO_BYTES32);
const canonicalUint256Schema = z
  .string()
  .min(1)
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine((value) => {
    try {
      return BigInt(value) <= UINT256_MAX;
    } catch {
      return false;
    }
  });
const utcSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const codeIdentitySchema = z.strictObject({
  address: addressSchema,
  codeHash: nonZeroBytes32Schema
});
const reviewedTokenSchema = z.strictObject({
  address: addressSchema,
  decimals: z.number().int().min(0).max(255),
  codeHash: nonZeroBytes32Schema
});

const reviewedLpDeploymentManifestShape = {
  schemaVersion: z.literal(1),
  chainId: z.literal(97),
  protocol: z.literal("PancakeSwap V3"),
  reviewedAt: utcSchema,
  sourceUrl: z.literal(PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE),
  fee: z.number().int().min(1).max(1_000_000),
  tickSpacing: z.number().int().positive().max(MAX_TICK),
  token0: reviewedTokenSchema,
  token1: reviewedTokenSchema,
  positionManager: codeIdentitySchema.extend({
    address: z.literal(PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER)
  }),
  factory: codeIdentitySchema.extend({ address: z.literal(PANCAKE_V3_BSC_TESTNET_FACTORY) }),
  poolDeployer: codeIdentitySchema.extend({
    address: z.literal(PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER)
  }),
  wrappedNative: codeIdentitySchema.extend({
    address: z.literal(PANCAKE_V3_BSC_TESTNET_WRAPPED_NATIVE)
  }),
  pool: codeIdentitySchema
} as const;

const reviewedLpDeploymentManifestSchema = z.strictObject(reviewedLpDeploymentManifestShape);

export type ReviewedLpDeploymentManifest = z.infer<typeof reviewedLpDeploymentManifestSchema>;

function recursivelySortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => recursivelySortJsonKeys(entry));
  if (value === null || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = recursivelySortJsonKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/** Derives the immutable content address for the complete reviewed manifest. */
export function deriveReviewedLpDeploymentReviewId(
  manifest: Readonly<ReviewedLpDeploymentManifest>
): Hex {
  const snapshot = snapshotExactData(manifest);
  if (!snapshot.success)
    throw new TypeError(`Reviewed manifest snapshot rejected: ${snapshot.reason}`);
  const canonicalManifest = reviewedLpDeploymentManifestSchema.parse(snapshot.data);
  return keccak256(
    stringToHex(
      `ProofEra:reviewed-lp-deployment:v1\u0000${JSON.stringify(
        recursivelySortJsonKeys(canonicalManifest)
      )}`
    )
  );
}

export const reviewedLpDeploymentSchema = z
  .strictObject({
    ...reviewedLpDeploymentManifestShape,
    reviewId: nonZeroBytes32Schema
  })
  .superRefine((deployment, context) => {
    const { reviewId, ...manifest } = deployment;
    if (reviewId !== deriveReviewedLpDeploymentReviewId(manifest)) {
      context.addIssue({
        code: "custom",
        path: ["reviewId"],
        message: "content address mismatch"
      });
    }
    if (deployment.token0.address === deployment.token1.address) {
      context.addIssue({ code: "custom", path: ["token1", "address"], message: "duplicate" });
    }
    if (BigInt(deployment.token0.address) >= BigInt(deployment.token1.address)) {
      context.addIssue({ code: "custom", path: ["token1", "address"], message: "order" });
    }
    const infrastructure = new Set([
      deployment.positionManager.address,
      deployment.factory.address,
      deployment.poolDeployer.address,
      deployment.pool.address
    ]);
    if (
      infrastructure.size !== 4 ||
      infrastructure.has(deployment.wrappedNative.address) ||
      infrastructure.has(deployment.token0.address) ||
      infrastructure.has(deployment.token1.address)
    ) {
      context.addIssue({ code: "custom", path: ["pool"], message: "collision" });
    }
    const hashesByAddress = new Map<string, string>();
    for (const identity of [
      deployment.positionManager,
      deployment.factory,
      deployment.poolDeployer,
      deployment.wrappedNative,
      deployment.pool,
      deployment.token0,
      deployment.token1
    ]) {
      const previous = hashesByAddress.get(identity.address);
      if (previous !== undefined && previous !== identity.codeHash) {
        context.addIssue({
          code: "custom",
          path: ["token0", "codeHash"],
          message: "hash conflict"
        });
      }
      hashesByAddress.set(identity.address, identity.codeHash);
    }
  });

export type ReviewedLpDeployment = z.infer<typeof reviewedLpDeploymentSchema>;

const assemblyStateSchema = z
  .strictObject({
    contextNonce: nonZeroBytes32Schema,
    quoteNonce: nonZeroBytes32Schema,
    contextTtlSeconds: z.number().int().positive().max(MAX_CONTEXT_TTL_SECONDS),
    quoteTtlSeconds: z.number().int().positive().max(MAX_QUOTE_TTL_SECONDS),
    consumedContextIds: z.array(nonZeroBytes32Schema).max(MAX_CONSUMED_IDS),
    consumedQuoteIds: z.array(nonZeroBytes32Schema).max(MAX_CONSUMED_IDS)
  })
  .superRefine((state, context) => {
    if (state.contextNonce === state.quoteNonce) {
      context.addIssue({ code: "custom", path: ["quoteNonce"], message: "nonces differ" });
    }
    if (new Set(state.consumedContextIds).size !== state.consumedContextIds.length) {
      context.addIssue({ code: "custom", path: ["consumedContextIds"], message: "duplicates" });
    }
    if (new Set(state.consumedQuoteIds).size !== state.consumedQuoteIds.length) {
      context.addIssue({ code: "custom", path: ["consumedQuoteIds"], message: "duplicates" });
    }
    if (state.quoteTtlSeconds > state.contextTtlSeconds) {
      context.addIssue({
        code: "custom",
        path: ["quoteTtlSeconds"],
        message: "quote cannot outlast context"
      });
    }
  });

const assemblyBoundarySchema = z.strictObject({
  authorityCreated: z.literal(false),
  sessionCreated: z.literal(false),
  permissionPreviewCreated: z.literal(false),
  calldataEncoded: z.literal(false),
  signatureRequested: z.literal(false),
  transactionSubmitted: z.literal(false),
  executionPerformed: z.literal(false),
  idConsumptionAtomic: z.literal(false),
  scope: z.literal("trusted_context_assembly_only")
});

export const trustedLpActivationContextSchema = lpActivationServerContextSchema;

export type TrustedLpActivationContext = z.infer<typeof trustedLpActivationContextSchema>;

export const lpContextAssemblyIssueCodeSchema = z.enum([
  "OPTIONS_INVALID",
  "INTENT_INVALID",
  "REVIEW_INVALID",
  "CLOCK_INVALID",
  "EVIDENCE_UNAVAILABLE",
  "WRONG_CHAIN",
  "BLOCK_MISMATCH",
  "BLOCK_STALE",
  "BLOCK_FROM_FUTURE",
  "EVIDENCE_TIME_INVALID",
  "OFFICIAL_DEPLOYMENT_MISMATCH",
  "RELATION_MISMATCH",
  "CODE_IDENTITY_MISMATCH",
  "TOKEN_MISMATCH",
  "TOKEN_DECIMALS_MISMATCH",
  "FEE_MISMATCH",
  "TICK_SPACING_MISMATCH",
  "TICK_ALIGNMENT_INVALID",
  "WALLET_MISMATCH",
  "POSITION_ID_MISMATCH",
  "CONTROLLER_NOT_AUTHORIZED",
  "SLIPPAGE_INVALID",
  "CAPITAL_INVALID",
  "QUOTE_CALCULATION_BLOCKED",
  "QUOTE_INVARIANT_VIOLATION",
  "QUOTE_WINDOW_INVALID",
  "CONTEXT_REPLAYED",
  "QUOTE_REPLAYED",
  "INTERNAL_VALIDATION_ERROR"
]);

export type LpContextAssemblyIssueCode = z.infer<typeof lpContextAssemblyIssueCodeSchema>;

const issueSchema = z.strictObject({
  code: lpContextAssemblyIssueCodeSchema,
  path: z.string().min(1).max(160),
  message: z.string().min(1).max(240),
  cause: z.string().min(1).max(100).nullable()
});

export type LpContextAssemblyIssue = z.infer<typeof issueSchema>;

const blockedResultSchema = z.strictObject({
  status: z.literal("blocked"),
  context: z.null(),
  boundary: assemblyBoundarySchema,
  issues: z.array(issueSchema).min(1).max(MAX_ISSUES)
});
const readyResultSchema = z.strictObject({
  status: z.literal("ready"),
  context: trustedLpActivationContextSchema,
  boundary: assemblyBoundarySchema,
  issues: z.tuple([])
});

export type LpContextAssemblyResult =
  z.infer<typeof blockedResultSchema> | z.infer<typeof readyResultSchema>;

export interface AssembleTrustedLpContextOptions {
  readonly reviewedDeployment: unknown;
  readonly latestSnapshot: PancakeV3LatestSnapshotResult;
  readonly staticContext: PancakeV3StaticContextResult;
  readonly codeIdentity: EvmCodeIdentityResult;
  readonly authority: PancakeV3PositionAuthorityResult;
  readonly now: () => Date;
  readonly contextNonce: unknown;
  readonly quoteNonce: unknown;
  readonly contextTtlSeconds: unknown;
  readonly quoteTtlSeconds: unknown;
  readonly consumedContextIds: unknown;
  readonly consumedQuoteIds: unknown;
}

type MutableIssueList = LpContextAssemblyIssue[];

const ASSEMBLY_BOUNDARY = Object.freeze({
  authorityCreated: false as const,
  sessionCreated: false as const,
  permissionPreviewCreated: false as const,
  calldataEncoded: false as const,
  signatureRequested: false as const,
  transactionSubmitted: false as const,
  executionPerformed: false as const,
  idConsumptionAtomic: false as const,
  scope: "trusted_context_assembly_only" as const
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function addIssue(
  issues: MutableIssueList,
  code: LpContextAssemblyIssueCode,
  path: string,
  message: string,
  cause: string | null = null
): void {
  if (
    issues.length >= MAX_ISSUES ||
    issues.some((entry) => entry.code === code && entry.path === path)
  )
    return;
  issues.push(issueSchema.parse({ code, path, message, cause }));
}

function blocked(issues: MutableIssueList): LpContextAssemblyResult {
  return deepFreeze(
    blockedResultSchema.parse({
      status: "blocked",
      context: null,
      boundary: ASSEMBLY_BOUNDARY,
      issues
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type ExactSnapshotResult =
  | Readonly<{ success: true; data: unknown }>
  | Readonly<{
      success: false;
      reason:
        | "ACCESSOR"
        | "CYCLE"
        | "DEPTH_LIMIT"
        | "HIDDEN_PROPERTY"
        | "INVALID_ARRAY"
        | "NODE_LIMIT"
        | "PROTOTYPE"
        | "SNAPSHOT_ERROR"
        | "SYMBOL"
        | "UNSUPPORTED_VALUE";
    }>;

interface ExactSnapshotState {
  readonly ancestors: WeakSet<object>;
  nodes: number;
}

function snapshotFailure(reason: Extract<ExactSnapshotResult, { success: false }>["reason"]) {
  return { success: false as const, reason };
}

/**
 * Copies an untrusted data graph using descriptors only. No property value is ever read through
 * ordinary property access, so an accessor cannot execute while the boundary is being inspected.
 */
function snapshotExactData(
  value: unknown,
  depth = 0,
  state: ExactSnapshotState = { ancestors: new WeakSet<object>(), nodes: 0 }
): ExactSnapshotResult {
  try {
    if (value === null) return { success: true, data: null };
    const valueType = typeof value;
    if (
      valueType === "string" ||
      valueType === "number" ||
      valueType === "boolean" ||
      valueType === "undefined" ||
      valueType === "bigint"
    ) {
      return { success: true, data: value };
    }
    if (valueType === "symbol") return snapshotFailure("SYMBOL");
    if (valueType !== "object") return snapshotFailure("UNSUPPORTED_VALUE");
    if (depth > MAX_SNAPSHOT_DEPTH) return snapshotFailure("DEPTH_LIMIT");

    const objectValue = value as object;
    state.nodes += 1;
    if (state.nodes > MAX_SNAPSHOT_NODES) return snapshotFailure("NODE_LIMIT");
    if (state.ancestors.has(objectValue)) return snapshotFailure("CYCLE");

    const isArray = Array.isArray(objectValue);
    const prototype = Object.getPrototypeOf(objectValue);
    if (
      (isArray && prototype !== Array.prototype) ||
      (!isArray && prototype !== Object.prototype && prototype !== null)
    ) {
      return snapshotFailure("PROTOTYPE");
    }

    const ownKeys = Reflect.ownKeys(objectValue);
    if (ownKeys.some((key) => typeof key === "symbol")) return snapshotFailure("SYMBOL");
    const stringKeys = ownKeys as string[];
    const descriptors = Object.getOwnPropertyDescriptors(objectValue);
    state.ancestors.add(objectValue);
    try {
      if (isArray) {
        const lengthDescriptor = descriptors.length;
        if (
          lengthDescriptor === undefined ||
          !("value" in lengthDescriptor) ||
          lengthDescriptor.enumerable !== false ||
          !Number.isSafeInteger(lengthDescriptor.value) ||
          lengthDescriptor.value < 0 ||
          lengthDescriptor.value > MAX_SNAPSHOT_NODES
        ) {
          return snapshotFailure("INVALID_ARRAY");
        }
        const length = lengthDescriptor.value as number;
        const indexKeys = stringKeys.filter((key) => key !== "length");
        if (indexKeys.length !== length) return snapshotFailure("INVALID_ARRAY");
        const output = new Array<unknown>(length);
        for (const key of indexKeys) {
          if (!/^(0|[1-9][0-9]*)$/.test(key)) return snapshotFailure("INVALID_ARRAY");
          const index = Number(key);
          if (!Number.isSafeInteger(index) || index < 0 || index >= length)
            return snapshotFailure("INVALID_ARRAY");
          const descriptor = descriptors[key];
          if (
            descriptor === undefined ||
            descriptor.enumerable !== true ||
            !("value" in descriptor) ||
            descriptor.get !== undefined ||
            descriptor.set !== undefined
          ) {
            return snapshotFailure(
              descriptor?.enumerable === false ? "HIDDEN_PROPERTY" : "ACCESSOR"
            );
          }
          const child = snapshotExactData(descriptor.value, depth + 1, state);
          if (!child.success) return child;
          output[index] = child.data;
        }
        return { success: true, data: output };
      }

      const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of stringKeys.sort()) {
        const descriptor = descriptors[key];
        if (descriptor === undefined || descriptor.enumerable !== true)
          return snapshotFailure("HIDDEN_PROPERTY");
        if (
          !("value" in descriptor) ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined
        )
          return snapshotFailure("ACCESSOR");
        const child = snapshotExactData(descriptor.value, depth + 1, state);
        if (!child.success) return child;
        Object.defineProperty(output, key, {
          configurable: true,
          enumerable: true,
          value: child.data,
          writable: true
        });
      }
      return { success: true, data: output };
    } finally {
      state.ancestors.delete(objectValue);
    }
  } catch {
    return snapshotFailure("SNAPSHOT_ERROR");
  }
}

function readExactOptions(options: unknown): AssembleTrustedLpContextOptions | null {
  try {
    if (!isRecord(options)) return null;
    const prototype = Object.getPrototypeOf(options);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(options);
    if (ownKeys.some((key) => typeof key === "symbol")) return null;
    const keys = (ownKeys as string[]).sort();
    if (
      keys.length !== ASSEMBLY_OPTION_KEYS.length ||
      !keys.every((key, index) => key === ASSEMBLY_OPTION_KEYS[index])
    )
      return null;
    const descriptors = Object.getOwnPropertyDescriptors(options);
    const values: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      )
        return null;
      values[key] = descriptor.value;
    }
    return {
      authority: values.authority as PancakeV3PositionAuthorityResult,
      codeIdentity: values.codeIdentity as EvmCodeIdentityResult,
      consumedContextIds: values.consumedContextIds,
      consumedQuoteIds: values.consumedQuoteIds,
      contextNonce: values.contextNonce,
      contextTtlSeconds: values.contextTtlSeconds,
      latestSnapshot: values.latestSnapshot as PancakeV3LatestSnapshotResult,
      now: values.now as () => Date,
      quoteNonce: values.quoteNonce,
      quoteTtlSeconds: values.quoteTtlSeconds,
      reviewedDeployment: values.reviewedDeployment,
      staticContext: values.staticContext as PancakeV3StaticContextResult
    };
  } catch {
    return null;
  }
}

function normalizeAddress(value: string): Address {
  return value.toLowerCase() as Address;
}

function validClock(
  now: () => Date
): { readonly date: Date; readonly milliseconds: number } | null {
  try {
    const date = now();
    if (!(date instanceof Date)) return null;
    const milliseconds = Date.prototype.getTime.call(date);
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) return null;
    return { date, milliseconds };
  } catch {
    return null;
  }
}

function parseCanonicalUint(value: string): bigint | null {
  const parsed = canonicalUint256Schema.safeParse(value);
  return parsed.success ? BigInt(parsed.data) : null;
}

function parseTimestampUnix(value: string): number | null {
  const parsed = parseCanonicalUint(value);
  if (parsed === null || parsed > MAX_BLOCK_TIMESTAMP) return null;
  const number = Number(parsed);
  return Number.isSafeInteger(number) ? number : null;
}

function parseIsoMilliseconds(value: string): number | null {
  const parsed = utcSchema.safeParse(value);
  if (!parsed.success) return null;
  const milliseconds = Date.parse(parsed.data);
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function expectedCodeRoles(deployment: ReviewedLpDeployment) {
  const entries = [
    ["position_manager", deployment.positionManager],
    ["factory", deployment.factory],
    ["pool_deployer", deployment.poolDeployer],
    ["wrapped_native", deployment.wrappedNative],
    ["pool", deployment.pool],
    ["token0", deployment.token0],
    ["token1", deployment.token1]
  ] as const;
  const byAddress = new Map<Address, { roles: string[]; codeHash: Hex }>();
  for (const [role, identity] of entries) {
    const current = byAddress.get(identity.address);
    if (current) current.roles.push(role);
    else byAddress.set(identity.address, { roles: [role], codeHash: identity.codeHash });
  }
  return byAddress;
}

function observedCodeIdentity(
  contracts: ReadonlyMap<Address, EvmRuntimeCodeIdentity>,
  address: Address
): { readonly address: Address; readonly codeHash: Hex } | null {
  const identity = contracts.get(address);
  if (identity === undefined) return null;
  return {
    address: normalizeAddress(identity.address),
    codeHash: identity.runtimeCodeHash.toLowerCase() as Hex
  };
}

function exactBlockValues(options: AssembleTrustedLpContextOptions, issues: MutableIssueList) {
  const latest = options.latestSnapshot;
  const statics = options.staticContext;
  const code = options.codeIdentity;
  const authority = options.authority;
  if (latest.status !== "available")
    addIssue(
      issues,
      "EVIDENCE_UNAVAILABLE",
      "latestSnapshot",
      "Latest Pancake evidence is unavailable.",
      latest.reason
    );
  if (statics.status !== "available")
    addIssue(
      issues,
      "EVIDENCE_UNAVAILABLE",
      "staticContext",
      "Static Pancake evidence is unavailable.",
      statics.reason
    );
  if (code.status !== "available")
    addIssue(
      issues,
      "EVIDENCE_UNAVAILABLE",
      "codeIdentity",
      "Runtime-code evidence is unavailable.",
      code.reason
    );
  if (authority.status !== "available")
    addIssue(
      issues,
      "EVIDENCE_UNAVAILABLE",
      "authority",
      "Position-authority evidence is unavailable.",
      authority.reason
    );
  if (
    issues.length > 0 ||
    latest.status !== "available" ||
    statics.status !== "available" ||
    code.status !== "available" ||
    authority.status !== "available"
  )
    return null;

  for (const [path, chainId, environment] of [
    ["latestSnapshot", latest.provenance.chainId, 97],
    ["staticContext", statics.chainId, 97],
    ["codeIdentity", code.chainId, 97],
    ["authority", authority.chainId, 97]
  ] as const) {
    if (chainId !== environment)
      addIssue(issues, "WRONG_CHAIN", path, "Evidence must be bound to BSC testnet chain 97.");
  }

  const number = latest.provenance.blockNumber;
  const hash = latest.provenance.blockHash.toLowerCase() as Hex;
  const timestampUnix = latest.provenance.blockTimestampUnix;
  const parsedTimestamp = parseTimestampUnix(timestampUnix);
  const expectedTimestampUtc =
    parsedTimestamp === null ? null : new Date(parsedTimestamp * 1_000).toISOString();
  if (parseCanonicalUint(number) === null) {
    addIssue(
      issues,
      "BLOCK_MISMATCH",
      "latestSnapshot.provenance.blockNumber",
      "The common block number must be a canonical uint256 decimal string."
    );
  }
  const references = [
    ["staticContext.block", statics.block.number, statics.block.hash, statics.block.timestampUnix],
    ["codeIdentity.block", code.block.number, code.block.hash, code.block.timestampUnix],
    ["authority.block", authority.block.number, authority.block.hash, authority.block.timestampUnix]
  ] as const;
  for (const [path, otherNumber, otherHash, otherTimestamp] of references) {
    if (
      otherNumber !== number ||
      otherHash.toLowerCase() !== hash ||
      otherTimestamp !== timestampUnix
    ) {
      addIssue(
        issues,
        "BLOCK_MISMATCH",
        path,
        "Every evidence result must bind the exact same block number, hash, and timestamp."
      );
    }
  }
  if (
    statics.evidence.blockNumber !== number ||
    statics.evidence.blockHash.toLowerCase() !== hash
  ) {
    addIssue(
      issues,
      "BLOCK_MISMATCH",
      "staticContext.evidence",
      "Static evidence must repeat the common block identity exactly."
    );
  }
  if (
    authority.authorization.blockNumber !== number ||
    authority.authorization.blockHash.toLowerCase() !== hash
  ) {
    addIssue(
      issues,
      "BLOCK_MISMATCH",
      "authority.authorization",
      "Authority evidence must repeat the common block identity exactly."
    );
  }
  if (
    code.contracts.some(
      (identity) => identity.provenance.blockSelector.blockHash.toLowerCase() !== hash
    )
  ) {
    addIssue(
      issues,
      "BLOCK_MISMATCH",
      "codeIdentity.contracts",
      "Every code identity must use the common canonical block hash."
    );
  }
  if (
    expectedTimestampUtc === null ||
    latest.provenance.blockTimestamp !== expectedTimestampUtc ||
    statics.block.timestampUtc !== expectedTimestampUtc ||
    code.block.timestampUtc !== expectedTimestampUtc ||
    authority.block.timestampUtc !== expectedTimestampUtc
  ) {
    addIssue(
      issues,
      "BLOCK_MISMATCH",
      "block.timestampUtc",
      "Every evidence result must represent the common Unix timestamp with the same UTC instant."
    );
  }
  return { latest, statics, code, authority, number, hash, timestampUnix };
}

function verifyTiming(
  evidence: NonNullable<ReturnType<typeof exactBlockValues>>,
  reviewedAt: string,
  nowMilliseconds: number,
  issues: MutableIssueList
): void {
  const timestamp = parseTimestampUnix(evidence.timestampUnix);
  if (timestamp === null) {
    addIssue(issues, "BLOCK_MISMATCH", "block.timestamp", "The common block timestamp is invalid.");
    return;
  }
  const blockMilliseconds = timestamp * 1_000;
  if (blockMilliseconds > nowMilliseconds)
    addIssue(
      issues,
      "BLOCK_FROM_FUTURE",
      "block.timestamp",
      "The evidence block is in the future."
    );
  if (nowMilliseconds - blockMilliseconds > MAX_BLOCK_AGE_MILLISECONDS)
    addIssue(
      issues,
      "BLOCK_STALE",
      "block.timestamp",
      "The evidence block is older than 120 seconds."
    );

  const observations = [
    ["latestSnapshot.provenance.observedAt", evidence.latest.provenance.observedAt],
    ["staticContext.evidence.observedAt", evidence.statics.evidence.observedAt],
    ["codeIdentity.observedAt", evidence.code.observedAt],
    ["authority.authorization.observedAt", evidence.authority.authorization.observedAt]
  ] as const;
  for (const [path, value] of observations) {
    const milliseconds = parseIsoMilliseconds(value);
    if (
      milliseconds === null ||
      milliseconds < blockMilliseconds ||
      milliseconds > nowMilliseconds
    ) {
      addIssue(
        issues,
        "EVIDENCE_TIME_INVALID",
        path,
        "Evidence observation time must fall between its block and the injected clock."
      );
    }
  }
  const reviewedMilliseconds = parseIsoMilliseconds(reviewedAt);
  if (reviewedMilliseconds === null || reviewedMilliseconds > nowMilliseconds) {
    addIssue(
      issues,
      "EVIDENCE_TIME_INVALID",
      "reviewedDeployment.reviewedAt",
      "Deployment review time cannot be invalid or in the future."
    );
  }
}

function verifyIntent(
  intent: z.infer<typeof lpActivationIntentSchema>,
  tickSpacing: number,
  issues: MutableIssueList
): { capital0: bigint; capital1: bigint } | null {
  if (intent.wallet !== intent.recipient)
    addIssue(
      issues,
      "WALLET_MISMATCH",
      "recipient",
      "Recipient must equal the authenticated wallet."
    );
  if (intent.maxSlippageBps < 1 || intent.maxSlippageBps > MAX_SLIPPAGE_BPS)
    addIssue(
      issues,
      "SLIPPAGE_INVALID",
      "maxSlippageBps",
      "Slippage must be between 1 and 100 basis points."
    );
  if (
    intent.sessionDurationSeconds < MIN_SESSION_SECONDS ||
    intent.sessionDurationSeconds > MAX_SESSION_SECONDS
  )
    addIssue(
      issues,
      "INTENT_INVALID",
      "sessionDurationSeconds",
      "Session duration is outside the product bounds."
    );
  if (
    intent.txDeadlineSeconds < MIN_DEADLINE_SECONDS ||
    intent.txDeadlineSeconds > MAX_DEADLINE_SECONDS ||
    intent.txDeadlineSeconds > intent.sessionDurationSeconds
  )
    addIssue(
      issues,
      "INTENT_INVALID",
      "txDeadlineSeconds",
      "Transaction deadline is outside the product bounds."
    );
  if (intent.maxExecutionsPerDay < 1 || intent.maxExecutionsPerDay > MAX_EXECUTIONS_PER_DAY)
    addIssue(
      issues,
      "INTENT_INVALID",
      "maxExecutionsPerDay",
      "Execution count is outside the product bounds."
    );
  const { lower, upper } = intent.desiredTick;
  if (
    lower < MIN_TICK ||
    upper > MAX_TICK ||
    lower >= upper ||
    lower % tickSpacing !== 0 ||
    upper % tickSpacing !== 0
  ) {
    addIssue(
      issues,
      "TICK_ALIGNMENT_INVALID",
      "desiredTick",
      "Desired ticks must be ordered, in range, and aligned to the reviewed spacing."
    );
  }
  const positionId = parseCanonicalUint(intent.positionTokenId);
  if (positionId === null)
    addIssue(
      issues,
      "POSITION_ID_MISMATCH",
      "positionTokenId",
      "Position token ID must be a canonical uint256 value."
    );
  const capital0 = parseCanonicalUint(intent.capital.token0Raw);
  const capital1 = parseCanonicalUint(intent.capital.token1Raw);
  if (capital0 === null || capital1 === null || (capital0 === 0n && capital1 === 0n)) {
    addIssue(
      issues,
      "CAPITAL_INVALID",
      "capital",
      "Capital must contain canonical uint256 values and at least one positive amount."
    );
    return null;
  }
  return { capital0, capital1 };
}

/**
 * Joins only server-owned, already-validated evidence and recomputes quote math internally.
 * This function cannot accept a caller-created quote, context ID, quote ID, or ready context.
 */
export function assembleTrustedLpContext(
  rawIntent: unknown,
  unparsedOptions: AssembleTrustedLpContextOptions
): LpContextAssemblyResult {
  const issues: MutableIssueList = [];
  const rawOptions = readExactOptions(unparsedOptions);
  if (rawOptions === null) {
    addIssue(
      issues,
      "OPTIONS_INVALID",
      "options",
      "Assembly options must use the exact trusted boundary shape."
    );
    return blocked(issues);
  }

  const intentSnapshot = snapshotExactData(rawIntent);
  const reviewSnapshot = snapshotExactData(rawOptions.reviewedDeployment);
  const latestSnapshot = snapshotExactData(rawOptions.latestSnapshot);
  const staticSnapshot = snapshotExactData(rawOptions.staticContext);
  const codeSnapshot = snapshotExactData(rawOptions.codeIdentity);
  const authoritySnapshot = snapshotExactData(rawOptions.authority);
  const stateSnapshot = snapshotExactData({
    contextNonce: rawOptions.contextNonce,
    quoteNonce: rawOptions.quoteNonce,
    contextTtlSeconds: rawOptions.contextTtlSeconds,
    quoteTtlSeconds: rawOptions.quoteTtlSeconds,
    consumedContextIds: rawOptions.consumedContextIds,
    consumedQuoteIds: rawOptions.consumedQuoteIds
  });

  if (!intentSnapshot.success)
    addIssue(
      issues,
      "INTENT_INVALID",
      "intent",
      "Raw intent is not an exact accessor-free data graph.",
      intentSnapshot.reason
    );
  if (!reviewSnapshot.success)
    addIssue(
      issues,
      "REVIEW_INVALID",
      "reviewedDeployment",
      "Reviewed deployment is not an exact accessor-free data graph.",
      reviewSnapshot.reason
    );
  for (const [path, snapshot] of [
    ["latestSnapshot", latestSnapshot],
    ["staticContext", staticSnapshot],
    ["codeIdentity", codeSnapshot],
    ["authority", authoritySnapshot]
  ] as const) {
    if (!snapshot.success)
      addIssue(
        issues,
        "EVIDENCE_UNAVAILABLE",
        path,
        "Evidence is not an exact accessor-free data graph.",
        snapshot.reason
      );
  }
  if (!stateSnapshot.success)
    addIssue(
      issues,
      "OPTIONS_INVALID",
      "options.idState",
      "Nonce, TTL, or ID-consumption state is not an exact accessor-free data graph.",
      stateSnapshot.reason
    );

  if (
    !intentSnapshot.success ||
    !reviewSnapshot.success ||
    !latestSnapshot.success ||
    !staticSnapshot.success ||
    !codeSnapshot.success ||
    !authoritySnapshot.success ||
    !stateSnapshot.success
  ) {
    return blocked(issues);
  }

  const stateValues = stateSnapshot.data as Readonly<{
    contextNonce: unknown;
    quoteNonce: unknown;
    contextTtlSeconds: unknown;
    quoteTtlSeconds: unknown;
    consumedContextIds: unknown;
    consumedQuoteIds: unknown;
  }>;
  const options: AssembleTrustedLpContextOptions = {
    reviewedDeployment: reviewSnapshot.data,
    latestSnapshot: latestSnapshot.data as PancakeV3LatestSnapshotResult,
    staticContext: staticSnapshot.data as PancakeV3StaticContextResult,
    codeIdentity: codeSnapshot.data as EvmCodeIdentityResult,
    authority: authoritySnapshot.data as PancakeV3PositionAuthorityResult,
    now: rawOptions.now,
    contextNonce: stateValues.contextNonce,
    quoteNonce: stateValues.quoteNonce,
    contextTtlSeconds: stateValues.contextTtlSeconds,
    quoteTtlSeconds: stateValues.quoteTtlSeconds,
    consumedContextIds: stateValues.consumedContextIds,
    consumedQuoteIds: stateValues.consumedQuoteIds
  };

  try {
    return assembleTrustedLpContextFromSnapshots(intentSnapshot.data, options);
  } catch {
    addIssue(
      issues,
      "INTERNAL_VALIDATION_ERROR",
      "assembly",
      "Malformed trusted inputs were blocked before a context could be issued.",
      "MALFORMED_TRUSTED_INPUT"
    );
    return blocked(issues);
  }
}

function assembleTrustedLpContextFromSnapshots(
  rawIntent: unknown,
  options: AssembleTrustedLpContextOptions
): LpContextAssemblyResult {
  const issues: MutableIssueList = [];
  const state = assemblyStateSchema.safeParse({
    contextNonce: options.contextNonce,
    quoteNonce: options.quoteNonce,
    contextTtlSeconds: options.contextTtlSeconds,
    quoteTtlSeconds: options.quoteTtlSeconds,
    consumedContextIds: options.consumedContextIds,
    consumedQuoteIds: options.consumedQuoteIds
  });
  if (!state.success)
    addIssue(
      issues,
      "OPTIONS_INVALID",
      "options.idState",
      "Nonce, TTL, or ID-consumption state is invalid."
    );
  const reviewed = reviewedLpDeploymentSchema.safeParse(options.reviewedDeployment);
  if (!reviewed.success)
    addIssue(
      issues,
      "REVIEW_INVALID",
      "reviewedDeployment",
      "Reviewed deployment configuration is invalid."
    );
  const parsedIntent = lpActivationIntentSchema.safeParse(rawIntent);
  if (!parsedIntent.success)
    addIssue(
      issues,
      "INTENT_INVALID",
      "intent",
      "Raw intent does not satisfy the strict LP activation schema."
    );
  const clock = validClock(options.now);
  if (clock === null)
    addIssue(issues, "CLOCK_INVALID", "options.now", "The injected assembly clock is invalid.");
  if (!state.success || !reviewed.success || !parsedIntent.success || clock === null)
    return blocked(issues);

  const intent = parsedIntent.data;
  const deployment = reviewed.data;
  if (intent.chainId !== 97)
    addIssue(issues, "WRONG_CHAIN", "intent.chainId", "Only BSC testnet chain 97 is supported.");
  const capital = verifyIntent(intent, deployment.tickSpacing, issues);
  const evidence = exactBlockValues(options, issues);
  if (evidence === null || capital === null) return blocked(issues);
  verifyTiming(evidence, deployment.reviewedAt, clock.milliseconds, issues);

  const manager = normalizeAddress(evidence.latest.provenance.positionManagerAddress);
  const factory = normalizeAddress(evidence.latest.provenance.factoryAddress);
  const pool = normalizeAddress(evidence.latest.provenance.poolAddress);
  if (
    manager !== deployment.positionManager.address ||
    factory !== deployment.factory.address ||
    pool !== deployment.pool.address ||
    normalizeAddress(intent.poolAddress) !== deployment.pool.address
  ) {
    addIssue(
      issues,
      "OFFICIAL_DEPLOYMENT_MISMATCH",
      "latestSnapshot.provenance",
      "Snapshot infrastructure does not match the reviewed deployment."
    );
  }

  const snapshot = evidence.latest.snapshot;
  const positionToken0 = normalizeAddress(snapshot.position.token0);
  const positionToken1 = normalizeAddress(snapshot.position.token1);
  const poolToken0 = normalizeAddress(snapshot.pool.token0);
  const poolToken1 = normalizeAddress(snapshot.pool.token1);
  if (
    positionToken0 !== deployment.token0.address ||
    positionToken1 !== deployment.token1.address ||
    poolToken0 !== deployment.token0.address ||
    poolToken1 !== deployment.token1.address
  ) {
    addIssue(
      issues,
      "TOKEN_MISMATCH",
      "latestSnapshot.snapshot",
      "Position and pool token order must match the reviewed deployment."
    );
  }
  if (snapshot.position.fee !== deployment.fee || snapshot.pool.fee !== deployment.fee)
    addIssue(
      issues,
      "FEE_MISMATCH",
      "latestSnapshot.snapshot",
      "Position and pool fees must match the reviewed fee."
    );
  if (snapshot.pool.tickSpacing !== deployment.tickSpacing)
    addIssue(
      issues,
      "TICK_SPACING_MISMATCH",
      "latestSnapshot.snapshot.pool.tickSpacing",
      "Pool tick spacing must match the reviewed spacing."
    );
  if (
    snapshot.position.tickLower % deployment.tickSpacing !== 0 ||
    snapshot.position.tickUpper % deployment.tickSpacing !== 0
  )
    addIssue(
      issues,
      "TICK_ALIGNMENT_INVALID",
      "latestSnapshot.snapshot.position",
      "Existing position ticks must align to the reviewed spacing."
    );
  if (snapshot.position.id !== intent.positionTokenId)
    addIssue(
      issues,
      "POSITION_ID_MISMATCH",
      "latestSnapshot.snapshot.position.id",
      "Snapshot position ID must match the intent."
    );

  const staticEvidence = evidence.statics.evidence;
  if (
    normalizeAddress(staticEvidence.positionManagerAddress) !==
      deployment.positionManager.address ||
    normalizeAddress(staticEvidence.factoryAddress) !== deployment.factory.address ||
    normalizeAddress(staticEvidence.poolDeployerAddress) !== deployment.poolDeployer.address ||
    normalizeAddress(staticEvidence.wrappedNativeAddress) !== deployment.wrappedNative.address
  ) {
    addIssue(
      issues,
      "RELATION_MISMATCH",
      "staticContext.evidence",
      "Manager immutables must match the reviewed official deployment."
    );
  }
  if (
    normalizeAddress(staticEvidence.token0.address) !== deployment.token0.address ||
    normalizeAddress(staticEvidence.token1.address) !== deployment.token1.address
  )
    addIssue(
      issues,
      "TOKEN_MISMATCH",
      "staticContext.evidence",
      "Static token order must match the reviewed pool."
    );
  if (
    staticEvidence.token0.decimals !== deployment.token0.decimals ||
    staticEvidence.token1.decimals !== deployment.token1.decimals
  )
    addIssue(
      issues,
      "TOKEN_DECIMALS_MISMATCH",
      "staticContext.evidence",
      "Onchain token decimals must match the reviewed decimals."
    );

  const authorization = evidence.authority.authorization;
  if (
    normalizeAddress(authorization.positionManagerAddress) !== deployment.positionManager.address ||
    authorization.positionTokenId !== intent.positionTokenId
  )
    addIssue(
      issues,
      "POSITION_ID_MISMATCH",
      "authority.authorization",
      "Authority must bind the reviewed manager and exact position ID."
    );
  if (normalizeAddress(authorization.controllerAddress) !== normalizeAddress(intent.wallet))
    addIssue(
      issues,
      "WALLET_MISMATCH",
      "authority.authorization.controllerAddress",
      "Authority controller must equal the intent wallet."
    );
  if (!authorization.controllerAuthorized || authorization.authorizationKind === null)
    addIssue(
      issues,
      "CONTROLLER_NOT_AUTHORIZED",
      "authority.authorization",
      "The intent wallet is not currently authorized for the position."
    );

  const expectedCodes = expectedCodeRoles(deployment);
  const observedCodes = new Map<Address, (typeof evidence.code.contracts)[number]>();
  for (const identity of evidence.code.contracts)
    observedCodes.set(normalizeAddress(identity.address), identity);
  if (
    observedCodes.size !== evidence.code.contracts.length ||
    observedCodes.size !== expectedCodes.size
  )
    addIssue(
      issues,
      "CODE_IDENTITY_MISMATCH",
      "codeIdentity.contracts",
      "Runtime-code evidence must contain exactly the reviewed unique contracts."
    );
  for (const [address, expected] of expectedCodes) {
    const observed = observedCodes.get(address);
    if (
      !observed ||
      observed.runtimeCodeHash.toLowerCase() !== expected.codeHash ||
      observed.expectedRuntimeCodeHash?.toLowerCase() !== expected.codeHash ||
      observed.expectation !== "matched"
    ) {
      addIssue(
        issues,
        "CODE_IDENTITY_MISMATCH",
        `codeIdentity.contracts.${address}`,
        "Every runtime-code hash must exactly match reviewed server configuration."
      );
    }
  }

  if (issues.length > 0) return blocked(issues);

  const observedDeployment = {
    positionManager: observedCodeIdentity(observedCodes, deployment.positionManager.address),
    factory: observedCodeIdentity(observedCodes, deployment.factory.address),
    pool: observedCodeIdentity(observedCodes, deployment.pool.address),
    poolDeployer: observedCodeIdentity(observedCodes, deployment.poolDeployer.address),
    wrappedNative: observedCodeIdentity(observedCodes, deployment.wrappedNative.address),
    token0: observedCodeIdentity(observedCodes, deployment.token0.address),
    token1: observedCodeIdentity(observedCodes, deployment.token1.address)
  };
  if (
    observedDeployment.positionManager === null ||
    observedDeployment.factory === null ||
    observedDeployment.pool === null ||
    observedDeployment.poolDeployer === null ||
    observedDeployment.wrappedNative === null ||
    observedDeployment.token0 === null ||
    observedDeployment.token1 === null
  ) {
    addIssue(
      issues,
      "CODE_IDENTITY_MISMATCH",
      "codeIdentity.contracts",
      "Every reviewed contract must have an observed runtime-code identity."
    );
    return blocked(issues);
  }

  const quoteResult = calculatePancakeV3LiquidityQuote({
    schemaVersion: 2,
    sqrtPriceX96: snapshot.pool.sqrtPriceX96,
    currentTick: snapshot.pool.tick,
    tickLower: intent.desiredTick.lower,
    tickUpper: intent.desiredTick.upper,
    amount0Desired: intent.capital.token0Raw,
    amount1Desired: intent.capital.token1Raw,
    maxSlippageBps: intent.maxSlippageBps
  });
  if (quoteResult.status !== "quoted") {
    addIssue(
      issues,
      "QUOTE_CALCULATION_BLOCKED",
      "executionQuote",
      "Internal Pancake quote calculation failed closed.",
      quoteResult.issues[0]?.code ?? "UNKNOWN_QUOTE_FAILURE"
    );
    return blocked(issues);
  }
  const quote = quoteResult.quote;
  const preliminaryLiquidity = parseCanonicalUint(
    quote.liquidityCalculation.preliminaryFromCapitalRaw
  );
  const recomputedLiquidity = parseCanonicalUint(
    quote.liquidityCalculation.recomputedFromCalldataAtObservedPriceRaw
  );
  const desired0 = parseCanonicalUint(quote.calldataAmounts.amount0DesiredMaximumRaw);
  const desired1 = parseCanonicalUint(quote.calldataAmounts.amount1DesiredMaximumRaw);
  const notSubmitted0 = parseCanonicalUint(quote.calldataAmounts.capital0NotSubmittedRaw);
  const notSubmitted1 = parseCanonicalUint(quote.calldataAmounts.capital1NotSubmittedRaw);
  const minimum0 = parseCanonicalUint(quote.slippageMinimums.amount0Raw);
  const minimum1 = parseCanonicalUint(quote.slippageMinimums.amount1Raw);
  if (
    preliminaryLiquidity === null ||
    recomputedLiquidity === null ||
    preliminaryLiquidity === 0n ||
    preliminaryLiquidity > UINT128_MAX ||
    preliminaryLiquidity !== recomputedLiquidity
  ) {
    addIssue(
      issues,
      "QUOTE_INVARIANT_VIOLATION",
      "executionQuote.liquidity",
      "Preliminary and router liquidity must be positive and exactly equal."
    );
    return blocked(issues);
  }
  if (
    desired0 === null ||
    desired1 === null ||
    notSubmitted0 === null ||
    notSubmitted1 === null ||
    minimum0 === null ||
    minimum1 === null ||
    (desired0 === 0n && desired1 === 0n) ||
    desired0 + notSubmitted0 !== capital.capital0 ||
    desired1 + notSubmitted1 !== capital.capital1 ||
    minimum0 > desired0 ||
    minimum1 > desired1
  ) {
    addIssue(
      issues,
      "QUOTE_INVARIANT_VIOLATION",
      "executionQuote.amounts",
      "Calldata maxima must stay within original capital, preserve unsubmitted capital, and bound each slippage minimum."
    );
    return blocked(issues);
  }

  const nowIso = clock.date.toISOString();
  const contextExpiresAt = new Date(
    clock.milliseconds + state.data.contextTtlSeconds * 1_000
  ).toISOString();
  const quoteObservedMilliseconds = parseIsoMilliseconds(evidence.latest.provenance.observedAt);
  const blockTimestamp = parseTimestampUnix(evidence.timestampUnix);
  if (quoteObservedMilliseconds === null || blockTimestamp === null) {
    addIssue(
      issues,
      "QUOTE_WINDOW_INVALID",
      "latestSnapshot.provenance.observedAt",
      "A quote requires a valid source observation and block timestamp."
    );
    return blocked(issues);
  }
  const quoteValidUntilMilliseconds =
    quoteObservedMilliseconds + state.data.quoteTtlSeconds * 1_000;
  if (
    quoteObservedMilliseconds < blockTimestamp * 1_000 ||
    quoteObservedMilliseconds > clock.milliseconds ||
    quoteValidUntilMilliseconds <= clock.milliseconds ||
    quoteValidUntilMilliseconds > Date.parse(contextExpiresAt) ||
    clock.milliseconds + intent.txDeadlineSeconds * 1_000 > quoteValidUntilMilliseconds
  ) {
    addIssue(
      issues,
      "QUOTE_WINDOW_INVALID",
      "latestSnapshot.provenance.observedAt",
      "The pinned price observation cannot support a positive, causal quote window."
    );
    return blocked(issues);
  }
  const quoteObservedAt = new Date(quoteObservedMilliseconds).toISOString();
  const quoteValidUntil = new Date(quoteValidUntilMilliseconds).toISOString();
  const reviewedDeploymentContext = {
    protocol: "PancakeSwap V3" as const,
    reviewId: deployment.reviewId,
    reviewedAt: deployment.reviewedAt,
    sourceUrl: deployment.sourceUrl,
    fee: deployment.fee,
    tickSpacing: deployment.tickSpacing,
    token0: deployment.token0,
    token1: deployment.token1,
    positionManager: deployment.positionManager,
    factory: deployment.factory,
    pool: deployment.pool,
    poolDeployer: deployment.poolDeployer,
    wrappedNative: deployment.wrappedNative
  };
  const observedDeploymentContext = {
    blockNumber: evidence.number,
    blockHash: evidence.hash,
    positionManager: observedDeployment.positionManager,
    factory: observedDeployment.factory,
    pool: observedDeployment.pool,
    poolDeployer: observedDeployment.poolDeployer,
    wrappedNative: observedDeployment.wrappedNative,
    token0: observedDeployment.token0,
    token1: observedDeployment.token1
  };
  const positionContext = {
    fee: snapshot.position.fee,
    managerAddress: deployment.positionManager.address,
    ownerAddress: authorization.ownerAddress,
    poolAddress: deployment.pool.address,
    tickLower: snapshot.position.tickLower,
    tickUpper: snapshot.position.tickUpper,
    token0Address: deployment.token0.address,
    token1Address: deployment.token1.address,
    tokenId: snapshot.position.id
  };
  const poolContext = {
    address: deployment.pool.address,
    currentTick: snapshot.pool.tick,
    factoryAddress: deployment.factory.address,
    fee: snapshot.pool.fee,
    sqrtPriceX96: snapshot.pool.sqrtPriceX96,
    tickSpacing: snapshot.pool.tickSpacing,
    token0: { address: deployment.token0.address, decimals: deployment.token0.decimals },
    token1: { address: deployment.token1.address, decimals: deployment.token1.decimals }
  };
  const factoryRelationContext = {
    factoryAddress: deployment.factory.address,
    fee: deployment.fee,
    poolAddress: deployment.pool.address,
    tickSpacing: deployment.tickSpacing,
    token0Address: deployment.token0.address,
    token1Address: deployment.token1.address
  };
  const authorizationContext = {
    blockNumber: evidence.number,
    blockHash: evidence.hash,
    authorizationKind: authorization.authorizationKind as NonNullable<
      typeof authorization.authorizationKind
    >,
    controllerAddress: authorization.controllerAddress,
    controllerAuthorized: authorization.controllerAuthorized,
    observedAt: authorization.observedAt,
    ownerAddress: authorization.ownerAddress,
    positionTokenId: authorization.positionTokenId,
    source: authorization.source
  };
  const blockContext = {
    hash: evidence.hash,
    number: evidence.number,
    timestamp: new Date(blockTimestamp * 1_000).toISOString()
  };
  const quoteContext = {
    blockNumber: evidence.number,
    blockHash: evidence.hash,
    capitalToken0Raw: intent.capital.token0Raw,
    capitalToken1Raw: intent.capital.token1Raw,
    calculation: {
      currentTick: snapshot.pool.tick,
      exactLiquidityMatchRequired: true as const,
      methodologyVersion: PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION,
      preliminaryLiquidityRaw: quote.liquidityCalculation.preliminaryFromCapitalRaw,
      recomputedFromCalldataAtObservedPriceRaw:
        quote.liquidityCalculation.recomputedFromCalldataAtObservedPriceRaw,
      sqrtPriceX96: snapshot.pool.sqrtPriceX96,
      tickLower: intent.desiredTick.lower,
      tickUpper: intent.desiredTick.upper
    },
    maxSlippageBps: intent.maxSlippageBps,
    observedAt: quoteObservedAt,
    poolAddress: deployment.pool.address,
    sourceKind: "pancake_v3_block_pinned_math" as const,
    sourceUrl: `https://testnet.bscscan.com/address/${deployment.pool.address}`,
    token0: {
      address: deployment.token0.address,
      capitalNotSubmittedRaw: quote.calldataAmounts.capital0NotSubmittedRaw,
      desiredMaximumRaw: quote.calldataAmounts.amount0DesiredMaximumRaw,
      minimumAmountRaw: quote.slippageMinimums.amount0Raw
    },
    token1: {
      address: deployment.token1.address,
      capitalNotSubmittedRaw: quote.calldataAmounts.capital1NotSubmittedRaw,
      desiredMaximumRaw: quote.calldataAmounts.amount1DesiredMaximumRaw,
      minimumAmountRaw: quote.slippageMinimums.amount1Raw
    },
    validUntil: quoteValidUntil
  };
  const contextPayload = {
    schemaVersion: LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
    chainId: 97 as const,
    environment: "testnet" as const,
    issuedAt: nowIso,
    expiresAt: contextExpiresAt,
    authenticatedWallet: intent.wallet,
    intentBinding: intent,
    reviewedDeployment: reviewedDeploymentContext,
    observedDeployment: observedDeploymentContext,
    position: positionContext,
    pool: poolContext,
    factoryRelation: factoryRelationContext,
    authorization: authorizationContext,
    block: blockContext,
    quote: quoteContext
  };
  const idBinding = {
    contextNonce: state.data.contextNonce,
    quoteNonce: state.data.quoteNonce
  };
  const { contextId, quoteId } = deriveLpActivationContextIds(intent, contextPayload, idBinding);
  if (state.data.consumedContextIds.includes(contextId))
    addIssue(
      issues,
      "CONTEXT_REPLAYED",
      "contextId",
      "Derived context ID has already been consumed."
    );
  if (state.data.consumedQuoteIds.includes(quoteId))
    addIssue(issues, "QUOTE_REPLAYED", "quoteId", "Derived quote ID has already been consumed.");
  if (issues.length > 0) return blocked(issues);

  const contextCandidate = {
    ...contextPayload,
    contextId,
    quoteId
  } as const;

  const validated = trustedLpActivationContextSchema.safeParse(contextCandidate);
  if (!validated.success) {
    addIssue(
      issues,
      "INTERNAL_VALIDATION_ERROR",
      "context",
      "Assembled context failed its strict output schema."
    );
    return blocked(issues);
  }
  return deepFreeze(
    readyResultSchema.parse({
      status: "ready",
      context: validated.data,
      boundary: ASSEMBLY_BOUNDARY,
      issues: []
    })
  );
}
