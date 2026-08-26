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
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  calculateBscTestnetPtaWbnbPoolGasLimit
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ATTEMPT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
  BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction,
  buildBscTestnetPtaWbnbPoolSigningWorkerRequest,
  deriveBscTestnetPtaWbnbPoolRecoveryAttemptId,
  deriveBscTestnetPtaWbnbPoolSigningWorkerRequestHash,
  parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse,
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
const PREDECESSOR_TERMINAL_RAW_SHA256 =
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256;
const RUNTIME_INSTANTIATION_DIGEST = `0x${"88".repeat(32)}` as Hex;
const RELEASE = "a".repeat(40);
const RELEASE_TREE = "b".repeat(40);
const AUTHENTICATED_AT = "2026-08-13T04:30:00.000Z";
const EXPIRES_AT = "2026-08-13T04:31:30.000Z";
const OWNER_AUTHENTICATED_AT = "2026-08-13T04:29:30.000Z";

function recovery() {
  const attemptId = deriveBscTestnetPtaWbnbPoolRecoveryAttemptId({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
    envelopeHash: ENVELOPE_HASH,
    runtimeReviewInstantiationDigest: RUNTIME_INSTANTIATION_DIGEST,
    releaseCommit: RELEASE,
    releaseTree: RELEASE_TREE,
    runtimeManifestSha256: MANIFEST
  });
  if (attemptId === null) throw new Error("Recovery attempt fixture failed.");
  return Object.freeze({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorState: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
    predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
    attemptId
  });
}

function transaction() {
  const result = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: "6600000",
    gasPriceWei: "100000000",
    sourceEnvelopeHash: ENVELOPE_HASH
  });
  if (result === null) throw new Error("Exact transaction fixture failed.");
  return result;
}

function authorizedIntent(): BscTestnetPtaWbnbPoolAuthorizedSigningIntent {
  return Object.freeze({
    schemaVersion: 9,
    scope: "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_9",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    reviewerApprovalDigest: REVIEWER_DIGEST,
    ownerAuthorizationDigest: OWNER_DIGEST,
    releaseCommit: RELEASE,
    runtimeManifestSha256: MANIFEST,
    authenticatedAt: OWNER_AUTHENTICATED_AT,
    expiresAt: EXPIRES_AT,
    recovery: recovery(),
    transaction: transaction()
  });
}

function freshCapability(): BscTestnetPtaWbnbPoolFreshRecheckCapability {
  const timestamp = Math.floor(Date.parse("2026-08-13T04:29:30.000Z") / 1_000).toString();
  return {
    schemaVersion: 9,
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
    recovery: recovery(),
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
      latestNonce: "9",
      pendingNonce: "9",
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
      nonce: 9,
      gasPrice: BigInt(request.transaction.gasPriceWei),
      gas: BigInt(request.transaction.gasLimit),
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      value: 0n,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
    },
    { r, s, v: 229n }
  );
  return {
    schemaVersion: 9,
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
  it("uses one fixed signed gas limit across bounded estimate drift", () => {
    expect(calculateBscTestnetPtaWbnbPoolGasLimit(4_986_547n)).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT
    );
    expect(calculateBscTestnetPtaWbnbPoolGasLimit(5_012_641n)).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT
    );
    expect(calculateBscTestnetPtaWbnbPoolGasLimit(5_500_000n)).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT
    );
    expect(calculateBscTestnetPtaWbnbPoolGasLimit(5_500_001n)).toBeNull();
  });

  it("pins immutable predecessor lineage through the exact generation-8 terminal", () => {
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256).toBe(
      "0x613df995936c3ccfff56e5da5588906f1bd28340ae8297eb08524274b9b8e1c3"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256).toBe(
      "0x7ff780a8f0ac1a1f8ff7bced5d858259f918cdb1891c684aa208b6bca31c9585"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256).toBe(
      "0x2e0570423b1217f1dab6fa8cdb91a0a75b2d78023bacc611a6c81017d0033bab"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_CLAIM_RAW_SHA256).toBe(
      "0x0d76c35b7d6cdec488b8b79dafcefacc597c79f057fe722a2202d284515017f1"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256).toBe(
      "0x39a6295f3f816cb5bba6c8c3be11982bcafa45847608e1150de950738217c8c9"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_FAILED_BEFORE_WORKER_OUTCOME_DIGEST).toBe(
      "0x7db76f9069e2d46d674eaccb2c7453489e8b80ca1940288b49ac7da46196a93a"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_CLAIM_RAW_SHA256).toBe(
      "0x2f7dffbe7fef710273206009a06c7e460fa9f289b2403d6760c805707467e2ed"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256).toBe(
      "0x4a64cc2ef48529e271152004e31dfb7d35511d0a5691815838849c831638d6f7"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST).toBe(
      "0xfbece16f72e4ed39317a2ff6ad56933448150e8f8f9f3a86df8f77f793219f73"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_CLAIM_RAW_SHA256).toBe(
      "0xceec9b1e6de22bc8eb11c9f1bea3d6cec730e34e1ce8f306705fa4782c39c3bd"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256).toBe(
      "0x97bb22de4f86b517af0b517f6765d77896da7881708da6589d17703790abc3dc"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_FAILED_BEFORE_WORKER_OUTCOME_DIGEST).toBe(
      "0x62e2b9de9aecc9fd7a1377bb1f9c23ee2ad8e8c34ed04ecdeb289340e694514b"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256).toBe(
      "0x5a85737428a4bbd06459ceab52d6096fba74aa1c002de31a24c942ff9f3954f6"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256).toBe(
      "0x3210fd8ab08c2282a5da1aeb426984592fed9a5b3a6832ac7d60991baaf4fc6d"
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_FAILED_BEFORE_WORKER_OUTCOME_DIGEST).toBe(
      "0x15b8bd2046fdac833c932d21deea39e7901bb97398622ad03e7625167e19d469"
    );
  });
  it("pins the reviewed operation key and exact legacy EIP-155 unsigned transaction", () => {
    const exact = transaction();
    expect(BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY).toBe(
      "0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc"
    );
    expect(exact).toMatchObject({
      type: "legacy",
      nonce: "9",
      valueWei: "0",
      gasLimit: "6600000",
      gasPriceWei: "100000000",
      maximumCostWei: "660000000000000",
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
    });
    expect(keccak256(exact.serializedUnsignedTransaction)).toBe(exact.signingHash);
  });

  it("derives generation-9 attempt IDs from canonical full release identity and rejects drift", () => {
    const exact = recovery().attemptId;
    expect(exact).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(exact).not.toBe(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ATTEMPT_ID);
    expect(
      deriveBscTestnetPtaWbnbPoolRecoveryAttemptId({
        generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
        predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
        envelopeHash: ENVELOPE_HASH,
        runtimeReviewInstantiationDigest: RUNTIME_INSTANTIATION_DIGEST,
        releaseCommit: RELEASE,
        releaseTree: RELEASE_TREE,
        runtimeManifestSha256: MANIFEST
      })
    ).toBe(exact);
    for (const mutation of [
      { predecessorTerminalRawSha256: `0x${"99".repeat(32)}` as Hex },
      { envelopeHash: `0x${"aa".repeat(32)}` as Hex },
      { runtimeReviewInstantiationDigest: `0x${"bb".repeat(32)}` as Hex },
      { releaseCommit: "c".repeat(40) },
      { releaseTree: "d".repeat(40) },
      { runtimeManifestSha256: `0x${"cc".repeat(32)}` as Hex }
    ]) {
      expect(
        deriveBscTestnetPtaWbnbPoolRecoveryAttemptId({
          generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
          predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
          envelopeHash: ENVELOPE_HASH,
          runtimeReviewInstantiationDigest: RUNTIME_INSTANTIATION_DIGEST,
          releaseCommit: RELEASE,
          releaseTree: RELEASE_TREE,
          runtimeManifestSha256: MANIFEST,
          ...mutation
        })
      ).not.toBe(exact);
    }
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

  it("accepts only an exact 120-second owner execution authority", () => {
    const exact = authorizedIntent();
    expect(parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse(exact)).not.toBeNull();

    for (const expiresAt of [
      "2026-08-13T04:30:29.999Z",
      "2026-08-13T04:30:30.001Z",
      "2026-08-13T04:34:30.000Z"
    ]) {
      expect(
        parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse(
          Object.freeze({ ...exact, expiresAt })
        )
      ).toBeNull();
    }
  });

  it("rejects retired intent replay and every generation-9 recovery binding mutation", () => {
    const exact = authorizedIntent();
    expect(
      parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse(
        Object.freeze({
          ...exact,
          schemaVersion: 1,
          scope: "owner_designated_internal_release_policy_and_exact_owner_pool_initialization"
        })
      )
    ).toBeNull();
    for (const alteredRecovery of [
      { ...exact.recovery, generation: 1 },
      { ...exact.recovery, predecessorState: "claimed" },
      { ...exact.recovery, predecessorTerminalRawSha256: `0x${"12".repeat(32)}` },
      { ...exact.recovery, attemptId: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ATTEMPT_ID }
    ]) {
      expect(
        parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse(
          Object.freeze({ ...exact, recovery: Object.freeze(alteredRecovery) })
        )
      ).toBeNull();
    }
    for (const alteredRecovery of [
      { ...exact.recovery, predecessorTerminalRawSha256: `0x${"12".repeat(32)}` },
      { ...exact.recovery, attemptId: `0x${"13".repeat(32)}` }
    ]) {
      const capability = freshCapability();
      expect(
        validateBscTestnetPtaWbnbPoolFreshRecheckCapability(
          { ...capability, recovery: Object.freeze(alteredRecovery) },
          { authorizedIntent: exact, claimId: capability.claimId },
          new Date("2026-08-13T04:30:01.000Z")
        ).status
      ).toBe("invalid");
    }
  });

  it("binds a refreshed post-claim timestamp after owner confirmation to the exact owner expiry", () => {
    const intent = authorizedIntent();
    const valid = freshCapability();
    expect(
      validateBscTestnetPtaWbnbPoolFreshRecheckCapability(
        valid,
        { authorizedIntent: intent, claimId: valid.claimId },
        new Date("2026-08-13T04:30:01.000Z")
      )
    ).toMatchObject({ status: "valid", intent: { authenticatedAt: AUTHENTICATED_AT } });

    for (const altered of [
      {
        ...valid,
        authenticatedAt: "2026-08-13T04:29:29.999Z",
        rpc: { ...valid.rpc, observedAt: "2026-08-13T04:29:29.999Z" }
      },
      { ...valid, expiresAt: "2026-08-13T04:30:29.999Z" }
    ]) {
      expect(
        validateBscTestnetPtaWbnbPoolFreshRecheckCapability(
          altered,
          { authorizedIntent: intent, claimId: valid.claimId },
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

  it("rejects a correctly hashed worker request carrying a five-minute capability", () => {
    const request = validatedRequest();
    const { requestHash: _requestHash, ...body } = request;
    void _requestHash;
    const longBody = {
      ...body,
      expiresAt: "2026-08-13T04:35:00.000Z"
    };
    const longRequest = Object.freeze({
      ...longBody,
      requestHash: deriveBscTestnetPtaWbnbPoolSigningWorkerRequestHash(longBody)
    });
    expect(
      validateBscTestnetPtaWbnbPoolSigningWorkerRequest(
        longRequest,
        new Date("2026-08-13T04:30:02.000Z")
      ).status
    ).toBe("invalid");
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
