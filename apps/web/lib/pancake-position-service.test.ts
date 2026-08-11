import {
  PANCAKE_V3_BSC_DEPLOYMENTS,
  type CreatePancakeV3LatestPositionReaderOptions,
  type PancakeV3LatestPositionReader,
  type PancakeV3LatestReadClient
} from "@proofera/integrations";
import { describe, expect, it, vi } from "vitest";

import {
  readPancakePositionAtLatestBlock,
  rpcConfigurationUnavailable
} from "./pancake-position-service";

const POOL = "0x1111111111111111111111111111111111111111";

function unusedClient(): PancakeV3LatestReadClient {
  return {
    getChainId: vi.fn(),
    getBlock: vi.fn(),
    multicall: vi.fn()
  };
}

describe("readPancakePositionAtLatestBlock", () => {
  it.each([56, 97] as const)(
    "passes chain %s to the atomic latest reader with the official manager",
    async (chainId) => {
      const unavailable = {
        status: "unavailable" as const,
        reason: "read_error" as const,
        stage: "snapshot" as const,
        message: "sentinel",
        retryable: true,
        observedAt: "2026-08-11T18:00:00.000Z",
        chainId,
        blockNumber: null
      };
      const getPositionSnapshot = vi.fn(async () => unavailable);
      const createReader = vi.fn(
        (options: CreatePancakeV3LatestPositionReaderOptions): PancakeV3LatestPositionReader => {
          void options;
          return { getPositionSnapshot };
        }
      );
      const client = unusedClient();
      const now = () => new Date("2026-08-11T18:00:00.000Z");

      await expect(
        readPancakePositionAtLatestBlock(
          { chainId, poolAddress: POOL, positionId: "900719925474099312345" },
          { client, createReader, now }
        )
      ).resolves.toEqual(unavailable);

      expect(createReader).toHaveBeenCalledWith({ client, now });
      expect(getPositionSnapshot).toHaveBeenCalledWith({
        chainId,
        positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[chainId].positionManager,
        poolAddress: POOL,
        positionId: "900719925474099312345",
        maximumBlockAgeSeconds: 120
      });
    }
  );

  it("does not prefetch a latest block or translate a reader failure", async () => {
    const client = unusedClient();
    const result = {
      status: "unavailable" as const,
      reason: "reorg_detected" as const,
      stage: "block_identity" as const,
      message: "The exact block identity changed.",
      retryable: true,
      observedAt: "2026-08-11T18:00:00.000Z",
      chainId: 56 as const,
      blockNumber: "42000000"
    };
    const createReader = vi.fn((): PancakeV3LatestPositionReader => ({
      getPositionSnapshot: vi.fn(async () => result)
    }));

    await expect(
      readPancakePositionAtLatestBlock(
        { chainId: 56, poolAddress: POOL, positionId: "1" },
        { client, createReader }
      )
    ).resolves.toEqual(result);
    expect(client.getBlock).not.toHaveBeenCalled();
    expect(client.multicall).not.toHaveBeenCalled();
  });

  it("returns a bounded, source-free configuration failure", () => {
    expect(rpcConfigurationUnavailable()).toMatchObject({
      status: "unavailable",
      reason: "rpc_configuration",
      stage: "configuration",
      retryable: false,
      chainId: null,
      blockNumber: null
    });
  });
});
