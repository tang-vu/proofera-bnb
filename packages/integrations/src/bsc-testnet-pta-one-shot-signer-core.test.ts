import { readFileSync } from "node:fs";

import { keccak256, type Hex } from "viem";
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
  BSC_TESTNET_PTA_DURABLE_CLAIM_OPERATION,
  createBscTestnetPtaOneShotSignerCore,
  type BscTestnetPtaDurableClaimRequest,
  type BscTestnetPtaDurableSignedCommitRequest
} from "./bsc-testnet-pta-one-shot-signer-core";
import {
  BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE,
  BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
  type BscTestnetPtaFreshSigningCapability,
  type BscTestnetPtaSigningWorkerRequest
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

function capability(): BscTestnetPtaFreshSigningCapability {
  return {
    schemaVersion: 1,
    scope: BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE,
    authenticatedAt: NOW,
    freshSignerSideRpcRecheckPerformed: true,
    signingPayload: reviewedSigningPayload()
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness(
  overrides: Partial<{
    capability: BscTestnetPtaFreshSigningCapability;
    authenticated: boolean;
    asOf: () => Date;
    claim: (request: BscTestnetPtaDurableClaimRequest) => Promise<unknown>;
    worker: (request: BscTestnetPtaSigningWorkerRequest) => Promise<unknown>;
    commit: (request: BscTestnetPtaDurableSignedCommitRequest) => Promise<unknown>;
  }> = {}
) {
  const issuedCapability = overrides.capability ?? capability();
  const branded = new WeakSet<object>();
  if (overrides.authenticated !== false) branded.add(issuedCapability);
  const calls = {
    acquire: vi.fn(async () => issuedCapability),
    authenticate: vi.fn((input: unknown) =>
      typeof input === "object" && input !== null ? branded.has(input) : false
    ),
    claim: vi.fn(
      overrides.claim ?? (async () => ({ status: "claimed", claimId: "claim-pta-001" }))
    ),
    worker: vi.fn(overrides.worker ?? (async () => ({ status: "unused-invalid-worker-fixture" }))),
    commit: vi.fn(overrides.commit ?? (async () => ({ status: "committed" })))
  };
  const core = createBscTestnetPtaOneShotSignerCore({
    asOf: overrides.asOf ?? (() => new Date(NOW)),
    acquireFreshCapability: calls.acquire,
    authenticateFreshCapability: calls.authenticate,
    claimExactDeployment: calls.claim,
    invokeExactSigningWorker: calls.worker,
    commitSignedTransaction: calls.commit
  });
  return { core, calls, issuedCapability };
}

async function signWithWrongTestKey(request: BscTestnetPtaSigningWorkerRequest) {
  // Public deterministic test scalar only; unrelated to the encrypted PTA deployer.
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const signedTransaction = await account.signTransaction({
    type: "legacy",
    chainId: 97,
    nonce: 0,
    gasPrice: BigInt(request.transaction.gasPriceWei),
    gas: BigInt(request.transaction.gasLimit),
    value: 0n,
    data: request.transaction.data
  });
  return {
    schemaVersion: 1,
    operation: BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
    status: "signed",
    oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
    claimId: request.claimId,
    requestHash: request.requestHash,
    signingHash: request.transaction.signingHash,
    signedTransaction,
    transactionHash: keccak256(signedTransaction)
  };
}

describe("BSC testnet PTA one-shot signer core", () => {
  it("does not expose transaction arguments, secrets, RPC, broadcast, or mainnet capability", () => {
    const { core } = createHarness();
    expect(core.signOnce.length).toBe(0);
    expect(core.boundary).toEqual({
      scope: "exact_bsc_testnet_pta_deployment_only",
      environment: "bsc-testnet",
      chainId: "97",
      genericSigningApiExposed: false,
      transactionInputAcceptedFromCaller: false,
      privateKeyAcceptedFromCaller: false,
      environmentReadByCore: false,
      secretReadByCore: false,
      rpcReadByCore: false,
      secretUnlockPerformedByCore: false,
      signingPerformedByCore: false,
      broadcastPerformedByCore: false,
      mainnetWritePossible: false,
      durableClaimRequiredBeforeWorker: true,
      ambiguousPostClaimRetryAllowed: false
    });
  });

  it("single-flights concurrent calls and invokes the durable claim exactly once", async () => {
    const claimGate = deferred<unknown>();
    const { core, calls } = createHarness({ claim: async () => claimGate.promise });
    const first = core.signOnce();
    const second = core.signOnce();
    const third = core.signOnce();
    expect(first).toBe(second);
    expect(second).toBe(third);
    await vi.waitFor(() => expect(calls.claim).toHaveBeenCalledTimes(1));
    expect(core.getState()).toBe("claiming");
    claimGate.resolve({ status: "already_exists", state: "claimed" });
    const [a, b, c] = await Promise.all([first, second, third]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toMatchObject({
      status: "do_not_retry",
      retryAllowed: false,
      durableClaimOutcome: "already_exists",
      signatureOutcome: "not_attempted",
      issue: { code: "INTENT_ALREADY_CLAIMED" }
    });
    expect(calls.worker).not.toHaveBeenCalled();
  });

  it("requires authority-authenticated object identity before the durable claim", async () => {
    const { core, calls } = createHarness({ authenticated: false });
    await expect(core.signOnce()).resolves.toMatchObject({
      status: "blocked_before_claim",
      retryAllowed: true,
      durableClaimOutcome: "not_attempted",
      issue: { code: "CAPABILITY_AUTHENTICATION_FAILED" }
    });
    expect(calls.claim).not.toHaveBeenCalled();
    expect(calls.worker).not.toHaveBeenCalled();
  });

  it("treats a rejected or malformed durable claim result as unknown and terminal", async () => {
    for (const claim of [
      async () => Promise.reject(new Error("ambiguous store timeout")),
      async () => ({ status: "claimed", claimId: "bad\nclaim" })
    ]) {
      const { core, calls } = createHarness({ claim });
      const first = await core.signOnce();
      const second = await core.signOnce();
      expect(first).toBe(second);
      expect(first).toMatchObject({
        status: "do_not_retry",
        retryAllowed: false,
        durableClaimOutcome: expect.stringMatching(/unknown|claimed/u),
        signatureOutcome: "not_attempted"
      });
      expect(calls.claim).toHaveBeenCalledTimes(1);
      expect(calls.worker).not.toHaveBeenCalled();
    }
  });

  it("never retries after an ambiguous worker outcome", async () => {
    const { core, calls } = createHarness({
      worker: async () => Promise.reject(new Error("worker exited after possible signature"))
    });
    const first = await core.signOnce();
    const second = await core.signOnce();
    expect(first).toBe(second);
    expect(first).toMatchObject({
      status: "do_not_retry",
      retryAllowed: false,
      durableClaimOutcome: "claimed",
      signatureOutcome: "unknown",
      issue: { code: "WORKER_OUTCOME_UNKNOWN" }
    });
    expect(calls.claim).toHaveBeenCalledTimes(1);
    expect(calls.worker).toHaveBeenCalledTimes(1);
    expect(calls.commit).not.toHaveBeenCalled();
  });

  it("withholds forged worker output and makes the claim terminal", async () => {
    const { core, calls } = createHarness({ worker: signWithWrongTestKey });
    const result = await core.signOnce();
    expect(result).toMatchObject({
      status: "do_not_retry",
      retryAllowed: false,
      durableClaimOutcome: "claimed",
      signatureOutcome: "unverified_worker_output",
      signedTransaction: null,
      transactionHash: null,
      issue: {
        code: "WORKER_OUTPUT_INVALID",
        protocolIssue: { code: "SIGNER_MISMATCH" }
      }
    });
    expect(calls.commit).not.toHaveBeenCalled();
  });

  it("rechecks freshness after claim and does not invoke the worker if capability aged out", async () => {
    let clockCalls = 0;
    const { core, calls } = createHarness({
      asOf: () => {
        clockCalls += 1;
        return new Date(clockCalls === 1 ? NOW : "2026-08-12T10:01:21.000Z");
      }
    });
    await expect(core.signOnce()).resolves.toMatchObject({
      status: "do_not_retry",
      durableClaimOutcome: "claimed",
      signatureOutcome: "not_attempted",
      issue: {
        code: "CAPABILITY_EXPIRED_AFTER_CLAIM",
        protocolIssue: { code: "CAPABILITY_STALE" }
      }
    });
    expect(calls.worker).not.toHaveBeenCalled();
  });

  it("rejects proxied dependencies without executing proxy traps", async () => {
    let traps = 0;
    const proxy = new Proxy(
      {
        asOf: () => new Date(NOW),
        acquireFreshCapability: async () => capability(),
        authenticateFreshCapability: () => true,
        claimExactDeployment: async () => ({ status: "claimed", claimId: "claim" }),
        invokeExactSigningWorker: async () => ({}),
        commitSignedTransaction: async () => ({ status: "committed" })
      },
      {
        ownKeys: () => {
          traps += 1;
          throw new Error("must not run");
        }
      }
    );
    const core = createBscTestnetPtaOneShotSignerCore(proxy);
    await expect(core.signOnce()).resolves.toMatchObject({
      status: "blocked_before_claim",
      retryAllowed: false,
      issue: { code: "CONFIGURATION_INVALID" }
    });
    expect(traps).toBe(0);
  });

  it("passes only the fixed durable claim schema and no raw transaction to claim storage", async () => {
    const { core, calls } = createHarness();
    await core.signOnce();
    expect(calls.claim).toHaveBeenCalledTimes(1);
    const request = calls.claim.mock.calls[0]?.[0];
    expect(request).toEqual({
      schemaVersion: 1,
      operation: BSC_TESTNET_PTA_DURABLE_CLAIM_OPERATION,
      oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
      environment: "bsc-testnet",
      chainId: "97",
      expectedSigner: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      predictedContractAddress: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
      signingHash: reviewedSigningPayload().signingHash,
      sourceEnvelopeHash: reviewedSigningPayload().sourceEnvelopeHash
    });
    expect(request).not.toHaveProperty("signedTransaction");
    expect(request).not.toHaveProperty("privateKey");
  });
});
