import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import type * as OneShotBoundaryModule from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";
import type * as OneShotSignerModule from "./bsc-testnet-pta-wbnb-pool-one-shot-signer-core";
import type * as SubmissionReconcilerModule from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";

vi.mock("server-only", () => ({}));
const doubles = vi.hoisted(() => ({
  describe: vi.fn(),
  reconcile: vi.fn(),
  recoveryFactory: vi.fn(),
  signOnce: vi.fn()
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server", async (importOriginal) => {
  const original = await importOriginal<typeof OneShotBoundaryModule>();
  return { ...original, describeBscTestnetPtaWbnbPoolOneShotBoundary: doubles.describe };
});
vi.mock("./bsc-testnet-pta-wbnb-pool-one-shot-signer-core", async (importOriginal) => {
  const original = await importOriginal<typeof OneShotSignerModule>();
  return {
    ...original,
    createBscTestnetPtaWbnbPoolOneShotSignerCoreForInternalUse: vi.fn(() => ({
      signOnce: doubles.signOnce
    }))
  };
});
vi.mock("./bsc-testnet-pta-wbnb-pool-submission-reconciler.server", async (importOriginal) => {
  const original = await importOriginal<typeof SubmissionReconcilerModule>();
  doubles.recoveryFactory.mockImplementation(() => ({
    submitAndReconcileOnce: doubles.reconcile
  }));
  return {
    ...original,
    createBscTestnetPtaWbnbPoolReconciliationRecoveryCoreForInternalUse: doubles.recoveryFactory
  };
});

import {
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import type { BscTestnetPtaWbnbPoolAuthorizedSigningIntent } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse,
  reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse,
  type BscTestnetPtaWbnbPoolFixedProductionPorts
} from "./bsc-testnet-pta-wbnb-pool-production-composition.server";
import type { BscTestnetPtaWbnbPoolLocalJournalState } from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import type { BscTestnetPtaWbnbPoolPrivateBroadcaster } from "./bsc-testnet-pta-wbnb-pool-private-broadcaster.server";
import type { BscTestnetPtaWbnbPoolSubmissionRecoveryState } from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";

const COMPOSITION_SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-production-composition.server.ts", import.meta.url),
  "utf8"
);

const EMPTY_SIGNING_STATE: BscTestnetPtaWbnbPoolLocalJournalState = Object.freeze({
  status: "empty",
  claimId: null,
  operationKey: null,
  envelopeHash: null,
  authorizationReceiptSha256: null,
  signingHash: null,
  serializedUnsignedSha256: null,
  reviewerApprovalDigest: null,
  ownerAuthorizationDigest: null,
  releaseCommit: null,
  runtimeManifestSha256: null,
  gasLimit: null,
  gasPriceWei: null,
  maxCostWei: null,
  authorizedAt: null,
  expiresAt: null,
  serializedTransaction: null,
  transactionHash: null
});

function inertPorts(
  recoveryState: BscTestnetPtaWbnbPoolSubmissionRecoveryState,
  signingState: BscTestnetPtaWbnbPoolLocalJournalState = EMPTY_SIGNING_STATE
): Readonly<{
  ports: BscTestnetPtaWbnbPoolFixedProductionPorts;
  intentReads: () => number;
  issueWorker: ReturnType<typeof vi.fn>;
}> {
  let intentReadCount = 0;
  const issueWorker = vi.fn();
  const ports: BscTestnetPtaWbnbPoolFixedProductionPorts = {
    now: () => new Date("2026-08-13T08:00:20.000Z"),
    get intent(): BscTestnetPtaWbnbPoolAuthorizedSigningIntent {
      intentReadCount += 1;
      throw new Error("intent must remain unreachable");
    },
    get executionCapability(): object {
      throw new Error("execution capability must remain unreachable");
    },
    authenticateAuthorizedIntent: vi.fn(() => false),
    signingJournal: {
      claimExactInitialization: vi.fn(),
      authorizeWorker: vi.fn(),
      startWorker: vi.fn(),
      consumeWorkerAuthorization: vi.fn(),
      commitWorkerSignedTransaction: vi.fn(),
      failBeforeSubmission: vi.fn(),
      recordUnknownOutcome: vi.fn(),
      readState: vi.fn(async () => signingState)
    },
    submissionJournal: {
      initializeSignedCommit: vi.fn(),
      readRecoveryState: vi.fn(async () => recoveryState),
      readState: vi.fn(),
      commitSubmissionStarted: vi.fn(),
      commitTerminalReconciliation: vi.fn()
    },
    issueWorker,
    get broadcaster(): BscTestnetPtaWbnbPoolPrivateBroadcaster {
      throw new Error("broadcaster must remain unreachable");
    }
  };
  return Object.freeze({ ports, intentReads: () => intentReadCount, issueWorker });
}

function retainedRecoveryState(
  state: "signed_committed" | "submission_started" | "confirmed" | "reverted",
  transactionHash: `0x${string}`
): BscTestnetPtaWbnbPoolSubmissionRecoveryState {
  return Object.freeze({
    state,
    reconciliationDigest:
      state === "confirmed" || state === "reverted" ? `0x${"45".repeat(32)}` : null,
    capability: Object.freeze({ transaction: Object.freeze({ transactionHash }) })
  }) as unknown as BscTestnetPtaWbnbPoolSubmissionRecoveryState;
}

function retainedTerminalPair(
  state: "confirmed" | "reverted",
  transactionHash: `0x${string}`,
  reconciliationDigest: `0x${string}` = `0x${"45".repeat(32)}`
): Readonly<{
  recoveryState: BscTestnetPtaWbnbPoolSubmissionRecoveryState;
  signingState: BscTestnetPtaWbnbPoolLocalJournalState;
}> {
  const capability = Object.freeze({
    claimId: "claim-terminal-recovery-1",
    envelopeHash: `0x${"47".repeat(32)}` as const,
    releaseCommit: "3".repeat(40),
    runtimeManifestSha256: `0x${"48".repeat(32)}` as const,
    reviewerApprovalDigest: `0x${"49".repeat(32)}` as const,
    ownerAuthorizationDigest: `0x${"4a".repeat(32)}` as const,
    authenticatedAt: "2026-08-13T08:00:10.000Z",
    expiresAt: "2026-08-13T08:00:40.000Z",
    transaction: Object.freeze({
      signedTransaction: "0x01" as const,
      transactionHash,
      gasLimit: "6000000",
      gasPriceWei: "100000000",
      maximumCostWei: "600000000000000",
      signingHash: `0x${"4b".repeat(32)}` as const
    })
  });
  return Object.freeze({
    recoveryState: Object.freeze({
      state,
      reconciliationDigest,
      capability
    }) as unknown as BscTestnetPtaWbnbPoolSubmissionRecoveryState,
    signingState: Object.freeze({
      ...EMPTY_SIGNING_STATE,
      status: "signed_committed" as const,
      claimId: capability.claimId,
      envelopeHash: capability.envelopeHash,
      releaseCommit: capability.releaseCommit,
      runtimeManifestSha256: capability.runtimeManifestSha256,
      reviewerApprovalDigest: capability.reviewerApprovalDigest,
      ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
      authorizedAt: capability.authenticatedAt,
      expiresAt: capability.expiresAt,
      serializedTransaction: capability.transaction.signedTransaction,
      transactionHash,
      gasLimit: capability.transaction.gasLimit,
      gasPriceWei: capability.transaction.gasPriceWei,
      maxCostWei: capability.transaction.maximumCostWei,
      signingHash: capability.transaction.signingHash
    })
  });
}

describe("PTA/WBNB fresh production composition", () => {
  it("re-reads both journals before parsing the envelope or touching activated authority", async () => {
    const harness = inertPorts(
      { state: "empty" },
      {
        ...EMPTY_SIGNING_STATE,
        status: "claimed",
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY
      }
    );
    const composition = createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(
      harness.ports
    );

    await expect(composition.runOnce(new Proxy({}, {}))).resolves.toMatchObject({
      status: "blocked",
      code: "FRESH_JOURNALS_CHANGED_AFTER_OWNER_CONFIRMATION"
    });
    expect(harness.intentReads()).toBe(0);
    expect(harness.issueWorker).not.toHaveBeenCalled();
  });

  it("fails closed on an unreadable fresh journal before activated authority", async () => {
    const harness = inertPorts({ state: "empty" });
    vi.mocked(harness.ports.submissionJournal.readRecoveryState).mockRejectedValueOnce(
      new Error("durable read failure")
    );
    const composition = createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(
      harness.ports
    );

    await expect(composition.runOnce({})).resolves.toMatchObject({
      status: "blocked",
      code: "RESTART_JOURNAL_READ_FAILED"
    });
    expect(harness.intentReads()).toBe(0);
    expect(harness.issueWorker).not.toHaveBeenCalled();
  });

  it("uses only the private broadcaster seam for the one-send terminal path", () => {
    expect(COMPOSITION_SOURCE).not.toContain(
      "sendExactBscTestnetPtaWbnbPoolRawTransactionOnceForInternalUse"
    );
    expect(COMPOSITION_SOURCE).toContain("broadcaster.acquireTerminalPreSendRecheck");
    expect(COMPOSITION_SOURCE).toContain("broadcaster.sendExactRawTransactionOnce");
  });

  it("retains the durable transaction hash and forbids retries after a post-signing failure", async () => {
    const envelopeHash = `0x${"61".repeat(32)}` as const;
    const transactionHash = `0x${"62".repeat(32)}` as const;
    const expiresAt = "2026-08-13T08:00:40.000Z";
    const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
      gasLimit: "6000000",
      gasPriceWei: "100000000",
      sourceEnvelopeHash: envelopeHash
    });
    if (transaction === null) throw new Error("Exact transaction fixture failed.");
    const intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent = Object.freeze({
      schemaVersion: 1,
      scope: "owner_designated_internal_release_policy_and_exact_owner_pool_initialization",
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash,
      reviewerApprovalDigest: `0x${"63".repeat(32)}`,
      ownerAuthorizationDigest: `0x${"64".repeat(32)}`,
      releaseCommit: "1".repeat(40),
      runtimeManifestSha256: `0x${"65".repeat(32)}`,
      authenticatedAt: "2026-08-13T07:59:55.000Z",
      expiresAt,
      transaction
    });
    doubles.describe.mockReturnValueOnce(
      Object.freeze({
        status: "prepared_non_authorizing",
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
        envelopeHash,
        exactBinding: Object.freeze({ gasLimit: 6_000_000n, gasPriceWei: 100_000_000n }),
        envelopeExpiresAt: "2026-08-13T08:04:55.000Z"
      })
    );
    doubles.signOnce.mockResolvedValueOnce(
      Object.freeze({ status: "signed_committed", transactionHash })
    );
    const signingRead = vi
      .fn()
      .mockResolvedValueOnce(EMPTY_SIGNING_STATE)
      .mockRejectedValueOnce(new Error("readback lost after durable commit"));
    const ports: BscTestnetPtaWbnbPoolFixedProductionPorts = {
      now: () => new Date("2026-08-13T08:00:20.000Z"),
      intent,
      executionCapability: Object.freeze({}),
      authenticateAuthorizedIntent: (candidate) => candidate === intent,
      signingJournal: {
        claimExactInitialization: vi.fn(),
        authorizeWorker: vi.fn(),
        startWorker: vi.fn(),
        consumeWorkerAuthorization: vi.fn(),
        commitWorkerSignedTransaction: vi.fn(),
        failBeforeSubmission: vi.fn(),
        recordUnknownOutcome: vi.fn(),
        readState: signingRead
      },
      submissionJournal: {
        initializeSignedCommit: vi.fn(),
        readRecoveryState: vi.fn(async () => ({ state: "empty" as const })),
        readState: vi.fn(),
        commitSubmissionStarted: vi.fn(),
        commitTerminalReconciliation: vi.fn()
      },
      issueWorker: vi.fn(() => ({
        executeCanonicalStdin: vi.fn(),
        invokeExactSigningWorker: vi.fn()
      })),
      broadcaster: {
        acquireTerminalPreSendRecheck: vi.fn(),
        sendExactRawTransactionOnce: vi.fn()
      }
    };

    await expect(
      createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(ports).runOnce({})
    ).resolves.toMatchObject({
      status: "blocked",
      code: "POST_SIGNING_OUTCOME_UNKNOWN_DO_NOT_RETRY",
      transactionHash
    });
    expect(ports.broadcaster.sendExactRawTransactionOnce).not.toHaveBeenCalled();
  });

  it("rejects a five-minute activated intent before issuing a worker", async () => {
    const envelopeHash = `0x${"67".repeat(32)}` as const;
    const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
      gasLimit: "6000000",
      gasPriceWei: "100000000",
      sourceEnvelopeHash: envelopeHash
    });
    if (transaction === null) throw new Error("Exact transaction fixture failed.");
    const intent = Object.freeze({
      schemaVersion: 1 as const,
      scope:
        "owner_designated_internal_release_policy_and_exact_owner_pool_initialization" as const,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash,
      reviewerApprovalDigest: `0x${"68".repeat(32)}` as const,
      ownerAuthorizationDigest: `0x${"69".repeat(32)}` as const,
      releaseCommit: "2".repeat(40),
      runtimeManifestSha256: `0x${"6a".repeat(32)}` as const,
      authenticatedAt: "2026-08-13T07:59:55.000Z",
      expiresAt: "2026-08-13T08:04:55.000Z",
      transaction
    }) satisfies BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
    doubles.describe.mockReturnValueOnce(
      Object.freeze({
        status: "prepared_non_authorizing",
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
        envelopeHash,
        exactBinding: Object.freeze({ gasLimit: 6_000_000n, gasPriceWei: 100_000_000n }),
        envelopeExpiresAt: intent.expiresAt
      })
    );
    const issueWorker = vi.fn();
    const ports: BscTestnetPtaWbnbPoolFixedProductionPorts = {
      now: () => new Date("2026-08-13T08:00:20.000Z"),
      intent,
      executionCapability: Object.freeze({}),
      authenticateAuthorizedIntent: (candidate: unknown) => candidate === intent,
      signingJournal: {
        claimExactInitialization: vi.fn(),
        authorizeWorker: vi.fn(),
        startWorker: vi.fn(),
        consumeWorkerAuthorization: vi.fn(),
        commitWorkerSignedTransaction: vi.fn(),
        failBeforeSubmission: vi.fn(),
        recordUnknownOutcome: vi.fn(),
        readState: vi.fn(async () => EMPTY_SIGNING_STATE)
      },
      submissionJournal: {
        initializeSignedCommit: vi.fn(),
        readRecoveryState: vi.fn(async () => ({ state: "empty" as const })),
        readState: vi.fn(),
        commitSubmissionStarted: vi.fn(),
        commitTerminalReconciliation: vi.fn()
      },
      issueWorker,
      broadcaster: {
        acquireTerminalPreSendRecheck: vi.fn(),
        sendExactRawTransactionOnce: vi.fn()
      }
    };

    await expect(
      createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(ports).runOnce({})
    ).resolves.toMatchObject({ status: "blocked", code: "ACTIVATED_INTENT_INVALID" });
    expect(issueWorker).not.toHaveBeenCalled();
  });
});

describe("PTA/WBNB recovery-only composition", () => {
  it("returns fresh only when both durable journals are exactly empty", async () => {
    const harness = inertPorts({ state: "empty" });

    await expect(
      reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
        harness.ports.signingJournal,
        harness.ports.submissionJournal
      )
    ).resolves.toEqual({ status: "fresh" });
  });

  it("blocks a durable signed commit without recreating owner or broadcast authority", async () => {
    const transactionHash = `0x${"33".repeat(32)}` as const;
    const harness = inertPorts(retainedRecoveryState("signed_committed", transactionHash));

    await expect(
      reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
        harness.ports.signingJournal,
        harness.ports.submissionJournal
      )
    ).resolves.toMatchObject({
      status: "handled",
      result: {
        status: "blocked",
        code: "RESTART_SIGNED_COMMIT_REQUIRES_NEW_AUTHORITY",
        transactionHash
      }
    });
    expect(harness.intentReads()).toBe(0);
  });

  it("blocks the crash window where signing committed before the submission journal existed", async () => {
    const transactionHash = `0x${"34".repeat(32)}` as const;
    const harness = inertPorts(
      { state: "empty" },
      Object.freeze({
        ...EMPTY_SIGNING_STATE,
        status: "signed_committed" as const,
        transactionHash
      })
    );

    await expect(
      reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
        harness.ports.signingJournal,
        harness.ports.submissionJournal
      )
    ).resolves.toMatchObject({
      status: "handled",
      result: {
        status: "blocked",
        code: "RESTART_SIGNED_COMMIT_REQUIRES_NEW_AUTHORITY",
        transactionHash
      }
    });
    expect(harness.intentReads()).toBe(0);
    expect(harness.issueWorker).not.toHaveBeenCalled();
  });

  it.each(["confirmed", "reverted"] as const)(
    "reconstructs a truthful %s result without re-entering signing, sending, or RPC",
    async (outcome) => {
      const transactionHash = `0x${"44".repeat(32)}` as const;
      const terminal = retainedTerminalPair(outcome, transactionHash);
      const harness = inertPorts(terminal.recoveryState, terminal.signingState);

      await expect(
        reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
          harness.ports.signingJournal,
          harness.ports.submissionJournal
        )
      ).resolves.toMatchObject({
        status: "handled",
        result: {
          status: outcome,
          retryBroadcastAllowed: false,
          reconciliationRetryAllowed: false,
          transactionHash,
          reconciliationDigest: `0x${"45".repeat(32)}`,
          issue: null
        }
      });
      expect(doubles.recoveryFactory).not.toHaveBeenCalled();
      expect(harness.intentReads()).toBe(0);
      expect(harness.issueWorker).not.toHaveBeenCalled();
    }
  );

  it("fails closed when a retained terminal record has no exact reconciliation digest", async () => {
    const transactionHash = `0x${"46".repeat(32)}` as const;
    const terminal = retainedTerminalPair("confirmed", transactionHash);
    const invalidTerminal = Object.freeze({
      ...terminal.recoveryState,
      reconciliationDigest: null
    }) as unknown as BscTestnetPtaWbnbPoolSubmissionRecoveryState;
    const harness = inertPorts(invalidTerminal, terminal.signingState);

    await expect(
      reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
        harness.ports.signingJournal,
        harness.ports.submissionJournal
      )
    ).resolves.toMatchObject({
      status: "handled",
      result: {
        status: "blocked",
        code: "RESTART_TERMINAL_EVIDENCE_INVALID",
        transactionHash
      }
    });
    expect(doubles.recoveryFactory).not.toHaveBeenCalled();
    expect(harness.issueWorker).not.toHaveBeenCalled();
  });

  it("does not claim a terminal outcome when the two durable journals do not bind the same transaction", async () => {
    const transactionHash = `0x${"4c".repeat(32)}` as const;
    const terminal = retainedTerminalPair("confirmed", transactionHash);
    const harness = inertPorts(terminal.recoveryState, {
      ...terminal.signingState,
      transactionHash: `0x${"4d".repeat(32)}`
    });

    await expect(
      reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
        harness.ports.signingJournal,
        harness.ports.submissionJournal
      )
    ).resolves.toMatchObject({
      status: "handled",
      result: { status: "blocked", code: "RESTART_BINDING_UNKNOWN", transactionHash }
    });
    expect(doubles.recoveryFactory).not.toHaveBeenCalled();
    expect(harness.issueWorker).not.toHaveBeenCalled();
  });

  it("requires matching local evidence before restart can enter reconciliation-only RPC", async () => {
    const transactionHash = `0x${"55".repeat(32)}` as const;
    const harness = inertPorts(retainedRecoveryState("submission_started", transactionHash));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
        harness.ports.signingJournal,
        harness.ports.submissionJournal
      )
    ).resolves.toMatchObject({
      status: "handled",
      result: { status: "blocked", code: "RESTART_BINDING_UNKNOWN" }
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it.each(["submission_started", "unknown_outcome"] as const)(
    "routes a matching %s restart only to the recovery reconciler",
    async (recoveryStatus) => {
      const transactionHash = `0x${"71".repeat(32)}` as const;
      const capability = Object.freeze({
        claimId: "claim-recovery-1",
        envelopeHash: `0x${"72".repeat(32)}` as const,
        releaseCommit: "2".repeat(40),
        runtimeManifestSha256: `0x${"73".repeat(32)}` as const,
        reviewerApprovalDigest: `0x${"74".repeat(32)}` as const,
        ownerAuthorizationDigest: `0x${"75".repeat(32)}` as const,
        authenticatedAt: "2026-08-13T08:00:10.000Z",
        expiresAt: "2026-08-13T08:00:40.000Z",
        transaction: Object.freeze({
          signedTransaction: "0x01" as const,
          transactionHash,
          gasLimit: "6000000",
          gasPriceWei: "100000000",
          maximumCostWei: "600000000000000",
          signingHash: `0x${"76".repeat(32)}` as const
        })
      });
      const signingState: BscTestnetPtaWbnbPoolLocalJournalState = Object.freeze({
        ...EMPTY_SIGNING_STATE,
        status: "signed_committed",
        claimId: capability.claimId,
        envelopeHash: capability.envelopeHash,
        releaseCommit: capability.releaseCommit,
        runtimeManifestSha256: capability.runtimeManifestSha256,
        reviewerApprovalDigest: capability.reviewerApprovalDigest,
        ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
        authorizedAt: capability.authenticatedAt,
        expiresAt: capability.expiresAt,
        serializedTransaction: capability.transaction.signedTransaction,
        transactionHash,
        gasLimit: capability.transaction.gasLimit,
        gasPriceWei: capability.transaction.gasPriceWei,
        maxCostWei: capability.transaction.maximumCostWei,
        signingHash: capability.transaction.signingHash
      });
      const recoveryState = Object.freeze({
        state: recoveryStatus,
        capability
      }) as unknown as BscTestnetPtaWbnbPoolSubmissionRecoveryState;
      const harness = inertPorts(recoveryState, signingState);
      const reconciliationResult = Object.freeze({
        status: "reconciliation_pending",
        transactionHash,
        retryBroadcastAllowed: false,
        reconciliationRetryAllowed: true
      });
      doubles.reconcile.mockResolvedValueOnce(reconciliationResult);

      await expect(
        reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
          harness.ports.signingJournal,
          harness.ports.submissionJournal
        )
      ).resolves.toEqual({ status: "handled", result: reconciliationResult });
      expect(doubles.recoveryFactory).toHaveBeenCalledTimes(1);
      expect(doubles.reconcile).toHaveBeenCalledTimes(1);
      expect(harness.intentReads()).toBe(0);
      expect(harness.issueWorker).not.toHaveBeenCalled();
      doubles.recoveryFactory.mockClear();
      doubles.reconcile.mockClear();
    }
  );
});
