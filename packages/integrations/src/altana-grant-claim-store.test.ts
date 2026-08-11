import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL,
  ALTANA_GRANT_CLAIM_INSERT_SQL,
  ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL,
  altanaGrantClaimConflictParameters,
  altanaGrantClaimInsertParameters,
  createAltanaGrantClaimStoreError,
  interpretAltanaGrantClaimConflictProjection,
  interpretAltanaGrantClaimInsertProjection,
  isAuthenticAltanaGrantClaimResult,
  isAuthenticAltanaGrantClaimStoreError,
  parseAltanaGrantClaimReceiptProjection,
  parseAltanaGrantSubmissionClaim
} from "./altana-grant-claim-store";
import { persistedClaimRow, testClaim } from "./altana-grant-claim-postgres-test-support";

const SEMANTIC_HASH = "a".repeat(64);
const DEPLOYMENT_ID = "4c3c2072-69e7-47ab-99c5-8f31a9a824c1";

describe("Altana grant-claim strict data boundary", () => {
  it("exposes only fixed schema-qualified receipt, insert, and conflict SQL", () => {
    expect(ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL).toContain(
      "FROM proofera_altana_grant_claim.schema_receipt"
    );
    expect(ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL).toContain("LIMIT 2");
    expect(ALTANA_GRANT_CLAIM_INSERT_SQL).toContain(
      "INSERT INTO proofera_altana_grant_claim.submission_claims"
    );
    expect(ALTANA_GRANT_CLAIM_INSERT_SQL).toContain("VALUES ($1, $2, $3, $4, $5, $6, $7, $8)");
    expect(ALTANA_GRANT_CLAIM_INSERT_SQL).toContain("ON CONFLICT DO NOTHING");
    expect(ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL).toContain(
      "FROM proofera_altana_grant_claim.submission_claims"
    );
    expect(ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL).toContain("LIMIT 5");
  });

  it("snapshots only an exact descriptor-safe claim and produces bounded parameters", () => {
    const claim = testClaim();
    expect(parseAltanaGrantSubmissionClaim(claim)).toEqual(claim);
    expect(altanaGrantClaimInsertParameters(claim)).toEqual([
      1,
      claim.bootstrapId,
      claim.idempotencyKey,
      claim.bootstrapBindingHash,
      claim.submissionBindingHash,
      "grant_ready",
      "grant_submitting",
      claim.grantSubmittedAt
    ]);
    expect(altanaGrantClaimConflictParameters(claim)).toEqual([
      claim.bootstrapId,
      claim.idempotencyKey,
      claim.bootstrapBindingHash,
      claim.submissionBindingHash
    ]);
    expect(parseAltanaGrantSubmissionClaim({ ...claim, unexpected: true })).toBeNull();
    expect(
      parseAltanaGrantSubmissionClaim(
        Object.defineProperty({ ...claim }, "bootstrapId", { get: () => claim.bootstrapId })
      )
    ).toBeNull();
  });

  it("mints an authentic claimed result only from one exact persisted row", () => {
    const claim = testClaim();
    const decision = interpretAltanaGrantClaimInsertProjection(
      { rowCount: 1, rows: [persistedClaimRow(claim, "claimed")] },
      claim
    );
    expect(decision).toMatchObject({ status: "claimed", result: { status: "claimed" } });
    if (decision.status !== "claimed") throw new Error("Expected claimed decision.");
    expect(isAuthenticAltanaGrantClaimResult(decision.result)).toBe(true);
    expect(isAuthenticAltanaGrantClaimResult(Object.freeze({ ...decision.result }))).toBe(false);
  });

  it("distinguishes exact replay, immutable conflict, and malformed projections", () => {
    const claim = testClaim();
    expect(interpretAltanaGrantClaimInsertProjection({ rowCount: 0, rows: [] }, claim)).toEqual({
      status: "read_conflict"
    });
    expect(
      interpretAltanaGrantClaimConflictProjection(
        { rowCount: 1, rows: [persistedClaimRow(claim, "already_claimed")] },
        claim
      )
    ).toMatchObject({ status: "already_claimed" });
    expect(
      interpretAltanaGrantClaimConflictProjection(
        { rowCount: 1, rows: [persistedClaimRow(testClaim(2), "already_claimed")] },
        claim
      )
    ).toEqual({ status: "conflict" });
    expect(
      interpretAltanaGrantClaimConflictProjection(
        {
          rowCount: 2,
          rows: [
            persistedClaimRow(claim, "already_claimed"),
            persistedClaimRow(testClaim(2), "already_claimed")
          ]
        },
        claim
      )
    ).toEqual({ status: "conflict" });
    expect(
      interpretAltanaGrantClaimInsertProjection(
        { rowCount: 1, rows: [{ ...persistedClaimRow(claim, "claimed"), extra: true }] },
        claim
      )
    ).toEqual({ status: "invalid" });
  });

  it("requires the exact immutable receipt metadata and a nonzero canonical UUID", () => {
    const projection = {
      rowCount: 1,
      rows: [
        {
          migrationVersion: 1,
          domainSchemaVersion: 1,
          postgresMajor: 17,
          semanticContractSha256: SEMANTIC_HASH,
          deploymentId: DEPLOYMENT_ID
        }
      ]
    };
    expect(parseAltanaGrantClaimReceiptProjection(projection, SEMANTIC_HASH)).toEqual({
      migrationVersion: 1,
      domainSchemaVersion: 1,
      postgresMajor: 17,
      semanticContractSha256: SEMANTIC_HASH,
      deploymentId: DEPLOYMENT_ID
    });
    expect(
      parseAltanaGrantClaimReceiptProjection(
        {
          ...projection,
          rows: [{ ...projection.rows[0], deploymentId: "00000000-0000-0000-0000-000000000000" }]
        },
        SEMANTIC_HASH
      )
    ).toBeNull();
    expect(parseAltanaGrantClaimReceiptProjection(projection, "b".repeat(64))).toBeNull();
  });

  it("uses nominal sanitized errors without retaining database detail", () => {
    const error = createAltanaGrantClaimStoreError("DATABASE_OUTCOME_UNKNOWN", "unknown");
    expect(isAuthenticAltanaGrantClaimStoreError(error)).toBe(true);
    expect(isAuthenticAltanaGrantClaimStoreError(Object.freeze({ ...error }))).toBe(false);
    expect(error).toMatchObject({
      code: "DATABASE_OUTCOME_UNKNOWN",
      claimOutcome: "unknown"
    });
    expect(Object.keys(error)).not.toContain("cause");
  });
});
