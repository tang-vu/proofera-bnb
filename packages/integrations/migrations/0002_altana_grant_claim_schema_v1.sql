-- ProofEra Altana one-shot grant-claim ledger, repository migration 0002 / schema v1.
--
-- ADMIN-ONLY, MANUAL, FAIL-ON-EXISTING. PostgreSQL 17 and UTF-8 are mandatory.
-- The current disposable/production database must already be owned by the
-- isolated no-login owner role. Never run this artifact from application startup.
--
-- Provision exactly:
--   CREATE ROLE proofera_grant_claim_owner NOLOGIN NOINHERIT;
--   CREATE ROLE proofera_grant_claim_app LOGIN NOINHERIT;
--   ALTER DATABASE <exact_database> OWNER TO proofera_grant_claim_owner;

BEGIN;

SET LOCAL search_path = pg_catalog;

SELECT pg_catalog.pg_advisory_xact_lock(726009993, 2);

DO $proofera_preflight$
DECLARE
  owner_oid oid;
  app_oid oid;
  database_oid oid;
BEGIN
  IF current_setting('server_version_num')::integer < 170000
    OR current_setting('server_version_num')::integer >= 180000
    OR current_setting('server_encoding') <> 'UTF8'
  THEN
    RAISE EXCEPTION 'ProofEra grant-claim migration requires PostgreSQL 17 with UTF-8'
      USING ERRCODE = '0A000';
  END IF;

  SELECT role.oid INTO owner_oid
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = 'proofera_grant_claim_owner'
    AND NOT role.rolsuper
    AND NOT role.rolinherit
    AND NOT role.rolcreaterole
    AND NOT role.rolcreatedb
    AND NOT role.rolcanlogin
    AND NOT role.rolreplication
    AND NOT role.rolbypassrls
    AND role.rolconnlimit = -1
    AND role.rolvaliduntil IS NULL
    AND role.rolconfig IS NULL;

  SELECT role.oid INTO app_oid
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = 'proofera_grant_claim_app'
    AND NOT role.rolsuper
    AND NOT role.rolinherit
    AND NOT role.rolcreaterole
    AND NOT role.rolcreatedb
    AND role.rolcanlogin
    AND NOT role.rolreplication
    AND NOT role.rolbypassrls
    AND role.rolconnlimit = -1
    AND role.rolvaliduntil IS NULL
    AND role.rolconfig IS NULL;

  SELECT database_item.oid INTO database_oid
  FROM pg_catalog.pg_database AS database_item
  WHERE database_item.datname = current_database()
    AND database_item.datdba = owner_oid
    AND database_item.datallowconn
    AND NOT database_item.datistemplate;

  IF owner_oid IS NULL OR app_oid IS NULL OR owner_oid = app_oid OR database_oid IS NULL THEN
    RAISE EXCEPTION 'Required isolated ProofEra grant-claim roles/database ownership are unsafe'
      USING ERRCODE = '42501';
  END IF;

  IF current_setting('is_superuser') <> 'on'
    AND current_user <> 'proofera_grant_claim_owner'
  THEN
    RAISE EXCEPTION 'Grant-claim migration requires its database owner or an administrator'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member IN (owner_oid, app_oid)
      OR membership.roleid IN (owner_oid, app_oid)
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl AS default_acl
    WHERE default_acl.defaclrole IN (owner_oid, app_oid)
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_db_role_setting AS role_setting
    WHERE role_setting.setrole IN (owner_oid, app_oid)
      OR role_setting.setdatabase = database_oid
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database AS database_item
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(database_item.datacl, pg_catalog.acldefault('d', database_item.datdba))
    ) AS acl
    WHERE database_item.oid = database_oid
      AND acl.grantee NOT IN (0, owner_oid, app_oid)
  ) THEN
    RAISE EXCEPTION 'ProofEra grant-claim roles/database have inherited or rogue authority'
      USING ERRCODE = '42501';
  END IF;
END;
$proofera_preflight$;

CREATE SCHEMA proofera_altana_grant_claim AUTHORIZATION proofera_grant_claim_owner;

SET LOCAL ROLE proofera_grant_claim_owner;

DO $proofera_database_acl$
BEGIN
  EXECUTE pg_catalog.format(
    'REVOKE ALL ON DATABASE %I FROM PUBLIC',
    current_database()
  );
  EXECUTE pg_catalog.format(
    'REVOKE ALL ON DATABASE %I FROM %I',
    current_database(),
    'proofera_grant_claim_app'
  );
  EXECUTE pg_catalog.format(
    'REVOKE ALL ON DATABASE %I FROM %I',
    current_database(),
    'proofera_grant_claim_owner'
  );
  EXECUTE pg_catalog.format(
    'GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO %I',
    current_database(),
    'proofera_grant_claim_owner'
  );
  EXECUTE pg_catalog.format(
    'GRANT CONNECT ON DATABASE %I TO %I',
    current_database(),
    'proofera_grant_claim_app'
  );
END;
$proofera_database_acl$;

REVOKE ALL ON SCHEMA proofera_altana_grant_claim FROM PUBLIC;
REVOKE ALL ON SCHEMA proofera_altana_grant_claim FROM proofera_grant_claim_app;
GRANT USAGE ON SCHEMA proofera_altana_grant_claim TO proofera_grant_claim_app;

CREATE TABLE proofera_altana_grant_claim.submission_claims (
  schema_version SMALLINT NOT NULL,
  bootstrap_id TEXT COLLATE pg_catalog."C" NOT NULL,
  idempotency_key TEXT COLLATE pg_catalog."C" NOT NULL,
  bootstrap_binding_hash TEXT COLLATE pg_catalog."C" NOT NULL,
  submission_binding_hash TEXT COLLATE pg_catalog."C" NOT NULL,
  prior_status TEXT COLLATE pg_catalog."C" NOT NULL,
  next_status TEXT COLLATE pg_catalog."C" NOT NULL,
  grant_submitted_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT proofera_grant_claims_pkey PRIMARY KEY (bootstrap_id),
  CONSTRAINT proofera_grant_claims_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT proofera_grant_claims_bootstrap_binding_hash_key UNIQUE (bootstrap_binding_hash),
  CONSTRAINT proofera_grant_claims_submission_binding_hash_key UNIQUE (submission_binding_hash),
  CONSTRAINT proofera_grant_claims_schema_version_check CHECK (schema_version = 1),
  CONSTRAINT proofera_grant_claims_bootstrap_id_length_check
    CHECK (char_length(bootstrap_id) BETWEEN 1 AND 128),
  CONSTRAINT proofera_grant_claims_bootstrap_id_format_check
    CHECK (bootstrap_id ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]*$'),
  CONSTRAINT proofera_grant_claims_idempotency_key_format_check
    CHECK (idempotency_key ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT proofera_grant_claims_bootstrap_binding_hash_format_check
    CHECK (bootstrap_binding_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT proofera_grant_claims_submission_binding_hash_format_check
    CHECK (submission_binding_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT proofera_grant_claims_prior_status_check CHECK (prior_status = 'grant_ready'),
  CONSTRAINT proofera_grant_claims_next_status_check CHECK (next_status = 'grant_submitting'),
  CONSTRAINT proofera_grant_claims_submitted_at_check
    CHECK (grant_submitted_at BETWEEN 0 AND 9007199254740991)
);

ALTER TABLE proofera_altana_grant_claim.submission_claims
  OWNER TO proofera_grant_claim_owner;
REVOKE ALL ON TABLE proofera_altana_grant_claim.submission_claims FROM PUBLIC;
REVOKE ALL ON TABLE proofera_altana_grant_claim.submission_claims
  FROM proofera_grant_claim_app;
GRANT SELECT, INSERT ON TABLE proofera_altana_grant_claim.submission_claims
  TO proofera_grant_claim_app;

CREATE TABLE proofera_altana_grant_claim.schema_receipt (
  migration_version SMALLINT NOT NULL,
  domain_schema_version SMALLINT NOT NULL,
  postgres_major SMALLINT NOT NULL,
  semantic_contract_sha256 TEXT COLLATE pg_catalog."C" NOT NULL,
  deployment_id UUID NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT proofera_grant_claim_receipt_pkey PRIMARY KEY (migration_version),
  CONSTRAINT proofera_grant_claim_receipt_migration_check CHECK (migration_version = 1),
  CONSTRAINT proofera_grant_claim_receipt_domain_check CHECK (domain_schema_version = 1),
  CONSTRAINT proofera_grant_claim_receipt_postgres_check CHECK (postgres_major = 17),
  CONSTRAINT proofera_grant_claim_receipt_semantic_hash_check
    CHECK (semantic_contract_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT proofera_grant_claim_receipt_deployment_id_check
    CHECK (deployment_id <> '00000000-0000-0000-0000-000000000000'::uuid)
);

ALTER TABLE proofera_altana_grant_claim.schema_receipt
  OWNER TO proofera_grant_claim_owner;
REVOKE ALL ON TABLE proofera_altana_grant_claim.schema_receipt FROM PUBLIC;
REVOKE ALL ON TABLE proofera_altana_grant_claim.schema_receipt
  FROM proofera_grant_claim_app;
GRANT SELECT (
  migration_version,
  domain_schema_version,
  postgres_major,
  semantic_contract_sha256,
  deployment_id
) ON TABLE proofera_altana_grant_claim.schema_receipt
  TO proofera_grant_claim_app;

CREATE FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $proofera_append_only$
BEGIN
  RAISE EXCEPTION 'ProofEra Altana grant-claim records are append-only'
    USING ERRCODE = '55000';
END;
$proofera_append_only$;

ALTER FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation()
  OWNER TO proofera_grant_claim_owner;
REVOKE ALL ON FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation()
  FROM proofera_grant_claim_app;

CREATE TRIGGER proofera_grant_claims_append_only
BEFORE UPDATE OR DELETE ON proofera_altana_grant_claim.submission_claims
FOR EACH ROW
EXECUTE FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation();

CREATE TRIGGER proofera_grant_claims_reject_truncate
BEFORE TRUNCATE ON proofera_altana_grant_claim.submission_claims
FOR EACH STATEMENT
EXECUTE FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation();

CREATE TRIGGER proofera_grant_claim_receipt_append_only
BEFORE UPDATE OR DELETE ON proofera_altana_grant_claim.schema_receipt
FOR EACH ROW
EXECUTE FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation();

CREATE TRIGGER proofera_grant_claim_receipt_reject_truncate
BEFORE TRUNCATE ON proofera_altana_grant_claim.schema_receipt
FOR EACH STATEMENT
EXECUTE FUNCTION proofera_altana_grant_claim.reject_submission_claim_mutation();

INSERT INTO proofera_altana_grant_claim.schema_receipt (
  migration_version,
  domain_schema_version,
  postgres_major,
  semantic_contract_sha256,
  deployment_id
)
VALUES (
  1,
  1,
  17,
  'fc81399172bf962fe4d0b017d58846a3651ca5ccd850004e20d280ebdad9639a',
  pg_catalog.gen_random_uuid()
);

RESET ROLE;

COMMIT;
