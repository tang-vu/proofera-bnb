import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { referenceCoverageForCategory } from "./reference-agent-coverage";
import {
  isReferenceAnalyzerCategory,
  referenceAnalyzerCategories,
  referenceAnalyzerMetricIds,
  referenceAnalyzerPassportForCategory,
  referenceAnalyzerPassports
} from "./reference-analyzer-passport";

describe("reference analyzer passports", () => {
  it("provides equal-depth dossiers for all four required categories", () => {
    expect(referenceAnalyzerCategories).toEqual([
      "lp-rebalancing",
      "grid-trading",
      "yield-optimisation",
      "health-factor-monitoring"
    ]);
    expect(referenceAnalyzerPassports).toHaveLength(4);

    for (const passport of referenceAnalyzerPassports) {
      expect(passport.coverage).toBe(referenceCoverageForCategory(passport.category));
      expect(passport.metrics.map((metric) => metric.id)).toEqual(
        referenceAnalyzerMetricIds[passport.category]
      );
      expect(passport.metrics).toHaveLength(8);
      expect(passport.provenance).toHaveLength(4);
    }
  });

  it("keeps every agent, hiring, activation, and execution eligibility flag false", () => {
    for (const passport of referenceAnalyzerPassports) {
      expect(passport.eligibility).toEqual({
        liveBscAgent: false,
        erc8004Registered: false,
        marketplaceEligible: false,
        activationEligible: false,
        executionEnabled: false,
        hireable: false
      });
      expect(passport.coverage.state).toBe("local_development_analyzer");
    }
  });

  it("represents absent identity, activity, performance, and receipts explicitly", () => {
    for (const passport of referenceAnalyzerPassports) {
      expect(passport.identity).toEqual({
        chainId: null,
        ownerAddress: null,
        erc8004TokenId: null,
        registrationTransactionHash: null,
        registeredAt: null,
        lastActivityAt: null,
        executionCount: null,
        successRate: null,
        feeModel: null,
        uptime: null,
        riskLevel: "unknown",
        reputation: "unknown",
        dataFreshness: "unknown_no_observation",
        latestExecutionReceipt: null
      });

      for (const metric of passport.metrics) {
        expect(metric).toMatchObject({
          value: null,
          source: null,
          observedAt: null,
          executionReceipt: null,
          evidenceState: "unknown_no_observation",
          receiptState: "no_receipt"
        });
      }
    }
  });

  it("claims a metric calculator only for values the analyzer actually derives", () => {
    const implementedByCategory = {
      "lp-rebalancing": ["current_range_state"],
      "grid-trading": ["configured_range"],
      "yield-optimisation": ["net_apy", "gas_impact"],
      "health-factor-monitoring": [
        "current_health_factor",
        "minimum_health_factor",
        "alert_latency"
      ]
    } as const;

    for (const passport of referenceAnalyzerPassports) {
      const implemented = new Set<string>(implementedByCategory[passport.category]);
      for (const metric of passport.metrics) {
        if (implemented.has(metric.id)) {
          expect(metric).toMatchObject({
            methodologyState: "implemented_not_run",
            methodologyVersion: passport.coverage.methodologyVersion
          });
        } else {
          expect(metric).toMatchObject({
            methodologyState: "definition_documented_calculator_absent",
            methodologyVersion: null
          });
        }
      }
    }
  });

  it("does not turn explicitly withheld LP and grid outcomes into code-defined metrics", () => {
    const absentByCategory = {
      "lp-rebalancing": [
        "in_range_time",
        "fee_apr",
        "estimated_impermanent_loss",
        "rebalance_frequency",
        "execution_history"
      ],
      "grid-trading": ["realized_pnl", "fills", "win_rate", "maximum_drawdown"]
    } as const;

    for (const [category, metricIds] of Object.entries(absentByCategory)) {
      const passport = referenceAnalyzerPassportForCategory(category);
      expect(passport).not.toBeNull();
      for (const metricId of metricIds) {
        expect(passport?.metrics.find((metric) => metric.id === metricId)).toMatchObject({
          methodologyState: "definition_documented_calculator_absent",
          methodologyVersion: null
        });
      }
    }
  });

  it("uses only repository paths and allowlisted internal supporting routes", () => {
    const allowedRoutes = new Set(["/pancake-position", "/yield-sources", "/venus-health"]);

    for (const passport of referenceAnalyzerPassports) {
      for (const source of passport.provenance) {
        expect(source.kind).toBe("repository_path");
        expect(source.path).toMatch(/^(?:agents|docs)\/[A-Za-z0-9._/-]+$/);
        expect(source.path).not.toContain("..");
        expect(source.path).not.toContain("://");
      }
      if (passport.relatedRoute !== null) {
        expect(allowedRoutes.has(passport.relatedRoute.href)).toBe(true);
      }
    }
  });

  it("binds every provenance path and analyzer identity to a real, safe repository file", () => {
    const repositoryRoot = realpathSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
    );
    const safeRootPrefix = repositoryRoot.endsWith(sep) ? repositoryRoot : repositoryRoot + sep;
    const prohibitedPathSegment =
      /(?:^|\/)(?:\.env(?:\.|$)|\.git|\.studio|node_modules|secrets?|keystores?|wallets?)(?:\/|$)/i;
    const implementationContracts = {
      "lp-rebalancing": {
        skill: /skill:\s*z\.literal\("analyze_lp_range"\)/,
        method: /export const LP_RANGE_METHODOLOGY_VERSION\s*=\s*"proofera-lp-range-v1\.0\.0";/
      },
      "grid-trading": {
        skill: /export const GRID_TRADING_SKILL\s*=\s*"analyze_grid_trading"\s+as const;/,
        method:
          /export const GRID_TRADING_METHODOLOGY_VERSION\s*=\s*"proofera-grid-trading-v1\.0\.0"\s+as const;/
      },
      "yield-optimisation": {
        skill: /skill:\s*z\.literal\("analyze_yield_opportunities"\)/,
        method:
          /export const YIELD_ANALYSIS_METHODOLOGY_VERSION\s*=\s*"proofera-yield-route-v2\.0\.0";/
      },
      "health-factor-monitoring": {
        skill: /export const HEALTH_FACTOR_SKILL\s*=\s*"analyze_venus_health_factor"\s+as const;/,
        method:
          /export const HEALTH_FACTOR_METHODOLOGY_VERSION\s*=\s*"proofera-venus-core-health-factor-v1\.2\.0"\s+as const;/
      }
    } as const;

    for (const passport of referenceAnalyzerPassports) {
      for (const provenance of passport.provenance) {
        expect(provenance.path).not.toMatch(prohibitedPathSegment);
        const absolutePath = realpathSync(resolve(repositoryRoot, ...provenance.path.split("/")));
        expect(absolutePath.startsWith(safeRootPrefix)).toBe(true);
        expect(relative(repositoryRoot, absolutePath)).not.toMatch(/^\.\.(?:\\|\/|$)/);
        expect(lstatSync(absolutePath).isFile()).toBe(true);
      }

      const implementationPath = passport.provenance.find(
        (provenance) => provenance.label === "Analyzer implementation"
      );
      expect(implementationPath).toBeDefined();
      if (implementationPath === undefined) continue;

      const source = readFileSync(
        resolve(repositoryRoot, ...implementationPath.path.split("/")),
        "utf8"
      );
      const contract = implementationContracts[passport.category];
      expect(source).toMatch(contract.skill);
      expect(source).toMatch(contract.method);
      expect(source).toContain(`"${passport.coverage.skill}"`);
      expect(source).toContain(`"${passport.coverage.methodologyVersion}"`);
    }
  });

  it("freezes the exported evidence contracts", () => {
    expect(Object.isFrozen(referenceAnalyzerCategories)).toBe(true);
    expect(Object.isFrozen(referenceAnalyzerPassports)).toBe(true);
    expect(Object.isFrozen(referenceAnalyzerMetricIds)).toBe(true);

    for (const passport of referenceAnalyzerPassports) {
      expect(Object.isFrozen(passport)).toBe(true);
      expect(Object.isFrozen(passport.eligibility)).toBe(true);
      expect(Object.isFrozen(passport.identity)).toBe(true);
      expect(Object.isFrozen(passport.metrics)).toBe(true);
      expect(passport.metrics.every(Object.isFrozen)).toBe(true);
      expect(Object.isFrozen(passport.provenance)).toBe(true);
    }
  });

  it("rejects unsupported and non-string route categories", () => {
    expect(isReferenceAnalyzerCategory("lp-rebalancing")).toBe(true);
    expect(isReferenceAnalyzerCategory("LP-rebalancing")).toBe(false);
    expect(isReferenceAnalyzerCategory("unknown")).toBe(false);
    expect(isReferenceAnalyzerCategory(["lp-rebalancing"])).toBe(false);
    expect(referenceAnalyzerPassportForCategory("unknown")).toBeNull();
    expect(referenceAnalyzerPassportForCategory(null)).toBeNull();
  });
});
