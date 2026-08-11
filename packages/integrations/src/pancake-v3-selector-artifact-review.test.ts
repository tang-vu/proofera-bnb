import {
  PROOFERA_PANCAKE_V3_DENIED_MULTICALLS,
  PROOFERA_PANCAKE_V3_DIRECT_CALLS
} from "@proofera/domain";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sha256, stringToHex, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PANCAKE_V3_SELECTOR_ARTIFACT_EXPECTED_BINDINGS,
  buildPancakeV3SelectorArtifactReview,
  derivePancakeV3SelectorArtifactReviewId
} from "./pancake-v3-selector-artifact-review";

const NOW = "2026-08-11T16:30:00.000Z";
const ANALYZED_AT = "2026-08-11T16:00:00.000Z";
const REVIEWED_AT = "2026-08-11T16:10:00.000Z";
const FETCHED_AT = "2026-08-11T16:25:00.000Z";
const REVIEWER = "ProofEra Security Reviewer 1";
const RETRIEVER = "ProofEra Public Evidence Fetcher 1";

function jsonClone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
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

function hex32(seed: number): Hex {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}

function reviewer(identity = REVIEWER, reviewedAt = REVIEWED_AT) {
  return {
    identity,
    authentication: "server_allowlisted_identity_bound_to_expected_batch_review_id",
    independence: "independent_from_source_builder_runtime_observer_and_retriever",
    method: "manual_static_source_and_bytecode_control_flow_review",
    version: "proofera-pancake-v3-selector-path-v1",
    assurance: "manual_static_analysis_not_formal_proof",
    decision: "approved_for_exact_selector_scoped_attestation_input_only",
    reviewedAt
  };
}

function directBody(index: number) {
  const definition = PROOFERA_PANCAKE_V3_DIRECT_CALLS[index];
  if (definition === undefined) throw new Error("Invalid fixture index.");
  return {
    schemaVersion: 1,
    artifactType: "pancake_v3_direct_selector_independent_public_review",
    claimStatus: "approved_as_selector_attestation_input_not_execution_authorization",
    executionAuthorized: false,
    operation: definition.operation,
    signature: definition.signature,
    selector: definition.selector,
    analyzedAt: ANALYZED_AT,
    reviewer: reviewer(),
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
    reviewer: reviewer(),
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

function descriptorFromRaw(
  role: string,
  rawBodyUtf8: string,
  index: number,
  fetchedAt = FETCHED_AT,
  retrieverIdentity = RETRIEVER
) {
  const expectedSha256 = sha256(stringToHex(rawBodyUtf8));
  const receiptSha256 = hex32(100 + index);
  const locator = `https://evidence.proofera.dev/pancake-v3/${expectedSha256.slice(2)}.json`;
  return {
    role,
    locator,
    expectedSha256,
    rawBodyUtf8,
    retrieval: {
      kind: "prefetched_public_https_artifact_response_v1",
      retrieverIdentity,
      independence: "independent_from_source_builder_runtime_observer_and_reviewer",
      fetchedAt,
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

function descriptor(role: string, body: unknown, index: number) {
  return descriptorFromRaw(role, canonicalJson(body), index);
}

function validBatch() {
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

function selectorEntry(batch: ReturnType<typeof validBatch>, index: number) {
  const entry = batch.selectorArtifacts[index];
  if (entry === undefined) throw new Error("Invalid selector fixture index.");
  return entry;
}

function trustedOptions(batch: unknown, overrides: Record<string, unknown> = {}) {
  const expectedReviewId = derivePancakeV3SelectorArtifactReviewId(batch);
  if (expectedReviewId === null) throw new Error("Expected a structurally valid fixture.");
  return {
    now: () => new Date(NOW),
    expectedReviewId,
    expectedReviewerIdentity: REVIEWER,
    expectedRetrieverIdentity: RETRIEVER,
    ...overrides
  };
}

function issueCodes(result: ReturnType<typeof buildPancakeV3SelectorArtifactReview>) {
  return result.issues.map(({ code }) => code);
}

function replaceDirectBody(
  batch: ReturnType<typeof validBatch>,
  index: number,
  mutate: (body: Record<string, unknown>) => void
): void {
  const current = batch.selectorArtifacts[index];
  if (current === undefined) throw new Error("Invalid fixture index.");
  const body = JSON.parse(current.rawBodyUtf8) as Record<string, unknown>;
  mutate(body);
  batch.selectorArtifacts[index] = descriptor(current.role, body, index);
}

function replaceAllReviews(
  batch: ReturnType<typeof validBatch>,
  identity: string,
  reviewedAt: string
): void {
  for (let index = 0; index < batch.selectorArtifacts.length; index += 1) {
    replaceDirectBody(batch, index, (body) => {
      body.reviewer = reviewer(identity, reviewedAt);
    });
  }
  const body = JSON.parse(batch.delegatecallBoundaryArtifact.rawBodyUtf8) as Record<
    string,
    unknown
  >;
  body.reviewer = reviewer(identity, reviewedAt);
  batch.delegatecallBoundaryArtifact = descriptor("denied-multicalls", body, 4);
}

describe("Pancake V3 public selector artifact intake", () => {
  it("assembles the exact domain assessment while keeping execution and full attestation blocked", () => {
    const batch = validBatch();
    const result = buildPancakeV3SelectorArtifactReview(batch, trustedOptions(batch));

    expect(result.status).toBe("selector_assessment_ready_attestation_still_blocked");
    if (result.status !== "selector_assessment_ready_attestation_still_blocked") {
      throw new Error("Expected selector assessment readiness.");
    }
    expect(
      result.assessment.allowedDirectCalls.map(({ operation, signature, selector }) => ({
        operation,
        signature,
        selector
      }))
    ).toEqual(PROOFERA_PANCAKE_V3_DIRECT_CALLS);
    expect(result.assessment.delegatecallBoundary.delegatecallProgramCounter).toBe(10_522);
    expect(result.assessment.writeScopeSha256).toBe(
      "0x3a80eb853ccea37b7a1d04430a015d22941fd7a7cd2d8ab9d31b896fc74d5218"
    );
    expect(result.assessment.delegatecallBoundary.deniedMulticalls).toEqual(
      PROOFERA_PANCAKE_V3_DENIED_MULTICALLS.map((definition) => ({
        ...definition,
        decision: "denied"
      }))
    );
    expect(result.boundary.selectorCallPathAssessmentEmitted).toBe(true);
    expect(result.boundary.domainWriteTargetAttestationReady).toBe(false);
    expect(result.boundary.executionAuthorized).toBe(false);
    expect(result.boundary.globalFetchUsed).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.assessment.allowedDirectCalls)).toBe(true);
  });

  it("binds each domain evidence reference to the exact raw bytes including final LF", () => {
    const batch = validBatch();
    const result = buildPancakeV3SelectorArtifactReview(batch, trustedOptions(batch));
    if (result.status !== "selector_assessment_ready_attestation_still_blocked") {
      throw new Error("Expected selector assessment readiness.");
    }
    for (let index = 0; index < result.assessment.allowedDirectCalls.length; index += 1) {
      const call = result.assessment.allowedDirectCalls[index];
      const input = batch.selectorArtifacts[index];
      expect(call?.analysisArtifact.sha256).toBe(input?.expectedSha256);
      expect(input?.rawBodyUtf8.endsWith("\n")).toBe(true);
      expect(sha256(stringToHex(input?.rawBodyUtf8 ?? ""))).toBe(input?.expectedSha256);
      expect(sha256(stringToHex((input?.rawBodyUtf8 ?? "").slice(0, -1)))).not.toBe(
        input?.expectedSha256
      );
    }
  });

  it("rejects a final-LF mutation even when the old digest descriptor is retained", () => {
    const batch = validBatch();
    const mint = selectorEntry(batch, 0);
    mint.rawBodyUtf8 = mint.rawBodyUtf8.slice(0, -1);
    mint.retrieval.rawByteLength -= 1;
    const result = buildPancakeV3SelectorArtifactReview(batch, {
      ...trustedOptions(validBatch()),
      now: () => new Date(NOW)
    });
    expect(result.status).toBe("blocked");
    expect(issueCodes(result)).toContain("BODY_SHA256_MISMATCH");
    expect(issueCodes(result)).toContain("ARTIFACT_CANONICAL_INVALID");
  });

  it("rejects noncanonical bytes even when digest, URL, and length are rebound", () => {
    const batch = validBatch();
    const bodyWithoutLf = selectorEntry(batch, 0).rawBodyUtf8.slice(0, -1);
    batch.selectorArtifacts[0] = descriptorFromRaw("mint", bodyWithoutLf, 0);
    const result = buildPancakeV3SelectorArtifactReview(batch, trustedOptions(validBatch()));
    expect(result.status).toBe("blocked");
    expect(issueCodes(result)).toContain("ARTIFACT_CANONICAL_INVALID");
  });

  it.each([
    "http://evidence.proofera.dev/a.json",
    "https://user:secret@evidence.proofera.dev/a.json",
    "https://evidence.proofera.dev/a.json#fragment",
    "https://evidence.proofera.dev/a.json?token=value",
    "https://127.0.0.1/a.json",
    "https://localhost/a.json",
    "https://evidence.internal/a.json"
  ])("rejects unsafe or non-content-addressed locator %s", (locator) => {
    const batch = validBatch();
    const mint = selectorEntry(batch, 0);
    mint.locator = locator;
    mint.retrieval.requestedUrl = locator;
    mint.retrieval.finalUrl = locator;
    const result = buildPancakeV3SelectorArtifactReview(batch, trustedOptions(validBatch()));
    expect(result.status).toBe("blocked");
    expect(issueCodes(result)).toContain("LOCATOR_INVALID");
  });

  it("rejects redirect or incomplete SSRF provenance", () => {
    const redirected = validBatch();
    selectorEntry(redirected, 0).retrieval.redirectCount = 1;
    expect(
      issueCodes(buildPancakeV3SelectorArtifactReview(redirected, trustedOptions(validBatch())))
    ).toContain("BATCH_INVALID");

    const unprotected = validBatch();
    selectorEntry(unprotected, 0).retrieval.dnsRebindingProtection = false;
    expect(
      issueCodes(buildPancakeV3SelectorArtifactReview(unprotected, trustedOptions(validBatch())))
    ).toContain("BATCH_INVALID");
  });

  it("rejects selector, binding, and delegatecall-boundary drift", () => {
    const selectorDrift = validBatch();
    replaceDirectBody(selectorDrift, 0, (body) => {
      body.selector = PROOFERA_PANCAKE_V3_DIRECT_CALLS[1].selector;
    });
    expect(
      issueCodes(buildPancakeV3SelectorArtifactReview(selectorDrift, trustedOptions(validBatch())))
    ).toContain("ARTIFACT_SCHEMA_INVALID");

    const bindingDrift = validBatch();
    replaceDirectBody(bindingDrift, 0, (body) => {
      const bindings = body.bindings as Record<string, unknown>;
      const compiler = bindings.compiler as Record<string, unknown>;
      compiler.inputSha256 = hex32(999);
    });
    expect(
      issueCodes(buildPancakeV3SelectorArtifactReview(bindingDrift, trustedOptions(validBatch())))
    ).toContain("ARTIFACT_SCHEMA_INVALID");

    const boundaryDrift = validBatch();
    const boundary = JSON.parse(boundaryDrift.delegatecallBoundaryArtifact.rawBodyUtf8) as Record<
      string,
      unknown
    >;
    boundary.delegatecallProgramCounter = 10_523;
    boundaryDrift.delegatecallBoundaryArtifact = descriptor("denied-multicalls", boundary, 4);
    expect(
      issueCodes(buildPancakeV3SelectorArtifactReview(boundaryDrift, trustedOptions(validBatch())))
    ).toContain("ARTIFACT_SCHEMA_INVALID");
  });

  it("rejects duplicate source/bytecode paths and retrieval receipts", () => {
    const pathDuplicate = validBatch();
    const first = JSON.parse(selectorEntry(pathDuplicate, 0).rawBodyUtf8) as Record<
      string,
      unknown
    >;
    replaceDirectBody(pathDuplicate, 1, (body) => {
      body.sourcePathSha256 = first.sourcePathSha256;
      body.bytecodePathSha256 = first.bytecodePathSha256;
    });
    expect(
      issueCodes(buildPancakeV3SelectorArtifactReview(pathDuplicate, trustedOptions(validBatch())))
    ).toContain("PATH_DIGEST_NOT_DISTINCT");

    const receiptDuplicate = validBatch();
    selectorEntry(receiptDuplicate, 1).retrieval.receipt = jsonClone(
      selectorEntry(receiptDuplicate, 0).retrieval.receipt
    );
    expect(
      issueCodes(
        buildPancakeV3SelectorArtifactReview(receiptDuplicate, trustedOptions(validBatch()))
      )
    ).toContain("EVIDENCE_NOT_DISTINCT");
  });

  it("rejects mismatched, stale, future, or non-independent review metadata", () => {
    const mismatch = validBatch();
    replaceDirectBody(mismatch, 1, (body) => {
      body.reviewer = reviewer("Different Reviewer", REVIEWED_AT);
    });
    expect(
      issueCodes(buildPancakeV3SelectorArtifactReview(mismatch, trustedOptions(validBatch())))
    ).toContain("REVIEW_METADATA_MISMATCH");

    const stale = validBatch();
    replaceAllReviews(stale, REVIEWER, "2026-06-01T00:00:00.000Z");
    const staleOptions = trustedOptions(stale);
    expect(issueCodes(buildPancakeV3SelectorArtifactReview(stale, staleOptions))).toContain(
      "REVIEW_TIME_INVALID"
    );

    const futureFetch = validBatch();
    for (const entry of futureFetch.selectorArtifacts) {
      entry.retrieval.fetchedAt = "2026-08-11T16:31:00.000Z";
    }
    futureFetch.delegatecallBoundaryArtifact.retrieval.fetchedAt = "2026-08-11T16:31:00.000Z";
    const futureOptions = trustedOptions(futureFetch);
    expect(issueCodes(buildPancakeV3SelectorArtifactReview(futureFetch, futureOptions))).toContain(
      "REVIEW_TIME_INVALID"
    );

    const sameIdentity = validBatch();
    replaceAllReviews(sameIdentity, RETRIEVER, REVIEWED_AT);
    const sameOptions = trustedOptions(sameIdentity, {
      expectedReviewerIdentity: RETRIEVER
    });
    expect(issueCodes(buildPancakeV3SelectorArtifactReview(sameIdentity, sameOptions))).toContain(
      "REVIEW_NOT_TRUSTED"
    );
  });

  it("requires a separately provisioned exact review ID and identities", () => {
    const batch = validBatch();
    const result = buildPancakeV3SelectorArtifactReview(batch, {
      ...trustedOptions(batch),
      expectedReviewId: hex32(999)
    });
    expect(result.status).toBe("blocked");
    expect(issueCodes(result)).toContain("REVIEW_NOT_TRUSTED");
  });

  it("rejects accessors, extra batch keys, malformed options, and byte-length drift", () => {
    const accessorBatch = validBatch();
    Object.defineProperty(accessorBatch, "schemaVersion", {
      enumerable: true,
      get: () => 1
    });
    expect(
      issueCodes(buildPancakeV3SelectorArtifactReview(accessorBatch, trustedOptions(validBatch())))
    ).toContain("INPUT_UNSAFE");

    const extra = { ...validBatch(), unexpected: true };
    expect(
      issueCodes(buildPancakeV3SelectorArtifactReview(extra, trustedOptions(validBatch())))
    ).toContain("BATCH_INVALID");

    expect(
      issueCodes(
        buildPancakeV3SelectorArtifactReview(validBatch(), {
          ...trustedOptions(validBatch()),
          unexpected: true
        } as never)
      )
    ).toContain("OPTIONS_INVALID");

    const lengthDrift = validBatch();
    selectorEntry(lengthDrift, 0).retrieval.rawByteLength += 1;
    expect(
      issueCodes(buildPancakeV3SelectorArtifactReview(lengthDrift, trustedOptions(validBatch())))
    ).toContain("BODY_SIZE_INVALID");
  });

  it("explicitly rejects the current local development artifact as public reviewer evidence", () => {
    const batch = validBatch();
    const localPath = fileURLToPath(
      new URL("../../../evidence/development/pancake-v3-selector-paths/mint.json", import.meta.url)
    );
    const localBody = readFileSync(localPath, "utf8");
    batch.selectorArtifacts[0] = descriptorFromRaw("mint", localBody, 0);
    const result = buildPancakeV3SelectorArtifactReview(batch, trustedOptions(validBatch()));
    expect(result.status).toBe("blocked");
    expect(issueCodes(result)).toContain("ARTIFACT_SCHEMA_INVALID");
  });

  it("contains no global fetch path", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./pancake-v3-selector-artifact-review.ts", import.meta.url)),
      "utf8"
    );
    expect(source).not.toMatch(/\bfetch\s*\(/u);
  });
});
