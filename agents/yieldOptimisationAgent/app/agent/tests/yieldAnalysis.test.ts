import assert from "node:assert/strict";
import { test } from "node:test";

import type { DataPart, Message } from "@a2a-js/sdk";
import {
  DefaultExecutionEventBus,
  RequestContext,
  type AgentExecutionEvent
} from "@a2a-js/sdk/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { buildAgentCard } from "../src/agentCard.js";
import {
  BoundedIdleSessionRegistry,
  FixedWindowMcpInitializationLimiter
} from "../src/dualMain.js";
import { YieldAnalysisExecutor } from "../src/executor.js";
import { buildMcpServer } from "../src/mcpMain.js";
import {
  analyzeYieldOpportunities,
  handleYieldAnalysisA2a,
  handleYieldAnalysisMcp,
  yieldAnalysisInputSchema,
  yieldAnalysisResultSchema
} from "../src/yieldAnalysis.js";

const ASSET = "0x1111111111111111111111111111111111111111";
const VAULT = "0x2222222222222222222222222222222222222222";
const WBNB = "0x3333333333333333333333333333333333333333";
const MAX_UINT256 = (2n ** 256n - 1n).toString(10);

function source(
  chainId: 56 | 97,
  blockNumber = "76543210",
  observedAtUtc = "2026-08-11T10:00:00Z",
  contractAddress = VAULT,
  calls = ["getVaultSnapshot()"]
) {
  return {
    kind: "onchain" as const,
    chainId,
    blockNumber,
    blockHash: `0x${"11".repeat(32)}`,
    blockTimestampUtc: observedAtUtc,
    contractAddress,
    calls
  };
}

function directCost(
  amountRaw: string,
  chainId: 56 | 97 = 97,
  sourceAssetAddress = ASSET,
  sourceAssetDecimals = 6
) {
  return {
    sourceAssetAddress,
    sourceAssetDecimals,
    sourceAmountRaw: amountRaw,
    valuation: {
      kind: "direct_capital_asset" as const,
      capitalAssetAddress: ASSET,
      capitalAssetDecimals: 6,
      capitalAssetAmountRaw: amountRaw,
      observedAtUtc: "2026-08-11T10:00:00Z",
      sourceLocator: source(chainId, "76543210", "2026-08-11T10:00:00Z", VAULT, ["costEvidence()"]),
      methodology: "The supplied source reports this exact cost in capital-asset raw units."
    }
  };
}

function convertedGasCost(
  sourceAmountRaw: string,
  capitalAssetAmountRaw: string,
  numeratorCapitalAssetRaw: string,
  denominatorSourceAssetRaw: string
) {
  return {
    sourceAssetAddress: WBNB,
    sourceAssetDecimals: 18,
    sourceAmountRaw,
    valuation: {
      kind: "exact_conversion_to_capital_asset" as const,
      capitalAssetAddress: ASSET,
      capitalAssetDecimals: 6,
      capitalAssetAmountRaw,
      numeratorCapitalAssetRaw,
      denominatorSourceAssetRaw,
      rounding: "exact_only" as const,
      observedAtUtc: "2026-08-11T10:00:00Z",
      sourceLocator: source(97, "76543210", "2026-08-11T10:00:00Z", VAULT, ["gasValuation()"]),
      methodology: "Exact raw-unit conversion from sourced WBNB gas cost into USDT raw units."
    }
  };
}

function fixture(chainId: 56 | 97 = 97): Record<string, unknown> {
  return {
    schemaVersion: 2,
    chainId,
    analysisAtUtc: "2026-08-11T10:01:00Z",
    capital: {
      assetAddress: ASSET,
      assetSymbol: "USDT",
      decimals: 6,
      amountRaw: "1000000",
      horizonSeconds: 31_536_000
    },
    constraints: {
      allowedProtocols: ["lista"],
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
        opportunityId: "lista-usdt-vault",
        protocol: "lista",
        vaultAddress: VAULT,
        asset: { address: ASSET, symbol: "USDT", decimals: 6 },
        observation: {
          blockNumber: "76543210",
          observedAtUtc: "2026-08-11T10:00:00Z",
          sourceLocator: source(chainId),
          sourceRelation: { kind: "direct_vault_contract", vaultAddress: VAULT },
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
            methodology: "Source reports simple annual percentage-point rates to two decimals."
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
            assetAddress: ASSET,
            decimals: 6,
            amountRaw: "1000000",
            rounding: "exact",
            derivedFeeRaw: "0",
            observedAtUtc: "2026-08-11T10:00:00Z",
            sourceLocator: source(chainId, "76543210", "2026-08-11T10:00:00Z", VAULT, [
              "withdrawalFee()"
            ]),
            methodology: "Fee bps applies to the analyzed capital amount with exact rounding."
          },
          lockupEndsAtUtc: null,
          description: "Immediate withdrawal according to the supplied source snapshot."
        },
        postAllocationProtocolExposureBps: 5_000,
        economics: {
          methodology: "proofera-net-apy-simple-v1",
          annualFeeApy: "0.50",
          costs: {
            gas: directCost("100", chainId),
            route: directCost("100", chainId),
            slippage: directCost("0", chainId),
            withdrawalFee: directCost("0", chainId)
          }
        },
        routeHistory: []
      }
    ]
  };
}

function opportunity(input: Record<string, unknown>): Record<string, unknown> {
  return (input.opportunities as Array<Record<string, unknown>>)[0];
}

function resultOpportunity(result: ReturnType<typeof analyzeYieldOpportunities>) {
  return result.opportunities[0];
}

test("supports BSC mainnet and testnet with the same exact methodology", () => {
  for (const chainId of [56, 97] as const) {
    const result = analyzeYieldOpportunities(fixture(chainId));
    const candidate = resultOpportunity(result);
    assert.equal(result.schemaVersion, 2);
    assert.equal(result.methodologyVersion, "proofera-yield-route-v2.0.0");
    assert.equal(result.environment, chainId === 56 ? "bsc-mainnet" : "bsc-testnet");
    assert.equal(result.decision, "review_route");
    assert.equal(candidate.apy.net.value, "4.48");
    assert.equal(candidate.gasImpact.annualizedApyImpact.value, "0.01");
    assert.equal(candidate.knownCosts.annualFeeApy, "0.50");
    assert.equal(candidate.knownCosts.totalRaw, "200");
    assert.equal(candidate.realizedPerformance.status, "unknown");
    assert.deepEqual(result.humanReviewCandidateIds, ["lista-usdt-vault"]);
    assert.equal(result.trust.state, "caller_supplied_unverified");
    assert.equal(result.trust.marketplaceEligible, false);
    assert.equal(candidate.eligibility.activationEligible, false);
    assert.equal(candidate.eligibility.executionEligible, false);
    assert.equal(result.executionEnabled, false);
    assert.doesNotThrow(() => yieldAnalysisResultSchema.parse(result));
  }
});

test("preserves uint256-scale capital and liquidity without Number conversion", () => {
  const input = fixture();
  (input.capital as Record<string, unknown>).amountRaw = MAX_UINT256;
  const candidate = opportunity(input);
  candidate.liquidity = { tvlRaw: MAX_UINT256, withdrawableRaw: MAX_UINT256 };
  const withdrawal = candidate.withdrawal as Record<string, unknown>;
  (withdrawal.feeBasis as Record<string, unknown>).amountRaw = MAX_UINT256;
  (candidate.economics as Record<string, unknown>).costs = {
    gas: directCost("0"),
    route: directCost("0"),
    slippage: directCost("0"),
    withdrawalFee: directCost("0")
  };

  const result = analyzeYieldOpportunities(input);
  assert.equal(result.capital.amountRaw, MAX_UINT256);
  assert.equal(resultOpportunity(result).liquidity.withdrawableRaw, MAX_UINT256);
  assert.equal(resultOpportunity(result).knownCosts.totalRaw, "0");
  assert.equal(resultOpportunity(result).apy.net.value, "4.5");
});

test("stale and future-dated source observations are insufficient evidence", () => {
  const stale = fixture();
  stale.analysisAtUtc = "2026-08-11T10:05:00.001Z";
  const staleCandidate = resultOpportunity(analyzeYieldOpportunities(stale));
  assert.equal(staleCandidate.decision, "insufficient_evidence");
  assert.ok(staleCandidate.violations.some(({ code }) => code === "SOURCE_STALE"));

  const future = fixture();
  const futureObservation = opportunity(future).observation as Record<string, unknown>;
  futureObservation.observedAtUtc = "2026-08-11T10:01:31Z";
  (futureObservation.sourceLocator as Record<string, unknown>).blockTimestampUtc =
    "2026-08-11T10:01:31Z";
  const futureCandidate = resultOpportunity(analyzeYieldOpportunities(future));
  assert.equal(futureCandidate.decision, "insufficient_evidence");
  assert.ok(futureCandidate.violations.some(({ code }) => code === "SOURCE_IN_FUTURE"));
});

test("missing economics keeps net APY and gas impact explicitly unknown", () => {
  const input = fixture();
  opportunity(input).economics = null;

  const candidate = resultOpportunity(analyzeYieldOpportunities(input));
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.deepEqual(candidate.apy.net, {
    value: null,
    state: "missing_inputs",
    methodology: null
  });
  assert.equal(candidate.knownCosts.totalRaw, null);
  assert.equal(candidate.realizedPerformance.value, null);
  assert.ok(candidate.violations.some(({ code }) => code === "ECONOMICS_MISSING"));
});

test("missing APY components remain null and reduce evidence confidence", () => {
  const input = fixture();
  const apy = opportunity(input).apy as Record<string, unknown>;
  apy.baseApy = null;
  apy.grossComposition = "independent_source";

  const candidate = resultOpportunity(analyzeYieldOpportunities(input));
  assert.equal(candidate.apy.base.value, null);
  assert.equal(candidate.apy.base.state, "missing");
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.ok(candidate.violations.some(({ code }) => code === "BASE_APY_MISSING"));
});

test("unknown APY scale redacts base, reward, gross, and net values", () => {
  const input = fixture();
  const candidateInput = opportunity(input);
  candidateInput.apy = {
    ...(candidateInput.apy as Record<string, unknown>),
    scale: { status: "unknown", reason: "The source did not document its APY scale." }
  };

  const candidate = resultOpportunity(analyzeYieldOpportunities(input));
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.equal(candidate.apy.base.value, null);
  assert.equal(candidate.apy.reward.value, null);
  assert.equal(candidate.apy.gross.value, null);
  assert.equal(candidate.apy.net.value, null);
  assert.equal(candidate.apy.gross.state, "unknown_scale");
  assert.ok(candidate.violations.some(({ code }) => code === "APY_SCALE_UNKNOWN"));
});

test("documented compounded APY is exposed but not mixed with the simple net methodology", () => {
  const input = fixture();
  const apy = opportunity(input).apy as Record<string, unknown>;
  apy.scale = {
    ...(apy.scale as Record<string, unknown>),
    annualization: "source_reported_compounded",
    methodology: "The supplied source documents a compounded annualized rate."
  };

  const candidate = resultOpportunity(analyzeYieldOpportunities(input));
  assert.equal(candidate.apy.gross.value, "5.00");
  assert.equal(candidate.apy.net.value, null);
  assert.equal(candidate.apy.net.state, "unsupported_methodology");
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.ok(candidate.violations.some(({ code }) => code === "NET_APY_METHODOLOGY_UNSUPPORTED"));
});

test("source scope omissions withhold unsupported APY and economics claims", () => {
  const input = fixture();
  (opportunity(input).observation as Record<string, unknown>).coveredFields = [
    "liquidity",
    "withdrawal",
    "exposure"
  ];

  const candidate = resultOpportunity(analyzeYieldOpportunities(input));
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.deepEqual(candidate.apy.gross, { value: null, state: "source_scope_missing" });
  assert.equal(candidate.apy.net.state, "source_scope_missing");
  assert.equal(candidate.knownCosts.totalRaw, null);
  assert.equal(candidate.gasImpact.capitalAssetGasCostRaw, null);
  assert.ok(candidate.violations.some(({ code }) => code === "SOURCE_SCOPE_MISSING"));
});

test("inconsistent base-plus-reward composition is insufficient evidence", () => {
  const input = fixture();
  (opportunity(input).apy as Record<string, unknown>).grossApy = "5.01";

  const candidate = resultOpportunity(analyzeYieldOpportunities(input));
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.ok(candidate.violations.some(({ code }) => code === "GROSS_COMPONENT_MISMATCH"));
});

test("withdrawal uncertainty blocks evidence and excessive delay produces hold", () => {
  const unknown = fixture();
  opportunity(unknown).withdrawal = {
    status: "unknown",
    reason: "The supplied source did not describe withdrawal behavior."
  };
  const unknownCandidate = resultOpportunity(analyzeYieldOpportunities(unknown));
  assert.equal(unknownCandidate.decision, "insufficient_evidence");
  assert.ok(
    unknownCandidate.violations.some(({ code }) => code === "WITHDRAWAL_CONSTRAINTS_UNKNOWN")
  );

  const delayed = fixture();
  const delayedWithdrawal = opportunity(delayed).withdrawal as Record<string, unknown>;
  opportunity(delayed).withdrawal = {
    ...delayedWithdrawal,
    instant: false,
    delaySeconds: 172_800,
    description: "The supplied snapshot documents a two-day withdrawal queue."
  };
  const delayedCandidate = resultOpportunity(analyzeYieldOpportunities(delayed));
  assert.equal(delayedCandidate.decision, "hold");
  assert.ok(delayedCandidate.violations.some(({ code }) => code === "WITHDRAWAL_DELAY_EXCEEDED"));
});

test("missing liquidity is insufficient while low sourced liquidity produces hold", () => {
  const missing = fixture();
  opportunity(missing).liquidity = { tvlRaw: null, withdrawableRaw: null };
  const missingCandidate = resultOpportunity(analyzeYieldOpportunities(missing));
  assert.equal(missingCandidate.decision, "insufficient_evidence");
  assert.ok(missingCandidate.violations.some(({ code }) => code === "TVL_MISSING"));
  assert.ok(
    missingCandidate.violations.some(({ code }) => code === "WITHDRAWABLE_LIQUIDITY_MISSING")
  );

  const low = fixture();
  opportunity(low).liquidity = { tvlRaw: "10000000", withdrawableRaw: "999999" };
  const lowCandidate = resultOpportunity(analyzeYieldOpportunities(low));
  assert.equal(lowCandidate.decision, "hold");
  assert.ok(
    lowCandidate.violations.some(({ code }) => code === "LIQUIDITY_COVERAGE_BELOW_MINIMUM")
  );
});

test("protocol allowlist and concentration are first-class constraints", () => {
  const concentrated = fixture();
  opportunity(concentrated).postAllocationProtocolExposureBps = 6_001;
  const concentrationCandidate = resultOpportunity(analyzeYieldOpportunities(concentrated));
  assert.equal(concentrationCandidate.decision, "hold");
  assert.ok(
    concentrationCandidate.violations.some(({ code }) => code === "PROTOCOL_EXPOSURE_EXCEEDED")
  );

  const disallowed = fixture();
  opportunity(disallowed).protocol = "venus";
  const disallowedCandidate = resultOpportunity(analyzeYieldOpportunities(disallowed));
  assert.equal(disallowedCandidate.decision, "hold");
  assert.ok(disallowedCandidate.violations.some(({ code }) => code === "PROTOCOL_NOT_ALLOWED"));
});

test("known gas overwhelming projected yield produces an exact negative net APY and hold", () => {
  const input = fixture();
  opportunity(input).economics = {
    methodology: "proofera-net-apy-simple-v1",
    annualFeeApy: "0.50",
    costs: {
      gas: directCost("50000"),
      route: directCost("0"),
      slippage: directCost("0"),
      withdrawalFee: directCost("0")
    }
  };

  const candidate = resultOpportunity(analyzeYieldOpportunities(input));
  assert.equal(candidate.apy.net.value, "-0.5");
  assert.equal(candidate.gasImpact.annualizedApyImpact.value, "5");
  assert.equal(candidate.decision, "hold");
  assert.ok(candidate.violations.some(({ code }) => code === "KNOWN_COSTS_EXCEED_PROJECTED_YIELD"));
  assert.ok(candidate.violations.some(({ code }) => code === "GAS_IMPACT_EXCEEDS_MAXIMUM"));
});

test("schema-valid uint256 cost sums fail closed without throwing", () => {
  const input = fixture();
  const costs = ((opportunity(input).economics as Record<string, unknown>).costs ?? {}) as Record<
    string,
    unknown
  >;
  costs.gas = directCost(MAX_UINT256);
  costs.route = directCost(MAX_UINT256);

  assert.equal(yieldAnalysisInputSchema.safeParse(input).success, true);
  let result: ReturnType<typeof analyzeYieldOpportunities> | undefined;
  assert.doesNotThrow(() => {
    result = analyzeYieldOpportunities(input);
  });
  assert.ok(result);
  assert.doesNotThrow(() => yieldAnalysisResultSchema.parse(result));
  const candidate = resultOpportunity(result);
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.equal(candidate.knownCosts.totalRaw, null);
  assert.equal(candidate.apy.net.state, "out_of_range");
  assert.ok(candidate.violations.some(({ code }) => code === "KNOWN_COST_TOTAL_OUT_OF_RANGE"));
});

test("extreme cost-to-capital ratios return bounded null calculations", () => {
  const input = fixture();
  (input.capital as Record<string, unknown>).amountRaw = "1";
  const candidateInput = opportunity(input);
  const withdrawal = candidateInput.withdrawal as Record<string, unknown>;
  (withdrawal.feeBasis as Record<string, unknown>).amountRaw = "1";
  const costs = ((candidateInput.economics as Record<string, unknown>).costs ?? {}) as Record<
    string,
    unknown
  >;
  costs.gas = directCost(MAX_UINT256);
  costs.route = directCost("0");

  assert.equal(yieldAnalysisInputSchema.safeParse(input).success, true);
  const result = analyzeYieldOpportunities(input);
  assert.doesNotThrow(() => yieldAnalysisResultSchema.parse(result));
  const candidate = resultOpportunity(result);
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.deepEqual(candidate.apy.net, {
    value: null,
    state: "out_of_range",
    methodology: "proofera-net-apy-simple-v1"
  });
  assert.equal(candidate.gasImpact.annualizedApyImpact.state, "out_of_range");
  assert.ok(
    candidate.violations.some(({ code }) => code === "NET_APY_OUT_OF_RANGE"),
    JSON.stringify(candidate.violations)
  );
  assert.ok(
    candidate.violations.some(({ code }) => code === "GAS_IMPACT_OUT_OF_RANGE"),
    JSON.stringify(candidate.violations)
  );
});

test("withdrawal fee basis must reconcile to the typed withdrawal cost", () => {
  const input = fixture();
  const constraints = input.constraints as Record<string, unknown>;
  constraints.maximumWithdrawalFeeBps = 10_000;
  constraints.minimumNetApyPercentagePoints = "0";
  const candidateInput = opportunity(input);
  const withdrawal = candidateInput.withdrawal as Record<string, unknown>;
  withdrawal.feeBps = 5_000;
  (withdrawal.feeBasis as Record<string, unknown>).derivedFeeRaw = "500000";

  const result = analyzeYieldOpportunities(input);
  const candidate = resultOpportunity(result);
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.equal(candidate.apy.net.value, null);
  assert.equal(candidate.gasImpact.annualizedApyImpact.value, null);
  assert.equal(candidate.knownCosts.withdrawalFee.state, "fee_mismatch");
  assert.ok(candidate.violations.some(({ code }) => code === "WITHDRAWAL_FEE_COST_MISMATCH"));
});

test("native gas raw units cannot be mislabeled as vault-asset cost", () => {
  const input = fixture();
  const costs = ((opportunity(input).economics as Record<string, unknown>).costs ?? {}) as Record<
    string,
    unknown
  >;
  costs.gas = directCost("1000000000000000", 97, WBNB, 18);

  const result = analyzeYieldOpportunities(input);
  const candidate = resultOpportunity(result);
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.equal(candidate.apy.net.value, null);
  assert.equal(candidate.gasImpact.annualizedApyImpact.value, null);
  assert.equal(candidate.knownCosts.gas.state, "asset_mismatch");
  assert.ok(candidate.violations.some(({ code }) => code === "COST_ASSET_MISMATCH"));
});

test("native gas requires an exact documented capital-asset conversion", () => {
  const exact = fixture();
  const exactCosts = ((opportunity(exact).economics as Record<string, unknown>).costs ??
    {}) as Record<string, unknown>;
  exactCosts.gas = convertedGasCost(
    "1000000000000000",
    "300000",
    "300000000",
    "1000000000000000000"
  );
  const exactCandidate = resultOpportunity(analyzeYieldOpportunities(exact));
  assert.equal(exactCandidate.knownCosts.gas.state, "available");
  assert.equal(exactCandidate.knownCosts.gas.capitalAssetAmountRaw, "300000");

  const nonExact = fixture();
  const nonExactCosts = ((opportunity(nonExact).economics as Record<string, unknown>).costs ??
    {}) as Record<string, unknown>;
  nonExactCosts.gas = convertedGasCost("1", "0", "1", "3");
  const nonExactCandidate = resultOpportunity(analyzeYieldOpportunities(nonExact));
  assert.equal(nonExactCandidate.decision, "insufficient_evidence");
  assert.equal(nonExactCandidate.apy.net.value, null);
  assert.equal(nonExactCandidate.gasImpact.annualizedApyImpact.value, null);
  assert.equal(nonExactCandidate.knownCosts.gas.state, "non_exact_conversion");
  assert.ok(nonExactCandidate.violations.some(({ code }) => code === "COST_CONVERSION_NON_EXACT"));

  const unresolved = fixture();
  const unresolvedCosts = ((opportunity(unresolved).economics as Record<string, unknown>).costs ??
    {}) as Record<string, unknown>;
  unresolvedCosts.gas = {
    sourceAssetAddress: WBNB,
    sourceAssetDecimals: 18,
    sourceAmountRaw: "1000000000000000",
    valuation: {
      kind: "unresolved_conversion",
      capitalAssetAddress: ASSET,
      capitalAssetDecimals: 6,
      reason: "No bounded fresh BNB/USDT valuation was supplied."
    }
  };
  const unresolvedCandidate = resultOpportunity(analyzeYieldOpportunities(unresolved));
  assert.equal(unresolvedCandidate.decision, "insufficient_evidence");
  assert.equal(unresolvedCandidate.apy.net.value, null);
  assert.equal(unresolvedCandidate.gasImpact.annualizedApyImpact.value, null);
  assert.equal(unresolvedCandidate.knownCosts.gas.state, "unresolved_conversion");
});

test("non-exact annualization is explicit rather than silently rounded", () => {
  const input = fixture();
  (input.capital as Record<string, unknown>).horizonSeconds = 10_000;
  const candidate = resultOpportunity(analyzeYieldOpportunities(input));
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.equal(candidate.apy.net.state, "non_exact");
  assert.equal(candidate.apy.net.value, null);
  assert.ok(candidate.violations.some(({ code }) => code === "NET_APY_NON_EXACT"));
});

test("documented basis-point and decimal-fraction scales compare against percentage-point policy", () => {
  const basis = fixture();
  const basisCandidateInput = opportunity(basis);
  basisCandidateInput.apy = {
    scale: {
      status: "documented",
      unit: "basis_points",
      decimalPlaces: 0,
      annualization: "365_day_simple",
      methodology: "Source reports whole basis points under a 365-day simple method."
    },
    baseApy: "400",
    rewardApy: "100",
    grossApy: "500",
    grossComposition: "base_plus_reward"
  };
  basisCandidateInput.economics = {
    ...(basisCandidateInput.economics as Record<string, unknown>),
    annualFeeApy: "50"
  };
  assert.equal(resultOpportunity(analyzeYieldOpportunities(basis)).apy.net.value, "448");

  const fraction = fixture();
  const fractionCandidateInput = opportunity(fraction);
  fractionCandidateInput.apy = {
    scale: {
      status: "documented",
      unit: "decimal_fraction",
      decimalPlaces: 4,
      annualization: "365_day_simple",
      methodology: "Source reports a decimal return fraction to four places."
    },
    baseApy: "0.0400",
    rewardApy: "0.0100",
    grossApy: "0.0500",
    grossComposition: "base_plus_reward"
  };
  fractionCandidateInput.economics = {
    ...(fractionCandidateInput.economics as Record<string, unknown>),
    annualFeeApy: "0.0050"
  };
  assert.equal(resultOpportunity(analyzeYieldOpportunities(fraction)).apy.net.value, "0.0448");
});

test("route history preserves exact values but never upgrades references to realized performance", () => {
  const input = fixture();
  opportunity(input).routeHistory = [
    {
      routeId: "route-1",
      fromProtocol: "venus",
      toProtocol: "lista",
      amountRaw: MAX_UINT256,
      blockNumber: "76543100",
      observedAtUtc: "2026-08-10T10:00:00Z",
      transactionHash: `0x${"ab".repeat(32)}`,
      sourceLocator: source(97, "76543100", "2026-08-10T10:00:00Z", VAULT, ["routeHistory()"])
    }
  ];

  const candidate = resultOpportunity(analyzeYieldOpportunities(input));
  assert.equal(candidate.routeHistory[0]?.amountRaw, MAX_UINT256);
  assert.equal(candidate.routeHistory[0]?.receiptReferenceState, "unverified_reference");
  assert.equal(candidate.realizedPerformance.status, "unknown");
  assert.equal(candidate.realizedPerformance.value, null);
  assert.equal(candidate.violationsTruncated, false);
});

test("future or post-snapshot route history reduces evidence without overflowing diagnostics", () => {
  const input = fixture();
  (opportunity(input).observation as Record<string, unknown>).coveredFields = ["route_history"];
  opportunity(input).routeHistory = Array.from({ length: 16 }, (_, index) => ({
    routeId: `future-route-${String(index)}`,
    fromProtocol: "venus",
    toProtocol: "lista",
    amountRaw: "1",
    blockNumber: (76_543_211 + index).toString(),
    observedAtUtc: "2026-08-11T10:02:00Z",
    transactionHash: null,
    sourceLocator: source(97, (76_543_211 + index).toString(), "2026-08-11T10:02:00Z", VAULT, [
      "routeHistory()"
    ])
  }));

  const candidate = resultOpportunity(analyzeYieldOpportunities(input));
  assert.equal(candidate.decision, "insufficient_evidence");
  assert.equal(candidate.violations.length, 32);
  assert.equal(candidate.violationsTruncated, true);
  assert.ok(candidate.violations.some(({ code }) => code === "ROUTE_HISTORY_IN_FUTURE"));
  assert.ok(candidate.violations.some(({ code }) => code === "ROUTE_HISTORY_AFTER_SNAPSHOT"));
});

test("rejects unsafe sources, chain/block drift, unknown fields, and oversized arrays", () => {
  const legacy = fixture();
  legacy.schemaVersion = 1;
  assert.equal(yieldAnalysisInputSchema.safeParse(legacy).success, false);

  const unsafe = fixture();
  (opportunity(unsafe).observation as Record<string, unknown>).sourceLocator = {
    kind: "http",
    url: "http://yield.example/snapshot",
    publisher: "Example",
    contentSha256: "aa".repeat(32)
  };
  assert.equal(yieldAnalysisInputSchema.safeParse(unsafe).success, false);

  const zeroDigest = fixture();
  (opportunity(zeroDigest).observation as Record<string, unknown>).sourceLocator = {
    kind: "http",
    url: "https://yield.example/snapshot",
    publisher: "Example",
    contentSha256: "00".repeat(32)
  };
  assert.equal(yieldAnalysisInputSchema.safeParse(zeroDigest).success, false);

  const mismatch = fixture();
  const source = (opportunity(mismatch).observation as Record<string, unknown>)
    .sourceLocator as Record<string, unknown>;
  source.blockNumber = "76543211";
  assert.equal(yieldAnalysisInputSchema.safeParse(mismatch).success, false);

  const unboundVault = fixture();
  const unboundObservation = opportunity(unboundVault).observation as Record<string, unknown>;
  (unboundObservation.sourceRelation as Record<string, unknown>).vaultAddress = WBNB;
  assert.equal(yieldAnalysisInputSchema.safeParse(unboundVault).success, false);

  const missingBlockTime = fixture();
  const missingTimeSource = (opportunity(missingBlockTime).observation as Record<string, unknown>)
    .sourceLocator as Record<string, unknown>;
  delete missingTimeSource.blockTimestampUtc;
  assert.equal(yieldAnalysisInputSchema.safeParse(missingBlockTime).success, false);

  const unknown = fixture();
  opportunity(unknown).claimedNetApy = "99";
  assert.equal(yieldAnalysisInputSchema.safeParse(unknown).success, false);

  const oversized = fixture();
  oversized.opportunities = Array.from({ length: 9 }, (_, index) => ({
    ...structuredClone(opportunity(fixture())),
    opportunityId: `vault-${String(index)}`
  }));
  assert.equal(yieldAnalysisInputSchema.safeParse(oversized).success, false);
});

test("A2A adapter is strict, bounded, and always non-executing", () => {
  const success = handleYieldAnalysisA2a({
    skill: "analyze_yield_opportunities",
    ...fixture()
  });
  assert.equal("decision" in success, true);
  assert.equal(success.executionEnabled, false);

  const invalid = handleYieldAnalysisA2a({
    skill: "analyze_yield_opportunities",
    ...fixture(),
    trustedNetApy: "100"
  });
  assert.equal("error" in invalid && invalid.error, "INVALID_ANALYSIS_INPUT");
  assert.ok("issues" in invalid && invalid.issues.length > 0 && invalid.issues.length <= 12);
  assert.equal(invalid.executionEnabled, false);
});

test("A2A executor rejects ambiguous data parts and uses a deterministic response id", async () => {
  const message: Message = {
    kind: "message",
    role: "user",
    messageId: "yield-request-1",
    parts: [
      { kind: "data", data: { skill: "analyze_yield_opportunities", ...fixture() } },
      { kind: "data", data: { skill: "analyze_yield_opportunities", ...fixture() } }
    ]
  };
  const context = new RequestContext(message, "task-1", "context-1");
  const executor = new YieldAnalysisExecutor();

  async function executeOnce(): Promise<Message> {
    const bus = new DefaultExecutionEventBus();
    let response: AgentExecutionEvent | undefined;
    bus.on("event", (event) => {
      response = event;
    });
    await executor.execute(context, bus);
    assert.ok(response);
    assert.equal(response.kind, "message");
    return response;
  }

  const first = await executeOnce();
  const second = await executeOnce();
  assert.equal(first.messageId, second.messageId);
  const dataPart = first.parts.find((part): part is DataPart => part.kind === "data");
  assert.ok(dataPart);
  assert.equal(dataPart.data.error, "INVALID_A2A_ENVELOPE");
  assert.equal(dataPart.data.executionEnabled, false);
});

test("MCP adapter and in-memory server return matching structured evidence", async () => {
  const direct = handleYieldAnalysisMcp(fixture());
  const firstContent = direct.content[0];
  assert.ok(firstContent);
  assert.deepEqual(JSON.parse(firstContent.text), direct.structuredContent);
  assert.equal(direct.structuredContent.executionEnabled, false);

  const server = buildMcpServer();
  const client = new Client({ name: "yield-analysis-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map(({ name }) => name),
      ["analyze_yield_opportunities"]
    );
    const response = await client.callTool({
      name: "analyze_yield_opportunities",
      arguments: fixture()
    });
    assert.equal(response.isError, undefined);
    const structured = response.structuredContent as Record<string, unknown> | undefined;
    assert.ok(structured);
    assert.equal(structured.executionEnabled, false);
    assert.equal(structured.decision, "review_route");

    const invalidResponse = await client.callTool({
      name: "analyze_yield_opportunities",
      arguments: { ...fixture(), callerClaimedNetApy: "100" }
    });
    assert.equal(invalidResponse.isError, true);
  } finally {
    await client.close();
  }
});

test("bounded MCP sessions expire, dispose, and release capacity deterministically", () => {
  let now = 0;
  const disposed: string[] = [];
  const sessions = new BoundedIdleSessionRegistry<string>(
    2,
    1_000,
    () => now,
    (value) => {
      disposed.push(value);
    }
  );

  assert.equal(sessions.add("a", "transport-a"), true);
  assert.equal(sessions.add("b", "transport-b"), true);
  assert.equal(sessions.add("c", "transport-c"), false);
  now = 900;
  assert.equal(sessions.get("a"), "transport-a");
  now = 1_000;
  assert.equal(sessions.prune(), 1);
  assert.deepEqual(disposed, ["transport-b"]);
  assert.equal(sessions.add("c", "transport-c"), true);
  now = 1_900;
  assert.equal(sessions.prune(), 1);
  assert.deepEqual(disposed, ["transport-b", "transport-a"]);
  assert.equal(sessions.size, 1);
});

test("MCP initialization limiter is global, bounded, and independent of forwarded identity", () => {
  const limiter = new FixedWindowMcpInitializationLimiter(2, 1_000);
  assert.equal(limiter.allow({ directPeerAddress: "10.0.0.1", nowMilliseconds: 0 }), true);
  assert.equal(limiter.allow({ directPeerAddress: "10.0.0.2", nowMilliseconds: 1 }), true);
  assert.equal(limiter.allow({ directPeerAddress: null, nowMilliseconds: 2 }), false);
  assert.equal(
    limiter.allow({ directPeerAddress: "spoof-cannot-help", nowMilliseconds: 1_000 }),
    true
  );
  assert.equal(limiter.allow({ directPeerAddress: "10.0.0.1", nowMilliseconds: 999 }), false);
});

test("AgentCard advertises only the honest analysis capability", () => {
  const card = buildAgentCard();
  assert.equal(card.version, "2.0.0");
  assert.deepEqual(
    card.skills.map(({ id }) => id),
    ["analyze_yield_opportunities"]
  );
  assert.match(card.skills[0]?.description ?? "", /never fetches/i);
  assert.doesNotMatch(card.skills[0]?.description ?? "", /execute a route/i);
});
