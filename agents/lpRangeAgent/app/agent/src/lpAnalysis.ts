import { z } from "zod";

export const LP_RANGE_METHODOLOGY_VERSION = "proofera-lp-range-v1.0.0";

const MAX_UINT256 = (1n << 256n) - 1n;
const MIN_TICK = -887_272;
const MAX_TICK = 887_272;

const chainIdSchema = z.union([z.literal(56), z.literal(97)]);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected a 20-byte EVM address");
const uintStringSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/, "expected a canonical unsigned decimal string")
  .refine((value) => {
    try {
      return BigInt(value) <= MAX_UINT256;
    } catch {
      return false;
    }
  }, "value exceeds uint256");
const utcTimestampSchema = z
  .string()
  .max(32)
  .datetime({ offset: false, message: "expected an ISO 8601 UTC timestamp" });
const tickSchema = z.number().int().min(MIN_TICK).max(MAX_TICK);

const capitalSchema = z
  .object({
    asset: z.string().trim().min(1).max(32),
    minorUnitDecimals: z.number().int().min(0).max(36),
    amountMinorUnits: uintStringSchema,
    minimumMinorUnits: uintStringSchema,
    maximumMinorUnits: uintStringSchema
  })
  .strict();

const riskConstraintsSchema = z
  .object({
    reviewBufferTicks: z
      .number()
      .int()
      .min(0)
      .max(MAX_TICK * 2),
    maximumRangeWidthTicks: z
      .number()
      .int()
      .positive()
      .max(MAX_TICK * 2),
    maximumSourceAgeSeconds: z.number().int().positive().max(604_800),
    futureToleranceSeconds: z.number().int().min(0).max(300).default(30),
    minimumNetBenefitMinorUnits: uintStringSchema,
    maximumKnownCostsMinorUnits: uintStringSchema.optional()
  })
  .strict();

const economicsSchema = z
  .object({
    quoteAsset: z.string().trim().min(1).max(32),
    minorUnitDecimals: z.number().int().min(0).max(36),
    projectedIncrementalFeesMinorUnits: uintStringSchema.optional(),
    knownGasCostMinorUnits: uintStringSchema.optional(),
    knownSlippageCostMinorUnits: uintStringSchema.optional()
  })
  .strict();

const onchainSourceSchema = z
  .object({
    kind: z.literal("onchain"),
    chainId: chainIdSchema,
    blockNumber: uintStringSchema,
    poolAddress: addressSchema,
    positionManagerAddress: addressSchema,
    poolRead: z.literal("slot0()"),
    positionRead: z.literal("positions(uint256)")
  })
  .strict();

const httpSourceSchema = z
  .object({
    kind: z.literal("http"),
    url: z
      .string()
      .max(2_048)
      .superRefine((value, ctx) => {
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid source URL" });
          return;
        }
        const localHttp =
          parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
        if (parsed.protocol !== "https:" && !localHttp) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "source URL must use HTTPS (HTTP is allowed only for localhost)"
          });
        }
        if (parsed.username || parsed.password || parsed.hash) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "source URL must not contain credentials or a fragment"
          });
        }
      }),
    publisher: z.string().trim().min(1).max(120),
    contentSha256: z.string().regex(/^[0-9a-fA-F]{64}$/, "expected a SHA-256 hex digest")
  })
  .strict();

export const lpAnalysisInputSchema = z
  .object({
    chainId: chainIdSchema,
    poolAddress: addressSchema,
    positionManagerAddress: addressSchema,
    positionId: uintStringSchema,
    observedAtBlock: uintStringSchema,
    observedAtUtc: utcTimestampSchema,
    analysisAtUtc: utcTimestampSchema,
    sourceLocator: z.discriminatedUnion("kind", [onchainSourceSchema, httpSourceSchema]),
    currentTick: tickSchema,
    tickSpacing: z.number().int().positive().max(32_768),
    lowerTick: tickSchema,
    upperTick: tickSchema,
    capital: capitalSchema,
    riskConstraints: riskConstraintsSchema,
    economics: economicsSchema.optional()
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.lowerTick >= input.upperTick) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lowerTick"],
        message: "lowerTick must be less than upperTick"
      });
    }
    for (const key of ["lowerTick", "upperTick"] as const) {
      if (input[key] % input.tickSpacing !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be a multiple of tickSpacing`
        });
      }
    }
    if (input.riskConstraints.reviewBufferTicks % input.tickSpacing !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["riskConstraints", "reviewBufferTicks"],
        message: "reviewBufferTicks must be a multiple of tickSpacing"
      });
    }
    if (BigInt(input.capital.minimumMinorUnits) > BigInt(input.capital.maximumMinorUnits)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["capital", "minimumMinorUnits"],
        message: "minimumMinorUnits must not exceed maximumMinorUnits"
      });
    }
    if (
      input.economics !== undefined &&
      (input.economics.quoteAsset !== input.capital.asset ||
        input.economics.minorUnitDecimals !== input.capital.minorUnitDecimals)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["economics"],
        message: "economics units must match the capital asset and minor-unit decimals"
      });
    }
    if (input.sourceLocator.kind === "onchain") {
      if (input.sourceLocator.chainId !== input.chainId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceLocator", "chainId"],
          message: "source chainId must match the analyzed chainId"
        });
      }
      if (input.sourceLocator.blockNumber !== input.observedAtBlock) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceLocator", "blockNumber"],
          message: "source blockNumber must match observedAtBlock"
        });
      }
      if (!sameAddress(input.sourceLocator.poolAddress, input.poolAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceLocator", "poolAddress"],
          message: "source poolAddress must match poolAddress"
        });
      }
      if (!sameAddress(input.sourceLocator.positionManagerAddress, input.positionManagerAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceLocator", "positionManagerAddress"],
          message: "source positionManagerAddress must match positionManagerAddress"
        });
      }
    }
  });

const violationCodeSchema = z.enum([
  "SOURCE_STALE",
  "SOURCE_IN_FUTURE",
  "CAPITAL_BELOW_MINIMUM",
  "CAPITAL_ABOVE_MAXIMUM",
  "RANGE_WIDTH_EXCEEDS_MAXIMUM",
  "KNOWN_COSTS_EXCEED_MAXIMUM",
  "ECONOMICS_INCOMPLETE",
  "NET_BENEFIT_BELOW_MINIMUM"
]);

const violationSchema = z
  .object({
    code: violationCodeSchema,
    message: z.string().min(1).max(240)
  })
  .strict();

const resultEconomicsSchema = z
  .object({
    quoteAsset: z.string().min(1).max(32),
    minorUnitDecimals: z.number().int().min(0).max(36),
    projectedIncrementalFeesMinorUnits: uintStringSchema.nullable(),
    knownGasCostMinorUnits: uintStringSchema.nullable(),
    knownSlippageCostMinorUnits: uintStringSchema.nullable(),
    knownTotalCostsMinorUnits: uintStringSchema.nullable(),
    knownNetBenefitMinorUnits: z
      .string()
      .max(79)
      .regex(/^-?(0|[1-9][0-9]*)$/)
      .nullable()
  })
  .strict();

export const lpAnalysisResultSchema = z
  .object({
    skill: z.literal("analyze_lp_range"),
    methodologyVersion: z.literal(LP_RANGE_METHODOLOGY_VERSION),
    environment: z.enum(["bsc-mainnet", "bsc-testnet"]),
    chainId: chainIdSchema,
    poolAddress: addressSchema,
    positionManagerAddress: addressSchema,
    positionId: uintStringSchema,
    executionEnabled: z.literal(false),
    inRange: z.boolean(),
    currentTick: tickSchema,
    lowerTick: tickSchema,
    upperTick: tickSchema,
    tickSpacing: z.number().int().positive().max(32_768),
    rangeWidthTicks: z
      .number()
      .int()
      .positive()
      .max(MAX_TICK * 2),
    tickBuffers: z
      .object({
        fromLowerTick: z.number().int(),
        toUpperExclusiveTick: z.number().int()
      })
      .strict(),
    sourceLocator: z.discriminatedUnion("kind", [onchainSourceSchema, httpSourceSchema]),
    observedAtBlock: uintStringSchema,
    observedAtUtc: utcTimestampSchema,
    analysisAtUtc: utcTimestampSchema,
    sourceAgeSeconds: z.number().int(),
    capital: capitalSchema,
    riskConstraints: riskConstraintsSchema,
    economics: resultEconomicsSchema,
    constraintViolations: z.array(violationSchema).max(12),
    decision: z.enum(["hold", "review_rebalance", "insufficient_evidence"]),
    rationale: z.array(z.string().min(1).max(240)).min(1).max(4),
    limitations: z.array(z.string().min(1).max(240)).min(3).max(4)
  })
  .strict();

export type LpAnalysisInput = z.infer<typeof lpAnalysisInputSchema>;
export type LpAnalysisResult = z.infer<typeof lpAnalysisResultSchema>;

type Violation = z.infer<typeof violationSchema>;

/**
 * Analyze a caller-supplied PancakeSwap V3 LP snapshot without fetching data,
 * signing, quoting, or writing onchain. Every financial calculation uses
 * bigint minor units; tick/time arithmetic stays within safe integer bounds.
 */
export function analyzeLpRange(rawInput: unknown): LpAnalysisResult {
  const input = lpAnalysisInputSchema.parse(rawInput);
  const violations: Violation[] = [];

  const observedMs = Date.parse(input.observedAtUtc);
  const analysisMs = Date.parse(input.analysisAtUtc);
  const sourceAgeMs = analysisMs - observedMs;
  const sourceAgeSeconds = Math.trunc(sourceAgeMs / 1_000);
  if (sourceAgeMs > input.riskConstraints.maximumSourceAgeSeconds * 1_000) {
    violations.push({
      code: "SOURCE_STALE",
      message: "The observation is older than maximumSourceAgeSeconds."
    });
  }
  if (sourceAgeMs < -input.riskConstraints.futureToleranceSeconds * 1_000) {
    violations.push({
      code: "SOURCE_IN_FUTURE",
      message: "The observation is ahead of analysisAtUtc beyond the allowed tolerance."
    });
  }

  const capital = BigInt(input.capital.amountMinorUnits);
  if (capital < BigInt(input.capital.minimumMinorUnits)) {
    violations.push({
      code: "CAPITAL_BELOW_MINIMUM",
      message: "Capital is below the configured strategy minimum."
    });
  }
  if (capital > BigInt(input.capital.maximumMinorUnits)) {
    violations.push({
      code: "CAPITAL_ABOVE_MAXIMUM",
      message: "Capital is above the configured strategy maximum."
    });
  }

  const rangeWidthTicks = input.upperTick - input.lowerTick;
  if (rangeWidthTicks > input.riskConstraints.maximumRangeWidthTicks) {
    violations.push({
      code: "RANGE_WIDTH_EXCEEDS_MAXIMUM",
      message: "The position range is wider than the configured risk limit."
    });
  }

  const fromLowerTick = input.currentTick - input.lowerTick;
  const toUpperExclusiveTick = input.upperTick - input.currentTick;
  const inRange = fromLowerTick >= 0 && toUpperExclusiveTick > 0;
  const nearBoundary =
    inRange &&
    Math.min(fromLowerTick, toUpperExclusiveTick) <= input.riskConstraints.reviewBufferTicks;

  const economicValues = economics(input);
  if (
    economicValues.knownTotalCosts !== null &&
    input.riskConstraints.maximumKnownCostsMinorUnits !== undefined &&
    economicValues.knownTotalCosts > BigInt(input.riskConstraints.maximumKnownCostsMinorUnits)
  ) {
    violations.push({
      code: "KNOWN_COSTS_EXCEED_MAXIMUM",
      message: "Known gas and slippage costs exceed the configured cost limit."
    });
  }

  const hasRiskViolation = violations.some((violation) =>
    [
      "CAPITAL_BELOW_MINIMUM",
      "CAPITAL_ABOVE_MAXIMUM",
      "RANGE_WIDTH_EXCEEDS_MAXIMUM",
      "KNOWN_COSTS_EXCEED_MAXIMUM"
    ].includes(violation.code)
  );
  const needsReview = !inRange || nearBoundary || hasRiskViolation;
  const hasTimingViolation = violations.some((violation) =>
    ["SOURCE_STALE", "SOURCE_IN_FUTURE"].includes(violation.code)
  );

  let decision: LpAnalysisResult["decision"];
  const rationale: string[] = [];
  if (hasTimingViolation) {
    decision = "insufficient_evidence";
    rationale.push("Source timing fails the requested freshness policy.");
  } else if (hasRiskViolation) {
    decision = "hold";
    rationale.push("One or more configured risk constraints prohibit a rebalance review.");
  } else if (needsReview && economicValues.knownNetBenefit === null) {
    violations.push({
      code: "ECONOMICS_INCOMPLETE",
      message:
        "Projected incremental fees, known gas cost, and known slippage cost are all required to assess a rebalance."
    });
    decision = "insufficient_evidence";
    rationale.push("A range or risk trigger exists, but rebalance economics are incomplete.");
  } else if (
    needsReview &&
    economicValues.knownNetBenefit !== null &&
    economicValues.knownNetBenefit >= BigInt(input.riskConstraints.minimumNetBenefitMinorUnits)
  ) {
    decision = "review_rebalance";
    rationale.push(
      !inRange
        ? "The current tick is outside the LP range and known net benefit meets the review threshold."
        : "A boundary or risk constraint trigger exists and known net benefit meets the review threshold."
    );
  } else if (needsReview && economicValues.knownNetBenefit !== null) {
    violations.push({
      code: "NET_BENEFIT_BELOW_MINIMUM",
      message: "Known net benefit is below the configured review threshold."
    });
    decision = "hold";
    rationale.push(
      "A review trigger exists, but known net benefit does not justify a rebalance review."
    );
  } else {
    decision = "hold";
    rationale.push("The current tick is in range and outside the configured review buffer.");
  }

  rationale.push(
    inRange
      ? `Current tick is inside [lowerTick, upperTick) with exact buffers ${String(fromLowerTick)} and ${String(toUpperExclusiveTick)} ticks.`
      : `Current tick is outside [lowerTick, upperTick); signed buffers are ${String(fromLowerTick)} and ${String(toUpperExclusiveTick)} ticks.`
  );

  const limitations = [
    "The agent analyzes caller-supplied evidence and does not independently fetch or attest the snapshot.",
    "This tick-based method does not estimate impermanent loss, token prices, or unprovided fees and costs.",
    "The result is read-only decision support; it cannot sign, approve, rebalance, or submit a transaction."
  ];
  if (input.sourceLocator.kind === "http") {
    limitations.push(
      "The supplied HTTP publisher and content digest are recorded but not independently authenticated."
    );
  }

  const result: LpAnalysisResult = {
    skill: "analyze_lp_range",
    methodologyVersion: LP_RANGE_METHODOLOGY_VERSION,
    environment: input.chainId === 56 ? "bsc-mainnet" : "bsc-testnet",
    chainId: input.chainId,
    poolAddress: input.poolAddress,
    positionManagerAddress: input.positionManagerAddress,
    positionId: input.positionId,
    executionEnabled: false,
    inRange,
    currentTick: input.currentTick,
    lowerTick: input.lowerTick,
    upperTick: input.upperTick,
    tickSpacing: input.tickSpacing,
    rangeWidthTicks,
    tickBuffers: { fromLowerTick, toUpperExclusiveTick },
    sourceLocator: input.sourceLocator,
    observedAtBlock: input.observedAtBlock,
    observedAtUtc: input.observedAtUtc,
    analysisAtUtc: input.analysisAtUtc,
    sourceAgeSeconds,
    capital: input.capital,
    riskConstraints: input.riskConstraints,
    economics: {
      quoteAsset: input.economics?.quoteAsset ?? input.capital.asset,
      minorUnitDecimals: input.economics?.minorUnitDecimals ?? input.capital.minorUnitDecimals,
      projectedIncrementalFeesMinorUnits:
        input.economics?.projectedIncrementalFeesMinorUnits ?? null,
      knownGasCostMinorUnits: input.economics?.knownGasCostMinorUnits ?? null,
      knownSlippageCostMinorUnits: input.economics?.knownSlippageCostMinorUnits ?? null,
      knownTotalCostsMinorUnits: economicValues.knownTotalCosts?.toString() ?? null,
      knownNetBenefitMinorUnits: economicValues.knownNetBenefit?.toString() ?? null
    },
    constraintViolations: violations,
    decision,
    rationale,
    limitations
  };

  return lpAnalysisResultSchema.parse(result);
}

export interface LpAnalysisInputError {
  error: "INVALID_ANALYSIS_INPUT";
  issues: Array<{ path: string; message: string }>;
  executionEnabled: false;
}

/** A2A flat data-part adapter: `{skill:"analyze_lp_range", ...input}`. */
export function handleLpAnalysisA2a(
  data: Record<string, unknown>
): LpAnalysisResult | LpAnalysisInputError {
  if (data.skill !== "analyze_lp_range") {
    return invalidInput([{ path: "skill", message: "expected analyze_lp_range" }]);
  }
  const { skill: _skill, ...input } = data;
  void _skill;
  const parsed = lpAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidInput(
      parsed.error.issues.slice(0, 12).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message.slice(0, 240)
      }))
    );
  }
  return analyzeLpRange(parsed.data);
}

/** MCP adapter with JSON text plus spec-native structured output. */
export function handleLpAnalysisMcp(rawInput: unknown): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
} {
  const result = analyzeLpRange(rawInput);
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: { ...result }
  };
}

function economics(input: LpAnalysisInput): {
  knownTotalCosts: bigint | null;
  knownNetBenefit: bigint | null;
} {
  const fees = input.economics?.projectedIncrementalFeesMinorUnits;
  const gas = input.economics?.knownGasCostMinorUnits;
  const slippage = input.economics?.knownSlippageCostMinorUnits;
  if (fees === undefined || gas === undefined || slippage === undefined) {
    return { knownTotalCosts: null, knownNetBenefit: null };
  }
  const knownTotalCosts = BigInt(gas) + BigInt(slippage);
  return {
    knownTotalCosts,
    knownNetBenefit: BigInt(fees) - knownTotalCosts
  };
}

function invalidInput(issues: Array<{ path: string; message: string }>): LpAnalysisInputError {
  return { error: "INVALID_ANALYSIS_INPUT", issues, executionEnabled: false };
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
