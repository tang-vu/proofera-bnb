import type { Hex } from "viem";
import type * as ViemModule from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Generation10RecoveryModule from "./bsc-testnet-pta-wbnb-pool-generation-10-recovery";

const { RAW, TRANSACTION_HASH } = vi.hoisted(() => ({
  RAW: "0x0102" as Hex,
  TRANSACTION_HASH: "0x76a99ae9a513f6a88ea5bdb33c3b406f5f55e4872b3df1506b0d3f3afc7b947f" as Hex
}));

vi.mock("server-only", () => ({}));
vi.mock("./bsc-testnet-pta-wbnb-pool-generation-10-recovery", async (importOriginal) => {
  const original = await importOriginal<typeof Generation10RecoveryModule>();
  return {
    ...original,
    BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH: TRANSACTION_HASH
  };
});
vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof ViemModule>();
  return {
    ...original,
    keccak256: vi.fn((value: Hex) => (value === RAW ? TRANSACTION_HASH : original.keccak256(value)))
  };
});

import { BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN } from "./bsc-testnet-pta-wbnb-pool-initialization";
import { createBscTestnetPtaWbnbPoolGeneration10ExistingSignatureSenderForInternalUse } from "./bsc-testnet-pta-wbnb-pool-production-rpc.server";

afterEach(() => vi.unstubAllGlobals());

describe("generation-10 one-send RPC gate", () => {
  it("consumes both owner and durable-start tokens before exactly one fixed-origin send", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      void input;
      const response = new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: TRANSACTION_HASH }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
      Object.defineProperty(response, "url", {
        configurable: false,
        enumerable: true,
        value: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN
      });
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const consumeOwner = vi.fn(() => true);
    const consumeStart = vi.fn(() => true);
    const capability = {
      transaction: { transactionHash: TRANSACTION_HASH, signedTransaction: RAW }
    } as never;
    const sender = createBscTestnetPtaWbnbPoolGeneration10ExistingSignatureSenderForInternalUse({
      capability,
      consumeOwnerAuthority: consumeOwner,
      consumeDurableStartToken: consumeStart
    });
    await expect(sender.sendExactRawTransactionOnce(RAW)).resolves.toBe(TRANSACTION_HASH);
    expect(consumeOwner).toHaveBeenCalledTimes(1);
    expect(consumeStart).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN);
    await expect(sender.sendExactRawTransactionOnce(RAW)).rejects.toThrow(
      "GENERATION_10_SEND_ALREADY_ATTEMPTED"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never calls RPC when the durable-start token is unavailable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const sender = createBscTestnetPtaWbnbPoolGeneration10ExistingSignatureSenderForInternalUse({
      capability: {
        transaction: { transactionHash: TRANSACTION_HASH, signedTransaction: RAW }
      } as never,
      consumeOwnerAuthority: () => true,
      consumeDurableStartToken: () => false
    });
    await expect(sender.sendExactRawTransactionOnce(RAW)).rejects.toThrow(
      "GENERATION_10_SEND_AUTHORITY_UNAVAILABLE"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
