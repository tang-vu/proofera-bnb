import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import { createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse } from "./bsc-testnet-pta-wbnb-pool-production-composition.server";
import type { BscTestnetPtaWbnbPoolLocalJournalState } from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import type { BscTestnetPtaWbnbPoolSubmissionRecoveryState } from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";

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
  signingState = EMPTY_SIGNING_STATE
) {
  const authorize = vi.fn();
  const issueWorker = vi.fn();
  return {
    authorize,
    issueWorker,
    ports: {
      now: () => new Date("2026-08-13T08:00:20.000Z"),
      releaseTrust: {
        schemaVersion: 1 as const,
        releaseCommit: "00f21c405881a5dc320bddf3c757ba13599b1e71",
        originReference: "refs/remotes/origin/main" as const,
        cleanPublishedHead: true as const,
        workerSourceSha256: `0x${"11".repeat(32)}` as const,
        runtimeManifestSha256: `0x${"22".repeat(32)}` as const
      },
      authority: {
        authorize,
        authenticateAuthorizedIntent: vi.fn(() => false),
        authenticateExecutionCapability: vi.fn(() => false)
      },
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
      issueWorker
    }
  };
}

describe("PTA/WBNB production composition restart-first boundary", () => {
  it("reads both journals before parsing envelope or invoking authority", async () => {
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

    await expect(composition.runOnce(new Proxy({}, {}), {} as never)).resolves.toMatchObject({
      status: "blocked",
      code: "SIGNING_JOURNAL_NOT_FRESH"
    });
    expect(harness.authorize).not.toHaveBeenCalled();
    expect(harness.issueWorker).not.toHaveBeenCalled();
  });

  it("never re-enters authority, signer, or submission from a durable terminal state", async () => {
    const transactionHash = `0x${"33".repeat(32)}` as const;
    const harness = inertPorts({
      state: "confirmed",
      capability: { transaction: { transactionHash } }
    } as unknown as BscTestnetPtaWbnbPoolSubmissionRecoveryState);
    const composition = createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(
      harness.ports
    );

    await expect(composition.runOnce({}, {} as never)).resolves.toMatchObject({
      status: "blocked",
      code: "TERMINAL_STATE_ALREADY_COMMITTED",
      transactionHash
    });
    expect(harness.authorize).not.toHaveBeenCalled();
    expect(harness.issueWorker).not.toHaveBeenCalled();
    expect(harness.ports.submissionJournal.commitSubmissionStarted).not.toHaveBeenCalled();
  });

  it("fails closed on unreadable recovery journals before any authority action", async () => {
    const harness = inertPorts({ state: "empty" });
    harness.ports.submissionJournal.readRecoveryState.mockRejectedValueOnce(
      new Error("durable read failure")
    );
    const composition = createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(
      harness.ports
    );

    await expect(composition.runOnce({}, {} as never)).resolves.toMatchObject({
      status: "blocked",
      code: "RESTART_JOURNAL_READ_FAILED"
    });
    expect(harness.authorize).not.toHaveBeenCalled();
    expect(harness.issueWorker).not.toHaveBeenCalled();
  });
});
