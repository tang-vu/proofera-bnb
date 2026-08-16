import assert from "node:assert/strict";
import test from "node:test";

import {
  PERMISSION_AUDIT_SKILL,
  auditPermissionBundle,
  handlePermissionAuditA2a,
  type PermissionAuditBundle
} from "../src/permissionAudit.js";

const digest = (value: string): string => value.repeat(64).slice(0, 64);
const address = (value: string): string => `0x${value.repeat(40).slice(0, 40)}`;

function bundle(): PermissionAuditBundle {
  const call = {
    codeSha256: digest("a"),
    recipient: address("2"),
    selector: "0x12345678",
    target: address("1"),
    token: address("3")
  };
  const candidate = {
    calls: [call],
    chainId: 97,
    dispatcher: "direct-only" as const,
    expiresAtUtc: "2026-08-17T13:00:00.000Z",
    quoteObservedAtUtc: "2026-08-17T11:59:30.000Z",
    revokePath: "present" as const,
    sessionSignerExposure: "none" as const,
    spendCaps: [{ limitBaseUnits: "1000", periodSeconds: "300", token: address("3") }],
    unknownOutcomePolicy: "halt-and-probe" as const
  };
  const evidence = ["proposal", "corpus", "lifecycle", "code", "sdk", "database"].map(
    (artifactId, index) => ({
      artifactId,
      locator: `evidence/${artifactId}.json`,
      sha256: String(index + 1).repeat(64)
    })
  );
  return {
    activationProposal: { candidate, caseId: "activation", evidenceArtifactIds: ["proposal"] },
    adversarialCorpus: [{ candidate, caseId: "control", evidenceArtifactIds: ["corpus"] }],
    authorityLifecycle: {
      chainId: 97,
      finalAuthorityState: "revoked",
      grantBlockHash: `0x${"4".repeat(64)}`,
      grantObservedAtUtc: "2026-08-17T11:20:00.000Z",
      grantTransactionHash: `0x${"5".repeat(64)}`,
      revokeBlockHash: `0x${"6".repeat(64)}`,
      revokeObservedAtUtc: "2026-08-17T11:40:00.000Z",
      revokeTransactionHash: `0x${"7".repeat(64)}`
    },
    codeAuthorityAttestation: {
      attestedCalls: [call],
      blockHash: `0x${"8".repeat(64)}`,
      blockNumber: "125500000",
      chainId: 97
    },
    durableClaimState: {
      claimState: "claimed",
      databaseDeploymentReceiptArtifactId: "database",
      reservationId: "reservation-001",
      unknownOutcomeRetryAllowed: false
    },
    evidence,
    expectedPolicy: {
      allowedCalls: [call],
      chainId: 97,
      expiresAtUtc: candidate.expiresAtUtc,
      maximumQuoteAgeSeconds: 60,
      spendCaps: candidate.spendCaps
    },
    frozenAtUtc: "2026-08-17T12:00:00.000Z",
    schemaVersion: "proofera-termix-permission-audit-bundle-v1.0.0",
    sdkBehavior: {
      callsIdRetainedAfterGrantException: "no",
      evidenceArtifactId: "sdk",
      packageBytesSha256: digest("b"),
      version: "0.7.0"
    },
    sourceBindings: {
      activationProposalArtifactId: "proposal",
      adversarialCorpusArtifactId: "corpus",
      authorityLifecycleReceiptsArtifactId: "lifecycle",
      codeAuthorityAttestationArtifactId: "code",
      sdkBehaviorEvidenceArtifactId: "sdk"
    }
  };
}

test("permission audit returns deterministic non-executing output for a safe bundle", () => {
  const first = auditPermissionBundle(bundle());
  const second = auditPermissionBundle(bundle());
  assert.deepEqual(first, second);
  assert.equal(first.executionPerformed, false);
  assert.deepEqual(first.findings, []);
  assert.deepEqual(
    new Set(first.correctedEnforcementTable.map(({ enforcementLayer }) => enforcementLayer)),
    new Set(["altana-or-onchain", "explicit-wallet-confirmation", "proofera-runtime"])
  );
});

test("permission audit finds every preregistered hard-fail class independently", () => {
  const input = bundle();
  const control = input.adversarialCorpus[0];
  assert.ok(control);
  const expectedCall = control.candidate.calls[0];
  assert.ok(expectedCall);
  control.candidate = {
    ...control.candidate,
    calls: [
      {
        ...expectedCall,
        codeSha256: digest("c"),
        recipient: address("9"),
        selector: "0x87654321",
        target: address("8"),
        token: address("7")
      }
    ],
    chainId: 56,
    dispatcher: "generic",
    revokePath: "missing",
    sessionSignerExposure: "raw-material",
    spendCaps: [],
    unknownOutcomePolicy: "retry-immediately"
  };
  const findings = new Set(auditPermissionBundle(input).findings.map(({ findingId }) => findingId));
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
  ] as const) {
    assert.equal(findings.has(required), true, required);
  }
});

test("A2A adapter is strict, bounded and never returns execution capability", () => {
  const success = handlePermissionAuditA2a({ skill: PERMISSION_AUDIT_SKILL, bundle: bundle() });
  assert.equal("schemaVersion" in success, true);
  assert.equal("executionPerformed" in success && success.executionPerformed, false);

  const withSecretField = handlePermissionAuditA2a({
    skill: PERMISSION_AUDIT_SKILL,
    bundle: { ...bundle(), privateKey: "not-a-real-key" }
  });
  assert.equal(
    "error" in withSecretField && withSecretField.error,
    "INVALID_PERMISSION_AUDIT_INPUT"
  );
  assert.equal("executionEnabled" in withSecretField && withSecretField.executionEnabled, false);

  const unknown = handlePermissionAuditA2a({ skill: "execute_permission", bundle: bundle() });
  assert.equal("error" in unknown && unknown.error, "INVALID_PERMISSION_AUDIT_INPUT");
});
