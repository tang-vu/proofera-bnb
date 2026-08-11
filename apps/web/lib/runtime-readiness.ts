import { z } from "zod";

import {
  readDataRuntimeConfig,
  readPasskeyRuntimeConfig,
  readServerRpcRuntimeConfig
} from "./runtime-config";

export const PROOFERA_SERVICE_NAME = "proofera-marketplace" as const;
export const RUNTIME_STATUS_SCHEMA_VERSION = "1" as const;

const buildIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);

export type RuntimeReadinessReasonCode =
  | "ACTIVATION_PATH_UNAVAILABLE"
  | "BUILD_IDENTITY_INVALID"
  | "DATA_MODE_INVALID"
  | "PASSKEY_BOUNDARY_INVALID"
  | "RPC_CONFIGURATION_INVALID"
  | "STRICT_PUBLICATION_DISABLED";

export type RuntimeReadinessEvaluation = {
  readonly body:
    | {
        readonly build: string;
        readonly capabilities: {
          readonly activation: "unavailable";
          readonly bscRpc: "configured_unprobed";
          readonly listaYieldReads: "configured_unprobed";
          readonly marketplacePublication: "configured_unprobed";
          readonly pancakePositionReads: "configured_unprobed";
          readonly passkeyBoundary: "configured";
          readonly registryReads: "configured_unprobed";
          readonly venusHealthReads: "configured_unprobed";
        };
        readonly readyForActivation: false;
        readonly readyForJudging: false;
        readonly schemaVersion: typeof RUNTIME_STATUS_SCHEMA_VERSION;
        readonly service: typeof PROOFERA_SERVICE_NAME;
        readonly status: "not_ready";
      }
    | {
        readonly build: string;
        readonly readyForActivation: false;
        readonly readyForJudging: false;
        readonly schemaVersion: typeof RUNTIME_STATUS_SCHEMA_VERSION;
        readonly service: typeof PROOFERA_SERVICE_NAME;
        readonly status: "misconfigured";
      };
  readonly reasonCode: RuntimeReadinessReasonCode;
  readonly status: 503;
};

function configuredBuildIdentifier(
  environment: Readonly<Record<string, string | undefined>>
): string | null {
  const candidate =
    environment.PROOFERA_BUILD_VERSION ??
    environment.VERCEL_GIT_COMMIT_SHA ??
    environment.GITHUB_SHA;
  if (candidate === undefined) return null;
  const parsed = buildIdentifierSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** A non-secret immutable build label, never raw request or configuration data. */
export function publicBuildIdentifier(
  environment: Readonly<Record<string, string | undefined>> = process.env
): string {
  return configuredBuildIdentifier(environment) ?? "development-unversioned";
}

function misconfigured(
  environment: Readonly<Record<string, string | undefined>>,
  reasonCode: Exclude<RuntimeReadinessReasonCode, "ACTIVATION_PATH_UNAVAILABLE">
): RuntimeReadinessEvaluation {
  return {
    body: {
      build: publicBuildIdentifier(environment),
      readyForActivation: false,
      readyForJudging: false,
      schemaVersion: RUNTIME_STATUS_SCHEMA_VERSION,
      service: PROOFERA_SERVICE_NAME,
      status: "misconfigured"
    },
    reasonCode,
    status: 503
  };
}

/**
 * Cheap configuration readiness, deliberately not a provider-health probe.
 * Until the signer bootstrap, exact authority probe, and worker handoff exist,
 * no environment flag can turn activation readiness green.
 */
export function evaluateRuntimeReadiness(
  environment: Readonly<Record<string, string | undefined>> = process.env
): RuntimeReadinessEvaluation {
  let data;
  try {
    data = readDataRuntimeConfig(environment);
  } catch {
    return misconfigured(environment, "DATA_MODE_INVALID");
  }
  if (!data.permitsLivePublication) {
    return misconfigured(environment, "STRICT_PUBLICATION_DISABLED");
  }

  try {
    readPasskeyRuntimeConfig(environment);
  } catch {
    return misconfigured(environment, "PASSKEY_BOUNDARY_INVALID");
  }

  try {
    readServerRpcRuntimeConfig(environment);
  } catch {
    return misconfigured(environment, "RPC_CONFIGURATION_INVALID");
  }

  const build = configuredBuildIdentifier(environment);
  if (environment.NODE_ENV === "production" && build === null) {
    return misconfigured(environment, "BUILD_IDENTITY_INVALID");
  }

  return {
    body: {
      build: build ?? "development-unversioned",
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
      schemaVersion: RUNTIME_STATUS_SCHEMA_VERSION,
      service: PROOFERA_SERVICE_NAME,
      status: "not_ready"
    },
    reasonCode: "ACTIVATION_PATH_UNAVAILABLE",
    status: 503
  };
}
