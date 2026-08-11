import { encodeFunctionData, getAddress, isAddress, parseAbi, type Address, type Hex } from "viem";
import { z } from "zod";

import { PANCAKE_V3_BSC_DEPLOYMENTS } from "./pancake-v3";

const UINT256_MAX = (1n << 256n) - 1n;
const MAX_BLOCK_TIMESTAMP = 253_402_300_799n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const PANCAKE_V3_DEPLOYMENT_COMMIT = "986847948755cba528324d41be19480731c36c2a";
const PANCAKE_V3_POOL_DEPLOYER = getAddress(
  "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9"
) as Address;

/**
 * Sources checked 2026-08-11:
 * https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscMainnet.json
 * https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscTestnet.json
 * https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/projects/v3-periphery/contracts/base/PeripheryImmutableState.sol
 * https://eips.ethereum.org/EIPS/eip-20
 */
const MANAGER_STATIC_ABI = parseAbi([
  "function factory() external view returns (address)",
  "function deployer() external view returns (address)",
  "function WETH9() external view returns (address)"
]);
const ERC20_DECIMALS_ABI = parseAbi(["function decimals() external view returns (uint8)"]);

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

export const pancakeV3StaticContextRequestSchema = z
  .strictObject({
    chainId: supportedChainIdSchema,
    positionManagerAddress: nonZeroAddressSchema,
    factoryAddress: nonZeroAddressSchema,
    token0Address: nonZeroAddressSchema,
    token1Address: nonZeroAddressSchema,
    block: z.strictObject({
      number: canonicalUint256DecimalSchema,
      hash: blockHashSchema,
      timestampUnix: blockTimestampSchema
    })
  })
  .superRefine((request, context) => {
    const deployment = PANCAKE_V3_BSC_DEPLOYMENTS[request.chainId];
    if (request.positionManagerAddress !== deployment.positionManager) {
      context.addIssue({
        code: "custom",
        path: ["positionManagerAddress"],
        message: "Expected the official Pancake V3 position manager for this chain"
      });
    }
    if (request.factoryAddress !== deployment.factory) {
      context.addIssue({
        code: "custom",
        path: ["factoryAddress"],
        message: "Expected the official Pancake V3 factory for this chain"
      });
    }
    if (request.token0Address === request.token1Address) {
      context.addIssue({
        code: "custom",
        path: ["token1Address"],
        message: "Pool token addresses must be distinct"
      });
    }
    const protocolAddresses = new Set([request.positionManagerAddress, request.factoryAddress]);
    if (
      protocolAddresses.has(request.token0Address) ||
      protocolAddresses.has(request.token1Address)
    ) {
      context.addIssue({
        code: "custom",
        path: ["token0Address"],
        message: "Pool tokens must be distinct from the manager and factory"
      });
    }
  });

export type PancakeV3StaticContextRequest = z.input<typeof pancakeV3StaticContextRequestSchema>;
type ValidatedRequest = z.output<typeof pancakeV3StaticContextRequestSchema>;
export type PancakeV3StaticContextChainId = z.infer<typeof supportedChainIdSchema>;

export type PancakeV3StaticContextRpcRequest =
  | { readonly method: "eth_chainId"; readonly params: readonly [] }
  | { readonly method: "eth_getBlockByHash"; readonly params: readonly [Hex, false] }
  | {
      readonly method: "eth_call";
      readonly params: readonly [
        { readonly to: Address; readonly data: Hex },
        { readonly blockHash: Hex; readonly requireCanonical: true }
      ];
    };

/** Exact-hash read-only RPC surface; it has no latest, block-number, or write method. */
export interface PancakeV3StaticContextRpcClient {
  request(request: PancakeV3StaticContextRpcRequest): Promise<unknown>;
}

export interface CreatePancakeV3StaticContextReaderOptions {
  readonly client: PancakeV3StaticContextRpcClient;
  readonly now: () => Date;
  readonly freshnessPolicy: {
    readonly maximumBlockAgeSeconds: number;
    readonly maximumFutureSkewSeconds: number;
  };
  /** Public provenance only; authenticated RPC URLs and credentials are forbidden. */
  readonly rpcProvider: {
    readonly id: string;
    readonly publicSourceUrl: string;
  };
}

export interface PancakeV3StaticContextBlock {
  readonly number: string;
  readonly hash: Hex;
  readonly timestampUnix: string;
  readonly timestampUtc: string;
  readonly ageMilliseconds: string;
}

export interface PancakeV3StaticContextEvidence {
  readonly positionManagerAddress: Address;
  readonly factoryAddress: Address;
  readonly poolDeployerAddress: Address;
  readonly wrappedNativeAddress: Address;
  readonly token0: { readonly address: Address; readonly decimals: number };
  readonly token1: { readonly address: Address; readonly decimals: number };
  readonly observedAt: string;
  readonly blockNumber: string;
  readonly blockHash: Hex;
  readonly source: "onchain_manager_immutables_and_token_decimals";
}

export interface PancakeV3StaticContextProvenance {
  readonly deploymentCommit: typeof PANCAKE_V3_DEPLOYMENT_COMMIT;
  readonly deploymentSourceUrl:
    | "https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscMainnet.json"
    | "https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscTestnet.json";
  readonly rpcProvider: { readonly id: string; readonly publicSourceUrl: string };
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
  readonly staticReadPlan: readonly [
    { readonly role: "manager_factory"; readonly to: Address; readonly selector: Hex },
    { readonly role: "manager_pool_deployer"; readonly to: Address; readonly selector: Hex },
    { readonly role: "manager_wrapped_native"; readonly to: Address; readonly selector: Hex },
    { readonly role: "token0_decimals"; readonly to: Address; readonly selector: Hex },
    { readonly role: "token1_decimals"; readonly to: Address; readonly selector: Hex }
  ];
  readonly blockSelector: { readonly blockHash: Hex; readonly requireCanonical: true };
  readonly latestTagUsed: false;
  readonly blockNumberSelectorUsed: false;
  readonly fallbackUsed: false;
  readonly readsAtomic: false;
}

export interface PancakeV3StaticContextBoundary {
  readonly establishesManagerImmutableRelationsAtBoundBlock: true;
  readonly establishesTokenDecimalsAtBoundBlock: true;
  readonly establishesRuntimeCodeIdentity: false;
  readonly establishesTokenSymbolOrEconomicMeaning: false;
  readonly establishesFutureState: false;
  readonly permitsExecution: false;
  readonly limitations: readonly [string, string, string, string];
}

export interface PancakeV3StaticContextAvailableResult {
  readonly status: "available";
  readonly chainId: PancakeV3StaticContextChainId;
  readonly environment: "bsc-mainnet" | "bsc-testnet";
  readonly block: PancakeV3StaticContextBlock;
  readonly evidence: PancakeV3StaticContextEvidence;
  readonly provenance: PancakeV3StaticContextProvenance;
  readonly boundary: PancakeV3StaticContextBoundary;
}

export type PancakeV3StaticContextStage =
  | "configuration"
  | "request"
  | "clock"
  | "chain"
  | "block"
  | "manager_factory"
  | "manager_pool_deployer"
  | "manager_wrapped_native"
  | "token0_decimals"
  | "token1_decimals";

export type PancakeV3StaticContextUnavailableReason =
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
  | "malformed_contract_response"
  | "deployment_relation_mismatch";

export interface PancakeV3StaticContextUnavailableResult {
  readonly status: "unavailable";
  readonly stage: PancakeV3StaticContextStage;
  readonly reason: PancakeV3StaticContextUnavailableReason;
  readonly message: string;
  readonly observedAt: string | null;
  readonly chainId: PancakeV3StaticContextChainId | null;
  readonly environment: "bsc-mainnet" | "bsc-testnet" | null;
  readonly requestedBlock: {
    readonly number: string;
    readonly hash: Hex;
    readonly timestampUnix: string;
  } | null;
  readonly block: PancakeV3StaticContextBlock | null;
  readonly evidence: null;
  readonly provenance: PancakeV3StaticContextProvenance | null;
  readonly boundary: PancakeV3StaticContextBoundary;
}

export type PancakeV3StaticContextResult =
  PancakeV3StaticContextAvailableResult | PancakeV3StaticContextUnavailableResult;

export interface PancakeV3StaticContextReader {
  read(input: unknown): Promise<PancakeV3StaticContextResult>;
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
const configurationSchema = z.strictObject({
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
type ValidatedConfiguration = z.infer<typeof configurationSchema>;

const DEPLOYMENT_SOURCE_URLS = Object.freeze({
  56: `https://github.com/pancakeswap/pancake-v3-contracts/blob/${PANCAKE_V3_DEPLOYMENT_COMMIT}/deployments/bscMainnet.json` as const,
  97: `https://github.com/pancakeswap/pancake-v3-contracts/blob/${PANCAKE_V3_DEPLOYMENT_COMMIT}/deployments/bscTestnet.json` as const
});
const LIMITATIONS: readonly [string, string, string, string] = Object.freeze([
  "Reads are sequential at one canonical block hash, not one atomic EVM observation.",
  "Decimals are contract-reported integers; no token symbol, value, legitimacy, or transfer behavior is established.",
  "These calls do not establish runtime-code hashes, source verification, proxy implementation identity, or upgrade safety.",
  "State and token code can change after the observed block; every execution context must be rebuilt immediately before submission."
]);
const BOUNDARY: PancakeV3StaticContextBoundary = Object.freeze({
  establishesManagerImmutableRelationsAtBoundBlock: true,
  establishesTokenDecimalsAtBoundBlock: true,
  establishesRuntimeCodeIdentity: false,
  establishesTokenSymbolOrEconomicMeaning: false,
  establishesFutureState: false,
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

function blockView(
  number: bigint,
  hash: Hex,
  timestamp: bigint,
  ageMilliseconds: bigint
): PancakeV3StaticContextBlock {
  return {
    number: number.toString(),
    hash,
    timestampUnix: timestamp.toString(),
    timestampUtc: new Date(Number(timestamp) * 1_000).toISOString(),
    ageMilliseconds: ageMilliseconds.toString()
  };
}

function calls(request: ValidatedRequest) {
  return [
    {
      role: "manager_factory" as const,
      stage: "manager_factory" as const,
      to: request.positionManagerAddress,
      data: encodeFunctionData({ abi: MANAGER_STATIC_ABI, functionName: "factory" })
    },
    {
      role: "manager_pool_deployer" as const,
      stage: "manager_pool_deployer" as const,
      to: request.positionManagerAddress,
      data: encodeFunctionData({ abi: MANAGER_STATIC_ABI, functionName: "deployer" })
    },
    {
      role: "manager_wrapped_native" as const,
      stage: "manager_wrapped_native" as const,
      to: request.positionManagerAddress,
      data: encodeFunctionData({ abi: MANAGER_STATIC_ABI, functionName: "WETH9" })
    },
    {
      role: "token0_decimals" as const,
      stage: "token0_decimals" as const,
      to: request.token0Address,
      data: encodeFunctionData({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })
    },
    {
      role: "token1_decimals" as const,
      stage: "token1_decimals" as const,
      to: request.token1Address,
      data: encodeFunctionData({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })
    }
  ] as const;
}

function provenance(
  request: ValidatedRequest,
  configuration: ValidatedConfiguration
): PancakeV3StaticContextProvenance {
  const planned = calls(request);
  const selector = (index: 0 | 1 | 2 | 3 | 4): Hex => planned[index].data.slice(0, 10) as Hex;
  return {
    deploymentCommit: PANCAKE_V3_DEPLOYMENT_COMMIT,
    deploymentSourceUrl: DEPLOYMENT_SOURCE_URLS[request.chainId],
    rpcProvider: configuration.rpcProvider,
    freshnessPolicy: {
      ...configuration.freshnessPolicy,
      ownership: "trusted_reader_configuration"
    },
    chainRead: { method: "eth_chainId", params: [] },
    blockRead: { method: "eth_getBlockByHash", params: [request.block.hash, false] },
    staticReadPlan: [
      { role: "manager_factory", to: planned[0].to, selector: selector(0) },
      { role: "manager_pool_deployer", to: planned[1].to, selector: selector(1) },
      { role: "manager_wrapped_native", to: planned[2].to, selector: selector(2) },
      { role: "token0_decimals", to: planned[3].to, selector: selector(3) },
      { role: "token1_decimals", to: planned[4].to, selector: selector(4) }
    ],
    blockSelector: { blockHash: request.block.hash, requireCanonical: true },
    latestTagUsed: false,
    blockNumberSelectorUsed: false,
    fallbackUsed: false,
    readsAtomic: false
  };
}

function unavailable(
  stage: PancakeV3StaticContextStage,
  reason: PancakeV3StaticContextUnavailableReason,
  message: string,
  request: ValidatedRequest | null,
  observedAt: string | null,
  block: PancakeV3StaticContextBlock | null,
  callProvenance: PancakeV3StaticContextProvenance | null
): PancakeV3StaticContextUnavailableResult {
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
    evidence: null,
    provenance: callProvenance,
    boundary: BOUNDARY
  };
}

function parseAddressWord(value: unknown): Address | null {
  const parsed = wordSchema.safeParse(value);
  if (!parsed.success || parsed.data.slice(2, 26) !== "0".repeat(24)) return null;
  const address = getAddress(`0x${parsed.data.slice(26)}`) as Address;
  return address === ZERO_ADDRESS ? null : address;
}

function parseDecimalsWord(value: unknown): number | null {
  const parsed = wordSchema.safeParse(value);
  if (!parsed.success) return null;
  const raw = BigInt(parsed.data);
  return raw <= 255n ? Number(raw) : null;
}

export function createPancakeV3StaticContextReader(
  options: CreatePancakeV3StaticContextReaderOptions
): PancakeV3StaticContextReader {
  const configuration = configurationSchema.safeParse({
    freshnessPolicy: options.freshnessPolicy,
    rpcProvider: options.rpcProvider
  });
  return {
    async read(input: unknown): Promise<PancakeV3StaticContextResult> {
      if (!configuration.success) {
        return unavailable(
          "configuration",
          "invalid_configuration",
          "The trusted static-context reader configuration was invalid.",
          null,
          null,
          null,
          null
        );
      }
      const parsedRequest = pancakeV3StaticContextRequestSchema.safeParse(input);
      if (!parsedRequest.success) {
        return unavailable(
          "request",
          "invalid_request",
          "Static-context request validation failed.",
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
      const ageMilliseconds = clock.milliseconds - timestamp * 1_000n;
      const block = blockView(number, hash, timestamp, ageMilliseconds);
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
          block,
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
          "The bound block is older than the permitted static-evidence window.",
          request,
          clock.observedAt,
          block,
          null
        );
      }

      const callProvenance = provenance(request, configuration.data);
      const blockSelector = { blockHash: request.block.hash, requireCanonical: true as const };
      const responses: unknown[] = [];
      for (const planned of calls(request)) {
        try {
          responses.push(
            await options.client.request({
              method: "eth_call",
              params: [{ to: planned.to, data: planned.data }, blockSelector]
            })
          );
        } catch {
          return unavailable(
            planned.stage,
            "contract_read_failed",
            "A bound static contract read failed.",
            request,
            clock.observedAt,
            block,
            callProvenance
          );
        }
      }

      const factoryAddress = parseAddressWord(responses[0]);
      const poolDeployerAddress = parseAddressWord(responses[1]);
      const wrappedNativeAddress = parseAddressWord(responses[2]);
      const token0Decimals = parseDecimalsWord(responses[3]);
      const token1Decimals = parseDecimalsWord(responses[4]);
      const parsedValues = [
        { stage: "manager_factory" as const, value: factoryAddress },
        { stage: "manager_pool_deployer" as const, value: poolDeployerAddress },
        { stage: "manager_wrapped_native" as const, value: wrappedNativeAddress },
        { stage: "token0_decimals" as const, value: token0Decimals },
        { stage: "token1_decimals" as const, value: token1Decimals }
      ];
      const malformed = parsedValues.find(({ value }) => value === null);
      if (malformed) {
        return unavailable(
          malformed.stage,
          "malformed_contract_response",
          "A static contract result was not a canonical value of the expected ABI type.",
          request,
          clock.observedAt,
          block,
          callProvenance
        );
      }
      if (factoryAddress !== request.factoryAddress) {
        return unavailable(
          "manager_factory",
          "deployment_relation_mismatch",
          "The manager factory immutable does not match the official deployment.",
          request,
          clock.observedAt,
          block,
          callProvenance
        );
      }
      if (poolDeployerAddress !== PANCAKE_V3_POOL_DEPLOYER) {
        return unavailable(
          "manager_pool_deployer",
          "deployment_relation_mismatch",
          "The manager pool-deployer immutable does not match the commit-pinned deployment.",
          request,
          clock.observedAt,
          block,
          callProvenance
        );
      }

      return {
        status: "available",
        chainId: request.chainId,
        environment: request.chainId === 56 ? "bsc-mainnet" : "bsc-testnet",
        block,
        evidence: {
          positionManagerAddress: request.positionManagerAddress,
          factoryAddress,
          poolDeployerAddress,
          wrappedNativeAddress: wrappedNativeAddress as Address,
          token0: { address: request.token0Address, decimals: token0Decimals as number },
          token1: { address: request.token1Address, decimals: token1Decimals as number },
          observedAt: clock.observedAt,
          blockNumber: block.number,
          blockHash: block.hash,
          source: "onchain_manager_immutables_and_token_decimals"
        },
        provenance: callProvenance,
        boundary: BOUNDARY
      };
    }
  };
}
