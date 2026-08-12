import { createCipheriv, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

import { keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
  BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
  BSC_TESTNET_PTA_RPC_ORIGIN,
  BSC_TESTNET_PTA_RUNTIME_BYTES,
  buildBscTestnetPtaDeploymentEnvelope
} from "./bsc-testnet-pta-deployment-envelope";
import {
  BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE,
  buildBscTestnetPtaSigningWorkerRequest,
  validateBscTestnetPtaFreshSigningCapability,
  type BscTestnetPtaSigningWorkerRequest
} from "./bsc-testnet-pta-one-shot-worker-protocol";
import {
  createBscTestnetPtaSigningWorkerForInternalUse,
  isBscTestnetPtaSigningDeadlineCurrentForInternalUse,
  signExactBscTestnetPtaEncryptedStoreForInternalUse,
  type BscTestnetPtaExactSigningTransaction,
  type BscTestnetPtaSigningWorkerPorts
} from "./bsc-testnet-pta-signing-worker";
import { buildBscTestnetPtaUnsignedTransaction } from "./bsc-testnet-pta-unsigned-transaction";

const SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-signing-worker.ts", import.meta.url),
  "utf8"
);
const ENVELOPE_TEST_SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-deployment-envelope.test.ts", import.meta.url),
  "utf8"
);
const DEPLOYMENT_DATA_MATCH = /const DEPLOYMENT_DATA =\s+"(0x[0-9a-f]+)";/u.exec(
  ENVELOPE_TEST_SOURCE
);
if (DEPLOYMENT_DATA_MATCH?.[1] === undefined) {
  throw new Error("The reviewed deployment fixture was not found.");
}
const DEPLOYMENT_DATA = DEPLOYMENT_DATA_MATCH[1] as Hex;
const RUNTIME_PREFIX = "608060405234801561001057600080fd5b5060043610610093";
const runtimeStart = DEPLOYMENT_DATA.indexOf(RUNTIME_PREFIX, 2 + RUNTIME_PREFIX.length);
if (runtimeStart < 0) throw new Error("The reviewed runtime fixture was not found.");
const SIMULATION_RETURN_DATA = `0x${DEPLOYMENT_DATA.slice(
  runtimeStart,
  runtimeStart + BSC_TESTNET_PTA_RUNTIME_BYTES * 2
)}` as Hex;

const NOW = "2026-08-12T10:00:20.000Z";
const CUSTODY_DIRECTORY = "C:\\Users\\proof\\ProofEra\\wallets\\bsc-testnet";
const SYNTHETIC_PRIVATE_KEY = `0x${"11".repeat(32)}` as const;

function validObservation() {
  return {
    schemaVersion: 1,
    operation: BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
    deploymentData: DEPLOYMENT_DATA,
    rpc: {
      endpointId: BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
      endpointOrigin: BSC_TESTNET_PTA_RPC_ORIGIN,
      observedAt: "2026-08-12T10:00:10.000Z",
      chainId: "97",
      blockNumber: "124634953",
      blockHash: `0x${"12".repeat(32)}`,
      blockTimestamp: "1786528800",
      blockGasLimit: "140000000",
      latestNonce: "0",
      pendingNonce: "0",
      signerCode: "0x",
      predictedContractAddress: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
      predictedContractCode: "0x",
      predictedContractNonce: "0",
      balanceWei: "1000000000000000",
      simulationReturnData: SIMULATION_RETURN_DATA,
      gasEstimate: "500000",
      feeModel: "legacy_gas_price",
      gasPriceWei: "100000000"
    },
    policy: {
      expiresAt: "2026-08-12T10:03:00.000Z",
      gasLimitMarginBps: "2000",
      maximumGasLimit: "800000",
      maximumGasPriceWei: "1000000000",
      maximumTotalCostWei: "1000000000000000"
    }
  };
}

function reviewedUnsignedTransaction() {
  const clock = { asOf: () => new Date(NOW) };
  const envelope = buildBscTestnetPtaDeploymentEnvelope(validObservation(), clock);
  if (envelope.status !== "validated") throw new Error("Envelope fixture did not validate.");
  const unsigned = buildBscTestnetPtaUnsignedTransaction(envelope.envelope, clock);
  if (unsigned.status !== "signing_payload_serialized") {
    throw new Error("Unsigned transaction fixture did not validate.");
  }
  return unsigned.signingPayload;
}

function reviewedWorkerRequest(): BscTestnetPtaSigningWorkerRequest {
  const capability = Object.freeze({
    schemaVersion: 1 as const,
    scope: BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE,
    authenticatedAt: "2026-08-12T10:00:15.000Z",
    freshSignerSideRpcRecheckPerformed: true as const,
    signingPayload: reviewedUnsignedTransaction()
  });
  const validation = validateBscTestnetPtaFreshSigningCapability(capability, new Date(NOW));
  if (validation.status !== "valid") throw new Error("Fresh capability fixture did not validate.");
  const request = buildBscTestnetPtaSigningWorkerRequest(validation.intent, "claim-test-001");
  if ("code" in request) throw new Error("Worker request fixture did not validate.");
  return request;
}

function canonicalInput(request: unknown = reviewedWorkerRequest()): Buffer {
  return Buffer.from(JSON.stringify(request), "utf8");
}

function exactTransaction(): BscTestnetPtaExactSigningTransaction {
  const payload = reviewedUnsignedTransaction();
  return Object.freeze({
    data: payload.deployment.data,
    gasLimit: BigInt(payload.transaction.gasLimit),
    gasPriceWei: BigInt(payload.transaction.gasPriceWei),
    nonce: 0 as const,
    signingNotAfterMilliseconds: Date.parse("2026-08-12T10:01:15.000Z")
  });
}

function workerWith(
  signExactTransaction: BscTestnetPtaSigningWorkerPorts["signExactTransaction"],
  now = NOW
) {
  return createBscTestnetPtaSigningWorkerForInternalUse(
    Object.freeze({ custodyDirectoryAbsolute: CUSTODY_DIRECTORY }),
    Object.freeze({ now: () => new Date(now), signExactTransaction })
  );
}

async function signWithSyntheticKey(transaction: BscTestnetPtaExactSigningTransaction) {
  const account = privateKeyToAccount(SYNTHETIC_PRIVATE_KEY);
  return account.signTransaction({
    chainId: 97,
    data: transaction.data,
    gas: transaction.gasLimit,
    gasPrice: transaction.gasPriceWei,
    nonce: transaction.nonce,
    type: "legacy",
    value: 0n
  });
}

function syntheticEncryptedStore(): Readonly<{ password: Buffer; store: Buffer }> {
  const password = Buffer.alloc(48, 0x42);
  const salt = Buffer.alloc(32, 0x22);
  const iv = Buffer.alloc(16, 0x33);
  const privateKey = Buffer.from(SYNTHETIC_PRIVATE_KEY.slice(2), "hex");
  const derivedKey = scryptSync(password, salt, 32, {
    N: 131_072,
    maxmem: 256 * 1024 * 1024,
    p: 1,
    r: 8
  });
  const cipher = createCipheriv("aes-128-ctr", derivedKey.subarray(0, 16), iv);
  const cipherText = Buffer.concat([cipher.update(privateKey), cipher.final()]);
  const macMaterial = Buffer.concat([derivedKey.subarray(16, 32), cipherText]);
  const mac = keccak256(macMaterial).slice(2);
  const store = Buffer.from(
    JSON.stringify({
      address: "997cd959798f7c925076eaeff5855c5c2c1e5a49",
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
      id: "11111111-1111-4111-8111-111111111111",
      version: 3
    }),
    "utf8"
  );
  derivedKey.fill(0);
  privateKey.fill(0);
  cipherText.fill(0);
  macMaterial.fill(0);
  return Object.freeze({ password, store });
}

describe("BSC testnet PTA exact one-shot signing worker", () => {
  beforeAll(() => {
    expect(DEPLOYMENT_DATA.length).toBe(2 + 2_947 * 2);
  });

  it("rejects a real cryptographic signature from any signer other than the pinned deployer", async () => {
    const signExactTransaction = vi.fn(
      async (_custody: unknown, transaction: BscTestnetPtaExactSigningTransaction) =>
        signWithSyntheticKey(transaction)
    );
    const worker = workerWith(signExactTransaction);

    await expect(worker.invokeExactSigningWorker(reviewedWorkerRequest())).rejects.toMatchObject({
      code: "SIGNED_TRANSACTION_INVALID"
    });
    expect(signExactTransaction).toHaveBeenCalledTimes(1);
    expect(signExactTransaction.mock.calls[0]?.[0]).toEqual({
      custodyDirectoryAbsolute: CUSTODY_DIRECTORY
    });
    expect(signExactTransaction.mock.calls[0]?.[1]).toMatchObject({
      data: DEPLOYMENT_DATA,
      gasLimit: 600_000n,
      gasPriceWei: 100_000_000n,
      nonce: 0,
      signingNotAfterMilliseconds: Date.parse("2026-08-12T10:01:15.000Z")
    });
    expect(canonicalInput().toString("utf8")).not.toContain(CUSTODY_DIRECTORY);
  });

  it("claims before invoking custody and refuses every retry after an ambiguous result", async () => {
    const signExactTransaction = vi.fn(async () => {
      throw new Error("synthetic ambiguity");
    });
    const worker = workerWith(signExactTransaction);
    await expect(worker.invokeExactSigningWorker(reviewedWorkerRequest())).rejects.toMatchObject({
      code: "SIGNING_FAILED"
    });
    await expect(worker.invokeExactSigningWorker(reviewedWorkerRequest())).rejects.toMatchObject({
      code: "ALREADY_CLAIMED"
    });
    expect(signExactTransaction).toHaveBeenCalledTimes(1);
  });

  it("reconstructs the same exact signature deterministically and distinguishes any payload drift", async () => {
    const account = privateKeyToAccount(SYNTHETIC_PRIVATE_KEY);
    const transaction = exactTransaction();
    const sign = (gasPrice: bigint) =>
      account.signTransaction({
        chainId: 97,
        data: transaction.data,
        gas: transaction.gasLimit,
        gasPrice,
        nonce: 0,
        type: "legacy",
        value: 0n
      });
    const first = await sign(transaction.gasPriceWei);
    const second = await sign(transaction.gasPriceWei);
    const drifted = await sign(transaction.gasPriceWei + 1n);
    expect(first).toBe(second);
    expect(drifted).not.toBe(first);
  });

  it("permits signing immediately before the bound deadline and rejects the exact boundary", () => {
    const transaction = exactTransaction();
    expect(
      isBscTestnetPtaSigningDeadlineCurrentForInternalUse(
        transaction,
        transaction.signingNotAfterMilliseconds - 1
      )
    ).toBe(true);
    expect(
      isBscTestnetPtaSigningDeadlineCurrentForInternalUse(
        transaction,
        transaction.signingNotAfterMilliseconds
      )
    ).toBe(false);
  });

  it("does not consume the one-shot claim for malformed or expired input", async () => {
    const signExactTransaction = vi.fn(async () => "0x" as Hex);
    const worker = workerWith(signExactTransaction);
    const nonCanonical = Buffer.concat([canonicalInput(), Buffer.from(" ")]);
    await expect(worker.executeCanonicalStdin(nonCanonical)).rejects.toMatchObject({
      code: "INPUT_INVALID"
    });
    const expiredWorker = workerWith(signExactTransaction, "2026-08-12T10:03:00.000Z");
    await expect(
      expiredWorker.invokeExactSigningWorker(reviewedWorkerRequest())
    ).rejects.toMatchObject({
      code: "PAYLOAD_EXPIRED"
    });
    expect(signExactTransaction).not.toHaveBeenCalled();
  });

  it("rejects every material transaction, deployment, signer, fee, and serialization mutation", async () => {
    const mutations: ReadonlyArray<(request: Record<string, unknown>) => void> = [
      (request) => {
        request.chainId = "56";
      },
      (request) => {
        request.expectedSigner = "0x0000000000000000000000000000000000000001";
      },
      (request) => {
        request.predictedContractAddress = "0x0000000000000000000000000000000000000001";
      },
      (request) => {
        (request.transaction as Record<string, unknown>).data = `${DEPLOYMENT_DATA.slice(0, -2)}00`;
      },
      (request) => {
        (request.transaction as Record<string, unknown>).nonce = "1";
      },
      (request) => {
        (request.transaction as Record<string, unknown>).to =
          "0x0000000000000000000000000000000000000001";
      },
      (request) => {
        (request.transaction as Record<string, unknown>).valueWei = "1";
      },
      (request) => {
        (request.transaction as Record<string, unknown>).gasLimit = "1000001";
      },
      (request) => {
        (request.transaction as Record<string, unknown>).gasPriceWei = "3000000001";
      },
      (request) => {
        (request.transaction as Record<string, unknown>).serializedSigningPayload = "0x00";
      },
      (request) => {
        (request.transaction as Record<string, unknown>).signingHash = `0x${"00".repeat(32)}`;
      },
      (request) => {
        request.unexpected = true;
      }
    ];
    for (const mutate of mutations) {
      const request = structuredClone(reviewedWorkerRequest()) as unknown as Record<
        string,
        unknown
      >;
      mutate(request);
      const signExactTransaction = vi.fn(async () => "0x" as Hex);
      const worker = workerWith(signExactTransaction);
      await expect(worker.executeCanonicalStdin(canonicalInput(request))).rejects.toMatchObject({
        code: "INPUT_INVALID"
      });
      expect(signExactTransaction).not.toHaveBeenCalled();
    }
  });

  it("rejects invalid clocks and hostile dependency objects without touching custody", async () => {
    const signExactTransaction = vi.fn(async () => "0x" as Hex);
    const invalidClockWorker = createBscTestnetPtaSigningWorkerForInternalUse(
      Object.freeze({ custodyDirectoryAbsolute: CUSTODY_DIRECTORY }),
      Object.freeze({ now: () => new Date(Number.NaN), signExactTransaction })
    );
    await expect(
      invalidClockWorker.invokeExactSigningWorker(reviewedWorkerRequest())
    ).rejects.toMatchObject({
      code: "CLOCK_INVALID"
    });
    expect(signExactTransaction).not.toHaveBeenCalled();
    expect(() =>
      createBscTestnetPtaSigningWorkerForInternalUse(
        Object.freeze({ custodyDirectoryAbsolute: CUSTODY_DIRECTORY }),
        {
          now: () => new Date(NOW),
          signExactTransaction,
          unexpected: true
        }
      )
    ).toThrow("failed closed");
  });

  it("decrypts a synthetic Web3 V3 fixture, rejects its non-pinned key, and clears owned buffers", async () => {
    const fixture = syntheticEncryptedStore();
    await expect(
      signExactBscTestnetPtaEncryptedStoreForInternalUse(
        fixture.store,
        fixture.password,
        exactTransaction()
      )
    ).rejects.toThrow("failed closed");
    expect(fixture.store.every((byte) => byte === 0)).toBe(true);
    expect(fixture.password.every((byte) => byte === 0)).toBe(true);
  }, 15_000);

  it("contains no RPC, broadcast, environment, stdout, logging, or generic target mechanism", () => {
    expect(SOURCE).not.toMatch(/\bfetch\s*\(/u);
    expect(SOURCE).not.toMatch(/eth_sendRawTransaction/u);
    expect(SOURCE).not.toMatch(/process\.env/u);
    expect(SOURCE).not.toMatch(/process\.(?:stdin|stdout|stderr)/u);
    expect(SOURCE).not.toMatch(/console\.(?:log|info|warn|error|debug)/u);
    expect(SOURCE).not.toMatch(/\b(?:http|https|net|tls|dgram|ws):/u);
    expect(SOURCE).toContain("transaction.to !== null");
    expect(SOURCE).toContain('transaction.nonce !== "0"');
    expect(SOURCE).toContain('transaction.valueWei !== "0"');
    expect(SOURCE).toContain("Claim before custody unlock");
  });
});
