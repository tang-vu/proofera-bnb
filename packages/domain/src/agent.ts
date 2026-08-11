import { z } from "zod";

import {
  ChainIdSchema,
  EvidenceEnvironmentSchema,
  EvmAddressSchema,
  HttpLocatorSchema,
  HttpUrlSchema,
  IpfsLocatorSchema,
  TransactionHashSchema,
  UtcDateTimeSchema,
  createEvidenceMetricSchema
} from "./evidence";

const NonNegativeNumberSchema = z.number().finite().nonnegative();
const PositiveNumberSchema = z.number().finite().positive();
const RatioSchema = z.number().finite().min(0).max(1);
const PercentageSchema = z.number().finite();
const LossPercentageSchema = z.number().finite().min(0).max(100);
const DecimalStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Expected an unsigned base-10 decimal string")
  .max(80);
const USD_CENTS_PATTERN = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
const UsdCentsAmountSchema = z
  .string()
  .max(40)
  .regex(USD_CENTS_PATTERN, "Expected a non-negative USD amount in exact cents");
const IntegerStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "Expected an unsigned integer string");

export const ContentLocatorSchema = z.discriminatedUnion("type", [
  HttpLocatorSchema,
  IpfsLocatorSchema
]);

export const AgentCategorySchema = z.enum([
  "lp-rebalancing",
  "grid-trading",
  "yield-optimisation",
  "health-factor-monitoring"
]);

export const AgentOperatorTypeSchema = z.enum(["first-party", "third-party"]);

export const AgentMetadataSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(500),
  operatorName: z.string().trim().min(1).max(120),
  operatorType: AgentOperatorTypeSchema,
  iconUrl: HttpUrlSchema.nullable(),
  documentationUrl: HttpUrlSchema.nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20)
});

export const BscChainSchema = z.discriminatedUnion("chainId", [
  z.strictObject({
    chainId: z.literal(56),
    name: z.literal("BNB Smart Chain"),
    network: z.literal("mainnet")
  }),
  z.strictObject({
    chainId: z.literal(97),
    name: z.literal("BNB Smart Chain Testnet"),
    network: z.literal("testnet")
  })
]);

export const AgentIdentitySchema = z.strictObject({
  standard: z.literal("ERC-8004"),
  agentId: IntegerStringSchema,
  registryAddress: EvmAddressSchema,
  metadataLocator: ContentLocatorSchema
});

export const AgentRegistrationSchema = z.strictObject({
  standard: z.literal("ERC-8004"),
  agentId: IntegerStringSchema,
  registryAddress: EvmAddressSchema,
  transactionHash: TransactionHashSchema,
  registeredAt: UtcDateTimeSchema
});

export const AgentVerificationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("verified"),
    verifier: z.string().trim().min(1).max(120),
    verifiedAt: UtcDateTimeSchema,
    claims: z.array(z.string().trim().min(1).max(300)).min(1).max(25),
    reason: z.null()
  }),
  z.strictObject({
    status: z.literal("unverified"),
    verifier: z.null(),
    verifiedAt: z.null(),
    claims: z.array(z.never()).max(0),
    reason: z.string().trim().min(1).max(500)
  }),
  z.strictObject({
    status: z.literal("pending"),
    verifier: z.string().trim().min(1).max(120).nullable(),
    verifiedAt: z.null(),
    claims: z.array(z.never()).max(0),
    reason: z.string().trim().min(1).max(500)
  }),
  z.strictObject({
    status: z.literal("revoked"),
    verifier: z.string().trim().min(1).max(120),
    verifiedAt: UtcDateTimeSchema,
    claims: z.array(z.string().trim().min(1).max(300)).max(25),
    reason: z.string().trim().min(1).max(500)
  })
]);

export const AgentLifecycleStatusSchema = z.enum(["live", "paused", "inactive", "revoked"]);

export const AssetReferenceSchema = z.strictObject({
  symbol: z.string().trim().min(1).max(24),
  chainId: ChainIdSchema,
  address: EvmAddressSchema.nullable(),
  decimals: z.number().int().min(0).max(255)
});

export const ProtocolReferenceSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  documentationUrl: HttpUrlSchema,
  contractAddresses: z.array(EvmAddressSchema).max(100)
});

export const AgentFeeModelSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("none"),
    description: z.string().trim().min(1).max(300)
  }),
  z.strictObject({
    kind: z.literal("flat"),
    amountUsd: NonNegativeNumberSchema,
    chargedPer: z.enum(["activation", "execution", "month"]),
    description: z.string().trim().min(1).max(300)
  }),
  z.strictObject({
    kind: z.literal("performance"),
    ratePct: z.number().finite().min(0).max(100),
    hurdleRatePct: PercentageSchema.nullable(),
    description: z.string().trim().min(1).max(300)
  }),
  z.strictObject({
    kind: z.literal("subscription"),
    monthlyUsd: NonNegativeNumberSchema,
    description: z.string().trim().min(1).max(300)
  }),
  z.strictObject({
    kind: z.literal("protocol-only"),
    description: z.string().trim().min(1).max(300)
  })
]);

export const RiskFactorSchema = z.strictObject({
  code: z.string().trim().min(1).max(80),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().trim().min(1).max(500),
  mitigation: z.string().trim().min(1).max(500).nullable()
});

export const WorstObservedOutcomeSchema = z.strictObject({
  description: z.string().trim().min(1).max(500),
  lossPct: LossPercentageSchema.nullable(),
  occurredAt: UtcDateTimeSchema,
  transactionHash: TransactionHashSchema.nullable()
});

export const AgentRiskSchema = z.strictObject({
  level: z.enum(["low", "medium", "high", "critical"]),
  score: z.number().finite().min(0).max(100),
  factors: z.array(RiskFactorSchema).min(1).max(50),
  worstObservedOutcome: WorstObservedOutcomeSchema.nullable()
});

export const AgentReputationSchema = z.strictObject({
  rating: z.number().finite().min(0).max(5),
  reviewCount: z.number().int().nonnegative(),
  positiveReviewRatio: RatioSchema
});

export const AgentDataFreshnessSchema = z
  .strictObject({
    newestObservedAt: UtcDateTimeSchema,
    oldestObservedAt: UtcDateTimeSchema,
    totalMetricCount: z.number().int().positive(),
    freshMetricCount: z.number().int().nonnegative(),
    staleMetricCount: z.number().int().nonnegative(),
    expiredMetricCount: z.number().int().nonnegative(),
    unknownMetricCount: z.number().int().nonnegative()
  })
  .superRefine((value, context) => {
    if (Date.parse(value.oldestObservedAt) > Date.parse(value.newestObservedAt)) {
      context.addIssue({
        code: "custom",
        path: ["oldestObservedAt"],
        message: "Oldest observation must not be newer than the newest observation"
      });
    }

    const classifiedCount =
      value.freshMetricCount +
      value.staleMetricCount +
      value.expiredMetricCount +
      value.unknownMetricCount;

    if (classifiedCount !== value.totalMetricCount) {
      context.addIssue({
        code: "custom",
        path: ["totalMetricCount"],
        message: "Freshness bucket counts must equal the total metric count"
      });
    }
  });

export const PermissionEnforcementLayerSchema = z.enum([
  "session-key-policy",
  "smart-account-policy",
  "strategy-contract",
  "wallet-confirmation"
]);

export const PermissionCallSchema = z.strictObject({
  targetContract: EvmAddressSchema,
  functionSignature: z
    .string()
    .trim()
    .min(3)
    .max(500)
    .regex(
      /^[A-Za-z_][A-Za-z0-9_]*\([A-Za-z0-9_,()[\]]*\)$/,
      "Expected a canonical function signature without whitespace"
    ),
  functionSelector: z.string().regex(/^0x[a-fA-F0-9]{8}$/)
});

export const SpendCapPeriodSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("per-transaction") }),
  z.strictObject({ kind: z.literal("session") }),
  z.strictObject({ kind: z.literal("lifetime") }),
  z.strictObject({
    kind: z.literal("rolling-window"),
    durationSeconds: z.number().int().positive().max(31_536_000)
  })
]);

export const TokenSpendCapSchema = z.strictObject({
  token: AssetReferenceSchema,
  amountBaseUnits: IntegerStringSchema,
  period: SpendCapPeriodSchema
});

export const PermissionSummarySchema = z
  .strictObject({
    calls: z.array(PermissionCallSchema).max(100),
    spendCaps: z.array(TokenSpendCapSchema).max(100),
    enforcementLayer: PermissionEnforcementLayerSchema,
    expiresAt: UtcDateTimeSchema,
    revocable: z.boolean()
  })
  .superRefine((summary, context) => {
    const selectors = new Set<string>();
    const signatures = new Set<string>();
    const spendCaps = new Set<string>();

    summary.calls.forEach((call, index) => {
      const target = call.targetContract.toLowerCase();
      const selectorKey = `${target}:${call.functionSelector.toLowerCase()}`;
      const signatureKey = `${target}:${call.functionSignature}`;

      if (selectors.has(selectorKey)) {
        context.addIssue({
          code: "custom",
          path: ["calls", index, "functionSelector"],
          message: "A target and selector pair may appear only once"
        });
      }
      if (signatures.has(signatureKey)) {
        context.addIssue({
          code: "custom",
          path: ["calls", index, "functionSignature"],
          message: "A target and signature pair may appear only once"
        });
      }

      selectors.add(selectorKey);
      signatures.add(signatureKey);
    });

    summary.spendCaps.forEach((cap, index) => {
      const token = cap.token.address?.toLowerCase() ?? `native:${cap.token.symbol}`;
      const period =
        cap.period.kind === "rolling-window"
          ? `${cap.period.kind}:${cap.period.durationSeconds}`
          : cap.period.kind;
      const key = `${cap.token.chainId}:${token}:${period}`;
      if (spendCaps.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["spendCaps", index],
          message: "A token and period may have only one enforced spend cap"
        });
      }
      spendCaps.add(key);
    });
  });

const commonMetricsShape = {
  identity: createEvidenceMetricSchema(AgentIdentitySchema, "none"),
  owner: createEvidenceMetricSchema(EvmAddressSchema, "none"),
  chain: createEvidenceMetricSchema(BscChainSchema, "none"),
  registration: createEvidenceMetricSchema(AgentRegistrationSchema, "none"),
  verification: createEvidenceMetricSchema(AgentVerificationSchema, "none"),
  lifecycleStatus: createEvidenceMetricSchema(AgentLifecycleStatusSchema, "none"),
  lastActivityAt: createEvidenceMetricSchema(UtcDateTimeSchema, "timestamp"),
  executionCount: createEvidenceMetricSchema(z.number().int().nonnegative(), "count"),
  successRate: createEvidenceMetricSchema(RatioSchema, "ratio"),
  fees: createEvidenceMetricSchema(AgentFeeModelSchema, "none"),
  uptime: createEvidenceMetricSchema(RatioSchema, "ratio"),
  dataFreshness: createEvidenceMetricSchema(AgentDataFreshnessSchema, "none"),
  risk: createEvidenceMetricSchema(AgentRiskSchema, "none"),
  reputation: createEvidenceMetricSchema(AgentReputationSchema, "none"),
  supportedAssets: createEvidenceMetricSchema(
    z.array(AssetReferenceSchema).min(1).max(100),
    "none"
  ),
  supportedProtocols: createEvidenceMetricSchema(
    z.array(ProtocolReferenceSchema).min(1).max(50),
    "none"
  ),
  minimumCapitalUsd: createEvidenceMetricSchema(NonNegativeNumberSchema, "usd"),
  permissionSummary: createEvidenceMetricSchema(PermissionSummarySchema, "none")
} as const;

export const CommonAgentMetricsSchema = z.strictObject(commonMetricsShape);

export const LpRebalancingMetricsSchema = z.strictObject({
  inRangeTime: createEvidenceMetricSchema(RatioSchema, "ratio"),
  feeAprPct: createEvidenceMetricSchema(NonNegativeNumberSchema, "percent"),
  estimatedImpermanentLossPct: createEvidenceMetricSchema(LossPercentageSchema, "percent"),
  rebalanceFrequency: createEvidenceMetricSchema(
    z.strictObject({
      count: z.number().int().nonnegative(),
      periodDays: z.number().int().positive().max(3_650)
    }),
    "count"
  ),
  gasDragPct: createEvidenceMetricSchema(NonNegativeNumberSchema, "percent"),
  netPerformancePct: createEvidenceMetricSchema(PercentageSchema, "percent")
});

const normalizedDecimalParts = (value: string): { whole: string; fraction: string } => {
  const [whole = "0", fraction = ""] = value.split(".");
  return {
    whole: whole.replace(/^0+(?=\d)/, ""),
    fraction: fraction.replace(/0+$/, "")
  };
};

/** Exact comparison for schema-validated unsigned decimals; never coerces through IEEE-754. */
const compareUnsignedDecimalStrings = (left: string, right: string): -1 | 0 | 1 => {
  const leftParts = normalizedDecimalParts(left);
  const rightParts = normalizedDecimalParts(right);

  if (leftParts.whole.length !== rightParts.whole.length) {
    return leftParts.whole.length < rightParts.whole.length ? -1 : 1;
  }
  if (leftParts.whole !== rightParts.whole) {
    return leftParts.whole < rightParts.whole ? -1 : 1;
  }

  const fractionLength = Math.max(leftParts.fraction.length, rightParts.fraction.length);
  const leftFraction = leftParts.fraction.padEnd(fractionLength, "0");
  const rightFraction = rightParts.fraction.padEnd(fractionLength, "0");
  if (leftFraction === rightFraction) {
    return 0;
  }
  return leftFraction < rightFraction ? -1 : 1;
};

export const GridRangeSchema = z
  .strictObject({
    baseAsset: z.string().trim().min(1).max(24),
    quoteAsset: z.string().trim().min(1).max(24),
    lowerPrice: DecimalStringSchema,
    upperPrice: DecimalStringSchema
  })
  .refine(
    ({ lowerPrice, upperPrice }) => compareUnsignedDecimalStrings(lowerPrice, upperPrice) < 0,
    "Grid lower price must be below its upper price"
  );

const usdAmountToCents = (value: string): bigint | null => {
  if (!USD_CENTS_PATTERN.test(value)) {
    return null;
  }
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};

/**
 * Costs use decimal strings with at most two places and exact bigint-cent
 * addition. There is intentionally no floating-point tolerance to hide a mismatch.
 */
export const TradingCostsSchema = z
  .strictObject({
    gasUsd: UsdCentsAmountSchema,
    tradingFeesUsd: UsdCentsAmountSchema,
    slippageUsd: UsdCentsAmountSchema,
    agentFeesUsd: UsdCentsAmountSchema,
    otherUsd: UsdCentsAmountSchema,
    totalUsd: UsdCentsAmountSchema
  })
  .superRefine((costs, context) => {
    const gas = usdAmountToCents(costs.gasUsd);
    const tradingFees = usdAmountToCents(costs.tradingFeesUsd);
    const slippage = usdAmountToCents(costs.slippageUsd);
    const agentFees = usdAmountToCents(costs.agentFeesUsd);
    const other = usdAmountToCents(costs.otherUsd);
    const total = usdAmountToCents(costs.totalUsd);

    if (
      gas === null ||
      tradingFees === null ||
      slippage === null ||
      agentFees === null ||
      other === null ||
      total === null
    ) {
      return;
    }

    if (total !== gas + tradingFees + slippage + agentFees + other) {
      context.addIssue({
        code: "custom",
        path: ["totalUsd"],
        message: "Total USD cost must exactly equal the component sum in cents"
      });
    }
  });

export const GridTradingMetricsSchema = z.strictObject({
  realizedPnlUsd: createEvidenceMetricSchema(z.number().finite(), "usd"),
  fills: createEvidenceMetricSchema(z.number().int().nonnegative(), "count"),
  winRate: createEvidenceMetricSchema(RatioSchema, "ratio"),
  maximumDrawdownPct: createEvidenceMetricSchema(LossPercentageSchema, "percent"),
  turnoverUsd: createEvidenceMetricSchema(NonNegativeNumberSchema, "usd"),
  configuredRange: createEvidenceMetricSchema(GridRangeSchema, "none"),
  costs: createEvidenceMetricSchema(TradingCostsSchema, "usd")
});

export const ProtocolExposureSchema = z
  .array(
    z.strictObject({
      protocol: z.string().trim().min(1).max(100),
      asset: z.string().trim().min(1).max(24),
      allocationRatio: RatioSchema
    })
  )
  .min(1)
  .max(100)
  .refine(
    (exposures) =>
      Math.abs(exposures.reduce((sum, item) => sum + item.allocationRatio, 0) - 1) < 1e-8,
    "Protocol exposure allocations must sum to 1"
  );

export const WithdrawalConstraintsSchema = z.strictObject({
  lockupEndsAt: UtcDateTimeSchema.nullable(),
  cooldownSeconds: z.number().int().nonnegative(),
  exitFeePct: z.number().finite().min(0).max(100),
  minimumWithdrawalBaseUnits: IntegerStringSchema,
  notes: z.array(z.string().trim().min(1).max(300)).max(20)
});

export const YieldRouteEntrySchema = z.strictObject({
  enteredAt: UtcDateTimeSchema,
  exitedAt: UtcDateTimeSchema.nullable(),
  protocol: z.string().trim().min(1).max(100),
  asset: z.string().trim().min(1).max(24),
  amountBaseUnits: IntegerStringSchema,
  transactionHash: TransactionHashSchema
});

export const YieldOptimisationMetricsSchema = z.strictObject({
  baseApyPct: createEvidenceMetricSchema(PercentageSchema, "percent"),
  rewardApyPct: createEvidenceMetricSchema(PercentageSchema, "percent"),
  netApyPct: createEvidenceMetricSchema(PercentageSchema, "percent"),
  tvlUsd: createEvidenceMetricSchema(NonNegativeNumberSchema, "usd"),
  liquidityUsd: createEvidenceMetricSchema(NonNegativeNumberSchema, "usd"),
  protocolExposure: createEvidenceMetricSchema(ProtocolExposureSchema, "ratio"),
  withdrawalConstraints: createEvidenceMetricSchema(WithdrawalConstraintsSchema, "none"),
  routeHistory: createEvidenceMetricSchema(z.array(YieldRouteEntrySchema).max(1_000), "count"),
  gasImpactPct: createEvidenceMetricSchema(NonNegativeNumberSchema, "percent")
});

export const MonitoredAssetPositionSchema = z.strictObject({
  asset: AssetReferenceSchema,
  amountBaseUnits: IntegerStringSchema,
  valueUsd: NonNegativeNumberSchema
});

export const InterventionPolicySchema = z
  .strictObject({
    warningHealthFactor: PositiveNumberSchema,
    criticalHealthFactor: PositiveNumberSchema,
    action: z.enum(["alert-only", "repay", "add-collateral", "swap-and-repay"]),
    maximumRepayBps: z.number().int().min(0).max(10_000),
    allowedProtocols: z.array(z.string().trim().min(1).max(100)).min(1).max(25),
    humanConfirmationRequired: z.boolean()
  })
  .refine(
    ({ warningHealthFactor, criticalHealthFactor }) => warningHealthFactor > criticalHealthFactor,
    "Warning health factor must exceed the critical health factor"
  );

export const GuardianExecutionSchema = z.strictObject({
  occurredAt: UtcDateTimeSchema,
  action: z.enum(["alert", "repay", "add-collateral", "swap-and-repay"]),
  status: z.enum(["succeeded", "failed", "skipped"]),
  healthFactorBefore: PositiveNumberSchema,
  healthFactorAfter: PositiveNumberSchema.nullable(),
  transactionHash: TransactionHashSchema.nullable()
});

export const LiquidationRiskThresholdsSchema = z
  .strictObject({
    protocolLiquidationHealthFactor: PositiveNumberSchema,
    criticalHealthFactor: PositiveNumberSchema,
    warningHealthFactor: PositiveNumberSchema
  })
  .refine(
    (value) =>
      value.protocolLiquidationHealthFactor <= value.criticalHealthFactor &&
      value.criticalHealthFactor < value.warningHealthFactor,
    "Liquidation, critical, and warning thresholds must be ordered"
  );

export const HealthFactorMonitoringMetricsSchema = z.strictObject({
  currentHealthFactor: createEvidenceMetricSchema(PositiveNumberSchema, "ratio"),
  minimumHealthFactor: createEvidenceMetricSchema(PositiveNumberSchema, "ratio"),
  monitoredCollateral: createEvidenceMetricSchema(
    z.array(MonitoredAssetPositionSchema).min(1).max(100),
    "base_units"
  ),
  monitoredDebt: createEvidenceMetricSchema(
    z.array(MonitoredAssetPositionSchema).min(1).max(100),
    "base_units"
  ),
  alertLatencySeconds: createEvidenceMetricSchema(NonNegativeNumberSchema, "seconds"),
  interventionPolicy: createEvidenceMetricSchema(InterventionPolicySchema, "none"),
  executionHistory: createEvidenceMetricSchema(
    z.array(GuardianExecutionSchema).max(1_000),
    "count"
  ),
  liquidationRiskThresholds: createEvidenceMetricSchema(LiquidationRiskThresholdsSchema, "ratio")
});

const passportBaseShape = {
  passportVersion: z.literal("1.0.0"),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  environment: EvidenceEnvironmentSchema,
  metadata: AgentMetadataSchema,
  common: CommonAgentMetricsSchema
} as const;

export const LpRebalancingAgentPassportSchema = z.strictObject({
  ...passportBaseShape,
  category: z.literal("lp-rebalancing"),
  categoryMetrics: LpRebalancingMetricsSchema
});

export const GridTradingAgentPassportSchema = z.strictObject({
  ...passportBaseShape,
  category: z.literal("grid-trading"),
  categoryMetrics: GridTradingMetricsSchema
});

export const YieldOptimisationAgentPassportSchema = z.strictObject({
  ...passportBaseShape,
  category: z.literal("yield-optimisation"),
  categoryMetrics: YieldOptimisationMetricsSchema
});

export const HealthFactorMonitoringAgentPassportSchema = z.strictObject({
  ...passportBaseShape,
  category: z.literal("health-factor-monitoring"),
  categoryMetrics: HealthFactorMonitoringMetricsSchema
});

export const AgentPassportSchema = z
  .discriminatedUnion("category", [
    LpRebalancingAgentPassportSchema,
    GridTradingAgentPassportSchema,
    YieldOptimisationAgentPassportSchema,
    HealthFactorMonitoringAgentPassportSchema
  ])
  .superRefine((passport, context) => {
    if (passport.common.chain.availability === "available") {
      const chainId = passport.common.chain.value.chainId;
      if (passport.environment === "mainnet" && chainId !== 56) {
        context.addIssue({
          code: "custom",
          path: ["common", "chain", "value", "chainId"],
          message: "Mainnet passports must identify BNB Smart Chain chain ID 56"
        });
      }

      if (passport.environment === "testnet" && chainId !== 97) {
        context.addIssue({
          code: "custom",
          path: ["common", "chain", "value", "chainId"],
          message: "Testnet passports must identify BNB Smart Chain Testnet chain ID 97"
        });
      }

      if (passport.common.permissionSummary.availability === "available") {
        passport.common.permissionSummary.value.spendCaps.forEach((cap, index) => {
          if (cap.token.chainId !== chainId) {
            context.addIssue({
              code: "custom",
              path: [
                "common",
                "permissionSummary",
                "value",
                "spendCaps",
                index,
                "token",
                "chainId"
              ],
              message: "Permission spend-cap tokens must use the passport chain"
            });
          }
        });
      }
    }

    if (
      passport.common.identity.availability === "available" &&
      passport.common.registration.availability === "available"
    ) {
      const identity = passport.common.identity.value;
      const registration = passport.common.registration.value;
      if (
        identity.agentId !== registration.agentId ||
        identity.registryAddress.toLowerCase() !== registration.registryAddress.toLowerCase()
      ) {
        context.addIssue({
          code: "custom",
          path: ["common", "registration", "value"],
          message: "Registration must identify the same ERC-8004 agent and registry as identity"
        });
      }
    }

    if (
      passport.category === "health-factor-monitoring" &&
      passport.categoryMetrics.currentHealthFactor.availability === "available" &&
      passport.categoryMetrics.minimumHealthFactor.availability === "available" &&
      passport.categoryMetrics.minimumHealthFactor.value >
        passport.categoryMetrics.currentHealthFactor.value
    ) {
      context.addIssue({
        code: "custom",
        path: ["categoryMetrics", "minimumHealthFactor", "value"],
        message: "Historical minimum health factor cannot exceed the current health factor"
      });
    }
  });

export type AgentCategory = z.infer<typeof AgentCategorySchema>;
export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;
export type CommonAgentMetrics = z.infer<typeof CommonAgentMetricsSchema>;
export type LpRebalancingMetrics = z.infer<typeof LpRebalancingMetricsSchema>;
export type GridTradingMetrics = z.infer<typeof GridTradingMetricsSchema>;
export type YieldOptimisationMetrics = z.infer<typeof YieldOptimisationMetricsSchema>;
export type HealthFactorMonitoringMetrics = z.infer<typeof HealthFactorMonitoringMetricsSchema>;
export type LpRebalancingAgentPassport = z.infer<typeof LpRebalancingAgentPassportSchema>;
export type GridTradingAgentPassport = z.infer<typeof GridTradingAgentPassportSchema>;
export type YieldOptimisationAgentPassport = z.infer<typeof YieldOptimisationAgentPassportSchema>;
export type HealthFactorMonitoringAgentPassport = z.infer<
  typeof HealthFactorMonitoringAgentPassportSchema
>;
export type AgentPassport = z.infer<typeof AgentPassportSchema>;
