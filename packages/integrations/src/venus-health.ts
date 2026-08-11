import { getAddress, isAddress, parseAbi, type Abi, type Address, type Hex } from "viem";
import { z } from "zod";

const UINT256_MAX = (1n << 256n) - 1n;
const MAX_BLOCK_TIMESTAMP = 253_402_300_799n;
const MAX_FUTURE_BLOCK_SKEW_SECONDS = 60;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Primary sources checked 2026-08-11:
 * https://docs-v4.venus.io/deployed-contracts/markets
 * https://docs-v4.venus.io/technical-reference/reference-core-pool/comptroller/diamond/facets/policy-facet
 * https://docs-v4.venus.io/technical-reference/reference-technical-articles/diamond-comptroller
 * https://docs-v4.venus.io/guides/liquidation
 * https://docs-v4.venus.io/services/api
 *
 * The deployment page identifies these Core Pool Comptroller (Unitroller proxy)
 * addresses. The PolicyFacet reference defines getAccountLiquidity as the
 * liquidation-threshold liquidity/shortfall read. The Diamond article says users
 * continue to call the Unitroller proxy. The public HTTP API was reviewed but is
 * intentionally not used: this adapter has one onchain source and no fallback.
 */
export const VENUS_CORE_POOL_BSC_DEPLOYMENTS = Object.freeze({
  56: Object.freeze({
    environment: "bsc-mainnet" as const,
    comptroller: getAddress("0xfD36E2c2a6789Db23113685031d7F16329158384"),
    explorerUrl: "https://bscscan.com/address/0xfD36E2c2a6789Db23113685031d7F16329158384"
  }),
  97: Object.freeze({
    environment: "bsc-testnet" as const,
    comptroller: getAddress("0x94d1820b2D1c7c7452A163983Dc888CEC546b77D"),
    explorerUrl: "https://testnet.bscscan.com/address/0x94d1820b2D1c7c7452A163983Dc888CEC546b77D"
  })
});

export const VENUS_CORE_POOL_COMPTROLLER_ABI = parseAbi([
  "function getAccountLiquidity(address account) external view returns (uint256 errorCode, uint256 liquidity, uint256 shortfall)"
]);

const supportedChainIdSchema = z.union([z.literal(56), z.literal(97)]);

const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Invalid EVM address")
  .transform((value) => getAddress(value.toLowerCase()) as Address);

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

export const venusAccountRiskSnapshotRequestSchema = z
  .strictObject({
    chainId: supportedChainIdSchema,
    account: nonZeroAddressSchema,
    comptrollerAddress: nonZeroAddressSchema,
    blockNumber: uint256DecimalSchema,
    expectedBlockHash: blockHashSchema.optional(),
    maximumBlockAgeSeconds: z.number().int().positive().max(86_400)
  })
  .superRefine((request, context) => {
    if (
      request.comptrollerAddress !== VENUS_CORE_POOL_BSC_DEPLOYMENTS[request.chainId].comptroller
    ) {
      context.addIssue({
        code: "custom",
        path: ["comptrollerAddress"],
        message: "Comptroller is not the official Venus Core Pool deployment for this chain"
      });
    }
  });

export type VenusAccountRiskSnapshotRequest = z.input<typeof venusAccountRiskSnapshotRequestSchema>;
type ValidatedVenusAccountRiskSnapshotRequest = z.output<
  typeof venusAccountRiskSnapshotRequestSchema
>;
export type VenusHealthSupportedChainId = z.infer<typeof supportedChainIdSchema>;

export interface VenusContractReadParameters {
  readonly address: Address;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args?: readonly unknown[];
  readonly blockNumber: bigint;
}

/** Minimal read-only surface implemented by a viem PublicClient. */
export interface VenusHealthReadClient {
  getChainId(): Promise<unknown>;
  getBlock(parameters: { readonly blockNumber: bigint }): Promise<unknown>;
  getCode(parameters: {
    readonly address: Address;
    readonly blockNumber: bigint;
  }): Promise<unknown>;
  readContract(parameters: VenusContractReadParameters): Promise<unknown>;
}

export interface CreateVenusHealthReaderOptions {
  readonly client: VenusHealthReadClient;
  readonly now?: () => Date;
}

export type VenusHealthSnapshotStage = "request" | "chain" | "block" | "code" | "liquidity";

export type VenusHealthUnavailableReason =
  | "invalid_request"
  | "chain_mismatch"
  | "block_mismatch"
  | "stale_block"
  | "missing_code"
  | "read_error"
  | "incompatible_response"
  | "contract_error_code";

export interface VenusBlockIdentity {
  readonly number: string;
  readonly hash: Hex;
  readonly timestampUnix: string;
  readonly timestampUtc: string;
}

export interface VenusHealthSnapshotProvenance {
  readonly chainId: VenusHealthSupportedChainId;
  readonly environment: "bsc-mainnet" | "bsc-testnet";
  readonly account: Address;
  readonly observedAt: string;
  readonly ageSeconds: number;
  readonly readsPinnedToBlock: true;
  readonly block: VenusBlockIdentity;
  readonly source: {
    readonly kind: "onchain_contract_read";
    readonly protocol: "Venus Core Pool";
    readonly contractAddress: Address;
    readonly functionSignature: "getAccountLiquidity(address)";
    readonly officialDeploymentDocumentationUrl: string;
    readonly officialContractDocumentationUrl: string;
    readonly explorerUrl: string;
  };
  readonly httpFallbackUsed: false;
}

export interface VenusAccountRiskSnapshot {
  readonly liquidationThresholdLiquidity: {
    readonly errorCode: string;
    readonly excessLiquidityRaw: string;
    readonly shortfallRaw: string;
    readonly rawUnit: "venus-comptroller-account-liquidity-unit";
    readonly signal:
      "excess_liquidity_reported" | "shortfall_reported" | "no_excess_or_shortfall_reported";
  };
  readonly liquidationThresholdHealthFactor: {
    readonly status: "not_computed";
    readonly ratioDecimal: null;
    readonly calculationBoundary: "aggregate_liquidity_difference_is_not_a_ratio";
    readonly reason: string;
    readonly requiredAuthoritativeInputs: readonly [string, string, string, string];
  };
  readonly methodologyVersion: "venus-core-account-risk-v1";
  readonly limitations: readonly [string, string, string];
  readonly executionEnabled: false;
}

export interface VenusHealthAvailableResult {
  readonly status: "available";
  readonly snapshot: VenusAccountRiskSnapshot;
  readonly provenance: VenusHealthSnapshotProvenance;
}

export interface VenusHealthUnavailableProvenance {
  readonly chainId: VenusHealthSupportedChainId;
  readonly environment: "bsc-mainnet" | "bsc-testnet";
  readonly account: Address;
  readonly comptrollerAddress: Address;
  readonly observedAt: string;
  readonly block: VenusBlockIdentity | null;
}

export interface VenusHealthUnavailableResult {
  readonly status: "unavailable";
  readonly reason: VenusHealthUnavailableReason;
  readonly stage: VenusHealthSnapshotStage;
  readonly message: string;
  readonly retryable: boolean;
  readonly contractErrorCode: string | null;
  readonly provenance: VenusHealthUnavailableProvenance | null;
  readonly executionEnabled: false;
}

export type VenusAccountRiskSnapshotResult =
  VenusHealthAvailableResult | VenusHealthUnavailableResult;

export interface VenusHealthReader {
  getAccountRiskSnapshot(
    input: VenusAccountRiskSnapshotRequest
  ): Promise<VenusAccountRiskSnapshotResult>;
}

const blockResultSchema = z.looseObject({
  number: z.bigint().min(0n).max(UINT256_MAX),
  hash: blockHashSchema,
  timestamp: z.bigint().min(0n).max(MAX_BLOCK_TIMESTAMP)
});

const bytecodeResultSchema = z.union([
  z.undefined(),
  z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/, "Expected EVM bytecode")
]);

const accountLiquidityResultSchema = z.tuple([
  z.bigint().min(0n).max(UINT256_MAX),
  z.bigint().min(0n).max(UINT256_MAX),
  z.bigint().min(0n).max(UINT256_MAX)
]);

type ValidatedBlock = z.output<typeof blockResultSchema>;

function toBlockIdentity(block: ValidatedBlock): VenusBlockIdentity {
  return {
    number: block.number.toString(10),
    hash: block.hash,
    timestampUnix: block.timestamp.toString(10),
    timestampUtc: new Date(Number(block.timestamp) * 1_000).toISOString()
  };
}

function createPartialProvenance(
  request: ValidatedVenusAccountRiskSnapshotRequest,
  observedAt: string,
  block?: ValidatedBlock
): VenusHealthUnavailableProvenance {
  const deployment = VENUS_CORE_POOL_BSC_DEPLOYMENTS[request.chainId];
  return {
    chainId: request.chainId,
    environment: deployment.environment,
    account: request.account,
    comptrollerAddress: request.comptrollerAddress,
    observedAt,
    block: block === undefined ? null : toBlockIdentity(block)
  };
}

function unavailable(
  reason: VenusHealthUnavailableReason,
  stage: VenusHealthSnapshotStage,
  message: string,
  retryable: boolean,
  provenance: VenusHealthUnavailableProvenance | null,
  contractErrorCode: string | null = null
): VenusHealthUnavailableResult {
  return {
    status: "unavailable",
    reason,
    stage,
    message,
    retryable,
    contractErrorCode,
    provenance,
    executionEnabled: false
  };
}

function liquiditySignal(
  liquidity: bigint,
  shortfall: bigint
): VenusAccountRiskSnapshot["liquidationThresholdLiquidity"]["signal"] {
  if (shortfall > 0n) return "shortfall_reported";
  if (liquidity > 0n) return "excess_liquidity_reported";
  return "no_excess_or_shortfall_reported";
}

export function createVenusHealthReader(
  options: CreateVenusHealthReaderOptions
): VenusHealthReader {
  const now = options.now ?? (() => new Date());

  return {
    async getAccountRiskSnapshot(
      input: VenusAccountRiskSnapshotRequest
    ): Promise<VenusAccountRiskSnapshotResult> {
      let observedDate: Date;
      try {
        observedDate = now();
      } catch {
        return unavailable(
          "incompatible_response",
          "request",
          "The snapshot clock failed.",
          false,
          null
        );
      }
      if (!(observedDate instanceof Date) || !Number.isFinite(observedDate.getTime())) {
        return unavailable(
          "incompatible_response",
          "request",
          "The snapshot clock returned an invalid time.",
          false,
          null
        );
      }
      const observedAt = observedDate.toISOString();

      const parsedRequest = venusAccountRiskSnapshotRequestSchema.safeParse(input);
      if (!parsedRequest.success) {
        return unavailable(
          "invalid_request",
          "request",
          "The Venus account risk snapshot request failed runtime validation.",
          false,
          null
        );
      }

      const request = parsedRequest.data;
      const deployment = VENUS_CORE_POOL_BSC_DEPLOYMENTS[request.chainId];
      const blockNumber = BigInt(request.blockNumber);
      let block: ValidatedBlock | undefined;
      let stage: VenusHealthSnapshotStage = "chain";

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
        if (ageSeconds > request.maximumBlockAgeSeconds) {
          return unavailable(
            "stale_block",
            "block",
            "The requested block is older than the caller's freshness limit.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }

        stage = "code";
        const codeResult = bytecodeResultSchema.safeParse(
          await options.client.getCode({
            address: request.comptrollerAddress,
            blockNumber
          })
        );
        if (!codeResult.success) {
          return unavailable(
            "incompatible_response",
            "code",
            "The read client returned invalid Comptroller bytecode.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }
        if (codeResult.data === undefined || codeResult.data === "0x") {
          return unavailable(
            "missing_code",
            "code",
            "No Comptroller bytecode exists at the requested block.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }

        stage = "liquidity";
        const liquidityResult = accountLiquidityResultSchema.safeParse(
          await options.client.readContract({
            address: request.comptrollerAddress,
            abi: VENUS_CORE_POOL_COMPTROLLER_ABI,
            functionName: "getAccountLiquidity",
            args: [request.account],
            blockNumber
          })
        );
        if (!liquidityResult.success) {
          return unavailable(
            "incompatible_response",
            "liquidity",
            "The Comptroller returned an incompatible account-liquidity result.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }

        const [errorCode, liquidity, shortfall] = liquidityResult.data;
        if (errorCode !== 0n) {
          return unavailable(
            "contract_error_code",
            "liquidity",
            "The Comptroller returned a non-zero account-liquidity error code.",
            false,
            createPartialProvenance(request, observedAt, block),
            errorCode.toString(10)
          );
        }
        if (liquidity > 0n && shortfall > 0n) {
          return unavailable(
            "incompatible_response",
            "liquidity",
            "The Comptroller reported both excess liquidity and shortfall.",
            false,
            createPartialProvenance(request, observedAt, block)
          );
        }

        return {
          status: "available",
          provenance: {
            chainId: request.chainId,
            environment: deployment.environment,
            account: request.account,
            observedAt,
            ageSeconds,
            readsPinnedToBlock: true,
            block: toBlockIdentity(block),
            source: {
              kind: "onchain_contract_read",
              protocol: "Venus Core Pool",
              contractAddress: request.comptrollerAddress,
              functionSignature: "getAccountLiquidity(address)",
              officialDeploymentDocumentationUrl:
                "https://docs-v4.venus.io/deployed-contracts/markets",
              officialContractDocumentationUrl:
                "https://docs-v4.venus.io/technical-reference/reference-core-pool/comptroller/diamond/facets/policy-facet",
              explorerUrl: deployment.explorerUrl
            },
            httpFallbackUsed: false
          },
          snapshot: {
            liquidationThresholdLiquidity: {
              errorCode: errorCode.toString(10),
              excessLiquidityRaw: liquidity.toString(10),
              shortfallRaw: shortfall.toString(10),
              rawUnit: "venus-comptroller-account-liquidity-unit",
              signal: liquiditySignal(liquidity, shortfall)
            },
            liquidationThresholdHealthFactor: {
              status: "not_computed",
              ratioDecimal: null,
              calculationBoundary: "aggregate_liquidity_difference_is_not_a_ratio",
              reason:
                "getAccountLiquidity returns an aggregate excess-or-shortfall difference, not the gross adjusted collateral and debt values required for a defensible ratio.",
              requiredAuthoritativeInputs: [
                "per-market supplied balances at the same block",
                "per-market borrowed balances at the same block",
                "oracle prices and decimals at the same block",
                "liquidation thresholds and applicable e-mode state at the same block"
              ]
            },
            methodologyVersion: "venus-core-account-risk-v1",
            limitations: [
              "Raw liquidity and shortfall units are preserved without an undocumented currency or decimal conversion.",
              "A zero/zero result can mean no relevant position or no reported excess/shortfall; this adapter does not guess which.",
              "A reported shortfall is a risk signal, not proof that a particular liquidation transaction is executable."
            ],
            executionEnabled: false
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
