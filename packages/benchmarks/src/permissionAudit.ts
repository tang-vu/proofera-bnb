import { z } from "zod";

import { canonicalJson, sha256Canonical } from "./canonical.js";
import { BenchmarkIdSchema, Sha256Schema, UtcDateTimeSchema } from "./schemas.js";

export const PERMISSION_AUDIT_ENGINE_VERSION =
  "proofera-termix-permission-audit-engine-v1.1.0" as const;

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u);
const SelectorSchema = z.string().regex(/^0x[0-9a-fA-F]{8}$/u);
const DecimalIntegerSchema = z.string().regex(/^(0|[1-9][0-9]*)$/u);
const TransactionHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/u);
const BlockHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/u);

const EvidenceReferenceSchema = z.strictObject({
  artifactId: BenchmarkIdSchema,
  locator: z.string().trim().min(1).max(1_000),
  sha256: Sha256Schema
});

const DirectCallSchema = z.strictObject({
  codeSha256: Sha256Schema,
  recipient: AddressSchema,
  selector: SelectorSchema,
  target: AddressSchema,
  token: AddressSchema
});

const SpendCapSchema = z.strictObject({
  limitBaseUnits: DecimalIntegerSchema,
  periodSeconds: DecimalIntegerSchema,
  token: AddressSchema
});

const CandidatePolicySchema = z.strictObject({
  calls: z.array(DirectCallSchema).min(1).max(20),
  chainId: z.number().int().positive(),
  dispatcher: z.enum(["direct-only", "generic"]),
  expiresAtUtc: UtcDateTimeSchema,
  quoteObservedAtUtc: UtcDateTimeSchema,
  revokePath: z.enum(["present", "missing"]),
  sessionSignerExposure: z.enum(["none", "raw-material"]),
  spendCaps: z.array(SpendCapSchema).max(20),
  unknownOutcomePolicy: z.enum(["probe-before-retry", "retry-immediately", "halt-and-probe"])
});

const ExpectedPolicySchema = z.strictObject({
  allowedCalls: z.array(DirectCallSchema).min(1).max(20),
  chainId: z.literal(97),
  expiresAtUtc: UtcDateTimeSchema,
  maximumQuoteAgeSeconds: z.number().int().positive().max(86_400),
  requiredClaimEnforcementLayer: z.literal("postgresql-grant-claim"),
  requiresDirectClaimEvidence: z.literal(true),
  requiresDatabaseClaimRecord: z.literal(true),
  spendCaps: z.array(SpendCapSchema).min(1).max(20)
});

const AuditCaseSchema = z.strictObject({
  candidate: CandidatePolicySchema,
  caseId: BenchmarkIdSchema,
  evidenceArtifactIds: z.array(BenchmarkIdSchema).min(1).max(30)
});

export const PermissionAuditBundleSchema = z.strictObject({
  activationProposal: AuditCaseSchema,
  adversarialCorpus: z.array(AuditCaseSchema).min(1).max(100),
  authorityLifecycle: z.strictObject({
    chainId: z.literal(97),
    executeBlockHash: BlockHashSchema,
    executeObservedAtUtc: UtcDateTimeSchema,
    executeTransactionHash: TransactionHashSchema,
    finalAuthorityState: z.literal("revoked"),
    grantBlockHash: BlockHashSchema,
    grantObservedAtUtc: UtcDateTimeSchema,
    grantTransactionHash: TransactionHashSchema,
    revokeBlockHash: BlockHashSchema,
    revokeObservedAtUtc: UtcDateTimeSchema,
    revokeTransactionHash: TransactionHashSchema
  }),
  codeAuthorityAttestation: z.strictObject({
    attestedCalls: z.array(DirectCallSchema).min(1).max(20),
    blockHash: BlockHashSchema,
    blockNumber: DecimalIntegerSchema,
    chainId: z.literal(97)
  }),
  durableClaimState: z.strictObject({
    claimEvidenceLevel: z.enum(["direct-record", "inferred-from-pinned-ordering"]),
    claimEnforcementLayer: z.enum(["local-create-only-file", "postgresql-grant-claim"]),
    claimState: z.literal("claimed"),
    databaseClaimRecordObserved: z.boolean(),
    databaseDeploymentReceiptArtifactId: BenchmarkIdSchema,
    reservationId: BenchmarkIdSchema,
    unknownOutcomeRetryAllowed: z.literal(false)
  }),
  evidence: z.array(EvidenceReferenceSchema).min(1).max(200),
  expectedPolicy: ExpectedPolicySchema,
  frozenAtUtc: UtcDateTimeSchema,
  schemaVersion: z.literal("proofera-termix-permission-audit-bundle-v1.1.0"),
  sdkBehavior: z.strictObject({
    callsIdRetainedAfterGrantException: z.enum(["yes", "no", "unknown"]),
    evidenceArtifactId: BenchmarkIdSchema,
    packageBytesSha256: Sha256Schema,
    version: z.literal("0.7.0")
  }),
  sourceBindings: z.strictObject({
    activationProposalArtifactId: BenchmarkIdSchema,
    adversarialCorpusArtifactId: BenchmarkIdSchema,
    authorityLifecycleReceiptsArtifactId: BenchmarkIdSchema,
    codeAuthorityAttestationArtifactId: BenchmarkIdSchema,
    sdkBehaviorEvidenceArtifactId: BenchmarkIdSchema
  })
});

export type PermissionAuditBundle = z.output<typeof PermissionAuditBundleSchema>;

export const PERMISSION_AUDIT_DECLARATION_INPUT_BINDINGS = Object.freeze({
  "activation-proposal": "activationProposalArtifactId",
  "adversarial-corpus": "adversarialCorpusArtifactId",
  "authority-lifecycle-receipts": "authorityLifecycleReceiptsArtifactId",
  "code-authority-attestation": "codeAuthorityAttestationArtifactId",
  "sdk-behavior-evidence": "sdkBehaviorEvidenceArtifactId"
} as const);

export function expectedPermissionAuditDeclarationInputs(
  bundle: PermissionAuditBundle
): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const [inputId, bindingKey] of Object.entries(PERMISSION_AUDIT_DECLARATION_INPUT_BINDINGS)) {
    const artifactId = bundle.sourceBindings[bindingKey as keyof typeof bundle.sourceBindings];
    const artifact = bundle.evidence.find((candidate) => candidate.artifactId === artifactId);
    if (artifact === undefined) throw new Error("TERMIX_PERMISSION_AUDIT_SOURCE_BINDING_UNBOUND");
    values.set(inputId, canonicalJson(artifact));
  }
  return values;
}

const severityByFindingId = {
  "claim-enforcement-layer-mismatch": "high",
  "code-substitution": "critical",
  "database-claim-record-missing": "high",
  "direct-claim-evidence-missing": "high",
  "generic-dispatcher": "critical",
  "missing-revoke-path": "critical",
  "recipient-mismatch": "critical",
  "session-signer-leak": "critical",
  "target-mismatch": "critical",
  "token-mismatch": "critical",
  "unbounded-spend": "critical",
  "unsafe-unknown-outcome-retry": "critical",
  "wrong-chain": "critical",
  "expiry-mismatch": "high",
  "selector-mismatch": "high",
  "spend-cap-exceeded": "high",
  "stale-quote": "high"
} as const;

export type PermissionAuditFindingId = keyof typeof severityByFindingId;

export const PermissionAuditFindingSchema = z.strictObject({
  caseId: BenchmarkIdSchema,
  evidenceArtifactIds: z.array(BenchmarkIdSchema).min(1).max(30),
  findingId: z.enum(
    Object.keys(severityByFindingId) as [PermissionAuditFindingId, ...PermissionAuditFindingId[]]
  ),
  impact: z.string().trim().min(1).max(1_000),
  reproduction: z.string().trim().min(1).max(1_000),
  severity: z.enum(["critical", "high"])
});

export const PermissionAuditOutputSchema = z.strictObject({
  bundleSha256: Sha256Schema,
  correctedEnforcementTable: z.array(
    z.strictObject({
      control: z.string().trim().min(1).max(200),
      enforcementLayer: z.enum([
        "altana-or-onchain",
        "explicit-wallet-confirmation",
        "proofera-runtime"
      ]),
      requirement: z.string().trim().min(1).max(1_000)
    })
  ),
  executionPerformed: z.literal(false),
  findings: z.array(PermissionAuditFindingSchema),
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20),
  schemaVersion: z.literal("proofera-termix-permission-audit-output-v1.1.0")
});

export type PermissionAuditOutput = z.output<typeof PermissionAuditOutputSchema>;

/**
 * Deterministic, read-only policy comparison for the frozen TermiX bundle.
 * It consumes no secrets, performs no network access and cannot sign or write.
 */
export function auditPermissionBundle(input: unknown): PermissionAuditOutput {
  const bundle = PermissionAuditBundleSchema.parse(input);
  validateBundleEvidence(bundle);
  const findings = [bundle.activationProposal, ...bundle.adversarialCorpus]
    .flatMap((auditCase) => auditCaseAgainstExpected(auditCase, bundle))
    .sort((left, right) =>
      `${left.caseId}:${left.findingId}`.localeCompare(`${right.caseId}:${right.findingId}`)
    );

  return PermissionAuditOutputSchema.parse({
    bundleSha256: sha256Canonical(bundle),
    correctedEnforcementTable: correctedEnforcementTable(bundle),
    executionPerformed: false,
    findings,
    limitations: [
      "This report compares only the frozen declarative bundle; it does not prove that a deployed runtime enforces the corrected policy.",
      "Evidence references are digest-bound locators, not independent proof that their source contents are authentic or complete.",
      "The read-only audit does not grant, sign, submit, broadcast, revoke or mutate durable state."
    ],
    schemaVersion: "proofera-termix-permission-audit-output-v1.1.0"
  });
}

function validateBundleEvidence(bundle: PermissionAuditBundle): void {
  const evidenceIds = new Set(bundle.evidence.map(({ artifactId }) => artifactId));
  if (evidenceIds.size !== bundle.evidence.length) {
    throw new Error("TERMIX_PERMISSION_AUDIT_EVIDENCE_DUPLICATE");
  }
  const cases = [bundle.activationProposal, ...bundle.adversarialCorpus];
  const caseIds = new Set<string>();
  for (const auditCase of cases) {
    if (caseIds.has(auditCase.caseId)) {
      throw new Error("TERMIX_PERMISSION_AUDIT_CASE_DUPLICATE");
    }
    caseIds.add(auditCase.caseId);
    for (const artifactId of auditCase.evidenceArtifactIds) {
      if (!evidenceIds.has(artifactId)) {
        throw new Error("TERMIX_PERMISSION_AUDIT_EVIDENCE_UNBOUND");
      }
    }
  }
  const requiredSourceIds = [
    ...Object.values(bundle.sourceBindings),
    bundle.durableClaimState.databaseDeploymentReceiptArtifactId
  ];
  if (new Set(requiredSourceIds).size !== requiredSourceIds.length) {
    throw new Error("TERMIX_PERMISSION_AUDIT_SOURCE_BINDING_DUPLICATE");
  }
  for (const artifactId of requiredSourceIds) {
    if (!evidenceIds.has(artifactId)) {
      throw new Error("TERMIX_PERMISSION_AUDIT_SOURCE_BINDING_UNBOUND");
    }
  }
  if (
    bundle.sdkBehavior.evidenceArtifactId !== bundle.sourceBindings.sdkBehaviorEvidenceArtifactId
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_SDK_EVIDENCE_MISMATCH");
  }
  if (
    sha256Canonical(bundle.codeAuthorityAttestation.attestedCalls) !==
    sha256Canonical(bundle.expectedPolicy.allowedCalls)
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_CODE_AUTHORITY_MISMATCH");
  }
  if (
    new Date(bundle.authorityLifecycle.executeObservedAtUtc) <=
      new Date(bundle.authorityLifecycle.grantObservedAtUtc) ||
    new Date(bundle.authorityLifecycle.revokeObservedAtUtc) <=
      new Date(bundle.authorityLifecycle.executeObservedAtUtc) ||
    new Date(bundle.expectedPolicy.expiresAtUtc) <=
      new Date(bundle.authorityLifecycle.executeObservedAtUtc)
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_LIFECYCLE_ORDER_INVALID");
  }
  if (
    new Set(
      [
        bundle.authorityLifecycle.grantTransactionHash,
        bundle.authorityLifecycle.executeTransactionHash,
        bundle.authorityLifecycle.revokeTransactionHash
      ].map((value) => value.toLowerCase())
    ).size !== 3
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_LIFECYCLE_TRANSACTION_DUPLICATE");
  }
}

function auditCaseAgainstExpected(
  auditCase: PermissionAuditBundle["activationProposal"],
  bundle: PermissionAuditBundle
): PermissionAuditOutput["findings"] {
  const { candidate } = auditCase;
  const findings: PermissionAuditOutput["findings"] = [];
  const add = (findingId: PermissionAuditFindingId, impact: string, reproduction: string): void => {
    findings.push({
      caseId: auditCase.caseId,
      evidenceArtifactIds: [...auditCase.evidenceArtifactIds].sort(),
      findingId,
      impact,
      reproduction,
      severity: severityByFindingId[findingId]
    });
  };

  if (
    auditCase === bundle.activationProposal &&
    bundle.durableClaimState.claimEnforcementLayer !==
      bundle.expectedPolicy.requiredClaimEnforcementLayer
  ) {
    add(
      "claim-enforcement-layer-mismatch",
      "The observed one-shot claim is enforced by a different durability boundary than the production policy requires.",
      "Compare durableClaimState.claimEnforcementLayer with expectedPolicy.requiredClaimEnforcementLayer."
    );
  }
  if (
    auditCase === bundle.activationProposal &&
    bundle.expectedPolicy.requiresDirectClaimEvidence &&
    bundle.durableClaimState.claimEvidenceLevel !== "direct-record"
  ) {
    add(
      "direct-claim-evidence-missing",
      "The one-shot claim is inferred from pinned worker ordering rather than retained as a directly reviewed claim record.",
      "Require a secret-free append-only claim receipt that binds the exact activation before relying on the inferred state."
    );
  }
  if (
    auditCase === bundle.activationProposal &&
    bundle.expectedPolicy.requiresDatabaseClaimRecord &&
    !bundle.durableClaimState.databaseClaimRecordObserved
  ) {
    add(
      "database-claim-record-missing",
      "The deployed PostgreSQL ledger has no claim record binding this activation lifecycle.",
      "Verify the deployment receipt separately, then require an exact append-only database claim joined to the activation before production execution."
    );
  }

  if (candidate.chainId !== bundle.expectedPolicy.chainId) {
    add(
      "wrong-chain",
      "Authority could be granted or interpreted on an unintended chain.",
      "Compare candidate.chainId with expectedPolicy.chainId."
    );
  }
  if (candidate.dispatcher === "generic") {
    add(
      "generic-dispatcher",
      "A generic dispatcher expands authority beyond the reviewed direct calls.",
      "Inspect candidate.dispatcher and require direct-only."
    );
  }
  if (candidate.sessionSignerExposure === "raw-material") {
    add(
      "session-signer-leak",
      "Usable session authority may escape the dedicated encrypted worker boundary.",
      "Inspect the secret-free exposure marker; never include or handle the signer itself."
    );
  }
  if (candidate.revokePath === "missing") {
    add(
      "missing-revoke-path",
      "Compromised or obsolete authority cannot be immediately revoked through the reviewed path.",
      "Inspect candidate.revokePath and require a verified direct revoke path."
    );
  }
  if (candidate.unknownOutcomePolicy === "retry-immediately") {
    add(
      "unsafe-unknown-outcome-retry",
      "Retrying an uncertain grant can create duplicate or broader live authority.",
      "Force an unknown outcome in the frozen case and verify that authority is probed before any retry."
    );
  }
  if (candidate.expiresAtUtc !== bundle.expectedPolicy.expiresAtUtc) {
    add(
      "expiry-mismatch",
      "Authority may outlive the wallet-confirmed expiry or expire before the reviewed action.",
      "Compare the UTC expiry strings byte-for-byte."
    );
  }
  const quoteAgeSeconds = Math.floor(
    (new Date(bundle.authorityLifecycle.executeObservedAtUtc).getTime() -
      new Date(candidate.quoteObservedAtUtc).getTime()) /
      1_000
  );
  if (quoteAgeSeconds < 0 || quoteAgeSeconds > bundle.expectedPolicy.maximumQuoteAgeSeconds) {
    add(
      "stale-quote",
      "The action may execute against price assumptions outside the confirmed freshness window.",
      "Subtract quoteObservedAtUtc from authorityLifecycle.executeObservedAtUtc and compare with maximumQuoteAgeSeconds."
    );
  }

  auditCalls(candidate.calls, bundle.expectedPolicy.allowedCalls, add);
  auditSpendCaps(candidate.spendCaps, bundle.expectedPolicy.spendCaps, add);
  return findings;
}

function auditCalls(
  observed: PermissionAuditBundle["activationProposal"]["candidate"]["calls"],
  expected: PermissionAuditBundle["expectedPolicy"]["allowedCalls"],
  add: (id: PermissionAuditFindingId, impact: string, reproduction: string) => void
): void {
  for (let index = 0; index < Math.max(observed.length, expected.length); index += 1) {
    const actual = observed[index];
    const allowed = expected[index];
    if (
      actual === undefined ||
      allowed === undefined ||
      actual.target.toLowerCase() !== allowed.target.toLowerCase()
    ) {
      add(
        "target-mismatch",
        "A call can reach an unreviewed target or omit a required target.",
        `Compare call index ${index} target with the allowed direct-call manifest.`
      );
    }
    if (actual === undefined || allowed === undefined) continue;
    if (actual.selector.toLowerCase() !== allowed.selector.toLowerCase()) {
      add(
        "selector-mismatch",
        "The target can execute a function outside the wallet-confirmed selector set.",
        `Compare call index ${index} selector with the allowed direct-call manifest.`
      );
    }
    if (actual.codeSha256 !== allowed.codeSha256) {
      add(
        "code-substitution",
        "Reviewed selectors may resolve to different runtime code.",
        `Compare call index ${index} code digest with the exact-block attestation.`
      );
    }
    if (actual.recipient.toLowerCase() !== allowed.recipient.toLowerCase()) {
      add(
        "recipient-mismatch",
        "Assets or positions can be delivered to an unintended recipient.",
        `Compare call index ${index} decoded recipient with the confirmed wallet.`
      );
    }
    if (actual.token.toLowerCase() !== allowed.token.toLowerCase()) {
      add(
        "token-mismatch",
        "A spend or position can use an unconfirmed token.",
        `Compare call index ${index} decoded token with the confirmed token manifest.`
      );
    }
  }
}

function auditSpendCaps(
  observed: PermissionAuditBundle["activationProposal"]["candidate"]["spendCaps"],
  expected: PermissionAuditBundle["expectedPolicy"]["spendCaps"],
  add: (id: PermissionAuditFindingId, impact: string, reproduction: string) => void
): void {
  for (const required of expected) {
    const cap = observed.find(({ token }) => token.toLowerCase() === required.token.toLowerCase());
    if (cap === undefined || cap.periodSeconds === "0") {
      add(
        "unbounded-spend",
        "The reviewed token lacks a positive amount-and-period authority bound.",
        `Locate the cap for token ${required.token} and verify a declared integer base-unit ceiling plus a positive period.`
      );
      continue;
    }
    if (
      BigInt(cap.limitBaseUnits) > BigInt(required.limitBaseUnits) ||
      BigInt(cap.periodSeconds) > BigInt(required.periodSeconds)
    ) {
      add(
        "spend-cap-exceeded",
        "The candidate permits more value or a longer spend window than wallet confirmation.",
        `Compare token ${required.token} base-unit limit and period with expectedPolicy.spendCaps.`
      );
    }
  }
}

function correctedEnforcementTable(bundle: PermissionAuditBundle) {
  return [
    {
      control: "direct-call-authority",
      enforcementLayer: "altana-or-onchain" as const,
      requirement: `Permit only ${bundle.expectedPolicy.allowedCalls.length} exact target, selector and code-attested direct call(s); no generic dispatcher.`
    },
    {
      control: "wallet-consent",
      enforcementLayer: "explicit-wallet-confirmation" as const,
      requirement: `Confirm chain 97, token, recipient, integer spend caps and expiry ${bundle.expectedPolicy.expiresAtUtc}.`
    },
    {
      control: "runtime-validation",
      enforcementLayer: "proofera-runtime" as const,
      requirement: `Revalidate quote age <= ${bundle.expectedPolicy.maximumQuoteAgeSeconds}s, exact decoded calls, and one append-only ${bundle.expectedPolicy.requiredClaimEnforcementLayer} record before execution.`
    },
    {
      control: "unknown-grant-outcome",
      enforcementLayer: "proofera-runtime" as const,
      requirement:
        bundle.sdkBehavior.callsIdRetainedAfterGrantException === "yes"
          ? "Probe onchain authority by retained callsId before retrying or failing closed."
          : "Treat the outcome as non-retryable unknown; probe authority independently before any new grant."
    },
    {
      control: "revoke",
      enforcementLayer: "altana-or-onchain" as const,
      requirement:
        "Expose and verify an immediate direct revoke path, then reconcile revoked authority onchain."
    },
    {
      control: "session-signer-custody",
      enforcementLayer: "proofera-runtime" as const,
      requirement:
        "Keep the scoped session signer only in a dedicated encrypted worker secret/KMS; never return or log it."
    }
  ];
}

export function canonicalPermissionAuditOutput(input: unknown): string {
  return canonicalJson(auditPermissionBundle(input));
}
