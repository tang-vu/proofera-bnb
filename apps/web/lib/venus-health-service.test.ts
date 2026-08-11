import {
  VENUS_CORE_POOL_BSC_DEPLOYMENTS,
  type VenusHealthReadClient,
  type VenusHealthReader
} from "@proofera/integrations";
import { describe, expect, it, vi } from "vitest";

import { readVenusAccountLiquidityAtLatestBlock } from "./venus-health-service";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const BLOCK_NUMBER = 42_000_000n;
const BLOCK_HASH = `0x${"ab".repeat(32)}` as const;

function unusedClient(): VenusHealthReadClient {
  return {
    getChainId: vi.fn(),
    getBlock: vi.fn(),
    getCode: vi.fn(),
    readContract: vi.fn()
  };
}

describe("readVenusAccountLiquidityAtLatestBlock", () => {
  it.each([56, 97] as const)(
    "pins BSC chain %s to the fetched hash and official Comptroller",
    async (chainId) => {
      const getAccountRiskSnapshot = vi.fn(async () => ({
        status: "unavailable" as const,
        reason: "read_error" as const,
        stage: "liquidity" as const,
        message: "sentinel",
        retryable: true,
        contractErrorCode: null,
        provenance: null,
        executionEnabled: false as const
      }));
      const createReader = vi.fn((): VenusHealthReader => ({
        getAccountRiskSnapshot
      }));
      const client = unusedClient();

      await expect(
        readVenusAccountLiquidityAtLatestBlock(
          { chainId, account: ACCOUNT },
          {
            client,
            getLatestBlock: vi.fn(async () => ({ number: BLOCK_NUMBER, hash: BLOCK_HASH })),
            createReader
          }
        )
      ).resolves.toMatchObject({ status: "unavailable", message: "sentinel" });

      expect(createReader).toHaveBeenCalledWith(client);
      expect(getAccountRiskSnapshot).toHaveBeenCalledWith({
        chainId,
        account: ACCOUNT,
        comptrollerAddress: VENUS_CORE_POOL_BSC_DEPLOYMENTS[chainId].comptroller,
        blockNumber: BLOCK_NUMBER.toString(10),
        expectedBlockHash: BLOCK_HASH,
        maximumBlockAgeSeconds: 120
      });
    }
  );

  it("does not construct a reader when the latest block request fails", async () => {
    const createReader = vi.fn();

    await expect(
      readVenusAccountLiquidityAtLatestBlock(
        { chainId: 56, account: ACCOUNT },
        {
          client: unusedClient(),
          getLatestBlock: vi.fn(async () => {
            throw new Error("provider URL with secret must not escape");
          }),
          createReader,
          now: () => new Date("2026-08-11T18:00:00.000Z")
        }
      )
    ).resolves.toEqual({
      status: "unavailable",
      reason: "latest_block_error",
      stage: "latest_block",
      message: "The server-side BSC RPC provider did not return the latest block.",
      retryable: true,
      contractErrorCode: null,
      observedAt: "2026-08-11T18:00:00.000Z",
      provenance: null,
      executionEnabled: false
    });
    expect(createReader).not.toHaveBeenCalled();
  });

  it.each([
    { number: BLOCK_NUMBER, hash: null },
    { number: Number(BLOCK_NUMBER), hash: BLOCK_HASH },
    { number: BLOCK_NUMBER, hash: "0x1234" },
    { number: -1n, hash: BLOCK_HASH }
  ])("rejects an incompatible latest block before reader construction", async (latestBlock) => {
    const createReader = vi.fn();

    await expect(
      readVenusAccountLiquidityAtLatestBlock(
        { chainId: 97, account: ACCOUNT },
        {
          client: unusedClient(),
          getLatestBlock: vi.fn(async () => latestBlock),
          createReader
        }
      )
    ).resolves.toMatchObject({
      status: "unavailable",
      reason: "latest_block_incompatible",
      stage: "latest_block",
      provenance: null
    });
    expect(createReader).not.toHaveBeenCalled();
  });
});
