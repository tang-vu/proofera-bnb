import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pgMock = vi.hoisted(() => ({
  configurations: [] as unknown[],
  nextPool: null as (() => object) | null
}));

vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({
  Pool: class {
    constructor(configuration: unknown) {
      pgMock.configurations.push(configuration);
      if (pgMock.nextPool === null) throw new Error("No test pool configured.");
      return pgMock.nextPool();
    }
  }
}));

import type { AltanaGrantSubmissionClaim } from "./altana-grant";
import {
  ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL,
  ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL,
  ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL,
  ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL
} from "./altana-grant-claim-postgres-transaction";
import {
  ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL,
  ALTANA_GRANT_CLAIM_INSERT_SQL,
  ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL,
  ALTANA_GRANT_CLAIM_RECEIPT_RESULT_FIELDS,
  ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS,
  AltanaGrantClaimStoreError
} from "./altana-grant-claim-store";
import {
  ALTANA_GRANT_CLAIM_CAPABILITY_TTL_MS,
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_RESULT_FIELDS,
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL,
  ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256
} from "./altana-grant-claim-schema-verifier";
import {
  ALTANA_GRANT_CLAIM_POSTGRES_RELEASE_READINESS,
  AltanaGrantClaimPostgresServerError,
  createAltanaGrantClaimPostgresServer
} from "./altana-grant-claim-verified-store.server";
import {
  TEST_DEPLOYMENT_ID,
  persistedClaimRow,
  rawNodePostgresResult,
  testClaim
} from "./altana-grant-claim-postgres-test-support";

const TEST_CONFIGURATION = Object.freeze({
  connectionString: [
    "postgresql://proofera_grant_claim_app",
    ":disposable-test-only",
    "@127.0.0.1:5432/proofera_postgres_integration"
  ].join(""),
  runtime: "test" as const,
  tls: Object.freeze({ mode: "disable" as const })
});

function control(command: "BEGIN" | "COMMIT" | "ROLLBACK") {
  return rawNodePostgresResult(command, [], [], null, null);
}

function verifierResult(overrides: Readonly<Record<string, boolean>> = {}) {
  const row = Object.fromEntries(
    ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_RESULT_FIELDS.map((field) => [
      field,
      field === "deploymentId" ? TEST_DEPLOYMENT_ID : (overrides[field] ?? true)
    ])
  );
  return rawNodePostgresResult("SELECT", ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_RESULT_FIELDS, [row]);
}

function receiptResult(deploymentId = TEST_DEPLOYMENT_ID) {
  return rawNodePostgresResult("SELECT", ALTANA_GRANT_CLAIM_RECEIPT_RESULT_FIELDS, [
    {
      migrationVersion: 1,
      domainSchemaVersion: 1,
      postgresMajor: 17,
      semanticContractSha256: ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256,
      deploymentId
    }
  ]);
}

class FakeClient {
  readonly releases: boolean[] = [];
  readonly statements: string[] = [];
  handler: (statement: string, parameters: readonly unknown[]) => Promise<unknown>;

  constructor(handler: (statement: string, parameters: readonly unknown[]) => Promise<unknown>) {
    this.handler = handler;
  }

  async query(statement: unknown, parameters: unknown = []): Promise<unknown> {
    if (typeof statement !== "string" || !Array.isArray(parameters)) throw new Error("bad call");
    this.statements.push(statement);
    return this.handler(statement, [...parameters]);
  }

  release(destroy = false): void {
    this.releases.push(destroy);
  }
}

class FakePool {
  readonly clients: FakeClient[] = [];
  readonly listeners: Array<(...arguments_: unknown[]) => void> = [];
  readonly queries: string[] = [];
  readonly preparedClients = new WeakSet<FakeClient>();
  connectHandler: (() => Promise<FakeClient>) | null = null;
  endCalls = 0;
  endHandler: () => Promise<void> = async () => undefined;
  verifier: () => Promise<unknown> = async () => verifierResult();
  clientFactory: () => FakeClient;

  constructor(clientFactory: () => FakeClient) {
    this.clientFactory = clientFactory;
  }

  async connect(): Promise<FakeClient> {
    const client =
      this.connectHandler === null ? this.clientFactory() : await this.connectHandler();
    if (!this.preparedClients.has(client)) {
      const operationHandler = client.handler;
      client.handler = async (statement, parameters) => {
        if (statement === ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL) {
          this.queries.push(statement);
          return this.verifier();
        }
        return operationHandler(statement, parameters);
      };
      this.preparedClients.add(client);
    }
    this.clients.push(client);
    return client;
  }

  on(event: unknown, listener: unknown): this {
    if (event !== "error" || typeof listener !== "function") throw new Error("bad listener");
    this.listeners.push(listener as (...arguments_: unknown[]) => void);
    return this;
  }

  async end(): Promise<void> {
    this.endCalls += 1;
    return this.endHandler();
  }
}

function claimedClient(claim: AltanaGrantSubmissionClaim = testClaim()): FakeClient {
  return new FakeClient(async (statement) => {
    if (statement === ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL) return control("BEGIN");
    if (statement === ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL) {
      return rawNodePostgresResult(
        "SELECT",
        ["statementTimeout", "lockTimeout", "idleTimeout"],
        [{ statementTimeout: "10s", lockTimeout: "5s", idleTimeout: "15s" }]
      );
    }
    if (statement === ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL) return receiptResult();
    if (statement === ALTANA_GRANT_CLAIM_INSERT_SQL) {
      return rawNodePostgresResult(
        "INSERT",
        ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS,
        [persistedClaimRow(claim, "claimed")],
        0
      );
    }
    if (statement === ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL) return control("COMMIT");
    throw new Error("Unexpected fixed SQL.");
  });
}

function installPool(pool: FakePool): void {
  pgMock.nextPool = () => pool;
}

function never<Value>(): Promise<Value> {
  return new Promise(() => undefined);
}

function clientStallingAt(statementToStall: string): FakeClient {
  const client = claimedClient();
  const baseHandler = client.handler;
  client.handler = async (statement, parameters) =>
    statement === statementToStall ? never() : baseHandler(statement, parameters);
  return client;
}

beforeEach(() => {
  pgMock.configurations.length = 0;
  pgMock.nextPool = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("module-owned Altana grant-claim PostgreSQL server composition", () => {
  it("records real-PG implementation evidence without claiming deployment readiness", () => {
    expect(ALTANA_GRANT_CLAIM_POSTGRES_RELEASE_READINESS).toEqual({
      canonicalMigrationArtifact: true,
      independentCatalogVerifier: true,
      moduleOwnedSamePoolGateway: true,
      realPostgres17Verified: true,
      deploymentConfigured: false,
      releaseReady: false
    });
  });

  it("requires an exact direct app URL and verified TLS in production before constructing a pool", () => {
    for (const configuration of [
      {
        ...TEST_CONFIGURATION,
        connectionString: TEST_CONFIGURATION.connectionString.replace("app:", "owner:")
      },
      {
        ...TEST_CONFIGURATION,
        connectionString: `${TEST_CONFIGURATION.connectionString}?sslmode=disable`
      },
      { ...TEST_CONFIGURATION, unexpected: true },
      { ...TEST_CONFIGURATION, runtime: "production" as const }
    ]) {
      expect(() =>
        createAltanaGrantClaimPostgresServer(
          configuration as Parameters<typeof createAltanaGrantClaimPostgresServer>[0]
        )
      ).toThrowError(AltanaGrantClaimPostgresServerError);
    }
    expect(pgMock.configurations).toHaveLength(0);
  });

  it("returns only verify, claim, and close while keeping pool/database/capability private", () => {
    installPool(new FakePool(() => claimedClient()));
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    expect(Object.keys(server).sort()).toEqual(["claimSubmission", "close", "verifyReadiness"]);
    expect("pool" in server).toBe(false);
    expect("database" in server).toBe(false);
    expect("bindVerifiedSchema" in server).toBe(false);
  });

  it("does not check out a write client before authentic in-process verification", async () => {
    const pool = new FakePool(() => claimedClient());
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    await expect(server.claimSubmission(testClaim())).rejects.toMatchObject({
      code: "SCHEMA_NOT_READY",
      claimOutcome: "not_attempted"
    });
    expect(pool.clients).toHaveLength(0);
    expect(pool.queries).toHaveLength(0);
  });

  it("verifies and claims through the exact same module-owned pool with a deployment-bound receipt", async () => {
    const claim = testClaim();
    const pool = new FakePool(() => claimedClient(claim));
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);

    await expect(server.verifyReadiness()).resolves.toMatchObject({
      status: "ready",
      deploymentId: TEST_DEPLOYMENT_ID
    });
    await expect(server.claimSubmission(claim)).resolves.toMatchObject({ status: "claimed" });
    expect(pool.queries).toEqual([ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL]);
    expect(pool.clients).toHaveLength(2);
    expect(pool.clients[0]?.statements).toEqual([ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL]);
    expect(pool.clients[0]?.releases).toEqual([false]);
    expect(pool.clients[1]?.statements).toEqual([
      ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL,
      ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL,
      ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL,
      ALTANA_GRANT_CLAIM_INSERT_SQL,
      ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL
    ]);
  });

  it("cannot mint readiness from a cloned result, structural pool, or configuration extra", async () => {
    const firstPool = new FakePool(() => claimedClient());
    installPool(firstPool);
    const first = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    const readiness = await first.verifyReadiness();
    expect(readiness).toMatchObject({ status: "ready" });
    const copied = Object.freeze({ ...readiness });

    const secondPool = new FakePool(() => claimedClient());
    installPool(secondPool);
    const second = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    expect(copied).toMatchObject({ status: "ready" });
    await expect(second.claimSubmission(testClaim())).rejects.toMatchObject({
      code: "SCHEMA_NOT_READY",
      claimOutcome: "not_attempted"
    });
    expect(secondPool.clients).toHaveLength(0);
  });

  it("expires readiness and invalidates it on an idle pool error", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-12T00:00:00Z"));
    const pool = new FakePool(() => claimedClient());
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    await server.verifyReadiness();
    vi.setSystemTime(Date.now() + ALTANA_GRANT_CLAIM_CAPABILITY_TTL_MS);
    await expect(server.claimSubmission(testClaim())).rejects.toMatchObject({
      code: "SCHEMA_NOT_READY"
    });
    expect(pool.clients).toHaveLength(1);

    await server.verifyReadiness();
    pool.listeners[0]?.(new Error("ignored driver detail"));
    await expect(server.claimSubmission(testClaim())).rejects.toMatchObject({
      code: "SCHEMA_NOT_READY"
    });
    expect(pool.clients).toHaveLength(2);
  });

  it("actively destroys a stalled verifier client before allowing another verification", async () => {
    vi.useFakeTimers();
    const pool = new FakePool(() => claimedClient());
    pool.verifier = () => never();
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);

    const first = server.verifyReadiness();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(first).resolves.toEqual({
      status: "unavailable",
      reason: "verification_timeout"
    });
    expect(pool.clients).toHaveLength(1);
    expect(pool.clients[0]?.releases).toEqual([true]);

    pool.verifier = async () => verifierResult();
    await expect(server.verifyReadiness()).resolves.toMatchObject({ status: "ready" });
    expect(pool.clients).toHaveLength(2);
    expect(pool.clients[1]?.releases).toEqual([false]);
  });

  it("bounds verifier acquisition and destroys a client that arrives after timeout", async () => {
    vi.useFakeTimers();
    let resolveClient: ((client: FakeClient) => void) | undefined;
    const lateClientPromise = new Promise<FakeClient>((resolve) => {
      resolveClient = resolve;
    });
    const lateClient = claimedClient();
    const pool = new FakePool(() => claimedClient());
    pool.connectHandler = () => lateClientPromise;
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);

    const verification = server.verifyReadiness();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(verification).resolves.toEqual({
      status: "unavailable",
      reason: "verification_timeout"
    });
    resolveClient?.(lateClient);
    await vi.runAllTimersAsync();
    expect(lateClient.releases).toEqual([true]);
    expect(pool.queries).toHaveLength(0);
  });

  it("maps a claim client-acquire timeout to an exact prewrite failure", async () => {
    vi.useFakeTimers();
    const pool = new FakePool(() => claimedClient());
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    await server.verifyReadiness();
    const lateClient = claimedClient();
    let resolveClient: ((client: FakeClient) => void) | undefined;
    pool.connectHandler = () =>
      new Promise<FakeClient>((resolve) => {
        resolveClient = resolve;
      });

    const operation = server.claimSubmission(testClaim());
    const observed = operation.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(observed).resolves.toMatchObject({
      code: "DATABASE_PREWRITE_FAILED",
      claimOutcome: "not_attempted"
    });
    resolveClient?.(lateClient);
    await vi.runAllTimersAsync();
    expect(lateClient.releases).toEqual([true]);
  });

  it.each([
    [ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL, 5_000, "DATABASE_PREWRITE_FAILED", "not_attempted"],
    [ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL, 5_000, "DATABASE_PREWRITE_FAILED", "not_attempted"],
    [ALTANA_GRANT_CLAIM_INSERT_SQL, 12_000, "DATABASE_OUTCOME_UNKNOWN", "unknown"],
    [ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL, 5_000, "DATABASE_OUTCOME_UNKNOWN", "unknown"]
  ] as const)(
    "maps a stalled %s gateway branch without retry",
    async (statement, elapsedMs, code, claimOutcome) => {
      vi.useFakeTimers();
      const pool = new FakePool(() => clientStallingAt(statement));
      installPool(pool);
      const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
      await server.verifyReadiness();

      const operation = server.claimSubmission(testClaim());
      const observed = operation.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(elapsedMs);
      await expect(observed).resolves.toMatchObject({ code, claimOutcome });
      const transactionClient = pool.clients.at(-1);
      expect(transactionClient?.statements.filter((item) => item === statement)).toHaveLength(1);
      expect(transactionClient?.releases).toEqual([true]);
    }
  );

  it("maps a rejected COMMIT acknowledgement to unknown through the public gateway", async () => {
    const pool = new FakePool(() => {
      const client = claimedClient();
      const baseHandler = client.handler;
      client.handler = async (statement, parameters) => {
        if (statement === ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL) {
          throw new Error("commit detail must not escape");
        }
        return baseHandler(statement, parameters);
      };
      return client;
    });
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    await server.verifyReadiness();

    const error = await server.claimSubmission(testClaim()).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AltanaGrantClaimStoreError);
    expect(error).toMatchObject({
      code: "DATABASE_OUTCOME_UNKNOWN",
      claimOutcome: "unknown"
    });
    expect(String(error)).not.toContain("commit detail");
    expect(pool.clients.at(-1)?.releases).toEqual([true]);
  });

  it("rolls back and sanitizes a same-pool deployment UUID mismatch", async () => {
    const client = claimedClient();
    client.handler = async (statement, parameters) => {
      if (statement === ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL) {
        return receiptResult("d186cc34-6b0a-4bb1-8fd8-f542aca77584");
      }
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL) return control("ROLLBACK");
      return claimedClient().handler(statement, parameters);
    };
    const pool = new FakePool(() => client);
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    await server.verifyReadiness();

    const error = await server.claimSubmission(testClaim()).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AltanaGrantClaimStoreError);
    expect(error).toMatchObject({ code: "SCHEMA_NOT_READY", claimOutcome: "not_attempted" });
    expect(String(error)).not.toContain("d186cc34");
    expect(client.statements).not.toContain(ALTANA_GRANT_CLAIM_INSERT_SQL);
  });

  it("lets an unknown rollback outcome dominate the failed operation label", async () => {
    const claim = testClaim();
    const client = new FakeClient(async (statement) => {
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL) return control("BEGIN");
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL) {
        return rawNodePostgresResult(
          "SELECT",
          ["statementTimeout", "lockTimeout", "idleTimeout"],
          [{ statementTimeout: "10s", lockTimeout: "5s", idleTimeout: "15s" }]
        );
      }
      if (statement === ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL) return receiptResult();
      if (statement === ALTANA_GRANT_CLAIM_INSERT_SQL) {
        return rawNodePostgresResult(
          "INSERT",
          ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS,
          [persistedClaimRow(testClaim(2), "claimed")],
          0
        );
      }
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL) {
        throw new Error("rollback detail must not escape");
      }
      throw new Error("Unexpected fixed SQL.");
    });
    const pool = new FakePool(() => client);
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    await server.verifyReadiness();

    const error = await server.claimSubmission(claim).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AltanaGrantClaimStoreError);
    expect(error).toMatchObject({
      code: "DATABASE_OUTCOME_UNKNOWN",
      claimOutcome: "unknown"
    });
    expect(String(error)).not.toContain("rollback detail");
    expect(client.statements.at(-1)).toBe(ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL);
    expect(client.releases).toEqual([false, true]);
  });

  it("invalidates readiness and exposes no pool after close", async () => {
    const pool = new FakePool(() => claimedClient());
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    await server.verifyReadiness();
    await expect(server.close()).resolves.toEqual({ status: "closed" });
    await expect(server.close()).resolves.toEqual({ status: "closed" });
    expect(pool.endCalls).toBe(1);
    await expect(server.verifyReadiness()).resolves.toEqual({
      status: "unavailable",
      reason: "closed"
    });
    await expect(server.claimSubmission(testClaim())).rejects.toMatchObject({
      code: "SCHEMA_NOT_READY",
      claimOutcome: "not_attempted"
    });
  });

  it("bounds an unacknowledged pool close without exposing the pool", async () => {
    vi.useFakeTimers();
    const pool = new FakePool(() => claimedClient());
    pool.endHandler = () => never();
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);

    const closing = server.close();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(closing).resolves.toEqual({ status: "close_outcome_unknown" });
    expect(pool.endCalls).toBe(1);
    await expect(server.claimSubmission(testClaim())).rejects.toMatchObject({
      code: "SCHEMA_NOT_READY",
      claimOutcome: "not_attempted"
    });
  });

  it("fails before Pool construction in a browser runtime", () => {
    vi.stubGlobal("window", { document: {} });
    expect(() => createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION)).toThrowError(
      AltanaGrantClaimPostgresServerError
    );
    expect(pgMock.configurations).toHaveLength(0);
  });

  it("does not surface a blocked verifier result as usable readiness", async () => {
    const pool = new FakePool(() => claimedClient());
    pool.verifier = async () => verifierResult({ aclInventoryOk: false });
    installPool(pool);
    const server = createAltanaGrantClaimPostgresServer(TEST_CONFIGURATION);
    await expect(server.verifyReadiness()).resolves.toEqual({
      status: "blocked",
      code: "SCHEMA_NOT_READY",
      failedChecks: ["acl_inventory"]
    });
    await expect(server.claimSubmission(testClaim())).rejects.toMatchObject({
      code: "SCHEMA_NOT_READY"
    });
    expect(pool.clients).toHaveLength(1);
  });

  it("keeps the fixed conflict SQL inside the transaction gateway, not the public service", () => {
    expect(ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL).toContain("ORDER BY bootstrap_id ASC");
    expect(ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL).toContain("LIMIT 5");
  });
});
