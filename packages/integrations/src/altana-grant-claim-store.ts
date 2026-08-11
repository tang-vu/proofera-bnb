import "server-only";

import { altanaGrantSubmissionClaimSchema, type AltanaGrantSubmissionClaim } from "./altana-grant";

export const ALTANA_GRANT_CLAIM_OWNER_ROLE = "proofera_grant_claim_owner";
export const ALTANA_GRANT_CLAIM_APP_ROLE = "proofera_grant_claim_app";
export const ALTANA_GRANT_CLAIM_SCHEMA_NAME = "proofera_altana_grant_claim";
export const ALTANA_GRANT_CLAIM_TABLE_NAME = `${ALTANA_GRANT_CLAIM_SCHEMA_NAME}.submission_claims`;
export const ALTANA_GRANT_CLAIM_RECEIPT_TABLE_NAME = `${ALTANA_GRANT_CLAIM_SCHEMA_NAME}.schema_receipt`;

const CLAIM_ROW_COLUMNS = `
  schema_version AS "claimSchemaVersion",
  bootstrap_id AS "bootstrapId",
  idempotency_key AS "idempotencyKey",
  bootstrap_binding_hash AS "bootstrapBindingHash",
  submission_binding_hash AS "submissionBindingHash",
  prior_status AS "priorStatus",
  next_status AS "nextStatus",
  grant_submitted_at::text AS "grantSubmittedAt"
`.trim();

export const ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL = `
SELECT
  migration_version AS "migrationVersion",
  domain_schema_version AS "domainSchemaVersion",
  postgres_major AS "postgresMajor",
  semantic_contract_sha256 AS "semanticContractSha256",
  deployment_id::text AS "deploymentId"
FROM ${ALTANA_GRANT_CLAIM_RECEIPT_TABLE_NAME}
WHERE migration_version = 1
LIMIT 2
`.trim();

export const ALTANA_GRANT_CLAIM_INSERT_SQL = `
INSERT INTO ${ALTANA_GRANT_CLAIM_TABLE_NAME} (
  schema_version,
  bootstrap_id,
  idempotency_key,
  bootstrap_binding_hash,
  submission_binding_hash,
  prior_status,
  next_status,
  grant_submitted_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT DO NOTHING
RETURNING
  ${CLAIM_ROW_COLUMNS},
  'claimed'::text AS status
`.trim();

export const ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL = `
SELECT
  ${CLAIM_ROW_COLUMNS},
  'already_claimed'::text AS status
FROM ${ALTANA_GRANT_CLAIM_TABLE_NAME}
WHERE bootstrap_id = $1
   OR idempotency_key = $2
   OR bootstrap_binding_hash = $3
   OR submission_binding_hash = $4
ORDER BY bootstrap_id ASC
LIMIT 5
`.trim();

export const ALTANA_GRANT_CLAIM_RECEIPT_RESULT_FIELDS = Object.freeze([
  "migrationVersion",
  "domainSchemaVersion",
  "postgresMajor",
  "semanticContractSha256",
  "deploymentId"
] as const);

export const ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS = Object.freeze([
  "claimSchemaVersion",
  "bootstrapId",
  "idempotencyKey",
  "bootstrapBindingHash",
  "submissionBindingHash",
  "priorStatus",
  "nextStatus",
  "grantSubmittedAt",
  "status"
] as const);

export type AltanaGrantClaimPostgresParameter = string | number;

export type AltanaGrantClaimProjection = Readonly<{
  rows: readonly unknown[];
  rowCount: number | null;
}>;

export type AltanaGrantClaimResult = Readonly<{
  status: "claimed" | "already_claimed";
  bootstrapId: string;
  idempotencyKey: `0x${string}`;
  bootstrapBindingHash: `0x${string}`;
  submissionBindingHash: `0x${string}`;
  grantSubmittedAt: number;
}>;

export interface AltanaGrantSubmissionClaimStore {
  readonly claimSubmission: (claim: AltanaGrantSubmissionClaim) => Promise<AltanaGrantClaimResult>;
}

export type AltanaGrantClaimOutcome =
  "not_attempted" | "rolled_back" | "committed_unusable" | "unknown";

export type AltanaGrantClaimStoreErrorCode =
  | "CLAIM_CONFLICT"
  | "CLAIM_INVALID"
  | "DATABASE_OUTCOME_UNKNOWN"
  | "DATABASE_PREWRITE_FAILED"
  | "DATABASE_RESULT_INVALID"
  | "DATABASE_ROLLED_BACK"
  | "SCHEMA_NOT_READY"
  | "SERVER_RUNTIME_REQUIRED";

const ERROR_MESSAGES: Readonly<Record<AltanaGrantClaimStoreErrorCode, string>> = Object.freeze({
  CLAIM_CONFLICT: "An immutable Altana grant-claim identifier is already bound differently.",
  CLAIM_INVALID: "The Altana grant claim is invalid, unbounded, or not descriptor-safe.",
  DATABASE_OUTCOME_UNKNOWN:
    "The durable grant-claim outcome is unknown; reconcile the exact immutable claim.",
  DATABASE_PREWRITE_FAILED: "The grant-claim database failed before a write was attempted.",
  DATABASE_RESULT_INVALID: "The grant-claim database returned an invalid result.",
  DATABASE_ROLLED_BACK: "The grant-claim transaction was rolled back.",
  SCHEMA_NOT_READY: "A fresh canonical grant-claim database verification is required.",
  SERVER_RUNTIME_REQUIRED: "The PostgreSQL grant-claim boundary is server-only."
});

/** Safe public error: no driver, URL, receipt, row, SQL, or raw message is retained. */
export class AltanaGrantClaimStoreError extends Error {
  override readonly name = "AltanaGrantClaimStoreError";
  readonly code: AltanaGrantClaimStoreErrorCode;
  readonly claimOutcome: AltanaGrantClaimOutcome;

  constructor(code: AltanaGrantClaimStoreErrorCode, claimOutcome: AltanaGrantClaimOutcome) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
    this.claimOutcome = claimOutcome;
  }
}

const AUTHENTIC_STORE_ERRORS = new WeakSet<object>();

/** Internal constructor used by the same-pool server composition. */
export function createAltanaGrantClaimStoreError(
  code: AltanaGrantClaimStoreErrorCode,
  claimOutcome: AltanaGrantClaimOutcome
): AltanaGrantClaimStoreError {
  const error = new AltanaGrantClaimStoreError(code, claimOutcome);
  AUTHENTIC_STORE_ERRORS.add(error);
  return error;
}

export function isAuthenticAltanaGrantClaimStoreError(
  input: unknown
): input is AltanaGrantClaimStoreError {
  try {
    return typeof input === "object" && input !== null && AUTHENTIC_STORE_ERRORS.has(input);
  } catch {
    return false;
  }
}

const CLAIM_KEYS = Object.freeze([
  "bootstrapBindingHash",
  "bootstrapId",
  "grantSubmittedAt",
  "idempotencyKey",
  "nextStatus",
  "priorStatus",
  "schemaVersion",
  "submissionBindingHash"
] as const);

const CLAIM_ROW_KEYS = Object.freeze([
  "bootstrapBindingHash",
  "bootstrapId",
  "claimSchemaVersion",
  "grantSubmittedAt",
  "idempotencyKey",
  "nextStatus",
  "priorStatus",
  "status",
  "submissionBindingHash"
] as const);

const RECEIPT_ROW_KEYS = Object.freeze([
  "deploymentId",
  "domainSchemaVersion",
  "migrationVersion",
  "postgresMajor",
  "semanticContractSha256"
] as const);

const AUTHENTIC_RESULTS = new WeakSet<object>();

function snapshotExactDataObject(
  input: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(input).some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const actualKeys = Object.keys(descriptors).sort();
    const expected = [...expectedKeys].sort();
    if (
      actualKeys.length !== expected.length ||
      actualKeys.some((key, index) => key !== expected[index])
    ) {
      return null;
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function snapshotBoundedDataArray(
  input: unknown,
  maximumLength: number
): readonly unknown[] | null {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return null;
    const length = input.length;
    if (!Number.isSafeInteger(length) || length < 0 || length > maximumLength) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const expectedKeys = [
      ...Array.from({ length }, (_unused, index) => index.toString(10)),
      "length"
    ].sort();
    const actualKeys = Reflect.ownKeys(input).map(String).sort();
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      return null;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[index.toString(10)];
      if (descriptor === undefined || !("value" in descriptor)) return null;
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function parseProjectionRows(input: unknown, maximumRows: number): readonly unknown[] | null {
  const projection = snapshotExactDataObject(input, ["rowCount", "rows"]);
  if (projection === null) return null;
  if (
    projection.rowCount !== null &&
    (typeof projection.rowCount !== "number" ||
      !Number.isSafeInteger(projection.rowCount) ||
      projection.rowCount < 0)
  ) {
    return null;
  }
  const rows = snapshotBoundedDataArray(projection.rows, maximumRows);
  return rows !== null && (projection.rowCount === null || projection.rowCount === rows.length)
    ? rows
    : null;
}

export function parseAltanaGrantSubmissionClaim(input: unknown): AltanaGrantSubmissionClaim | null {
  const snapshot = snapshotExactDataObject(input, CLAIM_KEYS);
  if (snapshot === null) return null;
  const parsed = altanaGrantSubmissionClaimSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}

export function altanaGrantClaimInsertParameters(
  claim: AltanaGrantSubmissionClaim
): readonly AltanaGrantClaimPostgresParameter[] {
  return Object.freeze([
    claim.schemaVersion,
    claim.bootstrapId,
    claim.idempotencyKey,
    claim.bootstrapBindingHash,
    claim.submissionBindingHash,
    claim.priorStatus,
    claim.nextStatus,
    claim.grantSubmittedAt
  ]);
}

export function altanaGrantClaimConflictParameters(
  claim: AltanaGrantSubmissionClaim
): readonly AltanaGrantClaimPostgresParameter[] {
  return Object.freeze([
    claim.bootstrapId,
    claim.idempotencyKey,
    claim.bootstrapBindingHash,
    claim.submissionBindingHash
  ]);
}

type PersistedClaimRow = Readonly<{
  claim: AltanaGrantSubmissionClaim;
  status: "claimed" | "already_claimed";
}>;

function parseGrantSubmittedAt(input: unknown): number | null {
  if (typeof input !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(input)) return null;
  const value = Number(input);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parsePersistedRow(
  input: unknown,
  expectedStatus: PersistedClaimRow["status"]
): PersistedClaimRow | null {
  const snapshot = snapshotExactDataObject(input, CLAIM_ROW_KEYS);
  if (snapshot === null || snapshot.status !== expectedStatus) return null;
  const grantSubmittedAt = parseGrantSubmittedAt(snapshot.grantSubmittedAt);
  if (grantSubmittedAt === null) return null;
  const parsed = altanaGrantSubmissionClaimSchema.safeParse({
    schemaVersion: snapshot.claimSchemaVersion,
    bootstrapId: snapshot.bootstrapId,
    idempotencyKey: snapshot.idempotencyKey,
    bootstrapBindingHash: snapshot.bootstrapBindingHash,
    submissionBindingHash: snapshot.submissionBindingHash,
    priorStatus: snapshot.priorStatus,
    nextStatus: snapshot.nextStatus,
    grantSubmittedAt
  });
  return parsed.success ? Object.freeze({ claim: parsed.data, status: expectedStatus }) : null;
}

function isExactClaim(left: AltanaGrantSubmissionClaim, right: AltanaGrantSubmissionClaim) {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.bootstrapId === right.bootstrapId &&
    left.idempotencyKey === right.idempotencyKey &&
    left.bootstrapBindingHash === right.bootstrapBindingHash &&
    left.submissionBindingHash === right.submissionBindingHash &&
    left.priorStatus === right.priorStatus &&
    left.nextStatus === right.nextStatus &&
    left.grantSubmittedAt === right.grantSubmittedAt
  );
}

function resultFromRow(row: PersistedClaimRow): AltanaGrantClaimResult {
  const result = Object.freeze({
    status: row.status,
    bootstrapId: row.claim.bootstrapId,
    idempotencyKey: row.claim.idempotencyKey,
    bootstrapBindingHash: row.claim.bootstrapBindingHash,
    submissionBindingHash: row.claim.submissionBindingHash,
    grantSubmittedAt: row.claim.grantSubmittedAt
  });
  AUTHENTIC_RESULTS.add(result);
  return result;
}

export function isAuthenticAltanaGrantClaimResult(input: unknown): input is AltanaGrantClaimResult {
  try {
    return typeof input === "object" && input !== null && AUTHENTIC_RESULTS.has(input);
  } catch {
    return false;
  }
}

export type AltanaGrantClaimInsertDecision =
  | Readonly<{ status: "claimed"; result: AltanaGrantClaimResult }>
  | Readonly<{ status: "read_conflict" }>
  | Readonly<{ status: "invalid" }>;

export function interpretAltanaGrantClaimInsertProjection(
  input: unknown,
  claim: AltanaGrantSubmissionClaim
): AltanaGrantClaimInsertDecision {
  const rows = parseProjectionRows(input, 1);
  if (rows === null) return Object.freeze({ status: "invalid" as const });
  if (rows.length === 0) return Object.freeze({ status: "read_conflict" as const });
  const parsed = parsePersistedRow(rows[0], "claimed");
  return parsed !== null && isExactClaim(parsed.claim, claim)
    ? Object.freeze({ status: "claimed" as const, result: resultFromRow(parsed) })
    : Object.freeze({ status: "invalid" as const });
}

export type AltanaGrantClaimConflictDecision =
  | Readonly<{ status: "already_claimed"; result: AltanaGrantClaimResult }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "invalid" }>;

export function interpretAltanaGrantClaimConflictProjection(
  input: unknown,
  claim: AltanaGrantSubmissionClaim
): AltanaGrantClaimConflictDecision {
  const rows = parseProjectionRows(input, 4);
  if (rows === null || rows.length === 0) return Object.freeze({ status: "invalid" as const });
  const parsed = rows.map((row) => parsePersistedRow(row, "already_claimed"));
  const only = parsed[0];
  if (parsed.length !== 1 || only === undefined || only === null) {
    return Object.freeze({ status: "conflict" as const });
  }
  return isExactClaim(only.claim, claim)
    ? Object.freeze({ status: "already_claimed" as const, result: resultFromRow(only) })
    : Object.freeze({ status: "conflict" as const });
}

export type AltanaGrantClaimDeploymentReceipt = Readonly<{
  migrationVersion: 1;
  domainSchemaVersion: 1;
  postgresMajor: 17;
  semanticContractSha256: string;
  deploymentId: string;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export function parseAltanaGrantClaimReceiptProjection(
  input: unknown,
  expectedSemanticContractSha256: string
): AltanaGrantClaimDeploymentReceipt | null {
  const rows = parseProjectionRows(input, 1);
  if (rows === null || rows.length !== 1) return null;
  const row = snapshotExactDataObject(rows[0], RECEIPT_ROW_KEYS);
  if (
    row === null ||
    row.migrationVersion !== 1 ||
    row.domainSchemaVersion !== 1 ||
    row.postgresMajor !== 17 ||
    row.semanticContractSha256 !== expectedSemanticContractSha256 ||
    typeof row.deploymentId !== "string" ||
    row.deploymentId === ZERO_UUID ||
    !UUID_PATTERN.test(row.deploymentId)
  ) {
    return null;
  }
  return Object.freeze({
    migrationVersion: 1 as const,
    domainSchemaVersion: 1 as const,
    postgresMajor: 17 as const,
    semanticContractSha256: row.semanticContractSha256,
    deploymentId: row.deploymentId
  });
}
