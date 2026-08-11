import {
  altanaLpReservationReceiptSchema,
  altanaLpReservationRequestSchema,
  type AltanaLpDurableReservationDependency,
  type AltanaLpReservationReceipt,
  type AltanaLpReservationRequest
} from "./altana-lp-handoff";

const SCHEMA_NAME = "proofera_activation";
const TABLE_NAME = `${SCHEMA_NAME}.altana_lp_reservations`;
const MUTATION_FUNCTION_NAME = `${SCHEMA_NAME}.reject_altana_lp_reservation_mutation`;
export const ALTANA_LP_RESERVATION_OWNER_ROLE = "proofera_activation_owner";
export const ALTANA_LP_RESERVATION_APP_ROLE = "proofera_activation_app";
export const ALTANA_LP_RESERVATION_MIGRATION_VERSION = 1;
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

/**
 * Versioned PostgreSQL migration for the append-only Altana LP ledger.
 *
 * Timestamps intentionally remain text so the receipt preserves the exact
 * JSON-safe ISO strings that were hashed and reviewed. The casts are used only
 * by the ordering constraint. Expiry never releases an ID for reuse.
 *
 * The owner and application roles must be provisioned separately. This
 * migration deliberately fails if either role or any target object is absent
 * or already exists; it is never an application-startup `IF NOT EXISTS` path.
 * The application role receives only schema USAGE plus table INSERT/SELECT.
 */
export const ALTANA_LP_RESERVATION_POSTGRES_DDL = `
BEGIN;

SELECT pg_advisory_xact_lock(726009991, ${ALTANA_LP_RESERVATION_MIGRATION_VERSION});

DO $proofera_roles$
BEGIN
  IF to_regrole('${ALTANA_LP_RESERVATION_OWNER_ROLE}') IS NULL THEN
    RAISE EXCEPTION 'Required ProofEra activation owner role is absent' USING ERRCODE = '42704';
  END IF;
  IF to_regrole('${ALTANA_LP_RESERVATION_APP_ROLE}') IS NULL THEN
    RAISE EXCEPTION 'Required ProofEra activation application role is absent' USING ERRCODE = '42704';
  END IF;
END;
$proofera_roles$;

CREATE SCHEMA ${SCHEMA_NAME} AUTHORIZATION ${ALTANA_LP_RESERVATION_OWNER_ROLE};
REVOKE ALL ON SCHEMA ${SCHEMA_NAME} FROM PUBLIC;
GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO ${ALTANA_LP_RESERVATION_APP_ROLE};

CREATE TABLE ${TABLE_NAME} (
  schema_version SMALLINT NOT NULL CHECK (schema_version = 2),
  reservation_id TEXT COLLATE "C" PRIMARY KEY
    CHECK (reservation_id ~ '^0x[0-9a-f]{64}$' AND reservation_id <> '${ZERO_BYTES32}'),
  context_id TEXT COLLATE "C" NOT NULL UNIQUE
    CHECK (context_id ~ '^0x[0-9a-f]{64}$' AND context_id <> '${ZERO_BYTES32}'),
  quote_id TEXT COLLATE "C" NOT NULL UNIQUE
    CHECK (quote_id ~ '^0x[0-9a-f]{64}$' AND quote_id <> '${ZERO_BYTES32}'),
  user_id TEXT COLLATE "C" NOT NULL
    CHECK (char_length(user_id) BETWEEN 1 AND 160)
    CHECK (user_id ~ '^[A-Za-z0-9][A-Za-z0-9:._@/-]*$'),
  policy_hash TEXT COLLATE "C" NOT NULL
    CHECK (policy_hash ~ '^0x[0-9a-f]{64}$' AND policy_hash <> '${ZERO_BYTES32}'),
  write_target_chain_id SMALLINT NOT NULL CHECK (write_target_chain_id = 97),
  write_target_address TEXT COLLATE "C" NOT NULL
    CHECK (write_target_address ~ '^0x[0-9a-f]{40}$' AND write_target_address <> '0x0000000000000000000000000000000000000000'),
  write_target_runtime_code_hash TEXT COLLATE "C" NOT NULL
    CHECK (write_target_runtime_code_hash ~ '^0x[0-9a-f]{64}$' AND write_target_runtime_code_hash <> '${ZERO_BYTES32}'),
  write_target_block_number TEXT COLLATE "C" NOT NULL
    CHECK (char_length(write_target_block_number) BETWEEN 1 AND 78)
    CHECK (write_target_block_number ~ '^[1-9][0-9]*$'),
  write_target_block_hash TEXT COLLATE "C" NOT NULL
    CHECK (write_target_block_hash ~ '^0x[0-9a-f]{64}$' AND write_target_block_hash <> '${ZERO_BYTES32}'),
  write_target_review_id TEXT COLLATE "C" NOT NULL
    CHECK (write_target_review_id ~ '^0x[0-9a-f]{64}$' AND write_target_review_id <> '${ZERO_BYTES32}'),
  write_target_proxy_kind TEXT COLLATE "C" NOT NULL CHECK (write_target_proxy_kind = 'none'),
  consumed_at TEXT COLLATE "C" NOT NULL
    CHECK (char_length(consumed_at) = 24)
    CHECK (consumed_at ~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$'),
  expires_at TEXT COLLATE "C" NOT NULL
    CHECK (char_length(expires_at) = 24)
    CHECK (expires_at ~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT proofera_altana_lp_reservation_window
    CHECK (
      expires_at::timestamptz >= consumed_at::timestamptz + INTERVAL '30 seconds'
      AND expires_at::timestamptz <= consumed_at::timestamptz + INTERVAL '10 minutes'
    )
);

ALTER TABLE ${TABLE_NAME} OWNER TO ${ALTANA_LP_RESERVATION_OWNER_ROLE};
REVOKE ALL ON TABLE ${TABLE_NAME} FROM PUBLIC;
REVOKE ALL ON TABLE ${TABLE_NAME} FROM ${ALTANA_LP_RESERVATION_APP_ROLE};
GRANT SELECT, INSERT ON TABLE ${TABLE_NAME} TO ${ALTANA_LP_RESERVATION_APP_ROLE};

CREATE FUNCTION ${MUTATION_FUNCTION_NAME}()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'ProofEra Altana LP reservations are append-only'
    USING ERRCODE = '55000';
END;
$$;

ALTER FUNCTION ${MUTATION_FUNCTION_NAME}() OWNER TO ${ALTANA_LP_RESERVATION_OWNER_ROLE};
REVOKE ALL ON FUNCTION ${MUTATION_FUNCTION_NAME}() FROM PUBLIC;
REVOKE ALL ON FUNCTION ${MUTATION_FUNCTION_NAME}() FROM ${ALTANA_LP_RESERVATION_APP_ROLE};

CREATE TRIGGER proofera_altana_lp_reservations_append_only
BEFORE UPDATE OR DELETE ON ${TABLE_NAME}
FOR EACH ROW
EXECUTE FUNCTION ${MUTATION_FUNCTION_NAME}();

CREATE TRIGGER proofera_altana_lp_reservations_reject_truncate
BEFORE TRUNCATE ON ${TABLE_NAME}
FOR EACH STATEMENT
EXECUTE FUNCTION ${MUTATION_FUNCTION_NAME}();

COMMIT;
`.trim();

export const ALTANA_LP_RESERVATION_INSERT_SQL = `
INSERT INTO ${TABLE_NAME} (
  schema_version,
  reservation_id,
  context_id,
  quote_id,
  user_id,
  policy_hash,
  write_target_chain_id,
  write_target_address,
  write_target_runtime_code_hash,
  write_target_block_number,
  write_target_block_hash,
  write_target_review_id,
  write_target_proxy_kind,
  consumed_at,
  expires_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
ON CONFLICT DO NOTHING
RETURNING
  schema_version AS "schemaVersion",
  reservation_id AS "reservationId",
  context_id AS "contextId",
  quote_id AS "quoteId",
  user_id AS "userId",
  policy_hash AS "policyHash",
  jsonb_build_object(
    'chainId', write_target_chain_id,
    'address', write_target_address,
    'runtimeCodeHash', write_target_runtime_code_hash,
    'canonicalBlockNumber', write_target_block_number,
    'canonicalBlockHash', write_target_block_hash,
    'reviewId', write_target_review_id,
    'proxyKind', write_target_proxy_kind
  ) AS "writeTargetBinding",
  consumed_at AS "consumedAt",
  expires_at AS "expiresAt",
  'consumed'::text AS state
`.trim();

export const ALTANA_LP_RESERVATION_CONFLICT_READ_SQL = `
SELECT
  schema_version AS "schemaVersion",
  reservation_id AS "reservationId",
  context_id AS "contextId",
  quote_id AS "quoteId",
  user_id AS "userId",
  policy_hash AS "policyHash",
  jsonb_build_object(
    'chainId', write_target_chain_id,
    'address', write_target_address,
    'runtimeCodeHash', write_target_runtime_code_hash,
    'canonicalBlockNumber', write_target_block_number,
    'canonicalBlockHash', write_target_block_hash,
    'reviewId', write_target_review_id,
    'proxyKind', write_target_proxy_kind
  ) AS "writeTargetBinding",
  consumed_at AS "consumedAt",
  expires_at AS "expiresAt",
  'consumed'::text AS state
FROM ${TABLE_NAME}
WHERE reservation_id = $1 OR context_id = $2 OR quote_id = $3
ORDER BY reservation_id ASC
`.trim();

export const ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS = Object.freeze({
  isolationLevel: "read committed" as const,
  readOnly: false as const,
  retry: "never" as const
});

export type AltanaLpReservationPostgresParameter = string | number;

export interface AltanaLpReservationPostgresQueryResult {
  readonly rows: readonly unknown[];
  readonly rowCount: number | null;
}

export interface AltanaLpReservationPostgresTransaction {
  readonly query: (
    statement: string,
    parameters: readonly AltanaLpReservationPostgresParameter[]
  ) => Promise<AltanaLpReservationPostgresQueryResult>;
}

/**
 * A deliberately small boundary around a PostgreSQL transaction helper.
 *
 * The implementation must use a real PostgreSQL READ COMMITTED, read/write
 * transaction, roll back when `operation` throws, and never retry after a
 * commit/connection error. READ COMMITTED is important: after INSERT waits on
 * a concurrent unique-key claimant, the following SELECT must receive a fresh
 * statement snapshot and observe that winner.
 */
export interface AltanaLpReservationPostgresDatabase {
  readonly transaction: <Result>(
    options: Readonly<typeof ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS>,
    operation: (transaction: AltanaLpReservationPostgresTransaction) => Promise<Result>
  ) => Promise<Result>;
}

export type AltanaLpReservationStoreErrorCode =
  | "CLOCK_INVALID"
  | "DATABASE_DEPENDENCY_INVALID"
  | "DATABASE_OUTCOME_UNKNOWN"
  | "DATABASE_RESULT_INVALID"
  | "REQUEST_INVALID"
  | "RESERVATION_CONFLICT"
  | "RESERVATION_EXPIRED"
  | "SERVER_RUNTIME_REQUIRED";

export type AltanaLpReservationOutcome =
  "not_attempted" | "rolled_back" | "committed_unusable" | "unknown";

const ERROR_MESSAGES: Readonly<Record<AltanaLpReservationStoreErrorCode, string>> = Object.freeze({
  CLOCK_INVALID: "The server reservation clock returned an invalid instant.",
  DATABASE_DEPENDENCY_INVALID: "A PostgreSQL transaction boundary is required.",
  DATABASE_OUTCOME_UNKNOWN:
    "The durable reservation outcome is unknown; reconcile the exact IDs before retrying.",
  DATABASE_RESULT_INVALID: "The reservation database returned an invalid result.",
  REQUEST_INVALID: "The reservation request is not strict, complete, and JSON-safe.",
  RESERVATION_CONFLICT: "The reservation context, quote, or reservation ID is already bound.",
  RESERVATION_EXPIRED: "The reservation receipt window has expired.",
  SERVER_RUNTIME_REQUIRED: "The PostgreSQL reservation store is server-only."
});

/** Safe operational error: it deliberately does not retain the database error. */
export class AltanaLpReservationStoreError extends Error {
  override readonly name = "AltanaLpReservationStoreError";
  readonly code: AltanaLpReservationStoreErrorCode;
  readonly reservationOutcome: AltanaLpReservationOutcome;

  constructor(
    code: AltanaLpReservationStoreErrorCode,
    reservationOutcome: AltanaLpReservationOutcome = "not_attempted"
  ) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
    this.reservationOutcome = reservationOutcome;
  }
}

export interface CreatePostgresAltanaLpReservationDependencyOptions {
  readonly database: AltanaLpReservationPostgresDatabase;
  readonly now?: () => Date;
}

const REQUEST_KEYS = [
  "consumedAt",
  "contextId",
  "expiresAt",
  "policyHash",
  "quoteId",
  "reservationId",
  "schemaVersion",
  "userId",
  "writeTargetBinding"
] as const;

const WRITE_TARGET_BINDING_KEYS = [
  "address",
  "canonicalBlockHash",
  "canonicalBlockNumber",
  "chainId",
  "proxyKind",
  "reviewId",
  "runtimeCodeHash"
] as const;

function snapshotPlainWriteTargetBinding(input: unknown): unknown | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const actualKeys = Object.keys(descriptors).sort();
  if (
    actualKeys.length !== WRITE_TARGET_BINDING_KEYS.length ||
    actualKeys.some((key, index) => key !== WRITE_TARGET_BINDING_KEYS[index])
  ) {
    return null;
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of WRITE_TARGET_BINDING_KEYS) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) return null;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function parsePlainRequest(input: unknown): AltanaLpReservationRequest | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return null;

  const descriptors = Object.getOwnPropertyDescriptors(input);
  const actualKeys = Object.keys(descriptors).sort();
  if (
    actualKeys.length !== REQUEST_KEYS.length ||
    actualKeys.some((key, index) => key !== REQUEST_KEYS[index])
  ) {
    return null;
  }

  const values: Record<string, unknown> = {};
  for (const key of REQUEST_KEYS) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) return null;
    values[key] =
      key === "writeTargetBinding"
        ? snapshotPlainWriteTargetBinding(descriptor.value)
        : descriptor.value;
  }
  if (values.writeTargetBinding === null) return null;
  const parsed = altanaLpReservationRequestSchema.safeParse(values);
  return parsed.success ? parsed.data : null;
}

function queryRows(result: unknown): readonly unknown[] | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(result);
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
  if (
    rowCountDescriptor.value !== null &&
    rowCountDescriptor.value !== rowsDescriptor.value.length
  ) {
    return null;
  }
  return rowsDescriptor.value as readonly unknown[];
}

function parseReceiptRow(row: unknown): AltanaLpReservationReceipt | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const prototype = Object.getPrototypeOf(row);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(row).some((key) => typeof key === "symbol")) return null;

  const descriptors = Object.getOwnPropertyDescriptors(row);
  const expectedKeys = [...REQUEST_KEYS, "state"].sort();
  const actualKeys = Object.keys(descriptors).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return null;
  }

  const values: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) return null;
    values[key] =
      key === "writeTargetBinding"
        ? snapshotPlainWriteTargetBinding(descriptor.value)
        : descriptor.value;
  }
  if (values.writeTargetBinding === null) return null;
  const parsed = altanaLpReservationReceiptSchema.safeParse(values);
  return parsed.success ? parsed.data : null;
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function isExactReceipt(
  receipt: AltanaLpReservationReceipt,
  request: AltanaLpReservationRequest
): boolean {
  return (
    receipt.state === "consumed" &&
    receipt.schemaVersion === request.schemaVersion &&
    receipt.reservationId === request.reservationId &&
    receipt.contextId === request.contextId &&
    receipt.quoteId === request.quoteId &&
    receipt.userId === request.userId &&
    receipt.policyHash === request.policyHash &&
    receipt.writeTargetBinding.chainId === request.writeTargetBinding.chainId &&
    receipt.writeTargetBinding.address === request.writeTargetBinding.address &&
    receipt.writeTargetBinding.runtimeCodeHash === request.writeTargetBinding.runtimeCodeHash &&
    receipt.writeTargetBinding.canonicalBlockNumber ===
      request.writeTargetBinding.canonicalBlockNumber &&
    receipt.writeTargetBinding.canonicalBlockHash ===
      request.writeTargetBinding.canonicalBlockHash &&
    receipt.writeTargetBinding.reviewId === request.writeTargetBinding.reviewId &&
    receipt.writeTargetBinding.proxyKind === request.writeTargetBinding.proxyKind &&
    receipt.consumedAt === request.consumedAt &&
    receipt.expiresAt === request.expiresAt
  );
}

function readNow(now: () => Date): number {
  let milliseconds: number;
  try {
    const value = now();
    milliseconds =
      value instanceof Date && Object.getPrototypeOf(value) === Date.prototype
        ? Date.prototype.getTime.call(value)
        : Number.NaN;
  } catch {
    throw new AltanaLpReservationStoreError("CLOCK_INVALID");
  }
  if (!Number.isFinite(milliseconds)) throw new AltanaLpReservationStoreError("CLOCK_INVALID");
  return milliseconds;
}

function reservationOutcomeFromError(error: unknown): AltanaLpReservationOutcome {
  if (typeof error !== "object" || error === null || Array.isArray(error)) return "unknown";
  const descriptor = Object.getOwnPropertyDescriptor(error, "reservationOutcome");
  if (descriptor === undefined || !("value" in descriptor)) return "unknown";
  return descriptor.value === "not_attempted" ||
    descriptor.value === "rolled_back" ||
    descriptor.value === "committed_unusable" ||
    descriptor.value === "unknown"
    ? descriptor.value
    : "unknown";
}

function assertFresh(request: AltanaLpReservationRequest, nowMilliseconds: number): void {
  const consumedAt = Date.parse(request.consumedAt);
  const expiresAt = Date.parse(request.expiresAt);
  if (!Number.isFinite(consumedAt) || !Number.isFinite(expiresAt) || expiresAt <= consumedAt) {
    throw new AltanaLpReservationStoreError("REQUEST_INVALID");
  }
  if (expiresAt <= nowMilliseconds) {
    throw new AltanaLpReservationStoreError("RESERVATION_EXPIRED");
  }
}

function receiptFromSingleRow(rows: readonly unknown[]): AltanaLpReservationReceipt {
  if (rows.length !== 1) {
    throw new AltanaLpReservationStoreError("DATABASE_RESULT_INVALID");
  }
  const receipt = parseReceiptRow(rows[0]);
  if (receipt === null) {
    throw new AltanaLpReservationStoreError("DATABASE_RESULT_INVALID");
  }
  return receipt;
}

function isDatabaseBoundary(input: unknown): input is AltanaLpReservationPostgresDatabase {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(input, "transaction");
  return (
    descriptor !== undefined && "value" in descriptor && typeof descriptor.value === "function"
  );
}

/**
 * Creates the server-only dependency consumed by `buildAltanaLpBootstrapRequest`.
 *
 * There is intentionally no automatic retry. If PostgreSQL reports a network
 * or commit error, callers receive DATABASE_OUTCOME_UNKNOWN and must reconcile
 * by calling again with the exact immutable request; a different binding will
 * conflict on at least one unique ID.
 */
export function createPostgresAltanaLpReservationDependency(
  options: CreatePostgresAltanaLpReservationDependencyOptions
): AltanaLpDurableReservationDependency {
  if (typeof window !== "undefined" && typeof window.document !== "undefined") {
    throw new AltanaLpReservationStoreError("SERVER_RUNTIME_REQUIRED");
  }
  if (!isDatabaseBoundary(options.database)) {
    throw new AltanaLpReservationStoreError("DATABASE_DEPENDENCY_INVALID");
  }
  const now = options.now ?? (() => new Date());

  return Object.freeze({
    consumeOrRead: async (unparsedRequest: Readonly<AltanaLpReservationRequest>) => {
      let request: AltanaLpReservationRequest | null;
      try {
        request = parsePlainRequest(unparsedRequest);
      } catch {
        request = null;
      }
      if (request === null) throw new AltanaLpReservationStoreError("REQUEST_INVALID");

      assertFresh(request, readNow(now));
      const insertParameters = [
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
      ] as const;

      let receipt: AltanaLpReservationReceipt;
      try {
        receipt = await options.database.transaction(
          ALTANA_LP_RESERVATION_TRANSACTION_OPTIONS,
          async (transaction) => {
            const insertResult = await transaction.query(
              ALTANA_LP_RESERVATION_INSERT_SQL,
              insertParameters
            );
            const insertedRows = queryRows(insertResult);
            if (insertedRows === null || insertedRows.length > 1) {
              throw new AltanaLpReservationStoreError("DATABASE_RESULT_INVALID");
            }

            let receipt: AltanaLpReservationReceipt;
            if (insertedRows.length === 1) {
              receipt = receiptFromSingleRow(insertedRows);
              if (!isExactReceipt(receipt, request)) {
                throw new AltanaLpReservationStoreError("DATABASE_RESULT_INVALID");
              }
            } else {
              const conflictResult = await transaction.query(
                ALTANA_LP_RESERVATION_CONFLICT_READ_SQL,
                [request.reservationId, request.contextId, request.quoteId]
              );
              const conflictRows = queryRows(conflictResult);
              if (conflictRows === null || conflictRows.length === 0) {
                throw new AltanaLpReservationStoreError("DATABASE_RESULT_INVALID");
              }

              const receipts = conflictRows.map((row) => parseReceiptRow(row));
              const onlyReceipt = receipts[0];
              if (
                receipts.length !== 1 ||
                onlyReceipt === undefined ||
                onlyReceipt === null ||
                !isExactReceipt(onlyReceipt, request)
              ) {
                throw new AltanaLpReservationStoreError("RESERVATION_CONFLICT");
              }
              receipt = onlyReceipt;
            }

            assertFresh(request, readNow(now));
            return deepFreeze(receipt);
          }
        );
      } catch (error) {
        if (error instanceof AltanaLpReservationStoreError) {
          throw new AltanaLpReservationStoreError(error.code, "rolled_back");
        }
        const reservationOutcome = reservationOutcomeFromError(error);
        throw new AltanaLpReservationStoreError("DATABASE_OUTCOME_UNKNOWN", reservationOutcome);
      }

      // The transaction helper resolves only after an acknowledged COMMIT.
      // Recheck outside its catch so expiry/clock failure is explicitly a
      // committed-but-unusable tombstone, never an ambiguous or ready result.
      try {
        assertFresh(request, readNow(now));
      } catch (error) {
        const code = error instanceof AltanaLpReservationStoreError ? error.code : "CLOCK_INVALID";
        throw new AltanaLpReservationStoreError(code, "committed_unusable");
      }
      return receipt;
    }
  });
}
