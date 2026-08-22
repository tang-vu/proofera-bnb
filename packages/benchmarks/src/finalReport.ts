import { z } from "zod";

import { PairedBenchmarkSummarySchema } from "./pair.js";
import {
  BenchmarkIdSchema,
  GitCommitShaSchema,
  RepositoryPathSchema,
  Sha256Schema,
  UtcDateTimeSchema
} from "./schemas.js";

export const TERMIX_FINAL_BUNDLE_SCHEMA_VERSION = "proofera-termix-final-bundle-v1.0.0" as const;

export const TERMIX_FINAL_TASK_IDS = [
  "pancake-lp-range-decision",
  "autonomous-session-permission-audit",
  "venus-health-factor-decision"
] as const;

const TermixFinalTaskIdSchema = z.enum(TERMIX_FINAL_TASK_IDS);
const VerifiedSummarySchema = PairedBenchmarkSummarySchema.refine(
  (summary) =>
    summary.claimState === "verified" &&
    summary.publishableClaim &&
    summary.sourceStates.agent === "verified" &&
    summary.sourceStates.manual === "verified",
  "A final TermiX source requires two verified runs and a publishable pair summary"
);

export const TermixIndependentAdjudicationSchema = z.strictObject({
  schemaVersion: z.literal("proofera-termix-adjudication-v1.0.0"),
  taskId: TermixFinalTaskIdSchema,
  pairId: BenchmarkIdSchema,
  pairSha256: Sha256Schema,
  declarationSha256: Sha256Schema,
  reviewedAtUtc: UtcDateTimeSchema,
  reviewer: z.strictObject({
    name: z.string().trim().min(1).max(200),
    role: z.string().trim().min(1).max(200),
    independenceBasis: z.string().trim().min(1).max(1_000)
  }),
  checks: z.strictObject({
    pairSchemaValidated: z.literal(true),
    artifactDigestsVerified: z.literal(true),
    receiptsReobserved: z.literal(true),
    rubricRecomputed: z.literal(true),
    rawOutputsReviewed: z.literal(true),
    manualNoAgentToolLogReviewed: z.literal(true)
  }),
  evidence: z
    .array(
      z.strictObject({
        path: RepositoryPathSchema,
        sha256: Sha256Schema,
        purpose: z.string().trim().min(1).max(500)
      })
    )
    .min(1)
    .max(100),
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50)
});

export const TermixFinalSourceSchema = z
  .strictObject({
    taskId: TermixFinalTaskIdSchema,
    pairPath: RepositoryPathSchema,
    pairBytesSha256: Sha256Schema,
    agentRunId: BenchmarkIdSchema,
    manualRunId: BenchmarkIdSchema,
    summary: VerifiedSummarySchema,
    adjudicationPath: RepositoryPathSchema,
    adjudicationBytesSha256: Sha256Schema,
    adjudication: TermixIndependentAdjudicationSchema
  })
  .superRefine((source, context) => {
    if (source.agentRunId === source.manualRunId) {
      context.addIssue({
        code: "custom",
        path: ["manualRunId"],
        message: "Agent and manual run IDs must be distinct"
      });
    }
    if (
      source.adjudication.taskId !== source.taskId ||
      source.adjudication.pairId !== source.summary.pairId ||
      source.adjudication.pairSha256 !== source.summary.pairSha256 ||
      source.adjudication.declarationSha256 !== source.summary.declarationSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["adjudication"],
        message: "Adjudication must join the exact task, pair and declaration digests"
      });
    }
  });

export const TermixFinalCompilationInputSchema = z
  .strictObject({
    compiledAtUtc: UtcDateTimeSchema,
    sourceCommitSha: GitCommitShaSchema,
    invocationSha256: Sha256Schema,
    sources: z.array(TermixFinalSourceSchema).length(3)
  })
  .superRefine((input, context) => {
    const taskIds = input.sources.map(({ taskId }) => taskId);
    if (
      new Set(taskIds).size !== TERMIX_FINAL_TASK_IDS.length ||
      !TERMIX_FINAL_TASK_IDS.every((taskId) => taskIds.includes(taskId))
    ) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Final compilation requires exactly the three preregistered TermiX tasks"
      });
    }
    const pairIds = input.sources.map(({ summary }) => summary.pairId);
    if (new Set(pairIds).size !== pairIds.length) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Final compilation requires three distinct pair IDs"
      });
    }
  });

const ClaimBoundarySchema = z.literal(
  "These three verified task-level comparisons do not establish a universal agent advantage or financial guarantee."
);

export const TermixPairedReportSchema = z.strictObject({
  schemaVersion: z.literal(TERMIX_FINAL_BUNDLE_SCHEMA_VERSION),
  artifactKind: z.literal("paired_report"),
  compiledAtUtc: UtcDateTimeSchema,
  sourceCommitSha: GitCommitShaSchema,
  invocationSha256: Sha256Schema,
  allThreePairsVerified: z.literal(true),
  claimBoundary: ClaimBoundarySchema,
  pairs: z
    .array(
      z.strictObject({
        taskId: TermixFinalTaskIdSchema,
        pairId: BenchmarkIdSchema,
        pairSha256: Sha256Schema,
        declarationSha256: Sha256Schema,
        duration: PairedBenchmarkSummarySchema.shape.duration.unwrap(),
        costs: PairedBenchmarkSummarySchema.shape.costs.unwrap(),
        quality: PairedBenchmarkSummarySchema.shape.quality.unwrap(),
        warnings: PairedBenchmarkSummarySchema.shape.warnings
      })
    )
    .length(3)
});

export const TermixRawRunsManifestSchema = z.strictObject({
  schemaVersion: z.literal(TERMIX_FINAL_BUNDLE_SCHEMA_VERSION),
  artifactKind: z.literal("raw_runs"),
  compiledAtUtc: UtcDateTimeSchema,
  sourceCommitSha: GitCommitShaSchema,
  invocationSha256: Sha256Schema,
  pairs: z
    .array(
      z.strictObject({
        taskId: TermixFinalTaskIdSchema,
        pairId: BenchmarkIdSchema,
        pairPath: RepositoryPathSchema,
        pairBytesSha256: Sha256Schema,
        pairSha256: Sha256Schema,
        agentRunId: BenchmarkIdSchema,
        manualRunId: BenchmarkIdSchema
      })
    )
    .length(3)
});

export const TermixAdjudicationManifestSchema = z.strictObject({
  schemaVersion: z.literal(TERMIX_FINAL_BUNDLE_SCHEMA_VERSION),
  artifactKind: z.literal("adjudication"),
  compiledAtUtc: UtcDateTimeSchema,
  sourceCommitSha: GitCommitShaSchema,
  invocationSha256: Sha256Schema,
  adjudications: z
    .array(
      z.strictObject({
        taskId: TermixFinalTaskIdSchema,
        pairId: BenchmarkIdSchema,
        adjudicationPath: RepositoryPathSchema,
        adjudicationBytesSha256: Sha256Schema,
        reviewedAtUtc: UtcDateTimeSchema,
        reviewer: TermixIndependentAdjudicationSchema.shape.reviewer,
        checks: TermixIndependentAdjudicationSchema.shape.checks,
        evidence: TermixIndependentAdjudicationSchema.shape.evidence,
        limitations: TermixIndependentAdjudicationSchema.shape.limitations
      })
    )
    .length(3)
});

export const TermixFinalBundleSchema = z.strictObject({
  pairedReport: TermixPairedReportSchema,
  rawRuns: TermixRawRunsManifestSchema,
  adjudication: TermixAdjudicationManifestSchema
});

export type TermixFinalBundle = z.infer<typeof TermixFinalBundleSchema>;

export function compileTermixFinalBundle(input: unknown): TermixFinalBundle {
  const parsed = TermixFinalCompilationInputSchema.parse(input);
  const sources = [...parsed.sources].sort(
    (left, right) =>
      TERMIX_FINAL_TASK_IDS.indexOf(left.taskId) - TERMIX_FINAL_TASK_IDS.indexOf(right.taskId)
  );
  const common = {
    schemaVersion: TERMIX_FINAL_BUNDLE_SCHEMA_VERSION,
    compiledAtUtc: parsed.compiledAtUtc,
    sourceCommitSha: parsed.sourceCommitSha,
    invocationSha256: parsed.invocationSha256
  };

  return TermixFinalBundleSchema.parse({
    pairedReport: {
      ...common,
      artifactKind: "paired_report",
      allThreePairsVerified: true,
      claimBoundary:
        "These three verified task-level comparisons do not establish a universal agent advantage or financial guarantee.",
      pairs: sources.map(({ taskId, summary }) => ({
        taskId,
        pairId: summary.pairId,
        pairSha256: summary.pairSha256,
        declarationSha256: summary.declarationSha256,
        duration: summary.duration,
        costs: summary.costs,
        quality: summary.quality,
        warnings: summary.warnings
      }))
    },
    rawRuns: {
      ...common,
      artifactKind: "raw_runs",
      pairs: sources.map((source) => ({
        taskId: source.taskId,
        pairId: source.summary.pairId,
        pairPath: source.pairPath,
        pairBytesSha256: source.pairBytesSha256,
        pairSha256: source.summary.pairSha256,
        agentRunId: source.agentRunId,
        manualRunId: source.manualRunId
      }))
    },
    adjudication: {
      ...common,
      artifactKind: "adjudication",
      adjudications: sources.map((source) => ({
        taskId: source.taskId,
        pairId: source.summary.pairId,
        adjudicationPath: source.adjudicationPath,
        adjudicationBytesSha256: source.adjudicationBytesSha256,
        reviewedAtUtc: source.adjudication.reviewedAtUtc,
        reviewer: source.adjudication.reviewer,
        checks: source.adjudication.checks,
        evidence: source.adjudication.evidence,
        limitations: source.adjudication.limitations
      }))
    }
  });
}
