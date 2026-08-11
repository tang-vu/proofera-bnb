import { describe, expect, it } from "vitest";

import { canonicalJson, isCanonicalJsonText, sha256Bytes } from "./canonical.js";
import {
  benchmarkDeclarationSha256,
  summarizePairedBenchmark,
  validateInjectedTiming,
  validatePairedBenchmark
} from "./pair.js";
import {
  BENCHMARK_SCHEMA_VERSION,
  BenchmarkDeclarationSchema,
  BenchmarkRunSchema,
  PairedBenchmarkSchema,
  type BenchmarkDeclaration,
  type BenchmarkRun,
  type PairedBenchmark
} from "./schemas.js";

const TEST_ONLY_TX_HASH = `0x${"1".repeat(64)}`;

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Test setup is missing ${label}`);
  return value;
}

function declaration(): BenchmarkDeclaration {
  return BenchmarkDeclarationSchema.parse({
    benchmarkId: "fixture-lp-analysis",
    task: {
      taskId: "analyze-position",
      title: "Analyze one fixed LP position snapshot",
      domain: "trading",
      exactDefinition:
        "Given the supplied immutable snapshot, determine range state and document the bounded next step.",
      successCondition:
        "Return the required structured result without changing the supplied position."
    },
    inputs: [
      {
        inputId: "pool",
        description: "Fixture pool address",
        value: { encoding: "evm_address", value: `0x${"2".repeat(40)}` },
        unit: null
      },
      {
        inputId: "position",
        description: "Fixture position identifier",
        value: { encoding: "decimal_integer", value: "42" },
        unit: "uint256"
      }
    ],
    constraints: [
      {
        constraintId: "no-writes",
        description: "Do not submit a transaction.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      },
      {
        constraintId: "max-duration",
        description: "Complete within the fixed benchmark window.",
        enforcement: "scored",
        expected: { encoding: "decimal_integer", value: "300" }
      }
    ],
    environment: {
      kind: "fixture",
      chainId: 97,
      networkName: "BSC testnet fixture",
      softwareCommitSha: "a".repeat(40),
      components: [
        { name: "node", version: "24.14.1", configurationSha256: null },
        { name: "proofera", version: "0.1.0", configurationSha256: "b".repeat(64) }
      ],
      parameters: [
        {
          key: "snapshot-block",
          value: { encoding: "decimal_integer", value: "76543210" }
        }
      ]
    },
    qualityRubric: {
      rubricId: "lp-rubric",
      version: "1.0.0",
      declaredAtUtc: "2026-08-11T09:00:00.000Z",
      criteria: [
        {
          criterionId: "accuracy",
          description: "The range result matches the supplied ticks.",
          measurement: "Compare the structured output with the immutable snapshot.",
          evidenceRequired: "Hashed output and snapshot artifact.",
          maximumPoints: 60
        },
        {
          criterionId: "safety",
          description: "The method respects every hard constraint.",
          measurement: "Inspect the output and execution log.",
          evidenceRequired: "Hashed output and log artifact.",
          maximumPoints: 40
        }
      ],
      totalMaximumPoints: 100
    },
    requiredReceiptKinds: []
  });
}

function run(kind: "agent" | "manual"): BenchmarkRun {
  const isAgent = kind === "agent";
  const outputId = `${kind}-output`;
  const costId = `${kind}-cost-proof`;
  const qualityId = `${kind}-quality-proof`;
  return BenchmarkRunSchema.parse({
    runId: `${kind}-fixture-run`,
    declaration: declaration(),
    method: isAgent
      ? {
          kind: "agent",
          label: "ProofEra fixture agent",
          marketplace: "ProofEra",
          runtime: "fixture-runtime",
          configurationSha256: "c".repeat(64),
          agentReference: {
            state: "unregistered",
            reason: "Unit-test fixture; this is not a live marketplace identity."
          }
        }
      : {
          kind: "manual",
          label: "Manual fixture procedure",
          operatorRole: "Benchmark test operator",
          procedureVersion: "1.0.0",
          tools: [{ name: "fixture-cli", version: "1.0.0" }]
        },
    timing: {
      startedAtUtc: "2026-08-11T10:00:00.000Z",
      endedAtUtc: isAgent ? "2026-08-11T10:00:01.000Z" : "2026-08-11T10:00:02.500Z",
      monotonicDurationNanoseconds: isAgent ? "1000000000" : "2500000000",
      monotonicClock: "Injected fixture monotonic clock"
    },
    costs: {
      state: "complete",
      reason: null,
      lineItems: [
        {
          costId: `${kind}-recorded-cost`,
          category: isAgent ? "agent-fee" : "labor",
          description: "Test-only sourced cost value",
          amountMinorUnits: isAgent ? "900719925474099312345" : "900719925474099312355",
          denomination: { kind: "currency", currencyCode: "USD", minorUnitDecimals: 2 },
          incurredAtUtc: "2026-08-11T10:00:00.500Z",
          sources: [{ kind: "artifact", artifactId: costId }]
        }
      ]
    },
    artifacts: [
      {
        artifactId: outputId,
        role: "output",
        description: "Test-only benchmark output",
        mediaType: "application/json",
        sha256: (isAgent ? "d" : "e").repeat(64),
        locator: { kind: "repository", path: `test-fixtures/${kind}-output.json` }
      },
      {
        artifactId: costId,
        role: "quality-evidence",
        description: "Test-only cost source",
        mediaType: "application/json",
        sha256: (isAgent ? "f" : "1").repeat(64),
        locator: { kind: "repository", path: `test-fixtures/${kind}-cost.json` }
      },
      {
        artifactId: qualityId,
        role: "quality-evidence",
        description: "Test-only rubric evidence",
        mediaType: "application/json",
        sha256: (isAgent ? "2" : "3").repeat(64),
        locator: { kind: "repository", path: `test-fixtures/${kind}-quality.json` }
      }
    ],
    receipts: [],
    qualityAssessment: {
      assessedAtUtc: "2026-08-11T10:05:00.000Z",
      assessor: "Fixture assessor",
      scores: [
        {
          criterionId: "accuracy",
          points: isAgent ? 55 : 45,
          rationale: "Test-only score for deterministic aggregation.",
          evidence: [{ kind: "artifact", artifactId: outputId }]
        },
        {
          criterionId: "safety",
          points: isAgent ? 35 : 25,
          rationale: "Test-only score for deterministic aggregation.",
          evidence: [{ kind: "artifact", artifactId: qualityId }]
        }
      ]
    },
    reproductionCommands: [
      {
        step: 1,
        workingDirectory: "packages/benchmarks",
        command: `pnpm test -- --fixture-mode=${kind}`,
        expectedArtifactIds: [outputId]
      }
    ],
    limitations: ["Synthetic unit-test data; this is not a recorded TermiX benchmark result."],
    evidenceState: {
      state: "unverified",
      reason: "Synthetic unit-test evidence is intentionally not independently verified."
    }
  });
}

function pair(): PairedBenchmark {
  return PairedBenchmarkSchema.parse({
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    pairId: "fixture-agent-vs-manual",
    agentRun: run("agent"),
    manualRun: run("manual"),
    limitations: ["Synthetic unit-test pair; not publishable benchmark evidence."]
  });
}

function attachReceiptFixtures(target: PairedBenchmark): void {
  for (const current of [target.agentRun, target.manualRun]) {
    current.declaration.requiredReceiptKinds = ["transaction", "api"];
    const prefix = current.method.kind;
    const transactionArtifactId = `${prefix}-transaction-receipt`;
    const apiArtifactId = `${prefix}-api-receipt`;
    current.artifacts.push(
      {
        artifactId: transactionArtifactId,
        role: "raw-receipt",
        description: "Test-only raw transaction receipt",
        mediaType: "application/json",
        sha256: "4".repeat(64),
        locator: { kind: "repository", path: `test-fixtures/${prefix}-transaction.json` }
      },
      {
        artifactId: apiArtifactId,
        role: "raw-receipt",
        description: "Test-only raw API response",
        mediaType: "application/json",
        sha256: "5".repeat(64),
        locator: { kind: "repository", path: `test-fixtures/${prefix}-api.json` }
      }
    );
    current.receipts = [
      {
        receiptId: `${prefix}-transaction-reference`,
        kind: "transaction",
        chainId: 97,
        transactionHash: TEST_ONLY_TX_HASH,
        explorerUrl: `https://testnet.bscscan.com/tx/${TEST_ONLY_TX_HASH}`,
        observedAtUtc: "2026-08-11T10:00:00.750Z",
        rawReceiptArtifactId: transactionArtifactId,
        verification: { state: "unverified", reason: "Test-only receipt reference." }
      },
      {
        receiptId: `${prefix}-api-reference`,
        kind: "api",
        provider: "Fixture API",
        endpointUrl: "https://example.test/v1/fixture",
        requestId: `${prefix}-fixture-request`,
        observedAtUtc: "2026-08-11T10:00:00.750Z",
        responseSha256: "5".repeat(64),
        responseArtifactId: apiArtifactId,
        verification: { state: "unverified", reason: "Test-only receipt reference." }
      }
    ];
  }
}

function markReceiptFixturesVerified(target: PairedBenchmark): void {
  for (const current of [target.agentRun, target.manualRun]) {
    current.receipts = current.receipts.map((receipt) => ({
      ...receipt,
      verification: {
        state: "verified" as const,
        verifiedAtUtc: "2026-08-11T10:06:00.000Z",
        verifier: "Fixture verifier",
        method: "Compared the test-only reference with its raw artifact."
      }
    }));
    current.evidenceState = {
      state: "verified",
      reason: null,
      verifiedAtUtc: "2026-08-11T10:10:00.000Z",
      verifier: "Fixture verifier",
      method: "Validated the synthetic record against its test-only artifacts.",
      evidenceArtifactIds: [`${current.method.kind}-output`]
    };
  }
}

describe("canonical evidence helpers", () => {
  it("canonicalizes object keys and hashes supplied bytes without supplying values", () => {
    expect(canonicalJson({ z: 1, a: [true, "x"] })).toBe('{"a":[true,"x"],"z":1}');
    expect(sha256Bytes("fixture")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects ambiguous/non-canonical JSON and unsafe numeric precision", () => {
    expect(isCanonicalJsonText('{"b":2,"a":1}')).toBe(false);
    expect(isCanonicalJsonText('{"a":1,"b":2}')).toBe(true);
    expect(() => canonicalJson({ amount: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/safe integers/i);
  });
});

describe("paired declaration integrity", () => {
  it("treats ID-list order as irrelevant while retaining a stable digest", () => {
    const candidate = pair();
    candidate.manualRun.declaration.inputs.reverse();
    candidate.manualRun.declaration.constraints.reverse();
    candidate.manualRun.declaration.qualityRubric.criteria.reverse();

    expect(() => validatePairedBenchmark(candidate)).not.toThrow();
    expect(benchmarkDeclarationSha256(candidate.agentRun.declaration)).toBe(
      benchmarkDeclarationSha256(candidate.manualRun.declaration)
    );
  });

  it("rejects mismatched inputs between agent and manual runs", () => {
    const candidate = pair();
    candidate.manualRun.declaration.inputs[1] = {
      ...required(candidate.manualRun.declaration.inputs[1], "manual input"),
      value: { encoding: "decimal_integer", value: "43" }
    };
    const result = PairedBenchmarkSchema.safeParse(candidate);

    expect(result.success).toBe(false);
    expect(result.error?.issues.some(({ message }) => /same task, inputs/i.test(message))).toBe(
      true
    );
  });

  it("rejects a rubric changed after one side was run", () => {
    const candidate = pair();
    candidate.manualRun.declaration.qualityRubric.criteria[0] = {
      ...required(candidate.manualRun.declaration.qualityRubric.criteria[0], "rubric criterion"),
      measurement: "A different post-hoc measurement."
    };

    expect(PairedBenchmarkSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects a rubric declared after a run started", () => {
    const candidate = run("agent");
    candidate.declaration.qualityRubric.declaredAtUtc = "2026-08-11T10:00:00.001Z";

    expect(BenchmarkRunSchema.safeParse(candidate).success).toBe(false);
  });
});

describe("explicit evidence state and deterministic comparisons", () => {
  it("preserves exact bigint duration/cost deltas and never declares a winner", () => {
    const summary = summarizePairedBenchmark(pair());

    expect(summary.claimState).toBe("unverified");
    expect(summary.publishableClaim).toBe(false);
    expect(summary.duration?.manualMinusAgentNanoseconds).toBe("1500000000");
    expect(summary.costs?.[0]?.manualMinusAgentMinorUnits).toBe("10");
    expect(summary.quality).toEqual({
      maximumPoints: 100,
      agentPoints: 90,
      manualPoints: 70,
      agentMinusManualPoints: 20
    });
    expect(summary).not.toHaveProperty("winner");
  });

  it("returns null comparisons when a run is explicitly incomplete", () => {
    const candidate = pair();
    candidate.manualRun.timing.endedAtUtc = null;
    candidate.manualRun.timing.monotonicDurationNanoseconds = null;
    candidate.manualRun.costs = {
      state: "incomplete",
      reason: "Cost source has not been captured.",
      lineItems: []
    };
    candidate.manualRun.qualityAssessment = null;
    candidate.manualRun.evidenceState = {
      state: "incomplete",
      reason: "The manual fixture has not completed.",
      missingEvidence: ["duration", "costs", "quality-assessment"]
    };
    const summary = summarizePairedBenchmark(candidate);

    expect(summary.claimState).toBe("incomplete");
    expect(summary.duration).toBeNull();
    expect(summary.costs).toBeNull();
    expect(summary.quality).toBeNull();
  });

  it("requires explicit monotonic duration and never derives it from UTC timestamps", () => {
    const duration = "900719925474099312345";
    expect(
      validateInjectedTiming({
        startedAtUtc: "2026-08-11T10:00:00.000Z",
        endedAtUtc: "2026-08-11T10:00:01.000Z",
        monotonicDurationNanoseconds: duration,
        monotonicClock: "Injected test clock"
      }).monotonicDurationNanoseconds
    ).toBe(duration);

    expect(
      BenchmarkRunSchema.safeParse({
        ...run("agent"),
        timing: {
          startedAtUtc: "2026-08-11T10:00:00.000Z",
          endedAtUtc: "2026-08-11T10:00:01.000Z",
          monotonicDurationNanoseconds: null,
          monotonicClock: "Injected test clock"
        }
      }).success
    ).toBe(false);
  });
});

describe("receipt, artifact, cost, and scoring integrity", () => {
  it("rejects a complete run missing a declared receipt kind", () => {
    const candidate = run("agent");
    candidate.declaration.requiredReceiptKinds = ["transaction"];

    expect(BenchmarkRunSchema.safeParse(candidate).success).toBe(false);
  });

  it("accepts explicit unverified transaction/API references backed by raw artifacts", () => {
    const candidate = pair();
    attachReceiptFixtures(candidate);

    expect(validatePairedBenchmark(candidate).agentRun.receipts).toHaveLength(2);
    expect(summarizePairedBenchmark(candidate).claimState).toBe("unverified");
  });

  it("requires every receipt to be verified before a run can claim verified", () => {
    const candidate = pair();
    attachReceiptFixtures(candidate);
    candidate.agentRun.evidenceState = {
      state: "verified",
      reason: null,
      verifiedAtUtc: "2026-08-11T10:10:00.000Z",
      verifier: "Fixture verifier",
      method: "Fixture-only verification method.",
      evidenceArtifactIds: ["agent-output"]
    };

    expect(BenchmarkRunSchema.safeParse(candidate.agentRun).success).toBe(false);
  });

  it("marks a pair publishable only after both complete records and receipts are verified", () => {
    const candidate = pair();
    attachReceiptFixtures(candidate);
    markReceiptFixturesVerified(candidate);
    const summary = summarizePairedBenchmark(candidate);

    expect(summary.claimState).toBe("verified");
    expect(summary.publishableClaim).toBe(true);
  });

  it("rejects unsupported cost sources, missing receipt artifacts, and post-hoc rubric scores", () => {
    const unsupportedCost = run("agent");
    required(unsupportedCost.costs.lineItems[0], "cost line").sources = [
      { kind: "artifact", artifactId: "absent-cost-proof" }
    ];
    expect(BenchmarkRunSchema.safeParse(unsupportedCost).success).toBe(false);

    const missingReceiptArtifact = pair();
    attachReceiptFixtures(missingReceiptArtifact);
    missingReceiptArtifact.agentRun.artifacts = missingReceiptArtifact.agentRun.artifacts.filter(
      ({ artifactId }) => artifactId !== "agent-api-receipt"
    );
    expect(BenchmarkRunSchema.safeParse(missingReceiptArtifact.agentRun).success).toBe(false);

    const mismatchedApiDigest = pair();
    attachReceiptFixtures(mismatchedApiDigest);
    const apiReceipt = mismatchedApiDigest.agentRun.receipts.find(({ kind }) => kind === "api");
    if (apiReceipt?.kind !== "api") throw new Error("Test setup failed to create an API receipt");
    apiReceipt.responseSha256 = "6".repeat(64);
    expect(BenchmarkRunSchema.safeParse(mismatchedApiDigest.agentRun).success).toBe(false);

    const excessScore = run("agent");
    if (excessScore.qualityAssessment === null) {
      throw new Error("Test setup is missing a quality assessment");
    }
    required(excessScore.qualityAssessment.scores[0], "quality score").points = 61;
    expect(BenchmarkRunSchema.safeParse(excessScore).success).toBe(false);
  });

  it("rejects unknown fields rather than silently accepting hidden benchmark values", () => {
    expect(
      BenchmarkRunSchema.safeParse({ ...run("agent"), hiddenPerformanceClaim: "1000%" }).success
    ).toBe(false);
  });
});
