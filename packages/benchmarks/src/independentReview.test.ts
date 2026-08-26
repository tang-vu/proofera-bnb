import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  TERMIX_REVIEW_TASK_IDS,
  TermixIndependentReviewRecordSchema,
  assertTermixReviewEvidenceBytes,
  assertTermixVerifiedDerivative,
  materializeTermixVerifiedPair,
  termixProtectedPairProjection
} from "./independentReview.js";
import { benchmarkDeclarationSha256 } from "./pair.js";
import { PairedBenchmarkSchema, type PairedBenchmark } from "./schemas.js";
import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.js";

const REVIEWED_AT = "2026-08-26T09:00:00.000Z";
const REVIEWER = {
  name: "ProofEra owner-designated internal TermiX reviewer A",
  role: "independent_internal_termix_evidence_reviewer",
  independenceBasis: "Reviewed immutable inputs and did not operate either timed benchmark lane."
};
const CHECKS = {
  pairSchemaValidated: true,
  artifactDigestsVerified: true,
  receiptsReobserved: true,
  rubricRecomputed: true,
  rawOutputsReviewed: true,
  manualNoAgentToolLogReviewed: true
} as const;

const TASK_FIXTURES = [
  {
    taskId: "pancake-lp-range-decision",
    pairPath: "evidence/termix/pairs/pancake-lp/pancake-lp-pair-20260822-v1.json",
    outputPath:
      "evidence/termix/final-pairs/pancake-lp/pancake-lp-pair-20260822-v1-independent.json",
    adjudicationPath:
      "evidence/termix/adjudications/pancake-lp/pancake-lp-pair-20260822-v1-adjudication.json"
  },
  {
    taskId: "autonomous-session-permission-audit",
    pairPath: "evidence/termix/pairs/permission-audit/permission-audit-pair-20260822-v1.json",
    outputPath:
      "evidence/termix/final-pairs/permission-audit/permission-audit-pair-20260822-v1-independent.json",
    adjudicationPath:
      "evidence/termix/adjudications/permission-audit/permission-audit-pair-20260822-v1-adjudication.json"
  },
  {
    taskId: "venus-health-factor-decision",
    pairPath: "evidence/termix/pairs/venus-health/venus-health-pair-20260822-v1.json",
    outputPath:
      "evidence/termix/final-pairs/venus-health/venus-health-pair-20260822-v1-independent.json",
    adjudicationPath:
      "evidence/termix/adjudications/venus-health/venus-health-pair-20260822-v1-adjudication.json"
  }
] as const;

function readPair(path: string): PairedBenchmark {
  return PairedBenchmarkSchema.parse(
    JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")) as unknown
  );
}

function requiredAssessment(run: PairedBenchmark["agentRun"]) {
  if (run.qualityAssessment === null) throw new Error("Fixture assessment is required");
  return {
    ...run.qualityAssessment,
    assessedAtUtc: REVIEWED_AT,
    assessor: REVIEWER.name
  };
}

function reviewRecord() {
  return TermixIndependentReviewRecordSchema.parse({
    schemaVersion: "proofera-termix-independent-review-v2.0.0",
    kind: "owner_designated_internal_termix_independent_review",
    packetId: "termix-independent-review-test-v2",
    packetPath: "evidence/termix/reviewer-packets/test-v2/manifest.json",
    packetBytesSha256: "a".repeat(64),
    reviewedCommit: "b".repeat(40),
    reviewedAtUtc: REVIEWED_AT,
    decision: "PASS_ALL_THREE_TASKS",
    reviewer: REVIEWER,
    tasks: TASK_FIXTURES.map((fixture) => {
      const pair = readPair(fixture.pairPath);
      const runReview = (run: PairedBenchmark["agentRun"]) => ({
        qualityAssessment: requiredAssessment(run),
        receiptVerificationMethod: "Independent exact receipt replay against retained bytes.",
        evidenceStateMethod: "Independent schema, digest, output and rubric recomputation.",
        evidenceArtifactIds: run.artifacts.map(({ artifactId }) => artifactId),
        limitations: ["Owner-designated internal review without cryptographic reviewer identity."]
      });
      return {
        taskId: fixture.taskId,
        pairId: pair.pairId,
        inputPairPath: fixture.pairPath,
        inputPairBytesSha256: "c".repeat(64),
        inputPairLogicalSha256: sha256Canonical(pair),
        declarationSha256: benchmarkDeclarationSha256(pair.agentRun.declaration),
        outputPairPath: fixture.outputPath,
        adjudicationPath: fixture.adjudicationPath,
        checks: CHECKS,
        evidence: [
          {
            path: fixture.pairPath,
            sha256: "d".repeat(64),
            purpose: "Exact immutable input-pair fixture."
          }
        ],
        runReviews: {
          agent: runReview(pair.agentRun),
          manual: runReview(pair.manualRun)
        },
        limitations: ["One bounded benchmark task; no universal performance inference."]
      };
    }),
    limitations: [
      "Owner-designated internal review, not an external or cryptographically authenticated attestation."
    ]
  });
}

describe("TermiX protected independent-review materialization", () => {
  it("changes only reviewer-controlled fields and produces two verified lanes", () => {
    const fixture = TASK_FIXTURES[0];
    const input = readPair(fixture.pairPath);
    const review = reviewRecord();
    const derivative = materializeTermixVerifiedPair(input, review, fixture.taskId);

    expect(derivative.agentRun.evidenceState.state).toBe("verified");
    expect(derivative.manualRun.evidenceState.state).toBe("verified");
    expect(derivative.agentRun.qualityAssessment?.assessor).toBe(REVIEWER.name);
    expect(canonicalJson(termixProtectedPairProjection(derivative))).toBe(
      canonicalJson(termixProtectedPairProjection(input))
    );
  });

  it("rejects drift in timing, output, cost, source, method or other protected fields", () => {
    const fixture = TASK_FIXTURES[0];
    const input = readPair(fixture.pairPath);
    const review = reviewRecord();
    const derivative = materializeTermixVerifiedPair(input, review, fixture.taskId);
    const tampered = structuredClone(derivative);
    const duration = tampered.agentRun.timing.monotonicDurationNanoseconds;
    if (duration === null) throw new Error("Fixture duration is required");
    tampered.agentRun.timing.monotonicDurationNanoseconds = (BigInt(duration) + 1n).toString();

    expect(() => assertTermixVerifiedDerivative(input, tampered, review, fixture.taskId)).toThrow(
      "TERMIX_VERIFIED_PAIR_PROTECTED_PROJECTION_DRIFT"
    );
  });

  it("rejects reviewer-controlled metadata that was not supplied by the bound reviewer", () => {
    const fixture = TASK_FIXTURES[0];
    const input = readPair(fixture.pairPath);
    const review = reviewRecord();
    const derivative = materializeTermixVerifiedPair(input, review, fixture.taskId);
    const tampered = structuredClone(derivative);
    const assessment = tampered.agentRun.qualityAssessment;
    if (assessment === null || assessment.scores[0] === undefined) {
      throw new Error("Fixture score is required");
    }
    assessment.scores[0].rationale = "Unbound replacement rationale.";

    expect(() => assertTermixVerifiedDerivative(input, tampered, review, fixture.taskId)).toThrow(
      "TERMIX_VERIFIED_PAIR_REVIEW_METADATA_MISMATCH"
    );
  });

  it("rejects an implementation self-review label as the independent reviewer identity", () => {
    const record = reviewRecord();
    const forged = structuredClone(record);
    forged.reviewer.name = "ProofEra deterministic observational-pair self-review v1";
    for (const task of forged.tasks) {
      task.runReviews.agent.qualityAssessment.assessor = forged.reviewer.name;
      task.runReviews.manual.qualityAssessment.assessor = forged.reviewer.name;
    }

    expect(() => TermixIndependentReviewRecordSchema.parse(forged)).toThrow(
      /cannot reuse an implementation self-review label/u
    );
  });

  it("keeps the exact fixed task set", () => {
    expect(TERMIX_REVIEW_TASK_IDS).toEqual(TASK_FIXTURES.map(({ taskId }) => taskId));
  });

  it("verifies both retained full-file and optional final-LF payload digests", () => {
    const bytes = Buffer.from("exact-payload\n", "utf8");
    const evidence = {
      path: "evidence/termix/reviewer-packets/payload.canonical-json",
      sha256: sha256Bytes(bytes),
      payloadSha256: sha256Bytes(bytes.subarray(0, -1)),
      purpose: "Exact payload fixture."
    };
    expect(() => assertTermixReviewEvidenceBytes(evidence, bytes)).not.toThrow();
    expect(() =>
      assertTermixReviewEvidenceBytes(
        { ...evidence, sha256: sha256Bytes(Buffer.from("drift\n", "utf8")) },
        bytes
      )
    ).toThrow("TERMIX_REVIEW_EVIDENCE_FULL_DIGEST_MISMATCH");
    expect(() =>
      assertTermixReviewEvidenceBytes(
        {
          ...evidence,
          sha256: sha256Bytes(Buffer.from("exact-payload", "utf8"))
        },
        Buffer.from("exact-payload", "utf8")
      )
    ).toThrow("TERMIX_REVIEW_EVIDENCE_PAYLOAD_LINE_ENDING_INVALID");
    expect(() =>
      assertTermixReviewEvidenceBytes({ ...evidence, payloadSha256: "e".repeat(64) }, bytes)
    ).toThrow("TERMIX_REVIEW_EVIDENCE_PAYLOAD_DIGEST_MISMATCH");
  });
});
