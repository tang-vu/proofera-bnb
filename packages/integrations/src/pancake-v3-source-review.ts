import {
  EIP1967_ADMIN_SLOT,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  writeTargetSourceReviewSchema,
  type WriteTargetSourceReview
} from "@proofera/domain";
import { sha256, stringToHex } from "viem";
import { z } from "zod";

export const PANCAKE_V3_SOURCE_REVIEW_SCHEMA_VERSION = 1 as const;
export const PANCAKE_V3_SOURCE_OBSERVATION_MAX_AGE_SECONDS = 120 as const;

const ZERO_BYTES32 = `0x${"00".repeat(32)}` as const;
const UINT256_MAX = (1n << 256n) - 1n;
const MAX_SNAPSHOT_DEPTH = 24;
const MAX_SNAPSHOT_NODES = 10_000;
const MAX_ISSUES = 32;

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

const SOURCE_COMMIT = "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57" as const;
const COMPARISON_COMMIT = "986847948755cba528324d41be19480731c36c2a" as const;
const MANAGER = "0x427bf5b37357632377ecbec9de3626c71a5396c1" as const;
const FACTORY = "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865" as const;
const DEPLOYER = "0x41ff9aa7e16b8b1a8a8dc4f0efacd93d02d071c9" as const;
const WRAPPED_NATIVE = "0xae13d989dac2f0debff460ac112a837c89baa7cd" as const;
const DESCRIPTOR = "0xb099b459887bc759dbf0293e12d3dfcd0c456cff" as const;
const DESCRIPTOR_IMPLEMENTATION = "0x769449da49d1eb1ff44a6b366be46960fdf46ad6" as const;
const DESCRIPTOR_ADMIN = "0x2eebb51c4ee4f6013ecc9e60dca1be1603c555ea" as const;

const MANAGER_RUNTIME_HASH =
  "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7" as const;
const FACTORY_RUNTIME_HASH =
  "0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c" as const;
const DEPLOYER_RUNTIME_HASH =
  "0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b" as const;
const RUNTIME_TEMPLATE_HASH =
  "0x91d390a2f85270716bdc52a7782842724fee537f3f8c4e282ce31b98eea7807b" as const;
const CREATION_CODE_HASH =
  "0x7d67b6a4c37bcd57f4daa2257fca238ed918cb6294d1e5e9b4eccf87e34e25e9" as const;
const NAME_HASH = "0xc8147ae4d95e1ae5d91d5822a926bbc8b3167bc4efcba3aad25887e8d7e1ada0" as const;
const VERSION_HASH = "0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6" as const;

const SOURCE_REPOSITORY = "https://github.com/pancakeswap/pancake-v3-contracts" as const;
const SOURCE_ARTIFACT_PATH =
  "projects/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json" as const;
const SOURCE_CONTRACT_PATH =
  "projects/v3-periphery/contracts/NonfungiblePositionManager.sol" as const;
const REPRODUCTION_EVIDENCE_PATH =
  "evidence/development/pancake-v3-source-reproduction-2026-08-11.json" as const;

const SOLC_VERSION = "0.7.6+commit.7338295f" as const;
const SOLC_BINARY_SHA256 =
  "0x9214e06741c5cb51a61d745697c905f37480c0c8da1d5ac69e3bacda0063dfa5" as const;
const SOLC_BINARY_KECCAK256 =
  "0x4fbd020496c3a9e02c1eeb825d23f4d83d9198c4e21fda19deccdb7e74435edf" as const;
const MANAGER_ARTIFACT_SHA256 =
  "0x9e5bca807e38e9e8acadd81c5dec6668f847a7e3397d91b3afed74b066cfbb2a" as const;
const MANAGER_BUILD_INFO_SHA256 =
  "0x72adeccd4f25257a89d95d3e0f1d8b9b0e5ab8400b2b828bab236b786ae2c7aa" as const;
const UNCLASSIFIED_ARCHIVE_SHA256 =
  "0xfa9d8efea22eec90b3cffce9f47a602af3b3aef539d2c2258faf3b87ff510fe8" as const;

const DIRECT_WRITE_SCOPE = {
  schemaVersion: 1,
  targetChainId: 97,
  targetAddress: MANAGER,
  allowedDirectSignatures: [
    "collect((uint256,address,uint128,uint128))",
    "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))",
    "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))",
    "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))"
  ],
  deniedDispatcherSignatures: [
    "multicall(bytes[])",
    "multicall(bytes32,bytes[])",
    "multicall(uint256,bytes[])"
  ],
  allUnlistedSelectorsDenied: true,
  nestedCalldataDenied: true
} as const;

export const PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256 = sha256(
  stringToHex(JSON.stringify(DIRECT_WRITE_SCOPE))
);

/**
 * Static, reproducible research. This record is deliberately not a trusted review completion:
 * the source-tree capture method, compiler-input/settings digests, hosted build proof, and
 * authenticated independent approval are not present in the retained report.
 */
export const PANCAKE_V3_TESTNET_SOURCE_RESEARCH = deepFreeze({
  schemaVersion: PANCAKE_V3_SOURCE_REVIEW_SCHEMA_VERSION,
  checkedAt: "2026-08-11T14:25:41.000Z",
  claimStatus: "static_research_incomplete_not_activation_ready" as const,
  repository: SOURCE_REPOSITORY,
  initialDeploymentAndSourceCommit: SOURCE_COMMIT,
  comparisonCommit: COMPARISON_COMMIT,
  comparisonFinding: "relevant_files_byte_identical" as const,
  sources: {
    deployment: `${SOURCE_REPOSITORY}/blob/${COMPARISON_COMMIT}/deployments/bscTestnet.json`,
    manager: `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/${SOURCE_CONTRACT_PATH}`,
    multicall: `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/projects/v3-periphery/contracts/base/Multicall.sol`,
    peripheryBuild: `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/projects/v3-periphery/hardhat.config.ts`,
    peripheryDeployment: `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/projects/v3-periphery/scripts/deploy2.ts`,
    factory: `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/projects/v3-core/contracts/PancakeV3Factory.sol`,
    deployer: `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/projects/v3-core/contracts/PancakeV3PoolDeployer.sol`,
    pool: `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/projects/v3-core/contracts/PancakeV3Pool.sol`,
    coreBuild: `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/projects/v3-core/hardhat.config.ts`,
    compilerReleaseList: "https://binaries.soliditylang.org/windows-amd64/list.json"
  },
  retainedEvidencePath: REPRODUCTION_EVIDENCE_PATH,
  unclassifiedSourceArchive: {
    sha256: UNCLASSIFIED_ARCHIVE_SHA256,
    format: null,
    locator: null,
    captureCommand: null,
    eligibleAsDomainSourceTreeDigest: false
  },
  compiler: {
    name: "solc" as const,
    version: SOLC_VERSION,
    binarySha256: SOLC_BINARY_SHA256,
    binaryKeccak256: SOLC_BINARY_KECCAK256,
    settings: {
      evmVersion: "istanbul" as const,
      viaIr: false,
      metadataBytecodeHash: "none" as const,
      optimizer: {
        managerRuns: 2_000,
        factoryRuns: 1_000_000,
        poolAndDeployerRuns: 400
      }
    },
    missingDomainDigests: ["compilerInputSha256", "compilerSettingsSha256"] as const
  },
  build: {
    managerArtifactSha256: MANAGER_ARTIFACT_SHA256,
    managerBuildInfoSha256: MANAGER_BUILD_INFO_SHA256,
    creationByteLength: 25_445,
    creationCodeKeccak256: CREATION_CODE_HASH,
    runtimeTemplateByteLength: 24_466,
    runtimeTemplateKeccak256: RUNTIME_TEMPLATE_HASH,
    immutableLinkedRuntimeByteLength: 24_466,
    immutableLinkedRuntimeKeccak256: MANAGER_RUNTIME_HASH
  },
  deployment: {
    chainId: 97,
    environment: "bsc-testnet" as const,
    manager: { address: MANAGER, runtimeByteLength: 24_466, runtimeCodeHash: MANAGER_RUNTIME_HASH },
    factory: { address: FACTORY, runtimeByteLength: 5_151, runtimeCodeHash: FACTORY_RUNTIME_HASH },
    deployer: {
      address: DEPLOYER,
      runtimeByteLength: 24_556,
      runtimeCodeHash: DEPLOYER_RUNTIME_HASH
    },
    constructorImmutables: {
      deployer: DEPLOYER,
      factory: FACTORY,
      wrappedNative: WRAPPED_NATIVE,
      tokenDescriptor: DESCRIPTOR
    },
    derivedDomainHashes: { nameHash: NAME_HASH, versionHash: VERSION_HASH }
  },
  canonicalHistoricalObservation: {
    blockNumber: "124471044",
    blockHash: "0x214d1b1b3f7c724d32812c6829034dff989ff7e61dc580e46c5134053fb5aca6",
    blockTimestamp: "2026-08-11T14:25:41.000Z",
    reusableAsFreshObservation: false
  },
  managerControlPath: {
    deploymentKind: "direct_non_upgradeable_contract" as const,
    eip1967SlotsAtHistoricalObservation: {
      implementation: ZERO_BYTES32,
      admin: ZERO_BYTES32,
      beacon: ZERO_BYTES32
    },
    minimalProxyPatternFound: false,
    upgradeSelectorFound: false,
    callcodeFound: false,
    selfdestructFound: false,
    delegatecall: {
      reachable: true,
      programCounter: 10_522,
      reviewedSourcePath:
        "projects/v3-periphery/contracts/base/Multicall.sol#multicall(bytes[])_self_delegatecall",
      implication: "deny_every_multicall_selector_and_all_unlisted_selectors" as const
    },
    compatibleWithDomainNoReachableDelegatecallAssessment: false
  },
  descriptorBoundary: {
    address: DESCRIPTOR,
    kind: "eip1967_proxy" as const,
    implementation: DESCRIPTOR_IMPLEMENTATION,
    admin: DESCRIPTOR_ADMIN,
    role: "token_uri_metadata_only" as const,
    metadataTrusted: false,
    eligibleAsManagerWriteTarget: false,
    implementationSourceReviewedForWrites: false
  },
  thirdPartyReadFixtureBoundary: {
    positionId: "36761",
    pool: {
      address: "0xe62112438bdc81d225bc35298d4829ac4fac8945",
      runtimeCodeHash: "0x9d143766c2b4fe625e47e468e615fcab0317131e4634b8c3993292de8a5fcffd",
      writeEligible: false
    },
    token0: {
      address: "0x3a4a356381d3061d5f29013e8e12acfed701dba6",
      reportedSymbol: "XYU",
      completeRuntimeCodeHashRetained: false,
      sourceProofComplete: false,
      writeEligible: false
    },
    token1: {
      address: "0xddf6c57e618f267c135f0c56da88091b95c54057",
      reportedSymbol: "TestUSDT",
      completeRuntimeCodeHashRetained: false,
      sourceProofComplete: false,
      writeEligible: false
    },
    prooferaControlsPosition: false,
    activationEligible: false
  },
  directWriteScope: DIRECT_WRITE_SCOPE,
  directWriteScopeSha256: PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256,
  missingBeforeSourceReviewCanBeEmitted: [
    "classified_reproducible_source_tree_digest",
    "compiler_input_sha256",
    "compiler_settings_sha256",
    "hosted_reproducible_build_evidence",
    "authenticated_independent_scope_review",
    "fresh_independent_exact_block_observation"
  ] as const
});

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hexadecimal value.")
  .transform((value) => value.toLowerCase())
  .refine((value) => value !== ZERO_BYTES32, "The zero bytes32 value is not allowed.");

const utcSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

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
  }, "Value exceeds uint256.")
  .refine((value) => value !== "0", "Block number must be positive.");

function safeHttps(value: string): boolean {
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

const httpsSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine(safeHttps, "Expected a credential-free HTTPS URL without a fragment.");

const evidenceReferenceSchema = z.strictObject({
  locator: z.strictObject({ scheme: z.literal("https"), uri: httpsSchema }),
  sha256: bytes32Schema
});

function normalizedAddress(expected: string) {
  return z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 20-byte EVM address.")
    .transform((value) => value.toLowerCase())
    .refine((value) => value === expected, `Expected ${expected}.`);
}

function normalizedHash(expected: string) {
  return z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hash.")
    .transform((value) => value.toLowerCase())
    .refine((value) => value === expected, `Expected ${expected}.`);
}

export const pancakeV3TrustedReviewCompletionSchema = z
  .strictObject({
    schemaVersion: z.literal(PANCAKE_V3_SOURCE_REVIEW_SCHEMA_VERSION),
    trustBoundary: z.literal("server_owned_authenticated_review_configuration"),
    sourceCommit: z.literal(SOURCE_COMMIT),
    comparisonCommit: z.literal(COMPARISON_COMMIT),
    sourceTree: z.strictObject({
      captureMethod: z.literal("git_archive_tar_from_verified_clean_checkout"),
      sha256: bytes32Schema,
      evidence: evidenceReferenceSchema
    }),
    compiler: z.strictObject({
      version: z.literal(SOLC_VERSION),
      binarySha256: z.literal(SOLC_BINARY_SHA256),
      binaryKeccak256: z.literal(SOLC_BINARY_KECCAK256),
      inputSha256: bytes32Schema,
      settingsSha256: bytes32Schema,
      managerArtifactSha256: z.literal(MANAGER_ARTIFACT_SHA256),
      managerBuildInfoSha256: z.literal(MANAGER_BUILD_INFO_SHA256),
      runtimeTemplateCodeHash: z.literal(RUNTIME_TEMPLATE_HASH),
      immutableLinkedRuntimeCodeHash: z.literal(MANAGER_RUNTIME_HASH),
      settings: z.strictObject({
        optimizer: z.strictObject({ enabled: z.literal(true), runs: z.literal(2_000) }),
        viaIr: z.literal(false),
        evmVersion: z.literal("istanbul"),
        metadataBytecodeHash: z.literal("none")
      })
    }),
    verification: z.strictObject({
      verifiedAt: utcSchema,
      evidence: evidenceReferenceSchema
    }),
    independentReview: z.strictObject({
      reviewerIdentity: z
        .string()
        .min(3)
        .max(160)
        .regex(/^[A-Za-z0-9._:@/+ -]+$/),
      reviewedAt: utcSchema,
      decision: z.literal("approved_only_for_the_frozen_direct_write_scope"),
      evidence: evidenceReferenceSchema
    }),
    controlPathReview: z.strictObject({
      reviewedAt: utcSchema,
      evidence: evidenceReferenceSchema,
      directWriteScopeSha256: z.literal(PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256),
      reachableSelfDelegatecallReviewed: z.literal(true),
      everyMulticallSelectorDenied: z.literal(true),
      allUnlistedSelectorsDenied: z.literal(true),
      domainNoReachableDelegatecallModelCompatible: z.literal(false)
    })
  })
  .superRefine((completion, context) => {
    const digests = [
      completion.sourceTree.sha256,
      completion.compiler.inputSha256,
      completion.compiler.settingsSha256
    ];
    if (new Set(digests).size !== digests.length) {
      context.addIssue({
        code: "custom",
        path: ["compiler"],
        message: "Source-tree, compiler-input, and compiler-settings digests must be distinct."
      });
    }
    if (
      completion.sourceTree.evidence.sha256 !== completion.verification.evidence.sha256 ||
      completion.sourceTree.evidence.locator.uri.toLowerCase() !==
        completion.verification.evidence.locator.uri.toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceTree", "evidence"],
        message:
          "The domain-retained reproducible-build evidence must also bind the classified source tree."
      });
    }
    if (
      completion.independentReview.evidence.sha256 !==
        completion.controlPathReview.evidence.sha256 ||
      completion.independentReview.evidence.locator.uri.toLowerCase() !==
        completion.controlPathReview.evidence.locator.uri.toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        path: ["controlPathReview", "evidence"],
        message:
          "The domain-retained independent-review evidence must also bind the control-path review."
      });
    }
  });

export type PancakeV3TrustedReviewCompletion = z.infer<
  typeof pancakeV3TrustedReviewCompletionSchema
>;

const eip1967SlotObservationSchema = (slot: string) =>
  z.strictObject({ slot: z.literal(slot), value: z.literal(ZERO_BYTES32) });

export const pancakeV3IndependentSourceObservationSchema = z.strictObject({
  schemaVersion: z.literal(PANCAKE_V3_SOURCE_REVIEW_SCHEMA_VERSION),
  source: z.literal("independent_exact_hash_runtime_storage_and_immutable_observer"),
  independence: z.literal("independent_from_source_build_and_security_reviewer"),
  chainId: z.literal(97),
  environment: z.literal("bsc-testnet"),
  method: z.literal("eip1898_canonical_block_hash_without_latest_or_number_fallback"),
  observer: z.strictObject({
    id: z
      .string()
      .min(3)
      .max(120)
      .regex(/^[A-Za-z0-9._:@/+ -]+$/),
    publicSourceUrl: httpsSchema,
    evidence: evidenceReferenceSchema
  }),
  block: z.strictObject({
    number: canonicalUint256Schema,
    hash: bytes32Schema,
    timestamp: utcSchema,
    requireCanonical: z.literal(true)
  }),
  observedAt: utcSchema,
  contracts: z.strictObject({
    manager: z.strictObject({
      address: normalizedAddress(MANAGER),
      runtimeByteLength: z.literal(24_466),
      runtimeCodeHash: normalizedHash(MANAGER_RUNTIME_HASH)
    }),
    factory: z.strictObject({
      address: normalizedAddress(FACTORY),
      runtimeByteLength: z.literal(5_151),
      runtimeCodeHash: normalizedHash(FACTORY_RUNTIME_HASH)
    }),
    deployer: z.strictObject({
      address: normalizedAddress(DEPLOYER),
      runtimeByteLength: z.literal(24_556),
      runtimeCodeHash: normalizedHash(DEPLOYER_RUNTIME_HASH)
    })
  }),
  managerImmutables: z.strictObject({
    deployer: normalizedAddress(DEPLOYER),
    factory: normalizedAddress(FACTORY),
    wrappedNative: normalizedAddress(WRAPPED_NATIVE),
    tokenDescriptor: normalizedAddress(DESCRIPTOR),
    nameHash: normalizedHash(NAME_HASH),
    versionHash: normalizedHash(VERSION_HASH)
  }),
  managerEip1967Slots: z.strictObject({
    implementation: eip1967SlotObservationSchema(EIP1967_IMPLEMENTATION_SLOT),
    admin: eip1967SlotObservationSchema(EIP1967_ADMIN_SLOT),
    beacon: eip1967SlotObservationSchema(EIP1967_BEACON_SLOT)
  }),
  latestTagUsed: z.literal(false),
  blockNumberFallbackUsed: z.literal(false)
});

export type PancakeV3IndependentSourceObservation = z.infer<
  typeof pancakeV3IndependentSourceObservationSchema
>;

export type PancakeV3SourceReviewIssueCode =
  | "INPUT_UNSAFE"
  | "OPTIONS_INVALID"
  | "CLOCK_INVALID"
  | "REVIEW_COMPLETION_INVALID"
  | "OBSERVATION_INVALID"
  | "BLOCK_FROM_FUTURE"
  | "BLOCK_STALE"
  | "OBSERVATION_TIME_INVALID"
  | "REVIEW_TIME_INVALID"
  | "EVIDENCE_NOT_INDEPENDENT"
  | "INTERNAL_VALIDATION_ERROR";

export interface PancakeV3SourceReviewIssue {
  readonly code: PancakeV3SourceReviewIssueCode;
  readonly path: string;
  readonly message: string;
}

const BLOCKED_BOUNDARY = Object.freeze({
  staticResearchComplete: true,
  trustedReviewCompletionPresent: false,
  freshIndependentObservationPresent: false,
  sourceReviewEmitted: false,
  domainWriteTargetAttestationReady: false,
  executionAuthorized: false,
  signatureRequested: false,
  transactionSubmitted: false,
  descriptorTrusted: false,
  thirdPartyPoolOrTokensWriteEligible: false,
  requiresServerOwnedAuthenticatedReviewConfiguration: true,
  managerHasReachableSelfDelegatecall: true,
  multicallMustRemainDenied: true,
  domainNoReachableDelegatecallModelCompatible: false
} as const);

const SOURCE_READY_BOUNDARY = Object.freeze({
  ...BLOCKED_BOUNDARY,
  trustedReviewCompletionPresent: true,
  freshIndependentObservationPresent: true,
  sourceReviewEmitted: true
} as const);

export interface PancakeV3ReviewedTargetSeed {
  readonly code: {
    readonly blockNumber: string;
    readonly blockHash: string;
    readonly address: string;
    readonly runtimeCodeHash: string;
    readonly observedAt: string;
  };
  readonly sourceReview: WriteTargetSourceReview;
}

export interface PancakeV3SourceReviewProvenance {
  readonly sourceRepository: typeof SOURCE_REPOSITORY;
  readonly sourceCommit: typeof SOURCE_COMMIT;
  readonly comparisonCommit: typeof COMPARISON_COMMIT;
  readonly retainedResearchEvidencePath: typeof REPRODUCTION_EVIDENCE_PATH;
  readonly reproducibleBuildEvidence: z.infer<typeof evidenceReferenceSchema>;
  readonly independentControlPathReviewEvidence: z.infer<typeof evidenceReferenceSchema>;
  readonly freshObservation: {
    readonly method: "eip1898_canonical_block_hash_without_latest_or_number_fallback";
    readonly observer: {
      readonly id: string;
      readonly publicSourceUrl: string;
      readonly evidence: z.infer<typeof evidenceReferenceSchema>;
    };
    readonly block: {
      readonly number: string;
      readonly hash: string;
      readonly timestamp: string;
      readonly requireCanonical: true;
    };
    readonly observedAt: string;
    readonly latestTagUsed: false;
    readonly blockNumberFallbackUsed: false;
  };
}

export type PancakeV3SourceReviewBuildResult =
  | Readonly<{
      status: "blocked";
      sourceReview: null;
      target: null;
      provenance: null;
      issues: readonly PancakeV3SourceReviewIssue[];
      boundary: typeof BLOCKED_BOUNDARY;
    }>
  | Readonly<{
      status: "source_review_ready_attestation_blocked";
      sourceReview: WriteTargetSourceReview;
      target: PancakeV3ReviewedTargetSeed;
      provenance: PancakeV3SourceReviewProvenance;
      issues: readonly never[];
      boundary: typeof SOURCE_READY_BOUNDARY;
    }>;

export interface BuildPancakeV3SourceReviewOptions {
  readonly now: () => Date;
  /** Server-owned review record. Never accept this object from an HTTP request. */
  readonly trustedReviewCompletion: unknown;
}

type SnapshotResult =
  Readonly<{ success: true; data: unknown }> | Readonly<{ success: false; reason: string }>;

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
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
        return { success: false, reason: "accessor_or_hidden_property" };
      }
    }

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
            return { success: false, reason: "sparse_array" };
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
        if (descriptor === undefined || !("value" in descriptor)) {
          return { success: false, reason: "accessor" };
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

function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<Value>;
}

function issue(
  code: PancakeV3SourceReviewIssueCode,
  path: string,
  message: string
): PancakeV3SourceReviewIssue {
  return { code, path, message };
}

function blocked(issues: readonly PancakeV3SourceReviewIssue[]): PancakeV3SourceReviewBuildResult {
  return deepFreeze({
    status: "blocked" as const,
    sourceReview: null,
    target: null,
    provenance: null,
    issues: [...issues].slice(0, MAX_ISSUES),
    boundary: BLOCKED_BOUNDARY
  });
}

function readOptions(
  value: unknown
): Readonly<{ now: () => unknown; trustedReviewCompletion: unknown }> | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) return null;
    const stringKeys = (keys as string[]).sort();
    if (
      stringKeys.length !== 2 ||
      stringKeys[0] !== "now" ||
      stringKeys[1] !== "trustedReviewCompletion"
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const now = descriptors.now;
    const completion = descriptors.trustedReviewCompletion;
    if (
      now === undefined ||
      completion === undefined ||
      !("value" in now) ||
      !("value" in completion) ||
      now.enumerable !== true ||
      completion.enumerable !== true ||
      typeof now.value !== "function"
    ) {
      return null;
    }
    const nowFunction: (...arguments_: readonly unknown[]) => unknown = now.value;
    return {
      now: () => Reflect.apply(nowFunction, undefined, []),
      trustedReviewCompletion: completion.value
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

function sameEvidence(
  first: z.infer<typeof evidenceReferenceSchema>,
  second: z.infer<typeof evidenceReferenceSchema>
): boolean {
  return (
    first.sha256 === second.sha256 ||
    first.locator.uri.toLowerCase() === second.locator.uri.toLowerCase()
  );
}

/**
 * Builds only the reviewed target/source component consumed by the domain attestation.
 * A full domain attestation is intentionally not emitted because its current non-proxy model
 * requires no reachable delegatecall, while this manager contains reviewed self-delegatecall
 * in Multicall. Multicall remains denied by the frozen direct-write scope.
 */
export function buildPancakeV3TestnetManagerSourceReview(
  observationInput: unknown,
  optionsInput: BuildPancakeV3SourceReviewOptions
): PancakeV3SourceReviewBuildResult {
  const options = readOptions(optionsInput);
  if (options === null) {
    return blocked([
      issue("OPTIONS_INVALID", "options", "Expected strict server-owned builder options.")
    ]);
  }

  const now = captureNow(options.now);
  if (now === null) {
    return blocked([issue("CLOCK_INVALID", "options.now", "The injected clock was invalid.")]);
  }

  const completionSnapshot = snapshotExactJson(options.trustedReviewCompletion);
  if (!completionSnapshot.success) {
    return blocked([
      issue(
        "INPUT_UNSAFE",
        "options.trustedReviewCompletion",
        `Trusted review completion was not inert JSON (${completionSnapshot.reason}).`
      )
    ]);
  }
  const completionResult = pancakeV3TrustedReviewCompletionSchema.safeParse(
    completionSnapshot.data
  );
  if (!completionResult.success) {
    return blocked([
      issue(
        "REVIEW_COMPLETION_INVALID",
        "options.trustedReviewCompletion",
        "The authenticated review completion is missing or does not match the frozen source record."
      )
    ]);
  }

  const observationSnapshot = snapshotExactJson(observationInput);
  if (!observationSnapshot.success) {
    return blocked([
      issue(
        "INPUT_UNSAFE",
        "observation",
        `Independent observation was not inert JSON (${observationSnapshot.reason}).`
      )
    ]);
  }
  const observationResult = pancakeV3IndependentSourceObservationSchema.safeParse(
    observationSnapshot.data
  );
  if (!observationResult.success) {
    return blocked([
      issue(
        "OBSERVATION_INVALID",
        "observation",
        "The independent exact-block observation drifted from the reviewed deployment."
      )
    ]);
  }

  const completion = completionResult.data;
  const observation = observationResult.data;
  const nowMs = now.getTime();
  const blockMs = Date.parse(observation.block.timestamp);
  const observedMs = Date.parse(observation.observedAt);
  const verifiedMs = Date.parse(completion.verification.verifiedAt);
  const reviewedMs = Date.parse(completion.independentReview.reviewedAt);
  const controlReviewedMs = Date.parse(completion.controlPathReview.reviewedAt);
  const issues: PancakeV3SourceReviewIssue[] = [];

  if (blockMs > nowMs) {
    issues.push(
      issue("BLOCK_FROM_FUTURE", "observation.block.timestamp", "Canonical block is in the future.")
    );
  } else if (nowMs - blockMs > PANCAKE_V3_SOURCE_OBSERVATION_MAX_AGE_SECONDS * 1_000) {
    issues.push(
      issue(
        "BLOCK_STALE",
        "observation.block.timestamp",
        `Canonical block is older than ${PANCAKE_V3_SOURCE_OBSERVATION_MAX_AGE_SECONDS} seconds.`
      )
    );
  }
  if (observedMs < blockMs || observedMs > nowMs) {
    issues.push(
      issue(
        "OBSERVATION_TIME_INVALID",
        "observation.observedAt",
        "Observation time must fall between the canonical block and the injected clock."
      )
    );
  }
  if (
    verifiedMs > reviewedMs ||
    verifiedMs > controlReviewedMs ||
    verifiedMs > nowMs ||
    reviewedMs > nowMs ||
    controlReviewedMs > nowMs ||
    observedMs < reviewedMs ||
    observedMs < controlReviewedMs
  ) {
    issues.push(
      issue(
        "REVIEW_TIME_INVALID",
        "options.trustedReviewCompletion",
        "Verification must precede both reviews, and the fresh observation must follow completed reviews."
      )
    );
  }

  const completionEvidence = [
    completion.sourceTree.evidence,
    completion.verification.evidence,
    completion.independentReview.evidence,
    completion.controlPathReview.evidence
  ];
  if (
    completionEvidence.some((evidence) => sameEvidence(evidence, observation.observer.evidence))
  ) {
    issues.push(
      issue(
        "EVIDENCE_NOT_INDEPENDENT",
        "observation.observer.evidence",
        "Fresh observation evidence must be distinct from source-build and review evidence."
      )
    );
  }

  if (issues.length > 0) return blocked(issues);

  const candidate: WriteTargetSourceReview = {
    runtimeCodeHash: MANAGER_RUNTIME_HASH,
    source: {
      repositoryUrl: SOURCE_REPOSITORY,
      commit: SOURCE_COMMIT,
      artifactPath: SOURCE_ARTIFACT_PATH,
      contractName: "NonfungiblePositionManager",
      sourceTreeSha256: completion.sourceTree.sha256
    },
    compiler: {
      name: "solc",
      version: SOLC_VERSION,
      compilerInputSha256: completion.compiler.inputSha256,
      compilerSettingsSha256: completion.compiler.settingsSha256,
      outputArtifactSha256: MANAGER_ARTIFACT_SHA256,
      outputRuntimeCodeHash: MANAGER_RUNTIME_HASH,
      optimizer: { enabled: true, runs: 2_000 },
      viaIr: false,
      evmVersion: "istanbul",
      metadataBytecodeHash: "none"
    },
    verification: {
      kind: "reproducible_build",
      claim: "runtime_bytecode_exact_match",
      runtimeCodeHash: MANAGER_RUNTIME_HASH,
      verifiedAt: completion.verification.verifiedAt,
      evidence: completion.verification.evidence
    },
    independentReview: {
      decision: "approved_for_exact_scoped_writes",
      methodology: "manual_source_build_and_control_path_review",
      reviewerIdentity: completion.independentReview.reviewerIdentity,
      reviewedAt: completion.independentReview.reviewedAt,
      runtimeCodeHash: MANAGER_RUNTIME_HASH,
      writeScopeSha256: PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256,
      evidence: completion.independentReview.evidence
    }
  };

  const parsedSourceReview = writeTargetSourceReviewSchema.safeParse(candidate);
  if (!parsedSourceReview.success) {
    return blocked([
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "sourceReview",
        "The assembled source review did not satisfy the domain schema."
      )
    ]);
  }

  const sourceReview = parsedSourceReview.data;
  const target: PancakeV3ReviewedTargetSeed = {
    code: {
      blockNumber: observation.block.number,
      blockHash: observation.block.hash,
      address: observation.contracts.manager.address,
      runtimeCodeHash: observation.contracts.manager.runtimeCodeHash,
      observedAt: observation.observedAt
    },
    sourceReview
  };
  const provenance: PancakeV3SourceReviewProvenance = {
    sourceRepository: SOURCE_REPOSITORY,
    sourceCommit: SOURCE_COMMIT,
    comparisonCommit: COMPARISON_COMMIT,
    retainedResearchEvidencePath: REPRODUCTION_EVIDENCE_PATH,
    reproducibleBuildEvidence: completion.verification.evidence,
    independentControlPathReviewEvidence: completion.independentReview.evidence,
    freshObservation: {
      method: observation.method,
      observer: observation.observer,
      block: observation.block,
      observedAt: observation.observedAt,
      latestTagUsed: observation.latestTagUsed,
      blockNumberFallbackUsed: observation.blockNumberFallbackUsed
    }
  };

  return deepFreeze({
    status: "source_review_ready_attestation_blocked" as const,
    sourceReview,
    target,
    provenance,
    issues: [] as const,
    boundary: SOURCE_READY_BOUNDARY
  });
}
