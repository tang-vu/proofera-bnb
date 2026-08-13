import { keccak256, serializeTransaction, type Hex } from "viem";
import type * as ViemModule from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof ViemModule>();
  return {
    ...original,
    recoverTransactionAddress: vi.fn(async () => "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49")
  };
});

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE,
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction,
  buildBscTestnetPtaWbnbPoolSigningWorkerRequest,
  deriveBscTestnetPtaWbnbPoolSigningWorkerRequestHash,
  validateBscTestnetPtaWbnbPoolFreshRecheckCapability,
  validateBscTestnetPtaWbnbPoolSigningWorkerRequest,
  validateBscTestnetPtaWbnbPoolSigningWorkerResponse,
  type BscTestnetPtaWbnbPoolAuthorizedSigningIntent,
  type BscTestnetPtaWbnbPoolFreshRecheckCapability,
  type BscTestnetPtaWbnbPoolSigningWorkerRequest
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

const ENVELOPE_HASH = `0x${"11".repeat(32)}` as Hex;
const REVIEWER_DIGEST = `0x${"22".repeat(32)}` as Hex;
const OWNER_DIGEST = `0x${"33".repeat(32)}` as Hex;
const CLAIM_TOKEN = `0x${"44".repeat(32)}` as Hex;
const MANIFEST = `0x${"55".repeat(32)}` as Hex;
const RELEASE = "a".repeat(40);
const AUTHENTICATED_AT = "2026-08-13T04:30:00.000Z";
const EXPIRES_AT = "2026-08-13T04:30:30.000Z";

function transaction() {
  const result = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: "5983857",
    gasPriceWei: "100000000",
    sourceEnvelopeHash: ENVELOPE_HASH
  });
  if (result === null) throw new Error("Exact transaction fixture failed.");
  return result;
}

function authorizedIntent(): BscTestnetPtaWbnbPoolAuthorizedSigningIntent {
  return Object.freeze({
    schemaVersion: 1,
    scope: "authenticated_reviewer_and_owner_exact_pool_initialization",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    reviewerApprovalDigest: REVIEWER_DIGEST,
    ownerAuthorizationDigest: OWNER_DIGEST,
    releaseCommit: RELEASE,
    runtimeManifestSha256: MANIFEST,
    authenticatedAt: "2026-08-13T04:29:50.000Z",
    expiresAt: EXPIRES_AT,
    transaction: transaction()
  });
}

function freshCapability(): BscTestnetPtaWbnbPoolFreshRecheckCapability {
  const timestamp = Math.floor(Date.parse("2026-08-13T04:29:30.000Z") / 1_000).toString();
  return {
    schemaVersion: 1,
    scope: BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    reviewerApprovalDigest: REVIEWER_DIGEST,
    ownerAuthorizationDigest: OWNER_DIGEST,
    claimId: "claim-pool-001",
    journalClaimToken: CLAIM_TOKEN,
    releaseCommit: RELEASE,
    runtimeManifestSha256: MANIFEST,
    authenticatedAt: AUTHENTICATED_AT,
    expiresAt: EXPIRES_AT,
    freshPostClaimDualRpcRecheckPerformed: true,
    rpc: {
      primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
      corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
      providerAgreementVerified: true,
      canonicalFinalizedBlockVerified: true,
      eip1898RequireCanonical: true,
      observedAt: AUTHENTICATED_AT,
      finalizedBlockNumber: "124775556",
      finalizedBlockHash: `0x${"66".repeat(32)}`,
      finalizedBlockTimestamp: timestamp,
      finalizedBlockGasLimit: "140000000",
      latestNonce: "1",
      pendingNonce: "1",
      factoryPool: "0x0000000000000000000000000000000000000000",
      candidateCode: "0x",
      senderCode: "0x",
      senderBalanceWei: "100000000000000000",
      gasEstimate: "4986547",
      gasPriceWei: "100000000",
      simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
    },
    transaction: transaction()
  };
}

function validatedRequest(): BscTestnetPtaWbnbPoolSigningWorkerRequest {
  const capability = freshCapability();
  const validation = validateBscTestnetPtaWbnbPoolFreshRecheckCapability(
    capability,
    {
      authorizedIntent: authorizedIntent(),
      claimId: capability.claimId
    },
    new Date("2026-08-13T04:30:01.000Z")
  );
  if (validation.status !== "valid") throw new Error(validation.issue.message);
  return buildBscTestnetPtaWbnbPoolSigningWorkerRequest(validation.intent);
}

function responseWithScalars(request: BscTestnetPtaWbnbPoolSigningWorkerRequest, r: Hex, s: Hex) {
  const signedTransaction = serializeTransaction(
    {
      type: "legacy",
      chainId: 97,
      nonce: 1,
      gasPrice: BigInt(request.transaction.gasPriceWei),
      gas: BigInt(request.transaction.gasLimit),
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      value: 0n,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
    },
    { r, s, v: 229n }
  );
  return {
    schemaVersion: 1,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
    status: "signed",
    oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: request.claimId,
    journalClaimToken: request.journalClaimToken,
    releaseCommit: request.releaseCommit,
    runtimeManifestSha256: request.runtimeManifestSha256,
    requestHash: request.requestHash,
    signingHash: request.transaction.signingHash,
    signedTransaction,
    transactionHash: keccak256(signedTransaction)
  };
}

describe("PTA/WBNB pool exact one-shot protocol", () => {
  it("pins the reviewed operation key and exact legacy EIP-155 unsigned transaction", () => {
    const exact = transaction();
    expect(BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY).toBe(
      "0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc"
    );
    expect(exact).toMatchObject({
      type: "legacy",
      nonce: "1",
      valueWei: "0",
      gasLimit: "5983857",
      gasPriceWei: "100000000",
      maximumCostWei: "598385700000000",
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
    });
    expect(keccak256(exact.serializedUnsignedTransaction)).toBe(exact.signingHash);
  });

  it("requires fresh dual-RPC balance, gas, finalized-block, nonce, pool, and simulation state", () => {
    const valid = freshCapability();
    expect(
      validateBscTestnetPtaWbnbPoolFreshRecheckCapability(
        valid,
        {
          authorizedIntent: authorizedIntent(),
          claimId: valid.claimId
        },
        new Date("2026-08-13T04:30:01.000Z")
      ).status
    ).toBe("valid");

    for (const mutation of [
      (value: ReturnType<typeof freshCapability>) =>
        Reflect.set(value.rpc, "senderBalanceWei", "1"),
      (value: ReturnType<typeof freshCapability>) =>
        Reflect.set(value.rpc, "gasEstimate", "4986548"),
      (value: ReturnType<typeof freshCapability>) =>
        Reflect.set(value.rpc, "gasPriceWei", "100000001"),
      (value: ReturnType<typeof freshCapability>) =>
        Reflect.set(value.rpc, "finalizedBlockGasLimit", "5000000"),
      (value: ReturnType<typeof freshCapability>) => Reflect.set(value.rpc, "pendingNonce", "2"),
      (value: ReturnType<typeof freshCapability>) =>
        Reflect.set(value.rpc, "factoryPool", BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE),
      (value: ReturnType<typeof freshCapability>) =>
        Reflect.set(value.rpc, "simulationReturnPool", "0x0000000000000000000000000000000000000000")
    ]) {
      const altered = structuredClone(valid);
      mutation(altered);
      expect(
        validateBscTestnetPtaWbnbPoolFreshRecheckCapability(
          altered,
          {
            authorizedIntent: authorizedIntent(),
            claimId: valid.claimId
          },
          new Date("2026-08-13T04:30:01.000Z")
        ).status
      ).toBe("invalid");
    }
  });

  it("binds release, manifest, both authorization digests, claim token and exact transaction", () => {
    const request = validatedRequest();
    expect(
      validateBscTestnetPtaWbnbPoolSigningWorkerRequest(
        request,
        new Date("2026-08-13T04:30:02.000Z")
      ).status
    ).toBe("valid");
    for (const key of [
      "releaseCommit",
      "runtimeManifestSha256",
      "reviewerApprovalDigest",
      "ownerAuthorizationDigest",
      "journalClaimToken"
    ] as const) {
      const altered = {
        ...request,
        [key]: key === "releaseCommit" ? "b".repeat(40) : `0x${"77".repeat(32)}`
      };
      expect(
        validateBscTestnetPtaWbnbPoolSigningWorkerRequest(
          altered,
          new Date("2026-08-13T04:30:02.000Z")
        ).status
      ).toBe("invalid");
    }
  });

  it("round-trips canonical signed RLP with short scalars and normalizes the parsed manager", async () => {
    const request = validatedRequest();
    const response = responseWithScalars(
      request,
      `0x${"00".repeat(31)}01`,
      `0x${"00".repeat(31)}02`
    );
    await expect(
      validateBscTestnetPtaWbnbPoolSigningWorkerResponse(response, request)
    ).resolves.toMatchObject({
      status: "valid",
      recoveredSigner: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49"
    });
  });

  it("rejects high-S, field changes, extra symbols, proxies, accessors, and malicious hash inputs", async () => {
    const request = validatedRequest();
    const highS = `0x${(
      BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141") / 2n +
      1n
    )
      .toString(16)
      .padStart(64, "0")}` as Hex;
    const response = responseWithScalars(request, `0x${"00".repeat(31)}01`, highS);
    await expect(
      validateBscTestnetPtaWbnbPoolSigningWorkerResponse(response, request)
    ).resolves.toMatchObject({ status: "invalid" });
    expect(
      validateBscTestnetPtaWbnbPoolSigningWorkerRequest(
        { ...request, [Symbol("extra")]: true },
        new Date("2026-08-13T04:30:02.000Z")
      ).status
    ).toBe("invalid");
    expect(
      validateBscTestnetPtaWbnbPoolSigningWorkerRequest(
        new Proxy(request, {}),
        new Date("2026-08-13T04:30:02.000Z")
      ).status
    ).toBe("invalid");
    let getterCalls = 0;
    const malicious = Object.defineProperty({}, "releaseCommit", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return RELEASE;
      }
    });
    expect(() => deriveBscTestnetPtaWbnbPoolSigningWorkerRequestHash(malicious)).toThrow();
    expect(getterCalls).toBe(0);
  });
});
