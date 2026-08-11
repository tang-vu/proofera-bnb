import { describe, expect, it } from "vitest";

import {
  isServerRpcUrlAllowed,
  readDataRuntimeConfig,
  readPasskeyRuntimeConfig,
  readServerRpcRuntimeConfig
} from "./runtime-config";

describe("readDataRuntimeConfig", () => {
  it("fails closed to strict mode when no mode is configured", () => {
    expect(readDataRuntimeConfig({ NODE_ENV: "development" })).toEqual({
      mode: "strict",
      permitsLivePublication: true
    });
  });

  it("allows explicit fixtures only outside production", () => {
    expect(readDataRuntimeConfig({ NODE_ENV: "test", PROOFERA_DATA_MODE: "fixture" })).toEqual({
      mode: "fixture",
      permitsLivePublication: false
    });
  });

  it("rejects fixture publication and unknown modes in production", () => {
    expect(() =>
      readDataRuntimeConfig({ NODE_ENV: "production", PROOFERA_DATA_MODE: "fixture" })
    ).toThrow(/forbidden in production/i);
    expect(() =>
      readDataRuntimeConfig({ NODE_ENV: "production", PROOFERA_DATA_MODE: "fallback" })
    ).toThrow();
  });
});

describe("readPasskeyRuntimeConfig", () => {
  it("uses an explicit loopback default only outside production", () => {
    expect(readPasskeyRuntimeConfig({ NODE_ENV: "development" })).toEqual({
      origin: "http://localhost:3000",
      rpId: "localhost",
      secureContextRequired: false
    });
  });

  it("accepts one exact canonical HTTPS origin and RP ID in production", () => {
    expect(
      readPasskeyRuntimeConfig({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_ORIGIN: "https://app.proofera.xyz",
        NEXT_PUBLIC_ALTANA_RP_ID: "app.proofera.xyz"
      })
    ).toEqual({
      origin: "https://app.proofera.xyz",
      rpId: "app.proofera.xyz",
      secureContextRequired: true
    });
  });

  it("fails closed on missing or insecure production configuration", () => {
    expect(() => readPasskeyRuntimeConfig({ NODE_ENV: "production" })).toThrow(/required/i);
    expect(() =>
      readPasskeyRuntimeConfig({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_ORIGIN: "http://app.proofera.xyz",
        NEXT_PUBLIC_ALTANA_RP_ID: "app.proofera.xyz"
      })
    ).toThrow(/HTTPS/i);
  });

  it("rejects RP drift, schemes, ports, paths, and embedded credentials", () => {
    const production = {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_ORIGIN: "https://app.proofera.xyz",
      NEXT_PUBLIC_ALTANA_RP_ID: "proofera.xyz"
    } as const;

    expect(() => readPasskeyRuntimeConfig(production)).toThrow(/exactly match/i);
    expect(() =>
      readPasskeyRuntimeConfig({
        ...production,
        NEXT_PUBLIC_ALTANA_RP_ID: "https://app.proofera.xyz"
      })
    ).toThrow();
    expect(() =>
      readPasskeyRuntimeConfig({
        ...production,
        NEXT_PUBLIC_APP_ORIGIN: "https://app.proofera.xyz/path",
        NEXT_PUBLIC_ALTANA_RP_ID: "app.proofera.xyz"
      })
    ).toThrow(/only scheme/i);
    expect(() =>
      readPasskeyRuntimeConfig({
        ...production,
        NEXT_PUBLIC_APP_ORIGIN: "https://user:secret@app.proofera.xyz",
        NEXT_PUBLIC_ALTANA_RP_ID: "app.proofera.xyz"
      })
    ).toThrow(/only scheme/i);
    expect(() =>
      readPasskeyRuntimeConfig({
        ...production,
        NEXT_PUBLIC_APP_ORIGIN: "https://app.proofera.xyz:8443",
        NEXT_PUBLIC_ALTANA_RP_ID: "app.proofera.xyz"
      })
    ).toThrow(/canonical HTTPS port/i);
  });

  it.each(["localhost", "127.0.0.1", "[::1]", "com", "co.uk", "internal", "app.proofera.example"])(
    "rejects non-public or non-registrable production host %s",
    (hostname) => {
      expect(() =>
        readPasskeyRuntimeConfig({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_ORIGIN: `https://${hostname}`,
          NEXT_PUBLIC_ALTANA_RP_ID: hostname
        })
      ).toThrow(/registrable public hostname/i);
    }
  );

  it("permits HTTP only for the exact localhost development exception", () => {
    expect(() =>
      readPasskeyRuntimeConfig({
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_ORIGIN: "http://127.0.0.1:3000",
        NEXT_PUBLIC_ALTANA_RP_ID: "127.0.0.1"
      })
    ).toThrow(/loopback hostname/i);
  });
});

describe("readServerRpcRuntimeConfig", () => {
  it("reports defaults and overrides without returning endpoint values", () => {
    expect(readServerRpcRuntimeConfig({ NODE_ENV: "production" })).toEqual({
      mainnet: "official-public-default",
      testnet: "official-public-default"
    });
    expect(
      readServerRpcRuntimeConfig({
        NODE_ENV: "production",
        BSC_RPC_URL: "https://rpc.example.net/private-path",
        BSC_TESTNET_RPC_URL: "https://testnet.example.net"
      })
    ).toEqual({ mainnet: "server-override", testnet: "server-override" });
  });

  it("rejects malformed and non-HTTPS production overrides", () => {
    expect(() =>
      readServerRpcRuntimeConfig({ NODE_ENV: "production", BSC_RPC_URL: "not-a-url" })
    ).toThrow(/absolute URL/i);
    expect(() =>
      readServerRpcRuntimeConfig({ NODE_ENV: "production", BSC_RPC_URL: "http://rpc.example" })
    ).toThrow(/HTTPS/i);
  });

  it("applies the same HTTPS production boundary to route-selected endpoints", () => {
    expect(
      isServerRpcUrlAllowed("https://rpc.example.net/keyed-path", { NODE_ENV: "production" })
    ).toBe(true);
    expect(
      isServerRpcUrlAllowed("http://rpc.example.net/keyed-path", { NODE_ENV: "production" })
    ).toBe(false);
    expect(isServerRpcUrlAllowed("http://localhost:8545", { NODE_ENV: "development" })).toBe(true);
    expect(isServerRpcUrlAllowed("", { NODE_ENV: "development" })).toBe(false);
  });
});
