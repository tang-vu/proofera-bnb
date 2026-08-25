import "server-only";

import { createHash } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import type { Hex } from "viem";

import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
  BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
  type BscTestnetPtaWbnbPoolRecoveryAttemptBinding
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse,
  type BscTestnetPtaWbnbPoolSubmissionCapability,
  type BscTestnetPtaWbnbPoolSubmissionJournal,
  type BscTestnetPtaWbnbPoolSubmissionJournalState,
  type BscTestnetPtaWbnbPoolSubmissionStartedRequest,
  type BscTestnetPtaWbnbPoolTerminalReconciliationJournal,
  type BscTestnetPtaWbnbPoolTerminalReconciliationRequest
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function isOutsideRepository(candidate: string): boolean {
  const relation = relative(REPOSITORY_ROOT, candidate);
  return (
    relation !== "" &&
    (isAbsolute(relation) || relation === ".." || relation.startsWith(`..${sep}`))
  );
}
const SUBDIRECTORY = ["ProofEra", "operations", "bsc-testnet-pta-wbnb-pool-submission-v6"] as const;
const GENERATION_5_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-submission-v5"
] as const;
const GENERATION_4_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-submission-v4"
] as const;
const GENERATION_3_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-submission-v3"
] as const;
const PREDECESSOR_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-submission-v2"
] as const;
const SCHEMA = "bsc_testnet_pta_wbnb_pool_submission_journal_v8" as const;
const SIGNED_COMMIT_FILE = "01-signed-commit.v8.json" as const;
const SUBMISSION_STARTED_FILE = "02-submission-started.v8.json" as const;
const TERMINAL_RECONCILIATION_FILE = "03-terminal-reconciliation.v8.json" as const;
const FILES = Object.freeze([
  SIGNED_COMMIT_FILE,
  SUBMISSION_STARTED_FILE,
  TERMINAL_RECONCILIATION_FILE
] as const);
const PREDECESSOR_FILES = Object.freeze([
  "01-signed-commit.v4.json",
  "02-submission-started.v4.json",
  "03-terminal-reconciliation.v4.json"
] as const);
const GENERATION_3_FILES = Object.freeze([
  "01-signed-commit.v5.json",
  "02-submission-started.v5.json",
  "03-terminal-reconciliation.v5.json"
] as const);
const GENERATION_4_FILES = Object.freeze([
  "01-signed-commit.v6.json",
  "02-submission-started.v6.json",
  "03-terminal-reconciliation.v6.json"
] as const);
const GENERATION_5_FILES = Object.freeze([
  "01-signed-commit.v7.json",
  "02-submission-started.v7.json",
  "03-terminal-reconciliation.v7.json"
] as const);

function isJournalFileName(value: string): boolean {
  return FILES.some((name) => name === value);
}

function isPredecessorJournalFileName(value: string): boolean {
  return PREDECESSOR_FILES.some((name) => name === value);
}

function isGeneration3JournalFileName(value: string): boolean {
  return GENERATION_3_FILES.some((name) => name === value);
}

function isGeneration4JournalFileName(value: string): boolean {
  return GENERATION_4_FILES.some((name) => name === value);
}

function isGeneration5JournalFileName(value: string): boolean {
  return GENERATION_5_FILES.some((name) => name === value);
}
const MAXIMUM_RECORD_BYTES = 32_768;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const RELEASE_COMMIT = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V8_POLICY = Object.freeze({
  schemaVersion: 8 as const,
  kind: "exact_owner_recovery_generation_7_signature_and_single_broadcast_authorization_v8" as const,
  decision:
    "authorize_fresh_chain_97_pool_recovery_generation_7_signature_and_single_broadcast" as const,
  broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity" as const,
  liquidityActionAuthorized: false as const,
  oneSignatureMaximum: true as const,
  oneSubmissionMaximum: true as const,
  retryAllowed: false as const,
  replacementAllowed: false as const,
  rebroadcastAfterAmbiguityAllowed: false as const,
  reconciliationOnlyAfterSubmissionStarted: true as const,
  journalAuthenticatesAuthority: false as const
});

export type BscTestnetPtaWbnbPoolDurableOwnerV8Policy =
  typeof BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V8_POLICY;

export interface BscTestnetPtaWbnbPoolDurableSignedCommitRequest {
  readonly schemaVersion: 7;
  readonly kind: "authenticated_owner_recovery_generation_7_signed_submission_commit_v7";
  readonly ownerAuthorizationPolicy: BscTestnetPtaWbnbPoolDurableOwnerV8Policy;
  /**
   * The caller has already authenticated this capability. The journal validates and retains its
   * exact bytes as recovery evidence; persisted bytes never recreate that object capability.
   */
  readonly capability: BscTestnetPtaWbnbPoolSubmissionCapability;
}

export type BscTestnetPtaWbnbPoolSubmissionRecoveryState =
  | Readonly<{ state: "empty" }>
  | Readonly<{
      state: "unknown_outcome";
      capability: BscTestnetPtaWbnbPoolSubmissionCapability | null;
      ownerAuthorizationPolicy: BscTestnetPtaWbnbPoolDurableOwnerV8Policy | null;
      signedCommitSha256: Hex | null;
      submissionStartedRecordSha256: Hex | null;
      journalEvidenceOnly: true;
      authorityReauthenticationRequired: true;
      sendingAuthorizedByJournal: false;
    }>
  | Readonly<{
      schemaVersion: 7;
      journalSchema: typeof SCHEMA;
      state: "signed_committed" | "submission_started" | "confirmed" | "reverted";
      ownerAuthorizationPolicy: BscTestnetPtaWbnbPoolDurableOwnerV8Policy;
      capability: BscTestnetPtaWbnbPoolSubmissionCapability;
      signedCommitSha256: Hex;
      submissionStartedRecordSha256: Hex | null;
      reconciliationDigest: Hex | null;
      journalEvidenceOnly: true;
      authorityReauthenticationRequired: true;
      sendingAuthorizedByJournal: false;
    }>;

export type BscTestnetPtaWbnbPoolSubmissionTerminalRecoveryState =
  | Extract<BscTestnetPtaWbnbPoolSubmissionRecoveryState, Readonly<{ state: "unknown_outcome" }>>
  | (Extract<BscTestnetPtaWbnbPoolSubmissionRecoveryState, Readonly<{ schemaVersion: 7 }>> &
      Readonly<{ state: "submission_started" }>);

const BINDING_KEYS = [
  "claimId",
  "envelopeHash",
  "operationKey",
  "ownerAuthorizationDigest",
  "recovery",
  "releaseCommit",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "signedTransactionKeccak256",
  "signingHash",
  "submissionStartedDigest",
  "transactionHash"
] as const;
const INITIAL_KEYS = [...BINDING_KEYS, "schemaVersion", "state"] as const;
const START_KEYS = [...BINDING_KEYS, "operation", "schemaVersion"] as const;
const TERMINAL_KEYS = [
  ...BINDING_KEYS,
  "operation",
  "outcome",
  "reconciliationDigest",
  "schemaVersion"
] as const;

const POLICY_KEYS = [
  "broadcastPolicy",
  "decision",
  "journalAuthenticatesAuthority",
  "kind",
  "liquidityActionAuthorized",
  "oneSignatureMaximum",
  "oneSubmissionMaximum",
  "rebroadcastAfterAmbiguityAllowed",
  "reconciliationOnlyAfterSubmissionStarted",
  "replacementAllowed",
  "retryAllowed",
  "schemaVersion"
] as const;
const SIGNED_COMMIT_REQUEST_KEYS = [
  "capability",
  "kind",
  "ownerAuthorizationPolicy",
  "schemaVersion"
] as const;
const CAPABILITY_KEYS = [
  "authenticatedAt",
  "claimId",
  "envelopeHash",
  "expiresAt",
  "freshPreSubmissionDualRpcRecheckPerformed",
  "oneShotIntentId",
  "operation",
  "operationKey",
  "ownerAuthorizationDigest",
  "preSubmission",
  "recovery",
  "releaseCommit",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "schemaVersion",
  "scope",
  "signedCommitDurablyVerified",
  "transaction"
] as const;
const RECOVERY_KEYS = [
  "attemptId",
  "generation",
  "predecessorTerminalRawSha256",
  "predecessorState"
] as const;
const PRE_SUBMISSION_KEYS = [
  "candidateCode",
  "candidateNonce",
  "canonicalFinalizedBlockVerified",
  "corroboratorOrigin",
  "factoryPoolForward",
  "factoryPoolReverse",
  "finalizedAnchorDualProviderExactNumberVerified",
  "finalizedBlockGasLimit",
  "finalizedBlockHash",
  "finalizedBlockNumber",
  "finalizedBlockTimestamp",
  "gasEstimate",
  "gasPriceWei",
  "latestNonce",
  "observedAt",
  "pendingNonce",
  "primaryOrigin",
  "providerAgreementVerified",
  "receiptByHash",
  "senderBalanceWei",
  "senderCode",
  "simulationReturnPool",
  "transactionByHash"
] as const;
const CAPABILITY_TRANSACTION_KEYS = [
  "chainId",
  "data",
  "from",
  "gasLimit",
  "gasPriceWei",
  "maximumCostWei",
  "nonce",
  "recoveredSigner",
  "signedTransaction",
  "signingHash",
  "to",
  "transactionHash",
  "type",
  "valueWei"
] as const;

type DataRecord = Readonly<Record<string, unknown>>;
type Binding = Pick<
  BscTestnetPtaWbnbPoolSubmissionJournalState,
  | "claimId"
  | "operationKey"
  | "envelopeHash"
  | "releaseCommit"
  | "runtimeManifestSha256"
  | "reviewerApprovalDigest"
  | "ownerAuthorizationDigest"
  | "recovery"
  | "signingHash"
  | "transactionHash"
  | "signedTransactionKeccak256"
  | "submissionStartedDigest"
>;

type SignedCommitRecord = Readonly<{
  schema: typeof SCHEMA;
  kind: "signed_commit";
  recordedAt: string;
  ownerAuthorizationPolicy: BscTestnetPtaWbnbPoolDurableOwnerV8Policy;
  capability: BscTestnetPtaWbnbPoolSubmissionCapability;
  journalEvidenceOnly: true;
}>;

type SubmissionStartedRecord = Readonly<
  Binding & {
    schema: typeof SCHEMA;
    kind: "submission_started";
    recordedAt: string;
    signedCommitSha256: Hex;
  }
>;

type TerminalRecord = Readonly<
  Binding & {
    schema: typeof SCHEMA;
    kind: "confirmed" | "reverted";
    recordedAt: string;
    signedCommitSha256: Hex;
    submissionStartedRecordSha256: Hex;
    reconciliationDigest: Hex;
  }
>;

export interface BscTestnetPtaWbnbPoolSubmissionJournalPorts {
  readonly now: () => Date;
  readonly listNames: () => Promise<readonly string[]>;
  readonly readBounded: (name: string) => Promise<string | null>;
  readonly createExclusive: (name: string, content: string) => Promise<"created" | "exists">;
  readonly assertSecure: (existingFiles: readonly string[]) => Promise<boolean>;
}

export interface BscTestnetPtaWbnbPoolDurableSubmissionJournal extends BscTestnetPtaWbnbPoolSubmissionJournal {
  readonly initializeSignedCommit: (
    request: BscTestnetPtaWbnbPoolDurableSignedCommitRequest
  ) => Promise<Readonly<{ status: "initialized_by_this_call" | "already_initialized" }>>;
  readonly readRecoveryState: () => Promise<BscTestnetPtaWbnbPoolSubmissionRecoveryState>;
}

export interface BscTestnetPtaWbnbPoolSubmissionJournalRecoveryReader {
  readonly readRecoveryState: () => Promise<BscTestnetPtaWbnbPoolSubmissionRecoveryState>;
  /** Null means the retained on-disk sequence is not a complete, strictly valid recovery state. */
  readonly readStrictRecoveryState: () => Promise<BscTestnetPtaWbnbPoolSubmissionRecoveryState | null>;
}

export type BscTestnetPtaWbnbPoolSubmissionTerminalRecoveryJournal =
  BscTestnetPtaWbnbPoolTerminalReconciliationJournal;

interface BscTestnetPtaWbnbPoolInternalSubmissionJournal
  extends
    BscTestnetPtaWbnbPoolDurableSubmissionJournal,
    BscTestnetPtaWbnbPoolSubmissionJournalRecoveryReader {}

export type BscTestnetPtaWbnbPoolSubmissionJournalRecoveryProbeResult =
  | Readonly<{
      status: "ready";
      presence: "absent" | "present";
      state: BscTestnetPtaWbnbPoolSubmissionRecoveryState;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      presence: "unknown";
      state: null;
      issue: Readonly<{ code: "RECOVERY_JOURNAL_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolPredecessorSubmissionJournalProbeResult =
  | Readonly<{
      status: "ready";
      presence: "absent" | "empty" | "present";
      files: readonly (typeof PREDECESSOR_FILES)[number][];
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      presence: "unknown";
      files: null;
      issue: Readonly<{ code: "PREDECESSOR_SUBMISSION_JOURNAL_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolGeneration3SubmissionJournalProbeResult =
  | Readonly<{
      status: "ready";
      presence: "absent" | "empty" | "present";
      files: readonly (typeof GENERATION_3_FILES)[number][];
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      presence: "unknown";
      files: null;
      issue: Readonly<{ code: "GENERATION_3_SUBMISSION_JOURNAL_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolGeneration4SubmissionJournalProbeResult =
  | Readonly<{
      status: "ready";
      presence: "absent" | "empty" | "present";
      files: readonly (typeof GENERATION_4_FILES)[number][];
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      presence: "unknown";
      files: null;
      issue: Readonly<{ code: "GENERATION_4_SUBMISSION_JOURNAL_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolGeneration5SubmissionJournalProbeResult =
  | Readonly<{
      status: "ready";
      presence: "absent" | "empty" | "present";
      files: readonly (typeof GENERATION_5_FILES)[number][];
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      presence: "unknown";
      files: null;
      issue: Readonly<{ code: "GENERATION_5_SUBMISSION_JOURNAL_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolExistingSubmissionJournalResult =
  | Readonly<{
      status: "absent";
      journal: null;
      state: Readonly<{ state: "empty" }>;
      issue: null;
    }>
  | Readonly<{
      status: "opened";
      journal: BscTestnetPtaWbnbPoolSubmissionJournalRecoveryReader;
      state: BscTestnetPtaWbnbPoolSubmissionRecoveryState;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      journal: null;
      state: null;
      issue: Readonly<{ code: "RECOVERY_JOURNAL_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolExistingSubmissionTerminalRecoveryResult =
  | Readonly<{
      status: "opened";
      journal: BscTestnetPtaWbnbPoolSubmissionTerminalRecoveryJournal;
      state: BscTestnetPtaWbnbPoolSubmissionTerminalRecoveryState;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      journal: null;
      state: null;
      issue: Readonly<{ code: "TERMINAL_RECOVERY_JOURNAL_INVALID"; message: string }>;
    }>;

function inspectRecord(input: unknown, expectedKeys?: readonly string[]): DataRecord | null {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input) || isProxy(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) return null;
    const actual = (keys as string[]).sort();
    if (expectedKeys !== undefined) {
      const expected = [...expectedKeys].sort();
      if (
        actual.length !== expected.length ||
        actual.some((key, index) => key !== expected[index])
      ) {
        return null;
      }
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of actual) {
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
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function callable(input: unknown): input is (...arguments_: never[]) => unknown {
  return typeof input === "function" && !isProxy(input);
}

function snapshotNames(input: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(input) || isProxy(input) || input.length > FILES.length) return null;
    const ownKeys = Reflect.ownKeys(input);
    const expectedKeys = Array.from({ length: input.length }, (_, index) => String(index));
    expectedKeys.push("length");
    if (
      ownKeys.length !== expectedKeys.length ||
      ownKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const names: string[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, "value") ||
        typeof descriptor.value !== "string" ||
        !isJournalFileName(descriptor.value)
      ) {
        return null;
      }
      names.push(descriptor.value);
    }
    return Object.freeze(names);
  } catch {
    return null;
  }
}

function exactHex32(input: unknown): input is Hex {
  return typeof input === "string" && BYTES32.test(input) && input !== `0x${"00".repeat(32)}`;
}

function snapshotRecoveryAttempt(
  input: unknown
): BscTestnetPtaWbnbPoolRecoveryAttemptBinding | null {
  const recovery = inspectRecord(input, RECOVERY_KEYS);
  if (
    recovery === null ||
    recovery.generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION ||
    recovery.predecessorState !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE ||
    !exactHex32(recovery.predecessorTerminalRawSha256) ||
    !exactHex32(recovery.attemptId)
  ) {
    return null;
  }
  return Object.freeze({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorState: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
    predecessorTerminalRawSha256: recovery.predecessorTerminalRawSha256,
    attemptId: recovery.attemptId
  });
}

function sameRecoveryAttempt(
  left: BscTestnetPtaWbnbPoolRecoveryAttemptBinding,
  right: BscTestnetPtaWbnbPoolRecoveryAttemptBinding
): boolean {
  return RECOVERY_KEYS.every((key) => left[key] === right[key]);
}

function exactClaimId(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input)
  );
}

function exactUtc(input: unknown): input is string {
  if (typeof input !== "string" || input.length !== 24 || !UTC.test(input)) return false;
  const milliseconds = Date.parse(input);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === input;
}

function exactSha256(input: unknown): input is Hex {
  return typeof input === "string" && BYTES32.test(input);
}

function captureNow(clock: () => Date): string | null {
  try {
    const value = Reflect.apply(clock, undefined, []);
    if (
      isProxy(value) ||
      !(value instanceof Date) ||
      Object.getPrototypeOf(value) !== Date.prototype ||
      Reflect.ownKeys(value).length !== 0
    ) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0
      ? new Date(milliseconds).toISOString()
      : null;
  } catch {
    return null;
  }
}

function sha256Text(input: string): Hex {
  return `0x${createHash("sha256").update(input, "utf8").digest("hex")}`;
}

function exactOwnerV8Policy(input: unknown): BscTestnetPtaWbnbPoolDurableOwnerV8Policy | null {
  const record = inspectRecord(input, POLICY_KEYS);
  return record !== null &&
    POLICY_KEYS.every(
      (key) => record[key] === BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V8_POLICY[key]
    )
    ? BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V8_POLICY
    : null;
}

function orderedFrozenRecord(
  record: DataRecord,
  keys: readonly string[]
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const key of keys) result[key] = record[key];
  return Object.freeze(result);
}

function snapshotCapability(input: unknown): BscTestnetPtaWbnbPoolSubmissionCapability | null {
  const root = inspectRecord(input, CAPABILITY_KEYS);
  const preSubmission =
    root === null ? null : inspectRecord(root.preSubmission, PRE_SUBMISSION_KEYS);
  const transaction =
    root === null ? null : inspectRecord(root.transaction, CAPABILITY_TRANSACTION_KEYS);
  const recovery = root === null ? null : snapshotRecoveryAttempt(root.recovery);
  if (root === null || preSubmission === null || transaction === null || recovery === null) {
    return null;
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of CAPABILITY_KEYS) {
    snapshot[key] =
      key === "preSubmission"
        ? orderedFrozenRecord(preSubmission, PRE_SUBMISSION_KEYS)
        : key === "recovery"
          ? recovery
          : key === "transaction"
            ? orderedFrozenRecord(transaction, CAPABILITY_TRANSACTION_KEYS)
            : root[key];
  }
  return Object.freeze(snapshot) as unknown as BscTestnetPtaWbnbPoolSubmissionCapability;
}

type ParsedSignedCommitRequest = Readonly<{
  capability: BscTestnetPtaWbnbPoolSubmissionCapability;
  binding: Binding;
  ownerAuthorizationPolicy: BscTestnetPtaWbnbPoolDurableOwnerV8Policy;
}>;

async function parseSignedCommitRequest(
  input: unknown,
  asOf: Date
): Promise<ParsedSignedCommitRequest | null> {
  const record = inspectRecord(input, SIGNED_COMMIT_REQUEST_KEYS);
  const policy = record === null ? null : exactOwnerV8Policy(record.ownerAuthorizationPolicy);
  const capability = record === null ? null : snapshotCapability(record.capability);
  if (
    record === null ||
    policy === null ||
    capability === null ||
    record.schemaVersion !== 7 ||
    record.kind !== "authenticated_owner_recovery_generation_7_signed_submission_commit_v7"
  ) {
    return null;
  }
  const asOfMilliseconds = Date.prototype.getTime.call(asOf);
  const authenticatedAt = Date.parse(capability.authenticatedAt);
  const expiresAt = Date.parse(capability.expiresAt);
  if (asOfMilliseconds < authenticatedAt || asOfMilliseconds >= expiresAt) return null;
  const state = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
    capability,
    asOf
  );
  const binding = state === null ? null : parseInitial(state);
  return binding === null
    ? null
    : Object.freeze({ capability, binding, ownerAuthorizationPolicy: policy });
}

function parseBinding(input: DataRecord): Binding | null {
  const recovery = snapshotRecoveryAttempt(input.recovery);
  if (
    input.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    !exactClaimId(input.claimId) ||
    !exactHex32(input.envelopeHash) ||
    typeof input.releaseCommit !== "string" ||
    input.releaseCommit.length !== 40 ||
    !RELEASE_COMMIT.test(input.releaseCommit) ||
    input.releaseCommit === "0".repeat(40) ||
    !exactHex32(input.runtimeManifestSha256) ||
    !exactHex32(input.reviewerApprovalDigest) ||
    !exactHex32(input.ownerAuthorizationDigest) ||
    input.reviewerApprovalDigest === input.ownerAuthorizationDigest ||
    !exactHex32(input.signingHash) ||
    !exactHex32(input.transactionHash) ||
    !exactHex32(input.signedTransactionKeccak256) ||
    input.transactionHash !== input.signedTransactionKeccak256 ||
    !exactHex32(input.submissionStartedDigest) ||
    recovery === null
  ) {
    return null;
  }
  return Object.freeze({
    claimId: input.claimId,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: input.envelopeHash,
    releaseCommit: input.releaseCommit,
    runtimeManifestSha256: input.runtimeManifestSha256,
    reviewerApprovalDigest: input.reviewerApprovalDigest,
    ownerAuthorizationDigest: input.ownerAuthorizationDigest,
    recovery,
    signingHash: input.signingHash,
    transactionHash: input.transactionHash,
    signedTransactionKeccak256: input.signedTransactionKeccak256,
    submissionStartedDigest: input.submissionStartedDigest
  });
}

function sameBinding(left: Binding, right: Binding): boolean {
  return BINDING_KEYS.every((key) =>
    key === "recovery"
      ? sameRecoveryAttempt(left.recovery, right.recovery)
      : left[key] === right[key]
  );
}

function parseInitial(input: unknown): Binding | null {
  const record = inspectRecord(input, INITIAL_KEYS);
  if (
    record === null ||
    record.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION ||
    record.state !== "signed_committed"
  ) {
    return null;
  }
  return parseBinding(record);
}

function parseStart(input: unknown): Binding | null {
  const record = inspectRecord(input, START_KEYS);
  if (
    record === null ||
    record.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION ||
    record.operation !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION
  ) {
    return null;
  }
  return parseBinding(record);
}

function parseTerminal(
  input: unknown
): Readonly<{ binding: Binding; outcome: "confirmed" | "reverted"; digest: Hex }> | null {
  const record = inspectRecord(input, TERMINAL_KEYS);
  const binding = record === null ? null : parseBinding(record);
  if (
    record === null ||
    binding === null ||
    record.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION ||
    record.operation !== BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION ||
    (record.outcome !== "confirmed" && record.outcome !== "reverted") ||
    !exactHex32(record.reconciliationDigest)
  ) {
    return null;
  }
  return Object.freeze({ binding, outcome: record.outcome, digest: record.reconciliationDigest });
}

function serialize(record: Readonly<Record<string, unknown>>): string {
  return `${JSON.stringify(record)}\n`;
}

function parseStoredJson(input: string | null): DataRecord | null {
  if (
    input === null ||
    Buffer.byteLength(input, "utf8") < 2 ||
    Buffer.byteLength(input, "utf8") > MAXIMUM_RECORD_BYTES ||
    !input.endsWith("\n")
  ) {
    return null;
  }
  try {
    return inspectRecord(JSON.parse(input.slice(0, -1)) as unknown);
  } catch {
    return null;
  }
}

type ParsedSignedCommit = Readonly<{
  record: SignedCommitRecord;
  binding: Binding;
  sha256: Hex;
}>;

async function parseStoredSignedCommit(input: string | null): Promise<ParsedSignedCommit | null> {
  const raw = parseStoredJson(input);
  const exact = inspectRecord(raw, [
    "capability",
    "journalEvidenceOnly",
    "kind",
    "ownerAuthorizationPolicy",
    "recordedAt",
    "schema"
  ]);
  const recordedAt = exact?.recordedAt;
  const policy = exact === null ? null : exactOwnerV8Policy(exact.ownerAuthorizationPolicy);
  const capability = exact === null ? null : snapshotCapability(exact.capability);
  if (
    input === null ||
    exact === null ||
    typeof recordedAt !== "string" ||
    !exactUtc(recordedAt) ||
    policy === null ||
    capability === null ||
    exact.schema !== SCHEMA ||
    exact.kind !== "signed_commit" ||
    exact.journalEvidenceOnly !== true
  ) {
    return null;
  }
  const state = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
    capability,
    new Date(recordedAt)
  );
  const binding = state === null ? null : parseInitial(state);
  const record = Object.freeze({
    schema: SCHEMA,
    kind: "signed_commit" as const,
    recordedAt,
    ownerAuthorizationPolicy: policy,
    capability,
    journalEvidenceOnly: true as const
  });
  if (binding === null || serialize(record) !== input) return null;
  return Object.freeze({ record, binding, sha256: sha256Text(input) });
}

function parseStoredSubmissionStarted(
  input: string | null,
  signedCommitSha256: Hex
): Readonly<{ record: SubmissionStartedRecord; sha256: Hex }> | null {
  const raw = parseStoredJson(input);
  const exact = inspectRecord(raw, [
    "schema",
    "kind",
    "recordedAt",
    "signedCommitSha256",
    ...BINDING_KEYS
  ]);
  const binding = exact === null ? null : parseBinding(exact);
  if (
    input === null ||
    exact === null ||
    binding === null ||
    exact.schema !== SCHEMA ||
    exact.kind !== "submission_started" ||
    !exactUtc(exact.recordedAt) ||
    exact.signedCommitSha256 !== signedCommitSha256
  ) {
    return null;
  }
  const record = Object.freeze({
    schema: SCHEMA,
    kind: "submission_started" as const,
    recordedAt: exact.recordedAt as string,
    signedCommitSha256,
    ...binding
  });
  return serialize(record) === input ? Object.freeze({ record, sha256: sha256Text(input) }) : null;
}

function parseStoredTerminal(
  input: string | null,
  signedCommitSha256: Hex,
  submissionStartedRecordSha256: Hex
): TerminalRecord | null {
  const raw = parseStoredJson(input);
  const exact = inspectRecord(raw, [
    "schema",
    "kind",
    "recordedAt",
    "signedCommitSha256",
    "submissionStartedRecordSha256",
    "reconciliationDigest",
    ...BINDING_KEYS
  ]);
  const binding = exact === null ? null : parseBinding(exact);
  if (
    input === null ||
    exact === null ||
    binding === null ||
    exact.schema !== SCHEMA ||
    (exact.kind !== "confirmed" && exact.kind !== "reverted") ||
    !exactUtc(exact.recordedAt) ||
    exact.signedCommitSha256 !== signedCommitSha256 ||
    exact.submissionStartedRecordSha256 !== submissionStartedRecordSha256 ||
    !exactSha256(exact.signedCommitSha256) ||
    !exactSha256(exact.submissionStartedRecordSha256) ||
    !exactHex32(exact.reconciliationDigest)
  ) {
    return null;
  }
  const record = Object.freeze({
    schema: SCHEMA,
    kind: exact.kind,
    recordedAt: exact.recordedAt as string,
    signedCommitSha256,
    submissionStartedRecordSha256,
    ...binding,
    reconciliationDigest: exact.reconciliationDigest
  });
  return serialize(record) === input ? record : null;
}

function stateFrom(
  binding: Binding,
  state: BscTestnetPtaWbnbPoolSubmissionJournalState["state"]
): BscTestnetPtaWbnbPoolSubmissionJournalState {
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    ...binding,
    state
  });
}

function inspectPorts(input: unknown): BscTestnetPtaWbnbPoolSubmissionJournalPorts | null {
  const record = inspectRecord(input, [
    "assertSecure",
    "createExclusive",
    "listNames",
    "now",
    "readBounded"
  ]);
  return record !== null && Object.values(record).every(callable)
    ? (record as unknown as BscTestnetPtaWbnbPoolSubmissionJournalPorts)
    : null;
}

type Snapshot = Readonly<{
  binding: Binding | null;
  state: "empty" | BscTestnetPtaWbnbPoolSubmissionJournalState["state"];
  terminalDigest: Hex | null;
  signedCommit: ParsedSignedCommit | null;
  submissionStarted: Readonly<{ record: SubmissionStartedRecord; sha256: Hex }> | null;
}>;

function unknownSnapshot(
  binding: Binding | null = null,
  signedCommit: ParsedSignedCommit | null = null,
  submissionStarted: Readonly<{ record: SubmissionStartedRecord; sha256: Hex }> | null = null
): Snapshot {
  return Object.freeze({
    binding,
    state: "unknown_outcome",
    terminalDigest: null,
    signedCommit,
    submissionStarted
  });
}

/** Append-only protocol core; production supplies only the fixed Windows adapter below. */
export function createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
  untrustedPorts: unknown
): BscTestnetPtaWbnbPoolInternalSubmissionJournal {
  const ports = inspectPorts(untrustedPorts);
  if (ports === null) throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");
  let terminalUnknownSnapshot: Snapshot | null = null;

  const readSnapshot = async (): Promise<Snapshot> => {
    if (terminalUnknownSnapshot !== null) return terminalUnknownSnapshot;
    try {
      const untrustedNames = snapshotNames(await ports.listNames());
      if (untrustedNames === null) return unknownSnapshot();
      const names = [...untrustedNames].sort();
      if (new Set(names).size !== names.length || (await ports.assertSecure(names)) !== true) {
        return unknownSnapshot();
      }
      if (names.length === 0) {
        return Object.freeze({
          binding: null,
          state: "empty" as const,
          terminalDigest: null,
          signedCommit: null,
          submissionStarted: null
        });
      }
      if (names.some((name, index) => name !== FILES[index])) return unknownSnapshot();
      const initial = await parseStoredSignedCommit(await ports.readBounded(SIGNED_COMMIT_FILE));
      if (initial === null) return unknownSnapshot();
      const binding = initial.binding;
      const signedAt = Date.parse(initial.record.recordedAt);
      const authenticatedAt = Date.parse(initial.record.capability.authenticatedAt);
      const expiresAt = Date.parse(initial.record.capability.expiresAt);
      if (signedAt < authenticatedAt || signedAt >= expiresAt) return unknownSnapshot(binding);
      if (names.length === 1) {
        return Object.freeze({
          binding,
          state: "signed_committed" as const,
          terminalDigest: null,
          signedCommit: initial,
          submissionStarted: null
        });
      }
      const started = parseStoredSubmissionStarted(
        await ports.readBounded(SUBMISSION_STARTED_FILE),
        initial.sha256
      );
      if (
        started === null ||
        !sameBinding(binding, started.record) ||
        Date.parse(started.record.recordedAt) < signedAt ||
        Date.parse(started.record.recordedAt) >= expiresAt
      ) {
        return unknownSnapshot(binding, initial);
      }
      if (names.length === 2) {
        return Object.freeze({
          binding,
          state: "submission_started" as const,
          terminalDigest: null,
          signedCommit: initial,
          submissionStarted: started
        });
      }
      const terminalText = await ports.readBounded(TERMINAL_RECONCILIATION_FILE);
      const terminal = parseStoredTerminal(terminalText, initial.sha256, started.sha256);
      if (
        terminal === null ||
        !sameBinding(binding, terminal) ||
        Date.parse(terminal.recordedAt) < Date.parse(started.record.recordedAt)
      ) {
        return unknownSnapshot(binding, initial, started);
      }
      return Object.freeze({
        binding,
        state: terminal.kind,
        terminalDigest: terminal.reconciliationDigest,
        signedCommit: initial,
        submissionStarted: started
      });
    } catch {
      return unknownSnapshot();
    }
  };

  const initializeSignedCommit = async (
    input: BscTestnetPtaWbnbPoolDurableSignedCommitRequest
  ): Promise<Readonly<{ status: "initialized_by_this_call" | "already_initialized" }>> => {
    const recordedAt = captureNow(ports.now);
    const parsed =
      recordedAt === null ? null : await parseSignedCommitRequest(input, new Date(recordedAt));
    if (parsed === null || recordedAt === null) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_INPUT_INVALID");
    }
    const before = await readSnapshot();
    if (before.state !== "empty") {
      if (
        before.binding === null ||
        before.signedCommit === null ||
        !sameBinding(before.binding, parsed.binding) ||
        JSON.stringify(before.signedCommit.record.capability) !==
          JSON.stringify(parsed.capability) ||
        before.signedCommit.record.ownerAuthorizationPolicy !== parsed.ownerAuthorizationPolicy
      ) {
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
      }
      return Object.freeze({ status: "already_initialized" as const });
    }
    const record = Object.freeze({
      schema: SCHEMA,
      kind: "signed_commit" as const,
      recordedAt,
      ownerAuthorizationPolicy: parsed.ownerAuthorizationPolicy,
      capability: parsed.capability,
      journalEvidenceOnly: true as const
    });
    let outcome: "created" | "exists";
    try {
      outcome = await ports.createExclusive(SIGNED_COMMIT_FILE, serialize(record));
    } catch {
      terminalUnknownSnapshot = unknownSnapshot(parsed.binding);
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    if (outcome !== "created" && outcome !== "exists") {
      terminalUnknownSnapshot = unknownSnapshot(parsed.binding);
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    const after = await readSnapshot();
    if (
      after.binding === null ||
      after.signedCommit === null ||
      !sameBinding(after.binding, parsed.binding) ||
      JSON.stringify(after.signedCommit.record.capability) !== JSON.stringify(parsed.capability)
    ) {
      terminalUnknownSnapshot = unknownSnapshot(parsed.binding, after.signedCommit);
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    return Object.freeze({
      status: outcome === "created" ? "initialized_by_this_call" : "already_initialized"
    });
  };

  const readState = async (): Promise<unknown> => {
    const snapshot = await readSnapshot();
    return snapshot.binding === null
      ? Object.freeze({ state: snapshot.state })
      : stateFrom(
          snapshot.binding,
          snapshot.state as BscTestnetPtaWbnbPoolSubmissionJournalState["state"]
        );
  };

  const recoveryStateFromSnapshot = (
    snapshot: Snapshot
  ): BscTestnetPtaWbnbPoolSubmissionRecoveryState => {
    if (snapshot.state === "empty") return Object.freeze({ state: "empty" as const });
    if (
      snapshot.state === "unknown_outcome" ||
      snapshot.binding === null ||
      snapshot.signedCommit === null
    ) {
      return Object.freeze({
        state: "unknown_outcome" as const,
        capability: snapshot.signedCommit?.record.capability ?? null,
        ownerAuthorizationPolicy: snapshot.signedCommit?.record.ownerAuthorizationPolicy ?? null,
        signedCommitSha256: snapshot.signedCommit?.sha256 ?? null,
        submissionStartedRecordSha256: snapshot.submissionStarted?.sha256 ?? null,
        journalEvidenceOnly: true as const,
        authorityReauthenticationRequired: true as const,
        sendingAuthorizedByJournal: false as const
      });
    }
    return Object.freeze({
      schemaVersion: 7 as const,
      journalSchema: SCHEMA,
      state: snapshot.state,
      ownerAuthorizationPolicy: snapshot.signedCommit.record.ownerAuthorizationPolicy,
      capability: snapshot.signedCommit.record.capability,
      signedCommitSha256: snapshot.signedCommit.sha256,
      submissionStartedRecordSha256: snapshot.submissionStarted?.sha256 ?? null,
      reconciliationDigest: snapshot.terminalDigest,
      journalEvidenceOnly: true as const,
      authorityReauthenticationRequired: true as const,
      sendingAuthorizedByJournal: false as const
    });
  };

  const readRecoveryState = async (): Promise<BscTestnetPtaWbnbPoolSubmissionRecoveryState> =>
    recoveryStateFromSnapshot(await readSnapshot());

  const readStrictRecoveryState =
    async (): Promise<BscTestnetPtaWbnbPoolSubmissionRecoveryState | null> => {
      const snapshot = await readSnapshot();
      if (snapshot.state === "unknown_outcome") return null;
      return recoveryStateFromSnapshot(snapshot);
    };

  const commitSubmissionStarted = async (
    input: BscTestnetPtaWbnbPoolSubmissionStartedRequest
  ): Promise<unknown> => {
    const binding = parseStart(input);
    const recordedAt = captureNow(ports.now);
    if (binding === null || recordedAt === null) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_INPUT_INVALID");
    }
    const before = await readSnapshot();
    if (before.binding === null || !sameBinding(before.binding, binding)) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    if (before.state !== "signed_committed") {
      if (
        before.state === "submission_started" ||
        before.state === "confirmed" ||
        before.state === "reverted"
      ) {
        return Object.freeze({
          status: "already_started" as const,
          transactionHash: binding.transactionHash,
          submissionStartedDigest: binding.submissionStartedDigest
        });
      }
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    if (before.signedCommit === null) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    let outcome: "created" | "exists";
    try {
      outcome = await ports.createExclusive(
        SUBMISSION_STARTED_FILE,
        serialize({
          schema: SCHEMA,
          kind: "submission_started",
          recordedAt,
          signedCommitSha256: before.signedCommit.sha256,
          ...binding
        })
      );
    } catch {
      terminalUnknownSnapshot = unknownSnapshot(binding, before.signedCommit);
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    if (outcome !== "created" && outcome !== "exists") {
      terminalUnknownSnapshot = unknownSnapshot(binding, before.signedCommit);
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    const after = await readSnapshot();
    if (
      after.binding === null ||
      !sameBinding(after.binding, binding) ||
      (after.state !== "submission_started" &&
        after.state !== "confirmed" &&
        after.state !== "reverted")
    ) {
      terminalUnknownSnapshot = unknownSnapshot(binding, before.signedCommit);
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    return Object.freeze({
      status: outcome === "created" ? "started_by_this_call" : "already_started",
      transactionHash: binding.transactionHash,
      submissionStartedDigest: binding.submissionStartedDigest
    });
  };

  const commitTerminalReconciliation = async (
    input: BscTestnetPtaWbnbPoolTerminalReconciliationRequest
  ): Promise<unknown> => {
    const parsed = parseTerminal(input);
    const recordedAt = captureNow(ports.now);
    if (parsed === null || recordedAt === null) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_INPUT_INVALID");
    }
    const before = await readSnapshot();
    if (before.binding === null || !sameBinding(before.binding, parsed.binding)) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    if (before.state === "confirmed" || before.state === "reverted") {
      if (before.state !== parsed.outcome || before.terminalDigest !== parsed.digest) {
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
      }
    } else {
      if (before.state !== "submission_started") {
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_STATE_MISMATCH");
      }
      if (before.signedCommit === null || before.submissionStarted === null) {
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
      }
      try {
        const outcome = await ports.createExclusive(
          TERMINAL_RECONCILIATION_FILE,
          serialize({
            schema: SCHEMA,
            kind: parsed.outcome,
            recordedAt,
            signedCommitSha256: before.signedCommit.sha256,
            submissionStartedRecordSha256: before.submissionStarted.sha256,
            ...parsed.binding,
            reconciliationDigest: parsed.digest
          })
        );
        if (outcome !== "created" && outcome !== "exists") {
          throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
        }
      } catch {
        terminalUnknownSnapshot = unknownSnapshot(
          parsed.binding,
          before.signedCommit,
          before.submissionStarted
        );
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
      }
      const after = await readSnapshot();
      if (after.state !== parsed.outcome || after.terminalDigest !== parsed.digest) {
        terminalUnknownSnapshot = unknownSnapshot(
          parsed.binding,
          before.signedCommit,
          before.submissionStarted
        );
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
      }
    }
    return Object.freeze({
      status: parsed.outcome,
      transactionHash: parsed.binding.transactionHash,
      submissionStartedDigest: parsed.binding.submissionStartedDigest,
      reconciliationDigest: parsed.digest
    });
  };

  return Object.freeze({
    initializeSignedCommit,
    readState,
    readRecoveryState,
    readStrictRecoveryState,
    commitSubmissionStarted,
    commitTerminalReconciliation
  });
}

const LOCAL_APPLICATION_DATA_READ_ONLY_PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if ([String]::IsNullOrWhiteSpace($base)) { throw 'base' }
  $item = Get-Item -LiteralPath $base -Force
  if (-not $item.PSIsContainer) { throw 'type' }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
  if ([IO.Path]::GetFullPath($item.FullName) -ne [IO.Path]::GetFullPath($base)) { throw 'path' }
  [Console]::Out.Write((@{ localApplicationData = $item.FullName } | ConvertTo-Json -Compress))
} catch { exit 60 }
`;

const PREPARE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if ([String]::IsNullOrWhiteSpace($base)) { throw 'base' }
  $baseItem = Get-Item -LiteralPath $base -Force
  if (-not $baseItem.PSIsContainer -or (($baseItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'base' }
  $cursor = $baseItem.FullName
  foreach ($segment in @('ProofEra', 'operations', 'bsc-testnet-pta-wbnb-pool-submission-v6')) {
    $candidate = [IO.Path]::GetFullPath([IO.Path]::Combine($cursor, $segment))
    if ([IO.Path]::GetDirectoryName($candidate) -ne [IO.Path]::GetFullPath($cursor)) { throw 'escape' }
    if (-not (Test-Path -LiteralPath $candidate)) { [void](New-Item -ItemType Directory -Path $candidate) }
    $item = Get-Item -LiteralPath $candidate -Force
    if (-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'path' }
    $cursor = $item.FullName
  }
  $allowed = @('01-signed-commit.v8.json','02-submission-started.v8.json','03-terminal-reconciliation.v8.json')
  foreach ($child in @(Get-ChildItem -LiteralPath $cursor -Force)) {
    if ($child.PSIsContainer -or ($allowed -notcontains $child.Name) -or (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $child.LinkType) { throw 'child' }
  }
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $existingAcl = Get-Acl -LiteralPath $cursor
  $existingOwner = try {
    ([System.Security.Principal.SecurityIdentifier]::new($existingAcl.Owner)).Value
  } catch {
    ([System.Security.Principal.NTAccount]::new($existingAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  }
  if ($existingOwner -ne $current.Value) { throw 'owner' }
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,$inherit,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow))
  [IO.Directory]::SetAccessControl($cursor, $acl)
  [Console]::Out.Write((@{ directory = $cursor } | ConvertTo-Json -Compress))
} catch { exit 61 }
`;

const ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $spec = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $paths = @($spec.paths)
  for ($index = 0; $index -lt $paths.Count; $index += 1) {
    $path = $paths[$index]
    $item = Get-Item -LiteralPath $path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
    $acl = Get-Acl -LiteralPath $path
    if (-not $acl.AreAccessRulesProtected) { throw 'inheritance' }
    $owner = try { ([System.Security.Principal.SecurityIdentifier]::new($acl.Owner)).Value } catch { ([System.Security.Principal.NTAccount]::new($acl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value }
    if ($owner -ne $current.Value) { throw 'owner' }
    $rules = @($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]))
    if ($rules.Count -ne 1) { throw 'rules' }
    foreach ($rule in $rules) {
      if ($rule.IsInherited -or $rule.IdentityReference.Value -ne $current.Value -or $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl)) { throw 'rule' }
      if ($index -eq 0) {
        $expectedInheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
        if ($rule.InheritanceFlags -ne $expectedInheritance -or $rule.PropagationFlags -ne [System.Security.AccessControl.PropagationFlags]::None) { throw 'directory-rule' }
      } elseif ($rule.InheritanceFlags -ne [System.Security.AccessControl.InheritanceFlags]::None -or $rule.PropagationFlags -ne [System.Security.AccessControl.PropagationFlags]::None) { throw 'file-rule' }
    }
  }
  [Console]::Out.Write('{"ok":true}')
} catch { exit 62 }
`;

const PROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $spec = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $directory = Get-Item -LiteralPath $spec.directory -Force
  $file = Get-Item -LiteralPath $spec.file -Force
  if (-not $directory.PSIsContainer -or $file.PSIsContainer -or (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or [IO.Path]::GetDirectoryName($file.FullName) -ne $directory.FullName) { throw 'path' }
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $existingAcl = Get-Acl -LiteralPath $file.FullName
  $existingOwner = try {
    ([System.Security.Principal.SecurityIdentifier]::new($existingAcl.Owner)).Value
  } catch {
    ([System.Security.Principal.NTAccount]::new($existingAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  }
  if ($existingOwner -ne $current.Value) { throw 'owner' }
  $acl = [System.Security.AccessControl.FileSecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.AccessControlType]::Allow))
  [IO.File]::SetAccessControl($file.FullName, $acl)
  [Console]::Out.Write('{"ok":true}')
} catch { exit 63 }
`;

async function powershellJson(script: string, value: unknown, maximum: number): Promise<unknown> {
  const input = Buffer.from(JSON.stringify(value), "utf8");
  let output: Buffer | null = null;
  try {
    const result = await runPinnedPowerShellForInternalUse(
      script,
      input,
      maximum,
      new AbortController().signal
    );
    output = result.output;
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)) as unknown;
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function readBounded(path: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, fileConstants.O_RDONLY);
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.size < 1n ||
      before.size > BigInt(MAXIMUM_RECORD_BYTES)
    ) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_INVALID");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.birthtimeNs !== after.birthtimeNs ||
      before.mode !== after.mode ||
      before.nlink !== after.nlink ||
      after.nlink !== 1n ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_CHANGED");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function verifyPaths(
  directory: string,
  names: readonly string[],
  acceptsName: (name: string) => boolean = isJournalFileName
): Promise<boolean> {
  const directoryBefore = await lstat(directory, { bigint: true });
  const canonicalDirectory = await realpath(directory);
  const directoryAfter = await lstat(directory, { bigint: true });
  if (
    !directoryBefore.isDirectory() ||
    directoryBefore.isSymbolicLink() ||
    !directoryAfter.isDirectory() ||
    directoryAfter.isSymbolicLink() ||
    directoryBefore.dev !== directoryAfter.dev ||
    directoryBefore.ino !== directoryAfter.ino ||
    directoryBefore.birthtimeNs !== directoryAfter.birthtimeNs ||
    directoryBefore.ctimeNs !== directoryAfter.ctimeNs ||
    directoryBefore.mode !== directoryAfter.mode ||
    win32.normalize(canonicalDirectory).toLowerCase() !== directory.toLowerCase()
  ) {
    return false;
  }
  for (const name of names) {
    if (!acceptsName(name)) return false;
    const path = win32.join(directory, name);
    const before = await lstat(path, { bigint: true });
    const canonical = await realpath(path);
    const after = await lstat(path, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      !after.isFile() ||
      after.isSymbolicLink() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.birthtimeNs !== after.birthtimeNs ||
      before.mode !== after.mode ||
      before.nlink !== after.nlink ||
      after.nlink !== 1n ||
      win32.normalize(canonical).toLowerCase() !== path.toLowerCase()
    ) {
      return false;
    }
  }
  const result = inspectRecord(
    await powershellJson(
      ACL_SCRIPT,
      { paths: [directory, ...names.map((name) => win32.join(directory, name))] },
      32
    ),
    ["ok"]
  );
  return result?.ok === true;
}

function expectedDirectory(
  value: unknown,
  subdirectory: readonly string[] = SUBDIRECTORY
): string | null {
  const record = inspectRecord(value, ["directory"]);
  const directory = record?.directory;
  if (
    typeof directory !== "string" ||
    directory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(directory) ||
    directory.includes("/") ||
    win32.normalize(directory) !== directory
  ) {
    return null;
  }
  const expectedSuffix = win32.join(...subdirectory).toLowerCase();
  if (!directory.toLowerCase().endsWith(expectedSuffix)) return null;
  const relation = relative(REPOSITORY_ROOT, resolve(directory));
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")
    ? null
    : resolve(directory);
}

async function stableDirectoryPresence(path: string): Promise<"present" | "absent"> {
  try {
    const before = await lstat(path, { bigint: true });
    const canonical = await realpath(path);
    const after = await lstat(path, { bigint: true });
    if (
      !before.isDirectory() ||
      before.isSymbolicLink() ||
      !after.isDirectory() ||
      after.isSymbolicLink() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.birthtimeNs !== after.birthtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.mode !== after.mode ||
      before.nlink !== after.nlink ||
      after.nlink < 1n ||
      win32.normalize(canonical).toLowerCase() !== win32.normalize(path).toLowerCase()
    ) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_DIRECTORY_INVALID");
    }
    return "present";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
}

async function readOnlyFixedDirectory(
  subdirectory: readonly string[] = SUBDIRECTORY
): Promise<string | null> {
  const raw = inspectRecord(
    await powershellJson(LOCAL_APPLICATION_DATA_READ_ONLY_PROBE_SCRIPT, {}, 1_024),
    ["localApplicationData"]
  );
  const base = raw?.localApplicationData;
  if (typeof base !== "string") {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");
  }
  const expected = expectedDirectory(
    { directory: win32.join(base, ...subdirectory) },
    subdirectory
  );
  if (expected === null) {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");
  }
  let cursor = resolve(base);
  if ((await stableDirectoryPresence(cursor)) !== "present") {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");
  }
  for (const segment of subdirectory) {
    const candidate = win32.join(cursor, segment);
    if (win32.dirname(candidate).toLowerCase() !== win32.normalize(cursor).toLowerCase()) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");
    }
    if ((await stableDirectoryPresence(candidate)) === "absent") return null;
    cursor = candidate;
  }
  if (win32.normalize(cursor).toLowerCase() !== win32.normalize(expected).toLowerCase()) {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");
  }
  return expected;
}

const terminalRecoveryObservationBrands = new WeakMap<
  object,
  Readonly<{ directory: string; fingerprint: string }>
>();

function recoveryStateFingerprint(value: BscTestnetPtaWbnbPoolSubmissionRecoveryState): string {
  return createHash("sha256")
    .update("proofera.bsc-testnet.pta-wbnb-pool.submission-recovery-observation.v2\u0000", "utf8")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function terminalRecoveryState(
  value: BscTestnetPtaWbnbPoolSubmissionRecoveryState
): value is BscTestnetPtaWbnbPoolSubmissionTerminalRecoveryState {
  if (value.state === "submission_started") {
    return (
      BYTES32.test(value.signedCommitSha256) &&
      typeof value.submissionStartedRecordSha256 === "string" &&
      BYTES32.test(value.submissionStartedRecordSha256) &&
      value.reconciliationDigest === null
    );
  }
  return (
    value.state === "unknown_outcome" &&
    value.capability !== null &&
    value.ownerAuthorizationPolicy !== null &&
    typeof value.signedCommitSha256 === "string" &&
    BYTES32.test(value.signedCommitSha256) &&
    typeof value.submissionStartedRecordSha256 === "string" &&
    BYTES32.test(value.submissionStartedRecordSha256)
  );
}

function recoveryReaderFacade(
  journal: BscTestnetPtaWbnbPoolInternalSubmissionJournal
): BscTestnetPtaWbnbPoolSubmissionJournalRecoveryReader {
  return Object.freeze({
    readRecoveryState: journal.readRecoveryState,
    readStrictRecoveryState: journal.readStrictRecoveryState
  });
}

function durableJournalFacade(
  journal: BscTestnetPtaWbnbPoolInternalSubmissionJournal
): BscTestnetPtaWbnbPoolDurableSubmissionJournal {
  return Object.freeze({
    initializeSignedCommit: journal.initializeSignedCommit,
    readState: journal.readState,
    readRecoveryState: journal.readRecoveryState,
    commitSubmissionStarted: journal.commitSubmissionStarted,
    commitTerminalReconciliation: journal.commitTerminalReconciliation
  });
}

function terminalRecoveryJournalFacade(
  journal: BscTestnetPtaWbnbPoolInternalSubmissionJournal
): BscTestnetPtaWbnbPoolSubmissionTerminalRecoveryJournal {
  return Object.freeze({
    readState: journal.readState,
    commitTerminalReconciliation: journal.commitTerminalReconciliation
  });
}

function terminalRecoveryBlocked(): BscTestnetPtaWbnbPoolExistingSubmissionTerminalRecoveryResult {
  return Object.freeze({
    status: "blocked" as const,
    journal: null,
    state: null,
    issue: Object.freeze({
      code: "TERMINAL_RECOVERY_JOURNAL_INVALID" as const,
      message:
        "The fixed submission journal no longer matches the authenticated terminal-recovery observation."
    })
  });
}

function recoveryBlocked(): BscTestnetPtaWbnbPoolExistingSubmissionJournalResult {
  return Object.freeze({
    status: "blocked" as const,
    journal: null,
    state: null,
    issue: Object.freeze({
      code: "RECOVERY_JOURNAL_INVALID" as const,
      message: "The existing submission journal could not be validated without mutation."
    })
  });
}

function predecessorProbeBlocked(): BscTestnetPtaWbnbPoolPredecessorSubmissionJournalProbeResult {
  return Object.freeze({
    status: "blocked" as const,
    presence: "unknown" as const,
    files: null,
    issue: Object.freeze({
      code: "PREDECESSOR_SUBMISSION_JOURNAL_INVALID" as const,
      message: "The predecessor submission-v2 namespace could not be inspected without mutation."
    })
  });
}

function generation3ProbeBlocked(): BscTestnetPtaWbnbPoolGeneration3SubmissionJournalProbeResult {
  return Object.freeze({
    status: "blocked" as const,
    presence: "unknown" as const,
    files: null,
    issue: Object.freeze({
      code: "GENERATION_3_SUBMISSION_JOURNAL_INVALID" as const,
      message: "The generation-3 submission-v3 namespace could not be inspected without mutation."
    })
  });
}

function generation4ProbeBlocked(): BscTestnetPtaWbnbPoolGeneration4SubmissionJournalProbeResult {
  return Object.freeze({
    status: "blocked" as const,
    presence: "unknown" as const,
    files: null,
    issue: Object.freeze({
      code: "GENERATION_4_SUBMISSION_JOURNAL_INVALID" as const,
      message: "The generation-5 submission-v5 namespace could not be inspected without mutation."
    })
  });
}

function generation5ProbeBlocked(): BscTestnetPtaWbnbPoolGeneration5SubmissionJournalProbeResult {
  return Object.freeze({
    status: "blocked" as const,
    presence: "unknown" as const,
    files: null,
    issue: Object.freeze({
      code: "GENERATION_5_SUBMISSION_JOURNAL_INVALID" as const,
      message: "The generation-6 submission-v5 namespace could not be inspected without mutation."
    })
  });
}

async function predecessorNames(directory: string): Promise<readonly string[] | null> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isPredecessorJournalFileName(entry.name)) return null;
    names.push(entry.name);
  }
  return Object.freeze(names.sort());
}

async function probePredecessorAtDirectory(
  directory: string
): Promise<BscTestnetPtaWbnbPoolPredecessorSubmissionJournalProbeResult> {
  try {
    const first = await predecessorNames(directory);
    if (first === null || !(await verifyPaths(directory, first, isPredecessorJournalFileName))) {
      return predecessorProbeBlocked();
    }
    const second = await predecessorNames(directory);
    if (
      second === null ||
      first.length !== second.length ||
      first.some((name, index) => name !== second[index]) ||
      !(await verifyPaths(directory, second, isPredecessorJournalFileName))
    ) {
      return predecessorProbeBlocked();
    }
    return Object.freeze({
      status: "ready" as const,
      presence: first.length === 0 ? ("empty" as const) : ("present" as const),
      files: first as readonly (typeof PREDECESSOR_FILES)[number][],
      issue: null
    });
  } catch {
    return predecessorProbeBlocked();
  }
}

async function generation3Names(directory: string): Promise<readonly string[] | null> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isGeneration3JournalFileName(entry.name)) return null;
    names.push(entry.name);
  }
  return Object.freeze(names.sort());
}

async function probeGeneration3AtDirectory(
  directory: string
): Promise<BscTestnetPtaWbnbPoolGeneration3SubmissionJournalProbeResult> {
  try {
    const first = await generation3Names(directory);
    if (first === null || !(await verifyPaths(directory, first, isGeneration3JournalFileName))) {
      return generation3ProbeBlocked();
    }
    const second = await generation3Names(directory);
    if (
      second === null ||
      first.length !== second.length ||
      first.some((name, index) => name !== second[index]) ||
      !(await verifyPaths(directory, second, isGeneration3JournalFileName))
    ) {
      return generation3ProbeBlocked();
    }
    return Object.freeze({
      status: "ready" as const,
      presence: first.length === 0 ? ("empty" as const) : ("present" as const),
      files: first as readonly (typeof GENERATION_3_FILES)[number][],
      issue: null
    });
  } catch {
    return generation3ProbeBlocked();
  }
}

async function generation4Names(directory: string): Promise<readonly string[] | null> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isGeneration4JournalFileName(entry.name)) return null;
    names.push(entry.name);
  }
  return Object.freeze(names.sort());
}

async function probeGeneration4AtDirectory(
  directory: string
): Promise<BscTestnetPtaWbnbPoolGeneration4SubmissionJournalProbeResult> {
  try {
    const first = await generation4Names(directory);
    if (first === null || !(await verifyPaths(directory, first, isGeneration4JournalFileName))) {
      return generation4ProbeBlocked();
    }
    const second = await generation4Names(directory);
    if (
      second === null ||
      first.length !== second.length ||
      first.some((name, index) => name !== second[index]) ||
      !(await verifyPaths(directory, second, isGeneration4JournalFileName))
    ) {
      return generation4ProbeBlocked();
    }
    return Object.freeze({
      status: "ready" as const,
      presence: first.length === 0 ? ("empty" as const) : ("present" as const),
      files: first as readonly (typeof GENERATION_4_FILES)[number][],
      issue: null
    });
  } catch {
    return generation4ProbeBlocked();
  }
}

async function generation5Names(directory: string): Promise<readonly string[] | null> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isGeneration5JournalFileName(entry.name)) return null;
    names.push(entry.name);
  }
  return Object.freeze(names.sort());
}

async function probeGeneration5AtDirectory(
  directory: string
): Promise<BscTestnetPtaWbnbPoolGeneration5SubmissionJournalProbeResult> {
  try {
    const first = await generation5Names(directory);
    if (first === null || !(await verifyPaths(directory, first, isGeneration5JournalFileName))) {
      return generation5ProbeBlocked();
    }
    const second = await generation5Names(directory);
    if (
      second === null ||
      first.length !== second.length ||
      first.some((name, index) => name !== second[index]) ||
      !(await verifyPaths(directory, second, isGeneration5JournalFileName))
    ) {
      return generation5ProbeBlocked();
    }
    return Object.freeze({
      status: "ready" as const,
      presence: first.length === 0 ? ("empty" as const) : ("present" as const),
      files: first as readonly (typeof GENERATION_5_FILES)[number][],
      issue: null
    });
  } catch {
    return generation5ProbeBlocked();
  }
}

function createWindowsAdapter(directory: string): BscTestnetPtaWbnbPoolInternalSubmissionJournal {
  return createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
    Object.freeze({
      now: () => new Date(),
      listNames: async () => {
        const entries = await readdir(directory, { withFileTypes: true });
        const names: string[] = [];
        for (const entry of entries) {
          if (!entry.isFile() || !isJournalFileName(entry.name)) {
            throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_DIRECTORY_CONTAMINATED");
          }
          names.push(entry.name);
        }
        return Object.freeze(names.sort());
      },
      readBounded: (name: string) => {
        if (!isJournalFileName(name)) {
          throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_INVALID");
        }
        return readBounded(win32.join(directory, name));
      },
      createExclusive: async (name: string, content: string) => {
        if (
          !isJournalFileName(name) ||
          Buffer.byteLength(content, "utf8") < 2 ||
          Buffer.byteLength(content, "utf8") > MAXIMUM_RECORD_BYTES ||
          !content.endsWith("\n")
        ) {
          throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_INVALID");
        }
        const path = win32.join(directory, name);
        let handle;
        try {
          handle = await open(path, "wx", 0o600);
          await handle.writeFile(content, "utf8");
          await handle.sync();
          const retained = await handle.stat({ bigint: true });
          if (!retained.isFile() || retained.nlink !== 1n) {
            throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_INVALID");
          }
          await handle.close();
          handle = undefined;
          const protectedResult = inspectRecord(
            await powershellJson(PROTECT_SCRIPT, { directory, file: path }, 32),
            ["ok"]
          );
          if (protectedResult?.ok !== true || !(await verifyPaths(directory, [name]))) {
            throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_ACL_INVALID");
          }
          let protectedFileHandle;
          try {
            protectedFileHandle = await open(path, "r+");
            await protectedFileHandle.sync();
          } catch {
            throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_SYNC_FAILED");
          } finally {
            await protectedFileHandle?.close().catch(() => undefined);
          }
          if (!(await verifyPaths(directory, [name]))) {
            throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_CHANGED");
          }
          return "created" as const;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") return "exists" as const;
          throw error;
        } finally {
          await handle?.close().catch(() => undefined);
        }
      },
      assertSecure: (names: readonly string[]) => verifyPaths(directory, names)
    })
  );
}

async function openExistingAtDirectory(
  directory: string
): Promise<BscTestnetPtaWbnbPoolExistingSubmissionJournalResult> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const names: string[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !isJournalFileName(entry.name)) {
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_DIRECTORY_CONTAMINATED");
      }
      names.push(entry.name);
    }
    names.sort();
    if (!(await verifyPaths(directory, names))) return recoveryBlocked();
    if (names.length === 0) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: Object.freeze({ state: "empty" as const }),
        issue: null
      });
    }
    const journal = createWindowsAdapter(directory);
    const first = await journal.readRecoveryState();
    const strict = await journal.readStrictRecoveryState();
    const second = await journal.readRecoveryState();
    const firstFingerprint = recoveryStateFingerprint(first);
    if (
      firstFingerprint !== recoveryStateFingerprint(second) ||
      (strict === null
        ? !terminalRecoveryState(first) || first.state !== "unknown_outcome"
        : firstFingerprint !== recoveryStateFingerprint(strict))
    ) {
      return recoveryBlocked();
    }
    const state = strict ?? first;
    terminalRecoveryObservationBrands.set(
      state,
      Object.freeze({ directory: win32.normalize(directory), fingerprint: firstFingerprint })
    );
    return Object.freeze({
      status: "opened" as const,
      journal: recoveryReaderFacade(journal),
      state,
      issue: null
    });
  } catch {
    return recoveryBlocked();
  }
}

async function openTerminalRecoveryAtDirectory(
  directory: string,
  expectedState: unknown
): Promise<BscTestnetPtaWbnbPoolExistingSubmissionTerminalRecoveryResult> {
  try {
    if (typeof expectedState !== "object" || expectedState === null || isProxy(expectedState)) {
      return terminalRecoveryBlocked();
    }
    const observation = terminalRecoveryObservationBrands.get(expectedState);
    if (
      observation === undefined ||
      observation.directory.toLowerCase() !== win32.normalize(directory).toLowerCase()
    ) {
      return terminalRecoveryBlocked();
    }
    const entries = await readdir(directory, { withFileTypes: true });
    const names: string[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !isJournalFileName(entry.name)) {
        return terminalRecoveryBlocked();
      }
      names.push(entry.name);
    }
    names.sort();
    if (!(await verifyPaths(directory, names))) return terminalRecoveryBlocked();

    const journal = createWindowsAdapter(directory);
    const first = await journal.readRecoveryState();
    const strict = await journal.readStrictRecoveryState();
    const second = await journal.readRecoveryState();
    if (
      !terminalRecoveryState(first) ||
      recoveryStateFingerprint(first) !== observation.fingerprint ||
      recoveryStateFingerprint(second) !== observation.fingerprint ||
      (first.state === "submission_started"
        ? strict === null || recoveryStateFingerprint(strict) !== observation.fingerprint
        : strict !== null)
    ) {
      return terminalRecoveryBlocked();
    }
    return Object.freeze({
      status: "opened" as const,
      journal: terminalRecoveryJournalFacade(journal),
      state: first,
      issue: null
    });
  } catch {
    return terminalRecoveryBlocked();
  }
}

/**
 * Strict no-write recovery open over the fixed LocalAppData journal. It does not provision paths,
 * change ACLs, read custody, contact RPC, sign, or submit.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingSubmissionJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedDirectory();
    return directory === null
      ? Object.freeze({
          status: "absent" as const,
          journal: null,
          state: Object.freeze({ state: "empty" as const }),
          issue: null
        })
      : openExistingAtDirectory(directory);
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Reopens the fixed journal only for a previously branded startup observation and returns a
 * terminal-evidence-only facade. Any path/state/capability/recovery drift blocks the handoff.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationForInternalUse(
  expectedState: unknown
): Promise<BscTestnetPtaWbnbPoolExistingSubmissionTerminalRecoveryResult> {
  if (process.platform !== "win32") return terminalRecoveryBlocked();
  try {
    const directory = await readOnlyFixedDirectory();
    return directory === null
      ? terminalRecoveryBlocked()
      : openTerminalRecoveryAtDirectory(directory, expectedState);
  } catch {
    return terminalRecoveryBlocked();
  }
}

export async function probeWindowsBscTestnetPtaWbnbPoolSubmissionJournalRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolSubmissionJournalRecoveryProbeResult> {
  const opened =
    await openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse();
  return opened.status === "blocked"
    ? Object.freeze({
        status: "blocked" as const,
        presence: "unknown" as const,
        state: null,
        issue: opened.issue
      })
    : Object.freeze({
        status: "ready" as const,
        presence: opened.status === "opened" ? ("present" as const) : ("absent" as const),
        state: opened.state,
        issue: null
      });
}

/**
 * Strict read-only visibility probe for the superseded submission-v2 namespace. It never parses
 * predecessor bytes into current authority and never provisions, repairs, or writes that path.
 */
export async function probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalForInternalUse(): Promise<BscTestnetPtaWbnbPoolPredecessorSubmissionJournalProbeResult> {
  if (process.platform !== "win32") return predecessorProbeBlocked();
  try {
    const directory = await readOnlyFixedDirectory(PREDECESSOR_SUBDIRECTORY);
    return directory === null
      ? Object.freeze({
          status: "ready" as const,
          presence: "absent" as const,
          files: Object.freeze([]),
          issue: null
        })
      : probePredecessorAtDirectory(directory);
  } catch {
    return predecessorProbeBlocked();
  }
}

/**
 * Strict read-only visibility probe for the generation-3 submission-v3 namespace. It never parses
 * historical bytes into current authority and never provisions, repairs, or writes that path.
 */
export async function probeWindowsBscTestnetPtaWbnbPoolGeneration3SubmissionJournalForInternalUse(): Promise<BscTestnetPtaWbnbPoolGeneration3SubmissionJournalProbeResult> {
  if (process.platform !== "win32") return generation3ProbeBlocked();
  try {
    const directory = await readOnlyFixedDirectory(GENERATION_3_SUBDIRECTORY);
    return directory === null
      ? Object.freeze({
          status: "ready" as const,
          presence: "absent" as const,
          files: Object.freeze([]),
          issue: null
        })
      : probeGeneration3AtDirectory(directory);
  } catch {
    return generation3ProbeBlocked();
  }
}

/** Strict read-only probe for the generation-5 submission-v5 namespace. */
export async function probeWindowsBscTestnetPtaWbnbPoolGeneration4SubmissionJournalForInternalUse(): Promise<BscTestnetPtaWbnbPoolGeneration4SubmissionJournalProbeResult> {
  if (process.platform !== "win32") return generation4ProbeBlocked();
  try {
    const directory = await readOnlyFixedDirectory(GENERATION_4_SUBDIRECTORY);
    return directory === null
      ? Object.freeze({
          status: "ready" as const,
          presence: "absent" as const,
          files: Object.freeze([]),
          issue: null
        })
      : probeGeneration4AtDirectory(directory);
  } catch {
    return generation4ProbeBlocked();
  }
}

/** Strict read-only probe for the generation-6 submission-v5 namespace. */
export async function probeWindowsBscTestnetPtaWbnbPoolGeneration5SubmissionJournalForInternalUse(): Promise<BscTestnetPtaWbnbPoolGeneration5SubmissionJournalProbeResult> {
  if (process.platform !== "win32") return generation5ProbeBlocked();
  try {
    const directory = await readOnlyFixedDirectory(GENERATION_5_SUBDIRECTORY);
    return directory === null
      ? Object.freeze({
          status: "ready" as const,
          presence: "absent" as const,
          files: Object.freeze([]),
          issue: null
        })
      : probeGeneration5AtDirectory(directory);
  } catch {
    return generation5ProbeBlocked();
  }
}

/** Fixed current-user-only Windows composition. No caller path or mutable storage choice exists. */
export async function createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(): Promise<BscTestnetPtaWbnbPoolDurableSubmissionJournal> {
  if (process.platform !== "win32") {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_WINDOWS_REQUIRED");
  }
  const directory = expectedDirectory(await powershellJson(PREPARE_SCRIPT, {}, 1_024));
  if (directory === null || !(await verifyPaths(directory, []))) {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");
  }
  return durableJournalFacade(createWindowsAdapter(directory));
}

/**
 * Windows-only test seam for a caller-created synthetic temporary directory. It performs no ACL
 * mutation before validating the directory and is intentionally absent from package exports.
 */
export async function createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
  untrustedDirectory: unknown
): Promise<BscTestnetPtaWbnbPoolDurableSubmissionJournal> {
  if (process.platform !== "win32") {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_WINDOWS_REQUIRED");
  }
  if (
    typeof untrustedDirectory !== "string" ||
    untrustedDirectory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(untrustedDirectory) ||
    untrustedDirectory.includes("/") ||
    win32.normalize(untrustedDirectory) !== untrustedDirectory
  ) {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_TEST_DIRECTORY_INVALID");
  }
  const directory = resolve(untrustedDirectory);
  if (!isOutsideRepository(directory) || !(await verifyPaths(directory, []))) {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_TEST_DIRECTORY_INVALID");
  }
  return durableJournalFacade(createWindowsAdapter(directory));
}

/** Test-only no-write recovery seam over a caller-created synthetic directory. */
export async function openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
  untrustedDirectory: unknown
): Promise<BscTestnetPtaWbnbPoolExistingSubmissionJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  if (
    typeof untrustedDirectory !== "string" ||
    untrustedDirectory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(untrustedDirectory) ||
    untrustedDirectory.includes("/") ||
    win32.normalize(untrustedDirectory) !== untrustedDirectory
  ) {
    return recoveryBlocked();
  }
  const directory = resolve(untrustedDirectory);
  if (!isOutsideRepository(directory)) {
    return recoveryBlocked();
  }
  return openExistingAtDirectory(directory);
}

/** Test-only no-write predecessor namespace probe over a caller-created synthetic directory. */
export async function probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalAtSyntheticDirectoryForTests(
  untrustedDirectory: unknown
): Promise<BscTestnetPtaWbnbPoolPredecessorSubmissionJournalProbeResult> {
  if (process.platform !== "win32") return predecessorProbeBlocked();
  if (
    typeof untrustedDirectory !== "string" ||
    untrustedDirectory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(untrustedDirectory) ||
    untrustedDirectory.includes("/") ||
    win32.normalize(untrustedDirectory) !== untrustedDirectory
  ) {
    return predecessorProbeBlocked();
  }
  const directory = resolve(untrustedDirectory);
  if (!isOutsideRepository(directory)) {
    return predecessorProbeBlocked();
  }
  return probePredecessorAtDirectory(directory);
}

/** Test-only no-write generation-3 namespace probe over a caller-created synthetic directory. */
export async function probeWindowsBscTestnetPtaWbnbPoolGeneration3SubmissionJournalAtSyntheticDirectoryForTests(
  untrustedDirectory: unknown
): Promise<BscTestnetPtaWbnbPoolGeneration3SubmissionJournalProbeResult> {
  if (process.platform !== "win32") return generation3ProbeBlocked();
  if (
    typeof untrustedDirectory !== "string" ||
    untrustedDirectory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(untrustedDirectory) ||
    untrustedDirectory.includes("/") ||
    win32.normalize(untrustedDirectory) !== untrustedDirectory
  ) {
    return generation3ProbeBlocked();
  }
  const directory = resolve(untrustedDirectory);
  if (!isOutsideRepository(directory)) {
    return generation3ProbeBlocked();
  }
  return probeGeneration3AtDirectory(directory);
}

/** Test-only no-write generation-5 submission-v5 namespace probe. */
export async function probeWindowsBscTestnetPtaWbnbPoolGeneration4SubmissionJournalAtSyntheticDirectoryForTests(
  untrustedDirectory: unknown
): Promise<BscTestnetPtaWbnbPoolGeneration4SubmissionJournalProbeResult> {
  if (process.platform !== "win32") return generation4ProbeBlocked();
  if (
    typeof untrustedDirectory !== "string" ||
    untrustedDirectory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(untrustedDirectory) ||
    untrustedDirectory.includes("/") ||
    win32.normalize(untrustedDirectory) !== untrustedDirectory
  ) {
    return generation4ProbeBlocked();
  }
  const directory = resolve(untrustedDirectory);
  if (!isOutsideRepository(directory)) return generation4ProbeBlocked();
  return probeGeneration4AtDirectory(directory);
}

/** Test-only no-write generation-6 submission-v5 namespace probe. */
export async function probeWindowsBscTestnetPtaWbnbPoolGeneration5SubmissionJournalAtSyntheticDirectoryForTests(
  untrustedDirectory: unknown
): Promise<BscTestnetPtaWbnbPoolGeneration5SubmissionJournalProbeResult> {
  if (process.platform !== "win32") return generation5ProbeBlocked();
  if (
    typeof untrustedDirectory !== "string" ||
    untrustedDirectory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(untrustedDirectory) ||
    untrustedDirectory.includes("/") ||
    win32.normalize(untrustedDirectory) !== untrustedDirectory
  ) {
    return generation5ProbeBlocked();
  }
  const directory = resolve(untrustedDirectory);
  if (!isOutsideRepository(directory)) return generation5ProbeBlocked();
  return probeGeneration5AtDirectory(directory);
}

/** Test-only terminal-evidence facade over a previously branded synthetic startup observation. */
export async function openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationAtSyntheticDirectoryForTests(
  untrustedDirectory: unknown,
  expectedState: unknown
): Promise<BscTestnetPtaWbnbPoolExistingSubmissionTerminalRecoveryResult> {
  if (process.platform !== "win32") return terminalRecoveryBlocked();
  if (
    typeof untrustedDirectory !== "string" ||
    untrustedDirectory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(untrustedDirectory) ||
    untrustedDirectory.includes("/") ||
    win32.normalize(untrustedDirectory) !== untrustedDirectory
  ) {
    return terminalRecoveryBlocked();
  }
  const directory = resolve(untrustedDirectory);
  if (!isOutsideRepository(directory)) {
    return terminalRecoveryBlocked();
  }
  return openTerminalRecoveryAtDirectory(directory, expectedState);
}
