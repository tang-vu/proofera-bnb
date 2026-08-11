import type { PublicClient } from "viem";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  PANCAKE_V3_BSC_DEPLOYMENTS,
  createPancakeV3PositionReader,
  type PancakeV3ContractReadParameters,
  type PancakeV3PositionSnapshotRequest,
  type PancakeV3ReadClient
} from "./pancake-v3";

const BLOCK_NUMBER = 42_000_000n;
const BLOCK_TIMESTAMP = 1_786_464_000n;
const BLOCK_HASH = `0x${"ab".repeat(32)}`;
const POOL = "0x1111111111111111111111111111111111111111";
const TOKEN0 = "0x2222222222222222222222222222222222222222";
const TOKEN1 = "0x3333333333333333333333333333333333333333";
const POSITION_ID =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

const defaultPosition = [
  9n,
  "0x0000000000000000000000000000000000000000",
  TOKEN0,
  TOKEN1,
  500,
  -100,
  100,
  12_345_678_901_234_567_890n,
  111n,
  222n,
  333n,
  444n
] as const;

const defaultSlot0 = [2n ** 96n, 10, 3, 8, 12, 0, true] as const;

interface FakeClientOptions {
  readonly chainId?: unknown;
  readonly block?: unknown;
  readonly code?: (address: string) => unknown;
  readonly position?: unknown;
  readonly slot0?: unknown;
  readonly tickSpacing?: unknown;
  readonly poolToken0?: unknown;
  readonly poolToken1?: unknown;
  readonly poolFee?: unknown;
  readonly factoryPool?: unknown;
  readonly factoryTickSpacing?: unknown;
  readonly readErrorAt?: string;
}

function createFakeClient(overrides: FakeClientOptions = {}) {
  const contractReads: PancakeV3ContractReadParameters[] = [];
  const getChainId = vi.fn(async (): Promise<unknown> => overrides.chainId ?? 56);
  const getBlock = vi.fn(async (): Promise<unknown> =>
    overrides.block === undefined
      ? {
          number: BLOCK_NUMBER,
          hash: BLOCK_HASH,
          timestamp: BLOCK_TIMESTAMP,
          ignoredProviderField: "not trusted"
        }
      : overrides.block
  );
  const getCode = vi.fn(
    async ({ address }: { address: string }): Promise<unknown> =>
      overrides.code?.(address) ?? "0x60006000"
  );
  const readContract = vi.fn(
    async (parameters: PancakeV3ContractReadParameters): Promise<unknown> => {
      contractReads.push(parameters);
      if (overrides.readErrorAt === parameters.functionName) {
        throw new Error("provider unavailable");
      }

      switch (parameters.functionName) {
        case "positions":
          return overrides.position ?? defaultPosition;
        case "slot0":
          return overrides.slot0 ?? defaultSlot0;
        case "tickSpacing":
          return overrides.tickSpacing ?? 10;
        case "token0":
          return overrides.poolToken0 ?? TOKEN0;
        case "token1":
          return overrides.poolToken1 ?? TOKEN1;
        case "fee":
          return overrides.poolFee ?? 500;
        case "getPool":
          return overrides.factoryPool ?? POOL;
        case "feeAmountTickSpacing":
          return overrides.factoryTickSpacing ?? 10;
        default:
          throw new Error(`Unexpected read ${parameters.functionName}`);
      }
    }
  );

  const client: PancakeV3ReadClient = {
    getChainId,
    getBlock,
    getCode,
    readContract
  };
  return { client, getChainId, getBlock, getCode, readContract, contractReads };
}

function request(
  overrides: Partial<PancakeV3PositionSnapshotRequest> = {}
): PancakeV3PositionSnapshotRequest {
  return {
    chainId: 56,
    positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[56].positionManager,
    poolAddress: POOL,
    positionId: POSITION_ID,
    blockNumber: BLOCK_NUMBER.toString(10),
    expectedBlockHash: BLOCK_HASH,
    maximumBlockAgeSeconds: 120,
    ...overrides
  };
}

function createReader(client: PancakeV3ReadClient) {
  return createPancakeV3PositionReader({
    client,
    now: () => new Date("2026-08-11T16:00:30.000Z")
  });
}

describe("Pancake V3 position snapshot", () => {
  it("accepts the read surface of a viem PublicClient", () => {
    expectTypeOf<PublicClient>().toMatchTypeOf<PancakeV3ReadClient>();
  });

  it("preserves a maximum uint256 position ID and pins every read to one block", async () => {
    const fake = createFakeClient();

    const result = await createReader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({
      status: "available",
      provenance: {
        chainId: 56,
        blockNumber: BLOCK_NUMBER.toString(10),
        blockHash: BLOCK_HASH,
        blockTimestampUnix: BLOCK_TIMESTAMP.toString(10),
        observedAt: "2026-08-11T16:00:30.000Z",
        ageSeconds: 30,
        readsPinnedToBlock: true,
        positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[56].positionManager,
        factoryAddress: PANCAKE_V3_BSC_DEPLOYMENTS[56].factory,
        poolAddress: POOL
      },
      snapshot: {
        position: {
          id: POSITION_ID,
          nonce: "9",
          liquidity: "12345678901234567890",
          feeGrowthInside0LastX128: "111",
          feeGrowthInside1LastX128: "222",
          tokensOwed0: "333",
          tokensOwed1: "444",
          inRange: true
        },
        pool: {
          sqrtPriceX96: (2n ** 96n).toString(10),
          tick: 10,
          tickSpacing: 10
        }
      }
    });
    expect(fake.getBlock).toHaveBeenCalledWith({ blockNumber: BLOCK_NUMBER });
    expect(fake.getCode).toHaveBeenCalledTimes(3);
    expect(fake.contractReads).toHaveLength(8);
    expect(fake.contractReads.every((read) => read.blockNumber === BLOCK_NUMBER)).toBe(true);
    const positionRead = fake.contractReads.find((read) => read.functionName === "positions");
    expect(positionRead?.args).toEqual([BigInt(POSITION_ID)]);
    expect(typeof positionRead?.args?.[0]).toBe("bigint");
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("rejects a wrong RPC chain before any contract read", async () => {
    const fake = createFakeClient({ chainId: 97 });

    const result = await createReader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "chain_mismatch",
      stage: "chain",
      retryable: false
    });
    expect(fake.getBlock).not.toHaveBeenCalled();
    expect(fake.readContract).not.toHaveBeenCalled();
  });

  it("rejects malformed or non-official contract addresses before RPC dispatch", async () => {
    const fake = createFakeClient();
    const reader = createReader(fake.client);

    const malformed = await reader.getPositionSnapshot(request({ poolAddress: "not-an-address" }));
    const wrongManager = await reader.getPositionSnapshot(
      request({ positionManagerAddress: "0x4444444444444444444444444444444444444444" })
    );
    const overflowingPositionId = await reader.getPositionSnapshot(
      request({
        positionId: "115792089237316195423570985008687907853269984665640564039457584007913129639936"
      })
    );

    expect(malformed).toMatchObject({
      status: "unavailable",
      reason: "invalid_request",
      stage: "request",
      provenance: null
    });
    expect(wrongManager).toMatchObject({
      status: "unavailable",
      reason: "invalid_request",
      stage: "request",
      provenance: null
    });
    expect(overflowingPositionId).toMatchObject({
      status: "unavailable",
      reason: "invalid_request",
      stage: "request",
      provenance: null
    });
    expect(fake.getChainId).not.toHaveBeenCalled();
  });

  it("fails closed when a required contract has no code at the pinned block", async () => {
    const fake = createFakeClient({
      code: (address) => (address.toLowerCase() === POOL.toLowerCase() ? "0x" : "0x6000")
    });

    const result = await createReader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "missing_code",
      stage: "code",
      retryable: false,
      provenance: {
        blockNumber: BLOCK_NUMBER.toString(10),
        blockHash: BLOCK_HASH,
        poolAddress: POOL
      }
    });
    expect(fake.readContract).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "token",
      overrides: { poolToken0: "0x4444444444444444444444444444444444444444" },
      mismatch: "position/pool tokens"
    },
    { label: "fee", overrides: { poolFee: 2_500 }, mismatch: "position/pool fee" },
    {
      label: "tick",
      overrides: { tickSpacing: 30, factoryTickSpacing: 30 },
      mismatch: "position ticks/tick spacing"
    },
    {
      label: "factory pool",
      overrides: { factoryPool: "0x4444444444444444444444444444444444444444" },
      mismatch: "factory/pool address"
    },
    {
      label: "factory tick spacing",
      overrides: { factoryTickSpacing: 20 },
      mismatch: "pool/factory tick spacing"
    }
  ])("makes a $label relation mismatch explicit", async ({ overrides, mismatch }) => {
    const fake = createFakeClient(overrides);

    const result = await createReader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "relation_mismatch",
      stage: "relations",
      retryable: false
    });
    if (result.status === "unavailable") expect(result.message).toContain(mismatch);
  });

  it("rejects a block identity mismatch before reading contract state", async () => {
    const fake = createFakeClient();
    const wrongHash = `0x${"cd".repeat(32)}`;

    const result = await createReader(fake.client).getPositionSnapshot(
      request({ expectedBlockHash: wrongHash })
    );

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "block_mismatch",
      stage: "block",
      retryable: false,
      provenance: { blockHash: BLOCK_HASH }
    });
    expect(fake.getCode).not.toHaveBeenCalled();
    expect(fake.readContract).not.toHaveBeenCalled();
  });

  it("enforces an explicit caller freshness assumption", async () => {
    const fake = createFakeClient();

    const result = await createReader(fake.client).getPositionSnapshot(
      request({ maximumBlockAgeSeconds: 10 })
    );

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "stale_block",
      stage: "block",
      retryable: false,
      provenance: {
        blockTimestampUnix: BLOCK_TIMESTAMP.toString(10),
        observedAt: "2026-08-11T16:00:30.000Z"
      }
    });
    expect(fake.getCode).not.toHaveBeenCalled();
  });

  it("reports incompatible decoded contract results without substituting fixtures", async () => {
    const fake = createFakeClient({ position: { token0: TOKEN0, token1: TOKEN1 } });

    const result = await createReader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "incompatible_response",
      stage: "position",
      retryable: false
    });
    expect("snapshot" in result).toBe(false);
  });

  it("reports provider read failures as retryable and source-stage specific", async () => {
    const fake = createFakeClient({ readErrorAt: "positions" });

    const result = await createReader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "read_error",
      stage: "position",
      retryable: true,
      provenance: {
        blockHash: BLOCK_HASH,
        blockNumber: BLOCK_NUMBER.toString(10)
      }
    });
    expect("snapshot" in result).toBe(false);
  });
});
