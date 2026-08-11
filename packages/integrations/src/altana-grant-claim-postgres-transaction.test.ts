import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL,
  ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL,
  ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL,
  ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL,
  AltanaGrantClaimTransactionError,
  executeAltanaGrantClaimPostgresTransaction,
  projectAltanaGrantClaimSchemaNodePostgresResult
} from "./altana-grant-claim-postgres-transaction";
import {
  ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL,
  ALTANA_GRANT_CLAIM_INSERT_SQL,
  ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL,
  ALTANA_GRANT_CLAIM_RECEIPT_RESULT_FIELDS,
  ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS
} from "./altana-grant-claim-store";
import {
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_RESULT_FIELDS,
  ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256
} from "./altana-grant-claim-schema-verifier";
import {
  TEST_DEPLOYMENT_ID,
  persistedClaimRow,
  rawNodePostgresResult,
  testClaim
} from "./altana-grant-claim-postgres-test-support";

type QueryCall = Readonly<{ parameters: readonly unknown[]; statement: string }>;

function control(command: "BEGIN" | "COMMIT" | "ROLLBACK") {
  return rawNodePostgresResult(command, [], [], null, null);
}

function localResult() {
  return rawNodePostgresResult(
    "SELECT",
    ["statementTimeout", "lockTimeout", "idleTimeout"],
    [{ statementTimeout: "10s", lockTimeout: "5s", idleTimeout: "15s" }]
  );
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
  readonly calls: QueryCall[] = [];
  readonly releases: boolean[] = [];
  active = 0;
  maxActive = 0;
  handler: (statement: string, parameters: readonly unknown[]) => Promise<unknown>;

  constructor(handler: (statement: string, parameters: readonly unknown[]) => Promise<unknown>) {
    this.handler = handler;
  }

  async query(statement: unknown, parameters: unknown = []): Promise<unknown> {
    if (typeof statement !== "string" || !Array.isArray(parameters)) {
      throw new Error("Invalid fake-client call.");
    }
    const copied = [...parameters];
    this.calls.push({ parameters: copied, statement });
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      return await this.handler(statement, copied);
    } finally {
      this.active -= 1;
    }
  }

  release(destroy = false): void {
    this.releases.push(destroy);
  }
}

function poolFor(client: FakeClient) {
  return Object.freeze({ connect: vi.fn(async () => client) });
}

function claimedHandler() {
  const claim = testClaim();
  return async (statement: string): Promise<unknown> => {
    if (statement === ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL) return control("BEGIN");
    if (statement === ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL) return localResult();
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
    throw new Error("Unexpected fixed SQL in test.");
  };
}

describe("Altana grant-claim node-postgres transaction gateway", () => {
  it("bounds client acquisition and destroys a client that arrives after timeout", async () => {
    vi.useFakeTimers();
    let resolveClient: ((client: FakeClient) => void) | undefined;
    const lateClientPromise = new Promise<FakeClient>((resolve) => {
      resolveClient = resolve;
    });
    const lateClient = new FakeClient(claimedHandler());
    try {
      const operation = executeAltanaGrantClaimPostgresTransaction(
        { connect: () => lateClientPromise },
        TEST_DEPLOYMENT_ID,
        testClaim()
      );
      const observed = operation.then(
        () => null,
        (error: unknown) => error
      );
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(observed).resolves.toMatchObject({
        code: "POOL_ACQUIRE_TIMEOUT",
        claimOutcome: "not_attempted"
      });
      resolveClient?.(lateClient);
      await vi.runAllTimersAsync();
      expect(lateClient.releases).toEqual([true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("destroys the client and issues no later SQL after the whole-transaction timeout", async () => {
    vi.useFakeTimers();
    const delayed = <Value>(delayMs: number, value: Value): Promise<Value> =>
      new Promise((resolve) => setTimeout(() => resolve(value), delayMs));
    const client = new FakeClient(async (statement) => {
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL) {
        return delayed(4_500, control("BEGIN"));
      }
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL) {
        return delayed(4_500, localResult());
      }
      if (statement === ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL) {
        return delayed(11_500, receiptResult());
      }
      throw new Error("SQL continued after the transaction deadline.");
    });
    try {
      const operation = executeAltanaGrantClaimPostgresTransaction(
        poolFor(client),
        TEST_DEPLOYMENT_ID,
        testClaim()
      );
      const observed = operation.then(
        () => null,
        (error: unknown) => error
      );
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(observed).resolves.toMatchObject({
        code: "TRANSACTION_TIMEOUT",
        claimOutcome: "not_attempted"
      });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(client.calls.map(({ statement }) => statement)).toEqual([
        ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL,
        ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL,
        ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL
      ]);
      expect(client.releases).toEqual([true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses one client, fixed sequential SQL, exact timeouts, receipt-before-write, and acknowledged commit", async () => {
    const claim = testClaim();
    const client = new FakeClient(claimedHandler());
    const pool = poolFor(client);

    await expect(
      executeAltanaGrantClaimPostgresTransaction(pool, TEST_DEPLOYMENT_ID, claim)
    ).resolves.toMatchObject({ status: "claimed", bootstrapId: claim.bootstrapId });
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.maxActive).toBe(1);
    expect(client.calls.map(({ statement }) => statement)).toEqual([
      ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL,
      ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL,
      ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL,
      ALTANA_GRANT_CLAIM_INSERT_SQL,
      ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL
    ]);
    expect(client.calls[1]?.parameters).toEqual(["10000ms", "5000ms", "15000ms"]);
    expect(client.calls[2]?.parameters).toEqual([]);
    expect(client.releases).toEqual([false]);
  });

  it("commits an exact replay after the one reviewed conflict read", async () => {
    const claim = testClaim();
    const client = new FakeClient(async (statement) => {
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL) return control("BEGIN");
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL) return localResult();
      if (statement === ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL) return receiptResult();
      if (statement === ALTANA_GRANT_CLAIM_INSERT_SQL) {
        return rawNodePostgresResult("INSERT", ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS, [], 0);
      }
      if (statement === ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL) {
        return rawNodePostgresResult("SELECT", ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS, [
          persistedClaimRow(claim, "already_claimed")
        ]);
      }
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL) return control("COMMIT");
      throw new Error("Unexpected fixed SQL in replay test.");
    });

    await expect(
      executeAltanaGrantClaimPostgresTransaction(poolFor(client), TEST_DEPLOYMENT_ID, claim)
    ).resolves.toMatchObject({ status: "already_claimed" });
    expect(
      client.calls.filter(({ statement }) => statement === ALTANA_GRANT_CLAIM_INSERT_SQL)
    ).toHaveLength(1);
    expect(client.calls.at(-1)?.statement).toBe(ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL);
  });

  it("rolls back before INSERT when the same-pool receipt UUID differs", async () => {
    const client = new FakeClient(async (statement) => {
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL) return control("BEGIN");
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL) return localResult();
      if (statement === ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL) {
        return receiptResult("d186cc34-6b0a-4bb1-8fd8-f542aca77584");
      }
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL) return control("ROLLBACK");
      throw new Error("Write reached after a mismatched deployment UUID.");
    });

    const error = await executeAltanaGrantClaimPostgresTransaction(
      poolFor(client),
      TEST_DEPLOYMENT_ID,
      testClaim()
    ).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AltanaGrantClaimTransactionError);
    expect(error).toMatchObject({
      code: "QUERY_RESULT_INVALID",
      claimOutcome: "not_attempted",
      operationCode: "SCHEMA_NOT_READY"
    });
    expect(client.calls.some(({ statement }) => statement === ALTANA_GRANT_CLAIM_INSERT_SQL)).toBe(
      false
    );
    expect(client.releases).toEqual([false]);
  });

  it("acknowledges rollback for an immutable cross-ID conflict without retry", async () => {
    const claim = testClaim();
    const other = testClaim(2);
    const client = new FakeClient(async (statement) => {
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL) return control("BEGIN");
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL) return localResult();
      if (statement === ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL) return receiptResult();
      if (statement === ALTANA_GRANT_CLAIM_INSERT_SQL) {
        return rawNodePostgresResult("INSERT", ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS, [], 0);
      }
      if (statement === ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL) {
        return rawNodePostgresResult("SELECT", ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS, [
          persistedClaimRow(other, "already_claimed")
        ]);
      }
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL) return control("ROLLBACK");
      throw new Error("Unexpected fixed SQL in conflict test.");
    });

    const error = await executeAltanaGrantClaimPostgresTransaction(
      poolFor(client),
      TEST_DEPLOYMENT_ID,
      claim
    ).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      claimOutcome: "rolled_back",
      operationCode: "CLAIM_CONFLICT"
    });
    expect(
      client.calls.filter(({ statement }) => statement === ALTANA_GRANT_CLAIM_INSERT_SQL)
    ).toHaveLength(1);
    expect(client.calls.at(-1)?.statement).toBe(ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL);
    expect(client.releases).toEqual([false]);
  });

  it("destroys the client and reports unknown after a commit disconnect", async () => {
    const client = new FakeClient(async (statement) => {
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL) {
        throw new Error("driver detail must not escape");
      }
      return claimedHandler()(statement);
    });
    const error = await executeAltanaGrantClaimPostgresTransaction(
      poolFor(client),
      TEST_DEPLOYMENT_ID,
      testClaim()
    ).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "COMMIT_OUTCOME_UNKNOWN", claimOutcome: "unknown" });
    expect(String(error)).not.toContain("driver detail");
    expect(client.releases).toEqual([true]);
  });

  it("destroys the client when rollback acknowledgement is ambiguous", async () => {
    const client = new FakeClient(async (statement) => {
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL) return control("BEGIN");
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL) return localResult();
      if (statement === ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL) return receiptResult();
      if (statement === ALTANA_GRANT_CLAIM_INSERT_SQL) {
        return rawNodePostgresResult("INSERT", ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS, [], 0);
      }
      if (statement === ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL) {
        return rawNodePostgresResult("SELECT", ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS, [
          persistedClaimRow(testClaim(2), "already_claimed")
        ]);
      }
      if (statement === ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL) {
        throw new Error("rollback disconnect");
      }
      throw new Error("Unexpected fixed SQL in rollback test.");
    });
    const error = await executeAltanaGrantClaimPostgresTransaction(
      poolFor(client),
      TEST_DEPLOYMENT_ID,
      testClaim()
    ).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      code: "ROLLBACK_OUTCOME_UNKNOWN",
      claimOutcome: "unknown",
      operationCode: "CLAIM_CONFLICT"
    });
    expect(client.releases).toEqual([true]);
  });

  it("rejects any non-exact raw node-postgres Result before it reaches the verifier", () => {
    const fields = ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_RESULT_FIELDS;
    const row = Object.fromEntries(
      fields.map((field) => [field, field === "deploymentId" ? TEST_DEPLOYMENT_ID : true])
    );
    const exact = rawNodePostgresResult("SELECT", fields, [row]);
    expect(projectAltanaGrantClaimSchemaNodePostgresResult(exact)).toEqual({
      rowCount: 1,
      rows: [row]
    });
    expect(
      projectAltanaGrantClaimSchemaNodePostgresResult({ ...exact, unexpected: true })
    ).toBeNull();
    expect(projectAltanaGrantClaimSchemaNodePostgresResult({ ...exact, fields: [] })).toBeNull();
  });
});
