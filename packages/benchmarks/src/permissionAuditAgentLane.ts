import { z } from "zod";

import { canonicalJson, isCanonicalJsonText, sha256Bytes, sha256Canonical } from "./canonical.js";
import {
  PERMISSION_AUDIT_ENGINE_VERSION,
  PermissionAuditBundleSchema,
  PermissionAuditOutputSchema,
  expectedPermissionAuditDeclarationInputs,
  type PermissionAuditBundle
} from "./permissionAudit.js";
import {
  PERMISSION_AUDIT_RPC_ENDPOINT,
  PERMISSION_AUDIT_RPC_PROVIDER,
  buildPermissionAuditRpcPlan,
  permissionAuditRpcIdPrefix,
  validatePermissionAuditRpcResponse
} from "./permissionAuditRpc.js";
import {
  runTermixTimedMethod,
  type TermixFixedExecutorContext,
  type TermixMethodExecution,
  type TermixRunnerClock,
  type TermixTimedRunCapture
} from "./runner.js";
import { Sha256Schema } from "./schemas.js";

export const PERMISSION_AUDIT_AGENT_LANE_VERSION =
  "proofera-termix-permission-audit-agent-lane-v1.0.0" as const;
export const PERMISSION_AUDIT_AGENT_ENDPOINT = "https://proofera-lp.tangvu.dev/" as const;
export const PERMISSION_AUDIT_AGENT_SKILL = "audit_altana_permission_bundle" as const;

const MAXIMUM_INPUT_BYTES = 256 * 1_024;
const MAXIMUM_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const AGENT_COMPONENT_NAME = "proofera-security-auditor";
const AGENT_ENDPOINT_PARAMETER = "permission-audit-agent-endpoint";
const RPC_ENDPOINT_PARAMETER = "permission-audit-rpc-endpoint";

const optionsSchema = z.strictObject({
  bundleCanonicalJson: z
    .string()
    .min(1)
    .max(MAXIMUM_INPUT_BYTES)
    .refine(isCanonicalJsonText, "Expected canonical permission-audit bundle JSON"),
  bundleSha256: Sha256Schema
});

const a2aEnvelopeSchema = z.strictObject({
  id: z.string().min(1).max(100),
  jsonrpc: z.literal("2.0"),
  result: z.looseObject({
    kind: z.literal("message"),
    messageId: z.string().trim().min(1).max(500),
    parts: z
      .array(
        z.looseObject({
          data: z.record(z.string(), z.unknown()),
          kind: z.literal("data")
        })
      )
      .length(1),
    role: z.literal("agent")
  })
});

export interface PermissionAuditAgentHttpResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type PermissionAuditAgentFetch = (
  url: string,
  init: {
    readonly body: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly method: "POST";
    readonly redirect: "error";
    readonly signal: AbortSignal;
  }
) => Promise<PermissionAuditAgentHttpResponse>;

export interface RunPermissionAuditAgentTermixMethodOptions {
  readonly request: unknown;
  readonly bundleCanonicalJson: string;
  readonly bundleSha256: string;
  readonly clock: TermixRunnerClock;
  readonly fetch?: PermissionAuditAgentFetch;
}

const LANE_CONFIGURATION = Object.freeze({
  agentEndpointUrl: PERMISSION_AUDIT_AGENT_ENDPOINT,
  engineVersion: PERMISSION_AUDIT_ENGINE_VERSION,
  maximumInputBytes: MAXIMUM_INPUT_BYTES,
  maximumResponseBytes: MAXIMUM_RESPONSE_BYTES,
  protocolVersion: PERMISSION_AUDIT_AGENT_LANE_VERSION,
  redirects: "rejected",
  requestTimeoutMilliseconds: REQUEST_TIMEOUT_MILLISECONDS,
  rpcEndpointUrl: PERMISSION_AUDIT_RPC_ENDPOINT,
  rpcMethods: ["eth_chainId", "eth_getTransactionReceipt", "eth_getCode"],
  skill: PERMISSION_AUDIT_AGENT_SKILL,
  transport: "fixed read-only JSON-RPC observations followed by A2A JSON-RPC message/send"
});

export const PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256 = sha256Canonical(LANE_CONFIGURATION);

export async function runPermissionAuditAgentTermixMethod(
  options: RunPermissionAuditAgentTermixMethodOptions
): Promise<TermixTimedRunCapture> {
  const lane = optionsSchema.parse({
    bundleCanonicalJson: options.bundleCanonicalJson,
    bundleSha256: options.bundleSha256
  });
  if (sha256Bytes(lane.bundleCanonicalJson) !== lane.bundleSha256) {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_BUNDLE_DIGEST_MISMATCH");
  }
  const bundle = PermissionAuditBundleSchema.parse(JSON.parse(lane.bundleCanonicalJson) as unknown);
  return runTermixTimedMethod({
    request: options.request,
    clock: options.clock,
    execute: (context) =>
      executeAgentLane(
        context,
        bundle,
        lane.bundleSha256,
        options.clock,
        options.fetch ?? defaultFetch
      )
  });
}

async function executeAgentLane(
  context: TermixFixedExecutorContext,
  bundle: PermissionAuditBundle,
  bundleSha256: string,
  clock: TermixRunnerClock,
  fetchRequest: PermissionAuditAgentFetch
): Promise<TermixMethodExecution> {
  validateLaneBindings(context, bundle);
  const apiResponses: TermixMethodExecution["apiResponses"] = [];
  const activeSegments: TermixMethodExecution["activeSegments"] = [];
  const rpcPlan = buildPermissionAuditRpcPlan(bundle, permissionAuditRpcIdPrefix(context.runId));

  for (const entry of rpcPlan) {
    const startedAtNanoseconds = validMonotonic(clock);
    const response = await postJson(fetchRequest, PERMISSION_AUDIT_RPC_ENDPOINT, entry.requestBody);
    const endedAtNanoseconds = validMonotonic(clock);
    if (endedAtNanoseconds < startedAtNanoseconds) {
      throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_CLOCK_REVERSED");
    }
    validatePermissionAuditRpcResponse(entry, response.body, bundle);
    apiResponses.push({
      endpointUrl: PERMISSION_AUDIT_RPC_ENDPOINT,
      observedAtUtc: validUtc(clock.utcNow()),
      provider: PERMISSION_AUDIT_RPC_PROVIDER,
      receiptId: entry.exchangeId,
      requestId: entry.exchangeId,
      responseBody: canonicalJson({
        requestBody: entry.requestBody,
        responseBody: response.body
      })
    });
    activeSegments.push({
      description: `Fixed read-only permission audit observation: ${entry.kind}`,
      endedAtNanoseconds: endedAtNanoseconds.toString(),
      segmentId: entry.exchangeId,
      startedAtNanoseconds: startedAtNanoseconds.toString()
    });
  }

  const prefix = permissionAuditRpcIdPrefix(context.runId);
  const requestId = `${prefix}-a2a`;
  const requestBody = canonicalJson({
    id: requestId,
    jsonrpc: "2.0",
    method: "message/send",
    params: {
      message: {
        kind: "message",
        messageId: `${prefix}-request`,
        parts: [
          {
            data: { bundle, skill: PERMISSION_AUDIT_AGENT_SKILL },
            kind: "data"
          }
        ],
        role: "user"
      }
    }
  });
  if (Buffer.byteLength(requestBody) > MAXIMUM_INPUT_BYTES) {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_REQUEST_TOO_LARGE");
  }
  const startedAtNanoseconds = validMonotonic(clock);
  const response = await postJson(fetchRequest, PERMISSION_AUDIT_AGENT_ENDPOINT, requestBody);
  const endedAtNanoseconds = validMonotonic(clock);
  if (endedAtNanoseconds < startedAtNanoseconds) {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_CLOCK_REVERSED");
  }
  const envelope = a2aEnvelopeSchema.parse(response.parsed);
  if (envelope.id !== requestId) throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_A2A_ID_MISMATCH");
  const data = envelope.result.parts[0]?.data;
  if (data === undefined) throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_OUTPUT_MISSING");
  const output = PermissionAuditOutputSchema.parse(data);
  if (output.bundleSha256 !== bundleSha256 || output.executionPerformed !== false) {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_OUTPUT_BINDING_MISMATCH");
  }
  apiResponses.push({
    endpointUrl: PERMISSION_AUDIT_AGENT_ENDPOINT,
    observedAtUtc: validUtc(clock.utcNow()),
    provider: "ProofEra Permission Auditor A2A",
    receiptId: requestId,
    requestId,
    responseBody: response.body
  });
  activeSegments.push({
    description: "Public permission-audit agent A2A request and response",
    endedAtNanoseconds: endedAtNanoseconds.toString(),
    segmentId: requestId,
    startedAtNanoseconds: startedAtNanoseconds.toString()
  });

  return {
    activeSegments,
    apiResponses,
    limitations: [
      "The fixed RPC observations verify chain, retained successful receipt joins and target runtime bytes only; they do not independently authenticate every frozen artifact.",
      "The A2A response proves the captured public service output, not that its findings are complete or that the corrected policy is deployed.",
      "The timed lane is read-only and cannot grant, sign, submit, broadcast, revoke or mutate durable state."
    ],
    outputBody: canonicalJson(output),
    outputMediaType: "application/json"
  };
}

function validateLaneBindings(
  context: TermixFixedExecutorContext,
  bundle: PermissionAuditBundle
): void {
  if (context.runnerId !== "permission-audit-agent-v1" || context.method.kind !== "agent") {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_LANE_INVALID");
  }
  if (context.method.configurationSha256 !== PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256) {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_CONFIGURATION_MISMATCH");
  }
  for (const [inputId, expectedValue] of expectedPermissionAuditDeclarationInputs(bundle)) {
    const declared = context.declaration.inputs.find((input) => input.inputId === inputId);
    if (declared?.value.encoding !== "canonical_json" || declared.value.value !== expectedValue) {
      throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_DECLARATION_INPUT_MISMATCH");
    }
  }
  const parameters = new Map(
    context.declaration.environment.parameters.map(({ key, value }) => [key, value])
  );
  if (
    parameters.get(AGENT_ENDPOINT_PARAMETER)?.value !== PERMISSION_AUDIT_AGENT_ENDPOINT ||
    parameters.get(RPC_ENDPOINT_PARAMETER)?.value !== PERMISSION_AUDIT_RPC_ENDPOINT
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_ENDPOINT_BINDING_MISMATCH");
  }
  const component = context.declaration.environment.components.find(
    ({ name }) => name === AGENT_COMPONENT_NAME
  );
  if (component?.configurationSha256 !== PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256) {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_COMPONENT_BINDING_MISMATCH");
  }
}

async function postJson(
  fetchRequest: PermissionAuditAgentFetch,
  url: string,
  body: string
): Promise<{ readonly body: string; readonly parsed: unknown }> {
  const response = await fetchRequest(url, {
    body,
    headers: { accept: "application/json", "content-type": "application/json" },
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS)
  });
  if (response.status !== 200) throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_HTTP_STATUS_INVALID");
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_CONTENT_TYPE_INVALID");
  }
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^(0|[1-9][0-9]*)$/u.test(declaredLength) || BigInt(declaredLength) > MAXIMUM_RESPONSE_BYTES)
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_RESPONSE_TOO_LARGE");
  }
  const responseBody = await response.text();
  if (Buffer.byteLength(responseBody) > MAXIMUM_RESPONSE_BYTES) {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_RESPONSE_TOO_LARGE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody) as unknown;
  } catch {
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_RESPONSE_JSON_INVALID");
  }
  return { body: responseBody, parsed };
}

function validMonotonic(clock: TermixRunnerClock): bigint {
  const value = clock.monotonicNowNanoseconds();
  if (value < 0n) throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_MONOTONIC_INVALID");
  return value;
}

function validUtc(value: Date): string {
  if (!Number.isFinite(value.getTime()))
    throw new Error("TERMIX_PERMISSION_AUDIT_AGENT_UTC_INVALID");
  return value.toISOString();
}

const defaultFetch: PermissionAuditAgentFetch = (url, init) => fetch(url, init);
