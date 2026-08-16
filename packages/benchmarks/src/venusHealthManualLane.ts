import { z } from "zod";

import { canonicalJson, isCanonicalJsonText } from "./canonical.js";
import {
  runTermixTimedMethod,
  type TermixFixedExecutorContext,
  type TermixMethodExecution,
  type TermixRunnerClock,
  type TermixTimedRunCapture
} from "./runner.js";
import { BenchmarkIdSchema, Sha256Schema } from "./schemas.js";

export const VENUS_HEALTH_MANUAL_PROCEDURE_VERSION =
  "proofera-venus-health-manual-worksheet-v1.0.0" as const;

const REQUEST_DIGEST_INPUT_ID = "health-factor-request-sha256";
const MAXIMUM_EVENTS = 200;
const MAXIMUM_API_BODY_BYTES = 1_000_000;
const RPC_ENDPOINTS = Object.freeze({
  "https://bsc-testnet-rpc.publicnode.com": "PublicNode BSC Testnet JSON-RPC",
  "https://bsc-testnet-dataseed.bnbchain.org": "BNB Chain Testnet DataSeed JSON-RPC"
});
const READ_ONLY_RPC_METHODS = new Set([
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_call"
]);

const activeStartEventSchema = z.strictObject({
  event: z.literal("active_start"),
  segmentId: BenchmarkIdSchema,
  description: z.string().trim().min(1).max(500)
});
const activeEndEventSchema = z.strictObject({
  event: z.literal("active_end"),
  segmentId: BenchmarkIdSchema
});
const apiExchangeEventSchema = z.strictObject({
  event: z.literal("api_exchange"),
  exchangeId: BenchmarkIdSchema,
  endpointUrl: z.enum(
    Object.keys(RPC_ENDPOINTS) as [keyof typeof RPC_ENDPOINTS, ...(keyof typeof RPC_ENDPOINTS)[]]
  ),
  requestBody: z.string().min(1).max(MAXIMUM_API_BODY_BYTES),
  responseBody: z.string().min(1).max(MAXIMUM_API_BODY_BYTES)
});
const outputEventSchema = z.strictObject({
  event: z.literal("output"),
  outputBody: z
    .string()
    .min(1)
    .max(2_000_000)
    .refine(isCanonicalJsonText, "Expected canonical JSON manual output")
});

export const VenusHealthManualEventSchema = z.discriminatedUnion("event", [
  activeStartEventSchema,
  activeEndEventSchema,
  apiExchangeEventSchema,
  outputEventSchema
]);

export type VenusHealthManualEvent = z.input<typeof VenusHealthManualEventSchema>;

export interface RunVenusHealthManualTermixMethodOptions {
  readonly request: unknown;
  readonly requestInputSha256: string;
  readonly events: AsyncIterable<unknown>;
  readonly clock: TermixRunnerClock;
}

interface OpenSegment {
  readonly segmentId: string;
  readonly description: string;
  readonly startedAtNanoseconds: string;
}

export async function runVenusHealthManualTermixMethod(
  options: RunVenusHealthManualTermixMethodOptions
): Promise<TermixTimedRunCapture> {
  const requestInputSha256 = Sha256Schema.parse(options.requestInputSha256);
  return runTermixTimedMethod({
    request: options.request,
    clock: options.clock,
    execute: (context) =>
      consumeManualEvents(context, requestInputSha256, options.events, options.clock)
  });
}

async function consumeManualEvents(
  context: TermixFixedExecutorContext,
  requestInputSha256: string,
  events: AsyncIterable<unknown>,
  clock: TermixRunnerClock
): Promise<TermixMethodExecution> {
  validateManualBindings(context, requestInputSha256);
  const activeSegments: Array<{
    segmentId: string;
    description: string;
    startedAtNanoseconds: string;
    endedAtNanoseconds: string;
  }> = [];
  const apiResponses: TermixMethodExecution["apiResponses"] = [];
  const exchangeIds = new Set<string>();
  let openSegment: OpenSegment | null = null;
  let outputBody: string | null = null;
  let eventCount = 0;

  for await (const rawEvent of events) {
    eventCount += 1;
    if (eventCount > MAXIMUM_EVENTS) throw new Error("TERMIX_VENUS_MANUAL_EVENT_LIMIT");
    if (outputBody !== null) throw new Error("TERMIX_VENUS_MANUAL_EVENT_AFTER_OUTPUT");
    const event = VenusHealthManualEventSchema.parse(rawEvent);
    if (event.event === "active_start") {
      if (openSegment !== null) throw new Error("TERMIX_VENUS_MANUAL_SEGMENT_NESTED");
      openSegment = {
        segmentId: event.segmentId,
        description: event.description,
        startedAtNanoseconds: validMonotonic(clock).toString()
      };
    } else if (event.event === "active_end") {
      if (openSegment === null || openSegment.segmentId !== event.segmentId) {
        throw new Error("TERMIX_VENUS_MANUAL_SEGMENT_MISMATCH");
      }
      const endedAtNanoseconds = validMonotonic(clock);
      if (endedAtNanoseconds <= BigInt(openSegment.startedAtNanoseconds)) {
        throw new Error("TERMIX_VENUS_MANUAL_CLOCK_REVERSED");
      }
      activeSegments.push({
        ...openSegment,
        endedAtNanoseconds: endedAtNanoseconds.toString()
      });
      openSegment = null;
    } else if (event.event === "api_exchange") {
      if (openSegment === null) throw new Error("TERMIX_VENUS_MANUAL_API_OUTSIDE_ACTIVE_WORK");
      if (exchangeIds.has(event.exchangeId)) {
        throw new Error("TERMIX_VENUS_MANUAL_EXCHANGE_DUPLICATE");
      }
      exchangeIds.add(event.exchangeId);
      validateRpcExchange(event.requestBody, event.responseBody, event.exchangeId);
      apiResponses.push({
        receiptId: event.exchangeId,
        provider: RPC_ENDPOINTS[event.endpointUrl],
        endpointUrl: event.endpointUrl,
        requestId: event.exchangeId,
        observedAtUtc: validUtc(clock.utcNow()),
        responseBody: canonicalJson({
          requestBody: event.requestBody,
          responseBody: event.responseBody
        })
      });
    } else {
      validateManualOutput(event.outputBody, context, requestInputSha256);
      outputBody = event.outputBody;
    }
  }

  if (openSegment !== null) throw new Error("TERMIX_VENUS_MANUAL_SEGMENT_UNCLOSED");
  if (activeSegments.length === 0) throw new Error("TERMIX_VENUS_MANUAL_ACTIVE_TIME_MISSING");
  if (apiResponses.length === 0) throw new Error("TERMIX_VENUS_MANUAL_API_EXCHANGE_MISSING");
  if (outputBody === null) throw new Error("TERMIX_VENUS_MANUAL_OUTPUT_MISSING");
  return {
    outputBody,
    outputMediaType: "application/json",
    apiResponses,
    activeSegments,
    limitations: [
      "The runner timestamps operator-supplied read-only RPC exchanges but does not itself prove who performed the manual procedure.",
      "The declared no-agent boundary requires independent tool-log review; this lane cannot cryptographically prove that no external assistant was used.",
      "The manual output is retained unedited for scoring and is not treated as correct merely because it is canonical JSON."
    ]
  };
}

function validateManualBindings(
  context: TermixFixedExecutorContext,
  requestInputSha256: string
): void {
  if (context.runnerId !== "venus-health-manual-v1" || context.method.kind !== "manual") {
    throw new Error("TERMIX_VENUS_MANUAL_LANE_INVALID");
  }
  if (context.method.procedureVersion !== VENUS_HEALTH_MANUAL_PROCEDURE_VERSION) {
    throw new Error("TERMIX_VENUS_MANUAL_PROCEDURE_MISMATCH");
  }
  const toolSet = context.method.tools
    .map(({ name, version }) => `${name}:${version}`)
    .sort()
    .join(",");
  if (
    toolSet !==
    "human-reviewed-canonical-json-worksheet:1.0.0,official-bsc-testnet-json-rpc:eth-json-rpc"
  ) {
    throw new Error("TERMIX_VENUS_MANUAL_TOOLS_MISMATCH");
  }
  const requestBinding = context.declaration.inputs.find(
    ({ inputId }) => inputId === REQUEST_DIGEST_INPUT_ID
  );
  if (
    requestBinding?.value.encoding !== "string" ||
    requestBinding.value.value !== requestInputSha256
  ) {
    throw new Error("TERMIX_VENUS_MANUAL_REQUEST_BINDING_MISMATCH");
  }
}

function validateManualOutput(
  outputBody: string,
  context: TermixFixedExecutorContext,
  requestInputSha256: string
): void {
  const output = z
    .strictObject({
      schemaVersion: z.literal("proofera-termix-venus-health-manual-output-v1.0.0"),
      manualProcedureVersion: z.literal(VENUS_HEALTH_MANUAL_PROCEDURE_VERSION),
      operatorRole: z.string().trim().min(1).max(200),
      requestInputSha256: Sha256Schema,
      agentInvoked: z.literal(false),
      result: z.record(z.string(), z.unknown()),
      limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50)
    })
    .parse(JSON.parse(outputBody) as unknown);
  if (
    context.method.kind !== "manual" ||
    output.operatorRole !== context.method.operatorRole ||
    output.requestInputSha256 !== requestInputSha256
  ) {
    throw new Error("TERMIX_VENUS_MANUAL_OUTPUT_BINDING_MISMATCH");
  }
}

function validateRpcExchange(requestBody: string, responseBody: string, exchangeId: string): void {
  if (
    Buffer.byteLength(requestBody) > MAXIMUM_API_BODY_BYTES ||
    Buffer.byteLength(responseBody) > MAXIMUM_API_BODY_BYTES
  ) {
    throw new Error("TERMIX_VENUS_MANUAL_API_BODY_TOO_LARGE");
  }
  let request: unknown;
  let response: unknown;
  try {
    request = JSON.parse(requestBody) as unknown;
    response = JSON.parse(responseBody) as unknown;
  } catch {
    throw new Error("TERMIX_VENUS_MANUAL_RPC_JSON_INVALID");
  }
  const parsedRequest = z
    .strictObject({
      jsonrpc: z.literal("2.0"),
      id: z.string().min(1).max(500),
      method: z.string().min(1).max(100),
      params: z.array(z.unknown()).max(20)
    })
    .parse(request);
  if (parsedRequest.id !== exchangeId || !READ_ONLY_RPC_METHODS.has(parsedRequest.method)) {
    throw new Error("TERMIX_VENUS_MANUAL_RPC_REQUEST_INVALID");
  }
  const parsedResponse = z
    .looseObject({
      jsonrpc: z.literal("2.0"),
      id: z.string().min(1).max(500)
    })
    .parse(response);
  if (
    parsedResponse.id !== exchangeId ||
    typeof response !== "object" ||
    response === null ||
    Array.isArray(response) ||
    "result" in response === "error" in response
  ) {
    throw new Error("TERMIX_VENUS_MANUAL_RPC_RESPONSE_INVALID");
  }
}

function validMonotonic(clock: TermixRunnerClock): bigint {
  const value = clock.monotonicNowNanoseconds();
  if (value < 0n) throw new Error("TERMIX_VENUS_MANUAL_MONOTONIC_INVALID");
  return value;
}

function validUtc(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("TERMIX_VENUS_MANUAL_UTC_INVALID");
  return value.toISOString();
}
