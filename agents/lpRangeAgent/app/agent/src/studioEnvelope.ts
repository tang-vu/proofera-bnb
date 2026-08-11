import type { RequestHandler } from "express";

const INTERNAL_DISPATCH_HEADER = "x-proofera-envelope-dispatched";
const MAX_ENVELOPE_INPUT_BYTES = 256 * 1_024;
const MAX_ENVELOPE_OUTPUT_BYTES = 1_024 * 1_024;
const ENVELOPE_DISPATCH_TIMEOUT_MILLISECONDS = 25_000;

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "last-event-id",
  "mcp-protocol-version",
  "mcp-session-id"
]);

const RETURNED_RESPONSE_HEADERS = new Set([
  "allow",
  "cache-control",
  "content-type",
  "mcp-protocol-version",
  "mcp-session-id",
  "retry-after",
  "x-content-type-options"
]);

interface StudioEnvelopeRequest {
  readonly v: unknown;
  readonly method: unknown;
  readonly path: unknown;
  readonly query?: unknown;
  readonly headers?: unknown;
  readonly body?: unknown;
}

interface StudioEnvelopeResponse {
  readonly v: 1;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

class EnvelopeOutputTooLargeError extends Error {}

/**
 * Adapt Agent Studio's bounded HTTP envelope to the local A2A/MCP listener.
 * This is transport only: it has no payment, seller, wallet, or signing path.
 */
export function createStudioEnvelopeMiddleware(port: number): RequestHandler {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("Studio envelope port must be between 1 and 65535");
  }
  return (request, response, next) => {
    if (request.get(INTERNAL_DISPATCH_HEADER) === "1" || !isEnvelopeCandidate(request.body)) {
      next();
      return;
    }
    const listenerPort = validPort(request.socket.localPort) ? request.socket.localPort : port;
    void dispatchEnvelope(request.body, listenerPort)
      .then((result) => {
        response.status(200).json(result);
      })
      .catch((error: unknown) => {
        response
          .status(200)
          .json(
            error instanceof EnvelopeOutputTooLargeError
              ? errorEnvelope(413, "envelope response exceeds one MiB")
              : errorEnvelope(500, "envelope dispatch failed")
          );
      });
  };
}

function validPort(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 1 && value <= 65_535;
}

async function dispatchEnvelope(
  candidate: StudioEnvelopeRequest,
  port: number
): Promise<StudioEnvelopeResponse> {
  if (candidate.v !== 1) return errorEnvelope(505, "unsupported envelope version");
  if (typeof candidate.method !== "string" || typeof candidate.path !== "string") {
    return errorEnvelope(400, "invalid envelope request");
  }
  const method = candidate.method.toUpperCase();
  const target = safeTarget(candidate.path, candidate.query, port);
  if (target === null || !routeAllows(target.pathname, method)) {
    return errorEnvelope(400, "invalid envelope target");
  }
  const body = decodeBody(candidate.body);
  const headers = requestHeaders(candidate.headers);
  if (body === null || headers === null) {
    return errorEnvelope(400, "invalid envelope request fields");
  }

  headers.set(INTERNAL_DISPATCH_HEADER, "1");
  const innerResponse = await fetch(target, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : body.toString("utf8"),
    redirect: "manual",
    signal: AbortSignal.timeout(ENVELOPE_DISPATCH_TIMEOUT_MILLISECONDS)
  });
  const responseBody = await readBoundedBody(innerResponse);
  const responseHeaders: Record<string, string> = {};
  for (const [name, value] of innerResponse.headers) {
    if (RETURNED_RESPONSE_HEADERS.has(name.toLowerCase()))
      responseHeaders[name.toLowerCase()] = value;
  }
  return {
    v: 1,
    status: innerResponse.status,
    headers: responseHeaders,
    body: responseBody.toString("base64")
  };
}

function isEnvelopeCandidate(value: unknown): value is StudioEnvelopeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "v" in value &&
    "method" in value &&
    "path" in value
  );
}

function safeTarget(path: string, query: unknown, port: number): URL | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.length > 256) {
    return null;
  }
  const origin = `http://127.0.0.1:${String(port)}`;
  let target: URL;
  try {
    target = new URL(path, origin);
  } catch {
    return null;
  }
  if (target.origin !== origin || target.search !== "" || target.hash !== "") return null;
  if (query === undefined) return target;
  if (typeof query !== "object" || query === null || Array.isArray(query)) return null;
  const entries = Object.entries(query);
  if (entries.length > 32) return null;
  for (const [name, value] of entries) {
    if (
      name.length === 0 ||
      name.length > 128 ||
      typeof value !== "string" ||
      value.length > 1_024
    ) {
      return null;
    }
    target.searchParams.append(name, value);
  }
  return target;
}

function routeAllows(path: string, method: string): boolean {
  if (path === "/") return method === "POST";
  if (path === "/mcp") return method === "GET" || method === "POST" || method === "DELETE";
  if (path === "/ping" || path === "/.well-known/agent-card.json") {
    return method === "GET" || method === "HEAD";
  }
  return false;
}

function decodeBody(value: unknown): Buffer | null {
  if (value === undefined || value === "") return Buffer.alloc(0);
  if (
    typeof value !== "string" ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    return null;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.byteLength <= MAX_ENVELOPE_INPUT_BYTES ? decoded : null;
}

function requestHeaders(value: unknown): Headers | null {
  const headers = new Headers();
  if (value === undefined) return headers;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 32) return null;
  for (const [name, headerValue] of entries) {
    const lower = name.toLowerCase();
    if (
      name.length === 0 ||
      name.length > 128 ||
      typeof headerValue !== "string" ||
      headerValue.length > 8_192
    ) {
      return null;
    }
    if (FORWARDED_REQUEST_HEADERS.has(lower)) headers.set(lower, headerValue);
  }
  return headers;
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  const advertisedLength = response.headers.get("content-length");
  if (advertisedLength !== null && /^[0-9]+$/.test(advertisedLength)) {
    const length = Number(advertisedLength);
    if (!Number.isSafeInteger(length) || length > MAX_ENVELOPE_OUTPUT_BYTES) {
      throw new EnvelopeOutputTooLargeError();
    }
  }
  if (response.body === null) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  let item = await reader.read();
  while (!item.done) {
    total += item.value.byteLength;
    if (total > MAX_ENVELOPE_OUTPUT_BYTES) {
      await reader.cancel();
      throw new EnvelopeOutputTooLargeError();
    }
    chunks.push(Buffer.from(item.value));
    item = await reader.read();
  }
  return Buffer.concat(chunks, total);
}

function errorEnvelope(status: number, message: string): StudioEnvelopeResponse {
  return {
    v: 1,
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: Buffer.from(JSON.stringify({ error: message, executionEnabled: false })).toString(
      "base64"
    )
  };
}
