import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Bytes } from "./canonical.js";
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
import {
  VENUS_HEALTH_MANUAL_PROCEDURE_VERSION,
  runVenusHealthManualTermixMethod,
  type VenusHealthManualEvent
} from "./venusHealthManualLane.js";

const COMMIT = "a".repeat(40);
const REQUEST_SHA256 = "b".repeat(64);
type ManualMethod = Extract<TermixTimedRunRequest["method"], { kind: "manual" }>;

function declaration(requestDigest = REQUEST_SHA256): BenchmarkDeclaration {
  return BenchmarkDeclarationSchema.parse({
    benchmarkId: "venus-health-live-v1",
    task: {
      taskId: "venus-health-factor-decision",
      title: "Frozen Venus health decision",
      domain: "lending",
      exactDefinition: "Manually analyze one exact frozen Venus evidence bundle without a write.",
      successCondition: "Return canonical calculations and a bounded decision."
    },
    inputs: [
      {
        inputId: "health-factor-request-sha256",
        description: "SHA-256 of the canonical request supplied to both methods.",
        value: { encoding: "string", value: requestDigest },
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
      kind: "testnet",
      chainId: 97,
      networkName: "BNB Smart Chain Testnet",
      softwareCommitSha: COMMIT,
      components: [{ name: "node", version: "24.14.1", configurationSha256: null }],
      parameters: []
    },
    qualityRubric: {
      rubricId: "venus-health-rubric",
      version: "1.0.0",
      declaredAtUtc: "2026-08-17T00:00:00.000Z",
      criteria: [
        {
          criterionId: "accuracy",
          description: "Exact integer calculation",
          measurement: "Recompute from raw state",
          evidenceRequired: "Raw and canonical outputs",
          maximumPoints: 100
        }
      ],
      totalMaximumPoints: 100
    },
    requiredReceiptKinds: ["api"]
  });
}

function request(overrides: Partial<Omit<ManualMethod, "kind">> = {}): TermixTimedRunRequest {
  const frozen = declaration();
  return {
    protocolVersion: TERMIX_TIMED_RUNNER_PROTOCOL_VERSION,
    runId: "venus-manual-run-001",
    runnerId: "venus-health-manual-v1",
    declaration: frozen,
    declarationSha256: sha256Bytes(canonicalJson(normalizeBenchmarkDeclaration(frozen))),
    method: {
      kind: "manual",
      label: "Frozen manual worksheet",
      operatorRole: "Declared benchmark operator",
      procedureVersion: VENUS_HEALTH_MANUAL_PROCEDURE_VERSION,
      tools: [
        { name: "human-reviewed-canonical-json-worksheet", version: "1.0.0" },
        { name: "official-bsc-testnet-json-rpc", version: "eth-json-rpc" }
      ],
      ...overrides
    },
    sourceCommitSha: COMMIT,
    repositoryClean: true,
    hireReceipt: null
  };
}

function clock(): TermixRunnerClock {
  const utc = [
    new Date("2026-08-17T01:00:00.000Z"),
    new Date("2026-08-17T01:00:01.000Z"),
    new Date("2026-08-17T01:00:02.000Z")
  ];
  const monotonic = [100n, 200n, 900n, 1_000n];
  return {
    monotonicClockLabel: "Injected process.hrtime.bigint fixture",
    utcNow: () => required(utc.shift()),
    monotonicNowNanoseconds: () => required(monotonic.shift())
  };
}

function manualOutput(overrides: Readonly<Record<string, unknown>> = {}): string {
  return canonicalJson({
    agentInvoked: false,
    limitations: ["Fixture manual output; not benchmark evidence."],
    manualProcedureVersion: VENUS_HEALTH_MANUAL_PROCEDURE_VERSION,
    operatorRole: "Declared benchmark operator",
    requestInputSha256: REQUEST_SHA256,
    result: { decision: "hold", healthFactorE18Raw: "1600000000000000000" },
    schemaVersion: "proofera-termix-venus-health-manual-output-v1.0.0",
    ...overrides
  });
}

function successfulEvents(): VenusHealthManualEvent[] {
  return [
    {
      event: "active_start",
      segmentId: "manual-calculation",
      description: "Operator reviewed the frozen request and calculated the result"
    },
    {
      event: "api_exchange",
      exchangeId: "rpc-chain-id",
      endpointUrl: "https://bsc-testnet-rpc.publicnode.com",
      requestBody: '{"jsonrpc":"2.0","id":"rpc-chain-id","method":"eth_chainId","params":[]}',
      responseBody: '{"jsonrpc":"2.0","id":"rpc-chain-id","result":"0x61"}'
    },
    { event: "active_end", segmentId: "manual-calculation" },
    { event: "output", outputBody: manualOutput() }
  ];
}

async function* eventStream(events: readonly unknown[], onRead?: () => void) {
  for (const event of events) {
    onRead?.();
    yield event;
  }
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture clock value");
  return value;
}

describe("fixed Venus Health manual TermiX lane", () => {
  it("timestamps active work and retains exact read-only RPC exchange bytes", async () => {
    const capture = await runVenusHealthManualTermixMethod({
      request: request(),
      requestInputSha256: REQUEST_SHA256,
      events: eventStream(successfulEvents()),
      clock: clock()
    });

    expect(capture.methodKind).toBe("manual");
    expect(capture.hireReceipt).toBeNull();
    expect(capture.timing.activeDurationNanoseconds).toBe("700");
    expect(capture.output.body).toBe(manualOutput());
    expect(capture.apiResponses[0]?.body).toBe(
      canonicalJson({
        requestBody: '{"jsonrpc":"2.0","id":"rpc-chain-id","method":"eth_chainId","params":[]}',
        responseBody: '{"jsonrpc":"2.0","id":"rpc-chain-id","result":"0x61"}'
      })
    );
    expect(capture.boundaries.agentWasRegisteredBeforeStart).toBe(false);
    expect(capture.boundaries.hireReceiptWasVerifiedBeforeStart).toBe(false);
  });

  it("rejects procedure, tool and request drift before consuming operator events", async () => {
    for (const candidate of [
      request({ procedureVersion: "changed-procedure" }),
      request({ tools: [{ name: "browser-agent", version: "1" }] })
    ]) {
      let reads = 0;
      await expect(
        runVenusHealthManualTermixMethod({
          request: candidate,
          requestInputSha256: REQUEST_SHA256,
          events: eventStream(successfulEvents(), () => {
            reads += 1;
          }),
          clock: clock()
        })
      ).rejects.toThrow();
      expect(reads).toBe(0);
    }

    const mismatched = request();
    mismatched.declaration = declaration("c".repeat(64));
    mismatched.declarationSha256 = sha256Bytes(
      canonicalJson(normalizeBenchmarkDeclaration(mismatched.declaration))
    );
    let reads = 0;
    await expect(
      runVenusHealthManualTermixMethod({
        request: mismatched,
        requestInputSha256: REQUEST_SHA256,
        events: eventStream(successfulEvents(), () => {
          reads += 1;
        }),
        clock: clock()
      })
    ).rejects.toThrow("TERMIX_VENUS_MANUAL_REQUEST_BINDING_MISMATCH");
    expect(reads).toBe(0);
  });

  it.each([
    [
      "write RPC method",
      () => {
        const events = successfulEvents();
        events[1] = {
          ...required(events[1]),
          event: "api_exchange",
          requestBody:
            '{"jsonrpc":"2.0","id":"rpc-chain-id","method":"eth_sendRawTransaction","params":["0x00"]}'
        } as VenusHealthManualEvent;
        return events;
      }
    ],
    [
      "agent endpoint",
      () => {
        const events = successfulEvents();
        events[1] = {
          ...required(events[1]),
          endpointUrl: "https://proofera-health.tangvu.dev/"
        } as unknown as VenusHealthManualEvent;
        return events;
      }
    ],
    [
      "mismatched RPC response",
      () => {
        const events = successfulEvents();
        events[1] = {
          ...required(events[1]),
          responseBody: '{"jsonrpc":"2.0","id":"another-id","result":"0x61"}'
        } as VenusHealthManualEvent;
        return events;
      }
    ],
    [
      "nested active segment",
      () => [successfulEvents()[0], successfulEvents()[0], ...successfulEvents().slice(1)]
    ],
    [
      "API outside active work",
      () => [successfulEvents()[1], successfulEvents()[0], ...successfulEvents().slice(2)]
    ],
    [
      "event after output",
      () => [...successfulEvents(), { event: "active_end", segmentId: "manual-calculation" }]
    ]
  ])("rejects %s", async (_label, buildEvents) => {
    await expect(
      runVenusHealthManualTermixMethod({
        request: request(),
        requestInputSha256: REQUEST_SHA256,
        events: eventStream(buildEvents()),
        clock: clock()
      })
    ).rejects.toThrow();
  });

  it("rejects output identity drift and missing required event classes", async () => {
    const outputDrift = successfulEvents();
    outputDrift[3] = {
      event: "output",
      outputBody: manualOutput({ agentInvoked: true })
    };
    await expect(
      runVenusHealthManualTermixMethod({
        request: request(),
        requestInputSha256: REQUEST_SHA256,
        events: eventStream(outputDrift),
        clock: clock()
      })
    ).rejects.toThrow();

    for (const events of [
      successfulEvents().filter(({ event }) => event !== "api_exchange"),
      successfulEvents().filter(({ event }) => !event.startsWith("active_")),
      successfulEvents().filter(({ event }) => event !== "output")
    ]) {
      await expect(
        runVenusHealthManualTermixMethod({
          request: request(),
          requestInputSha256: REQUEST_SHA256,
          events: eventStream(events),
          clock: clock()
        })
      ).rejects.toThrow();
    }
  });
});
