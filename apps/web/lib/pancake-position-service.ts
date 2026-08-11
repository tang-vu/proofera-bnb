import {
  createPancakeV3LatestPositionReader,
  PANCAKE_V3_BSC_DEPLOYMENTS,
  type CreatePancakeV3LatestPositionReaderOptions,
  type PancakeV3LatestPositionReader,
  type PancakeV3LatestReadClient,
  type PancakeV3LatestSnapshotResult
} from "@proofera/integrations";

import type { PancakePositionInput } from "./pancake-position-query";

const MAXIMUM_BLOCK_AGE_SECONDS = 120;

export interface PancakePositionRpcConfigurationUnavailable {
  readonly status: "unavailable";
  readonly reason: "rpc_configuration";
  readonly stage: "configuration";
  readonly message: string;
  readonly retryable: false;
  readonly observedAt: string;
  readonly chainId: null;
  readonly blockNumber: null;
}

export type PancakePositionRouteResult =
  PancakeV3LatestSnapshotResult | PancakePositionRpcConfigurationUnavailable;

export interface PancakePositionReadDependencies {
  readonly client: PancakeV3LatestReadClient;
  readonly createReader?: (
    options: CreatePancakeV3LatestPositionReaderOptions
  ) => PancakeV3LatestPositionReader;
  readonly now?: () => Date;
}

export function rpcConfigurationUnavailable(): PancakePositionRpcConfigurationUnavailable {
  return {
    status: "unavailable",
    reason: "rpc_configuration",
    stage: "configuration",
    message: "The configured server-side BSC RPC endpoint is invalid.",
    retryable: false,
    observedAt: new Date().toISOString(),
    chainId: null,
    blockNumber: null
  };
}

/**
 * Reads the publishable snapshot through one latest Multicall3 batch. The
 * reader's discovery batch is routing input only and never enters evidence.
 */
export async function readPancakePositionAtLatestBlock(
  input: PancakePositionInput,
  dependencies: PancakePositionReadDependencies
): Promise<PancakePositionRouteResult> {
  const reader = (dependencies.createReader ?? createPancakeV3LatestPositionReader)({
    client: dependencies.client,
    now: dependencies.now ?? (() => new Date())
  });
  const deployment = PANCAKE_V3_BSC_DEPLOYMENTS[input.chainId];

  return reader.getPositionSnapshot({
    chainId: input.chainId,
    positionManagerAddress: deployment.positionManager,
    poolAddress: input.poolAddress,
    positionId: input.positionId,
    maximumBlockAgeSeconds: MAXIMUM_BLOCK_AGE_SECONDS
  });
}
