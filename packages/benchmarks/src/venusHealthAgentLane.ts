import { z } from "zod";

import { canonicalJson, isCanonicalJsonText, sha256Bytes, sha256Canonical } from "./canonical.js";
import {
  runTermixTimedMethod,
  type TermixFixedExecutorContext,
  type TermixMethodExecution,
  type TermixRunnerClock,
  type TermixTimedRunCapture
} from "./runner.js";
import { Sha256Schema } from "./schemas.js";

export const VENUS_HEALTH_AGENT_LANE_VERSION =
  "proofera-termix-venus-health-agent-lane-v1.0.0" as const;
export const VENUS_HEALTH_AGENT_ENDPOINT = "https://proofera-health.tangvu.dev/" as const;

const MAX_REQUEST_BYTES = 256 * 1_024;
const MAX_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const REQUEST_DIGEST_INPUT_ID = "health-factor-request-sha256";
const ENDPOINT_PARAMETER_KEY = "health-agent-endpoint";
const AGENT_COMPONENT_NAME = "proofera-health-factor-guardian";

const canonicalRequestSchema = z
  .string()
  .min(1)
  .max(MAX_REQUEST_BYTES)
  .refine(isCanonicalJsonText, "Expected canonical Health Guardian request JSON");

const laneOptionsSchema = z.strictObject({
  requestInputCanonicalJson: canonicalRequestSchema,
  requestInputSha256: Sha256Schema
});

const responseEnvelopeSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: z.string(),
  result: z.looseObject({
    kind: z.literal("message"),
    role: z.literal("agent"),
    messageId: z.string().trim().min(1).max(500),
    parts: z
      .array(
        z.looseObject({
          kind: z.literal("data"),
          data: z.record(z.string(), z.unknown())
        })
      )
      .length(1)
  })
});

export interface VenusHealthAgentLaneHttpResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type VenusHealthAgentLaneFetch = (
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly redirect: "error";
    readonly signal: AbortSignal;
  }
) => Promise<VenusHealthAgentLaneHttpResponse>;

export interface RunVenusHealthAgentTermixMethodOptions {
  readonly request: unknown;
  readonly requestInputCanonicalJson: string;
  readonly requestInputSha256: string;
  readonly clock: TermixRunnerClock;
  readonly fetch?: VenusHealthAgentLaneFetch;
}

const LANE_CONFIGURATION = Object.freeze({
  protocolVersion: VENUS_HEALTH_AGENT_LANE_VERSION,
  endpointUrl: VENUS_HEALTH_AGENT_ENDPOINT,
  transport: "A2A JSON-RPC message/send",
  skill: "analyze_venus_health_factor",
  requestDigestInputId: REQUEST_DIGEST_INPUT_ID,
  maximumRequestBytes: MAX_REQUEST_BYTES,
  maximumResponseBytes: MAX_RESPONSE_BYTES,
  requestTimeoutMilliseconds: REQUEST_TIMEOUT_MILLISECONDS,
  redirects: "rejected"
});

export const VENUS_HEALTH_AGENT_LANE_CONFIGURATION_SHA256 = sha256Canonical(LANE_CONFIGURATION);

/**
 * Runs the one fixed public Health Guardian lane. The outer timed runner
 * validates registration and the independently verified hire receipt before
 * this executor can issue an HTTP request.
 */
export async function runVenusHealthAgentTermixMethod(
  options: RunVenusHealthAgentTermixMethodOptions
): Promise<TermixTimedRunCapture> {
  const lane = laneOptionsSchema.parse({
    requestInputCanonicalJson: options.requestInputCanonicalJson,
    requestInputSha256: options.requestInputSha256
  });
  if (sha256Bytes(lane.requestInputCanonicalJson) !== lane.requestInputSha256) {
    throw new Error("TERMIX_VENUS_REQUEST_DIGEST_MISMATCH");
  }
  const parsedRequest = parseHealthRequest(lane.requestInputCanonicalJson);
  const fetchRequest = options.fetch ?? defaultFetch;
  return runTermixTimedMethod({
    request: options.request,
    clock: options.clock,
    execute: (context) =>
      executeVenusHealthAgentLane(
        context,
        lane.requestInputCanonicalJson,
        lane.requestInputSha256,
        parsedRequest,
        options.clock,
        fetchRequest
      )
  });
}

function parseHealthRequest(canonicalRequest: string): Record<string, unknown> {
  const parsed = z.record(z.string(), z.unknown()).parse(JSON.parse(canonicalRequest) as unknown);
  if (parsed.skill !== "analyze_venus_health_factor") {
    throw new Error("TERMIX_VENUS_REQUEST_SKILL_INVALID");
  }
  return parsed;
}

async function executeVenusHealthAgentLane(
  context: TermixFixedExecutorContext,
  requestInputCanonicalJson: string,
  requestInputSha256: string,
  parsedRequest: Record<string, unknown>,
  clock: TermixRunnerClock,
  fetchRequest: VenusHealthAgentLaneFetch
): Promise<TermixMethodExecution> {
  validateLaneBindings(context, requestInputSha256);
  const requestId = `${context.runId}-health-a2a`;
  const messageId = `${context.runId}-health-request`;
  const body = canonicalJson({
    id: requestId,
    jsonrpc: "2.0",
    method: "message/send",
    params: {
      message: {
        kind: "message",
        messageId,
        parts: [{ data: parsedRequest, kind: "data" }],
        role: "user"
      }
    }
  });
  if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
    throw new Error("TERMIX_VENUS_A2A_REQUEST_TOO_LARGE");
  }

  const segmentStart = clock.monotonicNowNanoseconds();
  const response = await fetchRequest(VENUS_HEALTH_AGENT_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS)
  });
  if (response.status !== 200) throw new Error("TERMIX_VENUS_A2A_HTTP_STATUS_INVALID");
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new Error("TERMIX_VENUS_A2A_CONTENT_TYPE_INVALID");
  }
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(declaredLength) || BigInt(declaredLength) > MAX_RESPONSE_BYTES)
  ) {
    throw new Error("TERMIX_VENUS_A2A_RESPONSE_TOO_LARGE");
  }
  const responseBody = await response.text();
  const segmentEnd = clock.monotonicNowNanoseconds();
  const observedAtUtc = validUtc(clock.utcNow());
  if (segmentEnd < segmentStart) throw new Error("TERMIX_VENUS_LANE_CLOCK_REVERSED");
  if (Buffer.byteLength(responseBody) > MAX_RESPONSE_BYTES) {
    throw new Error("TERMIX_VENUS_A2A_RESPONSE_TOO_LARGE");
  }

  let rawEnvelope: unknown;
  try {
    rawEnvelope = JSON.parse(responseBody) as unknown;
  } catch {
    throw new Error("TERMIX_VENUS_A2A_RESPONSE_JSON_INVALID");
  }
  const envelope = responseEnvelopeSchema.parse(rawEnvelope);
  if (envelope.id !== requestId) throw new Error("TERMIX_VENUS_A2A_RESPONSE_ID_MISMATCH");
  const data = envelope.result.parts[0]?.data;
  if (data === undefined) throw new Error("TERMIX_VENUS_A2A_DATA_MISSING");
  if (data.error !== undefined) throw new Error("TERMIX_VENUS_A2A_AGENT_ERROR");
  for (const field of [
    "sourceContentsVerified",
    "freshnessAttestedByAgent",
    "marketplaceEligible",
    "activationEligible",
    "executionEnabled"
  ] as const) {
    if (data[field] !== false) throw new Error("TERMIX_VENUS_A2A_SAFETY_BOUNDARY_INVALID");
  }
  const outputBody = canonicalJson(data);
  if (Buffer.byteLength(outputBody) > MAX_RESPONSE_BYTES) {
    throw new Error("TERMIX_VENUS_A2A_OUTPUT_TOO_LARGE");
  }
  const idSuffix = sha256Bytes(context.runId).slice(0, 20);
  return {
    outputBody,
    outputMediaType: "application/json",
    apiResponses: [
      {
        receiptId: `health-a2a-${idSuffix}`,
        provider: "ProofEra Health-Factor Guardian A2A",
        endpointUrl: VENUS_HEALTH_AGENT_ENDPOINT,
        requestId,
        observedAtUtc,
        responseBody
      }
    ],
    activeSegments: [
      {
        segmentId: `health-call-${idSuffix}`,
        description: "Public Health Guardian A2A request and response",
        startedAtNanoseconds: segmentStart.toString(),
        endedAtNanoseconds: segmentEnd.toString()
      }
    ],
    limitations: [
      "The A2A receipt proves only the captured public response; it does not independently re-fetch or authenticate the frozen Venus RPC artifacts.",
      "The read-only agent output cannot authorize, sign, submit, or prove an intervention transaction."
    ]
  };
}

function validateLaneBindings(
  context: TermixFixedExecutorContext,
  requestInputSha256: string
): void {
  if (context.runnerId !== "venus-health-agent-v1" || context.method.kind !== "agent") {
    throw new Error("TERMIX_VENUS_AGENT_LANE_INVALID");
  }
  if (context.method.configurationSha256 !== VENUS_HEALTH_AGENT_LANE_CONFIGURATION_SHA256) {
    throw new Error("TERMIX_VENUS_CONFIGURATION_DIGEST_MISMATCH");
  }
  const requestBinding = context.declaration.inputs.find(
    ({ inputId }) => inputId === REQUEST_DIGEST_INPUT_ID
  );
  if (
    requestBinding?.value.encoding !== "string" ||
    requestBinding.value.value !== requestInputSha256
  ) {
    throw new Error("TERMIX_VENUS_DECLARATION_REQUEST_BINDING_MISMATCH");
  }
  const endpoint = context.declaration.environment.parameters.find(
    ({ key }) => key === ENDPOINT_PARAMETER_KEY
  );
  if (
    endpoint?.value.encoding !== "string" ||
    endpoint.value.value !== VENUS_HEALTH_AGENT_ENDPOINT
  ) {
    throw new Error("TERMIX_VENUS_DECLARATION_ENDPOINT_MISMATCH");
  }
  const component = context.declaration.environment.components.find(
    ({ name }) => name === AGENT_COMPONENT_NAME
  );
  if (component?.configurationSha256 !== VENUS_HEALTH_AGENT_LANE_CONFIGURATION_SHA256) {
    throw new Error("TERMIX_VENUS_DECLARATION_CONFIGURATION_MISMATCH");
  }
  if (Buffer.byteLength(requestInputSha256) !== 64) {
    throw new Error("TERMIX_VENUS_REQUEST_DIGEST_INVALID");
  }
}

function validUtc(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("TERMIX_VENUS_OBSERVED_UTC_INVALID");
  return value.toISOString();
}

const defaultFetch: VenusHealthAgentLaneFetch = (url, init) => fetch(url, init);
