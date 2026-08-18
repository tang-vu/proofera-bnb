import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Bytes } from "./canonical.js";
import {
  PANCAKE_LP_INPUT_BUNDLE_SCHEMA_VERSION,
  PANCAKE_LP_SOURCE_EVIDENCE_RPC_ENDPOINT,
  PANCAKE_LP_SOURCE_RPC_ENDPOINT
} from "./pancakeLpAgentLane.js";
import {
  PANCAKE_LP_MANUAL_PROCEDURE_VERSION,
  runPancakeLpManualTermixMethod,
  type PancakeLpManualEvent
} from "./pancakeLpManualLane.js";
import {
  TERMIX_TIMED_RUNNER_PROTOCOL_VERSION,
  type TermixRunnerClock,
  type TermixTimedRunRequest
} from "./runner.js";
import {
  BenchmarkDeclarationSchema,
  normalizeBenchmarkDeclaration,
  type BenchmarkDeclaration
} from "./schemas.js";

const COMMIT = "a".repeat(40);
const POOL = "0x36696169c63e42cd08ce11f5deebbcebae652050";
const MANAGER = "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364";
const BLOCK_HASH = `0x${"b".repeat(64)}`;

const INPUT = canonicalJson({
  schemaVersion: PANCAKE_LP_INPUT_BUNDLE_SCHEMA_VERSION,
  sourceEvidence: {
    repositoryPath: "evidence/pancake/runs/public-position/116342186-7152618.json",
    sha256: "e".repeat(64),
    chainId: 56,
    blockNumber: "116342186",
    blockHash: BLOCK_HASH,
    rpcEndpointUrl: PANCAKE_LP_SOURCE_EVIDENCE_RPC_ENDPOINT,
    poolAddress: POOL,
    positionManagerAddress: MANAGER,
    positionId: "7152618",
    expectedCurrentTick: -64059
  },
  agentRequest: {
    skill: "analyze_lp_range",
    chainId: 56,
    poolAddress: POOL,
    positionManagerAddress: MANAGER,
    positionId: "7152618",
    observedAtBlock: "116342186",
    currentTick: -64059,
    lowerTick: -64060,
    upperTick: -64050,
    tickSpacing: 10
  }
});
const INPUT_SHA256 = sha256Bytes(INPUT);

function declaration(): BenchmarkDeclaration {
  return BenchmarkDeclarationSchema.parse({
    benchmarkId: "pancake-lp-public-position-v2",
    task: {
      taskId: "pancake-lp-range-decision",
      title: "Frozen public Pancake LP range decision",
      domain: "trading",
      exactDefinition: "Analyze one exact frozen public Pancake LP position without a write.",
      successCondition: "Return a source-bound bounded decision and limitations."
    },
    inputs: [
      {
        inputId: "lp-range-input-bundle-sha256",
        description: "SHA-256 of the shared canonical LP input bundle.",
        value: { encoding: "string", value: INPUT_SHA256 },
        unit: null
      }
    ],
    constraints: [
      {
        constraintId: "no-write",
        description: "No transaction may be submitted.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      }
    ],
    environment: {
      kind: "mainnet",
      chainId: 56,
      networkName: "BNB Smart Chain Mainnet data replay",
      softwareCommitSha: COMMIT,
      components: [{ name: "manual-worksheet", version: "1.0.0", configurationSha256: null }],
      parameters: []
    },
    qualityRubric: {
      rubricId: "pancake-lp-rubric-v2",
      version: "2.0.0",
      declaredAtUtc: "2026-08-17T00:00:00.000Z",
      criteria: [
        {
          criterionId: "accuracy",
          description: "Source-bound range calculation",
          measurement: "Recompute exact ticks and decision",
          evidenceRequired: "Raw input, RPC and output",
          maximumPoints: 100
        }
      ],
      totalMaximumPoints: 100
    },
    requiredReceiptKinds: ["api"]
  });
}

function request(): TermixTimedRunRequest {
  const frozen = declaration();
  return {
    protocolVersion: TERMIX_TIMED_RUNNER_PROTOCOL_VERSION,
    runId: "pancake-lp-manual-run-001",
    runnerId: "pancake-lp-manual-v1",
    declaration: frozen,
    declarationSha256: sha256Bytes(canonicalJson(normalizeBenchmarkDeclaration(frozen))),
    method: {
      kind: "manual",
      label: "Independent LP worksheet",
      operatorRole: "Benchmark operator",
      procedureVersion: PANCAKE_LP_MANUAL_PROCEDURE_VERSION,
      tools: [
        { name: "human-reviewed-canonical-json-worksheet", version: "1.0.0" },
        { name: "publicnode-bsc-mainnet-json-rpc", version: "eth-json-rpc" }
      ]
    },
    sourceCommitSha: COMMIT,
    repositoryClean: true,
    hireReceipt: null
  };
}

function abiWord(value: bigint): string {
  const encoded = value < 0n ? (1n << 256n) + value : value;
  return encoded.toString(16).padStart(64, "0");
}

function slot0Result(tick = -64059): string {
  return `0x${abiWord(1n)}${abiWord(BigInt(tick))}${abiWord(0n)}${abiWord(0n)}${abiWord(0n)}${abiWord(0n)}${abiWord(1n)}`;
}

function rpcRequest(id = "lp-manual-slot0") {
  return canonicalJson({
    id,
    jsonrpc: "2.0",
    method: "eth_call",
    params: [
      { data: "0x3850c7bd", to: POOL },
      { blockHash: BLOCK_HASH, requireCanonical: true }
    ]
  });
}

function rpcResponse(id = "lp-manual-slot0", tick = -64059) {
  return canonicalJson({ id, jsonrpc: "2.0", result: slot0Result(tick) });
}

function manualOutput(overrides: Readonly<Record<string, unknown>> = {}) {
  return canonicalJson({
    schemaVersion: "proofera-termix-pancake-lp-manual-output-v1.0.0",
    manualProcedureVersion: PANCAKE_LP_MANUAL_PROCEDURE_VERSION,
    operatorRole: "Benchmark operator",
    inputBundleSha256: INPUT_SHA256,
    agentInvoked: false,
    result: { decision: "insufficient_evidence", currentTick: -64059 },
    limitations: ["Fixture output; not benchmark evidence."],
    ...overrides
  });
}

async function* events(
  overrides: {
    readonly requestBody?: string;
    readonly responseBody?: string;
    readonly outputBody?: string;
  } = {}
): AsyncGenerator<PancakeLpManualEvent> {
  yield { event: "active_start", segmentId: "manual-review", description: "Manual LP review" };
  yield {
    event: "api_exchange",
    exchangeId: "lp-manual-slot0",
    endpointUrl: PANCAKE_LP_SOURCE_RPC_ENDPOINT,
    requestBody: overrides.requestBody ?? rpcRequest(),
    responseBody: overrides.responseBody ?? rpcResponse()
  };
  yield { event: "active_end", segmentId: "manual-review" };
  yield { event: "output", outputBody: overrides.outputBody ?? manualOutput() };
}

function clock(): TermixRunnerClock {
  const utc = [
    new Date("2026-08-17T01:00:00.000Z"),
    new Date("2026-08-17T01:00:00.500Z"),
    new Date("2026-08-17T01:00:01.000Z")
  ];
  const monotonic = [100n, 200n, 900n, 1_000n];
  return {
    monotonicClockLabel: "Injected process.hrtime.bigint fixture",
    utcNow: () => required(utc.shift()),
    monotonicNowNanoseconds: () => required(monotonic.shift())
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
}

describe("fixed Pancake LP manual TermiX lane", () => {
  it("records active operator time, one exact source exchange and unedited output", async () => {
    const capture = await runPancakeLpManualTermixMethod({
      request: request(),
      inputBundleCanonicalJson: INPUT,
      inputBundleSha256: INPUT_SHA256,
      events: events(),
      clock: clock()
    });
    expect(capture.methodKind).toBe("manual");
    expect(capture.output.body).toBe(manualOutput());
    expect(capture.apiResponses).toHaveLength(1);
    expect(capture.timing.activeDurationNanoseconds).toBe("700");
    expect(capture.hireReceipt).toBeNull();
  });

  it.each([
    ["wrong block hash", { requestBody: rpcRequest().replace(BLOCK_HASH, `0x${"c".repeat(64)}`) }],
    ["wrong response tick", { responseBody: rpcResponse("lp-manual-slot0", -64058) }],
    ["wrong response id", { responseBody: rpcResponse("another-id") }],
    ["output identity drift", { outputBody: manualOutput({ inputBundleSha256: "f".repeat(64) }) }],
    ["agent invocation claim", { outputBody: manualOutput({ agentInvoked: true }) }]
  ])("rejects %s", async (_label, override) => {
    await expect(
      runPancakeLpManualTermixMethod({
        request: request(),
        inputBundleCanonicalJson: INPUT,
        inputBundleSha256: INPUT_SHA256,
        events: events(override),
        clock: clock()
      })
    ).rejects.toThrow();
  });

  it("rejects an API exchange outside operator-active time", async () => {
    async function* invalidEvents(): AsyncGenerator<PancakeLpManualEvent> {
      yield {
        event: "api_exchange",
        exchangeId: "lp-manual-slot0",
        endpointUrl: PANCAKE_LP_SOURCE_RPC_ENDPOINT,
        requestBody: rpcRequest(),
        responseBody: rpcResponse()
      };
    }
    await expect(
      runPancakeLpManualTermixMethod({
        request: request(),
        inputBundleCanonicalJson: INPUT,
        inputBundleSha256: INPUT_SHA256,
        events: invalidEvents(),
        clock: clock()
      })
    ).rejects.toThrow("TERMIX_PANCAKE_LP_MANUAL_API_OUTSIDE_ACTIVE");
  });
});
