import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { isProxy } from "node:util/types";

import { keccak256, type Hex } from "viem";

import { describeBscTestnetPtaWbnbPoolOneShotBoundary } from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_SCHEMA_VERSION,
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_SIGNED_READBACK_OPERATION,
  createBscTestnetPtaWbnbPoolOneShotSignerCoreForInternalUse,
  type BscTestnetPtaWbnbPoolDurableClaimRequest,
  type BscTestnetPtaWbnbPoolDurableSignedReadbackRequest,
  type BscTestnetPtaWbnbPoolPostClaimRecheckRequest
} from "./bsc-testnet-pta-wbnb-pool-one-shot-signer-core";
import {
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION,
  BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse,
  type BscTestnetPtaWbnbPoolAuthorizedSigningIntent,
  type BscTestnetPtaWbnbPoolRecoveryAttemptBinding,
  type BscTestnetPtaWbnbPoolSigningWorkerRequest
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import { createBscTestnetPtaWbnbPoolPostClaimRecheckerForInternalUse } from "./bsc-testnet-pta-wbnb-pool-post-claim-recheck.server";
import {
  acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse,
  createFixedOfficialBscTestnetPtaWbnbPoolPostClaimRpcClientsForInternalUse,
  observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse,
  type BscTestnetPtaWbnbPoolProductionPreSubmissionInput
} from "./bsc-testnet-pta-wbnb-pool-production-rpc.server";
import {
  deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256,
  deriveBscTestnetPtaWbnbPoolFailedBeforeWorkerOutcomeDigest,
  type BscTestnetPtaWbnbPoolGeneration4ClaimRequest,
  type BscTestnetPtaWbnbPoolFailedBeforeWorkerIssueCode,
  type BscTestnetPtaWbnbPoolLegacyLocalJournalRecoveryReader,
  type BscTestnetPtaWbnbPoolLocalJournal,
  type BscTestnetPtaWbnbPoolLocalJournalRecoveryReader,
  type BscTestnetPtaWbnbPoolLocalJournalState
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import { BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG } from "./bsc-testnet-pta-wbnb-pool-production-authority.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_BOUNDARY,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
  createBscTestnetPtaWbnbPoolSubmissionCoreForInternalUse,
  createBscTestnetPtaWbnbPoolReconciliationRecoveryCoreForInternalUse,
  deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse,
  type BscTestnetPtaWbnbPoolSubmissionCapability,
  type BscTestnetPtaWbnbPoolSubmissionResult,
  type BscTestnetPtaWbnbPoolTerminalReconciliationJournal
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V5_POLICY,
  type BscTestnetPtaWbnbPoolDurableSubmissionJournal,
  type BscTestnetPtaWbnbPoolSubmissionJournalRecoveryReader,
  type BscTestnetPtaWbnbPoolSubmissionRecoveryState
} from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";
import type { BscTestnetPtaWbnbPoolSigningWorker } from "./bsc-testnet-pta-wbnb-pool-signing-worker";
import type { BscTestnetPtaWbnbPoolPrivateBroadcaster } from "./bsc-testnet-pta-wbnb-pool-private-broadcaster.server";

export { BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG };

const BOUNDARY = Object.freeze({
  environment: "bsc-testnet" as const,
  chainId: "97" as const,
  operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  fixedOfficialDualRpc: true as const,
  windowsCurrentUserCustodyOnly: true as const,
  cleanPublishedReleaseRequired: true as const,
  exactExecutionFlagRequired: true as const,
  boundedCanonicalStdinRequired: true as const,
  chatIsAuthorization: false as const,
  ownerDesignatedReviewModel: true as const,
  cryptographicReviewerIdentityAvailable: false as const,
  ownerMustAcknowledgeReviewLimitation: true as const,
  separateExactOwnerSignatureAndSingleBroadcastAuthorizationRequired: true as const,
  oneSignatureMaximum: true as const,
  oneBroadcastMaximum: true as const,
  replacementAllowed: false as const,
  rebroadcastAfterAmbiguityAllowed: false as const,
  liquidityActionAuthorized: false as const,
  mainnetWritePossible: false as const
});

export const BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_COMPOSITION_BOUNDARY = BOUNDARY;

export interface BscTestnetPtaWbnbPoolFixedProductionPorts {
  readonly now: () => Date;
  /** Already minted only by the same-process post-ceremony native activation. */
  readonly intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
  readonly executionCapability: object;
  readonly authenticateAuthorizedIntent: (intent: unknown) => boolean;
  readonly legacySigningJournal: BscTestnetPtaWbnbPoolLegacyLocalJournalRecoveryReader;
  readonly signingJournal: BscTestnetPtaWbnbPoolLocalJournal;
  readonly submissionJournal: BscTestnetPtaWbnbPoolDurableSubmissionJournal;
  readonly issueWorker: (executionCapability: unknown) => BscTestnetPtaWbnbPoolSigningWorker;
  readonly broadcaster: BscTestnetPtaWbnbPoolPrivateBroadcaster;
}

export type BscTestnetPtaWbnbPoolProductionRunResult =
  | Readonly<{
      status: "blocked";
      code: string;
      message: string;
      transactionHash: Hex | null;
      boundary: typeof BOUNDARY;
    }>
  | BscTestnetPtaWbnbPoolSubmissionResult;

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
    boundary: BOUNDARY
  });
}

function exactBytes32(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/u.test(value);
}

function exactDate(clock: () => Date): Date | null {
  try {
    const value = Reflect.apply(clock, undefined, []);
    if (
      isProxy(value) ||
      !(value instanceof Date) ||
      Object.getPrototypeOf(value) !== Date.prototype ||
      Reflect.ownKeys(value).length !== 0
    ) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? new Date(milliseconds) : null;
  } catch {
    return null;
  }
}

function sha256Hex(value: Hex): Hex {
  return `0x${createHash("sha256")
    .update(Buffer.from(value.slice(2), "hex"))
    .digest("hex")}`;
}

function sameRecoveryAttempt(
  left: BscTestnetPtaWbnbPoolRecoveryAttemptBinding,
  right: BscTestnetPtaWbnbPoolRecoveryAttemptBinding
): boolean {
  return (
    left.generation === right.generation &&
    left.predecessorState === right.predecessorState &&
    left.predecessorFenceSha256 === right.predecessorFenceSha256 &&
    left.attemptId === right.attemptId
  );
}

function stateBinding(state: BscTestnetPtaWbnbPoolLocalJournalState): Readonly<{
  claimId: string;
  envelopeHash: Hex;
  releaseCommit: string;
  runtimeManifestSha256: Hex;
  reviewerApprovalDigest: Hex;
  ownerAuthorizationDigest: Hex;
  signingHash: Hex;
  generation: typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION;
  predecessorState: "superseded_before_worker";
  predecessorFenceSha256: Hex;
  attemptId: Hex;
}> | null {
  return state.claimId !== null &&
    state.envelopeHash !== null &&
    state.releaseCommit !== null &&
    state.runtimeManifestSha256 !== null &&
    state.reviewerApprovalDigest !== null &&
    state.ownerAuthorizationDigest !== null &&
    state.signingHash !== null &&
    state.generation === BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION &&
    state.predecessorState === "superseded_before_worker" &&
    state.predecessorFenceSha256 !== null &&
    state.attemptId !== null
    ? Object.freeze({
        claimId: state.claimId,
        envelopeHash: state.envelopeHash,
        releaseCommit: state.releaseCommit,
        runtimeManifestSha256: state.runtimeManifestSha256,
        reviewerApprovalDigest: state.reviewerApprovalDigest,
        ownerAuthorizationDigest: state.ownerAuthorizationDigest,
        signingHash: state.signingHash,
        generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
        predecessorState: "superseded_before_worker",
        predecessorFenceSha256: state.predecessorFenceSha256,
        attemptId: state.attemptId
      })
    : null;
}

function exactClaimRequestFromIntent(
  intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent
): BscTestnetPtaWbnbPoolGeneration4ClaimRequest {
  const body = Object.freeze({
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: intent.envelopeHash,
    signingHash: intent.transaction.signingHash,
    serializedUnsignedSha256: sha256Hex(intent.transaction.serializedUnsignedTransaction),
    gasLimit: intent.transaction.gasLimit,
    gasPriceWei: intent.transaction.gasPriceWei,
    maxCostWei: intent.transaction.maximumCostWei,
    reviewerApprovalDigest: intent.reviewerApprovalDigest,
    ownerAuthorizationDigest: intent.ownerAuthorizationDigest,
    releaseCommit: intent.releaseCommit,
    runtimeManifestSha256: intent.runtimeManifestSha256,
    authorizedAt: intent.authenticatedAt,
    expiresAt: intent.expiresAt,
    generation: intent.recovery.generation,
    predecessorState: intent.recovery.predecessorState,
    predecessorFenceSha256: intent.recovery.predecessorFenceSha256,
    attemptId: intent.recovery.attemptId
  });
  return Object.freeze({
    ...body,
    authorizationReceiptSha256: deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256(body)
  });
}

function exactPredecessorSupersessionFence(
  state: BscTestnetPtaWbnbPoolLocalJournalState | null
): NonNullable<BscTestnetPtaWbnbPoolLocalJournalState["supersessionFence"]> | null {
  if (
    state === null ||
    state.status !== "superseded_before_worker" ||
    state.generation !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION ||
    state.supersessionFence === null
  ) {
    return null;
  }
  const fence = state.supersessionFence;
  const noEffectObservedAt = Date.parse(fence.noEffectObservedAt);
  const fenceRecordedAt = Date.parse(fence.fenceRecordedAt);
  return fence.status === "superseded_before_worker" &&
    fence.terminalCode === "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" &&
    fence.workerAuthorizationOutcome === "not_attempted" &&
    fence.workerStartOutcome === "not_attempted" &&
    fence.signatureOutcome === "not_attempted" &&
    fence.submissionOutcome === "not_attempted" &&
    fence.submissionJournalState === "exact_empty" &&
    fence.predecessorClaimRawSha256 === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256 &&
    exactBytes32(fence.noEffectProofDigest) &&
    exactBytes32(fence.noEffectEnvelopeHash) &&
    exactBytes32(fence.predecessorFenceSha256) &&
    Number.isFinite(noEffectObservedAt) &&
    Number.isFinite(fenceRecordedAt) &&
    noEffectObservedAt < fenceRecordedAt
    ? fence
    : null;
}

function legacyFenceMatchesRecoveryAttempt(
  state: BscTestnetPtaWbnbPoolLocalJournalState | null,
  intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent,
  executionEnvelopeHash: Hex,
  executionEnvelopeObservedAt: string
): boolean {
  const fence = exactPredecessorSupersessionFence(state);
  if (fence === null) return false;
  const fenceRecordedAt = Date.parse(fence.fenceRecordedAt);
  const executionObservedAt = Date.parse(executionEnvelopeObservedAt);
  return (
    intent.recovery.generation === BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION &&
    intent.recovery.predecessorState === "superseded_before_worker" &&
    intent.recovery.predecessorFenceSha256 === fence.predecessorFenceSha256 &&
    executionEnvelopeHash === intent.envelopeHash &&
    executionEnvelopeHash !== fence.noEffectEnvelopeHash &&
    Number.isFinite(fenceRecordedAt) &&
    Number.isFinite(executionObservedAt) &&
    fenceRecordedAt < executionObservedAt
  );
}

function claimedStateMatchesRequest(
  state: BscTestnetPtaWbnbPoolLocalJournalState,
  claimId: string,
  request: BscTestnetPtaWbnbPoolGeneration4ClaimRequest
): boolean {
  return (
    state.status === "claimed" &&
    state.claimId === claimId &&
    state.operationKey === request.operationKey &&
    state.envelopeHash === request.envelopeHash &&
    state.authorizationReceiptSha256 === request.authorizationReceiptSha256 &&
    state.signingHash === request.signingHash &&
    state.serializedUnsignedSha256 === request.serializedUnsignedSha256 &&
    state.reviewerApprovalDigest === request.reviewerApprovalDigest &&
    state.ownerAuthorizationDigest === request.ownerAuthorizationDigest &&
    state.releaseCommit === request.releaseCommit &&
    state.runtimeManifestSha256 === request.runtimeManifestSha256 &&
    state.generation === request.generation &&
    state.predecessorState === request.predecessorState &&
    state.predecessorFenceSha256 === request.predecessorFenceSha256 &&
    state.attemptId === request.attemptId &&
    state.gasLimit === request.gasLimit &&
    state.gasPriceWei === request.gasPriceWei &&
    state.maxCostWei === request.maxCostWei &&
    state.authorizedAt === request.authorizedAt &&
    state.expiresAt === request.expiresAt &&
    state.serializedTransaction === null &&
    state.transactionHash === null &&
    state.supersessionFence === null
  );
}

function signingCapabilityFromState(
  state: BscTestnetPtaWbnbPoolLocalJournalState,
  preSubmission: BscTestnetPtaWbnbPoolSubmissionCapability["preSubmission"]
): BscTestnetPtaWbnbPoolSubmissionCapability | null {
  const binding = stateBinding(state);
  if (
    binding === null ||
    state.status !== "signed_committed" ||
    state.serializedTransaction === null ||
    state.transactionHash === null ||
    state.gasLimit === null ||
    state.gasPriceWei === null ||
    state.maxCostWei === null ||
    state.authorizedAt === null ||
    state.expiresAt === null ||
    Date.parse(preSubmission.observedAt) >= Date.parse(state.expiresAt)
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    scope: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
    oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: binding.claimId,
    envelopeHash: binding.envelopeHash,
    reviewerApprovalDigest: binding.reviewerApprovalDigest,
    ownerAuthorizationDigest: binding.ownerAuthorizationDigest,
    releaseCommit: binding.releaseCommit,
    runtimeManifestSha256: binding.runtimeManifestSha256,
    recovery: Object.freeze({
      generation: binding.generation,
      predecessorState: binding.predecessorState,
      predecessorFenceSha256: binding.predecessorFenceSha256,
      attemptId: binding.attemptId
    }),
    authenticatedAt: state.authorizedAt,
    expiresAt: state.expiresAt,
    signedCommitDurablyVerified: true,
    freshPreSubmissionDualRpcRecheckPerformed: true,
    preSubmission,
    transaction: Object.freeze({
      type: "legacy",
      chainId: "97",
      from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      nonce: "1",
      valueWei: "0",
      gasLimit: state.gasLimit,
      gasPriceWei: state.gasPriceWei,
      maximumCostWei: state.maxCostWei,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      signingHash: binding.signingHash,
      signedTransaction: state.serializedTransaction,
      transactionHash: state.transactionHash,
      recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
    })
  });
}

function signingStateMatchesRecoveryCapability(
  state: BscTestnetPtaWbnbPoolLocalJournalState,
  capability: BscTestnetPtaWbnbPoolSubmissionCapability
): boolean {
  const binding = stateBinding(state);
  return (
    binding !== null &&
    (state.status === "signed_committed" || state.status === "unknown_outcome") &&
    state.serializedTransaction === capability.transaction.signedTransaction &&
    state.transactionHash === capability.transaction.transactionHash &&
    state.gasLimit === capability.transaction.gasLimit &&
    state.gasPriceWei === capability.transaction.gasPriceWei &&
    state.maxCostWei === capability.transaction.maximumCostWei &&
    state.authorizedAt === capability.authenticatedAt &&
    state.expiresAt === capability.expiresAt &&
    binding.claimId === capability.claimId &&
    binding.envelopeHash === capability.envelopeHash &&
    binding.releaseCommit === capability.releaseCommit &&
    binding.runtimeManifestSha256 === capability.runtimeManifestSha256 &&
    binding.reviewerApprovalDigest === capability.reviewerApprovalDigest &&
    binding.ownerAuthorizationDigest === capability.ownerAuthorizationDigest &&
    binding.generation === capability.recovery.generation &&
    binding.predecessorState === capability.recovery.predecessorState &&
    binding.predecessorFenceSha256 === capability.recovery.predecessorFenceSha256 &&
    binding.attemptId === capability.recovery.attemptId &&
    binding.signingHash === capability.transaction.signingHash
  );
}

export type BscTestnetPtaWbnbPoolRecoveryFirstResult =
  | Readonly<{ status: "fresh" }>
  | Readonly<{
      status: "handled";
      result: BscTestnetPtaWbnbPoolProductionRunResult;
    }>;

/**
 * Restart-only gate. The caller supplies two fixed no-write readers plus, only for a matching
 * submission_started/unknown state, a separately branded fixed-path terminal-evidence handle.
 * That handle cannot initialize or start submission, and this function never receives reviewer,
 * owner, custody, signer, worker, or broadcaster authority.
 */
export async function reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
  signingJournal: BscTestnetPtaWbnbPoolLocalJournalRecoveryReader,
  submissionJournal: BscTestnetPtaWbnbPoolSubmissionJournalRecoveryReader,
  terminalRecoveryJournal: BscTestnetPtaWbnbPoolTerminalReconciliationJournal | null = null,
  now: () => Date = () => new Date()
): Promise<BscTestnetPtaWbnbPoolRecoveryFirstResult> {
  let signingState: BscTestnetPtaWbnbPoolLocalJournalState;
  let recoveryState: BscTestnetPtaWbnbPoolSubmissionRecoveryState;
  try {
    [signingState, recoveryState] = await Promise.all([
      signingJournal.readState(),
      submissionJournal.readRecoveryState()
    ]);
  } catch {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "RESTART_JOURNAL_READ_FAILED",
        "Durable signing/submission state could not be read before any policy, owner, custody, signer, or write-RPC action."
      )
    });
  }
  if (signingState.status === "empty" && recoveryState.state === "empty") {
    return Object.freeze({ status: "fresh" as const });
  }
  if (recoveryState.state === "confirmed" || recoveryState.state === "reverted") {
    if (!signingStateMatchesRecoveryCapability(signingState, recoveryState.capability)) {
      return Object.freeze({
        status: "handled" as const,
        result: blocked(
          "RESTART_BINDING_UNKNOWN",
          "The durable terminal submission does not match the retained signing evidence.",
          recoveryState.capability.transaction.transactionHash
        )
      });
    }
    if (!exactBytes32(recoveryState.reconciliationDigest)) {
      return Object.freeze({
        status: "handled" as const,
        result: blocked(
          "RESTART_TERMINAL_EVIDENCE_INVALID",
          "The durable terminal state is missing its exact reconciliation digest.",
          recoveryState.capability.transaction.transactionHash
        )
      });
    }
    return Object.freeze({
      status: "handled" as const,
      result: Object.freeze({
        status: recoveryState.state,
        retryBroadcastAllowed: false as const,
        reconciliationRetryAllowed: false as const,
        transactionHash: recoveryState.capability.transaction.transactionHash,
        reconciliationDigest: recoveryState.reconciliationDigest,
        issue: null,
        boundary: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_BOUNDARY
      })
    });
  }
  if (recoveryState.state === "signed_committed") {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "RESTART_SIGNED_COMMIT_REQUIRES_NEW_AUTHORITY",
        "A durable signed transaction exists without submission_started; persisted evidence cannot recreate owner authority, so signing and sending are forbidden.",
        recoveryState.capability.transaction.transactionHash
      )
    });
  }
  if (recoveryState.state === "submission_started" || recoveryState.state === "unknown_outcome") {
    const recoveryCapability = recoveryState.capability;
    if (
      recoveryCapability === null ||
      !signingStateMatchesRecoveryCapability(signingState, recoveryCapability)
    ) {
      return Object.freeze({
        status: "handled" as const,
        result: blocked(
          "RESTART_BINDING_UNKNOWN",
          "Restart state is incomplete or signing/submission journals do not bind the same exact transaction."
        )
      });
    }
    if (terminalRecoveryJournal === null) {
      return Object.freeze({
        status: "handled" as const,
        result: blocked(
          "RESTART_TERMINAL_JOURNAL_UNAVAILABLE",
          "The authenticated terminal-only journal handle is unavailable; reconciliation cannot append evidence.",
          recoveryCapability.transaction.transactionHash
        )
      });
    }
    const result = await createBscTestnetPtaWbnbPoolReconciliationRecoveryCoreForInternalUse(
      Object.freeze({
        now,
        acquireRecoveryCapability: async () => recoveryCapability,
        journal: terminalRecoveryJournal,
        observeExactTransaction: observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse
      })
    ).submitAndReconcileOnce();
    return Object.freeze({ status: "handled" as const, result });
  }
  if (signingState.status === "signed_committed") {
    return Object.freeze({
      status: "handled" as const,
      result: blocked(
        "RESTART_SIGNED_COMMIT_REQUIRES_NEW_AUTHORITY",
        "A durable signed transaction exists without a matching durable submission start; persisted evidence cannot recreate one-send authority, so sending is forbidden.",
        signingState.transactionHash
      )
    });
  }
  return Object.freeze({
    status: "handled" as const,
    result: blocked(
      "RESTART_BINDING_UNKNOWN",
      "A signing journal state exists without the exact matching submission recovery state."
    )
  });
}

/**
 * Narrow fresh-only composition. It accepts only the already activated private native capabilities
 * minted after the release policy and exact owner ceremony. It re-reads the append-only legacy
 * fence and both active durable journals, and refuses any changed state before the generation-4
 * claim.
 */
export function createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(
  ports: BscTestnetPtaWbnbPoolFixedProductionPorts
): Readonly<{
  runOnce: (envelope: unknown) => Promise<BscTestnetPtaWbnbPoolProductionRunResult>;
}> {
  let active: Promise<BscTestnetPtaWbnbPoolProductionRunResult> | null = null;
  let terminal: BscTestnetPtaWbnbPoolProductionRunResult | null = null;
  let durableSignedTransactionHash: Hex | null = null;

  const run = async (envelope: unknown): Promise<BscTestnetPtaWbnbPoolProductionRunResult> => {
    const now = exactDate(ports.now);
    if (now === null) return blocked("CLOCK_INVALID", "Production clock is invalid.");
    let legacyState: BscTestnetPtaWbnbPoolLocalJournalState | null;
    let signingState: BscTestnetPtaWbnbPoolLocalJournalState;
    let recoveryState: BscTestnetPtaWbnbPoolSubmissionRecoveryState;
    try {
      [legacyState, signingState, recoveryState] = await Promise.all([
        ports.legacySigningJournal.readStrictRecoveryState(),
        ports.signingJournal.readState(),
        ports.submissionJournal.readRecoveryState()
      ]);
    } catch {
      return blocked(
        "RESTART_JOURNAL_READ_FAILED",
        "The legacy fence or durable signing/submission state could not be read before any authorization or signing."
      );
    }
    if (signingState.status !== "empty" || recoveryState.state !== "empty") {
      return blocked(
        "FRESH_JOURNALS_CHANGED_AFTER_OWNER_CONFIRMATION",
        "Durable state changed after the recovery probes or owner ceremony; signing and submission are forbidden."
      );
    }
    if (exactPredecessorSupersessionFence(legacyState) === null) {
      return blocked(
        "LEGACY_SUPERSESSION_FENCE_CHANGED_AFTER_OWNER_CONFIRMATION",
        "The append-only predecessor fence is unavailable or changed after the owner ceremony; generation-4 authority cannot be used."
      );
    }
    const descriptor = describeBscTestnetPtaWbnbPoolOneShotBoundary(envelope, ports.now);
    if (descriptor.status !== "prepared_non_authorizing") {
      return blocked("ENVELOPE_INVALID", "Fresh exact coordinator envelope is unavailable.");
    }
    const intent = ports.intent;
    const parsedIntent = parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse(intent);
    let authenticatedIntent = false;
    try {
      authenticatedIntent = ports.authenticateAuthorizedIntent(intent) === true;
    } catch {
      authenticatedIntent = false;
    }
    if (
      parsedIntent === null ||
      !authenticatedIntent ||
      parsedIntent.operationKey !== descriptor.operationKey ||
      parsedIntent.envelopeHash !== descriptor.envelopeHash ||
      Date.parse(parsedIntent.authenticatedAt) > now.getTime() ||
      Date.parse(parsedIntent.expiresAt) <= now.getTime() ||
      Date.parse(parsedIntent.expiresAt) > Date.parse(descriptor.envelopeExpiresAt) ||
      parsedIntent.transaction.sourceEnvelopeHash !== descriptor.envelopeHash ||
      parsedIntent.transaction.gasLimit !== descriptor.exactBinding.gasLimit.toString() ||
      parsedIntent.transaction.gasPriceWei !== descriptor.exactBinding.gasPriceWei.toString() ||
      !legacyFenceMatchesRecoveryAttempt(
        legacyState,
        parsedIntent,
        descriptor.envelopeHash,
        descriptor.envelopeObservedAt
      )
    ) {
      return blocked(
        "ACTIVATED_INTENT_INVALID",
        "The post-ceremony native activation is not exactly bound to the fresh envelope."
      );
    }
    const fixedClients =
      createFixedOfficialBscTestnetPtaWbnbPoolPostClaimRpcClientsForInternalUse();
    const rechecker = createBscTestnetPtaWbnbPoolPostClaimRecheckerForInternalUse(
      Object.freeze({
        ...fixedClients,
        now: ports.now,
        authenticateAuthorizedIntent: ports.authenticateAuthorizedIntent,
        issueJournalClaimToken: () => {
          const bytes = randomBytes(32);
          try {
            return `0x${bytes.toString("hex")}` as Hex;
          } finally {
            bytes.fill(0);
          }
        }
      })
    );
    const worker = ports.issueWorker(ports.executionCapability);
    const signer = createBscTestnetPtaWbnbPoolOneShotSignerCoreForInternalUse(
      Object.freeze({
        asOf: ports.now,
        acquireAuthorizedIntent: async () => intent,
        authenticateAuthorizedIntent: ports.authenticateAuthorizedIntent,
        claimExactInitialization: async (request: BscTestnetPtaWbnbPoolDurableClaimRequest) => {
          if (
            request.operation !== BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_OPERATION ||
            request.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_SCHEMA_VERSION ||
            request.oneShotIntentId !== BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID ||
            request.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
            request.environment !== "bsc-testnet" ||
            request.chainId !== "97" ||
            request.envelopeHash !== parsedIntent.envelopeHash ||
            request.releaseCommit !== parsedIntent.releaseCommit ||
            request.runtimeManifestSha256 !== parsedIntent.runtimeManifestSha256 ||
            request.reviewerApprovalDigest !== parsedIntent.reviewerApprovalDigest ||
            request.ownerAuthorizationDigest !== parsedIntent.ownerAuthorizationDigest ||
            !sameRecoveryAttempt(request.recovery, parsedIntent.recovery) ||
            request.serializedUnsignedTransaction !==
              parsedIntent.transaction.serializedUnsignedTransaction ||
            request.signingHash !== parsedIntent.transaction.signingHash ||
            request.gasLimit !== parsedIntent.transaction.gasLimit ||
            request.gasPriceWei !== parsedIntent.transaction.gasPriceWei ||
            request.maximumCostWei !== parsedIntent.transaction.maximumCostWei
          ) {
            throw new Error("CLAIM_INVALID");
          }
          const [freshLegacyState, freshSigningState, freshSubmissionState] = await Promise.all([
            ports.legacySigningJournal.readStrictRecoveryState(),
            ports.signingJournal.readState(),
            ports.submissionJournal.readRecoveryState()
          ]);
          if (
            freshSigningState.status !== "empty" ||
            freshSubmissionState.state !== "empty" ||
            !legacyFenceMatchesRecoveryAttempt(
              freshLegacyState,
              parsedIntent,
              descriptor.envelopeHash,
              descriptor.envelopeObservedAt
            )
          ) {
            throw new Error("RECOVERY_PREDECESSOR_CHANGED_BEFORE_CLAIM");
          }
          const claimRequest = exactClaimRequestFromIntent(parsedIntent);
          const result = await ports.signingJournal.claimExactInitialization(claimRequest);
          if (result.status !== "claimed") {
            return Object.freeze({ status: "already_exists" as const, state: result.state });
          }
          const retainedClaim = await ports.signingJournal.readState();
          if (!claimedStateMatchesRequest(retainedClaim, result.claimId, claimRequest)) {
            throw new Error("GENERATION_4_CLAIM_READBACK_MISMATCH");
          }
          return Object.freeze({ status: "claimed" as const, claimId: result.claimId });
        },
        acquireFreshPostClaimRecheck: async (
          request: BscTestnetPtaWbnbPoolPostClaimRecheckRequest
        ) => {
          const retainedClaim = await ports.signingJournal.readState();
          const binding = stateBinding(retainedClaim);
          if (
            retainedClaim.status !== "claimed" ||
            binding === null ||
            request.oneShotIntentId !== BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID ||
            request.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
            request.claimId !== binding.claimId ||
            request.envelopeHash !== parsedIntent.envelopeHash ||
            request.releaseCommit !== parsedIntent.releaseCommit ||
            request.runtimeManifestSha256 !== parsedIntent.runtimeManifestSha256 ||
            request.reviewerApprovalDigest !== parsedIntent.reviewerApprovalDigest ||
            request.ownerAuthorizationDigest !== parsedIntent.ownerAuthorizationDigest ||
            !sameRecoveryAttempt(request.recovery, parsedIntent.recovery) ||
            request.signingHash !== parsedIntent.transaction.signingHash
          ) {
            throw new Error("POST_CLAIM_RECOVERY_BINDING_INVALID");
          }
          return rechecker
            .recheck(Object.freeze({ authorizedIntent: intent, claimId: request.claimId }))
            .then((result) => {
              if (result.status !== "verified") throw new Error(result.issue.code);
              return result.capability;
            });
        },
        authenticateFreshPostClaimRecheck: rechecker.authenticateFreshPostClaimRecheck,
        authorizeExactWorker: async (request: BscTestnetPtaWbnbPoolSigningWorkerRequest) => {
          const state = await ports.signingJournal.readState();
          const binding = stateBinding(state);
          if (
            binding === null ||
            state.authorizationReceiptSha256 === null ||
            state.serializedUnsignedSha256 === null ||
            binding.generation !== request.recovery.generation ||
            binding.predecessorState !== request.recovery.predecessorState ||
            binding.predecessorFenceSha256 !== request.recovery.predecessorFenceSha256 ||
            binding.attemptId !== request.recovery.attemptId
          ) {
            throw new Error("JOURNAL_INVALID");
          }
          await ports.signingJournal.authorizeWorker(
            Object.freeze({
              ...binding,
              operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
              authorizationReceiptSha256: state.authorizationReceiptSha256,
              serializedUnsignedSha256: state.serializedUnsignedSha256,
              workerRequestHash: request.requestHash,
              authorizationTokenDigest: keccak256(request.journalClaimToken)
            })
          );
          return Object.freeze({ status: "worker_authorized" as const });
        },
        invokeExactSigningWorker: worker.invokeExactSigningWorker,
        readBackSignedCommit: async (
          request: BscTestnetPtaWbnbPoolDurableSignedReadbackRequest
        ) => {
          const state = await ports.signingJournal.readState();
          const binding = stateBinding(state);
          return state.status === "signed_committed" &&
            binding !== null &&
            request.schemaVersion === BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_SCHEMA_VERSION &&
            request.operation === BSC_TESTNET_PTA_WBNB_POOL_DURABLE_SIGNED_READBACK_OPERATION &&
            request.oneShotIntentId === BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID &&
            request.operationKey === BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY &&
            request.claimId === binding.claimId &&
            request.envelopeHash === parsedIntent.envelopeHash &&
            request.releaseCommit === parsedIntent.releaseCommit &&
            request.runtimeManifestSha256 === parsedIntent.runtimeManifestSha256 &&
            request.reviewerApprovalDigest === parsedIntent.reviewerApprovalDigest &&
            request.ownerAuthorizationDigest === parsedIntent.ownerAuthorizationDigest &&
            sameRecoveryAttempt(request.recovery, parsedIntent.recovery) &&
            request.signingHash === parsedIntent.transaction.signingHash &&
            request.serializedUnsignedTransaction ===
              parsedIntent.transaction.serializedUnsignedTransaction &&
            state.serializedTransaction === request.signedTransaction &&
            state.transactionHash === request.transactionHash
            ? Object.freeze({ status: "signed_commit_verified" as const })
            : Object.freeze({ status: "unknown" as const });
        }
      })
    );
    const signed = await signer.signOnce();
    if (signed.status !== "signed_committed") {
      if (signed.issue.phase === "recheck") {
        const retainedClaim = await ports.signingJournal.readState();
        const binding = stateBinding(retainedClaim);
        const issueCode: BscTestnetPtaWbnbPoolFailedBeforeWorkerIssueCode =
          signed.issue.code === "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN"
            ? "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN"
            : "POST_CLAIM_RECHECK_REJECTED";
        const evidenceDigest = `0x${createHash("sha256")
          .update(
            JSON.stringify({
              phase: signed.issue.phase,
              code: signed.issue.code,
              protocolIssue: signed.issue.protocolIssue
            }),
            "utf8"
          )
          .digest("hex")}` as Hex;
        const outcomeDigest = deriveBscTestnetPtaWbnbPoolFailedBeforeWorkerOutcomeDigest({
          phase: "post_claim_recheck",
          issueCode,
          evidenceDigest
        });
        if (
          binding === null ||
          retainedClaim.status !== "claimed" ||
          retainedClaim.operationKey === null ||
          retainedClaim.authorizationReceiptSha256 === null ||
          retainedClaim.serializedUnsignedSha256 === null ||
          outcomeDigest === null
        ) {
          return blocked(
            "FAILED_BEFORE_WORKER_PERSISTENCE_UNKNOWN",
            "The known pre-worker failure could not be bound to the durable claim.",
            signed.transactionHash
          );
        }
        try {
          await ports.signingJournal.failBeforeWorker(
            Object.freeze({
              ...binding,
              operationKey: retainedClaim.operationKey,
              authorizationReceiptSha256: retainedClaim.authorizationReceiptSha256,
              serializedUnsignedSha256: retainedClaim.serializedUnsignedSha256,
              phase: "post_claim_recheck" as const,
              issueCode,
              outcomeDigest
            })
          );
        } catch {
          return blocked(
            "FAILED_BEFORE_WORKER_PERSISTENCE_UNKNOWN",
            "The slot-2 known pre-worker failure outcome is ambiguous and must not be retried.",
            signed.transactionHash
          );
        }
      }
      return blocked(signed.issue.code, signed.issue.message, signed.transactionHash);
    }
    durableSignedTransactionHash = signed.transactionHash;
    const signedState = await ports.signingJournal.readState();
    const preSubmission = await acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse({
      transactionHash: signed.transactionHash,
      gasLimit: signedState.gasLimit ?? "",
      gasPriceWei: signedState.gasPriceWei ?? ""
    });
    const capability = signingCapabilityFromState(signedState, preSubmission);
    if (capability === null) {
      return blocked(
        "SUBMISSION_CAPABILITY_INVALID",
        "Signed durable state could not mint submission authority.",
        signed.transactionHash
      );
    }
    const seed = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
      capability,
      now
    );
    if (seed === null) {
      return blocked(
        "SUBMISSION_CAPABILITY_INVALID",
        "Strict submission capability validation failed.",
        signed.transactionHash
      );
    }
    await ports.submissionJournal.initializeSignedCommit(
      Object.freeze({
        schemaVersion: 4 as const,
        kind: "authenticated_owner_recovery_generation_4_signed_submission_commit_v4" as const,
        ownerAuthorizationPolicy: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V5_POLICY,
        capability
      })
    );
    const branded = new WeakSet<object>();
    branded.add(capability);
    const submission = createBscTestnetPtaWbnbPoolSubmissionCoreForInternalUse(
      Object.freeze({
        now: ports.now,
        acquireSubmissionCapability: async () => capability,
        authenticateSubmissionCapability: (value: unknown) =>
          typeof value === "object" && value !== null && !isProxy(value) && branded.has(value),
        journal: ports.submissionJournal,
        acquireTerminalPreSendRecheck: (input: BscTestnetPtaWbnbPoolProductionPreSubmissionInput) =>
          ports.broadcaster.acquireTerminalPreSendRecheck(ports.executionCapability, input),
        sendExactRawTransactionOnce: (signedTransaction: Hex) =>
          ports.broadcaster.sendExactRawTransactionOnce(
            ports.executionCapability,
            signedTransaction
          ),
        observeExactTransaction: observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse
      })
    );
    return submission.submitAndReconcileOnce();
  };

  return Object.freeze({
    runOnce: (envelope) => {
      if (terminal !== null) return Promise.resolve(terminal);
      if (active !== null) return active;
      active = Promise.resolve()
        .then(() => run(envelope))
        .then((result) => {
          terminal = result;
          return result;
        })
        .catch(() => {
          const result =
            durableSignedTransactionHash === null
              ? blocked(
                  "PRODUCTION_OUTCOME_UNKNOWN",
                  "The one-shot outcome is unknown; do not retry signing or broadcast automatically."
                )
              : blocked(
                  "POST_SIGNING_OUTCOME_UNKNOWN_DO_NOT_RETRY",
                  "A durable signed transaction exists and later progress is unknown; do not retry signing or broadcast. Restart may only inspect durable evidence and reconcile a matching submission_started state.",
                  durableSignedTransactionHash
                );
          terminal = result;
          return result;
        })
        .finally(() => {
          active = null;
        });
      return active;
    }
  });
}
