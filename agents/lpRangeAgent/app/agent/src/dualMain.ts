import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";

import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";

import { buildAgentCard } from "./agentCard.js";
import { LpRangeAnalysisExecutor } from "./executor.js";
import { buildMcpServer } from "./mcpMain.js";
import {
  assertUnauthenticatedAnalyzerConfiguration,
  resolveRuntimeConfig,
  type RuntimeConfig,
  type RuntimeEnvironment
} from "./runtimeConfig.js";
import { createStudioEnvelopeMiddleware } from "./studioEnvelope.js";

const MAX_JSON_BODY_BYTES = 256 * 1_024;
const MAX_HTTP_HEADER_BYTES = 16 * 1_024;
const MAX_MCP_SESSIONS = 64;
const MCP_SESSION_IDLE_MILLISECONDS = 5 * 60 * 1_000;
const MCP_INITIALIZATIONS_PER_MINUTE = 64;

export const LP_RANGE_SERVER_TIMEOUTS = Object.freeze({
  requestMilliseconds: 30_000,
  headersMilliseconds: 10_000,
  keepAliveMilliseconds: 5_000,
  socketMilliseconds: 30_000
});

export interface McpInitializationContext {
  readonly directPeerAddress: string | null;
  readonly trustedAdmissionIdentity?: string | null;
  readonly nowMilliseconds: number;
}

export interface McpInitializationLimiter {
  allow(context: McpInitializationContext): boolean;
}

/** Global fixed-window default; forwarded client headers are never trusted. */
export class FixedWindowMcpInitializationLimiter implements McpInitializationLimiter {
  private windowStartedAt: number | null = null;
  private accepted = 0;

  constructor(
    private readonly maximum: number = MCP_INITIALIZATIONS_PER_MINUTE,
    private readonly windowMilliseconds: number = 60_000
  ) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 10_000) {
      throw new TypeError("maximum must be a bounded positive safe integer");
    }
    if (
      !Number.isSafeInteger(windowMilliseconds) ||
      windowMilliseconds < 1_000 ||
      windowMilliseconds > 3_600_000
    ) {
      throw new TypeError("windowMilliseconds must be between one second and one hour");
    }
  }

  allow(context: McpInitializationContext): boolean {
    const now = context.nowMilliseconds;
    if (!Number.isSafeInteger(now) || now < 0) return false;
    if (this.windowStartedAt === null || now - this.windowStartedAt >= this.windowMilliseconds) {
      this.windowStartedAt = now;
      this.accepted = 0;
    }
    if (now < this.windowStartedAt || this.accepted >= this.maximum) return false;
    this.accepted += 1;
    return true;
  }
}

interface IdleEntry<T> {
  readonly value: T;
  lastTouchedAt: number;
}

export class BoundedIdleSessionRegistry<T> {
  private readonly entries = new Map<string, IdleEntry<T>>();

  constructor(
    private readonly maximum: number,
    private readonly idleMilliseconds: number,
    private readonly now: () => number,
    private readonly dispose: (value: T) => void | Promise<void>
  ) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1_024) {
      throw new TypeError("maximum sessions must be between 1 and 1024");
    }
    if (
      !Number.isSafeInteger(idleMilliseconds) ||
      idleMilliseconds < 1_000 ||
      idleMilliseconds > 3_600_000
    ) {
      throw new TypeError("idleMilliseconds must be between one second and one hour");
    }
  }

  get size(): number {
    this.prune();
    return this.entries.size;
  }

  get(sessionId: string): T | undefined {
    const current = this.safeNow();
    this.pruneAt(current);
    const entry = this.entries.get(sessionId);
    if (entry === undefined) return undefined;
    entry.lastTouchedAt = current;
    return entry.value;
  }

  add(sessionId: string, value: T): boolean {
    const current = this.safeNow();
    this.pruneAt(current);
    if (this.entries.has(sessionId) || this.entries.size >= this.maximum) return false;
    this.entries.set(sessionId, { value, lastTouchedAt: current });
    return true;
  }

  remove(sessionId: string): boolean {
    return this.entries.delete(sessionId);
  }

  prune(): number {
    return this.pruneAt(this.safeNow());
  }

  private pruneAt(current: number): number {
    let removed = 0;
    for (const [sessionId, entry] of this.entries) {
      if (current - entry.lastTouchedAt < this.idleMilliseconds) continue;
      this.entries.delete(sessionId);
      removed += 1;
      void Promise.resolve(this.dispose(entry.value)).catch(() => {
        // Expiry stays fail-closed even when a transport cannot cleanly close.
      });
    }
    return removed;
  }

  private safeNow(): number {
    const current = this.now();
    if (!Number.isSafeInteger(current) || current < 0) {
      throw new TypeError("session clock must return a non-negative safe integer");
    }
    return current;
  }
}

export interface BuildDualAppOptions {
  readonly runtimeConfig?: RuntimeConfig;
  readonly runtimeEnvironment?: RuntimeEnvironment;
  readonly nowMilliseconds?: () => number;
  readonly maximumMcpSessions?: number;
  readonly mcpSessionIdleMilliseconds?: number;
  readonly mcpInitializationLimiter?: McpInitializationLimiter;
  /** Inject only a server-authenticated identity, never a forwarded client header. */
  readonly resolveTrustedMcpAdmissionIdentity?: (request: express.Request) => string | null;
}

/** Build the single-port read-only Studio app without opening a listener. */
export function buildDualApp(options: BuildDualAppOptions = {}): express.Express {
  const environment = options.runtimeEnvironment ?? process.env;
  assertUnauthenticatedAnalyzerConfiguration(environment);
  const runtime = options.runtimeConfig ?? resolveRuntimeConfig(environment);
  const nowMilliseconds = options.nowMilliseconds ?? Date.now;
  const initializationLimiter =
    options.mcpInitializationLimiter ?? new FixedWindowMcpInitializationLimiter();
  const handler = new DefaultRequestHandler(
    buildAgentCard(runtime.publicUrl),
    new InMemoryTaskStore(),
    new LpRangeAnalysisExecutor()
  );

  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders());
  app.get("/ping", (_request, response) => {
    response.json({ status: "HEALTHY", executionEnabled: false });
  });
  app.use(express.json({ limit: MAX_JSON_BODY_BYTES, strict: true }));
  // Local transport adapter for Studio's HTTP envelope. It is not an x402,
  // seller, payment, wallet, or signing capability.
  app.use(createStudioEnvelopeMiddleware(runtime.port));
  app.use("/.well-known/agent-card.json", agentCardHandler({ agentCardProvider: handler }));

  const transports = new BoundedIdleSessionRegistry<StreamableHTTPServerTransport>(
    options.maximumMcpSessions ?? MAX_MCP_SESSIONS,
    options.mcpSessionIdleMilliseconds ?? MCP_SESSION_IDLE_MILLISECONDS,
    nowMilliseconds,
    (transport) => transport.close()
  );

  app.all("/mcp", async (request, response) => {
    transports.prune();
    const sessionHeader = request.headers["mcp-session-id"];
    const sessionId = typeof sessionHeader === "string" ? sessionHeader : undefined;
    let transport = sessionId === undefined ? undefined : transports.get(sessionId);
    if (transport === undefined) {
      if (sessionId !== undefined) {
        response.status(404).json(mcpError(-32_001, "Unknown or expired MCP session"));
        return;
      }
      if (request.method !== "POST" || !isInitializeRequest(request.body)) {
        response.status(400).json(mcpError(-32_000, "Bad Request: no valid MCP session"));
        return;
      }
      if (
        !initializationLimiter.allow({
          directPeerAddress: request.socket.remoteAddress ?? null,
          trustedAdmissionIdentity: trustedAdmissionIdentity(
            request,
            options.resolveTrustedMcpAdmissionIdentity
          ),
          nowMilliseconds: nowMilliseconds()
        })
      ) {
        response.status(429).json(mcpError(-32_029, "MCP initialization rate limit reached"));
        return;
      }
      if (transports.size >= (options.maximumMcpSessions ?? MAX_MCP_SESSIONS)) {
        response.status(503).json(mcpError(-32_003, "MCP session capacity reached"));
        return;
      }

      const nextSessionId = `lp-range-session-${randomUUID()}`;
      const nextTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => nextSessionId,
        enableJsonResponse: true,
        onsessioninitialized: () => undefined
      });
      nextTransport.onclose = () => {
        transports.remove(nextSessionId);
      };
      if (!transports.add(nextSessionId, nextTransport)) {
        response.status(503).json(mcpError(-32_003, "MCP session capacity reached"));
        return;
      }
      try {
        await buildMcpServer().connect(nextTransport);
      } catch (error) {
        transports.remove(nextSessionId);
        await nextTransport.close().catch(() => undefined);
        throw error;
      }
      transport = nextTransport;
    }
    await transport.handleRequest(request, response, request.body);
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

function trustedAdmissionIdentity(
  request: express.Request,
  resolver: BuildDualAppOptions["resolveTrustedMcpAdmissionIdentity"]
): string | null {
  if (resolver === undefined) return null;
  try {
    const identity = resolver(request);
    return typeof identity === "string" && /^[A-Za-z0-9:._/-]{1,200}$/.test(identity)
      ? identity
      : null;
  } catch {
    return null;
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

/** Create the supported production HTTP server with bounded resource timers. */
export function createLpRangeHttpServer(app: express.Express): Server {
  const server = createServer({ maxHeaderSize: MAX_HTTP_HEADER_BYTES }, app);
  server.requestTimeout = LP_RANGE_SERVER_TIMEOUTS.requestMilliseconds;
  server.headersTimeout = LP_RANGE_SERVER_TIMEOUTS.headersMilliseconds;
  server.keepAliveTimeout = LP_RANGE_SERVER_TIMEOUTS.keepAliveMilliseconds;
  server.timeout = LP_RANGE_SERVER_TIMEOUTS.socketMilliseconds;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 100;
  return server;
}

async function main(): Promise<void> {
  const runtime = resolveRuntimeConfig();
  const app = buildDualApp({ runtimeConfig: runtime });
  const server = createLpRangeHttpServer(app);
  server.listen(runtime.port, runtime.bindHost);
  await new Promise<void>((resolve, reject) => {
    const listening = (): void => {
      server.off("error", failed);
      console.log(
        `[lp-range-analysis-agent] A2A + MCP serving on ${runtime.bindHost}:${String(runtime.port)}`
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
    console.error(`[lp-range-analysis-agent] fatal ${name}`);
    process.exit(1);
  });
}
