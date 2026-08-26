import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const events: string[] = [];
  const transactionHash = "0xa24d1dfa3440de3fcb644d9b52847bcc8d54f43a2e29b425f50bbce4bd684022";
  const capability = {
    ownerAuthorizationDigest: `0x${"11".repeat(32)}`,
    transaction: {
      transactionHash,
      signedTransaction: "0x01"
    }
  };
  const binding = {
    generation: 9,
    transactionHash,
    signedCommitSha256: `0x${"22".repeat(32)}`,
    gasLimit: "6600000",
    gasPriceWei: "100000000",
    predecessorBundleDigest: `0x${"33".repeat(32)}`
  };
  return {
    events,
    capability,
    binding,
    recovery: { status: "absent" } as Record<string, unknown>,
    result: {
      status: "reconciliation_pending",
      retryBroadcastAllowed: false,
      reconciliationRetryAllowed: true,
      transactionHash,
      issue: null,
      boundary: {}
    }
  };
});

vi.mock("server-only", () => ({}));
vi.mock("./bsc-testnet-pta-wbnb-pool-local-journal.server", () => ({
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse: vi.fn(async () => {
    harness.events.push("probe-local");
    return { status: "opened" };
  }),
  probeWindowsBscTestnetPtaWbnbPoolGeneration9RecordHashesForInternalUse: vi.fn(async () => {
    harness.events.push("probe-local-hashes");
    return { status: "ready" };
  })
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-submission-journal.server", () => ({
  openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse: vi.fn(
    async () => {
      harness.events.push("probe-predecessor-submission");
      return { status: "opened" };
    }
  )
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-generation-10-recovery", () => ({
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256: `0x${"22".repeat(32)}`,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH:
    "0xa24d1dfa3440de3fcb644d9b52847bcc8d54f43a2e29b425f50bbce4bd684022",
  inspectBscTestnetPtaWbnbPoolGeneration10PredecessorForInternalUse: vi.fn(async () => ({
    status: "ready",
    binding: harness.binding,
    capability: harness.capability,
    issue: null
  }))
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-generation-10-journal.server", () => ({
  openExistingWindowsBscTestnetPtaWbnbPoolGeneration10JournalForRecoveryForInternalUse: vi.fn(
    async () => harness.recovery
  ),
  createWindowsBscTestnetPtaWbnbPoolGeneration10JournalForInternalUse: vi.fn(async () => {
    harness.events.push("create-journal");
    return {
      readState: async () => ({}),
      readRecoveryState: async () => ({ state: "empty" }),
      commitSubmissionStarted: async () => ({}),
      commitTerminalReconciliation: async () => ({}),
      consumeCreatedStartToken: () => true
    };
  }),
  narrowBscTestnetPtaWbnbPoolGeneration10JournalForSubmissionForInternalUse: vi.fn((journal) => ({
    readState: journal.readState,
    commitSubmissionStarted: journal.commitSubmissionStarted,
    commitTerminalReconciliation: journal.commitTerminalReconciliation
  }))
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-generation-10-release.server", () => ({
  inspectBscTestnetPtaWbnbPoolGeneration10ReleaseIdentityForInternalUse: vi.fn(async () => {
    harness.events.push("release");
    return {
      releaseCommit: "1".repeat(40),
      releaseTree: "2".repeat(40),
      runtimeManifest: { runtimeManifestSha256: `0x${"44".repeat(32)}` }
    };
  })
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-generation-10-policy.server", () => ({
  readBscTestnetPtaWbnbPoolGeneration10PolicyFromControllingTtyForInternalUse: vi.fn(async () => {
    harness.events.push("policy");
    return {
      status: "ready",
      realm: {
        instantiate: () => {
          harness.events.push("instantiate");
          return {
            instantiationDigest: `0x${"55".repeat(32)}`,
            predecessorBundleDigest: harness.binding.predecessorBundleDigest
          };
        }
      },
      policy: {
        policyDigest: `0x${"66".repeat(32)}`,
        reviewedSubjectSha256: `0x${"77".repeat(32)}`
      }
    };
  })
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-coordinator.server", () => ({
  prepareBscTestnetPtaWbnbPoolInitializationEnvelope: vi.fn(async () => {
    harness.events.push("coordinator");
    return { status: "observed", envelope: { observation: {} } };
  })
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server", () => ({
  describeBscTestnetPtaWbnbPoolOneShotBoundary: vi.fn(() => ({
    status: "prepared_non_authorizing",
    envelopeHash: `0x${"88".repeat(32)}`,
    envelopeObservedAt: "2026-08-26T05:00:00.000Z",
    envelopeExpiresAt: "2026-08-26T05:05:00.000Z"
  }))
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-generation-10-authority.server", () => ({
  conductBscTestnetPtaWbnbPoolGeneration10OwnerCeremonyForInternalUse: vi.fn(async () => {
    harness.events.push("ceremony");
    return { status: "confirmed", command: {}, issue: null };
  }),
  issueBscTestnetPtaWbnbPoolGeneration10SubmissionCapabilityForInternalUse: vi.fn(() => {
    harness.events.push("issue-capability");
    return harness.capability;
  }),
  authenticateBscTestnetPtaWbnbPoolGeneration10SubmissionCapabilityForInternalUse: vi.fn(
    () => true
  ),
  consumeBscTestnetPtaWbnbPoolGeneration10SendAuthorityForInternalUse: vi.fn(() => true)
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-production-rpc.server", () => ({
  acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse: vi.fn(async () => {
    harness.events.push("pre-submission");
    return {};
  }),
  createBscTestnetPtaWbnbPoolGeneration10ExistingSignatureSenderForInternalUse: vi.fn(() => {
    harness.events.push("create-sender");
    return {
      sendExactRawTransactionOnce: async () => harness.capability.transaction.transactionHash
    };
  }),
  observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse: vi.fn(async () => ({}))
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-submission-reconciler.server", () => ({
  createBscTestnetPtaWbnbPoolSubmissionCoreForInternalUse: vi.fn(() => {
    harness.events.push("create-core");
    return {
      submitAndReconcileOnce: async () => {
        harness.events.push("submit");
        return harness.result;
      }
    };
  }),
  createBscTestnetPtaWbnbPoolReconciliationRecoveryCoreForInternalUse: vi.fn(() => {
    harness.events.push("create-recovery-core");
    return {
      submitAndReconcileOnce: async () => {
        harness.events.push("reconcile");
        return harness.result;
      }
    };
  })
}));
vi.mock("./bsc-testnet-pta-wbnb-pool-production-composition.server", () => ({
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_COMPOSITION_BOUNDARY: Object.freeze({
    environment: "bsc-testnet"
  })
}));

import { runBscTestnetPtaWbnbPoolGeneration10IfApplicableForInternalUse } from "./bsc-testnet-pta-wbnb-pool-generation-10-runner.server";

describe("generation-10 root dispatch", () => {
  beforeEach(() => {
    harness.events.length = 0;
    harness.recovery = { status: "absent" };
  });

  it("orders fresh owner authority and dual-RPC checks before the new durable one-send path", async () => {
    const result = await runBscTestnetPtaWbnbPoolGeneration10IfApplicableForInternalUse();
    expect(result).toEqual({ status: "handled", result: harness.result });
    const order = harness.events.filter((event) =>
      [
        "policy",
        "coordinator",
        "ceremony",
        "pre-submission",
        "issue-capability",
        "create-journal",
        "create-sender",
        "create-core",
        "submit"
      ].includes(event)
    );
    expect(order).toEqual([
      "policy",
      "coordinator",
      "ceremony",
      "pre-submission",
      "issue-capability",
      "create-journal",
      "create-sender",
      "create-core",
      "submit"
    ]);
  });

  it("uses reconciliation-only recovery after a durable start and never reopens owner policy", async () => {
    harness.recovery = {
      status: "opened",
      state: { state: "submission_started", capability: harness.capability },
      terminalJournal: {}
    };
    const result = await runBscTestnetPtaWbnbPoolGeneration10IfApplicableForInternalUse();
    expect(result).toEqual({ status: "handled", result: harness.result });
    expect(harness.events).toContain("create-recovery-core");
    expect(harness.events).toContain("reconcile");
    expect(harness.events).not.toContain("policy");
    expect(harness.events).not.toContain("ceremony");
    expect(harness.events).not.toContain("pre-submission");
    expect(harness.events).not.toContain("create-sender");
  });
});
