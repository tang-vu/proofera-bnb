import "server-only";

import type { Hex } from "viem";

import { prepareBscTestnetPtaWbnbPoolInitializationEnvelope } from "./bsc-testnet-pta-wbnb-pool-coordinator.server";
import {
  openExistingWindowsBscTestnetPtaWbnbPoolLegacyLocalJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolGeneration2LocalJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolGeneration3LocalJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolGeneration4LocalJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolGeneration5LocalJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolGeneration6LocalJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolPredecessorLocalJournalForRecoveryForInternalUse,
  type BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult,
  type BscTestnetPtaWbnbPoolExistingLocalJournalResult,
  type BscTestnetPtaWbnbPoolExistingPredecessorLocalJournalResult
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import { describeBscTestnetPtaWbnbPoolOneShotBoundary } from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_FENCE_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import { createBscTestnetPtaWbnbPoolPrivateBroadcasterForInternalUse } from "./bsc-testnet-pta-wbnb-pool-private-broadcaster.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_COMPOSITION_BOUNDARY,
  createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse,
  reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse,
  type BscTestnetPtaWbnbPoolProductionRunResult
} from "./bsc-testnet-pta-wbnb-pool-production-composition.server";
import {
  readBscTestnetPtaWbnbPoolReleaseReviewPolicyFromControllingTtyForInternalUse,
  type BscTestnetPtaWbnbPoolPredecessorTerminalBinding
} from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";
import { createWindowsBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse } from "./bsc-testnet-pta-wbnb-pool-signing-worker";
import {
  openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationForInternalUse,
  probeWindowsBscTestnetPtaWbnbPoolGeneration3SubmissionJournalForInternalUse,
  probeWindowsBscTestnetPtaWbnbPoolGeneration4SubmissionJournalForInternalUse,
  probeWindowsBscTestnetPtaWbnbPoolGeneration5SubmissionJournalForInternalUse,
  probeWindowsBscTestnetPtaWbnbPoolGeneration6SubmissionJournalForInternalUse,
  probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalForInternalUse,
  type BscTestnetPtaWbnbPoolGeneration3SubmissionJournalProbeResult,
  type BscTestnetPtaWbnbPoolGeneration4SubmissionJournalProbeResult,
  type BscTestnetPtaWbnbPoolGeneration5SubmissionJournalProbeResult,
  type BscTestnetPtaWbnbPoolGeneration6SubmissionJournalProbeResult,
  type BscTestnetPtaWbnbPoolPredecessorSubmissionJournalProbeResult,
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

type DurableRecoverySnapshot = Readonly<{
  ancestor: BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult;
  generation2: BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult;
  generation3: BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult;
  generation4: BscTestnetPtaWbnbPoolExistingLocalJournalResult;
  generation5: BscTestnetPtaWbnbPoolExistingLocalJournalResult;
  generation6: BscTestnetPtaWbnbPoolExistingLocalJournalResult;
  predecessor: BscTestnetPtaWbnbPoolExistingPredecessorLocalJournalResult;
  active: BscTestnetPtaWbnbPoolExistingLocalJournalResult;
  generation2Submission: BscTestnetPtaWbnbPoolPredecessorSubmissionJournalProbeResult;
  generation3Submission: BscTestnetPtaWbnbPoolGeneration3SubmissionJournalProbeResult;
  generation4Submission: BscTestnetPtaWbnbPoolGeneration4SubmissionJournalProbeResult;
  generation5Submission: BscTestnetPtaWbnbPoolGeneration5SubmissionJournalProbeResult;
  predecessorSubmission: BscTestnetPtaWbnbPoolGeneration6SubmissionJournalProbeResult;
  submission: BscTestnetPtaWbnbPoolExistingSubmissionJournalResult;
}>;

async function probeAllDurableRecoveryState(): Promise<DurableRecoverySnapshot> {
  const [
    ancestor,
    generation2,
    generation3,
    generation4,
    generation5,
    generation6,
    predecessor,
    active,
    generation2Submission,
    generation3Submission,
    generation4Submission,
    generation5Submission,
    predecessorSubmission,
    submission
  ] = await Promise.all([
    openExistingWindowsBscTestnetPtaWbnbPoolLegacyLocalJournalForRecoveryForInternalUse(),
    openExistingWindowsBscTestnetPtaWbnbPoolGeneration2LocalJournalForRecoveryForInternalUse(),
    openExistingWindowsBscTestnetPtaWbnbPoolGeneration3LocalJournalForRecoveryForInternalUse(),
    openExistingWindowsBscTestnetPtaWbnbPoolGeneration4LocalJournalForRecoveryForInternalUse(),
    openExistingWindowsBscTestnetPtaWbnbPoolGeneration5LocalJournalForRecoveryForInternalUse(),
    openExistingWindowsBscTestnetPtaWbnbPoolGeneration6LocalJournalForRecoveryForInternalUse(),
    openExistingWindowsBscTestnetPtaWbnbPoolPredecessorLocalJournalForRecoveryForInternalUse(),
    openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse(),
    probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalForInternalUse(),
    probeWindowsBscTestnetPtaWbnbPoolGeneration3SubmissionJournalForInternalUse(),
    probeWindowsBscTestnetPtaWbnbPoolGeneration4SubmissionJournalForInternalUse(),
    probeWindowsBscTestnetPtaWbnbPoolGeneration5SubmissionJournalForInternalUse(),
    probeWindowsBscTestnetPtaWbnbPoolGeneration6SubmissionJournalForInternalUse(),
    openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse()
  ]);
  return Object.freeze({
    ancestor,
    generation2,
    generation3,
    generation4,
    generation5,
    generation6,
    predecessor,
    active,
    generation2Submission,
    generation3Submission,
    generation4Submission,
    generation5Submission,
    predecessorSubmission,
    submission
  });
}

function exactAncestorFenceSha256(
  ancestor: BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult
): Hex | null {
  const fence = ancestor.status === "opened" ? ancestor.state.supersessionFence : null;
  return ancestor.status === "opened" &&
    ancestor.state.status === "superseded_before_worker" &&
    ancestor.state.generation === 1 &&
    fence !== null &&
    fence.status === "superseded_before_worker" &&
    fence.terminalCode === "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" &&
    fence.workerAuthorizationOutcome === "not_attempted" &&
    fence.workerStartOutcome === "not_attempted" &&
    fence.signatureOutcome === "not_attempted" &&
    fence.submissionOutcome === "not_attempted" &&
    fence.submissionJournalState === "exact_empty" &&
    fence.predecessorClaimRawSha256 === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256
    ? fence.predecessorFenceSha256
    : null;
}

function exactGeneration3Fence(
  predecessor: BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult,
  expectedAncestorFenceSha256: Hex
): Hex | null {
  const fence = predecessor.status === "opened" ? predecessor.state.supersessionFence : null;
  return predecessor.status === "opened" &&
    predecessor.state.status === "superseded_before_worker" &&
    predecessor.state.generation === 3 &&
    predecessor.state.predecessorFenceSha256 === expectedAncestorFenceSha256 &&
    fence !== null &&
    fence.status === "superseded_before_worker" &&
    fence.terminalCode === "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" &&
    fence.workerAuthorizationOutcome === "not_attempted" &&
    fence.workerStartOutcome === "not_attempted" &&
    fence.signatureOutcome === "not_attempted" &&
    fence.submissionOutcome === "not_attempted" &&
    fence.submissionJournalState === "exact_empty" &&
    fence.predecessorClaimRawSha256 === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256
    ? fence.predecessorFenceSha256
    : null;
}

function durableSnapshotBlocked(snapshot: DurableRecoverySnapshot): boolean {
  return (
    snapshot.ancestor.status === "blocked" ||
    snapshot.generation2.status === "blocked" ||
    snapshot.generation3.status === "blocked" ||
    snapshot.generation4.status === "blocked" ||
    snapshot.generation5.status === "blocked" ||
    snapshot.generation6.status === "blocked" ||
    snapshot.predecessor.status === "blocked" ||
    snapshot.active.status === "blocked" ||
    snapshot.generation2Submission.status === "blocked" ||
    snapshot.generation3Submission.status === "blocked" ||
    snapshot.generation4Submission.status === "blocked" ||
    snapshot.generation5Submission.status === "blocked" ||
    snapshot.predecessorSubmission.status === "blocked" ||
    snapshot.submission.status === "blocked"
  );
}

function exactEmptyActiveAndSubmission(snapshot: DurableRecoverySnapshot): boolean {
  return (
    snapshot.active.status === "absent" &&
    snapshot.generation2Submission.status === "ready" &&
    snapshot.generation2Submission.presence !== "present" &&
    snapshot.generation2Submission.files.length === 0 &&
    snapshot.generation3Submission.status === "ready" &&
    snapshot.generation3Submission.presence === "empty" &&
    snapshot.generation3Submission.files.length === 0 &&
    snapshot.generation4Submission.status === "ready" &&
    snapshot.generation4Submission.presence !== "present" &&
    snapshot.generation4Submission.files.length === 0 &&
    snapshot.generation5Submission.status === "ready" &&
    snapshot.generation5Submission.presence !== "present" &&
    snapshot.generation5Submission.files.length === 0 &&
    snapshot.predecessorSubmission.status === "ready" &&
    snapshot.predecessorSubmission.presence !== "present" &&
    snapshot.predecessorSubmission.files.length === 0 &&
    snapshot.submission.status === "absent"
  );
}

function exactGeneration2Fence(
  generation2: BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult,
  expectedAncestorFenceSha256: Hex
): Hex | null {
  const fence = generation2.status === "opened" ? generation2.state.supersessionFence : null;
  return generation2.status === "opened" &&
    generation2.state.status === "superseded_before_worker" &&
    generation2.state.generation === 2 &&
    generation2.state.predecessorFenceSha256 === expectedAncestorFenceSha256 &&
    fence !== null &&
    fence.predecessorClaimRawSha256 === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256 &&
    fence.status === "superseded_before_worker" &&
    fence.terminalCode === "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" &&
    fence.workerAuthorizationOutcome === "not_attempted" &&
    fence.workerStartOutcome === "not_attempted" &&
    fence.signatureOutcome === "not_attempted" &&
    fence.submissionOutcome === "not_attempted" &&
    fence.submissionJournalState === "exact_empty"
    ? fence.predecessorFenceSha256
    : null;
}

function exactChainGeneration3Fence(snapshot: DurableRecoverySnapshot): Hex | null {
  const ancestorFenceSha256 = exactAncestorFenceSha256(snapshot.ancestor);
  const generation2FenceSha256 =
    ancestorFenceSha256 === null
      ? null
      : exactGeneration2Fence(snapshot.generation2, ancestorFenceSha256);
  return generation2FenceSha256 === null
    ? null
    : exactGeneration3Fence(snapshot.generation3, generation2FenceSha256);
}

async function exactCombinedPredecessorTerminal(
  snapshot: DurableRecoverySnapshot,
  requireFreshActiveState = true
): Promise<BscTestnetPtaWbnbPoolPredecessorTerminalBinding | null> {
  if (
    durableSnapshotBlocked(snapshot) ||
    (requireFreshActiveState && !exactEmptyActiveAndSubmission(snapshot)) ||
    snapshot.generation2Submission.status !== "ready" ||
    snapshot.generation2Submission.presence === "present" ||
    snapshot.generation2Submission.files.length !== 0 ||
    snapshot.generation3Submission.status !== "ready" ||
    snapshot.generation3Submission.presence !== "empty" ||
    snapshot.generation3Submission.files.length !== 0 ||
    snapshot.generation4.status !== "opened" ||
    snapshot.generation4.state.status !== "failed_before_worker" ||
    snapshot.generation4.state.generation !== 4 ||
    snapshot.generation4.state.predecessorFenceSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_FENCE_SHA256 ||
    snapshot.generation5.status !== "opened" ||
    snapshot.generation5.state.status !== "failed_before_worker" ||
    snapshot.generation5.state.generation !== 5 ||
    snapshot.generation5.state.predecessorTerminalRawSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256 ||
    snapshot.generation4Submission.status !== "ready" ||
    snapshot.generation4Submission.presence === "present" ||
    snapshot.generation4Submission.files.length !== 0 ||
    snapshot.generation6.status !== "opened" ||
    snapshot.generation6.state.status !== "failed_before_worker" ||
    snapshot.generation6.state.generation !== 6 ||
    snapshot.generation6.state.predecessorTerminalRawSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256 ||
    snapshot.generation5Submission.status !== "ready" ||
    snapshot.generation5Submission.presence === "present" ||
    snapshot.generation5Submission.files.length !== 0 ||
    snapshot.predecessor.status !== "opened" ||
    snapshot.predecessorSubmission.status !== "ready" ||
    snapshot.predecessorSubmission.presence === "present" ||
    snapshot.predecessorSubmission.files.length !== 0
  ) {
    return null;
  }
  const generation3Fence = exactChainGeneration3Fence(snapshot);
  if (
    generation3Fence === null ||
    generation3Fence !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_FENCE_SHA256
  )
    return null;
  const terminal = await snapshot.predecessor.journal.readExactTerminalRecoveryBinding();
  return terminal !== null &&
    terminal.inheritedPredecessorTerminalRawSha256 ===
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256 &&
    terminal.predecessorTerminalRawSha256 ===
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256
    ? Object.freeze({
        ...terminal,
        submissionOutcome: "not_attempted" as const,
        submissionJournalState: "exact_empty" as const
      })
    : null;
}

function samePredecessorTerminal(
  left: BscTestnetPtaWbnbPoolPredecessorTerminalBinding,
  right: BscTestnetPtaWbnbPoolPredecessorTerminalBinding
): boolean {
  return (
    left.status === right.status &&
    left.generation === right.generation &&
    left.predecessorClaimRawSha256 === right.predecessorClaimRawSha256 &&
    left.predecessorTerminalRawSha256 === right.predecessorTerminalRawSha256 &&
    left.predecessorEnvelopeHash === right.predecessorEnvelopeHash &&
    left.inheritedPredecessorTerminalRawSha256 === right.inheritedPredecessorTerminalRawSha256 &&
    left.predecessorAttemptId === right.predecessorAttemptId &&
    left.phase === right.phase &&
    left.issueCode === right.issueCode &&
    left.outcomeDigest === right.outcomeDigest &&
    left.workerAuthorizationOutcome === right.workerAuthorizationOutcome &&
    left.workerStartOutcome === right.workerStartOutcome &&
    left.signatureOutcome === right.signatureOutcome &&
    left.submissionOutcome === right.submissionOutcome &&
    left.submissionJournalState === right.submissionJournalState &&
    left.recordedAt === right.recordedAt
  );
}

/**
 * Fixed production root. All fourteen fixed LocalAppData namespaces are opened read-only before
 * release review, TTY input, custody, signing, or broadcasting. The exact immutable generation-7
 * failed-before-worker terminal and exact-empty predecessor submission namespace are required
 * before any fresh generation-8 owner authority can exist.
 */
export async function runBscTestnetPtaWbnbPoolProductionOnceFromStdin(): Promise<BscTestnetPtaWbnbPoolProductionRunResult> {
  let startup: DurableRecoverySnapshot;
  try {
    startup = await probeAllDurableRecoveryState();
  } catch {
    return blocked(
      "RECOVERY_PROBE_FAILED",
      "The fixed durable journals could not be opened read-only; no release, TTY, custody, signer, or RPC action was attempted."
    );
  }
  if (durableSnapshotBlocked(startup)) {
    return blocked(
      "RECOVERY_JOURNAL_INVALID",
      "A fixed durable journal path, ACL, file identity, or retained sequence failed strict read-only recovery validation."
    );
  }
  const startupPredecessor = await exactCombinedPredecessorTerminal(startup, false);
  if (startup.active.status === "opened" && startup.submission.status === "opened") {
    if (startupPredecessor === null) {
      return blocked(
        "PREDECESSOR_TERMINAL_INVALID",
        "Generation-8 durable state exists without the exact immutable generation-1 through generation-7 terminal lineage."
      );
    }
    try {
      const terminalRecovery =
        startup.submission.state.state === "submission_started" ||
        startup.submission.state.state === "unknown_outcome"
          ? await openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationForInternalUse(
              startup.submission.state
            )
          : null;
      if (terminalRecovery !== null && terminalRecovery.status !== "opened") {
        return blocked(
          "TERMINAL_RECOVERY_JOURNAL_INVALID",
          "The retained submission state changed before the terminal-only reconciliation handle was acquired."
        );
      }
      const recovered = await reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
        startup.active.journal,
        startup.submission.journal,
        terminalRecovery?.journal ?? null
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
  if (!exactEmptyActiveAndSubmission(startup)) {
    return mixedRecoveryState(startup.active, startup.submission);
  }
  if (startupPredecessor === null || startup.predecessor.status !== "opened") {
    return blocked(
      "PREDECESSOR_TERMINAL_MISSING",
      "The exact generation-1 through generation-3 fence chain, generation-4 through generation-7 failed-before-worker terminals, and exact-empty predecessor submission namespaces are required before recovery generation 8 can create fresh authority."
    );
  }
  const fixedPredecessorTerminal = startupPredecessor;
  const predecessorSigningJournal = startup.predecessor.journal;

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
  if (
    prepared.envelope.envelopeHash === fixedPredecessorTerminal.predecessorEnvelopeHash ||
    Date.parse(prepared.envelope.observation.observedAt) <=
      Date.parse(fixedPredecessorTerminal.recordedAt)
  ) {
    return blocked(
      "EXECUTION_ENVELOPE_NOT_AFTER_TERMINAL",
      "The fresh execution snapshot is not distinct from and strictly later than the retained generation-7 terminal."
    );
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
        executionEnvelopeObservedAt: prepared.envelope.observation.observedAt,
        expiresAt: descriptor.envelopeExpiresAt,
        predecessorTerminal: fixedPredecessorTerminal
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
  let afterOwnerTty: DurableRecoverySnapshot;
  try {
    afterOwnerTty = await probeAllDurableRecoveryState();
  } catch {
    return blocked(
      "POST_OWNER_DURABLE_REREAD_FAILED",
      "The fourteen durable namespaces could not be reread after owner confirmation."
    );
  }
  const afterOwnerTerminal = await exactCombinedPredecessorTerminal(afterOwnerTty);
  if (
    afterOwnerTerminal === null ||
    !samePredecessorTerminal(afterOwnerTerminal, fixedPredecessorTerminal)
  ) {
    return blocked(
      "POST_OWNER_DURABLE_STATE_CHANGED",
      "The predecessor terminal or active/submission emptiness changed after owner confirmation; activation is forbidden."
    );
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
    const afterActivation = await probeAllDurableRecoveryState();
    const afterActivationTerminal = await exactCombinedPredecessorTerminal(afterActivation);
    if (
      afterActivationTerminal === null ||
      !samePredecessorTerminal(afterActivationTerminal, fixedPredecessorTerminal)
    ) {
      return blocked(
        "POST_ACTIVATION_DURABLE_STATE_CHANGED",
        "The predecessor terminal or empty active/submission state changed during native activation."
      );
    }
    const broadcastBundle = await createBscTestnetPtaWbnbPoolPrivateBroadcasterForInternalUse(
      activation.bridge
    );
    const beforeComposition = await probeAllDurableRecoveryState();
    const beforeCompositionTerminal = await exactCombinedPredecessorTerminal(beforeComposition);
    if (
      beforeCompositionTerminal === null ||
      !samePredecessorTerminal(beforeCompositionTerminal, fixedPredecessorTerminal)
    ) {
      return blocked(
        "PRE_COMPOSITION_DURABLE_STATE_CHANGED",
        "The predecessor terminal or empty active/submission state changed before the generation-8 claim."
      );
    }
    return createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(
      Object.freeze({
        now: () => new Date(),
        intent: activation.bridge.intent,
        executionCapability: activation.bridge.executionCapability,
        authenticateAuthorizedIntent: activation.bridge.authenticateAuthorizedIntent,
        predecessorSigningJournal,
        predecessorTerminal: fixedPredecessorTerminal,
        probePredecessorSubmission:
          probeWindowsBscTestnetPtaWbnbPoolGeneration6SubmissionJournalForInternalUse,
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
