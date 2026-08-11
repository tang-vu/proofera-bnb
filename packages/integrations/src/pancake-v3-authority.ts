import { encodeFunctionData, getAddress, isAddress, parseAbi, type Address, type Hex } from "viem";
import { z } from "zod";

import { PANCAKE_V3_BSC_DEPLOYMENTS } from "./pancake-v3";

const UINT256_MAX = (1n << 256n) - 1n;
const MAX_BLOCK_TIMESTAMP = 253_402_300_799n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const PANCAKE_V3_DEPLOYMENT_COMMIT = "986847948755cba528324d41be19480731c36c2a";

/**
 * Sources checked 2026-08-11:
 * https://github.com/pancakeswap/pancake-v3-contracts/blob/main/projects/v3-periphery/contracts/NonfungiblePositionManager.sol
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC721/IERC721.sol
 */
const ERC721_AUTHORITY_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) external view returns (address owner)",
  "function getApproved(uint256 tokenId) external view returns (address operator)",
  "function isApprovedForAll(address owner, address operator) external view returns (bool approved)"
]);

const supportedChainIdSchema = z.union([z.literal(56), z.literal(97)]);

const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Expected an EVM address")
  .transform((value) => getAddress(value.toLowerCase()) as Address);

const nonZeroAddressSchema = addressSchema.refine(
  (value) => value !== ZERO_ADDRESS,
  "The zero address is not allowed"
);

const blockHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte block hash")
  .transform((value) => value.toLowerCase() as Hex);

const canonicalUint256DecimalSchema = z
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

const blockTimestampSchema = canonicalUint256DecimalSchema.refine(
  (value) => BigInt(value) <= MAX_BLOCK_TIMESTAMP,
  "Block timestamp is outside the supported UTC range"
);

export const pancakeV3PositionAuthorityRequestSchema = z
  .strictObject({
    chainId: supportedChainIdSchema,
    positionManagerAddress: nonZeroAddressSchema,
    positionTokenId: canonicalUint256DecimalSchema,
    controllerAddress: nonZeroAddressSchema,
    block: z.strictObject({
      number: canonicalUint256DecimalSchema,
      hash: blockHashSchema,
      timestampUnix: blockTimestampSchema
    })
  })
  .superRefine((request, context) => {
    if (
      request.positionManagerAddress !== PANCAKE_V3_BSC_DEPLOYMENTS[request.chainId].positionManager
    ) {
      context.addIssue({
        code: "custom",
        path: ["positionManagerAddress"],
        message: "Expected the official Pancake V3 position manager for this chain"
      });
    }
  });

export type PancakeV3PositionAuthorityRequest = z.input<
  typeof pancakeV3PositionAuthorityRequestSchema
>;
type ValidatedAuthorityRequest = z.output<typeof pancakeV3PositionAuthorityRequestSchema>;
export type PancakeV3PositionAuthorityChainId = z.infer<typeof supportedChainIdSchema>;

export type PancakeV3PositionAuthorityRpcRequest =
  | {
      readonly method: "eth_chainId";
      readonly params: readonly [];
    }
  | {
      readonly method: "eth_getBlockByHash";
      readonly params: readonly [Hex, false];
    }
  | {
      readonly method: "eth_call";
      readonly params: readonly [
        {
          readonly to: Address;
          readonly data: Hex;
        },
        {
          readonly blockHash: Hex;
          readonly requireCanonical: true;
        }
      ];
    };

/** Read-only JSON-RPC surface. It has no latest, block-number, or write method. */
export interface PancakeV3PositionAuthorityRpcClient {
  request(request: PancakeV3PositionAuthorityRpcRequest): Promise<unknown>;
}

export interface CreatePancakeV3PositionAuthorityReaderOptions {
  readonly client: PancakeV3PositionAuthorityRpcClient;
  readonly now: () => Date;
  /** Trusted server configuration. These values are intentionally not part of the read request. */
  readonly freshnessPolicy: {
    readonly maximumBlockAgeSeconds: number;
    readonly maximumFutureSkewSeconds: number;
  };
  /** Public provenance only. Never put an authenticated RPC endpoint or credential here. */
  readonly rpcProvider: {
    readonly id: string;
    readonly publicSourceUrl: string;
  };
}

export type PancakeV3PositionAuthorizationKind =
  "owner" | "token_controller" | "operator_controller";

export interface PancakeV3PositionAuthorityBlock {
  readonly number: string;
  readonly hash: Hex;
  readonly timestampUnix: string;
  readonly timestampUtc: string;
  readonly ageMilliseconds: string;
}

export interface PancakeV3PositionAuthorityEvidence {
  readonly positionTokenId: string;
  readonly positionManagerAddress: Address;
  readonly ownerAddress: Address;
  readonly controllerAddress: Address;
  readonly tokenApprovalAddress: Address;
  readonly operatorApproved: boolean;
  readonly controllerAuthorized: boolean;
  readonly authorizationKind: PancakeV3PositionAuthorizationKind | null;
  readonly observedAt: string;
  readonly source: "onchain_owner_and_controller_read";
  readonly blockNumber: string;
  readonly blockHash: Hex;
}

export interface PancakeV3PositionAuthorityProvenance {
  readonly deploymentSourceUrl:
    | "https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscMainnet.json"
    | "https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscTestnet.json";
  readonly deploymentCommit: typeof PANCAKE_V3_DEPLOYMENT_COMMIT;
  readonly rpcProvider: {
    readonly id: string;
    readonly publicSourceUrl: string;
  };
  readonly freshnessPolicy: {
    readonly maximumBlockAgeSeconds: number;
    readonly maximumFutureSkewSeconds: number;
    readonly ownership: "trusted_reader_configuration";
  };
  readonly chainRead: { readonly method: "eth_chainId"; readonly params: readonly [] };
  readonly blockRead: {
    readonly method: "eth_getBlockByHash";
    readonly params: readonly [Hex, false];
  };
  readonly authorityReadPlan: readonly [
    {
      readonly functionName: "ownerOf";
      readonly selector: Hex;
      readonly blockSelector: { readonly blockHash: Hex; readonly requireCanonical: true };
    },
    {
      readonly functionName: "getApproved";
      readonly selector: Hex;
      readonly blockSelector: { readonly blockHash: Hex; readonly requireCanonical: true };
    },
    {
      readonly functionName: "isApprovedForAll";
      readonly selector: Hex;
      readonly blockSelector: { readonly blockHash: Hex; readonly requireCanonical: true };
    }
  ];
  readonly latestTagUsed: false;
  readonly blockNumberSelectorUsed: false;
  readonly fallbackUsed: false;
  readonly readsAtomic: false;
}

export interface PancakeV3PositionAuthorityBoundary {
  readonly establishesCurrentErc721AuthorityAtBoundBlock: true;
  readonly establishesRuntimeCodeIdentity: false;
  readonly establishesFutureAuthority: false;
  readonly permitsExecution: false;
  readonly limitations: readonly [string, string, string];
}

export interface PancakeV3PositionAuthorityAvailableResult {
  readonly status: "available";
  readonly chainId: PancakeV3PositionAuthorityChainId;
  readonly environment: "bsc-mainnet" | "bsc-testnet";
  readonly block: PancakeV3PositionAuthorityBlock;
  readonly authorization: PancakeV3PositionAuthorityEvidence;
  readonly provenance: PancakeV3PositionAuthorityProvenance;
  readonly boundary: PancakeV3PositionAuthorityBoundary;
}

export type PancakeV3PositionAuthorityStage =
  | "configuration"
  | "request"
  | "clock"
  | "chain"
  | "block"
  | "owner"
  | "token_approval"
  | "operator_approval";

export type PancakeV3PositionAuthorityUnavailableReason =
  | "invalid_configuration"
  | "invalid_request"
  | "invalid_clock"
  | "chain_read_failed"
  | "malformed_chain_response"
  | "chain_mismatch"
  | "block_read_failed"
  | "block_not_found"
  | "malformed_block_response"
  | "block_mismatch"
  | "stale_block"
  | "future_block"
  | "contract_read_failed"
  | "malformed_contract_response";

export interface PancakeV3PositionAuthorityUnavailableResult {
  readonly status: "unavailable";
  readonly stage: PancakeV3PositionAuthorityStage;
  readonly reason: PancakeV3PositionAuthorityUnavailableReason;
  readonly message: string;
  readonly observedAt: string | null;
  readonly chainId: PancakeV3PositionAuthorityChainId | null;
  readonly environment: "bsc-mainnet" | "bsc-testnet" | null;
  readonly requestedBlock: {
    readonly number: string;
    readonly hash: Hex;
    readonly timestampUnix: string;
  } | null;
  readonly block: PancakeV3PositionAuthorityBlock | null;
  readonly authorization: null;
  readonly provenance: PancakeV3PositionAuthorityProvenance | null;
  readonly boundary: PancakeV3PositionAuthorityBoundary;
}

export type PancakeV3PositionAuthorityResult =
  PancakeV3PositionAuthorityAvailableResult | PancakeV3PositionAuthorityUnavailableResult;

export interface PancakeV3PositionAuthorityReader {
  read(input: unknown): Promise<PancakeV3PositionAuthorityResult>;
}

const rpcQuantitySchema = z
  .string()
  .regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/, "Expected a canonical JSON-RPC quantity")
  .transform((value) => BigInt(value));

const rpcBlockSchema = z.looseObject({
  number: rpcQuantitySchema.refine((value) => value <= UINT256_MAX),
  hash: blockHashSchema,
  timestamp: rpcQuantitySchema.refine((value) => value <= MAX_BLOCK_TIMESTAMP)
});

const wordSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected one canonical 32-byte ABI word")
  .transform((value) => value.toLowerCase() as Hex);

const DEPLOYMENT_SOURCE_URLS = Object.freeze({
  56: `https://github.com/pancakeswap/pancake-v3-contracts/blob/${PANCAKE_V3_DEPLOYMENT_COMMIT}/deployments/bscMainnet.json` as const,
  97: `https://github.com/pancakeswap/pancake-v3-contracts/blob/${PANCAKE_V3_DEPLOYMENT_COMMIT}/deployments/bscTestnet.json` as const
});

const readerConfigurationSchema = z.strictObject({
  freshnessPolicy: z.strictObject({
    maximumBlockAgeSeconds: z.number().int().positive().max(3_600),
    maximumFutureSkewSeconds: z.number().int().min(0).max(60)
  }),
  rpcProvider: z.strictObject({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
    publicSourceUrl: z
      .string()
      .max(2_048)
      .url({ protocol: /^https$/ })
      .refine((value) => {
        const url = new URL(value);
        return (
          url.username === "" &&
          url.password === "" &&
          url.search === "" &&
          url.hash === "" &&
          (url.port === "" || url.port === "443")
        );
      }, "Expected a public credential-free HTTPS source URL")
  })
});

type ValidatedReaderConfiguration = z.infer<typeof readerConfigurationSchema>;

const LIMITATIONS: readonly [string, string, string] = Object.freeze([
  "Authority reads are sequential at one canonical block hash, not one atomic EVM observation.",
  "This evidence does not establish manager runtime-code identity or source-code verification.",
  "Ownership and approvals can change after the observed block; execution must revalidate authority immediately before submission."
]);

const BOUNDARY: PancakeV3PositionAuthorityBoundary = Object.freeze({
  establishesCurrentErc721AuthorityAtBoundBlock: true,
  establishesRuntimeCodeIdentity: false,
  establishesFutureAuthority: false,
  permitsExecution: false,
  limitations: LIMITATIONS
});

function validClock(
  now: () => Date
): { readonly observedAt: string; readonly milliseconds: bigint } | null {
  try {
    const date = now();
    if (!(date instanceof Date)) return null;
    const time = Date.prototype.getTime.call(date);
    if (!Number.isSafeInteger(time) || time < 0) return null;
    const milliseconds = BigInt(time);
    if (milliseconds > MAX_BLOCK_TIMESTAMP * 1_000n + 999n) return null;
    return { observedAt: Date.prototype.toISOString.call(date), milliseconds };
  } catch {
    return null;
  }
}

function provenance(
  request: ValidatedAuthorityRequest,
  calls: readonly [Hex, Hex, Hex],
  configuration: ValidatedReaderConfiguration
): PancakeV3PositionAuthorityProvenance {
  const blockSelector = { blockHash: request.block.hash, requireCanonical: true as const };
  return {
    deploymentSourceUrl: DEPLOYMENT_SOURCE_URLS[request.chainId],
    deploymentCommit: PANCAKE_V3_DEPLOYMENT_COMMIT,
    rpcProvider: configuration.rpcProvider,
    freshnessPolicy: {
      ...configuration.freshnessPolicy,
      ownership: "trusted_reader_configuration"
    },
    chainRead: { method: "eth_chainId", params: [] },
    blockRead: { method: "eth_getBlockByHash", params: [request.block.hash, false] },
    authorityReadPlan: [
      { functionName: "ownerOf", selector: calls[0].slice(0, 10) as Hex, blockSelector },
      { functionName: "getApproved", selector: calls[1].slice(0, 10) as Hex, blockSelector },
      {
        functionName: "isApprovedForAll",
        selector: calls[2].slice(0, 10) as Hex,
        blockSelector
      }
    ],
    latestTagUsed: false,
    blockNumberSelectorUsed: false,
    fallbackUsed: false,
    readsAtomic: false
  };
}

function unavailable(
  stage: PancakeV3PositionAuthorityStage,
  reason: PancakeV3PositionAuthorityUnavailableReason,
  message: string,
  request: ValidatedAuthorityRequest | null,
  observedAt: string | null,
  block: PancakeV3PositionAuthorityBlock | null,
  callProvenance: PancakeV3PositionAuthorityProvenance | null
): PancakeV3PositionAuthorityUnavailableResult {
  return {
    status: "unavailable",
    stage,
    reason,
    message,
    observedAt,
    chainId: request?.chainId ?? null,
    environment: request ? (request.chainId === 56 ? "bsc-mainnet" : "bsc-testnet") : null,
    requestedBlock: request
      ? {
          number: request.block.number,
          hash: request.block.hash,
          timestampUnix: request.block.timestampUnix
        }
      : null,
    block,
    authorization: null,
    provenance: callProvenance,
    boundary: BOUNDARY
  };
}

function parseAddressWord(value: unknown, allowZero: boolean): Address | null {
  const parsed = wordSchema.safeParse(value);
  if (!parsed.success || parsed.data.slice(2, 26) !== "0".repeat(24)) return null;
  const address = getAddress(`0x${parsed.data.slice(26)}`) as Address;
  return allowZero || address !== ZERO_ADDRESS ? address : null;
}

function parseBooleanWord(value: unknown): boolean | null {
  const parsed = wordSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data === `0x${"0".repeat(64)}`) return false;
  if (parsed.data === `0x${"0".repeat(63)}1`) return true;
  return null;
}

function blockView(
  number: bigint,
  hash: Hex,
  timestamp: bigint,
  ageMilliseconds: bigint
): PancakeV3PositionAuthorityBlock {
  return {
    number: number.toString(),
    hash,
    timestampUnix: timestamp.toString(),
    timestampUtc: new Date(Number(timestamp) * 1_000).toISOString(),
    ageMilliseconds: ageMilliseconds.toString()
  };
}

export function createPancakeV3PositionAuthorityReader(
  options: CreatePancakeV3PositionAuthorityReaderOptions
): PancakeV3PositionAuthorityReader {
  const configuration = readerConfigurationSchema.safeParse({
    freshnessPolicy: options.freshnessPolicy,
    rpcProvider: options.rpcProvider
  });
  return {
    async read(input: unknown): Promise<PancakeV3PositionAuthorityResult> {
      if (!configuration.success) {
        return unavailable(
          "configuration",
          "invalid_configuration",
          "The trusted position-authority reader configuration was invalid.",
          null,
          null,
          null,
          null
        );
      }
      const parsedRequest = pancakeV3PositionAuthorityRequestSchema.safeParse(input);
      if (!parsedRequest.success) {
        return unavailable(
          "request",
          "invalid_request",
          "Position-authority request validation failed.",
          null,
          null,
          null,
          null
        );
      }
      const request = parsedRequest.data;
      const clock = validClock(options.now);
      if (!clock) {
        return unavailable(
          "clock",
          "invalid_clock",
          "The injected observation clock was invalid.",
          request,
          null,
          null,
          null
        );
      }

      let chainResponse: unknown;
      try {
        chainResponse = await options.client.request({ method: "eth_chainId", params: [] });
      } catch {
        return unavailable(
          "chain",
          "chain_read_failed",
          "The RPC chain identity read failed.",
          request,
          clock.observedAt,
          null,
          null
        );
      }
      const chain = rpcQuantitySchema.safeParse(chainResponse);
      if (!chain.success || chain.data > UINT256_MAX) {
        return unavailable(
          "chain",
          "malformed_chain_response",
          "The RPC returned an invalid chain identity.",
          request,
          clock.observedAt,
          null,
          null
        );
      }
      if (chain.data !== BigInt(request.chainId)) {
        return unavailable(
          "chain",
          "chain_mismatch",
          "The RPC chain does not match the requested BSC network.",
          request,
          clock.observedAt,
          null,
          null
        );
      }

      let rawBlock: unknown;
      try {
        rawBlock = await options.client.request({
          method: "eth_getBlockByHash",
          params: [request.block.hash, false]
        });
      } catch {
        return unavailable(
          "block",
          "block_read_failed",
          "The exact block identity read failed.",
          request,
          clock.observedAt,
          null,
          null
        );
      }
      if (rawBlock === null) {
        return unavailable(
          "block",
          "block_not_found",
          "The requested block hash was not found.",
          request,
          clock.observedAt,
          null,
          null
        );
      }
      const parsedBlock = rpcBlockSchema.safeParse(rawBlock);
      if (!parsedBlock.success) {
        return unavailable(
          "block",
          "malformed_block_response",
          "The exact block response was malformed.",
          request,
          clock.observedAt,
          null,
          null
        );
      }
      const { number, hash, timestamp } = parsedBlock.data;
      if (
        number.toString() !== request.block.number ||
        hash !== request.block.hash ||
        timestamp.toString() !== request.block.timestampUnix
      ) {
        return unavailable(
          "block",
          "block_mismatch",
          "The exact block response did not match the bound block identity.",
          request,
          clock.observedAt,
          null,
          null
        );
      }
      const blockMilliseconds = timestamp * 1_000n;
      const ageMilliseconds = clock.milliseconds - blockMilliseconds;
      const view = blockView(number, hash, timestamp, ageMilliseconds);
      if (
        ageMilliseconds <
        -BigInt(configuration.data.freshnessPolicy.maximumFutureSkewSeconds) * 1_000n
      ) {
        return unavailable(
          "block",
          "future_block",
          "The bound block timestamp is too far in the future.",
          request,
          clock.observedAt,
          view,
          null
        );
      }
      if (
        ageMilliseconds >
        BigInt(configuration.data.freshnessPolicy.maximumBlockAgeSeconds) * 1_000n
      ) {
        return unavailable(
          "block",
          "stale_block",
          "The bound block is older than the permitted authority-evidence window.",
          request,
          clock.observedAt,
          view,
          null
        );
      }

      const tokenId = BigInt(request.positionTokenId);
      const ownerCall = encodeFunctionData({
        abi: ERC721_AUTHORITY_ABI,
        functionName: "ownerOf",
        args: [tokenId]
      });
      const tokenApprovalCall = encodeFunctionData({
        abi: ERC721_AUTHORITY_ABI,
        functionName: "getApproved",
        args: [tokenId]
      });
      const placeholderOperatorCall = encodeFunctionData({
        abi: ERC721_AUTHORITY_ABI,
        functionName: "isApprovedForAll",
        args: [request.controllerAddress, request.controllerAddress]
      });
      const preliminaryProvenance = provenance(
        request,
        [ownerCall, tokenApprovalCall, placeholderOperatorCall],
        configuration.data
      );
      const blockSelector = { blockHash: request.block.hash, requireCanonical: true as const };

      let ownerResponse: unknown;
      try {
        ownerResponse = await options.client.request({
          method: "eth_call",
          params: [{ to: request.positionManagerAddress, data: ownerCall }, blockSelector]
        });
      } catch {
        return unavailable(
          "owner",
          "contract_read_failed",
          "The ownerOf read failed; a revert is not treated as lack of authority.",
          request,
          clock.observedAt,
          view,
          preliminaryProvenance
        );
      }
      const ownerAddress = parseAddressWord(ownerResponse, false);
      if (!ownerAddress) {
        return unavailable(
          "owner",
          "malformed_contract_response",
          "The ownerOf result was not a canonical nonzero address word.",
          request,
          clock.observedAt,
          view,
          preliminaryProvenance
        );
      }

      const operatorCall = encodeFunctionData({
        abi: ERC721_AUTHORITY_ABI,
        functionName: "isApprovedForAll",
        args: [ownerAddress, request.controllerAddress]
      });
      const callProvenance = provenance(
        request,
        [ownerCall, tokenApprovalCall, operatorCall],
        configuration.data
      );

      let tokenApprovalResponse: unknown;
      try {
        tokenApprovalResponse = await options.client.request({
          method: "eth_call",
          params: [{ to: request.positionManagerAddress, data: tokenApprovalCall }, blockSelector]
        });
      } catch {
        return unavailable(
          "token_approval",
          "contract_read_failed",
          "The getApproved read failed; the result is unavailable rather than unauthorized.",
          request,
          clock.observedAt,
          view,
          callProvenance
        );
      }
      const tokenApprovalAddress = parseAddressWord(tokenApprovalResponse, true);
      if (!tokenApprovalAddress) {
        return unavailable(
          "token_approval",
          "malformed_contract_response",
          "The getApproved result was not a canonical address word.",
          request,
          clock.observedAt,
          view,
          callProvenance
        );
      }

      let operatorApprovalResponse: unknown;
      try {
        operatorApprovalResponse = await options.client.request({
          method: "eth_call",
          params: [{ to: request.positionManagerAddress, data: operatorCall }, blockSelector]
        });
      } catch {
        return unavailable(
          "operator_approval",
          "contract_read_failed",
          "The isApprovedForAll read failed; the result is unavailable rather than unauthorized.",
          request,
          clock.observedAt,
          view,
          callProvenance
        );
      }
      const operatorApproved = parseBooleanWord(operatorApprovalResponse);
      if (operatorApproved === null) {
        return unavailable(
          "operator_approval",
          "malformed_contract_response",
          "The isApprovedForAll result was not a canonical ABI boolean word.",
          request,
          clock.observedAt,
          view,
          callProvenance
        );
      }

      const authorizationKind: PancakeV3PositionAuthorizationKind | null =
        request.controllerAddress === ownerAddress
          ? "owner"
          : request.controllerAddress === tokenApprovalAddress
            ? "token_controller"
            : operatorApproved
              ? "operator_controller"
              : null;

      return {
        status: "available",
        chainId: request.chainId,
        environment: request.chainId === 56 ? "bsc-mainnet" : "bsc-testnet",
        block: view,
        authorization: {
          positionTokenId: request.positionTokenId,
          positionManagerAddress: request.positionManagerAddress,
          ownerAddress,
          controllerAddress: request.controllerAddress,
          tokenApprovalAddress,
          operatorApproved,
          controllerAuthorized: authorizationKind !== null,
          authorizationKind,
          observedAt: clock.observedAt,
          source: "onchain_owner_and_controller_read",
          blockNumber: request.block.number,
          blockHash: request.block.hash
        },
        provenance: callProvenance,
        boundary: BOUNDARY
      };
    }
  };
}
