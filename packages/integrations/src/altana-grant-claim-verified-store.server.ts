import "server-only";

import { Pool, type PoolConfig } from "pg";

import type { AltanaGrantSubmissionClaim } from "./altana-grant";
import {
  ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
  ALTANA_GRANT_CLAIM_CAPABILITY_TTL_MS,
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_PARAMETERS,
  ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL,
  interpretAltanaGrantClaimSchemaProjection,
  type AltanaGrantClaimCanonicalSchema,
  type AltanaGrantClaimSchemaVerificationResult
} from "./altana-grant-claim-schema-verifier";
import {
  ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS,
  AltanaGrantClaimTransactionError,
  executeAltanaGrantClaimPostgresTransaction,
  projectAltanaGrantClaimSchemaNodePostgresResult
} from "./altana-grant-claim-postgres-transaction";
import {
  createAltanaGrantClaimStoreError,
  isAuthenticAltanaGrantClaimResult,
  parseAltanaGrantSubmissionClaim,
  type AltanaGrantClaimResult,
  type AltanaGrantSubmissionClaimStore
} from "./altana-grant-claim-store";

const APPLICATION_NAME = "proofera-altana-grant-claim";
const CONNECTION_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 30_000;
const KEEP_ALIVE_INITIAL_DELAY_MS = 10_000;
const MAX_CA_LENGTH = 131_072;
const MAX_CONNECTIONS = 8;
const MAX_CONNECTION_STRING_LENGTH = 4_096;
const MAX_LIFETIME_SECONDS = 300;

/**
 * Implementation evidence only. A real PostgreSQL 17 disposable-cluster suite
 * passed in-process; no production deployment or connection is implied.
 */
export const ALTANA_GRANT_CLAIM_POSTGRES_RELEASE_READINESS = Object.freeze({
  canonicalMigrationArtifact: true,
  independentCatalogVerifier: true,
  moduleOwnedSamePoolGateway: true,
  realPostgres17Verified: true,
  deploymentConfigured: false,
  releaseReady: false
});

export type AltanaGrantClaimPostgresRuntime = "development" | "production" | "test";
export type AltanaGrantClaimPostgresTlsConfiguration =
  Readonly<{ mode: "disable" }> | Readonly<{ ca?: string; mode: "verify-full" }>;

export interface AltanaGrantClaimPostgresConnectionConfiguration {
  readonly connectionString: string;
  readonly runtime: AltanaGrantClaimPostgresRuntime;
  readonly tls: AltanaGrantClaimPostgresTlsConfiguration;
}

export type AltanaGrantClaimPostgresReadiness =
  | AltanaGrantClaimSchemaVerificationResult
  | Readonly<{
      status: "unavailable";
      reason: "closed" | "database_unavailable" | "verification_timeout";
    }>;

export type AltanaGrantClaimPostgresCloseResult =
  Readonly<{ status: "closed" }> | Readonly<{ status: "close_outcome_unknown" }>;

/** The only public runtime surface: no pool, client, database, or capability escapes. */
export interface AltanaGrantClaimPostgresServer extends AltanaGrantSubmissionClaimStore {
  readonly close: () => Promise<AltanaGrantClaimPostgresCloseResult>;
  readonly verifyReadiness: () => Promise<AltanaGrantClaimPostgresReadiness>;
}

export type AltanaGrantClaimPostgresServerErrorCode =
  | "CONFIGURATION_INVALID"
  | "POOL_BOUNDARY_INVALID"
  | "POOL_INITIALIZATION_FAILED"
  | "SERVER_RUNTIME_REQUIRED"
  | "TLS_VERIFICATION_REQUIRED";

const ERROR_MESSAGES: Readonly<Record<AltanaGrantClaimPostgresServerErrorCode, string>> =
  Object.freeze({
    CONFIGURATION_INVALID: "The grant-claim PostgreSQL connection configuration is invalid.",
    POOL_BOUNDARY_INVALID: "The grant-claim PostgreSQL pool boundary is invalid.",
    POOL_INITIALIZATION_FAILED: "The grant-claim PostgreSQL pool could not initialize safely.",
    SERVER_RUNTIME_REQUIRED: "The grant-claim PostgreSQL composition is server-only.",
    TLS_VERIFICATION_REQUIRED: "Production grant-claim PostgreSQL requires verified TLS."
  });

/** Safe construction error: it retains no URL, TLS material, pool, or driver error. */
export class AltanaGrantClaimPostgresServerError extends Error {
  override readonly name = "AltanaGrantClaimPostgresServerError";
  readonly code: AltanaGrantClaimPostgresServerErrorCode;
  readonly claimOutcome = "not_attempted" as const;

  constructor(code: AltanaGrantClaimPostgresServerErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
  }
}

type DataMethod = (...arguments_: unknown[]) => unknown;
type ParsedPool = Readonly<{
  connect: DataMethod;
  end: DataMethod;
  on: DataMethod;
  source: object;
}>;
type ParsedVerificationClient = Readonly<{
  query: DataMethod;
  release: DataMethod;
  source: object;
}>;
type ParsedConfiguration = Readonly<{
  connectionString: string;
  runtime: AltanaGrantClaimPostgresRuntime;
  tls: AltanaGrantClaimPostgresTlsConfiguration;
}>;
type Bounded<Value> =
  | Readonly<{ status: "fulfilled"; value: Value }>
  | Readonly<{ status: "rejected" }>
  | Readonly<{ status: "timeout" }>;

type ExplicitPoolConfig = PoolConfig & {
  readonly enableChannelBinding: true;
  readonly replication: "false";
  readonly sslnegotiation: "postgres";
};

type VerificationCapability = Readonly<Record<never, never>>;
type VerificationCapabilityState = Readonly<{
  deploymentId: string;
  expiresAt: number;
  pool: object;
}>;

const AUTHENTIC_CAPABILITIES = new WeakSet<object>();
const CAPABILITY_BY_POOL = new WeakMap<object, VerificationCapability>();
const CAPABILITY_STATE = new WeakMap<object, VerificationCapabilityState>();

const CLOSED_READINESS = Object.freeze({
  reason: "closed" as const,
  status: "unavailable" as const
});
const DATABASE_UNAVAILABLE = Object.freeze({
  reason: "database_unavailable" as const,
  status: "unavailable" as const
});
const VERIFY_TIMEOUT = Object.freeze({
  reason: "verification_timeout" as const,
  status: "unavailable" as const
});
const CLOSED_RESULT = Object.freeze({ status: "closed" as const });
const CLOSE_UNKNOWN_RESULT = Object.freeze({ status: "close_outcome_unknown" as const });

const URL_PATTERN =
  /^(postgres(?:ql)?):\/\/([A-Za-z0-9._~-]+):((?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+)@([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\]):([0-9]{1,5})\/([A-Za-z0-9._~-]+)$/u;

function assertServerRuntime(): void {
  if (
    typeof process === "undefined" ||
    process.release?.name !== "node" ||
    (typeof window !== "undefined" && typeof window.document !== "undefined")
  ) {
    throw new AltanaGrantClaimPostgresServerError("SERVER_RUNTIME_REQUIRED");
  }
}

function dataDescriptors(input: unknown): PropertyDescriptorMap | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(input).some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    return Object.values(descriptors).every((descriptor) => "value" in descriptor)
      ? descriptors
      : null;
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
    username !== ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE ||
    password === undefined ||
    host === undefined ||
    portText === undefined ||
    database === undefined ||
    !hasSafeDecodedComponent(password, 2_048)
  ) {
    return false;
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) return false;
  try {
    const parsed = new URL(input);
    return (
      parsed.href === input &&
      parsed.protocol === `${protocol}:` &&
      parsed.username === ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE &&
      parsed.password === password &&
      parsed.host === `${host}:${portText}` &&
      parsed.port === portText &&
      parsed.pathname === `/${database}` &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0
    );
  } catch {
    return false;
  }
}

function parseTls(input: unknown): AltanaGrantClaimPostgresTlsConfiguration | null {
  const descriptors = dataDescriptors(input);
  if (descriptors === null) return null;
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
  const descriptors = dataDescriptors(input);
  if (descriptors === null || !hasExactKeys(descriptors, ["connectionString", "runtime", "tls"])) {
    return null;
  }
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

function findDataMethod(
  input: object,
  name: "connect" | "end" | "on" | "query" | "release"
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

function parsePool(input: unknown): ParsedPool | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  try {
    const connect = findDataMethod(input, "connect");
    const end = findDataMethod(input, "end");
    const on = findDataMethod(input, "on");
    return connect === null || end === null || on === null
      ? null
      : Object.freeze({ connect, end, on, source: input });
  } catch {
    return null;
  }
}

function parseVerificationClient(input: unknown): ParsedVerificationClient | null {
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

function releaseVerificationClient(client: ParsedVerificationClient, destroy: boolean): void {
  try {
    client.release.call(client.source, destroy);
  } catch {
    if (!destroy) {
      try {
        client.release.call(client.source, true);
      } catch {
        // No driver detail or suspect verification client crosses this boundary.
      }
    }
  }
}

function destroyUnknownVerificationClient(input: unknown): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return;
  try {
    const release = findDataMethod(input, "release");
    if (release !== null) release.call(input, true);
  } catch {
    // Invalid acquired boundaries are destroyed when possible and then forgotten.
  }
}

function buildPoolConfiguration(configuration: ParsedConfiguration): Readonly<ExplicitPoolConfig> {
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
    idle_in_transaction_session_timeout: ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.idleInTransactionMs,
    keepAlive: true,
    keepAliveInitialDelayMillis: KEEP_ALIVE_INITIAL_DELAY_MS,
    lock_timeout: ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.lockMs,
    max: MAX_CONNECTIONS,
    maxLifetimeSeconds: MAX_LIFETIME_SECONDS,
    min: 0,
    options: "-c search_path=pg_catalog",
    query_timeout: ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.queryMs,
    replication: "false",
    ssl,
    sslnegotiation: "postgres",
    statement_timeout: ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.statementMs
  });
}

function callMethod(method: DataMethod, source: object, ...parameters: readonly unknown[]) {
  try {
    return Promise.resolve(method.call(source, ...parameters));
  } catch {
    return Promise.reject(new Error("sanitized synchronous boundary failure"));
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

function clearCapability(pool: object): void {
  CAPABILITY_BY_POOL.delete(pool);
}

function bindCapability(pool: object, verification: AltanaGrantClaimCanonicalSchema): void {
  const capability: VerificationCapability = Object.freeze({});
  AUTHENTIC_CAPABILITIES.add(capability);
  CAPABILITY_STATE.set(
    capability,
    Object.freeze({
      deploymentId: verification.deploymentId,
      expiresAt: Date.now() + ALTANA_GRANT_CLAIM_CAPABILITY_TTL_MS,
      pool
    })
  );
  CAPABILITY_BY_POOL.set(pool, capability);
}

function freshCapability(pool: object): VerificationCapabilityState | null {
  try {
    const capability = CAPABILITY_BY_POOL.get(pool);
    if (capability === undefined || !AUTHENTIC_CAPABILITIES.has(capability)) return null;
    const state = CAPABILITY_STATE.get(capability);
    if (state === undefined || state.pool !== pool || state.expiresAt <= Date.now()) {
      clearCapability(pool);
      return null;
    }
    return state;
  } catch {
    clearCapability(pool);
    return null;
  }
}

function closeUnknownPool(input: unknown): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return;
  try {
    const end = findDataMethod(input, "end");
    if (end !== null) void callMethod(end, input).catch(() => undefined);
  } catch {
    // Initialization already failed and the driver error is not retained.
  }
}

function mapTransactionError(error: AltanaGrantClaimTransactionError): never {
  if (error.claimOutcome === "unknown") {
    throw createAltanaGrantClaimStoreError("DATABASE_OUTCOME_UNKNOWN", "unknown");
  }
  if (error.operationCode === "SCHEMA_NOT_READY") {
    throw createAltanaGrantClaimStoreError("SCHEMA_NOT_READY", error.claimOutcome);
  }
  if (error.operationCode === "CLAIM_CONFLICT") {
    throw createAltanaGrantClaimStoreError("CLAIM_CONFLICT", error.claimOutcome);
  }
  if (error.operationCode === "DATABASE_RESULT_INVALID") {
    throw createAltanaGrantClaimStoreError("DATABASE_RESULT_INVALID", error.claimOutcome);
  }
  if (error.claimOutcome === "rolled_back") {
    throw createAltanaGrantClaimStoreError("DATABASE_ROLLED_BACK", "rolled_back");
  }
  throw createAltanaGrantClaimStoreError("DATABASE_PREWRITE_FAILED", "not_attempted");
}

/**
 * Creates one module-owned app pool and binds readiness only from its own exact
 * verifier Result. Configuration is explicit; this function never reads env.
 */
export function createAltanaGrantClaimPostgresServer(
  unparsedConfiguration: AltanaGrantClaimPostgresConnectionConfiguration
): AltanaGrantClaimPostgresServer {
  assertServerRuntime();
  const configuration = parseConfiguration(unparsedConfiguration);
  if (configuration === null) {
    throw new AltanaGrantClaimPostgresServerError("CONFIGURATION_INVALID");
  }
  if (configuration.runtime === "production" && configuration.tls.mode !== "verify-full") {
    throw new AltanaGrantClaimPostgresServerError("TLS_VERIFICATION_REQUIRED");
  }

  let unparsedPool: unknown;
  try {
    unparsedPool = new Pool(buildPoolConfiguration(configuration));
  } catch {
    throw new AltanaGrantClaimPostgresServerError("POOL_INITIALIZATION_FAILED");
  }
  const pool = parsePool(unparsedPool);
  if (pool === null) {
    closeUnknownPool(unparsedPool);
    throw new AltanaGrantClaimPostgresServerError("POOL_BOUNDARY_INVALID");
  }

  let closed = false;
  let closePromise: Promise<AltanaGrantClaimPostgresCloseResult> | null = null;
  let destroyActiveVerification: (() => void) | null = null;
  let verificationPromise: Promise<AltanaGrantClaimPostgresReadiness> | null = null;
  const idleErrorListener = (): void => clearCapability(pool.source);
  try {
    pool.on.call(pool.source, "error", idleErrorListener);
  } catch {
    closeUnknownPool(pool.source);
    throw new AltanaGrantClaimPostgresServerError("POOL_INITIALIZATION_FAILED");
  }

  const verifyReadiness = (): Promise<AltanaGrantClaimPostgresReadiness> => {
    assertServerRuntime();
    if (closed) return Promise.resolve(CLOSED_READINESS);
    if (verificationPromise !== null) return verificationPromise;
    verificationPromise = (async () => {
      const acquirePromise = callMethod(pool.connect, pool.source);
      const acquired = await bounded(
        acquirePromise,
        ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.acquireMs
      );
      if (acquired.status === "timeout") {
        void acquirePromise.then(
          (lateClient) => destroyUnknownVerificationClient(lateClient),
          () => undefined
        );
        clearCapability(pool.source);
        return closed ? CLOSED_READINESS : VERIFY_TIMEOUT;
      }
      if (acquired.status === "rejected") {
        clearCapability(pool.source);
        return closed ? CLOSED_READINESS : DATABASE_UNAVAILABLE;
      }
      const client = parseVerificationClient(acquired.value);
      if (client === null) {
        destroyUnknownVerificationClient(acquired.value);
        clearCapability(pool.source);
        return closed ? CLOSED_READINESS : DATABASE_UNAVAILABLE;
      }
      let released = false;
      const release = (shouldDestroy: boolean): void => {
        if (released) return;
        released = true;
        if (destroyActiveVerification === destroyClient) destroyActiveVerification = null;
        releaseVerificationClient(client, shouldDestroy);
      };
      const destroyClient = (): void => release(true);
      destroyActiveVerification = destroyClient;
      if (closed) {
        destroyClient();
        clearCapability(pool.source);
        return CLOSED_READINESS;
      }
      const queryPromise = callMethod(
        client.query,
        client.source,
        ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL,
        [...ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_PARAMETERS]
      );
      const outcome = await bounded(queryPromise, ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.verifyMs);
      if (closed) {
        destroyClient();
        clearCapability(pool.source);
        return CLOSED_READINESS;
      }
      if (outcome.status === "timeout") {
        void queryPromise.catch(() => undefined);
        destroyClient();
        clearCapability(pool.source);
        return VERIFY_TIMEOUT;
      }
      if (outcome.status === "rejected") {
        destroyClient();
        clearCapability(pool.source);
        return DATABASE_UNAVAILABLE;
      }
      const projection = projectAltanaGrantClaimSchemaNodePostgresResult(outcome.value);
      const verification =
        projection === null ? null : interpretAltanaGrantClaimSchemaProjection(projection);
      release(projection === null || verification === null);
      if (verification === null) {
        clearCapability(pool.source);
        return DATABASE_UNAVAILABLE;
      }
      if (verification.status === "ready") bindCapability(pool.source, verification);
      else clearCapability(pool.source);
      return verification;
    })().finally(() => {
      verificationPromise = null;
    });
    return verificationPromise;
  };

  const claimSubmission = async (
    unparsedClaim: AltanaGrantSubmissionClaim
  ): Promise<AltanaGrantClaimResult> => {
    assertServerRuntime();
    const claim = parseAltanaGrantSubmissionClaim(unparsedClaim);
    if (claim === null) throw createAltanaGrantClaimStoreError("CLAIM_INVALID", "not_attempted");
    if (closed) throw createAltanaGrantClaimStoreError("SCHEMA_NOT_READY", "not_attempted");
    const capability = freshCapability(pool.source);
    if (capability === null) {
      throw createAltanaGrantClaimStoreError("SCHEMA_NOT_READY", "not_attempted");
    }
    try {
      const result = await executeAltanaGrantClaimPostgresTransaction(
        pool.source,
        capability.deploymentId,
        claim
      );
      if (!isAuthenticAltanaGrantClaimResult(result)) {
        throw createAltanaGrantClaimStoreError("DATABASE_RESULT_INVALID", "committed_unusable");
      }
      return result;
    } catch (error) {
      if (error instanceof AltanaGrantClaimTransactionError) return mapTransactionError(error);
      throw error;
    }
  };

  const close = (): Promise<AltanaGrantClaimPostgresCloseResult> => {
    assertServerRuntime();
    if (closePromise !== null) return closePromise;
    closed = true;
    clearCapability(pool.source);
    destroyActiveVerification?.();
    destroyActiveVerification = null;
    closePromise = (async () => {
      const endPromise = callMethod(pool.end, pool.source);
      const outcome = await bounded(endPromise, ALTANA_GRANT_CLAIM_POSTGRES_TIMEOUTS.closeMs);
      return outcome.status === "fulfilled" ? CLOSED_RESULT : CLOSE_UNKNOWN_RESULT;
    })();
    return closePromise;
  };

  return Object.freeze({ claimSubmission, close, verifyReadiness });
}
