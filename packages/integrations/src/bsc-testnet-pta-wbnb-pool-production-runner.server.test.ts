import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  order: [] as string[],
  openLocal: vi.fn(),
  openSubmission: vi.fn(),
  createBridge: vi.fn(),
  readPolicy: vi.fn(),
  prepare: vi.fn(),
  describeEnvelope: vi.fn(),
  reconcile: vi.fn(),
  createBroadcaster: vi.fn(),
  createComposition: vi.fn(),
  runComposition: vi.fn(),
  instantiate: vi.fn(),
  ceremony: vi.fn(),
  activate: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("./bsc-testnet-pta-wbnb-pool-local-journal.server", () => ({
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse: harness.openLocal
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-submission-journal.server", () => ({
  openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse:
    harness.openSubmission
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-signing-worker", () => ({
  createWindowsBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse: harness.createBridge
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-release-review-policy.server", () => ({
  readBscTestnetPtaWbnbPoolReleaseReviewPolicyFromControllingTtyForInternalUse: harness.readPolicy
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-coordinator.server", () => ({
  prepareBscTestnetPtaWbnbPoolInitializationEnvelope: harness.prepare
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server", () => ({
  describeBscTestnetPtaWbnbPoolOneShotBoundary: harness.describeEnvelope
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-private-broadcaster.server", () => ({
  createBscTestnetPtaWbnbPoolPrivateBroadcasterForInternalUse: harness.createBroadcaster
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-production-composition.server", () => ({
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_COMPOSITION_BOUNDARY: Object.freeze({
    environment: "bsc-testnet",
    chainId: "97"
  }),
  reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse: harness.reconcile,
  createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse: harness.createComposition
}));

import { runBscTestnetPtaWbnbPoolProductionOnceFromStdin } from "./bsc-testnet-pta-wbnb-pool-production-runner.server";
import { sendExactBscTestnetPtaWbnbPoolRawTransactionOnceForInternalUse } from "./bsc-testnet-pta-wbnb-pool-production-rpc.server";

const RUNNER_SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-production-runner.server.ts", import.meta.url),
  "utf8"
);
const CLI_SOURCE = readFileSync(
  new URL("../../../scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts", import.meta.url),
  "utf8"
);

const EMPTY_LOCAL = Object.freeze({
  status: "absent" as const,
  journal: null,
  state: Object.freeze({ status: "empty" as const }),
  issue: null
});
const EMPTY_SUBMISSION = Object.freeze({
  status: "absent" as const,
  journal: null,
  state: Object.freeze({ state: "empty" as const }),
  issue: null
});
const RELEASE = Object.freeze({
  releaseCommit: "1".repeat(40),
  releaseTree: "2".repeat(40),
  runtimeManifest: Object.freeze({ runtimeManifestSha256: `0x${"11".repeat(32)}` })
});
const ENVELOPE = Object.freeze({ envelopeHash: `0x${"22".repeat(32)}` });
const DESCRIPTOR = Object.freeze({
  status: "prepared_non_authorizing" as const,
  envelopeHash: `0x${"22".repeat(32)}`,
  envelopeExpiresAt: "2026-08-13T08:00:40.000Z"
});
const RUNTIME_INSTANTIATION = Object.freeze({ instantiationDigest: `0x${"33".repeat(32)}` });
const COMMAND = Object.freeze({ ceremonyNonce: `0x${"44".repeat(32)}` });
const SIGNING_JOURNAL = Object.freeze({});
const SUBMISSION_JOURNAL = Object.freeze({});
const BROADCASTER = Object.freeze({});
const EXECUTION_CAPABILITY = Object.freeze({});
const INTENT = Object.freeze({});
const ACTIVATED_BRIDGE = Object.freeze({
  releaseIdentity: RELEASE,
  releaseTrust: Object.freeze({}),
  releaseTree: RELEASE.releaseTree,
  intent: INTENT,
  executionCapability: EXECUTION_CAPABILITY,
  authenticateAuthorizedIntent: vi.fn(() => true),
  signingJournal: SIGNING_JOURNAL,
  issueWorker: vi.fn(),
  consumeExactBroadcastAuthorizationAfterDurableStart: vi.fn()
});
const FRESH_RESULT = Object.freeze({
  status: "blocked" as const,
  code: "SYNTHETIC_END",
  message: "synthetic",
  transactionHash: null,
  boundary: Object.freeze({ environment: "bsc-testnet", chainId: "97" })
});

function deferred<Value>(): Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value) => void;
}> {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return Object.freeze({ promise, resolve: resolvePromise });
}

function readyFreshPath(): void {
  harness.openLocal.mockImplementation(async () => {
    harness.order.push("local-open");
    return EMPTY_LOCAL;
  });
  harness.openSubmission.mockImplementation(async () => {
    harness.order.push("submission-open");
    return EMPTY_SUBMISSION;
  });
  harness.createBridge.mockImplementation(async () => {
    harness.order.push("release");
    return Object.freeze({
      releaseIdentity: RELEASE,
      conductOwnerCeremony: harness.ceremony,
      activateAfterCeremony: harness.activate
    });
  });
  harness.readPolicy.mockImplementation(async () => {
    harness.order.push("policy-tty");
    return Object.freeze({
      status: "ready" as const,
      realm: Object.freeze({ instantiate: harness.instantiate }),
      policy: Object.freeze({}),
      policyDigest: `0x${"55".repeat(32)}`,
      issue: null
    });
  });
  harness.prepare.mockImplementation(async () => {
    harness.order.push("coordinator-rpc");
    return Object.freeze({ status: "observed" as const, envelope: ENVELOPE });
  });
  harness.describeEnvelope.mockImplementation(() => {
    harness.order.push("describe-envelope");
    return DESCRIPTOR;
  });
  harness.instantiate.mockImplementation(() => {
    harness.order.push("instantiate-policy");
    return RUNTIME_INSTANTIATION;
  });
  harness.ceremony.mockImplementation(async () => {
    harness.order.push("owner-tty");
    return Object.freeze({ status: "confirmed" as const, command: COMMAND, issue: null });
  });
  harness.activate.mockImplementation(async () => {
    harness.order.push("activate-custody-journal");
    return Object.freeze({ status: "activated" as const, bridge: ACTIVATED_BRIDGE, issue: null });
  });
  harness.createBroadcaster.mockImplementation(async () => {
    harness.order.push("provision-submission-broadcaster");
    return Object.freeze({ broadcaster: BROADCASTER, submissionJournal: SUBMISSION_JOURNAL });
  });
  harness.runComposition.mockImplementation(async () => {
    harness.order.push("composition-run");
    return FRESH_RESULT;
  });
  harness.createComposition.mockImplementation(() => {
    harness.order.push("composition-create");
    return Object.freeze({ runOnce: harness.runComposition });
  });
}

beforeEach(() => {
  harness.order.splice(0);
  vi.clearAllMocks();
  readyFreshPath();
});

describe("PTA/WBNB recovery-first production runner", () => {
  it("completes both read-only opens before release, TTY, RPC, custody, or activation", async () => {
    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toEqual(FRESH_RESULT);

    expect(harness.order).toEqual([
      "local-open",
      "submission-open",
      "release",
      "policy-tty",
      "coordinator-rpc",
      "describe-envelope",
      "instantiate-policy",
      "owner-tty",
      "activate-custody-journal",
      "provision-submission-broadcaster",
      "composition-create",
      "composition-run"
    ]);
    expect(harness.readPolicy).toHaveBeenCalledWith(RELEASE);
    expect(harness.instantiate).toHaveBeenCalledWith(
      Object.freeze({
        envelopeHash: DESCRIPTOR.envelopeHash,
        expiresAt: DESCRIPTOR.envelopeExpiresAt
      })
    );
    expect(harness.ceremony).toHaveBeenCalledWith(DESCRIPTOR, RUNTIME_INSTANTIATION);
    expect(harness.activate).toHaveBeenCalledWith(DESCRIPTOR, COMMAND);
    expect(harness.createBroadcaster).toHaveBeenCalledWith(ACTIVATED_BRIDGE);
    expect(harness.createComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: INTENT,
        executionCapability: EXECUTION_CAPABILITY,
        signingJournal: SIGNING_JOURNAL,
        submissionJournal: SUBMISSION_JOURNAL,
        broadcaster: BROADCASTER
      })
    );
  });

  it("waits for both open probes and does not preload policy while either is pending", async () => {
    const local = deferred<typeof EMPTY_LOCAL>();
    const submission = deferred<typeof EMPTY_SUBMISSION>();
    harness.openLocal.mockImplementation(() => local.promise);
    harness.openSubmission.mockImplementation(() => submission.promise);

    const running = runBscTestnetPtaWbnbPoolProductionOnceFromStdin();
    await Promise.resolve();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    local.resolve(EMPTY_LOCAL);
    await Promise.resolve();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    submission.resolve(EMPTY_SUBMISSION);
    await running;
    expect(harness.readPolicy).toHaveBeenCalledTimes(1);
  });

  it("fails closed on either invalid recovery journal before all later phases", async () => {
    harness.openLocal.mockResolvedValueOnce(
      Object.freeze({
        status: "blocked",
        journal: null,
        state: null,
        issue: Object.freeze({ code: "RECOVERY_JOURNAL_INVALID", message: "invalid" })
      })
    );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "RECOVERY_JOURNAL_INVALID"
    });
    expect(harness.createBridge).not.toHaveBeenCalled();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    expect(harness.prepare).not.toHaveBeenCalled();
    expect(harness.activate).not.toHaveBeenCalled();
    expect(harness.createBroadcaster).not.toHaveBeenCalled();
  });

  it("uses an opened matching pair only for reconciliation and never enters fresh authority", async () => {
    const localJournal = Object.freeze({});
    const submissionJournal = Object.freeze({});
    harness.openLocal.mockResolvedValueOnce(
      Object.freeze({ status: "opened", journal: localJournal, state: {}, issue: null })
    );
    harness.openSubmission.mockResolvedValueOnce(
      Object.freeze({ status: "opened", journal: submissionJournal, state: {}, issue: null })
    );
    harness.reconcile.mockResolvedValueOnce(
      Object.freeze({ status: "handled", result: FRESH_RESULT })
    );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toEqual(FRESH_RESULT);
    expect(harness.reconcile).toHaveBeenCalledWith(localJournal, submissionJournal);
    expect(harness.createBridge).not.toHaveBeenCalled();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    expect(harness.activate).not.toHaveBeenCalled();
    expect(harness.createBroadcaster).not.toHaveBeenCalled();
  });

  it.each(["confirmed", "reverted"] as const)(
    "returns a reconstructed durable %s result without entering policy, custody, or broadcast wiring",
    async (outcome) => {
      const localJournal = Object.freeze({});
      const submissionJournal = Object.freeze({});
      const terminalResult = Object.freeze({
        status: outcome,
        retryBroadcastAllowed: false as const,
        reconciliationRetryAllowed: false as const,
        transactionHash: `0x${"61".repeat(32)}` as const,
        reconciliationDigest: `0x${"62".repeat(32)}` as const,
        issue: null,
        boundary: Object.freeze({ environment: "bsc-testnet", chainId: "97" })
      });
      harness.openLocal.mockResolvedValueOnce(
        Object.freeze({ status: "opened", journal: localJournal, state: {}, issue: null })
      );
      harness.openSubmission.mockResolvedValueOnce(
        Object.freeze({ status: "opened", journal: submissionJournal, state: {}, issue: null })
      );
      harness.reconcile.mockResolvedValueOnce(
        Object.freeze({ status: "handled", result: terminalResult })
      );

      await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toEqual(
        terminalResult
      );
      expect(harness.reconcile).toHaveBeenCalledWith(localJournal, submissionJournal);
      expect(harness.createBridge).not.toHaveBeenCalled();
      expect(harness.readPolicy).not.toHaveBeenCalled();
      expect(harness.prepare).not.toHaveBeenCalled();
      expect(harness.activate).not.toHaveBeenCalled();
      expect(harness.createBroadcaster).not.toHaveBeenCalled();
    }
  );

  it("blocks a lone durable signed commit with its hash and without policy or sending", async () => {
    const transactionHash = `0x${"66".repeat(32)}` as const;
    harness.openLocal.mockResolvedValueOnce(
      Object.freeze({
        status: "opened",
        journal: Object.freeze({}),
        state: Object.freeze({ status: "signed_committed", transactionHash }),
        issue: null
      })
    );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "RESTART_SIGNED_COMMIT_REQUIRES_NEW_AUTHORITY",
      transactionHash
    });
    expect(harness.readPolicy).not.toHaveBeenCalled();
    expect(harness.createBroadcaster).not.toHaveBeenCalled();
  });

  it("stops after rejected release policy without making the fresh RPC envelope", async () => {
    harness.readPolicy.mockResolvedValueOnce(
      Object.freeze({
        status: "blocked",
        realm: null,
        policy: null,
        policyDigest: null,
        issue: Object.freeze({
          code: "PRELOADED_TTY_INPUT_REJECTED",
          path: "tty",
          message: "preloaded input rejected"
        })
      })
    );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "PRELOADED_TTY_INPUT_REJECTED"
    });
    expect(harness.prepare).not.toHaveBeenCalled();
    expect(harness.ceremony).not.toHaveBeenCalled();
    expect(harness.activate).not.toHaveBeenCalled();
  });

  it("keeps the generic raw sender hard-blocked and absent from root wiring", async () => {
    expect(RUNNER_SOURCE).not.toContain(
      "sendExactBscTestnetPtaWbnbPoolRawTransactionOnceForInternalUse"
    );
    expect(RUNNER_SOURCE).not.toMatch(/process\.argv|process\.env/u);
    await expect(
      sendExactBscTestnetPtaWbnbPoolRawTransactionOnceForInternalUse("0x01")
    ).rejects.toThrow("PRODUCTION_AUTHORIZATION_UNAVAILABLE");
  });

  it("returns shell success only for a confirmed finalized receipt", () => {
    expect(CLI_SOURCE).toContain('if (result.status !== "confirmed") process.exitCode = 1;');
    expect(CLI_SOURCE).not.toContain('result.status === "reverted"');
    expect(CLI_SOURCE).not.toContain('result.status === "reconciliation_pending"');
  });
});
