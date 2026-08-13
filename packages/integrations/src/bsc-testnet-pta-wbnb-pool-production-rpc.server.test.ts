import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, keccak256, stringToHex, type Address, type Hex } from "viem";

vi.mock("server-only", () => ({}));

import {
  BSC_TESTNET_PANCAKE_V3_FACTORY,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_WBNB_ADDRESS
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse,
  observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse
} from "./bsc-testnet-pta-wbnb-pool-production-rpc.server";

const TRANSACTION_HASH = `0x${"11".repeat(32)}` as Hex;
const BLOCK_HASH = `0x${"22".repeat(32)}` as Hex;
const PARENT_HASH = `0x${"33".repeat(32)}` as Hex;
const RECEIPT_BLOCK_HASH = `0x${"44".repeat(32)}` as Hex;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_WORD = `0x${"00".repeat(32)}` as Hex;

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

function finalityBlockHash(number: bigint): Hex {
  return number === 100n
    ? RECEIPT_BLOCK_HASH
    : keccak256(stringToHex(`proofera.rpc-test.finality-block.${number.toString()}`));
}

function reconciliationFetch() {
  const calls: { origin: string; method: string; params: readonly unknown[] }[] = [];
  const ethCallCounts = new Map<string, number>();
  const uint24 = encodeAbiParameters([{ type: "uint24" }], [500]);
  const int24 = encodeAbiParameters([{ type: "int24" }], [10]);
  const uint128One = encodeAbiParameters([{ type: "uint128" }], [1n]);
  const uint128Zero = encodeAbiParameters([{ type: "uint128" }], [0n]);
  const slot0 = encodeAbiParameters(
    [
      { type: "uint160" },
      { type: "int24" },
      { type: "uint16" },
      { type: "uint16" },
      { type: "uint16" },
      { type: "uint32" },
      { type: "bool" }
    ],
    [1n, 0, 0, 1, 1, 0, true]
  );
  const observation = encodeAbiParameters(
    [{ type: "uint32" }, { type: "int56" }, { type: "uint160" }, { type: "bool" }],
    [1_786_588_800, 0n, 0n, true]
  );
  const ethCallResults = [
    addressWord(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE),
    addressWord(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE),
    addressWord(BSC_TESTNET_PANCAKE_V3_FACTORY),
    addressWord(BSC_TESTNET_PTA_ADDRESS),
    addressWord(BSC_TESTNET_WBNB_ADDRESS),
    uint24,
    int24,
    uint128One,
    uint128Zero,
    addressWord(ZERO_ADDRESS),
    slot0,
    observation
  ] as const;
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
      case "eth_getBlockByNumber": {
        const requested = request.params[0];
        const number = requested === "finalized" ? 1_000n : BigInt(String(requested));
        result = {
          number: `0x${number.toString(16)}`,
          hash: finalityBlockHash(number),
          parentHash: number === 101n ? RECEIPT_BLOCK_HASH : finalityBlockHash(number - 1n),
          timestamp: `0x${(1_786_588_500n + number * 3n).toString(16)}`,
          transactions: number === 100n ? [TRANSACTION_HASH] : []
        };
        break;
      }
      case "eth_getTransactionByHash":
        result = {
          hash: TRANSACTION_HASH,
          type: "0x0",
          chainId: "0x61",
          from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
          to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
          nonce: "0x1",
          value: "0x0",
          gas: "0x5b8d80",
          gasPrice: "0x5f5e100",
          input: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
          blockHash: RECEIPT_BLOCK_HASH,
          blockNumber: "0x64",
          transactionIndex: "0x0"
        };
        break;
      case "eth_getTransactionReceipt":
        result = {
          transactionHash: TRANSACTION_HASH,
          transactionIndex: "0x0",
          blockHash: RECEIPT_BLOCK_HASH,
          blockNumber: "0x64",
          from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
          to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
          contractAddress: null,
          cumulativeGasUsed: "0x4a817c",
          gasUsed: "0x493e00",
          effectiveGasPrice: "0x5f5e100",
          status: "0x1",
          type: "0x0",
          logsBloom: `0x${"00".repeat(256)}`,
          logs: []
        };
        break;
      case "eth_call": {
        const index = ethCallCounts.get(origin) ?? 0;
        ethCallCounts.set(origin, index + 1);
        result = ethCallResults[index];
        if (result === undefined) throw new Error(`Unexpected eth_call index ${index}`);
        break;
      }
      case "eth_getTransactionCount":
        result = "0x1";
        break;
      case "eth_getCode":
        result = "0x00";
        break;
      case "eth_getStorageAt":
        result = ZERO_WORD;
        break;
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

describe("PTA/WBNB fixed production RPC reconciliation evidence", () => {
  it("uses a stable receipt-plus-128 checkpoint and reads EIP-1898 post-state at the receipt block", async () => {
    const { calls } = reconciliationFetch();

    const result =
      await observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse(TRANSACTION_HASH);

    for (const provider of [result.primary, result.corroborator]) {
      expect(provider.reportedFinalizedHead.number).toBe("1000");
      expect(provider.commonFinalizedBlock?.number).toBe("228");
      expect(provider.receiptToCommonFinalizedAncestry).toHaveLength(128);
      expect(provider.receiptToCommonFinalizedAncestry[0]?.number).toBe("101");
      expect(provider.receiptToCommonFinalizedAncestry.at(-1)?.number).toBe("228");
      expect(provider.postState?.eip1898Block).toEqual({
        blockHash: RECEIPT_BLOCK_HASH,
        requireCanonical: true
      });
    }

    const exactBlockRequests = calls.filter(
      (call) => call.method === "eth_getBlockByNumber" && call.params[0] !== "finalized"
    );
    expect(exactBlockRequests.filter((call) => call.params[0] === "0xe4")).toHaveLength(2);
    expect(exactBlockRequests.some((call) => call.params[0] === "0x3e8")).toBe(false);

    const eip1898Reads = calls.filter((call) =>
      ["eth_call", "eth_getTransactionCount", "eth_getCode", "eth_getStorageAt"].includes(
        call.method
      )
    );
    expect(eip1898Reads.length).toBeGreaterThan(0);
    for (const call of eip1898Reads) {
      const state = call.params[call.method === "eth_getStorageAt" ? 2 : 1];
      expect(state).toEqual({ blockHash: RECEIPT_BLOCK_HASH, requireCanonical: true });
    }
    expect(calls.some((call) => call.method === "eth_sendRawTransaction")).toBe(false);
  });
});
