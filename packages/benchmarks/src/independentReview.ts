import { z } from "zod";

import { canonicalJson, sha256Canonical } from "./canonical.js";
import { benchmarkDeclarationSha256 } from "./pair.js";
import {
  BenchmarkIdSchema,
  GitCommitShaSchema,
  PairedBenchmarkSchema,
  QualityAssessmentSchema,
  RepositoryPathSchema,
  Sha256Schema,
  UtcDateTimeSchema,
  type PairedBenchmark
} from "./schemas.js";

export const TERMIX_INDEPENDENT_REVIEW_SCHEMA_VERSION =
  "proofera-termix-independent-review-v2.0.0" as const;
export const TERMIX_REVIEWER_PACKET_SCHEMA_VERSION =
  "proofera-termix-reviewer-packet-v3.0.0" as const;
export const TERMIX_ADJUDICATION_SCHEMA_VERSION = "proofera-termix-adjudication-v3.0.0" as const;

export const TERMIX_REVIEW_TASK_IDS = [
  "pancake-lp-range-decision",
  "autonomous-session-permission-audit",
  "venus-health-factor-decision"
] as const;

export const TERMIX_REVIEW_RUNTIME_PATHS = [
  "packages/benchmarks/src/canonical.ts",
  "packages/benchmarks/src/schemas.ts",
  "packages/benchmarks/src/pair.ts",
  "packages/benchmarks/src/independentReview.ts",
  "packages/benchmarks/src/protectedFinalReport.ts",
  "scripts/compile-termix-protected-final-evidence.ts",
  "scripts/materialize-termix-independent-review.ts",
  "scripts/termix-typescript-loader.mjs"
] as const;

export const TermixReviewTaskIdSchema = z.enum(TERMIX_REVIEW_TASK_IDS);

export const TermixReviewerIdentitySchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(
      (value) => !/self-review|implementation-adjacent/iu.test(value),
      "Independent reviewer identity cannot reuse an implementation self-review label"
    ),
  role: z.string().trim().min(1).max(200),
  independenceBasis: z.string().trim().min(1).max(1_000)
});

export const TermixIndependentReviewChecksSchema = z.strictObject({
  pairSchemaValidated: z.literal(true),
  artifactDigestsVerified: z.literal(true),
  receiptsReobserved: z.literal(true),
  rubricRecomputed: z.literal(true),
  rawOutputsReviewed: z.literal(true),
  manualNoAgentToolLogReviewed: z.literal(true)
});

export const TermixReviewEvidenceSchema = z.strictObject({
  path: RepositoryPathSchema,
  sha256: Sha256Schema,
  payloadSha256: Sha256Schema.optional(),
  purpose: z.string().trim().min(1).max(1_000)
});

const TermixRunIndependentReviewSchema = z.strictObject({
  qualityAssessment: QualityAssessmentSchema,
  receiptVerificationMethod: z.string().trim().min(1).max(1_000),
  evidenceStateMethod: z.string().trim().min(1).max(1_000),
  evidenceArtifactIds: z.array(BenchmarkIdSchema).min(1).max(20),
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20)
});

export const TermixIndependentReviewTaskSchema = z.strictObject({
  taskId: TermixReviewTaskIdSchema,
  pairId: BenchmarkIdSchema,
  inputPairPath: RepositoryPathSchema,
  inputPairBytesSha256: Sha256Schema,
  inputPairLogicalSha256: Sha256Schema,
  declarationSha256: Sha256Schema,
  outputPairPath: RepositoryPathSchema,
  adjudicationPath: RepositoryPathSchema,
  checks: TermixIndependentReviewChecksSchema,
  evidence: z.array(TermixReviewEvidenceSchema).min(1).max(100),
  runReviews: z.strictObject({
    agent: TermixRunIndependentReviewSchema,
    manual: TermixRunIndependentReviewSchema
  }),
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20)
});

export const TermixIndependentReviewRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(TERMIX_INDEPENDENT_REVIEW_SCHEMA_VERSION),
    kind: z.literal("owner_designated_internal_termix_independent_review"),
    packetId: BenchmarkIdSchema,
    packetPath: RepositoryPathSchema,
    packetBytesSha256: Sha256Schema,
    reviewedCommit: GitCommitShaSchema,
    reviewedAtUtc: UtcDateTimeSchema,
    decision: z.literal("PASS_ALL_THREE_TASKS"),
    reviewer: TermixReviewerIdentitySchema,
    tasks: z.array(TermixIndependentReviewTaskSchema).length(3),
    limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50)
  })
  .superRefine((record, context) => {
    const taskIds = record.tasks.map(({ taskId }) => taskId);
    if (
      new Set(taskIds).size !== TERMIX_REVIEW_TASK_IDS.length ||
      !TERMIX_REVIEW_TASK_IDS.every((taskId) => taskIds.includes(taskId))
    ) {
      context.addIssue({
        code: "custom",
        path: ["tasks"],
        message: "Independent review must cover the exact three TermiX tasks"
      });
    }
    for (const [taskIndex, task] of record.tasks.entries()) {
      for (const role of ["agent", "manual"] as const) {
        const run = task.runReviews[role];
        if (
          run.qualityAssessment.assessor !== record.reviewer.name ||
          run.qualityAssessment.assessedAtUtc !== record.reviewedAtUtc
        ) {
          context.addIssue({
            code: "custom",
            path: ["tasks", taskIndex, "runReviews", role, "qualityAssessment"],
            message: "Independent quality assessment must bind the exact reviewer and review time"
          });
        }
      }
    }
  });

export const TermixReviewerPacketV3Schema = z
  .strictObject({
    schemaVersion: z.literal(TERMIX_REVIEWER_PACKET_SCHEMA_VERSION),
    packetId: BenchmarkIdSchema,
    preparedAtUtc: UtcDateTimeSchema,
    inputPairBaseCommit: GitCommitShaSchema,
    state: z.literal("awaiting_independent_reviewer"),
    independentReviewComplete: z.literal(false),
    publishable: z.literal(false),
    claimBoundary: z.string().trim().min(1).max(1_000),
    reviewContract: z.strictObject({
      runtimeFiles: z
        .array(
          z.strictObject({
            path: RepositoryPathSchema,
            sha256: Sha256Schema
          })
        )
        .length(TERMIX_REVIEW_RUNTIME_PATHS.length),
      reviewRecordPath: RepositoryPathSchema,
      requiredChecks: z.tuple([
        z.literal("pairSchemaValidated"),
        z.literal("artifactDigestsVerified"),
        z.literal("receiptsReobserved"),
        z.literal("rubricRecomputed"),
        z.literal("rawOutputsReviewed"),
        z.literal("manualNoAgentToolLogReviewed")
      ]),
      verifiedPairRule: z.string().trim().min(1).max(2_000),
      adjudicationRule: z.string().trim().min(1).max(2_000),
      failureRule: z.string().trim().min(1).max(2_000)
    }),
    tasks: z
      .array(
        z.strictObject({
          taskId: TermixReviewTaskIdSchema,
          pairId: BenchmarkIdSchema,
          inputPairPath: RepositoryPathSchema,
          inputPairBytesSha256: Sha256Schema,
          inputPairLogicalSha256: Sha256Schema,
          declarationSha256: Sha256Schema,
          selfReviewPath: RepositoryPathSchema,
          selfReviewBytesSha256: Sha256Schema,
          reviewerMustProduce: z.strictObject({
            verifiedPairPath: RepositoryPathSchema,
            adjudicationPath: RepositoryPathSchema
          }),
          evidence: z.array(TermixReviewEvidenceSchema).min(1).max(100)
        })
      )
      .length(3),
    generatedFrom: z.strictObject({
      sourceCommit: GitCommitShaSchema,
      packetV1Path: RepositoryPathSchema,
      packetV1BytesSha256: Sha256Schema,
      supersededPacketPath: RepositoryPathSchema,
      supersededPacketBytesSha256: Sha256Schema,
      supersessionReason: z.string().trim().min(1).max(1_000)
    })
  })
  .superRefine((packet, context) => {
    const runtimePaths = packet.reviewContract.runtimeFiles.map(({ path }) => path);
    if (
      new Set(runtimePaths).size !== TERMIX_REVIEW_RUNTIME_PATHS.length ||
      !TERMIX_REVIEW_RUNTIME_PATHS.every((path) => runtimePaths.includes(path))
    ) {
      context.addIssue({
        code: "custom",
        path: ["reviewContract", "runtimeFiles"],
        message: "Reviewer packet must bind the exact protected materialization runtime closure"
      });
    }
    const taskIds = packet.tasks.map(({ taskId }) => taskId);
    if (
      new Set(taskIds).size !== TERMIX_REVIEW_TASK_IDS.length ||
      !TERMIX_REVIEW_TASK_IDS.every((taskId) => taskIds.includes(taskId))
    ) {
      context.addIssue({
        code: "custom",
        path: ["tasks"],
        message: "Reviewer packet must contain the exact three TermiX tasks"
      });
    }
    for (const [index, task] of packet.tasks.entries()) {
      if (!task.reviewerMustProduce.verifiedPairPath.startsWith("evidence/termix/final-pairs/")) {
        context.addIssue({
          code: "custom",
          path: ["tasks", index, "reviewerMustProduce", "verifiedPairPath"],
          message: "Verified pair path must be admitted by the final compiler"
        });
      }
      if (!task.reviewerMustProduce.adjudicationPath.startsWith("evidence/termix/adjudications/")) {
        context.addIssue({
          code: "custom",
          path: ["tasks", index, "reviewerMustProduce", "adjudicationPath"],
          message: "Adjudication path must be admitted by the final compiler"
        });
      }
    }
  });

export const TermixProtectedIndependentAdjudicationSchema = z.strictObject({
  schemaVersion: z.literal(TERMIX_ADJUDICATION_SCHEMA_VERSION),
  taskId: TermixReviewTaskIdSchema,
  pairId: BenchmarkIdSchema,
  pairSha256: Sha256Schema,
  declarationSha256: Sha256Schema,
  inputPairPath: RepositoryPathSchema,
  inputPairBytesSha256: Sha256Schema,
  inputPairLogicalSha256: Sha256Schema,
  packetPath: RepositoryPathSchema,
  packetBytesSha256: Sha256Schema,
  reviewRecordPath: RepositoryPathSchema,
  reviewRecordBytesSha256: Sha256Schema,
  reviewedAtUtc: UtcDateTimeSchema,
  reviewer: TermixReviewerIdentitySchema,
  checks: TermixIndependentReviewChecksSchema,
  evidence: z.array(TermixReviewEvidenceSchema).min(2).max(100),
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50)
});

const STALE_PAIR_LIMITATION =
  /self-review|implementation-adjacent|remain unverified|remains unverified|requires (?:a )?(?:genuinely )?independent|not independent/iu;
const STALE_RUN_LIMITATION =
  "The normalized score is an implementation-adjacent deterministic self-review, not an independent adjudication.";

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function expectedRun(
  run: PairedBenchmark["agentRun"],
  review: z.infer<typeof TermixRunIndependentReviewSchema>,
  reviewer: z.infer<typeof TermixReviewerIdentitySchema>,
  reviewedAtUtc: string
): PairedBenchmark["agentRun"] {
  return {
    ...run,
    receipts: run.receipts.map((receipt) => ({
      ...receipt,
      verification: {
        state: "verified" as const,
        verifiedAtUtc: reviewedAtUtc,
        verifier: reviewer.name,
        method: review.receiptVerificationMethod
      }
    })),
    qualityAssessment: review.qualityAssessment,
    evidenceState: {
      state: "verified" as const,
      reason: null,
      verifiedAtUtc: reviewedAtUtc,
      verifier: reviewer.name,
      method: review.evidenceStateMethod,
      evidenceArtifactIds: review.evidenceArtifactIds
    },
    limitations: distinct([
      ...run.limitations.filter((limitation) => limitation !== STALE_RUN_LIMITATION),
      ...review.limitations
    ])
  };
}

export function materializeTermixVerifiedPair(
  inputPair: unknown,
  reviewRecord: unknown,
  taskId: (typeof TERMIX_REVIEW_TASK_IDS)[number]
): PairedBenchmark {
  const pair = PairedBenchmarkSchema.parse(inputPair);
  const review = TermixIndependentReviewRecordSchema.parse(reviewRecord);
  const task = review.tasks.find((candidate) => candidate.taskId === taskId);
  if (task === undefined) throw new Error("TERMIX_REVIEW_TASK_MISSING");
  if (
    pair.pairId !== task.pairId ||
    pair.agentRun.declaration.task.taskId !== taskId ||
    sha256Canonical(pair) !== task.inputPairLogicalSha256 ||
    benchmarkDeclarationSha256(pair.agentRun.declaration) !== task.declarationSha256
  ) {
    throw new Error("TERMIX_REVIEW_INPUT_PAIR_MISMATCH");
  }
  const result = PairedBenchmarkSchema.parse({
    ...pair,
    agentRun: expectedRun(
      pair.agentRun,
      task.runReviews.agent,
      review.reviewer,
      review.reviewedAtUtc
    ),
    manualRun: expectedRun(
      pair.manualRun,
      task.runReviews.manual,
      review.reviewer,
      review.reviewedAtUtc
    ),
    limitations: distinct([
      ...pair.limitations.filter((limitation) => !STALE_PAIR_LIMITATION.test(limitation)),
      ...task.limitations,
      ...review.limitations
    ])
  });
  assertTermixVerifiedDerivative(pair, result, review, taskId);
  return result;
}

export function termixProtectedPairProjection(input: unknown): unknown {
  const pair = PairedBenchmarkSchema.parse(input);
  const projectRun = (run: PairedBenchmark["agentRun"]) => ({
    runId: run.runId,
    declaration: run.declaration,
    method: run.method,
    timing: run.timing,
    costs: run.costs,
    artifacts: run.artifacts,
    receipts: run.receipts.map((receipt) =>
      receipt.kind === "transaction"
        ? {
            receiptId: receipt.receiptId,
            kind: receipt.kind,
            chainId: receipt.chainId,
            transactionHash: receipt.transactionHash,
            explorerUrl: receipt.explorerUrl,
            observedAtUtc: receipt.observedAtUtc,
            rawReceiptArtifactId: receipt.rawReceiptArtifactId
          }
        : {
            receiptId: receipt.receiptId,
            kind: receipt.kind,
            provider: receipt.provider,
            endpointUrl: receipt.endpointUrl,
            requestId: receipt.requestId,
            observedAtUtc: receipt.observedAtUtc,
            responseSha256: receipt.responseSha256,
            responseArtifactId: receipt.responseArtifactId
          }
    ),
    reproductionCommands: run.reproductionCommands
  });
  return {
    schemaVersion: pair.schemaVersion,
    pairId: pair.pairId,
    agentRun: projectRun(pair.agentRun),
    manualRun: projectRun(pair.manualRun)
  };
}

export function assertTermixVerifiedDerivative(
  inputPair: unknown,
  derivativePair: unknown,
  reviewRecord: unknown,
  taskId: (typeof TERMIX_REVIEW_TASK_IDS)[number]
): void {
  const input = PairedBenchmarkSchema.parse(inputPair);
  const derivative = PairedBenchmarkSchema.parse(derivativePair);
  const review = TermixIndependentReviewRecordSchema.parse(reviewRecord);
  const task = review.tasks.find((candidate) => candidate.taskId === taskId);
  if (task === undefined) throw new Error("TERMIX_REVIEW_TASK_MISSING");
  if (
    input.pairId !== task.pairId ||
    input.agentRun.declaration.task.taskId !== taskId ||
    sha256Canonical(input) !== task.inputPairLogicalSha256 ||
    benchmarkDeclarationSha256(input.agentRun.declaration) !== task.declarationSha256
  ) {
    throw new Error("TERMIX_REVIEW_INPUT_PAIR_MISMATCH");
  }
  if (
    canonicalJson(termixProtectedPairProjection(input)) !==
    canonicalJson(termixProtectedPairProjection(derivative))
  ) {
    throw new Error("TERMIX_VERIFIED_PAIR_PROTECTED_PROJECTION_DRIFT");
  }
  const expected = {
    ...input,
    agentRun: expectedRun(
      input.agentRun,
      task.runReviews.agent,
      review.reviewer,
      review.reviewedAtUtc
    ),
    manualRun: expectedRun(
      input.manualRun,
      task.runReviews.manual,
      review.reviewer,
      review.reviewedAtUtc
    ),
    limitations: distinct([
      ...input.limitations.filter((limitation) => !STALE_PAIR_LIMITATION.test(limitation)),
      ...task.limitations,
      ...review.limitations
    ])
  };
  if (canonicalJson(derivative) !== canonicalJson(PairedBenchmarkSchema.parse(expected))) {
    throw new Error("TERMIX_VERIFIED_PAIR_REVIEW_METADATA_MISMATCH");
  }
}

export function assertTermixAdjudicationBinding(
  inputPair: unknown,
  derivativePair: unknown,
  reviewRecord: unknown,
  adjudicationInput: unknown
): void {
  const adjudication = TermixProtectedIndependentAdjudicationSchema.parse(adjudicationInput);
  const review = TermixIndependentReviewRecordSchema.parse(reviewRecord);
  const task = review.tasks.find((candidate) => candidate.taskId === adjudication.taskId);
  if (task === undefined) throw new Error("TERMIX_REVIEW_TASK_MISSING");
  assertTermixVerifiedDerivative(inputPair, derivativePair, review, adjudication.taskId);
  const derivative = PairedBenchmarkSchema.parse(derivativePair);
  if (
    adjudication.pairId !== derivative.pairId ||
    adjudication.pairSha256 !== sha256Canonical(derivative) ||
    adjudication.declarationSha256 !== task.declarationSha256 ||
    adjudication.inputPairPath !== task.inputPairPath ||
    adjudication.inputPairBytesSha256 !== task.inputPairBytesSha256 ||
    adjudication.inputPairLogicalSha256 !== task.inputPairLogicalSha256 ||
    adjudication.packetPath !== review.packetPath ||
    adjudication.packetBytesSha256 !== review.packetBytesSha256 ||
    adjudication.reviewedAtUtc !== review.reviewedAtUtc ||
    canonicalJson(adjudication.reviewer) !== canonicalJson(review.reviewer) ||
    canonicalJson(adjudication.checks) !== canonicalJson(task.checks)
  ) {
    throw new Error("TERMIX_ADJUDICATION_REVIEW_BINDING_MISMATCH");
  }
}
