import {
  createVenusHealthReader,
  VENUS_CORE_POOL_BSC_DEPLOYMENTS,
  type VenusAccountRiskSnapshotResult,
  type VenusHealthReadClient,
  type VenusHealthReader
} from "@proofera/integrations";
import { z } from "zod";

import type { VenusHealthInput } from "./venus-health-query";

const MAXIMUM_BLOCK_AGE_SECONDS = 120;
const UINT256_MAX = (1n << 256n) - 1n;

const latestBlockSchema = z.looseObject({
  number: z.bigint().min(0n).max(UINT256_MAX),
  hash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((value) => value.toLowerCase() as `0x${string}`)
});

export interface VenusHealthLatestBlockUnavailable {
  readonly status: "unavailable";
  readonly reason: "latest_block_error" | "latest_block_incompatible" | "rpc_configuration";
  readonly stage: "latest_block";
  readonly message: string;
  readonly retryable: boolean;
  readonly contractErrorCode: null;
  readonly observedAt: string;
  readonly provenance: null;
  readonly executionEnabled: false;
}

export type VenusHealthRouteResult =
  VenusAccountRiskSnapshotResult | VenusHealthLatestBlockUnavailable;

export interface VenusHealthReadDependencies {
  readonly client: VenusHealthReadClient;
  readonly getLatestBlock: () => Promise<unknown>;
  readonly createReader?: (client: VenusHealthReadClient) => VenusHealthReader;
  readonly now?: () => Date;
}

export function venusRpcConfigurationUnavailable(): VenusHealthLatestBlockUnavailable {
  return {
    status: "unavailable",
    reason: "rpc_configuration",
    stage: "latest_block",
    message: "The configured server-side BSC RPC endpoint is invalid.",
    retryable: false,
    contractErrorCode: null,
    observedAt: new Date().toISOString(),
    provenance: null,
    executionEnabled: false
  };
}

export async function readVenusAccountLiquidityAtLatestBlock(
  input: VenusHealthInput,
  dependencies: VenusHealthReadDependencies
): Promise<VenusHealthRouteResult> {
  const observedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  let latestRaw: unknown;
  try {
    latestRaw = await dependencies.getLatestBlock();
  } catch {
    return {
      status: "unavailable",
      reason: "latest_block_error",
      stage: "latest_block",
      message: "The server-side BSC RPC provider did not return the latest block.",
      retryable: true,
      contractErrorCode: null,
      observedAt,
      provenance: null,
      executionEnabled: false
    };
  }

  const latest = latestBlockSchema.safeParse(latestRaw);
  if (!latest.success) {
    return {
      status: "unavailable",
      reason: "latest_block_incompatible",
      stage: "latest_block",
      message: "The server-side BSC RPC provider returned an invalid latest block identity.",
      retryable: false,
      contractErrorCode: null,
      observedAt,
      provenance: null,
      executionEnabled: false
    };
  }

  const createReader =
    dependencies.createReader ??
    ((client: VenusHealthReadClient) =>
      createVenusHealthReader({ client, ...(dependencies.now ? { now: dependencies.now } : {}) }));
  const deployment = VENUS_CORE_POOL_BSC_DEPLOYMENTS[input.chainId];
  const reader = createReader(dependencies.client);

  return reader.getAccountRiskSnapshot({
    chainId: input.chainId,
    account: input.account,
    comptrollerAddress: deployment.comptroller,
    blockNumber: latest.data.number.toString(10),
    expectedBlockHash: latest.data.hash,
    maximumBlockAgeSeconds: MAXIMUM_BLOCK_AGE_SECONDS
  });
}
