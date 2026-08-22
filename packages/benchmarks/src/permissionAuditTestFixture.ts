import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.js";
import {
  expectedPermissionAuditDeclarationInputs,
  type PermissionAuditBundle
} from "./permissionAudit.js";
import { TERMIX_TIMED_RUNNER_PROTOCOL_VERSION, type TermixTimedRunRequest } from "./runner.js";
import {
  BenchmarkDeclarationSchema,
  normalizeBenchmarkDeclaration,
  type BenchmarkDeclaration
} from "./schemas.js";

export const PERMISSION_AUDIT_FIXTURE = Object.freeze({
  code: "0x60006000",
  executeBlockHash: `0x${"8".repeat(64)}`,
  executeTransactionHash: `0x${"9".repeat(64)}`,
  grantBlockHash: `0x${"5".repeat(64)}`,
  grantTransactionHash: `0x${"4".repeat(64)}`,
  recipient: `0x${"2".repeat(40)}`,
  revokeBlockHash: `0x${"7".repeat(64)}`,
  revokeTransactionHash: `0x${"6".repeat(64)}`,
  target: `0x${"1".repeat(40)}`,
  token: `0x${"3".repeat(40)}`
});

export const PERMISSION_AUDIT_FIXTURE_COMMIT = "a".repeat(40);
export const PERMISSION_AUDIT_FIXTURE_RUN_ID = "permission-agent-001";

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
    quoteObservedAtUtc: "2026-08-17T11:29:30.000Z",
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
      executeBlockHash: fixture.executeBlockHash,
      executeObservedAtUtc: "2026-08-17T11:30:00.000Z",
      executeTransactionHash: fixture.executeTransactionHash,
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
      claimEvidenceLevel: "direct-record",
      claimEnforcementLayer: "postgresql-grant-claim",
      claimState: "claimed",
      databaseClaimRecordObserved: true,
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
      requiredClaimEnforcementLayer: "postgresql-grant-claim",
      requiresDirectClaimEvidence: true,
      requiresDatabaseClaimRecord: true,
      spendCaps: candidate.spendCaps
    },
    frozenAtUtc: "2026-08-17T12:00:00.000Z",
    schemaVersion: "proofera-termix-permission-audit-bundle-v1.1.0",
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

export function permissionAuditFixtureDeclaration(
  configurationSha256: string,
  agentEndpoint: string,
  rpcEndpoint: string
): BenchmarkDeclaration {
  const bundle = permissionAuditFixtureBundle();
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
          configurationSha256,
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
        },
        {
          key: "permission-audit-agent-endpoint",
          value: { encoding: "string", value: agentEndpoint }
        },
        {
          key: "permission-audit-rpc-endpoint",
          value: { encoding: "string", value: rpcEndpoint }
        }
      ],
      softwareCommitSha: PERMISSION_AUDIT_FIXTURE_COMMIT
    },
    inputs: [...expectedPermissionAuditDeclarationInputs(bundle)].map(([inputId, value]) => ({
      description: `Frozen ${inputId}`,
      inputId,
      unit: null,
      value: { encoding: "canonical_json", value }
    })),
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

export function permissionAuditFixtureAgentRequest(
  configurationSha256: string,
  agentEndpoint: string,
  rpcEndpoint: string
): TermixTimedRunRequest {
  const declaration = permissionAuditFixtureDeclaration(
    configurationSha256,
    agentEndpoint,
    rpcEndpoint
  );
  const hireTransactionHash = `0x${"9".repeat(64)}`;
  const rawReceipt = '{"status":"0x1"}';
  return {
    declaration,
    declarationSha256: sha256Bytes(canonicalJson(normalizeBenchmarkDeclaration(declaration))),
    hireReceipt: {
      chainId: 97,
      explorerUrl: `https://testnet.bscscan.com/tx/${hireTransactionHash}`,
      observedAtUtc: "2026-08-17T00:01:00.000Z",
      rawReceipt,
      rawReceiptSha256: sha256Bytes(rawReceipt),
      state: "verified",
      transactionHash: hireTransactionHash,
      verificationMethod: "Fixture receipt comparison",
      verifiedAtUtc: "2026-08-17T00:02:00.000Z",
      verifier: "Fixture verifier"
    },
    method: {
      agentReference: {
        agentId: "42",
        chainId: 97,
        registryAddress: `0x${"a".repeat(40)}`,
        registrySourceUrl: `https://testnet.bscscan.com/address/0x${"a".repeat(40)}`,
        standard: "ERC-8004",
        state: "registered"
      },
      configurationSha256,
      kind: "agent",
      label: "Registered ProofEra permission auditor",
      marketplace: "ProofEra",
      runtime: "ProofEra deterministic A2A"
    },
    protocolVersion: TERMIX_TIMED_RUNNER_PROTOCOL_VERSION,
    repositoryClean: true,
    runId: PERMISSION_AUDIT_FIXTURE_RUN_ID,
    runnerId: "permission-audit-agent-v1",
    sourceCommitSha: PERMISSION_AUDIT_FIXTURE_COMMIT
  };
}
