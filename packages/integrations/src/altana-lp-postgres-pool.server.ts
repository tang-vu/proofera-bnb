import "server-only";

import { Pool, type PoolConfig } from "pg";

import type {
  AltanaLpDurableReservationDependency,
  AltanaLpReservationRequest
} from "./altana-lp-handoff";
import {
  isVerifiedAltanaLpDurableReservationDependency,
  registerVerifiedAltanaLpDurableReservationDependency,
  type VerifiedAltanaLpDurableReservationDependency
} from "./altana-lp-reservation-capability.server";
import {
  createNodePostgresAltanaLpReservationDatabase,
  type NodePostgresReservationPool
} from "./altana-lp-postgres-transaction";
import {
  ALTANA_LP_RESERVATION_DOMAIN_SCHEMA_VERSION,
  ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256,
  ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256,
  ALTANA_LP_RESERVATION_SUPPORTED_POSTGRES_MAJOR,
  isVerifiedAltanaLpReservationSchemaReady,
  type AltanaLpReservationSchemaVerificationResult
} from "./altana-lp-reservation-schema-verifier";
import {
  ALTANA_LP_RESERVATION_APP_ROLE,
  ALTANA_LP_RESERVATION_MIGRATION_VERSION,
  createPostgresAltanaLpReservationDependency
} from "./altana-lp-reservation-store";

const APPLICATION_NAME = "proofera-altana-lp-reservation";
const MAX_CONNECTIONS = 8;
const CONNECTION_TIMEOUT_MS = 5_000;
const PROBE_TIMEOUT_MS = 5_000;
const CLOSE_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 30_000;
const MAX_LIFETIME_SECONDS = 300;
const QUERY_TIMEOUT_MS = 12_000;
const STATEMENT_TIMEOUT_MS = 10_000;
const LOCK_TIMEOUT_MS = 5_000;
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 15_000;
const TRANSACTION_TIMEOUT_MS = 20_000;
const KEEP_ALIVE_INITIAL_DELAY_MS = 10_000;
const MAX_CONNECTION_STRING_LENGTH = 4_096;
const MAX_CA_LENGTH = 131_072;

export { isVerifiedAltanaLpDurableReservationDependency };
export type { VerifiedAltanaLpDurableReservationDependency };

/**
 * This is an application-identity access probe, never a migration or schema
 * verification. Exact catalog verification is a separate administrator-only
 * ceremony whose ready result must be supplied to `bindVerifiedSchema`.
 */
export const ALTANA_LP_POSTGRES_APPLICATION_ACCESS_PROBE_SQL = `
WITH target AS (
  SELECT
    to_regnamespace('proofera_activation')::oid AS schema_oid,
    to_regclass('proofera_activation.altana_lp_reservations')::oid AS table_oid
)
SELECT CASE
  WHEN target.schema_oid IS NULL OR target.table_oid IS NULL THEN FALSE
  ELSE
    current_user = '${ALTANA_LP_RESERVATION_APP_ROLE}'
    AND has_schema_privilege(current_user, target.schema_oid, 'USAGE')
    AND NOT has_schema_privilege(current_user, target.schema_oid, 'CREATE')
    AND has_table_privilege(current_user, target.table_oid, 'SELECT')
    AND has_table_privilege(current_user, target.table_oid, 'INSERT')
    AND NOT has_table_privilege(current_user, target.table_oid, 'UPDATE')
    AND NOT has_table_privilege(current_user, target.table_oid, 'DELETE')
    AND NOT has_table_privilege(current_user, target.table_oid, 'TRUNCATE')
END AS application_access_ready
FROM target
`.trim();

export type AltanaLpPostgresRuntime = "development" | "production" | "test";

export type AltanaLpPostgresTlsConfiguration =
  Readonly<{ mode: "disable" }> | Readonly<{ ca?: string; mode: "verify-full" }>;

export interface AltanaLpPostgresConnectionConfiguration {
  readonly connectionString: string;
  readonly runtime: AltanaLpPostgresRuntime;
  readonly tls: AltanaLpPostgresTlsConfiguration;
}

type ExplicitPoolConfig = PoolConfig & {
  readonly enableChannelBinding: true;
  /** A truthy explicit false value prevents node-postgres from reading PGREPLICATION. */
  readonly replication: "false";
  readonly sslnegotiation: "postgres";
};

/** Passed only to the injected factory or node-postgres; never exposed by the service. */
export type AltanaLpNodePostgresPoolConfiguration = Readonly<ExplicitPoolConfig>;

export type AltanaLpNodePostgresPoolFactory = (
  configuration: AltanaLpNodePostgresPoolConfiguration
) => unknown;

export type AltanaLpPostgresOperationalSignal =
  | Readonly<{ code: "POSTGRES_IDLE_CLIENT_ERROR" }>
  | Readonly<{
      code: "POSTGRES_TRANSACTION_CLIENT_CLEANUP_FAILED";
      phase: "committed" | "rolled_back";
    }>
  | Readonly<{ code: "POSTGRES_APPLICATION_ACCESS_PROBE_TIMEOUT" }>
  | Readonly<{ code: "POSTGRES_POOL_CLOSE_OUTCOME_UNKNOWN" }>;

export interface CreateAltanaLpPostgresPoolCompositionDependencies {
  readonly now?: () => Date;
  readonly onOperationalSignal?: (signal: AltanaLpPostgresOperationalSignal) => void;
  readonly poolFactory?: AltanaLpNodePostgresPoolFactory;
}

export type AltanaLpPostgresApplicationAccessProbe =
  | Readonly<{ status: "application_access_ready" }>
  | Readonly<{
      reason:
        "application_access_unavailable" | "closed" | "database_unavailable" | "probe_timeout";
      status: "unavailable";
    }>;

export type AltanaLpPostgresCloseResult =
  Readonly<{ status: "closed" }> | Readonly<{ status: "close_outcome_unknown" }>;

export interface AltanaLpPostgresPoolComposition {
  /**
   * Creates the durable write dependency only after an exact, separately
   * produced administrator schema-verification result and a fresh app probe.
   */
  readonly bindVerifiedSchema: (
    verification: AltanaLpReservationSchemaVerificationResult
  ) => Promise<VerifiedAltanaLpDurableReservationDependency>;
  readonly close: () => Promise<AltanaLpPostgresCloseResult>;
  readonly probeApplicationAccess: () => Promise<AltanaLpPostgresApplicationAccessProbe>;
}

export type AltanaLpPostgresPoolErrorCode =
  | "APPLICATION_ACCESS_UNAVAILABLE"
  | "CONFIGURATION_INVALID"
  | "DEPENDENCIES_INVALID"
  | "DEPENDENCY_CLOSED"
  | "POOL_BOUNDARY_INVALID"
  | "POOL_INITIALIZATION_FAILED"
  | "SCHEMA_VERIFICATION_INVALID"
  | "SERVER_RUNTIME_REQUIRED"
  | "TLS_VERIFICATION_REQUIRED";

const ERROR_MESSAGES: Readonly<Record<AltanaLpPostgresPoolErrorCode, string>> = Object.freeze({
  APPLICATION_ACCESS_UNAVAILABLE:
    "The PostgreSQL application identity is not ready for reservation access.",
  CONFIGURATION_INVALID: "The PostgreSQL connection configuration is invalid.",
  DEPENDENCIES_INVALID: "The PostgreSQL pool composition dependencies are invalid.",
  DEPENDENCY_CLOSED: "The PostgreSQL reservation boundary is closed.",
  POOL_BOUNDARY_INVALID: "The PostgreSQL pool does not expose the required server boundary.",
  POOL_INITIALIZATION_FAILED: "The PostgreSQL pool could not be initialized safely.",
  SCHEMA_VERIFICATION_INVALID: "An exact ready PostgreSQL schema verification result is required.",
  SERVER_RUNTIME_REQUIRED: "The PostgreSQL pool composition is server-only.",
  TLS_VERIFICATION_REQUIRED: "Production PostgreSQL requires verified TLS."
});

/** Safe operational error: no driver error, URL, certificate, or pool is retained. */
export class AltanaLpPostgresPoolError extends Error {
  override readonly name = "AltanaLpPostgresPoolError";
  readonly code: AltanaLpPostgresPoolErrorCode;
  readonly reservationOutcome = "not_attempted" as const;

  constructor(code: AltanaLpPostgresPoolErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
  }
}

type DataMethod = (...arguments_: unknown[]) => unknown;

interface ParsedPoolBoundary {
  readonly source: object;
  readonly connect: DataMethod;
  readonly end: DataMethod;
  readonly on: DataMethod;
  readonly query: DataMethod;
}

interface ParsedConfiguration {
  readonly connectionString: string;
  readonly runtime: AltanaLpPostgresRuntime;
  readonly tls: AltanaLpPostgresTlsConfiguration;
}

interface ParsedDependencies {
  readonly now: (() => Date) | null;
  readonly onOperationalSignal: ((signal: AltanaLpPostgresOperationalSignal) => void) | null;
  readonly poolFactory: AltanaLpNodePostgresPoolFactory;
}

type BoundedResult<Value> =
  | Readonly<{ state: "fulfilled"; value: Value }>
  | Readonly<{ state: "rejected" }>
  | Readonly<{ state: "timeout" }>;

const APPLICATION_ACCESS_READY = Object.freeze({ status: "application_access_ready" as const });
const CLOSED = Object.freeze({ reason: "closed" as const, status: "unavailable" as const });
const DATABASE_UNAVAILABLE = Object.freeze({
  reason: "database_unavailable" as const,
  status: "unavailable" as const
});
const ACCESS_UNAVAILABLE = Object.freeze({
  reason: "application_access_unavailable" as const,
  status: "unavailable" as const
});
const PROBE_TIMEOUT = Object.freeze({
  reason: "probe_timeout" as const,
  status: "unavailable" as const
});
const CLOSED_RESULT = Object.freeze({ status: "closed" as const });
const CLOSE_UNKNOWN_RESULT = Object.freeze({ status: "close_outcome_unknown" as const });
const IDLE_ERROR_SIGNAL = Object.freeze({ code: "POSTGRES_IDLE_CLIENT_ERROR" as const });
const PROBE_TIMEOUT_SIGNAL = Object.freeze({
  code: "POSTGRES_APPLICATION_ACCESS_PROBE_TIMEOUT" as const
});
const CLOSE_UNKNOWN_SIGNAL = Object.freeze({
  code: "POSTGRES_POOL_CLOSE_OUTCOME_UNKNOWN" as const
});
const URL_PATTERN =
  /^(postgres(?:ql)?):\/\/((?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+):((?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+)@([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\]):([0-9]{1,5})\/([A-Za-z0-9._~-]+)$/u;

function isPlainDataObject(input: unknown): input is object {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return false;
  return Object.values(Object.getOwnPropertyDescriptors(input)).every(
    (descriptor) => "value" in descriptor
  );
}

function readOwnDataDescriptors(input: unknown): PropertyDescriptorMap | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  try {
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.some((key) => typeof key === "symbol")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const descriptorKeys = Object.keys(descriptors).sort();
    const stringKeys = (ownKeys as string[]).sort();
    if (
      descriptorKeys.length !== stringKeys.length ||
      descriptorKeys.some((key, index) => key !== stringKeys[index]) ||
      Object.values(descriptors).some((descriptor) => !("value" in descriptor))
    ) {
      return null;
    }
    return descriptors;
  } catch {
    return null;
  }
}

function hasExactKeys(descriptors: PropertyDescriptorMap, keys: readonly string[]): boolean {
  const actual = Object.keys(descriptors).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function hasAllowedKeys(descriptors: PropertyDescriptorMap, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(descriptors).every((key) => allowed.has(key));
}

function hasSafeDecodedComponent(value: string, maximumLength: number): boolean {
  try {
    const decoded = decodeURIComponent(value);
    return (
      decoded.length > 0 &&
      decoded.length <= maximumLength &&
      !/[\u0000-\u001f\u007f]/u.test(decoded)
    );
  } catch {
    return false;
  }
}

function isStrictConnectionString(input: unknown): input is string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > MAX_CONNECTION_STRING_LENGTH ||
    input.trim() !== input ||
    /[\u0000\r\n?#]/u.test(input)
  ) {
    return false;
  }

  const matched = URL_PATTERN.exec(input);
  if (matched === null) return false;
  const [, protocol, username, password, host, portText, database] = matched;
  if (
    protocol === undefined ||
    username === undefined ||
    password === undefined ||
    host === undefined ||
    portText === undefined ||
    database === undefined ||
    !hasSafeDecodedComponent(username, 256) ||
    decodeURIComponent(username) !== ALTANA_LP_RESERVATION_APP_ROLE ||
    !hasSafeDecodedComponent(password, 2_048)
  ) {
    return false;
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) return false;

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }
  return (
    parsed.href === input &&
    parsed.protocol === `${protocol}:` &&
    parsed.username === username &&
    parsed.password === password &&
    parsed.host === `${host}:${portText}` &&
    parsed.port === portText &&
    parsed.pathname === `/${database}` &&
    parsed.search.length === 0 &&
    parsed.hash.length === 0
  );
}

function parseTls(input: unknown): AltanaLpPostgresTlsConfiguration | null {
  if (!isPlainDataObject(input)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const mode = descriptors.mode?.value;
  if (mode === "disable" && hasExactKeys(descriptors, ["mode"])) {
    return Object.freeze({ mode });
  }
  if (mode !== "verify-full" || !hasAllowedKeys(descriptors, ["ca", "mode"])) return null;
  const ca = descriptors.ca?.value;
  if (
    ca !== undefined &&
    (typeof ca !== "string" || ca.length === 0 || ca.length > MAX_CA_LENGTH || /\u0000/u.test(ca))
  ) {
    return null;
  }
  return ca === undefined ? Object.freeze({ mode }) : Object.freeze({ ca, mode });
}

function parseConfiguration(input: unknown): ParsedConfiguration | null {
  if (!isPlainDataObject(input)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (!hasExactKeys(descriptors, ["connectionString", "runtime", "tls"])) return null;

  const connectionString = descriptors.connectionString?.value;
  const runtime = descriptors.runtime?.value;
  const tls = parseTls(descriptors.tls?.value);
  if (
    !isStrictConnectionString(connectionString) ||
    (runtime !== "development" && runtime !== "production" && runtime !== "test") ||
    tls === null
  ) {
    return null;
  }
  return Object.freeze({ connectionString, runtime, tls });
}

function defaultPoolFactory(configuration: AltanaLpNodePostgresPoolConfiguration): unknown {
  return new Pool(configuration);
}

function parseDependencies(input: unknown): ParsedDependencies | null {
  if (!isPlainDataObject(input)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (!hasAllowedKeys(descriptors, ["now", "onOperationalSignal", "poolFactory"])) return null;
  const nowValue = descriptors.now?.value;
  const signalValue = descriptors.onOperationalSignal?.value;
  const factoryValue = descriptors.poolFactory?.value;
  if (
    (nowValue !== undefined && typeof nowValue !== "function") ||
    (signalValue !== undefined && typeof signalValue !== "function") ||
    (factoryValue !== undefined && typeof factoryValue !== "function")
  ) {
    return null;
  }
  return Object.freeze({
    now: nowValue === undefined ? null : (nowValue as () => Date),
    onOperationalSignal:
      signalValue === undefined
        ? null
        : (signalValue as (signal: AltanaLpPostgresOperationalSignal) => void),
    poolFactory:
      factoryValue === undefined
        ? defaultPoolFactory
        : (factoryValue as AltanaLpNodePostgresPoolFactory)
  });
}

function findDataMethod(
  input: object,
  name: "connect" | "end" | "on" | "query"
): DataMethod | null {
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

function parsePoolBoundary(input: unknown): ParsedPoolBoundary | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const connect = findDataMethod(input, "connect");
  const end = findDataMethod(input, "end");
  const on = findDataMethod(input, "on");
  const query = findDataMethod(input, "query");
  return connect === null || end === null || on === null || query === null
    ? null
    : { connect, end, on, query, source: input };
}

function buildPoolConfiguration(
  configuration: ParsedConfiguration
): AltanaLpNodePostgresPoolConfiguration {
  const ssl =
    configuration.tls.mode === "disable"
      ? false
      : Object.freeze({
          ...(configuration.tls.ca === undefined ? {} : { ca: configuration.tls.ca }),
          minVersion: "TLSv1.2" as const,
          rejectUnauthorized: true
        });

  return Object.freeze({
    allowExitOnIdle: false,
    application_name: APPLICATION_NAME,
    client_encoding: "UTF8",
    connectionString: configuration.connectionString,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    enableChannelBinding: true,
    fallback_application_name: APPLICATION_NAME,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: KEEP_ALIVE_INITIAL_DELAY_MS,
    lock_timeout: LOCK_TIMEOUT_MS,
    max: MAX_CONNECTIONS,
    maxLifetimeSeconds: MAX_LIFETIME_SECONDS,
    min: 0,
    options: "-c search_path=pg_catalog",
    query_timeout: QUERY_TIMEOUT_MS,
    replication: "false",
    ssl,
    sslnegotiation: "postgres",
    statement_timeout: STATEMENT_TIMEOUT_MS
  });
}

function parseApplicationAccessResult(input: unknown): boolean | null {
  const resultDescriptors = readOwnDataDescriptors(input);
  if (resultDescriptors === null) return null;
  const rows = resultDescriptors.rows;
  const rowCount = resultDescriptors.rowCount;
  if (
    rows === undefined ||
    !("value" in rows) ||
    !Array.isArray(rows.value) ||
    rows.value.length !== 1 ||
    rowCount === undefined ||
    !("value" in rowCount) ||
    rowCount.value !== 1
  ) {
    return null;
  }
  const row: unknown = rows.value[0];
  if (!isPlainDataObject(row)) return null;
  const rowDescriptors = Object.getOwnPropertyDescriptors(row);
  if (!hasExactKeys(rowDescriptors, ["application_access_ready"])) return null;
  const value = rowDescriptors.application_access_ready?.value;
  return typeof value === "boolean" ? value : null;
}

function isExactReadySchemaVerification(input: unknown): boolean {
  if (
    !isVerifiedAltanaLpReservationSchemaReady(input) ||
    !isPlainDataObject(input) ||
    !Object.isFrozen(input)
  ) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    !hasExactKeys(descriptors, [
      "domainSchemaVersion",
      "catalogFingerprintSha256",
      "migrationVersion",
      "postgresMajor",
      "sourceDdlSha256",
      "status"
    ])
  ) {
    return false;
  }
  return (
    descriptors.status?.value === "ready" &&
    descriptors.migrationVersion?.value === ALTANA_LP_RESERVATION_MIGRATION_VERSION &&
    descriptors.domainSchemaVersion?.value === ALTANA_LP_RESERVATION_DOMAIN_SCHEMA_VERSION &&
    descriptors.postgresMajor?.value === ALTANA_LP_RESERVATION_SUPPORTED_POSTGRES_MAJOR &&
    descriptors.sourceDdlSha256?.value === ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256 &&
    descriptors.catalogFingerprintSha256?.value ===
      ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256
  );
}

function emitSignal(
  callback: ((signal: AltanaLpPostgresOperationalSignal) => void) | null,
  signal: AltanaLpPostgresOperationalSignal
): void {
  if (callback === null) return;
  try {
    callback(signal);
  } catch {
    // Telemetry is best-effort and cannot alter a database outcome.
  }
}

function closePoolBestEffort(pool: ParsedPoolBoundary): void {
  try {
    void Promise.resolve(pool.end.call(pool.source)).catch(() => undefined);
  } catch {
    // Initialization already failed; cleanup must not retain or expose the driver error.
  }
}

function closeUnknownPoolBestEffort(input: unknown): void {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return;
    const end = findDataMethod(input, "end");
    if (end === null) return;
    closePoolBestEffort({
      connect: () => undefined,
      end,
      on: () => undefined,
      query: () => undefined,
      source: input
    });
  } catch {
    // A malformed injected pool is not trusted for cleanup or diagnostics.
  }
}

function bounded<Value>(promise: Promise<Value>, timeoutMs: number): Promise<BoundedResult<Value>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(Object.freeze({ state: "timeout" as const }));
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Object.freeze({ state: "fulfilled" as const, value }));
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Object.freeze({ state: "rejected" as const }));
      }
    );
  });
}

function assertServerRuntime(): void {
  if (
    typeof process === "undefined" ||
    process.release?.name !== "node" ||
    (typeof window !== "undefined" && typeof window.document !== "undefined")
  ) {
    throw new AltanaLpPostgresPoolError("SERVER_RUNTIME_REQUIRED");
  }
}

/**
 * Creates the server-only PostgreSQL lifecycle boundary for LP reservations.
 *
 * The URL requires explicit username, password, host, port, and database and
 * permits no query or fragment. This prevents node-postgres from silently
 * filling authentication/port from ambient PG variables or replacing the
 * explicit TLS object. `options` and `replication=false` also neutralize
 * ambient startup behavior without inspecting or logging process environment.
 * No migration runs here and no write dependency exists before explicit bind.
 */
export function createAltanaLpPostgresPoolComposition(
  unparsedConfiguration: AltanaLpPostgresConnectionConfiguration,
  unparsedDependencies: CreateAltanaLpPostgresPoolCompositionDependencies = {}
): AltanaLpPostgresPoolComposition {
  assertServerRuntime();

  let configuration: ParsedConfiguration | null;
  try {
    configuration = parseConfiguration(unparsedConfiguration);
  } catch {
    configuration = null;
  }
  if (configuration === null) throw new AltanaLpPostgresPoolError("CONFIGURATION_INVALID");

  let dependencies: ParsedDependencies | null;
  try {
    dependencies = parseDependencies(unparsedDependencies);
  } catch {
    dependencies = null;
  }
  if (dependencies === null) throw new AltanaLpPostgresPoolError("DEPENDENCIES_INVALID");
  if (configuration.runtime === "production" && configuration.tls.mode !== "verify-full") {
    throw new AltanaLpPostgresPoolError("TLS_VERIFICATION_REQUIRED");
  }

  let unparsedPool: unknown;
  try {
    unparsedPool = dependencies.poolFactory(buildPoolConfiguration(configuration));
  } catch {
    throw new AltanaLpPostgresPoolError("POOL_INITIALIZATION_FAILED");
  }

  let pool: ParsedPoolBoundary | null;
  try {
    pool = parsePoolBoundary(unparsedPool);
  } catch {
    pool = null;
  }
  if (pool === null) {
    closeUnknownPoolBestEffort(unparsedPool);
    throw new AltanaLpPostgresPoolError("POOL_BOUNDARY_INVALID");
  }

  const idleErrorListener = (): void => {
    emitSignal(dependencies.onOperationalSignal, IDLE_ERROR_SIGNAL);
  };
  try {
    pool.on.call(pool.source, "error", idleErrorListener);
  } catch {
    closePoolBestEffort(pool);
    throw new AltanaLpPostgresPoolError("POOL_INITIALIZATION_FAILED");
  }

  let closed = false;
  let closePromise: Promise<AltanaLpPostgresCloseResult> | null = null;
  let boundDependency: VerifiedAltanaLpDurableReservationDependency | null = null;
  let bindPromise: Promise<VerifiedAltanaLpDurableReservationDependency> | null = null;

  const probeApplicationAccess = async (): Promise<AltanaLpPostgresApplicationAccessProbe> => {
    assertServerRuntime();
    if (closed) return CLOSED;
    let queryPromise: Promise<unknown>;
    try {
      queryPromise = Promise.resolve(
        pool.query.call(pool.source, ALTANA_LP_POSTGRES_APPLICATION_ACCESS_PROBE_SQL)
      );
    } catch {
      return DATABASE_UNAVAILABLE;
    }
    const outcome = await bounded(queryPromise, PROBE_TIMEOUT_MS);
    if (closed) return CLOSED;
    if (outcome.state === "timeout") {
      emitSignal(dependencies.onOperationalSignal, PROBE_TIMEOUT_SIGNAL);
      return PROBE_TIMEOUT;
    }
    if (outcome.state === "rejected") return DATABASE_UNAVAILABLE;
    try {
      const ready = parseApplicationAccessResult(outcome.value);
      return ready === true
        ? APPLICATION_ACCESS_READY
        : ready === false
          ? ACCESS_UNAVAILABLE
          : DATABASE_UNAVAILABLE;
    } catch {
      return DATABASE_UNAVAILABLE;
    }
  };

  const bindVerifiedSchema = (
    verification: AltanaLpReservationSchemaVerificationResult
  ): Promise<VerifiedAltanaLpDurableReservationDependency> => {
    assertServerRuntime();
    if (closed) {
      return Promise.reject(new AltanaLpPostgresPoolError("DEPENDENCY_CLOSED"));
    }
    let verificationReady = false;
    try {
      verificationReady = isExactReadySchemaVerification(verification);
    } catch {
      verificationReady = false;
    }
    if (!verificationReady) {
      return Promise.reject(new AltanaLpPostgresPoolError("SCHEMA_VERIFICATION_INVALID"));
    }
    if (boundDependency !== null) return Promise.resolve(boundDependency);
    if (bindPromise !== null) return bindPromise;

    bindPromise = (async () => {
      const access = await probeApplicationAccess();
      if (closed) throw new AltanaLpPostgresPoolError("DEPENDENCY_CLOSED");
      if (access.status !== "application_access_ready") {
        throw new AltanaLpPostgresPoolError("APPLICATION_ACCESS_UNAVAILABLE");
      }

      const transactionPool: NodePostgresReservationPool = Object.freeze({
        connect: async () => {
          if (closed) throw new AltanaLpPostgresPoolError("DEPENDENCY_CLOSED");
          return pool.connect.call(pool.source);
        }
      });
      let durableDependency: AltanaLpDurableReservationDependency;
      try {
        const database = createNodePostgresAltanaLpReservationDatabase({
          acquireTimeoutMs: CONNECTION_TIMEOUT_MS,
          controlTimeoutMs: CONNECTION_TIMEOUT_MS,
          idleInTransactionTimeoutMs: IDLE_IN_TRANSACTION_TIMEOUT_MS,
          lockTimeoutMs: LOCK_TIMEOUT_MS,
          onCleanupFailure: (phase) => {
            emitSignal(
              dependencies.onOperationalSignal,
              Object.freeze({
                code: "POSTGRES_TRANSACTION_CLIENT_CLEANUP_FAILED" as const,
                phase
              })
            );
          },
          pool: transactionPool,
          statementTimeoutMs: STATEMENT_TIMEOUT_MS,
          transactionTimeoutMs: TRANSACTION_TIMEOUT_MS
        });
        durableDependency =
          dependencies.now === null
            ? createPostgresAltanaLpReservationDependency({ database })
            : createPostgresAltanaLpReservationDependency({ database, now: dependencies.now });
      } catch {
        throw new AltanaLpPostgresPoolError("POOL_INITIALIZATION_FAILED");
      }

      const guardedDependency = registerVerifiedAltanaLpDurableReservationDependency(
        Object.freeze({
          consumeOrRead: async (request: Readonly<AltanaLpReservationRequest>) => {
            if (closed || boundDependency !== guardedDependency) {
              throw new AltanaLpPostgresPoolError("DEPENDENCY_CLOSED");
            }
            return durableDependency.consumeOrRead(request);
          }
        })
      );
      if (closed) throw new AltanaLpPostgresPoolError("DEPENDENCY_CLOSED");
      boundDependency = guardedDependency;
      return guardedDependency;
    })().finally(() => {
      bindPromise = null;
    });
    return bindPromise;
  };

  const close = (): Promise<AltanaLpPostgresCloseResult> => {
    assertServerRuntime();
    if (closePromise !== null) return closePromise;
    closed = true;
    boundDependency = null;
    closePromise = (async () => {
      let endPromise: Promise<unknown>;
      try {
        endPromise = Promise.resolve(pool.end.call(pool.source));
      } catch {
        emitSignal(dependencies.onOperationalSignal, CLOSE_UNKNOWN_SIGNAL);
        return CLOSE_UNKNOWN_RESULT;
      }
      const outcome = await bounded(endPromise, CLOSE_TIMEOUT_MS);
      if (outcome.state === "fulfilled") return CLOSED_RESULT;
      emitSignal(dependencies.onOperationalSignal, CLOSE_UNKNOWN_SIGNAL);
      return CLOSE_UNKNOWN_RESULT;
    })();
    return closePromise;
  };

  return Object.freeze({ bindVerifiedSchema, close, probeApplicationAccess });
}
