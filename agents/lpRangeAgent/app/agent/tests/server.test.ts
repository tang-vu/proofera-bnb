import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { request as httpRequest, type IncomingHttpHeaders, type Server } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { buildAgentCard } from "../src/agentCard.js";
import {
  buildDualApp,
  createLpRangeHttpServer,
  FixedWindowMcpInitializationLimiter,
  LP_RANGE_SERVER_TIMEOUTS,
  type BuildDualAppOptions
} from "../src/dualMain.js";
import { resolveRuntimeConfig } from "../src/runtimeConfig.js";

const RUNTIME_CONFIG = {
  bindHost: "127.0.0.1",
  port: 9_000,
  publicUrl: "https://lp-range.example/a2a/"
} as const;

test("Studio manifest binds read-only protocols and public registration metadata", () => {
  const manifest = readFileSync(fileURLToPath(new URL("../studio.toml", import.meta.url)), "utf8")
    .replaceAll("\r\n", "\n")
    .trim();
  assert.equal(
    manifest,
    [
      "[project]",
      'name = "lpRangeAgent-agent"',
      "",
      "[stack]",
      'runtime = "agentcore"',
      'protocol = "A2A"',
      'protocols = ["A2A", "MCP"]',
      "",
      "[network]",
      'default = "bsc-testnet"',
      "",
      "[identity]",
      'endpoint = "https://proofera-lp.tangvu.dev/"',
      "",
      "[wallet]",
      'kind = "evm-local"',
      'signer = "local"',
      'keystore_dir = "../../.studio/wallets"',
      'address = "0xAd03eF7e21c35FD1446c153f6eE5e6165F696990"'
    ].join("\n")
  );

  const packageDocument = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")
  ) as {
    packageManager?: unknown;
    scripts?: Record<string, unknown>;
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
  };
  assert.equal(packageDocument.packageManager, "pnpm@10.24.0");
  assert.ok(packageDocument.scripts);
  assert.equal(packageDocument.scripts.start, "node dist/src/dualMain.js");
  assert.equal(
    packageDocument.scripts.verify,
    "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  );
  assert.equal(packageDocument.scripts["audit:prod"], "pnpm audit --prod --audit-level high");
  assert.deepEqual(Object.keys(packageDocument.dependencies ?? {}).sort(), [
    "@a2a-js/sdk",
    "@modelcontextprotocol/sdk",
    "express",
    "zod"
  ]);
  for (const version of Object.values({
    ...packageDocument.dependencies,
    ...packageDocument.devDependencies
  })) {
    if (typeof version !== "string") throw new TypeError("Dependency version must be a string");
    assert.match(version, /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/);
  }
});

test("card and startup agree that application-layer authentication is absent", () => {
  const card = buildAgentCard(RUNTIME_CONFIG.publicUrl);
  assert.equal(card.security, undefined);
  assert.equal(card.securitySchemes, undefined);

  assert.throws(
    () => resolveRuntimeConfig({ OAUTH_TOKEN_URL: "https://issuer.example/token" }),
    /does not advertise authentication until enforcement exists/
  );
  assert.throws(
    () => resolveRuntimeConfig({ OAUTH_SCOPE: "" }),
    /does not advertise authentication until enforcement exists/
  );
  assert.throws(
    () =>
      buildDualApp({
        runtimeConfig: RUNTIME_CONFIG,
        runtimeEnvironment: { OAUTH_SCOPE: "lp.invoke" }
      }),
    /does not advertise authentication until enforcement exists/
  );
});

test("loopback HTTP exposes honest A2A and sanitized bounded failures", async () => {
  const running = await startApp();
  try {
    assert.equal(running.server.requestTimeout, LP_RANGE_SERVER_TIMEOUTS.requestMilliseconds);
    assert.equal(running.server.headersTimeout, LP_RANGE_SERVER_TIMEOUTS.headersMilliseconds);
    assert.equal(running.server.keepAliveTimeout, LP_RANGE_SERVER_TIMEOUTS.keepAliveMilliseconds);
    assert.equal(running.server.timeout, LP_RANGE_SERVER_TIMEOUTS.socketMilliseconds);
    assert.equal(running.server.maxHeadersCount, 100);
    assert.equal(running.server.maxRequestsPerSocket, 100);

    const ping = await request(running.baseUrl, "/ping");
    assert.equal(ping.status, 200);
    assert.deepEqual(JSON.parse(ping.body), { status: "HEALTHY", executionEnabled: false });
    assert.equal(ping.headers["x-powered-by"], undefined);
    assert.equal(ping.headers["x-content-type-options"], "nosniff");
    assert.equal(ping.headers["x-frame-options"], "DENY");
    assert.equal(ping.headers["referrer-policy"], "no-referrer");
    assert.equal(ping.headers["cache-control"], "no-store");
    const contentSecurityPolicy = ping.headers["content-security-policy"];
    assert.match(
      Array.isArray(contentSecurityPolicy)
        ? contentSecurityPolicy.join(",")
        : (contentSecurityPolicy ?? ""),
      /default-src 'none'/
    );

    const cardResponse = await request(running.baseUrl, "/.well-known/agent-card.json");
    assert.equal(cardResponse.status, 200);
    const card = JSON.parse(cardResponse.body) as Record<string, unknown>;
    assert.equal(card.url, RUNTIME_CONFIG.publicUrl);
    assert.equal(card.security, undefined);
    assert.equal(card.securitySchemes, undefined);
    assert.deepEqual(
      (card.skills as Array<{ id: string }>).map(({ id }) => id),
      ["analyze_lp_range", "audit_altana_permission_bundle"]
    );

    const jsonRpcBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      method: "message/send",
      params: {
        message: {
          kind: "message",
          role: "user",
          messageId: "lp-range-unauthenticated-contract",
          parts: [{ kind: "data", data: { skill: "negotiate" } }]
        }
      }
    });
    const unauthenticated = await request(running.baseUrl, "/", {
      method: "POST",
      body: jsonRpcBody
    });
    assert.equal(unauthenticated.status, 200);
    assert.equal(unauthenticated.headers["www-authenticate"], undefined);
    const envelope = JSON.parse(unauthenticated.body) as {
      result?: { parts?: Array<{ data?: Record<string, unknown> }> };
    };
    assert.ok(envelope.result?.parts);
    const responsePart = envelope.result.parts[0];
    assert.ok(responsePart.data);
    assert.equal(responsePart.data.error, "UNKNOWN_SKILL");
    assert.equal(responsePart.data.executionEnabled, false);

    const wrappedRequest = await request(running.baseUrl, "/", {
      method: "POST",
      body: JSON.stringify({
        v: 1,
        method: "POST",
        path: "/",
        headers: { "content-type": "application/json" },
        body: Buffer.from(jsonRpcBody).toString("base64")
      })
    });
    assert.equal(wrappedRequest.status, 200);
    const wrappedResponse = JSON.parse(wrappedRequest.body) as {
      status?: unknown;
      body?: unknown;
    };
    assert.equal(wrappedResponse.status, 200);
    assert.equal(typeof wrappedResponse.body, "string");
    if (typeof wrappedResponse.body !== "string") {
      throw new TypeError("Studio envelope response body must be base64");
    }
    const wrappedJsonRpc = JSON.parse(
      Buffer.from(wrappedResponse.body, "base64").toString("utf8")
    ) as {
      result?: { parts?: Array<{ data?: Record<string, unknown> }> };
    };
    assert.equal(wrappedJsonRpc.result?.parts?.[0]?.data?.executionEnabled, false);

    const recursiveEnvelope = await request(running.baseUrl, "/", {
      method: "POST",
      body: JSON.stringify({
        v: 1,
        method: "POST",
        path: "/",
        headers: {
          "content-type": "application/json",
          "x-proofera-envelope-dispatched": "1"
        },
        body: Buffer.from(
          JSON.stringify({
            v: 1,
            method: "GET",
            path: "/ping",
            body: ""
          })
        ).toString("base64")
      })
    });
    const recursiveOuter = JSON.parse(recursiveEnvelope.body) as { body?: unknown };
    assert.equal(typeof recursiveOuter.body, "string");
    if (typeof recursiveOuter.body !== "string") {
      throw new TypeError("Recursive-envelope response body must be base64");
    }
    const recursiveInner = JSON.parse(
      Buffer.from(recursiveOuter.body, "base64").toString("utf8")
    ) as { error?: { code?: unknown } };
    assert.equal(recursiveInner.error?.code, -32_600);

    const malformed = await request(running.baseUrl, "/", {
      method: "POST",
      body: '{"jsonrpc":'
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(JSON.parse(malformed.body), {
      error: "INVALID_JSON_BODY",
      executionEnabled: false
    });

    const oversized = await request(running.baseUrl, "/", {
      method: "POST",
      body: JSON.stringify({ payload: "x".repeat(300 * 1_024) })
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(JSON.parse(oversized.body), {
      error: "PAYLOAD_TOO_LARGE",
      executionEnabled: false
    });

    const oversizedHeader = await request(running.baseUrl, "/ping", {
      headers: { "x-oversized-test": "x".repeat(17 * 1_024) }
    });
    assert.equal(oversizedHeader.status, 431);
  } finally {
    await stopServer(running.server);
  }
});

test("loopback MCP exposes only analysis with unpredictable bounded sessions", async () => {
  const running = await startApp({ maximumMcpSessions: 1 });
  const firstClient = new Client({ name: "lp-http-one", version: "1.0.0" });
  const firstTransport = new StreamableHTTPClientTransport(new URL("mcp", running.baseUrl));
  const secondClient = new Client({ name: "lp-http-two", version: "1.0.0" });
  const secondTransport = new StreamableHTTPClientTransport(new URL("mcp", running.baseUrl));
  try {
    const connections = await Promise.allSettled([
      firstClient.connect(firstTransport),
      secondClient.connect(secondTransport)
    ]);
    assert.equal(connections.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(connections.filter(({ status }) => status === "rejected").length, 1);
    const connectedClient = connections[0].status === "fulfilled" ? firstClient : secondClient;
    const connectedTransport =
      connections[0].status === "fulfilled" ? firstTransport : secondTransport;
    assert.match(
      connectedTransport.sessionId ?? "",
      /^lp-range-session-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    const tools = await connectedClient.listTools();
    assert.deepEqual(
      tools.tools.map(({ name }) => name),
      ["analyze_lp_range"]
    );
  } finally {
    await Promise.allSettled([secondClient.close(), firstClient.close()]);
    await stopServer(running.server);
  }
});

test("loopback MCP enforces admission limiting and idle-session release", async () => {
  let now = 0;
  const limited = await startApp({
    nowMilliseconds: () => now,
    mcpInitializationLimiter: new FixedWindowMcpInitializationLimiter(1, 60_000)
  });
  try {
    const first = await initializeMcp(limited.baseUrl);
    assert.equal(first.status, 200);
    const second = await initializeMcp(limited.baseUrl);
    assert.equal(second.status, 429);
    const secondBody = JSON.parse(second.body) as {
      error?: { data?: { executionEnabled?: boolean } };
    };
    assert.equal(secondBody.error?.data?.executionEnabled, false);
  } finally {
    await stopServer(limited.server);
  }

  const expiring = await startApp({
    maximumMcpSessions: 1,
    mcpSessionIdleMilliseconds: 1_000,
    nowMilliseconds: () => now,
    mcpInitializationLimiter: new FixedWindowMcpInitializationLimiter(10, 60_000)
  });
  try {
    now = 0;
    const first = await initializeMcp(expiring.baseUrl);
    assert.equal(first.status, 200);
    const firstSession = first.headers["mcp-session-id"];
    assert.equal(typeof firstSession, "string");

    now = 1_000;
    const replacement = await initializeMcp(expiring.baseUrl);
    assert.equal(replacement.status, 200);
    assert.notEqual(replacement.headers["mcp-session-id"], firstSession);
  } finally {
    await stopServer(expiring.server);
  }
});

interface RunningApp {
  server: Server;
  baseUrl: URL;
}

async function startApp(options: BuildDualAppOptions = {}): Promise<RunningApp> {
  const app = buildDualApp({
    runtimeConfig: RUNTIME_CONFIG,
    runtimeEnvironment: {},
    ...options
  });
  const server = createLpRangeHttpServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await stopServer(server);
    throw new Error("Expected an IP listener address");
  }
  return { server, baseUrl: new URL(`http://127.0.0.1:${String(address.port)}/`) };
}

const MCP_INITIALIZE_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "lp-http-audit", version: "1.0.0" }
  }
});

function initializeMcp(baseUrl: URL): Promise<HttpResponse> {
  return request(baseUrl, "/mcp", {
    method: "POST",
    body: MCP_INITIALIZE_BODY,
    headers: { accept: "application/json, text/event-stream" }
  });
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
}

interface HttpResponse {
  status: number;
  body: string;
  headers: IncomingHttpHeaders;
}

function request(baseUrl: URL, path: string, options: RequestOptions = {}): Promise<HttpResponse> {
  const body = options.body;
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      new URL(path, baseUrl),
      {
        method: options.method ?? "GET",
        headers: {
          ...options.headers,
          ...(body === undefined
            ? {}
            : {
                "content-type": "application/json",
                "content-length": String(Buffer.byteLength(body))
              })
        }
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        incoming.on("end", () => {
          resolve({
            status: incoming.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: incoming.headers
          });
        });
      }
    );
    outgoing.once("error", reject);
    if (body !== undefined) outgoing.write(body);
    outgoing.end();
  });
}

function stopServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
}
