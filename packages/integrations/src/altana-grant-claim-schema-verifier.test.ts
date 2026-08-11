import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
  ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS,
  ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
  ALTANA_GRANT_CLAIM_COMPUTED_SEMANTIC_CONTRACT_SHA256,
  ALTANA_GRANT_CLAIM_DOMAIN_SCHEMA_VERSION,
  ALTANA_GRANT_CLAIM_MIGRATION_ARTIFACT_SHA256,
  ALTANA_GRANT_CLAIM_MIGRATION_VERSION,
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_PARAMETERS,
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_RESULT_FIELDS,
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL,
  ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256,
  ALTANA_GRANT_CLAIM_SUPPORTED_POSTGRES_MAJOR,
  interpretAltanaGrantClaimSchemaProjection,
  isReviewedAltanaGrantClaimMigrationArtifact,
  type AltanaGrantClaimSchemaVerificationCheck
} from "./altana-grant-claim-schema-verifier";
import { TEST_DEPLOYMENT_ID } from "./altana-grant-claim-postgres-test-support";

const MIGRATION_PATH = new URL(
  "../migrations/0002_altana_grant_claim_schema_v1.sql",
  import.meta.url
);

const CHECKS = Object.freeze([
  ["actorAuthorized", "actor_authorization"],
  ["platformSupported", "platform"],
  ["rolesSafe", "roles"],
  ["ownershipOk", "ownership"],
  ["authorizationSurfaceOk", "authorization_surface"],
  ["policiesAndRulesAbsent", "policies_and_rules"],
  ["semanticReceiptOk", "semantic_receipt"],
  ["namespaceInventoryOk", "namespace_inventory"],
  ["relationsOk", "relations"],
  ["columnsOk", "columns"],
  ["constraintsOk", "constraints"],
  ["indexesOk", "indexes"],
  ["functionsOk", "functions"],
  ["triggersOk", "triggers"],
  ["inheritanceOk", "inheritance"],
  ["aclInventoryOk", "acl_inventory"]
] as const satisfies readonly (readonly [string, AltanaGrantClaimSchemaVerificationCheck])[]);

function verificationRow(overrides: Readonly<Record<string, boolean>> = {}) {
  return Object.freeze({
    ...Object.fromEntries(CHECKS.map(([field]) => [field, overrides[field] ?? true])),
    deploymentId: TEST_DEPLOYMENT_ID
  });
}

function projection(row: Readonly<Record<string, unknown>> = verificationRow()) {
  return Object.freeze({ rowCount: 1, rows: Object.freeze([row]) });
}

function migrationSource(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("Altana grant-claim PostgreSQL migration v1", () => {
  it("pins one fail-on-existing LF-only PostgreSQL 17 artifact", () => {
    const migration = migrationSource();
    expect(migration.includes("\r")).toBe(false);
    expect(createHash("sha256").update(migration, "utf8").digest("hex")).toBe(
      ALTANA_GRANT_CLAIM_MIGRATION_ARTIFACT_SHA256
    );
    expect(isReviewedAltanaGrantClaimMigrationArtifact(migration)).toBe(true);
    expect(isReviewedAltanaGrantClaimMigrationArtifact(`${migration}\n-- drift`)).toBe(false);
    expect(migration).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/iu);
    expect(migration).not.toMatch(/\bDROP\s+(?:SCHEMA|TABLE|FUNCTION|TRIGGER|INDEX)\b/iu);
    expect(migration.match(/^BEGIN;$/gmu)).toHaveLength(1);
    expect(migration.match(/^COMMIT;$/gmu)).toHaveLength(1);
    expect(migration).toContain("server_version_num')::integer < 170000");
    expect(migration).toContain("server_version_num')::integer >= 180000");
  });

  it("requires dedicated exact roles/database ownership and canonicalizes the database ACL", () => {
    const migration = migrationSource();
    expect(migration).toContain("database_item.datdba = owner_oid");
    expect(migration).toContain("FROM pg_catalog.pg_auth_members");
    expect(migration).toContain("FROM pg_catalog.pg_default_acl");
    expect(migration).toContain("FROM pg_catalog.pg_db_role_setting");
    expect(migration).toContain(`SET LOCAL ROLE ${ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE}`);
    expect(migration).toContain("REVOKE ALL ON DATABASE %I FROM PUBLIC");
    expect(migration).toContain("GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO %I");
    expect(migration).toContain("GRANT CONNECT ON DATABASE %I TO %I");
  });

  it("gives the direct app only schema usage, claim SELECT/INSERT, and exact receipt columns", () => {
    const migration = migrationSource();
    expect(migration).toContain(
      `GRANT USAGE ON SCHEMA proofera_altana_grant_claim TO ${ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE}`
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT ON TABLE proofera_altana_grant_claim.submission_claims"
    );
    expect(migration).toContain("GRANT SELECT (");
    expect(migration).toContain("deployment_id");
    expect(migration).not.toMatch(/\bSECURITY\s+DEFINER\b/iu);
    expect(migration).not.toMatch(/GRANT\s+EXECUTE/iu);
  });

  it("generates a nonzero deployment UUID and protects both tables with exact append-only triggers", () => {
    const migration = migrationSource();
    expect(ALTANA_GRANT_CLAIM_COMPUTED_SEMANTIC_CONTRACT_SHA256).toBe(
      ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256
    );
    expect(migration).toContain(`'${ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256}'`);
    expect(migration).toContain("pg_catalog.gen_random_uuid()");
    expect(migration).toContain("deployment_id <> '00000000-0000-0000-0000-000000000000'::uuid");
    expect(migration.match(/^CREATE TRIGGER /gmu)).toHaveLength(4);
    expect(migration).toContain("SECURITY INVOKER");
  });
});

describe("Altana grant-claim canonical catalog verifier", () => {
  it("uses independent canonical expectations rather than a migration-recorded catalog fingerprint", () => {
    expect(ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_PARAMETERS).toEqual([
      ALTANA_GRANT_CLAIM_MIGRATION_VERSION,
      ALTANA_GRANT_CLAIM_DOMAIN_SCHEMA_VERSION,
      ALTANA_GRANT_CLAIM_SUPPORTED_POSTGRES_MAJOR,
      ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256,
      ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
      ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
      ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.namespaceInventory,
      ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.relations,
      ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.columns,
      ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.constraints,
      ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.indexes,
      ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.functions,
      ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.triggers,
      ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.inheritance,
      ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.acls
    ]);
    expect(ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL).not.toContain("catalog_fingerprint");
    expect(ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL).not.toMatch(/\bINSERT\s+INTO\b/iu);
  });

  it("enumerates every ACL grantee and exact PG17/catalog property under review", () => {
    for (const marker of [
      "pg_catalog.aclexplode",
      "MAINTAIN",
      "session_user = $6",
      "current_user = session_user",
      "pg_catalog.pg_inherits",
      "relam",
      "relispartition",
      "reltablespace",
      "indnullsnotdistinct",
      "opcnamespace",
      "collnamespace",
      "collprovider",
      "collisdeterministic",
      "pg_get_triggerdef",
      "trigger_item.tgattr::text",
      "namespace_snapshot",
      "pg_catalog.pg_collation",
      "pg_catalog.pg_operator",
      "pg_catalog.pg_opclass",
      "pg_catalog.pg_opfamily",
      "pg_catalog.pg_conversion",
      "pg_catalog.pg_ts_config",
      "pg_catalog.pg_ts_dict",
      "pg_catalog.pg_ts_parser",
      "pg_catalog.pg_ts_template",
      "pg_catalog.pg_db_role_setting"
    ]) {
      expect(ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL).toContain(marker);
    }
    const acl = JSON.parse(ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.acls) as unknown[];
    expect(acl).toContainEqual(expect.objectContaining({ kind: "table", privilege: "MAINTAIN" }));
    expect(acl).toContainEqual({
      grantable: false,
      grantee: ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
      grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
      identity: "schema_receipt.deployment_id",
      kind: "column",
      privilege: "SELECT"
    });
  });

  it("accepts only one exact all-true projection and returns a non-capability readiness record", () => {
    expect(ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_RESULT_FIELDS).toEqual([
      ...CHECKS.map(([field]) => field),
      "deploymentId"
    ]);
    expect(interpretAltanaGrantClaimSchemaProjection(projection())).toEqual({
      status: "ready",
      deploymentId: TEST_DEPLOYMENT_ID,
      migrationVersion: 1,
      domainSchemaVersion: 1,
      postgresMajor: 17,
      migrationArtifactSha256: ALTANA_GRANT_CLAIM_MIGRATION_ARTIFACT_SHA256,
      semanticContractSha256: ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256
    });
  });

  it.each(CHECKS)("blocks the exact %s catalog check", (field, check) => {
    expect(
      interpretAltanaGrantClaimSchemaProjection(projection(verificationRow({ [field]: false })))
    ).toEqual({ status: "blocked", code: "SCHEMA_NOT_READY", failedChecks: [check] });
  });

  it.each([
    { rowCount: 1, rows: [verificationRow()], command: "SELECT" },
    { rowCount: 2, rows: [verificationRow()] },
    { rowCount: 1, rows: [verificationRow(), verificationRow()] },
    { rowCount: 1, rows: [{ ...verificationRow(), unexpected: true }] },
    { rowCount: 1, rows: [{ ...verificationRow(), deploymentId: "not-a-uuid" }] },
    Object.create({ rowCount: 1, rows: [verificationRow()] })
  ])("rejects a non-exact plain projection %#", (input) => {
    expect(interpretAltanaGrantClaimSchemaProjection(input)).toBeNull();
  });
});
