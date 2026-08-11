import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as serverBoundary from "@proofera/integrations/server/altana-grant-claim";

import * as browserSafeRoot from "./index";

describe("Altana grant-claim package-boundary design", () => {
  it("keeps grant SQL, parsers, transactions, and verifier machinery out of the root surface", () => {
    const rootKeys = Object.keys(browserSafeRoot);
    for (const forbidden of [
      "ALTANA_GRANT_CLAIM_INSERT_SQL",
      "ALTANA_GRANT_CLAIM_SCHEMA_VERIFY_SQL",
      "executeAltanaGrantClaimPostgresTransaction",
      "interpretAltanaGrantClaimSchemaProjection",
      "parseAltanaGrantClaimReceiptProjection"
    ]) {
      expect(rootKeys).not.toContain(forbidden);
    }
  });

  it("limits the intended server subpath to construction, sanitized construction error, and evidence flags", () => {
    expect(Object.keys(serverBoundary).sort()).toEqual([
      "ALTANA_GRANT_CLAIM_POSTGRES_RELEASE_READINESS",
      "AltanaGrantClaimPostgresServerError",
      "createAltanaGrantClaimPostgresServer"
    ]);
  });
});
