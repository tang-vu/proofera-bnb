import { z } from "zod";

const referenceAgentCoverageSchema = z.strictObject({
  category: z.enum([
    "lp-rebalancing",
    "grid-trading",
    "yield-optimisation",
    "health-factor-monitoring"
  ]),
  name: z.string().min(1).max(80),
  skill: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  methodologyVersion: z.string().min(1).max(80),
  evidenceFocus: z.tuple([
    z.string().min(1).max(100),
    z.string().min(1).max(100),
    z.string().min(1).max(100),
    z.string().min(1).max(100)
  ]),
  state: z.literal("registered_bsc_testnet_analyzer"),
  liveBscAgent: z.literal(true),
  erc8004Registered: z.literal(true),
  marketplaceEligible: z.literal(false),
  activationEligible: z.literal(false),
  executionEnabled: z.literal(false),
  boundary: z.string().min(1).max(240)
});

export type ReferenceAgentCoverage = z.infer<typeof referenceAgentCoverageSchema>;

const unparsedReferenceAgentCoverage = [
  {
    category: "lp-rebalancing",
    name: "LP Range Analyzer",
    skill: "analyze_lp_range",
    methodologyVersion: "proofera-lp-range-v1.0.0",
    evidenceFocus: [
      "in-range state and tick distance",
      "fee and impermanent-loss inputs",
      "gas drag and net benefit",
      "bounded rebalance decision"
    ],
    state: "registered_bsc_testnet_analyzer",
    liveBscAgent: true,
    erc8004Registered: true,
    marketplaceEligible: false,
    activationEligible: false,
    executionEnabled: false,
    boundary:
      "BSC-testnet identity 1825 is finalized. Analysis remains read-only with no authority, execution, hire, or performance receipt."
  },
  {
    category: "grid-trading",
    name: "Grid Trading Analyzer",
    skill: "analyze_grid_trading",
    methodologyVersion: "proofera-grid-trading-v1.0.0",
    evidenceFocus: [
      "realized fills and PnL",
      "drawdown and observation window",
      "turnover and grid range",
      "fees, slippage, and gas costs"
    ],
    state: "registered_bsc_testnet_analyzer",
    liveBscAgent: true,
    erc8004Registered: true,
    marketplaceEligible: false,
    activationEligible: false,
    executionEnabled: false,
    boundary:
      "BSC-testnet identity 1826 is finalized. Claimed fills and performance receipts remain caller-supplied until independently verified."
  },
  {
    category: "yield-optimisation",
    name: "Yield Optimisation Analyzer",
    skill: "analyze_yield_opportunities",
    methodologyVersion: "proofera-yield-route-v2.0.0",
    evidenceFocus: [
      "base, reward, and net APY",
      "withdrawable liquidity and constraints",
      "protocol exposure and concentration",
      "route history and all-in costs"
    ],
    state: "registered_bsc_testnet_analyzer",
    liveBscAgent: true,
    erc8004Registered: true,
    marketplaceEligible: false,
    activationEligible: false,
    executionEnabled: false,
    boundary:
      "BSC-testnet identity 1827 is finalized. APY scale, route receipts, realized returns, and risk stay unknown without evidence."
  },
  {
    category: "health-factor-monitoring",
    name: "Health-Factor Guardian Analyzer",
    skill: "analyze_venus_health_factor",
    methodologyVersion: "proofera-venus-core-health-factor-v1.3.0",
    evidenceFocus: [
      "current and minimum health factor",
      "collateral, debt, and thresholds",
      "alert latency and breach coverage",
      "intervention policy and receipts"
    ],
    state: "registered_bsc_testnet_analyzer",
    liveBscAgent: true,
    erc8004Registered: true,
    marketplaceEligible: false,
    activationEligible: false,
    executionEnabled: false,
    boundary:
      "BSC-testnet identity 1828 is finalized. Execution, hiring, marketplace eligibility, and authority remain unverified and false."
  }
] as const;

const parsed = z
  .array(referenceAgentCoverageSchema)
  .length(4)
  .parse(unparsedReferenceAgentCoverage);

if (new Set(parsed.map((item) => item.category)).size !== 4) {
  throw new TypeError("Reference coverage must contain each required category exactly once.");
}

export const referenceAgentCoverage: readonly ReferenceAgentCoverage[] = Object.freeze(
  parsed.map((item) => {
    Object.freeze(item.evidenceFocus);
    return Object.freeze(item);
  })
);

export function referenceCoverageForCategory(
  category: ReferenceAgentCoverage["category"]
): ReferenceAgentCoverage {
  const record = referenceAgentCoverage.find((item) => item.category === category);
  if (record === undefined) throw new TypeError("Required reference category is missing.");
  return record;
}
