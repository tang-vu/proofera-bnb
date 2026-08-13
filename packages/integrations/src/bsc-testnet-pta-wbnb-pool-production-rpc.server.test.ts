import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, type Address, type Hex } from "viem";

vi.mock("server-only", () => ({}));

import {
  BSC_TESTNET_PANCAKE_V3_FACTORY,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import { acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse } from "./bsc-testnet-pta-wbnb-pool-production-rpc.server";

const TRANSACTION_HASH = `0x${"11".repeat(32)}` as Hex;
const BLOCK_HASH = `0x${"22".repeat(32)}` as Hex;
const PARENT_HASH = `0x${"33".repeat(32)}` as Hex;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function addressWord(value: Address): Hex {
  return encodeAbiParameters([{ type: "address" }], [value]);
}

function jsonResponse(origin: string, id: number, result: unknown): Response {
  const response = new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  Object.defineProperty(response, "url", { value: origin });
  return response;
}

function fixedFetch(pendingNonceDriftOrigin: string | null = null) {
  const calls: Readonly<{ origin: string; method: string; params: readonly unknown[] }>[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const origin = String(input);
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
      params: readonly unknown[];
    };
    calls.push({ origin, method: request.method, params: request.params });
    let result: unknown;
    switch (request.method) {
      case "eth_chainId":
        result = "0x61";
        break;
      case "eth_getBlockByNumber":
        result = {
          number: "0x64",
          hash: BLOCK_HASH,
          parentHash: PARENT_HASH,
          timestamp: "0x64",
          transactions: [],
          gasLimit: "0x8583b00"
        };
        break;
      case "eth_getTransactionByHash":
      case "eth_getTransactionReceipt":
        result = null;
        break;
      case "eth_getTransactionCount": {
        const address = request.params[0];
        const tag = request.params[1];
        result =
          address === BSC_TESTNET_PTA_WBNB_POOL_SENDER
            ? origin === pendingNonceDriftOrigin && tag === "pending"
              ? "0x2"
              : "0x1"
            : "0x0";
        break;
      }
      case "eth_getCode":
        result = "0x";
        break;
      case "eth_getBalance":
        result = "0x16345785d8a0000";
        break;
      case "eth_gasPrice":
        result = "0x5f5e100";
        break;
      case "eth_estimateGas":
        result = "0x4c16b3";
        break;
      case "eth_call": {
        const call = request.params[0] as { to: Address };
        result =
          call.to === BSC_TESTNET_PANCAKE_V3_FACTORY
            ? addressWord(ZERO_ADDRESS)
            : addressWord(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE);
        break;
      }
      default:
        throw new Error(`Unexpected method ${request.method}`);
    }
    return jsonResponse(origin, request.id, result);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PTA/WBNB fixed production RPC pre-send reread", () => {
  it("uses both fixed official origins and proves all latest/pending guards", async () => {
    const { calls } = fixedFetch();

    const result = await acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse({
      transactionHash: TRANSACTION_HASH,
      gasLimit: "5983857",
      gasPriceWei: "100000000"
    });

    expect(result).toMatchObject({
      primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
      corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
      latestNonce: "1",
      pendingNonce: "1",
      transactionByHash: null,
      receiptByHash: null,
      factoryPoolForward: ZERO_ADDRESS,
      factoryPoolReverse: ZERO_ADDRESS,
      candidateCode: "0x",
      candidateNonce: "0",
      senderCode: "0x",
      simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
    });
    expect(new Set(calls.map((call) => call.origin))).toEqual(
      new Set([
        BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
        BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN
      ])
    );
    for (const tag of ["latest", "pending"]) {
      expect(
        calls.some(
          (call) =>
            call.method === "eth_getTransactionCount" &&
            call.params[0] === BSC_TESTNET_PTA_WBNB_POOL_SENDER &&
            call.params[1] === tag
        )
      ).toBe(true);
      expect(
        calls.some(
          (call) =>
            call.method === "eth_getCode" &&
            call.params[0] === BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE &&
            call.params[1] === tag
        )
      ).toBe(true);
    }
    expect(calls.some((call) => call.method === "eth_sendRawTransaction")).toBe(false);
  });

  it("fails closed on a single-provider pending nonce race", async () => {
    const { calls } = fixedFetch(BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN);

    await expect(
      acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse({
        transactionHash: TRANSACTION_HASH,
        gasLimit: "5983857",
        gasPriceWei: "100000000"
      })
    ).rejects.toThrow("RPC_PROVIDER_DISAGREEMENT");
    expect(calls.some((call) => call.method === "eth_sendRawTransaction")).toBe(false);
    expect(
      calls.some(
        (call) =>
          call.method === "eth_call" &&
          (call.params[0] as { to?: string }).to === BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER
      )
    ).toBe(true);
  });
});
