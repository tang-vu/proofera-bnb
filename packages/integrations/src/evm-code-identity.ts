import { getAddress, isAddress, keccak256, type Address, type Hex } from "viem";
import { z } from "zod";

const UINT256_MAX = (1n << 256n) - 1n;
const MAX_BLOCK_TIMESTAMP = 253_402_300_799n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** A defensive transport bound, not a claim about a chain-level code-size limit. */
export const EVM_CODE_IDENTITY_MAX_RUNTIME_BYTES = 65_536 as const;
export const EVM_CODE_IDENTITY_MAX_CONTRACTS = 16 as const;

const supportedChainIdSchema = z.union([z.literal(56), z.literal(97)]);
const environmentByChain = Object.freeze({
  56: "bsc-mainnet" as const,
  97: "bsc-testnet" as const
});

const blockHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hash")
  .transform((value) => value.toLowerCase() as Hex);

const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Expected an EVM address")
  .transform((value) => getAddress(value.toLowerCase()) as Address)
  .refine((value) => value !== ZERO_ADDRESS, "The zero address is not a contract identity target");

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

const labelSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => value === value.trim(), "Contract labels cannot have outer whitespace")
  .refine(
    (value) => !/[\u0000-\u001f\u007f]/u.test(value),
    "Contract labels cannot contain controls"
  );

const contractRequestSchema = z.strictObject({
  label: labelSchema,
  address: addressSchema,
  expectedRuntimeCodeHash: blockHashSchema.optional()
});

const blockRequestSchema = z.strictObject({
  number: canonicalUint256DecimalSchema,
  hash: blockHashSchema,
  timestampUnix: blockTimestampSchema
});

export const evmCodeIdentityRequestSchema = z
  .strictObject({
    chainId: supportedChainIdSchema,
    block: blockRequestSchema,
    maximumBlockAgeSeconds: z.number().int().positive().max(3_600),
    maximumFutureSkewSeconds: z.number().int().min(0).max(60),
    contracts: z.array(contractRequestSchema).min(1).max(EVM_CODE_IDENTITY_MAX_CONTRACTS)
  })
  .superRefine((request, context) => {
    const labels = new Set<string>();
    const addresses = new Set<Address>();

    request.contracts.forEach((contract, index) => {
      const comparableLabel = contract.label.toLocaleLowerCase("en-US");
      if (labels.has(comparableLabel)) {
        context.addIssue({
          code: "custom",
          path: ["contracts", index, "label"],
          message: "Contract labels must be unique without relying on letter case"
        });
      }
      labels.add(comparableLabel);

      if (addresses.has(contract.address)) {
        context.addIssue({
          code: "custom",
          path: ["contracts", index, "address"],
          message: "Contract addresses must be unique"
        });
      }
      addresses.add(contract.address);
    });
  });

export type EvmCodeIdentityRequest = z.input<typeof evmCodeIdentityRequestSchema>;
type ValidatedEvmCodeIdentityRequest = z.output<typeof evmCodeIdentityRequestSchema>;
export type EvmCodeIdentitySupportedChainId = z.infer<typeof supportedChainIdSchema>;

export type EvmCodeIdentityRpcRequest =
  | {
      readonly method: "eth_chainId";
      readonly params: readonly [];
    }
  | {
      readonly method: "eth_getBlockByHash";
      readonly params: readonly [Hex, false];
    }
  | {
      readonly method: "eth_getCode";
      readonly params: readonly [
        Address,
        {
          readonly blockHash: Hex;
          readonly requireCanonical: true;
        }
      ];
    };

/** Minimal read-only JSON-RPC transport. It deliberately exposes no write or fallback surface. */
export interface EvmCodeIdentityRpcClient {
  request(request: EvmCodeIdentityRpcRequest): Promise<unknown>;
}

export interface CreateEvmCodeIdentityReaderOptions {
  readonly client: EvmCodeIdentityRpcClient;
  readonly now: () => Date;
}

export type EvmCodeIdentityStage = "request" | "clock" | "chain" | "block" | "code";

export type EvmCodeIdentityUnavailableReason =
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
  | "canonical_code_read_failed"
  | "missing_runtime_code"
  | "malformed_runtime_code"
  | "oversized_runtime_code"
  | "runtime_code_hash_mismatch";

export interface EvmCodeIdentityBlock {
  readonly number: string;
  readonly hash: Hex;
  readonly timestampUnix: string;
  readonly timestampUtc: string;
  readonly ageMilliseconds: string;
}

export interface EvmCodeIdentityBoundary {
  readonly identityKind: "keccak256_evm_runtime_bytecode_at_block";
  readonly sourceCodeVerified: false;
  readonly proxyImplementationIdentified: false;
  readonly safetyEstablished: false;
  readonly rawRuntimeCodeReturned: false;
  readonly limitations: readonly [string, string, string, string];
}

export interface EvmCodeIdentityRpcProvenance {
  readonly chainRead: {
    readonly method: "eth_chainId";
    readonly params: readonly [];
  };
  readonly blockRead: {
    readonly method: "eth_getBlockByHash";
    readonly params: readonly [Hex, false];
  };
  readonly codeRead: {
    readonly method: "eth_getCode";
    readonly blockSelector: {
      readonly blockHash: Hex;
      readonly requireCanonical: true;
    };
  };
  readonly fallbackUsed: false;
  readonly latestTagUsed: false;
  readonly blockNumberSelectorUsed: false;
  readonly codeReadsAtomic: false;
}

export interface EvmRuntimeCodeIdentity {
  readonly label: string;
  readonly address: Address;
  readonly byteLength: string;
  readonly runtimeCodeHash: Hex;
  readonly expectedRuntimeCodeHash: Hex | null;
  readonly expectation: "matched" | "not_supplied";
  readonly provenance: {
    readonly method: "eth_getCode";
    readonly address: Address;
    readonly blockSelector: {
      readonly blockHash: Hex;
      readonly requireCanonical: true;
    };
  };
}

export interface EvmCodeIdentityAvailableResult {
  readonly status: "available";
  readonly observedAt: string;
  readonly chainId: EvmCodeIdentitySupportedChainId;
  readonly environment: "bsc-mainnet" | "bsc-testnet";
  readonly block: EvmCodeIdentityBlock;
  readonly contracts: readonly EvmRuntimeCodeIdentity[];
  readonly provenance: EvmCodeIdentityRpcProvenance;
  readonly boundary: EvmCodeIdentityBoundary;
}

export interface EvmCodeIdentityFailedContract {
  readonly label: string;
  readonly address: Address;
  readonly expectedRuntimeCodeHash: Hex | null;
  readonly observedRuntimeCodeHash: Hex | null;
  readonly observedByteLength: string | null;
}

export interface EvmCodeIdentityUnavailableResult {
  readonly status: "unavailable";
  readonly stage: EvmCodeIdentityStage;
  readonly reason: EvmCodeIdentityUnavailableReason;
  readonly message: string;
  readonly observedAt: string | null;
  readonly chainId: EvmCodeIdentitySupportedChainId | null;
  readonly environment: "bsc-mainnet" | "bsc-testnet" | null;
  readonly requestedBlock: {
    readonly number: string;
    readonly hash: Hex;
    readonly timestampUnix: string;
  } | null;
  readonly block: EvmCodeIdentityBlock | null;
  readonly contracts: null;
  readonly failedContract: EvmCodeIdentityFailedContract | null;
  readonly provenance: EvmCodeIdentityRpcProvenance | null;
  readonly boundary: EvmCodeIdentityBoundary;
}

export type EvmCodeIdentityResult =
  EvmCodeIdentityAvailableResult | EvmCodeIdentityUnavailableResult;

export interface EvmCodeIdentityReader {
  read(input: unknown): Promise<EvmCodeIdentityResult>;
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

type ValidatedRpcBlock = z.output<typeof rpcBlockSchema>;

const IDENTITY_LIMITATIONS: readonly [string, string, string, string] = Object.freeze([
  "A runtime bytecode hash is not source-code verification.",
  "A proxy runtime hash does not identify or validate its implementation contract.",
  "Code presence or an expected-hash match does not establish safety, behavior, ownership, or upgradeability.",
  "Contract code reads are sequential at one block hash, not one atomic multi-contract observation."
]);

const BOUNDARY: EvmCodeIdentityBoundary = Object.freeze({
  identityKind: "keccak256_evm_runtime_bytecode_at_block",
  sourceCodeVerified: false,
  proxyImplementationIdentified: false,
  safetyEstablished: false,
  rawRuntimeCodeReturned: false,
  limitations: IDENTITY_LIMITATIONS
});

function rpcProvenance(blockHash: Hex): EvmCodeIdentityRpcProvenance {
  return {
    chainRead: { method: "eth_chainId", params: [] },
    blockRead: { method: "eth_getBlockByHash", params: [blockHash, false] },
    codeRead: {
      method: "eth_getCode",
      blockSelector: { blockHash, requireCanonical: true }
    },
    fallbackUsed: false,
    latestTagUsed: false,
    blockNumberSelectorUsed: false,
    codeReadsAtomic: false
  };
}

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

    return {
      observedAt: Date.prototype.toISOString.call(date),
      milliseconds
    };
  } catch {
    return null;
  }
}

function exactBlock(rpcBlock: ValidatedRpcBlock, clockMilliseconds: bigint): EvmCodeIdentityBlock {
  const timestampMilliseconds = rpcBlock.timestamp * 1_000n;
  return {
    number: rpcBlock.number.toString(10),
    hash: rpcBlock.hash,
    timestampUnix: rpcBlock.timestamp.toString(10),
    timestampUtc: new Date(Number(rpcBlock.timestamp) * 1_000).toISOString(),
    ageMilliseconds: (clockMilliseconds - timestampMilliseconds).toString(10)
  };
}

function failedContract(
  contract: ValidatedEvmCodeIdentityRequest["contracts"][number],
  observedRuntimeCodeHash: Hex | null = null,
  observedByteLength: string | null = null
): EvmCodeIdentityFailedContract {
  return {
    label: contract.label,
    address: contract.address,
    expectedRuntimeCodeHash: contract.expectedRuntimeCodeHash ?? null,
    observedRuntimeCodeHash,
    observedByteLength
  };
}

interface UnavailableContext {
  readonly request?: ValidatedEvmCodeIdentityRequest;
  readonly observedAt?: string;
  readonly block?: EvmCodeIdentityBlock;
  readonly failedContract?: EvmCodeIdentityFailedContract;
}

function unavailable(
  stage: EvmCodeIdentityStage,
  reason: EvmCodeIdentityUnavailableReason,
  message: string,
  context: UnavailableContext = {}
): EvmCodeIdentityUnavailableResult {
  const request = context.request;
  return {
    status: "unavailable",
    stage,
    reason,
    message,
    observedAt: context.observedAt ?? null,
    chainId: request?.chainId ?? null,
    environment: request === undefined ? null : environmentByChain[request.chainId],
    requestedBlock:
      request === undefined
        ? null
        : {
            number: request.block.number,
            hash: request.block.hash,
            timestampUnix: request.block.timestampUnix
          },
    block: context.block ?? null,
    contracts: null,
    failedContract: context.failedContract ?? null,
    provenance: request === undefined ? null : rpcProvenance(request.block.hash),
    boundary: BOUNDARY
  };
}

function parseRuntimeCode(
  value: unknown
):
  | { readonly status: "valid"; readonly code: Hex; readonly byteLength: number }
  | { readonly status: "missing" }
  | { readonly status: "malformed" }
  | { readonly status: "oversized" } {
  if (typeof value !== "string") return { status: "malformed" };
  if (value === "0x") return { status: "missing" };
  if (value.length > EVM_CODE_IDENTITY_MAX_RUNTIME_BYTES * 2 + 2) {
    return { status: "oversized" };
  }
  if (!/^0x(?:[0-9a-fA-F]{2})+$/u.test(value)) return { status: "malformed" };
  return {
    status: "valid",
    code: value.toLowerCase() as Hex,
    byteLength: (value.length - 2) / 2
  };
}

export function createEvmCodeIdentityReader(
  options: CreateEvmCodeIdentityReaderOptions
): EvmCodeIdentityReader {
  return {
    async read(input: unknown): Promise<EvmCodeIdentityResult> {
      let parsedRequest: ReturnType<typeof evmCodeIdentityRequestSchema.safeParse>;
      try {
        parsedRequest = evmCodeIdentityRequestSchema.safeParse(input);
      } catch {
        return unavailable(
          "request",
          "invalid_request",
          "The runtime-code identity request failed runtime validation."
        );
      }

      if (!parsedRequest.success) {
        return unavailable(
          "request",
          "invalid_request",
          "The runtime-code identity request failed runtime validation."
        );
      }
      const request = parsedRequest.data;

      const clock = validClock(options.now);
      if (clock === null) {
        return unavailable("clock", "invalid_clock", "The injected observation clock is invalid.", {
          request
        });
      }

      const baseContext = { request, observedAt: clock.observedAt } as const;

      let chainResponse: unknown;
      try {
        chainResponse = await options.client.request({ method: "eth_chainId", params: [] });
      } catch {
        return unavailable(
          "chain",
          "chain_read_failed",
          "The chain identity RPC read failed.",
          baseContext
        );
      }

      let parsedChain: ReturnType<typeof rpcQuantitySchema.safeParse>;
      try {
        parsedChain = rpcQuantitySchema.safeParse(chainResponse);
      } catch {
        return unavailable(
          "chain",
          "malformed_chain_response",
          "The chain identity RPC response is malformed.",
          baseContext
        );
      }
      if (!parsedChain.success || parsedChain.data > UINT256_MAX) {
        return unavailable(
          "chain",
          "malformed_chain_response",
          "The chain identity RPC response is malformed.",
          baseContext
        );
      }
      if (parsedChain.data !== BigInt(request.chainId)) {
        return unavailable(
          "chain",
          "chain_mismatch",
          "The RPC chain does not match the requested BSC chain.",
          baseContext
        );
      }

      let blockResponse: unknown;
      try {
        blockResponse = await options.client.request({
          method: "eth_getBlockByHash",
          params: [request.block.hash, false]
        });
      } catch {
        return unavailable(
          "block",
          "block_read_failed",
          "The exact block identity RPC read failed.",
          baseContext
        );
      }

      if (blockResponse === null) {
        return unavailable(
          "block",
          "block_not_found",
          "The requested block hash was not returned by the RPC provider.",
          baseContext
        );
      }
      let parsedBlock: ReturnType<typeof rpcBlockSchema.safeParse>;
      try {
        parsedBlock = rpcBlockSchema.safeParse(blockResponse);
      } catch {
        return unavailable(
          "block",
          "malformed_block_response",
          "The exact block identity RPC response is malformed.",
          baseContext
        );
      }
      if (!parsedBlock.success) {
        return unavailable(
          "block",
          "malformed_block_response",
          "The exact block identity RPC response is malformed.",
          baseContext
        );
      }

      const rpcBlock = parsedBlock.data;
      const block = exactBlock(rpcBlock, clock.milliseconds);
      if (
        rpcBlock.number !== BigInt(request.block.number) ||
        rpcBlock.hash !== request.block.hash ||
        rpcBlock.timestamp !== BigInt(request.block.timestampUnix)
      ) {
        return unavailable(
          "block",
          "block_mismatch",
          "The returned block number, hash, or timestamp does not match the requested identity.",
          { ...baseContext, block }
        );
      }

      const blockMilliseconds = rpcBlock.timestamp * 1_000n;
      const maximumAgeMilliseconds = BigInt(request.maximumBlockAgeSeconds) * 1_000n;
      const maximumFutureMilliseconds = BigInt(request.maximumFutureSkewSeconds) * 1_000n;
      if (clock.milliseconds - blockMilliseconds > maximumAgeMilliseconds) {
        return unavailable(
          "block",
          "stale_block",
          "The requested block is older than the configured freshness limit.",
          { ...baseContext, block }
        );
      }
      if (blockMilliseconds - clock.milliseconds > maximumFutureMilliseconds) {
        return unavailable(
          "block",
          "future_block",
          "The requested block timestamp is beyond the configured future tolerance.",
          { ...baseContext, block }
        );
      }

      const identities: EvmRuntimeCodeIdentity[] = [];
      for (const contract of request.contracts) {
        let codeResponse: unknown;
        try {
          codeResponse = await options.client.request({
            method: "eth_getCode",
            params: [contract.address, { blockHash: request.block.hash, requireCanonical: true }]
          });
        } catch {
          return unavailable(
            "code",
            "canonical_code_read_failed",
            "The canonical EIP-1898 runtime-code read failed or was rejected.",
            { ...baseContext, block, failedContract: failedContract(contract) }
          );
        }

        const parsedCode = parseRuntimeCode(codeResponse);
        if (parsedCode.status === "missing") {
          return unavailable(
            "code",
            "missing_runtime_code",
            "No runtime bytecode exists for the labeled address at the requested block.",
            { ...baseContext, block, failedContract: failedContract(contract) }
          );
        }
        if (parsedCode.status === "oversized") {
          return unavailable(
            "code",
            "oversized_runtime_code",
            "The runtime bytecode response exceeds the defensive reader limit.",
            { ...baseContext, block, failedContract: failedContract(contract) }
          );
        }
        if (parsedCode.status === "malformed") {
          return unavailable(
            "code",
            "malformed_runtime_code",
            "The runtime bytecode RPC response is malformed.",
            { ...baseContext, block, failedContract: failedContract(contract) }
          );
        }

        const runtimeCodeHash = keccak256(parsedCode.code);
        const byteLength = parsedCode.byteLength.toString(10);
        if (
          contract.expectedRuntimeCodeHash !== undefined &&
          runtimeCodeHash !== contract.expectedRuntimeCodeHash
        ) {
          return unavailable(
            "code",
            "runtime_code_hash_mismatch",
            "The observed runtime-code hash does not match the supplied expectation.",
            {
              ...baseContext,
              block,
              failedContract: failedContract(contract, runtimeCodeHash, byteLength)
            }
          );
        }

        identities.push({
          label: contract.label,
          address: contract.address,
          byteLength,
          runtimeCodeHash,
          expectedRuntimeCodeHash: contract.expectedRuntimeCodeHash ?? null,
          expectation: contract.expectedRuntimeCodeHash === undefined ? "not_supplied" : "matched",
          provenance: {
            method: "eth_getCode",
            address: contract.address,
            blockSelector: { blockHash: request.block.hash, requireCanonical: true }
          }
        });
      }

      return {
        status: "available",
        observedAt: clock.observedAt,
        chainId: request.chainId,
        environment: environmentByChain[request.chainId],
        block,
        contracts: identities,
        provenance: rpcProvenance(request.block.hash),
        boundary: BOUNDARY
      };
    }
  };
}
