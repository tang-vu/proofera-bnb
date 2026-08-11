import { describe, expect, it } from "vitest";

import { referenceAgentCoverage, referenceCoverageForCategory } from "./reference-agent-coverage";

describe("reference agent coverage", () => {
  it("represents all four required categories exactly once", () => {
    expect(referenceAgentCoverage).toHaveLength(4);
    expect(new Set(referenceAgentCoverage.map((item) => item.category))).toEqual(
      new Set(["lp-rebalancing", "grid-trading", "yield-optimisation", "health-factor-monitoring"])
    );
  });

  it("cannot be mistaken for live, registered, hireable, or executable agents", () => {
    for (const item of referenceAgentCoverage) {
      expect(item).toMatchObject({
        state: "local_development_analyzer",
        liveBscAgent: false,
        erc8004Registered: false,
        marketplaceEligible: false,
        activationEligible: false,
        executionEnabled: false
      });
      expect(item.evidenceFocus).toHaveLength(4);
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.evidenceFocus)).toBe(true);
    }
  });

  it("returns the exact selected category record", () => {
    expect(referenceCoverageForCategory("health-factor-monitoring").skill).toBe(
      "analyze_venus_health_factor"
    );
  });
});
