import type { PublicClient } from "viem";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  PANCAKE_V3_MULTICALL3_DEPLOYMENTS,
  createPancakeV3LatestPositionReader,
  type PancakeV3LatestMulticallParameters,
  type PancakeV3LatestReadClient,
  type PancakeV3LatestSnapshotRequest
} from "./pancake-v3-latest";
import { PANCAKE_V3_BSC_DEPLOYMENTS } from "./pancake-v3";

const BLOCK_NUMBER = 42_000_000n;
const BLOCK_TIMESTAMP = 1_786_464_000n;
const BLOCK_HASH = `0x${"ab".repeat(32)}`;
const PARENT_HASH = `0x${"cd".repeat(32)}`;
const OTHER_HASH = `0x${"ef".repeat(32)}`;
const POOL = "0x1111111111111111111111111111111111111111";
const OTHER_POOL = "0x4444444444444444444444444444444444444444";
const TOKEN0 = "0x2222222222222222222222222222222222222222";
const TOKEN1 = "0x3333333333333333333333333333333333333333";
const OTHER_TOKEN = "0x5555555555555555555555555555555555555555";
const POSITION_ID =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

const discoveryPosition = [
  1n,
  "0x0000000000000000000000000000000000000000",
  TOKEN0,
  TOKEN1,
  500,
  -100,
  100,
  111n,
  10n,
  20n,
  30n,
  40n
] as const;

const stageTwoPosition = [
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

const stageTwoSlot0 = [2n ** 96n, 10, 3, 8, 12, 0, true] as const;

function defaultDiscovery(): unknown {
  return [discoveryPosition, TOKEN0, TOKEN1, 500];
}

function defaultSnapshot(): unknown {
  return [
    BLOCK_NUMBER,
    BLOCK_TIMESTAMP,
    PARENT_HASH,
    56n,
    stageTwoPosition,
    stageTwoSlot0,
    TOKEN0,
    TOKEN1,
    500,
    10,
    POOL,
    10
  ];
}

function defaultBlock(): unknown {
  return {
    number: BLOCK_NUMBER,
    hash: BLOCK_HASH,
    parentHash: PARENT_HASH,
    timestamp: BLOCK_TIMESTAMP,
    transactions: ["untrusted provider field is ignored"]
  };
}

interface FakeOptions {
  readonly chainId?: unknown;
  readonly discovery?: unknown;
  readonly snapshot?: unknown;
  readonly block?: unknown;
  readonly failMulticallAt?: 1 | 2;
  readonly failBlock?: boolean;
}

function createFakeClient(overrides: FakeOptions = {}) {
  const batches: PancakeV3LatestMulticallParameters[] = [];
  let multicallCount = 0;
  const getChainId = vi.fn(async (): Promise<unknown> => overrides.chainId ?? 56);
  const getBlock = vi.fn(async (): Promise<unknown> => {
    if (overrides.failBlock === true) throw new Error("synthetic block transport failure");
    return overrides.block === undefined ? defaultBlock() : overrides.block;
  });
  const multicall = vi.fn(
    async (parameters: PancakeV3LatestMulticallParameters): Promise<unknown> => {
      batches.push(parameters);
      multicallCount += 1;
      if (overrides.failMulticallAt === multicallCount) {
        throw new Error("synthetic aggregate transport failure");
      }
      if (multicallCount === 1) {
        return overrides.discovery === undefined ? defaultDiscovery() : overrides.discovery;
      }
      if (multicallCount === 2) {
        return overrides.snapshot === undefined ? defaultSnapshot() : overrides.snapshot;
      }
      throw new Error("Unexpected fallback multicall");
    }
  );
  const unexpectedGetCode = vi.fn(async () => "0x6000");
  const unexpectedReadContract = vi.fn(async () => null);

  const client = {
    getChainId,
    getBlock,
    multicall,
    getCode: unexpectedGetCode,
    readContract: unexpectedReadContract
  };
  return {
    client,
    batches,
    getChainId,
    getBlock,
    multicall,
    unexpectedGetCode,
    unexpectedReadContract
  };
}

function request(
  overrides: Partial<PancakeV3LatestSnapshotRequest> = {}
): PancakeV3LatestSnapshotRequest {
  return {
    chainId: 56,
    positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[56].positionManager,
    poolAddress: POOL,
    positionId: POSITION_ID,
    expectedBlockHash: BLOCK_HASH,
    maximumBlockAgeSeconds: 120,
    ...overrides
  };
}

function reader(client: PancakeV3LatestReadClient) {
  return createPancakeV3LatestPositionReader({
    client,
    now: () => new Date("2026-08-11T16:00:30.000Z")
  });
}

describe("Pancake V3 atomic latest snapshot", () => {
  it("accepts the required read surface of a viem PublicClient", () => {
    expectTypeOf<PublicClient>().toMatchTypeOf<PancakeV3LatestReadClient>();
  });

  it("publishes only stage-two values from one unsplit latest aggregate", async () => {
    const fake = createFakeClient();

    const result = await reader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({
      status: "available",
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
          token0: TOKEN0,
          token1: TOKEN1,
          fee: 500,
          tickSpacing: 10,
          sqrtPriceX96: (2n ** 96n).toString(10),
          tick: 10
        }
      },
      provenance: {
        blockNumber: BLOCK_NUMBER.toString(10),
        blockHash: BLOCK_HASH,
        parentBlockHash: PARENT_HASH,
        blockTimestampUnix: BLOCK_TIMESTAMP.toString(10),
        readsPinnedToBlock: true,
        consistency: "atomic_latest_multicall3",
        stageTwoAtomicCallCount: 12,
        historicalContractStateRequests: false,
        discoveryUsedAsEvidence: false,
        contractPresenceEvidence: "successful_stage_two_calls",
        codeHashIdentity: "not_established",
        currentBlockHashAvailableInsideSnapshot: false,
        blockHashSource: "post_snapshot_exact_block_header",
        reorgSignalsChecked: "block_number_timestamp_parent_hash"
      }
    });
    expect(JSON.stringify(result)).not.toContain('"liquidity":"111"');
    expect(() => JSON.stringify(result)).not.toThrow();

    expect(fake.multicall).toHaveBeenCalledTimes(2);
    expect(fake.batches).toHaveLength(2);
    const stageTwo = fake.batches[1];
    expect(stageTwo).toBeDefined();
    if (stageTwo === undefined) throw new Error("Expected a stage-two batch.");
    expect(stageTwo).toMatchObject({
      allowFailure: false,
      batchSize: 0,
      blockTag: "latest",
      multicallAddress: PANCAKE_V3_MULTICALL3_DEPLOYMENTS[56].address
    });
    expect(Object.hasOwn(stageTwo, "blockNumber")).toBe(false);
    expect(stageTwo.contracts.map((entry) => entry.functionName)).toEqual([
      "getBlockNumber",
      "getCurrentBlockTimestamp",
      "getLastBlockHash",
      "getChainId",
      "positions",
      "slot0",
      "token0",
      "token1",
      "fee",
      "tickSpacing",
      "getPool",
      "feeAmountTickSpacing"
    ]);
    expect(stageTwo.contracts).toHaveLength(12);
    expect(stageTwo.contracts[4]?.address).toBe(PANCAKE_V3_BSC_DEPLOYMENTS[56].positionManager);
    expect(stageTwo.contracts[10]).toMatchObject({
      address: PANCAKE_V3_BSC_DEPLOYMENTS[56].factory,
      args: [TOKEN0, TOKEN1, 500]
    });
    expect(fake.getBlock).toHaveBeenCalledOnce();
    expect(fake.getBlock).toHaveBeenCalledWith({ blockNumber: BLOCK_NUMBER });
    expect(fake.unexpectedGetCode).not.toHaveBeenCalled();
    expect(fake.unexpectedReadContract).not.toHaveBeenCalled();
  });

  it("never puts an explicit block on either contract batch", async () => {
    const fake = createFakeClient();
    await reader(fake.client).getPositionSnapshot(request());

    expect(fake.batches).toHaveLength(2);
    for (const batch of fake.batches) {
      expect(batch.blockTag).toBe("latest");
      expect(batch.batchSize).toBe(0);
      expect(Object.hasOwn(batch, "blockNumber")).toBe(false);
      for (const contract of batch.contracts) {
        expect(Object.hasOwn(contract, "blockNumber")).toBe(false);
      }
    }
  });

  it("rejects a wrong chain before discovery and a mid-read chain switch", async () => {
    const wrongInitial = createFakeClient({ chainId: 97 });
    const initialResult = await reader(wrongInitial.client).getPositionSnapshot(request());
    expect(initialResult).toMatchObject({
      status: "unavailable",
      reason: "chain_mismatch",
      stage: "chain"
    });
    expect(wrongInitial.multicall).not.toHaveBeenCalled();

    const switchedSnapshot = [...(defaultSnapshot() as readonly unknown[])];
    switchedSnapshot[3] = 97n;
    const switched = createFakeClient({ snapshot: switchedSnapshot });
    const switchedResult = await reader(switched.client).getPositionSnapshot(request());
    expect(switchedResult).toMatchObject({
      status: "unavailable",
      reason: "chain_mismatch",
      stage: "snapshot",
      blockNumber: BLOCK_NUMBER.toString(10)
    });
    expect(switched.getBlock).not.toHaveBeenCalled();
  });

  it("rejects non-official managers, infrastructure-as-pool, and extra request fields", async () => {
    const fake = createFakeClient();
    const invalidRequests: unknown[] = [
      request({ positionManagerAddress: OTHER_POOL }),
      request({ poolAddress: PANCAKE_V3_BSC_DEPLOYMENTS[56].factory }),
      request({ poolAddress: PANCAKE_V3_MULTICALL3_DEPLOYMENTS[56].address }),
      { ...request(), fallbackFixture: true }
    ];

    for (const input of invalidRequests) {
      const result = await reader(fake.client).getPositionSnapshot(
        input as PancakeV3LatestSnapshotRequest
      );
      expect(result).toMatchObject({
        status: "unavailable",
        reason: "invalid_request",
        stage: "request"
      });
    }
    expect(fake.getChainId).not.toHaveBeenCalled();
  });

  it.each([
    { label: "manager token", snapshotIndex: 4, value: OTHER_TOKEN },
    { label: "pool fee", snapshotIndex: 8, value: 2_500 }
  ])("rejects $label routing drift between discovery and stage two", async (testCase) => {
    const snapshot = [...(defaultSnapshot() as readonly unknown[])];
    if (testCase.snapshotIndex === 4) {
      const position = [...stageTwoPosition];
      position[2] = testCase.value as typeof TOKEN0;
      snapshot[4] = position;
    } else {
      snapshot[testCase.snapshotIndex] = testCase.value;
    }
    const fake = createFakeClient({ snapshot });

    const result = await reader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "discovery_drift",
      stage: "snapshot",
      retryable: true
    });
    expect(fake.getBlock).not.toHaveBeenCalled();
    expect(fake.batches[1]?.contracts[10]?.args).toEqual([TOKEN0, TOKEN1, 500]);
  });

  it.each([
    {
      label: "parent hash",
      snapshot: () => {
        const value = [...(defaultSnapshot() as readonly unknown[])];
        value[2] = OTHER_HASH;
        return value;
      }
    },
    {
      label: "timestamp",
      snapshot: () => {
        const value = [...(defaultSnapshot() as readonly unknown[])];
        value[1] = BLOCK_TIMESTAMP - 1n;
        return value;
      }
    }
  ])("rejects a $label reorg signal", async ({ snapshot }) => {
    const fake = createFakeClient({ snapshot: snapshot() });

    const result = await reader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "reorg_detected",
      stage: "block_identity",
      retryable: true
    });
  });

  it("binds the exact block number and caller-supplied block hash", async () => {
    const wrongNumber = createFakeClient({
      block: { ...(defaultBlock() as object), number: BLOCK_NUMBER + 1n }
    });
    const wrongNumberResult = await reader(wrongNumber.client).getPositionSnapshot(request());
    expect(wrongNumberResult).toMatchObject({
      status: "unavailable",
      reason: "block_mismatch",
      stage: "block_identity"
    });
    expect(wrongNumber.getBlock).toHaveBeenCalledWith({ blockNumber: BLOCK_NUMBER });

    const wrongHash = createFakeClient();
    const wrongHashResult = await reader(wrongHash.client).getPositionSnapshot(
      request({ expectedBlockHash: OTHER_HASH })
    );
    expect(wrongHashResult).toMatchObject({
      status: "unavailable",
      reason: "block_mismatch",
      stage: "block_identity"
    });
  });

  it.each([
    {
      label: "malformed discovery",
      options: { discovery: [stageTwoPosition, TOKEN0] },
      expected: { reason: "incompatible_response", stage: "discovery", retryable: false }
    },
    {
      label: "discovery transport failure",
      options: { failMulticallAt: 1 as const },
      expected: { reason: "read_error", stage: "discovery", retryable: true }
    },
    {
      label: "malformed atomic snapshot",
      options: { snapshot: [BLOCK_NUMBER] },
      expected: { reason: "incompatible_response", stage: "snapshot", retryable: false }
    },
    {
      label: "atomic snapshot transport failure",
      options: { failMulticallAt: 2 as const },
      expected: { reason: "read_error", stage: "snapshot", retryable: true }
    },
    {
      label: "malformed block identity",
      options: { block: null },
      expected: { reason: "incompatible_response", stage: "block_identity", retryable: false }
    },
    {
      label: "block transport failure",
      options: { failBlock: true },
      expected: { reason: "read_error", stage: "block_identity", retryable: true }
    }
  ])("fails closed on $label without any fallback", async ({ options, expected }) => {
    const fake = createFakeClient(options);
    const result = await reader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({ status: "unavailable", ...expected });
    expect(fake.multicall.mock.calls.length).toBeLessThanOrEqual(2);
    expect(fake.unexpectedGetCode).not.toHaveBeenCalled();
    expect(fake.unexpectedReadContract).not.toHaveBeenCalled();
  });

  it("rejects stale and implausibly future latest blocks", async () => {
    const staleTimestamp = BLOCK_TIMESTAMP - 121n;
    const staleSnapshot = [...(defaultSnapshot() as readonly unknown[])];
    staleSnapshot[1] = staleTimestamp;
    const stale = createFakeClient({
      snapshot: staleSnapshot,
      block: { ...(defaultBlock() as object), timestamp: staleTimestamp }
    });
    const staleResult = await reader(stale.client).getPositionSnapshot(request());
    expect(staleResult).toMatchObject({
      status: "unavailable",
      reason: "stale_block",
      stage: "block_identity"
    });

    const futureTimestamp = BLOCK_TIMESTAMP + 91n;
    const futureSnapshot = [...(defaultSnapshot() as readonly unknown[])];
    futureSnapshot[1] = futureTimestamp;
    const future = createFakeClient({
      snapshot: futureSnapshot,
      block: { ...(defaultBlock() as object), timestamp: futureTimestamp }
    });
    const futureResult = await reader(future.client).getPositionSnapshot(request());
    expect(futureResult).toMatchObject({
      status: "unavailable",
      reason: "incompatible_response",
      stage: "block_identity"
    });
  });

  it("uses the cached validator and rejects cross-contract relation failures", async () => {
    const snapshot = [...(defaultSnapshot() as readonly unknown[])];
    snapshot[10] = OTHER_POOL;
    const fake = createFakeClient({ snapshot });

    const result = await reader(fake.client).getPositionSnapshot(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "validation_failed",
      stage: "validation",
      retryable: false
    });
    expect(fake.unexpectedGetCode).not.toHaveBeenCalled();
    expect(fake.unexpectedReadContract).not.toHaveBeenCalled();
  });

  it("sanitizes provider errors and rejects invalid clocks before any read", async () => {
    const marker = "synthetic-provider-detail-must-not-escape";
    const fake = createFakeClient();
    fake.client.getChainId = vi.fn(async () => {
      throw new Error(marker);
    });
    const failed = await reader(fake.client).getPositionSnapshot(request());
    expect(JSON.stringify(failed)).not.toContain(marker);

    const invalidClockReader = createPancakeV3LatestPositionReader({
      client: fake.client,
      now: () => new Date(Number.NaN)
    });
    const invalidClock = await invalidClockReader.getPositionSnapshot(request());
    expect(invalidClock).toMatchObject({
      status: "unavailable",
      reason: "invalid_clock",
      stage: "request",
      observedAt: null
    });
    expect(fake.multicall).not.toHaveBeenCalled();
  });
});
