import { keccak256, serializeTransaction, type Hex } from "viem";
import type * as ViemModule from "viem";
import { describe, expect, it, vi } from "vitest";

import type * as Generation10RecoveryModule from "./bsc-testnet-pta-wbnb-pool-generation-10-recovery";

const { FAKE_SIGNED_TRANSACTION, FAKE_TRANSACTION_HASH } = vi.hoisted(() => ({
  FAKE_SIGNED_TRANSACTION:
    "0xf8ea098405f5e1008364b54094427bf5b37357632377ecbec9de3626c71a5396c180b88413ead5620000000000000000000000004ed64525d6fb06b7da926c683cbd809632c9b4cc000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd00000000000000000000000000000000000000000000000000000000000001f40000000000000000000000000000000000000000004189374bc6a7ef9db22d0e81e5a018bb8e124103db2c67b1e84d1ec71b138c1564640ed98a79f4440a3d926a9fc9a05d7e2fdaa62f0e7842e8d95ea05bc66bbd128a727e52fd328be08d0bf7f183af" as Hex,
  FAKE_TRANSACTION_HASH:
    "0x28725894e6d1dd8ddb85c353e30f3d885a2a7bf3308e6eaf302228af8baae4d1" as const
}));

vi.mock("server-only", () => ({}));
vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof ViemModule>();
  return {
    ...original,
    recoverTransactionAddress: vi.fn(async () => "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49")
  };
});
vi.mock("./bsc-testnet-pta-wbnb-pool-generation-10-recovery", async (importOriginal) => {
  const original = await importOriginal<typeof Generation10RecoveryModule>();
  return {
    ...original,
    BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH: FAKE_TRANSACTION_HASH
  };
});

import {
  createBscTestnetPtaWbnbPoolGeneration10JournalForInternalUse,
  type BscTestnetPtaWbnbPoolGeneration10JournalMetadata
} from "./bsc-testnet-pta-wbnb-pool-generation-10-journal.server";
import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
  deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse,
  type BscTestnetPtaWbnbPoolSubmissionCapability,
  type BscTestnetPtaWbnbPoolSubmissionStartedRequest,
  type BscTestnetPtaWbnbPoolTerminalReconciliationRequest
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";

const NOW = "2026-08-26T05:00:10.000Z";
const bytes32 = (byte: string) => `0x${byte.repeat(64)}` as Hex;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function capability(): BscTestnetPtaWbnbPoolSubmissionCapability {
  const unsigned = serializeTransaction({
    chainId: 97,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    gas: 6_600_000n,
    gasPrice: 100_000_000n,
    nonce: 9,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    type: "legacy",
    value: 0n
  });
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    scope: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
    oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: "claim-generation-10-test",
    envelopeHash: bytes32("1"),
    reviewerApprovalDigest: bytes32("2"),
    ownerAuthorizationDigest: bytes32("3"),
    releaseCommit: "1".repeat(40),
    runtimeManifestSha256: bytes32("4"),
    recovery: Object.freeze({
      generation: 9,
      predecessorState: "failed_before_worker",
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
      attemptId: bytes32("5")
    }),
    authenticatedAt: "2026-08-26T05:00:00.000Z",
    expiresAt: "2026-08-26T05:02:00.000Z",
    signedCommitDurablyVerified: true,
    freshPreSubmissionDualRpcRecheckPerformed: true,
    preSubmission: Object.freeze({
      primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
      corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
      providerAgreementVerified: true,
      canonicalFinalizedBlockVerified: true,
      finalizedAnchorDualProviderExactNumberVerified: true,
      observedAt: "2026-08-26T05:00:00.000Z",
      finalizedBlockNumber: "100",
      finalizedBlockHash: bytes32("6"),
      finalizedBlockTimestamp: "1787720400",
      finalizedBlockGasLimit: "140000000",
      latestNonce: "9",
      pendingNonce: "9",
      transactionByHash: null,
      receiptByHash: null,
      factoryPoolForward: ZERO_ADDRESS,
      factoryPoolReverse: ZERO_ADDRESS,
      candidateCode: "0x",
      candidateNonce: "0",
      senderCode: "0x",
      senderBalanceWei: "100000000000000000",
      gasEstimate: "4999520",
      gasPriceWei: "100000000",
      simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
    }),
    transaction: Object.freeze({
      type: "legacy",
      chainId: "97",
      from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      nonce: "9",
      valueWei: "0",
      gasLimit: "6600000",
      gasPriceWei: "100000000",
      maximumCostWei: "660000000000000",
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      signingHash: keccak256(unsigned),
      signedTransaction: FAKE_SIGNED_TRANSACTION,
      transactionHash: FAKE_TRANSACTION_HASH,
      recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
    })
  });
}

function metadata(): BscTestnetPtaWbnbPoolGeneration10JournalMetadata {
  return Object.freeze({
    schemaVersion: 11,
    generation: 10,
    attemptId: bytes32("7"),
    releaseTree: "2".repeat(40),
    policyDigest: bytes32("8"),
    reviewedSubjectSha256: bytes32("9"),
    predecessorBundleDigest: bytes32("a"),
    predecessorSignedCommitSha256:
      "0x07766be2bd9e7b75cb6ed4a6078a6966e995d45c166f013c2ae0cffacf5f8b56",
    newSignatureAuthorized: false,
    maximumAdditionalSignatures: "0",
    maximumSends: "1",
    broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity"
  });
}

describe("generation-10 append-only existing-signature journal", () => {
  it("mints a volatile send token only for this process's exact new durable start", async () => {
    const files = new Map<string, string>();
    const cap = capability();
    const journal = await createBscTestnetPtaWbnbPoolGeneration10JournalForInternalUse(
      Object.freeze({
        now: () => new Date(NOW),
        listNames: async () => Object.freeze([...files.keys()].sort()),
        readBounded: async (name: string) => files.get(name) ?? null,
        createExclusive: async (name: string, content: string) => {
          if (files.has(name)) return "exists" as const;
          files.set(name, content);
          return "created" as const;
        },
        assertSecure: async () => true
      }),
      cap,
      metadata()
    );
    const base = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
      cap,
      new Date(NOW)
    );
    if (base === null) throw new Error("fixture invalid");
    const start = Object.freeze({
      schemaVersion: base.schemaVersion,
      operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
      operationKey: base.operationKey,
      claimId: base.claimId,
      envelopeHash: base.envelopeHash,
      releaseCommit: base.releaseCommit,
      runtimeManifestSha256: base.runtimeManifestSha256,
      reviewerApprovalDigest: base.reviewerApprovalDigest,
      ownerAuthorizationDigest: base.ownerAuthorizationDigest,
      recovery: base.recovery,
      signingHash: base.signingHash,
      transactionHash: base.transactionHash,
      signedTransactionKeccak256: base.signedTransactionKeccak256,
      submissionStartedDigest: base.submissionStartedDigest
    }) satisfies BscTestnetPtaWbnbPoolSubmissionStartedRequest;
    expect(await journal.commitSubmissionStarted(start)).toMatchObject({
      status: "started_by_this_call",
      transactionHash: FAKE_TRANSACTION_HASH
    });
    expect(journal.consumeCreatedStartToken(FAKE_TRANSACTION_HASH)).toBe(true);
    expect(journal.consumeCreatedStartToken(FAKE_TRANSACTION_HASH)).toBe(false);
    expect(await journal.commitSubmissionStarted(start)).toMatchObject({
      status: "already_started"
    });
    expect(journal.consumeCreatedStartToken(FAKE_TRANSACTION_HASH)).toBe(false);
    expect(await journal.readRecoveryState()).toMatchObject({
      state: "submission_started",
      journalEvidenceOnly: true,
      sendingAuthorizedByJournal: false
    });
    expect([...files.values()].join("\n")).not.toContain(FAKE_SIGNED_TRANSACTION);

    const terminal = Object.freeze({
      ...start,
      operation: BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
      outcome: "confirmed" as const,
      reconciliationDigest: bytes32("b")
    }) satisfies BscTestnetPtaWbnbPoolTerminalReconciliationRequest;
    expect(await journal.commitTerminalReconciliation(terminal)).toMatchObject({
      status: "confirmed",
      reconciliationDigest: bytes32("b")
    });
    expect(await journal.readRecoveryState()).toMatchObject({ state: "confirmed" });
  });

  it("fails closed when the exclusive start append outcome is unknown", async () => {
    const cap = capability();
    const journal = await createBscTestnetPtaWbnbPoolGeneration10JournalForInternalUse(
      Object.freeze({
        now: () => new Date(NOW),
        listNames: async () => Object.freeze([]),
        readBounded: async () => null,
        createExclusive: async () => {
          throw new Error("ambiguous");
        },
        assertSecure: async () => true
      }),
      cap,
      metadata()
    );
    const base = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
      cap,
      new Date(NOW)
    );
    if (base === null) throw new Error("fixture invalid");
    const request = Object.freeze({
      schemaVersion: base.schemaVersion,
      operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
      operationKey: base.operationKey,
      claimId: base.claimId,
      envelopeHash: base.envelopeHash,
      releaseCommit: base.releaseCommit,
      runtimeManifestSha256: base.runtimeManifestSha256,
      reviewerApprovalDigest: base.reviewerApprovalDigest,
      ownerAuthorizationDigest: base.ownerAuthorizationDigest,
      recovery: base.recovery,
      signingHash: base.signingHash,
      transactionHash: base.transactionHash,
      signedTransactionKeccak256: base.signedTransactionKeccak256,
      submissionStartedDigest: base.submissionStartedDigest
    }) satisfies BscTestnetPtaWbnbPoolSubmissionStartedRequest;
    await expect(journal.commitSubmissionStarted(request)).rejects.toThrow(
      "GENERATION_10_SUBMISSION_START_OUTCOME_UNKNOWN"
    );
    expect(journal.consumeCreatedStartToken(FAKE_TRANSACTION_HASH)).toBe(false);
    expect(await journal.readRecoveryState()).toMatchObject({ state: "unknown_outcome" });
  });
});
