import { describe, expect, it, vi } from "vitest";

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
  VENUS_HEALTH_AGENT_ENDPOINT,
  VENUS_HEALTH_AGENT_LANE_CONFIGURATION_SHA256,
  runVenusHealthAgentTermixMethod,
  type VenusHealthAgentLaneFetch,
  type VenusHealthAgentLaneHttpResponse
} from "./venusHealthAgentLane.js";

const COMMIT = "a".repeat(40);
const TX_HASH = `0x${"1".repeat(64)}`;
const RAW_HIRE_RECEIPT = '{"status":"0x1"}';
const REQUEST_BODY = canonicalJson({
  account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  analysisAtUtc: "2026-08-17T01:00:00.000Z",
  chainId: 97,
  skill: "analyze_venus_health_factor"
});
const REQUEST_SHA256 = sha256Bytes(REQUEST_BODY);

function declaration(): BenchmarkDeclaration {
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
        inputId: "health-factor-request-sha256",
        description: "SHA-256 of the canonical request supplied to both methods.",
        value: { encoding: "string", value: REQUEST_SHA256 },
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
      components: [
        {
          name: "proofera-health-factor-guardian",
          version: "1.3.0",
          configurationSha256: VENUS_HEALTH_AGENT_LANE_CONFIGURATION_SHA256
        }
      ],
      parameters: [
        {
          key: "health-agent-endpoint",
          value: { encoding: "string", value: VENUS_HEALTH_AGENT_ENDPOINT }
        }
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
    requiredReceiptKinds: ["api"]
  });
}

function request(): TermixTimedRunRequest {
  const frozen = declaration();
  return {
    protocolVersion: TERMIX_TIMED_RUNNER_PROTOCOL_VERSION,
    runId: "venus-agent-run-001",
    runnerId: "venus-health-agent-v1",
    declaration: frozen,
    declarationSha256: sha256Bytes(canonicalJson(normalizeBenchmarkDeclaration(frozen))),
    method: {
      kind: "agent",
      label: "Registered Health Guardian",
      marketplace: "ProofEra",
      runtime: "BNB Agent Studio",
      configurationSha256: VENUS_HEALTH_AGENT_LANE_CONFIGURATION_SHA256,
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

function responseBody(
  id = "venus-agent-run-001-health-a2a",
  dataOverrides: Readonly<Record<string, unknown>> = {},
  includeSecondPart = false
): string {
  const data = {
    decision: "hold",
    sourceContentsVerified: false,
    freshnessAttestedByAgent: false,
    marketplaceEligible: false,
    activationEligible: false,
    executionEnabled: false,
    ...dataOverrides
  };
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    result: {
      kind: "message",
      role: "agent",
      messageId: "health-result-1",
      parts: [{ kind: "data", data }, ...(includeSecondPart ? [{ kind: "data", data }] : [])]
    }
  });
}

function httpResponse(
  body = responseBody(),
  overrides: Partial<VenusHealthAgentLaneHttpResponse> = {}
) {
  return {
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null)
    },
    text: async () => body,
    ...overrides
  } satisfies VenusHealthAgentLaneHttpResponse;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
}

describe("fixed Venus Health Agent TermiX lane", () => {
  it("captures one exact public A2A response after every outer eligibility gate", async () => {
    const fetchRequest = vi.fn<VenusHealthAgentLaneFetch>(async () => httpResponse());
    const capture = await runVenusHealthAgentTermixMethod({
      request: request(),
      requestInputCanonicalJson: REQUEST_BODY,
      requestInputSha256: REQUEST_SHA256,
      clock: clock(),
      fetch: fetchRequest
    });

    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(fetchRequest.mock.calls[0]?.[0]).toBe(VENUS_HEALTH_AGENT_ENDPOINT);
    expect(fetchRequest.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { accept: "application/json", "content-type": "application/json" }
    });
    expect(capture.output.body).toBe(
      canonicalJson({
        activationEligible: false,
        decision: "hold",
        executionEnabled: false,
        freshnessAttestedByAgent: false,
        marketplaceEligible: false,
        sourceContentsVerified: false
      })
    );
    expect(capture.apiResponses[0]?.body).toBe(responseBody());
    expect(capture.apiResponses[0]?.sha256).toBe(sha256Bytes(responseBody()));
    expect(capture.timing.activeDurationNanoseconds).toBe("700");
    expect(capture.boundaries.agentWasRegisteredBeforeStart).toBe(true);
    expect(capture.boundaries.hireReceiptWasVerifiedBeforeStart).toBe(true);
  });

  it("does not contact the agent when registration or hire evidence is absent", async () => {
    const unregistered = request();
    unregistered.method = {
      kind: "agent",
      label: "Unregistered guardian",
      marketplace: "ProofEra",
      runtime: "BNB Agent Studio",
      configurationSha256: VENUS_HEALTH_AGENT_LANE_CONFIGURATION_SHA256,
      agentReference: { state: "unregistered", reason: "No finalized identity receipt" }
    };
    unregistered.hireReceipt = null;
    const fetchRequest = vi.fn<VenusHealthAgentLaneFetch>(async () => httpResponse());

    await expect(
      runVenusHealthAgentTermixMethod({
        request: unregistered,
        requestInputCanonicalJson: REQUEST_BODY,
        requestInputSha256: REQUEST_SHA256,
        clock: clock(),
        fetch: fetchRequest
      })
    ).rejects.toThrow();
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("rejects request and declaration binding drift before the HTTP call", async () => {
    const fetchRequest = vi.fn<VenusHealthAgentLaneFetch>(async () => httpResponse());
    await expect(
      runVenusHealthAgentTermixMethod({
        request: request(),
        requestInputCanonicalJson: REQUEST_BODY,
        requestInputSha256: "f".repeat(64),
        clock: clock(),
        fetch: fetchRequest
      })
    ).rejects.toThrow("TERMIX_VENUS_REQUEST_DIGEST_MISMATCH");
    expect(fetchRequest).not.toHaveBeenCalled();

    const drifted = request();
    drifted.declaration.inputs[0] = {
      ...required(drifted.declaration.inputs[0]),
      value: { encoding: "string", value: "e".repeat(64) }
    };
    drifted.declarationSha256 = sha256Bytes(
      canonicalJson(normalizeBenchmarkDeclaration(drifted.declaration))
    );
    await expect(
      runVenusHealthAgentTermixMethod({
        request: drifted,
        requestInputCanonicalJson: REQUEST_BODY,
        requestInputSha256: REQUEST_SHA256,
        clock: clock(),
        fetch: fetchRequest
      })
    ).rejects.toThrow("TERMIX_VENUS_DECLARATION_REQUEST_BINDING_MISMATCH");
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["non-200 response", () => httpResponse(responseBody(), { status: 503 })],
    [
      "wrong content type",
      () =>
        httpResponse(responseBody(), {
          headers: { get: () => "text/html" }
        })
    ],
    ["mismatched JSON-RPC id", () => httpResponse(responseBody("another-request"))],
    [
      "oversized declared response",
      () =>
        httpResponse(responseBody(), {
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-type" ? "application/json" : "2000001"
          }
        })
    ],
    [
      "ambiguous response parts",
      () => httpResponse(responseBody("venus-agent-run-001-health-a2a", {}, true))
    ],
    [
      "agent error payload",
      () => httpResponse(responseBody("venus-agent-run-001-health-a2a", { error: "invalid" }))
    ],
    [
      "widened execution flag",
      () => httpResponse(responseBody("venus-agent-run-001-health-a2a", { executionEnabled: true }))
    ]
  ])("rejects %s without returning a timed capture", async (_label, buildResponse) => {
    await expect(
      runVenusHealthAgentTermixMethod({
        request: request(),
        requestInputCanonicalJson: REQUEST_BODY,
        requestInputSha256: REQUEST_SHA256,
        clock: clock(),
        fetch: async () => buildResponse()
      })
    ).rejects.toThrow();
  });
});
