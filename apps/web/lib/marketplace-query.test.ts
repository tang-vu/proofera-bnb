import { describe, expect, it } from "vitest";

import { capitalLabel, marketplaceCategories, parseMarketplaceIntent } from "./marketplace-query";

describe("parseMarketplaceIntent", () => {
  it("uses the winning LP slice as the safe default", () => {
    expect(parseMarketplaceIntent({})).toEqual({
      category: "lp-rebalancing",
      capital: "100-1000",
      risk: "balanced",
      horizon: "months",
      asset: "any"
    });
  });

  it("accepts only bounded, known intent values", () => {
    expect(
      parseMarketplaceIntent({
        category: "health-factor-monitoring",
        capital: "over-10000",
        risk: "conservative",
        horizon: "weeks",
        asset: "stablecoins"
      })
    ).toMatchObject({
      category: "health-factor-monitoring",
      capital: "over-10000",
      risk: "conservative",
      horizon: "weeks",
      asset: "stablecoins"
    });
  });

  it("does not let arrays or arbitrary values reach an upstream query", () => {
    const parsed = parseMarketplaceIntent({
      category: ["grid-trading", "yield-optimisation"],
      risk: "unlimited",
      asset: "<script>"
    });

    expect(parsed.category).toBe("lp-rebalancing");
    expect(parsed.risk).toBe("balanced");
    expect(parsed.asset).toBe("any");
    expect(marketplaceCategories[parsed.category].registrySearch).toBe("PancakeSwap");
  });
});

describe("capitalLabel", () => {
  it("renders a human-readable bounded range", () => {
    expect(capitalLabel("1000-10000")).toBe("$1,000–$10,000");
  });
});
