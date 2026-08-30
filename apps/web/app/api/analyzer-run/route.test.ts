import { describe, expect, it, vi } from "vitest";

import { createAnalyzerRunResponse, createMemoryAnalyzerRateLimiter } from "./route";

const requestId = "studio-test-request-0001";
const validInput = {
  skill: "analyze_grid_trading",
  chainId: 97,
  market: { baseAsset: "BNB", quoteAsset: "USDC" }
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://proofera.test/api/analyzer-run", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function agentEnvelope(data: Record<string, unknown>, id = requestId): Response {
  return Response.json({
    jsonrpc: "2.0",
    id,
    result: {
      kind: "message",
      role: "agent",
      parts: [{ kind: "data", data }]
    }
  });
}

const dependencies = {
  createId: () => requestId,
  now: () => new Date("2026-08-30T10:00:00.000Z"),
  nowMilliseconds: (() => {
    let value = 100;
    return () => (value += 7);
  })()
};

describe("testnet analyzer run route", () => {
  it("bounds public analyzer capacity without retaining request data", () => {
    const limiter = createMemoryAnalyzerRateLimiter();
    for (let index = 0; index < 120; index += 1) {
      expect(limiter.consume(1_000)).toMatchObject({
        allowed: true,
        remaining: 119 - index
      });
    }
    expect(limiter.consume(1_001)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60
    });
    expect(limiter.consume(61_000)).toEqual({
      allowed: true,
      remaining: 119,
      retryAfterSeconds: 0
    });
  });

  it("relays one exact allowlisted BSC-testnet analyzer request", async () => {
    let capturedUrl: string | URL | Request | null = null;
    let capturedInit: RequestInit | undefined;
    const fetchImplementation = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return agentEnvelope({
        skill: "analyze_grid_trading",
        chainId: 97,
        environment: "bsc-testnet",
        methodologyVersion: "proofera-grid-trading-v1.0.0",
        decision: "review_grid",
        executionEnabled: false,
        rationale: ["The bounded scenario passes its constraints."]
      });
    });
    const response = await createAnalyzerRunResponse(
      request({ category: "grid-trading", input: validInput }),
      { ...dependencies, fetchImplementation }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-proofera-boundary")).toBe("bsc-testnet-read-only-analyzer");
    await expect(response.json()).resolves.toMatchObject({
      status: "completed",
      runId: requestId,
      category: "grid-trading",
      trust: "caller_supplied_unverified",
      boundary: {
        chainId: 97,
        environment: "bsc-testnet",
        executionEnabled: false,
        walletAccessed: false,
        transactionSubmitted: false,
        serverPersistence: false
      },
      result: { decision: "review_grid", executionEnabled: false }
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(capturedUrl).toBe("https://proofera-grid.tangvu.dev/");
    expect(capturedInit).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    const outbound: unknown = JSON.parse(String(capturedInit?.body));
    expect(outbound).toMatchObject({
      id: requestId,
      method: "message/send",
      params: { message: { parts: [{ data: validInput }] } }
    });
  });

  it.each([
    {
      label: "mainnet input",
      body: { category: "grid-trading", input: { ...validInput, chainId: 56 } },
      code: "CHAIN_SCOPE_INVALID"
    },
    {
      label: "wrong skill",
      body: { category: "grid-trading", input: { ...validInput, skill: "analyze_lp_range" } },
      code: "SKILL_SCOPE_INVALID"
    },
    {
      label: "wallet secret field",
      body: { category: "grid-trading", input: { ...validInput, privateKey: "redacted" } },
      code: "SENSITIVE_FIELD_REJECTED"
    },
    {
      label: "nested authorization material",
      body: {
        category: "grid-trading",
        input: { ...validInput, source: { sessionSigner: "redacted" } }
      },
      code: "SENSITIVE_FIELD_REJECTED"
    }
  ])("fails closed before network access for $label", async ({ body, code }) => {
    const fetchImplementation = vi.fn();
    const response = await createAnalyzerRunResponse(request(body), {
      ...dependencies,
      fetchImplementation
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      status: "blocked",
      code,
      executionEnabled: false,
      transactionSubmitted: false
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects non-JSON, malformed JSON, and oversized bodies", async () => {
    const wrongType = new Request("https://proofera.test/api/analyzer-run", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "plain"
    });
    expect((await createAnalyzerRunResponse(wrongType)).status).toBe(415);

    const malformed = await createAnalyzerRunResponse(request("{"));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ code: "REQUEST_JSON_INVALID" });

    const oversized = await createAnalyzerRunResponse(
      request(
        { category: "grid-trading", input: validInput },
        { "content-length": String(96 * 1_024 + 1) }
      )
    );
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({ code: "REQUEST_TOO_LARGE" });
  });

  it("preserves analyzer input rejection without inventing a decision", async () => {
    const response = await createAnalyzerRunResponse(
      request({ category: "grid-trading", input: validInput }),
      {
        ...dependencies,
        fetchImplementation: async () =>
          agentEnvelope({
            error: "INVALID_ANALYSIS_INPUT",
            issues: [{ path: "currentPrice", message: "Required" }],
            executionEnabled: false
          })
      }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "rejected",
      result: { error: "INVALID_ANALYSIS_INPUT", executionEnabled: false }
    });
    expect(body.result.decision).toBeUndefined();
  });

  it.each([
    {
      label: "execution enabled",
      data: {
        skill: "analyze_grid_trading",
        chainId: 97,
        environment: "bsc-testnet",
        executionEnabled: true
      },
      code: "AGENT_BOUNDARY_INVALID"
    },
    {
      label: "mainnet result",
      data: {
        skill: "analyze_grid_trading",
        chainId: 56,
        environment: "bsc-mainnet",
        executionEnabled: false
      },
      code: "AGENT_SCOPE_INVALID"
    }
  ])("rejects an upstream $label", async ({ data, code }) => {
    const response = await createAnalyzerRunResponse(
      request({ category: "grid-trading", input: validInput }),
      { ...dependencies, fetchImplementation: async () => agentEnvelope(data) }
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code, status: "blocked" });
  });

  it("redacts upstream transport and envelope failures", async () => {
    const unavailable = await createAnalyzerRunResponse(
      request({ category: "grid-trading", input: validInput }),
      {
        ...dependencies,
        fetchImplementation: async () => {
          throw new Error("provider-token=must-not-leak");
        }
      }
    );
    expect(unavailable.status).toBe(502);
    expect(await unavailable.text()).not.toMatch(/provider-token|must-not-leak/u);

    const invalidEnvelope = await createAnalyzerRunResponse(
      request({ category: "grid-trading", input: validInput }),
      {
        ...dependencies,
        fetchImplementation: async () => Response.json({ privateTrace: "must-not-leak" })
      }
    );
    expect(invalidEnvelope.status).toBe(502);
    expect(await invalidEnvelope.text()).not.toMatch(/privateTrace|must-not-leak/u);
  });
});
