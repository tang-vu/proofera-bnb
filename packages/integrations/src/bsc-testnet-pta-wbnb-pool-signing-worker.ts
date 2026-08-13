import "server-only";

import { execFile } from "node:child_process";
import { createDecipheriv, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import type { BigIntStats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import { secp256k1 } from "@noble/curves/secp256k1";
import {
  getAddress,
  keccak256,
  numberToHex,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
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
  assertPinnedDeterministicSigningRuntimeForInternalUse,
  normalizeCanonicalSignatureScalarForInternalUse
} from "./bsc-testnet-pta-signing-worker";
import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_BYTES,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_REQUEST_HASH_DOMAIN,
  validateBscTestnetPtaWbnbPoolSigningWorkerRequest,
  validateBscTestnetPtaWbnbPoolSigningWorkerResponse,
  type BscTestnetPtaWbnbPoolSigningWorkerRequest,
  type BscTestnetPtaWbnbPoolSigningWorkerResponse
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

const MAXIMUM_STDIN_BYTES = 32_768;
const MAXIMUM_JSON_DEPTH = 12;
const MAXIMUM_JSON_NODES = 128;
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
const HARD_MAX_GAS_LIMIT = BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT;
const HARD_MAX_GAS_PRICE_WEI = BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI;
const HARD_MAX_TOTAL_COST_WEI = BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WORKER_SOURCE_RELATIVE_PATH =
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-signing-worker.ts";
const PINNED_POWERSHELL_EXECUTABLE =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const PINNED_POWERSHELL_SHA256 = "9785001b0dcf755eddb8af294a373c0b87b2498660f724e76c4d53f9c217c7a3";
const PINNED_GIT_EXECUTABLE = "D:\\Git\\cmd\\git.exe";
const PINNED_GIT_EXECUTABLE_BYTES = 46_464;
const PINNED_GIT_SHA256 = "37c5725818d602e951ba2563b870d62763322956b73373da4c33a0b566a80bc9";
const PINNED_ORIGIN_REFERENCE = "refs/remotes/origin/main";
const RUNTIME_MANIFEST_DOMAIN = "ProofEra:bsc-testnet-pta-wbnb-pool-signing-runtime-manifest:v1";
const RELEASE_SOURCE_PATHS = Object.freeze([
  "packages/integrations/src/bsc-testnet-deployer-custody-core.ts",
  "packages/integrations/src/bsc-testnet-deployer-custody-windows.server.ts",
  "packages/integrations/src/bsc-testnet-pta-signing-worker.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-initialization.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-local-journal.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-protocol.ts",
  WORKER_SOURCE_RELATIVE_PATH,
  "packages/integrations/package.json",
  "pnpm-lock.yaml",
  "scripts/typescript-extension-loader.mjs"
]);

const LOCAL_APPLICATION_DATA_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$path = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if ([String]::IsNullOrWhiteSpace($path)) { exit 47 }
[Console]::Out.Write($path)
`;

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

export interface BscTestnetPtaWbnbPoolExactSigningTransaction {
  readonly data: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA;
  readonly gasLimit: bigint;
  readonly gasPriceWei: bigint;
  readonly nonce: typeof BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE;
  readonly signingNotAfterMilliseconds: number;
}

export interface BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust {
  readonly schemaVersion: 1;
  readonly releaseCommit: string;
  readonly originReference: typeof PINNED_ORIGIN_REFERENCE;
  readonly cleanPublishedHead: true;
  readonly workerSourceSha256: Hex;
  readonly runtimeManifestSha256: Hex;
}

export type BscTestnetPtaWbnbPoolSigningWorkerBlockedCode =
  | "ALREADY_CLAIMED"
  | "CLOCK_INVALID"
  | "CUSTODY_UNAVAILABLE"
  | "INPUT_INVALID"
  | "PAYLOAD_EXPIRED"
  | "PRODUCTION_AUTHORIZATION_UNAVAILABLE"
  | "RELEASE_TRUST_INVALID"
  | "SIGNED_TRANSACTION_INVALID"
  | "SIGNING_FAILED";

class PoolSigningWorkerFailure extends Error {
  override readonly name = "PoolSigningWorkerFailure";
  readonly code: BscTestnetPtaWbnbPoolSigningWorkerBlockedCode;

  constructor(code: BscTestnetPtaWbnbPoolSigningWorkerBlockedCode) {
    super("The exact BSC testnet PTA/WBNB pool signing operation failed closed.");
    this.code = code;
  }
}

type DataRecord = Readonly<Record<string, unknown>>;

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
  const actual = Object.keys(input);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
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
  let owned: Buffer | null = null;
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
    owned = Buffer.from(input);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(owned);
    const parsed: unknown = JSON.parse(text);
    const record = dataRecord(parsed);
    if (record === null || !withinJsonLimits(record) || JSON.stringify(record) !== text)
      return null;
    return record;
  } catch {
    return null;
  } finally {
    owned?.fill(0);
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

function validateExactTransaction(
  transaction: BscTestnetPtaWbnbPoolExactSigningTransaction
): boolean {
  return (
    transaction.nonce === BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE &&
    transaction.data === BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA &&
    (transaction.data.length - 2) / 2 === BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_BYTES &&
    keccak256(transaction.data) === BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256 &&
    transaction.gasLimit > 0n &&
    transaction.gasLimit <= HARD_MAX_GAS_LIMIT &&
    transaction.gasPriceWei > 0n &&
    transaction.gasPriceWei <= HARD_MAX_GAS_PRICE_WEI &&
    transaction.gasLimit * transaction.gasPriceWei <= HARD_MAX_TOTAL_COST_WEI &&
    Number.isSafeInteger(transaction.signingNotAfterMilliseconds)
  );
}

export function isBscTestnetPtaWbnbPoolSigningDeadlineCurrentForInternalUse(
  transaction: BscTestnetPtaWbnbPoolExactSigningTransaction,
  nowMilliseconds: number
): boolean {
  return (
    validateExactTransaction(transaction) &&
    Number.isSafeInteger(nowMilliseconds) &&
    nowMilliseconds < transaction.signingNotAfterMilliseconds
  );
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
          rejectPromise(new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE"));
          return;
        }
        resolvePromise(derivedKey);
      }
    );
  });
}

/**
 * Deterministic cryptographic seam for the single exact pool-initialization transaction.
 * noble-curves 1.9.1 uses RFC6979/HMAC-SHA256; low-S is mandatory and extra entropy is disabled.
 * The owned scalar is cleared on every outcome.
 */
export function reconstructExactBscTestnetPtaWbnbPoolRfc6979TransactionForInternalUse(
  secretScalar: Buffer,
  transaction: BscTestnetPtaWbnbPoolExactSigningTransaction
): Hex {
  let signingDigest: Buffer | null = null;
  try {
    if (secretScalar.byteLength !== 32 || !validateExactTransaction(transaction)) {
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const unsignedTransaction = {
      chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      gas: transaction.gasLimit,
      gasPrice: transaction.gasPriceWei,
      nonce: 1 as const,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
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
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    return serializeTransaction(unsignedTransaction, {
      r: numberToHex(signature.r, { size: 32 }),
      s: numberToHex(signature.s, { size: 32 }),
      v: signature.recovery === 0 ? 27n : 28n
    });
  } catch (error) {
    if (error instanceof PoolSigningWorkerFailure) throw error;
    throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
  } finally {
    signingDigest?.fill(0);
    secretScalar.fill(0);
  }
}

/** Both caller-owned secret-bearing buffers are consumed and cleared on every outcome. */
export async function signExactBscTestnetPtaWbnbPoolEncryptedStoreWithExpectedSignerForInternalUse(
  storeBytes: Buffer,
  passwordBytes: Buffer,
  transaction: BscTestnetPtaWbnbPoolExactSigningTransaction,
  expectedSigner: Address
): Promise<Hex> {
  let derivedKey: Buffer | null = null;
  let secretScalar: Buffer | null = null;
  let macMaterial: Buffer | null = null;
  let calculatedMac: Buffer | null = null;
  let publicKey: Buffer | null = null;
  let parsed: ReturnType<typeof parseBscTestnetDeployerEncryptedStore> = null;
  try {
    if (passwordBytes.byteLength !== PASSWORD_BYTES || !validateExactTransaction(transaction)) {
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    parsed = parseBscTestnetDeployerEncryptedStore(storeBytes, expectedSigner);
    if (parsed === null) throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    derivedKey = await deriveKey(passwordBytes, parsed.salt);
    macMaterial = Buffer.concat([derivedKey.subarray(16, 32), parsed.cipherText]);
    calculatedMac = Buffer.from(keccak256(macMaterial).slice(2), "hex");
    macMaterial.fill(0);
    macMaterial = null;
    const matches = timingSafeEqual(calculatedMac, parsed.mac);
    calculatedMac.fill(0);
    calculatedMac = null;
    if (!matches) throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    const decipher = createDecipheriv("aes-128-ctr", derivedKey.subarray(0, 16), parsed.iv);
    secretScalar = Buffer.concat([decipher.update(parsed.cipherText), decipher.final()]);
    if (secretScalar.byteLength !== 32) throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    if (!isBscTestnetPtaWbnbPoolSigningDeadlineCurrentForInternalUse(transaction, Date.now())) {
      throw new PoolSigningWorkerFailure("PAYLOAD_EXPIRED");
    }
    publicKey = Buffer.from(secp256k1.getPublicKey(secretScalar, false));
    const recoveredAddress = getAddress(`0x${keccak256(publicKey.subarray(1)).slice(-40)}`);
    publicKey.fill(0);
    publicKey = null;
    if (recoveredAddress !== expectedSigner) {
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    if (!isBscTestnetPtaWbnbPoolSigningDeadlineCurrentForInternalUse(transaction, Date.now())) {
      throw new PoolSigningWorkerFailure("PAYLOAD_EXPIRED");
    }
    const scalarForSigning = secretScalar;
    secretScalar = null;
    return reconstructExactBscTestnetPtaWbnbPoolRfc6979TransactionForInternalUse(
      scalarForSigning,
      transaction
    );
  } catch (error) {
    if (error instanceof PoolSigningWorkerFailure) throw error;
    throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
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

/** Production wrapper fixes the only accepted signer to the PTA deployer. */
export function signExactBscTestnetPtaWbnbPoolEncryptedStoreForInternalUse(
  storeBytes: Buffer,
  passwordBytes: Buffer,
  transaction: BscTestnetPtaWbnbPoolExactSigningTransaction
): Promise<Hex> {
  return signExactBscTestnetPtaWbnbPoolEncryptedStoreWithExpectedSignerForInternalUse(
    storeBytes,
    passwordBytes,
    transaction,
    BSC_TESTNET_PTA_WBNB_POOL_SENDER
  );
}

type FileSnapshot = Readonly<{
  birthtimeNanoseconds: bigint;
  changeTimeNanoseconds: bigint;
  device: bigint;
  inode: bigint;
  mode: bigint;
  modifiedTimeNanoseconds: bigint;
  links: bigint;
  size: bigint;
}>;

type StableFile = Readonly<{ bytes: Buffer; snapshot: FileSnapshot }>;

function snapshot(metadata: BigIntStats): FileSnapshot {
  return Object.freeze({
    birthtimeNanoseconds: metadata.birthtimeNs,
    changeTimeNanoseconds: metadata.ctimeNs,
    device: metadata.dev,
    inode: metadata.ino,
    mode: metadata.mode,
    modifiedTimeNanoseconds: metadata.mtimeNs,
    links: metadata.nlink,
    size: metadata.size
  });
}

function sameSnapshot(left: FileSnapshot, right: FileSnapshot): boolean {
  return (
    left.birthtimeNanoseconds === right.birthtimeNanoseconds &&
    left.changeTimeNanoseconds === right.changeTimeNanoseconds &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.modifiedTimeNanoseconds === right.modifiedTimeNanoseconds &&
    left.links === right.links &&
    left.size === right.size
  );
}

async function readStableRegularFile(
  path: string,
  maximumBytes: number,
  requireSingleLink = true,
  allowEmpty = false
): Promise<StableFile> {
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
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const before = snapshot(beforeMetadata);
    const bytes = await handle.readFile();
    const after = snapshot(await handle.stat({ bigint: true }));
    if (BigInt(bytes.byteLength) !== before.size || !sameSnapshot(before, after)) {
      bytes.fill(0);
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    return Object.freeze({ bytes, snapshot: before });
  } catch (error) {
    if (error instanceof PoolSigningWorkerFailure) throw error;
    throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function samePath(left: string, right: string): boolean {
  return win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase();
}

function isWithin(parent: string, candidate: string): boolean {
  const local = relative(parent, candidate);
  return local === "" || (!local.startsWith(`..${sep}`) && local !== ".." && !isAbsolute(local));
}

type PinnedCustodyPaths = Readonly<{
  protectedBlobPath: string;
  storePath: string;
}>;

async function inspectPinnedCustodyPaths(
  custody: ParsedBscTestnetDeployerCustodyConfiguration
): Promise<PinnedCustodyPaths> {
  const directory = custody.custodyDirectoryAbsolute;
  const storePath = join(directory, BSC_TESTNET_DEPLOYER_STORE_FILE);
  const protectedBlobPath = join(directory, BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_FILE);
  if (
    win32.basename(directory).toLowerCase() !== "bsc-testnet" ||
    win32.basename(win32.dirname(directory)).toLowerCase() !== "wallets" ||
    win32.basename(win32.dirname(win32.dirname(directory))).toLowerCase() !== "proofera" ||
    isWithin(REPOSITORY_ROOT, directory)
  ) {
    throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
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
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
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
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    return Object.freeze({ protectedBlobPath, storePath });
  } catch (error) {
    if (error instanceof PoolSigningWorkerFailure) throw error;
    throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
  }
}

async function resolveFixedLocalAppDataCustody(): Promise<ParsedBscTestnetDeployerCustodyConfiguration> {
  const input = Buffer.alloc(0);
  let output: Buffer | null = null;
  try {
    const result = await runPinnedPowerShellForInternalUse(
      LOCAL_APPLICATION_DATA_SCRIPT,
      input,
      512,
      new AbortController().signal
    );
    output = result.output;
    const localApplicationData = new TextDecoder("utf-8", { fatal: true }).decode(output);
    if (
      !/^[A-Za-z]:\\[^\0\r\n]+$/u.test(localApplicationData) ||
      localApplicationData.trim() !== localApplicationData ||
      win32.normalize(localApplicationData) !== localApplicationData
    ) {
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const custodyDirectoryAbsolute = win32.join(
      localApplicationData,
      "ProofEra",
      "wallets",
      "bsc-testnet"
    );
    const parsed = parseBscTestnetDeployerCustodyConfiguration({ custodyDirectoryAbsolute });
    if (parsed === null) throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    return parsed;
  } catch (error) {
    if (error instanceof PoolSigningWorkerFailure) throw error;
    throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

type CustodyBaseline = Readonly<{
  protectedBlob: FileSnapshot;
  store: FileSnapshot;
}>;

async function readAndVerifyPinnedCustody(
  paths: PinnedCustodyPaths,
  expected?: CustodyBaseline
): Promise<Readonly<{ baseline: CustodyBaseline; protectedBytes: Buffer; storeBytes: Buffer }>> {
  let protectedFile: StableFile | null = null;
  let storeFile: StableFile | null = null;
  let executableFile: StableFile | null = null;
  try {
    [storeFile, protectedFile, executableFile] = await Promise.all([
      readStableRegularFile(paths.storePath, MAXIMUM_STORE_BYTES),
      readStableRegularFile(paths.protectedBlobPath, MAXIMUM_PROTECTED_BLOB_BYTES),
      readStableRegularFile(PINNED_POWERSHELL_EXECUTABLE, 1_048_576, false)
    ]);
    if (
      sha256Hex(storeFile.bytes) !== BSC_TESTNET_DEPLOYER_STORE_SHA256 ||
      sha256Hex(protectedFile.bytes) !== BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_SHA256 ||
      sha256Hex(executableFile.bytes) !== PINNED_POWERSHELL_SHA256 ||
      (expected !== undefined &&
        (!sameSnapshot(storeFile.snapshot, expected.store) ||
          !sameSnapshot(protectedFile.snapshot, expected.protectedBlob)))
    ) {
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const result = Object.freeze({
      baseline: Object.freeze({
        protectedBlob: protectedFile.snapshot,
        store: storeFile.snapshot
      }),
      protectedBytes: protectedFile.bytes,
      storeBytes: storeFile.bytes
    });
    protectedFile = null;
    storeFile = null;
    return result;
  } catch (error) {
    protectedFile?.bytes.fill(0);
    storeFile?.bytes.fill(0);
    if (error instanceof PoolSigningWorkerFailure) throw error;
    throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
  } finally {
    executableFile?.bytes.fill(0);
  }
}

async function assertReadyCustody(
  custody: ParsedBscTestnetDeployerCustodyConfiguration,
  signal: AbortSignal
): Promise<void> {
  const readiness = await probeWindowsBscTestnetDeployerCustody(custody, signal);
  if (readiness.status !== "ready") throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
}

async function nativeWindowsSignExactPoolTransaction(
  transaction: BscTestnetPtaWbnbPoolExactSigningTransaction
): Promise<Hex> {
  if (process.platform !== "win32") throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
  if (!isBscTestnetPtaWbnbPoolSigningDeadlineCurrentForInternalUse(transaction, Date.now())) {
    throw new PoolSigningWorkerFailure("PAYLOAD_EXPIRED");
  }
  const signal = new AbortController().signal;
  let storeBytes: Buffer | null = null;
  let protectedBytes: Buffer | null = null;
  let passwordBytes: Buffer | null = null;
  let rawTransaction: Hex | null = null;
  try {
    await assertPinnedDeterministicSigningRuntimeForInternalUse();
    const custody = await resolveFixedLocalAppDataCustody();
    await assertReadyCustody(custody, signal);
    const paths = await inspectPinnedCustodyPaths(custody);
    const before = await readAndVerifyPinnedCustody(paths);
    storeBytes = before.storeBytes;
    protectedBytes = before.protectedBytes;
    const unprotected = await runPinnedPowerShellForInternalUse(
      DPAPI_UNPROTECT_SCRIPT,
      protectedBytes,
      PASSWORD_BYTES,
      signal
    );
    passwordBytes = unprotected.output;
    if (passwordBytes.byteLength !== PASSWORD_BYTES) {
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    rawTransaction = await signExactBscTestnetPtaWbnbPoolEncryptedStoreForInternalUse(
      storeBytes,
      passwordBytes,
      transaction
    );
    storeBytes = null;
    passwordBytes = null;

    await assertReadyCustody(custody, signal);
    const afterPaths = await inspectPinnedCustodyPaths(custody);
    if (
      !samePath(afterPaths.storePath, paths.storePath) ||
      !samePath(afterPaths.protectedBlobPath, paths.protectedBlobPath)
    ) {
      throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
    }
    const after = await readAndVerifyPinnedCustody(afterPaths, before.baseline);
    after.storeBytes.fill(0);
    after.protectedBytes.fill(0);
    await assertPinnedDeterministicSigningRuntimeForInternalUse();
    if (!isBscTestnetPtaWbnbPoolSigningDeadlineCurrentForInternalUse(transaction, Date.now())) {
      throw new PoolSigningWorkerFailure("PAYLOAD_EXPIRED");
    }
    return rawTransaction;
  } catch (error) {
    if (error instanceof PoolSigningWorkerFailure) throw error;
    throw new PoolSigningWorkerFailure("CUSTODY_UNAVAILABLE");
  } finally {
    storeBytes?.fill(0);
    protectedBytes?.fill(0);
    passwordBytes?.fill(0);
  }
}

function executePinnedGit(arguments_: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      PINNED_GIT_EXECUTABLE,
      ["-C", REPOSITORY_ROOT, ...arguments_],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: {
          GIT_CONFIG_GLOBAL: "NUL",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_OPTIONAL_LOCKS: "0",
          LC_ALL: "C",
          SystemRoot: "C:\\Windows",
          WINDIR: "C:\\Windows"
        },
        maxBuffer: 4_096,
        shell: false,
        timeout: 5_000,
        windowsHide: true
      },
      (error, stdout) => {
        if (error !== null || Buffer.byteLength(stdout, "utf8") > 4_096) {
          rejectPromise(new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID"));
          return;
        }
        resolvePromise(stdout.trim());
      }
    );
  });
}

async function assertPinnedGitExecutable(): Promise<void> {
  let executable: StableFile | null = null;
  try {
    const [metadata, canonicalPath] = await Promise.all([
      lstat(PINNED_GIT_EXECUTABLE),
      realpath(PINNED_GIT_EXECUTABLE)
    ]);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size !== PINNED_GIT_EXECUTABLE_BYTES ||
      !samePath(canonicalPath, PINNED_GIT_EXECUTABLE)
    ) {
      throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
    }
    executable = await readStableRegularFile(PINNED_GIT_EXECUTABLE, 1_048_576, false);
    if (sha256Hex(executable.bytes) !== PINNED_GIT_SHA256) {
      throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
    }
  } catch (error) {
    if (error instanceof PoolSigningWorkerFailure) throw error;
    throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
  } finally {
    executable?.bytes.fill(0);
  }
}

async function deriveReleaseSourceManifest(
  releaseCommit: string
): Promise<Readonly<{ runtimeManifestSha256: Hex; workerSourceSha256: Hex }>> {
  const digest = createHash("sha256");
  digest.update(`${RUNTIME_MANIFEST_DOMAIN}\u0000${releaseCommit}\u0000`, "utf8");
  let workerSourceSha256: Hex | null = null;
  for (const relativePath of RELEASE_SOURCE_PATHS) {
    const absolutePath = resolve(REPOSITORY_ROOT, ...relativePath.split("/"));
    const canonicalPath = await realpath(absolutePath);
    if (!isWithin(REPOSITORY_ROOT, canonicalPath)) {
      throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
    }
    const file = await readStableRegularFile(absolutePath, 16 * 1024 * 1024, false, true);
    const pathBytes = Buffer.from(relativePath, "utf8");
    const frame = Buffer.alloc(12);
    try {
      const expectedBlobOid = await executePinnedGit([
        "rev-parse",
        `${releaseCommit}:${relativePath}`
      ]);
      if (!/^[0-9a-f]{40}$/u.test(expectedBlobOid)) {
        throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
      }
      const exactBlobOid = createHash("sha1")
        .update(`blob ${file.bytes.byteLength}\0`, "utf8")
        .update(file.bytes)
        .digest("hex");
      let normalizedBlobOid: string | null = null;
      if (file.bytes.includes(0x0d)) {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
        const normalized = text.replace(/\r\n/gu, "\n");
        if (normalized.includes("\r")) {
          throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
        }
        const normalizedBytes = Buffer.from(normalized, "utf8");
        normalizedBlobOid = createHash("sha1")
          .update(`blob ${normalizedBytes.byteLength}\0`, "utf8")
          .update(normalizedBytes)
          .digest("hex");
        normalizedBytes.fill(0);
      }
      if (expectedBlobOid !== exactBlobOid && expectedBlobOid !== normalizedBlobOid) {
        throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
      }
      frame.writeUInt32BE(pathBytes.byteLength, 0);
      frame.writeBigUInt64BE(BigInt(file.bytes.byteLength), 4);
      digest.update(frame);
      digest.update(pathBytes);
      digest.update(file.bytes);
      if (relativePath === WORKER_SOURCE_RELATIVE_PATH) {
        workerSourceSha256 = `0x${createHash("sha256").update(file.bytes).digest("hex")}`;
      }
    } finally {
      frame.fill(0);
      pathBytes.fill(0);
      file.bytes.fill(0);
    }
  }
  if (workerSourceSha256 === null) {
    throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
  }
  digest.update(`\u0000node:${process.version}\u0000`, "utf8");
  return Object.freeze({
    runtimeManifestSha256: `0x${digest.digest("hex")}`,
    workerSourceSha256
  });
}

/**
 * Returns the exact child runtime/source identity only when the checkout is clean and HEAD equals
 * the already-fetched origin/main reference. This performs no fetch and makes no network request.
 */
export async function inspectBscTestnetPtaWbnbPoolSigningWorkerReleaseTrustForInternalUse(): Promise<BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust> {
  try {
    await assertPinnedGitExecutable();
    await assertPinnedDeterministicSigningRuntimeForInternalUse();
    const [root, releaseCommit, publishedCommit, status, objectFormat] = await Promise.all([
      executePinnedGit(["rev-parse", "--show-toplevel"]),
      executePinnedGit(["rev-parse", "--verify", "HEAD"]),
      executePinnedGit(["rev-parse", "--verify", PINNED_ORIGIN_REFERENCE]),
      executePinnedGit(["status", "--porcelain=v1", "--untracked-files=normal"]),
      executePinnedGit(["rev-parse", "--show-object-format"])
    ]);
    if (
      !samePath(root, REPOSITORY_ROOT) ||
      objectFormat !== "sha1" ||
      !/^[0-9a-f]{40}$/u.test(releaseCommit) ||
      publishedCommit !== releaseCommit ||
      status !== ""
    ) {
      throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
    }
    const manifest = await deriveReleaseSourceManifest(releaseCommit);
    const [releaseCommitAfter, publishedCommitAfter, statusAfter] = await Promise.all([
      executePinnedGit(["rev-parse", "--verify", "HEAD"]),
      executePinnedGit(["rev-parse", "--verify", PINNED_ORIGIN_REFERENCE]),
      executePinnedGit(["status", "--porcelain=v1", "--untracked-files=normal"])
    ]);
    if (
      releaseCommitAfter !== releaseCommit ||
      publishedCommitAfter !== releaseCommit ||
      statusAfter !== ""
    ) {
      throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
    }
    return Object.freeze({
      schemaVersion: 1 as const,
      releaseCommit,
      originReference: PINNED_ORIGIN_REFERENCE,
      cleanPublishedHead: true as const,
      workerSourceSha256: manifest.workerSourceSha256,
      runtimeManifestSha256: manifest.runtimeManifestSha256
    });
  } catch (error) {
    if (error instanceof PoolSigningWorkerFailure) throw error;
    throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
  }
}

function sameReleaseTrust(
  left: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust,
  right: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust
): boolean {
  return (
    left.schemaVersion === 1 &&
    right.schemaVersion === 1 &&
    left.releaseCommit === right.releaseCommit &&
    left.originReference === PINNED_ORIGIN_REFERENCE &&
    right.originReference === PINNED_ORIGIN_REFERENCE &&
    left.cleanPublishedHead === true &&
    right.cleanPublishedHead === true &&
    left.workerSourceSha256 === right.workerSourceSha256 &&
    left.runtimeManifestSha256 === right.runtimeManifestSha256
  );
}

const WORKER_REQUEST_KEYS = [
  "schemaVersion",
  "operation",
  "environment",
  "chainId",
  "oneShotIntentId",
  "operationKey",
  "claimId",
  "journalClaimToken",
  "releaseCommit",
  "runtimeManifestSha256",
  "reviewerApprovalDigest",
  "ownerAuthorizationDigest",
  "authenticatedAt",
  "expiresAt",
  "transaction",
  "requestHashDomain",
  "requestHash"
] as const;

const WORKER_TRANSACTION_KEYS = [
  "type",
  "eip155ReplayProtection",
  "from",
  "to",
  "nonce",
  "valueWei",
  "gasLimit",
  "gasPriceWei",
  "maximumCostWei",
  "data",
  "serializedUnsignedTransaction",
  "signingHash",
  "sourceEnvelopeHash"
] as const;

type ValidatedWorkerInput = Readonly<{
  request: BscTestnetPtaWbnbPoolSigningWorkerRequest;
  transaction: BscTestnetPtaWbnbPoolExactSigningTransaction;
}>;

function canonicalRequestSnapshot(
  input: unknown
): BscTestnetPtaWbnbPoolSigningWorkerRequest | null {
  const root = dataRecord(input);
  const transaction = root === null ? null : dataRecord(root.transaction);
  if (
    root === null ||
    transaction === null ||
    !hasExactKeys(root, WORKER_REQUEST_KEYS) ||
    !hasExactKeys(transaction, WORKER_TRANSACTION_KEYS)
  ) {
    return null;
  }
  const transactionSnapshot = Object.fromEntries(
    WORKER_TRANSACTION_KEYS.map((key) => [key, transaction[key]])
  );
  const requestSnapshot = Object.fromEntries(
    WORKER_REQUEST_KEYS.map((key) => [key, key === "transaction" ? transactionSnapshot : root[key]])
  );
  return requestSnapshot as unknown as BscTestnetPtaWbnbPoolSigningWorkerRequest;
}

function parseWorkerInput(
  canonicalStdin: Uint8Array,
  now: Date
): ValidatedWorkerInput | "expired" | null {
  const root = parseCanonicalJson(canonicalStdin);
  const canonical = root === null ? null : canonicalRequestSnapshot(root);
  if (canonical === null) return null;
  const canonicalBytes = Buffer.from(JSON.stringify(canonical), "utf8");
  try {
    if (
      canonicalBytes.byteLength !== canonicalStdin.byteLength ||
      !timingSafeEqual(canonicalBytes, canonicalStdin)
    ) {
      return null;
    }
  } finally {
    canonicalBytes.fill(0);
  }
  const validation = validateBscTestnetPtaWbnbPoolSigningWorkerRequest(canonical, now);
  if (validation.status !== "valid") {
    return validation.issue.code === "CAPABILITY_EXPIRED" ? "expired" : null;
  }
  const request = validation.request;
  const gasLimit = canonicalUint(request.transaction.gasLimit, HARD_MAX_GAS_LIMIT);
  const gasPriceWei = canonicalUint(request.transaction.gasPriceWei, HARD_MAX_GAS_PRICE_WEI);
  const maximumCostWei = canonicalUint(request.transaction.maximumCostWei, HARD_MAX_TOTAL_COST_WEI);
  const authenticatedAtMilliseconds = exactUtcMilliseconds(request.authenticatedAt);
  const expiresAtMilliseconds = exactUtcMilliseconds(request.expiresAt);
  const signingHash = exactLowerHex(request.transaction.signingHash, 32);
  const serializedUnsigned = exactLowerHex(request.transaction.serializedUnsignedTransaction);
  if (
    request.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION ||
    request.operation !== BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION ||
    request.oneShotIntentId !== BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID ||
    request.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    request.requestHashDomain !== BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_REQUEST_HASH_DOMAIN ||
    !exactAddress(request.transaction.from, BSC_TESTNET_PTA_WBNB_POOL_SENDER) ||
    !exactAddress(request.transaction.to, BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER) ||
    request.transaction.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
    gasLimit === null ||
    gasLimit === 0n ||
    gasPriceWei === null ||
    gasPriceWei === 0n ||
    maximumCostWei === null ||
    maximumCostWei !== gasLimit * gasPriceWei ||
    authenticatedAtMilliseconds === null ||
    expiresAtMilliseconds === null ||
    signingHash === null ||
    serializedUnsigned === null
  ) {
    return null;
  }
  const rebuiltUnsigned = serializeTransaction({
    chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    gas: gasLimit,
    gasPrice: gasPriceWei,
    nonce: 1,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    type: "legacy",
    value: 0n
  });
  if (rebuiltUnsigned !== serializedUnsigned || keccak256(rebuiltUnsigned) !== signingHash) {
    return null;
  }
  const transaction = Object.freeze({
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    gasLimit,
    gasPriceWei,
    nonce: BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
    signingNotAfterMilliseconds: Math.min(
      expiresAtMilliseconds,
      authenticatedAtMilliseconds + 30_000
    )
  });
  if (!validateExactTransaction(transaction)) return null;
  return Object.freeze({ request, transaction });
}

export type BscTestnetPtaWbnbPoolSignedTransactionInspection = Readonly<{
  serializedTransaction: Hex;
  transactionHash: Hex;
  recoveredSigner: Address;
}>;

/**
 * Testable verification-only seam. It never reads custody and cannot sign, select, or broadcast a
 * transaction. Production always supplies the fixed PTA sender as `expectedSigner`.
 */
export async function inspectExactBscTestnetPtaWbnbPoolSignedTransactionForInternalUse(
  rawTransaction: unknown,
  transaction: BscTestnetPtaWbnbPoolExactSigningTransaction,
  expectedSigner: Address
): Promise<BscTestnetPtaWbnbPoolSignedTransactionInspection | null> {
  try {
    if (!validateExactTransaction(transaction)) return null;
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
        : BigInt(BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID) * 2n + 35n + BigInt(signatureYParity);
    let parsedTarget: Address | null = null;
    try {
      parsedTarget = parsed.to == null ? null : getAddress(parsed.to);
    } catch {
      parsedTarget = null;
    }
    if (
      parsed.type !== "legacy" ||
      parsed.chainId !== BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID ||
      parsed.nonce !== Number(BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE) ||
      parsedTarget !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
      (parsed.value ?? 0n) !== 0n ||
      parsed.gas !== transaction.gasLimit ||
      parsed.gasPrice !== transaction.gasPriceWei ||
      parsed.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
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
    const canonicalSignedTransaction = serializeTransaction(
      {
        chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
        data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
        gas: transaction.gasLimit,
        gasPrice: transaction.gasPriceWei,
        nonce: 1,
        to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
        type: "legacy",
        value: 0n
      },
      { r: signatureR, s: signatureS, v: expectedV }
    );
    if (canonicalSignedTransaction !== raw) return null;
    const recoveredSigner = getAddress(
      await recoverTransactionAddress({ serializedTransaction: canonicalSignedTransaction })
    );
    return recoveredSigner === expectedSigner
      ? Object.freeze({
          serializedTransaction: canonicalSignedTransaction,
          transactionHash: keccak256(canonicalSignedTransaction),
          recoveredSigner
        })
      : null;
  } catch {
    return null;
  }
}

async function attestSignedTransaction(
  rawTransaction: unknown,
  validated: ValidatedWorkerInput
): Promise<BscTestnetPtaWbnbPoolSigningWorkerResponse | null> {
  try {
    const inspected = await inspectExactBscTestnetPtaWbnbPoolSignedTransactionForInternalUse(
      rawTransaction,
      validated.transaction,
      BSC_TESTNET_PTA_WBNB_POOL_SENDER
    );
    if (inspected === null) return null;
    const unsigned = serializeTransaction({
      chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      gas: validated.transaction.gasLimit,
      gasPrice: validated.transaction.gasPriceWei,
      nonce: 1,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      type: "legacy",
      value: 0n
    });
    if (
      unsigned !== validated.request.transaction.serializedUnsignedTransaction ||
      keccak256(unsigned) !== validated.request.transaction.signingHash
    ) {
      return null;
    }
    const response = Object.freeze({
      schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION,
      operation: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
      status: "signed" as const,
      oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      claimId: validated.request.claimId,
      journalClaimToken: validated.request.journalClaimToken,
      releaseCommit: validated.request.releaseCommit,
      runtimeManifestSha256: validated.request.runtimeManifestSha256,
      requestHash: validated.request.requestHash,
      signingHash: validated.request.transaction.signingHash,
      signedTransaction: inspected.serializedTransaction,
      transactionHash: inspected.transactionHash
    });
    const protocolValidation = await validateBscTestnetPtaWbnbPoolSigningWorkerResponse(
      response,
      validated.request
    );
    return protocolValidation.status === "valid" ? response : null;
  } catch {
    return null;
  }
}

export interface BscTestnetPtaWbnbPoolSigningWorkerPorts {
  readonly now: () => Date;
  readonly inspectReleaseTrust: () => Promise<BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust>;
  readonly consumeWorkerAuthorization: (
    request: BscTestnetPtaWbnbPoolSigningWorkerRequest
  ) => Promise<Readonly<{ status: "worker_started" }>>;
  readonly commitSignedTransaction: (
    request: BscTestnetPtaWbnbPoolSigningWorkerRequest,
    response: BscTestnetPtaWbnbPoolSigningWorkerResponse
  ) => Promise<Readonly<{ status: "signed_committed" }>>;
  readonly attestExactTransaction: (
    rawTransaction: Hex,
    request: BscTestnetPtaWbnbPoolSigningWorkerRequest,
    transaction: BscTestnetPtaWbnbPoolExactSigningTransaction
  ) => Promise<BscTestnetPtaWbnbPoolSigningWorkerResponse | null>;
  readonly signExactTransaction: (
    transaction: BscTestnetPtaWbnbPoolExactSigningTransaction
  ) => Promise<Hex>;
}

export interface BscTestnetPtaWbnbPoolSigningWorker {
  /** A worker instance accepts at most one exact, valid, journal-bound request. */
  readonly executeCanonicalStdin: (
    canonicalStdin: Uint8Array
  ) => Promise<BscTestnetPtaWbnbPoolSigningWorkerResponse>;
  readonly invokeExactSigningWorker: (
    request: BscTestnetPtaWbnbPoolSigningWorkerRequest
  ) => Promise<BscTestnetPtaWbnbPoolSigningWorkerResponse>;
}

function inspectReleaseTrust(
  value: unknown
): BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust | null {
  const record = dataRecord(value);
  if (
    record === null ||
    !hasExactKeys(record, [
      "schemaVersion",
      "releaseCommit",
      "originReference",
      "cleanPublishedHead",
      "workerSourceSha256",
      "runtimeManifestSha256"
    ]) ||
    record.schemaVersion !== 1 ||
    typeof record.releaseCommit !== "string" ||
    !/^[0-9a-f]{40}$/u.test(record.releaseCommit) ||
    record.originReference !== PINNED_ORIGIN_REFERENCE ||
    record.cleanPublishedHead !== true ||
    exactLowerHex(record.workerSourceSha256, 32) === null ||
    exactLowerHex(record.runtimeManifestSha256, 32) === null
  ) {
    return null;
  }
  return record as unknown as BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust;
}

function inspectPorts(input: unknown): BscTestnetPtaWbnbPoolSigningWorkerPorts | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !hasExactKeys(record, [
      "now",
      "inspectReleaseTrust",
      "consumeWorkerAuthorization",
      "commitSignedTransaction",
      "attestExactTransaction",
      "signExactTransaction"
    ])
  ) {
    return null;
  }
  return typeof record.now === "function" &&
    !isProxy(record.now) &&
    typeof record.inspectReleaseTrust === "function" &&
    !isProxy(record.inspectReleaseTrust) &&
    typeof record.consumeWorkerAuthorization === "function" &&
    !isProxy(record.consumeWorkerAuthorization) &&
    typeof record.commitSignedTransaction === "function" &&
    !isProxy(record.commitSignedTransaction) &&
    typeof record.attestExactTransaction === "function" &&
    !isProxy(record.attestExactTransaction) &&
    typeof record.signExactTransaction === "function" &&
    !isProxy(record.signExactTransaction)
    ? (record as unknown as BscTestnetPtaWbnbPoolSigningWorkerPorts)
    : null;
}

function captureExactDate(clock: () => Date): Date {
  let date: Date;
  try {
    date = clock();
  } catch {
    throw new PoolSigningWorkerFailure("CLOCK_INVALID");
  }
  try {
    if (
      isProxy(date) ||
      !(date instanceof Date) ||
      Object.getPrototypeOf(date) !== Date.prototype ||
      Reflect.ownKeys(date).length !== 0 ||
      !Number.isSafeInteger(Date.prototype.getTime.call(date))
    ) {
      throw new PoolSigningWorkerFailure("CLOCK_INVALID");
    }
    return date;
  } catch (error) {
    if (error instanceof PoolSigningWorkerFailure) throw error;
    throw new PoolSigningWorkerFailure("CLOCK_INVALID");
  }
}

function canonicalizeWorkerRequest(input: unknown): Buffer {
  const snapshot = canonicalRequestSnapshot(input);
  if (snapshot === null) throw new PoolSigningWorkerFailure("INPUT_INVALID");
  try {
    return Buffer.from(JSON.stringify(snapshot), "utf8");
  } catch {
    throw new PoolSigningWorkerFailure("INPUT_INVALID");
  }
}

/** Test composition only; it cannot select a transaction or custody path. */
/** Test-only composition: injected signers cannot reach the private production custody function. */
export function createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
  untrustedPorts: unknown
): BscTestnetPtaWbnbPoolSigningWorker {
  const ports = inspectPorts(untrustedPorts);
  if (ports === null) throw new PoolSigningWorkerFailure("SIGNING_FAILED");
  let claimed = false;
  const executeCanonicalStdin = async (
    canonicalStdin: Uint8Array
  ): Promise<BscTestnetPtaWbnbPoolSigningWorkerResponse> => {
    try {
      const now = captureExactDate(ports.now);
      const validated = parseWorkerInput(canonicalStdin, now);
      if (validated === "expired") throw new PoolSigningWorkerFailure("PAYLOAD_EXPIRED");
      if (validated === null) throw new PoolSigningWorkerFailure("INPUT_INVALID");
      const actualBefore = inspectReleaseTrust(await ports.inspectReleaseTrust());
      if (
        actualBefore === null ||
        actualBefore.releaseCommit !== validated.request.releaseCommit ||
        actualBefore.runtimeManifestSha256 !== validated.request.runtimeManifestSha256
      ) {
        throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
      }
      if (
        !isBscTestnetPtaWbnbPoolSigningDeadlineCurrentForInternalUse(
          validated.transaction,
          Date.prototype.getTime.call(captureExactDate(ports.now))
        )
      ) {
        throw new PoolSigningWorkerFailure("PAYLOAD_EXPIRED");
      }
      if (claimed) throw new PoolSigningWorkerFailure("ALREADY_CLAIMED");
      claimed = true;
      const durableStart = await ports.consumeWorkerAuthorization(validated.request);
      const durableStartRecord = dataRecord(durableStart);
      if (
        durableStartRecord === null ||
        !hasExactKeys(durableStartRecord, ["status"]) ||
        durableStartRecord.status !== "worker_started"
      ) {
        throw new PoolSigningWorkerFailure("SIGNING_FAILED");
      }
      // The durable start is terminal before any custody access; ambiguity is non-retryable.
      if (
        !isBscTestnetPtaWbnbPoolSigningDeadlineCurrentForInternalUse(
          validated.transaction,
          Date.prototype.getTime.call(captureExactDate(ports.now))
        )
      ) {
        throw new PoolSigningWorkerFailure("PAYLOAD_EXPIRED");
      }
      const rawTransaction = await ports.signExactTransaction(validated.transaction);
      const attested = await ports.attestExactTransaction(
        rawTransaction,
        validated.request,
        validated.transaction
      );
      if (attested === null) throw new PoolSigningWorkerFailure("SIGNED_TRANSACTION_INVALID");
      const actualBeforeCommit = inspectReleaseTrust(await ports.inspectReleaseTrust());
      if (actualBeforeCommit === null || !sameReleaseTrust(actualBefore, actualBeforeCommit)) {
        throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
      }
      const durableCommit = await ports.commitSignedTransaction(validated.request, attested);
      const durableCommitRecord = dataRecord(durableCommit);
      if (
        durableCommitRecord === null ||
        !hasExactKeys(durableCommitRecord, ["status"]) ||
        durableCommitRecord.status !== "signed_committed"
      ) {
        throw new PoolSigningWorkerFailure("SIGNING_FAILED");
      }
      const actualAfter = inspectReleaseTrust(await ports.inspectReleaseTrust());
      if (actualAfter === null || !sameReleaseTrust(actualBefore, actualAfter)) {
        throw new PoolSigningWorkerFailure("RELEASE_TRUST_INVALID");
      }
      return attested;
    } catch (error) {
      if (error instanceof PoolSigningWorkerFailure) throw error;
      throw new PoolSigningWorkerFailure("SIGNING_FAILED");
    }
  };
  return Object.freeze({
    executeCanonicalStdin,
    invokeExactSigningWorker: async (request: BscTestnetPtaWbnbPoolSigningWorkerRequest) => {
      const canonical = canonicalizeWorkerRequest(request);
      try {
        return await executeCanonicalStdin(canonical);
      } finally {
        canonical.fill(0);
      }
    }
  });
}

// Reviewed future production building blocks remain deliberately unreachable until a nominal
// reviewer+owner authority issuer exists. These anchors do not invoke either function.
void nativeWindowsSignExactPoolTransaction;
void attestSignedTransaction;

/** Non-executable production boundary for this release. It accepts no path or transaction. */
export async function createWindowsBscTestnetPtaWbnbPoolSigningWorker(): Promise<BscTestnetPtaWbnbPoolSigningWorker> {
  // No production issuer currently exists for the nominal reviewer+owner authority capability.
  // Public JSON/journal contents are not authority. Keep this release non-executable before any
  // journal, release, clock, custody, DPAPI, signer, signature, RPC, or broadcast operation.
  throw new PoolSigningWorkerFailure("PRODUCTION_AUTHORIZATION_UNAVAILABLE");
}
