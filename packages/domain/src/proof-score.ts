import { z } from "zod";

export const PROOF_SCORE_VERSION = "1.1.0-draft" as const;

export const proofScoreComponentSchema = z.enum([
  "identity",
  "reliability",
  "riskAdjustedPerformance",
  "freshness",
  "trackRecord",
  "userFeedback"
]);

export type ProofScoreComponent = z.infer<typeof proofScoreComponentSchema>;

export const proofScoreCategorySchema = z.enum([
  "lp-rebalancing",
  "grid-trading",
  "yield-optimisation",
  "health-factor-monitoring"
]);

export type ProofScoreCategory = z.infer<typeof proofScoreCategorySchema>;

export const proofScoreSourceKindSchema = z.enum([
  "erc8004_registry_record",
  "onchain_control_state",
  "control_challenge",
  "transaction_set",
  "task_receipt_set",
  "probe_series",
  "protocol_snapshot",
  "onchain_permission_state",
  "observation_window",
  "verified_feedback_set",
  "rater_evidence_set",
  "category_metric"
]);

export type ProofScoreSourceKind = z.infer<typeof proofScoreSourceKindSchema>;

export type ProofScoreMethodDefinition = {
  methodId: string;
  methodVersion: string;
  sourceKind: ProofScoreSourceKind;
};

type ProofScoreSignalDefinition = {
  component: ProofScoreComponent;
  expiryMultiplier: 3 | 4 | 7;
  fixedMethod: ProofScoreMethodDefinition | null;
  id: string;
  localWeight: number;
  maxAgeSeconds: number;
  minimumSampleSize?: number;
};

export const proofScoreSignalDefinitions = [
  {
    id: "registryIdentity",
    component: "identity",
    localWeight: 0.35,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    fixedMethod: {
      methodId: "proofera.identity.erc8004-registration",
      methodVersion: "1.0.0",
      sourceKind: "erc8004_registry_record"
    }
  },
  {
    id: "ownerControl",
    component: "identity",
    localWeight: 0.35,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    fixedMethod: {
      methodId: "proofera.identity.owner-control",
      methodVersion: "1.0.0",
      sourceKind: "onchain_control_state"
    }
  },
  {
    id: "endpointControl",
    component: "identity",
    localWeight: 0.3,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    fixedMethod: {
      methodId: "proofera.identity.endpoint-control-challenge",
      methodVersion: "1.0.0",
      sourceKind: "control_challenge"
    }
  },
  {
    id: "executionSuccess",
    component: "reliability",
    localWeight: 0.5,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    minimumSampleSize: 20,
    fixedMethod: {
      methodId: "proofera.reliability.execution-success",
      methodVersion: "1.0.0",
      sourceKind: "transaction_set"
    }
  },
  {
    id: "uptime",
    component: "reliability",
    localWeight: 0.3,
    maxAgeSeconds: 3_600,
    expiryMultiplier: 4,
    minimumSampleSize: 24,
    fixedMethod: {
      methodId: "proofera.reliability.uptime-probes",
      methodVersion: "1.0.0",
      sourceKind: "probe_series"
    }
  },
  {
    id: "taskCompletion",
    component: "reliability",
    localWeight: 0.2,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    minimumSampleSize: 10,
    fixedMethod: {
      methodId: "proofera.reliability.task-completion",
      methodVersion: "1.0.0",
      sourceKind: "task_receipt_set"
    }
  },
  {
    id: "categoryOutcome",
    component: "riskAdjustedPerformance",
    localWeight: 0.4,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    minimumSampleSize: 30,
    fixedMethod: null
  },
  {
    id: "downsideControl",
    component: "riskAdjustedPerformance",
    localWeight: 0.35,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    minimumSampleSize: 30,
    fixedMethod: null
  },
  {
    id: "costEfficiency",
    component: "riskAdjustedPerformance",
    localWeight: 0.25,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    minimumSampleSize: 10,
    fixedMethod: null
  },
  {
    id: "marketEvidenceFreshness",
    component: "freshness",
    localWeight: 0.45,
    maxAgeSeconds: 600,
    expiryMultiplier: 3,
    fixedMethod: {
      methodId: "proofera.freshness.protocol-market-snapshot",
      methodVersion: "1.0.0",
      sourceKind: "protocol_snapshot"
    }
  },
  {
    id: "executionEvidenceFreshness",
    component: "freshness",
    localWeight: 0.35,
    maxAgeSeconds: 3_600,
    expiryMultiplier: 4,
    fixedMethod: {
      methodId: "proofera.freshness.execution-receipts",
      methodVersion: "1.0.0",
      sourceKind: "transaction_set"
    }
  },
  {
    id: "permissionEvidenceFreshness",
    component: "freshness",
    localWeight: 0.2,
    maxAgeSeconds: 3_600,
    expiryMultiplier: 4,
    fixedMethod: {
      methodId: "proofera.freshness.permission-state",
      methodVersion: "1.0.0",
      sourceKind: "onchain_permission_state"
    }
  },
  {
    id: "observationDuration",
    component: "trackRecord",
    localWeight: 0.4,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    fixedMethod: {
      methodId: "proofera.track-record.observation-window",
      methodVersion: "1.0.0",
      sourceKind: "observation_window"
    }
  },
  {
    id: "executionVolume",
    component: "trackRecord",
    localWeight: 0.6,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    minimumSampleSize: 30,
    fixedMethod: {
      methodId: "proofera.track-record.execution-volume",
      methodVersion: "1.0.0",
      sourceKind: "transaction_set"
    }
  },
  {
    id: "verifiedFeedback",
    component: "userFeedback",
    localWeight: 0.65,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    minimumSampleSize: 10,
    fixedMethod: {
      methodId: "proofera.feedback.verified-feedback",
      methodVersion: "1.0.0",
      sourceKind: "verified_feedback_set"
    }
  },
  {
    id: "raterQuality",
    component: "userFeedback",
    localWeight: 0.35,
    maxAgeSeconds: 86_400,
    expiryMultiplier: 7,
    minimumSampleSize: 5,
    fixedMethod: {
      methodId: "proofera.feedback.rater-quality",
      methodVersion: "1.0.0",
      sourceKind: "rater_evidence_set"
    }
  }
] as const satisfies readonly ProofScoreSignalDefinition[];

export type ProofScoreSignalId = (typeof proofScoreSignalDefinitions)[number]["id"];

const signalIds = proofScoreSignalDefinitions.map((definition) => definition.id) as [
  ProofScoreSignalId,
  ...ProofScoreSignalId[]
];

export const proofScoreSignalIdSchema = z.enum(signalIds);

export const categoryPerformanceSignalIds = [
  "categoryOutcome",
  "downsideControl",
  "costEfficiency"
] as const satisfies readonly ProofScoreSignalId[];

export type CategoryPerformanceSignalId = (typeof categoryPerformanceSignalIds)[number];

export type CategoryNormalizationDefinition = {
  bounds: { lower: number; upper: number };
  direction: "higher_is_better" | "lower_is_better";
  methodId: string;
  methodVersion: string;
  rawMetricId: string;
  unit: string;
};

export const proofScoreCategoryNormalizationDefinitions = {
  "lp-rebalancing": {
    categoryOutcome: {
      methodId: "proofera.lp.category-outcome.net-vs-baseline",
      methodVersion: "1.0.0",
      rawMetricId: "netPerformanceVsBaselineBps",
      unit: "bps",
      bounds: { lower: -1_000, upper: 1_000 },
      direction: "higher_is_better"
    },
    downsideControl: {
      methodId: "proofera.lp.downside-control.max-drawdown",
      methodVersion: "1.0.0",
      rawMetricId: "maxDrawdownBps",
      unit: "bps",
      bounds: { lower: 0, upper: 2_000 },
      direction: "lower_is_better"
    },
    costEfficiency: {
      methodId: "proofera.lp.cost-efficiency.all-in-cost",
      methodVersion: "1.0.0",
      rawMetricId: "allInCostBps",
      unit: "bps",
      bounds: { lower: 0, upper: 500 },
      direction: "lower_is_better"
    }
  },
  "grid-trading": {
    categoryOutcome: {
      methodId: "proofera.grid.category-outcome.realized-net-pnl",
      methodVersion: "1.0.0",
      rawMetricId: "realizedNetPnlBps",
      unit: "bps",
      bounds: { lower: -2_000, upper: 2_000 },
      direction: "higher_is_better"
    },
    downsideControl: {
      methodId: "proofera.grid.downside-control.max-drawdown",
      methodVersion: "1.0.0",
      rawMetricId: "maxDrawdownBps",
      unit: "bps",
      bounds: { lower: 0, upper: 3_000 },
      direction: "lower_is_better"
    },
    costEfficiency: {
      methodId: "proofera.grid.cost-efficiency.turnover-cost",
      methodVersion: "1.0.0",
      rawMetricId: "turnoverCostBps",
      unit: "bps",
      bounds: { lower: 0, upper: 600 },
      direction: "lower_is_better"
    }
  },
  "yield-optimisation": {
    categoryOutcome: {
      methodId: "proofera.yield.category-outcome.net-apy-spread",
      methodVersion: "1.0.0",
      rawMetricId: "netApySpreadBps",
      unit: "bps",
      bounds: { lower: -500, upper: 500 },
      direction: "higher_is_better"
    },
    downsideControl: {
      methodId: "proofera.yield.downside-control.liquidity-haircut",
      methodVersion: "1.0.0",
      rawMetricId: "worstLiquidityHaircutBps",
      unit: "bps",
      bounds: { lower: 0, upper: 2_000 },
      direction: "lower_is_better"
    },
    costEfficiency: {
      methodId: "proofera.yield.cost-efficiency.annualized-drag",
      methodVersion: "1.0.0",
      rawMetricId: "annualizedCostDragBps",
      unit: "bps",
      bounds: { lower: 0, upper: 300 },
      direction: "lower_is_better"
    }
  },
  "health-factor-monitoring": {
    categoryOutcome: {
      methodId: "proofera.health.category-outcome.policy-adherence",
      methodVersion: "1.0.0",
      rawMetricId: "policyAdherencePpm",
      unit: "ppm",
      bounds: { lower: 0, upper: 1_000_000 },
      direction: "higher_is_better"
    },
    downsideControl: {
      methodId: "proofera.health.downside-control.minimum-health-factor",
      methodVersion: "1.0.0",
      rawMetricId: "minimumHealthFactorMilli",
      unit: "milli-health-factor",
      bounds: { lower: 1_000, upper: 2_000 },
      direction: "higher_is_better"
    },
    costEfficiency: {
      methodId: "proofera.health.cost-efficiency.intervention-cost",
      methodVersion: "1.0.0",
      rawMetricId: "medianInterventionCostBps",
      unit: "bps",
      bounds: { lower: 0, upper: 100 },
      direction: "lower_is_better"
    }
  }
} as const satisfies Readonly<
  Record<
    ProofScoreCategory,
    Readonly<Record<CategoryPerformanceSignalId, CategoryNormalizationDefinition>>
  >
>;

const categoryPerformanceSignalIdSet: ReadonlySet<string> = new Set(categoryPerformanceSignalIds);

export function isCategoryPerformanceSignalId(
  signalId: ProofScoreSignalId
): signalId is CategoryPerformanceSignalId {
  return categoryPerformanceSignalIdSet.has(signalId);
}

export function getProofScoreCategoryNormalizationDefinition(
  category: ProofScoreCategory,
  signalId: ProofScoreSignalId
): CategoryNormalizationDefinition | null {
  if (!isCategoryPerformanceSignalId(signalId)) return null;
  return proofScoreCategoryNormalizationDefinitions[category][signalId];
}

export function getExpectedProofScoreMethod(
  category: ProofScoreCategory,
  signalId: ProofScoreSignalId
): ProofScoreMethodDefinition {
  const categoryMethod = getProofScoreCategoryNormalizationDefinition(category, signalId);
  if (categoryMethod !== null) {
    return {
      methodId: categoryMethod.methodId,
      methodVersion: categoryMethod.methodVersion,
      sourceKind: "category_metric"
    };
  }

  const definition = proofScoreSignalDefinitions.find((candidate) => candidate.id === signalId);
  if (definition?.fixedMethod === null || definition?.fixedMethod === undefined) {
    throw new Error(`Proof Score signal ${signalId} has no provenance method definition.`);
  }
  return definition.fixedMethod;
}

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/, "Use a stable repository evidence identifier.");
const methodIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9.-]*$/, "Use a canonical lowercase method ID.");
const methodVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Use a semantic method version.");

export const proofScoreProvenanceSchema = z.strictObject({
  evidenceId: identifierSchema,
  methodId: methodIdSchema,
  methodVersion: methodVersionSchema,
  sourceKind: proofScoreSourceKindSchema
});

export type ProofScoreProvenance = z.infer<typeof proofScoreProvenanceSchema>;

const normalizationBoundsSchema = z
  .strictObject({
    lower: z.number().finite(),
    upper: z.number().finite()
  })
  .superRefine((bounds, context) => {
    if (bounds.lower >= bounds.upper) {
      context.addIssue({
        code: "custom",
        message: "Normalization lower bound must be below its upper bound.",
        path: ["lower"]
      });
    }
  });

export const proofScoreCategoryNormalizationSchema = z.strictObject({
  bounds: normalizationBoundsSchema,
  category: proofScoreCategorySchema,
  direction: z.enum(["higher_is_better", "lower_is_better"]),
  methodId: methodIdSchema,
  methodVersion: methodVersionSchema,
  rawMetric: z.strictObject({
    id: identifierSchema,
    unit: z.string().trim().min(1).max(64),
    value: z.number().finite()
  })
});

export type ProofScoreCategoryNormalization = z.infer<typeof proofScoreCategoryNormalizationSchema>;

const availableProofScoreSignalSchema = z.strictObject({
  availability: z.literal("available"),
  normalization: proofScoreCategoryNormalizationSchema.nullable(),
  observedAt: z.iso.datetime({ offset: true }),
  provenance: proofScoreProvenanceSchema,
  sampleSize: z.number().int().nonnegative().nullable(),
  value: z.number().finite().min(0).max(1)
});

const absentProofScoreSignalFields = {
  normalization: z.null(),
  observedAt: z.null(),
  provenance: z.null(),
  sampleSize: z.null(),
  value: z.null()
};

export const proofScoreSignalSchema = z.discriminatedUnion("availability", [
  availableProofScoreSignalSchema,
  z.strictObject({
    availability: z.literal("unknown"),
    ...absentProofScoreSignalFields
  }),
  z.strictObject({
    availability: z.literal("unavailable"),
    ...absentProofScoreSignalFields
  })
]);

export type ProofScoreSignal = z.infer<typeof proofScoreSignalSchema>;

export function normalizeCategoryPerformanceMetric(unparsedNormalization: unknown): number {
  const normalization = proofScoreCategoryNormalizationSchema.parse(unparsedNormalization);
  const ratio =
    (normalization.rawMetric.value - normalization.bounds.lower) /
    (normalization.bounds.upper - normalization.bounds.lower);
  const boundedRatio = Math.max(0, Math.min(1, ratio));
  return normalization.direction === "higher_is_better" ? boundedRatio : 1 - boundedRatio;
}

function addInputIssue(
  context: z.RefinementCtx,
  signalId: ProofScoreSignalId,
  fieldPath: readonly (string | number)[],
  message: string
): void {
  context.addIssue({
    code: "custom",
    message,
    path: ["signals", signalId, ...fieldPath]
  });
}

export const proofScoreInputSchema = z
  .strictObject({
    asOf: z.iso.datetime({ offset: true }),
    category: proofScoreCategorySchema,
    signals: z.partialRecord(proofScoreSignalIdSchema, proofScoreSignalSchema)
  })
  .superRefine((input, context) => {
    for (const definition of proofScoreSignalDefinitions) {
      const signal = input.signals[definition.id];
      if (signal?.availability !== "available") continue;

      const expectedMethod = getExpectedProofScoreMethod(input.category, definition.id);
      if (
        signal.provenance.methodId !== expectedMethod.methodId ||
        signal.provenance.methodVersion !== expectedMethod.methodVersion ||
        signal.provenance.sourceKind !== expectedMethod.sourceKind
      ) {
        addInputIssue(
          context,
          definition.id,
          ["provenance"],
          `Expected ${expectedMethod.methodId}@${expectedMethod.methodVersion} from ${expectedMethod.sourceKind}.`
        );
      }

      const categoryMethod = getProofScoreCategoryNormalizationDefinition(
        input.category,
        definition.id
      );
      if (categoryMethod === null) {
        if (signal.normalization !== null) {
          addInputIssue(
            context,
            definition.id,
            ["normalization"],
            "Only category performance signals may carry category normalization."
          );
        }
        continue;
      }

      const normalization = signal.normalization;
      if (normalization === null) {
        addInputIssue(
          context,
          definition.id,
          ["normalization"],
          "Available category performance evidence requires category-bound normalization."
        );
        continue;
      }

      if (
        normalization.category !== input.category ||
        normalization.methodId !== categoryMethod.methodId ||
        normalization.methodVersion !== categoryMethod.methodVersion ||
        normalization.rawMetric.id !== categoryMethod.rawMetricId ||
        normalization.rawMetric.unit !== categoryMethod.unit ||
        normalization.bounds.lower !== categoryMethod.bounds.lower ||
        normalization.bounds.upper !== categoryMethod.bounds.upper ||
        normalization.direction !== categoryMethod.direction
      ) {
        addInputIssue(
          context,
          definition.id,
          ["normalization"],
          `Normalization must match the ${input.category}/${definition.id} methodology contract.`
        );
        continue;
      }

      const normalizedValue = normalizeCategoryPerformanceMetric(normalization);
      if (Math.abs(normalizedValue - signal.value) > 1e-12) {
        addInputIssue(
          context,
          definition.id,
          ["value"],
          `Normalized value must equal ${normalizedValue} for the disclosed raw metric and bounds.`
        );
      }
    }
  });

export type ProofScoreInput = z.infer<typeof proofScoreInputSchema>;

const componentWeights: Readonly<Record<ProofScoreComponent, number>> = {
  identity: 15,
  reliability: 25,
  riskAdjustedPerformance: 25,
  freshness: 15,
  trackRecord: 10,
  userFeedback: 10
};

export const PROOF_SCORE_COMPONENT_WEIGHTS = componentWeights;

export type ProofScoreWarningCode =
  | "MISSING_EVIDENCE"
  | "UPSTREAM_UNAVAILABLE"
  | "STALE_EVIDENCE"
  | "EXPIRED_EVIDENCE"
  | "FUTURE_TIMESTAMP"
  | "MISSING_SAMPLE_SIZE"
  | "LOW_SAMPLE_SIZE"
  | "LOW_CONFIDENCE";

export type ProofScoreWarning = {
  code: ProofScoreWarningCode;
  message: string;
  signalId: ProofScoreSignalId | null;
};

export type ProofScoreComponentResult = {
  confidence: number;
  contribution: number;
  maximum: number;
};

export type ProofScoreResult = {
  category: ProofScoreCategory;
  components: Readonly<Record<ProofScoreComponent, ProofScoreComponentResult>>;
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  score: number;
  version: typeof PROOF_SCORE_VERSION;
  warnings: readonly ProofScoreWarning[];
};

const round = (value: number, places = 1): number => {
  const multiplier = 10 ** places;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

type FreshnessResult = {
  expired: boolean;
  factor: number;
  future: boolean;
  stale: boolean;
};

const freshnessFactor = (
  asOfMs: number,
  observedAt: string,
  maxAgeSeconds: number,
  expiryMultiplier: 3 | 4 | 7
): FreshnessResult => {
  const ageSeconds = (asOfMs - Date.parse(observedAt)) / 1_000;
  if (ageSeconds < 0) {
    return { expired: false, factor: 0, future: true, stale: false };
  }
  if (ageSeconds <= maxAgeSeconds) {
    return { expired: false, factor: 1, future: false, stale: false };
  }

  const expiryAgeSeconds = maxAgeSeconds * expiryMultiplier;
  if (ageSeconds >= expiryAgeSeconds) {
    return { expired: true, factor: 0, future: false, stale: true };
  }

  const twiceFreshnessCeiling = maxAgeSeconds * 2;
  if (ageSeconds <= twiceFreshnessCeiling) {
    const firstDecayProgress = (ageSeconds - maxAgeSeconds) / maxAgeSeconds;
    return {
      expired: false,
      factor: 1 - firstDecayProgress * 0.5,
      future: false,
      stale: true
    };
  }

  const secondDecayProgress =
    (ageSeconds - twiceFreshnessCeiling) / (expiryAgeSeconds - twiceFreshnessCeiling);
  return {
    expired: false,
    factor: 0.5 * (1 - secondDecayProgress),
    future: false,
    stale: true
  };
};

const sampleFactor = (sampleSize: number | null, minimum: number): number => {
  if (sampleSize === null) {
    return 0.5;
  }
  if (sampleSize >= minimum) {
    return 1;
  }
  return Math.sqrt(sampleSize / minimum);
};

export function calculateProofScore(unparsedInput: unknown): ProofScoreResult {
  const input = proofScoreInputSchema.parse(unparsedInput);
  const asOfMs = Date.parse(input.asOf);
  const warnings: ProofScoreWarning[] = [];

  const accumulators: Record<ProofScoreComponent, { adjustedValue: number; confidence: number }> = {
    identity: { adjustedValue: 0, confidence: 0 },
    reliability: { adjustedValue: 0, confidence: 0 },
    riskAdjustedPerformance: { adjustedValue: 0, confidence: 0 },
    freshness: { adjustedValue: 0, confidence: 0 },
    trackRecord: { adjustedValue: 0, confidence: 0 },
    userFeedback: { adjustedValue: 0, confidence: 0 }
  };

  for (const definition of proofScoreSignalDefinitions) {
    const signal = input.signals[definition.id];
    if (signal === undefined || signal.availability === "unknown") {
      warnings.push({
        code: "MISSING_EVIDENCE",
        message: `${definition.id} has no usable evidence and receives no score credit.`,
        signalId: definition.id
      });
      continue;
    }
    if (signal.availability === "unavailable") {
      warnings.push({
        code: "UPSTREAM_UNAVAILABLE",
        message: `${definition.id} is unavailable and receives no score credit.`,
        signalId: definition.id
      });
      continue;
    }

    const freshness = freshnessFactor(
      asOfMs,
      signal.observedAt,
      definition.maxAgeSeconds,
      definition.expiryMultiplier
    );
    if (freshness.future) {
      warnings.push({
        code: "FUTURE_TIMESTAMP",
        message: `${definition.id} is dated in the future and receives no score credit.`,
        signalId: definition.id
      });
    } else if (freshness.expired) {
      warnings.push({
        code: "EXPIRED_EVIDENCE",
        message: `${definition.id} reached its ${definition.expiryMultiplier}x freshness cutoff and receives no score credit.`,
        signalId: definition.id
      });
    } else if (freshness.stale) {
      warnings.push({
        code: "STALE_EVIDENCE",
        message: `${definition.id} exceeds its ${definition.maxAgeSeconds}-second freshness policy.`,
        signalId: definition.id
      });
    }

    let sample = 1;
    if ("minimumSampleSize" in definition) {
      sample = sampleFactor(signal.sampleSize, definition.minimumSampleSize);
      if (signal.sampleSize === null) {
        warnings.push({
          code: "MISSING_SAMPLE_SIZE",
          message: `${definition.id} lacks a sample size; confidence is reduced.`,
          signalId: definition.id
        });
      } else if (signal.sampleSize < definition.minimumSampleSize) {
        warnings.push({
          code: "LOW_SAMPLE_SIZE",
          message: `${definition.id} has ${signal.sampleSize} observations; ${definition.minimumSampleSize} are required for full confidence.`,
          signalId: definition.id
        });
      }
    }

    const quality = freshness.factor * sample;
    const accumulator = accumulators[definition.component];
    accumulator.adjustedValue += definition.localWeight * signal.value * quality;
    accumulator.confidence += definition.localWeight * quality;
  }

  const componentResult = (component: ProofScoreComponent): ProofScoreComponentResult => {
    const weight = componentWeights[component];
    const accumulator = accumulators[component];
    return {
      confidence: round(accumulator.confidence, 3),
      contribution: round(weight * accumulator.adjustedValue),
      maximum: weight
    };
  };
  const components: Record<ProofScoreComponent, ProofScoreComponentResult> = {
    identity: componentResult("identity"),
    reliability: componentResult("reliability"),
    riskAdjustedPerformance: componentResult("riskAdjustedPerformance"),
    freshness: componentResult("freshness"),
    trackRecord: componentResult("trackRecord"),
    userFeedback: componentResult("userFeedback")
  };

  const score = round(
    proofScoreComponentSchema.options.reduce(
      (total, component) => total + components[component].contribution,
      0
    )
  );
  const confidence = round(
    proofScoreComponentSchema.options.reduce(
      (total, component) => total + componentWeights[component] * components[component].confidence,
      0
    ) / 100,
    3
  );

  if (confidence < 0.6) {
    warnings.push({
      code: "LOW_CONFIDENCE",
      message: "Less than 60% of weighted evidence is sufficiently fresh and complete.",
      signalId: null
    });
  }

  return {
    category: input.category,
    components,
    confidence,
    confidenceLabel: confidence >= 0.8 ? "high" : confidence >= 0.6 ? "medium" : "low",
    score,
    version: PROOF_SCORE_VERSION,
    warnings
  };
}
