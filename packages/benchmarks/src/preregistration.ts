import { z } from "zod";

import { sha256Canonical } from "./canonical.js";
import {
  BenchmarkConstraintSchema,
  BenchmarkIdSchema,
  BenchmarkTaskSchema,
  QualityRubricSchema,
  ReceiptKindSchema,
  RepositoryPathSchema,
  Sha256Schema,
  UtcDateTimeSchema
} from "./schemas.js";

export const BENCHMARK_PREREGISTRATION_SCHEMA_VERSION = "proofera-termix-preregistration-v1.0.0";

const pendingBindingSchema = z.strictObject({
  state: z.literal("UNBOUND"),
  value: z.null(),
  reason: z.string().trim().min(1).max(1_000),
  bindBeforeEitherRun: z.literal(true)
});

const preregisteredInputSchema = z.strictObject({
  inputId: BenchmarkIdSchema,
  description: z.string().trim().min(1).max(1_000),
  finalEncoding: z.enum(["string", "decimal_integer", "evm_address", "canonical_json"]),
  unit: z.string().trim().min(1).max(64).nullable(),
  authoritativeSourceRequirement: z.string().trim().min(1).max(1_000),
  bindingRule: z.string().trim().min(1).max(1_000),
  binding: pendingBindingSchema
});

const preregisteredEnvironmentSchema = z.strictObject({
  kind: z.enum(["fixture", "simulation", "local", "testnet", "mainnet"]),
  chainId: z.number().int().positive().nullable(),
  networkName: z.string().trim().min(1).max(100),
  softwareCommit: pendingBindingSchema,
  components: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(100),
        versionBindingRule: z.string().trim().min(1).max(1_000),
        configurationDigestRequired: z.boolean()
      })
    )
    .min(1)
    .max(50),
  parameters: z
    .array(
      z.strictObject({
        key: BenchmarkIdSchema,
        description: z.string().trim().min(1).max(1_000),
        finalEncoding: z.enum(["string", "decimal_integer", "evm_address", "canonical_json"]),
        bindingRule: z.string().trim().min(1).max(1_000),
        binding: pendingBindingSchema
      })
    )
    .min(1)
    .max(100)
});

const artifactRequirementSchema = z.strictObject({
  requirementId: BenchmarkIdSchema,
  role: z.enum(["output", "raw-receipt", "log", "configuration", "quality-evidence", "other"]),
  appliesTo: z.enum(["both-runs", "agent-run", "manual-run"]),
  description: z.string().trim().min(1).max(1_000),
  sha256Required: z.literal(true)
});

const receiptRequirementSchema = z.strictObject({
  requirementId: BenchmarkIdSchema,
  kind: ReceiptKindSchema,
  appliesTo: z.enum(["both-runs", "agent-run", "manual-run"]),
  description: z.string().trim().min(1).max(1_000),
  rawArtifactRequired: z.literal(true),
  independentVerificationRequired: z.literal(true)
});

const prerequisiteCommandSchema = z.strictObject({
  step: z.number().int().positive().max(100),
  workingDirectory: RepositoryPathSchema,
  command: z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .refine((value) => !/[\r\n\0]/.test(value), "Commands must be single-line and contain no NUL"),
  purpose: z.string().trim().min(1).max(1_000),
  state: z.literal("AVAILABLE NOW")
});

export const BenchmarkPreregisteredDefinitionSchema = z
  .strictObject({
    task: BenchmarkTaskSchema,
    inputs: z.array(preregisteredInputSchema).min(1).max(100),
    constraints: z.array(BenchmarkConstraintSchema).min(1).max(100),
    environment: preregisteredEnvironmentSchema,
    qualityRubric: QualityRubricSchema,
    hardFailRules: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50),
    pairProtocol: z.strictObject({
      oneFinalDeclarationForBothRuns: z.literal(true),
      identicalTask: z.literal(true),
      identicalInputs: z.literal(true),
      identicalConstraints: z.literal(true),
      identicalEnvironment: z.literal(true),
      identicalQualityRubric: z.literal(true),
      identicalSourceAccess: z.literal(true),
      finalDeclarationSha256: z.null(),
      finalDeclarationBindingState: z.literal("UNBOUND"),
      runOrderRule: z.string().trim().min(1).max(1_000),
      agentMethodRequirement: z.string().trim().min(1).max(1_000),
      manualMethodRequirement: z.string().trim().min(1).max(1_000)
    }),
    measurementRequirements: z.strictObject({
      wallTime: z.literal("UTC_START_END_PLUS_MONOTONIC_DURATION"),
      activeTime: z.literal("HASHED_MONOTONIC_OPERATOR_SEGMENTS"),
      costs: z.literal("SOURCED_INTEGER_MINOR_UNITS_WITH_EXPLICIT_ZEROES"),
      output: z.literal("HASHED_RAW_AND_CANONICAL_OUTPUTS"),
      quality: z.literal("SECOND_REVIEWER_SCORES_EVERY_PREDECLARED_CRITERION"),
      noCurrencyConversion: z.literal(true)
    }),
    artifactRequirements: z.array(artifactRequirementSchema).min(1).max(50),
    receiptRequirements: z.array(receiptRequirementSchema).min(1).max(20),
    finalDeclarationRequiredReceiptKinds: z.array(ReceiptKindSchema).min(1).max(2),
    reproduction: z.strictObject({
      prerequisiteCommands: z.array(prerequisiteCommandSchema).min(1).max(20),
      timedRunnerCommand: z.null(),
      timedRunnerBindingState: z.literal("UNBOUND"),
      blockedReason: z.string().trim().min(1).max(1_000)
    })
  })
  .superRefine((definition, context) => {
    addDuplicateIssues(
      definition.inputs.map(({ inputId }) => inputId),
      ["inputs"],
      context
    );
    addDuplicateIssues(
      definition.constraints.map(({ constraintId }) => constraintId),
      ["constraints"],
      context
    );
    addDuplicateIssues(
      definition.environment.components.map(({ name }) => name),
      ["environment", "components"],
      context
    );
    addDuplicateIssues(
      definition.environment.parameters.map(({ key }) => key),
      ["environment", "parameters"],
      context
    );
    addDuplicateIssues(
      definition.artifactRequirements.map(({ requirementId }) => requirementId),
      ["artifactRequirements"],
      context
    );
    addDuplicateIssues(
      definition.receiptRequirements.map(({ requirementId }) => requirementId),
      ["receiptRequirements"],
      context
    );
    addDuplicateIssues(
      definition.finalDeclarationRequiredReceiptKinds,
      ["finalDeclarationRequiredReceiptKinds"],
      context
    );

    const steps = definition.reproduction.prerequisiteCommands.map(({ step }) => step);
    if (steps.some((step, index) => step !== index + 1)) {
      context.addIssue({
        code: "custom",
        path: ["reproduction", "prerequisiteCommands"],
        message: "Prerequisite command steps must be ordered and contiguous from 1"
      });
    }

    if (["testnet", "mainnet"].includes(definition.environment.kind)) {
      if (definition.environment.chainId === null) {
        context.addIssue({
          code: "custom",
          path: ["environment", "chainId"],
          message: "Onchain preregistrations require an explicit chainId"
        });
      }
    }

    const requiredKinds = new Set(definition.finalDeclarationRequiredReceiptKinds);
    for (const [index, requirement] of definition.receiptRequirements.entries()) {
      if (requirement.appliesTo === "both-runs" && !requiredKinds.has(requirement.kind)) {
        context.addIssue({
          code: "custom",
          path: ["receiptRequirements", index, "kind"],
          message: "A both-runs receipt must be required by the final shared declaration"
        });
      }
    }
  });

export const BenchmarkPreregistrationSchema = z
  .strictObject({
    schemaVersion: z.literal(BENCHMARK_PREREGISTRATION_SCHEMA_VERSION),
    preregistrationId: BenchmarkIdSchema,
    registeredAtUtc: UtcDateTimeSchema,
    status: z.literal("NOT RUN"),
    runStates: z.strictObject({
      agent: z.literal("NOT RUN"),
      manual: z.literal("NOT RUN")
    }),
    publishable: z.literal(false),
    nonPublishableReasons: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20),
    definition: BenchmarkPreregisteredDefinitionSchema,
    definitionSha256: Sha256Schema
  })
  .superRefine((registration, context) => {
    const digest = sha256Canonical(registration.definition);
    if (registration.definitionSha256 !== digest) {
      context.addIssue({
        code: "custom",
        path: ["definitionSha256"],
        message: `Definition digest mismatch; expected ${digest}`
      });
    }
  });

export type BenchmarkPreregistration = z.infer<typeof BenchmarkPreregistrationSchema>;
export type BenchmarkPreregisteredDefinition = z.infer<
  typeof BenchmarkPreregisteredDefinitionSchema
>;

export function validateBenchmarkPreregistration(input: unknown): BenchmarkPreregistration {
  return BenchmarkPreregistrationSchema.parse(input);
}

export function benchmarkPreregisteredDefinitionSha256(input: unknown): string {
  return sha256Canonical(BenchmarkPreregisteredDefinitionSchema.parse(input));
}

function addDuplicateIssues(
  values: readonly string[],
  path: Array<string | number>,
  context: z.RefinementCtx
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path, message: "Identifiers must be unique" });
  }
}
