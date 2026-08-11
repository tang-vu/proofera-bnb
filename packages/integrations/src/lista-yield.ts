import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";

export const LISTA_PRODUCTION_API_ORIGIN = "https://api.lista.org";
export const LISTA_VAULT_LIST_PATH = "/api/moolah/vault/list";
export const LISTA_MAX_RESPONSE_BYTES = 1_000_000;

const LISTA_SUCCESS_CODE = "000000000";
const MAX_BODY_CHUNKS = 4_096;

/**
 * Primary sources checked 2026-08-11:
 * https://docs.bsc.lista.org/for-developer/services/lending-api
 * https://docs.bsc.lista.org/for-developer/services/lending-api/vault
 * https://github.com/lista-dao/lending-sdk
 * https://raw.githubusercontent.com/lista-dao/lending-sdk/refs/heads/main/packages/moolah-lending-sdk/src/MoolahSDK.ts
 * https://raw.githubusercontent.com/lista-dao/lending-sdk/refs/heads/main/packages/moolah-sdk-core/src/api/client.ts
 * https://raw.githubusercontent.com/lista-dao/lending-sdk/refs/heads/main/packages/moolah-sdk-core/src/types/api.ts
 * https://raw.githubusercontent.com/lista-dao/lending-sdk/refs/heads/main/packages/moolah-sdk-core/src/utils/apiChain.ts
 *
 * The docs specify the vault-list path and conceptual yield/liquidity fields but
 * do not publish an absolute host or envelope. The current official SDK supplies
 * the production host, exact query construction, success envelope, and concrete
 * ApiVaultItem shape used here. Its chain map enables BSC 56 and leaves BSC
 * testnet commented out, so this adapter deliberately rejects chain 97.
 */

const exactNonNegativeDecimalSchema = z
  .string()
  .max(96)
  .regex(
    /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,60})?$/,
    "Expected a bounded, non-negative, non-exponential decimal string"
  )
  .refine(
    (value) => (value.split(".", 1)[0]?.length ?? Number.POSITIVE_INFINITY) <= 78,
    "Decimal integer part is too large"
  );

const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Invalid EVM address")
  .transform((value) => getAddress(value.toLowerCase()) as Address)
  .refine(
    (value) => value !== "0x0000000000000000000000000000000000000000",
    "The zero address is not allowed"
  );

const boundedNameSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value.trim() === value, "Leading or trailing whitespace is not allowed");
const boundedSymbolSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[\p{L}\p{N}._+\-/ ]+$/u, "Invalid asset symbol");
const boundedLocatorSchema = z.string().max(2_048);
const boundedMessageSchema = z.string().max(1_000);

const emissionDetailValueSchema = z.strictObject({
  apy: exactNonNegativeDecimalSchema,
  icon: boundedLocatorSchema,
  total: exactNonNegativeDecimalSchema
});

const emissionDetailSchema = z
  .record(z.string().min(1).max(100), emissionDetailValueSchema)
  .superRefine((value, context) => {
    if (Object.keys(value).length > 32) {
      context.addIssue({ code: "custom", message: "Too many emission detail entries" });
    }
  });

const collateralSchema = z.strictObject({
  name: boundedNameSchema,
  icon: boundedLocatorSchema,
  id: addressSchema
});

const listaApiVaultItemSchema = z
  .strictObject({
    address: addressSchema,
    name: boundedNameSchema,
    icon: boundedLocatorSchema,
    deposits: exactNonNegativeDecimalSchema,
    depositsUsd: exactNonNegativeDecimalSchema,
    asset: addressSchema,
    assetSymbol: boundedSymbolSchema,
    assetIcon: boundedLocatorSchema.optional(),
    displayDecimal: z.number().int().min(0).max(255),
    curator: z.string().max(200),
    curatorIcon: boundedLocatorSchema,
    apy: exactNonNegativeDecimalSchema,
    emissionApy: exactNonNegativeDecimalSchema.optional(),
    emissionDetail: emissionDetailSchema,
    emissionEnabled: z.union([z.literal(0), z.literal(1)]),
    collaterals: z.array(collateralSchema).max(64),
    zone: z.number().int().min(0).max(65_535),
    utilization: exactNonNegativeDecimalSchema,
    chain: z.literal("bsc"),
    fee: exactNonNegativeDecimalSchema.optional()
  })
  .superRefine((item, context) => {
    if (item.address === item.asset) {
      context.addIssue({
        code: "custom",
        path: ["asset"],
        message: "Vault and underlying asset addresses must be distinct"
      });
    }
    const collateralIds = new Set(item.collaterals.map((collateral) => collateral.id));
    if (collateralIds.size !== item.collaterals.length) {
      context.addIssue({
        code: "custom",
        path: ["collaterals"],
        message: "Collateral addresses must be unique within a vault"
      });
    }
  });

const listaVaultListDataSchema = z.strictObject({
  total: z.number().int().min(0).max(10_000_000),
  list: z.array(listaApiVaultItemSchema).max(25)
});

const sourceTimestampSchema = z.number().int().safe().nonnegative().optional();

const listaEnvelopeBaseSchema = z.strictObject({
  code: z.string().min(1).max(64),
  msg: boundedMessageSchema,
  data: z.unknown(),
  timestamp: sourceTimestampSchema
});

const listaSuccessEnvelopeSchema = z.strictObject({
  code: z.literal(LISTA_SUCCESS_CODE),
  msg: boundedMessageSchema,
  data: listaVaultListDataSchema,
  timestamp: sourceTimestampSchema
});

export const listaYieldSourceRequestSchema = z.strictObject({
  chainId: z.literal(56),
  apiBaseUrl: z.literal(LISTA_PRODUCTION_API_ORIGIN),
  pageSize: z.number().int().min(1).max(25),
  timeoutMs: z.number().int().min(10).max(10_000)
});

export type ListaYieldSourceRequest = z.input<typeof listaYieldSourceRequestSchema>;
type ValidatedListaYieldSourceRequest = z.output<typeof listaYieldSourceRequestSchema>;

export interface ListaRateLimitMetadata {
  readonly limit: string | null;
  readonly remaining: string | null;
  readonly reset: string | null;
  readonly retryAfter: string | null;
}

export interface ListaYieldSource {
  readonly vaultAddress: Address;
  readonly chainId: 56;
  readonly environment: "bsc-mainnet";
  readonly name: string;
  readonly asset: {
    readonly address: Address;
    readonly symbol: string;
    readonly displayDecimals: number;
  };
  readonly curator: string;
  readonly reportedYield: {
    readonly apy: string;
    readonly emissionApy: string | null;
    readonly emissionEnabled: boolean;
    readonly scale: "source-reported-undocumented-scale";
    readonly netApy: null;
    readonly netApyState: "unknown";
  };
  readonly reportedLiquidity: {
    readonly deposits: string;
    readonly depositsUsd: string;
    readonly utilization: string;
    readonly withdrawableAssets: null;
    readonly units: "source-reported-human-readable-decimals";
  };
  readonly reportedFee: {
    readonly value: string | null;
    readonly interpretation: null;
  };
  readonly rewards: readonly {
    readonly name: string;
    readonly apy: string;
    readonly total: string;
  }[];
  readonly collateralMarkets: readonly {
    readonly id: Address;
    readonly name: string;
  }[];
  readonly withdrawalConstraints: {
    readonly state: "unknown";
    readonly lockup: null;
    readonly cooldown: null;
    readonly minimum: null;
    readonly maximum: null;
    readonly fee: null;
    readonly reason: "vault_list_endpoint_does_not_supply_withdrawal_constraints";
  };
  readonly realizedPerformance: null;
  readonly riskAssessment: null;
}

export interface ListaYieldProvenance {
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly sourceTimestamp: {
    readonly raw: string | null;
    readonly unit: "undocumented" | "absent";
    readonly utc: null;
  };
  readonly httpDateUtc: string | null;
  readonly httpStatus: 200;
  readonly rateLimit: ListaRateLimitMetadata;
  readonly endpoint: "Lista Moolah vault list";
  readonly officialDocumentationUrl: string;
  readonly officialSdkClientUrl: string;
  readonly methodologyVersion: "lista-moolah-vault-list-v1";
  readonly methodologyBoundary: {
    readonly reportedValuesOnly: true;
    readonly apyScale: "undocumented";
    readonly netApy: "not_computed";
    readonly withdrawableLiquidity: "not_computed";
    readonly withdrawalConstraints: "not_evaluated";
    readonly realizedPerformance: "not_evaluated";
    readonly risk: "not_evaluated";
  };
  readonly dataFreshness: "unknown_no_item_timestamp";
  readonly executionEnabled: false;
}

export interface ListaYieldAvailableResult {
  readonly status: "available";
  readonly sources: readonly ListaYieldSource[];
  readonly total: string;
  readonly page: 1;
  readonly pageSize: number;
  readonly provenance: ListaYieldProvenance;
}

export interface ListaYieldEmptyResult {
  readonly status: "empty";
  readonly sources: readonly [];
  readonly total: "0";
  readonly page: 1;
  readonly pageSize: number;
  readonly reason: "source_returned_no_vaults";
  readonly provenance: ListaYieldProvenance;
}

export type ListaYieldStage = "request" | "fetch" | "response" | "body" | "schema";

export type ListaYieldUnavailableReason =
  | "invalid_request"
  | "invalid_clock"
  | "aborted"
  | "timeout"
  | "network_error"
  | "source_url_mismatch"
  | "rate_limited"
  | "upstream_unavailable"
  | "http_error"
  | "invalid_response_metadata"
  | "oversized_response"
  | "empty_body"
  | "invalid_json"
  | "schema_drift"
  | "upstream_error_code"
  | "relation_mismatch";

export interface ListaYieldUnavailableResult {
  readonly status: "unavailable";
  readonly reason: ListaYieldUnavailableReason;
  readonly stage: ListaYieldStage;
  readonly message: string;
  readonly retryable: boolean;
  readonly sourceUrl: string | null;
  readonly observedAt: string | null;
  readonly httpStatus: number | null;
  readonly rateLimit: ListaRateLimitMetadata;
  readonly upstreamCode: string | null;
  readonly executionEnabled: false;
}

export type ListaYieldSourceResult =
  ListaYieldAvailableResult | ListaYieldEmptyResult | ListaYieldUnavailableResult;

export interface ListaYieldRequestOptions {
  readonly signal?: AbortSignal;
}

export interface ListaYieldSourceReader {
  getYieldSources(
    input: ListaYieldSourceRequest,
    requestOptions?: ListaYieldRequestOptions
  ): Promise<ListaYieldSourceResult>;
}

export interface CreateListaYieldSourceReaderOptions {
  /** Inject a server-side fetch implementation; no browser/global fallback is used. */
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => Date;
}

interface BodySuccess {
  readonly kind: "success";
  readonly value: unknown;
}

interface BodyFailure {
  readonly kind: "failure";
  readonly reason:
    "invalid_response_metadata" | "oversized_response" | "empty_body" | "invalid_json";
  readonly message: string;
}

type BodyResult = BodySuccess | BodyFailure;

const EMPTY_RATE_LIMIT: ListaRateLimitMetadata = Object.freeze({
  limit: null,
  remaining: null,
  reset: null,
  retryAfter: null
});

function createVaultListUrl(request: ValidatedListaYieldSourceRequest): URL {
  const url = new URL(LISTA_VAULT_LIST_PATH, request.apiBaseUrl);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", request.pageSize.toString(10));
  url.searchParams.set("chain", "bsc");
  url.searchParams.set("sort", "apy");
  url.searchParams.set("order", "desc");
  return url;
}

function unavailable(
  reason: ListaYieldUnavailableReason,
  stage: ListaYieldStage,
  message: string,
  retryable: boolean,
  context: {
    readonly sourceUrl: string | null;
    readonly observedAt: string | null;
    readonly httpStatus?: number | null;
    readonly rateLimit?: ListaRateLimitMetadata;
    readonly upstreamCode?: string | null;
  }
): ListaYieldUnavailableResult {
  return {
    status: "unavailable",
    reason,
    stage,
    message,
    retryable,
    sourceUrl: context.sourceUrl,
    observedAt: context.observedAt,
    httpStatus: context.httpStatus ?? null,
    rateLimit: context.rateLimit ?? EMPTY_RATE_LIMIT,
    upstreamCode: context.upstreamCode ?? null,
    executionEnabled: false
  };
}

function boundedHeader(headers: Headers, names: readonly string[]): string | null | undefined {
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) {
      if (value.length === 0 || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
        return undefined;
      }
      return value;
    }
  }
  return null;
}

function readRateLimit(
  headers: Headers
): { readonly success: true; readonly data: ListaRateLimitMetadata } | { readonly success: false } {
  const limit = boundedHeader(headers, ["ratelimit-limit", "x-ratelimit-limit"]);
  const remaining = boundedHeader(headers, ["ratelimit-remaining", "x-ratelimit-remaining"]);
  const reset = boundedHeader(headers, ["ratelimit-reset", "x-ratelimit-reset"]);
  const retryAfter = boundedHeader(headers, ["retry-after"]);
  if (
    limit === undefined ||
    remaining === undefined ||
    reset === undefined ||
    retryAfter === undefined
  ) {
    return { success: false };
  }

  for (const value of [limit, remaining]) {
    if (value !== null && !/^(0|[1-9][0-9]{0,31})$/.test(value)) {
      return { success: false };
    }
  }
  if (
    reset !== null &&
    !/^(?:0|[1-9][0-9]{0,31})$/.test(reset) &&
    Number.isNaN(Date.parse(reset))
  ) {
    return { success: false };
  }
  if (
    retryAfter !== null &&
    !/^(?:0|[1-9][0-9]{0,31})$/.test(retryAfter) &&
    Number.isNaN(Date.parse(retryAfter))
  ) {
    return { success: false };
  }
  if (limit !== null && remaining !== null && BigInt(remaining) > BigInt(limit)) {
    return { success: false };
  }

  return {
    success: true,
    data: { limit, remaining, reset, retryAfter }
  };
}

function httpDateUtc(headers: Headers): string | null {
  const raw = headers.get("date");
  if (raw === null || raw.length > 128) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function isJsonContentType(headers: Headers): boolean {
  const contentType = headers.get("content-type");
  if (contentType === null || contentType.length > 200) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/json" || /^application\/[a-z0-9.+-]+\+json$/.test(mediaType ?? "")
  );
}

async function readBoundedJsonBody(response: Response): Promise<BodyResult> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^(0|[1-9][0-9]{0,15})$/.test(declaredLength)) {
      await response.body?.cancel();
      return {
        kind: "failure",
        reason: "invalid_response_metadata",
        message: "Lista returned an invalid Content-Length header."
      };
    }
    if (BigInt(declaredLength) > BigInt(LISTA_MAX_RESPONSE_BYTES)) {
      await response.body?.cancel();
      return {
        kind: "failure",
        reason: "oversized_response",
        message: `Lista response exceeded the ${LISTA_MAX_RESPONSE_BYTES}-byte safety limit.`
      };
    }
  }

  if (response.body === null) {
    return {
      kind: "failure",
      reason: "empty_body",
      message: "Lista returned no response body."
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let receivedBytes = 0;
  let chunks = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    chunks += 1;
    receivedBytes += chunk.value.byteLength;
    if (receivedBytes > LISTA_MAX_RESPONSE_BYTES || chunks > MAX_BODY_CHUNKS) {
      await reader.cancel();
      return {
        kind: "failure",
        reason: "oversized_response",
        message: `Lista response exceeded the ${LISTA_MAX_RESPONSE_BYTES}-byte safety limit.`
      };
    }
    try {
      body += decoder.decode(chunk.value, { stream: true });
    } catch {
      await reader.cancel();
      return {
        kind: "failure",
        reason: "invalid_json",
        message: "Lista returned a response that is not valid UTF-8 JSON."
      };
    }
  }
  try {
    body += decoder.decode();
  } catch {
    return {
      kind: "failure",
      reason: "invalid_json",
      message: "Lista returned a response that is not valid UTF-8 JSON."
    };
  }

  if (body.length === 0) {
    return {
      kind: "failure",
      reason: "empty_body",
      message: "Lista returned an empty response body."
    };
  }

  try {
    return { kind: "success", value: JSON.parse(body) as unknown };
  } catch {
    return {
      kind: "failure",
      reason: "invalid_json",
      message: "Lista returned malformed JSON."
    };
  }
}

function toYieldSource(item: z.output<typeof listaApiVaultItemSchema>): ListaYieldSource {
  return {
    vaultAddress: item.address,
    chainId: 56,
    environment: "bsc-mainnet",
    name: item.name,
    asset: {
      address: item.asset,
      symbol: item.assetSymbol,
      displayDecimals: item.displayDecimal
    },
    curator: item.curator,
    reportedYield: {
      apy: item.apy,
      emissionApy: item.emissionApy ?? null,
      emissionEnabled: item.emissionEnabled === 1,
      scale: "source-reported-undocumented-scale",
      netApy: null,
      netApyState: "unknown"
    },
    reportedLiquidity: {
      deposits: item.deposits,
      depositsUsd: item.depositsUsd,
      utilization: item.utilization,
      withdrawableAssets: null,
      units: "source-reported-human-readable-decimals"
    },
    reportedFee: {
      value: item.fee ?? null,
      interpretation: null
    },
    rewards: Object.entries(item.emissionDetail)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([name, detail]) => ({ name, apy: detail.apy, total: detail.total })),
    collateralMarkets: item.collaterals.map((collateral) => ({
      id: collateral.id,
      name: collateral.name
    })),
    withdrawalConstraints: {
      state: "unknown",
      lockup: null,
      cooldown: null,
      minimum: null,
      maximum: null,
      fee: null,
      reason: "vault_list_endpoint_does_not_supply_withdrawal_constraints"
    },
    realizedPerformance: null,
    riskAssessment: null
  };
}

function createProvenance(
  sourceUrl: string,
  observedAt: string,
  timestamp: number | undefined,
  headers: Headers,
  rateLimit: ListaRateLimitMetadata
): ListaYieldProvenance {
  return {
    sourceUrl,
    observedAt,
    sourceTimestamp: {
      raw: timestamp === undefined ? null : timestamp.toString(10),
      unit: timestamp === undefined ? "absent" : "undocumented",
      utc: null
    },
    httpDateUtc: httpDateUtc(headers),
    httpStatus: 200,
    rateLimit,
    endpoint: "Lista Moolah vault list",
    officialDocumentationUrl: "https://docs.bsc.lista.org/for-developer/services/lending-api/vault",
    officialSdkClientUrl:
      "https://raw.githubusercontent.com/lista-dao/lending-sdk/refs/heads/main/packages/moolah-sdk-core/src/api/client.ts",
    methodologyVersion: "lista-moolah-vault-list-v1",
    methodologyBoundary: {
      reportedValuesOnly: true,
      apyScale: "undocumented",
      netApy: "not_computed",
      withdrawableLiquidity: "not_computed",
      withdrawalConstraints: "not_evaluated",
      realizedPerformance: "not_evaluated",
      risk: "not_evaluated"
    },
    dataFreshness: "unknown_no_item_timestamp",
    executionEnabled: false
  };
}

export function createListaYieldSourceReader(
  options: CreateListaYieldSourceReaderOptions
): ListaYieldSourceReader {
  return {
    async getYieldSources(
      input: ListaYieldSourceRequest,
      requestOptions: ListaYieldRequestOptions = {}
    ): Promise<ListaYieldSourceResult> {
      let observedAt: string;
      try {
        const observedDate = options.now();
        if (!(observedDate instanceof Date) || !Number.isFinite(observedDate.getTime())) {
          throw new TypeError("invalid clock");
        }
        observedAt = observedDate.toISOString();
      } catch {
        return unavailable("invalid_clock", "request", "The observation clock is invalid.", false, {
          sourceUrl: null,
          observedAt: null
        });
      }

      const parsedRequest = listaYieldSourceRequestSchema.safeParse(input);
      if (!parsedRequest.success) {
        return unavailable(
          "invalid_request",
          "request",
          "The Lista yield-source request failed runtime validation.",
          false,
          { sourceUrl: null, observedAt }
        );
      }

      const request = parsedRequest.data;
      const url = createVaultListUrl(request);
      const sourceUrl = url.toString();
      const controller = new AbortController();
      let didTimeout = false;
      let stage: ListaYieldStage = "fetch";

      const handleExternalAbort = () => controller.abort(requestOptions.signal?.reason);
      if (requestOptions.signal?.aborted === true) {
        handleExternalAbort();
      } else {
        requestOptions.signal?.addEventListener("abort", handleExternalAbort, { once: true });
      }

      const timeout = setTimeout(() => {
        didTimeout = true;
        controller.abort(new DOMException("Lista request timed out", "TimeoutError"));
      }, request.timeoutMs);

      try {
        if (controller.signal.aborted) {
          throw new DOMException("The request was aborted.", "AbortError");
        }
        const response = await options.fetch(url, {
          method: "GET",
          headers: new Headers({ Accept: "application/json" }),
          signal: controller.signal,
          redirect: "error",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          cache: "no-store"
        });

        stage = "response";
        if (response.redirected || response.url !== sourceUrl) {
          await response.body?.cancel();
          return unavailable(
            "source_url_mismatch",
            "response",
            "Lista responded from a URL other than the exact official vault-list request.",
            false,
            { sourceUrl, observedAt, httpStatus: response.status }
          );
        }

        const rateLimitResult = readRateLimit(response.headers);
        if (!rateLimitResult.success) {
          await response.body?.cancel();
          return unavailable(
            "invalid_response_metadata",
            "response",
            "Lista returned malformed or unbounded rate-limit metadata.",
            false,
            { sourceUrl, observedAt, httpStatus: response.status }
          );
        }
        const rateLimit = rateLimitResult.data;

        if (response.status === 429) {
          await response.body?.cancel();
          return unavailable(
            "rate_limited",
            "response",
            "Lista rate-limited the vault-list request.",
            true,
            { sourceUrl, observedAt, httpStatus: 429, rateLimit }
          );
        }
        if (response.status >= 500 && response.status <= 599) {
          await response.body?.cancel();
          return unavailable(
            "upstream_unavailable",
            "response",
            `Lista returned HTTP ${response.status}.`,
            true,
            { sourceUrl, observedAt, httpStatus: response.status, rateLimit }
          );
        }
        if (response.status !== 200 || !response.ok) {
          await response.body?.cancel();
          return unavailable(
            "http_error",
            "response",
            `Lista returned HTTP ${response.status}.`,
            false,
            { sourceUrl, observedAt, httpStatus: response.status, rateLimit }
          );
        }
        if (!isJsonContentType(response.headers)) {
          await response.body?.cancel();
          return unavailable(
            "invalid_response_metadata",
            "response",
            "Lista returned HTTP 200 without a JSON content type.",
            false,
            { sourceUrl, observedAt, httpStatus: 200, rateLimit }
          );
        }

        stage = "body";
        const body = await readBoundedJsonBody(response);
        if (body.kind === "failure") {
          return unavailable(body.reason, "body", body.message, false, {
            sourceUrl,
            observedAt,
            httpStatus: 200,
            rateLimit
          });
        }

        stage = "schema";
        const baseEnvelope = listaEnvelopeBaseSchema.safeParse(body.value);
        if (!baseEnvelope.success) {
          return unavailable(
            "schema_drift",
            "schema",
            "Lista returned a payload outside the bounded official SDK envelope.",
            false,
            { sourceUrl, observedAt, httpStatus: 200, rateLimit }
          );
        }
        if (baseEnvelope.data.code !== LISTA_SUCCESS_CODE) {
          return unavailable(
            "upstream_error_code",
            "schema",
            "Lista returned a non-success API code.",
            false,
            {
              sourceUrl,
              observedAt,
              httpStatus: 200,
              rateLimit,
              upstreamCode: baseEnvelope.data.code
            }
          );
        }

        const envelope = listaSuccessEnvelopeSchema.safeParse(body.value);
        if (!envelope.success) {
          return unavailable(
            "schema_drift",
            "schema",
            "Lista's success payload does not match the bounded official SDK vault-list shape.",
            false,
            { sourceUrl, observedAt, httpStatus: 200, rateLimit }
          );
        }
        const { data, timestamp } = envelope.data;
        const addresses = new Set(data.list.map((item) => item.address));
        if (
          data.list.length > request.pageSize ||
          data.total < data.list.length ||
          addresses.size !== data.list.length ||
          (data.list.length === 0 && data.total !== 0)
        ) {
          return unavailable(
            "relation_mismatch",
            "schema",
            "Lista's vault-list pagination or address relations are inconsistent.",
            false,
            { sourceUrl, observedAt, httpStatus: 200, rateLimit }
          );
        }

        const provenance = createProvenance(
          sourceUrl,
          observedAt,
          timestamp,
          response.headers,
          rateLimit
        );
        if (data.list.length === 0) {
          return {
            status: "empty",
            sources: [],
            total: "0",
            page: 1,
            pageSize: request.pageSize,
            reason: "source_returned_no_vaults",
            provenance
          };
        }

        return {
          status: "available",
          sources: data.list.map(toYieldSource),
          total: data.total.toString(10),
          page: 1,
          pageSize: request.pageSize,
          provenance
        };
      } catch {
        const externalAbort = requestOptions.signal?.aborted === true;
        const reason: ListaYieldUnavailableReason = didTimeout
          ? "timeout"
          : externalAbort
            ? "aborted"
            : "network_error";
        return unavailable(
          reason,
          stage,
          reason === "timeout"
            ? `Lista did not respond within ${request.timeoutMs} ms.`
            : reason === "aborted"
              ? "The Lista request was aborted by the caller."
              : `The Lista request failed during the ${stage} stage.`,
          reason !== "aborted",
          { sourceUrl, observedAt }
        );
      } finally {
        clearTimeout(timeout);
        requestOptions.signal?.removeEventListener("abort", handleExternalAbort);
      }
    }
  };
}
