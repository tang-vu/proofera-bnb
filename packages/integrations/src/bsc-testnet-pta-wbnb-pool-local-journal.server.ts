import "server-only";

import { createHash } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import { keccak256, type Address, type Hex } from "viem";

import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  parseBscTestnetPtaWbnbPoolSigningWorkerRequestForInternalUse,
  validateBscTestnetPtaWbnbPoolSigningWorkerRequest,
  validateBscTestnetPtaWbnbPoolSigningWorkerResponse,
  type BscTestnetPtaWbnbPoolSigningWorkerRequest,
  type BscTestnetPtaWbnbPoolSigningWorkerResponse
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const JOURNAL_SUBDIRECTORY = ["ProofEra", "operations", "bsc-testnet-pta-wbnb-pool-v1"] as const;
const SCHEMA_VERSION = "bsc_testnet_pta_wbnb_pool_local_journal_v1" as const;
const AUTHORIZATION_KIND = "exact_pta_wbnb_pool_initialization_user_authorization_v1" as const;
const MAXIMUM_RECORD_BYTES = 32_768;
const MAXIMUM_AUTHORIZATION_LIFETIME_MILLISECONDS = 5 * 60 * 1_000;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const RAW_TRANSACTION = /^0x[0-9a-f]+$/u;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/u;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const RELEASE_COMMIT = /^[0-9a-f]{40}$/u;
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;

const SLOT_FILES = Object.freeze([
  "01-claim.v1.json",
  "02-transition.v1.json",
  "03-transition.v1.json",
  "04-transition.v1.json",
  "05-transition.v1.json"
]);

export { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY };

export interface BscTestnetPtaWbnbPoolClaimRequest {
  readonly operationKey: Hex;
  readonly envelopeHash: Hex;
  readonly signingHash: Hex;
  readonly serializedUnsignedSha256: Hex;
  readonly gasLimit: string;
  readonly gasPriceWei: string;
  readonly maxCostWei: string;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly authorizedAt: string;
  readonly expiresAt: string;
  /** Integrity only. It is not authentication or authorization by itself. */
  readonly authorizationReceiptSha256: Hex;
}

interface JournalBinding {
  readonly claimId: string;
  readonly operationKey: Hex;
  readonly envelopeHash: Hex;
  readonly authorizationReceiptSha256: Hex;
  readonly signingHash: Hex;
  readonly serializedUnsignedSha256: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolWorkerAuthorizationRequest extends JournalBinding {
  readonly workerRequestHash: Hex;
  readonly authorizationTokenDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolWorkerStartRequest extends JournalBinding {
  readonly workerRequestHash: Hex;
  readonly authorizationToken: Hex;
}

interface ValidatedWorkerSignedCommit extends JournalBinding {
  readonly workerRequestHash: Hex;
  readonly serializedTransaction: Hex;
  readonly transactionHash: Hex;
  readonly recoveredSigner: Address;
}

interface RetainedTransactionBinding extends JournalBinding {
  readonly serializedTransaction: Hex;
  readonly transactionHash: Hex;
}

export interface BscTestnetPtaWbnbPoolTerminalRequest extends JournalBinding {
  readonly outcomeDigest: Hex;
  readonly serializedTransaction?: Hex;
  readonly transactionHash?: Hex;
}

export type BscTestnetPtaWbnbPoolLocalJournalStatus =
  | "empty"
  | "claimed"
  | "worker_authorized"
  | "worker_started"
  | "signed_committed"
  | "failed_before_submission"
  | "unknown_outcome";

export interface BscTestnetPtaWbnbPoolLocalJournalState {
  readonly status: BscTestnetPtaWbnbPoolLocalJournalStatus;
  readonly claimId: string | null;
  readonly operationKey: Hex | null;
  readonly envelopeHash: Hex | null;
  readonly authorizationReceiptSha256: Hex | null;
  readonly signingHash: Hex | null;
  readonly serializedUnsignedSha256: Hex | null;
  readonly reviewerApprovalDigest: Hex | null;
  readonly ownerAuthorizationDigest: Hex | null;
  readonly releaseCommit: string | null;
  readonly runtimeManifestSha256: Hex | null;
  readonly gasLimit: string | null;
  readonly gasPriceWei: string | null;
  readonly maxCostWei: string | null;
  readonly authorizedAt: string | null;
  readonly expiresAt: string | null;
  readonly serializedTransaction: Hex | null;
  readonly transactionHash: Hex | null;
}

export interface BscTestnetPtaWbnbPoolLocalJournal {
  readonly claimExactInitialization: (request: BscTestnetPtaWbnbPoolClaimRequest) => Promise<
    | Readonly<{ status: "claimed"; claimId: string }>
    | Readonly<{
        status: "already_claimed";
        claimId: string;
        state: Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty">;
      }>
  >;
  readonly authorizeWorker: (
    request: BscTestnetPtaWbnbPoolWorkerAuthorizationRequest
  ) => Promise<Readonly<{ status: "worker_authorized" }>>;
  readonly startWorker: (
    request: BscTestnetPtaWbnbPoolWorkerStartRequest
  ) => Promise<Readonly<{ status: "worker_started" }>>;
  /** Worker-only fixed request seam; must complete before any custody access. */
  readonly consumeWorkerAuthorization: (
    workerRequest: BscTestnetPtaWbnbPoolSigningWorkerRequest
  ) => Promise<Readonly<{ status: "worker_started" }>>;
  /** The only signed-byte commit seam; it revalidates the exact worker request and response. */
  readonly commitWorkerSignedTransaction: (
    workerRequest: BscTestnetPtaWbnbPoolSigningWorkerRequest,
    workerResponse: BscTestnetPtaWbnbPoolSigningWorkerResponse
  ) => Promise<Readonly<{ status: "signed_committed" }>>;
  readonly failBeforeSubmission: (
    request: BscTestnetPtaWbnbPoolTerminalRequest
  ) => Promise<Readonly<{ status: "failed_before_submission" }>>;
  readonly recordUnknownOutcome: (
    request: BscTestnetPtaWbnbPoolTerminalRequest
  ) => Promise<Readonly<{ status: "unknown_outcome" }>>;
  readonly readState: () => Promise<BscTestnetPtaWbnbPoolLocalJournalState>;
}

/** Read-only recovery view. A null result means the retained byte sequence was not strictly valid. */
export interface BscTestnetPtaWbnbPoolLocalJournalRecoveryReader extends BscTestnetPtaWbnbPoolLocalJournal {
  readonly readStrictRecoveryState: () => Promise<BscTestnetPtaWbnbPoolLocalJournalState | null>;
}

export type BscTestnetPtaWbnbPoolLocalJournalRecoveryProbeResult =
  | Readonly<{
      status: "ready";
      presence: "absent" | "present";
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      presence: "unknown";
      state: null;
      issue: Readonly<{ code: "RECOVERY_JOURNAL_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolExistingLocalJournalResult =
  | Readonly<{
      status: "absent";
      journal: null;
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>
  | Readonly<{
      status: "opened";
      journal: BscTestnetPtaWbnbPoolLocalJournalRecoveryReader;
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      journal: null;
      state: null;
      issue: Readonly<{ code: "RECOVERY_JOURNAL_INVALID"; message: string }>;
    }>;

export interface BscTestnetPtaWbnbPoolJournalSecurityMetadata {
  readonly verified: true;
  readonly ownerSid: string;
  readonly accessRulesProtected: true;
  readonly currentUserOnlyFullControl: true;
  readonly checkedPaths: number;
}

export interface BscTestnetPtaWbnbPoolLocalJournalPorts {
  readonly now: () => Date;
  readonly listNames: () => Promise<readonly string[]>;
  readonly readBounded: (name: string) => Promise<string | null>;
  readonly createExclusive: (name: string, content: string) => Promise<"created" | "exists">;
  readonly assertSecure: (
    existingFiles: readonly string[]
  ) => Promise<BscTestnetPtaWbnbPoolJournalSecurityMetadata>;
}

type DataRecord = Readonly<Record<string, unknown>>;
type RecordKind =
  | "claim"
  | "worker_authorized"
  | "worker_started"
  | "signed_committed"
  | "failed_before_submission"
  | "unknown_outcome";

interface ParsedRecord extends JournalBinding {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly kind: RecordKind;
  readonly recordedAt: string;
  readonly claim?: BscTestnetPtaWbnbPoolClaimRequest;
  readonly workerRequestHash?: Hex;
  readonly authorizationTokenDigest?: Hex;
  readonly serializedTransaction?: Hex;
  readonly transactionHash?: Hex;
  readonly recoveredSigner?: Address;
  readonly outcomeDigest?: Hex;
}

function dataRecord(input: unknown): DataRecord | null {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input) || isProxy(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) return null;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys as string[]) {
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
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch {
    return null;
  }
}

function exactKeys(record: DataRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalDate(value: unknown): string | null {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? value
    : null;
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
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
  } catch {
    return null;
  }
}

function exactBytes32(value: unknown): value is Hex {
  return typeof value === "string" && BYTES32.test(value) && value !== ZERO_BYTES32;
}

function canonicalPositiveUint(value: unknown, maximum: bigint): bigint | null {
  if (typeof value !== "string" || !CANONICAL_UINT.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed > 0n && parsed <= maximum ? parsed : null;
  } catch {
    return null;
  }
}

function sha256Hex(value: string): Hex {
  return `0x${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function sha256HexBytes(value: Hex): Hex {
  return `0x${createHash("sha256")
    .update(Buffer.from(value.slice(2), "hex"))
    .digest("hex")}`;
}

function receiptBody(
  request: Omit<BscTestnetPtaWbnbPoolClaimRequest, "authorizationReceiptSha256">
) {
  return {
    kind: AUTHORIZATION_KIND,
    operationKey: request.operationKey,
    envelopeHash: request.envelopeHash,
    signingHash: request.signingHash,
    serializedUnsignedSha256: request.serializedUnsignedSha256,
    gasLimit: request.gasLimit,
    gasPriceWei: request.gasPriceWei,
    maxCostWei: request.maxCostWei,
    reviewerApprovalDigest: request.reviewerApprovalDigest,
    ownerAuthorizationDigest: request.ownerAuthorizationDigest,
    releaseCommit: request.releaseCommit,
    runtimeManifestSha256: request.runtimeManifestSha256,
    authorizedAt: request.authorizedAt,
    expiresAt: request.expiresAt
  };
}

/** Deterministic integrity digest only; callers must authenticate both capability digests elsewhere. */
export function deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256(
  request: Omit<BscTestnetPtaWbnbPoolClaimRequest, "authorizationReceiptSha256">
): Hex {
  return sha256Hex(JSON.stringify(receiptBody(request)));
}

function inspectClaimRequest(
  input: unknown,
  now: string | null
): BscTestnetPtaWbnbPoolClaimRequest | null {
  const record = dataRecord(input);
  const expected = [
    "operationKey",
    "envelopeHash",
    "signingHash",
    "serializedUnsignedSha256",
    "gasLimit",
    "gasPriceWei",
    "maxCostWei",
    "reviewerApprovalDigest",
    "ownerAuthorizationDigest",
    "releaseCommit",
    "runtimeManifestSha256",
    "authorizedAt",
    "expiresAt",
    "authorizationReceiptSha256"
  ];
  if (record === null || !exactKeys(record, expected)) return null;
  const gasLimit = canonicalPositiveUint(record.gasLimit, BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT);
  const gasPrice = canonicalPositiveUint(
    record.gasPriceWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI
  );
  const maxCost = canonicalPositiveUint(
    record.maxCostWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI
  );
  const authorizedAt = canonicalDate(record.authorizedAt);
  const expiresAt = canonicalDate(record.expiresAt);
  const nowMilliseconds = now === null ? null : Date.parse(now);
  const authorizedMilliseconds = authorizedAt === null ? Number.NaN : Date.parse(authorizedAt);
  const expiresMilliseconds = expiresAt === null ? Number.NaN : Date.parse(expiresAt);
  if (
    record.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    !exactBytes32(record.envelopeHash) ||
    !exactBytes32(record.signingHash) ||
    !exactBytes32(record.serializedUnsignedSha256) ||
    !exactBytes32(record.reviewerApprovalDigest) ||
    !exactBytes32(record.ownerAuthorizationDigest) ||
    record.reviewerApprovalDigest === record.ownerAuthorizationDigest ||
    typeof record.releaseCommit !== "string" ||
    !RELEASE_COMMIT.test(record.releaseCommit) ||
    !exactBytes32(record.runtimeManifestSha256) ||
    !exactBytes32(record.authorizationReceiptSha256) ||
    gasLimit === null ||
    gasPrice === null ||
    maxCost === null ||
    maxCost !== gasLimit * gasPrice ||
    authorizedAt === null ||
    expiresAt === null ||
    (nowMilliseconds !== null && authorizedMilliseconds > nowMilliseconds) ||
    (nowMilliseconds !== null && expiresMilliseconds <= nowMilliseconds) ||
    expiresMilliseconds - authorizedMilliseconds > MAXIMUM_AUTHORIZATION_LIFETIME_MILLISECONDS
  ) {
    return null;
  }
  const inspected = Object.freeze({
    operationKey: record.operationKey,
    envelopeHash: record.envelopeHash,
    signingHash: record.signingHash,
    serializedUnsignedSha256: record.serializedUnsignedSha256,
    gasLimit: record.gasLimit as string,
    gasPriceWei: record.gasPriceWei as string,
    maxCostWei: record.maxCostWei as string,
    reviewerApprovalDigest: record.reviewerApprovalDigest,
    ownerAuthorizationDigest: record.ownerAuthorizationDigest,
    releaseCommit: record.releaseCommit,
    runtimeManifestSha256: record.runtimeManifestSha256,
    authorizedAt,
    expiresAt,
    authorizationReceiptSha256: record.authorizationReceiptSha256
  }) satisfies BscTestnetPtaWbnbPoolClaimRequest;
  return deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256(inspected) ===
    inspected.authorizationReceiptSha256
    ? inspected
    : null;
}

function claimIdFor(request: BscTestnetPtaWbnbPoolClaimRequest): string {
  return `pta-wbnb-pool-${request.operationKey.slice(2, 34)}`;
}

function bindingFromClaim(request: BscTestnetPtaWbnbPoolClaimRequest): JournalBinding {
  return Object.freeze({
    claimId: claimIdFor(request),
    operationKey: request.operationKey,
    envelopeHash: request.envelopeHash,
    authorizationReceiptSha256: request.authorizationReceiptSha256,
    signingHash: request.signingHash,
    serializedUnsignedSha256: request.serializedUnsignedSha256,
    reviewerApprovalDigest: request.reviewerApprovalDigest,
    ownerAuthorizationDigest: request.ownerAuthorizationDigest,
    releaseCommit: request.releaseCommit,
    runtimeManifestSha256: request.runtimeManifestSha256
  });
}

function inspectBinding(input: unknown, extras: readonly string[]): DataRecord | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !exactKeys(record, [
      "claimId",
      "operationKey",
      "envelopeHash",
      "authorizationReceiptSha256",
      "signingHash",
      "serializedUnsignedSha256",
      "reviewerApprovalDigest",
      "ownerAuthorizationDigest",
      "releaseCommit",
      "runtimeManifestSha256",
      ...extras
    ]) ||
    typeof record.claimId !== "string" ||
    !/^pta-wbnb-pool-[0-9a-f]{32}$/u.test(record.claimId) ||
    record.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    !exactBytes32(record.envelopeHash) ||
    !exactBytes32(record.authorizationReceiptSha256) ||
    !exactBytes32(record.signingHash) ||
    !exactBytes32(record.serializedUnsignedSha256) ||
    !exactBytes32(record.reviewerApprovalDigest) ||
    !exactBytes32(record.ownerAuthorizationDigest) ||
    record.reviewerApprovalDigest === record.ownerAuthorizationDigest ||
    typeof record.releaseCommit !== "string" ||
    !RELEASE_COMMIT.test(record.releaseCommit) ||
    !exactBytes32(record.runtimeManifestSha256)
  ) {
    return null;
  }
  return record;
}

function sameBinding(left: JournalBinding, right: JournalBinding): boolean {
  return (
    left.claimId === right.claimId &&
    left.operationKey === right.operationKey &&
    left.envelopeHash === right.envelopeHash &&
    left.authorizationReceiptSha256 === right.authorizationReceiptSha256 &&
    left.signingHash === right.signingHash &&
    left.serializedUnsignedSha256 === right.serializedUnsignedSha256 &&
    left.reviewerApprovalDigest === right.reviewerApprovalDigest &&
    left.ownerAuthorizationDigest === right.ownerAuthorizationDigest &&
    left.releaseCommit === right.releaseCommit &&
    left.runtimeManifestSha256 === right.runtimeManifestSha256
  );
}

function bindingOf(record: DataRecord | JournalBinding): JournalBinding {
  return Object.freeze({
    claimId: record.claimId as string,
    operationKey: record.operationKey as Hex,
    envelopeHash: record.envelopeHash as Hex,
    authorizationReceiptSha256: record.authorizationReceiptSha256 as Hex,
    signingHash: record.signingHash as Hex,
    serializedUnsignedSha256: record.serializedUnsignedSha256 as Hex,
    reviewerApprovalDigest: record.reviewerApprovalDigest as Hex,
    ownerAuthorizationDigest: record.ownerAuthorizationDigest as Hex,
    releaseCommit: record.releaseCommit as string,
    runtimeManifestSha256: record.runtimeManifestSha256 as Hex
  });
}

function transactionFields(record: DataRecord): RetainedTransactionBinding | null {
  if (
    typeof record.serializedTransaction !== "string" ||
    !RAW_TRANSACTION.test(record.serializedTransaction) ||
    record.serializedTransaction.length > 16_386 ||
    !exactBytes32(record.transactionHash) ||
    keccak256(record.serializedTransaction as Hex) !== record.transactionHash
  ) {
    return null;
  }
  return Object.freeze({
    ...bindingOf(record),
    serializedTransaction: record.serializedTransaction as Hex,
    transactionHash: record.transactionHash
  });
}

function commonRecord(kind: RecordKind, binding: JournalBinding, recordedAt: string) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind,
    ...binding,
    recordedAt
  };
}

function serialize(value: Readonly<Record<string, unknown>>): string {
  return `${JSON.stringify(value)}\n`;
}

const BINDING_KEYS = [
  "claimId",
  "operationKey",
  "envelopeHash",
  "authorizationReceiptSha256",
  "signingHash",
  "serializedUnsignedSha256",
  "reviewerApprovalDigest",
  "ownerAuthorizationDigest",
  "releaseCommit",
  "runtimeManifestSha256"
] as const;
const STORED_COMMON_KEYS = ["schemaVersion", "kind", ...BINDING_KEYS, "recordedAt"] as const;
const CLAIM_EXTRA_KEYS = ["gasLimit", "gasPriceWei", "maxCostWei", "authorizedAt", "expiresAt"];
const WORKER_EXTRA_KEYS = ["workerRequestHash", "authorizationTokenDigest"];
const TRANSACTION_EXTRA_KEYS = ["serializedTransaction", "transactionHash"];

function inspectStoredCommon(
  record: DataRecord,
  extraKeys: readonly string[]
): JournalBinding | null {
  if (
    !exactKeys(record, [...STORED_COMMON_KEYS, ...extraKeys]) ||
    record.schemaVersion !== SCHEMA_VERSION ||
    canonicalDate(record.recordedAt) === null
  ) {
    return null;
  }
  const candidate: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of BINDING_KEYS) candidate[key] = record[key];
  return inspectBinding(candidate, []) === null ? null : bindingOf(record);
}

function parseStored(content: string | null, slot: number): ParsedRecord | null {
  if (content === null || content.length > MAXIMUM_RECORD_BYTES) return null;
  let record: DataRecord | null = null;
  try {
    record = dataRecord(JSON.parse(content));
  } catch {
    return null;
  }
  if (record === null || typeof record.kind !== "string") return null;
  const kind = record.kind as RecordKind;
  const allowed: Readonly<Record<number, readonly RecordKind[]>> = {
    1: ["claim"],
    2: ["worker_authorized", "failed_before_submission", "unknown_outcome"],
    3: ["worker_started", "failed_before_submission", "unknown_outcome"],
    4: ["signed_committed", "failed_before_submission", "unknown_outcome"],
    5: ["failed_before_submission", "unknown_outcome"]
  };
  if (!allowed[slot]?.includes(kind)) return null;

  if (kind === "claim") {
    const binding = inspectStoredCommon(record, CLAIM_EXTRA_KEYS);
    if (binding === null) return null;
    const claimCandidate = {
      operationKey: record.operationKey,
      envelopeHash: record.envelopeHash,
      signingHash: record.signingHash,
      serializedUnsignedSha256: record.serializedUnsignedSha256,
      gasLimit: record.gasLimit,
      gasPriceWei: record.gasPriceWei,
      maxCostWei: record.maxCostWei,
      reviewerApprovalDigest: record.reviewerApprovalDigest,
      ownerAuthorizationDigest: record.ownerAuthorizationDigest,
      releaseCommit: record.releaseCommit,
      runtimeManifestSha256: record.runtimeManifestSha256,
      authorizedAt: record.authorizedAt,
      expiresAt: record.expiresAt,
      authorizationReceiptSha256: record.authorizationReceiptSha256
    };
    const claim = inspectClaimRequest(claimCandidate, null);
    if (claim === null || binding.claimId !== claimIdFor(claim)) return null;
    const parsed: ParsedRecord = Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      kind,
      ...binding,
      recordedAt: record.recordedAt as string,
      claim
    });
    return content === claimRecord(claim, parsed.recordedAt) ? parsed : null;
  }

  if (kind === "worker_authorized" || kind === "worker_started") {
    const binding = inspectStoredCommon(record, WORKER_EXTRA_KEYS);
    if (
      binding === null ||
      !exactBytes32(record.workerRequestHash) ||
      !exactBytes32(record.authorizationTokenDigest)
    ) {
      return null;
    }
    const parsed: ParsedRecord = Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      kind,
      ...binding,
      recordedAt: record.recordedAt as string,
      workerRequestHash: record.workerRequestHash,
      authorizationTokenDigest: record.authorizationTokenDigest
    });
    return content ===
      serialize({
        ...commonRecord(kind, binding, parsed.recordedAt),
        workerRequestHash: parsed.workerRequestHash,
        authorizationTokenDigest: parsed.authorizationTokenDigest
      })
      ? parsed
      : null;
  }

  if (kind === "signed_committed") {
    const binding = inspectStoredCommon(record, [
      "workerRequestHash",
      ...TRANSACTION_EXTRA_KEYS,
      "recoveredSigner"
    ]);
    const transaction = transactionFields(record);
    if (
      binding === null ||
      transaction === null ||
      !exactBytes32(record.workerRequestHash) ||
      record.recoveredSigner !== BSC_TESTNET_PTA_WBNB_POOL_SENDER
    ) {
      return null;
    }
    const parsed: ParsedRecord = Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      kind,
      ...binding,
      recordedAt: record.recordedAt as string,
      workerRequestHash: record.workerRequestHash,
      serializedTransaction: transaction.serializedTransaction,
      transactionHash: transaction.transactionHash,
      recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
    });
    return content ===
      serialize({
        ...commonRecord(kind, binding, parsed.recordedAt),
        workerRequestHash: parsed.workerRequestHash,
        serializedTransaction: parsed.serializedTransaction,
        transactionHash: parsed.transactionHash,
        recoveredSigner: parsed.recoveredSigner
      })
      ? parsed
      : null;
  }

  const binding = inspectStoredCommon(record, [
    "outcomeDigest",
    "serializedTransaction",
    "transactionHash"
  ]);
  if (binding === null || !exactBytes32(record.outcomeDigest)) return null;
  const transactionIsAbsent =
    record.serializedTransaction === null && record.transactionHash === null;
  const transaction = transactionIsAbsent ? null : transactionFields(record);
  if (!transactionIsAbsent && transaction === null) return null;
  const parsed: ParsedRecord = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    kind,
    ...binding,
    recordedAt: record.recordedAt as string,
    outcomeDigest: record.outcomeDigest,
    ...(transaction === null
      ? {}
      : {
          serializedTransaction: transaction.serializedTransaction,
          transactionHash: transaction.transactionHash
        })
  });
  return content ===
    serialize({
      ...commonRecord(kind, binding, parsed.recordedAt),
      outcomeDigest: parsed.outcomeDigest,
      serializedTransaction: parsed.serializedTransaction ?? null,
      transactionHash: parsed.transactionHash ?? null
    })
    ? parsed
    : null;
}

function claimRecord(request: BscTestnetPtaWbnbPoolClaimRequest, recordedAt: string): string {
  const binding = bindingFromClaim(request);
  return serialize({
    ...commonRecord("claim", binding, recordedAt),
    gasLimit: request.gasLimit,
    gasPriceWei: request.gasPriceWei,
    maxCostWei: request.maxCostWei,
    authorizedAt: request.authorizedAt,
    expiresAt: request.expiresAt
  });
}

function stateFrom(
  status: BscTestnetPtaWbnbPoolLocalJournalStatus,
  claim: ParsedRecord | null,
  transaction: ParsedRecord | null = null
): BscTestnetPtaWbnbPoolLocalJournalState {
  return Object.freeze({
    status,
    claimId: claim?.claimId ?? null,
    operationKey: claim?.operationKey ?? null,
    envelopeHash: claim?.envelopeHash ?? null,
    authorizationReceiptSha256: claim?.authorizationReceiptSha256 ?? null,
    signingHash: claim?.signingHash ?? null,
    serializedUnsignedSha256: claim?.serializedUnsignedSha256 ?? null,
    reviewerApprovalDigest: claim?.reviewerApprovalDigest ?? null,
    ownerAuthorizationDigest: claim?.ownerAuthorizationDigest ?? null,
    releaseCommit: claim?.releaseCommit ?? null,
    runtimeManifestSha256: claim?.runtimeManifestSha256 ?? null,
    gasLimit: claim?.claim?.gasLimit ?? null,
    gasPriceWei: claim?.claim?.gasPriceWei ?? null,
    maxCostWei: claim?.claim?.maxCostWei ?? null,
    authorizedAt: claim?.claim?.authorizedAt ?? null,
    expiresAt: claim?.claim?.expiresAt ?? null,
    serializedTransaction: transaction?.serializedTransaction ?? null,
    transactionHash: transaction?.transactionHash ?? null
  });
}

function securityMetadata(input: unknown, expectedPaths: number): boolean {
  const record = dataRecord(input);
  return (
    record !== null &&
    exactKeys(record, [
      "verified",
      "ownerSid",
      "accessRulesProtected",
      "currentUserOnlyFullControl",
      "checkedPaths"
    ]) &&
    record.verified === true &&
    typeof record.ownerSid === "string" &&
    /^S-1-[0-9-]+$/u.test(record.ownerSid) &&
    record.accessRulesProtected === true &&
    record.currentUserOnlyFullControl === true &&
    record.checkedPaths === expectedPaths
  );
}

function inspectPorts(input: unknown): BscTestnetPtaWbnbPoolLocalJournalPorts | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !exactKeys(record, ["now", "listNames", "readBounded", "createExclusive", "assertSecure"])
  ) {
    return null;
  }
  for (const key of ["now", "listNames", "readBounded", "createExclusive", "assertSecure"]) {
    if (typeof record[key] !== "function" || isProxy(record[key])) return null;
  }
  return record as unknown as BscTestnetPtaWbnbPoolLocalJournalPorts;
}

interface JournalSnapshot {
  readonly state: BscTestnetPtaWbnbPoolLocalJournalState;
  readonly records: readonly ParsedRecord[];
}

function unknownSnapshot(claim: ParsedRecord | null = null): JournalSnapshot {
  return Object.freeze({ state: stateFrom("unknown_outcome", claim), records: Object.freeze([]) });
}

function statusFor(kind: RecordKind): Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty"> {
  return kind === "claim" ? "claimed" : kind;
}

function inspectSecurityNames(value: unknown): readonly string[] | null {
  try {
    if (
      !Array.isArray(value) ||
      isProxy(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      return null;
    }
    const names = value.map((entry) =>
      typeof entry === "string" && SLOT_FILES.some((allowed) => allowed === entry) ? entry : null
    );
    if (names.some((entry) => entry === null)) return null;
    const sorted = [...(names as string[])].sort();
    if (new Set(sorted).size !== sorted.length) return null;
    return Object.freeze(sorted);
  } catch {
    return null;
  }
}

/**
 * Core append-only state machine. Ports are injected only for deterministic tests and the fixed
 * Windows adapter below. No method offers generic CAS, overwrite, delete, or retry semantics.
 */
export function createBscTestnetPtaWbnbPoolLocalJournalCore(
  untrustedPorts: unknown
): BscTestnetPtaWbnbPoolLocalJournalRecoveryReader {
  const ports = inspectPorts(untrustedPorts);
  if (ports === null) throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");

  const readSnapshot = async (): Promise<JournalSnapshot> => {
    const listed = inspectSecurityNames(await ports.listNames());
    if (listed === null) return unknownSnapshot();
    const security = await ports.assertSecure(listed);
    if (!securityMetadata(security, listed.length + 1)) return unknownSnapshot();
    if (listed.length === 0) {
      return Object.freeze({ state: stateFrom("empty", null), records: Object.freeze([]) });
    }
    const highest = Math.max(...listed.map((name) => SLOT_FILES.indexOf(name) + 1));
    if (highest !== listed.length) return unknownSnapshot();
    const records: ParsedRecord[] = [];
    for (let index = 0; index < listed.length; index += 1) {
      if (listed[index] !== SLOT_FILES[index]) return unknownSnapshot(records[0] ?? null);
      const slotFile = SLOT_FILES[index];
      if (slotFile === undefined) return unknownSnapshot(records[0] ?? null);
      const parsed = parseStored(await ports.readBounded(slotFile), index + 1);
      if (parsed === null) return unknownSnapshot(records[0] ?? null);
      records.push(parsed);
    }
    const claim = records[0];
    if (claim === undefined || claim.kind !== "claim" || claim.claim === undefined) {
      return unknownSnapshot();
    }
    for (const record of records.slice(1)) {
      if (!sameBinding(record, claim)) return unknownSnapshot(claim);
    }
    const kinds = records.map((record) => record.kind);
    if (kinds.slice(0, -1).some((kind) => kind.endsWith("outcome"))) {
      return unknownSnapshot(claim);
    }
    const workerAuthorized = records.find((record) => record.kind === "worker_authorized");
    const workerStarted = records.find((record) => record.kind === "worker_started");
    const signed = records.find((record) => record.kind === "signed_committed");
    if (
      workerStarted !== undefined &&
      (workerAuthorized === undefined ||
        workerStarted.workerRequestHash !== workerAuthorized.workerRequestHash ||
        workerStarted.authorizationTokenDigest !== workerAuthorized.authorizationTokenDigest)
    ) {
      return unknownSnapshot(claim);
    }
    if (
      signed !== undefined &&
      (workerStarted === undefined || signed.workerRequestHash !== workerStarted.workerRequestHash)
    ) {
      return unknownSnapshot(claim);
    }
    for (const downstream of [records.at(-1)]) {
      if (
        downstream !== undefined &&
        downstream.serializedTransaction !== undefined &&
        (signed === undefined ||
          downstream.serializedTransaction !== signed.serializedTransaction ||
          downstream.transactionHash !== signed.transactionHash)
      ) {
        return unknownSnapshot(claim);
      }
    }
    const last = records.at(-1);
    if (last === undefined) return unknownSnapshot(claim);
    const expectedPrefixes: Readonly<Record<RecordKind, readonly RecordKind[]>> = {
      claim: ["claim"],
      worker_authorized: ["claim", "worker_authorized"],
      worker_started: ["claim", "worker_authorized", "worker_started"],
      signed_committed: ["claim", "worker_authorized", "worker_started", "signed_committed"],
      failed_before_submission: kinds,
      unknown_outcome: kinds
    };
    const expected = expectedPrefixes[last.kind];
    if (expected.length !== kinds.length || expected.some((kind, index) => kind !== kinds[index])) {
      return unknownSnapshot(claim);
    }
    return Object.freeze({
      state: stateFrom(statusFor(last.kind), claim, signed ?? null),
      records: Object.freeze(records)
    });
  };

  const readState = async (): Promise<BscTestnetPtaWbnbPoolLocalJournalState> => {
    try {
      return (await readSnapshot()).state;
    } catch {
      return stateFrom("unknown_outcome", null);
    }
  };

  const readStrictRecoveryState =
    async (): Promise<BscTestnetPtaWbnbPoolLocalJournalState | null> => {
      try {
        const snapshot = await readSnapshot();
        if (snapshot.state.status === "empty") {
          return snapshot.records.length === 0 ? snapshot.state : null;
        }
        const last = snapshot.records.at(-1);
        return last !== undefined && statusFor(last.kind) === snapshot.state.status
          ? snapshot.state
          : null;
      } catch {
        return null;
      }
    };

  const requireSnapshot = async (
    expected: BscTestnetPtaWbnbPoolLocalJournalStatus,
    binding: JournalBinding
  ): Promise<JournalSnapshot> => {
    const snapshot = await readSnapshot();
    const claim = snapshot.records[0];
    if (snapshot.state.status !== expected || claim === undefined || !sameBinding(claim, binding)) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_STATE_MISMATCH");
    }
    return snapshot;
  };

  const append = async (
    slot: number,
    content: string,
    expectedStatus: BscTestnetPtaWbnbPoolLocalJournalStatus,
    nextStatus: Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty">,
    binding: JournalBinding
  ): Promise<void> => {
    await requireSnapshot(expectedStatus, binding);
    const name = SLOT_FILES[slot - 1];
    if (name === undefined) throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    if ((await ports.createExclusive(name, content)) !== "created") {
      throw new Error("PTA_WBNB_POOL_JOURNAL_OUTCOME_UNKNOWN");
    }
    const retained = await readSnapshot();
    if (retained.state.status !== nextStatus) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_OUTCOME_UNKNOWN");
    }
  };

  const claimExactInitialization = async (
    untrustedRequest: BscTestnetPtaWbnbPoolClaimRequest
  ): Promise<
    | Readonly<{ status: "claimed"; claimId: string }>
    | Readonly<{
        status: "already_claimed";
        claimId: string;
        state: Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty">;
      }>
  > => {
    const recordedAt = captureNow(ports.now);
    const request = recordedAt === null ? null : inspectClaimRequest(untrustedRequest, recordedAt);
    if (request === null || recordedAt === null) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const initial = await readSnapshot();
    const binding = bindingFromClaim(request);
    if (initial.state.status !== "empty") {
      const existing = initial.records[0];
      if (existing === undefined || !sameBinding(existing, binding)) {
        throw new Error("PTA_WBNB_POOL_JOURNAL_OUTCOME_UNKNOWN");
      }
      return Object.freeze({
        status: "already_claimed" as const,
        claimId: binding.claimId,
        state: initial.state.status as Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty">
      });
    }
    const claimFile = SLOT_FILES[0];
    if (claimFile === undefined) throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    const outcome = await ports.createExclusive(claimFile, claimRecord(request, recordedAt));
    const retained = await readSnapshot();
    const retainedClaim = retained.records[0];
    if (retainedClaim === undefined || !sameBinding(retainedClaim, binding)) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_OUTCOME_UNKNOWN");
    }
    if (outcome === "created" && retained.state.status === "claimed") {
      return Object.freeze({ status: "claimed" as const, claimId: binding.claimId });
    }
    return Object.freeze({
      status: "already_claimed" as const,
      claimId: binding.claimId,
      state: retained.state.status as Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty">
    });
  };

  const authorizeWorker = async (
    untrustedRequest: BscTestnetPtaWbnbPoolWorkerAuthorizationRequest
  ): Promise<Readonly<{ status: "worker_authorized" }>> => {
    const recordedAt = captureNow(ports.now);
    const record = inspectBinding(untrustedRequest, [
      "workerRequestHash",
      "authorizationTokenDigest"
    ]);
    if (
      recordedAt === null ||
      record === null ||
      !exactBytes32(record.workerRequestHash) ||
      !exactBytes32(record.authorizationTokenDigest)
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const binding = bindingOf(record);
    await append(
      2,
      serialize({
        ...commonRecord("worker_authorized", binding, recordedAt),
        workerRequestHash: record.workerRequestHash,
        authorizationTokenDigest: record.authorizationTokenDigest
      }),
      "claimed",
      "worker_authorized",
      binding
    );
    return Object.freeze({ status: "worker_authorized" as const });
  };

  const startWorker = async (
    untrustedRequest: BscTestnetPtaWbnbPoolWorkerStartRequest
  ): Promise<Readonly<{ status: "worker_started" }>> => {
    const recordedAt = captureNow(ports.now);
    const record = inspectBinding(untrustedRequest, ["workerRequestHash", "authorizationToken"]);
    if (
      recordedAt === null ||
      record === null ||
      !exactBytes32(record.workerRequestHash) ||
      !exactBytes32(record.authorizationToken)
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const binding = bindingOf(record);
    const snapshot = await requireSnapshot("worker_authorized", binding);
    const authorization = snapshot.records[1];
    const authorizationToken = record.authorizationToken as Hex;
    const tokenDigest = keccak256(authorizationToken);
    if (
      authorization?.workerRequestHash !== record.workerRequestHash ||
      authorization.authorizationTokenDigest !== tokenDigest
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_WORKER_AUTHORIZATION_INVALID");
    }
    await append(
      3,
      serialize({
        ...commonRecord("worker_started", binding, recordedAt),
        workerRequestHash: record.workerRequestHash,
        authorizationTokenDigest: tokenDigest
      }),
      "worker_authorized",
      "worker_started",
      binding
    );
    return Object.freeze({ status: "worker_started" as const });
  };

  const consumeWorkerAuthorization = async (
    untrustedWorkerRequest: BscTestnetPtaWbnbPoolSigningWorkerRequest
  ): Promise<Readonly<{ status: "worker_started" }>> => {
    const recordedAt = captureNow(ports.now);
    const workerRequest =
      parseBscTestnetPtaWbnbPoolSigningWorkerRequestForInternalUse(untrustedWorkerRequest);
    const validation = validateBscTestnetPtaWbnbPoolSigningWorkerRequest(
      untrustedWorkerRequest,
      recordedAt === null ? null : new Date(recordedAt)
    );
    if (workerRequest === null || validation.status !== "valid") {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const snapshot = await readSnapshot();
    const claim = snapshot.records[0];
    if (claim === undefined) throw new Error("PTA_WBNB_POOL_JOURNAL_CLAIM_MISMATCH");
    const binding = bindingOf(claim);
    if (
      workerRequest.claimId !== binding.claimId ||
      workerRequest.operationKey !== binding.operationKey ||
      workerRequest.transaction.sourceEnvelopeHash !== binding.envelopeHash ||
      workerRequest.transaction.signingHash !== binding.signingHash ||
      sha256HexBytes(workerRequest.transaction.serializedUnsignedTransaction) !==
        binding.serializedUnsignedSha256 ||
      workerRequest.reviewerApprovalDigest !== binding.reviewerApprovalDigest ||
      workerRequest.ownerAuthorizationDigest !== binding.ownerAuthorizationDigest ||
      workerRequest.releaseCommit !== binding.releaseCommit ||
      workerRequest.runtimeManifestSha256 !== binding.runtimeManifestSha256
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CLAIM_MISMATCH");
    }
    return startWorker({
      ...binding,
      workerRequestHash: workerRequest.requestHash,
      authorizationToken: workerRequest.journalClaimToken
    });
  };

  const commitValidatedWorkerSignedTransaction = async (
    untrustedRequest: ValidatedWorkerSignedCommit
  ): Promise<Readonly<{ status: "signed_committed" }>> => {
    const recordedAt = captureNow(ports.now);
    const record = inspectBinding(untrustedRequest, [
      "workerRequestHash",
      "serializedTransaction",
      "transactionHash",
      "recoveredSigner"
    ]);
    const transaction = record === null ? null : transactionFields(record);
    if (
      recordedAt === null ||
      record === null ||
      transaction === null ||
      !exactBytes32(record.workerRequestHash) ||
      record.recoveredSigner !== BSC_TESTNET_PTA_WBNB_POOL_SENDER
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const binding = bindingOf(record);
    const current = await readSnapshot();
    if (current.state.status === "signed_committed") {
      const retained = current.records[3];
      if (
        retained !== undefined &&
        sameBinding(retained, binding) &&
        retained.workerRequestHash === record.workerRequestHash &&
        retained.serializedTransaction === transaction.serializedTransaction &&
        retained.transactionHash === transaction.transactionHash &&
        retained.recoveredSigner === BSC_TESTNET_PTA_WBNB_POOL_SENDER
      ) {
        return Object.freeze({ status: "signed_committed" as const });
      }
      throw new Error("PTA_WBNB_POOL_JOURNAL_OUTCOME_UNKNOWN");
    }
    const snapshot = await requireSnapshot("worker_started", binding);
    if (snapshot.records[2]?.workerRequestHash !== record.workerRequestHash) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_WORKER_MISMATCH");
    }
    await append(
      4,
      serialize({
        ...commonRecord("signed_committed", binding, recordedAt),
        workerRequestHash: record.workerRequestHash,
        serializedTransaction: transaction.serializedTransaction,
        transactionHash: transaction.transactionHash,
        recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
      }),
      "worker_started",
      "signed_committed",
      binding
    );
    return Object.freeze({ status: "signed_committed" as const });
  };

  const commitWorkerSignedTransaction = async (
    untrustedWorkerRequest: BscTestnetPtaWbnbPoolSigningWorkerRequest,
    untrustedWorkerResponse: BscTestnetPtaWbnbPoolSigningWorkerResponse
  ): Promise<Readonly<{ status: "signed_committed" }>> => {
    const workerRequest =
      parseBscTestnetPtaWbnbPoolSigningWorkerRequestForInternalUse(untrustedWorkerRequest);
    const response = dataRecord(untrustedWorkerResponse);
    const validated = await validateBscTestnetPtaWbnbPoolSigningWorkerResponse(
      untrustedWorkerResponse,
      untrustedWorkerRequest
    );
    if (
      workerRequest === null ||
      response === null ||
      validated.status !== "valid" ||
      typeof response.signedTransaction !== "string" ||
      !RAW_TRANSACTION.test(response.signedTransaction) ||
      !exactBytes32(response.transactionHash) ||
      keccak256(response.signedTransaction as Hex) !== response.transactionHash ||
      response.requestHash !== workerRequest.requestHash ||
      response.claimId !== workerRequest.claimId ||
      response.operationKey !== workerRequest.operationKey ||
      response.signingHash !== workerRequest.transaction.signingHash
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const snapshot = await readSnapshot();
    const claim = snapshot.records[0];
    if (claim === undefined) throw new Error("PTA_WBNB_POOL_JOURNAL_CLAIM_MISMATCH");
    const binding = bindingOf(claim);
    return commitValidatedWorkerSignedTransaction({
      ...binding,
      workerRequestHash: workerRequest.requestHash,
      serializedTransaction: validated.signedTransaction,
      transactionHash: validated.transactionHash,
      recoveredSigner: validated.recoveredSigner
    });
  };

  const appendTerminal = async (
    kind: "failed_before_submission" | "unknown_outcome",
    untrustedRequest: BscTestnetPtaWbnbPoolTerminalRequest
  ): Promise<void> => {
    const recordedAt = captureNow(ports.now);
    const rawRecord = dataRecord(untrustedRequest);
    const hasTransaction =
      rawRecord !== null &&
      Object.hasOwn(rawRecord, "serializedTransaction") &&
      Object.hasOwn(rawRecord, "transactionHash");
    const extras = hasTransaction
      ? ["outcomeDigest", ...TRANSACTION_EXTRA_KEYS]
      : ["outcomeDigest"];
    const record = inspectBinding(untrustedRequest, extras);
    const transaction = record === null || !hasTransaction ? null : transactionFields(record);
    if (
      recordedAt === null ||
      record === null ||
      !exactBytes32(record.outcomeDigest) ||
      (hasTransaction && transaction === null)
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const binding = bindingOf(record);
    const snapshot = await readSnapshot();
    const expected = snapshot.state.status;
    const slot = snapshot.records.length + 1;
    const signed = snapshot.records.find((entry) => entry.kind === "signed_committed");
    if (
      expected === "empty" ||
      expected === "unknown_outcome" ||
      expected === "failed_before_submission" ||
      slot > SLOT_FILES.length ||
      (signed === undefined && transaction !== null) ||
      (signed !== undefined &&
        (transaction === null ||
          transaction.serializedTransaction !== signed.serializedTransaction ||
          transaction.transactionHash !== signed.transactionHash))
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_STATE_MISMATCH");
    }
    await append(
      slot,
      serialize({
        ...commonRecord(kind, binding, recordedAt),
        outcomeDigest: record.outcomeDigest,
        serializedTransaction: transaction?.serializedTransaction ?? null,
        transactionHash: transaction?.transactionHash ?? null
      }),
      expected,
      kind,
      binding
    );
  };

  const failBeforeSubmission = async (request: BscTestnetPtaWbnbPoolTerminalRequest) => {
    await appendTerminal("failed_before_submission", request);
    return Object.freeze({ status: "failed_before_submission" as const });
  };

  const recordUnknownOutcome = async (request: BscTestnetPtaWbnbPoolTerminalRequest) => {
    await appendTerminal("unknown_outcome", request);
    return Object.freeze({ status: "unknown_outcome" as const });
  };

  return Object.freeze({
    claimExactInitialization,
    authorizeWorker,
    startWorker,
    consumeWorkerAuthorization,
    commitWorkerSignedTransaction,
    failBeforeSubmission,
    recordUnknownOutcome,
    readState,
    readStrictRecoveryState
  });
}

const ACL_PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
  $spec = $reader.ReadToEnd() | ConvertFrom-Json
  $reader.Dispose()
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $account = $current.Translate([System.Security.Principal.NTAccount]).Value
  foreach ($path in @($spec.paths)) {
    $item = Get-Item -LiteralPath $path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
    $acl = Get-Acl -LiteralPath $path
    if ($acl.Owner -ne $current.Value -and $acl.Owner -ne $account) { throw 'owner' }
    if (-not $acl.AreAccessRulesProtected) { throw 'inheritance' }
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    if ($rules.Count -lt 1) { throw 'rules' }
    foreach ($rule in $rules) {
      if ($rule.IdentityReference.Value -ne $current.Value) { throw 'principal' }
      if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { throw 'deny' }
      if (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { throw 'rights' }
    }
  }
  [Console]::Out.Write((@{
    verified = $true
    ownerSid = $current.Value
    accessRulesProtected = $true
    currentUserOnlyFullControl = $true
    checkedPaths = @($spec.paths).Count
  } | ConvertTo-Json -Compress))
} catch { exit 43 }
`;

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
} catch { exit 46 }
`;

const LOCAL_APPLICATION_DATA_PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if ([String]::IsNullOrWhiteSpace($base)) { throw 'base' }
  $baseItem = Get-Item -LiteralPath $base -Force
  if (-not $baseItem.PSIsContainer) { throw 'base-type' }
  if (($baseItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'base-reparse' }
  if ([IO.Path]::GetFullPath($baseItem.FullName) -ne [IO.Path]::GetFullPath($base)) { throw 'base-path' }

  $cursor = $baseItem.FullName
  foreach ($segment in @('ProofEra', 'operations', 'bsc-testnet-pta-wbnb-pool-v1')) {
    $candidate = [IO.Path]::GetFullPath([IO.Path]::Combine($cursor, $segment))
    if ([IO.Path]::GetDirectoryName($candidate) -ne [IO.Path]::GetFullPath($cursor)) { throw 'escape' }
    if (Test-Path -LiteralPath $candidate) {
      $item = Get-Item -LiteralPath $candidate -Force
      if (-not $item.PSIsContainer) { throw 'ancestor-type' }
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'ancestor-reparse' }
      if ([IO.Path]::GetFullPath($item.FullName) -ne $candidate) { throw 'ancestor-path' }
    } else {
      $item = New-Item -ItemType Directory -Path $candidate
      if (-not $item.PSIsContainer) { throw 'created-type' }
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'created-reparse' }
    }
    $cursor = $item.FullName
  }

  # All ancestors have been validated before the first ACL mutation.
  $allowed = @(
     '01-claim.v1.json', '02-transition.v1.json', '03-transition.v1.json',
     '04-transition.v1.json', '05-transition.v1.json'
  )
  $retainedFiles = @()
  foreach ($child in @(Get-ChildItem -LiteralPath $cursor -Force)) {
    if ($child.PSIsContainer -or ($allowed -notcontains $child.Name)) { throw 'unexpected-child' }
    if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'child-reparse' }
    if ($child.LinkType) { throw 'child-link' }
    $retainedFiles += $child.FullName
  }

  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $directoryAcl = [System.Security.AccessControl.DirectorySecurity]::new()
  $directoryAcl.SetOwner($current)
  $directoryAcl.SetAccessRuleProtection($true, $false)
  $directoryRule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $current,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    $inherit,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$directoryAcl.AddAccessRule($directoryRule)
  [IO.Directory]::SetAccessControl($cursor, $directoryAcl)

  # Never rewrite a retained record's ACL. Existing records must already satisfy the exact policy.
  # Post-validate the directory and every retained record after the directory ACL write.
  foreach ($path in @($cursor) + $retainedFiles) {
    $item = Get-Item -LiteralPath $path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'post-reparse' }
    $acl = Get-Acl -LiteralPath $path
    if (-not $acl.AreAccessRulesProtected) { throw 'post-inheritance' }
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    if ($rules.Count -lt 1) { throw 'post-rules' }
    foreach ($rule in $rules) {
      if ($rule.IdentityReference.Value -ne $current.Value) { throw 'post-principal' }
      if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { throw 'post-deny' }
      if (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { throw 'post-rights' }
    }
  }
  [Console]::Out.Write((@{ localApplicationData = $baseItem.FullName } | ConvertTo-Json -Compress))
} catch { exit 44 }
`;

const PROTECT_RECORD_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
  $spec = $reader.ReadToEnd() | ConvertFrom-Json
  $reader.Dispose()
  $directory = Get-Item -LiteralPath $spec.directory -Force
  $file = Get-Item -LiteralPath $spec.file -Force
  if (-not $directory.PSIsContainer -or $file.PSIsContainer) { throw 'type' }
  if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'directory-reparse' }
  if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'file-reparse' }
  if ([IO.Path]::GetDirectoryName($file.FullName) -ne $directory.FullName) { throw 'parent' }
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $directoryAcl = Get-Acl -LiteralPath $directory.FullName
  if (-not $directoryAcl.AreAccessRulesProtected) { throw 'directory-inheritance' }
  $fileAcl = [System.Security.AccessControl.FileSecurity]::new()
  $fileAcl.SetOwner($current)
  $fileAcl.SetAccessRuleProtection($true, $false)
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $current,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$fileAcl.AddAccessRule($rule)
  [IO.File]::SetAccessControl($file.FullName, $fileAcl)
  $retained = Get-Acl -LiteralPath $file.FullName
  if (-not $retained.AreAccessRulesProtected) { throw 'post-inheritance' }
  $rules = @($retained.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  if ($rules.Count -lt 1) { throw 'post-rules' }
  foreach ($entry in $rules) {
    if ($entry.IdentityReference.Value -ne $current.Value) { throw 'post-principal' }
    if ($entry.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { throw 'post-deny' }
    if (($entry.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { throw 'post-rights' }
  }
  [Console]::Out.Write('{"ok":true}')
} catch { exit 45 }
`;

function expectedJournalDirectoryFromLocalAppData(input: unknown): string | null {
  if (
    typeof input !== "string" ||
    input.length < 3 ||
    input.length > 400 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(input) ||
    input.includes("/") ||
    win32.normalize(input) !== input
  ) {
    return null;
  }
  const directory = win32.join(input, ...JOURNAL_SUBDIRECTORY);
  const resolved = resolve(directory);
  const relation = relative(REPOSITORY_ROOT, resolved);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")
    ? null
    : resolved;
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
      throw new Error("PTA_WBNB_POOL_JOURNAL_DIRECTORY_INVALID");
    }
    return "present";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
}

async function readOnlyFixedJournalDirectory(): Promise<string | null> {
  const input = Buffer.alloc(0);
  let output: Buffer | null = null;
  try {
    const result = await runPinnedPowerShellForInternalUse(
      LOCAL_APPLICATION_DATA_READ_ONLY_PROBE_SCRIPT,
      input,
      1_024,
      new AbortController().signal
    );
    output = result.output;
    const parsed = dataRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)));
    if (parsed === null || !exactKeys(parsed, ["localApplicationData"])) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    const expected = expectedJournalDirectoryFromLocalAppData(parsed.localApplicationData);
    if (expected === null || typeof parsed.localApplicationData !== "string") {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    let cursor = resolve(parsed.localApplicationData);
    if ((await stableDirectoryPresence(cursor)) !== "present") {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    for (const segment of JOURNAL_SUBDIRECTORY) {
      const candidate = win32.join(cursor, segment);
      if (win32.dirname(candidate).toLowerCase() !== win32.normalize(cursor).toLowerCase()) {
        throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
      }
      if ((await stableDirectoryPresence(candidate)) === "absent") return null;
      cursor = candidate;
    }
    if (win32.normalize(cursor).toLowerCase() !== win32.normalize(expected).toLowerCase()) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    return expected;
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

function emptyLocalJournalState(): BscTestnetPtaWbnbPoolLocalJournalState {
  return stateFrom("empty", null);
}

function recoveryBlocked(): BscTestnetPtaWbnbPoolExistingLocalJournalResult {
  return Object.freeze({
    status: "blocked" as const,
    journal: null,
    state: null,
    issue: Object.freeze({
      code: "RECOVERY_JOURNAL_INVALID" as const,
      message: "The existing signing journal could not be validated without mutation."
    })
  });
}

async function readBoundedFile(path: string): Promise<string | null> {
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
      throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
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
      throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_CHANGED");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function verifyPaths(directory: string, files: readonly string[]): Promise<void> {
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
    directoryBefore.nlink !== directoryAfter.nlink ||
    directoryAfter.nlink < 1n ||
    win32.normalize(canonicalDirectory).toLowerCase() !== directory.toLowerCase()
  ) {
    throw new Error("PTA_WBNB_POOL_JOURNAL_DIRECTORY_INVALID");
  }
  for (const name of files) {
    if (!SLOT_FILES.some((allowed) => allowed === name)) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
    }
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
      throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
    }
  }
}

async function assertWindowsJournalSecure(
  directory: string,
  files: readonly string[]
): Promise<BscTestnetPtaWbnbPoolJournalSecurityMetadata> {
  await verifyPaths(directory, files);
  const input = Buffer.from(
    JSON.stringify({ paths: [directory, ...files.map((name) => win32.join(directory, name))] }),
    "utf8"
  );
  let output: Buffer | null = null;
  try {
    const controller = new AbortController();
    const result = await runPinnedPowerShellForInternalUse(
      ACL_PROBE_SCRIPT,
      input,
      512,
      controller.signal
    );
    output = result.output;
    const parsed = dataRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)));
    if (parsed === null || !securityMetadata(parsed, files.length + 1)) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_ACL_INVALID");
    }
    return parsed as unknown as BscTestnetPtaWbnbPoolJournalSecurityMetadata;
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function protectWindowsJournalRecord(directory: string, path: string): Promise<void> {
  const input = Buffer.from(JSON.stringify({ directory, file: path }), "utf8");
  let output: Buffer | null = null;
  try {
    const controller = new AbortController();
    const result = await runPinnedPowerShellForInternalUse(
      PROTECT_RECORD_SCRIPT,
      input,
      32,
      controller.signal
    );
    output = result.output;
    const record = dataRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)));
    if (record === null || !exactKeys(record, ["ok"]) || record.ok !== true) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_ACL_INVALID");
    }
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

function createWindowsAdapter(directory: string): BscTestnetPtaWbnbPoolLocalJournalRecoveryReader {
  return createBscTestnetPtaWbnbPoolLocalJournalCore(
    Object.freeze({
      now: () => new Date(),
      listNames: async () => {
        const entries = await readdir(directory, { withFileTypes: true });
        const names: string[] = [];
        for (const entry of entries) {
          if (!entry.isFile() || !SLOT_FILES.some((allowed) => allowed === entry.name)) {
            throw new Error("PTA_WBNB_POOL_JOURNAL_DIRECTORY_CONTAMINATED");
          }
          names.push(entry.name);
        }
        return Object.freeze(names.sort());
      },
      readBounded: (name: string) => readBoundedFile(win32.join(directory, name)),
      createExclusive: async (name: string, content: string) => {
        if (!SLOT_FILES.some((allowed) => allowed === name)) {
          throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
        }
        let handle;
        try {
          const path = win32.join(directory, name);
          handle = await open(path, "wx", 0o600);
          await handle.writeFile(content, "utf8");
          await handle.sync();
          const retained = await handle.stat({ bigint: true });
          if (!retained.isFile() || retained.nlink !== 1n) {
            throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
          }
          await handle.close();
          handle = undefined;
          await protectWindowsJournalRecord(directory, path);
          await assertWindowsJournalSecure(directory, [name]);
          return "created" as const;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") return "exists" as const;
          throw error;
        } finally {
          await handle?.close().catch(() => undefined);
        }
      },
      assertSecure: (files: readonly string[]) => assertWindowsJournalSecure(directory, files)
    })
  );
}

async function openExistingLocalAtDirectory(
  directory: string
): Promise<BscTestnetPtaWbnbPoolExistingLocalJournalResult> {
  try {
    const names = (await readdir(directory, { withFileTypes: true })).map((entry) => {
      if (!entry.isFile() || !SLOT_FILES.some((allowed) => allowed === entry.name)) {
        throw new Error("PTA_WBNB_POOL_JOURNAL_DIRECTORY_CONTAMINATED");
      }
      return entry.name;
    });
    await verifyPaths(directory, names);
    await assertWindowsJournalSecure(directory, names);
    if (names.length === 0) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const journal = createWindowsAdapter(directory);
    const state = await journal.readStrictRecoveryState();
    return state === null
      ? recoveryBlocked()
      : Object.freeze({ status: "opened" as const, journal, state, issue: null });
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Fixed production composition. The caller cannot redirect it: Windows resolves its own current
 * user's LocalApplicationData folder through a pinned PowerShell probe, and
 * the adapter provisions and revalidates the fixed directory with a protected current-user-only ACL.
 */
export async function createWindowsBscTestnetPtaWbnbPoolLocalJournal(): Promise<BscTestnetPtaWbnbPoolLocalJournal> {
  if (process.platform !== "win32") throw new Error("PTA_WBNB_POOL_JOURNAL_WINDOWS_REQUIRED");
  const input = Buffer.alloc(0);
  let output: Buffer | null = null;
  let localApplicationData: unknown = null;
  try {
    const controller = new AbortController();
    const result = await runPinnedPowerShellForInternalUse(
      LOCAL_APPLICATION_DATA_PROBE_SCRIPT,
      input,
      1_024,
      controller.signal
    );
    output = result.output;
    const record = dataRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)));
    if (record === null || !exactKeys(record, ["localApplicationData"])) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    localApplicationData = record.localApplicationData;
  } finally {
    output?.fill(0);
  }
  const directory = expectedJournalDirectoryFromLocalAppData(localApplicationData);
  if (directory === null) throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
  return createWindowsAdapter(directory);
}

/**
 * Opens only an already-existing fixed journal. It never creates a directory/file, changes an ACL,
 * reads custody, contacts RPC, or turns malformed retained bytes into an empty state.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedJournalDirectory();
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    return openExistingLocalAtDirectory(directory);
  } catch {
    return recoveryBlocked();
  }
}

/** Strict no-argument recovery probe over the fixed LocalAppData location. */
export async function probeWindowsBscTestnetPtaWbnbPoolLocalJournalRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolLocalJournalRecoveryProbeResult> {
  const opened =
    await openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse();
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

/** Test-only no-write recovery seam over a caller-created synthetic directory. */
export async function openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(
  untrustedDirectory: unknown
): Promise<BscTestnetPtaWbnbPoolExistingLocalJournalResult> {
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
  const relation = relative(REPOSITORY_ROOT, directory);
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
    return recoveryBlocked();
  }
  return openExistingLocalAtDirectory(directory);
}
