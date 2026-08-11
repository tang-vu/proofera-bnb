import { parse as parseDomain } from "tldts";
import { z } from "zod";

const dataModeSchema = z.enum(["strict", "fixture"]);

export interface DataRuntimeConfig {
  readonly mode: "strict" | "fixture";
  readonly permitsLivePublication: boolean;
}

export interface PasskeyRuntimeConfig {
  readonly origin: string;
  readonly rpId: string;
  readonly secureContextRequired: boolean;
}

export interface ServerRpcRuntimeConfig {
  readonly mainnet: "official-public-default" | "server-override";
  readonly testnet: "official-public-default" | "server-override";
}

const rpIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(
    /^(?:localhost|127\.0\.0\.1|\[[0-9a-f:]+\]|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*)$/,
    "WebAuthn RP ID must be a canonical lowercase hostname without a scheme, port, or path"
  );

function parseCanonicalOrigin(value: string, production: boolean): URL {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_ORIGIN must be an absolute URL");
  }

  if (
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== "" ||
    origin.username !== "" ||
    origin.password !== ""
  ) {
    throw new Error("NEXT_PUBLIC_APP_ORIGIN must contain only scheme, hostname, and optional port");
  }

  const loopback = origin.hostname === "localhost";
  if (production ? origin.protocol !== "https:" : origin.protocol !== "https:" && !loopback) {
    throw new Error(
      production
        ? "Production passkey origin must use HTTPS"
        : "A non-HTTPS development origin must use a loopback hostname"
    );
  }

  if (production && origin.port !== "") {
    throw new Error("Production passkey origin must use the canonical HTTPS port");
  }

  if (production) {
    const domain = parseDomain(origin.hostname, {
      allowPrivateDomains: true,
      detectSpecialUse: true,
      extractHostname: false,
      validateHostname: true
    });
    if (
      domain.isIp === true ||
      domain.isSpecialUse === true ||
      domain.domain === null ||
      domain.publicSuffix === origin.hostname
    ) {
      throw new Error(
        "Production passkey origin must use a registrable public hostname, not an IP, special-use name, or public suffix"
      );
    }
  }

  return origin;
}

function assertServerRpcUrl(candidate: string, production: boolean): void {
  if (candidate.length > 2_048) throw new Error("A server RPC URL exceeds the configured limit");

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("A server RPC override must be an absolute URL");
  }
  const protocolAllowed = production
    ? parsed.protocol === "https:"
    : parsed.protocol === "https:" || parsed.protocol === "http:";
  if (!protocolAllowed) {
    throw new Error("Server RPC URLs must use HTTPS in production and HTTP(S) otherwise");
  }
}

function parseServerRpcOverride(
  value: string | undefined,
  production: boolean
): "official-public-default" | "server-override" {
  const candidate = value?.trim();
  if (candidate === undefined || candidate.length === 0) return "official-public-default";
  assertServerRpcUrl(candidate, production);
  return "server-override";
}

/**
 * Shared route boundary for an already selected server-side RPC endpoint. It
 * returns no endpoint value, and therefore cannot expose a configured key.
 */
export function isServerRpcUrlAllowed(
  value: string,
  environment: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  const candidate = value.trim();
  if (candidate.length === 0) return false;
  try {
    assertServerRpcUrl(candidate, environment.NODE_ENV === "production");
    return true;
  } catch {
    return false;
  }
}

/**
 * Strict live data is the fail-closed default. Fixture mode is available only
 * to explicit local/test harnesses and can never publish from a production
 * runtime.
 */
export function readDataRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env
): DataRuntimeConfig {
  const mode = dataModeSchema.parse(environment.PROOFERA_DATA_MODE ?? "strict");
  if (environment.NODE_ENV === "production" && mode === "fixture") {
    throw new Error("PROOFERA_DATA_MODE=fixture is forbidden in production");
  }

  return {
    mode,
    permitsLivePublication: mode === "strict"
  };
}

/**
 * Reads the stable WebAuthn boundary without consulting request Host headers.
 * Production requires one exact HTTPS hostname/RP-ID pair so create, recover,
 * grant, and revoke ceremonies cannot drift across preview domains.
 */
export function readPasskeyRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env
): PasskeyRuntimeConfig {
  const production = environment.NODE_ENV === "production";
  const rawOrigin = environment.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (production && (rawOrigin === undefined || rawOrigin.length === 0)) {
    throw new Error("NEXT_PUBLIC_APP_ORIGIN is required in production");
  }

  const origin = parseCanonicalOrigin(rawOrigin || "http://localhost:3000", production);
  const rawRpId = environment.NEXT_PUBLIC_ALTANA_RP_ID?.trim();
  if (production && (rawRpId === undefined || rawRpId.length === 0)) {
    throw new Error("NEXT_PUBLIC_ALTANA_RP_ID is required in production");
  }
  const rpId = rpIdSchema.parse(rawRpId || origin.hostname);

  if (rpId !== origin.hostname) {
    throw new Error("WebAuthn RP ID must exactly match the configured canonical origin hostname");
  }

  return {
    origin: origin.origin,
    rpId,
    secureContextRequired: production
  };
}

/**
 * Validates server-only RPC configuration without returning endpoint values.
 * This proves configuration shape only; it is never reported as a live probe.
 */
export function readServerRpcRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env
): ServerRpcRuntimeConfig {
  const production = environment.NODE_ENV === "production";
  return {
    mainnet: parseServerRpcOverride(environment.BSC_RPC_URL, production),
    testnet: parseServerRpcOverride(environment.BSC_TESTNET_RPC_URL, production)
  };
}
