import {
  type CreateListaYieldSourceReaderOptions,
  type ListaYieldSourceReader,
  type ListaYieldSourceResult
} from "@proofera/integrations";
import { describe, expect, it, vi } from "vitest";

import {
  LISTA_YIELD_PAGE_SIZE,
  LISTA_YIELD_SOURCE_REQUEST,
  LISTA_YIELD_SOURCE_URL,
  LISTA_YIELD_TIMEOUT_MS,
  readListaYieldSources
} from "./lista-yield-service";

const observedAt = "2026-08-11T18:30:00.000Z";

const unavailableResult: ListaYieldSourceResult = {
  status: "unavailable",
  reason: "network_error",
  stage: "fetch",
  message: "The Lista request failed during the fetch stage.",
  retryable: true,
  sourceUrl: LISTA_YIELD_SOURCE_URL,
  observedAt,
  httpStatus: null,
  rateLimit: { limit: null, remaining: null, reset: null, retryAfter: null },
  upstreamCode: null,
  executionEnabled: false
};

function responseWithUrl(body: unknown, status = 200): Response {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
  Object.defineProperty(response, "url", {
    configurable: true,
    value: LISTA_YIELD_SOURCE_URL
  });
  return response;
}

describe("readListaYieldSources", () => {
  it("injects the server transport and clock into one exact, bounded mainnet request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const now = vi.fn(() => new Date(observedAt));
    const getYieldSources = vi.fn(async () => unavailableResult);
    const createReader = vi.fn(
      (options: CreateListaYieldSourceReaderOptions): ListaYieldSourceReader => {
        expect(options.fetch).toBe(fetchMock);
        expect(options.now).toBe(now);
        return { getYieldSources };
      }
    );

    await expect(readListaYieldSources({ fetch: fetchMock, now, createReader })).resolves.toBe(
      unavailableResult
    );

    expect(createReader).toHaveBeenCalledOnce();
    expect(getYieldSources).toHaveBeenCalledOnce();
    expect(getYieldSources).toHaveBeenCalledWith(LISTA_YIELD_SOURCE_REQUEST);
    expect(LISTA_YIELD_SOURCE_REQUEST).toEqual({
      chainId: 56,
      apiBaseUrl: "https://api.lista.org",
      pageSize: 12,
      timeoutMs: 8_000
    });
    expect(LISTA_YIELD_PAGE_SIZE).toBeGreaterThanOrEqual(1);
    expect(LISTA_YIELD_PAGE_SIZE).toBeLessThanOrEqual(25);
    expect(LISTA_YIELD_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it("uses the real adapter without a live dependency and preserves an authoritative empty page", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      responseWithUrl({
        code: "000000000",
        msg: "success",
        data: { total: 0, list: [] },
        timestamp: 1_786_466_600_000
      })
    );

    const result = await readListaYieldSources({
      fetch: fetchMock,
      now: () => new Date(observedAt)
    });

    expect(result).toMatchObject({
      status: "empty",
      total: "0",
      page: 1,
      pageSize: LISTA_YIELD_PAGE_SIZE,
      provenance: {
        sourceUrl: LISTA_YIELD_SOURCE_URL,
        observedAt,
        executionEnabled: false
      }
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error("Expected one Lista request.");
    expect(call[0].toString()).toBe(LISTA_YIELD_SOURCE_URL);
    expect(call[1]).toMatchObject({
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
  });

  it("keeps an upstream outage unavailable instead of converting it to an empty source list", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      responseWithUrl({ code: "upstream unavailable" }, 503)
    );

    const result = await readListaYieldSources({
      fetch: fetchMock,
      now: () => new Date(observedAt)
    });

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "upstream_unavailable",
      stage: "response",
      httpStatus: 503,
      retryable: true
    });
    expect("sources" in result).toBe(false);
  });
});
