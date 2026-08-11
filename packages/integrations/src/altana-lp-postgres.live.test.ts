import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient, type QueryResult } from "pg";

vi.mock("server-only", () => ({}));

import type {
  AltanaLpDurableReservationDependency,
  AltanaLpReservationRequest
} from "./altana-lp-handoff";
import {
  ALTANA_LP_POSTGRES_BEGIN_SQL,
  ALTANA_LP_POSTGRES_COMMIT_SQL,
  ALTANA_LP_POSTGRES_ROLLBACK_SQL,
  ALTANA_LP_POSTGRES_SET_LOCAL_SQL
} from "./altana-lp-postgres-transaction";
import {
  createAltanaLpPostgresPoolComposition,
  type AltanaLpPostgresPoolComposition
} from "./altana-lp-postgres-pool.server";
import {
  ALTANA_LP_RESERVATION_APP_ROLE,
  ALTANA_LP_RESERVATION_CONFLICT_READ_SQL,
  ALTANA_LP_RESERVATION_INSERT_SQL,
  ALTANA_LP_RESERVATION_OWNER_ROLE,
  type AltanaLpReservationPostgresParameter
} from "./altana-lp-reservation-store";
import {
  isReviewedAltanaLpReservationMigrationArtifact,
  isVerifiedAltanaLpReservationSchemaReady,
  verifyAltanaLpReservationPostgresSchema,
  type AltanaLpReservationAdminCatalogDatabase,
  type AltanaLpReservationSchemaVerificationResult,
  type VerifiedAltanaLpReservationSchemaReady
} from "./altana-lp-reservation-schema-verifier";

const runPostgresIntegration = process.env.PROOFERA_RUN_POSTGRES_INTEGRATION === "1";
const POSTGRES_TEST_SETTING_NAME = "PROOFERA_POSTGRES_TEST_URL";
const REQUIRED_TEST_DATABASE = "proofera_postgres_integration";
const RESERVATION_TABLE = "proofera_activation.altana_lp_reservations";
const TEST_TIMEOUT_MS = 30_000;
const APPLICATION_TEST_PASSWORD = "disposable-proof-only";
const MIGRATION_PATH = new URL(
  "../migrations/0001_altana_lp_reservation_schema_v2.sql",
  import.meta.url
);

// This suite is inert unless both the opt-in flag and a URL for the exact
// disposable database name above are supplied. The URL must have no query or
// fragment and must authenticate a PostgreSQL 17 UTF-8 superuser. Setup also
// requires no pre-existing ProofEra activation roles or schema.

let adminPool: Pool | undefined;
let applicationPool: Pool | undefined;
let runtimeComposition: AltanaLpPostgresPoolComposition | undefined;
let runtimeReservationDependency: AltanaLpDurableReservationDependency | undefined;
let applicationRoleCreated = false;
let ownerRoleCreated = false;
let schemaCreated = false;

function requireDisposableConnectionUrl(): string {
  const value = process.env[POSTGRES_TEST_SETTING_NAME];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `${POSTGRES_TEST_SETTING_NAME} must name the dedicated ${REQUIRED_TEST_DATABASE} test database.`
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${POSTGRES_TEST_SETTING_NAME} is not a valid PostgreSQL URL.`);
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    parsed.username.length === 0 ||
    parsed.search.length !== 0 ||
    parsed.hash.length !== 0 ||
    databaseName !== REQUIRED_TEST_DATABASE
  ) {
    throw new Error(
      `${POSTGRES_TEST_SETTING_NAME} must use PostgreSQL and target only ${REQUIRED_TEST_DATABASE}.`
    );
  }
  return value;
}

function applicationConnectionUrl(adminConnectionUrl: string): string {
  const parsed = new URL(adminConnectionUrl);
  parsed.username = ALTANA_LP_RESERVATION_APP_ROLE;
  parsed.password = APPLICATION_TEST_PASSWORD;
  return parsed.toString();
}

function migrationArtifact(): string {
  return readFileSync(MIGRATION_PATH, "utf8").replaceAll("\r\n", "\n");
}

function bytes32(value: number): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function requestFixture(
  seed: number,
  overrides: Partial<AltanaLpReservationRequest> = {}
): AltanaLpReservationRequest {
  const consumedAt = new Date();
  const expiresAt = new Date(consumedAt.getTime() + 5 * 60_000);
  return {
    schemaVersion: 2,
    reservationId: bytes32(seed * 10 + 1),
    contextId: bytes32(seed * 10 + 2),
    quoteId: bytes32(seed * 10 + 3),
    userId: `user:postgres-live:${seed}`,
    policyHash: bytes32(seed * 10 + 4),
    writeTargetBinding: {
      chainId: 97,
      address: "0x5555555555555555555555555555555555555555",
      runtimeCodeHash: bytes32(900_001),
      canonicalBlockNumber: "124471937",
      canonicalBlockHash: bytes32(900_002),
      reviewId: bytes32(900_003),
      proxyKind: "none"
    },
    consumedAt: consumedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...overrides
  };
}

function insertParameters(
  request: AltanaLpReservationRequest
): readonly AltanaLpReservationPostgresParameter[] {
  return [
    request.schemaVersion,
    request.reservationId,
    request.contextId,
    request.quoteId,
    request.userId,
    request.policyHash,
    request.writeTargetBinding.chainId,
    request.writeTargetBinding.address,
    request.writeTargetBinding.runtimeCodeHash,
    request.writeTargetBinding.canonicalBlockNumber,
    request.writeTargetBinding.canonicalBlockHash,
    request.writeTargetBinding.reviewId,
    request.writeTargetBinding.proxyKind,
    request.consumedAt,
    request.expiresAt
  ];
}

function requireAdminPool(): Pool {
  if (adminPool === undefined) throw new Error("PostgreSQL integration setup did not complete.");
  return adminPool;
}

function requireApplicationPool(): Pool {
  if (applicationPool === undefined) {
    throw new Error("PostgreSQL integration setup did not complete.");
  }
  return applicationPool;
}

async function setExactRole(
  client: PoolClient,
  role: typeof ALTANA_LP_RESERVATION_APP_ROLE | typeof ALTANA_LP_RESERVATION_OWNER_ROLE
): Promise<void> {
  await client.query("RESET ROLE");
  if (role === ALTANA_LP_RESERVATION_APP_ROLE) {
    await client.query("SET ROLE proofera_activation_app");
  } else {
    await client.query("SET ROLE proofera_activation_owner");
  }
}

async function checkoutApplicationClient(): Promise<PoolClient> {
  const client = await requireApplicationPool().connect();
  try {
    const identity = await client.query<{ current_role: string }>(
      "SELECT current_user AS current_role"
    );
    expect(identity.rows).toEqual([{ current_role: ALTANA_LP_RESERVATION_APP_ROLE }]);
    return client;
  } catch {
    client.release(true);
    throw new Error("The test client could not assume the fixed application role.");
  }
}

async function releaseTestClient(client: PoolClient, transactionOpen: boolean): Promise<void> {
  if (transactionOpen) {
    try {
      await client.query(ALTANA_LP_POSTGRES_ROLLBACK_SQL);
    } catch {
      client.release(true);
      return;
    }
  }
  try {
    await client.query("RESET ROLE");
    client.release();
  } catch {
    client.release(true);
  }
}

async function beginReservationTransaction(client: PoolClient): Promise<void> {
  await client.query(ALTANA_LP_POSTGRES_BEGIN_SQL);
  await client.query(ALTANA_LP_POSTGRES_SET_LOCAL_SQL, ["10000ms", "5000ms", "15000ms"]);
}

async function backendPid(client: PoolClient): Promise<number> {
  const result = await client.query<{ pid: number }>("SELECT pg_backend_pid()::integer AS pid");
  const pid = result.rows[0]?.pid;
  if (typeof pid !== "number" || !Number.isSafeInteger(pid)) {
    throw new Error("PostgreSQL did not return a backend PID.");
  }
  return pid;
}

async function waitForUnGrantedLock(pid: number): Promise<void> {
  const pool = requireAdminPool();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted) AS waiting",
      [pid]
    );
    if (result.rows[0]?.waiting === true) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The competing PostgreSQL insert did not enter a lock wait.");
}

function createLiveReservationDependency() {
  if (runtimeReservationDependency === undefined) {
    throw new Error("PostgreSQL runtime composition setup did not complete.");
  }
  return runtimeReservationDependency;
}

function adminCatalogDatabase(client: PoolClient): AltanaLpReservationAdminCatalogDatabase {
  return Object.freeze({
    executionBoundary: "server_admin_preflight" as const,
    query: async (statement: string, parameters: readonly (number | string)[]) =>
      client.query(statement, [...parameters])
  });
}

async function verifyWithClient(
  client: PoolClient
): Promise<AltanaLpReservationSchemaVerificationResult> {
  return verifyAltanaLpReservationPostgresSchema(adminCatalogDatabase(client));
}

async function expectCanonicalReady(
  client: PoolClient
): Promise<VerifiedAltanaLpReservationSchemaReady> {
  const verification = await verifyWithClient(client);
  expect(verification).toMatchObject({ status: "ready", postgresMajor: 17 });
  expect(isVerifiedAltanaLpReservationSchemaReady(verification)).toBe(true);
  if (!isVerifiedAltanaLpReservationSchemaReady(verification)) {
    throw new Error("Canonical PostgreSQL verification did not produce the nominal capability.");
  }
  return verification;
}

async function verifyInsideRolledBackMutation(
  mutation: string
): Promise<AltanaLpReservationSchemaVerificationResult> {
  const client = await requireAdminPool().connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(mutation);
    return await verifyWithClient(client);
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function expectCanonicalStateRestored(): Promise<void> {
  const client = await requireAdminPool().connect();
  try {
    await expectCanonicalReady(client);
  } finally {
    client.release();
  }
}

async function queryOwner(statement: string, parameters: readonly unknown[] = []): Promise<void> {
  const client = await requireAdminPool().connect();
  try {
    await setExactRole(client, ALTANA_LP_RESERVATION_OWNER_ROLE);
    await client.query(statement, [...parameters]);
  } finally {
    try {
      await client.query("RESET ROLE");
      client.release();
    } catch {
      client.release(true);
    }
  }
}

describe.skipIf(!runPostgresIntegration)("live PostgreSQL Altana LP reservation boundary", () => {
  beforeAll(async () => {
    const connectionString = requireDisposableConnectionUrl();
    const appConnectionString = applicationConnectionUrl(connectionString);
    let canonicalVerification: VerifiedAltanaLpReservationSchemaReady | undefined;
    adminPool = new Pool({
      application_name: "proofera-postgres-live-admin",
      connectionTimeoutMillis: 5_000,
      connectionString,
      max: 4
    });
    const client = await adminPool.connect();
    try {
      const target = await client.query<{
        database_name: string;
        encoding: string;
        is_superuser: boolean;
        postgres_major: number;
      }>(`SELECT
        current_database() AS database_name,
        current_setting('is_superuser')::boolean AS is_superuser,
        current_setting('server_version_num')::integer / 10000 AS postgres_major,
        current_setting('server_encoding') AS encoding`);
      expect(target.rows).toEqual([
        {
          database_name: REQUIRED_TEST_DATABASE,
          encoding: "UTF8",
          is_superuser: true,
          postgres_major: 17
        }
      ]);

      const priorState = await client.query<{
        app_role: string | null;
        owner_role: string | null;
        reservation_schema: string | null;
      }>(
        "SELECT to_regrole($1)::text AS owner_role, to_regrole($2)::text AS app_role, to_regnamespace($3)::text AS reservation_schema",
        [ALTANA_LP_RESERVATION_OWNER_ROLE, ALTANA_LP_RESERVATION_APP_ROLE, "proofera_activation"]
      );
      expect(priorState.rows).toEqual([
        { app_role: null, owner_role: null, reservation_schema: null }
      ]);

      await client.query(
        "CREATE ROLE proofera_activation_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
      );
      ownerRoleCreated = true;
      await client.query(
        "CREATE ROLE proofera_activation_app LOGIN PASSWORD 'disposable-proof-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
      );
      applicationRoleCreated = true;
      const migration = migrationArtifact();
      expect(isReviewedAltanaLpReservationMigrationArtifact(migration)).toBe(true);
      await client.query(migration);
      schemaCreated = true;
      canonicalVerification = await expectCanonicalReady(client);
    } catch {
      throw new Error(
        "The disposable PostgreSQL target could not be initialized; no connection details were retained."
      );
    } finally {
      client.release();
    }

    applicationPool = new Pool({
      application_name: "proofera-postgres-live-app",
      connectionTimeoutMillis: 5_000,
      connectionString: appConnectionString,
      max: 8
    });
    runtimeComposition = createAltanaLpPostgresPoolComposition({
      connectionString: appConnectionString,
      runtime: "test",
      tls: { mode: "disable" }
    });
    const applicationAccess = await runtimeComposition.probeApplicationAccess();
    expect(applicationAccess).toEqual({ status: "application_access_ready" });
    if (canonicalVerification === undefined) {
      throw new Error("Canonical PostgreSQL verification was not retained in-process.");
    }
    await expect(
      runtimeComposition.bindVerifiedSchema(Object.freeze({ ...canonicalVerification }))
    ).rejects.toMatchObject({ code: "SCHEMA_VERIFICATION_INVALID" });
    runtimeReservationDependency =
      await runtimeComposition.bindVerifiedSchema(canonicalVerification);
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (runtimeComposition !== undefined) {
      await runtimeComposition.close();
      runtimeComposition = undefined;
      runtimeReservationDependency = undefined;
    }
    if (applicationPool !== undefined) {
      await applicationPool.end();
      applicationPool = undefined;
    }
    if (adminPool === undefined) return;

    if (!schemaCreated && !applicationRoleCreated && !ownerRoleCreated) {
      await adminPool.end();
      adminPool = undefined;
      return;
    }

    const client = await adminPool.connect();
    try {
      await client.query("RESET ROLE");
      if (schemaCreated) {
        await client.query("DROP SCHEMA proofera_activation CASCADE");
        schemaCreated = false;
      }
      if (applicationRoleCreated) {
        await client.query("DROP ROLE proofera_activation_app");
        applicationRoleCreated = false;
      }
      if (ownerRoleCreated) {
        await client.query("DROP ROLE proofera_activation_owner");
        ownerRoleCreated = false;
      }
    } finally {
      client.release();
      await adminPool.end();
      adminPool = undefined;
    }
  }, TEST_TIMEOUT_MS);

  it(
    "uses two physical READ COMMITTED clients, waits on the unique claim, then observes the winner through a fresh statement snapshot",
    async () => {
      const winner = requestFixture(100);
      const first = await checkoutApplicationClient();
      const second = await checkoutApplicationClient();
      let firstOpen = false;
      let secondOpen = false;
      let waitingInsert: Promise<QueryResult> | undefined;
      try {
        const firstPid = await backendPid(first);
        const secondPid = await backendPid(second);
        expect(firstPid).not.toBe(secondPid);

        await beginReservationTransaction(first);
        firstOpen = true;
        await beginReservationTransaction(second);
        secondOpen = true;

        const isolation = await second.query<{ transaction_isolation: string }>(
          "SHOW transaction_isolation"
        );
        const readOnly = await second.query<{ transaction_read_only: string }>(
          "SHOW transaction_read_only"
        );
        expect(isolation.rows[0]?.transaction_isolation).toBe("read committed");
        expect(readOnly.rows[0]?.transaction_read_only).toBe("off");

        const beforeWinner = await second.query(ALTANA_LP_RESERVATION_CONFLICT_READ_SQL, [
          winner.reservationId,
          winner.contextId,
          winner.quoteId
        ]);
        expect(beforeWinner.rowCount).toBe(0);

        const inserted = await first.query(ALTANA_LP_RESERVATION_INSERT_SQL, [
          ...insertParameters(winner)
        ]);
        expect(inserted.rowCount).toBe(1);

        waitingInsert = second.query(ALTANA_LP_RESERVATION_INSERT_SQL, [
          ...insertParameters(winner)
        ]);
        await waitForUnGrantedLock(secondPid);
        await first.query(ALTANA_LP_POSTGRES_COMMIT_SQL);
        firstOpen = false;

        const losingInsert = await waitingInsert;
        waitingInsert = undefined;
        expect(losingInsert.rowCount).toBe(0);
        const afterWinner = await second.query(ALTANA_LP_RESERVATION_CONFLICT_READ_SQL, [
          winner.reservationId,
          winner.contextId,
          winner.quoteId
        ]);
        expect(afterWinner.rowCount).toBe(1);
        expect(afterWinner.rows[0]).toMatchObject({ reservationId: winner.reservationId });
        await second.query(ALTANA_LP_POSTGRES_COMMIT_SQL);
        secondOpen = false;
      } finally {
        if (firstOpen) await first.query(ALTANA_LP_POSTGRES_ROLLBACK_SQL).catch(() => undefined);
        if (waitingInsert !== undefined) await waitingInsert.catch(() => undefined);
        await releaseTestClient(first, false);
        await releaseTestClient(second, secondOpen);
      }
    },
    TEST_TIMEOUT_MS
  );

  it("returns one exact durable receipt to concurrent store callers", async () => {
    const dependency = createLiveReservationDependency();
    const request = requestFixture(200);

    const [first, second] = await Promise.all([
      dependency.consumeOrRead(request),
      dependency.consumeOrRead({ ...request })
    ]);

    expect(first).toEqual({ ...request, state: "consumed" });
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    const stored = await requireAdminPool().query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${RESERVATION_TABLE} WHERE reservation_id = $1`,
      [request.reservationId]
    );
    expect(stored.rows[0]?.count).toBe("1");
  });

  it("rejects a weakened constraint while the signed receipt remains unchanged", async () => {
    const verification = await verifyInsideRolledBackMutation(`
      ALTER TABLE ${RESERVATION_TABLE}
        DROP CONSTRAINT proofera_altana_lp_reservation_window;
      ALTER TABLE ${RESERVATION_TABLE}
        ADD CONSTRAINT proofera_altana_lp_reservation_window
        CHECK (
          expires_at::timestamptz >= consumed_at::timestamptz + INTERVAL '30 seconds'
          AND expires_at::timestamptz <= consumed_at::timestamptz + INTERVAL '20 minutes'
        );
    `);

    expect(verification).toEqual({
      status: "blocked",
      code: "SCHEMA_NOT_READY",
      failedChecks: ["catalog_fingerprint"]
    });
    await expectCanonicalStateRestored();
  });

  it("rejects a rogue INSERT grantee while the signed receipt remains unchanged", async () => {
    const verification = await verifyInsideRolledBackMutation(`
      CREATE ROLE proofera_activation_rogue
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
      GRANT INSERT ON TABLE ${RESERVATION_TABLE} TO proofera_activation_rogue;
    `);

    expect(verification).toEqual({
      status: "blocked",
      code: "SCHEMA_NOT_READY",
      failedChecks: ["authorization_surface", "catalog_fingerprint"]
    });
    await expectCanonicalStateRestored();
  });

  it("rejects an added rewrite rule while the signed receipt remains unchanged", async () => {
    const verification = await verifyInsideRolledBackMutation(`
      CREATE RULE proofera_rogue_insert_rule AS
        ON INSERT TO ${RESERVATION_TABLE} DO ALSO NOTHING;
    `);

    expect(verification).toEqual({
      status: "blocked",
      code: "SCHEMA_NOT_READY",
      failedChecks: ["catalog_fingerprint"]
    });
    await expectCanonicalStateRestored();
  });

  it("does not consume losing reservation or quote IDs after a context conflict", async () => {
    const dependency = createLiveReservationDependency();
    const winner = requestFixture(300);
    const loser = requestFixture(301, { contextId: winner.contextId });
    await dependency.consumeOrRead(winner);

    await expect(dependency.consumeOrRead(loser)).rejects.toMatchObject({
      code: "RESERVATION_CONFLICT",
      reservationOutcome: "rolled_back"
    });

    const recovered = {
      ...loser,
      contextId: bytes32(3099)
    } satisfies AltanaLpReservationRequest;
    await expect(dependency.consumeOrRead(recovered)).resolves.toMatchObject({
      reservationId: loser.reservationId,
      contextId: recovered.contextId,
      quoteId: loser.quoteId
    });
  });

  it("does not consume losing reservation or context IDs after a quote conflict", async () => {
    const dependency = createLiveReservationDependency();
    const winner = requestFixture(310);
    const loser = requestFixture(311, { quoteId: winner.quoteId });
    await dependency.consumeOrRead(winner);

    await expect(dependency.consumeOrRead(loser)).rejects.toMatchObject({
      code: "RESERVATION_CONFLICT",
      reservationOutcome: "rolled_back"
    });

    const recovered = {
      ...loser,
      quoteId: bytes32(3199)
    } satisfies AltanaLpReservationRequest;
    await expect(dependency.consumeOrRead(recovered)).resolves.toMatchObject({
      reservationId: loser.reservationId,
      contextId: loser.contextId,
      quoteId: recovered.quoteId
    });
  });

  it(
    "lets a blocked waiter insert after the uncommitted claimant rolls back",
    async () => {
      const request = requestFixture(400);
      const claimant = await checkoutApplicationClient();
      const waiter = await checkoutApplicationClient();
      let claimantOpen = false;
      let waiterOpen = false;
      let waitingInsert: Promise<QueryResult> | undefined;
      try {
        const claimantPid = await backendPid(claimant);
        const waiterPid = await backendPid(waiter);
        expect(claimantPid).not.toBe(waiterPid);
        await beginReservationTransaction(claimant);
        claimantOpen = true;
        await beginReservationTransaction(waiter);
        waiterOpen = true;

        const firstInsert = await claimant.query(ALTANA_LP_RESERVATION_INSERT_SQL, [
          ...insertParameters(request)
        ]);
        expect(firstInsert.rowCount).toBe(1);
        waitingInsert = waiter.query(ALTANA_LP_RESERVATION_INSERT_SQL, [
          ...insertParameters(request)
        ]);
        await waitForUnGrantedLock(waiterPid);

        await claimant.query(ALTANA_LP_POSTGRES_ROLLBACK_SQL);
        claimantOpen = false;
        const waiterInsert = await waitingInsert;
        waitingInsert = undefined;
        expect(waiterInsert.rowCount).toBe(1);
        await waiter.query(ALTANA_LP_POSTGRES_COMMIT_SQL);
        waiterOpen = false;

        const stored = await requireAdminPool().query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${RESERVATION_TABLE} WHERE reservation_id = $1`,
          [request.reservationId]
        );
        expect(stored.rows[0]?.count).toBe("1");
      } finally {
        if (claimantOpen) {
          await claimant.query(ALTANA_LP_POSTGRES_ROLLBACK_SQL).catch(() => undefined);
        }
        if (waitingInsert !== undefined) await waitingInsert.catch(() => undefined);
        await releaseTestClient(claimant, false);
        await releaseTestClient(waiter, waiterOpen);
      }
    },
    TEST_TIMEOUT_MS
  );

  it("limits the application role to SELECT and INSERT while preserving exact replay", async () => {
    const client = await checkoutApplicationClient();
    const request = requestFixture(500);
    try {
      const privileges = await client.query<{
        can_delete: boolean;
        can_insert: boolean;
        can_select: boolean;
        can_truncate: boolean;
        can_update: boolean;
        current_role: string;
      }>(
        `SELECT
          current_user AS current_role,
          has_table_privilege(current_user, '${RESERVATION_TABLE}', 'SELECT') AS can_select,
          has_table_privilege(current_user, '${RESERVATION_TABLE}', 'INSERT') AS can_insert,
          has_table_privilege(current_user, '${RESERVATION_TABLE}', 'UPDATE') AS can_update,
          has_table_privilege(current_user, '${RESERVATION_TABLE}', 'DELETE') AS can_delete,
          has_table_privilege(current_user, '${RESERVATION_TABLE}', 'TRUNCATE') AS can_truncate`
      );
      expect(privileges.rows).toEqual([
        {
          can_delete: false,
          can_insert: true,
          can_select: true,
          can_truncate: false,
          can_update: false,
          current_role: ALTANA_LP_RESERVATION_APP_ROLE
        }
      ]);

      const first = await client.query(ALTANA_LP_RESERVATION_INSERT_SQL, [
        ...insertParameters(request)
      ]);
      const replay = await client.query(ALTANA_LP_RESERVATION_INSERT_SQL, [
        ...insertParameters(request)
      ]);
      const read = await client.query(ALTANA_LP_RESERVATION_CONFLICT_READ_SQL, [
        request.reservationId,
        request.contextId,
        request.quoteId
      ]);
      expect(first.rowCount).toBe(1);
      expect(replay.rowCount).toBe(0);
      expect(read.rows).toHaveLength(1);
      expect(read.rows[0]).toMatchObject({ reservationId: request.reservationId });
    } finally {
      await releaseTestClient(client, false);
    }
  });

  it("rejects owner UPDATE, DELETE, and TRUNCATE through the append-only triggers", async () => {
    const dependency = createLiveReservationDependency();
    const request = requestFixture(600);
    await dependency.consumeOrRead(request);

    await expect(
      queryOwner(`UPDATE ${RESERVATION_TABLE} SET user_id = $1 WHERE reservation_id = $2`, [
        "user:postgres-live:mutated",
        request.reservationId
      ])
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      queryOwner(`DELETE FROM ${RESERVATION_TABLE} WHERE reservation_id = $1`, [
        request.reservationId
      ])
    ).rejects.toMatchObject({ code: "55000" });
    await expect(queryOwner(`TRUNCATE TABLE ${RESERVATION_TABLE}`)).rejects.toMatchObject({
      code: "55000"
    });

    const stored = await requireAdminPool().query<{ user_id: string }>(
      `SELECT user_id FROM ${RESERVATION_TABLE} WHERE reservation_id = $1`,
      [request.reservationId]
    );
    expect(stored.rows).toEqual([{ user_id: request.userId }]);
  });
});
