import { isIP } from "node:net";

const DEFAULT_PORT = 9_000;
const DEFAULT_BIND_HOST = "0.0.0.0";
const DEFAULT_PUBLIC_HOST = "localhost";

export const UNSUPPORTED_AUTH_ADVERTISEMENT_ENVIRONMENT_NAMES = [
  "OAUTH_TOKEN_URL",
  "OAUTH_SCOPE"
] as const;

export interface RuntimeConfig {
  bindHost: string;
  port: number;
  publicUrl: string;
}

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * This analysis-only release is intentionally unauthenticated. Refuse config
 * that would make the public Agent Card imply authentication is enforced.
 */
export function assertUnauthenticatedGridConfiguration(
  environment: RuntimeEnvironment = process.env
): void {
  const configured = UNSUPPORTED_AUTH_ADVERTISEMENT_ENVIRONMENT_NAMES.filter(
    (name) => environment[name] !== undefined
  );
  if (configured.length > 0) {
    throw new Error(
      `Unsupported authentication advertisement configuration: ${configured.join(", ")}. ` +
        "The Grid analyzer does not advertise authentication until enforcement exists."
    );
  }
}

/** Resolve only non-secret transport configuration with fail-safe defaults. */
export function resolveRuntimeConfig(environment: RuntimeEnvironment = process.env): RuntimeConfig {
  assertUnauthenticatedGridConfiguration(environment);
  const port = parsePort(environment.AGENT_PORT);
  const bindHost = validHost(environment.AGENT_BIND_HOST)
    ? environment.AGENT_BIND_HOST
    : DEFAULT_BIND_HOST;
  return {
    bindHost,
    port,
    publicUrl:
      safeRuntimeUrl(environment.AGENTCORE_RUNTIME_URL) ?? localPublicUrl(environment, port)
  };
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || !/^[1-9][0-9]{0,4}$/.test(raw)) return DEFAULT_PORT;
  const port = Number(raw);
  return port <= 65_535 ? port : DEFAULT_PORT;
}

function safeRuntimeUrl(raw: string | undefined): string | null {
  if (raw === undefined || raw.length > 2_048) return null;
  try {
    const parsed = new URL(raw);
    const secure = parsed.protocol === "https:";
    const localHttp = parsed.protocol === "http:" && isLoopback(parsed.hostname);
    if (
      (!secure && !localHttp) ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.hash !== "" ||
      parsed.search !== ""
    ) {
      return null;
    }
    parsed.pathname = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
    return parsed.toString();
  } catch {
    return null;
  }
}

function localPublicUrl(environment: RuntimeEnvironment, port: number): string {
  const configuredHost = environment.AGENT_HOST;
  const host =
    configuredHost !== undefined && isLoopback(configuredHost)
      ? configuredHost
      : DEFAULT_PUBLIC_HOST;
  const renderedHost = host.includes(":") ? `[${host}]` : host;
  return `http://${renderedHost}:${String(port)}/`;
}

function validHost(value: string | undefined): value is string {
  if (value === undefined || value.length === 0 || value.length > 253) return false;
  if (isIP(value) !== 0) return true;
  return value
    .split(".")
    .every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
    );
}

function isLoopback(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
