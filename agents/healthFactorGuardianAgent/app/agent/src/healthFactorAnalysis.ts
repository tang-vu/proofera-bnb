import { z } from "zod";

export const HEALTH_FACTOR_SKILL = "analyze_venus_health_factor" as const;
export const HEALTH_FACTOR_METHODOLOGY_VERSION =
  "proofera-venus-core-health-factor-v1.2.0" as const;

export const VENUS_CORE_COMPTROLLER_BY_CHAIN = {
  56: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  97: "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D"
} as const;

const MAX_UINT256 = (1n << 256n) - 1n;
const OFFICIAL_QUOTE_VALUE_SCALE = 18;
const OFFICIAL_THRESHOLD_SCALE = 18;
const OFFICIAL_THRESHOLD_DENOMINATOR = 10n ** 18n;
const MAX_POSITIONS = 64;
const MAX_OBSERVATIONS = 128;
const MAX_RECEIPTS = 128;

const chainIdSchema = z.union([z.literal(56), z.literal(97)]);
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 20-byte EVM address")
  .refine((value) => !/^0x0{40}$/i.test(value), "zero address is not valid evidence");
const hash32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte hex hash")
  .refine((value) => !/^0x0{64}$/i.test(value), "zero hash is not valid evidence");
const sha256DigestSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "expected a SHA-256 hex digest")
  .refine((value) => !/^0{64}$/.test(value), "zero digest is not valid evidence");
const assetSchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[A-Za-z0-9._-]+$/, "asset must use letters, numbers, dot, underscore, or hyphen");
const marketSchema = z.string().trim().min(1).max(80);
const quoteValueUnitSchema = z.literal("usd");
const uint256StringSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/, "expected a canonical unsigned decimal string")
  .refine((value) => BigInt(value) <= MAX_UINT256, "value exceeds uint256");
const derivedUintStringSchema = z
  .string()
  .max(512)
  .regex(/^(0|[1-9][0-9]*)$/, "expected a canonical unsigned decimal string");
const utcTimestampSchema = z
  .string()
  .max(32)
  .datetime({ offset: false, message: "expected an ISO 8601 UTC timestamp" });

const safeHttpsUrlSchema = z
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
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source URL must use HTTPS"
      });
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("127.")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source URL must not target a loopback host"
      });
    }
    if (parsed.username || parsed.password || parsed.hash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source URL must not contain credentials or a fragment"
      });
    }
  });

const httpSourceSchema = z
  .object({
    kind: z.literal("http"),
    url: safeHttpsUrlSchema,
    publisher: z.string().trim().min(1).max(120),
    contentSha256: sha256DigestSchema
  })
  .strict();

const officialComptrollerAddressSchema = addressSchema.refine(
  (value) =>
    Object.values(VENUS_CORE_COMPTROLLER_BY_CHAIN).some(
      (address) => address.toLowerCase() === value.toLowerCase()
    ),
  "expected an official Venus Core Pool Comptroller"
);

const venusOnchainSourceCommon = {
  kind: z.literal("onchain"),
  chainId: chainIdSchema,
  comptrollerAddress: officialComptrollerAddressSchema,
  account: addressSchema,
  blockNumber: uint256StringSchema,
  blockHash: hash32Schema,
  blockTimestampUtc: utcTimestampSchema,
  quoteValueUnit: quoteValueUnitSchema,
  quoteValueScaleDecimals: z.literal(OFFICIAL_QUOTE_VALUE_SCALE)
} as const;

const methodologyOnchainSourceSchema = z
  .object({
    ...venusOnchainSourceCommon,
    readMethod: z.literal("venus_core_pool_effective_liquidation_thresholds_v1"),
    collateralVTokenAddresses: z.array(addressSchema).max(MAX_POSITIONS)
  })
  .strict();

const currentSnapshotOnchainSourceSchema = z
  .object({
    ...venusOnchainSourceCommon,
    readMethod: z.literal("venus_core_pool_complete_account_markets_v1"),
    collateralVTokenAddresses: z.array(addressSchema).max(MAX_POSITIONS),
    debtVTokenAddresses: z.array(addressSchema).max(MAX_POSITIONS)
  })
  .strict();

const collateralOnchainSourceSchema = z
  .object({
    ...venusOnchainSourceCommon,
    readMethod: z.literal("venus_core_pool_collateral_operands_and_values_v2"),
    market: marketSchema,
    underlyingAsset: assetSchema,
    vTokenAddress: addressSchema
  })
  .strict();

const debtOnchainSourceSchema = z
  .object({
    ...venusOnchainSourceCommon,
    readMethod: z.literal("venus_core_pool_debt_operands_and_value_v2"),
    market: marketSchema,
    underlyingAsset: assetSchema,
    vTokenAddress: addressSchema
  })
  .strict();

const observationOnchainSourceSchema = z
  .object({
    ...venusOnchainSourceCommon,
    readMethod: z.literal("venus_core_pool_account_health_observation_v1"),
    collateralVTokenAddresses: z.array(addressSchema).max(MAX_POSITIONS),
    debtVTokenAddresses: z.array(addressSchema).max(MAX_POSITIONS)
  })
  .strict();

const venusOnchainSourceSchema = z.discriminatedUnion("readMethod", [
  methodologyOnchainSourceSchema,
  currentSnapshotOnchainSourceSchema,
  collateralOnchainSourceSchema,
  debtOnchainSourceSchema,
  observationOnchainSourceSchema
]);

const transactionReceiptSourceSchema = z
  .object({
    kind: z.literal("onchain_transaction"),
    readMethod: z.literal("eth_getTransactionReceipt"),
    chainId: chainIdSchema,
    comptrollerAddress: officialComptrollerAddressSchema,
    account: addressSchema,
    transactionHash: hash32Schema,
    blockNumber: uint256StringSchema,
    blockHash: hash32Schema,
    blockTimestampUtc: utcTimestampSchema
  })
  .strict();

const callerSourceSchema = z
  .object({
    kind: z.literal("caller"),
    reference: z.string().trim().min(1).max(200)
  })
  .strict();

export const healthFactorEvidenceSourceSchema = z.union([
  httpSourceSchema,
  venusOnchainSourceSchema,
  callerSourceSchema
]);

const methodologyEvidenceSchema = z
  .object({
    protocol: z.literal("venus-core-pool"),
    thresholdKind: z.literal("effective_user_liquidation_threshold"),
    weightingStrategy: z.literal("USE_LIQUIDATION_THRESHOLD"),
    thresholdRead: z.literal("getEffectiveLtvFactor"),
    quoteValueUnit: quoteValueUnitSchema,
    quoteValueScaleDecimals: z.literal(OFFICIAL_QUOTE_VALUE_SCALE),
    liquidationThresholdScaleDecimals: z.literal(OFFICIAL_THRESHOLD_SCALE),
    chainId: chainIdSchema,
    account: addressSchema,
    blockNumber: uint256StringSchema,
    blockHash: hash32Schema,
    observedAtUtc: utcTimestampSchema,
    source: methodologyOnchainSourceSchema
  })
  .strict();

const collateralPositionSchema = z
  .object({
    market: marketSchema,
    underlyingAsset: assetSchema,
    vTokenAddress: addressSchema,
    vTokenBalanceRaw: uint256StringSchema,
    exchangeRateMantissaRaw: uint256StringSchema,
    oraclePriceMantissaRaw: uint256StringSchema,
    fixedPointScaleDecimals: z.literal(OFFICIAL_THRESHOLD_SCALE),
    collateralValueRaw: uint256StringSchema,
    adjustedCollateralValueRaw: uint256StringSchema,
    quoteValueUnit: quoteValueUnitSchema,
    quoteValueScaleDecimals: z.literal(OFFICIAL_QUOTE_VALUE_SCALE),
    effectiveLiquidationThresholdRaw: uint256StringSchema.refine(
      (value) => BigInt(value) <= OFFICIAL_THRESHOLD_DENOMINATOR,
      "effective liquidation threshold must not exceed 1e18"
    ),
    liquidationThresholdScaleDecimals: z.number().int().min(0).max(36),
    chainId: chainIdSchema,
    account: addressSchema,
    blockNumber: uint256StringSchema,
    blockHash: hash32Schema,
    observedAtUtc: utcTimestampSchema,
    source: collateralOnchainSourceSchema
  })
  .strict();

const debtPositionSchema = z
  .object({
    market: marketSchema,
    underlyingAsset: assetSchema,
    vTokenAddress: addressSchema,
    borrowBalanceRaw: uint256StringSchema,
    oraclePriceMantissaRaw: uint256StringSchema,
    fixedPointScaleDecimals: z.literal(OFFICIAL_THRESHOLD_SCALE),
    debtValueRaw: uint256StringSchema,
    quoteValueUnit: quoteValueUnitSchema,
    quoteValueScaleDecimals: z.literal(OFFICIAL_QUOTE_VALUE_SCALE),
    chainId: chainIdSchema,
    account: addressSchema,
    blockNumber: uint256StringSchema,
    blockHash: hash32Schema,
    observedAtUtc: utcTimestampSchema,
    source: debtOnchainSourceSchema
  })
  .strict();

const currentSnapshotSchema = z
  .object({
    chainId: chainIdSchema,
    account: addressSchema,
    blockNumber: uint256StringSchema,
    blockHash: hash32Schema,
    observedAtUtc: utcTimestampSchema,
    quoteValueUnit: quoteValueUnitSchema,
    quoteValueScaleDecimals: z.literal(OFFICIAL_QUOTE_VALUE_SCALE),
    collateralComplete: z.boolean(),
    debtComplete: z.boolean(),
    collateralPositions: z.array(collateralPositionSchema).max(MAX_POSITIONS),
    debtPositions: z.array(debtPositionSchema).max(MAX_POSITIONS),
    source: currentSnapshotOnchainSourceSchema
  })
  .strict();

const observationSchema = z
  .object({
    chainId: chainIdSchema,
    account: addressSchema,
    blockNumber: uint256StringSchema,
    blockHash: hash32Schema,
    observedAtUtc: utcTimestampSchema,
    adjustedCollateralValueRaw: uint256StringSchema,
    debtValueRaw: uint256StringSchema,
    quoteValueUnit: quoteValueUnitSchema,
    quoteValueScaleDecimals: z.literal(OFFICIAL_QUOTE_VALUE_SCALE),
    liquidationThresholdScaleDecimals: z.number().int().min(0).max(36),
    source: observationOnchainSourceSchema
  })
  .strict();

const observationSeriesSchema = z
  .object({
    complete: z.boolean(),
    observations: z.array(observationSchema).max(MAX_OBSERVATIONS)
  })
  .strict();

const alertReceiptSchema = z
  .object({
    receiptId: z.string().trim().min(1).max(120),
    chainId: chainIdSchema,
    account: addressSchema,
    triggerBlockNumber: uint256StringSchema,
    triggerBlockHash: hash32Schema,
    triggerObservedAtUtc: utcTimestampSchema,
    deliveredAtUtc: utcTimestampSchema,
    channel: z.enum(["webhook", "email", "push", "in_app"]),
    receiptUrl: safeHttpsUrlSchema,
    contentSha256: sha256DigestSchema
  })
  .strict();

const executionReceiptSchema = z
  .object({
    chainId: chainIdSchema,
    account: addressSchema,
    transactionHash: hash32Schema,
    action: z.enum(["repay", "add_collateral", "liquidation", "other"]),
    status: z.enum(["success", "reverted"]),
    blockNumber: uint256StringSchema,
    blockHash: hash32Schema,
    observedAtUtc: utcTimestampSchema,
    source: transactionReceiptSourceSchema
  })
  .strict();

const guardianPolicySchema = z
  .object({
    healthFactorScaleDecimals: z.number().int().min(0).max(36),
    alertHealthFactorRaw: uint256StringSchema,
    interventionHealthFactorRaw: uint256StringSchema,
    maximumCurrentEvidenceAgeSeconds: z.number().int().positive().max(86_400),
    maximumObservationAgeSeconds: z.number().int().positive().max(2_592_000),
    futureToleranceSeconds: z.number().int().min(0).max(300),
    minimumHistoryObservations: z.number().int().min(1).max(MAX_OBSERVATIONS),
    minimumObservationWindowSeconds: z.number().int().min(0).max(2_592_000),
    maximumAlertLatencySeconds: z.number().int().min(0).max(86_400),
    minimumAlertReceipts: z.number().int().min(0).max(MAX_RECEIPTS),
    configuredAtUtc: utcTimestampSchema,
    source: callerSourceSchema
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (BigInt(policy.interventionHealthFactorRaw) > BigInt(policy.alertHealthFactorRaw)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interventionHealthFactorRaw"],
        message: "intervention threshold must not exceed alert threshold"
      });
    }
  });

export const healthFactorAnalysisInputSchema = z
  .object({
    chainId: chainIdSchema,
    account: addressSchema,
    analysisAtUtc: utcTimestampSchema,
    methodology: methodologyEvidenceSchema.nullable().optional(),
    currentSnapshot: currentSnapshotSchema.nullable().optional(),
    observationSeries: observationSeriesSchema.nullable().optional(),
    policy: guardianPolicySchema.nullable().optional(),
    alertReceipts: z.array(alertReceiptSchema).max(MAX_RECEIPTS).nullable().optional(),
    alertReceiptsComplete: z.boolean().nullable().optional(),
    executionReceipts: z.array(executionReceiptSchema).max(MAX_RECEIPTS).nullable().optional()
  })
  .strict();

const violationScopeSchema = z.enum([
  "current_evidence",
  "history",
  "alert_latency",
  "execution_history"
]);
const violationCodeSchema = z.enum([
  "MISSING_METHODOLOGY",
  "MISSING_CURRENT_SNAPSHOT",
  "MISSING_POLICY",
  "COLLATERAL_ENUMERATION_INCOMPLETE",
  "DEBT_ENUMERATION_INCOMPLETE",
  "CHAIN_MISMATCH",
  "ACCOUNT_MISMATCH",
  "BLOCK_MISMATCH",
  "SCALE_MISMATCH",
  "QUOTE_UNIT_MISMATCH",
  "OFFICIAL_COMPTROLLER_MISMATCH",
  "SOURCE_RELATION_MISMATCH",
  "SOURCE_STALE",
  "SOURCE_IN_FUTURE",
  "DUPLICATE_POSITION",
  "DERIVED_VALUE_MISMATCH",
  "VENUS_ARITHMETIC_OVERFLOW",
  "ADJUSTED_COLLATERAL_AGGREGATE_EXCEEDS_UINT256",
  "DEBT_AGGREGATE_EXCEEDS_UINT256",
  "HISTORY_MISSING",
  "HISTORY_ENUMERATION_INCOMPLETE",
  "HISTORY_OBSERVATION_INVALID",
  "HISTORY_DUPLICATE_BLOCK",
  "HISTORY_CURRENT_OBSERVATION_MISSING",
  "HISTORY_CURRENT_OBSERVATION_MISMATCH",
  "HISTORY_COUNT_INSUFFICIENT",
  "HISTORY_WINDOW_INSUFFICIENT",
  "ALERT_RECEIPT_INVALID",
  "ALERT_RECEIPT_ENUMERATION_INCOMPLETE",
  "ALERT_TRIGGER_COVERAGE_INCOMPLETE",
  "ALERT_LATENCY_EVIDENCE_INSUFFICIENT",
  "ALERT_LATENCY_BREACH",
  "EXECUTION_RECEIPT_INVALID"
]);
const violationSchema = z
  .object({
    scope: violationScopeSchema,
    code: violationCodeSchema,
    path: z.string().min(1).max(180),
    message: z.string().min(1).max(300)
  })
  .strict();

const provenanceStateSchema = z.enum([
  "missing",
  "fresh",
  "stale",
  "future",
  "block_mismatch",
  "scale_mismatch",
  "identity_mismatch"
]);
const provenanceSchema = z
  .object({
    path: z.string().min(1).max(180),
    state: provenanceStateSchema,
    blockNumber: uint256StringSchema.nullable(),
    blockHash: hash32Schema.nullable(),
    observedAtUtc: utcTimestampSchema.nullable(),
    ageSeconds: z.number().int().nullable(),
    source: healthFactorEvidenceSourceSchema.nullable()
  })
  .strict();

const computedHealthFactorSchema = z
  .object({
    state: z.literal("computed"),
    numerator: derivedUintStringSchema,
    denominator: derivedUintStringSchema,
    scaleDecimals: z.number().int().min(0).max(36),
    scaledValueFloor: derivedUintStringSchema,
    decimalValueFloor: z.string().min(1).max(560),
    rounding: z.literal("floor")
  })
  .strict();
const zeroDebtHealthFactorSchema = z
  .object({
    state: z.literal("not_applicable_zero_debt"),
    numerator: z.null(),
    denominator: z.null(),
    scaleDecimals: z.number().int().min(0).max(36),
    scaledValueFloor: z.null(),
    decimalValueFloor: z.null(),
    rounding: z.null(),
    statement: z.string().min(1).max(240)
  })
  .strict();
const unavailableHealthFactorSchema = z
  .object({
    state: z.literal("unavailable"),
    numerator: z.null(),
    denominator: z.null(),
    scaleDecimals: z.number().int().min(0).max(36).nullable(),
    scaledValueFloor: z.null(),
    decimalValueFloor: z.null(),
    rounding: z.null(),
    statement: z.string().min(1).max(240)
  })
  .strict();
const healthFactorMeasureSchema = z.discriminatedUnion("state", [
  computedHealthFactorSchema,
  zeroDebtHealthFactorSchema,
  unavailableHealthFactorSchema
]);

const observationResultSchema = z
  .object({
    evidence: observationSchema,
    state: z.enum(["usable", "invalid"]),
    issues: z.array(z.string().min(1).max(240)).max(12),
    healthFactor: healthFactorMeasureSchema
  })
  .strict();

const alertReceiptResultSchema = z
  .object({
    receipt: alertReceiptSchema,
    state: z.enum(["valid", "invalid"]),
    latencyMilliseconds: derivedUintStringSchema.nullable(),
    issues: z.array(z.string().min(1).max(240)).max(10)
  })
  .strict();

const executionReceiptResultSchema = z
  .object({
    receipt: executionReceiptSchema,
    state: z.enum(["context_consistent", "invalid"]),
    issues: z.array(z.string().min(1).max(240)).max(10)
  })
  .strict();

const normalizedInputSchema = z
  .object({
    methodology: methodologyEvidenceSchema.nullable(),
    currentSnapshot: currentSnapshotSchema.nullable(),
    observationSeries: observationSeriesSchema.nullable(),
    policy: guardianPolicySchema.nullable(),
    alertReceipts: z.array(alertReceiptSchema).max(MAX_RECEIPTS).nullable(),
    alertReceiptsComplete: z.boolean().nullable(),
    executionReceipts: z.array(executionReceiptSchema).max(MAX_RECEIPTS).nullable()
  })
  .strict();

export const healthFactorAnalysisResultSchema = z
  .object({
    skill: z.literal(HEALTH_FACTOR_SKILL),
    methodologyVersion: z.literal(HEALTH_FACTOR_METHODOLOGY_VERSION),
    environment: z.enum(["bsc-mainnet", "bsc-testnet"]),
    evidenceMode: z.literal("caller_supplied_unverified"),
    chainId: chainIdSchema,
    account: addressSchema,
    analysisAtUtc: utcTimestampSchema,
    sourceContentsVerified: z.literal(false),
    freshnessAttestedByAgent: z.literal(false),
    marketplaceEligible: z.literal(false),
    activationEligible: z.literal(false),
    executionEnabled: z.literal(false),
    inputEvidence: normalizedInputSchema,
    provenance: z.array(provenanceSchema).max(3 + MAX_POSITIONS * 2),
    currentHealthFactor: healthFactorMeasureSchema,
    monitoredPositions: z
      .object({
        collateral: z.array(collateralPositionSchema).max(MAX_POSITIONS).nullable(),
        debt: z.array(debtPositionSchema).max(MAX_POSITIONS).nullable(),
        totalCollateralValueRaw: derivedUintStringSchema.nullable(),
        adjustedCollateralValueRaw: derivedUintStringSchema.nullable(),
        totalDebtValueRaw: derivedUintStringSchema.nullable(),
        quoteValueUnit: quoteValueUnitSchema.nullable(),
        quoteValueScaleDecimals: z.number().int().min(0).max(36).nullable(),
        liquidationThresholdScaleDecimals: z.number().int().min(0).max(36).nullable()
      })
      .strict(),
    observationWindow: z
      .object({
        status: z.enum(["sufficient", "insufficient", "unavailable"]),
        suppliedComplete: z.boolean().nullable(),
        usableObservationCount: z.number().int().min(0).max(MAX_OBSERVATIONS),
        requiredObservationCount: z.number().int().min(1).max(MAX_OBSERVATIONS).nullable(),
        windowStartUtc: utcTimestampSchema.nullable(),
        windowEndUtc: utcTimestampSchema.nullable(),
        windowSeconds: z.number().int().min(0).nullable(),
        requiredWindowSeconds: z.number().int().min(0).nullable(),
        includesCurrentObservation: z.boolean(),
        minimumHealthFactor: healthFactorMeasureSchema,
        minimumObservedAtUtc: utcTimestampSchema.nullable(),
        minimumBlockNumber: uint256StringSchema.nullable(),
        observations: z.array(observationResultSchema).max(MAX_OBSERVATIONS)
      })
      .strict(),
    alertLatency: z
      .object({
        status: z.enum(["within_limit", "breach", "insufficient_evidence", "not_required"]),
        suppliedComplete: z.boolean().nullable(),
        triggerObservationCount: z.number().int().min(0).max(MAX_OBSERVATIONS),
        coveredTriggerCount: z.number().int().min(0).max(MAX_OBSERVATIONS),
        validReceiptCount: z.number().int().min(0).max(MAX_RECEIPTS),
        requiredReceiptCount: z.number().int().min(0).max(MAX_RECEIPTS).nullable(),
        maximumAllowedMilliseconds: derivedUintStringSchema.nullable(),
        maximumObservedMilliseconds: derivedUintStringSchema.nullable(),
        receipts: z.array(alertReceiptResultSchema).max(MAX_RECEIPTS)
      })
      .strict(),
    policyThresholds: z
      .object({
        scaleDecimals: z.number().int().min(0).max(36).nullable(),
        alertHealthFactorRaw: uint256StringSchema.nullable(),
        interventionHealthFactorRaw: uint256StringSchema.nullable()
      })
      .strict(),
    executionHistory: z
      .object({
        status: z.enum(["unknown_unverified_supplied_receipts", "unknown_no_receipts"]),
        contextConsistentReceiptCount: z.number().int().min(0).max(MAX_RECEIPTS),
        claimedSuccessReceiptCount: z.number().int().min(0).max(MAX_RECEIPTS),
        claimedRevertedReceiptCount: z.number().int().min(0).max(MAX_RECEIPTS),
        latestSuppliedTransactionHash: hash32Schema.nullable(),
        receipts: z.array(executionReceiptResultSchema).max(MAX_RECEIPTS),
        statement: z.string().min(1).max(300)
      })
      .strict(),
    constraintViolations: z.array(violationSchema).max(2_048),
    decision: z.enum(["hold", "monitor", "review_intervention", "insufficient_evidence"]),
    rationale: z.array(z.string().min(1).max(320)).min(2).max(5),
    methodology: z
      .object({
        formula: z.string().min(1).max(500),
        sameBlockRule: z.string().min(1).max(500),
        sourceRule: z.string().min(1).max(500),
        thresholdRule: z.string().min(1).max(500),
        zeroDebtRule: z.string().min(1).max(500),
        historyRule: z.string().min(1).max(500),
        officialSources: z.array(safeHttpsUrlSchema).length(3)
      })
      .strict(),
    limitations: z.array(z.string().min(1).max(360)).min(5).max(8)
  })
  .strict();

export type HealthFactorAnalysisInput = z.infer<typeof healthFactorAnalysisInputSchema>;
export type HealthFactorAnalysisResult = z.infer<typeof healthFactorAnalysisResultSchema>;
type NormalizedInput = z.infer<typeof normalizedInputSchema>;
type Violation = z.infer<typeof violationSchema>;
type Provenance = z.infer<typeof provenanceSchema>;
type HealthFactorMeasure = z.infer<typeof healthFactorMeasureSchema>;
type ObservationResult = z.infer<typeof observationResultSchema>;
type AlertReceiptResult = z.infer<typeof alertReceiptResultSchema>;
type ExecutionReceiptResult = z.infer<typeof executionReceiptResultSchema>;

interface Ratio {
  numerator: bigint;
  denominator: bigint;
}

interface CurrentCalculation {
  adjustedCollateralValueRaw: bigint;
  totalCollateralValueRaw: bigint;
  totalDebtValueRaw: bigint;
  ratio: Ratio | null;
}

/**
 * Analyze caller-supplied Venus Core Pool evidence without fetching, signing,
 * transacting, simulating, or writing state.
 */
export function analyzeHealthFactor(rawInput: unknown): HealthFactorAnalysisResult {
  const input = healthFactorAnalysisInputSchema.parse(rawInput);
  const normalized = normalizeInput(input);
  const currentReview = reviewCurrentEvidence(input, normalized);
  const policyScale = normalized.policy?.healthFactorScaleDecimals ?? null;
  const currentCalculation =
    currentReview.valid && normalized.currentSnapshot !== null && normalized.methodology !== null
      ? calculateCurrent(normalized.currentSnapshot)
      : null;
  const currentHealthFactor = currentMeasure(currentCalculation, policyScale);

  const violations = [...currentReview.violations];
  const history = reviewHistory(input, normalized, currentCalculation, violations);
  const alertLatency = reviewAlertLatency(input, normalized, history, violations);
  const executionHistory = reviewExecutionHistory(input, normalized, violations);
  const decision = chooseDecision(
    currentReview.valid,
    currentHealthFactor,
    history,
    alertLatency,
    normalized.policy
  );
  const rationale = buildRationale(
    decision,
    currentHealthFactor,
    history.status,
    alertLatency.status
  );

  const result: HealthFactorAnalysisResult = {
    skill: HEALTH_FACTOR_SKILL,
    methodologyVersion: HEALTH_FACTOR_METHODOLOGY_VERSION,
    environment: input.chainId === 56 ? "bsc-mainnet" : "bsc-testnet",
    evidenceMode: "caller_supplied_unverified",
    chainId: input.chainId,
    account: input.account,
    analysisAtUtc: input.analysisAtUtc,
    sourceContentsVerified: false,
    freshnessAttestedByAgent: false,
    marketplaceEligible: false,
    activationEligible: false,
    executionEnabled: false,
    inputEvidence: normalized,
    provenance: currentReview.provenance,
    currentHealthFactor,
    monitoredPositions: {
      collateral: normalized.currentSnapshot?.collateralPositions ?? null,
      debt: normalized.currentSnapshot?.debtPositions ?? null,
      totalCollateralValueRaw: currentCalculation?.totalCollateralValueRaw.toString() ?? null,
      adjustedCollateralValueRaw: currentCalculation?.adjustedCollateralValueRaw.toString() ?? null,
      totalDebtValueRaw: currentCalculation?.totalDebtValueRaw.toString() ?? null,
      quoteValueUnit: normalized.methodology?.quoteValueUnit ?? null,
      quoteValueScaleDecimals: normalized.methodology?.quoteValueScaleDecimals ?? null,
      liquidationThresholdScaleDecimals:
        normalized.methodology?.liquidationThresholdScaleDecimals ?? null
    },
    observationWindow: {
      status: history.status,
      suppliedComplete: normalized.observationSeries?.complete ?? null,
      usableObservationCount: history.usable.length,
      requiredObservationCount: normalized.policy?.minimumHistoryObservations ?? null,
      windowStartUtc: history.windowStartUtc,
      windowEndUtc: history.windowEndUtc,
      windowSeconds: history.windowSeconds,
      requiredWindowSeconds: normalized.policy?.minimumObservationWindowSeconds ?? null,
      includesCurrentObservation: history.includesCurrent,
      minimumHealthFactor: history.minimum.measure,
      minimumObservedAtUtc: history.minimum.observedAtUtc,
      minimumBlockNumber: history.minimum.blockNumber,
      observations: history.observations
    },
    alertLatency: {
      status: alertLatency.status,
      suppliedComplete: normalized.alertReceiptsComplete,
      triggerObservationCount: alertLatency.triggerObservationCount,
      coveredTriggerCount: alertLatency.coveredTriggerCount,
      validReceiptCount: alertLatency.valid.length,
      requiredReceiptCount: normalized.policy?.minimumAlertReceipts ?? null,
      maximumAllowedMilliseconds:
        normalized.policy === null
          ? null
          : (BigInt(normalized.policy.maximumAlertLatencySeconds) * 1_000n).toString(),
      maximumObservedMilliseconds: alertLatency.maximumObservedMilliseconds?.toString() ?? null,
      receipts: alertLatency.receipts
    },
    policyThresholds: {
      scaleDecimals: normalized.policy?.healthFactorScaleDecimals ?? null,
      alertHealthFactorRaw: normalized.policy?.alertHealthFactorRaw ?? null,
      interventionHealthFactorRaw: normalized.policy?.interventionHealthFactorRaw ?? null
    },
    executionHistory,
    constraintViolations: violations,
    decision,
    rationale,
    methodology: {
      formula:
        "healthFactor = sum(mulExp(mulExp(mulExp(effectiveLiquidationThresholdRaw, exchangeRateMantissaRaw), oraclePriceMantissaRaw), vTokenBalanceRaw)) / sum(mulExp(oraclePriceMantissaRaw, borrowBalanceRaw)), where every mulExp(a,b) = floor(a*b/10^18) and rejects uint256 multiplication overflow.",
      sameBlockRule:
        "Methodology, enumeration snapshot, every collateral value and effective threshold, and every debt value must identify the same BSC block number and hash before current health factor is computed.",
      sourceRule:
        "Every current value source must bind the official chain-specific Venus Core Pool Comptroller, requested account, exact block number/hash/timestamp, closed read method, related market/vToken, and the common USD quote unit/scale. Source contents remain caller-supplied and unverified.",
      thresholdRule:
        "Each collateral term must use the account-specific Venus Core Pool getEffectiveLtvFactor result with USE_LIQUIDATION_THRESHOLD, scaled by 1e18. Threshold, exchange rate, oracle price, and vToken balance are multiplied in ComptrollerLens order with truncation after every step; collateral factor is never substituted.",
      zeroDebtRule:
        "Complete evidence with total debt equal to zero is reported as not_applicable_zero_debt. The analyzer never emits infinity or a fabricated numeric health factor.",
      historyRule:
        "Minimum health factor uses only identity-, scale-, age-, and source-compatible observations at or before the current block. It remains unavailable unless the series is complete, meets count/duration requirements, and contains an exact current-block aggregate.",
      officialSources: [
        "https://docs-v4.venus.io/guides/liquidation",
        "https://docs-v4.venus.io/whats-new/e-mode",
        "https://raw.githubusercontent.com/VenusProtocol/venus-protocol/develop/contracts/Lens/ComptrollerLens.sol"
      ]
    },
    limitations: [
      "The analyzer records caller-supplied source locators and receipts but does not fetch, authenticate, or independently attest them.",
      "A computed ratio is not marketplace- or activation-eligible: sourceContentsVerified and freshnessAttestedByAgent remain false.",
      "A health factor above one does not prove that a Venus account cannot be liquidated: forced-liquidation settings and other protocol conditions must be checked separately.",
      "Oracle validity, E-Mode membership and fallback, market listing, pauses, liquidation incentive, close factor, interest accrued after the observed block, and transaction feasibility are not inferred.",
      "Historical observations are aggregates supplied by the caller; minimum health factor is unknown when the configured window is incomplete or invalid.",
      "Alert receipts are only structurally and contextually validated. Execution receipt fields remain unverified caller claims because this offline analyzer cannot authenticate the transaction hash or status.",
      "The result is read-only decision support; it cannot hold a wallet, sign, repay, add collateral, liquidate, or submit a transaction.",
      "No APY, PnL, success rate, avoided liquidation, or other performance claim is calculated or inferred."
    ]
  };

  return healthFactorAnalysisResultSchema.parse(result);
}

export interface HealthFactorInputError {
  error: "INVALID_ANALYSIS_INPUT";
  issues: Array<{ path: string; message: string }>;
  sourceContentsVerified: false;
  freshnessAttestedByAgent: false;
  marketplaceEligible: false;
  activationEligible: false;
  executionEnabled: false;
}

export function handleHealthFactorA2a(
  data: Record<string, unknown>
): HealthFactorAnalysisResult | HealthFactorInputError {
  if (data.skill !== HEALTH_FACTOR_SKILL) {
    return invalidInput([{ path: "skill", message: `expected ${HEALTH_FACTOR_SKILL}` }]);
  }
  const { skill: _skill, ...input } = data;
  void _skill;
  const parsed = healthFactorAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidInput(
      parsed.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message.slice(0, 240)
      }))
    );
  }
  return analyzeHealthFactor(parsed.data);
}

export function handleHealthFactorMcp(rawInput: unknown): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
} {
  const result = analyzeHealthFactor(rawInput);
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: { ...result }
  };
}

function normalizeInput(input: HealthFactorAnalysisInput): NormalizedInput {
  return {
    methodology: input.methodology ?? null,
    currentSnapshot: input.currentSnapshot ?? null,
    observationSeries: input.observationSeries ?? null,
    policy: input.policy ?? null,
    alertReceipts: input.alertReceipts ?? null,
    alertReceiptsComplete: input.alertReceiptsComplete ?? null,
    executionReceipts: input.executionReceipts ?? null
  };
}

interface CurrentReview {
  valid: boolean;
  violations: Violation[];
  provenance: Provenance[];
}

function reviewCurrentEvidence(
  input: HealthFactorAnalysisInput,
  normalized: NormalizedInput
): CurrentReview {
  const violations: Violation[] = [];
  const provenance: Provenance[] = [];
  const methodology = normalized.methodology;
  const snapshot = normalized.currentSnapshot;
  const policy = normalized.policy;

  if (methodology === null) {
    addViolation(
      violations,
      "current_evidence",
      "MISSING_METHODOLOGY",
      "methodology",
      "Methodology evidence is missing."
    );
    provenance.push(missingProvenance("methodology"));
  }
  if (snapshot === null) {
    addViolation(
      violations,
      "current_evidence",
      "MISSING_CURRENT_SNAPSHOT",
      "currentSnapshot",
      "Current collateral/debt snapshot is missing."
    );
    provenance.push(missingProvenance("currentSnapshot"));
  }
  if (policy === null) {
    addViolation(
      violations,
      "current_evidence",
      "MISSING_POLICY",
      "policy",
      "User alert/intervention policy is missing."
    );
    provenance.push(missingProvenance("policy"));
  }
  if (methodology === null || snapshot === null || policy === null) {
    return { valid: false, violations, provenance };
  }

  if (!snapshot.collateralComplete) {
    addViolation(
      violations,
      "current_evidence",
      "COLLATERAL_ENUMERATION_INCOMPLETE",
      "currentSnapshot.collateralComplete",
      "Collateral enumeration is not declared complete."
    );
  }
  if (!snapshot.debtComplete) {
    addViolation(
      violations,
      "current_evidence",
      "DEBT_ENUMERATION_INCOMPLETE",
      "currentSnapshot.debtComplete",
      "Debt enumeration is not declared complete."
    );
  }

  const reference = {
    chainId: input.chainId,
    account: input.account,
    blockNumber: snapshot.blockNumber,
    blockHash: snapshot.blockHash,
    quoteScale: methodology.quoteValueScaleDecimals,
    thresholdScale: methodology.liquidationThresholdScaleDecimals,
    analysisAtUtc: input.analysisAtUtc,
    maximumAgeSeconds: policy.maximumCurrentEvidenceAgeSeconds,
    futureToleranceSeconds: policy.futureToleranceSeconds
  };

  provenance.push(
    reviewTimedBlockEvidence("methodology", methodology, reference, violations),
    reviewTimedBlockEvidence("currentSnapshot", snapshot, reference, violations)
  );
  reviewPolicyTime(input.analysisAtUtc, policy, violations, provenance);

  const collateralVTokens = snapshot.collateralPositions.map(({ vTokenAddress }) => vTokenAddress);
  const debtVTokens = snapshot.debtPositions.map(({ vTokenAddress }) => vTokenAddress);
  if (!sameAddressSet(methodology.source.collateralVTokenAddresses, collateralVTokens)) {
    addViolation(
      violations,
      "current_evidence",
      "SOURCE_RELATION_MISMATCH",
      "methodology.source.collateralVTokenAddresses",
      "Methodology threshold sources must bind exactly the enumerated collateral vTokens."
    );
  }
  if (
    !sameAddressSet(snapshot.source.collateralVTokenAddresses, collateralVTokens) ||
    !sameAddressSet(snapshot.source.debtVTokenAddresses, debtVTokens)
  ) {
    addViolation(
      violations,
      "current_evidence",
      "SOURCE_RELATION_MISMATCH",
      "currentSnapshot.source",
      "Snapshot source must bind exactly the enumerated collateral and debt vTokens."
    );
  }

  const seenCollateral = new Set<string>();
  snapshot.collateralPositions.forEach((position, index) => {
    const path = `currentSnapshot.collateralPositions.${String(index)}`;
    const positionProvenance = reviewTimedBlockEvidence(path, position, reference, violations);
    if (position.liquidationThresholdScaleDecimals !== reference.thresholdScale) {
      positionProvenance.state = "scale_mismatch";
      addViolation(
        violations,
        "current_evidence",
        "SCALE_MISMATCH",
        path,
        "Collateral quote-value or liquidation-threshold scale does not match methodology."
      );
    }
    if (
      !sameAddress(position.source.vTokenAddress, position.vTokenAddress) ||
      position.source.market !== position.market ||
      position.source.underlyingAsset !== position.underlyingAsset
    ) {
      positionProvenance.state = "identity_mismatch";
      addViolation(
        violations,
        "current_evidence",
        "SOURCE_RELATION_MISMATCH",
        `${path}.source`,
        "Collateral source market, asset, or vToken does not match the position."
      );
    }
    try {
      const derived = deriveVenusCollateralValues(position);
      if (
        position.collateralValueRaw !== derived.collateralValueRaw.toString() ||
        position.adjustedCollateralValueRaw !== derived.adjustedCollateralValueRaw.toString()
      ) {
        positionProvenance.state = "identity_mismatch";
        addViolation(
          violations,
          "current_evidence",
          "DERIVED_VALUE_MISMATCH",
          path,
          "Collateral values do not match the raw Venus operands and exact ComptrollerLens truncation order."
        );
      }
    } catch (error) {
      if (!isVenusArithmeticOverflow(error)) throw error;
      positionProvenance.state = "identity_mismatch";
      addViolation(
        violations,
        "current_evidence",
        "VENUS_ARITHMETIC_OVERFLOW",
        path,
        "Collateral raw operands overflow uint256 in the Venus multiplication sequence."
      );
    }
    provenance.push(positionProvenance);
    const key = position.vTokenAddress.toLowerCase();
    if (seenCollateral.has(key)) {
      addViolation(
        violations,
        "current_evidence",
        "DUPLICATE_POSITION",
        path,
        "Duplicate collateral vToken position."
      );
    }
    seenCollateral.add(key);
  });

  const seenDebt = new Set<string>();
  snapshot.debtPositions.forEach((position, index) => {
    const path = `currentSnapshot.debtPositions.${String(index)}`;
    const positionProvenance = reviewTimedBlockEvidence(path, position, reference, violations);
    if (
      !sameAddress(position.source.vTokenAddress, position.vTokenAddress) ||
      position.source.market !== position.market ||
      position.source.underlyingAsset !== position.underlyingAsset
    ) {
      positionProvenance.state = "identity_mismatch";
      addViolation(
        violations,
        "current_evidence",
        "SOURCE_RELATION_MISMATCH",
        `${path}.source`,
        "Debt source market, asset, or vToken does not match the position."
      );
    }
    try {
      const derivedDebtValueRaw = deriveVenusDebtValue(position);
      if (position.debtValueRaw !== derivedDebtValueRaw.toString()) {
        positionProvenance.state = "identity_mismatch";
        addViolation(
          violations,
          "current_evidence",
          "DERIVED_VALUE_MISMATCH",
          path,
          "Debt value does not match the raw Venus borrow balance, oracle price, and exact truncation order."
        );
      }
    } catch (error) {
      if (!isVenusArithmeticOverflow(error)) throw error;
      positionProvenance.state = "identity_mismatch";
      addViolation(
        violations,
        "current_evidence",
        "VENUS_ARITHMETIC_OVERFLOW",
        path,
        "Debt raw operands overflow uint256 in the Venus multiplication sequence."
      );
    }
    provenance.push(positionProvenance);
    const key = position.vTokenAddress.toLowerCase();
    if (seenDebt.has(key)) {
      addViolation(
        violations,
        "current_evidence",
        "DUPLICATE_POSITION",
        path,
        "Duplicate debt vToken position."
      );
    }
    seenDebt.add(key);
  });

  const aggregates = calculateCurrent(snapshot);
  if (aggregates.adjustedCollateralValueRaw > MAX_UINT256) {
    addViolation(
      violations,
      "current_evidence",
      "ADJUSTED_COLLATERAL_AGGREGATE_EXCEEDS_UINT256",
      "currentSnapshot.collateralPositions",
      "Summed adjusted collateral exceeds uint256; current health factor is withheld."
    );
  }
  if (aggregates.totalDebtValueRaw > MAX_UINT256) {
    addViolation(
      violations,
      "current_evidence",
      "DEBT_AGGREGATE_EXCEEDS_UINT256",
      "currentSnapshot.debtPositions",
      "Summed debt exceeds uint256; current health factor is withheld."
    );
  }

  return { valid: violations.length === 0, violations, provenance };
}

interface BlockEvidence {
  chainId: 56 | 97;
  account: string;
  blockNumber: string;
  blockHash: string;
  observedAtUtc: string;
  quoteValueUnit: "usd";
  quoteValueScaleDecimals: number;
  source: z.infer<typeof venusOnchainSourceSchema>;
}

interface EvidenceReference {
  chainId: 56 | 97;
  account: string;
  blockNumber: string;
  blockHash: string;
  quoteScale: number;
  thresholdScale: number;
  analysisAtUtc: string;
  maximumAgeSeconds: number;
  futureToleranceSeconds: number;
}

function reviewTimedBlockEvidence(
  path: string,
  evidence: BlockEvidence,
  reference: EvidenceReference,
  violations: Violation[]
): Provenance {
  const states: Provenance["state"][] = [];
  if (evidence.chainId !== reference.chainId) {
    states.push("identity_mismatch");
    addViolation(
      violations,
      "current_evidence",
      "CHAIN_MISMATCH",
      path,
      "Evidence chainId does not match the requested chain."
    );
  }
  if (!sameAddress(evidence.account, reference.account)) {
    states.push("identity_mismatch");
    addViolation(
      violations,
      "current_evidence",
      "ACCOUNT_MISMATCH",
      path,
      "Evidence account does not match the requested account."
    );
  }
  if (
    evidence.blockNumber !== reference.blockNumber ||
    !sameHex(evidence.blockHash, reference.blockHash)
  ) {
    states.push("block_mismatch");
    addViolation(
      violations,
      "current_evidence",
      "BLOCK_MISMATCH",
      path,
      "Evidence does not match the current snapshot block number and hash."
    );
  }
  if (
    evidence.quoteValueScaleDecimals !== reference.quoteScale ||
    evidence.source.quoteValueScaleDecimals !== evidence.quoteValueScaleDecimals
  ) {
    states.push("scale_mismatch");
    addViolation(
      violations,
      "current_evidence",
      "SCALE_MISMATCH",
      path,
      "Evidence and its source do not share the methodology quote-value scale."
    );
  }
  if (!sameAddress(evidence.source.comptrollerAddress, officialComptroller(evidence.chainId))) {
    states.push("identity_mismatch");
    addViolation(
      violations,
      "current_evidence",
      "OFFICIAL_COMPTROLLER_MISMATCH",
      `${path}.source.comptrollerAddress`,
      "Source does not bind the official Venus Core Pool Comptroller for this chain."
    );
  }
  if (
    evidence.source.chainId !== evidence.chainId ||
    evidence.source.blockNumber !== evidence.blockNumber ||
    !sameHex(evidence.source.blockHash, evidence.blockHash)
  ) {
    states.push("block_mismatch");
    addViolation(
      violations,
      "current_evidence",
      "BLOCK_MISMATCH",
      `${path}.source`,
      "Onchain source identity does not match its evidence item."
    );
  }
  if (
    !sameAddress(evidence.source.account, evidence.account) ||
    !sameInstant(evidence.source.blockTimestampUtc, evidence.observedAtUtc)
  ) {
    states.push("identity_mismatch");
    addViolation(
      violations,
      "current_evidence",
      "SOURCE_RELATION_MISMATCH",
      `${path}.source`,
      "Onchain source account or block timestamp does not match its evidence item."
    );
  }
  const timing = timingState(
    evidence.observedAtUtc,
    reference.analysisAtUtc,
    reference.maximumAgeSeconds,
    reference.futureToleranceSeconds
  );
  if (timing.state === "stale") {
    states.push("stale");
    addViolation(
      violations,
      "current_evidence",
      "SOURCE_STALE",
      path,
      "Evidence exceeds maximumCurrentEvidenceAgeSeconds."
    );
  } else if (timing.state === "future") {
    states.push("future");
    addViolation(
      violations,
      "current_evidence",
      "SOURCE_IN_FUTURE",
      path,
      "Evidence is ahead of analysisAtUtc beyond futureToleranceSeconds."
    );
  }
  return {
    path,
    state: states[0] ?? "fresh",
    blockNumber: evidence.blockNumber,
    blockHash: evidence.blockHash,
    observedAtUtc: evidence.observedAtUtc,
    ageSeconds: timing.ageSeconds,
    source: evidence.source
  };
}

function reviewPolicyTime(
  analysisAtUtc: string,
  policy: z.infer<typeof guardianPolicySchema>,
  violations: Violation[],
  provenance: Provenance[]
): void {
  const timing = timingState(
    policy.configuredAtUtc,
    analysisAtUtc,
    policy.maximumCurrentEvidenceAgeSeconds,
    policy.futureToleranceSeconds
  );
  if (timing.state === "stale") {
    addViolation(
      violations,
      "current_evidence",
      "SOURCE_STALE",
      "policy",
      "Policy configuration exceeds maximumCurrentEvidenceAgeSeconds."
    );
  } else if (timing.state === "future") {
    addViolation(
      violations,
      "current_evidence",
      "SOURCE_IN_FUTURE",
      "policy",
      "Policy configuration is ahead of analysisAtUtc beyond tolerance."
    );
  }
  provenance.push({
    path: "policy",
    state: timing.state,
    blockNumber: null,
    blockHash: null,
    observedAtUtc: policy.configuredAtUtc,
    ageSeconds: timing.ageSeconds,
    source: policy.source
  });
}

function calculateCurrent(snapshot: z.infer<typeof currentSnapshotSchema>): CurrentCalculation {
  let totalCollateralValueRaw = 0n;
  let adjustedCollateralValueRaw = 0n;
  for (const position of snapshot.collateralPositions) {
    const value = BigInt(position.collateralValueRaw);
    totalCollateralValueRaw += value;
    adjustedCollateralValueRaw += BigInt(position.adjustedCollateralValueRaw);
  }
  let totalDebtValueRaw = 0n;
  for (const position of snapshot.debtPositions) {
    totalDebtValueRaw += BigInt(position.debtValueRaw);
  }
  return {
    adjustedCollateralValueRaw,
    totalCollateralValueRaw,
    totalDebtValueRaw,
    ratio:
      totalDebtValueRaw === 0n
        ? null
        : {
            numerator: adjustedCollateralValueRaw,
            denominator: totalDebtValueRaw
          }
  };
}

function checkedVenusMulExp(left: bigint, right: bigint): bigint {
  if (left !== 0n && right > MAX_UINT256 / left) {
    throw new Error("VENUS_UINT256_OVERFLOW");
  }
  return (left * right) / OFFICIAL_THRESHOLD_DENOMINATOR;
}

function deriveVenusCollateralValues(position: {
  vTokenBalanceRaw: string;
  exchangeRateMantissaRaw: string;
  oraclePriceMantissaRaw: string;
  effectiveLiquidationThresholdRaw: string;
}): { collateralValueRaw: bigint; adjustedCollateralValueRaw: bigint } {
  const balance = BigInt(position.vTokenBalanceRaw);
  const exchangeRate = BigInt(position.exchangeRateMantissaRaw);
  const price = BigInt(position.oraclePriceMantissaRaw);
  const threshold = BigInt(position.effectiveLiquidationThresholdRaw);
  return {
    collateralValueRaw: checkedVenusMulExp(checkedVenusMulExp(exchangeRate, price), balance),
    adjustedCollateralValueRaw: checkedVenusMulExp(
      checkedVenusMulExp(checkedVenusMulExp(threshold, exchangeRate), price),
      balance
    )
  };
}

function deriveVenusDebtValue(position: {
  borrowBalanceRaw: string;
  oraclePriceMantissaRaw: string;
}): bigint {
  return checkedVenusMulExp(
    BigInt(position.oraclePriceMantissaRaw),
    BigInt(position.borrowBalanceRaw)
  );
}

function isVenusArithmeticOverflow(error: unknown): boolean {
  return error instanceof Error && error.message === "VENUS_UINT256_OVERFLOW";
}

function currentMeasure(
  calculation: CurrentCalculation | null,
  scaleDecimals: number | null
): HealthFactorMeasure {
  if (calculation === null || scaleDecimals === null) {
    return unavailableMeasure(
      scaleDecimals,
      "Current health factor is unavailable because required current evidence is incomplete or incompatible."
    );
  }
  if (calculation.totalDebtValueRaw === 0n) {
    return zeroDebtMeasure(scaleDecimals);
  }
  return computedMeasure(calculation.ratio as Ratio, scaleDecimals);
}

interface HistoryReview {
  status: "sufficient" | "insufficient" | "unavailable";
  observations: ObservationResult[];
  usable: Array<{ evidence: z.infer<typeof observationSchema>; ratio: Ratio | null }>;
  includesCurrent: boolean;
  windowStartUtc: string | null;
  windowEndUtc: string | null;
  windowSeconds: number | null;
  minimum: {
    measure: HealthFactorMeasure;
    observedAtUtc: string | null;
    blockNumber: string | null;
  };
}

function reviewHistory(
  input: HealthFactorAnalysisInput,
  normalized: NormalizedInput,
  current: CurrentCalculation | null,
  violations: Violation[]
): HistoryReview {
  const series = normalized.observationSeries;
  const methodology = normalized.methodology;
  const snapshot = normalized.currentSnapshot;
  const policy = normalized.policy;
  if (series === null || methodology === null || snapshot === null || policy === null) {
    addViolation(
      violations,
      "history",
      "HISTORY_MISSING",
      "observationSeries",
      "Observation history or its required context is missing."
    );
    return emptyHistory(policy?.healthFactorScaleDecimals ?? null);
  }
  if (!series.complete) {
    addViolation(
      violations,
      "history",
      "HISTORY_ENUMERATION_INCOMPLETE",
      "observationSeries.complete",
      "Observation series is not declared complete."
    );
  }

  const seenBlocks = new Set<string>();
  const results: ObservationResult[] = [];
  const usable: HistoryReview["usable"] = [];
  for (const observation of series.observations) {
    const issues: string[] = [];
    if (observation.chainId !== input.chainId || !sameAddress(observation.account, input.account)) {
      issues.push("Observation chain or account does not match the request.");
    }
    if (
      observation.liquidationThresholdScaleDecimals !==
      methodology.liquidationThresholdScaleDecimals
    ) {
      issues.push("Observation fixed-point scales do not match methodology.");
    }
    if (
      observation.source.chainId !== observation.chainId ||
      observation.source.blockNumber !== observation.blockNumber ||
      !sameHex(observation.source.blockHash, observation.blockHash) ||
      !sameAddress(observation.source.account, observation.account) ||
      !sameInstant(observation.source.blockTimestampUtc, observation.observedAtUtc)
    ) {
      issues.push("Observation onchain source does not match its block, account, or timestamp.");
    }
    if (
      !sameAddress(observation.source.comptrollerAddress, officialComptroller(observation.chainId))
    ) {
      issues.push("Observation source does not bind the official chain Comptroller.");
    }
    if (
      hasDuplicateAddress(observation.source.collateralVTokenAddresses) ||
      hasDuplicateAddress(observation.source.debtVTokenAddresses)
    ) {
      issues.push("Observation source contains duplicate vToken relationships.");
    }
    const timing = timingState(
      observation.observedAtUtc,
      input.analysisAtUtc,
      policy.maximumObservationAgeSeconds,
      policy.futureToleranceSeconds
    );
    if (timing.state === "stale") issues.push("Observation exceeds maximumObservationAgeSeconds.");
    if (timing.state === "future") issues.push("Observation is future-dated beyond tolerance.");
    if (BigInt(observation.blockNumber) > BigInt(snapshot.blockNumber)) {
      issues.push("Observation block is after the current snapshot block.");
    }
    if (Date.parse(observation.observedAtUtc) > Date.parse(snapshot.observedAtUtc)) {
      issues.push("Observation time is after the current snapshot observation time.");
    }
    const blockKey = `${observation.blockNumber}:${observation.blockHash.toLowerCase()}`;
    if (seenBlocks.has(blockKey)) {
      issues.push("Observation block number and hash are duplicated.");
      addViolation(
        violations,
        "history",
        "HISTORY_DUPLICATE_BLOCK",
        "observationSeries.observations",
        "Duplicate observation block identity."
      );
    }
    seenBlocks.add(blockKey);

    const debt = BigInt(observation.debtValueRaw);
    const ratio =
      debt === 0n
        ? null
        : {
            numerator: BigInt(observation.adjustedCollateralValueRaw),
            denominator: debt
          };
    const measure =
      issues.length === 0
        ? debt === 0n
          ? zeroDebtMeasure(policy.healthFactorScaleDecimals)
          : computedMeasure(ratio as Ratio, policy.healthFactorScaleDecimals)
        : unavailableMeasure(
            policy.healthFactorScaleDecimals,
            "Observation health factor is unavailable because this observation is invalid."
          );
    results.push({
      evidence: observation,
      state: issues.length === 0 ? "usable" : "invalid",
      issues,
      healthFactor: measure
    });
    if (issues.length === 0) usable.push({ evidence: observation, ratio });
    else
      addViolation(
        violations,
        "history",
        "HISTORY_OBSERVATION_INVALID",
        `observationSeries.observations.${String(results.length - 1)}`,
        issues[0] ?? "Invalid observation."
      );
  }

  let includesCurrent = false;
  if (current !== null) {
    const currentObservation = usable.find(
      ({ evidence }) =>
        evidence.blockNumber === snapshot.blockNumber &&
        sameHex(evidence.blockHash, snapshot.blockHash)
    );
    if (currentObservation === undefined) {
      addViolation(
        violations,
        "history",
        "HISTORY_CURRENT_OBSERVATION_MISSING",
        "observationSeries",
        "Observation series does not contain the current snapshot block."
      );
    } else if (
      currentObservation.evidence.adjustedCollateralValueRaw !==
        current.adjustedCollateralValueRaw.toString() ||
      currentObservation.evidence.debtValueRaw !== current.totalDebtValueRaw.toString() ||
      !sameAddressSet(
        currentObservation.evidence.source.collateralVTokenAddresses,
        snapshot.source.collateralVTokenAddresses
      ) ||
      !sameAddressSet(
        currentObservation.evidence.source.debtVTokenAddresses,
        snapshot.source.debtVTokenAddresses
      )
    ) {
      addViolation(
        violations,
        "history",
        "HISTORY_CURRENT_OBSERVATION_MISMATCH",
        "observationSeries",
        "Current-block observation does not exactly match the computed current aggregate."
      );
    } else {
      includesCurrent = true;
    }
  }

  const sorted = [...usable].sort(compareObservation);
  const windowStartUtc = sorted[0]?.evidence.observedAtUtc ?? null;
  const windowEndUtc = sorted.at(-1)?.evidence.observedAtUtc ?? null;
  const windowSeconds =
    windowStartUtc === null || windowEndUtc === null
      ? null
      : Math.max(0, Math.floor((Date.parse(windowEndUtc) - Date.parse(windowStartUtc)) / 1_000));
  if (usable.length < policy.minimumHistoryObservations) {
    addViolation(
      violations,
      "history",
      "HISTORY_COUNT_INSUFFICIENT",
      "observationSeries",
      "Usable observation count is below minimumHistoryObservations."
    );
  }
  if (windowSeconds === null || windowSeconds < policy.minimumObservationWindowSeconds) {
    addViolation(
      violations,
      "history",
      "HISTORY_WINDOW_INSUFFICIENT",
      "observationSeries",
      "Usable observation window is shorter than minimumObservationWindowSeconds."
    );
  }

  const sufficient =
    series.complete &&
    includesCurrent &&
    usable.length >= policy.minimumHistoryObservations &&
    windowSeconds !== null &&
    windowSeconds >= policy.minimumObservationWindowSeconds;
  const minimumEntry = minimumObservation(usable);
  const minimum = !sufficient
    ? {
        measure: unavailableMeasure(
          policy.healthFactorScaleDecimals,
          "Minimum health factor is unavailable because the configured observation window is incomplete or invalid."
        ),
        observedAtUtc: null,
        blockNumber: null
      }
    : minimumEntry === null
      ? {
          measure: zeroDebtMeasure(policy.healthFactorScaleDecimals),
          observedAtUtc: sorted[0]?.evidence.observedAtUtc ?? null,
          blockNumber: sorted[0]?.evidence.blockNumber ?? null
        }
      : {
          measure: computedMeasure(minimumEntry.ratio as Ratio, policy.healthFactorScaleDecimals),
          observedAtUtc: minimumEntry.evidence.observedAtUtc,
          blockNumber: minimumEntry.evidence.blockNumber
        };
  return {
    status: sufficient ? "sufficient" : "insufficient",
    observations: results,
    usable,
    includesCurrent,
    windowStartUtc,
    windowEndUtc,
    windowSeconds,
    minimum
  };
}

function emptyHistory(scaleDecimals: number | null): HistoryReview {
  return {
    status: "unavailable",
    observations: [],
    usable: [],
    includesCurrent: false,
    windowStartUtc: null,
    windowEndUtc: null,
    windowSeconds: null,
    minimum: {
      measure: unavailableMeasure(
        scaleDecimals,
        "Minimum health factor is unavailable because observation history is missing."
      ),
      observedAtUtc: null,
      blockNumber: null
    }
  };
}

interface AlertLatencyReview {
  status: "within_limit" | "breach" | "insufficient_evidence" | "not_required";
  receipts: AlertReceiptResult[];
  valid: AlertReceiptResult[];
  triggerObservationCount: number;
  coveredTriggerCount: number;
  maximumObservedMilliseconds: bigint | null;
}

function reviewAlertLatency(
  input: HealthFactorAnalysisInput,
  normalized: NormalizedInput,
  history: HistoryReview,
  violations: Violation[]
): AlertLatencyReview {
  const policy = normalized.policy;
  if (policy === null) {
    return {
      status: "insufficient_evidence",
      receipts: [],
      valid: [],
      triggerObservationCount: 0,
      coveredTriggerCount: 0,
      maximumObservedMilliseconds: null
    };
  }
  const triggerObservations = history.observations.filter(
    (observation) =>
      observation.state === "usable" &&
      observation.healthFactor.state === "computed" &&
      measureAtOrBelow(
        observation.healthFactor,
        policy.alertHealthFactorRaw,
        policy.healthFactorScaleDecimals
      )
  );
  const seenReceiptIds = new Set<string>();
  const seenTriggerBlocks = new Set<string>();
  const receipts = (normalized.alertReceipts ?? []).map((receipt): AlertReceiptResult => {
    const issues: string[] = [];
    if (seenReceiptIds.has(receipt.receiptId)) {
      issues.push("Alert receiptId is duplicated.");
    }
    seenReceiptIds.add(receipt.receiptId);
    if (receipt.chainId !== input.chainId || !sameAddress(receipt.account, input.account)) {
      issues.push("Alert receipt chain or account does not match the request.");
    }
    const triggerKey = blockIdentity(receipt.triggerBlockNumber, receipt.triggerBlockHash);
    if (seenTriggerBlocks.has(triggerKey)) {
      issues.push("More than one alert receipt references the same trigger observation.");
    }
    seenTriggerBlocks.add(triggerKey);
    const observation = history.observations.find(
      ({ evidence }) =>
        evidence.blockNumber === receipt.triggerBlockNumber &&
        sameHex(evidence.blockHash, receipt.triggerBlockHash)
    );
    if (observation === undefined || observation.state !== "usable") {
      issues.push("Alert receipt does not reference a usable observation.");
    } else {
      if (
        Date.parse(observation.evidence.observedAtUtc) !== Date.parse(receipt.triggerObservedAtUtc)
      ) {
        issues.push("Alert receipt trigger time does not match its observation.");
      }
      if (
        observation.healthFactor.state !== "computed" ||
        !measureAtOrBelow(
          observation.healthFactor,
          policy.alertHealthFactorRaw,
          policy.healthFactorScaleDecimals
        )
      ) {
        issues.push("Referenced observation does not cross the configured alert threshold.");
      }
    }
    const latency = Date.parse(receipt.deliveredAtUtc) - Date.parse(receipt.triggerObservedAtUtc);
    if (latency < 0) issues.push("Alert delivery precedes its trigger.");
    if (
      Date.parse(receipt.deliveredAtUtc) >
      Date.parse(input.analysisAtUtc) + policy.futureToleranceSeconds * 1_000
    ) {
      issues.push("Alert delivery is future-dated beyond tolerance.");
    }
    return {
      receipt,
      state: issues.length === 0 ? "valid" : "invalid",
      latencyMilliseconds: issues.length === 0 ? BigInt(latency).toString() : null,
      issues
    };
  });
  const valid = receipts.filter(({ state }) => state === "valid");
  const coveredTriggers = new Set(
    valid.map(({ receipt }) => blockIdentity(receipt.triggerBlockNumber, receipt.triggerBlockHash))
  );
  for (const receipt of receipts.filter(({ state }) => state === "invalid")) {
    addViolation(
      violations,
      "alert_latency",
      "ALERT_RECEIPT_INVALID",
      `alertReceipts.${String(receipts.indexOf(receipt))}`,
      receipt.issues[0] ?? "Invalid alert receipt."
    );
  }
  const maximumObservedMilliseconds = valid.reduce<bigint | null>((maximum, receipt) => {
    const latency = BigInt(receipt.latencyMilliseconds ?? "0");
    return maximum === null || latency > maximum ? latency : maximum;
  }, null);
  if (policy.minimumAlertReceipts === 0 && valid.length === 0) {
    return {
      status: "not_required",
      receipts,
      valid,
      triggerObservationCount: triggerObservations.length,
      coveredTriggerCount: coveredTriggers.size,
      maximumObservedMilliseconds
    };
  }

  let evidenceComplete = true;
  if (normalized.alertReceiptsComplete !== true) {
    evidenceComplete = false;
    addViolation(
      violations,
      "alert_latency",
      "ALERT_RECEIPT_ENUMERATION_INCOMPLETE",
      "alertReceiptsComplete",
      "Alert receipt enumeration is not declared complete."
    );
  }
  if (history.status !== "sufficient") {
    evidenceComplete = false;
    addViolation(
      violations,
      "alert_latency",
      "ALERT_TRIGGER_COVERAGE_INCOMPLETE",
      "observationSeries",
      "Alert trigger coverage cannot be established without a sufficient complete observation window."
    );
  } else if (coveredTriggers.size !== triggerObservations.length) {
    evidenceComplete = false;
    addViolation(
      violations,
      "alert_latency",
      "ALERT_TRIGGER_COVERAGE_INCOMPLETE",
      "alertReceipts",
      "Every threshold-crossing observation must have exactly one context-valid alert receipt."
    );
  }
  if (receipts.some(({ state }) => state === "invalid")) evidenceComplete = false;
  if (valid.length < policy.minimumAlertReceipts) {
    evidenceComplete = false;
    addViolation(
      violations,
      "alert_latency",
      "ALERT_LATENCY_EVIDENCE_INSUFFICIENT",
      "alertReceipts",
      "Valid alert receipt count is below minimumAlertReceipts."
    );
  }
  const maximumAllowed = BigInt(policy.maximumAlertLatencySeconds) * 1_000n;
  if (maximumObservedMilliseconds !== null && maximumObservedMilliseconds > maximumAllowed) {
    addViolation(
      violations,
      "alert_latency",
      "ALERT_LATENCY_BREACH",
      "alertReceipts",
      "Observed alert latency exceeds maximumAlertLatencySeconds."
    );
    return {
      status: "breach",
      receipts,
      valid,
      triggerObservationCount: triggerObservations.length,
      coveredTriggerCount: coveredTriggers.size,
      maximumObservedMilliseconds
    };
  }
  if (!evidenceComplete) {
    return {
      status: "insufficient_evidence",
      receipts,
      valid,
      triggerObservationCount: triggerObservations.length,
      coveredTriggerCount: coveredTriggers.size,
      maximumObservedMilliseconds
    };
  }
  return {
    status: "within_limit",
    receipts,
    valid,
    triggerObservationCount: triggerObservations.length,
    coveredTriggerCount: coveredTriggers.size,
    maximumObservedMilliseconds
  };
}

function reviewExecutionHistory(
  input: HealthFactorAnalysisInput,
  normalized: NormalizedInput,
  violations: Violation[]
): HealthFactorAnalysisResult["executionHistory"] {
  const policy = normalized.policy;
  const seenTransactions = new Set<string>();
  const receipts: ExecutionReceiptResult[] = (normalized.executionReceipts ?? []).map((receipt) => {
    const issues: string[] = [];
    const transactionKey = receipt.transactionHash.toLowerCase();
    if (seenTransactions.has(transactionKey)) {
      issues.push("Execution transactionHash is duplicated.");
    }
    seenTransactions.add(transactionKey);
    if (receipt.chainId !== input.chainId || !sameAddress(receipt.account, input.account)) {
      issues.push("Execution receipt chain or account does not match the request.");
    }
    if (
      receipt.source.chainId !== receipt.chainId ||
      receipt.source.blockNumber !== receipt.blockNumber ||
      !sameHex(receipt.source.blockHash, receipt.blockHash) ||
      !sameAddress(receipt.source.account, receipt.account) ||
      !sameHex(receipt.source.transactionHash, receipt.transactionHash) ||
      !sameInstant(receipt.source.blockTimestampUtc, receipt.observedAtUtc) ||
      !sameAddress(receipt.source.comptrollerAddress, officialComptroller(receipt.chainId))
    ) {
      issues.push(
        "Execution receipt source does not match its official pool, account, transaction, block, or timestamp."
      );
    }
    const futureToleranceSeconds = policy?.futureToleranceSeconds ?? 0;
    if (
      Date.parse(receipt.observedAtUtc) >
      Date.parse(input.analysisAtUtc) + futureToleranceSeconds * 1_000
    ) {
      issues.push("Execution receipt is future-dated beyond tolerance.");
    }
    return {
      receipt,
      state: issues.length === 0 ? "context_consistent" : "invalid",
      issues
    };
  });
  receipts.forEach((receipt, index) => {
    if (receipt.state === "invalid") {
      addViolation(
        violations,
        "execution_history",
        "EXECUTION_RECEIPT_INVALID",
        `executionReceipts.${String(index)}`,
        receipt.issues[0] ?? "Invalid execution receipt."
      );
    }
  });
  const contextConsistent = receipts.filter(({ state }) => state === "context_consistent");
  const claimedSuccessful = contextConsistent.filter(({ receipt }) => receipt.status === "success");
  const claimedReverted = contextConsistent.filter(({ receipt }) => receipt.status === "reverted");
  const latest = [...contextConsistent].sort(
    (left, right) =>
      Date.parse(right.receipt.observedAtUtc) - Date.parse(left.receipt.observedAtUtc)
  )[0];
  const supplied = normalized.executionReceipts !== null && normalized.executionReceipts.length > 0;
  return {
    status: supplied ? "unknown_unverified_supplied_receipts" : "unknown_no_receipts",
    contextConsistentReceiptCount: contextConsistent.length,
    claimedSuccessReceiptCount: claimedSuccessful.length,
    claimedRevertedReceiptCount: claimedReverted.length,
    latestSuppliedTransactionHash: latest?.receipt.transactionHash ?? null,
    receipts,
    statement: supplied
      ? "Execution history remains unknown. Supplied transaction hashes and statuses are unverified caller claims; context consistency does not authenticate chain inclusion or outcome."
      : "Execution history is unknown because no execution receipt claim was supplied."
  };
}

function chooseDecision(
  currentValid: boolean,
  current: HealthFactorMeasure,
  history: HistoryReview,
  alertLatency: AlertLatencyReview,
  policy: z.infer<typeof guardianPolicySchema> | null
): HealthFactorAnalysisResult["decision"] {
  if (!currentValid || policy === null || current.state === "unavailable")
    return "insufficient_evidence";
  if (alertLatency.status === "breach") return "review_intervention";
  if (current.state === "not_applicable_zero_debt") return "hold";
  if (
    measureAtOrBelow(current, policy.interventionHealthFactorRaw, policy.healthFactorScaleDecimals)
  ) {
    return "review_intervention";
  }
  if (measureAtOrBelow(current, policy.alertHealthFactorRaw, policy.healthFactorScaleDecimals)) {
    return "monitor";
  }
  if (
    history.minimum.measure.state === "computed" &&
    measureAtOrBelow(
      history.minimum.measure,
      policy.alertHealthFactorRaw,
      policy.healthFactorScaleDecimals
    )
  ) {
    return "monitor";
  }
  if (history.status !== "sufficient" || alertLatency.status === "insufficient_evidence") {
    return "monitor";
  }
  return "hold";
}

function buildRationale(
  decision: HealthFactorAnalysisResult["decision"],
  current: HealthFactorMeasure,
  historyStatus: HistoryReview["status"],
  alertStatus: AlertLatencyReview["status"]
): string[] {
  const first: Record<HealthFactorAnalysisResult["decision"], string> = {
    insufficient_evidence:
      "Current health factor is withheld because required evidence is missing, stale, future-dated, cross-block, identity-mismatched, incomplete, or scale-incompatible.",
    review_intervention:
      "A current intervention threshold or alert-latency safety boundary is breached; human intervention review is warranted.",
    monitor:
      "Current or historical risk, alert evidence, or observation-window completeness requires continued monitoring.",
    hold:
      current.state === "not_applicable_zero_debt"
        ? "Complete current evidence shows zero debt, so numeric health factor is not applicable and no intervention review is triggered."
        : "Current and minimum observed health factors remain above configured thresholds with sufficient monitoring evidence."
  };
  return [
    first[decision],
    `Observation-window status is ${historyStatus}; alert-latency status is ${alertStatus}.`,
    "This decision does not authorize or perform repayment, collateral addition, liquidation, or any other transaction."
  ];
}

function computedMeasure(ratio: Ratio, scaleDecimals: number): HealthFactorMeasure {
  const scale = 10n ** BigInt(scaleDecimals);
  const scaledValueFloor = (ratio.numerator * scale) / ratio.denominator;
  return {
    state: "computed",
    numerator: ratio.numerator.toString(),
    denominator: ratio.denominator.toString(),
    scaleDecimals,
    scaledValueFloor: scaledValueFloor.toString(),
    decimalValueFloor: formatScaled(scaledValueFloor, scaleDecimals),
    rounding: "floor"
  };
}

function zeroDebtMeasure(scaleDecimals: number): HealthFactorMeasure {
  return {
    state: "not_applicable_zero_debt",
    numerator: null,
    denominator: null,
    scaleDecimals,
    scaledValueFloor: null,
    decimalValueFloor: null,
    rounding: null,
    statement:
      "Total debt is exactly zero; a numeric health factor is not applicable and infinity is not reported."
  };
}

function unavailableMeasure(scaleDecimals: number | null, statement: string): HealthFactorMeasure {
  return {
    state: "unavailable",
    numerator: null,
    denominator: null,
    scaleDecimals,
    scaledValueFloor: null,
    decimalValueFloor: null,
    rounding: null,
    statement
  };
}

function measureAtOrBelow(
  measure: z.infer<typeof computedHealthFactorSchema>,
  thresholdRaw: string,
  thresholdScaleDecimals: number
): boolean {
  return measure.numerator !== "0"
    ? BigInt(measure.numerator) * 10n ** BigInt(thresholdScaleDecimals) <=
        BigInt(measure.denominator) * BigInt(thresholdRaw)
    : true;
}

function minimumObservation(
  usable: HistoryReview["usable"]
): HistoryReview["usable"][number] | null {
  let minimum: HistoryReview["usable"][number] | null = null;
  for (const entry of usable) {
    if (entry.ratio === null) continue;
    if (
      minimum === null ||
      minimum.ratio === null ||
      entry.ratio.numerator * minimum.ratio.denominator <
        minimum.ratio.numerator * entry.ratio.denominator
    ) {
      minimum = entry;
    }
  }
  return minimum;
}

function compareObservation(
  left: HistoryReview["usable"][number],
  right: HistoryReview["usable"][number]
): number {
  const time = Date.parse(left.evidence.observedAtUtc) - Date.parse(right.evidence.observedAtUtc);
  if (time !== 0) return time;
  const leftBlock = BigInt(left.evidence.blockNumber);
  const rightBlock = BigInt(right.evidence.blockNumber);
  return leftBlock < rightBlock ? -1 : leftBlock > rightBlock ? 1 : 0;
}

function timingState(
  observedAtUtc: string,
  analysisAtUtc: string,
  maximumAgeSeconds: number,
  futureToleranceSeconds: number
): { state: "fresh" | "stale" | "future"; ageSeconds: number } {
  const ageMs = Date.parse(analysisAtUtc) - Date.parse(observedAtUtc);
  if (ageMs > maximumAgeSeconds * 1_000)
    return { state: "stale", ageSeconds: Math.floor(ageMs / 1_000) };
  if (ageMs < -futureToleranceSeconds * 1_000)
    return { state: "future", ageSeconds: Math.floor(ageMs / 1_000) };
  return { state: "fresh", ageSeconds: Math.floor(ageMs / 1_000) };
}

function formatScaled(value: bigint, scaleDecimals: number): string {
  if (scaleDecimals === 0) return value.toString();
  const digits = value.toString().padStart(scaleDecimals + 1, "0");
  const integer = digits.slice(0, -scaleDecimals);
  const fractional = digits.slice(-scaleDecimals).replace(/0+$/, "");
  return fractional.length === 0 ? integer : `${integer}.${fractional}`;
}

function missingProvenance(path: string): Provenance {
  return {
    path,
    state: "missing",
    blockNumber: null,
    blockHash: null,
    observedAtUtc: null,
    ageSeconds: null,
    source: null
  };
}

function addViolation(
  violations: Violation[],
  scope: Violation["scope"],
  code: Violation["code"],
  path: string,
  message: string
): void {
  violations.push({ scope, code, path, message });
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameHex(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function officialComptroller(chainId: 56 | 97): string {
  return VENUS_CORE_COMPTROLLER_BY_CHAIN[chainId];
}

function sameAddressSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length || hasDuplicateAddress(left) || hasDuplicateAddress(right)) {
    return false;
  }
  const expected = new Set(right.map((address) => address.toLowerCase()));
  return left.every((address) => expected.has(address.toLowerCase()));
}

function hasDuplicateAddress(addresses: readonly string[]): boolean {
  return new Set(addresses.map((address) => address.toLowerCase())).size !== addresses.length;
}

function blockIdentity(blockNumber: string, blockHash: string): string {
  return `${blockNumber}:${blockHash.toLowerCase()}`;
}

function invalidInput(issues: Array<{ path: string; message: string }>): HealthFactorInputError {
  return {
    error: "INVALID_ANALYSIS_INPUT",
    issues,
    sourceContentsVerified: false,
    freshnessAttestedByAgent: false,
    marketplaceEligible: false,
    activationEligible: false,
    executionEnabled: false
  };
}
