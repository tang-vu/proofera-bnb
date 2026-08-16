import { z } from "zod";

import { canonicalJson, isCanonicalJsonText, sha256Bytes, sha256Canonical } from "./canonical.js";
import {
  runTermixTimedMethod,
  type TermixFixedExecutorContext,
  type TermixMethodExecution,
  type TermixRunnerClock,
  type TermixTimedRunCapture
} from "./runner.js";
import { EvmAddressSchema, RepositoryPathSchema, Sha256Schema } from "./schemas.js";

export const PANCAKE_LP_AGENT_LANE_VERSION =
  "proofera-termix-pancake-lp-agent-lane-v1.0.0" as const;
export const PANCAKE_LP_AGENT_ENDPOINT = "https://proofera-lp.tangvu.dev/" as const;
export const PANCAKE_LP_SOURCE_RPC_ENDPOINT = "https://bsc-rpc.publicnode.com" as const;
export const PANCAKE_LP_INPUT_BUNDLE_SCHEMA_VERSION =
  "proofera-termix-pancake-lp-input-v1.0.0" as const;
export const PANCAKE_LP_INPUT_DIGEST_ID = "lp-range-input-bundle-sha256" as const;

const MAXIMUM_BODY_BYTES = 2_000_000;
const MAXIMUM_INPUT_BYTES = 256 * 1_024;
const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const UINT_STRING = /^(0|[1-9][0-9]*)$/u;
const HEX_32 = /^0x[0-9a-f]{64}$/u;
const ABI_WORDS = /^0x(?:[0-9a-f]{64})+$/u;

export const PancakeLpInputBundleSchema = z
  .strictObject({
    schemaVersion: z.literal(PANCAKE_LP_INPUT_BUNDLE_SCHEMA_VERSION),
    sourceEvidence: z.strictObject({
      repositoryPath: RepositoryPathSchema,
      sha256: Sha256Schema,
      chainId: z.literal(56),
      blockNumber: z.string().regex(UINT_STRING),
      blockHash: z.string().regex(HEX_32),
      rpcEndpointUrl: z.literal(PANCAKE_LP_SOURCE_RPC_ENDPOINT),
      poolAddress: EvmAddressSchema,
      positionManagerAddress: EvmAddressSchema,
      positionId: z.string().regex(UINT_STRING),
      expectedCurrentTick: z.number().int().min(-887_272).max(887_272)
    }),
    agentRequest: z.record(z.string(), z.unknown())
  })
  .superRefine((bundle, context) => {
    const request = bundle.agentRequest;
    const source = bundle.sourceEvidence;
    const checks: ReadonlyArray<readonly [unknown, unknown, string]> = [
      [request.skill, "analyze_lp_range", "skill"],
      [request.chainId, source.chainId, "chainId"],
      [normalizedAddress(request.poolAddress), source.poolAddress.toLowerCase(), "poolAddress"],
      [
        normalizedAddress(request.positionManagerAddress),
        source.positionManagerAddress.toLowerCase(),
        "positionManagerAddress"
      ],
      [request.positionId, source.positionId, "positionId"],
      [request.observedAtBlock, source.blockNumber, "observedAtBlock"],
      [request.currentTick, source.expectedCurrentTick, "currentTick"]
    ];
    for (const [actual, expected, field] of checks) {
      if (actual !== expected) {
        context.addIssue({
          code: "custom",
          path: ["agentRequest", field],
          message: `Agent request ${field} must match sourceEvidence`
        });
      }
    }
  });

export type PancakeLpInputBundle = z.output<typeof PancakeLpInputBundleSchema>;

const laneOptionsSchema = z.strictObject({
  inputBundleCanonicalJson: z
    .string()
    .min(1)
    .max(MAXIMUM_INPUT_BYTES)
    .refine(isCanonicalJsonText, "Expected canonical Pancake LP input bundle JSON"),
  inputBundleSha256: Sha256Schema
});

const rpcResponseSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: z.string().min(1).max(500),
  result: z.string().regex(ABI_WORDS)
});

const agentResponseSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: z.string().min(1).max(500),
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

export interface PancakeLpLaneHttpResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type PancakeLpLaneFetch = (
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly redirect: "error";
    readonly signal: AbortSignal;
  }
) => Promise<PancakeLpLaneHttpResponse>;

export interface RunPancakeLpAgentTermixMethodOptions {
  readonly request: unknown;
  readonly inputBundleCanonicalJson: string;
  readonly inputBundleSha256: string;
  readonly clock: TermixRunnerClock;
  readonly fetch?: PancakeLpLaneFetch;
}

const LANE_CONFIGURATION = Object.freeze({
  protocolVersion: PANCAKE_LP_AGENT_LANE_VERSION,
  endpointUrl: PANCAKE_LP_AGENT_ENDPOINT,
  sourceRpcUrl: PANCAKE_LP_SOURCE_RPC_ENDPOINT,
  transport: "A2A JSON-RPC message/send plus exact-hash JSON-RPC eth_call",
  skill: "analyze_lp_range",
  requestDigestInputId: PANCAKE_LP_INPUT_DIGEST_ID,
  maximumInputBytes: MAXIMUM_INPUT_BYTES,
  maximumResponseBytes: MAXIMUM_BODY_BYTES,
  requestTimeoutMilliseconds: REQUEST_TIMEOUT_MILLISECONDS,
  redirects: "rejected"
});

export const PANCAKE_LP_AGENT_LANE_CONFIGURATION_SHA256 = sha256Canonical(LANE_CONFIGURATION);

export async function runPancakeLpAgentTermixMethod(
  options: RunPancakeLpAgentTermixMethodOptions
): Promise<TermixTimedRunCapture> {
  const lane = laneOptionsSchema.parse({
    inputBundleCanonicalJson: options.inputBundleCanonicalJson,
    inputBundleSha256: options.inputBundleSha256
  });
  if (sha256Bytes(lane.inputBundleCanonicalJson) !== lane.inputBundleSha256) {
    throw new Error("TERMIX_PANCAKE_LP_INPUT_DIGEST_MISMATCH");
  }
  const bundle = PancakeLpInputBundleSchema.parse(
    JSON.parse(lane.inputBundleCanonicalJson) as unknown
  );
  const fetchRequest = options.fetch ?? defaultFetch;
  return runTermixTimedMethod({
    request: options.request,
    clock: options.clock,
    execute: (context) =>
      executePancakeLpAgentLane(
        context,
        lane.inputBundleSha256,
        bundle,
        options.clock,
        fetchRequest
      )
  });
}

async function executePancakeLpAgentLane(
  context: TermixFixedExecutorContext,
  inputBundleSha256: string,
  bundle: PancakeLpInputBundle,
  clock: TermixRunnerClock,
  fetchRequest: PancakeLpLaneFetch
): Promise<TermixMethodExecution> {
  validateLaneBindings(context, inputBundleSha256);
  const source = bundle.sourceEvidence;
  const rpcId = `${context.runId}-lp-slot0`;
  const rpcRequestBody = canonicalJson({
    id: rpcId,
    jsonrpc: "2.0",
    method: "eth_call",
    params: [
      { data: "0x3850c7bd", to: source.poolAddress.toLowerCase() },
      { blockHash: source.blockHash, requireCanonical: true }
    ]
  });
  const rpcStart = validMonotonic(clock);
  const rpcResponse = await postJson(
    fetchRequest,
    PANCAKE_LP_SOURCE_RPC_ENDPOINT,
    rpcRequestBody,
    "RPC"
  );
  const rpcEnd = validMonotonic(clock);
  if (rpcEnd < rpcStart) throw new Error("TERMIX_PANCAKE_LP_CLOCK_REVERSED");
  const parsedRpc = rpcResponseSchema.parse(rpcResponse.parsed);
  if (parsedRpc.id !== rpcId || decodeSlot0Tick(parsedRpc.result) !== source.expectedCurrentTick) {
    throw new Error("TERMIX_PANCAKE_LP_RPC_STATE_MISMATCH");
  }
  const rpcObservedAtUtc = validUtc(clock.utcNow());

  const requestId = `${context.runId}-lp-a2a`;
  const agentRequestBody = canonicalJson({
    id: requestId,
    jsonrpc: "2.0",
    method: "message/send",
    params: {
      message: {
        kind: "message",
        messageId: `${context.runId}-lp-request`,
        parts: [{ data: bundle.agentRequest, kind: "data" }],
        role: "user"
      }
    }
  });
  const agentStart = validMonotonic(clock);
  const agentResponse = await postJson(
    fetchRequest,
    PANCAKE_LP_AGENT_ENDPOINT,
    agentRequestBody,
    "AGENT"
  );
  const agentEnd = validMonotonic(clock);
  if (agentEnd < agentStart) throw new Error("TERMIX_PANCAKE_LP_CLOCK_REVERSED");
  const agentObservedAtUtc = validUtc(clock.utcNow());
  const envelope = agentResponseSchema.parse(agentResponse.parsed);
  if (envelope.id !== requestId) throw new Error("TERMIX_PANCAKE_LP_A2A_ID_MISMATCH");
  const output = envelope.result.parts[0]?.data;
  if (output === undefined) throw new Error("TERMIX_PANCAKE_LP_A2A_OUTPUT_MISSING");
  validateAgentOutput(output, bundle);
  return {
    outputBody: canonicalJson(output),
    outputMediaType: "application/json",
    apiResponses: [
      {
        receiptId: rpcId,
        provider: "PublicNode BSC mainnet JSON-RPC",
        endpointUrl: PANCAKE_LP_SOURCE_RPC_ENDPOINT,
        requestId: rpcId,
        observedAtUtc: rpcObservedAtUtc,
        responseBody: canonicalJson({
          requestBody: rpcRequestBody,
          responseBody: rpcResponse.body
        })
      },
      {
        receiptId: requestId,
        provider: "ProofEra LP Range Agent A2A",
        endpointUrl: PANCAKE_LP_AGENT_ENDPOINT,
        requestId,
        observedAtUtc: agentObservedAtUtc,
        responseBody: agentResponse.body
      }
    ],
    activeSegments: [
      {
        segmentId: `${context.runId}-lp-rpc-call`,
        description: "Exact-hash Pancake V3 slot0 source verification",
        startedAtNanoseconds: rpcStart.toString(),
        endedAtNanoseconds: rpcEnd.toString()
      },
      {
        segmentId: `${context.runId}-lp-agent-call`,
        description: "Public LP Range Agent A2A request and response",
        startedAtNanoseconds: agentStart.toString(),
        endedAtNanoseconds: agentEnd.toString()
      }
    ],
    limitations: [
      "The source API receipt rechecks only exact-block slot0; the committed input evidence remains necessary for position, owner, token, fee and liquidity fields.",
      "The public third-party position establishes no ProofEra ownership, approval, authority, performance or execution receipt.",
      "The analyzer is read-only and cannot sign, approve, rebalance or submit a transaction."
    ]
  };
}

function validateLaneBindings(
  context: TermixFixedExecutorContext,
  inputBundleSha256: string
): void {
  if (context.runnerId !== "pancake-lp-agent-v1" || context.method.kind !== "agent") {
    throw new Error("TERMIX_PANCAKE_LP_AGENT_LANE_INVALID");
  }
  if (context.method.configurationSha256 !== PANCAKE_LP_AGENT_LANE_CONFIGURATION_SHA256) {
    throw new Error("TERMIX_PANCAKE_LP_AGENT_CONFIGURATION_MISMATCH");
  }
  const input = context.declaration.inputs.find(
    ({ inputId }) => inputId === PANCAKE_LP_INPUT_DIGEST_ID
  );
  if (input?.value.encoding !== "string" || input.value.value !== inputBundleSha256) {
    throw new Error("TERMIX_PANCAKE_LP_DECLARATION_INPUT_MISMATCH");
  }
  const parameters = new Map(
    context.declaration.environment.parameters.map(({ key, value }) => [key, value])
  );
  if (
    parameters.get("lp-agent-endpoint")?.value !== PANCAKE_LP_AGENT_ENDPOINT ||
    parameters.get("lp-source-rpc-endpoint")?.value !== PANCAKE_LP_SOURCE_RPC_ENDPOINT
  ) {
    throw new Error("TERMIX_PANCAKE_LP_ENDPOINT_BINDING_MISMATCH");
  }
}

function validateAgentOutput(output: Record<string, unknown>, bundle: PancakeLpInputBundle): void {
  const request = bundle.agentRequest;
  const fields: ReadonlyArray<readonly [string, unknown]> = [
    ["chainId", request.chainId],
    ["poolAddress", request.poolAddress],
    ["positionManagerAddress", request.positionManagerAddress],
    ["positionId", request.positionId],
    ["observedAtBlock", request.observedAtBlock],
    ["currentTick", request.currentTick],
    ["lowerTick", request.lowerTick],
    ["upperTick", request.upperTick],
    ["tickSpacing", request.tickSpacing]
  ];
  if (output.executionEnabled !== false || typeof output.decision !== "string") {
    throw new Error("TERMIX_PANCAKE_LP_A2A_SAFETY_BOUNDARY_INVALID");
  }
  for (const [field, expected] of fields) {
    const actual = output[field];
    const matches =
      typeof expected === "string" && /^0x[0-9a-fA-F]{40}$/u.test(expected)
        ? typeof actual === "string" && actual.toLowerCase() === expected.toLowerCase()
        : actual === expected;
    if (!matches) throw new Error("TERMIX_PANCAKE_LP_A2A_SOURCE_BINDING_MISMATCH");
  }
}

async function postJson(
  fetchRequest: PancakeLpLaneFetch,
  url: string,
  body: string,
  label: "RPC" | "AGENT"
): Promise<{ readonly body: string; readonly parsed: unknown }> {
  const response = await fetchRequest(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS)
  });
  if (response.status !== 200) throw new Error(`TERMIX_PANCAKE_LP_${label}_HTTP_INVALID`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new Error(`TERMIX_PANCAKE_LP_${label}_CONTENT_TYPE_INVALID`);
  }
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!UINT_STRING.test(declaredLength) || BigInt(declaredLength) > BigInt(MAXIMUM_BODY_BYTES))
  ) {
    throw new Error(`TERMIX_PANCAKE_LP_${label}_BODY_TOO_LARGE`);
  }
  const responseBody = await response.text();
  if (Buffer.byteLength(responseBody) > MAXIMUM_BODY_BYTES) {
    throw new Error(`TERMIX_PANCAKE_LP_${label}_BODY_TOO_LARGE`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody) as unknown;
  } catch {
    throw new Error(`TERMIX_PANCAKE_LP_${label}_JSON_INVALID`);
  }
  return { body: responseBody, parsed };
}

export function decodeSlot0Tick(result: string): number {
  if (!ABI_WORDS.test(result)) throw new Error("TERMIX_PANCAKE_LP_SLOT0_ABI_INVALID");
  const body = result.slice(2);
  if (body.length < 128) throw new Error("TERMIX_PANCAKE_LP_SLOT0_ABI_INVALID");
  const word = body.slice(64, 128);
  const raw = BigInt(`0x${word}`);
  const low = raw & 0xff_ffffn;
  const negative = (low & 0x80_0000n) !== 0n;
  const expectedHigh = negative ? (1n << 232n) - 1n : 0n;
  if (raw >> 24n !== expectedHigh) throw new Error("TERMIX_PANCAKE_LP_SLOT0_ABI_INVALID");
  return negative ? Number(low - 0x100_0000n) : Number(low);
}

function validMonotonic(clock: TermixRunnerClock): bigint {
  const value = clock.monotonicNowNanoseconds();
  if (value < 0n) throw new Error("TERMIX_PANCAKE_LP_MONOTONIC_INVALID");
  return value;
}

function normalizedAddress(value: unknown): string | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/u.test(value)
    ? value.toLowerCase()
    : null;
}

function validUtc(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("TERMIX_PANCAKE_LP_UTC_INVALID");
  return value.toISOString();
}

async function defaultFetch(
  url: string,
  init: Parameters<PancakeLpLaneFetch>[1]
): Promise<PancakeLpLaneHttpResponse> {
  return fetch(url, init);
}
