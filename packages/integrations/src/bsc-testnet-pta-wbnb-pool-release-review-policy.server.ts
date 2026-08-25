import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { stdin, stdout } from "node:process";
import { isProxy } from "node:util/types";

import type { Hex } from "viem";

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL,
  BSC_TESTNET_PTA_WBNB_POOL_FEE,
  BSC_TESTNET_PTA_WBNB_POOL_GAS_MARGIN_BPS,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_POST_CONFIRMATION_PRECLAIM_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE,
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
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
  BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

export const BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-production-runtime-manifest:v2" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_SUBJECT_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-release-review-subject:v7" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_POLICY_DIGEST_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-release-review-policy:v7" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RUNTIME_REVIEW_INSTANTIATION_DIGEST_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-runtime-review-instantiation:v7" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_CHALLENGE_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-release-review-tty-challenge:v8" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-release-review-tty-frame:v8" as const;

const POLICY_KIND =
  "owner_designated_internal_multi_agent_release_review_policy_generation_7_v7" as const;
const POLICY_DECISION = "GO_EXACT_CHAIN_97_RECOVERY_GENERATION_7_POLICY" as const;
const REVIEWER_DECISION = "GO_WITH_ZERO_P0_AND_ZERO_P1" as const;
const INSTANTIATION_KIND = "automated_release_policy_recovery_envelope_instantiation_v7" as const;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const GIT_OBJECT = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const STABLE_LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{0,95}$/u;
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._@/+-]{0,239}$/u;
const MAXIMUM_POLICY_BYTES = 65_536;
const MAXIMUM_TTY_FRAME_BYTES = 100 * 1024;
const MAXIMUM_TTY_LINE_BYTES = 4_096;
const TTY_POLICY_CHUNK_CHARACTERS = 2_304;
const MAXIMUM_TTY_POLICY_CHUNKS = 38;
const MAXIMUM_POLICY_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1_000;
const MAXIMUM_POLICY_AGE_MILLISECONDS = 24 * 60 * 60 * 1_000;
const TTY_POLICY_ENTRY_WINDOW_MILLISECONDS = 5 * 60 * 1_000;
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

const MANIFEST_ENTRY_KEYS = ["path", "byteLength", "sha256"] as const;
const MANIFEST_KEYS = [
  "schemaVersion",
  "domain",
  "nodeVersion",
  "entries",
  "runtimeManifestSha256"
] as const;
const MANIFEST_DIGEST_BODY_KEYS = ["schemaVersion", "domain", "nodeVersion", "entries"] as const;
const RELEASE_KEYS = ["releaseCommit", "releaseTree", "runtimeManifest"] as const;
const TRANSACTION_KEYS = [
  "chainId",
  "from",
  "nonce",
  "to",
  "selector",
  "data",
  "dataKeccak256",
  "valueWei",
  "expectedPool",
  "token0",
  "token1",
  "fee",
  "sqrtPriceX96",
  "expectedTick",
  "fixedTestScenarioPrice"
] as const;
const CAPS_KEYS = [
  "gasMarginBps",
  "maximumGasEstimate",
  "maximumGasLimit",
  "maximumGasPriceWei",
  "maximumTotalCostWei",
  "maximumEnvelopeLifetimeSeconds",
  "maximumOwnerConfirmationWindowSeconds",
  "maximumExecutionAuthorityLifetimeSeconds",
  "minimumRemainingBeforeClaimSeconds",
  "maximumPostConfirmationPreclaimSeconds",
  "postRecheckExecutionReserveSeconds",
  "maximumPostClaimRecheckAgeSeconds",
  "predecessorClaimRawSha256",
  "predecessorTerminalRawSha256",
  "predecessorFailedBeforeWorkerOutcomeDigest",
  "inheritedPredecessorTerminalRawSha256",
  "recoveryGeneration"
] as const;
const SCOPE_KEYS = [
  "exactFreshEnvelopeRequired",
  "maximumSignatureCount",
  "maximumSubmissionCount",
  "broadcastPolicy",
  "liquidityActionAuthorized",
  "lpPositionMintAuthorized",
  "tokenApprovalAuthorized",
  "tokenTransferAuthorized",
  "mainnetWriteAuthorized",
  "initializerHasNoDeadline",
  "publicMempoolCanRace",
  "priceIsMarketPriceOraclePegOrValuation",
  "predecessorTerminalRecordRequired",
  "predecessorFailedBeforeWorkerEvidenceRequired",
  "predecessorSignatureOutcomeRequired",
  "predecessorStateRequired",
  "predecessorSubmissionV5JournalStateRequired",
  "predecessorSubmissionOutcomeRequired",
  "predecessorIssueCodeRequired",
  "predecessorPhaseRequired",
  "predecessorWorkerAuthorizationOutcomeRequired",
  "predecessorWorkerStartOutcomeRequired",
  "freshEnvelopeAfterTerminalRequired"
] as const;
const REVIEWER_KEYS = [
  "taskLabel",
  "modelRole",
  "decision",
  "p0Findings",
  "p1Findings",
  "reviewedSubjectSha256"
] as const;
const LIMITATION_KEYS = [
  "ownerDesignatedInternalReview",
  "cryptographicReviewerIdentityAvailable",
  "externalIndependentReviewAvailable",
  "sigstoreAttestationAvailable",
  "reviewIsNotTransactionAuthorization",
  "separateExactOwnerTransactionAuthorizationRequired",
  "reviewersDidNotInspectFutureRuntimeEnvelopes",
  "automatedPolicyApplicationRequired"
] as const;
const POLICY_BODY_KEYS = [
  "schemaVersion",
  "kind",
  "decision",
  "operationKey",
  "release",
  "transaction",
  "caps",
  "scope",
  "reviewedSubjectSha256",
  "implementationAgentIdentity",
  "reviewers",
  "reviewedAt",
  "expiresAt",
  "limitations"
] as const;
const POLICY_KEYS = [...POLICY_BODY_KEYS, "policyDigest"] as const;
const INSTANTIATION_INPUT_KEYS = [
  "envelopeHash",
  "executionEnvelopeObservedAt",
  "expiresAt",
  "predecessorTerminal"
] as const;
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
const RUNTIME_RECOVERY_KEYS = ["generation", "predecessorTerminal"] as const;
const INSTANTIATION_EXPECTED_BINDING_KEYS = [
  "releaseCommit",
  "releaseTree",
  "runtimeManifestSha256",
  "policyDigest",
  "reviewedSubjectSha256",
  "recovery",
  "envelopeHash",
  "executionEnvelopeObservedAt",
  "expiresAt",
  "instantiationDigest"
] as const;
type DataRecord = Readonly<Record<string, unknown>>;

export interface BscTestnetPtaWbnbPoolProductionRuntimeManifestEntry {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: Hex;
}

export interface BscTestnetPtaWbnbPoolProductionRuntimeManifest {
  readonly schemaVersion: 2;
  readonly domain: typeof BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN;
  readonly nodeVersion: string;
  readonly entries: readonly BscTestnetPtaWbnbPoolProductionRuntimeManifestEntry[];
  readonly runtimeManifestSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolExactReleaseIdentity {
  readonly releaseCommit: string;
  readonly releaseTree: string;
  readonly runtimeManifest: BscTestnetPtaWbnbPoolProductionRuntimeManifest;
}

export interface BscTestnetPtaWbnbPoolReleaseReviewPolicy {
  readonly schemaVersion: 7;
  readonly kind: typeof POLICY_KIND;
  readonly decision: typeof POLICY_DECISION;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly release: BscTestnetPtaWbnbPoolExactReleaseIdentity;
  readonly transaction: Readonly<{
    chainId: "97";
    from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
    nonce: typeof BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL;
    to: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
    selector: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR;
    data: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA;
    dataKeccak256: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256;
    valueWei: "0";
    expectedPool: typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE;
    token0: typeof BSC_TESTNET_PTA_ADDRESS;
    token1: typeof BSC_TESTNET_WBNB_ADDRESS;
    fee: "500";
    sqrtPriceX96: "79228162514264337593543950";
    expectedTick: "-138163";
    fixedTestScenarioPrice: "1 PTA = 0.000001 WBNB";
  }>;
  readonly caps: Readonly<{
    gasMarginBps: "2000";
    maximumGasEstimate: "5000000";
    maximumGasLimit: "6000000";
    maximumGasPriceWei: "3000000000";
    maximumTotalCostWei: "18000000000000000";
    maximumEnvelopeLifetimeSeconds: "300";
    maximumOwnerConfirmationWindowSeconds: "240";
    maximumExecutionAuthorityLifetimeSeconds: "120";
    minimumRemainingBeforeClaimSeconds: "60";
    maximumPostConfirmationPreclaimSeconds: "60";
    postRecheckExecutionReserveSeconds: "20";
    maximumPostClaimRecheckAgeSeconds: "30";
    recoveryGeneration: "7";
    predecessorClaimRawSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256;
    predecessorTerminalRawSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256;
    predecessorFailedBeforeWorkerOutcomeDigest: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST;
    inheritedPredecessorTerminalRawSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256;
  }>;
  readonly scope: Readonly<{
    exactFreshEnvelopeRequired: true;
    maximumSignatureCount: "1";
    maximumSubmissionCount: "1";
    broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity";
    liquidityActionAuthorized: false;
    lpPositionMintAuthorized: false;
    tokenApprovalAuthorized: false;
    tokenTransferAuthorized: false;
    mainnetWriteAuthorized: false;
    initializerHasNoDeadline: true;
    publicMempoolCanRace: true;
    priceIsMarketPriceOraclePegOrValuation: false;
    predecessorTerminalRecordRequired: true;
    predecessorFailedBeforeWorkerEvidenceRequired: true;
    predecessorStateRequired: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
    predecessorIssueCodeRequired: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN";
    predecessorPhaseRequired: "post_claim_recheck";
    predecessorWorkerAuthorizationOutcomeRequired: "not_attempted";
    predecessorWorkerStartOutcomeRequired: "not_attempted";
    predecessorSignatureOutcomeRequired: "not_attempted";
    predecessorSubmissionV5JournalStateRequired: "exact_empty";
    predecessorSubmissionOutcomeRequired: "not_attempted";
    freshEnvelopeAfterTerminalRequired: true;
  }>;
  readonly reviewedSubjectSha256: Hex;
  readonly implementationAgentIdentity: string;
  readonly reviewers: readonly Readonly<{
    taskLabel: string;
    modelRole: string;
    decision: typeof REVIEWER_DECISION;
    p0Findings: 0;
    p1Findings: 0;
    reviewedSubjectSha256: Hex;
  }>[];
  readonly reviewedAt: string;
  readonly expiresAt: string;
  readonly limitations: Readonly<{
    ownerDesignatedInternalReview: true;
    cryptographicReviewerIdentityAvailable: false;
    externalIndependentReviewAvailable: false;
    sigstoreAttestationAvailable: false;
    reviewIsNotTransactionAuthorization: true;
    separateExactOwnerTransactionAuthorizationRequired: true;
    reviewersDidNotInspectFutureRuntimeEnvelopes: true;
    automatedPolicyApplicationRequired: true;
  }>;
  readonly policyDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolPredecessorTerminalBinding {
  readonly status: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION;
  readonly predecessorClaimRawSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256;
  readonly predecessorTerminalRawSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256;
  readonly predecessorEnvelopeHash: Hex;
  readonly inheritedPredecessorTerminalRawSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256;
  readonly predecessorAttemptId: Hex;
  readonly phase: "post_claim_recheck";
  readonly issueCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN";
  readonly outcomeDigest: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST;
  readonly workerAuthorizationOutcome: "not_attempted";
  readonly workerStartOutcome: "not_attempted";
  readonly signatureOutcome: "not_attempted";
  readonly submissionOutcome: "not_attempted";
  readonly submissionJournalState: "exact_empty";
  readonly recordedAt: string;
}

export interface BscTestnetPtaWbnbPoolRuntimeReviewRecoveryBinding {
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION;
  readonly predecessorTerminal: BscTestnetPtaWbnbPoolPredecessorTerminalBinding;
}

export interface BscTestnetPtaWbnbPoolRuntimeReviewInstantiation {
  readonly schemaVersion: 7;
  readonly kind: typeof INSTANTIATION_KIND;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly policyDigest: Hex;
  readonly releaseCommit: string;
  readonly releaseTree: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewedSubjectSha256: Hex;
  readonly recovery: BscTestnetPtaWbnbPoolRuntimeReviewRecoveryBinding;
  readonly reviewerTaskLabels: readonly string[];
  readonly policyReviewedAt: string;
  readonly policyExpiresAt: string;
  readonly envelopeHash: Hex;
  readonly executionEnvelopeObservedAt: string;
  readonly instantiatedAt: string;
  readonly expiresAt: string;
  readonly automatedPolicyApplication: true;
  readonly reviewerInspectedExactEnvelope: false;
  readonly reviewIsNotTransactionAuthorization: true;
  readonly instantiationDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding {
  readonly releaseCommit: string;
  readonly releaseTree: string;
  readonly runtimeManifestSha256: Hex;
  readonly policyDigest: Hex;
  readonly reviewedSubjectSha256: Hex;
  readonly recovery: BscTestnetPtaWbnbPoolRuntimeReviewRecoveryBinding;
  readonly envelopeHash: Hex;
  readonly executionEnvelopeObservedAt: string;
  readonly expiresAt: string;
  readonly instantiationDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolReleaseReviewPolicyRealm {
  readonly policy: BscTestnetPtaWbnbPoolReleaseReviewPolicy;
  readonly policyDigest: Hex;
  readonly instantiate: (input: unknown) => BscTestnetPtaWbnbPoolRuntimeReviewInstantiation | null;
}

export type BscTestnetPtaWbnbPoolReleaseReviewPolicyAdmissionResult =
  | Readonly<{
      status: "ready";
      realm: BscTestnetPtaWbnbPoolReleaseReviewPolicyRealm;
      policy: BscTestnetPtaWbnbPoolReleaseReviewPolicy;
      policyDigest: Hex;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      realm: null;
      policy: null;
      policyDigest: null;
      issue: Readonly<{ code: string; path: string; message: string }>;
    }>;

export interface BscTestnetPtaWbnbPoolReleaseReviewPolicyTestRealm extends BscTestnetPtaWbnbPoolReleaseReviewPolicyRealm {
  readonly authenticateForTestsOnly: (value: unknown, expectedBinding: unknown) => boolean;
  readonly consumeForTestsOnly: (value: unknown, expectedBinding: unknown) => boolean;
}

interface InstantiationBrandState {
  state: "fresh" | "consumed";
  readonly instantiatedAtMilliseconds: number;
  readonly expiresAtMilliseconds: number;
  readonly policyExpiresAtMilliseconds: number;
  readonly clock: () => Date;
  readonly binding: BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding;
}

const productionInstantiations = new WeakMap<object, InstantiationBrandState>();
let productionPolicyAdmissionAttempted = false;

function inspectExactRecord(value: unknown, keys: readonly string[]): DataRecord | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return null;
    const actual = (ownKeys as string[]).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
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

function inspectExactArray(
  value: unknown,
  minimum: number,
  maximum: number
): readonly unknown[] | null {
  try {
    if (
      !Array.isArray(value) ||
      isProxy(value) ||
      value.length < minimum ||
      value.length > maximum
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key === "symbol") ||
      keys.length !== value.length + 1 ||
      !keys.includes("length")
    ) {
      return null;
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
        return null;
      }
    }
    return Array.from(value as unknown[]);
  } catch {
    return null;
  }
}

function exactBytes32(value: unknown): value is Hex {
  return typeof value === "string" && BYTES32.test(value) && value !== ZERO_BYTES32;
}

function exactUtc(value: unknown): Readonly<{ iso: string; milliseconds: number }> | null {
  if (typeof value !== "string" || value.length !== 24 || !UTC.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === value
    ? Object.freeze({ iso: value, milliseconds })
    : null;
}

function parsePredecessorTerminal(
  value: unknown,
  requireFrozen = true
): BscTestnetPtaWbnbPoolPredecessorTerminalBinding | null {
  const terminal = inspectExactRecord(value, PREDECESSOR_TERMINAL_KEYS);
  const recordedAt = terminal === null ? null : exactUtc(terminal.recordedAt);
  if (
    terminal === null ||
    (requireFrozen && !Object.isFrozen(value)) ||
    terminal.status !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE ||
    terminal.generation !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION ||
    terminal.predecessorClaimRawSha256 !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256 ||
    terminal.predecessorTerminalRawSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256 ||
    !exactBytes32(terminal.predecessorEnvelopeHash) ||
    terminal.inheritedPredecessorTerminalRawSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256 ||
    !exactBytes32(terminal.predecessorAttemptId) ||
    terminal.phase !== "post_claim_recheck" ||
    terminal.issueCode !== "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" ||
    terminal.outcomeDigest !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST ||
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
    status: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
    generation: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION,
    predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256,
    predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256,
    predecessorEnvelopeHash: terminal.predecessorEnvelopeHash,
    inheritedPredecessorTerminalRawSha256:
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256,
    predecessorAttemptId: terminal.predecessorAttemptId,
    phase: "post_claim_recheck",
    issueCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN",
    outcomeDigest: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
    workerAuthorizationOutcome: "not_attempted",
    workerStartOutcome: "not_attempted",
    signatureOutcome: "not_attempted",
    submissionOutcome: "not_attempted",
    submissionJournalState: "exact_empty",
    recordedAt: recordedAt.iso
  });
}

function parseRuntimeRecovery(
  value: unknown,
  requireFrozen = true
): BscTestnetPtaWbnbPoolRuntimeReviewRecoveryBinding | null {
  const recovery = inspectExactRecord(value, RUNTIME_RECOVERY_KEYS);
  const predecessorTerminal =
    recovery === null
      ? null
      : parsePredecessorTerminal(recovery.predecessorTerminal, requireFrozen);
  if (
    recovery === null ||
    predecessorTerminal === null ||
    (requireFrozen && !Object.isFrozen(value)) ||
    recovery.generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
  ) {
    return null;
  }
  return Object.freeze({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorTerminal
  });
}

function captureNow(clock: () => Date): number | null {
  try {
    const value = Reflect.apply(clock, undefined, []);
    if (
      value === null ||
      typeof value !== "object" ||
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

function sha256DomainBytes(domain: string, bytes: Uint8Array): Hex {
  return `0x${createHash("sha256").update(domain, "utf8").update("\0", "utf8").update(bytes).digest("hex")}`;
}

function utf8(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function canonicalJsonBytes(value: unknown): Buffer {
  return utf8(JSON.stringify(value));
}

function stableLabel(value: unknown): value is string {
  return typeof value === "string" && value.length <= 96 && STABLE_LABEL.test(value);
}

function validManifestPath(value: unknown): value is string {
  if (value === ".gitattributes") return true;
  if (typeof value !== "string" || !SAFE_PATH.test(value) || value.includes("\\")) return false;
  const segments = value.split("/");
  return (
    segments.length >= 1 &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..") &&
    segments[0] !== ".git"
  );
}

function parseManifest(
  value: unknown,
  requireDeepFreeze = false
): BscTestnetPtaWbnbPoolProductionRuntimeManifest | null {
  const record = inspectExactRecord(value, MANIFEST_KEYS);
  const entries = record === null ? null : inspectExactArray(record.entries, 1, 128);
  if (
    record === null ||
    entries === null ||
    record.schemaVersion !== 2 ||
    record.domain !== BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN ||
    record.nodeVersion !== process.version ||
    !exactBytes32(record.runtimeManifestSha256) ||
    (requireDeepFreeze && (!Object.isFrozen(value) || !Object.isFrozen(record.entries)))
  ) {
    return null;
  }
  const parsedEntries: BscTestnetPtaWbnbPoolProductionRuntimeManifestEntry[] = [];
  let previousPath: string | null = null;
  for (const valueEntry of entries) {
    const entry = inspectExactRecord(valueEntry, MANIFEST_ENTRY_KEYS);
    if (
      entry === null ||
      !validManifestPath(entry.path) ||
      typeof entry.byteLength !== "number" ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength < 0 ||
      entry.byteLength > 16 * 1024 * 1024 ||
      !exactBytes32(entry.sha256) ||
      (previousPath !== null && entry.path <= previousPath) ||
      (requireDeepFreeze && !Object.isFrozen(valueEntry))
    ) {
      return null;
    }
    previousPath = entry.path;
    parsedEntries.push(
      Object.freeze({ path: entry.path, byteLength: entry.byteLength, sha256: entry.sha256 })
    );
  }
  const parsed = Object.freeze({
    schemaVersion: 2,
    domain: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN,
    nodeVersion: record.nodeVersion as string,
    entries: Object.freeze(parsedEntries),
    runtimeManifestSha256: record.runtimeManifestSha256
  });
  const derived = deriveRuntimeManifestSha256(parsed);
  return derived === parsed.runtimeManifestSha256 ? parsed : null;
}

function deriveRuntimeManifestSha256(
  manifest: Pick<
    BscTestnetPtaWbnbPoolProductionRuntimeManifest,
    "schemaVersion" | "domain" | "nodeVersion" | "entries"
  >
): Hex {
  const body = Object.freeze({
    schemaVersion: manifest.schemaVersion,
    domain: manifest.domain,
    nodeVersion: manifest.nodeVersion,
    entries: manifest.entries
  });
  const bytes = canonicalJsonBytes(body);
  try {
    return sha256DomainBytes(BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN, bytes);
  } finally {
    bytes.fill(0);
  }
}

/**
 * Recomputes the exact schema-v2 full-runtime manifest digest. This is an integrity derivation only;
 * it never authenticates a release or mints an authority capability.
 */
export function deriveBscTestnetPtaWbnbPoolProductionRuntimeManifestSha256ForInternalUse(
  untrustedManifestBody: unknown
): Hex | null {
  const body = inspectExactRecord(untrustedManifestBody, MANIFEST_DIGEST_BODY_KEYS);
  const entries = body === null ? null : inspectExactArray(body.entries, 1, 128);
  if (
    body === null ||
    entries === null ||
    !Object.isFrozen(untrustedManifestBody) ||
    !Object.isFrozen(body.entries) ||
    body.schemaVersion !== 2 ||
    body.domain !== BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN ||
    body.nodeVersion !== process.version
  ) {
    return null;
  }
  const parsedEntries: BscTestnetPtaWbnbPoolProductionRuntimeManifestEntry[] = [];
  let previousPath: string | null = null;
  for (const valueEntry of entries) {
    const entry = inspectExactRecord(valueEntry, MANIFEST_ENTRY_KEYS);
    if (
      entry === null ||
      !Object.isFrozen(valueEntry) ||
      !validManifestPath(entry.path) ||
      typeof entry.byteLength !== "number" ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength < 0 ||
      entry.byteLength > 16 * 1024 * 1024 ||
      !exactBytes32(entry.sha256) ||
      (previousPath !== null && entry.path <= previousPath)
    ) {
      return null;
    }
    previousPath = entry.path;
    parsedEntries.push(
      Object.freeze({ path: entry.path, byteLength: entry.byteLength, sha256: entry.sha256 })
    );
  }
  return deriveRuntimeManifestSha256(
    Object.freeze({
      schemaVersion: 2,
      domain: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN,
      nodeVersion: body.nodeVersion as string,
      entries: Object.freeze(parsedEntries)
    })
  );
}

function parseRelease(
  value: unknown,
  requireDeepFreeze = false
): BscTestnetPtaWbnbPoolExactReleaseIdentity | null {
  const release = inspectExactRecord(value, RELEASE_KEYS);
  const manifest =
    release === null ? null : parseManifest(release.runtimeManifest, requireDeepFreeze);
  if (
    release === null ||
    manifest === null ||
    typeof release.releaseCommit !== "string" ||
    typeof release.releaseTree !== "string" ||
    !GIT_OBJECT.test(release.releaseCommit) ||
    !GIT_OBJECT.test(release.releaseTree) ||
    release.releaseCommit === "0".repeat(40) ||
    release.releaseTree === "0".repeat(40) ||
    (requireDeepFreeze && !Object.isFrozen(value))
  ) {
    return null;
  }
  return Object.freeze({
    releaseCommit: release.releaseCommit,
    releaseTree: release.releaseTree,
    runtimeManifest: manifest
  });
}

function sameManifest(
  left: BscTestnetPtaWbnbPoolProductionRuntimeManifest,
  right: BscTestnetPtaWbnbPoolProductionRuntimeManifest
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.domain === right.domain &&
    left.nodeVersion === right.nodeVersion &&
    left.runtimeManifestSha256 === right.runtimeManifestSha256 &&
    left.entries.length === right.entries.length &&
    left.entries.every((entry, index) => {
      const other = right.entries[index];
      return (
        other !== undefined &&
        entry.path === other.path &&
        entry.byteLength === other.byteLength &&
        entry.sha256 === other.sha256
      );
    })
  );
}

function sameRelease(
  left: BscTestnetPtaWbnbPoolExactReleaseIdentity,
  right: BscTestnetPtaWbnbPoolExactReleaseIdentity
): boolean {
  return (
    left.releaseCommit === right.releaseCommit &&
    left.releaseTree === right.releaseTree &&
    sameManifest(left.runtimeManifest, right.runtimeManifest)
  );
}

function exactTransaction(): BscTestnetPtaWbnbPoolReleaseReviewPolicy["transaction"] {
  return Object.freeze({
    chainId: String(BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID) as "97",
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    nonce: BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    selector: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
    valueWei: "0",
    expectedPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
    token0: BSC_TESTNET_PTA_ADDRESS,
    token1: BSC_TESTNET_WBNB_ADDRESS,
    fee: String(BSC_TESTNET_PTA_WBNB_POOL_FEE) as "500",
    sqrtPriceX96:
      BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96.toString() as "79228162514264337593543950",
    expectedTick: "-138163",
    fixedTestScenarioPrice: "1 PTA = 0.000001 WBNB"
  });
}

function exactCaps(): BscTestnetPtaWbnbPoolReleaseReviewPolicy["caps"] {
  return Object.freeze({
    gasMarginBps: BSC_TESTNET_PTA_WBNB_POOL_GAS_MARGIN_BPS.toString() as "2000",
    maximumGasEstimate: BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE.toString() as "5000000",
    maximumGasLimit: BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT.toString() as "6000000",
    maximumGasPriceWei: BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI.toString() as "3000000000",
    maximumTotalCostWei:
      BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI.toString() as "18000000000000000",
    maximumEnvelopeLifetimeSeconds:
      BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS.toString() as "300",
    maximumOwnerConfirmationWindowSeconds:
      BSC_TESTNET_PTA_WBNB_POOL_OWNER_CONFIRMATION_WINDOW_SECONDS.toString() as "240",
    maximumExecutionAuthorityLifetimeSeconds:
      BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS.toString() as "120",
    minimumRemainingBeforeClaimSeconds:
      BSC_TESTNET_PTA_WBNB_POOL_MINIMUM_REMAINING_BEFORE_CLAIM_SECONDS.toString() as "60",
    maximumPostConfirmationPreclaimSeconds:
      BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_POST_CONFIRMATION_PRECLAIM_SECONDS.toString() as "60",
    postRecheckExecutionReserveSeconds:
      BSC_TESTNET_PTA_WBNB_POOL_POST_RECHECK_EXECUTION_RESERVE_SECONDS.toString() as "20",
    maximumPostClaimRecheckAgeSeconds:
      BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS.toString() as "30",
    recoveryGeneration: "7",
    predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256,
    predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256,
    predecessorFailedBeforeWorkerOutcomeDigest:
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
    inheritedPredecessorTerminalRawSha256:
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256
  });
}

function exactScope(): BscTestnetPtaWbnbPoolReleaseReviewPolicy["scope"] {
  return Object.freeze({
    exactFreshEnvelopeRequired: true,
    maximumSignatureCount: "1",
    maximumSubmissionCount: "1",
    broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity",
    liquidityActionAuthorized: false,
    lpPositionMintAuthorized: false,
    tokenApprovalAuthorized: false,
    tokenTransferAuthorized: false,
    mainnetWriteAuthorized: false,
    initializerHasNoDeadline: true,
    publicMempoolCanRace: true,
    priceIsMarketPriceOraclePegOrValuation: false,
    predecessorTerminalRecordRequired: true,
    predecessorFailedBeforeWorkerEvidenceRequired: true,
    predecessorStateRequired: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
    predecessorIssueCodeRequired: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN",
    predecessorPhaseRequired: "post_claim_recheck",
    predecessorWorkerAuthorizationOutcomeRequired: "not_attempted",
    predecessorWorkerStartOutcomeRequired: "not_attempted",
    predecessorSignatureOutcomeRequired: "not_attempted",
    predecessorSubmissionV5JournalStateRequired: "exact_empty",
    predecessorSubmissionOutcomeRequired: "not_attempted",
    freshEnvelopeAfterTerminalRequired: true
  });
}

function exactLimitations(): BscTestnetPtaWbnbPoolReleaseReviewPolicy["limitations"] {
  return Object.freeze({
    ownerDesignatedInternalReview: true,
    cryptographicReviewerIdentityAvailable: false,
    externalIndependentReviewAvailable: false,
    sigstoreAttestationAvailable: false,
    reviewIsNotTransactionAuthorization: true,
    separateExactOwnerTransactionAuthorizationRequired: true,
    reviewersDidNotInspectFutureRuntimeEnvelopes: true,
    automatedPolicyApplicationRequired: true
  });
}

function sameRecordValues(
  value: DataRecord,
  expected: DataRecord,
  keys: readonly string[]
): boolean {
  return keys.every((key) => value[key] === expected[key]);
}

function reviewedSubject(release: BscTestnetPtaWbnbPoolExactReleaseIdentity): Readonly<{
  operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  release: BscTestnetPtaWbnbPoolExactReleaseIdentity;
  transaction: BscTestnetPtaWbnbPoolReleaseReviewPolicy["transaction"];
  caps: BscTestnetPtaWbnbPoolReleaseReviewPolicy["caps"];
  scope: BscTestnetPtaWbnbPoolReleaseReviewPolicy["scope"];
}> {
  return Object.freeze({
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    release,
    transaction: exactTransaction(),
    caps: exactCaps(),
    scope: exactScope()
  });
}

export function deriveBscTestnetPtaWbnbPoolReleaseReviewSubjectSha256ForInternalUse(
  untrustedRelease: unknown
): Hex | null {
  const release = parseRelease(untrustedRelease, true);
  if (release === null) return null;
  const bytes = canonicalJsonBytes(reviewedSubject(release));
  try {
    return sha256DomainBytes(BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_SUBJECT_DOMAIN, bytes);
  } finally {
    bytes.fill(0);
  }
}

function parsePolicyBody(
  value: unknown,
  expectedRelease: BscTestnetPtaWbnbPoolExactReleaseIdentity,
  now: number
): Omit<BscTestnetPtaWbnbPoolReleaseReviewPolicy, "policyDigest"> | null {
  const policy = inspectExactRecord(value, POLICY_BODY_KEYS);
  const release = policy === null ? null : parseRelease(policy.release);
  const transaction =
    policy === null ? null : inspectExactRecord(policy.transaction, TRANSACTION_KEYS);
  const caps = policy === null ? null : inspectExactRecord(policy.caps, CAPS_KEYS);
  const scope = policy === null ? null : inspectExactRecord(policy.scope, SCOPE_KEYS);
  const limitations =
    policy === null ? null : inspectExactRecord(policy.limitations, LIMITATION_KEYS);
  const reviewerValues = policy === null ? null : inspectExactArray(policy.reviewers, 2, 3);
  const reviewedAt = policy === null ? null : exactUtc(policy.reviewedAt);
  const expiresAt = policy === null ? null : exactUtc(policy.expiresAt);
  const expectedTransaction = exactTransaction();
  const expectedCaps = exactCaps();
  const expectedScope = exactScope();
  const expectedLimitations = exactLimitations();
  const expectedSubjectDigest =
    deriveBscTestnetPtaWbnbPoolReleaseReviewSubjectSha256ForInternalUse(expectedRelease);
  if (
    policy === null ||
    release === null ||
    transaction === null ||
    caps === null ||
    scope === null ||
    limitations === null ||
    reviewerValues === null ||
    reviewedAt === null ||
    expiresAt === null ||
    expectedSubjectDigest === null ||
    policy.schemaVersion !== 7 ||
    policy.kind !== POLICY_KIND ||
    policy.decision !== POLICY_DECISION ||
    policy.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    !sameRelease(release, expectedRelease) ||
    !sameRecordValues(transaction, expectedTransaction, TRANSACTION_KEYS) ||
    !sameRecordValues(caps, expectedCaps, CAPS_KEYS) ||
    !sameRecordValues(scope, expectedScope, SCOPE_KEYS) ||
    !sameRecordValues(limitations, expectedLimitations, LIMITATION_KEYS) ||
    policy.reviewedSubjectSha256 !== expectedSubjectDigest ||
    !stableLabel(policy.implementationAgentIdentity) ||
    reviewedAt.milliseconds > now ||
    now - reviewedAt.milliseconds > MAXIMUM_POLICY_AGE_MILLISECONDS ||
    expiresAt.milliseconds <= now ||
    expiresAt.milliseconds <= reviewedAt.milliseconds ||
    expiresAt.milliseconds - reviewedAt.milliseconds > MAXIMUM_POLICY_LIFETIME_MILLISECONDS
  ) {
    return null;
  }
  const reviewers: BscTestnetPtaWbnbPoolReleaseReviewPolicy["reviewers"][number][] = [];
  const taskLabels = new Set<string>();
  for (const reviewerValue of reviewerValues) {
    const reviewer = inspectExactRecord(reviewerValue, REVIEWER_KEYS);
    if (
      reviewer === null ||
      !stableLabel(reviewer.taskLabel) ||
      !stableLabel(reviewer.modelRole) ||
      reviewer.taskLabel === policy.implementationAgentIdentity ||
      reviewer.decision !== REVIEWER_DECISION ||
      reviewer.p0Findings !== 0 ||
      reviewer.p1Findings !== 0 ||
      reviewer.reviewedSubjectSha256 !== expectedSubjectDigest ||
      taskLabels.has(reviewer.taskLabel)
    ) {
      return null;
    }
    taskLabels.add(reviewer.taskLabel);
    reviewers.push(
      Object.freeze({
        taskLabel: reviewer.taskLabel,
        modelRole: reviewer.modelRole,
        decision: REVIEWER_DECISION,
        p0Findings: 0,
        p1Findings: 0,
        reviewedSubjectSha256: expectedSubjectDigest
      })
    );
  }
  for (let index = 1; index < reviewers.length; index += 1) {
    const previous = reviewers[index - 1];
    const current = reviewers[index];
    if (
      previous === undefined ||
      current === undefined ||
      current.taskLabel <= previous.taskLabel
    ) {
      return null;
    }
  }
  return Object.freeze({
    schemaVersion: 7,
    kind: POLICY_KIND,
    decision: POLICY_DECISION,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    release,
    transaction: expectedTransaction,
    caps: expectedCaps,
    scope: expectedScope,
    reviewedSubjectSha256: expectedSubjectDigest,
    implementationAgentIdentity: policy.implementationAgentIdentity,
    reviewers: Object.freeze(reviewers),
    reviewedAt: reviewedAt.iso,
    expiresAt: expiresAt.iso,
    limitations: expectedLimitations
  });
}

function parseCanonicalPolicyBytes(
  untrustedBytes: unknown,
  expectedRelease: BscTestnetPtaWbnbPoolExactReleaseIdentity,
  now: number
): BscTestnetPtaWbnbPoolReleaseReviewPolicy | null {
  if (
    isProxy(untrustedBytes) ||
    !(untrustedBytes instanceof Uint8Array) ||
    untrustedBytes.byteLength === 0 ||
    untrustedBytes.byteLength > MAXIMUM_POLICY_BYTES
  ) {
    return null;
  }
  let owned: Buffer | null = null;
  let bodyBytes: Buffer | null = null;
  let canonicalBytes: Buffer | null = null;
  try {
    owned = Buffer.from(untrustedBytes);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(owned);
    const parsed: unknown = JSON.parse(text);
    const outer = inspectExactRecord(parsed, POLICY_KEYS);
    const bodyCandidate =
      outer === null
        ? null
        : Object.freeze(
            Object.fromEntries(POLICY_BODY_KEYS.map((key) => [key, outer[key]])) as DataRecord
          );
    const body = parsePolicyBody(bodyCandidate, expectedRelease, now);
    if (outer === null || body === null || !exactBytes32(outer.policyDigest)) return null;
    bodyBytes = canonicalJsonBytes(body);
    const expectedDigest = sha256DomainBytes(
      BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_POLICY_DIGEST_DOMAIN,
      bodyBytes
    );
    if (outer.policyDigest !== expectedDigest) return null;
    const policy = Object.freeze({ ...body, policyDigest: expectedDigest });
    canonicalBytes = canonicalJsonBytes(policy);
    if (owned.byteLength !== canonicalBytes.byteLength || !timingSafeEqual(owned, canonicalBytes)) {
      return null;
    }
    return policy;
  } catch {
    return null;
  } finally {
    owned?.fill(0);
    bodyBytes?.fill(0);
    canonicalBytes?.fill(0);
  }
}

function buildInstantiation(
  policy: BscTestnetPtaWbnbPoolReleaseReviewPolicy,
  input: unknown,
  now: number
): BscTestnetPtaWbnbPoolRuntimeReviewInstantiation | null {
  const record = inspectExactRecord(input, INSTANTIATION_INPUT_KEYS);
  const predecessorTerminal =
    record === null ? null : parsePredecessorTerminal(record.predecessorTerminal, true);
  const predecessorRecordedAt =
    predecessorTerminal === null ? null : exactUtc(predecessorTerminal.recordedAt);
  const executionEnvelopeObservedAt =
    record === null ? null : exactUtc(record.executionEnvelopeObservedAt);
  const envelopeExpiry = record === null ? null : exactUtc(record.expiresAt);
  const policyReviewedAt = exactUtc(policy.reviewedAt);
  const policyExpiry = exactUtc(policy.expiresAt);
  if (
    record === null ||
    predecessorTerminal === null ||
    predecessorRecordedAt === null ||
    executionEnvelopeObservedAt === null ||
    !Object.isFrozen(input) ||
    envelopeExpiry === null ||
    policyReviewedAt === null ||
    policyExpiry === null ||
    !exactBytes32(record.envelopeHash) ||
    record.envelopeHash === predecessorTerminal.predecessorEnvelopeHash ||
    predecessorRecordedAt.milliseconds >= executionEnvelopeObservedAt.milliseconds ||
    executionEnvelopeObservedAt.milliseconds > now ||
    now < policyReviewedAt.milliseconds ||
    now >= policyExpiry.milliseconds ||
    envelopeExpiry.milliseconds <= now ||
    envelopeExpiry.milliseconds >
      now + BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS * 1_000 ||
    envelopeExpiry.milliseconds > policyExpiry.milliseconds
  ) {
    return null;
  }
  const body = Object.freeze({
    schemaVersion: 7 as const,
    kind: INSTANTIATION_KIND,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    policyDigest: policy.policyDigest,
    releaseCommit: policy.release.releaseCommit,
    releaseTree: policy.release.releaseTree,
    runtimeManifestSha256: policy.release.runtimeManifest.runtimeManifestSha256,
    reviewedSubjectSha256: policy.reviewedSubjectSha256,
    recovery: Object.freeze({
      generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
      predecessorTerminal
    }),
    reviewerTaskLabels: Object.freeze(policy.reviewers.map((reviewer) => reviewer.taskLabel)),
    policyReviewedAt: policy.reviewedAt,
    policyExpiresAt: policy.expiresAt,
    envelopeHash: record.envelopeHash,
    executionEnvelopeObservedAt: executionEnvelopeObservedAt.iso,
    instantiatedAt: new Date(now).toISOString(),
    expiresAt: envelopeExpiry.iso,
    automatedPolicyApplication: true as const,
    reviewerInspectedExactEnvelope: false as const,
    reviewIsNotTransactionAuthorization: true as const
  });
  const bytes = canonicalJsonBytes(body);
  try {
    return Object.freeze({
      ...body,
      instantiationDigest: sha256DomainBytes(
        BSC_TESTNET_PTA_WBNB_POOL_RUNTIME_REVIEW_INSTANTIATION_DIGEST_DOMAIN,
        bytes
      )
    });
  } finally {
    bytes.fill(0);
  }
}

function buildRealm(
  policy: BscTestnetPtaWbnbPoolReleaseReviewPolicy,
  clock: () => Date,
  brands: WeakMap<object, InstantiationBrandState>
): BscTestnetPtaWbnbPoolReleaseReviewPolicyRealm {
  let issued = false;
  const instantiate = (input: unknown): BscTestnetPtaWbnbPoolRuntimeReviewInstantiation | null => {
    if (issued) return null;
    const now = captureNow(clock);
    if (now === null) return null;
    const instantiation = buildInstantiation(policy, input, now);
    if (instantiation === null) return null;
    issued = true;
    const expiresAt = exactUtc(instantiation.expiresAt);
    const policyExpiresAt = exactUtc(instantiation.policyExpiresAt);
    if (expiresAt === null || policyExpiresAt === null) return null;
    brands.set(instantiation, {
      state: "fresh",
      instantiatedAtMilliseconds: now,
      expiresAtMilliseconds: expiresAt.milliseconds,
      policyExpiresAtMilliseconds: policyExpiresAt.milliseconds,
      clock,
      binding: Object.freeze({
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
      })
    });
    return instantiation;
  };
  return Object.freeze({ policy, policyDigest: policy.policyDigest, instantiate });
}

function blocked(
  code: string,
  path: string,
  message: string
): BscTestnetPtaWbnbPoolReleaseReviewPolicyAdmissionResult {
  return Object.freeze({
    status: "blocked" as const,
    realm: null,
    policy: null,
    policyDigest: null,
    issue: Object.freeze({ code, path, message })
  });
}

function ready(
  realm: BscTestnetPtaWbnbPoolReleaseReviewPolicyRealm
): BscTestnetPtaWbnbPoolReleaseReviewPolicyAdmissionResult {
  return Object.freeze({
    status: "ready" as const,
    realm,
    policy: realm.policy,
    policyDigest: realm.policyDigest,
    issue: null
  });
}

function authenticates(
  brands: WeakMap<object, InstantiationBrandState>,
  value: unknown,
  expectedBinding: unknown
): value is BscTestnetPtaWbnbPoolRuntimeReviewInstantiation {
  try {
    const state =
      value !== null && typeof value === "object" && !isProxy(value)
        ? brands.get(value)
        : undefined;
    const binding = parseExpectedInstantiationBinding(expectedBinding);
    const now = state === undefined ? null : captureNow(state.clock);
    return (
      value !== null &&
      typeof value === "object" &&
      !isProxy(value) &&
      Object.isFrozen(value) &&
      state?.state === "fresh" &&
      binding !== null &&
      sameExpectedInstantiationBinding(state.binding, binding) &&
      now !== null &&
      now >= state.instantiatedAtMilliseconds &&
      now < state.expiresAtMilliseconds &&
      now < state.policyExpiresAtMilliseconds
    );
  } catch {
    return false;
  }
}

function parseExpectedInstantiationBinding(
  value: unknown
): BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding | null {
  const binding = inspectExactRecord(value, INSTANTIATION_EXPECTED_BINDING_KEYS);
  const expiresAt = binding === null ? null : exactUtc(binding.expiresAt);
  const recovery = binding === null ? null : parseRuntimeRecovery(binding.recovery, true);
  const executionEnvelopeObservedAt =
    binding === null ? null : exactUtc(binding.executionEnvelopeObservedAt);
  const predecessorRecordedAt =
    recovery === null ? null : exactUtc(recovery.predecessorTerminal.recordedAt);
  if (
    binding === null ||
    !Object.isFrozen(value) ||
    typeof binding.releaseCommit !== "string" ||
    typeof binding.releaseTree !== "string" ||
    !GIT_OBJECT.test(binding.releaseCommit) ||
    !GIT_OBJECT.test(binding.releaseTree) ||
    !exactBytes32(binding.runtimeManifestSha256) ||
    !exactBytes32(binding.policyDigest) ||
    !exactBytes32(binding.reviewedSubjectSha256) ||
    recovery === null ||
    executionEnvelopeObservedAt === null ||
    predecessorRecordedAt === null ||
    executionEnvelopeObservedAt.milliseconds <= predecessorRecordedAt.milliseconds ||
    !exactBytes32(binding.envelopeHash) ||
    expiresAt === null ||
    !exactBytes32(binding.instantiationDigest)
  ) {
    return null;
  }
  return Object.freeze({
    releaseCommit: binding.releaseCommit,
    releaseTree: binding.releaseTree,
    runtimeManifestSha256: binding.runtimeManifestSha256,
    policyDigest: binding.policyDigest,
    reviewedSubjectSha256: binding.reviewedSubjectSha256,
    recovery,
    envelopeHash: binding.envelopeHash,
    executionEnvelopeObservedAt: executionEnvelopeObservedAt.iso,
    expiresAt: expiresAt.iso,
    instantiationDigest: binding.instantiationDigest
  });
}

function sameExpectedInstantiationBinding(
  left: BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding,
  right: BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding
): boolean {
  const scalarKeys = INSTANTIATION_EXPECTED_BINDING_KEYS.filter((key) => key !== "recovery");
  return (
    scalarKeys.every((key) => left[key] === right[key]) &&
    left.recovery.generation === right.recovery.generation &&
    PREDECESSOR_TERMINAL_KEYS.every(
      (key) => left.recovery.predecessorTerminal[key] === right.recovery.predecessorTerminal[key]
    )
  );
}

function consumes(
  brands: WeakMap<object, InstantiationBrandState>,
  value: unknown,
  expectedBinding: unknown
): boolean {
  try {
    if (value === null || typeof value !== "object" || isProxy(value)) return false;
    const state = brands.get(value);
    if (state === undefined || state.state !== "fresh") return false;
    // Terminal before inspecting caller-controlled binding or clock: a mismatch cannot be retried.
    state.state = "consumed";
    const binding = parseExpectedInstantiationBinding(expectedBinding);
    const now = captureNow(state.clock);
    return (
      Object.isFrozen(value) &&
      binding !== null &&
      sameExpectedInstantiationBinding(state.binding, binding) &&
      now !== null &&
      now >= state.instantiatedAtMilliseconds &&
      now < state.expiresAtMilliseconds &&
      now < state.policyExpiresAtMilliseconds
    );
  } catch {
    return false;
  }
}

/**
 * Authenticity is a private production object brand, not a JSON digest or structural match. Test
 * realms use a different WeakMap and can never pass this check.
 */
export function authenticateBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse(
  value: unknown,
  expectedBinding: unknown
): value is BscTestnetPtaWbnbPoolRuntimeReviewInstantiation {
  return authenticates(productionInstantiations, value, expectedBinding);
}

/** Atomically consumes the only production runtime-policy instantiation. */
export function consumeBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse(
  value: unknown,
  expectedBinding: unknown
): boolean {
  return consumes(productionInstantiations, value, expectedBinding);
}

interface TtyPolicyFrameMetadata {
  readonly chunkCount: number;
  readonly policyByteLength: number;
  readonly encodedCharacterLength: number;
  readonly policySha256: Hex;
}

function parseCanonicalUnsignedInteger(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function unpaddedBase64UrlLength(byteLength: number): number {
  return Math.floor((byteLength * 4 + 2) / 3);
}

function exactFrameField(value: string, key: string): string | null {
  const prefix = `${key}=`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

/**
 * Stateful, bounded ASCII decoder for the v2 BEGIN/CHUNK/END transport. It owns and wipes every
 * retained transport fragment. Completing this decoder yields only untrusted policy bytes; it does
 * not parse a policy or mint a production authority brand.
 */
class TtyPolicyFrameDecoder {
  readonly #nonce: Hex;
  readonly #startedAtMilliseconds: number;
  readonly #notAfterMilliseconds: number;
  readonly #line = Buffer.alloc(MAXIMUM_TTY_LINE_BYTES);
  readonly #encodedChunks: Buffer[] = [];
  #lineLength = 0;
  #totalBytes = 0;
  #pendingCarriageReturn = false;
  #state: "begin" | "chunks" | "complete" | "invalid" = "begin";
  #metadata: TtyPolicyFrameMetadata | null = null;
  #nextChunkIndex = 0;
  #result: Buffer | null = null;
  #lastObservedAtMilliseconds: number;

  constructor(
    nonce: Hex,
    startedAtMilliseconds: number,
    notAfterMilliseconds: number,
    initialObservedAtMilliseconds: number
  ) {
    this.#nonce = nonce;
    this.#startedAtMilliseconds = startedAtMilliseconds;
    this.#notAfterMilliseconds = notAfterMilliseconds;
    this.#lastObservedAtMilliseconds = initialObservedAtMilliseconds;
  }

  get complete(): boolean {
    return this.#state === "complete";
  }

  push(value: unknown, observedAtMilliseconds: number): boolean {
    if (
      this.#state === "invalid" ||
      !Buffer.isBuffer(value) ||
      value.byteLength === 0 ||
      !Number.isSafeInteger(observedAtMilliseconds) ||
      observedAtMilliseconds < this.#startedAtMilliseconds ||
      observedAtMilliseconds < this.#lastObservedAtMilliseconds ||
      observedAtMilliseconds >= this.#notAfterMilliseconds ||
      this.#totalBytes + value.byteLength > MAXIMUM_TTY_FRAME_BYTES
    ) {
      return this.#invalidate();
    }
    this.#lastObservedAtMilliseconds = observedAtMilliseconds;
    this.#totalBytes += value.byteLength;
    for (let offset = 0; offset < value.byteLength; offset += 1) {
      if (this.#state === "complete") return this.#invalidate();
      const byte = value[offset];
      if (byte === undefined) return this.#invalidate();
      if (this.#pendingCarriageReturn) {
        if (byte !== 0x0a) return this.#invalidate();
        this.#pendingCarriageReturn = false;
        if (!this.#finishLine()) return false;
        continue;
      }
      if (byte === 0x0d) {
        this.#pendingCarriageReturn = true;
        continue;
      }
      if (byte === 0x0a) {
        if (!this.#finishLine()) return false;
        continue;
      }
      if (byte < 0x20 || byte > 0x7e || this.#lineLength >= MAXIMUM_TTY_LINE_BYTES) {
        return this.#invalidate();
      }
      this.#line[this.#lineLength] = byte;
      this.#lineLength += 1;
    }
    return true;
  }

  takeResult(observedAtMilliseconds: number): Buffer | null {
    if (
      !Number.isSafeInteger(observedAtMilliseconds) ||
      observedAtMilliseconds < this.#lastObservedAtMilliseconds ||
      observedAtMilliseconds >= this.#notAfterMilliseconds ||
      this.#state !== "complete" ||
      this.#pendingCarriageReturn ||
      this.#lineLength !== 0 ||
      this.#result === null
    ) {
      this.#invalidate();
      return null;
    }
    this.#lastObservedAtMilliseconds = observedAtMilliseconds;
    const result = this.#result;
    this.#result = null;
    return result;
  }

  destroy(): void {
    this.#line.fill(0);
    for (const chunk of this.#encodedChunks) chunk.fill(0);
    this.#encodedChunks.length = 0;
    this.#result?.fill(0);
    this.#result = null;
    this.#metadata = null;
    this.#state = "invalid";
  }

  #finishLine(): boolean {
    if (this.#lineLength === 0) return this.#invalidate();
    const line = this.#line.subarray(0, this.#lineLength).toString("ascii");
    this.#line.fill(0, 0, this.#lineLength);
    this.#lineLength = 0;
    return this.#acceptLine(line);
  }

  #acceptLine(line: string): boolean {
    const fields = line.split("|");
    if (
      fields[0] !== BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN ||
      fields[1] !== `nonce=${this.#nonce}`
    ) {
      return this.#invalidate();
    }
    if (this.#state === "begin") return this.#acceptBegin(fields);
    if (this.#state !== "chunks" || this.#metadata === null) return this.#invalidate();
    return this.#nextChunkIndex < this.#metadata.chunkCount
      ? this.#acceptChunk(fields, this.#metadata)
      : this.#acceptEnd(fields, this.#metadata);
  }

  #acceptBegin(fields: string[]): boolean {
    if (fields.length !== 7 || fields[2] !== "line-index=0" || fields[3] !== "kind=BEGIN") {
      return this.#invalidate();
    }
    const chunkCountText = exactFrameField(fields[4] ?? "", "chunk-count");
    const policyByteLengthText = exactFrameField(fields[5] ?? "", "policy-byte-length");
    const policySha256 = exactFrameField(fields[6] ?? "", "policy-sha256");
    if (chunkCountText === null || policyByteLengthText === null || policySha256 === null) {
      return this.#invalidate();
    }
    const chunkCount = parseCanonicalUnsignedInteger(chunkCountText);
    const policyByteLength = parseCanonicalUnsignedInteger(policyByteLengthText);
    if (
      chunkCount === null ||
      policyByteLength === null ||
      policyByteLength < 1 ||
      policyByteLength > MAXIMUM_POLICY_BYTES ||
      !BYTES32.test(policySha256)
    ) {
      return this.#invalidate();
    }
    const encodedCharacterLength = unpaddedBase64UrlLength(policyByteLength);
    const exactChunkCount = Math.ceil(encodedCharacterLength / TTY_POLICY_CHUNK_CHARACTERS);
    if (chunkCount !== exactChunkCount || exactChunkCount > MAXIMUM_TTY_POLICY_CHUNKS) {
      return this.#invalidate();
    }
    this.#metadata = Object.freeze({
      chunkCount,
      policyByteLength,
      encodedCharacterLength,
      policySha256: policySha256 as Hex
    });
    this.#state = "chunks";
    return true;
  }

  #acceptChunk(fields: string[], metadata: TtyPolicyFrameMetadata): boolean {
    if (
      fields.length !== 9 ||
      fields[2] !== `line-index=${this.#nextChunkIndex + 1}` ||
      fields[3] !== "kind=CHUNK" ||
      fields[4] !== `chunk-index=${this.#nextChunkIndex}` ||
      fields[5] !== `chunk-count=${metadata.chunkCount}` ||
      fields[6] !== `policy-byte-length=${metadata.policyByteLength}` ||
      fields[7] !== `policy-sha256=${metadata.policySha256}`
    ) {
      return this.#invalidate();
    }
    const payload = exactFrameField(fields[8] ?? "", "policy-base64url");
    const expectedLength = Math.min(
      TTY_POLICY_CHUNK_CHARACTERS,
      metadata.encodedCharacterLength - this.#nextChunkIndex * TTY_POLICY_CHUNK_CHARACTERS
    );
    if (
      payload === null ||
      payload.length !== expectedLength ||
      !/^[A-Za-z0-9_-]+$/u.test(payload)
    ) {
      return this.#invalidate();
    }
    this.#encodedChunks.push(Buffer.from(payload, "ascii"));
    this.#nextChunkIndex += 1;
    return true;
  }

  #acceptEnd(fields: string[], metadata: TtyPolicyFrameMetadata): boolean {
    if (
      fields.length !== 7 ||
      fields[2] !== `line-index=${metadata.chunkCount + 1}` ||
      fields[3] !== "kind=END" ||
      fields[4] !== `chunk-count=${metadata.chunkCount}` ||
      fields[5] !== `policy-byte-length=${metadata.policyByteLength}` ||
      fields[6] !== `policy-sha256=${metadata.policySha256}`
    ) {
      return this.#invalidate();
    }
    const encoded = Buffer.concat(this.#encodedChunks, metadata.encodedCharacterLength);
    let decoded: Buffer | null = null;
    let actualSha256: Buffer | null = null;
    try {
      const encodedText = encoded.toString("ascii");
      decoded = Buffer.from(encodedText, "base64url");
      actualSha256 = createHash("sha256").update(decoded).digest();
      const expectedSha256 = Buffer.from(metadata.policySha256.slice(2), "hex");
      try {
        if (
          decoded.byteLength !== metadata.policyByteLength ||
          decoded.toString("base64url") !== encodedText ||
          actualSha256.byteLength !== expectedSha256.byteLength ||
          !timingSafeEqual(actualSha256, expectedSha256)
        ) {
          decoded.fill(0);
          decoded = null;
          return this.#invalidate();
        }
      } finally {
        expectedSha256.fill(0);
      }
      this.#result = decoded;
      decoded = null;
      this.#state = "complete";
      return true;
    } catch {
      decoded?.fill(0);
      return this.#invalidate();
    } finally {
      encoded.fill(0);
      actualSha256?.fill(0);
      for (const chunk of this.#encodedChunks) chunk.fill(0);
      this.#encodedChunks.length = 0;
    }
  }

  #invalidate(): false {
    this.destroy();
    return false;
  }
}

async function writeTtyChallenge(challenge: Uint8Array): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    stdout.write(challenge, (error) => {
      if (error === null || error === undefined) resolvePromise();
      else rejectPromise(error);
    });
  });
}

async function readExactTtyPolicyFrame(
  nonce: Hex,
  startedAtMilliseconds: number,
  notAfterMilliseconds: number
): Promise<Buffer> {
  const observedAtMilliseconds = Date.now();
  const remaining = notAfterMilliseconds - observedAtMilliseconds;
  if (
    !Number.isSafeInteger(observedAtMilliseconds) ||
    observedAtMilliseconds < startedAtMilliseconds ||
    remaining <= 0 ||
    remaining > TTY_POLICY_ENTRY_WINDOW_MILLISECONDS ||
    stdin.isTTY !== true ||
    stdout.isTTY !== true ||
    stdin.readableEncoding !== null ||
    stdin.listenerCount("data") !== 0 ||
    stdin.listenerCount("readable") !== 0 ||
    stdin.readableLength !== 0 ||
    stdin.readableFlowing === true
  ) {
    throw new Error("TTY_UNAVAILABLE");
  }
  return new Promise<Buffer>((resolvePromise, rejectPromise) => {
    const decoder = new TtyPolicyFrameDecoder(
      nonce,
      startedAtMilliseconds,
      notAfterMilliseconds,
      observedAtMilliseconds
    );
    let settled = false;
    let finishScheduled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      stdin.off("data", onData);
      stdin.off("error", onError);
      stdin.off("end", onEnd);
      stdin.pause();
    };
    const fail = (code = "TTY_FRAME_INVALID"): void => {
      if (settled) return;
      settled = true;
      cleanup();
      decoder.destroy();
      rejectPromise(new Error(code));
    };
    const finish = (): void => {
      if (settled) return;
      const observedAtMilliseconds = Date.now();
      if (
        !Number.isSafeInteger(observedAtMilliseconds) ||
        observedAtMilliseconds < startedAtMilliseconds
      ) {
        return fail();
      }
      if (observedAtMilliseconds >= notAfterMilliseconds) return fail("TTY_FRAME_EXPIRED");
      if (stdin.readableLength !== 0) return fail();
      const result = decoder.takeResult(observedAtMilliseconds);
      if (result === null) return fail();
      settled = true;
      cleanup();
      decoder.destroy();
      resolvePromise(result);
    };
    const onError = (): void => fail("TTY_IO_FAILED");
    const onEnd = (): void => fail("TTY_IO_FAILED");
    const onData = (value: unknown): void => {
      const observedAtMilliseconds = Date.now();
      if (
        !Number.isSafeInteger(observedAtMilliseconds) ||
        observedAtMilliseconds < startedAtMilliseconds
      ) {
        return fail();
      }
      if (observedAtMilliseconds >= notAfterMilliseconds) return fail("TTY_FRAME_EXPIRED");
      if (settled || !decoder.push(value, observedAtMilliseconds)) return fail();
      if (decoder.complete && !finishScheduled) {
        finishScheduled = true;
        setImmediate(finish);
      }
    };
    const timer = setTimeout(() => fail("TTY_FRAME_EXPIRED"), remaining);
    stdin.once("error", onError);
    stdin.once("end", onEnd);
    stdin.on("data", onData);
    stdin.resume();
  });
}

/**
 * Production-only phase-one admission. The caller must perform restart-first journal recovery
 * before calling this function. It accepts policy bytes only through a fresh nonce-bound controlling
 * TTY frame; argv, environment variables, files, network, custody, signing and broadcasting are not
 * consulted here. A second admission attempt in the same process fails closed.
 */
export async function readBscTestnetPtaWbnbPoolReleaseReviewPolicyFromControllingTtyForInternalUse(
  untrustedExpectedRelease: unknown
): Promise<BscTestnetPtaWbnbPoolReleaseReviewPolicyAdmissionResult> {
  if (productionPolicyAdmissionAttempted) {
    return blocked(
      "POLICY_ADMISSION_ALREADY_ATTEMPTED",
      "policy",
      "This process permits exactly one release-review policy admission attempt."
    );
  }
  productionPolicyAdmissionAttempted = true;
  const expectedRelease = parseRelease(untrustedExpectedRelease, true);
  if (expectedRelease === null) {
    return blocked(
      "RELEASE_IDENTITY_INVALID",
      "expectedRelease",
      "The exact schema-v2 production runtime release identity is invalid."
    );
  }
  if (
    stdin.isTTY !== true ||
    stdout.isTTY !== true ||
    stdin.readableEncoding !== null ||
    stdin.listenerCount("data") !== 0 ||
    stdin.listenerCount("readable") !== 0 ||
    stdin.readableLength !== 0 ||
    stdin.readableFlowing === true
  ) {
    return blocked(
      "CONTROLLING_TTY_REQUIRED",
      "tty",
      "A clean controlling TTY with no buffered or preloaded input is required."
    );
  }
  const startedAt = Date.now();
  if (!Number.isSafeInteger(startedAt) || startedAt < 0) {
    return blocked("CLOCK_INVALID", "clock", "The policy admission clock is invalid.");
  }
  const nonceBytes = randomBytes(32);
  const nonce = `0x${nonceBytes.toString("hex")}` as Hex;
  nonceBytes.fill(0);
  const notAfterMilliseconds = startedAt + TTY_POLICY_ENTRY_WINDOW_MILLISECONDS;
  const challenge = utf8(
    [
      BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_CHALLENGE_DOMAIN,
      `nonce=${nonce}`,
      `releaseCommit=${expectedRelease.releaseCommit}`,
      `releaseTree=${expectedRelease.releaseTree}`,
      `runtimeManifestSha256=${expectedRelease.runtimeManifest.runtimeManifestSha256}`,
      `protocol=${BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN}`,
      `limits=ASCII only; LF or CRLF; each line <= ${MAXIMUM_TTY_LINE_BYTES} bytes; total <= ${MAXIMUM_TTY_FRAME_BYTES} bytes; policy <= ${MAXIMUM_POLICY_BYTES} bytes; chunk count <= ${MAXIMUM_TTY_POLICY_CHUNKS}; chunk payload = ${TTY_POLICY_CHUNK_CHARACTERS} base64url characters except the final chunk.`,
      `BEGIN=${BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN}|nonce=${nonce}|line-index=0|kind=BEGIN|chunk-count=<N>|policy-byte-length=<B>|policy-sha256=<0x-lowercase-sha256>`,
      `CHUNK=${BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN}|nonce=${nonce}|line-index=<I+1>|kind=CHUNK|chunk-index=<I>|chunk-count=<N>|policy-byte-length=<B>|policy-sha256=<0x-lowercase-sha256>|policy-base64url=<CHUNK>`,
      `END=${BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN}|nonce=${nonce}|line-index=<N+1>|kind=END|chunk-count=<N>|policy-byte-length=<B>|policy-sha256=<0x-lowercase-sha256>`,
      "This owner-designated internal review is not external, cryptographically identified, Sigstore-attested, or transaction authorization.",
      `Encode the exact canonical policy bytes once as unpadded base64url. Set N=ceil(encoded characters/${TTY_POLICY_CHUNK_CHARACTERS}); use exact ordered chunk indices 0..N-1; then enter BEGIN, every CHUNK, and END before the single five-minute deadline.`,
      ""
    ].join("\n")
  );
  let policyBytes: Buffer | null = null;
  try {
    await writeTtyChallenge(challenge);
    if (stdin.readableLength !== 0 || stdin.listenerCount("data") !== 0) {
      return blocked(
        "PRELOADED_TTY_INPUT_REJECTED",
        "tty",
        "TTY input became buffered before the nonce challenge was ready."
      );
    }
    policyBytes = await readExactTtyPolicyFrame(nonce, startedAt, notAfterMilliseconds);
    await new Promise<void>((resolvePromise) => {
      setImmediate(resolvePromise);
    });
    if (stdin.readableLength !== 0 || stdin.listenerCount("data") !== 0) {
      return blocked(
        "PRELOADED_TTY_INPUT_REJECTED",
        "tty",
        "TTY input remained buffered after the exact terminal END line."
      );
    }
    const now = Date.now();
    if (!Number.isSafeInteger(now) || now < startedAt || now >= notAfterMilliseconds) {
      return blocked("POLICY_FRAME_EXPIRED", "policy", "The bounded TTY policy frame expired.");
    }
    const policy = parseCanonicalPolicyBytes(policyBytes, expectedRelease, now);
    if (policy === null) {
      return blocked(
        "POLICY_INVALID",
        "policy",
        "Policy bytes, digest, release, reviewers, scope, timestamps, or canonical encoding are invalid."
      );
    }
    return ready(buildRealm(policy, () => new Date(), productionInstantiations));
  } catch (error) {
    if (error instanceof Error && error.message === "TTY_FRAME_EXPIRED") {
      return blocked("POLICY_FRAME_EXPIRED", "policy", "The bounded TTY policy frame expired.");
    }
    if (error instanceof Error && error.message === "TTY_FRAME_INVALID") {
      return blocked(
        "POLICY_FRAME_INVALID",
        "policy",
        "The exact nonce-bound canonical policy frame is invalid."
      );
    }
    return blocked(
      "POLICY_TTY_IO_FAILED",
      "tty",
      "The release-review policy TTY phase failed closed."
    );
  } finally {
    challenge.fill(0);
    policyBytes?.fill(0);
  }
}

/**
 * Exercises only the untrusted bounded transport decoder (introduced in v2, current domain v8) in
 * adversarial tests. It cannot parse or admit a policy, access the production WeakMap, or create an
 * authority-bearing realm.
 */
export function decodeBscTestnetPtaWbnbPoolReleaseReviewTtyTransportForTestsOnly(
  untrustedEvents: unknown,
  untrustedNonce: unknown,
  untrustedStartedAtMilliseconds: unknown,
  untrustedNotAfterMilliseconds: unknown
): Uint8Array | null {
  const events = inspectExactArray(untrustedEvents, 1, 256);
  if (
    events === null ||
    typeof untrustedNonce !== "string" ||
    !BYTES32.test(untrustedNonce) ||
    typeof untrustedStartedAtMilliseconds !== "number" ||
    !Number.isSafeInteger(untrustedStartedAtMilliseconds) ||
    untrustedStartedAtMilliseconds < 0 ||
    typeof untrustedNotAfterMilliseconds !== "number" ||
    !Number.isSafeInteger(untrustedNotAfterMilliseconds) ||
    untrustedNotAfterMilliseconds <= untrustedStartedAtMilliseconds ||
    untrustedNotAfterMilliseconds - untrustedStartedAtMilliseconds >
      TTY_POLICY_ENTRY_WINDOW_MILLISECONDS
  ) {
    return null;
  }
  const decoder = new TtyPolicyFrameDecoder(
    untrustedNonce as Hex,
    untrustedStartedAtMilliseconds,
    untrustedNotAfterMilliseconds,
    untrustedStartedAtMilliseconds
  );
  let result: Buffer | null = null;
  let lastObservedAtMilliseconds = untrustedStartedAtMilliseconds;
  try {
    for (const untrustedEvent of events) {
      const event = inspectExactRecord(untrustedEvent, ["bytes", "observedAtMilliseconds"]);
      if (
        event === null ||
        !Buffer.isBuffer(event.bytes) ||
        typeof event.observedAtMilliseconds !== "number" ||
        !Number.isSafeInteger(event.observedAtMilliseconds) ||
        !decoder.push(event.bytes, event.observedAtMilliseconds)
      ) {
        return null;
      }
      lastObservedAtMilliseconds = event.observedAtMilliseconds;
    }
    result = decoder.takeResult(lastObservedAtMilliseconds);
    return result === null ? null : Uint8Array.from(result);
  } catch {
    return null;
  } finally {
    result?.fill(0);
    decoder.destroy();
  }
}

/**
 * Deterministic parser/realm seam for adversarial tests only. Its brands are deliberately local and
 * never authenticate through the production module-level authenticator.
 */
export function createBscTestnetPtaWbnbPoolReleaseReviewPolicyRealmForTestsOnly(
  untrustedPolicyBytes: unknown,
  untrustedExpectedRelease: unknown,
  untrustedClock: unknown
): BscTestnetPtaWbnbPoolReleaseReviewPolicyTestRealm | null {
  const expectedRelease = parseRelease(untrustedExpectedRelease, true);
  if (expectedRelease === null || typeof untrustedClock !== "function" || isProxy(untrustedClock)) {
    return null;
  }
  const clock = untrustedClock as () => Date;
  const now = captureNow(clock);
  if (now === null) return null;
  const policy = parseCanonicalPolicyBytes(untrustedPolicyBytes, expectedRelease, now);
  if (policy === null) return null;
  const testBrands = new WeakMap<object, InstantiationBrandState>();
  const realm = buildRealm(policy, clock, testBrands);
  return Object.freeze({
    ...realm,
    authenticateForTestsOnly: (value: unknown, expectedBinding: unknown): boolean =>
      authenticates(testBrands, value, expectedBinding),
    consumeForTestsOnly: (value: unknown, expectedBinding: unknown): boolean =>
      consumes(testBrands, value, expectedBinding)
  });
}

/** Test-only canonical serializer; returned bytes carry no production authority or brand. */
export function serializeBscTestnetPtaWbnbPoolReleaseReviewPolicyForTestsOnly(
  untrustedBody: unknown,
  untrustedExpectedRelease: unknown,
  untrustedNow: unknown
): Uint8Array | null {
  const expectedRelease = parseRelease(untrustedExpectedRelease, true);
  const now = exactUtc(untrustedNow);
  if (expectedRelease === null || now === null) return null;
  const body = parsePolicyBody(untrustedBody, expectedRelease, now.milliseconds);
  if (body === null) return null;
  const bodyBytes = canonicalJsonBytes(body);
  try {
    const policy = Object.freeze({
      ...body,
      policyDigest: sha256DomainBytes(
        BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_POLICY_DIGEST_DOMAIN,
        bodyBytes
      )
    });
    return Uint8Array.from(canonicalJsonBytes(policy));
  } finally {
    bodyBytes.fill(0);
  }
}
