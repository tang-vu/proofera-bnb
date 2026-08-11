import { describe, expect, it } from "vitest";

import {
  EIP1967_ADMIN_SLOT,
  EIP1967_BEACON_IMPLEMENTATION_SELECTOR,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  EVM_EMPTY_RUNTIME_CODE_HASH,
  PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD,
  PROOFERA_PANCAKE_V3_DENIED_MULTICALLS,
  PROOFERA_PANCAKE_V3_DIRECT_CALLS,
  WRITE_TARGET_ATTESTATION_SCHEMA_VERSION,
  assessWriteTargetAttestation,
  deriveWriteTargetReviewId,
  type AssessWriteTargetAttestationOptions,
  type WriteTargetAttestation,
  type WriteTargetAttestationIssueCode,
  type WriteTargetAttestationManifest,
  type WriteTargetAttestationResult,
  type WriteTargetSourceReview
} from "./write-target-attestation";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const BLOCK_NUMBER = "42000000";
const BLOCK_HASH = hex32("40");
const TARGET = "0x1111111111111111111111111111111111111111";
const IMPLEMENTATION = "0x2222222222222222222222222222222222222222";
const ADMIN = "0x3333333333333333333333333333333333333333";
const BEACON = "0x4444444444444444444444444444444444444444";
const BEACON_AUTHORITY = "0x5555555555555555555555555555555555555555";
const TARGET_HASH = hex32("10");
const IMPLEMENTATION_HASH = hex32("20");
const BEACON_HASH = hex32("30");
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

function hex32(byte: string): string {
  return `0x${byte.repeat(32)}`;
}

function addressSlot(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2)}`;
}

function evidence(seed: string, scheme: "https" | "ipfs" = "https") {
  return {
    locator:
      scheme === "https"
        ? {
            scheme: "https" as const,
            uri: `https://evidence.proofera.example/reviews/${seed}.json`
          }
        : {
            scheme: "ipfs" as const,
            uri: `ipfs://bafy${"a".repeat(52)}/${seed}.json`
          },
    sha256: hex32(seed.slice(0, 2).padEnd(2, "0"))
  };
}

function sourceReview(
  runtimeCodeHash: string,
  seed: string,
  reviewScheme: "https" | "ipfs" = "ipfs"
): WriteTargetSourceReview {
  return {
    runtimeCodeHash,
    source: {
      repositoryUrl: "https://github.com/proofera-fi/reviewed-contracts",
      commit: "abcdef0123456789abcdef0123456789abcdef01",
      artifactPath: `artifacts/${seed}/ReviewedContract.json`,
      contractName: "ReviewedContract",
      sourceTreeSha256: hex32("61")
    },
    compiler: {
      name: "solc",
      version: "0.8.26+commit.8a97fa7a",
      compilerInputSha256: hex32("62"),
      compilerSettingsSha256: hex32("63"),
      outputArtifactSha256: hex32("64"),
      outputRuntimeCodeHash: runtimeCodeHash,
      optimizer: { enabled: true, runs: 200 },
      viaIr: false,
      evmVersion: "cancun",
      metadataBytecodeHash: "ipfs"
    },
    verification: {
      kind: "reproducible_build",
      claim: "runtime_bytecode_exact_match",
      runtimeCodeHash,
      verifiedAt: "2026-08-01T00:00:00.000Z",
      evidence: evidence("65")
    },
    independentReview: {
      decision: "approved_for_exact_scoped_writes",
      methodology: "manual_source_build_and_control_path_review",
      reviewerIdentity: "ProofEra Security Review 2026-08",
      reviewedAt: "2026-08-02T00:00:00.000Z",
      runtimeCodeHash,
      writeScopeSha256: hex32("66"),
      evidence: evidence("67", reviewScheme)
    }
  };
}

function reviewedContract(address: string, runtimeCodeHash: string, seed: string) {
  return {
    code: {
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      address,
      runtimeCodeHash,
      observedAt: "2026-08-11T11:59:35.000Z"
    },
    sourceReview: sourceReview(runtimeCodeHash, seed)
  };
}

function baseManifest(): WriteTargetAttestationManifest {
  return {
    schemaVersion: WRITE_TARGET_ATTESTATION_SCHEMA_VERSION,
    chainId: 97,
    environment: "testnet",
    canonicalBlock: {
      number: BLOCK_NUMBER,
      hash: BLOCK_HASH,
      timestamp: "2026-08-11T11:59:30.000Z"
    },
    attestedAt: "2026-08-11T11:59:45.000Z",
    target: reviewedContract(TARGET, TARGET_HASH, "target"),
    proxyAssessment: {
      kind: "non_proxy",
      decision: "independently_reviewed_non_proxy",
      delegatecallReachability: "no_reachable_delegatecall",
      targetAddress: TARGET,
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      runtimeCodeHash: TARGET_HASH,
      observedAt: "2026-08-11T11:59:40.000Z",
      evidence: evidence("68")
    }
  };
}

function selectorScopedManifest(): WriteTargetAttestationManifest {
  const manifest = baseManifest();
  const sourceReview = manifest.target.sourceReview;
  const bindings = {
    runtimeCodeHash: manifest.target.code.runtimeCodeHash,
    sourceTreeSha256: sourceReview.source.sourceTreeSha256,
    compilerOutputArtifactSha256: sourceReview.compiler.outputArtifactSha256,
    writeScopeSha256: sourceReview.independentReview.writeScopeSha256
  } as const;
  const directCall = <const Definition extends (typeof PROOFERA_PANCAKE_V3_DIRECT_CALLS)[number]>(
    definition: Definition,
    artifactSeed: string,
    sourcePathSeed: string,
    bytecodePathSeed: string
  ) => ({
    ...definition,
    decision: "allowed_direct_entrypoint" as const,
    analyzedAt: "2026-08-01T12:00:00.000Z",
    method: { ...PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD },
    bindings: { ...bindings },
    reachability: {
      controlFlowCoverage: "all_branches_resolved" as const,
      delegatecall: "unreachable" as const,
      arbitraryDispatcher: "unreachable" as const,
      unknownPaths: "none" as const
    },
    analysisArtifact: evidence(artifactSeed),
    sourcePathSha256: hex32(sourcePathSeed),
    bytecodePathSha256: hex32(bytecodePathSeed)
  });
  const deniedMulticall = <
    const Definition extends (typeof PROOFERA_PANCAKE_V3_DENIED_MULTICALLS)[number]
  >(
    definition: Definition
  ) => ({ ...definition, decision: "denied" as const });

  manifest.proxyAssessment = {
    kind: "non_proxy",
    decision: "independently_reviewed_non_proxy_selector_scoped",
    targetAddress: TARGET,
    blockNumber: BLOCK_NUMBER,
    blockHash: BLOCK_HASH,
    runtimeCodeHash: TARGET_HASH,
    observedAt: "2026-08-11T11:59:40.000Z",
    evidence: evidence("68"),
    selectorCallPathAssessment: {
      scope: "pancake_v3_position_manager_direct_calls",
      ...bindings,
      allowedDirectCalls: [
        directCall(PROOFERA_PANCAKE_V3_DIRECT_CALLS[0], "d1", "e1", "f1"),
        directCall(PROOFERA_PANCAKE_V3_DIRECT_CALLS[1], "d2", "e2", "f2"),
        directCall(PROOFERA_PANCAKE_V3_DIRECT_CALLS[2], "d3", "e3", "f3"),
        directCall(PROOFERA_PANCAKE_V3_DIRECT_CALLS[3], "d4", "e4", "f4")
      ],
      delegatecallBoundary: {
        classification: "known_self_delegatecall_dispatcher_present",
        delegatecallProgramCounter: 10_522,
        reviewedSourceLocation:
          "projects/v3-periphery/contracts/base/Multicall.sol#multicall(bytes[])_self_delegatecall",
        runtimeCodeHash: TARGET_HASH,
        compilerOutputArtifactSha256: sourceReview.compiler.outputArtifactSha256,
        reviewedAt: "2026-08-01T12:00:00.000Z",
        analysisArtifact: evidence("dc"),
        deniedMulticalls: [
          deniedMulticall(PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[0]),
          deniedMulticall(PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[1]),
          deniedMulticall(PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[2])
        ],
        unlistedSelectors: "denied",
        nestedCalldata: "denied"
      }
    }
  };
  return manifest;
}

function transparentManifest(): WriteTargetAttestationManifest {
  return {
    ...baseManifest(),
    target: reviewedContract(TARGET, TARGET_HASH, "transparent-proxy"),
    proxyAssessment: {
      kind: "recognized_proxy",
      standard: "eip1967_transparent",
      proxyAddress: TARGET,
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      observedAt: "2026-08-11T11:59:40.000Z",
      evidence: {
        decision: "recognized_standard_and_control_paths_reviewed",
        reviewedAt: "2026-08-02T00:00:00.000Z",
        evidence: evidence("69")
      },
      slots: {
        implementation: {
          blockNumber: BLOCK_NUMBER,
          blockHash: BLOCK_HASH,
          slot: EIP1967_IMPLEMENTATION_SLOT,
          value: addressSlot(IMPLEMENTATION)
        },
        admin: {
          blockNumber: BLOCK_NUMBER,
          blockHash: BLOCK_HASH,
          slot: EIP1967_ADMIN_SLOT,
          value: addressSlot(ADMIN)
        },
        beacon: {
          blockNumber: BLOCK_NUMBER,
          blockHash: BLOCK_HASH,
          slot: EIP1967_BEACON_SLOT,
          value: ZERO_BYTES32
        }
      },
      implementation: reviewedContract(IMPLEMENTATION, IMPLEMENTATION_HASH, "implementation"),
      admin: {
        accountKind: "eoa",
        code: {
          blockNumber: BLOCK_NUMBER,
          blockHash: BLOCK_HASH,
          address: ADMIN,
          runtimeCodeHash: EVM_EMPTY_RUNTIME_CODE_HASH,
          observedAt: "2026-08-11T11:59:35.000Z"
        },
        sourceReview: null
      },
      beacon: null
    }
  };
}

function beaconManifest(): WriteTargetAttestationManifest {
  return {
    ...baseManifest(),
    target: reviewedContract(TARGET, TARGET_HASH, "beacon-proxy"),
    proxyAssessment: {
      kind: "recognized_proxy",
      standard: "eip1967_beacon",
      proxyAddress: TARGET,
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      observedAt: "2026-08-11T11:59:40.000Z",
      evidence: {
        decision: "recognized_standard_and_control_paths_reviewed",
        reviewedAt: "2026-08-02T00:00:00.000Z",
        evidence: evidence("70")
      },
      slots: {
        implementation: {
          blockNumber: BLOCK_NUMBER,
          blockHash: BLOCK_HASH,
          slot: EIP1967_IMPLEMENTATION_SLOT,
          value: ZERO_BYTES32
        },
        admin: {
          blockNumber: BLOCK_NUMBER,
          blockHash: BLOCK_HASH,
          slot: EIP1967_ADMIN_SLOT,
          value: ZERO_BYTES32
        },
        beacon: {
          blockNumber: BLOCK_NUMBER,
          blockHash: BLOCK_HASH,
          slot: EIP1967_BEACON_SLOT,
          value: addressSlot(BEACON)
        }
      },
      implementation: reviewedContract(IMPLEMENTATION, IMPLEMENTATION_HASH, "implementation"),
      admin: null,
      beacon: reviewedContract(BEACON, BEACON_HASH, "beacon"),
      beaconImplementationRead: {
        blockNumber: BLOCK_NUMBER,
        blockHash: BLOCK_HASH,
        beaconAddress: BEACON,
        selector: EIP1967_BEACON_IMPLEMENTATION_SELECTOR,
        returnedImplementationAddress: IMPLEMENTATION,
        evidence: evidence("71")
      },
      beaconUpgradeAuthority: {
        blockNumber: BLOCK_NUMBER,
        blockHash: BLOCK_HASH,
        beaconAddress: BEACON,
        authorityAddress: BEACON_AUTHORITY,
        discoveryMethod: "reviewed_source_control_path",
        authority: {
          accountKind: "eoa",
          code: {
            blockNumber: BLOCK_NUMBER,
            blockHash: BLOCK_HASH,
            address: BEACON_AUTHORITY,
            runtimeCodeHash: EVM_EMPTY_RUNTIME_CODE_HASH,
            observedAt: "2026-08-11T11:59:35.000Z"
          },
          sourceReview: null
        },
        evidence: evidence("72")
      }
    }
  };
}

function attest(manifest: WriteTargetAttestationManifest): WriteTargetAttestation {
  return { ...manifest, reviewId: deriveWriteTargetReviewId(manifest) };
}

function options(expectedReviewId: string): AssessWriteTargetAttestationOptions {
  return { asOf: () => new Date(NOW), expectedReviewId };
}

function assess(attestation: WriteTargetAttestation): WriteTargetAttestationResult {
  return assessWriteTargetAttestation(attestation, options(attestation.reviewId));
}

function expectIssue(
  result: WriteTargetAttestationResult,
  code: WriteTargetAttestationIssueCode,
  path?: string
): void {
  expect(result.status).toBe("blocked");
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code, ...(path === undefined ? {} : { path }) })
    ])
  );
}

function jsonClone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function setPath(root: unknown, path: readonly string[], value: unknown): void {
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    if (cursor === null || typeof cursor !== "object") {
      throw new TypeError("Fixture path is not an object.");
    }
    cursor = (cursor as unknown as Record<string, unknown>)[key];
  }
  if (cursor === null || typeof cursor !== "object") {
    throw new TypeError("Fixture path parent is not an object.");
  }
  const finalKey = path.at(-1);
  if (finalKey === undefined) throw new TypeError("Fixture path is empty.");
  (cursor as unknown as Record<string, unknown>)[finalKey] = value;
}

describe("write-target attestation content addressing", () => {
  it("derives a stable domain-separated review ID independent of object key order", () => {
    const manifest = baseManifest();
    const reversed = Object.fromEntries(Object.entries(manifest).reverse());
    expect(deriveWriteTargetReviewId(reversed)).toBe(deriveWriteTargetReviewId(manifest));
    expect(deriveWriteTargetReviewId(manifest)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("detects a retained review ID after target identity mutation", () => {
    const valid = attest(baseManifest());
    const mutated = jsonClone(valid);
    setPath(mutated, ["target", "code", "address"], "0x9999999999999999999999999999999999999999");
    expectIssue(
      assessWriteTargetAttestation(mutated, options(valid.reviewId)),
      "REVIEW_ID_MISMATCH",
      "attestation.reviewId"
    );
  });

  it("detects retained IDs after compiler settings, artifact, and review-scope mutations", () => {
    const paths: ReadonlyArray<readonly [readonly string[], unknown]> = [
      [["target", "sourceReview", "compiler", "compilerSettingsSha256"], hex32("91")],
      [["target", "sourceReview", "source", "artifactPath"], "artifacts/other/Contract.json"],
      [["target", "sourceReview", "independentReview", "writeScopeSha256"], hex32("92")]
    ];
    for (const [path, value] of paths) {
      const valid = attest(baseManifest());
      const mutated = jsonClone(valid);
      setPath(mutated, path, value);
      expectIssue(
        assessWriteTargetAttestation(mutated, options(valid.reviewId)),
        "REVIEW_ID_MISMATCH"
      );
    }
  });

  it("does not trust a self-consistent review that is absent from the server-held allowlist", () => {
    const trusted = attest(baseManifest());
    const replacementManifest = baseManifest();
    replacementManifest.target.sourceReview.independentReview.writeScopeSha256 = hex32("93");
    const replacement = attest(replacementManifest);
    expect(replacement.reviewId).not.toBe(trusted.reviewId);
    expectIssue(
      assessWriteTargetAttestation(replacement, options(trusted.reviewId)),
      "REVIEW_NOT_TRUSTED",
      "attestation.reviewId"
    );
  });
});

describe("non-proxy readiness", () => {
  it("returns a deeply frozen, JSON-safe attestation boundary without authorizing execution", () => {
    const result = assess(attest(baseManifest()));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready fixture.");
    expect(result.effectiveTarget).toMatchObject({
      chainId: 97,
      address: TARGET,
      runtimeCodeHash: TARGET_HASH,
      effectiveImplementationAddress: TARGET,
      effectiveImplementationRuntimeCodeHash: TARGET_HASH,
      proxyKind: "none"
    });
    expect(result.boundary).toEqual({
      sourceAndProxyAttested: true,
      executionAuthorized: false,
      authorityCreated: false,
      signatureRequested: false,
      transactionSubmitted: false,
      runtimeHashAloneSufficient: false,
      reviewerAuthenticationRequiredUpstream: true,
      scope: "reviewed_write_target_attestation_only"
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.attestation.target.sourceReview.compiler)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("blocks runtime identity without complete source provenance", () => {
    const candidate = jsonClone(attest(baseManifest()));
    const target = candidate.target as unknown as Record<string, unknown>;
    delete target.sourceReview;
    expectIssue(
      assessWriteTargetAttestation(candidate, options(candidate.reviewId)),
      "SOURCE_EVIDENCE_INVALID"
    );
  });

  it("requires an independent review in addition to exact source-verification evidence", () => {
    const candidate = jsonClone(attest(baseManifest()));
    const source = candidate.target.sourceReview as unknown as Record<string, unknown>;
    delete source.independentReview;
    expectIssue(
      assessWriteTargetAttestation(candidate, options(candidate.reviewId)),
      "SOURCE_EVIDENCE_INVALID"
    );
  });

  it("blocks a source/compiler/runtime hash disagreement even under a newly trusted ID", () => {
    const manifest = baseManifest();
    manifest.target.sourceReview.compiler.outputRuntimeCodeHash = hex32("94");
    const candidate = attest(manifest);
    expectIssue(assess(candidate), "SOURCE_HASH_MISMATCH", "attestation.target.sourceReview");
  });

  it("blocks non-proxy evidence that is not bound to the target runtime identity", () => {
    const manifest = baseManifest();
    if (manifest.proxyAssessment.kind !== "non_proxy") throw new Error("Expected non-proxy.");
    manifest.proxyAssessment.runtimeCodeHash = hex32("95");
    const candidate = attest(manifest);
    expectIssue(assess(candidate), "NON_PROXY_BINDING_MISMATCH");
  });

  it("blocks non-proxy evidence that names a different target address", () => {
    const manifest = baseManifest();
    if (manifest.proxyAssessment.kind !== "non_proxy") throw new Error("Expected non-proxy.");
    manifest.proxyAssessment.targetAddress = IMPLEMENTATION;
    expectIssue(assess(attest(manifest)), "NON_PROXY_BINDING_MISMATCH");
  });

  it("blocks every explicit unknown, custom, unrecognized, and delegatecall-ambiguous state", () => {
    const classifications = [
      "unknown",
      "custom_proxy",
      "delegatecall_ambiguous",
      "unrecognized_proxy",
      "eip1967_uups_control_ambiguous"
    ] as const;
    for (const classification of classifications) {
      const manifest = baseManifest();
      manifest.proxyAssessment = {
        kind: "blocked",
        classification,
        targetAddress: TARGET,
        blockNumber: BLOCK_NUMBER,
        blockHash: BLOCK_HASH,
        observedAt: "2026-08-11T11:59:40.000Z",
        evidence: evidence("96")
      };
      expectIssue(assess(attest(manifest)), "PROXY_ASSESSMENT_BLOCKED");
    }
  });
});

describe("Pancake V3 selector-scoped self-delegatecall boundary", () => {
  it("accepts only the four independently reviewed direct paths while denying every multicall", () => {
    const result = assess(attest(selectorScopedManifest()));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected selector-scoped readiness.");
    const proxy = result.attestation.proxyAssessment;
    if (
      proxy.kind !== "non_proxy" ||
      proxy.decision !== "independently_reviewed_non_proxy_selector_scoped"
    )
      throw new Error("Expected selector-scoped non-proxy evidence.");

    expect(
      proxy.selectorCallPathAssessment.allowedDirectCalls.map(({ signature, selector }) => ({
        signature,
        selector
      }))
    ).toEqual(
      PROOFERA_PANCAKE_V3_DIRECT_CALLS.map(({ signature, selector }) => ({
        signature,
        selector
      }))
    );
    expect(
      proxy.selectorCallPathAssessment.delegatecallBoundary.deniedMulticalls.map(
        ({ signature, selector, decision }) => ({ signature, selector, decision })
      )
    ).toEqual(
      PROOFERA_PANCAKE_V3_DENIED_MULTICALLS.map(({ signature, selector }) => ({
        signature,
        selector,
        decision: "denied"
      }))
    );
    expect(result.boundary.executionAuthorized).toBe(false);
  });

  it("blocks selector/signature swaps and duplicate selectors", () => {
    const valid = attest(selectorScopedManifest());
    const swapped = jsonClone(valid);
    setPath(
      swapped,
      ["proxyAssessment", "selectorCallPathAssessment", "allowedDirectCalls", "0", "selector"],
      PROOFERA_PANCAKE_V3_DIRECT_CALLS[1].selector
    );
    setPath(
      swapped,
      ["proxyAssessment", "selectorCallPathAssessment", "allowedDirectCalls", "1", "selector"],
      PROOFERA_PANCAKE_V3_DIRECT_CALLS[0].selector
    );
    expectIssue(
      assessWriteTargetAttestation(swapped, options(valid.reviewId)),
      "SELECTOR_PATH_ASSESSMENT_INVALID"
    );

    const duplicated = jsonClone(valid);
    setPath(
      duplicated,
      ["proxyAssessment", "selectorCallPathAssessment", "allowedDirectCalls", "1", "selector"],
      PROOFERA_PANCAKE_V3_DIRECT_CALLS[0].selector
    );
    expectIssue(
      assessWriteTargetAttestation(duplicated, options(valid.reviewId)),
      "SELECTOR_PATH_ASSESSMENT_INVALID"
    );
  });

  it("blocks omitted selectors and attempts to add multicall to the allowed set", () => {
    const valid = attest(selectorScopedManifest());
    const omitted = jsonClone(valid);
    const omittedCalls = (
      omitted.proxyAssessment as unknown as {
        selectorCallPathAssessment: { allowedDirectCalls: unknown[] };
      }
    ).selectorCallPathAssessment.allowedDirectCalls;
    omittedCalls.pop();
    expectIssue(
      assessWriteTargetAttestation(omitted, options(valid.reviewId)),
      "SELECTOR_PATH_ASSESSMENT_INVALID"
    );

    const added = jsonClone(valid);
    const addedCalls = (
      added.proxyAssessment as unknown as {
        selectorCallPathAssessment: { allowedDirectCalls: Array<Record<string, unknown>> };
      }
    ).selectorCallPathAssessment.allowedDirectCalls;
    addedCalls.push({
      ...addedCalls[0],
      operation: "multicall",
      signature: PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[0].signature,
      selector: PROOFERA_PANCAKE_V3_DENIED_MULTICALLS[0].selector
    });
    expectIssue(
      assessWriteTargetAttestation(added, options(valid.reviewId)),
      "SELECTOR_PATH_ASSESSMENT_INVALID"
    );
  });

  it("content-addresses every per-selector analysis and path digest", () => {
    const paths: ReadonlyArray<readonly string[]> = [
      [
        "proxyAssessment",
        "selectorCallPathAssessment",
        "allowedDirectCalls",
        "0",
        "analysisArtifact",
        "sha256"
      ],
      [
        "proxyAssessment",
        "selectorCallPathAssessment",
        "allowedDirectCalls",
        "1",
        "sourcePathSha256"
      ],
      [
        "proxyAssessment",
        "selectorCallPathAssessment",
        "allowedDirectCalls",
        "2",
        "bytecodePathSha256"
      ]
    ];
    for (const [index, path] of paths.entries()) {
      const valid = attest(selectorScopedManifest());
      const drifted = jsonClone(valid);
      setPath(drifted, path, hex32(`a${index + 1}`));
      expectIssue(
        assessWriteTargetAttestation(drifted, options(valid.reviewId)),
        "REVIEW_ID_MISMATCH"
      );
    }
  });

  it("blocks any allowed path marked delegatecall-reachable, dispatcher-reachable, or unresolved", () => {
    const valid = attest(selectorScopedManifest());
    const reachable = jsonClone(valid);
    setPath(
      reachable,
      [
        "proxyAssessment",
        "selectorCallPathAssessment",
        "allowedDirectCalls",
        "0",
        "reachability",
        "delegatecall"
      ],
      "reachable"
    );
    expectIssue(
      assessWriteTargetAttestation(reachable, options(valid.reviewId)),
      "SELECTOR_PATH_ASSESSMENT_INVALID"
    );

    const dispatcher = jsonClone(valid);
    setPath(
      dispatcher,
      [
        "proxyAssessment",
        "selectorCallPathAssessment",
        "allowedDirectCalls",
        "2",
        "reachability",
        "arbitraryDispatcher"
      ],
      "reachable"
    );
    expectIssue(
      assessWriteTargetAttestation(dispatcher, options(valid.reviewId)),
      "SELECTOR_PATH_ASSESSMENT_INVALID"
    );

    const unknown = jsonClone(valid);
    setPath(
      unknown,
      [
        "proxyAssessment",
        "selectorCallPathAssessment",
        "allowedDirectCalls",
        "1",
        "reachability",
        "unknownPaths"
      ],
      "present"
    );
    expectIssue(
      assessWriteTargetAttestation(unknown, options(valid.reviewId)),
      "SELECTOR_PATH_ASSESSMENT_INVALID"
    );
  });

  it("blocks fresh trusted manifests when the reviewed runtime or source tree drifts", () => {
    const runtimeDrift = selectorScopedManifest();
    const replacementRuntimeHash = hex32("a5");
    setPath(runtimeDrift, ["target", "code", "runtimeCodeHash"], replacementRuntimeHash);
    setPath(runtimeDrift, ["target", "sourceReview", "runtimeCodeHash"], replacementRuntimeHash);
    setPath(
      runtimeDrift,
      ["target", "sourceReview", "compiler", "outputRuntimeCodeHash"],
      replacementRuntimeHash
    );
    setPath(
      runtimeDrift,
      ["target", "sourceReview", "verification", "runtimeCodeHash"],
      replacementRuntimeHash
    );
    setPath(
      runtimeDrift,
      ["target", "sourceReview", "independentReview", "runtimeCodeHash"],
      replacementRuntimeHash
    );
    setPath(runtimeDrift, ["proxyAssessment", "runtimeCodeHash"], replacementRuntimeHash);
    expectIssue(
      assess(attest(runtimeDrift)),
      "SELECTOR_PATH_BINDING_MISMATCH",
      "attestation.proxyAssessment.selectorCallPathAssessment"
    );

    const sourceDrift = selectorScopedManifest();
    setPath(sourceDrift, ["target", "sourceReview", "source", "sourceTreeSha256"], hex32("a6"));
    expectIssue(
      assess(attest(sourceDrift)),
      "SELECTOR_PATH_BINDING_MISMATCH",
      "attestation.proxyAssessment.selectorCallPathAssessment"
    );
  });

  it("requires distinct per-selector evidence artifacts rather than copied path attestations", () => {
    const manifest = selectorScopedManifest();
    if (
      manifest.proxyAssessment.kind !== "non_proxy" ||
      manifest.proxyAssessment.decision !== "independently_reviewed_non_proxy_selector_scoped"
    )
      throw new Error("Expected selector-scoped fixture.");
    manifest.proxyAssessment.selectorCallPathAssessment.allowedDirectCalls[1].analysisArtifact =
      manifest.proxyAssessment.selectorCallPathAssessment.allowedDirectCalls[0].analysisArtifact;
    expectIssue(
      assess(attest(manifest)),
      "SELECTOR_PATH_BINDING_MISMATCH",
      "attestation.proxyAssessment.selectorCallPathAssessment.allowedDirectCalls"
    );
  });
});

describe("recognized proxy readiness", () => {
  it("accepts a transparent proxy only with reviewed proxy/implementation and pinned admin", () => {
    const result = assess(attest(transparentManifest()));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected transparent proxy readiness.");
    expect(result.effectiveTarget).toMatchObject({
      address: TARGET,
      runtimeCodeHash: TARGET_HASH,
      effectiveImplementationAddress: IMPLEMENTATION,
      effectiveImplementationRuntimeCodeHash: IMPLEMENTATION_HASH,
      proxyKind: "eip1967_transparent"
    });
  });

  it("accepts a beacon proxy only with reviewed beacon/implementation and pinned authority", () => {
    const result = assess(attest(beaconManifest()));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected beacon proxy readiness.");
    expect(result.effectiveTarget).toMatchObject({
      address: TARGET,
      effectiveImplementationAddress: IMPLEMENTATION,
      proxyKind: "eip1967_beacon"
    });
  });

  it("detects retained IDs after implementation, admin, and beacon mutations", () => {
    const cases: ReadonlyArray<readonly [WriteTargetAttestation, readonly string[], unknown]> = [
      [
        attest(transparentManifest()),
        ["proxyAssessment", "implementation", "code", "runtimeCodeHash"],
        hex32("a1")
      ],
      [
        attest(transparentManifest()),
        ["proxyAssessment", "admin", "code", "address"],
        "0x7777777777777777777777777777777777777777"
      ],
      [
        attest(beaconManifest()),
        ["proxyAssessment", "beacon", "code", "runtimeCodeHash"],
        hex32("a2")
      ]
    ];
    for (const [valid, path, value] of cases) {
      const mutated = jsonClone(valid);
      setPath(mutated, path, value);
      expectIssue(
        assessWriteTargetAttestation(mutated, options(valid.reviewId)),
        "REVIEW_ID_MISMATCH"
      );
    }
  });

  it("blocks a transparent implementation-slot mutation even when the new manifest is trusted", () => {
    const manifest = transparentManifest();
    if (
      manifest.proxyAssessment.kind !== "recognized_proxy" ||
      manifest.proxyAssessment.standard !== "eip1967_transparent"
    )
      throw new Error("Expected transparent proxy.");
    manifest.proxyAssessment.slots.implementation.value = addressSlot(BEACON);
    expectIssue(assess(attest(manifest)), "PROXY_SLOT_MISMATCH");
  });

  it("blocks a proxy assessment bound to a different outer target", () => {
    const manifest = transparentManifest();
    if (
      manifest.proxyAssessment.kind !== "recognized_proxy" ||
      manifest.proxyAssessment.standard !== "eip1967_transparent"
    )
      throw new Error("Expected transparent proxy.");
    manifest.proxyAssessment.proxyAddress = BEACON;
    expectIssue(assess(attest(manifest)), "PROXY_BLOCK_MISMATCH");
  });

  it("blocks non-standard EIP-1967 slot locations", () => {
    const manifest = transparentManifest();
    if (
      manifest.proxyAssessment.kind !== "recognized_proxy" ||
      manifest.proxyAssessment.standard !== "eip1967_transparent"
    )
      throw new Error("Expected transparent proxy.");
    manifest.proxyAssessment.slots.admin.slot = hex32("a3");
    expectIssue(
      assess(attest(manifest)),
      "PROXY_SLOT_MISMATCH",
      "attestation.proxyAssessment.slots.admin.slot"
    );
  });

  it("blocks proxy component evidence read from a different block", () => {
    const manifest = transparentManifest();
    if (
      manifest.proxyAssessment.kind !== "recognized_proxy" ||
      manifest.proxyAssessment.standard !== "eip1967_transparent"
    )
      throw new Error("Expected transparent proxy.");
    manifest.proxyAssessment.implementation.code.blockHash = hex32("a4");
    expectIssue(
      assess(attest(manifest)),
      "BLOCK_RELATION_INVALID",
      "attestation.proxyAssessment.implementation.code"
    );
  });

  it("blocks slot evidence read from a different canonical block", () => {
    const manifest = transparentManifest();
    if (
      manifest.proxyAssessment.kind !== "recognized_proxy" ||
      manifest.proxyAssessment.standard !== "eip1967_transparent"
    )
      throw new Error("Expected transparent proxy.");
    manifest.proxyAssessment.slots.beacon.blockNumber = "41999999";
    expectIssue(
      assess(attest(manifest)),
      "PROXY_BLOCK_MISMATCH",
      "attestation.proxyAssessment.slots.beacon"
    );
  });

  it("blocks beacon implementation-call and authority relation drift", () => {
    const mutations: ReadonlyArray<readonly [readonly string[], unknown]> = [
      [["proxyAssessment", "beaconImplementationRead", "returnedImplementationAddress"], ADMIN],
      [["proxyAssessment", "beaconImplementationRead", "blockHash"], hex32("a5")],
      [["proxyAssessment", "beaconUpgradeAuthority", "authorityAddress"], ADMIN]
    ];
    for (const [path, value] of mutations) {
      const manifest = beaconManifest();
      setPath(manifest, path, value);
      expectIssue(assess(attest(manifest)), "PROXY_COMPONENT_MISMATCH");
    }
  });

  it("blocks proxy component observations and reviews outside the attestation window", () => {
    const observation = transparentManifest();
    if (
      observation.proxyAssessment.kind !== "recognized_proxy" ||
      observation.proxyAssessment.standard !== "eip1967_transparent"
    )
      throw new Error("Expected transparent proxy.");
    observation.proxyAssessment.implementation.code.observedAt = "2026-08-11T11:59:20.000Z";
    expectIssue(
      assess(attest(observation)),
      "OBSERVATION_TIME_INVALID",
      "attestation.proxyAssessment.implementation.code.observedAt"
    );

    const review = transparentManifest();
    if (
      review.proxyAssessment.kind !== "recognized_proxy" ||
      review.proxyAssessment.standard !== "eip1967_transparent"
    )
      throw new Error("Expected transparent proxy.");
    review.proxyAssessment.evidence.reviewedAt = "2026-08-11T11:59:50.000Z";
    expectIssue(assess(attest(review)), "PROXY_TIME_INVALID");
  });

  it("blocks a contract admin unless its own runtime source is independently reviewed", () => {
    const manifest = transparentManifest();
    const candidate = jsonClone(manifest);
    setPath(candidate, ["proxyAssessment", "admin", "accountKind"], "contract");
    setPath(candidate, ["proxyAssessment", "admin", "code", "runtimeCodeHash"], hex32("a6"));
    setPath(candidate, ["proxyAssessment", "admin", "sourceReview"], null);
    const invalidAttestation = {
      ...(candidate as WriteTargetAttestationManifest),
      reviewId: hex32("a7")
    };
    expectIssue(
      assessWriteTargetAttestation(invalidAttestation, options(invalidAttestation.reviewId)),
      "PROXY_ASSESSMENT_INVALID"
    );
  });
});

describe("freshness, clock, and locator safety", () => {
  it("uses the injected as-of clock exactly once", () => {
    const candidate = attest(baseManifest());
    let calls = 0;
    const result = assessWriteTargetAttestation(candidate, {
      expectedReviewId: candidate.reviewId,
      asOf: () => {
        calls += 1;
        return new Date(NOW);
      }
    });
    expect(result.status).toBe("ready");
    expect(calls).toBe(1);
  });

  it("fails closed when the injected clock throws or returns an invalid value", () => {
    const candidate = attest(baseManifest());
    expectIssue(
      assessWriteTargetAttestation(candidate, {
        expectedReviewId: candidate.reviewId,
        asOf: () => {
          throw new Error("clock unavailable");
        }
      }),
      "CLOCK_INVALID"
    );
    expectIssue(
      assessWriteTargetAttestation(candidate, {
        expectedReviewId: candidate.reviewId,
        asOf: () => new Date(Number.NaN)
      }),
      "CLOCK_INVALID"
    );
  });

  it("blocks future and stale canonical blocks", () => {
    const future = baseManifest();
    future.canonicalBlock.timestamp = "2026-08-11T12:00:01.000Z";
    future.attestedAt = "2026-08-11T12:00:02.000Z";
    expectIssue(assess(attest(future)), "BLOCK_FROM_FUTURE");

    const stale = baseManifest();
    stale.canonicalBlock.timestamp = "2026-08-11T11:57:59.000Z";
    expectIssue(assess(attest(stale)), "BLOCK_STALE");
  });

  it("blocks impossible evidence time order and future source review", () => {
    const impossible = baseManifest();
    impossible.target.code.observedAt = "2026-08-11T11:59:20.000Z";
    expectIssue(assess(attest(impossible)), "OBSERVATION_TIME_INVALID");

    const futureReview = baseManifest();
    futureReview.target.sourceReview.independentReview.reviewedAt = "2026-08-12T00:00:00.000Z";
    expectIssue(assess(attest(futureReview)), "SOURCE_TIME_INVALID");
  });

  it("accepts only explicit HTTPS and canonical CIDv1 IPFS locator schemes", () => {
    const valid = baseManifest();
    valid.target.sourceReview.verification.evidence = evidence("b1", "https");
    valid.target.sourceReview.independentReview.evidence = evidence("b2", "ipfs");
    expect(assess(attest(valid)).status).toBe("ready");

    const invalidLocators = [
      { scheme: "https", uri: "http://evidence.example/review.json" },
      { scheme: "https", uri: "javascript:alert(1)" },
      { scheme: "https", uri: "https://user:secret@evidence.example/review.json" },
      { scheme: "https", uri: "https://evidence.example/review.json#mutable" },
      { scheme: "ipfs", uri: "ipfs://QmLegacyCid/review.json" },
      { scheme: "ipfs", uri: `ipfs://bafy${"a".repeat(52)}/../review.json` },
      { scheme: "data", uri: "data:text/plain,reviewed" }
    ];
    for (const locator of invalidLocators) {
      const candidate = jsonClone(attest(baseManifest()));
      setPath(
        candidate,
        ["target", "sourceReview", "verification", "evidence", "locator"],
        locator
      );
      expectIssue(
        assessWriteTargetAttestation(candidate, options(candidate.reviewId)),
        "LOCATOR_INVALID"
      );
    }
  });
});

describe("untrusted JavaScript object hardening", () => {
  it("rejects an accessor without invoking it", () => {
    const valid = attest(baseManifest());
    let getterCalls = 0;
    const target = jsonClone(valid.target) as unknown as Record<string, unknown>;
    Object.defineProperty(target, "sourceReview", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return valid.target.sourceReview;
      }
    });
    const candidate = { ...valid, target };
    expectIssue(assessWriteTargetAttestation(candidate, options(valid.reviewId)), "INPUT_UNSAFE");
    expect(getterCalls).toBe(0);
  });

  it("rejects hidden fields, symbol keys, custom prototypes, cycles, and non-JSON values", () => {
    const hidden = jsonClone(attest(baseManifest()));
    Object.defineProperty(hidden.target, "shadow", { enumerable: false, value: "unsafe" });

    const withSymbol = jsonClone(attest(baseManifest()));
    Object.defineProperty(withSymbol.target, Symbol("shadow"), { enumerable: true, value: true });

    const customPrototype = jsonClone(attest(baseManifest()));
    Object.setPrototypeOf(customPrototype.target, { inherited: "unsafe" });

    const cyclic = jsonClone(attest(baseManifest())) as unknown as Record<string, unknown>;
    cyclic.cycle = cyclic;

    const nonJson = jsonClone(attest(baseManifest())) as unknown as Record<string, unknown>;
    nonJson.extra = 1n;

    for (const candidate of [hidden, withSymbol, customPrototype, cyclic, nonJson]) {
      expectIssue(
        assessWriteTargetAttestation(candidate, options(attest(baseManifest()).reviewId)),
        "INPUT_UNSAFE"
      );
    }
  });

  it("rejects accessor-based options without invoking them", () => {
    const candidate = attest(baseManifest());
    let getterCalls = 0;
    const unsafeOptions = {
      expectedReviewId: candidate.reviewId
    } as Record<string, unknown>;
    Object.defineProperty(unsafeOptions, "asOf", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return () => new Date(NOW);
      }
    });
    expectIssue(assessWriteTargetAttestation(candidate, unsafeOptions), "OPTIONS_INVALID");
    expect(getterCalls).toBe(0);
  });

  it("makes the trusted review ID mandatory even when all public evidence is valid", () => {
    const candidate = attest(baseManifest());
    expectIssue(
      assessWriteTargetAttestation(candidate, {
        asOf: () => new Date(NOW),
        expectedReviewId: ZERO_BYTES32
      }),
      "OPTIONS_INVALID"
    );
  });
});
