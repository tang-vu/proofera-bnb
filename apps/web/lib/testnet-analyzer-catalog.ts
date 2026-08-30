import { z } from "zod";

export const testnetAnalyzerCategorySchema = z.enum([
  "lp-rebalancing",
  "grid-trading",
  "yield-optimisation",
  "health-factor-monitoring"
]);

export type TestnetAnalyzerCategory = z.infer<typeof testnetAnalyzerCategorySchema>;

export interface TestnetAnalyzerPreset {
  readonly category: TestnetAnalyzerCategory;
  readonly title: string;
  readonly description: string;
  readonly sourceState: "synthetic_scenario" | "retained_testnet_replay";
  readonly sourceArtifact: string | null;
  readonly sourceSha256: `0x${string}`;
  readonly inputJson: string;
}

const catalogEntrySchema = z.strictObject({
  category: testnetAnalyzerCategorySchema,
  label: z.string().min(1).max(80),
  shortLabel: z.string().min(1).max(32),
  skill: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/u),
  methodologyVersion: z.string().min(1).max(80),
  endpoint: z.string().url().startsWith("https://proofera-").endsWith(".tangvu.dev/"),
  agentId: z.string().regex(/^[1-9][0-9]*$/u),
  accent: z.enum(["amber", "blue", "violet", "green"])
});

export type TestnetAnalyzerCatalogEntry = z.infer<typeof catalogEntrySchema>;

const parsedCatalog = z
  .array(catalogEntrySchema)
  .length(4)
  .parse([
    {
      category: "lp-rebalancing",
      label: "LP Range Analyzer",
      shortLabel: "LP range",
      skill: "analyze_lp_range",
      methodologyVersion: "proofera-lp-range-v1.0.0",
      endpoint: "https://proofera-lp.tangvu.dev/",
      agentId: "1825",
      accent: "amber"
    },
    {
      category: "grid-trading",
      label: "Grid Trading Analyzer",
      shortLabel: "Grid",
      skill: "analyze_grid_trading",
      methodologyVersion: "proofera-grid-trading-v1.0.0",
      endpoint: "https://proofera-grid.tangvu.dev/",
      agentId: "1826",
      accent: "blue"
    },
    {
      category: "yield-optimisation",
      label: "Yield Optimisation Analyzer",
      shortLabel: "Yield",
      skill: "analyze_yield_opportunities",
      methodologyVersion: "proofera-yield-route-v2.0.0",
      endpoint: "https://proofera-yield.tangvu.dev/",
      agentId: "1827",
      accent: "violet"
    },
    {
      category: "health-factor-monitoring",
      label: "Health-Factor Guardian",
      shortLabel: "Health",
      skill: "analyze_venus_health_factor",
      methodologyVersion: "proofera-venus-core-health-factor-v1.3.0",
      endpoint: "https://proofera-health.tangvu.dev/",
      agentId: "1828",
      accent: "green"
    }
  ]);

if (new Set(parsedCatalog.map(({ category }) => category)).size !== parsedCatalog.length) {
  throw new TypeError("Testnet analyzer categories must be unique.");
}
if (new Set(parsedCatalog.map(({ skill }) => skill)).size !== parsedCatalog.length) {
  throw new TypeError("Testnet analyzer skills must be unique.");
}

export const testnetAnalyzerCatalog: readonly TestnetAnalyzerCatalogEntry[] = Object.freeze(
  parsedCatalog.map((entry) => Object.freeze(entry))
);

export function testnetAnalyzerForCategory(
  category: TestnetAnalyzerCategory
): TestnetAnalyzerCatalogEntry {
  const analyzer = testnetAnalyzerCatalog.find((entry) => entry.category === category);
  if (analyzer === undefined) throw new TypeError("Required testnet analyzer is missing.");
  return analyzer;
}
