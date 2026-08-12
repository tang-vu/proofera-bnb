import "server-only";

import {
  createBscTestnetDeployerCustodyProbeCore,
  parseBscTestnetDeployerCustodyConfiguration,
  type BscTestnetDeployerCustodyConfiguration,
  type BscTestnetDeployerCustodyProbe
} from "./bsc-testnet-deployer-custody-core";
import { probeWindowsBscTestnetDeployerCustody } from "./bsc-testnet-deployer-custody-windows.server";

/**
 * Implementation evidence only. This probe does not establish funding, RPC
 * reachability, deployment authority, or an executable transaction path.
 */
export const BSC_TESTNET_DEPLOYER_CUSTODY_RELEASE_READINESS = Object.freeze({
  deploymentReady: false,
  fundingVerified: false,
  localUnlockAndAddressMatchVerified: true,
  readinessProbeImplemented: true,
  releaseReady: false,
  rpcConfigured: false,
  signingCapabilityImplemented: false
});

export type BscTestnetDeployerCustodyServerErrorCode =
  "CONFIGURATION_INVALID" | "SERVER_RUNTIME_REQUIRED";

const ERROR_MESSAGES: Readonly<Record<BscTestnetDeployerCustodyServerErrorCode, string>> =
  Object.freeze({
    CONFIGURATION_INVALID: "The BSC testnet deployer custody configuration is invalid.",
    SERVER_RUNTIME_REQUIRED: "The BSC testnet deployer custody probe is server-only."
  });

/** Safe construction error: it retains no path, OS error, process output, or secret. */
export class BscTestnetDeployerCustodyServerError extends Error {
  override readonly name = "BscTestnetDeployerCustodyServerError";
  readonly code: BscTestnetDeployerCustodyServerErrorCode;

  constructor(code: BscTestnetDeployerCustodyServerErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
  }
}

function assertServerRuntime(): void {
  if (
    typeof process === "undefined" ||
    process.release?.name !== "node" ||
    (typeof window !== "undefined" && typeof window.document !== "undefined")
  ) {
    throw new BscTestnetDeployerCustodyServerError("SERVER_RUNTIME_REQUIRED");
  }
}

/**
 * Creates the wallet-specific, chain-97-only readiness probe. Configuration is
 * explicit and contains paths only; this module does not read environment variables.
 */
export function createWindowsBscTestnetDeployerCustodyProbe(
  unparsedConfiguration: BscTestnetDeployerCustodyConfiguration
): BscTestnetDeployerCustodyProbe {
  assertServerRuntime();
  const configuration = parseBscTestnetDeployerCustodyConfiguration(unparsedConfiguration);
  if (configuration === null) {
    throw new BscTestnetDeployerCustodyServerError("CONFIGURATION_INVALID");
  }
  return createBscTestnetDeployerCustodyProbeCore(
    configuration,
    probeWindowsBscTestnetDeployerCustody
  );
}

export type {
  BscTestnetDeployerCustodyCloseResult,
  BscTestnetDeployerCustodyConfiguration,
  BscTestnetDeployerCustodyProbe,
  BscTestnetDeployerCustodyReadiness,
  BscTestnetDeployerCustodyUnavailableReason
} from "./bsc-testnet-deployer-custody-core";
