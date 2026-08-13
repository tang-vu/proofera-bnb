import "server-only";

import { createHash } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import type { Hex } from "viem";

import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse,
  type BscTestnetPtaWbnbPoolSubmissionCapability,
  type BscTestnetPtaWbnbPoolSubmissionJournal,
  type BscTestnetPtaWbnbPoolSubmissionJournalState,
  type BscTestnetPtaWbnbPoolSubmissionStartedRequest,
  type BscTestnetPtaWbnbPoolTerminalReconciliationRequest
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SUBDIRECTORY = ["ProofEra", "operations", "bsc-testnet-pta-wbnb-pool-submission-v2"] as const;
const SCHEMA = "bsc_testnet_pta_wbnb_pool_submission_journal_v2" as const;
const SIGNED_COMMIT_FILE = "01-signed-commit.v2.json" as const;
const SUBMISSION_STARTED_FILE = "02-submission-started.v2.json" as const;
const TERMINAL_RECONCILIATION_FILE = "03-terminal-reconciliation.v2.json" as const;
const FILES = Object.freeze([
  SIGNED_COMMIT_FILE,
  SUBMISSION_STARTED_FILE,
  TERMINAL_RECONCILIATION_FILE
] as const);

function isJournalFileName(value: string): boolean {
  return FILES.some((name) => name === value);
}
const MAXIMUM_RECORD_BYTES = 32_768;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const RELEASE_COMMIT = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY = Object.freeze({
  kind: "exact_owner_signature_and_single_broadcast_authorization_v2" as const,
  decision: "authorize_one_chain_97_pool_initialization_signature_and_single_broadcast" as const,
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

export type BscTestnetPtaWbnbPoolDurableOwnerV2Policy =
  typeof BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY;

export interface BscTestnetPtaWbnbPoolDurableSignedCommitRequest {
  readonly schemaVersion: 1;
  readonly kind: "authenticated_owner_v2_signed_submission_commit_v1";
  readonly ownerAuthorizationPolicy: BscTestnetPtaWbnbPoolDurableOwnerV2Policy;
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
      ownerAuthorizationPolicy: BscTestnetPtaWbnbPoolDurableOwnerV2Policy | null;
      signedCommitSha256: Hex | null;
      submissionStartedRecordSha256: Hex | null;
      journalEvidenceOnly: true;
      authorityReauthenticationRequired: true;
      sendingAuthorizedByJournal: false;
    }>
  | Readonly<{
      schemaVersion: 1;
      journalSchema: typeof SCHEMA;
      state: "signed_committed" | "submission_started" | "confirmed" | "reverted";
      ownerAuthorizationPolicy: BscTestnetPtaWbnbPoolDurableOwnerV2Policy;
      capability: BscTestnetPtaWbnbPoolSubmissionCapability;
      signedCommitSha256: Hex;
      submissionStartedRecordSha256: Hex | null;
      reconciliationDigest: Hex | null;
      journalEvidenceOnly: true;
      authorityReauthenticationRequired: true;
      sendingAuthorizedByJournal: false;
    }>;

const BINDING_KEYS = [
  "claimId",
  "envelopeHash",
  "operationKey",
  "ownerAuthorizationDigest",
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
  "retryAllowed"
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
  "releaseCommit",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "schemaVersion",
  "scope",
  "signedCommitDurablyVerified",
  "transaction"
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
  | "signingHash"
  | "transactionHash"
  | "signedTransactionKeccak256"
  | "submissionStartedDigest"
>;

type SignedCommitRecord = Readonly<{
  schema: typeof SCHEMA;
  kind: "signed_commit";
  recordedAt: string;
  ownerAuthorizationPolicy: BscTestnetPtaWbnbPoolDurableOwnerV2Policy;
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

function exactOwnerV2Policy(input: unknown): BscTestnetPtaWbnbPoolDurableOwnerV2Policy | null {
  const record = inspectRecord(input, POLICY_KEYS);
  return record !== null &&
    POLICY_KEYS.every(
      (key) => record[key] === BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY[key]
    )
    ? BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY
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
  if (root === null || preSubmission === null || transaction === null) return null;
  const snapshot: Record<string, unknown> = {};
  for (const key of CAPABILITY_KEYS) {
    snapshot[key] =
      key === "preSubmission"
        ? orderedFrozenRecord(preSubmission, PRE_SUBMISSION_KEYS)
        : key === "transaction"
          ? orderedFrozenRecord(transaction, CAPABILITY_TRANSACTION_KEYS)
          : root[key];
  }
  return Object.freeze(snapshot) as unknown as BscTestnetPtaWbnbPoolSubmissionCapability;
}

type ParsedSignedCommitRequest = Readonly<{
  capability: BscTestnetPtaWbnbPoolSubmissionCapability;
  binding: Binding;
  ownerAuthorizationPolicy: BscTestnetPtaWbnbPoolDurableOwnerV2Policy;
}>;

async function parseSignedCommitRequest(
  input: unknown,
  asOf: Date
): Promise<ParsedSignedCommitRequest | null> {
  const record = inspectRecord(input, SIGNED_COMMIT_REQUEST_KEYS);
  const policy = record === null ? null : exactOwnerV2Policy(record.ownerAuthorizationPolicy);
  const capability = record === null ? null : snapshotCapability(record.capability);
  if (
    record === null ||
    policy === null ||
    capability === null ||
    record.schemaVersion !== 1 ||
    record.kind !== "authenticated_owner_v2_signed_submission_commit_v1"
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
    !exactHex32(input.submissionStartedDigest)
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
    signingHash: input.signingHash,
    transactionHash: input.transactionHash,
    signedTransactionKeccak256: input.signedTransactionKeccak256,
    submissionStartedDigest: input.submissionStartedDigest
  });
}

function sameBinding(left: Binding, right: Binding): boolean {
  return BINDING_KEYS.every((key) => left[key] === right[key]);
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
  const policy = exact === null ? null : exactOwnerV2Policy(exact.ownerAuthorizationPolicy);
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
): BscTestnetPtaWbnbPoolDurableSubmissionJournal {
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

  const readRecoveryState = async (): Promise<BscTestnetPtaWbnbPoolSubmissionRecoveryState> => {
    const snapshot = await readSnapshot();
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
      schemaVersion: 1 as const,
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
    commitSubmissionStarted,
    commitTerminalReconciliation
  });
}

const PREPARE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if ([String]::IsNullOrWhiteSpace($base)) { throw 'base' }
  $baseItem = Get-Item -LiteralPath $base -Force
  if (-not $baseItem.PSIsContainer -or (($baseItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'base' }
  $cursor = $baseItem.FullName
  foreach ($segment in @('ProofEra', 'operations', 'bsc-testnet-pta-wbnb-pool-submission-v2')) {
    $candidate = [IO.Path]::GetFullPath([IO.Path]::Combine($cursor, $segment))
    if ([IO.Path]::GetDirectoryName($candidate) -ne [IO.Path]::GetFullPath($cursor)) { throw 'escape' }
    if (-not (Test-Path -LiteralPath $candidate)) { [void](New-Item -ItemType Directory -Path $candidate) }
    $item = Get-Item -LiteralPath $candidate -Force
    if (-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'path' }
    $cursor = $item.FullName
  }
  $allowed = @('01-signed-commit.v2.json','02-submission-started.v2.json','03-terminal-reconciliation.v2.json')
  foreach ($child in @(Get-ChildItem -LiteralPath $cursor -Force)) {
    if ($child.PSIsContainer -or ($allowed -notcontains $child.Name) -or (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $child.LinkType) { throw 'child' }
  }
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($current)
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
  $acl = [System.Security.AccessControl.FileSecurity]::new()
  $acl.SetOwner($current)
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

async function verifyPaths(directory: string, names: readonly string[]): Promise<boolean> {
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
    if (!isJournalFileName(name)) return false;
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

function expectedDirectory(value: unknown): string | null {
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
  const expectedSuffix = win32.join(...SUBDIRECTORY).toLowerCase();
  if (!directory.toLowerCase().endsWith(expectedSuffix)) return null;
  const relation = relative(REPOSITORY_ROOT, resolve(directory));
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")
    ? null
    : resolve(directory);
}

function createWindowsAdapter(directory: string): BscTestnetPtaWbnbPoolDurableSubmissionJournal {
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

/** Fixed current-user-only Windows composition. No caller path or mutable storage choice exists. */
export async function createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(): Promise<BscTestnetPtaWbnbPoolDurableSubmissionJournal> {
  if (process.platform !== "win32") {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_WINDOWS_REQUIRED");
  }
  const directory = expectedDirectory(await powershellJson(PREPARE_SCRIPT, {}, 1_024));
  if (directory === null || !(await verifyPaths(directory, []))) {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");
  }
  return createWindowsAdapter(directory);
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
  const relation = relative(REPOSITORY_ROOT, directory);
  if (
    relation === "" ||
    (!relation.startsWith(`..${sep}`) && relation !== "..") ||
    !(await verifyPaths(directory, []))
  ) {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_TEST_DIRECTORY_INVALID");
  }
  return createWindowsAdapter(directory);
}
