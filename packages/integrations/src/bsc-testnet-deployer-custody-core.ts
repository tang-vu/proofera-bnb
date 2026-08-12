import { createDecipheriv, createECDH, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { isProxy } from "node:util/types";

import { getAddress, keccak256, type Address } from "viem";

export const BSC_TESTNET_DEPLOYER_CHAIN_ID = 97 as const;
export const BSC_TESTNET_DEPLOYER_ADDRESS =
  "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49" as const satisfies Address;

export const BSC_TESTNET_DEPLOYER_STORE_FILE =
  "UTC--2026-08-12T09-45-30.464Z--997cd959798f7c925076eaeff5855c5c2c1e5a49.keystore.json";
export const BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_FILE = "deployer-password.dpapi";
export const BSC_TESTNET_DEPLOYER_STORE_SHA256 =
  "2fade4c982e80078fedbffdca77035caedcc64d8bf34a021ccd04e515d0e90ab";
export const BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_SHA256 =
  "75e7897706247a619d8a0a8c7bfbaac74787180bdca6edd6ca29ad2d03accaf9";

const MAXIMUM_JSON_DEPTH = 16;
const MAXIMUM_JSON_NODES = 128;
const REQUIRED_PASSWORD_BYTES = 48;
const SCRYPT_DERIVED_KEY_BYTES = 32;
const SCRYPT_MAXIMUM_MEMORY_BYTES = 256 * 1024 * 1024;

export const BSC_TESTNET_DEPLOYER_NO_ACTION_BOUNDARY = Object.freeze({
  blockchainWrite: false,
  calldataCreated: false,
  privateKeyReturned: false,
  rpcRead: false,
  secretReturned: false,
  signatureCreated: false,
  signerCreated: false,
  transactionCreated: false,
  transactionSigned: false,
  transactionSubmitted: false
});

export type BscTestnetDeployerCustodyUnavailableReason =
  | "address_mismatch"
  | "closed"
  | "configuration_invalid"
  | "dpapi_unprotect_failed"
  | "encrypted_store_integrity_mismatch"
  | "encrypted_store_invalid"
  | "file_security_invalid"
  | "file_unavailable"
  | "operation_failed"
  | "powershell_integrity_mismatch"
  | "protected_blob_integrity_mismatch"
  | "subprocess_cleanup_unknown"
  | "unlock_failed"
  | "unsupported_platform";

export type BscTestnetDeployerCustodyReadiness =
  | Readonly<{
      address: typeof BSC_TESTNET_DEPLOYER_ADDRESS;
      boundary: typeof BSC_TESTNET_DEPLOYER_NO_ACTION_BOUNDARY;
      chainId: typeof BSC_TESTNET_DEPLOYER_CHAIN_ID;
      checks: Readonly<{
        addressMatch: true;
        encryptedStoreIntegrity: true;
        localAcl: true;
        mac: true;
        protectedBlobIntegrity: true;
        regularFiles: true;
        serverRuntime: true;
        web3SecretStorageV3: true;
        windowsCurrentUserDpapi: true;
      }>;
      custody: "web3-secret-storage-v3+windows-dpapi-current-user";
      evidence: "local_unlock_and_address_match_only";
      status: "ready";
    }>
  | Readonly<{
      address: null;
      boundary: typeof BSC_TESTNET_DEPLOYER_NO_ACTION_BOUNDARY;
      chainId: typeof BSC_TESTNET_DEPLOYER_CHAIN_ID;
      reason: BscTestnetDeployerCustodyUnavailableReason;
      status: "unavailable";
    }>;

export type BscTestnetDeployerCustodyCloseResult =
  Readonly<{ status: "closed" }> | Readonly<{ status: "cleanup_unknown" }>;

export interface BscTestnetDeployerCustodyProbe {
  readonly close: () => Promise<BscTestnetDeployerCustodyCloseResult>;
  readonly probeReadiness: () => Promise<BscTestnetDeployerCustodyReadiness>;
}

export interface BscTestnetDeployerCustodyConfiguration {
  readonly custodyDirectoryAbsolute: string;
}

export type ParsedBscTestnetDeployerCustodyConfiguration = Readonly<{
  custodyDirectoryAbsolute: string;
}>;

export type InternalCustodyProbeResult =
  | Readonly<{ status: "ready" }>
  | Readonly<{
      reason: Exclude<BscTestnetDeployerCustodyUnavailableReason, "closed">;
      status: "unavailable";
    }>;

export type InternalCustodyProbeOperation = (
  configuration: ParsedBscTestnetDeployerCustodyConfiguration,
  signal: AbortSignal
) => Promise<InternalCustodyProbeResult>;

type JsonRecord = Record<string, unknown>;

type ParsedEncryptedStore = Readonly<{
  address: string;
  cipherText: Buffer;
  iv: Buffer;
  mac: Buffer;
  salt: Buffer;
}>;

const READY_RESULT = Object.freeze({
  address: BSC_TESTNET_DEPLOYER_ADDRESS,
  boundary: BSC_TESTNET_DEPLOYER_NO_ACTION_BOUNDARY,
  chainId: BSC_TESTNET_DEPLOYER_CHAIN_ID,
  checks: Object.freeze({
    addressMatch: true as const,
    encryptedStoreIntegrity: true as const,
    localAcl: true as const,
    mac: true as const,
    protectedBlobIntegrity: true as const,
    regularFiles: true as const,
    serverRuntime: true as const,
    web3SecretStorageV3: true as const,
    windowsCurrentUserDpapi: true as const
  }),
  custody: "web3-secret-storage-v3+windows-dpapi-current-user" as const,
  evidence: "local_unlock_and_address_match_only" as const,
  status: "ready" as const
});

const CLOSED_RESULT = Object.freeze({ status: "closed" as const });
const CLEANUP_UNKNOWN_RESULT = Object.freeze({ status: "cleanup_unknown" as const });

function unavailable(
  reason: BscTestnetDeployerCustodyUnavailableReason
): BscTestnetDeployerCustodyReadiness {
  return Object.freeze({
    address: null,
    boundary: BSC_TESTNET_DEPLOYER_NO_ACTION_BOUNDARY,
    chainId: BSC_TESTNET_DEPLOYER_CHAIN_ID,
    reason,
    status: "unavailable" as const
  });
}

const INTERNAL_UNAVAILABLE_REASONS = new Set<BscTestnetDeployerCustodyUnavailableReason>([
  "address_mismatch",
  "configuration_invalid",
  "dpapi_unprotect_failed",
  "encrypted_store_integrity_mismatch",
  "encrypted_store_invalid",
  "file_security_invalid",
  "file_unavailable",
  "operation_failed",
  "powershell_integrity_mismatch",
  "protected_blob_integrity_mismatch",
  "subprocess_cleanup_unknown",
  "unlock_failed",
  "unsupported_platform"
]);

function parseInternalProbeResult(input: unknown): InternalCustodyProbeResult | null {
  const descriptors = dataDescriptors(input);
  if (descriptors === null) return null;
  if (hasExactKeys(descriptors, ["status"]) && descriptors.status?.value === "ready") {
    return Object.freeze({ status: "ready" as const });
  }
  const reason = descriptors.reason?.value;
  if (
    hasExactKeys(descriptors, ["reason", "status"]) &&
    descriptors.status?.value === "unavailable" &&
    typeof reason === "string" &&
    INTERNAL_UNAVAILABLE_REASONS.has(reason as BscTestnetDeployerCustodyUnavailableReason)
  ) {
    return Object.freeze({
      reason: reason as Exclude<BscTestnetDeployerCustodyUnavailableReason, "closed">,
      status: "unavailable" as const
    });
  }
  return null;
}

function dataDescriptors(input: unknown): PropertyDescriptorMap | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input) || isProxy(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(input).some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    return Object.values(descriptors).every(
      (descriptor) => "value" in descriptor && descriptor.enumerable === true
    )
      ? descriptors
      : null;
  } catch {
    return null;
  }
}

function hasExactKeys(descriptors: PropertyDescriptorMap, expected: readonly string[]): boolean {
  const actual = Object.keys(descriptors).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isCanonicalWindowsAbsolutePath(input: unknown): input is string {
  if (
    typeof input !== "string" ||
    input.length < 4 ||
    input.length > 1_024 ||
    input.trim() !== input ||
    !/^[A-Za-z]:\\/u.test(input) ||
    input.startsWith("\\\\") ||
    input.includes("/") ||
    input.includes("\u0000") ||
    /[\r\n]/u.test(input)
  ) {
    return false;
  }
  const segments = input.slice(3).split("\\");
  return (
    segments.length > 0 &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

export function parseBscTestnetDeployerCustodyConfiguration(
  input: unknown
): ParsedBscTestnetDeployerCustodyConfiguration | null {
  const descriptors = dataDescriptors(input);
  if (descriptors === null || !hasExactKeys(descriptors, ["custodyDirectoryAbsolute"])) {
    return null;
  }
  const custodyDirectoryAbsolute = descriptors.custodyDirectoryAbsolute?.value;
  if (!isCanonicalWindowsAbsolutePath(custodyDirectoryAbsolute)) {
    return null;
  }
  return Object.freeze({ custodyDirectoryAbsolute });
}

class StrictJsonParser {
  readonly #text: string;
  #index = 0;
  #nodes = 0;

  constructor(text: string) {
    this.#text = text;
  }

  parse(): unknown {
    const value = this.#parseValue(0);
    this.#skipWhitespace();
    if (this.#index !== this.#text.length) throw new Error("invalid JSON boundary");
    return value;
  }

  #countNode(depth: number): void {
    this.#nodes += 1;
    if (depth > MAXIMUM_JSON_DEPTH || this.#nodes > MAXIMUM_JSON_NODES) {
      throw new Error("JSON limits exceeded");
    }
  }

  #skipWhitespace(): void {
    while (/[\u0009\u000a\u000d\u0020]/u.test(this.#text[this.#index] ?? "")) {
      this.#index += 1;
    }
  }

  #parseValue(depth: number): unknown {
    this.#skipWhitespace();
    this.#countNode(depth);
    const character = this.#text[this.#index];
    if (character === "{") return this.#parseObject(depth + 1);
    if (character === "[") return this.#parseArray(depth + 1);
    if (character === '"') return this.#parseString();
    if (this.#text.startsWith("true", this.#index)) {
      this.#index += 4;
      return true;
    }
    if (this.#text.startsWith("false", this.#index)) {
      this.#index += 5;
      return false;
    }
    if (this.#text.startsWith("null", this.#index)) {
      this.#index += 4;
      return null;
    }
    const matched = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[Ee][+-]?[0-9]+)?/u.exec(
      this.#text.slice(this.#index)
    );
    if (matched === null) throw new Error("invalid JSON value");
    this.#index += matched[0].length;
    const number = Number(matched[0]);
    if (!Number.isFinite(number)) throw new Error("invalid JSON number");
    return number;
  }

  #parseObject(depth: number): JsonRecord {
    this.#index += 1;
    const result: JsonRecord = Object.create(null) as JsonRecord;
    const keys = new Set<string>();
    this.#skipWhitespace();
    if (this.#text[this.#index] === "}") {
      this.#index += 1;
      return result;
    }
    for (;;) {
      this.#skipWhitespace();
      if (this.#text[this.#index] !== '"') throw new Error("invalid JSON object key");
      const key = this.#parseString();
      if (keys.has(key)) throw new Error("duplicate JSON object key");
      keys.add(key);
      this.#skipWhitespace();
      if (this.#text[this.#index] !== ":") throw new Error("invalid JSON object separator");
      this.#index += 1;
      result[key] = this.#parseValue(depth);
      this.#skipWhitespace();
      const separator = this.#text[this.#index];
      if (separator === "}") {
        this.#index += 1;
        return result;
      }
      if (separator !== ",") throw new Error("invalid JSON object boundary");
      this.#index += 1;
    }
  }

  #parseArray(depth: number): unknown[] {
    this.#index += 1;
    const result: unknown[] = [];
    this.#skipWhitespace();
    if (this.#text[this.#index] === "]") {
      this.#index += 1;
      return result;
    }
    for (;;) {
      result.push(this.#parseValue(depth));
      this.#skipWhitespace();
      const separator = this.#text[this.#index];
      if (separator === "]") {
        this.#index += 1;
        return result;
      }
      if (separator !== ",") throw new Error("invalid JSON array boundary");
      this.#index += 1;
    }
  }

  #parseString(): string {
    const start = this.#index;
    this.#index += 1;
    let escaped = false;
    for (; this.#index < this.#text.length; this.#index += 1) {
      const character = this.#text[this.#index];
      if (!escaped && character === '"') {
        this.#index += 1;
        const value: unknown = JSON.parse(this.#text.slice(start, this.#index));
        if (typeof value !== "string") throw new Error("invalid JSON string");
        return value;
      }
      if (!escaped && character === "\\") {
        escaped = true;
        continue;
      }
      escaped = false;
      if (character !== undefined && character.charCodeAt(0) < 0x20) {
        throw new Error("invalid JSON string control character");
      }
    }
    throw new Error("unterminated JSON string");
  }
}

function isJsonRecord(input: unknown): input is JsonRecord {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasJsonKeys(input: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(input).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function decodeExactHex(input: unknown, bytes: number): Buffer | null {
  if (typeof input !== "string" || !new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`, "u").test(input)) {
    return null;
  }
  return Buffer.from(input, "hex");
}

export function parseBscTestnetDeployerEncryptedStore(
  bytes: Uint8Array,
  expectedAddress: Address = BSC_TESTNET_DEPLOYER_ADDRESS
): ParsedEncryptedStore | null {
  try {
    if (bytes.byteLength === 0 || bytes.byteLength > 65_536 || bytes[0] === 0xef) return null;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const root = new StrictJsonParser(text).parse();
    if (
      !isJsonRecord(root) ||
      !hasJsonKeys(root, ["address", "crypto", "id", "version"]) ||
      root.version !== 3 ||
      typeof root.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        root.id
      ) ||
      root.address !== expectedAddress.slice(2).toLowerCase() ||
      !isJsonRecord(root.crypto) ||
      !hasJsonKeys(root.crypto, [
        "cipher",
        "cipherparams",
        "ciphertext",
        "kdf",
        "kdfparams",
        "mac"
      ]) ||
      root.crypto.cipher !== "aes-128-ctr" ||
      root.crypto.kdf !== "scrypt" ||
      !isJsonRecord(root.crypto.cipherparams) ||
      !hasJsonKeys(root.crypto.cipherparams, ["iv"]) ||
      !isJsonRecord(root.crypto.kdfparams) ||
      !hasJsonKeys(root.crypto.kdfparams, ["dklen", "n", "p", "r", "salt"]) ||
      root.crypto.kdfparams.dklen !== SCRYPT_DERIVED_KEY_BYTES ||
      root.crypto.kdfparams.n !== 131_072 ||
      root.crypto.kdfparams.r !== 8 ||
      root.crypto.kdfparams.p !== 1
    ) {
      return null;
    }
    const cipherText = decodeExactHex(root.crypto.ciphertext, 32);
    const iv = decodeExactHex(root.crypto.cipherparams.iv, 16);
    const mac = decodeExactHex(root.crypto.mac, 32);
    const salt = decodeExactHex(root.crypto.kdfparams.salt, 32);
    if (cipherText === null || iv === null || mac === null || salt === null) return null;
    return Object.freeze({ address: root.address, cipherText, iv, mac, salt });
  } catch {
    return null;
  }
}

function deriveScryptKey(clearBytes: Uint8Array, salt: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      clearBytes,
      salt,
      SCRYPT_DERIVED_KEY_BYTES,
      { N: 131_072, maxmem: SCRYPT_MAXIMUM_MEMORY_BYTES, p: 1, r: 8 },
      (error, derivedKey) => {
        if (error !== null) {
          reject(new Error("scrypt failed"));
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

export async function unlockBscTestnetDeployerEncryptedStore(
  storeBytes: Uint8Array,
  clearBytes: Buffer,
  expectedAddress: Address = BSC_TESTNET_DEPLOYER_ADDRESS
): Promise<
  | Readonly<{ address: Address; status: "ready" }>
  | Readonly<{
      reason: "address_mismatch" | "encrypted_store_invalid" | "unlock_failed";
      status: "unavailable";
    }>
> {
  let parsed: ParsedEncryptedStore | null = null;
  let derivedKey: Buffer | null = null;
  let secretScalar: Buffer | null = null;
  let publicKey: Buffer | null = null;
  let ecdh: ReturnType<typeof createECDH> | null = null;
  try {
    let normalizedExpectedAddress: Address;
    try {
      normalizedExpectedAddress = getAddress(expectedAddress);
    } catch {
      return Object.freeze({ reason: "address_mismatch" as const, status: "unavailable" as const });
    }
    parsed = parseBscTestnetDeployerEncryptedStore(storeBytes, normalizedExpectedAddress);
    if (parsed === null) {
      return Object.freeze({
        reason: "encrypted_store_invalid" as const,
        status: "unavailable" as const
      });
    }
    if (clearBytes.byteLength !== REQUIRED_PASSWORD_BYTES) {
      return Object.freeze({ reason: "unlock_failed" as const, status: "unavailable" as const });
    }
    derivedKey = await deriveScryptKey(clearBytes, parsed.salt);
    const macMaterial = Buffer.concat([derivedKey.subarray(16, 32), parsed.cipherText]);
    const calculatedMac = Buffer.from(keccak256(macMaterial).slice(2), "hex");
    macMaterial.fill(0);
    const macMatches = timingSafeEqual(calculatedMac, parsed.mac);
    calculatedMac.fill(0);
    if (!macMatches) {
      return Object.freeze({ reason: "unlock_failed" as const, status: "unavailable" as const });
    }
    const decipher = createDecipheriv("aes-128-ctr", derivedKey.subarray(0, 16), parsed.iv);
    secretScalar = Buffer.concat([decipher.update(parsed.cipherText), decipher.final()]);
    if (secretScalar.byteLength !== 32) {
      return Object.freeze({ reason: "unlock_failed" as const, status: "unavailable" as const });
    }
    ecdh = createECDH("secp256k1");
    ecdh.setPrivateKey(secretScalar);
    publicKey = ecdh.getPublicKey(undefined, "uncompressed");
    if (publicKey.byteLength !== 65 || publicKey[0] !== 4) {
      return Object.freeze({ reason: "unlock_failed" as const, status: "unavailable" as const });
    }
    const publicHash = keccak256(publicKey.subarray(1));
    const address = getAddress(`0x${publicHash.slice(-40)}`);
    if (address !== normalizedExpectedAddress) {
      return Object.freeze({ reason: "address_mismatch" as const, status: "unavailable" as const });
    }
    return Object.freeze({ address: normalizedExpectedAddress, status: "ready" as const });
  } catch {
    return Object.freeze({ reason: "unlock_failed" as const, status: "unavailable" as const });
  } finally {
    clearBytes.fill(0);
    derivedKey?.fill(0);
    secretScalar?.fill(0);
    publicKey?.fill(0);
    parsed?.cipherText.fill(0);
    parsed?.iv.fill(0);
    parsed?.mac.fill(0);
    parsed?.salt.fill(0);
    if (ecdh !== null) {
      try {
        ecdh.setPrivateKey(Buffer.alloc(32, 1));
      } catch {
        // Process-local cryptographic state is not returned and is released after this scope.
      }
    }
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createBscTestnetDeployerCustodyProbeCore(
  configuration: ParsedBscTestnetDeployerCustodyConfiguration,
  operation: InternalCustodyProbeOperation
): BscTestnetDeployerCustodyProbe {
  let closed = false;
  let activeController: AbortController | null = null;
  let activeProbe: Promise<BscTestnetDeployerCustodyReadiness> | null = null;
  let cleanupUnknown = false;

  const probeReadiness = (): Promise<BscTestnetDeployerCustodyReadiness> => {
    if (closed) return Promise.resolve(unavailable("closed"));
    if (cleanupUnknown) return Promise.resolve(unavailable("subprocess_cleanup_unknown"));
    if (activeProbe !== null) return activeProbe;
    const controller = new AbortController();
    activeController = controller;
    const promise = Promise.resolve()
      .then(() =>
        controller.signal.aborted
          ? Object.freeze({ reason: "operation_failed" as const, status: "unavailable" as const })
          : operation(configuration, controller.signal)
      )
      .then((unparsedResult) => {
        const result = parseInternalProbeResult(unparsedResult);
        if (result === null) return unavailable("operation_failed");
        if (result.status === "unavailable" && result.reason === "subprocess_cleanup_unknown") {
          cleanupUnknown = true;
        }
        if (closed || controller.signal.aborted) return unavailable("closed");
        return result.status === "ready" ? READY_RESULT : unavailable(result.reason);
      })
      .catch(() => unavailable(closed ? "closed" : "operation_failed"))
      .finally(() => {
        if (activeProbe === promise) activeProbe = null;
        if (activeController === controller) activeController = null;
      });
    activeProbe = promise;
    return promise;
  };

  const close = async (): Promise<BscTestnetDeployerCustodyCloseResult> => {
    if (closed && activeProbe === null) {
      return cleanupUnknown ? CLEANUP_UNKNOWN_RESULT : CLOSED_RESULT;
    }
    closed = true;
    activeController?.abort();
    const pending = activeProbe;
    if (pending === null) return cleanupUnknown ? CLEANUP_UNKNOWN_RESULT : CLOSED_RESULT;
    const completed = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 12_000);
      void pending.then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    return completed && !cleanupUnknown ? CLOSED_RESULT : CLEANUP_UNKNOWN_RESULT;
  };

  return Object.freeze({ close, probeReadiness });
}
