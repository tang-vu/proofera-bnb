import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ALTANA_LP_RESERVATION_APP_ROLE,
  ALTANA_LP_RESERVATION_MIGRATION_VERSION,
  ALTANA_LP_RESERVATION_OWNER_ROLE,
  ALTANA_LP_RESERVATION_POSTGRES_DDL
} from "./altana-lp-reservation-store";
import {
  ALTANA_LP_RESERVATION_DOMAIN_SCHEMA_VERSION,
  ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256,
  ALTANA_LP_RESERVATION_MIGRATION_ARTIFACT_SHA256,
  ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL,
  ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256,
  ALTANA_LP_RESERVATION_SUPPORTED_POSTGRES_MAJOR,
  AltanaLpReservationSchemaVerifierError,
  isReviewedAltanaLpReservationMigrationArtifact,
  isVerifiedAltanaLpReservationSchemaReady,
  verifyAltanaLpReservationPostgresSchema,
  type AltanaLpReservationSchemaVerificationCheck
} from "./altana-lp-reservation-schema-verifier";

const MIGRATION_PATH = new URL(
  "../migrations/0001_altana_lp_reservation_schema_v2.sql",
  import.meta.url
);

const CHECK_FIELDS = Object.freeze([
  "actorAuthorized",
  "platformSupported",
  "rolesSafe",
  "ownershipOk",
  "authorizationSurfaceOk",
  "migrationReceiptOk",
  "catalogFingerprintOk"
] as const);

type CheckField = (typeof CHECK_FIELDS)[number];

const CHECK_NAMES: Readonly<Record<CheckField, AltanaLpReservationSchemaVerificationCheck>> =
  Object.freeze({
    actorAuthorized: "actor_authorization",
    platformSupported: "platform",
    rolesSafe: "roles",
    ownershipOk: "ownership",
    authorizationSurfaceOk: "authorization_surface",
    migrationReceiptOk: "migration_receipt",
    catalogFingerprintOk: "catalog_fingerprint"
  });

function checkRow(
  overrides: Partial<Record<CheckField, boolean>> = {}
): Record<CheckField, boolean> {
  return Object.fromEntries(
    CHECK_FIELDS.map((field) => [field, overrides[field] ?? true])
  ) as Record<CheckField, boolean>;
}

class FakeAdminDatabase {
  readonly executionBoundary = "server_admin_preflight" as const;
  readonly calls: Array<{
    statement: string;
    parameters: readonly (number | string)[];
  }> = [];
  handler: () => Promise<unknown> = async () => ({ rowCount: 1, rows: [checkRow()] });

  async query(statement: string, parameters: readonly (number | string)[]): Promise<unknown> {
    this.calls.push({ statement, parameters: [...parameters] });
    return this.handler();
  }
}

function migrationSource(): string {
  return readFileSync(MIGRATION_PATH, "utf8").replaceAll("\r\n", "\n");
}

function sourceSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalMigrationCtes(migration: string): string {
  const start = migration.indexOf("WITH\ntarget_schema AS (");
  const end = migration.indexOf("\nINSERT INTO proofera_activation.schema_migrations", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Altana LP reservation schema migration artifact", () => {
  it("binds the source DDL, full migration artifact, and reviewed catalog independently", () => {
    const migration = migrationSource();

    expect(sourceSha256(ALTANA_LP_RESERVATION_POSTGRES_DDL)).toBe(
      ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256
    );
    expect(sourceSha256(migration)).toBe(ALTANA_LP_RESERVATION_MIGRATION_ARTIFACT_SHA256);
    expect(isReviewedAltanaLpReservationMigrationArtifact(migration)).toBe(true);
    expect(isReviewedAltanaLpReservationMigrationArtifact(`${migration}\n-- drift`)).toBe(false);
    expect(ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256).toMatch(
      /^(?!0{64}$)[0-9a-f]{64}$/u
    );
    expect(
      migration.match(new RegExp(ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256, "gu"))
    ).toHaveLength(3);
    expect(migration).toContain(`source_ddl_sha256 = '${ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256}'`);
  });

  it("contains the exported store DDL exactly inside the admin transaction", () => {
    const migration = migrationSource();
    const startMarker = "-- proofera:canonical-altana-lp-reservation-ddl:start\n";
    const endMarker = "\n-- proofera:canonical-altana-lp-reservation-ddl:end";
    const start = migration.indexOf(startMarker);
    const end = migration.indexOf(endMarker);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const canonicalBody = migration.slice(start + startMarker.length, end).trim();
    expect(`BEGIN;\n\n${canonicalBody}\n\nCOMMIT;`).toBe(ALTANA_LP_RESERVATION_POSTGRES_DDL);
  });

  it("keeps the migration and verifier catalog serializers byte-identical", () => {
    const migrationCtes = canonicalMigrationCtes(migrationSource());
    const verifierEnd = ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL.indexOf("\nplatform_state AS (");
    expect(verifierEnd).toBeGreaterThan(0);
    expect(ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL.slice(0, verifierEnd)).toBe(`${migrationCtes},`);
  });

  it("pins PostgreSQL 17/UTF-8 and refuses to bless the observed catalog", () => {
    const migration = migrationSource();

    expect(migration).not.toMatch(
      /\bCREATE\s+(?:SCHEMA|TABLE|FUNCTION|TRIGGER|INDEX)\s+IF\s+NOT\s+EXISTS\b/iu
    );
    expect(migration).toContain("ADMIN-ONLY, MANUAL OPERATION");
    expect(migration).toContain("server_version_num')::integer < 170000");
    expect(migration).toContain("server_version_num')::integer >= 180000");
    expect(migration).toContain("server_encoding') <> 'UTF8'");
    expect(migration).toContain("FROM pg_catalog.pg_auth_members");
    expect(migration).toContain("FROM pg_catalog.pg_default_acl");
    expect(migration).toContain("catalog_fingerprint_sha256");
    expect(migration).toContain("FROM current_fingerprint\nWHERE current_fingerprint.value =");
    expect(migration).not.toContain("SELECT\n  current_fingerprint.value");
    expect(migration.match(/^COMMIT;$/gmu)).toHaveLength(1);
  });

  it("attests definitions, ownership, normalized ACLs, inventory, rules, and policies", () => {
    const canonical = canonicalMigrationCtes(migrationSource());

    for (const evidence of [
      "namespaceInventory",
      "pg_get_constraintdef",
      "pg_get_indexdef",
      "pg_get_triggerdef",
      "pg_get_functiondef",
      "aclIsNull",
      "pg_catalog.aclexplode",
      "pg_catalog.pg_rewrite",
      "pg_catalog.pg_policy",
      "pg_get_userbyid"
    ]) {
      expect(canonical).toContain(evidence);
    }
    expect(canonical).not.toMatch(/'[^']*Oid[^']*'/u);
  });
});

describe("Altana LP reservation schema verifier", () => {
  it("runs one fixed read-only catalog query with every external expectation", async () => {
    const database = new FakeAdminDatabase();
    const result = await verifyAltanaLpReservationPostgresSchema(database);

    expect(result).toEqual({
      status: "ready",
      migrationVersion: ALTANA_LP_RESERVATION_MIGRATION_VERSION,
      domainSchemaVersion: ALTANA_LP_RESERVATION_DOMAIN_SCHEMA_VERSION,
      postgresMajor: ALTANA_LP_RESERVATION_SUPPORTED_POSTGRES_MAJOR,
      sourceDdlSha256: ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256,
      catalogFingerprintSha256: ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256
    });
    expect(database.calls).toEqual([
      {
        statement: ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL,
        parameters: [
          ALTANA_LP_RESERVATION_MIGRATION_VERSION,
          ALTANA_LP_RESERVATION_DOMAIN_SCHEMA_VERSION,
          ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256,
          ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256,
          ALTANA_LP_RESERVATION_SUPPORTED_POSTGRES_MAJOR,
          ALTANA_LP_RESERVATION_OWNER_ROLE,
          ALTANA_LP_RESERVATION_APP_ROLE
        ]
      }
    ]);
    expect(ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL).not.toMatch(/\bINSERT\s+INTO\b/iu);
    expect(ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL).not.toMatch(/\bUPDATE\s+[^\n]+\s+SET\b/iu);
    expect(ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL).not.toMatch(/\bDELETE\s+FROM\b/iu);
    expect(ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL).not.toMatch(
      /\b(?:ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\s+(?:TABLE|SCHEMA|FUNCTION|TRIGGER)\b/iu
    );
  });

  it("marks only verifier-produced ready results as the in-process capability", async () => {
    const ready = await verifyAltanaLpReservationPostgresSchema(new FakeAdminDatabase());
    expect(isVerifiedAltanaLpReservationSchemaReady(ready)).toBe(true);

    const forged = Object.freeze({ ...ready });
    expect(isVerifiedAltanaLpReservationSchemaReady(forged)).toBe(false);
    expect(isVerifiedAltanaLpReservationSchemaReady(JSON.parse(JSON.stringify(ready)))).toBe(false);
    expect(isVerifiedAltanaLpReservationSchemaReady(null)).toBe(false);
  });

  it.each(CHECK_FIELDS)("fails closed when the %s catalog check reports drift", async (field) => {
    const database = new FakeAdminDatabase();
    database.handler = async () => ({ rowCount: 1, rows: [checkRow({ [field]: false })] });

    const result = await verifyAltanaLpReservationPostgresSchema(database);

    expect(result).toEqual({
      status: "blocked",
      code: "SCHEMA_NOT_READY",
      failedChecks: [CHECK_NAMES[field]]
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(isVerifiedAltanaLpReservationSchemaReady(result)).toBe(false);
    if (result.status === "blocked") expect(Object.isFrozen(result.failedChecks)).toBe(true);
  });

  it("rejects an altered constraint even when receipt/source checks remain true", async () => {
    const database = new FakeAdminDatabase();
    database.handler = async () => ({
      rowCount: 1,
      rows: [checkRow({ catalogFingerprintOk: false })]
    });

    await expect(verifyAltanaLpReservationPostgresSchema(database)).resolves.toEqual({
      status: "blocked",
      code: "SCHEMA_NOT_READY",
      failedChecks: ["catalog_fingerprint"]
    });
  });

  it("rejects a rogue INSERT grant through both ACL and catalog checks", async () => {
    const database = new FakeAdminDatabase();
    database.handler = async () => ({
      rowCount: 1,
      rows: [
        checkRow({
          authorizationSurfaceOk: false,
          catalogFingerprintOk: false
        })
      ]
    });

    await expect(verifyAltanaLpReservationPostgresSchema(database)).resolves.toEqual({
      status: "blocked",
      code: "SCHEMA_NOT_READY",
      failedChecks: ["authorization_surface", "catalog_fingerprint"]
    });
  });

  it("rejects an added rewrite rule while retaining the reviewed receipt", async () => {
    const database = new FakeAdminDatabase();
    database.handler = async () => ({
      rowCount: 1,
      rows: [checkRow({ catalogFingerprintOk: false })]
    });

    await expect(verifyAltanaLpReservationPostgresSchema(database)).resolves.toMatchObject({
      status: "blocked",
      failedChecks: ["catalog_fingerprint"]
    });
  });

  it("reports only category names when several checks fail", async () => {
    const database = new FakeAdminDatabase();
    database.handler = async () => ({
      rowCount: 1,
      rows: [
        checkRow({
          ownershipOk: false,
          authorizationSurfaceOk: false,
          catalogFingerprintOk: false
        })
      ]
    });

    await expect(verifyAltanaLpReservationPostgresSchema(database)).resolves.toEqual({
      status: "blocked",
      code: "SCHEMA_NOT_READY",
      failedChecks: ["ownership", "authorization_surface", "catalog_fingerprint"]
    });
  });

  it.each([
    { label: "missing row", result: { rowCount: 0, rows: [] } },
    { label: "extra row", result: { rowCount: 2, rows: [checkRow(), checkRow()] } },
    {
      label: "extra field",
      result: { rowCount: 1, rows: [{ ...checkRow(), catalogDetail: "private" }] }
    },
    {
      label: "non-boolean check",
      result: { rowCount: 1, rows: [{ ...checkRow(), ownershipOk: 1 }] }
    }
  ])("rejects a malformed $label without treating it as drift evidence", async ({ result }) => {
    const database = new FakeAdminDatabase();
    database.handler = async () => result;

    await expect(verifyAltanaLpReservationPostgresSchema(database)).rejects.toEqual(
      new AltanaLpReservationSchemaVerifierError("CATALOG_RESULT_INVALID")
    );
  });

  it("rejects accessors and a forged admin boundary without invoking them", async () => {
    const database = new FakeAdminDatabase();
    const accessor = Object.defineProperty(checkRow(), "ownershipOk", {
      enumerable: true,
      get: vi.fn(() => true)
    });
    database.handler = async () => ({ rowCount: 1, rows: [accessor] });

    await expect(verifyAltanaLpReservationPostgresSchema(database)).rejects.toMatchObject({
      code: "CATALOG_RESULT_INVALID"
    });

    const boundaryGetter = vi.fn(() => "server_admin_preflight");
    const forged = Object.defineProperty({ query: vi.fn() }, "executionBoundary", {
      enumerable: true,
      get: boundaryGetter
    });
    await expect(verifyAltanaLpReservationPostgresSchema(forged)).rejects.toMatchObject({
      code: "DATABASE_DEPENDENCY_INVALID"
    });
    expect(boundaryGetter).not.toHaveBeenCalled();
  });

  it("never retains raw database errors or connection details", async () => {
    const database = new FakeAdminDatabase();
    const privateDetail = "postgres://admin:password@internal.example/private";
    database.handler = async () => {
      throw new Error(privateDetail);
    };

    let received: unknown;
    try {
      await verifyAltanaLpReservationPostgresSchema(database);
    } catch (error) {
      received = error;
    }

    expect(received).toEqual(new AltanaLpReservationSchemaVerifierError("CATALOG_QUERY_FAILED"));
    expect(String(received)).not.toContain(privateDetail);
    expect(JSON.stringify(received)).not.toContain(privateDetail);
    expect(Object.prototype.hasOwnProperty.call(received, "cause")).toBe(false);
  });

  it("is unavailable to browser runtimes", async () => {
    vi.stubGlobal("window", { document: {} });

    await expect(verifyAltanaLpReservationPostgresSchema(new FakeAdminDatabase())).rejects.toEqual(
      new AltanaLpReservationSchemaVerifierError("SERVER_RUNTIME_REQUIRED")
    );
  });
});
