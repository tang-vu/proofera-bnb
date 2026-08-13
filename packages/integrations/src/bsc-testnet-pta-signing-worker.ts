import "server-only";

import { createDecipheriv, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import type { BigIntStats } from "node:fs";
import { createRequire } from "node:module";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import { secp256k1 } from "@noble/curves/secp256k1";
import {
  getAddress,
  getContractAddress,
  keccak256,
  numberToHex,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
  sha256,
  stringToHex,
  type Address,
  type Hex
} from "viem";

import {
  BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_FILE,
  BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_SHA256,
  BSC_TESTNET_DEPLOYER_STORE_FILE,
  BSC_TESTNET_DEPLOYER_STORE_SHA256,
  parseBscTestnetDeployerCustodyConfiguration,
  parseBscTestnetDeployerEncryptedStore,
  sha256Hex,
  type ParsedBscTestnetDeployerCustodyConfiguration
} from "./bsc-testnet-deployer-custody-core";
import {
  probeWindowsBscTestnetDeployerCustody,
  runPinnedPowerShellForInternalUse
} from "./bsc-testnet-deployer-custody-windows.server";
import {
  BSC_TESTNET_PTA_CHAIN_ID,
  BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
  BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256,
  BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
  BSC_TESTNET_PTA_HARD_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_HARD_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_HARD_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_MAX_ENVELOPE_LIFETIME_SECONDS
} from "./bsc-testnet-pta-deployment-envelope";
import {
  BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_MAX_AGE_SECONDS,
  BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
  BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION,
  BSC_TESTNET_PTA_SIGNING_WORKER_REQUEST_HASH_DOMAIN,
  type BscTestnetPtaSigningWorkerRequest,
  type BscTestnetPtaSigningWorkerSignedResponse
} from "./bsc-testnet-pta-one-shot-worker-protocol";

const MAXIMUM_STDIN_BYTES = 16_384;
const MAXIMUM_JSON_DEPTH = 12;
const MAXIMUM_JSON_NODES = 80;
const MAXIMUM_STORE_BYTES = 65_536;
const MAXIMUM_PROTECTED_BLOB_BYTES = 4_096;
const MAXIMUM_SIGNED_TRANSACTION_BYTES = 4_096;
const PASSWORD_BYTES = 48;
const DERIVED_KEY_BYTES = 32;
const SCRYPT_MAXIMUM_MEMORY_BYTES = 256 * 1024 * 1024;
const UINT256_MAX = (1n << 256n) - 1n;
const SECP256K1_ORDER = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"
);
const SECP256K1_HALF_ORDER = SECP256K1_ORDER / 2n;
const HARD_MAX_GAS_LIMIT = BigInt(BSC_TESTNET_PTA_HARD_MAX_GAS_LIMIT);
const HARD_MAX_GAS_PRICE_WEI = BigInt(BSC_TESTNET_PTA_HARD_MAX_GAS_PRICE_WEI);
const HARD_MAX_TOTAL_COST_WEI = BigInt(BSC_TESTNET_PTA_HARD_MAX_TOTAL_COST_WEI);
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PINNED_POWERSHELL_EXECUTABLE =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const PINNED_POWERSHELL_SHA256 = "9785001b0dcf755eddb8af294a373c0b87b2498660f724e76c4d53f9c217c7a3";
const PINNED_NODE_VERSION = "v24.14.1";
const PINNED_NODE_EXECUTABLE_SHA256 =
  "58e74bf02fc5bbacc41dcb8bef089961cd5bddd37830b87784e4fc624d145d1f";
const PINNED_TYPESCRIPT_LOADER_SHA256 =
  "7783710b215e30285d7a36b41a3cbefbfe9c1fafdaaba929225c42c1da7abfc1";
const PINNED_INTEGRATIONS_PACKAGE_SHA256 =
  "195251586fa76af6eaf0e016aa385a105103118063b78e00ebe78c16817e093b";
const PINNED_PNPM_LOCK_SHA256 = "645b67708bc22122be8fdbcda35314019599cf2c4665a12abf7d5d767b4a72b1";
const PINNED_RUNTIME_TREE_MANIFESTS = Object.freeze({
  abitypeForOx: Object.freeze({
    digest: "e80d2f27751b0997a91f4c5d7a15cc122d3ae5536cd4378460c96711d89502b6",
    files: 36,
    bytes: 186_576
  }),
  abitypeForViem: Object.freeze({
    digest: "b9afb85169f3b43c7b04d8eef5d8d1443bcdbf9ae8c1b01cc9211ba3440f2533",
    files: 36,
    bytes: 186_574
  }),
  nobleCurves: Object.freeze({
    digest: "ead39ce3e8f73680bfc4d2eae7daa5035836b086d53b13c3e59285e2f04927bc",
    files: 26,
    bytes: 317_443
  }),
  nobleHashes: Object.freeze({
    digest: "4fcf0fa01dad679b88ef13a350f68e754446ae0102c2aa6d52b77840c81fa65b",
    files: 28,
    bytes: 175_332
  }),
  ox: Object.freeze({
    digest: "cb0acff895a96d3520f8875e65f9b7679cfa49f7405fc7725c607292e429d527",
    files: 154,
    bytes: 1_168_943
  }),
  serverOnly: Object.freeze({
    digest: "03dfa375a287d93459c50e5d9ab699bc1fdd243d68b4634dfd9062912c3511f6",
    files: 2,
    bytes: 467
  }),
  typescript: Object.freeze({
    digest: "310dc96e3ba5a379e07512ebb864d0e586b4abd24a9636fadabd4937e54489f8",
    files: 2,
    bytes: 9_147_743
  }),
  viem: Object.freeze({
    digest: "e7b8b7334a5b6d3157b0a055eb3affa97670257c257c393a3077299839980f5a",
    files: 1_432,
    bytes: 3_044_800
  })
});
const PINNED_RUNTIME_FILES = Object.freeze({
  curves: Object.freeze({
    "package.json": "d496cbba8f48a7407657170c84542e337e2fdfdc71bb7f5fd9e350daab119f31",
    "secp256k1.js": "bc4dff82aae571c3ab3adb169b7a2e79180e49dc057735bcc1ba7b8f1dd5b6dd",
    "_shortw_utils.js": "05961ba15139b459cadbe736312f9caf74f71130b3849a374aadd530a071803b",
    "abstract/curve.js": "e5574e9bad071ffdaf70727b78dd115c9193fdbb41306210a436a0c8ba5c7a06",
    "abstract/hash-to-curve.js": "530ddd976f05bac0612b8f1d020c1500190a7516cff46bb4c48c5bd82ebc41a3",
    "abstract/modular.js": "81e61cf3c99265eb2e8696cb8673a31621172481800a0d17df4f9545c5f541a0",
    "abstract/utils.js": "8d4b744d77e41c20307cd30dca9f9f2c5302b3832f47a180cc73e986427d56bf",
    "abstract/weierstrass.js": "2b3212c2e6553fbcf1097da762b0474253bac2b8f6ec841546eaed22800d1368",
    "esm/secp256k1.js": "30943ee7362d12dcbb2ec8756055aa1b2d0246e1bea56288abcbf0aeb7969216",
    "esm/_shortw_utils.js": "094e48b0cc55194c806e67bbb039622929d1380a424c3c24007bde12cd9eaad3",
    "esm/abstract/curve.js": "e3d7d63e98ab0911cf9d66fb4cdecabc729ef2b2bcf93dcc065cf8970f118577",
    "esm/abstract/hash-to-curve.js":
      "8621c317318f0a851dcf2153480be811009485dd6114727523a8ed0a8686f1a9",
    "esm/abstract/modular.js": "85ab136f068217c8a9ec7cda62a6e429e67fe96684297075761b1005ae76bc09",
    "esm/abstract/utils.js": "ea47b9f98a7f92f2a5d4272fb98cb8cd440dc054819b9defb30d153e4677895c",
    "esm/abstract/weierstrass.js":
      "cdc650e13a4b3e26699fcfd6d85b4a816f159efd16fb0905411495b57dce485f"
  }),
  hashes: Object.freeze({
    "package.json": "7c4657c5e616c22cefa2691cc30670824a639dc71d97bf83925be2d239dc60e3",
    "_md.js": "4eaf0ae8f8191c50acdab7c3de7f335bf24845e4b562bdbc3e9f61cb7a873831",
    "_u64.js": "9b109bb57c0d8852bda12136f0f588ffea2a1a3c0f4241bdbb3727cd449976ae",
    "crypto.js": "c5ee6d6553e69ba96f9a2a7f70e677bf69a6e2d52849a892e67b2e547dc96b28",
    "hmac.js": "1e0e4081a255691a1bae9148d9c5795e3439980d4ecb346a5e62a9c7fb3764a4",
    "sha2.js": "53b6dc30db76a7c4e4b9370049e7a3c01bbb5507d058c084e97ccb3ee050faa4",
    "utils.js": "7edf19720c345e1cb76e8d3a9306f3344457d4e03576bbb0b3e1ffd0a42d0d30",
    "esm/_md.js": "cefb1557e7715cb2117c83f82ef3e3175c7e0391c80bd5795b2d4effc45fc582",
    "esm/_u64.js": "e48c0cfc10810439a4807b46db136ce603a3fa09b62584f513ef2f3ca496af54",
    "esm/crypto.js": "9211d026c5d21e60e0126dd6f01150d87da5ba7261b8f468215c1264372ff5a5",
    "esm/hmac.js": "a330af1af3fb00ebdbba2f023dd5e023aa367669081cd51c7d172eb499533d0b",
    "esm/sha2.js": "e729088b82e5450bff54c3a0013582aa42e1fe8f58dd31f5967f6ebe34c52299",
    "esm/sha3.js": "0260b46f92a3a94c7179958600d7f92469ef2c8f5d2e966bd9a838ff815713e9",
    "esm/utils.js": "4cf4c1e05affedcb4fd584a43d76ae1a3711e34a36e2251b90c27e33ecc74fad"
  }),
  viem: Object.freeze({
    "package.json": "8b5112e95226a77c4a65313036c219793b5a02c99592e21b11b7f52580bc3119",
    "_esm/index.js": "ea32975364e9f2d599b10639d81985ec6a3ed87f6942fe0cb73b1bf738959057",
    "_esm/utils/address/getAddress.js":
      "e17499a48cfa1a8a5f9557060559fca9c09dd46883761ee1e75e618af260b434",
    "_esm/utils/encoding/toHex.js":
      "53fcd5ab40bcaf191735355e4d107092818a5006cf2ca75580d581e568966629",
    "_esm/utils/hash/keccak256.js":
      "3e3b256aa1b5537440955848234b84aa4de248225cb038c82317420279e77c14",
    "_esm/utils/transaction/serializeTransaction.js":
      "1cbe1acacdfdb2f409715164601f0cb1e1275fd29832968caeae27dffcfffd48",
    [["_esm/accounts/private", "KeyToAccount.js"].join("")]:
      "c056d3c2d9308e74476007cda3e93cd3547068778c2b6ce67809537e207e78e6",
    "_esm/accounts/utils/sign.js":
      "8320f27b64139ccb63dac093af688a68811924f129d1f15c83f9542dcfc12528",
    "_esm/accounts/utils/signTransaction.js":
      "ac5a2c356782ec961c37eb3b3007fc00a505f9f812eaed03f5ea8a635c60ae54"
  })
});

const DPAPI_UNPROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$protectedBytes = $null
$clearBytes = $null
try {
  $inputStream = [Console]::OpenStandardInput()
  $memory = [System.IO.MemoryStream]::new()
  $inputStream.CopyTo($memory)
  $protectedBytes = $memory.ToArray()
  $memory.Dispose()
  $null = Add-Type -AssemblyName System.Security
  $clearBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protectedBytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  $outputStream = [Console]::OpenStandardOutput()
  $outputStream.Write($clearBytes, 0, $clearBytes.Length)
  $outputStream.Flush()
} catch {
  exit 31
} finally {
  if ($null -ne $protectedBytes) { [Array]::Clear($protectedBytes, 0, $protectedBytes.Length) }
  if ($null -ne $clearBytes) { [Array]::Clear($clearBytes, 0, $clearBytes.Length) }
}
`;

type DataRecord = Readonly<Record<string, unknown>>;

const WORKER_REQUEST_KEYS = [
  "authenticatedAt",
  "chainId",
  "claimId",
  "environment",
  "expectedSigner",
  "expiresAt",
  "oneShotIntentId",
  "operation",
  "predictedContractAddress",
  "requestHash",
  "requestHashDomain",
  "schemaVersion",
  "transaction"
] as const;
const WORKER_TRANSACTION_KEYS = [
  "contractCreation",
  "data",
  "eip155ReplayProtection",
  "gasLimit",
  "gasPriceWei",
  "maximumCostWei",
  "nonce",
  "serializedSigningPayload",
  "signingHash",
  "sourceEnvelopeHash",
  "to",
  "type",
  "valueWei"
] as const;

export interface BscTestnetPtaExactSigningTransaction {
  readonly data: Hex;
  readonly gasLimit: bigint;
  readonly gasPriceWei: bigint;
  readonly nonce: 0;
  readonly signingNotAfterMilliseconds: number;
}

type ValidatedWorkerInput = Readonly<{
  claimId: string;
  requestHash: Hex;
  sourceEnvelopeHash: Hex;
  signingHash: Hex;
  transaction: BscTestnetPtaExactSigningTransaction;
}>;

export type BscTestnetPtaSigningWorkerBlockedCode =
  | "ALREADY_CLAIMED"
  | "CLOCK_INVALID"
  | "CUSTODY_UNAVAILABLE"
  | "INPUT_INVALID"
  | "PAYLOAD_EXPIRED"
  | "SIGNED_TRANSACTION_INVALID"
  | "SIGNING_FAILED";

export interface BscTestnetPtaSigningWorkerPorts {
  readonly now: () => Date;
  readonly signExactTransaction: (
    custody: ParsedBscTestnetDeployerCustodyConfiguration,
    transaction: BscTestnetPtaExactSigningTransaction
  ) => Promise<Hex>;
}

export interface BscTestnetPtaSigningWorker {
  /** A worker instance accepts at most one exact, valid signing request. */
  readonly executeCanonicalStdin: (
    canonicalStdin: Uint8Array
  ) => Promise<BscTestnetPtaSigningWorkerSignedResponse>;
  /** Adapter consumed directly by the durable one-shot signer core. */
  readonly invokeExactSigningWorker: (
    request: BscTestnetPtaSigningWorkerRequest
  ) => Promise<BscTestnetPtaSigningWorkerSignedResponse>;
}

class SigningWorkerFailure extends Error {
  override readonly name = "SigningWorkerFailure";
  readonly code: BscTestnetPtaSigningWorkerBlockedCode;

  constructor(code: BscTestnetPtaSigningWorkerBlockedCode) {
    super("The exact BSC testnet PTA signing operation failed closed.");
    this.code = code;
  }
}

function dataRecord(input: unknown): DataRecord | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input) || isProxy(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(input).some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (
      Object.values(descriptors).some(
        (descriptor) => !("value" in descriptor) || descriptor.enumerable !== true
      )
    ) {
      return null;
    }
    return input as DataRecord;
  } catch {
    return null;
  }
}

function hasExactKeys(input: DataRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(input).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function withinJsonLimits(input: unknown): boolean {
  let nodes = 0;
  const visit = (value: unknown, depth: number): boolean => {
    nodes += 1;
    if (nodes > MAXIMUM_JSON_NODES || depth > MAXIMUM_JSON_DEPTH) return false;
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isSafeInteger(value);
    if (Array.isArray(value)) return value.every((entry) => visit(entry, depth + 1));
    const record = dataRecord(value);
    return record !== null && Object.values(record).every((entry) => visit(entry, depth + 1));
  };
  return visit(input, 0);
}

function parseCanonicalJson(input: Uint8Array): DataRecord | null {
  try {
    if (
      isProxy(input) ||
      !(input instanceof Uint8Array) ||
      input.byteLength < 2 ||
      input.byteLength > MAXIMUM_STDIN_BYTES ||
      input[0] === 0xef
    ) {
      return null;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    const parsed: unknown = JSON.parse(text);
    const record = dataRecord(parsed);
    if (record === null || !withinJsonLimits(record) || JSON.stringify(record) !== text)
      return null;
    return record;
  } catch {
    return null;
  }
}

function exactLowerHex(input: unknown, bytes?: number): Hex | null {
  if (
    typeof input !== "string" ||
    !/^0x(?:[0-9a-f]{2})*$/u.test(input) ||
    (bytes !== undefined && input.length !== 2 + bytes * 2)
  ) {
    return null;
  }
  return input as Hex;
}

export function normalizeCanonicalSignatureScalarForInternalUse(input: unknown): Hex | null {
  if (
    typeof input !== "string" ||
    !/^0x(?:[0-9a-f]{2}){1,32}$/u.test(input) ||
    (input.length > 4 && input.startsWith("0x00"))
  ) {
    return null;
  }
  const value = BigInt(input);
  return value > 0n && value < SECP256K1_ORDER ? numberToHex(value, { size: 32 }) : null;
}

function canonicalUint(input: unknown, maximum = UINT256_MAX): bigint | null {
  if (typeof input !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(input)) return null;
  try {
    const value = BigInt(input);
    return value <= maximum ? value : null;
  } catch {
    return null;
  }
}

function exactUtcMilliseconds(input: unknown): number | null {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input)) {
    return null;
  }
  const milliseconds = Date.parse(input);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === input
    ? milliseconds
    : null;
}

function exactAddress(input: unknown, expected: Address): boolean {
  if (typeof input !== "string") return false;
  try {
    return getAddress(input) === expected && input === expected;
  } catch {
    return false;
  }
}

function validateExactTransaction(transaction: BscTestnetPtaExactSigningTransaction): boolean {
  if (
    transaction.nonce !== 0 ||
    transaction.gasLimit <= 0n ||
    transaction.gasLimit > HARD_MAX_GAS_LIMIT ||
    transaction.gasPriceWei <= 0n ||
    transaction.gasPriceWei > HARD_MAX_GAS_PRICE_WEI ||
    transaction.gasLimit * transaction.gasPriceWei > HARD_MAX_TOTAL_COST_WEI ||
    !Number.isSafeInteger(transaction.signingNotAfterMilliseconds) ||
    exactLowerHex(transaction.data, BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES) === null
  ) {
    return false;
  }
  return (
    sha256(transaction.data).slice(2) === BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 &&
    keccak256(transaction.data) === BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256
  );
}

export function isBscTestnetPtaSigningDeadlineCurrentForInternalUse(
  transaction: BscTestnetPtaExactSigningTransaction,
  nowMilliseconds: number
): boolean {
  return (
    validateExactTransaction(transaction) &&
    Number.isSafeInteger(nowMilliseconds) &&
    nowMilliseconds < transaction.signingNotAfterMilliseconds
  );
}

function recursivelySortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => recursivelySortJsonKeys(entry));
  if (value === null || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = recursivelySortJsonKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function parseWorkerInput(
  canonicalStdin: Uint8Array,
  nowMilliseconds: number
): ValidatedWorkerInput | "expired" | null {
  const root = parseCanonicalJson(canonicalStdin);
  if (root === null || !hasExactKeys(root, WORKER_REQUEST_KEYS)) {
    return null;
  }
  const transaction = dataRecord(root.transaction);
  if (transaction === null || !hasExactKeys(transaction, WORKER_TRANSACTION_KEYS)) {
    return null;
  }
  if (
    root.schemaVersion !== BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION ||
    root.operation !== BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION ||
    root.environment !== "bsc-testnet" ||
    root.chainId !== BSC_TESTNET_PTA_CHAIN_ID_DECIMAL ||
    root.oneShotIntentId !== BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID ||
    !exactAddress(root.expectedSigner, BSC_TESTNET_PTA_DEPLOYER_ADDRESS) ||
    !exactAddress(root.predictedContractAddress, BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS) ||
    root.requestHashDomain !== BSC_TESTNET_PTA_SIGNING_WORKER_REQUEST_HASH_DOMAIN ||
    transaction.type !== "legacy" ||
    transaction.eip155ReplayProtection !== true ||
    transaction.contractCreation !== true ||
    transaction.to !== null ||
    transaction.nonce !== "0" ||
    transaction.valueWei !== "0"
  ) {
    return null;
  }
  const claimId =
    typeof root.claimId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(root.claimId)
      ? root.claimId
      : null;
  const authenticatedAtMilliseconds = exactUtcMilliseconds(root.authenticatedAt);
  const expiresAtMilliseconds = exactUtcMilliseconds(root.expiresAt);
  const data = exactLowerHex(transaction.data, BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES);
  const gasLimit = canonicalUint(transaction.gasLimit, HARD_MAX_GAS_LIMIT);
  const gasPriceWei = canonicalUint(transaction.gasPriceWei, HARD_MAX_GAS_PRICE_WEI);
  const maximumCostWei = canonicalUint(transaction.maximumCostWei, HARD_MAX_TOTAL_COST_WEI);
  const serializedSigningPayload = exactLowerHex(transaction.serializedSigningPayload);
  const signingHash = exactLowerHex(transaction.signingHash, 32);
  const sourceEnvelopeHash = exactLowerHex(transaction.sourceEnvelopeHash, 32);
  const requestHash = exactLowerHex(root.requestHash, 32);
  if (
    claimId === null ||
    authenticatedAtMilliseconds === null ||
    expiresAtMilliseconds === null ||
    data === null ||
    gasLimit === null ||
    gasLimit === 0n ||
    gasPriceWei === null ||
    gasPriceWei === 0n ||
    maximumCostWei === null ||
    serializedSigningPayload === null ||
    signingHash === null ||
    sourceEnvelopeHash === null ||
    requestHash === null ||
    signingHash === `0x${"00".repeat(32)}` ||
    sourceEnvelopeHash === `0x${"00".repeat(32)}` ||
    requestHash === `0x${"00".repeat(32)}` ||
    maximumCostWei !== gasLimit * gasPriceWei
  ) {
    return null;
  }
  const exactTransaction = Object.freeze({
    data,
    gasLimit,
    gasPriceWei,
    nonce: 0 as const,
    signingNotAfterMilliseconds: Math.min(
      expiresAtMilliseconds,
      authenticatedAtMilliseconds + BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_MAX_AGE_SECONDS * 1_000
    )
  });
  if (!validateExactTransaction(exactTransaction)) return null;
  if (
    getContractAddress({ from: BSC_TESTNET_PTA_DEPLOYER_ADDRESS, nonce: 0n }) !==
    BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS
  ) {
    return null;
  }
  const reconstructed = serializeTransaction({
    chainId: BSC_TESTNET_PTA_CHAIN_ID,
    data,
    gas: gasLimit,
    gasPrice: gasPriceWei,
    nonce: 0,
    type: "legacy",
    value: 0n
  });
  if (
    reconstructed !== serializedSigningPayload ||
    keccak256(reconstructed) !== signingHash ||
    authenticatedAtMilliseconds > nowMilliseconds ||
    expiresAtMilliseconds - authenticatedAtMilliseconds >
      BSC_TESTNET_PTA_MAX_ENVELOPE_LIFETIME_SECONDS * 1_000
  ) {
    return null;
  }
  if (
    expiresAtMilliseconds <= nowMilliseconds ||
    nowMilliseconds - authenticatedAtMilliseconds >
      BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_MAX_AGE_SECONDS * 1_000
  ) {
    return "expired";
  }
  const body = {
    schemaVersion: BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION,
    operation: BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
    environment: "bsc-testnet" as const,
    chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
    oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
    claimId,
    authenticatedAt: root.authenticatedAt,
    expiresAt: root.expiresAt,
    expectedSigner: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
    predictedContractAddress: BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
    transaction: {
      type: "legacy" as const,
      eip155ReplayProtection: true as const,
      contractCreation: true as const,
      nonce: "0" as const,
      to: null,
      valueWei: "0" as const,
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPriceWei.toString(),
      maximumCostWei: maximumCostWei.toString(),
      data,
      serializedSigningPayload,
      signingHash,
      sourceEnvelopeHash
    },
    requestHashDomain: BSC_TESTNET_PTA_SIGNING_WORKER_REQUEST_HASH_DOMAIN
  };
  const sorted = recursivelySortJsonKeys(body);
  const expectedRequestHash = keccak256(
    stringToHex(
      `${BSC_TESTNET_PTA_SIGNING_WORKER_REQUEST_HASH_DOMAIN}\u0000${JSON.stringify(sorted)}`
    )
  );
  if (expectedRequestHash !== requestHash) return null;
  return Object.freeze({
    claimId,
    requestHash,
    signingHash,
    sourceEnvelopeHash,
    transaction: exactTransaction
  });
}

function deriveKey(password: Uint8Array, salt: Uint8Array): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    scrypt(
      password,
      salt,
      DERIVED_KEY_BYTES,
      { N: 131_072, maxmem: SCRYPT_MAXIMUM_MEMORY_BYTES, p: 1, r: 8 },
      (error, derivedKey) => {
        if (error !== null) {
          rejectPromise(new SigningWorkerFailure("CUSTODY_UNAVAILABLE"));
          return;
        }
        resolvePromise(derivedKey);
      }
    );
  });
}

/**
 * Incident-reviewed deterministic seam. noble-curves 1.9.1 uses RFC6979
 * (HMAC-SHA256 for secp256k1); low-S is mandatory and randomized/additional
 * entropy is explicitly disabled. The input scalar is always consumed.
 */
export function reconstructExactBscTestnetPtaRfc6979TransactionForInternalUse(
  secretScalar: Buffer,
  transaction: BscTestnetPtaExactSigningTransaction
): Hex {
  let signingDigest: Buffer | null = null;
  try {
    if (secretScalar.byteLength !== 32 || !validateExactTransaction(transaction)) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const unsignedTransaction = {
      chainId: BSC_TESTNET_PTA_CHAIN_ID,
      data: transaction.data,
      gas: transaction.gasLimit,
      gasPrice: transaction.gasPriceWei,
      nonce: transaction.nonce,
      type: "legacy" as const,
      value: 0n
    };
    const unsigned = serializeTransaction(unsignedTransaction);
    signingDigest = Buffer.from(keccak256(unsigned).slice(2), "hex");
    const signature = secp256k1.sign(signingDigest, secretScalar, {
      lowS: true,
      extraEntropy: false,
      prehash: false
    });
    if (signature.recovery !== 0 && signature.recovery !== 1) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    return serializeTransaction(unsignedTransaction, {
      r: numberToHex(signature.r, { size: 32 }),
      s: numberToHex(signature.s, { size: 32 }),
      v: signature.recovery === 0 ? 27n : 28n
    });
  } catch (error) {
    if (error instanceof SigningWorkerFailure) throw error;
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  } finally {
    signingDigest?.fill(0);
    secretScalar.fill(0);
  }
}

/**
 * Exact-purpose cryptographic seam used by the ephemeral Windows worker. It
 * cannot sign an arbitrary target, chain, nonce, value, or bytecode.
 * Both caller-owned secret buffers are consumed and cleared on every outcome.
 */
export async function signExactBscTestnetPtaEncryptedStoreForInternalUse(
  storeBytes: Buffer,
  passwordBytes: Buffer,
  transaction: BscTestnetPtaExactSigningTransaction
): Promise<Hex> {
  let derivedKey: Buffer | null = null;
  let secretScalar: Buffer | null = null;
  let macMaterial: Buffer | null = null;
  let calculatedMac: Buffer | null = null;
  let publicKey: Buffer | null = null;
  let parsed: ReturnType<typeof parseBscTestnetDeployerEncryptedStore> = null;
  try {
    if (passwordBytes.byteLength !== PASSWORD_BYTES || !validateExactTransaction(transaction)) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    parsed = parseBscTestnetDeployerEncryptedStore(storeBytes, BSC_TESTNET_PTA_DEPLOYER_ADDRESS);
    if (parsed === null) throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    derivedKey = await deriveKey(passwordBytes, parsed.salt);
    macMaterial = Buffer.concat([derivedKey.subarray(16, 32), parsed.cipherText]);
    calculatedMac = Buffer.from(keccak256(macMaterial).slice(2), "hex");
    macMaterial.fill(0);
    macMaterial = null;
    const matches = timingSafeEqual(calculatedMac, parsed.mac);
    calculatedMac.fill(0);
    calculatedMac = null;
    if (!matches) throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    const decipher = createDecipheriv("aes-128-ctr", derivedKey.subarray(0, 16), parsed.iv);
    secretScalar = Buffer.concat([decipher.update(parsed.cipherText), decipher.final()]);
    if (secretScalar.byteLength !== 32) throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    if (!isBscTestnetPtaSigningDeadlineCurrentForInternalUse(transaction, Date.now())) {
      throw new SigningWorkerFailure("PAYLOAD_EXPIRED");
    }

    publicKey = Buffer.from(secp256k1.getPublicKey(secretScalar, false));
    const recoveredAddress = getAddress(`0x${keccak256(publicKey.subarray(1)).slice(-40)}`);
    publicKey.fill(0);
    publicKey = null;
    if (recoveredAddress !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    if (!isBscTestnetPtaSigningDeadlineCurrentForInternalUse(transaction, Date.now())) {
      throw new SigningWorkerFailure("PAYLOAD_EXPIRED");
    }
    const scalarForSigning = secretScalar;
    secretScalar = null;
    return reconstructExactBscTestnetPtaRfc6979TransactionForInternalUse(
      scalarForSigning,
      transaction
    );
  } catch (error) {
    if (error instanceof SigningWorkerFailure) throw error;
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  } finally {
    storeBytes.fill(0);
    passwordBytes.fill(0);
    derivedKey?.fill(0);
    secretScalar?.fill(0);
    macMaterial?.fill(0);
    calculatedMac?.fill(0);
    publicKey?.fill(0);
    parsed?.cipherText.fill(0);
    parsed?.iv.fill(0);
    parsed?.mac.fill(0);
    parsed?.salt.fill(0);
  }
}

type FileSnapshot = Readonly<{
  birthtimeMs: number;
  ctimeMs: number;
  device: bigint;
  inode: bigint;
  modifiedMs: number;
  size: number;
}>;

function snapshot(metadata: BigIntStats): FileSnapshot {
  return Object.freeze({
    birthtimeMs: Number(metadata.birthtimeMs),
    ctimeMs: Number(metadata.ctimeMs),
    device: metadata.dev,
    inode: metadata.ino,
    modifiedMs: Number(metadata.mtimeMs),
    size: Number(metadata.size)
  });
}

function sameSnapshot(left: FileSnapshot, right: FileSnapshot): boolean {
  return (
    left.birthtimeMs === right.birthtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.modifiedMs === right.modifiedMs &&
    left.size === right.size
  );
}

async function readStableRegularFile(
  path: string,
  maximumBytes: number,
  requireSingleLink = true,
  allowEmpty = false
): Promise<Buffer> {
  let handle;
  try {
    handle = await open(path, fileConstants.O_RDONLY);
    const beforeMetadata = await handle.stat({ bigint: true });
    if (
      !beforeMetadata.isFile() ||
      (requireSingleLink && beforeMetadata.nlink !== 1n) ||
      beforeMetadata.size < (allowEmpty ? 0n : 1n) ||
      beforeMetadata.size > BigInt(maximumBytes)
    ) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const before = snapshot(beforeMetadata);
    const content = await handle.readFile();
    const after = snapshot(await handle.stat({ bigint: true }));
    if (content.byteLength !== before.size || !sameSnapshot(before, after)) {
      content.fill(0);
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    return content;
  } catch (error) {
    if (error instanceof SigningWorkerFailure) throw error;
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

type RuntimeTreeManifest = Readonly<{ digest: string; files: number; bytes: number }>;

async function listRuntimeJavaScriptFiles(
  canonicalRoot: string,
  relativeDirectory: string,
  output: string[]
): Promise<void> {
  const directory = resolve(canonicalRoot, relativeDirectory);
  const [metadata, canonicalDirectory] = await Promise.all([lstat(directory), realpath(directory)]);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    !isWithin(canonicalRoot, canonicalDirectory)
  ) {
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  }
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const entry of entries) {
    const relativeName =
      relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    if (entry.isDirectory()) {
      await listRuntimeJavaScriptFiles(canonicalRoot, relativeName, output);
      continue;
    }
    if (!entry.isFile()) throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    if (entry.name.endsWith(".js")) output.push(relativeName);
  }
}

async function deriveRuntimeTreeManifest(
  root: string,
  subdirectories: readonly string[],
  exactFiles: readonly string[] = ["package.json"]
): Promise<RuntimeTreeManifest> {
  const canonicalRoot = await realpath(root);
  const rootMetadata = await lstat(canonicalRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  }
  const names = [...exactFiles];
  for (const directory of subdirectories) {
    await listRuntimeJavaScriptFiles(canonicalRoot, directory, names);
  }
  names.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  }
  const digest = createHash("sha256");
  digest.update("ProofEra/BSC-Testnet/PTA/runtime-tree/v1\0", "utf8");
  let totalBytes = 0;
  for (const name of names) {
    if (name.includes("\\") || name.startsWith("/") || name.includes("../")) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const path = resolve(canonicalRoot, ...name.split("/"));
    const canonicalPath = await realpath(path);
    if (!isWithin(canonicalRoot, canonicalPath)) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const bytes = await readStableRegularFile(path, 16 * 1024 * 1024, false, true);
    const nameBytes = Buffer.from(name, "utf8");
    const frame = Buffer.alloc(12);
    frame.writeUInt32BE(nameBytes.byteLength, 0);
    frame.writeBigUInt64BE(BigInt(bytes.byteLength), 4);
    digest.update(frame);
    digest.update(nameBytes);
    digest.update(bytes);
    totalBytes += bytes.byteLength;
    frame.fill(0);
    nameBytes.fill(0);
    bytes.fill(0);
  }
  return Object.freeze({ digest: digest.digest("hex"), files: names.length, bytes: totalBytes });
}

function exactRuntimeManifest(actual: RuntimeTreeManifest, expected: RuntimeTreeManifest): boolean {
  return (
    actual.digest === expected.digest &&
    actual.files === expected.files &&
    actual.bytes === expected.bytes
  );
}

export async function assertPinnedDeterministicSigningRuntimeForInternalUse(): Promise<void> {
  if (process.version !== PINNED_NODE_VERSION) {
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  }
  try {
    const curvesEntry = fileURLToPath(import.meta.resolve("@noble/curves/secp256k1"));
    const hashesEntry = fileURLToPath(import.meta.resolve("@noble/hashes/sha2"));
    const viemEntry = fileURLToPath(import.meta.resolve("viem"));
    if (
      win32.basename(curvesEntry).toLowerCase() !== "secp256k1.js" ||
      win32.basename(win32.dirname(curvesEntry)).toLowerCase() !== "esm" ||
      win32.basename(hashesEntry).toLowerCase() !== "sha2.js" ||
      win32.basename(win32.dirname(hashesEntry)).toLowerCase() !== "esm" ||
      win32.basename(viemEntry).toLowerCase() !== "index.js" ||
      win32.basename(win32.dirname(viemEntry)).toLowerCase() !== "_esm"
    ) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const curvesRoot = dirname(dirname(curvesEntry));
    const hashesRoot = dirname(dirname(hashesEntry));
    const viemRoot = dirname(dirname(viemEntry));
    const canonicalViemEntry = await realpath(viemEntry);
    const viemRequire = createRequire(canonicalViemEntry);
    const abitypeForViemRoot = dirname(await realpath(viemRequire.resolve("abitype/package.json")));
    const oxRoot = dirname(await realpath(viemRequire.resolve("ox/package.json")));
    const oxRequire = createRequire(resolve(oxRoot, "package.json"));
    const abitypeForOxRoot = dirname(await realpath(oxRequire.resolve("abitype/package.json")));
    const serverOnlyRoot = await realpath(
      resolve(REPOSITORY_ROOT, "packages/integrations/node_modules/server-only")
    );
    const typescriptRoot = await realpath(resolve(REPOSITORY_ROOT, "node_modules/typescript"));
    const runtimeTreeManifests = {
      abitypeForOx: await deriveRuntimeTreeManifest(abitypeForOxRoot, ["dist/esm"]),
      abitypeForViem: await deriveRuntimeTreeManifest(abitypeForViemRoot, ["dist/esm"]),
      nobleCurves: await deriveRuntimeTreeManifest(curvesRoot, ["esm"]),
      nobleHashes: await deriveRuntimeTreeManifest(hashesRoot, ["esm"]),
      ox: await deriveRuntimeTreeManifest(oxRoot, ["_esm"]),
      serverOnly: await deriveRuntimeTreeManifest(serverOnlyRoot, [], ["empty.js", "package.json"]),
      typescript: await deriveRuntimeTreeManifest(
        typescriptRoot,
        [],
        ["lib/typescript.js", "package.json"]
      ),
      viem: await deriveRuntimeTreeManifest(viemRoot, ["_esm"])
    };
    for (const name of Object.keys(PINNED_RUNTIME_TREE_MANIFESTS) as Array<
      keyof typeof PINNED_RUNTIME_TREE_MANIFESTS
    >) {
      if (!exactRuntimeManifest(runtimeTreeManifests[name], PINNED_RUNTIME_TREE_MANIFESTS[name])) {
        throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
      }
    }
    const moduleFiles = [
      ...Object.entries(PINNED_RUNTIME_FILES.curves).map(([name, expectedSha256]) => ({
        path: resolve(curvesRoot, name),
        expectedSha256
      })),
      ...Object.entries(PINNED_RUNTIME_FILES.hashes).map(([name, expectedSha256]) => ({
        path: resolve(hashesRoot, name),
        expectedSha256
      })),
      ...Object.entries(PINNED_RUNTIME_FILES.viem).map(([name, expectedSha256]) => ({
        path: resolve(viemRoot, name),
        expectedSha256
      })),
      {
        path: resolve(REPOSITORY_ROOT, "scripts/typescript-extension-loader.mjs"),
        expectedSha256: PINNED_TYPESCRIPT_LOADER_SHA256
      },
      {
        path: resolve(REPOSITORY_ROOT, "packages/integrations/package.json"),
        expectedSha256: PINNED_INTEGRATIONS_PACKAGE_SHA256
      },
      {
        path: resolve(REPOSITORY_ROOT, "pnpm-lock.yaml"),
        expectedSha256: PINNED_PNPM_LOCK_SHA256
      }
    ];
    for (const file of moduleFiles) {
      const bytes = await readStableRegularFile(file.path, 4 * 1024 * 1024, false);
      const actualSha256 = sha256Hex(bytes);
      bytes.fill(0);
      if (actualSha256 !== file.expectedSha256) {
        throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
      }
    }
    const executableBytes = await readStableRegularFile(process.execPath, 128 * 1024 * 1024, false);
    const executableSha256 = sha256Hex(executableBytes);
    executableBytes.fill(0);
    if (executableSha256 !== PINNED_NODE_EXECUTABLE_SHA256) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
  } catch (error) {
    if (error instanceof SigningWorkerFailure) throw error;
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  }
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function isWithin(parent: string, candidate: string): boolean {
  const local = relative(parent, candidate);
  return local === "" || (!local.startsWith(`..${sep}`) && local !== ".." && !isAbsolute(local));
}

async function inspectPinnedPaths(
  custody: ParsedBscTestnetDeployerCustodyConfiguration
): Promise<Readonly<{ protectedBlobPath: string; storePath: string }>> {
  const directory = custody.custodyDirectoryAbsolute;
  const storePath = join(directory, BSC_TESTNET_DEPLOYER_STORE_FILE);
  const protectedBlobPath = join(directory, BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_FILE);
  if (
    win32.basename(directory).toLowerCase() !== "bsc-testnet" ||
    win32.basename(win32.dirname(directory)).toLowerCase() !== "wallets" ||
    isWithin(REPOSITORY_ROOT, directory)
  ) {
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  }
  try {
    const [directoryMetadata, storeMetadata, blobMetadata, executableMetadata] = await Promise.all([
      lstat(directory),
      lstat(storePath),
      lstat(protectedBlobPath),
      lstat(PINNED_POWERSHELL_EXECUTABLE)
    ]);
    if (
      !directoryMetadata.isDirectory() ||
      directoryMetadata.isSymbolicLink() ||
      !storeMetadata.isFile() ||
      storeMetadata.isSymbolicLink() ||
      storeMetadata.nlink !== 1 ||
      !blobMetadata.isFile() ||
      blobMetadata.isSymbolicLink() ||
      blobMetadata.nlink !== 1 ||
      !executableMetadata.isFile() ||
      executableMetadata.isSymbolicLink()
    ) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const [realDirectory, realStore, realBlob, realExecutable] = await Promise.all([
      realpath(directory),
      realpath(storePath),
      realpath(protectedBlobPath),
      realpath(PINNED_POWERSHELL_EXECUTABLE)
    ]);
    if (
      !samePath(realDirectory, directory) ||
      !samePath(realStore, storePath) ||
      !samePath(realBlob, protectedBlobPath) ||
      !samePath(realExecutable, PINNED_POWERSHELL_EXECUTABLE) ||
      !samePath(dirname(realStore), realDirectory) ||
      !samePath(dirname(realBlob), realDirectory)
    ) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    return Object.freeze({ protectedBlobPath, storePath });
  } catch (error) {
    if (error instanceof SigningWorkerFailure) throw error;
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  }
}

async function nativeWindowsSignExactTransaction(
  custody: ParsedBscTestnetDeployerCustodyConfiguration,
  transaction: BscTestnetPtaExactSigningTransaction
): Promise<Hex> {
  if (process.platform !== "win32") throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  if (!isBscTestnetPtaSigningDeadlineCurrentForInternalUse(transaction, Date.now())) {
    throw new SigningWorkerFailure("PAYLOAD_EXPIRED");
  }
  const signal = new AbortController().signal;
  let storeBytes: Buffer | null = null;
  let protectedBytes: Buffer | null = null;
  let executableBytes: Buffer | null = null;
  let passwordBytes: Buffer | null = null;
  try {
    await assertPinnedDeterministicSigningRuntimeForInternalUse();
    const before = await probeWindowsBscTestnetDeployerCustody(custody, signal);
    if (before.status !== "ready") throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    const paths = await inspectPinnedPaths(custody);
    storeBytes = await readStableRegularFile(paths.storePath, MAXIMUM_STORE_BYTES);
    protectedBytes = await readStableRegularFile(
      paths.protectedBlobPath,
      MAXIMUM_PROTECTED_BLOB_BYTES
    );
    executableBytes = await readStableRegularFile(PINNED_POWERSHELL_EXECUTABLE, 1_048_576, false);
    if (
      sha256Hex(storeBytes) !== BSC_TESTNET_DEPLOYER_STORE_SHA256 ||
      sha256Hex(protectedBytes) !== BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_SHA256 ||
      sha256Hex(executableBytes) !== PINNED_POWERSHELL_SHA256
    ) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    executableBytes.fill(0);
    executableBytes = null;
    const unprotected = await runPinnedPowerShellForInternalUse(
      DPAPI_UNPROTECT_SCRIPT,
      protectedBytes,
      PASSWORD_BYTES,
      signal
    );
    passwordBytes = unprotected.output;
    if (passwordBytes.byteLength !== PASSWORD_BYTES) {
      throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const rawTransaction = await signExactBscTestnetPtaEncryptedStoreForInternalUse(
      storeBytes,
      passwordBytes,
      transaction
    );
    storeBytes = null;
    passwordBytes = null;
    return rawTransaction;
  } catch (error) {
    if (error instanceof SigningWorkerFailure) throw error;
    throw new SigningWorkerFailure("CUSTODY_UNAVAILABLE");
  } finally {
    storeBytes?.fill(0);
    protectedBytes?.fill(0);
    executableBytes?.fill(0);
    passwordBytes?.fill(0);
  }
}

async function attestSignedTransaction(
  rawTransaction: unknown,
  validated: ValidatedWorkerInput
): Promise<BscTestnetPtaSigningWorkerSignedResponse | null> {
  try {
    const raw = exactLowerHex(rawTransaction);
    if (
      raw === null ||
      raw.length <= 2 ||
      (raw.length - 2) / 2 > MAXIMUM_SIGNED_TRANSACTION_BYTES
    ) {
      return null;
    }
    const parsed = parseTransaction(raw);
    const signatureR = normalizeCanonicalSignatureScalarForInternalUse(parsed.r);
    const signatureS = normalizeCanonicalSignatureScalarForInternalUse(parsed.s);
    const signatureRValue = signatureR === null ? null : BigInt(signatureR);
    const signatureSValue = signatureS === null ? null : BigInt(signatureS);
    const signatureYParity = parsed.yParity === 0 || parsed.yParity === 1 ? parsed.yParity : null;
    const expectedV =
      signatureYParity === null
        ? null
        : BigInt(BSC_TESTNET_PTA_CHAIN_ID) * 2n + 35n + BigInt(signatureYParity);
    if (
      parsed.type !== "legacy" ||
      parsed.chainId !== BSC_TESTNET_PTA_CHAIN_ID ||
      parsed.nonce !== validated.transaction.nonce ||
      parsed.to !== undefined ||
      (parsed.value ?? 0n) !== 0n ||
      parsed.gas !== validated.transaction.gasLimit ||
      parsed.gasPrice !== validated.transaction.gasPriceWei ||
      parsed.data !== validated.transaction.data ||
      signatureR === null ||
      signatureS === null ||
      signatureRValue === null ||
      signatureSValue === null ||
      signatureRValue <= 0n ||
      signatureRValue >= SECP256K1_ORDER ||
      signatureSValue <= 0n ||
      signatureSValue > SECP256K1_HALF_ORDER ||
      expectedV === null ||
      signatureYParity === null ||
      parsed.v !== expectedV
    ) {
      return null;
    }
    const canonicalSignedTransaction = serializeTransaction(parsed, {
      r: signatureR,
      s: signatureS,
      v: expectedV,
      yParity: signatureYParity
    });
    if (canonicalSignedTransaction !== raw) return null;
    const unsigned = serializeTransaction({
      chainId: BSC_TESTNET_PTA_CHAIN_ID,
      data: validated.transaction.data,
      gas: validated.transaction.gasLimit,
      gasPrice: validated.transaction.gasPriceWei,
      nonce: validated.transaction.nonce,
      type: "legacy",
      value: 0n
    });
    if (keccak256(unsigned) !== validated.signingHash) return null;
    const sender = await recoverTransactionAddress({
      serializedTransaction: canonicalSignedTransaction
    });
    if (sender !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS) return null;
    const target = getContractAddress({ from: sender, nonce: BigInt(validated.transaction.nonce) });
    if (target !== BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS) return null;
    return Object.freeze({
      schemaVersion: BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION,
      operation: BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
      status: "signed" as const,
      oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
      claimId: validated.claimId,
      requestHash: validated.requestHash,
      signingHash: validated.signingHash,
      signedTransaction: raw,
      transactionHash: keccak256(raw)
    });
  } catch {
    return null;
  }
}

function inspectPorts(input: unknown): BscTestnetPtaSigningWorkerPorts | null {
  const record = dataRecord(input);
  if (record === null || !hasExactKeys(record, ["now", "signExactTransaction"])) return null;
  return typeof record.now === "function" &&
    !isProxy(record.now) &&
    typeof record.signExactTransaction === "function" &&
    !isProxy(record.signExactTransaction)
    ? (record as unknown as BscTestnetPtaSigningWorkerPorts)
    : null;
}

function canonicalizeWorkerRequest(input: unknown): Buffer {
  const root = dataRecord(input);
  const transaction = root === null ? null : dataRecord(root.transaction);
  if (
    root === null ||
    transaction === null ||
    !hasExactKeys(root, WORKER_REQUEST_KEYS) ||
    !hasExactKeys(transaction, WORKER_TRANSACTION_KEYS)
  ) {
    throw new SigningWorkerFailure("INPUT_INVALID");
  }
  try {
    const snapshot: Record<string, unknown> = {};
    for (const key of WORKER_REQUEST_KEYS) {
      snapshot[key] =
        key === "transaction"
          ? Object.fromEntries(WORKER_TRANSACTION_KEYS.map((field) => [field, transaction[field]]))
          : root[key];
    }
    return Buffer.from(JSON.stringify(snapshot), "utf8");
  } catch {
    throw new SigningWorkerFailure("INPUT_INVALID");
  }
}

/**
 * Creates a one-request worker. Dependency injection exists only so tests can
 * prove the fail-closed protocol without opening the real custody directory.
 */
export function createBscTestnetPtaSigningWorkerForInternalUse(
  untrustedCustodyConfiguration: unknown,
  untrustedPorts: unknown
): BscTestnetPtaSigningWorker {
  const custody = parseBscTestnetDeployerCustodyConfiguration(untrustedCustodyConfiguration);
  const ports = inspectPorts(untrustedPorts);
  if (custody === null || ports === null) throw new SigningWorkerFailure("SIGNING_FAILED");
  let claimed = false;
  const executeCanonicalStdin = async (
    canonicalStdin: Uint8Array
  ): Promise<BscTestnetPtaSigningWorkerSignedResponse> => {
    let now: Date;
    try {
      now = ports.now();
    } catch {
      throw new SigningWorkerFailure("CLOCK_INVALID");
    }
    try {
      if (isProxy(now) || !(now instanceof Date) || Object.getPrototypeOf(now) !== Date.prototype) {
        throw new SigningWorkerFailure("CLOCK_INVALID");
      }
      const nowMilliseconds = Date.prototype.getTime.call(now);
      if (!Number.isSafeInteger(nowMilliseconds)) {
        throw new SigningWorkerFailure("CLOCK_INVALID");
      }
      const validated = parseWorkerInput(canonicalStdin, nowMilliseconds);
      if (validated === "expired") throw new SigningWorkerFailure("PAYLOAD_EXPIRED");
      if (validated === null) throw new SigningWorkerFailure("INPUT_INVALID");
      if (claimed) throw new SigningWorkerFailure("ALREADY_CLAIMED");
      // Claim before custody unlock. Any later ambiguity is deliberately non-retryable.
      claimed = true;
      const rawTransaction = await ports.signExactTransaction(custody, validated.transaction);
      const attested = await attestSignedTransaction(rawTransaction, validated);
      if (attested === null) throw new SigningWorkerFailure("SIGNED_TRANSACTION_INVALID");
      return attested;
    } catch (error) {
      if (error instanceof SigningWorkerFailure) throw error;
      throw new SigningWorkerFailure("SIGNING_FAILED");
    }
  };
  return Object.freeze({
    executeCanonicalStdin,
    invokeExactSigningWorker: (request: BscTestnetPtaSigningWorkerRequest) =>
      executeCanonicalStdin(canonicalizeWorkerRequest(request))
  });
}

/** Production composition for a single ephemeral Windows child process. */
export function createWindowsBscTestnetPtaSigningWorker(
  untrustedCustodyConfiguration: unknown
): BscTestnetPtaSigningWorker {
  return createBscTestnetPtaSigningWorkerForInternalUse(
    untrustedCustodyConfiguration,
    Object.freeze({
      now: () => new Date(),
      signExactTransaction: nativeWindowsSignExactTransaction
    })
  );
}
