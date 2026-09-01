import type {
  ListaYieldAvailableResult,
  ListaYieldProvenance,
  ListaYieldSourceResult
} from "@proofera/integrations";
import { describe, expect, it } from "vitest";

import { LISTA_YIELD_SOURCE_URL } from "./lista-yield-service";
import { LISTA_YIELD_OFFICIAL_LINKS, createListaYieldSourcesView } from "./lista-yield-view-model";

const vault = "0x1111111111111111111111111111111111111111";
const asset = "0x2222222222222222222222222222222222222222";
const collateral = "0x3333333333333333333333333333333333333333";
const observedAt = "2026-08-11T18:30:00.000Z";

const provenance: ListaYieldProvenance = {
  sourceUrl: LISTA_YIELD_SOURCE_URL,
  observedAt,
  sourceTimestamp: {
    raw: "1786466600123",
    unit: "undocumented",
    utc: null
  },
  httpDateUtc: "2026-08-11T18:29:59.000Z",
  httpStatus: 200,
  rateLimit: { limit: "100", remaining: "99", reset: "1786466660", retryAfter: null },
  endpoint: "Lista Moolah vault list",
  officialDocumentationUrl: LISTA_YIELD_OFFICIAL_LINKS.documentation,
  officialSdkClientUrl: LISTA_YIELD_OFFICIAL_LINKS.sdkClient,
  methodologyVersion: "lista-moolah-vault-list-v2",
  methodologyBoundary: {
    reportedValuesOnly: true,
    apyScale: "undocumented",
    netApy: "not_computed",
    withdrawableLiquidity: "not_computed",
    withdrawalConstraints: "not_evaluated",
    realizedPerformance: "not_evaluated",
    risk: "not_evaluated"
  },
  dataFreshness: "unknown_no_item_timestamp",
  executionEnabled: false
};

function availableResult(): ListaYieldAvailableResult {
  return {
    status: "available",
    total: "1",
    page: 1,
    pageSize: 12,
    provenance,
    sources: [
      {
        vaultAddress: vault,
        chainId: 56,
        environment: "bsc-mainnet",
        name: "<script>text-only vault</script>",
        asset: { address: asset, symbol: "lisUSD", displayDecimals: 18 },
        curator: "Lista DAO",
        reportedYield: {
          apy: "0.123456789012345678901234567890123456789",
          emissionApy: "0.010000000000000000001",
          emissionEnabled: true,
          scale: "source-reported-undocumented-scale",
          netApy: null,
          netApyState: "unknown"
        },
        reportedLiquidity: {
          deposits: "123456789012345678901234567890.000000000000000001",
          depositsUsd: "987654321098765432109876543210.999999999999999999",
          utilization: "0.876543210987654321",
          withdrawableAssets: null,
          units: "source-reported-human-readable-decimals"
        },
        reportedFee: { value: "0.001000000000000000", interpretation: null },
        rewards: [
          {
            name: "LISTA",
            apy: "0.010000000000000000001",
            total: "12345678901234567890.000000000000000001"
          }
        ],
        collateralMarkets: [
          {
            id: collateral,
            idKind: "address",
            name: "slisBNB / BNB",
            loanSymbol: null,
            allocation: null
          }
        ],
        withdrawalConstraints: {
          state: "unknown",
          lockup: null,
          cooldown: null,
          minimum: null,
          maximum: null,
          fee: null,
          reason: "vault_list_endpoint_does_not_supply_withdrawal_constraints"
        },
        realizedPerformance: null,
        riskAssessment: null
      }
    ]
  };
}

describe("createListaYieldSourcesView", () => {
  it("preserves every source decimal and makes all unsupported decisions explicitly unknown", () => {
    const result = createListaYieldSourcesView(availableResult());

    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected available view.");
    expect(result.sources[0]).toMatchObject({
      name: "<script>text-only vault</script>",
      raw: {
        apy: "0.123456789012345678901234567890123456789",
        emissionApy: "0.010000000000000000001",
        deposits: "123456789012345678901234567890.000000000000000001",
        depositsUsd: "987654321098765432109876543210.999999999999999999",
        utilization: "0.876543210987654321",
        fee: "0.001000000000000000"
      },
      rewards: [
        {
          name: "LISTA",
          apy: "0.010000000000000000001",
          total: "12345678901234567890.000000000000000001"
        }
      ],
      unknowns: {
        apyScale: expect.stringContaining("UNKNOWN"),
        netApy: expect.stringContaining("UNKNOWN"),
        withdrawableLiquidity: expect.stringContaining("UNKNOWN"),
        feeMeaning: expect.stringContaining("UNKNOWN"),
        withdrawalConstraints: expect.stringContaining("UNKNOWN"),
        itemFreshness: expect.stringContaining(observedAt),
        realizedPerformance: expect.stringContaining("UNKNOWN"),
        risk: expect.stringContaining("UNKNOWN")
      },
      executionEnabled: false
    });
    expect(result.sources[0]?.vaultExplorerUrl).toBe(
      `${LISTA_YIELD_OFFICIAL_LINKS.bscExplorerOrigin}/address/${vault}`
    );
    expect(result.sources[0]?.asset.explorerUrl).toBe(
      `${LISTA_YIELD_OFFICIAL_LINKS.bscExplorerOrigin}/address/${asset}`
    );
    expect(result.provenance.sourceOrderDisclosure).toContain("does not score or endorse");
    expect(JSON.stringify(result)).not.toContain("icon");
  });

  it("distinguishes a successful zero-vault response from source unavailability", () => {
    const result = createListaYieldSourcesView({
      status: "empty",
      sources: [],
      total: "0",
      page: 1,
      pageSize: 12,
      reason: "source_returned_no_vaults",
      provenance
    });

    expect(result).toMatchObject({
      status: "empty",
      reason: "source_returned_no_vaults",
      sources: [],
      provenance: { total: "0", observedAt }
    });
    if (result.status !== "empty") throw new Error("Expected empty view.");
    expect(result.message).toContain("not an outage");
  });

  it("keeps adapter failure explicit and never adds a source collection", () => {
    const unavailable: ListaYieldSourceResult = {
      status: "unavailable",
      reason: "rate_limited",
      stage: "response",
      message: "Lista rate-limited the bounded request.",
      retryable: true,
      sourceUrl: LISTA_YIELD_SOURCE_URL,
      observedAt,
      httpStatus: 429,
      rateLimit: { limit: "100", remaining: "0", reset: null, retryAfter: "30" },
      upstreamCode: null,
      executionEnabled: false
    };

    const result = createListaYieldSourcesView(unavailable);

    expect(result).toEqual({
      status: "unavailable",
      reason: "rate_limited",
      stage: "response",
      message: "Lista rate-limited the bounded request.",
      retryable: true,
      observedAt,
      httpStatus: 429,
      rateLimit: { limit: "100", remaining: "0", reset: null, retryAfter: "30" },
      executionEnabled: false
    });
    expect("sources" in result).toBe(false);
  });

  it("fails closed when successful adapter provenance no longer matches known official links", () => {
    const mismatched: ListaYieldAvailableResult = {
      ...availableResult(),
      provenance: { ...provenance, sourceUrl: "https://untrusted.example/vaults" }
    };

    const result = createListaYieldSourcesView(mismatched);

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "source_provenance_mismatch",
      stage: "view-model",
      retryable: false,
      executionEnabled: false
    });
    expect("sources" in result).toBe(false);
  });
});
