import { z } from "zod";

import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.js";
import {
  PANCAKE_LP_SOURCE_RPC_ENDPOINT,
  PANCAKE_LP_SOURCE_RPC_PROVIDER,
  PancakeLpInputBundleSchema,
  decodeSlot0Tick
} from "./pancakeLpAgentLane.js";
import { PANCAKE_LP_MANUAL_PROCEDURE_VERSION } from "./pancakeLpManualLane.js";
import {
  benchmarkDeclarationSha256,
  summarizePairedBenchmark,
  type PairedBenchmarkSummary
} from "./pair.js";
import { TermixTimedRunRequestSchema } from "./runner.js";
import {
  BenchmarkDeclarationSchema,
  BenchmarkMethodSchema,
  BENCHMARK_SCHEMA_VERSION,
  PairedBenchmarkSchema,
  RepositoryPathSchema,
  Sha256Schema,
  UtcDateTimeSchema,
  type BenchmarkArtifact,
  type BenchmarkDeclaration,
  type BenchmarkMethod,
  type BenchmarkRun,
  type PairedBenchmark,
  type ReceiptReference
} from "./schemas.js";
import { VENUS_HEALTH_MANUAL_PROCEDURE_VERSION } from "./venusHealthManualLane.js";

const SELF_REVIEWER = "ProofEra deterministic observational-pair self-review v1" as const;
const LP_PAIR_ID = "pancake-lp-pair-20260822-v1" as const;
const VENUS_PAIR_ID = "venus-health-pair-20260822-v1" as const;
const OPERATOR_ROLE = "Repository owner using the bounded non-agent worksheet" as const;
const VENUS_RPC_ENDPOINT = "https://bsc-testnet-rpc.publicnode.com" as const;
const VENUS_RPC_PROVIDER = "PublicNode BSC Testnet JSON-RPC" as const;
const UINT_STRING = /^(0|[1-9][0-9]*)$/u;
const HEX_32 = /^0x[0-9a-fA-F]{64}$/u;

const apiResponseSchema = z.strictObject({
  body: z.string().min(1).max(2_000_000),
  bytes: z.number().int().nonnegative(),
  endpointUrl: z.string().url(),
  observedAtUtc: UtcDateTimeSchema,
  provider: z.string().trim().min(1).max(200),
  receiptId: z.string().trim().min(1).max(100),
  requestId: z.string().trim().min(1).max(500),
  sha256: Sha256Schema
});

const captureSchema = z.strictObject({
  apiResponses: z.array(apiResponseSchema).min(1).max(100),
  boundaries: z.strictObject({
    agentWasRegisteredBeforeStart: z.boolean(),
    declarationDigestMatched: z.literal(true),
    fixedRunnerLane: z.literal(true),
    hireReceiptWasVerifiedBeforeStart: z.boolean(),
    repositoryCommitMatched: z.literal(true),
    repositoryWasCleanBeforeStart: z.literal(true)
  }),
  declarationSha256: Sha256Schema,
  hireReceipt: z
    .strictObject({
      bytes: z.number().int().nonnegative(),
      explorerUrl: z.string().url(),
      observedAtUtc: UtcDateTimeSchema,
      rawReceipt: z.string().min(1).max(2_000_000),
      rawReceiptSha256: Sha256Schema,
      transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/u),
      verifiedAtUtc: UtcDateTimeSchema
    })
    .nullable(),
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50),
  methodKind: z.enum(["agent", "manual"]),
  output: z.strictObject({
    body: z.string().min(1).max(2_000_000),
    bytes: z.number().int().nonnegative(),
    mediaType: z.string().trim().min(1).max(200),
    sha256: Sha256Schema
  }),
  protocolVersion: z.literal("proofera-termix-timed-runner-v1.0.0"),
  runId: z.string().trim().min(1).max(100),
  runnerId: z.string().trim().min(1).max(100),
  sourceCommitSha: z.string().regex(/^[0-9a-f]{40}$/u),
  timing: z.strictObject({
    activeDurationNanoseconds: z.string().regex(UINT_STRING),
    activeSegments: z
      .array(
        z.strictObject({
          description: z.string().trim().min(1).max(500),
          endedAtNanoseconds: z.string().regex(UINT_STRING),
          segmentId: z.string().trim().min(1).max(100),
          startedAtNanoseconds: z.string().regex(UINT_STRING)
        })
      )
      .min(1)
      .max(100),
    endedAtUtc: UtcDateTimeSchema,
    monotonicClock: z.string().trim().min(1).max(200),
    monotonicDurationNanoseconds: z.string().regex(UINT_STRING),
    startedAtUtc: UtcDateTimeSchema
  })
});

const invocationSchema = z.strictObject({
  inputDigest: Sha256Schema,
  timedRunRequest: TermixTimedRunRequestSchema
});

const declarationEnvelopeSchema = z.looseObject({
  state: z.string().trim().min(1),
  sourceCommitSha: z.string().regex(/^[0-9a-f]{40}$/u),
  input: z.strictObject({ path: RepositoryPathSchema, sha256: Sha256Schema }),
  declaration: BenchmarkDeclarationSchema,
  declarationSha256: Sha256Schema
});

const runOrderSchema = z.looseObject({
  schemaVersion: z.literal("proofera-termix-run-order-resolution-v1.0.0"),
  state: z.literal("resolved"),
  declaration: z.strictObject({
    path: RepositoryPathSchema,
    sha256: Sha256Schema,
    sourceCommitSha: z.string().regex(/^[0-9a-f]{40}$/u)
  }),
  randomness: z.looseObject({
    chainId: z.literal(97),
    blockNumber: z.string().regex(UINT_STRING),
    blockHash: z.string().regex(HEX_32),
    leastSignificantBit: z.literal(0),
    runOrder: z.tuple([z.literal("agent"), z.literal("manual")])
  }),
  observedAtUtc: UtcDateTimeSchema
});

const sourceSchema = z.strictObject({
  agentCapturePath: RepositoryPathSchema,
  agentInvocationPath: RepositoryPathSchema,
  declarationPath: RepositoryPathSchema,
  inputPath: RepositoryPathSchema,
  manualCapturePath: RepositoryPathSchema,
  operatorProcedurePath: RepositoryPathSchema,
  runOrderPath: RepositoryPathSchema
});

const taskIdSchema = z.enum(["pancake-lp-range-decision", "venus-health-factor-decision"]);
const pairIdSchema = z.enum([LP_PAIR_ID, VENUS_PAIR_ID]);

export const ObservationalPairSelfReviewSchema = z.strictObject({
  schemaVersion: z.literal("proofera-termix-observational-self-review-v1.0.0"),
  taskId: taskIdSchema,
  pairId: pairIdSchema,
  pairSha256: Sha256Schema,
  reviewedAtUtc: UtcDateTimeSchema,
  reviewState: z.literal("self_reviewed_unverified"),
  reviewer: z.strictObject({
    name: z.literal("OpenAI Codex repository operator"),
    role: z.literal("Implementation-adjacent evidence reviewer"),
    independenceBasis: z.literal(
      "Not independent: the reviewer also operated the repository workflow, so this record cannot satisfy the second-reviewer gate."
    )
  }),
  checks: z.strictObject({
    artifactDigestsVerified: z.literal(true),
    declarationBindingsVerified: z.literal(true),
    deterministicCoreRecomputed: z.literal(true),
    noWriteBoundaryVerified: z.literal(true),
    publicRunOrderVerified: z.literal(true),
    rubricRecomputed: z.literal(true),
    secondReviewerIndependent: z.literal(false)
  }),
  quality: z.strictObject({
    maximumPoints: z.literal(100),
    agentPoints: z.literal(100),
    manualPoints: z.literal(100)
  }),
  sources: sourceSchema,
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20)
});

export interface BuildObservationalPairInput {
  readonly agentCapture: unknown;
  readonly manualCapture: unknown;
  readonly agentInvocation: unknown;
  readonly declarationEnvelope: unknown;
  readonly frozenInput: unknown;
  readonly runOrder: unknown;
  readonly reviewedAtUtc: string;
  readonly sources: z.input<typeof sourceSchema>;
}

export interface ObservationalPairBuildResult {
  readonly pair: PairedBenchmark;
  readonly summary: PairedBenchmarkSummary;
  readonly selfReview: z.output<typeof ObservationalPairSelfReviewSchema>;
}

interface TaskConfiguration {
  readonly taskId: z.output<typeof taskIdSchema>;
  readonly pairId: z.output<typeof pairIdSchema>;
  readonly agentRunnerId: string;
  readonly manualRunnerId: string;
  readonly inputDigestKey: "inputBundleSha256" | "requestInputSha256";
  readonly costChainId: 56 | 97;
  readonly costSymbol: "BNB" | "tBNB";
  readonly manualMethod: BenchmarkMethod;
  readonly scoreRationales: Readonly<Record<string, string>>;
  readonly pairLimitations: readonly string[];
}

const LP_CONFIGURATION: TaskConfiguration = {
  taskId: "pancake-lp-range-decision",
  pairId: LP_PAIR_ID,
  agentRunnerId: "pancake-lp-agent-v1",
  manualRunnerId: "pancake-lp-manual-v1",
  inputDigestKey: "inputBundleSha256",
  costChainId: 56,
  costSymbol: "BNB",
  manualMethod: BenchmarkMethodSchema.parse({
    kind: "manual",
    label: "Operator-confirmed LP worksheet without agent",
    operatorRole: OPERATOR_ROLE,
    procedureVersion: PANCAKE_LP_MANUAL_PROCEDURE_VERSION,
    tools: [
      { name: "human-reviewed-canonical-json-worksheet", version: "1.0.0" },
      { name: "onfinality-bsc-mainnet-archive-json-rpc", version: "eth-json-rpc" }
    ]
  }),
  scoreRationales: {
    "economics-decision-integrity":
      "Both outputs keep unavailable fee, gas and slippage economics unknown and select insufficient_evidence without proposing execution.",
    "explanation-uncertainty":
      "Both retained outputs explain missing economics, public-position non-authority and the read-only boundary.",
    "range-risk-accuracy":
      "Current tick, half-open range membership, width and both tick buffers recompute exactly from the frozen bundle and retained slot0 receipts.",
    reproducibility:
      "Declaration, input digest, public run order, raw response bytes, output bytes and capture timings all pass deterministic joins.",
    "verified-inputs":
      "Both lanes bind the same chain, pool, Position Manager, position, block hash and exact-hash slot0 result."
  },
  pairLimitations: [
    "The two retained formats are not byte-identical; this self-review compares only predeclared, independently recomputable decision fields.",
    "The manual no-agent statement is runner-bounded but still requires a genuinely independent tool-log reviewer.",
    "Equal implementation-adjacent scores on one frozen public position do not establish agent advantage or general LP performance."
  ]
};

const VENUS_CONFIGURATION: TaskConfiguration = {
  taskId: "venus-health-factor-decision",
  pairId: VENUS_PAIR_ID,
  agentRunnerId: "venus-health-agent-v1",
  manualRunnerId: "venus-health-manual-v1",
  inputDigestKey: "requestInputSha256",
  costChainId: 97,
  costSymbol: "tBNB",
  manualMethod: BenchmarkMethodSchema.parse({
    kind: "manual",
    label: "Operator-confirmed Venus health worksheet without agent",
    operatorRole: OPERATOR_ROLE,
    procedureVersion: VENUS_HEALTH_MANUAL_PROCEDURE_VERSION,
    tools: [
      { name: "human-reviewed-canonical-json-worksheet", version: "1.0.0" },
      { name: "official-bsc-testnet-json-rpc", version: "eth-json-rpc" }
    ]
  }),
  scoreRationales: {
    "evidence-reproducibility":
      "Declaration, request digest, public run order, output bytes, API bytes and all integer joins pass deterministic replay.",
    "explanation-uncertainty":
      "Both outputs preserve public-account non-authority and explicitly avoid guaranteed protection or execution claims.",
    "safe-policy-compliance":
      "Both lanes choose the allowed read-only hold decision and record no wallet, signature, repayment or broadcast.",
    "state-and-calculation":
      "All three observation numerators, denominators and floor-scaled 18-decimal health factors recompute from the frozen request.",
    "threshold-and-latency":
      "The minimum health factor, 144-second window, thresholds and no-trigger latency state match the frozen policy."
  },
  pairLimitations: [
    "The agent and worksheet use different output envelopes; this self-review compares the frozen observation, calculation, threshold and decision core.",
    "The manual no-agent statement and source provenance still require a genuinely independent second reviewer.",
    "Equal implementation-adjacent scores on one public testnet replay do not prove avoided liquidation, agent advantage or production protection."
  ]
};

interface ParsedCommon {
  readonly agentCapture: z.output<typeof captureSchema>;
  readonly manualCapture: z.output<typeof captureSchema>;
  readonly agentInvocation: z.output<typeof invocationSchema>;
  readonly declaration: BenchmarkDeclaration;
  readonly declarationEnvelope: z.output<typeof declarationEnvelopeSchema>;
  readonly runOrder: z.output<typeof runOrderSchema>;
  readonly reviewedAtUtc: string;
  readonly sources: z.output<typeof sourceSchema>;
}

/** Build the Task 01 pair while keeping both runs unverified. */
export function buildPancakeLpPair(
  input: BuildObservationalPairInput
): ObservationalPairBuildResult {
  const common = parseCommon(input, LP_CONFIGURATION);
  const bundle = PancakeLpInputBundleSchema.parse(input.frozenInput);
  const inputSha256 = sha256Canonical(bundle);
  verifyInputBinding(common, inputSha256, LP_CONFIGURATION);
  verifyPancakeOutputs(common, bundle, inputSha256);
  verifyPancakeReceipts(common, bundle);
  return buildResult(common, LP_CONFIGURATION, inputSha256);
}

/** Build the Task 03 pair while keeping both runs unverified. */
export function buildVenusHealthPair(
  input: BuildObservationalPairInput
): ObservationalPairBuildResult {
  const common = parseCommon(input, VENUS_CONFIGURATION);
  const request = venusRequestSchema.parse(input.frozenInput);
  const inputSha256 = sha256Canonical(request);
  verifyInputBinding(common, inputSha256, VENUS_CONFIGURATION);
  verifyVenusOutputs(common, request, inputSha256);
  verifyVenusReceipts(common, request);
  return buildResult(common, VENUS_CONFIGURATION, inputSha256);
}

function parseCommon(
  input: BuildObservationalPairInput,
  configuration: TaskConfiguration
): ParsedCommon {
  const reviewedAtUtc = UtcDateTimeSchema.parse(input.reviewedAtUtc);
  const sources = sourceSchema.parse(input.sources);
  const agentCapture = captureSchema.parse(input.agentCapture);
  const manualCapture = captureSchema.parse(input.manualCapture);
  const rawInvocation = asRecord(input.agentInvocation, "TERMIX_OBSERVATIONAL_INVOCATION_INVALID");
  const digest = rawInvocation[configuration.inputDigestKey];
  const agentInvocation = invocationSchema.parse({
    inputDigest: digest,
    timedRunRequest: rawInvocation.timedRunRequest
  });
  const declarationEnvelope = declarationEnvelopeSchema.parse(input.declarationEnvelope);
  const runOrder = runOrderSchema.parse(input.runOrder);
  const declaration = agentInvocation.timedRunRequest.declaration;
  const declarationSha256 = benchmarkDeclarationSha256(declaration);

  if (
    declaration.task.taskId !== configuration.taskId ||
    declarationEnvelope.declaration.task.taskId !== configuration.taskId ||
    canonicalJson(declaration) !== canonicalJson(declarationEnvelope.declaration) ||
    declarationSha256 !== agentInvocation.timedRunRequest.declarationSha256 ||
    declarationSha256 !== declarationEnvelope.declarationSha256 ||
    declarationSha256 !== agentCapture.declarationSha256 ||
    declarationSha256 !== manualCapture.declarationSha256
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_DECLARATION_MISMATCH");
  }
  if (
    agentCapture.runId !== agentInvocation.timedRunRequest.runId ||
    agentCapture.sourceCommitSha !== agentInvocation.timedRunRequest.sourceCommitSha ||
    agentCapture.sourceCommitSha !== declarationEnvelope.sourceCommitSha ||
    manualCapture.sourceCommitSha !== declarationEnvelope.sourceCommitSha ||
    agentCapture.runnerId !== configuration.agentRunnerId ||
    manualCapture.runnerId !== configuration.manualRunnerId ||
    agentCapture.methodKind !== "agent" ||
    manualCapture.methodKind !== "manual" ||
    agentInvocation.timedRunRequest.runnerId !== configuration.agentRunnerId ||
    agentInvocation.timedRunRequest.method.kind !== "agent"
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_CAPTURE_BINDING_MISMATCH");
  }
  if (
    !agentCapture.boundaries.agentWasRegisteredBeforeStart ||
    !agentCapture.boundaries.hireReceiptWasVerifiedBeforeStart ||
    agentCapture.hireReceipt === null ||
    manualCapture.boundaries.agentWasRegisteredBeforeStart ||
    manualCapture.boundaries.hireReceiptWasVerifiedBeforeStart ||
    manualCapture.hireReceipt !== null
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_LANE_BOUNDARY_INVALID");
  }
  if (
    runOrder.declaration.path !== sources.declarationPath ||
    runOrder.declaration.sha256 !== declarationSha256 ||
    runOrder.declaration.sourceCommitSha !== declarationEnvelope.sourceCommitSha ||
    Date.parse(agentCapture.timing.endedAtUtc) >= Date.parse(manualCapture.timing.startedAtUtc)
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_RUN_ORDER_INVALID");
  }
  if (
    Date.parse(reviewedAtUtc) < Date.parse(agentCapture.timing.endedAtUtc) ||
    Date.parse(reviewedAtUtc) < Date.parse(manualCapture.timing.endedAtUtc)
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_REVIEW_TIME_INVALID");
  }
  verifyCaptureBytes(agentCapture);
  verifyCaptureBytes(manualCapture);
  return {
    agentCapture,
    manualCapture,
    agentInvocation,
    declaration,
    declarationEnvelope,
    runOrder,
    reviewedAtUtc,
    sources
  };
}

function verifyInputBinding(
  common: ParsedCommon,
  inputSha256: string,
  configuration: TaskConfiguration
): void {
  if (
    inputSha256 !== common.agentInvocation.inputDigest ||
    inputSha256 !== common.declarationEnvelope.input.sha256 ||
    common.declarationEnvelope.input.path !== common.sources.inputPath
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_INPUT_DIGEST_MISMATCH");
  }
  const declarationInputId =
    configuration.taskId === "pancake-lp-range-decision"
      ? "lp-range-input-bundle-sha256"
      : "health-factor-request-sha256";
  const declared = common.declaration.inputs.find(({ inputId }) => inputId === declarationInputId);
  if (declared?.value.encoding !== "string" || declared.value.value !== inputSha256) {
    throw new Error("TERMIX_OBSERVATIONAL_INPUT_UNBOUND");
  }
}

function verifyCaptureBytes(capture: z.output<typeof captureSchema>): void {
  if (
    Buffer.byteLength(capture.output.body) !== capture.output.bytes ||
    sha256Bytes(capture.output.body) !== capture.output.sha256
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_OUTPUT_DIGEST_MISMATCH");
  }
  for (const response of capture.apiResponses) {
    if (
      Buffer.byteLength(response.body) !== response.bytes ||
      sha256Bytes(response.body) !== response.sha256
    ) {
      throw new Error("TERMIX_OBSERVATIONAL_RECEIPT_DIGEST_MISMATCH");
    }
  }
  const hire = capture.hireReceipt;
  if (
    hire !== null &&
    (Buffer.byteLength(hire.rawReceipt) !== hire.bytes ||
      sha256Bytes(hire.rawReceipt) !== hire.rawReceiptSha256 ||
      !hire.explorerUrl.toLowerCase().includes(hire.transactionHash.toLowerCase()))
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_HIRE_DIGEST_MISMATCH");
  }
}

const lpManualOutputSchema = z.strictObject({
  schemaVersion: z.literal("proofera-termix-pancake-lp-manual-output-v1.0.0"),
  manualProcedureVersion: z.literal(PANCAKE_LP_MANUAL_PROCEDURE_VERSION),
  operatorRole: z.literal(OPERATOR_ROLE),
  inputBundleSha256: Sha256Schema,
  agentInvoked: z.literal(false),
  result: z.looseObject({
    positionId: z.string().regex(UINT_STRING),
    lowerTick: z.number().int(),
    currentTick: z.number().int(),
    upperTick: z.number().int(),
    tickSpacing: z.number().int().positive(),
    rangeWidthTicks: z.number().int().positive(),
    fromLowerTick: z.number().int(),
    toUpperExclusiveTick: z.number().int(),
    inRange: z.boolean(),
    decision: z.literal("insufficient_evidence"),
    economicsComplete: z.literal(false),
    sourceBlockHash: z.string().regex(HEX_32),
    sourceBlockNumber: z.string().regex(UINT_STRING),
    signedOrBroadcast: z.literal(false)
  }),
  limitations: z.array(z.string().min(1)).min(1)
});

function verifyPancakeOutputs(
  common: ParsedCommon,
  bundle: z.output<typeof PancakeLpInputBundleSchema>,
  inputSha256: string
): void {
  const agent = asRecord(
    parseJson(common.agentCapture.output.body, "TERMIX_OBSERVATIONAL_LP_AGENT_OUTPUT_INVALID"),
    "TERMIX_OBSERVATIONAL_LP_AGENT_OUTPUT_INVALID"
  );
  const manual = lpManualOutputSchema.parse(
    parseJson(common.manualCapture.output.body, "TERMIX_OBSERVATIONAL_LP_MANUAL_OUTPUT_INVALID")
  );
  const request = bundle.agentRequest;
  const lowerTick = requiredInteger(request, "lowerTick");
  const upperTick = requiredInteger(request, "upperTick");
  const currentTick = bundle.sourceEvidence.expectedCurrentTick;
  const expected = {
    positionId: bundle.sourceEvidence.positionId,
    lowerTick,
    currentTick,
    upperTick,
    tickSpacing: requiredInteger(request, "tickSpacing"),
    rangeWidthTicks: upperTick - lowerTick,
    fromLowerTick: currentTick - lowerTick,
    toUpperExclusiveTick: upperTick - currentTick,
    inRange: currentTick >= lowerTick && currentTick < upperTick
  };
  const agentBuffers = asRecord(agent.tickBuffers, "TERMIX_OBSERVATIONAL_LP_AGENT_OUTPUT_INVALID");
  for (const [key, value] of Object.entries(expected)) {
    const agentValue =
      key === "fromLowerTick" || key === "toUpperExclusiveTick" ? agentBuffers[key] : agent[key];
    if (agentValue !== value || manual.result[key] !== value) {
      throw new Error("TERMIX_OBSERVATIONAL_LP_CORE_MISMATCH");
    }
  }
  const economics = asRecord(agent.economics, "TERMIX_OBSERVATIONAL_LP_AGENT_OUTPUT_INVALID");
  const absentEconomics = [
    "knownGasCostMinorUnits",
    "knownNetBenefitMinorUnits",
    "knownSlippageCostMinorUnits",
    "knownTotalCostsMinorUnits",
    "projectedIncrementalFeesMinorUnits"
  ];
  if (
    manual.inputBundleSha256 !== inputSha256 ||
    agent.chainId !== bundle.sourceEvidence.chainId ||
    normalizedAddress(agent.poolAddress) !== bundle.sourceEvidence.poolAddress.toLowerCase() ||
    normalizedAddress(agent.positionManagerAddress) !==
      bundle.sourceEvidence.positionManagerAddress.toLowerCase() ||
    agent.observedAtBlock !== bundle.sourceEvidence.blockNumber ||
    agent.decision !== "insufficient_evidence" ||
    agent.executionEnabled !== false ||
    absentEconomics.some((key) => economics[key] !== null) ||
    manual.result.sourceBlockHash.toLowerCase() !== bundle.sourceEvidence.blockHash.toLowerCase() ||
    manual.result.sourceBlockNumber !== bundle.sourceEvidence.blockNumber
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_LP_SAFETY_MISMATCH");
  }
}

function verifyPancakeReceipts(
  common: ParsedCommon,
  bundle: z.output<typeof PancakeLpInputBundleSchema>
): void {
  if (
    common.agentCapture.apiResponses.length !== 2 ||
    common.manualCapture.apiResponses.length !== 1 ||
    common.agentCapture.apiResponses[1]?.provider !== "ProofEra LP Range Agent A2A"
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_LP_RECEIPT_SET_INVALID");
  }
  for (const response of [
    common.agentCapture.apiResponses[0],
    common.manualCapture.apiResponses[0]
  ]) {
    if (
      response === undefined ||
      response.provider !== PANCAKE_LP_SOURCE_RPC_PROVIDER ||
      response.endpointUrl !== PANCAKE_LP_SOURCE_RPC_ENDPOINT
    ) {
      throw new Error("TERMIX_OBSERVATIONAL_LP_RPC_RECEIPT_INVALID");
    }
    const { request, rpcResponse } = parseRpcEnvelope(response.body);
    const params = z
      .tuple([
        z.strictObject({ data: z.literal("0x3850c7bd"), to: z.string() }),
        z.strictObject({ blockHash: z.string().regex(HEX_32), requireCanonical: z.literal(true) })
      ])
      .parse(request.params);
    if (
      request.method !== "eth_call" ||
      normalizedAddress(params[0].to) !== bundle.sourceEvidence.poolAddress.toLowerCase() ||
      params[1].blockHash.toLowerCase() !== bundle.sourceEvidence.blockHash.toLowerCase() ||
      typeof rpcResponse.result !== "string" ||
      decodeSlot0Tick(rpcResponse.result) !== bundle.sourceEvidence.expectedCurrentTick
    ) {
      throw new Error("TERMIX_OBSERVATIONAL_LP_RPC_STATE_MISMATCH");
    }
  }
}

const venusObservationSchema = z.looseObject({
  account: z.string(),
  adjustedCollateralValueRaw: z.string().regex(UINT_STRING),
  blockHash: z.string().regex(HEX_32),
  blockNumber: z.string().regex(UINT_STRING),
  chainId: z.literal(97),
  debtValueRaw: z.string().regex(UINT_STRING),
  observedAtUtc: UtcDateTimeSchema
});

const venusRequestSchema = z.looseObject({
  skill: z.literal("analyze_venus_health_factor"),
  account: z.string().regex(/^0x[0-9a-fA-F]{40}$/u),
  chainId: z.literal(97),
  currentSnapshot: z.record(z.string(), z.unknown()),
  observationSeries: z.looseObject({
    complete: z.literal(true),
    observations: z.array(venusObservationSchema).length(3)
  }),
  policy: z.looseObject({
    alertHealthFactorRaw: z.string().regex(UINT_STRING),
    healthFactorScaleDecimals: z.literal(18),
    interventionHealthFactorRaw: z.string().regex(UINT_STRING),
    minimumHistoryObservations: z.literal(3),
    minimumObservationWindowSeconds: z.number().int().positive()
  }),
  alertReceipts: z.array(z.unknown()).nullable(),
  executionReceipts: z.array(z.unknown()).nullable()
});

const healthFactorSchema = z.looseObject({
  decimalValueFloor: z.string().regex(/^(0|[1-9][0-9]*)\.[0-9]{18}$/u),
  denominator: z.string().regex(UINT_STRING),
  numerator: z.string().regex(UINT_STRING),
  scaledValueFloor: z.string().regex(UINT_STRING)
});

const venusManualOutputSchema = z.strictObject({
  schemaVersion: z.literal("proofera-termix-venus-health-manual-output-v1.0.0"),
  manualProcedureVersion: z.literal(VENUS_HEALTH_MANUAL_PROCEDURE_VERSION),
  operatorRole: z.literal(OPERATOR_ROLE),
  requestInputSha256: Sha256Schema,
  agentInvoked: z.literal(false),
  result: z.looseObject({
    account: z.string(),
    chainId: z.literal(97),
    decision: z.literal("hold"),
    formula: z.literal("floor(adjustedCollateralValueRaw * 10^18 / debtValueRaw)"),
    observations: z.array(
      z.looseObject({
        adjustedCollateralValueRaw: z.string().regex(UINT_STRING),
        blockHash: z.string().regex(HEX_32),
        blockNumber: z.string().regex(UINT_STRING),
        debtValueRaw: z.string().regex(UINT_STRING),
        healthFactor: healthFactorSchema,
        observedAtUtc: UtcDateTimeSchema
      })
    ),
    minimumHealthFactor: healthFactorSchema,
    thresholds: z.strictObject({
      alertHealthFactorRaw: z.string().regex(UINT_STRING),
      interventionHealthFactorRaw: z.string().regex(UINT_STRING)
    }),
    windowSeconds: z.number().int().nonnegative(),
    signedOrBroadcast: z.literal(false)
  }),
  limitations: z.array(z.string().min(1)).min(1)
});

interface HealthFactor {
  readonly numerator: string;
  readonly denominator: string;
  readonly scaledValueFloor: string;
  readonly decimalValueFloor: string;
}

function calculateHealthFactor(observation: z.output<typeof venusObservationSchema>): HealthFactor {
  const numerator = BigInt(observation.adjustedCollateralValueRaw);
  const denominator = BigInt(observation.debtValueRaw);
  if (denominator === 0n) throw new Error("TERMIX_OBSERVATIONAL_VENUS_ZERO_DEBT_INVALID");
  const scaledValueFloor = (numerator * 10n ** 18n) / denominator;
  const digits = scaledValueFloor.toString().padStart(19, "0");
  return {
    numerator: numerator.toString(),
    denominator: denominator.toString(),
    scaledValueFloor: scaledValueFloor.toString(),
    decimalValueFloor: `${digits.slice(0, -18)}.${digits.slice(-18)}`
  };
}

function verifyHealthFactor(actual: unknown, expected: HealthFactor): void {
  const parsed = healthFactorSchema.parse(actual);
  if (
    parsed.numerator !== expected.numerator ||
    parsed.denominator !== expected.denominator ||
    parsed.scaledValueFloor !== expected.scaledValueFloor ||
    parsed.decimalValueFloor !== expected.decimalValueFloor
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_VENUS_HEALTH_FACTOR_MISMATCH");
  }
}

function verifyVenusOutputs(
  common: ParsedCommon,
  request: z.output<typeof venusRequestSchema>,
  inputSha256: string
): void {
  const agent = asRecord(
    parseJson(common.agentCapture.output.body, "TERMIX_OBSERVATIONAL_VENUS_AGENT_OUTPUT_INVALID"),
    "TERMIX_OBSERVATIONAL_VENUS_AGENT_OUTPUT_INVALID"
  );
  const manual = venusManualOutputSchema.parse(
    parseJson(common.manualCapture.output.body, "TERMIX_OBSERVATIONAL_VENUS_MANUAL_OUTPUT_INVALID")
  );
  const observations = request.observationSeries.observations;
  const firstObservation = observations[0];
  const currentObservation = observations[2];
  if (firstObservation === undefined || currentObservation === undefined) {
    throw new Error("TERMIX_OBSERVATIONAL_VENUS_WINDOW_INVALID");
  }
  const expectedFactors = observations.map(calculateHealthFactor);
  const minimum = expectedFactors.reduce((left, right) =>
    BigInt(left.scaledValueFloor) <= BigInt(right.scaledValueFloor) ? left : right
  );
  const windowSeconds =
    (Date.parse(currentObservation.observedAtUtc) - Date.parse(firstObservation.observedAtUtc)) /
    1_000;
  if (
    manual.requestInputSha256 !== inputSha256 ||
    normalizedAddress(manual.result.account) !== request.account.toLowerCase() ||
    normalizedAddress(agent.account) !== request.account.toLowerCase() ||
    agent.chainId !== 97 ||
    agent.decision !== "hold" ||
    manual.result.windowSeconds !== windowSeconds ||
    manual.result.thresholds.alertHealthFactorRaw !== request.policy.alertHealthFactorRaw ||
    manual.result.thresholds.interventionHealthFactorRaw !==
      request.policy.interventionHealthFactorRaw ||
    [
      "executionEnabled",
      "sourceContentsVerified",
      "freshnessAttestedByAgent",
      "marketplaceEligible",
      "activationEligible"
    ].some((key) => agent[key] !== false)
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_VENUS_SAFETY_MISMATCH");
  }
  if (
    expectedFactors.length !== manual.result.observations.length ||
    expectedFactors.length !== 3 ||
    BigInt(minimum.scaledValueFloor) <= BigInt(request.policy.alertHealthFactorRaw)
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_VENUS_WINDOW_INVALID");
  }
  observations.forEach((observation, index) => {
    const manualObservation = manual.result.observations[index];
    const expectedFactor = expectedFactors[index];
    if (
      manualObservation === undefined ||
      expectedFactor === undefined ||
      manualObservation.blockNumber !== observation.blockNumber ||
      manualObservation.blockHash.toLowerCase() !== observation.blockHash.toLowerCase() ||
      manualObservation.observedAtUtc !== observation.observedAtUtc ||
      manualObservation.adjustedCollateralValueRaw !== observation.adjustedCollateralValueRaw ||
      manualObservation.debtValueRaw !== observation.debtValueRaw
    ) {
      throw new Error("TERMIX_OBSERVATIONAL_VENUS_OBSERVATION_MISMATCH");
    }
    verifyHealthFactor(manualObservation.healthFactor, expectedFactor);
  });
  verifyHealthFactor(manual.result.minimumHealthFactor, minimum);
  const currentFactor = expectedFactors[2];
  if (currentFactor === undefined) {
    throw new Error("TERMIX_OBSERVATIONAL_VENUS_WINDOW_INVALID");
  }
  verifyHealthFactor(agent.currentHealthFactor, currentFactor);
  const window = asRecord(
    agent.observationWindow,
    "TERMIX_OBSERVATIONAL_VENUS_AGENT_OUTPUT_INVALID"
  );
  verifyHealthFactor(window.minimumHealthFactor, minimum);
  if (
    window.windowSeconds !== windowSeconds ||
    window.status !== "sufficient" ||
    window.usableObservationCount !== 3
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_VENUS_AGENT_WINDOW_MISMATCH");
  }
  const policy = asRecord(
    agent.policyThresholds,
    "TERMIX_OBSERVATIONAL_VENUS_AGENT_OUTPUT_INVALID"
  );
  const latency = asRecord(agent.alertLatency, "TERMIX_OBSERVATIONAL_VENUS_AGENT_OUTPUT_INVALID");
  if (
    policy.alertHealthFactorRaw !== request.policy.alertHealthFactorRaw ||
    policy.interventionHealthFactorRaw !== request.policy.interventionHealthFactorRaw ||
    latency.status !== "not_required" ||
    latency.triggerObservationCount !== 0
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_VENUS_POLICY_MISMATCH");
  }
}

function verifyVenusReceipts(
  common: ParsedCommon,
  request: z.output<typeof venusRequestSchema>
): void {
  if (
    common.agentCapture.apiResponses.length !== 1 ||
    common.agentCapture.apiResponses[0]?.provider !== "ProofEra Health-Factor Guardian A2A" ||
    common.manualCapture.apiResponses.length !== 4
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_VENUS_RECEIPT_SET_INVALID");
  }
  common.manualCapture.apiResponses.forEach((response, index) => {
    if (response.provider !== VENUS_RPC_PROVIDER || response.endpointUrl !== VENUS_RPC_ENDPOINT) {
      throw new Error("TERMIX_OBSERVATIONAL_VENUS_RPC_RECEIPT_INVALID");
    }
    const { request: rpcRequest, rpcResponse } = parseRpcEnvelope(response.body);
    if (index === 0) {
      if (rpcRequest.method !== "eth_chainId" || rpcResponse.result !== "0x61") {
        throw new Error("TERMIX_OBSERVATIONAL_VENUS_CHAIN_RECEIPT_INVALID");
      }
      return;
    }
    const observation = request.observationSeries.observations[index - 1];
    const result = asRecord(rpcResponse.result, "TERMIX_OBSERVATIONAL_VENUS_BLOCK_RECEIPT_INVALID");
    if (
      observation === undefined ||
      rpcRequest.method !== "eth_getBlockByNumber" ||
      rpcRequest.params[0] !== `0x${BigInt(observation.blockNumber).toString(16)}` ||
      typeof result.hash !== "string" ||
      result.hash.toLowerCase() !== observation.blockHash.toLowerCase()
    ) {
      throw new Error("TERMIX_OBSERVATIONAL_VENUS_BLOCK_RECEIPT_INVALID");
    }
  });
}

function buildResult(
  common: ParsedCommon,
  configuration: TaskConfiguration,
  inputSha256: string
): ObservationalPairBuildResult {
  const agentRun = buildRun({
    capture: common.agentCapture,
    declaration: common.declaration,
    method: common.agentInvocation.timedRunRequest.method,
    reviewedAtUtc: common.reviewedAtUtc,
    sources: common.sources,
    inputSha256,
    configuration
  });
  const manualRun = buildRun({
    capture: common.manualCapture,
    declaration: common.declaration,
    method: configuration.manualMethod,
    reviewedAtUtc: common.reviewedAtUtc,
    sources: common.sources,
    inputSha256,
    configuration
  });
  const limitations = [
    ...configuration.pairLimitations,
    "Both runs and this pair remain unverified until a distinct reviewer signs a digest-bound adjudication.",
    "Zero incremental onchain cost excludes human labor and the earlier marketplace hire; no currency conversion is performed."
  ];
  const pair = PairedBenchmarkSchema.parse({
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    pairId: configuration.pairId,
    agentRun,
    manualRun,
    limitations
  });
  const summary = summarizePairedBenchmark(pair);
  if (
    summary.claimState !== "unverified" ||
    summary.publishableClaim ||
    summary.quality?.agentPoints !== 100 ||
    summary.quality.manualPoints !== 100
  ) {
    throw new Error("TERMIX_OBSERVATIONAL_PAIR_CLAIM_BOUNDARY_INVALID");
  }
  const selfReview = ObservationalPairSelfReviewSchema.parse({
    schemaVersion: "proofera-termix-observational-self-review-v1.0.0",
    taskId: configuration.taskId,
    pairId: configuration.pairId,
    pairSha256: summary.pairSha256,
    reviewedAtUtc: common.reviewedAtUtc,
    reviewState: "self_reviewed_unverified",
    reviewer: {
      name: "OpenAI Codex repository operator",
      role: "Implementation-adjacent evidence reviewer",
      independenceBasis:
        "Not independent: the reviewer also operated the repository workflow, so this record cannot satisfy the second-reviewer gate."
    },
    checks: {
      artifactDigestsVerified: true,
      declarationBindingsVerified: true,
      deterministicCoreRecomputed: true,
      noWriteBoundaryVerified: true,
      publicRunOrderVerified: true,
      rubricRecomputed: true,
      secondReviewerIndependent: false
    },
    quality: { maximumPoints: 100, agentPoints: 100, manualPoints: 100 },
    sources: common.sources,
    limitations
  });
  return { pair, summary, selfReview };
}

interface BuildRunInput {
  readonly capture: z.output<typeof captureSchema>;
  readonly declaration: BenchmarkDeclaration;
  readonly method: BenchmarkMethod;
  readonly reviewedAtUtc: string;
  readonly sources: z.output<typeof sourceSchema>;
  readonly inputSha256: string;
  readonly configuration: TaskConfiguration;
}

function buildRun(input: BuildRunInput): BenchmarkRun {
  const methodKind = input.method.kind;
  const capturePath =
    methodKind === "agent" ? input.sources.agentCapturePath : input.sources.manualCapturePath;
  const outputArtifactId = `${methodKind}-output`;
  const inputArtifactId = `${methodKind}-shared-input`;
  const artifacts: BenchmarkArtifact[] = [
    {
      artifactId: outputArtifactId,
      role: "output",
      description: "Unedited canonical timed-lane output retained inside the immutable capture.",
      mediaType: input.capture.output.mediaType,
      sha256: input.capture.output.sha256,
      locator: { kind: "repository", path: capturePath }
    },
    {
      artifactId: inputArtifactId,
      role: "configuration",
      description: "Shared canonical frozen input payload used by both timed lanes.",
      mediaType: "application/json",
      sha256: input.inputSha256,
      locator: { kind: "repository", path: input.sources.inputPath }
    },
    ...input.capture.apiResponses.map((response, index) => ({
      artifactId: `${methodKind}-api-${index}`,
      role: "raw-receipt" as const,
      description: `Raw ${response.provider} response envelope retained inside the immutable capture.`,
      mediaType: "application/json",
      sha256: response.sha256,
      locator: { kind: "repository" as const, path: capturePath }
    }))
  ];
  if (input.capture.hireReceipt !== null) {
    artifacts.push({
      artifactId: "agent-hire-raw",
      role: "raw-receipt",
      description:
        "Verified pre-run ProofEra hire receipt retained for provenance and excluded from timed cost deltas.",
      mediaType: "application/json",
      sha256: input.capture.hireReceipt.rawReceiptSha256,
      locator: { kind: "repository", path: capturePath }
    });
  }
  const receipts: ReceiptReference[] = input.capture.apiResponses.map((response, index) => ({
    receiptId: `${methodKind}-api-receipt-${index}`,
    kind: "api",
    provider: response.provider,
    endpointUrl: response.endpointUrl,
    requestId: response.requestId,
    observedAtUtc: response.observedAtUtc,
    responseSha256: response.sha256,
    responseArtifactId: `${methodKind}-api-${index}`,
    verification: {
      state: "verified",
      verifiedAtUtc: input.reviewedAtUtc,
      verifier: SELF_REVIEWER,
      method:
        "Recomputed retained bytes and revalidated the task-specific frozen RPC or A2A response contract."
    }
  }));
  const costReceipt = receipts[0];
  if (costReceipt === undefined) throw new Error("TERMIX_OBSERVATIONAL_COST_SOURCE_MISSING");
  const scoreEvidence = [
    { kind: "artifact" as const, artifactId: outputArtifactId },
    { kind: "artifact" as const, artifactId: inputArtifactId },
    { kind: "receipt" as const, receiptId: costReceipt.receiptId }
  ];
  const scores = input.declaration.qualityRubric.criteria.map((criterion) => {
    const rationale = input.configuration.scoreRationales[criterion.criterionId];
    if (rationale === undefined) throw new Error("TERMIX_OBSERVATIONAL_RUBRIC_UNKNOWN");
    return {
      criterionId: criterion.criterionId,
      points: criterion.maximumPoints,
      rationale,
      evidence: scoreEvidence
    };
  });
  return {
    runId: input.capture.runId,
    declaration: input.declaration,
    method: input.method,
    timing: {
      startedAtUtc: input.capture.timing.startedAtUtc,
      endedAtUtc: input.capture.timing.endedAtUtc,
      monotonicDurationNanoseconds: input.capture.timing.monotonicDurationNanoseconds,
      monotonicClock: input.capture.timing.monotonicClock
    },
    costs: {
      state: "complete",
      reason: null,
      lineItems: [
        {
          costId: `${methodKind}-incremental-onchain-fee`,
          category: "gas",
          description:
            "Explicit zero incremental native-asset fee inside the timed read-only lane; human labor and the earlier marketplace hire are excluded.",
          amountMinorUnits: "0",
          denomination: {
            kind: "asset",
            chainId: input.configuration.costChainId,
            symbol: input.configuration.costSymbol,
            contractAddress: null,
            minorUnitDecimals: 18
          },
          incurredAtUtc: costReceipt.observedAtUtc,
          sources: [{ kind: "receipt", receiptId: costReceipt.receiptId }]
        }
      ]
    },
    artifacts,
    receipts,
    qualityAssessment: {
      assessedAtUtc: input.reviewedAtUtc,
      assessor: SELF_REVIEWER,
      scores
    },
    reproductionCommands: [
      {
        step: 1,
        workingDirectory: ".",
        command: "pnpm --filter @proofera/benchmarks test",
        expectedArtifactIds: [outputArtifactId, inputArtifactId]
      }
    ],
    limitations: [
      ...input.capture.limitations,
      "The normalized score is an implementation-adjacent deterministic self-review, not an independent adjudication.",
      `The capture is retained at ${capturePath}.`,
      `The operator procedure is retained at ${input.sources.operatorProcedurePath}.`,
      "Active segments remain in the raw capture; the pair schema compares full monotonic wall duration."
    ],
    evidenceState: {
      state: "unverified",
      reason:
        "A distinct independent reviewer has not reobserved receipts, reviewed the manual no-agent boundary and signed the exact pair digest."
    }
  };
}

interface ParsedRpcEnvelope {
  readonly request: {
    readonly id: string;
    readonly method: string;
    readonly params: readonly unknown[];
  };
  readonly rpcResponse: { readonly id: string; readonly result: unknown };
}

function parseRpcEnvelope(body: string): ParsedRpcEnvelope {
  const envelope = z
    .strictObject({ requestBody: z.string().min(1), responseBody: z.string().min(1) })
    .parse(parseJson(body, "TERMIX_OBSERVATIONAL_RPC_ENVELOPE_INVALID"));
  const request = z
    .strictObject({
      id: z.string().min(1),
      jsonrpc: z.literal("2.0"),
      method: z.string().min(1),
      params: z.array(z.unknown())
    })
    .parse(parseJson(envelope.requestBody, "TERMIX_OBSERVATIONAL_RPC_REQUEST_INVALID"));
  const rpcResponse = z
    .looseObject({ id: z.string().min(1), jsonrpc: z.literal("2.0"), result: z.unknown() })
    .parse(parseJson(envelope.responseBody, "TERMIX_OBSERVATIONAL_RPC_RESPONSE_INVALID"));
  if (request.id !== rpcResponse.id) throw new Error("TERMIX_OBSERVATIONAL_RPC_ID_MISMATCH");
  return { request, rpcResponse };
}

function parseJson(text: string, code: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(code);
  }
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function requiredInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("TERMIX_OBSERVATIONAL_INTEGER_INVALID");
  }
  return value;
}

function normalizedAddress(value: unknown): string | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/u.test(value)
    ? value.toLowerCase()
    : null;
}
