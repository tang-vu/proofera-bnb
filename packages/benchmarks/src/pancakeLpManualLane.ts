import { z } from "zod";

import { canonicalJson, isCanonicalJsonText, sha256Bytes } from "./canonical.js";
import {
  PANCAKE_LP_INPUT_DIGEST_ID,
  PANCAKE_LP_SOURCE_RPC_ENDPOINT,
  PANCAKE_LP_SOURCE_RPC_PROVIDER,
  PancakeLpInputBundleSchema,
  decodeSlot0Tick,
  type PancakeLpInputBundle
} from "./pancakeLpAgentLane.js";
import {
  runTermixTimedMethod,
  type TermixFixedExecutorContext,
  type TermixMethodExecution,
  type TermixRunnerClock,
  type TermixTimedRunCapture
} from "./runner.js";
import { Sha256Schema } from "./schemas.js";

export const PANCAKE_LP_MANUAL_PROCEDURE_VERSION =
  "proofera-termix-pancake-lp-manual-v1.1.0" as const;

const MAXIMUM_EVENTS = 100;
const MAXIMUM_API_BODY_BYTES = 2_000_000;

const activeStartEventSchema = z.strictObject({
  event: z.literal("active_start"),
  segmentId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  description: z.string().trim().min(1).max(500)
});
const activeEndEventSchema = z.strictObject({
  event: z.literal("active_end"),
  segmentId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9._-]*$/)
});
const apiExchangeEventSchema = z.strictObject({
  event: z.literal("api_exchange"),
  exchangeId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  endpointUrl: z.literal(PANCAKE_LP_SOURCE_RPC_ENDPOINT),
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

export const PancakeLpManualEventSchema = z.discriminatedUnion("event", [
  activeStartEventSchema,
  activeEndEventSchema,
  apiExchangeEventSchema,
  outputEventSchema
]);

export type PancakeLpManualEvent = z.input<typeof PancakeLpManualEventSchema>;

export interface RunPancakeLpManualTermixMethodOptions {
  readonly request: unknown;
  readonly inputBundleCanonicalJson: string;
  readonly inputBundleSha256: string;
  readonly events: AsyncIterable<unknown>;
  readonly clock: TermixRunnerClock;
}

interface OpenSegment {
  readonly segmentId: string;
  readonly description: string;
  readonly startedAtNanoseconds: string;
}

export async function runPancakeLpManualTermixMethod(
  options: RunPancakeLpManualTermixMethodOptions
): Promise<TermixTimedRunCapture> {
  const inputBundleSha256 = Sha256Schema.parse(options.inputBundleSha256);
  if (sha256Bytes(options.inputBundleCanonicalJson) !== inputBundleSha256) {
    throw new Error("TERMIX_PANCAKE_LP_MANUAL_INPUT_DIGEST_MISMATCH");
  }
  if (!isCanonicalJsonText(options.inputBundleCanonicalJson)) {
    throw new Error("TERMIX_PANCAKE_LP_MANUAL_INPUT_NOT_CANONICAL");
  }
  const bundle = PancakeLpInputBundleSchema.parse(
    JSON.parse(options.inputBundleCanonicalJson) as unknown
  );
  return runTermixTimedMethod({
    request: options.request,
    clock: options.clock,
    execute: (context) =>
      consumeManualEvents(context, inputBundleSha256, bundle, options.events, options.clock)
  });
}

async function consumeManualEvents(
  context: TermixFixedExecutorContext,
  inputBundleSha256: string,
  bundle: PancakeLpInputBundle,
  events: AsyncIterable<unknown>,
  clock: TermixRunnerClock
): Promise<TermixMethodExecution> {
  validateManualBindings(context, inputBundleSha256);
  const activeSegments: TermixMethodExecution["activeSegments"] = [];
  const apiResponses: TermixMethodExecution["apiResponses"] = [];
  let openSegment: OpenSegment | null = null;
  let outputBody: string | null = null;
  let eventCount = 0;

  for await (const rawEvent of events) {
    eventCount += 1;
    if (eventCount > MAXIMUM_EVENTS) throw new Error("TERMIX_PANCAKE_LP_MANUAL_EVENT_LIMIT");
    if (outputBody !== null) throw new Error("TERMIX_PANCAKE_LP_MANUAL_EVENT_AFTER_OUTPUT");
    const event = PancakeLpManualEventSchema.parse(rawEvent);
    if (event.event === "active_start") {
      if (openSegment !== null) throw new Error("TERMIX_PANCAKE_LP_MANUAL_SEGMENT_NESTED");
      openSegment = {
        segmentId: event.segmentId,
        description: event.description,
        startedAtNanoseconds: validMonotonic(clock).toString()
      };
    } else if (event.event === "active_end") {
      if (openSegment === null || openSegment.segmentId !== event.segmentId) {
        throw new Error("TERMIX_PANCAKE_LP_MANUAL_SEGMENT_MISMATCH");
      }
      const endedAtNanoseconds = validMonotonic(clock);
      if (endedAtNanoseconds <= BigInt(openSegment.startedAtNanoseconds)) {
        throw new Error("TERMIX_PANCAKE_LP_MANUAL_CLOCK_REVERSED");
      }
      activeSegments.push({ ...openSegment, endedAtNanoseconds: endedAtNanoseconds.toString() });
      openSegment = null;
    } else if (event.event === "api_exchange") {
      if (openSegment === null) throw new Error("TERMIX_PANCAKE_LP_MANUAL_API_OUTSIDE_ACTIVE");
      if (apiResponses.length !== 0) throw new Error("TERMIX_PANCAKE_LP_MANUAL_API_DUPLICATE");
      validateRpcExchange(event, bundle);
      apiResponses.push({
        receiptId: event.exchangeId,
        provider: PANCAKE_LP_SOURCE_RPC_PROVIDER,
        endpointUrl: event.endpointUrl,
        requestId: event.exchangeId,
        observedAtUtc: validUtc(clock.utcNow()),
        responseBody: canonicalJson({
          requestBody: event.requestBody,
          responseBody: event.responseBody
        })
      });
    } else {
      validateManualOutput(event.outputBody, context, inputBundleSha256);
      outputBody = event.outputBody;
    }
  }

  if (openSegment !== null) throw new Error("TERMIX_PANCAKE_LP_MANUAL_SEGMENT_UNCLOSED");
  if (activeSegments.length === 0) throw new Error("TERMIX_PANCAKE_LP_MANUAL_ACTIVE_MISSING");
  if (apiResponses.length !== 1) throw new Error("TERMIX_PANCAKE_LP_MANUAL_API_MISSING");
  if (outputBody === null) throw new Error("TERMIX_PANCAKE_LP_MANUAL_OUTPUT_MISSING");
  return {
    outputBody,
    outputMediaType: "application/json",
    apiResponses,
    activeSegments,
    limitations: [
      "The runner timestamps operator-supplied work and exact RPC bytes but cannot cryptographically prove operator identity.",
      "The no-agent declaration requires independent tool-log review and is not self-authenticating.",
      "The public third-party position establishes no ownership, authority, performance or execution receipt.",
      "The manual output is retained unedited for scoring and is not presumed correct."
    ]
  };
}

function validateManualBindings(
  context: TermixFixedExecutorContext,
  inputBundleSha256: string
): void {
  if (context.runnerId !== "pancake-lp-manual-v1" || context.method.kind !== "manual") {
    throw new Error("TERMIX_PANCAKE_LP_MANUAL_LANE_INVALID");
  }
  if (context.method.procedureVersion !== PANCAKE_LP_MANUAL_PROCEDURE_VERSION) {
    throw new Error("TERMIX_PANCAKE_LP_MANUAL_PROCEDURE_MISMATCH");
  }
  const tools = context.method.tools
    .map(({ name, version }) => `${name}:${version}`)
    .sort()
    .join(",");
  if (
    tools !==
    "human-reviewed-canonical-json-worksheet:1.0.0,onfinality-bsc-mainnet-archive-json-rpc:eth-json-rpc"
  ) {
    throw new Error("TERMIX_PANCAKE_LP_MANUAL_TOOLS_MISMATCH");
  }
  const input = context.declaration.inputs.find(
    ({ inputId }) => inputId === PANCAKE_LP_INPUT_DIGEST_ID
  );
  if (input?.value.encoding !== "string" || input.value.value !== inputBundleSha256) {
    throw new Error("TERMIX_PANCAKE_LP_MANUAL_DECLARATION_INPUT_MISMATCH");
  }
}

function validateRpcExchange(
  event: z.output<typeof apiExchangeEventSchema>,
  bundle: PancakeLpInputBundle
): void {
  let request: unknown;
  let response: unknown;
  try {
    request = JSON.parse(event.requestBody) as unknown;
    response = JSON.parse(event.responseBody) as unknown;
  } catch {
    throw new Error("TERMIX_PANCAKE_LP_MANUAL_RPC_JSON_INVALID");
  }
  const parsedRequest = z
    .strictObject({
      id: z.string().min(1).max(100),
      jsonrpc: z.literal("2.0"),
      method: z.literal("eth_call"),
      params: z.tuple([
        z.strictObject({
          data: z.literal("0x3850c7bd"),
          to: z.string().regex(/^0x[0-9a-fA-F]{40}$/u)
        }),
        z.strictObject({
          blockHash: z.string().regex(/^0x[0-9a-f]{64}$/u),
          requireCanonical: z.literal(true)
        })
      ])
    })
    .parse(request);
  const parsedResponse = z
    .strictObject({
      id: z.string().min(1).max(100),
      jsonrpc: z.literal("2.0"),
      result: z.string().regex(/^0x(?:[0-9a-f]{64})+$/u)
    })
    .parse(response);
  const source = bundle.sourceEvidence;
  if (
    parsedRequest.id !== event.exchangeId ||
    parsedResponse.id !== event.exchangeId ||
    parsedRequest.params[0].to.toLowerCase() !== source.poolAddress.toLowerCase() ||
    parsedRequest.params[1].blockHash !== source.blockHash ||
    decodeSlot0Tick(parsedResponse.result) !== source.expectedCurrentTick
  ) {
    throw new Error("TERMIX_PANCAKE_LP_MANUAL_RPC_BINDING_MISMATCH");
  }
}

function validateManualOutput(
  outputBody: string,
  context: TermixFixedExecutorContext,
  inputBundleSha256: string
): void {
  const output = z
    .strictObject({
      schemaVersion: z.literal("proofera-termix-pancake-lp-manual-output-v1.0.0"),
      manualProcedureVersion: z.literal(PANCAKE_LP_MANUAL_PROCEDURE_VERSION),
      operatorRole: z.string().trim().min(1).max(200),
      inputBundleSha256: Sha256Schema,
      agentInvoked: z.literal(false),
      result: z.record(z.string(), z.unknown()),
      limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50)
    })
    .parse(JSON.parse(outputBody) as unknown);
  if (
    context.method.kind !== "manual" ||
    output.operatorRole !== context.method.operatorRole ||
    output.inputBundleSha256 !== inputBundleSha256
  ) {
    throw new Error("TERMIX_PANCAKE_LP_MANUAL_OUTPUT_BINDING_MISMATCH");
  }
}

function validMonotonic(clock: TermixRunnerClock): bigint {
  const value = clock.monotonicNowNanoseconds();
  if (value < 0n) throw new Error("TERMIX_PANCAKE_LP_MANUAL_MONOTONIC_INVALID");
  return value;
}

function validUtc(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("TERMIX_PANCAKE_LP_MANUAL_UTC_INVALID");
  return value.toISOString();
}
