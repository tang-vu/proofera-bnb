import "server-only";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  testnetAnalyzerCatalog,
  type TestnetAnalyzerCategory,
  type TestnetAnalyzerPreset
} from "./testnet-analyzer-catalog";

const HEALTH_REPLAY_PATH =
  "evidence/termix/frozen/venus-health/3ba85859ced3-125563831-125564152.canonical-json";
const HEALTH_REPLAY_SHA256 = "24332c45c880115166dff8c269e3a40b592a3decaea7a0981b32c45989abd2bf";

const scenarioTime = "2026-08-11T10:00:00Z";
const analysisTime = "2026-08-11T10:01:00Z";
const scenarioBlock = "76543210";
const scenarioBlockHash = `0x${"11".repeat(32)}`;
const assetAddress = "0x1111111111111111111111111111111111111111";
const vaultAddress = "0x2222222222222222222222222222222222222222";

function sha256(value: string): `0x${string}` {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function onchainSource(calls: readonly string[]) {
  return {
    kind: "onchain",
    chainId: 97,
    blockNumber: scenarioBlock,
    blockHash: scenarioBlockHash,
    blockTimestampUtc: scenarioTime,
    contractAddress: vaultAddress,
    calls
  };
}

function directCapitalCost(amountRaw: string) {
  return {
    sourceAssetAddress: assetAddress,
    sourceAssetDecimals: 6,
    sourceAmountRaw: amountRaw,
    valuation: {
      kind: "direct_capital_asset",
      capitalAssetAddress: assetAddress,
      capitalAssetDecimals: 6,
      capitalAssetAmountRaw: amountRaw,
      observedAtUtc: scenarioTime,
      sourceLocator: onchainSource(["costEvidence()"]),
      methodology: "The scenario supplies this exact cost in capital-asset raw units."
    }
  };
}

function syntheticInputs(): Readonly<
  Record<Exclude<TestnetAnalyzerCategory, "health-factor-monitoring">, unknown>
> {
  return {
    "lp-rebalancing": {
      skill: "analyze_lp_range",
      chainId: 97,
      poolAddress: "0x1111111111111111111111111111111111111111",
      positionManagerAddress: "0x2222222222222222222222222222222222222222",
      positionId: "900719925474099312345",
      observedAtBlock: scenarioBlock,
      observedAtUtc: scenarioTime,
      analysisAtUtc: analysisTime,
      sourceLocator: {
        kind: "onchain",
        chainId: 97,
        blockNumber: scenarioBlock,
        poolAddress: "0x1111111111111111111111111111111111111111",
        positionManagerAddress: "0x2222222222222222222222222222222222222222",
        poolRead: "slot0()",
        positionRead: "positions(uint256)"
      },
      currentTick: 550,
      tickSpacing: 60,
      lowerTick: -600,
      upperTick: 600,
      capital: {
        asset: "USDC",
        minorUnitDecimals: 6,
        amountMinorUnits: "1000000000",
        minimumMinorUnits: "1000000",
        maximumMinorUnits: "10000000000"
      },
      riskConstraints: {
        reviewBufferTicks: 120,
        maximumRangeWidthTicks: 1800,
        maximumSourceAgeSeconds: 900,
        futureToleranceSeconds: 30,
        minimumNetBenefitMinorUnits: "100",
        maximumKnownCostsMinorUnits: "1000000"
      },
      economics: {
        quoteAsset: "USDC",
        minorUnitDecimals: 6,
        projectedIncrementalFeesMinorUnits: "10000",
        knownGasCostMinorUnits: "1000",
        knownSlippageCostMinorUnits: "2000"
      }
    },
    "grid-trading": {
      skill: "analyze_grid_trading",
      chainId: 97,
      market: { baseAsset: "BNB", quoteAsset: "USDC" },
      analysisAtUtc: analysisTime,
      currentPrice: {
        value: "100",
        observedAtUtc: scenarioTime,
        source: {
          kind: "http",
          url: "https://prices.example/snapshots/bnb-usdc.json",
          publisher: "Synthetic scenario publisher",
          contentSha256: "ab".repeat(32)
        }
      },
      gridRange: {
        lowerPrice: "90",
        upperPrice: "110",
        levels: 5,
        observedAtUtc: scenarioTime,
        source: { kind: "caller", reference: "ProofEra synthetic grid scenario" }
      },
      tradingFee: {
        oneWayFeeBps: 25,
        observedAtUtc: scenarioTime,
        source: { kind: "caller", reference: "Scenario venue fee tier" }
      },
      estimatedRoundTripGas: {
        amountMinorUnits: "100000",
        asset: "USDC",
        minorUnitDecimals: 6,
        observedAtUtc: scenarioTime,
        source: { kind: "caller", reference: "Scenario round-trip gas estimate" }
      },
      capital: {
        amountMinorUnits: "1000000000",
        minimumMinorUnits: "1000000",
        maximumMinorUnits: "10000000000",
        asset: "USDC",
        minorUnitDecimals: 6,
        observedAtUtc: scenarioTime,
        source: { kind: "caller", reference: "ProofEra synthetic capital scenario" }
      },
      riskConstraints: {
        minimumGridLevels: 3,
        maximumGridLevels: 20,
        maximumRangeWidthBps: 2500,
        maximumDownsideToLowerBps: 1500,
        maximumKnownRoundTripCostBps: 100,
        maximumSourceAgeSeconds: 900,
        futureToleranceSeconds: 30,
        observedAtUtc: scenarioTime,
        source: { kind: "caller", reference: "ProofEra synthetic risk scenario" }
      }
    },
    "yield-optimisation": {
      skill: "analyze_yield_opportunities",
      schemaVersion: 2,
      chainId: 97,
      analysisAtUtc: analysisTime,
      capital: {
        assetAddress,
        assetSymbol: "USDT",
        decimals: 6,
        amountRaw: "1000000",
        horizonSeconds: 31_536_000
      },
      constraints: {
        allowedProtocols: ["venus"],
        maximumSourceAgeSeconds: 300,
        futureToleranceSeconds: 30,
        minimumTvlRaw: "5000000",
        minimumWithdrawableLiquidityRaw: "1000000",
        minimumLiquidityCoverageBps: 10_000,
        maximumProtocolExposureBps: 6_000,
        maximumWithdrawalDelaySeconds: 86_400,
        maximumWithdrawalFeeBps: 50,
        minimumNetApyPercentagePoints: "4.00",
        maximumAnnualizedGasImpactPercentagePoints: "0.10"
      },
      opportunities: [
        {
          opportunityId: "venus-usdt-synthetic-vault",
          protocol: "venus",
          vaultAddress,
          asset: { address: assetAddress, symbol: "USDT", decimals: 6 },
          observation: {
            blockNumber: scenarioBlock,
            observedAtUtc: scenarioTime,
            sourceLocator: onchainSource(["getVaultSnapshot()"]),
            sourceRelation: { kind: "direct_vault_contract", vaultAddress },
            coveredFields: [
              "apy",
              "liquidity",
              "withdrawal",
              "economics",
              "exposure",
              "route_history"
            ]
          },
          apy: {
            scale: {
              status: "documented",
              unit: "percentage_points",
              decimalPlaces: 2,
              annualization: "365_day_simple",
              methodology: "The synthetic source reports annual percentage-point rates."
            },
            baseApy: "4.00",
            rewardApy: "1.00",
            grossApy: "5.00",
            grossComposition: "base_plus_reward"
          },
          liquidity: { tvlRaw: "10000000", withdrawableRaw: "2000000" },
          withdrawal: {
            status: "documented",
            instant: true,
            delaySeconds: 0,
            feeBps: 0,
            feeBasis: {
              assetAddress,
              decimals: 6,
              amountRaw: "1000000",
              rounding: "exact",
              derivedFeeRaw: "0",
              observedAtUtc: scenarioTime,
              sourceLocator: onchainSource(["withdrawalFee()"]),
              methodology: "The scenario applies zero withdrawal fee to analyzed capital."
            },
            lockupEndsAtUtc: null,
            description: "Immediate withdrawal according to the synthetic scenario."
          },
          postAllocationProtocolExposureBps: 5_000,
          economics: {
            methodology: "proofera-net-apy-simple-v1",
            annualFeeApy: "0.50",
            costs: {
              gas: directCapitalCost("100"),
              route: directCapitalCost("100"),
              slippage: directCapitalCost("0"),
              withdrawalFee: directCapitalCost("0")
            }
          },
          routeHistory: []
        }
      ]
    }
  };
}

function loadHealthReplay(): string {
  const candidateRoots = [process.cwd(), resolve(process.cwd(), "..", "..")];
  let rawFile: string | null = null;
  for (const root of candidateRoots) {
    try {
      rawFile = readFileSync(resolve(root, HEALTH_REPLAY_PATH), "utf8");
      break;
    } catch {
      // The web package runs from apps/web in tests and from the repository root in production.
    }
  }
  if (rawFile === null) {
    throw new TypeError("The retained Venus replay artifact is unavailable.");
  }
  const raw = rawFile.trim();
  if (createHash("sha256").update(rawFile).digest("hex") !== HEALTH_REPLAY_SHA256) {
    throw new TypeError("The retained Venus replay digest does not match its reviewed artifact.");
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !("skill" in parsed) ||
    parsed.skill !== "analyze_venus_health_factor" ||
    !("chainId" in parsed) ||
    parsed.chainId !== 97
  ) {
    throw new TypeError("The retained Venus replay is outside the testnet analyzer boundary.");
  }
  return JSON.stringify(parsed, null, 2);
}

export function loadTestnetAnalyzerPresets(): readonly TestnetAnalyzerPreset[] {
  const scenarios = syntheticInputs();
  return Object.freeze(
    testnetAnalyzerCatalog.map((analyzer) => {
      if (analyzer.category === "health-factor-monitoring") {
        return Object.freeze({
          category: analyzer.category,
          title: "Retained Venus testnet replay",
          description:
            "A hash-checked, three-observation BSC-testnet replay. It is historical evidence, not a current account reading.",
          sourceState: "retained_testnet_replay" as const,
          sourceArtifact: HEALTH_REPLAY_PATH,
          sourceSha256: `0x${HEALTH_REPLAY_SHA256}` as const,
          inputJson: loadHealthReplay()
        });
      }

      const inputJson = JSON.stringify(scenarios[analyzer.category], null, 2);
      return Object.freeze({
        category: analyzer.category,
        title: `${analyzer.shortLabel} bounded scenario`,
        description:
          "A schema-valid synthetic scenario for exercising the public analyzer. It is not market evidence or a live recommendation.",
        sourceState: "synthetic_scenario" as const,
        sourceArtifact: null,
        sourceSha256: sha256(inputJson),
        inputJson
      });
    })
  );
}
