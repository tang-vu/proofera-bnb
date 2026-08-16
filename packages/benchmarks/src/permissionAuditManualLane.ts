import { z } from "zod";

import { canonicalJson, isCanonicalJsonText, sha256Bytes } from "./canonical.js";
import {
  PermissionAuditBundleSchema,
  PermissionAuditOutputSchema,
  type PermissionAuditBundle
} from "./permissionAudit.js";
import {
  PERMISSION_AUDIT_RPC_ENDPOINT,
  PERMISSION_AUDIT_RPC_PROVIDER,
  buildPermissionAuditRpcPlan,
  validatePermissionAuditRpcResponse
} from "./permissionAuditRpc.js";
import {
  runTermixTimedMethod,
  type TermixFixedExecutorContext,
  type TermixMethodExecution,
  type TermixRunnerClock,
  type TermixTimedRunCapture
} from "./runner.js";
import { BenchmarkIdSchema, Sha256Schema } from "./schemas.js";

export const PERMISSION_AUDIT_MANUAL_PROCEDURE_VERSION =
  "proofera-termix-permission-audit-manual-v1.0.0" as const;

const MAXIMUM_EVENTS = 250;
const MAXIMUM_BODY_BYTES = 2_000_000;
const INPUT_BINDINGS = Object.freeze({
  "activation-proposal": "activationProposalArtifactId",
  "adversarial-corpus": "adversarialCorpusArtifactId",
  "authority-lifecycle-receipts": "authorityLifecycleReceiptsArtifactId",
  "code-authority-attestation": "codeAuthorityAttestationArtifactId",
  "sdk-behavior-evidence": "sdkBehaviorEvidenceArtifactId"
} as const);

const eventSchema = z.discriminatedUnion("event", [
  z.strictObject({
    description: z.string().trim().min(1).max(500),
    event: z.literal("active_start"),
    segmentId: BenchmarkIdSchema
  }),
  z.strictObject({ event: z.literal("active_end"), segmentId: BenchmarkIdSchema }),
  z.strictObject({
    artifactId: BenchmarkIdSchema,
    event: z.literal("artifact_read"),
    sha256: Sha256Schema
  }),
  z.strictObject({
    endpointUrl: z.literal(PERMISSION_AUDIT_RPC_ENDPOINT),
    event: z.literal("rpc_exchange"),
    exchangeId: BenchmarkIdSchema,
    requestBody: z.string().min(1).max(MAXIMUM_BODY_BYTES),
    responseBody: z.string().min(1).max(MAXIMUM_BODY_BYTES)
  }),
  z.strictObject({
    event: z.literal("output"),
    outputBody: z
      .string()
      .min(1)
      .max(MAXIMUM_BODY_BYTES)
      .refine(isCanonicalJsonText, "Expected canonical JSON manual output")
  })
]);

export type PermissionAuditManualEvent = z.input<typeof eventSchema>;

export interface RunPermissionAuditManualTermixMethodOptions {
  readonly request: unknown;
  readonly bundleCanonicalJson: string;
  readonly bundleSha256: string;
  readonly events: AsyncIterable<unknown>;
  readonly clock: TermixRunnerClock;
}

interface OpenSegment {
  readonly description: string;
  readonly segmentId: string;
  readonly startedAtNanoseconds: string;
}

export async function runPermissionAuditManualTermixMethod(
  options: RunPermissionAuditManualTermixMethodOptions
): Promise<TermixTimedRunCapture> {
  const bundleSha256 = Sha256Schema.parse(options.bundleSha256);
  if (!isCanonicalJsonText(options.bundleCanonicalJson)) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_BUNDLE_NOT_CANONICAL");
  }
  if (sha256Bytes(options.bundleCanonicalJson) !== bundleSha256) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_BUNDLE_DIGEST_MISMATCH");
  }
  const bundle = PermissionAuditBundleSchema.parse(
    JSON.parse(options.bundleCanonicalJson) as unknown
  );
  return runTermixTimedMethod({
    request: options.request,
    clock: options.clock,
    execute: (context) =>
      consumeEvents(context, bundle, bundleSha256, options.events, options.clock)
  });
}

async function consumeEvents(
  context: TermixFixedExecutorContext,
  bundle: PermissionAuditBundle,
  bundleSha256: string,
  events: AsyncIterable<unknown>,
  clock: TermixRunnerClock
): Promise<TermixMethodExecution> {
  validateManualBindings(context, bundle);
  const rpcPlan = buildPermissionAuditRpcPlan(bundle, permissionAuditRpcIdPrefix(context.runId));
  const planById = new Map(rpcPlan.map((entry) => [entry.exchangeId, entry]));
  const seenArtifacts = new Set<string>();
  const seenExchanges = new Set<string>();
  const activeSegments: TermixMethodExecution["activeSegments"] = [];
  const apiResponses: TermixMethodExecution["apiResponses"] = [];
  let openSegment: OpenSegment | null = null;
  let outputBody: string | null = null;
  let eventCount = 0;

  for await (const rawEvent of events) {
    eventCount += 1;
    if (eventCount > MAXIMUM_EVENTS) throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_EVENT_LIMIT");
    if (outputBody !== null) throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_EVENT_AFTER_OUTPUT");
    const event = eventSchema.parse(rawEvent);
    if (event.event === "active_start") {
      if (openSegment !== null) throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_SEGMENT_NESTED");
      openSegment = {
        description: event.description,
        segmentId: event.segmentId,
        startedAtNanoseconds: validMonotonic(clock).toString()
      };
    } else if (event.event === "active_end") {
      if (openSegment === null || openSegment.segmentId !== event.segmentId) {
        throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_SEGMENT_MISMATCH");
      }
      const endedAtNanoseconds = validMonotonic(clock);
      if (endedAtNanoseconds <= BigInt(openSegment.startedAtNanoseconds)) {
        throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_CLOCK_REVERSED");
      }
      activeSegments.push({ ...openSegment, endedAtNanoseconds: endedAtNanoseconds.toString() });
      openSegment = null;
    } else if (event.event === "artifact_read") {
      if (openSegment === null)
        throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_READ_OUTSIDE_ACTIVE");
      if (seenArtifacts.has(event.artifactId)) {
        throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_ARTIFACT_DUPLICATE");
      }
      const artifact = bundle.evidence.find(({ artifactId }) => artifactId === event.artifactId);
      if (artifact?.sha256 !== event.sha256) {
        throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_ARTIFACT_MISMATCH");
      }
      seenArtifacts.add(event.artifactId);
    } else if (event.event === "rpc_exchange") {
      if (openSegment === null)
        throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_RPC_OUTSIDE_ACTIVE");
      if (seenExchanges.has(event.exchangeId)) {
        throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_RPC_DUPLICATE");
      }
      const plan = planById.get(event.exchangeId);
      if (plan === undefined || plan.requestBody !== event.requestBody) {
        throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_RPC_REQUEST_MISMATCH");
      }
      validatePermissionAuditRpcResponse(plan, event.responseBody, bundle);
      seenExchanges.add(event.exchangeId);
      apiResponses.push({
        endpointUrl: event.endpointUrl,
        observedAtUtc: validUtc(clock.utcNow()),
        provider: PERMISSION_AUDIT_RPC_PROVIDER,
        receiptId: event.exchangeId,
        requestId: event.exchangeId,
        responseBody: canonicalJson({
          requestBody: event.requestBody,
          responseBody: event.responseBody
        })
      });
    } else {
      validateManualOutput(event.outputBody, context, bundleSha256);
      outputBody = event.outputBody;
    }
  }

  if (openSegment !== null) throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_SEGMENT_UNCLOSED");
  if (activeSegments.length === 0) throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_ACTIVE_MISSING");
  if (seenArtifacts.size !== bundle.evidence.length) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_ARTIFACTS_INCOMPLETE");
  }
  if (seenExchanges.size !== rpcPlan.length) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_RPC_INCOMPLETE");
  }
  if (outputBody === null) throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_OUTPUT_MISSING");
  return {
    activeSegments,
    apiResponses,
    limitations: [
      "The runner timestamps operator-declared active work but cannot cryptographically prove operator identity or absence of unreported tools.",
      "Artifact-read events prove digest agreement only; they do not authenticate the underlying source or prove that the reviewer understood it.",
      "The manual report is retained unedited and is not presumed correct merely because its schema and evidence joins validate."
    ],
    outputBody,
    outputMediaType: "application/json"
  };
}

function validateManualBindings(
  context: TermixFixedExecutorContext,
  bundle: PermissionAuditBundle
): void {
  if (context.runnerId !== "permission-audit-manual-v1" || context.method.kind !== "manual") {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_LANE_INVALID");
  }
  if (context.method.procedureVersion !== PERMISSION_AUDIT_MANUAL_PROCEDURE_VERSION) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_PROCEDURE_MISMATCH");
  }
  const tools = context.method.tools
    .map(({ name, version }) => `${name}:${version}`)
    .sort()
    .join(",");
  if (
    tools !==
    "human-reviewed-canonical-json-worksheet:1.0.0,node-sha256:node-crypto,publicnode-bsc-testnet-json-rpc:eth-json-rpc"
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_TOOLS_MISMATCH");
  }
  for (const [inputId, bindingKey] of Object.entries(INPUT_BINDINGS)) {
    const artifactId = bundle.sourceBindings[bindingKey as keyof typeof bundle.sourceBindings];
    const artifact = bundle.evidence.find((candidate) => candidate.artifactId === artifactId);
    const declared = context.declaration.inputs.find((input) => input.inputId === inputId);
    if (
      artifact === undefined ||
      declared?.value.encoding !== "canonical_json" ||
      declared.value.value !== canonicalJson(artifact)
    ) {
      throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_DECLARATION_INPUT_MISMATCH");
    }
  }
}

function validateManualOutput(
  outputBody: string,
  context: TermixFixedExecutorContext,
  bundleSha256: string
): void {
  const output = z
    .strictObject({
      agentInvoked: z.literal(false),
      bundleSha256: Sha256Schema,
      limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50),
      manualProcedureVersion: z.literal(PERMISSION_AUDIT_MANUAL_PROCEDURE_VERSION),
      operatorRole: z.string().trim().min(1).max(200),
      result: PermissionAuditOutputSchema,
      schemaVersion: z.literal("proofera-termix-permission-audit-manual-output-v1.0.0")
    })
    .parse(JSON.parse(outputBody) as unknown);
  if (
    context.method.kind !== "manual" ||
    output.operatorRole !== context.method.operatorRole ||
    output.bundleSha256 !== bundleSha256 ||
    output.result.bundleSha256 !== bundleSha256
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_OUTPUT_BINDING_MISMATCH");
  }
}

export function permissionAuditRpcIdPrefix(runId: string): string {
  return `audit-${sha256Bytes(runId).slice(0, 16)}`;
}

function validMonotonic(clock: TermixRunnerClock): bigint {
  const value = clock.monotonicNowNanoseconds();
  if (value < 0n) throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_MONOTONIC_INVALID");
  return value;
}

function validUtc(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_UTC_INVALID");
  }
  return value.toISOString();
}
