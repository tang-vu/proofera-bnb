import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isProxy } from "node:util/types";

import { keccak256, stringToHex, type Hex } from "viem";

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_POST_CONFIRMATION_PRECLAIM_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_OWNER_CONFIRMATION_WINDOW_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_MINIMUM_REMAINING_BEFORE_CLAIM_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_POST_RECHECK_EXECUTION_RESERVE_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96,
  BSC_TESTNET_WBNB_ADDRESS
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN,
  type BscTestnetPtaWbnbPoolOwnerSignatureAndBroadcastAuthorization
} from "./bsc-testnet-pta-wbnb-pool-authorization.server";
import type { BscTestnetPtaWbnbPoolOneShotPreparedDescriptor } from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
  BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_REQUEST_HASH_DOMAIN,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction,
  deriveBscTestnetPtaWbnbPoolRecoveryAttemptId,
  validateBscTestnetPtaWbnbPoolSigningWorkerRequest,
  type BscTestnetPtaWbnbPoolAuthorizedSigningIntent,
  type BscTestnetPtaWbnbPoolRecoveryAttemptBinding,
  type BscTestnetPtaWbnbPoolSigningWorkerRequest
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  authenticateBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse,
  consumeBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse,
  type BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding,
  type BscTestnetPtaWbnbPoolRuntimeReviewInstantiation,
  type BscTestnetPtaWbnbPoolRuntimeReviewRecoveryBinding
} from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";
import type { BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust } from "./bsc-testnet-pta-wbnb-pool-signing-worker";

export const BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG =
  "I_EXPLICITLY_AUTHORIZE_ONE_EXACT_PTA_WBNB_POOL_INITIALIZATION_ON_BSC_TESTNET_CHAIN_97" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_TEXT_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-owner-transaction-authorization:v9" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_OWNER_CONFIRMATION_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-owner-exact-byte-confirmation:v9" as const;

const BROADCAST_OPERATION =
  "consume_exact_bsc_testnet_pta_wbnb_pool_broadcast_authorization_after_durable_start" as const;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const RELEASE = /^[0-9a-f]{40}$/u;
const TREE = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{0,95}$/u;
const SIGNED_TRANSACTION = /^0x(?:[0-9a-f]{2})+$/u;
const MAXIMUM_OWNER_TEXT_BYTES = 6_144;
const MAXIMUM_OWNER_CONFIRMATION_BYTES = 1_024;
const MAXIMUM_SIGNED_TRANSACTION_BYTES = 2_048;
const OWNER_CONFIRMATION_WINDOW_MILLISECONDS =
  BSC_TESTNET_PTA_WBNB_POOL_OWNER_CONFIRMATION_WINDOW_SECONDS * 1_000;
const EXECUTION_AUTHORITY_LIFETIME_MILLISECONDS =
  BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS * 1_000;
const FRESH_RECHECK_MAX_AGE_MILLISECONDS =
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS * 1_000;
const ZERO_32 = `0x${"00".repeat(32)}`;

const DESCRIPTOR_KEYS = [
  "authorizationReceiptCreated",
  "envelopeExpiresAt",
  "envelopeHash",
  "envelopeObservedAt",
  "executionAuthorized",
  "exactBinding",
  "journalClaimCreated",
  "operationKey",
  "requirements",
  "signatureCreated",
  "signerInvoked",
  "signingAuthorized",
  "signingReady",
  "status",
  "transactionSubmitted"
] as const;
const EXACT_BINDING_KEYS = [
  "chainId",
  "data",
  "dataKeccak256",
  "from",
  "gasLimit",
  "gasPriceWei",
  "nonce",
  "selector",
  "to",
  "valueWei"
] as const;
const REQUIREMENT_KEYS = [
  "ambiguousClaimOrSigningOutcomeIsNonRetryableUntilReconciled",
  "durableAtomicClaimRequiredBeforeCustodyAccess",
  "externalExactAuthorizationRequired",
  "freshPendingNonceAndPoolRecheckRequiredAfterClaim",
  "journalMustPersistSignedBytesBeforeSubmission",
  "postSubmissionCanonicalReceiptReconciliationRequired"
] as const;
const INSTANTIATION_KEYS = [
  "automatedPolicyApplication",
  "envelopeHash",
  "executionEnvelopeObservedAt",
  "expiresAt",
  "instantiatedAt",
  "instantiationDigest",
  "kind",
  "operationKey",
  "policyDigest",
  "policyExpiresAt",
  "policyReviewedAt",
  "releaseCommit",
  "releaseTree",
  "reviewedSubjectSha256",
  "recovery",
  "reviewerInspectedExactEnvelope",
  "reviewerTaskLabels",
  "reviewIsNotTransactionAuthorization",
  "runtimeManifestSha256",
  "schemaVersion"
] as const;
const COMMAND_KEYS = [
  "ceremonyNonce",
  "challengeIssuedAt",
  "executionFlag",
  "kind",
  "ownerAuthorizationText",
  "ownerAuthorizationTextSha256",
  "preparationDigest",
  "runtimeReviewInstantiation",
  "recovery",
  "schemaVersion"
] as const;
const RECOVERY_KEYS = [
  "attemptId",
  "generation",
  "predecessorTerminalRawSha256",
  "predecessorState"
] as const;
const RUNTIME_RECOVERY_KEYS = ["generation", "predecessorTerminal"] as const;
const PREDECESSOR_TERMINAL_KEYS = [
  "generation",
  "inheritedPredecessorTerminalRawSha256",
  "issueCode",
  "outcomeDigest",
  "phase",
  "predecessorAttemptId",
  "predecessorClaimRawSha256",
  "predecessorEnvelopeHash",
  "predecessorTerminalRawSha256",
  "recordedAt",
  "signatureOutcome",
  "status",
  "submissionJournalState",
  "submissionOutcome",
  "workerAuthorizationOutcome",
  "workerStartOutcome"
] as const;
const OWNER_BODY_KEYS = [
  "authorizationTextSha256",
  "authorizedAt",
  "broadcastPolicy",
  "ceremonyNonce",
  "decision",
  "envelopeHash",
  "expiresAt",
  "gasLimit",
  "gasPriceWei",
  "kind",
  "liquidityActionAuthorized",
  "maximumCostWei",
  "operationKey",
  "ownerIdentity",
  "recovery",
  "releaseCommit",
  "releaseTree",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "schemaVersion",
  "signingHash"
] as const;
const WORKER_REQUEST_KEYS = [
  "authenticatedAt",
  "chainId",
  "claimId",
  "environment",
  "expiresAt",
  "journalClaimToken",
  "oneShotIntentId",
  "operation",
  "operationKey",
  "ownerAuthorizationDigest",
  "recovery",
  "releaseCommit",
  "requestHash",
  "requestHashDomain",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "schemaVersion",
  "transaction"
] as const;
const WORKER_TRANSACTION_KEYS = [
  "data",
  "eip155ReplayProtection",
  "from",
  "gasLimit",
  "gasPriceWei",
  "maximumCostWei",
  "nonce",
  "serializedUnsignedTransaction",
  "signingHash",
  "sourceEnvelopeHash",
  "to",
  "type",
  "valueWei"
] as const;
const BROADCAST_REQUEST_KEYS = [
  "authenticatedAt",
  "claimId",
  "envelopeHash",
  "expiresAt",
  "operation",
  "operationKey",
  "ownerAuthorizationDigest",
  "recovery",
  "releaseCommit",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "schemaVersion",
  "signedTransaction",
  "signedTransactionKeccak256",
  "signingHash",
  "submissionStartedDigest",
  "terminalPreSubmissionDigest",
  "terminalPreSubmissionObservedAt",
  "transactionHash"
] as const;

type DataRecord = Readonly<Record<string, unknown>>;
type ConfirmedOwnerCeremonyCommandRecord = Readonly<{
  descriptor: BscTestnetPtaWbnbPoolOneShotPreparedDescriptor;
  instantiation: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation;
  confirmedAt: string;
  executionExpiresAt: string;
  preparationDigest: Hex;
  recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
}>;
const confirmedOwnerCeremonyCommands = new WeakMap<object, ConfirmedOwnerCeremonyCommandRecord>();

export interface BscTestnetPtaWbnbPoolProductionExecutionCommand {
  readonly schemaVersion: 9;
  readonly kind: "execute_exact_bsc_testnet_pta_wbnb_pool_recovery_generation_6_once_v9";
  readonly executionFlag: typeof BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG;
  readonly runtimeReviewInstantiation: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation;
  readonly challengeIssuedAt: string;
  readonly recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
  readonly ceremonyNonce: Hex;
  readonly ownerAuthorizationText: string;
  readonly ownerAuthorizationTextSha256: Hex;
  readonly preparationDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolProductionAuthorityDependencies {
  readonly now: () => Date;
  readonly releaseTrust: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust;
  readonly releaseTree: string;
  readonly authenticateLocalCustodyPathAclCapability: (capability: unknown) => boolean;
}

const AUTHORITY_BOUNDARY = Object.freeze({
  environment: "bsc-testnet" as const,
  chainId: "97" as const,
  operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  authorityModel: "windows_current_user_fixed_custody_path_acl_object_capability" as const,
  custodyKeyAddressVerifiedBeforeDurableClaim: false as const,
  custodyUnlockVerifiedBeforeDurableClaim: false as const,
  reviewModel: "owner_designated_release_policy_private_runtime_instantiation" as const,
  cryptographicReviewerIdentityAvailable: false as const,
  ownerMustAcknowledgeExactRuntimeInstantiationDigest: true as const,
  automatedPolicyApplication: true as const,
  reviewerInspectedExactEnvelope: false as const,
  reviewAloneAuthorizesTransaction: false as const,
  chatMessageAuthorizesTransaction: false as const,
  /** Enforced by the native production bridge; the dependency-injected core is not TTY proof. */
  exactBoundedTtyAuthorizationRequired: true as const,
  exactFreshEnvelopeRequired: true as const,
  exactReleaseTreeRequired: true as const,
  cleanPublishedReleaseRequired: true as const,
  genericTransactionAuthorizationPossible: false as const,
  mainnetAuthorizationPossible: false as const
});

export type BscTestnetPtaWbnbPoolProductionAuthorityResult =
  | Readonly<{
      status: "authorized";
      intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
      executionCapability: object;
      /** Private runtime-policy instantiation digest; not a reviewer signature or identity proof. */
      reviewDecisionDigest: Hex;
      ownerAuthorizationDigest: Hex;
      issue: null;
      boundary: typeof AUTHORITY_BOUNDARY;
    }>
  | Readonly<{
      status: "blocked";
      intent: null;
      executionCapability: null;
      reviewDecisionDigest: null;
      ownerAuthorizationDigest: null;
      issue: Readonly<{ code: string; path: string; message: string }>;
      boundary: typeof AUTHORITY_BOUNDARY;
    }>;

export interface BscTestnetPtaWbnbPoolProductionAuthorityIssuer {
  readonly boundary: typeof AUTHORITY_BOUNDARY;
  readonly authorize: (
    descriptor: unknown,
    command: unknown,
    localCustodyPathAclCapability: unknown
  ) => BscTestnetPtaWbnbPoolProductionAuthorityResult;
  readonly authenticateAuthorizedIntent: (intent: unknown) => boolean;
  readonly authenticateExecutionCapability: (capability: unknown) => boolean;
  readonly reserveExecutionCapabilityForWorker: (capability: unknown) => boolean;
  readonly consumeExecutionCapabilityAfterDurableStart: (
    capability: unknown,
    request: unknown
  ) => boolean;
  /** Terminally consumes the separate one-send authorization after durable submission_started. */
  readonly consumeExactBroadcastAuthorizationAfterDurableStart: (
    capability: unknown,
    request: unknown
  ) => boolean;
}

function inspectRecord(input: unknown, expectedKeys: readonly string[]): DataRecord | null {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      isProxy(input) ||
      !Object.isFrozen(input)
    ) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) return null;
    const actual = (keys as string[]).sort();
    const expected = [...expectedKeys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
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

function inspectLabels(input: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(input) || isProxy(input) || !Object.isFrozen(input)) return null;
    const keys = Reflect.ownKeys(input);
    if (
      input.length < 1 ||
      input.length > 8 ||
      keys.some((key) => typeof key === "symbol") ||
      keys.length !== input.length + 1 ||
      !keys.includes("length")
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const labels: string[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true ||
        typeof descriptor.value !== "string" ||
        !IDENTITY.test(descriptor.value)
      ) {
        return null;
      }
      labels.push(descriptor.value);
    }
    return new Set(labels).size === labels.length ? Object.freeze(labels) : null;
  } catch {
    return null;
  }
}

function exactHex32(input: unknown): input is Hex {
  return (
    typeof input === "string" && input.length === 66 && BYTES32.test(input) && input !== ZERO_32
  );
}

function exactUtc(input: unknown): Readonly<{ iso: string; milliseconds: number }> | null {
  if (typeof input !== "string" || input.length !== 24 || !UTC.test(input)) return null;
  const milliseconds = Date.parse(input);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === input
    ? Object.freeze({ iso: input, milliseconds })
    : null;
}

function parseRuntimeRecovery(
  input: unknown
): BscTestnetPtaWbnbPoolRuntimeReviewRecoveryBinding | null {
  const recovery = inspectRecord(input, RUNTIME_RECOVERY_KEYS);
  const terminal =
    recovery === null
      ? null
      : inspectRecord(recovery.predecessorTerminal, PREDECESSOR_TERMINAL_KEYS);
  const recordedAt = terminal === null ? null : exactUtc(terminal.recordedAt);
  if (
    recovery === null ||
    terminal === null ||
    recovery.generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION ||
    terminal.status !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE ||
    terminal.generation !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION ||
    terminal.predecessorClaimRawSha256 !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256 ||
    terminal.predecessorTerminalRawSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256 ||
    !exactHex32(terminal.predecessorEnvelopeHash) ||
    terminal.inheritedPredecessorTerminalRawSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256 ||
    !exactHex32(terminal.predecessorAttemptId) ||
    terminal.phase !== "post_claim_recheck" ||
    terminal.issueCode !== "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" ||
    terminal.outcomeDigest !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_FAILED_BEFORE_WORKER_OUTCOME_DIGEST ||
    terminal.workerAuthorizationOutcome !== "not_attempted" ||
    terminal.workerStartOutcome !== "not_attempted" ||
    terminal.signatureOutcome !== "not_attempted" ||
    terminal.submissionOutcome !== "not_attempted" ||
    terminal.submissionJournalState !== "exact_empty" ||
    recordedAt === null
  ) {
    return null;
  }
  return Object.freeze({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorTerminal: Object.freeze({
      status: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
      generation: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION,
      predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256,
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256,
      predecessorEnvelopeHash: terminal.predecessorEnvelopeHash,
      inheritedPredecessorTerminalRawSha256:
        BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256,
      predecessorAttemptId: terminal.predecessorAttemptId,
      phase: "post_claim_recheck" as const,
      issueCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" as const,
      outcomeDigest: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
      workerAuthorizationOutcome: "not_attempted" as const,
      workerStartOutcome: "not_attempted" as const,
      signatureOutcome: "not_attempted" as const,
      submissionOutcome: "not_attempted" as const,
      submissionJournalState: "exact_empty" as const,
      recordedAt: recordedAt.iso
    })
  });
}

function parseRecoveryAttempt(input: unknown): BscTestnetPtaWbnbPoolRecoveryAttemptBinding | null {
  const recovery = inspectRecord(input, RECOVERY_KEYS);
  if (
    recovery === null ||
    recovery.generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION ||
    recovery.predecessorState !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE ||
    !exactHex32(recovery.predecessorTerminalRawSha256) ||
    !exactHex32(recovery.attemptId)
  ) {
    return null;
  }
  return Object.freeze({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorState: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
    predecessorTerminalRawSha256: recovery.predecessorTerminalRawSha256,
    attemptId: recovery.attemptId
  });
}

function sameRecoveryAttempt(
  left: BscTestnetPtaWbnbPoolRecoveryAttemptBinding,
  right: BscTestnetPtaWbnbPoolRecoveryAttemptBinding
): boolean {
  return RECOVERY_KEYS.every((key) => left[key] === right[key]);
}

function captureNow(clock: () => Date): number | null {
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
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? milliseconds : null;
  } catch {
    return null;
  }
}

function canonicalDigest(domain: string, body: DataRecord, keys: readonly string[]): Hex {
  const canonical: Record<string, unknown> = {};
  for (const key of [...keys].sort()) canonical[key] = body[key];
  return keccak256(stringToHex(`${domain}\u0000${JSON.stringify(canonical)}`));
}

function sha256Text(value: string): Hex {
  return `0x${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function validReleaseTrust(
  input: unknown
): input is BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust {
  const release = inspectRecord(input, [
    "cleanPublishedHead",
    "originReference",
    "releaseCommit",
    "runtimeManifestSha256",
    "schemaVersion",
    "workerSourceSha256"
  ]);
  return (
    release !== null &&
    release.schemaVersion === 1 &&
    typeof release.releaseCommit === "string" &&
    RELEASE.test(release.releaseCommit) &&
    release.releaseCommit !== "0".repeat(40) &&
    release.originReference === "refs/remotes/origin/main" &&
    release.cleanPublishedHead === true &&
    exactHex32(release.workerSourceSha256) &&
    exactHex32(release.runtimeManifestSha256)
  );
}

function parseDescriptor(input: unknown): BscTestnetPtaWbnbPoolOneShotPreparedDescriptor | null {
  const descriptor = inspectRecord(input, DESCRIPTOR_KEYS);
  const binding =
    descriptor === null ? null : inspectRecord(descriptor.exactBinding, EXACT_BINDING_KEYS);
  const requirements =
    descriptor === null ? null : inspectRecord(descriptor.requirements, REQUIREMENT_KEYS);
  const expiresAt = descriptor === null ? null : exactUtc(descriptor.envelopeExpiresAt);
  const observedAt = descriptor === null ? null : exactUtc(descriptor.envelopeObservedAt);
  if (
    descriptor === null ||
    binding === null ||
    requirements === null ||
    expiresAt === null ||
    observedAt === null ||
    expiresAt.milliseconds - observedAt.milliseconds !==
      BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS * 1_000 ||
    !exactHex32(descriptor.envelopeHash) ||
    descriptor.status !== "prepared_non_authorizing" ||
    descriptor.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    descriptor.signingReady !== false ||
    descriptor.signingAuthorized !== false ||
    descriptor.executionAuthorized !== false ||
    descriptor.authorizationReceiptCreated !== false ||
    descriptor.journalClaimCreated !== false ||
    descriptor.signerInvoked !== false ||
    descriptor.signatureCreated !== false ||
    descriptor.transactionSubmitted !== false ||
    binding.chainId !== BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID ||
    binding.from !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    binding.nonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE ||
    binding.to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
    binding.selector !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR ||
    binding.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
    binding.dataKeccak256 !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256 ||
    binding.valueWei !== 0n ||
    typeof binding.gasLimit !== "bigint" ||
    binding.gasLimit <= 0n ||
    binding.gasLimit > BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT ||
    typeof binding.gasPriceWei !== "bigint" ||
    binding.gasPriceWei <= 0n ||
    binding.gasPriceWei > BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI ||
    binding.gasLimit * binding.gasPriceWei > BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI ||
    REQUIREMENT_KEYS.some((key) => requirements[key] !== true)
  ) {
    return null;
  }
  return input as BscTestnetPtaWbnbPoolOneShotPreparedDescriptor;
}

function parseInstantiation(
  input: unknown,
  descriptor: BscTestnetPtaWbnbPoolOneShotPreparedDescriptor,
  release: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust,
  releaseTree: string,
  now: number
): BscTestnetPtaWbnbPoolRuntimeReviewInstantiation | null {
  const value = inspectRecord(input, INSTANTIATION_KEYS);
  const labels = value === null ? null : inspectLabels(value.reviewerTaskLabels);
  const recovery = value === null ? null : parseRuntimeRecovery(value.recovery);
  const policyReviewedAt = value === null ? null : exactUtc(value.policyReviewedAt);
  const policyExpiresAt = value === null ? null : exactUtc(value.policyExpiresAt);
  const instantiatedAt = value === null ? null : exactUtc(value.instantiatedAt);
  const expiresAt = value === null ? null : exactUtc(value.expiresAt);
  const executionEnvelopeObservedAt =
    value === null ? null : exactUtc(value.executionEnvelopeObservedAt);
  const predecessorRecordedAt =
    recovery === null ? null : exactUtc(recovery.predecessorTerminal.recordedAt);
  if (
    value === null ||
    labels === null ||
    recovery === null ||
    policyReviewedAt === null ||
    policyExpiresAt === null ||
    instantiatedAt === null ||
    expiresAt === null ||
    executionEnvelopeObservedAt === null ||
    predecessorRecordedAt === null ||
    value.schemaVersion !== 6 ||
    value.kind !== "automated_release_policy_recovery_envelope_instantiation_v6" ||
    value.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    !exactHex32(value.policyDigest) ||
    value.releaseCommit !== release.releaseCommit ||
    value.releaseTree !== releaseTree ||
    value.runtimeManifestSha256 !== release.runtimeManifestSha256 ||
    !exactHex32(value.reviewedSubjectSha256) ||
    value.envelopeHash !== descriptor.envelopeHash ||
    value.executionEnvelopeObservedAt !== descriptor.envelopeObservedAt ||
    executionEnvelopeObservedAt.milliseconds <= predecessorRecordedAt.milliseconds ||
    executionEnvelopeObservedAt.milliseconds > instantiatedAt.milliseconds ||
    value.envelopeHash === recovery.predecessorTerminal.predecessorEnvelopeHash ||
    value.expiresAt !== descriptor.envelopeExpiresAt ||
    value.automatedPolicyApplication !== true ||
    value.reviewerInspectedExactEnvelope !== false ||
    value.reviewIsNotTransactionAuthorization !== true ||
    !exactHex32(value.instantiationDigest) ||
    policyReviewedAt.milliseconds > instantiatedAt.milliseconds ||
    instantiatedAt.milliseconds > now ||
    instantiatedAt.milliseconds >= expiresAt.milliseconds ||
    policyReviewedAt.milliseconds >= policyExpiresAt.milliseconds ||
    now >= expiresAt.milliseconds ||
    now >= policyExpiresAt.milliseconds ||
    expiresAt.milliseconds > policyExpiresAt.milliseconds
  ) {
    return null;
  }
  return input as BscTestnetPtaWbnbPoolRuntimeReviewInstantiation;
}

function instantiationBinding(
  instantiation: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation
): BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding {
  return Object.freeze({
    releaseCommit: instantiation.releaseCommit,
    releaseTree: instantiation.releaseTree,
    runtimeManifestSha256: instantiation.runtimeManifestSha256,
    policyDigest: instantiation.policyDigest,
    reviewedSubjectSha256: instantiation.reviewedSubjectSha256,
    recovery: instantiation.recovery,
    envelopeHash: instantiation.envelopeHash,
    executionEnvelopeObservedAt: instantiation.executionEnvelopeObservedAt,
    expiresAt: instantiation.expiresAt,
    instantiationDigest: instantiation.instantiationDigest
  });
}

function authenticateInstantiation(
  original: unknown,
  parsed: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation
): boolean {
  try {
    return (
      authenticateBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse(
        original,
        instantiationBinding(parsed)
      ) === true
    );
  } catch {
    return false;
  }
}

function workerRequestMatchesIntent(
  input: unknown,
  intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent
): input is BscTestnetPtaWbnbPoolSigningWorkerRequest {
  const request = inspectRecord(input, WORKER_REQUEST_KEYS);
  const transaction =
    request === null ? null : inspectRecord(request.transaction, WORKER_TRANSACTION_KEYS);
  const recovery = request === null ? null : parseRecoveryAttempt(request.recovery);
  if (request === null || transaction === null || recovery === null) return false;
  const requestAuthenticatedAt = exactUtc(request.authenticatedAt);
  const intentAuthenticatedAt = exactUtc(intent.authenticatedAt);
  const intentExpiresAt = exactUtc(intent.expiresAt);
  if (
    requestAuthenticatedAt === null ||
    intentAuthenticatedAt === null ||
    intentExpiresAt === null
  ) {
    return false;
  }
  const expectedTransaction = intent.transaction;
  return (
    request.schemaVersion === 6 &&
    request.operation === BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION &&
    request.environment === "bsc-testnet" &&
    request.chainId === "97" &&
    request.oneShotIntentId === BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID &&
    request.operationKey === intent.operationKey &&
    typeof request.claimId === "string" &&
    request.claimId.length >= 1 &&
    request.claimId.length <= 128 &&
    exactHex32(request.journalClaimToken) &&
    request.releaseCommit === intent.releaseCommit &&
    request.runtimeManifestSha256 === intent.runtimeManifestSha256 &&
    request.reviewerApprovalDigest === intent.reviewerApprovalDigest &&
    request.ownerAuthorizationDigest === intent.ownerAuthorizationDigest &&
    sameRecoveryAttempt(recovery, intent.recovery) &&
    requestAuthenticatedAt.milliseconds >= intentAuthenticatedAt.milliseconds &&
    requestAuthenticatedAt.milliseconds < intentExpiresAt.milliseconds &&
    request.expiresAt === intent.expiresAt &&
    request.requestHashDomain === BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_REQUEST_HASH_DOMAIN &&
    exactHex32(request.requestHash) &&
    transaction.type === expectedTransaction.type &&
    transaction.eip155ReplayProtection === expectedTransaction.eip155ReplayProtection &&
    transaction.from === expectedTransaction.from &&
    transaction.to === expectedTransaction.to &&
    transaction.nonce === expectedTransaction.nonce &&
    transaction.valueWei === expectedTransaction.valueWei &&
    transaction.gasLimit === expectedTransaction.gasLimit &&
    transaction.gasPriceWei === expectedTransaction.gasPriceWei &&
    transaction.maximumCostWei === expectedTransaction.maximumCostWei &&
    transaction.data === expectedTransaction.data &&
    transaction.serializedUnsignedTransaction ===
      expectedTransaction.serializedUnsignedTransaction &&
    transaction.signingHash === expectedTransaction.signingHash &&
    transaction.sourceEnvelopeHash === intent.envelopeHash
  );
}

function broadcastRequestMatchesIntent(
  input: unknown,
  intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent,
  claimId: string,
  now: number
): boolean {
  const request = inspectRecord(input, BROADCAST_REQUEST_KEYS);
  const terminalObservedAt =
    request === null ? null : exactUtc(request.terminalPreSubmissionObservedAt);
  const recovery = request === null ? null : parseRecoveryAttempt(request.recovery);
  const authenticatedAt = exactUtc(intent.authenticatedAt);
  if (
    request === null ||
    terminalObservedAt === null ||
    authenticatedAt === null ||
    recovery === null ||
    request.schemaVersion !== 6 ||
    request.operation !== BROADCAST_OPERATION ||
    request.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    request.claimId !== claimId ||
    request.envelopeHash !== intent.envelopeHash ||
    request.releaseCommit !== intent.releaseCommit ||
    request.runtimeManifestSha256 !== intent.runtimeManifestSha256 ||
    request.reviewerApprovalDigest !== intent.reviewerApprovalDigest ||
    request.ownerAuthorizationDigest !== intent.ownerAuthorizationDigest ||
    !sameRecoveryAttempt(recovery, intent.recovery) ||
    request.signingHash !== intent.transaction.signingHash ||
    request.authenticatedAt !== intent.authenticatedAt ||
    request.expiresAt !== intent.expiresAt ||
    !exactHex32(request.transactionHash) ||
    !exactHex32(request.signedTransactionKeccak256) ||
    request.transactionHash !== request.signedTransactionKeccak256 ||
    !exactHex32(request.submissionStartedDigest) ||
    !exactHex32(request.terminalPreSubmissionDigest) ||
    typeof request.signedTransaction !== "string" ||
    !SIGNED_TRANSACTION.test(request.signedTransaction) ||
    (request.signedTransaction.length - 2) / 2 > MAXIMUM_SIGNED_TRANSACTION_BYTES ||
    keccak256(request.signedTransaction as Hex) !== request.transactionHash ||
    terminalObservedAt.milliseconds < authenticatedAt.milliseconds ||
    terminalObservedAt.milliseconds > now ||
    now - terminalObservedAt.milliseconds > FRESH_RECHECK_MAX_AGE_MILLISECONDS
  ) {
    return false;
  }
  return true;
}

function blocked(
  code: string,
  path: string,
  message: string
): BscTestnetPtaWbnbPoolProductionAuthorityResult {
  return Object.freeze({
    status: "blocked" as const,
    intent: null,
    executionCapability: null,
    reviewDecisionDigest: null,
    ownerAuthorizationDigest: null,
    issue: Object.freeze({ code, path, message }),
    boundary: AUTHORITY_BOUNDARY
  });
}

function ownerConfirmationNotAfterMilliseconds(
  descriptorExpiryMilliseconds: number,
  challengeIssuedAtMilliseconds: number
): number | null {
  const ownerWindowNotAfter =
    challengeIssuedAtMilliseconds + OWNER_CONFIRMATION_WINDOW_MILLISECONDS;
  const executionReserveNotAfter =
    descriptorExpiryMilliseconds - EXECUTION_AUTHORITY_LIFETIME_MILLISECONDS;
  const notAfterMilliseconds = Math.min(ownerWindowNotAfter, executionReserveNotAfter);
  return Number.isSafeInteger(ownerWindowNotAfter) &&
    Number.isSafeInteger(executionReserveNotAfter) &&
    Number.isSafeInteger(notAfterMilliseconds) &&
    notAfterMilliseconds > challengeIssuedAtMilliseconds
    ? notAfterMilliseconds
    : null;
}

function recoveryAttemptBinding(
  descriptor: BscTestnetPtaWbnbPoolOneShotPreparedDescriptor,
  instantiation: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation,
  release: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust,
  releaseTree: string
): BscTestnetPtaWbnbPoolRecoveryAttemptBinding | null {
  const runtimeRecovery = parseRuntimeRecovery(instantiation.recovery);
  if (runtimeRecovery === null) return null;
  const attemptId = deriveBscTestnetPtaWbnbPoolRecoveryAttemptId({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorTerminalRawSha256: runtimeRecovery.predecessorTerminal.predecessorTerminalRawSha256,
    envelopeHash: descriptor.envelopeHash,
    runtimeReviewInstantiationDigest: instantiation.instantiationDigest,
    releaseCommit: release.releaseCommit,
    releaseTree,
    runtimeManifestSha256: release.runtimeManifestSha256
  });
  return attemptId === null
    ? null
    : Object.freeze({
        generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
        predecessorState: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
        predecessorTerminalRawSha256:
          runtimeRecovery.predecessorTerminal.predecessorTerminalRawSha256,
        attemptId
      });
}

function ownerAuthorizationText(
  descriptor: BscTestnetPtaWbnbPoolOneShotPreparedDescriptor,
  instantiation: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation,
  release: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust,
  releaseTree: string,
  ceremonyNonce: Hex,
  challengeIssuedAt: string,
  preparationDigest: Hex
): string | null {
  const parsedChallengeIssuedAt = exactUtc(challengeIssuedAt);
  const descriptorExpiry = exactUtc(descriptor.envelopeExpiresAt);
  const confirmationNotAfterMilliseconds =
    parsedChallengeIssuedAt === null || descriptorExpiry === null
      ? null
      : ownerConfirmationNotAfterMilliseconds(
          descriptorExpiry.milliseconds,
          parsedChallengeIssuedAt.milliseconds
        );
  const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: descriptor.exactBinding.gasLimit.toString(),
    gasPriceWei: descriptor.exactBinding.gasPriceWei.toString(),
    sourceEnvelopeHash: descriptor.envelopeHash
  });
  const recovery = recoveryAttemptBinding(descriptor, instantiation, release, releaseTree);
  const runtimeRecovery = parseRuntimeRecovery(instantiation.recovery);
  if (
    transaction === null ||
    confirmationNotAfterMilliseconds === null ||
    recovery === null ||
    runtimeRecovery === null
  ) {
    return null;
  }
  const terminal = runtimeRecovery.predecessorTerminal;
  const confirmationNotAfter = new Date(confirmationNotAfterMilliseconds).toISOString();
  return [
    BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_TEXT_DOMAIN,
    "decision=AUTHORIZE_FRESH_RECOVERY_GENERATION_5_POOL_INITIALIZATION_SIGNATURE_AND_SUBMISSION_AFTER_APPEND_ONLY_PREDECESSOR_TERMINAL",
    `executionFlag=${BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG}`,
    `chainId=${BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID}`,
    `from=${BSC_TESTNET_PTA_WBNB_POOL_SENDER}`,
    `nonce=${BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE}`,
    `to=${BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER}`,
    "functionSignature=createAndInitializePoolIfNecessary(address,address,uint24,uint160)",
    `selector=${BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR}`,
    `data=${BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA}`,
    `dataKeccak256=${BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256}`,
    "valueWei=0",
    `expectedPool=${BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE}`,
    `token0.PTA=${BSC_TESTNET_PTA_ADDRESS}`,
    "token0.PTA.decimals=18",
    `token1.WBNB=${BSC_TESTNET_WBNB_ADDRESS}`,
    "token1.WBNB.decimals=18",
    "fee=500",
    `sqrtPriceX96=${BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96}`,
    "expectedTick=-138163",
    "initialPrice=1 PTA = 0.000001 WBNB",
    "initialPriceClassification=fixed_test_scenario_only_not_market_price_oracle_peg_or_valuation",
    `envelopeHash=${descriptor.envelopeHash}`,
    `executionEnvelopeObservedAt=${descriptor.envelopeObservedAt}`,
    `recoveryGeneration=${recovery.generation}`,
    `predecessorState=${recovery.predecessorState}`,
    `predecessorTerminalRawSha256=${recovery.predecessorTerminalRawSha256}`,
    `attemptId=${recovery.attemptId}`,
    `predecessorGeneration=${terminal.generation}`,
    `predecessorTerminalRawSha256=${terminal.predecessorTerminalRawSha256}`,
    `predecessorEnvelopeHash=${terminal.predecessorEnvelopeHash}`,
    `inheritedPredecessorFenceSha256=${terminal.inheritedPredecessorTerminalRawSha256}`,
    `predecessorAttemptId=${terminal.predecessorAttemptId}`,
    `predecessorPhase=${terminal.phase}`,
    `predecessorIssueCode=${terminal.issueCode}`,
    `predecessorOutcomeDigest=${terminal.outcomeDigest}`,
    `predecessorWorkerAuthorizationOutcome=${terminal.workerAuthorizationOutcome}`,
    `predecessorWorkerStartOutcome=${terminal.workerStartOutcome}`,
    `predecessorSignatureOutcome=${terminal.signatureOutcome}`,
    `predecessorSubmissionOutcome=${terminal.submissionOutcome}`,
    `predecessorSubmissionJournalState=${terminal.submissionJournalState}`,
    `predecessorClaimRawSha256=${terminal.predecessorClaimRawSha256}`,
    `predecessorRecordedAt=${terminal.recordedAt}`,
    "recoveryRule=append_only_failed_before_worker_terminal_proves_no_worker_authorization_no_worker_start_no_signature;separate_exact_empty_submission_v3_plus_code_ordering_proves_no_submission;fresh_distinct_later_envelope_requires_new_owner_authorization",
    `signingHash=${transaction.signingHash}`,
    `gasLimit=${transaction.gasLimit}`,
    `gasPriceWei=${transaction.gasPriceWei}`,
    `maximumCostWei=${transaction.maximumCostWei}`,
    `releaseCommit=${release.releaseCommit}`,
    `releaseTree=${releaseTree}`,
    `runtimeManifestSha256=${release.runtimeManifestSha256}`,
    `releaseReviewPolicyDigest=${instantiation.policyDigest}`,
    `runtimeReviewInstantiationDigest=${instantiation.instantiationDigest}`,
    `preparationDigest=${preparationDigest}`,
    `reviewedSubjectSha256=${instantiation.reviewedSubjectSha256}`,
    `ownerDesignatedReviewerTaskLabels=${JSON.stringify(instantiation.reviewerTaskLabels)}`,
    `policyReviewedAt=${instantiation.policyReviewedAt}`,
    `policyExpiresAt=${instantiation.policyExpiresAt}`,
    `instantiatedAt=${instantiation.instantiatedAt}`,
    "automatedPolicyApplication=true",
    "reviewerInspectedExactEnvelope=false",
    "reviewIsNotTransactionAuthorization=true",
    `ceremonyNonce=${ceremonyNonce}`,
    `challengeIssuedAt=${challengeIssuedAt}`,
    `confirmationNotAfter=${confirmationNotAfter}`,
    `reviewEnvelopeExpiresAt=${descriptor.envelopeExpiresAt}`,
    `executionAuthorizationLifetimeSeconds=${BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS}`,
    `minimumRemainingBeforeClaimSeconds=${BSC_TESTNET_PTA_WBNB_POOL_MINIMUM_REMAINING_BEFORE_CLAIM_SECONDS}`,
    `maximumPostConfirmationPreclaimSeconds=${BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_POST_CONFIRMATION_PRECLAIM_SECONDS}`,
    `postRecheckExecutionReserveSeconds=${BSC_TESTNET_PTA_WBNB_POOL_POST_RECHECK_EXECUTION_RESERVE_SECONDS}`,
    "executionAuthorizationRule=confirmedAt_is_captured_after_exact_match_and_executionExpiresAt_equals_confirmedAt_plus_lifetime",
    "risk.initializerHasNoDeadline=true",
    "risk.publicMempoolCanRace=true",
    "risk.noReplacementOrRebroadcastAfterSubmissionStarted=true",
    "liquidityActionAuthorized=false",
    "noLiquidityWillBeAddedByThisAuthorization=true",
    "ack.custodyUnlockVerifiedBeforeDurableClaim=false",
    "ack.custodyKeyAddressVerifiedBeforeDurableClaim=false",
    "ack.expectedSignerVerifiedOnlyByPostClaimSignedAttestation=true",
    "ack.reviewIdentityIsNotCryptographicallyAuthenticated=true",
    "ack.reviewersDidNotInspectExactRuntimeEnvelope=true",
    "ack.reviewIsNotOwnerTransactionAuthorization=true"
  ].join("\n");
}

export function buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
  descriptorValue: unknown,
  instantiationValue: unknown,
  release: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust,
  releaseTree: string,
  ceremonyNonce: Hex,
  challengeIssuedAt: string,
  preparationDigest: Hex
): Readonly<{
  ownerAuthorizationText: string;
  ownerAuthorizationTextSha256: Hex;
  ownerConfirmationText: string;
  recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
}> | null {
  const descriptor = parseDescriptor(descriptorValue);
  const parsedChallengeIssuedAt = exactUtc(challengeIssuedAt);
  if (
    descriptor === null ||
    !validReleaseTrust(release) ||
    !TREE.test(releaseTree) ||
    !exactHex32(ceremonyNonce) ||
    !exactHex32(preparationDigest) ||
    parsedChallengeIssuedAt === null
  ) {
    return null;
  }
  const instantiation = parseInstantiation(
    instantiationValue,
    descriptor,
    release,
    releaseTree,
    parsedChallengeIssuedAt.milliseconds
  );
  if (instantiation === null) return null;
  const text = ownerAuthorizationText(
    descriptor,
    instantiation,
    release,
    releaseTree,
    ceremonyNonce,
    challengeIssuedAt,
    preparationDigest
  );
  const recovery = recoveryAttemptBinding(descriptor, instantiation, release, releaseTree);
  if (
    text === null ||
    recovery === null ||
    Buffer.byteLength(text, "utf8") > MAXIMUM_OWNER_TEXT_BYTES
  ) {
    return null;
  }
  const ownerAuthorizationTextSha256 = sha256Text(text);
  const confirmation = [
    BSC_TESTNET_PTA_WBNB_POOL_OWNER_CONFIRMATION_DOMAIN,
    `executionFlag=${BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG}`,
    `ownerAuthorizationTextSha256=${ownerAuthorizationTextSha256}`,
    `runtimeReviewInstantiationDigest=${instantiation.instantiationDigest}`,
    `preparationDigest=${preparationDigest}`,
    `predecessorTerminalRawSha256=${recovery.predecessorTerminalRawSha256}`,
    `attemptId=${recovery.attemptId}`,
    `ceremonyNonce=${ceremonyNonce}`,
    "decision=CONFIRM_FRESH_GENERATION_5_AUTHORIZATION_AFTER_APPEND_ONLY_PREDECESSOR_TERMINAL_ONE_SIGNATURE_AND_ONE_SUBMISSION_NO_RETRY_NO_REPLACEMENT"
  ].join("|");
  if (Buffer.byteLength(confirmation, "utf8") > MAXIMUM_OWNER_CONFIRMATION_BYTES) return null;
  return Object.freeze({
    ownerAuthorizationText: text,
    ownerAuthorizationTextSha256,
    ownerConfirmationText: confirmation,
    recovery
  });
}

export interface BscTestnetPtaWbnbPoolOwnerCeremonyPorts {
  readonly now: () => Date;
  readonly writeChallenge: (challenge: Uint8Array) => Promise<void>;
  readonly readExactConfirmation: (
    limits: Readonly<{
      maximumBytes: typeof MAXIMUM_OWNER_CONFIRMATION_BYTES;
      notAfterMilliseconds: number;
    }>
  ) => Promise<Uint8Array>;
}

export type BscTestnetPtaWbnbPoolOwnerCeremonyResult =
  | Readonly<{
      status: "confirmed";
      command: BscTestnetPtaWbnbPoolProductionExecutionCommand;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      command: null;
      issue: Readonly<{ code: string; path: string; message: string }>;
    }>;

function ceremonyBlocked(
  code: string,
  path: string,
  message: string
): BscTestnetPtaWbnbPoolOwnerCeremonyResult {
  return Object.freeze({
    status: "blocked" as const,
    command: null,
    issue: Object.freeze({ code, path, message })
  });
}

function ownerChallengeDisplay(
  challenge: NonNullable<
    ReturnType<typeof buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse>
  >
): Buffer {
  return Buffer.from(
    [
      "----- BEGIN PROOFERA EXACT OWNER AUTHORIZATION CHALLENGE -----",
      challenge.ownerAuthorizationText,
      "----- END PROOFERA EXACT OWNER AUTHORIZATION CHALLENGE -----",
      "Paste exactly the following UTF-8 confirmation bytes, with no leading/trailing whitespace:",
      challenge.ownerConfirmationText,
      ""
    ].join("\n"),
    "utf8"
  );
}

/**
 * Content-validating ceremony core. Its injected ports and command brand are not production
 * authority by themselves; only the fixed native bridge may wrap this core with controlling-TTY,
 * descriptor-command and activated-bridge brands that reach custody or broadcasting.
 */
export async function conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse(
  descriptorValue: unknown,
  instantiationValue: unknown,
  release: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust,
  releaseTree: string,
  preparationDigestValue: unknown,
  untrustedPorts: unknown
): Promise<BscTestnetPtaWbnbPoolOwnerCeremonyResult> {
  const ports = inspectRecord(untrustedPorts, ["now", "readExactConfirmation", "writeChallenge"]);
  if (
    ports === null ||
    typeof ports.now !== "function" ||
    isProxy(ports.now) ||
    typeof ports.writeChallenge !== "function" ||
    isProxy(ports.writeChallenge) ||
    typeof ports.readExactConfirmation !== "function" ||
    isProxy(ports.readExactConfirmation)
  ) {
    return ceremonyBlocked("CEREMONY_CONFIGURATION_INVALID", "ports", "TTY ports are invalid.");
  }
  const descriptor = parseDescriptor(descriptorValue);
  const now = ports.now as () => Date;
  const challengeIssuedAtMilliseconds = captureNow(now);
  const descriptorExpiry = descriptor === null ? null : exactUtc(descriptor.envelopeExpiresAt);
  const notAfterMilliseconds =
    challengeIssuedAtMilliseconds === null || descriptorExpiry === null
      ? null
      : ownerConfirmationNotAfterMilliseconds(
          descriptorExpiry.milliseconds,
          challengeIssuedAtMilliseconds
        );
  if (
    descriptor === null ||
    challengeIssuedAtMilliseconds === null ||
    descriptorExpiry === null ||
    notAfterMilliseconds === null ||
    !validReleaseTrust(release) ||
    !TREE.test(releaseTree) ||
    !exactHex32(preparationDigestValue)
  ) {
    return ceremonyBlocked("CEREMONY_EXPIRED", "descriptor", "The exact envelope is not current.");
  }
  const instantiation = parseInstantiation(
    instantiationValue,
    descriptor,
    release,
    releaseTree,
    challengeIssuedAtMilliseconds
  );
  if (instantiation === null || !authenticateInstantiation(instantiationValue, instantiation)) {
    return ceremonyBlocked(
      "RUNTIME_REVIEW_INSTANTIATION_INVALID",
      "runtimeReviewInstantiation",
      "The private one-use runtime review instantiation is invalid or unauthenticated."
    );
  }
  const challengeIssuedAt = new Date(challengeIssuedAtMilliseconds).toISOString();
  const ceremonyNonceBytes = randomBytes(32);
  let ceremonyNonce: Hex;
  try {
    ceremonyNonce = `0x${ceremonyNonceBytes.toString("hex")}` as Hex;
  } finally {
    ceremonyNonceBytes.fill(0);
  }
  const challenge = buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
    descriptor,
    instantiation,
    release,
    releaseTree,
    ceremonyNonce,
    challengeIssuedAt,
    preparationDigestValue as Hex
  );
  if (challenge === null) {
    return ceremonyBlocked(
      "CEREMONY_CHALLENGE_INVALID",
      "challenge",
      "The exact release/policy/envelope challenge could not be built."
    );
  }
  const display = ownerChallengeDisplay(challenge);
  const expected = Buffer.from(challenge.ownerConfirmationText, "utf8");
  let received: Buffer | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Reflect.apply(ports.writeChallenge as (bytes: Uint8Array) => Promise<void>, undefined, [
      display
    ]);
    const readStartedAtMilliseconds = captureNow(now);
    if (
      readStartedAtMilliseconds === null ||
      readStartedAtMilliseconds < challengeIssuedAtMilliseconds
    ) {
      return ceremonyBlocked(
        "CEREMONY_CLOCK_INVALID",
        "confirmation",
        "The owner-ceremony clock moved backwards before confirmation input."
      );
    }
    const remaining = notAfterMilliseconds - readStartedAtMilliseconds;
    if (remaining <= 0) {
      return ceremonyBlocked("CEREMONY_EXPIRED", "confirmation", "Confirmation window expired.");
    }
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), remaining);
    });
    const supplied = await Promise.race([
      Reflect.apply(
        ports.readExactConfirmation as BscTestnetPtaWbnbPoolOwnerCeremonyPorts["readExactConfirmation"],
        undefined,
        [Object.freeze({ maximumBytes: MAXIMUM_OWNER_CONFIRMATION_BYTES, notAfterMilliseconds })]
      ),
      timeout
    ]);
    if (
      supplied === null ||
      isProxy(supplied) ||
      !(supplied instanceof Uint8Array) ||
      supplied.byteLength === 0 ||
      supplied.byteLength > MAXIMUM_OWNER_CONFIRMATION_BYTES
    ) {
      return ceremonyBlocked(
        "OWNER_CONFIRMATION_INVALID",
        "confirmation",
        "Exact bounded confirmation bytes were not received."
      );
    }
    received = Buffer.from(supplied);
    const confirmed =
      received.byteLength === expected.byteLength && timingSafeEqual(received, expected);
    if (!confirmed) {
      return ceremonyBlocked(
        "OWNER_CONFIRMATION_MISMATCH",
        "confirmation",
        "Owner confirmation bytes did not exactly match the displayed challenge digest."
      );
    }
    const confirmedAtMilliseconds = captureNow(now);
    if (confirmedAtMilliseconds === null || confirmedAtMilliseconds < readStartedAtMilliseconds) {
      return ceremonyBlocked(
        "CEREMONY_CLOCK_INVALID",
        "confirmation",
        "The owner-ceremony clock moved backwards after exact confirmation."
      );
    }
    if (confirmedAtMilliseconds >= notAfterMilliseconds) {
      return ceremonyBlocked(
        "CEREMONY_EXPIRED",
        "confirmation",
        "The exact confirmation arrived after its bounded window."
      );
    }
    const executionExpiresAtMilliseconds =
      confirmedAtMilliseconds + EXECUTION_AUTHORITY_LIFETIME_MILLISECONDS;
    if (
      !Number.isSafeInteger(executionExpiresAtMilliseconds) ||
      executionExpiresAtMilliseconds >= descriptorExpiry.milliseconds
    ) {
      return ceremonyBlocked(
        "CEREMONY_EXPIRED",
        "confirmation",
        "The exact confirmation did not leave the complete bounded execution window."
      );
    }
    const confirmedAt = new Date(confirmedAtMilliseconds).toISOString();
    const executionExpiresAt = new Date(executionExpiresAtMilliseconds).toISOString();
    const command = Object.freeze({
      schemaVersion: 9 as const,
      kind: "execute_exact_bsc_testnet_pta_wbnb_pool_recovery_generation_6_once_v9" as const,
      executionFlag: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG,
      runtimeReviewInstantiation: instantiation,
      challengeIssuedAt,
      recovery: challenge.recovery,
      ceremonyNonce,
      ownerAuthorizationText: challenge.ownerAuthorizationText,
      ownerAuthorizationTextSha256: challenge.ownerAuthorizationTextSha256,
      preparationDigest: preparationDigestValue as Hex
    });
    confirmedOwnerCeremonyCommands.set(
      command,
      Object.freeze({
        descriptor,
        instantiation,
        confirmedAt,
        executionExpiresAt,
        preparationDigest: preparationDigestValue as Hex,
        recovery: challenge.recovery
      })
    );
    return Object.freeze({
      status: "confirmed" as const,
      command,
      issue: null
    });
  } catch {
    return ceremonyBlocked(
      "CEREMONY_IO_FAILED",
      "confirmation",
      "The owner ceremony failed closed before issuing authority."
    );
  } finally {
    if (timer !== null) clearTimeout(timer);
    display.fill(0);
    expected.fill(0);
    received?.fill(0);
  }
}

function createBscTestnetPtaWbnbPoolAuthorityIssuer(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolProductionAuthorityIssuer {
  const dependencies = inspectRecord(untrustedDependencies, [
    "authenticateLocalCustodyPathAclCapability",
    "now",
    "releaseTree",
    "releaseTrust"
  ]);
  if (
    dependencies === null ||
    typeof dependencies.now !== "function" ||
    isProxy(dependencies.now) ||
    typeof dependencies.authenticateLocalCustodyPathAclCapability !== "function" ||
    isProxy(dependencies.authenticateLocalCustodyPathAclCapability) ||
    typeof dependencies.releaseTree !== "string" ||
    !TREE.test(dependencies.releaseTree) ||
    !validReleaseTrust(dependencies.releaseTrust)
  ) {
    const invalid = blocked(
      "CONFIGURATION_INVALID",
      "dependencies",
      "Production authority requires a clean release and private fixed-custody path/ACL capability."
    );
    return Object.freeze({
      boundary: AUTHORITY_BOUNDARY,
      authorize: () => invalid,
      authenticateAuthorizedIntent: () => false,
      authenticateExecutionCapability: () => false,
      reserveExecutionCapabilityForWorker: () => false,
      consumeExecutionCapabilityAfterDurableStart: () => false,
      consumeExactBroadcastAuthorizationAfterDurableStart: () => false
    });
  }
  const release = dependencies.releaseTrust;
  const releaseTree = dependencies.releaseTree;
  const now = dependencies.now as () => Date;
  const authenticateLocalPathAcl = dependencies.authenticateLocalCustodyPathAclCapability as (
    capability: unknown
  ) => boolean;
  const authorizedIntents = new WeakSet<object>();
  const executionCapabilities = new WeakMap<
    object,
    {
      signingState: "fresh" | "reserved" | "consumed";
      broadcastState: "fresh" | "consumed";
      signingRequestValidated: boolean;
      claimId: string | null;
      intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
      releaseTree: string;
    }
  >();
  let authorizationIssued = false;

  const authorize = (
    descriptorValue: unknown,
    commandValue: unknown,
    localCapability: unknown
  ): BscTestnetPtaWbnbPoolProductionAuthorityResult => {
    const current = captureNow(now);
    if (current === null) return blocked("CLOCK_INVALID", "now", "Authority clock is invalid.");
    let localPathAclAuthenticated = false;
    try {
      localPathAclAuthenticated =
        Reflect.apply(authenticateLocalPathAcl, undefined, [localCapability]) === true;
    } catch {
      localPathAclAuthenticated = false;
    }
    if (!localPathAclAuthenticated) {
      return blocked(
        "LOCAL_CUSTODY_PATH_ACL_AUTHENTICATION_FAILED",
        "localCustodyPathAclCapability",
        "The current Windows user's fixed-custody path/ACL object capability was not authenticated."
      );
    }
    if (authorizationIssued) {
      return blocked(
        "AUTHORIZATION_ALREADY_ISSUED",
        "command",
        "This authority realm already issued its only execution capability."
      );
    }
    let confirmedCommandRecord: ConfirmedOwnerCeremonyCommandRecord | null = null;
    try {
      if (typeof commandValue !== "object" || commandValue === null || isProxy(commandValue)) {
        return blocked(
          "OWNER_CEREMONY_REQUIRED",
          "command",
          "Only a command privately branded by this process's exact owner ceremony is accepted."
        );
      }
      confirmedCommandRecord = confirmedOwnerCeremonyCommands.get(commandValue) ?? null;
      if (confirmedCommandRecord === null) {
        return blocked(
          "OWNER_CEREMONY_REQUIRED",
          "command",
          "Only a command privately branded by this process's exact owner ceremony is accepted."
        );
      }
      // First authorization use is terminal even if later structural validation fails closed.
      confirmedOwnerCeremonyCommands.delete(commandValue);
    } catch {
      return blocked(
        "OWNER_CEREMONY_REQUIRED",
        "command",
        "The exact same-process owner ceremony command could not be authenticated."
      );
    }
    const descriptor = parseDescriptor(descriptorValue);
    const command = inspectRecord(commandValue, COMMAND_KEYS);
    const challengeIssuedAt = command === null ? null : exactUtc(command.challengeIssuedAt);
    const commandRecovery = command === null ? null : parseRecoveryAttempt(command.recovery);
    const confirmedAt =
      confirmedCommandRecord === null ? null : exactUtc(confirmedCommandRecord.confirmedAt);
    const executionExpiresAt =
      confirmedCommandRecord === null ? null : exactUtc(confirmedCommandRecord.executionExpiresAt);
    const descriptorExpiry = descriptor === null ? null : exactUtc(descriptor.envelopeExpiresAt);
    const confirmationNotAfterMilliseconds =
      challengeIssuedAt === null || descriptorExpiry === null
        ? null
        : ownerConfirmationNotAfterMilliseconds(
            descriptorExpiry.milliseconds,
            challengeIssuedAt.milliseconds
          );
    if (
      confirmedCommandRecord === null ||
      descriptor === null ||
      command === null ||
      challengeIssuedAt === null ||
      confirmedAt === null ||
      executionExpiresAt === null ||
      descriptorExpiry === null ||
      confirmationNotAfterMilliseconds === null ||
      confirmedCommandRecord.descriptor !== descriptor ||
      confirmedCommandRecord.instantiation !== command.runtimeReviewInstantiation ||
      confirmedCommandRecord.confirmedAt !== confirmedAt.iso ||
      confirmedCommandRecord.executionExpiresAt !== executionExpiresAt.iso ||
      commandRecovery === null ||
      !sameRecoveryAttempt(confirmedCommandRecord.recovery, commandRecovery) ||
      command.schemaVersion !== 9 ||
      command.kind !== "execute_exact_bsc_testnet_pta_wbnb_pool_recovery_generation_6_once_v9" ||
      command.executionFlag !== BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG ||
      typeof command.ownerAuthorizationText !== "string" ||
      Buffer.byteLength(command.ownerAuthorizationText, "utf8") > MAXIMUM_OWNER_TEXT_BYTES ||
      !exactHex32(command.ownerAuthorizationTextSha256) ||
      !exactHex32(command.preparationDigest) ||
      command.preparationDigest !== confirmedCommandRecord.preparationDigest ||
      !exactHex32(command.ceremonyNonce) ||
      sha256Text(command.ownerAuthorizationText) !== command.ownerAuthorizationTextSha256 ||
      confirmedAt.milliseconds < challengeIssuedAt.milliseconds ||
      confirmedAt.milliseconds >= confirmationNotAfterMilliseconds ||
      executionExpiresAt.milliseconds !==
        confirmedAt.milliseconds + EXECUTION_AUTHORITY_LIFETIME_MILLISECONDS ||
      executionExpiresAt.milliseconds >= descriptorExpiry.milliseconds ||
      confirmedAt.milliseconds > current ||
      current >= executionExpiresAt.milliseconds
    ) {
      return blocked(
        "AUTHORIZATION_REQUIRED",
        "command",
        "Exact bounded-TTY execution flag and owner authorization text/hash are required."
      );
    }
    const instantiation = parseInstantiation(
      command.runtimeReviewInstantiation,
      descriptor,
      release,
      releaseTree,
      current
    );
    if (
      instantiation === null ||
      confirmedCommandRecord.instantiation !== instantiation ||
      !authenticateInstantiation(command.runtimeReviewInstantiation, instantiation)
    ) {
      return blocked(
        "RUNTIME_REVIEW_INSTANTIATION_INVALID",
        "command.runtimeReviewInstantiation",
        "The private release-policy instantiation is not authentic, fresh, or exactly bound."
      );
    }
    const expectedText = ownerAuthorizationText(
      descriptor,
      instantiation,
      release,
      releaseTree,
      command.ceremonyNonce as Hex,
      challengeIssuedAt.iso,
      command.preparationDigest as Hex
    );
    const expectedRecovery = recoveryAttemptBinding(
      descriptor,
      instantiation,
      release,
      releaseTree
    );
    if (
      expectedText === null ||
      expectedRecovery === null ||
      command.ownerAuthorizationText !== expectedText ||
      !sameRecoveryAttempt(commandRecovery, expectedRecovery)
    ) {
      return blocked(
        "OWNER_AUTHORIZATION_MISMATCH",
        "command.ownerAuthorizationText",
        "Owner text does not exactly bind the transaction, policy instantiation, release, envelope, caps, and risks."
      );
    }
    const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
      gasLimit: descriptor.exactBinding.gasLimit.toString(),
      gasPriceWei: descriptor.exactBinding.gasPriceWei.toString(),
      sourceEnvelopeHash: descriptor.envelopeHash
    });
    if (transaction === null) {
      return blocked("DESCRIPTOR_INVALID", "descriptor", "Exact transaction could not be rebuilt.");
    }
    const ownerBody = Object.freeze({
      schemaVersion: 7 as const,
      kind: "exact_owner_recovery_generation_6_signature_and_single_broadcast_authorization_v7" as const,
      decision:
        "authorize_fresh_chain_97_pool_recovery_generation_6_signature_and_single_broadcast" as const,
      broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity" as const,
      liquidityActionAuthorized: false as const,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash: descriptor.envelopeHash,
      releaseCommit: release.releaseCommit,
      releaseTree,
      runtimeManifestSha256: release.runtimeManifestSha256,
      reviewerApprovalDigest: instantiation.instantiationDigest,
      // This identifies only the OS principal whose path/ACL capability was checked. The expected
      // signer lives in the transaction; its key/address is verified only by the post-claim signed
      // attestation after durable worker_started.
      ownerIdentity: "windows-current-user-fixed-custody-path-acl-holder",
      authorizationTextSha256: command.ownerAuthorizationTextSha256,
      ceremonyNonce: command.ceremonyNonce as Hex,
      recovery: expectedRecovery,
      signingHash: transaction.signingHash,
      gasLimit: transaction.gasLimit,
      gasPriceWei: transaction.gasPriceWei,
      maximumCostWei: transaction.maximumCostWei,
      authorizedAt: confirmedAt.iso,
      expiresAt: executionExpiresAt.iso
    });
    const ownerAuthorization = Object.freeze({
      ...ownerBody,
      authorizationDigest: canonicalDigest(
        BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN,
        ownerBody,
        OWNER_BODY_KEYS
      )
    }) satisfies BscTestnetPtaWbnbPoolOwnerSignatureAndBroadcastAuthorization;
    const intent = Object.freeze({
      schemaVersion: 6 as const,
      scope:
        "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_6" as const,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash: descriptor.envelopeHash,
      reviewerApprovalDigest: instantiation.instantiationDigest,
      ownerAuthorizationDigest: ownerAuthorization.authorizationDigest,
      releaseCommit: release.releaseCommit,
      runtimeManifestSha256: release.runtimeManifestSha256,
      authenticatedAt: confirmedAt.iso,
      expiresAt: executionExpiresAt.iso,
      recovery: expectedRecovery,
      transaction
    }) satisfies BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
    let instantiationConsumed = false;
    try {
      instantiationConsumed =
        consumeBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse(
          command.runtimeReviewInstantiation,
          instantiationBinding(instantiation)
        ) === true;
    } catch {
      instantiationConsumed = false;
    }
    if (!instantiationConsumed) {
      return blocked(
        "RUNTIME_REVIEW_INSTANTIATION_CONSUMPTION_FAILED",
        "command.runtimeReviewInstantiation",
        "The exact private runtime review instantiation could not be terminally consumed."
      );
    }
    const executionCapability = Object.freeze(Object.create(null) as object);
    authorizationIssued = true;
    authorizedIntents.add(intent);
    executionCapabilities.set(executionCapability, {
      signingState: "fresh",
      broadcastState: "fresh",
      signingRequestValidated: false,
      claimId: null,
      intent,
      releaseTree
    });
    return Object.freeze({
      status: "authorized" as const,
      intent,
      executionCapability,
      reviewDecisionDigest: instantiation.instantiationDigest,
      ownerAuthorizationDigest: ownerAuthorization.authorizationDigest,
      issue: null,
      boundary: AUTHORITY_BOUNDARY
    });
  };

  return Object.freeze({
    boundary: AUTHORITY_BOUNDARY,
    authorize,
    authenticateAuthorizedIntent: (value: unknown) => {
      try {
        return (
          typeof value === "object" &&
          value !== null &&
          !isProxy(value) &&
          authorizedIntents.has(value)
        );
      } catch {
        return false;
      }
    },
    authenticateExecutionCapability: (value: unknown) => {
      try {
        if (typeof value !== "object" || value === null || isProxy(value)) return false;
        const record = executionCapabilities.get(value);
        return record !== undefined && record.signingState !== "consumed";
      } catch {
        return false;
      }
    },
    reserveExecutionCapabilityForWorker: (value: unknown) => {
      try {
        if (typeof value !== "object" || value === null || isProxy(value)) return false;
        const record = executionCapabilities.get(value);
        if (
          record === undefined ||
          record.signingState !== "fresh" ||
          record.broadcastState !== "fresh" ||
          record.releaseTree !== releaseTree
        ) {
          return false;
        }
        record.signingState = "reserved";
        return true;
      } catch {
        return false;
      }
    },
    consumeExecutionCapabilityAfterDurableStart: (value: unknown, request: unknown) => {
      try {
        if (typeof value !== "object" || value === null || isProxy(value)) return false;
        const record = executionCapabilities.get(value);
        if (
          record === undefined ||
          record.signingState !== "reserved" ||
          record.releaseTree !== releaseTree
        ) {
          return false;
        }
        record.signingState = "consumed";
        const current = captureNow(now);
        const valid =
          current !== null &&
          validateBscTestnetPtaWbnbPoolSigningWorkerRequest(request, new Date(current)).status ===
            "valid" &&
          workerRequestMatchesIntent(request, record.intent);
        record.signingRequestValidated = valid;
        record.claimId = valid
          ? (request as BscTestnetPtaWbnbPoolSigningWorkerRequest).claimId
          : null;
        return valid;
      } catch {
        return false;
      }
    },
    consumeExactBroadcastAuthorizationAfterDurableStart: (value: unknown, request: unknown) => {
      try {
        if (typeof value !== "object" || value === null || isProxy(value)) return false;
        const record = executionCapabilities.get(value);
        if (record === undefined || record.broadcastState !== "fresh") return false;
        // A first attempt is terminal even if the post-journal request or clock is malformed.
        record.broadcastState = "consumed";
        const current = captureNow(now);
        const expiry = exactUtc(record.intent.expiresAt);
        return (
          record.signingState === "consumed" &&
          record.signingRequestValidated === true &&
          record.claimId !== null &&
          current !== null &&
          expiry !== null &&
          current < expiry.milliseconds &&
          broadcastRequestMatchesIntent(request, record.intent, record.claimId, current)
        );
      } catch {
        return false;
      }
    }
  });
}

/** Internal one-shot issuer. Native production keeps its owner capability and lifecycle methods private. */
export function createBscTestnetPtaWbnbPoolAuthorityIssuerForInternalUse(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolProductionAuthorityIssuer {
  return createBscTestnetPtaWbnbPoolAuthorityIssuer(untrustedDependencies);
}

/** Dependency-injected authority harness; it cannot brand a native production worker realm. */
export function createBscTestnetPtaWbnbPoolAuthorityIssuerForTests(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolProductionAuthorityIssuer {
  return createBscTestnetPtaWbnbPoolAuthorityIssuer(untrustedDependencies);
}
