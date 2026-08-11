import type { AltanaGrantSubmissionClaim } from "./altana-grant";

export const TEST_DEPLOYMENT_ID = "4c3c2072-69e7-47ab-99c5-8f31a9a824c1";

export function testHash(seed: number): `0x${string}` {
  const byte = ((seed % 256) + 256) % 256;
  return `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;
}

export function testClaim(
  seed = 1,
  overrides: Partial<AltanaGrantSubmissionClaim> = {}
): AltanaGrantSubmissionClaim {
  return {
    schemaVersion: 1,
    bootstrapId: `bootstrap:test:grant-claim:${seed}`,
    idempotencyKey: testHash(seed),
    bootstrapBindingHash: testHash(seed + 32),
    submissionBindingHash: testHash(seed + 64),
    priorStatus: "grant_ready",
    nextStatus: "grant_submitting",
    grantSubmittedAt: 1_800_000_000 + seed,
    ...overrides
  };
}

export function persistedClaimRow(
  claim: AltanaGrantSubmissionClaim,
  status: "already_claimed" | "claimed"
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    claimSchemaVersion: claim.schemaVersion,
    bootstrapId: claim.bootstrapId,
    idempotencyKey: claim.idempotencyKey,
    bootstrapBindingHash: claim.bootstrapBindingHash,
    submissionBindingHash: claim.submissionBindingHash,
    priorStatus: claim.priorStatus,
    nextStatus: claim.nextStatus,
    grantSubmittedAt: String(claim.grantSubmittedAt),
    status
  });
}

function rawField(name: string): Readonly<Record<string, unknown>> {
  return {
    columnID: 0,
    dataTypeID: 25,
    dataTypeModifier: -1,
    dataTypeSize: -1,
    format: "text",
    name,
    tableID: 0
  };
}

export function rawNodePostgresResult(
  command: "BEGIN" | "COMMIT" | "INSERT" | "ROLLBACK" | "SELECT",
  fieldNames: readonly string[],
  rows: readonly Readonly<Record<string, unknown>>[],
  oid: 0 | null = null,
  rowCount: number | null = rows.length
): Readonly<Record<string, unknown>> {
  return {
    RowCtor: null,
    _parsers: Object.freeze([]),
    _prebuiltEmptyResultObject: null,
    _types: Object.freeze({}),
    command,
    fields: fieldNames.map(rawField),
    oid,
    rowAsArray: false,
    rowCount,
    rows: [...rows]
  };
}
