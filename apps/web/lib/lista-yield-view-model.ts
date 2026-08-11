import type {
  ListaRateLimitMetadata,
  ListaYieldProvenance,
  ListaYieldSource,
  ListaYieldSourceResult
} from "@proofera/integrations";

import { LISTA_YIELD_SOURCE_URL } from "./lista-yield-service";

const LISTA_DOCUMENTATION_URL =
  "https://docs.bsc.lista.org/for-developer/services/lending-api/vault";
const LISTA_SDK_CLIENT_URL =
  "https://raw.githubusercontent.com/lista-dao/lending-sdk/refs/heads/main/packages/moolah-sdk-core/src/api/client.ts";

export const LISTA_YIELD_OFFICIAL_LINKS = Object.freeze({
  source: LISTA_YIELD_SOURCE_URL,
  documentation: LISTA_DOCUMENTATION_URL,
  sdkRepository: "https://github.com/lista-dao/lending-sdk",
  sdkClient: LISTA_SDK_CLIENT_URL,
  bscExplorerOrigin: "https://bscscan.com"
} as const);

export const LISTA_YIELD_UNKNOWN_BOUNDARY_COPY = Object.freeze({
  apyScale:
    "UNKNOWN — Lista's vault-list response does not document the APY scale. The raw decimal is unchanged; no symbol or multiplier is applied.",
  netApy: "UNKNOWN — not computed from source APY, emissions, fees, gas, or withdrawal costs.",
  withdrawableLiquidity:
    "UNKNOWN — deposits and utilization do not establish assets immediately available to withdraw.",
  feeMeaning:
    "UNKNOWN — the endpoint can supply a raw fee field but does not document its scale, basis, or charging event.",
  withdrawalConstraints:
    "UNKNOWN — the vault-list response supplies no lockup, cooldown, minimum, maximum, or exit-fee constraints.",
  realizedPerformance:
    "UNKNOWN — this current source snapshot does not establish realized performance.",
  risk: "UNKNOWN — ProofEra has not evaluated contract, oracle, liquidity, or economic risk from this list response."
} as const);

export interface ListaYieldUnknownBoundaries {
  readonly apyScale: string;
  readonly netApy: string;
  readonly withdrawableLiquidity: string;
  readonly feeMeaning: string;
  readonly withdrawalConstraints: string;
  readonly itemFreshness: string;
  readonly realizedPerformance: string;
  readonly risk: string;
}

export interface ListaYieldSourceView {
  readonly key: string;
  readonly vaultAddress: string;
  readonly vaultExplorerUrl: string;
  readonly name: string;
  readonly environment: "bsc-mainnet";
  readonly asset: {
    readonly address: string;
    readonly explorerUrl: string;
    readonly symbol: string;
    readonly displayDecimals: number;
  };
  readonly curator: string;
  readonly raw: {
    readonly apy: string;
    readonly emissionApy: string | null;
    readonly emissionEnabled: boolean;
    readonly deposits: string;
    readonly depositsUsd: string;
    readonly utilization: string;
    readonly fee: string | null;
  };
  readonly rewards: readonly {
    readonly name: string;
    readonly apy: string;
    readonly total: string;
  }[];
  readonly collateralMarkets: readonly {
    readonly id: string;
    readonly name: string;
    readonly explorerUrl: string;
  }[];
  readonly unknowns: ListaYieldUnknownBoundaries;
  readonly executionEnabled: false;
}

export interface ListaYieldProvenanceView {
  readonly endpoint: "Lista Moolah vault list";
  readonly observedAt: string;
  readonly httpDateUtc: string | null;
  readonly sourceTimestampRaw: string | null;
  readonly sourceTimestampUnit: "undocumented" | "absent";
  readonly itemFreshness: "unknown_no_item_timestamp";
  readonly methodologyVersion: "lista-moolah-vault-list-v1";
  readonly page: 1;
  readonly pageSize: number;
  readonly total: string;
  readonly rateLimit: ListaRateLimitMetadata;
  readonly sourceOrderDisclosure: string;
  readonly executionEnabled: false;
}

export interface ListaYieldAvailableView {
  readonly status: "available";
  readonly provenance: ListaYieldProvenanceView;
  readonly sources: readonly ListaYieldSourceView[];
}

export interface ListaYieldEmptyView {
  readonly status: "empty";
  readonly reason: "source_returned_no_vaults";
  readonly message: string;
  readonly provenance: ListaYieldProvenanceView;
  readonly sources: readonly [];
}

export interface ListaYieldUnavailableView {
  readonly status: "unavailable";
  readonly reason: string;
  readonly stage: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly observedAt: string | null;
  readonly httpStatus: number | null;
  readonly rateLimit: ListaRateLimitMetadata;
  readonly executionEnabled: false;
}

export type ListaYieldSourcesView =
  ListaYieldAvailableView | ListaYieldEmptyView | ListaYieldUnavailableView;

function unknownBoundaries(observedAt: string): ListaYieldUnknownBoundaries {
  return {
    ...LISTA_YIELD_UNKNOWN_BOUNDARY_COPY,
    itemFreshness: `UNKNOWN — no per-item source timestamp is supplied. ${observedAt} is ProofEra retrieval time, not vault freshness.`
  };
}

function toSourceView(source: ListaYieldSource, observedAt: string): ListaYieldSourceView {
  const explorerOrigin = LISTA_YIELD_OFFICIAL_LINKS.bscExplorerOrigin;
  return {
    key: source.vaultAddress,
    vaultAddress: source.vaultAddress,
    vaultExplorerUrl: `${explorerOrigin}/address/${source.vaultAddress}`,
    name: source.name,
    environment: source.environment,
    asset: {
      address: source.asset.address,
      explorerUrl: `${explorerOrigin}/address/${source.asset.address}`,
      symbol: source.asset.symbol,
      displayDecimals: source.asset.displayDecimals
    },
    curator: source.curator,
    raw: {
      apy: source.reportedYield.apy,
      emissionApy: source.reportedYield.emissionApy,
      emissionEnabled: source.reportedYield.emissionEnabled,
      deposits: source.reportedLiquidity.deposits,
      depositsUsd: source.reportedLiquidity.depositsUsd,
      utilization: source.reportedLiquidity.utilization,
      fee: source.reportedFee.value
    },
    rewards: source.rewards.map((reward) => ({
      name: reward.name,
      apy: reward.apy,
      total: reward.total
    })),
    collateralMarkets: source.collateralMarkets.map((market) => ({
      id: market.id,
      name: market.name,
      explorerUrl: `${explorerOrigin}/address/${market.id}`
    })),
    unknowns: unknownBoundaries(observedAt),
    executionEnabled: false
  };
}

function hasExpectedProvenance(provenance: ListaYieldProvenance): boolean {
  return (
    provenance.sourceUrl === LISTA_YIELD_OFFICIAL_LINKS.source &&
    provenance.officialDocumentationUrl === LISTA_YIELD_OFFICIAL_LINKS.documentation &&
    provenance.officialSdkClientUrl === LISTA_YIELD_OFFICIAL_LINKS.sdkClient &&
    provenance.executionEnabled === false
  );
}

function toProvenanceView(
  provenance: ListaYieldProvenance,
  total: string,
  pageSize: number
): ListaYieldProvenanceView {
  return {
    endpoint: provenance.endpoint,
    observedAt: provenance.observedAt,
    httpDateUtc: provenance.httpDateUtc,
    sourceTimestampRaw: provenance.sourceTimestamp.raw,
    sourceTimestampUnit: provenance.sourceTimestamp.unit,
    itemFreshness: provenance.dataFreshness,
    methodologyVersion: provenance.methodologyVersion,
    page: 1,
    pageSize,
    total,
    rateLimit: provenance.rateLimit,
    sourceOrderDisclosure:
      "The request asks Lista for APY-descending source order. ProofEra preserves that order and does not score or endorse it.",
    executionEnabled: false
  };
}

function provenanceMismatch(observedAt: string): ListaYieldUnavailableView {
  return {
    status: "unavailable",
    reason: "source_provenance_mismatch",
    stage: "view-model",
    message: "The validated response did not retain the configured official Lista source links.",
    retryable: false,
    observedAt,
    httpStatus: 200,
    rateLimit: { limit: null, remaining: null, reset: null, retryAfter: null },
    executionEnabled: false
  };
}

/** Converts adapter output to text-only, non-executable route data. */
export function createListaYieldSourcesView(result: ListaYieldSourceResult): ListaYieldSourcesView {
  if (result.status === "unavailable") {
    return {
      status: "unavailable",
      reason: result.reason,
      stage: result.stage,
      message: result.message,
      retryable: result.retryable,
      observedAt: result.observedAt,
      httpStatus: result.httpStatus,
      rateLimit: result.rateLimit,
      executionEnabled: false
    };
  }

  if (!hasExpectedProvenance(result.provenance)) {
    return provenanceMismatch(result.provenance.observedAt);
  }

  const provenance = toProvenanceView(result.provenance, result.total, result.pageSize);
  if (result.status === "empty") {
    return {
      status: "empty",
      reason: result.reason,
      message:
        "Lista answered successfully with zero vaults on the bounded first page. This is an empty source result, not an outage.",
      provenance,
      sources: []
    };
  }

  return {
    status: "available",
    provenance,
    sources: result.sources.map((source) => toSourceView(source, result.provenance.observedAt))
  };
}
