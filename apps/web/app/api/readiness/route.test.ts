import { describe, expect, it, vi } from "vitest";

import { createReadinessResponse } from "./route";

const validProduction = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_ORIGIN: "https://app.proofera.xyz",
  NEXT_PUBLIC_ALTANA_RP_ID: "app.proofera.xyz",
  PROOFERA_BUILD_VERSION: "git-abc123",
  PROOFERA_DATA_MODE: "strict"
} as const;

describe("readiness route", () => {
  it("keeps a valid read configuration non-ready until activation exists", async () => {
    const log = vi.fn();
    const response = createReadinessResponse(validProduction, log);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-proofera-service")).toBe("proofera-marketplace");
    await expect(response.json()).resolves.toEqual({
      build: "git-abc123",
      capabilities: {
        activation: "unavailable",
        bscRpc: "configured_unprobed",
        listaYieldReads: "configured_unprobed",
        marketplacePublication: "configured_unprobed",
        pancakePositionReads: "configured_unprobed",
        passkeyBoundary: "configured",
        registryReads: "configured_unprobed",
        venusHealthReads: "configured_unprobed"
      },
      readyForActivation: false,
      readyForJudging: false,
      schemaVersion: "1",
      service: "proofera-marketplace",
      status: "not_ready"
    });
    expect(log).toHaveBeenCalledWith({
      event: "runtime_readiness_not_ready",
      reasonCode: "ACTIVATION_PATH_UNAVAILABLE"
    });
  });

  it.each([
    {
      label: "missing production passkey configuration",
      environment: { NODE_ENV: "production", PROOFERA_BUILD_VERSION: "build-1" },
      reasonCode: "PASSKEY_BOUNDARY_INVALID"
    },
    {
      label: "fixture publication",
      environment: { ...validProduction, PROOFERA_DATA_MODE: "fixture" },
      reasonCode: "DATA_MODE_INVALID"
    },
    {
      label: "RP drift",
      environment: { ...validProduction, NEXT_PUBLIC_ALTANA_RP_ID: "proofera.xyz" },
      reasonCode: "PASSKEY_BOUNDARY_INVALID"
    },
    {
      label: "public-suffix host",
      environment: {
        ...validProduction,
        NEXT_PUBLIC_APP_ORIGIN: "https://com",
        NEXT_PUBLIC_ALTANA_RP_ID: "com"
      },
      reasonCode: "PASSKEY_BOUNDARY_INVALID"
    },
    {
      label: "non-HTTPS RPC override",
      environment: { ...validProduction, BSC_RPC_URL: "http://rpc.proofera.xyz" },
      reasonCode: "RPC_CONFIGURATION_INVALID"
    },
    {
      label: "missing immutable build label",
      environment: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_ORIGIN: "https://app.proofera.xyz",
        NEXT_PUBLIC_ALTANA_RP_ID: "app.proofera.xyz"
      },
      reasonCode: "BUILD_IDENTITY_INVALID"
    }
  ])("returns a generic no-store 503 for $label", async ({ environment, reasonCode }) => {
    const log = vi.fn();
    const response = createReadinessResponse(environment, log);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      readyForActivation: false,
      readyForJudging: false,
      service: "proofera-marketplace",
      status: "misconfigured"
    });
    expect(JSON.stringify(body)).not.toMatch(/origin|rp.?id|rpc|fixture|secret/i);
    expect(log).toHaveBeenCalledWith({
      event: "runtime_readiness_not_ready",
      reasonCode
    });
  });
});
