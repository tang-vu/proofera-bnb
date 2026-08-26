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
    createBscTestnetPtaWbnbPoolOneShotSignerCoreForInternalUse: vi.fn((dependencies) => ({
      signOnce: () => doubles.signOnce(dependencies)
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
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ATTEMPT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ENVELOPE_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import { BSC_TESTNET_PTA_WBNB_POOL_SENDER } from "./bsc-testnet-pta-wbnb-pool-initialization";
import type { BscTestnetPtaWbnbPoolAuthorizedSigningIntent } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse,
  narrowBscTestnetPtaWbnbPoolSubmissionJournalForInternalUse,
  reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse,
  type BscTestnetPtaWbnbPoolFixedProductionPorts
} from "./bsc-testnet-pta-wbnb-pool-production-composition.server";
import type {
  BscTestnetPtaWbnbPoolLocalJournal,
  BscTestnetPtaWbnbPoolLocalJournalRecoveryReader,
  BscTestnetPtaWbnbPoolPredecessorLocalJournalRecoveryReader,
  BscTestnetPtaWbnbPoolPredecessorTerminalState,
  BscTestnetPtaWbnbPoolLocalJournalState
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import type { BscTestnetPtaWbnbPoolPrivateBroadcaster } from "./bsc-testnet-pta-wbnb-pool-private-broadcaster.server";
import type { BscTestnetPtaWbnbPoolSubmissionRecoveryState } from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";
import type { BscTestnetPtaWbnbPoolSubmissionJournalRecoveryReader } from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";

const COMPOSITION_SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-production-composition.server.ts", import.meta.url),
  "utf8"
);

const PREDECESSOR_TERMINAL_RAW_SHA256 =
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256;
const ATTEMPT_ID = `0x${"54".repeat(32)}` as const;

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
  generation: null,
  predecessorState: null,
  predecessorFenceSha256: null,
  predecessorTerminalRawSha256: null,
  attemptId: null,
  gasLimit: null,
  gasPriceWei: null,
  maxCostWei: null,
  authorizedAt: null,
  expiresAt: null,
  serializedTransaction: null,
  transactionHash: null,
  supersessionFence: null
});

const PREDECESSOR_TERMINAL_LOCAL: BscTestnetPtaWbnbPoolPredecessorTerminalState = Object.freeze({
  status: "failed_before_worker",
  generation: 8,
  predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256,
  predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
  predecessorEnvelopeHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ENVELOPE_HASH,
  inheritedPredecessorTerminalRawSha256:
    BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256,
  predecessorAttemptId: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ATTEMPT_ID,
  phase: "post_claim_recheck",
  issueCode: "GAS_POLICY_VIOLATION",
  outcomeDigest: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  workerAuthorizationOutcome: "not_attempted",
  workerStartOutcome: "not_attempted",
  signatureOutcome: "not_attempted",
  recordedAt: "2026-08-13T07:59:45.000Z"
});

const PREDECESSOR_TERMINAL = Object.freeze({
  ...PREDECESSOR_TERMINAL_LOCAL,
  submissionOutcome: "not_attempted" as const,
  submissionJournalState: "exact_empty" as const
});

function localJournalStub(
  readState: () => Promise<BscTestnetPtaWbnbPoolLocalJournalState>
): BscTestnetPtaWbnbPoolLocalJournal {
  return {
    claimExactInitialization: vi.fn(),
    authorizeWorker: vi.fn(),
    startWorker: vi.fn(),
    consumeWorkerAuthorization: vi.fn(),
    commitWorkerSignedTransaction: vi.fn(),
    failBeforeWorker: vi.fn(),
    failBeforeSubmission: vi.fn(),
    recordUnknownOutcome: vi.fn(),
    readState
  };
}

function predecessorJournalStub(
  readExactTerminalRecoveryBinding: () => Promise<BscTestnetPtaWbnbPoolPredecessorTerminalState | null> = vi.fn(
    async () => PREDECESSOR_TERMINAL_LOCAL
  )
): BscTestnetPtaWbnbPoolPredecessorLocalJournalRecoveryReader {
  return {
    readState: vi.fn(async () => EMPTY_SIGNING_STATE),
    readStrictRecoveryState: vi.fn(async () => EMPTY_SIGNING_STATE),
    readExactTerminalRecoveryBinding
  };
}

function inertPorts(
  recoveryState: BscTestnetPtaWbnbPoolSubmissionRecoveryState,
  signingState: BscTestnetPtaWbnbPoolLocalJournalState = EMPTY_SIGNING_STATE
): Readonly<{
  ports: BscTestnetPtaWbnbPoolFixedProductionPorts;
  signingRecoveryReader: BscTestnetPtaWbnbPoolLocalJournalRecoveryReader;
  submissionRecoveryReader: BscTestnetPtaWbnbPoolSubmissionJournalRecoveryReader;
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
    predecessorSigningJournal: predecessorJournalStub(),
    predecessorTerminal: PREDECESSOR_TERMINAL,
    probePredecessorSubmission: vi.fn(async () => ({
      status: "ready" as const,
      presence: "empty" as const,
      files: Object.freeze([]),
      issue: null
    })),
    signingJournal: localJournalStub(vi.fn(async () => signingState)),
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
  const signingRecoveryReader = Object.freeze({
    readState: ports.signingJournal.readState,
    readStrictRecoveryState: vi.fn(async () => signingState)
  });
  const submissionRecoveryReader = Object.freeze({
    readRecoveryState: ports.submissionJournal.readRecoveryState,
    readStrictRecoveryState: vi.fn(async () => recoveryState)
  });
  return Object.freeze({
    ports,
    signingRecoveryReader,
    submissionRecoveryReader,
    intentReads: () => intentReadCount,
    issueWorker
  });
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
    recovery: Object.freeze({
      generation: 9 as const,
      predecessorState: "failed_before_worker" as const,
      predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
      attemptId: ATTEMPT_ID
    }),
    authenticatedAt: "2026-08-13T08:00:10.000Z",
    expiresAt: "2026-08-13T08:02:10.000Z",
    transaction: Object.freeze({
      signedTransaction: "0x01" as const,
      transactionHash,
      gasLimit: "6600000",
      gasPriceWei: "100000000",
      maximumCostWei: "660000000000000",
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
      signingHash: capability.transaction.signingHash,
      generation: 9,
      predecessorState: "failed_before_worker",
      predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
      attemptId: ATTEMPT_ID
    })
  });
}

describe("PTA/WBNB fresh production composition", () => {
  it("passes only the exact three-method journal facade into the submission core", async () => {
    const harness = inertPorts({ state: "empty" });
    const durable = harness.ports.submissionJournal;
    const narrowed = narrowBscTestnetPtaWbnbPoolSubmissionJournalForInternalUse(durable);

    expect(Object.isFrozen(narrowed)).toBe(true);
    expect(Reflect.ownKeys(narrowed).sort()).toEqual([
      "commitSubmissionStarted",
      "commitTerminalReconciliation",
      "readState"
    ]);
    expect("initializeSignedCommit" in narrowed).toBe(false);
    expect("readRecoveryState" in narrowed).toBe(false);

    await narrowed.readState();
    expect(durable.readState).toHaveBeenCalledTimes(1);
  });

  it("re-reads the predecessor fence and both active journals before touching activated authority", async () => {
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

  it("rejects a mutated predecessor terminal before reading activated owner authority", async () => {
    const harness = inertPorts({ state: "empty" });
    vi.mocked(
      harness.ports.predecessorSigningJournal.readExactTerminalRecoveryBinding
    ).mockResolvedValueOnce(null);

    await expect(
      createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(harness.ports).runOnce({})
    ).resolves.toMatchObject({
      status: "blocked",
      code: "PREDECESSOR_TERMINAL_CHANGED_AFTER_OWNER_CONFIRMATION"
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
    const expiresAt = "2026-08-13T08:01:55.000Z";
    const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
      gasLimit: "6600000",
      gasPriceWei: "100000000",
      sourceEnvelopeHash: envelopeHash
    });
    if (transaction === null) throw new Error("Exact transaction fixture failed.");
    const intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent = Object.freeze({
      schemaVersion: 9,
      scope: "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_9",
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash,
      reviewerApprovalDigest: `0x${"63".repeat(32)}`,
      ownerAuthorizationDigest: `0x${"64".repeat(32)}`,
      releaseCommit: "1".repeat(40),
      runtimeManifestSha256: `0x${"65".repeat(32)}`,
      authenticatedAt: "2026-08-13T07:59:55.000Z",
      expiresAt,
      recovery: Object.freeze({
        generation: 9,
        predecessorState: "failed_before_worker",
        predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
        attemptId: ATTEMPT_ID
      }),
      transaction
    });
    doubles.describe.mockReturnValueOnce(
      Object.freeze({
        status: "prepared_non_authorizing",
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
        envelopeHash,
        exactBinding: Object.freeze({ gasLimit: 6_600_000n, gasPriceWei: 100_000_000n }),
        envelopeObservedAt: "2026-08-13T07:59:50.000Z",
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
      now: () => new Date("2026-08-13T08:00:00.000Z"),
      intent,
      executionCapability: Object.freeze({}),
      authenticateAuthorizedIntent: (candidate) => candidate === intent,
      predecessorSigningJournal: predecessorJournalStub(),
      predecessorTerminal: PREDECESSOR_TERMINAL,
      probePredecessorSubmission: vi.fn(async () => ({
        status: "ready" as const,
        presence: "empty" as const,
        files: Object.freeze([]),
        issue: null
      })),
      signingJournal: localJournalStub(signingRead),
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
      gasLimit: "6600000",
      gasPriceWei: "100000000",
      sourceEnvelopeHash: envelopeHash
    });
    if (transaction === null) throw new Error("Exact transaction fixture failed.");
    const intent = Object.freeze({
      schemaVersion: 9 as const,
      scope:
        "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_9" as const,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash,
      reviewerApprovalDigest: `0x${"68".repeat(32)}` as const,
      ownerAuthorizationDigest: `0x${"69".repeat(32)}` as const,
      releaseCommit: "2".repeat(40),
      runtimeManifestSha256: `0x${"6a".repeat(32)}` as const,
      authenticatedAt: "2026-08-13T07:59:55.000Z",
      expiresAt: "2026-08-13T08:04:55.000Z",
      recovery: Object.freeze({
        generation: 9 as const,
        predecessorState: "failed_before_worker" as const,
        predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
        attemptId: ATTEMPT_ID
      }),
      transaction
    }) satisfies BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
    doubles.describe.mockReturnValueOnce(
      Object.freeze({
        status: "prepared_non_authorizing",
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
        envelopeHash,
        exactBinding: Object.freeze({ gasLimit: 6_600_000n, gasPriceWei: 100_000_000n }),
        envelopeObservedAt: "2026-08-13T07:59:50.000Z",
        envelopeExpiresAt: intent.expiresAt
      })
    );
    const issueWorker = vi.fn();
    const ports: BscTestnetPtaWbnbPoolFixedProductionPorts = {
      now: () => new Date("2026-08-13T08:00:20.000Z"),
      intent,
      executionCapability: Object.freeze({}),
      authenticateAuthorizedIntent: (candidate: unknown) => candidate === intent,
      predecessorSigningJournal: predecessorJournalStub(),
      predecessorTerminal: PREDECESSOR_TERMINAL,
      probePredecessorSubmission: vi.fn(async () => ({
        status: "ready" as const,
        presence: "empty" as const,
        files: Object.freeze([]),
        issue: null
      })),
      signingJournal: localJournalStub(vi.fn(async () => EMPTY_SIGNING_STATE)),
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

  it("durably records a known post-claim recheck failure before returning", async () => {
    const envelopeHash = `0x${"70".repeat(32)}` as const;
    const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
      gasLimit: "6600000",
      gasPriceWei: "100000000",
      sourceEnvelopeHash: envelopeHash
    });
    if (transaction === null) throw new Error("Exact transaction fixture failed.");
    const intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent = Object.freeze({
      schemaVersion: 9,
      scope: "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_9",
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash,
      reviewerApprovalDigest: `0x${"71".repeat(32)}`,
      ownerAuthorizationDigest: `0x${"72".repeat(32)}`,
      releaseCommit: "7".repeat(40),
      runtimeManifestSha256: `0x${"73".repeat(32)}`,
      authenticatedAt: "2026-08-13T08:00:10.000Z",
      expiresAt: "2026-08-13T08:02:10.000Z",
      recovery: Object.freeze({
        generation: 9,
        predecessorState: "failed_before_worker",
        predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
        attemptId: ATTEMPT_ID
      }),
      transaction
    });
    doubles.describe.mockReturnValueOnce(
      Object.freeze({
        status: "prepared_non_authorizing",
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
        envelopeHash,
        exactBinding: Object.freeze({ gasLimit: 6_600_000n, gasPriceWei: 100_000_000n }),
        envelopeObservedAt: "2026-08-13T08:00:00.000Z",
        envelopeExpiresAt: "2026-08-13T08:05:00.000Z"
      })
    );
    doubles.signOnce.mockResolvedValueOnce(
      Object.freeze({
        status: "do_not_retry",
        transactionHash: null,
        issue: Object.freeze({
          phase: "recheck",
          code: "POST_CLAIM_RECHECK_REJECTED",
          protocolIssue: null,
          postClaimRecheckIssue: Object.freeze({
            code: "RPC_REQUEST_FAILED",
            stage: "chain",
            message: "The exact dual-RPC chain check failed."
          }),
          message: "The exact dual-RPC chain check failed."
        })
      })
    );
    const claimed = Object.freeze({
      ...EMPTY_SIGNING_STATE,
      status: "claimed" as const,
      claimId: "claim-known-recheck-failure",
      operationKey: intent.operationKey,
      envelopeHash,
      authorizationReceiptSha256: `0x${"74".repeat(32)}` as const,
      serializedUnsignedSha256: `0x${"75".repeat(32)}` as const,
      signingHash: transaction.signingHash,
      reviewerApprovalDigest: intent.reviewerApprovalDigest,
      ownerAuthorizationDigest: intent.ownerAuthorizationDigest,
      releaseCommit: intent.releaseCommit,
      runtimeManifestSha256: intent.runtimeManifestSha256,
      generation: 9 as const,
      predecessorState: "failed_before_worker" as const,
      predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
      attemptId: ATTEMPT_ID,
      gasLimit: transaction.gasLimit,
      gasPriceWei: transaction.gasPriceWei,
      maxCostWei: transaction.maximumCostWei,
      authorizedAt: intent.authenticatedAt,
      expiresAt: intent.expiresAt
    });
    const readState = vi.fn().mockResolvedValueOnce(EMPTY_SIGNING_STATE).mockResolvedValue(claimed);
    const signingJournal = localJournalStub(readState);
    const invokeExactSigningWorker = vi.fn();
    const ports: BscTestnetPtaWbnbPoolFixedProductionPorts = {
      now: () => new Date("2026-08-13T08:00:20.000Z"),
      intent,
      executionCapability: Object.freeze({}),
      authenticateAuthorizedIntent: (candidate) => candidate === intent,
      predecessorSigningJournal: predecessorJournalStub(),
      predecessorTerminal: PREDECESSOR_TERMINAL,
      probePredecessorSubmission: vi.fn(async () => ({
        status: "ready" as const,
        presence: "empty" as const,
        files: Object.freeze([]),
        issue: null
      })),
      signingJournal,
      submissionJournal: {
        initializeSignedCommit: vi.fn(),
        readRecoveryState: vi.fn(async () => ({ state: "empty" as const })),
        readState: vi.fn(),
        commitSubmissionStarted: vi.fn(),
        commitTerminalReconciliation: vi.fn()
      },
      issueWorker: vi.fn(() => ({
        executeCanonicalStdin: vi.fn(),
        invokeExactSigningWorker
      })),
      broadcaster: {
        acquireTerminalPreSendRecheck: vi.fn(),
        sendExactRawTransactionOnce: vi.fn()
      }
    };

    const result = await createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(
      ports
    ).runOnce({});
    expect(signingJournal.failBeforeWorker).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "blocked",
      code: "RPC_REQUEST_FAILED"
    });
    expect(signingJournal.failBeforeWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: claimed.claimId,
        phase: "post_claim_recheck",
        issueCode: "RPC_REQUEST_FAILED"
      })
    );
    expect(invokeExactSigningWorker).not.toHaveBeenCalled();
  });

  it("rechecks all durable states and verifies the exact generation-8 claim readback", async () => {
    const envelopeHash = `0x${"81".repeat(32)}` as const;
    const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
      gasLimit: "6600000",
      gasPriceWei: "100000000",
      sourceEnvelopeHash: envelopeHash
    });
    if (transaction === null) throw new Error("Exact transaction fixture failed.");
    const intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent = Object.freeze({
      schemaVersion: 9,
      scope: "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_9",
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash,
      reviewerApprovalDigest: `0x${"82".repeat(32)}`,
      ownerAuthorizationDigest: `0x${"83".repeat(32)}`,
      releaseCommit: "4".repeat(40),
      runtimeManifestSha256: `0x${"84".repeat(32)}`,
      authenticatedAt: "2026-08-13T08:00:10.000Z",
      expiresAt: "2026-08-13T08:02:10.000Z",
      recovery: Object.freeze({
        generation: 9,
        predecessorState: "failed_before_worker",
        predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
        attemptId: ATTEMPT_ID
      }),
      transaction
    });
    doubles.describe.mockReturnValueOnce(
      Object.freeze({
        status: "prepared_non_authorizing",
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
        envelopeHash,
        exactBinding: Object.freeze({ gasLimit: 6_600_000n, gasPriceWei: 100_000_000n }),
        envelopeObservedAt: "2026-08-13T07:59:50.000Z",
        envelopeExpiresAt: "2026-08-13T08:04:50.000Z"
      })
    );
    let retainedState = EMPTY_SIGNING_STATE;
    let retainedClaimState: BscTestnetPtaWbnbPoolLocalJournalState | null = null;
    const claimExactInitialization: BscTestnetPtaWbnbPoolLocalJournal["claimExactInitialization"] =
      vi.fn(async (request) => {
        retainedState = Object.freeze({
          ...EMPTY_SIGNING_STATE,
          status: "claimed",
          claimId: "pta-wbnb-pool-v2-test-claim",
          operationKey: request.operationKey,
          envelopeHash: request.envelopeHash,
          authorizationReceiptSha256: request.authorizationReceiptSha256,
          signingHash: request.signingHash,
          serializedUnsignedSha256: request.serializedUnsignedSha256,
          reviewerApprovalDigest: request.reviewerApprovalDigest,
          ownerAuthorizationDigest: request.ownerAuthorizationDigest,
          releaseCommit: request.releaseCommit,
          runtimeManifestSha256: request.runtimeManifestSha256,
          generation: request.generation ?? null,
          predecessorState: request.predecessorState ?? null,
          predecessorTerminalRawSha256: request.predecessorTerminalRawSha256 ?? null,
          attemptId: request.attemptId ?? null,
          gasLimit: request.gasLimit,
          gasPriceWei: request.gasPriceWei,
          maxCostWei: request.maxCostWei,
          authorizedAt: request.authorizedAt,
          expiresAt: request.expiresAt
        });
        return Object.freeze({ status: "claimed" as const, claimId: retainedState.claimId ?? "" });
      });
    const signingJournal: BscTestnetPtaWbnbPoolLocalJournal = {
      ...localJournalStub(vi.fn(async () => retainedState)),
      claimExactInitialization
    };
    const submissionJournal = {
      initializeSignedCommit: vi.fn(),
      readRecoveryState: vi.fn(async () => ({ state: "empty" as const })),
      readState: vi.fn(),
      commitSubmissionStarted: vi.fn(),
      commitTerminalReconciliation: vi.fn()
    };
    doubles.signOnce.mockImplementationOnce(
      async (
        dependencies: OneShotSignerModule.BscTestnetPtaWbnbPoolOneShotSignerTestDependencies
      ) => {
        const durableClaimRequest = Object.freeze({
          schemaVersion: 9,
          operation: "claim_exact_bsc_testnet_pta_wbnb_pool_initialization_once",
          oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
          operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
          environment: "bsc-testnet",
          chainId: "97",
          envelopeHash,
          releaseCommit: intent.releaseCommit,
          runtimeManifestSha256: intent.runtimeManifestSha256,
          reviewerApprovalDigest: intent.reviewerApprovalDigest,
          ownerAuthorizationDigest: intent.ownerAuthorizationDigest,
          recovery: intent.recovery,
          serializedUnsignedTransaction: transaction.serializedUnsignedTransaction,
          signingHash: transaction.signingHash,
          gasLimit: transaction.gasLimit,
          gasPriceWei: transaction.gasPriceWei,
          maximumCostWei: transaction.maximumCostWei
        }) satisfies OneShotSignerModule.BscTestnetPtaWbnbPoolDurableClaimRequest;
        const replayRecovery = Object.freeze({
          ...intent.recovery,
          attemptId: `0x${"ff".repeat(32)}` as const
        });
        await expect(
          dependencies.claimExactInitialization(
            Object.freeze({ ...durableClaimRequest, recovery: replayRecovery })
          )
        ).rejects.toThrow("CLAIM_INVALID");
        expect(claimExactInitialization).not.toHaveBeenCalled();
        const claimId = "pta-wbnb-pool-v2-test-claim";
        await expect(dependencies.claimExactInitialization(durableClaimRequest)).resolves.toEqual({
          status: "claimed",
          claimId
        });
        retainedClaimState = retainedState;

        await expect(
          dependencies.acquireFreshPostClaimRecheck(
            Object.freeze({
              oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
              operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
              claimId,
              envelopeHash,
              releaseCommit: intent.releaseCommit,
              runtimeManifestSha256: intent.runtimeManifestSha256,
              reviewerApprovalDigest: intent.reviewerApprovalDigest,
              ownerAuthorizationDigest: intent.ownerAuthorizationDigest,
              recovery: replayRecovery,
              signingHash: transaction.signingHash
            })
          )
        ).rejects.toThrow("POST_CLAIM_RECOVERY_BINDING_INVALID");

        const signedTransaction = "0x01" as const;
        const transactionHash = `0x${"ee".repeat(32)}` as const;
        retainedState = Object.freeze({
          ...retainedState,
          status: "signed_committed",
          serializedTransaction: signedTransaction,
          transactionHash
        });
        await expect(
          dependencies.readBackSignedCommit(
            Object.freeze({
              schemaVersion: 9,
              operation: "verify_exact_bsc_testnet_pta_wbnb_pool_signed_commit",
              oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
              operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
              claimId,
              envelopeHash,
              releaseCommit: intent.releaseCommit,
              runtimeManifestSha256: intent.runtimeManifestSha256,
              reviewerApprovalDigest: intent.reviewerApprovalDigest,
              ownerAuthorizationDigest: intent.ownerAuthorizationDigest,
              recovery: replayRecovery,
              requestHash: `0x${"dd".repeat(32)}`,
              signingHash: transaction.signingHash,
              serializedUnsignedTransaction: transaction.serializedUnsignedTransaction,
              signedTransaction,
              transactionHash,
              recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
            })
          )
        ).resolves.toEqual({ status: "unknown" });
        return Object.freeze({
          status: "do_not_retry",
          transactionHash: null,
          issue: Object.freeze({ code: "TEST_STOP_AFTER_CLAIM", message: "test stop" })
        });
      }
    );
    const predecessorSigningJournal = predecessorJournalStub();
    const ports: BscTestnetPtaWbnbPoolFixedProductionPorts = {
      now: () => new Date("2026-08-13T08:00:20.000Z"),
      intent,
      executionCapability: Object.freeze({}),
      authenticateAuthorizedIntent: (candidate) => candidate === intent,
      predecessorSigningJournal,
      predecessorTerminal: PREDECESSOR_TERMINAL,
      probePredecessorSubmission: vi.fn(async () => ({
        status: "ready" as const,
        presence: "empty" as const,
        files: Object.freeze([]),
        issue: null
      })),
      signingJournal,
      submissionJournal,
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
    ).resolves.toMatchObject({ status: "blocked", code: "TEST_STOP_AFTER_CLAIM" });
    expect(predecessorSigningJournal.readExactTerminalRecoveryBinding).toHaveBeenCalledTimes(2);
    expect(submissionJournal.readRecoveryState).toHaveBeenCalledTimes(2);
    expect(claimExactInitialization).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: 9,
        predecessorState: "failed_before_worker",
        predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
        attemptId: ATTEMPT_ID,
        ownerAuthorizationDigest: intent.ownerAuthorizationDigest
      })
    );
    expect(retainedClaimState).toMatchObject({
      status: "claimed",
      generation: 9,
      predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
      attemptId: ATTEMPT_ID
    });
  });
});

describe("PTA/WBNB recovery-only composition", () => {
  it("returns fresh only when both durable journals are exactly empty", async () => {
    const harness = inertPorts({ state: "empty" });

    await expect(
      reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
        harness.signingRecoveryReader,
        harness.submissionRecoveryReader
      )
    ).resolves.toEqual({ status: "fresh" });
  });

  it("blocks a durable signed commit without recreating owner or broadcast authority", async () => {
    const transactionHash = `0x${"33".repeat(32)}` as const;
    const harness = inertPorts(retainedRecoveryState("signed_committed", transactionHash));

    await expect(
      reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
        harness.signingRecoveryReader,
        harness.submissionRecoveryReader
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
        harness.signingRecoveryReader,
        harness.submissionRecoveryReader
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
          harness.signingRecoveryReader,
          harness.submissionRecoveryReader
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
        harness.signingRecoveryReader,
        harness.submissionRecoveryReader
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
        harness.signingRecoveryReader,
        harness.submissionRecoveryReader
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
        harness.signingRecoveryReader,
        harness.submissionRecoveryReader
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
        recovery: Object.freeze({
          generation: 9 as const,
          predecessorState: "failed_before_worker" as const,
          predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
          attemptId: ATTEMPT_ID
        }),
        authenticatedAt: "2026-08-13T08:00:10.000Z",
        expiresAt: "2026-08-13T08:02:10.000Z",
        transaction: Object.freeze({
          signedTransaction: "0x01" as const,
          transactionHash,
          gasLimit: "6600000",
          gasPriceWei: "100000000",
          maximumCostWei: "660000000000000",
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
        signingHash: capability.transaction.signingHash,
        generation: 9,
        predecessorState: "failed_before_worker",
        predecessorTerminalRawSha256: PREDECESSOR_TERMINAL_RAW_SHA256,
        attemptId: ATTEMPT_ID
      });
      const recoveryState = Object.freeze({
        state: recoveryStatus,
        capability
      }) as unknown as BscTestnetPtaWbnbPoolSubmissionRecoveryState;
      const harness = inertPorts(recoveryState, signingState);
      const terminalRecoveryJournal = Object.freeze({
        readState: vi.fn(),
        commitTerminalReconciliation: vi.fn()
      });
      const reconciliationResult = Object.freeze({
        status: "reconciliation_pending",
        transactionHash,
        retryBroadcastAllowed: false,
        reconciliationRetryAllowed: true
      });
      doubles.reconcile.mockResolvedValueOnce(reconciliationResult);

      await expect(
        reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
          harness.signingRecoveryReader,
          harness.submissionRecoveryReader,
          terminalRecoveryJournal
        )
      ).resolves.toEqual({ status: "handled", result: reconciliationResult });
      expect(doubles.recoveryFactory).toHaveBeenCalledTimes(1);
      expect(doubles.recoveryFactory).toHaveBeenCalledWith(
        expect.objectContaining({ journal: terminalRecoveryJournal })
      );
      expect(doubles.reconcile).toHaveBeenCalledTimes(1);
      expect(harness.intentReads()).toBe(0);
      expect(harness.issueWorker).not.toHaveBeenCalled();
      doubles.recoveryFactory.mockClear();
      doubles.reconcile.mockClear();
    }
  );
});
