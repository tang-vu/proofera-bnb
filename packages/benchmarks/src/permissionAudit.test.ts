import { describe, expect, it } from "vitest";

import { sha256Canonical } from "./canonical.js";
import {
  PermissionAuditOutputSchema,
  auditPermissionBundle,
  canonicalPermissionAuditOutput,
  type PermissionAuditBundle
} from "./permissionAudit.js";

const address = (suffix: string): string => `0x${suffix.padStart(40, "0")}`;
const digest = (seed: string): string => sha256Canonical({ seed });

function safeCandidate() {
  return {
    calls: [
      {
        codeSha256: digest("code"),
        recipient: address("2"),
        selector: "0x12345678",
        target: address("1"),
        token: address("3")
      }
    ],
    chainId: 97,
    dispatcher: "direct-only" as const,
    expiresAtUtc: "2026-08-17T13:00:00.000Z",
    quoteObservedAtUtc: "2026-08-17T11:59:30.000Z",
    revokePath: "present" as const,
    sessionSignerExposure: "none" as const,
    spendCaps: [{ limitBaseUnits: "1000", periodSeconds: "300", token: address("3") }],
    unknownOutcomePolicy: "halt-and-probe" as const
  };
}

function bundle(): PermissionAuditBundle {
  const candidate = safeCandidate();
  return {
    activationProposal: {
      candidate,
      caseId: "activation-proposal",
      evidenceArtifactIds: ["proposal-evidence"]
    },
    adversarialCorpus: [
      {
        candidate: {
          ...candidate,
          calls: [
            {
              ...candidate.calls[0],
              codeSha256: digest("substituted"),
              recipient: address("9"),
              selector: "0x87654321",
              target: address("8"),
              token: address("7")
            }
          ],
          chainId: 56,
          dispatcher: "generic",
          expiresAtUtc: "2026-08-17T14:00:00.000Z",
          quoteObservedAtUtc: "2026-08-17T11:00:00.000Z",
          revokePath: "missing",
          sessionSignerExposure: "raw-material",
          spendCaps: [],
          unknownOutcomePolicy: "retry-immediately"
        },
        caseId: "seeded-hard-fails",
        evidenceArtifactIds: ["corpus-evidence"]
      }
    ],
    evidence: [
      {
        artifactId: "proposal-evidence",
        locator: "evidence/proposal.json",
        sha256: digest("proposal")
      },
      { artifactId: "corpus-evidence", locator: "evidence/corpus.json", sha256: digest("corpus") }
    ],
    expectedPolicy: {
      allowedCalls: candidate.calls,
      chainId: 97,
      expiresAtUtc: candidate.expiresAtUtc,
      maximumQuoteAgeSeconds: 60,
      spendCaps: candidate.spendCaps
    },
    frozenAtUtc: "2026-08-17T12:00:00.000Z",
    schemaVersion: "proofera-termix-permission-audit-bundle-v1.0.0",
    sdkBehavior: {
      callsIdRetainedAfterGrantException: "no",
      packageBytesSha256: digest("sdk"),
      version: "0.7.0"
    }
  };
}

describe("permission audit engine", () => {
  it("returns no unsupported claim for a conforming activation proposal", () => {
    const input = bundle();
    input.adversarialCorpus = [
      {
        candidate: safeCandidate(),
        caseId: "safe-control",
        evidenceArtifactIds: ["corpus-evidence"]
      }
    ];
    expect(auditPermissionBundle(input).findings).toEqual([]);
  });

  it("finds every preregistered seeded hard-fail class", () => {
    const output = auditPermissionBundle(bundle());
    const findingIds = new Set(output.findings.map(({ findingId }) => findingId));
    for (const required of [
      "generic-dispatcher",
      "session-signer-leak",
      "wrong-chain",
      "target-mismatch",
      "recipient-mismatch",
      "token-mismatch",
      "unbounded-spend",
      "unsafe-unknown-outcome-retry",
      "missing-revoke-path"
    ]) {
      expect(findingIds).toContain(required);
    }
  });

  it("is deterministic, canonical and explicitly non-executing", () => {
    const first = canonicalPermissionAuditOutput(bundle());
    const second = canonicalPermissionAuditOutput(bundle());
    expect(first).toBe(second);
    const parsed = PermissionAuditOutputSchema.parse(JSON.parse(first));
    expect(parsed.executionPerformed).toBe(false);
    expect(
      new Set(parsed.correctedEnforcementTable.map(({ enforcementLayer }) => enforcementLayer))
    ).toEqual(new Set(["altana-or-onchain", "explicit-wallet-confirmation", "proofera-runtime"]));
  });

  it("rejects unbound evidence instead of converting it into a finding", () => {
    const input = bundle();
    input.activationProposal.evidenceArtifactIds = ["missing-artifact"];
    expect(() => auditPermissionBundle(input)).toThrow("TERMIX_PERMISSION_AUDIT_EVIDENCE_UNBOUND");
  });

  it("rejects duplicate case identifiers and an already-expired expected policy", () => {
    const duplicate = bundle();
    const firstCase = duplicate.adversarialCorpus[0];
    if (firstCase === undefined) throw new Error("Expected adversarial fixture");
    firstCase.caseId = "activation-proposal";
    expect(() => auditPermissionBundle(duplicate)).toThrow(
      "TERMIX_PERMISSION_AUDIT_CASE_DUPLICATE"
    );

    const expired = bundle();
    expired.expectedPolicy.expiresAtUtc = expired.frozenAtUtc;
    expect(() => auditPermissionBundle(expired)).toThrow(
      "TERMIX_PERMISSION_AUDIT_EXPECTED_POLICY_EXPIRED"
    );
  });
});
