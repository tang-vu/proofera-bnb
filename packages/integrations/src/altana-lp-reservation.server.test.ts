import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as serverReservationBoundary from "@proofera/integrations/server/altana-lp-reservation";

describe("Altana LP reservation server subpath", () => {
  it("exports only schema verification and the gated pool composition", () => {
    expect(serverReservationBoundary).toMatchObject({
      createAltanaLpPostgresPoolComposition: expect.any(Function),
      isVerifiedAltanaLpDurableReservationDependency: expect.any(Function),
      verifyAltanaLpReservationPostgresSchema: expect.any(Function)
    });
    expect(serverReservationBoundary).toHaveProperty(
      "ALTANA_LP_POSTGRES_APPLICATION_ACCESS_PROBE_SQL"
    );
    expect(serverReservationBoundary).toHaveProperty("ALTANA_LP_RESERVATION_SCHEMA_VERIFY_SQL");
    expect(serverReservationBoundary).not.toHaveProperty(
      "createNodePostgresAltanaLpReservationDatabase"
    );
    expect(serverReservationBoundary).not.toHaveProperty(
      "createPostgresAltanaLpReservationDependency"
    );
  });
});
