import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { stdin, stdout } from "node:process";
import { isProxy } from "node:util/types";

import { type Hex } from "viem";

import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
  type BscTestnetPtaWbnbPoolGeneration10PredecessorBinding
} from "./bsc-testnet-pta-wbnb-pool-generation-10-recovery";
import {
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import type { BscTestnetPtaWbnbPoolExactReleaseIdentity } from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";

export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_POLICY_KIND =
  "owner_designated_internal_existing_signature_release_review_policy_generation_10_v10" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_POLICY_DECISION =
  "GO_EXACT_CHAIN_97_EXISTING_SIGNATURE_RECOVERY_GENERATION_10_POLICY" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_POLICY_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.existing-signature-release-policy.v10" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_REVIEW_SUBJECT_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.existing-signature-review-subject.v10" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_INSTANTIATION_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.existing-signature-runtime-instantiation.v10" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TTY_CHALLENGE_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-existing-signature-release-review-tty-challenge:v11" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TTY_FRAME_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-existing-signature-release-review-tty-frame:v11" as const;

const REVIEWER_DECISION = "GO_WITH_ZERO_P0_AND_ZERO_P1" as const;
const MAXIMUM_POLICY_BYTES = 65_536;
const MAXIMUM_FRAME_BYTES = 100 * 1024;
const MAXIMUM_LINE_BYTES = 4_096;
const CHUNK_CHARACTERS = 2_304;
const MAXIMUM_CHUNKS = 38;
const ENTRY_WINDOW_MILLISECONDS = 5 * 60 * 1_000;
const MAXIMUM_POLICY_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1_000;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const GIT_OBJECT = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

type DataRecord = Readonly<Record<string, unknown>>;

export interface BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy {
  readonly schemaVersion: 10;
  readonly kind: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_POLICY_KIND;
  readonly decision: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_POLICY_DECISION;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly release: BscTestnetPtaWbnbPoolExactReleaseIdentity;
  readonly predecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding;
  readonly transaction: Readonly<{
    chainId: "97";
    from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
    nonce: "9";
    to: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
    data: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA;
    dataKeccak256: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256;
    valueWei: "0";
    gasLimit: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT;
    gasPriceWei: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI;
    maximumCostWei: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI;
    transactionHash: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH;
  }>;
  readonly scope: Readonly<{
    existingSignatureOnly: true;
    newSignatureAuthorized: false;
    maximumAdditionalSignatures: "0";
    maximumSends: "1";
    broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity";
    freshDualRpcBeforeStartRequired: true;
    freshDualRpcAfterStartRequired: true;
    durableSubmissionStartedBeforeSendRequired: true;
    restartAfterStartIsReconciliationOnly: true;
    liquidityActionAuthorized: false;
    lpPositionMintAuthorized: false;
    tokenApprovalAuthorized: false;
    tokenTransferAuthorized: false;
    mainnetWriteAuthorized: false;
  }>;
  readonly reviewedSubjectSha256: Hex;
  readonly implementationAgentIdentity: "root-implementation-agent";
  readonly reviewers: readonly Readonly<{
    taskLabel: "release_review_a" | "release_review_b";
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
    reviewersDidNotInspectFutureRuntimeEnvelopes: true;
    reviewIsNotTransactionAuthorization: true;
    separateExactOwnerBroadcastAuthorizationRequired: true;
  }>;
  readonly policyDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolGeneration10RuntimeReviewInstantiation {
  readonly schemaVersion: 10;
  readonly kind: "existing_signature_recovery_runtime_instantiation_v10";
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly policyDigest: Hex;
  readonly releaseCommit: string;
  readonly releaseTree: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewedSubjectSha256: Hex;
  readonly predecessorBundleDigest: Hex;
  readonly transactionHash: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH;
  readonly reviewerTaskLabels: readonly ["release_review_a", "release_review_b"];
  readonly policyReviewedAt: string;
  readonly policyExpiresAt: string;
  readonly envelopeHash: Hex;
  readonly executionEnvelopeObservedAt: string;
  readonly instantiatedAt: string;
  readonly expiresAt: string;
  readonly newSignatureAuthorized: false;
  readonly maximumAdditionalSignatures: "0";
  readonly reviewIsNotTransactionAuthorization: true;
  readonly instantiationDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolGeneration10PolicyRealm {
  readonly policy: BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy;
  readonly instantiate: (
    input: unknown
  ) => BscTestnetPtaWbnbPoolGeneration10RuntimeReviewInstantiation | null;
}

export type BscTestnetPtaWbnbPoolGeneration10PolicyAdmissionResult =
  | Readonly<{
      status: "ready";
      realm: BscTestnetPtaWbnbPoolGeneration10PolicyRealm;
      policy: BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      realm: null;
      policy: null;
      issue: Readonly<{ code: string; message: string }>;
    }>;

interface BrandState {
  readonly binding: string;
  consumed: boolean;
}
const productionInstantiations = new WeakMap<object, BrandState>();
let productionAdmissionAttempted = false;

function inspectRecord(input: unknown, expectedKeys?: readonly string[]): DataRecord | null {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      isProxy(input) ||
      Object.getPrototypeOf(input) !== Object.prototype
    ) {
      return null;
    }
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) return null;
    if (expectedKeys !== undefined) {
      const actual = (keys as string[]).sort();
      const expected = [...expectedKeys].sort();
      if (
        actual.length !== expected.length ||
        actual.some((key, index) => key !== expected[index])
      ) {
        return null;
      }
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Object.values(descriptors).some((descriptor) => !("value" in descriptor))) return null;
    return input as DataRecord;
  } catch {
    return null;
  }
}

function inspectArray(input: unknown, maximum: number): readonly unknown[] | null {
  if (!Array.isArray(input) || isProxy(input) || input.length > maximum) return null;
  return Object.freeze([...input]);
}

function exactUtc(input: unknown): { readonly iso: string; readonly milliseconds: number } | null {
  if (typeof input !== "string" || !UTC.test(input)) return null;
  const milliseconds = Date.parse(input);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === input
    ? Object.freeze({ iso: input, milliseconds })
    : null;
}

function sha256Domain(domain: string, value: unknown): Hex {
  return `0x${createHash("sha256")
    .update(`${domain}\0`, "utf8")
    .update(JSON.stringify(value), "utf8")
    .digest("hex")}` as Hex;
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function exactRelease(
  input: unknown,
  expected?: BscTestnetPtaWbnbPoolExactReleaseIdentity
): input is BscTestnetPtaWbnbPoolExactReleaseIdentity {
  const release = inspectRecord(input, ["releaseCommit", "releaseTree", "runtimeManifest"]);
  const manifest = release === null ? null : inspectRecord(release.runtimeManifest);
  return (
    release !== null &&
    manifest !== null &&
    typeof release.releaseCommit === "string" &&
    GIT_OBJECT.test(release.releaseCommit) &&
    typeof release.releaseTree === "string" &&
    GIT_OBJECT.test(release.releaseTree) &&
    typeof manifest.runtimeManifestSha256 === "string" &&
    BYTES32.test(manifest.runtimeManifestSha256) &&
    (expected === undefined || sameJson(input, expected))
  );
}

function exactTransaction(): BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy["transaction"] {
  return Object.freeze({
    chainId: "97",
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    nonce: "9",
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
    valueWei: "0",
    gasLimit: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT,
    gasPriceWei: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI,
    maximumCostWei: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI,
    transactionHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH
  });
}

function exactScope(): BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy["scope"] {
  return Object.freeze({
    existingSignatureOnly: true,
    newSignatureAuthorized: false,
    maximumAdditionalSignatures: "0",
    maximumSends: "1",
    broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity",
    freshDualRpcBeforeStartRequired: true,
    freshDualRpcAfterStartRequired: true,
    durableSubmissionStartedBeforeSendRequired: true,
    restartAfterStartIsReconciliationOnly: true,
    liquidityActionAuthorized: false,
    lpPositionMintAuthorized: false,
    tokenApprovalAuthorized: false,
    tokenTransferAuthorized: false,
    mainnetWriteAuthorized: false
  });
}

function exactLimitations(): BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy["limitations"] {
  return Object.freeze({
    ownerDesignatedInternalReview: true,
    cryptographicReviewerIdentityAvailable: false,
    externalIndependentReviewAvailable: false,
    sigstoreAttestationAvailable: false,
    reviewersDidNotInspectFutureRuntimeEnvelopes: true,
    reviewIsNotTransactionAuthorization: true,
    separateExactOwnerBroadcastAuthorizationRequired: true
  });
}

function subjectBody(
  release: BscTestnetPtaWbnbPoolExactReleaseIdentity,
  predecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding
): object {
  return Object.freeze({
    release,
    predecessor,
    transaction: exactTransaction(),
    scope: exactScope()
  });
}

export function deriveBscTestnetPtaWbnbPoolGeneration10ReviewedSubjectSha256ForInternalUse(
  release: BscTestnetPtaWbnbPoolExactReleaseIdentity,
  predecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding
): Hex {
  return sha256Domain(
    BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_REVIEW_SUBJECT_DOMAIN,
    subjectBody(release, predecessor)
  );
}

function policyBody(
  release: BscTestnetPtaWbnbPoolExactReleaseIdentity,
  predecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding,
  reviewedSubjectSha256: Hex,
  reviewers: BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy["reviewers"],
  reviewedAt: string,
  expiresAt: string
): Omit<BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy, "policyDigest"> {
  return Object.freeze({
    schemaVersion: 10,
    kind: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_POLICY_KIND,
    decision: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_POLICY_DECISION,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    release,
    predecessor,
    transaction: exactTransaction(),
    scope: exactScope(),
    reviewedSubjectSha256,
    implementationAgentIdentity: "root-implementation-agent",
    reviewers,
    reviewedAt,
    expiresAt,
    limitations: exactLimitations()
  });
}

export function buildBscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicyForInternalUse(input: {
  readonly release: BscTestnetPtaWbnbPoolExactReleaseIdentity;
  readonly predecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding;
  readonly reviewers: readonly Readonly<{
    taskLabel: "release_review_a" | "release_review_b";
    modelRole: string;
    decision: typeof REVIEWER_DECISION;
    p0Findings: 0;
    p1Findings: 0;
    reviewedSubjectSha256: Hex;
  }>[];
  readonly reviewedAt: string;
  readonly expiresAt: string;
}): BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy | null {
  if (!exactRelease(input.release)) return null;
  const reviewedAt = exactUtc(input.reviewedAt);
  const expiresAt = exactUtc(input.expiresAt);
  const reviewedSubjectSha256 =
    deriveBscTestnetPtaWbnbPoolGeneration10ReviewedSubjectSha256ForInternalUse(
      input.release,
      input.predecessor
    );
  const reviewers = Object.freeze(
    input.reviewers.map((reviewer) => Object.freeze({ ...reviewer }))
  );
  if (
    reviewedAt === null ||
    expiresAt === null ||
    expiresAt.milliseconds <= reviewedAt.milliseconds ||
    expiresAt.milliseconds - reviewedAt.milliseconds > MAXIMUM_POLICY_LIFETIME_MILLISECONDS ||
    reviewers.length !== 2 ||
    reviewers[0]?.taskLabel !== "release_review_a" ||
    reviewers[1]?.taskLabel !== "release_review_b" ||
    reviewers.some(
      (reviewer) =>
        reviewer.decision !== REVIEWER_DECISION ||
        reviewer.p0Findings !== 0 ||
        reviewer.p1Findings !== 0 ||
        reviewer.reviewedSubjectSha256 !== reviewedSubjectSha256 ||
        typeof reviewer.modelRole !== "string" ||
        reviewer.modelRole.length < 3 ||
        reviewer.modelRole.length > 96
    )
  ) {
    return null;
  }
  const body = policyBody(
    input.release,
    input.predecessor,
    reviewedSubjectSha256,
    reviewers,
    reviewedAt.iso,
    expiresAt.iso
  );
  return Object.freeze({
    ...body,
    policyDigest: sha256Domain(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_POLICY_DIGEST_DOMAIN, body)
  });
}

function parsePolicy(
  bytes: Uint8Array,
  expectedRelease: BscTestnetPtaWbnbPoolExactReleaseIdentity,
  expectedPredecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding,
  now: number
): BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy | null {
  let owned: Buffer | null = null;
  try {
    if (bytes.byteLength < 2 || bytes.byteLength > MAXIMUM_POLICY_BYTES) return null;
    owned = Buffer.from(bytes);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(owned);
    const parsed = JSON.parse(text) as unknown;
    const record = inspectRecord(parsed);
    if (
      record === null ||
      JSON.stringify(record) !== text ||
      !exactRelease(record.release, expectedRelease) ||
      !sameJson(record.predecessor, expectedPredecessor)
    ) {
      return null;
    }
    const reviewersInput = inspectArray(record.reviewers, 2);
    if (reviewersInput === null) return null;
    const reviewers = reviewersInput.map((reviewer) => inspectRecord(reviewer));
    if (reviewers.some((reviewer) => reviewer === null)) return null;
    const rebuilt = buildBscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicyForInternalUse({
      release: expectedRelease,
      predecessor: expectedPredecessor,
      reviewers:
        reviewersInput as BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy["reviewers"],
      reviewedAt: record.reviewedAt as string,
      expiresAt: record.expiresAt as string
    });
    const expiresAt = exactUtc(record.expiresAt);
    const reviewedAt = exactUtc(record.reviewedAt);
    return rebuilt !== null &&
      reviewedAt !== null &&
      expiresAt !== null &&
      reviewedAt.milliseconds <= now &&
      now < expiresAt.milliseconds &&
      sameJson(parsed, rebuilt)
      ? rebuilt
      : null;
  } catch {
    return null;
  } finally {
    owned?.fill(0);
  }
}

function instantiate(
  policy: BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy,
  input: unknown,
  now: Date
): BscTestnetPtaWbnbPoolGeneration10RuntimeReviewInstantiation | null {
  const value = inspectRecord(input, [
    "envelopeHash",
    "executionEnvelopeObservedAt",
    "expiresAt",
    "predecessorBundleDigest"
  ]);
  const observedAt = exactUtc(value?.executionEnvelopeObservedAt);
  const expiresAt = exactUtc(value?.expiresAt);
  const policyExpiry = exactUtc(policy.expiresAt);
  const nowMilliseconds = now.getTime();
  if (
    value === null ||
    observedAt === null ||
    expiresAt === null ||
    policyExpiry === null ||
    typeof value.envelopeHash !== "string" ||
    !BYTES32.test(value.envelopeHash) ||
    value.predecessorBundleDigest !== policy.predecessor.predecessorBundleDigest ||
    observedAt.milliseconds > nowMilliseconds ||
    nowMilliseconds >= expiresAt.milliseconds ||
    expiresAt.milliseconds > policyExpiry.milliseconds
  ) {
    return null;
  }
  const body = Object.freeze({
    schemaVersion: 10 as const,
    kind: "existing_signature_recovery_runtime_instantiation_v10" as const,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    policyDigest: policy.policyDigest,
    releaseCommit: policy.release.releaseCommit,
    releaseTree: policy.release.releaseTree,
    runtimeManifestSha256: policy.release.runtimeManifest.runtimeManifestSha256,
    reviewedSubjectSha256: policy.reviewedSubjectSha256,
    predecessorBundleDigest: policy.predecessor.predecessorBundleDigest,
    transactionHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
    reviewerTaskLabels: Object.freeze(["release_review_a", "release_review_b"] as const),
    policyReviewedAt: policy.reviewedAt,
    policyExpiresAt: policy.expiresAt,
    envelopeHash: value.envelopeHash as Hex,
    executionEnvelopeObservedAt: observedAt.iso,
    instantiatedAt: new Date(nowMilliseconds).toISOString(),
    expiresAt: expiresAt.iso,
    newSignatureAuthorized: false as const,
    maximumAdditionalSignatures: "0" as const,
    reviewIsNotTransactionAuthorization: true as const
  });
  const result = Object.freeze({
    ...body,
    instantiationDigest: sha256Domain(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_INSTANTIATION_DIGEST_DOMAIN,
      body
    )
  });
  productionInstantiations.set(result, { binding: JSON.stringify(result), consumed: false });
  return result;
}

export function authenticateBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse(
  value: unknown
): value is BscTestnetPtaWbnbPoolGeneration10RuntimeReviewInstantiation {
  try {
    if (value === null || typeof value !== "object" || isProxy(value)) return false;
    const brand = productionInstantiations.get(value);
    return brand !== undefined && !brand.consumed && brand.binding === JSON.stringify(value);
  } catch {
    return false;
  }
}

export function consumeBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse(
  value: unknown
): boolean {
  if (!authenticateBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse(value))
    return false;
  const brand = productionInstantiations.get(value as object);
  if (brand === undefined || brand.consumed) return false;
  brand.consumed = true;
  return true;
}

function blocked(
  code: string,
  message: string
): BscTestnetPtaWbnbPoolGeneration10PolicyAdmissionResult {
  return Object.freeze({
    status: "blocked" as const,
    realm: null,
    policy: null,
    issue: Object.freeze({ code, message })
  });
}

interface FrameMetadata {
  readonly chunkCount: number;
  readonly policyByteLength: number;
  readonly encodedLength: number;
  readonly policySha256: Hex;
}

class FrameDecoder {
  readonly #nonce: Hex;
  readonly #notAfter: number;
  readonly #line = Buffer.alloc(MAXIMUM_LINE_BYTES);
  readonly #chunks: Buffer[] = [];
  #lineLength = 0;
  #total = 0;
  #carriage = false;
  #state: "begin" | "chunks" | "complete" | "invalid" = "begin";
  #metadata: FrameMetadata | null = null;
  #nextChunk = 0;
  #result: Buffer | null = null;

  constructor(nonce: Hex, notAfter: number) {
    this.#nonce = nonce;
    this.#notAfter = notAfter;
  }

  get complete(): boolean {
    return this.#state === "complete";
  }

  push(value: unknown, now: number): boolean {
    if (
      this.#state === "invalid" ||
      !Buffer.isBuffer(value) ||
      value.byteLength === 0 ||
      now >= this.#notAfter ||
      this.#total + value.byteLength > MAXIMUM_FRAME_BYTES
    ) {
      return this.invalidate();
    }
    this.#total += value.byteLength;
    for (const byte of value) {
      if (this.#state === "complete") return this.invalidate();
      if (this.#carriage) {
        if (byte !== 0x0a) return this.invalidate();
        this.#carriage = false;
        if (!this.finishLine()) return false;
      } else if (byte === 0x0d) {
        this.#carriage = true;
      } else if (byte === 0x0a) {
        if (!this.finishLine()) return false;
      } else {
        if (byte < 0x20 || byte > 0x7e || this.#lineLength >= MAXIMUM_LINE_BYTES) {
          return this.invalidate();
        }
        this.#line[this.#lineLength++] = byte;
      }
    }
    return true;
  }

  take(now: number): Buffer | null {
    if (
      now >= this.#notAfter ||
      this.#state !== "complete" ||
      this.#carriage ||
      this.#lineLength !== 0 ||
      this.#result === null
    ) {
      this.invalidate();
      return null;
    }
    const result = this.#result;
    this.#result = null;
    return result;
  }

  destroy(): void {
    this.#line.fill(0);
    for (const chunk of this.#chunks) chunk.fill(0);
    this.#chunks.length = 0;
    this.#result?.fill(0);
    this.#result = null;
    this.#state = "invalid";
  }

  private finishLine(): boolean {
    if (this.#lineLength === 0) return this.invalidate();
    const line = this.#line.subarray(0, this.#lineLength).toString("ascii");
    this.#line.fill(0, 0, this.#lineLength);
    this.#lineLength = 0;
    return this.accept(line);
  }

  private accept(line: string): boolean {
    const fields = line.split("|");
    if (
      fields[0] !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TTY_FRAME_DOMAIN ||
      fields[1] !== `nonce=${this.#nonce}`
    ) {
      return this.invalidate();
    }
    if (this.#state === "begin") {
      if (fields.length !== 7 || fields[2] !== "line-index=0" || fields[3] !== "kind=BEGIN") {
        return this.invalidate();
      }
      const chunkCount = Number(fields[4]?.replace("chunk-count=", ""));
      const byteLength = Number(fields[5]?.replace("policy-byte-length=", ""));
      const sha = fields[6]?.replace("policy-sha256=", "");
      const encodedLength = Math.floor((byteLength * 4 + 2) / 3);
      if (
        !Number.isSafeInteger(chunkCount) ||
        !Number.isSafeInteger(byteLength) ||
        byteLength < 1 ||
        byteLength > MAXIMUM_POLICY_BYTES ||
        chunkCount !== Math.ceil(encodedLength / CHUNK_CHARACTERS) ||
        chunkCount > MAXIMUM_CHUNKS ||
        typeof sha !== "string" ||
        !BYTES32.test(sha)
      ) {
        return this.invalidate();
      }
      this.#metadata = Object.freeze({
        chunkCount,
        policyByteLength: byteLength,
        encodedLength,
        policySha256: sha as Hex
      });
      this.#state = "chunks";
      return true;
    }
    const metadata = this.#metadata;
    if (this.#state !== "chunks" || metadata === null) return this.invalidate();
    if (this.#nextChunk < metadata.chunkCount) {
      if (
        fields.length !== 9 ||
        fields[2] !== `line-index=${this.#nextChunk + 1}` ||
        fields[3] !== "kind=CHUNK" ||
        fields[4] !== `chunk-index=${this.#nextChunk}` ||
        fields[5] !== `chunk-count=${metadata.chunkCount}` ||
        fields[6] !== `policy-byte-length=${metadata.policyByteLength}` ||
        fields[7] !== `policy-sha256=${metadata.policySha256}`
      ) {
        return this.invalidate();
      }
      const payload = fields[8]?.replace("policy-base64url=", "");
      const expected = Math.min(
        CHUNK_CHARACTERS,
        metadata.encodedLength - this.#nextChunk * CHUNK_CHARACTERS
      );
      if (
        typeof payload !== "string" ||
        payload.length !== expected ||
        !/^[A-Za-z0-9_-]+$/u.test(payload)
      ) {
        return this.invalidate();
      }
      this.#chunks.push(Buffer.from(payload, "ascii"));
      this.#nextChunk += 1;
      return true;
    }
    if (
      fields.length !== 7 ||
      fields[2] !== `line-index=${metadata.chunkCount + 1}` ||
      fields[3] !== "kind=END" ||
      fields[4] !== `chunk-count=${metadata.chunkCount}` ||
      fields[5] !== `policy-byte-length=${metadata.policyByteLength}` ||
      fields[6] !== `policy-sha256=${metadata.policySha256}`
    ) {
      return this.invalidate();
    }
    const encoded = Buffer.concat(this.#chunks, metadata.encodedLength);
    let decoded: Buffer | null = null;
    try {
      decoded = Buffer.from(encoded.toString("ascii"), "base64url");
      const sha = `0x${createHash("sha256").update(decoded).digest("hex")}`;
      if (
        decoded.byteLength !== metadata.policyByteLength ||
        decoded.toString("base64url") !== encoded.toString("ascii") ||
        sha !== metadata.policySha256
      ) {
        decoded.fill(0);
        decoded = null;
        return this.invalidate();
      }
      this.#result = decoded;
      decoded = null;
      this.#state = "complete";
      return true;
    } finally {
      encoded.fill(0);
      decoded?.fill(0);
      for (const chunk of this.#chunks) chunk.fill(0);
      this.#chunks.length = 0;
    }
  }

  private invalidate(): false {
    this.destroy();
    return false;
  }
}

async function readFrame(nonce: Hex, notAfter: number): Promise<Buffer> {
  const remaining = notAfter - Date.now();
  if (
    remaining <= 0 ||
    stdin.isTTY !== true ||
    stdout.isTTY !== true ||
    stdin.readableLength !== 0 ||
    stdin.listenerCount("data") !== 0
  ) {
    throw new Error("TTY_UNAVAILABLE");
  }
  return new Promise<Buffer>((resolvePromise, rejectPromise) => {
    const decoder = new FrameDecoder(nonce, notAfter);
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      stdin.off("data", onData);
      stdin.off("error", fail);
      stdin.pause();
    };
    const fail = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      decoder.destroy();
      rejectPromise(new Error("TTY_FRAME_INVALID"));
    };
    const onData = (value: unknown): void => {
      if (settled || !decoder.push(value, Date.now())) return fail();
      if (decoder.complete) {
        setImmediate(() => {
          const result = decoder.take(Date.now());
          if (result === null || stdin.readableLength !== 0) return fail();
          settled = true;
          cleanup();
          decoder.destroy();
          resolvePromise(result);
        });
      }
    };
    const timer = setTimeout(fail, remaining);
    stdin.once("error", fail);
    stdin.on("data", onData);
    stdin.resume();
  });
}

export async function readBscTestnetPtaWbnbPoolGeneration10PolicyFromControllingTtyForInternalUse(
  expectedRelease: BscTestnetPtaWbnbPoolExactReleaseIdentity,
  expectedPredecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding
): Promise<BscTestnetPtaWbnbPoolGeneration10PolicyAdmissionResult> {
  if (productionAdmissionAttempted)
    return blocked("POLICY_ALREADY_ATTEMPTED", "Policy admission is one-shot.");
  productionAdmissionAttempted = true;
  if (!exactRelease(expectedRelease) || expectedPredecessor.generation !== 9) {
    return blocked("POLICY_EXPECTATION_INVALID", "Release or predecessor expectation is invalid.");
  }
  const startedAt = Date.now();
  const notAfter = startedAt + ENTRY_WINDOW_MILLISECONDS;
  const nonceBytes = randomBytes(32);
  const nonce = `0x${nonceBytes.toString("hex")}` as Hex;
  nonceBytes.fill(0);
  const challenge = Buffer.from(
    [
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TTY_CHALLENGE_DOMAIN,
      `nonce=${nonce}`,
      `releaseCommit=${expectedRelease.releaseCommit}`,
      `releaseTree=${expectedRelease.releaseTree}`,
      `runtimeManifestSha256=${expectedRelease.runtimeManifest.runtimeManifestSha256}`,
      `predecessorBundleDigest=${expectedPredecessor.predecessorBundleDigest}`,
      `transactionHash=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH}`,
      `predecessorSignedCommitSha256=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256}`,
      `protocol=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TTY_FRAME_DOMAIN}`,
      `limits=ASCII only; LF or CRLF; each line <= ${MAXIMUM_LINE_BYTES} bytes; total <= ${MAXIMUM_FRAME_BYTES} bytes; policy <= ${MAXIMUM_POLICY_BYTES} bytes; chunk count <= ${MAXIMUM_CHUNKS}; chunk payload = ${CHUNK_CHARACTERS} base64url characters except the final chunk.`,
      `BEGIN=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TTY_FRAME_DOMAIN}|nonce=${nonce}|line-index=0|kind=BEGIN|chunk-count=<N>|policy-byte-length=<B>|policy-sha256=<0x-lowercase-sha256>`,
      `CHUNK=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TTY_FRAME_DOMAIN}|nonce=${nonce}|line-index=<I+1>|kind=CHUNK|chunk-index=<I>|chunk-count=<N>|policy-byte-length=<B>|policy-sha256=<0x-lowercase-sha256>|policy-base64url=<CHUNK>`,
      `END=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TTY_FRAME_DOMAIN}|nonce=${nonce}|line-index=<N+1>|kind=END|chunk-count=<N>|policy-byte-length=<B>|policy-sha256=<0x-lowercase-sha256>`,
      "This owner-designated internal review is not external, cryptographically identified, transaction authorization, or permission to create a new signature.",
      "Enter BEGIN, every ordered CHUNK, and END once before the five-minute deadline.",
      ""
    ].join("\n"),
    "utf8"
  );
  let policyBytes: Buffer | null = null;
  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      stdout.write(challenge, (error) => (error ? rejectPromise(error) : resolvePromise()));
    });
    policyBytes = await readFrame(nonce, notAfter);
    const policy = parsePolicy(policyBytes, expectedRelease, expectedPredecessor, Date.now());
    if (policy === null)
      return blocked("POLICY_INVALID", "Canonical generation-10 policy is invalid.");
    return Object.freeze({
      status: "ready" as const,
      realm: Object.freeze({
        policy,
        instantiate: (input: unknown) => instantiate(policy, input, new Date())
      }),
      policy,
      issue: null
    });
  } catch {
    return blocked("POLICY_TTY_FAILED", "Generation-10 policy TTY admission failed closed.");
  } finally {
    challenge.fill(0);
    policyBytes?.fill(0);
  }
}

export function serializeBscTestnetPtaWbnbPoolGeneration10PolicyForTestsOnly(
  policy: BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy
): Uint8Array {
  return Buffer.from(JSON.stringify(policy), "utf8");
}

export function createBscTestnetPtaWbnbPoolGeneration10PolicyRealmForTestsOnly(
  policy: BscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicy,
  now: Date
): BscTestnetPtaWbnbPoolGeneration10PolicyRealm {
  return Object.freeze({
    policy,
    instantiate: (input: unknown) => instantiate(policy, input, now)
  });
}
