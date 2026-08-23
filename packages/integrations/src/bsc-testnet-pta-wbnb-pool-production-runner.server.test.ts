import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  order: [] as string[],
  openAncestor: vi.fn(),
  openGeneration2: vi.fn(),
  openGeneration3: vi.fn(),
  openPredecessor: vi.fn(),
  openLocal: vi.fn(),
  probeGeneration2Submission: vi.fn(),
  probePredecessorSubmission: vi.fn(),
  openSubmission: vi.fn(),
  openTerminalSubmission: vi.fn(),
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
  openExistingWindowsBscTestnetPtaWbnbPoolLegacyLocalJournalForRecoveryForInternalUse:
    harness.openAncestor,
  openExistingWindowsBscTestnetPtaWbnbPoolGeneration2LocalJournalForRecoveryForInternalUse:
    harness.openGeneration2,
  openExistingWindowsBscTestnetPtaWbnbPoolGeneration3LocalJournalForRecoveryForInternalUse:
    harness.openGeneration3,
  openExistingWindowsBscTestnetPtaWbnbPoolPredecessorLocalJournalForRecoveryForInternalUse:
    harness.openPredecessor,
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse: harness.openLocal
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-submission-journal.server", () => ({
  openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse:
    harness.openSubmission,
  openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationForInternalUse:
    harness.openTerminalSubmission,
  probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalForInternalUse:
    harness.probeGeneration2Submission,
  probeWindowsBscTestnetPtaWbnbPoolGeneration3SubmissionJournalForInternalUse:
    harness.probePredecessorSubmission
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
import type { BscTestnetPtaWbnbPoolPredecessorTerminalState } from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_FENCE_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ATTEMPT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ENVELOPE_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

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
const EMPTY_PREDECESSOR_SUBMISSION = Object.freeze({
  status: "ready" as const,
  presence: "empty" as const,
  files: Object.freeze([]),
  issue: null
});
const EMPTY_GENERATION_2_SUBMISSION = Object.freeze({
  status: "ready" as const,
  presence: "absent" as const,
  files: Object.freeze([]),
  issue: null
});
const ANCESTOR_FENCE_SHA256 = `0x${"09".repeat(32)}` as const;
const ANCESTOR_FENCE = Object.freeze({
  status: "superseded_before_worker" as const,
  terminalCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" as const,
  workerAuthorizationOutcome: "not_attempted" as const,
  workerStartOutcome: "not_attempted" as const,
  signatureOutcome: "not_attempted" as const,
  submissionOutcome: "not_attempted" as const,
  submissionJournalState: "exact_empty" as const,
  predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
  predecessorFenceSha256: ANCESTOR_FENCE_SHA256
});
const ANCESTOR_FENCED = Object.freeze({
  status: "opened" as const,
  journal: Object.freeze({}),
  state: Object.freeze({
    status: "superseded_before_worker" as const,
    generation: 1 as const,
    supersessionFence: ANCESTOR_FENCE
  }),
  issue: null
});
const FENCE = Object.freeze({
  status: "superseded_before_worker" as const,
  terminalCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" as const,
  workerAuthorizationOutcome: "not_attempted" as const,
  workerStartOutcome: "not_attempted" as const,
  signatureOutcome: "not_attempted" as const,
  submissionOutcome: "not_attempted" as const,
  submissionJournalState: "exact_empty" as const,
  predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
  noEffectProofDigest: `0x${"10".repeat(32)}` as const,
  noEffectEnvelopeHash: `0x${"11".repeat(32)}` as const,
  noEffectObservedAt: "2026-08-14T10:00:00.000Z",
  fenceRecordedAt: "2026-08-14T10:00:01.000Z",
  predecessorFenceSha256: `0x${"12".repeat(32)}` as const
});
const PREDECESSOR_FENCE = Object.freeze({
  ...FENCE,
  predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
  noEffectProofDigest: `0x${"13".repeat(32)}` as const,
  noEffectEnvelopeHash: `0x${"14".repeat(32)}` as const,
  noEffectObservedAt: "2026-08-14T10:00:01.500Z",
  fenceRecordedAt: "2026-08-14T10:00:01.750Z",
  predecessorFenceSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_FENCE_SHA256
});
const GENERATION_3_JOURNAL = Object.freeze({
  readClaimOnlyRecoveryCandidate: vi.fn(async () => null),
  fenceClaimBeforeWorker: vi.fn(),
  readState: vi.fn(),
  readStrictRecoveryState: vi.fn(async () =>
    Object.freeze({ status: "superseded_before_worker", supersessionFence: PREDECESSOR_FENCE })
  )
});
const GENERATION_3_FENCED = Object.freeze({
  status: "opened" as const,
  journal: GENERATION_3_JOURNAL,
  state: Object.freeze({
    status: "superseded_before_worker" as const,
    generation: 3 as const,
    predecessorFenceSha256: FENCE.predecessorFenceSha256,
    supersessionFence: PREDECESSOR_FENCE
  }),
  issue: null
});
const GENERATION_2_FENCED = Object.freeze({
  status: "opened" as const,
  journal: Object.freeze({}),
  state: Object.freeze({
    status: "superseded_before_worker" as const,
    generation: 2 as const,
    predecessorFenceSha256: ANCESTOR_FENCE_SHA256,
    supersessionFence: FENCE
  }),
  issue: null
});
const PREDECESSOR_TERMINAL = Object.freeze({
  status: "failed_before_worker" as const,
  generation: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION,
  predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_CLAIM_RAW_SHA256,
  predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256,
  predecessorEnvelopeHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ENVELOPE_HASH,
  inheritedFenceSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_FENCE_SHA256,
  predecessorAttemptId: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ATTEMPT_ID,
  phase: "post_claim_recheck" as const,
  issueCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" as const,
  outcomeDigest: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  workerAuthorizationOutcome: "not_attempted" as const,
  workerStartOutcome: "not_attempted" as const,
  signatureOutcome: "not_attempted" as const,
  recordedAt: "2026-08-14T10:00:01.900Z"
}) satisfies BscTestnetPtaWbnbPoolPredecessorTerminalState;
const PREDECESSOR_TERMINAL_BINDING = Object.freeze({
  ...PREDECESSOR_TERMINAL,
  submissionOutcome: "not_attempted" as const,
  submissionJournalState: "exact_empty" as const
});
const PREDECESSOR_JOURNAL = Object.freeze({
  readState: vi.fn(),
  readStrictRecoveryState: vi.fn(),
  readExactTerminalRecoveryBinding: vi.fn<
    () => Promise<BscTestnetPtaWbnbPoolPredecessorTerminalState | null>
  >(async () => PREDECESSOR_TERMINAL)
});
const PREDECESSOR_OPENED = Object.freeze({
  status: "opened" as const,
  journal: PREDECESSOR_JOURNAL,
  state: Object.freeze({
    status: "failed_before_worker" as const,
    generation: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
  }),
  issue: null
});
const RELEASE = Object.freeze({
  releaseCommit: "1".repeat(40),
  releaseTree: "2".repeat(40),
  runtimeManifest: Object.freeze({ runtimeManifestSha256: `0x${"11".repeat(32)}` })
});
function envelope(hashByte: string, observedAt: string) {
  return Object.freeze({
    envelopeHash: `0x${hashByte.repeat(32)}`,
    observation: Object.freeze({
      observedAt,
      finalizedBlockNumber: "1",
      finalizedBlockHash: `0x${"23".repeat(32)}`,
      finalizedBlockTimestamp: "1",
      latestNonce: "9" as const,
      pendingNonce: "9" as const,
      pendingPool: "0x0000000000000000000000000000000000000000" as const,
      candidateCode: "0x" as const,
      candidateNonce: "0" as const,
      providerAgreementVerified: true as const,
      allRuntimeIdentitiesVerified: true as const,
      allEip1967SlotsZero: true as const,
      allProtocolBindingsVerified: true as const,
      feeTierVerified: true as const,
      simulationReturnPool: "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE" as const
    })
  });
}
const ENVELOPE = envelope("22", "2026-08-14T10:00:02.000Z");
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
const DURABLE_PROBE_ORDER = Object.freeze([
  "ancestor-open",
  "generation2-open",
  "generation3-open",
  "predecessor-open",
  "local-open",
  "generation2-submission-probe",
  "predecessor-submission-probe",
  "submission-open"
]);

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
  harness.openAncestor.mockImplementation(async () => {
    harness.order.push("ancestor-open");
    return ANCESTOR_FENCED;
  });
  harness.openGeneration2.mockImplementation(async () => {
    harness.order.push("generation2-open");
    return GENERATION_2_FENCED;
  });
  harness.openGeneration3.mockImplementation(async () => {
    harness.order.push("generation3-open");
    return GENERATION_3_FENCED;
  });
  PREDECESSOR_JOURNAL.readExactTerminalRecoveryBinding.mockImplementation(
    async () => PREDECESSOR_TERMINAL
  );
  harness.openPredecessor.mockImplementation(async () => {
    harness.order.push("predecessor-open");
    return PREDECESSOR_OPENED;
  });
  harness.openLocal.mockImplementation(async () => {
    harness.order.push("local-open");
    return EMPTY_LOCAL;
  });
  harness.openSubmission.mockImplementation(async () => {
    harness.order.push("submission-open");
    return EMPTY_SUBMISSION;
  });
  harness.probeGeneration2Submission.mockImplementation(async () => {
    harness.order.push("generation2-submission-probe");
    return EMPTY_GENERATION_2_SUBMISSION;
  });
  harness.probePredecessorSubmission.mockImplementation(async () => {
    harness.order.push("predecessor-submission-probe");
    return EMPTY_PREDECESSOR_SUBMISSION;
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
  vi.resetAllMocks();
  readyFreshPath();
});

describe("PTA/WBNB recovery-first production runner", () => {
  it("rereads all eight durable namespaces across startup, owner, activation, and claim boundaries", async () => {
    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toEqual(FRESH_RESULT);

    expect(harness.order).toEqual([
      ...DURABLE_PROBE_ORDER,
      "release",
      "policy-tty",
      "coordinator-rpc",
      "describe-envelope",
      "instantiate-policy",
      "owner-tty",
      ...DURABLE_PROBE_ORDER,
      "activate-custody-journal",
      ...DURABLE_PROBE_ORDER,
      "provision-submission-broadcaster",
      ...DURABLE_PROBE_ORDER,
      "composition-create",
      "composition-run"
    ]);
    expect(harness.readPolicy).toHaveBeenCalledWith(RELEASE);
    expect(harness.instantiate).toHaveBeenCalledWith(
      Object.freeze({
        envelopeHash: DESCRIPTOR.envelopeHash,
        executionEnvelopeObservedAt: ENVELOPE.observation.observedAt,
        expiresAt: DESCRIPTOR.envelopeExpiresAt,
        predecessorTerminal: PREDECESSOR_TERMINAL_BINDING
      })
    );
    expect(harness.ceremony).toHaveBeenCalledWith(DESCRIPTOR, RUNTIME_INSTANTIATION);
    expect(harness.activate).toHaveBeenCalledWith(DESCRIPTOR, COMMAND);
    expect(harness.createBroadcaster).toHaveBeenCalledWith(ACTIVATED_BRIDGE);
    expect(harness.createComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: INTENT,
        executionCapability: EXECUTION_CAPABILITY,
        predecessorSigningJournal: PREDECESSOR_JOURNAL,
        predecessorTerminal: PREDECESSOR_TERMINAL_BINDING,
        probePredecessorSubmission: harness.probePredecessorSubmission,
        signingJournal: SIGNING_JOURNAL,
        submissionJournal: SUBMISSION_JOURNAL,
        broadcaster: BROADCASTER
      })
    );
    expect(PREDECESSOR_JOURNAL.readExactTerminalRecoveryBinding).toHaveBeenCalledTimes(4);
  });

  it("waits for all eight startup probes and does not preload policy while any is pending", async () => {
    const ancestor = deferred<typeof ANCESTOR_FENCED>();
    const generation2 = deferred<typeof GENERATION_2_FENCED>();
    const generation3 = deferred<typeof GENERATION_3_FENCED>();
    const predecessor = deferred<typeof PREDECESSOR_OPENED>();
    const local = deferred<typeof EMPTY_LOCAL>();
    const generation2Submission = deferred<typeof EMPTY_GENERATION_2_SUBMISSION>();
    const predecessorSubmission = deferred<typeof EMPTY_PREDECESSOR_SUBMISSION>();
    const submission = deferred<typeof EMPTY_SUBMISSION>();
    harness.openAncestor.mockImplementation(() => ancestor.promise);
    harness.openGeneration2.mockImplementation(() => generation2.promise);
    harness.openGeneration3.mockImplementation(() => generation3.promise);
    harness.openPredecessor.mockImplementation(() => predecessor.promise);
    harness.openLocal.mockImplementation(() => local.promise);
    harness.probeGeneration2Submission.mockImplementation(() => generation2Submission.promise);
    harness.probePredecessorSubmission.mockImplementation(() => predecessorSubmission.promise);
    harness.openSubmission.mockImplementation(() => submission.promise);

    const running = runBscTestnetPtaWbnbPoolProductionOnceFromStdin();
    await Promise.resolve();
    expect(harness.openAncestor).toHaveBeenCalledTimes(1);
    expect(harness.openGeneration2).toHaveBeenCalledTimes(1);
    expect(harness.openGeneration3).toHaveBeenCalledTimes(1);
    expect(harness.openPredecessor).toHaveBeenCalledTimes(1);
    expect(harness.openLocal).toHaveBeenCalledTimes(1);
    expect(harness.probeGeneration2Submission).toHaveBeenCalledTimes(1);
    expect(harness.probePredecessorSubmission).toHaveBeenCalledTimes(1);
    expect(harness.openSubmission).toHaveBeenCalledTimes(1);
    expect(harness.readPolicy).not.toHaveBeenCalled();
    ancestor.resolve(ANCESTOR_FENCED);
    await Promise.resolve();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    generation2.resolve(GENERATION_2_FENCED);
    await Promise.resolve();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    generation3.resolve(GENERATION_3_FENCED);
    await Promise.resolve();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    predecessor.resolve(PREDECESSOR_OPENED);
    await Promise.resolve();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    local.resolve(EMPTY_LOCAL);
    await Promise.resolve();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    generation2Submission.resolve(EMPTY_GENERATION_2_SUBMISSION);
    await Promise.resolve();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    predecessorSubmission.resolve(EMPTY_PREDECESSOR_SUBMISSION);
    await Promise.resolve();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    submission.resolve(EMPTY_SUBMISSION);
    await running;
    expect(harness.readPolicy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["generation-1 signing", harness.openAncestor],
    ["generation-2 signing", harness.openGeneration2],
    ["generation-3 signing", harness.openGeneration3],
    ["generation-4 signing", harness.openPredecessor],
    ["generation-5 signing", harness.openLocal],
    ["submission-v2", harness.probeGeneration2Submission],
    ["submission-v3", harness.probePredecessorSubmission],
    ["submission-v4", harness.openSubmission]
  ])("fails closed when the %s startup probe is blocked", async (_label, probe) => {
    probe.mockResolvedValueOnce(Object.freeze({ status: "blocked" }));

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

  it.each([
    [
      "generation-4 raw terminal hash",
      Object.freeze({
        ...PREDECESSOR_TERMINAL,
        predecessorTerminalRawSha256: `0x${"81".repeat(32)}`
      })
    ],
    [
      "generation-3 inherited fence",
      Object.freeze({
        ...PREDECESSOR_TERMINAL,
        inheritedFenceSha256: `0x${"82".repeat(32)}`
      })
    ]
  ])("rejects a generation-4 terminal with a mismatched %s", async (_label, terminal) => {
    PREDECESSOR_JOURNAL.readExactTerminalRecoveryBinding.mockResolvedValueOnce(terminal as never);

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "PREDECESSOR_TERMINAL_MISSING"
    });
    expect(harness.createBridge).not.toHaveBeenCalled();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    expect(harness.prepare).not.toHaveBeenCalled();
  });

  it.each(["absent", "present"] as const)(
    "requires submission-v3 to be an existing exact-empty namespace, not %s",
    async (presence) => {
      harness.probePredecessorSubmission.mockResolvedValueOnce(
        Object.freeze({
          status: "ready",
          presence,
          files: Object.freeze([]),
          issue: null
        })
      );

      await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
        status: "blocked",
        code: "RESTART_BINDING_UNKNOWN"
      });
      expect(PREDECESSOR_JOURNAL.readExactTerminalRecoveryBinding).not.toHaveBeenCalled();
      expect(harness.createBridge).not.toHaveBeenCalled();
      expect(harness.readPolicy).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      "reuses the generation-4 envelope hash",
      Object.freeze({
        ...ENVELOPE,
        envelopeHash: PREDECESSOR_TERMINAL.predecessorEnvelopeHash
      })
    ],
    ["is not later than the generation-4 terminal", envelope("22", PREDECESSOR_TERMINAL.recordedAt)]
  ])("blocks a fresh envelope that %s", async (_label, candidate) => {
    harness.prepare.mockResolvedValueOnce(
      Object.freeze({ status: "observed" as const, envelope: candidate })
    );
    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "EXECUTION_ENVELOPE_NOT_AFTER_TERMINAL"
    });
    expect(PREDECESSOR_JOURNAL.readExactTerminalRecoveryBinding).toHaveBeenCalledTimes(1);
    expect(harness.prepare).toHaveBeenCalledTimes(1);
    expect(harness.instantiate).not.toHaveBeenCalled();
    expect(harness.ceremony).not.toHaveBeenCalled();
    expect(harness.activate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "generation-1 signing",
      () =>
        harness.openAncestor
          .mockResolvedValueOnce(ANCESTOR_FENCED)
          .mockResolvedValueOnce(EMPTY_LOCAL)
    ],
    [
      "generation-2 signing",
      () =>
        harness.openGeneration2
          .mockResolvedValueOnce(GENERATION_2_FENCED)
          .mockResolvedValueOnce(EMPTY_LOCAL)
    ],
    [
      "generation-3 signing",
      () =>
        harness.openGeneration3
          .mockResolvedValueOnce(GENERATION_3_FENCED)
          .mockResolvedValueOnce(EMPTY_LOCAL)
    ],
    [
      "generation-4 signing",
      () =>
        harness.openPredecessor
          .mockResolvedValueOnce(PREDECESSOR_OPENED)
          .mockResolvedValueOnce(EMPTY_LOCAL)
    ],
    [
      "generation-5 signing",
      () =>
        harness.openLocal.mockResolvedValueOnce(EMPTY_LOCAL).mockResolvedValueOnce(
          Object.freeze({
            status: "opened",
            journal: Object.freeze({}),
            state: Object.freeze({ status: "claimed" }),
            issue: null
          })
        )
    ],
    [
      "submission-v2",
      () =>
        harness.probeGeneration2Submission
          .mockResolvedValueOnce(EMPTY_GENERATION_2_SUBMISSION)
          .mockResolvedValueOnce(
            Object.freeze({
              status: "ready",
              presence: "present",
              files: Object.freeze(["01-claim.v4.json"]),
              issue: null
            })
          )
    ],
    [
      "submission-v3",
      () =>
        harness.probePredecessorSubmission
          .mockResolvedValueOnce(EMPTY_PREDECESSOR_SUBMISSION)
          .mockResolvedValueOnce(
            Object.freeze({
              status: "ready",
              presence: "absent",
              files: Object.freeze([]),
              issue: null
            })
          )
    ],
    [
      "submission-v4",
      () =>
        harness.openSubmission.mockResolvedValueOnce(EMPTY_SUBMISSION).mockResolvedValueOnce(
          Object.freeze({
            status: "opened",
            journal: Object.freeze({}),
            state: Object.freeze({ state: "signed_committed" }),
            issue: null
          })
        )
    ]
  ])("rejects %s drift after owner TTY before custody activation", async (_label, arrange) => {
    arrange();
    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "POST_OWNER_DURABLE_STATE_CHANGED"
    });
    expect(harness.ceremony).toHaveBeenCalledTimes(1);
    expect(harness.activate).not.toHaveBeenCalled();
    expect(harness.createBroadcaster).not.toHaveBeenCalled();
  });

  it("rejects active signing drift after activation before broadcaster provisioning", async () => {
    harness.openLocal
      .mockResolvedValueOnce(EMPTY_LOCAL)
      .mockResolvedValueOnce(EMPTY_LOCAL)
      .mockResolvedValueOnce(
        Object.freeze({
          status: "opened",
          journal: Object.freeze({}),
          state: Object.freeze({ status: "claimed" }),
          issue: null
        })
      );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "POST_ACTIVATION_DURABLE_STATE_CHANGED"
    });
    expect(harness.activate).toHaveBeenCalledTimes(1);
    expect(harness.createBroadcaster).not.toHaveBeenCalled();
    expect(harness.createComposition).not.toHaveBeenCalled();
  });

  it("rejects submission-v4 drift immediately before composition", async () => {
    harness.openSubmission
      .mockResolvedValueOnce(EMPTY_SUBMISSION)
      .mockResolvedValueOnce(EMPTY_SUBMISSION)
      .mockResolvedValueOnce(EMPTY_SUBMISSION)
      .mockResolvedValueOnce(
        Object.freeze({
          status: "opened",
          journal: Object.freeze({}),
          state: Object.freeze({ state: "signed_committed" }),
          issue: null
        })
      );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "PRE_COMPOSITION_DURABLE_STATE_CHANGED"
    });
    expect(harness.activate).toHaveBeenCalledTimes(1);
    expect(harness.createBroadcaster).toHaveBeenCalledTimes(1);
    expect(harness.createComposition).not.toHaveBeenCalled();
  });

  it("rejects generation-4 terminal drift between startup and the post-owner reread", async () => {
    PREDECESSOR_JOURNAL.readExactTerminalRecoveryBinding
      .mockResolvedValueOnce(PREDECESSOR_TERMINAL)
      .mockResolvedValueOnce(
        Object.freeze({ ...PREDECESSOR_TERMINAL, recordedAt: "2026-08-14T10:00:01.901Z" })
      );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "POST_OWNER_DURABLE_STATE_CHANGED"
    });
    expect(harness.ceremony).toHaveBeenCalledTimes(1);
    expect(harness.activate).not.toHaveBeenCalled();
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
    expect(harness.reconcile).toHaveBeenCalledWith(localJournal, submissionJournal, null);
    expect(harness.createBridge).not.toHaveBeenCalled();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    expect(harness.activate).not.toHaveBeenCalled();
    expect(harness.createBroadcaster).not.toHaveBeenCalled();
  });

  it("rejects an opened recovery pair without the exact generation-4 terminal lineage", async () => {
    PREDECESSOR_JOURNAL.readExactTerminalRecoveryBinding.mockResolvedValueOnce(null);
    harness.openLocal.mockResolvedValueOnce(
      Object.freeze({ status: "opened", journal: Object.freeze({}), state: {}, issue: null })
    );
    harness.openSubmission.mockResolvedValueOnce(
      Object.freeze({ status: "opened", journal: Object.freeze({}), state: {}, issue: null })
    );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "PREDECESSOR_TERMINAL_INVALID"
    });
    expect(harness.reconcile).not.toHaveBeenCalled();
    expect(harness.createBridge).not.toHaveBeenCalled();
  });

  it("blocks when an opened recovery pair disappears during reconciliation", async () => {
    harness.openLocal.mockResolvedValueOnce(
      Object.freeze({ status: "opened", journal: Object.freeze({}), state: {}, issue: null })
    );
    harness.openSubmission.mockResolvedValueOnce(
      Object.freeze({ status: "opened", journal: Object.freeze({}), state: {}, issue: null })
    );
    harness.reconcile.mockResolvedValueOnce(Object.freeze({ status: "fresh" }));

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "RECOVERY_STATE_CHANGED"
    });
    expect(harness.reconcile).toHaveBeenCalledTimes(1);
    expect(harness.createBridge).not.toHaveBeenCalled();
  });

  it("rejects a lone submission-v4 signed commit instead of treating it as a recovery pair", async () => {
    const transactionHash = `0x${"65".repeat(32)}` as const;
    harness.openSubmission.mockResolvedValueOnce(
      Object.freeze({
        status: "opened",
        journal: Object.freeze({}),
        state: Object.freeze({
          state: "signed_committed",
          capability: Object.freeze({
            transaction: Object.freeze({ transactionHash })
          })
        }),
        issue: null
      })
    );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "RESTART_SIGNED_COMMIT_REQUIRES_NEW_AUTHORITY",
      transactionHash
    });
    expect(harness.reconcile).not.toHaveBeenCalled();
    expect(harness.createBridge).not.toHaveBeenCalled();
    expect(harness.readPolicy).not.toHaveBeenCalled();
  });

  it("reopens a started submission through only the terminal-reconciliation facade", async () => {
    const localJournal = Object.freeze({});
    const submissionReader = Object.freeze({
      readRecoveryState: vi.fn(),
      readStrictRecoveryState: vi.fn()
    });
    const submissionState = Object.freeze({ state: "submission_started" as const });
    const terminalJournal = Object.freeze({
      readState: vi.fn(),
      commitTerminalReconciliation: vi.fn()
    });
    harness.openLocal.mockResolvedValueOnce(
      Object.freeze({ status: "opened", journal: localJournal, state: {}, issue: null })
    );
    harness.openSubmission.mockResolvedValueOnce(
      Object.freeze({
        status: "opened",
        journal: submissionReader,
        state: submissionState,
        issue: null
      })
    );
    harness.openTerminalSubmission.mockResolvedValueOnce(
      Object.freeze({
        status: "opened",
        journal: terminalJournal,
        state: submissionState,
        issue: null
      })
    );
    harness.reconcile.mockResolvedValueOnce(
      Object.freeze({ status: "handled", result: FRESH_RESULT })
    );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toEqual(FRESH_RESULT);
    expect(harness.openTerminalSubmission).toHaveBeenCalledWith(submissionState);
    expect(Object.keys(submissionReader).sort()).toEqual([
      "readRecoveryState",
      "readStrictRecoveryState"
    ]);
    expect(Object.keys(terminalJournal).sort()).toEqual([
      "commitTerminalReconciliation",
      "readState"
    ]);
    expect(harness.reconcile).toHaveBeenCalledWith(localJournal, submissionReader, terminalJournal);
    expect(harness.createBridge).not.toHaveBeenCalled();
  });

  it("blocks when the started state changes before the terminal-only reopen", async () => {
    const submissionState = Object.freeze({ state: "unknown_outcome" as const });
    harness.openLocal.mockResolvedValueOnce(
      Object.freeze({ status: "opened", journal: Object.freeze({}), state: {}, issue: null })
    );
    harness.openSubmission.mockResolvedValueOnce(
      Object.freeze({
        status: "opened",
        journal: Object.freeze({
          readRecoveryState: vi.fn(),
          readStrictRecoveryState: vi.fn()
        }),
        state: submissionState,
        issue: null
      })
    );
    harness.openTerminalSubmission.mockResolvedValueOnce(
      Object.freeze({ status: "blocked", journal: null, state: null, issue: {} })
    );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "TERMINAL_RECOVERY_JOURNAL_INVALID"
    });
    expect(harness.reconcile).not.toHaveBeenCalled();
    expect(harness.createBridge).not.toHaveBeenCalled();
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
      expect(harness.reconcile).toHaveBeenCalledWith(localJournal, submissionJournal, null);
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
