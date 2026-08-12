import "server-only";

import { createHash } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import { keccak256, type Hex } from "viem";

import {
  BSC_TESTNET_PTA_DURABLE_CLAIM_OPERATION,
  BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION,
  BSC_TESTNET_PTA_DURABLE_COMMIT_OPERATION,
  type BscTestnetPtaDurableClaimRequest,
  type BscTestnetPtaDurableClaimResult,
  type BscTestnetPtaDurableSignedCommitRequest,
  type BscTestnetPtaDurableSignedCommitResult
} from "./bsc-testnet-pta-one-shot-signer-core";
import {
  BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
  parseBscTestnetPtaSigningWorkerRequestForInternalUse,
  validateBscTestnetPtaSigningWorkerRequest,
  type BscTestnetPtaSigningWorkerRequest
} from "./bsc-testnet-pta-one-shot-worker-protocol";
import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import {
  BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
  BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
  BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS
} from "./bsc-testnet-pta-deployment-envelope";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CLAIM_FILE = "claim.v1.json";
const WORKER_AUTHORIZATION_FILE = "worker-authorization.v1.json";
const WORKER_STARTED_FILE = "worker-started.v1.json";
const RECOVERY_AUTHORIZATION_FILE = "recovery-authorization.v1.json";
const RECOVERY_STARTED_FILE = "recovery-started.v1.json";
const SIGNED_FILE = "signed.v1.json";
const MAXIMUM_RECORD_BYTES = 16_384;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const SIGNED_TRANSACTION = /^0x[0-9a-f]+$/u;
const CLAIM_ID = /^pta-[0-9a-f]{32}$/u;
const CANONICAL_UINT = /^(0|[1-9][0-9]*)$/u;

/**
 * This is deliberately not a generic retry policy. It is the immutable public
 * fingerprint of the single 2026-08-12 pre-signature-expiry incident. The
 * original worker-start file was durably created more than fifteen seconds
 * after the claim clock (and worker freshness is checked after that write), so
 * that worker could not have reached signing.
 */
const EXACT_PRE_SIGN_EXPIRY_INCIDENT = Object.freeze({
  incidentId: "bsc-testnet-pta-pre-sign-expiry-2026-08-12" as const,
  recoveryReason: "original_worker_request_expired_before_secret_unlock" as const,
  attemptCommit: "94e4bc4323138ca34ce9551c87e47b3e0eb8f2e3" as const,
  evidenceCommit: "1537847" as const,
  serializedSigningPayloadBytes: 2_968 as const,
  serializedSigningPayloadSha256:
    "41555951d67d2ceae094e18246d5ea5e0bbf1a1ba2694fff1722f3df82e98076" as const,
  originalFreshnessMaximumAgeSeconds: 15 as const,
  claimId: "pta-5435766f57e50ce0a2ae748336738e4e" as const,
  signingHash: "0x5435766f57e50ce0a2ae748336738e4e7724d85f97c4774476a10bb1a88b44c1" as Hex,
  requestHash: "0x46297835692a5158fa1c003495321a02b450d0edebf9581fd4fc3fa2d137ec14" as Hex,
  sourceEnvelopeHash: "0xf5bc59afcbff9a79586d011e3c080d203fce45cdff794414e0373904d7127cea" as Hex,
  gasLimit: "674171" as const,
  gasPriceWei: "100000000" as const,
  maximumCostWei: "67417100000000" as const,
  claimCreatedAt: "2026-08-12T14:52:27.146Z" as const,
  authorizationRecordedAt: "2026-08-12T14:52:33.110Z" as const,
  startedRecordedAt: "2026-08-12T14:52:41.561Z" as const,
  claimFile: Object.freeze({
    birthtimeNanoseconds: "1786546352538688400",
    modifiedTimeNanoseconds: "1786546352539689500",
    sizeBytes: "677"
  }),
  authorizationFile: Object.freeze({
    birthtimeNanoseconds: "1786546353665026000",
    modifiedTimeNanoseconds: "1786546353665026000",
    sizeBytes: "519"
  }),
  startedFile: Object.freeze({
    birthtimeNanoseconds: "1786546365968244600",
    modifiedTimeNanoseconds: "1786546365969245000",
    sizeBytes: "513"
  }),
  claimSha256: "316599121ec06e0cc74a0268b693c13b41afb95bdfa37c540c385139e9f1b41b",
  authorizationSha256: "d9dc65953b0ad46f4adab1ac7d5213b36f6b4d6aff8e554206db9994f50e74eb",
  startedSha256: "37dcc7b65b8e2a44777f9545ff19fea65f865ac2f1803f89802ceede0c957b91"
});

const ACL_PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
  $spec = $reader.ReadToEnd() | ConvertFrom-Json
  $reader.Dispose()
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  foreach ($path in @($spec.paths)) {
    if ([String]::IsNullOrEmpty($path)) { continue }
    $item = Get-Item -LiteralPath $path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
    $acl = Get-Acl -LiteralPath $path
    if ($acl.Owner -ne $current.Value -and $acl.Owner -ne $current.Translate([System.Security.Principal.NTAccount]).Value) { throw 'owner' }
    if ($path -eq $spec.directory -and -not $acl.AreAccessRulesProtected) { throw 'inheritance' }
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    if ($rules.Count -lt 1) { throw 'rules' }
    foreach ($rule in $rules) {
      if ($rule.IdentityReference.Value -ne $current.Value) { throw 'principal' }
      if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { throw 'deny' }
      if (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { throw 'rights' }
    }
  }
  [Console]::Out.Write('{"ok":true}')
} catch {
  exit 43
}
`;

type DataRecord = Readonly<Record<string, unknown>>;

export type BscTestnetPtaLocalJournalState =
  | Readonly<{ status: "empty"; signedTransaction: null; transactionHash: null }>
  | Readonly<{ status: "claimed"; signedTransaction: null; transactionHash: null }>
  | Readonly<{
      status: "exact_recovery_available";
      signedTransaction: null;
      transactionHash: null;
    }>
  | Readonly<{
      status: "signed_committed";
      signedTransaction: Hex;
      transactionHash: Hex;
    }>
  | Readonly<{ status: "unknown"; signedTransaction: null; transactionHash: null }>;

export interface BscTestnetPtaLocalJournal {
  readonly claimExactDeployment: (
    request: BscTestnetPtaDurableClaimRequest
  ) => Promise<BscTestnetPtaDurableClaimResult>;
  readonly commitSignedTransaction: (
    request: BscTestnetPtaDurableSignedCommitRequest
  ) => Promise<BscTestnetPtaDurableSignedCommitResult>;
  readonly prepareWorkerAuthorization: (
    request: BscTestnetPtaSigningWorkerRequest,
    authorizationDigest: Hex
  ) => Promise<Readonly<{ status: "authorized" }>>;
  readonly consumeWorkerAuthorization: (
    request: BscTestnetPtaSigningWorkerRequest,
    authorizationToken: Hex
  ) => Promise<Readonly<{ status: "consumed" }>>;
  readonly readState: () => Promise<BscTestnetPtaLocalJournalState>;
}

export interface BscTestnetPtaLocalJournalPorts {
  readonly assertSecure: (existingFiles: readonly string[]) => Promise<void>;
  readonly createExclusive: (name: string, content: string) => Promise<"created" | "exists">;
  readonly now: () => Date;
  readonly readBounded: (name: string) => Promise<string | null>;
  readonly readMetadata: (name: string) => Promise<BscTestnetPtaLocalJournalFileMetadata | null>;
}

export interface BscTestnetPtaLocalJournalFileMetadata {
  readonly birthtimeNanoseconds: string;
  readonly modifiedTimeNanoseconds: string;
  readonly sizeBytes: string;
  readonly device: string;
  readonly inode: string;
  readonly contentSha256: string;
}

function dataRecord(input: unknown): DataRecord | null {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input) || isProxy(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
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
      output[key] = descriptor.value;
    }
    return Object.freeze(output);
  } catch {
    return null;
  }
}

function exactKeys(record: DataRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function canonicalDate(input: unknown): string | null {
  if (typeof input !== "string" || !CANONICAL_UTC.test(input)) return null;
  const milliseconds = Date.parse(input);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === input
    ? input
    : null;
}

function captureNow(now: () => Date): string | null {
  try {
    const value = Reflect.apply(now, undefined, []);
    if (
      isProxy(value) ||
      !(value instanceof Date) ||
      Object.getPrototypeOf(value) !== Date.prototype
    ) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
  } catch {
    return null;
  }
}

function inspectClaimRequest(input: unknown): BscTestnetPtaDurableClaimRequest | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !exactKeys(record, [
      "chainId",
      "environment",
      "expectedSigner",
      "oneShotIntentId",
      "operation",
      "predictedContractAddress",
      "schemaVersion",
      "signingHash",
      "sourceEnvelopeHash"
    ]) ||
    record.schemaVersion !== BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION ||
    record.operation !== BSC_TESTNET_PTA_DURABLE_CLAIM_OPERATION ||
    record.oneShotIntentId !== BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID ||
    record.environment !== "bsc-testnet" ||
    record.chainId !== BSC_TESTNET_PTA_CHAIN_ID_DECIMAL ||
    record.expectedSigner !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS ||
    record.predictedContractAddress !== BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS ||
    typeof record.signingHash !== "string" ||
    !BYTES32.test(record.signingHash) ||
    typeof record.sourceEnvelopeHash !== "string" ||
    !BYTES32.test(record.sourceEnvelopeHash)
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION,
    operation: BSC_TESTNET_PTA_DURABLE_CLAIM_OPERATION,
    oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
    environment: "bsc-testnet" as const,
    chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
    expectedSigner: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
    predictedContractAddress: BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
    signingHash: record.signingHash as Hex,
    sourceEnvelopeHash: record.sourceEnvelopeHash as Hex
  });
}

function inspectCommitRequest(input: unknown): BscTestnetPtaDurableSignedCommitRequest | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !exactKeys(record, [
      "claimId",
      "oneShotIntentId",
      "operation",
      "recoveredSigner",
      "requestHash",
      "schemaVersion",
      "signedTransaction",
      "signingHash",
      "transactionHash"
    ]) ||
    record.schemaVersion !== BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION ||
    record.operation !== BSC_TESTNET_PTA_DURABLE_COMMIT_OPERATION ||
    record.oneShotIntentId !== BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID ||
    typeof record.claimId !== "string" ||
    !CLAIM_ID.test(record.claimId) ||
    typeof record.requestHash !== "string" ||
    !BYTES32.test(record.requestHash) ||
    typeof record.signingHash !== "string" ||
    !BYTES32.test(record.signingHash) ||
    typeof record.signedTransaction !== "string" ||
    !SIGNED_TRANSACTION.test(record.signedTransaction) ||
    record.signedTransaction.length > 8_194 ||
    typeof record.transactionHash !== "string" ||
    !BYTES32.test(record.transactionHash) ||
    keccak256(record.signedTransaction as Hex) !== record.transactionHash ||
    record.recoveredSigner !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION,
    operation: BSC_TESTNET_PTA_DURABLE_COMMIT_OPERATION,
    oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
    claimId: record.claimId,
    requestHash: record.requestHash as Hex,
    signingHash: record.signingHash as Hex,
    signedTransaction: record.signedTransaction as Hex,
    transactionHash: record.transactionHash as Hex,
    recoveredSigner: BSC_TESTNET_PTA_DEPLOYER_ADDRESS
  });
}

function serializeClaim(request: BscTestnetPtaDurableClaimRequest, createdAt: string): string {
  const claimId = `pta-${request.signingHash.slice(2, 34)}`;
  return `${JSON.stringify({
    schemaVersion: 1,
    recordType: "bsc_testnet_pta_one_shot_claim",
    createdAt,
    claimId,
    request
  })}\n`;
}

function parseClaim(content: string | null): {
  readonly claimId: string;
  readonly createdAt: string;
  readonly request: BscTestnetPtaDurableClaimRequest;
} | null {
  if (content === null || content.length > MAXIMUM_RECORD_BYTES) return null;
  try {
    const root = dataRecord(JSON.parse(content) as unknown);
    if (
      root === null ||
      !exactKeys(root, ["claimId", "createdAt", "recordType", "request", "schemaVersion"]) ||
      root.schemaVersion !== 1 ||
      root.recordType !== "bsc_testnet_pta_one_shot_claim" ||
      canonicalDate(root.createdAt) === null ||
      typeof root.claimId !== "string" ||
      !CLAIM_ID.test(root.claimId)
    ) {
      return null;
    }
    const createdAt = canonicalDate(root.createdAt);
    const request = inspectClaimRequest(root.request);
    return request === null || createdAt === null
      ? null
      : Object.freeze({ claimId: root.claimId, createdAt, request });
  } catch {
    return null;
  }
}

function serializeSigned(
  request: BscTestnetPtaDurableSignedCommitRequest,
  committedAt: string
): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    recordType: "bsc_testnet_pta_signed_transaction_commit",
    committedAt,
    request
  })}\n`;
}

function parseSigned(content: string | null): BscTestnetPtaDurableSignedCommitRequest | null {
  if (content === null || content.length > MAXIMUM_RECORD_BYTES) return null;
  try {
    const root = dataRecord(JSON.parse(content) as unknown);
    if (
      root === null ||
      !exactKeys(root, ["committedAt", "recordType", "request", "schemaVersion"]) ||
      root.schemaVersion !== 1 ||
      root.recordType !== "bsc_testnet_pta_signed_transaction_commit" ||
      canonicalDate(root.committedAt) === null
    ) {
      return null;
    }
    return inspectCommitRequest(root.request);
  } catch {
    return null;
  }
}

function sameClaim(
  left: BscTestnetPtaDurableClaimRequest,
  right: BscTestnetPtaDurableClaimRequest
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameCommit(
  left: BscTestnetPtaDurableSignedCommitRequest,
  right: BscTestnetPtaDurableSignedCommitRequest
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

type WorkerAuthorizationRecord = Readonly<{
  claimId: string;
  requestHash: Hex;
  signingHash: Hex;
  sourceEnvelopeHash: Hex;
  authorizationDigest: Hex;
}>;

type WorkerRecordType = "bsc_testnet_pta_worker_authorization" | "bsc_testnet_pta_worker_started";

const WORKER_AUTHORIZATION_KEYS = [
  "authorizationDigest",
  "claimId",
  "requestHash",
  "signingHash",
  "sourceEnvelopeHash"
] as const;

function inspectWorkerAuthorizationRecord(input: unknown): WorkerAuthorizationRecord | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !exactKeys(record, WORKER_AUTHORIZATION_KEYS) ||
    typeof record.claimId !== "string" ||
    !CLAIM_ID.test(record.claimId) ||
    typeof record.requestHash !== "string" ||
    !BYTES32.test(record.requestHash) ||
    typeof record.signingHash !== "string" ||
    !BYTES32.test(record.signingHash) ||
    typeof record.sourceEnvelopeHash !== "string" ||
    !BYTES32.test(record.sourceEnvelopeHash) ||
    typeof record.authorizationDigest !== "string" ||
    !BYTES32.test(record.authorizationDigest)
  ) {
    return null;
  }
  return Object.freeze({
    claimId: record.claimId,
    requestHash: record.requestHash as Hex,
    signingHash: record.signingHash as Hex,
    sourceEnvelopeHash: record.sourceEnvelopeHash as Hex,
    authorizationDigest: record.authorizationDigest as Hex
  });
}

function serializeWorkerRecord(
  recordType: WorkerRecordType,
  record: WorkerAuthorizationRecord,
  recordedAt: string
): string {
  return `${JSON.stringify({ schemaVersion: 1, recordType, recordedAt, record })}\n`;
}

function parseWorkerRecord(
  content: string | null,
  expectedType: WorkerRecordType
): WorkerAuthorizationRecord | null {
  return parseTimestampedWorkerRecord(content, expectedType)?.record ?? null;
}

function parseTimestampedWorkerRecord(
  content: string | null,
  expectedType: WorkerRecordType
): Readonly<{ recordedAt: string; record: WorkerAuthorizationRecord }> | null {
  if (content === null || content.length > MAXIMUM_RECORD_BYTES) return null;
  try {
    const root = dataRecord(JSON.parse(content) as unknown);
    if (
      root === null ||
      !exactKeys(root, ["record", "recordType", "recordedAt", "schemaVersion"]) ||
      root.schemaVersion !== 1 ||
      root.recordType !== expectedType ||
      canonicalDate(root.recordedAt) === null
    ) {
      return null;
    }
    const recordedAt = canonicalDate(root.recordedAt);
    const record = inspectWorkerAuthorizationRecord(root.record);
    return recordedAt === null || record === null ? null : Object.freeze({ recordedAt, record });
  } catch {
    return null;
  }
}

type RecoveryAuthorizationRecord = Readonly<{
  incidentId: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.incidentId;
  recoveryReason: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.recoveryReason;
  attemptCommit: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.attemptCommit;
  evidenceCommit: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.evidenceCommit;
  originalFreshnessMaximumAgeSeconds: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.originalFreshnessMaximumAgeSeconds;
  originalClaimId: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimId;
  originalClaimCreatedAt: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimCreatedAt;
  originalClaimBirthtimeNanoseconds: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.birthtimeNanoseconds;
  originalClaimModifiedTimeNanoseconds: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.modifiedTimeNanoseconds;
  originalClaimSizeBytes: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.sizeBytes;
  originalAuthorizationRecordedAt: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationRecordedAt;
  originalAuthorizationBirthtimeNanoseconds: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.birthtimeNanoseconds;
  originalAuthorizationModifiedTimeNanoseconds: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.modifiedTimeNanoseconds;
  originalAuthorizationSizeBytes: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.sizeBytes;
  originalStartedRecordedAt: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedRecordedAt;
  originalStartedBirthtimeNanoseconds: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.birthtimeNanoseconds;
  originalStartedModifiedTimeNanoseconds: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.modifiedTimeNanoseconds;
  originalStartedSizeBytes: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.sizeBytes;
  originalRequestHash: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.requestHash;
  originalSourceEnvelopeHash: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.sourceEnvelopeHash;
  recoveryClaimId: string;
  recoveryRequestHash: Hex;
  recoverySourceEnvelopeHash: Hex;
  signingHash: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.signingHash;
  gasLimit: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasLimit;
  gasPriceWei: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasPriceWei;
  maximumCostWei: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.maximumCostWei;
  serializedSigningPayloadBytes: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadBytes;
  serializedSigningPayloadSha256: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadSha256;
  originalClaimSha256: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimSha256;
  originalAuthorizationSha256: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationSha256;
  originalStartedSha256: typeof EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedSha256;
  authorizationDigest: Hex;
}>;

const RECOVERY_AUTHORIZATION_KEYS = [
  "attemptCommit",
  "authorizationDigest",
  "evidenceCommit",
  "gasLimit",
  "gasPriceWei",
  "incidentId",
  "maximumCostWei",
  "originalAuthorizationBirthtimeNanoseconds",
  "originalAuthorizationModifiedTimeNanoseconds",
  "originalAuthorizationRecordedAt",
  "originalClaimId",
  "originalClaimBirthtimeNanoseconds",
  "originalClaimCreatedAt",
  "originalClaimModifiedTimeNanoseconds",
  "originalClaimSizeBytes",
  "originalClaimSha256",
  "originalAuthorizationSha256",
  "originalAuthorizationSizeBytes",
  "originalFreshnessMaximumAgeSeconds",
  "originalRequestHash",
  "originalStartedBirthtimeNanoseconds",
  "originalStartedModifiedTimeNanoseconds",
  "originalStartedRecordedAt",
  "originalStartedSha256",
  "originalStartedSizeBytes",
  "originalSourceEnvelopeHash",
  "recoveryClaimId",
  "recoveryReason",
  "recoveryRequestHash",
  "recoverySourceEnvelopeHash",
  "serializedSigningPayloadBytes",
  "serializedSigningPayloadSha256",
  "signingHash"
] as const;

function inspectRecoveryAuthorizationRecord(input: unknown): RecoveryAuthorizationRecord | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !exactKeys(record, RECOVERY_AUTHORIZATION_KEYS) ||
    record.incidentId !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.incidentId ||
    record.recoveryReason !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.recoveryReason ||
    record.attemptCommit !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.attemptCommit ||
    record.evidenceCommit !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.evidenceCommit ||
    record.originalFreshnessMaximumAgeSeconds !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.originalFreshnessMaximumAgeSeconds ||
    record.originalClaimId !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimId ||
    record.originalClaimCreatedAt !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimCreatedAt ||
    record.originalClaimBirthtimeNanoseconds !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.birthtimeNanoseconds ||
    record.originalClaimModifiedTimeNanoseconds !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.modifiedTimeNanoseconds ||
    record.originalClaimSizeBytes !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.sizeBytes ||
    record.originalAuthorizationRecordedAt !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationRecordedAt ||
    record.originalAuthorizationBirthtimeNanoseconds !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.birthtimeNanoseconds ||
    record.originalAuthorizationModifiedTimeNanoseconds !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.modifiedTimeNanoseconds ||
    record.originalAuthorizationSizeBytes !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.sizeBytes ||
    record.originalStartedRecordedAt !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedRecordedAt ||
    record.originalStartedBirthtimeNanoseconds !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.birthtimeNanoseconds ||
    record.originalStartedModifiedTimeNanoseconds !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.modifiedTimeNanoseconds ||
    record.originalStartedSizeBytes !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.sizeBytes ||
    record.originalClaimSha256 !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimSha256 ||
    record.originalAuthorizationSha256 !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationSha256 ||
    record.originalRequestHash !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.requestHash ||
    record.originalStartedSha256 !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedSha256 ||
    record.originalSourceEnvelopeHash !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.sourceEnvelopeHash ||
    record.signingHash !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.signingHash ||
    record.gasLimit !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasLimit ||
    record.gasPriceWei !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasPriceWei ||
    record.maximumCostWei !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.maximumCostWei ||
    record.serializedSigningPayloadBytes !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadBytes ||
    record.serializedSigningPayloadSha256 !==
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadSha256 ||
    typeof record.recoveryClaimId !== "string" ||
    !CLAIM_ID.test(record.recoveryClaimId) ||
    typeof record.recoveryRequestHash !== "string" ||
    !BYTES32.test(record.recoveryRequestHash) ||
    typeof record.recoverySourceEnvelopeHash !== "string" ||
    !BYTES32.test(record.recoverySourceEnvelopeHash) ||
    typeof record.authorizationDigest !== "string" ||
    !BYTES32.test(record.authorizationDigest)
  ) {
    return null;
  }
  return Object.freeze({
    incidentId: EXACT_PRE_SIGN_EXPIRY_INCIDENT.incidentId,
    recoveryReason: EXACT_PRE_SIGN_EXPIRY_INCIDENT.recoveryReason,
    attemptCommit: EXACT_PRE_SIGN_EXPIRY_INCIDENT.attemptCommit,
    evidenceCommit: EXACT_PRE_SIGN_EXPIRY_INCIDENT.evidenceCommit,
    originalFreshnessMaximumAgeSeconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.originalFreshnessMaximumAgeSeconds,
    originalClaimId: EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimId,
    originalClaimCreatedAt: EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimCreatedAt,
    originalClaimBirthtimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.birthtimeNanoseconds,
    originalClaimModifiedTimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.modifiedTimeNanoseconds,
    originalClaimSizeBytes: EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.sizeBytes,
    originalAuthorizationRecordedAt: EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationRecordedAt,
    originalAuthorizationBirthtimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.birthtimeNanoseconds,
    originalAuthorizationModifiedTimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.modifiedTimeNanoseconds,
    originalAuthorizationSizeBytes: EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.sizeBytes,
    originalStartedRecordedAt: EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedRecordedAt,
    originalStartedBirthtimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.birthtimeNanoseconds,
    originalStartedModifiedTimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.modifiedTimeNanoseconds,
    originalStartedSizeBytes: EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.sizeBytes,
    originalClaimSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimSha256,
    originalAuthorizationSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationSha256,
    originalRequestHash: EXACT_PRE_SIGN_EXPIRY_INCIDENT.requestHash,
    originalStartedSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedSha256,
    originalSourceEnvelopeHash: EXACT_PRE_SIGN_EXPIRY_INCIDENT.sourceEnvelopeHash,
    recoveryClaimId: record.recoveryClaimId,
    recoveryRequestHash: record.recoveryRequestHash as Hex,
    recoverySourceEnvelopeHash: record.recoverySourceEnvelopeHash as Hex,
    signingHash: EXACT_PRE_SIGN_EXPIRY_INCIDENT.signingHash,
    gasLimit: EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasLimit,
    gasPriceWei: EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasPriceWei,
    maximumCostWei: EXACT_PRE_SIGN_EXPIRY_INCIDENT.maximumCostWei,
    serializedSigningPayloadBytes: EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadBytes,
    serializedSigningPayloadSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadSha256,
    authorizationDigest: record.authorizationDigest as Hex
  });
}

function recoveryRecordFor(
  request: BscTestnetPtaSigningWorkerRequest,
  authorizationDigest: Hex
): RecoveryAuthorizationRecord {
  return Object.freeze({
    incidentId: EXACT_PRE_SIGN_EXPIRY_INCIDENT.incidentId,
    recoveryReason: EXACT_PRE_SIGN_EXPIRY_INCIDENT.recoveryReason,
    attemptCommit: EXACT_PRE_SIGN_EXPIRY_INCIDENT.attemptCommit,
    evidenceCommit: EXACT_PRE_SIGN_EXPIRY_INCIDENT.evidenceCommit,
    originalFreshnessMaximumAgeSeconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.originalFreshnessMaximumAgeSeconds,
    originalClaimId: EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimId,
    originalClaimCreatedAt: EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimCreatedAt,
    originalClaimBirthtimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.birthtimeNanoseconds,
    originalClaimModifiedTimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.modifiedTimeNanoseconds,
    originalClaimSizeBytes: EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile.sizeBytes,
    originalAuthorizationRecordedAt: EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationRecordedAt,
    originalAuthorizationBirthtimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.birthtimeNanoseconds,
    originalAuthorizationModifiedTimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.modifiedTimeNanoseconds,
    originalAuthorizationSizeBytes: EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile.sizeBytes,
    originalStartedRecordedAt: EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedRecordedAt,
    originalStartedBirthtimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.birthtimeNanoseconds,
    originalStartedModifiedTimeNanoseconds:
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.modifiedTimeNanoseconds,
    originalStartedSizeBytes: EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile.sizeBytes,
    originalClaimSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimSha256,
    originalAuthorizationSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationSha256,
    originalRequestHash: EXACT_PRE_SIGN_EXPIRY_INCIDENT.requestHash,
    originalStartedSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedSha256,
    originalSourceEnvelopeHash: EXACT_PRE_SIGN_EXPIRY_INCIDENT.sourceEnvelopeHash,
    recoveryClaimId: request.claimId,
    recoveryRequestHash: request.requestHash,
    recoverySourceEnvelopeHash: request.transaction.sourceEnvelopeHash,
    signingHash: EXACT_PRE_SIGN_EXPIRY_INCIDENT.signingHash,
    gasLimit: EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasLimit,
    gasPriceWei: EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasPriceWei,
    maximumCostWei: EXACT_PRE_SIGN_EXPIRY_INCIDENT.maximumCostWei,
    serializedSigningPayloadBytes: EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadBytes,
    serializedSigningPayloadSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadSha256,
    authorizationDigest
  });
}

function serializeRecoveryRecord(
  recordType: "bsc_testnet_pta_recovery_authorization" | "bsc_testnet_pta_recovery_started",
  record: RecoveryAuthorizationRecord,
  recordedAt: string
): string {
  return `${JSON.stringify({ schemaVersion: 1, recordType, recordedAt, record })}\n`;
}

function parseRecoveryRecord(
  content: string | null,
  expectedType: "bsc_testnet_pta_recovery_authorization" | "bsc_testnet_pta_recovery_started"
): RecoveryAuthorizationRecord | null {
  if (content === null || content.length > MAXIMUM_RECORD_BYTES) return null;
  try {
    const root = dataRecord(JSON.parse(content) as unknown);
    if (
      root === null ||
      !exactKeys(root, ["record", "recordType", "recordedAt", "schemaVersion"]) ||
      root.schemaVersion !== 1 ||
      root.recordType !== expectedType ||
      canonicalDate(root.recordedAt) === null
    ) {
      return null;
    }
    return inspectRecoveryAuthorizationRecord(root.record);
  } catch {
    return null;
  }
}

function sameRecoveryRecord(
  left: RecoveryAuthorizationRecord,
  right: RecoveryAuthorizationRecord
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function inspectMetadata(input: unknown): BscTestnetPtaLocalJournalFileMetadata | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !exactKeys(record, [
      "birthtimeNanoseconds",
      "contentSha256",
      "device",
      "inode",
      "modifiedTimeNanoseconds",
      "sizeBytes"
    ]) ||
    typeof record.birthtimeNanoseconds !== "string" ||
    !CANONICAL_UINT.test(record.birthtimeNanoseconds) ||
    typeof record.modifiedTimeNanoseconds !== "string" ||
    !CANONICAL_UINT.test(record.modifiedTimeNanoseconds) ||
    typeof record.sizeBytes !== "string" ||
    !CANONICAL_UINT.test(record.sizeBytes) ||
    typeof record.device !== "string" ||
    !CANONICAL_UINT.test(record.device) ||
    typeof record.inode !== "string" ||
    !/^[1-9][0-9]*$/u.test(record.inode) ||
    typeof record.contentSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(record.contentSha256)
  ) {
    return null;
  }
  return Object.freeze({
    birthtimeNanoseconds: record.birthtimeNanoseconds,
    modifiedTimeNanoseconds: record.modifiedTimeNanoseconds,
    sizeBytes: record.sizeBytes,
    device: record.device,
    inode: record.inode,
    contentSha256: record.contentSha256
  });
}

function exactMetadata(
  actual: BscTestnetPtaLocalJournalFileMetadata,
  expected: Readonly<{
    birthtimeNanoseconds: string;
    modifiedTimeNanoseconds: string;
    sizeBytes: string;
  }>
): boolean {
  return (
    actual.birthtimeNanoseconds === expected.birthtimeNanoseconds &&
    actual.modifiedTimeNanoseconds === expected.modifiedTimeNanoseconds &&
    actual.sizeBytes === expected.sizeBytes
  );
}

type OriginalIncidentEvidence = Readonly<{
  claim: NonNullable<ReturnType<typeof parseClaim>>;
  authorization: WorkerAuthorizationRecord;
  started: WorkerAuthorizationRecord;
}>;

async function inspectExactPreSignExpiryIncident(
  ports: BscTestnetPtaLocalJournalPorts,
  contents: Readonly<{
    claim: string | null;
    authorization: string | null;
    started: string | null;
  }>
): Promise<OriginalIncidentEvidence | null> {
  const claim = parseClaim(contents.claim);
  const authorization = parseTimestampedWorkerRecord(
    contents.authorization,
    "bsc_testnet_pta_worker_authorization"
  );
  const started = parseTimestampedWorkerRecord(contents.started, "bsc_testnet_pta_worker_started");
  if (
    contents.claim === null ||
    contents.authorization === null ||
    contents.started === null ||
    claim === null ||
    authorization === null ||
    started === null ||
    claim.claimId !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimId ||
    claim.createdAt !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimCreatedAt ||
    claim.request.signingHash !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.signingHash ||
    claim.request.sourceEnvelopeHash !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.sourceEnvelopeHash ||
    authorization.recordedAt !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationRecordedAt ||
    started.recordedAt !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedRecordedAt ||
    authorization.record.claimId !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimId ||
    authorization.record.requestHash !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.requestHash ||
    authorization.record.signingHash !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.signingHash ||
    authorization.record.sourceEnvelopeHash !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.sourceEnvelopeHash ||
    !sameWorkerRecord(authorization.record, started.record)
  ) {
    return null;
  }
  const [claimMetadataInput, authorizationMetadataInput, startedMetadataInput] = await Promise.all([
    ports.readMetadata(CLAIM_FILE),
    ports.readMetadata(WORKER_AUTHORIZATION_FILE),
    ports.readMetadata(WORKER_STARTED_FILE)
  ]);
  const claimMetadata = inspectMetadata(claimMetadataInput);
  const authorizationMetadata = inspectMetadata(authorizationMetadataInput);
  const startedMetadata = inspectMetadata(startedMetadataInput);
  if (
    claimMetadata === null ||
    authorizationMetadata === null ||
    startedMetadata === null ||
    !exactMetadata(claimMetadata, EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile) ||
    !exactMetadata(authorizationMetadata, EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile) ||
    !exactMetadata(startedMetadata, EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile) ||
    claimMetadata.contentSha256 !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimSha256 ||
    authorizationMetadata.contentSha256 !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationSha256 ||
    startedMetadata.contentSha256 !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedSha256 ||
    claimMetadata.device !== authorizationMetadata.device ||
    claimMetadata.device !== startedMetadata.device ||
    new Set([claimMetadata.inode, authorizationMetadata.inode, startedMetadata.inode]).size !== 3 ||
    BigInt(startedMetadata.birthtimeNanoseconds) -
      BigInt(Date.parse(EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimCreatedAt)) * 1_000_000n <=
      BigInt(EXACT_PRE_SIGN_EXPIRY_INCIDENT.originalFreshnessMaximumAgeSeconds) * 1_000_000_000n
  ) {
    return null;
  }
  return Object.freeze({
    claim,
    authorization: authorization.record,
    started: started.record
  });
}

function exactRecoveryRequest(request: BscTestnetPtaSigningWorkerRequest): boolean {
  return (
    request.claimId === EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimId &&
    request.transaction.signingHash === EXACT_PRE_SIGN_EXPIRY_INCIDENT.signingHash &&
    request.transaction.gasLimit === EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasLimit &&
    request.transaction.gasPriceWei === EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasPriceWei &&
    request.transaction.maximumCostWei === EXACT_PRE_SIGN_EXPIRY_INCIDENT.maximumCostWei &&
    (request.transaction.serializedSigningPayload.length - 2) / 2 ===
      EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadBytes &&
    createHash("sha256")
      .update(Buffer.from(request.transaction.serializedSigningPayload.slice(2), "hex"))
      .digest("hex") === EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadSha256 &&
    request.requestHash !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.requestHash
  );
}

function workerRecordFor(
  request: BscTestnetPtaSigningWorkerRequest,
  authorizationDigest: Hex
): WorkerAuthorizationRecord {
  return Object.freeze({
    claimId: request.claimId,
    requestHash: request.requestHash,
    signingHash: request.transaction.signingHash,
    sourceEnvelopeHash: request.transaction.sourceEnvelopeHash,
    authorizationDigest
  });
}

function sameWorkerRecord(
  left: WorkerAuthorizationRecord,
  right: WorkerAuthorizationRecord
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function inspectPorts(input: unknown): BscTestnetPtaLocalJournalPorts | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !exactKeys(record, ["assertSecure", "createExclusive", "now", "readBounded", "readMetadata"]) ||
    typeof record.assertSecure !== "function" ||
    isProxy(record.assertSecure) ||
    typeof record.createExclusive !== "function" ||
    isProxy(record.createExclusive) ||
    typeof record.now !== "function" ||
    isProxy(record.now) ||
    typeof record.readBounded !== "function" ||
    isProxy(record.readBounded) ||
    typeof record.readMetadata !== "function" ||
    isProxy(record.readMetadata)
  ) {
    return null;
  }
  return record as unknown as BscTestnetPtaLocalJournalPorts;
}

/**
 * Local-operator/testnet journal only. The API never overwrites, deletes, or
 * reclaims the fixed intent. An unsigned start is terminal except for the one
 * immutable, evidence-bound pre-signature-expiry incident described above.
 */
export function createBscTestnetPtaLocalJournalCore(
  untrustedPorts: unknown
): BscTestnetPtaLocalJournal {
  const ports = inspectPorts(untrustedPorts);
  if (ports === null) throw new Error("PTA_LOCAL_JOURNAL_CONFIGURATION_INVALID");

  const readState = async (): Promise<BscTestnetPtaLocalJournalState> => {
    try {
      const claimContent = await ports.readBounded(CLAIM_FILE);
      const authorizationContent = await ports.readBounded(WORKER_AUTHORIZATION_FILE);
      const startedContent = await ports.readBounded(WORKER_STARTED_FILE);
      const recoveryAuthorizationContent = await ports.readBounded(RECOVERY_AUTHORIZATION_FILE);
      const recoveryStartedContent = await ports.readBounded(RECOVERY_STARTED_FILE);
      const signedContent = await ports.readBounded(SIGNED_FILE);
      const existing = [
        ...(claimContent === null ? [] : [CLAIM_FILE]),
        ...(authorizationContent === null ? [] : [WORKER_AUTHORIZATION_FILE]),
        ...(startedContent === null ? [] : [WORKER_STARTED_FILE]),
        ...(recoveryAuthorizationContent === null ? [] : [RECOVERY_AUTHORIZATION_FILE]),
        ...(recoveryStartedContent === null ? [] : [RECOVERY_STARTED_FILE]),
        ...(signedContent === null ? [] : [SIGNED_FILE])
      ];
      await ports.assertSecure(existing);
      if (
        claimContent === null &&
        authorizationContent === null &&
        startedContent === null &&
        recoveryAuthorizationContent === null &&
        recoveryStartedContent === null &&
        signedContent === null
      ) {
        return Object.freeze({
          status: "empty" as const,
          signedTransaction: null,
          transactionHash: null
        });
      }
      const claim = parseClaim(claimContent);
      if (claim === null) {
        return Object.freeze({
          status: "unknown" as const,
          signedTransaction: null,
          transactionHash: null
        });
      }
      const incident =
        authorizationContent === null || startedContent === null
          ? null
          : await inspectExactPreSignExpiryIncident(ports, {
              claim: claimContent,
              authorization: authorizationContent,
              started: startedContent
            });
      if (signedContent === null) {
        if (
          recoveryAuthorizationContent !== null ||
          recoveryStartedContent !== null ||
          ((authorizationContent !== null || startedContent !== null) && incident === null)
        ) {
          return Object.freeze({
            status: "unknown" as const,
            signedTransaction: null,
            transactionHash: null
          });
        }
        if (incident !== null) {
          return Object.freeze({
            status: "exact_recovery_available" as const,
            signedTransaction: null,
            transactionHash: null
          });
        }
        return Object.freeze({
          status: "claimed" as const,
          signedTransaction: null,
          transactionHash: null
        });
      }
      const signed = parseSigned(signedContent);
      const authorization = parseWorkerRecord(
        authorizationContent,
        "bsc_testnet_pta_worker_authorization"
      );
      const started = parseWorkerRecord(startedContent, "bsc_testnet_pta_worker_started");
      const recoveryAuthorization = parseRecoveryRecord(
        recoveryAuthorizationContent,
        "bsc_testnet_pta_recovery_authorization"
      );
      const recoveryStarted = parseRecoveryRecord(
        recoveryStartedContent,
        "bsc_testnet_pta_recovery_started"
      );
      const normalCommitValid =
        recoveryAuthorizationContent === null &&
        recoveryStartedContent === null &&
        authorization !== null &&
        started !== null &&
        sameWorkerRecord(authorization, started) &&
        authorization.claimId === claim.claimId &&
        authorization.signingHash === claim.request.signingHash &&
        authorization.sourceEnvelopeHash === claim.request.sourceEnvelopeHash &&
        signed?.requestHash === started.requestHash;
      const recoveryCommitValid =
        incident !== null &&
        recoveryAuthorization !== null &&
        recoveryStarted !== null &&
        sameRecoveryRecord(recoveryAuthorization, recoveryStarted) &&
        recoveryAuthorization.recoveryClaimId === claim.claimId &&
        recoveryAuthorization.signingHash === claim.request.signingHash &&
        signed?.requestHash === recoveryStarted.recoveryRequestHash;
      if (
        signed === null ||
        signed.claimId !== claim.claimId ||
        signed.signingHash !== claim.request.signingHash ||
        (!normalCommitValid && !recoveryCommitValid)
      ) {
        return Object.freeze({
          status: "unknown" as const,
          signedTransaction: null,
          transactionHash: null
        });
      }
      return Object.freeze({
        status: "signed_committed" as const,
        signedTransaction: signed.signedTransaction,
        transactionHash: signed.transactionHash
      });
    } catch {
      return Object.freeze({
        status: "unknown" as const,
        signedTransaction: null,
        transactionHash: null
      });
    }
  };

  const claimExactDeployment = async (
    untrustedRequest: BscTestnetPtaDurableClaimRequest
  ): Promise<BscTestnetPtaDurableClaimResult> => {
    const request = inspectClaimRequest(untrustedRequest);
    const createdAt = captureNow(ports.now);
    if (request === null || createdAt === null) throw new Error("PTA_LOCAL_JOURNAL_INPUT_INVALID");
    await ports.assertSecure([]);
    const claimId = `pta-${request.signingHash.slice(2, 34)}`;
    const existingContentBeforeCreate = await ports.readBounded(CLAIM_FILE);
    if (existingContentBeforeCreate !== null) {
      const existingBeforeCreate = parseClaim(existingContentBeforeCreate);
      if (existingBeforeCreate === null || existingBeforeCreate.claimId !== claimId) {
        throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
      }
      await ports.assertSecure([CLAIM_FILE]);
      const state = await readState();
      if (
        state.status === "exact_recovery_available" &&
        request.signingHash === EXACT_PRE_SIGN_EXPIRY_INCIDENT.signingHash &&
        existingBeforeCreate.claimId === EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimId
      ) {
        return Object.freeze({ status: "claimed" as const, claimId });
      }
      if (!sameClaim(existingBeforeCreate.request, request)) {
        throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
      }
      return Object.freeze({
        status: "already_exists" as const,
        state:
          state.status === "signed_committed"
            ? "signed_committed"
            : state.status === "claimed"
              ? "claimed"
              : "unknown"
      });
    }
    const outcome = await ports.createExclusive(CLAIM_FILE, serializeClaim(request, createdAt));
    const existing = parseClaim(await ports.readBounded(CLAIM_FILE));
    if (
      existing === null ||
      existing.claimId !== claimId ||
      !sameClaim(existing.request, request)
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
    }
    await ports.assertSecure([CLAIM_FILE]);
    if (outcome === "created") return Object.freeze({ status: "claimed" as const, claimId });
    const state = await readState();
    return Object.freeze({
      status: "already_exists" as const,
      state:
        state.status === "signed_committed"
          ? "signed_committed"
          : state.status === "claimed"
            ? "claimed"
            : "unknown"
    });
  };

  const prepareWorkerAuthorization = async (
    untrustedRequest: BscTestnetPtaSigningWorkerRequest,
    untrustedAuthorizationDigest: Hex
  ): Promise<Readonly<{ status: "authorized" }>> => {
    const request = parseBscTestnetPtaSigningWorkerRequestForInternalUse(untrustedRequest);
    const recordedAt = captureNow(ports.now);
    if (
      request === null ||
      recordedAt === null ||
      typeof untrustedAuthorizationDigest !== "string" ||
      !BYTES32.test(untrustedAuthorizationDigest)
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_INPUT_INVALID");
    }
    const claimContent = await ports.readBounded(CLAIM_FILE);
    const claim = parseClaim(claimContent);
    if (claim === null || claim.claimId !== request.claimId) {
      throw new Error("PTA_LOCAL_JOURNAL_CLAIM_MISMATCH");
    }
    const originalAuthorizationContent = await ports.readBounded(WORKER_AUTHORIZATION_FILE);
    const originalStartedContent = await ports.readBounded(WORKER_STARTED_FILE);
    const recoveryAuthorizationContent = await ports.readBounded(RECOVERY_AUTHORIZATION_FILE);
    const recoveryStartedContent = await ports.readBounded(RECOVERY_STARTED_FILE);
    const signedContent = await ports.readBounded(SIGNED_FILE);
    const recovery =
      signedContent === null &&
      recoveryAuthorizationContent === null &&
      recoveryStartedContent === null &&
      exactRecoveryRequest(request) &&
      (await inspectExactPreSignExpiryIncident(ports, {
        claim: claimContent,
        authorization: originalAuthorizationContent,
        started: originalStartedContent
      })) !== null;
    if (recovery) {
      const validation = validateBscTestnetPtaSigningWorkerRequest(request, new Date(recordedAt));
      if (validation.status !== "valid") {
        throw new Error("PTA_LOCAL_JOURNAL_RECOVERY_REQUEST_INVALID");
      }
      await ports.assertSecure([CLAIM_FILE, WORKER_AUTHORIZATION_FILE, WORKER_STARTED_FILE]);
      const recoveryRecord = recoveryRecordFor(request, untrustedAuthorizationDigest);
      const outcome = await ports.createExclusive(
        RECOVERY_AUTHORIZATION_FILE,
        serializeRecoveryRecord(
          "bsc_testnet_pta_recovery_authorization",
          recoveryRecord,
          recordedAt
        )
      );
      if (outcome !== "created") throw new Error("PTA_LOCAL_JOURNAL_WORKER_ALREADY_AUTHORIZED");
      const retained = parseRecoveryRecord(
        await ports.readBounded(RECOVERY_AUTHORIZATION_FILE),
        "bsc_testnet_pta_recovery_authorization"
      );
      if (retained === null || !sameRecoveryRecord(retained, recoveryRecord)) {
        throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
      }
      await ports.assertSecure([
        CLAIM_FILE,
        WORKER_AUTHORIZATION_FILE,
        WORKER_STARTED_FILE,
        RECOVERY_AUTHORIZATION_FILE
      ]);
      return Object.freeze({ status: "authorized" as const });
    }
    if (
      claim.request.signingHash !== request.transaction.signingHash ||
      claim.request.sourceEnvelopeHash !== request.transaction.sourceEnvelopeHash ||
      originalAuthorizationContent !== null ||
      originalStartedContent !== null ||
      recoveryAuthorizationContent !== null ||
      recoveryStartedContent !== null ||
      signedContent !== null
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_CLAIM_MISMATCH");
    }
    await ports.assertSecure([CLAIM_FILE]);
    const record = workerRecordFor(request, untrustedAuthorizationDigest);
    const outcome = await ports.createExclusive(
      WORKER_AUTHORIZATION_FILE,
      serializeWorkerRecord("bsc_testnet_pta_worker_authorization", record, recordedAt)
    );
    if (outcome !== "created") throw new Error("PTA_LOCAL_JOURNAL_WORKER_ALREADY_AUTHORIZED");
    const retained = parseWorkerRecord(
      await ports.readBounded(WORKER_AUTHORIZATION_FILE),
      "bsc_testnet_pta_worker_authorization"
    );
    if (retained === null || !sameWorkerRecord(retained, record)) {
      throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
    }
    await ports.assertSecure([CLAIM_FILE, WORKER_AUTHORIZATION_FILE]);
    return Object.freeze({ status: "authorized" as const });
  };

  const consumeWorkerAuthorization = async (
    untrustedRequest: BscTestnetPtaSigningWorkerRequest,
    untrustedAuthorizationToken: Hex
  ): Promise<Readonly<{ status: "consumed" }>> => {
    const request = parseBscTestnetPtaSigningWorkerRequestForInternalUse(untrustedRequest);
    const recordedAt = captureNow(ports.now);
    if (
      request === null ||
      recordedAt === null ||
      typeof untrustedAuthorizationToken !== "string" ||
      !BYTES32.test(untrustedAuthorizationToken)
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_INPUT_INVALID");
    }
    const claimContent = await ports.readBounded(CLAIM_FILE);
    const claim = parseClaim(claimContent);
    const originalAuthorizationContent = await ports.readBounded(WORKER_AUTHORIZATION_FILE);
    const originalStartedContent = await ports.readBounded(WORKER_STARTED_FILE);
    const recoveryAuthorizationContent = await ports.readBounded(RECOVERY_AUTHORIZATION_FILE);
    const recoveryStartedContent = await ports.readBounded(RECOVERY_STARTED_FILE);
    const signedContent = await ports.readBounded(SIGNED_FILE);
    const authorization = parseWorkerRecord(
      originalAuthorizationContent,
      "bsc_testnet_pta_worker_authorization"
    );
    const expected = workerRecordFor(request, keccak256(untrustedAuthorizationToken));
    const recoveryAuthorization = parseRecoveryRecord(
      recoveryAuthorizationContent,
      "bsc_testnet_pta_recovery_authorization"
    );
    const expectedRecovery = recoveryRecordFor(request, keccak256(untrustedAuthorizationToken));
    const incident = await inspectExactPreSignExpiryIncident(ports, {
      claim: claimContent,
      authorization: originalAuthorizationContent,
      started: originalStartedContent
    });
    if (
      claim !== null &&
      incident !== null &&
      signedContent === null &&
      recoveryStartedContent === null &&
      exactRecoveryRequest(request) &&
      recoveryAuthorization !== null &&
      sameRecoveryRecord(recoveryAuthorization, expectedRecovery)
    ) {
      const validation = validateBscTestnetPtaSigningWorkerRequest(request, new Date(recordedAt));
      if (validation.status !== "valid") {
        throw new Error("PTA_LOCAL_JOURNAL_RECOVERY_REQUEST_INVALID");
      }
      await ports.assertSecure([
        CLAIM_FILE,
        WORKER_AUTHORIZATION_FILE,
        WORKER_STARTED_FILE,
        RECOVERY_AUTHORIZATION_FILE
      ]);
      const outcome = await ports.createExclusive(
        RECOVERY_STARTED_FILE,
        serializeRecoveryRecord("bsc_testnet_pta_recovery_started", expectedRecovery, recordedAt)
      );
      if (outcome !== "created") throw new Error("PTA_LOCAL_JOURNAL_WORKER_ALREADY_STARTED");
      const retained = parseRecoveryRecord(
        await ports.readBounded(RECOVERY_STARTED_FILE),
        "bsc_testnet_pta_recovery_started"
      );
      if (retained === null || !sameRecoveryRecord(retained, expectedRecovery)) {
        throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
      }
      await ports.assertSecure([
        CLAIM_FILE,
        WORKER_AUTHORIZATION_FILE,
        WORKER_STARTED_FILE,
        RECOVERY_AUTHORIZATION_FILE,
        RECOVERY_STARTED_FILE
      ]);
      return Object.freeze({ status: "consumed" as const });
    }
    if (
      claim !== null &&
      incident !== null &&
      signedContent === null &&
      exactRecoveryRequest(request) &&
      recoveryAuthorization !== null &&
      sameRecoveryRecord(recoveryAuthorization, expectedRecovery) &&
      recoveryStartedContent !== null
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_WORKER_ALREADY_STARTED");
    }
    if (
      claim !== null &&
      claim.claimId === request.claimId &&
      claim.request.signingHash === request.transaction.signingHash &&
      claim.request.sourceEnvelopeHash === request.transaction.sourceEnvelopeHash &&
      authorization !== null &&
      sameWorkerRecord(authorization, expected) &&
      originalStartedContent !== null &&
      recoveryAuthorizationContent === null &&
      recoveryStartedContent === null &&
      signedContent === null
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_WORKER_ALREADY_STARTED");
    }
    if (
      claim === null ||
      claim.claimId !== request.claimId ||
      claim.request.signingHash !== request.transaction.signingHash ||
      claim.request.sourceEnvelopeHash !== request.transaction.sourceEnvelopeHash ||
      originalStartedContent !== null ||
      recoveryAuthorizationContent !== null ||
      recoveryStartedContent !== null ||
      signedContent !== null ||
      authorization === null ||
      !sameWorkerRecord(authorization, expected)
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_WORKER_AUTHORIZATION_INVALID");
    }
    await ports.assertSecure([CLAIM_FILE, WORKER_AUTHORIZATION_FILE]);
    const outcome = await ports.createExclusive(
      WORKER_STARTED_FILE,
      serializeWorkerRecord("bsc_testnet_pta_worker_started", expected, recordedAt)
    );
    if (outcome !== "created") throw new Error("PTA_LOCAL_JOURNAL_WORKER_ALREADY_STARTED");
    const retained = parseWorkerRecord(
      await ports.readBounded(WORKER_STARTED_FILE),
      "bsc_testnet_pta_worker_started"
    );
    if (retained === null || !sameWorkerRecord(retained, expected)) {
      throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
    }
    await ports.assertSecure([CLAIM_FILE, WORKER_AUTHORIZATION_FILE, WORKER_STARTED_FILE]);
    return Object.freeze({ status: "consumed" as const });
  };

  const commitSignedTransaction = async (
    untrustedRequest: BscTestnetPtaDurableSignedCommitRequest
  ): Promise<BscTestnetPtaDurableSignedCommitResult> => {
    const request = inspectCommitRequest(untrustedRequest);
    const committedAt = captureNow(ports.now);
    if (request === null || committedAt === null)
      throw new Error("PTA_LOCAL_JOURNAL_INPUT_INVALID");
    const claimContent = await ports.readBounded(CLAIM_FILE);
    const claim = parseClaim(claimContent);
    if (
      claim === null ||
      claim.claimId !== request.claimId ||
      claim.request.signingHash !== request.signingHash
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_CLAIM_MISMATCH");
    }
    const authorizationContent = await ports.readBounded(WORKER_AUTHORIZATION_FILE);
    const startedContent = await ports.readBounded(WORKER_STARTED_FILE);
    const recoveryAuthorizationContent = await ports.readBounded(RECOVERY_AUTHORIZATION_FILE);
    const recoveryStartedContent = await ports.readBounded(RECOVERY_STARTED_FILE);
    const started = parseWorkerRecord(startedContent, "bsc_testnet_pta_worker_started");
    const recoveryAuthorization = parseRecoveryRecord(
      recoveryAuthorizationContent,
      "bsc_testnet_pta_recovery_authorization"
    );
    const recoveryStarted = parseRecoveryRecord(
      recoveryStartedContent,
      "bsc_testnet_pta_recovery_started"
    );
    const incident = await inspectExactPreSignExpiryIncident(ports, {
      claim: claimContent,
      authorization: authorizationContent,
      started: startedContent
    });
    const normalStarted =
      recoveryAuthorizationContent === null &&
      recoveryStartedContent === null &&
      recoveryAuthorization === null &&
      recoveryStarted === null &&
      started !== null &&
      started.claimId === request.claimId &&
      started.signingHash === request.signingHash &&
      started.requestHash === request.requestHash;
    const recoveryWasStarted =
      incident !== null &&
      recoveryAuthorization !== null &&
      recoveryStarted !== null &&
      sameRecoveryRecord(recoveryAuthorization, recoveryStarted) &&
      recoveryStarted.recoveryClaimId === request.claimId &&
      recoveryStarted.signingHash === request.signingHash &&
      recoveryStarted.recoveryRequestHash === request.requestHash;
    if (!normalStarted && !recoveryWasStarted) {
      throw new Error("PTA_LOCAL_JOURNAL_WORKER_NOT_STARTED");
    }
    const commitEvidence = recoveryWasStarted
      ? [
          CLAIM_FILE,
          WORKER_AUTHORIZATION_FILE,
          WORKER_STARTED_FILE,
          RECOVERY_AUTHORIZATION_FILE,
          RECOVERY_STARTED_FILE
        ]
      : [CLAIM_FILE, WORKER_AUTHORIZATION_FILE, WORKER_STARTED_FILE];
    await ports.assertSecure(commitEvidence);
    const outcome = await ports.createExclusive(SIGNED_FILE, serializeSigned(request, committedAt));
    const existing = parseSigned(await ports.readBounded(SIGNED_FILE));
    if (existing === null || !sameCommit(existing, request)) {
      throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
    }
    await ports.assertSecure([...commitEvidence, SIGNED_FILE]);
    if (outcome !== "created" && !sameCommit(existing, request)) {
      throw new Error("PTA_LOCAL_JOURNAL_CONFLICT");
    }
    return Object.freeze({ status: "committed" as const });
  };

  return Object.freeze({
    claimExactDeployment,
    prepareWorkerAuthorization,
    consumeWorkerAuthorization,
    commitSignedTransaction,
    readState
  });
}

function canonicalJournalDirectory(input: unknown): string | null {
  if (
    typeof input !== "string" ||
    input.length < 10 ||
    input.length > 512 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(input) ||
    input.includes("/") ||
    win32.normalize(input) !== input ||
    win32.basename(input).toLowerCase() !== "bsc-testnet-pta" ||
    win32.basename(win32.dirname(input)).toLowerCase() !== "deployments"
  ) {
    return null;
  }
  const resolved = resolve(input);
  const relation = relative(REPOSITORY_ROOT, resolved);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")
    ? null
    : resolved;
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
      throw new Error("invalid");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new Error("changed");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readFileMetadata(
  path: string
): Promise<BscTestnetPtaLocalJournalFileMetadata | null> {
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
      throw new Error("invalid");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.birthtimeNs !== after.birthtimeNs ||
      before.mtimeNs !== after.mtimeNs ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new Error("changed");
    }
    return Object.freeze({
      birthtimeNanoseconds: before.birthtimeNs.toString(),
      modifiedTimeNanoseconds: before.mtimeNs.toString(),
      sizeBytes: before.size.toString(),
      device: before.dev.toString(),
      inode: before.ino.toString(),
      contentSha256: createHash("sha256").update(bytes).digest("hex")
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function assertSecureDirectory(
  directory: string,
  existingFiles: readonly string[]
): Promise<void> {
  const metadata = await lstat(directory);
  const canonical = await realpath(directory);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    win32.normalize(canonical).toLowerCase() !== directory.toLowerCase()
  ) {
    throw new Error("PTA_LOCAL_JOURNAL_DIRECTORY_INVALID");
  }
  for (const name of existingFiles) {
    const path = win32.join(directory, name);
    const file = await lstat(path);
    const canonicalFile = await realpath(path);
    if (
      !file.isFile() ||
      file.isSymbolicLink() ||
      file.nlink !== 1 ||
      win32.normalize(canonicalFile).toLowerCase() !== path.toLowerCase()
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_FILE_INVALID");
    }
  }
  const specification = Buffer.from(
    JSON.stringify({
      directory,
      paths: [directory, ...existingFiles.map((name) => win32.join(directory, name))]
    }),
    "utf8"
  );
  let output: Buffer | null = null;
  try {
    const controller = new AbortController();
    const result = await runPinnedPowerShellForInternalUse(
      ACL_PROBE_SCRIPT,
      specification,
      32,
      controller.signal
    );
    output = result.output;
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)) as unknown;
    const record = dataRecord(parsed);
    if (record === null || !exactKeys(record, ["ok"]) || record.ok !== true) {
      throw new Error("PTA_LOCAL_JOURNAL_ACL_INVALID");
    }
  } finally {
    specification.fill(0);
    output?.fill(0);
  }
}

/** Production local-operator composition. It never provisions or weakens ACLs. */
export function createWindowsBscTestnetPtaLocalJournal(
  directoryAbsolute: unknown
): BscTestnetPtaLocalJournal {
  if (process.platform !== "win32") throw new Error("PTA_LOCAL_JOURNAL_WINDOWS_REQUIRED");
  const directory = canonicalJournalDirectory(directoryAbsolute);
  if (directory === null) throw new Error("PTA_LOCAL_JOURNAL_CONFIGURATION_INVALID");
  return createBscTestnetPtaLocalJournalCore(
    Object.freeze({
      now: () => new Date(),
      assertSecure: (existingFiles: readonly string[]) =>
        assertSecureDirectory(directory, existingFiles),
      readBounded: (name: string) => readBoundedFile(win32.join(directory, name)),
      readMetadata: (name: string) => readFileMetadata(win32.join(directory, name)),
      createExclusive: async (name: string, content: string) => {
        let handle;
        try {
          handle = await open(win32.join(directory, name), "wx", 0o600);
          await handle.writeFile(content, "utf8");
          await handle.sync();
          return "created" as const;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") return "exists" as const;
          throw error;
        } finally {
          await handle?.close().catch(() => undefined);
        }
      }
    })
  );
}
