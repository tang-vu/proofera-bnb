import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ALTANA_LP_RESERVATION_CONFLICT_READ_SQL,
  ALTANA_LP_RESERVATION_INSERT_SQL,
  ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS,
  AltanaLpReservationStoreError,
  type AltanaLpReservationPostgresParameter
} from "./altana-lp-reservation-store";
import {
  ALTANA_LP_POSTGRES_BEGIN_SQL,
  ALTANA_LP_POSTGRES_COMMIT_SQL,
  ALTANA_LP_POSTGRES_ROLLBACK_SQL,
  ALTANA_LP_POSTGRES_SET_LOCAL_SQL,
  AltanaLpPostgresTransactionError,
  createNodePostgresAltanaLpReservationDatabase
} from "./altana-lp-postgres-transaction";

type QueryCall = Readonly<{
  statement: string;
  parameters: readonly AltanaLpReservationPostgresParameter[] | undefined;
}>;

function controlOrEmptyResult(call: QueryCall): unknown {
  if (call.statement === ALTANA_LP_POSTGRES_BEGIN_SQL) {
    return { command: "BEGIN", rowCount: null, rows: [] };
  }
  if (call.statement === ALTANA_LP_POSTGRES_SET_LOCAL_SQL) {
    return { command: "SELECT", rowCount: 1, rows: [{ set_config: "15000ms" }] };
  }
  if (
    call.statement === ALTANA_LP_POSTGRES_COMMIT_SQL ||
    call.statement === ALTANA_LP_POSTGRES_ROLLBACK_SQL
  ) {
    return { command: call.statement, rowCount: null, rows: [] };
  }
  return { rowCount: null, rows: [] };
}

class FakeClient {
  readonly calls: QueryCall[] = [];
  readonly releases: boolean[] = [];
  handler: (call: QueryCall) => Promise<unknown> = async (call) => {
    if (
      call.statement === ALTANA_LP_RESERVATION_INSERT_SQL ||
      call.statement === ALTANA_LP_RESERVATION_CONFLICT_READ_SQL
    ) {
      return { rowCount: 1, rows: [{ ok: true }] };
    }
    return controlOrEmptyResult(call);
  };

  async query(
    statement: string,
    parameters?: readonly AltanaLpReservationPostgresParameter[]
  ): Promise<unknown> {
    const call = { statement, parameters };
    this.calls.push(call);
    return this.handler(call);
  }

  release(destroy = false): void {
    this.releases.push(destroy);
  }
}

class FakePool {
  connectCount = 0;

  constructor(readonly client: unknown) {}

  async connect(): Promise<unknown> {
    this.connectCount += 1;
    return this.client;
  }
}

function createDatabase(client = new FakeClient()) {
  const pool = new FakePool(client);
  const database = createNodePostgresAltanaLpReservationDatabase({ pool });
  return { client, database, pool };
}

const INSERT_PARAMETERS = Object.freeze([1, "a", "b", "c"]);

afterEach(() => {
  vi.useRealTimers();
});

describe("node-postgres Altana LP reservation transaction boundary", () => {
  it("uses one checked-out client for explicit READ COMMITTED setup, work, and commit", async () => {
    const { client, database, pool } = createDatabase();

    const result = await database.transaction(
      ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS,
      async (transaction) => transaction.query(ALTANA_LP_RESERVATION_INSERT_SQL, INSERT_PARAMETERS)
    );

    expect(result).toEqual({ rowCount: 1, rows: [{ ok: true }] });
    expect(pool.connectCount).toBe(1);
    expect(client.calls).toEqual([
      { statement: ALTANA_LP_POSTGRES_BEGIN_SQL, parameters: undefined },
      {
        statement: ALTANA_LP_POSTGRES_SET_LOCAL_SQL,
        parameters: ["10000ms", "5000ms", "15000ms"]
      },
      { statement: ALTANA_LP_RESERVATION_INSERT_SQL, parameters: INSERT_PARAMETERS },
      { statement: ALTANA_LP_POSTGRES_COMMIT_SQL, parameters: undefined }
    ]);
    expect(client.releases).toEqual([false]);
  });

  it("applies bounded custom timeouts as transaction-local server settings", async () => {
    const client = new FakeClient();
    const database = createNodePostgresAltanaLpReservationDatabase({
      idleInTransactionTimeoutMs: 8_000,
      lockTimeoutMs: 2_000,
      pool: new FakePool(client),
      statementTimeoutMs: 7_000
    });

    await database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "ok");

    expect(client.calls[1]).toEqual({
      statement: ALTANA_LP_POSTGRES_SET_LOCAL_SQL,
      parameters: ["7000ms", "2000ms", "8000ms"]
    });
  });

  it("fails closed when BEGIN returns a different command tag", async () => {
    const { client, database } = createDatabase();
    client.handler = async (call) =>
      call.statement === ALTANA_LP_POSTGRES_BEGIN_SQL
        ? { command: "ROLLBACK", rowCount: null, rows: [] }
        : controlOrEmptyResult(call);

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "never")
    ).rejects.toMatchObject({
      code: "TRANSACTION_START_FAILED",
      reservationOutcome: "rolled_back"
    });
    expect(client.calls).toHaveLength(1);
    expect(client.releases).toEqual([true]);
  });

  it("rolls back when SET LOCAL returns a different command tag", async () => {
    const { client, database } = createDatabase();
    client.handler = async (call) =>
      call.statement === ALTANA_LP_POSTGRES_SET_LOCAL_SQL
        ? { command: "ROLLBACK", rowCount: null, rows: [] }
        : controlOrEmptyResult(call);

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "never")
    ).rejects.toMatchObject({
      code: "TRANSACTION_SETUP_FAILED",
      reservationOutcome: "rolled_back"
    });
    expect(client.calls.map((call) => call.statement)).toEqual([
      ALTANA_LP_POSTGRES_BEGIN_SQL,
      ALTANA_LP_POSTGRES_SET_LOCAL_SQL,
      ALTANA_LP_POSTGRES_ROLLBACK_SQL
    ]);
    expect(client.releases).toEqual([false]);
  });

  it("permits only the two fixed, parameterized reservation statements", async () => {
    const { client, database } = createDatabase();

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async (transaction) =>
        transaction.query("DELETE FROM reservations", [])
      )
    ).rejects.toMatchObject({ code: "QUERY_FORBIDDEN" });

    expect(client.calls.map((call) => call.statement)).toEqual([
      ALTANA_LP_POSTGRES_BEGIN_SQL,
      ALTANA_LP_POSTGRES_SET_LOCAL_SQL,
      ALTANA_LP_POSTGRES_ROLLBACK_SQL
    ]);
    expect(client.releases).toEqual([false]);
  });

  it("supports the exact conflict read after the insert on the same client", async () => {
    const { client, database } = createDatabase();

    await database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async (transaction) => {
      await transaction.query(ALTANA_LP_RESERVATION_INSERT_SQL, INSERT_PARAMETERS);
      return transaction.query(ALTANA_LP_RESERVATION_CONFLICT_READ_SQL, ["a", "b", "c"]);
    });

    expect(client.calls.map((call) => call.statement)).toEqual([
      ALTANA_LP_POSTGRES_BEGIN_SQL,
      ALTANA_LP_POSTGRES_SET_LOCAL_SQL,
      ALTANA_LP_RESERVATION_INSERT_SQL,
      ALTANA_LP_RESERVATION_CONFLICT_READ_SQL,
      ALTANA_LP_POSTGRES_COMMIT_SQL
    ]);
  });

  it("rolls back and sanitizes an unknown operation error", async () => {
    const { client, database } = createDatabase();
    const logicalError = new Error("logical failure");

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => {
        throw logicalError;
      })
    ).rejects.toMatchObject({
      code: "TRANSACTION_OPERATION_FAILED",
      reservationOutcome: "rolled_back"
    });

    expect(client.calls.at(-1)?.statement).toBe(ALTANA_LP_POSTGRES_ROLLBACK_SQL);
    expect(client.releases).toEqual([false]);
  });

  it("destroys the client and emits no raw cause when COMMIT acknowledgement is lost", async () => {
    const { client, database } = createDatabase();
    client.handler = async (call) => {
      if (call.statement === ALTANA_LP_POSTGRES_COMMIT_SQL) {
        throw new Error("postgres://user:password@private-host/db");
      }
      return controlOrEmptyResult(call);
    };

    let received: unknown;
    try {
      await database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "ok");
    } catch (error) {
      received = error;
    }

    expect(received).toBeInstanceOf(AltanaLpPostgresTransactionError);
    expect(received).toMatchObject({ code: "COMMIT_OUTCOME_UNKNOWN" });
    expect(JSON.stringify(received)).not.toContain("private-host");
    expect(client.calls.some((call) => call.statement === ALTANA_LP_POSTGRES_ROLLBACK_SQL)).toBe(
      false
    );
    expect(client.releases).toEqual([true]);
  });

  it.each([
    { command: "ROLLBACK", rowCount: null, rows: [] },
    { command: "COMMIT", rowCount: 0, rows: [] },
    { command: "COMMIT", rowCount: null, rows: [{}] },
    { rowCount: null, rows: [] }
  ])("treats a wrong or malformed COMMIT acknowledgement as outcome unknown", async (result) => {
    const { client, database } = createDatabase();
    client.handler = async (call) =>
      call.statement === ALTANA_LP_POSTGRES_COMMIT_SQL ? result : controlOrEmptyResult(call);

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "submitted")
    ).rejects.toMatchObject({
      code: "COMMIT_OUTCOME_UNKNOWN",
      reservationOutcome: "unknown"
    });
    expect(client.releases).toEqual([true]);
    expect(
      client.calls.filter((call) => call.statement === ALTANA_LP_POSTGRES_COMMIT_SQL)
    ).toHaveLength(1);
    expect(client.calls.some((call) => call.statement === ALTANA_LP_POSTGRES_ROLLBACK_SQL)).toBe(
      false
    );
  });

  it("keeps an acknowledged commit known when pool release cleanup throws", async () => {
    const client = new FakeClient();
    vi.spyOn(client, "release").mockImplementation(() => {
      throw new Error("pool cleanup detail");
    });
    const onCleanupFailure = vi.fn();
    const database = createNodePostgresAltanaLpReservationDatabase({
      onCleanupFailure,
      pool: new FakePool(client)
    });

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "committed")
    ).resolves.toBe("committed");
    expect(onCleanupFailure).toHaveBeenCalledWith("committed");
  });

  it("preserves a known rolled-back store error when release cleanup throws", async () => {
    const client = new FakeClient();
    vi.spyOn(client, "release").mockImplementation(() => {
      throw new Error("pool cleanup detail");
    });
    const onCleanupFailure = vi.fn();
    const database = createNodePostgresAltanaLpReservationDatabase({
      onCleanupFailure,
      pool: new FakePool(client)
    });
    const logicalError = new AltanaLpReservationStoreError("RESERVATION_CONFLICT");

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => {
        throw logicalError;
      })
    ).rejects.toBe(logicalError);
    expect(onCleanupFailure).toHaveBeenCalledWith("rolled_back");
  });

  it("destroys the client when rollback acknowledgement is lost", async () => {
    const { client, database } = createDatabase();
    client.handler = async (call) => {
      if (call.statement === ALTANA_LP_POSTGRES_ROLLBACK_SQL) {
        throw new Error("sensitive database failure");
      }
      return controlOrEmptyResult(call);
    };

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => {
        throw new Error("logical failure");
      })
    ).rejects.toMatchObject({ code: "ROLLBACK_OUTCOME_UNKNOWN" });
    expect(client.releases).toEqual([true]);
  });

  it("treats a wrong ROLLBACK command tag as rollback outcome unknown", async () => {
    const { client, database } = createDatabase();
    client.handler = async (call) =>
      call.statement === ALTANA_LP_POSTGRES_ROLLBACK_SQL
        ? { command: "COMMIT", rowCount: null, rows: [] }
        : controlOrEmptyResult(call);

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => {
        throw new Error("operation failed");
      })
    ).rejects.toMatchObject({
      code: "ROLLBACK_OUTCOME_UNKNOWN",
      reservationOutcome: "unknown"
    });
    expect(client.releases).toEqual([true]);
  });

  it("destroys a client when BEGIN fails and never retries acquisition", async () => {
    const { client, database, pool } = createDatabase();
    client.handler = async (call) => {
      if (call.statement === ALTANA_LP_POSTGRES_BEGIN_SQL) throw new Error("offline");
      return controlOrEmptyResult(call);
    };

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "never")
    ).rejects.toMatchObject({ code: "TRANSACTION_START_FAILED" });
    expect(pool.connectCount).toBe(1);
    expect(client.calls).toHaveLength(1);
    expect(client.releases).toEqual([true]);
  });

  it("bounds pool acquisition and destroys a client that arrives after timeout", async () => {
    vi.useFakeTimers();
    let resolveClient: ((client: unknown) => void) | undefined;
    const client = new FakeClient();
    const database = createNodePostgresAltanaLpReservationDatabase({
      acquireTimeoutMs: 100,
      pool: {
        connect: () =>
          new Promise((resolve) => {
            resolveClient = resolve;
          })
      }
    });

    const operation = database.transaction(
      ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS,
      async () => "never"
    );
    const expectation = expect(operation).rejects.toMatchObject({
      code: "POOL_ACQUIRE_TIMEOUT",
      reservationOutcome: "not_attempted"
    });
    await vi.advanceTimersByTimeAsync(100);
    await expectation;
    resolveClient?.(client);
    await vi.runAllTimersAsync();
    expect(client.releases).toEqual([true]);
  });

  it("bounds a never-settling callback and destroys the uncommitted client", async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const database = createNodePostgresAltanaLpReservationDatabase({
      lockTimeoutMs: 100,
      pool: new FakePool(client),
      statementTimeoutMs: 100,
      transactionTimeoutMs: 100
    });

    const operation = database.transaction(
      ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS,
      () => new Promise(() => undefined)
    );
    const expectation = expect(operation).rejects.toMatchObject({
      code: "TRANSACTION_TIMEOUT",
      reservationOutcome: "rolled_back"
    });
    await vi.advanceTimersByTimeAsync(100);
    await expectation;
    expect(client.releases).toEqual([true]);
    expect(client.calls.some((call) => call.statement === ALTANA_LP_POSTGRES_COMMIT_SQL)).toBe(
      false
    );
  });

  it("classifies a COMMIT transport timeout as outcome unknown", async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    client.handler = async (call) =>
      call.statement === ALTANA_LP_POSTGRES_COMMIT_SQL
        ? new Promise(() => undefined)
        : controlOrEmptyResult(call);
    const database = createNodePostgresAltanaLpReservationDatabase({
      controlTimeoutMs: 100,
      pool: new FakePool(client)
    });

    const operation = database.transaction(
      ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS,
      async () => "submitted"
    );
    const expectation = expect(operation).rejects.toMatchObject({
      code: "COMMIT_OUTCOME_UNKNOWN",
      reservationOutcome: "unknown"
    });
    await vi.advanceTimersByTimeAsync(100);
    await expectation;
    expect(client.releases).toEqual([true]);
  });

  it("rolls back a begun transaction when timeout setup fails", async () => {
    const { client, database } = createDatabase();
    client.handler = async (call) => {
      if (call.statement === ALTANA_LP_POSTGRES_SET_LOCAL_SQL) throw new Error("setup failed");
      return controlOrEmptyResult(call);
    };

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "never")
    ).rejects.toMatchObject({ code: "TRANSACTION_SETUP_FAILED" });
    expect(client.calls.map((call) => call.statement)).toEqual([
      ALTANA_LP_POSTGRES_BEGIN_SQL,
      ALTANA_LP_POSTGRES_SET_LOCAL_SQL,
      ALTANA_LP_POSTGRES_ROLLBACK_SQL
    ]);
    expect(client.releases).toEqual([false]);
  });

  it("rejects malformed query results and rolls back", async () => {
    const { client, database } = createDatabase();
    client.handler = async (call) =>
      call.statement === ALTANA_LP_RESERVATION_INSERT_SQL
        ? { rowCount: 1, rows: "not-an-array" }
        : controlOrEmptyResult(call);

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async (transaction) =>
        transaction.query(ALTANA_LP_RESERVATION_INSERT_SQL, INSERT_PARAMETERS)
      )
    ).rejects.toMatchObject({ code: "QUERY_RESULT_INVALID" });
    expect(client.calls.at(-1)?.statement).toBe(ALTANA_LP_POSTGRES_ROLLBACK_SQL);
  });

  it("rejects concurrent use of the single PostgreSQL client", async () => {
    const { database } = createDatabase();
    let resolveQuery: ((value: unknown) => void) | undefined;
    const pendingClient = new FakeClient();
    pendingClient.handler = async (call) => {
      if (call.statement !== ALTANA_LP_RESERVATION_INSERT_SQL) {
        return controlOrEmptyResult(call);
      }
      return new Promise((resolve) => {
        resolveQuery = resolve;
      });
    };
    const pendingDatabase = createNodePostgresAltanaLpReservationDatabase({
      pool: new FakePool(pendingClient)
    });

    await pendingDatabase.transaction(
      ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS,
      async (transaction) => {
        const first = transaction.query(ALTANA_LP_RESERVATION_INSERT_SQL, INSERT_PARAMETERS);
        await expect(
          transaction.query(ALTANA_LP_RESERVATION_CONFLICT_READ_SQL, ["a", "b", "c"])
        ).rejects.toMatchObject({ code: "CONCURRENT_QUERY_FORBIDDEN" });
        resolveQuery?.({ rowCount: 1, rows: [{ ok: true }] });
        await first;
      }
    );
    expect(database).toBeDefined();
  });

  it.each(["resolve", "reject"] as const)(
    "destroys the client and drains an unawaited query that will %s",
    async (settlement) => {
      let settle: ((value?: unknown) => void) | undefined;
      const client = new FakeClient();
      client.handler = async (call) => {
        if (call.statement !== ALTANA_LP_RESERVATION_INSERT_SQL) {
          return controlOrEmptyResult(call);
        }
        return new Promise((resolve, reject) => {
          settle = settlement === "resolve" ? resolve : reject;
        });
      };
      const database = createNodePostgresAltanaLpReservationDatabase({
        pool: new FakePool(client)
      });

      await expect(
        database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async (transaction) => {
          void transaction.query(ALTANA_LP_RESERVATION_INSERT_SQL, INSERT_PARAMETERS);
          return "unsafe-early-return";
        })
      ).rejects.toMatchObject({
        code: "UNAWAITED_QUERY",
        reservationOutcome: "rolled_back"
      });
      settle?.(
        settlement === "resolve"
          ? { rowCount: 1, rows: [{ ok: true }] }
          : new Error("late query rejection")
      );
      await Promise.resolve();
      expect(client.releases).toEqual([true]);
      expect(client.calls.some((call) => call.statement === ALTANA_LP_POSTGRES_ROLLBACK_SQL)).toBe(
        false
      );
    }
  );

  it("invalidates a leaked transaction object immediately after the callback", async () => {
    const { database } = createDatabase();
    let leaked: Parameters<Parameters<typeof database.transaction>[1]>[0] | undefined;

    await database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async (transaction) => {
      leaked = transaction;
      return "done";
    });

    await expect(
      leaked?.query(ALTANA_LP_RESERVATION_INSERT_SQL, INSERT_PARAMETERS)
    ).rejects.toMatchObject({ code: "TRANSACTION_INACTIVE" });
  });

  it("rejects altered transaction options before acquiring a client", async () => {
    const { database, pool } = createDatabase();

    await expect(
      database.transaction(
        { isolationLevel: "read committed", readOnly: true, retry: "never" } as never,
        async () => "never"
      )
    ).rejects.toMatchObject({ code: "DATABASE_OPTIONS_INVALID" });
    expect(pool.connectCount).toBe(0);
  });

  it("rejects accessors, extra options, malformed pools, and unsafe timeout ranges", () => {
    const pool = new FakePool(new FakeClient());
    const accessor = {} as { pool?: FakePool };
    Object.defineProperty(accessor, "pool", {
      enumerable: true,
      get: vi.fn(() => pool)
    });

    expect(() =>
      createNodePostgresAltanaLpReservationDatabase(accessor as { pool: FakePool })
    ).toThrow(expect.objectContaining({ code: "POOL_INVALID" }));
    expect(() =>
      createNodePostgresAltanaLpReservationDatabase({ pool, statementTimeoutMs: 99 })
    ).toThrow(expect.objectContaining({ code: "TIMEOUT_CONFIGURATION_INVALID" }));
    expect(() =>
      createNodePostgresAltanaLpReservationDatabase({
        lockTimeoutMs: 2_000,
        pool,
        statementTimeoutMs: 1_000
      })
    ).toThrow(expect.objectContaining({ code: "TIMEOUT_CONFIGURATION_INVALID" }));
    expect(() => createNodePostgresAltanaLpReservationDatabase({ pool: {} as FakePool })).toThrow(
      expect.objectContaining({ code: "POOL_INVALID" })
    );
    expect(() =>
      createNodePostgresAltanaLpReservationDatabase({ pool, extra: true } as never)
    ).toThrow(expect.objectContaining({ code: "POOL_INVALID" }));
  });

  it("fails closed when the pool or client boundary throws or is malformed", async () => {
    const failedPool = {
      async connect() {
        throw new Error("secret host");
      }
    };
    const failedDatabase = createNodePostgresAltanaLpReservationDatabase({ pool: failedPool });
    await expect(
      failedDatabase.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "never")
    ).rejects.toMatchObject({ code: "POOL_ACQUIRE_FAILED" });

    const malformedDatabase = createNodePostgresAltanaLpReservationDatabase({
      pool: new FakePool({ query: async () => ({ rows: [], rowCount: 0 }) })
    });
    await expect(
      malformedDatabase.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "never")
    ).rejects.toMatchObject({ code: "CLIENT_INVALID" });
  });

  it("destroys a malformed but release-capable acquired client", async () => {
    const release = vi.fn();
    const database = createNodePostgresAltanaLpReservationDatabase({
      pool: new FakePool({ release })
    });

    await expect(
      database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async () => "never")
    ).rejects.toMatchObject({ code: "CLIENT_INVALID" });
    expect(release).toHaveBeenCalledWith(true);
  });

  it("rolls back and sanitizes a raw driver query failure", async () => {
    const client = new FakeClient();
    client.handler = async (call) => {
      if (call.statement === ALTANA_LP_RESERVATION_INSERT_SQL) {
        throw new Error(["private", "credential", "driver detail"].join(" "));
      }
      return controlOrEmptyResult(call);
    };
    const database = createNodePostgresAltanaLpReservationDatabase({
      pool: new FakePool(client)
    });

    let received: unknown;
    try {
      await database.transaction(ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS, async (transaction) =>
        transaction.query(ALTANA_LP_RESERVATION_INSERT_SQL, INSERT_PARAMETERS)
      );
    } catch (error) {
      received = error;
    }
    expect(received).toMatchObject({
      code: "TRANSACTION_OPERATION_FAILED",
      reservationOutcome: "rolled_back"
    });
    expect(String(received)).not.toContain("credential");
    expect(client.calls.at(-1)?.statement).toBe(ALTANA_LP_POSTGRES_ROLLBACK_SQL);
    expect(client.releases).toEqual([false]);
  });
});
