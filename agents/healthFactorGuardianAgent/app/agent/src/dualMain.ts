import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

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
import express, { type ErrorRequestHandler } from "express";

import { HealthFactorGuardianAgentExecutor } from "./a2a.js";
import { buildHealthFactorGuardianAgentCard } from "./agentCard.js";
import { buildHealthFactorGuardianMcpServer } from "./mcp.js";
import { resolveRuntimeConfig, type RuntimeConfig } from "./runtimeConfig.js";

const MAX_JSON_BODY_BYTES = 256 * 1_024;
const DEFAULT_MAX_MCP_SESSIONS = 64;
const ABSOLUTE_MAX_MCP_SESSIONS = 64;
const DEFAULT_MCP_SESSION_IDLE_MILLISECONDS = 15 * 60 * 1_000;
const MIN_MCP_SESSION_IDLE_MILLISECONDS = 1_000;
const MAX_MCP_SESSION_IDLE_MILLISECONDS = 15 * 60 * 1_000;
const DEFAULT_MAX_MCP_INITIALIZATIONS_PER_MINUTE = 64;
const ABSOLUTE_MAX_MCP_INITIALIZATIONS_PER_MINUTE = 64;
const MCP_INITIALIZATION_WINDOW_MILLISECONDS = 60 * 1_000;
const MCP_SESSION_ID_ATTEMPTS = 8;
const MCP_SESSION_ID_PATTERN = /^hfg_[A-Za-z0-9_-]{43}$/;

interface McpSession {
  transport: StreamableHTTPServerTransport;
  lastSeenMilliseconds: number;
}

export interface DualAppOptions {
  runtimeConfig?: RuntimeConfig;
  maxMcpSessions?: number;
  maxMcpInitializationsPerMinute?: number;
  mcpSessionIdleMilliseconds?: number;
  sessionIdFactory?: () => string;
  now?: () => number;
}

export interface HealthFactorGuardianDualApp extends express.Express {
  closeMcpSessions: () => Promise<void>;
}

/**
 * Build the single-port BNB Agent Studio app without opening a listener.
 * The runtime envelope middleware only transports A2A/MCP HTTP requests; no
 * x402 seller, payment, wallet, or commerce route is registered.
 */
export function buildHealthFactorGuardianDualApp(
  options: DualAppOptions = {}
): HealthFactorGuardianDualApp {
  const runtime = options.runtimeConfig ?? resolveRuntimeConfig();
  const maxMcpSessions = boundedSessionLimit(options.maxMcpSessions);
  const maxInitializations = boundedInitializationLimit(options.maxMcpInitializationsPerMinute);
  const idleMilliseconds = boundedIdleMilliseconds(options.mcpSessionIdleMilliseconds);
  const sessionIdFactory = options.sessionIdFactory ?? randomCapabilityId;
  const now = options.now ?? Date.now;
  const card = buildHealthFactorGuardianAgentCard(runtime.publicUrl);
  const handler = new DefaultRequestHandler(
    card,
    new InMemoryTaskStore(),
    new HealthFactorGuardianAgentExecutor()
  );
  const sessions = new Map<string, McpSession>();
  const pendingSessionIds = new Set<string>();
  const initializationAttempts: number[] = [];

  const app = express() as HealthFactorGuardianDualApp;
  let cleanupInFlight: Promise<void> | null = null;
  const runCleanup = (): Promise<void> => {
    cleanupInFlight ??= expireIdleSessions(sessions, now(), idleMilliseconds).finally(() => {
      cleanupInFlight = null;
    });
    return cleanupInFlight;
  };
  const cleanupTimer = setInterval(() => void runCleanup(), Math.min(idleMilliseconds, 60_000));
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
  app.get("/ping", (_request, response) => {
    response.json({
      status: "HEALTHY",
      sourceContentsVerified: false,
      freshnessAttestedByAgent: false,
      marketplaceEligible: false,
      activationEligible: false,
      executionEnabled: false
    });
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
      const attemptedAt = now();
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
        onsessioninitialized: (initializedId) => {
          if (pendingReservation) {
            pendingSessionIds.delete(nextSessionId);
            pendingReservation = false;
          }
          sessions.set(initializedId, {
            transport,
            lastSeenMilliseconds: now()
          });
        }
      });
      const serverTransport = new ExactOptionalTransport(transport);
      serverTransport.onclose = () => {
        if (transport.sessionId !== undefined) sessions.delete(transport.sessionId);
      };
      try {
        await buildHealthFactorGuardianMcpServer().connect(serverTransport);
      } catch (error) {
        pendingSessionIds.delete(nextSessionId);
        pendingReservation = false;
        await transport.close().catch(() => undefined);
        throw error;
      }
      session = { transport, lastSeenMilliseconds: now() };
    } else {
      session.lastSeenMilliseconds = now();
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

function randomCapabilityId(): string {
  return `hfg_${randomBytes(32).toString("base64url")}`;
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
    error: { code, message, data: unverifiedReadOnlyState() },
    id: null
  };
}

function unverifiedReadOnlyState(): {
  sourceContentsVerified: false;
  freshnessAttestedByAgent: false;
  marketplaceEligible: false;
  activationEligible: false;
  executionEnabled: false;
} {
  return {
    sourceContentsVerified: false,
    freshnessAttestedByAgent: false,
    marketplaceEligible: false,
    activationEligible: false,
    executionEnabled: false
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
      response.status(413).json({ error: "PAYLOAD_TOO_LARGE", ...unverifiedReadOnlyState() });
      return;
    }
    response.status(status !== null && status >= 400 && status < 500 ? status : 500).json({
      error:
        status !== null && status >= 400 && status < 500 ? "INVALID_JSON_BODY" : "SERVER_ERROR",
      ...unverifiedReadOnlyState()
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
  const app = buildHealthFactorGuardianDualApp({ runtimeConfig: runtime });
  const server = app.listen(runtime.port, runtime.bindHost);
  server.once("close", () => void app.closeMcpSessions());
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  await new Promise<void>((resolve, reject) => {
    const listening = (): void => {
      server.off("error", failed);
      console.log(
        `[health-factor-guardian] A2A + MCP serving on ${runtime.bindHost}:${String(runtime.port)}`
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

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error: unknown) => {
    const name = error instanceof Error ? error.constructor.name : "Error";
    console.error(`[health-factor-guardian] fatal ${name}`);
    process.exit(1);
  });
}
