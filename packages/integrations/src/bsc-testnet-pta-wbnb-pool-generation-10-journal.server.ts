import "server-only";

import { createHash } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import { keccak256, type Hex } from "viem";

import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
  type BscTestnetPtaWbnbPoolGeneration10PredecessorBinding
} from "./bsc-testnet-pta-wbnb-pool-generation-10-recovery";
import {
  deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse,
  type BscTestnetPtaWbnbPoolSubmissionCapability,
  type BscTestnetPtaWbnbPoolSubmissionJournal,
  type BscTestnetPtaWbnbPoolSubmissionJournalState,
  type BscTestnetPtaWbnbPoolSubmissionStartedRequest,
  type BscTestnetPtaWbnbPoolTerminalReconciliationJournal,
  type BscTestnetPtaWbnbPoolTerminalReconciliationRequest
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SUBDIRECTORY = ["ProofEra", "operations", "bsc-testnet-pta-wbnb-pool-submission-v9"] as const;
const SCHEMA = "bsc_testnet_pta_wbnb_pool_existing_signature_send_recovery_v11" as const;
const START_FILE = "01-submission-started-existing-signature.v11.json" as const;
const TERMINAL_FILE = "02-terminal-reconciliation.v11.json" as const;
const FILES = Object.freeze([START_FILE, TERMINAL_FILE]);
const MAXIMUM_RECORD_BYTES = 32_768;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const GIT_OBJECT = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const BROADCAST_POLICY = "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity" as const;

type DataRecord = Readonly<Record<string, unknown>>;

export interface BscTestnetPtaWbnbPoolGeneration10JournalMetadata {
  readonly schemaVersion: 11;
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10;
  readonly attemptId: Hex;
  readonly releaseTree: string;
  readonly policyDigest: Hex;
  readonly reviewedSubjectSha256: Hex;
  readonly predecessorBundleDigest: Hex;
  readonly predecessorSignedCommitSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256;
  readonly newSignatureAuthorized: false;
  readonly maximumAdditionalSignatures: "0";
  readonly maximumSends: "1";
  readonly broadcastPolicy: typeof BROADCAST_POLICY;
}

export type BscTestnetPtaWbnbPoolGeneration10JournalRecoveryState =
  | Readonly<{ state: "empty" }>
  | Readonly<{
      state: "submission_started" | "confirmed" | "reverted";
      capability: BscTestnetPtaWbnbPoolSubmissionCapability;
      metadata: BscTestnetPtaWbnbPoolGeneration10JournalMetadata;
      startRecordSha256: Hex;
      terminalRecordSha256: Hex | null;
      reconciliationDigest: Hex | null;
      journalEvidenceOnly: true;
      sendingAuthorizedByJournal: false;
    }>
  | Readonly<{
      state: "unknown_outcome";
      capability: BscTestnetPtaWbnbPoolSubmissionCapability | null;
      metadata: BscTestnetPtaWbnbPoolGeneration10JournalMetadata | null;
      startRecordSha256: Hex | null;
      terminalRecordSha256: Hex | null;
      reconciliationDigest: null;
      journalEvidenceOnly: true;
      sendingAuthorizedByJournal: false;
    }>;

export interface BscTestnetPtaWbnbPoolGeneration10Journal extends BscTestnetPtaWbnbPoolSubmissionJournal {
  readonly readRecoveryState: () => Promise<BscTestnetPtaWbnbPoolGeneration10JournalRecoveryState>;
  readonly consumeCreatedStartToken: (transactionHash: Hex) => boolean;
}

export interface BscTestnetPtaWbnbPoolGeneration10JournalRecoveryReader {
  readonly readRecoveryState: () => Promise<BscTestnetPtaWbnbPoolGeneration10JournalRecoveryState>;
  readonly readState: () => Promise<unknown>;
}

export type BscTestnetPtaWbnbPoolExistingGeneration10JournalResult =
  | Readonly<{
      status: "absent";
      journal: null;
      state: Readonly<{ state: "empty" }>;
      issue: null;
    }>
  | Readonly<{
      status: "opened";
      journal: BscTestnetPtaWbnbPoolGeneration10JournalRecoveryReader;
      terminalJournal: BscTestnetPtaWbnbPoolTerminalReconciliationJournal;
      state: Exclude<BscTestnetPtaWbnbPoolGeneration10JournalRecoveryState, { state: "empty" }>;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      journal: null;
      terminalJournal: null;
      state: null;
      issue: Readonly<{ code: "GENERATION_10_SUBMISSION_JOURNAL_INVALID"; message: string }>;
    }>;

interface JournalPorts {
  readonly now: () => Date;
  readonly listNames: () => Promise<readonly string[]>;
  readonly readBounded: (name: string) => Promise<string | null>;
  readonly createExclusive: (name: string, content: string) => Promise<"created" | "exists">;
  readonly assertSecure: (names: readonly string[]) => Promise<boolean>;
}

interface StoredStart {
  readonly record: DataRecord;
  readonly capability: BscTestnetPtaWbnbPoolSubmissionCapability;
  readonly metadata: BscTestnetPtaWbnbPoolGeneration10JournalMetadata;
  readonly state: BscTestnetPtaWbnbPoolSubmissionJournalState;
  readonly sha256: Hex;
}

interface Snapshot {
  readonly state: "empty" | "submission_started" | "confirmed" | "reverted" | "unknown_outcome";
  readonly start: StoredStart | null;
  readonly terminalSha256: Hex | null;
  readonly reconciliationDigest: Hex | null;
}

function inspectRecord(input: unknown, expectedKeys?: readonly string[]): DataRecord | null {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      isProxy(input) ||
      Object.getPrototypeOf(input) !== Object.prototype
    ) {
      return null;
    }
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) return null;
    if (expectedKeys !== undefined) {
      const actual = (keys as string[]).sort();
      const expected = [...expectedKeys].sort();
      if (
        actual.length !== expected.length ||
        actual.some((key, index) => key !== expected[index])
      ) {
        return null;
      }
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (
      Object.values(descriptors).some(
        (descriptor) =>
          !("value" in descriptor) ||
          descriptor.enumerable !== true ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined
      )
    ) {
      return null;
    }
    return input as DataRecord;
  } catch {
    return null;
  }
}

function exactUtc(input: unknown): input is string {
  if (typeof input !== "string" || !UTC.test(input)) return false;
  const milliseconds = Date.parse(input);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === input;
}

function captureNow(now: () => Date): string | null {
  try {
    const value = Reflect.apply(now, undefined, []);
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

function exactMetadata(input: unknown): BscTestnetPtaWbnbPoolGeneration10JournalMetadata | null {
  const value = inspectRecord(input, [
    "attemptId",
    "broadcastPolicy",
    "generation",
    "maximumAdditionalSignatures",
    "maximumSends",
    "newSignatureAuthorized",
    "policyDigest",
    "predecessorBundleDigest",
    "predecessorSignedCommitSha256",
    "releaseTree",
    "reviewedSubjectSha256",
    "schemaVersion"
  ]);
  if (
    value === null ||
    value.schemaVersion !== 11 ||
    value.generation !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10 ||
    typeof value.attemptId !== "string" ||
    !BYTES32.test(value.attemptId) ||
    typeof value.releaseTree !== "string" ||
    !GIT_OBJECT.test(value.releaseTree) ||
    typeof value.policyDigest !== "string" ||
    !BYTES32.test(value.policyDigest) ||
    typeof value.reviewedSubjectSha256 !== "string" ||
    !BYTES32.test(value.reviewedSubjectSha256) ||
    typeof value.predecessorBundleDigest !== "string" ||
    !BYTES32.test(value.predecessorBundleDigest) ||
    value.predecessorSignedCommitSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256 ||
    value.newSignatureAuthorized !== false ||
    value.maximumAdditionalSignatures !== "0" ||
    value.maximumSends !== "1" ||
    value.broadcastPolicy !== BROADCAST_POLICY
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: 11,
    generation: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10,
    attemptId: value.attemptId as Hex,
    releaseTree: value.releaseTree,
    policyDigest: value.policyDigest as Hex,
    reviewedSubjectSha256: value.reviewedSubjectSha256 as Hex,
    predecessorBundleDigest: value.predecessorBundleDigest as Hex,
    predecessorSignedCommitSha256:
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
    newSignatureAuthorized: false,
    maximumAdditionalSignatures: "0",
    maximumSends: "1",
    broadcastPolicy: BROADCAST_POLICY
  });
}

function projectionFromCapability(capability: BscTestnetPtaWbnbPoolSubmissionCapability): object {
  const { signedTransaction: _excluded, ...transaction } = capability.transaction;
  void _excluded;
  return Object.freeze({
    ...capability,
    transaction: Object.freeze({ ...transaction, signedTransactionExcluded: true as const })
  });
}

function rebuildCapability(
  projectionInput: unknown,
  signedTransaction: Hex
): BscTestnetPtaWbnbPoolSubmissionCapability | null {
  const projection = inspectRecord(projectionInput);
  const transaction = projection === null ? null : inspectRecord(projection.transaction);
  if (
    projection === null ||
    transaction === null ||
    transaction.signedTransactionExcluded !== true ||
    "signedTransaction" in transaction ||
    keccak256(signedTransaction) !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH
  ) {
    return null;
  }
  const { signedTransactionExcluded: _excluded, ...transactionBody } = transaction;
  void _excluded;
  return Object.freeze({
    ...projection,
    transaction: Object.freeze({ ...transactionBody, signedTransaction })
  }) as unknown as BscTestnetPtaWbnbPoolSubmissionCapability;
}

function sameStartedRequest(
  input: unknown,
  expected: BscTestnetPtaWbnbPoolSubmissionJournalState
): boolean {
  const request = inspectRecord(input, [
    "claimId",
    "envelopeHash",
    "operation",
    "operationKey",
    "ownerAuthorizationDigest",
    "recovery",
    "releaseCommit",
    "reviewerApprovalDigest",
    "runtimeManifestSha256",
    "schemaVersion",
    "signedTransactionKeccak256",
    "signingHash",
    "submissionStartedDigest",
    "transactionHash"
  ]);
  return (
    request !== null &&
    request.operation === "submit_exact_bsc_testnet_pta_wbnb_pool_initialization_once" &&
    request.schemaVersion === expected.schemaVersion &&
    request.operationKey === expected.operationKey &&
    request.claimId === expected.claimId &&
    request.envelopeHash === expected.envelopeHash &&
    request.releaseCommit === expected.releaseCommit &&
    request.runtimeManifestSha256 === expected.runtimeManifestSha256 &&
    request.reviewerApprovalDigest === expected.reviewerApprovalDigest &&
    request.ownerAuthorizationDigest === expected.ownerAuthorizationDigest &&
    JSON.stringify(request.recovery) === JSON.stringify(expected.recovery) &&
    request.signingHash === expected.signingHash &&
    request.transactionHash === expected.transactionHash &&
    request.signedTransactionKeccak256 === expected.signedTransactionKeccak256 &&
    request.submissionStartedDigest === expected.submissionStartedDigest
  );
}

function stateFrom(
  base: BscTestnetPtaWbnbPoolSubmissionJournalState,
  state: BscTestnetPtaWbnbPoolSubmissionJournalState["state"]
): BscTestnetPtaWbnbPoolSubmissionJournalState {
  return Object.freeze({ ...base, state });
}

function serialize(record: object): string {
  return `${JSON.stringify(record)}\n`;
}

function rawSha256(text: string): Hex {
  return `0x${createHash("sha256").update(text, "utf8").digest("hex")}` as Hex;
}

function parseCanonicalRecord(text: string | null): DataRecord | null {
  try {
    if (text === null || Buffer.byteLength(text, "utf8") > MAXIMUM_RECORD_BYTES) return null;
    const parsed = JSON.parse(text) as unknown;
    const record = inspectRecord(parsed);
    return record !== null && serialize(record) === text ? record : null;
  } catch {
    return null;
  }
}

async function parseStart(
  text: string | null,
  signedTransaction: Hex
): Promise<StoredStart | null> {
  const record = parseCanonicalRecord(text);
  const metadata = record === null ? null : exactMetadata(record.metadata);
  const capability =
    record === null
      ? null
      : rebuildCapability(record.capabilityWithoutSignedBytes, signedTransaction);
  if (
    record === null ||
    metadata === null ||
    capability === null ||
    Reflect.ownKeys(record).length !== 7 ||
    record.schema !== SCHEMA ||
    record.kind !== "submission_started_existing_signature" ||
    !exactUtc(record.recordedAt) ||
    record.predecessorSignedCommitSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256 ||
    typeof record.submissionStartedDigest !== "string" ||
    !BYTES32.test(record.submissionStartedDigest)
  ) {
    return null;
  }
  const base = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
    capability,
    new Date(record.recordedAt)
  );
  if (
    base === null ||
    base.transactionHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH ||
    base.submissionStartedDigest !== record.submissionStartedDigest
  ) {
    return null;
  }
  return Object.freeze({
    record,
    capability,
    metadata,
    state: stateFrom(base, "submission_started"),
    sha256: rawSha256(text as string)
  });
}

function terminalRequestMatches(
  input: unknown,
  start: StoredStart
): input is BscTestnetPtaWbnbPoolTerminalReconciliationRequest {
  const request = inspectRecord(input, [
    "claimId",
    "envelopeHash",
    "operation",
    "operationKey",
    "outcome",
    "ownerAuthorizationDigest",
    "reconciliationDigest",
    "recovery",
    "releaseCommit",
    "reviewerApprovalDigest",
    "runtimeManifestSha256",
    "schemaVersion",
    "signedTransactionKeccak256",
    "signingHash",
    "submissionStartedDigest",
    "transactionHash"
  ]);
  const state = start.state;
  return (
    request !== null &&
    request.operation === "reconcile_exact_bsc_testnet_pta_wbnb_pool_initialization" &&
    (request.outcome === "confirmed" || request.outcome === "reverted") &&
    typeof request.reconciliationDigest === "string" &&
    BYTES32.test(request.reconciliationDigest) &&
    request.schemaVersion === state.schemaVersion &&
    request.operationKey === state.operationKey &&
    request.claimId === state.claimId &&
    request.envelopeHash === state.envelopeHash &&
    request.releaseCommit === state.releaseCommit &&
    request.runtimeManifestSha256 === state.runtimeManifestSha256 &&
    request.reviewerApprovalDigest === state.reviewerApprovalDigest &&
    request.ownerAuthorizationDigest === state.ownerAuthorizationDigest &&
    JSON.stringify(request.recovery) === JSON.stringify(state.recovery) &&
    request.signingHash === state.signingHash &&
    request.transactionHash === state.transactionHash &&
    request.signedTransactionKeccak256 === state.signedTransactionKeccak256 &&
    request.submissionStartedDigest === state.submissionStartedDigest
  );
}

async function snapshot(ports: JournalPorts, signedTransaction: Hex): Promise<Snapshot> {
  try {
    const names = [...(await ports.listNames())].sort();
    if (
      new Set(names).size !== names.length ||
      names.some((name, index) => name !== FILES[index]) ||
      !(await ports.assertSecure(names))
    ) {
      return Object.freeze({
        state: "unknown_outcome",
        start: null,
        terminalSha256: null,
        reconciliationDigest: null
      });
    }
    if (names.length === 0) {
      return Object.freeze({
        state: "empty",
        start: null,
        terminalSha256: null,
        reconciliationDigest: null
      });
    }
    const start = await parseStart(await ports.readBounded(START_FILE), signedTransaction);
    if (start === null) {
      return Object.freeze({
        state: "unknown_outcome",
        start: null,
        terminalSha256: null,
        reconciliationDigest: null
      });
    }
    if (names.length === 1) {
      return Object.freeze({
        state: "submission_started",
        start,
        terminalSha256: null,
        reconciliationDigest: null
      });
    }
    const terminalText = await ports.readBounded(TERMINAL_FILE);
    const terminal = parseCanonicalRecord(terminalText);
    if (
      terminal === null ||
      Reflect.ownKeys(terminal).length !== 7 ||
      terminal.schema !== SCHEMA ||
      terminal.kind !== "terminal_reconciliation" ||
      !exactUtc(terminal.recordedAt) ||
      terminal.startRecordSha256 !== start.sha256 ||
      (terminal.outcome !== "confirmed" && terminal.outcome !== "reverted") ||
      typeof terminal.reconciliationDigest !== "string" ||
      !BYTES32.test(terminal.reconciliationDigest) ||
      !terminalRequestMatches(terminal.request, start) ||
      terminal.request.outcome !== terminal.outcome ||
      terminal.request.reconciliationDigest !== terminal.reconciliationDigest
    ) {
      return Object.freeze({
        state: "unknown_outcome",
        start,
        terminalSha256: null,
        reconciliationDigest: null
      });
    }
    return Object.freeze({
      state: terminal.outcome,
      start,
      terminalSha256: rawSha256(terminalText as string),
      reconciliationDigest: terminal.reconciliationDigest as Hex
    });
  } catch {
    return Object.freeze({
      state: "unknown_outcome",
      start: null,
      terminalSha256: null,
      reconciliationDigest: null
    });
  }
}

export async function createBscTestnetPtaWbnbPoolGeneration10JournalForInternalUse(
  untrustedPorts: unknown,
  capability: BscTestnetPtaWbnbPoolSubmissionCapability,
  metadataInput: unknown
): Promise<BscTestnetPtaWbnbPoolGeneration10Journal> {
  const ports = inspectRecord(untrustedPorts, [
    "assertSecure",
    "createExclusive",
    "listNames",
    "now",
    "readBounded"
  ]);
  const metadata = exactMetadata(metadataInput);
  const now = captureNow((ports?.now ?? (() => new Date(Number.NaN))) as () => Date);
  const base =
    now === null
      ? null
      : await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
          capability,
          new Date(now)
        );
  if (
    ports === null ||
    metadata === null ||
    base === null ||
    base.transactionHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH ||
    [ports.assertSecure, ports.createExclusive, ports.listNames, ports.now, ports.readBounded].some(
      (entry) => typeof entry !== "function" || isProxy(entry)
    )
  ) {
    throw new Error("GENERATION_10_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");
  }
  const fixedPorts = ports as unknown as JournalPorts;
  let startTokenAvailable = false;
  let terminalUnknown = false;

  const readSnapshot = async (): Promise<Snapshot> =>
    terminalUnknown
      ? Object.freeze({
          state: "unknown_outcome" as const,
          start: null,
          terminalSha256: null,
          reconciliationDigest: null
        })
      : snapshot(fixedPorts, capability.transaction.signedTransaction);

  const readState = async (): Promise<unknown> => {
    const current = await readSnapshot();
    if (current.state === "empty") return stateFrom(base, "signed_committed");
    if (current.start === null) return Object.freeze({ state: "unknown_outcome" as const });
    return stateFrom(current.start.state, current.state);
  };

  const readRecoveryState =
    async (): Promise<BscTestnetPtaWbnbPoolGeneration10JournalRecoveryState> => {
      const current = await readSnapshot();
      if (current.state === "empty") return Object.freeze({ state: "empty" as const });
      if (current.state === "unknown_outcome" || current.start === null) {
        return Object.freeze({
          state: "unknown_outcome" as const,
          capability: current.start?.capability ?? null,
          metadata: current.start?.metadata ?? null,
          startRecordSha256: current.start?.sha256 ?? null,
          terminalRecordSha256: null,
          reconciliationDigest: null,
          journalEvidenceOnly: true as const,
          sendingAuthorizedByJournal: false as const
        });
      }
      return Object.freeze({
        state: current.state,
        capability: current.start.capability,
        metadata: current.start.metadata,
        startRecordSha256: current.start.sha256,
        terminalRecordSha256: current.terminalSha256,
        reconciliationDigest: current.reconciliationDigest,
        journalEvidenceOnly: true as const,
        sendingAuthorizedByJournal: false as const
      });
    };

  const commitSubmissionStarted = async (
    request: BscTestnetPtaWbnbPoolSubmissionStartedRequest
  ): Promise<unknown> => {
    const before = await readSnapshot();
    if (before.state !== "empty") {
      if (
        before.start !== null &&
        sameStartedRequest(request, before.start.state) &&
        before.start.metadata.predecessorBundleDigest === metadata.predecessorBundleDigest
      ) {
        return Object.freeze({
          status: "already_started" as const,
          transactionHash: base.transactionHash,
          submissionStartedDigest: base.submissionStartedDigest
        });
      }
      throw new Error("GENERATION_10_SUBMISSION_START_OUTCOME_UNKNOWN");
    }
    const recordedAt = captureNow(fixedPorts.now);
    if (recordedAt === null || !sameStartedRequest(request, base)) {
      throw new Error("GENERATION_10_SUBMISSION_START_INVALID");
    }
    const record = Object.freeze({
      schema: SCHEMA,
      kind: "submission_started_existing_signature" as const,
      recordedAt,
      metadata,
      predecessorSignedCommitSha256:
        BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
      capabilityWithoutSignedBytes: projectionFromCapability(capability),
      submissionStartedDigest: base.submissionStartedDigest
    });
    let outcome: "created" | "exists";
    try {
      outcome = await fixedPorts.createExclusive(START_FILE, serialize(record));
    } catch {
      terminalUnknown = true;
      throw new Error("GENERATION_10_SUBMISSION_START_OUTCOME_UNKNOWN");
    }
    const after = await snapshot(fixedPorts, capability.transaction.signedTransaction);
    if (
      outcome !== "created" ||
      after.state !== "submission_started" ||
      after.start === null ||
      after.start.metadata.attemptId !== metadata.attemptId ||
      after.start.state.submissionStartedDigest !== base.submissionStartedDigest
    ) {
      terminalUnknown = true;
      throw new Error("GENERATION_10_SUBMISSION_START_OUTCOME_UNKNOWN");
    }
    startTokenAvailable = true;
    return Object.freeze({
      status: "started_by_this_call" as const,
      transactionHash: base.transactionHash,
      submissionStartedDigest: base.submissionStartedDigest
    });
  };

  const commitTerminalReconciliation = async (
    request: BscTestnetPtaWbnbPoolTerminalReconciliationRequest
  ): Promise<unknown> => {
    const before = await readSnapshot();
    if (before.start === null || !terminalRequestMatches(request, before.start)) {
      throw new Error("GENERATION_10_TERMINAL_RECONCILIATION_INVALID");
    }
    if (before.state === "confirmed" || before.state === "reverted") {
      if (
        before.state !== request.outcome ||
        before.reconciliationDigest !== request.reconciliationDigest
      ) {
        throw new Error("GENERATION_10_TERMINAL_RECONCILIATION_OUTCOME_UNKNOWN");
      }
    } else {
      if (before.state !== "submission_started") {
        throw new Error("GENERATION_10_TERMINAL_RECONCILIATION_OUTCOME_UNKNOWN");
      }
      const recordedAt = captureNow(fixedPorts.now);
      if (recordedAt === null) throw new Error("GENERATION_10_TERMINAL_RECONCILIATION_INVALID");
      const record = Object.freeze({
        schema: SCHEMA,
        kind: "terminal_reconciliation" as const,
        recordedAt,
        startRecordSha256: before.start.sha256,
        outcome: request.outcome,
        reconciliationDigest: request.reconciliationDigest,
        request
      });
      try {
        const outcome = await fixedPorts.createExclusive(TERMINAL_FILE, serialize(record));
        if (outcome !== "created") throw new Error("GENERATION_10_TERMINAL_EXISTS");
      } catch {
        terminalUnknown = true;
        throw new Error("GENERATION_10_TERMINAL_RECONCILIATION_OUTCOME_UNKNOWN");
      }
      const after = await snapshot(fixedPorts, capability.transaction.signedTransaction);
      if (
        after.state !== request.outcome ||
        after.reconciliationDigest !== request.reconciliationDigest
      ) {
        terminalUnknown = true;
        throw new Error("GENERATION_10_TERMINAL_RECONCILIATION_OUTCOME_UNKNOWN");
      }
    }
    return Object.freeze({
      status: request.outcome,
      transactionHash: request.transactionHash,
      submissionStartedDigest: request.submissionStartedDigest,
      reconciliationDigest: request.reconciliationDigest
    });
  };

  return Object.freeze({
    readState,
    readRecoveryState,
    commitSubmissionStarted,
    commitTerminalReconciliation,
    consumeCreatedStartToken: (transactionHash: Hex): boolean => {
      if (
        !startTokenAvailable ||
        transactionHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH
      ) {
        return false;
      }
      startTokenAvailable = false;
      return true;
    }
  });
}

export function narrowBscTestnetPtaWbnbPoolGeneration10JournalForSubmissionForInternalUse(
  journal: BscTestnetPtaWbnbPoolGeneration10Journal
): BscTestnetPtaWbnbPoolSubmissionJournal {
  return Object.freeze({
    readState: () => journal.readState(),
    commitSubmissionStarted: (request: BscTestnetPtaWbnbPoolSubmissionStartedRequest) =>
      journal.commitSubmissionStarted(request),
    commitTerminalReconciliation: (request: BscTestnetPtaWbnbPoolTerminalReconciliationRequest) =>
      journal.commitTerminalReconciliation(request)
  });
}

const LOCAL_APPLICATION_DATA_READ_ONLY_PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if ([String]::IsNullOrWhiteSpace($base)) { throw 'base' }
  $item = Get-Item -LiteralPath $base -Force
  if (-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'path' }
  [Console]::Out.Write((@{ localApplicationData = $item.FullName } | ConvertTo-Json -Compress))
} catch { exit 70 }
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
  foreach ($segment in @('ProofEra', 'operations', 'bsc-testnet-pta-wbnb-pool-submission-v9')) {
    $candidate = [IO.Path]::GetFullPath([IO.Path]::Combine($cursor, $segment))
    if ([IO.Path]::GetDirectoryName($candidate) -ne [IO.Path]::GetFullPath($cursor)) { throw 'escape' }
    if (-not (Test-Path -LiteralPath $candidate)) { [void](New-Item -ItemType Directory -Path $candidate) }
    $item = Get-Item -LiteralPath $candidate -Force
    if (-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'path' }
    $cursor = $item.FullName
  }
  $allowed = @('01-submission-started-existing-signature.v11.json','02-terminal-reconciliation.v11.json')
  foreach ($child in @(Get-ChildItem -LiteralPath $cursor -Force)) {
    if ($child.PSIsContainer -or ($allowed -notcontains $child.Name) -or (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $child.LinkType) { throw 'child' }
  }
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $existingAcl = Get-Acl -LiteralPath $cursor
  $owner = try { ([System.Security.Principal.SecurityIdentifier]::new($existingAcl.Owner)).Value } catch { ([System.Security.Principal.NTAccount]::new($existingAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value }
  if ($owner -ne $current.Value) { throw 'owner' }
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,$inherit,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow))
  [IO.Directory]::SetAccessControl($cursor, $acl)
  [Console]::Out.Write((@{ localApplicationData = $baseItem.FullName; directory = $cursor } | ConvertTo-Json -Compress))
} catch { exit 71 }
`;

const ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $spec = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  foreach ($path in @($spec.paths)) {
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
    }
  }
  [Console]::Out.Write('{"ok":true}')
} catch { exit 72 }
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
  $owner = try { ([System.Security.Principal.SecurityIdentifier]::new($existingAcl.Owner)).Value } catch { ([System.Security.Principal.NTAccount]::new($existingAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value }
  if ($owner -ne $current.Value) { throw 'owner' }
  $acl = [System.Security.AccessControl.FileSecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.AccessControlType]::Allow))
  [IO.File]::SetAccessControl($file.FullName, $acl)
  [Console]::Out.Write('{"ok":true}')
} catch { exit 73 }
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

function isOutsideRepository(candidate: string): boolean {
  const relation = relative(REPOSITORY_ROOT, candidate);
  return relation !== "" && (relation === ".." || relation.startsWith(`..${sep}`));
}

function expectedDirectory(base: unknown): string | null {
  if (typeof base !== "string" || !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(base)) return null;
  const directory = resolve(win32.join(base, ...SUBDIRECTORY));
  return isOutsideRepository(directory) ? directory : null;
}

async function stableDirectory(path: string): Promise<"present" | "absent"> {
  try {
    const before = await lstat(path, { bigint: true });
    const canonical = await realpath(path);
    const after = await lstat(path, { bigint: true });
    if (
      !before.isDirectory() ||
      before.isSymbolicLink() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.birthtimeNs !== after.birthtimeNs ||
      win32.normalize(canonical).toLowerCase() !== win32.normalize(path).toLowerCase()
    ) {
      throw new Error("GENERATION_10_SUBMISSION_DIRECTORY_INVALID");
    }
    return "present";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
}

async function readOnlyDirectory(): Promise<string | null> {
  const result = inspectRecord(
    await powershellJson(LOCAL_APPLICATION_DATA_READ_ONLY_PROBE_SCRIPT, {}, 1_024),
    ["localApplicationData"]
  );
  const base = result?.localApplicationData;
  const expected = expectedDirectory(base);
  if (expected === null || typeof base !== "string") throw new Error("DIRECTORY_INVALID");
  let cursor = resolve(base);
  for (const segment of SUBDIRECTORY) {
    const candidate = win32.join(cursor, segment);
    if ((await stableDirectory(candidate)) === "absent") return null;
    cursor = candidate;
  }
  return win32.normalize(cursor).toLowerCase() === win32.normalize(expected).toLowerCase()
    ? expected
    : null;
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
      throw new Error("GENERATION_10_SUBMISSION_FILE_INVALID");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.nlink !== after.nlink ||
      after.nlink !== 1n ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new Error("GENERATION_10_SUBMISSION_FILE_CHANGED");
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
  if ((await stableDirectory(directory)) !== "present") return false;
  for (const name of names) {
    if (!FILES.includes(name as (typeof FILES)[number])) return false;
    const path = win32.join(directory, name);
    const before = await lstat(path, { bigint: true });
    const canonical = await realpath(path);
    const after = await lstat(path, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.nlink !== after.nlink ||
      after.nlink !== 1n ||
      win32.normalize(canonical).toLowerCase() !== win32.normalize(path).toLowerCase()
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

function adapter(directory: string): JournalPorts {
  return Object.freeze({
    now: () => new Date(),
    listNames: async () => {
      const entries = await readdir(directory, { withFileTypes: true });
      const names: string[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !FILES.includes(entry.name as (typeof FILES)[number])) {
          throw new Error("GENERATION_10_SUBMISSION_DIRECTORY_CONTAMINATED");
        }
        names.push(entry.name);
      }
      return Object.freeze(names.sort());
    },
    readBounded: (name: string) => readBounded(win32.join(directory, name)),
    createExclusive: async (name: string, content: string) => {
      if (
        !FILES.includes(name as (typeof FILES)[number]) ||
        !content.endsWith("\n") ||
        Buffer.byteLength(content, "utf8") > MAXIMUM_RECORD_BYTES
      ) {
        throw new Error("GENERATION_10_SUBMISSION_FILE_INVALID");
      }
      const path = win32.join(directory, name);
      let handle;
      try {
        handle = await open(path, "wx", 0o600);
        await handle.writeFile(content, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        const protectedResult = inspectRecord(
          await powershellJson(PROTECT_SCRIPT, { directory, file: path }, 32),
          ["ok"]
        );
        if (protectedResult?.ok !== true || !(await verifyPaths(directory, [name]))) {
          throw new Error("GENERATION_10_SUBMISSION_ACL_INVALID");
        }
        let syncHandle;
        try {
          syncHandle = await open(path, "r+");
          await syncHandle.sync();
        } finally {
          await syncHandle?.close().catch(() => undefined);
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
  });
}

export async function createWindowsBscTestnetPtaWbnbPoolGeneration10JournalForInternalUse(
  capability: BscTestnetPtaWbnbPoolSubmissionCapability,
  metadata: BscTestnetPtaWbnbPoolGeneration10JournalMetadata
): Promise<BscTestnetPtaWbnbPoolGeneration10Journal> {
  if (process.platform !== "win32") throw new Error("GENERATION_10_SUBMISSION_WINDOWS_REQUIRED");
  const prepared = inspectRecord(await powershellJson(PREPARE_SCRIPT, {}, 1_024), [
    "directory",
    "localApplicationData"
  ]);
  const directory = expectedDirectory(prepared?.localApplicationData);
  if (
    typeof prepared?.directory !== "string" ||
    directory === null ||
    win32.normalize(directory).toLowerCase() !== win32.normalize(prepared.directory).toLowerCase()
  ) {
    throw new Error("GENERATION_10_SUBMISSION_DIRECTORY_INVALID");
  }
  return createBscTestnetPtaWbnbPoolGeneration10JournalForInternalUse(
    adapter(directory),
    capability,
    metadata
  );
}

function recoveryBlocked(): BscTestnetPtaWbnbPoolExistingGeneration10JournalResult {
  return Object.freeze({
    status: "blocked" as const,
    journal: null,
    terminalJournal: null,
    state: null,
    issue: Object.freeze({
      code: "GENERATION_10_SUBMISSION_JOURNAL_INVALID" as const,
      message: "The generation-10 submission recovery journal is not exact."
    })
  });
}

export async function openExistingWindowsBscTestnetPtaWbnbPoolGeneration10JournalForRecoveryForInternalUse(
  predecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding,
  signedTransaction: Hex
): Promise<BscTestnetPtaWbnbPoolExistingGeneration10JournalResult> {
  if (
    process.platform !== "win32" ||
    predecessor.transactionHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH ||
    predecessor.signedCommitSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256 ||
    keccak256(signedTransaction) !== predecessor.transactionHash
  ) {
    return recoveryBlocked();
  }
  try {
    const directory = await readOnlyDirectory();
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: Object.freeze({ state: "empty" as const }),
        issue: null
      });
    }
    const ports = adapter(directory);
    const current = await snapshot(ports, signedTransaction);
    if (current.state === "empty") {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: Object.freeze({ state: "empty" as const }),
        issue: null
      });
    }
    if (current.state === "unknown_outcome" || current.start === null) return recoveryBlocked();
    const recoveryState = Object.freeze({
      state: current.state,
      capability: current.start.capability,
      metadata: current.start.metadata,
      startRecordSha256: current.start.sha256,
      terminalRecordSha256: current.terminalSha256,
      reconciliationDigest: current.reconciliationDigest,
      journalEvidenceOnly: true as const,
      sendingAuthorizedByJournal: false as const
    });
    const retainedState = current.state;
    const retainedStart = current.start;
    const readState = async (): Promise<unknown> => stateFrom(retainedStart.state, retainedState);
    const commitTerminalReconciliation = async (
      request: BscTestnetPtaWbnbPoolTerminalReconciliationRequest
    ): Promise<unknown> => {
      const active = await createBscTestnetPtaWbnbPoolGeneration10JournalForInternalUse(
        ports,
        retainedStart.capability,
        retainedStart.metadata
      );
      return active.commitTerminalReconciliation(request);
    };
    return Object.freeze({
      status: "opened" as const,
      journal: Object.freeze({ readRecoveryState: async () => recoveryState, readState }),
      terminalJournal: Object.freeze({ readState, commitTerminalReconciliation }),
      state: recoveryState,
      issue: null
    });
  } catch {
    return recoveryBlocked();
  }
}
