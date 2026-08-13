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
  sendExactBscTestnetPtaWbnbPoolRawTransactionOnceForInternalUse
} from "./bsc-testnet-pta-wbnb-pool-production-rpc.server";
import {
  deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256,
  type BscTestnetPtaWbnbPoolClaimRequest,
  type BscTestnetPtaWbnbPoolLocalJournal,
  type BscTestnetPtaWbnbPoolLocalJournalState
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG,
  type BscTestnetPtaWbnbPoolProductionExecutionCommand
} from "./bsc-testnet-pta-wbnb-pool-production-authority.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
  createBscTestnetPtaWbnbPoolSubmissionCoreForInternalUse,
  deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse,
  type BscTestnetPtaWbnbPoolSubmissionCapability,
  type BscTestnetPtaWbnbPoolSubmissionResult
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";
import type { BscTestnetPtaWbnbPoolDurableSubmissionJournal } from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";
import type {
  BscTestnetPtaWbnbPoolSigningWorker,
  BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust
} from "./bsc-testnet-pta-wbnb-pool-signing-worker";

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

type AuthorityResult = Readonly<{
  status: "authorized";
  intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
  executionCapability: object;
}>;

/**
 * Fixed authority facade created by the root runner. Its implementation and private brands remain
 * in the runner module; this composition never accepts an authority authenticator callback.
 */
export interface BscTestnetPtaWbnbPoolFixedProductionAuthority {
  readonly authorize: (
    descriptor: unknown,
    command: unknown,
    localCustodyOwnerCapability: unknown
  ) => AuthorityResult | Readonly<{ status: "blocked"; issue: { code: string; message: string } }>;
  readonly authenticateAuthorizedIntent: (intent: unknown) => boolean;
  readonly authenticateExecutionCapability: (capability: unknown) => boolean;
}

export interface BscTestnetPtaWbnbPoolFixedProductionPorts {
  readonly now: () => Date;
  readonly releaseTrust: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust;
  readonly authority: BscTestnetPtaWbnbPoolFixedProductionAuthority;
  readonly localCustodyOwnerCapability: object;
  readonly signingJournal: BscTestnetPtaWbnbPoolLocalJournal;
  readonly submissionJournal: BscTestnetPtaWbnbPoolDurableSubmissionJournal;
  readonly issueWorker: (executionCapability: unknown) => BscTestnetPtaWbnbPoolSigningWorker;
}

export type BscTestnetPtaWbnbPoolProductionRunResult =
  | Readonly<{
      status: "blocked";
      code: string;
      message: string;
      transactionHash: Hex | null;
      boundary: typeof BOUNDARY;
    }>
  | Readonly<{
      status: "signed_committed";
      code: "SUBMISSION_AUTHORIZATION_REFRESH_REQUIRED";
      message: string;
      transactionHash: Hex;
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
  intent: AuthorityResult["intent"]
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

/**
 * Narrow one-shot composition. It has no caller transaction/RPC/path/signing input; the root runner
 * supplies only already-fixed private capabilities and fixed adapters.
 */
export function createBscTestnetPtaWbnbPoolProductionCompositionForInternalUse(
  ports: BscTestnetPtaWbnbPoolFixedProductionPorts
): Readonly<{
  runOnce: (
    envelope: unknown,
    command: BscTestnetPtaWbnbPoolProductionExecutionCommand
  ) => Promise<BscTestnetPtaWbnbPoolProductionRunResult>;
}> {
  let active: Promise<BscTestnetPtaWbnbPoolProductionRunResult> | null = null;
  let terminal: BscTestnetPtaWbnbPoolProductionRunResult | null = null;

  const run = async (
    envelope: unknown,
    command: BscTestnetPtaWbnbPoolProductionExecutionCommand
  ): Promise<BscTestnetPtaWbnbPoolProductionRunResult> => {
    const now = exactDate(ports.now);
    if (now === null) return blocked("CLOCK_INVALID", "Production clock is invalid.");
    const descriptor = describeBscTestnetPtaWbnbPoolOneShotBoundary(envelope, ports.now);
    if (descriptor.status !== "prepared_non_authorizing") {
      return blocked("ENVELOPE_INVALID", "Fresh exact coordinator envelope is unavailable.");
    }
    const authorization = ports.authority.authorize(
      descriptor,
      command,
      ports.localCustodyOwnerCapability
    );
    if (authorization.status !== "authorized") {
      return blocked(authorization.issue.code, authorization.issue.message);
    }
    const intent = authorization.intent;
    const fixedClients =
      createFixedOfficialBscTestnetPtaWbnbPoolPostClaimRpcClientsForInternalUse();
    const rechecker = createBscTestnetPtaWbnbPoolPostClaimRecheckerForInternalUse(
      Object.freeze({
        ...fixedClients,
        now: ports.now,
        authenticateAuthorizedIntent: ports.authority.authenticateAuthorizedIntent,
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
    const worker = ports.issueWorker(authorization.executionCapability);
    const signer = createBscTestnetPtaWbnbPoolOneShotSignerCoreForInternalUse(
      Object.freeze({
        asOf: ports.now,
        acquireAuthorizedIntent: async () => intent,
        authenticateAuthorizedIntent: ports.authority.authenticateAuthorizedIntent,
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
    await ports.submissionJournal.initializeSignedCommit(seed);
    const branded = new WeakSet<object>();
    branded.add(capability);
    const submission = createBscTestnetPtaWbnbPoolSubmissionCoreForInternalUse(
      Object.freeze({
        now: ports.now,
        acquireSubmissionCapability: async () => capability,
        authenticateSubmissionCapability: (value: unknown) =>
          typeof value === "object" && value !== null && !isProxy(value) && branded.has(value),
        journal: ports.submissionJournal,
        sendExactRawTransactionOnce: sendExactBscTestnetPtaWbnbPoolRawTransactionOnceForInternalUse,
        observeExactTransaction: observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse
      })
    );
    return submission.submitAndReconcileOnce();
  };

  return Object.freeze({
    runOnce: (envelope, command) => {
      if (terminal !== null) return Promise.resolve(terminal);
      if (active !== null) return active;
      active = Promise.resolve()
        .then(() => run(envelope, command))
        .then((result) => {
          terminal = result;
          return result;
        })
        .catch(() => {
          const result = blocked(
            "PRODUCTION_OUTCOME_UNKNOWN",
            "The one-shot outcome is unknown; do not retry signing or broadcast automatically."
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
