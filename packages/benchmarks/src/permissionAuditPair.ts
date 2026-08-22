import { z } from "zod";

import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.js";
import { PERMISSION_AUDIT_ENGINE_VERSION, PermissionAuditOutputSchema } from "./permissionAudit.js";
import {
  benchmarkDeclarationSha256,
  summarizePairedBenchmark,
  type PairedBenchmarkSummary
} from "./pair.js";
import { TermixTimedRunRequestSchema } from "./runner.js";
import {
  BenchmarkDeclarationSchema,
  BENCHMARK_SCHEMA_VERSION,
  PairedBenchmarkSchema,
  Sha256Schema,
  UtcDateTimeSchema,
  type BenchmarkArtifact,
  type BenchmarkMethod,
  type BenchmarkRun,
  type PairedBenchmark,
  type ReceiptReference
} from "./schemas.js";

const PERMISSION_AUDIT_PAIR_ID = "permission-audit-pair-20260822-v1" as const;
const SELF_REVIEWER = "ProofEra deterministic post-run self-review v1" as const;

const apiResponseSchema = z.strictObject({
  body: z.string().min(1).max(2_000_000),
  bytes: z.number().int().nonnegative(),
  endpointUrl: z.string().url(),
  observedAtUtc: UtcDateTimeSchema,
  provider: z.string().trim().min(1).max(200),
  receiptId: z.string().trim().min(1).max(100),
  requestId: z.string().trim().min(1).max(500),
  sha256: Sha256Schema
});

const captureSchema = z.strictObject({
  apiResponses: z.array(apiResponseSchema).min(1).max(100),
  boundaries: z.strictObject({
    agentWasRegisteredBeforeStart: z.boolean(),
    declarationDigestMatched: z.literal(true),
    fixedRunnerLane: z.literal(true),
    hireReceiptWasVerifiedBeforeStart: z.boolean(),
    repositoryCommitMatched: z.literal(true),
    repositoryWasCleanBeforeStart: z.literal(true)
  }),
  declarationSha256: Sha256Schema,
  hireReceipt: z
    .strictObject({
      bytes: z.number().int().nonnegative(),
      explorerUrl: z.string().url(),
      observedAtUtc: UtcDateTimeSchema,
      rawReceipt: z.string().min(1).max(2_000_000),
      rawReceiptSha256: Sha256Schema,
      transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/u),
      verifiedAtUtc: UtcDateTimeSchema
    })
    .nullable(),
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50),
  methodKind: z.enum(["agent", "manual"]),
  output: z.strictObject({
    body: z.string().min(1).max(2_000_000),
    bytes: z.number().int().nonnegative(),
    mediaType: z.string().trim().min(1).max(200),
    sha256: Sha256Schema
  }),
  protocolVersion: z.literal("proofera-termix-timed-runner-v1.0.0"),
  runId: z.string().trim().min(1).max(100),
  runnerId: z.enum(["permission-audit-agent-v1", "permission-audit-manual-v1"]),
  sourceCommitSha: z.string().regex(/^[0-9a-f]{40}$/u),
  timing: z.strictObject({
    activeDurationNanoseconds: z.string().regex(/^(0|[1-9][0-9]*)$/u),
    activeSegments: z
      .array(
        z.strictObject({
          description: z.string().trim().min(1).max(500),
          endedAtNanoseconds: z.string().regex(/^(0|[1-9][0-9]*)$/u),
          segmentId: z.string().trim().min(1).max(100),
          startedAtNanoseconds: z.string().regex(/^(0|[1-9][0-9]*)$/u)
        })
      )
      .min(1)
      .max(100),
    endedAtUtc: UtcDateTimeSchema,
    monotonicClock: z.string().trim().min(1).max(200),
    monotonicDurationNanoseconds: z.string().regex(/^(0|[1-9][0-9]*)$/u),
    startedAtUtc: UtcDateTimeSchema
  })
});

const answerKeySchema = z.strictObject({
  bundleSha256: Sha256Schema,
  engineVersion: z.literal(PERMISSION_AUDIT_ENGINE_VERSION),
  output: PermissionAuditOutputSchema,
  schemaVersion: z.literal("proofera-termix-permission-audit-answer-key-v1.0.0")
});

const manualOutputSchema = z.strictObject({
  agentInvoked: z.literal(false),
  bundleSha256: Sha256Schema,
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50),
  manualProcedureVersion: z.literal("proofera-termix-permission-audit-manual-v1.0.0"),
  operatorRole: z.string().trim().min(1).max(200),
  result: PermissionAuditOutputSchema,
  schemaVersion: z.literal("proofera-termix-permission-audit-manual-output-v1.0.0")
});

const invocationSchema = z.strictObject({
  bundleSha256: Sha256Schema,
  timedRunRequest: TermixTimedRunRequestSchema
});

const sourceSchema = z.strictObject({
  agentCapturePath: z.string().trim().min(1).max(500),
  agentInvocationPath: z.string().trim().min(1).max(500),
  manualCapturePath: z.string().trim().min(1).max(500),
  manualInvocationPath: z.string().trim().min(1).max(500)
});

export const PermissionAuditSelfReviewSchema = z.strictObject({
  schemaVersion: z.literal("proofera-termix-permission-audit-self-review-v1.0.0"),
  taskId: z.literal("autonomous-session-permission-audit"),
  pairId: z.literal(PERMISSION_AUDIT_PAIR_ID),
  pairSha256: Sha256Schema,
  answerKeySha256: Sha256Schema,
  reviewedAtUtc: UtcDateTimeSchema,
  reviewState: z.literal("self_reviewed_unverified"),
  reviewer: z.strictObject({
    name: z.literal("OpenAI Codex repository operator"),
    role: z.literal("Implementation-adjacent evidence reviewer"),
    independenceBasis: z.literal(
      "Not independent: the reviewer also operated the repository workflow, so this record cannot satisfy the second-reviewer gate."
    )
  }),
  checks: z.strictObject({
    answerKeyDigestMatched: z.literal(true),
    artifactDigestsVerified: z.literal(true),
    exactOutputParity: z.literal(true),
    manualBeforeAgentOrderVerified: z.literal(true),
    noWriteBoundaryVerified: z.literal(true),
    rubricRecomputed: z.literal(true),
    secondReviewerIndependent: z.literal(false)
  }),
  quality: z.strictObject({
    maximumPoints: z.literal(100),
    agentPoints: z.literal(100),
    manualPoints: z.literal(100)
  }),
  sources: sourceSchema,
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20)
});

export interface BuildPermissionAuditPairInput {
  readonly agentCapture: unknown;
  readonly manualCapture: unknown;
  readonly agentInvocation: unknown;
  readonly manualInvocation: unknown;
  readonly answerKey: unknown;
  readonly answerKeySha256: string;
  readonly reviewedAtUtc: string;
  readonly sources: z.input<typeof sourceSchema>;
}

export interface PermissionAuditPairBuildResult {
  readonly pair: PairedBenchmark;
  readonly summary: PairedBenchmarkSummary;
  readonly selfReview: z.output<typeof PermissionAuditSelfReviewSchema>;
}

/**
 * Normalize the two immutable Task 02 captures without inventing independence.
 * Exact answer-key parity earns rubric points, while both evidence states remain
 * unverified until a genuinely independent second reviewer signs an adjudication.
 */
export function buildPermissionAuditPair(
  input: BuildPermissionAuditPairInput
): PermissionAuditPairBuildResult {
  const reviewedAtUtc = UtcDateTimeSchema.parse(input.reviewedAtUtc);
  const sources = sourceSchema.parse(input.sources);
  const agentCapture = captureSchema.parse(input.agentCapture);
  const manualCapture = captureSchema.parse(input.manualCapture);
  const agentInvocation = invocationSchema.parse(input.agentInvocation);
  const manualInvocation = invocationSchema.parse(input.manualInvocation);
  const answerKey = answerKeySchema.parse(input.answerKey);
  const answerKeySha256 = Sha256Schema.parse(input.answerKeySha256);

  verifyBindings(
    agentCapture,
    manualCapture,
    agentInvocation,
    manualInvocation,
    answerKey,
    answerKeySha256,
    reviewedAtUtc
  );

  const agentOutput = PermissionAuditOutputSchema.parse(JSON.parse(agentCapture.output.body));
  const manualEnvelope = manualOutputSchema.parse(JSON.parse(manualCapture.output.body));
  const declaration = BenchmarkDeclarationSchema.parse(agentInvocation.timedRunRequest.declaration);
  const qualityArtifacts = {
    agent: "agent-output",
    manual: "manual-output"
  } as const;

  const agentRun = buildRun({
    capture: agentCapture,
    declaration,
    method: agentInvocation.timedRunRequest.method,
    output: agentOutput,
    outputArtifactId: qualityArtifacts.agent,
    capturePath: sources.agentCapturePath,
    invocationPath: sources.agentInvocationPath,
    reviewedAtUtc
  });
  const manualRun = buildRun({
    capture: manualCapture,
    declaration,
    method: manualInvocation.timedRunRequest.method,
    output: manualEnvelope.result,
    outputArtifactId: qualityArtifacts.manual,
    capturePath: sources.manualCapturePath,
    invocationPath: sources.manualInvocationPath,
    reviewedAtUtc
  });

  const pair = PairedBenchmarkSchema.parse({
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    pairId: PERMISSION_AUDIT_PAIR_ID,
    agentRun,
    manualRun,
    limitations: [
      "Both timed outputs exactly match the committed reviewer-held answer key, but the post-run reviewer operated this repository workflow and is not independent.",
      "The pair remains unverified and non-publishable until a distinct second reviewer reobserves receipts, checks the manual no-agent log and signs the digest-bound adjudication.",
      "Cost lines record explicit zero incremental tBNB fees inside each timed lane; they do not price human labor or allocate the earlier paid marketplace hire.",
      "Equal rubric scores establish deterministic parity on this frozen corpus only, not general security performance or agent advantage."
    ]
  });
  const summary = summarizePairedBenchmark(pair);
  if (summary.claimState !== "unverified" || summary.publishableClaim) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_CLAIM_BOUNDARY_INVALID");
  }
  const selfReview = PermissionAuditSelfReviewSchema.parse({
    schemaVersion: "proofera-termix-permission-audit-self-review-v1.0.0",
    taskId: "autonomous-session-permission-audit",
    pairId: PERMISSION_AUDIT_PAIR_ID,
    pairSha256: summary.pairSha256,
    answerKeySha256,
    reviewedAtUtc,
    reviewState: "self_reviewed_unverified",
    reviewer: {
      name: "OpenAI Codex repository operator",
      role: "Implementation-adjacent evidence reviewer",
      independenceBasis:
        "Not independent: the reviewer also operated the repository workflow, so this record cannot satisfy the second-reviewer gate."
    },
    checks: {
      answerKeyDigestMatched: true,
      artifactDigestsVerified: true,
      exactOutputParity: true,
      manualBeforeAgentOrderVerified: true,
      noWriteBoundaryVerified: true,
      rubricRecomputed: true,
      secondReviewerIndependent: false
    },
    quality: { maximumPoints: 100, agentPoints: 100, manualPoints: 100 },
    sources,
    limitations: pair.limitations
  });
  return { pair, summary, selfReview };
}

type ParsedCapture = z.output<typeof captureSchema>;

function verifyBindings(
  agent: ParsedCapture,
  manual: ParsedCapture,
  agentInvocation: z.output<typeof invocationSchema>,
  manualInvocation: z.output<typeof invocationSchema>,
  answerKey: z.output<typeof answerKeySchema>,
  answerKeySha256: string,
  reviewedAtUtc: string
): void {
  if (sha256Canonical(answerKey) !== answerKeySha256) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_ANSWER_KEY_DIGEST_MISMATCH");
  }
  if (
    agentInvocation.bundleSha256 !== manualInvocation.bundleSha256 ||
    answerKey.bundleSha256 !== agentInvocation.bundleSha256 ||
    answerKey.output.bundleSha256 !== answerKey.bundleSha256
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_BUNDLE_MISMATCH");
  }
  const expectedAnswerKeyDigest =
    agentInvocation.timedRunRequest.declaration.environment.parameters.find(
      ({ key }) => key === "corpus-answer-key-digest"
    )?.value;
  if (
    expectedAnswerKeyDigest?.encoding !== "string" ||
    expectedAnswerKeyDigest.value !== answerKeySha256
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_ANSWER_KEY_UNBOUND");
  }
  const agentDeclarationSha = benchmarkDeclarationSha256(
    agentInvocation.timedRunRequest.declaration
  );
  const manualDeclarationSha = benchmarkDeclarationSha256(
    manualInvocation.timedRunRequest.declaration
  );
  if (
    agentDeclarationSha !== manualDeclarationSha ||
    agent.declarationSha256 !== agentDeclarationSha ||
    manual.declarationSha256 !== manualDeclarationSha
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_DECLARATION_MISMATCH");
  }
  if (
    agent.runId !== agentInvocation.timedRunRequest.runId ||
    manual.runId !== manualInvocation.timedRunRequest.runId ||
    agent.sourceCommitSha !== agentInvocation.timedRunRequest.sourceCommitSha ||
    manual.sourceCommitSha !== manualInvocation.timedRunRequest.sourceCommitSha ||
    agent.runnerId !== "permission-audit-agent-v1" ||
    manual.runnerId !== "permission-audit-manual-v1" ||
    agent.methodKind !== "agent" ||
    manual.methodKind !== "manual"
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_CAPTURE_BINDING_MISMATCH");
  }
  if (
    !agent.boundaries.agentWasRegisteredBeforeStart ||
    !agent.boundaries.hireReceiptWasVerifiedBeforeStart ||
    agent.hireReceipt === null ||
    manual.boundaries.agentWasRegisteredBeforeStart ||
    manual.boundaries.hireReceiptWasVerifiedBeforeStart ||
    manual.hireReceipt !== null
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_LANE_BOUNDARY_INVALID");
  }
  if (Date.parse(manual.timing.endedAtUtc) >= Date.parse(agent.timing.startedAtUtc)) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_RUN_ORDER_INVALID");
  }
  if (
    Date.parse(reviewedAtUtc) < Date.parse(agent.timing.endedAtUtc) ||
    Date.parse(reviewedAtUtc) < Date.parse(manual.timing.endedAtUtc)
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_REVIEW_TIME_INVALID");
  }
  verifyCaptureBytes(agent);
  verifyCaptureBytes(manual);
  const agentOutput = PermissionAuditOutputSchema.parse(JSON.parse(agent.output.body));
  const manualOutput = manualOutputSchema.parse(JSON.parse(manual.output.body));
  if (
    canonicalJson(agentOutput) !== canonicalJson(answerKey.output) ||
    canonicalJson(manualOutput.result) !== canonicalJson(answerKey.output) ||
    agentOutput.executionPerformed ||
    manualOutput.result.executionPerformed
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_OUTPUT_MISMATCH");
  }
  if (
    agent.apiResponses.length !== 5 ||
    manual.apiResponses.length !== 4 ||
    !agent.apiResponses.some(({ provider }) => provider === "ProofEra Permission Auditor A2A") ||
    manual.apiResponses.some(({ provider }) => provider === "ProofEra Permission Auditor A2A")
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_TOOL_BOUNDARY_INVALID");
  }
}

function verifyCaptureBytes(capture: ParsedCapture): void {
  if (
    Buffer.byteLength(capture.output.body) !== capture.output.bytes ||
    sha256Bytes(capture.output.body) !== capture.output.sha256
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_OUTPUT_DIGEST_MISMATCH");
  }
  for (const response of capture.apiResponses) {
    if (
      Buffer.byteLength(response.body) !== response.bytes ||
      sha256Bytes(response.body) !== response.sha256
    ) {
      throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_RECEIPT_DIGEST_MISMATCH");
    }
  }
  if (
    capture.hireReceipt !== null &&
    (Buffer.byteLength(capture.hireReceipt.rawReceipt) !== capture.hireReceipt.bytes ||
      sha256Bytes(capture.hireReceipt.rawReceipt) !== capture.hireReceipt.rawReceiptSha256)
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_HIRE_DIGEST_MISMATCH");
  }
}

interface BuildRunInput {
  readonly capture: ParsedCapture;
  readonly declaration: z.output<typeof BenchmarkDeclarationSchema>;
  readonly method: BenchmarkMethod;
  readonly output: z.output<typeof PermissionAuditOutputSchema>;
  readonly outputArtifactId: "agent-output" | "manual-output";
  readonly capturePath: string;
  readonly invocationPath: string;
  readonly reviewedAtUtc: string;
}

function buildRun(input: BuildRunInput): BenchmarkRun {
  const artifacts: BenchmarkArtifact[] = [
    {
      artifactId: input.outputArtifactId,
      role: "output",
      description: "Unedited canonical timed-lane output retained inside the immutable capture.",
      mediaType: input.capture.output.mediaType,
      sha256: input.capture.output.sha256,
      locator: { kind: "repository", path: input.capturePath }
    },
    ...input.capture.apiResponses.map((response, index) => ({
      artifactId: `${input.method.kind}-api-${index}`,
      role: "raw-receipt" as const,
      description: `Raw ${response.provider} request/response envelope retained inside the immutable capture.`,
      mediaType: "application/json",
      sha256: response.sha256,
      locator: { kind: "repository" as const, path: input.capturePath }
    }))
  ];
  if (input.capture.hireReceipt !== null) {
    artifacts.push({
      artifactId: "agent-hire-raw",
      role: "raw-receipt",
      description:
        "Verified pre-run ProofEra hire receipt retained for provenance; excluded from timed receipt and cost deltas.",
      mediaType: "application/json",
      sha256: input.capture.hireReceipt.rawReceiptSha256,
      locator: { kind: "repository", path: input.capturePath }
    });
  }
  const receipts: ReceiptReference[] = input.capture.apiResponses.map((response, index) => ({
    receiptId: `${input.method.kind}-api-receipt-${index}`,
    kind: "api",
    provider: response.provider,
    endpointUrl: response.endpointUrl,
    requestId: response.requestId,
    observedAtUtc: response.observedAtUtc,
    responseSha256: response.sha256,
    responseArtifactId: `${input.method.kind}-api-${index}`,
    verification: {
      state: "verified",
      verifiedAtUtc: input.reviewedAtUtc,
      verifier: SELF_REVIEWER,
      method:
        "Recomputed retained response bytes and revalidated the frozen RPC/A2A response contract."
    }
  }));
  const grantIndex = input.capture.apiResponses.findIndex(({ receiptId }) =>
    receiptId.endsWith("-grant")
  );
  if (grantIndex < 0) throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_GRANT_RECEIPT_MISSING");
  const grantResponse = input.capture.apiResponses[grantIndex];
  if (grantResponse === undefined) throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_GRANT_INVALID");
  const grantTransactionHash = transactionHashFromRpcEnvelope(grantResponse.body);
  receipts.push({
    receiptId: `${input.method.kind}-authority-grant-transaction`,
    kind: "transaction",
    chainId: 97,
    transactionHash: grantTransactionHash,
    explorerUrl: `https://testnet.bscscan.com/tx/${grantTransactionHash}`,
    observedAtUtc: grantResponse.observedAtUtc,
    rawReceiptArtifactId: `${input.method.kind}-api-${grantIndex}`,
    verification: {
      state: "verified",
      verifiedAtUtc: input.reviewedAtUtc,
      verifier: SELF_REVIEWER,
      method:
        "Parsed the exact retained eth_getTransactionReceipt response and matched successful chain-97 grant lifecycle evidence."
    }
  });
  const costReceipt = receipts.find(({ kind }) => kind === "api");
  if (costReceipt === undefined)
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_COST_SOURCE_MISSING");
  const evidence = [
    { kind: "artifact" as const, artifactId: input.outputArtifactId },
    { kind: "receipt" as const, receiptId: costReceipt.receiptId }
  ];
  const scores = input.declaration.qualityRubric.criteria.map((criterion) => ({
    criterionId: criterion.criterionId,
    points: criterion.maximumPoints,
    rationale: scoreRationale(criterion.criterionId),
    evidence
  }));
  return {
    runId: input.capture.runId,
    declaration: input.declaration,
    method: input.method,
    timing: {
      startedAtUtc: input.capture.timing.startedAtUtc,
      endedAtUtc: input.capture.timing.endedAtUtc,
      monotonicDurationNanoseconds: input.capture.timing.monotonicDurationNanoseconds,
      monotonicClock: input.capture.timing.monotonicClock
    },
    costs: {
      state: "complete",
      reason: null,
      lineItems: [
        {
          costId: `${input.method.kind}-incremental-testnet-fee`,
          category: "other",
          description:
            "Explicit zero incremental tBNB fee during the timed read-only lane; human labor and the earlier prepaid hire are not monetized or allocated.",
          amountMinorUnits: "0",
          denomination: {
            kind: "asset",
            chainId: 97,
            symbol: "tBNB",
            contractAddress: null,
            minorUnitDecimals: 18
          },
          incurredAtUtc: costReceipt.observedAtUtc,
          sources: [{ kind: "receipt", receiptId: costReceipt.receiptId }]
        }
      ]
    },
    artifacts,
    receipts,
    qualityAssessment: {
      assessedAtUtc: input.reviewedAtUtc,
      assessor: SELF_REVIEWER,
      scores
    },
    reproductionCommands: [
      {
        step: 1,
        workingDirectory: ".",
        command: "pnpm --filter @proofera/benchmarks test",
        expectedArtifactIds: [input.outputArtifactId]
      }
    ],
    limitations: [
      ...input.capture.limitations,
      "The normalized score is an implementation-adjacent deterministic self-review, not an independent adjudication.",
      `The exact invocation is retained at ${input.invocationPath}.`,
      "Active operator segments remain available only in the raw timed capture; the generic pair schema compares full monotonic wall duration."
    ],
    evidenceState: {
      state: "unverified",
      reason:
        "A distinct independent second reviewer has not reobserved the receipts, reviewed the manual no-agent log and signed the exact pair digest."
    }
  };
}

function transactionHashFromRpcEnvelope(body: string): string {
  const envelope = z
    .strictObject({ requestBody: z.string().min(1), responseBody: z.string().min(1) })
    .parse(JSON.parse(body));
  const response = z
    .strictObject({
      id: z.string().min(1),
      jsonrpc: z.literal("2.0"),
      result: z.looseObject({
        status: z.literal("0x1"),
        transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/u)
      })
    })
    .parse(JSON.parse(envelope.responseBody));
  return response.result.transactionHash.toLowerCase();
}

function scoreRationale(criterionId: string): string {
  const rationales: Record<string, string> = {
    "true-positive-coverage":
      "Normalized finding IDs, severities and source joins exactly match the reviewer-held answer key.",
    "false-positive-discipline":
      "The canonical output contains no unsupported or duplicate finding beyond the exact answer key.",
    "impact-reproduction":
      "Every finding retains a non-secret impact statement, read-only reproduction and evidence-artifact join.",
    "least-authority-correction":
      "The corrected table exactly covers wallet confirmation, runtime validation, direct authority, unknown outcome, revoke and signer custody.",
    "evidence-reproducibility":
      "The raw capture retains exact output/API bytes, digests, timing, explicit-zero incremental cost, limitations and fixed invocations."
  };
  const rationale = rationales[criterionId];
  if (rationale === undefined) throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_RUBRIC_UNKNOWN");
  return rationale;
}
