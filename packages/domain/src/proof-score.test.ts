import { describe, expect, it } from "vitest";

import {
  calculateProofScore,
  getExpectedProofScoreMethod,
  getProofScoreCategoryNormalizationDefinition,
  normalizeCategoryPerformanceMetric,
  proofScoreInputSchema,
  proofScoreSignalDefinitions,
  type CategoryPerformanceSignalId,
  type ProofScoreCategory,
  type ProofScoreCategoryNormalization,
  type ProofScoreInput,
  type ProofScoreSignal,
  type ProofScoreSignalId
} from "./proof-score";

const asOf = "2026-08-11T12:00:00.000Z";
const observedAt = "2026-08-11T11:59:00.000Z";

function categoryNormalization(
  category: ProofScoreCategory,
  signalId: ProofScoreSignalId,
  rawValue?: number
): ProofScoreCategoryNormalization | null {
  const definition = getProofScoreCategoryNormalizationDefinition(category, signalId);
  if (definition === null) return null;
  const bestRawValue =
    definition.direction === "higher_is_better" ? definition.bounds.upper : definition.bounds.lower;
  return {
    bounds: { ...definition.bounds },
    category,
    direction: definition.direction,
    methodId: definition.methodId,
    methodVersion: definition.methodVersion,
    rawMetric: {
      id: definition.rawMetricId,
      unit: definition.unit,
      value: rawValue ?? bestRawValue
    }
  };
}

function availableSignal(
  category: ProofScoreCategory,
  definition: (typeof proofScoreSignalDefinitions)[number]
): ProofScoreSignal {
  const normalization = categoryNormalization(category, definition.id);
  const method = getExpectedProofScoreMethod(category, definition.id);
  return {
    availability: "available",
    normalization,
    observedAt,
    provenance: {
      evidenceId: `evidence:test/${category}/${definition.id}`,
      methodId: method.methodId,
      methodVersion: method.methodVersion,
      sourceKind: method.sourceKind
    },
    sampleSize: "minimumSampleSize" in definition ? definition.minimumSampleSize : null,
    value: normalization === null ? 1 : normalizeCategoryPerformanceMetric(normalization)
  };
}

const completeInput = (category: ProofScoreCategory = "lp-rebalancing"): ProofScoreInput => {
  const signals: ProofScoreInput["signals"] = {};
  for (const definition of proofScoreSignalDefinitions) {
    signals[definition.id] = availableSignal(category, definition);
  }
  return { asOf, category, signals };
};

function setCategoryRawMetric(
  input: ProofScoreInput,
  signalId: CategoryPerformanceSignalId,
  rawValue: number
): void {
  const signal = input.signals[signalId];
  if (signal?.availability !== "available" || signal.normalization === null) {
    throw new Error(`Complete fixture requires normalized ${signalId} evidence.`);
  }
  const normalization: ProofScoreCategoryNormalization = {
    ...signal.normalization,
    rawMetric: { ...signal.normalization.rawMetric, value: rawValue }
  };
  input.signals[signalId] = {
    ...signal,
    normalization,
    value: normalizeCategoryPerformanceMetric(normalization)
  };
}

const goldenVectors = [
  {
    category: "lp-rebalancing",
    raw: { categoryOutcome: 500, downsideControl: 500, costEfficiency: 100 },
    riskContribution: 19.1,
    score: 94.1
  },
  {
    category: "grid-trading",
    raw: { categoryOutcome: 0, downsideControl: 750, costEfficiency: 300 },
    riskContribution: 14.7,
    score: 89.7
  },
  {
    category: "yield-optimisation",
    raw: { categoryOutcome: 250, downsideControl: 500, costEfficiency: 150 },
    riskContribution: 17.2,
    score: 92.2
  },
  {
    category: "health-factor-monitoring",
    raw: { categoryOutcome: 900_000, downsideControl: 1_500, costEfficiency: 20 },
    riskContribution: 18.4,
    score: 93.4
  }
] as const satisfies readonly {
  category: ProofScoreCategory;
  raw: Readonly<Record<CategoryPerformanceSignalId, number>>;
  riskContribution: number;
  score: number;
}[];

describe("calculateProofScore", () => {
  it("awards a perfect score only to complete, fresh, full-sample evidence", () => {
    const result = calculateProofScore(completeInput());

    expect(result.score).toBe(100);
    expect(result.confidence).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it.each(goldenVectors)(
    "matches the $category golden vector",
    ({ category, raw, riskContribution, score }) => {
      const input = completeInput(category);
      for (const signalId of ["categoryOutcome", "downsideControl", "costEfficiency"] as const) {
        setCategoryRawMetric(input, signalId, raw[signalId]);
      }

      const result = calculateProofScore(input);
      expect(result.category).toBe(category);
      expect(result.components.riskAdjustedPerformance.contribution).toBe(riskContribution);
      expect(result.score).toBe(score);
    }
  );

  it.each(["categoryOutcome", "downsideControl", "costEfficiency"] as const)(
    "rejects %s normalization copied from another category",
    (signalId) => {
      const gridInput = completeInput("grid-trading");
      const lpSignal = completeInput("lp-rebalancing").signals[signalId];
      if (lpSignal === undefined) throw new Error(`Complete fixture requires ${signalId}.`);
      gridInput.signals[signalId] = lpSignal;

      expect(() => calculateProofScore(gridInput)).toThrow(
        new RegExp(`grid-trading/${signalId}`, "i")
      );
    }
  );

  it.each(["categoryOutcome", "downsideControl", "costEfficiency"] as const)(
    "rejects absent %s category normalization",
    (signalId) => {
      const input = completeInput();
      const signal = input.signals[signalId];
      if (signal?.availability !== "available") {
        throw new Error(`Complete fixture requires ${signalId}.`);
      }
      input.signals[signalId] = { ...signal, normalization: null };

      expect(() => calculateProofScore(input)).toThrow(/category-bound normalization/i);
    }
  );

  it("rejects provenance-free available evidence", () => {
    const input = completeInput();
    const identity = input.signals.registryIdentity;
    if (identity?.availability !== "available") {
      throw new Error("Complete fixture requires registry identity.");
    }

    const noProvenance = {
      ...input,
      signals: {
        ...input.signals,
        registryIdentity: {
          ...identity,
          provenance: undefined
        }
      }
    };

    expect(proofScoreInputSchema.safeParse(noProvenance).success).toBe(false);
  });

  it("rejects normalized values that do not match disclosed raw metrics and bounds", () => {
    const input = completeInput();
    const outcome = input.signals.categoryOutcome;
    if (outcome?.availability !== "available") {
      throw new Error("Complete fixture requires category outcome.");
    }
    input.signals.categoryOutcome = { ...outcome, value: 0.25 };

    expect(() => calculateProofScore(input)).toThrow(/normalized value must equal/i);
  });

  it("has no 8004scan aggregate registry-score provenance path", () => {
    const input = completeInput();
    const identity = input.signals.registryIdentity;
    if (identity?.availability !== "available") {
      throw new Error("Complete fixture requires registry identity.");
    }
    input.signals.registryIdentity = {
      ...identity,
      provenance: {
        ...identity.provenance,
        methodId: "8004scan.registry-score"
      }
    };

    expect(() => calculateProofScore(input)).toThrow(/proofera\.identity\.erc8004-registration/i);
  });

  it("keeps fresh > stale > expired = missing for score and confidence", () => {
    const fresh = calculateProofScore(completeInput());

    const staleInput = completeInput();
    const staleSignal = staleInput.signals.marketEvidenceFreshness;
    if (staleSignal?.availability !== "available") {
      throw new Error("Complete fixture requires market freshness evidence.");
    }
    staleInput.signals.marketEvidenceFreshness = {
      ...staleSignal,
      observedAt: "2026-08-11T11:40:00.000Z"
    };
    const stale = calculateProofScore(staleInput);

    const expiredInput = completeInput();
    const expiredSignal = expiredInput.signals.marketEvidenceFreshness;
    if (expiredSignal?.availability !== "available") {
      throw new Error("Complete fixture requires market freshness evidence.");
    }
    expiredInput.signals.marketEvidenceFreshness = {
      ...expiredSignal,
      observedAt: "2026-08-11T11:30:00.000Z"
    };
    const expired = calculateProofScore(expiredInput);

    const missingInput = completeInput();
    delete missingInput.signals.marketEvidenceFreshness;
    const missing = calculateProofScore(missingInput);

    expect(fresh.score).toBeGreaterThan(stale.score);
    expect(stale.score).toBeGreaterThan(expired.score);
    expect(expired.score).toBe(missing.score);
    expect(fresh.confidence).toBeGreaterThan(stale.confidence);
    expect(stale.confidence).toBeGreaterThan(expired.confidence);
    expect(expired.confidence).toBe(missing.confidence);
    expect(stale.warnings).toContainEqual(
      expect.objectContaining({ code: "STALE_EVIDENCE", signalId: "marketEvidenceFreshness" })
    );
    expect(expired.warnings).toContainEqual(
      expect.objectContaining({ code: "EXPIRED_EVIDENCE", signalId: "marketEvidenceFreshness" })
    );
  });

  it("expires every signal at its documented per-signal cutoff", () => {
    for (const definition of proofScoreSignalDefinitions) {
      const expiredInput = completeInput();
      const expiredSignal = expiredInput.signals[definition.id];
      if (expiredSignal?.availability !== "available") {
        throw new Error(`Complete fixture requires ${definition.id}.`);
      }
      expiredInput.signals[definition.id] = {
        ...expiredSignal,
        observedAt: new Date(
          Date.parse(asOf) - definition.maxAgeSeconds * definition.expiryMultiplier * 1_000
        ).toISOString()
      };

      const missingInput = completeInput();
      delete missingInput.signals[definition.id];
      const expired = calculateProofScore(expiredInput);
      const missing = calculateProofScore(missingInput);

      expect(expired.score, definition.id).toBe(missing.score);
      expect(expired.confidence, definition.id).toBe(missing.confidence);
      expect(expired.warnings, definition.id).toContainEqual(
        expect.objectContaining({ code: "EXPIRED_EVIDENCE", signalId: definition.id })
      );
    }
  });

  it("gives any future timestamp zero credit", () => {
    const futureInput = completeInput();
    const futureSignal = futureInput.signals.marketEvidenceFreshness;
    if (futureSignal?.availability !== "available") {
      throw new Error("Complete fixture requires market freshness evidence.");
    }
    futureInput.signals.marketEvidenceFreshness = {
      ...futureSignal,
      observedAt: "2026-08-11T12:00:00.001Z"
    };
    const future = calculateProofScore(futureInput);

    const missingInput = completeInput();
    delete missingInput.signals.marketEvidenceFreshness;
    const missing = calculateProofScore(missingInput);

    expect(future.score).toBe(missing.score);
    expect(future.confidence).toBe(missing.confidence);
    expect(future.warnings).toContainEqual(expect.objectContaining({ code: "FUTURE_TIMESTAMP" }));
  });

  it("does not renormalize away missing evidence", () => {
    const input = completeInput();
    delete input.signals.registryIdentity;

    const result = calculateProofScore(input);

    expect(result.score).toBeLessThan(100);
    expect(result.confidence).toBeLessThan(1);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "MISSING_EVIDENCE", signalId: "registryIdentity" })
    );
  });

  it("adds a transparent low-sample penalty", () => {
    const input = completeInput();
    const signal = input.signals.executionSuccess;
    if (signal?.availability !== "available") {
      throw new Error("Complete fixture requires execution success evidence.");
    }
    input.signals.executionSuccess = { ...signal, sampleSize: 5 };

    const result = calculateProofScore(input);

    expect(result.components.reliability.contribution).toBeLessThan(25);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "LOW_SAMPLE_SIZE", signalId: "executionSuccess" })
    );
  });

  it("is monotonic in category raw evidence when evidence quality is unchanged", () => {
    const lowerInput = completeInput();
    const higherInput = completeInput();
    setCategoryRawMetric(lowerInput, "categoryOutcome", -500);
    setCategoryRawMetric(higherInput, "categoryOutcome", 500);

    expect(calculateProofScore(higherInput).score).toBeGreaterThan(
      calculateProofScore(lowerInput).score
    );
  });

  it("is deterministic for an explicit as-of time", () => {
    const input = completeInput();
    expect(calculateProofScore(input)).toEqual(calculateProofScore(input));
  });

  it("rejects unknown fields at every nested schema boundary", () => {
    const input = completeInput();
    const identity = input.signals.registryIdentity;
    if (identity?.availability !== "available") {
      throw new Error("Complete fixture requires registry identity.");
    }
    const untrusted = {
      ...input,
      signals: {
        ...input.signals,
        registryIdentity: {
          ...identity,
          provenance: { ...identity.provenance, upstreamScore: 99 }
        }
      }
    };

    expect(proofScoreInputSchema.safeParse(untrusted).success).toBe(false);
  });
});
