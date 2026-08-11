import { keccak256, stringToHex, type Hex } from "viem";
import { z } from "zod";

export const WRITE_TARGET_ATTESTATION_SCHEMA_VERSION = 2 as const;
export const WRITE_TARGET_REVIEW_ID_DOMAIN =
  "ProofEra:write-target-source-proxy-attestation:v2" as const;
export const WRITE_TARGET_MAX_BLOCK_AGE_SECONDS = 120 as const;

export const PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD = Object.freeze({
  name: "manual_static_source_and_bytecode_control_flow_review" as const,
  version: "proofera-pancake-v3-selector-path-v1" as const,
  assurance: "manual_static_analysis_not_formal_proof" as const
});

export const PROOFERA_PANCAKE_V3_DIRECT_CALLS = Object.freeze([
  Object.freeze({
    operation: "mint" as const,
    signature:
      "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))" as const,
    selector: "0x88316456" as const
  }),
  Object.freeze({
    operation: "increaseLiquidity" as const,
    signature: "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))" as const,
    selector: "0x219f5d17" as const
  }),
  Object.freeze({
    operation: "decreaseLiquidity" as const,
    signature: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))" as const,
    selector: "0x0c49ccbe" as const
  }),
  Object.freeze({
    operation: "collect" as const,
    signature: "collect((uint256,address,uint128,uint128))" as const,
    selector: "0xfc6f7865" as const
  })
] as const);

export const PROOFERA_PANCAKE_V3_DENIED_MULTICALLS = Object.freeze([
  Object.freeze({
    signature: "multicall(bytes[])" as const,
    selector: "0xac9650d8" as const,
    classification: "observed_self_delegatecall_entrypoint" as const
  }),
  Object.freeze({
    signature: "multicall(uint256,bytes[])" as const,
    selector: "0x5ae401dc" as const,
    classification: "known_multicall_signature_defense_in_depth" as const
  }),
  Object.freeze({
    signature: "multicall(bytes32,bytes[])" as const,
    selector: "0x1f0464d1" as const,
    classification: "known_multicall_signature_defense_in_depth" as const
  })
] as const);

export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
export const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
export const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as const;
export const EIP1967_BEACON_IMPLEMENTATION_SELECTOR = "0x5c60da1b" as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
export const EVM_EMPTY_RUNTIME_CODE_HASH =
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470" as const;
const UINT256_MAX = (1n << 256n) - 1n;
const MAX_ISSUES = 64;
const MAX_SNAPSHOT_DEPTH = 32;
const MAX_SNAPSHOT_NODES = 20_000;

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 20-byte EVM address.")
  .transform((value) => value.toLowerCase())
  .refine((value) => value !== ZERO_ADDRESS, "The zero address is not allowed.");

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hexadecimal value.")
  .transform((value) => value.toLowerCase());

const nonZeroBytes32Schema = bytes32Schema.refine(
  (value) => value !== ZERO_BYTES32,
  "The zero bytes32 value is not allowed."
);

const contractRuntimeCodeHashSchema = nonZeroBytes32Schema.refine(
  (value) => value !== EVM_EMPTY_RUNTIME_CODE_HASH,
  "A contract runtime-code hash cannot be the empty-code hash."
);

const canonicalUint256Schema = z
  .string()
  .min(1)
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/, "Expected a canonical unsigned decimal string.")
  .refine((value) => {
    try {
      return BigInt(value) <= UINT256_MAX;
    } catch {
      return false;
    }
  }, "Value exceeds uint256.");

const positiveBlockNumberSchema = canonicalUint256Schema.refine(
  (value) => value !== "0",
  "Block number must be positive."
);

const utcSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

function isSafeHttpsLocator(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.length > 0 &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

const httpsUriSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine(isSafeHttpsLocator, "Expected a credential-free HTTPS locator without a fragment.");

const ipfsUriSchema = z
  .string()
  .min(1)
  .max(2_048)
  .regex(
    /^ipfs:\/\/bafy[a-z2-7]{20,}(?:\/[A-Za-z0-9._~-]+)*$/,
    "Expected a canonical CIDv1 base32 IPFS locator without query or traversal segments."
  )
  .refine(
    (value) => !value.split("/").some((segment) => segment === "." || segment === ".."),
    "IPFS locator cannot contain traversal segments."
  );

export const writeTargetEvidenceLocatorSchema = z.discriminatedUnion("scheme", [
  z.strictObject({ scheme: z.literal("https"), uri: httpsUriSchema }),
  z.strictObject({ scheme: z.literal("ipfs"), uri: ipfsUriSchema })
]);

export type WriteTargetEvidenceLocator = z.infer<typeof writeTargetEvidenceLocatorSchema>;

const evidenceReferenceSchema = z.strictObject({
  locator: writeTargetEvidenceLocatorSchema,
  sha256: nonZeroBytes32Schema
});

const sourceArtifactPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_@+./-]+$/, "Artifact path contains unsupported characters.")
  .refine((value) => !value.startsWith("/"), "Artifact path must be repository-relative.")
  .refine((value) => !value.includes("\\"), "Artifact path must use forward slashes.")
  .refine(
    (value) =>
      !value.split("/").some((segment) => segment === "" || segment === "." || segment === ".."),
    "Artifact path must be canonical and cannot traverse directories."
  );

const compilerProvenanceSchema = z.strictObject({
  name: z.literal("solc"),
  version: z
    .string()
    .regex(/^0\.[0-9]+\.[0-9]+\+commit\.[0-9a-f]{8}$/, "Expected an exact solc build version."),
  compilerInputSha256: nonZeroBytes32Schema,
  compilerSettingsSha256: nonZeroBytes32Schema,
  outputArtifactSha256: nonZeroBytes32Schema,
  outputRuntimeCodeHash: contractRuntimeCodeHashSchema,
  optimizer: z.strictObject({
    enabled: z.boolean(),
    runs: z.number().int().min(0).max(4_294_967_295)
  }),
  viaIr: z.boolean(),
  evmVersion: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_-]+$/),
  metadataBytecodeHash: z.enum(["ipfs", "bzzr1", "none"])
});

export const writeTargetSourceReviewSchema = z.strictObject({
  runtimeCodeHash: contractRuntimeCodeHashSchema,
  source: z.strictObject({
    repositoryUrl: httpsUriSchema,
    commit: z.string().regex(/^[0-9a-f]{40}$/, "Expected a lowercase full Git commit."),
    artifactPath: sourceArtifactPathSchema,
    contractName: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
    sourceTreeSha256: nonZeroBytes32Schema
  }),
  compiler: compilerProvenanceSchema,
  verification: z.strictObject({
    kind: z.enum(["reproducible_build", "sourcify_full_match", "explorer_exact_match"]),
    claim: z.literal("runtime_bytecode_exact_match"),
    runtimeCodeHash: contractRuntimeCodeHashSchema,
    verifiedAt: utcSchema,
    evidence: evidenceReferenceSchema
  }),
  independentReview: z.strictObject({
    decision: z.literal("approved_for_exact_scoped_writes"),
    methodology: z.literal("manual_source_build_and_control_path_review"),
    reviewerIdentity: z
      .string()
      .min(3)
      .max(160)
      .regex(/^[A-Za-z0-9._:@/+ -]+$/),
    reviewedAt: utcSchema,
    runtimeCodeHash: contractRuntimeCodeHashSchema,
    writeScopeSha256: nonZeroBytes32Schema,
    evidence: evidenceReferenceSchema
  })
});

export type WriteTargetSourceReview = z.infer<typeof writeTargetSourceReviewSchema>;

const selectorPathAnalysisMethodSchema = z.strictObject({
  name: z.literal(PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD.name),
  version: z.literal(PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD.version),
  assurance: z.literal(PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD.assurance)
});

const selectorPathBindingsSchema = z.strictObject({
  runtimeCodeHash: contractRuntimeCodeHashSchema,
  sourceTreeSha256: nonZeroBytes32Schema,
  compilerOutputArtifactSha256: nonZeroBytes32Schema,
  writeScopeSha256: nonZeroBytes32Schema
});

const selectorPathAnalysisShape = {
  decision: z.literal("allowed_direct_entrypoint"),
  analyzedAt: utcSchema,
  method: selectorPathAnalysisMethodSchema,
  bindings: selectorPathBindingsSchema,
  reachability: z.strictObject({
    controlFlowCoverage: z.literal("all_branches_resolved"),
    delegatecall: z.literal("unreachable"),
    arbitraryDispatcher: z.literal("unreachable"),
    unknownPaths: z.literal("none")
  }),
  analysisArtifact: evidenceReferenceSchema,
  sourcePathSha256: nonZeroBytes32Schema,
  bytecodePathSha256: nonZeroBytes32Schema
} as const;

function allowedDirectCallPathSchema<
  const Definition extends (typeof PROOFERA_PANCAKE_V3_DIRECT_CALLS)[number]
>(definition: Definition) {
  return z.strictObject({
    operation: z.literal(definition.operation),
    signature: z.literal(definition.signature),
    selector: z.literal(definition.selector),
    ...selectorPathAnalysisShape
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

export const pancakeV3SelectorCallPathAssessmentSchema = z.strictObject({
  scope: z.literal("pancake_v3_position_manager_direct_calls"),
  runtimeCodeHash: contractRuntimeCodeHashSchema,
  sourceTreeSha256: nonZeroBytes32Schema,
  compilerOutputArtifactSha256: nonZeroBytes32Schema,
  writeScopeSha256: nonZeroBytes32Schema,
  allowedDirectCalls: z.tuple([
    allowedDirectCallPathSchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[0]),
    allowedDirectCallPathSchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[1]),
    allowedDirectCallPathSchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[2]),
    allowedDirectCallPathSchema(PROOFERA_PANCAKE_V3_DIRECT_CALLS[3])
  ]),
  delegatecallBoundary: z.strictObject({
    classification: z.literal("known_self_delegatecall_dispatcher_present"),
    delegatecallProgramCounter: z.literal(10_522),
    reviewedSourceLocation: z.literal(
      "projects/v3-periphery/contracts/base/Multicall.sol#multicall(bytes[])_self_delegatecall"
    ),
    runtimeCodeHash: contractRuntimeCodeHashSchema,
    compilerOutputArtifactSha256: nonZeroBytes32Schema,
    reviewedAt: utcSchema,
    analysisArtifact: evidenceReferenceSchema,
    deniedMulticalls: z.tuple([
      deniedMulticallSchema(PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[0]),
      deniedMulticallSchema(PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[1]),
      deniedMulticallSchema(PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[2])
    ]),
    unlistedSelectors: z.literal("denied"),
    nestedCalldata: z.literal("denied")
  })
});

export type PancakeV3SelectorCallPathAssessment = z.infer<
  typeof pancakeV3SelectorCallPathAssessmentSchema
>;

const blockReferenceShape = {
  blockNumber: positiveBlockNumberSchema,
  blockHash: nonZeroBytes32Schema
} as const;

const pinnedContractCodeSchema = z.strictObject({
  ...blockReferenceShape,
  address: addressSchema,
  runtimeCodeHash: contractRuntimeCodeHashSchema,
  observedAt: utcSchema
});

const reviewedContractSchema = z.strictObject({
  code: pinnedContractCodeSchema,
  sourceReview: writeTargetSourceReviewSchema
});

const pinnedExternallyOwnedAccountSchema = z.strictObject({
  accountKind: z.literal("eoa"),
  code: z.strictObject({
    ...blockReferenceShape,
    address: addressSchema,
    runtimeCodeHash: z.literal(EVM_EMPTY_RUNTIME_CODE_HASH),
    observedAt: utcSchema
  }),
  sourceReview: z.null()
});

const pinnedContractAccountSchema = z.strictObject({
  accountKind: z.literal("contract"),
  code: pinnedContractCodeSchema,
  sourceReview: writeTargetSourceReviewSchema
});

const pinnedControlAccountSchema = z.union([
  pinnedExternallyOwnedAccountSchema,
  pinnedContractAccountSchema
]);

const pinnedSlotSchema = z.strictObject({
  ...blockReferenceShape,
  slot: nonZeroBytes32Schema,
  value: bytes32Schema
});

const proxyAssessmentEvidenceSchema = z.strictObject({
  decision: z.literal("recognized_standard_and_control_paths_reviewed"),
  reviewedAt: utcSchema,
  evidence: evidenceReferenceSchema
});

const slotSetShape = {
  implementation: pinnedSlotSchema,
  admin: pinnedSlotSchema,
  beacon: pinnedSlotSchema
} as const;

const nonProxyBindingShape = {
  kind: z.literal("non_proxy"),
  targetAddress: addressSchema,
  ...blockReferenceShape,
  runtimeCodeHash: contractRuntimeCodeHashSchema,
  observedAt: utcSchema,
  evidence: evidenceReferenceSchema
} as const;

const wholeRuntimeNonProxyAssessmentSchema = z.strictObject({
  ...nonProxyBindingShape,
  decision: z.literal("independently_reviewed_non_proxy"),
  delegatecallReachability: z.literal("no_reachable_delegatecall")
});

const selectorScopedNonProxyAssessmentSchema = z.strictObject({
  ...nonProxyBindingShape,
  decision: z.literal("independently_reviewed_non_proxy_selector_scoped"),
  selectorCallPathAssessment: pancakeV3SelectorCallPathAssessmentSchema
});

const nonProxyAssessmentSchema = z.union([
  wholeRuntimeNonProxyAssessmentSchema,
  selectorScopedNonProxyAssessmentSchema
]);

const blockedProxyAssessmentSchema = z.strictObject({
  kind: z.literal("blocked"),
  classification: z.enum([
    "unknown",
    "custom_proxy",
    "delegatecall_ambiguous",
    "unrecognized_proxy",
    "eip1967_uups_control_ambiguous"
  ]),
  targetAddress: addressSchema,
  ...blockReferenceShape,
  observedAt: utcSchema,
  evidence: evidenceReferenceSchema
});

const transparentProxyAssessmentSchema = z.strictObject({
  kind: z.literal("recognized_proxy"),
  standard: z.literal("eip1967_transparent"),
  proxyAddress: addressSchema,
  ...blockReferenceShape,
  observedAt: utcSchema,
  evidence: proxyAssessmentEvidenceSchema,
  slots: z.strictObject(slotSetShape),
  implementation: reviewedContractSchema,
  admin: pinnedControlAccountSchema,
  beacon: z.null()
});

const beaconProxyAssessmentSchema = z.strictObject({
  kind: z.literal("recognized_proxy"),
  standard: z.literal("eip1967_beacon"),
  proxyAddress: addressSchema,
  ...blockReferenceShape,
  observedAt: utcSchema,
  evidence: proxyAssessmentEvidenceSchema,
  slots: z.strictObject(slotSetShape),
  implementation: reviewedContractSchema,
  admin: z.null(),
  beacon: reviewedContractSchema,
  beaconImplementationRead: z.strictObject({
    ...blockReferenceShape,
    beaconAddress: addressSchema,
    selector: z.literal(EIP1967_BEACON_IMPLEMENTATION_SELECTOR),
    returnedImplementationAddress: addressSchema,
    evidence: evidenceReferenceSchema
  }),
  beaconUpgradeAuthority: z.strictObject({
    ...blockReferenceShape,
    beaconAddress: addressSchema,
    authorityAddress: addressSchema,
    discoveryMethod: z.literal("reviewed_source_control_path"),
    authority: pinnedControlAccountSchema,
    evidence: evidenceReferenceSchema
  })
});

export const writeTargetProxyAssessmentSchema = z.union([
  nonProxyAssessmentSchema,
  transparentProxyAssessmentSchema,
  beaconProxyAssessmentSchema,
  blockedProxyAssessmentSchema
]);

export type WriteTargetProxyAssessment = z.infer<typeof writeTargetProxyAssessmentSchema>;

const writeTargetAttestationManifestShape = {
  schemaVersion: z.literal(WRITE_TARGET_ATTESTATION_SCHEMA_VERSION),
  chainId: z.literal(97),
  environment: z.literal("testnet"),
  canonicalBlock: z.strictObject({
    number: positiveBlockNumberSchema,
    hash: nonZeroBytes32Schema,
    timestamp: utcSchema
  }),
  attestedAt: utcSchema,
  target: reviewedContractSchema,
  proxyAssessment: writeTargetProxyAssessmentSchema
} as const;

export const writeTargetAttestationManifestSchema = z.strictObject(
  writeTargetAttestationManifestShape
);

export type WriteTargetAttestationManifest = z.infer<typeof writeTargetAttestationManifestSchema>;

export const writeTargetAttestationSchema = z.strictObject({
  ...writeTargetAttestationManifestShape,
  reviewId: nonZeroBytes32Schema
});

export type WriteTargetAttestation = z.infer<typeof writeTargetAttestationSchema>;

export const writeTargetAttestationIssueCodeSchema = z.enum([
  "INPUT_UNSAFE",
  "OPTIONS_INVALID",
  "CLOCK_INVALID",
  "ATTESTATION_SCHEMA_INVALID",
  "LOCATOR_INVALID",
  "SOURCE_EVIDENCE_INVALID",
  "PROXY_ASSESSMENT_INVALID",
  "REVIEW_ID_MISMATCH",
  "REVIEW_NOT_TRUSTED",
  "BLOCK_FROM_FUTURE",
  "BLOCK_STALE",
  "BLOCK_RELATION_INVALID",
  "OBSERVATION_FROM_FUTURE",
  "OBSERVATION_TIME_INVALID",
  "SOURCE_HASH_MISMATCH",
  "SOURCE_TIME_INVALID",
  "SELECTOR_PATH_ASSESSMENT_INVALID",
  "SELECTOR_PATH_BINDING_MISMATCH",
  "SELECTOR_PATH_TIME_INVALID",
  "PROXY_ASSESSMENT_BLOCKED",
  "NON_PROXY_BINDING_MISMATCH",
  "PROXY_SLOT_MISMATCH",
  "PROXY_COMPONENT_MISMATCH",
  "PROXY_BLOCK_MISMATCH",
  "PROXY_TIME_INVALID",
  "INTERNAL_VALIDATION_ERROR"
]);

export type WriteTargetAttestationIssueCode = z.infer<typeof writeTargetAttestationIssueCodeSchema>;

const issueSchema = z.strictObject({
  code: writeTargetAttestationIssueCodeSchema,
  path: z.string().min(1).max(240),
  message: z.string().min(1).max(320),
  cause: z.string().min(1).max(120).nullable()
});

export type WriteTargetAttestationIssue = z.infer<typeof issueSchema>;

const boundarySchema = z.strictObject({
  sourceAndProxyAttested: z.boolean(),
  executionAuthorized: z.literal(false),
  authorityCreated: z.literal(false),
  signatureRequested: z.literal(false),
  transactionSubmitted: z.literal(false),
  runtimeHashAloneSufficient: z.literal(false),
  reviewerAuthenticationRequiredUpstream: z.literal(true),
  scope: z.literal("reviewed_write_target_attestation_only")
});

const effectiveTargetSchema = z.strictObject({
  chainId: z.literal(97),
  address: addressSchema,
  runtimeCodeHash: contractRuntimeCodeHashSchema,
  effectiveImplementationAddress: addressSchema,
  effectiveImplementationRuntimeCodeHash: contractRuntimeCodeHashSchema,
  proxyKind: z.enum(["none", "eip1967_transparent", "eip1967_beacon"]),
  canonicalBlockNumber: canonicalUint256Schema,
  canonicalBlockHash: nonZeroBytes32Schema,
  reviewId: nonZeroBytes32Schema
});

const blockedResultSchema = z.strictObject({
  status: z.literal("blocked"),
  attestation: z.null(),
  effectiveTarget: z.null(),
  boundary: boundarySchema,
  issues: z.array(issueSchema).min(1).max(MAX_ISSUES)
});

const readyResultSchema = z.strictObject({
  status: z.literal("ready"),
  attestation: writeTargetAttestationSchema,
  effectiveTarget: effectiveTargetSchema,
  boundary: boundarySchema,
  issues: z.tuple([])
});

export const writeTargetAttestationResultSchema = z.union([blockedResultSchema, readyResultSchema]);

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export type WriteTargetAttestationResult = DeepReadonly<
  z.infer<typeof writeTargetAttestationResultSchema>
>;

export interface AssessWriteTargetAttestationOptions {
  readonly asOf: () => Date;
  readonly expectedReviewId: unknown;
}

type MutableIssueList = WriteTargetAttestationIssue[];

const BLOCKED_BOUNDARY = Object.freeze({
  sourceAndProxyAttested: false,
  executionAuthorized: false as const,
  authorityCreated: false as const,
  signatureRequested: false as const,
  transactionSubmitted: false as const,
  runtimeHashAloneSufficient: false as const,
  reviewerAuthenticationRequiredUpstream: true as const,
  scope: "reviewed_write_target_attestation_only" as const
});

const READY_BOUNDARY = Object.freeze({
  ...BLOCKED_BOUNDARY,
  sourceAndProxyAttested: true
});

function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<Value>;
}

function addIssue(
  issues: MutableIssueList,
  code: WriteTargetAttestationIssueCode,
  path: string,
  message: string,
  cause: string | null = null
): void {
  if (
    issues.length >= MAX_ISSUES ||
    issues.some((entry) => entry.code === code && entry.path === path)
  )
    return;
  issues.push(
    issueSchema.parse({
      code,
      path: path.replace(/[^A-Za-z0-9_.\[\]-]/g, "_").slice(0, 240) || "unknown",
      message: message.slice(0, 320),
      cause: cause === null ? null : cause.replace(/[^A-Z0-9_]/g, "_").slice(0, 120) || "UNKNOWN"
    })
  );
}

function blocked(issues: MutableIssueList): WriteTargetAttestationResult {
  if (issues.length === 0) {
    addIssue(
      issues,
      "INTERNAL_VALIDATION_ERROR",
      "attestation",
      "The attestation was blocked without a specific validation issue."
    );
  }
  return deepFreeze(
    blockedResultSchema.parse({
      status: "blocked",
      attestation: null,
      effectiveTarget: null,
      boundary: BLOCKED_BOUNDARY,
      issues
    })
  );
}

type SnapshotFailureReason =
  | "ACCESSOR"
  | "CYCLE"
  | "DEPTH_LIMIT"
  | "HIDDEN_PROPERTY"
  | "INVALID_ARRAY"
  | "NODE_LIMIT"
  | "PROTOTYPE"
  | "SNAPSHOT_ERROR"
  | "SYMBOL"
  | "UNSUPPORTED_VALUE";

type ExactSnapshotResult =
  | Readonly<{ success: true; data: unknown }>
  | Readonly<{ success: false; reason: SnapshotFailureReason }>;

interface ExactSnapshotState {
  readonly ancestors: WeakSet<object>;
  nodes: number;
}

function snapshotFailure(reason: SnapshotFailureReason): ExactSnapshotResult {
  return { success: false, reason };
}

/** Copies an untrusted JSON data graph using descriptors without invoking property accessors. */
function snapshotExactJson(
  value: unknown,
  depth = 0,
  state: ExactSnapshotState = { ancestors: new WeakSet<object>(), nodes: 0 }
): ExactSnapshotResult {
  try {
    if (value === null) return { success: true, data: null };
    const valueType = typeof value;
    if (valueType === "string" || valueType === "boolean") {
      return { success: true, data: value };
    }
    if (valueType === "number") {
      return Number.isFinite(value)
        ? { success: true, data: value }
        : snapshotFailure("UNSUPPORTED_VALUE");
    }
    if (valueType === "symbol") return snapshotFailure("SYMBOL");
    if (valueType !== "object") return snapshotFailure("UNSUPPORTED_VALUE");
    if (depth > MAX_SNAPSHOT_DEPTH) return snapshotFailure("DEPTH_LIMIT");

    const objectValue = value as object;
    state.nodes += 1;
    if (state.nodes > MAX_SNAPSHOT_NODES) return snapshotFailure("NODE_LIMIT");
    if (state.ancestors.has(objectValue)) return snapshotFailure("CYCLE");

    const isArray = Array.isArray(objectValue);
    const prototype = Object.getPrototypeOf(objectValue);
    if (
      (isArray && prototype !== Array.prototype) ||
      (!isArray && prototype !== Object.prototype && prototype !== null)
    ) {
      return snapshotFailure("PROTOTYPE");
    }

    const ownKeys = Reflect.ownKeys(objectValue);
    if (ownKeys.some((key) => typeof key === "symbol")) return snapshotFailure("SYMBOL");
    const stringKeys = ownKeys as string[];
    const descriptors = Object.getOwnPropertyDescriptors(objectValue);
    state.ancestors.add(objectValue);
    try {
      if (isArray) {
        const lengthDescriptor = descriptors.length;
        if (
          lengthDescriptor === undefined ||
          !("value" in lengthDescriptor) ||
          lengthDescriptor.enumerable !== false ||
          !Number.isSafeInteger(lengthDescriptor.value) ||
          lengthDescriptor.value < 0 ||
          lengthDescriptor.value > MAX_SNAPSHOT_NODES
        )
          return snapshotFailure("INVALID_ARRAY");
        const length = lengthDescriptor.value as number;
        const keys = stringKeys.filter((key) => key !== "length");
        if (keys.length !== length) return snapshotFailure("INVALID_ARRAY");
        const output = new Array<unknown>(length);
        for (const key of keys) {
          if (!/^(0|[1-9][0-9]*)$/.test(key)) return snapshotFailure("INVALID_ARRAY");
          const index = Number(key);
          if (!Number.isSafeInteger(index) || index < 0 || index >= length)
            return snapshotFailure("INVALID_ARRAY");
          const descriptor = descriptors[key];
          if (
            descriptor === undefined ||
            descriptor.enumerable !== true ||
            !("value" in descriptor) ||
            descriptor.get !== undefined ||
            descriptor.set !== undefined
          )
            return snapshotFailure(
              descriptor?.enumerable === false ? "HIDDEN_PROPERTY" : "ACCESSOR"
            );
          const child = snapshotExactJson(descriptor.value, depth + 1, state);
          if (!child.success) return child;
          output[index] = child.data;
        }
        return { success: true, data: output };
      }

      const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of stringKeys.sort()) {
        const descriptor = descriptors[key];
        if (descriptor === undefined || descriptor.enumerable !== true)
          return snapshotFailure("HIDDEN_PROPERTY");
        if (
          !("value" in descriptor) ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined
        )
          return snapshotFailure("ACCESSOR");
        const child = snapshotExactJson(descriptor.value, depth + 1, state);
        if (!child.success) return child;
        Object.defineProperty(output, key, {
          configurable: true,
          enumerable: true,
          value: child.data,
          writable: true
        });
      }
      return { success: true, data: output };
    } finally {
      state.ancestors.delete(objectValue);
    }
  } catch {
    return snapshotFailure("SNAPSHOT_ERROR");
  }
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

/** Derives the content address for a trusted, structurally valid review manifest. */
export function deriveWriteTargetReviewId(manifest: unknown): Hex {
  const snapshot = snapshotExactJson(manifest);
  if (!snapshot.success)
    throw new TypeError(`Write-target review snapshot rejected: ${snapshot.reason}`);
  const parsed = writeTargetAttestationManifestSchema.parse(snapshot.data);
  return keccak256(
    stringToHex(
      `${WRITE_TARGET_REVIEW_ID_DOMAIN}\u0000${JSON.stringify(recursivelySortJsonKeys(parsed))}`
    )
  );
}

function readOptions(
  value: unknown
): Readonly<{ asOf: () => unknown; expectedReviewId: string }> | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) return null;
    const sortedKeys = (keys as string[]).sort();
    if (sortedKeys.length !== 2 || sortedKeys[0] !== "asOf" || sortedKeys[1] !== "expectedReviewId")
      return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const asOfDescriptor = descriptors.asOf;
    const expectedDescriptor = descriptors.expectedReviewId;
    if (
      asOfDescriptor === undefined ||
      expectedDescriptor === undefined ||
      asOfDescriptor.enumerable !== true ||
      expectedDescriptor.enumerable !== true ||
      !("value" in asOfDescriptor) ||
      !("value" in expectedDescriptor) ||
      typeof asOfDescriptor.value !== "function"
    )
      return null;
    const expected = nonZeroBytes32Schema.safeParse(expectedDescriptor.value);
    if (!expected.success) return null;
    const asOfFunction: (...arguments_: readonly unknown[]) => unknown = asOfDescriptor.value;
    return {
      asOf: () => Reflect.apply(asOfFunction, undefined, []),
      expectedReviewId: expected.data
    };
  } catch {
    return null;
  }
}

function captureAsOf(asOf: () => unknown): Date | null {
  try {
    const value = asOf();
    if (!(value instanceof Date) || Object.getPrototypeOf(value) !== Date.prototype) return null;
    const milliseconds = Date.prototype.getTime.call(value);
    if (!Number.isFinite(milliseconds)) return null;
    return new Date(milliseconds);
  } catch {
    return null;
  }
}

function sameBlock(
  value: Readonly<{ blockNumber: string; blockHash: string }>,
  canonical: Readonly<{ number: string; hash: string }>
): boolean {
  return value.blockNumber === canonical.number && value.blockHash === canonical.hash;
}

function slotValueForAddress(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2)}`;
}

function validateSourceReview(
  reviewed: z.infer<typeof reviewedContractSchema>,
  canonical: WriteTargetAttestation["canonicalBlock"],
  asOfMs: number,
  attestedMs: number,
  issues: MutableIssueList,
  path: string
): void {
  const { code, sourceReview } = reviewed;
  if (!sameBlock(code, canonical)) {
    addIssue(
      issues,
      "BLOCK_RELATION_INVALID",
      `${path}.code`,
      "Reviewed contract code must be observed at the exact canonical block."
    );
  }
  const hashes = [
    sourceReview.runtimeCodeHash,
    sourceReview.compiler.outputRuntimeCodeHash,
    sourceReview.verification.runtimeCodeHash,
    sourceReview.independentReview.runtimeCodeHash
  ];
  if (hashes.some((hash) => hash !== code.runtimeCodeHash)) {
    addIssue(
      issues,
      "SOURCE_HASH_MISMATCH",
      `${path}.sourceReview`,
      "Source, compiler output, exact-match evidence, and independent review must bind the observed runtime-code hash."
    );
  }

  const observedMs = Date.parse(code.observedAt);
  const verifiedMs = Date.parse(sourceReview.verification.verifiedAt);
  const reviewedMs = Date.parse(sourceReview.independentReview.reviewedAt);
  if (observedMs < Date.parse(canonical.timestamp) || observedMs > attestedMs) {
    addIssue(
      issues,
      "OBSERVATION_TIME_INVALID",
      `${path}.code.observedAt`,
      "Reviewed code observation must fall between the canonical block timestamp and attestation time."
    );
  }
  if (observedMs > asOfMs || verifiedMs > asOfMs || reviewedMs > asOfMs) {
    addIssue(
      issues,
      observedMs > asOfMs ? "OBSERVATION_FROM_FUTURE" : "SOURCE_TIME_INVALID",
      path,
      "Code observation, source verification, and independent review cannot postdate the injected as-of clock."
    );
  }
  if (verifiedMs > attestedMs || reviewedMs > attestedMs) {
    addIssue(
      issues,
      "SOURCE_TIME_INVALID",
      `${path}.sourceReview`,
      "Source verification and independent review must exist by the attestation time."
    );
  }
  if (verifiedMs > reviewedMs) {
    addIssue(
      issues,
      "SOURCE_TIME_INVALID",
      `${path}.sourceReview.independentReview.reviewedAt`,
      "Independent review cannot predate the source-verification evidence it reviewed."
    );
  }
}

function validateSelectorScopedNonProxyAssessment(
  proxy: z.infer<typeof selectorScopedNonProxyAssessmentSchema>,
  target: z.infer<typeof reviewedContractSchema>,
  asOfMs: number,
  attestedMs: number,
  issues: MutableIssueList
): void {
  const assessment = proxy.selectorCallPathAssessment;
  const sourceReview = target.sourceReview;
  const expectedBindings = {
    runtimeCodeHash: target.code.runtimeCodeHash,
    sourceTreeSha256: sourceReview.source.sourceTreeSha256,
    compilerOutputArtifactSha256: sourceReview.compiler.outputArtifactSha256,
    writeScopeSha256: sourceReview.independentReview.writeScopeSha256
  } as const;

  if (
    assessment.runtimeCodeHash !== expectedBindings.runtimeCodeHash ||
    assessment.sourceTreeSha256 !== expectedBindings.sourceTreeSha256 ||
    assessment.compilerOutputArtifactSha256 !== expectedBindings.compilerOutputArtifactSha256 ||
    assessment.writeScopeSha256 !== expectedBindings.writeScopeSha256 ||
    assessment.delegatecallBoundary.runtimeCodeHash !== expectedBindings.runtimeCodeHash ||
    assessment.delegatecallBoundary.compilerOutputArtifactSha256 !==
      expectedBindings.compilerOutputArtifactSha256
  ) {
    addIssue(
      issues,
      "SELECTOR_PATH_BINDING_MISMATCH",
      "attestation.proxyAssessment.selectorCallPathAssessment",
      "Selector-path and delegatecall-boundary evidence must bind the reviewed runtime, source tree, compiler artifact, and exact write scope."
    );
  }

  for (const [index, call] of assessment.allowedDirectCalls.entries()) {
    if (
      call.bindings.runtimeCodeHash !== expectedBindings.runtimeCodeHash ||
      call.bindings.sourceTreeSha256 !== expectedBindings.sourceTreeSha256 ||
      call.bindings.compilerOutputArtifactSha256 !==
        expectedBindings.compilerOutputArtifactSha256 ||
      call.bindings.writeScopeSha256 !== expectedBindings.writeScopeSha256
    ) {
      addIssue(
        issues,
        "SELECTOR_PATH_BINDING_MISMATCH",
        `attestation.proxyAssessment.selectorCallPathAssessment.allowedDirectCalls[${index}].bindings`,
        "Each allowed direct selector must independently bind the reviewed runtime, source tree, compiler artifact, and exact write scope."
      );
    }
  }

  const artifactDigests = assessment.allowedDirectCalls.map((call) => call.analysisArtifact.sha256);
  const artifactLocators = assessment.allowedDirectCalls.map(
    (call) => `${call.analysisArtifact.locator.scheme}:${call.analysisArtifact.locator.uri}`
  );
  const sourcePathDigests = assessment.allowedDirectCalls.map((call) => call.sourcePathSha256);
  const bytecodePathDigests = assessment.allowedDirectCalls.map((call) => call.bytecodePathSha256);
  if (
    new Set(artifactDigests).size !== assessment.allowedDirectCalls.length ||
    new Set(artifactLocators).size !== assessment.allowedDirectCalls.length ||
    new Set(sourcePathDigests).size !== assessment.allowedDirectCalls.length ||
    new Set(bytecodePathDigests).size !== assessment.allowedDirectCalls.length
  ) {
    addIssue(
      issues,
      "SELECTOR_PATH_BINDING_MISMATCH",
      "attestation.proxyAssessment.selectorCallPathAssessment.allowedDirectCalls",
      "Each allowed selector requires distinct content-addressed source, bytecode, and analysis-path evidence."
    );
  }

  const earliestAnalysisMs = Date.parse(sourceReview.verification.verifiedAt);
  const latestAnalysisMs = Math.min(
    Date.parse(sourceReview.independentReview.reviewedAt),
    attestedMs,
    asOfMs
  );
  const analysisTimes = [
    ...assessment.allowedDirectCalls.map((call) => Date.parse(call.analyzedAt)),
    Date.parse(assessment.delegatecallBoundary.reviewedAt)
  ];
  if (
    analysisTimes.some(
      (analysisMs) => analysisMs < earliestAnalysisMs || analysisMs > latestAnalysisMs
    )
  ) {
    addIssue(
      issues,
      "SELECTOR_PATH_TIME_INVALID",
      "attestation.proxyAssessment.selectorCallPathAssessment",
      "Selector-path analysis must follow exact source verification and precede the authenticated independent review, attestation, and as-of clock."
    );
  }
}

function validateControlAccount(
  account: z.infer<typeof pinnedControlAccountSchema>,
  canonical: WriteTargetAttestation["canonicalBlock"],
  asOfMs: number,
  attestedMs: number,
  issues: MutableIssueList,
  path: string
): void {
  if (!sameBlock(account.code, canonical)) {
    addIssue(
      issues,
      "PROXY_BLOCK_MISMATCH",
      `${path}.code`,
      "The proxy control account code identity must be pinned at the canonical block."
    );
  }
  if (
    Date.parse(account.code.observedAt) < Date.parse(canonical.timestamp) ||
    Date.parse(account.code.observedAt) > attestedMs ||
    Date.parse(account.code.observedAt) > asOfMs
  ) {
    addIssue(
      issues,
      "OBSERVATION_TIME_INVALID",
      `${path}.code.observedAt`,
      "Control-account observation must fall between the canonical block timestamp and attestation time."
    );
  }
  if (account.accountKind === "contract") {
    validateSourceReview(account, canonical, asOfMs, attestedMs, issues, path);
  }
}

function validateProxySlots(
  slots: z.infer<typeof transparentProxyAssessmentSchema>["slots"],
  canonical: WriteTargetAttestation["canonicalBlock"],
  issues: MutableIssueList
): void {
  const expectedSlots = {
    implementation: EIP1967_IMPLEMENTATION_SLOT,
    admin: EIP1967_ADMIN_SLOT,
    beacon: EIP1967_BEACON_SLOT
  } as const;
  for (const key of ["implementation", "admin", "beacon"] as const) {
    if (!sameBlock(slots[key], canonical)) {
      addIssue(
        issues,
        "PROXY_BLOCK_MISMATCH",
        `attestation.proxyAssessment.slots.${key}`,
        "Every proxy slot must be read at the exact canonical block."
      );
    }
    if (slots[key].slot !== expectedSlots[key]) {
      addIssue(
        issues,
        "PROXY_SLOT_MISMATCH",
        `attestation.proxyAssessment.slots.${key}.slot`,
        "Proxy storage evidence must use the exact standard EIP-1967 slot."
      );
    }
  }
}

type ZodIssue = z.ZodError["issues"][number];

function flattenSchemaIssue(
  entry: ZodIssue,
  parentPath: readonly PropertyKey[] = []
): readonly ZodIssue[] {
  const path = [...parentPath, ...entry.path];
  if (entry.code !== "invalid_union" || entry.errors.length === 0) return [{ ...entry, path }];
  return entry.errors.flatMap((branch) =>
    branch.flatMap((child) => flattenSchemaIssue(child, path))
  );
}

function addSchemaIssues(error: z.ZodError, issues: MutableIssueList): void {
  const entries = error.issues.flatMap((entry) => flattenSchemaIssue(entry));
  for (const entry of entries.slice(0, MAX_ISSUES)) {
    const path = entry.path.length > 0 ? `attestation.${entry.path.join(".")}` : "attestation";
    let code: WriteTargetAttestationIssueCode = "ATTESTATION_SCHEMA_INVALID";
    if (path.includes("locator") || path.endsWith("uri")) code = "LOCATOR_INVALID";
    else if (
      path.includes("selectorCallPathAssessment") ||
      path.includes("allowedDirectCalls") ||
      path.includes("deniedMulticalls")
    )
      code = "SELECTOR_PATH_ASSESSMENT_INVALID";
    else if (path.includes("sourceReview") || path.includes("compiler"))
      code = "SOURCE_EVIDENCE_INVALID";
    else if (path.includes("proxyAssessment")) code = "PROXY_ASSESSMENT_INVALID";
    addIssue(
      issues,
      code,
      path,
      "Write-target attestation failed exact schema validation.",
      entry.code
    );
  }
}

/**
 * Validates a pre-reviewed write target without reading a chain or authorizing a transaction.
 * The expected review ID is an injected trust root and must come from a server-held allowlist.
 */
export function assessWriteTargetAttestation(
  input: unknown,
  rawOptions: unknown
): WriteTargetAttestationResult {
  const issues: MutableIssueList = [];
  const options = readOptions(rawOptions);
  if (options === null) {
    addIssue(
      issues,
      "OPTIONS_INVALID",
      "options",
      "Options must contain only a data-valued expectedReviewId and an injected asOf clock."
    );
    return blocked(issues);
  }
  const asOf = captureAsOf(options.asOf);
  if (asOf === null) {
    addIssue(
      issues,
      "CLOCK_INVALID",
      "options.asOf",
      "The injected as-of clock must return a valid ordinary Date."
    );
    return blocked(issues);
  }

  const snapshot = snapshotExactJson(input);
  if (!snapshot.success) {
    addIssue(
      issues,
      "INPUT_UNSAFE",
      "attestation",
      "Attestation must be an exact, finite JSON data graph with no accessors, symbols, hidden fields, cycles, or custom prototypes.",
      snapshot.reason
    );
    return blocked(issues);
  }
  const parsed = writeTargetAttestationSchema.safeParse(snapshot.data);
  if (!parsed.success) {
    addSchemaIssues(parsed.error, issues);
    return blocked(issues);
  }
  const attestation = parsed.data;
  const { reviewId, ...manifest } = attestation;
  let derivedReviewId: Hex;
  try {
    derivedReviewId = deriveWriteTargetReviewId(manifest);
  } catch {
    addIssue(
      issues,
      "INTERNAL_VALIDATION_ERROR",
      "attestation.reviewId",
      "Unable to derive the write-target review content address."
    );
    return blocked(issues);
  }
  if (reviewId !== derivedReviewId) {
    addIssue(
      issues,
      "REVIEW_ID_MISMATCH",
      "attestation.reviewId",
      "Review ID does not match the complete canonical attestation manifest."
    );
  }
  if (reviewId !== options.expectedReviewId) {
    addIssue(
      issues,
      "REVIEW_NOT_TRUSTED",
      "attestation.reviewId",
      "Review ID is not the server-held expected review for this write target."
    );
  }

  const asOfMs = asOf.getTime();
  const blockMs = Date.parse(attestation.canonicalBlock.timestamp);
  const attestedMs = Date.parse(attestation.attestedAt);
  if (blockMs > asOfMs) {
    addIssue(
      issues,
      "BLOCK_FROM_FUTURE",
      "attestation.canonicalBlock.timestamp",
      "Canonical block timestamp cannot postdate the injected as-of clock."
    );
  }
  if (asOfMs - blockMs > WRITE_TARGET_MAX_BLOCK_AGE_SECONDS * 1_000) {
    addIssue(
      issues,
      "BLOCK_STALE",
      "attestation.canonicalBlock.timestamp",
      `Canonical block is older than ${WRITE_TARGET_MAX_BLOCK_AGE_SECONDS} seconds.`
    );
  }
  if (attestedMs < blockMs || attestedMs > asOfMs) {
    addIssue(
      issues,
      "OBSERVATION_TIME_INVALID",
      "attestation.attestedAt",
      "Attestation time must be at or after the canonical block and at or before the injected as-of clock."
    );
  }
  if (
    Date.parse(attestation.target.code.observedAt) < blockMs ||
    Date.parse(attestation.target.code.observedAt) > attestedMs
  ) {
    addIssue(
      issues,
      "OBSERVATION_TIME_INVALID",
      "attestation.target.code.observedAt",
      "Target code observation must fall between the canonical block timestamp and attestation time."
    );
  }
  validateSourceReview(
    attestation.target,
    attestation.canonicalBlock,
    asOfMs,
    attestedMs,
    issues,
    "attestation.target"
  );

  const proxy = attestation.proxyAssessment;
  let proxyKind: "none" | "eip1967_transparent" | "eip1967_beacon" = "none";
  let implementation = attestation.target.code;

  if (proxy.kind === "blocked") {
    addIssue(
      issues,
      "PROXY_ASSESSMENT_BLOCKED",
      "attestation.proxyAssessment.classification",
      "Unknown, custom, unrecognized, UUPS-control-ambiguous, or delegatecall-ambiguous targets cannot become write-ready."
    );
  } else if (proxy.kind === "non_proxy") {
    if (
      !sameBlock(proxy, attestation.canonicalBlock) ||
      proxy.targetAddress !== attestation.target.code.address ||
      proxy.runtimeCodeHash !== attestation.target.code.runtimeCodeHash
    ) {
      addIssue(
        issues,
        "NON_PROXY_BINDING_MISMATCH",
        "attestation.proxyAssessment",
        "Non-proxy evidence must bind the target runtime hash and exact canonical block."
      );
    }
    if (Date.parse(proxy.observedAt) < blockMs || Date.parse(proxy.observedAt) > attestedMs) {
      addIssue(
        issues,
        "PROXY_TIME_INVALID",
        "attestation.proxyAssessment.observedAt",
        "Non-proxy assessment observation must fall inside the canonical evidence window."
      );
    }
    if (proxy.decision === "independently_reviewed_non_proxy_selector_scoped") {
      validateSelectorScopedNonProxyAssessment(
        proxy,
        attestation.target,
        asOfMs,
        attestedMs,
        issues
      );
    }
  } else {
    proxyKind = proxy.standard;
    implementation = proxy.implementation.code;
    if (
      !sameBlock(proxy, attestation.canonicalBlock) ||
      proxy.proxyAddress !== attestation.target.code.address
    ) {
      addIssue(
        issues,
        "PROXY_BLOCK_MISMATCH",
        "attestation.proxyAssessment",
        "Proxy assessment must be pinned at the exact canonical block."
      );
    }
    if (Date.parse(proxy.observedAt) < blockMs || Date.parse(proxy.observedAt) > attestedMs) {
      addIssue(
        issues,
        "PROXY_TIME_INVALID",
        "attestation.proxyAssessment.observedAt",
        "Proxy assessment observation must fall inside the canonical evidence window."
      );
    }
    if (Date.parse(proxy.evidence.reviewedAt) > attestedMs) {
      addIssue(
        issues,
        "PROXY_TIME_INVALID",
        "attestation.proxyAssessment.evidence.reviewedAt",
        "Proxy-pattern and control-path review must not postdate the attestation."
      );
    }
    validateProxySlots(proxy.slots, attestation.canonicalBlock, issues);
    validateSourceReview(
      proxy.implementation,
      attestation.canonicalBlock,
      asOfMs,
      attestedMs,
      issues,
      "attestation.proxyAssessment.implementation"
    );
    if (
      proxy.implementation.code.address === attestation.target.code.address ||
      proxy.implementation.code.runtimeCodeHash === attestation.target.code.runtimeCodeHash
    ) {
      addIssue(
        issues,
        "PROXY_COMPONENT_MISMATCH",
        "attestation.proxyAssessment.implementation",
        "Proxy and effective implementation must have distinct addresses and reviewed runtime identities."
      );
    }

    if (proxy.standard === "eip1967_transparent") {
      validateControlAccount(
        proxy.admin,
        attestation.canonicalBlock,
        asOfMs,
        attestedMs,
        issues,
        "attestation.proxyAssessment.admin"
      );
      if (
        proxy.slots.implementation.value !==
          slotValueForAddress(proxy.implementation.code.address) ||
        proxy.slots.admin.value !== slotValueForAddress(proxy.admin.code.address) ||
        proxy.slots.beacon.value !== ZERO_BYTES32
      ) {
        addIssue(
          issues,
          "PROXY_SLOT_MISMATCH",
          "attestation.proxyAssessment.slots",
          "Transparent proxy slots must bind the exact implementation and admin addresses and an empty beacon slot."
        );
      }
      if (
        proxy.admin.code.address === attestation.target.code.address ||
        proxy.admin.code.address === proxy.implementation.code.address
      ) {
        addIssue(
          issues,
          "PROXY_COMPONENT_MISMATCH",
          "attestation.proxyAssessment.admin",
          "Proxy, implementation, and admin addresses must be distinct."
        );
      }
    } else {
      validateSourceReview(
        proxy.beacon,
        attestation.canonicalBlock,
        asOfMs,
        attestedMs,
        issues,
        "attestation.proxyAssessment.beacon"
      );
      validateControlAccount(
        proxy.beaconUpgradeAuthority.authority,
        attestation.canonicalBlock,
        asOfMs,
        attestedMs,
        issues,
        "attestation.proxyAssessment.beaconUpgradeAuthority.authority"
      );
      if (
        proxy.slots.implementation.value !== ZERO_BYTES32 ||
        proxy.slots.admin.value !== ZERO_BYTES32 ||
        proxy.slots.beacon.value !== slotValueForAddress(proxy.beacon.code.address)
      ) {
        addIssue(
          issues,
          "PROXY_SLOT_MISMATCH",
          "attestation.proxyAssessment.slots",
          "Beacon proxy slots must bind an empty implementation/admin slot and the exact beacon address."
        );
      }
      if (
        !sameBlock(proxy.beaconImplementationRead, attestation.canonicalBlock) ||
        !sameBlock(proxy.beaconUpgradeAuthority, attestation.canonicalBlock) ||
        proxy.beaconImplementationRead.beaconAddress !== proxy.beacon.code.address ||
        proxy.beaconImplementationRead.returnedImplementationAddress !==
          proxy.implementation.code.address ||
        proxy.beaconUpgradeAuthority.beaconAddress !== proxy.beacon.code.address ||
        proxy.beaconUpgradeAuthority.authorityAddress !==
          proxy.beaconUpgradeAuthority.authority.code.address
      ) {
        addIssue(
          issues,
          "PROXY_COMPONENT_MISMATCH",
          "attestation.proxyAssessment.beacon",
          "Beacon, effective implementation, upgrade authority, and same-block call evidence must agree exactly."
        );
      }
      const addresses = new Set([
        attestation.target.code.address,
        proxy.beacon.code.address,
        proxy.implementation.code.address,
        proxy.beaconUpgradeAuthority.authority.code.address
      ]);
      if (addresses.size !== 4) {
        addIssue(
          issues,
          "PROXY_COMPONENT_MISMATCH",
          "attestation.proxyAssessment",
          "Proxy, beacon, implementation, and beacon authority addresses must be distinct."
        );
      }
    }
  }

  if (issues.length > 0) return blocked(issues);

  return deepFreeze(
    readyResultSchema.parse({
      status: "ready",
      attestation,
      effectiveTarget: {
        chainId: 97,
        address: attestation.target.code.address,
        runtimeCodeHash: attestation.target.code.runtimeCodeHash,
        effectiveImplementationAddress: implementation.address,
        effectiveImplementationRuntimeCodeHash: implementation.runtimeCodeHash,
        proxyKind,
        canonicalBlockNumber: attestation.canonicalBlock.number,
        canonicalBlockHash: attestation.canonicalBlock.hash,
        reviewId: attestation.reviewId
      },
      boundary: READY_BOUNDARY,
      issues: []
    })
  );
}
