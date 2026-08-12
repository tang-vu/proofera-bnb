import { createCipheriv, createECDH, scryptSync } from "node:crypto";

import { getAddress, keccak256, type Address } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  BSC_TESTNET_DEPLOYER_ADDRESS,
  BSC_TESTNET_DEPLOYER_CHAIN_ID,
  createBscTestnetDeployerCustodyProbeCore,
  parseBscTestnetDeployerCustodyConfiguration,
  parseBscTestnetDeployerEncryptedStore,
  unlockBscTestnetDeployerEncryptedStore,
  type InternalCustodyProbeOperation
} from "./bsc-testnet-deployer-custody-core";

const VALID_CONFIGURATION = Object.freeze({
  custodyDirectoryAbsolute: "C:\\Users\\fixture\\ProofEra\\wallets\\bsc-testnet"
});

type Fixture = Readonly<{
  address: Address;
  clearBytes: Buffer;
  storeBytes: Buffer;
}>;

function addressFromScalar(scalar: Uint8Array): Address {
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(scalar);
  const publicKey = ecdh.getPublicKey(undefined, "uncompressed");
  const address = getAddress(`0x${keccak256(publicKey.subarray(1)).slice(-40)}`);
  publicKey.fill(0);
  ecdh.setPrivateKey(Buffer.alloc(32, 1));
  return address;
}

function makeFixture(addressOverride?: Address): Fixture {
  const scalar = Buffer.alloc(32, 7);
  const clearBytes = Buffer.alloc(48, 9);
  const salt = Buffer.alloc(32, 11);
  const iv = Buffer.alloc(16, 13);
  const derived = scryptSync(clearBytes, salt, 32, {
    N: 131_072,
    maxmem: 256 * 1024 * 1024,
    p: 1,
    r: 8
  });
  const cipher = createCipheriv("aes-128-ctr", derived.subarray(0, 16), iv);
  const cipherText = Buffer.concat([cipher.update(scalar), cipher.final()]);
  const macMaterial = Buffer.concat([derived.subarray(16, 32), cipherText]);
  const mac = keccak256(macMaterial).slice(2);
  const address = addressFromScalar(scalar);
  const storeBytes = Buffer.from(
    JSON.stringify({
      address: (addressOverride ?? address).slice(2).toLowerCase(),
      crypto: {
        cipher: "aes-128-ctr",
        cipherparams: { iv: iv.toString("hex") },
        ciphertext: cipherText.toString("hex"),
        kdf: "scrypt",
        kdfparams: {
          dklen: 32,
          n: 131_072,
          p: 1,
          r: 8,
          salt: salt.toString("hex")
        },
        mac
      },
      id: "12345678-1234-4123-8123-123456789abc",
      version: 3
    }),
    "utf8"
  );
  derived.fill(0);
  cipherText.fill(0);
  macMaterial.fill(0);
  salt.fill(0);
  iv.fill(0);
  scalar.fill(0);
  return Object.freeze({ address, clearBytes, storeBytes });
}

const SYNTHETIC_FIXTURE = makeFixture();

describe("BSC testnet deployer custody configuration", () => {
  it("accepts only exact frozen path data and keeps chain/address non-configurable", () => {
    expect(parseBscTestnetDeployerCustodyConfiguration(VALID_CONFIGURATION)).toEqual(
      VALID_CONFIGURATION
    );
    expect(BSC_TESTNET_DEPLOYER_CHAIN_ID).toBe(97);
    expect(BSC_TESTNET_DEPLOYER_ADDRESS).toBe("0x997cD959798F7c925076eaeFF5855C5C2c1e5A49");
  });

  it.each([
    {},
    { ...VALID_CONFIGURATION, chainId: 56 },
    {
      ...VALID_CONFIGURATION,
      powershellExecutableAbsolute: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    },
    { ...VALID_CONFIGURATION, custodyDirectoryAbsolute: ".\\wallets\\bsc-testnet" },
    { ...VALID_CONFIGURATION, custodyDirectoryAbsolute: "\\\\server\\share\\bsc-testnet" },
    { ...VALID_CONFIGURATION, custodyDirectoryAbsolute: "C:/wallets/bsc-testnet" }
  ])("rejects malformed or caller-expanded configuration %#", (candidate) => {
    expect(parseBscTestnetDeployerCustodyConfiguration(candidate)).toBeNull();
  });

  it("rejects accessors, symbols, hidden keys, and proxies without invoking traps", () => {
    let getterCalls = 0;
    const accessor = {
      get custodyDirectoryAbsolute() {
        getterCalls += 1;
        return VALID_CONFIGURATION.custodyDirectoryAbsolute;
      }
    };
    const withSymbol = { ...VALID_CONFIGURATION, [Symbol("hidden")]: true };
    const hidden = { ...VALID_CONFIGURATION };
    Object.defineProperty(hidden, "hidden", { enumerable: false, value: true });
    let proxyTraps = 0;
    const proxy = new Proxy(
      { ...VALID_CONFIGURATION },
      {
        getPrototypeOf() {
          proxyTraps += 1;
          return Object.prototype;
        },
        ownKeys() {
          proxyTraps += 1;
          return [];
        }
      }
    );
    expect(parseBscTestnetDeployerCustodyConfiguration(accessor)).toBeNull();
    expect(parseBscTestnetDeployerCustodyConfiguration(withSymbol)).toBeNull();
    expect(parseBscTestnetDeployerCustodyConfiguration(hidden)).toBeNull();
    expect(parseBscTestnetDeployerCustodyConfiguration(proxy)).toBeNull();
    expect(getterCalls).toBe(0);
    expect(proxyTraps).toBe(0);
  });
});

describe("strict Web3 Secret Storage v3 boundary", () => {
  it("parses the exact bounded shape and rejects duplicate or extra keys", () => {
    const fixture = SYNTHETIC_FIXTURE;
    const parsed = parseBscTestnetDeployerEncryptedStore(fixture.storeBytes, fixture.address);
    expect(parsed?.address).toBe(fixture.address.slice(2).toLowerCase());
    parsed?.cipherText.fill(0);
    parsed?.iv.fill(0);
    parsed?.mac.fill(0);
    parsed?.salt.fill(0);

    const text = fixture.storeBytes.toString("utf8");
    const duplicate = Buffer.from(text.replace('"version":3', '"version":3,"version":3'));
    const extra = Buffer.from(text.replace('"version":3', '"version":3,"extra":true'));
    expect(parseBscTestnetDeployerEncryptedStore(duplicate, fixture.address)).toBeNull();
    expect(parseBscTestnetDeployerEncryptedStore(extra, fixture.address)).toBeNull();
  });

  it.each([
    (text: string) => text.replace('"n":131072', '"n":262144'),
    (text: string) => text.replace('"cipher":"aes-128-ctr"', '"cipher":"aes-256-ctr"'),
    (text: string) => text.replace('"dklen":32', '"dklen":64'),
    (text: string) => text.replace(/"mac":"[0-9a-f]+"/u, '"mac":"00"')
  ])("rejects unsupported or malformed cryptographic parameters %#", (mutate) => {
    const fixture = SYNTHETIC_FIXTURE;
    expect(
      parseBscTestnetDeployerEncryptedStore(
        Buffer.from(mutate(fixture.storeBytes.toString("utf8"))),
        fixture.address
      )
    ).toBeNull();
  });

  it("rejects BOM, non-JSON whitespace, oversized input, and address drift", () => {
    const fixture = SYNTHETIC_FIXTURE;
    expect(
      parseBscTestnetDeployerEncryptedStore(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fixture.storeBytes]),
        fixture.address
      )
    ).toBeNull();
    expect(
      parseBscTestnetDeployerEncryptedStore(
        Buffer.from(`\u00a0${fixture.storeBytes.toString("utf8")}`),
        fixture.address
      )
    ).toBeNull();
    expect(
      parseBscTestnetDeployerEncryptedStore(Buffer.alloc(65_537, 32), fixture.address)
    ).toBeNull();
    expect(
      parseBscTestnetDeployerEncryptedStore(fixture.storeBytes, BSC_TESTNET_DEPLOYER_ADDRESS)
    ).toBeNull();
  });

  it("unlocks a synthetic exact-format store, derives its address, and clears the input secret", async () => {
    const fixture = SYNTHETIC_FIXTURE;
    const input = Buffer.from(fixture.clearBytes);
    await expect(
      unlockBscTestnetDeployerEncryptedStore(fixture.storeBytes, input, fixture.address)
    ).resolves.toEqual({ address: fixture.address, status: "ready" });
    expect(input.every((byte) => byte === 0)).toBe(true);
  });

  it("merges wrong clear material and MAC failure into unlock_failed and clears the input", async () => {
    const fixture = SYNTHETIC_FIXTURE;
    const input = Buffer.alloc(48, 10);
    await expect(
      unlockBscTestnetDeployerEncryptedStore(fixture.storeBytes, input, fixture.address)
    ).resolves.toEqual({ reason: "unlock_failed", status: "unavailable" });
    expect(input.every((byte) => byte === 0)).toBe(true);
  });

  it("distinguishes a valid store whose scalar does not match its declared expected address", async () => {
    const otherAddress = addressFromScalar(Buffer.alloc(32, 8));
    const fixture = SYNTHETIC_FIXTURE;
    const mismatchedStore = Buffer.from(
      fixture.storeBytes
        .toString("utf8")
        .replace(fixture.address.slice(2).toLowerCase(), otherAddress.slice(2).toLowerCase())
    );
    await expect(
      unlockBscTestnetDeployerEncryptedStore(
        mismatchedStore,
        Buffer.from(fixture.clearBytes),
        otherAddress
      )
    ).resolves.toEqual({ reason: "address_mismatch", status: "unavailable" });
  });
});

describe("custody probe lifecycle", () => {
  const parsedConfiguration = parseBscTestnetDeployerCustodyConfiguration(VALID_CONFIGURATION);
  if (parsedConfiguration === null) throw new Error("test configuration must be valid");

  it("returns only a fixed no-action ready result", async () => {
    const operation: InternalCustodyProbeOperation = vi.fn(async () => ({
      status: "ready" as const
    }));
    const probe = createBscTestnetDeployerCustodyProbeCore(parsedConfiguration, operation);
    const result = await probe.probeReadiness();
    expect(result).toEqual({
      address: BSC_TESTNET_DEPLOYER_ADDRESS,
      boundary: {
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
      },
      chainId: 97,
      checks: {
        addressMatch: true,
        encryptedStoreIntegrity: true,
        localAcl: true,
        mac: true,
        protectedBlobIntegrity: true,
        regularFiles: true,
        serverRuntime: true,
        web3SecretStorageV3: true,
        windowsCurrentUserDpapi: true
      },
      custody: "web3-secret-storage-v3+windows-dpapi-current-user",
      evidence: "local_unlock_and_address_match_only",
      status: "ready"
    });
    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("privateKey");
    expect(result).not.toHaveProperty("signature");
    expect(result).not.toHaveProperty("transactionHash");
  });

  it("coalesces concurrent probes and validates the internal result shape", async () => {
    let resolveOperation: ((value: { status: "ready" }) => void) | undefined;
    const operation = vi.fn(
      () =>
        new Promise<{ status: "ready" }>((resolve) => {
          resolveOperation = resolve;
        })
    );
    const probe = createBscTestnetDeployerCustodyProbeCore(parsedConfiguration, operation);
    const first = probe.probeReadiness();
    const second = probe.probeReadiness();
    expect(first).toBe(second);
    await Promise.resolve();
    resolveOperation?.({ status: "ready" });
    await expect(first).resolves.toMatchObject({ status: "ready" });
    expect(operation).toHaveBeenCalledTimes(1);

    const malformedProbe = createBscTestnetDeployerCustodyProbeCore(
      parsedConfiguration,
      (async () => ({ status: "ready", secret: "unexpected" })) as never
    );
    await expect(malformedProbe.probeReadiness()).resolves.toMatchObject({
      reason: "operation_failed",
      status: "unavailable"
    });
  });

  it("maps thrown details to one safe code", async () => {
    const operation: InternalCustodyProbeOperation = async () => {
      throw new Error("sensitive local detail");
    };
    const probe = createBscTestnetDeployerCustodyProbeCore(parsedConfiguration, operation);
    const result = await probe.probeReadiness();
    expect(result).toMatchObject({ reason: "operation_failed", status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("sensitive local detail");
  });

  it("aborts an active operation, waits for cleanup, and remains closed", async () => {
    const operation: InternalCustodyProbeOperation = (_configuration, signal) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => resolve({ reason: "operation_failed", status: "unavailable" }),
          { once: true }
        );
      });
    const probe = createBscTestnetDeployerCustodyProbeCore(parsedConfiguration, operation);
    const pending = probe.probeReadiness();
    await expect(probe.close()).resolves.toEqual({ status: "closed" });
    await expect(pending).resolves.toMatchObject({ reason: "closed", status: "unavailable" });
    await expect(probe.probeReadiness()).resolves.toMatchObject({
      reason: "closed",
      status: "unavailable"
    });
  });

  it("latches unknown subprocess cleanup and never starts another operation", async () => {
    const implementation: InternalCustodyProbeOperation = (_configuration, signal) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () =>
            resolve(
              Object.freeze({
                reason: "subprocess_cleanup_unknown" as const,
                status: "unavailable" as const
              })
            ),
          { once: true }
        );
      });
    const operation = vi.fn(implementation);
    const probe = createBscTestnetDeployerCustodyProbeCore(parsedConfiguration, operation);
    const pending = probe.probeReadiness();
    await Promise.resolve();
    await expect(probe.close()).resolves.toEqual({ status: "cleanup_unknown" });
    await expect(pending).resolves.toMatchObject({ reason: "closed", status: "unavailable" });
    await expect(probe.probeReadiness()).resolves.toMatchObject({
      reason: "closed",
      status: "unavailable"
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
