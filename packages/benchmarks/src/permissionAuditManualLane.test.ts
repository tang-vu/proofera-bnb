import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Bytes } from "./canonical.js";
import { auditPermissionBundle, type PermissionAuditBundle } from "./permissionAudit.js";
import {
  PERMISSION_AUDIT_MANUAL_PROCEDURE_VERSION,
  permissionAuditRpcIdPrefix,
  runPermissionAuditManualTermixMethod,
  type PermissionAuditManualEvent
} from "./permissionAuditManualLane.js";
import { buildPermissionAuditRpcPlan } from "./permissionAuditRpc.js";
import {
  PERMISSION_AUDIT_FIXTURE,
  permissionAuditFixtureBundle,
  permissionAuditFixtureRpcResponses
} from "./permissionAuditTestFixture.js";
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
const RUN_ID = "permission-manual-001";

function declaration(bundle: PermissionAuditBundle): BenchmarkDeclaration {
  const byId = new Map(bundle.evidence.map((artifact) => [artifact.artifactId, artifact]));
  const input = (inputId: string, artifactId: string) => {
    const artifact = byId.get(artifactId);
    if (artifact === undefined) throw new Error("Missing declaration fixture artifact");
    return {
      description: `Frozen ${inputId}`,
      inputId,
      unit: null,
      value: { encoding: "canonical_json" as const, value: canonicalJson(artifact) }
    };
  };
  return BenchmarkDeclarationSchema.parse({
    benchmarkId: "permission-audit-live-v1",
    constraints: [
      {
        constraintId: "read-only",
        description: "No timed write, signature or broadcast.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      }
    ],
    environment: {
      chainId: 97,
      components: [
        { configurationSha256: null, name: "node", version: "24.14.1" },
        {
          configurationSha256: "b".repeat(64),
          name: "proofera-security-auditor",
          version: "1.0.0"
        }
      ],
      kind: "testnet",
      networkName: "BNB Smart Chain Testnet",
      parameters: [
        {
          key: "authority-source-block",
          value: {
            encoding: "decimal_integer",
            value: bundle.codeAuthorityAttestation.blockNumber
          }
        }
      ],
      softwareCommitSha: COMMIT
    },
    inputs: [
      input("activation-proposal", bundle.sourceBindings.activationProposalArtifactId),
      input("code-authority-attestation", bundle.sourceBindings.codeAuthorityAttestationArtifactId),
      input(
        "authority-lifecycle-receipts",
        bundle.sourceBindings.authorityLifecycleReceiptsArtifactId
      ),
      input("adversarial-corpus", bundle.sourceBindings.adversarialCorpusArtifactId),
      input("sdk-behavior-evidence", bundle.sourceBindings.sdkBehaviorEvidenceArtifactId)
    ],
    qualityRubric: {
      criteria: [
        {
          criterionId: "correctness",
          description: "Evidence-linked true positives and corrected policy.",
          evidenceRequired: "Canonical output and answer-key adjudication.",
          maximumPoints: 100,
          measurement: "Compare with the frozen reviewer-held answer key."
        }
      ],
      declaredAtUtc: "2026-08-17T00:00:00.000Z",
      rubricId: "permission-audit-rubric",
      totalMaximumPoints: 100,
      version: "1.0.0"
    },
    requiredReceiptKinds: ["api", "transaction"],
    task: {
      domain: "security",
      exactDefinition: "Audit one frozen secret-free Altana permission bundle read-only.",
      successCondition: "Return evidence-linked findings and a corrected enforcement table.",
      taskId: "autonomous-session-permission-audit",
      title: "Altana permission audit"
    }
  });
}

function request(bundle: PermissionAuditBundle): TermixTimedRunRequest {
  const frozen = declaration(bundle);
  return {
    declaration: frozen,
    declarationSha256: sha256Bytes(canonicalJson(normalizeBenchmarkDeclaration(frozen))),
    hireReceipt: null,
    method: {
      kind: "manual",
      label: "Frozen manual permission audit",
      operatorRole: "Independent security reviewer",
      procedureVersion: PERMISSION_AUDIT_MANUAL_PROCEDURE_VERSION,
      tools: [
        { name: "human-reviewed-canonical-json-worksheet", version: "1.0.0" },
        { name: "node-sha256", version: "node-crypto" },
        { name: "publicnode-bsc-testnet-json-rpc", version: "eth-json-rpc" }
      ]
    },
    protocolVersion: TERMIX_TIMED_RUNNER_PROTOCOL_VERSION,
    repositoryClean: true,
    runId: RUN_ID,
    runnerId: "permission-audit-manual-v1",
    sourceCommitSha: COMMIT
  };
}

function clock(): TermixRunnerClock {
  const utc = [0, 1, 2, 3, 4, 5].map((seconds) => new Date(`2026-08-17T00:00:0${seconds}.000Z`));
  const monotonic = [100n, 200n, 900n, 1_000n];
  return {
    monotonicClockLabel: "Injected monotonic fixture",
    monotonicNowNanoseconds: () => {
      const value = monotonic.shift();
      if (value === undefined) throw new Error("Missing monotonic fixture");
      return value;
    },
    utcNow: () => {
      const value = utc.shift();
      if (value === undefined) throw new Error("Missing UTC fixture");
      return value;
    }
  };
}

function allEvents(bundle: PermissionAuditBundle): PermissionAuditManualEvent[] {
  const prefix = permissionAuditRpcIdPrefix(RUN_ID);
  const plan = buildPermissionAuditRpcPlan(bundle, prefix);
  const responses = permissionAuditFixtureRpcResponses(plan.map(({ exchangeId }) => exchangeId));
  const result = auditPermissionBundle(bundle);
  return [
    {
      description: "Inspect frozen evidence and reproduce findings",
      event: "active_start",
      segmentId: "review"
    },
    ...bundle.evidence.map(({ artifactId, sha256 }) => ({
      artifactId,
      event: "artifact_read" as const,
      sha256
    })),
    ...plan.map((entry, index) => ({
      endpointUrl: "https://bsc-testnet-rpc.publicnode.com" as const,
      event: "rpc_exchange" as const,
      exchangeId: entry.exchangeId,
      requestBody: entry.requestBody,
      responseBody: responses[index] ?? ""
    })),
    { event: "active_end", segmentId: "review" },
    {
      event: "output",
      outputBody: canonicalJson({
        agentInvoked: false,
        bundleSha256: result.bundleSha256,
        limitations: ["Synthetic manual fixture; not benchmark evidence."],
        manualProcedureVersion: PERMISSION_AUDIT_MANUAL_PROCEDURE_VERSION,
        operatorRole: "Independent security reviewer",
        result,
        schemaVersion: "proofera-termix-permission-audit-manual-output-v1.0.0"
      })
    }
  ];
}

async function* iterable(events: readonly unknown[]): AsyncIterable<unknown> {
  yield* events;
}

describe("permission audit manual TermiX lane", () => {
  it("captures all artifact reads and exact read-only RPC observations", async () => {
    const bundle = permissionAuditFixtureBundle();
    const canonicalBundle = canonicalJson(bundle);
    const capture = await runPermissionAuditManualTermixMethod({
      bundleCanonicalJson: canonicalBundle,
      bundleSha256: sha256Bytes(canonicalBundle),
      clock: clock(),
      events: iterable(allEvents(bundle)),
      request: request(bundle)
    });
    expect(capture.methodKind).toBe("manual");
    expect(capture.apiResponses).toHaveLength(4);
    expect(capture.timing.activeDurationNanoseconds).toBe("700");
    expect(capture.hireReceipt).toBeNull();
  });

  it("rejects an incomplete artifact review", async () => {
    const bundle = permissionAuditFixtureBundle();
    const canonicalBundle = canonicalJson(bundle);
    const events = allEvents(bundle).filter(
      (event) => event.event !== "artifact_read" || event.artifactId !== "database"
    );
    await expect(
      runPermissionAuditManualTermixMethod({
        bundleCanonicalJson: canonicalBundle,
        bundleSha256: sha256Bytes(canonicalBundle),
        clock: clock(),
        events: iterable(events),
        request: request(bundle)
      })
    ).rejects.toThrow("TERMIX_PERMISSION_AUDIT_MANUAL_ARTIFACTS_INCOMPLETE");
  });

  it("rejects altered receipt observations", async () => {
    const bundle = permissionAuditFixtureBundle();
    const canonicalBundle = canonicalJson(bundle);
    const events = allEvents(bundle).map((event) =>
      event.event === "rpc_exchange" && event.exchangeId.endsWith("-grant")
        ? {
            ...event,
            responseBody: JSON.stringify({
              id: event.exchangeId,
              jsonrpc: "2.0",
              result: {
                blockHash: PERMISSION_AUDIT_FIXTURE.revokeBlockHash,
                status: "0x1",
                transactionHash: PERMISSION_AUDIT_FIXTURE.grantTransactionHash
              }
            })
          }
        : event
    );
    await expect(
      runPermissionAuditManualTermixMethod({
        bundleCanonicalJson: canonicalBundle,
        bundleSha256: sha256Bytes(canonicalBundle),
        clock: clock(),
        events: iterable(events),
        request: request(bundle)
      })
    ).rejects.toThrow("TERMIX_PERMISSION_AUDIT_RPC_RECEIPT_MISMATCH");
  });

  it("rejects declaration drift before accepting manual output", async () => {
    const bundle = permissionAuditFixtureBundle();
    const canonicalBundle = canonicalJson(bundle);
    const drifted = request(bundle);
    const firstInput = drifted.declaration.inputs[0];
    if (firstInput === undefined) throw new Error("Missing declaration input fixture");
    firstInput.value = {
      encoding: "canonical_json",
      value: canonicalJson({ artifactId: "drift" })
    };
    drifted.declarationSha256 = sha256Bytes(
      canonicalJson(normalizeBenchmarkDeclaration(drifted.declaration))
    );
    await expect(
      runPermissionAuditManualTermixMethod({
        bundleCanonicalJson: canonicalBundle,
        bundleSha256: sha256Bytes(canonicalBundle),
        clock: clock(),
        events: iterable(allEvents(bundle)),
        request: drifted
      })
    ).rejects.toThrow("TERMIX_PERMISSION_AUDIT_MANUAL_DECLARATION_INPUT_MISMATCH");
  });
});
