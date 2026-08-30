import { z } from "zod";

import {
  testnetAnalyzerCategorySchema,
  testnetAnalyzerForCategory
} from "../../../lib/testnet-analyzer-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAXIMUM_REQUEST_BYTES = 96 * 1_024;
const MAXIMUM_AGENT_RESPONSE_BYTES = 384 * 1_024;
const AGENT_TIMEOUT_MILLISECONDS = 15_000;
const RATE_LIMIT_WINDOW_MILLISECONDS = 60_000;
const MAXIMUM_RUNS_PER_WINDOW = 120;
const sensitiveFieldPattern =
  /(?:private.?key|mnemonic|seed.?phrase|password|keystore|session.?signer|api.?key|secret|authorization|cookie)/iu;

const analyzerRunRequestSchema = z.strictObject({
  category: testnetAnalyzerCategorySchema,
  input: z.record(z.string().min(1).max(120), z.unknown())
});

const a2aResponseSchema = z.looseObject({
  jsonrpc: z.literal("2.0"),
  id: z.string().min(1).max(120),
  result: z.looseObject({
    kind: z.literal("message"),
    role: z.literal("agent"),
    parts: z
      .array(
        z.looseObject({
          kind: z.literal("data"),
          data: z.record(z.string().min(1).max(120), z.unknown())
        })
      )
      .min(1)
      .max(8)
  })
});

type FetchImplementation = (
  input: string | URL | globalThis.Request,
  init?: RequestInit
) => Promise<Response>;

interface AnalyzerRateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

interface AnalyzerRateLimiter {
  consume(nowMilliseconds: number): AnalyzerRateLimitDecision;
}

export interface AnalyzerRunDependencies {
  readonly fetchImplementation?: FetchImplementation;
  readonly createId?: () => string;
  readonly now?: () => Date;
  readonly nowMilliseconds?: () => number;
}

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
  extraHeaders: Readonly<Record<string, string>> = {}
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-ProofEra-Boundary": "bsc-testnet-read-only-analyzer",
      ...extraHeaders
    }
  });
}

export function createMemoryAnalyzerRateLimiter(): AnalyzerRateLimiter {
  let windowStartedAt = 0;
  let used = 0;
  return {
    consume(nowMilliseconds) {
      if (
        windowStartedAt === 0 ||
        nowMilliseconds < windowStartedAt ||
        nowMilliseconds - windowStartedAt >= RATE_LIMIT_WINDOW_MILLISECONDS
      ) {
        windowStartedAt = nowMilliseconds;
        used = 0;
      }
      if (used >= MAXIMUM_RUNS_PER_WINDOW) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(
              (RATE_LIMIT_WINDOW_MILLISECONDS - (nowMilliseconds - windowStartedAt)) / 1_000
            )
          )
        };
      }
      used += 1;
      return {
        allowed: true,
        remaining: MAXIMUM_RUNS_PER_WINDOW - used,
        retryAfterSeconds: 0
      };
    }
  };
}

const publicAnalyzerRateLimiter = createMemoryAnalyzerRateLimiter();

function errorResponse(status: number, code: string, message: string): Response {
  return response(status, {
    status: "blocked",
    code,
    message,
    chainId: 97,
    executionEnabled: false,
    walletAccessed: false,
    transactionSubmitted: false
  });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function hasSensitiveField(value: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    visited += 1;
    if (visited > 5_000 || current.depth > 20) return true;
    if (Array.isArray(current.value)) {
      for (const entry of current.value) pending.push({ value: entry, depth: current.depth + 1 });
      continue;
    }
    if (current.value === null || typeof current.value !== "object") continue;
    for (const [key, entry] of Object.entries(current.value)) {
      if (sensitiveFieldPattern.test(key)) return true;
      pending.push({ value: entry, depth: current.depth + 1 });
    }
  }
  return false;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError";
}

export async function createAnalyzerRunResponse(
  request: Request,
  dependencies: AnalyzerRunDependencies = {}
): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return errorResponse(415, "CONTENT_TYPE_INVALID", "Send one application/json request body.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && /^\d+$/u.test(declaredLength)) {
    if (Number(declaredLength) > MAXIMUM_REQUEST_BYTES) {
      return errorResponse(413, "REQUEST_TOO_LARGE", "The analyzer request exceeds 96 KiB.");
    }
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(400, "REQUEST_BODY_UNREADABLE", "The analyzer request could not be read.");
  }
  if (byteLength(rawBody) > MAXIMUM_REQUEST_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "The analyzer request exceeds 96 KiB.");
  }

  let unparsed: unknown;
  try {
    unparsed = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "REQUEST_JSON_INVALID", "The analyzer request is not valid JSON.");
  }
  const parsed = analyzerRunRequestSchema.safeParse(unparsed);
  if (!parsed.success) {
    return errorResponse(
      400,
      "REQUEST_SCHEMA_INVALID",
      "Select one supported analyzer and provide one bounded object input."
    );
  }

  const analyzer = testnetAnalyzerForCategory(parsed.data.category);
  if (parsed.data.input.skill !== analyzer.skill) {
    return errorResponse(
      400,
      "SKILL_SCOPE_INVALID",
      "The input skill does not match the selected analyzer."
    );
  }
  if (parsed.data.input.chainId !== 97) {
    return errorResponse(
      400,
      "CHAIN_SCOPE_INVALID",
      "The public studio accepts BSC testnet chain ID 97 only."
    );
  }
  if (hasSensitiveField(parsed.data.input)) {
    return errorResponse(
      400,
      "SENSITIVE_FIELD_REJECTED",
      "Remove wallet credentials, secrets, authorization material, and keystores from the input."
    );
  }

  const requestId = (dependencies.createId ?? (() => crypto.randomUUID()))();
  if (!/^[A-Za-z0-9-]{8,80}$/u.test(requestId)) {
    throw new TypeError("Analyzer request ID generator returned an invalid value.");
  }
  const a2aBody = JSON.stringify({
    jsonrpc: "2.0",
    id: requestId,
    method: "message/send",
    params: {
      message: {
        kind: "message",
        role: "user",
        messageId: `${requestId}-request`,
        parts: [{ kind: "data", data: parsed.data.input }]
      }
    }
  });
  const startedAt = (dependencies.nowMilliseconds ?? (() => performance.now()))();

  let agentResponse: Response;
  try {
    agentResponse = await (dependencies.fetchImplementation ?? fetch)(analyzer.endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: a2aBody,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MILLISECONDS)
    });
  } catch (error) {
    return errorResponse(
      isAbortError(error) ? 504 : 502,
      isAbortError(error) ? "AGENT_TIMEOUT" : "AGENT_UNAVAILABLE",
      isAbortError(error)
        ? "The analyzer did not answer within the bounded window."
        : "The selected analyzer endpoint is unavailable."
    );
  }

  if (agentResponse.status !== 200) {
    return errorResponse(502, "AGENT_HTTP_INVALID", "The analyzer returned an unexpected status.");
  }
  const declaredResponseLength = agentResponse.headers.get("content-length");
  if (
    declaredResponseLength !== null &&
    /^\d+$/u.test(declaredResponseLength) &&
    Number(declaredResponseLength) > MAXIMUM_AGENT_RESPONSE_BYTES
  ) {
    return errorResponse(502, "AGENT_RESPONSE_TOO_LARGE", "The analyzer response was rejected.");
  }

  let responseBytes: ArrayBuffer;
  try {
    responseBytes = await agentResponse.arrayBuffer();
  } catch {
    return errorResponse(502, "AGENT_RESPONSE_UNREADABLE", "The analyzer response was rejected.");
  }
  if (responseBytes.byteLength > MAXIMUM_AGENT_RESPONSE_BYTES) {
    return errorResponse(502, "AGENT_RESPONSE_TOO_LARGE", "The analyzer response was rejected.");
  }

  let unparsedAgentResponse: unknown;
  try {
    unparsedAgentResponse = JSON.parse(new TextDecoder().decode(responseBytes));
  } catch {
    return errorResponse(502, "AGENT_RESPONSE_INVALID", "The analyzer returned invalid JSON.");
  }
  const parsedAgentResponse = a2aResponseSchema.safeParse(unparsedAgentResponse);
  if (!parsedAgentResponse.success || parsedAgentResponse.data.id !== requestId) {
    return errorResponse(
      502,
      "AGENT_ENVELOPE_INVALID",
      "The analyzer response envelope was rejected."
    );
  }

  const result = parsedAgentResponse.data.result.parts[0]?.data;
  if (result === undefined || result.executionEnabled !== false) {
    return errorResponse(
      502,
      "AGENT_BOUNDARY_INVALID",
      "The analyzer did not preserve the read-only execution boundary."
    );
  }
  const rejected = typeof result.error === "string";
  if (!rejected) {
    if (
      result.skill !== analyzer.skill ||
      result.chainId !== 97 ||
      result.environment !== "bsc-testnet"
    ) {
      return errorResponse(
        502,
        "AGENT_SCOPE_INVALID",
        "The analyzer result did not match the requested BSC-testnet scope."
      );
    }
  }

  const endedAt = (dependencies.nowMilliseconds ?? (() => performance.now()))();
  const observedAtUtc = (dependencies.now ?? (() => new Date()))().toISOString();
  return response(200, {
    status: rejected ? "rejected" : "completed",
    runId: requestId,
    category: analyzer.category,
    agent: {
      label: analyzer.label,
      agentId: analyzer.agentId,
      endpoint: analyzer.endpoint,
      skill: analyzer.skill,
      expectedMethodologyVersion: analyzer.methodologyVersion
    },
    observedAtUtc,
    latencyMilliseconds: Math.max(0, Math.round(endedAt - startedAt)),
    trust: "caller_supplied_unverified",
    result,
    boundary: {
      chainId: 97,
      environment: "bsc-testnet",
      executionEnabled: false,
      walletAccessed: false,
      transactionSubmitted: false,
      serverPersistence: false
    }
  });
}

export async function POST(request: Request): Promise<Response> {
  const rateLimit = publicAnalyzerRateLimiter.consume(Date.now());
  const rateLimitHeaders = {
    "X-RateLimit-Limit": String(MAXIMUM_RUNS_PER_WINDOW),
    "X-RateLimit-Remaining": String(rateLimit.remaining)
  };
  if (!rateLimit.allowed) {
    return response(
      429,
      {
        status: "blocked",
        code: "ANALYZER_RATE_LIMITED",
        message: "The bounded analyzer capacity is temporarily exhausted. Try again later.",
        chainId: 97,
        executionEnabled: false,
        walletAccessed: false,
        transactionSubmitted: false
      },
      { ...rateLimitHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) }
    );
  }
  const analyzerResponse = await createAnalyzerRunResponse(request);
  for (const [name, value] of Object.entries(rateLimitHeaders)) {
    analyzerResponse.headers.set(name, value);
  }
  return analyzerResponse;
}
