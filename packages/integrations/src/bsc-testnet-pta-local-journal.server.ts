import "server-only";

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
const SIGNED_FILE = "signed.v1.json";
const MAXIMUM_RECORD_BYTES = 16_384;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const SIGNED_TRANSACTION = /^0x[0-9a-f]+$/u;
const CLAIM_ID = /^pta-[0-9a-f]{32}$/u;

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
    const request = inspectClaimRequest(root.request);
    return request === null ? null : Object.freeze({ claimId: root.claimId, request });
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
  recordType: "bsc_testnet_pta_worker_authorization" | "bsc_testnet_pta_worker_started",
  record: WorkerAuthorizationRecord,
  recordedAt: string
): string {
  return `${JSON.stringify({ schemaVersion: 1, recordType, recordedAt, record })}\n`;
}

function parseWorkerRecord(
  content: string | null,
  expectedType: "bsc_testnet_pta_worker_authorization" | "bsc_testnet_pta_worker_started"
): WorkerAuthorizationRecord | null {
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
    return inspectWorkerAuthorizationRecord(root.record);
  } catch {
    return null;
  }
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
    !exactKeys(record, ["assertSecure", "createExclusive", "now", "readBounded"]) ||
    typeof record.assertSecure !== "function" ||
    isProxy(record.assertSecure) ||
    typeof record.createExclusive !== "function" ||
    isProxy(record.createExclusive) ||
    typeof record.now !== "function" ||
    isProxy(record.now) ||
    typeof record.readBounded !== "function" ||
    isProxy(record.readBounded)
  ) {
    return null;
  }
  return record as unknown as BscTestnetPtaLocalJournalPorts;
}

/**
 * Local-operator/testnet journal only. The API never overwrites, deletes, or
 * reclaims the fixed intent. A claim without a valid signed record is terminal.
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
      const signedContent = await ports.readBounded(SIGNED_FILE);
      const existing = [
        ...(claimContent === null ? [] : [CLAIM_FILE]),
        ...(authorizationContent === null ? [] : [WORKER_AUTHORIZATION_FILE]),
        ...(startedContent === null ? [] : [WORKER_STARTED_FILE]),
        ...(signedContent === null ? [] : [SIGNED_FILE])
      ];
      await ports.assertSecure(existing);
      if (
        claimContent === null &&
        authorizationContent === null &&
        startedContent === null &&
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
      if (signedContent === null) {
        if (authorizationContent !== null || startedContent !== null) {
          return Object.freeze({
            status: "unknown" as const,
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
      if (
        signed === null ||
        authorization === null ||
        started === null ||
        !sameWorkerRecord(authorization, started) ||
        signed.claimId !== claim.claimId ||
        signed.signingHash !== claim.request.signingHash ||
        authorization.claimId !== claim.claimId ||
        authorization.signingHash !== claim.request.signingHash ||
        authorization.sourceEnvelopeHash !== claim.request.sourceEnvelopeHash ||
        signed.requestHash !== started.requestHash
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
    const claim = parseClaim(await ports.readBounded(CLAIM_FILE));
    if (
      claim === null ||
      claim.claimId !== request.claimId ||
      claim.request.signingHash !== request.transaction.signingHash ||
      claim.request.sourceEnvelopeHash !== request.transaction.sourceEnvelopeHash
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
    const claim = parseClaim(await ports.readBounded(CLAIM_FILE));
    const authorization = parseWorkerRecord(
      await ports.readBounded(WORKER_AUTHORIZATION_FILE),
      "bsc_testnet_pta_worker_authorization"
    );
    const expected = workerRecordFor(request, keccak256(untrustedAuthorizationToken));
    if (
      claim === null ||
      claim.claimId !== request.claimId ||
      claim.request.signingHash !== request.transaction.signingHash ||
      claim.request.sourceEnvelopeHash !== request.transaction.sourceEnvelopeHash ||
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
    const claim = parseClaim(await ports.readBounded(CLAIM_FILE));
    if (
      claim === null ||
      claim.claimId !== request.claimId ||
      claim.request.signingHash !== request.signingHash
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_CLAIM_MISMATCH");
    }
    const started = parseWorkerRecord(
      await ports.readBounded(WORKER_STARTED_FILE),
      "bsc_testnet_pta_worker_started"
    );
    if (
      started === null ||
      started.claimId !== request.claimId ||
      started.signingHash !== request.signingHash ||
      started.requestHash !== request.requestHash
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_WORKER_NOT_STARTED");
    }
    await ports.assertSecure([CLAIM_FILE, WORKER_AUTHORIZATION_FILE, WORKER_STARTED_FILE]);
    const outcome = await ports.createExclusive(SIGNED_FILE, serializeSigned(request, committedAt));
    const existing = parseSigned(await ports.readBounded(SIGNED_FILE));
    if (existing === null || !sameCommit(existing, request)) {
      throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
    }
    await ports.assertSecure([
      CLAIM_FILE,
      WORKER_AUTHORIZATION_FILE,
      WORKER_STARTED_FILE,
      SIGNED_FILE
    ]);
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
