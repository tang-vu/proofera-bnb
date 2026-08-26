import { z } from "zod";

import { referenceCoverageForCategory } from "./reference-agent-coverage";

const configurableCategorySchema = z.enum([
  "grid-trading",
  "yield-optimisation",
  "health-factor-monitoring"
]);

export const configurableReferenceCategories = Object.freeze(configurableCategorySchema.options);
export type ReferenceConfigurationCategory = z.infer<typeof configurableCategorySchema>;
export type ReferenceConfigurationSearchParams = Record<string, string | string[] | undefined>;

const riskSchema = z.enum(["conservative", "balanced", "adventurous"]);
const networkSchema = z.enum(["bsc-mainnet", "bsc-testnet"]);
const MAX_UINT256 = (1n << 256n) - 1n;
const CANONICAL_DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/;

function decimalString(label: string, allowZero: boolean) {
  return z
    .string()
    .min(1, `${label} is required.`)
    .max(78, `${label} is too long.`)
    .regex(
      CANONICAL_DECIMAL_PATTERN,
      `${label} must be a canonical decimal string with at most 18 fractional digits.`
    )
    .refine((value) => allowZero || /[1-9]/.test(value), `${label} must be greater than zero.`);
}

function integerString(label: string, minimum: bigint, maximum: bigint) {
  return z
    .string()
    .min(1, `${label} is required.`)
    .max(20, `${label} is too long.`)
    .regex(/^(?:0|[1-9][0-9]*)$/, `${label} must be a canonical non-negative integer.`)
    .refine(
      (value) => {
        if (value.length > 20 || !/^(?:0|[1-9][0-9]*)$/.test(value)) return false;
        const parsed = BigInt(value);
        return parsed >= minimum && parsed <= maximum;
      },
      `${label} must be between ${minimum.toString(10)} and ${maximum.toString(10)}.`
    );
}

function uint256String(label: string, allowZero: boolean) {
  return z
    .string()
    .min(1, `${label} is required.`)
    .max(78, `${label} is too long.`)
    .regex(/^(?:0|[1-9][0-9]*)$/, `${label} must be a canonical uint256 integer string.`)
    .refine(
      (value) => {
        if (value.length > 78 || !/^(?:0|[1-9][0-9]*)$/.test(value)) return false;
        const parsed = BigInt(value);
        return parsed <= MAX_UINT256 && (allowZero || parsed > 0n);
      },
      `${label} must be a canonical integer from ${allowZero ? "0" : "1"} through 2^256 - 1.`
    );
}

const gridFormSchema = z
  .strictObject({
    capitalRaw: uint256String("Maximum strategy capital", false),
    network: networkSchema,
    risk: riskSchema,
    horizon: z.enum(["hours", "days", "weeks"]),
    asset: z.enum(["bnb-usdt", "cake-usdt", "bnb-cake"]),
    protocol: z.literal("pancakeswap-v3"),
    lowerPriceRaw: decimalString("Lower grid price", false),
    upperPriceRaw: decimalString("Upper grid price", false),
    gridLevels: integerString("Grid levels", 2n, 100n),
    maxDrawdownBps: integerString("Maximum drawdown", 1n, 10_000n),
    maxSlippageBps: integerString("Maximum slippage", 1n, 500n)
  })
  .superRefine((value, context) => {
    const comparison = compareCanonicalDecimalStrings(value.lowerPriceRaw, value.upperPriceRaw);
    if (comparison !== null && comparison >= 0) {
      context.addIssue({
        code: "custom",
        path: ["upperPriceRaw"],
        message: "Upper grid price must be greater than lower grid price."
      });
    }
  });

const yieldFormSchema = z
  .strictObject({
    capitalRaw: uint256String("Maximum allocation", false),
    network: networkSchema,
    risk: riskSchema,
    horizon: z.enum(["weeks", "months", "year-plus"]),
    asset: z.enum(["stablecoins", "bnb", "cake"]),
    protocol: z.enum(["lista", "venus", "pancakeswap"]),
    minimumNetApyBps: integerString("Minimum acceptable net APY", 0n, 10_000n),
    minimumWithdrawableBps: integerString("Minimum withdrawable share", 1n, 10_000n),
    maxGasCostRaw: uint256String("Maximum gas cost", true)
  })
  .superRefine((value, context) => {
    if (value.protocol === "lista" && value.network !== "bsc-mainnet") {
      context.addIssue({
        code: "custom",
        path: ["network"],
        message:
          "Lista source mandates require BSC mainnet; no official Lista testnet source is configured."
      });
    }
  });

const healthFormSchema = z
  .strictObject({
    capitalRaw: uint256String("Maximum intervention capital", false),
    network: networkSchema,
    risk: riskSchema,
    horizon: z.enum(["continuous", "days", "weeks"]),
    asset: z.enum(["mixed", "bnb", "stablecoins", "cake"]),
    protocol: z.literal("venus"),
    warningHealthFactorRaw: decimalString("Warning health factor", false),
    criticalHealthFactorRaw: decimalString("Critical health factor", false),
    targetHealthFactorRaw: decimalString("Target health factor", false),
    maxRepayRaw: uint256String("Maximum repay amount", true)
  })
  .superRefine((value, context) => {
    const criticalToOne = compareCanonicalDecimalStrings(value.criticalHealthFactorRaw, "1");
    if (criticalToOne !== null && criticalToOne <= 0) {
      context.addIssue({
        code: "custom",
        path: ["criticalHealthFactorRaw"],
        message: "Critical health factor must be greater than 1."
      });
    }
    const warningToCritical = compareCanonicalDecimalStrings(
      value.warningHealthFactorRaw,
      value.criticalHealthFactorRaw
    );
    if (warningToCritical !== null && warningToCritical <= 0) {
      context.addIssue({
        code: "custom",
        path: ["warningHealthFactorRaw"],
        message: "Warning health factor must be greater than critical health factor."
      });
    }
    const targetToWarning = compareCanonicalDecimalStrings(
      value.targetHealthFactorRaw,
      value.warningHealthFactorRaw
    );
    if (targetToWarning !== null && targetToWarning <= 0) {
      context.addIssue({
        code: "custom",
        path: ["targetHealthFactorRaw"],
        message: "Target health factor must be greater than warning health factor."
      });
    }
  });

export type GridConfigurationFormValues = Readonly<
  { category: "grid-trading" } & z.infer<typeof gridFormSchema>
>;
export type YieldConfigurationFormValues = Readonly<
  { category: "yield-optimisation" } & z.infer<typeof yieldFormSchema>
>;
export type HealthConfigurationFormValues = Readonly<
  { category: "health-factor-monitoring" } & z.infer<typeof healthFormSchema>
>;
export type ReferenceConfigurationFormValues =
  GridConfigurationFormValues | YieldConfigurationFormValues | HealthConfigurationFormValues;

export type ReferenceConfigurationQueryField =
  | "query"
  | Exclude<keyof GridConfigurationFormValues, "category">
  | Exclude<keyof YieldConfigurationFormValues, "category">
  | Exclude<keyof HealthConfigurationFormValues, "category">;

export interface ReferenceConfigurationIssue {
  readonly field: ReferenceConfigurationQueryField;
  readonly message: string;
}

export interface ReferenceConfigurationReadiness {
  readonly flags: Readonly<{
    trustedEvidenceReady: false;
    verifiedAgentIdentityReady: true;
    marketplaceEligibilityReady: false;
    permissionPreviewReady: false;
    scopedAuthorityReady: false;
    transactionReceiptReady: false;
    activationReady: false;
    executionReady: false;
    revokeReady: false;
  }>;
  readonly blockers: readonly Readonly<{
    code: "trusted_evidence_absent" | "scoped_authority_absent" | "transaction_receipt_absent";
    message: string;
  }>[];
  readonly boundary: Readonly<{
    rpcReadPerformed: false;
    httpFetchPerformed: false;
    walletAccessPerformed: false;
    environmentReadPerformed: false;
    writePerformed: false;
  }>;
}

export type ReferenceAgentConfiguration = Readonly<
  { schemaVersion: 1; chainId: 56 | 97 } & ReferenceConfigurationFormValues
>;

export type ReferenceConfigurationState =
  | Readonly<{
      status: "blank";
      category: ReferenceConfigurationCategory;
      formValues: ReferenceConfigurationFormValues;
    }>
  | Readonly<{
      status: "invalid";
      category: ReferenceConfigurationCategory;
      formValues: ReferenceConfigurationFormValues;
      issues: readonly ReferenceConfigurationIssue[];
    }>
  | Readonly<{
      status: "configured";
      category: ReferenceConfigurationCategory;
      formValues: ReferenceConfigurationFormValues;
      configuration: ReferenceAgentConfiguration;
      readiness: ReferenceConfigurationReadiness;
    }>;

const defaults = {
  "grid-trading": {
    category: "grid-trading",
    capitalRaw: "",
    network: "bsc-testnet",
    risk: "balanced",
    horizon: "days",
    asset: "bnb-usdt",
    protocol: "pancakeswap-v3",
    lowerPriceRaw: "",
    upperPriceRaw: "",
    gridLevels: "12",
    maxDrawdownBps: "1500",
    maxSlippageBps: "50"
  },
  "yield-optimisation": {
    category: "yield-optimisation",
    capitalRaw: "",
    network: "bsc-mainnet",
    risk: "balanced",
    horizon: "months",
    asset: "stablecoins",
    protocol: "lista",
    minimumNetApyBps: "300",
    minimumWithdrawableBps: "8000",
    maxGasCostRaw: ""
  },
  "health-factor-monitoring": {
    category: "health-factor-monitoring",
    capitalRaw: "",
    network: "bsc-testnet",
    risk: "conservative",
    horizon: "continuous",
    asset: "mixed",
    protocol: "venus",
    warningHealthFactorRaw: "1.30",
    criticalHealthFactorRaw: "1.15",
    targetHealthFactorRaw: "1.50",
    maxRepayRaw: ""
  }
} as const satisfies Record<ReferenceConfigurationCategory, ReferenceConfigurationFormValues>;

const fieldNames = {
  "grid-trading": Object.freeze([
    "capitalRaw",
    "network",
    "risk",
    "horizon",
    "asset",
    "protocol",
    "lowerPriceRaw",
    "upperPriceRaw",
    "gridLevels",
    "maxDrawdownBps",
    "maxSlippageBps"
  ]),
  "yield-optimisation": Object.freeze([
    "capitalRaw",
    "network",
    "risk",
    "horizon",
    "asset",
    "protocol",
    "minimumNetApyBps",
    "minimumWithdrawableBps",
    "maxGasCostRaw"
  ]),
  "health-factor-monitoring": Object.freeze([
    "capitalRaw",
    "network",
    "risk",
    "horizon",
    "asset",
    "protocol",
    "warningHealthFactorRaw",
    "criticalHealthFactorRaw",
    "targetHealthFactorRaw",
    "maxRepayRaw"
  ])
} as const satisfies Record<ReferenceConfigurationCategory, readonly string[]>;

const trustedEvidenceMessages: Readonly<Record<ReferenceConfigurationCategory, string>> =
  Object.freeze({
    "grid-trading":
      "No trusted pair identity, token decimals, current market/range observation, quote, liquidity, fill history, or cost evidence is attached.",
    "yield-optimisation":
      "No trusted protocol contract identity, current base/reward rate, liquidity, withdrawal constraint, route, token-decimal, or cost evidence is attached.",
    "health-factor-monitoring":
      "No trusted account, market contract, collateral, debt, oracle price, liquidation rule, observation window, or alert receipt is attached."
  });

export function isReferenceConfigurationCategory(
  input: unknown
): input is ReferenceConfigurationCategory {
  return configurableCategorySchema.safeParse(input).success;
}

export function parseReferenceAgentConfiguration(
  category: ReferenceConfigurationCategory,
  params: ReferenceConfigurationSearchParams
): ReferenceConfigurationState {
  const formValues = readFormValues(category, params);
  if (Object.keys(params).length === 0) {
    return deepFreeze({ status: "blank" as const, category, formValues });
  }

  const structure = structuralIssues(category, params);
  if (structure.length > 0) {
    return deepFreeze({
      status: "invalid" as const,
      category,
      formValues,
      issues: structure
    });
  }

  const parsed = schemaForCategory(category).safeParse(params);
  if (!parsed.success) {
    return deepFreeze({
      status: "invalid" as const,
      category,
      formValues,
      issues: dedupeIssues(
        parsed.error.issues.map((issue) => ({
          field: queryField(issue.path[0]),
          message:
            issue.code === "unrecognized_keys"
              ? "Only the allowlisted mandate fields for this category are accepted."
              : issue.message
        }))
      )
    });
  }

  const validatedFormValues = formValuesFromParsed(category, parsed.data);
  return deepFreeze({
    status: "configured" as const,
    category,
    formValues: validatedFormValues,
    configuration: {
      schemaVersion: 1 as const,
      chainId: validatedFormValues.network === "bsc-mainnet" ? (56 as const) : (97 as const),
      ...validatedFormValues
    },
    readiness: createReadiness(category)
  });
}

function schemaForCategory(category: ReferenceConfigurationCategory) {
  switch (category) {
    case "grid-trading":
      return gridFormSchema;
    case "yield-optimisation":
      return yieldFormSchema;
    case "health-factor-monitoring":
      return healthFormSchema;
  }
}

function formValuesFromParsed(
  category: ReferenceConfigurationCategory,
  parsed: Record<string, string>
): ReferenceConfigurationFormValues {
  switch (category) {
    case "grid-trading":
      return { category, ...(parsed as z.infer<typeof gridFormSchema>) };
    case "yield-optimisation":
      return { category, ...(parsed as z.infer<typeof yieldFormSchema>) };
    case "health-factor-monitoring":
      return { category, ...(parsed as z.infer<typeof healthFormSchema>) };
  }
}

function readFormValues(
  category: ReferenceConfigurationCategory,
  params: ReferenceConfigurationSearchParams
): ReferenceConfigurationFormValues {
  switch (category) {
    case "grid-trading": {
      const fallback = defaults["grid-trading"];
      return {
        category,
        capitalRaw: safeScalar(params.capitalRaw, fallback.capitalRaw),
        network: safeScalar(
          params.network,
          fallback.network
        ) as GridConfigurationFormValues["network"],
        risk: safeScalar(params.risk, fallback.risk) as GridConfigurationFormValues["risk"],
        horizon: safeScalar(
          params.horizon,
          fallback.horizon
        ) as GridConfigurationFormValues["horizon"],
        asset: safeScalar(params.asset, fallback.asset) as GridConfigurationFormValues["asset"],
        protocol: safeScalar(
          params.protocol,
          fallback.protocol
        ) as GridConfigurationFormValues["protocol"],
        lowerPriceRaw: safeScalar(params.lowerPriceRaw, fallback.lowerPriceRaw),
        upperPriceRaw: safeScalar(params.upperPriceRaw, fallback.upperPriceRaw),
        gridLevels: safeScalar(params.gridLevels, fallback.gridLevels),
        maxDrawdownBps: safeScalar(params.maxDrawdownBps, fallback.maxDrawdownBps),
        maxSlippageBps: safeScalar(params.maxSlippageBps, fallback.maxSlippageBps)
      };
    }
    case "yield-optimisation": {
      const fallback = defaults["yield-optimisation"];
      return {
        category,
        capitalRaw: safeScalar(params.capitalRaw, fallback.capitalRaw),
        network: safeScalar(
          params.network,
          fallback.network
        ) as YieldConfigurationFormValues["network"],
        risk: safeScalar(params.risk, fallback.risk) as YieldConfigurationFormValues["risk"],
        horizon: safeScalar(
          params.horizon,
          fallback.horizon
        ) as YieldConfigurationFormValues["horizon"],
        asset: safeScalar(params.asset, fallback.asset) as YieldConfigurationFormValues["asset"],
        protocol: safeScalar(
          params.protocol,
          fallback.protocol
        ) as YieldConfigurationFormValues["protocol"],
        minimumNetApyBps: safeScalar(params.minimumNetApyBps, fallback.minimumNetApyBps),
        minimumWithdrawableBps: safeScalar(
          params.minimumWithdrawableBps,
          fallback.minimumWithdrawableBps
        ),
        maxGasCostRaw: safeScalar(params.maxGasCostRaw, fallback.maxGasCostRaw)
      };
    }
    case "health-factor-monitoring": {
      const fallback = defaults["health-factor-monitoring"];
      return {
        category,
        capitalRaw: safeScalar(params.capitalRaw, fallback.capitalRaw),
        network: safeScalar(
          params.network,
          fallback.network
        ) as HealthConfigurationFormValues["network"],
        risk: safeScalar(params.risk, fallback.risk) as HealthConfigurationFormValues["risk"],
        horizon: safeScalar(
          params.horizon,
          fallback.horizon
        ) as HealthConfigurationFormValues["horizon"],
        asset: safeScalar(params.asset, fallback.asset) as HealthConfigurationFormValues["asset"],
        protocol: safeScalar(
          params.protocol,
          fallback.protocol
        ) as HealthConfigurationFormValues["protocol"],
        warningHealthFactorRaw: safeScalar(
          params.warningHealthFactorRaw,
          fallback.warningHealthFactorRaw
        ),
        criticalHealthFactorRaw: safeScalar(
          params.criticalHealthFactorRaw,
          fallback.criticalHealthFactorRaw
        ),
        targetHealthFactorRaw: safeScalar(
          params.targetHealthFactorRaw,
          fallback.targetHealthFactorRaw
        ),
        maxRepayRaw: safeScalar(params.maxRepayRaw, fallback.maxRepayRaw)
      };
    }
  }
}

function structuralIssues(
  category: ReferenceConfigurationCategory,
  params: ReferenceConfigurationSearchParams
): readonly ReferenceConfigurationIssue[] {
  const allowed = new Set<string>(fieldNames[category]);
  const issues: ReferenceConfigurationIssue[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (!allowed.has(key)) {
      issues.push({
        field: "query",
        message: "Only the allowlisted mandate fields for this category are accepted."
      });
    } else if (Array.isArray(value)) {
      issues.push({
        field: key as ReferenceConfigurationQueryField,
        message: "Each mandate field must appear exactly once."
      });
    }
  }
  return dedupeIssues(issues);
}

function createReadiness(
  category: ReferenceConfigurationCategory
): ReferenceConfigurationReadiness {
  const coverage = referenceCoverageForCategory(category);
  if (!coverage.erc8004Registered || !coverage.liveBscAgent) {
    throw new TypeError("Configured reference category lacks its required verified identity.");
  }
  return {
    flags: {
      trustedEvidenceReady: false,
      verifiedAgentIdentityReady: true,
      marketplaceEligibilityReady: false,
      permissionPreviewReady: false,
      scopedAuthorityReady: false,
      transactionReceiptReady: false,
      activationReady: false,
      executionReady: false,
      revokeReady: false
    },
    blockers: [
      { code: "trusted_evidence_absent", message: trustedEvidenceMessages[category] },
      {
        code: "scoped_authority_absent",
        message:
          "No connected wallet, permission preview, contract/function allowlist, spend cap, session expiry, signer, or revoke target exists."
      },
      {
        code: "transaction_receipt_absent",
        message:
          "No approval, grant, strategy action, transaction hash, explorer link, execution receipt, or revoke receipt exists."
      }
    ],
    boundary: {
      rpcReadPerformed: false,
      httpFetchPerformed: false,
      walletAccessPerformed: false,
      environmentReadPerformed: false,
      writePerformed: false
    }
  };
}

function queryField(path: PropertyKey | undefined): ReferenceConfigurationQueryField {
  return typeof path === "string" ? (path as ReferenceConfigurationQueryField) : "query";
}

function safeScalar(value: string | string[] | undefined, fallback: string): string {
  return typeof value === "string" && value.length <= 78 && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : fallback;
}

function dedupeIssues(
  issues: readonly ReferenceConfigurationIssue[]
): readonly ReferenceConfigurationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.field}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareCanonicalDecimalStrings(left: string, right: string): number | null {
  if (
    left.length > 78 ||
    right.length > 78 ||
    !CANONICAL_DECIMAL_PATTERN.test(left) ||
    !CANONICAL_DECIMAL_PATTERN.test(right)
  ) {
    return null;
  }
  const [leftWhole = "0", leftFraction = ""] = left.split(".");
  const [rightWhole = "0", rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftScaled = BigInt(leftWhole + leftFraction.padEnd(scale, "0"));
  const rightScaled = BigInt(rightWhole + rightFraction.padEnd(scale, "0"));
  return leftScaled < rightScaled ? -1 : leftScaled > rightScaled ? 1 : 0;
}

function deepFreeze<Value>(value: Value): Readonly<Value> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
