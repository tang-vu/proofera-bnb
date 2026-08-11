import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";

vi.mock("server-only", () => ({}));

import {
  ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL,
  ALTANA_GRANT_CLAIM_INSERT_SQL,
  ALTANA_GRANT_CLAIM_TABLE_NAME,
  altanaGrantClaimConflictParameters,
  altanaGrantClaimInsertParameters
} from "./altana-grant-claim-store";
import {
  ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
  ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_PARAMETERS,
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL,
  interpretAltanaGrantClaimSchemaProjection,
  isReviewedAltanaGrantClaimMigrationArtifact,
  type AltanaGrantClaimSchemaVerificationResult
} from "./altana-grant-claim-schema-verifier";
import {
  createAltanaGrantClaimPostgresServer,
  type AltanaGrantClaimPostgresServer
} from "./altana-grant-claim-verified-store.server";
import { testClaim } from "./altana-grant-claim-postgres-test-support";

const RUN_LIVE = process.env.PROOFERA_RUN_POSTGRES_INTEGRATION === "1";
const URL_SETTING = "PROOFERA_POSTGRES_TEST_URL";
const REQUIRED_DATABASE = "proofera_postgres_integration";
const APP_PASSWORD = "disposable-proof-only";
const TEST_TIMEOUT_MS = 45_000;
const RECEIPT_TABLE = "proofera_altana_grant_claim.schema_receipt";
const MUTATION_FUNCTION = "proofera_altana_grant_claim.reject_submission_claim_mutation()";
const MIGRATION_PATH = new URL(
  "../migrations/0002_altana_grant_claim_schema_v1.sql",
  import.meta.url
);

let adminPool: Pool | undefined;
let appPool: Pool | undefined;
let server: AltanaGrantClaimPostgresServer | undefined;
let originalDatabaseOwner: string | undefined;
let originalDatabaseAclSnapshot: DatabaseAclSnapshot | undefined;
let ownerRoleCreated = false;
let appRoleCreated = false;
let databaseOwnerChanged = false;
let schemaCreated = false;

type DatabaseAclSnapshot = Readonly<{
  inventory: string;
  publicConnect: boolean;
  publicCreate: boolean;
  publicTemporary: boolean;
  safe: boolean;
}>;

const DATABASE_ACL_SNAPSHOT_SQL = `
WITH database_state AS (
  SELECT
    database_item.datacl,
    database_item.datdba,
    pg_catalog.pg_get_userbyid(database_item.datdba) AS database_owner
  FROM pg_catalog.pg_database AS database_item
  WHERE database_item.datname = pg_catalog.current_database()
), acl_entries AS (
  SELECT
    CASE
      WHEN acl.grantee = 0 THEN 'PUBLIC'
      ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END AS grantee,
    pg_catalog.pg_get_userbyid(acl.grantor) AS grantor,
    acl.is_grantable,
    acl.privilege_type
  FROM database_state
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(database_state.datacl, pg_catalog.acldefault('d', database_state.datdba))
  ) AS acl
)
SELECT
  COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'grantee', acl_entry.grantee,
        'grantor', acl_entry.grantor,
        'is_grantable', acl_entry.is_grantable,
        'privilege_type', acl_entry.privilege_type
      ) ORDER BY
        acl_entry.grantee COLLATE pg_catalog."C",
        acl_entry.grantor COLLATE pg_catalog."C",
        acl_entry.privilege_type COLLATE pg_catalog."C",
        acl_entry.is_grantable
    )::text
    FROM acl_entries AS acl_entry
  ), '[]') AS inventory,
  EXISTS (
    SELECT 1 FROM acl_entries
    WHERE grantee = 'PUBLIC' AND privilege_type = 'CONNECT'
  ) AS "publicConnect",
  EXISTS (
    SELECT 1 FROM acl_entries
    WHERE grantee = 'PUBLIC' AND privilege_type = 'CREATE'
  ) AS "publicCreate",
  EXISTS (
    SELECT 1 FROM acl_entries
    WHERE grantee = 'PUBLIC' AND privilege_type = 'TEMPORARY'
  ) AS "publicTemporary",
  (
    NOT EXISTS (
      SELECT 1
      FROM acl_entries AS acl_entry
      CROSS JOIN database_state
      WHERE acl_entry.grantor <> database_state.database_owner
        OR acl_entry.grantee NOT IN ('PUBLIC', database_state.database_owner)
        OR acl_entry.privilege_type NOT IN ('CONNECT', 'CREATE', 'TEMPORARY')
        OR acl_entry.is_grantable
    )
    AND NOT EXISTS (
      SELECT required.privilege_type
      FROM (VALUES ('CONNECT'), ('CREATE'), ('TEMPORARY')) AS required(privilege_type)
      CROSS JOIN database_state
      WHERE NOT EXISTS (
        SELECT 1
        FROM acl_entries AS owner_acl
        WHERE owner_acl.grantee = database_state.database_owner
          AND owner_acl.privilege_type = required.privilege_type
      )
    )
  ) AS safe
FROM database_state
`.trim();

function disposableAdminUrl(): string {
  const value = process.env[URL_SETTING];
  if (value === undefined || value.length === 0) {
    throw new Error(`${URL_SETTING} must name the dedicated disposable database.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${URL_SETTING} is not a valid PostgreSQL URL.`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    parsed.username.length === 0 ||
    parsed.search.length !== 0 ||
    parsed.hash.length !== 0 ||
    database !== REQUIRED_DATABASE ||
    !["127.0.0.1", "::1", "localhost"].includes(parsed.hostname)
  ) {
    throw new Error(`${URL_SETTING} must target the exact loopback disposable database.`);
  }
  return value;
}

function appUrl(adminUrl: string): string {
  const parsed = new URL(adminUrl);
  parsed.username = ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE;
  parsed.password = APP_PASSWORD;
  return parsed.toString();
}

function migrationArtifact(): string {
  return readFileSync(MIGRATION_PATH, "utf8").replaceAll("\r\n", "\n");
}

function requireAdminPool(): Pool {
  if (adminPool === undefined) throw new Error("Live PostgreSQL admin setup is unavailable.");
  return adminPool;
}

function requireAppPool(): Pool {
  if (appPool === undefined) throw new Error("Live PostgreSQL app setup is unavailable.");
  return appPool;
}

function requireServer(): AltanaGrantClaimPostgresServer {
  if (server === undefined) throw new Error("Live PostgreSQL server setup is unavailable.");
  return server;
}

async function databaseAclSnapshot(client: PoolClient): Promise<DatabaseAclSnapshot> {
  const result = await client.query<DatabaseAclSnapshot>(DATABASE_ACL_SNAPSHOT_SQL);
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    result.rows.length !== 1 ||
    row === undefined ||
    typeof row.inventory !== "string" ||
    typeof row.publicConnect !== "boolean" ||
    typeof row.publicCreate !== "boolean" ||
    typeof row.publicTemporary !== "boolean" ||
    typeof row.safe !== "boolean"
  ) {
    throw new Error("Disposable database ACL snapshot was not exact.");
  }
  return Object.freeze({ ...row });
}

async function appCatalogVerification(
  client: PoolClient
): Promise<AltanaGrantClaimSchemaVerificationResult> {
  let result;
  try {
    result = await client.query(ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL, [
      ...ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_PARAMETERS
    ]);
  } catch (error) {
    const position =
      typeof error === "object" && error !== null && "position" in error
        ? Reflect.get(error, "position")
        : null;
    throw new Error(
      typeof position === "string"
        ? `Live verifier SQL failed at character ${position}.`
        : "Live verifier SQL failed without a safe position."
    );
  }
  const interpreted = interpretAltanaGrantClaimSchemaProjection({
    rows: result.rows,
    rowCount: result.rowCount
  });
  if (interpreted === null) throw new Error("Live catalog projection was not exact.");
  return interpreted;
}

async function verifyRolledBackMutation(mutation: string) {
  const client = await requireAdminPool().connect();
  let open = false;
  try {
    await client.query("BEGIN");
    open = true;
    await client.query(mutation);
    await client.query("SET LOCAL SESSION AUTHORIZATION proofera_grant_claim_app");
    return await appCatalogVerification(client);
  } finally {
    if (open) await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function countClaim(bootstrapId: string): Promise<number> {
  const result = await requireAdminPool().query<{ count: string }>(
    `SELECT pg_catalog.count(*)::text AS count FROM ${ALTANA_GRANT_CLAIM_TABLE_NAME} WHERE bootstrap_id = $1`,
    [bootstrapId]
  );
  return Number(result.rows[0]?.count ?? "-1");
}

async function backendPid(client: PoolClient): Promise<number> {
  const result = await client.query<{ pid: number }>(
    "SELECT pg_catalog.pg_backend_pid()::integer AS pid"
  );
  const pid = result.rows[0]?.pid;
  if (!Number.isSafeInteger(pid)) throw new Error("Live app backend PID was invalid.");
  return pid as number;
}

async function waitForSleep(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await requireAdminPool().query<{ sleeping: boolean }>(
      `SELECT COALESCE(pg_catalog.bool_or(
        pid = $1 AND state = 'active' AND query LIKE '%pg_sleep%'
      ), false) AS sleeping FROM pg_catalog.pg_stat_activity`,
      [pid]
    );
    if (result.rows[0]?.sleeping === true) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Live disconnect probe did not enter pg_sleep.");
}

async function terminateBackend(pid: number): Promise<void> {
  const result = await requireAdminPool().query<{ terminated: boolean }>(
    "SELECT pg_catalog.pg_terminate_backend($1)::boolean AS terminated",
    [pid]
  );
  expect(result.rows).toEqual([{ terminated: true }]);
}

async function quoteSafeOwner(): Promise<string> {
  if (
    originalDatabaseOwner === undefined ||
    !/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/u.test(originalDatabaseOwner)
  ) {
    throw new Error("Refusing unsafe database-owner restoration.");
  }
  return `"${originalDatabaseOwner}"`;
}

describe.skipIf(!RUN_LIVE)("live PostgreSQL 17 Altana grant-claim durability boundary", () => {
  beforeAll(async () => {
    const adminUrl = disposableAdminUrl();
    adminPool = new Pool({
      application_name: "proofera-grant-claim-live-admin",
      connectionString: adminUrl,
      connectionTimeoutMillis: 5_000,
      max: 8
    });
    const client = await adminPool.connect();
    try {
      const preflight = await client.query<{
        active_peers: number;
        database_name: string;
        database_owner: string;
        encoding: string;
        is_superuser: boolean;
        postgres_major: number;
        session_role: string;
      }>(`SELECT
        pg_catalog.current_database() AS database_name,
        pg_catalog.pg_get_userbyid(database_item.datdba) AS database_owner,
        current_user AS session_role,
        pg_catalog.current_setting('is_superuser')::boolean AS is_superuser,
        pg_catalog.current_setting('server_version_num')::integer / 10000 AS postgres_major,
        pg_catalog.current_setting('server_encoding') AS encoding,
        (SELECT pg_catalog.count(*)::integer FROM pg_catalog.pg_stat_activity
          WHERE datname = pg_catalog.current_database() AND pid <> pg_catalog.pg_backend_pid()) AS active_peers
      FROM pg_catalog.pg_database AS database_item
      WHERE database_item.datname = pg_catalog.current_database()`);
      const state = preflight.rows[0];
      expect(state).toMatchObject({
        active_peers: 0,
        database_name: REQUIRED_DATABASE,
        encoding: "UTF8",
        is_superuser: true,
        postgres_major: 17
      });
      if (state === undefined || state.database_owner !== state.session_role) {
        throw new Error("Disposable database must initially be owned by its direct admin session.");
      }
      originalDatabaseOwner = state.database_owner;
      const aclSnapshot = await databaseAclSnapshot(client);
      if (!aclSnapshot.safe) {
        throw new Error("Disposable database has an ACL that cannot be restored exactly.");
      }
      originalDatabaseAclSnapshot = aclSnapshot;
      const prior = await client.query<{
        app_role: string | null;
        owner_role: string | null;
        target_schema: string | null;
      }>(
        "SELECT pg_catalog.to_regrole($1)::text AS owner_role, pg_catalog.to_regrole($2)::text AS app_role, pg_catalog.to_regnamespace($3)::text AS target_schema",
        [
          ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
          ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
          "proofera_altana_grant_claim"
        ]
      );
      expect(prior.rows).toEqual([{ app_role: null, owner_role: null, target_schema: null }]);

      await client.query(
        "CREATE ROLE proofera_grant_claim_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
      );
      ownerRoleCreated = true;
      await client.query(
        "CREATE ROLE proofera_grant_claim_app LOGIN PASSWORD 'disposable-proof-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
      );
      appRoleCreated = true;
      await client.query(
        "ALTER DATABASE proofera_postgres_integration OWNER TO proofera_grant_claim_owner"
      );
      databaseOwnerChanged = true;
      const migration = migrationArtifact();
      expect(isReviewedAltanaGrantClaimMigrationArtifact(migration)).toBe(true);
      await client.query(migration);
      schemaCreated = true;
    } finally {
      client.release();
    }

    const applicationUrl = appUrl(adminUrl);
    appPool = new Pool({
      application_name: "proofera-grant-claim-live-app-check",
      connectionString: applicationUrl,
      connectionTimeoutMillis: 5_000,
      max: 8
    });
    const verifierClient = await appPool.connect();
    try {
      const directVerification = await appCatalogVerification(verifierClient);
      if (directVerification.status === "blocked") {
        throw new Error(`Live verifier blocked: ${directVerification.failedChecks.join(",")}`);
      }
      expect(directVerification).toMatchObject({ status: "ready", postgresMajor: 17 });
    } finally {
      verifierClient.release();
    }
    server = createAltanaGrantClaimPostgresServer({
      connectionString: applicationUrl,
      runtime: "test",
      tls: { mode: "disable" }
    });
    const ready = await server.verifyReadiness();
    expect(ready).toMatchObject({ status: "ready", postgresMajor: 17 });
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    if (appPool !== undefined) {
      await appPool.end();
      appPool = undefined;
    }
    if (adminPool === undefined) return;
    const client = await adminPool.connect();
    try {
      await client.query("RESET SESSION AUTHORIZATION").catch(() => undefined);
      await client.query("RESET ROLE").catch(() => undefined);
      if (schemaCreated) {
        await client.query("DROP SCHEMA proofera_altana_grant_claim CASCADE");
        schemaCreated = false;
      }
      if (databaseOwnerChanged) {
        const owner = await quoteSafeOwner();
        await client.query(`ALTER DATABASE proofera_postgres_integration OWNER TO ${owner}`);
        databaseOwnerChanged = false;
      }
      if (originalDatabaseAclSnapshot !== undefined) {
        const owner = await quoteSafeOwner();
        await client.query("REVOKE ALL ON DATABASE proofera_postgres_integration FROM PUBLIC");
        if (appRoleCreated) {
          await client.query(
            "REVOKE ALL ON DATABASE proofera_postgres_integration FROM proofera_grant_claim_app"
          );
        }
        if (ownerRoleCreated) {
          await client.query(
            "REVOKE ALL ON DATABASE proofera_postgres_integration FROM proofera_grant_claim_owner"
          );
        }
        await client.query(`REVOKE ALL ON DATABASE proofera_postgres_integration FROM ${owner}`);
        await client.query(
          `GRANT CONNECT, CREATE, TEMPORARY ON DATABASE proofera_postgres_integration TO ${owner}`
        );
        if (originalDatabaseAclSnapshot.publicConnect) {
          await client.query("GRANT CONNECT ON DATABASE proofera_postgres_integration TO PUBLIC");
        }
        if (originalDatabaseAclSnapshot.publicCreate) {
          await client.query("GRANT CREATE ON DATABASE proofera_postgres_integration TO PUBLIC");
        }
        if (originalDatabaseAclSnapshot.publicTemporary) {
          await client.query("GRANT TEMPORARY ON DATABASE proofera_postgres_integration TO PUBLIC");
        }
      }
      if (appRoleCreated) {
        await client.query("DROP ROLE proofera_grant_claim_app");
        appRoleCreated = false;
      }
      if (ownerRoleCreated) {
        await client.query("DROP ROLE proofera_grant_claim_owner");
        ownerRoleCreated = false;
      }
      if (originalDatabaseAclSnapshot !== undefined) {
        const restored = await databaseAclSnapshot(client);
        expect(restored).toEqual(originalDatabaseAclSnapshot);
        originalDatabaseAclSnapshot = undefined;
      }
    } finally {
      client.release();
      await adminPool.end();
      adminPool = undefined;
    }
  }, TEST_TIMEOUT_MS);

  it("fails on a second migration application and preserves the generated nonzero deployment UUID", async () => {
    const before = await requireAdminPool().query<{ deployment_id: string }>(
      `SELECT deployment_id::text AS deployment_id FROM ${RECEIPT_TABLE}`
    );
    expect(before.rows[0]?.deployment_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
    expect(before.rows[0]?.deployment_id).not.toBe("00000000-0000-0000-0000-000000000000");
    await expect(requireAdminPool().query(migrationArtifact())).rejects.toMatchObject({
      code: "42P06"
    });
    const after = await requireAdminPool().query<{ deployment_id: string }>(
      `SELECT deployment_id::text AS deployment_id FROM ${RECEIPT_TABLE}`
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("lets the direct LOGIN app run the exact verifier while denying database/schema escalation", async () => {
    const client = await requireAppPool().connect();
    try {
      const verification = await appCatalogVerification(client);
      expect(verification).toMatchObject({ status: "ready" });
      const identity = await client.query<{
        can_create_database: boolean;
        can_create_schema: boolean;
        can_temp: boolean;
        current_role: string;
        session_role: string;
      }>(`SELECT
        current_user AS current_role,
        session_user AS session_role,
        pg_catalog.has_database_privilege(current_user, pg_catalog.current_database(), 'CREATE') AS can_create_database,
        pg_catalog.has_database_privilege(current_user, pg_catalog.current_database(), 'TEMPORARY') AS can_temp,
        pg_catalog.has_schema_privilege(current_user, 'proofera_altana_grant_claim', 'CREATE') AS can_create_schema`);
      expect(identity.rows).toEqual([
        {
          can_create_database: false,
          can_create_schema: false,
          can_temp: false,
          current_role: ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
          session_role: ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE
        }
      ]);
    } finally {
      client.release();
    }
  });

  it.each([
    [
      "rogue database/table ACL grantee",
      `CREATE ROLE proofera_grant_claim_rogue NOLOGIN;
       GRANT TEMPORARY ON DATABASE proofera_postgres_integration TO proofera_grant_claim_rogue;
       GRANT SELECT ON TABLE ${ALTANA_GRANT_CLAIM_TABLE_NAME} TO proofera_grant_claim_rogue;`,
      "acl_inventory"
    ],
    [
      "disabled canonical trigger",
      `ALTER TABLE ${ALTANA_GRANT_CLAIM_TABLE_NAME}
       DISABLE TRIGGER proofera_grant_claims_append_only;`,
      "triggers"
    ],
    [
      "rogue index",
      `CREATE INDEX proofera_grant_claim_rogue_index
       ON ${ALTANA_GRANT_CLAIM_TABLE_NAME} (grant_submitted_at);`,
      "namespace_inventory"
    ],
    [
      "rogue collation",
      `CREATE COLLATION proofera_altana_grant_claim.rogue_collation
       FROM pg_catalog."C";`,
      "namespace_inventory"
    ],
    [
      "rogue operator family",
      `CREATE OPERATOR FAMILY proofera_altana_grant_claim.rogue_operator_family
       USING btree;`,
      "namespace_inventory"
    ],
    [
      "rogue text-search configuration",
      `CREATE TEXT SEARCH CONFIGURATION proofera_altana_grant_claim.rogue_text_search
       (COPY = pg_catalog.simple);`,
      "namespace_inventory"
    ],
    [
      "database-specific app role setting",
      `ALTER ROLE proofera_grant_claim_app
       IN DATABASE proofera_postgres_integration SET application_name TO 'rogue';`,
      "roles"
    ],
    [
      "database-wide setting",
      `ALTER DATABASE proofera_postgres_integration SET application_name TO 'rogue';`,
      "roles"
    ]
  ] as const)("rejects a live %s catalog mutation", async (_label, mutation, failedCheck) => {
    const verification = await verifyRolledBackMutation(mutation);
    expect(verification).toMatchObject({ status: "blocked" });
    if (verification.status !== "blocked") throw new Error("Mutation unexpectedly verified.");
    expect(verification.failedChecks).toContain(failedCheck);
  });

  it("produces one durable claim and fifteen exact replays through the same verified pool", async () => {
    const claim = testClaim(900);
    const results = await Promise.all(
      Array.from({ length: 16 }, () => requireServer().claimSubmission({ ...claim }))
    );
    expect(results.filter(({ status }) => status === "claimed")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "already_claimed")).toHaveLength(15);
    expect(await countClaim(claim.bootstrapId)).toBe(1);
  });

  it("rolls back each cross-identifier conflict without consuming the losing identifiers", async () => {
    const keys = [
      "bootstrapId",
      "idempotencyKey",
      "bootstrapBindingHash",
      "submissionBindingHash"
    ] as const;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) throw new Error("Cross-identifier test key disappeared.");
      const winner = testClaim(1_000 + index * 10);
      const candidate = testClaim(1_001 + index * 10, { [key]: winner[key] });
      await requireServer().claimSubmission(winner);
      await expect(requireServer().claimSubmission(candidate)).rejects.toMatchObject({
        code: "CLAIM_CONFLICT",
        claimOutcome: "rolled_back"
      });
      const fresh = testClaim(1_002 + index * 10);
      const recovered = testClaim(1_002 + index * 10, { ...candidate, [key]: fresh[key] });
      await expect(requireServer().claimSubmission(recovered)).resolves.toMatchObject({
        status: "claimed"
      });
    }
  });

  it("denies app UPDATE, DELETE, TRUNCATE, full receipt SELECT, and trigger execution", async () => {
    for (const statement of [
      `UPDATE ${ALTANA_GRANT_CLAIM_TABLE_NAME} SET grant_submitted_at = 1`,
      `DELETE FROM ${ALTANA_GRANT_CLAIM_TABLE_NAME}`,
      `TRUNCATE TABLE ${ALTANA_GRANT_CLAIM_TABLE_NAME}`,
      `SELECT * FROM ${RECEIPT_TABLE}`,
      `SELECT ${MUTATION_FUNCTION}`
    ]) {
      await expect(requireAppPool().query(statement)).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("rejects a changed deployment UUID inside the checked-out claim transaction", async () => {
    const original = await requireAdminPool().query<{ deployment_id: string }>(
      `SELECT deployment_id::text AS deployment_id FROM ${RECEIPT_TABLE}`
    );
    const originalId = original.rows[0]?.deployment_id;
    if (originalId === undefined) throw new Error("Deployment receipt disappeared.");
    const replacement = "e1f3814b-9860-48a5-a86c-9102cd0d456f";
    try {
      await requireAdminPool().query(`ALTER TABLE ${RECEIPT_TABLE}
        DISABLE TRIGGER proofera_grant_claim_receipt_append_only`);
      await requireAdminPool().query(`UPDATE ${RECEIPT_TABLE} SET deployment_id = $1`, [
        replacement
      ]);
      await requireAdminPool().query(`ALTER TABLE ${RECEIPT_TABLE}
        ENABLE TRIGGER proofera_grant_claim_receipt_append_only`);
      await expect(requireServer().claimSubmission(testClaim(2_000))).rejects.toMatchObject({
        code: "SCHEMA_NOT_READY",
        claimOutcome: "not_attempted"
      });
      expect(await countClaim(testClaim(2_000).bootstrapId)).toBe(0);
    } finally {
      await requireAdminPool().query(`ALTER TABLE ${RECEIPT_TABLE}
        DISABLE TRIGGER proofera_grant_claim_receipt_append_only`);
      await requireAdminPool().query(`UPDATE ${RECEIPT_TABLE} SET deployment_id = $1`, [
        originalId
      ]);
      await requireAdminPool().query(`ALTER TABLE ${RECEIPT_TABLE}
        ENABLE TRIGGER proofera_grant_claim_receipt_append_only`);
    }
    await expect(requireServer().verifyReadiness()).resolves.toMatchObject({ status: "ready" });
  });

  it("rolls back an inserted row when a client disconnects without COMMIT", async () => {
    const claim = testClaim(2_100);
    const client = await requireAppPool().connect();
    let released = false;
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE");
      await client.query(ALTANA_GRANT_CLAIM_INSERT_SQL, [
        ...altanaGrantClaimInsertParameters(claim)
      ]);
      client.release(true);
      released = true;
    } finally {
      if (!released) client.release(true);
    }
    for (
      let attempt = 0;
      attempt < 100 && (await countClaim(claim.bootstrapId)) !== 0;
      attempt += 1
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    expect(await countClaim(claim.bootstrapId)).toBe(0);
  });

  it("demonstrates committed-but-disconnected reconciliation on exact replay", async () => {
    const claim = testClaim(2_200);
    const client = await requireAppPool().connect();
    let released = false;
    try {
      const pid = await backendPid(client);
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE");
      await client.query(ALTANA_GRANT_CLAIM_INSERT_SQL, [
        ...altanaGrantClaimInsertParameters(claim)
      ]);
      const ambiguous = client.query("COMMIT; SELECT pg_catalog.pg_sleep(10)").then(
        () => "fulfilled" as const,
        () => "rejected" as const
      );
      await waitForSleep(pid);
      await terminateBackend(pid);
      await expect(ambiguous).resolves.toBe("rejected");
      client.release(true);
      released = true;
    } finally {
      if (!released) client.release(true);
    }
    expect(await countClaim(claim.bootstrapId)).toBe(1);
    await expect(requireServer().claimSubmission(claim)).resolves.toMatchObject({
      status: "already_claimed"
    });
  });

  it("demonstrates rolled-back-but-disconnected absence", async () => {
    const claim = testClaim(2_300);
    const client = await requireAppPool().connect();
    let released = false;
    try {
      const pid = await backendPid(client);
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE");
      await client.query(ALTANA_GRANT_CLAIM_INSERT_SQL, [
        ...altanaGrantClaimInsertParameters(claim)
      ]);
      const ambiguous = client.query("ROLLBACK; SELECT pg_catalog.pg_sleep(10)").then(
        () => "fulfilled" as const,
        () => "rejected" as const
      );
      await waitForSleep(pid);
      await terminateBackend(pid);
      await expect(ambiguous).resolves.toBe("rejected");
      client.release(true);
      released = true;
    } finally {
      if (!released) client.release(true);
    }
    expect(await countClaim(claim.bootstrapId)).toBe(0);
  });

  it("keeps the conflict read fixed and bounded after a no-op insert", () => {
    expect(ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL).toContain("ORDER BY bootstrap_id ASC");
    expect(ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL).toContain("LIMIT 5");
    expect(altanaGrantClaimConflictParameters(testClaim(2_400))).toHaveLength(4);
  });
});
