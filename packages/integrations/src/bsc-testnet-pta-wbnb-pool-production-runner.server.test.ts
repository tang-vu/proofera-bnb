import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  order: [] as string[],
  openAncestor: vi.fn(),
  openGeneration2: vi.fn(),
  openLegacy: vi.fn(),
  openLocal: vi.fn(),
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
  openExistingWindowsBscTestnetPtaWbnbPoolPredecessorLocalJournalForRecoveryForInternalUse:
    harness.openLegacy,
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse: harness.openLocal
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-submission-journal.server", () => ({
  openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse:
    harness.openSubmission,
  openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationForInternalUse:
    harness.openTerminalSubmission,
  probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalForInternalUse:
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
const LEGACY_CLAIM_RAW_SHA256 =
  "0xf10e90eb836a94446ace100bbc9a6fc5de6cc35b1d82e4d10fb4736ef8559e32" as const;
const PREDECESSOR_CLAIM_RAW_SHA256 =
  "0x613df995936c3ccfff56e5da5588906f1bd28340ae8297eb08524274b9b8e1c3" as const;
const GENERATION_3_CLAIM_RAW_SHA256 =
  "0x7ff780a8f0ac1a1f8ff7bced5d858259f918cdb1891c684aa208b6bca31c9585" as const;
const ANCESTOR_FENCE_SHA256 = `0x${"09".repeat(32)}` as const;
const ANCESTOR_FENCE = Object.freeze({
  status: "superseded_before_worker" as const,
  terminalCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" as const,
  workerAuthorizationOutcome: "not_attempted" as const,
  workerStartOutcome: "not_attempted" as const,
  signatureOutcome: "not_attempted" as const,
  submissionOutcome: "not_attempted" as const,
  submissionJournalState: "exact_empty" as const,
  predecessorClaimRawSha256: LEGACY_CLAIM_RAW_SHA256,
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
  predecessorClaimRawSha256: PREDECESSOR_CLAIM_RAW_SHA256,
  noEffectProofDigest: `0x${"10".repeat(32)}` as const,
  noEffectEnvelopeHash: `0x${"11".repeat(32)}` as const,
  noEffectObservedAt: "2026-08-14T10:00:00.000Z",
  fenceRecordedAt: "2026-08-14T10:00:01.000Z",
  predecessorFenceSha256: `0x${"12".repeat(32)}` as const
});
const PREDECESSOR_FENCE = Object.freeze({
  ...FENCE,
  predecessorClaimRawSha256: GENERATION_3_CLAIM_RAW_SHA256,
  noEffectProofDigest: `0x${"13".repeat(32)}` as const,
  noEffectEnvelopeHash: `0x${"14".repeat(32)}` as const,
  noEffectObservedAt: "2026-08-14T10:00:01.500Z",
  fenceRecordedAt: "2026-08-14T10:00:01.750Z",
  predecessorFenceSha256: `0x${"15".repeat(32)}` as const
});
const LEGACY_JOURNAL = Object.freeze({
  readClaimOnlyRecoveryCandidate: vi.fn(async () => null),
  fenceClaimBeforeWorker: vi.fn(),
  readState: vi.fn(),
  readStrictRecoveryState: vi.fn(async () =>
    Object.freeze({ status: "superseded_before_worker", supersessionFence: PREDECESSOR_FENCE })
  )
});
const LEGACY_FENCED = Object.freeze({
  status: "opened" as const,
  journal: LEGACY_JOURNAL,
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
      latestNonce: "1" as const,
      pendingNonce: "1" as const,
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
  harness.openLegacy.mockImplementation(async () => {
    harness.order.push("legacy-open");
    return LEGACY_FENCED;
  });
  harness.openGeneration2.mockImplementation(async () => {
    harness.order.push("generation2-open");
    return GENERATION_2_FENCED;
  });
  harness.openLocal.mockImplementation(async () => {
    harness.order.push("local-open");
    return EMPTY_LOCAL;
  });
  harness.openSubmission.mockImplementation(async () => {
    harness.order.push("submission-open");
    return EMPTY_SUBMISSION;
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
  it("rereads all six durable namespaces across fence, TTY, activation, and claim boundaries", async () => {
    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toEqual(FRESH_RESULT);

    expect(harness.order).toEqual([
      "ancestor-open",
      "generation2-open",
      "legacy-open",
      "local-open",
      "predecessor-submission-probe",
      "submission-open",
      "ancestor-open",
      "generation2-open",
      "legacy-open",
      "local-open",
      "predecessor-submission-probe",
      "submission-open",
      "release",
      "policy-tty",
      "coordinator-rpc",
      "describe-envelope",
      "instantiate-policy",
      "owner-tty",
      "ancestor-open",
      "generation2-open",
      "legacy-open",
      "local-open",
      "predecessor-submission-probe",
      "submission-open",
      "activate-custody-journal",
      "ancestor-open",
      "generation2-open",
      "legacy-open",
      "local-open",
      "predecessor-submission-probe",
      "submission-open",
      "provision-submission-broadcaster",
      "ancestor-open",
      "generation2-open",
      "legacy-open",
      "local-open",
      "predecessor-submission-probe",
      "submission-open",
      "composition-create",
      "composition-run"
    ]);
    expect(harness.readPolicy).toHaveBeenCalledWith(RELEASE);
    expect(harness.instantiate).toHaveBeenCalledWith(
      Object.freeze({
        envelopeHash: DESCRIPTOR.envelopeHash,
        executionEnvelopeObservedAt: ENVELOPE.observation.observedAt,
        expiresAt: DESCRIPTOR.envelopeExpiresAt,
        predecessorFence: expect.objectContaining({
          predecessorFenceSha256: PREDECESSOR_FENCE.predecessorFenceSha256,
          fenceRecordedAt: PREDECESSOR_FENCE.fenceRecordedAt,
          noEffectEnvelopeHash: PREDECESSOR_FENCE.noEffectEnvelopeHash
        })
      })
    );
    expect(harness.ceremony).toHaveBeenCalledWith(DESCRIPTOR, RUNTIME_INSTANTIATION);
    expect(harness.activate).toHaveBeenCalledWith(DESCRIPTOR, COMMAND);
    expect(harness.createBroadcaster).toHaveBeenCalledWith(ACTIVATED_BRIDGE);
    expect(harness.createComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: INTENT,
        executionCapability: EXECUTION_CAPABILITY,
        legacySigningJournal: LEGACY_JOURNAL,
        signingJournal: SIGNING_JOURNAL,
        submissionJournal: SUBMISSION_JOURNAL,
        broadcaster: BROADCASTER
      })
    );
  });

  it("waits for all six startup probes and does not preload policy while any is pending", async () => {
    const legacy = deferred<typeof LEGACY_FENCED>();
    const local = deferred<typeof EMPTY_LOCAL>();
    const submission = deferred<typeof EMPTY_SUBMISSION>();
    harness.openLegacy.mockImplementation(() => legacy.promise);
    harness.openLocal.mockImplementation(() => local.promise);
    harness.openSubmission.mockImplementation(() => submission.promise);

    const running = runBscTestnetPtaWbnbPoolProductionOnceFromStdin();
    await Promise.resolve();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    legacy.resolve(LEGACY_FENCED);
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

  it("rejects a predecessor fence whose exact-empty submission binding changed", async () => {
    const invalidFence = Object.freeze({
      ...FENCE,
      submissionJournalState: "not_exact_empty"
    });
    harness.openLegacy.mockResolvedValue(
      Object.freeze({
        status: "opened",
        journal: LEGACY_JOURNAL,
        state: Object.freeze({
          status: "superseded_before_worker",
          supersessionFence: invalidFence
        }),
        issue: null
      })
    );

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "PREDECESSOR_NOT_EXACT_CLAIM_ONLY"
    });
    expect(harness.createBridge).not.toHaveBeenCalled();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    expect(harness.prepare).not.toHaveBeenCalled();
    expect(harness.activate).not.toHaveBeenCalled();
    expect(harness.createBroadcaster).not.toHaveBeenCalled();
  });

  it("returns after snapshot A fencing and permits snapshot B only in the next invocation", async () => {
    const snapshotA = envelope("31", "2026-08-14T10:00:00.500Z");
    const fenceA = Object.freeze({
      ...PREDECESSOR_FENCE,
      noEffectEnvelopeHash: snapshotA.envelopeHash
    });
    const fencedJournalA = Object.freeze({
      ...LEGACY_JOURNAL,
      readStrictRecoveryState: vi.fn(async () =>
        Object.freeze({ status: "superseded_before_worker", supersessionFence: fenceA })
      )
    });
    const fencedA = Object.freeze({
      status: "opened" as const,
      journal: fencedJournalA,
      state: Object.freeze({
        status: "superseded_before_worker" as const,
        generation: 3 as const,
        predecessorFenceSha256: FENCE.predecessorFenceSha256,
        supersessionFence: fenceA
      }),
      issue: null
    });
    const candidate = Object.freeze({
      status: "claimed" as const,
      predecessorClaimRawSha256: GENERATION_3_CLAIM_RAW_SHA256,
      predecessorClaimRecordedAt: "2026-08-14T09:59:00.000Z",
      predecessorAuthorizationExpiresAt: "2026-08-14T10:00:00.250Z"
    });
    const claimJournal = Object.freeze({
      readClaimOnlyRecoveryCandidate: vi.fn(async () => candidate),
      fenceClaimBeforeWorker: vi.fn(async () => fenceA),
      readState: vi.fn(),
      readStrictRecoveryState: vi.fn()
    });
    const claimOnly = Object.freeze({
      status: "opened" as const,
      journal: claimJournal,
      state: Object.freeze({
        status: "claimed" as const,
        generation: 3 as const,
        predecessorFenceSha256: FENCE.predecessorFenceSha256,
        supersessionFence: null
      }),
      issue: null
    });
    harness.openLegacy
      .mockResolvedValueOnce(claimOnly)
      .mockResolvedValueOnce(claimOnly)
      .mockResolvedValue(fencedA);
    harness.prepare
      .mockResolvedValueOnce(Object.freeze({ status: "observed" as const, envelope: snapshotA }))
      .mockResolvedValueOnce(Object.freeze({ status: "observed" as const, envelope: ENVELOPE }));

    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "PREDECESSOR_FENCE_RECORDED_RESTART_REQUIRED"
    });
    expect(harness.prepare).toHaveBeenCalledTimes(1);
    expect(harness.createBridge).not.toHaveBeenCalled();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    expect(harness.instantiate).not.toHaveBeenCalled();
    expect(harness.ceremony).not.toHaveBeenCalled();
    expect(harness.activate).not.toHaveBeenCalled();
    expect(harness.createBroadcaster).not.toHaveBeenCalled();
    expect(harness.createComposition).not.toHaveBeenCalled();
    expect(harness.runComposition).not.toHaveBeenCalled();
    expect(claimJournal.fenceClaimBeforeWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedPredecessorClaimRawSha256: GENERATION_3_CLAIM_RAW_SHA256,
        proof: expect.objectContaining({
          envelopeHash: snapshotA.envelopeHash,
          observedAt: snapshotA.observation.observedAt,
          submissionJournalPresence: "absent"
        })
      })
    );

    harness.order.splice(0);
    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toEqual(FRESH_RESULT);
    expect(harness.prepare).toHaveBeenCalledTimes(2);
    expect(harness.instantiate).toHaveBeenCalledWith(
      expect.objectContaining({
        envelopeHash: ENVELOPE.envelopeHash,
        executionEnvelopeObservedAt: ENVELOPE.observation.observedAt,
        predecessorFence: expect.objectContaining({
          noEffectEnvelopeHash: snapshotA.envelopeHash,
          fenceRecordedAt: fenceA.fenceRecordedAt
        })
      })
    );
    expect(harness.createBridge.mock.invocationCallOrder[0]).toBeLessThan(
      harness.prepare.mock.invocationCallOrder[1] ?? Number.NaN
    );
  });

  it("blocks when execution snapshot B is not strictly after the retained fence", async () => {
    harness.prepare.mockResolvedValueOnce(
      Object.freeze({
        status: "observed" as const,
        envelope: envelope("22", FENCE.fenceRecordedAt)
      })
    );
    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "EXECUTION_ENVELOPE_NOT_AFTER_FENCE"
    });
    expect(harness.instantiate).not.toHaveBeenCalled();
    expect(harness.ceremony).not.toHaveBeenCalled();
    expect(harness.activate).not.toHaveBeenCalled();
  });

  it("rejects active-journal drift after owner TTY before custody activation", async () => {
    const changedActive = Object.freeze({
      status: "opened" as const,
      journal: Object.freeze({ readState: vi.fn(), readStrictRecoveryState: vi.fn() }),
      state: Object.freeze({ status: "claimed" as const }),
      issue: null
    });
    harness.openLocal
      .mockResolvedValueOnce(EMPTY_LOCAL)
      .mockResolvedValueOnce(EMPTY_LOCAL)
      .mockResolvedValueOnce(changedActive);
    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "POST_OWNER_DURABLE_STATE_CHANGED"
    });
    expect(harness.ceremony).toHaveBeenCalledTimes(1);
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
    expect(harness.reconcile).toHaveBeenCalledWith(localJournal, submissionJournal, null);
    expect(harness.createBridge).not.toHaveBeenCalled();
    expect(harness.readPolicy).not.toHaveBeenCalled();
    expect(harness.activate).not.toHaveBeenCalled();
    expect(harness.createBroadcaster).not.toHaveBeenCalled();
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
