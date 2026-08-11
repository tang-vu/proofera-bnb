import { getAddress, isAddress, parseAbi, type Abi, type Address, type Hex } from "viem";
import { z } from "zod";

const UINT16_MAX = (1n << 16n) - 1n;
const UINT24_MAX = (1n << 24n) - 1n;
const UINT32_MAX = (1n << 32n) - 1n;
const UINT96_MAX = (1n << 96n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;
const UINT160_MAX = (1n << 160n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const INT24_MIN = -(2 ** 23);
const INT24_MAX = 2 ** 23 - 1;
const PANCAKE_V3_MIN_TICK = -887_272;
const PANCAKE_V3_MAX_TICK = 887_272;
const PANCAKE_V3_MIN_SQRT_RATIO = 4_295_128_739n;
const PANCAKE_V3_MAX_SQRT_RATIO =
  1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n;
const MAX_BLOCK_TIMESTAMP = 253_402_300_799n;
const MAX_FUTURE_BLOCK_SKEW_SECONDS = 60;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Sources checked 2026-08-11:
 * https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscMainnet.json
 * https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscTestnet.json
 * https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/projects/v3-core/contracts/libraries/TickMath.sol
 */
export const PANCAKE_V3_BSC_DEPLOYMENTS = Object.freeze({
  56: Object.freeze({
    factory: getAddress("0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"),
    positionManager: getAddress("0x46A15B0b27311cedF172AB29E4f4766fbE7F4364")
  }),
  97: Object.freeze({
    factory: getAddress("0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"),
    positionManager: getAddress("0x427bF5b37357632377eCbEC9de3626C71A5396c1")
  })
});

/** Official Pancake V3 NonfungiblePositionManager read interface. */
export const PANCAKE_V3_POSITION_MANAGER_ABI = parseAbi([
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)"
]);

/** Official Pancake V3 pool reads used by the snapshot. */
export const PANCAKE_V3_POOL_ABI = parseAbi([
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)",
  "function tickSpacing() external view returns (int24)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)"
]);

export const PANCAKE_V3_FACTORY_ABI = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
  "function feeAmountTickSpacing(uint24 fee) external view returns (int24 tickSpacing)"
]);

const supportedChainIdSchema = z.union([z.literal(56), z.literal(97)]);

const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Invalid EVM address")
  .transform((value) => getAddress(value) as Address);

const nonZeroAddressSchema = addressSchema.refine(
  (value) => value !== ZERO_ADDRESS,
  "The zero address is not allowed"
);

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

const blockHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte block hash")
  .transform((value) => value.toLowerCase() as Hex);

export const pancakeV3PositionSnapshotRequestSchema = z
  .strictObject({
    chainId: supportedChainIdSchema,
    positionManagerAddress: nonZeroAddressSchema,
    poolAddress: nonZeroAddressSchema,
    positionId: uint256DecimalSchema,
    blockNumber: uint256DecimalSchema,
    expectedBlockHash: blockHashSchema.optional(),
    maximumBlockAgeSeconds: z.number().int().positive().max(31_536_000).optional()
  })
  .superRefine((request, context) => {
    const deployment = PANCAKE_V3_BSC_DEPLOYMENTS[request.chainId];
    if (request.positionManagerAddress !== deployment.positionManager) {
      context.addIssue({
        code: "custom",
        path: ["positionManagerAddress"],
        message: "Position manager is not the official Pancake V3 deployment for this chain"
      });
    }
    if (
      request.poolAddress === request.positionManagerAddress ||
      request.poolAddress === deployment.factory
    ) {
      context.addIssue({
        code: "custom",
        path: ["poolAddress"],
        message: "Pool address must be distinct from the manager and factory"
      });
    }
  });

export type PancakeV3PositionSnapshotRequest = z.input<
  typeof pancakeV3PositionSnapshotRequestSchema
>;
type ValidatedSnapshotRequest = z.output<typeof pancakeV3PositionSnapshotRequestSchema>;
export type PancakeV3SupportedChainId = z.infer<typeof supportedChainIdSchema>;

export interface PancakeV3ContractReadParameters {
  readonly address: Address;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args?: readonly unknown[];
  readonly blockNumber: bigint;
}

/** Minimal read-only surface implemented by a viem PublicClient. */
export interface PancakeV3ReadClient {
  getChainId(): Promise<unknown>;
  getBlock(parameters: { readonly blockNumber: bigint }): Promise<unknown>;
  getCode(parameters: {
    readonly address: Address;
    readonly blockNumber: bigint;
  }): Promise<unknown>;
  readContract(parameters: PancakeV3ContractReadParameters): Promise<unknown>;
}

export interface CreatePancakeV3PositionReaderOptions {
  readonly client: PancakeV3ReadClient;
  readonly now?: () => Date;
}

export type PancakeV3SnapshotStage =
  "request" | "chain" | "block" | "code" | "position" | "pool" | "relations";

export type PancakeV3UnavailableReason =
  | "invalid_request"
  | "chain_mismatch"
  | "block_mismatch"
  | "stale_block"
  | "missing_code"
  | "read_error"
  | "incompatible_response"
  | "relation_mismatch";

export interface PancakeV3SnapshotProvenance {
  readonly chainId: PancakeV3SupportedChainId;
  readonly blockNumber: string;
  readonly blockHash: Hex;
  readonly blockTimestamp: string;
  readonly blockTimestampUnix: string;
  readonly observedAt: string;
  readonly ageSeconds: number;
  readonly readsPinnedToBlock: true;
  readonly positionManagerAddress: Address;
  readonly factoryAddress: Address;
  readonly poolAddress: Address;
}

export interface PancakeV3PositionSnapshot {
  readonly position: {
    readonly id: string;
    readonly nonce: string;
    readonly operator: Address;
    readonly token0: Address;
    readonly token1: Address;
    readonly fee: number;
    readonly tickLower: number;
    readonly tickUpper: number;
    readonly liquidity: string;
    readonly feeGrowthInside0LastX128: string;
    readonly feeGrowthInside1LastX128: string;
    readonly tokensOwed0: string;
    readonly tokensOwed1: string;
    readonly inRange: boolean;
  };
  readonly pool: {
    readonly token0: Address;
    readonly token1: Address;
    readonly fee: number;
    readonly tickSpacing: number;
    readonly sqrtPriceX96: string;
    readonly tick: number;
    readonly observationIndex: number;
    readonly observationCardinality: number;
    readonly observationCardinalityNext: number;
    readonly feeProtocol: number;
    readonly unlocked: boolean;
  };
}

export interface PancakeV3AvailableResult {
  readonly status: "available";
  readonly snapshot: PancakeV3PositionSnapshot;
  readonly provenance: PancakeV3SnapshotProvenance;
}

export interface PancakeV3UnavailableProvenance {
  readonly observedAt: string;
  readonly chainId: PancakeV3SupportedChainId;
  readonly blockNumber: string;
  readonly blockHash: Hex | null;
  readonly blockTimestamp: string | null;
  readonly blockTimestampUnix: string | null;
  readonly positionManagerAddress: Address;
  readonly factoryAddress: Address;
  readonly poolAddress: Address;
}

export interface PancakeV3UnavailableResult {
  readonly status: "unavailable";
  readonly reason: PancakeV3UnavailableReason;
  readonly stage: PancakeV3SnapshotStage;
  readonly message: string;
  readonly retryable: boolean;
  readonly provenance: PancakeV3UnavailableProvenance | null;
}

export type PancakeV3PositionSnapshotResult = PancakeV3AvailableResult | PancakeV3UnavailableResult;

export interface PancakeV3PositionReader {
  getPositionSnapshot(
    input: PancakeV3PositionSnapshotRequest
  ): Promise<PancakeV3PositionSnapshotResult>;
}

const uint16NumberSchema = z.number().int().min(0).max(Number(UINT16_MAX));
const uint24NumberSchema = z.number().int().min(0).max(Number(UINT24_MAX));
const uint32NumberSchema = z.number().int().min(0).max(Number(UINT32_MAX));
const int24NumberSchema = z.number().int().min(INT24_MIN).max(INT24_MAX);
const pancakeV3TickSchema = z.number().int().min(PANCAKE_V3_MIN_TICK).max(PANCAKE_V3_MAX_TICK);

const uint96BigIntSchema = z.bigint().min(0n).max(UINT96_MAX);
const uint128BigIntSchema = z.bigint().min(0n).max(UINT128_MAX);
const uint160BigIntSchema = z.bigint().min(0n).max(UINT160_MAX);
const uint256BigIntSchema = z.bigint().min(0n).max(UINT256_MAX);

const positionResultSchema = z
  .tuple([
    uint96BigIntSchema,
    addressSchema,
    nonZeroAddressSchema,
    nonZeroAddressSchema,
    uint24NumberSchema.refine((value) => value > 0, "Pool fee must be positive"),
    pancakeV3TickSchema,
    pancakeV3TickSchema,
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
        message: "Position tickLower must be less than tickUpper"
      });
    }
  });

const slot0ResultSchema = z
  .tuple([
    uint160BigIntSchema
      .min(PANCAKE_V3_MIN_SQRT_RATIO)
      .refine(
        (value) => value < PANCAKE_V3_MAX_SQRT_RATIO,
        "sqrtPriceX96 exceeds the Pancake V3 TickMath range"
      ),
    pancakeV3TickSchema,
    uint16NumberSchema,
    uint16NumberSchema.refine((value) => value > 0, "observationCardinality must be positive"),
    uint16NumberSchema.refine((value) => value > 0, "observationCardinalityNext must be positive"),
    uint32NumberSchema,
    z.literal(true)
  ])
  .superRefine((slot0, context) => {
    if (slot0[2] >= slot0[3]) {
      context.addIssue({
        code: "custom",
        path: [2],
        message: "observationIndex must be below observationCardinality"
      });
    }
    if (slot0[3] > slot0[4]) {
      context.addIssue({
        code: "custom",
        path: [4],
        message: "observationCardinalityNext cannot be below observationCardinality"
      });
    }
  });

const blockResultSchema = z.looseObject({
  number: z.bigint().min(0n).max(UINT256_MAX),
  hash: blockHashSchema,
  timestamp: z.bigint().min(0n).max(MAX_BLOCK_TIMESTAMP)
});

const codeResultSchema = z.union([
  z.undefined(),
  z.literal("0x"),
  z.string().regex(/^0x(?:[0-9a-fA-F]{2})+$/)
]);

function createPartialProvenance(
  request: ValidatedSnapshotRequest,
  observedAt: string,
  block?: z.output<typeof blockResultSchema>
): PancakeV3UnavailableProvenance {
  const deployment = PANCAKE_V3_BSC_DEPLOYMENTS[request.chainId];
  return {
    observedAt,
    chainId: request.chainId,
    blockNumber: request.blockNumber,
    blockHash: block?.hash ?? null,
    blockTimestamp:
      block === undefined ? null : new Date(Number(block.timestamp) * 1_000).toISOString(),
    blockTimestampUnix: block?.timestamp.toString(10) ?? null,
    positionManagerAddress: request.positionManagerAddress,
    factoryAddress: deployment.factory,
    poolAddress: request.poolAddress
  };
}

function unavailable(
  reason: PancakeV3UnavailableReason,
  stage: PancakeV3SnapshotStage,
  message: string,
  retryable: boolean,
  provenance: PancakeV3UnavailableProvenance | null
): PancakeV3UnavailableResult {
  return { status: "unavailable", reason, stage, message, retryable, provenance };
}

function canonicalAddressLessThan(left: Address, right: Address): boolean {
  return BigInt(left.toLowerCase()) < BigInt(right.toLowerCase());
}

export function createPancakeV3PositionReader(
  options: CreatePancakeV3PositionReaderOptions
): PancakeV3PositionReader {
  const now = options.now ?? (() => new Date());

  return {
    async getPositionSnapshot(
      input: PancakeV3PositionSnapshotRequest
    ): Promise<PancakeV3PositionSnapshotResult> {
      const observedDate = now();
      if (!Number.isFinite(observedDate.getTime())) {
        return unavailable(
          "incompatible_response",
          "request",
          "The snapshot clock returned an invalid time.",
          false,
          null
        );
      }
      const observedAt = observedDate.toISOString();
      const parsedRequest = pancakeV3PositionSnapshotRequestSchema.safeParse(input);
      if (!parsedRequest.success) {
        return unavailable(
          "invalid_request",
          "request",
          "The Pancake V3 snapshot request failed runtime validation.",
          false,
          null
        );
      }

      const request = parsedRequest.data;
      const deployment = PANCAKE_V3_BSC_DEPLOYMENTS[request.chainId];
      const blockNumber = BigInt(request.blockNumber);
      let block: z.output<typeof blockResultSchema> | undefined;
      let stage: PancakeV3SnapshotStage = "chain";

      try {
        const chainResult = supportedChainIdSchema.safeParse(await options.client.getChainId());
        if (!chainResult.success) {
          return unavailable(
            "incompatible_response",
            "chain",
            "The read client returned an invalid or unsupported chain ID.",
            false,
            createPartialProvenance(request, observedAt)
          );
        }
        if (chainResult.data !== request.chainId) {
          return unavailable(
            "chain_mismatch",
            "chain",
            "The read client chain does not match the requested BSC chain.",
            false,
            createPartialProvenance(request, observedAt)
          );
        }

        stage = "block";
        const blockResult = blockResultSchema.safeParse(
          await options.client.getBlock({ blockNumber })
        );
        if (!blockResult.success) {
          return unavailable(
            "incompatible_response",
            "block",
            "The read client returned an invalid block identity or timestamp.",
            false,
            createPartialProvenance(request, observedAt)
          );
        }
        block = blockResult.data;
        if (block.number !== blockNumber) {
          return unavailable(
            "block_mismatch",
            "block",
            "The read client returned a different block number than requested.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }
        if (request.expectedBlockHash !== undefined && block.hash !== request.expectedBlockHash) {
          return unavailable(
            "block_mismatch",
            "block",
            "The block hash does not match the caller's expected block identity.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }

        const observedUnix = Math.floor(observedDate.getTime() / 1_000);
        const blockUnix = Number(block.timestamp);
        if (blockUnix > observedUnix + MAX_FUTURE_BLOCK_SKEW_SECONDS) {
          return unavailable(
            "incompatible_response",
            "block",
            "The block timestamp is implausibly ahead of the snapshot clock.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }
        const ageSeconds = Math.max(0, observedUnix - blockUnix);
        if (
          request.maximumBlockAgeSeconds !== undefined &&
          ageSeconds > request.maximumBlockAgeSeconds
        ) {
          return unavailable(
            "stale_block",
            "block",
            "The requested block is older than the caller's freshness limit.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }

        stage = "code";
        const [positionManagerCodeRaw, poolCodeRaw, factoryCodeRaw] = await Promise.all([
          options.client.getCode({
            address: request.positionManagerAddress,
            blockNumber
          }),
          options.client.getCode({ address: request.poolAddress, blockNumber }),
          options.client.getCode({ address: deployment.factory, blockNumber })
        ]);
        const codeResults = [
          ["position manager", positionManagerCodeRaw],
          ["pool", poolCodeRaw],
          ["factory", factoryCodeRaw]
        ] as const;
        for (const [contractName, codeRaw] of codeResults) {
          const codeResult = codeResultSchema.safeParse(codeRaw);
          if (!codeResult.success) {
            return unavailable(
              "incompatible_response",
              "code",
              `The read client returned invalid bytecode for the ${contractName}.`,
              false,
              createPartialProvenance(request, observedAt, block)
            );
          }
          if (codeResult.data === undefined || codeResult.data === "0x") {
            return unavailable(
              "missing_code",
              "code",
              `No contract bytecode exists for the ${contractName} at the requested block.`,
              false,
              createPartialProvenance(request, observedAt, block)
            );
          }
        }

        stage = "position";
        const positionResult = positionResultSchema.safeParse(
          await options.client.readContract({
            address: request.positionManagerAddress,
            abi: PANCAKE_V3_POSITION_MANAGER_ABI,
            functionName: "positions",
            args: [BigInt(request.positionId)],
            blockNumber
          })
        );
        if (!positionResult.success) {
          return unavailable(
            "incompatible_response",
            "position",
            "The position manager returned an incompatible position result.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }
        const position = positionResult.data;

        stage = "pool";
        const [
          slot0Raw,
          tickSpacingRaw,
          poolToken0Raw,
          poolToken1Raw,
          poolFeeRaw,
          factoryPoolRaw,
          factoryTickSpacingRaw
        ] = await Promise.all([
          options.client.readContract({
            address: request.poolAddress,
            abi: PANCAKE_V3_POOL_ABI,
            functionName: "slot0",
            blockNumber
          }),
          options.client.readContract({
            address: request.poolAddress,
            abi: PANCAKE_V3_POOL_ABI,
            functionName: "tickSpacing",
            blockNumber
          }),
          options.client.readContract({
            address: request.poolAddress,
            abi: PANCAKE_V3_POOL_ABI,
            functionName: "token0",
            blockNumber
          }),
          options.client.readContract({
            address: request.poolAddress,
            abi: PANCAKE_V3_POOL_ABI,
            functionName: "token1",
            blockNumber
          }),
          options.client.readContract({
            address: request.poolAddress,
            abi: PANCAKE_V3_POOL_ABI,
            functionName: "fee",
            blockNumber
          }),
          options.client.readContract({
            address: deployment.factory,
            abi: PANCAKE_V3_FACTORY_ABI,
            functionName: "getPool",
            args: [position[2], position[3], position[4]],
            blockNumber
          }),
          options.client.readContract({
            address: deployment.factory,
            abi: PANCAKE_V3_FACTORY_ABI,
            functionName: "feeAmountTickSpacing",
            args: [position[4]],
            blockNumber
          })
        ]);

        const slot0Result = slot0ResultSchema.safeParse(slot0Raw);
        const tickSpacingResult = int24NumberSchema
          .refine((value) => value > 0, "tickSpacing must be positive")
          .safeParse(tickSpacingRaw);
        const poolToken0Result = nonZeroAddressSchema.safeParse(poolToken0Raw);
        const poolToken1Result = nonZeroAddressSchema.safeParse(poolToken1Raw);
        const poolFeeResult = uint24NumberSchema.safeParse(poolFeeRaw);
        const factoryPoolResult = nonZeroAddressSchema.safeParse(factoryPoolRaw);
        const factoryTickSpacingResult = int24NumberSchema
          .refine((value) => value > 0, "factory tickSpacing must be positive")
          .safeParse(factoryTickSpacingRaw);
        if (
          !slot0Result.success ||
          !tickSpacingResult.success ||
          !poolToken0Result.success ||
          !poolToken1Result.success ||
          !poolFeeResult.success ||
          !factoryPoolResult.success ||
          !factoryTickSpacingResult.success
        ) {
          return unavailable(
            "incompatible_response",
            "pool",
            "A Pancake V3 pool or factory read returned an incompatible result.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }

        const slot0 = slot0Result.data;
        const tickSpacing = tickSpacingResult.data;
        const poolToken0 = poolToken0Result.data;
        const poolToken1 = poolToken1Result.data;
        const poolFee = poolFeeResult.data;
        const factoryPool = factoryPoolResult.data;
        const factoryTickSpacing = factoryTickSpacingResult.data;

        stage = "relations";
        const relationMismatches: string[] = [];
        if (poolToken0 !== position[2] || poolToken1 !== position[3]) {
          relationMismatches.push("position/pool tokens");
        }
        if (poolFee !== position[4]) relationMismatches.push("position/pool fee");
        if (factoryPool !== request.poolAddress) relationMismatches.push("factory/pool address");
        if (factoryTickSpacing !== tickSpacing) {
          relationMismatches.push("pool/factory tick spacing");
        }
        if (!canonicalAddressLessThan(poolToken0, poolToken1)) {
          relationMismatches.push("canonical token ordering");
        }
        if (position[5] % tickSpacing !== 0 || position[6] % tickSpacing !== 0) {
          relationMismatches.push("position ticks/tick spacing");
        }
        if (relationMismatches.length > 0) {
          return unavailable(
            "relation_mismatch",
            "relations",
            `Cross-contract verification failed: ${relationMismatches.join(", ")}.`,
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }

        const provenance: PancakeV3SnapshotProvenance = {
          chainId: request.chainId,
          blockNumber: block.number.toString(10),
          blockHash: block.hash,
          blockTimestamp: new Date(blockUnix * 1_000).toISOString(),
          blockTimestampUnix: block.timestamp.toString(10),
          observedAt,
          ageSeconds,
          readsPinnedToBlock: true,
          positionManagerAddress: request.positionManagerAddress,
          factoryAddress: deployment.factory,
          poolAddress: request.poolAddress
        };

        return {
          status: "available",
          provenance,
          snapshot: {
            position: {
              id: request.positionId,
              nonce: position[0].toString(10),
              operator: position[1],
              token0: position[2],
              token1: position[3],
              fee: position[4],
              tickLower: position[5],
              tickUpper: position[6],
              liquidity: position[7].toString(10),
              feeGrowthInside0LastX128: position[8].toString(10),
              feeGrowthInside1LastX128: position[9].toString(10),
              tokensOwed0: position[10].toString(10),
              tokensOwed1: position[11].toString(10),
              inRange: slot0[1] >= position[5] && slot0[1] < position[6]
            },
            pool: {
              token0: poolToken0,
              token1: poolToken1,
              fee: poolFee,
              tickSpacing,
              sqrtPriceX96: slot0[0].toString(10),
              tick: slot0[1],
              observationIndex: slot0[2],
              observationCardinality: slot0[3],
              observationCardinalityNext: slot0[4],
              feeProtocol: slot0[5],
              unlocked: slot0[6]
            }
          }
        };
      } catch {
        return unavailable(
          "read_error",
          stage,
          `A pinned-block read failed during the ${stage} stage.`,
          true,
          createPartialProvenance(request, observedAt, block)
        );
      }
    }
  };
}
