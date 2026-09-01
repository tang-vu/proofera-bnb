import type { PancakeV3LatestSnapshotResult } from "@proofera/integrations";

import type { MarketplaceCategory } from "./marketplace-query";
import type { PancakePositionInput } from "./pancake-position-query";
import type { PancakePositionRouteResult } from "./pancake-position-service";
import type { ListaYieldSourcesView } from "./lista-yield-view-model";
import type { VenusHealthInput } from "./venus-health-query";
import type { VenusHealthRouteResult } from "./venus-health-service";

export const MARKETPLACE_PANCAKE_FIXTURE = Object.freeze({
  chainId: 97,
  poolAddress: "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE",
  positionId: "37109"
} as const satisfies PancakePositionInput);

export const MARKETPLACE_VENUS_REPLAY = Object.freeze({
  chainId: 97,
  account: "0x64DF36Cb7ef4ab5191A21b68e48954D09D4FBf6B"
} as const satisfies VenusHealthInput);

export interface MarketplaceLiveEvidenceFact {
  readonly label: string;
  readonly value: string;
}

export interface MarketplaceLiveEvidenceView {
  readonly category: MarketplaceCategory;
  readonly status: "available" | "empty" | "unavailable";
  readonly title: string;
  readonly source: string;
  readonly environment: "bsc-mainnet" | "bsc-testnet";
  readonly observedAt: string | null;
  readonly freshness: string;
  readonly methodology: string;
  readonly facts: readonly MarketplaceLiveEvidenceFact[];
  readonly boundary: string;
  readonly limitations: readonly string[];
  readonly sourceHref: string;
  readonly sourceLinkLabel: string;
  readonly executionEnabled: false;
  readonly fallbackApplied: false;
}

function unavailablePancakeView(
  category: "lp-rebalancing" | "grid-trading",
  result: Extract<PancakePositionRouteResult, { readonly status: "unavailable" }>
): MarketplaceLiveEvidenceView {
  return {
    category,
    status: "unavailable",
    title: "No current Pancake position snapshot was established",
    source: "PancakeSwap V3 / controlled ProofEra fixture",
    environment: "bsc-testnet",
    observedAt: result.observedAt,
    freshness: `Unavailable / ${result.stage.replaceAll("_", " ")} / ${result.reason.replaceAll("_", " ")}`,
    methodology: "atomic_latest_multicall3",
    facts: [],
    boundary: result.message,
    limitations: [
      "No fixture or historical snapshot replaced the failed current read.",
      "No range, grid, performance, or execution conclusion follows from source unavailability."
    ],
    sourceHref: `/pancake-position?chainId=97&poolAddress=${MARKETPLACE_PANCAKE_FIXTURE.poolAddress}&positionId=${MARKETPLACE_PANCAKE_FIXTURE.positionId}`,
    sourceLinkLabel: "Retry the exact Pancake read",
    executionEnabled: false,
    fallbackApplied: false
  };
}

export function createPancakeMarketplaceLiveEvidence(
  category: "lp-rebalancing" | "grid-trading",
  result: PancakeV3LatestSnapshotResult | PancakePositionRouteResult
): MarketplaceLiveEvidenceView {
  if (result.status === "unavailable") return unavailablePancakeView(category, result);

  const { pool, position } = result.snapshot;
  const sharedFacts: readonly MarketplaceLiveEvidenceFact[] =
    category === "lp-rebalancing"
      ? [
          { label: "Current tick", value: pool.tick.toString(10) },
          {
            label: "Position range",
            value: `[${position.tickLower.toString(10)}, ${position.tickUpper.toString(10)})`
          },
          { label: "Range state", value: position.inRange ? "In range" : "Out of range" },
          { label: "Position liquidity / raw", value: position.liquidity },
          { label: "Fee tier / raw", value: position.fee.toString(10) }
        ]
      : [
          { label: "Current tick", value: pool.tick.toString(10) },
          { label: "sqrtPriceX96 / raw", value: pool.sqrtPriceX96 },
          { label: "Tick spacing", value: pool.tickSpacing.toString(10) },
          {
            label: "Oracle observations",
            value: `${pool.observationCardinality.toString(10)} current / ${pool.observationCardinalityNext.toString(10)} next`
          },
          { label: "Pool lock state", value: pool.unlocked ? "Unlocked" : "Locked" }
        ];

  return {
    category,
    status: "available",
    title:
      category === "lp-rebalancing"
        ? "Current range state at one atomic block"
        : "Current pool state before any grid decision",
    source: "PancakeSwap V3 / controlled ProofEra fixture",
    environment: "bsc-testnet",
    observedAt: result.provenance.observedAt,
    freshness: `Block ${result.provenance.blockNumber} / ${result.provenance.ageSeconds.toString(10)}s old at observation / 120s maximum admitted`,
    methodology: result.provenance.consistency,
    facts: sharedFacts,
    boundary:
      category === "lp-rebalancing"
        ? "This is ProofEra's controlled, fixed-asset testnet position. It establishes current range state, not market value or a profitable rebalance."
        : "This pool read is a live preflight signal only. It contains no grid orders, fills, PnL, volatility window, or execution authority.",
    limitations:
      category === "lp-rebalancing"
        ? [
            "Fee APR, impermanent loss, gas-adjusted benefit, and realized performance are not established.",
            "The owner-executed testnet fixture is not autonomous-agent performance."
          ]
        : [
            "One tick and one observation depth do not establish a viable grid range.",
            "No order placement, swap, wallet access, or transaction is enabled."
          ],
    sourceHref: `/pancake-position?chainId=97&poolAddress=${MARKETPLACE_PANCAKE_FIXTURE.poolAddress}&positionId=${MARKETPLACE_PANCAKE_FIXTURE.positionId}`,
    sourceLinkLabel: "Inspect the exact Pancake snapshot",
    executionEnabled: false,
    fallbackApplied: false
  };
}

export function createVenusMarketplaceLiveEvidence(
  result: VenusHealthRouteResult
): MarketplaceLiveEvidenceView {
  if (result.status === "unavailable") {
    const observedAt = "observedAt" in result ? result.observedAt : result.provenance?.observedAt;
    return {
      category: "health-factor-monitoring",
      status: "unavailable",
      title: "No current Venus account snapshot was established",
      source: "Venus Core Pool / unrelated public replay account",
      environment: "bsc-testnet",
      observedAt: observedAt ?? null,
      freshness: `Unavailable / ${result.stage.replaceAll("_", " ")} / ${result.reason.replaceAll("_", " ")}`,
      methodology: "venus-core-account-risk-v1",
      facts: [],
      boundary: result.message,
      limitations: [
        "No historical account result replaced the failed current read.",
        "No health-factor, alert, intervention, or authority claim follows from unavailability."
      ],
      sourceHref: `/venus-health?chainId=97&account=${MARKETPLACE_VENUS_REPLAY.account}`,
      sourceLinkLabel: "Retry the exact Venus read",
      executionEnabled: false,
      fallbackApplied: false
    };
  }

  const liquidity = result.snapshot.liquidationThresholdLiquidity;
  return {
    category: "health-factor-monitoring",
    status: "available",
    title: "Current account-liquidity signal at one pinned block",
    source: "Venus Core Pool / unrelated public replay account",
    environment: "bsc-testnet",
    observedAt: result.provenance.observedAt,
    freshness: `Block ${result.provenance.block.number} / ${result.provenance.ageSeconds.toString(10)}s old at observation / 120s maximum admitted`,
    methodology: result.snapshot.methodologyVersion,
    facts: [
      { label: "Excess liquidity / raw", value: liquidity.excessLiquidityRaw },
      { label: "Shortfall / raw", value: liquidity.shortfallRaw },
      { label: "Contract signal", value: liquidity.signal.replaceAll("_", " ") },
      { label: "Health factor", value: "UNKNOWN / not computed" },
      { label: "Block hash", value: result.provenance.block.hash }
    ],
    boundary:
      "The account is an unrelated public replay subject. getAccountLiquidity returns a difference, not the gross inputs needed for a defensible health-factor ratio.",
    limitations: [
      "ProofEra has no ownership, permission, or intervention authority over this account.",
      "Alert latency, breach coverage, and autonomous protection performance are not established."
    ],
    sourceHref: `/venus-health?chainId=97&account=${MARKETPLACE_VENUS_REPLAY.account}`,
    sourceLinkLabel: "Inspect the exact Venus snapshot",
    executionEnabled: false,
    fallbackApplied: false
  };
}

export function createListaMarketplaceLiveEvidence(
  view: ListaYieldSourcesView
): MarketplaceLiveEvidenceView {
  if (view.status === "unavailable") {
    return {
      category: "yield-optimisation",
      status: "unavailable",
      title: "No current Lista yield-source snapshot was established",
      source: "Lista Moolah vault list / official API",
      environment: "bsc-mainnet",
      observedAt: view.observedAt,
      freshness: `Unavailable / ${view.stage.replaceAll("_", " ")} / ${view.reason.replaceAll("_", " ")}`,
      methodology: "lista-moolah-vault-list-v2",
      facts: [],
      boundary: view.message,
      limitations: [
        "No cached list or fixture replaced the failed official response.",
        "No APY, liquidity, route, risk, or performance conclusion follows from unavailability."
      ],
      sourceHref: "/yield-sources",
      sourceLinkLabel: "Retry the official Lista read",
      executionEnabled: false,
      fallbackApplied: false
    };
  }

  if (view.status === "empty") {
    return {
      category: "yield-optimisation",
      status: "empty",
      title: "Lista returned an authoritative empty first page",
      source: "Lista Moolah vault list / official API",
      environment: "bsc-mainnet",
      observedAt: view.provenance.observedAt,
      freshness: "Unknown per item / retrieval time only",
      methodology: view.provenance.methodologyVersion,
      facts: [{ label: "Source total", value: view.provenance.total }],
      boundary: view.message,
      limitations: [
        "An empty bounded page is not proof that no yield source exists.",
        "No fixture, recommendation, or execution path is substituted."
      ],
      sourceHref: "/yield-sources",
      sourceLinkLabel: "Inspect the official Lista response",
      executionEnabled: false,
      fallbackApplied: false
    };
  }

  const first = view.sources[0];
  if (first === undefined) throw new TypeError("Available Lista view must contain a source.");
  return {
    category: "yield-optimisation",
    status: "available",
    title: "Current source-reported yield fields, without a recommendation",
    source: "Lista Moolah vault list / official API",
    environment: "bsc-mainnet",
    observedAt: view.provenance.observedAt,
    freshness: "Unknown per item / ProofEra retrieval time only",
    methodology: view.provenance.methodologyVersion,
    facts: [
      { label: "Source total", value: view.provenance.total },
      { label: "First source / source order", value: `${first.name} / ${first.asset.symbol}` },
      { label: "APY / raw decimal", value: first.raw.apy },
      { label: "Deposits USD / raw decimal", value: first.raw.depositsUsd },
      { label: "Utilization / raw decimal", value: first.raw.utilization }
    ],
    boundary:
      "Lista supplied current raw decimals, but their APY scale and item freshness are undocumented. ProofEra preserves source order and does not rank or endorse it.",
    limitations: [
      "Net APY, withdrawable liquidity, exit constraints, and fee meaning remain unknown.",
      "Contract, oracle, liquidity, economic risk, and realized performance are not established."
    ],
    sourceHref: "/yield-sources",
    sourceLinkLabel: "Inspect all bounded Lista fields",
    executionEnabled: false,
    fallbackApplied: false
  };
}
