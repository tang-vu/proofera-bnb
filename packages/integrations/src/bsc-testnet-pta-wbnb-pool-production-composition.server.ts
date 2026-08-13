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
  createBscTestnetPtaWbnbPoolOneShotSignerCoreForInternalUse,
  type BscTestnetPtaWbnbPoolDurableClaimRequest,
  type BscTestnetPtaWbnbPoolDurableSignedReadbackRequest,
  type BscTestnetPtaWbnbPoolPostClaimRecheckRequest
} from "./bsc-testnet-pta-wbnb-pool-one-shot-signer-core";
import {
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  type BscTestnetPtaWbnbPoolAuthorizedSigningIntent,
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
  type BscTestnetPtaWbnbPoolClaimRequest,
  type BscTestnetPtaWbnbPoolLocalJournal,
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
  type BscTestnetPtaWbnbPoolSubmissionResult
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY,
  type BscTestnetPtaWbnbPoolDurableSubmissionJournal,
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

function stateBinding(state: BscTestnetPtaWbnbPoolLocalJournalState): Readonly<{
  claimId: string;
  envelopeHash: Hex;
  releaseCommit: string;
  runtimeManifestSha256: Hex;
  reviewerApprovalDigest: Hex;
  ownerAuthorizationDigest: Hex;
  signingHash: Hex;
}> | null {
  return state.claimId !== null &&
    state.envelopeHash !== null &&
    state.releaseCommit !== null &&
    state.runtimeManifestSha256 !== null &&
    state.reviewerApprovalDigest !== null &&
    state.ownerAuthorizationDigest !== null &&
    state.signingHash !== null
    ? Object.freeze({
        claimId: state.claimId,
        envelopeHash: state.envelopeHash,
        releaseCommit: state.releaseCommit,
        runtimeManifestSha256: state.runtimeManifestSha256,
        reviewerApprovalDigest: state.reviewerApprovalDigest,
        ownerAuthorizationDigest: state.ownerAuthorizationDigest,
        signingHash: state.signingHash
      })
    : null;
}

function exactClaimRequestFromIntent(
  intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent
): BscTestnetPtaWbnbPoolClaimRequest {
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
    expiresAt: intent.expiresAt
  });
  return Object.freeze({
    ...body,
    authorizationReceiptSha256: deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256(body)
  });
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
 * Restart-only gate. The caller must supply the two journals returned by the fixed no-write open
 * probes. This function never receives or constructs reviewer, owner, custody, signer, worker, or
 * broadcaster authority. Only a matching durable submission_started/unknown state may perform the
 * fixed dual-RPC reconciliation reads.
 */
export async function reconcileExistingBscTestnetPtaWbnbPoolRecoveryForInternalUse(
  signingJournal: BscTestnetPtaWbnbPoolLocalJournal,
  submissionJournal: BscTestnetPtaWbnbPoolDurableSubmissionJournal,
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
    const result = await createBscTestnetPtaWbnbPoolReconciliationRecoveryCoreForInternalUse(
      Object.freeze({
        now,
        acquireRecoveryCapability: async () => recoveryCapability,
        journal: submissionJournal,
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
 * minted after the release policy and exact owner ceremony. It re-reads both durable journals and
 * refuses any non-empty state before the first claim.
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
    let signingState: BscTestnetPtaWbnbPoolLocalJournalState;
    let recoveryState: BscTestnetPtaWbnbPoolSubmissionRecoveryState;
    try {
      [signingState, recoveryState] = await Promise.all([
        ports.signingJournal.readState(),
        ports.submissionJournal.readRecoveryState()
      ]);
    } catch {
      return blocked(
        "RESTART_JOURNAL_READ_FAILED",
        "Durable signing/submission state could not be read before any authorization or signing."
      );
    }
    if (signingState.status !== "empty" || recoveryState.state !== "empty") {
      return blocked(
        "FRESH_JOURNALS_CHANGED_AFTER_OWNER_CONFIRMATION",
        "Durable state changed after the recovery probes or owner ceremony; signing and submission are forbidden."
      );
    }
    const descriptor = describeBscTestnetPtaWbnbPoolOneShotBoundary(envelope, ports.now);
    if (descriptor.status !== "prepared_non_authorizing") {
      return blocked("ENVELOPE_INVALID", "Fresh exact coordinator envelope is unavailable.");
    }
    const intent = ports.intent;
    let authenticatedIntent = false;
    try {
      authenticatedIntent = ports.authenticateAuthorizedIntent(intent) === true;
    } catch {
      authenticatedIntent = false;
    }
    if (
      !authenticatedIntent ||
      intent.operationKey !== descriptor.operationKey ||
      intent.envelopeHash !== descriptor.envelopeHash ||
      intent.expiresAt !== descriptor.envelopeExpiresAt ||
      intent.transaction.sourceEnvelopeHash !== descriptor.envelopeHash ||
      intent.transaction.gasLimit !== descriptor.exactBinding.gasLimit.toString() ||
      intent.transaction.gasPriceWei !== descriptor.exactBinding.gasPriceWei.toString()
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
            request.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_SCHEMA_VERSION
          ) {
            throw new Error("CLAIM_INVALID");
          }
          const result = await ports.signingJournal.claimExactInitialization(
            exactClaimRequestFromIntent(intent)
          );
          return result.status === "claimed"
            ? Object.freeze({ status: "claimed" as const, claimId: result.claimId })
            : Object.freeze({ status: "already_exists" as const, state: result.state });
        },
        acquireFreshPostClaimRecheck: async (
          request: BscTestnetPtaWbnbPoolPostClaimRecheckRequest
        ) =>
          rechecker
            .recheck(Object.freeze({ authorizedIntent: intent, claimId: request.claimId }))
            .then((result) => {
              if (result.status !== "verified") throw new Error(result.issue.code);
              return result.capability;
            }),
        authenticateFreshPostClaimRecheck: rechecker.authenticateFreshPostClaimRecheck,
        authorizeExactWorker: async (request: BscTestnetPtaWbnbPoolSigningWorkerRequest) => {
          const state = await ports.signingJournal.readState();
          const binding = stateBinding(state);
          if (binding === null) throw new Error("JOURNAL_INVALID");
          await ports.signingJournal.authorizeWorker(
            Object.freeze({
              ...binding,
              operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
              authorizationReceiptSha256: state.authorizationReceiptSha256 as Hex,
              serializedUnsignedSha256: state.serializedUnsignedSha256 as Hex,
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
          return state.status === "signed_committed" &&
            state.serializedTransaction === request.signedTransaction &&
            state.transactionHash === request.transactionHash
            ? Object.freeze({ status: "signed_commit_verified" as const })
            : Object.freeze({ status: "unknown" as const });
        }
      })
    );
    const signed = await signer.signOnce();
    if (signed.status !== "signed_committed") {
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
        schemaVersion: 1 as const,
        kind: "authenticated_owner_v2_signed_submission_commit_v1" as const,
        ownerAuthorizationPolicy: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY,
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
