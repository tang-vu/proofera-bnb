import "server-only";

import { isProxy } from "node:util/types";

import {
  assessWriteTargetAttestation,
  type BuildLpActivationPolicyOptions,
  type WriteTargetAttestationResult
} from "@proofera/domain";
import type { Hex } from "viem";
import { z } from "zod";

import { altanaBootstrapRequestSchema } from "./altana-bootstrap";
import {
  buildAltanaLpBootstrapRequest,
  type AltanaLpPolicyHandoffResult
} from "./altana-lp-handoff";
import {
  isVerifiedAltanaLpDurableReservationDependency,
  type VerifiedAltanaLpDurableReservationDependency
} from "./altana-lp-reservation-capability.server";
import {
  buildPancakeV3TestnetWriteTargetAttestation,
  type BuildPancakeV3WriteTargetAttestationOptions,
  type PancakeV3WriteTargetAttestationBuildResult,
  type PancakeV3WriteTargetAttestationProvenance
} from "./pancake-v3-write-target-attestation.server";

const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const MAX_SNAPSHOT_DEPTH = 64;
const MAX_SNAPSHOT_NODES = 50_000;
const MAX_ISSUES = 16;

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

type ReadyWriteTargetAssessment = Extract<
  WriteTargetAttestationResult,
  { readonly status: "ready" }
>;
type ReadyHandoff = Extract<AltanaLpPolicyHandoffResult, { readonly status: "ready" }>;
type BlockedHandoff = Extract<AltanaLpPolicyHandoffResult, { readonly status: "blocked" }>;

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-f]{64}$/)
  .refine((value) => value !== ZERO_BYTES32)
  .transform((value) => value as Hex);

const policyOptionsDataSchema = z.strictObject({
  agentId: z
    .string()
    .min(12)
    .max(96)
    .regex(/^proofera:[a-z0-9][a-z0-9._:-]*$/),
  token0Symbol: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  token1Symbol: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  expectedContextId: bytes32Schema,
  contextNonce: bytes32Schema,
  quoteNonce: bytes32Schema,
  consumedContextIds: z.array(bytes32Schema).max(10_000),
  consumedQuoteIds: z.array(bytes32Schema).max(10_000)
});

const bootstrapOptionsSchema = z.strictObject({
  userId: altanaBootstrapRequestSchema.shape.userId,
  bootstrapTtlSeconds: altanaBootstrapRequestSchema.shape.bootstrapTtlSeconds
});

const writeTargetOptionsDataSchema = z.strictObject({
  trustedSourceReviewCompletion: z.unknown(),
  expectedExactBlockObservationReviewId: bytes32Schema,
  expectedObserverIdentity: z.string().min(3).max(160),
  expectedObserverPublicSourceUrl: z.string().min(1).max(2_048),
  expectedObservationEvidenceLocator: z.string().min(1).max(2_048),
  expectedObservationEvidenceSha256: bytes32Schema,
  expectedSelectorReviewId: bytes32Schema,
  expectedSelectorReviewerIdentity: z.string().min(3).max(160),
  expectedSelectorRetrieverIdentity: z.string().min(3).max(160),
  expectedWriteTargetReviewId: bytes32Schema,
  expectedAttestedAt: z.string().min(1).max(64)
});

type PolicyOptionsData = z.infer<typeof policyOptionsDataSchema>;
type BootstrapOptionsData = z.infer<typeof bootstrapOptionsSchema>;
type WriteTargetOptionsData = z.infer<typeof writeTargetOptionsDataSchema>;

export interface BuildAltanaLpActivationCompositionOptions {
  readonly now: () => Date;
  readonly policy: PolicyOptionsData;
  readonly bootstrap: BootstrapOptionsData;
  readonly writeTarget: WriteTargetOptionsData;
}

export interface AltanaLpActivationCompositionDependencies {
  readonly durableReservation: VerifiedAltanaLpDurableReservationDependency;
}

interface InspectedOptions {
  readonly now: () => unknown;
  readonly policy: PolicyOptionsData;
  readonly bootstrap: BootstrapOptionsData;
  readonly writeTarget: WriteTargetOptionsData;
}

export type AltanaLpActivationCompositionIssueCode =
  | "OPTIONS_INVALID"
  | "DEPENDENCIES_INVALID"
  | "CLOCK_INVALID"
  | "RAW_INPUT_INVALID"
  | "WRITE_TARGET_COMPOSITION_BLOCKED"
  | "WRITE_TARGET_REASSESSMENT_BLOCKED"
  | "HANDOFF_BLOCKED"
  | "INTERNAL_VALIDATION_ERROR";

export interface AltanaLpActivationCompositionIssue {
  readonly code: AltanaLpActivationCompositionIssueCode;
  readonly stage: "composition" | "write_target" | "domain_reassessment" | "handoff";
  readonly sourceCode: string | null;
  readonly path: string;
  readonly message: string;
}

type ReservationOutcome =
  "not_attempted" | "rolled_back" | "committed_unusable" | "unknown" | "validated";

interface CompositionBoundary {
  readonly rawEvidenceRebuilt: boolean;
  readonly writeTargetDomainReassessed: boolean;
  readonly rawIntentPolicyRebuilt: boolean;
  readonly bootstrapRequestCreated: boolean;
  readonly durableReservationDependencyInvoked: boolean;
  readonly durableReservationOutcome: ReservationOutcome;
  readonly reservationReceiptValidated: boolean;
  readonly sessionKeyCreated: false;
  readonly secretHandleCreated: false;
  readonly bootstrapPersisted: false;
  readonly authorityCreated: false;
  readonly walletSignatureRequested: false;
  readonly transactionCalldataCreated: false;
  readonly transactionSubmitted: false;
  readonly blockchainWritePerformed: false;
  readonly executionPerformed: false;
  readonly httpFetchPerformed: false;
  readonly walletStateReadPerformed: false;
  readonly walletOrSessionSecretMaterialReadPerformed: false;
  readonly scope: "validated_altana_lp_bootstrap_and_durable_reservation_only";
}

export interface AltanaLpActivationCompositionWriteTarget {
  readonly attestation: ReadyWriteTargetAssessment["attestation"];
  readonly effectiveTarget: ReadyWriteTargetAssessment["effectiveTarget"];
  readonly provenance: PancakeV3WriteTargetAttestationProvenance;
}

export type AltanaLpActivationCompositionResult = DeepReadonly<
  | {
      status: "blocked";
      writeTarget: null;
      handoff: BlockedHandoff | null;
      issues: readonly AltanaLpActivationCompositionIssue[];
      boundary: CompositionBoundary;
    }
  | {
      status: "activation_bootstrap_reserved_no_authority";
      writeTarget: AltanaLpActivationCompositionWriteTarget;
      handoff: ReadyHandoff;
      issues: readonly never[];
      boundary: CompositionBoundary;
    }
>;

type SnapshotResult =
  Readonly<{ success: true; data: unknown }> | Readonly<{ success: false; reason: string }>;

function snapshotExactJson(value: unknown): SnapshotResult {
  let nodes = 0;
  const ancestors = new Set<object>();

  function visit(current: unknown, depth: number): SnapshotResult {
    nodes += 1;
    if (nodes > MAX_SNAPSHOT_NODES) return { success: false, reason: "node_limit" };
    if (depth > MAX_SNAPSHOT_DEPTH) return { success: false, reason: "depth_limit" };
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean" ||
      (typeof current === "number" && Number.isFinite(current))
    ) {
      return { success: true, data: current };
    }
    if (typeof current !== "object") return { success: false, reason: "non_json_value" };
    if (ancestors.has(current)) return { success: false, reason: "cycle" };
    if (isProxy(current)) return { success: false, reason: "proxy" };
    const prototype = Object.getPrototypeOf(current);
    const isArray = Array.isArray(current);
    if (
      (isArray && prototype !== Array.prototype) ||
      (!isArray && prototype !== Object.prototype && prototype !== null)
    ) {
      return { success: false, reason: "non_plain_object" };
    }
    const keys = Reflect.ownKeys(current);
    if (keys.some((key) => typeof key === "symbol")) {
      return { success: false, reason: "symbol_key" };
    }
    const descriptors = Object.getOwnPropertyDescriptors(current);
    for (const key of keys as string[]) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        return { success: false, reason: "dangerous_key" };
      }
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || descriptor.get !== undefined) {
        return { success: false, reason: "accessor" };
      }
      if (key !== "length" && descriptor.enumerable !== true) {
        return { success: false, reason: "hidden_property" };
      }
    }

    ancestors.add(current);
    try {
      if (isArray) {
        const stringKeys = keys as string[];
        if (
          stringKeys.some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)) ||
          stringKeys.length !== current.length + 1
        ) {
          return { success: false, reason: "invalid_array" };
        }
        const output: unknown[] = [];
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (descriptor === undefined || !("value" in descriptor)) {
            return { success: false, reason: "sparse_array" };
          }
          const child = visit(descriptor.value, depth + 1);
          if (!child.success) return child;
          output.push(child.data);
        }
        return { success: true, data: output };
      }

      const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of keys as string[]) {
        const descriptor = descriptors[key];
        if (descriptor === undefined || !("value" in descriptor)) {
          return { success: false, reason: "accessor" };
        }
        const child = visit(descriptor.value, depth + 1);
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
      ancestors.delete(current);
    }
  }

  try {
    return visit(value, 0);
  } catch {
    return { success: false, reason: "snapshot_error" };
  }
}

type RawInputSnapshots = Readonly<{
  intent: unknown;
  serverContext: unknown;
  exactBlockObservation: unknown;
  selectorArtifactBatch: unknown;
  priorReservationRequest: unknown;
}>;

type RawInputSnapshotResult =
  | Readonly<{ success: true; data: RawInputSnapshots }>
  | Readonly<{ success: false; path: string; reason: string }>;

function snapshotRawInputs(
  intent: unknown,
  serverContext: unknown,
  exactBlockObservation: unknown,
  selectorArtifactBatch: unknown,
  priorReservationRequest: unknown
): RawInputSnapshotResult {
  const required = [
    ["rawIntentInput", intent],
    ["rawServerContextInput", serverContext],
    ["rawExactBlockObservationInput", exactBlockObservation],
    ["rawPrefetchedSelectorArtifactBatchInput", selectorArtifactBatch]
  ] as const;
  const snapshots: unknown[] = [];
  for (const [path, value] of required) {
    const snapshot = snapshotExactJson(value);
    if (!snapshot.success) return { success: false, path, reason: snapshot.reason };
    snapshots.push(snapshot.data);
  }

  let priorSnapshot: unknown = undefined;
  if (priorReservationRequest !== undefined) {
    const snapshot = snapshotExactJson(priorReservationRequest);
    if (!snapshot.success) {
      return {
        success: false,
        path: "priorReservationRequestInput",
        reason: snapshot.reason
      };
    }
    priorSnapshot = snapshot.data;
  }

  return {
    success: true,
    data: {
      intent: snapshots[0],
      serverContext: snapshots[1],
      exactBlockObservation: snapshots[2],
      selectorArtifactBatch: snapshots[3],
      priorReservationRequest: priorSnapshot
    }
  };
}

function inspectOptions(value: unknown): InspectedOptions | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    if (isProxy(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) return null;
    const expectedKeys = ["bootstrap", "now", "policy", "writeTarget"];
    const stringKeys = (keys as string[]).sort();
    if (
      stringKeys.length !== expectedKeys.length ||
      stringKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of expectedKeys) {
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
    }
    const now = descriptors.now?.value;
    if (typeof now !== "function" || isProxy(now)) return null;
    const policySnapshot = snapshotExactJson(descriptors.policy?.value);
    const bootstrapSnapshot = snapshotExactJson(descriptors.bootstrap?.value);
    const writeTargetSnapshot = snapshotExactJson(descriptors.writeTarget?.value);
    if (!policySnapshot.success || !bootstrapSnapshot.success || !writeTargetSnapshot.success) {
      return null;
    }
    const policy = policyOptionsDataSchema.safeParse(policySnapshot.data);
    const bootstrap = bootstrapOptionsSchema.safeParse(bootstrapSnapshot.data);
    const writeTarget = writeTargetOptionsDataSchema.safeParse(writeTargetSnapshot.data);
    if (!policy.success || !bootstrap.success || !writeTarget.success) return null;
    const nowFunction = now as (...arguments_: readonly unknown[]) => unknown;
    return {
      now: () => Reflect.apply(nowFunction, undefined, []),
      policy: policy.data,
      bootstrap: bootstrap.data,
      writeTarget: writeTarget.data
    };
  } catch {
    return null;
  }
}

function inspectDependencies(value: unknown): AltanaLpActivationCompositionDependencies | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    if (isProxy(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 1 || keys[0] !== "durableReservation") return null;
    const outer = Object.getOwnPropertyDescriptor(value, "durableReservation");
    if (
      outer === undefined ||
      outer.enumerable !== true ||
      !("value" in outer) ||
      outer.get !== undefined ||
      outer.set !== undefined
    ) {
      return null;
    }
    const dependency = outer.value;
    if (!isVerifiedAltanaLpDurableReservationDependency(dependency)) return null;
    return { durableReservation: dependency };
  } catch {
    return null;
  }
}

function captureNow(now: () => unknown): number | null {
  try {
    const value = now();
    if (typeof value === "object" && value !== null && isProxy(value)) return null;
    if (!(value instanceof Date) || Object.getPrototypeOf(value) !== Date.prototype) return null;
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isFinite(milliseconds) ? milliseconds : null;
  } catch {
    return null;
  }
}

function sampleOrdinaryDate(now: () => unknown): Date | null {
  const milliseconds = captureNow(now);
  return milliseconds === null ? null : new Date(milliseconds);
}

function handoffFreshnessClock(
  externalNow: () => unknown,
  capturedInitialMilliseconds: number,
  reconciliation: boolean
): () => unknown {
  let handoffCalls = 0;
  let monotonicFloorMilliseconds = capturedInitialMilliseconds;
  return Object.freeze((): unknown => {
    handoffCalls += 1;
    if (!reconciliation && handoffCalls === 1) {
      return new Date(capturedInitialMilliseconds);
    }
    const sampled = sampleOrdinaryDate(externalNow);
    if (sampled === null) return null;
    const sampledMilliseconds = sampled.getTime();
    if (sampledMilliseconds < monotonicFloorMilliseconds) return null;
    monotonicFloorMilliseconds = sampledMilliseconds;
    return sampled;
  });
}

function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<Value>;
}

function issue(
  code: AltanaLpActivationCompositionIssueCode,
  stage: AltanaLpActivationCompositionIssue["stage"],
  path: string,
  message: string,
  sourceCode: string | null = null
): AltanaLpActivationCompositionIssue {
  return {
    code,
    stage,
    sourceCode:
      sourceCode === null ? null : sourceCode.replace(/[^A-Z0-9_]/g, "_").slice(0, 96) || "UNKNOWN",
    path: path.replace(/[^A-Za-z0-9_.\[\]-]/g, "_").slice(0, 240) || "unknown",
    message: message.slice(0, 320)
  };
}

const actionBoundary = Object.freeze({
  sessionKeyCreated: false,
  secretHandleCreated: false,
  bootstrapPersisted: false,
  authorityCreated: false,
  walletSignatureRequested: false,
  transactionCalldataCreated: false,
  transactionSubmitted: false,
  blockchainWritePerformed: false,
  executionPerformed: false,
  httpFetchPerformed: false,
  walletStateReadPerformed: false,
  walletOrSessionSecretMaterialReadPerformed: false,
  scope: "validated_altana_lp_bootstrap_and_durable_reservation_only"
} as const);

function boundary(
  values: Readonly<{
    rawEvidenceRebuilt: boolean;
    writeTargetDomainReassessed: boolean;
    rawIntentPolicyRebuilt: boolean;
    bootstrapRequestCreated: boolean;
    durableReservationDependencyInvoked: boolean;
    durableReservationOutcome: ReservationOutcome;
    reservationReceiptValidated: boolean;
  }>
): CompositionBoundary {
  return { ...values, ...actionBoundary };
}

function blocked(
  issues: readonly AltanaLpActivationCompositionIssue[],
  handoff: BlockedHandoff | null = null,
  state: Partial<
    Pick<
      CompositionBoundary,
      | "rawEvidenceRebuilt"
      | "writeTargetDomainReassessed"
      | "rawIntentPolicyRebuilt"
      | "bootstrapRequestCreated"
      | "durableReservationDependencyInvoked"
      | "durableReservationOutcome"
      | "reservationReceiptValidated"
    >
  > = {}
): AltanaLpActivationCompositionResult {
  const retained = [...issues].slice(0, MAX_ISSUES);
  if (retained.length === 0) {
    retained.push(
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "composition",
        "composition",
        "Activation composition blocked without a specific validation issue."
      )
    );
  }
  return deepFreeze({
    status: "blocked" as const,
    writeTarget: null,
    handoff,
    issues: retained,
    boundary: boundary({
      rawEvidenceRebuilt: state.rawEvidenceRebuilt ?? false,
      writeTargetDomainReassessed: state.writeTargetDomainReassessed ?? false,
      rawIntentPolicyRebuilt: state.rawIntentPolicyRebuilt ?? false,
      bootstrapRequestCreated: state.bootstrapRequestCreated ?? false,
      durableReservationDependencyInvoked: state.durableReservationDependencyInvoked ?? false,
      durableReservationOutcome: state.durableReservationOutcome ?? "not_attempted",
      reservationReceiptValidated: state.reservationReceiptValidated ?? false
    })
  });
}

function composerIssues(
  result: Extract<PancakeV3WriteTargetAttestationBuildResult, { readonly status: "blocked" }>
): readonly AltanaLpActivationCompositionIssue[] {
  return result.issues.map((entry) =>
    issue(
      "WRITE_TARGET_COMPOSITION_BLOCKED",
      "write_target",
      entry.path,
      entry.message,
      entry.upstreamCode ?? entry.code
    )
  );
}

function reassessmentIssues(
  result: Extract<WriteTargetAttestationResult, { readonly status: "blocked" }>
): readonly AltanaLpActivationCompositionIssue[] {
  return result.issues.map((entry) =>
    issue(
      "WRITE_TARGET_REASSESSMENT_BLOCKED",
      "domain_reassessment",
      entry.path,
      entry.message,
      entry.code
    )
  );
}

function handoffIssues(
  result: Extract<AltanaLpPolicyHandoffResult, { readonly status: "blocked" }>
): readonly AltanaLpActivationCompositionIssue[] {
  return result.issues.map((entry) =>
    issue("HANDOFF_BLOCKED", "handoff", entry.path, entry.message, entry.code)
  );
}

function composerOptions(
  data: WriteTargetOptionsData,
  sameTimeClock: () => Date
): BuildPancakeV3WriteTargetAttestationOptions {
  return { ...data, now: sameTimeClock };
}

function policyOptions(
  data: PolicyOptionsData,
  freshnessClock: () => unknown
): BuildLpActivationPolicyOptions {
  return { ...data, now: freshnessClock };
}

/**
 * Rebuilds the complete write-target and policy trust chain from raw inputs. The only stateful
 * operation is the injected durable context/quote reservation performed by the existing handoff.
 * It never accepts an evaluated attestation and never creates authority, secrets, calldata, or a
 * blockchain transaction.
 */
export async function buildAltanaLpActivationComposition(
  rawIntentInput: unknown,
  rawServerContextInput: unknown,
  rawExactBlockObservationInput: unknown,
  rawPrefetchedSelectorArtifactBatchInput: unknown,
  optionsInput: unknown,
  dependenciesInput: unknown,
  priorReservationRequestInput?: unknown
): Promise<AltanaLpActivationCompositionResult> {
  const options = inspectOptions(optionsInput);
  if (options === null) {
    return blocked([
      issue(
        "OPTIONS_INVALID",
        "composition",
        "options",
        "Strict server-owned write-target, policy, bootstrap, and clock options are required."
      )
    ]);
  }
  const dependencies = inspectDependencies(dependenciesInput);
  if (dependencies === null) {
    return blocked([
      issue(
        "DEPENDENCIES_INVALID",
        "composition",
        "dependencies",
        "A strict server-only durable reservation dependency is required."
      )
    ]);
  }
  const capturedNowMs = captureNow(options.now);
  if (capturedNowMs === null) {
    return blocked([
      issue(
        "CLOCK_INVALID",
        "composition",
        "options.now",
        "The external clock must return a valid ordinary Date."
      )
    ]);
  }

  const rawInputs = snapshotRawInputs(
    rawIntentInput,
    rawServerContextInput,
    rawExactBlockObservationInput,
    rawPrefetchedSelectorArtifactBatchInput,
    priorReservationRequestInput
  );
  if (!rawInputs.success) {
    return blocked([
      issue(
        "RAW_INPUT_INVALID",
        "composition",
        rawInputs.path,
        "Raw activation inputs must be strict, accessor-free JSON data.",
        `SNAPSHOT_${rawInputs.reason.toUpperCase()}`
      )
    ]);
  }
  const sameTimeClock = Object.freeze(() => new Date(capturedNowMs));
  const reconciliation =
    rawInputs.data.priorReservationRequest !== undefined &&
    rawInputs.data.priorReservationRequest !== null;
  const handoffClock = handoffFreshnessClock(options.now, capturedNowMs, reconciliation);

  let writeTargetComposition: PancakeV3WriteTargetAttestationBuildResult;
  try {
    writeTargetComposition = buildPancakeV3TestnetWriteTargetAttestation(
      rawInputs.data.exactBlockObservation,
      rawInputs.data.selectorArtifactBatch,
      composerOptions(options.writeTarget, sameTimeClock)
    );
  } catch {
    return blocked([
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "write_target",
        "writeTargetComposition",
        "Write-target composition failed closed without exposing an internal error."
      )
    ]);
  }
  if (writeTargetComposition.status === "blocked") {
    return blocked(composerIssues(writeTargetComposition));
  }

  const reassessed = assessWriteTargetAttestation(writeTargetComposition.attestation, {
    asOf: sameTimeClock,
    expectedReviewId: options.writeTarget.expectedWriteTargetReviewId
  });
  if (reassessed.status === "blocked") {
    return blocked(reassessmentIssues(reassessed), null, { rawEvidenceRebuilt: true });
  }

  let handoff: AltanaLpPolicyHandoffResult;
  try {
    handoff = await buildAltanaLpBootstrapRequest(
      rawInputs.data.intent,
      rawInputs.data.serverContext,
      policyOptions(options.policy, handoffClock),
      options.bootstrap,
      reassessed,
      options.writeTarget.expectedWriteTargetReviewId,
      dependencies.durableReservation,
      rawInputs.data.priorReservationRequest
    );
  } catch {
    return blocked(
      [
        issue(
          "INTERNAL_VALIDATION_ERROR",
          "handoff",
          "handoff",
          "Activation handoff failed closed without exposing an internal error."
        )
      ],
      null,
      {
        rawEvidenceRebuilt: true,
        writeTargetDomainReassessed: true,
        durableReservationOutcome: "unknown"
      }
    );
  }

  if (handoff.status === "blocked") {
    const invoked = handoff.reservationRequest !== null;
    return blocked(handoffIssues(handoff), handoff, {
      rawEvidenceRebuilt: true,
      writeTargetDomainReassessed: true,
      rawIntentPolicyRebuilt: handoff.scopeBoundary.rawIntentReResolved,
      durableReservationDependencyInvoked: invoked,
      durableReservationOutcome: handoff.scopeBoundary.reservationOutcome,
      reservationReceiptValidated: false
    });
  }

  const postReservationMilliseconds = captureNow(handoffClock);
  if (postReservationMilliseconds === null) {
    return blocked(
      [
        issue(
          "HANDOFF_BLOCKED",
          "handoff",
          "options.now",
          "The write target could not be revalidated after the durable reservation.",
          "RESERVATION_CLOCK_INVALID"
        )
      ],
      null,
      {
        rawEvidenceRebuilt: true,
        writeTargetDomainReassessed: true,
        rawIntentPolicyRebuilt: true,
        bootstrapRequestCreated: true,
        durableReservationDependencyInvoked: true,
        durableReservationOutcome: "committed_unusable",
        reservationReceiptValidated: true
      }
    );
  }

  const reservationExpiresAtMilliseconds = Date.parse(handoff.reservationReceipt.expiresAt);
  if (
    !Number.isSafeInteger(reservationExpiresAtMilliseconds) ||
    postReservationMilliseconds >= reservationExpiresAtMilliseconds
  ) {
    return blocked(
      [
        issue(
          "HANDOFF_BLOCKED",
          "handoff",
          "reservationReceipt.expiresAt",
          "The durable reservation expired before final write-target revalidation completed.",
          "RESERVATION_RECEIPT_EXPIRED"
        )
      ],
      null,
      {
        rawEvidenceRebuilt: true,
        writeTargetDomainReassessed: true,
        rawIntentPolicyRebuilt: true,
        bootstrapRequestCreated: true,
        durableReservationDependencyInvoked: true,
        durableReservationOutcome: "committed_unusable",
        reservationReceiptValidated: true
      }
    );
  }

  const postReservationAssessment = assessWriteTargetAttestation(
    writeTargetComposition.attestation,
    {
      asOf: () => new Date(postReservationMilliseconds),
      expectedReviewId: options.writeTarget.expectedWriteTargetReviewId
    }
  );
  if (postReservationAssessment.status === "blocked") {
    return blocked(reassessmentIssues(postReservationAssessment), null, {
      rawEvidenceRebuilt: true,
      writeTargetDomainReassessed: true,
      rawIntentPolicyRebuilt: true,
      bootstrapRequestCreated: true,
      durableReservationDependencyInvoked: true,
      durableReservationOutcome: "committed_unusable",
      reservationReceiptValidated: true
    });
  }

  const readyWriteTarget: AltanaLpActivationCompositionWriteTarget = {
    attestation: postReservationAssessment.attestation,
    effectiveTarget: postReservationAssessment.effectiveTarget,
    provenance: writeTargetComposition.provenance
  };
  return deepFreeze({
    status: "activation_bootstrap_reserved_no_authority" as const,
    writeTarget: readyWriteTarget,
    handoff,
    issues: [] as const,
    boundary: boundary({
      rawEvidenceRebuilt: true,
      writeTargetDomainReassessed: true,
      rawIntentPolicyRebuilt: true,
      bootstrapRequestCreated: true,
      durableReservationDependencyInvoked: true,
      durableReservationOutcome: "validated",
      reservationReceiptValidated: true
    })
  });
}
