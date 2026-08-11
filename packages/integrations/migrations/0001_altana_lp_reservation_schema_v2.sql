-- ProofEra Altana LP durable reservation ledger, migration 0001 / domain schema v2.
--
-- ADMIN-ONLY, MANUAL OPERATION. Validated PostgreSQL policy: major 17, UTF-8.
--   psql -X --set ON_ERROR_STOP=1 --file 0001_altana_lp_reservation_schema_v2.sql <database>
--
-- Provision these isolated roles before applying the migration:
--   proofera_activation_owner: NOLOGIN, NOINHERIT, no elevated attributes
--   proofera_activation_app:   LOGIN, NOINHERIT, no elevated attributes
-- Neither role may participate in any role-membership edge. Never run this
-- artifact as the application role or from application startup. The migration
-- is fail-on-existing and cannot repair an existing schema.
--
-- The source DDL SHA-256 binds the exact exported store DDL. The catalog
-- SHA-256 is an externally reviewed, OID-free PostgreSQL 17 catalog snapshot.
-- This migration computes the snapshot and compares it with that fixed value;
-- it never derives or blesses a new expected value from the target database.

BEGIN;

SET LOCAL search_path = pg_catalog;

DO $proofera_platform_security$
DECLARE
  owner_role_oid oid;
  app_role_oid oid;
BEGIN
  IF current_setting('server_version_num')::integer < 170000
    OR current_setting('server_version_num')::integer >= 180000
    OR current_setting('server_encoding') <> 'UTF8'
  THEN
    RAISE EXCEPTION 'ProofEra migration 0001 requires PostgreSQL 17 with UTF-8'
      USING ERRCODE = '0A000';
  END IF;

  SELECT oid INTO owner_role_oid
  FROM pg_catalog.pg_roles
  WHERE
    rolname = 'proofera_activation_owner'
    AND NOT rolsuper
    AND NOT rolinherit
    AND NOT rolcreaterole
    AND NOT rolcreatedb
    AND NOT rolcanlogin
    AND NOT rolreplication
    AND NOT rolbypassrls;

  SELECT oid INTO app_role_oid
  FROM pg_catalog.pg_roles
  WHERE
    rolname = 'proofera_activation_app'
    AND NOT rolsuper
    AND NOT rolinherit
    AND NOT rolcreaterole
    AND NOT rolcreatedb
    AND rolcanlogin
    AND NOT rolreplication
    AND NOT rolbypassrls;

  IF owner_role_oid IS NULL OR app_role_oid IS NULL OR owner_role_oid = app_role_oid THEN
    RAISE EXCEPTION 'ProofEra activation roles are absent or unsafe' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members
    WHERE member IN (owner_role_oid, app_role_oid) OR roleid IN (owner_role_oid, app_role_oid)
  ) THEN
    RAISE EXCEPTION 'ProofEra activation roles must have no membership edges'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl
    WHERE defaclrole IN (owner_role_oid, app_role_oid)
  ) THEN
    RAISE EXCEPTION 'ProofEra activation roles must have no default ACL entries'
      USING ERRCODE = '42501';
  END IF;
END;
$proofera_platform_security$;

-- proofera:canonical-altana-lp-reservation-ddl:start
SELECT pg_advisory_xact_lock(726009991, 1);

DO $proofera_roles$
BEGIN
  IF to_regrole('proofera_activation_owner') IS NULL THEN
    RAISE EXCEPTION 'Required ProofEra activation owner role is absent' USING ERRCODE = '42704';
  END IF;
  IF to_regrole('proofera_activation_app') IS NULL THEN
    RAISE EXCEPTION 'Required ProofEra activation application role is absent' USING ERRCODE = '42704';
  END IF;
END;
$proofera_roles$;

CREATE SCHEMA proofera_activation AUTHORIZATION proofera_activation_owner;
REVOKE ALL ON SCHEMA proofera_activation FROM PUBLIC;
GRANT USAGE ON SCHEMA proofera_activation TO proofera_activation_app;

CREATE TABLE proofera_activation.altana_lp_reservations (
  schema_version SMALLINT NOT NULL CHECK (schema_version = 2),
  reservation_id TEXT COLLATE "C" PRIMARY KEY
    CHECK (reservation_id ~ '^0x[0-9a-f]{64}$' AND reservation_id <> '0x0000000000000000000000000000000000000000000000000000000000000000'),
  context_id TEXT COLLATE "C" NOT NULL UNIQUE
    CHECK (context_id ~ '^0x[0-9a-f]{64}$' AND context_id <> '0x0000000000000000000000000000000000000000000000000000000000000000'),
  quote_id TEXT COLLATE "C" NOT NULL UNIQUE
    CHECK (quote_id ~ '^0x[0-9a-f]{64}$' AND quote_id <> '0x0000000000000000000000000000000000000000000000000000000000000000'),
  user_id TEXT COLLATE "C" NOT NULL
    CHECK (char_length(user_id) BETWEEN 1 AND 160)
    CHECK (user_id ~ '^[A-Za-z0-9][A-Za-z0-9:._@/-]*$'),
  policy_hash TEXT COLLATE "C" NOT NULL
    CHECK (policy_hash ~ '^0x[0-9a-f]{64}$' AND policy_hash <> '0x0000000000000000000000000000000000000000000000000000000000000000'),
  write_target_chain_id SMALLINT NOT NULL CHECK (write_target_chain_id = 97),
  write_target_address TEXT COLLATE "C" NOT NULL
    CHECK (write_target_address ~ '^0x[0-9a-f]{40}$' AND write_target_address <> '0x0000000000000000000000000000000000000000'),
  write_target_runtime_code_hash TEXT COLLATE "C" NOT NULL
    CHECK (write_target_runtime_code_hash ~ '^0x[0-9a-f]{64}$' AND write_target_runtime_code_hash <> '0x0000000000000000000000000000000000000000000000000000000000000000'),
  write_target_block_number TEXT COLLATE "C" NOT NULL
    CHECK (char_length(write_target_block_number) BETWEEN 1 AND 78)
    CHECK (write_target_block_number ~ '^[1-9][0-9]*$'),
  write_target_block_hash TEXT COLLATE "C" NOT NULL
    CHECK (write_target_block_hash ~ '^0x[0-9a-f]{64}$' AND write_target_block_hash <> '0x0000000000000000000000000000000000000000000000000000000000000000'),
  write_target_review_id TEXT COLLATE "C" NOT NULL
    CHECK (write_target_review_id ~ '^0x[0-9a-f]{64}$' AND write_target_review_id <> '0x0000000000000000000000000000000000000000000000000000000000000000'),
  write_target_proxy_kind TEXT COLLATE "C" NOT NULL CHECK (write_target_proxy_kind = 'none'),
  consumed_at TEXT COLLATE "C" NOT NULL
    CHECK (char_length(consumed_at) = 24)
    CHECK (consumed_at ~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$'),
  expires_at TEXT COLLATE "C" NOT NULL
    CHECK (char_length(expires_at) = 24)
    CHECK (expires_at ~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT proofera_altana_lp_reservation_window
    CHECK (
      expires_at::timestamptz >= consumed_at::timestamptz + INTERVAL '30 seconds'
      AND expires_at::timestamptz <= consumed_at::timestamptz + INTERVAL '10 minutes'
    )
);

ALTER TABLE proofera_activation.altana_lp_reservations OWNER TO proofera_activation_owner;
REVOKE ALL ON TABLE proofera_activation.altana_lp_reservations FROM PUBLIC;
REVOKE ALL ON TABLE proofera_activation.altana_lp_reservations FROM proofera_activation_app;
GRANT SELECT, INSERT ON TABLE proofera_activation.altana_lp_reservations TO proofera_activation_app;

CREATE FUNCTION proofera_activation.reject_altana_lp_reservation_mutation()
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

ALTER FUNCTION proofera_activation.reject_altana_lp_reservation_mutation() OWNER TO proofera_activation_owner;
REVOKE ALL ON FUNCTION proofera_activation.reject_altana_lp_reservation_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION proofera_activation.reject_altana_lp_reservation_mutation() FROM proofera_activation_app;

CREATE TRIGGER proofera_altana_lp_reservations_append_only
BEFORE UPDATE OR DELETE ON proofera_activation.altana_lp_reservations
FOR EACH ROW
EXECUTE FUNCTION proofera_activation.reject_altana_lp_reservation_mutation();

CREATE TRIGGER proofera_altana_lp_reservations_reject_truncate
BEFORE TRUNCATE ON proofera_activation.altana_lp_reservations
FOR EACH STATEMENT
EXECUTE FUNCTION proofera_activation.reject_altana_lp_reservation_mutation();
-- proofera:canonical-altana-lp-reservation-ddl:end

CREATE TABLE proofera_activation.schema_migrations (
  migration_version INTEGER PRIMARY KEY CHECK (migration_version = 1),
  domain_schema_version SMALLINT NOT NULL CHECK (domain_schema_version = 2),
  postgres_major SMALLINT NOT NULL CHECK (postgres_major = 17),
  source_ddl_sha256 TEXT COLLATE "C" NOT NULL
    CHECK (
      source_ddl_sha256 = 'f4836af2f6882c9cdd9bf93e6b7c674a7a744b1c3558e479d1182638fe1c5efd'
      AND source_ddl_sha256 ~ '^[0-9a-f]{64}$'
    ),
  catalog_fingerprint_sha256 TEXT COLLATE "C" NOT NULL
    CHECK (catalog_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);

ALTER TABLE proofera_activation.schema_migrations OWNER TO proofera_activation_owner;
REVOKE ALL ON TABLE proofera_activation.schema_migrations FROM PUBLIC;
REVOKE ALL ON TABLE proofera_activation.schema_migrations FROM proofera_activation_app;

CREATE TRIGGER proofera_schema_migrations_append_only
BEFORE UPDATE OR DELETE ON proofera_activation.schema_migrations
FOR EACH ROW
EXECUTE FUNCTION proofera_activation.reject_altana_lp_reservation_mutation();

CREATE TRIGGER proofera_schema_migrations_reject_truncate
BEFORE TRUNCATE ON proofera_activation.schema_migrations
FOR EACH STATEMENT
EXECUTE FUNCTION proofera_activation.reject_altana_lp_reservation_mutation();

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
)
INSERT INTO proofera_activation.schema_migrations (
  migration_version,
  domain_schema_version,
  postgres_major,
  source_ddl_sha256,
  catalog_fingerprint_sha256
)
SELECT
  1,
  2,
  17,
  'f4836af2f6882c9cdd9bf93e6b7c674a7a744b1c3558e479d1182638fe1c5efd',
  '9da7596295ced6586488fde39d0e3cfb4f90feb1b989a2dc4ce7a08c7276de90'
FROM current_fingerprint
WHERE current_fingerprint.value =
  '9da7596295ced6586488fde39d0e3cfb4f90feb1b989a2dc4ce7a08c7276de90';

DO $proofera_catalog_attestation$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM proofera_activation.schema_migrations
    WHERE migration_version = 1
      AND domain_schema_version = 2
      AND postgres_major = 17
      AND source_ddl_sha256 = 'f4836af2f6882c9cdd9bf93e6b7c674a7a744b1c3558e479d1182638fe1c5efd'
      AND catalog_fingerprint_sha256 =
        '9da7596295ced6586488fde39d0e3cfb4f90feb1b989a2dc4ce7a08c7276de90'
  ) THEN
    RAISE EXCEPTION 'ProofEra catalog differs from the reviewed PostgreSQL 17 fingerprint'
      USING ERRCODE = '55000';
  END IF;
END;
$proofera_catalog_attestation$;

COMMIT;
