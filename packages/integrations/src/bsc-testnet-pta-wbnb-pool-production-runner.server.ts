import "server-only";

import type { Hex } from "viem";

import { prepareBscTestnetPtaWbnbPoolInitializationEnvelope } from "./bsc-testnet-pta-wbnb-pool-coordinator.server";
import {
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse,
  type BscTestnetPtaWbnbPoolExistingLocalJournalResult
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import { describeBscTestnetPtaWbnbPoolOneShotBoundary } from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";
import { createBscTestnetPtaWbnbPoolPrivateBroadcasterForInternalUse } from "./bsc-testnet-pta-wbnb-pool-private-broadcaster.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_COMPOSITION_BOUNDARY,
  createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse,
  reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse,
  type BscTestnetPtaWbnbPoolProductionRunResult
} from "./bsc-testnet-pta-wbnb-pool-production-composition.server";
import { readBscTestnetPtaWbnbPoolReleaseReviewPolicyFromControllingTtyForInternalUse } from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";
import { createWindowsBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse } from "./bsc-testnet-pta-wbnb-pool-signing-worker";
import {
  openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse,
  type BscTestnetPtaWbnbPoolExistingSubmissionJournalResult
} from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";

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

function mixedRecoveryState(
  local: BscTestnetPtaWbnbPoolExistingLocalJournalResult,
  submission: BscTestnetPtaWbnbPoolExistingSubmissionJournalResult
): BscTestnetPtaWbnbPoolProductionRunResult {
  if (submission.status === "opened") {
    if (submission.state.state === "confirmed" || submission.state.state === "reverted") {
      return blocked(
        "TERMINAL_STATE_ALREADY_COMMITTED",
        "The exact transaction already has a durable terminal state.",
        submission.state.capability.transaction.transactionHash
      );
    }
    if (submission.state.state === "signed_committed") {
      return blocked(
        "RESTART_SIGNED_COMMIT_REQUIRES_NEW_AUTHORITY",
        "A durable signed transaction exists without submission_started; retained bytes do not recreate owner or one-send authority.",
        submission.state.capability.transaction.transactionHash
      );
    }
  }
  if (local.status === "opened" && local.state.status === "signed_committed") {
    return blocked(
      "RESTART_SIGNED_COMMIT_REQUIRES_NEW_AUTHORITY",
      "A durable signed transaction exists without a matching durable submission start; retained bytes do not recreate one-send authority.",
      local.state.transactionHash
    );
  }
  return blocked(
    "RESTART_BINDING_UNKNOWN",
    "Only one recovery journal is present or the retained signing/submission states do not form one exact recoverable transaction."
  );
}

/**
 * Fixed production root. Recovery is the first operation: both fixed LocalAppData journals are
 * opened read-only before release review, TTY input, public RPC, custody, signing, or broadcasting.
 * A fresh run exists only when both opens independently attest absence.
 */
export async function runBscTestnetPtaWbnbPoolProductionOnceFromStdin(): Promise<BscTestnetPtaWbnbPoolProductionRunResult> {
  let localRecovery: BscTestnetPtaWbnbPoolExistingLocalJournalResult;
  let submissionRecovery: BscTestnetPtaWbnbPoolExistingSubmissionJournalResult;
  try {
    [localRecovery, submissionRecovery] = await Promise.all([
      openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse(),
      openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse()
    ]);
  } catch {
    return blocked(
      "RECOVERY_PROBE_FAILED",
      "The fixed durable journals could not be opened read-only; no release, TTY, custody, signer, or RPC action was attempted."
    );
  }
  if (localRecovery.status === "blocked" || submissionRecovery.status === "blocked") {
    return blocked(
      "RECOVERY_JOURNAL_INVALID",
      "A fixed durable journal path, ACL, file identity, or retained sequence failed strict read-only recovery validation."
    );
  }
  if (localRecovery.status === "opened" && submissionRecovery.status === "opened") {
    try {
      const recovered = await reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
        localRecovery.journal,
        submissionRecovery.journal
      );
      if (recovered.status === "handled") return recovered.result;
      return blocked(
        "RECOVERY_STATE_CHANGED",
        "Previously present durable recovery state changed to empty during the read-only recovery pass."
      );
    } catch {
      return blocked(
        "RECOVERY_OUTCOME_UNKNOWN",
        "Read-only recovery could not establish an exact result; signing and broadcasting remain forbidden."
      );
    }
  }
  if (localRecovery.status !== "absent" || submissionRecovery.status !== "absent") {
    return mixedRecoveryState(localRecovery, submissionRecovery);
  }

  let preAuthorizationBridge: Awaited<
    ReturnType<typeof createWindowsBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse>
  >;
  try {
    preAuthorizationBridge =
      await createWindowsBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse();
  } catch {
    return blocked(
      "RELEASE_IDENTITY_UNAVAILABLE",
      "The exact clean published release identity could not be established."
    );
  }

  let policyAdmission: Awaited<
    ReturnType<typeof readBscTestnetPtaWbnbPoolReleaseReviewPolicyFromControllingTtyForInternalUse>
  >;
  try {
    policyAdmission =
      await readBscTestnetPtaWbnbPoolReleaseReviewPolicyFromControllingTtyForInternalUse(
        preAuthorizationBridge.releaseIdentity
      );
  } catch {
    return blocked(
      "RELEASE_POLICY_ADMISSION_FAILED",
      "The nonce-bound controlling-TTY release-policy admission failed closed."
    );
  }
  if (policyAdmission.status !== "ready") {
    return blocked(policyAdmission.issue.code, policyAdmission.issue.message);
  }

  let prepared: Awaited<ReturnType<typeof prepareBscTestnetPtaWbnbPoolInitializationEnvelope>>;
  try {
    prepared = await prepareBscTestnetPtaWbnbPoolInitializationEnvelope();
  } catch {
    return blocked(
      "COORDINATOR_RPC_FAILED",
      "The fixed read-only BSC testnet coordinator failed to produce a fresh envelope."
    );
  }
  if (prepared.status !== "observed") {
    return blocked(`COORDINATOR_${prepared.reason.toUpperCase()}`, prepared.message);
  }
  let descriptor: ReturnType<typeof describeBscTestnetPtaWbnbPoolOneShotBoundary>;
  try {
    descriptor = describeBscTestnetPtaWbnbPoolOneShotBoundary(prepared.envelope, () => new Date());
  } catch {
    return blocked(
      "FRESH_ENVELOPE_INVALID",
      "The fixed read-only coordinator envelope could not be described safely."
    );
  }
  if (descriptor.status !== "prepared_non_authorizing") {
    return blocked(
      "FRESH_ENVELOPE_INVALID",
      "The fixed read-only coordinator envelope was invalid or expired before policy instantiation."
    );
  }
  let runtimeInstantiation: ReturnType<typeof policyAdmission.realm.instantiate>;
  try {
    runtimeInstantiation = policyAdmission.realm.instantiate(
      Object.freeze({
        envelopeHash: descriptor.envelopeHash,
        expiresAt: descriptor.envelopeExpiresAt
      })
    );
  } catch {
    runtimeInstantiation = null;
  }
  if (runtimeInstantiation === null) {
    return blocked(
      "RUNTIME_REVIEW_INSTANTIATION_FAILED",
      "The reviewed release policy could not be privately instantiated for the exact fresh envelope."
    );
  }

  let ceremony: Awaited<ReturnType<typeof preAuthorizationBridge.conductOwnerCeremony>>;
  try {
    ceremony = await preAuthorizationBridge.conductOwnerCeremony(descriptor, runtimeInstantiation);
  } catch {
    return blocked(
      "OWNER_CEREMONY_FAILED",
      "The exact bounded controlling-TTY owner ceremony failed closed before custody activation."
    );
  }
  if (ceremony.status !== "confirmed") {
    return blocked(ceremony.issue.code, ceremony.issue.message);
  }
  let activation: Awaited<ReturnType<typeof preAuthorizationBridge.activateAfterCeremony>>;
  try {
    activation = await preAuthorizationBridge.activateAfterCeremony(descriptor, ceremony.command);
  } catch {
    return blocked(
      "NATIVE_ACTIVATION_FAILED",
      "The one-attempt post-ceremony custody/journal activation failed closed."
    );
  }
  if (activation.status !== "activated") {
    return blocked(activation.issue.code, activation.issue.message);
  }

  try {
    const broadcastBundle = await createBscTestnetPtaWbnbPoolPrivateBroadcasterForInternalUse(
      activation.bridge
    );
    return createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(
      Object.freeze({
        now: () => new Date(),
        intent: activation.bridge.intent,
        executionCapability: activation.bridge.executionCapability,
        authenticateAuthorizedIntent: activation.bridge.authenticateAuthorizedIntent,
        signingJournal: activation.bridge.signingJournal,
        submissionJournal: broadcastBundle.submissionJournal,
        issueWorker: activation.bridge.issueWorker,
        broadcaster: broadcastBundle.broadcaster
      })
    ).runOnce(prepared.envelope);
  } catch {
    return blocked(
      "POST_OWNER_ACTIVATION_FAILED",
      "Post-confirmation native activation could not construct the fixed journal/broadcaster composition; no automatic retry is allowed."
    );
  }
}
