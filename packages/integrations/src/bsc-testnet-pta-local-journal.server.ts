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
const RECONSTRUCTION_AUTHORIZATION_FILE = "deterministic-reconstruction-authorization.v1.json";
const RECONSTRUCTION_STARTED_FILE = "deterministic-reconstruction-started.v1.json";
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

/**
 * Immutable fingerprint of the sole recovery worker whose result became
 * unknown. The retained request is still the exact original EIP-155 payload.
 * viem 2.55.13 delegates that signature to noble-curves RFC6979 with low-S and
 * no extra entropy, so reconstructing it can only reproduce the same raw
 * transaction and transaction hash. This is not a reusable retry policy.
 */
const EXACT_DETERMINISTIC_RECONSTRUCTION_INCIDENT = Object.freeze({
  incidentId: "bsc-testnet-pta-deterministic-reconstruction-2026-08-12" as const,
  reconstructionReason: "same_payload_rfc6979_reconstruction_after_unknown_worker_outcome" as const,
  attemptCommit: "2c4df05aec5eac9f41150382b58266fdcb93523f" as const,
  recoveryAuthenticatedAt: "2026-08-12T15:32:44.550Z" as const,
  recoveryExpiresAt: "2026-08-12T15:36:44.494Z" as const,
  recoverySigningNotAfter: "2026-08-12T15:33:44.550Z" as const,
  recoveryAuthorizationRecordedAt: "2026-08-12T15:32:51.369Z" as const,
  recoveryStartedRecordedAt: "2026-08-12T15:32:59.979Z" as const,
  recoveryRequestHash: "0xe30ced1f9a906ff174b138834d06a35393d98fab85c12344857d2091a7c76162" as Hex,
  recoverySourceEnvelopeHash:
    "0x08ddb021fa6c1cb17a41fca054ac9f1b278d9dd06b850f6906477fa71e9be688" as Hex,
  originalJournalFiles: Object.freeze({
    claim: Object.freeze({
      ...EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimFile,
      device: "5362065",
      inode: "16044073675418124",
      contentSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimSha256
    }),
    workerAuthorization: Object.freeze({
      ...EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationFile,
      device: "5362065",
      inode: "15481123721918814",
      contentSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.authorizationSha256
    }),
    workerStarted: Object.freeze({
      ...EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedFile,
      device: "5362065",
      inode: "12666373954890445",
      contentSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.startedSha256
    })
  }),
  recoveryAuthorizationFile: Object.freeze({
    birthtimeNanoseconds: "1786548772010941500",
    modifiedTimeNanoseconds: "1786548772011905900",
    sizeBytes: "2189",
    device: "5362065",
    inode: "6473924466404750",
    contentSha256: "a06407185d1365247b4cd4b4cf20662bf6fdce0a82d1a6f5f9065897c1657646"
  }),
  recoveryStartedFile: Object.freeze({
    birthtimeNanoseconds: "1786548784286362400",
    modifiedTimeNanoseconds: "1786548784287357300",
    sizeBytes: "2183",
    device: "5362065",
    inode: "16044073673783358",
    contentSha256: "d1006f798e71ac47f80656d5e08eb9479e702cbe1840441572061afaaaefd2d1"
  }),
  sourceBlobs: Object.freeze({
    journal: "8e1ecde77f1f854b77a3d46834316f65850b7e7e",
    protocol: "84557c93ed899da74c94c21c1173edaa1773996f",
    runner: "e0784f2b055b81645f2bfe379ae5cf8ed501b73d",
    signer: "0393ce2b2e3463b390e3b0418776f982f7f877b5",
    signerCore: "c4e49bd4609295542953c1db912003607eaf85e0",
    typescriptLoader: "f2f733bf6897a9eb8d9f02a2ada841c62fb9d836",
    integrationsPackage: "ca4e6e641b2a81c9f49d732d4b516f825591e848",
    pnpmLock: "a82a04f237aea2814097d7e1267520e501b3067e"
  }),
  dependencyPins: Object.freeze({
    nodeVersion: "v24.14.1",
    nodeExecutableSha256: "58e74bf02fc5bbacc41dcb8bef089961cd5bddd37830b87784e4fc624d145d1f",
    pnpmVersion: "11.20.0",
    pnpmLockSha256: "9140cea9aa0ad5345d3b8047a5a0c95b3ba237a6d42595d68d77f7134fdbeec5",
    viemVersion: "2.55.13",
    viemIntegrity:
      "sha512-Rt1NAsdtTdvJgqaCxsv2TuO55xv2d2dKEuRuzrg34xMGxvTSFOX0iIFvEfymPvh+fwN2tbgEU2JwN0YHOVM+Bg==",
    nobleCurvesVersion: "1.9.1",
    nobleCurvesIntegrity:
      "sha512-k11yZxZg+t+gWvBbIswW0yoJlu8cHOC7dhunwOzoWH/mXGBiYyR4YY6hAEK/3EUs4UpB8la1RfdRpeGsFHkWsA==",
    nobleHashesVersion: "1.8.0",
    nobleHashesIntegrity:
      "sha512-jCs9ldd7NwzpgXDIf6P3+NrHh9/sD6CQdxHyjQI+h/6rDNo88ypBxxz45UDuZHz9r3tNz7N/VInSVoVdtXEI4A=="
  }),
  reconstructionRuntimePins: Object.freeze({
    nodeExecutableSha256: "58e74bf02fc5bbacc41dcb8bef089961cd5bddd37830b87784e4fc624d145d1f",
    typescriptLoaderSha256: "7783710b215e30285d7a36b41a3cbefbfe9c1fafdaaba929225c42c1da7abfc1",
    integrationsPackageSha256: "bc46e5fd4f006bd4282fa6d2033aa64da1dbc4abf8e1bc7a67599fcf718c5041",
    pnpmLockSha256: "645b67708bc22122be8fdbcda35314019599cf2c4665a12abf7d5d767b4a72b1",
    viemPackageSha256: "8b5112e95226a77c4a65313036c219793b5a02c99592e21b11b7f52580bc3119",
    viemIndexSha256: "ea32975364e9f2d599b10639d81985ec6a3ed87f6942fe0cb73b1bf738959057",
    viemGetAddressSha256: "e17499a48cfa1a8a5f9557060559fca9c09dd46883761ee1e75e618af260b434",
    viemToHexSha256: "53fcd5ab40bcaf191735355e4d107092818a5006cf2ca75580d581e568966629",
    viemKeccak256Sha256: "3e3b256aa1b5537440955848234b84aa4de248225cb038c82317420279e77c14",
    viemSerializeTransactionSha256:
      "1cbe1acacdfdb2f409715164601f0cb1e1275fd29832968caeae27dffcfffd48",
    priorViemAccountFactorySha256:
      "c056d3c2d9308e74476007cda3e93cd3547068778c2b6ce67809537e207e78e6",
    priorViemSignSha256: "8320f27b64139ccb63dac093af688a68811924f129d1f15c83f9542dcfc12528",
    priorViemSignTransactionSha256:
      "ac5a2c356782ec961c37eb3b3007fc00a505f9f812eaed03f5ea8a635c60ae54",
    nobleCurvesPackageSha256: "d496cbba8f48a7407657170c84542e337e2fdfdc71bb7f5fd9e350daab119f31",
    nobleSecp256k1Sha256: "30943ee7362d12dcbb2ec8756055aa1b2d0246e1bea56288abcbf0aeb7969216",
    nobleWeierstrassSha256: "cdc650e13a4b3e26699fcfd6d85b4a816f159efd16fb0905411495b57dce485f",
    nobleHashesPackageSha256: "7c4657c5e616c22cefa2691cc30670824a639dc71d97bf83925be2d239dc60e3",
    nobleSha2Sha256: "e729088b82e5450bff54c3a0013582aa42e1fe8f58dd31f5967f6ebe34c52299",
    nobleHmacSha256: "a330af1af3fb00ebdbba2f023dd5e023aa367669081cd51c7d172eb499533d0b",
    priorNobleSecp256k1Sha256: "30943ee7362d12dcbb2ec8756055aa1b2d0246e1bea56288abcbf0aeb7969216",
    priorNobleWeierstrassSha256: "cdc650e13a4b3e26699fcfd6d85b4a816f159efd16fb0905411495b57dce485f",
    priorNobleSha2Sha256: "e729088b82e5450bff54c3a0013582aa42e1fe8f58dd31f5967f6ebe34c52299",
    priorNobleHmacSha256: "a330af1af3fb00ebdbba2f023dd5e023aa367669081cd51c7d172eb499533d0b",
    runtimeTreeAbitypeForOxSha256:
      "e80d2f27751b0997a91f4c5d7a15cc122d3ae5536cd4378460c96711d89502b6",
    runtimeTreeAbitypeForViemSha256:
      "b9afb85169f3b43c7b04d8eef5d8d1443bcdbf9ae8c1b01cc9211ba3440f2533",
    runtimeTreeNobleCurvesSha256:
      "ead39ce3e8f73680bfc4d2eae7daa5035836b086d53b13c3e59285e2f04927bc",
    runtimeTreeNobleHashesSha256:
      "4fcf0fa01dad679b88ef13a350f68e754446ae0102c2aa6d52b77840c81fa65b",
    runtimeTreeOxSha256: "cb0acff895a96d3520f8875e65f9b7679cfa49f7405fc7725c607292e429d527",
    runtimeTreeServerOnlySha256: "03dfa375a287d93459c50e5d9ab699bc1fdd243d68b4634dfd9062912c3511f6",
    runtimeTreeTypescriptSha256: "310dc96e3ba5a379e07512ebb864d0e586b4abd24a9636fadabd4937e54489f8",
    runtimeTreeViemSha256: "e7b8b7334a5b6d3157b0a055eb3affa97670257c257c393a3077299839980f5a"
  }),
  algorithm: "RFC6979-secp256k1-SHA256-lowS" as const,
  extraEntropy: false as const,
  signedRecordAbsent: true as const
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
      status: "deterministic_reconstruction_available";
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
  return parseTimestampedRecoveryRecord(content, expectedType)?.record ?? null;
}

function parseTimestampedRecoveryRecord(
  content: string | null,
  expectedType: "bsc_testnet_pta_recovery_authorization" | "bsc_testnet_pta_recovery_started"
): Readonly<{ recordedAt: string; record: RecoveryAuthorizationRecord }> | null {
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
    const record = inspectRecoveryAuthorizationRecord(root.record);
    return record === null
      ? null
      : Object.freeze({ recordedAt: root.recordedAt as string, record });
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

type DeterministicReconstructionRecord = ReturnType<typeof reconstructionRecordFor>;
type DeterministicReconstructionBinding = Readonly<{
  claimId: string;
  requestHash: Hex;
  transaction: Readonly<{ sourceEnvelopeHash: Hex }>;
}>;

function reconstructionRecordFor(
  request: DeterministicReconstructionBinding,
  authorizationDigest: Hex
) {
  const incident = EXACT_DETERMINISTIC_RECONSTRUCTION_INCIDENT;
  const original = incident.originalJournalFiles;
  return Object.freeze({
    incidentId: incident.incidentId,
    reconstructionReason: incident.reconstructionReason,
    attemptCommit: incident.attemptCommit,
    recoveryAuthenticatedAt: incident.recoveryAuthenticatedAt,
    recoveryExpiresAt: incident.recoveryExpiresAt,
    recoverySigningNotAfter: incident.recoverySigningNotAfter,
    recoveryAuthorizationRecordedAt: incident.recoveryAuthorizationRecordedAt,
    recoveryStartedRecordedAt: incident.recoveryStartedRecordedAt,
    priorRecoveryRequestHash: incident.recoveryRequestHash,
    priorRecoverySourceEnvelopeHash: incident.recoverySourceEnvelopeHash,
    claimBirthtimeNanoseconds: original.claim.birthtimeNanoseconds,
    claimModifiedTimeNanoseconds: original.claim.modifiedTimeNanoseconds,
    claimSizeBytes: original.claim.sizeBytes,
    claimDevice: original.claim.device,
    claimInode: original.claim.inode,
    claimSha256: original.claim.contentSha256,
    workerAuthorizationBirthtimeNanoseconds: original.workerAuthorization.birthtimeNanoseconds,
    workerAuthorizationModifiedTimeNanoseconds:
      original.workerAuthorization.modifiedTimeNanoseconds,
    workerAuthorizationSizeBytes: original.workerAuthorization.sizeBytes,
    workerAuthorizationDevice: original.workerAuthorization.device,
    workerAuthorizationInode: original.workerAuthorization.inode,
    workerAuthorizationSha256: original.workerAuthorization.contentSha256,
    workerStartedBirthtimeNanoseconds: original.workerStarted.birthtimeNanoseconds,
    workerStartedModifiedTimeNanoseconds: original.workerStarted.modifiedTimeNanoseconds,
    workerStartedSizeBytes: original.workerStarted.sizeBytes,
    workerStartedDevice: original.workerStarted.device,
    workerStartedInode: original.workerStarted.inode,
    workerStartedSha256: original.workerStarted.contentSha256,
    recoveryAuthorizationBirthtimeNanoseconds:
      incident.recoveryAuthorizationFile.birthtimeNanoseconds,
    recoveryAuthorizationModifiedTimeNanoseconds:
      incident.recoveryAuthorizationFile.modifiedTimeNanoseconds,
    recoveryAuthorizationSizeBytes: incident.recoveryAuthorizationFile.sizeBytes,
    recoveryAuthorizationDevice: incident.recoveryAuthorizationFile.device,
    recoveryAuthorizationInode: incident.recoveryAuthorizationFile.inode,
    recoveryAuthorizationSha256: incident.recoveryAuthorizationFile.contentSha256,
    recoveryStartedBirthtimeNanoseconds: incident.recoveryStartedFile.birthtimeNanoseconds,
    recoveryStartedModifiedTimeNanoseconds: incident.recoveryStartedFile.modifiedTimeNanoseconds,
    recoveryStartedSizeBytes: incident.recoveryStartedFile.sizeBytes,
    recoveryStartedDevice: incident.recoveryStartedFile.device,
    recoveryStartedInode: incident.recoveryStartedFile.inode,
    recoveryStartedSha256: incident.recoveryStartedFile.contentSha256,
    journalSourceBlob: incident.sourceBlobs.journal,
    protocolSourceBlob: incident.sourceBlobs.protocol,
    runnerSourceBlob: incident.sourceBlobs.runner,
    signerSourceBlob: incident.sourceBlobs.signer,
    signerCoreSourceBlob: incident.sourceBlobs.signerCore,
    typescriptLoaderSourceBlob: incident.sourceBlobs.typescriptLoader,
    integrationsPackageSourceBlob: incident.sourceBlobs.integrationsPackage,
    pnpmLockSourceBlob: incident.sourceBlobs.pnpmLock,
    nodeVersion: incident.dependencyPins.nodeVersion,
    nodeExecutableSha256: incident.dependencyPins.nodeExecutableSha256,
    pnpmVersion: incident.dependencyPins.pnpmVersion,
    pnpmLockSha256: incident.dependencyPins.pnpmLockSha256,
    viemVersion: incident.dependencyPins.viemVersion,
    viemIntegrity: incident.dependencyPins.viemIntegrity,
    nobleCurvesVersion: incident.dependencyPins.nobleCurvesVersion,
    nobleCurvesIntegrity: incident.dependencyPins.nobleCurvesIntegrity,
    nobleHashesVersion: incident.dependencyPins.nobleHashesVersion,
    nobleHashesIntegrity: incident.dependencyPins.nobleHashesIntegrity,
    runtimeNodeExecutableSha256: incident.reconstructionRuntimePins.nodeExecutableSha256,
    runtimeTypescriptLoaderSha256: incident.reconstructionRuntimePins.typescriptLoaderSha256,
    runtimeIntegrationsPackageSha256: incident.reconstructionRuntimePins.integrationsPackageSha256,
    runtimePnpmLockSha256: incident.reconstructionRuntimePins.pnpmLockSha256,
    runtimeViemPackageSha256: incident.reconstructionRuntimePins.viemPackageSha256,
    runtimeViemIndexSha256: incident.reconstructionRuntimePins.viemIndexSha256,
    runtimeViemGetAddressSha256: incident.reconstructionRuntimePins.viemGetAddressSha256,
    runtimeViemToHexSha256: incident.reconstructionRuntimePins.viemToHexSha256,
    runtimeViemKeccak256Sha256: incident.reconstructionRuntimePins.viemKeccak256Sha256,
    runtimeViemSerializeTransactionSha256:
      incident.reconstructionRuntimePins.viemSerializeTransactionSha256,
    priorRuntimeViemAccountFactorySha256:
      incident.reconstructionRuntimePins.priorViemAccountFactorySha256,
    priorRuntimeViemSignSha256: incident.reconstructionRuntimePins.priorViemSignSha256,
    priorRuntimeViemSignTransactionSha256:
      incident.reconstructionRuntimePins.priorViemSignTransactionSha256,
    runtimeNobleCurvesPackageSha256: incident.reconstructionRuntimePins.nobleCurvesPackageSha256,
    runtimeNobleSecp256k1Sha256: incident.reconstructionRuntimePins.nobleSecp256k1Sha256,
    runtimeNobleWeierstrassSha256: incident.reconstructionRuntimePins.nobleWeierstrassSha256,
    runtimeNobleHashesPackageSha256: incident.reconstructionRuntimePins.nobleHashesPackageSha256,
    runtimeNobleSha2Sha256: incident.reconstructionRuntimePins.nobleSha2Sha256,
    runtimeNobleHmacSha256: incident.reconstructionRuntimePins.nobleHmacSha256,
    priorRuntimeNobleSecp256k1Sha256: incident.reconstructionRuntimePins.priorNobleSecp256k1Sha256,
    priorRuntimeNobleWeierstrassSha256:
      incident.reconstructionRuntimePins.priorNobleWeierstrassSha256,
    priorRuntimeNobleSha2Sha256: incident.reconstructionRuntimePins.priorNobleSha2Sha256,
    priorRuntimeNobleHmacSha256: incident.reconstructionRuntimePins.priorNobleHmacSha256,
    runtimeTreeAbitypeForOxSha256: incident.reconstructionRuntimePins.runtimeTreeAbitypeForOxSha256,
    runtimeTreeAbitypeForViemSha256:
      incident.reconstructionRuntimePins.runtimeTreeAbitypeForViemSha256,
    runtimeTreeNobleCurvesSha256: incident.reconstructionRuntimePins.runtimeTreeNobleCurvesSha256,
    runtimeTreeNobleHashesSha256: incident.reconstructionRuntimePins.runtimeTreeNobleHashesSha256,
    runtimeTreeOxSha256: incident.reconstructionRuntimePins.runtimeTreeOxSha256,
    runtimeTreeServerOnlySha256: incident.reconstructionRuntimePins.runtimeTreeServerOnlySha256,
    runtimeTreeTypescriptSha256: incident.reconstructionRuntimePins.runtimeTreeTypescriptSha256,
    runtimeTreeViemSha256: incident.reconstructionRuntimePins.runtimeTreeViemSha256,
    deterministicAlgorithm: incident.algorithm,
    extraEntropy: incident.extraEntropy,
    signedRecordAbsentAtAuthorization: incident.signedRecordAbsent,
    reconstructionClaimId: request.claimId,
    reconstructionRequestHash: request.requestHash,
    reconstructionSourceEnvelopeHash: request.transaction.sourceEnvelopeHash,
    signingHash: EXACT_PRE_SIGN_EXPIRY_INCIDENT.signingHash,
    gasLimit: EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasLimit,
    gasPriceWei: EXACT_PRE_SIGN_EXPIRY_INCIDENT.gasPriceWei,
    maximumCostWei: EXACT_PRE_SIGN_EXPIRY_INCIDENT.maximumCostWei,
    serializedSigningPayloadBytes: EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadBytes,
    serializedSigningPayloadSha256: EXACT_PRE_SIGN_EXPIRY_INCIDENT.serializedSigningPayloadSha256,
    authorizationDigest
  });
}

function inspectDeterministicReconstructionRecord(
  input: unknown
): DeterministicReconstructionRecord | null {
  const record = dataRecord(input);
  if (
    record === null ||
    typeof record.reconstructionClaimId !== "string" ||
    !CLAIM_ID.test(record.reconstructionClaimId) ||
    typeof record.reconstructionRequestHash !== "string" ||
    !BYTES32.test(record.reconstructionRequestHash) ||
    typeof record.reconstructionSourceEnvelopeHash !== "string" ||
    !BYTES32.test(record.reconstructionSourceEnvelopeHash) ||
    typeof record.authorizationDigest !== "string" ||
    !BYTES32.test(record.authorizationDigest)
  ) {
    return null;
  }
  const request = Object.freeze({
    claimId: record.reconstructionClaimId,
    requestHash: record.reconstructionRequestHash as Hex,
    transaction: Object.freeze({
      sourceEnvelopeHash: record.reconstructionSourceEnvelopeHash as Hex
    })
  }) satisfies DeterministicReconstructionBinding;
  const expected = reconstructionRecordFor(request, record.authorizationDigest as Hex);
  return exactKeys(record, Object.keys(expected)) &&
    JSON.stringify(record) === JSON.stringify(expected)
    ? expected
    : null;
}

function serializeDeterministicReconstructionRecord(
  recordType:
    | "bsc_testnet_pta_deterministic_reconstruction_authorization"
    | "bsc_testnet_pta_deterministic_reconstruction_started",
  record: DeterministicReconstructionRecord,
  recordedAt: string
): string {
  return `${JSON.stringify({ schemaVersion: 1, recordType, recordedAt, record })}\n`;
}

function parseDeterministicReconstructionRecord(
  content: string | null,
  expectedType:
    | "bsc_testnet_pta_deterministic_reconstruction_authorization"
    | "bsc_testnet_pta_deterministic_reconstruction_started"
): DeterministicReconstructionRecord | null {
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
    return inspectDeterministicReconstructionRecord(root.record);
  } catch {
    return null;
  }
}

function sameDeterministicReconstructionRecord(
  left: DeterministicReconstructionRecord,
  right: DeterministicReconstructionRecord
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

function exactFullMetadata(
  actual: BscTestnetPtaLocalJournalFileMetadata,
  expected: Readonly<{
    birthtimeNanoseconds: string;
    modifiedTimeNanoseconds: string;
    sizeBytes: string;
    device: string;
    inode: string;
    contentSha256: string;
  }>
): boolean {
  return (
    exactMetadata(actual, expected) &&
    actual.device === expected.device &&
    actual.inode === expected.inode &&
    actual.contentSha256 === expected.contentSha256
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

type DeterministicReconstructionIncidentEvidence = Readonly<{
  original: OriginalIncidentEvidence;
  recoveryAuthorization: RecoveryAuthorizationRecord;
  recoveryStarted: RecoveryAuthorizationRecord;
}>;

async function inspectExactDeterministicReconstructionIncident(
  ports: BscTestnetPtaLocalJournalPorts,
  contents: Readonly<{
    claim: string | null;
    authorization: string | null;
    started: string | null;
    recoveryAuthorization: string | null;
    recoveryStarted: string | null;
  }>
): Promise<DeterministicReconstructionIncidentEvidence | null> {
  const original = await inspectExactPreSignExpiryIncident(ports, contents);
  const recoveryAuthorization = parseTimestampedRecoveryRecord(
    contents.recoveryAuthorization,
    "bsc_testnet_pta_recovery_authorization"
  );
  const recoveryStarted = parseTimestampedRecoveryRecord(
    contents.recoveryStarted,
    "bsc_testnet_pta_recovery_started"
  );
  if (
    original === null ||
    recoveryAuthorization === null ||
    recoveryStarted === null ||
    recoveryAuthorization.recordedAt !==
      EXACT_DETERMINISTIC_RECONSTRUCTION_INCIDENT.recoveryAuthorizationRecordedAt ||
    recoveryStarted.recordedAt !==
      EXACT_DETERMINISTIC_RECONSTRUCTION_INCIDENT.recoveryStartedRecordedAt ||
    !sameRecoveryRecord(recoveryAuthorization.record, recoveryStarted.record) ||
    recoveryAuthorization.record.originalClaimId !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimId ||
    recoveryAuthorization.record.recoveryClaimId !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.claimId ||
    recoveryAuthorization.record.recoveryRequestHash !==
      EXACT_DETERMINISTIC_RECONSTRUCTION_INCIDENT.recoveryRequestHash ||
    recoveryAuthorization.record.recoverySourceEnvelopeHash !==
      EXACT_DETERMINISTIC_RECONSTRUCTION_INCIDENT.recoverySourceEnvelopeHash ||
    recoveryAuthorization.record.signingHash !== EXACT_PRE_SIGN_EXPIRY_INCIDENT.signingHash
  ) {
    return null;
  }
  const names = [
    CLAIM_FILE,
    WORKER_AUTHORIZATION_FILE,
    WORKER_STARTED_FILE,
    RECOVERY_AUTHORIZATION_FILE,
    RECOVERY_STARTED_FILE
  ] as const;
  const metadataInputs = await Promise.all(names.map((name) => ports.readMetadata(name)));
  const metadata = metadataInputs.map(inspectMetadata);
  if (metadata.some((entry) => entry === null)) return null;
  const [
    claimMetadata,
    authorizationMetadata,
    startedMetadata,
    recoveryAuthMetadata,
    recoveryStartMetadata
  ] = metadata as [
    BscTestnetPtaLocalJournalFileMetadata,
    BscTestnetPtaLocalJournalFileMetadata,
    BscTestnetPtaLocalJournalFileMetadata,
    BscTestnetPtaLocalJournalFileMetadata,
    BscTestnetPtaLocalJournalFileMetadata
  ];
  const expected = EXACT_DETERMINISTIC_RECONSTRUCTION_INCIDENT;
  if (
    !exactFullMetadata(claimMetadata, expected.originalJournalFiles.claim) ||
    !exactFullMetadata(authorizationMetadata, expected.originalJournalFiles.workerAuthorization) ||
    !exactFullMetadata(startedMetadata, expected.originalJournalFiles.workerStarted) ||
    !exactFullMetadata(recoveryAuthMetadata, expected.recoveryAuthorizationFile) ||
    !exactFullMetadata(recoveryStartMetadata, expected.recoveryStartedFile) ||
    new Set(metadata.map((entry) => entry?.inode)).size !== names.length ||
    metadata.some((entry) => entry?.device !== expected.originalJournalFiles.claim.device)
  ) {
    return null;
  }
  return Object.freeze({
    original,
    recoveryAuthorization: recoveryAuthorization.record,
    recoveryStarted: recoveryStarted.record
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

function exactDeterministicReconstructionRequest(
  request: BscTestnetPtaSigningWorkerRequest
): boolean {
  return (
    exactRecoveryRequest(request) &&
    request.requestHash !== EXACT_DETERMINISTIC_RECONSTRUCTION_INCIDENT.recoveryRequestHash
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
      const reconstructionAuthorizationContent = await ports.readBounded(
        RECONSTRUCTION_AUTHORIZATION_FILE
      );
      const reconstructionStartedContent = await ports.readBounded(RECONSTRUCTION_STARTED_FILE);
      const signedContent = await ports.readBounded(SIGNED_FILE);
      const existing = [
        ...(claimContent === null ? [] : [CLAIM_FILE]),
        ...(authorizationContent === null ? [] : [WORKER_AUTHORIZATION_FILE]),
        ...(startedContent === null ? [] : [WORKER_STARTED_FILE]),
        ...(recoveryAuthorizationContent === null ? [] : [RECOVERY_AUTHORIZATION_FILE]),
        ...(recoveryStartedContent === null ? [] : [RECOVERY_STARTED_FILE]),
        ...(reconstructionAuthorizationContent === null ? [] : [RECONSTRUCTION_AUTHORIZATION_FILE]),
        ...(reconstructionStartedContent === null ? [] : [RECONSTRUCTION_STARTED_FILE]),
        ...(signedContent === null ? [] : [SIGNED_FILE])
      ];
      await ports.assertSecure(existing);
      if (
        claimContent === null &&
        authorizationContent === null &&
        startedContent === null &&
        recoveryAuthorizationContent === null &&
        recoveryStartedContent === null &&
        reconstructionAuthorizationContent === null &&
        reconstructionStartedContent === null &&
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
      const reconstructionIncident = await inspectExactDeterministicReconstructionIncident(ports, {
        claim: claimContent,
        authorization: authorizationContent,
        started: startedContent,
        recoveryAuthorization: recoveryAuthorizationContent,
        recoveryStarted: recoveryStartedContent
      });
      if (signedContent === null) {
        if (reconstructionAuthorizationContent !== null || reconstructionStartedContent !== null) {
          return Object.freeze({
            status: "unknown" as const,
            signedTransaction: null,
            transactionHash: null
          });
        }
        if (reconstructionIncident !== null) {
          return Object.freeze({
            status: "deterministic_reconstruction_available" as const,
            signedTransaction: null,
            transactionHash: null
          });
        }
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
      const reconstructionAuthorization = parseDeterministicReconstructionRecord(
        reconstructionAuthorizationContent,
        "bsc_testnet_pta_deterministic_reconstruction_authorization"
      );
      const reconstructionStarted = parseDeterministicReconstructionRecord(
        reconstructionStartedContent,
        "bsc_testnet_pta_deterministic_reconstruction_started"
      );
      const normalCommitValid =
        recoveryAuthorizationContent === null &&
        recoveryStartedContent === null &&
        reconstructionAuthorizationContent === null &&
        reconstructionStartedContent === null &&
        authorization !== null &&
        started !== null &&
        sameWorkerRecord(authorization, started) &&
        authorization.claimId === claim.claimId &&
        authorization.signingHash === claim.request.signingHash &&
        authorization.sourceEnvelopeHash === claim.request.sourceEnvelopeHash &&
        signed?.requestHash === started.requestHash;
      const recoveryCommitValid =
        incident !== null &&
        reconstructionAuthorizationContent === null &&
        reconstructionStartedContent === null &&
        recoveryAuthorization !== null &&
        recoveryStarted !== null &&
        sameRecoveryRecord(recoveryAuthorization, recoveryStarted) &&
        recoveryAuthorization.recoveryClaimId === claim.claimId &&
        recoveryAuthorization.signingHash === claim.request.signingHash &&
        signed?.requestHash === recoveryStarted.recoveryRequestHash;
      const reconstructionCommitValid =
        reconstructionIncident !== null &&
        reconstructionAuthorization !== null &&
        reconstructionStarted !== null &&
        sameDeterministicReconstructionRecord(reconstructionAuthorization, reconstructionStarted) &&
        reconstructionAuthorization.reconstructionClaimId === claim.claimId &&
        reconstructionAuthorization.signingHash === claim.request.signingHash &&
        signed?.requestHash === reconstructionStarted.reconstructionRequestHash;
      if (
        signed === null ||
        signed.claimId !== claim.claimId ||
        signed.signingHash !== claim.request.signingHash ||
        (!normalCommitValid && !recoveryCommitValid && !reconstructionCommitValid)
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
      if (
        state.status === "deterministic_reconstruction_available" &&
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
    const reconstructionAuthorizationContent = await ports.readBounded(
      RECONSTRUCTION_AUTHORIZATION_FILE
    );
    const reconstructionStartedContent = await ports.readBounded(RECONSTRUCTION_STARTED_FILE);
    const signedContent = await ports.readBounded(SIGNED_FILE);
    const reconstructionIncident = await inspectExactDeterministicReconstructionIncident(ports, {
      claim: claimContent,
      authorization: originalAuthorizationContent,
      started: originalStartedContent,
      recoveryAuthorization: recoveryAuthorizationContent,
      recoveryStarted: recoveryStartedContent
    });
    const reconstruction =
      signedContent === null &&
      reconstructionAuthorizationContent === null &&
      reconstructionStartedContent === null &&
      exactDeterministicReconstructionRequest(request) &&
      reconstructionIncident !== null;
    if (reconstruction) {
      const validation = validateBscTestnetPtaSigningWorkerRequest(request, new Date(recordedAt));
      if (validation.status !== "valid") {
        throw new Error("PTA_LOCAL_JOURNAL_RECONSTRUCTION_REQUEST_INVALID");
      }
      const reconstructionEvidence = [
        CLAIM_FILE,
        WORKER_AUTHORIZATION_FILE,
        WORKER_STARTED_FILE,
        RECOVERY_AUTHORIZATION_FILE,
        RECOVERY_STARTED_FILE
      ];
      await ports.assertSecure(reconstructionEvidence);
      const reconstructionRecord = reconstructionRecordFor(request, untrustedAuthorizationDigest);
      const outcome = await ports.createExclusive(
        RECONSTRUCTION_AUTHORIZATION_FILE,
        serializeDeterministicReconstructionRecord(
          "bsc_testnet_pta_deterministic_reconstruction_authorization",
          reconstructionRecord,
          recordedAt
        )
      );
      if (outcome !== "created") throw new Error("PTA_LOCAL_JOURNAL_WORKER_ALREADY_AUTHORIZED");
      const retained = parseDeterministicReconstructionRecord(
        await ports.readBounded(RECONSTRUCTION_AUTHORIZATION_FILE),
        "bsc_testnet_pta_deterministic_reconstruction_authorization"
      );
      if (
        retained === null ||
        !sameDeterministicReconstructionRecord(retained, reconstructionRecord)
      ) {
        throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
      }
      await ports.assertSecure([...reconstructionEvidence, RECONSTRUCTION_AUTHORIZATION_FILE]);
      return Object.freeze({ status: "authorized" as const });
    }
    const recovery =
      signedContent === null &&
      recoveryAuthorizationContent === null &&
      recoveryStartedContent === null &&
      reconstructionAuthorizationContent === null &&
      reconstructionStartedContent === null &&
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
      reconstructionAuthorizationContent !== null ||
      reconstructionStartedContent !== null ||
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
    const reconstructionAuthorizationContent = await ports.readBounded(
      RECONSTRUCTION_AUTHORIZATION_FILE
    );
    const reconstructionStartedContent = await ports.readBounded(RECONSTRUCTION_STARTED_FILE);
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
    const reconstructionIncident = await inspectExactDeterministicReconstructionIncident(ports, {
      claim: claimContent,
      authorization: originalAuthorizationContent,
      started: originalStartedContent,
      recoveryAuthorization: recoveryAuthorizationContent,
      recoveryStarted: recoveryStartedContent
    });
    const reconstructionAuthorization = parseDeterministicReconstructionRecord(
      reconstructionAuthorizationContent,
      "bsc_testnet_pta_deterministic_reconstruction_authorization"
    );
    const expectedReconstruction = reconstructionRecordFor(
      request,
      keccak256(untrustedAuthorizationToken)
    );
    if (
      claim !== null &&
      reconstructionIncident !== null &&
      signedContent === null &&
      reconstructionStartedContent === null &&
      exactDeterministicReconstructionRequest(request) &&
      reconstructionAuthorization !== null &&
      sameDeterministicReconstructionRecord(reconstructionAuthorization, expectedReconstruction)
    ) {
      const validation = validateBscTestnetPtaSigningWorkerRequest(request, new Date(recordedAt));
      if (validation.status !== "valid") {
        throw new Error("PTA_LOCAL_JOURNAL_RECONSTRUCTION_REQUEST_INVALID");
      }
      const reconstructionEvidence = [
        CLAIM_FILE,
        WORKER_AUTHORIZATION_FILE,
        WORKER_STARTED_FILE,
        RECOVERY_AUTHORIZATION_FILE,
        RECOVERY_STARTED_FILE,
        RECONSTRUCTION_AUTHORIZATION_FILE
      ];
      await ports.assertSecure(reconstructionEvidence);
      const outcome = await ports.createExclusive(
        RECONSTRUCTION_STARTED_FILE,
        serializeDeterministicReconstructionRecord(
          "bsc_testnet_pta_deterministic_reconstruction_started",
          expectedReconstruction,
          recordedAt
        )
      );
      if (outcome !== "created") throw new Error("PTA_LOCAL_JOURNAL_WORKER_ALREADY_STARTED");
      const retained = parseDeterministicReconstructionRecord(
        await ports.readBounded(RECONSTRUCTION_STARTED_FILE),
        "bsc_testnet_pta_deterministic_reconstruction_started"
      );
      if (
        retained === null ||
        !sameDeterministicReconstructionRecord(retained, expectedReconstruction)
      ) {
        throw new Error("PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN");
      }
      await ports.assertSecure([...reconstructionEvidence, RECONSTRUCTION_STARTED_FILE]);
      return Object.freeze({ status: "consumed" as const });
    }
    if (
      claim !== null &&
      reconstructionIncident !== null &&
      signedContent === null &&
      exactDeterministicReconstructionRequest(request) &&
      reconstructionAuthorization !== null &&
      sameDeterministicReconstructionRecord(reconstructionAuthorization, expectedReconstruction) &&
      reconstructionStartedContent !== null
    ) {
      throw new Error("PTA_LOCAL_JOURNAL_WORKER_ALREADY_STARTED");
    }
    if (
      claim !== null &&
      incident !== null &&
      signedContent === null &&
      reconstructionAuthorizationContent === null &&
      reconstructionStartedContent === null &&
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
      reconstructionAuthorizationContent === null &&
      reconstructionStartedContent === null &&
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
      reconstructionAuthorizationContent === null &&
      reconstructionStartedContent === null &&
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
      reconstructionAuthorizationContent !== null ||
      reconstructionStartedContent !== null ||
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
    const reconstructionAuthorizationContent = await ports.readBounded(
      RECONSTRUCTION_AUTHORIZATION_FILE
    );
    const reconstructionStartedContent = await ports.readBounded(RECONSTRUCTION_STARTED_FILE);
    const started = parseWorkerRecord(startedContent, "bsc_testnet_pta_worker_started");
    const recoveryAuthorization = parseRecoveryRecord(
      recoveryAuthorizationContent,
      "bsc_testnet_pta_recovery_authorization"
    );
    const recoveryStarted = parseRecoveryRecord(
      recoveryStartedContent,
      "bsc_testnet_pta_recovery_started"
    );
    const reconstructionAuthorization = parseDeterministicReconstructionRecord(
      reconstructionAuthorizationContent,
      "bsc_testnet_pta_deterministic_reconstruction_authorization"
    );
    const reconstructionStarted = parseDeterministicReconstructionRecord(
      reconstructionStartedContent,
      "bsc_testnet_pta_deterministic_reconstruction_started"
    );
    const incident = await inspectExactPreSignExpiryIncident(ports, {
      claim: claimContent,
      authorization: authorizationContent,
      started: startedContent
    });
    const reconstructionIncident = await inspectExactDeterministicReconstructionIncident(ports, {
      claim: claimContent,
      authorization: authorizationContent,
      started: startedContent,
      recoveryAuthorization: recoveryAuthorizationContent,
      recoveryStarted: recoveryStartedContent
    });
    const normalStarted =
      recoveryAuthorizationContent === null &&
      recoveryStartedContent === null &&
      reconstructionAuthorizationContent === null &&
      reconstructionStartedContent === null &&
      recoveryAuthorization === null &&
      recoveryStarted === null &&
      started !== null &&
      started.claimId === request.claimId &&
      started.signingHash === request.signingHash &&
      started.requestHash === request.requestHash;
    const recoveryWasStarted =
      incident !== null &&
      reconstructionAuthorizationContent === null &&
      reconstructionStartedContent === null &&
      recoveryAuthorization !== null &&
      recoveryStarted !== null &&
      sameRecoveryRecord(recoveryAuthorization, recoveryStarted) &&
      recoveryStarted.recoveryClaimId === request.claimId &&
      recoveryStarted.signingHash === request.signingHash &&
      recoveryStarted.recoveryRequestHash === request.requestHash;
    const reconstructionWasStarted =
      reconstructionIncident !== null &&
      reconstructionAuthorization !== null &&
      reconstructionStarted !== null &&
      sameDeterministicReconstructionRecord(reconstructionAuthorization, reconstructionStarted) &&
      reconstructionStarted.reconstructionClaimId === request.claimId &&
      reconstructionStarted.signingHash === request.signingHash &&
      reconstructionStarted.reconstructionRequestHash === request.requestHash;
    if (!normalStarted && !recoveryWasStarted && !reconstructionWasStarted) {
      throw new Error("PTA_LOCAL_JOURNAL_WORKER_NOT_STARTED");
    }
    const commitEvidence = reconstructionWasStarted
      ? [
          CLAIM_FILE,
          WORKER_AUTHORIZATION_FILE,
          WORKER_STARTED_FILE,
          RECOVERY_AUTHORIZATION_FILE,
          RECOVERY_STARTED_FILE,
          RECONSTRUCTION_AUTHORIZATION_FILE,
          RECONSTRUCTION_STARTED_FILE
        ]
      : recoveryWasStarted
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
