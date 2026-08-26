import "server-only";

import { createHash } from "node:crypto";

import type { Hex } from "viem";

import { prepareBscTestnetPtaWbnbPoolInitializationEnvelope } from "./bsc-testnet-pta-wbnb-pool-coordinator.server";
import {
  authenticateBscTestnetPtaWbnbPoolGeneration10SubmissionCapabilityForInternalUse,
  conductBscTestnetPtaWbnbPoolGeneration10OwnerCeremonyForInternalUse,
  consumeBscTestnetPtaWbnbPoolGeneration10SendAuthorityForInternalUse,
  issueBscTestnetPtaWbnbPoolGeneration10SubmissionCapabilityForInternalUse
} from "./bsc-testnet-pta-wbnb-pool-generation-10-authority.server";
import {
  createWindowsBscTestnetPtaWbnbPoolGeneration10JournalForInternalUse,
  narrowBscTestnetPtaWbnbPoolGeneration10JournalForSubmissionForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolGeneration10JournalForRecoveryForInternalUse,
  type BscTestnetPtaWbnbPoolGeneration10JournalMetadata
} from "./bsc-testnet-pta-wbnb-pool-generation-10-journal.server";
import { readBscTestnetPtaWbnbPoolGeneration10PolicyFromControllingTtyForInternalUse } from "./bsc-testnet-pta-wbnb-pool-generation-10-policy.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
  inspectBscTestnetPtaWbnbPoolGeneration10PredecessorForInternalUse,
  type BscTestnetPtaWbnbPoolGeneration10PredecessorInspection
} from "./bsc-testnet-pta-wbnb-pool-generation-10-recovery";
import { inspectBscTestnetPtaWbnbPoolGeneration10ReleaseIdentityForInternalUse } from "./bsc-testnet-pta-wbnb-pool-generation-10-release.server";
import {
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse,
  probeWindowsBscTestnetPtaWbnbPoolGeneration9RecordHashesForInternalUse
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import { describeBscTestnetPtaWbnbPoolOneShotBoundary } from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_COMPOSITION_BOUNDARY,
  type BscTestnetPtaWbnbPoolProductionRunResult
} from "./bsc-testnet-pta-wbnb-pool-production-composition.server";
import {
  acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse,
  createBscTestnetPtaWbnbPoolGeneration10ExistingSignatureSenderForInternalUse,
  observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse
} from "./bsc-testnet-pta-wbnb-pool-production-rpc.server";
import { openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse } from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";
import {
  createBscTestnetPtaWbnbPoolReconciliationRecoveryCoreForInternalUse,
  createBscTestnetPtaWbnbPoolSubmissionCoreForInternalUse
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";

export type BscTestnetPtaWbnbPoolGeneration10DispatchResult =
  | Readonly<{ status: "not_applicable" }>
  | Readonly<{
      status: "handled";
      result: BscTestnetPtaWbnbPoolProductionRunResult;
    }>;

function blocked(
  code: string,
  message: string,
  transactionHash: Hex | null = null
): BscTestnetPtaWbnbPoolProductionRunResult {
  return Object.freeze({
    status: "blocked" as const,
    code,
    message,
    transactionHash,
    boundary: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_COMPOSITION_BOUNDARY
  });
}

async function inspectPredecessor(): Promise<
  Readonly<{
    hasGeneration9State: boolean;
    inspection: BscTestnetPtaWbnbPoolGeneration10PredecessorInspection;
  }>
> {
  const [local, submission, hashes] = await Promise.all([
    openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse(),
    openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse(),
    probeWindowsBscTestnetPtaWbnbPoolGeneration9RecordHashesForInternalUse()
  ]);
  const hasGeneration9State = local.status !== "absent" || submission.status !== "absent";
  return Object.freeze({
    hasGeneration9State,
    inspection: await inspectBscTestnetPtaWbnbPoolGeneration10PredecessorForInternalUse(
      local,
      submission,
      hashes
    )
  });
}

function samePredecessor(
  left: BscTestnetPtaWbnbPoolGeneration10PredecessorInspection,
  right: BscTestnetPtaWbnbPoolGeneration10PredecessorInspection
): boolean {
  return (
    left.status === "ready" &&
    right.status === "ready" &&
    left.binding.predecessorBundleDigest === right.binding.predecessorBundleDigest &&
    left.capability.transaction.signedTransaction === right.capability.transaction.signedTransaction
  );
}

function attemptId(input: object): Hex {
  return `0x${createHash("sha256")
    .update("proofera.bsc-testnet.pta-wbnb-pool.existing-signature-attempt.v10\0", "utf8")
    .update(JSON.stringify(input), "utf8")
    .digest("hex")}` as Hex;
}

export async function runBscTestnetPtaWbnbPoolGeneration10IfApplicableForInternalUse(): Promise<BscTestnetPtaWbnbPoolGeneration10DispatchResult> {
  let startup: Awaited<ReturnType<typeof inspectPredecessor>>;
  try {
    startup = await inspectPredecessor();
  } catch {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "GENERATION_10_PREDECESSOR_PROBE_FAILED",
        "The immutable generation-9 signed predecessor could not be probed safely."
      )
    });
  }
  if (!startup.hasGeneration9State) return Object.freeze({ status: "not_applicable" as const });
  if (startup.inspection.status !== "ready") {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(startup.inspection.issue.code, startup.inspection.issue.message)
    });
  }
  const predecessor = startup.inspection;
  let recovery: Awaited<
    ReturnType<
      typeof openExistingWindowsBscTestnetPtaWbnbPoolGeneration10JournalForRecoveryForInternalUse
    >
  >;
  try {
    recovery =
      await openExistingWindowsBscTestnetPtaWbnbPoolGeneration10JournalForRecoveryForInternalUse(
        predecessor.binding,
        predecessor.capability.transaction.signedTransaction
      );
  } catch {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "GENERATION_10_SUBMISSION_JOURNAL_INVALID",
        "The generation-10 recovery journal could not be opened.",
        BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH
      )
    });
  }
  if (recovery.status === "blocked") {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        recovery.issue.code,
        recovery.issue.message,
        BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH
      )
    });
  }
  if (recovery.status === "opened") {
    const core = createBscTestnetPtaWbnbPoolReconciliationRecoveryCoreForInternalUse(
      Object.freeze({
        now: () => new Date(),
        acquireRecoveryCapability: async () => recovery.state.capability,
        journal: recovery.terminalJournal,
        observeExactTransaction: observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse
      })
    );
    return Object.freeze({
      status: "handled" as const,
      result: await core.submitAndReconcileOnce()
    });
  }

  let release: Awaited<
    ReturnType<typeof inspectBscTestnetPtaWbnbPoolGeneration10ReleaseIdentityForInternalUse>
  >;
  try {
    release = await inspectBscTestnetPtaWbnbPoolGeneration10ReleaseIdentityForInternalUse();
  } catch {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "GENERATION_10_RELEASE_IDENTITY_UNAVAILABLE",
        "The exact clean published generation-10 release identity could not be established."
      )
    });
  }
  const policy = await readBscTestnetPtaWbnbPoolGeneration10PolicyFromControllingTtyForInternalUse(
    release,
    predecessor.binding
  );
  if (policy.status !== "ready") {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(policy.issue.code, policy.issue.message)
    });
  }
  let prepared: Awaited<ReturnType<typeof prepareBscTestnetPtaWbnbPoolInitializationEnvelope>>;
  try {
    prepared = await prepareBscTestnetPtaWbnbPoolInitializationEnvelope();
  } catch {
    return Object.freeze({
      status: "handled" as const,
      result: blocked("GENERATION_10_COORDINATOR_FAILED", "The fresh read-only envelope failed.")
    });
  }
  if (prepared.status !== "observed") {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(`GENERATION_10_${prepared.reason.toUpperCase()}`, prepared.message)
    });
  }
  const descriptor = describeBscTestnetPtaWbnbPoolOneShotBoundary(
    prepared.envelope,
    () => new Date()
  );
  if (descriptor.status !== "prepared_non_authorizing") {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "GENERATION_10_ENVELOPE_INVALID",
        "The fresh read-only envelope expired or was invalid before review instantiation."
      )
    });
  }
  const instantiation = policy.realm.instantiate(
    Object.freeze({
      envelopeHash: descriptor.envelopeHash,
      executionEnvelopeObservedAt: descriptor.envelopeObservedAt,
      expiresAt: descriptor.envelopeExpiresAt,
      predecessorBundleDigest: predecessor.binding.predecessorBundleDigest
    })
  );
  if (instantiation === null) {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "GENERATION_10_RUNTIME_REVIEW_INSTANTIATION_FAILED",
        "The reviewed generation-10 policy could not be instantiated for the fresh envelope."
      )
    });
  }
  const ceremony = await conductBscTestnetPtaWbnbPoolGeneration10OwnerCeremonyForInternalUse({
    instantiation,
    predecessor: predecessor.binding,
    release
  });
  if (ceremony.status !== "confirmed") {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(ceremony.issue.code, ceremony.issue.message)
    });
  }

  let afterOwner: Awaited<ReturnType<typeof inspectPredecessor>>;
  let afterOwnerRecovery: Awaited<
    ReturnType<
      typeof openExistingWindowsBscTestnetPtaWbnbPoolGeneration10JournalForRecoveryForInternalUse
    >
  >;
  try {
    afterOwner = await inspectPredecessor();
    afterOwnerRecovery =
      await openExistingWindowsBscTestnetPtaWbnbPoolGeneration10JournalForRecoveryForInternalUse(
        predecessor.binding,
        predecessor.capability.transaction.signedTransaction
      );
  } catch {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "GENERATION_10_STATE_CHANGED_AFTER_OWNER",
        "Durable state could not be reread after owner confirmation."
      )
    });
  }
  if (
    !samePredecessor(predecessor, afterOwner.inspection) ||
    afterOwnerRecovery.status !== "absent"
  ) {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "GENERATION_10_STATE_CHANGED_AFTER_OWNER",
        "The immutable predecessor or generation-10 journal changed after owner confirmation."
      )
    });
  }

  let preSubmission: Awaited<
    ReturnType<typeof acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse>
  >;
  try {
    preSubmission = await acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse(
      Object.freeze({
        transactionHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
        gasLimit: predecessor.binding.gasLimit,
        gasPriceWei: predecessor.binding.gasPriceWei
      })
    );
  } catch {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "GENERATION_10_PRE_SUBMISSION_RECHECK_FAILED",
        "Fresh official dual-RPC state did not permit the exact existing signature."
      )
    });
  }
  const capability = issueBscTestnetPtaWbnbPoolGeneration10SubmissionCapabilityForInternalUse({
    command: ceremony.command,
    predecessorCapability: predecessor.capability,
    preSubmission
  });
  if (capability === null) {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "GENERATION_10_AUTHORITY_EXPIRED",
        "Existing-signature authority expired or failed exact binding before durable start."
      )
    });
  }
  const metadata: BscTestnetPtaWbnbPoolGeneration10JournalMetadata = Object.freeze({
    schemaVersion: 11,
    generation: 10,
    attemptId: attemptId(
      Object.freeze({
        releaseCommit: release.releaseCommit,
        releaseTree: release.releaseTree,
        runtimeManifestSha256: release.runtimeManifest.runtimeManifestSha256,
        policyDigest: policy.policy.policyDigest,
        instantiationDigest: instantiation.instantiationDigest,
        predecessorBundleDigest: predecessor.binding.predecessorBundleDigest,
        ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
        transactionHash: capability.transaction.transactionHash
      })
    ),
    releaseTree: release.releaseTree,
    policyDigest: policy.policy.policyDigest,
    reviewedSubjectSha256: policy.policy.reviewedSubjectSha256,
    predecessorBundleDigest: predecessor.binding.predecessorBundleDigest,
    predecessorSignedCommitSha256:
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
    newSignatureAuthorized: false,
    maximumAdditionalSignatures: "0",
    maximumSends: "1",
    broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity"
  });
  try {
    const journal = await createWindowsBscTestnetPtaWbnbPoolGeneration10JournalForInternalUse(
      capability,
      metadata
    );
    const sender = createBscTestnetPtaWbnbPoolGeneration10ExistingSignatureSenderForInternalUse({
      capability,
      consumeOwnerAuthority: consumeBscTestnetPtaWbnbPoolGeneration10SendAuthorityForInternalUse,
      consumeDurableStartToken: (transactionHash: Hex) =>
        journal.consumeCreatedStartToken(transactionHash)
    });
    const core = createBscTestnetPtaWbnbPoolSubmissionCoreForInternalUse(
      Object.freeze({
        now: () => new Date(),
        acquireSubmissionCapability: async () => capability,
        authenticateSubmissionCapability:
          authenticateBscTestnetPtaWbnbPoolGeneration10SubmissionCapabilityForInternalUse,
        journal: narrowBscTestnetPtaWbnbPoolGeneration10JournalForSubmissionForInternalUse(journal),
        acquireTerminalPreSendRecheck:
          acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse,
        sendExactRawTransactionOnce: sender.sendExactRawTransactionOnce,
        observeExactTransaction: observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse
      })
    );
    return Object.freeze({
      status: "handled" as const,
      result: await core.submitAndReconcileOnce()
    });
  } catch {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "GENERATION_10_POST_OWNER_ACTIVATION_FAILED",
        "The append-only existing-signature journal or one-send composition failed closed."
      )
    });
  }
}
