import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";

import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { createEnvelopeMiddleware } from "@bnbagent/studio-runtime/x402";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type {
  Transport,
  TransportSendOptions
} from "@modelcontextprotocol/sdk/shared/transport.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";

import { GridTradingAgentExecutor } from "./a2a.js";
import { buildGridTradingAgentCard } from "./agentCard.js";
import { buildGridTradingMcpServer } from "./mcp.js";
import {
  assertUnauthenticatedGridConfiguration,
  resolveRuntimeConfig,
  type RuntimeConfig,
  type RuntimeEnvironment
} from "./runtimeConfig.js";

const MAX_JSON_BODY_BYTES = 256 * 1_024;
const MAX_HTTP_HEADER_BYTES = 16 * 1_024;
const DEFAULT_MAX_MCP_SESSIONS = 64;
const ABSOLUTE_MAX_MCP_SESSIONS = 64;
const DEFAULT_MCP_SESSION_IDLE_MILLISECONDS = 15 * 60 * 1_000;
const MIN_MCP_SESSION_IDLE_MILLISECONDS = 1_000;
const MAX_MCP_SESSION_IDLE_MILLISECONDS = 15 * 60 * 1_000;
const DEFAULT_MAX_MCP_INITIALIZATIONS_PER_MINUTE = 64;
const ABSOLUTE_MAX_MCP_INITIALIZATIONS_PER_MINUTE = 64;
const MCP_INITIALIZATION_WINDOW_MILLISECONDS = 60 * 1_000;
const MCP_SESSION_ID_ATTEMPTS = 8;
const MCP_SESSION_ID_PATTERN = /^grid_[A-Za-z0-9_-]{43}$/;

export const GRID_SERVER_TIMEOUTS = Object.freeze({
  requestMilliseconds: 30_000,
  headersMilliseconds: 10_000,
  keepAliveMilliseconds: 5_000,
  socketMilliseconds: 30_000
});

interface McpSession {
  transport: StreamableHTTPServerTransport;
  lastSeenMilliseconds: number;
}

export interface GridDualAppOptions {
  runtimeConfig?: RuntimeConfig;
  runtimeEnvironment?: RuntimeEnvironment;
  maxMcpSessions?: number;
  maxMcpInitializationsPerMinute?: number;
  mcpSessionIdleMilliseconds?: number;
  sessionIdFactory?: () => string;
  now?: () => number;
}

export interface GridTradingDualApp extends express.Express {
  closeMcpSessions: () => Promise<void>;
}

/** Build the single-port read-only AgentCore app without opening a listener. */
export function buildGridTradingDualApp(options: GridDualAppOptions = {}): GridTradingDualApp {
  const environment = options.runtimeEnvironment ?? process.env;
  assertUnauthenticatedGridConfiguration(environment);
  const runtime = options.runtimeConfig ?? resolveRuntimeConfig(environment);
  const maxMcpSessions = boundedSessionLimit(options.maxMcpSessions);
  const maxInitializations = boundedInitializationLimit(options.maxMcpInitializationsPerMinute);
  const idleMilliseconds = boundedIdleMilliseconds(options.mcpSessionIdleMilliseconds);
  const sessionIdFactory = options.sessionIdFactory ?? randomCapabilityId;
  const now = options.now ?? Date.now;
  const handler = new DefaultRequestHandler(
    buildGridTradingAgentCard(runtime.publicUrl),
    new InMemoryTaskStore(),
    new GridTradingAgentExecutor()
  );
  const sessions = new Map<string, McpSession>();
  const pendingSessionIds = new Set<string>();
  const initializationAttempts: number[] = [];

  const app = express() as GridTradingDualApp;
  let cleanupInFlight: Promise<void> | null = null;
  const runCleanup = (): Promise<void> => {
    cleanupInFlight ??= expireIdleSessions(sessions, safeNow(now), idleMilliseconds).finally(() => {
      cleanupInFlight = null;
    });
    return cleanupInFlight;
  };
  const cleanupTimer = setInterval(
    () => {
      void runCleanup().catch(() => undefined);
    },
    Math.min(idleMilliseconds, 60_000)
  );
  cleanupTimer.unref();
  app.closeMcpSessions = async (): Promise<void> => {
    clearInterval(cleanupTimer);
    if (cleanupInFlight !== null) await cleanupInFlight;
    const active = [...sessions.values()];
    sessions.clear();
    pendingSessionIds.clear();
    await Promise.allSettled(active.map(({ transport }) => transport.close()));
  };

  app.disable("x-powered-by");
  app.use(securityHeaders());
  app.get("/ping", (_request, response) => {
    response.json({ status: "HEALTHY", executionEnabled: false });
  });
  app.use(express.json({ limit: MAX_JSON_BODY_BYTES, strict: true }));
  app.use(createEnvelopeMiddleware({ port: runtime.port }));
  app.use("/.well-known/agent-card.json", agentCardHandler({ agentCardProvider: handler }));

  app.all("/mcp", async (request, response) => {
    await runCleanup();
    let pendingReservation = false;
    let reservedSessionId: string | null = null;
    const sessionHeader = request.headers["mcp-session-id"];
    const sessionId = typeof sessionHeader === "string" ? sessionHeader : undefined;
    let session = sessionId === undefined ? undefined : sessions.get(sessionId);
    if (session === undefined) {
      if (sessionHeader !== undefined) {
        response.status(400).json(mcpError(-32_000, "Bad Request: no valid MCP session"));
        return;
      }
      if (request.method !== "POST" || !isInitializeRequest(request.body)) {
        response.status(400).json(mcpError(-32_000, "Bad Request: no valid MCP session"));
        return;
      }
      if (sessions.size + pendingSessionIds.size >= maxMcpSessions) {
        response.status(503).json(mcpError(-32_003, "MCP session capacity reached"));
        return;
      }
      const attemptedAt = safeNow(now);
      pruneInitializationAttempts(initializationAttempts, attemptedAt);
      if (initializationAttempts.length >= maxInitializations) {
        response.setHeader("Retry-After", "60");
        response.status(429).json(mcpError(-32_029, "MCP initialization rate limit reached"));
        return;
      }
      initializationAttempts.push(attemptedAt);
      const nextSessionId = reserveSessionId(sessionIdFactory, sessions, pendingSessionIds);
      if (nextSessionId === null) {
        response.status(503).json(mcpError(-32_004, "MCP session capability unavailable"));
        return;
      }
      pendingSessionIds.add(nextSessionId);
      pendingReservation = true;
      reservedSessionId = nextSessionId;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => nextSessionId,
        enableJsonResponse: true,
        onsessioninitialized: () => {
          if (pendingReservation) {
            pendingSessionIds.delete(nextSessionId);
            pendingReservation = false;
          }
          sessions.set(nextSessionId, {
            transport,
            lastSeenMilliseconds: safeNow(now)
          });
        }
      });
      const serverTransport = new ExactOptionalTransport(transport);
      serverTransport.onclose = () => {
        sessions.delete(nextSessionId);
      };
      try {
        await buildGridTradingMcpServer().connect(serverTransport);
      } catch (error) {
        pendingSessionIds.delete(nextSessionId);
        pendingReservation = false;
        await transport.close().catch(() => undefined);
        throw error;
      }
      session = { transport, lastSeenMilliseconds: safeNow(now) };
    } else {
      session.lastSeenMilliseconds = safeNow(now);
    }
    try {
      await session.transport.handleRequest(request, response, request.body);
    } catch (error) {
      await session.transport.close().catch(() => undefined);
      throw error;
    } finally {
      if (pendingReservation && reservedSessionId !== null) {
        pendingSessionIds.delete(reservedSessionId);
        await session.transport.close().catch(() => undefined);
      }
    }
  });

  app.use(
    jsonRpcHandler({
      requestHandler: handler,
      userBuilder: UserBuilder.noAuthentication
    })
  );
  app.use(jsonErrorHandler());
  return app;
}

/** Create the supported HTTP server with an explicit header and timeout budget. */
export function createGridTradingHttpServer(app: express.Express): Server {
  const server = createServer({ maxHeaderSize: MAX_HTTP_HEADER_BYTES }, app);
  server.requestTimeout = GRID_SERVER_TIMEOUTS.requestMilliseconds;
  server.headersTimeout = GRID_SERVER_TIMEOUTS.headersMilliseconds;
  server.keepAliveTimeout = GRID_SERVER_TIMEOUTS.keepAliveMilliseconds;
  server.timeout = GRID_SERVER_TIMEOUTS.socketMilliseconds;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 100;
  return server;
}

/** Adapter for the MCP SDK's exact-optional class/interface declaration mismatch. */
class ExactOptionalTransport implements Transport {
  onclose: () => void = () => undefined;
  onerror: (error: Error) => void = () => undefined;
  onmessage: NonNullable<Transport["onmessage"]> = () => undefined;

  constructor(private readonly inner: StreamableHTTPServerTransport) {
    inner.onclose = () => {
      this.onclose();
    };
    inner.onerror = (error) => {
      this.onerror(error);
    };
    inner.onmessage = (message, extra) => {
      this.onmessage(message, extra);
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

function securityHeaders(): RequestHandler {
  return (_request, response, next) => {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    );
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Cache-Control", "no-store");
    next();
  };
}

function boundedSessionLimit(configured: number | undefined): number {
  return configured !== undefined &&
    Number.isInteger(configured) &&
    configured >= 1 &&
    configured <= ABSOLUTE_MAX_MCP_SESSIONS
    ? configured
    : DEFAULT_MAX_MCP_SESSIONS;
}

function boundedInitializationLimit(configured: number | undefined): number {
  return configured !== undefined &&
    Number.isInteger(configured) &&
    configured >= 1 &&
    configured <= ABSOLUTE_MAX_MCP_INITIALIZATIONS_PER_MINUTE
    ? configured
    : DEFAULT_MAX_MCP_INITIALIZATIONS_PER_MINUTE;
}

function boundedIdleMilliseconds(configured: number | undefined): number {
  return configured !== undefined &&
    Number.isInteger(configured) &&
    configured >= MIN_MCP_SESSION_IDLE_MILLISECONDS &&
    configured <= MAX_MCP_SESSION_IDLE_MILLISECONDS
    ? configured
    : DEFAULT_MCP_SESSION_IDLE_MILLISECONDS;
}

function safeNow(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("MCP session clock must return a non-negative safe integer");
  }
  return value;
}

function randomCapabilityId(): string {
  return `grid_${randomBytes(32).toString("base64url")}`;
}

function reserveSessionId(
  factory: () => string,
  sessions: ReadonlyMap<string, McpSession>,
  pending: ReadonlySet<string>
): string | null {
  for (let attempt = 0; attempt < MCP_SESSION_ID_ATTEMPTS; attempt += 1) {
    let candidate: string;
    try {
      candidate = factory();
    } catch {
      return null;
    }
    if (
      MCP_SESSION_ID_PATTERN.test(candidate) &&
      !sessions.has(candidate) &&
      !pending.has(candidate)
    ) {
      return candidate;
    }
  }
  return null;
}

function pruneInitializationAttempts(attempts: number[], currentMilliseconds: number): void {
  const oldestAllowed = currentMilliseconds - MCP_INITIALIZATION_WINDOW_MILLISECONDS;
  while (attempts.length > 0 && (attempts[0] ?? currentMilliseconds) <= oldestAllowed) {
    attempts.shift();
  }
}

async function expireIdleSessions(
  sessions: Map<string, McpSession>,
  currentMilliseconds: number,
  idleMilliseconds: number
): Promise<void> {
  const expired = [...sessions.entries()].filter(
    ([, session]) => currentMilliseconds - session.lastSeenMilliseconds >= idleMilliseconds
  );
  for (const [sessionId, session] of expired) {
    sessions.delete(sessionId);
    await session.transport.close().catch(() => undefined);
  }
}

function mcpError(code: number, message: string): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    error: { code, message, data: { executionEnabled: false } },
    id: null
  };
}

function jsonErrorHandler(): ErrorRequestHandler {
  return (error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const status = errorStatus(error);
    if (status === 413) {
      response.status(413).json({ error: "PAYLOAD_TOO_LARGE", executionEnabled: false });
      return;
    }
    response.status(status !== null && status >= 400 && status < 500 ? status : 500).json({
      error:
        status !== null && status >= 400 && status < 500 ? "INVALID_JSON_BODY" : "SERVER_ERROR",
      executionEnabled: false
    });
  };
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? status : null;
}

async function main(): Promise<void> {
  const runtime = resolveRuntimeConfig();
  const app = buildGridTradingDualApp({ runtimeConfig: runtime });
  const server = createGridTradingHttpServer(app);
  server.once("close", () => void app.closeMcpSessions());
  server.listen(runtime.port, runtime.bindHost);
  await new Promise<void>((resolve, reject) => {
    const listening = (): void => {
      server.off("error", failed);
      console.log(
        `[grid-trading-agent] A2A + MCP serving on ${runtime.bindHost}:${String(runtime.port)}`
      );
      resolve();
    };
    const failed = (error: Error): void => {
      server.off("listening", listening);
      reject(error);
    };
    server.once("listening", listening);
    server.once("error", failed);
  });
}

const entrypoint = process.argv.at(1);
const isMain = entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
if (isMain) {
  main().catch((error: unknown) => {
    const name = error instanceof Error ? error.constructor.name : "Error";
    console.error(`[grid-trading-agent] fatal ${name}`);
    process.exit(1);
  });
}
