import { z } from "zod";

export const GRID_TRADING_SKILL = "analyze_grid_trading" as const;
export const GRID_TRADING_METHODOLOGY_VERSION = "proofera-grid-trading-v1.0.0" as const;

const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_GRID_LEVELS = 500;
const EVIDENCE_FIELDS = [
  "currentPrice",
  "gridRange",
  "tradingFee",
  "estimatedRoundTripGas",
  "capital",
  "riskConstraints"
] as const;

const chainIdSchema = z.union([z.literal(56), z.literal(97)]);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected a 20-byte EVM address");
const assetSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9._-]+$/, "asset must use letters, numbers, dot, underscore, or hyphen");
const uint256StringSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/, "expected a canonical unsigned decimal string")
  .refine((value) => BigInt(value) <= MAX_UINT256, "value exceeds uint256");
const derivedUintStringSchema = z
  .string()
  .max(256)
  .regex(/^(0|[1-9][0-9]*)$/, "expected a canonical unsigned decimal string");
const derivedIntStringSchema = z
  .string()
  .max(257)
  .regex(/^-?(0|[1-9][0-9]*)$/, "expected a canonical signed decimal string");
const decimalStringSchema = z
  .string()
  .max(97)
  .regex(
    /^(0|[1-9][0-9]{0,77})(\.[0-9]{1,18})?$/,
    "expected a canonical decimal string with at most 78 integer and 18 fractional digits"
  );
const positiveDecimalStringSchema = decimalStringSchema.refine(
  (value) => parseDecimal(value).coefficient > 0n,
  "price must be greater than zero"
);
const utcTimestampSchema = z
  .string()
  .max(32)
  .datetime({ offset: false, message: "expected an ISO 8601 UTC timestamp" });

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

const onchainSourceSchema = z
  .object({
    kind: z.literal("onchain"),
    chainId: chainIdSchema,
    blockNumber: uint256StringSchema,
    contractAddress: addressSchema,
    read: z.string().trim().min(1).max(160)
  })
  .strict();

const callerSourceSchema = z
  .object({
    kind: z.literal("caller"),
    reference: z.string().trim().min(1).max(160)
  })
  .strict();

export const gridEvidenceSourceSchema = z.discriminatedUnion("kind", [
  httpSourceSchema,
  onchainSourceSchema,
  callerSourceSchema
]);

const currentPriceEvidenceSchema = z
  .object({
    value: positiveDecimalStringSchema,
    observedAtUtc: utcTimestampSchema,
    source: gridEvidenceSourceSchema
  })
  .strict();

const gridRangeEvidenceSchema = z
  .object({
    lowerPrice: positiveDecimalStringSchema,
    upperPrice: positiveDecimalStringSchema,
    levels: z.number().int().min(2).max(MAX_GRID_LEVELS),
    observedAtUtc: utcTimestampSchema,
    source: gridEvidenceSourceSchema
  })
  .strict();

const tradingFeeEvidenceSchema = z
  .object({
    oneWayFeeBps: z.number().int().min(0).max(10_000),
    observedAtUtc: utcTimestampSchema,
    source: gridEvidenceSourceSchema
  })
  .strict();

const gasEvidenceSchema = z
  .object({
    amountMinorUnits: uint256StringSchema,
    asset: assetSchema,
    minorUnitDecimals: z.number().int().min(0).max(36),
    observedAtUtc: utcTimestampSchema,
    source: gridEvidenceSourceSchema
  })
  .strict();

const capitalEvidenceSchema = z
  .object({
    amountMinorUnits: uint256StringSchema,
    minimumMinorUnits: uint256StringSchema,
    maximumMinorUnits: uint256StringSchema,
    asset: assetSchema,
    minorUnitDecimals: z.number().int().min(0).max(36),
    observedAtUtc: utcTimestampSchema,
    source: gridEvidenceSourceSchema
  })
  .strict();

const riskConstraintsEvidenceSchema = z
  .object({
    minimumGridLevels: z.number().int().min(2).max(MAX_GRID_LEVELS),
    maximumGridLevels: z.number().int().min(2).max(MAX_GRID_LEVELS),
    maximumRangeWidthBps: z.number().int().positive().max(1_000_000),
    maximumDownsideToLowerBps: z.number().int().min(0).max(1_000_000),
    maximumKnownRoundTripCostBps: z.number().int().min(0).max(1_000_000),
    maximumSourceAgeSeconds: z.number().int().positive().max(604_800),
    futureToleranceSeconds: z.number().int().min(0).max(300),
    observedAtUtc: utcTimestampSchema,
    source: gridEvidenceSourceSchema
  })
  .strict();

export const gridTradingAnalysisInputSchema = z
  .object({
    chainId: chainIdSchema,
    market: z
      .object({
        baseAsset: assetSchema,
        quoteAsset: assetSchema
      })
      .strict(),
    analysisAtUtc: utcTimestampSchema,
    currentPrice: currentPriceEvidenceSchema.nullable().optional(),
    gridRange: gridRangeEvidenceSchema.nullable().optional(),
    tradingFee: tradingFeeEvidenceSchema.nullable().optional(),
    estimatedRoundTripGas: gasEvidenceSchema.nullable().optional(),
    capital: capitalEvidenceSchema.nullable().optional(),
    riskConstraints: riskConstraintsEvidenceSchema.nullable().optional()
  })
  .strict()
  .superRefine((input, ctx) => {
    if (sameText(input.market.baseAsset, input.market.quoteAsset)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["market"],
        message: "baseAsset and quoteAsset must differ"
      });
    }
    if (
      input.gridRange !== null &&
      input.gridRange !== undefined &&
      compareDecimalStrings(input.gridRange.lowerPrice, input.gridRange.upperPrice) >= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gridRange", "lowerPrice"],
        message: "lowerPrice must be less than upperPrice"
      });
    }
    if (input.capital !== null && input.capital !== undefined) {
      if (BigInt(input.capital.minimumMinorUnits) > BigInt(input.capital.maximumMinorUnits)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["capital", "minimumMinorUnits"],
          message: "minimumMinorUnits must not exceed maximumMinorUnits"
        });
      }
      if (!sameText(input.capital.asset, input.market.quoteAsset)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["capital", "asset"],
          message: "capital asset must match market.quoteAsset"
        });
      }
    }
    if (input.estimatedRoundTripGas !== null && input.estimatedRoundTripGas !== undefined) {
      if (!sameText(input.estimatedRoundTripGas.asset, input.market.quoteAsset)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["estimatedRoundTripGas", "asset"],
          message: "gas cost asset must match market.quoteAsset"
        });
      }
      if (
        input.capital !== null &&
        input.capital !== undefined &&
        input.estimatedRoundTripGas.minorUnitDecimals !== input.capital.minorUnitDecimals
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["estimatedRoundTripGas", "minorUnitDecimals"],
          message: "gas cost and capital must use the same minor-unit decimals"
        });
      }
    }
    if (
      input.riskConstraints !== null &&
      input.riskConstraints !== undefined &&
      input.riskConstraints.minimumGridLevels > input.riskConstraints.maximumGridLevels
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["riskConstraints", "minimumGridLevels"],
        message: "minimumGridLevels must not exceed maximumGridLevels"
      });
    }

    for (const [field, evidence] of evidenceEntries(input)) {
      if (evidence?.source.kind === "onchain" && evidence.source.chainId !== input.chainId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field, "source", "chainId"],
          message: "onchain evidence chainId must match the analyzed chainId"
        });
      }
    }
  });

const evidenceFieldSchema = z.enum(EVIDENCE_FIELDS);
const evidenceStateSchema = z.enum(["missing", "fresh", "stale", "future", "freshness_unassessed"]);
const provenanceSchema = z
  .object({
    field: evidenceFieldSchema,
    state: evidenceStateSchema,
    observedAtUtc: utcTimestampSchema.nullable(),
    ageSeconds: z.number().int().nullable(),
    source: gridEvidenceSourceSchema.nullable()
  })
  .strict();

const violationCodeSchema = z.enum([
  "MISSING_EVIDENCE",
  "SOURCE_STALE",
  "SOURCE_IN_FUTURE",
  "CURRENT_PRICE_OUTSIDE_OPEN_RANGE",
  "CAPITAL_BELOW_MINIMUM",
  "CAPITAL_ABOVE_MAXIMUM",
  "GRID_LEVELS_BELOW_MINIMUM",
  "GRID_LEVELS_ABOVE_MAXIMUM",
  "RANGE_WIDTH_EXCEEDS_MAXIMUM",
  "DOWNSIDE_TO_LOWER_EXCEEDS_MAXIMUM",
  "CAPITAL_PER_LEVEL_ZERO",
  "KNOWN_COSTS_EXCEED_MAXIMUM",
  "KNOWN_COSTS_CONSUME_GRID_SPACING"
]);
const violationSchema = z
  .object({
    code: violationCodeSchema,
    field: z.string().min(1).max(80),
    message: z.string().min(1).max(240)
  })
  .strict();

const normalizedEvidenceSchema = z
  .object({
    currentPrice: currentPriceEvidenceSchema.nullable(),
    gridRange: gridRangeEvidenceSchema.nullable(),
    tradingFee: tradingFeeEvidenceSchema.nullable(),
    estimatedRoundTripGas: gasEvidenceSchema.nullable(),
    capital: capitalEvidenceSchema.nullable(),
    riskConstraints: riskConstraintsEvidenceSchema.nullable()
  })
  .strict();

const metricsSchema = z
  .object({
    rangeWidth: decimalStringSchema.nullable(),
    rangeWidthBpsFloor: derivedUintStringSchema.nullable(),
    gridIntervals: z
      .number()
      .int()
      .positive()
      .max(MAX_GRID_LEVELS - 1)
      .nullable(),
    adjacentSpacingRational: z
      .object({
        numerator: derivedUintStringSchema,
        denominator: derivedUintStringSchema,
        decimalScale: z.number().int().min(0).max(18)
      })
      .strict()
      .nullable(),
    adjacentSpacingBpsFloor: derivedUintStringSchema.nullable(),
    capitalPerGridLevelMinorUnits: derivedUintStringSchema.nullable(),
    unallocatedCapitalMinorUnits: derivedUintStringSchema.nullable()
  })
  .strict();

const costsSchema = z
  .object({
    asset: assetSchema.nullable(),
    minorUnitDecimals: z.number().int().min(0).max(36).nullable(),
    estimatedRoundTripGasCostMinorUnits: uint256StringSchema.nullable(),
    roundTripTradingFeeProxyMinorUnits: derivedUintStringSchema.nullable(),
    knownRoundTripCostMinorUnits: derivedUintStringSchema.nullable(),
    knownRoundTripCostBpsOfLevelCeil: derivedUintStringSchema.nullable(),
    grossAdjacentSpacingBudgetMinorUnitsFloor: derivedUintStringSchema.nullable(),
    residualAfterKnownCostsMinorUnits: derivedIntStringSchema.nullable(),
    interpretation: z.string().min(1).max(500)
  })
  .strict();

const drawdownRiskSchema = z
  .object({
    configuredDownsideToLowerBpsFloor: derivedUintStringSchema.nullable(),
    maximumAllowedBps: z.number().int().min(0).max(1_000_000).nullable(),
    withinLimit: z.boolean().nullable(),
    interpretation: z.string().min(1).max(500)
  })
  .strict();

const performanceSchema = z
  .object({
    status: z.literal("unknown_until_receipts_and_outcome_observations"),
    realizedPnlMinorUnits: z.null(),
    fills: z.null(),
    winRate: z.null(),
    maximumDrawdownBps: z.null(),
    statement: z.string().min(1).max(300)
  })
  .strict();

const methodologySchema = z
  .object({
    gridSpacing: z.string().min(1).max(500),
    costProxy: z.string().min(1).max(500),
    riskBoundary: z.string().min(1).max(500),
    decisionPolicy: z.string().min(1).max(500)
  })
  .strict();

export const gridTradingAnalysisResultSchema = z
  .object({
    skill: z.literal(GRID_TRADING_SKILL),
    methodologyVersion: z.literal(GRID_TRADING_METHODOLOGY_VERSION),
    environment: z.enum(["bsc-mainnet", "bsc-testnet"]),
    chainId: chainIdSchema,
    market: z
      .object({
        baseAsset: assetSchema,
        quoteAsset: assetSchema
      })
      .strict(),
    analysisAtUtc: utcTimestampSchema,
    executionEnabled: z.literal(false),
    evidence: normalizedEvidenceSchema,
    provenance: z.array(provenanceSchema).length(EVIDENCE_FIELDS.length),
    metrics: metricsSchema,
    costs: costsSchema,
    drawdownRisk: drawdownRiskSchema,
    performance: performanceSchema,
    constraintViolations: z.array(violationSchema).max(24),
    decision: z.enum(["hold", "review_grid", "insufficient_evidence"]),
    rationale: z.array(z.string().min(1).max(300)).min(2).max(4),
    methodology: methodologySchema,
    limitations: z.array(z.string().min(1).max(300)).min(4).max(5)
  })
  .strict();

export type GridTradingAnalysisInput = z.infer<typeof gridTradingAnalysisInputSchema>;
export type GridTradingAnalysisResult = z.infer<typeof gridTradingAnalysisResultSchema>;
type NormalizedEvidence = z.infer<typeof normalizedEvidenceSchema>;
type Provenance = z.infer<typeof provenanceSchema>;
type Violation = z.infer<typeof violationSchema>;

interface DecimalValue {
  coefficient: bigint;
  scale: number;
}

interface CalculatedValues {
  rangeWidth: DecimalValue | null;
  rangeWidthText: string | null;
  rangeWidthBpsFloor: bigint | null;
  intervals: number | null;
  adjacentSpacingBpsFloor: bigint | null;
  capitalPerLevel: bigint | null;
  capitalRemainder: bigint | null;
  feeProxy: bigint | null;
  knownCost: bigint | null;
  knownCostBpsCeil: bigint | null;
  grossSpacingBudget: bigint | null;
  residual: bigint | null;
  downsideBpsFloor: bigint | null;
}

/**
 * Analyze a caller-supplied grid candidate without fetching, simulating fills,
 * signing, or writing. Decimal prices and integer minor units stay exact.
 */
export function analyzeGridTrading(rawInput: unknown): GridTradingAnalysisResult {
  const input = gridTradingAnalysisInputSchema.parse(rawInput);
  const evidence = normalizeEvidence(input);
  const provenance = buildProvenance(input.analysisAtUtc, evidence);
  const constraintViolations: Violation[] = evidenceViolations(provenance);
  const calculated = calculate(evidence);

  addRiskViolations(evidence, calculated, constraintViolations);

  const evidenceFailure = provenance.some(({ state }) => state !== "fresh");
  let decision: GridTradingAnalysisResult["decision"];
  const rationale: string[] = [];
  if (evidenceFailure) {
    decision = "insufficient_evidence";
    const failedFields = provenance
      .filter(({ state }) => state !== "fresh")
      .map(({ field }) => field)
      .join(", ");
    rationale.push(
      `Required evidence is missing or fails the declared freshness policy: ${failedFields}.`
    );
  } else if (constraintViolations.length > 0) {
    decision = "hold";
    rationale.push(
      "One or more caller-supplied capital, range, cost, or downside-risk constraints fail."
    );
  } else {
    decision = "review_grid";
    rationale.push(
      "The supplied candidate passes the declared evidence-freshness and safety constraints and warrants human review."
    );
  }

  if (calculated.knownCost !== null && calculated.grossSpacingBudget !== null) {
    rationale.push(
      "Exact known-cost and conservatively floored adjacent-spacing values are reported in the costs object."
    );
  } else {
    rationale.push(
      "Cost-versus-spacing comparison is unavailable until all required inputs exist."
    );
  }
  rationale.push(
    "No return, fill, win-rate, PnL, or realized-performance claim is used in this decision."
  );

  const constraints = evidence.riskConstraints;
  const result: GridTradingAnalysisResult = {
    skill: GRID_TRADING_SKILL,
    methodologyVersion: GRID_TRADING_METHODOLOGY_VERSION,
    environment: input.chainId === 56 ? "bsc-mainnet" : "bsc-testnet",
    chainId: input.chainId,
    market: input.market,
    analysisAtUtc: input.analysisAtUtc,
    executionEnabled: false,
    evidence,
    provenance,
    metrics: {
      rangeWidth: calculated.rangeWidthText,
      rangeWidthBpsFloor: calculated.rangeWidthBpsFloor?.toString() ?? null,
      gridIntervals: calculated.intervals,
      adjacentSpacingRational:
        calculated.rangeWidth !== null && calculated.intervals !== null
          ? {
              numerator: calculated.rangeWidth.coefficient.toString(),
              denominator: calculated.intervals.toString(),
              decimalScale: calculated.rangeWidth.scale
            }
          : null,
      adjacentSpacingBpsFloor: calculated.adjacentSpacingBpsFloor?.toString() ?? null,
      capitalPerGridLevelMinorUnits: calculated.capitalPerLevel?.toString() ?? null,
      unallocatedCapitalMinorUnits: calculated.capitalRemainder?.toString() ?? null
    },
    costs: {
      asset: evidence.capital?.asset ?? evidence.estimatedRoundTripGas?.asset ?? null,
      minorUnitDecimals:
        evidence.capital?.minorUnitDecimals ??
        evidence.estimatedRoundTripGas?.minorUnitDecimals ??
        null,
      estimatedRoundTripGasCostMinorUnits: evidence.estimatedRoundTripGas?.amountMinorUnits ?? null,
      roundTripTradingFeeProxyMinorUnits: calculated.feeProxy?.toString() ?? null,
      knownRoundTripCostMinorUnits: calculated.knownCost?.toString() ?? null,
      knownRoundTripCostBpsOfLevelCeil: calculated.knownCostBpsCeil?.toString() ?? null,
      grossAdjacentSpacingBudgetMinorUnitsFloor: calculated.grossSpacingBudget?.toString() ?? null,
      residualAfterKnownCostsMinorUnits: calculated.residual?.toString() ?? null,
      interpretation:
        "The fee proxy applies the sourced one-way fee twice to one equal capital slice; sourced gas is added once for a caller-defined round trip. The gross spacing budget uses the narrowest percentage interval at the highest grid entry and is floored. This is a cost screen, not expected profit."
    },
    drawdownRisk: {
      configuredDownsideToLowerBpsFloor: calculated.downsideBpsFloor?.toString() ?? null,
      maximumAllowedBps: constraints?.maximumDownsideToLowerBps ?? null,
      withinLimit: exactDownsideWithinLimit(evidence),
      interpretation:
        "Downside-to-lower is the current-price distance to the configured lower bound. It is a static risk boundary, not forecast or realized maximum drawdown."
    },
    performance: {
      status: "unknown_until_receipts_and_outcome_observations",
      realizedPnlMinorUnits: null,
      fills: null,
      winRate: null,
      maximumDrawdownBps: null,
      statement:
        "Realized performance is unknown until transaction receipts and independently sourced outcome observations exist."
    },
    constraintViolations,
    decision,
    rationale,
    methodology: {
      gridSpacing:
        "Levels are treated as equally spaced arithmetic prices. Adjacent spacing is (upperPrice - lowerPrice) / (levels - 1), retained as an exact rational; its basis-point screen uses the narrowest interval at upperPrice minus one step.",
      costProxy:
        "Capital is split by integer division across levels. The round-trip fee proxy is ceil(capitalPerLevel * 2 * oneWayFeeBps / 10000); sourced round-trip gas is then added exactly in matching minor units.",
      riskBoundary:
        "Range width and current-price-to-lower-bound distance are compared with caller-supplied basis-point limits using exact integer cross-multiplication; displayed basis points are conservative floors.",
      decisionPolicy:
        "Missing, stale, future, or freshness-unassessed evidence yields insufficient_evidence. Complete evidence with any safety violation yields hold. Only complete current evidence with no violation yields review_grid."
    },
    limitations: [
      "The analyzer records caller-supplied provenance and analysis time but does not fetch, authenticate, or independently attest either.",
      "The arithmetic-grid cost screen does not model volatility, order placement, fill probability, slippage, token decimals, or changing base/quote inventory.",
      "Realized PnL, fills, win rate, maximum drawdown, and realized performance are unknown until receipts and outcome observations exist.",
      "The result is read-only decision support; it cannot hold a wallet, sign, approve, trade, submit a transaction, or write state.",
      "review_grid means only that the supplied candidate passed declared constraints; it is not financial advice or an economic-return claim."
    ]
  };

  return gridTradingAnalysisResultSchema.parse(result);
}

export interface GridTradingInputError {
  error: "INVALID_ANALYSIS_INPUT";
  issues: Array<{ path: string; message: string }>;
  executionEnabled: false;
}

/** A2A flat data-part adapter: `{skill:"analyze_grid_trading", ...input}`. */
export function handleGridTradingA2a(
  data: Record<string, unknown>
): GridTradingAnalysisResult | GridTradingInputError {
  if (data.skill !== GRID_TRADING_SKILL) {
    return invalidInput([{ path: "skill", message: `expected ${GRID_TRADING_SKILL}` }]);
  }
  const { skill: _skill, ...input } = data;
  void _skill;
  const parsed = gridTradingAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidInput(
      parsed.error.issues.slice(0, 16).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message.slice(0, 240)
      }))
    );
  }
  return analyzeGridTrading(parsed.data);
}

/** MCP adapter with matching JSON text and structured output. */
export function handleGridTradingMcp(rawInput: unknown): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
} {
  const result = analyzeGridTrading(rawInput);
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: { ...result }
  };
}

function normalizeEvidence(input: GridTradingAnalysisInput): NormalizedEvidence {
  return {
    currentPrice: input.currentPrice ?? null,
    gridRange: input.gridRange ?? null,
    tradingFee: input.tradingFee ?? null,
    estimatedRoundTripGas: input.estimatedRoundTripGas ?? null,
    capital: input.capital ?? null,
    riskConstraints: input.riskConstraints ?? null
  };
}

function buildProvenance(analysisAtUtc: string, evidence: NormalizedEvidence): Provenance[] {
  const constraints = evidence.riskConstraints;
  return evidenceEntries(evidence).map(([field, item]) => {
    if (item === null || item === undefined) {
      return { field, state: "missing", observedAtUtc: null, ageSeconds: null, source: null };
    }
    const ageMs = Date.parse(analysisAtUtc) - Date.parse(item.observedAtUtc);
    const ageSeconds = Math.floor(ageMs / 1_000);
    if (constraints === null) {
      return {
        field,
        state: "freshness_unassessed",
        observedAtUtc: item.observedAtUtc,
        ageSeconds,
        source: item.source
      };
    }
    let state: Provenance["state"] = "fresh";
    if (ageMs > constraints.maximumSourceAgeSeconds * 1_000) {
      state = "stale";
    } else if (ageMs < -constraints.futureToleranceSeconds * 1_000) {
      state = "future";
    }
    return {
      field,
      state,
      observedAtUtc: item.observedAtUtc,
      ageSeconds,
      source: item.source
    };
  });
}

function evidenceViolations(provenance: Provenance[]): Violation[] {
  const violations: Violation[] = [];
  for (const item of provenance) {
    if (item.state === "missing") {
      violations.push({
        code: "MISSING_EVIDENCE",
        field: item.field,
        message: `${item.field} evidence is missing.`
      });
    } else if (item.state === "stale") {
      violations.push({
        code: "SOURCE_STALE",
        field: item.field,
        message: `${item.field} evidence exceeds maximumSourceAgeSeconds.`
      });
    } else if (item.state === "future") {
      violations.push({
        code: "SOURCE_IN_FUTURE",
        field: item.field,
        message: `${item.field} evidence is ahead of analysisAtUtc beyond futureToleranceSeconds.`
      });
    }
  }
  return violations;
}

function calculate(evidence: NormalizedEvidence): CalculatedValues {
  const price = evidence.currentPrice ? parseDecimal(evidence.currentPrice.value) : null;
  const lower = evidence.gridRange ? parseDecimal(evidence.gridRange.lowerPrice) : null;
  const upper = evidence.gridRange ? parseDecimal(evidence.gridRange.upperPrice) : null;
  const rangeWidth = lower !== null && upper !== null ? subtractDecimals(upper, lower) : null;
  const intervals = evidence.gridRange ? evidence.gridRange.levels - 1 : null;

  let rangeWidthBpsFloor: bigint | null = null;
  let adjacentSpacingBpsFloor: bigint | null = null;
  if (rangeWidth !== null && price !== null && upper !== null && intervals !== null) {
    rangeWidthBpsFloor = floorRatio(rangeWidth, price, 10_000n);
    adjacentSpacingBpsFloor = floorHighestEntrySpacingRatio(rangeWidth, upper, 10_000n, intervals);
  }

  const capital = evidence.capital ? BigInt(evidence.capital.amountMinorUnits) : null;
  const levels = evidence.gridRange?.levels ?? null;
  const capitalPerLevel = capital !== null && levels !== null ? capital / BigInt(levels) : null;
  const capitalRemainder = capital !== null && levels !== null ? capital % BigInt(levels) : null;

  let feeProxy: bigint | null = null;
  if (capitalPerLevel !== null && evidence.tradingFee !== null) {
    feeProxy = ceilDiv(capitalPerLevel * BigInt(evidence.tradingFee.oneWayFeeBps) * 2n, 10_000n);
  }
  const gas = evidence.estimatedRoundTripGas
    ? BigInt(evidence.estimatedRoundTripGas.amountMinorUnits)
    : null;
  const knownCost = feeProxy !== null && gas !== null ? feeProxy + gas : null;
  const knownCostBpsCeil =
    knownCost !== null && capitalPerLevel !== null && capitalPerLevel > 0n
      ? ceilDiv(knownCost * 10_000n, capitalPerLevel)
      : null;
  const grossSpacingBudget =
    capitalPerLevel !== null &&
    rangeWidth !== null &&
    upper !== null &&
    intervals !== null &&
    capitalPerLevel > 0n
      ? floorHighestEntrySpacingRatio(rangeWidth, upper, capitalPerLevel, intervals)
      : null;
  const residual =
    grossSpacingBudget !== null && knownCost !== null ? grossSpacingBudget - knownCost : null;

  let downsideBpsFloor: bigint | null = null;
  if (price !== null && lower !== null && compareDecimals(price, lower) > 0) {
    downsideBpsFloor = floorRatio(subtractDecimals(price, lower), price, 10_000n);
  }

  return {
    rangeWidth,
    rangeWidthText: rangeWidth ? formatDecimal(rangeWidth) : null,
    rangeWidthBpsFloor,
    intervals,
    adjacentSpacingBpsFloor,
    capitalPerLevel,
    capitalRemainder,
    feeProxy,
    knownCost,
    knownCostBpsCeil,
    grossSpacingBudget,
    residual,
    downsideBpsFloor
  };
}

function addRiskViolations(
  evidence: NormalizedEvidence,
  calculated: CalculatedValues,
  violations: Violation[]
): void {
  const price = evidence.currentPrice ? parseDecimal(evidence.currentPrice.value) : null;
  const lower = evidence.gridRange ? parseDecimal(evidence.gridRange.lowerPrice) : null;
  const upper = evidence.gridRange ? parseDecimal(evidence.gridRange.upperPrice) : null;
  const constraints = evidence.riskConstraints;

  if (
    price !== null &&
    lower !== null &&
    upper !== null &&
    !(compareDecimals(price, lower) > 0 && compareDecimals(price, upper) < 0)
  ) {
    violations.push({
      code: "CURRENT_PRICE_OUTSIDE_OPEN_RANGE",
      field: "currentPrice",
      message: "Current price must be strictly inside the proposed lower and upper grid bounds."
    });
  }

  if (evidence.capital !== null) {
    const amount = BigInt(evidence.capital.amountMinorUnits);
    if (amount < BigInt(evidence.capital.minimumMinorUnits)) {
      violations.push({
        code: "CAPITAL_BELOW_MINIMUM",
        field: "capital.amountMinorUnits",
        message: "Capital is below the explicitly supplied minimum."
      });
    }
    if (amount > BigInt(evidence.capital.maximumMinorUnits)) {
      violations.push({
        code: "CAPITAL_ABOVE_MAXIMUM",
        field: "capital.amountMinorUnits",
        message: "Capital is above the explicitly supplied maximum."
      });
    }
  }

  if (constraints !== null && evidence.gridRange !== null) {
    if (evidence.gridRange.levels < constraints.minimumGridLevels) {
      violations.push({
        code: "GRID_LEVELS_BELOW_MINIMUM",
        field: "gridRange.levels",
        message: "Grid levels are below the explicitly supplied minimum."
      });
    }
    if (evidence.gridRange.levels > constraints.maximumGridLevels) {
      violations.push({
        code: "GRID_LEVELS_ABOVE_MAXIMUM",
        field: "gridRange.levels",
        message: "Grid levels are above the explicitly supplied maximum."
      });
    }
  }

  if (
    constraints !== null &&
    calculated.rangeWidth !== null &&
    price !== null &&
    ratioGreaterThanInteger(
      calculated.rangeWidth,
      price,
      10_000n,
      BigInt(constraints.maximumRangeWidthBps)
    )
  ) {
    violations.push({
      code: "RANGE_WIDTH_EXCEEDS_MAXIMUM",
      field: "gridRange",
      message: "Range width exceeds maximumRangeWidthBps relative to current price."
    });
  }

  if (
    constraints !== null &&
    price !== null &&
    lower !== null &&
    compareDecimals(price, lower) > 0 &&
    ratioGreaterThanInteger(
      subtractDecimals(price, lower),
      price,
      10_000n,
      BigInt(constraints.maximumDownsideToLowerBps)
    )
  ) {
    violations.push({
      code: "DOWNSIDE_TO_LOWER_EXCEEDS_MAXIMUM",
      field: "riskConstraints.maximumDownsideToLowerBps",
      message: "Current-price distance to the lower bound exceeds the configured risk limit."
    });
  }

  if (calculated.capitalPerLevel === 0n) {
    violations.push({
      code: "CAPITAL_PER_LEVEL_ZERO",
      field: "capital.amountMinorUnits",
      message: "Integer allocation leaves zero quote minor units per grid level."
    });
  }

  if (
    constraints !== null &&
    calculated.knownCostBpsCeil !== null &&
    calculated.knownCostBpsCeil > BigInt(constraints.maximumKnownRoundTripCostBps)
  ) {
    violations.push({
      code: "KNOWN_COSTS_EXCEED_MAXIMUM",
      field: "riskConstraints.maximumKnownRoundTripCostBps",
      message: "Known round-trip cost proxy exceeds the configured basis-point maximum."
    });
  }

  if (
    calculated.knownCost !== null &&
    calculated.grossSpacingBudget !== null &&
    calculated.knownCost >= calculated.grossSpacingBudget
  ) {
    violations.push({
      code: "KNOWN_COSTS_CONSUME_GRID_SPACING",
      field: "estimatedRoundTripGas",
      message:
        "Known fee-plus-gas cost consumes or exceeds the conservatively floored gross adjacent-grid spacing budget."
    });
  }
}

function evidenceEntries(
  input: Pick<
    GridTradingAnalysisInput | NormalizedEvidence,
    | "currentPrice"
    | "gridRange"
    | "tradingFee"
    | "estimatedRoundTripGas"
    | "capital"
    | "riskConstraints"
  >
): Array<
  readonly [
    (typeof EVIDENCE_FIELDS)[number],
    (
      | NonNullable<GridTradingAnalysisInput["currentPrice"]>
      | NonNullable<GridTradingAnalysisInput["gridRange"]>
      | NonNullable<GridTradingAnalysisInput["tradingFee"]>
      | NonNullable<GridTradingAnalysisInput["estimatedRoundTripGas"]>
      | NonNullable<GridTradingAnalysisInput["capital"]>
      | NonNullable<GridTradingAnalysisInput["riskConstraints"]>
      | null
      | undefined
    )
  ]
> {
  return EVIDENCE_FIELDS.map((field) => [field, input[field]] as const);
}

function parseDecimal(value: string): DecimalValue {
  const [integer = "0", fractional = ""] = value.split(".");
  return {
    coefficient: BigInt(`${integer}${fractional}`),
    scale: fractional.length
  };
}

function compareDecimalStrings(left: string, right: string): number {
  return compareDecimals(parseDecimal(left), parseDecimal(right));
}

function compareDecimals(left: DecimalValue, right: DecimalValue): number {
  const [leftCoefficient, rightCoefficient] = alignDecimals(left, right);
  return leftCoefficient < rightCoefficient ? -1 : leftCoefficient > rightCoefficient ? 1 : 0;
}

function subtractDecimals(left: DecimalValue, right: DecimalValue): DecimalValue {
  const scale = Math.max(left.scale, right.scale);
  const [leftCoefficient, rightCoefficient] = alignDecimals(left, right);
  return { coefficient: leftCoefficient - rightCoefficient, scale };
}

function alignDecimals(left: DecimalValue, right: DecimalValue): [bigint, bigint] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * pow10(scale - left.scale),
    right.coefficient * pow10(scale - right.scale)
  ];
}

function formatDecimal(value: DecimalValue): string {
  if (value.scale === 0) return value.coefficient.toString();
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient)
    .toString()
    .padStart(value.scale + 1, "0");
  const integer = digits.slice(0, -value.scale);
  const fractional = digits.slice(-value.scale).replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return fractional.length === 0 ? `${sign}${integer}` : `${sign}${integer}.${fractional}`;
}

function floorRatio(
  numerator: DecimalValue,
  denominator: DecimalValue,
  multiplier: bigint,
  additionalDenominator = 1n
): bigint {
  const [numeratorCoefficient, denominatorCoefficient] = alignDecimals(numerator, denominator);
  return (numeratorCoefficient * multiplier) / (denominatorCoefficient * additionalDenominator);
}

function floorHighestEntrySpacingRatio(
  rangeWidth: DecimalValue,
  upperPrice: DecimalValue,
  multiplier: bigint,
  intervals: number
): bigint {
  const [widthCoefficient, upperCoefficient] = alignDecimals(rangeWidth, upperPrice);
  const intervalCount = BigInt(intervals);
  const highestEntryCoefficient = upperCoefficient * intervalCount - widthCoefficient;
  return (widthCoefficient * multiplier) / highestEntryCoefficient;
}

function ratioGreaterThanInteger(
  numerator: DecimalValue,
  denominator: DecimalValue,
  multiplier: bigint,
  limit: bigint
): boolean {
  const [numeratorCoefficient, denominatorCoefficient] = alignDecimals(numerator, denominator);
  return numeratorCoefficient * multiplier > denominatorCoefficient * limit;
}

function exactDownsideWithinLimit(evidence: NormalizedEvidence): boolean | null {
  if (
    evidence.currentPrice === null ||
    evidence.gridRange === null ||
    evidence.riskConstraints === null
  ) {
    return null;
  }
  const price = parseDecimal(evidence.currentPrice.value);
  const lower = parseDecimal(evidence.gridRange.lowerPrice);
  if (compareDecimals(price, lower) <= 0) {
    return null;
  }
  return !ratioGreaterThanInteger(
    subtractDecimals(price, lower),
    price,
    10_000n,
    BigInt(evidence.riskConstraints.maximumDownsideToLowerBps)
  );
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator === 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

function sameText(left: string, right: string): boolean {
  return left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US");
}

function invalidInput(issues: Array<{ path: string; message: string }>): GridTradingInputError {
  return { error: "INVALID_ANALYSIS_INPUT", issues, executionEnabled: false };
}
