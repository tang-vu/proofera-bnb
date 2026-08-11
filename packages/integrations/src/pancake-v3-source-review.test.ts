import { writeTargetSourceReviewSchema } from "@proofera/domain";
import { describe, expect, it, vi } from "vitest";

import {
  PANCAKE_V3_SOURCE_OBSERVATION_MAX_AGE_SECONDS,
  PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256,
  PANCAKE_V3_TESTNET_SOURCE_RESEARCH,
  buildPancakeV3TestnetManagerSourceReview,
  pancakeV3IndependentSourceObservationSchema
} from "./pancake-v3-source-review";

const NOW = new Date("2026-08-11T15:00:00.000Z");
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

function digest(byte: string): string {
  return `0x${byte.repeat(64)}`;
}

function evidence(name: string, byte: string) {
  return {
    locator: {
      scheme: "https" as const,
      uri: `https://evidence.proofera.example/pancake/${name}.json`
    },
    sha256: digest(byte)
  };
}

function completion() {
  return {
    schemaVersion: 1,
    trustBoundary: "server_owned_authenticated_review_configuration",
    sourceCommit: "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57",
    comparisonCommit: "986847948755cba528324d41be19480731c36c2a",
    sourceTree: {
      captureMethod: "git_archive_tar_from_verified_clean_checkout",
      sha256: digest("1"),
      evidence: evidence("reproducible-build", "5")
    },
    compiler: {
      version: "0.7.6+commit.7338295f",
      binarySha256: "0x9214e06741c5cb51a61d745697c905f37480c0c8da1d5ac69e3bacda0063dfa5",
      binaryKeccak256: "0x4fbd020496c3a9e02c1eeb825d23f4d83d9198c4e21fda19deccdb7e74435edf",
      inputSha256: digest("3"),
      settingsSha256: digest("4"),
      managerArtifactSha256: "0x9e5bca807e38e9e8acadd81c5dec6668f847a7e3397d91b3afed74b066cfbb2a",
      managerBuildInfoSha256: "0x72adeccd4f25257a89d95d3e0f1d8b9b0e5ab8400b2b828bab236b786ae2c7aa",
      runtimeTemplateCodeHash: "0x91d390a2f85270716bdc52a7782842724fee537f3f8c4e282ce31b98eea7807b",
      immutableLinkedRuntimeCodeHash:
        "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7",
      settings: {
        optimizer: { enabled: true, runs: 2_000 },
        viaIr: false,
        evmVersion: "istanbul",
        metadataBytecodeHash: "none"
      }
    },
    verification: {
      verifiedAt: "2026-08-11T14:55:00.000Z",
      evidence: evidence("reproducible-build", "5")
    },
    independentReview: {
      reviewerIdentity: "ProofEra Security Review 2026-08-11",
      reviewedAt: "2026-08-11T14:56:00.000Z",
      decision: "approved_only_for_the_frozen_direct_write_scope",
      evidence: evidence("independent-review", "6")
    },
    controlPathReview: {
      reviewedAt: "2026-08-11T14:56:00.000Z",
      evidence: evidence("independent-review", "6"),
      directWriteScopeSha256: PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256,
      reachableSelfDelegatecallReviewed: true,
      everyMulticallSelectorDenied: true,
      allUnlistedSelectorsDenied: true,
      domainNoReachableDelegatecallModelCompatible: false
    }
  };
}

function observation() {
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
      evidence: evidence("fresh-exact-block-observation", "8")
    },
    block: {
      number: "124471500",
      hash: digest("9"),
      timestamp: "2026-08-11T14:59:30.000Z",
      requireCanonical: true
    },
    observedAt: "2026-08-11T14:59:40.000Z",
    contracts: {
      manager: {
        address: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
        runtimeByteLength: 24_466,
        runtimeCodeHash: "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7"
      },
      factory: {
        address: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
        runtimeByteLength: 5_151,
        runtimeCodeHash: "0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c"
      },
      deployer: {
        address: "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
        runtimeByteLength: 24_556,
        runtimeCodeHash: "0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b"
      }
    },
    managerImmutables: {
      deployer: "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
      factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
      wrappedNative: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
      tokenDescriptor: "0xb099b459887bC759dBF0293E12D3DFcD0C456cff",
      nameHash: "0xc8147ae4d95e1ae5d91d5822a926bbc8b3167bc4efcba3aad25887e8d7e1ada0",
      versionHash: "0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6"
    },
    managerEip1967Slots: {
      implementation: {
        slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
        value: ZERO_BYTES32
      },
      admin: {
        slot: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
        value: ZERO_BYTES32
      },
      beacon: {
        slot: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
        value: ZERO_BYTES32
      }
    },
    latestTagUsed: false,
    blockNumberFallbackUsed: false
  };
}

function jsonClone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function setPath(root: unknown, path: readonly string[], value: unknown): void {
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor)) {
      throw new TypeError("Fixture path is not an object.");
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor)) {
    throw new TypeError("Fixture path parent is not an object.");
  }
  const finalKey = path.at(-1);
  if (finalKey === undefined) throw new TypeError("Fixture path is empty.");
  (cursor as Record<string, unknown>)[finalKey] = value;
}

function build(observationInput: unknown = observation(), completionInput: unknown = completion()) {
  return buildPancakeV3TestnetManagerSourceReview(observationInput, {
    now: () => new Date(NOW),
    trustedReviewCompletion: completionInput
  });
}

describe("Pancake V3 reviewed-source boundary", () => {
  it("retains exact official-source facts without claiming static readiness", () => {
    expect(PANCAKE_V3_TESTNET_SOURCE_RESEARCH).toMatchObject({
      claimStatus: "static_research_incomplete_not_activation_ready",
      initialDeploymentAndSourceCommit: "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57",
      comparisonCommit: "986847948755cba528324d41be19480731c36c2a",
      comparisonFinding: "relevant_files_byte_identical",
      canonicalHistoricalObservation: {
        blockNumber: "124471044",
        blockHash: "0x214d1b1b3f7c724d32812c6829034dff989ff7e61dc580e46c5134053fb5aca6",
        reusableAsFreshObservation: false
      }
    });
    expect(PANCAKE_V3_TESTNET_SOURCE_RESEARCH.unclassifiedSourceArchive).toEqual({
      sha256: "0xfa9d8efea22eec90b3cffce9f47a602af3b3aef539d2c2258faf3b87ff510fe8",
      format: null,
      locator: null,
      captureCommand: null,
      eligibleAsDomainSourceTreeDigest: false
    });
    expect(PANCAKE_V3_TESTNET_SOURCE_RESEARCH.missingBeforeSourceReviewCanBeEmitted).toContain(
      "compiler_input_sha256"
    );
    expect(Object.isFrozen(PANCAKE_V3_TESTNET_SOURCE_RESEARCH)).toBe(true);
    expect(Object.isFrozen(PANCAKE_V3_TESTNET_SOURCE_RESEARCH.deployment.manager)).toBe(true);
    expect(() => {
      (PANCAKE_V3_TESTNET_SOURCE_RESEARCH.deployment.manager as { address: string }).address =
        "0x0000000000000000000000000000000000000001";
    }).toThrow();
  });

  it("keeps descriptor metadata and the third-party position, pool, and tokens outside write eligibility", () => {
    expect(PANCAKE_V3_TESTNET_SOURCE_RESEARCH.descriptorBoundary).toMatchObject({
      kind: "eip1967_proxy",
      role: "token_uri_metadata_only",
      metadataTrusted: false,
      eligibleAsManagerWriteTarget: false,
      implementationSourceReviewedForWrites: false
    });
    expect(PANCAKE_V3_TESTNET_SOURCE_RESEARCH.thirdPartyReadFixtureBoundary).toMatchObject({
      positionId: "36761",
      prooferaControlsPosition: false,
      activationEligible: false,
      pool: { writeEligible: false },
      token0: { completeRuntimeCodeHashRetained: false, writeEligible: false },
      token1: { completeRuntimeCodeHashRetained: false, writeEligible: false }
    });
  });

  it("blocks static research or an observation alone when authenticated review completion is absent", () => {
    const result = build(observation(), null);
    expect(result).toMatchObject({
      status: "blocked",
      sourceReview: null,
      target: null,
      provenance: null,
      boundary: {
        sourceReviewEmitted: false,
        domainWriteTargetAttestationReady: false,
        executionAuthorized: false
      }
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REVIEW_COMPLETION_INVALID" })])
    );
  });

  it("emits a domain-valid reviewed target only after trusted completion and a fresh exact observation", () => {
    const parsedObservation = pancakeV3IndependentSourceObservationSchema.safeParse(observation());
    expect(
      parsedObservation.success,
      parsedObservation.success ? undefined : JSON.stringify(parsedObservation.error.issues)
    ).toBe(true);
    const result = build();
    expect(result.status).toBe("source_review_ready_attestation_blocked");
    if (result.status !== "source_review_ready_attestation_blocked") return;

    expect(writeTargetSourceReviewSchema.safeParse(result.sourceReview).success).toBe(true);
    expect(result.target).toMatchObject({
      code: {
        blockNumber: "124471500",
        address: "0x427bf5b37357632377ecbec9de3626c71a5396c1",
        runtimeCodeHash: "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7"
      },
      sourceReview: {
        source: {
          repositoryUrl: "https://github.com/pancakeswap/pancake-v3-contracts",
          commit: "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57"
        },
        compiler: {
          version: "0.7.6+commit.7338295f",
          optimizer: { enabled: true, runs: 2_000 },
          evmVersion: "istanbul",
          metadataBytecodeHash: "none"
        },
        verification: {
          kind: "reproducible_build",
          claim: "runtime_bytecode_exact_match",
          evidence: {
            locator: {
              uri: "https://evidence.proofera.example/pancake/reproducible-build.json"
            }
          }
        },
        independentReview: {
          methodology: "manual_source_build_and_control_path_review",
          writeScopeSha256: PANCAKE_V3_TESTNET_DIRECT_WRITE_SCOPE_SHA256
        }
      }
    });
    expect(result.boundary).toMatchObject({
      sourceReviewEmitted: true,
      domainWriteTargetAttestationReady: false,
      executionAuthorized: false,
      managerHasReachableSelfDelegatecall: true,
      multicallMustRemainDenied: true,
      domainNoReachableDelegatecallModelCompatible: false
    });
    expect(result.provenance).toMatchObject({
      sourceRepository: "https://github.com/pancakeswap/pancake-v3-contracts",
      sourceCommit: "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57",
      retainedResearchEvidencePath:
        "evidence/development/pancake-v3-source-reproduction-2026-08-11.json",
      reproducibleBuildEvidence: {
        locator: {
          uri: "https://evidence.proofera.example/pancake/reproducible-build.json"
        }
      },
      independentControlPathReviewEvidence: {
        locator: {
          uri: "https://evidence.proofera.example/pancake/independent-review.json"
        }
      },
      freshObservation: {
        method: "eip1898_canonical_block_hash_without_latest_or_number_fallback",
        observer: {
          id: "independent-bsc-testnet-observer-1",
          publicSourceUrl: "https://bsc-testnet-rpc.publicnode.com",
          evidence: {
            locator: {
              uri: "https://evidence.proofera.example/pancake/fresh-exact-block-observation.json"
            }
          }
        },
        latestTagUsed: false,
        blockNumberFallbackUsed: false
      }
    });
    expect("proxyAssessment" in result).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.target.sourceReview.compiler)).toBe(true);
    expect(Object.isFrozen(result.provenance.freshObservation.observer)).toBe(true);
  });

  it("rejects every observed deployment, immutable, storage, and fallback drift", () => {
    const cases: readonly [readonly string[], unknown][] = [
      [["chainId"], 56],
      [["method"], "eth_getCode_latest"],
      [["contracts", "manager", "address"], "0x0000000000000000000000000000000000000001"],
      [["contracts", "manager", "runtimeByteLength"], 24_465],
      [["contracts", "manager", "runtimeCodeHash"], digest("a")],
      [["contracts", "factory", "runtimeCodeHash"], digest("b")],
      [["contracts", "deployer", "runtimeCodeHash"], digest("c")],
      [["managerImmutables", "factory"], "0x0000000000000000000000000000000000000002"],
      [["managerImmutables", "deployer"], "0x0000000000000000000000000000000000000003"],
      [["managerImmutables", "wrappedNative"], "0x0000000000000000000000000000000000000004"],
      [["managerImmutables", "tokenDescriptor"], "0x0000000000000000000000000000000000000005"],
      [["managerImmutables", "nameHash"], digest("d")],
      [["managerImmutables", "versionHash"], digest("e")],
      [["managerEip1967Slots", "implementation", "value"], digest("f")],
      [["latestTagUsed"], true],
      [["blockNumberFallbackUsed"], true]
    ];

    for (const [path, value] of cases) {
      const candidate = jsonClone(observation());
      setPath(candidate, path, value);
      const result = build(candidate);
      expect(result.status, path.join(".")).toBe("blocked");
      expect(result.issues, path.join(".")).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "OBSERVATION_INVALID" })])
      );
    }
  });

  it("rejects source, compiler, build, scope, and control-path review drift", () => {
    const cases: readonly [readonly string[], unknown][] = [
      [["sourceCommit"], "0000000000000000000000000000000000000000"],
      [["comparisonCommit"], "0000000000000000000000000000000000000000"],
      [["sourceTree", "captureMethod"], "downloaded_archive"],
      [["compiler", "version"], "0.7.5+commit.eb77ed08"],
      [["compiler", "binarySha256"], digest("a")],
      [["compiler", "managerArtifactSha256"], digest("b")],
      [["compiler", "managerBuildInfoSha256"], digest("c")],
      [["compiler", "runtimeTemplateCodeHash"], digest("d")],
      [["compiler", "immutableLinkedRuntimeCodeHash"], digest("e")],
      [["compiler", "settings", "optimizer", "runs"], 200],
      [["compiler", "settings", "evmVersion"], "berlin"],
      [["compiler", "settings", "metadataBytecodeHash"], "ipfs"],
      [["controlPathReview", "directWriteScopeSha256"], digest("f")],
      [["controlPathReview", "reachableSelfDelegatecallReviewed"], false],
      [["controlPathReview", "everyMulticallSelectorDenied"], false],
      [["controlPathReview", "domainNoReachableDelegatecallModelCompatible"], true]
    ];

    for (const [path, value] of cases) {
      const candidate = jsonClone(completion());
      setPath(candidate, path, value);
      const result = build(observation(), candidate);
      expect(result.status, path.join(".")).toBe("blocked");
      expect(result.issues, path.join(".")).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "REVIEW_COMPLETION_INVALID" })])
      );
    }
  });

  it("requires distinct, retained compiler/source digests and rejects unknown fields", () => {
    const duplicate = completion();
    duplicate.compiler.inputSha256 = duplicate.sourceTree.sha256;
    expect(build(observation(), duplicate).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REVIEW_COMPLETION_INVALID" })])
    );

    const extra = jsonClone(completion()) as Record<string, unknown>;
    extra.approved = true;
    expect(build(observation(), extra).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REVIEW_COMPLETION_INVALID" })])
    );

    const detachedSourceEvidence = completion();
    detachedSourceEvidence.sourceTree.evidence = evidence("detached-source-tree", "2");
    expect(build(observation(), detachedSourceEvidence).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REVIEW_COMPLETION_INVALID" })])
    );

    const detachedControlReview = completion();
    detachedControlReview.controlPathReview.evidence = evidence("detached-control-path", "7");
    expect(build(observation(), detachedControlReview).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REVIEW_COMPLETION_INVALID" })])
    );
  });

  it("rejects stale, future, and incorrectly ordered observations", () => {
    const stale = observation();
    stale.block.timestamp = new Date(
      NOW.getTime() - (PANCAKE_V3_SOURCE_OBSERVATION_MAX_AGE_SECONDS + 1) * 1_000
    ).toISOString();
    expect(build(stale).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "BLOCK_STALE" })])
    );

    const future = observation();
    future.block.timestamp = "2026-08-11T15:00:01.000Z";
    future.observedAt = "2026-08-11T15:00:02.000Z";
    expect(build(future).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "BLOCK_FROM_FUTURE" }),
        expect.objectContaining({ code: "OBSERVATION_TIME_INVALID" })
      ])
    );

    const beforeReview = observation();
    beforeReview.block.timestamp = "2026-08-11T14:55:30.000Z";
    beforeReview.observedAt = "2026-08-11T14:55:40.000Z";
    expect(build(beforeReview).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REVIEW_TIME_INVALID" })])
    );
  });

  it("requires observation evidence independent from every build and review artifact", () => {
    const candidate = observation();
    candidate.observer.evidence = completion().verification.evidence;
    const result = build(candidate);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "EVIDENCE_NOT_INDEPENDENT" })])
    );
  });

  it("rejects accessors without invoking them and contains thrown clocks", () => {
    const getter = vi.fn(() => 97);
    const candidate = observation();
    Object.defineProperty(candidate, "chainId", { enumerable: true, get: getter });
    const unsafe = build(candidate);
    expect(getter).not.toHaveBeenCalled();
    expect(unsafe.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "INPUT_UNSAFE" })])
    );

    const clockFailure = buildPancakeV3TestnetManagerSourceReview(observation(), {
      now: () => {
        throw new Error("clock secret must not escape");
      },
      trustedReviewCompletion: completion()
    });
    expect(clockFailure.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "CLOCK_INVALID" })])
    );
    expect(JSON.stringify(clockFailure)).not.toContain("clock secret");
  });
});
