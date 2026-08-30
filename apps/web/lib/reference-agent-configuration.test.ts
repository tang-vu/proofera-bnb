import { describe, expect, it } from "vitest";

import {
  configurableReferenceCategories,
  parseReferenceAgentConfiguration,
  type ReferenceConfigurationCategory,
  type ReferenceConfigurationSearchParams
} from "./reference-agent-configuration";

const maxUint256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const uint256Overflow =
  "115792089237316195423570985008687907853269984665640564039457584007913129639936";

const validQueries = {
  "grid-trading": {
    capitalRaw: maxUint256,
    network: "bsc-testnet",
    risk: "balanced",
    horizon: "days",
    asset: "bnb-usdt",
    protocol: "pancakeswap-v3",
    lowerPriceRaw: "500.000000000000000001",
    upperPriceRaw: "700.000000000000000002",
    gridLevels: "24",
    maxDrawdownBps: "1250",
    maxSlippageBps: "35"
  },
  "yield-optimisation": {
    capitalRaw: maxUint256,
    network: "bsc-testnet",
    risk: "conservative",
    horizon: "months",
    asset: "stablecoins",
    protocol: "venus",
    minimumNetApyBps: "450",
    minimumWithdrawableBps: "9000",
    maxGasCostRaw: "4500000000000001"
  },
  "health-factor-monitoring": {
    capitalRaw: maxUint256,
    network: "bsc-testnet",
    risk: "conservative",
    horizon: "continuous",
    asset: "mixed",
    protocol: "venus",
    warningHealthFactorRaw: "1.300000000000000001",
    criticalHealthFactorRaw: "1.150000000000000001",
    targetHealthFactorRaw: "1.500000000000000001",
    maxRepayRaw: "250000000000000001"
  }
} as const satisfies Record<ReferenceConfigurationCategory, ReferenceConfigurationSearchParams>;

describe("reference-agent mandate configuration", () => {
  it("exposes exactly the three non-LP configuration categories", () => {
    expect(configurableReferenceCategories).toEqual([
      "grid-trading",
      "yield-optimisation",
      "health-factor-monitoring"
    ]);
    expect(configurableReferenceCategories).not.toContain("lp-rebalancing");
  });

  for (const category of configurableReferenceCategories) {
    it(`${category} starts blank without treating defaults as a request`, () => {
      const state = parseReferenceAgentConfiguration(category, {});

      expect(state.status).toBe("blank");
      expect(state.category).toBe(category);
      expect(Object.isFrozen(state)).toBe(true);
    });

    it(`${category} preserves exact financial strings and keeps identity separate from activation`, () => {
      const state = parseReferenceAgentConfiguration(category, validQueries[category]);

      expect(state.status).toBe("configured");
      if (state.status !== "configured") throw new TypeError("Expected configured state");
      expect(state.configuration.capitalRaw).toBe(maxUint256);
      expect(state.configuration).toMatchObject({ category, schemaVersion: 1 });
      expect(state.readiness.flags.verifiedAgentIdentityReady).toBe(true);
      expect(
        Object.entries(state.readiness.flags)
          .filter(([key]) => key !== "verifiedAgentIdentityReady")
          .map(([, value]) => value)
      ).toEqual(Array(8).fill(false));
      expect(state.readiness.blockers.map(({ code }) => code)).toEqual([
        "trusted_evidence_absent",
        "scoped_authority_absent",
        "transaction_receipt_absent"
      ]);
      expect(Object.values(state.readiness.boundary)).toEqual(Array(5).fill(false));
      expect(Object.isFrozen(state.configuration)).toBe(true);
      expect(Object.isFrozen(state.readiness.blockers)).toBe(true);
    });

    it(`${category} rejects unknown and repeated keys without selecting a value`, () => {
      const unknown = parseReferenceAgentConfiguration(category, {
        ...validQueries[category],
        rpcUrl: "https://example.test"
      });
      const repeated = parseReferenceAgentConfiguration(category, {
        ...validQueries[category],
        capitalRaw: ["1", "2"]
      });

      expect(unknown).toMatchObject({
        status: "invalid",
        issues: [
          {
            field: "query",
            message: "Only the allowlisted mandate fields for this category are accepted."
          }
        ]
      });
      expect(repeated).toMatchObject({
        status: "invalid",
        issues: [
          {
            field: "capitalRaw",
            message: "Each mandate field must appear exactly once."
          }
        ]
      });
    });
  }

  it("rejects fields from another category", () => {
    const state = parseReferenceAgentConfiguration("yield-optimisation", {
      ...validQueries["yield-optimisation"],
      lowerPriceRaw: "1"
    });

    expect(state).toMatchObject({
      status: "invalid",
      issues: [{ field: "query" }]
    });
  });

  it("validates grid ordering and bounded integer thresholds without Number conversion", () => {
    const badRange = parseReferenceAgentConfiguration("grid-trading", {
      ...validQueries["grid-trading"],
      lowerPriceRaw: "700.000000000000000002",
      upperPriceRaw: "700.000000000000000001"
    });
    const badLevels = parseReferenceAgentConfiguration("grid-trading", {
      ...validQueries["grid-trading"],
      gridLevels: "101"
    });

    expect(badRange).toMatchObject({
      status: "invalid",
      issues: [{ field: "upperPriceRaw" }]
    });
    expect(badLevels).toMatchObject({
      status: "invalid",
      issues: [{ field: "gridLevels" }]
    });
  });

  it("validates yield thresholds while retaining a zero gas-cost boundary as a string", () => {
    const configured = parseReferenceAgentConfiguration("yield-optimisation", {
      ...validQueries["yield-optimisation"],
      maxGasCostRaw: "0"
    });
    const invalid = parseReferenceAgentConfiguration("yield-optimisation", {
      ...validQueries["yield-optimisation"],
      minimumWithdrawableBps: "10001"
    });

    expect(configured.status).toBe("configured");
    if (
      configured.status === "configured" &&
      configured.configuration.category === "yield-optimisation"
    ) {
      expect(configured.configuration.maxGasCostRaw).toBe("0");
    }
    expect(invalid).toMatchObject({
      status: "invalid",
      issues: [{ field: "minimumWithdrawableBps" }]
    });
  });

  it("accepts and bounds every raw uint256 field without rounding", () => {
    const maximumGas = parseReferenceAgentConfiguration("yield-optimisation", {
      ...validQueries["yield-optimisation"],
      maxGasCostRaw: maxUint256
    });
    const maximumRepay = parseReferenceAgentConfiguration("health-factor-monitoring", {
      ...validQueries["health-factor-monitoring"],
      maxRepayRaw: maxUint256
    });
    const overflowingGas = parseReferenceAgentConfiguration("yield-optimisation", {
      ...validQueries["yield-optimisation"],
      maxGasCostRaw: uint256Overflow
    });
    const overflowingRepay = parseReferenceAgentConfiguration("health-factor-monitoring", {
      ...validQueries["health-factor-monitoring"],
      maxRepayRaw: uint256Overflow
    });

    expect(maximumGas.status).toBe("configured");
    if (
      maximumGas.status === "configured" &&
      maximumGas.configuration.category === "yield-optimisation"
    ) {
      expect(maximumGas.configuration.maxGasCostRaw).toBe(maxUint256);
    }
    expect(maximumRepay.status).toBe("configured");
    if (
      maximumRepay.status === "configured" &&
      maximumRepay.configuration.category === "health-factor-monitoring"
    ) {
      expect(maximumRepay.configuration.maxRepayRaw).toBe(maxUint256);
    }
    expect(overflowingGas).toMatchObject({
      status: "invalid",
      issues: [{ field: "maxGasCostRaw" }]
    });
    expect(overflowingRepay).toMatchObject({
      status: "invalid",
      issues: [{ field: "maxRepayRaw" }]
    });
  });

  it("rejects mainnet and unsupported yield protocols at the product boundary", () => {
    const mainnet = parseReferenceAgentConfiguration("yield-optimisation", {
      ...validQueries["yield-optimisation"],
      network: "bsc-mainnet"
    });
    const unsupportedProtocol = parseReferenceAgentConfiguration("yield-optimisation", {
      ...validQueries["yield-optimisation"],
      protocol: "lista"
    });

    expect(mainnet).toMatchObject({ status: "invalid", issues: [{ field: "network" }] });
    expect(unsupportedProtocol).toMatchObject({
      status: "invalid",
      issues: [{ field: "protocol" }]
    });
  });

  it("maps every supported product mandate to BSC testnet chain 97", () => {
    const gridTestnet = parseReferenceAgentConfiguration(
      "grid-trading",
      validQueries["grid-trading"]
    );
    const venusYieldTestnet = parseReferenceAgentConfiguration("yield-optimisation", {
      ...validQueries["yield-optimisation"],
      network: "bsc-testnet",
      protocol: "venus"
    });
    const healthTestnet = parseReferenceAgentConfiguration(
      "health-factor-monitoring",
      validQueries["health-factor-monitoring"]
    );

    expect(gridTestnet).toMatchObject({ status: "configured", configuration: { chainId: 97 } });
    expect(venusYieldTestnet).toMatchObject({
      status: "configured",
      configuration: { chainId: 97 }
    });
    expect(healthTestnet).toMatchObject({
      status: "configured",
      configuration: { chainId: 97 }
    });
  });

  it("requires ordered health-factor thresholds above one", () => {
    for (const query of [
      { ...validQueries["health-factor-monitoring"], criticalHealthFactorRaw: "1" },
      {
        ...validQueries["health-factor-monitoring"],
        warningHealthFactorRaw: "1.10",
        criticalHealthFactorRaw: "1.15"
      },
      {
        ...validQueries["health-factor-monitoring"],
        targetHealthFactorRaw: "1.20"
      }
    ]) {
      expect(parseReferenceAgentConfiguration("health-factor-monitoring", query).status).toBe(
        "invalid"
      );
    }
  });

  it("rejects malformed decimal fields without throwing during relational validation", () => {
    const decimalFields = [
      ["grid-trading", "lowerPriceRaw"],
      ["grid-trading", "upperPriceRaw"],
      ["health-factor-monitoring", "warningHealthFactorRaw"],
      ["health-factor-monitoring", "criticalHealthFactorRaw"],
      ["health-factor-monitoring", "targetHealthFactorRaw"]
    ] as const;
    const malformedValues = ["abc", "1e3", "1\n2", "9".repeat(79), ".5", "01.5"];

    for (const [category, field] of decimalFields) {
      for (const malformedValue of malformedValues) {
        const query: ReferenceConfigurationSearchParams = {
          ...validQueries[category],
          [field]: malformedValue
        };

        expect(() => parseReferenceAgentConfiguration(category, query)).not.toThrow();
        expect(parseReferenceAgentConfiguration(category, query).status).toBe("invalid");
      }
    }
  });

  it("rejects ambiguous decimal strings, whitespace, controls, and oversized reflection", () => {
    for (const capitalRaw of [
      "01",
      "1.5",
      " 1",
      "1e3",
      "-1",
      "0",
      "1\n2",
      uint256Overflow,
      "9".repeat(79)
    ]) {
      const state = parseReferenceAgentConfiguration("grid-trading", {
        ...validQueries["grid-trading"],
        capitalRaw
      });
      expect(state.status).toBe("invalid");
      expect(state.formValues.capitalRaw.length).toBeLessThanOrEqual(78);
    }
  });
});
