import "server-only";

import { createHash } from "node:crypto";

export const ALTANA_GRANT_CLAIM_MIGRATION_VERSION = 1 as const;
export const ALTANA_GRANT_CLAIM_DOMAIN_SCHEMA_VERSION = 1 as const;
export const ALTANA_GRANT_CLAIM_SUPPORTED_POSTGRES_MAJOR = 17 as const;
export const ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE = "proofera_grant_claim_owner";
export const ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE = "proofera_grant_claim_app";
export const ALTANA_GRANT_CLAIM_CAPABILITY_TTL_MS = 300_000 as const;

/** SHA-256 of the exact UTF-8/LF migration artifact. Updated only by review. */
export const ALTANA_GRANT_CLAIM_MIGRATION_ARTIFACT_SHA256 =
  "fced0c471135a969a726eb1e2233c9b18976c0a2d66377fa40a9d52a552d17cb";

/** SHA-256 of the independent canonical expectation document below. */
export const ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256 =
  "fc81399172bf962fe4d0b017d58846a3651ca5ccd850004e20d280ebdad9639a";

type JsonScalar = boolean | number | string | null;
type CanonicalRow = Readonly<Record<string, JsonScalar | readonly JsonScalar[]>>;

const NAMESPACE_INVENTORY: readonly CanonicalRow[] = Object.freeze([
  { kind: "function", name: "reject_submission_claim_mutation" },
  { kind: "index", name: "proofera_grant_claim_receipt_pkey" },
  { kind: "index", name: "proofera_grant_claims_bootstrap_binding_hash_key" },
  { kind: "index", name: "proofera_grant_claims_idempotency_key_key" },
  { kind: "index", name: "proofera_grant_claims_pkey" },
  { kind: "index", name: "proofera_grant_claims_submission_binding_hash_key" },
  { kind: "table", name: "schema_receipt" },
  { kind: "table", name: "submission_claims" },
  { kind: "type:array", name: "_schema_receipt" },
  { kind: "type:array", name: "_submission_claims" },
  { kind: "type:composite", name: "schema_receipt" },
  { kind: "type:composite", name: "submission_claims" }
]);

const RELATIONS: readonly CanonicalRow[] = Object.freeze([
  {
    accessMethod: "heap",
    forceRowSecurity: false,
    hasIndex: true,
    hasRules: false,
    hasSubclasses: false,
    hasTriggers: true,
    kind: "r",
    name: "schema_receipt",
    options: null,
    partitionBound: null,
    partitioned: false,
    persistence: "p",
    replicaIdentity: "d",
    rowSecurity: false,
    tablespace: null
  },
  {
    accessMethod: "heap",
    forceRowSecurity: false,
    hasIndex: true,
    hasRules: false,
    hasSubclasses: false,
    hasTriggers: true,
    kind: "r",
    name: "submission_claims",
    options: null,
    partitionBound: null,
    partitioned: false,
    persistence: "p",
    replicaIdentity: "d",
    rowSecurity: false,
    tablespace: null
  }
]);

const COLUMNS: readonly CanonicalRow[] = Object.freeze([
  {
    collation: null,
    default: null,
    generated: "",
    identity: "",
    name: "migration_version",
    notNull: true,
    ordinal: 1,
    relation: "schema_receipt",
    type: "smallint"
  },
  {
    collation: null,
    default: null,
    generated: "",
    identity: "",
    name: "domain_schema_version",
    notNull: true,
    ordinal: 2,
    relation: "schema_receipt",
    type: "smallint"
  },
  {
    collation: null,
    default: null,
    generated: "",
    identity: "",
    name: "postgres_major",
    notNull: true,
    ordinal: 3,
    relation: "schema_receipt",
    type: "smallint"
  },
  {
    collation: "pg_catalog.C",
    default: null,
    generated: "",
    identity: "",
    name: "semantic_contract_sha256",
    notNull: true,
    ordinal: 4,
    relation: "schema_receipt",
    type: "text"
  },
  {
    collation: null,
    default: null,
    generated: "",
    identity: "",
    name: "deployment_id",
    notNull: true,
    ordinal: 5,
    relation: "schema_receipt",
    type: "uuid"
  },
  {
    collation: null,
    default: "statement_timestamp()",
    generated: "",
    identity: "",
    name: "applied_at",
    notNull: true,
    ordinal: 6,
    relation: "schema_receipt",
    type: "timestamp with time zone"
  },
  {
    collation: null,
    default: null,
    generated: "",
    identity: "",
    name: "schema_version",
    notNull: true,
    ordinal: 1,
    relation: "submission_claims",
    type: "smallint"
  },
  {
    collation: "pg_catalog.C",
    default: null,
    generated: "",
    identity: "",
    name: "bootstrap_id",
    notNull: true,
    ordinal: 2,
    relation: "submission_claims",
    type: "text"
  },
  {
    collation: "pg_catalog.C",
    default: null,
    generated: "",
    identity: "",
    name: "idempotency_key",
    notNull: true,
    ordinal: 3,
    relation: "submission_claims",
    type: "text"
  },
  {
    collation: "pg_catalog.C",
    default: null,
    generated: "",
    identity: "",
    name: "bootstrap_binding_hash",
    notNull: true,
    ordinal: 4,
    relation: "submission_claims",
    type: "text"
  },
  {
    collation: "pg_catalog.C",
    default: null,
    generated: "",
    identity: "",
    name: "submission_binding_hash",
    notNull: true,
    ordinal: 5,
    relation: "submission_claims",
    type: "text"
  },
  {
    collation: "pg_catalog.C",
    default: null,
    generated: "",
    identity: "",
    name: "prior_status",
    notNull: true,
    ordinal: 6,
    relation: "submission_claims",
    type: "text"
  },
  {
    collation: "pg_catalog.C",
    default: null,
    generated: "",
    identity: "",
    name: "next_status",
    notNull: true,
    ordinal: 7,
    relation: "submission_claims",
    type: "text"
  },
  {
    collation: null,
    default: null,
    generated: "",
    identity: "",
    name: "grant_submitted_at",
    notNull: true,
    ordinal: 8,
    relation: "submission_claims",
    type: "bigint"
  },
  {
    collation: null,
    default: "clock_timestamp()",
    generated: "",
    identity: "",
    name: "created_at",
    notNull: true,
    ordinal: 9,
    relation: "submission_claims",
    type: "timestamp with time zone"
  }
]);

const UNSORTED_CONSTRAINTS: readonly CanonicalRow[] = Object.freeze([
  {
    columns: ["deployment_id"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((deployment_id <> '00000000-0000-0000-0000-000000000000'::uuid))",
    name: "proofera_grant_claim_receipt_deployment_id_check",
    relation: "schema_receipt",
    type: "c",
    validated: true
  },
  {
    columns: ["domain_schema_version"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((domain_schema_version = 1))",
    name: "proofera_grant_claim_receipt_domain_check",
    relation: "schema_receipt",
    type: "c",
    validated: true
  },
  {
    columns: ["migration_version"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((migration_version = 1))",
    name: "proofera_grant_claim_receipt_migration_check",
    relation: "schema_receipt",
    type: "c",
    validated: true
  },
  {
    columns: ["migration_version"],
    deferred: false,
    deferrable: false,
    definition: "PRIMARY KEY (migration_version)",
    name: "proofera_grant_claim_receipt_pkey",
    relation: "schema_receipt",
    type: "p",
    validated: true
  },
  {
    columns: ["postgres_major"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((postgres_major = 17))",
    name: "proofera_grant_claim_receipt_postgres_check",
    relation: "schema_receipt",
    type: "c",
    validated: true
  },
  {
    columns: ["semantic_contract_sha256"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((semantic_contract_sha256 ~ '^[0-9a-f]{64}$'::text))",
    name: "proofera_grant_claim_receipt_semantic_hash_check",
    relation: "schema_receipt",
    type: "c",
    validated: true
  },
  {
    columns: ["bootstrap_binding_hash"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((bootstrap_binding_hash ~ '^0x[0-9a-f]{64}$'::text))",
    name: "proofera_grant_claims_bootstrap_binding_hash_format_check",
    relation: "submission_claims",
    type: "c",
    validated: true
  },
  {
    columns: ["bootstrap_binding_hash"],
    deferred: false,
    deferrable: false,
    definition: "UNIQUE (bootstrap_binding_hash)",
    name: "proofera_grant_claims_bootstrap_binding_hash_key",
    relation: "submission_claims",
    type: "u",
    validated: true
  },
  {
    columns: ["bootstrap_id"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((bootstrap_id ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]*$'::text))",
    name: "proofera_grant_claims_bootstrap_id_format_check",
    relation: "submission_claims",
    type: "c",
    validated: true
  },
  {
    columns: ["bootstrap_id"],
    deferred: false,
    deferrable: false,
    definition: "CHECK (((char_length(bootstrap_id) >= 1) AND (char_length(bootstrap_id) <= 128)))",
    name: "proofera_grant_claims_bootstrap_id_length_check",
    relation: "submission_claims",
    type: "c",
    validated: true
  },
  {
    columns: ["grant_submitted_at"],
    deferred: false,
    deferrable: false,
    definition:
      "CHECK (((grant_submitted_at >= 0) AND (grant_submitted_at <= '9007199254740991'::bigint)))",
    name: "proofera_grant_claims_submitted_at_check",
    relation: "submission_claims",
    type: "c",
    validated: true
  },
  {
    columns: ["idempotency_key"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((idempotency_key ~ '^0x[0-9a-f]{64}$'::text))",
    name: "proofera_grant_claims_idempotency_key_format_check",
    relation: "submission_claims",
    type: "c",
    validated: true
  },
  {
    columns: ["idempotency_key"],
    deferred: false,
    deferrable: false,
    definition: "UNIQUE (idempotency_key)",
    name: "proofera_grant_claims_idempotency_key_key",
    relation: "submission_claims",
    type: "u",
    validated: true
  },
  {
    columns: ["next_status"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((next_status = 'grant_submitting'::text))",
    name: "proofera_grant_claims_next_status_check",
    relation: "submission_claims",
    type: "c",
    validated: true
  },
  {
    columns: ["bootstrap_id"],
    deferred: false,
    deferrable: false,
    definition: "PRIMARY KEY (bootstrap_id)",
    name: "proofera_grant_claims_pkey",
    relation: "submission_claims",
    type: "p",
    validated: true
  },
  {
    columns: ["prior_status"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((prior_status = 'grant_ready'::text))",
    name: "proofera_grant_claims_prior_status_check",
    relation: "submission_claims",
    type: "c",
    validated: true
  },
  {
    columns: ["schema_version"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((schema_version = 1))",
    name: "proofera_grant_claims_schema_version_check",
    relation: "submission_claims",
    type: "c",
    validated: true
  },
  {
    columns: ["submission_binding_hash"],
    deferred: false,
    deferrable: false,
    definition: "CHECK ((submission_binding_hash ~ '^0x[0-9a-f]{64}$'::text))",
    name: "proofera_grant_claims_submission_binding_hash_format_check",
    relation: "submission_claims",
    type: "c",
    validated: true
  },
  {
    columns: ["submission_binding_hash"],
    deferred: false,
    deferrable: false,
    definition: "UNIQUE (submission_binding_hash)",
    name: "proofera_grant_claims_submission_binding_hash_key",
    relation: "submission_claims",
    type: "u",
    validated: true
  }
]);

const CONSTRAINTS: readonly CanonicalRow[] = Object.freeze(
  [...UNSORTED_CONSTRAINTS].sort((left, right) => {
    const leftKey = `${String(left.relation)}\0${String(left.name)}`;
    const rightKey = `${String(right.relation)}\0${String(right.name)}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  })
);

const INDEXES: readonly CanonicalRow[] = Object.freeze([
  {
    accessMethod: "btree",
    checkXmin: false,
    clustered: false,
    collations: [null],
    collationDeterministic: [null],
    collationEncodings: [null],
    collationProviders: [null],
    columns: ["migration_version"],
    exclusion: false,
    expressions: false,
    immediate: true,
    keyCount: 1,
    live: true,
    name: "proofera_grant_claim_receipt_pkey",
    nullsNotDistinct: false,
    opclassDefaults: [true],
    opclassInputTypes: ["smallint"],
    opclasses: ["pg_catalog.int2_ops"],
    options: [0],
    predicate: false,
    primary: true,
    ready: true,
    relation: "schema_receipt",
    replicaIdentity: false,
    totalColumns: 1,
    unique: true,
    valid: true
  },
  {
    accessMethod: "btree",
    checkXmin: false,
    clustered: false,
    collations: ["pg_catalog.C"],
    collationDeterministic: [true],
    collationEncodings: [-1],
    collationProviders: ["c"],
    columns: ["bootstrap_binding_hash"],
    exclusion: false,
    expressions: false,
    immediate: true,
    keyCount: 1,
    live: true,
    name: "proofera_grant_claims_bootstrap_binding_hash_key",
    nullsNotDistinct: false,
    opclassDefaults: [true],
    opclassInputTypes: ["text"],
    opclasses: ["pg_catalog.text_ops"],
    options: [0],
    predicate: false,
    primary: false,
    ready: true,
    relation: "submission_claims",
    replicaIdentity: false,
    totalColumns: 1,
    unique: true,
    valid: true
  },
  {
    accessMethod: "btree",
    checkXmin: false,
    clustered: false,
    collations: ["pg_catalog.C"],
    collationDeterministic: [true],
    collationEncodings: [-1],
    collationProviders: ["c"],
    columns: ["idempotency_key"],
    exclusion: false,
    expressions: false,
    immediate: true,
    keyCount: 1,
    live: true,
    name: "proofera_grant_claims_idempotency_key_key",
    nullsNotDistinct: false,
    opclassDefaults: [true],
    opclassInputTypes: ["text"],
    opclasses: ["pg_catalog.text_ops"],
    options: [0],
    predicate: false,
    primary: false,
    ready: true,
    relation: "submission_claims",
    replicaIdentity: false,
    totalColumns: 1,
    unique: true,
    valid: true
  },
  {
    accessMethod: "btree",
    checkXmin: false,
    clustered: false,
    collations: ["pg_catalog.C"],
    collationDeterministic: [true],
    collationEncodings: [-1],
    collationProviders: ["c"],
    columns: ["bootstrap_id"],
    exclusion: false,
    expressions: false,
    immediate: true,
    keyCount: 1,
    live: true,
    name: "proofera_grant_claims_pkey",
    nullsNotDistinct: false,
    opclassDefaults: [true],
    opclassInputTypes: ["text"],
    opclasses: ["pg_catalog.text_ops"],
    options: [0],
    predicate: false,
    primary: true,
    ready: true,
    relation: "submission_claims",
    replicaIdentity: false,
    totalColumns: 1,
    unique: true,
    valid: true
  },
  {
    accessMethod: "btree",
    checkXmin: false,
    clustered: false,
    collations: ["pg_catalog.C"],
    collationDeterministic: [true],
    collationEncodings: [-1],
    collationProviders: ["c"],
    columns: ["submission_binding_hash"],
    exclusion: false,
    expressions: false,
    immediate: true,
    keyCount: 1,
    live: true,
    name: "proofera_grant_claims_submission_binding_hash_key",
    nullsNotDistinct: false,
    opclassDefaults: [true],
    opclassInputTypes: ["text"],
    opclasses: ["pg_catalog.text_ops"],
    options: [0],
    predicate: false,
    primary: false,
    ready: true,
    relation: "submission_claims",
    replicaIdentity: false,
    totalColumns: 1,
    unique: true,
    valid: true
  }
]);

const FUNCTIONS: readonly CanonicalRow[] = Object.freeze([
  {
    arguments: "",
    body: "BEGIN\n  RAISE EXCEPTION 'ProofEra Altana grant-claim records are append-only'\n    USING ERRCODE = '55000';\nEND;",
    configuration: ["search_path=pg_catalog, pg_temp"],
    argumentCount: 0,
    kind: "f",
    language: "plpgsql",
    leakproof: false,
    name: "reject_submission_claim_mutation",
    parallel: "u",
    result: "trigger",
    returnsSet: false,
    securityDefiner: false,
    strict: false,
    volatility: "v"
  }
]);

const TRIGGERS: readonly CanonicalRow[] = Object.freeze([
  {
    argumentsHex: "",
    columns: "",
    constraint: false,
    definition:
      "CREATE TRIGGER proofera_grant_claim_receipt_append_only BEFORE DELETE OR UPDATE ON proofera_altana_grant_claim.schema_receipt FOR EACH ROW EXECUTE FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation()",
    enabled: "O",
    events: "DELETE,UPDATE",
    function: "proofera_altana_grant_claim.reject_submission_claim_mutation()",
    name: "proofera_grant_claim_receipt_append_only",
    relation: "schema_receipt",
    newTransitionTable: null,
    oldTransitionTable: null,
    row: true,
    timing: "BEFORE",
    when: null
  },
  {
    argumentsHex: "",
    columns: "",
    constraint: false,
    definition:
      "CREATE TRIGGER proofera_grant_claim_receipt_reject_truncate BEFORE TRUNCATE ON proofera_altana_grant_claim.schema_receipt FOR EACH STATEMENT EXECUTE FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation()",
    enabled: "O",
    events: "TRUNCATE",
    function: "proofera_altana_grant_claim.reject_submission_claim_mutation()",
    name: "proofera_grant_claim_receipt_reject_truncate",
    relation: "schema_receipt",
    newTransitionTable: null,
    oldTransitionTable: null,
    row: false,
    timing: "BEFORE",
    when: null
  },
  {
    argumentsHex: "",
    columns: "",
    constraint: false,
    definition:
      "CREATE TRIGGER proofera_grant_claims_append_only BEFORE DELETE OR UPDATE ON proofera_altana_grant_claim.submission_claims FOR EACH ROW EXECUTE FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation()",
    enabled: "O",
    events: "DELETE,UPDATE",
    function: "proofera_altana_grant_claim.reject_submission_claim_mutation()",
    name: "proofera_grant_claims_append_only",
    relation: "submission_claims",
    newTransitionTable: null,
    oldTransitionTable: null,
    row: true,
    timing: "BEFORE",
    when: null
  },
  {
    argumentsHex: "",
    columns: "",
    constraint: false,
    definition:
      "CREATE TRIGGER proofera_grant_claims_reject_truncate BEFORE TRUNCATE ON proofera_altana_grant_claim.submission_claims FOR EACH STATEMENT EXECUTE FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation()",
    enabled: "O",
    events: "TRUNCATE",
    function: "proofera_altana_grant_claim.reject_submission_claim_mutation()",
    name: "proofera_grant_claims_reject_truncate",
    relation: "submission_claims",
    newTransitionTable: null,
    oldTransitionTable: null,
    row: false,
    timing: "BEFORE",
    when: null
  }
]);

function ownerTablePrivileges(relation: string): CanonicalRow[] {
  return [
    "DELETE",
    "INSERT",
    "MAINTAIN",
    "REFERENCES",
    "SELECT",
    "TRIGGER",
    "TRUNCATE",
    "UPDATE"
  ].map((privilege) => ({
    grantable: false,
    grantee: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    identity: relation,
    kind: "table",
    privilege
  }));
}

const UNSORTED_ACLS: readonly CanonicalRow[] = Object.freeze([
  {
    grantable: false,
    grantee: ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
    grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    identity: "current_database",
    kind: "database",
    privilege: "CONNECT"
  },
  ...["CONNECT", "CREATE", "TEMPORARY"].map((privilege) => ({
    grantable: false,
    grantee: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    identity: "current_database",
    kind: "database",
    privilege
  })),
  {
    grantable: false,
    grantee: ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
    grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    identity: "proofera_altana_grant_claim",
    kind: "schema",
    privilege: "USAGE"
  },
  {
    grantable: false,
    grantee: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    identity: "proofera_altana_grant_claim",
    kind: "schema",
    privilege: "CREATE"
  },
  {
    grantable: false,
    grantee: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    identity: "proofera_altana_grant_claim",
    kind: "schema",
    privilege: "USAGE"
  },
  ...ownerTablePrivileges("schema_receipt"),
  ...[
    "deployment_id",
    "domain_schema_version",
    "migration_version",
    "postgres_major",
    "semantic_contract_sha256"
  ].map((column) => ({
    grantable: false,
    grantee: ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
    grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    identity: `schema_receipt.${column}`,
    kind: "column",
    privilege: "SELECT"
  })),
  {
    grantable: false,
    grantee: ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
    grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    identity: "submission_claims",
    kind: "table",
    privilege: "INSERT"
  },
  {
    grantable: false,
    grantee: ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
    grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    identity: "submission_claims",
    kind: "table",
    privilege: "SELECT"
  },
  ...ownerTablePrivileges("submission_claims"),
  {
    grantable: false,
    grantee: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    grantor: ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
    identity: "reject_submission_claim_mutation()",
    kind: "function",
    privilege: "EXECUTE"
  }
]);

const ACLS: readonly CanonicalRow[] = Object.freeze(
  [...UNSORTED_ACLS].sort((left, right) => {
    const leftKey = [
      left.kind,
      left.identity,
      left.grantor,
      left.grantee,
      left.privilege,
      left.grantable
    ].join("\0");
    const rightKey = [
      right.kind,
      right.identity,
      right.grantor,
      right.grantee,
      right.privilege,
      right.grantable
    ].join("\0");
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  })
);

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

export const ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS = Object.freeze({
  acls: canonicalJson(ACLS),
  columns: canonicalJson(COLUMNS),
  constraints: canonicalJson(CONSTRAINTS),
  functions: canonicalJson(FUNCTIONS),
  inheritance: canonicalJson([]),
  indexes: canonicalJson(INDEXES),
  namespaceInventory: canonicalJson(NAMESPACE_INVENTORY),
  relations: canonicalJson(RELATIONS),
  triggers: canonicalJson(TRIGGERS)
});

const CANONICAL_SEMANTIC_DOCUMENT = canonicalJson({
  domainSchemaVersion: ALTANA_GRANT_CLAIM_DOMAIN_SCHEMA_VERSION,
  postgresMajor: ALTANA_GRANT_CLAIM_SUPPORTED_POSTGRES_MAJOR,
  ...ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export const ALTANA_GRANT_CLAIM_COMPUTED_SEMANTIC_CONTRACT_SHA256 = sha256(
  CANONICAL_SEMANTIC_DOCUMENT
);

/** Exact byte check for the separately reviewed UTF-8/LF migration artifact. */
export function isReviewedAltanaGrantClaimMigrationArtifact(input: unknown): boolean {
  return (
    typeof input === "string" &&
    !input.includes("\r") &&
    sha256(input) === ALTANA_GRANT_CLAIM_MIGRATION_ARTIFACT_SHA256
  );
}

/**
 * PostgreSQL 17 catalog verification against independent canonical JSON.
 * The migration never writes these observed catalog snapshots or their hash.
 */
export const ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL = `
WITH target_database AS (
  SELECT database_item.oid, database_item.datacl, database_item.datdba,
    database_item.datallowconn, database_item.datistemplate
  FROM pg_catalog.pg_database AS database_item
  WHERE database_item.datname = pg_catalog.current_database()
),
target_schema AS (
  SELECT namespace_item.oid, namespace_item.nspacl, namespace_item.nspowner
  FROM pg_catalog.pg_namespace AS namespace_item
  WHERE namespace_item.nspname = 'proofera_altana_grant_claim'
),
target_relations AS (
  SELECT relation.oid, relation.relname, relation.relowner, relation.relacl,
    relation.relpersistence, relation.relreplident, relation.relrowsecurity,
    relation.relforcerowsecurity, relation.relkind, relation.relam,
    relation.relhasindex, relation.relhasrules, relation.relhastriggers,
    relation.relhassubclass, relation.relispartition, relation.relpartbound,
    relation.reloptions, relation.reltablespace, access_method.amname,
    tablespace.spcname
  FROM pg_catalog.pg_class AS relation
  JOIN target_schema AS namespace_item ON namespace_item.oid = relation.relnamespace
  LEFT JOIN pg_catalog.pg_am AS access_method ON access_method.oid = relation.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace ON tablespace.oid = relation.reltablespace
  WHERE relation.relkind = 'r'
),
target_function AS (
  SELECT function_item.oid, function_item.proname, function_item.proowner,
    function_item.proacl, function_item.proconfig, function_item.prosrc,
    function_item.prosecdef, function_item.proleakproof, function_item.proisstrict,
    function_item.provolatile, function_item.proparallel, function_item.prokind,
    function_item.proretset, function_item.pronargs, language.lanname
  FROM pg_catalog.pg_proc AS function_item
  JOIN target_schema AS namespace_item ON namespace_item.oid = function_item.pronamespace
  JOIN pg_catalog.pg_language AS language ON language.oid = function_item.prolang
),
namespace_snapshot AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    entry.value ORDER BY entry.kind COLLATE pg_catalog."C",
      entry.name COLLATE pg_catalog."C"
  ), '[]'::jsonb) AS value
  FROM (
    SELECT CASE relation.relkind
        WHEN 'r' THEN 'table'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'c' THEN 'composite_relation'
        WHEN 'f' THEN 'foreign_table'
        WHEN 'p' THEN 'partitioned_table'
        WHEN 'I' THEN 'partitioned_index'
        ELSE 'other_relation'
      END AS kind,
      relation.relname AS name,
      pg_catalog.jsonb_build_object(
        'kind', CASE relation.relkind
          WHEN 'r' THEN 'table'
          WHEN 'i' THEN 'index'
          WHEN 'S' THEN 'sequence'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized_view'
          WHEN 'c' THEN 'composite_relation'
          WHEN 'f' THEN 'foreign_table'
          WHEN 'p' THEN 'partitioned_table'
          WHEN 'I' THEN 'partitioned_index'
          ELSE 'other_relation'
        END,
        'name', relation.relname
      ) AS value
    FROM pg_catalog.pg_class AS relation
    JOIN target_schema AS namespace_item ON namespace_item.oid = relation.relnamespace
    UNION ALL
    SELECT 'function', function_item.proname,
      pg_catalog.jsonb_build_object('kind', 'function', 'name', function_item.proname)
    FROM target_function AS function_item
    UNION ALL
    SELECT CASE type_item.typtype
        WHEN 'c' THEN 'type:composite'
        WHEN 'b' THEN CASE WHEN type_item.typelem <> 0 THEN 'type:array' ELSE 'type:base' END
        WHEN 'd' THEN 'type:domain'
        WHEN 'e' THEN 'type:enum'
        WHEN 'r' THEN 'type:range'
        WHEN 'm' THEN 'type:multirange'
        ELSE 'type:other'
      END,
      type_item.typname,
      pg_catalog.jsonb_build_object(
        'kind', CASE type_item.typtype
          WHEN 'c' THEN 'type:composite'
          WHEN 'b' THEN CASE WHEN type_item.typelem <> 0 THEN 'type:array' ELSE 'type:base' END
          WHEN 'd' THEN 'type:domain'
          WHEN 'e' THEN 'type:enum'
          WHEN 'r' THEN 'type:range'
          WHEN 'm' THEN 'type:multirange'
          ELSE 'type:other'
        END,
        'name', type_item.typname
      )
    FROM pg_catalog.pg_type AS type_item
    JOIN target_schema AS namespace_item ON namespace_item.oid = type_item.typnamespace
    UNION ALL
    SELECT 'collation', collation_item.collname,
      pg_catalog.jsonb_build_object('kind', 'collation', 'name', collation_item.collname)
    FROM pg_catalog.pg_collation AS collation_item
    JOIN target_schema AS namespace_item ON namespace_item.oid = collation_item.collnamespace
    UNION ALL
    SELECT 'operator', operator_item.oprname,
      pg_catalog.jsonb_build_object('kind', 'operator', 'name', operator_item.oprname)
    FROM pg_catalog.pg_operator AS operator_item
    JOIN target_schema AS namespace_item ON namespace_item.oid = operator_item.oprnamespace
    UNION ALL
    SELECT 'operator_class', operator_class.opcname,
      pg_catalog.jsonb_build_object('kind', 'operator_class', 'name', operator_class.opcname)
    FROM pg_catalog.pg_opclass AS operator_class
    JOIN target_schema AS namespace_item ON namespace_item.oid = operator_class.opcnamespace
    UNION ALL
    SELECT 'operator_family', operator_family.opfname,
      pg_catalog.jsonb_build_object('kind', 'operator_family', 'name', operator_family.opfname)
    FROM pg_catalog.pg_opfamily AS operator_family
    JOIN target_schema AS namespace_item ON namespace_item.oid = operator_family.opfnamespace
    UNION ALL
    SELECT 'conversion', conversion_item.conname,
      pg_catalog.jsonb_build_object('kind', 'conversion', 'name', conversion_item.conname)
    FROM pg_catalog.pg_conversion AS conversion_item
    JOIN target_schema AS namespace_item ON namespace_item.oid = conversion_item.connamespace
    UNION ALL
    SELECT 'text_search_configuration', configuration.cfgname,
      pg_catalog.jsonb_build_object(
        'kind', 'text_search_configuration', 'name', configuration.cfgname
      )
    FROM pg_catalog.pg_ts_config AS configuration
    JOIN target_schema AS namespace_item ON namespace_item.oid = configuration.cfgnamespace
    UNION ALL
    SELECT 'text_search_dictionary', dictionary.dictname,
      pg_catalog.jsonb_build_object('kind', 'text_search_dictionary', 'name', dictionary.dictname)
    FROM pg_catalog.pg_ts_dict AS dictionary
    JOIN target_schema AS namespace_item ON namespace_item.oid = dictionary.dictnamespace
    UNION ALL
    SELECT 'text_search_parser', parser.prsname,
      pg_catalog.jsonb_build_object('kind', 'text_search_parser', 'name', parser.prsname)
    FROM pg_catalog.pg_ts_parser AS parser
    JOIN target_schema AS namespace_item ON namespace_item.oid = parser.prsnamespace
    UNION ALL
    SELECT 'text_search_template', template.tmplname,
      pg_catalog.jsonb_build_object('kind', 'text_search_template', 'name', template.tmplname)
    FROM pg_catalog.pg_ts_template AS template
    JOIN target_schema AS namespace_item ON namespace_item.oid = template.tmplnamespace
  ) AS entry
),
relations_snapshot AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'name', relation.relname,
      'kind', relation.relkind,
      'accessMethod', relation.amname,
      'persistence', relation.relpersistence,
      'replicaIdentity', relation.relreplident,
      'rowSecurity', relation.relrowsecurity,
      'forceRowSecurity', relation.relforcerowsecurity,
      'hasIndex', relation.relhasindex,
      'hasRules', relation.relhasrules,
      'hasTriggers', relation.relhastriggers,
      'hasSubclasses', relation.relhassubclass,
      'partitioned', relation.relispartition,
      'partitionBound', pg_catalog.pg_get_expr(relation.relpartbound, relation.oid, false),
      'options', pg_catalog.to_jsonb(relation.reloptions),
      'tablespace', relation.spcname
    ) ORDER BY relation.relname COLLATE pg_catalog."C"
  ), '[]'::jsonb) AS value
  FROM target_relations AS relation
),
columns_snapshot AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'relation', relation.relname,
      'ordinal', attribute.attnum,
      'name', attribute.attname,
      'type', pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
      'notNull', attribute.attnotnull,
      'identity', attribute.attidentity,
      'generated', attribute.attgenerated,
      'collation', CASE WHEN attribute.attcollation = 0 THEN NULL
        ELSE collation_namespace.nspname || '.' || collation_item.collname END,
      'default', pg_catalog.pg_get_expr(default_item.adbin, default_item.adrelid, false)
    ) ORDER BY relation.relname COLLATE pg_catalog."C", attribute.attnum
  ), '[]'::jsonb) AS value
  FROM target_relations AS relation
  JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
  LEFT JOIN pg_catalog.pg_attrdef AS default_item
    ON default_item.adrelid = attribute.attrelid AND default_item.adnum = attribute.attnum
  LEFT JOIN pg_catalog.pg_collation AS collation_item
    ON collation_item.oid = attribute.attcollation
  LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
    ON collation_namespace.oid = collation_item.collnamespace
  WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
),
constraints_snapshot AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'relation', relation.relname,
      'name', constraint_item.conname,
      'type', constraint_item.contype,
      'deferrable', constraint_item.condeferrable,
      'deferred', constraint_item.condeferred,
      'validated', constraint_item.convalidated,
      'columns', COALESCE((
        SELECT pg_catalog.jsonb_agg(attribute.attname ORDER BY key_item.ordinality)
        FROM pg_catalog.unnest(constraint_item.conkey)
          WITH ORDINALITY AS key_item(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = relation.oid AND attribute.attnum = key_item.attnum
      ), '[]'::jsonb),
      'definition', pg_catalog.pg_get_constraintdef(constraint_item.oid, false)
    ) ORDER BY relation.relname COLLATE pg_catalog."C",
      constraint_item.conname COLLATE pg_catalog."C"
  ), '[]'::jsonb) AS value
  FROM target_relations AS relation
  JOIN pg_catalog.pg_constraint AS constraint_item ON constraint_item.conrelid = relation.oid
),
indexes_snapshot AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'relation', relation.relname,
      'name', index_relation.relname,
      'accessMethod', access_method.amname,
      'primary', index_item.indisprimary,
      'unique', index_item.indisunique,
      'nullsNotDistinct', index_item.indnullsnotdistinct,
      'exclusion', index_item.indisexclusion,
      'immediate', index_item.indimmediate,
      'clustered', index_item.indisclustered,
      'replicaIdentity', index_item.indisreplident,
      'valid', index_item.indisvalid,
      'ready', index_item.indisready,
      'checkXmin', index_item.indcheckxmin,
      'live', index_item.indislive,
      'keyCount', index_item.indnkeyatts,
      'totalColumns', index_item.indnatts,
      'expressions', index_item.indexprs IS NOT NULL,
      'predicate', index_item.indpred IS NOT NULL,
      'columns', COALESCE((
        SELECT pg_catalog.jsonb_agg(attribute.attname ORDER BY key_item.ordinality)
        FROM pg_catalog.unnest(index_item.indkey::smallint[])
          WITH ORDINALITY AS key_item(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = relation.oid AND attribute.attnum = key_item.attnum
        WHERE key_item.ordinality <= index_item.indnkeyatts
      ), '[]'::jsonb),
      'opclasses', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          opclass_namespace.nspname || '.' || opclass.opcname ORDER BY key_item.ordinality
        )
        FROM pg_catalog.unnest(index_item.indclass::oid[])
          WITH ORDINALITY AS key_item(opclass_oid, ordinality)
        JOIN pg_catalog.pg_opclass AS opclass ON opclass.oid = key_item.opclass_oid
        JOIN pg_catalog.pg_namespace AS opclass_namespace
          ON opclass_namespace.oid = opclass.opcnamespace
        WHERE key_item.ordinality <= index_item.indnkeyatts
      ), '[]'::jsonb),
      'opclassDefaults', COALESCE((
        SELECT pg_catalog.jsonb_agg(opclass.opcdefault ORDER BY key_item.ordinality)
        FROM pg_catalog.unnest(index_item.indclass::oid[])
          WITH ORDINALITY AS key_item(opclass_oid, ordinality)
        JOIN pg_catalog.pg_opclass AS opclass ON opclass.oid = key_item.opclass_oid
        WHERE key_item.ordinality <= index_item.indnkeyatts
      ), '[]'::jsonb),
      'opclassInputTypes', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.format_type(opclass.opcintype, NULL) ORDER BY key_item.ordinality
        )
        FROM pg_catalog.unnest(index_item.indclass::oid[])
          WITH ORDINALITY AS key_item(opclass_oid, ordinality)
        JOIN pg_catalog.pg_opclass AS opclass ON opclass.oid = key_item.opclass_oid
        WHERE key_item.ordinality <= index_item.indnkeyatts
      ), '[]'::jsonb),
      'collations', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          CASE WHEN key_item.collation_oid = 0 THEN NULL
            ELSE collation_namespace.nspname || '.' || collation_item.collname END
          ORDER BY key_item.ordinality
        )
        FROM pg_catalog.unnest(index_item.indcollation::oid[])
          WITH ORDINALITY AS key_item(collation_oid, ordinality)
        LEFT JOIN pg_catalog.pg_collation AS collation_item
          ON collation_item.oid = key_item.collation_oid
        LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
          ON collation_namespace.oid = collation_item.collnamespace
        WHERE key_item.ordinality <= index_item.indnkeyatts
      ), '[]'::jsonb),
      'collationProviders', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          CASE WHEN key_item.collation_oid = 0 THEN NULL ELSE collation_item.collprovider END
          ORDER BY key_item.ordinality
        )
        FROM pg_catalog.unnest(index_item.indcollation::oid[])
          WITH ORDINALITY AS key_item(collation_oid, ordinality)
        LEFT JOIN pg_catalog.pg_collation AS collation_item
          ON collation_item.oid = key_item.collation_oid
        WHERE key_item.ordinality <= index_item.indnkeyatts
      ), '[]'::jsonb),
      'collationDeterministic', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          CASE WHEN key_item.collation_oid = 0 THEN NULL ELSE collation_item.collisdeterministic END
          ORDER BY key_item.ordinality
        )
        FROM pg_catalog.unnest(index_item.indcollation::oid[])
          WITH ORDINALITY AS key_item(collation_oid, ordinality)
        LEFT JOIN pg_catalog.pg_collation AS collation_item
          ON collation_item.oid = key_item.collation_oid
        WHERE key_item.ordinality <= index_item.indnkeyatts
      ), '[]'::jsonb),
      'collationEncodings', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          CASE WHEN key_item.collation_oid = 0 THEN NULL ELSE collation_item.collencoding END
          ORDER BY key_item.ordinality
        )
        FROM pg_catalog.unnest(index_item.indcollation::oid[])
          WITH ORDINALITY AS key_item(collation_oid, ordinality)
        LEFT JOIN pg_catalog.pg_collation AS collation_item
          ON collation_item.oid = key_item.collation_oid
        WHERE key_item.ordinality <= index_item.indnkeyatts
      ), '[]'::jsonb),
      'options', COALESCE((
        SELECT pg_catalog.jsonb_agg(key_item.option_value ORDER BY key_item.ordinality)
        FROM pg_catalog.unnest(index_item.indoption::smallint[])
          WITH ORDINALITY AS key_item(option_value, ordinality)
        WHERE key_item.ordinality <= index_item.indnkeyatts
      ), '[]'::jsonb)
    ) ORDER BY relation.relname COLLATE pg_catalog."C",
      index_relation.relname COLLATE pg_catalog."C"
  ), '[]'::jsonb) AS value
  FROM target_relations AS relation
  JOIN pg_catalog.pg_index AS index_item ON index_item.indrelid = relation.oid
  JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_item.indexrelid
  JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
),
functions_snapshot AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'name', function_item.proname,
      'kind', function_item.prokind,
      'argumentCount', function_item.pronargs,
      'arguments', pg_catalog.pg_get_function_identity_arguments(function_item.oid),
      'result', pg_catalog.pg_get_function_result(function_item.oid),
      'returnsSet', function_item.proretset,
      'language', function_item.lanname,
      'volatility', function_item.provolatile,
      'parallel', function_item.proparallel,
      'strict', function_item.proisstrict,
      'leakproof', function_item.proleakproof,
      'securityDefiner', function_item.prosecdef,
      'configuration', pg_catalog.to_jsonb(function_item.proconfig),
      'body', pg_catalog.btrim(function_item.prosrc, E' \n\r\t')
    ) ORDER BY function_item.proname COLLATE pg_catalog."C"
  ), '[]'::jsonb) AS value
  FROM target_function AS function_item
),
triggers_snapshot AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'relation', relation.relname,
      'name', trigger_item.tgname,
      'enabled', trigger_item.tgenabled,
      'constraint', trigger_item.tgconstraint <> 0,
      'argumentsHex', pg_catalog.encode(trigger_item.tgargs, 'hex'),
      'columns', trigger_item.tgattr::text,
      'definition', pg_catalog.pg_get_triggerdef(trigger_item.oid, false),
      'when', pg_catalog.pg_get_expr(trigger_item.tgqual, trigger_item.tgrelid, false),
      'oldTransitionTable', trigger_item.tgoldtable,
      'newTransitionTable', trigger_item.tgnewtable,
      'row', (trigger_item.tgtype & 1) = 1,
      'timing', CASE WHEN (trigger_item.tgtype & 2) = 2 THEN 'BEFORE' ELSE 'OTHER' END,
      'events', pg_catalog.concat_ws(',',
        CASE WHEN (trigger_item.tgtype & 8) = 8 THEN 'DELETE' END,
        CASE WHEN (trigger_item.tgtype & 4) = 4 THEN 'INSERT' END,
        CASE WHEN (trigger_item.tgtype & 32) = 32 THEN 'TRUNCATE' END,
        CASE WHEN (trigger_item.tgtype & 16) = 16 THEN 'UPDATE' END
      ),
      'function', function_namespace.nspname || '.' || function_item.proname || '(' ||
        pg_catalog.pg_get_function_identity_arguments(function_item.oid) || ')'
    ) ORDER BY relation.relname COLLATE pg_catalog."C",
      trigger_item.tgname COLLATE pg_catalog."C"
  ), '[]'::jsonb) AS value
  FROM target_relations AS relation
  JOIN pg_catalog.pg_trigger AS trigger_item ON trigger_item.tgrelid = relation.oid
  JOIN pg_catalog.pg_proc AS function_item ON function_item.oid = trigger_item.tgfoid
  JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_item.pronamespace
  WHERE NOT trigger_item.tgisinternal
),
inheritance_snapshot AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'child', child.relname,
      'parent', parent_namespace.nspname || '.' || parent.relname,
      'sequence', inheritance.inhseqno
    ) ORDER BY child.relname COLLATE pg_catalog."C", inheritance.inhseqno
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_inherits AS inheritance
  JOIN target_relations AS child ON child.oid = inheritance.inhrelid
  JOIN pg_catalog.pg_class AS parent ON parent.oid = inheritance.inhparent
  JOIN pg_catalog.pg_namespace AS parent_namespace ON parent_namespace.oid = parent.relnamespace
),
acl_rows AS (
  SELECT 'database'::text AS kind, 'current_database'::text AS identity,
    acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
  FROM target_database AS database_item
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(database_item.datacl, pg_catalog.acldefault('d', database_item.datdba))
  ) AS acl
  UNION ALL
  SELECT 'schema'::text, 'proofera_altana_grant_claim'::text,
    acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
  FROM target_schema AS namespace_item
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(namespace_item.nspacl, pg_catalog.acldefault('n', namespace_item.nspowner))
  ) AS acl
  UNION ALL
  SELECT 'table', relation.relname, acl.grantor, acl.grantee,
    acl.privilege_type, acl.is_grantable
  FROM target_relations AS relation
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) AS acl
  UNION ALL
  SELECT 'column', relation.relname || '.' || attribute.attname,
    acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
  FROM target_relations AS relation
  JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
  WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
  UNION ALL
  SELECT 'function', function_item.proname || '(' ||
    pg_catalog.pg_get_function_identity_arguments(function_item.oid) || ')',
    acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
  FROM target_function AS function_item
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(function_item.proacl, pg_catalog.acldefault('f', function_item.proowner))
  ) AS acl
),
acls_snapshot AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'kind', acl.kind,
      'identity', acl.identity,
      'grantor', CASE WHEN acl.grantor = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantor) END,
      'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee) END,
      'privilege', acl.privilege_type,
      'grantable', acl.is_grantable
    ) ORDER BY acl.kind COLLATE pg_catalog."C", acl.identity COLLATE pg_catalog."C",
      (CASE WHEN acl.grantor = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantor) END) COLLATE pg_catalog."C",
      (CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee) END) COLLATE pg_catalog."C",
      acl.privilege_type COLLATE pg_catalog."C", acl.is_grantable
  ), '[]'::jsonb) AS value
  FROM acl_rows AS acl
),
platform_state AS (
  SELECT pg_catalog.current_setting('server_version_num')::integer >= ($3 * 10000)
    AND pg_catalog.current_setting('server_version_num')::integer < (($3 + 1) * 10000)
    AND pg_catalog.current_setting('server_encoding') = 'UTF8' AS value
),
actor_state AS (
  SELECT current_user = $6
    AND session_user = $6
    AND current_user = session_user
    AND pg_catalog.current_setting('is_superuser') = 'off' AS value
),
role_state AS (
  SELECT COALESCE(
    owner_role.oid IS NOT NULL AND app_role.oid IS NOT NULL
    AND owner_role.oid <> app_role.oid
    AND NOT owner_role.rolsuper AND NOT owner_role.rolinherit
    AND NOT owner_role.rolcreaterole AND NOT owner_role.rolcreatedb
    AND NOT owner_role.rolcanlogin AND NOT owner_role.rolreplication
    AND NOT owner_role.rolbypassrls AND owner_role.rolconnlimit = -1
    AND owner_role.rolvaliduntil IS NULL AND owner_role.rolconfig IS NULL
    AND NOT app_role.rolsuper AND NOT app_role.rolinherit
    AND NOT app_role.rolcreaterole AND NOT app_role.rolcreatedb
    AND app_role.rolcanlogin AND NOT app_role.rolreplication
    AND NOT app_role.rolbypassrls AND app_role.rolconnlimit = -1
    AND app_role.rolvaliduntil IS NULL AND app_role.rolconfig IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member IN (owner_role.oid, app_role.oid)
        OR membership.roleid IN (owner_role.oid, app_role.oid)
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_default_acl AS default_acl
      WHERE default_acl.defaclrole IN (owner_role.oid, app_role.oid)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_db_role_setting AS role_setting
      CROSS JOIN target_database AS database_item
      WHERE role_setting.setrole IN (owner_role.oid, app_role.oid)
        OR role_setting.setdatabase = database_item.oid
    ), false
  ) AS value
  FROM (VALUES (true)) AS seed(present)
  LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.rolname = $5
  LEFT JOIN pg_catalog.pg_roles AS app_role ON app_role.rolname = $6
),
ownership_state AS (
  SELECT COALESCE(
    (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(pg_catalog.pg_get_userbyid(datdba) = $5)
      AND pg_catalog.bool_and(datallowconn)
      AND pg_catalog.bool_and(NOT datistemplate)
      FROM target_database)
    AND (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(pg_catalog.pg_get_userbyid(nspowner) = $5)
      FROM target_schema)
    AND (SELECT pg_catalog.count(*) = 2
      AND pg_catalog.bool_and(pg_catalog.pg_get_userbyid(relowner) = $5)
      FROM target_relations)
    AND (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(pg_catalog.pg_get_userbyid(proowner) = $5)
      FROM target_function), false
  ) AS value
),
authorization_state AS (
  SELECT COALESCE(
    pg_catalog.has_database_privilege($6, pg_catalog.current_database(), 'CONNECT') IS TRUE
    AND pg_catalog.has_database_privilege($6, pg_catalog.current_database(), 'CREATE') IS FALSE
    AND pg_catalog.has_database_privilege($6, pg_catalog.current_database(), 'TEMPORARY') IS FALSE
    AND pg_catalog.has_schema_privilege($6, 'proofera_altana_grant_claim', 'USAGE') IS TRUE
    AND pg_catalog.has_schema_privilege($6, 'proofera_altana_grant_claim', 'CREATE') IS FALSE
    AND pg_catalog.has_table_privilege(
      $6, 'proofera_altana_grant_claim.submission_claims', 'SELECT'
    ) IS TRUE
    AND pg_catalog.has_table_privilege(
      $6, 'proofera_altana_grant_claim.submission_claims', 'INSERT'
    ) IS TRUE
    AND pg_catalog.has_table_privilege(
      $6, 'proofera_altana_grant_claim.submission_claims',
      'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
    ) IS FALSE
    AND pg_catalog.has_table_privilege(
      $6, 'proofera_altana_grant_claim.schema_receipt',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
    ) IS FALSE
    AND pg_catalog.has_column_privilege(
      $6, 'proofera_altana_grant_claim.schema_receipt', 'migration_version', 'SELECT'
    ) IS TRUE
    AND pg_catalog.has_column_privilege(
      $6, 'proofera_altana_grant_claim.schema_receipt', 'domain_schema_version', 'SELECT'
    ) IS TRUE
    AND pg_catalog.has_column_privilege(
      $6, 'proofera_altana_grant_claim.schema_receipt', 'postgres_major', 'SELECT'
    ) IS TRUE
    AND pg_catalog.has_column_privilege(
      $6, 'proofera_altana_grant_claim.schema_receipt', 'semantic_contract_sha256', 'SELECT'
    ) IS TRUE
    AND pg_catalog.has_column_privilege(
      $6, 'proofera_altana_grant_claim.schema_receipt', 'deployment_id', 'SELECT'
    ) IS TRUE
    AND pg_catalog.has_column_privilege(
      $6, 'proofera_altana_grant_claim.schema_receipt', 'applied_at', 'SELECT'
    ) IS FALSE
    AND pg_catalog.has_function_privilege(
      $6, 'proofera_altana_grant_claim.reject_submission_claim_mutation()', 'EXECUTE'
    ) IS FALSE,
    false
  ) AS value
),
absence_state AS (
  SELECT NOT EXISTS (
    SELECT 1 FROM target_relations AS relation
    JOIN pg_catalog.pg_policy AS policy ON policy.polrelid = relation.oid
  ) AND NOT EXISTS (
    SELECT 1 FROM target_relations AS relation
    JOIN pg_catalog.pg_rewrite AS rule_item ON rule_item.ev_class = relation.oid
  ) AS value
),
receipt_state AS (
  SELECT pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(migration_version = $1)
    AND pg_catalog.bool_and(domain_schema_version = $2)
    AND pg_catalog.bool_and(postgres_major = $3)
    AND pg_catalog.bool_and(semantic_contract_sha256 = $4)
    AND pg_catalog.bool_and(
      deployment_id <> '00000000-0000-0000-0000-000000000000'::uuid
    ) AS value,
    CASE WHEN pg_catalog.count(*) = 1
      THEN pg_catalog.max(deployment_id::text) ELSE NULL END AS deployment_id
  FROM proofera_altana_grant_claim.schema_receipt
)
SELECT
  actor_state.value AS "actorAuthorized",
  platform_state.value AS "platformSupported",
  role_state.value AS "rolesSafe",
  ownership_state.value AS "ownershipOk",
  authorization_state.value AS "authorizationSurfaceOk",
  absence_state.value AS "policiesAndRulesAbsent",
  receipt_state.value AS "semanticReceiptOk",
  namespace_snapshot.value = $7::jsonb AS "namespaceInventoryOk",
  relations_snapshot.value = $8::jsonb AS "relationsOk",
  columns_snapshot.value = $9::jsonb AS "columnsOk",
  constraints_snapshot.value = $10::jsonb AS "constraintsOk",
  indexes_snapshot.value = $11::jsonb AS "indexesOk",
  functions_snapshot.value = $12::jsonb AS "functionsOk",
  triggers_snapshot.value = $13::jsonb AS "triggersOk",
  inheritance_snapshot.value = $14::jsonb AS "inheritanceOk",
  acls_snapshot.value = $15::jsonb AS "aclInventoryOk",
  receipt_state.deployment_id AS "deploymentId"
FROM actor_state, platform_state, role_state, ownership_state, authorization_state, absence_state,
  receipt_state, namespace_snapshot, relations_snapshot, columns_snapshot,
  constraints_snapshot, indexes_snapshot, functions_snapshot, triggers_snapshot,
  inheritance_snapshot, acls_snapshot
`.trim();

export const ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_RESULT_FIELDS = Object.freeze([
  "actorAuthorized",
  "platformSupported",
  "rolesSafe",
  "ownershipOk",
  "authorizationSurfaceOk",
  "policiesAndRulesAbsent",
  "semanticReceiptOk",
  "namespaceInventoryOk",
  "relationsOk",
  "columnsOk",
  "constraintsOk",
  "indexesOk",
  "functionsOk",
  "triggersOk",
  "inheritanceOk",
  "aclInventoryOk",
  "deploymentId"
] as const);

const CHECK_FIELDS = Object.freeze([
  ["actorAuthorized", "actor_authorization"],
  ["platformSupported", "platform"],
  ["rolesSafe", "roles"],
  ["ownershipOk", "ownership"],
  ["authorizationSurfaceOk", "authorization_surface"],
  ["policiesAndRulesAbsent", "policies_and_rules"],
  ["semanticReceiptOk", "semantic_receipt"],
  ["namespaceInventoryOk", "namespace_inventory"],
  ["relationsOk", "relations"],
  ["columnsOk", "columns"],
  ["constraintsOk", "constraints"],
  ["indexesOk", "indexes"],
  ["functionsOk", "functions"],
  ["triggersOk", "triggers"],
  ["inheritanceOk", "inheritance"],
  ["aclInventoryOk", "acl_inventory"]
] as const);

export type AltanaGrantClaimSchemaVerificationCheck =
  | "actor_authorization"
  | "migration_artifact"
  | "canonical_expectations"
  | "platform"
  | "roles"
  | "ownership"
  | "authorization_surface"
  | "policies_and_rules"
  | "semantic_receipt"
  | "namespace_inventory"
  | "relations"
  | "columns"
  | "constraints"
  | "indexes"
  | "functions"
  | "triggers"
  | "inheritance"
  | "acl_inventory";

export type AltanaGrantClaimCanonicalSchema = Readonly<{
  status: "ready";
  deploymentId: string;
  migrationVersion: 1;
  domainSchemaVersion: 1;
  postgresMajor: 17;
  migrationArtifactSha256: string;
  semanticContractSha256: string;
}>;

export type AltanaGrantClaimSchemaVerificationResult =
  | AltanaGrantClaimCanonicalSchema
  | Readonly<{
      status: "blocked";
      code: "SCHEMA_NOT_READY";
      failedChecks: readonly AltanaGrantClaimSchemaVerificationCheck[];
    }>;

function exactDataObject(input: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(input).some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const actual = Object.keys(descriptors).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      return null;
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function exactSingleRow(input: unknown): Readonly<{
  checks: Readonly<Record<string, boolean>>;
  deploymentId: string;
}> | null {
  try {
    const result = exactDataObject(input, ["rowCount", "rows"]);
    if (result === null || result.rowCount !== 1 || !Array.isArray(result.rows)) return null;
    if (Object.getPrototypeOf(result.rows) !== Array.prototype) return null;
    if (Reflect.ownKeys(result.rows).map(String).sort().join("\0") !== "0\0length") return null;
    const row = exactDataObject(result.rows[0], [
      ...CHECK_FIELDS.map(([field]) => field),
      "deploymentId"
    ]);
    if (
      row === null ||
      CHECK_FIELDS.some(([field]) => typeof row[field] !== "boolean") ||
      typeof row.deploymentId !== "string" ||
      row.deploymentId === "00000000-0000-0000-0000-000000000000" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        row.deploymentId
      )
    ) {
      return null;
    }
    return Object.freeze({
      checks: Object.freeze(
        Object.fromEntries(CHECK_FIELDS.map(([field]) => [field, row[field]])) as Record<
          string,
          boolean
        >
      ),
      deploymentId: row.deploymentId
    });
  } catch {
    return null;
  }
}

function blocked(
  failedChecks: readonly AltanaGrantClaimSchemaVerificationCheck[]
): AltanaGrantClaimSchemaVerificationResult {
  return Object.freeze({
    status: "blocked" as const,
    code: "SCHEMA_NOT_READY" as const,
    failedChecks: Object.freeze([...failedChecks])
  });
}

export const ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_PARAMETERS = Object.freeze([
  ALTANA_GRANT_CLAIM_MIGRATION_VERSION,
  ALTANA_GRANT_CLAIM_DOMAIN_SCHEMA_VERSION,
  ALTANA_GRANT_CLAIM_SUPPORTED_POSTGRES_MAJOR,
  ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256,
  ALTANA_GRANT_CLAIM_CANONICAL_OWNER_ROLE,
  ALTANA_GRANT_CLAIM_CANONICAL_APP_ROLE,
  ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.namespaceInventory,
  ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.relations,
  ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.columns,
  ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.constraints,
  ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.indexes,
  ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.functions,
  ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.triggers,
  ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.inheritance,
  ALTANA_GRANT_CLAIM_CANONICAL_EXPECTATIONS.acls
] as const);

/**
 * Interprets only an exact ordinary `{ rows, rowCount }` projection. This is
 * deliberately not a capability: only the module-owned pool composition may
 * bind a successful result to its private pool and deployment UUID.
 */
export function interpretAltanaGrantClaimSchemaProjection(
  input: unknown
): AltanaGrantClaimSchemaVerificationResult | null {
  if (
    ALTANA_GRANT_CLAIM_COMPUTED_SEMANTIC_CONTRACT_SHA256 !==
    ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256
  ) {
    return blocked(["canonical_expectations"]);
  }
  const row = exactSingleRow(input);
  if (row === null) return null;
  const failedChecks = CHECK_FIELDS.filter(([field]) => row.checks[field] !== true).map(
    ([, check]) => check
  );
  if (failedChecks.length > 0) return blocked(failedChecks);
  return Object.freeze({
    status: "ready" as const,
    deploymentId: row.deploymentId,
    migrationVersion: ALTANA_GRANT_CLAIM_MIGRATION_VERSION,
    domainSchemaVersion: ALTANA_GRANT_CLAIM_DOMAIN_SCHEMA_VERSION,
    postgresMajor: ALTANA_GRANT_CLAIM_SUPPORTED_POSTGRES_MAJOR,
    migrationArtifactSha256: ALTANA_GRANT_CLAIM_MIGRATION_ARTIFACT_SHA256,
    semanticContractSha256: ALTANA_GRANT_CLAIM_SEMANTIC_CONTRACT_SHA256
  });
}
