import "server-only";

import { type PancakeV3LatestReadClient } from "@proofera/integrations";
import { createPublicClient, http } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import type { PancakePositionInput } from "./pancake-position-query";
import { isServerRpcUrlAllowed } from "./runtime-config";
import {
  readPancakePositionAtLatestBlock,
  rpcConfigurationUnavailable,
  type PancakePositionRouteResult
} from "./pancake-position-service";

/**
 * Official BNB Chain public endpoints checked 2026-08-11:
 * https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/
 */
const OFFICIAL_PUBLIC_RPC = {
  56: "https://bsc-dataseed-public.bnbchain.org",
  97: "https://bsc-testnet-dataseed.bnbchain.org"
} as const;

function configuredRpcUrl(input: PancakePositionInput): string | null {
  const configured =
    input.chainId === 56
      ? process.env.BSC_RPC_URL?.trim()
      : process.env.BSC_TESTNET_RPC_URL?.trim();
  const selected =
    configured === undefined || configured.length === 0
      ? OFFICIAL_PUBLIC_RPC[input.chainId]
      : configured;

  return isServerRpcUrlAllowed(selected) ? selected : null;
}

export async function loadLivePancakePosition(
  input: PancakePositionInput
): Promise<PancakePositionRouteResult> {
  const rpcUrl = configuredRpcUrl(input);
  if (rpcUrl === null) return rpcConfigurationUnavailable();

  const chain = input.chainId === 56 ? bsc : bscTestnet;
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { retryCount: 1, timeout: 8_000 })
  });
  const latestClient: PancakeV3LatestReadClient = {
    getChainId: () => client.getChainId(),
    getBlock: ({ blockNumber }) => client.getBlock({ blockNumber }),
    multicall: (parameters) => client.multicall(parameters)
  };

  return readPancakePositionAtLatestBlock(input, {
    client: latestClient
  });
}
