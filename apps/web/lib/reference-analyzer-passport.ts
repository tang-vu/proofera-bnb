import { z } from "zod";

import { referenceAgentCoverage, type ReferenceAgentCoverage } from "./reference-agent-coverage";

const referenceAnalyzerCategorySchema = z.enum([
  "lp-rebalancing",
  "grid-trading",
  "yield-optimisation",
  "health-factor-monitoring"
]);

export type ReferenceAnalyzerCategory = z.infer<typeof referenceAnalyzerCategorySchema>;

export const referenceAnalyzerMetricIds = Object.freeze({
  "lp-rebalancing": Object.freeze([
    "current_range_state",
    "in_range_time",
    "fee_apr",
    "estimated_impermanent_loss",
    "rebalance_frequency",
    "gas_drag",
    "net_performance",
    "execution_history"
  ]),
  "grid-trading": Object.freeze([
    "realized_pnl",
    "fills",
    "win_rate",
    "maximum_drawdown",
    "turnover",
    "configured_range",
    "all_in_costs",
    "execution_history"
  ]),
  "yield-optimisation": Object.freeze([
    "base_apy",
    "reward_apy",
    "net_apy",
    "tvl_liquidity",
    "protocol_exposure",
    "withdrawal_constraints",
    "route_history",
    "gas_impact"
  ]),
  "health-factor-monitoring": Object.freeze([
    "current_health_factor",
    "minimum_health_factor",
    "monitored_collateral",
    "monitored_debt",
    "alert_latency",
    "intervention_policy",
    "execution_history",
    "liquidation_risk_thresholds"
  ])
} as const satisfies Record<ReferenceAnalyzerCategory, readonly string[]>);

interface MetricSeed {
  readonly id: string;
  readonly label: string;
  readonly expectedEvidence: string;
  readonly decisionUse: string;
}

const implementedMetricIds: Readonly<Record<ReferenceAnalyzerCategory, readonly string[]>> =
  Object.freeze({
    "lp-rebalancing": Object.freeze(["current_range_state"]),
    "grid-trading": Object.freeze(["configured_range"]),
    "yield-optimisation": Object.freeze(["net_apy", "gas_impact"]),
    "health-factor-monitoring": Object.freeze([
      "current_health_factor",
      "minimum_health_factor",
      "alert_latency"
    ])
  });

const metricSeeds = {
  "lp-rebalancing": [
    {
      id: "current_range_state",
      label: "Current range state",
      expectedEvidence: "Position ticks joined to an exact-block Pancake V3 pool observation.",
      decisionUse: "Shows whether the position is in range before any rebalance is considered."
    },
    {
      id: "in_range_time",
      label: "In-range time",
      expectedEvidence:
        "A timestamped tick history and declared observation window for the position.",
      decisionUse: "Distinguishes persistent range fit from a single favorable observation."
    },
    {
      id: "fee_apr",
      label: "Fee APR",
      expectedEvidence:
        "Realized fee growth, capital basis, and observation-window annualization inputs.",
      decisionUse: "Separates realized fee economics from a headline or forecast rate."
    },
    {
      id: "estimated_impermanent_loss",
      label: "Estimated impermanent loss",
      expectedEvidence:
        "Position inventory, reference prices, valuation time, and declared IL method.",
      decisionUse: "Makes the principal tradeoff against fee income visible."
    },
    {
      id: "rebalance_frequency",
      label: "Rebalance frequency",
      expectedEvidence: "Decoded rebalance transactions over a declared observation window.",
      decisionUse: "Surfaces churn and operational burden instead of treating activity as success."
    },
    {
      id: "gas_drag",
      label: "Gas drag",
      expectedEvidence:
        "Transaction gas receipts, contemporaneous BNB prices, and reference capital.",
      decisionUse: "Shows how much execution cost consumed the position economics."
    },
    {
      id: "net_performance",
      label: "Net performance",
      expectedEvidence: "Terminal value, realized fees, IL, gas, slippage, and all declared costs.",
      decisionUse: "Prevents gross fees from being presented as investor outcome."
    },
    {
      id: "execution_history",
      label: "Execution history",
      expectedEvidence:
        "Decoded BSC receipts bound to the strategy identity and reviewed call scope.",
      decisionUse: "Proves what actually happened rather than what local code could calculate."
    }
  ],
  "grid-trading": [
    {
      id: "realized_pnl",
      label: "Realized PnL",
      expectedEvidence:
        "Matched closed grid cycles with proceeds, cost basis, and quote denomination.",
      decisionUse: "Keeps realized outcomes separate from open inventory and forecasts."
    },
    {
      id: "fills",
      label: "Confirmed fills",
      expectedEvidence:
        "Decoded fill receipts with side, amount, price, block, and transaction hash.",
      decisionUse: "Distinguishes executed trades from submitted, cancelled, or expired orders."
    },
    {
      id: "win_rate",
      label: "Win rate and window",
      expectedEvidence:
        "Profitable and total closed cycles plus sample size and observation window.",
      decisionUse: "Prevents a percentage from hiding a tiny or selectively chosen sample."
    },
    {
      id: "maximum_drawdown",
      label: "Maximum drawdown",
      expectedEvidence:
        "A complete timestamped equity curve using one documented valuation method.",
      decisionUse: "Makes the worst observed peak-to-trough outcome visible."
    },
    {
      id: "turnover",
      label: "Turnover",
      expectedEvidence:
        "Gross traded notional and average capital across the same observation window.",
      decisionUse: "Reveals whether reported outcomes depended on high trading intensity."
    },
    {
      id: "configured_range",
      label: "Grid range",
      expectedEvidence:
        "Bound lower and upper prices, grid levels, asset pair, and active time window.",
      decisionUse: "Shows the market regime and capital bounds the strategy actually accepted."
    },
    {
      id: "all_in_costs",
      label: "All-in costs",
      expectedEvidence: "Trading fees, slippage, gas, agent fees, and denomination conversions.",
      decisionUse: "Prevents gross spread capture from being mistaken for net PnL."
    },
    {
      id: "execution_history",
      label: "Execution history",
      expectedEvidence: "Decoded BSC trade receipts bound to the strategy identity and parameters.",
      decisionUse: "Connects the claimed grid behavior to verifiable transactions."
    }
  ],
  "yield-optimisation": [
    {
      id: "base_apy",
      label: "Base APY",
      expectedEvidence:
        "Protocol rate inputs, scale, compounding convention, block, and observation time.",
      decisionUse: "Separates the durable base rate from incentives."
    },
    {
      id: "reward_apy",
      label: "Reward APY",
      expectedEvidence:
        "Reward emission, token price, eligible capital, scale, and remaining program window.",
      decisionUse: "Shows which portion of yield depends on incentive assumptions."
    },
    {
      id: "net_apy",
      label: "Net APY",
      expectedEvidence:
        "Base and reward yield less annualized fees, gas, slippage, and withdrawal costs.",
      decisionUse: "Compares opportunities after known costs instead of by headline rate."
    },
    {
      id: "tvl_liquidity",
      label: "TVL and withdrawable liquidity",
      expectedEvidence:
        "Current protocol balances and a sourced estimate of immediately withdrawable value.",
      decisionUse: "Prevents TVL from being treated as proof of exit liquidity."
    },
    {
      id: "protocol_exposure",
      label: "Protocol exposure",
      expectedEvidence:
        "Underlying protocols, contracts, assets, concentration, and dependency graph.",
      decisionUse: "Makes concentration and composability risk explicit."
    },
    {
      id: "withdrawal_constraints",
      label: "Withdrawal constraints",
      expectedEvidence: "Lockups, queues, cooldowns, fees, caps, and tested redemption paths.",
      decisionUse: "Shows whether quoted yield can be exited on the user's horizon."
    },
    {
      id: "route_history",
      label: "Route history",
      expectedEvidence:
        "Timestamped allocation changes with reasons, source snapshots, and receipts.",
      decisionUse: "Explains how often capital moved and whether decisions were executed."
    },
    {
      id: "gas_impact",
      label: "Gas impact",
      expectedEvidence: "Route transaction receipts, BNB conversion prices, and capital basis.",
      decisionUse: "Shows whether switching costs erased the expected yield advantage."
    }
  ],
  "health-factor-monitoring": [
    {
      id: "current_health_factor",
      label: "Current health factor",
      expectedEvidence:
        "Same-block Venus collateral, debt, oracle, threshold, and account observations.",
      decisionUse: "Shows the account's current liquidation buffer from a coherent snapshot."
    },
    {
      id: "minimum_health_factor",
      label: "Minimum observed health factor",
      expectedEvidence: "A complete timestamped monitoring series and declared observation window.",
      decisionUse: "Surfaces the worst observed buffer rather than only the latest value."
    },
    {
      id: "monitored_collateral",
      label: "Monitored collateral",
      expectedEvidence:
        "Per-market supplied balances, prices, decimals, and liquidation thresholds.",
      decisionUse: "Identifies which assets and assumptions support the account."
    },
    {
      id: "monitored_debt",
      label: "Monitored debt",
      expectedEvidence:
        "Per-market borrow balances, prices, decimals, and interest observation block.",
      decisionUse: "Identifies the liabilities driving liquidation risk."
    },
    {
      id: "alert_latency",
      label: "Alert latency",
      expectedEvidence:
        "Source observation and alert-delivery timestamps across a declared sample.",
      decisionUse: "Shows whether warnings arrived early enough to be useful."
    },
    {
      id: "intervention_policy",
      label: "Intervention policy",
      expectedEvidence:
        "Versioned thresholds, permitted actions, caps, expiry, and emergency behavior.",
      decisionUse: "Explains exactly when monitoring may become action."
    },
    {
      id: "execution_history",
      label: "Intervention history",
      expectedEvidence: "Decoded BSC intervention receipts joined to alerts and policy versions.",
      decisionUse: "Proves whether a warning or protective action actually occurred."
    },
    {
      id: "liquidation_risk_thresholds",
      label: "Liquidation-risk thresholds",
      expectedEvidence:
        "Protocol liquidation rules and user alert/intervention thresholds with versions.",
      decisionUse: "Makes the distance between warning and liquidation explicit."
    }
  ]
} as const satisfies Record<ReferenceAnalyzerCategory, readonly MetricSeed[]>;

const repositoryProvenance = {
  "lp-rebalancing": {
    implementation: "agents/lpRangeAgent/app/agent/src/lpAnalysis.ts",
    tests: "agents/lpRangeAgent/app/agent/tests/lpAnalysis.test.ts",
    readme: "agents/lpRangeAgent/README.md"
  },
  "grid-trading": {
    implementation: "agents/gridTradingAgent/app/agent/src/gridAnalysis.ts",
    tests: "agents/gridTradingAgent/app/agent/tests/gridAnalysis.test.ts",
    readme: "agents/gridTradingAgent/README.md"
  },
  "yield-optimisation": {
    implementation: "agents/yieldOptimisationAgent/app/agent/src/yieldAnalysis.ts",
    tests: "agents/yieldOptimisationAgent/app/agent/tests/yieldAnalysis.test.ts",
    readme: "agents/yieldOptimisationAgent/app/agent/README.md"
  },
  "health-factor-monitoring": {
    implementation: "agents/healthFactorGuardianAgent/app/agent/src/healthFactorAnalysis.ts",
    tests: "agents/healthFactorGuardianAgent/app/agent/tests/healthFactorAnalysis.test.ts",
    readme: "agents/healthFactorGuardianAgent/README.md"
  }
} as const satisfies Record<
  ReferenceAnalyzerCategory,
  Readonly<{ implementation: string; tests: string; readme: string }>
>;

const relatedRoutes = {
  "lp-rebalancing": {
    href: "/pancake-position",
    label: "Open the read-only Pancake position inspector"
  },
  "grid-trading": null,
  "yield-optimisation": {
    href: "/yield-sources",
    label: "Open the read-only Lista source comparison"
  },
  "health-factor-monitoring": {
    href: "/venus-health",
    label: "Open the read-only Venus health inspector"
  }
} as const;

const registrationEvidencePath =
  "evidence/erc8004/registrations/125541239-four-agent-registration-evidence.json";

const registeredIdentities = {
  "lp-rebalancing": {
    ownerAddress: "0xAd03eF7e21c35FD1446c153f6eE5e6165F696990",
    erc8004TokenId: "1825",
    registrationTransactionHash:
      "0x361e388cf4877d11598def2e1eaeff7659dfaf1ae2c31b9f3700d866ac892386"
  },
  "grid-trading": {
    ownerAddress: "0xFBfFa9BA36d578AFF2d05EDe840Fc7088e70ADB8",
    erc8004TokenId: "1826",
    registrationTransactionHash:
      "0xcb5545d7aa66e25b7b2b3c448210ea00fabc9d68aa43174ee97e4e2d1ffda1ce"
  },
  "yield-optimisation": {
    ownerAddress: "0x62Af37A6FD89374684C00e2402FD96143f96ee85",
    erc8004TokenId: "1827",
    registrationTransactionHash:
      "0xaf6f972f26569a7ca6a031997a740a47fcf5bccaf207012b17c4409607153fd7"
  },
  "health-factor-monitoring": {
    ownerAddress: "0x708cb7F2b974d94005E762A140c469F1125e0cB4",
    erc8004TokenId: "1828",
    registrationTransactionHash:
      "0xec45aa43bf7826203a8ed5c65adfd9eb3115e10307ce3103bc0594dfa345e463"
  }
} as const satisfies Record<
  ReferenceAnalyzerCategory,
  Readonly<{
    ownerAddress: string;
    erc8004TokenId: string;
    registrationTransactionHash: string;
  }>
>;

const metricBaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  label: z.string().min(1).max(80),
  expectedEvidence: z.string().min(1).max(240),
  decisionUse: z.string().min(1).max(200),
  value: z.null(),
  source: z.null(),
  observedAt: z.null(),
  executionReceipt: z.null(),
  evidenceState: z.literal("unknown_no_observation"),
  receiptState: z.literal("no_receipt")
});

const metricSchema = z.discriminatedUnion("methodologyState", [
  metricBaseSchema.extend({
    methodologyState: z.literal("implemented_not_run"),
    methodologyVersion: z.string().min(1).max(80)
  }),
  metricBaseSchema.extend({
    methodologyState: z.literal("definition_documented_calculator_absent"),
    methodologyVersion: z.null()
  })
]);

const provenanceSchema = z.strictObject({
  kind: z.literal("repository_path"),
  label: z.string().min(1).max(60),
  path: z
    .string()
    .min(1)
    .max(180)
    .regex(/^(?:agents|docs|evidence)\/[A-Za-z0-9._/-]+$/)
    .refine((value) => !value.includes("..") && !value.includes("://"))
});

const relatedRouteSchema = z.union([
  z.null(),
  z.strictObject({
    href: z.enum(["/pancake-position", "/yield-sources", "/venus-health"]),
    label: z.string().min(1).max(100)
  })
]);

const coverageSchema = z.custom<ReferenceAgentCoverage>((value) =>
  referenceAgentCoverage.some((candidate) => candidate === value)
);

const passportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  category: referenceAnalyzerCategorySchema,
  coverage: coverageSchema,
  eligibility: z.strictObject({
    liveBscAgent: z.literal(true),
    erc8004Registered: z.literal(true),
    marketplaceEligible: z.literal(false),
    activationEligible: z.literal(false),
    executionEnabled: z.literal(false),
    hireable: z.literal(false)
  }),
  identity: z.strictObject({
    chainId: z.literal(97),
    ownerAddress: z.string().regex(/^0x[0-9a-f]{40}$/i),
    erc8004TokenId: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
    registrationTransactionHash: z.string().regex(/^0x[0-9a-f]{64}$/),
    registeredAt: z.null(),
    lastActivityAt: z.null(),
    executionCount: z.null(),
    successRate: z.null(),
    feeModel: z.null(),
    uptime: z.null(),
    riskLevel: z.literal("unknown"),
    reputation: z.literal("unknown"),
    dataFreshness: z.literal("finalized_bsc_testnet_observation"),
    latestExecutionReceipt: z.null()
  }),
  metrics: z.array(metricSchema).length(8),
  provenance: z.array(provenanceSchema).length(5),
  relatedRoute: relatedRouteSchema
});

export type ReferenceAnalyzerPassport = z.infer<typeof passportSchema>;

function deepFreeze<Value>(value: Value): Readonly<Value> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function methodologyForMetric(
  category: ReferenceAnalyzerCategory,
  metricId: string,
  analyzerMethodologyVersion: string
):
  | Readonly<{ methodologyState: "implemented_not_run"; methodologyVersion: string }>
  | Readonly<{
      methodologyState: "definition_documented_calculator_absent";
      methodologyVersion: null;
    }> {
  return implementedMetricIds[category].includes(metricId)
    ? {
        methodologyState: "implemented_not_run",
        methodologyVersion: analyzerMethodologyVersion
      }
    : {
        methodologyState: "definition_documented_calculator_absent",
        methodologyVersion: null
      };
}

function buildPassport(coverage: ReferenceAgentCoverage): ReferenceAnalyzerPassport {
  const category = coverage.category;
  const paths = repositoryProvenance[category];
  const identity = registeredIdentities[category];
  const parsed = passportSchema.parse({
    schemaVersion: 1,
    category,
    coverage,
    eligibility: {
      liveBscAgent: coverage.liveBscAgent,
      erc8004Registered: coverage.erc8004Registered,
      marketplaceEligible: coverage.marketplaceEligible,
      activationEligible: coverage.activationEligible,
      executionEnabled: coverage.executionEnabled,
      hireable: false
    },
    identity: {
      chainId: 97,
      ownerAddress: identity.ownerAddress,
      erc8004TokenId: identity.erc8004TokenId,
      registrationTransactionHash: identity.registrationTransactionHash,
      registeredAt: null,
      lastActivityAt: null,
      executionCount: null,
      successRate: null,
      feeModel: null,
      uptime: null,
      riskLevel: "unknown",
      reputation: "unknown",
      dataFreshness: "finalized_bsc_testnet_observation",
      latestExecutionReceipt: null
    },
    metrics: metricSeeds[category].map((metric) => ({
      ...metric,
      value: null,
      source: null,
      observedAt: null,
      executionReceipt: null,
      evidenceState: "unknown_no_observation",
      receiptState: "no_receipt",
      ...methodologyForMetric(category, metric.id, coverage.methodologyVersion)
    })),
    provenance: [
      { kind: "repository_path", label: "Analyzer implementation", path: paths.implementation },
      { kind: "repository_path", label: "Deterministic tests", path: paths.tests },
      { kind: "repository_path", label: "Analyzer boundary", path: paths.readme },
      {
        kind: "repository_path",
        label: "Shared metric methodology",
        path: "docs/data-methodology.md"
      },
      {
        kind: "repository_path",
        label: "Finalized ERC-8004 evidence",
        path: registrationEvidencePath
      }
    ],
    relatedRoute: relatedRoutes[category]
  });

  if (
    parsed.coverage.category !== category ||
    parsed.coverage.state !== "registered_bsc_testnet_analyzer"
  ) {
    throw new TypeError("Reference analyzer coverage does not match its dossier category.");
  }
  if (
    !sameSequence(
      parsed.metrics.map((metric) => metric.id),
      referenceAnalyzerMetricIds[category]
    )
  ) {
    throw new TypeError("Reference analyzer metric contract is incomplete or out of order.");
  }
  return deepFreeze(parsed) as ReferenceAnalyzerPassport;
}

const passports = referenceAgentCoverage.map(buildPassport);

if (passports.length !== 4 || new Set(passports.map((passport) => passport.category)).size !== 4) {
  throw new TypeError(
    "Reference analyzer dossiers must cover each required category exactly once."
  );
}

export const referenceAnalyzerCategories: readonly ReferenceAnalyzerCategory[] = Object.freeze(
  passports.map((passport) => passport.category)
);

export const referenceAnalyzerPassports: readonly ReferenceAnalyzerPassport[] =
  Object.freeze(passports);

export function isReferenceAnalyzerCategory(input: unknown): input is ReferenceAnalyzerCategory {
  return referenceAnalyzerCategorySchema.safeParse(input).success;
}

export function referenceAnalyzerPassportForCategory(
  input: unknown
): ReferenceAnalyzerPassport | null {
  if (!isReferenceAnalyzerCategory(input)) return null;
  return referenceAnalyzerPassports.find((passport) => passport.category === input) ?? null;
}
