import {
  EIP1967_ADMIN_SLOT,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  PROOFERA_PANCAKE_V3_DENIED_MULTICALLS,
  PROOFERA_PANCAKE_V3_DIRECT_CALLS,
  WRITE_TARGET_ATTESTATION_SCHEMA_VERSION,
  deriveWriteTargetReviewId,
  pancakeV3SelectorCallPathAssessmentSchema,
  type WriteTargetAttestationManifest
} from "@proofera/domain";
import { sha256, stringToHex, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

function jsonClone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function hex32(seed: number): Hex {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}

function checkedHex(value: string): Hex {
  if (!/^0x[0-9a-f]{64}$/.test(value)) throw new TypeError("Expected a lowercase bytes32.");
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
      number: "124471500",
      hash: hex32(204),
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
  if (definition === undefined) throw new TypeError("Invalid direct-call fixture index.");
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

function delegatecallBoundaryBody() {
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
    delegatecallBoundaryArtifact: descriptor("denied-multicalls", delegatecallBoundaryBody(), 4)
  };
}

function expectedFullReviewId(
  observation: unknown,
  completion: unknown,
  batch: unknown,
  expectedSelectorReviewId: Hex,
  attestedAt = ATTESTED_AT
): Hex {
  const clock = () => new Date(NOW);
  const source = buildPancakeV3TestnetManagerSourceReview(observation, {
    now: clock,
    trustedReviewCompletion: completion
  });
  if (source.status !== "source_review_ready_attestation_blocked") {
    throw new TypeError("Expected a valid source fixture.");
  }
  const selector = buildPancakeV3SelectorArtifactReview(batch, {
    now: clock,
    expectedReviewId: expectedSelectorReviewId,
    expectedReviewerIdentity: REVIEWER,
    expectedRetrieverIdentity: RETRIEVER
  });
  if (selector.status !== "selector_assessment_ready_attestation_still_blocked") {
    throw new TypeError("Expected a valid selector fixture.");
  }
  const assessment = pancakeV3SelectorCallPathAssessmentSchema.parse(selector.assessment);
  const target = source.target;
  const block = source.provenance.freshObservation.block;
  const manifest: WriteTargetAttestationManifest = {
    schemaVersion: WRITE_TARGET_ATTESTATION_SCHEMA_VERSION,
    chainId: 97,
    environment: "testnet",
    canonicalBlock: { number: block.number, hash: block.hash, timestamp: block.timestamp },
    attestedAt,
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
    throw new TypeError("Expected a valid source fixture.");
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

function fixture() {
  const observation = exactBlockObservation();
  const completion = trustedSourceReviewCompletion();
  const batch = selectorBatch();
  const expectedSelectorReviewId = derivePancakeV3SelectorArtifactReviewId(batch);
  if (expectedSelectorReviewId === null) throw new TypeError("Expected valid selector fixtures.");
  const expectedWriteTargetReviewId = expectedFullReviewId(
    observation,
    completion,
    batch,
    expectedSelectorReviewId
  );
  const expectedObservation = observationTrustRoots(observation, completion);
  return {
    observation,
    completion,
    batch,
    options: {
      now: () => new Date(NOW),
      trustedSourceReviewCompletion: completion,
      ...expectedObservation,
      expectedSelectorReviewId,
      expectedSelectorReviewerIdentity: REVIEWER,
      expectedSelectorRetrieverIdentity: RETRIEVER,
      expectedWriteTargetReviewId,
      expectedAttestedAt: ATTESTED_AT
    }
  };
}

function upstreamCodes(
  result: ReturnType<typeof buildPancakeV3TestnetWriteTargetAttestation>
): readonly (string | null)[] {
  return result.issues.map(({ upstreamCode }) => upstreamCode);
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>)) {
    expectDeepFrozen(child, seen);
  }
}

describe("Pancake V3 server-only write-target attestation composer", () => {
  it("composes the exact domain v2 selector-scoped attestation without authorizing execution", () => {
    const input = fixture();
    const result = buildPancakeV3TestnetWriteTargetAttestation(
      input.observation,
      input.batch,
      input.options
    );

    expect(result.status).toBe("write_target_attestation_ready_execution_still_blocked");
    if (result.status !== "write_target_attestation_ready_execution_still_blocked") return;
    expect(result.attestation).toMatchObject({
      schemaVersion: 2,
      chainId: 97,
      environment: "testnet",
      canonicalBlock: {
        number: input.observation.block.number,
        hash: input.observation.block.hash,
        timestamp: BLOCK_TIMESTAMP
      },
      attestedAt: ATTESTED_AT,
      reviewId: input.options.expectedWriteTargetReviewId,
      target: { code: { address: MANAGER, runtimeCodeHash: MANAGER_RUNTIME } },
      proxyAssessment: {
        kind: "non_proxy",
        decision: "independently_reviewed_non_proxy_selector_scoped",
        targetAddress: MANAGER,
        selectorCallPathAssessment: {
          allowedDirectCalls: [
            { operation: "mint", selector: "0x88316456" },
            { operation: "increaseLiquidity", selector: "0x219f5d17" },
            { operation: "decreaseLiquidity", selector: "0x0c49ccbe" },
            { operation: "collect", selector: "0xfc6f7865" }
          ],
          delegatecallBoundary: {
            classification: "known_self_delegatecall_dispatcher_present",
            unlistedSelectors: "denied",
            nestedCalldata: "denied"
          }
        }
      }
    });
    expect(result.effectiveTarget).toMatchObject({
      chainId: 97,
      address: MANAGER,
      runtimeCodeHash: MANAGER_RUNTIME,
      proxyKind: "none",
      reviewId: input.options.expectedWriteTargetReviewId
    });
    expect(result.provenance.exactBlockObservationReviewId).toBe(
      input.options.expectedExactBlockObservationReviewId
    );
    expect(result.boundary).toEqual({
      writeTargetSourceAndSelectorAttested: true,
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
    });
    expect(result.issues).toEqual([]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expectDeepFrozen(result);
  });

  it("captures the external clock exactly once and never performs a global fetch", () => {
    const input = fixture();
    const now = vi.fn(() => new Date(NOW));
    const fetchSpy = vi.fn(() => {
      throw new Error("Network access is forbidden in the composer.");
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const result = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
        ...input.options,
        now
      });
      expect(result.status).toBe("write_target_attestation_ready_execution_still_blocked");
      expect(now).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects option accessors without invoking them", () => {
    const input = fixture();
    let invoked = false;
    const options = { ...input.options };
    Object.defineProperty(options, "now", {
      enumerable: true,
      get() {
        invoked = true;
        return () => new Date(NOW);
      }
    });
    const result = buildPancakeV3TestnetWriteTargetAttestation(
      input.observation,
      input.batch,
      options
    );
    expect(invoked).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual([expect.objectContaining({ code: "OPTIONS_INVALID" })]);
    expectDeepFrozen(result);
  });

  it("rejects invalid ordinary-Date clocks and extra option fields", () => {
    const input = fixture();
    class DerivedDate extends Date {}
    const derivedClock = buildPancakeV3TestnetWriteTargetAttestation(
      input.observation,
      input.batch,
      { ...input.options, now: () => new DerivedDate(NOW) }
    );
    expect(derivedClock.issues).toEqual([
      expect.objectContaining({ code: "CLOCK_INVALID", path: "options.now" })
    ]);

    const extraOptions = { ...input.options, requestControlledOverride: true };
    const extra = buildPancakeV3TestnetWriteTargetAttestation(
      input.observation,
      input.batch,
      extraOptions
    );
    expect(extra.issues).toEqual([expect.objectContaining({ code: "OPTIONS_INVALID" })]);
  });

  it("blocks source observation accessors without invoking them", () => {
    const input = fixture();
    let invoked = false;
    Object.defineProperty(input.observation.contracts.manager, "runtimeCodeHash", {
      enumerable: true,
      get() {
        invoked = true;
        return MANAGER_RUNTIME;
      }
    });
    const result = buildPancakeV3TestnetWriteTargetAttestation(
      input.observation,
      input.batch,
      input.options
    );
    expect(invoked).toBe(false);
    expect(result.status).toBe("blocked");
    expect(upstreamCodes(result)).toContain("INPUT_UNSAFE");
    expect(result.boundary.executionAuthorized).toBe(false);
  });

  it("blocks selector-batch accessors without invoking them", () => {
    const input = fixture();
    let invoked = false;
    Object.defineProperty(input.batch.selectorArtifacts[0], "rawBodyUtf8", {
      enumerable: true,
      get() {
        invoked = true;
        return "{}\n";
      }
    });
    const result = buildPancakeV3TestnetWriteTargetAttestation(
      input.observation,
      input.batch,
      input.options
    );
    expect(invoked).toBe(false);
    expect(result.status).toBe("blocked");
    expect(upstreamCodes(result)).toContain("INPUT_UNSAFE");
  });

  it("blocks missing authenticated source review completion", () => {
    const input = fixture();
    const result = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
      ...input.options,
      trustedSourceReviewCompletion: null
    });
    expect(result.status).toBe("blocked");
    expect(upstreamCodes(result)).toContain("REVIEW_COMPLETION_INVALID");
    expect(result.provenance).toBeNull();
  });

  it("blocks runtime, proxy-slot, and stale-block observation drift", () => {
    const runtime = fixture();
    runtime.observation.contracts.manager.runtimeCodeHash = hex32(301);
    expect(
      upstreamCodes(
        buildPancakeV3TestnetWriteTargetAttestation(
          runtime.observation,
          runtime.batch,
          runtime.options
        )
      )
    ).toContain("OBSERVATION_INVALID");

    const proxy = fixture();
    proxy.observation.managerEip1967Slots.implementation.value = hex32(1);
    expect(
      upstreamCodes(
        buildPancakeV3TestnetWriteTargetAttestation(proxy.observation, proxy.batch, proxy.options)
      )
    ).toContain("OBSERVATION_INVALID");

    const stale = fixture();
    stale.observation.block.timestamp = "2026-08-11T16:20:00.000Z";
    stale.observation.observedAt = "2026-08-11T16:20:10.000Z";
    expect(
      upstreamCodes(
        buildPancakeV3TestnetWriteTargetAttestation(stale.observation, stale.batch, stale.options)
      )
    ).toContain("BLOCK_STALE");
  });

  it("blocks selector content mutation and a caller-forged pre-evaluated assessment", () => {
    const mutated = fixture();
    const firstArtifact = mutated.batch.selectorArtifacts[0];
    if (firstArtifact === undefined) throw new TypeError("Missing selector fixture.");
    firstArtifact.rawBodyUtf8 = `${firstArtifact.rawBodyUtf8} `;
    const content = buildPancakeV3TestnetWriteTargetAttestation(
      mutated.observation,
      mutated.batch,
      mutated.options
    );
    expect(content.status).toBe("blocked");
    expect(upstreamCodes(content)).toContain("BODY_SHA256_MISMATCH");

    const forged = fixture();
    const selector = buildPancakeV3SelectorArtifactReview(forged.batch, {
      now: () => new Date(NOW),
      expectedReviewId: forged.options.expectedSelectorReviewId,
      expectedReviewerIdentity: REVIEWER,
      expectedRetrieverIdentity: RETRIEVER
    });
    if (selector.status !== "selector_assessment_ready_attestation_still_blocked") {
      throw new TypeError("Expected valid selector fixture.");
    }
    const result = buildPancakeV3TestnetWriteTargetAttestation(
      forged.observation,
      selector.assessment,
      forged.options
    );
    expect(result.status).toBe("blocked");
    expect(upstreamCodes(result)).toContain("BATCH_INVALID");
  });

  it("requires the exact server-held selector review and independent identities", () => {
    const input = fixture();
    const wrongId = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
      ...input.options,
      expectedSelectorReviewId: hex32(401)
    });
    expect(upstreamCodes(wrongId)).toContain("REVIEW_NOT_TRUSTED");

    const sameIdentity = buildPancakeV3TestnetWriteTargetAttestation(
      input.observation,
      input.batch,
      {
        ...input.options,
        expectedSelectorRetrieverIdentity: REVIEWER
      }
    );
    expect(upstreamCodes(sameIdentity)).toContain("REVIEW_NOT_TRUSTED");
  });

  it("binds the complete manifest and attested-at value to a separate full-review trust root", () => {
    const input = fixture();
    const wrongReview = buildPancakeV3TestnetWriteTargetAttestation(
      input.observation,
      input.batch,
      { ...input.options, expectedWriteTargetReviewId: hex32(402) }
    );
    expect(wrongReview.status).toBe("blocked");
    expect(wrongReview.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "WRITE_TARGET_REVIEW_NOT_TRUSTED" }),
        expect.objectContaining({ upstreamCode: "REVIEW_NOT_TRUSTED" })
      ])
    );

    const attestedAtDrift = buildPancakeV3TestnetWriteTargetAttestation(
      input.observation,
      input.batch,
      { ...input.options, expectedAttestedAt: "2026-08-11T16:29:51.000Z" }
    );
    expect(attestedAtDrift.status).toBe("blocked");
    expect(attestedAtDrift.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "WRITE_TARGET_REVIEW_NOT_TRUSTED" })])
    );
  });

  it("lets domain assessment block cross-builder source-tree binding drift", () => {
    const input = fixture();
    Object.defineProperty(input.completion.sourceTree, "sha256", {
      configurable: true,
      enumerable: true,
      value: hex32(403),
      writable: true
    });
    const expectedSelectorReviewId = input.options.expectedSelectorReviewId;
    const driftedExpectedFullId = expectedFullReviewId(
      input.observation,
      input.completion,
      input.batch,
      expectedSelectorReviewId
    );
    const result = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
      ...input.options,
      trustedSourceReviewCompletion: input.completion,
      expectedWriteTargetReviewId: driftedExpectedFullId
    });
    expect(result.status).toBe("blocked");
    expect(upstreamCodes(result)).toContain("SELECTOR_PATH_BINDING_MISMATCH");
  });

  it("lets domain assessment block selector analysis performed after the source review", () => {
    const input = fixture();
    input.completion.independentReview.reviewedAt = "2026-08-11T15:42:00.000Z";
    input.completion.controlPathReview.reviewedAt = "2026-08-11T15:42:00.000Z";
    const driftedExpectedFullId = expectedFullReviewId(
      input.observation,
      input.completion,
      input.batch,
      input.options.expectedSelectorReviewId
    );
    const result = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
      ...input.options,
      trustedSourceReviewCompletion: input.completion,
      expectedWriteTargetReviewId: driftedExpectedFullId
    });
    expect(result.status).toBe("blocked");
    expect(upstreamCodes(result)).toContain("SELECTOR_PATH_TIME_INVALID");
  });

  it("blocks cross-seam reviewer, observer, and retriever identity reuse", () => {
    const input = fixture();
    input.completion.independentReview.reviewerIdentity = RETRIEVER;
    const expectedWriteTargetReviewId = expectedFullReviewId(
      input.observation,
      input.completion,
      input.batch,
      input.options.expectedSelectorReviewId
    );
    const result = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
      ...input.options,
      trustedSourceReviewCompletion: input.completion,
      expectedWriteTargetReviewId
    });
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CROSS_REVIEW_INDEPENDENCE_INVALID",
          path: "provenance.identities"
        })
      ])
    );
  });

  it("blocks cross-seam evidence locator or content-address reuse", () => {
    const input = fixture();
    const firstArtifact = input.batch.selectorArtifacts[0];
    if (firstArtifact === undefined) throw new TypeError("Missing selector fixture.");
    input.observation.observer.evidence = {
      locator: { scheme: "https", uri: firstArtifact.locator },
      sha256: firstArtifact.expectedSha256
    };
    const expectedObservation = observationTrustRoots(input.observation, input.completion);
    const result = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
      ...input.options,
      ...expectedObservation
    });
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CROSS_REVIEW_INDEPENDENCE_INVALID",
          path: "provenance.evidence"
        })
      ])
    );
  });

  it("blocks unique but unauthenticated observer identity, URL, and evidence mutations", () => {
    const input = fixture();
    input.observation.observer = {
      id: "caller-forged-independent-observer",
      publicSourceUrl: "https://forged-observer.example/rpc",
      evidence: evidence("caller-forged-observation", 250)
    };
    const result = buildPancakeV3TestnetWriteTargetAttestation(
      input.observation,
      input.batch,
      input.options
    );
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "OBSERVATION_NOT_TRUSTED",
        path: "provenance.sourceReview.freshObservation"
      })
    ]);
  });

  it("canonicalizes default HTTPS ports before evidence-independence comparison", () => {
    const input = fixture();
    const firstArtifact = input.batch.selectorArtifacts[0];
    if (firstArtifact === undefined) throw new TypeError("Missing selector fixture.");
    const artifactUrl = new URL(firstArtifact.locator);
    const defaultPortAlias = `https://${artifactUrl.hostname}:443${artifactUrl.pathname}${artifactUrl.search}`;
    input.observation.observer.evidence.locator.uri = defaultPortAlias;
    const expectedObservation = observationTrustRoots(input.observation, input.completion);
    const result = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
      ...input.options,
      ...expectedObservation
    });
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CROSS_REVIEW_INDEPENDENCE_INVALID",
          path: "provenance.evidence"
        })
      ])
    );
  });

  it("blocks an attestation timestamp that predates public selector re-fetches", () => {
    const input = fixture();
    for (const artifact of input.batch.selectorArtifacts) {
      artifact.retrieval.fetchedAt = "2026-08-11T16:29:55.000Z";
    }
    input.batch.delegatecallBoundaryArtifact.retrieval.fetchedAt = "2026-08-11T16:29:55.000Z";
    const expectedSelectorReviewId = derivePancakeV3SelectorArtifactReviewId(input.batch);
    if (expectedSelectorReviewId === null) throw new TypeError("Expected valid selector fixture.");
    const expectedWriteTargetReviewId = expectedFullReviewId(
      input.observation,
      input.completion,
      input.batch,
      expectedSelectorReviewId
    );
    const result = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
      ...input.options,
      expectedSelectorReviewId,
      expectedWriteTargetReviewId
    });
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ATTESTATION_TIME_INVALID",
          path: "attestation.attestedAt"
        })
      ])
    );
  });

  it("lets domain assessment block a future server-held attestation timestamp", () => {
    const input = fixture();
    const futureAttestedAt = "2026-08-11T16:31:00.000Z";
    const expectedFutureReviewId = expectedFullReviewId(
      input.observation,
      input.completion,
      input.batch,
      input.options.expectedSelectorReviewId,
      futureAttestedAt
    );
    const result = buildPancakeV3TestnetWriteTargetAttestation(input.observation, input.batch, {
      ...input.options,
      expectedAttestedAt: futureAttestedAt,
      expectedWriteTargetReviewId: expectedFutureReviewId
    });
    expect(result.status).toBe("blocked");
    expect(upstreamCodes(result)).toContain("OBSERVATION_TIME_INVALID");
  });
});
