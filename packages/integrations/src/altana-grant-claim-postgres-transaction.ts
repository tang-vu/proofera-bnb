import "server-only";

import type { AltanaGrantSubmissionClaim } from "./altana-grant";
import {
  ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256,
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_RESULT_FIELDS
} from "./altana-grant-claim-schema-verifier";
import {
  ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL,
  ALTANA_GRANT_CLAIM_INSERT_SQL,
  ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL,
  ALTANA_GRANT_CLAIM_RECEIPT_RESULT_FIELDS,
  ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS,
  altanaGrantClaimConflictParameters,
  altanaGrantClaimInsertParameters,
  interpretAltanaGrantClaimConflictProjection,
  interpretAltanaGrantClaimInsertProjection,
  parseAltanaGrantClaimReceiptProjection,
  parseAltanaGrantSubmissionClaim,
  type AltanaGrantClaimOutcome,
  type AltanaGrantClaimProjection,
  type AltanaGrantClaimResult
} from "./altana-grant-claim-store";

export const ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL =
  "BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE";
export const ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL = `
SELECT
  pg_catalog.set_config('statement_timeout', $1, true) AS "statementTimeout",
  pg_catalog.set_config('lock_timeout', $2, true) AS "lockTimeout",
  pg_catalog.set_config('idle_in_transaction_session_timeout', $3, true) AS "idleTimeout"
`.trim();
export const ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL = "COMMIT";
export const ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL = "ROLLBACK";

export const ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS = Object.freeze({
  acquireMs: 5_000,
  closeMs: 5_000,
  controlMs: 5_000,
  idleInTransactionMs: 15_000,
  lockMs: 5_000,
  queryMs: 12_000,
  statementMs: 10_000,
  transactionMs: 20_000,
  verifyMs: 10_000
});

const SET_LOCAL_PARAMETERS = Object.freeze([
  `${ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.statementMs}ms`,
  `${ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.lockMs}ms`,
  `${ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.idleInTransactionMs}ms`
] as const);
const SET_LOCAL_NORMALIZED_RESULTS = Object.freeze(["10s", "5s", "15s"] as const);

const RAW_RESULT_KEYS = Object.freeze([
  "RowCtor",
  "_parsers",
  "_prebuiltEmptyResultObject",
  "_types",
  "command",
  "fields",
  "oid",
  "rowAsArray",
  "rowCount",
  "rows"
]);
const RAW_FIELD_KEYS = Object.freeze([
  "columnID",
  "dataTypeID",
  "dataTypeModifier",
  "dataTypeSize",
  "format",
  "name",
  "tableID"
]);

type RawResultSpecification = Readonly<{
  command: "BEGIN" | "COMMIT" | "INSERT" | "ROLLBACK" | "SELECT";
  fields: readonly string[];
  maximumRows: number;
  minimumRows: number;
  oid: 0 | null;
  rowCount: "matches_rows" | null;
}>;

function specification(
  command: RawResultSpecification["command"],
  fields: readonly string[],
  minimumRows: number,
  maximumRows: number,
  oid: 0 | null,
  rowCount: RawResultSpecification["rowCount"]
): RawResultSpecification {
  return Object.freeze({ command, fields, maximumRows, minimumRows, oid, rowCount });
}

const BEGIN_SPEC = specification("BEGIN", Object.freeze([]), 0, 0, null, null);
const SET_LOCAL_SPEC = specification(
  "SELECT",
  Object.freeze(["statementTimeout", "lockTimeout", "idleTimeout"]),
  1,
  1,
  null,
  "matches_rows"
);
const COMMIT_SPEC = specification("COMMIT", Object.freeze([]), 0, 0, null, null);
const ROLLBACK_SPEC = specification("ROLLBACK", Object.freeze([]), 0, 0, null, null);
const RECEIPT_SPEC = specification(
  "SELECT",
  ALTANA_GRANT_CLAIM_RECEIPT_RESULT_FIELDS,
  0,
  1,
  null,
  "matches_rows"
);
const INSERT_SPEC = specification(
  "INSERT",
  ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS,
  0,
  1,
  0,
  "matches_rows"
);
const CONFLICT_SPEC = specification(
  "SELECT",
  ALTANA_GRANT_CLAIM_ROW_RESULT_FIELDS,
  0,
  4,
  null,
  "matches_rows"
);
const VERIFY_SPEC = specification(
  "SELECT",
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_RESULT_FIELDS,
  1,
  1,
  null,
  "matches_rows"
);

export type AltanaGrantClaimTransactionErrorCode =
  | "CLIENT_INVALID"
  | "COMMIT_OUTCOME_UNKNOWN"
  | "POOL_ACQUIRE_FAILED"
  | "POOL_ACQUIRE_TIMEOUT"
  | "QUERY_FAILED"
  | "QUERY_RESULT_INVALID"
  | "ROLLBACK_OUTCOME_UNKNOWN"
  | "SERVER_RUNTIME_REQUIRED"
  | "TRANSACTION_START_FAILED"
  | "TRANSACTION_TIMEOUT";

export type AltanaGrantClaimRollbackCode =
  "CLAIM_CONFLICT" | "DATABASE_RESULT_INVALID" | "SCHEMA_NOT_READY";

const ERROR_MESSAGES: Readonly<Record<AltanaGrantClaimTransactionErrorCode, string>> =
  Object.freeze({
    CLIENT_INVALID: "The grant-claim pool returned an invalid client boundary.",
    COMMIT_OUTCOME_UNKNOWN:
      "The grant-claim commit outcome is unknown and requires exact replay reconciliation.",
    POOL_ACQUIRE_FAILED: "The grant-claim pool could not provide a transaction client.",
    POOL_ACQUIRE_TIMEOUT: "The grant-claim client acquisition deadline elapsed.",
    QUERY_FAILED: "A grant-claim transaction statement failed.",
    QUERY_RESULT_INVALID: "The node-postgres result did not match the reviewed projection.",
    ROLLBACK_OUTCOME_UNKNOWN: "The grant-claim rollback outcome is unknown.",
    SERVER_RUNTIME_REQUIRED: "The grant-claim transaction gateway is server-only.",
    TRANSACTION_START_FAILED: "The grant-claim transaction could not start safely.",
    TRANSACTION_TIMEOUT: "The grant-claim transaction deadline elapsed."
  });

/** Sanitized internal error; it retains no SQL, parameters, result, URL, or driver error. */
export class AltanaGrantClaimTransactionError extends Error {
  override readonly name = "AltanaGrantClaimTransactionError";
  readonly code: AltanaGrantClaimTransactionErrorCode;
  readonly claimOutcome: AltanaGrantClaimOutcome;
  readonly operationCode: AltanaGrantClaimRollbackCode | null;

  constructor(
    code: AltanaGrantClaimTransactionErrorCode,
    claimOutcome: AltanaGrantClaimOutcome,
    operationCode: AltanaGrantClaimRollbackCode | null = null
  ) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
    this.claimOutcome = claimOutcome;
    this.operationCode = operationCode;
  }
}

type DataMethod = (...arguments_: unknown[]) => unknown;
type ParsedClient = Readonly<{ query: DataMethod; release: DataMethod; source: object }>;
type ParsedPool = Readonly<{ connect: DataMethod; source: object }>;
type Bounded<Value> =
  | Readonly<{ status: "fulfilled"; value: Value }>
  | Readonly<{ status: "rejected" }>
  | Readonly<{ status: "timeout" }>;

function assertServerRuntime(): void {
  if (
    typeof process === "undefined" ||
    process.release?.name !== "node" ||
    (typeof window !== "undefined" && typeof window.document !== "undefined")
  ) {
    throw new AltanaGrantClaimTransactionError("SERVER_RUNTIME_REQUIRED", "not_attempted");
  }
}

function exactDataDescriptors(
  input: unknown,
  keys: readonly string[]
): PropertyDescriptorMap | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    if (Reflect.ownKeys(input).some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const actual = Object.keys(descriptors).sort();
    const expected = [...keys].sort();
    if (
      actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index]) ||
      Object.values(descriptors).some((descriptor) => !("value" in descriptor))
    ) {
      return null;
    }
    return descriptors;
  } catch {
    return null;
  }
}

function snapshotDenseArray(input: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return null;
    if (!Number.isSafeInteger(input.length) || input.length < 0 || input.length > maximum) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const expected = [
      ...Array.from({ length: input.length }, (_unused, index) => String(index)),
      "length"
    ].sort();
    const actual = Reflect.ownKeys(input).map(String).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      return null;
    }
    const values: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor)) return null;
      values.push(descriptor.value);
    }
    return Object.freeze(values);
  } catch {
    return null;
  }
}

function snapshotRow(
  input: unknown,
  fields: readonly string[]
): Readonly<Record<string, unknown>> | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = exactDataDescriptors(input, fields);
    if (descriptors === null) return null;
    const row: Record<string, unknown> = {};
    for (const field of fields) row[field] = descriptors[field]?.value;
    return Object.freeze(row);
  } catch {
    return null;
  }
}

function parseRawFields(input: unknown, expectedNames: readonly string[]): boolean {
  const fields = snapshotDenseArray(input, expectedNames.length);
  if (fields === null || fields.length !== expectedNames.length) return false;
  for (let index = 0; index < fields.length; index += 1) {
    const descriptors = exactDataDescriptors(fields[index], RAW_FIELD_KEYS);
    if (descriptors === null || descriptors.name?.value !== expectedNames[index]) return false;
  }
  return true;
}

/** Converts only the exact pinned node-postgres 8.23.0 Result shape to plain data. */
function projectRawResult(
  input: unknown,
  expected: RawResultSpecification
): AltanaGrantClaimProjection | null {
  const descriptors = exactDataDescriptors(input, RAW_RESULT_KEYS);
  if (descriptors === null) return null;
  const rowCount = descriptors.rowCount?.value;
  if (
    descriptors.command?.value !== expected.command ||
    descriptors.oid?.value !== expected.oid ||
    descriptors.rowAsArray?.value !== false ||
    !parseRawFields(descriptors.fields?.value, expected.fields)
  ) {
    return null;
  }
  const rows = snapshotDenseArray(descriptors.rows?.value, expected.maximumRows);
  if (
    rows === null ||
    rows.length < expected.minimumRows ||
    (expected.rowCount === null
      ? rowCount !== null || rows.length !== 0
      : !Number.isSafeInteger(rowCount) || rowCount !== rows.length)
  ) {
    return null;
  }
  const projectedRows: Readonly<Record<string, unknown>>[] = [];
  for (const row of rows) {
    const projected = snapshotRow(row, expected.fields);
    if (projected === null) return null;
    projectedRows.push(projected);
  }
  return Object.freeze({ rows: Object.freeze(projectedRows), rowCount: rowCount as number | null });
}

/** Used only by the module-owned pool to project its exact verifier Result. */
export function projectAltanaGrantClaimSchemaNodePostgresResult(
  input: unknown
): AltanaGrantClaimProjection | null {
  return projectRawResult(input, VERIFY_SPEC);
}

function findDataMethod(input: object, name: "connect" | "query" | "release"): DataMethod | null {
  let cursor: object | null = input;
  for (let depth = 0; cursor !== null && depth < 8; depth += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(cursor, name);
    if (descriptor !== undefined) {
      return "value" in descriptor && typeof descriptor.value === "function"
        ? (descriptor.value as DataMethod)
        : null;
    }
    cursor = Object.getPrototypeOf(cursor) as object | null;
  }
  return null;
}

function parsePool(input: unknown): ParsedPool | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  try {
    const connect = findDataMethod(input, "connect");
    return connect === null ? null : Object.freeze({ connect, source: input });
  } catch {
    return null;
  }
}

function parseClient(input: unknown): ParsedClient | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  try {
    const query = findDataMethod(input, "query");
    const release = findDataMethod(input, "release");
    return query === null || release === null
      ? null
      : Object.freeze({ query, release, source: input });
  } catch {
    return null;
  }
}

function bounded<Value>(promise: Promise<Value>, timeoutMs: number): Promise<Bounded<Value>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(Object.freeze({ status: "timeout" as const }));
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Object.freeze({ status: "fulfilled" as const, value }));
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Object.freeze({ status: "rejected" as const }));
      }
    );
  });
}

function callMethod(
  method: DataMethod,
  source: object,
  ...parameters: readonly unknown[]
): Promise<unknown> {
  try {
    return Promise.resolve(method.call(source, ...parameters));
  } catch {
    return Promise.reject(new Error("sanitized synchronous boundary failure"));
  }
}

function releaseClient(client: ParsedClient, destroy: boolean): void {
  try {
    client.release.call(client.source, destroy);
  } catch {
    if (!destroy) {
      try {
        client.release.call(client.source, true);
      } catch {
        // A known database outcome is unchanged by a cleanup failure.
      }
    }
  }
}

function isCanonicalDeploymentId(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input !== "00000000-0000-0000-0000-000000000000" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input)
  );
}

/**
 * Runs the entire fixed grant-claim protocol on one checked-out app client.
 * There is no caller-supplied SQL or transaction callback, and there is no retry.
 */
export async function executeAltanaGrantClaimPostgresTransaction(
  unparsedPool: unknown,
  expectedDeploymentId: string,
  unparsedClaim: AltanaGrantSubmissionClaim
): Promise<AltanaGrantClaimResult> {
  assertServerRuntime();
  const pool = parsePool(unparsedPool);
  const claim = parseAltanaGrantSubmissionClaim(unparsedClaim);
  if (pool === null || claim === null || !isCanonicalDeploymentId(expectedDeploymentId)) {
    throw new AltanaGrantClaimTransactionError("POOL_ACQUIRE_FAILED", "not_attempted");
  }

  const acquirePromise = callMethod(pool.connect, pool.source);
  const acquired = await bounded(acquirePromise, ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.acquireMs);
  if (acquired.status === "timeout") {
    void acquirePromise.then(
      (lateClient) => {
        const parsed = parseClient(lateClient);
        if (parsed !== null) releaseClient(parsed, true);
      },
      () => undefined
    );
    throw new AltanaGrantClaimTransactionError("POOL_ACQUIRE_TIMEOUT", "not_attempted");
  }
  if (acquired.status === "rejected") {
    throw new AltanaGrantClaimTransactionError("POOL_ACQUIRE_FAILED", "not_attempted");
  }
  const client = parseClient(acquired.value);
  if (client === null) {
    if (typeof acquired.value === "object" && acquired.value !== null) {
      const release = findDataMethod(acquired.value, "release");
      if (release !== null) {
        try {
          release.call(acquired.value, true);
        } catch {
          // A malformed boundary is never retained for diagnostics.
        }
      }
    }
    throw new AltanaGrantClaimTransactionError("CLIENT_INVALID", "not_attempted");
  }

  let commitStarted = false;
  let disposed = false;
  let transactionOpen = false;
  let writeAttempted = false;

  const dispose = (destroy: boolean): void => {
    if (disposed) return;
    disposed = true;
    releaseClient(client, destroy);
  };

  const assertNotDisposed = (): void => {
    if (!disposed) return;
    throw new AltanaGrantClaimTransactionError(
      "TRANSACTION_TIMEOUT",
      writeAttempted || commitStarted ? "unknown" : "not_attempted"
    );
  };

  const rawQuery = async (
    statement: string,
    parameters: readonly (number | string)[],
    expected: RawResultSpecification,
    timeoutMs: number
  ): Promise<AltanaGrantClaimProjection> => {
    assertNotDisposed();
    const queryPromise = callMethod(client.query, client.source, statement, [...parameters]);
    const outcome = await bounded(queryPromise, timeoutMs);
    assertNotDisposed();
    if (outcome.status === "timeout") {
      void queryPromise.catch(() => undefined);
      dispose(true);
      throw new AltanaGrantClaimTransactionError(
        "QUERY_FAILED",
        writeAttempted ? "unknown" : "not_attempted"
      );
    }
    if (outcome.status === "rejected") {
      throw new AltanaGrantClaimTransactionError(
        "QUERY_FAILED",
        writeAttempted ? "rolled_back" : "not_attempted"
      );
    }
    const projection = projectRawResult(outcome.value, expected);
    if (projection === null) {
      throw new AltanaGrantClaimTransactionError(
        "QUERY_RESULT_INVALID",
        writeAttempted ? "rolled_back" : "not_attempted"
      );
    }
    return projection;
  };

  const rollbackFailure = async (error: AltanaGrantClaimTransactionError): Promise<never> => {
    if (disposed) throw error;
    if (!transactionOpen) {
      dispose(false);
      throw error;
    }
    assertNotDisposed();
    const rollbackPromise = callMethod(
      client.query,
      client.source,
      ALTANA_GRANT_CLAIM_POSTGRES_ROLLBACK_SQL
    );
    const rollback = await bounded(rollbackPromise, ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.controlMs);
    assertNotDisposed();
    if (
      rollback.status !== "fulfilled" ||
      projectRawResult(rollback.value, ROLLBACK_SPEC) === null
    ) {
      void rollbackPromise.catch(() => undefined);
      dispose(true);
      throw new AltanaGrantClaimTransactionError(
        "ROLLBACK_OUTCOME_UNKNOWN",
        writeAttempted ? "unknown" : "not_attempted",
        error.operationCode
      );
    }
    transactionOpen = false;
    dispose(false);
    throw new AltanaGrantClaimTransactionError(
      error.code,
      writeAttempted ? "rolled_back" : "not_attempted",
      error.operationCode
    );
  };

  const run = async (): Promise<AltanaGrantClaimResult> => {
    assertNotDisposed();
    const beginPromise = callMethod(
      client.query,
      client.source,
      ALTANA_GRANT_CLAIM_POSTGRES_BEGIN_SQL
    );
    const begin = await bounded(beginPromise, ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.controlMs);
    assertNotDisposed();
    if (begin.status !== "fulfilled" || projectRawResult(begin.value, BEGIN_SPEC) === null) {
      void beginPromise.catch(() => undefined);
      dispose(true);
      throw new AltanaGrantClaimTransactionError("TRANSACTION_START_FAILED", "not_attempted");
    }
    transactionOpen = true;

    try {
      const local = await rawQuery(
        ALTANA_GRANT_CLAIM_POSTGRES_SET_LOCAL_SQL,
        SET_LOCAL_PARAMETERS,
        SET_LOCAL_SPEC,
        ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.controlMs
      );
      const localRow = snapshotRow(local.rows[0], SET_LOCAL_SPEC.fields);
      if (
        localRow === null ||
        localRow?.statementTimeout !== SET_LOCAL_NORMALIZED_RESULTS[0] ||
        localRow.lockTimeout !== SET_LOCAL_NORMALIZED_RESULTS[1] ||
        localRow.idleTimeout !== SET_LOCAL_NORMALIZED_RESULTS[2]
      ) {
        throw new AltanaGrantClaimTransactionError("QUERY_RESULT_INVALID", "not_attempted");
      }

      const receiptProjection = await rawQuery(
        ALTANA_GRANT_CLAIM_RECEIPT_READ_SQL,
        Object.freeze([]),
        RECEIPT_SPEC,
        ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.queryMs
      );
      const receipt = parseAltanaGrantClaimReceiptProjection(
        receiptProjection,
        ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256
      );
      if (receipt === null || receipt.deploymentId !== expectedDeploymentId) {
        throw new AltanaGrantClaimTransactionError(
          "QUERY_RESULT_INVALID",
          "not_attempted",
          "SCHEMA_NOT_READY"
        );
      }

      assertNotDisposed();
      writeAttempted = true;
      const insertProjection = await rawQuery(
        ALTANA_GRANT_CLAIM_INSERT_SQL,
        altanaGrantClaimInsertParameters(claim),
        INSERT_SPEC,
        ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.queryMs
      );
      const inserted = interpretAltanaGrantClaimInsertProjection(insertProjection, claim);
      let result: AltanaGrantClaimResult;
      if (inserted.status === "claimed") {
        result = inserted.result;
      } else if (inserted.status === "read_conflict") {
        const conflictProjection = await rawQuery(
          ALTANA_GRANT_CLAIM_CONFLICT_READ_SQL,
          altanaGrantClaimConflictParameters(claim),
          CONFLICT_SPEC,
          ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.queryMs
        );
        const conflict = interpretAltanaGrantClaimConflictProjection(conflictProjection, claim);
        if (conflict.status === "already_claimed") {
          result = conflict.result;
        } else if (conflict.status === "conflict") {
          throw new AltanaGrantClaimTransactionError(
            "QUERY_RESULT_INVALID",
            "rolled_back",
            "CLAIM_CONFLICT"
          );
        } else {
          throw new AltanaGrantClaimTransactionError(
            "QUERY_RESULT_INVALID",
            "rolled_back",
            "DATABASE_RESULT_INVALID"
          );
        }
      } else {
        throw new AltanaGrantClaimTransactionError(
          "QUERY_RESULT_INVALID",
          "rolled_back",
          "DATABASE_RESULT_INVALID"
        );
      }

      assertNotDisposed();
      commitStarted = true;
      const commitPromise = callMethod(
        client.query,
        client.source,
        ALTANA_GRANT_CLAIM_POSTGRES_COMMIT_SQL
      );
      const commit = await bounded(commitPromise, ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.controlMs);
      assertNotDisposed();
      if (commit.status !== "fulfilled" || projectRawResult(commit.value, COMMIT_SPEC) === null) {
        void commitPromise.catch(() => undefined);
        dispose(true);
        throw new AltanaGrantClaimTransactionError("COMMIT_OUTCOME_UNKNOWN", "unknown");
      }
      transactionOpen = false;
      commitStarted = false;
      dispose(false);
      return result;
    } catch (error) {
      if (disposed || commitStarted) {
        if (error instanceof AltanaGrantClaimTransactionError) throw error;
        throw new AltanaGrantClaimTransactionError("COMMIT_OUTCOME_UNKNOWN", "unknown");
      }
      const sanitized =
        error instanceof AltanaGrantClaimTransactionError
          ? error
          : new AltanaGrantClaimTransactionError(
              "QUERY_FAILED",
              writeAttempted ? "rolled_back" : "not_attempted"
            );
      return rollbackFailure(sanitized);
    }
  };

  const runPromise = run();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      dispose(true);
      reject(
        new AltanaGrantClaimTransactionError(
          "TRANSACTION_TIMEOUT",
          writeAttempted || commitStarted ? "unknown" : "not_attempted"
        )
      );
    }, ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.transactionMs);
  });

  try {
    return await Promise.race([runPromise, timeoutPromise]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    void runPromise.catch(() => undefined);
  }
}
