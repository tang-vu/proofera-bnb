import { handleGridTradingA2a } from "../../../agents/gridTradingAgent/app/agent/src/gridAnalysis";
import { handleHealthFactorA2a } from "../../../agents/healthFactorGuardianAgent/app/agent/src/healthFactorAnalysis";
import { handleLpAnalysisA2a } from "../../../agents/lpRangeAgent/app/agent/src/lpAnalysis";
import { handleYieldAnalysisA2a } from "../../../agents/yieldOptimisationAgent/app/agent/src/yieldAnalysis";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { testnetAnalyzerCatalog } from "./testnet-analyzer-catalog";
import { loadTestnetAnalyzerPresets } from "./testnet-analyzer-presets.server";

vi.mock("server-only", () => ({}));

const inputSchema = z.record(z.string(), z.unknown());

const handlers = {
  "lp-rebalancing": handleLpAnalysisA2a,
  "grid-trading": handleGridTradingA2a,
  "yield-optimisation": handleYieldAnalysisA2a,
  "health-factor-monitoring": handleHealthFactorA2a
} as const;

const expectedDecisions = {
  "lp-rebalancing": "review_rebalance",
  "grid-trading": "review_grid",
  "yield-optimisation": "review_route",
  "health-factor-monitoring": "hold"
} as const;

describe("testnet analyzer studio presets", () => {
  it("executes every shipped preset through its exact deterministic agent adapter", () => {
    const presets = loadTestnetAnalyzerPresets();
    expect(presets.map(({ category }) => category)).toEqual(
      testnetAnalyzerCatalog.map(({ category }) => category)
    );

    for (const preset of presets) {
      const input = inputSchema.parse(JSON.parse(preset.inputJson));
      const result = handlers[preset.category](input);
      expect(result).toMatchObject({
        skill: testnetAnalyzerCatalog.find(({ category }) => category === preset.category)?.skill,
        chainId: 97,
        environment: "bsc-testnet",
        decision: expectedDecisions[preset.category],
        executionEnabled: false
      });
      expect(Object.isFrozen(preset)).toBe(true);
      expect(preset.sourceSha256).toMatch(/^0x[0-9a-f]{64}$/u);
    }
  });

  it("labels only the hash-checked Venus artifact as retained evidence", () => {
    const presets = loadTestnetAnalyzerPresets();
    const replay = presets.filter(({ sourceState }) => sourceState === "retained_testnet_replay");
    const scenarios = presets.filter(({ sourceState }) => sourceState === "synthetic_scenario");

    expect(replay).toHaveLength(1);
    expect(replay[0]).toMatchObject({
      category: "health-factor-monitoring",
      sourceArtifact:
        "evidence/termix/frozen/venus-health/3ba85859ced3-125563831-125564152.canonical-json",
      sourceSha256: "0x24332c45c880115166dff8c269e3a40b592a3decaea7a0981b32c45989abd2bf"
    });
    expect(scenarios).toHaveLength(3);
    expect(scenarios.every(({ sourceArtifact }) => sourceArtifact === null)).toBe(true);
  });
});
