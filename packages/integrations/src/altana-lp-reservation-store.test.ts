import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ALTANA_LP_RESERVATION_CONFLICT_READ_SQL,
  ALTANA_LP_RESERVATION_INSERT_SQL,
  ALTANA_LP_RESERVATION_POSTGRES_DDL,
  ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS,
  AltanaLpReservationStoreError,
  createPostgresAltanaLpReservationDependency,
  type AltanaLpReservationPostgresDatabase,
  type AltanaLpReservationPostgresParameter,
  type AltanaLpReservationPostgresQueryResult,
  type AltanaLpReservationPostgresTransaction
} from "./altana-lp-reservation-store";
import type { AltanaLpReservationReceipt, AltanaLpReservationRequest } from "./altana-lp-handoff";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const CONSUMED_AT = "2026-08-11T12:00:00.000Z";
const EXPIRES_AT = "2026-08-11T12:01:00.000Z";
const RESERVATION_ID = `0x${"11".repeat(32)}`;
const CONTEXT_ID = `0x${"22".repeat(32)}`;
const QUOTE_ID = `0x${"33".repeat(32)}`;
const POLICY_HASH = `0x${"44".repeat(32)}`;
const WRITE_TARGET_BINDING = Object.freeze({
  chainId: 97 as const,
  address: `0x${"55".repeat(20)}`,
  runtimeCodeHash: `0x${"66".repeat(32)}`,
  canonicalBlockNumber: "124471937",
  canonicalBlockHash: `0x${"77".repeat(32)}`,
  reviewId: `0x${"88".repeat(32)}`,
  proxyKind: "none" as const
});

function requestFixture(
  overrides: Partial<AltanaLpReservationRequest> = {}
): AltanaLpReservationRequest {
  return {
    schemaVersion: 2,
    reservationId: RESERVATION_ID,
    contextId: CONTEXT_ID,
    quoteId: QUOTE_ID,
    userId: "user:test:1",
    policyHash: POLICY_HASH,
    writeTargetBinding: WRITE_TARGET_BINDING,
    consumedAt: CONSUMED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides
  };
}

function receiptFor(request: AltanaLpReservationRequest): AltanaLpReservationReceipt {
  return { ...request, state: "consumed" };
}

interface QueryCall {
  readonly statement: string;
  readonly parameters: readonly AltanaLpReservationPostgresParameter[];
}

class MemoryPostgresDatabase implements AltanaLpReservationPostgresDatabase {
  readonly calls: QueryCall[] = [];
  readonly transactionOptions: Array<Readonly<typeof ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS>> =
    [];
  rows: AltanaLpReservationReceipt[] = [];
  failNextQuery = false;
  loseNextCommitAcknowledgement = false;
  private transactionTail: Promise<void> = Promise.resolve();

  readonly transaction = async <Result>(
    options: Readonly<typeof ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS>,
    operation: (transaction: AltanaLpReservationPostgresTransaction) => Promise<Result>
  ): Promise<Result> => {
    const previous = this.transactionTail;
    let release: (() => void) | undefined;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const before = this.rows.map((row) => ({ ...row }));
    let committedDespiteError = false;
    this.transactionOptions.push(options);
    const transaction: AltanaLpReservationPostgresTransaction = {
      query: async (statement, parameters) => this.query(statement, parameters)
    };

    try {
      const result = await operation(transaction);
      if (this.loseNextCommitAcknowledgement) {
        this.loseNextCommitAcknowledgement = false;
        committedDespiteError = true;
        throw new Error("test-only lost commit acknowledgement");
      }
      return result;
    } catch (error) {
      if (!committedDespiteError) this.rows = before;
      throw error;
    } finally {
      release?.();
    }
  };

  private async query(
    statement: string,
    parameters: readonly AltanaLpReservationPostgresParameter[]
  ): Promise<AltanaLpReservationPostgresQueryResult> {
    this.calls.push({ statement, parameters: [...parameters] });
    if (this.failNextQuery) {
      this.failNextQuery = false;
      throw new Error("test-only query failure");
    }

    if (statement === ALTANA_LP_RESERVATION_INSERT_SQL) {
      const candidate = receiptFor({
        schemaVersion: parameters[0],
        reservationId: parameters[1],
        contextId: parameters[2],
        quoteId: parameters[3],
        userId: parameters[4],
        policyHash: parameters[5],
        writeTargetBinding: {
          chainId: parameters[6],
          address: parameters[7],
          runtimeCodeHash: parameters[8],
          canonicalBlockNumber: parameters[9],
          canonicalBlockHash: parameters[10],
          reviewId: parameters[11],
          proxyKind: parameters[12]
        },
        consumedAt: parameters[13],
        expiresAt: parameters[14]
      } as AltanaLpReservationRequest);
      const conflict = this.rows.some(
        (row) =>
          row.reservationId === candidate.reservationId ||
          row.contextId === candidate.contextId ||
          row.quoteId === candidate.quoteId
      );
      if (conflict) return { rows: [], rowCount: 0 };
      this.rows.push(candidate);
      return { rows: [{ ...candidate }], rowCount: 1 };
    }

    if (statement === ALTANA_LP_RESERVATION_CONFLICT_READ_SQL) {
      const [reservationId, contextId, quoteId] = parameters;
      const rows = this.rows
        .filter(
          (row) =>
            row.reservationId === reservationId ||
            row.contextId === contextId ||
            row.quoteId === quoteId
        )
        .sort((left, right) => left.reservationId.localeCompare(right.reservationId))
        .map((row) => ({ ...row }));
      return { rows, rowCount: rows.length };
    }

    throw new Error("test-only unexpected SQL");
  }
}

function createStore(database: AltanaLpReservationPostgresDatabase, now: () => Date = () => NOW) {
  return createPostgresAltanaLpReservationDependency({ database, now });
}

function scriptedDatabase(
  query: AltanaLpReservationPostgresTransaction["query"]
): AltanaLpReservationPostgresDatabase {
  return {
    async transaction<Result>(
      _options: Readonly<typeof ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS>,
      operation: (transaction: AltanaLpReservationPostgresTransaction) => Promise<Result>
    ): Promise<Result> {
      return operation({ query });
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PostgreSQL Altana LP reservation store", () => {
  it("documents an append-only schema with independent unique context and quote claims", () => {
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain(
      'context_id TEXT COLLATE "C" NOT NULL UNIQUE'
    );
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain(
      'quote_id TEXT COLLATE "C" NOT NULL UNIQUE'
    );
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain("BEFORE UPDATE OR DELETE");
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain("BEFORE TRUNCATE");
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain("SECURITY INVOKER");
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain("BEGIN;");
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain("COMMIT;");
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain("CREATE SCHEMA proofera_activation");
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain("schema_version = 2");
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain("char_length(consumed_at) = 24");
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain("INTERVAL '10 minutes'");
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).toContain("GRANT SELECT, INSERT ON TABLE");
    expect(ALTANA_LP_RESERVATION_POSTGRES_DDL).not.toContain("IF NOT EXISTS");
    expect(ALTANA_LP_RESERVATION_INSERT_SQL).toContain("ON CONFLICT DO NOTHING");
    expect(ALTANA_LP_RESERVATION_INSERT_SQL).not.toContain("DO UPDATE");
    expect(ALTANA_LP_RESERVATION_CONFLICT_READ_SQL).not.toContain("FOR SHARE");
  });

  it("atomically consumes both IDs and returns a frozen exact receipt", async () => {
    const database = new MemoryPostgresDatabase();
    const dependency = createStore(database);
    const request = requestFixture();

    const receipt = await dependency.consumeOrRead(request);

    expect(receipt).toEqual(receiptFor(request));
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(dependency)).toBe(true);
    expect(database.rows).toEqual([receiptFor(request)]);
    expect(database.transactionOptions).toEqual([ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS]);
  });

  it("uses fixed SQL and positional parameters without interpolating binding values", async () => {
    const database = new MemoryPostgresDatabase();
    const request = requestFixture();

    await createStore(database).consumeOrRead(request);

    expect(database.calls).toHaveLength(1);
    expect(database.calls[0]).toEqual({
      statement: ALTANA_LP_RESERVATION_INSERT_SQL,
      parameters: [
        2,
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
      ]
    });
    for (const value of [
      request.reservationId,
      request.contextId,
      request.quoteId,
      request.userId
    ]) {
      expect(ALTANA_LP_RESERVATION_INSERT_SQL).not.toContain(value);
    }
  });

  it("returns the identical stored receipt for an exact replay without mutating it", async () => {
    const database = new MemoryPostgresDatabase();
    const dependency = createStore(database);
    const request = requestFixture();

    const first = await dependency.consumeOrRead(request);
    const storedBeforeReplay = { ...database.rows[0] };
    const second = await dependency.consumeOrRead({ ...request });

    expect(second).toEqual(first);
    expect(database.rows).toEqual([storedBeforeReplay]);
    expect(database.calls.map(({ statement }) => statement)).toEqual([
      ALTANA_LP_RESERVATION_INSERT_SQL,
      ALTANA_LP_RESERVATION_INSERT_SQL,
      ALTANA_LP_RESERVATION_CONFLICT_READ_SQL
    ]);
  });

  it("preserves exact JSON timestamp strings instead of database-normalizing them", async () => {
    const database = new MemoryPostgresDatabase();
    const request = requestFixture({
      consumedAt: "2026-08-11T19:00:00.000+07:00",
      expiresAt: "2026-08-11T19:01:00.000+07:00"
    });

    await expect(createStore(database).consumeOrRead(request)).resolves.toEqual(
      receiptFor(request)
    );
    expect(database.rows[0]?.consumedAt).toBe(request.consumedAt);
    expect(database.rows[0]?.expiresAt).toBe(request.expiresAt);
  });

  it("returns one immutable receipt to simultaneous exact callers", async () => {
    const database = new MemoryPostgresDatabase();
    const dependency = createStore(database);
    const request = requestFixture();

    const receipts = await Promise.all(
      Array.from({ length: 16 }, () => dependency.consumeOrRead({ ...request }))
    );

    expect(database.rows).toEqual([receiptFor(request)]);
    expect(receipts).toHaveLength(16);
    for (const receipt of receipts) {
      expect(receipt).toEqual(receipts[0]);
      expect(Object.isFrozen(receipt)).toBe(true);
    }
  });

  it.each([
    {
      label: "context",
      override: {
        reservationId: `0x${"55".repeat(32)}`,
        quoteId: `0x${"66".repeat(32)}`
      }
    },
    {
      label: "quote",
      override: {
        reservationId: `0x${"55".repeat(32)}`,
        contextId: `0x${"66".repeat(32)}`
      }
    },
    {
      label: "reservation",
      override: {
        contextId: `0x${"55".repeat(32)}`,
        quoteId: `0x${"66".repeat(32)}`
      }
    }
  ])("rejects a conflicting $label ID without consuming the other ID", async ({ override }) => {
    const database = new MemoryPostgresDatabase();
    const dependency = createStore(database);
    const original = requestFixture();
    await dependency.consumeOrRead(original);

    await expect(dependency.consumeOrRead(requestFixture(override))).rejects.toMatchObject({
      code: "RESERVATION_CONFLICT"
    });
    expect(database.rows).toEqual([receiptFor(original)]);
  });

  it.each([
    { label: "user", override: { userId: "user:test:2" } },
    { label: "policy", override: { policyHash: `0x${"55".repeat(32)}` } },
    { label: "consumption time", override: { consumedAt: "2026-08-11T12:00:01.000Z" } },
    { label: "expiry", override: { expiresAt: "2026-08-11T12:01:01.000Z" } }
  ])("rejects an ID replay with a changed $label binding", async ({ override }) => {
    const database = new MemoryPostgresDatabase();
    const dependency = createStore(database);
    const original = requestFixture();
    await dependency.consumeOrRead(original);

    await expect(dependency.consumeOrRead(requestFixture(override))).rejects.toMatchObject({
      code: "RESERVATION_CONFLICT"
    });
    expect(database.rows).toEqual([receiptFor(original)]);
  });

  it("allows only one of two simultaneous conflicting bindings to consume either ID", async () => {
    const database = new MemoryPostgresDatabase();
    const dependency = createStore(database);
    const first = requestFixture();
    const second = requestFixture({
      reservationId: `0x${"55".repeat(32)}`,
      quoteId: `0x${"66".repeat(32)}`,
      policyHash: `0x${"77".repeat(32)}`
    });

    const outcomes = await Promise.allSettled([
      dependency.consumeOrRead(first),
      dependency.consumeOrRead(second)
    ]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "RESERVATION_CONFLICT" }
    });
    expect(database.rows).toHaveLength(1);
    expect(database.rows[0]?.contextId).toBe(CONTEXT_ID);
  });

  it("rejects a conflict that spans different existing context and quote rows", async () => {
    const database = new MemoryPostgresDatabase();
    const dependency = createStore(database);
    const first = requestFixture();
    const second = requestFixture({
      reservationId: `0x${"55".repeat(32)}`,
      contextId: `0x${"66".repeat(32)}`,
      quoteId: `0x${"77".repeat(32)}`
    });
    await dependency.consumeOrRead(first);
    await dependency.consumeOrRead(second);

    const crossBinding = requestFixture({
      reservationId: `0x${"88".repeat(32)}`,
      contextId: first.contextId,
      quoteId: second.quoteId
    });
    await expect(dependency.consumeOrRead(crossBinding)).rejects.toMatchObject({
      code: "RESERVATION_CONFLICT"
    });
    expect(database.rows).toHaveLength(2);
  });

  it("fails closed on a query error and does not retain a partial reservation", async () => {
    const database = new MemoryPostgresDatabase();
    database.failNextQuery = true;

    await expect(createStore(database).consumeOrRead(requestFixture())).rejects.toMatchObject({
      code: "DATABASE_OUTCOME_UNKNOWN",
      reservationOutcome: "unknown"
    });
    expect(database.rows).toEqual([]);
  });

  it("does not retry an ambiguous commit and reconciles only through an exact later replay", async () => {
    const database = new MemoryPostgresDatabase();
    const dependency = createStore(database);
    const request = requestFixture();
    database.loseNextCommitAcknowledgement = true;

    await expect(dependency.consumeOrRead(request)).rejects.toMatchObject({
      code: "DATABASE_OUTCOME_UNKNOWN",
      reservationOutcome: "unknown"
    });
    expect(database.transactionOptions).toHaveLength(1);
    expect(database.rows).toEqual([receiptFor(request)]);

    await expect(dependency.consumeOrRead({ ...request })).resolves.toEqual(receiptFor(request));
    await expect(
      dependency.consumeOrRead(
        requestFixture({
          reservationId: `0x${"55".repeat(32)}`,
          quoteId: `0x${"66".repeat(32)}`
        })
      )
    ).rejects.toMatchObject({ code: "RESERVATION_CONFLICT" });
  });

  it("rolls back when a receipt becomes expired before the transaction completes", async () => {
    const database = new MemoryPostgresDatabase();
    let clockReads = 0;
    const dependency = createStore(database, () => {
      clockReads += 1;
      return clockReads === 1 ? NOW : new Date(EXPIRES_AT);
    });

    await expect(dependency.consumeOrRead(requestFixture())).rejects.toMatchObject({
      code: "RESERVATION_EXPIRED",
      reservationOutcome: "rolled_back"
    });
    expect(database.rows).toEqual([]);
  });

  it("keeps committed IDs consumed but withholds a receipt that expires before commit acknowledgement", async () => {
    const inner = new MemoryPostgresDatabase();
    let current = NOW;
    const database: AltanaLpReservationPostgresDatabase = {
      async transaction<Result>(
        options: Readonly<typeof ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS>,
        operation: (transaction: AltanaLpReservationPostgresTransaction) => Promise<Result>
      ): Promise<Result> {
        const result = await inner.transaction(options, operation);
        current = new Date(EXPIRES_AT);
        return result;
      }
    };

    await expect(
      createStore(database, () => current).consumeOrRead(requestFixture())
    ).rejects.toMatchObject({
      code: "RESERVATION_EXPIRED",
      reservationOutcome: "committed_unusable"
    });
    expect(inner.rows).toEqual([receiptFor(requestFixture())]);
  });

  it("reports a second clock-read failure as rolled back and retains no IDs", async () => {
    const database = new MemoryPostgresDatabase();
    let clockReads = 0;
    const dependency = createStore(database, () => {
      clockReads += 1;
      if (clockReads === 2) throw new Error("test-only clock detail");
      return NOW;
    });

    await expect(dependency.consumeOrRead(requestFixture())).rejects.toMatchObject({
      code: "CLOCK_INVALID",
      reservationOutcome: "rolled_back"
    });
    expect(database.rows).toEqual([]);
  });

  it("reports a third clock-read failure as committed unusable and retains the tombstone", async () => {
    const database = new MemoryPostgresDatabase();
    let clockReads = 0;
    const dependency = createStore(database, () => {
      clockReads += 1;
      if (clockReads === 3) throw new Error("test-only post-commit clock detail");
      return NOW;
    });

    await expect(dependency.consumeOrRead(requestFixture())).rejects.toMatchObject({
      code: "CLOCK_INVALID",
      reservationOutcome: "committed_unusable"
    });
    expect(database.rows).toEqual([receiptFor(requestFixture())]);
  });

  it("rejects expired requests before touching PostgreSQL and never reclaims their IDs", async () => {
    const database = new MemoryPostgresDatabase();
    let current = NOW;
    const dependency = createStore(database, () => current);
    const request = requestFixture();
    await dependency.consumeOrRead(request);
    const callsBeforeExpiry = database.calls.length;
    current = new Date(EXPIRES_AT);

    await expect(dependency.consumeOrRead(request)).rejects.toMatchObject({
      code: "RESERVATION_EXPIRED",
      reservationOutcome: "not_attempted"
    });
    expect(database.calls).toHaveLength(callsBeforeExpiry);
    expect(database.rows).toEqual([receiptFor(request)]);
  });

  it("rejects reversed receipt windows before touching PostgreSQL", async () => {
    const database = new MemoryPostgresDatabase();
    const request = requestFixture({ expiresAt: CONSUMED_AT });

    await expect(createStore(database).consumeOrRead(request)).rejects.toMatchObject({
      code: "REQUEST_INVALID"
    });
    expect(database.calls).toEqual([]);
  });

  it("rejects accessors, extras, custom prototypes, and malformed hashes without invoking them", async () => {
    const database = new MemoryPostgresDatabase();
    const dependency = createStore(database);
    let getterCalls = 0;
    const accessor = Object.defineProperty({ ...requestFixture() }, "contextId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return CONTEXT_ID;
      }
    });
    const customPrototype = Object.assign(Object.create({ inherited: true }), requestFixture());
    const bindingGetter = vi.fn(() => WRITE_TARGET_BINDING.address);
    const unsafeBinding = Object.defineProperty({ ...WRITE_TARGET_BINDING }, "address", {
      enumerable: true,
      get: bindingGetter
    });

    for (const invalid of [
      accessor,
      { ...requestFixture(), extra: true },
      customPrototype,
      requestFixture({ policyHash: "0xBAD" }),
      requestFixture({ writeTargetBinding: unsafeBinding as never })
    ]) {
      await expect(
        dependency.consumeOrRead(invalid as AltanaLpReservationRequest)
      ).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    }
    expect(getterCalls).toBe(0);
    expect(bindingGetter).not.toHaveBeenCalled();
    expect(database.calls).toEqual([]);
  });

  it("uses the intrinsic Date value even when an instance shadows getTime", async () => {
    const database = new MemoryPostgresDatabase();
    const clockValue = new Date(NOW);
    const shadow = vi.fn(() => {
      throw new Error("shadowed getTime must not run");
    });
    Object.defineProperty(clockValue, "getTime", { value: shadow });

    await expect(
      createStore(database, () => clockValue).consumeOrRead(requestFixture())
    ).resolves.toEqual(receiptFor(requestFixture()));
    expect(shadow).not.toHaveBeenCalled();
  });

  it.each([
    { label: "empty rows after a conflict", rows: [], rowCount: 0 },
    { label: "row count disagreement", rows: [receiptFor(requestFixture())], rowCount: 0 },
    {
      label: "multiple inserted rows",
      rows: [receiptFor(requestFixture()), receiptFor(requestFixture())],
      rowCount: 2
    },
    { label: "malformed receipt", rows: [{ state: "consumed" }], rowCount: 1 }
  ])("rejects $label as an invalid database result", async ({ rows, rowCount }) => {
    let queryCount = 0;
    const database = scriptedDatabase(async () => {
      queryCount += 1;
      if (queryCount === 1 && rows.length === 0) return { rows: [], rowCount: 0 };
      return { rows, rowCount };
    });

    await expect(createStore(database).consumeOrRead(requestFixture())).rejects.toMatchObject({
      code: "DATABASE_RESULT_INVALID"
    });
  });

  it("requires a valid clock, transaction boundary, and server runtime without exposing internals", async () => {
    const database = new MemoryPostgresDatabase();
    const invalidClock = createStore(database, () => new Date(Number.NaN));
    await expect(invalidClock.consumeOrRead(requestFixture())).rejects.toEqual(
      new AltanaLpReservationStoreError("CLOCK_INVALID")
    );

    const privateClockDetail = "clock provider secret detail";
    const throwingClock = createStore(database, () => {
      throw new Error(privateClockDetail);
    });
    let clockFailure: unknown;
    try {
      await throwingClock.consumeOrRead(requestFixture());
    } catch (error) {
      clockFailure = error;
    }
    expect(clockFailure).toMatchObject({ code: "CLOCK_INVALID" });
    expect(String(clockFailure)).not.toContain(privateClockDetail);

    expect(() =>
      createPostgresAltanaLpReservationDependency({
        database: {} as AltanaLpReservationPostgresDatabase
      })
    ).toThrow(expect.objectContaining({ code: "DATABASE_DEPENDENCY_INVALID" }));

    vi.stubGlobal("window", { document: {} });
    expect(() => createStore(database)).toThrow(
      expect.objectContaining({ code: "SERVER_RUNTIME_REQUIRED" })
    );
  });

  it("wraps raw database errors in a safe message without retaining their contents", async () => {
    const secretLikeText = "postgres://user:password@example.invalid/private";
    const database = scriptedDatabase(async () => {
      throw new Error(secretLikeText);
    });

    let received: unknown;
    try {
      await createStore(database).consumeOrRead(requestFixture());
    } catch (error) {
      received = error;
    }
    expect(received).toBeInstanceOf(AltanaLpReservationStoreError);
    expect(received).toMatchObject({
      code: "DATABASE_OUTCOME_UNKNOWN",
      reservationOutcome: "unknown"
    });
    expect(String(received)).not.toContain(secretLikeText);
    expect(received).not.toHaveProperty("cause");
  });
});
