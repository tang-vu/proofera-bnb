import { sha256Bytes, sha256Canonical } from "./canonical.js";
import { type PermissionAuditBundle } from "./permissionAudit.js";

export const PERMISSION_AUDIT_FIXTURE = Object.freeze({
  code: "0x60006000",
  grantBlockHash: `0x${"5".repeat(64)}`,
  grantTransactionHash: `0x${"4".repeat(64)}`,
  recipient: `0x${"2".repeat(40)}`,
  revokeBlockHash: `0x${"7".repeat(64)}`,
  revokeTransactionHash: `0x${"6".repeat(64)}`,
  target: `0x${"1".repeat(40)}`,
  token: `0x${"3".repeat(40)}`
});

export function permissionAuditFixtureBundle(): PermissionAuditBundle {
  const fixture = PERMISSION_AUDIT_FIXTURE;
  const call = {
    codeSha256: sha256Bytes(Buffer.from(fixture.code.slice(2), "hex")),
    recipient: fixture.recipient,
    selector: "0x12345678",
    target: fixture.target,
    token: fixture.token
  };
  const candidate = {
    calls: [call],
    chainId: 97,
    dispatcher: "direct-only" as const,
    expiresAtUtc: "2026-08-17T13:00:00.000Z",
    quoteObservedAtUtc: "2026-08-17T11:59:30.000Z",
    revokePath: "present" as const,
    sessionSignerExposure: "none" as const,
    spendCaps: [{ limitBaseUnits: "1000", periodSeconds: "300", token: fixture.token }],
    unknownOutcomePolicy: "halt-and-probe" as const
  };
  const evidence = ["proposal", "corpus", "lifecycle", "code", "sdk", "database"].map(
    (artifactId) => ({
      artifactId,
      locator: `evidence/${artifactId}.json`,
      sha256: sha256Canonical({ artifactId })
    })
  );
  return {
    activationProposal: { candidate, caseId: "activation", evidenceArtifactIds: ["proposal"] },
    adversarialCorpus: [{ candidate, caseId: "control", evidenceArtifactIds: ["corpus"] }],
    authorityLifecycle: {
      chainId: 97,
      finalAuthorityState: "revoked",
      grantBlockHash: fixture.grantBlockHash,
      grantObservedAtUtc: "2026-08-17T11:20:00.000Z",
      grantTransactionHash: fixture.grantTransactionHash,
      revokeBlockHash: fixture.revokeBlockHash,
      revokeObservedAtUtc: "2026-08-17T11:40:00.000Z",
      revokeTransactionHash: fixture.revokeTransactionHash
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
      packageBytesSha256: sha256Canonical({ sdk: "0.7.0" }),
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

export function permissionAuditFixtureRpcResponses(
  exchangeIds: readonly (string | undefined)[]
): readonly string[] {
  const fixture = PERMISSION_AUDIT_FIXTURE;
  return [
    JSON.stringify({ id: exchangeIds[0], jsonrpc: "2.0", result: "0x61" }),
    JSON.stringify({
      id: exchangeIds[1],
      jsonrpc: "2.0",
      result: {
        blockHash: fixture.grantBlockHash,
        status: "0x1",
        transactionHash: fixture.grantTransactionHash
      }
    }),
    JSON.stringify({
      id: exchangeIds[2],
      jsonrpc: "2.0",
      result: {
        blockHash: fixture.revokeBlockHash,
        status: "0x1",
        transactionHash: fixture.revokeTransactionHash
      }
    }),
    JSON.stringify({ id: exchangeIds[3], jsonrpc: "2.0", result: fixture.code })
  ];
}
