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
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
  BSC_TESTNET_PTA_WBNB_POOL_FEE,
  BSC_TESTNET_PTA_WBNB_POOL_GAS_MARGIN_BPS,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96,
  BSC_TESTNET_WBNB_ADDRESS
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

export const BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-production-runtime-manifest:v2" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_SUBJECT_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-release-review-subject:v1" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_POLICY_DIGEST_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-release-review-policy:v1" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RUNTIME_REVIEW_INSTANTIATION_DIGEST_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-runtime-review-instantiation:v1" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_CHALLENGE_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-release-review-tty-challenge:v1" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-release-review-tty-frame:v1" as const;

const POLICY_KIND = "owner_designated_internal_multi_agent_release_review_policy_v1" as const;
const POLICY_DECISION = "GO_EXACT_CHAIN_97_ONE_SHOT_POLICY" as const;
const REVIEWER_DECISION = "GO_WITH_ZERO_P0_AND_ZERO_P1" as const;
const INSTANTIATION_KIND = "automated_release_policy_envelope_instantiation_v1" as const;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const GIT_OBJECT = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const STABLE_LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{0,95}$/u;
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._@/+-]{0,239}$/u;
const MAXIMUM_POLICY_BYTES = 65_536;
const MAXIMUM_TTY_FRAME_BYTES = 96 * 1024;
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
  "maximumEnvelopeLifetimeSeconds"
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
  "priceIsMarketPriceOraclePegOrValuation"
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
const INSTANTIATION_INPUT_KEYS = ["envelopeHash", "expiresAt"] as const;
const INSTANTIATION_EXPECTED_BINDING_KEYS = [
  "releaseCommit",
  "releaseTree",
  "runtimeManifestSha256",
  "policyDigest",
  "reviewedSubjectSha256",
  "envelopeHash",
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
  readonly schemaVersion: 1;
  readonly kind: typeof POLICY_KIND;
  readonly decision: typeof POLICY_DECISION;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly release: BscTestnetPtaWbnbPoolExactReleaseIdentity;
  readonly transaction: Readonly<{
    chainId: "97";
    from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
    nonce: "1";
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
    maximumEnvelopeLifetimeSeconds: "45";
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

export interface BscTestnetPtaWbnbPoolRuntimeReviewInstantiation {
  readonly schemaVersion: 1;
  readonly kind: typeof INSTANTIATION_KIND;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly policyDigest: Hex;
  readonly releaseCommit: string;
  readonly releaseTree: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewedSubjectSha256: Hex;
  readonly reviewerTaskLabels: readonly string[];
  readonly policyReviewedAt: string;
  readonly policyExpiresAt: string;
  readonly envelopeHash: Hex;
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
  readonly envelopeHash: Hex;
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
    nonce: String(BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE) as "1",
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
      BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS.toString() as "45"
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
    priceIsMarketPriceOraclePegOrValuation: false
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
    policy.schemaVersion !== 1 ||
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
    schemaVersion: 1,
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
  const envelopeExpiry = record === null ? null : exactUtc(record.expiresAt);
  const policyReviewedAt = exactUtc(policy.reviewedAt);
  const policyExpiry = exactUtc(policy.expiresAt);
  if (
    record === null ||
    !Object.isFrozen(input) ||
    envelopeExpiry === null ||
    policyReviewedAt === null ||
    policyExpiry === null ||
    !exactBytes32(record.envelopeHash) ||
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
    schemaVersion: 1 as const,
    kind: INSTANTIATION_KIND,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    policyDigest: policy.policyDigest,
    releaseCommit: policy.release.releaseCommit,
    releaseTree: policy.release.releaseTree,
    runtimeManifestSha256: policy.release.runtimeManifest.runtimeManifestSha256,
    reviewedSubjectSha256: policy.reviewedSubjectSha256,
    reviewerTaskLabels: Object.freeze(policy.reviewers.map((reviewer) => reviewer.taskLabel)),
    policyReviewedAt: policy.reviewedAt,
    policyExpiresAt: policy.expiresAt,
    envelopeHash: record.envelopeHash,
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
        envelopeHash: instantiation.envelopeHash,
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
    envelopeHash: binding.envelopeHash,
    expiresAt: expiresAt.iso,
    instantiationDigest: binding.instantiationDigest
  });
}

function sameExpectedInstantiationBinding(
  left: BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding,
  right: BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding
): boolean {
  return INSTANTIATION_EXPECTED_BINDING_KEYS.every((key) => left[key] === right[key]);
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

function decodePolicyFrame(frame: Uint8Array, nonce: Hex): Buffer | null {
  let owned: Buffer | null = null;
  try {
    owned = Buffer.from(frame);
    const prefix = `${BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN}|nonce=${nonce}|policy-base64url=`;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(owned);
    if (!text.startsWith(prefix)) return null;
    const encoded = text.slice(prefix.length);
    if (encoded.length === 0 || !/^[A-Za-z0-9_-]+$/u.test(encoded)) return null;
    const decoded = Buffer.from(encoded, "base64url");
    if (
      decoded.byteLength === 0 ||
      decoded.byteLength > MAXIMUM_POLICY_BYTES ||
      decoded.toString("base64url") !== encoded
    ) {
      decoded.fill(0);
      return null;
    }
    return decoded;
  } catch {
    return null;
  } finally {
    owned?.fill(0);
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

async function readOneExactTtyLine(notAfterMilliseconds: number): Promise<Buffer> {
  const remaining = notAfterMilliseconds - Date.now();
  if (
    remaining <= 0 ||
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
    const chunks: Buffer[] = [];
    let retainedBytes = 0;
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      stdin.off("data", onData);
      stdin.off("error", onError);
      stdin.pause();
    };
    const wipe = (): void => {
      for (const chunk of chunks) chunk.fill(0);
    };
    const fail = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      wipe();
      rejectPromise(new Error("TTY_FRAME_INVALID"));
    };
    const finish = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      const result = Buffer.concat(chunks, retainedBytes);
      wipe();
      resolvePromise(result);
    };
    const onError = (): void => fail();
    const onData = (value: unknown): void => {
      if (settled || !Buffer.isBuffer(value)) return fail();
      const newlineIndex = value.indexOf(0x0a);
      let contentLength = newlineIndex === -1 ? value.byteLength : newlineIndex;
      if (newlineIndex !== -1 && contentLength > 0 && value[contentLength - 1] === 0x0d) {
        contentLength -= 1;
      }
      if (
        retainedBytes + contentLength > MAXIMUM_TTY_FRAME_BYTES ||
        (newlineIndex !== -1 && newlineIndex + 1 !== value.byteLength)
      ) {
        return fail();
      }
      chunks.push(Buffer.from(value.subarray(0, contentLength)));
      retainedBytes += contentLength;
      if (newlineIndex !== -1) finish();
    };
    const timer = setTimeout(fail, remaining);
    stdin.once("error", onError);
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
      `frame=${BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN}|nonce=${nonce}|policy-base64url=<CANONICAL_POLICY_BYTES>`,
      "This owner-designated internal review is not external, cryptographically identified, Sigstore-attested, or transaction authorization.",
      "Paste exactly one nonce-bound UTF-8 frame, then press Enter.",
      ""
    ].join("\n")
  );
  let frame: Buffer | null = null;
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
    frame = await readOneExactTtyLine(notAfterMilliseconds);
    policyBytes = decodePolicyFrame(frame, nonce);
    if (policyBytes === null) {
      return blocked(
        "POLICY_FRAME_INVALID",
        "policy",
        "The exact nonce-bound canonical policy frame is invalid."
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
  } catch {
    return blocked(
      "POLICY_TTY_IO_FAILED",
      "tty",
      "The release-review policy TTY phase failed closed."
    );
  } finally {
    challenge.fill(0);
    frame?.fill(0);
    policyBytes?.fill(0);
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
