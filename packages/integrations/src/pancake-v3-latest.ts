import { getAddress, isAddress, parseAbi, type Abi, type Address, type Hex } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { z } from "zod";

import {
  PANCAKE_V3_BSC_DEPLOYMENTS,
  PANCAKE_V3_FACTORY_ABI,
  PANCAKE_V3_POOL_ABI,
  PANCAKE_V3_POSITION_MANAGER_ABI,
  createPancakeV3PositionReader,
  type PancakeV3PositionSnapshot,
  type PancakeV3ReadClient,
  type PancakeV3SnapshotProvenance,
  type PancakeV3SupportedChainId
} from "./pancake-v3";

const UINT16_MAX = (1n << 16n) - 1n;
const UINT24_MAX = (1n << 24n) - 1n;
const UINT32_MAX = (1n << 32n) - 1n;
const UINT96_MAX = (1n << 96n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;
const UINT160_MAX = (1n << 160n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const PANCAKE_V3_MIN_TICK = -887_272;
const PANCAKE_V3_MAX_TICK = 887_272;
const PANCAKE_V3_MIN_SQRT_RATIO = 4_295_128_739n;
const PANCAKE_V3_MAX_SQRT_RATIO =
  1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n;
const MAX_BLOCK_TIMESTAMP = 253_402_300_799n;
const MAX_FUTURE_BLOCK_SKEW_SECONDS = 60n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const STAGE_TWO_CALL_COUNT = 12 as const;

const supportedChainIdSchema = z.union([z.literal(56), z.literal(97)]);
const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Invalid EVM address")
  .transform((value) => getAddress(value) as Address);
const nonZeroAddressSchema = addressSchema.refine(
  (value) => value !== ZERO_ADDRESS,
  "The zero address is not allowed"
);
const blockHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte block hash")
  .transform((value) => value.toLowerCase() as Hex);
const uint256DecimalSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/, "Expected a canonical uint256 decimal string")
  .refine((value) => {
    try {
      return BigInt(value) <= UINT256_MAX;
    } catch {
      return false;
    }
  }, "Value exceeds uint256");
const maximumBlockAgeSchema = z.number().int().positive().max(3_600);
const uint16NumberSchema = z.number().int().min(0).max(Number(UINT16_MAX));
const uint24NumberSchema = z.number().int().min(0).max(Number(UINT24_MAX));
const uint32NumberSchema = z.number().int().min(0).max(Number(UINT32_MAX));
const int24NumberSchema = z
  .number()
  .int()
  .min(-(2 ** 23))
  .max(2 ** 23 - 1);
const tickSchema = z.number().int().min(PANCAKE_V3_MIN_TICK).max(PANCAKE_V3_MAX_TICK);
const uint96BigIntSchema = z.bigint().min(0n).max(UINT96_MAX);
const uint128BigIntSchema = z.bigint().min(0n).max(UINT128_MAX);
const uint160BigIntSchema = z.bigint().min(0n).max(UINT160_MAX);
const uint256BigIntSchema = z.bigint().min(0n).max(UINT256_MAX);

export const PANCAKE_V3_MULTICALL3_DEPLOYMENTS = Object.freeze({
  56: Object.freeze({
    address: getAddress(bsc.contracts.multicall3.address),
    blockCreated: bsc.contracts.multicall3.blockCreated
  }),
  97: Object.freeze({
    address: getAddress(bscTestnet.contracts.multicall3.address),
    blockCreated: bscTestnet.contracts.multicall3.blockCreated
  })
});

/** Official Multicall3 context getters executed inside the aggregate itself. */
export const PANCAKE_V3_MULTICALL3_CONTEXT_ABI = parseAbi([
  "function getBlockNumber() external view returns (uint256 blockNumber)",
  "function getCurrentBlockTimestamp() external view returns (uint256 timestamp)",
  "function getLastBlockHash() external view returns (bytes32 blockHash)",
  "function getChainId() external view returns (uint256 chainId)"
]);

export const pancakeV3LatestSnapshotRequestSchema = z
  .strictObject({
    chainId: supportedChainIdSchema,
    positionManagerAddress: nonZeroAddressSchema,
    poolAddress: nonZeroAddressSchema,
    positionId: uint256DecimalSchema,
    expectedBlockHash: blockHashSchema.optional(),
    maximumBlockAgeSeconds: maximumBlockAgeSchema
  })
  .superRefine((request, context) => {
    const deployment = PANCAKE_V3_BSC_DEPLOYMENTS[request.chainId];
    const multicall = PANCAKE_V3_MULTICALL3_DEPLOYMENTS[request.chainId];
    if (request.positionManagerAddress !== deployment.positionManager) {
      context.addIssue({
        code: "custom",
        path: ["positionManagerAddress"],
        message: "Position manager is not the official Pancake V3 deployment for this chain"
      });
    }
    if (
      request.poolAddress === deployment.positionManager ||
      request.poolAddress === deployment.factory ||
      request.poolAddress === multicall.address
    ) {
      context.addIssue({
        code: "custom",
        path: ["poolAddress"],
        message: "Pool address must be distinct from the official infrastructure contracts"
      });
    }
  });

export type PancakeV3LatestSnapshotRequest = z.input<typeof pancakeV3LatestSnapshotRequestSchema>;
type ValidatedLatestRequest = z.output<typeof pancakeV3LatestSnapshotRequestSchema>;

export interface PancakeV3LatestMulticallContract {
  readonly address: Address;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args?: readonly unknown[];
}

export interface PancakeV3LatestMulticallParameters {
  readonly contracts: readonly PancakeV3LatestMulticallContract[];
  readonly allowFailure: false;
  /** viem 2.55.13 uses zero to disable calldata chunk splitting. */
  readonly batchSize: 0;
  readonly blockTag: "latest";
  readonly multicallAddress: Address;
}

/** Minimal latest-only surface. It intentionally has no readContract/getCode methods. */
export interface PancakeV3LatestReadClient {
  getChainId(): Promise<unknown>;
  getBlock(parameters: { readonly blockNumber: bigint }): Promise<unknown>;
  multicall(parameters: PancakeV3LatestMulticallParameters): Promise<unknown>;
}

export interface CreatePancakeV3LatestPositionReaderOptions {
  readonly client: PancakeV3LatestReadClient;
  readonly now: () => Date;
}

export type PancakeV3LatestSnapshotStage =
  "request" | "chain" | "discovery" | "snapshot" | "block_identity" | "validation";

export type PancakeV3LatestUnavailableReason =
  | "invalid_clock"
  | "invalid_request"
  | "chain_mismatch"
  | "read_error"
  | "incompatible_response"
  | "discovery_drift"
  | "block_mismatch"
  | "reorg_detected"
  | "stale_block"
  | "validation_failed";

export interface PancakeV3LatestUnavailableResult {
  readonly status: "unavailable";
  readonly reason: PancakeV3LatestUnavailableReason;
  readonly stage: PancakeV3LatestSnapshotStage;
  readonly message: string;
  readonly retryable: boolean;
  readonly observedAt: string | null;
  readonly chainId: PancakeV3SupportedChainId | null;
  readonly blockNumber: string | null;
}

export interface PancakeV3LatestSnapshotProvenance extends PancakeV3SnapshotProvenance {
  readonly consistency: "atomic_latest_multicall3";
  readonly stageTwoAtomicCallCount: typeof STAGE_TWO_CALL_COUNT;
  readonly multicall3Address: Address;
  readonly parentBlockHash: Hex;
  readonly historicalContractStateRequests: false;
  readonly discoveryUsedAsEvidence: false;
  readonly contractPresenceEvidence: "successful_stage_two_calls";
  readonly codeHashIdentity: "not_established";
  readonly currentBlockHashAvailableInsideSnapshot: false;
  readonly blockHashSource: "post_snapshot_exact_block_header";
  readonly reorgSignalsChecked: "block_number_timestamp_parent_hash";
}

export interface PancakeV3LatestAvailableResult {
  readonly status: "available";
  readonly snapshot: PancakeV3PositionSnapshot;
  readonly provenance: PancakeV3LatestSnapshotProvenance;
}

export type PancakeV3LatestSnapshotResult =
  PancakeV3LatestAvailableResult | PancakeV3LatestUnavailableResult;

export interface PancakeV3LatestPositionReader {
  getPositionSnapshot(
    input: PancakeV3LatestSnapshotRequest
  ): Promise<PancakeV3LatestSnapshotResult>;
}

const positionResultSchema = z
  .tuple([
    uint96BigIntSchema,
    addressSchema,
    nonZeroAddressSchema,
    nonZeroAddressSchema,
    uint24NumberSchema.refine((value) => value > 0, "Pool fee must be positive"),
    tickSchema,
    tickSchema,
    uint128BigIntSchema,
    uint256BigIntSchema,
    uint256BigIntSchema,
    uint128BigIntSchema,
    uint128BigIntSchema
  ])
  .superRefine((position, context) => {
    if (position[2] === position[3]) {
      context.addIssue({
        code: "custom",
        path: [3],
        message: "Position token addresses must be distinct"
      });
    }
    if (position[5] >= position[6]) {
      context.addIssue({
        code: "custom",
        path: [6],
        message: "Position tickLower must be below tickUpper"
      });
    }
  });

const slot0ResultSchema = z.tuple([
  uint160BigIntSchema
    .min(PANCAKE_V3_MIN_SQRT_RATIO)
    .refine(
      (value) => value < PANCAKE_V3_MAX_SQRT_RATIO,
      "sqrtPriceX96 is outside Pancake V3 TickMath"
    ),
  tickSchema,
  uint16NumberSchema,
  uint16NumberSchema.refine((value) => value > 0),
  uint16NumberSchema.refine((value) => value > 0),
  uint32NumberSchema,
  z.literal(true)
]);

const positiveTickSpacingSchema = int24NumberSchema.refine((value) => value > 0);

const discoveryResultSchema = z.tuple([
  positionResultSchema,
  nonZeroAddressSchema,
  nonZeroAddressSchema,
  uint24NumberSchema
]);

const stageTwoResultSchema = z.tuple([
  uint256BigIntSchema,
  z.bigint().min(0n).max(MAX_BLOCK_TIMESTAMP),
  blockHashSchema,
  uint256BigIntSchema,
  positionResultSchema,
  slot0ResultSchema,
  nonZeroAddressSchema,
  nonZeroAddressSchema,
  uint24NumberSchema,
  positiveTickSpacingSchema,
  nonZeroAddressSchema,
  positiveTickSpacingSchema
]);

const blockIdentitySchema = z.strictObject({
  number: uint256BigIntSchema,
  hash: blockHashSchema,
  parentHash: blockHashSchema,
  timestamp: z.bigint().min(0n).max(MAX_BLOCK_TIMESTAMP)
});

type DiscoveryResult = z.output<typeof discoveryResultSchema>;
type StageTwoResult = z.output<typeof stageTwoResultSchema>;
type BlockIdentity = z.output<typeof blockIdentitySchema>;

function unavailable(
  reason: PancakeV3LatestUnavailableReason,
  stage: PancakeV3LatestSnapshotStage,
  message: string,
  retryable: boolean,
  observedAt: string | null,
  chainId: PancakeV3SupportedChainId | null,
  blockNumber: bigint | null = null
): PancakeV3LatestUnavailableResult {
  return {
    status: "unavailable",
    reason,
    stage,
    message,
    retryable,
    observedAt,
    chainId,
    blockNumber: blockNumber?.toString(10) ?? null
  };
}

function readClock(now: () => Date): { date: Date; iso: string; unix: bigint } | null {
  let date: Date;
  try {
    date = now();
  } catch {
    return null;
  }
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const unixNumber = Math.floor(date.getTime() / 1_000);
  if (!Number.isSafeInteger(unixNumber) || unixNumber < 0) return null;
  const unix = BigInt(unixNumber);
  if (unix > MAX_BLOCK_TIMESTAMP) return null;
  return { date, iso: date.toISOString(), unix };
}

function exactBlockIdentity(input: unknown): BlockIdentity | null {
  if (typeof input !== "object" || input === null) return null;
  const record = input as Record<string, unknown>;
  const result = blockIdentitySchema.safeParse({
    number: record.number,
    hash: record.hash,
    parentHash: record.parentHash,
    timestamp: record.timestamp
  });
  return result.success ? result.data : null;
}

function latestBatch(
  multicallAddress: Address,
  contracts: readonly PancakeV3LatestMulticallContract[]
): PancakeV3LatestMulticallParameters {
  return {
    contracts,
    allowFailure: false,
    batchSize: 0,
    blockTag: "latest",
    multicallAddress
  };
}

function discoveryContracts(
  request: ValidatedLatestRequest
): readonly PancakeV3LatestMulticallContract[] {
  return [
    {
      address: request.positionManagerAddress,
      abi: PANCAKE_V3_POSITION_MANAGER_ABI,
      functionName: "positions",
      args: [BigInt(request.positionId)]
    },
    { address: request.poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: "token0" },
    { address: request.poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: "token1" },
    { address: request.poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: "fee" }
  ];
}

function snapshotContracts(
  request: ValidatedLatestRequest,
  discovery: DiscoveryResult,
  multicallAddress: Address,
  factoryAddress: Address
): readonly PancakeV3LatestMulticallContract[] {
  const discoveredPosition = discovery[0];
  return [
    {
      address: multicallAddress,
      abi: PANCAKE_V3_MULTICALL3_CONTEXT_ABI,
      functionName: "getBlockNumber"
    },
    {
      address: multicallAddress,
      abi: PANCAKE_V3_MULTICALL3_CONTEXT_ABI,
      functionName: "getCurrentBlockTimestamp"
    },
    {
      address: multicallAddress,
      abi: PANCAKE_V3_MULTICALL3_CONTEXT_ABI,
      functionName: "getLastBlockHash"
    },
    {
      address: multicallAddress,
      abi: PANCAKE_V3_MULTICALL3_CONTEXT_ABI,
      functionName: "getChainId"
    },
    {
      address: request.positionManagerAddress,
      abi: PANCAKE_V3_POSITION_MANAGER_ABI,
      functionName: "positions",
      args: [BigInt(request.positionId)]
    },
    { address: request.poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: "slot0" },
    { address: request.poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: "token0" },
    { address: request.poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: "token1" },
    { address: request.poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: "fee" },
    { address: request.poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: "tickSpacing" },
    {
      address: factoryAddress,
      abi: PANCAKE_V3_FACTORY_ABI,
      functionName: "getPool",
      args: [discoveredPosition[2], discoveredPosition[3], discoveredPosition[4]]
    },
    {
      address: factoryAddress,
      abi: PANCAKE_V3_FACTORY_ABI,
      functionName: "feeAmountTickSpacing",
      args: [discoveredPosition[4]]
    }
  ];
}

function discoveryRelationsMatch(discovery: DiscoveryResult, snapshot: StageTwoResult): boolean {
  const discoveredPosition = discovery[0];
  const snapshotPosition = snapshot[4];
  return (
    discoveredPosition[2] === snapshotPosition[2] &&
    discoveredPosition[3] === snapshotPosition[3] &&
    discoveredPosition[4] === snapshotPosition[4] &&
    discovery[1] === snapshot[6] &&
    discovery[2] === snapshot[7] &&
    discovery[3] === snapshot[8]
  );
}

function argumentsMatch(
  actual: readonly unknown[] | undefined,
  expected: readonly unknown[]
): boolean {
  if (actual === undefined || actual.length !== expected.length) return false;
  return actual.every((value, index) => value === expected[index]);
}

function createStrictCachedFacade(
  request: ValidatedLatestRequest,
  block: BlockIdentity,
  snapshot: StageTwoResult
): PancakeV3ReadClient {
  const deployment = PANCAKE_V3_BSC_DEPLOYMENTS[request.chainId];
  const position = snapshot[4];
  const poolResults = new Map<string, unknown>([
    ["slot0", snapshot[5]],
    ["token0", snapshot[6]],
    ["token1", snapshot[7]],
    ["fee", snapshot[8]],
    ["tickSpacing", snapshot[9]]
  ]);

  function requireBlockNumber(blockNumber: bigint): void {
    if (blockNumber !== block.number) throw new Error("CACHE_MISS");
  }

  return {
    async getChainId() {
      return request.chainId;
    },
    async getBlock(parameters) {
      requireBlockNumber(parameters.blockNumber);
      return block;
    },
    async getCode(parameters) {
      requireBlockNumber(parameters.blockNumber);
      if (
        parameters.address !== request.positionManagerAddress &&
        parameters.address !== request.poolAddress &&
        parameters.address !== deployment.factory
      ) {
        throw new Error("CACHE_MISS");
      }
      // A successful stage-two call proves callable code at that target. This
      // sentinel is internal validation state and is never a code hash claim.
      return "0x01";
    },
    async readContract(parameters) {
      requireBlockNumber(parameters.blockNumber);
      if (
        parameters.address === request.positionManagerAddress &&
        parameters.functionName === "positions" &&
        argumentsMatch(parameters.args, [BigInt(request.positionId)])
      ) {
        return position;
      }
      if (
        parameters.address === request.poolAddress &&
        (parameters.args === undefined || parameters.args.length === 0) &&
        poolResults.has(parameters.functionName)
      ) {
        return poolResults.get(parameters.functionName);
      }
      if (
        parameters.address === deployment.factory &&
        parameters.functionName === "getPool" &&
        argumentsMatch(parameters.args, [position[2], position[3], position[4]])
      ) {
        return snapshot[10];
      }
      if (
        parameters.address === deployment.factory &&
        parameters.functionName === "feeAmountTickSpacing" &&
        argumentsMatch(parameters.args, [position[4]])
      ) {
        return snapshot[11];
      }
      throw new Error("CACHE_MISS");
    }
  };
}

export function createPancakeV3LatestPositionReader(
  options: CreatePancakeV3LatestPositionReaderOptions
): PancakeV3LatestPositionReader {
  return {
    async getPositionSnapshot(input) {
      const clock = readClock(options.now);
      if (clock === null) {
        return unavailable(
          "invalid_clock",
          "request",
          "The snapshot clock returned an invalid time.",
          false,
          null,
          null
        );
      }

      const requestResult = pancakeV3LatestSnapshotRequestSchema.safeParse(input);
      if (!requestResult.success) {
        return unavailable(
          "invalid_request",
          "request",
          "The latest Pancake V3 snapshot request failed runtime validation.",
          false,
          clock.iso,
          null
        );
      }
      const request = requestResult.data;
      const deployment = PANCAKE_V3_BSC_DEPLOYMENTS[request.chainId];
      const multicall = PANCAKE_V3_MULTICALL3_DEPLOYMENTS[request.chainId];

      let chainRaw: unknown;
      try {
        chainRaw = await options.client.getChainId();
      } catch {
        return unavailable(
          "read_error",
          "chain",
          "The RPC chain check failed.",
          true,
          clock.iso,
          request.chainId
        );
      }
      const chainResult = supportedChainIdSchema.safeParse(chainRaw);
      if (!chainResult.success) {
        return unavailable(
          "incompatible_response",
          "chain",
          "The RPC returned an invalid or unsupported chain ID.",
          false,
          clock.iso,
          request.chainId
        );
      }
      if (chainResult.data !== request.chainId) {
        return unavailable(
          "chain_mismatch",
          "chain",
          "The RPC chain does not match the requested BSC chain.",
          false,
          clock.iso,
          request.chainId
        );
      }

      let discoveryRaw: unknown;
      try {
        discoveryRaw = await options.client.multicall(
          latestBatch(multicall.address, discoveryContracts(request))
        );
      } catch {
        return unavailable(
          "read_error",
          "discovery",
          "The latest discovery Multicall3 batch failed.",
          true,
          clock.iso,
          request.chainId
        );
      }
      const discoveryResult = discoveryResultSchema.safeParse(discoveryRaw);
      if (!discoveryResult.success) {
        return unavailable(
          "incompatible_response",
          "discovery",
          "The latest discovery batch returned an incompatible result.",
          false,
          clock.iso,
          request.chainId
        );
      }

      let snapshotRaw: unknown;
      try {
        snapshotRaw = await options.client.multicall(
          latestBatch(
            multicall.address,
            snapshotContracts(request, discoveryResult.data, multicall.address, deployment.factory)
          )
        );
      } catch {
        return unavailable(
          "read_error",
          "snapshot",
          "The atomic latest snapshot Multicall3 batch failed.",
          true,
          clock.iso,
          request.chainId
        );
      }
      const snapshotResult = stageTwoResultSchema.safeParse(snapshotRaw);
      if (!snapshotResult.success) {
        return unavailable(
          "incompatible_response",
          "snapshot",
          "The atomic latest snapshot batch returned an incompatible result.",
          false,
          clock.iso,
          request.chainId
        );
      }
      const snapshot = snapshotResult.data;
      const blockNumber = snapshot[0];

      if (snapshot[3] !== BigInt(request.chainId)) {
        return unavailable(
          "chain_mismatch",
          "snapshot",
          "Multicall3 observed a different chain during the atomic snapshot.",
          false,
          clock.iso,
          request.chainId,
          blockNumber
        );
      }
      if (!discoveryRelationsMatch(discoveryResult.data, snapshot)) {
        return unavailable(
          "discovery_drift",
          "snapshot",
          "Position or pool routing inputs changed between discovery and the atomic snapshot.",
          true,
          clock.iso,
          request.chainId,
          blockNumber
        );
      }

      let blockRaw: unknown;
      try {
        blockRaw = await options.client.getBlock({ blockNumber });
      } catch {
        return unavailable(
          "read_error",
          "block_identity",
          "The exact block identity read failed after the atomic snapshot.",
          true,
          clock.iso,
          request.chainId,
          blockNumber
        );
      }
      const block = exactBlockIdentity(blockRaw);
      if (block === null) {
        return unavailable(
          "incompatible_response",
          "block_identity",
          "The exact block identity response was malformed.",
          false,
          clock.iso,
          request.chainId,
          blockNumber
        );
      }
      if (block.number !== blockNumber) {
        return unavailable(
          "block_mismatch",
          "block_identity",
          "The block identity response does not match Multicall3's block number.",
          true,
          clock.iso,
          request.chainId,
          blockNumber
        );
      }
      if (block.timestamp !== snapshot[1] || block.parentHash !== snapshot[2]) {
        return unavailable(
          "reorg_detected",
          "block_identity",
          "The exact block identity does not match the atomic Multicall3 context.",
          true,
          clock.iso,
          request.chainId,
          blockNumber
        );
      }
      if (request.expectedBlockHash !== undefined && block.hash !== request.expectedBlockHash) {
        return unavailable(
          "block_mismatch",
          "block_identity",
          "The exact block hash does not match the caller's expected identity.",
          true,
          clock.iso,
          request.chainId,
          blockNumber
        );
      }
      if (block.timestamp > clock.unix + MAX_FUTURE_BLOCK_SKEW_SECONDS) {
        return unavailable(
          "incompatible_response",
          "block_identity",
          "The atomic snapshot block timestamp is implausibly in the future.",
          false,
          clock.iso,
          request.chainId,
          blockNumber
        );
      }
      const age = clock.unix > block.timestamp ? clock.unix - block.timestamp : 0n;
      if (age > BigInt(request.maximumBlockAgeSeconds)) {
        return unavailable(
          "stale_block",
          "block_identity",
          "The latest RPC snapshot exceeds the caller's freshness limit.",
          true,
          clock.iso,
          request.chainId,
          blockNumber
        );
      }

      const cachedReader = createPancakeV3PositionReader({
        client: createStrictCachedFacade(request, block, snapshot),
        now: () => clock.date
      });
      const validated = await cachedReader.getPositionSnapshot({
        chainId: request.chainId,
        positionManagerAddress: request.positionManagerAddress,
        poolAddress: request.poolAddress,
        positionId: request.positionId,
        blockNumber: blockNumber.toString(10),
        expectedBlockHash: block.hash,
        maximumBlockAgeSeconds: request.maximumBlockAgeSeconds
      });
      if (validated.status !== "available") {
        return unavailable(
          "validation_failed",
          "validation",
          "The atomic snapshot failed strict Pancake V3 cross-contract validation.",
          false,
          clock.iso,
          request.chainId,
          blockNumber
        );
      }

      return {
        status: "available",
        snapshot: validated.snapshot,
        provenance: {
          ...validated.provenance,
          consistency: "atomic_latest_multicall3",
          stageTwoAtomicCallCount: STAGE_TWO_CALL_COUNT,
          multicall3Address: multicall.address,
          parentBlockHash: block.parentHash,
          historicalContractStateRequests: false,
          discoveryUsedAsEvidence: false,
          contractPresenceEvidence: "successful_stage_two_calls",
          codeHashIdentity: "not_established",
          currentBlockHashAvailableInsideSnapshot: false,
          blockHashSource: "post_snapshot_exact_block_header",
          reorgSignalsChecked: "block_number_timestamp_parent_hash"
        }
      };
    }
  };
}
