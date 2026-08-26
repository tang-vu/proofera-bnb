import { describe, expect, it } from "vitest";

import { type PairedBenchmarkSummary } from "./index.js";
import { TERMIX_FINAL_TASK_IDS, compileTermixFinalBundle } from "./protectedFinalReport.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const COMMIT = "d".repeat(40);

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Test fixture value is required");
  return value;
}

function summary(index: number): PairedBenchmarkSummary {
  return {
    schemaVersion: "proofera-termix-pair-v1.0.0",
    pairId: `pair-${index}`,
    pairSha256: required([SHA_A, SHA_B, SHA_C][index]),
    declarationSha256: required([SHA_C, SHA_A, SHA_B][index]),
    claimState: "verified",
    sourceStates: { agent: "verified", manual: "verified" },
    publishableClaim: true,
    duration: {
      agentNanoseconds: String(1_000 + index),
      manualNanoseconds: String(2_000 + index),
      manualMinusAgentNanoseconds: "1000"
    },
    costs: [
      {
        denominationKey: "currency:USD:6",
        denomination: { kind: "currency", currencyCode: "USD", minorUnitDecimals: 6 },
        agentMinorUnits: String(10 + index),
        manualMinorUnits: String(20 + index),
        manualMinusAgentMinorUnits: "10"
      }
    ],
    quality: {
      maximumPoints: 100,
      agentPoints: 90 - index,
      manualPoints: 80 - index,
      agentMinusManualPoints: 10
    },
    warnings: [
      "Verified means the supplied evidence passed this harness and named its verifier; it is not a financial guarantee."
    ]
  };
}

function source(index: number) {
  const taskId = required(TERMIX_FINAL_TASK_IDS[index]);
  const pairSummary = summary(index);
  return {
    taskId,
    pairPath: `evidence/termix/final-pairs/${taskId}.json`,
    pairBytesSha256: required([SHA_B, SHA_C, SHA_A][index]),
    agentRunId: `${taskId}-agent`,
    manualRunId: `${taskId}-manual`,
    summary: pairSummary,
    adjudicationPath: `evidence/termix/adjudications/${taskId}.json`,
    adjudicationBytesSha256: required([SHA_C, SHA_B, SHA_A][index]),
    adjudication: {
      schemaVersion: "proofera-termix-adjudication-v4.0.0",
      taskId,
      pairId: pairSummary.pairId,
      pairSha256: pairSummary.pairSha256,
      declarationSha256: pairSummary.declarationSha256,
      inputPairPath: `evidence/termix/pairs/${taskId}.json`,
      inputPairBytesSha256: SHA_A,
      inputPairLogicalSha256: SHA_B,
      packetPath: "evidence/termix/reviewer-packets/packet.json",
      packetBytesSha256: SHA_C,
      reviewRecordPath: "evidence/termix/reviews/independent/review.json",
      reviewRecordBytesSha256: SHA_A,
      reviewedAtUtc: "2026-08-17T03:00:00.000Z",
      reviewer: {
        name: "Independent benchmark reviewer",
        role: "Evidence adjudicator",
        independenceBasis: "Did not operate either timed method and reviewed retained bytes."
      },
      checks: {
        pairSchemaValidated: true,
        artifactDigestsVerified: true,
        receiptsReobserved: true,
        rubricRecomputed: true,
        rawOutputsReviewed: true,
        manualNoAgentToolLogReviewed: true
      },
      evidence: [
        {
          path: "evidence/termix/reviewer-packets/packet.json",
          sha256: SHA_A,
          purpose: "Retained reviewer packet."
        },
        {
          path: "evidence/termix/reviews/independent/review.json",
          sha256: SHA_B,
          purpose: "Retained independent review record."
        }
      ],
      limitations: ["One frozen task comparison; no universal performance inference."]
    }
  };
}

function input() {
  return {
    compiledAtUtc: "2026-08-17T03:01:00.000Z",
    sourceCommitSha: COMMIT,
    invocationSha256: SHA_A,
    sources: [source(2), source(0), source(1)]
  };
}

describe("TermiX final evidence compiler", () => {
  it("emits three ordered, digest-joined final artifacts without a universal claim", () => {
    const result = compileTermixFinalBundle(input());

    expect(result.pairedReport.pairs.map(({ taskId }) => taskId)).toEqual(TERMIX_FINAL_TASK_IDS);
    expect(result.pairedReport.allThreePairsVerified).toBe(true);
    expect(result.pairedReport.claimBoundary).toContain("do not establish a universal");
    expect(result.rawRuns.pairs).toHaveLength(3);
    expect(result.adjudication.adjudications).toHaveLength(3);
  });

  it("rejects an unverified source even when its numerical deltas are complete", () => {
    const candidate = input();
    const first = required(candidate.sources[0]);
    first.summary.claimState = "unverified";
    first.summary.publishableClaim = false;

    expect(() => compileTermixFinalBundle(candidate)).toThrow(
      /requires two verified runs and a publishable pair summary/u
    );
  });

  it("rejects adjudication that does not join the exact pair digest", () => {
    const candidate = input();
    required(candidate.sources[1]).adjudication.pairSha256 = SHA_C;

    expect(() => compileTermixFinalBundle(candidate)).toThrow(
      /Adjudication must join the exact task, pair and declaration digests/u
    );
  });

  it("rejects replacing one preregistered task with a duplicate", () => {
    const candidate = input();
    candidate.sources[2] = source(0);

    expect(() => compileTermixFinalBundle(candidate)).toThrow(
      /exactly the three preregistered TermiX tasks/u
    );
  });

  it("rejects a verified label when required comparison values remain null", () => {
    const candidate = input();
    required(candidate.sources[0]).summary.duration = null;

    expect(() => compileTermixFinalBundle(candidate)).toThrow();
  });
});
