import assert from "node:assert/strict";
import { request as httpRequest, type IncomingHttpHeaders, type Server } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadStudioToml, type TomlTable } from "@bnbagent/studio-runtime/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  Transport,
  TransportSendOptions
} from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

import { buildGridTradingAgentCard } from "../src/agentCard.js";
import {
  GRID_SERVER_TIMEOUTS,
  buildGridTradingDualApp,
  createGridTradingHttpServer,
  type GridDualAppOptions,
  type GridTradingDualApp
} from "../src/dualMain.js";
import { resolveRuntimeConfig } from "../src/runtimeConfig.js";

const RUNTIME_CONFIG = {
  bindHost: "127.0.0.1",
  port: 9_000,
  publicUrl: "https://grid.example/a2a/"
} as const;
const MCP_PROTOCOL_VERSION = "2025-03-26";
const MCP_ACCEPT = "application/json, text/event-stream";

test("Studio manifest declares only dual read-only protocol faces", () => {
  const manifest = loadStudioToml(fileURLToPath(new URL("../studio.toml", import.meta.url)));
  assert.equal(table(manifest.project).name, "gridTradingAgent-agent");
  assert.equal(table(manifest.stack).runtime, "agentcore");
  assert.deepEqual(table(manifest.stack).protocols, ["A2A", "MCP"]);
  assert.equal(manifest.wallet, undefined);
  assert.equal(manifest.payments, undefined);
  assert.equal(manifest.llm, undefined);
  assert.equal(manifest.storage, undefined);
});

test("runtime configuration is safe and the card is honestly unauthenticated", () => {
  const card = buildGridTradingAgentCard("https://grid.example/a2a/");
  assert.equal(card.security, undefined);
  assert.equal(card.securitySchemes, undefined);

  assert.deepEqual(
    resolveRuntimeConfig({
      AGENT_PORT: "9443",
      AGENT_BIND_HOST: "127.0.0.1",
      AGENTCORE_RUNTIME_URL: "https://grid.example/a2a"
    }),
    {
      port: 9443,
      bindHost: "127.0.0.1",
      publicUrl: "https://grid.example/a2a/"
    }
  );
  assert.deepEqual(
    resolveRuntimeConfig({
      AGENT_PORT: "1e3",
      AGENT_BIND_HOST: "bad host;shutdown",
      AGENT_HOST: "attacker.example",
      AGENTCORE_RUNTIME_URL: "https://user:password@grid.example/a2a?token=x#secret"
    }),
    {
      port: 9000,
      bindHost: "0.0.0.0",
      publicUrl: "http://localhost:9000/"
    }
  );
  assert.throws(
    () => resolveRuntimeConfig({ OAUTH_TOKEN_URL: "https://issuer.example/token" }),
    /does not advertise authentication until enforcement exists/
  );
  assert.throws(
    () =>
      buildGridTradingDualApp({
        runtimeConfig: RUNTIME_CONFIG,
        runtimeEnvironment: { OAUTH_SCOPE: "grid.invoke" }
      }),
    /does not advertise authentication until enforcement exists/
  );
});

test("loopback HTTP serves bounded A2A, card, ping, and sanitized errors", async () => {
  const running = await startApp();
  try {
    assert.equal(running.server.requestTimeout, GRID_SERVER_TIMEOUTS.requestMilliseconds);
    assert.equal(running.server.headersTimeout, GRID_SERVER_TIMEOUTS.headersMilliseconds);
    assert.equal(running.server.keepAliveTimeout, GRID_SERVER_TIMEOUTS.keepAliveMilliseconds);
    assert.equal(running.server.timeout, GRID_SERVER_TIMEOUTS.socketMilliseconds);
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
    assert.match(String(ping.headers["content-security-policy"]), /default-src 'none'/);

    const cardResponse = await request(running.baseUrl, "/.well-known/agent-card.json");
    assert.equal(cardResponse.status, 200);
    const card = JSON.parse(cardResponse.body) as Record<string, unknown>;
    assert.equal(card.url, RUNTIME_CONFIG.publicUrl);
    assert.equal(card.security, undefined);
    assert.equal(card.securitySchemes, undefined);

    const a2a = await request(running.baseUrl, "/", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "message/send",
        params: {
          message: {
            kind: "message",
            role: "user",
            messageId: "grid-http-analysis",
            parts: [{ kind: "data", data: { skill: "trade_now" } }]
          }
        }
      })
    });
    assert.equal(a2a.status, 200);
    assert.equal(a2a.headers["www-authenticate"], undefined);
    const envelope = JSON.parse(a2a.body) as {
      result?: { parts?: Array<{ kind?: string; data?: Record<string, unknown> }> };
    };
    const resultPart = envelope.result?.parts?.[0];
    assert.equal(resultPart?.kind, "data");
    assert.ok(resultPart.data);
    assert.equal(resultPart.data.error, "INVALID_ANALYSIS_INPUT");
    assert.equal(resultPart.data.executionEnabled, false);

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
      headers: { "x-grid-test": "x".repeat(17 * 1_024) }
    });
    assert.equal(oversizedHeader.status, 431);
  } finally {
    await stopRunningApp(running);
  }
});

test("loopback MCP exposes only grid analysis with random capabilities", async () => {
  const running = await startApp();
  const client = new Client({ name: "grid-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("mcp", running.baseUrl));
  try {
    await client.connect(new ExactOptionalClientTransport(transport));
    assert.match(transport.sessionId ?? "", /^grid_[A-Za-z0-9_-]{43}$/);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map(({ name }) => name),
      ["analyze_grid_trading"]
    );
  } finally {
    await client.close().catch(() => undefined);
    await stopRunningApp(running);
  }
});

test("loopback HTTP redacts unexpected internal transport errors", async () => {
  const running = await startApp({ now: () => -1 });
  try {
    const response = await request(running.baseUrl, "/mcp", {
      method: "POST",
      headers: { accept: MCP_ACCEPT },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(response.body), {
      error: "SERVER_ERROR",
      executionEnabled: false
    });
    assert.doesNotMatch(response.body, /clock|safe integer|TypeError/i);
  } finally {
    await stopRunningApp(running);
  }
});

test("guessed, expired, deleted, and colliding MCP capabilities fail closed", async () => {
  let nowMilliseconds = 0;
  let nextCapability = 1;
  const running = await startApp({
    mcpSessionIdleMilliseconds: 1_000,
    now: () => nowMilliseconds,
    sessionIdFactory: () => capabilityId(nextCapability++)
  });
  try {
    const first = await initializeMcpSession(running, 201);
    nowMilliseconds = 500;
    const second = await initializeMcpSession(running, 202);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal((await listMcpTools(running, capabilityId(999))).status, 400);
    assert.equal((await listMcpTools(running, second.sessionId)).status, 200);

    nowMilliseconds = 1_000;
    assert.equal((await listMcpTools(running, first.sessionId)).status, 400);
    assert.equal((await listMcpTools(running, second.sessionId)).status, 200);

    const third = await initializeMcpSession(running, 203);
    assert.equal(third.status, 200);
    assert.equal((await deleteMcpSession(running, second.sessionId)).status, 200);
    assert.equal((await listMcpTools(running, second.sessionId)).status, 400);
    assert.equal((await listMcpTools(running, third.sessionId)).status, 200);
  } finally {
    await stopRunningApp(running);
  }

  const collision = capabilityId(1);
  const colliding = await startApp({ sessionIdFactory: () => collision });
  try {
    const first = await initializeMcpSession(colliding, 204);
    assert.equal(first.status, 200);
    const rejected = await initializeMcpSession(colliding, 205);
    assert.equal(rejected.status, 503);
    assert.match(rejected.body, /session capability unavailable/);
    assert.equal((await listMcpTools(colliding, first.sessionId)).status, 200);
  } finally {
    await stopRunningApp(colliding);
  }
});

test("MCP initialization is rate and pending-capacity limited", async () => {
  let nextCapability = 1;
  const limited = await startApp({
    maxMcpInitializationsPerMinute: 2,
    sessionIdFactory: () => capabilityId(nextCapability++)
  });
  try {
    assert.equal((await initializeMcpSession(limited, 301)).status, 200);
    assert.equal((await initializeMcpSession(limited, 302)).status, 200);
    const rejected = await initializeMcpSession(limited, 303);
    assert.equal(rejected.status, 429);
    assert.equal(rejected.headers["retry-after"], "60");
  } finally {
    await stopRunningApp(limited);
  }

  nextCapability = 1;
  const capacity = await startApp({
    maxMcpSessions: 64,
    maxMcpInitializationsPerMinute: 64,
    sessionIdFactory: () => capabilityId(nextCapability++)
  });
  try {
    const admissions = await Promise.all(
      Array.from({ length: 65 }, (_, index) => initializeMcpSession(capacity, 400 + index))
    );
    assert.equal(admissions.filter(({ status }) => status === 200).length, 64);
    assert.equal(admissions.filter(({ status }) => status === 503).length, 1);
    assert.equal(admissions.filter(({ status }) => status === 429).length, 0);
  } finally {
    await stopRunningApp(capacity);
  }
});

interface RunningApp {
  app: GridTradingDualApp;
  server: Server;
  baseUrl: URL;
}

interface HttpResponse {
  status: number;
  body: string;
  headers: IncomingHttpHeaders;
}

interface McpInitialization extends HttpResponse {
  sessionId: string;
}

class ExactOptionalClientTransport implements Transport {
  onclose: () => void = () => undefined;
  onerror: (error: Error) => void = () => undefined;
  onmessage: NonNullable<Transport["onmessage"]> = () => undefined;

  constructor(private readonly inner: StreamableHTTPClientTransport) {
    inner.onclose = () => {
      this.onclose();
    };
    inner.onerror = (error) => {
      this.onerror(error);
    };
    inner.onmessage = (message) => {
      this.onmessage(message);
    };
  }

  start(): Promise<void> {
    return this.inner.start();
  }

  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    return options === undefined ? this.inner.send(message) : this.inner.send(message, options);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}

async function startApp(
  options: Omit<GridDualAppOptions, "runtimeConfig" | "runtimeEnvironment"> = {}
): Promise<RunningApp> {
  const app = buildGridTradingDualApp({
    runtimeConfig: RUNTIME_CONFIG,
    runtimeEnvironment: {},
    ...options
  });
  const server = createGridTradingHttpServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await app.closeMcpSessions();
    await stopServer(server);
    throw new Error("Expected an IP listener address");
  }
  return { app, server, baseUrl: new URL(`http://127.0.0.1:${String(address.port)}/`) };
}

function capabilityId(sequence: number): string {
  return `grid_${sequence.toString(36).padStart(43, "0")}`;
}

async function initializeMcpSession(running: RunningApp, id: number): Promise<McpInitialization> {
  const response = await request(running.baseUrl, "/mcp", {
    method: "POST",
    headers: { accept: MCP_ACCEPT },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "grid-http-audit", version: "1.0.0" }
      }
    })
  });
  const sessionHeader = response.headers["mcp-session-id"];
  return {
    ...response,
    sessionId: typeof sessionHeader === "string" ? sessionHeader : ""
  };
}

function listMcpTools(running: RunningApp, sessionId: string): Promise<HttpResponse> {
  return request(running.baseUrl, "/mcp", {
    method: "POST",
    headers: {
      accept: MCP_ACCEPT,
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      "mcp-session-id": sessionId
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
  });
}

function deleteMcpSession(running: RunningApp, sessionId: string): Promise<HttpResponse> {
  return request(running.baseUrl, "/mcp", {
    method: "DELETE",
    headers: {
      accept: MCP_ACCEPT,
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      "mcp-session-id": sessionId
    }
  });
}

interface RequestOptions {
  method?: "DELETE" | "GET" | "POST";
  body?: string;
  headers?: Readonly<Record<string, string>>;
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

async function stopRunningApp(running: RunningApp): Promise<void> {
  await running.app.closeMcpSessions();
  await stopServer(running.server);
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

function table(value: unknown): TomlTable {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as TomlTable;
}
