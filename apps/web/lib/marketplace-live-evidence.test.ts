import type {
  PancakeV3LatestAvailableResult,
  VenusHealthAvailableResult
} from "@proofera/integrations";
import { describe, expect, it } from "vitest";

import type { ListaYieldSourcesView } from "./lista-yield-view-model";
import {
  MARKETPLACE_PANCAKE_FIXTURE,
  MARKETPLACE_VENUS_REPLAY,
  createListaMarketplaceLiveEvidence,
  createPancakeMarketplaceLiveEvidence,
  createVenusMarketplaceLiveEvidence
} from "./marketplace-live-evidence";

const token0 = "0x1111111111111111111111111111111111111111";
const token1 = "0x2222222222222222222222222222222222222222";
const blockHash = `0x${"ab".repeat(32)}` as const;
const parentHash = `0x${"cd".repeat(32)}` as const;
const observedAt = "2026-09-01T15:00:02.000Z";

function pancakeAvailable(): PancakeV3LatestAvailableResult {
  return {
    status: "available",
    snapshot: {
      position: {
        id: "37109",
        nonce: "0",
        operator: "0x0000000000000000000000000000000000000000",
        token0,
        token1,
        fee: 500,
        tickLower: -887_270,
        tickUpper: 887_270,
        liquidity: "1000000000000000000",
        feeGrowthInside0LastX128: "0",
        feeGrowthInside1LastX128: "0",
        tokensOwed0: "0",
        tokensOwed1: "0",
        inRange: true
      },
      pool: {
        token0,
        token1,
        fee: 500,
        tickSpacing: 10,
        sqrtPriceX96: "79228162514264337593543950",
        tick: -138_163,
        observationIndex: 0,
        observationCardinality: 1,
        observationCardinalityNext: 1,
        feeProtocol: 0,
        unlocked: true
      }
    },
    provenance: {
      chainId: 97,
      blockNumber: "128000000",
      blockHash,
      blockTimestamp: "2026-09-01T15:00:00.000Z",
      blockTimestampUnix: "1788274800",
      observedAt,
      ageSeconds: 2,
      readsPinnedToBlock: true,
      positionManagerAddress: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
      factoryAddress: "0xE42Bf4bF9D4bE0A7B4dFceA54B30E455e77D7e22",
      poolAddress: MARKETPLACE_PANCAKE_FIXTURE.poolAddress,
      consistency: "atomic_latest_multicall3",
      stageTwoAtomicCallCount: 12,
      multicall3Address: "0x25fb27c3e4a1183aeaa3d4f1d3f8ad0d6d9c1647",
      parentBlockHash: parentHash,
      historicalContractStateRequests: false,
      discoveryUsedAsEvidence: false,
      contractPresenceEvidence: "successful_stage_two_calls",
      codeHashIdentity: "not_established",
      currentBlockHashAvailableInsideSnapshot: false,
      blockHashSource: "post_snapshot_exact_block_header",
      reorgSignalsChecked: "block_number_timestamp_parent_hash"
    }
  };
}

function venusAvailable(): VenusHealthAvailableResult {
  return {
    status: "available",
    snapshot: {
      liquidationThresholdLiquidity: {
        errorCode: "0",
        excessLiquidityRaw: "123",
        shortfallRaw: "0",
        rawUnit: "venus-comptroller-account-liquidity-unit",
        signal: "excess_liquidity_reported"
      },
      liquidationThresholdHealthFactor: {
        status: "not_computed",
        ratioDecimal: null,
        calculationBoundary: "aggregate_liquidity_difference_is_not_a_ratio",
        reason: "The aggregate difference is not a ratio.",
        requiredAuthoritativeInputs: [
          "gross liquidation-threshold-adjusted collateral",
          "gross debt",
          "authoritative oracle prices and decimals",
          "market liquidation thresholds and mode state"
        ]
      },
      methodologyVersion: "venus-core-account-risk-v1",
      limitations: [
        "No ratio is inferred.",
        "No transaction is submitted.",
        "No authority is established."
      ],
      executionEnabled: false
    },
    provenance: {
      chainId: 97,
      environment: "bsc-testnet",
      account: MARKETPLACE_VENUS_REPLAY.account,
      observedAt,
      ageSeconds: 2,
      readsPinnedToBlock: true,
      block: {
        number: "128000000",
        hash: blockHash,
        timestampUnix: "1788274800",
        timestampUtc: "2026-09-01T15:00:00.000Z"
      },
      source: {
        kind: "onchain_contract_read",
        protocol: "Venus Core Pool",
        contractAddress: "0x94c1495cD4c557f1560Cbd68EAB0d197e6291571",
        functionSignature: "getAccountLiquidity(address)",
        officialDeploymentDocumentationUrl: "https://docs-v4.venus.io/deployed-contracts/markets",
        officialContractDocumentationUrl:
          "https://docs-v4.venus.io/technical-reference/reference-core-pool/comptroller/diamond/facets/policy-facet",
        explorerUrl:
          "https://testnet.bscscan.com/address/0x94c1495cD4c557f1560Cbd68EAB0d197e6291571"
      },
      httpFallbackUsed: false
    }
  };
}

function listaAvailable(): ListaYieldSourcesView {
  const unknowns = {
    apyScale: "UNKNOWN",
    netApy: "UNKNOWN",
    withdrawableLiquidity: "UNKNOWN",
    feeMeaning: "UNKNOWN",
    withdrawalConstraints: "UNKNOWN",
    itemFreshness: "UNKNOWN",
    realizedPerformance: "UNKNOWN",
    risk: "UNKNOWN"
  };
  return {
    status: "available",
    provenance: {
      endpoint: "Lista Moolah vault list",
      observedAt,
      httpDateUtc: observedAt,
      sourceTimestampRaw: "1788274802000",
      sourceTimestampUnit: "undocumented",
      itemFreshness: "unknown_no_item_timestamp",
      methodologyVersion: "lista-moolah-vault-list-v2",
      page: 1,
      pageSize: 12,
      total: "21",
      rateLimit: { limit: null, remaining: null, reset: null, retryAfter: null },
      sourceOrderDisclosure: "Source order is preserved.",
      executionEnabled: false
    },
    sources: [
      {
        key: token0,
        vaultAddress: token0,
        vaultExplorerUrl: `https://bscscan.com/address/${token0}`,
        name: "Source vault",
        environment: "bsc-mainnet",
        asset: {
          address: token1,
          explorerUrl: `https://bscscan.com/address/${token1}`,
          symbol: "USDT",
          displayDecimals: 18
        },
        curator: "Source curator",
        raw: {
          apy: "0.255",
          emissionApy: "0",
          emissionEnabled: false,
          deposits: "1000",
          depositsUsd: "999",
          utilization: "0.9",
          fee: "0.1"
        },
        rewards: [],
        collateralMarkets: [],
        unknowns,
        executionEnabled: false
      }
    ]
  };
}

describe("marketplace live evidence view", () => {
  it("gives LP and Grid equal live depth without converting pool state into performance", () => {
    const lp = createPancakeMarketplaceLiveEvidence("lp-rebalancing", pancakeAvailable());
    const grid = createPancakeMarketplaceLiveEvidence("grid-trading", pancakeAvailable());

    expect(lp).toMatchObject({
      status: "available",
      environment: "bsc-testnet",
      observedAt,
      executionEnabled: false,
      fallbackApplied: false
    });
    expect(grid).toMatchObject({
      status: "available",
      environment: "bsc-testnet",
      observedAt,
      executionEnabled: false,
      fallbackApplied: false
    });
    expect(lp.facts).toHaveLength(5);
    expect(grid.facts).toHaveLength(5);
    expect(lp.limitations.join(" ")).toContain("not established");
    expect(grid.limitations.join(" ")).toContain("No order placement");
  });

  it("shows raw Venus liquidity while keeping health factor unknown", () => {
    const view = createVenusMarketplaceLiveEvidence(venusAvailable());

    expect(view.status).toBe("available");
    expect(view.facts).toContainEqual({ label: "Health factor", value: "UNKNOWN / not computed" });
    expect(view.boundary).toContain("unrelated public replay subject");
    expect(view.executionEnabled).toBe(false);
  });

  it("preserves Lista source order and raw decimals without endorsing the first result", () => {
    const view = createListaMarketplaceLiveEvidence(listaAvailable());

    expect(view).toMatchObject({
      status: "available",
      environment: "bsc-mainnet",
      methodology: "lista-moolah-vault-list-v2",
      observedAt,
      executionEnabled: false,
      fallbackApplied: false
    });
    expect(view.facts).toContainEqual({ label: "APY / raw decimal", value: "0.255" });
    expect(view.boundary).toContain("does not rank or endorse");
  });

  it("keeps source failure terminal and applies no fixture fallback", () => {
    const view = createPancakeMarketplaceLiveEvidence("lp-rebalancing", {
      status: "unavailable",
      reason: "read_error",
      stage: "snapshot",
      message: "Current source read failed.",
      retryable: true,
      observedAt,
      chainId: 97,
      blockNumber: null
    });

    expect(view).toMatchObject({
      status: "unavailable",
      facts: [],
      fallbackApplied: false,
      boundary: "Current source read failed."
    });
  });
});
