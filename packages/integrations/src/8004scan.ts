import { z } from "zod";

const DEFAULT_BASE_URL = "https://8004scan.io/api/v1/public";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_UINT256 = (1n << 256n) - 1n;

const uint256DecimalStringSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9]\d*)$/)
  .refine((value) => {
    try {
      return BigInt(value) <= MAX_UINT256;
    } catch {
      return false;
    }
  }, "Token ID exceeds uint256");

const tokenIdSchema = z
  .union([uint256DecimalStringSchema, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)])
  .transform((tokenId) => String(tokenId));

/**
 * The documented agent fields are validated while undocumented fields remain
 * available to callers. Registry metadata is untrusted and must be sanitized
 * before it is rendered or used as an execution target.
 */
export const scan8004AgentSchema = z.looseObject({
  id: z.string().max(200).nullable().optional(),
  agent_id: z.string().max(200).nullable().optional(),
  token_id: tokenIdSchema,
  chain_id: z.number().int().positive(),
  name: z.string().max(200).nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  image_url: z.string().max(2_048).nullable().optional(),
  owner_address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .nullable()
    .optional(),
  supported_protocols: z.array(z.string().trim().min(1).max(100)).max(64).nullable().optional(),
  total_score: z.number().finite().nullable().optional(),
  star_count: z.number().int().nonnegative().nullable().optional(),
  total_feedbacks: z.number().int().nonnegative().nullable().optional(),
  created_at: z.iso.datetime({ offset: true }).nullable().optional()
});

const scan8004PaginationSchema = z.looseObject({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean()
});

export const scan8004ResponseMetaSchema = z.looseObject({
  version: z.string().min(1).max(100),
  timestamp: z.iso.datetime({ offset: true }),
  requestId: z.string().min(1).max(500),
  pagination: scan8004PaginationSchema.optional()
});

const scan8004AgentListEnvelopeSchema = z.looseObject({
  success: z.literal(true),
  data: z.array(scan8004AgentSchema),
  meta: scan8004ResponseMetaSchema
});

const scan8004AgentEnvelopeSchema = z.looseObject({
  success: z.literal(true),
  data: scan8004AgentSchema,
  meta: scan8004ResponseMetaSchema
});

const scan8004ErrorEnvelopeSchema = z.looseObject({
  success: z.literal(false),
  error: z.looseObject({
    code: z.string().min(1),
    message: z.string().min(1).max(2_000),
    details: z.unknown().optional()
  }),
  meta: scan8004ResponseMetaSchema
});

const scan8004ListAgentsQuerySchema = z.strictObject({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  chainId: z.number().int().positive().optional(),
  ownerAddress: z.string().min(1).optional(),
  search: z.string().optional(),
  protocol: z.enum(["MCP", "A2A", "OASF", "Web", "Email"]).optional(),
  sortBy: z.enum(["created_at", "stars", "name", "token_id", "total_score"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  isTestnet: z.boolean().optional()
});

const scan8004GetAgentParamsSchema = z
  .strictObject({
    chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    tokenId: tokenIdSchema
  })
  .transform(({ chainId, tokenId }) => ({ chainId, tokenId }));

export type Scan8004Agent = z.infer<typeof scan8004AgentSchema>;
export type Scan8004ResponseMeta = z.infer<typeof scan8004ResponseMetaSchema>;
export type Scan8004ListAgentsQuery = z.input<typeof scan8004ListAgentsQuerySchema>;
export type Scan8004GetAgentParams = z.input<typeof scan8004GetAgentParamsSchema>;

export interface Scan8004RateLimit {
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly resetAt: string | null;
  readonly retryAfter: string | null;
}

interface Scan8004ResultContext {
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly httpStatus: number | null;
  readonly rateLimit: Scan8004RateLimit;
  /** The exact parsed upstream payload, or response text when it was not JSON. */
  readonly raw: unknown;
}

export interface Scan8004AvailableResult extends Scan8004ResultContext {
  readonly status: "available";
  readonly httpStatus: number;
  readonly agents: readonly Scan8004Agent[];
  readonly meta: Scan8004ResponseMeta;
}

export interface Scan8004AgentAvailableResult extends Scan8004ResultContext {
  readonly status: "available";
  readonly httpStatus: number;
  readonly agent: Scan8004Agent;
  readonly meta: Scan8004ResponseMeta;
}

export type Scan8004UnavailableReason =
  "http_error" | "upstream_error" | "timeout" | "aborted" | "network_error" | "incompatible_schema";

export interface Scan8004UnavailableResult extends Scan8004ResultContext {
  readonly status: "unavailable";
  readonly reason: Scan8004UnavailableReason;
  readonly message: string;
  readonly retryable: boolean;
  readonly upstreamError: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  } | null;
}

export interface Scan8004AgentNotFoundResult extends Scan8004ResultContext {
  readonly status: "not_found";
  readonly httpStatus: 404;
  readonly message: string;
  readonly meta: Scan8004ResponseMeta;
  readonly upstreamError: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export type Scan8004ListAgentsResult = Scan8004AvailableResult | Scan8004UnavailableResult;
export type Scan8004GetAgentResult =
  Scan8004AgentAvailableResult | Scan8004AgentNotFoundResult | Scan8004UnavailableResult;

export interface Scan8004RequestOptions {
  readonly signal?: AbortSignal;
}

export interface Scan8004Client {
  listAgents(
    query?: Scan8004ListAgentsQuery,
    requestOptions?: Scan8004RequestOptions
  ): Promise<Scan8004ListAgentsResult>;
  getAgent(
    params: Scan8004GetAgentParams,
    requestOptions?: Scan8004RequestOptions
  ): Promise<Scan8004GetAgentResult>;
}

export interface Create8004ScanClientOptions {
  /** Keep API keys in server-only configuration. They are sent only as a header. */
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
}

interface ReadBodyResult {
  readonly raw: unknown;
  readonly isJson: boolean;
  readonly exceededLimit: boolean;
}

interface Scan8004HttpResponse extends Scan8004ResultContext {
  readonly kind: "response";
  readonly httpStatus: number;
  readonly ok: boolean;
  readonly isJson: boolean;
  readonly exceededLimit: boolean;
}

interface Scan8004TransportFailure {
  readonly kind: "failure";
  readonly result: Scan8004UnavailableResult;
}

type Scan8004RequestResult = Scan8004HttpResponse | Scan8004TransportFailure;

function parseRateLimitInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function readRateLimit(headers: Headers): Scan8004RateLimit {
  return {
    limit: parseRateLimitInteger(headers.get("x-ratelimit-limit")),
    remaining: parseRateLimitInteger(headers.get("x-ratelimit-remaining")),
    resetAt: headers.get("x-ratelimit-reset"),
    retryAfter: headers.get("retry-after")
  };
}

function emptyRateLimit(): Scan8004RateLimit {
  return { limit: null, remaining: null, resetAt: null, retryAfter: null };
}

async function readResponseBody(response: Response): Promise<ReadBodyResult> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && /^\d+$/.test(declaredLength)) {
    const parsedLength = Number(declaredLength);
    if (Number.isSafeInteger(parsedLength) && parsedLength > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      return {
        raw: { truncated: true, maximumBytes: MAX_RESPONSE_BYTES },
        isJson: false,
        exceededLimit: true
      };
    }
  }

  if (response.body === null) {
    return { raw: null, isJson: false, exceededLimit: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let responseText = "";
  let receivedBytes = 0;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    receivedBytes += chunk.value.byteLength;
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return {
        raw: { truncated: true, maximumBytes: MAX_RESPONSE_BYTES },
        isJson: false,
        exceededLimit: true
      };
    }
    responseText += decoder.decode(chunk.value, { stream: true });
  }
  responseText += decoder.decode();

  if (responseText.length === 0) {
    return { raw: null, isJson: false, exceededLimit: false };
  }

  try {
    return { raw: JSON.parse(responseText) as unknown, isJson: true, exceededLimit: false };
  } catch {
    return { raw: responseText, isJson: false, exceededLimit: false };
  }
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function createAgentsUrl(baseUrl: URL, query: Scan8004ListAgentsQuery): URL {
  const url = new URL("agents", baseUrl);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function createAgentUrl(baseUrl: URL, params: z.output<typeof scan8004GetAgentParamsSchema>): URL {
  const chainId = encodeURIComponent(String(params.chainId));
  const tokenId = encodeURIComponent(params.tokenId);
  return new URL(`agents/${chainId}/${tokenId}`, baseUrl);
}

function normalizeBaseUrl(baseUrl: string): URL {
  const normalized = new URL(`${baseUrl.replace(/\/+$/, "")}/`);
  if (normalized.protocol !== "https:" && normalized.protocol !== "http:") {
    throw new TypeError("8004scan baseUrl must use HTTP or HTTPS");
  }

  return normalized;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "The 8004scan request failed before a response was received.";
}

function incompatibleResponse(
  response: Scan8004HttpResponse,
  message: string
): Scan8004UnavailableResult {
  return {
    status: "unavailable",
    reason: "incompatible_schema",
    message,
    retryable: false,
    upstreamError: null,
    sourceUrl: response.sourceUrl,
    observedAt: response.observedAt,
    httpStatus: response.httpStatus,
    rateLimit: response.rateLimit,
    raw: response.raw
  };
}

function unavailableHttpResponse(response: Scan8004HttpResponse): Scan8004UnavailableResult {
  const parsedError = response.isJson ? scan8004ErrorEnvelopeSchema.safeParse(response.raw) : null;

  return {
    status: "unavailable",
    reason: "http_error",
    message:
      parsedError?.success === true
        ? parsedError.data.error.message
        : `8004scan returned HTTP ${response.httpStatus}.`,
    retryable: isRetryableHttpStatus(response.httpStatus),
    upstreamError: parsedError?.success === true ? parsedError.data.error : null,
    sourceUrl: response.sourceUrl,
    observedAt: response.observedAt,
    httpStatus: response.httpStatus,
    rateLimit: response.rateLimit,
    raw: response.raw
  };
}

function unavailableSuccessError(response: Scan8004HttpResponse): Scan8004UnavailableResult | null {
  if (!response.isJson) return null;
  const parsedError = scan8004ErrorEnvelopeSchema.safeParse(response.raw);
  if (!parsedError.success) return null;

  return {
    status: "unavailable",
    reason: "upstream_error",
    message: parsedError.data.error.message,
    retryable: true,
    upstreamError: parsedError.data.error,
    sourceUrl: response.sourceUrl,
    observedAt: response.observedAt,
    httpStatus: response.httpStatus,
    rateLimit: response.rateLimit,
    raw: response.raw
  };
}

export function create8004ScanClient(options: Create8004ScanClientOptions = {}): Scan8004Client {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("8004scan timeoutMs must be a positive safe integer");
  }

  if (options.apiKey !== undefined && options.apiKey.trim().length === 0) {
    throw new TypeError("8004scan apiKey must not be blank");
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  const request = async (
    url: URL,
    requestOptions: Scan8004RequestOptions = {}
  ): Promise<Scan8004RequestResult> => {
    const controller = new AbortController();
    let didTimeout = false;

    const handleExternalAbort = () => {
      controller.abort(requestOptions.signal?.reason);
    };

    if (requestOptions.signal?.aborted === true) {
      handleExternalAbort();
    } else {
      requestOptions.signal?.addEventListener("abort", handleExternalAbort, { once: true });
    }

    const timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort(new DOMException("8004scan request timed out", "TimeoutError"));
    }, timeoutMs);

    const observedAt = () => now().toISOString();
    const headers = new Headers({ Accept: "application/json" });
    if (options.apiKey !== undefined) {
      headers.set("X-API-Key", options.apiKey.trim());
    }

    try {
      if (controller.signal.aborted) {
        throw new DOMException("The request was aborted.", "AbortError");
      }

      const response = await fetchImplementation(url, {
        method: "GET",
        headers,
        signal: controller.signal
      });
      const rateLimit = readRateLimit(response.headers);
      const body = await readResponseBody(response);

      return {
        kind: "response",
        ok: response.ok,
        isJson: body.isJson,
        exceededLimit: body.exceededLimit,
        sourceUrl: url.toString(),
        observedAt: observedAt(),
        httpStatus: response.status,
        rateLimit,
        raw: body.raw
      };
    } catch (error: unknown) {
      const externalAbort = requestOptions.signal?.aborted === true;
      const reason: Scan8004UnavailableReason = didTimeout
        ? "timeout"
        : externalAbort
          ? "aborted"
          : "network_error";

      return {
        kind: "failure",
        result: {
          status: "unavailable",
          reason,
          message: didTimeout
            ? `8004scan did not respond within ${timeoutMs} ms.`
            : externalAbort
              ? "The 8004scan request was aborted."
              : errorMessage(error),
          retryable: reason !== "aborted",
          upstreamError: null,
          sourceUrl: url.toString(),
          observedAt: observedAt(),
          httpStatus: null,
          rateLimit: emptyRateLimit(),
          raw: null
        }
      };
    } finally {
      clearTimeout(timeout);
      requestOptions.signal?.removeEventListener("abort", handleExternalAbort);
    }
  };

  const listAgents: Scan8004Client["listAgents"] = async (query = {}, requestOptions = {}) => {
    const validatedQuery = scan8004ListAgentsQuerySchema.parse(query);
    const response = await request(createAgentsUrl(baseUrl, validatedQuery), requestOptions);
    if (response.kind === "failure") return response.result;

    if (!response.ok) return unavailableHttpResponse(response);
    if (!response.isJson) {
      return incompatibleResponse(
        response,
        response.exceededLimit
          ? `8004scan response exceeded the ${MAX_RESPONSE_BYTES}-byte safety limit.`
          : "8004scan returned a successful response that was not valid JSON."
      );
    }

    const parsedList = scan8004AgentListEnvelopeSchema.safeParse(response.raw);
    if (parsedList.success) {
      return {
        status: "available",
        agents: parsedList.data.data,
        meta: parsedList.data.meta,
        sourceUrl: response.sourceUrl,
        observedAt: response.observedAt,
        httpStatus: response.httpStatus,
        rateLimit: response.rateLimit,
        raw: response.raw
      };
    }

    return (
      unavailableSuccessError(response) ??
      incompatibleResponse(
        response,
        "8004scan returned a response that does not match its public API envelope."
      )
    );
  };

  const getAgent: Scan8004Client["getAgent"] = async (params, requestOptions = {}) => {
    const validatedParams = scan8004GetAgentParamsSchema.parse(params);
    const response = await request(createAgentUrl(baseUrl, validatedParams), requestOptions);
    if (response.kind === "failure") return response.result;

    if (response.httpStatus === 404) {
      const parsedError = response.isJson
        ? scan8004ErrorEnvelopeSchema.safeParse(response.raw)
        : null;
      if (parsedError?.success === true) {
        return {
          status: "not_found",
          message: parsedError.data.error.message,
          meta: parsedError.data.meta,
          upstreamError: parsedError.data.error,
          sourceUrl: response.sourceUrl,
          observedAt: response.observedAt,
          httpStatus: 404,
          rateLimit: response.rateLimit,
          raw: response.raw
        };
      }

      return incompatibleResponse(
        response,
        "8004scan returned HTTP 404 without a valid error envelope."
      );
    }

    if (!response.ok) return unavailableHttpResponse(response);
    if (!response.isJson) {
      return incompatibleResponse(
        response,
        response.exceededLimit
          ? `8004scan response exceeded the ${MAX_RESPONSE_BYTES}-byte safety limit.`
          : "8004scan returned a successful response that was not valid JSON."
      );
    }

    const parsedAgent = scan8004AgentEnvelopeSchema.safeParse(response.raw);
    if (parsedAgent.success) {
      if (
        parsedAgent.data.data.chain_id !== validatedParams.chainId ||
        parsedAgent.data.data.token_id !== validatedParams.tokenId
      ) {
        return incompatibleResponse(
          response,
          "8004scan returned an agent that does not match the requested chain and token ID."
        );
      }

      return {
        status: "available",
        agent: parsedAgent.data.data,
        meta: parsedAgent.data.meta,
        sourceUrl: response.sourceUrl,
        observedAt: response.observedAt,
        httpStatus: response.httpStatus,
        rateLimit: response.rateLimit,
        raw: response.raw
      };
    }

    return (
      unavailableSuccessError(response) ??
      incompatibleResponse(
        response,
        "8004scan returned a response that does not match its agent-detail API envelope."
      )
    );
  };

  return {
    listAgents,
    getAgent
  };
}
