import { z } from "zod";

export const YIELD_ANALYSIS_METHODOLOGY_VERSION = "proofera-yield-route-v2.0.0";
export const NET_APY_METHODOLOGY = "proofera-net-apy-simple-v1" as const;

const MAX_UINT256 = (1n << 256n) - 1n;
const SECONDS_PER_365_DAY_YEAR = 31_536_000n;
const REQUIRED_EVIDENCE_FIELDS = [
  "apy",
  "liquidity",
  "withdrawal",
  "economics",
  "exposure",
  "route_history"
] as const;

const chainIdSchema = z.union([z.literal(56), z.literal(97)]);
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 20-byte EVM address")
  .transform((value) => value.toLowerCase())
  .refine((value) => value !== "0x0000000000000000000000000000000000000000", {
    message: "zero address is not allowed"
  });
const blockHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte block hash")
  .transform((value) => value.toLowerCase())
  .refine((value) => value !== `0x${"00".repeat(32)}`, {
    message: "zero block hash is not allowed"
  });
const transactionHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte transaction hash")
  .transform((value) => value.toLowerCase())
  .refine((value) => value !== `0x${"00".repeat(32)}`, {
    message: "zero transaction hash is not evidence"
  });
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
const positiveUintStringSchema = uintStringSchema.refine((value) => value !== "0", {
  message: "expected a positive unsigned decimal string"
});
const decimalStringSchema = z
  .string()
  .max(64)
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/, "expected a canonical non-negative decimal string")
  .refine((value) => (value.split(".")[1]?.length ?? 0) <= 18, {
    message: "decimal precision exceeds 18 places"
  });
const signedDecimalStringSchema = z
  .string()
  .max(65)
  .regex(/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/, "expected a canonical signed decimal string")
  .refine((value) => !value.startsWith("-0") || /^-0\.[0-9]*[1-9][0-9]*$/.test(value), {
    message: "negative zero is not canonical"
  });
const utcTimestampSchema = z
  .string()
  .max(32)
  .datetime({ offset: false, message: "expected an ISO 8601 UTC timestamp ending in Z" });
const boundedTextSchema = z.string().trim().min(1).max(240);
const protocolIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "expected a lowercase protocol identifier");
const opportunityIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "expected a bounded opportunity identifier");
const assetSymbolSchema = z
  .string()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "expected a bounded asset symbol");

const httpsSourceSchema = z
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
        if (parsed.protocol !== "https:") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "source URL must use HTTPS" });
        }
        if (parsed.username || parsed.password || parsed.hash) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "source URL must not contain credentials or a fragment"
          });
        }
      }),
    publisher: z.string().trim().min(1).max(120),
    contentSha256: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "expected a SHA-256 hex digest")
      .transform((value) => value.toLowerCase())
      .refine((value) => value !== "00".repeat(32), {
        message: "zero content digest is not evidence"
      })
  })
  .strict();

const onchainSourceSchema = z
  .object({
    kind: z.literal("onchain"),
    chainId: chainIdSchema,
    blockNumber: uintStringSchema,
    blockHash: blockHashSchema,
    blockTimestampUtc: utcTimestampSchema,
    contractAddress: addressSchema,
    calls: z
      .array(
        z
          .string()
          .min(3)
          .max(160)
          .regex(/^[A-Za-z_][A-Za-z0-9_]*(\([^\r\n]*\))$/, "expected a function signature")
      )
      .min(1)
      .max(12)
  })
  .strict();

const sourceLocatorSchema = z.discriminatedUnion("kind", [onchainSourceSchema, httpsSourceSchema]);

const vaultSourceRelationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("direct_vault_contract"),
      vaultAddress: addressSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("documented_vault_adapter"),
      vaultAddress: addressSchema,
      adapterAddress: addressSchema,
      methodology: boundedTextSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("documented_vault_publication"),
      vaultAddress: addressSchema,
      methodology: boundedTextSchema
    })
    .strict()
]);

const costProvenanceShape = {
  observedAtUtc: utcTimestampSchema,
  sourceLocator: sourceLocatorSchema,
  methodology: boundedTextSchema
} as const;

const directCapitalAssetValuationSchema = z
  .object({
    kind: z.literal("direct_capital_asset"),
    capitalAssetAddress: addressSchema,
    capitalAssetDecimals: z.number().int().min(0).max(36),
    capitalAssetAmountRaw: uintStringSchema,
    ...costProvenanceShape
  })
  .strict();

const exactConversionValuationSchema = z
  .object({
    kind: z.literal("exact_conversion_to_capital_asset"),
    capitalAssetAddress: addressSchema,
    capitalAssetDecimals: z.number().int().min(0).max(36),
    capitalAssetAmountRaw: uintStringSchema,
    numeratorCapitalAssetRaw: positiveUintStringSchema,
    denominatorSourceAssetRaw: positiveUintStringSchema,
    rounding: z.literal("exact_only"),
    ...costProvenanceShape
  })
  .strict();

const unresolvedConversionValuationSchema = z
  .object({
    kind: z.literal("unresolved_conversion"),
    capitalAssetAddress: addressSchema,
    capitalAssetDecimals: z.number().int().min(0).max(36),
    reason: boundedTextSchema
  })
  .strict();

const costEvidenceSchema = z
  .object({
    sourceAssetAddress: addressSchema,
    sourceAssetDecimals: z.number().int().min(0).max(36),
    sourceAmountRaw: uintStringSchema,
    valuation: z.discriminatedUnion("kind", [
      directCapitalAssetValuationSchema,
      exactConversionValuationSchema,
      unresolvedConversionValuationSchema
    ])
  })
  .strict();

const evidenceFieldSchema = z.enum([
  "apy",
  "liquidity",
  "withdrawal",
  "economics",
  "exposure",
  "route_history"
]);

const documentedApyScaleSchema = z
  .object({
    status: z.literal("documented"),
    unit: z.enum(["percentage_points", "basis_points", "decimal_fraction"]),
    decimalPlaces: z.number().int().min(0).max(18),
    annualization: z.enum(["365_day_simple", "source_reported_compounded"]),
    methodology: boundedTextSchema
  })
  .strict();
const unknownApyScaleSchema = z
  .object({
    status: z.literal("unknown"),
    reason: boundedTextSchema
  })
  .strict();
const apyScaleSchema = z.discriminatedUnion("status", [
  documentedApyScaleSchema,
  unknownApyScaleSchema
]);

const apySnapshotSchema = z
  .object({
    scale: apyScaleSchema,
    baseApy: decimalStringSchema.nullable(),
    rewardApy: decimalStringSchema.nullable(),
    grossApy: decimalStringSchema.nullable(),
    grossComposition: z.enum(["independent_source", "base_plus_reward"])
  })
  .strict();

const documentedWithdrawalSchema = z
  .object({
    status: z.literal("documented"),
    instant: z.boolean(),
    delaySeconds: z.number().int().min(0).max(31_536_000),
    feeBps: z.number().int().min(0).max(10_000),
    feeBasis: z
      .object({
        assetAddress: addressSchema,
        decimals: z.number().int().min(0).max(36),
        amountRaw: uintStringSchema,
        rounding: z.enum(["exact", "floor", "ceil"]),
        derivedFeeRaw: uintStringSchema,
        observedAtUtc: utcTimestampSchema,
        sourceLocator: sourceLocatorSchema,
        methodology: boundedTextSchema
      })
      .strict(),
    lockupEndsAtUtc: utcTimestampSchema.nullable(),
    description: boundedTextSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.instant && (value.delaySeconds !== 0 || value.lockupEndsAtUtc !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "instant withdrawals require zero delay and no lockup"
      });
    }
  });
const unknownWithdrawalSchema = z
  .object({
    status: z.literal("unknown"),
    reason: boundedTextSchema
  })
  .strict();
const withdrawalSchema = z.union([documentedWithdrawalSchema, unknownWithdrawalSchema]);

const routeHistorySchema = z
  .object({
    routeId: opportunityIdSchema,
    fromProtocol: protocolIdSchema,
    toProtocol: protocolIdSchema,
    amountRaw: uintStringSchema,
    blockNumber: uintStringSchema,
    observedAtUtc: utcTimestampSchema,
    transactionHash: transactionHashSchema.nullable(),
    sourceLocator: sourceLocatorSchema
  })
  .strict();

const economicsSchema = z
  .object({
    methodology: z.literal(NET_APY_METHODOLOGY),
    annualFeeApy: decimalStringSchema,
    costs: z
      .object({
        gas: costEvidenceSchema,
        route: costEvidenceSchema,
        slippage: costEvidenceSchema,
        withdrawalFee: costEvidenceSchema
      })
      .strict()
  })
  .strict();

const opportunitySchema = z
  .object({
    opportunityId: opportunityIdSchema,
    protocol: protocolIdSchema,
    vaultAddress: addressSchema,
    asset: z
      .object({
        address: addressSchema,
        symbol: assetSymbolSchema,
        decimals: z.number().int().min(0).max(36)
      })
      .strict(),
    observation: z
      .object({
        blockNumber: uintStringSchema,
        observedAtUtc: utcTimestampSchema,
        sourceLocator: sourceLocatorSchema,
        sourceRelation: vaultSourceRelationSchema,
        coveredFields: z
          .array(evidenceFieldSchema)
          .min(1)
          .max(6)
          .refine((items) => new Set(items).size === items.length, "coveredFields must be unique")
      })
      .strict(),
    apy: apySnapshotSchema,
    liquidity: z
      .object({
        tvlRaw: uintStringSchema.nullable(),
        withdrawableRaw: uintStringSchema.nullable()
      })
      .strict(),
    withdrawal: withdrawalSchema,
    postAllocationProtocolExposureBps: z.number().int().min(0).max(10_000),
    economics: economicsSchema.nullable(),
    routeHistory: z.array(routeHistorySchema).max(16)
  })
  .strict();

const capitalSchema = z
  .object({
    assetAddress: addressSchema,
    assetSymbol: assetSymbolSchema,
    decimals: z.number().int().min(0).max(36),
    amountRaw: positiveUintStringSchema,
    horizonSeconds: z.number().int().min(3_600).max(31_536_000)
  })
  .strict();

const constraintsSchema = z
  .object({
    allowedProtocols: z
      .array(protocolIdSchema)
      .min(1)
      .max(16)
      .refine((items) => new Set(items).size === items.length, {
        message: "allowedProtocols must be unique"
      }),
    maximumSourceAgeSeconds: z.number().int().positive().max(604_800),
    futureToleranceSeconds: z.number().int().min(0).max(300),
    minimumTvlRaw: uintStringSchema,
    minimumWithdrawableLiquidityRaw: uintStringSchema,
    minimumLiquidityCoverageBps: z.number().int().min(0).max(10_000),
    maximumProtocolExposureBps: z.number().int().min(1).max(10_000),
    maximumWithdrawalDelaySeconds: z.number().int().min(0).max(31_536_000),
    maximumWithdrawalFeeBps: z.number().int().min(0).max(10_000),
    minimumNetApyPercentagePoints: decimalStringSchema,
    maximumAnnualizedGasImpactPercentagePoints: decimalStringSchema
  })
  .strict();

export const yieldAnalysisInputSchema = z
  .object({
    schemaVersion: z.literal(2),
    chainId: chainIdSchema,
    analysisAtUtc: utcTimestampSchema,
    capital: capitalSchema,
    constraints: constraintsSchema,
    opportunities: z.array(opportunitySchema).min(1).max(8)
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      new Set(input.opportunities.map(({ opportunityId }) => opportunityId)).size !==
      input.opportunities.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["opportunities"],
        message: "opportunityId values must be unique"
      });
    }

    input.opportunities.forEach((opportunity, index) => {
      const prefix = ["opportunities", index] as const;
      const locator = opportunity.observation.sourceLocator;
      const relation = opportunity.observation.sourceRelation;
      if (relation.vaultAddress !== opportunity.vaultAddress) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...prefix, "observation", "sourceRelation", "vaultAddress"],
          message: "source relation must bind the exact opportunity vault"
        });
      }
      if (locator.kind === "onchain") {
        if (locator.chainId !== input.chainId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...prefix, "observation", "sourceLocator", "chainId"],
            message: "onchain source chainId must match the request chainId"
          });
        }
        if (locator.blockNumber !== opportunity.observation.blockNumber) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...prefix, "observation", "sourceLocator", "blockNumber"],
            message: "onchain source blockNumber must match the observation"
          });
        }
        if (locator.blockTimestampUtc !== opportunity.observation.observedAtUtc) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...prefix, "observation", "sourceLocator", "blockTimestampUtc"],
            message: "onchain block timestamp must match the observation timestamp"
          });
        }
        if (relation.kind === "direct_vault_contract") {
          if (locator.contractAddress !== opportunity.vaultAddress) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...prefix, "observation", "sourceLocator", "contractAddress"],
              message: "direct vault evidence must be read from the exact vault contract"
            });
          }
        } else if (relation.kind === "documented_vault_adapter") {
          if (locator.contractAddress !== relation.adapterAddress) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...prefix, "observation", "sourceLocator", "contractAddress"],
              message: "adapter evidence must be read from the declared adapter contract"
            });
          }
        } else {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...prefix, "observation", "sourceRelation", "kind"],
            message: "onchain evidence requires a direct-vault or documented-adapter relation"
          });
        }
      } else if (relation.kind !== "documented_vault_publication") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...prefix, "observation", "sourceRelation", "kind"],
          message: "HTTP evidence requires a documented publication relation"
        });
      }

      if (opportunity.apy.scale.status === "documented") {
        const decimals = opportunity.apy.scale.decimalPlaces;
        for (const [key, value] of [
          ["baseApy", opportunity.apy.baseApy],
          ["rewardApy", opportunity.apy.rewardApy],
          ["grossApy", opportunity.apy.grossApy],
          ["annualFeeApy", opportunity.economics?.annualFeeApy ?? null]
        ] as const) {
          if (value !== null && fractionalDigits(value) > decimals) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...prefix, key === "annualFeeApy" ? "economics" : "apy", key],
              message: `${key} exceeds the documented APY decimalPlaces`
            });
          }
        }
      }

      opportunity.routeHistory.forEach((route, routeIndex) => {
        if (route.sourceLocator.kind === "onchain") {
          if (route.sourceLocator.chainId !== input.chainId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...prefix, "routeHistory", routeIndex, "sourceLocator", "chainId"],
              message: "route source chainId must match the request chainId"
            });
          }
          if (route.sourceLocator.blockNumber !== route.blockNumber) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...prefix, "routeHistory", routeIndex, "sourceLocator", "blockNumber"],
              message: "route source blockNumber must match the route record"
            });
          }
          if (route.sourceLocator.blockTimestampUtc !== route.observedAtUtc) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...prefix, "routeHistory", routeIndex, "sourceLocator", "blockTimestampUtc"],
              message: "route source block timestamp must match the route observation"
            });
          }
        }
      });
      if (
        new Set(opportunity.routeHistory.map(({ routeId }) => routeId)).size !==
        opportunity.routeHistory.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...prefix, "routeHistory"],
          message: "routeId values must be unique within an opportunity"
        });
      }

      const timedSources: Array<{
        observedAtUtc: string;
        sourceLocator: z.infer<typeof sourceLocatorSchema>;
        path: Array<string | number>;
      }> = [
        {
          observedAtUtc:
            opportunity.withdrawal.status === "documented"
              ? opportunity.withdrawal.feeBasis.observedAtUtc
              : opportunity.observation.observedAtUtc,
          sourceLocator:
            opportunity.withdrawal.status === "documented"
              ? opportunity.withdrawal.feeBasis.sourceLocator
              : opportunity.observation.sourceLocator,
          path: [...prefix, "withdrawal", "feeBasis", "sourceLocator"]
        }
      ];
      if (opportunity.economics !== null) {
        for (const [costName, cost] of Object.entries(opportunity.economics.costs)) {
          if (cost.valuation.kind !== "unresolved_conversion") {
            timedSources.push({
              observedAtUtc: cost.valuation.observedAtUtc,
              sourceLocator: cost.valuation.sourceLocator,
              path: [...prefix, "economics", "costs", costName, "valuation", "sourceLocator"]
            });
          }
        }
      }
      for (const timed of timedSources) {
        if (timed.sourceLocator.kind === "onchain") {
          if (timed.sourceLocator.chainId !== input.chainId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...timed.path, "chainId"],
              message: "evidence source chainId must match the request chainId"
            });
          }
          if (timed.sourceLocator.blockTimestampUtc !== timed.observedAtUtc) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...timed.path, "blockTimestampUtc"],
              message: "evidence source block timestamp must match its observation timestamp"
            });
          }
        }
      }
    });
  });

const violationSchema = z
  .object({
    kind: z.enum(["evidence", "constraint"]),
    code: z.string().min(1).max(80),
    path: z.string().min(1).max(180),
    message: z.string().min(1).max(320)
  })
  .strict();
const exposedMetricSchema = z
  .object({
    value: decimalStringSchema.nullable(),
    state: z.enum(["available", "missing", "unknown_scale", "source_scope_missing"])
  })
  .strict();
const calculatedMetricSchema = z
  .object({
    value: signedDecimalStringSchema.nullable(),
    state: z.enum([
      "available",
      "missing_inputs",
      "unknown_scale",
      "source_scope_missing",
      "unsupported_methodology",
      "non_exact",
      "unresolved_costs",
      "out_of_range"
    ]),
    methodology: z.literal(NET_APY_METHODOLOGY).nullable()
  })
  .strict();

const routeHistoryResultSchema = routeHistorySchema.extend({
  receiptReferenceState: z.enum(["missing", "unverified_reference"])
});

const costResolutionStateSchema = z.enum([
  "available",
  "source_scope_missing",
  "missing",
  "asset_mismatch",
  "unresolved_conversion",
  "non_exact_conversion",
  "conversion_mismatch",
  "fee_mismatch",
  "stale",
  "future"
]);

const costResolutionResultSchema = z
  .object({
    evidence: costEvidenceSchema.nullable(),
    capitalAssetAmountRaw: uintStringSchema.nullable(),
    state: costResolutionStateSchema
  })
  .strict();

const unverifiedEligibilitySchema = z
  .object({
    marketplaceEligible: z.literal(false),
    activationEligible: z.literal(false),
    executionEligible: z.literal(false),
    reason: z.literal("caller_supplied_unverified_analysis")
  })
  .strict();

const analysisTrustSchema = z
  .object({
    state: z.literal("caller_supplied_unverified"),
    sourceContentsVerified: z.literal(false),
    freshnessAttestedByAgent: z.literal(false),
    marketplaceEligible: z.literal(false),
    activationEligible: z.literal(false),
    executionEligible: z.literal(false)
  })
  .strict();

const opportunityResultSchema = z
  .object({
    opportunityId: opportunityIdSchema,
    protocol: protocolIdSchema,
    vaultAddress: addressSchema,
    asset: opportunitySchema.shape.asset,
    observation: opportunitySchema.shape.observation,
    sourceAgeSeconds: z.number().int(),
    apy: z
      .object({
        scale: apyScaleSchema,
        grossComposition: z.enum(["independent_source", "base_plus_reward"]),
        base: exposedMetricSchema,
        reward: exposedMetricSchema,
        gross: exposedMetricSchema,
        net: calculatedMetricSchema
      })
      .strict(),
    liquidity: opportunitySchema.shape.liquidity,
    withdrawal: withdrawalSchema,
    postAllocationProtocolExposureBps: z.number().int().min(0).max(10_000),
    gasImpact: z
      .object({
        capitalAssetGasCostRaw: uintStringSchema.nullable(),
        annualizedApyImpact: calculatedMetricSchema
      })
      .strict(),
    knownCosts: z
      .object({
        methodology: z.literal(NET_APY_METHODOLOGY).nullable(),
        capitalAsset: z
          .object({
            address: addressSchema,
            decimals: z.number().int().min(0).max(36)
          })
          .strict(),
        annualFeeApy: decimalStringSchema.nullable(),
        gas: costResolutionResultSchema,
        route: costResolutionResultSchema,
        slippage: costResolutionResultSchema,
        withdrawalFee: costResolutionResultSchema,
        totalRaw: uintStringSchema.nullable()
      })
      .strict(),
    routeHistory: z.array(routeHistoryResultSchema).max(16),
    realizedPerformance: z
      .object({
        status: z.literal("unknown"),
        value: z.null(),
        reason: boundedTextSchema
      })
      .strict(),
    eligibility: unverifiedEligibilitySchema,
    decision: z.enum(["hold", "review_route", "insufficient_evidence"]),
    violations: z.array(violationSchema).max(32),
    violationsTruncated: z.boolean(),
    rationale: z.array(z.string().min(1).max(320)).min(1).max(8)
  })
  .strict();

export const yieldAnalysisResultSchema = z
  .object({
    skill: z.literal("analyze_yield_opportunities"),
    schemaVersion: z.literal(2),
    methodologyVersion: z.literal(YIELD_ANALYSIS_METHODOLOGY_VERSION),
    environment: z.enum(["bsc-mainnet", "bsc-testnet"]),
    chainId: chainIdSchema,
    analysisAtUtc: utcTimestampSchema,
    capital: capitalSchema,
    constraints: constraintsSchema,
    trust: analysisTrustSchema,
    decision: z.enum(["hold", "review_route", "insufficient_evidence"]),
    humanReviewCandidateIds: z.array(opportunityIdSchema).max(8),
    opportunities: z.array(opportunityResultSchema).min(1).max(8),
    limitations: z.array(z.string().min(1).max(320)).min(1).max(8),
    executionEnabled: z.literal(false)
  })
  .strict();

export type YieldAnalysisInput = z.infer<typeof yieldAnalysisInputSchema>;
export type YieldAnalysisResult = z.infer<typeof yieldAnalysisResultSchema>;
type Opportunity = YieldAnalysisInput["opportunities"][number];
type OpportunityResult = z.infer<typeof opportunityResultSchema>;
type Violation = z.infer<typeof violationSchema>;
type DocumentedApyScale = z.infer<typeof documentedApyScaleSchema>;
type CostEvidence = z.infer<typeof costEvidenceSchema>;
type CostResolutionResult = z.infer<typeof costResolutionResultSchema>;

const UNVERIFIED_TRUST = Object.freeze({
  state: "caller_supplied_unverified" as const,
  sourceContentsVerified: false as const,
  freshnessAttestedByAgent: false as const,
  marketplaceEligible: false as const,
  activationEligible: false as const,
  executionEligible: false as const
});

const UNVERIFIED_ELIGIBILITY = Object.freeze({
  marketplaceEligible: false as const,
  activationEligible: false as const,
  executionEligible: false as const,
  reason: "caller_supplied_unverified_analysis" as const
});

/** Pure analysis of caller-supplied snapshots. No fetch, wallet, signing, or write path exists. */
export function analyzeYieldOpportunities(rawInput: unknown): YieldAnalysisResult {
  const input = yieldAnalysisInputSchema.parse(rawInput);
  const opportunities = input.opportunities.map((opportunity) =>
    analyzeOpportunitySafely(input, opportunity)
  );
  const humanReviewCandidateIds = opportunities
    .filter(({ decision }) => decision === "review_route")
    .map(({ opportunityId }) => opportunityId);
  const decision: YieldAnalysisResult["decision"] =
    humanReviewCandidateIds.length > 0
      ? "review_route"
      : opportunities.some(({ decision: candidate }) => candidate === "hold")
        ? "hold"
        : "insufficient_evidence";

  const candidate = {
    skill: "analyze_yield_opportunities",
    schemaVersion: 2,
    methodologyVersion: YIELD_ANALYSIS_METHODOLOGY_VERSION,
    environment: input.chainId === 56 ? "bsc-mainnet" : "bsc-testnet",
    chainId: input.chainId,
    analysisAtUtc: input.analysisAtUtc,
    capital: input.capital,
    constraints: input.constraints,
    trust: UNVERIFIED_TRUST,
    decision,
    humanReviewCandidateIds,
    opportunities,
    limitations: [
      "Every snapshot and source locator is caller supplied; this analyzer records but does not independently fetch or attest it.",
      "Structured trust and eligibility fields make every result marketplace-, activation-, and execution-ineligible until a separate trusted adapter verifies it.",
      "APY values are prospective source claims, not realized performance or a return guarantee.",
      "Transaction hashes in route history are unverified references; receipts and cost basis are not fetched or reconstructed.",
      "Net APY uses only the documented 365-day simple methodology and is null unless every required input produces exact decimal-scale arithmetic.",
      "This service is decision support only and cannot connect a wallet, sign, approve, route capital, or submit a transaction."
    ],
    executionEnabled: false
  } as const;
  const parsed = yieldAnalysisResultSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;

  const fallbackOpportunities = input.opportunities.map((opportunity) =>
    conservativeOpportunity(input, opportunity, "OUTPUT_VALIDATION_FAILED")
  );
  const fallback = yieldAnalysisResultSchema.safeParse({
    ...candidate,
    decision: "insufficient_evidence",
    humanReviewCandidateIds: [],
    opportunities: fallbackOpportunities
  });
  // All fields in this fallback are either schema-parsed input values or fixed
  // literals. Keep the final non-throwing branch for defense in depth.
  return fallback.success
    ? fallback.data
    : fallbackOpportunitiesResult(input, fallbackOpportunities);
}

function analyzeOpportunity(
  input: YieldAnalysisInput,
  opportunity: Opportunity
): OpportunityResult {
  const violations: Violation[] = [];
  let violationsTruncated = false;
  const add = (kind: Violation["kind"], code: string, path: string, message: string): void => {
    if (violations.length < 32) {
      violations.push({
        kind,
        code: code.slice(0, 80),
        path: path.slice(0, 180),
        message: message.slice(0, 320)
      });
    } else {
      violationsTruncated = true;
    }
  };
  const path = (suffix: string): string => `opportunities.${opportunity.opportunityId}.${suffix}`;

  const analysisMs = Date.parse(input.analysisAtUtc);
  const observedMs = Date.parse(opportunity.observation.observedAtUtc);
  const sourceAgeMs = analysisMs - observedMs;
  const sourceAgeSeconds = Math.trunc(sourceAgeMs / 1_000);
  if (sourceAgeMs > input.constraints.maximumSourceAgeSeconds * 1_000) {
    add(
      "evidence",
      "SOURCE_STALE",
      path("observation.observedAtUtc"),
      "The source observation is older than the configured freshness limit."
    );
  }
  if (sourceAgeMs < -input.constraints.futureToleranceSeconds * 1_000) {
    add(
      "evidence",
      "SOURCE_IN_FUTURE",
      path("observation.observedAtUtc"),
      "The source observation is ahead of analysisAtUtc beyond the configured tolerance."
    );
  }

  const covered = new Set(opportunity.observation.coveredFields);
  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (!covered.has(field)) {
      add(
        "evidence",
        "SOURCE_SCOPE_MISSING",
        path(`observation.coveredFields.${field}`),
        `The source does not declare coverage for ${field}.`
      );
    }
  }

  for (const route of opportunity.routeHistory) {
    const routeObservedMs = Date.parse(route.observedAtUtc);
    if (routeObservedMs > analysisMs + input.constraints.futureToleranceSeconds * 1_000) {
      add(
        "evidence",
        "ROUTE_HISTORY_IN_FUTURE",
        path(`routeHistory.${route.routeId}.observedAtUtc`),
        "The route-history observation is ahead of analysisAtUtc beyond the configured tolerance."
      );
    }
    if (
      routeObservedMs > observedMs ||
      BigInt(route.blockNumber) > BigInt(opportunity.observation.blockNumber)
    ) {
      add(
        "evidence",
        "ROUTE_HISTORY_AFTER_SNAPSHOT",
        path(`routeHistory.${route.routeId}`),
        "Route history cannot occur after the opportunity snapshot time or block."
      );
    }
  }

  if (!input.constraints.allowedProtocols.includes(opportunity.protocol)) {
    add(
      "constraint",
      "PROTOCOL_NOT_ALLOWED",
      path("protocol"),
      "The opportunity protocol is outside the user allowlist."
    );
  }
  if (
    opportunity.asset.address !== input.capital.assetAddress ||
    opportunity.asset.decimals !== input.capital.decimals
  ) {
    add(
      "constraint",
      "CAPITAL_ASSET_MISMATCH",
      path("asset"),
      "The vault asset address or decimals do not match the user's capital units."
    );
  } else if (opportunity.asset.symbol !== input.capital.assetSymbol) {
    add(
      "evidence",
      "ASSET_SYMBOL_MISMATCH",
      path("asset.symbol"),
      "The supplied symbol differs for the same asset address and decimals."
    );
  }
  if (
    opportunity.postAllocationProtocolExposureBps > input.constraints.maximumProtocolExposureBps
  ) {
    add(
      "constraint",
      "PROTOCOL_EXPOSURE_EXCEEDED",
      path("postAllocationProtocolExposureBps"),
      "Post-allocation protocol exposure exceeds the configured concentration limit."
    );
  }

  const tvl = opportunity.liquidity.tvlRaw === null ? null : BigInt(opportunity.liquidity.tvlRaw);
  const withdrawable =
    opportunity.liquidity.withdrawableRaw === null
      ? null
      : BigInt(opportunity.liquidity.withdrawableRaw);
  const capital = BigInt(input.capital.amountRaw);
  if (tvl === null) {
    add("evidence", "TVL_MISSING", path("liquidity.tvlRaw"), "TVL is unknown.");
  } else if (tvl < BigInt(input.constraints.minimumTvlRaw)) {
    add(
      "constraint",
      "TVL_BELOW_MINIMUM",
      path("liquidity.tvlRaw"),
      "TVL is below the configured minimum."
    );
  }
  if (withdrawable === null) {
    add(
      "evidence",
      "WITHDRAWABLE_LIQUIDITY_MISSING",
      path("liquidity.withdrawableRaw"),
      "Withdrawable liquidity is unknown."
    );
  } else {
    if (withdrawable < BigInt(input.constraints.minimumWithdrawableLiquidityRaw)) {
      add(
        "constraint",
        "WITHDRAWABLE_LIQUIDITY_BELOW_MINIMUM",
        path("liquidity.withdrawableRaw"),
        "Withdrawable liquidity is below the configured minimum."
      );
    }
    if (withdrawable * 10_000n < capital * BigInt(input.constraints.minimumLiquidityCoverageBps)) {
      add(
        "constraint",
        "LIQUIDITY_COVERAGE_BELOW_MINIMUM",
        path("liquidity.withdrawableRaw"),
        "Withdrawable liquidity does not cover the configured share of user capital."
      );
    }
    if (tvl !== null && withdrawable > tvl) {
      add(
        "evidence",
        "LIQUIDITY_INCONSISTENT",
        path("liquidity"),
        "Withdrawable liquidity exceeds the supplied TVL in the same raw units."
      );
    }
  }

  let expectedWithdrawalFeeRaw: bigint | null = null;
  if (opportunity.withdrawal.status === "unknown") {
    add(
      "evidence",
      "WITHDRAWAL_CONSTRAINTS_UNKNOWN",
      path("withdrawal"),
      "Withdrawal constraints are not documented."
    );
  } else {
    if (opportunity.withdrawal.delaySeconds > input.constraints.maximumWithdrawalDelaySeconds) {
      add(
        "constraint",
        "WITHDRAWAL_DELAY_EXCEEDED",
        path("withdrawal.delaySeconds"),
        "Withdrawal delay exceeds the configured maximum."
      );
    }
    if (opportunity.withdrawal.feeBps > input.constraints.maximumWithdrawalFeeBps) {
      add(
        "constraint",
        "WITHDRAWAL_FEE_EXCEEDED",
        path("withdrawal.feeBps"),
        "Withdrawal fee exceeds the configured maximum."
      );
    }
    if (
      opportunity.withdrawal.lockupEndsAtUtc !== null &&
      Date.parse(opportunity.withdrawal.lockupEndsAtUtc) >
        analysisMs + input.capital.horizonSeconds * 1_000
    ) {
      add(
        "constraint",
        "LOCKUP_EXCEEDS_HORIZON",
        path("withdrawal.lockupEndsAtUtc"),
        "The documented lockup extends beyond the user's horizon."
      );
    }
    const feeBasis = opportunity.withdrawal.feeBasis;
    let feeBasisValid = true;
    if (
      feeBasis.assetAddress !== input.capital.assetAddress ||
      feeBasis.decimals !== input.capital.decimals ||
      feeBasis.assetAddress !== opportunity.asset.address ||
      feeBasis.decimals !== opportunity.asset.decimals
    ) {
      feeBasisValid = false;
      add(
        "evidence",
        "WITHDRAWAL_FEE_ASSET_MISMATCH",
        path("withdrawal.feeBasis"),
        "Withdrawal fee basis must use the exact capital and vault asset address and decimals."
      );
    }
    if (feeBasis.amountRaw !== input.capital.amountRaw) {
      feeBasisValid = false;
      add(
        "evidence",
        "WITHDRAWAL_FEE_BASIS_MISMATCH",
        path("withdrawal.feeBasis.amountRaw"),
        "Withdrawal fee basis must equal the analyzed capital amount."
      );
    }
    const feeTimeState = evidenceTimeState(
      feeBasis.observedAtUtc,
      analysisMs,
      input.constraints.maximumSourceAgeSeconds,
      input.constraints.futureToleranceSeconds
    );
    if (feeTimeState !== "available") {
      feeBasisValid = false;
      add(
        "evidence",
        feeTimeState === "stale"
          ? "WITHDRAWAL_FEE_SOURCE_STALE"
          : "WITHDRAWAL_FEE_SOURCE_IN_FUTURE",
        path("withdrawal.feeBasis.observedAtUtc"),
        "Withdrawal fee evidence is outside the configured observation window."
      );
    }
    const derived = deriveBasisPointFee(
      BigInt(feeBasis.amountRaw),
      opportunity.withdrawal.feeBps,
      feeBasis.rounding
    );
    if (derived === null) {
      feeBasisValid = false;
      add(
        "evidence",
        "WITHDRAWAL_FEE_NON_EXACT",
        path("withdrawal.feeBasis.rounding"),
        "The documented exact withdrawal-fee rounding cannot represent this fee."
      );
    } else if (derived.toString() !== feeBasis.derivedFeeRaw) {
      feeBasisValid = false;
      add(
        "evidence",
        "WITHDRAWAL_FEE_DERIVATION_MISMATCH",
        path("withdrawal.feeBasis.derivedFeeRaw"),
        "The documented withdrawal fee does not match feeBps, basis amount, and rounding."
      );
    }
    if (feeBasisValid && derived !== null) expectedWithdrawalFeeRaw = derived;
  }

  const scale = opportunity.apy.scale;
  const apySourceCovered = covered.has("apy");
  const economicsSourceCovered = covered.has("economics");
  const base = exposedRate(opportunity.apy.baseApy, scale, apySourceCovered);
  const reward = exposedRate(opportunity.apy.rewardApy, scale, apySourceCovered);
  const gross = exposedRate(opportunity.apy.grossApy, scale, apySourceCovered);
  let net: z.infer<typeof calculatedMetricSchema> = {
    value: null,
    state: !apySourceCovered
      ? "source_scope_missing"
      : scale.status === "unknown"
        ? "unknown_scale"
        : "missing_inputs",
    methodology: null
  };
  let gasImpact: z.infer<typeof calculatedMetricSchema> = {
    value: null,
    state: !economicsSourceCovered
      ? "source_scope_missing"
      : scale.status === "unknown"
        ? "unknown_scale"
        : "missing_inputs",
    methodology: null
  };
  const initialCostState = economicsSourceCovered ? "missing" : "source_scope_missing";
  let knownCosts = {
    methodology: null as typeof NET_APY_METHODOLOGY | null,
    capitalAsset: {
      address: input.capital.assetAddress,
      decimals: input.capital.decimals
    },
    annualFeeApy: null as string | null,
    gas: emptyCostResolution(initialCostState),
    route: emptyCostResolution(initialCostState),
    slippage: emptyCostResolution(initialCostState),
    withdrawalFee: emptyCostResolution(initialCostState),
    totalRaw: null as string | null
  };
  let resolvedCostTotal: bigint | null = null;
  let resolvedGasCost: bigint | null = null;
  if (economicsSourceCovered && opportunity.economics !== null) {
    const economics = opportunity.economics;
    const gas = resolveCapitalCost(
      economics.costs.gas,
      input,
      opportunity,
      add,
      path("economics.costs.gas")
    );
    const route = resolveCapitalCost(
      economics.costs.route,
      input,
      opportunity,
      add,
      path("economics.costs.route")
    );
    const slippage = resolveCapitalCost(
      economics.costs.slippage,
      input,
      opportunity,
      add,
      path("economics.costs.slippage")
    );
    let withdrawalFee = resolveCapitalCost(
      economics.costs.withdrawalFee,
      input,
      opportunity,
      add,
      path("economics.costs.withdrawalFee")
    );
    if (
      expectedWithdrawalFeeRaw === null ||
      withdrawalFee.capitalAssetAmountRaw === null ||
      BigInt(withdrawalFee.capitalAssetAmountRaw) !== expectedWithdrawalFeeRaw
    ) {
      add(
        "evidence",
        "WITHDRAWAL_FEE_COST_MISMATCH",
        path("economics.costs.withdrawalFee"),
        "Withdrawal cost must exactly reconcile to the documented fee basis and rounding result."
      );
      withdrawalFee = {
        ...withdrawalFee,
        capitalAssetAmountRaw: null,
        state: "fee_mismatch"
      };
    }

    const resolved = [gas, route, slippage, withdrawalFee].map(({ capitalAssetAmountRaw }) =>
      capitalAssetAmountRaw === null ? null : BigInt(capitalAssetAmountRaw)
    );
    if (resolved.every((value): value is bigint => value !== null)) {
      const total = resolved.reduce((sum, value) => sum + value, 0n);
      if (total > MAX_UINT256) {
        add(
          "evidence",
          "KNOWN_COST_TOTAL_OUT_OF_RANGE",
          path("economics.costs"),
          "The sum of individually valid costs exceeds uint256 and is not a usable onchain raw amount."
        );
      } else {
        resolvedCostTotal = total;
      }
    }
    resolvedGasCost = gas.capitalAssetAmountRaw === null ? null : BigInt(gas.capitalAssetAmountRaw);
    knownCosts = {
      methodology: NET_APY_METHODOLOGY,
      annualFeeApy: opportunity.apy.scale.status === "documented" ? economics.annualFeeApy : null,
      capitalAsset: {
        address: input.capital.assetAddress,
        decimals: input.capital.decimals
      },
      gas,
      route,
      slippage,
      withdrawalFee,
      totalRaw: resolvedCostTotal?.toString() ?? null
    };
  }

  if (!apySourceCovered) {
    // SOURCE_SCOPE_MISSING above is the canonical evidence issue. Values are
    // withheld rather than upgraded into claims the locator does not cover.
  } else if (scale.status === "unknown") {
    add(
      "evidence",
      "APY_SCALE_UNKNOWN",
      path("apy.scale"),
      "APY values are withheld because their scale is unknown."
    );
  } else {
    const baseScaled =
      opportunity.apy.baseApy === null
        ? null
        : parseScaled(opportunity.apy.baseApy, scale.decimalPlaces);
    const rewardScaled =
      opportunity.apy.rewardApy === null
        ? null
        : parseScaled(opportunity.apy.rewardApy, scale.decimalPlaces);
    const grossScaled =
      opportunity.apy.grossApy === null
        ? null
        : parseScaled(opportunity.apy.grossApy, scale.decimalPlaces);
    if (baseScaled === null) {
      add(
        "evidence",
        "BASE_APY_MISSING",
        path("apy.baseApy"),
        "Base APY is unknown; provide zero when the documented source reports no base yield."
      );
    }
    if (rewardScaled === null) {
      add(
        "evidence",
        "REWARD_APY_MISSING",
        path("apy.rewardApy"),
        "Reward APY is unknown; provide zero when the documented source reports no reward yield."
      );
    }
    if (grossScaled === null) {
      add(
        "evidence",
        "GROSS_APY_MISSING",
        path("apy.grossApy"),
        "Gross APY is required for route economics."
      );
    }
    if (opportunity.apy.grossComposition === "base_plus_reward") {
      if (baseScaled === null || rewardScaled === null || grossScaled === null) {
        add(
          "evidence",
          "APY_COMPONENT_MISSING",
          path("apy"),
          "Base, reward, and gross APY are all required for base_plus_reward composition."
        );
      } else if (baseScaled + rewardScaled !== grossScaled) {
        add(
          "evidence",
          "GROSS_COMPONENT_MISMATCH",
          path("apy.grossApy"),
          "Gross APY does not exactly equal base APY plus reward APY at the documented scale."
        );
      }
    }

    if (!economicsSourceCovered) {
      net = { value: null, state: "source_scope_missing", methodology: null };
      gasImpact = { value: null, state: "source_scope_missing", methodology: null };
    } else if (scale.annualization !== "365_day_simple") {
      net = { value: null, state: "unsupported_methodology", methodology: null };
      gasImpact = { value: null, state: "unsupported_methodology", methodology: null };
      add(
        "evidence",
        "NET_APY_METHODOLOGY_UNSUPPORTED",
        path("apy.scale.annualization"),
        "Source-reported compounded APY is exposed, but this analyzer does not subtract simple annual fees and horizon costs from it."
      );
    } else if (opportunity.economics === null) {
      add(
        "evidence",
        "ECONOMICS_MISSING",
        path("economics"),
        "Annual fee, gas, route, slippage, and withdrawal cost inputs are all required for net APY."
      );
    } else if (grossScaled !== null) {
      const economics = opportunity.economics;
      const annualFeeScaled = parseScaled(economics.annualFeeApy, scale.decimalPlaces);
      if (resolvedCostTotal === null || resolvedGasCost === null) {
        const outOfRange = violations.some(({ code }) => code === "KNOWN_COST_TOTAL_OUT_OF_RANGE");
        net = {
          value: null,
          state: outOfRange ? "out_of_range" : "unresolved_costs",
          methodology: NET_APY_METHODOLOGY
        };
        gasImpact = {
          value: null,
          state: outOfRange ? "out_of_range" : "unresolved_costs",
          methodology: NET_APY_METHODOLOGY
        };
      } else {
        const fullScale = fullReturnScale(scale);
        const totalImpact = exactAnnualizedCostImpact(
          resolvedCostTotal,
          capital,
          input.capital.horizonSeconds,
          fullScale
        );
        const gasOnlyImpact = exactAnnualizedCostImpact(
          resolvedGasCost,
          capital,
          input.capital.horizonSeconds,
          fullScale
        );
        if (totalImpact === null) {
          net = { value: null, state: "non_exact", methodology: NET_APY_METHODOLOGY };
          add(
            "evidence",
            "NET_APY_NON_EXACT",
            path("economics"),
            "Known costs cannot be represented exactly at the documented APY decimal scale."
          );
        } else {
          const netScaled = grossScaled - annualFeeScaled - totalImpact;
          const formatted = safeFormatScaled(netScaled, scale.decimalPlaces);
          if (formatted === null) {
            net = { value: null, state: "out_of_range", methodology: NET_APY_METHODOLOGY };
            add(
              "evidence",
              "NET_APY_OUT_OF_RANGE",
              path("apy.net"),
              "Calculated net APY exceeds the bounded output representation."
            );
          } else {
            net = {
              value: formatted,
              state: "available",
              methodology: NET_APY_METHODOLOGY
            };
          }
          if (
            compareRateToPercentagePoints(
              netScaled,
              fullScale,
              input.constraints.minimumNetApyPercentagePoints
            ) < 0
          ) {
            add(
              "constraint",
              "NET_APY_BELOW_MINIMUM",
              path("apy.net"),
              "Known net APY is below the configured minimum."
            );
          }
        }
        if (gasOnlyImpact === null) {
          gasImpact = { value: null, state: "non_exact", methodology: NET_APY_METHODOLOGY };
          add(
            "evidence",
            "GAS_IMPACT_NON_EXACT",
            path("economics.costs.gas"),
            "Gas impact cannot be represented exactly at the documented APY decimal scale."
          );
        } else {
          const formatted = safeFormatScaled(gasOnlyImpact, scale.decimalPlaces);
          if (formatted === null) {
            gasImpact = {
              value: null,
              state: "out_of_range",
              methodology: NET_APY_METHODOLOGY
            };
            add(
              "evidence",
              "GAS_IMPACT_OUT_OF_RANGE",
              path("gasImpact"),
              "Calculated gas impact exceeds the bounded output representation."
            );
          } else {
            gasImpact = {
              value: formatted,
              state: "available",
              methodology: NET_APY_METHODOLOGY
            };
          }
          if (
            compareRateToPercentagePoints(
              gasOnlyImpact,
              fullScale,
              input.constraints.maximumAnnualizedGasImpactPercentagePoints
            ) > 0
          ) {
            add(
              "constraint",
              "GAS_IMPACT_EXCEEDS_MAXIMUM",
              path("gasImpact"),
              "Annualized known gas impact exceeds the configured maximum."
            );
          }
        }

        const annualNetBeforeCosts = grossScaled - annualFeeScaled;
        const projectedYieldNumerator =
          annualNetBeforeCosts * capital * BigInt(input.capital.horizonSeconds);
        const knownCostNumerator = resolvedCostTotal * fullScale * SECONDS_PER_365_DAY_YEAR;
        if (annualNetBeforeCosts <= 0n) {
          add(
            "constraint",
            "ANNUAL_FEES_EXCEED_GROSS",
            path("economics.annualFeeApy"),
            "Annual fee APY is greater than or equal to gross APY."
          );
        }
        if (projectedYieldNumerator <= knownCostNumerator) {
          add(
            "constraint",
            "KNOWN_COSTS_EXCEED_PROJECTED_YIELD",
            path("economics"),
            "Known route costs equal or exceed projected yield over the user horizon."
          );
        }
      }
    }
  }

  const hasEvidenceViolation = violations.some(({ kind }) => kind === "evidence");
  const hasConstraintViolation = violations.some(({ kind }) => kind === "constraint");
  const decision: OpportunityResult["decision"] = hasEvidenceViolation
    ? "insufficient_evidence"
    : hasConstraintViolation
      ? "hold"
      : "review_route";
  const rationale = [
    decision === "review_route"
      ? "The sourced opportunity satisfies the configured evidence and risk gates; it is eligible for human route review, not execution."
      : decision === "hold"
        ? "Evidence is complete, but one or more user risk or liquidity constraints prohibit route review."
        : "Required evidence is missing, stale, future-dated, internally inconsistent, or not exactly calculable."
  ];
  if (net.value !== null) {
    rationale.push(
      `Known net APY is ${net.value} in the documented ${scale.status === "documented" ? scale.unit : "unknown"} scale.`
    );
  }

  return opportunityResultSchema.parse({
    opportunityId: opportunity.opportunityId,
    protocol: opportunity.protocol,
    vaultAddress: opportunity.vaultAddress,
    asset: opportunity.asset,
    observation: opportunity.observation,
    sourceAgeSeconds,
    apy: {
      scale,
      grossComposition: opportunity.apy.grossComposition,
      base,
      reward,
      gross,
      net
    },
    liquidity: opportunity.liquidity,
    withdrawal: opportunity.withdrawal,
    postAllocationProtocolExposureBps: opportunity.postAllocationProtocolExposureBps,
    gasImpact: {
      capitalAssetGasCostRaw: knownCosts.gas.capitalAssetAmountRaw,
      annualizedApyImpact: gasImpact
    },
    knownCosts,
    routeHistory: opportunity.routeHistory.map((route) => ({
      ...route,
      receiptReferenceState: route.transactionHash === null ? "missing" : "unverified_reference"
    })),
    realizedPerformance: {
      status: "unknown",
      value: null,
      reason:
        "Realized performance requires verified receipts, asset flows, prices, and cost basis; this analyzer fetches none of them."
    },
    eligibility: UNVERIFIED_ELIGIBILITY,
    decision,
    violations,
    violationsTruncated,
    rationale
  });
}

function analyzeOpportunitySafely(
  input: YieldAnalysisInput,
  opportunity: Opportunity
): OpportunityResult {
  try {
    return analyzeOpportunity(input, opportunity);
  } catch {
    return conservativeOpportunity(input, opportunity, "ANALYSIS_BOUNDARY_FAILED");
  }
}

function conservativeOpportunity(
  input: YieldAnalysisInput,
  opportunity: Opportunity,
  code: "ANALYSIS_BOUNDARY_FAILED" | "OUTPUT_VALIDATION_FAILED"
): OpportunityResult {
  const scale = opportunity.apy.scale;
  const candidate: OpportunityResult = {
    opportunityId: opportunity.opportunityId,
    protocol: opportunity.protocol,
    vaultAddress: opportunity.vaultAddress,
    asset: opportunity.asset,
    observation: opportunity.observation,
    sourceAgeSeconds: Math.trunc(
      (Date.parse(input.analysisAtUtc) - Date.parse(opportunity.observation.observedAtUtc)) / 1_000
    ),
    apy: {
      scale,
      grossComposition: opportunity.apy.grossComposition,
      base: exposedRate(opportunity.apy.baseApy, scale, false),
      reward: exposedRate(opportunity.apy.rewardApy, scale, false),
      gross: exposedRate(opportunity.apy.grossApy, scale, false),
      net: { value: null, state: "missing_inputs", methodology: null }
    },
    liquidity: opportunity.liquidity,
    withdrawal: opportunity.withdrawal,
    postAllocationProtocolExposureBps: opportunity.postAllocationProtocolExposureBps,
    gasImpact: {
      capitalAssetGasCostRaw: null,
      annualizedApyImpact: { value: null, state: "missing_inputs", methodology: null }
    },
    knownCosts: {
      methodology: null,
      capitalAsset: {
        address: input.capital.assetAddress,
        decimals: input.capital.decimals
      },
      annualFeeApy: null,
      gas: emptyCostResolution("missing"),
      route: emptyCostResolution("missing"),
      slippage: emptyCostResolution("missing"),
      withdrawalFee: emptyCostResolution("missing"),
      totalRaw: null
    },
    routeHistory: opportunity.routeHistory.map((route) => ({
      ...route,
      receiptReferenceState:
        route.transactionHash === null ? ("missing" as const) : ("unverified_reference" as const)
    })),
    realizedPerformance: {
      status: "unknown" as const,
      value: null,
      reason:
        "Realized performance requires verified receipts, asset flows, prices, and cost basis; this analyzer fetches none of them."
    },
    eligibility: UNVERIFIED_ELIGIBILITY,
    decision: "insufficient_evidence" as const,
    violations: [
      {
        kind: "evidence" as const,
        code,
        path: `opportunities.${opportunity.opportunityId}`.slice(0, 180),
        message:
          "The bounded analysis could not produce a schema-valid calculation; all derived claims were withheld."
      }
    ],
    violationsTruncated: false,
    rationale: [
      "Derived values are unavailable because the non-throwing analysis boundary failed closed."
    ]
  };
  const parsed = opportunityResultSchema.safeParse(candidate);
  return parsed.success ? parsed.data : candidate;
}

function fallbackOpportunitiesResult(
  input: YieldAnalysisInput,
  opportunities: OpportunityResult[]
): YieldAnalysisResult {
  const candidate: YieldAnalysisResult = {
    skill: "analyze_yield_opportunities" as const,
    schemaVersion: 2 as const,
    methodologyVersion: YIELD_ANALYSIS_METHODOLOGY_VERSION,
    environment: input.chainId === 56 ? ("bsc-mainnet" as const) : ("bsc-testnet" as const),
    chainId: input.chainId,
    analysisAtUtc: input.analysisAtUtc,
    capital: input.capital,
    constraints: input.constraints,
    trust: UNVERIFIED_TRUST,
    decision: "insufficient_evidence" as const,
    humanReviewCandidateIds: [],
    opportunities,
    limitations: [
      "Caller-supplied evidence is unverified and an internal output boundary failed closed; no derived claim is eligible for marketplace, activation, or execution use."
    ],
    executionEnabled: false as const
  };
  const parsed = yieldAnalysisResultSchema.safeParse(candidate);
  return parsed.success ? parsed.data : candidate;
}

function emptyCostResolution(state: "source_scope_missing" | "missing"): CostResolutionResult {
  return { evidence: null, capitalAssetAmountRaw: null, state };
}

function resolveCapitalCost(
  evidence: CostEvidence,
  input: YieldAnalysisInput,
  opportunity: Opportunity,
  add: (kind: Violation["kind"], code: string, path: string, message: string) => void,
  evidencePath: string
): CostResolutionResult {
  const valuation = evidence.valuation;
  if (valuation.kind === "unresolved_conversion") {
    add(
      "evidence",
      "COST_CONVERSION_UNRESOLVED",
      `${evidencePath}.valuation`,
      "Cost conversion into the capital asset is unresolved."
    );
    return { evidence, capitalAssetAmountRaw: null, state: "unresolved_conversion" };
  }

  const targetMatches =
    valuation.capitalAssetAddress === input.capital.assetAddress &&
    valuation.capitalAssetDecimals === input.capital.decimals &&
    valuation.capitalAssetAddress === opportunity.asset.address &&
    valuation.capitalAssetDecimals === opportunity.asset.decimals;
  if (!targetMatches) {
    add(
      "evidence",
      "COST_ASSET_MISMATCH",
      `${evidencePath}.valuation`,
      "Cost valuation target must match the exact capital and vault asset address and decimals."
    );
    return { evidence, capitalAssetAmountRaw: null, state: "asset_mismatch" };
  }

  const timeState = evidenceTimeState(
    valuation.observedAtUtc,
    Date.parse(input.analysisAtUtc),
    input.constraints.maximumSourceAgeSeconds,
    input.constraints.futureToleranceSeconds
  );
  if (timeState !== "available") {
    add(
      "evidence",
      timeState === "stale" ? "COST_SOURCE_STALE" : "COST_SOURCE_IN_FUTURE",
      `${evidencePath}.valuation.observedAtUtc`,
      "Cost evidence is outside the configured observation window."
    );
    return { evidence, capitalAssetAmountRaw: null, state: timeState };
  }

  if (valuation.kind === "direct_capital_asset") {
    if (
      evidence.sourceAssetAddress !== input.capital.assetAddress ||
      evidence.sourceAssetDecimals !== input.capital.decimals
    ) {
      add(
        "evidence",
        "COST_ASSET_MISMATCH",
        evidencePath,
        "A direct cost must already be denominated in the exact capital asset."
      );
      return { evidence, capitalAssetAmountRaw: null, state: "asset_mismatch" };
    }
    if (valuation.capitalAssetAmountRaw !== evidence.sourceAmountRaw) {
      add(
        "evidence",
        "COST_DIRECT_AMOUNT_MISMATCH",
        `${evidencePath}.valuation.capitalAssetAmountRaw`,
        "A direct capital-asset valuation must preserve the exact source raw amount."
      );
      return { evidence, capitalAssetAmountRaw: null, state: "conversion_mismatch" };
    }
    return {
      evidence,
      capitalAssetAmountRaw: valuation.capitalAssetAmountRaw,
      state: "available"
    };
  }

  const numerator = BigInt(evidence.sourceAmountRaw) * BigInt(valuation.numeratorCapitalAssetRaw);
  const denominator = BigInt(valuation.denominatorSourceAssetRaw);
  if (numerator % denominator !== 0n) {
    add(
      "evidence",
      "COST_CONVERSION_NON_EXACT",
      `${evidencePath}.valuation`,
      "Cost conversion is not exact under the documented quote ratio and exact-only rounding."
    );
    return { evidence, capitalAssetAmountRaw: null, state: "non_exact_conversion" };
  }
  const converted = numerator / denominator;
  if (converted > MAX_UINT256 || converted.toString() !== valuation.capitalAssetAmountRaw) {
    add(
      "evidence",
      "COST_CONVERSION_MISMATCH",
      `${evidencePath}.valuation.capitalAssetAmountRaw`,
      "Converted cost does not match the exact documented source amount and quote ratio."
    );
    return { evidence, capitalAssetAmountRaw: null, state: "conversion_mismatch" };
  }
  return {
    evidence,
    capitalAssetAmountRaw: valuation.capitalAssetAmountRaw,
    state: "available"
  };
}

function evidenceTimeState(
  observedAtUtc: string,
  analysisMs: number,
  maximumAgeSeconds: number,
  futureToleranceSeconds: number
): "available" | "stale" | "future" {
  const ageMs = analysisMs - Date.parse(observedAtUtc);
  if (ageMs > maximumAgeSeconds * 1_000) return "stale";
  if (ageMs < -futureToleranceSeconds * 1_000) return "future";
  return "available";
}

function deriveBasisPointFee(
  amountRaw: bigint,
  feeBps: number,
  rounding: "exact" | "floor" | "ceil"
): bigint | null {
  const numerator = amountRaw * BigInt(feeBps);
  if (rounding === "exact") return numerator % 10_000n === 0n ? numerator / 10_000n : null;
  if (rounding === "floor") return numerator / 10_000n;
  return (numerator + 9_999n) / 10_000n;
}

function fractionalDigits(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}

function parseScaled(value: string, decimalPlaces: number): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(decimalPlaces) +
    BigInt(fraction.padEnd(decimalPlaces, "0") || "0")
  );
}

function formatScaled(value: bigint, decimalPlaces: number): string {
  if (value === 0n) return "0";
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const factor = 10n ** BigInt(decimalPlaces);
  const whole = absolute / factor;
  const fraction = (absolute % factor).toString(10).padStart(decimalPlaces, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString(10)}${fraction ? `.${fraction}` : ""}`;
}

function safeFormatScaled(value: bigint, decimalPlaces: number): string | null {
  const formatted = formatScaled(value, decimalPlaces);
  return signedDecimalStringSchema.safeParse(formatted).success ? formatted : null;
}

function fullReturnScale(scale: DocumentedApyScale): bigint {
  const unitsPerFullReturn =
    scale.unit === "percentage_points" ? 100n : scale.unit === "basis_points" ? 10_000n : 1n;
  return unitsPerFullReturn * 10n ** BigInt(scale.decimalPlaces);
}

function exactAnnualizedCostImpact(
  costRaw: bigint,
  capitalRaw: bigint,
  horizonSeconds: number,
  fullScale: bigint
): bigint | null {
  const numerator = costRaw * fullScale * SECONDS_PER_365_DAY_YEAR;
  const denominator = capitalRaw * BigInt(horizonSeconds);
  return numerator % denominator === 0n ? numerator / denominator : null;
}

function decimalFraction(value: string): { numerator: bigint; denominator: bigint } {
  const [whole = "0", fraction = ""] = value.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  return {
    numerator: BigInt(whole) * denominator + BigInt(fraction || "0"),
    denominator
  };
}

function compareRateToPercentagePoints(
  rateScaled: bigint,
  fullScale: bigint,
  percentagePoints: string
): -1 | 0 | 1 {
  const threshold = decimalFraction(percentagePoints);
  const left = rateScaled * threshold.denominator * 100n;
  const right = threshold.numerator * fullScale;
  return left < right ? -1 : left > right ? 1 : 0;
}

function exposedRate(
  rawValue: string | null,
  scale: z.infer<typeof apyScaleSchema>,
  sourceCovered: boolean
): z.infer<typeof exposedMetricSchema> {
  if (!sourceCovered) return { value: null, state: "source_scope_missing" };
  if (scale.status === "unknown") return { value: null, state: "unknown_scale" };
  return rawValue === null
    ? { value: null, state: "missing" }
    : { value: rawValue, state: "available" };
}

export interface YieldAnalysisInputError {
  error: "INVALID_ANALYSIS_INPUT";
  issues: Array<{ path: string; message: string }>;
  executionEnabled: false;
}

/** A2A flat data-part adapter: `{skill:"analyze_yield_opportunities", ...input}`. */
export function handleYieldAnalysisA2a(
  data: Record<string, unknown>
): YieldAnalysisResult | YieldAnalysisInputError {
  if (data.skill !== "analyze_yield_opportunities") {
    return invalidInput([{ path: "skill", message: "expected analyze_yield_opportunities" }]);
  }
  const { skill: _skill, ...input } = data;
  void _skill;
  const parsed = yieldAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidInput(
      parsed.error.issues.slice(0, 12).map((issue) => ({
        path: issue.path.join(".").slice(0, 180),
        message: issue.message.slice(0, 240)
      }))
    );
  }
  return analyzeYieldOpportunities(parsed.data);
}

/** MCP adapter with JSON text and protocol-native structured output. */
export function handleYieldAnalysisMcp(rawInput: unknown): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
} {
  const result = analyzeYieldOpportunities(rawInput);
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: { ...result }
  };
}

function invalidInput(issues: Array<{ path: string; message: string }>): YieldAnalysisInputError {
  return { error: "INVALID_ANALYSIS_INPUT", issues, executionEnabled: false };
}
