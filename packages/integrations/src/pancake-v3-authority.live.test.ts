import { describe, expect, it } from "vitest";
import { encodeFunctionData, getAddress, parseAbi, type Address, type Hex } from "viem";
import { z } from "zod";

import {
  createPancakeV3PositionAuthorityReader,
  type PancakeV3PositionAuthorityRpcClient,
  type PancakeV3PositionAuthorityRpcRequest
} from "./pancake-v3-authority";
import { PANCAKE_V3_BSC_DEPLOYMENTS } from "./pancake-v3";

const runLive = process.env.PROOFERA_RUN_LIVE_PANCAKE_TESTS === "1";
const rpcUrl = process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-rpc.publicnode.com";
const positionTokenId = process.env.PROOFERA_LIVE_PANCAKE_POSITION_ID ?? "36761";
const replayBlockNumber = process.env.PROOFERA_LIVE_PANCAKE_BLOCK_NUMBER;
const replayBlockHash = process.env.PROOFERA_LIVE_PANCAKE_BLOCK_HASH;
const replayBlockTimestamp = process.env.PROOFERA_LIVE_PANCAKE_BLOCK_TIMESTAMP;
const replayController = process.env.PROOFERA_LIVE_PANCAKE_CONTROLLER;
const replayCheckedAt = process.env.PROOFERA_LIVE_PANCAKE_CHECKED_AT;

const jsonRpcEnvelopeSchema = z.looseObject({
  jsonrpc: z.literal("2.0"),
  id: z.number(),
  result: z.unknown().optional(),
  error: z.unknown().optional()
});

const latestBlockSchema = z.looseObject({
  number: z.string().regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/),
  hash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((value) => value.toLowerCase() as Hex),
  timestamp: z.string().regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/)
});

const addressWordSchema = z
  .string()
  .regex(/^0x0{24}[0-9a-fA-F]{40}$/)
  .transform((value) => getAddress(`0x${value.slice(26)}`) as Address);

const ownerAbi = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]);

async function jsonRpc(method: string, params: readonly unknown[]): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    redirect: "error",
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error("Live BSC testnet RPC returned a non-success status.");
  const body = await response.text();
  if (body.length > 65_536) throw new Error("Live BSC testnet RPC response exceeded 64 KiB.");
  const parsed = jsonRpcEnvelopeSchema.parse(JSON.parse(body) as unknown);
  if (parsed.error !== undefined || parsed.result === undefined) {
    throw new Error("Live BSC testnet RPC returned an error or omitted its result.");
  }
  return parsed.result;
}

describe.skipIf(!runLive)("live Pancake V3 position authority", () => {
  it("revalidates an existing public testnet position through exact EIP-1898 calls", async () => {
    const hasCompleteReplayBinding =
      replayBlockNumber !== undefined &&
      replayBlockHash !== undefined &&
      replayBlockTimestamp !== undefined &&
      replayController !== undefined &&
      replayCheckedAt !== undefined;
    const hasAnyReplayBinding =
      replayBlockNumber !== undefined ||
      replayBlockHash !== undefined ||
      replayBlockTimestamp !== undefined ||
      replayController !== undefined ||
      replayCheckedAt !== undefined;
    if (hasAnyReplayBinding && !hasCompleteReplayBinding) {
      throw new Error(
        "Exact replay requires block number, hash, timestamp, controller, and checked-at time together."
      );
    }

    const latest = hasCompleteReplayBinding
      ? latestBlockSchema.parse({
          number: `0x${BigInt(replayBlockNumber).toString(16)}`,
          hash: replayBlockHash,
          timestamp: `0x${BigInt(replayBlockTimestamp).toString(16)}`
        })
      : latestBlockSchema.parse(await jsonRpc("eth_getBlockByNumber", ["latest", false]));
    const blockHash = latest.hash;
    let owner: Address;
    if (hasCompleteReplayBinding) {
      owner = getAddress(replayController) as Address;
    } else {
      const ownerData = encodeFunctionData({
        abi: ownerAbi,
        functionName: "ownerOf",
        args: [BigInt(positionTokenId)]
      });
      owner = addressWordSchema.parse(
        await jsonRpc("eth_call", [
          { to: PANCAKE_V3_BSC_DEPLOYMENTS[97].positionManager, data: ownerData },
          { blockHash, requireCanonical: true }
        ])
      );
    }

    const client: PancakeV3PositionAuthorityRpcClient = {
      request(call: PancakeV3PositionAuthorityRpcRequest) {
        return jsonRpc(call.method, call.params);
      }
    };
    const result = await createPancakeV3PositionAuthorityReader({
      client,
      now: () => (hasCompleteReplayBinding ? new Date(replayCheckedAt) : new Date()),
      freshnessPolicy: {
        maximumBlockAgeSeconds: 120,
        maximumFutureSkewSeconds: 5
      },
      rpcProvider: {
        id: "publicnode-bsc-testnet",
        publicSourceUrl: "https://publicnode.com/"
      }
    }).read({
      chainId: 97,
      positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[97].positionManager,
      positionTokenId,
      controllerAddress: owner,
      block: {
        number: BigInt(latest.number).toString(),
        hash: latest.hash,
        timestampUnix: BigInt(latest.timestamp).toString()
      }
    });

    expect(result.status, JSON.stringify(result)).toBe("available");
    if (result.status !== "available") return;
    expect(result.environment).toBe("bsc-testnet");
    expect(result.authorization).toMatchObject({
      positionTokenId,
      ownerAddress: owner,
      controllerAddress: owner,
      controllerAuthorized: true,
      authorizationKind: "owner"
    });
    expect(result.block.hash).toBe(blockHash);
    expect(result.provenance.latestTagUsed).toBe(false);
    expect(result.provenance.blockNumberSelectorUsed).toBe(false);
    expect(result.provenance.fallbackUsed).toBe(false);
    expect(result.provenance.rpcProvider).toEqual({
      id: "publicnode-bsc-testnet",
      publicSourceUrl: "https://publicnode.com/"
    });
  }, 30_000);
});
