import "server-only";

import { isProxy } from "node:util/types";

import { keccak256, stringToHex, type Hex } from "viem";

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
  BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction,
  type BscTestnetPtaWbnbPoolAuthorizedSigningIntent,
  type BscTestnetPtaWbnbPoolRecoveryAttemptBinding
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

export const BSC_TESTNET_PTA_WBNB_POOL_REVIEWER_APPROVAL_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.external-reviewer-approval.v1" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.owner-envelope-authorization.v8" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_OWNER_DESIGNATED_REVIEW_APPROVAL_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.owner-designated-internal-multi-agent-review.v1" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_REVIEW_ARTIFACT_SHA256 =
  "0x2f78e23ba4892194f2e55c99de479c5a5421329cc4cf992ed2253dd5c0512f02" as const satisfies Hex;

const BOUNDARY = Object.freeze({
  scope: "one_exact_bsc_testnet_pta_wbnb_pool_initialization" as const,
  productionReceiptIssuerPresent: false,
  reviewerApprovalMintingExposed: false,
  ownerAuthorizationMintingExposed: false,
  selfSealedDigestAuthenticatesReceipt: false,
  authenticatedReviewerOrOwnerDesignatedInternalCapabilityRequired: true,
  ownerDesignatedInternalMultiAgentReviewAcceptedWithExplicitLimitations: true,
  authenticatedOwnerEnvelopeAuthorizationRequired: true,
  bothCapabilitiesRequired: true,
  genericSigningAuthorizationPossible: false,
  mainnetAuthorizationPossible: false
});

interface BscTestnetPtaWbnbPoolReviewerApprovalCommonBody {
  readonly schemaVersion: 1;
  readonly decision: "approve_exact_direct_initializer_only";
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly envelopeHash: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewerIdentity: string;
  readonly reviewedArtifactSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_REVIEW_ARTIFACT_SHA256;
  readonly manager: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
  readonly selector: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR;
  readonly dataKeccak256: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256;
  readonly expectedPool: typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE;
  readonly reviewedAt: string;
  readonly expiresAt: string;
}

export interface BscTestnetPtaWbnbPoolExternalReviewerApprovalBody extends BscTestnetPtaWbnbPoolReviewerApprovalCommonBody {
  readonly kind: "authenticated_independent_initializer_reviewer_approval_v1";
  readonly independence: "independent_from_implementation_owner_and_rpc_rechecker";
}

export interface BscTestnetPtaWbnbPoolOwnerDesignatedInternalReviewApprovalBody extends BscTestnetPtaWbnbPoolReviewerApprovalCommonBody {
  readonly kind: "owner_designated_internal_multi_agent_initializer_review_v1";
  readonly reviewerModel: "owner_designated_distinct_subagent_review";
  readonly cryptographicReviewerIdentityAvailable: false;
  readonly ownerAcknowledgementRequired: true;
  readonly reviewIsNotTransactionAuthorization: true;
}

export interface BscTestnetPtaWbnbPoolExternalReviewerApproval extends BscTestnetPtaWbnbPoolExternalReviewerApprovalBody {
  /** Unkeyed body integrity only. Authenticity comes from the injected external-review authority. */
  readonly approvalDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolOwnerDesignatedInternalReviewApproval extends BscTestnetPtaWbnbPoolOwnerDesignatedInternalReviewApprovalBody {
  /** Unkeyed integrity only; authenticity is the owner's private designation capability. */
  readonly approvalDigest: Hex;
}

export type BscTestnetPtaWbnbPoolReviewerApproval =
  | BscTestnetPtaWbnbPoolExternalReviewerApproval
  | BscTestnetPtaWbnbPoolOwnerDesignatedInternalReviewApproval;

export interface BscTestnetPtaWbnbPoolOwnerEnvelopeAuthorizationBody {
  readonly schemaVersion: 1;
  readonly kind: "exact_owner_envelope_authorization_v1";
  readonly decision: "authorize_one_chain_97_pool_initialization_signature";
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly envelopeHash: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerIdentity: string;
  readonly authorizationTextSha256: Hex;
  readonly signingHash: Hex;
  readonly gasLimit: string;
  readonly gasPriceWei: string;
  readonly maximumCostWei: string;
  readonly authorizedAt: string;
  readonly expiresAt: string;
}

export interface BscTestnetPtaWbnbPoolOwnerEnvelopeAuthorization extends BscTestnetPtaWbnbPoolOwnerEnvelopeAuthorizationBody {
  /** Unkeyed body integrity only. Authenticity comes from the injected owner authority. */
  readonly authorizationDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolOwnerSignatureAndBroadcastAuthorizationBody extends Omit<
  BscTestnetPtaWbnbPoolOwnerEnvelopeAuthorizationBody,
  "schemaVersion" | "kind" | "decision"
> {
  readonly schemaVersion: 9;
  readonly kind: "exact_owner_recovery_generation_8_signature_and_single_broadcast_authorization_v9";
  readonly decision: "authorize_fresh_chain_97_pool_recovery_generation_8_signature_and_single_broadcast";
  readonly broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity";
  readonly liquidityActionAuthorized: false;
  readonly ceremonyNonce: Hex;
  readonly releaseTree: string;
  readonly recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
}

export interface BscTestnetPtaWbnbPoolOwnerSignatureAndBroadcastAuthorization extends BscTestnetPtaWbnbPoolOwnerSignatureAndBroadcastAuthorizationBody {
  readonly authorizationDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolAuthorizationDependencies {
  readonly asOf: () => Date;
  readonly authenticateExternalReviewerApproval: (approval: unknown) => boolean;
  readonly authenticateOwnerEnvelopeAuthorization: (authorization: unknown) => boolean;
}

export type BscTestnetPtaWbnbPoolAuthorizationIssueCode =
  | "CONFIGURATION_INVALID"
  | "CLOCK_INVALID"
  | "DESCRIPTOR_INVALID"
  | "REVIEWER_APPROVAL_INVALID"
  | "REVIEWER_AUTHENTICATION_FAILED"
  | "OWNER_AUTHORIZATION_INVALID"
  | "OWNER_AUTHENTICATION_FAILED"
  | "AUTHORIZATION_BINDING_MISMATCH"
  | "AUTHORIZATION_EXPIRED";

export interface BscTestnetPtaWbnbPoolAuthorizationIssue {
  readonly code: BscTestnetPtaWbnbPoolAuthorizationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type BscTestnetPtaWbnbPoolAuthorizationResult =
  | Readonly<{
      status: "authorized";
      intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
      issue: null;
      boundary: typeof BOUNDARY;
    }>
  | Readonly<{
      status: "blocked";
      intent: null;
      issue: BscTestnetPtaWbnbPoolAuthorizationIssue;
      boundary: typeof BOUNDARY;
    }>;

export interface BscTestnetPtaWbnbPoolAuthorizationGate {
  readonly boundary: typeof BOUNDARY;
  readonly authorize: (
    descriptor: unknown,
    reviewerApproval: unknown,
    ownerAuthorization: unknown
  ) => BscTestnetPtaWbnbPoolAuthorizationResult;
  readonly authenticateAuthorizedIntent: (intent: unknown) => boolean;
}

type DataRecord = Readonly<Record<string, unknown>>;

const DEPENDENCY_KEYS = [
  "asOf",
  "authenticateExternalReviewerApproval",
  "authenticateOwnerEnvelopeAuthorization"
] as const;
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
const BINDING_KEYS = [
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
const REVIEWER_COMMON_BODY_KEYS = [
  "dataKeccak256",
  "decision",
  "envelopeHash",
  "expectedPool",
  "expiresAt",
  "kind",
  "manager",
  "operationKey",
  "releaseCommit",
  "reviewedArtifactSha256",
  "reviewedAt",
  "reviewerIdentity",
  "runtimeManifestSha256",
  "schemaVersion",
  "selector"
] as const;
const EXTERNAL_REVIEWER_BODY_KEYS = [...REVIEWER_COMMON_BODY_KEYS, "independence"] as const;
const INTERNAL_REVIEWER_BODY_KEYS = [
  ...REVIEWER_COMMON_BODY_KEYS,
  "cryptographicReviewerIdentityAvailable",
  "ownerAcknowledgementRequired",
  "reviewIsNotTransactionAuthorization",
  "reviewerModel"
] as const;
const EXTERNAL_REVIEWER_KEYS = [...EXTERNAL_REVIEWER_BODY_KEYS, "approvalDigest"] as const;
const INTERNAL_REVIEWER_KEYS = [...INTERNAL_REVIEWER_BODY_KEYS, "approvalDigest"] as const;
const OWNER_BODY_KEYS = [
  "authorizationTextSha256",
  "authorizedAt",
  "decision",
  "envelopeHash",
  "expiresAt",
  "gasLimit",
  "gasPriceWei",
  "kind",
  "maximumCostWei",
  "operationKey",
  "ownerIdentity",
  "releaseCommit",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "schemaVersion",
  "signingHash"
] as const;
const OWNER_V3_BODY_KEYS = [
  ...OWNER_BODY_KEYS,
  "broadcastPolicy",
  "ceremonyNonce",
  "liquidityActionAuthorized",
  "recovery",
  "releaseTree"
] as const;
const OWNER_V3_KEYS = [...OWNER_V3_BODY_KEYS, "authorizationDigest"] as const;
const RECOVERY_KEYS = [
  "attemptId",
  "generation",
  "predecessorTerminalRawSha256",
  "predecessorState"
] as const;

function inspectRecord(
  value: unknown,
  expectedKeys: readonly string[],
  requireFrozen = true
): DataRecord | null {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      isProxy(value) ||
      (requireFrozen && !Object.isFrozen(value))
    ) {
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

function exactHex32(value: unknown): Hex | null {
  return typeof value === "string" &&
    /^0x[0-9a-f]{64}$/u.test(value) &&
    value !== `0x${"00".repeat(32)}`
    ? (value as Hex)
    : null;
}

function releaseCommit(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value) && !/^0{40}$/u.test(value)
    ? value
    : null;
}

function recoveryAttempt(value: unknown): BscTestnetPtaWbnbPoolRecoveryAttemptBinding | null {
  const recovery = inspectRecord(value, RECOVERY_KEYS);
  const predecessorTerminalRawSha256 =
    recovery === null ? null : exactHex32(recovery.predecessorTerminalRawSha256);
  const attemptId = recovery === null ? null : exactHex32(recovery.attemptId);
  if (
    recovery === null ||
    !Object.isFrozen(value) ||
    recovery.generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION ||
    recovery.predecessorState !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE ||
    predecessorTerminalRawSha256 === null ||
    attemptId === null
  ) {
    return null;
  }
  return Object.freeze({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorState: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
    predecessorTerminalRawSha256,
    attemptId
  });
}

function identity(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{0,127}$/u.test(value)
    ? value
    : null;
}

function canonicalUtc(
  value: unknown
): { readonly iso: string; readonly milliseconds: number } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return null;
  }
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === value
    ? { iso: value, milliseconds }
    : null;
}

function captureClock(clock: () => Date): number | null {
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

function canonicalBodyDigest(
  domain: string,
  body: DataRecord,
  orderedKeys: readonly string[]
): Hex {
  const canonical: Record<string, unknown> = {};
  for (const key of [...orderedKeys].sort()) canonical[key] = body[key];
  return keccak256(stringToHex(`${domain}\u0000${JSON.stringify(canonical)}`));
}

function blocked(
  code: BscTestnetPtaWbnbPoolAuthorizationIssueCode,
  path: string,
  message: string
): BscTestnetPtaWbnbPoolAuthorizationResult {
  return Object.freeze({
    status: "blocked" as const,
    intent: null,
    issue: Object.freeze({ code, path, message }),
    boundary: BOUNDARY
  });
}

function invalidGate(): BscTestnetPtaWbnbPoolAuthorizationGate {
  const result = blocked(
    "CONFIGURATION_INVALID",
    "dependencies",
    "Authorization gate requires exact non-proxy reviewer, owner, and clock capabilities."
  );
  return Object.freeze({
    boundary: BOUNDARY,
    authorize: () => result,
    authenticateAuthorizedIntent: () => false
  });
}

/**
 * Composes two separately authenticated object capabilities. This module validates but cannot mint
 * either receipt; matching self-sealed digests alone never cause an authorization result.
 */
function createBscTestnetPtaWbnbPoolAuthorizationGateCore(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolAuthorizationGate {
  const dependencies = inspectRecord(untrustedDependencies, DEPENDENCY_KEYS, false);
  if (
    dependencies === null ||
    typeof dependencies.asOf !== "function" ||
    typeof dependencies.authenticateExternalReviewerApproval !== "function" ||
    typeof dependencies.authenticateOwnerEnvelopeAuthorization !== "function" ||
    isProxy(dependencies.asOf) ||
    isProxy(dependencies.authenticateExternalReviewerApproval) ||
    isProxy(dependencies.authenticateOwnerEnvelopeAuthorization)
  ) {
    return invalidGate();
  }
  const asOf = dependencies.asOf as () => Date;
  const authenticateReviewer = dependencies.authenticateExternalReviewerApproval as (
    approval: unknown
  ) => boolean;
  const authenticateOwner = dependencies.authenticateOwnerEnvelopeAuthorization as (
    authorization: unknown
  ) => boolean;
  const brandedIntents = new WeakSet<object>();

  const authorize = (
    descriptorValue: unknown,
    reviewerValue: unknown,
    ownerValue: unknown
  ): BscTestnetPtaWbnbPoolAuthorizationResult => {
    const now = captureClock(asOf);
    if (now === null) return blocked("CLOCK_INVALID", "asOf", "Authorization clock is invalid.");
    const descriptor = inspectRecord(descriptorValue, DESCRIPTOR_KEYS);
    const exactBinding = descriptor && inspectRecord(descriptor.exactBinding, BINDING_KEYS);
    const requirements = descriptor && inspectRecord(descriptor.requirements, REQUIREMENT_KEYS);
    if (descriptor === null || exactBinding === null || requirements === null) {
      return blocked(
        "DESCRIPTOR_INVALID",
        "descriptor",
        "Descriptor must be an exact deeply frozen own-data pool one-shot descriptor."
      );
    }
    const envelopeHash = exactHex32(descriptor.envelopeHash);
    const descriptorExpiry = canonicalUtc(descriptor.envelopeExpiresAt);
    const descriptorObservedAt = canonicalUtc(descriptor.envelopeObservedAt);
    const gasLimit =
      typeof exactBinding.gasLimit === "bigint" && exactBinding.gasLimit > 0n
        ? exactBinding.gasLimit
        : null;
    const gasPriceWei =
      typeof exactBinding.gasPriceWei === "bigint" && exactBinding.gasPriceWei > 0n
        ? exactBinding.gasPriceWei
        : null;
    if (
      descriptor.status !== "prepared_non_authorizing" ||
      descriptor.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
      envelopeHash === null ||
      descriptorExpiry === null ||
      descriptorObservedAt === null ||
      descriptorObservedAt.milliseconds >= descriptorExpiry.milliseconds ||
      descriptorExpiry.milliseconds <= now ||
      descriptor.signingReady !== false ||
      descriptor.signingAuthorized !== false ||
      descriptor.executionAuthorized !== false ||
      descriptor.authorizationReceiptCreated !== false ||
      descriptor.journalClaimCreated !== false ||
      descriptor.signerInvoked !== false ||
      descriptor.signatureCreated !== false ||
      descriptor.transactionSubmitted !== false ||
      exactBinding.chainId !== BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID ||
      exactBinding.from !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
      exactBinding.nonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE ||
      exactBinding.to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
      exactBinding.selector !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR ||
      exactBinding.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
      exactBinding.dataKeccak256 !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256 ||
      exactBinding.valueWei !== 0n ||
      gasLimit === null ||
      gasLimit > BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT ||
      gasPriceWei === null ||
      gasPriceWei > BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI ||
      gasLimit * gasPriceWei > BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI ||
      Object.values(requirements).some((value) => value !== true)
    ) {
      return blocked(
        "DESCRIPTOR_INVALID",
        "descriptor",
        "Descriptor does not bind the exact pinned-nonce chain-97 initializer and safety requirements."
      );
    }
    const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPriceWei.toString(),
      sourceEnvelopeHash: envelopeHash
    });
    if (transaction === null) {
      return blocked("DESCRIPTOR_INVALID", "descriptor.exactBinding", "Transaction is invalid.");
    }

    const reviewerKind =
      reviewerValue !== null && typeof reviewerValue === "object" && !isProxy(reviewerValue)
        ? Object.getOwnPropertyDescriptor(reviewerValue, "kind")?.value
        : null;
    const internalReviewer =
      reviewerKind === "owner_designated_internal_multi_agent_initializer_review_v1";
    const reviewerKeys = internalReviewer ? INTERNAL_REVIEWER_KEYS : EXTERNAL_REVIEWER_KEYS;
    const reviewerBodyKeys = internalReviewer
      ? INTERNAL_REVIEWER_BODY_KEYS
      : EXTERNAL_REVIEWER_BODY_KEYS;
    const reviewerDomain = internalReviewer
      ? BSC_TESTNET_PTA_WBNB_POOL_OWNER_DESIGNATED_REVIEW_APPROVAL_DIGEST_DOMAIN
      : BSC_TESTNET_PTA_WBNB_POOL_REVIEWER_APPROVAL_DIGEST_DOMAIN;
    const reviewer = inspectRecord(reviewerValue, reviewerKeys);
    if (reviewer === null) {
      return blocked(
        "REVIEWER_APPROVAL_INVALID",
        "reviewerApproval",
        "Reviewer approval must be exact frozen own data without accessors, symbols, or proxies."
      );
    }
    const reviewerBody = inspectRecord(
      Object.freeze(Object.fromEntries(reviewerBodyKeys.map((key) => [key, reviewer[key]]))),
      reviewerBodyKeys
    );
    const reviewerApprovalDigest = exactHex32(reviewer.approvalDigest);
    const reviewerRuntimeManifest = exactHex32(reviewer.runtimeManifestSha256);
    const reviewerCommit = releaseCommit(reviewer.releaseCommit);
    const reviewerIdentity = identity(reviewer.reviewerIdentity);
    const reviewedAt = canonicalUtc(reviewer.reviewedAt);
    const reviewerExpiry = canonicalUtc(reviewer.expiresAt);
    if (
      reviewerApprovalDigest === null ||
      reviewerBody === null ||
      reviewerRuntimeManifest === null ||
      reviewerCommit === null ||
      reviewerIdentity === null ||
      reviewedAt === null ||
      reviewerExpiry === null ||
      reviewer.schemaVersion !== 1 ||
      (!internalReviewer &&
        reviewer.kind !== "authenticated_independent_initializer_reviewer_approval_v1") ||
      (internalReviewer &&
        (reviewer.kind !== "owner_designated_internal_multi_agent_initializer_review_v1" ||
          reviewer.reviewerModel !== "owner_designated_distinct_subagent_review" ||
          reviewer.cryptographicReviewerIdentityAvailable !== false ||
          reviewer.ownerAcknowledgementRequired !== true ||
          reviewer.reviewIsNotTransactionAuthorization !== true)) ||
      reviewer.decision !== "approve_exact_direct_initializer_only" ||
      reviewer.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
      reviewer.envelopeHash !== envelopeHash ||
      (!internalReviewer &&
        reviewer.independence !== "independent_from_implementation_owner_and_rpc_rechecker") ||
      reviewer.reviewedArtifactSha256 !==
        BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_REVIEW_ARTIFACT_SHA256 ||
      reviewer.manager !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
      reviewer.selector !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR ||
      reviewer.dataKeccak256 !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256 ||
      reviewer.expectedPool !== BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE ||
      reviewedAt.milliseconds > now ||
      reviewerExpiry.milliseconds !== descriptorExpiry.milliseconds ||
      reviewerApprovalDigest !== canonicalBodyDigest(reviewerDomain, reviewerBody, reviewerBodyKeys)
    ) {
      return blocked(
        "REVIEWER_APPROVAL_INVALID",
        "reviewerApproval",
        "Reviewer approval content, digest, scope, release, or lifetime is invalid."
      );
    }
    let reviewerAuthenticated = false;
    try {
      reviewerAuthenticated =
        Reflect.apply(authenticateReviewer, undefined, [reviewerValue]) === true;
    } catch {
      reviewerAuthenticated = false;
    }
    if (!reviewerAuthenticated) {
      return blocked(
        "REVIEWER_AUTHENTICATION_FAILED",
        "reviewerApproval",
        "Self-sealed reviewer bytes are not an authenticated reviewer/designation capability."
      );
    }

    const ownerKind =
      ownerValue !== null && typeof ownerValue === "object" && !isProxy(ownerValue)
        ? Object.getOwnPropertyDescriptor(ownerValue, "kind")?.value
        : null;
    const ownerV4 =
      ownerKind ===
      "exact_owner_recovery_generation_8_signature_and_single_broadcast_authorization_v9";
    const ownerBodyKeys = OWNER_V3_BODY_KEYS;
    const owner = ownerV4 ? inspectRecord(ownerValue, OWNER_V3_KEYS) : null;
    if (owner === null) {
      return blocked(
        "OWNER_AUTHORIZATION_INVALID",
        "ownerAuthorization",
        "Owner authorization must be exact frozen own data without accessors, symbols, or proxies."
      );
    }
    const ownerBody = inspectRecord(
      Object.freeze(Object.fromEntries(ownerBodyKeys.map((key) => [key, owner[key]]))),
      ownerBodyKeys
    );
    const ownerDigest = exactHex32(owner.authorizationDigest);
    const ownerTextDigest = exactHex32(owner.authorizationTextSha256);
    const ceremonyNonce = exactHex32(owner.ceremonyNonce);
    const recovery = recoveryAttempt(owner.recovery);
    const ownerReleaseTree = releaseCommit(owner.releaseTree);
    const ownerRuntimeManifest = exactHex32(owner.runtimeManifestSha256);
    const ownerCommit = releaseCommit(owner.releaseCommit);
    const ownerIdentity = identity(owner.ownerIdentity);
    const authorizedAt = canonicalUtc(owner.authorizedAt);
    const ownerExpiry = canonicalUtc(owner.expiresAt);
    if (
      ownerDigest === null ||
      ownerBody === null ||
      ownerTextDigest === null ||
      recovery === null ||
      ownerReleaseTree === null ||
      ownerRuntimeManifest === null ||
      ownerCommit === null ||
      ownerIdentity === null ||
      authorizedAt === null ||
      ownerExpiry === null ||
      owner.schemaVersion !== 9 ||
      owner.kind !==
        "exact_owner_recovery_generation_8_signature_and_single_broadcast_authorization_v9" ||
      owner.decision !==
        "authorize_fresh_chain_97_pool_recovery_generation_8_signature_and_single_broadcast" ||
      owner.broadcastPolicy !== "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity" ||
      ceremonyNonce === null ||
      owner.liquidityActionAuthorized !== false ||
      owner.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
      owner.envelopeHash !== envelopeHash ||
      owner.reviewerApprovalDigest !== reviewerApprovalDigest ||
      owner.signingHash !== transaction.signingHash ||
      owner.gasLimit !== transaction.gasLimit ||
      owner.gasPriceWei !== transaction.gasPriceWei ||
      owner.maximumCostWei !== transaction.maximumCostWei ||
      authorizedAt.milliseconds < reviewedAt.milliseconds ||
      authorizedAt.milliseconds > now ||
      ownerExpiry.milliseconds - authorizedAt.milliseconds !==
        BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS * 1_000 ||
      ownerExpiry.milliseconds > descriptorExpiry.milliseconds ||
      ownerDigest !==
        canonicalBodyDigest(
          BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN,
          ownerBody,
          ownerBodyKeys
        )
    ) {
      return blocked(
        "OWNER_AUTHORIZATION_INVALID",
        "ownerAuthorization",
        "Owner authorization content, digest, exact envelope, transaction, or lifetime is invalid."
      );
    }
    if (
      ownerCommit !== reviewerCommit ||
      ownerRuntimeManifest !== reviewerRuntimeManifest ||
      ownerIdentity === reviewerIdentity
    ) {
      return blocked(
        "AUTHORIZATION_BINDING_MISMATCH",
        "authorization",
        "Reviewer and owner must be distinct and bind one exact release/runtime pair."
      );
    }
    let ownerAuthenticated = false;
    try {
      ownerAuthenticated = Reflect.apply(authenticateOwner, undefined, [ownerValue]) === true;
    } catch {
      ownerAuthenticated = false;
    }
    if (!ownerAuthenticated) {
      return blocked(
        "OWNER_AUTHENTICATION_FAILED",
        "ownerAuthorization",
        "Self-sealed owner bytes are not an authenticated owner capability."
      );
    }
    if (ownerExpiry.milliseconds <= now || descriptorExpiry.milliseconds <= now) {
      return blocked("AUTHORIZATION_EXPIRED", "expiresAt", "Authorization envelope expired.");
    }
    const intent = Object.freeze({
      schemaVersion: 8 as const,
      scope:
        "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_8" as const,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash,
      reviewerApprovalDigest,
      ownerAuthorizationDigest: ownerDigest,
      releaseCommit: reviewerCommit,
      runtimeManifestSha256: reviewerRuntimeManifest,
      authenticatedAt: authorizedAt.iso,
      expiresAt: ownerExpiry.iso,
      recovery,
      transaction
    });
    brandedIntents.add(intent);
    return Object.freeze({
      status: "authorized" as const,
      intent,
      issue: null,
      boundary: BOUNDARY
    });
  };

  return Object.freeze({
    boundary: BOUNDARY,
    authorize,
    authenticateAuthorizedIntent: (intentValue: unknown) =>
      typeof intentValue === "object" &&
      intentValue !== null &&
      !isProxy(intentValue) &&
      brandedIntents.has(intentValue)
  });
}

/**
 * Internal validation seam used by fixed production composition and deterministic tests. Production
 * retains both authenticators as private object-capability checks; public JSON and matching digests
 * are never sufficient. This file is intentionally absent from the package export map.
 */
export function createBscTestnetPtaWbnbPoolAuthorizationGateForInternalUse(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolAuthorizationGate {
  return createBscTestnetPtaWbnbPoolAuthorizationGateCore(untrustedDependencies);
}

export function createBscTestnetPtaWbnbPoolAuthorizationGateForTests(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolAuthorizationGate {
  return createBscTestnetPtaWbnbPoolAuthorizationGateCore(untrustedDependencies);
}

/**
 * Production remains deliberately non-authorizing. A later reviewed receipt issuer must replace
 * this boundary; runtime callers cannot inject a callback that promotes self-authored JSON.
 */
export function createBscTestnetPtaWbnbPoolProductionAuthorizationGate(): BscTestnetPtaWbnbPoolAuthorizationGate {
  return invalidGate();
}
