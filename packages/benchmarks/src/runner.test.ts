import { describe, expect, it, vi } from "vitest";

import { canonicalJson, sha256Bytes } from "./canonical.js";
import {
  TERMIX_TIMED_RUNNER_PROTOCOL_VERSION,
  runTermixTimedMethod,
  type TermixMethodExecution,
  type TermixRunnerClock,
  type TermixTimedRunRequest
} from "./runner.js";
import {
  BenchmarkDeclarationSchema,
  normalizeBenchmarkDeclaration,
  type BenchmarkDeclaration
} from "./schemas.js";

const COMMIT = "a".repeat(40);
const TX_HASH = `0x${"1".repeat(64)}`;
const RAW_RECEIPT = '{"status":"0x1"}';

function declaration(
  requiredReceiptKinds: ("api" | "transaction")[] = ["api"]
): BenchmarkDeclaration {
  return BenchmarkDeclarationSchema.parse({
    benchmarkId: "venus-health-live-v1",
    task: {
      taskId: "venus-health-factor-decision",
      title: "Frozen Venus health decision",
      domain: "lending",
      exactDefinition: "Analyze one exact frozen Venus evidence bundle without a write.",
      successCondition: "Return canonical calculations and a bounded decision."
    },
    inputs: [
      {
        inputId: "evidence-bundle",
        description: "Frozen exact-block evidence",
        value: { encoding: "string", value: "evidence/development/frozen.json" },
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
      parameters: [
        { key: "source-block", value: { encoding: "decimal_integer", value: "125469553" } }
      ]
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
    requiredReceiptKinds
  });
}

function request(kind: "agent" | "manual" = "agent"): TermixTimedRunRequest {
  const frozen = declaration();
  return {
    protocolVersion: TERMIX_TIMED_RUNNER_PROTOCOL_VERSION,
    runId: `venus-${kind}-run-001`,
    runnerId: kind === "agent" ? "venus-health-agent-v1" : "venus-health-manual-v1",
    declaration: frozen,
    declarationSha256: sha256Bytes(canonicalJson(normalizeBenchmarkDeclaration(frozen))),
    method:
      kind === "agent"
        ? {
            kind: "agent",
            label: "Registered Health Guardian",
            marketplace: "ProofEra",
            runtime: "BNB Agent Studio",
            configurationSha256: "b".repeat(64),
            agentReference: {
              state: "registered",
              standard: "ERC-8004",
              chainId: 97,
              registryAddress: `0x${"2".repeat(40)}`,
              agentId: "42",
              registrySourceUrl:
                "https://testnet.bscscan.com/address/0x2222222222222222222222222222222222222222"
            }
          }
        : {
            kind: "manual",
            label: "Frozen manual worksheet",
            operatorRole: "Benchmark operator",
            procedureVersion: "1.0.0",
            tools: [{ name: "node", version: "24.14.1" }]
          },
    sourceCommitSha: COMMIT,
    repositoryClean: true,
    hireReceipt:
      kind === "agent"
        ? {
            state: "verified",
            chainId: 97,
            transactionHash: TX_HASH,
            explorerUrl: `https://testnet.bscscan.com/tx/${TX_HASH}`,
            observedAtUtc: "2026-08-17T00:01:00.000Z",
            verifiedAtUtc: "2026-08-17T00:02:00.000Z",
            verifier: "Fixture verifier",
            verificationMethod: "Fixture receipt comparison",
            rawReceipt: RAW_RECEIPT,
            rawReceiptSha256: sha256Bytes(RAW_RECEIPT)
          }
        : null
  };
}

function clock(): TermixRunnerClock {
  const utc = [new Date("2026-08-17T01:00:00.000Z"), new Date("2026-08-17T01:00:02.000Z")];
  const monotonic = [100n, 2_000_000_100n];
  return {
    monotonicClockLabel: "Injected process.hrtime.bigint fixture",
    utcNow: () => {
      const value = utc.shift();
      if (value === undefined) throw new Error("Missing UTC fixture");
      return value;
    },
    monotonicNowNanoseconds: () => {
      const value = monotonic.shift();
      if (value === undefined) throw new Error("Missing monotonic fixture");
      return value;
    }
  };
}

function execution(): TermixMethodExecution {
  return {
    outputBody: '{"decision":"alert_only"}',
    outputMediaType: "application/json",
    apiResponses: [
      {
        receiptId: "venus-rpc-response",
        provider: "PublicNode",
        endpointUrl: "https://bsc-testnet-rpc.publicnode.com",
        requestId: "block-125469553",
        observedAtUtc: "2026-08-17T01:00:01.000Z",
        responseBody: '{"jsonrpc":"2.0","result":"0x01"}'
      }
    ],
    activeSegments: [
      {
        segmentId: "operator-review",
        description: "Reviewed the frozen output",
        startedAtNanoseconds: "100",
        endedAtNanoseconds: "1000000100"
      }
    ],
    limitations: ["Fixture execution; not benchmark evidence."]
  };
}

describe("TermiX fixed timed runner", () => {
  it("captures UTC, monotonic, active time and supplied artifact hashes", async () => {
    const capture = await runTermixTimedMethod({
      request: request(),
      clock: clock(),
      execute: async (context) => {
        expect(context.runnerId).toBe("venus-health-agent-v1");
        expect(context.runStartedAtUtc).toBe("2026-08-17T01:00:00.000Z");
        expect(context.runStartedAtNanoseconds).toBe("100");
        expect(sha256Bytes(context.declarationCanonicalJson)).toBe(request().declarationSha256);
        return execution();
      }
    });
    expect(capture.timing.monotonicDurationNanoseconds).toBe("2000000000");
    expect(capture.timing.activeDurationNanoseconds).toBe("1000000000");
    expect(capture.output.sha256).toBe(sha256Bytes('{"decision":"alert_only"}'));
    expect(capture.hireReceipt?.rawReceipt).toBe(RAW_RECEIPT);
    expect(capture.apiResponses[0]?.sha256).toBe(sha256Bytes('{"jsonrpc":"2.0","result":"0x01"}'));
    expect(capture.boundaries).toEqual({
      fixedRunnerLane: true,
      repositoryCommitMatched: true,
      repositoryWasCleanBeforeStart: true,
      declarationDigestMatched: true,
      agentWasRegisteredBeforeStart: true,
      hireReceiptWasVerifiedBeforeStart: true
    });
  });

  it("allows a fixed manual lane without consuming an agent receipt", async () => {
    const capture = await runTermixTimedMethod({
      request: request("manual"),
      clock: clock(),
      execute: async () => execution()
    });
    expect(capture.methodKind).toBe("manual");
    expect(capture.hireReceipt).toBeNull();
    expect(capture.boundaries.agentWasRegisteredBeforeStart).toBe(false);
  });

  it.each([
    [
      "dirty repository",
      (candidate: TermixTimedRunRequest) => ({ ...candidate, repositoryClean: false })
    ],
    [
      "wrong commit",
      (candidate: TermixTimedRunRequest) => ({ ...candidate, sourceCommitSha: "c".repeat(40) })
    ],
    [
      "wrong declaration digest",
      (candidate: TermixTimedRunRequest) => ({ ...candidate, declarationSha256: "d".repeat(64) })
    ],
    [
      "wrong fixed lane",
      (candidate: TermixTimedRunRequest) => ({ ...candidate, runnerId: "pancake-lp-agent-v1" })
    ],
    [
      "missing hire receipt",
      (candidate: TermixTimedRunRequest) => ({ ...candidate, hireReceipt: null })
    ],
    [
      "unregistered agent",
      (candidate: TermixTimedRunRequest) => ({
        ...candidate,
        method: {
          kind: "agent" as const,
          label: "Unregistered fixture",
          marketplace: "ProofEra" as const,
          runtime: "fixture",
          configurationSha256: "b".repeat(64),
          agentReference: { state: "unregistered" as const, reason: "Missing live registration" }
        }
      })
    ]
  ])("rejects %s before invoking the executor", async (_label, mutate) => {
    const execute = vi.fn(async () => execution());
    await expect(
      runTermixTimedMethod({ request: mutate(request()), clock: clock(), execute })
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a changed receipt body, missing API receipt, and invalid active segments", async () => {
    const badReceipt = request();
    if (badReceipt.hireReceipt === null) throw new Error("Missing fixture receipt");
    badReceipt.hireReceipt.rawReceipt = "changed";
    const receiptExecutor = vi.fn(async () => execution());
    await expect(
      runTermixTimedMethod({ request: badReceipt, clock: clock(), execute: receiptExecutor })
    ).rejects.toThrow();
    expect(receiptExecutor).not.toHaveBeenCalled();

    await expect(
      runTermixTimedMethod({
        request: request(),
        clock: clock(),
        execute: async () => ({ ...execution(), apiResponses: [] })
      })
    ).rejects.toThrow("TERMIX_REQUIRED_API_RECEIPT_MISSING");

    await expect(
      runTermixTimedMethod({
        request: request(),
        clock: clock(),
        execute: async () => ({
          ...execution(),
          activeSegments: [
            {
              segmentId: "outside-window",
              description: "Invalid fixture",
              startedAtNanoseconds: "0",
              endedAtNanoseconds: "10"
            }
          ]
        })
      })
    ).rejects.toThrow("TERMIX_ACTIVE_SEGMENT_INVALID");

    await expect(
      runTermixTimedMethod({
        request: request(),
        clock: clock(),
        execute: async () => {
          const base = execution();
          const response = base.apiResponses.at(0);
          if (response === undefined) throw new Error("Missing fixture response");
          return {
            ...base,
            apiResponses: [{ ...response, observedAtUtc: "2026-08-17T00:59:59.000Z" }]
          };
        }
      })
    ).rejects.toThrow("TERMIX_API_RECEIPT_OUTSIDE_TIMED_WINDOW");
  });
});
