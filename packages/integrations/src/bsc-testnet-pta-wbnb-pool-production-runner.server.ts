import "server-only";

import type { Hex } from "viem";

import { prepareBscTestnetPtaWbnbPoolInitializationEnvelope } from "./bsc-testnet-pta-wbnb-pool-coordinator.server";
import {
  openExistingWindowsBscTestnetPtaWbnbPoolLegacyLocalJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolGeneration2LocalJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolPredecessorLocalJournalForRecoveryForInternalUse,
  type BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult,
  type BscTestnetPtaWbnbPoolExistingLocalJournalResult,
  type BscTestnetPtaWbnbPoolExistingPredecessorLocalJournalResult
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import type { BscTestnetPtaWbnbPoolNoEffectProof } from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import { describeBscTestnetPtaWbnbPoolOneShotBoundary } from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY
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
  type BscTestnetPtaWbnbPoolPredecessorFenceBinding
} from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";
import { createWindowsBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse } from "./bsc-testnet-pta-wbnb-pool-signing-worker";
import {
  openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse,
  openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationForInternalUse,
  probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalForInternalUse,
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
  generation2: BscTestnetPtaWbnbPoolExistingPredecessorLocalJournalResult;
  predecessor: BscTestnetPtaWbnbPoolExistingPredecessorLocalJournalResult;
  active: BscTestnetPtaWbnbPoolExistingLocalJournalResult;
  predecessorSubmission: BscTestnetPtaWbnbPoolPredecessorSubmissionJournalProbeResult;
  submission: BscTestnetPtaWbnbPoolExistingSubmissionJournalResult;
}>;

type ObservedPreparation = Extract<
  Awaited<ReturnType<typeof prepareBscTestnetPtaWbnbPoolInitializationEnvelope>>,
  Readonly<{ status: "observed" }>
>;

async function probeAllDurableRecoveryState(): Promise<DurableRecoverySnapshot> {
  const [ancestor, generation2, predecessor, active, predecessorSubmission, submission] =
    await Promise.all([
      openExistingWindowsBscTestnetPtaWbnbPoolLegacyLocalJournalForRecoveryForInternalUse(),
      openExistingWindowsBscTestnetPtaWbnbPoolGeneration2LocalJournalForRecoveryForInternalUse(),
      openExistingWindowsBscTestnetPtaWbnbPoolPredecessorLocalJournalForRecoveryForInternalUse(),
      openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse(),
      probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalForInternalUse(),
      openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForRecoveryForInternalUse()
    ]);
  return Object.freeze({
    ancestor,
    generation2,
    predecessor,
    active,
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

function exactAncestorFence(
  ancestor: BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult
): boolean {
  return exactAncestorFenceSha256(ancestor) !== null;
}

function exactPredecessorFence(
  predecessor: BscTestnetPtaWbnbPoolExistingPredecessorLocalJournalResult,
  expectedAncestorFenceSha256: Hex
): BscTestnetPtaWbnbPoolPredecessorFenceBinding | null {
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
    ? Object.freeze({
        status: fence.status,
        terminalCode: fence.terminalCode,
        workerAuthorizationOutcome: fence.workerAuthorizationOutcome,
        workerStartOutcome: fence.workerStartOutcome,
        signatureOutcome: fence.signatureOutcome,
        submissionOutcome: fence.submissionOutcome,
        submissionJournalState: fence.submissionJournalState,
        fenceRecordedAt: fence.fenceRecordedAt,
        predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
        noEffectProofDigest: fence.noEffectProofDigest,
        noEffectEnvelopeHash: fence.noEffectEnvelopeHash,
        noEffectObservedAt: fence.noEffectObservedAt,
        predecessorFenceSha256: fence.predecessorFenceSha256
      })
    : null;
}

function samePredecessorFence(
  left: BscTestnetPtaWbnbPoolPredecessorFenceBinding,
  right: BscTestnetPtaWbnbPoolPredecessorFenceBinding
): boolean {
  return (
    left.status === right.status &&
    left.terminalCode === right.terminalCode &&
    left.workerAuthorizationOutcome === right.workerAuthorizationOutcome &&
    left.workerStartOutcome === right.workerStartOutcome &&
    left.signatureOutcome === right.signatureOutcome &&
    left.submissionOutcome === right.submissionOutcome &&
    left.submissionJournalState === right.submissionJournalState &&
    left.fenceRecordedAt === right.fenceRecordedAt &&
    left.predecessorClaimRawSha256 === right.predecessorClaimRawSha256 &&
    left.noEffectProofDigest === right.noEffectProofDigest &&
    left.noEffectEnvelopeHash === right.noEffectEnvelopeHash &&
    left.noEffectObservedAt === right.noEffectObservedAt &&
    left.predecessorFenceSha256 === right.predecessorFenceSha256
  );
}

function noEffectProofFromObservedPreparation(
  prepared: ObservedPreparation
): BscTestnetPtaWbnbPoolNoEffectProof {
  const observation = prepared.envelope.observation;
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: "exact_fixed_dual_rpc_no_onchain_effect_after_claim_v1" as const,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: prepared.envelope.envelopeHash,
    observedAt: observation.observedAt,
    finalizedBlockNumber: observation.finalizedBlockNumber,
    finalizedBlockHash: observation.finalizedBlockHash,
    finalizedBlockTimestamp: observation.finalizedBlockTimestamp,
    latestNonce: observation.latestNonce,
    pendingNonce: observation.pendingNonce,
    pendingPool: observation.pendingPool,
    candidateCode: observation.candidateCode,
    candidateNonce: observation.candidateNonce,
    providerAgreementVerified: observation.providerAgreementVerified,
    allRuntimeIdentitiesVerified: observation.allRuntimeIdentitiesVerified,
    allEip1967SlotsZero: observation.allEip1967SlotsZero,
    allProtocolBindingsVerified: observation.allProtocolBindingsVerified,
    feeTierVerified: observation.feeTierVerified,
    simulationReturnPool: observation.simulationReturnPool,
    submissionJournalPresence: "absent" as const
  });
}

function durableSnapshotBlocked(snapshot: DurableRecoverySnapshot): boolean {
  return (
    snapshot.ancestor.status === "blocked" ||
    snapshot.generation2.status === "blocked" ||
    snapshot.predecessor.status === "blocked" ||
    snapshot.active.status === "blocked" ||
    snapshot.predecessorSubmission.status === "blocked" ||
    snapshot.submission.status === "blocked"
  );
}

function exactEmptyActiveAndSubmission(snapshot: DurableRecoverySnapshot): boolean {
  return (
    snapshot.active.status === "absent" &&
    snapshot.predecessorSubmission.status === "ready" &&
    snapshot.predecessorSubmission.presence !== "present" &&
    snapshot.predecessorSubmission.files.length === 0 &&
    snapshot.submission.status === "absent"
  );
}

function exactGeneration2Fence(
  generation2: BscTestnetPtaWbnbPoolExistingPredecessorLocalJournalResult,
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

function exactChainPredecessorFence(
  snapshot: DurableRecoverySnapshot
): BscTestnetPtaWbnbPoolPredecessorFenceBinding | null {
  const ancestorFenceSha256 = exactAncestorFenceSha256(snapshot.ancestor);
  const generation2FenceSha256 =
    ancestorFenceSha256 === null
      ? null
      : exactGeneration2Fence(snapshot.generation2, ancestorFenceSha256);
  return generation2FenceSha256 === null
    ? null
    : exactPredecessorFence(snapshot.predecessor, generation2FenceSha256);
}

function exactGeneration2Chain(snapshot: DurableRecoverySnapshot): boolean {
  const ancestorFenceSha256 = exactAncestorFenceSha256(snapshot.ancestor);
  return (
    ancestorFenceSha256 !== null &&
    exactGeneration2Fence(snapshot.generation2, ancestorFenceSha256) !== null
  );
}

function retainsExactFreshPrerequisites(
  snapshot: DurableRecoverySnapshot,
  expectedFence: BscTestnetPtaWbnbPoolPredecessorFenceBinding
): snapshot is DurableRecoverySnapshot &
  Readonly<{
    predecessor: Extract<
      BscTestnetPtaWbnbPoolExistingPredecessorLocalJournalResult,
      { status: "opened" }
    >;
  }> {
  const ancestorFenceSha256 = exactAncestorFenceSha256(snapshot.ancestor);
  const generation2FenceSha256 =
    ancestorFenceSha256 === null
      ? null
      : exactGeneration2Fence(snapshot.generation2, ancestorFenceSha256);
  const retained = exactChainPredecessorFence(snapshot);
  return (
    !durableSnapshotBlocked(snapshot) &&
    exactAncestorFence(snapshot.ancestor) &&
    generation2FenceSha256 !== null &&
    exactEmptyActiveAndSubmission(snapshot) &&
    snapshot.predecessor.status === "opened" &&
    retained !== null &&
    samePredecessorFence(retained, expectedFence)
  );
}

/**
 * Fixed production root. All six fixed LocalAppData namespaces are opened read-only before
 * release review, TTY input, custody, signing, or broadcasting. A claim-only predecessor may use
 * one invocation solely to append and reread its fence; a later invocation must obtain snapshot B
 * before any new owner authority can exist.
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
  if (startup.active.status === "opened" || startup.submission.status === "opened") {
    if (!exactAncestorFence(startup.ancestor) || exactChainPredecessorFence(startup) === null) {
      return blocked(
        "PREDECESSOR_FENCE_INVALID",
        "Generation-4 durable state exists without the exact immutable generation-1, generation-2, and generation-3 supersession chain."
      );
    }
  }
  if (startup.active.status === "opened" && startup.submission.status === "opened") {
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

  if (!exactGeneration2Chain(startup) || startup.predecessor.status !== "opened") {
    return blocked(
      "PREDECESSOR_CLAIM_MISSING",
      "The exact fenced generation-1 and generation-2 ancestors plus the generation-3 incident claim are required before recovery generation 4 can create fresh authority."
    );
  }

  let predecessorFence = exactChainPredecessorFence(startup);
  let noEffectEnvelopeHash: Hex | null = predecessorFence?.noEffectEnvelopeHash ?? null;
  let createdFenceThisInvocation = false;
  if (predecessorFence === null) {
    const candidate = await startup.predecessor.journal.readClaimOnlyRecoveryCandidate();
    if (candidate === null) {
      return blocked(
        "PREDECESSOR_NOT_EXACT_CLAIM_ONLY",
        "The predecessor journal is not the exact fixed claim-only incident state; supersession is permanently forbidden."
      );
    }

    let noEffectPreparation: Awaited<
      ReturnType<typeof prepareBscTestnetPtaWbnbPoolInitializationEnvelope>
    >;
    try {
      noEffectPreparation = await prepareBscTestnetPtaWbnbPoolInitializationEnvelope();
    } catch {
      return blocked(
        "NO_EFFECT_PROOF_RPC_FAILED",
        "The fixed dual-RPC no-effect snapshot A could not be established; no fence or authority was created."
      );
    }
    if (noEffectPreparation.status !== "observed") {
      return blocked(
        `NO_EFFECT_PROOF_${noEffectPreparation.reason.toUpperCase()}`,
        noEffectPreparation.message
      );
    }
    let noEffectDescriptor: ReturnType<typeof describeBscTestnetPtaWbnbPoolOneShotBoundary>;
    try {
      noEffectDescriptor = describeBscTestnetPtaWbnbPoolOneShotBoundary(
        noEffectPreparation.envelope,
        () => new Date()
      );
    } catch {
      return blocked(
        "NO_EFFECT_PROOF_ENVELOPE_INVALID",
        "Snapshot A failed exact envelope validation; no predecessor fence was attempted."
      );
    }
    if (noEffectDescriptor.status !== "prepared_non_authorizing") {
      return blocked(
        "NO_EFFECT_PROOF_ENVELOPE_INVALID",
        "Snapshot A failed exact envelope validation; no predecessor fence was attempted."
      );
    }
    const proof = noEffectProofFromObservedPreparation(noEffectPreparation);

    let immediatelyBeforeFence: DurableRecoverySnapshot;
    try {
      immediatelyBeforeFence = await probeAllDurableRecoveryState();
    } catch {
      return blocked(
        "PRE_FENCE_REREAD_FAILED",
        "Durable state could not be reread immediately before the append-only fence."
      );
    }
    const preFencePredecessor = immediatelyBeforeFence.predecessor;
    const rereadCandidate =
      preFencePredecessor.status === "opened"
        ? await preFencePredecessor.journal.readClaimOnlyRecoveryCandidate()
        : null;
    if (
      durableSnapshotBlocked(immediatelyBeforeFence) ||
      !exactGeneration2Chain(immediatelyBeforeFence) ||
      !exactEmptyActiveAndSubmission(immediatelyBeforeFence) ||
      preFencePredecessor.status !== "opened" ||
      rereadCandidate === null ||
      rereadCandidate.predecessorClaimRawSha256 !== candidate.predecessorClaimRawSha256 ||
      rereadCandidate.predecessorClaimRecordedAt !== candidate.predecessorClaimRecordedAt ||
      rereadCandidate.predecessorAuthorizationExpiresAt !==
        candidate.predecessorAuthorizationExpiresAt
    ) {
      return blocked(
        "PRE_FENCE_STATE_CHANGED",
        "The exact claim-only predecessor or exact-empty active/submission state changed before slot-2 O_EXCL."
      );
    }
    try {
      await preFencePredecessor.journal.fenceClaimBeforeWorker(
        Object.freeze({
          expectedPredecessorClaimRawSha256:
            BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
          proof
        })
      );
      createdFenceThisInvocation = true;
    } catch {
      return blocked(
        "PREDECESSOR_FENCE_RACE_OR_UNKNOWN",
        "The append-only predecessor fence did not win slot 2 with a known created outcome; recovery authority remains forbidden."
      );
    }
    noEffectEnvelopeHash = proof.envelopeHash;
  }

  let afterFence: DurableRecoverySnapshot;
  try {
    afterFence = await probeAllDurableRecoveryState();
  } catch {
    return blocked(
      "POST_FENCE_REREAD_FAILED",
      "The six durable namespaces could not be reread after the predecessor fence."
    );
  }
  const retainedFence = exactChainPredecessorFence(afterFence);
  if (
    durableSnapshotBlocked(afterFence) ||
    !exactAncestorFence(afterFence.ancestor) ||
    !exactEmptyActiveAndSubmission(afterFence) ||
    afterFence.predecessor.status !== "opened" ||
    retainedFence === null ||
    (predecessorFence !== null && !samePredecessorFence(retainedFence, predecessorFence)) ||
    (noEffectEnvelopeHash !== null && retainedFence.noEffectEnvelopeHash !== noEffectEnvelopeHash)
  ) {
    return blocked(
      "POST_FENCE_STATE_INVALID",
      "The exact immutable generation-3 fence plus empty generation-4 and old/new submission namespaces was not retained."
    );
  }
  predecessorFence = retainedFence;
  if (createdFenceThisInvocation) {
    return blocked(
      "PREDECESSOR_FENCE_RECORDED_RESTART_REQUIRED",
      "The exact predecessor fence was durably recorded and reread. Start a new invocation before snapshot B, policy, owner authority, custody, or generation-4 claim."
    );
  }
  const fixedPredecessorFence = predecessorFence;
  const legacySigningJournal = afterFence.predecessor.journal;

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
    prepared.envelope.envelopeHash === fixedPredecessorFence.noEffectEnvelopeHash ||
    Date.parse(prepared.envelope.observation.observedAt) <=
      Date.parse(fixedPredecessorFence.fenceRecordedAt)
  ) {
    return blocked(
      "EXECUTION_ENVELOPE_NOT_AFTER_FENCE",
      "Execution snapshot B is not distinct from and strictly later than the retained no-effect fence snapshot A."
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
        predecessorFence: fixedPredecessorFence
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
      "The six durable namespaces could not be reread after owner confirmation."
    );
  }
  if (!retainsExactFreshPrerequisites(afterOwnerTty, fixedPredecessorFence)) {
    return blocked(
      "POST_OWNER_DURABLE_STATE_CHANGED",
      "The predecessor fence or active/submission emptiness changed after owner confirmation; activation is forbidden."
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
    if (!retainsExactFreshPrerequisites(afterActivation, fixedPredecessorFence)) {
      return blocked(
        "POST_ACTIVATION_DURABLE_STATE_CHANGED",
        "The predecessor fence or empty active/submission state changed during native activation."
      );
    }
    const broadcastBundle = await createBscTestnetPtaWbnbPoolPrivateBroadcasterForInternalUse(
      activation.bridge
    );
    const beforeComposition = await probeAllDurableRecoveryState();
    if (!retainsExactFreshPrerequisites(beforeComposition, fixedPredecessorFence)) {
      return blocked(
        "PRE_COMPOSITION_DURABLE_STATE_CHANGED",
        "The predecessor fence or empty active/submission state changed before the generation-4 claim."
      );
    }
    return createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(
      Object.freeze({
        now: () => new Date(),
        intent: activation.bridge.intent,
        executionCapability: activation.bridge.executionCapability,
        authenticateAuthorizedIntent: activation.bridge.authenticateAuthorizedIntent,
        legacySigningJournal,
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
