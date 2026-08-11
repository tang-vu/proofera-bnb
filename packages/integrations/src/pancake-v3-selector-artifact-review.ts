import "server-only";

import {
  PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD,
  PROOFERA_PANCAKE_V3_DENIED_MULTICALLS,
  PROOFERA_PANCAKE_V3_DIRECT_CALLS,
  pancakeV3SelectorCallPathAssessmentSchema,
  type PancakeV3SelectorCallPathAssessment
} from "@proofera/domain";
import { isIP } from "node:net";
import { sha256, stringToHex, type Hex } from "viem";
import { z } from "zod";
import { PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256 } from "./pancake-v3-source-review";

export const PANCAKE_V3_SELECTOR_ARTIFACT_REVIEW_SCHEMA_VERSION = 1 as const;
export const PANCAKE_V3_SELECTOR_ARTIFACT_MAX_BYTES = 131_072 as const;
export const PANCAKE_V3_SELECTOR_ARTIFACT_RETRIEVAL_MAX_AGE_SECONDS = 900 as const;
export const PANCAKE_V3_SELECTOR_ARTIFACT_REVIEW_MAX_AGE_SECONDS = 2_592_000 as const;

const MAX_SNAPSHOT_DEPTH = 24;
const MAX_SNAPSHOT_NODES = 20_000;
const MAX_ISSUES = 64;
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as const;
const MANAGER = "0x427bf5b37357632377ecbec9de3626c71a5396c1" as const;
const SOURCE_COMMIT = "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57" as const;
const SOURCE_TREE_SHA256 =
  "0xb3cd0b3fd4563287f587c2776eac78e5b5a4ad98f6c805a005df10727bee782d" as const;
const COMPILER_INPUT_SHA256 =
  "0x086382b3301a745dae7d0b66878cd1c1a4433cf7b1d7725efc546511811b3c38" as const;
const COMPILER_SETTINGS_SHA256 =
  "0xa1af16a691f74364a753be9855c4f0865f1fef27a515a65ee0a866c991a6c1a1" as const;
const MANAGER_ARTIFACT_SHA256 =
  "0x9e5bca807e38e9e8acadd81c5dec6668f847a7e3397d91b3afed74b066cfbb2a" as const;
const MANAGER_RUNTIME_HASH =
  "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7" as const;
const REVIEW_ID_DOMAIN = "ProofEra:pancake-v3-public-selector-artifact-review:v1" as const;

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export const PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS = deepFreeze({
  chainId: 97 as const,
  managerAddress: MANAGER,
  sourceCommit: SOURCE_COMMIT,
  sourceTreeSha256: SOURCE_TREE_SHA256,
  compiler: {
    name: "solc" as const,
    version: "0.7.6+commit.7338295f" as const,
    inputSha256: COMPILER_INPUT_SHA256,
    settingsSha256: COMPILER_SETTINGS_SHA256,
    outputArtifactSha256: MANAGER_ARTIFACT_SHA256,
    outputRuntimeCodeHash: MANAGER_RUNTIME_HASH,
    optimizer: { enabled: true as const, runs: 2_000 as const },
    viaIr: false as const,
    evmVersion: "istanbul" as const,
    metadataBytecodeHash: "none" as const
  },
  writeScopeSha256: PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256
});

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hexadecimal value.")
  .transform((value) => value.toLowerCase() as Hex)
  .refine((value) => value !== ZERO_BYTES32, "The zero digest is not allowed.");

const identitySchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[A-Za-z0-9._:@/+ -]+$/, "Identity contains unsupported characters.");

const utcSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

const bindingsSchema = z.strictObject({
  chainId: z.literal(PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS.chainId),
  managerAddress: z.literal(MANAGER),
  sourceCommit: z.literal(SOURCE_COMMIT),
  sourceTreeSha256: z.literal(SOURCE_TREE_SHA256),
  compiler: z.strictObject({
    name: z.literal("solc"),
    version: z.literal("0.7.6+commit.7338295f"),
    inputSha256: z.literal(COMPILER_INPUT_SHA256),
    settingsSha256: z.literal(COMPILER_SETTINGS_SHA256),
    outputArtifactSha256: z.literal(MANAGER_ARTIFACT_SHA256),
    outputRuntimeCodeHash: z.literal(MANAGER_RUNTIME_HASH),
    optimizer: z.strictObject({ enabled: z.literal(true), runs: z.literal(2_000) }),
    viaIr: z.literal(false),
    evmVersion: z.literal("istanbul"),
    metadataBytecodeHash: z.literal("none")
  }),
  writeScopeSha256: z.literal(PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256)
});

const reviewerSchema = z.strictObject({
  identity: identitySchema,
  authentication: z.literal("server_allowlisted_identity_bound_to_expected_batch_review_id"),
  independence: z.literal("independent_from_source_builder_runtime_observer_and_retriever"),
  method: z.literal(PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD.name),
  version: z.literal(PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD.version),
  assurance: z.literal(PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD.assurance),
  decision: z.literal("approved_for_exact_selector_scoped_attestation_input_only"),
  reviewedAt: utcSchema
});

const directReachabilitySchema = z.strictObject({
  controlFlowCoverage: z.literal("all_branches_resolved"),
  delegatecall: z.literal("unreachable"),
  arbitraryDispatcher: z.literal("unreachable"),
  unknownPaths: z.literal("none"),
  externalContractBoundary: z.literal("separate_exact_pool_and_token_attestations_required")
});

function directArtifactBodySchema<
  const Definition extends (typeof PROOFERA_PANCAKE_V3_DIRECT_CALLS)[number]
>(definition: Definition) {
  return z.strictObject({
    schemaVersion: z.literal(PANCAKE_V3_SELECTOR_ARTIFACT_REVIEW_SCHEMA_VERSION),
    artifactType: z.literal("pancake_v3_direct_selector_independent_public_review"),
    claimStatus: z.literal("approved_as_selector_attestation_input_not_execution_authorization"),
    executionAuthorized: z.literal(false),
    operation: z.literal(definition.operation),
    signature: z.literal(definition.signature),
    selector: z.literal(definition.selector),
    analyzedAt: utcSchema,
    reviewer: reviewerSchema,
    bindings: bindingsSchema,
    reachability: directReachabilitySchema,
    sourcePathSha256: bytes32Schema,
    bytecodePathSha256: bytes32Schema,
    publicEvidenceClaim: z.literal("published_https_content_addressed_and_independently_refetched")
  });
}

function deniedMulticallSchema<
  const Definition extends (typeof PROOFERA_PANCAKE_V3_DENIED_MULTICALLS)[number]
>(definition: Definition) {
  return z.strictObject({
    signature: z.literal(definition.signature),
    selector: z.literal(definition.selector),
    classification: z.literal(definition.classification),
    decision: z.literal("denied")
  });
}

const delegatecallBoundaryBodySchema = z.strictObject({
  schemaVersion: z.literal(PANCAKE_V3_SELECTOR_ARTIFACT_REVIEW_SCHEMA_VERSION),
  artifactType: z.literal("pancake_v3_delegatecall_boundary_independent_public_review"),
  claimStatus: z.literal("approved_as_selector_attestation_input_not_execution_authorization"),
  executionAuthorized: z.literal(false),
  reviewer: reviewerSchema,
  bindings: bindingsSchema,
  classification: z.literal("known_self_delegatecall_dispatcher_present"),
  delegatecallProgramCounter: z.literal(10_522),
  reviewedSourceLocation: z.literal(
    "projects/v3-periphery/contracts/base/Multicall.sol#multicall(bytes[])_self_delegatecall"
  ),
  deniedMulticalls: z.tuple([
    deniedMulticallSchema(PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[0]),
    deniedMulticallSchema(PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[1]),
    deniedMulticallSchema(PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[2])
  ]),
  unlistedSelectors: z.literal("denied"),
  nestedCalldata: z.literal("denied"),
  sourcePathSha256: bytes32Schema,
  bytecodePathSha256: bytes32Schema,
  publicEvidenceClaim: z.literal("published_https_content_addressed_and_independently_refetched")
});

const retrievalSchema = z.strictObject({
  kind: z.literal("prefetched_public_https_artifact_response_v1"),
  retrieverIdentity: identitySchema,
  independence: z.literal("independent_from_source_builder_runtime_observer_and_reviewer"),
  fetchedAt: utcSchema,
  requestedUrl: z.string().min(1).max(2_048),
  finalUrl: z.string().min(1).max(2_048),
  redirectCount: z.literal(0),
  httpStatus: z.literal(200),
  contentType: z.literal("application/json"),
  contentEncoding: z.literal("identity"),
  rawByteLength: z.number().int().positive().max(PANCAKE_V3_SELECTOR_ARTIFACT_MAX_BYTES),
  bodyComplete: z.literal(true),
  tlsCertificateValidated: z.literal(true),
  ssrfPolicy: z.literal("https_dns_and_every_connection_hop_public_ip_only_v1"),
  allResolvedAddressesPublic: z.literal(true),
  dnsRebindingProtection: z.literal(true),
  receipt: z.strictObject({
    locator: z.string().min(1).max(2_048),
    sha256: bytes32Schema
  })
});

function descriptorSchema<const Role extends string>(role: Role) {
  return z.strictObject({
    role: z.literal(role),
    locator: z.string().min(1).max(2_048),
    expectedSha256: bytes32Schema,
    rawBodyUtf8: z.string().min(2).max(PANCAKE_V3_SELECTOR_ARTIFACT_MAX_BYTES),
    retrieval: retrievalSchema
  });
}

export const pancakeV3PrefetchedSelectorArtifactBatchSchema = z.strictObject({
  schemaVersion: z.literal(PANCAKE_V3_SELECTOR_ARTIFACT_REVIEW_SCHEMA_VERSION),
  trustBoundary: z.literal("server_owned_prefetched_public_evidence_descriptors"),
  selectorArtifacts: z.tuple([
    descriptorSchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[0].operation),
    descriptorSchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[1].operation),
    descriptorSchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[2].operation),
    descriptorSchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[3].operation)
  ]),
  delegatecallBoundaryArtifact: descriptorSchema("denied-multicalls")
});

export type PancakeV3PrefetchedSelectorArtifactBatch = z.infer<
  typeof pancakeV3PrefetchedSelectorArtifactBatchSchema
>;

type DirectBody =
  | z.infer<
      ReturnType<typeof directArtifactBodySchema<(typeof PROOFERA_PANCAKE_V3_DIRECT_CALLS)[0]>>
    >
  | z.infer<
      ReturnType<typeof directArtifactBodySchema<(typeof PROOFERA_PANCAKE_V3_DIRECT_CALLS)[1]>>
    >
  | z.infer<
      ReturnType<typeof directArtifactBodySchema<(typeof PROOFERA_PANCAKE_V3_DIRECT_CALLS)[2]>>
    >
  | z.infer<
      ReturnType<typeof directArtifactBodySchema<(typeof PROOFERA_PANCAKE_V3_DIRECT_CALLS)[3]>>
    >;
type BoundaryBody = z.infer<typeof delegatecallBoundaryBodySchema>;
type Descriptor = PancakeV3PrefetchedSelectorArtifactBatch["selectorArtifacts"][number];

export type PancakeV3SelectorArtifactReviewIssueCode =
  | "INPUT_UNSAFE"
  | "OPTIONS_INVALID"
  | "CLOCK_INVALID"
  | "BATCH_INVALID"
  | "BODY_SIZE_INVALID"
  | "BODY_ENCODING_INVALID"
  | "BODY_SHA256_MISMATCH"
  | "LOCATOR_INVALID"
  | "RETRIEVAL_INVALID"
  | "ARTIFACT_JSON_INVALID"
  | "ARTIFACT_CANONICAL_INVALID"
  | "ARTIFACT_SCHEMA_INVALID"
  | "REVIEW_METADATA_MISMATCH"
  | "REVIEW_NOT_TRUSTED"
  | "REVIEW_TIME_INVALID"
  | "EVIDENCE_NOT_DISTINCT"
  | "PATH_DIGEST_NOT_DISTINCT"
  | "INTERNAL_VALIDATION_ERROR";

export interface PancakeV3SelectorArtifactReviewIssue {
  readonly code: PancakeV3SelectorArtifactReviewIssueCode;
  readonly path: string;
  readonly message: string;
}

const BLOCKED_BOUNDARY = Object.freeze({
  prefetchedOnly: true,
  globalFetchUsed: false,
  publicHttpsArtifactsVerified: false,
  independentRetrievalProvenanceVerified: false,
  authenticatedReviewerVerified: false,
  selectorCallPathAssessmentEmitted: false,
  domainWriteTargetAttestationReady: false,
  executionAuthorized: false,
  signatureRequested: false,
  transactionSubmitted: false
} as const);

const SELECTOR_READY_BOUNDARY = Object.freeze({
  ...BLOCKED_BOUNDARY,
  publicHttpsArtifactsVerified: true,
  independentRetrievalProvenanceVerified: true,
  authenticatedReviewerVerified: true,
  selectorCallPathAssessmentEmitted: true
} as const);

interface EvidenceReference {
  readonly locator: { readonly scheme: "https"; readonly uri: string };
  readonly sha256: Hex;
}

export interface PancakeV3SelectorArtifactReviewProvenance {
  readonly reviewId: Hex;
  readonly reviewerIdentity: string;
  readonly reviewedAt: string;
  readonly retrieverIdentity: string;
  readonly selectorArtifacts: readonly {
    readonly operation: string;
    readonly evidence: EvidenceReference;
    readonly retrievalReceipt: EvidenceReference;
    readonly fetchedAt: string;
    readonly rawByteLength: number;
    readonly sourcePathSha256: Hex;
    readonly bytecodePathSha256: Hex;
  }[];
  readonly delegatecallBoundaryArtifact: {
    readonly evidence: EvidenceReference;
    readonly retrievalReceipt: EvidenceReference;
    readonly fetchedAt: string;
    readonly rawByteLength: number;
    readonly sourcePathSha256: Hex;
    readonly bytecodePathSha256: Hex;
  };
  readonly bindings: typeof PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS;
}

export type PancakeV3SelectorArtifactReviewResult =
  | Readonly<{
      status: "blocked";
      assessment: null;
      provenance: null;
      issues: readonly PancakeV3SelectorArtifactReviewIssue[];
      boundary: typeof BLOCKED_BOUNDARY;
    }>
  | Readonly<{
      status: "selector_assessment_ready_attestation_still_blocked";
      assessment: DeepReadonly<PancakeV3SelectorCallPathAssessment>;
      provenance: DeepReadonly<PancakeV3SelectorArtifactReviewProvenance>;
      issues: readonly never[];
      boundary: typeof SELECTOR_READY_BOUNDARY;
    }>;

export interface BuildPancakeV3SelectorArtifactReviewOptions {
  readonly now: () => Date;
  /** Server-held trust root provisioned out of band. Never derive this from request data. */
  readonly expectedReviewId: Hex;
  readonly expectedReviewerIdentity: string;
  readonly expectedRetrieverIdentity: string;
}

type SnapshotResult =
  Readonly<{ success: true; data: unknown }> | Readonly<{ success: false; reason: string }>;

interface ParsedDirectArtifact {
  readonly descriptor: Descriptor;
  readonly body: DirectBody;
  readonly evidence: EvidenceReference;
  readonly receipt: EvidenceReference;
}

interface ParsedBoundaryArtifact {
  readonly descriptor: PancakeV3PrefetchedSelectorArtifactBatch["delegatecallBoundaryArtifact"];
  readonly body: BoundaryBody;
  readonly evidence: EvidenceReference;
  readonly receipt: EvidenceReference;
}

interface ParsedBatch {
  readonly direct: readonly [
    ParsedDirectArtifact,
    ParsedDirectArtifact,
    ParsedDirectArtifact,
    ParsedDirectArtifact
  ];
  readonly boundary: ParsedBoundaryArtifact;
  readonly reviewId: Hex;
}

function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<Value>;
}

function snapshotExactJson(value: unknown): SnapshotResult {
  let nodes = 0;
  const ancestors = new Set<object>();

  function visit(current: unknown, depth: number): SnapshotResult {
    nodes += 1;
    if (nodes > MAX_SNAPSHOT_NODES) return { success: false, reason: "node_limit" };
    if (depth > MAX_SNAPSHOT_DEPTH) return { success: false, reason: "depth_limit" };
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean" ||
      (typeof current === "number" && Number.isFinite(current))
    ) {
      return { success: true, data: current };
    }
    if (typeof current !== "object") return { success: false, reason: "non_json_value" };
    if (ancestors.has(current)) return { success: false, reason: "cycle" };
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null && !Array.isArray(current)) {
      return { success: false, reason: "non_plain_object" };
    }
    const keys = Reflect.ownKeys(current);
    if (keys.some((key) => typeof key === "symbol")) {
      return { success: false, reason: "symbol_key" };
    }
    const descriptors = Object.getOwnPropertyDescriptors(current);
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        if ((keys as string[]).some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key))) {
          return { success: false, reason: "array_extra_property" };
        }
        const output: unknown[] = [];
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (descriptor === undefined || !("value" in descriptor)) {
            return { success: false, reason: "sparse_or_accessor_array" };
          }
          const child = visit(descriptor.value, depth + 1);
          if (!child.success) return child;
          output.push(child.data);
        }
        return { success: true, data: output };
      }
      const output: Record<string, unknown> = {};
      for (const key of keys as string[]) {
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true
        ) {
          return { success: false, reason: "accessor_or_hidden_property" };
        }
        const child = visit(descriptor.value, depth + 1);
        if (!child.success) return child;
        output[key] = child.data;
      }
      return { success: true, data: output };
    } finally {
      ancestors.delete(current);
    }
  }

  try {
    return visit(value, 0);
  } catch {
    return { success: false, reason: "snapshot_error" };
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function canonicalCompact(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isSafePublicHttps(value: string): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.hash === "" &&
      parsed.search === "" &&
      (parsed.port === "" || parsed.port === "443") &&
      hostname.includes(".") &&
      isIP(hostname) === 0 &&
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      !parsed.pathname.includes("%") &&
      !parsed.pathname.split("/").some((segment) => segment === "." || segment === "..")
    );
  } catch {
    return false;
  }
}

function isContentAddressedHttps(value: string, digest: Hex): boolean {
  if (!isSafePublicHttps(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.pathname.endsWith(`/${digest.slice(2)}.json`);
  } catch {
    return false;
  }
}

function issue(
  code: PancakeV3SelectorArtifactReviewIssueCode,
  path: string,
  message: string
): PancakeV3SelectorArtifactReviewIssue {
  return { code, path, message };
}

function blocked(
  issues: readonly PancakeV3SelectorArtifactReviewIssue[]
): PancakeV3SelectorArtifactReviewResult {
  return deepFreeze({
    status: "blocked" as const,
    assessment: null,
    provenance: null,
    issues: [...issues].slice(0, MAX_ISSUES),
    boundary: BLOCKED_BOUNDARY
  });
}

function artifactEvidence(descriptor: { locator: string; expectedSha256: Hex }): EvidenceReference {
  return {
    locator: { scheme: "https", uri: descriptor.locator },
    sha256: descriptor.expectedSha256
  };
}

function receiptEvidence(descriptor: {
  retrieval: { receipt: { locator: string; sha256: Hex } };
}): EvidenceReference {
  return {
    locator: { scheme: "https", uri: descriptor.retrieval.receipt.locator },
    sha256: descriptor.retrieval.receipt.sha256
  };
}

function inspectDescriptor<Body>(
  descriptor: Descriptor | PancakeV3PrefetchedSelectorArtifactBatch["delegatecallBoundaryArtifact"],
  bodySchema: z.ZodType<Body>,
  pathPrefix: string,
  issues: PancakeV3SelectorArtifactReviewIssue[]
): Body | null {
  const body = descriptor.rawBodyUtf8;
  if (!isWellFormedUtf16(body) || body.charCodeAt(0) === 0xfeff) {
    issues.push(
      issue(
        "BODY_ENCODING_INVALID",
        `${pathPrefix}.rawBodyUtf8`,
        "Artifact body must be BOM-free, well-formed UTF-8 source text."
      )
    );
    return null;
  }
  const rawByteLength = Buffer.byteLength(body, "utf8");
  if (
    rawByteLength < 2 ||
    rawByteLength > PANCAKE_V3_SELECTOR_ARTIFACT_MAX_BYTES ||
    descriptor.retrieval.rawByteLength !== rawByteLength
  ) {
    issues.push(
      issue(
        "BODY_SIZE_INVALID",
        `${pathPrefix}.retrieval.rawByteLength`,
        "Complete raw UTF-8 byte length is missing, mismatched, or outside the fixed bound."
      )
    );
  }
  const actualSha256 = sha256(stringToHex(body));
  if (actualSha256 !== descriptor.expectedSha256) {
    issues.push(
      issue(
        "BODY_SHA256_MISMATCH",
        `${pathPrefix}.expectedSha256`,
        "Expected SHA-256 does not bind the exact raw response bytes, including the final LF."
      )
    );
  }
  if (!isContentAddressedHttps(descriptor.locator, descriptor.expectedSha256)) {
    issues.push(
      issue(
        "LOCATOR_INVALID",
        `${pathPrefix}.locator`,
        "Artifact locator must be credential-free public HTTPS and end in /<raw-sha256>.json."
      )
    );
  }
  const retrieval = descriptor.retrieval;
  if (
    retrieval.requestedUrl !== descriptor.locator ||
    retrieval.finalUrl !== descriptor.locator ||
    retrieval.rawByteLength !== rawByteLength ||
    !isContentAddressedHttps(retrieval.receipt.locator, retrieval.receipt.sha256) ||
    retrieval.receipt.locator.toLowerCase() === descriptor.locator.toLowerCase() ||
    retrieval.receipt.sha256 === descriptor.expectedSha256
  ) {
    issues.push(
      issue(
        "RETRIEVAL_INVALID",
        `${pathPrefix}.retrieval`,
        "Independent no-redirect public retrieval and its distinct content-addressed receipt must bind the exact response."
      )
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body) as unknown;
  } catch {
    issues.push(
      issue(
        "ARTIFACT_JSON_INVALID",
        `${pathPrefix}.rawBodyUtf8`,
        "Artifact body is not valid JSON."
      )
    );
    return null;
  }
  const parsed = bodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    issues.push(
      issue(
        "ARTIFACT_SCHEMA_INVALID",
        `${pathPrefix}.rawBodyUtf8`,
        "Artifact JSON does not match the exact independently reviewed selector-evidence schema."
      )
    );
    return null;
  }
  if (body !== canonicalJson(parsed.data)) {
    issues.push(
      issue(
        "ARTIFACT_CANONICAL_INVALID",
        `${pathPrefix}.rawBodyUtf8`,
        "Artifact bytes must be lexicographically canonical JSON with two-space indentation and exactly one final LF."
      )
    );
  }
  return parsed.data;
}

function reviewManifest(
  direct: ParsedBatch["direct"],
  boundary: ParsedBoundaryArtifact
): Record<string, unknown> {
  return {
    schemaVersion: PANCAKE_V3_SELECTOR_ARTIFACT_REVIEW_SCHEMA_VERSION,
    domain: REVIEW_ID_DOMAIN,
    bindings: PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS,
    reviewer: direct[0].body.reviewer,
    retrieverIdentity: direct[0].descriptor.retrieval.retrieverIdentity,
    selectorArtifacts: direct.map(({ descriptor, body, evidence, receipt }) => ({
      operation: body.operation,
      signature: body.signature,
      selector: body.selector,
      evidence,
      retrievalReceipt: receipt,
      fetchedAt: descriptor.retrieval.fetchedAt,
      rawByteLength: descriptor.retrieval.rawByteLength,
      sourcePathSha256: body.sourcePathSha256,
      bytecodePathSha256: body.bytecodePathSha256
    })),
    delegatecallBoundaryArtifact: {
      evidence: boundary.evidence,
      retrievalReceipt: boundary.receipt,
      fetchedAt: boundary.descriptor.retrieval.fetchedAt,
      rawByteLength: boundary.descriptor.retrieval.rawByteLength,
      sourcePathSha256: boundary.body.sourcePathSha256,
      bytecodePathSha256: boundary.body.bytecodePathSha256,
      delegatecallProgramCounter: boundary.body.delegatecallProgramCounter,
      deniedMulticalls: boundary.body.deniedMulticalls
    }
  };
}

function inspectBatch(
  input: unknown
):
  | Readonly<{ success: true; parsed: ParsedBatch }>
  | Readonly<{ success: false; issues: readonly PancakeV3SelectorArtifactReviewIssue[] }> {
  const snapshot = snapshotExactJson(input);
  if (!snapshot.success) {
    return {
      success: false,
      issues: [issue("INPUT_UNSAFE", "batch", `Batch was not inert JSON (${snapshot.reason}).`)]
    };
  }
  const batchResult = pancakeV3PrefetchedSelectorArtifactBatchSchema.safeParse(snapshot.data);
  if (!batchResult.success) {
    return {
      success: false,
      issues: [
        issue(
          "BATCH_INVALID",
          "batch",
          "Expected the exact fixed-order four-selector batch and one delegatecall-boundary descriptor."
        )
      ]
    };
  }
  const batch = batchResult.data;
  const issues: PancakeV3SelectorArtifactReviewIssue[] = [];
  const bodySchemas = [
    directArtifactBodySchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[0]),
    directArtifactBodySchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[1]),
    directArtifactBodySchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[2]),
    directArtifactBodySchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[3])
  ] as const;
  const parsedDirect: ParsedDirectArtifact[] = [];
  for (let index = 0; index < batch.selectorArtifacts.length; index += 1) {
    const descriptor = batch.selectorArtifacts[index];
    const bodySchema = bodySchemas[index];
    if (descriptor === undefined || bodySchema === undefined) {
      issues.push(
        issue(
          "INTERNAL_VALIDATION_ERROR",
          `batch.selectorArtifacts[${index}]`,
          "Fixed selector tuple indexing failed."
        )
      );
      continue;
    }
    const body = inspectDescriptor(
      descriptor,
      bodySchema as z.ZodType<DirectBody>,
      `batch.selectorArtifacts[${index}]`,
      issues
    );
    if (body !== null) {
      parsedDirect.push({
        descriptor,
        body,
        evidence: artifactEvidence(descriptor),
        receipt: receiptEvidence(descriptor)
      });
    }
  }
  const boundaryBody = inspectDescriptor(
    batch.delegatecallBoundaryArtifact,
    delegatecallBoundaryBodySchema,
    "batch.delegatecallBoundaryArtifact",
    issues
  );
  if (issues.length > 0 || parsedDirect.length !== 4 || boundaryBody === null) {
    return { success: false, issues };
  }
  const direct = parsedDirect as unknown as ParsedBatch["direct"];
  const boundary: ParsedBoundaryArtifact = {
    descriptor: batch.delegatecallBoundaryArtifact,
    body: boundaryBody,
    evidence: artifactEvidence(batch.delegatecallBoundaryArtifact),
    receipt: receiptEvidence(batch.delegatecallBoundaryArtifact)
  };
  const reviews = [...direct.map(({ body }) => body.reviewer), boundary.body.reviewer];
  const referenceReview = canonicalCompact(reviews[0]);
  if (reviews.some((review) => canonicalCompact(review) !== referenceReview)) {
    issues.push(
      issue(
        "REVIEW_METADATA_MISMATCH",
        "batch",
        "All five artifacts must bind one exact reviewer, method, version, decision, and reviewed-at time."
      )
    );
  }
  const descriptors = [...direct.map(({ descriptor }) => descriptor), boundary.descriptor];
  const artifactDigests = descriptors.map(({ expectedSha256 }) => expectedSha256);
  const artifactLocators = descriptors.map(({ locator }) => locator.toLowerCase());
  const receiptDigests = descriptors.map(({ retrieval }) => retrieval.receipt.sha256);
  const receiptLocators = descriptors.map(({ retrieval }) =>
    retrieval.receipt.locator.toLowerCase()
  );
  if (
    new Set(artifactDigests).size !== 5 ||
    new Set(artifactLocators).size !== 5 ||
    new Set(receiptDigests).size !== 5 ||
    new Set(receiptLocators).size !== 5 ||
    artifactDigests.some((digest) => receiptDigests.includes(digest)) ||
    artifactLocators.some((locator) => receiptLocators.includes(locator))
  ) {
    issues.push(
      issue(
        "EVIDENCE_NOT_DISTINCT",
        "batch",
        "Every artifact and independent retrieval receipt requires a distinct locator and digest."
      )
    );
  }
  const sourcePathDigests = [
    ...direct.map(({ body }) => body.sourcePathSha256),
    boundary.body.sourcePathSha256
  ];
  const bytecodePathDigests = [
    ...direct.map(({ body }) => body.bytecodePathSha256),
    boundary.body.bytecodePathSha256
  ];
  if (new Set(sourcePathDigests).size !== 5 || new Set(bytecodePathDigests).size !== 5) {
    issues.push(
      issue(
        "PATH_DIGEST_NOT_DISTINCT",
        "batch",
        "Each direct selector and the delegatecall boundary require distinct source and bytecode path digests."
      )
    );
  }
  if (issues.length > 0) return { success: false, issues };
  const reviewId = sha256(stringToHex(canonicalCompact(reviewManifest(direct, boundary))));
  return { success: true, parsed: { direct, boundary, reviewId } };
}

function readOptions(value: unknown): Readonly<{
  now: () => unknown;
  expectedReviewId: Hex;
  expectedReviewerIdentity: string;
  expectedRetrieverIdentity: string;
}> | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) return null;
    const stringKeys = (keys as string[]).sort();
    if (
      canonicalCompact(stringKeys) !==
      canonicalCompact(
        ["expectedReviewId", "expectedReviewerIdentity", "expectedRetrieverIdentity", "now"].sort()
      )
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const now = descriptors.now;
    const expectedReviewId = descriptors.expectedReviewId;
    const expectedReviewerIdentity = descriptors.expectedReviewerIdentity;
    const expectedRetrieverIdentity = descriptors.expectedRetrieverIdentity;
    if (
      now === undefined ||
      expectedReviewId === undefined ||
      expectedReviewerIdentity === undefined ||
      expectedRetrieverIdentity === undefined ||
      !("value" in now) ||
      !("value" in expectedReviewId) ||
      !("value" in expectedReviewerIdentity) ||
      !("value" in expectedRetrieverIdentity) ||
      !now.enumerable ||
      !expectedReviewId.enumerable ||
      !expectedReviewerIdentity.enumerable ||
      !expectedRetrieverIdentity.enumerable ||
      typeof now.value !== "function" ||
      typeof expectedReviewId.value !== "string" ||
      !/^0x[0-9a-f]{64}$/.test(expectedReviewId.value) ||
      expectedReviewId.value === ZERO_BYTES32 ||
      typeof expectedReviewerIdentity.value !== "string" ||
      !identitySchema.safeParse(expectedReviewerIdentity.value).success ||
      typeof expectedRetrieverIdentity.value !== "string" ||
      !identitySchema.safeParse(expectedRetrieverIdentity.value).success
    ) {
      return null;
    }
    const nowFunction: (...arguments_: readonly unknown[]) => unknown = now.value;
    return {
      now: () => Reflect.apply(nowFunction, undefined, []),
      expectedReviewId: expectedReviewId.value as Hex,
      expectedReviewerIdentity: expectedReviewerIdentity.value,
      expectedRetrieverIdentity: expectedRetrieverIdentity.value
    };
  } catch {
    return null;
  }
}

function captureNow(now: () => unknown): Date | null {
  try {
    const value = now();
    if (!(value instanceof Date) || Object.getPrototypeOf(value) !== Date.prototype) return null;
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
  } catch {
    return null;
  }
}

/**
 * Offline provisioning helper. Its result becomes a trust root only after an independent server
 * administrator authenticates and allowlists it. Never derive and accept this ID in one request.
 */
export function derivePancakeV3SelectorArtifactReviewId(batchInput: unknown): Hex | null {
  const inspected = inspectBatch(batchInput);
  return inspected.success ? inspected.parsed.reviewId : null;
}

/**
 * Validates already-fetched inert evidence descriptors. This module never performs a fetch.
 * A successful result is only the nested selectorCallPathAssessment input for the domain
 * write-target attestation; it never authorizes execution or replaces fresh chain evidence.
 */
export function buildPancakeV3SelectorArtifactReview(
  batchInput: unknown,
  optionsInput: BuildPancakeV3SelectorArtifactReviewOptions
): PancakeV3SelectorArtifactReviewResult {
  const options = readOptions(optionsInput);
  if (options === null) {
    return blocked([
      issue(
        "OPTIONS_INVALID",
        "options",
        "Expected strict server-held review ID, reviewer/retriever identities, and clock."
      )
    ]);
  }
  const now = captureNow(options.now);
  if (now === null) {
    return blocked([issue("CLOCK_INVALID", "options.now", "Injected clock was invalid.")]);
  }
  const inspected = inspectBatch(batchInput);
  if (!inspected.success) return blocked(inspected.issues);
  const { direct, boundary, reviewId } = inspected.parsed;
  const issues: PancakeV3SelectorArtifactReviewIssue[] = [];
  const reviewer = direct[0].body.reviewer;
  const retrieverIdentity = direct[0].descriptor.retrieval.retrieverIdentity;
  if (
    reviewId !== options.expectedReviewId ||
    reviewer.identity !== options.expectedReviewerIdentity ||
    retrieverIdentity !== options.expectedRetrieverIdentity ||
    reviewer.identity.toLowerCase() === retrieverIdentity.toLowerCase() ||
    [...direct, boundary].some(
      ({ descriptor }) =>
        descriptor.retrieval.retrieverIdentity !== options.expectedRetrieverIdentity
    )
  ) {
    issues.push(
      issue(
        "REVIEW_NOT_TRUSTED",
        "options",
        "Batch review ID and independently allowlisted reviewer/retriever identities must match exactly and remain distinct."
      )
    );
  }
  const nowMs = now.getTime();
  const reviewedMs = Date.parse(reviewer.reviewedAt);
  if (
    reviewedMs > nowMs ||
    nowMs - reviewedMs > PANCAKE_V3_SELECTOR_ARTIFACT_REVIEW_MAX_AGE_SECONDS * 1_000 ||
    direct.some(({ body }) => {
      const analyzedMs = Date.parse(body.analyzedAt);
      return analyzedMs > reviewedMs || analyzedMs > nowMs;
    })
  ) {
    issues.push(
      issue(
        "REVIEW_TIME_INVALID",
        "batch.selectorArtifacts",
        `Review must not be future-dated, analysis must precede review, and review age cannot exceed ${PANCAKE_V3_SELECTOR_ARTIFACT_REVIEW_MAX_AGE_SECONDS} seconds.`
      )
    );
  }
  const allArtifacts = [...direct, boundary];
  if (
    allArtifacts.some(({ descriptor }) => {
      const fetchedMs = Date.parse(descriptor.retrieval.fetchedAt);
      return (
        fetchedMs < reviewedMs ||
        fetchedMs > nowMs ||
        nowMs - fetchedMs > PANCAKE_V3_SELECTOR_ARTIFACT_RETRIEVAL_MAX_AGE_SECONDS * 1_000
      );
    })
  ) {
    issues.push(
      issue(
        "REVIEW_TIME_INVALID",
        "batch",
        `Every public artifact must be independently re-fetched after review and within ${PANCAKE_V3_SELECTOR_ARTIFACT_RETRIEVAL_MAX_AGE_SECONDS} seconds of the injected clock.`
      )
    );
  }
  if (issues.length > 0) return blocked(issues);

  const assessmentCandidate = {
    scope: "pancake_v3_position_manager_direct_calls" as const,
    runtimeCodeHash: MANAGER_RUNTIME_HASH,
    sourceTreeSha256: SOURCE_TREE_SHA256,
    compilerOutputArtifactSha256: MANAGER_ARTIFACT_SHA256,
    writeScopeSha256: PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256,
    allowedDirectCalls: direct.map(({ body, evidence }) => ({
      operation: body.operation,
      signature: body.signature,
      selector: body.selector,
      decision: "allowed_direct_entrypoint" as const,
      analyzedAt: body.analyzedAt,
      method: {
        name: PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD.name,
        version: PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD.version,
        assurance: PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD.assurance
      },
      bindings: {
        runtimeCodeHash: MANAGER_RUNTIME_HASH,
        sourceTreeSha256: SOURCE_TREE_SHA256,
        compilerOutputArtifactSha256: MANAGER_ARTIFACT_SHA256,
        writeScopeSha256: PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256
      },
      reachability: {
        controlFlowCoverage: body.reachability.controlFlowCoverage,
        delegatecall: body.reachability.delegatecall,
        arbitraryDispatcher: body.reachability.arbitraryDispatcher,
        unknownPaths: body.reachability.unknownPaths
      },
      analysisArtifact: evidence,
      sourcePathSha256: body.sourcePathSha256,
      bytecodePathSha256: body.bytecodePathSha256
    })),
    delegatecallBoundary: {
      classification: boundary.body.classification,
      delegatecallProgramCounter: boundary.body.delegatecallProgramCounter,
      reviewedSourceLocation: boundary.body.reviewedSourceLocation,
      runtimeCodeHash: MANAGER_RUNTIME_HASH,
      compilerOutputArtifactSha256: MANAGER_ARTIFACT_SHA256,
      reviewedAt: boundary.body.reviewer.reviewedAt,
      analysisArtifact: boundary.evidence,
      deniedMulticalls: boundary.body.deniedMulticalls,
      unlistedSelectors: boundary.body.unlistedSelectors,
      nestedCalldata: boundary.body.nestedCalldata
    }
  };
  const assessmentResult = pancakeV3SelectorCallPathAssessmentSchema.safeParse(assessmentCandidate);
  if (!assessmentResult.success) {
    return blocked([
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "assessment",
        "Validated public selector artifacts did not assemble into the exact domain assessment schema."
      )
    ]);
  }
  const assessment = assessmentResult.data;
  const provenance: PancakeV3SelectorArtifactReviewProvenance = {
    reviewId,
    reviewerIdentity: reviewer.identity,
    reviewedAt: reviewer.reviewedAt,
    retrieverIdentity,
    selectorArtifacts: direct.map(({ descriptor, body, evidence, receipt }) => ({
      operation: body.operation,
      evidence,
      retrievalReceipt: receipt,
      fetchedAt: descriptor.retrieval.fetchedAt,
      rawByteLength: descriptor.retrieval.rawByteLength,
      sourcePathSha256: body.sourcePathSha256,
      bytecodePathSha256: body.bytecodePathSha256
    })),
    delegatecallBoundaryArtifact: {
      evidence: boundary.evidence,
      retrievalReceipt: boundary.receipt,
      fetchedAt: boundary.descriptor.retrieval.fetchedAt,
      rawByteLength: boundary.descriptor.retrieval.rawByteLength,
      sourcePathSha256: boundary.body.sourcePathSha256,
      bytecodePathSha256: boundary.body.bytecodePathSha256
    },
    bindings: PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS
  };
  return deepFreeze({
    status: "selector_assessment_ready_attestation_still_blocked" as const,
    assessment,
    provenance,
    issues: [] as const,
    boundary: SELECTOR_READY_BOUNDARY
  });
}
