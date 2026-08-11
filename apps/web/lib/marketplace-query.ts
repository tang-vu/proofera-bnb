import { z } from "zod";

export const marketplaceCategories = {
  "lp-rebalancing": {
    label: "LP rebalancing",
    shortGoal: "Keep a concentrated-liquidity position productive",
    registrySearch: "PancakeSwap",
    evidenceFocus: "range time, fees, impermanent loss, gas drag, and net performance"
  },
  "grid-trading": {
    label: "Grid trading",
    shortGoal: "Run a bounded buy-and-sell grid",
    registrySearch: "grid trading",
    evidenceFocus: "realized PnL, fills, drawdown, turnover, and all-in costs"
  },
  "yield-optimisation": {
    label: "Yield optimisation",
    shortGoal: "Find sustainable yield with an exit path",
    registrySearch: "yield",
    evidenceFocus: "base and reward APY, liquidity, exposure, constraints, and gas"
  },
  "health-factor-monitoring": {
    label: "Health-factor monitoring",
    shortGoal: "Protect a lending position from liquidation",
    registrySearch: "health factor",
    evidenceFocus: "health factor, alert latency, thresholds, policy, and interventions"
  }
} as const;

const categorySchema = z.enum([
  "lp-rebalancing",
  "grid-trading",
  "yield-optimisation",
  "health-factor-monitoring"
]);
const capitalSchema = z.enum(["under-100", "100-1000", "1000-10000", "over-10000"]);
const riskSchema = z.enum(["conservative", "balanced", "adventurous"]);
const horizonSchema = z.enum(["days", "weeks", "months"]);
const assetSchema = z.enum(["any", "stablecoins", "bnb", "cake"]);

export type MarketplaceCategory = z.infer<typeof categorySchema>;
export type MarketplaceSearchParams = Record<string, string | string[] | undefined>;

export interface MarketplaceIntent {
  readonly category: MarketplaceCategory;
  readonly capital: z.infer<typeof capitalSchema>;
  readonly risk: z.infer<typeof riskSchema>;
  readonly horizon: z.infer<typeof horizonSchema>;
  readonly asset: z.infer<typeof assetSchema>;
}

function readSingle(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function withDefault<T>(schema: z.ZodType<T>, value: string | undefined, fallback: T): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export function parseMarketplaceIntent(params: MarketplaceSearchParams): MarketplaceIntent {
  return {
    category: withDefault(categorySchema, readSingle(params.category), "lp-rebalancing"),
    capital: withDefault(capitalSchema, readSingle(params.capital), "100-1000"),
    risk: withDefault(riskSchema, readSingle(params.risk), "balanced"),
    horizon: withDefault(horizonSchema, readSingle(params.horizon), "months"),
    asset: withDefault(assetSchema, readSingle(params.asset), "any")
  };
}

export function capitalLabel(value: MarketplaceIntent["capital"]): string {
  return {
    "under-100": "Under $100",
    "100-1000": "$100–$1,000",
    "1000-10000": "$1,000–$10,000",
    "over-10000": "$10,000+"
  }[value];
}
