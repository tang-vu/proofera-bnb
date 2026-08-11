import { z } from "zod";

import { isCanonicalJsonText, sha256Canonical } from "./canonical.js";

export const BENCHMARK_SCHEMA_VERSION = "proofera-termix-pair-v1.0.0";

export const BenchmarkIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "Expected lowercase SHA-256");
export const GitCommitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
export const EvmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const TransactionHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const UnsignedIntegerStringSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/, "Expected a canonical unsigned integer string")
  .refine((value) => BigInt(value) < 1n << 256n, "Value exceeds uint256");
export const UtcDateTimeSchema = z.iso
  .datetime()
  .refine((value) => value.endsWith("Z"), "Timestamp must use UTC with a Z suffix");

export const SafeHttpUrlSchema = z
  .url()
  .max(2_048)
  .superRefine((value, context) => {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) {
      context.addIssue({
        code: "custom",
        message: "URLs must use HTTPS; HTTP is permitted only for localhost"
      });
    }
    if (url.username !== "" || url.password !== "" || url.hash !== "") {
      context.addIssue({
        code: "custom",
        message: "URLs must not contain credentials or fragments"
      });
    }
    const sensitiveParameters = new Set([
      "api_key",
      "apikey",
      "access_token",
      "token",
      "secret",
      "signature",
      "private_key"
    ]);
    if ([...url.searchParams.keys()].some((key) => sensitiveParameters.has(key.toLowerCase()))) {
      context.addIssue({
        code: "custom",
        message: "URLs must not embed secret-bearing query parameters"
      });
    }
  });

export const RepositoryPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .superRefine((value, context) => {
    const normalized = value.replaceAll("\\", "/");
    if (
      normalized.startsWith("/") ||
      normalized === "~" ||
      normalized.startsWith("~/") ||
      normalized.includes("://") ||
      /^[A-Za-z]:/.test(normalized) ||
      normalized.split("/").includes("..")
    ) {
      context.addIssue({ code: "custom", message: "Expected a repository-relative safe path" });
    }
  });

const exactStringValueSchema = z.strictObject({
  encoding: z.literal("string"),
  value: z.string().max(32_768)
});
const exactIntegerValueSchema = z.strictObject({
  encoding: z.literal("decimal_integer"),
  value: z
    .string()
    .max(79)
    .regex(/^-?(0|[1-9][0-9]*)$/, "Expected a canonical decimal integer")
});
const exactAddressValueSchema = z.strictObject({
  encoding: z.literal("evm_address"),
  value: EvmAddressSchema
});
const exactCanonicalJsonValueSchema = z.strictObject({
  encoding: z.literal("canonical_json"),
  value: z
    .string()
    .max(32_768)
    .refine(isCanonicalJsonText, "Expected canonical JSON with safe integer numbers")
});

export const ExactValueSchema = z.discriminatedUnion("encoding", [
  exactStringValueSchema,
  exactIntegerValueSchema,
  exactAddressValueSchema,
  exactCanonicalJsonValueSchema
]);

export const BenchmarkTaskSchema = z.strictObject({
  taskId: BenchmarkIdSchema,
  title: z.string().trim().min(1).max(200),
  domain: z.enum(["trading", "equities", "security", "liquidity", "yield", "lending", "other"]),
  exactDefinition: z.string().trim().min(1).max(4_000),
  successCondition: z.string().trim().min(1).max(2_000)
});

export const BenchmarkInputSchema = z.strictObject({
  inputId: BenchmarkIdSchema,
  description: z.string().trim().min(1).max(500),
  value: ExactValueSchema,
  unit: z.string().trim().min(1).max(64).nullable()
});

export const BenchmarkConstraintSchema = z.strictObject({
  constraintId: BenchmarkIdSchema,
  description: z.string().trim().min(1).max(1_000),
  enforcement: z.enum(["hard", "scored"]),
  expected: ExactValueSchema
});

export const EnvironmentComponentSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  version: z.string().trim().min(1).max(100),
  configurationSha256: Sha256Schema.nullable()
});

export const BenchmarkEnvironmentSchema = z
  .strictObject({
    kind: z.enum(["fixture", "simulation", "local", "testnet", "mainnet"]),
    chainId: z.number().int().positive().nullable(),
    networkName: z.string().trim().min(1).max(100),
    softwareCommitSha: GitCommitShaSchema,
    components: z.array(EnvironmentComponentSchema).min(1).max(50),
    parameters: z
      .array(
        z.strictObject({
          key: BenchmarkIdSchema,
          value: ExactValueSchema
        })
      )
      .max(100)
  })
  .superRefine((environment, context) => {
    if (["testnet", "mainnet"].includes(environment.kind) && environment.chainId === null) {
      context.addIssue({
        code: "custom",
        path: ["chainId"],
        message: "Onchain environments require an explicit chainId"
      });
    }
    addDuplicateIssues(
      environment.components.map(({ name }) => name),
      ["components"],
      context
    );
    addDuplicateIssues(
      environment.parameters.map(({ key }) => key),
      ["parameters"],
      context
    );
  });

export const QualityCriterionSchema = z.strictObject({
  criterionId: BenchmarkIdSchema,
  description: z.string().trim().min(1).max(1_000),
  measurement: z.string().trim().min(1).max(1_000),
  evidenceRequired: z.string().trim().min(1).max(1_000),
  maximumPoints: z.number().int().positive().max(1_000)
});

export const QualityRubricSchema = z
  .strictObject({
    rubricId: BenchmarkIdSchema,
    version: z.string().trim().min(1).max(100),
    declaredAtUtc: UtcDateTimeSchema,
    criteria: z.array(QualityCriterionSchema).min(1).max(50),
    totalMaximumPoints: z.number().int().positive().max(50_000)
  })
  .superRefine((rubric, context) => {
    addDuplicateIssues(
      rubric.criteria.map(({ criterionId }) => criterionId),
      ["criteria"],
      context
    );
    const calculated = rubric.criteria.reduce(
      (total, criterion) => total + criterion.maximumPoints,
      0
    );
    if (calculated !== rubric.totalMaximumPoints) {
      context.addIssue({
        code: "custom",
        path: ["totalMaximumPoints"],
        message: "totalMaximumPoints must equal the sum of criterion maximums"
      });
    }
  });

export const ReceiptKindSchema = z.enum(["transaction", "api"]);

export const BenchmarkDeclarationSchema = z
  .strictObject({
    benchmarkId: BenchmarkIdSchema,
    task: BenchmarkTaskSchema,
    inputs: z.array(BenchmarkInputSchema).min(1).max(100),
    constraints: z.array(BenchmarkConstraintSchema).min(1).max(100),
    environment: BenchmarkEnvironmentSchema,
    qualityRubric: QualityRubricSchema,
    requiredReceiptKinds: z.array(ReceiptKindSchema).max(2)
  })
  .superRefine((declaration, context) => {
    addDuplicateIssues(
      declaration.inputs.map(({ inputId }) => inputId),
      ["inputs"],
      context
    );
    addDuplicateIssues(
      declaration.constraints.map(({ constraintId }) => constraintId),
      ["constraints"],
      context
    );
    addDuplicateIssues(declaration.requiredReceiptKinds, ["requiredReceiptKinds"], context);
  });

const registeredAgentReferenceSchema = z.strictObject({
  state: z.literal("registered"),
  standard: z.literal("ERC-8004"),
  chainId: z.number().int().positive(),
  registryAddress: EvmAddressSchema,
  agentId: UnsignedIntegerStringSchema,
  registrySourceUrl: SafeHttpUrlSchema
});
const unregisteredAgentReferenceSchema = z.strictObject({
  state: z.literal("unregistered"),
  reason: z.string().trim().min(1).max(500)
});

export const AgentMethodSchema = z.strictObject({
  kind: z.literal("agent"),
  label: z.string().trim().min(1).max(200),
  marketplace: z.literal("ProofEra"),
  runtime: z.string().trim().min(1).max(100),
  configurationSha256: Sha256Schema,
  agentReference: z.discriminatedUnion("state", [
    registeredAgentReferenceSchema,
    unregisteredAgentReferenceSchema
  ])
});

export const ManualMethodSchema = z
  .strictObject({
    kind: z.literal("manual"),
    label: z.string().trim().min(1).max(200),
    operatorRole: z.string().trim().min(1).max(200),
    procedureVersion: z.string().trim().min(1).max(100),
    tools: z
      .array(
        z.strictObject({
          name: z.string().trim().min(1).max(100),
          version: z.string().trim().min(1).max(100)
        })
      )
      .min(1)
      .max(50)
  })
  .superRefine((method, context) => {
    addDuplicateIssues(
      method.tools.map(({ name }) => name),
      ["tools"],
      context
    );
  });

export const BenchmarkMethodSchema = z.discriminatedUnion("kind", [
  AgentMethodSchema,
  ManualMethodSchema
]);

export const ArtifactLocatorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("repository"), path: RepositoryPathSchema }),
  z.strictObject({ kind: z.literal("https"), url: SafeHttpUrlSchema }),
  z.strictObject({
    kind: z.literal("ipfs"),
    uri: z
      .string()
      .max(2_048)
      .regex(/^ipfs:\/\/(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})(?:\/[^\s]*)?$/)
  })
]);

export const BenchmarkArtifactSchema = z.strictObject({
  artifactId: BenchmarkIdSchema,
  role: z.enum(["output", "raw-receipt", "log", "configuration", "quality-evidence", "other"]),
  description: z.string().trim().min(1).max(1_000),
  mediaType: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
  sha256: Sha256Schema,
  locator: ArtifactLocatorSchema
});

const unverifiedReceiptSchema = z.strictObject({
  state: z.literal("unverified"),
  reason: z.string().trim().min(1).max(1_000)
});
const verifiedReceiptSchema = z.strictObject({
  state: z.literal("verified"),
  verifiedAtUtc: UtcDateTimeSchema,
  verifier: z.string().trim().min(1).max(200),
  method: z.string().trim().min(1).max(1_000)
});
const receiptVerificationSchema = z.discriminatedUnion("state", [
  unverifiedReceiptSchema,
  verifiedReceiptSchema
]);

export const TransactionReceiptReferenceSchema = z.strictObject({
  receiptId: BenchmarkIdSchema,
  kind: z.literal("transaction"),
  chainId: z.number().int().positive(),
  transactionHash: TransactionHashSchema,
  explorerUrl: SafeHttpUrlSchema,
  observedAtUtc: UtcDateTimeSchema,
  rawReceiptArtifactId: BenchmarkIdSchema,
  verification: receiptVerificationSchema
});

export const ApiReceiptReferenceSchema = z.strictObject({
  receiptId: BenchmarkIdSchema,
  kind: z.literal("api"),
  provider: z.string().trim().min(1).max(200),
  endpointUrl: SafeHttpUrlSchema,
  requestId: z.string().trim().min(1).max(500),
  observedAtUtc: UtcDateTimeSchema,
  responseSha256: Sha256Schema,
  responseArtifactId: BenchmarkIdSchema,
  verification: receiptVerificationSchema
});

export const ReceiptReferenceSchema = z.discriminatedUnion("kind", [
  TransactionReceiptReferenceSchema,
  ApiReceiptReferenceSchema
]);

export const FiatDenominationSchema = z.strictObject({
  kind: z.literal("currency"),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  minorUnitDecimals: z.number().int().min(0).max(18)
});

export const AssetDenominationSchema = z.strictObject({
  kind: z.literal("asset"),
  chainId: z.number().int().positive(),
  symbol: z.string().trim().min(1).max(32),
  contractAddress: EvmAddressSchema.nullable(),
  minorUnitDecimals: z.number().int().min(0).max(36)
});

export const CostDenominationSchema = z.discriminatedUnion("kind", [
  FiatDenominationSchema,
  AssetDenominationSchema
]);

export const EvidenceReferenceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("artifact"), artifactId: BenchmarkIdSchema }),
  z.strictObject({ kind: z.literal("receipt"), receiptId: BenchmarkIdSchema })
]);

export const CostLineItemSchema = z.strictObject({
  costId: BenchmarkIdSchema,
  category: z.enum(["gas", "protocol-fee", "agent-fee", "api", "labor", "other"]),
  description: z.string().trim().min(1).max(1_000),
  amountMinorUnits: UnsignedIntegerStringSchema,
  denomination: CostDenominationSchema,
  incurredAtUtc: UtcDateTimeSchema,
  sources: z.array(EvidenceReferenceSchema).min(1).max(20)
});

export const CostEvidenceSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("incomplete"),
    reason: z.string().trim().min(1).max(1_000),
    lineItems: z.array(CostLineItemSchema).max(100)
  }),
  z.strictObject({
    state: z.literal("complete"),
    reason: z.null(),
    lineItems: z.array(CostLineItemSchema).min(1).max(100)
  })
]);

export const QualityScoreSchema = z.strictObject({
  criterionId: BenchmarkIdSchema,
  points: z.number().int().nonnegative(),
  rationale: z.string().trim().min(1).max(1_000),
  evidence: z.array(EvidenceReferenceSchema).min(1).max(20)
});

export const QualityAssessmentSchema = z.strictObject({
  assessedAtUtc: UtcDateTimeSchema,
  assessor: z.string().trim().min(1).max(200),
  scores: z.array(QualityScoreSchema).min(1).max(50)
});

export const BenchmarkTimingSchema = z
  .strictObject({
    startedAtUtc: UtcDateTimeSchema.nullable(),
    endedAtUtc: UtcDateTimeSchema.nullable(),
    monotonicDurationNanoseconds: UnsignedIntegerStringSchema.nullable(),
    monotonicClock: z.string().trim().min(1).max(200)
  })
  .superRefine((timing, context) => {
    const hasEnd = timing.endedAtUtc !== null;
    const hasDuration = timing.monotonicDurationNanoseconds !== null;
    if (hasEnd !== hasDuration) {
      context.addIssue({
        code: "custom",
        message: "endedAtUtc and monotonicDurationNanoseconds must both be present or both be null"
      });
    }
    if (hasEnd && timing.startedAtUtc === null) {
      context.addIssue({
        code: "custom",
        path: ["startedAtUtc"],
        message: "A completed timing record requires startedAtUtc"
      });
    }
    if (
      timing.startedAtUtc !== null &&
      timing.endedAtUtc !== null &&
      Date.parse(timing.endedAtUtc) < Date.parse(timing.startedAtUtc)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endedAtUtc"],
        message: "endedAtUtc must not precede startedAtUtc"
      });
    }
  });

export const ReproductionCommandSchema = z.strictObject({
  step: z.number().int().positive().max(100),
  workingDirectory: RepositoryPathSchema,
  command: z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .refine((value) => !/[\r\n\0]/.test(value), "Commands must be single-line and contain no NUL"),
  expectedArtifactIds: z.array(BenchmarkIdSchema).max(20)
});

const incompleteEvidenceStateSchema = z.strictObject({
  state: z.literal("incomplete"),
  reason: z.string().trim().min(1).max(1_000),
  missingEvidence: z.array(BenchmarkIdSchema).min(1).max(50)
});
const unverifiedEvidenceStateSchema = z.strictObject({
  state: z.literal("unverified"),
  reason: z.string().trim().min(1).max(1_000)
});
const verifiedEvidenceStateSchema = z.strictObject({
  state: z.literal("verified"),
  reason: z.null(),
  verifiedAtUtc: UtcDateTimeSchema,
  verifier: z.string().trim().min(1).max(200),
  method: z.string().trim().min(1).max(1_000),
  evidenceArtifactIds: z.array(BenchmarkIdSchema).min(1).max(20)
});

export const RunEvidenceStateSchema = z.discriminatedUnion("state", [
  incompleteEvidenceStateSchema,
  unverifiedEvidenceStateSchema,
  verifiedEvidenceStateSchema
]);

export const BenchmarkRunSchema = z
  .strictObject({
    runId: BenchmarkIdSchema,
    declaration: BenchmarkDeclarationSchema,
    method: BenchmarkMethodSchema,
    timing: BenchmarkTimingSchema,
    costs: CostEvidenceSchema,
    artifacts: z.array(BenchmarkArtifactSchema).max(100),
    receipts: z.array(ReceiptReferenceSchema).max(100),
    qualityAssessment: QualityAssessmentSchema.nullable(),
    reproductionCommands: z.array(ReproductionCommandSchema).min(1).max(100),
    limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50),
    evidenceState: RunEvidenceStateSchema
  })
  .superRefine((run, context) => {
    const artifactsById = new Map(run.artifacts.map((artifact) => [artifact.artifactId, artifact]));
    const artifactIds = new Set(run.artifacts.map(({ artifactId }) => artifactId));
    const receiptIds = new Set(run.receipts.map(({ receiptId }) => receiptId));
    addDuplicateIssues([...artifactIds], ["artifacts"], context, run.artifacts.length);
    addDuplicateIssues([...receiptIds], ["receipts"], context, run.receipts.length);
    addDuplicateIssues(
      run.costs.lineItems.map(({ costId }) => costId),
      ["costs", "lineItems"],
      context
    );
    addDuplicateIssues(
      run.reproductionCommands.map(({ step }) => String(step)),
      ["reproductionCommands"],
      context
    );

    const orderedSteps = run.reproductionCommands.map(({ step }) => step).sort((a, b) => a - b);
    if (orderedSteps.some((step, index) => step !== index + 1)) {
      context.addIssue({
        code: "custom",
        path: ["reproductionCommands"],
        message: "Reproduction command steps must be contiguous starting at 1"
      });
    }

    for (const [index, receipt] of run.receipts.entries()) {
      const artifactId =
        receipt.kind === "transaction" ? receipt.rawReceiptArtifactId : receipt.responseArtifactId;
      const artifact = artifactsById.get(artifactId);
      if (artifact === undefined) {
        context.addIssue({
          code: "custom",
          path: ["receipts", index],
          message: `Receipt references missing artifact ${artifactId}`
        });
      } else {
        if (artifact.role !== "raw-receipt") {
          context.addIssue({
            code: "custom",
            path: ["receipts", index],
            message: "Receipt evidence must reference an artifact with role raw-receipt"
          });
        }
        if (receipt.kind === "api" && artifact.sha256 !== receipt.responseSha256) {
          context.addIssue({
            code: "custom",
            path: ["receipts", index, "responseSha256"],
            message: "API responseSha256 must match the referenced raw artifact digest"
          });
        }
      }
      if (
        receipt.kind === "transaction" &&
        !new URL(receipt.explorerUrl).pathname
          .toLowerCase()
          .includes(receipt.transactionHash.toLowerCase())
      ) {
        context.addIssue({
          code: "custom",
          path: ["receipts", index, "explorerUrl"],
          message: "Transaction explorerUrl must identify the recorded transaction hash"
        });
      }
      if (
        receipt.verification.state === "verified" &&
        Date.parse(receipt.verification.verifiedAtUtc) < Date.parse(receipt.observedAtUtc)
      ) {
        context.addIssue({
          code: "custom",
          path: ["receipts", index, "verification", "verifiedAtUtc"],
          message: "Receipt verification cannot predate receipt observation"
        });
      }
    }

    const denominationDigests = new Map<string, string>();
    for (const [index, line] of run.costs.lineItems.entries()) {
      const identity = costDenominationIdentity(line.denomination);
      const digest = sha256Canonical(normalizeCostDenomination(line.denomination));
      const existing = denominationDigests.get(identity);
      if (existing !== undefined && existing !== digest) {
        context.addIssue({
          code: "custom",
          path: ["costs", "lineItems", index, "denomination"],
          message: "The same cost denomination identity must use identical metadata"
        });
      }
      denominationDigests.set(identity, digest);
    }

    for (const [lineIndex, line] of run.costs.lineItems.entries()) {
      for (const [sourceIndex, source] of line.sources.entries()) {
        if (
          (source.kind === "artifact" && !artifactIds.has(source.artifactId)) ||
          (source.kind === "receipt" && !receiptIds.has(source.receiptId))
        ) {
          context.addIssue({
            code: "custom",
            path: ["costs", "lineItems", lineIndex, "sources", sourceIndex],
            message: "Cost source must reference evidence present in the same run"
          });
        }
      }
    }

    for (const [index, command] of run.reproductionCommands.entries()) {
      for (const artifactId of command.expectedArtifactIds) {
        if (!artifactIds.has(artifactId)) {
          context.addIssue({
            code: "custom",
            path: ["reproductionCommands", index, "expectedArtifactIds"],
            message: `Reproduction step references missing artifact ${artifactId}`
          });
        }
      }
    }

    if (
      run.timing.startedAtUtc !== null &&
      Date.parse(run.declaration.qualityRubric.declaredAtUtc) > Date.parse(run.timing.startedAtUtc)
    ) {
      context.addIssue({
        code: "custom",
        path: ["declaration", "qualityRubric", "declaredAtUtc"],
        message: "The quality rubric must be declared before the run starts"
      });
    }

    validateAssessment(run, artifactIds, receiptIds, context);

    const state = run.evidenceState.state;
    if (state !== "incomplete") {
      validateCompletedRun(run, context);
    }
    if (state === "verified") {
      for (const artifactId of run.evidenceState.evidenceArtifactIds) {
        if (!artifactIds.has(artifactId)) {
          context.addIssue({
            code: "custom",
            path: ["evidenceState", "evidenceArtifactIds"],
            message: `Verification references missing artifact ${artifactId}`
          });
        }
      }
      if (
        run.timing.endedAtUtc !== null &&
        Date.parse(run.evidenceState.verifiedAtUtc) < Date.parse(run.timing.endedAtUtc)
      ) {
        context.addIssue({
          code: "custom",
          path: ["evidenceState", "verifiedAtUtc"],
          message: "Verification cannot predate the end of the run"
        });
      }
      if (run.receipts.some(({ verification }) => verification.state !== "verified")) {
        context.addIssue({
          code: "custom",
          path: ["receipts"],
          message: "A verified run cannot contain unverified receipt references"
        });
      }
    }
  });

export const PairedBenchmarkSchema = z
  .strictObject({
    schemaVersion: z.literal(BENCHMARK_SCHEMA_VERSION),
    pairId: BenchmarkIdSchema,
    agentRun: BenchmarkRunSchema,
    manualRun: BenchmarkRunSchema,
    limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50)
  })
  .superRefine((pair, context) => {
    if (pair.agentRun.method.kind !== "agent") {
      context.addIssue({
        code: "custom",
        path: ["agentRun", "method", "kind"],
        message: "agentRun must use the agent method"
      });
    }
    if (pair.manualRun.method.kind !== "manual") {
      context.addIssue({
        code: "custom",
        path: ["manualRun", "method", "kind"],
        message: "manualRun must use the manual method"
      });
    }
    if (pair.agentRun.runId === pair.manualRun.runId) {
      context.addIssue({
        code: "custom",
        path: ["manualRun", "runId"],
        message: "Paired runs must have distinct runId values"
      });
    }
    if (
      sha256Canonical(normalizeBenchmarkDeclaration(pair.agentRun.declaration)) !==
      sha256Canonical(normalizeBenchmarkDeclaration(pair.manualRun.declaration))
    ) {
      context.addIssue({
        code: "custom",
        path: ["manualRun", "declaration"],
        message:
          "Agent and manual runs must use the same task, inputs, constraints, environment, receipt requirements, and pre-declared quality rubric"
      });
    }
  });

export type ExactValue = z.infer<typeof ExactValueSchema>;
export type BenchmarkDeclaration = z.infer<typeof BenchmarkDeclarationSchema>;
export type BenchmarkMethod = z.infer<typeof BenchmarkMethodSchema>;
export type BenchmarkArtifact = z.infer<typeof BenchmarkArtifactSchema>;
export type ReceiptReference = z.infer<typeof ReceiptReferenceSchema>;
export type CostDenomination = z.infer<typeof CostDenominationSchema>;
export type CostLineItem = z.infer<typeof CostLineItemSchema>;
export type QualityAssessment = z.infer<typeof QualityAssessmentSchema>;
export type BenchmarkRun = z.infer<typeof BenchmarkRunSchema>;
export type PairedBenchmark = z.infer<typeof PairedBenchmarkSchema>;

/** Order-insensitive normalization for declaration identity and pair matching. */
export function normalizeBenchmarkDeclaration(
  declaration: BenchmarkDeclaration
): BenchmarkDeclaration {
  return {
    ...declaration,
    inputs: [...declaration.inputs].sort((left, right) => compareText(left.inputId, right.inputId)),
    constraints: [...declaration.constraints].sort((left, right) =>
      compareText(left.constraintId, right.constraintId)
    ),
    environment: {
      ...declaration.environment,
      components: [...declaration.environment.components].sort((left, right) =>
        compareText(left.name, right.name)
      ),
      parameters: [...declaration.environment.parameters].sort((left, right) =>
        compareText(left.key, right.key)
      )
    },
    qualityRubric: {
      ...declaration.qualityRubric,
      criteria: [...declaration.qualityRubric.criteria].sort((left, right) =>
        compareText(left.criterionId, right.criterionId)
      )
    },
    requiredReceiptKinds: [...declaration.requiredReceiptKinds].sort(compareText)
  };
}

function validateAssessment(
  run: z.infer<typeof BenchmarkRunSchema>,
  artifactIds: Set<string>,
  receiptIds: Set<string>,
  context: z.RefinementCtx
): void {
  const assessment = run.qualityAssessment;
  if (assessment === null) return;
  const criteria = new Map(
    run.declaration.qualityRubric.criteria.map((criterion) => [criterion.criterionId, criterion])
  );
  addDuplicateIssues(
    assessment.scores.map(({ criterionId }) => criterionId),
    ["qualityAssessment", "scores"],
    context
  );
  if (
    assessment.scores.length !== criteria.size ||
    assessment.scores.some(({ criterionId }) => !criteria.has(criterionId))
  ) {
    context.addIssue({
      code: "custom",
      path: ["qualityAssessment", "scores"],
      message: "Quality assessment must score every declared criterion exactly once"
    });
  }
  for (const [scoreIndex, score] of assessment.scores.entries()) {
    const criterion = criteria.get(score.criterionId);
    if (criterion !== undefined && score.points > criterion.maximumPoints) {
      context.addIssue({
        code: "custom",
        path: ["qualityAssessment", "scores", scoreIndex, "points"],
        message: "Score exceeds the criterion maximum declared before the run"
      });
    }
    for (const [evidenceIndex, evidence] of score.evidence.entries()) {
      if (
        (evidence.kind === "artifact" && !artifactIds.has(evidence.artifactId)) ||
        (evidence.kind === "receipt" && !receiptIds.has(evidence.receiptId))
      ) {
        context.addIssue({
          code: "custom",
          path: ["qualityAssessment", "scores", scoreIndex, "evidence", evidenceIndex],
          message: "Quality evidence must reference evidence present in the same run"
        });
      }
    }
  }
}

function validateCompletedRun(
  run: z.infer<typeof BenchmarkRunSchema>,
  context: z.RefinementCtx
): void {
  if (
    run.timing.startedAtUtc === null ||
    run.timing.endedAtUtc === null ||
    run.timing.monotonicDurationNanoseconds === null
  ) {
    context.addIssue({
      code: "custom",
      path: ["timing"],
      message: "Unverified and verified runs require complete UTC and monotonic timing"
    });
  }
  if (run.costs.state !== "complete") {
    context.addIssue({
      code: "custom",
      path: ["costs"],
      message: "Unverified and verified runs require complete sourced cost evidence"
    });
  }
  if (!run.artifacts.some(({ role }) => role === "output")) {
    context.addIssue({
      code: "custom",
      path: ["artifacts"],
      message: "Unverified and verified runs require at least one hashed output artifact"
    });
  }
  if (run.qualityAssessment === null) {
    context.addIssue({
      code: "custom",
      path: ["qualityAssessment"],
      message: "Unverified and verified runs require a rubric-complete quality assessment"
    });
  }
  if (run.timing.startedAtUtc !== null && run.timing.endedAtUtc !== null) {
    const start = Date.parse(run.timing.startedAtUtc);
    const end = Date.parse(run.timing.endedAtUtc);
    for (const [index, line] of run.costs.lineItems.entries()) {
      const incurred = Date.parse(line.incurredAtUtc);
      if (incurred < start || incurred > end) {
        context.addIssue({
          code: "custom",
          path: ["costs", "lineItems", index, "incurredAtUtc"],
          message: "Completed-run costs must be incurred inside the recorded UTC run window"
        });
      }
    }
    for (const [index, receipt] of run.receipts.entries()) {
      const observed = Date.parse(receipt.observedAtUtc);
      if (observed < start || observed > end) {
        context.addIssue({
          code: "custom",
          path: ["receipts", index, "observedAtUtc"],
          message: "Completed-run receipts must be observed inside the recorded UTC run window"
        });
      }
    }
    if (run.qualityAssessment !== null && Date.parse(run.qualityAssessment.assessedAtUtc) < end) {
      context.addIssue({
        code: "custom",
        path: ["qualityAssessment", "assessedAtUtc"],
        message: "Quality assessment cannot predate the end of the run"
      });
    }
  }
  const presentKinds = new Set(run.receipts.map(({ kind }) => kind));
  for (const requiredKind of run.declaration.requiredReceiptKinds) {
    if (!presentKinds.has(requiredKind)) {
      context.addIssue({
        code: "custom",
        path: ["receipts"],
        message: `Missing required ${requiredKind} receipt reference`
      });
    }
  }
}

function addDuplicateIssues(
  values: string[],
  path: Array<string | number>,
  context: z.RefinementCtx,
  expectedLength = values.length
): void {
  if (new Set(values).size !== expectedLength) {
    context.addIssue({ code: "custom", path, message: "Identifiers must be unique" });
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeCostDenomination(
  denomination: z.infer<typeof CostDenominationSchema>
): z.infer<typeof CostDenominationSchema> {
  return denomination.kind === "asset"
    ? {
        ...denomination,
        contractAddress: denomination.contractAddress?.toLowerCase() ?? null
      }
    : denomination;
}

function costDenominationIdentity(denomination: z.infer<typeof CostDenominationSchema>): string {
  if (denomination.kind === "currency") {
    return `currency:${denomination.currencyCode}:${denomination.minorUnitDecimals}`;
  }
  const asset =
    denomination.contractAddress === null
      ? `native:${denomination.symbol}`
      : denomination.contractAddress.toLowerCase();
  return `asset:eip155:${denomination.chainId}:${asset}:${denomination.minorUnitDecimals}`;
}
