import "server-only";

import { createPublicClient, http } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import type { VenusHealthInput } from "./venus-health-query";
import { isServerRpcUrlAllowed } from "./runtime-config";
import {
  readVenusAccountLiquidityAtLatestBlock,
  venusRpcConfigurationUnavailable,
  type VenusHealthRouteResult
} from "./venus-health-service";

/**
 * Official BNB Chain public endpoints checked 2026-08-11:
 * https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/
 */
const OFFICIAL_PUBLIC_RPC = {
  56: "https://bsc-dataseed-public.bnbchain.org",
  97: "https://bsc-testnet-dataseed.bnbchain.org"
} as const;

function configuredRpcUrl(input: VenusHealthInput): string | null {
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

export async function loadLiveVenusHealth(
  input: VenusHealthInput
): Promise<VenusHealthRouteResult> {
  const rpcUrl = configuredRpcUrl(input);
  if (rpcUrl === null) return venusRpcConfigurationUnavailable();

  const chain = input.chainId === 56 ? bsc : bscTestnet;
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { retryCount: 1, timeout: 8_000 })
  });

  return readVenusAccountLiquidityAtLatestBlock(input, {
    client,
    getLatestBlock: () => client.getBlock({ blockTag: "latest" })
  });
}
