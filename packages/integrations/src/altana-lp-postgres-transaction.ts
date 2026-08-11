import {
  ALTANA_LP_RESERVATION_CONFLICT_READ_SQL,
  ALTANA_LP_RESERVATION_INSERT_SQL,
  ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS,
  AltanaLpReservationStoreError,
  type AltanaLpReservationPostgresDatabase,
  type AltanaLpReservationPostgresParameter,
  type AltanaLpReservationPostgresQueryResult,
  type AltanaLpReservationPostgresTransaction
} from "./altana-lp-reservation-store";

export const ALTANA_LP_POSTGRES_BEGIN_SQL =
  "BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE";
export const ALTANA_LP_POSTGRES_SET_LOCAL_SQL =
  "SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $2, true), set_config('idle_in_transaction_session_timeout', $3, true)";
export const ALTANA_LP_POSTGRES_COMMIT_SQL = "COMMIT";
export const ALTANA_LP_POSTGRES_ROLLBACK_SQL = "ROLLBACK";

const DEFAULT_STATEMENT_TIMEOUT_MS = 10_000;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS = 15_000;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 5_000;
const DEFAULT_CONTROL_TIMEOUT_MS = 5_000;
const DEFAULT_TRANSACTION_TIMEOUT_MS = 20_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;
const MAX_PARAMETERS = 32;

export type AltanaLpPostgresTransactionErrorCode =
  | "CLIENT_INVALID"
  | "CLIENT_RELEASE_FAILED"
  | "COMMIT_OUTCOME_UNKNOWN"
  | "CONCURRENT_QUERY_FORBIDDEN"
  | "DATABASE_OPTIONS_INVALID"
  | "POOL_ACQUIRE_FAILED"
  | "POOL_ACQUIRE_TIMEOUT"
  | "POOL_INVALID"
  | "QUERY_FORBIDDEN"
  | "QUERY_RESULT_INVALID"
  | "ROLLBACK_OUTCOME_UNKNOWN"
  | "SERVER_RUNTIME_REQUIRED"
  | "TIMEOUT_CONFIGURATION_INVALID"
  | "TRANSACTION_INACTIVE"
  | "TRANSACTION_OPERATION_INVALID"
  | "TRANSACTION_OPERATION_FAILED"
  | "TRANSACTION_SETUP_FAILED"
  | "TRANSACTION_START_FAILED"
  | "TRANSACTION_TIMEOUT"
  | "UNAWAITED_QUERY";

const ERROR_MESSAGES: Readonly<Record<AltanaLpPostgresTransactionErrorCode, string>> =
  Object.freeze({
    CLIENT_INVALID: "The PostgreSQL pool returned an invalid client boundary.",
    CLIENT_RELEASE_FAILED: "The PostgreSQL client could not be safely released.",
    COMMIT_OUTCOME_UNKNOWN:
      "The PostgreSQL commit outcome is unknown and must be reconciled by exact IDs.",
    CONCURRENT_QUERY_FORBIDDEN: "Reservation transaction statements must execute sequentially.",
    DATABASE_OPTIONS_INVALID:
      "The reservation transaction requires exact READ COMMITTED, read-write, no-retry options.",
    POOL_ACQUIRE_FAILED: "The PostgreSQL pool could not provide a transaction client.",
    POOL_ACQUIRE_TIMEOUT: "The PostgreSQL client acquisition deadline elapsed.",
    POOL_INVALID: "A node-postgres-compatible pool is required.",
    QUERY_FORBIDDEN: "The reservation transaction rejected an unexpected SQL statement.",
    QUERY_RESULT_INVALID: "The PostgreSQL client returned an invalid query result.",
    ROLLBACK_OUTCOME_UNKNOWN:
      "The PostgreSQL rollback outcome is unknown; the client has been destroyed.",
    SERVER_RUNTIME_REQUIRED: "The node-postgres transaction boundary is server-only.",
    TIMEOUT_CONFIGURATION_INVALID: "The PostgreSQL transaction timeout policy is invalid.",
    TRANSACTION_INACTIVE: "The PostgreSQL transaction is no longer active.",
    TRANSACTION_OPERATION_INVALID: "A transaction operation callback is required.",
    TRANSACTION_OPERATION_FAILED:
      "The PostgreSQL transaction operation failed and was rolled back.",
    TRANSACTION_SETUP_FAILED: "The PostgreSQL transaction timeout setup failed.",
    TRANSACTION_START_FAILED: "The PostgreSQL transaction could not start.",
    TRANSACTION_TIMEOUT: "The PostgreSQL transaction deadline elapsed before commit.",
    UNAWAITED_QUERY: "The transaction callback returned before its query completed."
  });

/** Safe operational error that deliberately retains no driver error or connection details. */
export class AltanaLpPostgresTransactionError extends Error {
  override readonly name = "AltanaLpPostgresTransactionError";
  readonly code: AltanaLpPostgresTransactionErrorCode;
  readonly reservationOutcome: "not_attempted" | "rolled_back" | "committed_unusable" | "unknown";

  constructor(
    code: AltanaLpPostgresTransactionErrorCode,
    reservationOutcome:
      "not_attempted" | "rolled_back" | "committed_unusable" | "unknown" = "not_attempted"
  ) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
    this.reservationOutcome = reservationOutcome;
  }
}

export interface NodePostgresReservationClient {
  readonly query: (
    statement: string,
    parameters?: readonly AltanaLpReservationPostgresParameter[]
  ) => Promise<unknown>;
  readonly release: (destroy?: boolean) => void;
}

export interface NodePostgresReservationPool {
  readonly connect: () => Promise<unknown>;
}

export interface CreateNodePostgresAltanaLpDatabaseOptions {
  readonly pool: NodePostgresReservationPool;
  readonly acquireTimeoutMs?: number;
  readonly controlTimeoutMs?: number;
  readonly statementTimeoutMs?: number;
  readonly lockTimeoutMs?: number;
  readonly idleInTransactionTimeoutMs?: number;
  readonly transactionTimeoutMs?: number;
  readonly onCleanupFailure?: (phase: "committed" | "rolled_back") => void;
}

type MethodName = "connect" | "query" | "release";
type DataMethod = (...args: unknown[]) => unknown;

function findDataMethod(input: object, methodName: MethodName): DataMethod | null {
  let cursor: object | null = input;
  for (let depth = 0; cursor !== null && depth < 8; depth += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(cursor, methodName);
    if (descriptor !== undefined) {
      return "value" in descriptor && typeof descriptor.value === "function"
        ? (descriptor.value as DataMethod)
        : null;
    }
    cursor = Object.getPrototypeOf(cursor) as object | null;
  }
  return null;
}

function parsePool(input: unknown): {
  readonly source: object;
  readonly connect: DataMethod;
} | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const connect = findDataMethod(input, "connect");
  return connect === null ? null : { source: input, connect };
}

function parseClient(input: unknown): {
  readonly source: object;
  readonly query: DataMethod;
  readonly release: DataMethod;
} | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const query = findDataMethod(input, "query");
  const release = findDataMethod(input, "release");
  return query === null || release === null ? null : { source: input, query, release };
}

function parseTimeout(value: unknown, fallback: number): number | null {
  const candidate = value === undefined ? fallback : value;
  return typeof candidate === "number" &&
    Number.isSafeInteger(candidate) &&
    candidate >= MIN_TIMEOUT_MS &&
    candidate <= MAX_TIMEOUT_MS
    ? candidate
    : null;
}

function parseOptions(input: unknown): {
  readonly pool: ReturnType<typeof parsePool> & {};
  readonly acquireTimeoutMs: number;
  readonly controlTimeoutMs: number;
  readonly statementTimeoutMs: number;
  readonly lockTimeoutMs: number;
  readonly idleInTransactionTimeoutMs: number;
  readonly transactionTimeoutMs: number;
  readonly onCleanupFailure: ((phase: "committed" | "rolled_back") => void) | null;
} | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return null;

  const descriptors = Object.getOwnPropertyDescriptors(input);
  const allowedKeys = new Set([
    "acquireTimeoutMs",
    "controlTimeoutMs",
    "idleInTransactionTimeoutMs",
    "lockTimeoutMs",
    "onCleanupFailure",
    "pool",
    "statementTimeoutMs",
    "transactionTimeoutMs"
  ]);
  if (Object.keys(descriptors).some((key) => !allowedKeys.has(key))) return null;
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor)) return null;
  }

  const pool = parsePool(descriptors.pool?.value);
  const acquireTimeoutMs = parseTimeout(
    descriptors.acquireTimeoutMs?.value,
    DEFAULT_ACQUIRE_TIMEOUT_MS
  );
  const controlTimeoutMs = parseTimeout(
    descriptors.controlTimeoutMs?.value,
    DEFAULT_CONTROL_TIMEOUT_MS
  );
  const statementTimeoutMs = parseTimeout(
    descriptors.statementTimeoutMs?.value,
    DEFAULT_STATEMENT_TIMEOUT_MS
  );
  const lockTimeoutMs = parseTimeout(descriptors.lockTimeoutMs?.value, DEFAULT_LOCK_TIMEOUT_MS);
  const idleInTransactionTimeoutMs = parseTimeout(
    descriptors.idleInTransactionTimeoutMs?.value,
    DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS
  );
  const transactionTimeoutMs = parseTimeout(
    descriptors.transactionTimeoutMs?.value,
    DEFAULT_TRANSACTION_TIMEOUT_MS
  );
  const onCleanupFailureValue = descriptors.onCleanupFailure?.value;
  const onCleanupFailure =
    onCleanupFailureValue === undefined
      ? null
      : typeof onCleanupFailureValue === "function"
        ? (onCleanupFailureValue as (phase: "committed" | "rolled_back") => void)
        : undefined;
  if (
    pool === null ||
    acquireTimeoutMs === null ||
    controlTimeoutMs === null ||
    statementTimeoutMs === null ||
    lockTimeoutMs === null ||
    idleInTransactionTimeoutMs === null ||
    transactionTimeoutMs === null ||
    onCleanupFailure === undefined ||
    lockTimeoutMs > statementTimeoutMs ||
    statementTimeoutMs > transactionTimeoutMs
  ) {
    return null;
  }
  return {
    pool,
    acquireTimeoutMs,
    controlTimeoutMs,
    statementTimeoutMs,
    lockTimeoutMs,
    idleInTransactionTimeoutMs,
    transactionTimeoutMs,
    onCleanupFailure
  };
}

function hasValidPoolAndOptionShape(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return false;
    if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return false;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const allowedKeys = new Set([
      "acquireTimeoutMs",
      "controlTimeoutMs",
      "idleInTransactionTimeoutMs",
      "lockTimeoutMs",
      "onCleanupFailure",
      "pool",
      "statementTimeoutMs",
      "transactionTimeoutMs"
    ]);
    if (
      Object.keys(descriptors).some((key) => !allowedKeys.has(key)) ||
      Object.values(descriptors).some((descriptor) => !("value" in descriptor))
    ) {
      return false;
    }
    return parsePool(descriptors.pool?.value) !== null;
  } catch {
    return false;
  }
}

function hasExactTransactionOptions(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Object.keys(descriptors).sort();
  if (keys.join("\0") !== "isolationLevel\0readOnly\0retry") return false;
  if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return false;
  return (
    descriptors.isolationLevel !== undefined &&
    "value" in descriptors.isolationLevel &&
    descriptors.isolationLevel.value === ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS.isolationLevel &&
    descriptors.readOnly !== undefined &&
    "value" in descriptors.readOnly &&
    descriptors.readOnly.value === ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS.readOnly &&
    descriptors.retry !== undefined &&
    "value" in descriptors.retry &&
    descriptors.retry.value === ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS.retry
  );
}

function isAllowedStatement(statement: unknown): statement is string {
  return (
    statement === ALTANA_LP_RESERVATION_INSERT_SQL ||
    statement === ALTANA_LP_RESERVATION_CONFLICT_READ_SQL
  );
}

function parseParameters(input: unknown): readonly AltanaLpReservationPostgresParameter[] | null {
  if (!Array.isArray(input) || input.length > MAX_PARAMETERS) return null;
  const parsed: AltanaLpReservationPostgresParameter[] = [];
  for (const value of input) {
    if (typeof value === "string") {
      parsed.push(value);
    } else if (typeof value === "number" && Number.isSafeInteger(value)) {
      parsed.push(value);
    } else {
      return null;
    }
  }
  return parsed;
}

function parseQueryResult(input: unknown): AltanaLpReservationPostgresQueryResult | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const rowsDescriptor = descriptors.rows;
  const rowCountDescriptor = descriptors.rowCount;
  if (
    rowsDescriptor === undefined ||
    !("value" in rowsDescriptor) ||
    !Array.isArray(rowsDescriptor.value) ||
    rowCountDescriptor === undefined ||
    !("value" in rowCountDescriptor) ||
    (rowCountDescriptor.value !== null &&
      (!Number.isSafeInteger(rowCountDescriptor.value) || rowCountDescriptor.value < 0))
  ) {
    return null;
  }
  return Object.freeze({
    rows: Object.freeze([...rowsDescriptor.value]),
    rowCount: rowCountDescriptor.value as number | null
  });
}

function isExpectedControlResult(
  input: unknown,
  expectedCommand: "BEGIN" | "COMMIT" | "ROLLBACK" | "SELECT"
): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const command = descriptors.command;
    const rowCount = descriptors.rowCount;
    const rows = descriptors.rows;
    const emptyControlResult =
      rowCount !== undefined &&
      "value" in rowCount &&
      rowCount.value === null &&
      rows !== undefined &&
      "value" in rows &&
      Array.isArray(rows.value) &&
      rows.value.length === 0;
    const setupResult =
      rowCount !== undefined &&
      "value" in rowCount &&
      rowCount.value === 1 &&
      rows !== undefined &&
      "value" in rows &&
      Array.isArray(rows.value) &&
      rows.value.length === 1;
    return (
      command !== undefined &&
      "value" in command &&
      command.value === expectedCommand &&
      (expectedCommand === "SELECT" ? setupResult : emptyControlResult)
    );
  } catch {
    return false;
  }
}

function callClientQuery(
  client: NonNullable<ReturnType<typeof parseClient>>,
  statement: string,
  parameters?: readonly AltanaLpReservationPostgresParameter[]
): Promise<unknown> {
  try {
    return Promise.resolve(
      client.query.call(
        client.source,
        statement,
        parameters === undefined ? undefined : [...parameters]
      )
    );
  } catch (error) {
    return Promise.reject(error);
  }
}

function tryReleaseClient(
  client: NonNullable<ReturnType<typeof parseClient>>,
  destroy: boolean
): boolean {
  try {
    client.release.call(client.source, destroy);
    return true;
  } catch {
    return false;
  }
}

function notifyCleanupFailure(
  callback: ((phase: "committed" | "rolled_back") => void) | null,
  phase: "committed" | "rolled_back"
): void {
  if (callback === null) return;
  try {
    callback(phase);
  } catch {
    // Telemetry is deliberately best-effort and cannot alter durable outcome.
  }
}

function releaseAfterKnownOutcome(
  release: (destroy: boolean) => boolean,
  phase: "committed" | "rolled_back",
  callback: ((phase: "committed" | "rolled_back") => void) | null
): void {
  if (!release(false)) notifyCleanupFailure(callback, phase);
}

function destroyUnknownClient(input: unknown): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return;
  try {
    const release = findDataMethod(input, "release");
    if (release !== null) release.call(input, true);
  } catch {
    // A malformed pool contract is not trusted for cleanup or diagnostics.
  }
}

function withTimeout<Value>(
  promise: Promise<Value>,
  timeoutMs: number,
  error: AltanaLpPostgresTransactionError,
  onTimeout?: () => void
): Promise<Value> {
  return new Promise<Value>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        onTimeout?.();
      } catch {
        // Timeout cleanup cannot change the sanitized outcome.
      }
      reject(error);
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (reason: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(reason);
      }
    );
  });
}

async function rollbackOrThrow(
  client: NonNullable<ReturnType<typeof parseClient>>,
  controlTimeoutMs: number,
  release: (destroy: boolean) => boolean
): Promise<void> {
  const error = new AltanaLpPostgresTransactionError("ROLLBACK_OUTCOME_UNKNOWN", "unknown");
  try {
    const result = await withTimeout(
      callClientQuery(client, ALTANA_LP_POSTGRES_ROLLBACK_SQL),
      controlTimeoutMs,
      error,
      () => {
        release(true);
      }
    );
    if (!isExpectedControlResult(result, "ROLLBACK")) throw error;
  } catch {
    release(true);
    throw error;
  }
}

function abandonInFlightQuery(
  promise: Promise<unknown> | null,
  release: (destroy: boolean) => boolean
): boolean {
  if (promise === null) return false;
  void promise.catch(() => undefined);
  release(true);
  return true;
}

/**
 * Implements the transaction interface with the exact node-postgres client model.
 *
 * One checked-out client executes BEGIN, timeout setup, every store statement,
 * and COMMIT/ROLLBACK. There is no retry. A COMMIT transport failure destroys
 * the client and becomes an outcome-unknown result that can only be reconciled
 * with the exact immutable reservation IDs.
 */
export function createNodePostgresAltanaLpReservationDatabase(
  unparsedOptions: CreateNodePostgresAltanaLpDatabaseOptions
): AltanaLpReservationPostgresDatabase {
  if (
    typeof process === "undefined" ||
    process.release?.name !== "node" ||
    (typeof window !== "undefined" && typeof window.document !== "undefined")
  ) {
    throw new AltanaLpPostgresTransactionError("SERVER_RUNTIME_REQUIRED");
  }
  const options = parseOptions(unparsedOptions);
  if (options === null) {
    throw new AltanaLpPostgresTransactionError(
      hasValidPoolAndOptionShape(unparsedOptions) ? "TIMEOUT_CONFIGURATION_INVALID" : "POOL_INVALID"
    );
  }

  return Object.freeze({
    transaction: async <Result>(
      transactionOptions: Readonly<typeof ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS>,
      operation: (transaction: AltanaLpReservationPostgresTransaction) => Promise<Result>
    ): Promise<Result> => {
      if (!hasExactTransactionOptions(transactionOptions)) {
        throw new AltanaLpPostgresTransactionError("DATABASE_OPTIONS_INVALID");
      }
      if (typeof operation !== "function") {
        throw new AltanaLpPostgresTransactionError("TRANSACTION_OPERATION_INVALID");
      }

      let acquirePromise: Promise<unknown>;
      try {
        acquirePromise = Promise.resolve(options.pool.connect.call(options.pool.source));
      } catch {
        throw new AltanaLpPostgresTransactionError("POOL_ACQUIRE_FAILED");
      }
      let unparsedClient: unknown;
      const acquireTimeoutError = new AltanaLpPostgresTransactionError(
        "POOL_ACQUIRE_TIMEOUT",
        "not_attempted"
      );
      try {
        unparsedClient = await withTimeout(
          acquirePromise,
          options.acquireTimeoutMs,
          acquireTimeoutError,
          () => {
            void acquirePromise.then(destroyUnknownClient, () => undefined);
          }
        );
      } catch (error) {
        if (error === acquireTimeoutError) throw error;
        throw new AltanaLpPostgresTransactionError("POOL_ACQUIRE_FAILED");
      }
      let client: ReturnType<typeof parseClient>;
      try {
        client = parseClient(unparsedClient);
      } catch {
        client = null;
      }
      if (client === null) {
        destroyUnknownClient(unparsedClient);
        throw new AltanaLpPostgresTransactionError("CLIENT_INVALID");
      }
      let releaseAttempted = false;
      const release = (destroy: boolean): boolean => {
        if (releaseAttempted) return true;
        releaseAttempted = true;
        return tryReleaseClient(client, destroy);
      };

      const startError = new AltanaLpPostgresTransactionError(
        "TRANSACTION_START_FAILED",
        "rolled_back"
      );
      try {
        const beginResult = await withTimeout(
          callClientQuery(client, ALTANA_LP_POSTGRES_BEGIN_SQL),
          options.controlTimeoutMs,
          startError,
          () => {
            release(true);
          }
        );
        if (!isExpectedControlResult(beginResult, "BEGIN")) throw startError;
      } catch {
        release(true);
        throw startError;
      }

      try {
        const setupResult = await withTimeout(
          callClientQuery(client, ALTANA_LP_POSTGRES_SET_LOCAL_SQL, [
            `${options.statementTimeoutMs}ms`,
            `${options.lockTimeoutMs}ms`,
            `${options.idleInTransactionTimeoutMs}ms`
          ]),
          options.controlTimeoutMs,
          new AltanaLpPostgresTransactionError("TRANSACTION_SETUP_FAILED", "rolled_back")
        );
        if (!isExpectedControlResult(setupResult, "SELECT")) {
          throw new AltanaLpPostgresTransactionError("TRANSACTION_SETUP_FAILED", "rolled_back");
        }
      } catch {
        try {
          await rollbackOrThrow(client, options.controlTimeoutMs, release);
        } catch (error) {
          throw error;
        }
        const error = new AltanaLpPostgresTransactionError(
          "TRANSACTION_SETUP_FAILED",
          "rolled_back"
        );
        releaseAfterKnownOutcome(release, "rolled_back", options.onCleanupFailure);
        throw error;
      }

      let active = true;
      let inFlightPromise: Promise<AltanaLpReservationPostgresQueryResult> | null = null;
      const transaction = Object.freeze({
        query: (
          statement: string,
          unparsedParameters: readonly AltanaLpReservationPostgresParameter[]
        ): Promise<AltanaLpReservationPostgresQueryResult> => {
          if (!active) {
            return Promise.reject(new AltanaLpPostgresTransactionError("TRANSACTION_INACTIVE"));
          }
          if (inFlightPromise !== null) {
            return Promise.reject(
              new AltanaLpPostgresTransactionError("CONCURRENT_QUERY_FORBIDDEN")
            );
          }
          if (!isAllowedStatement(statement)) {
            return Promise.reject(new AltanaLpPostgresTransactionError("QUERY_FORBIDDEN"));
          }
          const parameters = parseParameters(unparsedParameters);
          if (parameters === null) {
            return Promise.reject(new AltanaLpPostgresTransactionError("QUERY_FORBIDDEN"));
          }
          const queryPromise = callClientQuery(client, statement, parameters).then((value) => {
            const result = parseQueryResult(value);
            if (result === null) {
              throw new AltanaLpPostgresTransactionError("QUERY_RESULT_INVALID");
            }
            return result;
          });
          const publicPromise = queryPromise.finally(() => {
            if (inFlightPromise === publicPromise) inFlightPromise = null;
          });
          inFlightPromise = publicPromise;
          return publicPromise;
        }
      });

      let result: Result;
      const operationTimeoutError = new AltanaLpPostgresTransactionError(
        "TRANSACTION_TIMEOUT",
        "rolled_back"
      );
      try {
        const operationPromise = Promise.resolve().then(() => operation(transaction));
        result = await withTimeout(
          operationPromise,
          options.transactionTimeoutMs,
          operationTimeoutError,
          () => {
            active = false;
            release(true);
          }
        );
        active = false;
        if (abandonInFlightQuery(inFlightPromise, release)) {
          throw new AltanaLpPostgresTransactionError("UNAWAITED_QUERY", "rolled_back");
        }
      } catch (operationError) {
        active = false;
        if (operationError === operationTimeoutError) throw operationError;
        if (
          operationError instanceof AltanaLpPostgresTransactionError &&
          operationError.code === "UNAWAITED_QUERY"
        ) {
          throw operationError;
        }
        if (abandonInFlightQuery(inFlightPromise, release)) {
          throw new AltanaLpPostgresTransactionError("UNAWAITED_QUERY", "rolled_back");
        }
        try {
          await rollbackOrThrow(client, options.controlTimeoutMs, release);
        } catch (rollbackError) {
          throw rollbackError;
        }
        releaseAfterKnownOutcome(release, "rolled_back", options.onCleanupFailure);
        if (
          operationError instanceof AltanaLpReservationStoreError ||
          operationError instanceof AltanaLpPostgresTransactionError
        ) {
          throw operationError;
        }
        throw new AltanaLpPostgresTransactionError("TRANSACTION_OPERATION_FAILED", "rolled_back");
      }

      const commitError = new AltanaLpPostgresTransactionError("COMMIT_OUTCOME_UNKNOWN", "unknown");
      try {
        const commitResult = await withTimeout(
          callClientQuery(client, ALTANA_LP_POSTGRES_COMMIT_SQL),
          options.controlTimeoutMs,
          commitError,
          () => {
            release(true);
          }
        );
        if (!isExpectedControlResult(commitResult, "COMMIT")) throw commitError;
      } catch {
        release(true);
        throw commitError;
      }
      releaseAfterKnownOutcome(release, "committed", options.onCleanupFailure);
      return result;
    }
  });
}
