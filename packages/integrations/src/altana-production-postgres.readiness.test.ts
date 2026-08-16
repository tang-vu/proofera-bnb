import { afterAll, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";

vi.mock("server-only", () => ({}));

import { createAltanaGrantClaimPostgresServer } from "./altana-grant-claim-verified-store.server";
import { createAltanaLpPostgresPoolComposition } from "./altana-lp-postgres-pool.server";
import {
  isVerifiedAltanaLpReservationSchemaReady,
  verifyAltanaLpReservationPostgresSchema,
  type AltanaLpReservationAdminCatalogDatabase
} from "./altana-lp-reservation-schema-verifier";

const RUN_READINESS = process.env.PROOFERA_RUN_PRODUCTION_POSTGRES_READINESS === "1";
const LP_ADMIN_URL = "PROOFERA_LP_POSTGRES_ADMIN_URL";
const LP_APP_URL = "PROOFERA_LP_POSTGRES_APP_URL";
const GRANT_APP_URL = "PROOFERA_GRANT_POSTGRES_APP_URL";

const resources: Array<{ close: () => Promise<unknown> }> = [];

function requireExactUrl(setting: string, database: string, username: string): string {
  const value = process.env[setting];
  if (value === undefined || value.length === 0) {
    throw new Error(`${setting} is required for the explicit readiness ceremony.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${setting} is not a valid PostgreSQL URL.`);
  }
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port.length === 0 ||
    parsed.username !== username ||
    parsed.password.length === 0 ||
    decodeURIComponent(parsed.pathname) !== `/${database}` ||
    parsed.search.length !== 0 ||
    parsed.hash.length !== 0
  ) {
    throw new Error(`${setting} does not name the exact loopback deployment identity.`);
  }
  return value;
}

function adminCatalogDatabase(client: PoolClient): AltanaLpReservationAdminCatalogDatabase {
  return Object.freeze({
    executionBoundary: "server_admin_preflight" as const,
    query: async (statement: string, parameters: readonly (number | string)[]) =>
      client.query(statement, [...parameters])
  });
}

afterAll(async () => {
  await Promise.all(resources.splice(0).map(async (resource) => resource.close()));
});

describe.skipIf(!RUN_READINESS)("deployed ProofEra PostgreSQL readiness", () => {
  it("verifies the LP catalog and binds the direct-login application capability", async () => {
    const adminPool = new Pool({
      application_name: "proofera-lp-deployment-readiness-admin",
      connectionString: requireExactUrl(LP_ADMIN_URL, "proofera_altana_lp", "postgres"),
      connectionTimeoutMillis: 5_000,
      max: 1
    });
    resources.push({ close: async () => adminPool.end() });
    const client = await adminPool.connect();
    let verification;
    try {
      verification = await verifyAltanaLpReservationPostgresSchema(adminCatalogDatabase(client));
    } finally {
      client.release();
    }
    if (verification.status === "blocked") {
      throw new Error(
        `LP deployment schema verification blocked: ${verification.failedChecks.join(",")}`
      );
    }
    expect(verification).toMatchObject({ postgresMajor: 17, status: "ready" });
    expect(isVerifiedAltanaLpReservationSchemaReady(verification)).toBe(true);

    const runtime = createAltanaLpPostgresPoolComposition({
      connectionString: requireExactUrl(
        LP_APP_URL,
        "proofera_altana_lp",
        "proofera_activation_app"
      ),
      runtime: "test",
      tls: { mode: "disable" }
    });
    resources.push(runtime);
    await expect(runtime.probeApplicationAccess()).resolves.toEqual({
      status: "application_access_ready"
    });
    await expect(runtime.bindVerifiedSchema(verification)).resolves.toBeDefined();
  });

  it("verifies the grant-claim catalog through its direct-login application pool", async () => {
    const server = createAltanaGrantClaimPostgresServer({
      connectionString: requireExactUrl(
        GRANT_APP_URL,
        "proofera_altana_grant_claim",
        "proofera_grant_claim_app"
      ),
      runtime: "test",
      tls: { mode: "disable" }
    });
    resources.push(server);
    await expect(server.verifyReadiness()).resolves.toMatchObject({
      postgresMajor: 17,
      status: "ready"
    });
  });
});
