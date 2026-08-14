import { createHash } from "node:crypto";

import { keccak256, serializeTransaction, type Hex } from "viem";
import type * as ViemModule from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
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
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_SIGNED_READBACK_OPERATION,
  createBscTestnetPtaWbnbPoolOneShotSignerCoreForTests,
  createBscTestnetPtaWbnbPoolProductionOneShotSignerCore,
  type BscTestnetPtaWbnbPoolDurableClaimRequest,
  type BscTestnetPtaWbnbPoolDurableSignedReadbackRequest,
  type BscTestnetPtaWbnbPoolPostClaimRecheckRequest
} from "./bsc-testnet-pta-wbnb-pool-one-shot-signer-core";
import {
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE,
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
  BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction,
  type BscTestnetPtaWbnbPoolAuthorizedSigningIntent,
  type BscTestnetPtaWbnbPoolFreshRecheckCapability,
  type BscTestnetPtaWbnbPoolSigningWorkerRequest
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  createBscTestnetPtaWbnbPoolLocalJournalCore,
  deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256,
  type BscTestnetPtaWbnbPoolLocalJournalPorts
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import { createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse } from "./bsc-testnet-pta-wbnb-pool-signing-worker";

const ENVELOPE_HASH = `0x${"11".repeat(32)}` as Hex;
const REVIEWER_DIGEST = `0x${"22".repeat(32)}` as Hex;
const OWNER_DIGEST = `0x${"33".repeat(32)}` as Hex;
const CLAIM_TOKEN = `0x${"44".repeat(32)}` as Hex;
const MANIFEST = `0x${"55".repeat(32)}` as Hex;
const PREDECESSOR_FENCE_SHA256 = `0x${"88".repeat(32)}` as Hex;
const ATTEMPT_ID = `0x${"99".repeat(32)}` as Hex;
const RELEASE = "a".repeat(40);
const NOW = "2026-08-13T04:30:01.000Z";

const RECOVERY = Object.freeze({
  generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
  predecessorState: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
  predecessorFenceSha256: PREDECESSOR_FENCE_SHA256,
  attemptId: ATTEMPT_ID
});

function exactTransaction() {
  const result = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: "5983857",
    gasPriceWei: "100000000",
    sourceEnvelopeHash: ENVELOPE_HASH
  });
  if (result === null) throw new Error("Transaction fixture failed.");
  return result;
}

function authorizedIntent(): BscTestnetPtaWbnbPoolAuthorizedSigningIntent {
  return Object.freeze({
    schemaVersion: 2,
    scope: "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_2",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    reviewerApprovalDigest: REVIEWER_DIGEST,
    ownerAuthorizationDigest: OWNER_DIGEST,
    releaseCommit: RELEASE,
    runtimeManifestSha256: MANIFEST,
    authenticatedAt: "2026-08-13T04:29:45.000Z",
    expiresAt: "2026-08-13T04:30:30.000Z",
    recovery: RECOVERY,
    transaction: exactTransaction()
  });
}

function freshCapability(): BscTestnetPtaWbnbPoolFreshRecheckCapability {
  return {
    schemaVersion: 2,
    scope: BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    reviewerApprovalDigest: REVIEWER_DIGEST,
    ownerAuthorizationDigest: OWNER_DIGEST,
    claimId: "claim-pool-001",
    journalClaimToken: CLAIM_TOKEN,
    releaseCommit: RELEASE,
    runtimeManifestSha256: MANIFEST,
    authenticatedAt: "2026-08-13T04:30:00.000Z",
    expiresAt: "2026-08-13T04:30:30.000Z",
    recovery: RECOVERY,
    freshPostClaimDualRpcRecheckPerformed: true,
    rpc: {
      primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
      corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
      providerAgreementVerified: true,
      canonicalFinalizedBlockVerified: true,
      eip1898RequireCanonical: true,
      observedAt: "2026-08-13T04:30:00.000Z",
      finalizedBlockNumber: "124775556",
      finalizedBlockHash: `0x${"66".repeat(32)}`,
      finalizedBlockTimestamp: Math.floor(
        Date.parse("2026-08-13T04:29:30.000Z") / 1_000
      ).toString(),
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
    transaction: exactTransaction()
  };
}

function signedResponse(request: BscTestnetPtaWbnbPoolSigningWorkerRequest) {
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
    { r: `0x${"00".repeat(31)}01`, s: `0x${"00".repeat(31)}02`, v: 229n }
  );
  return {
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION,
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

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function harness(
  overrides: Partial<{
    authenticatedIntent: boolean;
    authenticatedRecheck: boolean;
    claim: (request: BscTestnetPtaWbnbPoolDurableClaimRequest) => Promise<unknown>;
    recheck: (request: BscTestnetPtaWbnbPoolPostClaimRecheckRequest) => Promise<unknown>;
    authorizeWorker: (request: BscTestnetPtaWbnbPoolSigningWorkerRequest) => Promise<unknown>;
    worker: (request: BscTestnetPtaWbnbPoolSigningWorkerRequest) => Promise<unknown>;
    readback: (request: BscTestnetPtaWbnbPoolDurableSignedReadbackRequest) => Promise<unknown>;
  }> = {}
) {
  const intent = authorizedIntent();
  const capability = freshCapability();
  const intentBrands = new WeakSet<object>();
  const recheckBrands = new WeakSet<object>();
  if (overrides.authenticatedIntent !== false) intentBrands.add(intent);
  if (overrides.authenticatedRecheck !== false) recheckBrands.add(capability);
  const order: string[] = [];
  const calls = {
    acquireIntent: vi.fn(async () => {
      order.push("authorization");
      return intent;
    }),
    authenticateIntent: vi.fn(
      (value: unknown) => typeof value === "object" && value !== null && intentBrands.has(value)
    ),
    claim: vi.fn(
      overrides.claim ??
        (async () => {
          order.push("claim");
          return { status: "claimed", claimId: "claim-pool-001" };
        })
    ),
    recheck: vi.fn(
      overrides.recheck ??
        (async () => {
          order.push("recheck");
          return capability;
        })
    ),
    authenticateRecheck: vi.fn(
      (value: unknown) => typeof value === "object" && value !== null && recheckBrands.has(value)
    ),
    authorizeWorker: vi.fn(
      overrides.authorizeWorker ??
        (async () => {
          order.push("worker_authorization");
          return { status: "worker_authorized" };
        })
    ),
    worker: vi.fn(
      overrides.worker ??
        (async (request: BscTestnetPtaWbnbPoolSigningWorkerRequest) => {
          order.push("worker_signed_and_committed");
          return signedResponse(request);
        })
    ),
    readback: vi.fn(
      overrides.readback ??
        (async () => {
          order.push("signed_commit_readback");
          return { status: "signed_commit_verified" };
        })
    )
  };
  const core = createBscTestnetPtaWbnbPoolOneShotSignerCoreForTests({
    asOf: () => new Date(NOW),
    acquireAuthorizedIntent: calls.acquireIntent,
    authenticateAuthorizedIntent: calls.authenticateIntent,
    claimExactInitialization: calls.claim,
    acquireFreshPostClaimRecheck: calls.recheck,
    authenticateFreshPostClaimRecheck: calls.authenticateRecheck,
    authorizeExactWorker: calls.authorizeWorker,
    invokeExactSigningWorker: calls.worker,
    readBackSignedCommit: calls.readback
  });
  return { core, calls, order, intent, capability };
}

describe("PTA/WBNB pool one-shot signer core", () => {
  it("keeps production blocked and exposes a zero-argument non-generic API", async () => {
    const core = createBscTestnetPtaWbnbPoolProductionOneShotSignerCore();
    expect(core.signOnce.length).toBe(0);
    await expect(core.signOnce()).resolves.toMatchObject({
      status: "blocked_before_claim",
      retryAllowed: false,
      issue: { code: "PRODUCTION_AUTHORIZATION_UNAVAILABLE" },
      boundary: {
        genericSigningApiExposed: false,
        productionAuthorizationIssuerPresent: false,
        broadcastPerformedByCore: false,
        mainnetWritePossible: false
      }
    });
  });

  it("orders atomic claim before fresh recheck, journal authorization, worker commit, and readback", async () => {
    const { core, calls, order } = harness();
    const result = await core.signOnce();
    expect(result).toMatchObject({
      status: "signed_committed",
      retryAllowed: false,
      durableClaimOutcome: "claimed_and_signed_committed",
      transactionSubmitted: false,
      broadcastAuthorized: false
    });
    expect(order).toEqual([
      "authorization",
      "claim",
      "recheck",
      "worker_authorization",
      "worker_signed_and_committed",
      "signed_commit_readback"
    ]);
    expect(calls.claim.mock.calls[0]?.[0]).toMatchObject({
      schemaVersion: 2,
      operation: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_OPERATION,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash: ENVELOPE_HASH,
      releaseCommit: RELEASE,
      runtimeManifestSha256: MANIFEST,
      reviewerApprovalDigest: REVIEWER_DIGEST,
      ownerAuthorizationDigest: OWNER_DIGEST,
      recovery: RECOVERY,
      gasLimit: "5983857",
      gasPriceWei: "100000000",
      maximumCostWei: "598385700000000"
    });
    expect(calls.recheck.mock.calls[0]?.[0]).toMatchObject({
      claimId: "claim-pool-001",
      recovery: RECOVERY
    });
    expect(calls.readback.mock.calls[0]?.[0]).toMatchObject({
      schemaVersion: 2,
      operation: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_SIGNED_READBACK_OPERATION,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash: ENVELOPE_HASH,
      releaseCommit: RELEASE,
      runtimeManifestSha256: MANIFEST,
      recovery: RECOVERY
    });
  });

  it("single-flights concurrent signOnce calls and creates one claim", async () => {
    const gate = deferred<unknown>();
    const { core, calls } = harness({ claim: async () => gate.promise });
    const first = core.signOnce();
    const second = core.signOnce();
    const third = core.signOnce();
    expect(first).toBe(second);
    expect(second).toBe(third);
    await vi.waitFor(() => expect(calls.claim).toHaveBeenCalledTimes(1));
    expect(core.getState()).toBe("claiming");
    gate.resolve({ status: "already_exists", state: "claimed" });
    const results = await Promise.all([first, second, third]);
    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
    expect(results[0]).toMatchObject({ status: "do_not_retry", retryAllowed: false });
  });

  it("requires an authenticated authorization brand before claim", async () => {
    const { core, calls } = harness({ authenticatedIntent: false });
    await expect(core.signOnce()).resolves.toMatchObject({
      status: "blocked_before_claim",
      issue: { code: "AUTHORIZATION_AUTHENTICATION_FAILED" }
    });
    expect(calls.claim).not.toHaveBeenCalled();
    expect(calls.recheck).not.toHaveBeenCalled();
    expect(calls.worker).not.toHaveBeenCalled();
  });

  it("requires a freshly authenticated post-claim dual-RPC capability", async () => {
    const { core, calls } = harness({ authenticatedRecheck: false });
    await expect(core.signOnce()).resolves.toMatchObject({
      status: "do_not_retry",
      retryAllowed: false,
      durableClaimOutcome: "claimed",
      issue: { code: "POST_CLAIM_RECHECK_AUTHENTICATION_FAILED" }
    });
    expect(calls.authorizeWorker).not.toHaveBeenCalled();
    expect(calls.worker).not.toHaveBeenCalled();
  });

  it("treats every ambiguous post-claim transition as terminal without retry", async () => {
    const cases = [
      { key: "recheck", override: { recheck: async () => Promise.reject(new Error("rpc")) } },
      {
        key: "authorization",
        override: { authorizeWorker: async () => Promise.reject(new Error("journal")) }
      },
      { key: "worker", override: { worker: async () => Promise.reject(new Error("sign")) } },
      { key: "readback", override: { readback: async () => Promise.reject(new Error("read")) } }
    ] as const;
    for (const testCase of cases) {
      const { core, calls } = harness(testCase.override);
      const first = await core.signOnce();
      const second = await core.signOnce();
      expect(first).toBe(second);
      expect(first).toMatchObject({
        status: "do_not_retry",
        retryAllowed: false,
        durableClaimOutcome: "claimed"
      });
      expect(calls.claim).toHaveBeenCalledTimes(1);
      if (testCase.key === "recheck" || testCase.key === "authorization") {
        expect(calls.worker).not.toHaveBeenCalled();
      }
    }
  });

  it("withholds raw bytes unless exact durable signed-commit readback succeeds", async () => {
    const { core, calls } = harness({ readback: async () => ({ status: "not_verified" }) });
    await expect(core.signOnce()).resolves.toMatchObject({
      status: "do_not_retry",
      signatureOutcome: "validated_commit_unknown",
      signedTransaction: null,
      transactionHash: null,
      issue: { code: "COMMIT_OUTCOME_UNKNOWN" }
    });
    expect(calls.worker).toHaveBeenCalledTimes(1);
    expect(calls.readback).toHaveBeenCalledTimes(1);
  });

  it("composes one real in-memory journal and worker without attempting a second signed commit", async () => {
    const files = new Map<string, string>();
    const journalPorts: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
      now: () => new Date(NOW),
      listNames: async () => Object.freeze([...files.keys()].sort()),
      readBounded: async (name: string) => files.get(name) ?? null,
      createExclusive: async (name: string, content: string) => {
        if (files.has(name)) return "exists" as const;
        files.set(name, content);
        return "created" as const;
      },
      createExclusiveFenceFromFactory: async (name: string, contentFactory: () => string) => {
        if (files.has(name)) return "exists" as const;
        files.set(name, "");
        files.set(name, contentFactory());
        return "created" as const;
      },
      assertSecure: async (names: readonly string[]) =>
        Object.freeze({
          verified: true as const,
          ownerSid: "S-1-5-21-1",
          accessRulesProtected: true as const,
          currentUserOnlyFullControl: true as const,
          checkedPaths: names.length + 1
        })
    });
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(
      journalPorts,
      BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
    );
    const intent = authorizedIntent();
    const intentBrands = new WeakSet<object>([intent]);
    const capabilityBrands = new WeakSet<object>();
    let claimError: unknown = null;
    let workerError: unknown = null;
    const claimAdapter = async (request: BscTestnetPtaWbnbPoolDurableClaimRequest) => {
      const claimBody = {
        operationKey: request.operationKey,
        envelopeHash: request.envelopeHash,
        signingHash: request.signingHash,
        serializedUnsignedSha256: `0x${createHash("sha256")
          .update(Buffer.from(request.serializedUnsignedTransaction.slice(2), "hex"))
          .digest("hex")}` as Hex,
        gasLimit: request.gasLimit,
        gasPriceWei: request.gasPriceWei,
        maxCostWei: request.maximumCostWei,
        reviewerApprovalDigest: request.reviewerApprovalDigest,
        ownerAuthorizationDigest: request.ownerAuthorizationDigest,
        generation: request.recovery.generation,
        predecessorState: request.recovery.predecessorState,
        predecessorFenceSha256: request.recovery.predecessorFenceSha256,
        attemptId: request.recovery.attemptId,
        releaseCommit: request.releaseCommit,
        runtimeManifestSha256: request.runtimeManifestSha256,
        authorizedAt: intent.authenticatedAt,
        expiresAt: intent.expiresAt
      };
      let result;
      try {
        result = await journal.claimExactInitialization({
          ...claimBody,
          authorizationReceiptSha256:
            deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256(claimBody)
        });
      } catch (error) {
        claimError = error;
        throw error;
      }
      return result.status === "claimed"
        ? result
        : { status: "already_exists" as const, state: result.state };
    };
    const freshRecheck = async (request: BscTestnetPtaWbnbPoolPostClaimRecheckRequest) => {
      const capability = { ...freshCapability(), claimId: request.claimId };
      capabilityBrands.add(capability);
      return capability;
    };
    const authorizeWorker = async (request: BscTestnetPtaWbnbPoolSigningWorkerRequest) => {
      const state = await journal.readState();
      if (
        state.claimId === null ||
        state.operationKey === null ||
        state.envelopeHash === null ||
        state.authorizationReceiptSha256 === null ||
        state.signingHash === null ||
        state.serializedUnsignedSha256 === null ||
        state.reviewerApprovalDigest === null ||
        state.ownerAuthorizationDigest === null ||
        state.releaseCommit === null ||
        state.runtimeManifestSha256 === null ||
        state.generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION ||
        state.predecessorState === null ||
        state.predecessorFenceSha256 === null ||
        state.attemptId === null
      ) {
        throw new Error("missing journal binding");
      }
      return journal.authorizeWorker({
        claimId: state.claimId,
        operationKey: state.operationKey,
        envelopeHash: state.envelopeHash,
        authorizationReceiptSha256: state.authorizationReceiptSha256,
        signingHash: state.signingHash,
        serializedUnsignedSha256: state.serializedUnsignedSha256,
        reviewerApprovalDigest: state.reviewerApprovalDigest,
        ownerAuthorizationDigest: state.ownerAuthorizationDigest,
        releaseCommit: state.releaseCommit,
        runtimeManifestSha256: state.runtimeManifestSha256,
        generation: state.generation,
        predecessorState: state.predecessorState,
        predecessorFenceSha256: state.predecessorFenceSha256,
        attemptId: state.attemptId,
        workerRequestHash: request.requestHash,
        authorizationTokenDigest: keccak256(request.journalClaimToken)
      });
    };
    const releaseTrust = Object.freeze({
      schemaVersion: 1 as const,
      releaseCommit: RELEASE,
      originReference: "refs/remotes/origin/main" as const,
      cleanPublishedHead: true as const,
      workerSourceSha256: `0x${"77".repeat(32)}` as Hex,
      runtimeManifestSha256: MANIFEST
    });
    const worker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse({
      now: () => new Date(NOW),
      inspectReleaseTrust: async () => releaseTrust,
      consumeWorkerAuthorization: journal.consumeWorkerAuthorization,
      commitSignedTransaction: journal.commitWorkerSignedTransaction,
      attestExactTransaction: async (
        rawTransaction: Hex,
        request: BscTestnetPtaWbnbPoolSigningWorkerRequest
      ) => {
        const response = signedResponse(request);
        return response.signedTransaction === rawTransaction ? response : null;
      },
      signExactTransaction: async () =>
        serializeTransaction(
          {
            type: "legacy",
            chainId: 97,
            nonce: 1,
            gasPrice: 100_000_000n,
            gas: 5_983_857n,
            to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
            value: 0n,
            data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
          },
          { r: `0x${"00".repeat(31)}01`, s: `0x${"00".repeat(31)}02`, v: 229n }
        )
    });
    const core = createBscTestnetPtaWbnbPoolOneShotSignerCoreForTests({
      asOf: () => new Date(NOW),
      acquireAuthorizedIntent: async () => intent,
      authenticateAuthorizedIntent: (value: unknown) =>
        typeof value === "object" && value !== null && intentBrands.has(value),
      claimExactInitialization: claimAdapter,
      acquireFreshPostClaimRecheck: freshRecheck,
      authenticateFreshPostClaimRecheck: (value: unknown) =>
        typeof value === "object" && value !== null && capabilityBrands.has(value),
      authorizeExactWorker: authorizeWorker,
      invokeExactSigningWorker: async (request: BscTestnetPtaWbnbPoolSigningWorkerRequest) => {
        try {
          return await worker.invokeExactSigningWorker(request);
        } catch (error) {
          workerError = error;
          throw error;
        }
      },
      readBackSignedCommit: async (request: BscTestnetPtaWbnbPoolDurableSignedReadbackRequest) => {
        const state = await journal.readState();
        return state.status === "signed_committed" &&
          state.claimId === request.claimId &&
          state.operationKey === request.operationKey &&
          state.transactionHash === request.transactionHash &&
          state.serializedTransaction === request.signedTransaction
          ? { status: "signed_commit_verified" as const }
          : { status: "not_verified" as const };
      }
    });
    const integratedResult = await core.signOnce();
    expect(claimError).toBeNull();
    expect(workerError).toBeNull();
    await expect(journal.readState()).resolves.toMatchObject({ status: "signed_committed" });
    expect(integratedResult.issue).toBeNull();
    expect(integratedResult).toMatchObject({ status: "signed_committed" });
    expect(files.has("04-transition.v2.json")).toBe(true);
    expect(files.size).toBe(4);
  });
});
