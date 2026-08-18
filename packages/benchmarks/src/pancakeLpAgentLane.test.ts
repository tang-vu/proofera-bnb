import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

import { canonicalJson, sha256Bytes } from "./canonical.js";
import {
  PANCAKE_LP_AGENT_ENDPOINT,
  PANCAKE_LP_AGENT_LANE_CONFIGURATION_SHA256,
  PANCAKE_LP_INPUT_BUNDLE_SCHEMA_VERSION,
  PANCAKE_LP_SOURCE_EVIDENCE_RPC_ENDPOINT,
  PANCAKE_LP_SOURCE_RPC_ENDPOINT,
  PancakeLpInputBundleSchema,
  decodeSlot0Tick,
  runPancakeLpAgentTermixMethod,
  type PancakeLpLaneFetch,
  type PancakeLpLaneHttpResponse
} from "./pancakeLpAgentLane.js";
import {
  TERMIX_AGENT_REGISTRY_CHAIN_PARAMETER,
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
const TX_HASH = `0x${"1".repeat(64)}`;
const RAW_HIRE_RECEIPT = '{"status":"0x1"}';
const POOL = "0x36696169c63e42cd08ce11f5deebbcebae652050";
const MANAGER = "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364";
const BLOCK_HASH = `0x${"b".repeat(64)}`;

function bundle() {
  return {
    schemaVersion: PANCAKE_LP_INPUT_BUNDLE_SCHEMA_VERSION,
    sourceEvidence: {
      repositoryPath: "evidence/pancake/runs/public-position/116342186-7152618.json",
      sha256: "e".repeat(64),
      chainId: 56 as const,
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
  };
}

const INPUT = canonicalJson(bundle());
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
      components: [
        {
          name: "proofera-lp-range-agent",
          version: "1.0.0",
          configurationSha256: PANCAKE_LP_AGENT_LANE_CONFIGURATION_SHA256
        }
      ],
      parameters: [
        {
          key: TERMIX_AGENT_REGISTRY_CHAIN_PARAMETER,
          value: { encoding: "decimal_integer", value: "97" }
        },
        {
          key: "lp-agent-endpoint",
          value: { encoding: "string", value: PANCAKE_LP_AGENT_ENDPOINT }
        },
        {
          key: "lp-source-rpc-endpoint",
          value: { encoding: "string", value: PANCAKE_LP_SOURCE_RPC_ENDPOINT }
        }
      ]
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
    runId: "pancake-lp-agent-run-001",
    runnerId: "pancake-lp-agent-v1",
    declaration: frozen,
    declarationSha256: sha256Bytes(canonicalJson(normalizeBenchmarkDeclaration(frozen))),
    method: {
      kind: "agent",
      label: "Registered ProofEra LP agent",
      marketplace: "ProofEra",
      runtime: "BNB Agent Studio",
      configurationSha256: PANCAKE_LP_AGENT_LANE_CONFIGURATION_SHA256,
      agentReference: {
        state: "registered",
        standard: "ERC-8004",
        chainId: 97,
        registryAddress: `0x${"2".repeat(40)}`,
        agentId: "42",
        registrySourceUrl: `https://testnet.bscscan.com/address/0x${"2".repeat(40)}`
      }
    },
    sourceCommitSha: COMMIT,
    repositoryClean: true,
    hireReceipt: {
      state: "verified",
      chainId: 97,
      transactionHash: TX_HASH,
      explorerUrl: `https://testnet.bscscan.com/tx/${TX_HASH}`,
      observedAtUtc: "2026-08-17T00:01:00.000Z",
      verifiedAtUtc: "2026-08-17T00:02:00.000Z",
      verifier: "Fixture verifier",
      verificationMethod: "Fixture receipt comparison",
      rawReceipt: RAW_HIRE_RECEIPT,
      rawReceiptSha256: sha256Bytes(RAW_HIRE_RECEIPT)
    }
  };
}

function clock(): TermixRunnerClock {
  const utc = [
    new Date("2026-08-17T01:00:00.000Z"),
    new Date("2026-08-17T01:00:00.300Z"),
    new Date("2026-08-17T01:00:00.800Z"),
    new Date("2026-08-17T01:00:01.000Z")
  ];
  const monotonic = [100n, 200n, 300n, 400n, 900n, 1_000n];
  return {
    monotonicClockLabel: "Injected process.hrtime.bigint fixture",
    utcNow: () => required(utc.shift()),
    monotonicNowNanoseconds: () => required(monotonic.shift())
  };
}

function abiWord(value: bigint): string {
  const encoded = value < 0n ? (1n << 256n) + value : value;
  return encoded.toString(16).padStart(64, "0");
}

function slot0Result(tick = -64059): string {
  return `0x${abiWord(1n)}${abiWord(BigInt(tick))}${abiWord(0n)}${abiWord(0n)}${abiWord(0n)}${abiWord(0n)}${abiWord(1n)}`;
}

function agentOutput(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    chainId: 56,
    poolAddress: POOL,
    positionManagerAddress: MANAGER,
    positionId: "7152618",
    observedAtBlock: "116342186",
    currentTick: -64059,
    lowerTick: -64060,
    upperTick: -64050,
    tickSpacing: 10,
    decision: "insufficient_evidence",
    executionEnabled: false,
    ...overrides
  };
}

function response(body: string, status = 200): PancakeLpLaneHttpResponse {
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    text: async () => body
  };
}

function fetchFixture(
  agentOverrides: Readonly<Record<string, unknown>> = {},
  rpcTick = -64059
): PancakeLpLaneFetch {
  return async (url, init) => {
    const requestBody = JSON.parse(init.body) as { id: string };
    if (url === PANCAKE_LP_SOURCE_RPC_ENDPOINT) {
      return response(
        JSON.stringify({ jsonrpc: "2.0", id: requestBody.id, result: slot0Result(rpcTick) })
      );
    }
    return response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: requestBody.id,
        result: {
          kind: "message",
          role: "agent",
          messageId: "lp-result-1",
          parts: [{ kind: "data", data: agentOutput(agentOverrides) }]
        }
      })
    );
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
}

describe("fixed Pancake LP Agent TermiX lane", () => {
  it("binds the committed compact input to the retained public-position evidence", async () => {
    const inputUrl = new URL(
      "../../../evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json",
      import.meta.url
    );
    const rawInput = await readFile(inputUrl, "utf8");
    expect(rawInput.endsWith("\n")).toBe(true);
    const canonicalInput = rawInput.slice(0, -1);
    expect(sha256Bytes(canonicalInput)).toBe(
      "3459eb2566621c4d74acef68c84849e59b74214c7a21d7d20b8bbc6352dda945"
    );
    const parsed = PancakeLpInputBundleSchema.parse(JSON.parse(canonicalInput) as unknown);
    const evidenceUrl = new URL(
      `../../../${parsed.sourceEvidence.repositoryPath}`,
      import.meta.url
    );
    const evidenceBytes = await readFile(evidenceUrl, "utf8");
    expect(sha256Bytes(evidenceBytes)).toBe(parsed.sourceEvidence.sha256);
    const evidence = JSON.parse(evidenceBytes) as {
      agent: { requestBody: string };
      exactState: { currentTick: number };
      source: { blockHash: string; blockNumber: string; positionId: string };
    };
    const originalRequest = JSON.parse(evidence.agent.requestBody) as {
      params: { message: { parts: Array<{ data: unknown }> } };
    };
    expect(parsed.agentRequest).toEqual(originalRequest.params.message.parts[0]?.data);
    expect(parsed.sourceEvidence).toMatchObject({
      blockHash: evidence.source.blockHash,
      blockNumber: evidence.source.blockNumber,
      expectedCurrentTick: evidence.exactState.currentTick,
      positionId: evidence.source.positionId
    });
  });

  it("captures one exact source RPC response and one public A2A response", async () => {
    const fetchRequest = vi.fn(fetchFixture());
    const capture = await runPancakeLpAgentTermixMethod({
      request: request(),
      inputBundleCanonicalJson: INPUT,
      inputBundleSha256: INPUT_SHA256,
      clock: clock(),
      fetch: fetchRequest
    });
    expect(fetchRequest).toHaveBeenCalledTimes(2);
    expect(fetchRequest.mock.calls.map(([url]) => url)).toEqual([
      PANCAKE_LP_SOURCE_RPC_ENDPOINT,
      PANCAKE_LP_AGENT_ENDPOINT
    ]);
    expect(capture.output.body).toBe(canonicalJson(agentOutput()));
    expect(capture.apiResponses).toHaveLength(2);
    expect(capture.timing.activeDurationNanoseconds).toBe("600");
    expect(capture.boundaries.agentWasRegisteredBeforeStart).toBe(true);
    expect(capture.boundaries.hireReceiptWasVerifiedBeforeStart).toBe(true);
  });

  it("does not contact either endpoint before registration and hire gates pass", async () => {
    const candidate = request();
    candidate.hireReceipt = null;
    const fetchRequest = vi.fn(fetchFixture());
    await expect(
      runPancakeLpAgentTermixMethod({
        request: candidate,
        inputBundleCanonicalJson: INPUT,
        inputBundleSha256: INPUT_SHA256,
        clock: clock(),
        fetch: fetchRequest
      })
    ).rejects.toThrow();
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("rejects source drift before invoking the agent", async () => {
    const fetchRequest = vi.fn(fetchFixture({}, -64058));
    await expect(
      runPancakeLpAgentTermixMethod({
        request: request(),
        inputBundleCanonicalJson: INPUT,
        inputBundleSha256: INPUT_SHA256,
        clock: clock(),
        fetch: fetchRequest
      })
    ).rejects.toThrow("TERMIX_PANCAKE_LP_RPC_STATE_MISMATCH");
    expect(fetchRequest).toHaveBeenCalledOnce();
  });

  it("classifies a pruned archive response without exposing schema internals", async () => {
    const fetchRequest: PancakeLpLaneFetch = async (_url, init) => {
      const requestBody = JSON.parse(init.body) as { id: string };
      return response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: requestBody.id,
          error: { code: -32603, message: "state is pruned" }
        })
      );
    };
    await expect(
      runPancakeLpAgentTermixMethod({
        request: request(),
        inputBundleCanonicalJson: INPUT,
        inputBundleSha256: INPUT_SHA256,
        clock: clock(),
        fetch: fetchRequest
      })
    ).rejects.toThrow("TERMIX_PANCAKE_LP_RPC_RESPONSE_INVALID");
  });

  it.each([
    ["execution widening", { executionEnabled: true }],
    ["position drift", { positionId: "7152619" }],
    ["tick drift", { currentTick: -64058 }]
  ])("rejects agent %s", async (_label, outputOverride) => {
    await expect(
      runPancakeLpAgentTermixMethod({
        request: request(),
        inputBundleCanonicalJson: INPUT,
        inputBundleSha256: INPUT_SHA256,
        clock: clock(),
        fetch: fetchFixture(outputOverride)
      })
    ).rejects.toThrow();
  });

  it("rejects input digest drift before network access", async () => {
    const fetchRequest = vi.fn(fetchFixture());
    await expect(
      runPancakeLpAgentTermixMethod({
        request: request(),
        inputBundleCanonicalJson: INPUT,
        inputBundleSha256: "f".repeat(64),
        clock: clock(),
        fetch: fetchRequest
      })
    ).rejects.toThrow("TERMIX_PANCAKE_LP_INPUT_DIGEST_MISMATCH");
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("decodes canonical positive and negative int24 ticks only", () => {
    expect(decodeSlot0Tick(slot0Result(-64059))).toBe(-64059);
    expect(decodeSlot0Tick(slot0Result(42))).toBe(42);
    expect(() => decodeSlot0Tick(`0x${abiWord(1n)}${"0".repeat(58)}ffffff`)).toThrow();
  });
});
