import {
  EIP1967_ADMIN_SLOT,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  LP_ACTIVATION_INTENT_SCHEMA_VERSION,
  LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
  PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
  PANCAKE_V3_BSC_TESTNET_FACTORY,
  PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION,
  PROOFERA_PANCAKE_V3_DENIED_MULTICALLS,
  PROOFERA_PANCAKE_V3_DIRECT_CALLS,
  WRITE_TARGET_ATTESTATION_SCHEMA_VERSION,
  deriveLpActivationContextIds,
  deriveWriteTargetReviewId,
  lpActivationContextPayloadForId,
  pancakeV3SelectorCallPathAssessmentSchema,
  type LpActivationIntent,
  type LpActivationServerContext,
  type WriteTargetAttestationManifest
} from "@proofera/domain";
import { sha256, stringToHex, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const nominalReservationTestGate = vi.hoisted(() => ({
  dependencies: new WeakSet<object>()
}));

vi.mock("./altana-lp-reservation-capability.server", () => ({
  isVerifiedAltanaLpDurableReservationDependency: (input: unknown) =>
    typeof input === "object" &&
    input !== null &&
    nominalReservationTestGate.dependencies.has(input)
}));

import { buildAltanaLpActivationComposition } from "./altana-lp-activation-composition.server";
import type {
  AltanaLpDurableReservationDependency,
  AltanaLpReservationReceipt,
  AltanaLpReservationRequest
} from "./altana-lp-handoff";
import {
  PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS,
  buildPancakeV3SelectorArtifactReview,
  derivePancakeV3SelectorArtifactReviewId
} from "./pancake-v3-selector-artifact-review";
import {
  PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256,
  buildPancakeV3TestnetManagerSourceReview
} from "./pancake-v3-source-review";
import {
  PANCAKE_V3_EXACT_BLOCK_OBSERVATION_REVIEW_ID_DOMAIN,
  buildPancakeV3TestnetWriteTargetAttestation
} from "./pancake-v3-write-target-attestation.server";

const NOW = "2026-08-11T16:30:00.000Z";
const BLOCK_TIMESTAMP = "2026-08-11T16:29:30.000Z";
const OBSERVED_AT = "2026-08-11T16:29:40.000Z";
const ATTESTED_AT = "2026-08-11T16:29:50.000Z";
const ANALYZED_AT = "2026-08-11T15:45:00.000Z";
const SELECTOR_REVIEWED_AT = "2026-08-11T15:50:00.000Z";
const FETCHED_AT = "2026-08-11T16:25:00.000Z";
const REVIEWER = "ProofEra Selector Security Reviewer 1";
const RETRIEVER = "ProofEra Public Evidence Retriever 1";
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const MANAGER = "0x427bf5b37357632377ecbec9de3626c71a5396c1";
const MANAGER_RUNTIME = "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7";
const BLOCK_NUMBER = "124471500";
const BLOCK_HASH = `0x${(204).toString(16).padStart(64, "0")}` as Hex;
const MAX_UINT256 = (2n ** 256n - 1n).toString();
const WALLET = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const TOKEN_0 = "0x3333333333333333333333333333333333333333";
const TOKEN_1 = "0x4444444444444444444444444444444444444444";
const POOL_DEPLOYER = "0x5555555555555555555555555555555555555555";
const WRAPPED_NATIVE = "0x6666666666666666666666666666666666666666";
const CONTEXT_NONCE = `0x${"11".repeat(32)}` as Hex;
const QUOTE_NONCE = `0x${"21".repeat(32)}` as Hex;

function jsonClone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function hex32(seed: number): Hex {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}

function checkedHex(value: string): Hex {
  if (!/^0x[0-9a-f]{64}$/.test(value)) throw new TypeError("Expected lowercase bytes32.");
  return value as Hex;
}

function evidence(name: string, seed: number) {
  return {
    locator: { scheme: "https" as const, uri: `https://evidence.proofera.dev/${name}.json` },
    sha256: hex32(seed)
  };
}

function trustedSourceReviewCompletion() {
  return {
    schemaVersion: 1,
    trustBoundary: "server_owned_authenticated_review_configuration",
    sourceCommit: "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57",
    comparisonCommit: "986847948755cba528324d41be19480731c36c2a",
    sourceTree: {
      captureMethod: "git_archive_tar_from_verified_clean_checkout",
      sha256: PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS.sourceTreeSha256,
      evidence: evidence("reproducible-build", 201)
    },
    compiler: {
      version: "0.7.6+commit.7338295f",
      binarySha256: "0x9214e06741c5cb51a61d745697c905f37480c0c8da1d5ac69e3bacda0063dfa5",
      binaryKeccak256: "0x4fbd020496c3a9e02c1eeb825d23f4d83d9198c4e21fda19deccdb7e74435edf",
      inputSha256: PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS.compiler.inputSha256,
      settingsSha256: PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS.compiler.settingsSha256,
      managerArtifactSha256:
        PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS.compiler.outputArtifactSha256,
      managerBuildInfoSha256: "0x72adeccd4f25257a89d95d3e0f1d8b9b0e5ab8400b2b828bab236b786ae2c7aa",
      runtimeTemplateCodeHash: "0x91d390a2f85270716bdc52a7782842724fee537f3f8c4e282ce31b98eea7807b",
      immutableLinkedRuntimeCodeHash: MANAGER_RUNTIME,
      settings: {
        optimizer: { enabled: true, runs: 2_000 },
        viaIr: false,
        evmVersion: "istanbul",
        metadataBytecodeHash: "none"
      }
    },
    verification: {
      verifiedAt: "2026-08-11T15:40:00.000Z",
      evidence: evidence("reproducible-build", 201)
    },
    independentReview: {
      reviewerIdentity: "ProofEra Source and Control Reviewer 1",
      reviewedAt: "2026-08-11T16:00:00.000Z",
      decision: "approved_only_for_the_frozen_direct_write_scope",
      evidence: evidence("source-control-review", 202)
    },
    controlPathReview: {
      reviewedAt: "2026-08-11T16:00:00.000Z",
      evidence: evidence("source-control-review", 202),
      directWriteScopeSha256: PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256,
      reachableSelfDelegatecallReviewed: true,
      everyMulticallSelectorDenied: true,
      allUnlistedSelectorsDenied: true,
      domainNoReachableDelegatecallModelCompatible: false
    }
  };
}

function exactBlockObservation() {
  return {
    schemaVersion: 1,
    source: "independent_exact_hash_runtime_storage_and_immutable_observer",
    independence: "independent_from_source_build_and_security_reviewer",
    chainId: 97,
    environment: "bsc-testnet",
    method: "eip1898_canonical_block_hash_without_latest_or_number_fallback",
    observer: {
      id: "independent-bsc-testnet-observer-1",
      publicSourceUrl: "https://bsc-testnet-rpc.publicnode.com",
      evidence: evidence("exact-block-observation", 203)
    },
    block: {
      number: BLOCK_NUMBER,
      hash: BLOCK_HASH,
      timestamp: BLOCK_TIMESTAMP,
      requireCanonical: true
    },
    observedAt: OBSERVED_AT,
    contracts: {
      manager: { address: MANAGER, runtimeByteLength: 24_466, runtimeCodeHash: MANAGER_RUNTIME },
      factory: {
        address: "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865",
        runtimeByteLength: 5_151,
        runtimeCodeHash: "0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c"
      },
      deployer: {
        address: "0x41ff9aa7e16b8b1a8a8dc4f0efacd93d02d071c9",
        runtimeByteLength: 24_556,
        runtimeCodeHash: "0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b"
      }
    },
    managerImmutables: {
      deployer: "0x41ff9aa7e16b8b1a8a8dc4f0efacd93d02d071c9",
      factory: "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865",
      wrappedNative: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
      tokenDescriptor: "0xb099b459887bc759dbf0293e12d3dfcd0c456cff",
      nameHash: "0xc8147ae4d95e1ae5d91d5822a926bbc8b3167bc4efcba3aad25887e8d7e1ada0",
      versionHash: "0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6"
    },
    managerEip1967Slots: {
      implementation: { slot: EIP1967_IMPLEMENTATION_SLOT, value: ZERO_BYTES32 },
      admin: { slot: EIP1967_ADMIN_SLOT, value: ZERO_BYTES32 },
      beacon: { slot: EIP1967_BEACON_SLOT, value: ZERO_BYTES32 }
    },
    latestTagUsed: false,
    blockNumberFallbackUsed: false
  };
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortJson((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function selectorReviewer() {
  return {
    identity: REVIEWER,
    authentication: "server_allowlisted_identity_bound_to_expected_batch_review_id",
    independence: "independent_from_source_builder_runtime_observer_and_retriever",
    method: "manual_static_source_and_bytecode_control_flow_review",
    version: "proofera-pancake-v3-selector-path-v1",
    assurance: "manual_static_analysis_not_formal_proof",
    decision: "approved_for_exact_selector_scoped_attestation_input_only",
    reviewedAt: SELECTOR_REVIEWED_AT
  };
}

function directBody(index: number) {
  const definition = PROOFERA_PANCAKE_V3_DIRECT_CALLS[index];
  if (definition === undefined) throw new TypeError("Invalid selector fixture index.");
  return {
    schemaVersion: 1,
    artifactType: "pancake_v3_direct_selector_independent_public_review",
    claimStatus: "approved_as_selector_attestation_input_not_execution_authorization",
    executionAuthorized: false,
    ...definition,
    analyzedAt: ANALYZED_AT,
    reviewer: selectorReviewer(),
    bindings: jsonClone(PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS),
    reachability: {
      controlFlowCoverage: "all_branches_resolved",
      delegatecall: "unreachable",
      arbitraryDispatcher: "unreachable",
      unknownPaths: "none",
      externalContractBoundary: "separate_exact_pool_and_token_attestations_required"
    },
    sourcePathSha256: hex32(index + 1),
    bytecodePathSha256: hex32(index + 11),
    publicEvidenceClaim: "published_https_content_addressed_and_independently_refetched"
  };
}

function boundaryBody() {
  return {
    schemaVersion: 1,
    artifactType: "pancake_v3_delegatecall_boundary_independent_public_review",
    claimStatus: "approved_as_selector_attestation_input_not_execution_authorization",
    executionAuthorized: false,
    reviewer: selectorReviewer(),
    bindings: jsonClone(PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS),
    classification: "known_self_delegatecall_dispatcher_present",
    delegatecallProgramCounter: 10_522,
    reviewedSourceLocation:
      "projects/v3-periphery/contracts/base/Multicall.sol#multicall(bytes[])_self_delegatecall",
    deniedMulticalls: PROOFERA_PANCAKE_V3_DENIED_MULTICALLS.map((definition) => ({
      ...definition,
      decision: "denied"
    })),
    unlistedSelectors: "denied",
    nestedCalldata: "denied",
    sourcePathSha256: hex32(5),
    bytecodePathSha256: hex32(15),
    publicEvidenceClaim: "published_https_content_addressed_and_independently_refetched"
  };
}

function descriptor(role: string, body: unknown, index: number) {
  const rawBodyUtf8 = canonicalJson(body);
  const expectedSha256 = sha256(stringToHex(rawBodyUtf8));
  const locator = `https://evidence.proofera.dev/selectors/${expectedSha256.slice(2)}.json`;
  const receiptSha256 = hex32(100 + index);
  return {
    role,
    locator,
    expectedSha256,
    rawBodyUtf8,
    retrieval: {
      kind: "prefetched_public_https_artifact_response_v1",
      retrieverIdentity: RETRIEVER,
      independence: "independent_from_source_builder_runtime_observer_and_reviewer",
      fetchedAt: FETCHED_AT,
      requestedUrl: locator,
      finalUrl: locator,
      redirectCount: 0,
      httpStatus: 200,
      contentType: "application/json",
      contentEncoding: "identity",
      rawByteLength: Buffer.byteLength(rawBodyUtf8, "utf8"),
      bodyComplete: true,
      tlsCertificateValidated: true,
      ssrfPolicy: "https_dns_and_every_connection_hop_public_ip_only_v1",
      allResolvedAddressesPublic: true,
      dnsRebindingProtection: true,
      receipt: {
        locator: `https://retrieval.proofera.dev/receipts/${receiptSha256.slice(2)}.json`,
        sha256: receiptSha256
      }
    }
  };
}

function selectorBatch() {
  return {
    schemaVersion: 1,
    trustBoundary: "server_owned_prefetched_public_evidence_descriptors",
    selectorArtifacts: [
      descriptor("mint", directBody(0), 0),
      descriptor("increaseLiquidity", directBody(1), 1),
      descriptor("decreaseLiquidity", directBody(2), 2),
      descriptor("collect", directBody(3), 3)
    ],
    delegatecallBoundaryArtifact: descriptor("denied-multicalls", boundaryBody(), 4)
  };
}

function expectedFullReviewId(
  observation: unknown,
  completion: unknown,
  batch: unknown,
  expectedSelectorReviewId: Hex
): Hex {
  const clock = () => new Date(NOW);
  const source = buildPancakeV3TestnetManagerSourceReview(observation, {
    now: clock,
    trustedReviewCompletion: completion
  });
  if (source.status !== "source_review_ready_attestation_blocked") {
    throw new TypeError("Expected valid source fixture.");
  }
  const selector = buildPancakeV3SelectorArtifactReview(batch, {
    now: clock,
    expectedReviewId: expectedSelectorReviewId,
    expectedReviewerIdentity: REVIEWER,
    expectedRetrieverIdentity: RETRIEVER
  });
  if (selector.status !== "selector_assessment_ready_attestation_still_blocked") {
    throw new TypeError("Expected valid selector fixture.");
  }
  const assessment = pancakeV3SelectorCallPathAssessmentSchema.parse(selector.assessment);
  const target = source.target;
  const block = source.provenance.freshObservation.block;
  const manifest: WriteTargetAttestationManifest = {
    schemaVersion: WRITE_TARGET_ATTESTATION_SCHEMA_VERSION,
    chainId: 97,
    environment: "testnet",
    canonicalBlock: { number: block.number, hash: block.hash, timestamp: block.timestamp },
    attestedAt: ATTESTED_AT,
    target,
    proxyAssessment: {
      kind: "non_proxy",
      decision: "independently_reviewed_non_proxy_selector_scoped",
      targetAddress: target.code.address,
      blockNumber: target.code.blockNumber,
      blockHash: target.code.blockHash,
      runtimeCodeHash: target.code.runtimeCodeHash,
      observedAt: target.code.observedAt,
      evidence: source.provenance.independentControlPathReviewEvidence,
      selectorCallPathAssessment: assessment
    }
  };
  return deriveWriteTargetReviewId(manifest);
}

function observationTrustRoots(observation: unknown, completion: unknown) {
  const source = buildPancakeV3TestnetManagerSourceReview(observation, {
    now: () => new Date(NOW),
    trustedReviewCompletion: completion
  });
  if (source.status !== "source_review_ready_attestation_blocked") {
    throw new TypeError("Expected valid source fixture.");
  }
  const freshObservation = source.provenance.freshObservation;
  const manifest = {
    schemaVersion: 1,
    chainId: 97,
    environment: "bsc-testnet",
    targetCode: source.target.code,
    observation: freshObservation
  } as const;
  return {
    expectedExactBlockObservationReviewId: sha256(
      stringToHex(
        `${PANCAKE_V3_EXACT_BLOCK_OBSERVATION_REVIEW_ID_DOMAIN}\u0000${JSON.stringify(
          sortJson(manifest)
        )}`
      )
    ),
    expectedObserverIdentity: freshObservation.observer.id,
    expectedObserverPublicSourceUrl: freshObservation.observer.publicSourceUrl,
    expectedObservationEvidenceLocator: freshObservation.observer.evidence.locator.uri,
    expectedObservationEvidenceSha256: checkedHex(freshObservation.observer.evidence.sha256)
  };
}

function intentFixture(): LpActivationIntent {
  return {
    schemaVersion: LP_ACTIVATION_INTENT_SCHEMA_VERSION,
    chainId: 97,
    wallet: WALLET,
    recipient: WALLET,
    poolAddress: POOL,
    positionTokenId: MAX_UINT256,
    desiredTick: { lower: -120, upper: 120 },
    capital: { token0Raw: MAX_UINT256, token1Raw: "2000000" },
    maxSlippageBps: 50,
    sessionDurationSeconds: 3_600,
    txDeadlineSeconds: 40,
    maxExecutionsPerDay: 4
  };
}

function contextFixture(intent: LpActivationIntent = intentFixture()): LpActivationServerContext {
  const candidate: LpActivationServerContext = {
    schemaVersion: LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
    contextId: hex32(10),
    quoteId: hex32(20),
    chainId: 97,
    environment: "testnet",
    issuedAt: "2026-08-11T16:29:50.000Z",
    expiresAt: "2026-08-11T16:31:20.000Z",
    authenticatedWallet: WALLET,
    intentBinding: intent,
    reviewedDeployment: {
      protocol: "PancakeSwap V3",
      reviewId: hex32(30),
      reviewedAt: "2026-08-01T00:00:00.000Z",
      sourceUrl: PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
      fee: 2_500,
      tickSpacing: 60,
      token0: { address: TOKEN_0, codeHash: hex32(160), decimals: 18 },
      token1: { address: TOKEN_1, codeHash: hex32(176), decimals: 6 },
      positionManager: {
        address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        codeHash: MANAGER_RUNTIME
      },
      factory: { address: PANCAKE_V3_BSC_TESTNET_FACTORY, codeHash: hex32(96) },
      pool: { address: POOL, codeHash: hex32(112) },
      poolDeployer: { address: POOL_DEPLOYER, codeHash: hex32(128) },
      wrappedNative: { address: WRAPPED_NATIVE, codeHash: hex32(144) }
    },
    observedDeployment: {
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      positionManager: {
        address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        codeHash: MANAGER_RUNTIME
      },
      factory: { address: PANCAKE_V3_BSC_TESTNET_FACTORY, codeHash: hex32(96) },
      pool: { address: POOL, codeHash: hex32(112) },
      poolDeployer: { address: POOL_DEPLOYER, codeHash: hex32(128) },
      token0: { address: TOKEN_0, codeHash: hex32(160) },
      token1: { address: TOKEN_1, codeHash: hex32(176) },
      wrappedNative: { address: WRAPPED_NATIVE, codeHash: hex32(144) }
    },
    position: {
      fee: 2_500,
      managerAddress: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      ownerAddress: WALLET,
      poolAddress: POOL,
      tickLower: -60,
      tickUpper: 60,
      token0Address: TOKEN_0,
      token1Address: TOKEN_1,
      tokenId: MAX_UINT256
    },
    pool: {
      address: POOL,
      currentTick: 0,
      factoryAddress: PANCAKE_V3_BSC_TESTNET_FACTORY,
      fee: 2_500,
      sqrtPriceX96: "79228162514264337593543950336",
      tickSpacing: 60,
      token0: { address: TOKEN_0, decimals: 18 },
      token1: { address: TOKEN_1, decimals: 6 }
    },
    factoryRelation: {
      factoryAddress: PANCAKE_V3_BSC_TESTNET_FACTORY,
      fee: 2_500,
      poolAddress: POOL,
      tickSpacing: 60,
      token0Address: TOKEN_0,
      token1Address: TOKEN_1
    },
    authorization: {
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      authorizationKind: "owner",
      controllerAddress: WALLET,
      controllerAuthorized: true,
      observedAt: OBSERVED_AT,
      ownerAddress: WALLET,
      positionTokenId: MAX_UINT256,
      source: "onchain_owner_and_controller_read"
    },
    block: { hash: BLOCK_HASH, number: BLOCK_NUMBER, timestamp: BLOCK_TIMESTAMP },
    quote: {
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      capitalToken0Raw: MAX_UINT256,
      capitalToken1Raw: "2000000",
      calculation: {
        currentTick: 0,
        exactLiquidityMatchRequired: true,
        methodologyVersion: PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION,
        preliminaryLiquidityRaw: "1",
        recomputedFromCalldataAtObservedPriceRaw: "1",
        sqrtPriceX96: "79228162514264337593543950336",
        tickLower: -120,
        tickUpper: 120
      },
      maxSlippageBps: 50,
      observedAt: OBSERVED_AT,
      poolAddress: POOL,
      sourceKind: "pancake_v3_block_pinned_math",
      sourceUrl: `https://testnet.bscscan.com/address/${POOL}`,
      token0: {
        address: TOKEN_0,
        capitalNotSubmittedRaw: "0",
        desiredMaximumRaw: MAX_UINT256,
        minimumAmountRaw: MAX_UINT256
      },
      token1: {
        address: TOKEN_1,
        capitalNotSubmittedRaw: "0",
        desiredMaximumRaw: "2000000",
        minimumAmountRaw: "1900000"
      },
      validUntil: "2026-08-11T16:30:40.000Z"
    }
  };
  return {
    ...candidate,
    ...deriveLpActivationContextIds(
      candidate.intentBinding,
      lpActivationContextPayloadForId(candidate),
      { contextNonce: CONTEXT_NONCE, quoteNonce: QUOTE_NONCE }
    )
  };
}

function receiptFor(request: AltanaLpReservationRequest): AltanaLpReservationReceipt {
  return { ...request, state: "consumed" };
}

function fixture() {
  const intent = intentFixture();
  const context = contextFixture(intent);
  const observation = exactBlockObservation();
  const completion = trustedSourceReviewCompletion();
  const batch = selectorBatch();
  const expectedSelectorReviewId = derivePancakeV3SelectorArtifactReviewId(batch);
  if (expectedSelectorReviewId === null) throw new TypeError("Expected valid selector batch.");
  const expectedWriteTargetReviewId = expectedFullReviewId(
    observation,
    completion,
    batch,
    expectedSelectorReviewId
  );
  const observationTrust = observationTrustRoots(observation, completion);
  return {
    intent,
    context,
    observation,
    completion,
    batch,
    options: {
      now: () => new Date(NOW),
      policy: {
        agentId: "proofera:lp-range-guardian:v1",
        token0Symbol: "WBNB",
        token1Symbol: "USDT",
        expectedContextId: checkedHex(context.contextId),
        contextNonce: CONTEXT_NONCE,
        quoteNonce: QUOTE_NONCE,
        consumedContextIds: [],
        consumedQuoteIds: []
      },
      bootstrap: { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      writeTarget: {
        trustedSourceReviewCompletion: completion,
        ...observationTrust,
        expectedSelectorReviewId,
        expectedSelectorReviewerIdentity: REVIEWER,
        expectedSelectorRetrieverIdentity: RETRIEVER,
        expectedWriteTargetReviewId,
        expectedAttestedAt: ATTESTED_AT
      }
    }
  };
}

function dependency(
  consumeOrRead: AltanaLpDurableReservationDependency["consumeOrRead"] = async (request) =>
    receiptFor(request)
) {
  const durableReservation = { consumeOrRead };
  nominalReservationTestGate.dependencies.add(durableReservation);
  return { durableReservation };
}

function build(
  input = fixture(),
  dependencies: unknown = dependency(),
  priorReservationRequest?: unknown
) {
  return buildAltanaLpActivationComposition(
    input.intent,
    input.context,
    input.observation,
    input.batch,
    input.options,
    dependencies,
    priorReservationRequest
  );
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>)) {
    expectDeepFrozen(child, seen);
  }
}

describe("Altana LP raw activation composition", () => {
  it("rebuilds, reassesses, reserves exactly once, and returns no authority", async () => {
    const input = fixture();
    const now = vi.fn(() => new Date(NOW));
    input.options.now = now;
    const consumeOrRead = vi.fn(async (request: AltanaLpReservationRequest) => receiptFor(request));
    const fetchSpy = vi.fn(() => {
      throw new Error("Direct network access is forbidden.");
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const result = await build(input, dependency(consumeOrRead));
      expect(result.status, JSON.stringify(result)).toBe(
        "activation_bootstrap_reserved_no_authority"
      );
      if (result.status !== "activation_bootstrap_reserved_no_authority") return;
      expect(now).toHaveBeenCalledTimes(3);
      expect(consumeOrRead).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.writeTarget.attestation.reviewId).toBe(
        input.options.writeTarget.expectedWriteTargetReviewId
      );
      expect(result.writeTarget.effectiveTarget).toMatchObject({
        address: MANAGER,
        runtimeCodeHash: MANAGER_RUNTIME,
        canonicalBlockNumber: BLOCK_NUMBER,
        canonicalBlockHash: BLOCK_HASH,
        proxyKind: "none"
      });
      expect(result.writeTarget.provenance.exactBlockObservationReviewId).toBe(
        input.options.writeTarget.expectedExactBlockObservationReviewId
      );
      expect(result.handoff.writeTargetBinding.reviewId).toBe(
        input.options.writeTarget.expectedWriteTargetReviewId
      );
      expect(result.handoff.reservationReceipt).toEqual({
        ...result.handoff.reservationRequest,
        state: "consumed"
      });
      expect(result.boundary).toEqual({
        rawEvidenceRebuilt: true,
        writeTargetDomainReassessed: true,
        rawIntentPolicyRebuilt: true,
        bootstrapRequestCreated: true,
        durableReservationDependencyInvoked: true,
        durableReservationOutcome: "validated",
        reservationReceiptValidated: true,
        sessionKeyCreated: false,
        secretHandleCreated: false,
        bootstrapPersisted: false,
        authorityCreated: false,
        walletSignatureRequested: false,
        transactionCalldataCreated: false,
        transactionSubmitted: false,
        blockchainWritePerformed: false,
        executionPerformed: false,
        httpFetchPerformed: false,
        walletStateReadPerformed: false,
        walletOrSessionSecretMaterialReadPerformed: false,
        scope: "validated_altana_lp_bootstrap_and_durable_reservation_only"
      });
      expect("sessionKey" in result).toBe(false);
      expect("secretHandle" in result).toBe(false);
      expect("calldata" in result).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/private.?key/i);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      expectDeepFrozen(result);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("pins evidence and policy to the initial instant but samples post-reservation freshness", async () => {
    const input = fixture();
    const later = new Date(Date.parse(NOW) + 5_000);
    const now = vi
      .fn<() => Date>()
      .mockImplementationOnce(() => new Date(NOW))
      .mockImplementationOnce(() => later)
      .mockImplementationOnce(() => new Date(later.getTime() + 1_000));
    input.options.now = now;
    const result = await build(input);
    expect(result.status).toBe("activation_bootstrap_reserved_no_authority");
    if (result.status !== "activation_bootstrap_reserved_no_authority") return;
    expect(now).toHaveBeenCalledTimes(3);
    expect(result.handoff.policyBuild.sourceBinding.resolvedAt).toBe(NOW);
    expect(result.handoff.reservationRequest.consumedAt).toBe(NOW);
    expect(later.getTime()).toBeGreaterThan(
      Date.parse(result.handoff.reservationRequest.consumedAt)
    );
  });

  it("blocks a reservation when the exact-block write target becomes stale in flight", async () => {
    const input = fixture();
    const almostStaleBlock = new Date(Date.parse(NOW) - 119_000).toISOString();
    input.observation.block.timestamp = almostStaleBlock;
    input.context.block.timestamp = almostStaleBlock;
    input.context = {
      ...input.context,
      ...deriveLpActivationContextIds(
        input.context.intentBinding,
        lpActivationContextPayloadForId(input.context),
        { contextNonce: CONTEXT_NONCE, quoteNonce: QUOTE_NONCE }
      )
    };
    input.options.policy.expectedContextId = checkedHex(input.context.contextId);
    const expectedSelectorReviewId = derivePancakeV3SelectorArtifactReviewId(input.batch);
    if (expectedSelectorReviewId === null) throw new TypeError("Expected valid selector batch.");
    const expectedWriteTargetReviewId = expectedFullReviewId(
      input.observation,
      input.completion,
      input.batch,
      expectedSelectorReviewId
    );
    input.options.writeTarget = {
      ...input.options.writeTarget,
      ...observationTrustRoots(input.observation, input.completion),
      expectedWriteTargetReviewId
    };
    const now = vi
      .fn<() => Date>()
      .mockImplementationOnce(() => new Date(NOW))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 2_000))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 2_000));
    input.options.now = now;
    const consumeOrRead = vi.fn(async (request: AltanaLpReservationRequest) => receiptFor(request));

    const result = await build(input, dependency(consumeOrRead));

    expect(result.status).toBe("blocked");
    expect(result.handoff).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "WRITE_TARGET_REASSESSMENT_BLOCKED",
          sourceCode: "BLOCK_STALE"
        })
      ])
    );
    expect(result.boundary).toMatchObject({
      durableReservationDependencyInvoked: true,
      durableReservationOutcome: "committed_unusable",
      reservationReceiptValidated: true
    });
    expect(consumeOrRead).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(3);
  });

  it("blocks a committed reservation when post-await time reaches its expiry", async () => {
    const input = fixture();
    const now = vi
      .fn<() => Date>()
      .mockImplementationOnce(() => new Date(NOW))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 31_000));
    input.options.now = now;
    const result = await build(input);
    expect(result.status).toBe("blocked");
    expect(result.handoff?.status).toBe("blocked");
    if (result.handoff?.status !== "blocked") return;
    expect(result.handoff.reservationRequest).not.toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "HANDOFF_BLOCKED",
          sourceCode: "RESERVATION_RECEIPT_EXPIRED"
        })
      ])
    );
    expect(result.boundary).toMatchObject({
      durableReservationDependencyInvoked: true,
      durableReservationOutcome: "committed_unusable",
      reservationReceiptValidated: false
    });
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("blocks when the reservation expires between handoff and final target validation", async () => {
    const input = fixture();
    const now = vi
      .fn<() => Date>()
      .mockImplementationOnce(() => new Date(NOW))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 29_000))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 31_000));
    input.options.now = now;

    const result = await build(input);

    expect(result.status).toBe("blocked");
    expect(result.handoff).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "HANDOFF_BLOCKED",
          sourceCode: "RESERVATION_RECEIPT_EXPIRED"
        })
      ])
    );
    expect(result.boundary).toMatchObject({
      durableReservationOutcome: "committed_unusable",
      reservationReceiptValidated: true
    });
    expect(now).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      label: "invalid",
      second: () => new Date(Number.NaN)
    },
    {
      label: "throwing",
      second: () => {
        throw new Error("unsafe clock detail");
      }
    }
  ])("blocks a $label external clock after durable reservation", async ({ second }) => {
    const input = fixture();
    const now = vi
      .fn<() => Date>()
      .mockImplementationOnce(() => new Date(NOW))
      .mockImplementationOnce(second);
    input.options.now = now;
    const result = await build(input);
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "HANDOFF_BLOCKED",
          sourceCode: "RESERVATION_CLOCK_INVALID"
        })
      ])
    );
    expect(result.boundary.durableReservationOutcome).toBe("committed_unusable");
    expect(JSON.stringify(result)).not.toContain("unsafe clock detail");
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("rejects reconciliation when later samples rewind below an already-expired initial snapshot", async () => {
    const input = fixture();
    const initial = await build(input);
    expect(initial.status).toBe("activation_bootstrap_reserved_no_authority");
    if (initial.status !== "activation_bootstrap_reserved_no_authority") return;

    const now = vi
      .fn<() => Date>()
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 31_000))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 5_000))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 6_000));
    input.options.now = now;
    const consumeOrRead = vi.fn();
    const result = await build(
      input,
      dependency(consumeOrRead),
      initial.handoff.reservationRequest
    );
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "HANDOFF_BLOCKED",
          sourceCode: "RECONCILIATION_REQUEST_INVALID"
        })
      ])
    );
    expect(consumeOrRead).not.toHaveBeenCalled();
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("blocks a reconciliation receipt when the post-await clock rewinds", async () => {
    const input = fixture();
    const initial = await build(input);
    expect(initial.status).toBe("activation_bootstrap_reserved_no_authority");
    if (initial.status !== "activation_bootstrap_reserved_no_authority") return;

    const now = vi
      .fn<() => Date>()
      .mockImplementationOnce(() => new Date(NOW))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 5_000))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 4_000));
    input.options.now = now;
    const consumeOrRead = vi.fn(async (request: AltanaLpReservationRequest) => receiptFor(request));
    const result = await build(
      input,
      dependency(consumeOrRead),
      initial.handoff.reservationRequest
    );
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "HANDOFF_BLOCKED",
          sourceCode: "RESERVATION_CLOCK_INVALID"
        })
      ])
    );
    expect(result.boundary.durableReservationOutcome).toBe("committed_unusable");
    expect(consumeOrRead).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(3);
  });

  it("never calls durable reservation when write-target composition blocks", async () => {
    const input = fixture();
    input.observation.contracts.manager.runtimeCodeHash = hex32(301);
    const consumeOrRead = vi.fn();
    const result = await build(input, dependency(consumeOrRead));
    expect(result.status).toBe("blocked");
    expect(consumeOrRead).not.toHaveBeenCalled();
    expect(result.handoff).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "WRITE_TARGET_COMPOSITION_BLOCKED",
          sourceCode: "OBSERVATION_INVALID"
        })
      ])
    );
    expect(result.boundary.durableReservationOutcome).toBe("not_attempted");
  });

  it.each([
    {
      label: "source review",
      mutate(input: ReturnType<typeof fixture>) {
        Object.defineProperty(input.options.writeTarget, "trustedSourceReviewCompletion", {
          configurable: true,
          enumerable: true,
          value: null,
          writable: true
        });
      },
      sourceCode: "REVIEW_COMPLETION_INVALID"
    },
    {
      label: "observer trust",
      mutate(input: ReturnType<typeof fixture>) {
        input.observation.observer.id = "caller-forged-observer";
      },
      sourceCode: "OBSERVATION_NOT_TRUSTED"
    },
    {
      label: "selector artifact",
      mutate(input: ReturnType<typeof fixture>) {
        const artifact = input.batch.selectorArtifacts[0];
        if (artifact === undefined) throw new TypeError("Missing selector fixture.");
        artifact.rawBodyUtf8 = `${artifact.rawBodyUtf8} `;
      },
      sourceCode: "BODY_SHA256_MISMATCH"
    },
    {
      label: "full review root",
      mutate(input: ReturnType<typeof fixture>) {
        input.options.writeTarget.expectedWriteTargetReviewId = hex32(302);
      },
      sourceCode: "REVIEW_NOT_TRUSTED"
    }
  ])("blocks $label drift before reservation", async ({ mutate, sourceCode }) => {
    const input = fixture();
    mutate(input);
    const consumeOrRead = vi.fn();
    const result = await build(input, dependency(consumeOrRead));
    expect(result.status).toBe("blocked");
    expect(consumeOrRead).not.toHaveBeenCalled();
    expect(result.issues.map(({ sourceCode: code }) => code)).toContain(sourceCode);
  });

  it("rejects option and dependency accessors without invoking them", async () => {
    const optionInput = fixture();
    let optionGetterInvoked = false;
    Object.defineProperty(optionInput.options, "writeTarget", {
      enumerable: true,
      get() {
        optionGetterInvoked = true;
        return {};
      }
    });
    const optionConsume = vi.fn();
    const optionResult = await build(optionInput, dependency(optionConsume));
    expect(optionGetterInvoked).toBe(false);
    expect(optionResult.issues).toEqual([expect.objectContaining({ code: "OPTIONS_INVALID" })]);
    expect(optionConsume).not.toHaveBeenCalled();

    const dependencyInput = fixture();
    let dependencyGetterInvoked = false;
    const maliciousDependency = Object.defineProperty({}, "durableReservation", {
      enumerable: true,
      get() {
        dependencyGetterInvoked = true;
        return dependency();
      }
    });
    const dependencyResult = await build(dependencyInput, maliciousDependency);
    expect(dependencyGetterInvoked).toBe(false);
    expect(dependencyResult.issues).toEqual([
      expect.objectContaining({ code: "DEPENDENCIES_INVALID" })
    ]);
  });

  it("rejects an exact structural reservation lookalike that lacks nominal verification", async () => {
    const consumeOrRead = vi.fn(async (request: AltanaLpReservationRequest) => receiptFor(request));
    const structuralLookalike = Object.freeze({ durableReservation: { consumeOrRead } });
    const result = await build(fixture(), structuralLookalike);

    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual([expect.objectContaining({ code: "DEPENDENCIES_INVALID" })]);
    expect(consumeOrRead).not.toHaveBeenCalled();
    expect(result.boundary.durableReservationDependencyInvoked).toBe(false);
  });

  it("rejects proxy-wrapped options, dependencies, clocks, and dates without invoking traps", async () => {
    const trap = vi.fn();
    const handler: ProxyHandler<object> = {
      apply() {
        trap();
        return new Date(NOW);
      },
      getOwnPropertyDescriptor() {
        trap();
        return undefined;
      },
      getPrototypeOf() {
        trap();
        return Object.prototype;
      },
      ownKeys() {
        trap();
        return [];
      }
    };

    const optionsInput = fixture();
    const optionsResult = await build(
      {
        ...optionsInput,
        options: new Proxy(
          optionsInput.options,
          handler as ProxyHandler<typeof optionsInput.options>
        )
      },
      dependency()
    );
    expect(optionsResult.issues).toEqual([expect.objectContaining({ code: "OPTIONS_INVALID" })]);

    const dependencyInput = fixture();
    const dependencyResult = await build(dependencyInput, new Proxy(dependency(), handler));
    expect(dependencyResult.issues).toEqual([
      expect.objectContaining({ code: "DEPENDENCIES_INVALID" })
    ]);

    const clockInput = fixture();
    clockInput.options.now = new Proxy(clockInput.options.now, handler as ProxyHandler<() => Date>);
    const clockResult = await build(clockInput, dependency());
    expect(clockResult.issues).toEqual([expect.objectContaining({ code: "OPTIONS_INVALID" })]);

    const dateInput = fixture();
    dateInput.options.now = () => new Proxy(new Date(NOW), handler) as Date;
    const dateResult = await build(dateInput, dependency());
    expect(dateResult.issues).toEqual([expect.objectContaining({ code: "CLOCK_INVALID" })]);
    expect(trap).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "intent getter",
      expectedPath: "rawIntentInput",
      expectedSourceCode: "SNAPSHOT_ACCESSOR",
      mutate(input: ReturnType<typeof fixture>) {
        let invocations = 0;
        Object.defineProperty(input.intent, "wallet", {
          configurable: true,
          enumerable: true,
          get() {
            invocations += 1;
            return WALLET;
          }
        });
        return () => invocations;
      }
    },
    {
      label: "context proxy",
      expectedPath: "rawServerContextInput",
      expectedSourceCode: "SNAPSHOT_PROXY",
      mutate(input: ReturnType<typeof fixture>) {
        let invocations = 0;
        input.context = new Proxy(input.context, {
          get() {
            invocations += 1;
            throw new Error("proxy get must not run");
          },
          getOwnPropertyDescriptor() {
            invocations += 1;
            throw new Error("proxy descriptor trap must not run");
          },
          getPrototypeOf() {
            invocations += 1;
            throw new Error("proxy prototype trap must not run");
          },
          ownKeys() {
            invocations += 1;
            throw new Error("proxy keys trap must not run");
          }
        });
        return () => invocations;
      }
    },
    {
      label: "hidden observation property",
      expectedPath: "rawExactBlockObservationInput",
      expectedSourceCode: "SNAPSHOT_HIDDEN_PROPERTY",
      mutate(input: ReturnType<typeof fixture>) {
        Object.defineProperty(input.observation, "hiddenAttestation", {
          enumerable: false,
          value: hex32(601)
        });
        return () => 0;
      }
    },
    {
      label: "selector batch symbol",
      expectedPath: "rawPrefetchedSelectorArtifactBatchInput",
      expectedSourceCode: "SNAPSHOT_SYMBOL_KEY",
      mutate(input: ReturnType<typeof fixture>) {
        Object.defineProperty(input.batch, Symbol("callerReview"), {
          enumerable: true,
          value: hex32(602)
        });
        return () => 0;
      }
    },
    {
      label: "intent cycle",
      expectedPath: "rawIntentInput",
      expectedSourceCode: "SNAPSHOT_CYCLE",
      mutate(input: ReturnType<typeof fixture>) {
        Object.defineProperty(input.intent, "cycle", {
          enumerable: true,
          value: input.intent
        });
        return () => 0;
      }
    },
    {
      label: "custom context prototype",
      expectedPath: "rawServerContextInput",
      expectedSourceCode: "SNAPSHOT_NON_PLAIN_OBJECT",
      mutate(input: ReturnType<typeof fixture>) {
        Object.setPrototypeOf(input.context, { callerControlled: true });
        return () => 0;
      }
    },
    {
      label: "dangerous observation key",
      expectedPath: "rawExactBlockObservationInput",
      expectedSourceCode: "SNAPSHOT_DANGEROUS_KEY",
      mutate(input: ReturnType<typeof fixture>) {
        Object.defineProperty(input.observation, "__proto__", {
          configurable: true,
          enumerable: true,
          value: { callerControlled: true },
          writable: true
        });
        return () => 0;
      }
    }
  ])(
    "rejects a $label before either builder and without invoking it",
    async ({ expectedPath, expectedSourceCode, mutate }) => {
      const input = fixture();
      const invocationCount = mutate(input);
      const consumeOrRead = vi.fn();
      const result = await build(input, dependency(consumeOrRead));
      expect(invocationCount()).toBe(0);
      expect(result.status).toBe("blocked");
      expect(result.issues).toEqual([
        expect.objectContaining({
          code: "RAW_INPUT_INVALID",
          path: expectedPath,
          sourceCode: expectedSourceCode
        })
      ]);
      expect(result.boundary.rawEvidenceRebuilt).toBe(false);
      expect(result.handoff).toBeNull();
      expect(consumeOrRead).not.toHaveBeenCalled();
    }
  );

  it("rejects hidden extras, symbols, and custom option prototypes", async () => {
    const hiddenInput = fixture();
    Object.defineProperty(hiddenInput.options, "preEvaluatedAttestation", {
      enumerable: false,
      value: { status: "ready" }
    });
    expect((await build(hiddenInput)).issues).toEqual([
      expect.objectContaining({ code: "OPTIONS_INVALID" })
    ]);

    const symbolInput = fixture();
    Object.defineProperty(symbolInput.options, Symbol("review"), {
      enumerable: true,
      value: hex32(401)
    });
    expect((await build(symbolInput)).issues).toEqual([
      expect.objectContaining({ code: "OPTIONS_INVALID" })
    ]);

    const prototypeInput = fixture();
    Object.setPrototypeOf(prototypeInput.options, { trusted: true });
    expect((await build(prototypeInput)).issues).toEqual([
      expect.objectContaining({ code: "OPTIONS_INVALID" })
    ]);

    const nestedArrayInput = fixture();
    Object.setPrototypeOf(nestedArrayInput.options.policy.consumedContextIds, {
      callerControlled: true
    });
    expect((await build(nestedArrayInput)).issues).toEqual([
      expect.objectContaining({ code: "OPTIONS_INVALID" })
    ]);

    const prototypeKeyInput = fixture();
    Object.defineProperty(prototypeKeyInput.options.policy, "__proto__", {
      configurable: true,
      enumerable: true,
      value: { injected: true },
      writable: true
    });
    expect((await build(prototypeKeyInput)).issues).toEqual([
      expect.objectContaining({ code: "OPTIONS_INVALID" })
    ]);
  });

  it("has no public path for caller-supplied evaluated attestations or top-level trust IDs", async () => {
    const input = fixture();
    const composed = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
      ...input.options.writeTarget,
      now: () => new Date(NOW)
    });
    expect(composed.status).toBe("write_target_attestation_ready_execution_still_blocked");
    const injectedOptions = {
      ...input.options,
      evaluatedWriteTarget: composed,
      expectedWriteTargetReviewId: input.options.writeTarget.expectedWriteTargetReviewId
    };
    const consumeOrRead = vi.fn();
    const result = await build({ ...input, options: injectedOptions }, dependency(consumeOrRead));
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual([expect.objectContaining({ code: "OPTIONS_INVALID" })]);
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it("blocks raw intent/context drift in the handoff before durable access", async () => {
    const input = fixture();
    input.context.authenticatedWallet = "0x9999999999999999999999999999999999999999";
    const consumeOrRead = vi.fn();
    const result = await build(input, dependency(consumeOrRead));
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "HANDOFF_BLOCKED", sourceCode: "POLICY_BUILD_BLOCKED" })
      ])
    );
    expect(consumeOrRead).not.toHaveBeenCalled();
    expect(result.boundary.rawEvidenceRebuilt).toBe(true);
    expect(result.boundary.writeTargetDomainReassessed).toBe(true);
  });

  it("passes only the exact retained reservation request for reconciliation", async () => {
    const input = fixture();
    let retainedReceipt: AltanaLpReservationReceipt | undefined;
    const first = await build(
      input,
      dependency(async (request) => {
        retainedReceipt = receiptFor(request);
        return retainedReceipt;
      })
    );
    expect(first.status).toBe("activation_bootstrap_reserved_no_authority");
    if (first.status !== "activation_bootstrap_reserved_no_authority" || !retainedReceipt) return;

    const reconcile = vi.fn(async (request: AltanaLpReservationRequest) => {
      expect(request).toEqual(first.handoff.reservationRequest);
      return retainedReceipt;
    });
    const reconciliationNow = vi
      .fn<() => Date>()
      .mockImplementationOnce(() => new Date(NOW))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 5_000))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 6_000))
      .mockImplementationOnce(() => new Date(Date.parse(NOW) + 7_000));
    input.options.now = reconciliationNow;
    const second = await build(input, dependency(reconcile), first.handoff.reservationRequest);
    expect(second.status).toBe("activation_bootstrap_reserved_no_authority");
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconciliationNow).toHaveBeenCalledTimes(4);

    const conflict = vi.fn();
    input.options.now = () => new Date(NOW);
    const mismatchedPrior = {
      ...first.handoff.reservationRequest,
      policyHash: hex32(501)
    };
    const blockedResult = await build(input, dependency(conflict), mismatchedPrior);
    expect(blockedResult.status).toBe("blocked");
    expect(blockedResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "HANDOFF_BLOCKED",
          sourceCode: "RECONCILIATION_REQUEST_MISMATCH"
        })
      ])
    );
    expect(conflict).not.toHaveBeenCalled();
  });

  it("retains the exact request and sanitized unknown outcome for reservation reconciliation", async () => {
    const input = fixture();
    const unsafe = new Error("database password and host must not escape");
    Object.defineProperty(unsafe, "reservationOutcome", {
      enumerable: true,
      value: "unknown"
    });
    const result = await build(
      input,
      dependency(async () => {
        throw unsafe;
      })
    );
    expect(result.status).toBe("blocked");
    expect(result.handoff?.status).toBe("blocked");
    if (result.handoff?.status !== "blocked") return;
    expect(result.handoff.reservationRequest).not.toBeNull();
    expect(result.boundary).toMatchObject({
      durableReservationDependencyInvoked: true,
      durableReservationOutcome: "unknown",
      reservationReceiptValidated: false,
      authorityCreated: false,
      transactionSubmitted: false
    });
    expect(JSON.stringify(result)).not.toContain("database password");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expectDeepFrozen(result);
  });

  it("rejects a prior-reservation accessor without invoking it", async () => {
    const input = fixture();
    const initial = await build(input);
    expect(initial.status).toBe("activation_bootstrap_reserved_no_authority");
    if (initial.status !== "activation_bootstrap_reserved_no_authority") return;
    let invoked = false;
    const prior = { ...initial.handoff.reservationRequest };
    Object.defineProperty(prior, "policyHash", {
      enumerable: true,
      get() {
        invoked = true;
        return initial.handoff.reservationRequest.policyHash;
      }
    });
    const consumeOrRead = vi.fn();
    const result = await build(input, dependency(consumeOrRead), prior);
    expect(invoked).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RAW_INPUT_INVALID",
          path: "priorReservationRequestInput",
          sourceCode: "SNAPSHOT_ACCESSOR"
        })
      ])
    );
    expect(consumeOrRead).not.toHaveBeenCalled();
  });
});
