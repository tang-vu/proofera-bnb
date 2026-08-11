import { describe, expect, it } from "vitest";

import { createHealthResponse } from "./route";

describe("health route", () => {
  it("reports process liveness without claiming configuration readiness", async () => {
    const response = createHealthResponse({
      NODE_ENV: "production",
      PROOFERA_DATA_MODE: "fixture",
      PROOFERA_BUILD_VERSION: "build-abc123"
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-proofera-service")).toBe("proofera-marketplace");
    await expect(response.json()).resolves.toEqual({
      build: "build-abc123",
      schemaVersion: "1",
      service: "proofera-marketplace",
      status: "ok"
    });
  });

  it("does not echo an invalid configured build label", async () => {
    const response = createHealthResponse({ PROOFERA_BUILD_VERSION: "bad value\nsecret" });
    await expect(response.json()).resolves.toMatchObject({ build: "development-unversioned" });
  });
});
