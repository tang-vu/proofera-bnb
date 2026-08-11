import { describe, expect, it } from "vitest";
import { type Address, type Hex } from "viem";
import { z } from "zod";

import { PANCAKE_V3_BSC_DEPLOYMENTS } from "./pancake-v3";
import {
  createPancakeV3StaticContextReader,
  type PancakeV3StaticContextRpcClient,
  type PancakeV3StaticContextRpcRequest
} from "./pancake-v3-static-context";

const runLive = process.env.PROOFERA_RUN_LIVE_PANCAKE_TESTS === "1";
const rpcUrl = process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-rpc.publicnode.com";
const token0 = (process.env.PROOFERA_LIVE_PANCAKE_TOKEN0 ??
  "0x3a4a356381d3061d5f29013e8e12acfed701dba6") as Address;
const token1 = (process.env.PROOFERA_LIVE_PANCAKE_TOKEN1 ??
  "0xddf6c57e618f267c135f0c56da88091b95c54057") as Address;
const replayBlockNumber = process.env.PROOFERA_LIVE_PANCAKE_BLOCK_NUMBER;
const replayBlockHash = process.env.PROOFERA_LIVE_PANCAKE_BLOCK_HASH;
const replayBlockTimestamp = process.env.PROOFERA_LIVE_PANCAKE_BLOCK_TIMESTAMP;
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

describe.skipIf(!runLive)("live Pancake V3 static activation context", () => {
  it("binds manager immutables and token decimals at a fresh exact BSC testnet block", async () => {
    const hasCompleteReplayBinding =
      replayBlockNumber !== undefined &&
      replayBlockHash !== undefined &&
      replayBlockTimestamp !== undefined &&
      replayCheckedAt !== undefined;
    const hasAnyReplayBinding =
      replayBlockNumber !== undefined ||
      replayBlockHash !== undefined ||
      replayBlockTimestamp !== undefined ||
      replayCheckedAt !== undefined;
    if (hasAnyReplayBinding && !hasCompleteReplayBinding) {
      throw new Error(
        "Exact replay requires block number, hash, timestamp, and checked-at time together."
      );
    }
    const latest = hasCompleteReplayBinding
      ? latestBlockSchema.parse({
          number: `0x${BigInt(replayBlockNumber).toString(16)}`,
          hash: replayBlockHash,
          timestamp: `0x${BigInt(replayBlockTimestamp).toString(16)}`
        })
      : latestBlockSchema.parse(await jsonRpc("eth_getBlockByNumber", ["latest", false]));
    const client: PancakeV3StaticContextRpcClient = {
      request(call: PancakeV3StaticContextRpcRequest) {
        return jsonRpc(call.method, call.params);
      }
    };
    const result = await createPancakeV3StaticContextReader({
      client,
      now: () => (hasCompleteReplayBinding ? new Date(replayCheckedAt) : new Date()),
      freshnessPolicy: { maximumBlockAgeSeconds: 120, maximumFutureSkewSeconds: 5 },
      rpcProvider: {
        id: "publicnode-bsc-testnet",
        publicSourceUrl: "https://publicnode.com/"
      }
    }).read({
      chainId: 97,
      positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[97].positionManager,
      factoryAddress: PANCAKE_V3_BSC_DEPLOYMENTS[97].factory,
      token0Address: token0,
      token1Address: token1,
      block: {
        number: BigInt(latest.number).toString(),
        hash: latest.hash,
        timestampUnix: BigInt(latest.timestamp).toString()
      }
    });

    expect(result.status, JSON.stringify(result)).toBe("available");
    if (result.status !== "available") return;
    expect(result).toMatchObject({
      chainId: 97,
      environment: "bsc-testnet",
      evidence: {
        factoryAddress: PANCAKE_V3_BSC_DEPLOYMENTS[97].factory,
        poolDeployerAddress: "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
        token0: { decimals: 18 },
        token1: { decimals: 18 }
      },
      boundary: { permitsExecution: false }
    });
    expect(result.block.hash).toBe(latest.hash);
    expect(result.provenance).toMatchObject({
      latestTagUsed: false,
      blockNumberSelectorUsed: false,
      fallbackUsed: false,
      rpcProvider: { id: "publicnode-bsc-testnet" }
    });
  }, 30_000);
});
