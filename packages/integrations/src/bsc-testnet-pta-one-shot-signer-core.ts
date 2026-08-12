import { isProxy } from "node:util/types";

import type { Hex } from "viem";

import {
  BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
  BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
  BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS
} from "./bsc-testnet-pta-deployment-envelope";
import {
  BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
  buildBscTestnetPtaSigningWorkerRequest,
  validateBscTestnetPtaFreshSigningCapability,
  validateBscTestnetPtaSigningWorkerResponse,
  type BscTestnetPtaSigningWorkerRequest,
  type BscTestnetPtaWorkerProtocolIssue
} from "./bsc-testnet-pta-one-shot-worker-protocol";

export const BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION = 1 as const;
export const BSC_TESTNET_PTA_DURABLE_CLAIM_OPERATION =
  "claim_exact_bsc_testnet_pta_deployment_once" as const;
export const BSC_TESTNET_PTA_DURABLE_COMMIT_OPERATION =
  "commit_exact_bsc_testnet_pta_signed_transaction" as const;

const CORE_BOUNDARY = Object.freeze({
  scope: "exact_bsc_testnet_pta_deployment_only" as const,
  environment: "bsc-testnet" as const,
  chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
  genericSigningApiExposed: false,
  transactionInputAcceptedFromCaller: false,
  privateKeyAcceptedFromCaller: false,
  environmentReadByCore: false,
  secretReadByCore: false,
  rpcReadByCore: false,
  secretUnlockPerformedByCore: false,
  signingPerformedByCore: false,
  broadcastPerformedByCore: false,
  mainnetWritePossible: false,
  durableClaimRequiredBeforeWorker: true,
  ambiguousPostClaimRetryAllowed: false
});

export type BscTestnetPtaOneShotSignerIssueCode =
  | "CONFIGURATION_INVALID"
  | "CLOCK_INVALID"
  | "CAPABILITY_ACQUISITION_FAILED"
  | "CAPABILITY_CONTENT_INVALID"
  | "CAPABILITY_AUTHENTICATION_FAILED"
  | "CLAIM_OUTCOME_UNKNOWN"
  | "INTENT_ALREADY_CLAIMED"
  | "CLAIM_IDENTIFIER_INVALID"
  | "CAPABILITY_EXPIRED_AFTER_CLAIM"
  | "WORKER_OUTCOME_UNKNOWN"
  | "WORKER_OUTPUT_INVALID"
  | "COMMIT_OUTCOME_UNKNOWN"
  | "INTERNAL_STATE_ERROR";

export interface BscTestnetPtaOneShotSignerIssue {
  readonly code: BscTestnetPtaOneShotSignerIssueCode;
  readonly phase: "configuration" | "capability" | "claim" | "worker" | "commit";
  readonly message: string;
  readonly protocolIssue: BscTestnetPtaWorkerProtocolIssue | null;
}

export interface BscTestnetPtaDurableClaimRequest {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_DURABLE_CLAIM_OPERATION;
  readonly oneShotIntentId: typeof BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID;
  readonly environment: "bsc-testnet";
  readonly chainId: typeof BSC_TESTNET_PTA_CHAIN_ID_DECIMAL;
  readonly expectedSigner: typeof BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
  readonly predictedContractAddress: typeof BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS;
  readonly signingHash: Hex;
  readonly sourceEnvelopeHash: Hex;
}

export type BscTestnetPtaDurableClaimResult =
  | Readonly<{ status: "claimed"; claimId: string }>
  | Readonly<{
      status: "already_exists";
      state: "claimed" | "signed_committed" | "unknown";
    }>;

export interface BscTestnetPtaDurableSignedCommitRequest {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_DURABLE_COMMIT_OPERATION;
  readonly oneShotIntentId: typeof BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID;
  readonly claimId: string;
  readonly requestHash: Hex;
  readonly signingHash: Hex;
  readonly signedTransaction: Hex;
  readonly transactionHash: Hex;
  readonly recoveredSigner: typeof BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
}

export type BscTestnetPtaDurableSignedCommitResult = Readonly<{ status: "committed" }>;

/**
 * These ports are privileged server composition points, not caller-controlled
 * transaction parameters. The authority is expected to keep capability object
 * identities in a private WeakSet (or an equivalent module-private brand).
 */
export interface BscTestnetPtaOneShotSignerDependencies {
  readonly asOf: () => Date;
  readonly acquireFreshCapability: () => Promise<unknown>;
  readonly authenticateFreshCapability: (capability: unknown) => boolean;
  readonly claimExactDeployment: (request: BscTestnetPtaDurableClaimRequest) => Promise<unknown>;
  readonly invokeExactSigningWorker: (
    request: BscTestnetPtaSigningWorkerRequest
  ) => Promise<unknown>;
  readonly commitSignedTransaction: (
    request: BscTestnetPtaDurableSignedCommitRequest
  ) => Promise<unknown>;
}

export type BscTestnetPtaOneShotSignerResult =
  | Readonly<{
      status: "blocked_before_claim";
      retryAllowed: boolean;
      durableClaimOutcome: "not_attempted";
      signatureOutcome: "not_attempted";
      signedTransaction: null;
      transactionHash: null;
      issue: BscTestnetPtaOneShotSignerIssue;
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
      issue: BscTestnetPtaOneShotSignerIssue;
      boundary: typeof CORE_BOUNDARY;
    }>
  | Readonly<{
      status: "signed_committed";
      retryAllowed: false;
      durableClaimOutcome: "claimed_and_signed_committed";
      signatureOutcome: "validated_and_committed";
      signedTransaction: Hex;
      transactionHash: Hex;
      recoveredSigner: typeof BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
      issue: null;
      transactionSubmitted: false;
      broadcastAuthorized: false;
      boundary: typeof CORE_BOUNDARY;
    }>;

export type BscTestnetPtaOneShotSignerState =
  | "idle"
  | "acquiring_capability"
  | "claiming"
  | "invoking_worker"
  | "committing"
  | "terminal_do_not_retry"
  | "signed_committed";

export interface BscTestnetPtaOneShotSignerCore {
  readonly boundary: typeof CORE_BOUNDARY;
  readonly getState: () => BscTestnetPtaOneShotSignerState;
  readonly signOnce: () => Promise<BscTestnetPtaOneShotSignerResult>;
}

type DataRecord = Readonly<Record<string, unknown>>;

const DEPENDENCY_KEYS = [
  "acquireFreshCapability",
  "asOf",
  "authenticateFreshCapability",
  "claimExactDeployment",
  "commitSignedTransaction",
  "invokeExactSigningWorker"
] as const;

function inspectDataRecord(value: unknown, expectedKeys: readonly string[]): DataRecord | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return null;
    const actual = (ownKeys as string[]).sort();
    const expected = [...expectedKeys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function isPlainCallable(value: unknown): value is (...arguments_: unknown[]) => unknown {
  return typeof value === "function" && !isProxy(value);
}

function parseDependencies(input: unknown): BscTestnetPtaOneShotSignerDependencies | null {
  const inspected = inspectDataRecord(input, DEPENDENCY_KEYS);
  if (
    inspected === null ||
    !isPlainCallable(inspected.asOf) ||
    !isPlainCallable(inspected.acquireFreshCapability) ||
    !isPlainCallable(inspected.authenticateFreshCapability) ||
    !isPlainCallable(inspected.claimExactDeployment) ||
    !isPlainCallable(inspected.invokeExactSigningWorker) ||
    !isPlainCallable(inspected.commitSignedTransaction)
  ) {
    return null;
  }
  return Object.freeze({
    asOf: inspected.asOf as () => Date,
    acquireFreshCapability: inspected.acquireFreshCapability as () => Promise<unknown>,
    authenticateFreshCapability: inspected.authenticateFreshCapability as (
      capability: unknown
    ) => boolean,
    claimExactDeployment: inspected.claimExactDeployment as (
      request: BscTestnetPtaDurableClaimRequest
    ) => Promise<unknown>,
    invokeExactSigningWorker: inspected.invokeExactSigningWorker as (
      request: BscTestnetPtaSigningWorkerRequest
    ) => Promise<unknown>,
    commitSignedTransaction: inspected.commitSignedTransaction as (
      request: BscTestnetPtaDurableSignedCommitRequest
    ) => Promise<unknown>
  });
}

function signerIssue(
  code: BscTestnetPtaOneShotSignerIssueCode,
  phase: BscTestnetPtaOneShotSignerIssue["phase"],
  message: string,
  protocolIssue: BscTestnetPtaWorkerProtocolIssue | null = null
): BscTestnetPtaOneShotSignerIssue {
  return Object.freeze({ code, phase, message, protocolIssue });
}

function blockedBeforeClaim(
  problem: BscTestnetPtaOneShotSignerIssue,
  retryAllowed = true
): BscTestnetPtaOneShotSignerResult {
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
  problem: BscTestnetPtaOneShotSignerIssue,
  durableClaimOutcome: "unknown" | "already_exists" | "claimed",
  signatureOutcome:
    "not_attempted" | "unknown" | "unverified_worker_output" | "validated_commit_unknown"
): BscTestnetPtaOneShotSignerResult {
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

function inspectClaimResult(input: unknown): BscTestnetPtaDurableClaimResult | null {
  const claimed = inspectDataRecord(input, ["claimId", "status"]);
  if (claimed !== null && claimed.status === "claimed" && typeof claimed.claimId === "string") {
    return Object.freeze({ status: "claimed" as const, claimId: claimed.claimId });
  }
  const existing = inspectDataRecord(input, ["state", "status"]);
  if (
    existing !== null &&
    existing.status === "already_exists" &&
    (existing.state === "claimed" ||
      existing.state === "signed_committed" ||
      existing.state === "unknown")
  ) {
    return Object.freeze({ status: "already_exists" as const, state: existing.state });
  }
  return null;
}

function inspectCommitResult(input: unknown): BscTestnetPtaDurableSignedCommitResult | null {
  const inspected = inspectDataRecord(input, ["status"]);
  return inspected !== null && inspected.status === "committed"
    ? Object.freeze({ status: "committed" as const })
    : null;
}

function captureClock(asOf: () => Date): Date | null {
  try {
    const value = Reflect.apply(asOf, undefined, []);
    if (
      isProxy(value) ||
      !(value instanceof Date) ||
      Object.getPrototypeOf(value) !== Date.prototype
    ) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
  } catch {
    return null;
  }
}

function configurationInvalidCore(): BscTestnetPtaOneShotSignerCore {
  const result = blockedBeforeClaim(
    signerIssue(
      "CONFIGURATION_INVALID",
      "configuration",
      "Signer dependencies must be exact own callable ports without proxies or accessors."
    ),
    false
  );
  return Object.freeze({
    boundary: CORE_BOUNDARY,
    getState: () => "terminal_do_not_retry" as const,
    signOnce: () => Promise.resolve(result)
  });
}

/**
 * Creates a no-RPC, no-secret orchestration core for one exact chain-97 PTA
 * signature. No transaction arguments are accepted by signOnce. A durable claim
 * is required before the isolated worker is invoked, and every ambiguous outcome
 * after that point is terminal and cannot be retried by this instance.
 */
export function createBscTestnetPtaOneShotSignerCore(
  untrustedDependencies: unknown
): BscTestnetPtaOneShotSignerCore {
  const dependencies = parseDependencies(untrustedDependencies);
  if (dependencies === null) return configurationInvalidCore();

  let state: BscTestnetPtaOneShotSignerState = "idle";
  let active: Promise<BscTestnetPtaOneShotSignerResult> | null = null;
  let terminal: BscTestnetPtaOneShotSignerResult | null = null;

  const setTerminal = (
    result: BscTestnetPtaOneShotSignerResult,
    terminalState: "terminal_do_not_retry" | "signed_committed"
  ): BscTestnetPtaOneShotSignerResult => {
    terminal = result;
    state = terminalState;
    return result;
  };

  const run = async (): Promise<BscTestnetPtaOneShotSignerResult> => {
    state = "acquiring_capability";
    let capability: unknown;
    try {
      capability = await Reflect.apply(dependencies.acquireFreshCapability, undefined, []);
    } catch {
      state = "idle";
      return blockedBeforeClaim(
        signerIssue(
          "CAPABILITY_ACQUISITION_FAILED",
          "capability",
          "Fresh signer-side observation capability could not be acquired before any claim."
        )
      );
    }
    const firstClock = captureClock(dependencies.asOf);
    if (firstClock === null) {
      state = "idle";
      return blockedBeforeClaim(
        signerIssue("CLOCK_INVALID", "capability", "Signer clock failed before durable claim.")
      );
    }
    const validation = validateBscTestnetPtaFreshSigningCapability(capability, firstClock);
    if (validation.status !== "valid") {
      state = "idle";
      return blockedBeforeClaim(
        signerIssue(
          "CAPABILITY_CONTENT_INVALID",
          "capability",
          "Fresh capability content failed exact PTA validation before durable claim.",
          validation.issue
        )
      );
    }
    let authenticated = false;
    try {
      authenticated =
        Reflect.apply(dependencies.authenticateFreshCapability, undefined, [capability]) === true;
    } catch {
      authenticated = false;
    }
    if (!authenticated) {
      state = "idle";
      return blockedBeforeClaim(
        signerIssue(
          "CAPABILITY_AUTHENTICATION_FAILED",
          "capability",
          "Capability object identity was not authenticated by the privileged fresh-observation authority."
        )
      );
    }

    const claimRequest = Object.freeze({
      schemaVersion: BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION,
      operation: BSC_TESTNET_PTA_DURABLE_CLAIM_OPERATION,
      oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
      environment: "bsc-testnet" as const,
      chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
      expectedSigner: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
      predictedContractAddress: BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
      signingHash: validation.intent.signingHash,
      sourceEnvelopeHash: validation.intent.sourceEnvelopeHash
    });
    state = "claiming";
    let untrustedClaimResult: unknown;
    try {
      untrustedClaimResult = await Reflect.apply(dependencies.claimExactDeployment, undefined, [
        claimRequest
      ]);
    } catch {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "CLAIM_OUTCOME_UNKNOWN",
            "claim",
            "Durable claim call had an ambiguous outcome; exact intent must not be retried."
          ),
          "unknown",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }
    const claimResult = inspectClaimResult(untrustedClaimResult);
    if (claimResult === null) {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "CLAIM_OUTCOME_UNKNOWN",
            "claim",
            "Durable claim response was malformed, so claim outcome is unknown and non-retryable."
          ),
          "unknown",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }
    if (claimResult.status === "already_exists") {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "INTENT_ALREADY_CLAIMED",
            "claim",
            `The one-shot intent already has durable state '${claimResult.state}'.`
          ),
          "already_exists",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }

    const workerRequest = buildBscTestnetPtaSigningWorkerRequest(
      validation.intent,
      claimResult.claimId
    );
    if ("code" in workerRequest) {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "CLAIM_IDENTIFIER_INVALID",
            "claim",
            "Claim was created but its identifier cannot safely cross the worker protocol.",
            workerRequest
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
          signerIssue(
            "CLOCK_INVALID",
            "worker",
            "Signer clock failed after durable claim; worker was not invoked."
          ),
          "claimed",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }
    const revalidation = validateBscTestnetPtaFreshSigningCapability(capability, secondClock);
    if (revalidation.status !== "valid") {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "CAPABILITY_EXPIRED_AFTER_CLAIM",
            "worker",
            "Capability became stale or expired after claim; worker was not invoked and intent remains claimed.",
            revalidation.issue
          ),
          "claimed",
          "not_attempted"
        ),
        "terminal_do_not_retry"
      );
    }

    state = "invoking_worker";
    let untrustedWorkerResponse: unknown;
    try {
      untrustedWorkerResponse = await Reflect.apply(
        dependencies.invokeExactSigningWorker,
        undefined,
        [workerRequest]
      );
    } catch {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "WORKER_OUTCOME_UNKNOWN",
            "worker",
            "Signing worker outcome is ambiguous after claim; no automatic retry is permitted."
          ),
          "claimed",
          "unknown"
        ),
        "terminal_do_not_retry"
      );
    }
    const workerValidation = await validateBscTestnetPtaSigningWorkerResponse(
      untrustedWorkerResponse,
      workerRequest
    );
    if (workerValidation.status !== "valid") {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "WORKER_OUTPUT_INVALID",
            "worker",
            "Worker output did not recover the exact PTA signer and transaction; claim is non-retryable.",
            workerValidation.issue
          ),
          "claimed",
          "unverified_worker_output"
        ),
        "terminal_do_not_retry"
      );
    }

    const commitRequest = Object.freeze({
      schemaVersion: BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION,
      operation: BSC_TESTNET_PTA_DURABLE_COMMIT_OPERATION,
      oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
      claimId: workerRequest.claimId,
      requestHash: workerRequest.requestHash,
      signingHash: workerRequest.transaction.signingHash,
      signedTransaction: workerValidation.signedTransaction,
      transactionHash: workerValidation.transactionHash,
      recoveredSigner: workerValidation.recoveredSigner
    });
    state = "committing";
    let untrustedCommitResult: unknown;
    try {
      untrustedCommitResult = await Reflect.apply(dependencies.commitSignedTransaction, undefined, [
        commitRequest
      ]);
    } catch {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "COMMIT_OUTCOME_UNKNOWN",
            "commit",
            "Signed-transaction commit outcome is ambiguous; raw transaction is withheld and must not be re-signed."
          ),
          "claimed",
          "validated_commit_unknown"
        ),
        "terminal_do_not_retry"
      );
    }
    if (inspectCommitResult(untrustedCommitResult) === null) {
      return setTerminal(
        doNotRetry(
          signerIssue(
            "COMMIT_OUTCOME_UNKNOWN",
            "commit",
            "Signed-transaction commit response was malformed; raw transaction is withheld and must not be re-signed."
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
        signedTransaction: workerValidation.signedTransaction,
        transactionHash: workerValidation.transactionHash,
        recoveredSigner: workerValidation.recoveredSigner,
        issue: null,
        transactionSubmitted: false as const,
        broadcastAuthorized: false as const,
        boundary: CORE_BOUNDARY
      }),
      "signed_committed"
    );
  };

  const signOnce = (): Promise<BscTestnetPtaOneShotSignerResult> => {
    if (terminal !== null) return Promise.resolve(terminal);
    if (active !== null) return active;
    const operation = Promise.resolve()
      .then(run)
      .catch(() => {
        if (state === "idle" || state === "acquiring_capability") {
          state = "idle";
          return blockedBeforeClaim(
            signerIssue(
              "INTERNAL_STATE_ERROR",
              "capability",
              "Unexpected signer-core failure occurred before any durable claim."
            )
          );
        }
        const result = doNotRetry(
          signerIssue(
            "INTERNAL_STATE_ERROR",
            "worker",
            "Unexpected signer-core failure was treated as non-retryable because claim state may be unknown."
          ),
          state === "claiming" ? "unknown" : "claimed",
          "unknown"
        );
        return setTerminal(result, "terminal_do_not_retry");
      })
      .finally(() => {
        if (active === operation) active = null;
      });
    active = operation;
    return operation;
  };

  return Object.freeze({
    boundary: CORE_BOUNDARY,
    getState: () => state,
    signOnce
  });
}
