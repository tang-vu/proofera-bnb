import { createHash } from "node:crypto";

import { z } from "zod";

export const PERMISSION_AUDIT_SKILL = "audit_altana_permission_bundle" as const;
export const PERMISSION_AUDIT_ENGINE_VERSION =
  "proofera-termix-permission-audit-engine-v1.0.0" as const;

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u);
const selectorSchema = z.string().regex(/^0x[0-9a-fA-F]{8}$/u);
const transactionHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/u);
const blockHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/u);
const decimalIntegerSchema = z.string().regex(/^(0|[1-9][0-9]*)$/u);
const utcSchema = z
  .string()
  .datetime({ offset: false })
  .refine((value) => value.endsWith("Z"));

const evidenceReferenceSchema = z
  .object({
    artifactId: idSchema,
    locator: z.string().trim().min(1).max(1_000),
    sha256: sha256Schema
  })
  .strict();

const directCallSchema = z
  .object({
    codeSha256: sha256Schema,
    recipient: addressSchema,
    selector: selectorSchema,
    target: addressSchema,
    token: addressSchema
  })
  .strict();

const spendCapSchema = z
  .object({
    limitBaseUnits: decimalIntegerSchema,
    periodSeconds: decimalIntegerSchema,
    token: addressSchema
  })
  .strict();

const candidatePolicySchema = z
  .object({
    calls: z.array(directCallSchema).min(1).max(20),
    chainId: z.number().int().positive(),
    dispatcher: z.enum(["direct-only", "generic"]),
    expiresAtUtc: utcSchema,
    quoteObservedAtUtc: utcSchema,
    revokePath: z.enum(["present", "missing"]),
    sessionSignerExposure: z.enum(["none", "raw-material"]),
    spendCaps: z.array(spendCapSchema).max(20),
    unknownOutcomePolicy: z.enum(["probe-before-retry", "retry-immediately", "halt-and-probe"])
  })
  .strict();

const expectedPolicySchema = z
  .object({
    allowedCalls: z.array(directCallSchema).min(1).max(20),
    chainId: z.literal(97),
    expiresAtUtc: utcSchema,
    maximumQuoteAgeSeconds: z.number().int().positive().max(86_400),
    spendCaps: z.array(spendCapSchema).min(1).max(20)
  })
  .strict();

const auditCaseSchema = z
  .object({
    candidate: candidatePolicySchema,
    caseId: idSchema,
    evidenceArtifactIds: z.array(idSchema).min(1).max(30)
  })
  .strict();

export const permissionAuditBundleSchema = z
  .object({
    activationProposal: auditCaseSchema,
    adversarialCorpus: z.array(auditCaseSchema).min(1).max(100),
    authorityLifecycle: z
      .object({
        chainId: z.literal(97),
        finalAuthorityState: z.literal("revoked"),
        grantBlockHash: blockHashSchema,
        grantObservedAtUtc: utcSchema,
        grantTransactionHash: transactionHashSchema,
        revokeBlockHash: blockHashSchema,
        revokeObservedAtUtc: utcSchema,
        revokeTransactionHash: transactionHashSchema
      })
      .strict(),
    codeAuthorityAttestation: z
      .object({
        attestedCalls: z.array(directCallSchema).min(1).max(20),
        blockHash: blockHashSchema,
        blockNumber: decimalIntegerSchema,
        chainId: z.literal(97)
      })
      .strict(),
    durableClaimState: z
      .object({
        claimState: z.literal("claimed"),
        databaseDeploymentReceiptArtifactId: idSchema,
        reservationId: idSchema,
        unknownOutcomeRetryAllowed: z.literal(false)
      })
      .strict(),
    evidence: z.array(evidenceReferenceSchema).min(1).max(200),
    expectedPolicy: expectedPolicySchema,
    frozenAtUtc: utcSchema,
    schemaVersion: z.literal("proofera-termix-permission-audit-bundle-v1.0.0"),
    sdkBehavior: z
      .object({
        callsIdRetainedAfterGrantException: z.enum(["yes", "no", "unknown"]),
        evidenceArtifactId: idSchema,
        packageBytesSha256: sha256Schema,
        version: z.literal("0.7.0")
      })
      .strict(),
    sourceBindings: z
      .object({
        activationProposalArtifactId: idSchema,
        adversarialCorpusArtifactId: idSchema,
        authorityLifecycleReceiptsArtifactId: idSchema,
        codeAuthorityAttestationArtifactId: idSchema,
        sdkBehaviorEvidenceArtifactId: idSchema
      })
      .strict()
  })
  .strict();

export type PermissionAuditBundle = z.infer<typeof permissionAuditBundleSchema>;

const severityByFindingId = {
  "code-substitution": "critical",
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

type FindingId = keyof typeof severityByFindingId;

export interface PermissionAuditFinding {
  readonly caseId: string;
  readonly evidenceArtifactIds: readonly string[];
  readonly findingId: FindingId;
  readonly impact: string;
  readonly reproduction: string;
  readonly severity: "critical" | "high";
}

export interface PermissionAuditResult {
  readonly bundleSha256: string;
  readonly correctedEnforcementTable: readonly {
    readonly control: string;
    readonly enforcementLayer:
      "altana-or-onchain" | "explicit-wallet-confirmation" | "proofera-runtime";
    readonly requirement: string;
  }[];
  readonly executionPerformed: false;
  readonly findings: readonly PermissionAuditFinding[];
  readonly limitations: readonly string[];
  readonly schemaVersion: "proofera-termix-permission-audit-output-v1.0.0";
}

export function auditPermissionBundle(input: unknown): PermissionAuditResult {
  const bundle = permissionAuditBundleSchema.parse(input);
  validateEvidence(bundle);
  const findings = [bundle.activationProposal, ...bundle.adversarialCorpus]
    .flatMap((auditCase) => auditCaseAgainstExpected(auditCase, bundle))
    .sort((left, right) =>
      `${left.caseId}:${left.findingId}`.localeCompare(`${right.caseId}:${right.findingId}`)
    );
  return {
    bundleSha256: sha256Canonical(bundle),
    correctedEnforcementTable: correctedEnforcementTable(bundle),
    executionPerformed: false,
    findings,
    limitations: [
      "This report compares only the frozen declarative bundle; it does not prove that a deployed runtime enforces the corrected policy.",
      "Evidence references are digest-bound locators, not independent proof that their source contents are authentic or complete.",
      "The read-only audit does not grant, sign, submit, broadcast, revoke or mutate durable state."
    ],
    schemaVersion: "proofera-termix-permission-audit-output-v1.0.0"
  };
}

export interface PermissionAuditInputError {
  readonly error: "INVALID_PERMISSION_AUDIT_INPUT";
  readonly executionEnabled: false;
  readonly issues: readonly { readonly message: string; readonly path: string }[];
}

export function handlePermissionAuditA2a(
  data: Record<string, unknown>
): PermissionAuditResult | PermissionAuditInputError {
  const request = z
    .object({ skill: z.literal(PERMISSION_AUDIT_SKILL), bundle: permissionAuditBundleSchema })
    .strict()
    .safeParse(data);
  if (!request.success) {
    return {
      error: "INVALID_PERMISSION_AUDIT_INPUT",
      executionEnabled: false,
      issues: request.error.issues.slice(0, 12).map((issue) => ({
        message: issue.message.slice(0, 240),
        path: issue.path.join(".")
      }))
    };
  }
  try {
    return auditPermissionBundle(request.data.bundle);
  } catch (error) {
    return {
      error: "INVALID_PERMISSION_AUDIT_INPUT",
      executionEnabled: false,
      issues: [
        {
          message: error instanceof Error ? error.message.slice(0, 240) : "invalid bundle",
          path: "bundle"
        }
      ]
    };
  }
}

function validateEvidence(bundle: PermissionAuditBundle): void {
  const evidenceIds = new Set(bundle.evidence.map(({ artifactId }) => artifactId));
  if (evidenceIds.size !== bundle.evidence.length)
    throw new Error("evidence identifiers duplicate");
  const cases = [bundle.activationProposal, ...bundle.adversarialCorpus];
  const caseIds = new Set<string>();
  for (const auditCase of cases) {
    if (caseIds.has(auditCase.caseId)) throw new Error("case identifiers duplicate");
    caseIds.add(auditCase.caseId);
    if (auditCase.evidenceArtifactIds.some((artifactId) => !evidenceIds.has(artifactId))) {
      throw new Error("case evidence is unbound");
    }
  }
  if (new Date(bundle.expectedPolicy.expiresAtUtc) <= new Date(bundle.frozenAtUtc)) {
    throw new Error("expected policy is already expired");
  }
  const requiredSourceIds = [
    ...Object.values(bundle.sourceBindings),
    bundle.durableClaimState.databaseDeploymentReceiptArtifactId
  ];
  if (new Set(requiredSourceIds).size !== requiredSourceIds.length) {
    throw new Error("source bindings duplicate");
  }
  if (requiredSourceIds.some((artifactId) => !evidenceIds.has(artifactId))) {
    throw new Error("source binding is unbound");
  }
  if (
    bundle.sdkBehavior.evidenceArtifactId !== bundle.sourceBindings.sdkBehaviorEvidenceArtifactId
  ) {
    throw new Error("SDK evidence binding mismatches");
  }
  if (
    sha256Canonical(bundle.codeAuthorityAttestation.attestedCalls) !==
    sha256Canonical(bundle.expectedPolicy.allowedCalls)
  ) {
    throw new Error("code authority mismatches expected calls");
  }
  if (
    bundle.authorityLifecycle.grantTransactionHash.toLowerCase() ===
    bundle.authorityLifecycle.revokeTransactionHash.toLowerCase()
  ) {
    throw new Error("lifecycle transaction identifiers duplicate");
  }
  if (
    new Date(bundle.authorityLifecycle.revokeObservedAtUtc) <=
    new Date(bundle.authorityLifecycle.grantObservedAtUtc)
  ) {
    throw new Error("lifecycle observation order is invalid");
  }
}

function auditCaseAgainstExpected(
  auditCase: PermissionAuditBundle["activationProposal"],
  bundle: PermissionAuditBundle
): PermissionAuditFinding[] {
  const { candidate } = auditCase;
  const findings: PermissionAuditFinding[] = [];
  const add = (findingId: FindingId, impact: string, reproduction: string): void => {
    findings.push({
      caseId: auditCase.caseId,
      evidenceArtifactIds: [...auditCase.evidenceArtifactIds].sort(),
      findingId,
      impact,
      reproduction,
      severity: severityByFindingId[findingId]
    });
  };
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
    (new Date(bundle.frozenAtUtc).getTime() - new Date(candidate.quoteObservedAtUtc).getTime()) /
      1_000
  );
  if (quoteAgeSeconds < 0 || quoteAgeSeconds > bundle.expectedPolicy.maximumQuoteAgeSeconds) {
    add(
      "stale-quote",
      "The action may execute against price assumptions outside the confirmed freshness window.",
      "Subtract quoteObservedAtUtc from frozenAtUtc and compare with maximumQuoteAgeSeconds."
    );
  }
  auditCalls(candidate.calls, bundle.expectedPolicy.allowedCalls, add);
  auditSpendCaps(candidate.spendCaps, bundle.expectedPolicy.spendCaps, add);
  return findings;
}

function auditCalls(
  observed: PermissionAuditBundle["activationProposal"]["candidate"]["calls"],
  expected: PermissionAuditBundle["expectedPolicy"]["allowedCalls"],
  add: (id: FindingId, impact: string, reproduction: string) => void
): void {
  for (let index = 0; index < Math.max(observed.length, expected.length); index += 1) {
    const actual = observed.at(index);
    const allowed = expected.at(index);
    if (
      actual === undefined ||
      allowed === undefined ||
      actual.target.toLowerCase() !== allowed.target.toLowerCase()
    ) {
      add(
        "target-mismatch",
        "A call can reach an unreviewed target or omit a required target.",
        `Compare call index ${String(index)} target with the allowed direct-call manifest.`
      );
    }
    if (actual === undefined || allowed === undefined) continue;
    if (actual.selector.toLowerCase() !== allowed.selector.toLowerCase()) {
      add(
        "selector-mismatch",
        "The target can execute a function outside the wallet-confirmed selector set.",
        `Compare call index ${String(index)} selector with the allowed direct-call manifest.`
      );
    }
    if (actual.codeSha256 !== allowed.codeSha256) {
      add(
        "code-substitution",
        "Reviewed selectors may resolve to different runtime code.",
        `Compare call index ${String(index)} code digest with the exact-block attestation.`
      );
    }
    if (actual.recipient.toLowerCase() !== allowed.recipient.toLowerCase()) {
      add(
        "recipient-mismatch",
        "Assets or positions can be delivered to an unintended recipient.",
        `Compare call index ${String(index)} decoded recipient with the confirmed wallet.`
      );
    }
    if (actual.token.toLowerCase() !== allowed.token.toLowerCase()) {
      add(
        "token-mismatch",
        "A spend or position can use an unconfirmed token.",
        `Compare call index ${String(index)} decoded token with the confirmed token manifest.`
      );
    }
  }
}

function auditSpendCaps(
  observed: PermissionAuditBundle["activationProposal"]["candidate"]["spendCaps"],
  expected: PermissionAuditBundle["expectedPolicy"]["spendCaps"],
  add: (id: FindingId, impact: string, reproduction: string) => void
): void {
  for (const required of expected) {
    const cap = observed.find(({ token }) => token.toLowerCase() === required.token.toLowerCase());
    if (cap === undefined || cap.limitBaseUnits === "0" || cap.periodSeconds === "0") {
      add(
        "unbounded-spend",
        "The reviewed token lacks a positive amount-and-period authority bound.",
        `Locate the cap for token ${required.token} and verify positive integer base units and period.`
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

function correctedEnforcementTable(
  bundle: PermissionAuditBundle
): PermissionAuditResult["correctedEnforcementTable"] {
  return [
    {
      control: "direct-call-authority",
      enforcementLayer: "altana-or-onchain",
      requirement: `Permit only ${String(bundle.expectedPolicy.allowedCalls.length)} exact target, selector and code-attested direct call(s); no generic dispatcher.`
    },
    {
      control: "wallet-consent",
      enforcementLayer: "explicit-wallet-confirmation",
      requirement: `Confirm chain 97, token, recipient, integer spend caps and expiry ${bundle.expectedPolicy.expiresAtUtc}.`
    },
    {
      control: "runtime-validation",
      enforcementLayer: "proofera-runtime",
      requirement: `Revalidate quote age <= ${String(bundle.expectedPolicy.maximumQuoteAgeSeconds)}s, reservation/claim state and exact decoded calls before execution.`
    },
    {
      control: "unknown-grant-outcome",
      enforcementLayer: "proofera-runtime",
      requirement:
        bundle.sdkBehavior.callsIdRetainedAfterGrantException === "yes"
          ? "Probe onchain authority by retained callsId before retrying or failing closed."
          : "Treat the outcome as non-retryable unknown; probe authority independently before any new grant."
    },
    {
      control: "revoke",
      enforcementLayer: "altana-or-onchain",
      requirement:
        "Expose and verify an immediate direct revoke path, then reconcile revoked authority onchain."
    },
    {
      control: "session-signer-custody",
      enforcementLayer: "proofera-runtime",
      requirement:
        "Keep the scoped session signer only in a dedicated encrypted worker secret/KMS; never return or log it."
    }
  ];
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  return encodeCanonical(value, new Set<object>());
}

function encodeCanonical(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("canonical JSON requires safe integers");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value !== "object") throw new TypeError("unsupported canonical JSON value");
  if (ancestors.has(value)) throw new TypeError("canonical JSON cycle");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => encodeCanonical(entry, ancestors)).join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${encodeCanonical(record[key], ancestors)}`)
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
