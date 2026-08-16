import { z } from "zod";

import { canonicalJson, sha256Bytes } from "./canonical.js";
import {
  BenchmarkDeclarationSchema,
  BenchmarkIdSchema,
  BenchmarkMethodSchema,
  GitCommitShaSchema,
  SafeHttpUrlSchema,
  Sha256Schema,
  TransactionHashSchema,
  UnsignedIntegerStringSchema,
  UtcDateTimeSchema,
  normalizeBenchmarkDeclaration,
  type BenchmarkDeclaration,
  type BenchmarkMethod
} from "./schemas.js";

export const TERMIX_TIMED_RUNNER_PROTOCOL_VERSION = "proofera-termix-timed-runner-v1.0.0" as const;

export const TermixRunnerIdSchema = z.enum([
  "pancake-lp-agent-v1",
  "pancake-lp-manual-v1",
  "permission-audit-agent-v1",
  "permission-audit-manual-v1",
  "venus-health-agent-v1",
  "venus-health-manual-v1"
]);

export type TermixRunnerId = z.infer<typeof TermixRunnerIdSchema>;

const RUNNER_BY_TASK_AND_METHOD: Readonly<
  Record<string, Readonly<Record<BenchmarkMethod["kind"], TermixRunnerId>>>
> = Object.freeze({
  "pancake-lp-range-decision": Object.freeze({
    agent: "pancake-lp-agent-v1",
    manual: "pancake-lp-manual-v1"
  }),
  "autonomous-session-permission-audit": Object.freeze({
    agent: "permission-audit-agent-v1",
    manual: "permission-audit-manual-v1"
  }),
  "venus-health-factor-decision": Object.freeze({
    agent: "venus-health-agent-v1",
    manual: "venus-health-manual-v1"
  })
});

const verifiedHireReceiptSchema = z
  .strictObject({
    state: z.literal("verified"),
    chainId: z.number().int().positive(),
    transactionHash: TransactionHashSchema,
    explorerUrl: SafeHttpUrlSchema,
    observedAtUtc: UtcDateTimeSchema,
    verifiedAtUtc: UtcDateTimeSchema,
    verifier: z.string().trim().min(1).max(200),
    verificationMethod: z.string().trim().min(1).max(1_000),
    rawReceipt: z.string().min(1).max(1_000_000),
    rawReceiptSha256: Sha256Schema
  })
  .superRefine((receipt, context) => {
    if (sha256Bytes(receipt.rawReceipt) !== receipt.rawReceiptSha256) {
      context.addIssue({
        code: "custom",
        path: ["rawReceiptSha256"],
        message: "Hire receipt SHA-256 does not match the supplied raw bytes"
      });
    }
    if (
      !new URL(receipt.explorerUrl).pathname
        .toLowerCase()
        .includes(receipt.transactionHash.toLowerCase())
    ) {
      context.addIssue({
        code: "custom",
        path: ["explorerUrl"],
        message: "Hire receipt explorer URL must identify the transaction hash"
      });
    }
    if (Date.parse(receipt.verifiedAtUtc) < Date.parse(receipt.observedAtUtc)) {
      context.addIssue({
        code: "custom",
        path: ["verifiedAtUtc"],
        message: "Hire receipt verification cannot predate observation"
      });
    }
  });

export const TermixTimedRunRequestSchema = z
  .strictObject({
    protocolVersion: z.literal(TERMIX_TIMED_RUNNER_PROTOCOL_VERSION),
    runId: BenchmarkIdSchema,
    runnerId: TermixRunnerIdSchema,
    declaration: BenchmarkDeclarationSchema,
    declarationSha256: Sha256Schema,
    method: BenchmarkMethodSchema,
    sourceCommitSha: GitCommitShaSchema,
    repositoryClean: z.literal(true),
    hireReceipt: verifiedHireReceiptSchema.nullable()
  })
  .superRefine((request, context) => {
    const normalizedDeclaration = normalizeBenchmarkDeclaration(request.declaration);
    if (sha256Bytes(canonicalJson(normalizedDeclaration)) !== request.declarationSha256) {
      context.addIssue({
        code: "custom",
        path: ["declarationSha256"],
        message: "Declaration SHA-256 does not match the normalized declaration"
      });
    }
    if (request.sourceCommitSha !== request.declaration.environment.softwareCommitSha) {
      context.addIssue({
        code: "custom",
        path: ["sourceCommitSha"],
        message: "Runner source commit must match the frozen declaration environment"
      });
    }
    const taskRunners = RUNNER_BY_TASK_AND_METHOD[request.declaration.task.taskId];
    const expectedRunner = taskRunners?.[request.method.kind];
    if (expectedRunner === undefined || expectedRunner !== request.runnerId) {
      context.addIssue({
        code: "custom",
        path: ["runnerId"],
        message: "Runner is not the fixed lane for this task and method"
      });
    }

    if (request.method.kind === "agent") {
      if (request.method.agentReference.state !== "registered") {
        context.addIssue({
          code: "custom",
          path: ["method", "agentReference"],
          message: "Timed agent runs require a registered ERC-8004 identity"
        });
      } else if (
        request.method.agentReference.chainId !== request.declaration.environment.chainId
      ) {
        context.addIssue({
          code: "custom",
          path: ["method", "agentReference", "chainId"],
          message: "Registered agent chain must match the declaration"
        });
      }
      if (request.hireReceipt === null) {
        context.addIssue({
          code: "custom",
          path: ["hireReceipt"],
          message: "Timed agent runs require a verified ProofEra hire receipt"
        });
      } else if (request.hireReceipt.chainId !== request.declaration.environment.chainId) {
        context.addIssue({
          code: "custom",
          path: ["hireReceipt", "chainId"],
          message: "Hire receipt chain must match the declaration"
        });
      }
    } else if (request.hireReceipt !== null) {
      context.addIssue({
        code: "custom",
        path: ["hireReceipt"],
        message: "Manual runs must not consume an agent hire receipt"
      });
    }
  });

export type TermixTimedRunRequest = z.input<typeof TermixTimedRunRequestSchema>;
type ValidatedTermixTimedRunRequest = z.output<typeof TermixTimedRunRequestSchema>;

const activeSegmentSchema = z.strictObject({
  segmentId: BenchmarkIdSchema,
  description: z.string().trim().min(1).max(500),
  startedAtNanoseconds: UnsignedIntegerStringSchema,
  endedAtNanoseconds: UnsignedIntegerStringSchema
});

const apiResponseSchema = z.strictObject({
  receiptId: BenchmarkIdSchema,
  provider: z.string().trim().min(1).max(200),
  endpointUrl: SafeHttpUrlSchema,
  requestId: z.string().trim().min(1).max(500),
  observedAtUtc: UtcDateTimeSchema,
  responseBody: z.string().min(1).max(2_000_000)
});

export const TermixMethodExecutionSchema = z
  .strictObject({
    outputBody: z.string().min(1).max(2_000_000),
    outputMediaType: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
    apiResponses: z.array(apiResponseSchema).max(100),
    activeSegments: z.array(activeSegmentSchema).max(100),
    limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50)
  })
  .superRefine((execution, context) => {
    const receiptIds = new Set<string>();
    for (const [index, response] of execution.apiResponses.entries()) {
      if (receiptIds.has(response.receiptId)) {
        context.addIssue({
          code: "custom",
          path: ["apiResponses", index, "receiptId"],
          message: "API receipt identifiers must be unique"
        });
      }
      receiptIds.add(response.receiptId);
    }
  });

export type TermixMethodExecution = z.input<typeof TermixMethodExecutionSchema>;

export interface TermixRunnerClock {
  utcNow(): Date;
  monotonicNowNanoseconds(): bigint;
  readonly monotonicClockLabel: string;
}

export interface TermixFixedExecutorContext {
  readonly runnerId: TermixRunnerId;
  readonly runId: string;
  readonly declaration: BenchmarkDeclaration;
  readonly declarationCanonicalJson: string;
  readonly method: BenchmarkMethod;
  readonly runStartedAtUtc: string;
  readonly runStartedAtNanoseconds: string;
}

export interface TermixTimedRunCapture {
  readonly protocolVersion: typeof TERMIX_TIMED_RUNNER_PROTOCOL_VERSION;
  readonly runId: string;
  readonly runnerId: TermixRunnerId;
  readonly declarationSha256: string;
  readonly sourceCommitSha: string;
  readonly methodKind: BenchmarkMethod["kind"];
  readonly timing: {
    readonly startedAtUtc: string;
    readonly endedAtUtc: string;
    readonly monotonicDurationNanoseconds: string;
    readonly monotonicClock: string;
    readonly activeDurationNanoseconds: string;
    readonly activeSegments: readonly z.output<typeof activeSegmentSchema>[];
  };
  readonly output: {
    readonly mediaType: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly body: string;
  };
  readonly apiResponses: readonly {
    readonly receiptId: string;
    readonly provider: string;
    readonly endpointUrl: string;
    readonly requestId: string;
    readonly observedAtUtc: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly body: string;
  }[];
  readonly hireReceipt: {
    readonly transactionHash: string;
    readonly explorerUrl: string;
    readonly observedAtUtc: string;
    readonly verifiedAtUtc: string;
    readonly bytes: number;
    readonly rawReceiptSha256: string;
    readonly rawReceipt: string;
  } | null;
  readonly limitations: readonly string[];
  readonly boundaries: {
    readonly fixedRunnerLane: true;
    readonly repositoryCommitMatched: true;
    readonly repositoryWasCleanBeforeStart: true;
    readonly declarationDigestMatched: true;
    readonly agentWasRegisteredBeforeStart: boolean;
    readonly hireReceiptWasVerifiedBeforeStart: boolean;
  };
}

export interface RunTermixTimedMethodOptions {
  readonly request: unknown;
  readonly clock: TermixRunnerClock;
  readonly execute: (context: TermixFixedExecutorContext) => Promise<unknown>;
}

function isoUtc(date: Date, label: string): string {
  if (!Number.isFinite(date.getTime())) throw new Error(`TERMIX_${label}_UTC_INVALID`);
  return date.toISOString();
}

function validateActiveSegments(
  segments: readonly z.output<typeof activeSegmentSchema>[],
  started: bigint,
  ended: bigint
): bigint {
  let previousEnd = started;
  let total = 0n;
  const identifiers = new Set<string>();
  for (const segment of segments) {
    if (identifiers.has(segment.segmentId)) throw new Error("TERMIX_ACTIVE_SEGMENT_DUPLICATE");
    identifiers.add(segment.segmentId);
    const segmentStart = BigInt(segment.startedAtNanoseconds);
    const segmentEnd = BigInt(segment.endedAtNanoseconds);
    if (
      segmentStart < started ||
      segmentEnd > ended ||
      segmentEnd < segmentStart ||
      segmentStart < previousEnd
    ) {
      throw new Error("TERMIX_ACTIVE_SEGMENT_INVALID");
    }
    total += segmentEnd - segmentStart;
    previousEnd = segmentEnd;
  }
  return total;
}

/**
 * Executes one already-bound fixed method lane. All eligibility checks happen
 * before the executor callback is invoked, so a missing registration, receipt,
 * clean commit or declaration digest cannot accidentally become a timed run.
 */
export async function runTermixTimedMethod(
  options: RunTermixTimedMethodOptions
): Promise<TermixTimedRunCapture> {
  const request: ValidatedTermixTimedRunRequest = TermixTimedRunRequestSchema.parse(
    options.request
  );
  const declarationCanonicalJson = canonicalJson(
    normalizeBenchmarkDeclaration(request.declaration)
  );
  const monotonicClock = z.string().trim().min(1).max(200).parse(options.clock.monotonicClockLabel);
  const startedAtUtc = isoUtc(options.clock.utcNow(), "START");
  const startedAtNanoseconds = options.clock.monotonicNowNanoseconds();
  if (startedAtNanoseconds < 0n) throw new Error("TERMIX_MONOTONIC_START_INVALID");

  const rawExecution = await options.execute({
    runnerId: request.runnerId,
    runId: request.runId,
    declaration: request.declaration,
    declarationCanonicalJson,
    method: request.method,
    runStartedAtUtc: startedAtUtc,
    runStartedAtNanoseconds: startedAtNanoseconds.toString()
  });

  const endedAtNanoseconds = options.clock.monotonicNowNanoseconds();
  const endedAtUtc = isoUtc(options.clock.utcNow(), "END");
  if (endedAtNanoseconds < startedAtNanoseconds) {
    throw new Error("TERMIX_MONOTONIC_CLOCK_REVERSED");
  }
  if (Date.parse(endedAtUtc) < Date.parse(startedAtUtc)) {
    throw new Error("TERMIX_UTC_CLOCK_REVERSED");
  }
  const execution = TermixMethodExecutionSchema.parse(rawExecution);
  if (
    request.declaration.requiredReceiptKinds.includes("api") &&
    execution.apiResponses.length === 0
  ) {
    throw new Error("TERMIX_REQUIRED_API_RECEIPT_MISSING");
  }
  if (
    execution.apiResponses.some((response) => {
      const observed = Date.parse(response.observedAtUtc);
      return observed < Date.parse(startedAtUtc) || observed > Date.parse(endedAtUtc);
    })
  ) {
    throw new Error("TERMIX_API_RECEIPT_OUTSIDE_TIMED_WINDOW");
  }
  const activeDurationNanoseconds = validateActiveSegments(
    execution.activeSegments,
    startedAtNanoseconds,
    endedAtNanoseconds
  );
  const outputBytes = Buffer.byteLength(execution.outputBody);

  return {
    protocolVersion: TERMIX_TIMED_RUNNER_PROTOCOL_VERSION,
    runId: request.runId,
    runnerId: request.runnerId,
    declarationSha256: request.declarationSha256,
    sourceCommitSha: request.sourceCommitSha,
    methodKind: request.method.kind,
    timing: {
      startedAtUtc,
      endedAtUtc,
      monotonicDurationNanoseconds: (endedAtNanoseconds - startedAtNanoseconds).toString(),
      monotonicClock,
      activeDurationNanoseconds: activeDurationNanoseconds.toString(),
      activeSegments: execution.activeSegments
    },
    output: {
      mediaType: execution.outputMediaType,
      bytes: outputBytes,
      sha256: sha256Bytes(execution.outputBody),
      body: execution.outputBody
    },
    apiResponses: execution.apiResponses.map((response) => ({
      receiptId: response.receiptId,
      provider: response.provider,
      endpointUrl: response.endpointUrl,
      requestId: response.requestId,
      observedAtUtc: response.observedAtUtc,
      bytes: Buffer.byteLength(response.responseBody),
      sha256: sha256Bytes(response.responseBody),
      body: response.responseBody
    })),
    hireReceipt:
      request.hireReceipt === null
        ? null
        : {
            transactionHash: request.hireReceipt.transactionHash,
            explorerUrl: request.hireReceipt.explorerUrl,
            observedAtUtc: request.hireReceipt.observedAtUtc,
            verifiedAtUtc: request.hireReceipt.verifiedAtUtc,
            bytes: Buffer.byteLength(request.hireReceipt.rawReceipt),
            rawReceiptSha256: request.hireReceipt.rawReceiptSha256,
            rawReceipt: request.hireReceipt.rawReceipt
          },
    limitations: execution.limitations,
    boundaries: {
      fixedRunnerLane: true,
      repositoryCommitMatched: true,
      repositoryWasCleanBeforeStart: true,
      declarationDigestMatched: true,
      agentWasRegisteredBeforeStart:
        request.method.kind === "agent" && request.method.agentReference.state === "registered",
      hireReceiptWasVerifiedBeforeStart:
        request.method.kind === "agent" && request.hireReceipt !== null
    }
  };
}
