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

import {
  buildHealthFactorGuardianDualApp,
  type DualAppOptions,
  type HealthFactorGuardianDualApp
} from "../src/dualMain.js";
import { resolveRuntimeConfig } from "../src/runtimeConfig.js";

test("Studio manifest binds dual read-only faces and public registration metadata", () => {
  const manifest = loadStudioToml(fileURLToPath(new URL("../studio.toml", import.meta.url)));
  assert.equal(table(manifest.project).name, "healthFactorGuardianAgent-agent");
  assert.equal(table(manifest.stack).runtime, "agentcore");
  assert.equal(table(manifest.stack).protocol, "A2A");
  assert.deepEqual(table(manifest.stack).protocols, ["A2A", "MCP"]);
  assert.equal(table(manifest.identity).endpoint, "https://proofera-health.tangvu.dev/");
  assert.deepEqual(table(manifest.wallet), {
    address: "0x708cb7F2b974d94005E762A140c469F1125e0cB4",
    keystore_dir: "../../.studio/wallets",
    kind: "evm-local",
    signer: "local"
  });
  assert.equal(manifest.payments, undefined);
  assert.equal(manifest.llm, undefined);
});

test("runtime configuration accepts only bounded ports, safe hosts, and safe public URLs", () => {
  assert.deepEqual(
    resolveRuntimeConfig({
      AGENT_PORT: "9443",
      AGENT_BIND_HOST: "127.0.0.1",
      AGENTCORE_RUNTIME_URL: "https://guardian.example/a2a"
    }),
    {
      port: 9443,
      bindHost: "127.0.0.1",
      publicUrl: "https://guardian.example/a2a/"
    }
  );

  assert.deepEqual(
    resolveRuntimeConfig({
      AGENT_PORT: "1e3",
      AGENT_BIND_HOST: "bad host;shutdown",
      AGENT_HOST: "attacker.example",
      AGENTCORE_RUNTIME_URL: "https://user:password@guardian.example/a2a?token=x#secret"
    }),
    {
      port: 9000,
      bindHost: "0.0.0.0",
      publicUrl: "http://localhost:9000/"
    }
  );

  assert.equal(
    resolveRuntimeConfig({ AGENTCORE_RUNTIME_URL: "http://guardian.example/a2a" }).publicUrl,
    "http://localhost:9000/"
  );
  assert.equal(
    resolveRuntimeConfig({ AGENTCORE_RUNTIME_URL: "http://127.0.0.1:9100" }).publicUrl,
    "http://127.0.0.1:9100/"
  );
});

test("dual HTTP app exposes honest health/card state and rejects oversized JSON", async () => {
  const running = await startApp();
  try {
    const ping = await request(running.baseUrl, "/ping");
    assert.equal(ping.status, 200);
    assert.deepEqual(JSON.parse(ping.body), {
      status: "HEALTHY",
      sourceContentsVerified: false,
      freshnessAttestedByAgent: false,
      marketplaceEligible: false,
      activationEligible: false,
      executionEnabled: false
    });

    const cardResponse = await request(running.baseUrl, "/.well-known/agent-card.json");
    assert.equal(cardResponse.status, 200);
    const card = JSON.parse(cardResponse.body) as Record<string, unknown>;
    assert.equal(card.url, "https://guardian.example/a2a/");
    assert.deepEqual(
      (card.skills as Array<{ id: string }>).map(({ id }) => id),
      ["analyze_venus_health_factor"]
    );

    const oversized = await request(running.baseUrl, "/", {
      method: "POST",
      body: JSON.stringify({ payload: "x".repeat(300 * 1_024) })
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(JSON.parse(oversized.body), {
      error: "PAYLOAD_TOO_LARGE",
      sourceContentsVerified: false,
      freshnessAttestedByAgent: false,
      marketplaceEligible: false,
      activationEligible: false,
      executionEnabled: false
    });
  } finally {
    await stopRunningApp(running);
  }
});

test("dual app serves A2A JSON-RPC and rejects ambiguous structured requests", async () => {
  const running = await startApp();
  try {
    const response = await request(running.baseUrl, "/", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "message/send",
        params: {
          message: {
            kind: "message",
            role: "user",
            messageId: "http-ambiguous-health",
            parts: [
              { kind: "data", data: { skill: "analyze_venus_health_factor" } },
              { kind: "data", data: { skill: "repay_now" } }
            ]
          }
        }
      })
    });
    assert.equal(response.status, 200);
    const envelope = JSON.parse(response.body) as {
      result?: { parts?: Array<{ kind?: string; data?: Record<string, unknown> }> };
    };
    const resultPart = envelope.result?.parts?.[0];
    assert.equal(resultPart?.kind, "data");
    assert.ok(resultPart.data);
    assert.equal(resultPart.data.error, "INVALID_ANALYSIS_INPUT");
    assert.equal(resultPart.data.executionEnabled, false);
  } finally {
    await stopRunningApp(running);
  }
});

test("dual app serves MCP over HTTP and enforces its session bound", async () => {
  const running = await startApp({ maxMcpSessions: 1 });
  const firstClient = new Client({ name: "health-http-test", version: "1.0.0" });
  const firstTransport = new StreamableHTTPClientTransport(new URL("mcp", running.baseUrl));
  const secondClient = new Client({ name: "health-capacity-test", version: "1.0.0" });
  const secondTransport = new StreamableHTTPClientTransport(new URL("mcp", running.baseUrl));
  try {
    const connections = await Promise.allSettled([
      firstClient.connect(new ExactOptionalClientTransport(firstTransport)),
      secondClient.connect(new ExactOptionalClientTransport(secondTransport))
    ]);
    assert.equal(connections.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(connections.filter(({ status }) => status === "rejected").length, 1);
    const connectedClient = connections[0].status === "fulfilled" ? firstClient : secondClient;
    const tools = await connectedClient.listTools();
    assert.deepEqual(
      tools.tools.map(({ name }) => name),
      ["analyze_venus_health_factor"]
    );
  } finally {
    await Promise.allSettled([secondClient.close(), firstClient.close()]);
    await stopRunningApp(running);
  }
});

test("MCP issues independent cryptographic capability identifiers by default", async () => {
  const running = await startApp();
  try {
    const first = await initializeMcpSession(running, 101);
    const second = await initializeMcpSession(running, 102);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.match(first.sessionId, /^hfg_[A-Za-z0-9_-]{43}$/);
    assert.match(second.sessionId, /^hfg_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first.sessionId, second.sessionId);
    assert.doesNotMatch(first.sessionId, /health-session/);
  } finally {
    await stopRunningApp(running);
  }
});

test("guessed, expired, and deleted MCP capabilities cannot affect another session", async () => {
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

    const guessed = await listMcpTools(running, capabilityId(999));
    assert.equal(guessed.status, 400);
    assert.match(guessed.body, /no valid MCP session/);
    assert.equal((await listMcpTools(running, second.sessionId)).status, 200);

    nowMilliseconds = 1_000;
    const expired = await listMcpTools(running, first.sessionId);
    assert.equal(expired.status, 400);
    assert.match(expired.body, /no valid MCP session/);
    assert.equal((await listMcpTools(running, second.sessionId)).status, 200);

    const third = await initializeMcpSession(running, 203);
    assert.equal(third.status, 200);
    assert.equal((await deleteMcpSession(running, second.sessionId)).status, 200);
    assert.equal((await listMcpTools(running, second.sessionId)).status, 400);
    assert.equal((await listMcpTools(running, third.sessionId)).status, 200);
  } finally {
    await stopRunningApp(running);
  }
});

test("MCP initialization is independently rate limited", async () => {
  let nextCapability = 1;
  const running = await startApp({
    maxMcpInitializationsPerMinute: 2,
    sessionIdFactory: () => capabilityId(nextCapability++)
  });
  try {
    assert.equal((await initializeMcpSession(running, 301)).status, 200);
    assert.equal((await initializeMcpSession(running, 302)).status, 200);
    const limited = await initializeMcpSession(running, 303);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers["retry-after"], "60");
    assert.match(limited.body, /initialization rate limit reached/);
  } finally {
    await stopRunningApp(running);
  }
});

test("64-slot MCP exhaustion rejects excess concurrent initialization", async () => {
  let nextCapability = 1;
  const running = await startApp({
    maxMcpSessions: 64,
    maxMcpInitializationsPerMinute: 64,
    sessionIdFactory: () => capabilityId(nextCapability++)
  });
  try {
    const admissions = await Promise.all(
      Array.from({ length: 65 }, (_, index) => initializeMcpSession(running, 400 + index))
    );
    assert.equal(admissions.filter(({ status }) => status === 200).length, 64);
    assert.equal(admissions.filter(({ status }) => status === 503).length, 1);
    assert.equal(admissions.filter(({ status }) => status === 429).length, 0);
    assert.match(
      admissions.find(({ status }) => status === 503)?.body ?? "",
      /session capacity reached/
    );
  } finally {
    await stopRunningApp(running);
  }
});

test("invalid or colliding injected MCP capabilities fail closed", async () => {
  const collision = capabilityId(1);
  const running = await startApp({ sessionIdFactory: () => collision });
  try {
    const first = await initializeMcpSession(running, 501);
    assert.equal(first.status, 200);
    const rejected = await initializeMcpSession(running, 502);
    assert.equal(rejected.status, 503);
    assert.match(rejected.body, /session capability unavailable/);
    assert.equal((await listMcpTools(running, first.sessionId)).status, 200);
  } finally {
    await stopRunningApp(running);
  }
});

interface RunningApp {
  app: HealthFactorGuardianDualApp;
  server: Server;
  baseUrl: URL;
}

interface McpHttpResponse {
  status: number;
  body: string;
  headers: IncomingHttpHeaders;
}

interface McpInitialization extends McpHttpResponse {
  sessionId: string;
}

const MCP_PROTOCOL_VERSION = "2025-03-26";
const MCP_ACCEPT = "application/json, text/event-stream";

function capabilityId(sequence: number): string {
  return `hfg_${sequence.toString(36).padStart(43, "0")}`;
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
        clientInfo: { name: "health-guardian-http-test", version: "1.0.0" }
      }
    })
  });
  const sessionHeader = response.headers["mcp-session-id"];
  return {
    ...response,
    sessionId: typeof sessionHeader === "string" ? sessionHeader : ""
  };
}

function listMcpTools(running: RunningApp, sessionId: string): Promise<McpHttpResponse> {
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

function deleteMcpSession(running: RunningApp, sessionId: string): Promise<McpHttpResponse> {
  return request(running.baseUrl, "/mcp", {
    method: "DELETE",
    headers: {
      accept: MCP_ACCEPT,
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      "mcp-session-id": sessionId
    }
  });
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

async function startApp(options: Omit<DualAppOptions, "runtimeConfig"> = {}): Promise<RunningApp> {
  const app = buildHealthFactorGuardianDualApp({
    runtimeConfig: {
      bindHost: "127.0.0.1",
      port: 9_000,
      publicUrl: "https://guardian.example/a2a/"
    },
    ...options
  });
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1");
    candidate.once("listening", () => {
      resolve(candidate);
    });
    candidate.once("error", reject);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await app.closeMcpSessions();
    await stopServer(server);
    throw new Error("Expected an IP listener address");
  }
  return { app, server, baseUrl: new URL(`http://127.0.0.1:${String(address.port)}/`) };
}

interface RequestOptions {
  method?: "DELETE" | "GET" | "POST";
  body?: string;
  headers?: Readonly<Record<string, string>>;
}

function request(
  baseUrl: URL,
  path: string,
  options: RequestOptions = {}
): Promise<{ status: number; body: string; headers: IncomingHttpHeaders }> {
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
