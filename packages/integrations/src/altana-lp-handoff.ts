import "server-only";

import { isProxy } from "node:util/types";

import {
  buildLpActivationPolicy,
  lpActivationPolicyBlockedResultSchema,
  lpActivationPolicyReadyResultSchema,
  type BuildLpActivationPolicyOptions
} from "@proofera/domain/lp-activation-policy";
import {
  PROOFERA_PANCAKE_V3_DIRECT_CALLS,
  deriveWriteTargetReviewId,
  writeTargetAttestationResultSchema,
  type WriteTargetAttestationResult
} from "@proofera/domain";
import { keccak256, stringToHex } from "viem";
import { z } from "zod";

import { altanaBootstrapRequestSchema } from "./altana-bootstrap";

const RESERVATION_HASH_DOMAIN = "proofera:altana-lp-reservation:v2";
const MAX_ATTESTATION_SNAPSHOT_DEPTH = 64;
const MAX_ATTESTATION_SNAPSHOT_NODES = 50_000;

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-f]{64}$/, "Expected a lowercase 32-byte hexadecimal value")
  .refine((value) => value !== `0x${"00".repeat(32)}`, "The zero bytes32 value is not allowed");

const bootstrapOptionsSchema = z.strictObject({
  userId: altanaBootstrapRequestSchema.shape.userId,
  bootstrapTtlSeconds: altanaBootstrapRequestSchema.shape.bootstrapTtlSeconds
});

const reconciliationBytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as `0x${string}`)
  .refine((value) => value !== `0x${"00".repeat(32)}`);

const reconciliationPolicyDataSchema = z.strictObject({
  agentId: z
    .string()
    .min(12)
    .max(96)
    .regex(/^proofera:[a-z0-9][a-z0-9._:-]*$/),
  consumedContextIds: z.array(reconciliationBytes32Schema).max(10_000),
  consumedQuoteIds: z.array(reconciliationBytes32Schema).max(10_000),
  contextNonce: reconciliationBytes32Schema,
  expectedContextId: reconciliationBytes32Schema,
  quoteNonce: reconciliationBytes32Schema,
  token0Symbol: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  token1Symbol: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
});

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-f]{40}$/, "Expected a lowercase 20-byte EVM address")
  .refine((value) => value !== `0x${"00".repeat(20)}`, "The zero address is not allowed");

const writeTargetBindingSchema = z.strictObject({
  chainId: z.literal(97),
  address: addressSchema,
  runtimeCodeHash: bytes32Schema,
  canonicalBlockNumber: z
    .string()
    .min(1)
    .max(78)
    .regex(/^[1-9][0-9]*$/, "Expected a positive canonical block number"),
  canonicalBlockHash: bytes32Schema,
  reviewId: bytes32Schema,
  proxyKind: z.literal("none")
});

export const altanaLpReservationRequestSchema = z.strictObject({
  schemaVersion: z.literal(2),
  reservationId: bytes32Schema,
  contextId: bytes32Schema,
  quoteId: bytes32Schema,
  userId: altanaBootstrapRequestSchema.shape.userId,
  policyHash: bytes32Schema,
  writeTargetBinding: writeTargetBindingSchema,
  consumedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true })
});

export const altanaLpReservationReceiptSchema = altanaLpReservationRequestSchema.extend({
  state: z.literal("consumed")
});

export type AltanaLpReservationRequest = z.infer<typeof altanaLpReservationRequestSchema>;
export type AltanaLpReservationReceipt = z.infer<typeof altanaLpReservationReceiptSchema>;

/**
 * This dependency must be implemented by a server-only durable store. The
 * operation must atomically consume both IDs when neither exists, return the
 * identical immutable receipt when the exact binding already exists, and
 * reject a conflict involving either ID. In-memory or browser implementations
 * do not satisfy this contract.
 */
export interface AltanaLpDurableReservationDependency {
  readonly consumeOrRead: (request: Readonly<AltanaLpReservationRequest>) => Promise<unknown>;
}

const handoffIssueSchema = z.strictObject({
  code: z.enum([
    "BOOTSTRAP_OPTIONS_INVALID",
    "POLICY_BUILD_BLOCKED",
    "BOOTSTRAP_WINDOW_INVALID",
    "BOOTSTRAP_REQUEST_INVALID",
    "WRITE_TARGET_ATTESTATION_INVALID",
    "WRITE_TARGET_ATTESTATION_BLOCKED",
    "WRITE_TARGET_ATTESTATION_NOT_TRUSTED",
    "WRITE_TARGET_ATTESTATION_BINDING_MISMATCH",
    "WRITE_TARGET_PROXY_UNSUPPORTED",
    "RECONCILIATION_REQUEST_INVALID",
    "RECONCILIATION_REQUEST_FUTURE",
    "RECONCILIATION_REQUEST_EXPIRED",
    "RECONCILIATION_REQUEST_MISMATCH",
    "RESERVATION_DEPENDENCY_INVALID",
    "RESERVATION_FAILED",
    "RESERVATION_CLOCK_INVALID",
    "RESERVATION_RECEIPT_INVALID",
    "RESERVATION_RECEIPT_MISMATCH",
    "RESERVATION_RECEIPT_STALE",
    "RESERVATION_RECEIPT_FUTURE",
    "RESERVATION_RECEIPT_EXPIRED"
  ]),
  path: z.string().min(1).max(160),
  message: z.string().min(1).max(280)
});

const actionBoundaryShape = {
  sessionKeyCreated: z.literal(false),
  secretHandleCreated: z.literal(false),
  bootstrapPersisted: z.literal(false),
  authorityCreated: z.literal(false),
  walletSignatureRequested: z.literal(false),
  transactionSubmitted: z.literal(false),
  executionPerformed: z.literal(false)
} as const;

const readyScopeBoundarySchema = z.strictObject({
  outputKind: z.literal("validated_bootstrap_request_with_durable_reservation"),
  rawIntentReResolved: z.literal(true),
  contextQuoteReservationConsumedAtomically: z.literal(true),
  reservationOutcome: z.literal("context_quote_pair_consumed_atomically_or_identical_receipt_read"),
  reservationReceiptValidated: z.literal(true),
  ...actionBoundaryShape
});

const blockedScopeBoundarySchema = z.strictObject({
  outputKind: z.literal("no_bootstrap_request"),
  rawIntentReResolved: z.boolean(),
  contextQuoteReservationConsumedAtomically: z.boolean().nullable(),
  reservationOutcome: z.enum(["not_attempted", "rolled_back", "committed_unusable", "unknown"]),
  reservationReceiptValidated: z.literal(false),
  ...actionBoundaryShape
});

const readyResultSchema = z.strictObject({
  status: z.literal("ready"),
  policyBuild: lpActivationPolicyReadyResultSchema,
  bootstrapRequest: altanaBootstrapRequestSchema,
  writeTargetBinding: writeTargetBindingSchema,
  reservationRequest: altanaLpReservationRequestSchema,
  reservationReceipt: altanaLpReservationReceiptSchema,
  scopeBoundary: readyScopeBoundarySchema,
  issues: z.array(handoffIssueSchema).length(0)
});

const blockedResultSchema = z.strictObject({
  status: z.literal("blocked"),
  policyBuild: lpActivationPolicyBlockedResultSchema.nullable(),
  bootstrapRequest: z.null(),
  writeTargetBinding: z.null(),
  reservationRequest: altanaLpReservationRequestSchema.nullable(),
  reservationReceipt: z.null(),
  scopeBoundary: blockedScopeBoundarySchema,
  issues: z.array(handoffIssueSchema).min(1).max(2)
});

export const altanaLpPolicyHandoffResultSchema = z.discriminatedUnion("status", [
  readyResultSchema,
  blockedResultSchema
]);

export type AltanaLpPolicyHandoffResult = z.infer<typeof altanaLpPolicyHandoffResultSchema>;

const readyScopeBoundary = {
  outputKind: "validated_bootstrap_request_with_durable_reservation" as const,
  rawIntentReResolved: true as const,
  contextQuoteReservationConsumedAtomically: true as const,
  reservationOutcome: "context_quote_pair_consumed_atomically_or_identical_receipt_read" as const,
  reservationReceiptValidated: true as const,
  sessionKeyCreated: false as const,
  secretHandleCreated: false as const,
  bootstrapPersisted: false as const,
  authorityCreated: false as const,
  walletSignatureRequested: false as const,
  transactionSubmitted: false as const,
  executionPerformed: false as const
};

function blockedScopeBoundary(
  rawIntentReResolved: boolean,
  reservationOutcome: "not_attempted" | "rolled_back" | "committed_unusable" | "unknown"
) {
  return {
    outputKind: "no_bootstrap_request" as const,
    rawIntentReResolved,
    contextQuoteReservationConsumedAtomically:
      reservationOutcome === "committed_unusable"
        ? (true as const)
        : reservationOutcome === "not_attempted" || reservationOutcome === "rolled_back"
          ? (false as const)
          : null,
    reservationOutcome,
    reservationReceiptValidated: false as const,
    sessionKeyCreated: false as const,
    secretHandleCreated: false as const,
    bootstrapPersisted: false as const,
    authorityCreated: false as const,
    walletSignatureRequested: false as const,
    transactionSubmitted: false as const,
    executionPerformed: false as const
  };
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function issue(code: z.infer<typeof handoffIssueSchema>["code"], path: string, message: string) {
  return handoffIssueSchema.parse({ code, path, message });
}

function parsePlainBootstrapOptions(input: unknown): z.infer<typeof bootstrapOptionsSchema> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  if (isProxy(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return null;

  const descriptors = Object.getOwnPropertyDescriptors(input);
  const expectedKeys = ["bootstrapTtlSeconds", "userId"] as const;
  const actualKeys = Object.keys(descriptors).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return null;
  }

  const values: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) return null;
    values[key] = descriptor.value;
  }
  const parsed = bootstrapOptionsSchema.safeParse(values);
  return parsed.success ? parsed.data : null;
}

type ExactJsonSnapshotResult =
  Readonly<{ success: true; data: unknown }> | Readonly<{ success: false }>;

interface ExactJsonSnapshotState {
  readonly ancestors: WeakSet<object>;
  nodes: number;
}

/** Copies an untrusted JSON graph through descriptors without invoking property getters. */
function snapshotExactJson(
  value: unknown,
  depth = 0,
  state: ExactJsonSnapshotState = { ancestors: new WeakSet<object>(), nodes: 0 }
): ExactJsonSnapshotResult {
  try {
    if (value === null) return { success: true, data: null };
    const valueType = typeof value;
    if (valueType === "string" || valueType === "boolean") {
      return { success: true, data: value };
    }
    if (valueType === "number") {
      return Number.isFinite(value) ? { success: true, data: value } : { success: false };
    }
    if (valueType !== "object" || depth > MAX_ATTESTATION_SNAPSHOT_DEPTH) {
      return { success: false };
    }

    const objectValue = value as object;
    state.nodes += 1;
    if (state.nodes > MAX_ATTESTATION_SNAPSHOT_NODES || state.ancestors.has(objectValue)) {
      return { success: false };
    }
    if (isProxy(objectValue)) return { success: false };

    const isArray = Array.isArray(objectValue);
    const prototype = Object.getPrototypeOf(objectValue);
    if (
      (isArray && prototype !== Array.prototype) ||
      (!isArray && prototype !== Object.prototype && prototype !== null)
    ) {
      return { success: false };
    }

    const ownKeys = Reflect.ownKeys(objectValue);
    if (ownKeys.some((key) => typeof key === "symbol")) return { success: false };
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
          lengthDescriptor.value > MAX_ATTESTATION_SNAPSHOT_NODES
        ) {
          return { success: false };
        }
        const length = lengthDescriptor.value as number;
        const keys = (ownKeys as string[]).filter((key) => key !== "length");
        if (keys.length !== length) return { success: false };
        const output = new Array<unknown>(length);
        for (const key of keys) {
          if (!/^(0|[1-9][0-9]*)$/.test(key)) return { success: false };
          const index = Number(key);
          if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
            return { success: false };
          }
          const descriptor = descriptors[key];
          if (
            descriptor === undefined ||
            descriptor.enumerable !== true ||
            !("value" in descriptor) ||
            descriptor.get !== undefined ||
            descriptor.set !== undefined
          ) {
            return { success: false };
          }
          const child = snapshotExactJson(descriptor.value, depth + 1, state);
          if (!child.success) return child;
          output[index] = child.data;
        }
        return { success: true, data: output };
      }

      const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of ownKeys as string[]) {
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          descriptor.enumerable !== true ||
          !("value" in descriptor) ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined
        ) {
          return { success: false };
        }
        const child = snapshotExactJson(descriptor.value, depth + 1, state);
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
    return { success: false };
  }
}

function parseEvaluatedWriteTargetResult(input: unknown): WriteTargetAttestationResult | null {
  const snapshot = snapshotExactJson(input);
  if (!snapshot.success) return null;
  const parsed = writeTargetAttestationResultSchema.safeParse(snapshot.data);
  return parsed.success ? deepFreeze(parsed.data) : null;
}

type ReadyWriteTargetAttestationResult = Extract<
  WriteTargetAttestationResult,
  Readonly<{ status: "ready" }>
>;

function hasExactInternalWriteTargetBinding(result: ReadyWriteTargetAttestationResult): boolean {
  const { attestation, effectiveTarget } = result;
  const { reviewId, ...manifest } = attestation;
  let derivedReviewId: string;
  try {
    derivedReviewId = deriveWriteTargetReviewId(manifest);
  } catch {
    return false;
  }

  if (
    reviewId !== derivedReviewId ||
    reviewId !== effectiveTarget.reviewId ||
    attestation.chainId !== effectiveTarget.chainId ||
    attestation.target.code.address !== effectiveTarget.address ||
    attestation.target.code.runtimeCodeHash !== effectiveTarget.runtimeCodeHash ||
    attestation.canonicalBlock.number !== effectiveTarget.canonicalBlockNumber ||
    attestation.canonicalBlock.hash !== effectiveTarget.canonicalBlockHash
  ) {
    return false;
  }

  const proxy = attestation.proxyAssessment;
  if (effectiveTarget.proxyKind === "none") {
    return (
      proxy.kind === "non_proxy" &&
      proxy.targetAddress === effectiveTarget.address &&
      proxy.runtimeCodeHash === effectiveTarget.runtimeCodeHash &&
      proxy.blockNumber === effectiveTarget.canonicalBlockNumber &&
      proxy.blockHash === effectiveTarget.canonicalBlockHash &&
      effectiveTarget.effectiveImplementationAddress === effectiveTarget.address &&
      effectiveTarget.effectiveImplementationRuntimeCodeHash === effectiveTarget.runtimeCodeHash
    );
  }

  return (
    proxy.kind === "recognized_proxy" &&
    proxy.standard === effectiveTarget.proxyKind &&
    proxy.proxyAddress === effectiveTarget.address &&
    proxy.blockNumber === effectiveTarget.canonicalBlockNumber &&
    proxy.blockHash === effectiveTarget.canonicalBlockHash &&
    proxy.implementation.code.address === effectiveTarget.effectiveImplementationAddress &&
    proxy.implementation.code.runtimeCodeHash ===
      effectiveTarget.effectiveImplementationRuntimeCodeHash
  );
}

const POLICY_OPTION_KEYS = [
  "agentId",
  "consumedContextIds",
  "consumedQuoteIds",
  "contextNonce",
  "expectedContextId",
  "now",
  "quoteNonce",
  "token0Symbol",
  "token1Symbol"
] as const;

function parseInitialPolicyOptions(input: unknown): Readonly<{
  clock: () => Date | null;
  options: BuildLpActivationPolicyOptions;
}> | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input) || isProxy(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key === "symbol")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const actualKeys = Object.keys(descriptors).sort();
    if (
      actualKeys.length !== POLICY_OPTION_KEYS.length ||
      actualKeys.some((key, index) => key !== POLICY_OPTION_KEYS[index])
    ) {
      return null;
    }
    const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of POLICY_OPTION_KEYS) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        return null;
      }
      values[key] = descriptor.value;
    }
    const clock = readStrictPolicyClock(input);
    if (clock === null) return null;
    const dataSnapshot = snapshotExactJson({
      agentId: values.agentId,
      consumedContextIds: values.consumedContextIds,
      consumedQuoteIds: values.consumedQuoteIds,
      contextNonce: values.contextNonce,
      expectedContextId: values.expectedContextId,
      quoteNonce: values.quoteNonce,
      token0Symbol: values.token0Symbol,
      token1Symbol: values.token1Symbol
    });
    if (!dataSnapshot.success) return null;
    const parsedData = reconciliationPolicyDataSchema.safeParse(dataSnapshot.data);
    if (!parsedData.success) return null;
    return {
      clock,
      options: {
        ...parsedData.data,
        now: () => clock() ?? new Date(Number.NaN)
      }
    };
  } catch {
    return null;
  }
}

function readStrictPolicyClock(input: unknown): (() => Date | null) | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    if (isProxy(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptor = Object.getOwnPropertyDescriptor(input, "now");
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      typeof descriptor.value !== "function"
    ) {
      return null;
    }
    const nowFunction = descriptor.value;
    if (isProxy(nowFunction)) return null;
    let monotonicFloorMilliseconds = Number.NEGATIVE_INFINITY;
    return () => {
      try {
        const value = Reflect.apply(nowFunction, undefined, []);
        if (typeof value === "object" && value !== null && isProxy(value)) return null;
        if (!(value instanceof Date) || Object.getPrototypeOf(value) !== Date.prototype)
          return null;
        const milliseconds = Date.prototype.getTime.call(value);
        if (!Number.isFinite(milliseconds) || milliseconds < monotonicFloorMilliseconds) {
          return null;
        }
        monotonicFloorMilliseconds = milliseconds;
        return new Date(milliseconds);
      } catch {
        return null;
      }
    };
  } catch {
    return null;
  }
}

function policyOptionsForReconciliation(
  input: unknown,
  resolvedAt: string
): Readonly<{ currentTime: Date; options: BuildLpActivationPolicyOptions }> | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    if (isProxy(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const actualKeys = Object.keys(descriptors).sort();
    if (
      actualKeys.length !== POLICY_OPTION_KEYS.length ||
      actualKeys.some((key, index) => key !== POLICY_OPTION_KEYS[index])
    ) {
      return null;
    }

    const values: Record<string, unknown> = {};
    for (const key of POLICY_OPTION_KEYS) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        return null;
      }
      values[key] = descriptor.value;
    }
    if (typeof values.now !== "function") return null;
    const nowFunction = values.now;
    if (isProxy(nowFunction)) return null;
    const currentTimeValue = Reflect.apply(nowFunction, undefined, []);
    if (
      typeof currentTimeValue === "object" &&
      currentTimeValue !== null &&
      isProxy(currentTimeValue)
    ) {
      return null;
    }
    if (
      !(currentTimeValue instanceof Date) ||
      Object.getPrototypeOf(currentTimeValue) !== Date.prototype
    ) {
      return null;
    }
    const currentMilliseconds = Date.prototype.getTime.call(currentTimeValue);
    const resolvedAtMilliseconds = Date.parse(resolvedAt);
    if (!Number.isFinite(currentMilliseconds) || !Number.isFinite(resolvedAtMilliseconds)) {
      return null;
    }

    const dataSnapshot = snapshotExactJson({
      agentId: values.agentId,
      consumedContextIds: values.consumedContextIds,
      consumedQuoteIds: values.consumedQuoteIds,
      contextNonce: values.contextNonce,
      expectedContextId: values.expectedContextId,
      quoteNonce: values.quoteNonce,
      token0Symbol: values.token0Symbol,
      token1Symbol: values.token1Symbol
    });
    if (!dataSnapshot.success) return null;
    const parsedData = reconciliationPolicyDataSchema.safeParse(dataSnapshot.data);
    if (!parsedData.success) return null;

    return {
      currentTime: new Date(currentMilliseconds),
      options: {
        ...parsedData.data,
        now: () => new Date(resolvedAtMilliseconds)
      }
    };
  } catch {
    return null;
  }
}

function parseReservationDependency(input: unknown): AltanaLpDurableReservationDependency | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  if (isProxy(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Object.keys(descriptors).length !== 1) return null;
  const method = descriptors.consumeOrRead;
  if (
    method === undefined ||
    !("value" in method) ||
    typeof method.value !== "function" ||
    isProxy(method.value)
  ) {
    return null;
  }
  return { consumeOrRead: method.value as AltanaLpDurableReservationDependency["consumeOrRead"] };
}

function parsePlainReservationRequest(input: unknown): AltanaLpReservationRequest | null {
  const snapshot = snapshotExactJson(input);
  if (!snapshot.success) return null;
  const parsed = altanaLpReservationRequestSchema.safeParse(snapshot.data);
  return parsed.success ? deepFreeze(parsed.data) : null;
}

function parsePlainReservationReceipt(input: unknown): AltanaLpReservationReceipt | null {
  const snapshot = snapshotExactJson(input);
  if (!snapshot.success) return null;
  const parsed = altanaLpReservationReceiptSchema.safeParse(snapshot.data);
  return parsed.success ? deepFreeze(parsed.data) : null;
}

type BlockedReservationOutcome = "not_attempted" | "rolled_back" | "committed_unusable" | "unknown";

function reservationOutcomeFromThrown(error: unknown): BlockedReservationOutcome {
  try {
    if (typeof error !== "object" || error === null || Array.isArray(error)) return "unknown";
    if (isProxy(error)) return "unknown";
    const descriptor = Object.getOwnPropertyDescriptor(error, "reservationOutcome");
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      return "unknown";
    }
    const outcome = descriptor.value;
    return outcome === "not_attempted" ||
      outcome === "rolled_back" ||
      outcome === "committed_unusable" ||
      outcome === "unknown"
      ? outcome
      : "unknown";
  } catch {
    return "unknown";
  }
}

function blocked(
  policyBuild: unknown,
  issues: readonly z.infer<typeof handoffIssueSchema>[],
  rawIntentReResolved: boolean,
  reservationOutcome: BlockedReservationOutcome = "not_attempted",
  reservationRequest: AltanaLpReservationRequest | null = null
): AltanaLpPolicyHandoffResult {
  return deepFreeze(
    blockedResultSchema.parse({
      status: "blocked",
      policyBuild,
      bootstrapRequest: null,
      writeTargetBinding: null,
      reservationRequest,
      reservationReceipt: null,
      scopeBoundary: blockedScopeBoundary(rawIntentReResolved, reservationOutcome),
      issues
    })
  );
}

function deriveReservationId(
  binding: Omit<AltanaLpReservationRequest, "reservationId" | "schemaVersion">
) {
  return keccak256(
    stringToHex(
      `${RESERVATION_HASH_DOMAIN}\u0000${JSON.stringify({
        consumedAt: binding.consumedAt,
        contextId: binding.contextId,
        expiresAt: binding.expiresAt,
        policyHash: binding.policyHash,
        quoteId: binding.quoteId,
        userId: binding.userId,
        writeTargetBinding: binding.writeTargetBinding
      })}`
    )
  );
}

function reservationRequestsMatch(
  left: AltanaLpReservationRequest,
  right: AltanaLpReservationRequest
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.reservationId === right.reservationId &&
    left.contextId === right.contextId &&
    left.quoteId === right.quoteId &&
    left.userId === right.userId &&
    left.policyHash === right.policyHash &&
    left.writeTargetBinding.chainId === right.writeTargetBinding.chainId &&
    left.writeTargetBinding.address === right.writeTargetBinding.address &&
    left.writeTargetBinding.runtimeCodeHash === right.writeTargetBinding.runtimeCodeHash &&
    left.writeTargetBinding.canonicalBlockNumber ===
      right.writeTargetBinding.canonicalBlockNumber &&
    left.writeTargetBinding.canonicalBlockHash === right.writeTargetBinding.canonicalBlockHash &&
    left.writeTargetBinding.reviewId === right.writeTargetBinding.reviewId &&
    left.writeTargetBinding.proxyKind === right.writeTargetBinding.proxyKind &&
    left.consumedAt === right.consumedAt &&
    left.expiresAt === right.expiresAt
  );
}

function writeTargetBindingForPolicy(
  policyBuild: Extract<ReturnType<typeof buildLpActivationPolicy>, Readonly<{ status: "ready" }>>,
  attestationResult: ReadyWriteTargetAttestationResult
): z.infer<typeof writeTargetBindingSchema> | null {
  const firstManifestEntry = policyBuild.reviewedManifest[0];
  if (
    firstManifestEntry === undefined ||
    firstManifestEntry.expectedIdentity.kind !== "code_hash"
  ) {
    return null;
  }
  const expectedAddress = firstManifestEntry.to;
  const expectedRuntimeCodeHash = firstManifestEntry.expectedIdentity.codeHash;
  const proxyAssessment = attestationResult.attestation.proxyAssessment;
  if (
    proxyAssessment.kind !== "non_proxy" ||
    proxyAssessment.decision !== "independently_reviewed_non_proxy_selector_scoped"
  ) {
    return null;
  }
  const attestedCalls = proxyAssessment.selectorCallPathAssessment.allowedDirectCalls;
  if (
    policyBuild.reviewedManifest.length !== PROOFERA_PANCAKE_V3_DIRECT_CALLS.length ||
    policyBuild.policy.calls.length !== PROOFERA_PANCAKE_V3_DIRECT_CALLS.length ||
    attestedCalls.length !== PROOFERA_PANCAKE_V3_DIRECT_CALLS.length
  ) {
    return null;
  }
  const exactReviewedCallSet = PROOFERA_PANCAKE_V3_DIRECT_CALLS.every((definition) => {
    const manifestCall = policyBuild.reviewedManifest.find(
      (entry) => entry.selector === definition.selector
    );
    const policyCall = policyBuild.policy.calls.find(
      (entry) => entry.selector === definition.selector
    );
    const attestedCall = attestedCalls.find((entry) => entry.selector === definition.selector);
    return (
      manifestCall !== undefined &&
      policyCall !== undefined &&
      attestedCall !== undefined &&
      manifestCall.signature === definition.signature &&
      manifestCall.selector === definition.selector &&
      manifestCall.safeDirectOperation === true &&
      manifestCall.operationKind === "direct" &&
      policyCall.signature === definition.signature &&
      policyCall.selector === definition.selector &&
      policyCall.operationKind === "direct" &&
      attestedCall.operation === definition.operation &&
      attestedCall.signature === definition.signature &&
      attestedCall.selector === definition.selector
    );
  });
  const exactManifestTarget = policyBuild.reviewedManifest.every(
    (entry) =>
      entry.chainId === 97 &&
      entry.to === expectedAddress &&
      entry.expectedIdentity.kind === "code_hash" &&
      entry.expectedIdentity.codeHash === expectedRuntimeCodeHash
  );
  const exactPolicyTarget = policyBuild.policy.calls.every(
    (call) =>
      call.to === expectedAddress &&
      call.expectedIdentity.kind === "code_hash" &&
      call.expectedIdentity.codeHash === expectedRuntimeCodeHash
  );
  const { effectiveTarget } = attestationResult;
  if (
    !exactReviewedCallSet ||
    !exactManifestTarget ||
    !exactPolicyTarget ||
    policyBuild.policy.chain.chainId !== 97 ||
    effectiveTarget.chainId !== policyBuild.policy.chain.chainId ||
    effectiveTarget.address !== expectedAddress ||
    effectiveTarget.runtimeCodeHash !== expectedRuntimeCodeHash ||
    effectiveTarget.canonicalBlockNumber !== policyBuild.sourceBinding.blockNumber ||
    effectiveTarget.canonicalBlockHash !== policyBuild.sourceBinding.blockHash ||
    attestationResult.attestation.canonicalBlock.timestamp !==
      policyBuild.sourceBinding.blockTimestamp
  ) {
    return null;
  }

  const parsed = writeTargetBindingSchema.safeParse({
    chainId: effectiveTarget.chainId,
    address: effectiveTarget.address,
    runtimeCodeHash: effectiveTarget.runtimeCodeHash,
    canonicalBlockNumber: effectiveTarget.canonicalBlockNumber,
    canonicalBlockHash: effectiveTarget.canonicalBlockHash,
    reviewId: effectiveTarget.reviewId,
    proxyKind: effectiveTarget.proxyKind
  });
  return parsed.success ? deepFreeze(parsed.data) : null;
}

/**
 * Rebuilds the policy from raw intent and server evidence, then requires an
 * already evaluated server-side write-target attestation, an independently
 * provisioned expected full-review ID, and an atomic durable reservation of
 * the exact context/quote binding before producing the public Altana bootstrap
 * request. A raw client attestation or self-selected content address is not
 * accepted. It does not create a session key, persist a bootstrap, grant
 * authority, request a signature, or submit a transaction.
 */
export async function buildAltanaLpBootstrapRequest(
  unparsedUserIntent: unknown,
  unparsedServerContext: unknown,
  policyOptions: BuildLpActivationPolicyOptions,
  unparsedBootstrapOptions: unknown,
  unparsedWriteTargetAttestationResult: unknown,
  unparsedExpectedWriteTargetReviewId: unknown,
  unparsedReservationDependency: unknown,
  unparsedPriorReservationRequest?: unknown
): Promise<AltanaLpPolicyHandoffResult> {
  const userIntentSnapshot = snapshotExactJson(unparsedUserIntent);
  const serverContextSnapshot = snapshotExactJson(unparsedServerContext);
  if (!userIntentSnapshot.success || !serverContextSnapshot.success) {
    return blocked(
      null,
      [
        issue(
          "POLICY_BUILD_BLOCKED",
          !userIntentSnapshot.success ? "userIntent" : "serverContext",
          "Intent and server context must be recursively getter-free, JSON-safe data before policy construction."
        )
      ],
      false
    );
  }

  let bootstrapOptions: ReturnType<typeof parsePlainBootstrapOptions>;
  try {
    bootstrapOptions = parsePlainBootstrapOptions(unparsedBootstrapOptions);
  } catch {
    bootstrapOptions = null;
  }
  if (bootstrapOptions === null) {
    return blocked(
      null,
      [
        issue(
          "BOOTSTRAP_OPTIONS_INVALID",
          "bootstrapOptions",
          "Server-owned user identity and bootstrap TTL must be strict and complete."
        )
      ],
      false
    );
  }
  const initialPolicyOptions = parseInitialPolicyOptions(policyOptions);
  if (initialPolicyOptions === null) {
    return blocked(
      null,
      [
        issue(
          "POLICY_BUILD_BLOCKED",
          "policyOptions",
          "Policy options must be strict, recursively getter-free server data with a valid clock."
        )
      ],
      false
    );
  }
  const policyClock = initialPolicyOptions.clock;

  let priorReservationRequest: AltanaLpReservationRequest | null = null;
  let effectivePolicyOptions = initialPolicyOptions.options;
  if (unparsedPriorReservationRequest !== undefined && unparsedPriorReservationRequest !== null) {
    try {
      priorReservationRequest = parsePlainReservationRequest(unparsedPriorReservationRequest);
    } catch {
      priorReservationRequest = null;
    }
    if (priorReservationRequest === null) {
      return blocked(
        null,
        [
          issue(
            "RECONCILIATION_REQUEST_INVALID",
            "priorReservationRequest",
            "Reconciliation requires the exact strict request retained from the unknown prior attempt."
          )
        ],
        false
      );
    }
    const reconciliationOptions = policyOptionsForReconciliation(
      initialPolicyOptions.options,
      priorReservationRequest.consumedAt
    );
    if (reconciliationOptions === null) {
      return blocked(
        null,
        [
          issue(
            "RECONCILIATION_REQUEST_INVALID",
            "policyOptions",
            "Reconciliation requires strict policy options and a valid current server clock."
          )
        ],
        false
      );
    }
    const currentMilliseconds = reconciliationOptions.currentTime.getTime();
    const consumedAtMilliseconds = Date.parse(priorReservationRequest.consumedAt);
    const expiresAtMilliseconds = Date.parse(priorReservationRequest.expiresAt);
    if (consumedAtMilliseconds > currentMilliseconds) {
      return blocked(
        null,
        [
          issue(
            "RECONCILIATION_REQUEST_FUTURE",
            "priorReservationRequest.consumedAt",
            "A prior attempt cannot be reconciled before its original resolution time."
          )
        ],
        false
      );
    }
    if (
      expiresAtMilliseconds <= consumedAtMilliseconds ||
      expiresAtMilliseconds <= currentMilliseconds
    ) {
      return blocked(
        null,
        [
          issue(
            "RECONCILIATION_REQUEST_EXPIRED",
            "priorReservationRequest.expiresAt",
            "The exact prior reservation window has expired and cannot produce a bootstrap handoff."
          )
        ],
        false
      );
    }
    effectivePolicyOptions = reconciliationOptions.options;
  }

  const policyBuild = buildLpActivationPolicy(
    userIntentSnapshot.data,
    serverContextSnapshot.data,
    effectivePolicyOptions
  );
  if (policyBuild.status !== "ready") {
    return blocked(
      policyBuild,
      [
        issue(
          "POLICY_BUILD_BLOCKED",
          "policyBuild",
          "Raw intent and server evidence did not produce a validated activation policy."
        )
      ],
      true
    );
  }
  const resolvedAtMilliseconds = Date.parse(policyBuild.sourceBinding.resolvedAt);
  const bootstrapExpiresAtMilliseconds =
    resolvedAtMilliseconds + bootstrapOptions.bootstrapTtlSeconds * 1_000;
  const contextExpiresAtMilliseconds = Date.parse(policyBuild.sourceBinding.contextExpiresAt);
  const quoteValidUntilMilliseconds = Date.parse(policyBuild.sourceBinding.quoteValidUntil);
  const transactionDeadlineMilliseconds = policyBuild.policy.transactionDeadline * 1_000;
  const sessionExpiryMilliseconds = policyBuild.policy.expiry * 1_000;
  if (
    !Number.isSafeInteger(resolvedAtMilliseconds) ||
    !Number.isSafeInteger(bootstrapExpiresAtMilliseconds) ||
    !Number.isSafeInteger(contextExpiresAtMilliseconds) ||
    !Number.isSafeInteger(quoteValidUntilMilliseconds) ||
    !Number.isSafeInteger(transactionDeadlineMilliseconds) ||
    !Number.isSafeInteger(sessionExpiryMilliseconds) ||
    bootstrapExpiresAtMilliseconds >= contextExpiresAtMilliseconds ||
    bootstrapExpiresAtMilliseconds >= quoteValidUntilMilliseconds ||
    bootstrapExpiresAtMilliseconds >= transactionDeadlineMilliseconds ||
    bootstrapExpiresAtMilliseconds >= sessionExpiryMilliseconds
  ) {
    return blocked(
      null,
      [
        issue(
          "BOOTSTRAP_WINDOW_INVALID",
          "bootstrapOptions.bootstrapTtlSeconds",
          "The bootstrap window must end before context and quote expiry, the transaction deadline, and session expiry."
        )
      ],
      true
    );
  }

  const unparsedRequest = {
    schemaVersion: 1,
    userId: bootstrapOptions.userId,
    chainId: 97,
    walletAddress: policyBuild.policy.wallet,
    policyHash: policyBuild.policyHash,
    permissions: {
      calls: policyBuild.policy.calls.map(({ to, signature }) => ({ to, signature })),
      spend: policyBuild.policy.spend.map(({ token, limitRaw, period }) => ({
        token,
        limit: limitRaw,
        period
      }))
    },
    sessionExpiry: policyBuild.policy.expiry,
    bootstrapTtlSeconds: bootstrapOptions.bootstrapTtlSeconds
  };
  const request = altanaBootstrapRequestSchema.safeParse(unparsedRequest);
  if (!request.success) {
    return blocked(
      null,
      [
        issue(
          "BOOTSTRAP_REQUEST_INVALID",
          "bootstrapRequest",
          "The validated policy could not be represented as an exact Altana bootstrap request."
        )
      ],
      true
    );
  }

  let writeTargetAttestationResult: WriteTargetAttestationResult | null;
  try {
    writeTargetAttestationResult = parseEvaluatedWriteTargetResult(
      unparsedWriteTargetAttestationResult
    );
  } catch {
    writeTargetAttestationResult = null;
  }
  if (writeTargetAttestationResult === null) {
    return blocked(
      null,
      [
        issue(
          "WRITE_TARGET_ATTESTATION_INVALID",
          "writeTargetAttestationResult",
          "A strict, getter-free server-evaluated write-target attestation result is required."
        )
      ],
      true
    );
  }
  if (writeTargetAttestationResult.status !== "ready") {
    return blocked(
      null,
      [
        issue(
          "WRITE_TARGET_ATTESTATION_BLOCKED",
          "writeTargetAttestationResult.status",
          "A blocked write-target review cannot authorize an LP bootstrap handoff."
        )
      ],
      true
    );
  }
  if (!hasExactInternalWriteTargetBinding(writeTargetAttestationResult)) {
    return blocked(
      null,
      [
        issue(
          "WRITE_TARGET_ATTESTATION_BINDING_MISMATCH",
          "writeTargetAttestationResult",
          "The evaluated result does not preserve its exact content-addressed target and review binding."
        )
      ],
      true
    );
  }
  if (writeTargetAttestationResult.effectiveTarget.proxyKind !== "none") {
    return blocked(
      null,
      [
        issue(
          "WRITE_TARGET_PROXY_UNSUPPORTED",
          "writeTargetAttestationResult.effectiveTarget.proxyKind",
          "Milestone 1 permits only independently reviewed non-proxy write targets."
        )
      ],
      true
    );
  }
  const writeTargetBinding = writeTargetBindingForPolicy(policyBuild, writeTargetAttestationResult);
  if (writeTargetBinding === null) {
    return blocked(
      null,
      [
        issue(
          "WRITE_TARGET_ATTESTATION_BINDING_MISMATCH",
          "writeTargetAttestationResult.effectiveTarget",
          "The attested chain, Position Manager identity, canonical block, or runtime hash differs from the rebuilt LP policy."
        )
      ],
      true
    );
  }
  const expectedWriteTargetReviewId = bytes32Schema.safeParse(unparsedExpectedWriteTargetReviewId);
  if (
    !expectedWriteTargetReviewId.success ||
    writeTargetAttestationResult.attestation.reviewId !== expectedWriteTargetReviewId.data ||
    writeTargetAttestationResult.effectiveTarget.reviewId !== expectedWriteTargetReviewId.data
  ) {
    return blocked(
      null,
      [
        issue(
          "WRITE_TARGET_ATTESTATION_NOT_TRUSTED",
          "expectedWriteTargetReviewId",
          "The evaluated write-target review does not match the independently provisioned server trust root."
        )
      ],
      true
    );
  }

  let reservationDependency: AltanaLpDurableReservationDependency | null;
  try {
    reservationDependency = parseReservationDependency(unparsedReservationDependency);
  } catch {
    reservationDependency = null;
  }
  if (reservationDependency === null) {
    return blocked(
      null,
      [
        issue(
          "RESERVATION_DEPENDENCY_INVALID",
          "reservationDependency",
          "A strict server-only durable consume-or-read dependency is required."
        )
      ],
      true
    );
  }

  const reservationBinding = {
    contextId: policyBuild.sourceBinding.contextId,
    quoteId: policyBuild.sourceBinding.quoteId,
    userId: bootstrapOptions.userId,
    policyHash: policyBuild.policyHash,
    writeTargetBinding,
    consumedAt: policyBuild.sourceBinding.resolvedAt,
    expiresAt: new Date(bootstrapExpiresAtMilliseconds).toISOString()
  };
  const reservationRequest = deepFreeze(
    altanaLpReservationRequestSchema.parse({
      schemaVersion: 2,
      reservationId: deriveReservationId(reservationBinding),
      ...reservationBinding
    })
  );
  if (
    priorReservationRequest !== null &&
    !reservationRequestsMatch(priorReservationRequest, reservationRequest)
  ) {
    return blocked(
      null,
      [
        issue(
          "RECONCILIATION_REQUEST_MISMATCH",
          "priorReservationRequest",
          "The retained request does not exactly match the rebuilt intent, context, policy, bootstrap window, and attested write target."
        )
      ],
      true
    );
  }

  let unparsedReceipt: unknown;
  try {
    unparsedReceipt = await reservationDependency.consumeOrRead(reservationRequest);
  } catch (error) {
    return blocked(
      null,
      [
        issue(
          "RESERVATION_FAILED",
          "reservationDependency.consumeOrRead",
          "The durable reservation operation failed closed without exposing its error."
        )
      ],
      true,
      reservationOutcomeFromThrown(error),
      reservationRequest
    );
  }

  let receipt: AltanaLpReservationReceipt | null;
  try {
    receipt = parsePlainReservationReceipt(unparsedReceipt);
  } catch {
    receipt = null;
  }
  if (receipt === null) {
    return blocked(
      null,
      [
        issue(
          "RESERVATION_RECEIPT_INVALID",
          "reservationReceipt",
          "The durable reservation returned a malformed or non-JSON-safe receipt."
        )
      ],
      true,
      "unknown",
      reservationRequest
    );
  }

  const expectedConsumedAt = Date.parse(reservationRequest.consumedAt);
  const receiptConsumedAt = Date.parse(receipt.consumedAt);
  const receiptExpiresAt = Date.parse(receipt.expiresAt);
  if (receiptConsumedAt < expectedConsumedAt) {
    return blocked(
      null,
      [
        issue(
          "RESERVATION_RECEIPT_STALE",
          "reservationReceipt.consumedAt",
          "The reservation receipt predates this exact policy resolution."
        )
      ],
      true,
      "unknown",
      reservationRequest
    );
  }
  if (receiptConsumedAt > expectedConsumedAt) {
    return blocked(
      null,
      [
        issue(
          "RESERVATION_RECEIPT_FUTURE",
          "reservationReceipt.consumedAt",
          "The reservation receipt is dated after this exact policy resolution."
        )
      ],
      true,
      "unknown",
      reservationRequest
    );
  }
  if (receiptExpiresAt <= expectedConsumedAt || receiptExpiresAt <= receiptConsumedAt) {
    return blocked(
      null,
      [
        issue(
          "RESERVATION_RECEIPT_EXPIRED",
          "reservationReceipt.expiresAt",
          "The reservation receipt is already expired for this policy resolution."
        )
      ],
      true,
      "unknown",
      reservationRequest
    );
  }

  const bindingMatches =
    receipt.schemaVersion === reservationRequest.schemaVersion &&
    receipt.reservationId === reservationRequest.reservationId &&
    receipt.contextId === reservationRequest.contextId &&
    receipt.quoteId === reservationRequest.quoteId &&
    receipt.userId === reservationRequest.userId &&
    receipt.policyHash === reservationRequest.policyHash &&
    receipt.writeTargetBinding.chainId === reservationRequest.writeTargetBinding.chainId &&
    receipt.writeTargetBinding.address === reservationRequest.writeTargetBinding.address &&
    receipt.writeTargetBinding.runtimeCodeHash ===
      reservationRequest.writeTargetBinding.runtimeCodeHash &&
    receipt.writeTargetBinding.canonicalBlockNumber ===
      reservationRequest.writeTargetBinding.canonicalBlockNumber &&
    receipt.writeTargetBinding.canonicalBlockHash ===
      reservationRequest.writeTargetBinding.canonicalBlockHash &&
    receipt.writeTargetBinding.reviewId === reservationRequest.writeTargetBinding.reviewId &&
    receipt.writeTargetBinding.proxyKind === reservationRequest.writeTargetBinding.proxyKind &&
    receipt.consumedAt === reservationRequest.consumedAt &&
    receipt.expiresAt === reservationRequest.expiresAt;
  if (!bindingMatches) {
    return blocked(
      null,
      [
        issue(
          "RESERVATION_RECEIPT_MISMATCH",
          "reservationReceipt",
          "The durable receipt does not match the exact context, quote, user, policy, write target, and reservation window."
        )
      ],
      true,
      "unknown",
      reservationRequest
    );
  }

  const validationNow = policyClock();
  if (validationNow === null || validationNow.getTime() < expectedConsumedAt) {
    return blocked(
      null,
      [
        issue(
          "RESERVATION_CLOCK_INVALID",
          "policyOptions.now",
          "The post-reservation server clock must return a valid instant at or after policy resolution."
        )
      ],
      true,
      "committed_unusable",
      reservationRequest
    );
  }
  if (validationNow.getTime() >= receiptExpiresAt) {
    return blocked(
      null,
      [
        issue(
          "RESERVATION_RECEIPT_EXPIRED",
          "reservationReceipt.expiresAt",
          "The exact durable receipt expired before the handoff could be returned."
        )
      ],
      true,
      "committed_unusable",
      reservationRequest
    );
  }

  return deepFreeze(
    readyResultSchema.parse({
      status: "ready",
      policyBuild,
      bootstrapRequest: request.data,
      writeTargetBinding,
      reservationRequest,
      reservationReceipt: receipt,
      scopeBoundary: readyScopeBoundary,
      issues: []
    })
  );
}
