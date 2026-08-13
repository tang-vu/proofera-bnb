import "server-only";

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { keccak256, stringToHex, type Hex } from "viem";

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96,
  BSC_TESTNET_WBNB_ADDRESS
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_REVIEW_ARTIFACT_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN,
  BSC_TESTNET_PTA_WBNB_POOL_OWNER_DESIGNATED_REVIEW_APPROVAL_DIGEST_DOMAIN,
  createBscTestnetPtaWbnbPoolAuthorizationGateForInternalUse,
  type BscTestnetPtaWbnbPoolAuthorizationGate,
  type BscTestnetPtaWbnbPoolOwnerDesignatedInternalReviewApproval,
  type BscTestnetPtaWbnbPoolOwnerSignatureAndBroadcastAuthorization
} from "./bsc-testnet-pta-wbnb-pool-authorization.server";
import type { BscTestnetPtaWbnbPoolOneShotPreparedDescriptor } from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction,
  type BscTestnetPtaWbnbPoolAuthorizedSigningIntent
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import type { BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust } from "./bsc-testnet-pta-wbnb-pool-signing-worker";

export const BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG =
  "I_EXPLICITLY_AUTHORIZE_ONE_EXACT_PTA_WBNB_POOL_INITIALIZATION_ON_BSC_TESTNET_CHAIN_97" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_TEXT_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-owner-transaction-authorization:v1" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_OWNER_DESIGNATED_REVIEW_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-owner-designated-multi-agent-review:v1" as const;

const BYTES32 = /^0x[0-9a-f]{64}$/u;
const RELEASE = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{0,95}$/u;
const MAXIMUM_OWNER_TEXT_BYTES = 4_096;
const ZERO_32 = `0x${"00".repeat(32)}`;

const REVIEW_KEYS = [
  "decision",
  "envelopeHash",
  "expiresAt",
  "implementationAgentIdentity",
  "kind",
  "limitations",
  "operationKey",
  "releaseCommit",
  "reviewedAt",
  "reviewedReleaseManifestSha256",
  "reviewerIdentity",
  "schemaVersion"
] as const;
const LIMITATION_KEYS = [
  "cryptographicReviewerIdentityAvailable",
  "ownerDesignationAndAcknowledgementRequired",
  "reviewIsNotTransactionAuthorization",
  "separateExactOwnerTransactionAuthorizationRequired"
] as const;
const COMMAND_KEYS = [
  "authorizedAt",
  "executionFlag",
  "kind",
  "ownerAuthorizationText",
  "ownerAuthorizationTextSha256",
  "reviewDecision",
  "schemaVersion"
] as const;
const REVIEWER_BODY_KEYS = [
  "cryptographicReviewerIdentityAvailable",
  "dataKeccak256",
  "decision",
  "envelopeHash",
  "expectedPool",
  "expiresAt",
  "kind",
  "manager",
  "operationKey",
  "ownerAcknowledgementRequired",
  "releaseCommit",
  "reviewIsNotTransactionAuthorization",
  "reviewedArtifactSha256",
  "reviewedAt",
  "reviewerIdentity",
  "reviewerModel",
  "runtimeManifestSha256",
  "schemaVersion",
  "selector"
] as const;
const OWNER_BODY_KEYS = [
  "authorizationTextSha256",
  "authorizedAt",
  "broadcastPolicy",
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
  "releaseCommit",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "schemaVersion",
  "signingHash"
] as const;

type DataRecord = Readonly<Record<string, unknown>>;

export interface BscTestnetPtaWbnbPoolOwnerDesignatedReviewDecision {
  readonly schemaVersion: 1;
  readonly kind: "owner_designated_multi_agent_review_v1";
  readonly decision: "GO_EXACT_CHAIN_97_ONE_SHOT_ONLY";
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly envelopeHash: Hex;
  readonly releaseCommit: string;
  readonly reviewedReleaseManifestSha256: Hex;
  readonly reviewerIdentity: string;
  readonly implementationAgentIdentity: string;
  readonly reviewedAt: string;
  readonly expiresAt: string;
  readonly limitations: Readonly<{
    cryptographicReviewerIdentityAvailable: false;
    ownerDesignationAndAcknowledgementRequired: true;
    reviewIsNotTransactionAuthorization: true;
    separateExactOwnerTransactionAuthorizationRequired: true;
  }>;
}

export interface BscTestnetPtaWbnbPoolProductionExecutionCommand {
  readonly schemaVersion: 1;
  readonly kind: "execute_exact_bsc_testnet_pta_wbnb_pool_once_v1";
  readonly executionFlag: typeof BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG;
  readonly reviewDecision: BscTestnetPtaWbnbPoolOwnerDesignatedReviewDecision;
  readonly authorizedAt: string;
  readonly ownerAuthorizationText: string;
  readonly ownerAuthorizationTextSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolProductionAuthorityDependencies {
  readonly now: () => Date;
  readonly releaseTrust: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust;
  readonly authenticateLocalCustodyOwnerCapability: (capability: unknown) => boolean;
}

const AUTHORITY_BOUNDARY = Object.freeze({
  environment: "bsc-testnet" as const,
  chainId: "97" as const,
  operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  authorityModel: "windows_current_user_custody_owner_object_capability" as const,
  reviewModel: "owner_designated_multi_agent_review" as const,
  cryptographicReviewerIdentityAvailable: false as const,
  ownerMustAcknowledgeExactReviewDigest: true as const,
  reviewAloneAuthorizesTransaction: false as const,
  chatMessageAuthorizesTransaction: false as const,
  exactBoundedStdinAuthorizationRequired: true as const,
  exactFreshEnvelopeRequired: true as const,
  cleanPublishedReleaseRequired: true as const,
  genericTransactionAuthorizationPossible: false as const,
  mainnetAuthorizationPossible: false as const
});

export type BscTestnetPtaWbnbPoolProductionAuthorityResult =
  | Readonly<{
      status: "authorized";
      intent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
      executionCapability: object;
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
    localCustodyOwnerCapability: unknown
  ) => BscTestnetPtaWbnbPoolProductionAuthorityResult;
  readonly authenticateAuthorizedIntent: (intent: unknown) => boolean;
  readonly authenticateExecutionCapability: (capability: unknown) => boolean;
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
    release.releaseCommit.length === 40 &&
    RELEASE.test(release.releaseCommit) &&
    release.releaseCommit !== "0".repeat(40) &&
    release.originReference === "refs/remotes/origin/main" &&
    release.cleanPublishedHead === true &&
    exactHex32(release.workerSourceSha256) &&
    exactHex32(release.runtimeManifestSha256)
  );
}

function parseReview(
  input: unknown,
  descriptor: BscTestnetPtaWbnbPoolOneShotPreparedDescriptor,
  release: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust,
  now: number
): BscTestnetPtaWbnbPoolOwnerDesignatedReviewDecision | null {
  const review = inspectRecord(input, REVIEW_KEYS);
  const limitations = review === null ? null : inspectRecord(review.limitations, LIMITATION_KEYS);
  const reviewedAt = review === null ? null : exactUtc(review.reviewedAt);
  const expiresAt = review === null ? null : exactUtc(review.expiresAt);
  if (
    review === null ||
    limitations === null ||
    reviewedAt === null ||
    expiresAt === null ||
    review.schemaVersion !== 1 ||
    review.kind !== "owner_designated_multi_agent_review_v1" ||
    review.decision !== "GO_EXACT_CHAIN_97_ONE_SHOT_ONLY" ||
    review.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    review.envelopeHash !== descriptor.envelopeHash ||
    review.releaseCommit !== release.releaseCommit ||
    review.reviewedReleaseManifestSha256 !== release.runtimeManifestSha256 ||
    typeof review.reviewerIdentity !== "string" ||
    review.reviewerIdentity.length > 96 ||
    !IDENTITY.test(review.reviewerIdentity) ||
    typeof review.implementationAgentIdentity !== "string" ||
    review.implementationAgentIdentity.length > 96 ||
    !IDENTITY.test(review.implementationAgentIdentity) ||
    review.reviewerIdentity === review.implementationAgentIdentity ||
    reviewedAt.milliseconds > now ||
    expiresAt.iso !== descriptor.envelopeExpiresAt ||
    reviewedAt.milliseconds >= expiresAt.milliseconds ||
    limitations.cryptographicReviewerIdentityAvailable !== false ||
    limitations.ownerDesignationAndAcknowledgementRequired !== true ||
    limitations.reviewIsNotTransactionAuthorization !== true ||
    limitations.separateExactOwnerTransactionAuthorizationRequired !== true
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: "owner_designated_multi_agent_review_v1",
    decision: "GO_EXACT_CHAIN_97_ONE_SHOT_ONLY",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: descriptor.envelopeHash,
    releaseCommit: release.releaseCommit,
    reviewedReleaseManifestSha256: release.runtimeManifestSha256,
    reviewerIdentity: review.reviewerIdentity,
    implementationAgentIdentity: review.implementationAgentIdentity,
    reviewedAt: reviewedAt.iso,
    expiresAt: expiresAt.iso,
    limitations: Object.freeze({
      cryptographicReviewerIdentityAvailable: false,
      ownerDesignationAndAcknowledgementRequired: true,
      reviewIsNotTransactionAuthorization: true,
      separateExactOwnerTransactionAuthorizationRequired: true
    })
  });
}

export function deriveBscTestnetPtaWbnbPoolOwnerDesignatedReviewDigestForInternalUse(
  review: BscTestnetPtaWbnbPoolOwnerDesignatedReviewDecision
): Hex {
  const canonical = Object.freeze({
    ...review,
    limitations: review.limitations
  });
  return canonicalDigest(
    BSC_TESTNET_PTA_WBNB_POOL_OWNER_DESIGNATED_REVIEW_DOMAIN,
    canonical,
    REVIEW_KEYS
  );
}

function ownerAuthorizationText(
  descriptor: BscTestnetPtaWbnbPoolOneShotPreparedDescriptor,
  review: BscTestnetPtaWbnbPoolOwnerDesignatedReviewDecision,
  reviewDigest: Hex,
  release: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust,
  authorizedAt: string
): string | null {
  const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: descriptor.exactBinding.gasLimit.toString(),
    gasPriceWei: descriptor.exactBinding.gasPriceWei.toString(),
    sourceEnvelopeHash: descriptor.envelopeHash
  });
  if (transaction === null) return null;
  return [
    BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_TEXT_DOMAIN,
    "decision=AUTHORIZE_ONE_EXACT_POOL_INITIALIZATION_SIGNATURE_AND_SUBMISSION",
    `executionFlag=${BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG}`,
    `chainId=${BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID}`,
    `from=${BSC_TESTNET_PTA_WBNB_POOL_SENDER}`,
    "nonce=1",
    `to=${BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER}`,
    `selector=${BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR}`,
    `dataKeccak256=${BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256}`,
    "valueWei=0",
    `expectedPool=${BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE}`,
    `token0.PTA=${BSC_TESTNET_PTA_ADDRESS}`,
    `token1.WBNB=${BSC_TESTNET_WBNB_ADDRESS}`,
    "fee=500",
    `sqrtPriceX96=${BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96}`,
    "expectedTick=-138163",
    "initialPrice=1 PTA = 0.000001 WBNB",
    `envelopeHash=${descriptor.envelopeHash}`,
    `signingHash=${transaction.signingHash}`,
    `gasLimit=${transaction.gasLimit}`,
    `gasPriceWei=${transaction.gasPriceWei}`,
    `maximumCostWei=${transaction.maximumCostWei}`,
    `releaseCommit=${release.releaseCommit}`,
    `runtimeManifestSha256=${release.runtimeManifestSha256}`,
    `ownerDesignatedReviewer=${review.reviewerIdentity}`,
    `reviewDecisionDigest=${reviewDigest}`,
    `authorizedAt=${authorizedAt}`,
    `expiresAt=${descriptor.envelopeExpiresAt}`,
    "risk.initializerHasNoDeadline=true",
    "risk.publicMempoolCanRace=true",
    "risk.noReplacementOrRebroadcastAfterSubmissionStarted=true",
    "liquidityActionAuthorized=false",
    "noLiquidityWillBeAddedByThisAuthorization=true",
    "ack.reviewIdentityIsNotCryptographicallyAuthenticated=true",
    "ack.reviewIsNotOwnerTransactionAuthorization=true"
  ].join("\n");
}

/**
 * Produces the exact text the repository owner must separately inspect and return through bounded
 * stdin. Producing this challenge is read-only and does not mint an authority capability.
 */
export function buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
  descriptor: BscTestnetPtaWbnbPoolOneShotPreparedDescriptor,
  review: BscTestnetPtaWbnbPoolOwnerDesignatedReviewDecision,
  release: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust,
  authorizedAt: string
): Readonly<{ ownerAuthorizationText: string; ownerAuthorizationTextSha256: Hex }> | null {
  const parsedAuthorizedAt = exactUtc(authorizedAt);
  if (!validReleaseTrust(release) || parsedAuthorizedAt === null) return null;
  const parsedReview = parseReview(review, descriptor, release, parsedAuthorizedAt.milliseconds);
  if (parsedReview === null) return null;
  const reviewDigest =
    deriveBscTestnetPtaWbnbPoolOwnerDesignatedReviewDigestForInternalUse(parsedReview);
  const text = ownerAuthorizationText(
    descriptor,
    parsedReview,
    reviewDigest,
    release,
    authorizedAt
  );
  if (text === null || Buffer.byteLength(text, "utf8") > MAXIMUM_OWNER_TEXT_BYTES) return null;
  return Object.freeze({
    ownerAuthorizationText: text,
    ownerAuthorizationTextSha256: sha256Text(text)
  });
}

/** Dependency-injected authority protocol implementation; it is never wired by production. */
function createBscTestnetPtaWbnbPoolAuthorityIssuer(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolProductionAuthorityIssuer {
  const dependencies = inspectRecord(untrustedDependencies, [
    "authenticateLocalCustodyOwnerCapability",
    "now",
    "releaseTrust"
  ]);
  if (
    dependencies === null ||
    typeof dependencies.now !== "function" ||
    isProxy(dependencies.now) ||
    typeof dependencies.authenticateLocalCustodyOwnerCapability !== "function" ||
    isProxy(dependencies.authenticateLocalCustodyOwnerCapability) ||
    !validReleaseTrust(dependencies.releaseTrust)
  ) {
    const invalid = blocked(
      "CONFIGURATION_INVALID",
      "dependencies",
      "Production authority requires a clean release and private local custody-owner capability."
    );
    return Object.freeze({
      boundary: AUTHORITY_BOUNDARY,
      authorize: () => invalid,
      authenticateAuthorizedIntent: () => false,
      authenticateExecutionCapability: () => false
    });
  }
  const release = dependencies.releaseTrust;
  const now = dependencies.now as () => Date;
  const authenticateLocalOwner = dependencies.authenticateLocalCustodyOwnerCapability as (
    capability: unknown
  ) => boolean;
  const authenticatedReviewerReceipts = new WeakSet<object>();
  const authenticatedOwnerReceipts = new WeakSet<object>();
  const executionCapabilities = new WeakSet<object>();
  const gate: BscTestnetPtaWbnbPoolAuthorizationGate =
    createBscTestnetPtaWbnbPoolAuthorizationGateForInternalUse(
      Object.freeze({
        asOf: now,
        authenticateExternalReviewerApproval: (value: unknown) =>
          typeof value === "object" &&
          value !== null &&
          !isProxy(value) &&
          authenticatedReviewerReceipts.has(value),
        authenticateOwnerEnvelopeAuthorization: (value: unknown) =>
          typeof value === "object" &&
          value !== null &&
          !isProxy(value) &&
          authenticatedOwnerReceipts.has(value)
      })
    );

  const authorize = (
    descriptorValue: unknown,
    commandValue: unknown,
    localCapability: unknown
  ): BscTestnetPtaWbnbPoolProductionAuthorityResult => {
    const current = captureNow(now);
    if (current === null) return blocked("CLOCK_INVALID", "now", "Authority clock is invalid.");
    let localOwnerAuthenticated = false;
    try {
      localOwnerAuthenticated =
        Reflect.apply(authenticateLocalOwner, undefined, [localCapability]) === true;
    } catch {
      localOwnerAuthenticated = false;
    }
    if (!localOwnerAuthenticated) {
      return blocked(
        "LOCAL_OWNER_AUTHENTICATION_FAILED",
        "localCustodyOwnerCapability",
        "The current Windows user/custody owner object capability was not authenticated."
      );
    }
    const descriptor = descriptorValue as BscTestnetPtaWbnbPoolOneShotPreparedDescriptor;
    const command = inspectRecord(commandValue, COMMAND_KEYS);
    const authorizedAt = command === null ? null : exactUtc(command.authorizedAt);
    if (
      descriptorValue === null ||
      typeof descriptorValue !== "object" ||
      isProxy(descriptorValue) ||
      !Object.isFrozen(descriptorValue) ||
      command === null ||
      authorizedAt === null ||
      command.schemaVersion !== 1 ||
      command.kind !== "execute_exact_bsc_testnet_pta_wbnb_pool_once_v1" ||
      command.executionFlag !== BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG ||
      typeof command.ownerAuthorizationText !== "string" ||
      Buffer.byteLength(command.ownerAuthorizationText, "utf8") > MAXIMUM_OWNER_TEXT_BYTES ||
      !exactHex32(command.ownerAuthorizationTextSha256) ||
      sha256Text(command.ownerAuthorizationText) !== command.ownerAuthorizationTextSha256 ||
      authorizedAt.milliseconds > current ||
      descriptor.status !== "prepared_non_authorizing" ||
      descriptor.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY
    ) {
      return blocked(
        "AUTHORIZATION_REQUIRED",
        "command",
        "Exact bounded-stdin execution flag and owner authorization text/hash are required."
      );
    }
    const review = parseReview(command.reviewDecision, descriptor, release, current);
    if (review === null) {
      return blocked(
        "REVIEW_DECISION_INVALID",
        "command.reviewDecision",
        "Distinct owner-designated reviewer GO is not bound to this final release and envelope."
      );
    }
    const reviewDigest =
      deriveBscTestnetPtaWbnbPoolOwnerDesignatedReviewDigestForInternalUse(review);
    const expectedText = ownerAuthorizationText(
      descriptor,
      review,
      reviewDigest,
      release,
      authorizedAt.iso
    );
    if (expectedText === null || command.ownerAuthorizationText !== expectedText) {
      return blocked(
        "OWNER_AUTHORIZATION_MISMATCH",
        "command.ownerAuthorizationText",
        "Owner text does not exactly bind the transaction, review, release, envelope, caps, and risks."
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
    const reviewerIdentity = `owner-designated:${review.reviewerIdentity}@${reviewDigest}`;
    if (
      reviewerIdentity.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{0,127}$/u.test(reviewerIdentity)
    ) {
      return blocked(
        "REVIEW_DECISION_INVALID",
        "reviewerIdentity",
        "Reviewer binding is too long."
      );
    }
    const reviewerBody = Object.freeze({
      schemaVersion: 1 as const,
      kind: "owner_designated_internal_multi_agent_initializer_review_v1" as const,
      decision: "approve_exact_direct_initializer_only" as const,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash: descriptor.envelopeHash,
      releaseCommit: release.releaseCommit,
      runtimeManifestSha256: release.runtimeManifestSha256,
      reviewerIdentity,
      reviewerModel: "owner_designated_distinct_subagent_review" as const,
      cryptographicReviewerIdentityAvailable: false as const,
      ownerAcknowledgementRequired: true as const,
      reviewIsNotTransactionAuthorization: true as const,
      reviewedArtifactSha256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_REVIEW_ARTIFACT_SHA256,
      manager: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      selector: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
      dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
      expectedPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      reviewedAt: review.reviewedAt,
      expiresAt: review.expiresAt
    });
    const reviewerApproval = Object.freeze({
      ...reviewerBody,
      approvalDigest: canonicalDigest(
        BSC_TESTNET_PTA_WBNB_POOL_OWNER_DESIGNATED_REVIEW_APPROVAL_DIGEST_DOMAIN,
        reviewerBody,
        REVIEWER_BODY_KEYS
      )
    }) satisfies BscTestnetPtaWbnbPoolOwnerDesignatedInternalReviewApproval;
    authenticatedReviewerReceipts.add(reviewerApproval);

    const ownerBody = Object.freeze({
      schemaVersion: 1 as const,
      kind: "exact_owner_signature_and_single_broadcast_authorization_v2" as const,
      decision:
        "authorize_one_chain_97_pool_initialization_signature_and_single_broadcast" as const,
      broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity" as const,
      liquidityActionAuthorized: false as const,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      envelopeHash: descriptor.envelopeHash,
      releaseCommit: release.releaseCommit,
      runtimeManifestSha256: release.runtimeManifestSha256,
      reviewerApprovalDigest: reviewerApproval.approvalDigest,
      ownerIdentity: `windows-current-user-custody-owner:${BSC_TESTNET_PTA_WBNB_POOL_SENDER}`,
      authorizationTextSha256: command.ownerAuthorizationTextSha256,
      signingHash: transaction.signingHash,
      gasLimit: transaction.gasLimit,
      gasPriceWei: transaction.gasPriceWei,
      maximumCostWei: transaction.maximumCostWei,
      authorizedAt: authorizedAt.iso,
      expiresAt: descriptor.envelopeExpiresAt
    });
    const ownerAuthorization = Object.freeze({
      ...ownerBody,
      authorizationDigest: canonicalDigest(
        BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN,
        ownerBody,
        OWNER_BODY_KEYS
      )
    }) satisfies BscTestnetPtaWbnbPoolOwnerSignatureAndBroadcastAuthorization;
    authenticatedOwnerReceipts.add(ownerAuthorization);
    const result = gate.authorize(descriptor, reviewerApproval, ownerAuthorization);
    if (result.status !== "authorized") {
      return blocked(
        result.issue.code,
        result.issue.path,
        `Strict reviewer/owner gate rejected the production command: ${result.issue.message}`
      );
    }
    const executionCapability = Object.freeze(Object.create(null) as object);
    executionCapabilities.add(executionCapability);
    return Object.freeze({
      status: "authorized" as const,
      intent: result.intent,
      executionCapability,
      reviewDecisionDigest: reviewDigest,
      ownerAuthorizationDigest: ownerAuthorization.authorizationDigest,
      issue: null,
      boundary: AUTHORITY_BOUNDARY
    });
  };

  return Object.freeze({
    boundary: AUTHORITY_BOUNDARY,
    authorize,
    authenticateAuthorizedIntent: gate.authenticateAuthorizedIntent,
    authenticateExecutionCapability: (value: unknown) => {
      try {
        return (
          typeof value === "object" &&
          value !== null &&
          !isProxy(value) &&
          executionCapabilities.has(value)
        );
      } catch {
        return false;
      }
    }
  });
}

/** Dependency-injected authority harness; never used by the production runner. */
export function createBscTestnetPtaWbnbPoolAuthorityIssuerForTests(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolProductionAuthorityIssuer {
  return createBscTestnetPtaWbnbPoolAuthorityIssuer(untrustedDependencies);
}
