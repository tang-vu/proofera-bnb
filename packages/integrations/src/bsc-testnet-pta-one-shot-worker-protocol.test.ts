import { readFileSync } from "node:fs";

import { keccak256, parseTransaction, serializeTransaction, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";

import {
  BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
  BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
  BSC_TESTNET_PTA_RPC_ORIGIN,
  BSC_TESTNET_PTA_RUNTIME_BYTES,
  buildBscTestnetPtaDeploymentEnvelope
} from "./bsc-testnet-pta-deployment-envelope";
import {
  BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE,
  BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
  buildBscTestnetPtaSigningWorkerRequest,
  validateBscTestnetPtaFreshSigningCapability,
  validateBscTestnetPtaSigningWorkerRequest,
  validateBscTestnetPtaSigningWorkerResponse
} from "./bsc-testnet-pta-one-shot-worker-protocol";
import { buildBscTestnetPtaUnsignedTransaction } from "./bsc-testnet-pta-unsigned-transaction";

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
      balanceWei: "100000000000000000",
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

function reviewedSigningPayload() {
  const envelope = buildBscTestnetPtaDeploymentEnvelope(validObservation(), {
    asOf: () => new Date(NOW)
  });
  if (envelope.status !== "validated") throw new Error("Envelope fixture did not validate.");
  const unsigned = buildBscTestnetPtaUnsignedTransaction(envelope.envelope, {
    asOf: () => new Date(NOW)
  });
  if (unsigned.status !== "signing_payload_serialized") {
    throw new Error("Unsigned fixture did not serialize.");
  }
  return unsigned.signingPayload;
}

function capability(authenticatedAt = NOW) {
  return {
    schemaVersion: 1,
    scope: BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE,
    authenticatedAt,
    freshSignerSideRpcRecheckPerformed: true,
    signingPayload: reviewedSigningPayload()
  };
}

function validatedRequest(claimId = "claim-pta-001") {
  const validation = validateBscTestnetPtaFreshSigningCapability(capability(), new Date(NOW));
  if (validation.status !== "valid") throw new Error("Capability fixture did not validate.");
  const request = buildBscTestnetPtaSigningWorkerRequest(validation.intent, claimId);
  if ("code" in request) throw new Error("Worker request fixture did not build.");
  return request;
}

async function wrongSignerResponse() {
  const request = validatedRequest();
  // Public deterministic test scalar only; it is unrelated to the encrypted PTA deployer.
  const testAccount = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const signedTransaction = await testAccount.signTransaction({
    type: "legacy",
    chainId: 97,
    nonce: 0,
    gasPrice: BigInt(request.transaction.gasPriceWei),
    gas: BigInt(request.transaction.gasLimit),
    value: 0n,
    data: request.transaction.data
  });
  return {
    request,
    response: {
      schemaVersion: 1,
      operation: BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
      status: "signed",
      oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
      claimId: request.claimId,
      requestHash: request.requestHash,
      signingHash: request.transaction.signingHash,
      signedTransaction,
      transactionHash: keccak256(signedTransaction)
    }
  };
}

describe("BSC testnet PTA one-shot worker protocol", () => {
  it("accepts only the exact fresh nonce-zero payload and builds a deterministic bounded request", () => {
    const first = validateBscTestnetPtaFreshSigningCapability(capability(), new Date(NOW));
    const second = validateBscTestnetPtaFreshSigningCapability(capability(), new Date(NOW));
    expect(first).toEqual(second);
    expect(first.status).toBe("valid");
    if (first.status !== "valid") throw new Error("Expected valid capability.");
    const request = buildBscTestnetPtaSigningWorkerRequest(first.intent, "claim-pta-001");
    expect(request).toMatchObject({
      schemaVersion: 1,
      operation: BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
      environment: "bsc-testnet",
      chainId: "97",
      oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
      claimId: "claim-pta-001",
      expectedSigner: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      predictedContractAddress: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
      transaction: {
        type: "legacy",
        eip155ReplayProtection: true,
        contractCreation: true,
        nonce: "0",
        to: null,
        valueWei: "0",
        gasLimit: "600000",
        gasPriceWei: "100000000",
        maximumCostWei: "60000000000000",
        data: DEPLOYMENT_DATA
      }
    });
    expect("code" in request).toBe(false);
    if ("code" in request) throw new Error("Expected worker request.");
    expect(request.requestHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.transaction)).toBe(true);
    expect(validateBscTestnetPtaSigningWorkerRequest(request, new Date(NOW))).toMatchObject({
      status: "valid",
      request: { requestHash: request.requestHash },
      issue: null
    });
  });

  it("independently rejects stale or forged worker input before any secret unlock", () => {
    const request = validatedRequest();
    expect(
      validateBscTestnetPtaSigningWorkerRequest(request, new Date("2026-08-12T10:01:21.000Z"))
    ).toMatchObject({ status: "invalid", issue: { code: "CAPABILITY_STALE" } });

    const validation = validateBscTestnetPtaFreshSigningCapability(capability(), new Date(NOW));
    if (validation.status !== "valid") throw new Error("Expected valid capability.");
    const maliciousIntent = {
      ...validation.intent,
      deploymentData: "0x6000" as Hex,
      serializedSigningPayload: "0x01" as Hex,
      signingHash: keccak256("0x01")
    };
    const forged = buildBscTestnetPtaSigningWorkerRequest(maliciousIntent, "claim-forged");
    expect("code" in forged).toBe(false);
    expect(validateBscTestnetPtaSigningWorkerRequest(forged, new Date(NOW))).toMatchObject({
      status: "invalid",
      issue: { code: "WORKER_REQUEST_INVALID" }
    });

    let traps = 0;
    const proxied = new Proxy(request, {
      ownKeys: () => {
        traps += 1;
        throw new Error("must not run");
      }
    });
    expect(validateBscTestnetPtaSigningWorkerRequest(proxied, new Date(NOW))).toMatchObject({
      status: "invalid",
      issue: { code: "WORKER_REQUEST_INVALID" }
    });
    expect(traps).toBe(0);
  });

  it("rejects stale, future, expired, and proxied clocks", () => {
    expect(
      validateBscTestnetPtaFreshSigningCapability(
        capability("2026-08-12T09:59:19.000Z"),
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CAPABILITY_STALE" } });
    expect(
      validateBscTestnetPtaFreshSigningCapability(
        capability("2026-08-12T10:00:21.000Z"),
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CAPABILITY_FROM_FUTURE" } });
    expect(
      validateBscTestnetPtaFreshSigningCapability(
        capability("2026-08-12T10:02:59.000Z"),
        new Date("2026-08-12T10:03:00.000Z")
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CAPABILITY_EXPIRED" } });

    expect(
      validateBscTestnetPtaFreshSigningCapability(
        capability(),
        new Date("2026-08-12T10:01:20.000Z")
      )
    ).toMatchObject({ status: "valid" });
    expect(
      validateBscTestnetPtaFreshSigningCapability(
        capability(),
        new Date("2026-08-12T10:01:20.001Z")
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CAPABILITY_STALE" } });

    let traps = 0;
    const proxiedDate = new Proxy(new Date(NOW), {
      getPrototypeOf: () => {
        traps += 1;
        throw new Error("must not run");
      }
    });
    expect(validateBscTestnetPtaFreshSigningCapability(capability(), proxiedDate)).toMatchObject({
      status: "invalid",
      issue: { code: "CAPABILITY_INVALID" }
    });
    expect(traps).toBe(0);
  });

  it("rejects extra keys, accessors, symbols, custom prototypes, and proxies without trap execution", () => {
    const extra = { ...capability(), extra: true };
    expect(validateBscTestnetPtaFreshSigningCapability(extra, new Date(NOW))).toMatchObject({
      status: "invalid",
      issue: { code: "CAPABILITY_INVALID" }
    });

    const accessor = capability() as Record<string, unknown>;
    Object.defineProperty(accessor, "scope", {
      enumerable: true,
      get: vi.fn(() => BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE)
    });
    expect(validateBscTestnetPtaFreshSigningCapability(accessor, new Date(NOW))).toMatchObject({
      status: "invalid",
      issue: { code: "CAPABILITY_INVALID" }
    });

    const symbol = capability() as Record<PropertyKey, unknown>;
    symbol[Symbol("extra")] = true;
    expect(validateBscTestnetPtaFreshSigningCapability(symbol, new Date(NOW))).toMatchObject({
      status: "invalid",
      issue: { code: "CAPABILITY_INVALID" }
    });

    const custom = Object.assign(Object.create({ inherited: true }) as object, capability());
    expect(validateBscTestnetPtaFreshSigningCapability(custom, new Date(NOW))).toMatchObject({
      status: "invalid",
      issue: { code: "CAPABILITY_INVALID" }
    });

    let traps = 0;
    const proxied = new Proxy(capability(), {
      ownKeys: () => {
        traps += 1;
        throw new Error("must not run");
      },
      getPrototypeOf: () => {
        traps += 1;
        throw new Error("must not run");
      }
    });
    expect(validateBscTestnetPtaFreshSigningCapability(proxied, new Date(NOW))).toMatchObject({
      status: "invalid",
      issue: { code: "CAPABILITY_INVALID" }
    });
    expect(traps).toBe(0);
  });

  it("rejects forged chain, nonce, recipient, bytecode, serialization, and fee caps", () => {
    const cases: Array<[string, (input: Record<string, unknown>) => void, string]> = [
      [
        "chain",
        (input) => {
          input.chainId = "56";
        },
        "SIGNING_PAYLOAD_MISMATCH"
      ],
      [
        "nonce",
        (input) => {
          (input.transaction as Record<string, unknown>).nonce = "1";
        },
        "SIGNING_PAYLOAD_MISMATCH"
      ],
      [
        "recipient",
        (input) => {
          (input.deployment as Record<string, unknown>).constructorRecipient =
            "0x0000000000000000000000000000000000000000";
        },
        "SIGNING_PAYLOAD_MISMATCH"
      ],
      [
        "bytecode",
        (input) => {
          (input.deployment as Record<string, unknown>).data = `${DEPLOYMENT_DATA.slice(0, -2)}00`;
        },
        "SIGNING_PAYLOAD_MISMATCH"
      ],
      [
        "serialization",
        (input) => {
          input.serializedSigningPayload = "0x01";
        },
        "SIGNING_PAYLOAD_MISMATCH"
      ],
      [
        "fee cap",
        (input) => {
          (input.transaction as Record<string, unknown>).gasLimit = "1000001";
          (input.transaction as Record<string, unknown>).maximumCostWei = "100000100000000";
        },
        "POLICY_EXCEEDED"
      ]
    ];
    for (const [label, mutate, expectedCode] of cases) {
      const forged = structuredClone(capability());
      mutate(forged.signingPayload as unknown as Record<string, unknown>);
      expect(
        validateBscTestnetPtaFreshSigningCapability(forged, new Date(NOW)),
        label
      ).toMatchObject({ status: "invalid", issue: { code: expectedCode } });
    }
  });

  it("rejects unsafe durable claim identifiers before creating a worker request", () => {
    const validation = validateBscTestnetPtaFreshSigningCapability(capability(), new Date(NOW));
    if (validation.status !== "valid") throw new Error("Expected valid capability.");
    for (const claimId of ["", " leading", "line\nbreak", "a".repeat(129), new Proxy({}, {})]) {
      expect(buildBscTestnetPtaSigningWorkerRequest(validation.intent, claimId)).toMatchObject({
        code: "CLAIM_ID_INVALID"
      });
    }
  });

  it("cryptographically recovers and rejects a canonical transaction signed by any other key", async () => {
    const { request, response } = await wrongSignerResponse();
    const result = await validateBscTestnetPtaSigningWorkerResponse(response, request);
    if (result.status !== "invalid") throw new Error("Expected signer mismatch.");
    expect(result.issue.message).toBe(
      "Recovered signer or nonce-zero CREATE address does not match the dedicated PTA deployer."
    );
    expect(result).toMatchObject({
      status: "invalid",
      issue: { code: "SIGNER_MISMATCH" },
      signedTransaction: null,
      transactionHash: null,
      recoveredSigner: null
    });
  });

  it("rejects correlation forgery and proxied worker output without executing traps", async () => {
    const { request, response } = await wrongSignerResponse();
    const forged = { ...response, requestHash: `0x${"ff".repeat(32)}` };
    await expect(
      validateBscTestnetPtaSigningWorkerResponse(forged, request)
    ).resolves.toMatchObject({
      status: "invalid",
      issue: { code: "WORKER_RESPONSE_INVALID" }
    });

    let traps = 0;
    const proxied = new Proxy(response, {
      ownKeys: () => {
        traps += 1;
        throw new Error("must not run");
      }
    });
    await expect(
      validateBscTestnetPtaSigningWorkerResponse(proxied, request)
    ).resolves.toMatchObject({
      status: "invalid",
      issue: { code: "WORKER_RESPONSE_INVALID" }
    });
    expect(traps).toBe(0);
  });

  it("rejects high-s signature malleability before accepting worker output", async () => {
    const { request, response } = await wrongSignerResponse();
    const parsed = parseTransaction(response.signedTransaction);
    if (parsed.s === undefined || parsed.r === undefined || parsed.yParity === undefined) {
      throw new Error("Expected test signature fields.");
    }
    const order = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
    const highS = toHex(order - BigInt(parsed.s), { size: 32 });
    const signedTransaction = serializeTransaction(
      {
        type: "legacy",
        chainId: 97,
        nonce: parsed.nonce,
        gasPrice: parsed.gasPrice,
        gas: parsed.gas,
        value: parsed.value ?? 0n,
        data: parsed.data
      },
      {
        r: parsed.r,
        s: highS,
        v: BigInt(97 * 2 + 35) + BigInt(parsed.yParity === 0 ? 1 : 0)
      }
    );
    const malleated = {
      ...response,
      signedTransaction,
      transactionHash: keccak256(signedTransaction)
    };
    await expect(
      validateBscTestnetPtaSigningWorkerResponse(malleated, request)
    ).resolves.toMatchObject({
      status: "invalid",
      issue: { code: "SIGNED_TRANSACTION_MISMATCH" }
    });
  });
});
