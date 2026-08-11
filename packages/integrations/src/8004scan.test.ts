import { describe, expect, it, vi } from "vitest";

import { create8004ScanClient } from "./8004scan";

const responseMeta = {
  version: "1.0.0",
  timestamp: "2026-08-11T09:00:00.000Z",
  requestId: "request-123",
  pagination: { page: 1, limit: 20, total: 1, hasMore: false }
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers }
  });
}

describe("create8004ScanClient", () => {
  it("accepts live string token IDs without coercing them through a number", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        success: true,
        data: [{ token_id: "90071992547409931234", chain_id: 56, name: "Agent" }],
        meta: responseMeta
      })
    );

    const result = await create8004ScanClient({ fetch: fetchMock }).listAgents();

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.agents[0]?.token_id).toBe("90071992547409931234");
    }
  });

  it("normalizes numeric IDs, retains unknown agent fields, raw data, meta, and rate limits", async () => {
    const rawResponse = {
      success: true,
      data: [
        {
          id: "agent-row-1",
          token_id: 42,
          chain_id: 56,
          name: "Range agent",
          undocumented_health: { status: "online" }
        }
      ],
      meta: responseMeta,
      undocumented_envelope_field: "retained in raw"
    };
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(rawResponse, {
        headers: {
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Remaining": "7",
          "X-RateLimit-Reset": "2026-08-11T09:01:00Z"
        }
      })
    );

    const result = await create8004ScanClient({
      fetch: fetchMock,
      now: () => new Date("2026-08-11T09:00:01Z")
    }).listAgents({ chainId: 56, limit: 20 });

    expect(result).toMatchObject({
      status: "available",
      observedAt: "2026-08-11T09:00:01.000Z",
      httpStatus: 200,
      rateLimit: {
        limit: 10,
        remaining: 7,
        resetAt: "2026-08-11T09:01:00Z"
      }
    });
    if (result.status === "available") {
      expect(result.agents[0]).toMatchObject({
        token_id: "42",
        undocumented_health: { status: "online" }
      });
      expect(result.meta.requestId).toBe("request-123");
      expect(result.raw).toEqual(rawResponse);
    }
  });

  it("reports an HTTP 502 as unavailable instead of an empty list", async () => {
    const upstreamBody = { message: "bad gateway" };
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(upstreamBody, {
        status: 502,
        headers: { "Retry-After": "3", "X-RateLimit-Remaining": "0" }
      })
    );

    const result = await create8004ScanClient({ fetch: fetchMock }).listAgents();

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "http_error",
      retryable: true,
      httpStatus: 502,
      rateLimit: { remaining: 0, retryAfter: "3" },
      raw: upstreamBody
    });
    expect("agents" in result).toBe(false);
  });

  it("reports a bounded timeout when fetch is aborted by the client timer", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );

    const result = await create8004ScanClient({
      fetch: fetchMock,
      timeoutMs: 5
    }).listAgents();

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "timeout",
      retryable: true,
      httpStatus: null
    });
  });

  it("distinguishes an external abort from an upstream timeout", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );
    const controller = new AbortController();
    controller.abort("navigation");

    const result = await create8004ScanClient({ fetch: fetchMock }).listAgents(
      {},
      { signal: controller.signal }
    );

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "aborted",
      retryable: false
    });
  });

  it("reports network errors without inventing an empty successful response", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError("socket closed");
    });

    const result = await create8004ScanClient({ fetch: fetchMock }).listAgents();

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "network_error",
      message: "socket closed",
      raw: null
    });
    expect("agents" in result).toBe(false);
  });

  it("rejects an incompatible successful envelope and preserves it for diagnosis", async () => {
    const incompatible = {
      success: true,
      data: { agents: [] },
      meta: { timestamp: "not-a-date" }
    };
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(incompatible));

    const result = await create8004ScanClient({ fetch: fetchMock }).listAgents();

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "incompatible_schema",
      retryable: false,
      raw: incompatible
    });
  });

  it("stops reading a successful response that exceeds the bounded body limit", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response("x".repeat(1_000_001), {
          headers: { "content-type": "application/json" }
        })
    );

    const result = await create8004ScanClient({ fetch: fetchMock }).listAgents();

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "incompatible_schema",
      retryable: false,
      raw: { truncated: true, maximumBytes: 1_000_000 }
    });
    if (result.status === "unavailable") {
      expect(result.message).toMatch(/exceeded.*byte safety limit/i);
    }
  });

  it("encodes query values and sends an optional API key only as a header", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const headers = new Headers(init?.headers);

      expect(url.pathname).toBe("/api/v1/public/agents");
      expect(url.searchParams.get("search")).toBe("CAKE & chainId=1 ? #range");
      expect(url.searchParams.getAll("chainId")).toEqual(["56"]);
      expect(url.searchParams.get("sortBy")).toBe("total_score");
      expect(headers.get("X-API-Key")).toBe("server-secret-key");
      expect(url.toString()).not.toContain("server-secret-key");

      return jsonResponse({ success: true, data: [], meta: responseMeta });
    });

    const result = await create8004ScanClient({
      // proofera-secret-fixture-sha256=bfd13f9d5191edbfa16b3aab83dcb55cf93c37cf1de44de0f63de8b12ec59b19
      fetch: fetchMock,
      apiKey: "server-secret-key"
    }).listAgents({
      search: "CAKE & chainId=1 ? #range",
      chainId: 56,
      sortBy: "total_score",
      isTestnet: false
    });

    expect(result.status).toBe("available");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  describe("getAgent", () => {
    it("keeps a maximum uint256 token ID exact in the path and validates a 200 response", async () => {
      const tokenId =
        "115792089237316195423570985008687907853269984665640564039457584007913129639935";
      const rawResponse = {
        success: true,
        data: {
          id: "agent-row-max",
          token_id: tokenId,
          chain_id: 56,
          name: "Exact ID agent",
          undocumented_endpoint_health: "reachable"
        },
        meta: responseMeta,
        undocumented_envelope_field: { retained: true }
      };
      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const headers = new Headers(init?.headers);

        expect(url.pathname).toBe(`/api/v1/public/agents/56/${tokenId}`);
        expect(headers.get("X-API-Key")).toBe("detail-server-key");
        expect(url.toString()).not.toContain("detail-server-key");

        return jsonResponse(rawResponse, {
          headers: {
            "X-RateLimit-Limit": "30",
            "X-RateLimit-Remaining": "29",
            "X-RateLimit-Reset": "2026-08-11T09:01:00Z"
          }
        });
      });

      const result = await create8004ScanClient({
        fetch: fetchMock,
        // proofera-secret-fixture-sha256=4834d028d2787eea05f77c72b257590ea5f21ead6279d0f017d369791c91422e
        apiKey: "detail-server-key",
        now: () => new Date("2026-08-11T09:00:02Z")
      }).getAgent({ chainId: 56, tokenId });

      expect(result).toMatchObject({
        status: "available",
        observedAt: "2026-08-11T09:00:02.000Z",
        httpStatus: 200,
        rateLimit: {
          limit: 30,
          remaining: 29,
          resetAt: "2026-08-11T09:01:00Z"
        },
        raw: rawResponse
      });
      if (result.status === "available") {
        expect(result.agent).toMatchObject({
          token_id: tokenId,
          chain_id: 56,
          undocumented_endpoint_health: "reachable"
        });
        expect(result.meta.requestId).toBe("request-123");
      }
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("returns a validated 404 error envelope as not_found, not null", async () => {
      const rawResponse = {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Agent not found",
          details: { chainId: 56, tokenId: "404" }
        },
        meta: responseMeta
      };
      const fetchMock = vi.fn<typeof fetch>(async () =>
        jsonResponse(rawResponse, {
          status: 404,
          headers: { "X-RateLimit-Remaining": "8" }
        })
      );

      const result = await create8004ScanClient({ fetch: fetchMock }).getAgent({
        chainId: 56,
        tokenId: "404"
      });

      expect(result).toMatchObject({
        status: "not_found",
        httpStatus: 404,
        message: "Agent not found",
        upstreamError: { code: "NOT_FOUND" },
        meta: { requestId: "request-123" },
        rateLimit: { remaining: 8 },
        raw: rawResponse
      });
      expect("agent" in result).toBe(false);
    });

    it("keeps a 429 rate-limit response unavailable with retry provenance", async () => {
      const rawResponse = {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Rate limit exceeded"
        },
        meta: responseMeta
      };
      const fetchMock = vi.fn<typeof fetch>(async () =>
        jsonResponse(rawResponse, {
          status: 429,
          headers: {
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": "2026-08-11T09:01:00Z",
            "Retry-After": "12"
          }
        })
      );

      const result = await create8004ScanClient({ fetch: fetchMock }).getAgent({
        chainId: 56,
        tokenId: "1"
      });

      expect(result).toMatchObject({
        status: "unavailable",
        reason: "http_error",
        retryable: true,
        httpStatus: 429,
        upstreamError: { code: "RATE_LIMIT_EXCEEDED" },
        rateLimit: { limit: 10, remaining: 0, retryAfter: "12" },
        raw: rawResponse
      });
      expect("agent" in result).toBe(false);
    });

    it("uses the shared bounded timeout path", async () => {
      const fetchMock = vi.fn<typeof fetch>(
        async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            );
          })
      );

      const result = await create8004ScanClient({
        fetch: fetchMock,
        timeoutMs: 5
      }).getAgent({ chainId: 56, tokenId: "1" });

      expect(result).toMatchObject({
        status: "unavailable",
        reason: "timeout",
        retryable: true,
        httpStatus: null,
        raw: null
      });
    });

    it("makes an incompatible 200 agent envelope visibly unavailable", async () => {
      const rawResponse = {
        success: true,
        data: [{ token_id: "7", chain_id: 56 }],
        meta: responseMeta
      };
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(rawResponse));

      const result = await create8004ScanClient({ fetch: fetchMock }).getAgent({
        chainId: 56,
        tokenId: "7"
      });

      expect(result).toMatchObject({
        status: "unavailable",
        reason: "incompatible_schema",
        retryable: false,
        raw: rawResponse
      });
      expect("agent" in result).toBe(false);
    });

    it("stops reading a detail response beyond the one-million-byte bound", async () => {
      const fetchMock = vi.fn<typeof fetch>(
        async () =>
          new Response("not read", {
            headers: {
              "content-type": "application/json",
              "content-length": "1000001"
            }
          })
      );

      const result = await create8004ScanClient({ fetch: fetchMock }).getAgent({
        chainId: 56,
        tokenId: "8"
      });

      expect(result).toMatchObject({
        status: "unavailable",
        reason: "incompatible_schema",
        retryable: false,
        raw: { truncated: true, maximumBytes: 1_000_000 }
      });
      if (result.status === "unavailable") {
        expect(result.message).toMatch(/exceeded.*byte safety limit/i);
      }
    });

    it("rejects invalid chain and uint256 inputs before dispatch", async () => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = create8004ScanClient({ fetch: fetchMock });

      await expect(client.getAgent({ chainId: 0, tokenId: "1" })).rejects.toThrow();
      await expect(
        client.getAgent({
          chainId: 56,
          tokenId: "115792089237316195423570985008687907853269984665640564039457584007913129639936"
        })
      ).rejects.toThrow();
      await expect(client.getAgent({ chainId: 56, tokenId: "1/../../stats" })).rejects.toThrow();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
