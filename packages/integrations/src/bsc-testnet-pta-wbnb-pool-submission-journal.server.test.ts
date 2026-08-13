import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  type BscTestnetPtaWbnbPoolSubmissionJournalState,
  type BscTestnetPtaWbnbPoolSubmissionStartedRequest,
  type BscTestnetPtaWbnbPoolTerminalReconciliationRequest
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";
import {
  createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse,
  type BscTestnetPtaWbnbPoolSubmissionJournalPorts
} from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";

const NOW = "2026-08-13T10:00:00.000Z";
const bytes32 = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

const initial = Object.freeze({
  schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  claimId: "claim-production-1",
  envelopeHash: bytes32("1"),
  releaseCommit: "1".repeat(40),
  runtimeManifestSha256: bytes32("2"),
  reviewerApprovalDigest: bytes32("3"),
  ownerAuthorizationDigest: bytes32("4"),
  signingHash: bytes32("5"),
  transactionHash: bytes32("6"),
  signedTransactionKeccak256: bytes32("6"),
  submissionStartedDigest: bytes32("7"),
  state: "signed_committed" as const
}) satisfies BscTestnetPtaWbnbPoolSubmissionJournalState;

const start = Object.freeze({
  schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  operationKey: initial.operationKey,
  claimId: initial.claimId,
  envelopeHash: initial.envelopeHash,
  releaseCommit: initial.releaseCommit,
  runtimeManifestSha256: initial.runtimeManifestSha256,
  reviewerApprovalDigest: initial.reviewerApprovalDigest,
  ownerAuthorizationDigest: initial.ownerAuthorizationDigest,
  signingHash: initial.signingHash,
  transactionHash: initial.transactionHash,
  signedTransactionKeccak256: initial.signedTransactionKeccak256,
  submissionStartedDigest: initial.submissionStartedDigest
}) satisfies BscTestnetPtaWbnbPoolSubmissionStartedRequest;

const terminal = Object.freeze({
  schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  operation: BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
  operationKey: initial.operationKey,
  claimId: initial.claimId,
  envelopeHash: initial.envelopeHash,
  releaseCommit: initial.releaseCommit,
  runtimeManifestSha256: initial.runtimeManifestSha256,
  reviewerApprovalDigest: initial.reviewerApprovalDigest,
  ownerAuthorizationDigest: initial.ownerAuthorizationDigest,
  signingHash: initial.signingHash,
  transactionHash: initial.transactionHash,
  signedTransactionKeccak256: initial.signedTransactionKeccak256,
  submissionStartedDigest: initial.submissionStartedDigest,
  outcome: "confirmed" as const,
  reconciliationDigest: bytes32("8")
}) satisfies BscTestnetPtaWbnbPoolTerminalReconciliationRequest;

function memoryPorts(files = new Map<string, string>()): Readonly<{
  files: Map<string, string>;
  ports: BscTestnetPtaWbnbPoolSubmissionJournalPorts;
}> {
  return Object.freeze({
    files,
    ports: Object.freeze({
      now: () => new Date(NOW),
      listNames: async () => Object.freeze([...files.keys()].sort()),
      readBounded: async (name: string) => files.get(name) ?? null,
      createExclusive: async (name: string, content: string) => {
        if (files.has(name)) return "exists" as const;
        files.set(name, content);
        return "created" as const;
      },
      assertSecure: async () => true
    })
  });
}

describe("durable PTA/WBNB submission journal", () => {
  it("retains the complete signed binding and never treats initialization as submission", async () => {
    const fixture = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      fixture.ports
    );
    await expect(journal.initializeSignedCommit(initial)).resolves.toEqual({
      status: "initialized_by_this_call"
    });
    await expect(journal.readState()).resolves.toEqual(initial);
    expect(fixture.files.has("02-submission-started.v1.json")).toBe(false);
  });

  it("elects exactly one submission winner across a sixteen-way race", async () => {
    const fixture = memoryPorts();
    const journals = Array.from({ length: 16 }, () =>
      createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(fixture.ports)
    );
    await journals[0]?.initializeSignedCommit(initial);
    const outcomes = await Promise.all(
      journals.map((journal) => journal.commitSubmissionStarted(start))
    );
    expect(
      outcomes.filter(
        (entry) => (entry as Readonly<{ status?: unknown }>).status === "started_by_this_call"
      )
    ).toHaveLength(1);
    expect(
      outcomes.filter(
        (entry) => (entry as Readonly<{ status?: unknown }>).status === "already_started"
      )
    ).toHaveLength(15);
    await expect(journals[15]?.readState()).resolves.toMatchObject({
      state: "submission_started",
      transactionHash: initial.transactionHash,
      ownerAuthorizationDigest: initial.ownerAuthorizationDigest
    });
  });

  it("restart observes submission_started and cannot win or replace the send", async () => {
    const fixture = memoryPorts();
    const first = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(fixture.ports);
    await first.initializeSignedCommit(initial);
    await expect(first.commitSubmissionStarted(start)).resolves.toMatchObject({
      status: "started_by_this_call"
    });
    const restarted = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      fixture.ports
    );
    await expect(restarted.commitSubmissionStarted(start)).resolves.toMatchObject({
      status: "already_started"
    });
  });

  it("turns an ambiguous create acknowledgement into reconciliation-only restart state", async () => {
    const fixture = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      Object.freeze({
        ...fixture.ports,
        createExclusive: async (name: string, content: string) => {
          if (fixture.files.has(name)) return "exists" as const;
          fixture.files.set(name, content);
          if (name === "02-submission-started.v1.json") throw new Error("transport lost");
          return "created" as const;
        }
      })
    );
    await journal.initializeSignedCommit(initial);
    await expect(journal.commitSubmissionStarted(start)).rejects.toThrow("transport lost");

    const restarted = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      fixture.ports
    );
    await expect(restarted.readState()).resolves.toMatchObject({ state: "submission_started" });
    await expect(restarted.commitSubmissionStarted(start)).resolves.toMatchObject({
      status: "already_started"
    });
  });

  it("commits one exact terminal digest idempotently and rejects conflicting restart evidence", async () => {
    const fixture = memoryPorts();
    const first = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(fixture.ports);
    await first.initializeSignedCommit(initial);
    await first.commitSubmissionStarted(start);
    await expect(first.commitTerminalReconciliation(terminal)).resolves.toEqual({
      status: "confirmed",
      transactionHash: initial.transactionHash,
      submissionStartedDigest: initial.submissionStartedDigest,
      reconciliationDigest: terminal.reconciliationDigest
    });
    const restarted = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      fixture.ports
    );
    await expect(restarted.commitTerminalReconciliation(terminal)).resolves.toMatchObject({
      status: "confirmed"
    });
    await expect(
      restarted.commitTerminalReconciliation(
        Object.freeze({ ...terminal, reconciliationDigest: bytes32("9") })
      )
    ).rejects.toThrow("OUTCOME_UNKNOWN");
  });

  it("fails closed on cross-envelope mutation, corruption, proxy, and accessor inputs", async () => {
    const fixture = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      fixture.ports
    );
    await journal.initializeSignedCommit(initial);
    await expect(
      journal.commitSubmissionStarted(Object.freeze({ ...start, envelopeHash: bytes32("a") }))
    ).rejects.toThrow("OUTCOME_UNKNOWN");

    let traps = 0;
    const proxy = new Proxy(start, {
      get() {
        traps += 1;
        return undefined;
      },
      getPrototypeOf() {
        traps += 1;
        return Object.prototype;
      }
    });
    await expect(journal.commitSubmissionStarted(proxy)).rejects.toThrow("INPUT_INVALID");
    expect(traps).toBe(0);

    const getter = vi.fn(() => initial.transactionHash);
    const accessor = Object.freeze(
      Object.defineProperty({ ...start }, "transactionHash", {
        enumerable: true,
        get: getter
      })
    );
    await expect(journal.commitSubmissionStarted(accessor)).rejects.toThrow("INPUT_INVALID");
    expect(getter).not.toHaveBeenCalled();

    fixture.files.set("01-signed-commit.v1.json", "{}\n");
    await expect(journal.readState()).resolves.toEqual({ state: "unknown_outcome" });
  });
});
