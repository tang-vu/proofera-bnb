import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AltanaLpReservationRequest } from "./altana-lp-handoff";
import {
  ALTANA_LP_POSTGRES_BEGIN_SQL,
  ALTANA_LP_POSTGRES_COMMIT_SQL,
  ALTANA_LP_POSTGRES_ROLLBACK_SQL,
  ALTANA_LP_POSTGRES_SET_LOCAL_SQL
} from "./altana-lp-postgres-transaction";
import {
  ALTANA_LP_RESERVATION_DOMAIN_SCHEMA_VERSION,
  ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256,
  ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256,
  ALTANA_LP_RESERVATION_SUPPORTED_POSTGRES_MAJOR,
  verifyAltanaLpReservationPostgresSchema,
  type VerifiedAltanaLpReservationSchemaReady
} from "./altana-lp-reservation-schema-verifier";
import {
  ALTANA_LP_RESERVATION_INSERT_SQL,
  ALTANA_LP_RESERVATION_MIGRATION_VERSION
} from "./altana-lp-reservation-store";
import {
  ALTANA_LP_POSTGRES_APPLICATION_ACCESS_PROBE_SQL,
  AltanaLpPostgresPoolError,
  createAltanaLpPostgresPoolComposition,
  isVerifiedAltanaLpDurableReservationDependency,
  type AltanaLpNodePostgresPoolConfiguration,
  type AltanaLpPostgresConnectionConfiguration,
  type AltanaLpPostgresOperationalSignal
} from "./altana-lp-postgres-pool.server";

const TEST_CREDENTIAL = ["synthetic", "credential"].join("-");
const CONNECTION_STRING = [
  "postgresql",
  "://",
  "proofera_activation_app",
  ":",
  TEST_CREDENTIAL,
  "@",
  "db.example.com:5432/proofera"
].join("");
const NOW = new Date("2026-08-11T00:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function configuration(
  overrides: Partial<AltanaLpPostgresConnectionConfiguration> = {}
): AltanaLpPostgresConnectionConfiguration {
  return {
    connectionString: CONNECTION_STRING,
    runtime: "production",
    tls: { mode: "verify-full" },
    ...overrides
  };
}

function testConnectionString(
  overrides: Readonly<{
    database?: string;
    password?: string | null;
    port?: string | null;
    protocol?: string;
    username?: string | null;
  }> = {}
): string {
  const database = overrides.database ?? "proofera";
  const password = overrides.password === undefined ? TEST_CREDENTIAL : overrides.password;
  const port = overrides.port === undefined ? "5432" : overrides.port;
  const protocol = overrides.protocol ?? "postgresql";
  const username =
    overrides.username === undefined ? "proofera_activation_app" : overrides.username;
  const authentication =
    username === null ? "" : [username, password === null ? "" : `:${password}`, "@"].join("");
  return [
    protocol,
    "://",
    authentication,
    "db.example.com",
    port === null ? "" : `:${port}`,
    "/",
    database
  ].join("");
}

let schemaProof: VerifiedAltanaLpReservationSchemaReady;

beforeEach(async () => {
  const result = await verifyAltanaLpReservationPostgresSchema({
    executionBoundary: "server_admin_preflight",
    query: async () => ({
      rowCount: 1,
      rows: [
        {
          actorAuthorized: true,
          platformSupported: true,
          rolesSafe: true,
          ownershipOk: true,
          authorizationSurfaceOk: true,
          migrationReceiptOk: true,
          catalogFingerprintOk: true
        }
      ]
    })
  });
  if (result.status !== "ready") throw new Error("test schema verification did not become ready");
  schemaProof = result;
});

interface FakePoolOptions {
  readonly end?: () => unknown;
  readonly query?: (statement: string) => unknown;
  readonly connect?: () => unknown;
  readonly on?: (event: string, listener: (error: unknown) => void) => unknown;
}

function fakePool(options: FakePoolOptions = {}) {
  const listeners: Array<(error: unknown) => void> = [];
  const pool = {
    connect: vi.fn(options.connect ?? (async () => ({}))),
    end: vi.fn(options.end ?? (async () => undefined)),
    on: vi.fn(
      options.on ??
        ((event: string, listener: (error: unknown) => void) => {
          if (event === "error") listeners.push(listener);
          return undefined;
        })
    ),
    query: vi.fn(
      options.query ?? (async () => ({ rowCount: 1, rows: [{ application_access_ready: true }] }))
    )
  };
  return { listeners, pool };
}

function expectPoolError(error: unknown, code: AltanaLpPostgresPoolError["code"]): void {
  expect(error).toBeInstanceOf(AltanaLpPostgresPoolError);
  expect(error).toMatchObject({ code, reservationOutcome: "not_attempted" });
  expect(String(error)).not.toContain(TEST_CREDENTIAL);
  expect(Object.prototype.hasOwnProperty.call(error, "cause")).toBe(false);
}

function bytes32(value: number): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function reservationRequest(): AltanaLpReservationRequest {
  return {
    schemaVersion: 2,
    reservationId: bytes32(1),
    contextId: bytes32(2),
    quoteId: bytes32(3),
    userId: "user:pool-composition",
    policyHash: bytes32(4),
    writeTargetBinding: {
      address: "0x5555555555555555555555555555555555555555",
      canonicalBlockHash: bytes32(5),
      canonicalBlockNumber: "124471937",
      chainId: 97,
      proxyKind: "none",
      reviewId: bytes32(6),
      runtimeCodeHash: bytes32(7)
    },
    consumedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 5 * 60_000).toISOString()
  };
}

describe("Altana LP node-postgres pool composition", () => {
  it("rejects structural reservation-dependency forgeries without inspecting them", () => {
    const rawCallback = vi.fn();
    const fake = Object.freeze({ consumeOrRead: rawCallback });
    const copied = Object.freeze({ ...fake });
    const jsonClone: unknown = JSON.parse(JSON.stringify(fake));
    const getter = vi.fn(() => rawCallback);
    const accessorForgery = Object.defineProperty({}, "consumeOrRead", {
      enumerable: true,
      get: getter
    });

    expect(isVerifiedAltanaLpDurableReservationDependency(rawCallback)).toBe(false);
    expect(isVerifiedAltanaLpDurableReservationDependency(fake)).toBe(false);
    expect(isVerifiedAltanaLpDurableReservationDependency(copied)).toBe(false);
    expect(isVerifiedAltanaLpDurableReservationDependency(jsonClone)).toBe(false);
    expect(isVerifiedAltanaLpDurableReservationDependency(accessorForgery)).toBe(false);
    expect(isVerifiedAltanaLpDurableReservationDependency(null)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it("builds a fixed production pool without exposing a write dependency", () => {
    const { pool } = fakePool();
    let received: AltanaLpNodePostgresPoolConfiguration | undefined;
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: (poolConfiguration) => {
        received = poolConfiguration;
        return pool;
      }
    });

    expect(received).toEqual({
      allowExitOnIdle: false,
      application_name: "proofera-altana-lp-reservation",
      client_encoding: "UTF8",
      connectionString: CONNECTION_STRING,
      connectionTimeoutMillis: 5_000,
      enableChannelBinding: true,
      fallback_application_name: "proofera-altana-lp-reservation",
      idleTimeoutMillis: 30_000,
      idle_in_transaction_session_timeout: 15_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      lock_timeout: 5_000,
      max: 8,
      maxLifetimeSeconds: 300,
      min: 0,
      options: "-c search_path=pg_catalog",
      query_timeout: 12_000,
      replication: "false",
      ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      sslnegotiation: "postgres",
      statement_timeout: 10_000
    });
    expect(Object.isFrozen(received)).toBe(true);
    expect(Object.isFrozen(received?.ssl)).toBe(true);
    expect(Object.keys(composition).sort()).toEqual([
      "bindVerifiedSchema",
      "close",
      "probeApplicationAccess"
    ]);
    expect(JSON.stringify(composition)).not.toContain(TEST_CREDENTIAL);
    expect(pool.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("passes a bounded custom CA only through the explicit verified TLS object", () => {
    const { pool } = fakePool();
    let received: AltanaLpNodePostgresPoolConfiguration | undefined;
    createAltanaLpPostgresPoolComposition(
      configuration({ tls: { ca: "trusted-ca", mode: "verify-full" } }),
      {
        poolFactory: (poolConfiguration) => {
          received = poolConfiguration;
          return pool;
        }
      }
    );
    expect(received?.ssl).toEqual({
      ca: "trusted-ca",
      minVersion: "TLSv1.2",
      rejectUnauthorized: true
    });
  });

  it("permits explicitly disabled TLS only outside production", () => {
    const { pool } = fakePool();
    let received: AltanaLpNodePostgresPoolConfiguration | undefined;
    createAltanaLpPostgresPoolComposition(
      configuration({ runtime: "test", tls: { mode: "disable" } }),
      {
        poolFactory: (poolConfiguration) => {
          received = poolConfiguration;
          return pool;
        }
      }
    );
    expect(received?.ssl).toBe(false);
    expect(received?.replication).toBe("false");
  });

  it("rejects disabled production TLS before constructing a pool", () => {
    const poolFactory = vi.fn();
    try {
      createAltanaLpPostgresPoolComposition(configuration({ tls: { mode: "disable" } }), {
        poolFactory
      });
      throw new Error("expected rejection");
    } catch (error) {
      expectPoolError(error, "TLS_VERIFICATION_REQUIRED");
    }
    expect(poolFactory).not.toHaveBeenCalled();
  });

  it.each([
    `${CONNECTION_STRING}?sslmode=no-verify`,
    `${CONNECTION_STRING}#fragment`,
    testConnectionString({ password: null }),
    testConnectionString({ port: null }),
    testConnectionString({ port: "0" }),
    testConnectionString({ port: "65536" }),
    testConnectionString({ port: "05432" }),
    testConnectionString({ database: "proof%2Fera" }),
    testConnectionString({ database: "proofera/extra" }),
    testConnectionString({ username: null }),
    testConnectionString({ username: "different_app_role" }),
    testConnectionString({ database: "", password: "credential" }),
    testConnectionString({ password: "credential", protocol: "https" }),
    ` ${CONNECTION_STRING}`,
    "not-a-url"
  ])(
    "rejects an ambient-fallback or parser-differential connection URL: %s",
    (connectionString) => {
      try {
        createAltanaLpPostgresPoolComposition(configuration({ connectionString }));
        throw new Error("expected rejection");
      } catch (error) {
        expectPoolError(error, "CONFIGURATION_INVALID");
      }
    }
  );

  it("accepts explicit percent-encoded credentials after an exact URL round trip", () => {
    const { pool } = fakePool();
    const connectionString = testConnectionString({ password: "synthetic%2Dcredential" });
    expect(() =>
      createAltanaLpPostgresPoolComposition(configuration({ connectionString }), {
        poolFactory: () => pool
      })
    ).not.toThrow();
  });

  it("rejects unknown fields and accessors without evaluating them", () => {
    let reads = 0;
    const malformed = {
      get connectionString() {
        reads += 1;
        return CONNECTION_STRING;
      },
      runtime: "production",
      tls: { mode: "verify-full" }
    };
    expect(() =>
      createAltanaLpPostgresPoolComposition(
        malformed as unknown as AltanaLpPostgresConnectionConfiguration
      )
    ).toThrow(expect.objectContaining({ code: "CONFIGURATION_INVALID" }));
    expect(reads).toBe(0);

    expect(() =>
      createAltanaLpPostgresPoolComposition({
        ...configuration(),
        unexpected: true
      } as unknown as AltanaLpPostgresConnectionConfiguration)
    ).toThrow(expect.objectContaining({ code: "CONFIGURATION_INVALID" }));
  });

  it("rejects malformed TLS and dependency boundaries", () => {
    for (const tls of [
      { ca: "not-allowed", mode: "disable" },
      { ca: "", mode: "verify-full" },
      { mode: "require" }
    ]) {
      expect(() =>
        createAltanaLpPostgresPoolComposition(
          configuration({ tls: tls as AltanaLpPostgresConnectionConfiguration["tls"] })
        )
      ).toThrow(expect.objectContaining({ code: "CONFIGURATION_INVALID" }));
    }
    expect(() =>
      createAltanaLpPostgresPoolComposition(configuration(), {
        onOperationalSignal: "not-a-function"
      } as never)
    ).toThrow(expect.objectContaining({ code: "DEPENDENCIES_INVALID" }));
  });

  it("sanitizes pool factory and listener registration failures", () => {
    expect(() =>
      createAltanaLpPostgresPoolComposition(configuration(), {
        poolFactory: () => {
          throw new Error(`driver failed ${CONNECTION_STRING}`);
        }
      })
    ).toThrow(expect.objectContaining({ code: "POOL_INITIALIZATION_FAILED" }));

    const { pool } = fakePool({
      on: () => {
        throw new Error(`listener failed ${CONNECTION_STRING}`);
      }
    });
    expect(() =>
      createAltanaLpPostgresPoolComposition(configuration(), { poolFactory: () => pool })
    ).toThrow(expect.objectContaining({ code: "POOL_INITIALIZATION_FAILED" }));
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed pool and closes it when an end boundary exists", async () => {
    const end = vi.fn(async () => undefined);
    expect(() =>
      createAltanaLpPostgresPoolComposition(configuration(), {
        poolFactory: () => ({ end })
      })
    ).toThrow(expect.objectContaining({ code: "POOL_BOUNDARY_INVALID" }));
    await Promise.resolve();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("converts idle errors to frozen safe signals and swallows telemetry failures", () => {
    const first = fakePool();
    const signals: AltanaLpPostgresOperationalSignal[] = [];
    createAltanaLpPostgresPoolComposition(configuration(), {
      onOperationalSignal: (signal) => signals.push(signal),
      poolFactory: () => first.pool
    });
    first.listeners[0]?.(new Error(`idle failure ${CONNECTION_STRING}`));
    expect(signals).toEqual([{ code: "POSTGRES_IDLE_CLIENT_ERROR" }]);
    expect(Object.isFrozen(signals[0])).toBe(true);
    expect(JSON.stringify(signals)).not.toContain(TEST_CREDENTIAL);

    const second = fakePool();
    createAltanaLpPostgresPoolComposition(configuration(), {
      onOperationalSignal: () => {
        throw new Error("telemetry unavailable");
      },
      poolFactory: () => second.pool
    });
    expect(() => second.listeners[0]?.(new Error("raw driver failure"))).not.toThrow();
  });

  it("names and reports only application access readiness", async () => {
    const { pool } = fakePool();
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });
    await expect(composition.probeApplicationAccess()).resolves.toEqual({
      status: "application_access_ready"
    });
    expect(pool.query).toHaveBeenCalledWith(ALTANA_LP_POSTGRES_APPLICATION_ACCESS_PROBE_SQL);
    expect(ALTANA_LP_POSTGRES_APPLICATION_ACCESS_PROBE_SQL).toContain(
      "AS application_access_ready"
    );
    expect(ALTANA_LP_POSTGRES_APPLICATION_ACCESS_PROBE_SQL).not.toContain("reservationReady");
    expect(ALTANA_LP_POSTGRES_APPLICATION_ACCESS_PROBE_SQL).not.toMatch(
      /(?:CREATE\s+(?:SCHEMA|TABLE|FUNCTION|TRIGGER)|ALTER\s+|GRANT\s+)/u
    );
  });

  it("accepts the node-postgres class-instance result envelope while validating its row strictly", async () => {
    class DriverResult {
      readonly command = "SELECT";
      readonly fields: readonly unknown[] = [];
      readonly oid = null;
      readonly rowCount = 1;
      readonly rows = [{ application_access_ready: true }];
    }

    const { pool } = fakePool({ query: async () => new DriverResult() });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });

    await expect(composition.probeApplicationAccess()).resolves.toEqual({
      status: "application_access_ready"
    });
  });

  it("distinguishes unavailable application access from database failure", async () => {
    const access = fakePool({
      query: async () => ({ rowCount: 1, rows: [{ application_access_ready: false }] })
    });
    const accessComposition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => access.pool
    });
    await expect(accessComposition.probeApplicationAccess()).resolves.toEqual({
      reason: "application_access_unavailable",
      status: "unavailable"
    });

    const database = fakePool({
      query: async () => {
        throw new Error(`database failure ${CONNECTION_STRING}`);
      }
    });
    const databaseComposition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => database.pool
    });
    await expect(databaseComposition.probeApplicationAccess()).resolves.toEqual({
      reason: "database_unavailable",
      status: "unavailable"
    });
  });

  it.each([
    { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [{ application_access_ready: "true" }] },
    { rowCount: 1, rows: [{ application_access_ready: true, extra: true }] },
    { rows: [{ application_access_ready: true }] }
  ])("fails closed on malformed application access results", async (result) => {
    const { pool } = fakePool({ query: async () => result });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });
    await expect(composition.probeApplicationAccess()).resolves.toEqual({
      reason: "database_unavailable",
      status: "unavailable"
    });
  });

  it("fails closed when an application access result is a hostile proxy", async () => {
    const result = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          throw new Error(`hostile result ${CONNECTION_STRING}`);
        }
      }
    );
    const { pool } = fakePool({ query: async () => result });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });
    await expect(composition.probeApplicationAccess()).resolves.toEqual({
      reason: "database_unavailable",
      status: "unavailable"
    });
  });

  it("bounds a hanging application access probe and emits no raw detail", async () => {
    vi.useFakeTimers();
    const signals: AltanaLpPostgresOperationalSignal[] = [];
    const { pool } = fakePool({ query: () => new Promise(() => undefined) });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      onOperationalSignal: (signal) => signals.push(signal),
      poolFactory: () => pool
    });
    const probe = composition.probeApplicationAccess();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(probe).resolves.toEqual({ reason: "probe_timeout", status: "unavailable" });
    expect(signals).toEqual([{ code: "POSTGRES_APPLICATION_ACCESS_PROBE_TIMEOUT" }]);
  });

  it("does not let a privilege-only probe create a usable durable dependency", async () => {
    const { pool } = fakePool();
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });
    await expect(composition.probeApplicationAccess()).resolves.toEqual({
      status: "application_access_ready"
    });
    expect(Object.prototype.hasOwnProperty.call(composition, "reservationDependency")).toBe(false);
    await expect(composition.bindVerifiedSchema(undefined as never)).rejects.toMatchObject({
      code: "SCHEMA_VERIFICATION_INVALID"
    });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("requires the exact frozen ready schema proof and rejects query-shaped input", async () => {
    const { pool } = fakePool();
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });
    const blocked = Object.freeze({
      status: "blocked" as const,
      code: "SCHEMA_NOT_READY" as const,
      failedChecks: Object.freeze(["authorization_surface" as const])
    });
    await expect(composition.bindVerifiedSchema(blocked)).rejects.toMatchObject({
      code: "SCHEMA_VERIFICATION_INVALID"
    });
    await expect(composition.bindVerifiedSchema({ ...schemaProof } as never)).rejects.toMatchObject(
      { code: "SCHEMA_VERIFICATION_INVALID" }
    );
    await expect(
      composition.bindVerifiedSchema(Object.freeze({ ...schemaProof }))
    ).rejects.toMatchObject({ code: "SCHEMA_VERIFICATION_INVALID" });
    await expect(
      composition.bindVerifiedSchema(
        Object.freeze(JSON.parse(JSON.stringify(schemaProof))) as never
      )
    ).rejects.toMatchObject({ code: "SCHEMA_VERIFICATION_INVALID" });
    await expect(
      composition.bindVerifiedSchema(Object.freeze({ ...schemaProof, query: vi.fn() }) as never)
    ).rejects.toMatchObject({ code: "SCHEMA_VERIFICATION_INVALID" });
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rejects a schema-proof accessor without invoking it", async () => {
    const { pool } = fakePool();
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });
    const getter = vi.fn(() => "ready");
    const proof = Object.freeze(
      Object.defineProperty(
        {
          migrationVersion: ALTANA_LP_RESERVATION_MIGRATION_VERSION,
          domainSchemaVersion: ALTANA_LP_RESERVATION_DOMAIN_SCHEMA_VERSION,
          postgresMajor: ALTANA_LP_RESERVATION_SUPPORTED_POSTGRES_MAJOR,
          sourceDdlSha256: ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256,
          catalogFingerprintSha256: ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256
        },
        "status",
        { enumerable: true, get: getter }
      )
    );
    await expect(composition.bindVerifiedSchema(proof as never)).rejects.toMatchObject({
      code: "SCHEMA_VERIFICATION_INVALID"
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it("fails binding when the fresh application identity probe is not ready", async () => {
    const { pool } = fakePool({
      query: async () => ({ rowCount: 1, rows: [{ application_access_ready: false }] })
    });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });
    await expect(composition.bindVerifiedSchema(schemaProof)).rejects.toMatchObject({
      code: "APPLICATION_ACCESS_UNAVAILABLE"
    });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("binds the real durable boundary only after both independent proofs", async () => {
    const request = reservationRequest();
    const release = vi.fn();
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (statement: string) => {
        statements.push(statement);
        if (statement === ALTANA_LP_RESERVATION_INSERT_SQL) {
          return { rowCount: 1, rows: [{ ...request, state: "consumed" }] };
        }
        if (
          statement === ALTANA_LP_POSTGRES_COMMIT_SQL ||
          statement === ALTANA_LP_POSTGRES_ROLLBACK_SQL
        ) {
          return { command: statement, rowCount: null, rows: [] };
        }
        if (statement === ALTANA_LP_POSTGRES_BEGIN_SQL) {
          return { command: "BEGIN", rowCount: null, rows: [] };
        }
        if (statement === ALTANA_LP_POSTGRES_SET_LOCAL_SQL) {
          return { command: "SELECT", rowCount: 1, rows: [{ set_config: "15000ms" }] };
        }
        return { rowCount: null, rows: [] };
      }),
      release
    };
    const { pool } = fakePool({ connect: async () => client });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      now: () => new Date(NOW),
      poolFactory: () => pool
    });

    const dependency = await composition.bindVerifiedSchema(schemaProof);
    expect(isVerifiedAltanaLpDurableReservationDependency(dependency)).toBe(true);
    expect(
      isVerifiedAltanaLpDurableReservationDependency(
        Object.freeze({ consumeOrRead: dependency.consumeOrRead })
      )
    ).toBe(false);
    expect(isVerifiedAltanaLpDurableReservationDependency(Object.freeze({ ...dependency }))).toBe(
      false
    );
    expect(
      isVerifiedAltanaLpDurableReservationDependency(JSON.parse(JSON.stringify(dependency)))
    ).toBe(false);
    await expect(composition.bindVerifiedSchema(schemaProof)).resolves.toBe(dependency);
    await expect(dependency.consumeOrRead(request)).resolves.toEqual({
      ...request,
      state: "consumed"
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(statements).toEqual([
      ALTANA_LP_POSTGRES_BEGIN_SQL,
      ALTANA_LP_POSTGRES_SET_LOCAL_SQL,
      ALTANA_LP_RESERVATION_INSERT_SQL,
      ALTANA_LP_POSTGRES_COMMIT_SQL
    ]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("wires transaction cleanup telemetry through a frozen safe signal", async () => {
    const request = reservationRequest();
    const signals: AltanaLpPostgresOperationalSignal[] = [];
    const client = {
      query: vi.fn(async (statement: string) => {
        if (statement === ALTANA_LP_RESERVATION_INSERT_SQL) {
          return { rowCount: 1, rows: [{ ...request, state: "consumed" }] };
        }
        if (statement === ALTANA_LP_POSTGRES_COMMIT_SQL) {
          return { command: "COMMIT", rowCount: null, rows: [] };
        }
        if (statement === ALTANA_LP_POSTGRES_BEGIN_SQL) {
          return { command: "BEGIN", rowCount: null, rows: [] };
        }
        if (statement === ALTANA_LP_POSTGRES_SET_LOCAL_SQL) {
          return { command: "SELECT", rowCount: 1, rows: [{ set_config: "15000ms" }] };
        }
        return { rowCount: null, rows: [] };
      }),
      release: vi.fn(() => {
        throw new Error(`cleanup failed ${CONNECTION_STRING}`);
      })
    };
    const { pool } = fakePool({ connect: async () => client });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      now: () => new Date(NOW),
      onOperationalSignal: (signal) => signals.push(signal),
      poolFactory: () => pool
    });
    const dependency = await composition.bindVerifiedSchema(schemaProof);
    await expect(dependency.consumeOrRead(request)).resolves.toMatchObject({ state: "consumed" });
    expect(signals).toEqual([
      { code: "POSTGRES_TRANSACTION_CLIENT_CLEANUP_FAILED", phase: "committed" }
    ]);
    expect(Object.isFrozen(signals[0])).toBe(true);
    expect(JSON.stringify(signals)).not.toContain(TEST_CREDENTIAL);
  });

  it("invalidates a retained dependency immediately when close starts", async () => {
    const request = reservationRequest();
    const client = {
      query: vi.fn(async (statement: string) =>
        statement === ALTANA_LP_POSTGRES_COMMIT_SQL
          ? { command: "COMMIT", rowCount: null, rows: [] }
          : { rowCount: 1, rows: [{ ...request, state: "consumed" }] }
      ),
      release: vi.fn()
    };
    const { pool } = fakePool({ connect: async () => client });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      now: () => new Date(NOW),
      poolFactory: () => pool
    });
    const dependency = await composition.bindVerifiedSchema(schemaProof);
    expect(isVerifiedAltanaLpDurableReservationDependency(dependency)).toBe(true);

    await expect(composition.close()).resolves.toEqual({ status: "closed" });
    expect(isVerifiedAltanaLpDurableReservationDependency(dependency)).toBe(true);
    await expect(dependency.consumeOrRead(request)).rejects.toMatchObject({
      code: "DEPENDENCY_CLOSED",
      reservationOutcome: "not_attempted"
    });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("cannot finish binding across a close race", async () => {
    let finishProbe: ((value: unknown) => void) | undefined;
    const { pool } = fakePool({
      query: () =>
        new Promise((resolve) => {
          finishProbe = resolve;
        })
    });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });
    const binding = composition.bindVerifiedSchema(schemaProof);
    await expect(composition.close()).resolves.toEqual({ status: "closed" });
    finishProbe?.({ rowCount: 1, rows: [{ application_access_ready: true }] });
    await expect(binding).rejects.toMatchObject({ code: "DEPENDENCY_CLOSED" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("closes once and blocks all later probes and bindings", async () => {
    const { pool } = fakePool();
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });
    await expect(Promise.all([composition.close(), composition.close()])).resolves.toEqual([
      { status: "closed" },
      { status: "closed" }
    ]);
    expect(pool.end).toHaveBeenCalledTimes(1);
    await expect(composition.probeApplicationAccess()).resolves.toEqual({
      reason: "closed",
      status: "unavailable"
    });
    await expect(composition.bindVerifiedSchema(schemaProof)).rejects.toMatchObject({
      code: "DEPENDENCY_CLOSED"
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns a bounded safe unknown outcome when close rejects", async () => {
    const signals: AltanaLpPostgresOperationalSignal[] = [];
    const { pool } = fakePool({
      end: async () => {
        throw new Error(`close failed ${CONNECTION_STRING}`);
      }
    });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      onOperationalSignal: (signal) => signals.push(signal),
      poolFactory: () => pool
    });
    await expect(composition.close()).resolves.toEqual({ status: "close_outcome_unknown" });
    expect(signals).toEqual([{ code: "POSTGRES_POOL_CLOSE_OUTCOME_UNKNOWN" }]);
  });

  it("bounds a hanging close and safely drains any late settlement", async () => {
    vi.useFakeTimers();
    let finishClose: (() => void) | undefined;
    const signals: AltanaLpPostgresOperationalSignal[] = [];
    const { pool } = fakePool({
      end: () =>
        new Promise<void>((resolve) => {
          finishClose = resolve;
        })
    });
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      onOperationalSignal: (signal) => signals.push(signal),
      poolFactory: () => pool
    });
    const closing = composition.close();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(closing).resolves.toEqual({ status: "close_outcome_unknown" });
    finishClose?.();
    await Promise.resolve();
    expect(signals).toEqual([{ code: "POSTGRES_POOL_CLOSE_OUTCOME_UNKNOWN" }]);
  });

  it("blocks creation and lifecycle methods in a browser-like runtime", async () => {
    vi.stubGlobal("window", { document: {} });
    expect(() => createAltanaLpPostgresPoolComposition(configuration())).toThrow(
      expect.objectContaining({ code: "SERVER_RUNTIME_REQUIRED" })
    );

    vi.unstubAllGlobals();
    const { pool } = fakePool();
    const composition = createAltanaLpPostgresPoolComposition(configuration(), {
      poolFactory: () => pool
    });
    vi.stubGlobal("window", { document: {} });
    await expect(composition.probeApplicationAccess()).rejects.toMatchObject({
      code: "SERVER_RUNTIME_REQUIRED"
    });
    expect(() => composition.close()).toThrow(
      expect.objectContaining({ code: "SERVER_RUNTIME_REQUIRED" })
    );
  });
});
