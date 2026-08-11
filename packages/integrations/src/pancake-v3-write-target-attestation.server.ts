import "server-only";

import {
  WRITE_TARGET_ATTESTATION_SCHEMA_VERSION,
  assessWriteTargetAttestation,
  deriveWriteTargetReviewId,
  pancakeV3SelectorCallPathAssessmentSchema,
  type WriteTargetAttestation,
  type WriteTargetAttestationManifest,
  type WriteTargetAttestationResult
} from "@proofera/domain";
import { sha256, stringToHex, type Hex } from "viem";

import {
  buildPancakeV3SelectorArtifactReview,
  type PancakeV3SelectorArtifactReviewProvenance
} from "./pancake-v3-selector-artifact-review";
import {
  buildPancakeV3TestnetManagerSourceReview,
  type PancakeV3SourceReviewProvenance
} from "./pancake-v3-source-review";

const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const MAX_ISSUES = 64;
export const PANCAKE_V3_EXACT_BLOCK_OBSERVATION_REVIEW_ID_DOMAIN =
  "ProofEra:pancake-v3-exact-block-observation-review:v1" as const;

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

type ReadyDomainAssessment = Extract<WriteTargetAttestationResult, { readonly status: "ready" }>;

export type PancakeV3WriteTargetAttestationIssueCode =
  | "OPTIONS_INVALID"
  | "CLOCK_INVALID"
  | "SOURCE_REVIEW_BLOCKED"
  | "OBSERVATION_NOT_TRUSTED"
  | "SELECTOR_REVIEW_BLOCKED"
  | "CROSS_REVIEW_INDEPENDENCE_INVALID"
  | "ATTESTATION_TIME_INVALID"
  | "MANIFEST_ASSEMBLY_FAILED"
  | "WRITE_TARGET_REVIEW_NOT_TRUSTED"
  | "DOMAIN_ATTESTATION_BLOCKED"
  | "INTERNAL_VALIDATION_ERROR";

export interface PancakeV3WriteTargetAttestationIssue {
  readonly code: PancakeV3WriteTargetAttestationIssueCode;
  readonly stage: "composer" | "source_review" | "selector_review" | "domain_attestation";
  readonly path: string;
  readonly message: string;
  readonly upstreamCode: string | null;
}

const BLOCKED_BOUNDARY = Object.freeze({
  writeTargetSourceAndSelectorAttested: false,
  executionAuthorized: false,
  activationHandoffAuthorized: false,
  authorityCreated: false,
  signatureRequested: false,
  transactionSubmitted: false,
  networkRequestPerformedByComposer: false,
  globalFetchUsedByComposer: false,
  walletAccessedByComposer: false,
  secretReadByComposer: false,
  runtimeHashAloneSufficient: false,
  expectedExactBlockObservationReviewIdRequired: true,
  expectedObserverEvidenceTrustRootsRequired: true,
  expectedFullReviewIdRequired: true,
  expectedAttestedAtRequired: true,
  scope: "pancake_v3_testnet_manager_write_target_attestation_only"
} as const);

const READY_BOUNDARY = Object.freeze({
  ...BLOCKED_BOUNDARY,
  writeTargetSourceAndSelectorAttested: true
} as const);

export interface PancakeV3WriteTargetAttestationProvenance {
  readonly exactBlockObservationReviewId: Hex;
  readonly sourceReview: PancakeV3SourceReviewProvenance;
  readonly selectorReview: PancakeV3SelectorArtifactReviewProvenance;
}

export type PancakeV3WriteTargetAttestationBuildResult = DeepReadonly<
  | {
      status: "blocked";
      attestation: null;
      effectiveTarget: null;
      provenance: null;
      issues: readonly PancakeV3WriteTargetAttestationIssue[];
      boundary: typeof BLOCKED_BOUNDARY;
    }
  | {
      status: "write_target_attestation_ready_execution_still_blocked";
      attestation: WriteTargetAttestation;
      effectiveTarget: ReadyDomainAssessment["effectiveTarget"];
      provenance: PancakeV3WriteTargetAttestationProvenance;
      issues: readonly never[];
      boundary: typeof READY_BOUNDARY;
    }
>;

export interface BuildPancakeV3WriteTargetAttestationOptions {
  readonly now: () => Date;
  /** Server-owned source/build/control-path review completion. Never accept from an HTTP body. */
  readonly trustedSourceReviewCompletion: unknown;
  /** Server-held exact-observation trust roots provisioned out of band after authenticated intake. */
  readonly expectedExactBlockObservationReviewId: Hex;
  readonly expectedObserverIdentity: string;
  readonly expectedObserverPublicSourceUrl: string;
  readonly expectedObservationEvidenceLocator: string;
  readonly expectedObservationEvidenceSha256: Hex;
  /** Server-held selector-review trust roots provisioned out of band. */
  readonly expectedSelectorReviewId: Hex;
  readonly expectedSelectorReviewerIdentity: string;
  readonly expectedSelectorRetrieverIdentity: string;
  /** Server-held full-manifest trust roots provisioned independently of request data. */
  readonly expectedWriteTargetReviewId: Hex;
  readonly expectedAttestedAt: string;
}

interface InspectedOptions {
  readonly now: () => unknown;
  readonly trustedSourceReviewCompletion: unknown;
  readonly expectedExactBlockObservationReviewId: Hex;
  readonly expectedObserverIdentity: string;
  readonly expectedObserverPublicSourceUrl: string;
  readonly expectedObservationEvidenceLocator: string;
  readonly expectedObservationEvidenceSha256: Hex;
  readonly expectedSelectorReviewId: Hex;
  readonly expectedSelectorReviewerIdentity: string;
  readonly expectedSelectorRetrieverIdentity: string;
  readonly expectedWriteTargetReviewId: Hex;
  readonly expectedAttestedAt: string;
}

function isNonZeroLowercaseBytes32(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/.test(value) && value !== ZERO_BYTES32;
}

function isCanonicalUtc(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function canonicalHttpsLocator(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname.length === 0 ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/** Reads only own data descriptors; accessors and extra/hidden/symbol keys are rejected. */
function inspectOptions(value: unknown): InspectedOptions | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) return null;
    const expectedKeys = [
      "expectedAttestedAt",
      "expectedExactBlockObservationReviewId",
      "expectedObservationEvidenceLocator",
      "expectedObservationEvidenceSha256",
      "expectedObserverIdentity",
      "expectedObserverPublicSourceUrl",
      "expectedSelectorRetrieverIdentity",
      "expectedSelectorReviewId",
      "expectedSelectorReviewerIdentity",
      "expectedWriteTargetReviewId",
      "now",
      "trustedSourceReviewCompletion"
    ];
    const stringKeys = (keys as string[]).sort();
    if (
      stringKeys.length !== expectedKeys.length ||
      stringKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      return null;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const readData = (key: (typeof expectedKeys)[number]): unknown => {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        throw new TypeError("Options must use enumerable own data properties.");
      }
      return descriptor.value;
    };

    const now = readData("now");
    const trustedSourceReviewCompletion = readData("trustedSourceReviewCompletion");
    const expectedExactBlockObservationReviewId = readData("expectedExactBlockObservationReviewId");
    const expectedObserverIdentity = readData("expectedObserverIdentity");
    const expectedObserverPublicSourceUrl = readData("expectedObserverPublicSourceUrl");
    const expectedObservationEvidenceLocator = readData("expectedObservationEvidenceLocator");
    const expectedObservationEvidenceSha256 = readData("expectedObservationEvidenceSha256");
    const expectedSelectorReviewId = readData("expectedSelectorReviewId");
    const expectedSelectorReviewerIdentity = readData("expectedSelectorReviewerIdentity");
    const expectedSelectorRetrieverIdentity = readData("expectedSelectorRetrieverIdentity");
    const expectedWriteTargetReviewId = readData("expectedWriteTargetReviewId");
    const expectedAttestedAt = readData("expectedAttestedAt");
    if (
      typeof now !== "function" ||
      !isNonZeroLowercaseBytes32(expectedExactBlockObservationReviewId) ||
      typeof expectedObserverIdentity !== "string" ||
      expectedObserverIdentity.length < 3 ||
      expectedObserverIdentity.length > 160 ||
      typeof expectedObserverPublicSourceUrl !== "string" ||
      canonicalHttpsLocator(expectedObserverPublicSourceUrl) === null ||
      typeof expectedObservationEvidenceLocator !== "string" ||
      canonicalHttpsLocator(expectedObservationEvidenceLocator) === null ||
      !isNonZeroLowercaseBytes32(expectedObservationEvidenceSha256) ||
      !isNonZeroLowercaseBytes32(expectedSelectorReviewId) ||
      typeof expectedSelectorReviewerIdentity !== "string" ||
      typeof expectedSelectorRetrieverIdentity !== "string" ||
      !isNonZeroLowercaseBytes32(expectedWriteTargetReviewId) ||
      !isCanonicalUtc(expectedAttestedAt)
    ) {
      return null;
    }
    const nowFunction = now as (...arguments_: readonly unknown[]) => unknown;
    return {
      now: () => Reflect.apply(nowFunction, undefined, []),
      trustedSourceReviewCompletion,
      expectedExactBlockObservationReviewId,
      expectedObserverIdentity,
      expectedObserverPublicSourceUrl,
      expectedObservationEvidenceLocator,
      expectedObservationEvidenceSha256,
      expectedSelectorReviewId,
      expectedSelectorReviewerIdentity,
      expectedSelectorRetrieverIdentity,
      expectedWriteTargetReviewId,
      expectedAttestedAt
    };
  } catch {
    return null;
  }
}

function captureNow(now: () => unknown): number | null {
  try {
    const value = now();
    if (!(value instanceof Date) || Object.getPrototypeOf(value) !== Date.prototype) return null;
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isFinite(milliseconds) ? milliseconds : null;
  } catch {
    return null;
  }
}

function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<Value>;
}

function recursivelySortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => recursivelySortJsonKeys(entry));
  if (value === null || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = recursivelySortJsonKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function deriveExactBlockObservationReviewId(
  target: Readonly<{
    code: Readonly<{
      blockNumber: string;
      blockHash: string;
      address: string;
      runtimeCodeHash: string;
      observedAt: string;
    }>;
  }>,
  observation: PancakeV3SourceReviewProvenance["freshObservation"]
): Hex {
  const manifest = {
    schemaVersion: 1,
    chainId: 97,
    environment: "bsc-testnet",
    targetCode: target.code,
    observation
  } as const;
  return sha256(
    stringToHex(
      `${PANCAKE_V3_EXACT_BLOCK_OBSERVATION_REVIEW_ID_DOMAIN}\u0000${JSON.stringify(
        recursivelySortJsonKeys(manifest)
      )}`
    )
  );
}

function composerIssue(
  code: PancakeV3WriteTargetAttestationIssueCode,
  stage: PancakeV3WriteTargetAttestationIssue["stage"],
  path: string,
  message: string,
  upstreamCode: string | null = null
): PancakeV3WriteTargetAttestationIssue {
  return {
    code,
    stage,
    path: path.replace(/[^A-Za-z0-9_.\[\]-]/g, "_").slice(0, 240) || "unknown",
    message: message.slice(0, 320),
    upstreamCode:
      upstreamCode === null
        ? null
        : upstreamCode.replace(/[^A-Z0-9_]/g, "_").slice(0, 120) || "UNKNOWN"
  };
}

function blocked(
  issues: readonly PancakeV3WriteTargetAttestationIssue[]
): PancakeV3WriteTargetAttestationBuildResult {
  const retained = [...issues].slice(0, MAX_ISSUES);
  if (retained.length === 0) {
    retained.push(
      composerIssue(
        "INTERNAL_VALIDATION_ERROR",
        "composer",
        "composer",
        "The write-target composer blocked without a specific validation issue."
      )
    );
  }
  return deepFreeze({
    status: "blocked" as const,
    attestation: null,
    effectiveTarget: null,
    provenance: null,
    issues: retained,
    boundary: BLOCKED_BOUNDARY
  });
}

function sourceIssues(
  issues: readonly { readonly code: string; readonly path: string; readonly message: string }[]
): readonly PancakeV3WriteTargetAttestationIssue[] {
  return issues.map((entry) =>
    composerIssue(
      "SOURCE_REVIEW_BLOCKED",
      "source_review",
      `sourceReview.${entry.path}`,
      entry.message,
      entry.code
    )
  );
}

function selectorIssues(
  issues: readonly { readonly code: string; readonly path: string; readonly message: string }[]
): readonly PancakeV3WriteTargetAttestationIssue[] {
  return issues.map((entry) =>
    composerIssue(
      "SELECTOR_REVIEW_BLOCKED",
      "selector_review",
      `selectorReview.${entry.path}`,
      entry.message,
      entry.code
    )
  );
}

function domainIssues(
  issues: readonly {
    readonly code: string;
    readonly path: string;
    readonly message: string;
  }[]
): readonly PancakeV3WriteTargetAttestationIssue[] {
  return issues.map((entry) =>
    composerIssue(
      "DOMAIN_ATTESTATION_BLOCKED",
      "domain_attestation",
      entry.path,
      entry.message,
      entry.code
    )
  );
}

function sameIdentity(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function crossReviewIssues(
  source: PancakeV3SourceReviewProvenance,
  sourceReviewerIdentity: string,
  selector: PancakeV3SelectorArtifactReviewProvenance,
  expectedAttestedAt: string
): readonly PancakeV3WriteTargetAttestationIssue[] {
  const issues: PancakeV3WriteTargetAttestationIssue[] = [];
  const identities = [
    sourceReviewerIdentity,
    source.freshObservation.observer.id,
    selector.reviewerIdentity,
    selector.retrieverIdentity
  ];
  if (
    identities.some((identity, index) =>
      identities.slice(index + 1).some((other) => sameIdentity(identity, other))
    )
  ) {
    issues.push(
      composerIssue(
        "CROSS_REVIEW_INDEPENDENCE_INVALID",
        "composer",
        "provenance.identities",
        "Source reviewer, exact-block observer, selector reviewer, and public-evidence retriever must be distinct identities."
      )
    );
  }

  const evidence = [
    source.reproducibleBuildEvidence,
    source.independentControlPathReviewEvidence,
    source.freshObservation.observer.evidence,
    ...selector.selectorArtifacts.flatMap((artifact) => [
      artifact.evidence,
      artifact.retrievalReceipt
    ]),
    selector.delegatecallBoundaryArtifact.evidence,
    selector.delegatecallBoundaryArtifact.retrievalReceipt
  ];
  const digests = evidence.map(({ sha256 }) => sha256);
  const locators = evidence.map(({ locator }) => canonicalHttpsLocator(locator.uri));
  if (
    locators.some((locator) => locator === null) ||
    new Set(digests).size !== evidence.length ||
    new Set(locators).size !== evidence.length
  ) {
    issues.push(
      composerIssue(
        "CROSS_REVIEW_INDEPENDENCE_INVALID",
        "composer",
        "provenance.evidence",
        "Source, observation, selector analysis, and retrieval-receipt evidence must have distinct content addresses and locators."
      )
    );
  }

  const attestedMs = Date.parse(expectedAttestedAt);
  const selectorFetchedAt = [
    ...selector.selectorArtifacts.map(({ fetchedAt }) => fetchedAt),
    selector.delegatecallBoundaryArtifact.fetchedAt
  ];
  if (selectorFetchedAt.some((fetchedAt) => Date.parse(fetchedAt) > attestedMs)) {
    issues.push(
      composerIssue(
        "ATTESTATION_TIME_INVALID",
        "composer",
        "attestation.attestedAt",
        "The full attestation cannot predate any independently retrieved selector evidence it relies on."
      )
    );
  }
  return issues;
}

/**
 * Composes independently authenticated source, exact-block, and selector-path evidence into the
 * domain v2 write-target attestation. This function performs no I/O and never authorizes a call.
 */
export function buildPancakeV3TestnetWriteTargetAttestation(
  exactBlockObservationInput: unknown,
  prefetchedSelectorArtifactBatchInput: unknown,
  optionsInput: BuildPancakeV3WriteTargetAttestationOptions
): PancakeV3WriteTargetAttestationBuildResult {
  const options = inspectOptions(optionsInput);
  if (options === null) {
    return blocked([
      composerIssue(
        "OPTIONS_INVALID",
        "composer",
        "options",
        "Expected strict server-owned source, selector, full-review, attested-at, and clock options."
      )
    ]);
  }

  const capturedNowMs = captureNow(options.now);
  if (capturedNowMs === null) {
    return blocked([
      composerIssue(
        "CLOCK_INVALID",
        "composer",
        "options.now",
        "The injected clock must return a valid ordinary Date."
      )
    ]);
  }
  const sameTimeClock = Object.freeze(() => new Date(capturedNowMs));

  const sourceResult = buildPancakeV3TestnetManagerSourceReview(exactBlockObservationInput, {
    now: sameTimeClock,
    trustedReviewCompletion: options.trustedSourceReviewCompletion
  });
  if (sourceResult.status === "blocked") return blocked(sourceIssues(sourceResult.issues));

  const freshObservation = sourceResult.provenance.freshObservation;
  const derivedObservationReviewId = deriveExactBlockObservationReviewId(
    sourceResult.target,
    freshObservation
  );
  if (
    derivedObservationReviewId !== options.expectedExactBlockObservationReviewId ||
    freshObservation.observer.id !== options.expectedObserverIdentity ||
    freshObservation.observer.publicSourceUrl !== options.expectedObserverPublicSourceUrl ||
    freshObservation.observer.evidence.locator.uri !== options.expectedObservationEvidenceLocator ||
    freshObservation.observer.evidence.sha256 !== options.expectedObservationEvidenceSha256
  ) {
    return blocked([
      composerIssue(
        "OBSERVATION_NOT_TRUSTED",
        "composer",
        "provenance.sourceReview.freshObservation",
        "Exact-block observation content, observer identity, public source, and evidence must match independently provisioned server trust roots."
      )
    ]);
  }

  const selectorResult = buildPancakeV3SelectorArtifactReview(
    prefetchedSelectorArtifactBatchInput,
    {
      now: sameTimeClock,
      expectedReviewId: options.expectedSelectorReviewId,
      expectedReviewerIdentity: options.expectedSelectorReviewerIdentity,
      expectedRetrieverIdentity: options.expectedSelectorRetrieverIdentity
    }
  );
  if (selectorResult.status === "blocked") return blocked(selectorIssues(selectorResult.issues));

  const selectorAssessment = pancakeV3SelectorCallPathAssessmentSchema.safeParse(
    selectorResult.assessment
  );
  if (!selectorAssessment.success) {
    return blocked([
      composerIssue(
        "INTERNAL_VALIDATION_ERROR",
        "composer",
        "selectorReview.assessment",
        "The selector builder emitted a value outside the exact domain assessment schema."
      )
    ]);
  }

  const independenceIssues = crossReviewIssues(
    sourceResult.provenance,
    sourceResult.sourceReview.independentReview.reviewerIdentity,
    selectorResult.provenance,
    options.expectedAttestedAt
  );
  if (independenceIssues.length > 0) return blocked(independenceIssues);

  const target = sourceResult.target;
  const canonicalBlock = sourceResult.provenance.freshObservation.block;
  const manifest: WriteTargetAttestationManifest = {
    schemaVersion: WRITE_TARGET_ATTESTATION_SCHEMA_VERSION,
    chainId: 97,
    environment: "testnet",
    canonicalBlock: {
      number: canonicalBlock.number,
      hash: canonicalBlock.hash,
      timestamp: canonicalBlock.timestamp
    },
    attestedAt: options.expectedAttestedAt,
    target,
    proxyAssessment: {
      kind: "non_proxy",
      decision: "independently_reviewed_non_proxy_selector_scoped",
      targetAddress: target.code.address,
      blockNumber: target.code.blockNumber,
      blockHash: target.code.blockHash,
      runtimeCodeHash: target.code.runtimeCodeHash,
      observedAt: target.code.observedAt,
      evidence: sourceResult.provenance.independentControlPathReviewEvidence,
      selectorCallPathAssessment: selectorAssessment.data
    }
  };

  let derivedReviewId: Hex;
  try {
    derivedReviewId = deriveWriteTargetReviewId(manifest);
  } catch {
    return blocked([
      composerIssue(
        "MANIFEST_ASSEMBLY_FAILED",
        "composer",
        "manifest",
        "The composed source, block, proxy, selector, or evidence bindings were not a valid domain manifest."
      )
    ]);
  }

  const attestation: WriteTargetAttestation = { ...manifest, reviewId: derivedReviewId };
  const assessed = assessWriteTargetAttestation(attestation, {
    asOf: sameTimeClock,
    expectedReviewId: options.expectedWriteTargetReviewId
  });
  if (assessed.status === "blocked") {
    const issues = domainIssues(assessed.issues);
    if (derivedReviewId !== options.expectedWriteTargetReviewId) {
      return blocked([
        composerIssue(
          "WRITE_TARGET_REVIEW_NOT_TRUSTED",
          "composer",
          "attestation.reviewId",
          "The complete derived manifest content address does not match the independently provisioned server trust root."
        ),
        ...issues
      ]);
    }
    return blocked(issues);
  }
  if (derivedReviewId !== options.expectedWriteTargetReviewId) {
    return blocked([
      composerIssue(
        "INTERNAL_VALIDATION_ERROR",
        "composer",
        "attestation.reviewId",
        "Domain assessment unexpectedly accepted a manifest outside the server-held trust root."
      )
    ]);
  }

  return deepFreeze({
    status: "write_target_attestation_ready_execution_still_blocked" as const,
    attestation: assessed.attestation,
    effectiveTarget: assessed.effectiveTarget,
    provenance: {
      exactBlockObservationReviewId: derivedObservationReviewId,
      sourceReview: sourceResult.provenance,
      selectorReview: selectorResult.provenance
    },
    issues: [] as const,
    boundary: READY_BOUNDARY
  });
}
