import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.js";
import { PERMISSION_AUDIT_ENGINE_VERSION, auditPermissionBundle } from "./permissionAudit.js";
import { buildPermissionAuditPair } from "./permissionAuditPair.js";

const paths = {
  agentCapturePath:
    "evidence/termix/runs/permission-audit/agent/permission-audit-agent-20260822-v1.json",
  agentInvocationPath:
    "evidence/termix/invocations/permission-audit-agent-20260822-v1.canonical-json",
  manualCapturePath:
    "evidence/termix/runs/permission-audit/manual/permission-audit-manual-20260822-v1.json",
  manualInvocationPath:
    "evidence/termix/invocations/permission-audit-manual-20260822-v1.canonical-json"
} as const;

function readRepositoryJson(repositoryPath: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../${repositoryPath}`, import.meta.url), "utf8"));
}

function fixture() {
  const bundle = readRepositoryJson(
    "evidence/termix/frozen/permission-audit/38046f87b87c-126543819.canonical-json"
  );
  const answerKey = {
    bundleSha256: "c50a2defc62a996cab8a8bf51be2b8b2bbe44cc007ea01e6d1512d7257a8f0cb",
    engineVersion: PERMISSION_AUDIT_ENGINE_VERSION,
    output: auditPermissionBundle(bundle),
    schemaVersion: "proofera-termix-permission-audit-answer-key-v1.0.0"
  } as const;
  return {
    agentCapture: readRepositoryJson(paths.agentCapturePath),
    manualCapture: readRepositoryJson(paths.manualCapturePath),
    agentInvocation: readRepositoryJson(paths.agentInvocationPath),
    manualInvocation: readRepositoryJson(paths.manualInvocationPath),
    answerKey,
    answerKeySha256: sha256Canonical(answerKey),
    reviewedAtUtc: "2026-08-22T12:30:00.000Z",
    sources: paths
  };
}

describe("permission-audit paired normalization", () => {
  it("retains exact parity and blocks publication without an independent reviewer", () => {
    const result = buildPermissionAuditPair(fixture());

    expect(result.summary).toMatchObject({
      claimState: "unverified",
      publishableClaim: false,
      quality: {
        maximumPoints: 100,
        agentPoints: 100,
        manualPoints: 100,
        agentMinusManualPoints: 0
      },
      sourceStates: { agent: "unverified", manual: "unverified" }
    });
    expect(result.summary.duration).toEqual({
      agentNanoseconds: "2318655500",
      manualNanoseconds: "12756400",
      manualMinusAgentNanoseconds: "-2305899100"
    });
    expect(result.summary.costs).toHaveLength(1);
    expect(result.summary.costs?.[0]).toMatchObject({
      agentMinorUnits: "0",
      manualMinorUnits: "0",
      manualMinusAgentMinorUnits: "0"
    });
    expect(result.selfReview).toMatchObject({
      answerKeySha256: "61494b199b7b41b30eee370fe6736d864671439c65b2acfbee107c5ea9efdbeb",
      reviewState: "self_reviewed_unverified",
      checks: { secondReviewerIndependent: false }
    });
  });

  it("rejects an answer-key digest that was not committed before the lanes", () => {
    const input = fixture();
    expect(() => buildPermissionAuditPair({ ...input, answerKeySha256: "0".repeat(64) })).toThrow(
      "TERMIX_PERMISSION_AUDIT_PAIR_ANSWER_KEY_DIGEST_MISMATCH"
    );
  });

  it("rejects output drift even when the mutated capture digest is internally consistent", () => {
    const input = fixture();
    const manual = structuredClone(input.manualCapture) as {
      output: { body: string; bytes: number; sha256: string };
    };
    const envelope = JSON.parse(manual.output.body) as {
      result: { findings: unknown[] };
    };
    envelope.result.findings = envelope.result.findings.slice(1);
    manual.output.body = canonicalJson(envelope);
    manual.output.bytes = Buffer.byteLength(manual.output.body);
    manual.output.sha256 = sha256Bytes(manual.output.body);

    expect(() => buildPermissionAuditPair({ ...input, manualCapture: manual })).toThrow(
      "TERMIX_PERMISSION_AUDIT_PAIR_OUTPUT_MISMATCH"
    );
  });

  it("rejects a pair that violates the committed manual-first order", () => {
    const input = fixture();
    const manual = structuredClone(input.manualCapture) as {
      timing: { endedAtUtc: string };
    };
    manual.timing.endedAtUtc = "2026-08-22T12:30:01.000Z";
    expect(() => buildPermissionAuditPair({ ...input, manualCapture: manual })).toThrow(
      "TERMIX_PERMISSION_AUDIT_PAIR_RUN_ORDER_INVALID"
    );
  });
});
