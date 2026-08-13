import { isProxy } from "node:util/types";

import type { Hex } from "viem";

import type { BSC_TESTNET_PTA_WBNB_POOL_SENDER } from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  buildBscTestnetPtaWbnbPoolSigningWorkerRequest,
  parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse,
  validateBscTestnetPtaWbnbPoolFreshRecheckCapability,
  validateBscTestnetPtaWbnbPoolSigningWorkerResponse,
  type BscTestnetPtaWbnbPoolProtocolIssue,
  type BscTestnetPtaWbnbPoolSigningWorkerRequest
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

export const BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_SCHEMA_VERSION = 1 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_OPERATION =
  "claim_exact_bsc_testnet_pta_wbnb_pool_initialization_once" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_DURABLE_SIGNED_READBACK_OPERATION =
  "verify_exact_bsc_testnet_pta_wbnb_pool_signed_commit" as const;

const CORE_BOUNDARY = Object.freeze({
  scope: "one_exact_bsc_testnet_pta_wbnb_pool_initialization_signature" as const,
  environment: "bsc-testnet" as const,
  chainId: "97" as const,
  operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  signOnceAcceptsArguments: false,
  genericSigningApiExposed: false,
  callerTransactionInputAccepted: false,
  privateKeyAccepted: false,
  secretReadByCore: false,
  rpcReadByCore: false,
  signingPerformedByCore: false,
  broadcastPerformedByCore: false,
  transactionSubmitted: false,
  mainnetWritePossible: false,
  productionAuthorizationIssuerPresent: false,
  atomicClaimRequiredBeforePostClaimRpcRecheck: true,
  authenticatedPostClaimDualRpcRecheckRequiredBeforeWorker: true,
  durableSignedCommitRequiredBeforeRawBytesReleased: true,
  ambiguousPostClaimRetryAllowed: false
});

export interface BscTestnetPtaWbnbPoolDurableClaimRequest {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_SCHEMA_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_OPERATION;
  readonly oneShotIntentId: typeof BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly environment: "bsc-testnet";
  readonly chainId: "97";
  readonly envelopeHash: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly serializedUnsignedTransaction: Hex;
  readonly signingHash: Hex;
  readonly gasLimit: string;
  readonly gasPriceWei: string;
  readonly maximumCostWei: string;
}

export type BscTestnetPtaWbnbPoolDurableClaimResult =
  | Readonly<{ status: "claimed"; claimId: string }>
  | Readonly<{
      status: "already_exists";
      state:
        | "claimed"
        | "signed_committed"
        | "submitted"
        | "confirmed"
        | "failed_before_submission"
        | "unknown_outcome";
    }>;

export interface BscTestnetPtaWbnbPoolPostClaimRecheckRequest {
  readonly oneShotIntentId: typeof BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly claimId: string;
  readonly envelopeHash: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly signingHash: Hex;
}

export interface BscTestnetPtaWbnbPoolDurableSignedReadbackRequest {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_SCHEMA_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_WBNB_POOL_DURABLE_SIGNED_READBACK_OPERATION;
  readonly oneShotIntentId: typeof BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly claimId: string;
  readonly envelopeHash: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly requestHash: Hex;
  readonly signingHash: Hex;
  readonly serializedUnsignedTransaction: Hex;
  readonly signedTransaction: Hex;
  readonly transactionHash: Hex;
  readonly recoveredSigner: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
}

export type BscTestnetPtaWbnbPoolOneShotSignerIssueCode =
  | "PRODUCTION_AUTHORIZATION_UNAVAILABLE"
  | "CONFIGURATION_INVALID"
  | "CLOCK_INVALID"
  | "AUTHORIZATION_ACQUISITION_FAILED"
  | "AUTHORIZATION_CONTENT_INVALID"
  | "AUTHORIZATION_AUTHENTICATION_FAILED"
  | "AUTHORIZATION_EXPIRED"
  | "CLAIM_OUTCOME_UNKNOWN"
  | "INTENT_ALREADY_CLAIMED"
  | "CLAIM_IDENTIFIER_INVALID"
  | "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN"
  | "POST_CLAIM_RECHECK_INVALID"
  | "POST_CLAIM_RECHECK_AUTHENTICATION_FAILED"
  | "WORKER_AUTHORIZATION_OUTCOME_UNKNOWN"
  | "WORKER_OUTCOME_UNKNOWN"
  | "WORKER_OUTPUT_INVALID"
  | "COMMIT_OUTCOME_UNKNOWN"
  | "INTERNAL_STATE_ERROR";

export interface BscTestnetPtaWbnbPoolOneShotSignerIssue {
  readonly code: BscTestnetPtaWbnbPoolOneShotSignerIssueCode;
  readonly phase: "configuration" | "authorization" | "claim" | "recheck" | "worker" | "commit";
  readonly message: string;
  readonly protocolIssue: BscTestnetPtaWbnbPoolProtocolIssue | null;
}

export type BscTestnetPtaWbnbPoolOneShotSignerResult =
  | Readonly<{
      status: "blocked_before_claim";
      retryAllowed: boolean;
      durableClaimOutcome: "not_attempted";
      signatureOutcome: "not_attempted";
      signedTransaction: null;
      transactionHash: null;
      issue: BscTestnetPtaWbnbPoolOneShotSignerIssue;
      boundary: typeof CORE_BOUNDARY;
    }>
  | Readonly<{
      status: "do_not_retry";
      retryAllowed: false;
      durableClaimOutcome: "unknown" | "already_exists" | "claimed";
      signatureOutcome:
        "not_attempted" | "unknown" | "unverified_worker_output" | "validated_commit_unknown";
      signedTransaction: null;
      transactionHash: null;
      issue: BscTestnetPtaWbnbPoolOneShotSignerIssue;
      boundary: typeof CORE_BOUNDARY;
    }>
  | Readonly<{
      status: "signed_committed";
      retryAllowed: false;
      durableClaimOutcome: "claimed_and_signed_committed";
      signatureOutcome: "validated_and_committed";
      signedTransaction: Hex;
      transactionHash: Hex;
      recoveredSigner: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
      transactionSubmitted: false;
      broadcastAuthorized: false;
      issue: null;
      boundary: typeof CORE_BOUNDARY;
    }>;

export type BscTestnetPtaWbnbPoolOneShotSignerState =
  | "idle"
  | "acquiring_authorization"
  | "claiming"
  | "acquiring_post_claim_recheck"
  | "authorizing_worker"
  | "invoking_worker"
  | "committing"
  | "terminal_do_not_retry"
  | "signed_committed";

export interface BscTestnetPtaWbnbPoolOneShotSignerCore {
  readonly boundary: typeof CORE_BOUNDARY;
  readonly getState: () => BscTestnetPtaWbnbPoolOneShotSignerState;
  readonly signOnce: () => Promise<BscTestnetPtaWbnbPoolOneShotSignerResult>;
}

/** Test-only DI seam. Production construction below is permanently blocked in this release. */
export interface BscTestnetPtaWbnbPoolOneShotSignerTestDependencies {
  readonly asOf: () => Date;
  readonly acquireAuthorizedIntent: () => Promise<unknown>;
  readonly authenticateAuthorizedIntent: (intent: unknown) => boolean;
  readonly claimExactInitialization: (
    request: BscTestnetPtaWbnbPoolDurableClaimRequest
  ) => Promise<unknown>;
  readonly acquireFreshPostClaimRecheck: (
    request: BscTestnetPtaWbnbPoolPostClaimRecheckRequest
  ) => Promise<unknown>;
  readonly authenticateFreshPostClaimRecheck: (capability: unknown) => boolean;
  readonly authorizeExactWorker: (
    request: BscTestnetPtaWbnbPoolSigningWorkerRequest
  ) => Promise<unknown>;
  readonly invokeExactSigningWorker: (
    request: BscTestnetPtaWbnbPoolSigningWorkerRequest
  ) => Promise<unknown>;
  readonly readBackSignedCommit: (
    request: BscTestnetPtaWbnbPoolDurableSignedReadbackRequest
  ) => Promise<unknown>;
}

type DataRecord = Readonly<Record<string, unknown>>;

const DEPENDENCY_KEYS = [
  "acquireAuthorizedIntent",
  "acquireFreshPostClaimRecheck",
  "asOf",
  "authenticateAuthorizedIntent",
  "authenticateFreshPostClaimRecheck",
  "authorizeExactWorker",
  "claimExactInitialization",
  "invokeExactSigningWorker",
  "readBackSignedCommit"
] as const;

function inspectRecord(value: unknown, expectedKeys: readonly string[]): DataRecord | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return null;
    const actual = (keys as string[]).sort();
    const expected = [...expectedKeys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function callable(value: unknown): value is (...arguments_: never[]) => unknown {
  return typeof value === "function" && !isProxy(value);
}

function parseDependencies(
  input: unknown
): BscTestnetPtaWbnbPoolOneShotSignerTestDependencies | null {
  const root = inspectRecord(input, DEPENDENCY_KEYS);
  if (root === null || DEPENDENCY_KEYS.some((key) => !callable(root[key]))) return null;
  return Object.freeze({
    asOf: root.asOf as () => Date,
    acquireAuthorizedIntent: root.acquireAuthorizedIntent as () => Promise<unknown>,
    authenticateAuthorizedIntent: root.authenticateAuthorizedIntent as (intent: unknown) => boolean,
    claimExactInitialization: root.claimExactInitialization as (
      request: BscTestnetPtaWbnbPoolDurableClaimRequest
    ) => Promise<unknown>,
    acquireFreshPostClaimRecheck: root.acquireFreshPostClaimRecheck as (
      request: BscTestnetPtaWbnbPoolPostClaimRecheckRequest
    ) => Promise<unknown>,
    authenticateFreshPostClaimRecheck: root.authenticateFreshPostClaimRecheck as (
      capability: unknown
    ) => boolean,
    authorizeExactWorker: root.authorizeExactWorker as (
      request: BscTestnetPtaWbnbPoolSigningWorkerRequest
    ) => Promise<unknown>,
    invokeExactSigningWorker: root.invokeExactSigningWorker as (
      request: BscTestnetPtaWbnbPoolSigningWorkerRequest
    ) => Promise<unknown>,
    readBackSignedCommit: root.readBackSignedCommit as (
      request: BscTestnetPtaWbnbPoolDurableSignedReadbackRequest
    ) => Promise<unknown>
  });
}

function signerIssue(
  code: BscTestnetPtaWbnbPoolOneShotSignerIssueCode,
  phase: BscTestnetPtaWbnbPoolOneShotSignerIssue["phase"],
  message: string,
  protocolIssue: BscTestnetPtaWbnbPoolProtocolIssue | null = null
): BscTestnetPtaWbnbPoolOneShotSignerIssue {
  return Object.freeze({ code, phase, message, protocolIssue });
}

function blockedBeforeClaim(
  problem: BscTestnetPtaWbnbPoolOneShotSignerIssue,
  retryAllowed = true
): BscTestnetPtaWbnbPoolOneShotSignerResult {
  return Object.freeze({
    status: "blocked_before_claim" as const,
    retryAllowed,
    durableClaimOutcome: "not_attempted" as const,
    signatureOutcome: "not_attempted" as const,
    signedTransaction: null,
    transactionHash: null,
    issue: problem,
    boundary: CORE_BOUNDARY
  });
}

function doNotRetry(
  problem: BscTestnetPtaWbnbPoolOneShotSignerIssue,
  durableClaimOutcome: "unknown" | "already_exists" | "claimed",
  signatureOutcome:
    "not_attempted" | "unknown" | "unverified_worker_output" | "validated_commit_unknown"
): BscTestnetPtaWbnbPoolOneShotSignerResult {
  return Object.freeze({
    status: "do_not_retry" as const,
    retryAllowed: false as const,
    durableClaimOutcome,
    signatureOutcome,
    signedTransaction: null,
    transactionHash: null,
    issue: problem,
    boundary: CORE_BOUNDARY
  });
}

function captureClock(clock: () => Date): Date | null {
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

function exactClaimId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
    ? value
    : null;
}

function inspectClaimResult(input: unknown): BscTestnetPtaWbnbPoolDurableClaimResult | null {
  const claimed = inspectRecord(input, ["claimId", "status"]);
  if (claimed !== null && claimed.status === "claimed") {
    const claimId = exactClaimId(claimed.claimId);
    return claimId !== null ? Object.freeze({ status: "claimed" as const, claimId }) : null;
  }
  const existing = inspectRecord(input, ["state", "status"]);
  if (
    existing !== null &&
    existing.status === "already_exists" &&
    (existing.state === "claimed" ||
      existing.state === "signed_committed" ||
      existing.state === "submitted" ||
      existing.state === "confirmed" ||
      existing.state === "failed_before_submission" ||
      existing.state === "unknown_outcome")
  ) {
    return Object.freeze({ status: "already_exists" as const, state: existing.state });
  }
  return null;
}

function workerAuthorizationSucceeded(input: unknown): boolean {
  const record = inspectRecord(input, ["status"]);
  return record !== null && record.status === "worker_authorized";
}

function signedCommitReadbackSucceeded(input: unknown): boolean {
  const record = inspectRecord(input, ["status"]);
  return record !== null && record.status === "signed_commit_verified";
}

function invalidCore(
  code: "CONFIGURATION_INVALID" | "PRODUCTION_AUTHORIZATION_UNAVAILABLE",
  message: string
): BscTestnetPtaWbnbPoolOneShotSignerCore {
  const result = blockedBeforeClaim(signerIssue(code, "configuration", message), false);
  return Object.freeze({
    boundary: CORE_BOUNDARY,
    getState: () => "terminal_do_not_retry" as const,
    signOnce: () => Promise.resolve(result)
  });
}

/**
 * Production constructor is intentionally non-authorizing until a reviewed, non-injectable receipt
 * issuer is installed. It accepts no dependencies and can never reach a claim, secret, or worker.
 */
export function createBscTestnetPtaWbnbPoolProductionOneShotSignerCore(): BscTestnetPtaWbnbPoolOneShotSignerCore {
  return invalidCore(
    "PRODUCTION_AUTHORIZATION_UNAVAILABLE",
    "This release has no production reviewer/owner receipt issuer; signing remains unavailable."
  );
}

/**
 * Dependency-injected protocol harness for deterministic tests and independent review only. signOnce
 * has no transaction arguments. Every ambiguous outcome after claim is terminal and non-retryable.
 */
export function createBscTestnetPtaWbnbPoolOneShotSignerCoreForTests(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolOneShotSignerCore {
  const dependencies = parseDependencies(untrustedDependencies);
  if (dependencies === null) {
    return invalidCore(
      "CONFIGURATION_INVALID",
      "Test signer core requires exact own-data non-proxy protocol ports."
    );
  }

  let state: BscTestnetPtaWbnbPoolOneShotSignerState = "idle";
  let active: Promise<BscTestnetPtaWbnbPoolOneShotSignerResult> | null = null;
  let terminal: BscTestnetPtaWbnbPoolOneShotSignerResult | null = null;

  const setTerminal = (
    result: BscTestnetPtaWbnbPoolOneShotSignerResult,
    next: "terminal_do_not_retry" | "signed_committed"
  ) => {
    terminal = result;
    state = next;
    return result;
  };

  const run = async (): Promise<BscTestnetPtaWbnbPoolOneShotSignerResult> => {
    state = "acquiring_authorization";
    let untrustedIntent: unknown;
    try {
      untrustedIntent = await Reflect.apply(dependencies.acquireAuthorizedIntent, undefined, []);
    } catch {
      state = "idle";
      return blockedBeforeClaim(
        signerIssue(
          "AUTHORIZATION_ACQUISITION_FAILED",
          "authorization",
          "Authenticated exact authorization could not be acquired before claim."
        )
      );
    }
    const intent = parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse(untrustedIntent);
    if (intent === null) {
      state = "idle";
      return blockedBeforeClaim(
        signerIssue(
          "AUTHORIZATION_CONTENT_INVALID",
          "authorization",
          "Authorization content is not the exact frozen pool initialization intent."
        )
      );
    }
    let intentAuthenticated = false;
    try {
      intentAuthenticated =
        Reflect.apply(dependencies.authenticateAuthorizedIntent, undefined, [untrustedIntent]) ===
        true;
    } catch {
      intentAuthenticated = false;
    }
    if (!intentAuthenticated) {
      state = "idle";
      return blockedBeforeClaim(
        signerIssue(
          "AUTHORIZATION_AUTHENTICATION_FAILED",
          "authorization",
          "Authorization JSON lacks the private brand proving both reviewer and owner capabilities."
        )
      );
    }
    const firstClock = captureClock(dependencies.asOf);
    const authorizationExpiry = Date.parse(intent.expiresAt);
    if (firstClock === null) {
      state = "idle";
      return blockedBeforeClaim(
        signerIssue("CLOCK_INVALID", "authorization", "Signer clock is invalid before claim.")
      );
    }
    if (authorizationExpiry <= firstClock.getTime()) {
      state = "idle";
      return blockedBeforeClaim(
        signerIssue(
          "AUTHORIZATION_EXPIRED",
          "authorization",
          "Exact owner envelope authorization expired before claim."
        ),
        false
      );
    }

    const claimRequest = Object.freeze({
      schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_SCHEMA_VERSION,
      operation: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_OPERATION,
      oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      environment: "bsc-testnet" as const,
      chainId: "97" as const,
      envelopeHash: intent.envelopeHash,
      releaseCommit: intent.releaseCommit,
      runtimeManifestSha256: intent.runtimeManifestSha256,
      reviewerApprovalDigest: intent.reviewerApprovalDigest,
      ownerAuthorizationDigest: intent.ownerAuthorizationDigest,
      serializedUnsignedTransaction: intent.transaction.serializedUnsignedTransaction,
      signingHash: intent.transaction.signingHash,
      gasLimit: intent.transaction.gasLimit,
      gasPriceWei: intent.transaction.gasPriceWei,
      maximumCostWei: intent.transaction.maximumCostWei
    });
    state = "claiming";
    let rawClaim: unknown;
    try {
      rawClaim = await Reflect.apply(dependencies.claimExactInitialization, undefined, [
        claimRequest
      ]);
    } catch {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "CLAIM_OUTCOME_UNKNOWN",
            "claim",
            "Atomic claim outcome is ambiguous; this operation must not be retried."
          ),
          "unknown",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }
    const claim = inspectClaimResult(rawClaim);
    if (claim === null) {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "CLAIM_OUTCOME_UNKNOWN",
            "claim",
            "Malformed atomic claim response makes the durable outcome unknown."
          ),
          "unknown",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }
    if (claim.status === "already_exists") {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "INTENT_ALREADY_CLAIMED",
            "claim",
            `One-shot operation already has durable state '${claim.state}'.`
          ),
          "already_exists",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }

    const recheckRequest = Object.freeze({
      oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      claimId: claim.claimId,
      envelopeHash: intent.envelopeHash,
      releaseCommit: intent.releaseCommit,
      runtimeManifestSha256: intent.runtimeManifestSha256,
      reviewerApprovalDigest: intent.reviewerApprovalDigest,
      ownerAuthorizationDigest: intent.ownerAuthorizationDigest,
      signingHash: intent.transaction.signingHash
    });
    state = "acquiring_post_claim_recheck";
    let rawRecheck: unknown;
    try {
      rawRecheck = await Reflect.apply(dependencies.acquireFreshPostClaimRecheck, undefined, [
        recheckRequest
      ]);
    } catch {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN",
            "recheck",
            "Post-claim RPC recheck outcome is ambiguous; no worker invocation or retry is allowed."
          ),
          "claimed",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }
    const secondClock = captureClock(dependencies.asOf);
    if (secondClock === null) {
      return setTerminal(
        doNotRetry(
          signerIssue("CLOCK_INVALID", "recheck", "Signer clock failed after durable claim."),
          "claimed",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }
    const recheck = validateBscTestnetPtaWbnbPoolFreshRecheckCapability(
      rawRecheck,
      {
        authorizedIntent: intent,
        claimId: claim.claimId
      },
      secondClock
    );
    if (recheck.status !== "valid") {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "POST_CLAIM_RECHECK_INVALID",
            "recheck",
            "Fresh post-claim state does not preserve the exact authorized transaction preconditions.",
            recheck.issue
          ),
          "claimed",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }
    let recheckAuthenticated = false;
    try {
      recheckAuthenticated =
        Reflect.apply(dependencies.authenticateFreshPostClaimRecheck, undefined, [rawRecheck]) ===
        true;
    } catch {
      recheckAuthenticated = false;
    }
    if (!recheckAuthenticated) {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "POST_CLAIM_RECHECK_AUTHENTICATION_FAILED",
            "recheck",
            "Fresh RPC JSON is not an authenticated capability from the fixed dual-provider reader."
          ),
          "claimed",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }

    const workerRequest = buildBscTestnetPtaWbnbPoolSigningWorkerRequest(recheck.intent);
    state = "authorizing_worker";
    let rawWorkerAuthorization: unknown;
    try {
      rawWorkerAuthorization = await Reflect.apply(dependencies.authorizeExactWorker, undefined, [
        workerRequest
      ]);
    } catch {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "WORKER_AUTHORIZATION_OUTCOME_UNKNOWN",
            "worker",
            "Durable worker-authorization outcome is ambiguous; custody must not be opened or retried."
          ),
          "claimed",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }
    if (!workerAuthorizationSucceeded(rawWorkerAuthorization)) {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "WORKER_AUTHORIZATION_OUTCOME_UNKNOWN",
            "worker",
            "Durable worker authorization was not proven; custody remains closed and retry is forbidden."
          ),
          "claimed",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }
    state = "invoking_worker";
    let rawWorkerResponse: unknown;
    try {
      rawWorkerResponse = await Reflect.apply(dependencies.invokeExactSigningWorker, undefined, [
        workerRequest
      ]);
    } catch {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "WORKER_OUTCOME_UNKNOWN",
            "worker",
            "Worker may have produced a signature; no automatic retry is permitted."
          ),
          "claimed",
          "unknown"
        ),
        "terminal_do_not_retry"
      );
    }
    const worker = await validateBscTestnetPtaWbnbPoolSigningWorkerResponse(
      rawWorkerResponse,
      workerRequest
    );
    if (worker.status !== "valid") {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "WORKER_OUTPUT_INVALID",
            "worker",
            "Worker output failed exact legacy RLP, low-S, release, and signer recovery checks.",
            worker.issue
          ),
          "claimed",
          "unverified_worker_output"
        ),
        "terminal_do_not_retry"
      );
    }
    const readbackRequest = Object.freeze({
      schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_CLAIM_SCHEMA_VERSION,
      operation: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_SIGNED_READBACK_OPERATION,
      oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      claimId: claim.claimId,
      envelopeHash: intent.envelopeHash,
      releaseCommit: intent.releaseCommit,
      runtimeManifestSha256: intent.runtimeManifestSha256,
      reviewerApprovalDigest: intent.reviewerApprovalDigest,
      ownerAuthorizationDigest: intent.ownerAuthorizationDigest,
      requestHash: workerRequest.requestHash,
      signingHash: intent.transaction.signingHash,
      serializedUnsignedTransaction: intent.transaction.serializedUnsignedTransaction,
      signedTransaction: worker.signedTransaction,
      transactionHash: worker.transactionHash,
      recoveredSigner: worker.recoveredSigner
    });
    state = "committing";
    let rawReadback: unknown;
    try {
      rawReadback = await Reflect.apply(dependencies.readBackSignedCommit, undefined, [
        readbackRequest
      ]);
    } catch {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "COMMIT_OUTCOME_UNKNOWN",
            "commit",
            "Durable signed-byte readback is ambiguous; raw bytes are withheld."
          ),
          "claimed",
          "validated_commit_unknown"
        ),
        "terminal_do_not_retry"
      );
    }
    if (!signedCommitReadbackSucceeded(rawReadback)) {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "COMMIT_OUTCOME_UNKNOWN",
            "commit",
            "Malformed durable readback does not prove the worker's signed-byte commit."
          ),
          "claimed",
          "validated_commit_unknown"
        ),
        "terminal_do_not_retry"
      );
    }
    return setTerminal(
      Object.freeze({
        status: "signed_committed" as const,
        retryAllowed: false as const,
        durableClaimOutcome: "claimed_and_signed_committed" as const,
        signatureOutcome: "validated_and_committed" as const,
        signedTransaction: worker.signedTransaction,
        transactionHash: worker.transactionHash,
        recoveredSigner: worker.recoveredSigner,
        transactionSubmitted: false as const,
        broadcastAuthorized: false as const,
        issue: null,
        boundary: CORE_BOUNDARY
      }),
      "signed_committed"
    );
  };

  const signOnce = (): Promise<BscTestnetPtaWbnbPoolOneShotSignerResult> => {
    if (terminal !== null) return Promise.resolve(terminal);
    if (active !== null) return active;
    const operation = Promise.resolve()
      .then(run)
      .catch(() => {
        if (state === "idle" || state === "acquiring_authorization") {
          state = "idle";
          return blockedBeforeClaim(
            signerIssue(
              "INTERNAL_STATE_ERROR",
              "authorization",
              "Unexpected pre-claim failure was contained."
            )
          );
        }
        return setTerminal(
          doNotRetry(
            signerIssue(
              "INTERNAL_STATE_ERROR",
              "worker",
              "Unexpected post-claim failure is terminal because the durable outcome may exist."
            ),
            state === "claiming" ? "unknown" : "claimed",
            state === "invoking_worker" || state === "committing" ? "unknown" : "not_attempted"
          ),
          "terminal_do_not_retry"
        );
      })
      .finally(() => {
        if (active === operation) active = null;
      });
    active = operation;
    return operation;
  };

  return Object.freeze({ boundary: CORE_BOUNDARY, getState: () => state, signOnce });
}
