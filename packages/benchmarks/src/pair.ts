import { z } from "zod";

import { sha256Canonical } from "./canonical.js";
import {
  BENCHMARK_SCHEMA_VERSION,
  BenchmarkDeclarationSchema,
  BenchmarkIdSchema,
  BenchmarkTimingSchema,
  CostDenominationSchema,
  PairedBenchmarkSchema,
  Sha256Schema,
  normalizeBenchmarkDeclaration,
  type BenchmarkRun,
  type CostDenomination,
  type PairedBenchmark
} from "./schemas.js";

const signedIntegerStringSchema = z
  .string()
  .max(82)
  .regex(/^-?(0|[1-9][0-9]*)$/);
const aggregateUnsignedIntegerStringSchema = z
  .string()
  .max(81)
  .regex(/^(0|[1-9][0-9]*)$/);

export const CostComparisonSchema = z.strictObject({
  denominationKey: z.string().min(1).max(200),
  denomination: CostDenominationSchema,
  agentMinorUnits: aggregateUnsignedIntegerStringSchema,
  manualMinorUnits: aggregateUnsignedIntegerStringSchema,
  manualMinusAgentMinorUnits: signedIntegerStringSchema
});

export const PairedBenchmarkSummarySchema = z.strictObject({
  schemaVersion: z.literal(BENCHMARK_SCHEMA_VERSION),
  pairId: BenchmarkIdSchema,
  pairSha256: Sha256Schema,
  declarationSha256: Sha256Schema,
  claimState: z.enum(["incomplete", "unverified", "verified"]),
  sourceStates: z.strictObject({
    agent: z.enum(["incomplete", "unverified", "verified"]),
    manual: z.enum(["incomplete", "unverified", "verified"])
  }),
  publishableClaim: z.boolean(),
  duration: z
    .strictObject({
      agentNanoseconds: z.string().regex(/^(0|[1-9][0-9]*)$/),
      manualNanoseconds: z.string().regex(/^(0|[1-9][0-9]*)$/),
      manualMinusAgentNanoseconds: signedIntegerStringSchema
    })
    .nullable(),
  costs: z.array(CostComparisonSchema).nullable(),
  quality: z
    .strictObject({
      maximumPoints: z.number().int().positive(),
      agentPoints: z.number().int().nonnegative(),
      manualPoints: z.number().int().nonnegative(),
      agentMinusManualPoints: z.number().int()
    })
    .nullable(),
  warnings: z.array(z.string().min(1).max(1_000)).min(1).max(5)
});

export type PairedBenchmarkSummary = z.infer<typeof PairedBenchmarkSummarySchema>;

/** Parse a complete pair. Mismatched declarations fail in PairedBenchmarkSchema. */
export function validatePairedBenchmark(input: unknown): PairedBenchmark {
  return PairedBenchmarkSchema.parse(input);
}

/** Stable declaration identity after sorting semantically unordered ID lists. */
export function benchmarkDeclarationSha256(input: unknown): string {
  const declaration = BenchmarkDeclarationSchema.parse(input);
  return sha256Canonical(normalizeBenchmarkDeclaration(declaration));
}

/**
 * Validate caller-injected timing. This function deliberately has no clock
 * access and never derives monotonic duration from wall-clock timestamps.
 */
export function validateInjectedTiming(input: unknown): z.infer<typeof BenchmarkTimingSchema> {
  return BenchmarkTimingSchema.parse(input);
}

/**
 * Produce exact deltas without declaring a winner. Missing/partial evidence
 * yields null comparisons, and only two verified runs are publishable.
 */
export function summarizePairedBenchmark(input: unknown): PairedBenchmarkSummary {
  const pair = validatePairedBenchmark(input);
  const claimState = deriveClaimState(pair);
  const agentDuration = pair.agentRun.timing.monotonicDurationNanoseconds;
  const manualDuration = pair.manualRun.timing.monotonicDurationNanoseconds;
  const duration =
    agentDuration !== null && manualDuration !== null
      ? {
          agentNanoseconds: agentDuration,
          manualNanoseconds: manualDuration,
          manualMinusAgentNanoseconds: (BigInt(manualDuration) - BigInt(agentDuration)).toString()
        }
      : null;

  const costs =
    pair.agentRun.costs.state === "complete" && pair.manualRun.costs.state === "complete"
      ? compareCosts(pair.agentRun, pair.manualRun)
      : null;
  const quality = compareQuality(pair);

  return PairedBenchmarkSummarySchema.parse({
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    pairId: pair.pairId,
    pairSha256: sha256Canonical(pair),
    declarationSha256: benchmarkDeclarationSha256(pair.agentRun.declaration),
    claimState,
    sourceStates: {
      agent: pair.agentRun.evidenceState.state,
      manual: pair.manualRun.evidenceState.state
    },
    publishableClaim: claimState === "verified",
    duration,
    costs,
    quality,
    warnings: warningsFor(claimState)
  });
}

function deriveClaimState(pair: PairedBenchmark): "incomplete" | "unverified" | "verified" {
  const states = [pair.agentRun.evidenceState.state, pair.manualRun.evidenceState.state];
  if (states.includes("incomplete")) return "incomplete";
  if (states.every((state) => state === "verified")) return "verified";
  return "unverified";
}

function compareCosts(agentRun: BenchmarkRun, manualRun: BenchmarkRun) {
  const agent = sumCosts(agentRun);
  const manual = sumCosts(manualRun);
  const keys = [...new Set([...agent.keys(), ...manual.keys()])].sort(compareText);
  return keys.map((key) => {
    const agentGroup = agent.get(key);
    const manualGroup = manual.get(key);
    const denomination = agentGroup?.denomination ?? manualGroup?.denomination;
    if (denomination === undefined) {
      throw new Error("Cost denomination disappeared during deterministic aggregation");
    }
    const agentTotal = agentGroup?.total ?? 0n;
    const manualTotal = manualGroup?.total ?? 0n;
    return {
      denominationKey: key,
      denomination,
      agentMinorUnits: agentTotal.toString(),
      manualMinorUnits: manualTotal.toString(),
      manualMinusAgentMinorUnits: (manualTotal - agentTotal).toString()
    };
  });
}

function sumCosts(
  run: BenchmarkRun
): Map<string, { denomination: CostDenomination; total: bigint }> {
  const totals = new Map<string, { denomination: CostDenomination; total: bigint }>();
  for (const line of run.costs.lineItems) {
    const denomination = normalizeDenomination(line.denomination);
    const key = denominationKey(denomination);
    const current = totals.get(key);
    totals.set(key, {
      denomination,
      total: (current?.total ?? 0n) + BigInt(line.amountMinorUnits)
    });
  }
  return totals;
}

function normalizeDenomination(denomination: CostDenomination): CostDenomination {
  return denomination.kind === "asset"
    ? {
        ...denomination,
        contractAddress: denomination.contractAddress?.toLowerCase() ?? null
      }
    : denomination;
}

function denominationKey(denomination: CostDenomination): string {
  if (denomination.kind === "currency") {
    return `currency:${denomination.currencyCode}:${denomination.minorUnitDecimals}`;
  }
  const identity =
    denomination.contractAddress === null
      ? `native:${denomination.symbol}`
      : denomination.contractAddress.toLowerCase();
  return `asset:eip155:${denomination.chainId}:${identity}:${denomination.minorUnitDecimals}`;
}

function compareQuality(pair: PairedBenchmark): PairedBenchmarkSummary["quality"] {
  const agent = pair.agentRun.qualityAssessment;
  const manual = pair.manualRun.qualityAssessment;
  if (agent === null || manual === null) return null;
  const agentPoints = agent.scores.reduce((total, score) => total + score.points, 0);
  const manualPoints = manual.scores.reduce((total, score) => total + score.points, 0);
  return {
    maximumPoints: pair.agentRun.declaration.qualityRubric.totalMaximumPoints,
    agentPoints,
    manualPoints,
    agentMinusManualPoints: agentPoints - manualPoints
  };
}

function warningsFor(state: "incomplete" | "unverified" | "verified"): string[] {
  if (state === "incomplete") {
    return ["At least one run is incomplete. Do not publish or infer a comparative claim."];
  }
  if (state === "unverified") {
    return [
      "At least one run is unverified. Deltas are recorded evidence, not a publishable claim."
    ];
  }
  return [
    "Verified means the supplied evidence passed this harness and named its verifier; it is not a financial guarantee."
  ];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
