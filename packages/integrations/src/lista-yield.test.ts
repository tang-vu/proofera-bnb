import { describe, expect, it, vi } from "vitest";

import {
  LISTA_MAX_RESPONSE_BYTES,
  LISTA_PRODUCTION_API_ORIGIN,
  createListaYieldSourceReader,
  type ListaYieldSourceRequest
} from "./lista-yield";

const VAULT = "0x1111111111111111111111111111111111111111";
const ASSET = "0x2222222222222222222222222222222222222222";
const COLLATERAL = "0x3333333333333333333333333333333333333333";
const MARKET_ID = `0x${"ab".repeat(32)}`;
const OBSERVED_AT = "2026-08-11T16:00:30.000Z";

const defaultVault = {
  address: VAULT,
  name: "Lista USD Vault",
  icon: "https://assets.lista.org/vault.png",
  deposits: "1234567890123456789012345678901234567890.12345678901234567890",
  depositsUsd: "9876543210987654321098765432109876543210.98765432109876543210",
  asset: ASSET,
  assetSymbol: "lisUSD",
  assetIcon: "https://assets.lista.org/lisusd.png",
  displayDecimal: 6,
  curator: "Lista DAO",
  curatorIcon: "https://assets.lista.org/curator.png",
  apy: `0.${"1234567890".repeat(6)}`,
  emissionApy: "0.012500000000000000",
  emissionDetail: {
    LISTA: {
      apy: "0.012500000000000000",
      icon: "https://assets.lista.org/lista.png",
      total: "12345678901234567890.000000000000000001"
    }
  },
  emissionEnabled: 1,
  collaterals: [
    {
      name: "slisBNB / BNB",
      icon: "https://assets.lista.org/slisbnb.png",
      id: COLLATERAL
    }
  ],
  zone: 0,
  utilization: "0.876543210987654321",
  chain: "bsc",
  fee: "0.001000000000000000"
};

function request(overrides: Partial<ListaYieldSourceRequest> = {}): ListaYieldSourceRequest {
  return {
    chainId: 56,
    apiBaseUrl: LISTA_PRODUCTION_API_ORIGIN,
    pageSize: 2,
    timeoutMs: 1_000,
    ...overrides
  };
}

function expectedUrl(pageSize = 2): string {
  return `${LISTA_PRODUCTION_API_ORIGIN}/api/moolah/vault/list?page=1&pageSize=${pageSize}&chain=bsc&sort=apy&order=desc`;
}

function envelope(list: unknown[] = [defaultVault], total = list.length) {
  return {
    code: "000000000",
    msg: "success",
    data: { total, list },
    timestamp: 1_786_464_000_123
  };
}

function withResponseUrl(response: Response, url: string, redirected = false): Response {
  Object.defineProperty(response, "url", { configurable: true, value: url });
  Object.defineProperty(response, "redirected", { configurable: true, value: redirected });
  return response;
}

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  url = expectedUrl(),
  redirected = false
): Response {
  return withResponseUrl(
    new Response(JSON.stringify(body), {
      ...init,
      headers: { "content-type": "application/json", ...init.headers }
    }),
    url,
    redirected
  );
}

function createReader(fetchMock: typeof globalThis.fetch) {
  return createListaYieldSourceReader({
    fetch: fetchMock,
    now: () => new Date(OBSERVED_AT)
  });
}

describe("Lista yield-source adapter", () => {
  it("preserves exact yield/liquidity decimals and exposes methodology unknowns", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(envelope(), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          date: "Tue, 11 Aug 2026 16:00:29 GMT",
          "ratelimit-limit": "10000000000000000000000000000000",
          "ratelimit-remaining": "9999999999999999999999999999999",
          "ratelimit-reset": "Tue, 11 Aug 2026 16:01:00 GMT",
          "retry-after": "2"
        }
      })
    );

    const result = await createReader(fetchMock).getYieldSources(request());

    expect(result).toMatchObject({
      status: "available",
      total: "1",
      page: 1,
      pageSize: 2,
      sources: [
        {
          vaultAddress: VAULT,
          chainId: 56,
          environment: "bsc-mainnet",
          asset: { address: ASSET, symbol: "lisUSD", displayDecimals: 6 },
          reportedYield: {
            apy: defaultVault.apy,
            emissionApy: "0.012500000000000000",
            emissionEnabled: true,
            scale: "source-reported-undocumented-scale",
            netApy: null,
            netApyState: "unknown"
          },
          reportedLiquidity: {
            deposits: defaultVault.deposits,
            depositsUsd: defaultVault.depositsUsd,
            utilization: "0.876543210987654321",
            withdrawableAssets: null
          },
          reportedFee: {
            value: "0.001000000000000000",
            interpretation: null
          },
          rewards: [
            {
              name: "LISTA",
              apy: "0.012500000000000000",
              total: "12345678901234567890.000000000000000001"
            }
          ],
          collateralMarkets: [{ id: COLLATERAL, name: "slisBNB / BNB" }],
          withdrawalConstraints: {
            state: "unknown",
            lockup: null,
            cooldown: null,
            fee: null,
            reason: "vault_list_endpoint_does_not_supply_withdrawal_constraints"
          },
          realizedPerformance: null,
          riskAssessment: null
        }
      ],
      provenance: {
        sourceUrl: expectedUrl(),
        observedAt: OBSERVED_AT,
        sourceTimestamp: {
          raw: "1786464000123",
          unit: "undocumented",
          utc: null
        },
        httpDateUtc: "2026-08-11T16:00:29.000Z",
        rateLimit: {
          limit: "10000000000000000000000000000000",
          remaining: "9999999999999999999999999999999",
          reset: "Tue, 11 Aug 2026 16:01:00 GMT",
          retryAfter: "2"
        },
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
      }
    });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchCall = fetchMock.mock.calls[0];
    if (fetchCall === undefined) throw new Error("Expected one fetch call");
    const [fetchInput, fetchInit] = fetchCall;
    expect(fetchInput.toString()).toBe(expectedUrl());
    expect(fetchInit).toMatchObject({
      method: "GET",
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store"
    });
    expect(new Headers(fetchInit?.headers).get("accept")).toBe("application/json");
    expect(fetchInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("accepts the bounded production market-ID additions without treating bytes32 as an address", async () => {
    const currentShape = {
      ...defaultVault,
      collaterals: [
        {
          name: "PT market",
          icon: "https://assets.lista.org/pt.png",
          id: MARKET_ID.toUpperCase().replace("0X", "0x"),
          loanSymbol: "USDT",
          allocation: "1.000000000000000000"
        }
      ],
      marketIds: [MARKET_ID],
      styleType: 1,
      holderEmissionApy: "0"
    };
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope([currentShape], 1)));

    const result = await createReader(fetchMock).getYieldSources(request());

    expect(result).toMatchObject({
      status: "available",
      sources: [
        {
          collateralMarkets: [
            {
              id: MARKET_ID,
              idKind: "bytes32",
              name: "PT market",
              loanSymbol: "USDT",
              allocation: "1.000000000000000000"
            }
          ]
        }
      ]
    });
  });

  it("requires production marketIds to agree exactly with collateral identifiers", async () => {
    const mismatched = {
      ...defaultVault,
      marketIds: [MARKET_ID]
    };
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope([mismatched], 1)));

    const result = await createReader(fetchMock).getYieldSources(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "schema_drift",
      stage: "schema"
    });
  });

  it("distinguishes an authoritative empty first page from unavailability", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope([], 0)));

    const result = await createReader(fetchMock).getYieldSources(request());

    expect(result).toMatchObject({
      status: "empty",
      sources: [],
      total: "0",
      reason: "source_returned_no_vaults",
      provenance: { sourceUrl: expectedUrl(), httpStatus: 200 }
    });
  });

  it("rejects unsupported chains, non-official URLs, unbounded requests, and extra fields", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope()));
    const reader = createReader(fetchMock);
    const invalidRequests: unknown[] = [
      { ...request(), chainId: 97 },
      { ...request(), apiBaseUrl: "http://api.lista.org" },
      { ...request(), apiBaseUrl: "https://api.lista.org/" },
      { ...request(), apiBaseUrl: "https://evil.example" },
      { ...request(), pageSize: 26 },
      { ...request(), timeoutMs: 10_001 },
      { ...request(), unexpected: true }
    ];

    for (const input of invalidRequests) {
      const result = await reader.getYieldSources(input as ListaYieldSourceRequest);
      expect(result).toMatchObject({
        status: "unavailable",
        reason: "invalid_request",
        stage: "request",
        sourceUrl: null,
        retryable: false
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects redirects and response URL mismatches", async () => {
    const redirectFetch = vi.fn<typeof fetch>(async () =>
      jsonResponse(envelope(), {}, "https://other.example/api/moolah/vault/list", true)
    );
    const mismatchFetch = vi.fn<typeof fetch>(async () =>
      jsonResponse(envelope(), {}, `${expectedUrl()}&extra=true`)
    );

    const redirected = await createReader(redirectFetch).getYieldSources(request());
    const mismatched = await createReader(mismatchFetch).getYieldSources(request());

    expect(redirected).toMatchObject({
      status: "unavailable",
      reason: "source_url_mismatch",
      stage: "response"
    });
    expect(mismatched).toMatchObject({
      status: "unavailable",
      reason: "source_url_mismatch",
      stage: "response"
    });
  });

  it("reports HTTP 429 with exact bounded rate-limit metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        { ignored: true },
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-limit": "100",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1786464060",
            "retry-after": "30"
          }
        }
      )
    );

    const result = await createReader(fetchMock).getYieldSources(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "rate_limited",
      stage: "response",
      retryable: true,
      httpStatus: 429,
      rateLimit: {
        limit: "100",
        remaining: "0",
        reset: "1786464060",
        retryAfter: "30"
      }
    });
  });

  it("reports 5xx separately and never turns it into an empty list", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ message: "unavailable" }, { status: 503 })
    );

    const result = await createReader(fetchMock).getYieldSources(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "upstream_unavailable",
      stage: "response",
      retryable: true,
      httpStatus: 503
    });
    expect("sources" in result).toBe(false);
  });

  it("rejects malformed, contradictory, or unbounded rate-limit headers", async () => {
    const responses = [
      jsonResponse(envelope(), {
        headers: {
          "content-type": "application/json",
          "x-ratelimit-limit": "9".repeat(129)
        }
      }),
      jsonResponse(envelope(), {
        headers: {
          "content-type": "application/json",
          "x-ratelimit-limit": "10",
          "x-ratelimit-remaining": "11"
        }
      }),
      jsonResponse(envelope(), {
        headers: {
          "content-type": "application/json",
          "x-ratelimit-reset": "not-a-date-or-integer"
        }
      })
    ];

    for (const response of responses) {
      const fetchMock = vi.fn<typeof fetch>(async () => response);
      const result = await createReader(fetchMock).getYieldSources(request());
      expect(result).toMatchObject({
        status: "unavailable",
        reason: "invalid_response_metadata",
        stage: "response",
        retryable: false
      });
    }
  });

  it("times out a hanging fetch through the combined internal signal", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          );
        })
    );

    const result = await createReader(fetchMock).getYieldSources(request({ timeoutMs: 10 }));

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "timeout",
      stage: "fetch",
      retryable: true,
      httpStatus: null
    });
  });

  it("honors an external abort without dispatching fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope()));
    const controller = new AbortController();
    controller.abort("caller stopped");

    const result = await createReader(fetchMock).getYieldSources(request(), {
      signal: controller.signal
    });

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "aborted",
      stage: "fetch",
      retryable: false
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops a streamed body once it exceeds one million bytes", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(LISTA_MAX_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      }
    });
    const response = withResponseUrl(
      new Response(stream, { headers: { "content-type": "application/json" } }),
      expectedUrl()
    );
    const fetchMock = vi.fn<typeof fetch>(async () => response);

    const result = await createReader(fetchMock).getYieldSources(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "oversized_response",
      stage: "body",
      retryable: false
    });
  });

  it("rejects schema drift instead of silently substituting fields", async () => {
    const missingApy = { ...defaultVault } as Record<string, unknown>;
    delete missingApy.apy;
    const extraEnvelope = { ...envelope(), undocumented: "drift" };
    const cases = [envelope([missingApy], 1), extraEnvelope];

    for (const body of cases) {
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(body));
      const result = await createReader(fetchMock).getYieldSources(request());
      expect(result).toMatchObject({
        status: "unavailable",
        reason: "schema_drift",
        stage: "schema"
      });
    }
  });

  it("rejects adversarial monetary, APY, TVL, and utilization representations", async () => {
    const invalidDecimals: unknown[] = [
      -1,
      "-0.1",
      "1e-3",
      "01.2",
      ".5",
      "1.",
      `1.${"1".repeat(61)}`,
      "9".repeat(79),
      "1".repeat(97)
    ];
    const fields = ["deposits", "depositsUsd", "apy", "utilization"] as const;

    for (const field of fields) {
      for (const value of invalidDecimals) {
        const item = { ...defaultVault, [field]: value };
        const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope([item], 1)));
        const result = await createReader(fetchMock).getYieldSources(request());
        expect(result).toMatchObject({
          status: "unavailable",
          reason: "schema_drift",
          stage: "schema"
        });
      }
    }
  });

  it("rejects invalid chain/address relations and unbounded metadata", async () => {
    const cases = [
      { ...defaultVault, chain: "ethereum" },
      { ...defaultVault, address: "not-an-address" },
      { ...defaultVault, address: "0x0000000000000000000000000000000000000000" },
      { ...defaultVault, asset: VAULT },
      { ...defaultVault, name: "x".repeat(201) },
      {
        ...defaultVault,
        collaterals: [defaultVault.collaterals[0], defaultVault.collaterals[0]]
      }
    ];

    for (const item of cases) {
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope([item], 1)));
      const result = await createReader(fetchMock).getYieldSources(request());
      expect(result).toMatchObject({
        status: "unavailable",
        reason: "schema_drift",
        stage: "schema"
      });
    }
  });

  it("rejects malformed JSON, empty bodies, invalid content lengths, and non-JSON success", async () => {
    const cases: Response[] = [
      withResponseUrl(
        new Response("{", { headers: { "content-type": "application/json" } }),
        expectedUrl()
      ),
      withResponseUrl(
        new Response(null, { headers: { "content-type": "application/json" } }),
        expectedUrl()
      ),
      withResponseUrl(
        new Response("{}", {
          headers: { "content-type": "application/json", "content-length": "not-a-number" }
        }),
        expectedUrl()
      ),
      withResponseUrl(
        new Response("{}", { headers: { "content-type": "text/html" } }),
        expectedUrl()
      )
    ];
    const expectations = [
      { reason: "invalid_json", stage: "body" },
      { reason: "empty_body", stage: "body" },
      { reason: "invalid_response_metadata", stage: "body" },
      { reason: "invalid_response_metadata", stage: "response" }
    ] as const;

    for (const [index, response] of cases.entries()) {
      const fetchMock = vi.fn<typeof fetch>(async () => response);
      const result = await createReader(fetchMock).getYieldSources(request());
      const expected = expectations[index];
      if (expected === undefined) throw new Error("Missing expected response classification");
      expect(result).toMatchObject({
        status: "unavailable",
        reason: expected.reason,
        stage: expected.stage
      });
    }
  });

  it("rejects inconsistent totals, duplicates, and non-success API codes", async () => {
    const duplicate = { ...defaultVault, name: "Duplicate" };
    const responses = [
      envelope([], 1),
      envelope([defaultVault, duplicate], 2),
      { ...envelope(), code: "100000001", msg: "upstream rejected" }
    ];
    const expected = ["relation_mismatch", "relation_mismatch", "upstream_error_code"];

    for (const [index, body] of responses.entries()) {
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(body));
      const result = await createReader(fetchMock).getYieldSources(request());
      expect(result).toMatchObject({
        status: "unavailable",
        reason: expected[index],
        stage: "schema"
      });
    }
  });

  it("fails closed when the injected clock or transport fails", async () => {
    const networkFailure = vi.fn<typeof fetch>(async () => {
      throw new TypeError("secret provider detail");
    });
    const invalidClock = createListaYieldSourceReader({
      fetch: networkFailure,
      now: () => new Date(Number.NaN)
    });

    const networkResult = await createReader(networkFailure).getYieldSources(request());
    const clockResult = await invalidClock.getYieldSources(request());

    expect(networkResult).toMatchObject({
      status: "unavailable",
      reason: "network_error",
      stage: "fetch",
      retryable: true
    });
    expect(JSON.stringify(networkResult)).not.toContain("secret provider detail");
    expect(clockResult).toMatchObject({
      status: "unavailable",
      reason: "invalid_clock",
      stage: "request",
      observedAt: null
    });
  });
});
