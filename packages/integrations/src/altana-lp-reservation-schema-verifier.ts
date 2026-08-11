import { createHash } from "node:crypto";

import {
  ALTANA_LP_RESERVATION_APP_ROLE,
  ALTANA_LP_RESERVATION_MIGRATION_VERSION,
  ALTANA_LP_RESERVATION_OWNER_ROLE,
  ALTANA_LP_RESERVATION_POSTGRES_DDL
} from "./altana-lp-reservation-store";

export const ALTANA_LP_RESERVATION_DOMAIN_SCHEMA_VERSION = 2;
export const ALTANA_LP_RESERVATION_SUPPORTED_POSTGRES_MAJOR = 17;
export const ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256 =
  "f4836af2f6882c9cdd9bf93e6b7c674a7a744b1c3558e479d1182638fe1c5efd";
export const ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256 =
  "9da7596295ced6586488fde39d0e3cfb4f90feb1b989a2dc4ce7a08c7276de90";
export const ALTANA_LP_RESERVATION_MIGRATION_ARTIFACT_SHA256 =
  "922492ba66bbac7fb389a16845ebaa3144f875d3d5beb2417124f3e8188312ba";

/**
 * OID-free PostgreSQL 17 catalog verification for migration 0001.
 *
 * This statement is intentionally fixed and is never an application-startup
 * migration path. It must run through a separately provisioned administrative
 * connection. The serializer is duplicated in the manual migration and this
 * read-only query; repository tests require those copies to stay byte-exact.
 * Both compare against an externally reviewed SHA-256 constant. Neither can
 * derive or update the accepted value from a database receipt.
 */
export const ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL = `
WITH
target_schema AS (
  SELECT n.oid, n.nspname, n.nspowner, n.nspacl
  FROM pg_catalog.pg_namespace AS n
  WHERE n.nspname = 'proofera_activation'
),
target_relations AS (
  SELECT 'altana_lp_reservations'::text AS relation_name,
    pg_catalog.to_regclass('proofera_activation.altana_lp_reservations') AS relation_oid
  UNION ALL
  SELECT 'schema_migrations'::text,
    pg_catalog.to_regclass('proofera_activation.schema_migrations')
),
target_function AS (
  SELECT p.*, n.nspname, language.lanname
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language AS language ON language.oid = p.prolang
  WHERE p.oid = pg_catalog.to_regprocedure(
    'proofera_activation.reject_altana_lp_reservation_mutation()'
  )
),
schema_snapshot AS (
  SELECT jsonb_build_object(
    'name', schema_target.nspname,
    'owner', pg_catalog.pg_get_userbyid(schema_target.nspowner),
    'aclIsNull', schema_target.nspacl IS NULL,
    'acl', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'grantor', normalized.grantor_name,
          'grantee', normalized.grantee_name,
          'privilege', normalized.privilege_type,
          'grantable', normalized.is_grantable
        ) ORDER BY normalized.grantor_name, normalized.grantee_name,
          normalized.privilege_type, normalized.is_grantable
      )
      FROM (
        SELECT
          pg_catalog.pg_get_userbyid(acl.grantor) AS grantor_name,
          CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee_name,
          acl.privilege_type,
          acl.is_grantable
        FROM pg_catalog.aclexplode(
          COALESCE(
            schema_target.nspacl,
            pg_catalog.acldefault('n', schema_target.nspowner)
          )
        ) AS acl
      ) AS normalized
    ), '[]'::jsonb)
  ) AS value
  FROM target_schema AS schema_target
),
namespace_inventory AS (
  SELECT jsonb_build_object(
    'relations', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', relation.relname,
          'kind', relation.relkind,
          'owner', pg_catalog.pg_get_userbyid(relation.relowner)
        ) ORDER BY relation.relname, relation.relkind
      )
      FROM pg_catalog.pg_class AS relation
      JOIN target_schema AS schema_target ON schema_target.oid = relation.relnamespace
    ), '[]'::jsonb),
    'functions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', function_item.proname,
          'arguments', pg_catalog.pg_get_function_identity_arguments(function_item.oid),
          'owner', pg_catalog.pg_get_userbyid(function_item.proowner)
        ) ORDER BY function_item.proname,
          pg_catalog.pg_get_function_identity_arguments(function_item.oid)
      )
      FROM pg_catalog.pg_proc AS function_item
      JOIN target_schema AS schema_target ON schema_target.oid = function_item.pronamespace
    ), '[]'::jsonb)
  ) AS value
),
relations_snapshot AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'name', target.relation_name,
      'owner', pg_catalog.pg_get_userbyid(relation.relowner),
      'kind', relation.relkind,
      'persistence', relation.relpersistence,
      'rowSecurity', relation.relrowsecurity,
      'forceRowSecurity', relation.relforcerowsecurity,
      'replicaIdentity', relation.relreplident,
      'isPartition', relation.relispartition,
      'options', to_jsonb(relation.reloptions),
      'tablespace', tablespace.spcname,
      'aclIsNull', relation.relacl IS NULL,
      'acl', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'grantor', normalized.grantor_name,
            'grantee', normalized.grantee_name,
            'privilege', normalized.privilege_type,
            'grantable', normalized.is_grantable
          ) ORDER BY normalized.grantor_name, normalized.grantee_name,
            normalized.privilege_type, normalized.is_grantable
        )
        FROM (
          SELECT
            pg_catalog.pg_get_userbyid(acl.grantor) AS grantor_name,
            CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
              ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee_name,
            acl.privilege_type,
            acl.is_grantable
          FROM pg_catalog.aclexplode(
            COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
          ) AS acl
        ) AS normalized
      ), '[]'::jsonb)
    ) ORDER BY target.relation_name
  ), '[]'::jsonb) AS value
  FROM target_relations AS target
  JOIN pg_catalog.pg_class AS relation ON relation.oid = target.relation_oid
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace ON tablespace.oid = relation.reltablespace
),
columns_snapshot AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relation', target.relation_name,
      'ordinal', attribute.attnum,
      'name', attribute.attname,
      'type', pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
      'notNull', attribute.attnotnull,
      'collation', CASE WHEN collation_item.oid IS NULL THEN NULL ELSE
        pg_catalog.quote_ident(collation_namespace.nspname) || '.' ||
        pg_catalog.quote_ident(collation_item.collname) END,
      'default', pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, false),
      'identity', attribute.attidentity,
      'generated', attribute.attgenerated,
      'storage', attribute.attstorage,
      'compression', attribute.attcompression,
      'aclIsNull', attribute.attacl IS NULL,
      'acl', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'grantor', normalized.grantor_name,
            'grantee', normalized.grantee_name,
            'privilege', normalized.privilege_type,
            'grantable', normalized.is_grantable
          ) ORDER BY normalized.grantor_name, normalized.grantee_name,
            normalized.privilege_type, normalized.is_grantable
        )
        FROM (
          SELECT
            pg_catalog.pg_get_userbyid(acl.grantor) AS grantor_name,
            CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
              ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee_name,
            acl.privilege_type,
            acl.is_grantable
          FROM pg_catalog.aclexplode(attribute.attacl) AS acl
        ) AS normalized
      ), '[]'::jsonb)
    ) ORDER BY target.relation_name, attribute.attnum
  ), '[]'::jsonb) AS value
  FROM target_relations AS target
  JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = target.relation_oid
  LEFT JOIN pg_catalog.pg_attrdef AS default_value
    ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
  LEFT JOIN pg_catalog.pg_collation AS collation_item
    ON collation_item.oid = attribute.attcollation
  LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
    ON collation_namespace.oid = collation_item.collnamespace
  WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
),
constraints_snapshot AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relation', target.relation_name,
      'name', constraint_item.conname,
      'type', constraint_item.contype,
      'columns', COALESCE((
        SELECT jsonb_agg(attribute.attname ORDER BY key_item.ordinality)
        FROM unnest(constraint_item.conkey) WITH ORDINALITY AS key_item(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_item.conrelid
          AND attribute.attnum = key_item.attnum
      ), '[]'::jsonb),
      'definition', pg_catalog.pg_get_constraintdef(constraint_item.oid, false),
      'validated', constraint_item.convalidated,
      'deferrable', constraint_item.condeferrable,
      'deferred', constraint_item.condeferred,
      'noInherit', constraint_item.connoinherit
    ) ORDER BY target.relation_name, constraint_item.conname
  ), '[]'::jsonb) AS value
  FROM target_relations AS target
  JOIN pg_catalog.pg_constraint AS constraint_item
    ON constraint_item.conrelid = target.relation_oid
),
indexes_snapshot AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relation', target.relation_name,
      'name', index_relation.relname,
      'owner', pg_catalog.pg_get_userbyid(index_relation.relowner),
      'method', access_method.amname,
      'unique', index_item.indisunique,
      'primary', index_item.indisprimary,
      'valid', index_item.indisvalid,
      'ready', index_item.indisready,
      'live', index_item.indislive,
      'clustered', index_item.indisclustered,
      'replicaIdentity', index_item.indisreplident,
      'nullsNotDistinct', index_item.indnullsnotdistinct,
      'expression', pg_catalog.pg_get_expr(index_item.indexprs, index_item.indrelid, false),
      'predicate', pg_catalog.pg_get_expr(index_item.indpred, index_item.indrelid, false),
      'definition', pg_catalog.pg_get_indexdef(index_item.indexrelid, 0, false)
    ) ORDER BY target.relation_name, index_relation.relname
  ), '[]'::jsonb) AS value
  FROM target_relations AS target
  JOIN pg_catalog.pg_index AS index_item ON index_item.indrelid = target.relation_oid
  JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_item.indexrelid
  JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
),
triggers_snapshot AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relation', target.relation_name,
      'name', trigger_item.tgname,
      'enabled', trigger_item.tgenabled,
      'type', trigger_item.tgtype,
      'constraint', trigger_item.tgconstraint <> 0,
      'function', pg_catalog.quote_ident(function_namespace.nspname) || '.' ||
        pg_catalog.quote_ident(function_item.proname) || '(' ||
        pg_catalog.pg_get_function_identity_arguments(function_item.oid) || ')',
      'definition', pg_catalog.pg_get_triggerdef(trigger_item.oid, false)
    ) ORDER BY target.relation_name, trigger_item.tgname
  ), '[]'::jsonb) AS value
  FROM target_relations AS target
  JOIN pg_catalog.pg_trigger AS trigger_item ON trigger_item.tgrelid = target.relation_oid
  JOIN pg_catalog.pg_proc AS function_item ON function_item.oid = trigger_item.tgfoid
  JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_item.pronamespace
  WHERE NOT trigger_item.tgisinternal
),
function_snapshot AS (
  SELECT jsonb_build_object(
    'name', pg_catalog.quote_ident(function_item.nspname) || '.' ||
      pg_catalog.quote_ident(function_item.proname),
    'arguments', pg_catalog.pg_get_function_identity_arguments(function_item.oid),
    'result', pg_catalog.pg_get_function_result(function_item.oid),
    'owner', pg_catalog.pg_get_userbyid(function_item.proowner),
    'language', function_item.lanname,
    'kind', function_item.prokind,
    'volatility', function_item.provolatile,
    'parallel', function_item.proparallel,
    'strict', function_item.proisstrict,
    'leakproof', function_item.proleakproof,
    'securityDefiner', function_item.prosecdef,
    'configuration', to_jsonb(function_item.proconfig),
    'definition', pg_catalog.pg_get_functiondef(function_item.oid),
    'aclIsNull', function_item.proacl IS NULL,
    'acl', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'grantor', normalized.grantor_name,
          'grantee', normalized.grantee_name,
          'privilege', normalized.privilege_type,
          'grantable', normalized.is_grantable
        ) ORDER BY normalized.grantor_name, normalized.grantee_name,
          normalized.privilege_type, normalized.is_grantable
      )
      FROM (
        SELECT
          pg_catalog.pg_get_userbyid(acl.grantor) AS grantor_name,
          CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee_name,
          acl.privilege_type,
          acl.is_grantable
        FROM pg_catalog.aclexplode(
          COALESCE(function_item.proacl, pg_catalog.acldefault('f', function_item.proowner))
        ) AS acl
      ) AS normalized
    ), '[]'::jsonb)
  ) AS value
  FROM target_function AS function_item
),
rules_snapshot AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relation', target.relation_name,
      'name', rewrite_rule.rulename,
      'enabled', rewrite_rule.ev_enabled,
      'event', rewrite_rule.ev_type,
      'instead', rewrite_rule.is_instead,
      'definition', pg_catalog.pg_get_ruledef(rewrite_rule.oid, false)
    ) ORDER BY target.relation_name, rewrite_rule.rulename
  ), '[]'::jsonb) AS value
  FROM target_relations AS target
  JOIN pg_catalog.pg_rewrite AS rewrite_rule ON rewrite_rule.ev_class = target.relation_oid
),
policies_snapshot AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relation', target.relation_name,
      'name', policy.polname,
      'permissive', policy.polpermissive,
      'command', policy.polcmd,
      'roles', COALESCE((
        SELECT jsonb_agg(
          CASE WHEN role_oid = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(role_oid) END
          ORDER BY CASE WHEN role_oid = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(role_oid) END
        ) FROM unnest(policy.polroles) AS role_oid
      ), '[]'::jsonb),
      'using', pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false),
      'check', pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false)
    ) ORDER BY target.relation_name, policy.polname
  ), '[]'::jsonb) AS value
  FROM target_relations AS target
  JOIN pg_catalog.pg_policy AS policy ON policy.polrelid = target.relation_oid
),
catalog_document AS (
  SELECT jsonb_build_object(
    'formatVersion', 1,
    'schema', schema_snapshot.value,
    'namespaceInventory', namespace_inventory.value,
    'relations', relations_snapshot.value,
    'columns', columns_snapshot.value,
    'constraints', constraints_snapshot.value,
    'indexes', indexes_snapshot.value,
    'triggers', triggers_snapshot.value,
    'function', function_snapshot.value,
    'rules', rules_snapshot.value,
    'policies', policies_snapshot.value
  ) AS value
  FROM schema_snapshot, namespace_inventory, relations_snapshot, columns_snapshot,
    constraints_snapshot, indexes_snapshot, triggers_snapshot, function_snapshot,
    rules_snapshot, policies_snapshot
),
current_fingerprint AS (
  SELECT pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(catalog_document.value::text, 'UTF8')),
    'hex'
  ) AS value
  FROM catalog_document
),
platform_state AS (
  SELECT
    current_setting('server_version_num')::integer >= 170000
    AND current_setting('server_version_num')::integer < 180000
    AND current_setting('server_encoding') = 'UTF8' AS value
),
role_state AS (
  SELECT COALESCE(
    owner_role.oid IS NOT NULL
    AND app_role.oid IS NOT NULL
    AND owner_role.oid <> app_role.oid
    AND NOT owner_role.rolsuper
    AND NOT owner_role.rolinherit
    AND NOT owner_role.rolcreaterole
    AND NOT owner_role.rolcreatedb
    AND NOT owner_role.rolcanlogin
    AND NOT owner_role.rolreplication
    AND NOT owner_role.rolbypassrls
    AND NOT app_role.rolsuper
    AND NOT app_role.rolinherit
    AND NOT app_role.rolcreaterole
    AND NOT app_role.rolcreatedb
    AND app_role.rolcanlogin
    AND NOT app_role.rolreplication
    AND NOT app_role.rolbypassrls
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member IN (owner_role.oid, app_role.oid)
        OR membership.roleid IN (owner_role.oid, app_role.oid)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_default_acl AS default_acl
      WHERE default_acl.defaclrole IN (owner_role.oid, app_role.oid)
    ),
    false
  ) AS value
  FROM (VALUES (true)) AS seed(present)
  LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.rolname = $6
  LEFT JOIN pg_catalog.pg_roles AS app_role ON app_role.rolname = $7
),
ownership_state AS (
  SELECT COALESCE(
    pg_catalog.pg_get_userbyid(schema_target.nspowner) = $6
    AND (
      SELECT count(*) = 2
        AND bool_and(pg_catalog.pg_get_userbyid(relation.relowner) = $6)
      FROM target_relations AS target
      JOIN pg_catalog.pg_class AS relation ON relation.oid = target.relation_oid
    )
    AND (
      SELECT count(*) = 1
        AND bool_and(pg_catalog.pg_get_userbyid(function_item.proowner) = $6)
      FROM target_function AS function_item
    ),
    false
  ) AS value
  FROM target_schema AS schema_target
),
authorization_state AS (
  SELECT COALESCE(
    pg_catalog.has_schema_privilege($7, schema_target.oid, 'USAGE') IS TRUE
    AND pg_catalog.has_schema_privilege($7, schema_target.oid, 'CREATE') IS FALSE
    AND pg_catalog.has_table_privilege(
      $7, pg_catalog.to_regclass('proofera_activation.altana_lp_reservations'), 'SELECT'
    ) IS TRUE
    AND pg_catalog.has_table_privilege(
      $7, pg_catalog.to_regclass('proofera_activation.altana_lp_reservations'), 'INSERT'
    ) IS TRUE
    AND pg_catalog.has_table_privilege(
      $7, pg_catalog.to_regclass('proofera_activation.altana_lp_reservations'), 'UPDATE'
    ) IS FALSE
    AND pg_catalog.has_table_privilege(
      $7, pg_catalog.to_regclass('proofera_activation.altana_lp_reservations'), 'DELETE'
    ) IS FALSE
    AND pg_catalog.has_table_privilege(
      $7, pg_catalog.to_regclass('proofera_activation.altana_lp_reservations'), 'TRUNCATE'
    ) IS FALSE
    AND pg_catalog.has_table_privilege(
      $7, pg_catalog.to_regclass('proofera_activation.altana_lp_reservations'), 'REFERENCES'
    ) IS FALSE
    AND pg_catalog.has_table_privilege(
      $7, pg_catalog.to_regclass('proofera_activation.altana_lp_reservations'), 'TRIGGER'
    ) IS FALSE
    AND pg_catalog.has_table_privilege(
      $7, pg_catalog.to_regclass('proofera_activation.schema_migrations'),
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) IS FALSE
    AND pg_catalog.has_function_privilege(
      $7,
      pg_catalog.to_regprocedure('proofera_activation.reject_altana_lp_reservation_mutation()'),
      'EXECUTE'
    ) IS FALSE
    AND NOT EXISTS (
      SELECT 1
      FROM (
        SELECT acl.grantee, acl.is_grantable
        FROM target_schema AS namespace_target
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            namespace_target.nspacl,
            pg_catalog.acldefault('n', namespace_target.nspowner)
          )
        ) AS acl
        UNION ALL
        SELECT acl.grantee, acl.is_grantable
        FROM target_relations AS target
        JOIN pg_catalog.pg_class AS relation ON relation.oid = target.relation_oid
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
        ) AS acl
        UNION ALL
        SELECT acl.grantee, acl.is_grantable
        FROM target_relations AS target
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = target.relation_oid
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
        WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
        UNION ALL
        SELECT acl.grantee, acl.is_grantable
        FROM target_function AS function_item
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            function_item.proacl,
            pg_catalog.acldefault('f', function_item.proowner)
          )
        ) AS acl
      ) AS exposed_acl
      LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = exposed_acl.grantee
      WHERE exposed_acl.grantee = 0
        OR grantee_role.rolname NOT IN ($6, $7)
        OR (grantee_role.rolname = $7 AND exposed_acl.is_grantable)
    ),
    false
  ) AS value
  FROM target_schema AS schema_target
),
migration_receipt AS (
  SELECT
    count(*) = 1
    AND bool_and(migration_version = $1)
    AND bool_and(domain_schema_version = $2)
    AND bool_and(postgres_major = $5)
    AND bool_and(source_ddl_sha256 = $3)
    AND bool_and(catalog_fingerprint_sha256 = $4) AS value
  FROM proofera_activation.schema_migrations
),
actor_state AS (
  SELECT
    current_user <> $7
    AND (
      current_setting('is_superuser') = 'on'
      OR current_user = $6
    ) AS value
)
SELECT
  actor_state.value AS "actorAuthorized",
  platform_state.value AS "platformSupported",
  role_state.value AS "rolesSafe",
  ownership_state.value AS "ownershipOk",
  authorization_state.value AS "authorizationSurfaceOk",
  migration_receipt.value AS "migrationReceiptOk",
  current_fingerprint.value = $4 AS "catalogFingerprintOk"
FROM actor_state, platform_state, role_state, ownership_state,
  authorization_state, migration_receipt, current_fingerprint
`.trim();

export type AltanaLpReservationSchemaVerificationCheck =
  | "actor_authorization"
  | "authorization_surface"
  | "catalog_fingerprint"
  | "migration_receipt"
  | "ownership"
  | "platform"
  | "roles"
  | "source_artifact";

export type AltanaLpReservationSchemaVerificationResult =
  | Readonly<{
      status: "ready";
      migrationVersion: number;
      domainSchemaVersion: number;
      postgresMajor: number;
      sourceDdlSha256: string;
      catalogFingerprintSha256: string;
    }>
  | Readonly<{
      status: "blocked";
      code: "SCHEMA_NOT_READY";
      failedChecks: readonly AltanaLpReservationSchemaVerificationCheck[];
    }>;

export type VerifiedAltanaLpReservationSchemaReady = Extract<
  AltanaLpReservationSchemaVerificationResult,
  { readonly status: "ready" }
>;

const VERIFIED_READY_RESULTS = new WeakSet<object>();

/**
 * Nominal in-process capability check for a successful canonical verification.
 * Frozen lookalikes, deserialized values, and copied fields cannot pass it.
 */
export function isVerifiedAltanaLpReservationSchemaReady(
  input: unknown
): input is VerifiedAltanaLpReservationSchemaReady {
  return typeof input === "object" && input !== null && VERIFIED_READY_RESULTS.has(input);
}

export type AltanaLpReservationSchemaVerifierErrorCode =
  | "CATALOG_QUERY_FAILED"
  | "CATALOG_RESULT_INVALID"
  | "DATABASE_DEPENDENCY_INVALID"
  | "SERVER_RUNTIME_REQUIRED";

const ERROR_MESSAGES: Readonly<Record<AltanaLpReservationSchemaVerifierErrorCode, string>> =
  Object.freeze({
    CATALOG_QUERY_FAILED: "The PostgreSQL schema preflight could not complete safely.",
    CATALOG_RESULT_INVALID: "The PostgreSQL schema preflight returned an invalid result.",
    DATABASE_DEPENDENCY_INVALID: "A server-admin PostgreSQL verification boundary is required.",
    SERVER_RUNTIME_REQUIRED: "The PostgreSQL schema verifier is server-admin-only."
  });

/** Safe operational error that deliberately retains no driver or catalog details. */
export class AltanaLpReservationSchemaVerifierError extends Error {
  override readonly name = "AltanaLpReservationSchemaVerifierError";
  readonly code: AltanaLpReservationSchemaVerifierErrorCode;

  constructor(code: AltanaLpReservationSchemaVerifierErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
  }
}

export interface AltanaLpReservationAdminCatalogDatabase {
  readonly executionBoundary: "server_admin_preflight";
  readonly query: (statement: string, parameters: readonly (number | string)[]) => Promise<unknown>;
}

type ParsedDatabase = Readonly<{
  source: object;
  query: (...args: unknown[]) => unknown;
}>;

const CHECK_FIELDS = Object.freeze([
  ["actorAuthorized", "actor_authorization"],
  ["platformSupported", "platform"],
  ["rolesSafe", "roles"],
  ["ownershipOk", "ownership"],
  ["authorizationSurfaceOk", "authorization_surface"],
  ["migrationReceiptOk", "migration_receipt"],
  ["catalogFingerprintOk", "catalog_fingerprint"]
] as const);

function findDataMethod(input: object): ((...args: unknown[]) => unknown) | null {
  let cursor: object | null = input;
  for (let depth = 0; cursor !== null && depth < 8; depth += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(cursor, "query");
    if (descriptor !== undefined) {
      return "value" in descriptor && typeof descriptor.value === "function"
        ? (descriptor.value as (...args: unknown[]) => unknown)
        : null;
    }
    cursor = Object.getPrototypeOf(cursor) as object | null;
  }
  return null;
}

function parseDatabase(input: unknown): ParsedDatabase | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const boundary = Object.getOwnPropertyDescriptor(input, "executionBoundary");
  const query = findDataMethod(input);
  if (
    boundary === undefined ||
    !("value" in boundary) ||
    boundary.value !== "server_admin_preflight" ||
    query === null
  ) {
    return null;
  }
  return Object.freeze({ source: input, query });
}

function parseCheckRow(
  input: unknown
): Readonly<Record<(typeof CHECK_FIELDS)[number][0], boolean>> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const expectedKeys = CHECK_FIELDS.map(([field]) => field).sort();
  if (Object.keys(descriptors).sort().join("\0") !== expectedKeys.join("\0")) return null;

  const parsed: Partial<Record<(typeof CHECK_FIELDS)[number][0], boolean>> = {};
  for (const [field] of CHECK_FIELDS) {
    const descriptor = descriptors[field];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "boolean"
    ) {
      return null;
    }
    parsed[field] = descriptor.value;
  }
  return Object.freeze(parsed) as Readonly<Record<(typeof CHECK_FIELDS)[number][0], boolean>>;
}

function parseSingleRowResult(
  input: unknown
): Readonly<Record<(typeof CHECK_FIELDS)[number][0], boolean>> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const rows = descriptors.rows;
  const rowCount = descriptors.rowCount;
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
  return parseCheckRow(rows.value[0]);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceDdlDigestMatches(): boolean {
  return sha256(ALTANA_LP_RESERVATION_POSTGRES_DDL) === ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256;
}

/** Exact deployment-time check for the reviewed versioned migration file. */
export function isReviewedAltanaLpReservationMigrationArtifact(input: unknown): boolean {
  return (
    typeof input === "string" &&
    sha256(input.replaceAll("\r\n", "\n")) === ALTANA_LP_RESERVATION_MIGRATION_ARTIFACT_SHA256
  );
}

function blocked(
  failedChecks: readonly AltanaLpReservationSchemaVerificationCheck[]
): AltanaLpReservationSchemaVerificationResult {
  return Object.freeze({
    status: "blocked" as const,
    code: "SCHEMA_NOT_READY" as const,
    failedChecks: Object.freeze([...failedChecks])
  });
}

/**
 * Verify migration 0001 after an explicit administrator-run migration.
 *
 * This function cannot apply, repair, bless, or retry a migration. Missing or
 * altered objects, definitions, ACLs, rewrite rules, role state, receipt values,
 * and unsupported PostgreSQL versions fail closed before reservation writes.
 */
export async function verifyAltanaLpReservationPostgresSchema(
  unparsedDatabase: unknown
): Promise<AltanaLpReservationSchemaVerificationResult> {
  if (typeof window !== "undefined") {
    throw new AltanaLpReservationSchemaVerifierError("SERVER_RUNTIME_REQUIRED");
  }

  if (!sourceDdlDigestMatches()) return blocked(["source_artifact"]);

  const database = parseDatabase(unparsedDatabase);
  if (database === null) {
    throw new AltanaLpReservationSchemaVerifierError("DATABASE_DEPENDENCY_INVALID");
  }

  let unparsedResult: unknown;
  try {
    unparsedResult = await Promise.resolve(
      database.query.call(database.source, ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL, [
        ALTANA_LP_RESERVATION_MIGRATION_VERSION,
        ALTANA_LP_RESERVATION_DOMAIN_SCHEMA_VERSION,
        ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256,
        ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256,
        ALTANA_LP_RESERVATION_SUPPORTED_POSTGRES_MAJOR,
        ALTANA_LP_RESERVATION_OWNER_ROLE,
        ALTANA_LP_RESERVATION_APP_ROLE
      ])
    );
  } catch {
    throw new AltanaLpReservationSchemaVerifierError("CATALOG_QUERY_FAILED");
  }

  const row = parseSingleRowResult(unparsedResult);
  if (row === null) {
    throw new AltanaLpReservationSchemaVerifierError("CATALOG_RESULT_INVALID");
  }

  const failedChecks = CHECK_FIELDS.filter(([field]) => !row[field]).map(([, check]) => check);
  if (failedChecks.length > 0) return blocked(failedChecks);

  const ready = Object.freeze({
    status: "ready" as const,
    migrationVersion: ALTANA_LP_RESERVATION_MIGRATION_VERSION,
    domainSchemaVersion: ALTANA_LP_RESERVATION_DOMAIN_SCHEMA_VERSION,
    postgresMajor: ALTANA_LP_RESERVATION_SUPPORTED_POSTGRES_MAJOR,
    sourceDdlSha256: ALTANA_LP_RESERVATION_SOURCE_DDL_SHA256,
    catalogFingerprintSha256: ALTANA_LP_RESERVATION_EXPECTED_CATALOG_FINGERPRINT_SHA256
  });
  VERIFIED_READY_RESULTS.add(ready);
  return ready;
}
