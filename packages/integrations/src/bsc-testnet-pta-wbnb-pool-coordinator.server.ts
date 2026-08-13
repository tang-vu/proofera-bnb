import "server-only";

import { isProxy } from "node:util/types";

import {
  EIP1967_ADMIN_SLOT,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT
} from "@proofera/domain";
import { keccak256, type Address, type Hex } from "viem";

import {
  BSC_TESTNET_PANCAKE_V3_FACTORY,
  BSC_TESTNET_PANCAKE_V3_FACTORY_OWNER,
  BSC_TESTNET_PANCAKE_V3_LM_POOL_DEPLOYER,
  BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_EMPTY_CODE_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
  BSC_TESTNET_PTA_WBNB_POOL_GAS_MARGIN_BPS,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_BYTES,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96,
  BSC_TESTNET_WBNB_ADDRESS,
  calculateBscTestnetPtaWbnbPoolGasLimit,
  deriveBscTestnetPtaWbnbPoolInitializationEnvelopeHash,
  type BscTestnetPtaWbnbPoolInitializationEnvelope,
  type BscTestnetPtaWbnbPoolInitializationEnvelopeBody
} from "./bsc-testnet-pta-wbnb-pool-initialization";

const UINT256_MAX = (1n << 256n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
const MAX_RPC_RESPONSE_BYTES = 1024 * 1024;
const RPC_REQUEST_TIMEOUT_MILLISECONDS = 4_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_WORD = `0x${"00".repeat(32)}` as Hex;

const SELECTORS = Object.freeze({
  managerFactory: "0xc45a0155",
  managerDeployer: "0xd5f39488",
  managerWrappedNative: "0x4aa4a4fc",
  factoryOwner: "0x8da5cb5b",
  factoryLmPoolDeployer: "0x5e492ac8",
  factoryPoolDeployer: "0x3119049a",
  deployerFactory: "0x966dae0e",
  deployerParameters: "0x89035730",
  feeAmountTickSpacing: "0x22afcccb",
  feeAmountTickSpacingExtraInfo: "0x88e8006d",
  getPool: "0x1698ee82"
});

function abiWord(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function addressWord(address: Address): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

const FEE_WORD = abiWord(500n);
const FEE_SPACING_CALL = `${SELECTORS.feeAmountTickSpacing}${FEE_WORD}` as Hex;
const FEE_EXTRA_INFO_CALL = `${SELECTORS.feeAmountTickSpacingExtraInfo}${FEE_WORD}` as Hex;
const GET_POOL_CALL = `${SELECTORS.getPool}${addressWord(BSC_TESTNET_PTA_ADDRESS)}${addressWord(
  BSC_TESTNET_WBNB_ADDRESS
)}${FEE_WORD}` as Hex;

type RpcBlockTag = "finalized" | "latest" | "pending" | Hex;
type RpcCanonicalBlock = Readonly<{ blockHash: Hex; requireCanonical: true }>;
type RpcStateSelector = RpcBlockTag | RpcCanonicalBlock;
type ReadCall = Readonly<{ to: Address; data: Hex }>;
type InitializationCall = Readonly<{
  from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
  to: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
  data: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA;
  value: "0x0";
}>;

export type BscTestnetPtaWbnbPoolRpcRequest =
  | Readonly<{ method: "eth_chainId"; params: readonly [] }>
  | Readonly<{
      method: "eth_getBlockByNumber";
      params: readonly [RpcBlockTag, false];
    }>
  | Readonly<{
      method: "eth_getBalance";
      params: readonly [typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest"];
    }>
  | Readonly<{
      method: "eth_getTransactionCount";
      params: readonly [Address, RpcStateSelector];
    }>
  | Readonly<{
      method: "eth_getCode";
      params: readonly [Address, RpcStateSelector];
    }>
  | Readonly<{
      method: "eth_getStorageAt";
      params: readonly [Address, Hex, RpcCanonicalBlock];
    }>
  | Readonly<{
      method: "eth_call";
      params: readonly [ReadCall | InitializationCall, RpcStateSelector];
    }>
  | Readonly<{ method: "eth_gasPrice"; params: readonly [] }>
  | Readonly<{
      method: "eth_estimateGas";
      params: readonly [InitializationCall];
    }>;

export interface BscTestnetPtaWbnbPoolRpcClient {
  request(request: BscTestnetPtaWbnbPoolRpcRequest): Promise<unknown>;
}

export interface BscTestnetPtaWbnbPoolCoordinatorTestOptions {
  readonly primaryClient: BscTestnetPtaWbnbPoolRpcClient;
  readonly corroboratorClient: BscTestnetPtaWbnbPoolRpcClient;
  readonly now: () => Date;
}

export type BscTestnetPtaWbnbPoolCoordinatorStage =
  | "input"
  | "clock"
  | "chain"
  | "block"
  | "identity"
  | "binding"
  | "account"
  | "race"
  | "simulation"
  | "envelope";

export type BscTestnetPtaWbnbPoolCoordinatorReason =
  | "invalid_options"
  | "invalid_clock"
  | "rpc_request_failed"
  | "rpc_timeout"
  | "rpc_response_too_large"
  | "malformed_rpc_response"
  | "chain_mismatch"
  | "provider_disagreement"
  | "stale_block"
  | "future_block"
  | "runtime_identity_mismatch"
  | "proxy_slot_nonzero"
  | "protocol_binding_mismatch"
  | "fee_tier_mismatch"
  | "nonce_mismatch"
  | "sender_not_eoa"
  | "pool_already_exists_or_raced"
  | "simulation_mismatch"
  | "gas_cap_exceeded"
  | "insufficient_balance"
  | "internal_error";

export interface BscTestnetPtaWbnbPoolCoordinatorBoundary {
  readonly scope: "exact_bsc_testnet_pta_wbnb_initializer_read_only_preparation";
  readonly rpcReadPerformed: boolean;
  readonly fixedOfficialRpcOriginsOnly: true;
  readonly fallbackUsed: false;
  readonly environmentRead: false;
  readonly custodyRead: false;
  readonly secretRead: false;
  readonly signerCreated: false;
  readonly signatureCreated: false;
  readonly transactionSubmitted: false;
  readonly blockchainWritePerformed: false;
  readonly signingReady: false;
  readonly signingAuthorized: false;
  readonly executionAuthorized: false;
  readonly freshPendingRecheckRequiredAfterDurableClaim: true;
}

export interface BscTestnetPtaWbnbPoolCoordinatorBlockedResult {
  readonly status: "blocked";
  readonly signingReady: false;
  readonly stage: BscTestnetPtaWbnbPoolCoordinatorStage;
  readonly reason: BscTestnetPtaWbnbPoolCoordinatorReason;
  readonly message: string;
  readonly attemptedAt: string | null;
  readonly envelope: null;
  readonly boundary: BscTestnetPtaWbnbPoolCoordinatorBoundary;
}

export interface BscTestnetPtaWbnbPoolCoordinatorObservedResult {
  readonly status: "observed";
  readonly signingReady: false;
  readonly attemptedAt: string;
  readonly envelope: BscTestnetPtaWbnbPoolInitializationEnvelope;
  readonly boundary: BscTestnetPtaWbnbPoolCoordinatorBoundary;
}

export type BscTestnetPtaWbnbPoolCoordinatorResult =
  BscTestnetPtaWbnbPoolCoordinatorBlockedResult | BscTestnetPtaWbnbPoolCoordinatorObservedResult;

const MESSAGES: Readonly<Record<BscTestnetPtaWbnbPoolCoordinatorReason, string>> = Object.freeze({
  invalid_options: "The injected read-only coordinator dependencies were invalid.",
  invalid_clock: "The trusted coordinator clock was invalid.",
  rpc_request_failed: "An official BSC testnet RPC read failed.",
  rpc_timeout: "An official BSC testnet RPC read exceeded the bounded timeout.",
  rpc_response_too_large: "An official BSC testnet RPC response exceeded the bounded size.",
  malformed_rpc_response: "An official BSC testnet RPC response was malformed.",
  chain_mismatch: "An RPC endpoint did not report BSC testnet chain 97.",
  provider_disagreement: "The two official BSC testnet RPC observations did not agree.",
  stale_block: "The common finalized block was older than the permitted freshness window.",
  future_block: "The common finalized block timestamp was later than the trusted clock.",
  runtime_identity_mismatch: "A pinned contract runtime identity changed or was unavailable.",
  proxy_slot_nonzero: "A pinned contract had a non-zero EIP-1967 proxy slot.",
  protocol_binding_mismatch: "A pinned Pancake V3 relationship or mutable owner binding changed.",
  fee_tier_mismatch: "The fee-500 factory configuration changed.",
  nonce_mismatch: "The exact sender latest or pending nonce was not one.",
  sender_not_eoa: "The exact sender had contract bytecode.",
  pool_already_exists_or_raced:
    "The exact pool was already present in finalized, latest, or pending state.",
  simulation_mismatch: "The exact initializer simulation did not return the candidate pool.",
  gas_cap_exceeded: "The exact initializer estimate or fee exceeded a fixed cap.",
  insufficient_balance: "The exact sender balance did not cover the bounded transaction cost.",
  internal_error: "Pool initialization preparation failed closed."
});

class CoordinatorFailure extends Error {
  override readonly name: string = "CoordinatorFailure";

  constructor(
    readonly stage: BscTestnetPtaWbnbPoolCoordinatorStage,
    readonly reason: BscTestnetPtaWbnbPoolCoordinatorReason
  ) {
    super(MESSAGES[reason]);
  }
}

function boundary(rpcReadPerformed: boolean): BscTestnetPtaWbnbPoolCoordinatorBoundary {
  return Object.freeze({
    scope: "exact_bsc_testnet_pta_wbnb_initializer_read_only_preparation" as const,
    rpcReadPerformed,
    fixedOfficialRpcOriginsOnly: true as const,
    fallbackUsed: false as const,
    environmentRead: false as const,
    custodyRead: false as const,
    secretRead: false as const,
    signerCreated: false as const,
    signatureCreated: false as const,
    transactionSubmitted: false as const,
    blockchainWritePerformed: false as const,
    signingReady: false as const,
    signingAuthorized: false as const,
    executionAuthorized: false as const,
    freshPendingRecheckRequiredAfterDurableClaim: true as const
  });
}

function blocked(
  stage: BscTestnetPtaWbnbPoolCoordinatorStage,
  reason: BscTestnetPtaWbnbPoolCoordinatorReason,
  attemptedAt: string | null,
  rpcReadPerformed: boolean
): BscTestnetPtaWbnbPoolCoordinatorBlockedResult {
  return Object.freeze({
    status: "blocked" as const,
    signingReady: false as const,
    stage,
    reason,
    message: MESSAGES[reason],
    attemptedAt,
    envelope: null,
    boundary: boundary(rpcReadPerformed)
  });
}

type ValidClock = Readonly<{ iso: string; milliseconds: number }>;

function validClock(now: () => Date): ValidClock | null {
  try {
    const date = now();
    if (
      isProxy(date) ||
      !(date instanceof Date) ||
      Object.getPrototypeOf(date) !== Date.prototype
    ) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(date);
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) return null;
    return { iso: Date.prototype.toISOString.call(date), milliseconds };
  } catch {
    return null;
  }
}

function ownData(value: unknown, key: string): unknown | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor ? descriptor.value : null;
  } catch {
    return null;
  }
}

function exactPlainDataRecord(
  value: unknown,
  expectedKeys: readonly string[]
): Readonly<Record<string, unknown>> | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) {
      return null;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return null;
    const sorted = (keys as string[]).sort();
    const expected = [...expectedKeys].sort();
    if (sorted.length !== expected.length || sorted.some((key, index) => key !== expected[index])) {
      return null;
    }
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
        return null;
      }
    }
    return value as Readonly<Record<string, unknown>>;
  } catch {
    return null;
  }
}

function inspectCoordinatorOptions(
  value: unknown
): BscTestnetPtaWbnbPoolCoordinatorTestOptions | null {
  const options = exactPlainDataRecord(value, ["primaryClient", "corroboratorClient", "now"]);
  if (options === null) return null;
  const primary = exactPlainDataRecord(options.primaryClient, ["request"]);
  const corroborator = exactPlainDataRecord(options.corroboratorClient, ["request"]);
  const now = options.now;
  const primaryRequest = primary?.request;
  const corroboratorRequest = corroborator?.request;
  const plainCallable = (candidate: unknown): candidate is (...args: never[]) => unknown => {
    if (typeof candidate !== "function" || isProxy(candidate)) return false;
    const prototype = Object.getPrototypeOf(candidate);
    return (
      prototype === Function.prototype || Object.getPrototypeOf(prototype) === Function.prototype
    );
  };
  if (
    primary === null ||
    corroborator === null ||
    !plainCallable(primaryRequest) ||
    !plainCallable(corroboratorRequest) ||
    !plainCallable(now)
  ) {
    return null;
  }
  return {
    primaryClient: { request: primaryRequest as BscTestnetPtaWbnbPoolRpcClient["request"] },
    corroboratorClient: {
      request: corroboratorRequest as BscTestnetPtaWbnbPoolRpcClient["request"]
    },
    now: now as () => Date
  };
}

function parseQuantity(value: unknown, maximum = UINT256_MAX): bigint | null {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= maximum ? parsed : null;
  } catch {
    return null;
  }
}

function parseBytes(value: unknown): Hex | null {
  return typeof value === "string" && /^0x(?:[0-9a-f]{2})*$/u.test(value) ? (value as Hex) : null;
}

function parseWord(value: unknown): Hex | null {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/u.test(value) ? (value as Hex) : null;
}

function parseAddressWord(value: unknown): Address | null {
  const word = parseWord(value);
  if (word === null || word.slice(2, 26) !== "0".repeat(24)) return null;
  return `0x${word.slice(26)}` as Address;
}

function parseInt24Word(value: unknown): bigint | null {
  const word = parseWord(value);
  if (word === null) return null;
  const encoded = BigInt(word);
  const low = encoded & ((1n << 24n) - 1n);
  const negative = low >= 1n << 23n;
  const expected = negative ? ((1n << 256n) - (1n << 24n)) | low : low;
  if (encoded !== expected) return null;
  return negative ? low - (1n << 24n) : low;
}

function parseUintWord(value: unknown, maximum: bigint): bigint | null {
  const word = parseWord(value);
  if (word === null) return null;
  const parsed = BigInt(word);
  return parsed <= maximum ? parsed : null;
}

function parseTwoBools(value: unknown): readonly [boolean, boolean] | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]{128}$/u.test(value)) return null;
  const left = BigInt(`0x${value.slice(2, 66)}`);
  const right = BigInt(`0x${value.slice(66)}`);
  if ((left !== 0n && left !== 1n) || (right !== 0n && right !== 1n)) return null;
  return [left === 1n, right === 1n] as const;
}

type BlockObservation = Readonly<{
  number: bigint;
  numberHex: Hex;
  hash: Hex;
  timestamp: bigint;
  gasLimit: bigint;
}>;

function parseBlock(value: unknown): BlockObservation | null {
  const number = parseQuantity(ownData(value, "number"));
  const hash = parseWord(ownData(value, "hash"));
  const timestamp = parseQuantity(ownData(value, "timestamp"));
  const gasLimit = parseQuantity(ownData(value, "gasLimit"));
  if (
    number === null ||
    number === 0n ||
    hash === null ||
    hash === ZERO_WORD ||
    timestamp === null ||
    timestamp === 0n ||
    gasLimit === null ||
    gasLimit === 0n
  ) {
    return null;
  }
  return { number, numberHex: `0x${number.toString(16)}` as Hex, hash, timestamp, gasLimit };
}

function sameBlock(left: BlockObservation, right: BlockObservation): boolean {
  return (
    left.number === right.number &&
    left.hash === right.hash &&
    left.timestamp === right.timestamp &&
    left.gasLimit === right.gasLimit
  );
}

function readCall(to: Address, data: Hex): ReadCall {
  return Object.freeze({ to, data });
}

function ethCall(to: Address, data: Hex, block: RpcStateSelector): BscTestnetPtaWbnbPoolRpcRequest {
  return { method: "eth_call", params: [readCall(to, data), block] };
}

const STATIC_READ_CALLS = Object.freeze({
  managerFactory: readCall(BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER, SELECTORS.managerFactory),
  managerDeployer: readCall(BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER, SELECTORS.managerDeployer),
  managerWrappedNative: readCall(
    BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    SELECTORS.managerWrappedNative
  ),
  factoryOwner: readCall(BSC_TESTNET_PANCAKE_V3_FACTORY, SELECTORS.factoryOwner),
  factoryLmPoolDeployer: readCall(BSC_TESTNET_PANCAKE_V3_FACTORY, SELECTORS.factoryLmPoolDeployer),
  factoryPoolDeployer: readCall(BSC_TESTNET_PANCAKE_V3_FACTORY, SELECTORS.factoryPoolDeployer),
  deployerFactory: readCall(BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER, SELECTORS.deployerFactory),
  deployerParameters: readCall(BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER, SELECTORS.deployerParameters),
  feeSpacing: readCall(BSC_TESTNET_PANCAKE_V3_FACTORY, FEE_SPACING_CALL),
  feeExtraInfo: readCall(BSC_TESTNET_PANCAKE_V3_FACTORY, FEE_EXTRA_INFO_CALL),
  getPool: readCall(BSC_TESTNET_PANCAKE_V3_FACTORY, GET_POOL_CALL)
});

const INITIALIZATION_CALL: InitializationCall = Object.freeze({
  from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  value: "0x0" as const
});

const CODE_IDENTITIES = Object.values(BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES);
const PROXY_SLOTS = [EIP1967_IMPLEMENTATION_SLOT, EIP1967_ADMIN_SLOT, EIP1967_BEACON_SLOT] as const;

type FinalizedState = Readonly<{
  codes: readonly Hex[];
  slots: readonly Hex[];
  managerFactory: Address;
  managerDeployer: Address;
  managerWrappedNative: Address;
  factoryOwner: Address;
  factoryLmPoolDeployer: Address;
  factoryPoolDeployer: Address;
  deployerFactory: Address;
  deployerParameters: readonly [Address, Address, Address, bigint, bigint];
  feeSpacing: bigint;
  feeExtraInfo: readonly [boolean, boolean];
  getPool: Address;
  candidateCode: Hex;
  candidateNonce: bigint;
  senderCode: Hex;
}>;

function parseParameters(
  value: unknown
): readonly [Address, Address, Address, bigint, bigint] | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]{320}$/u.test(value)) return null;
  const words = Array.from(
    { length: 5 },
    (_unused, index) => `0x${value.slice(2 + index * 64, 2 + (index + 1) * 64)}`
  );
  const factory = parseAddressWord(words[0]);
  const token0 = parseAddressWord(words[1]);
  const token1 = parseAddressWord(words[2]);
  const fee = parseUintWord(words[3], (1n << 24n) - 1n);
  const spacing = parseInt24Word(words[4]);
  return factory !== null && token0 !== null && token1 !== null && fee !== null && spacing !== null
    ? ([factory, token0, token1, fee, spacing] as const)
    : null;
}

async function finalizedState(
  client: BscTestnetPtaWbnbPoolRpcClient,
  block: RpcCanonicalBlock
): Promise<FinalizedState | null> {
  const codeRequests = CODE_IDENTITIES.map(
    ({ address }) => ({ method: "eth_getCode", params: [address, block] }) as const
  );
  const slotRequests = CODE_IDENTITIES.flatMap(({ address }) =>
    PROXY_SLOTS.map(
      (slot) => ({ method: "eth_getStorageAt", params: [address, slot, block] }) as const
    )
  );
  const values = await Promise.all([
    ...codeRequests.map((request) => client.request(request)),
    ...slotRequests.map((request) => client.request(request)),
    client.request(
      ethCall(STATIC_READ_CALLS.managerFactory.to, STATIC_READ_CALLS.managerFactory.data, block)
    ),
    client.request(
      ethCall(STATIC_READ_CALLS.managerDeployer.to, STATIC_READ_CALLS.managerDeployer.data, block)
    ),
    client.request(
      ethCall(
        STATIC_READ_CALLS.managerWrappedNative.to,
        STATIC_READ_CALLS.managerWrappedNative.data,
        block
      )
    ),
    client.request(
      ethCall(STATIC_READ_CALLS.factoryOwner.to, STATIC_READ_CALLS.factoryOwner.data, block)
    ),
    client.request(
      ethCall(
        STATIC_READ_CALLS.factoryLmPoolDeployer.to,
        STATIC_READ_CALLS.factoryLmPoolDeployer.data,
        block
      )
    ),
    client.request(
      ethCall(
        STATIC_READ_CALLS.factoryPoolDeployer.to,
        STATIC_READ_CALLS.factoryPoolDeployer.data,
        block
      )
    ),
    client.request(
      ethCall(STATIC_READ_CALLS.deployerFactory.to, STATIC_READ_CALLS.deployerFactory.data, block)
    ),
    client.request(
      ethCall(
        STATIC_READ_CALLS.deployerParameters.to,
        STATIC_READ_CALLS.deployerParameters.data,
        block
      )
    ),
    client.request(
      ethCall(STATIC_READ_CALLS.feeSpacing.to, STATIC_READ_CALLS.feeSpacing.data, block)
    ),
    client.request(
      ethCall(STATIC_READ_CALLS.feeExtraInfo.to, STATIC_READ_CALLS.feeExtraInfo.data, block)
    ),
    client.request(ethCall(STATIC_READ_CALLS.getPool.to, STATIC_READ_CALLS.getPool.data, block)),
    client.request({
      method: "eth_getCode",
      params: [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, block]
    }),
    client.request({
      method: "eth_getTransactionCount",
      params: [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, block]
    }),
    client.request({
      method: "eth_getCode",
      params: [BSC_TESTNET_PTA_WBNB_POOL_SENDER, block]
    })
  ]);

  let offset = 0;
  const codes = CODE_IDENTITIES.map(() => parseBytes(values[offset++]));
  const slots = slotRequests.map(() => parseWord(values[offset++]));
  const managerFactory = parseAddressWord(values[offset++]);
  const managerDeployer = parseAddressWord(values[offset++]);
  const managerWrappedNative = parseAddressWord(values[offset++]);
  const factoryOwner = parseAddressWord(values[offset++]);
  const factoryLmPoolDeployer = parseAddressWord(values[offset++]);
  const factoryPoolDeployer = parseAddressWord(values[offset++]);
  const deployerFactory = parseAddressWord(values[offset++]);
  const deployerParameters = parseParameters(values[offset++]);
  const feeSpacing = parseInt24Word(values[offset++]);
  const feeExtraInfo = parseTwoBools(values[offset++]);
  const getPool = parseAddressWord(values[offset++]);
  const candidateCode = parseBytes(values[offset++]);
  const candidateNonce = parseQuantity(values[offset++], UINT64_MAX);
  const senderCode = parseBytes(values[offset++]);

  if (
    codes.some((value) => value === null) ||
    slots.some((value) => value === null) ||
    managerFactory === null ||
    managerDeployer === null ||
    managerWrappedNative === null ||
    factoryOwner === null ||
    factoryLmPoolDeployer === null ||
    factoryPoolDeployer === null ||
    deployerFactory === null ||
    deployerParameters === null ||
    feeSpacing === null ||
    feeExtraInfo === null ||
    getPool === null ||
    candidateCode === null ||
    candidateNonce === null ||
    senderCode === null
  ) {
    return null;
  }
  return {
    codes: codes as Hex[],
    slots: slots as Hex[],
    managerFactory,
    managerDeployer,
    managerWrappedNative,
    factoryOwner,
    factoryLmPoolDeployer,
    factoryPoolDeployer,
    deployerFactory,
    deployerParameters,
    feeSpacing,
    feeExtraInfo,
    getPool,
    candidateCode,
    candidateNonce,
    senderCode
  };
}

function sameFinalizedState(left: FinalizedState, right: FinalizedState): boolean {
  return (
    left.codes.every((value, index) => value === right.codes[index]) &&
    left.slots.every((value, index) => value === right.slots[index]) &&
    left.managerFactory === right.managerFactory &&
    left.managerDeployer === right.managerDeployer &&
    left.managerWrappedNative === right.managerWrappedNative &&
    left.factoryOwner === right.factoryOwner &&
    left.factoryLmPoolDeployer === right.factoryLmPoolDeployer &&
    left.factoryPoolDeployer === right.factoryPoolDeployer &&
    left.deployerFactory === right.deployerFactory &&
    left.deployerParameters.every((value, index) => value === right.deployerParameters[index]) &&
    left.feeSpacing === right.feeSpacing &&
    left.feeExtraInfo.every((value, index) => value === right.feeExtraInfo[index]) &&
    left.getPool === right.getPool &&
    left.candidateCode === right.candidateCode &&
    left.candidateNonce === right.candidateNonce &&
    left.senderCode === right.senderCode
  );
}

function addressEquals(actual: Address, expected: Address): boolean {
  return actual.toLowerCase() === expected.toLowerCase();
}

function validateFinalizedState(
  state: FinalizedState
): BscTestnetPtaWbnbPoolCoordinatorReason | null {
  if (
    state.codes.some((code, index) => {
      const identity = CODE_IDENTITIES[index];
      return (
        identity === undefined ||
        (code.length - 2) / 2 !== identity.byteLength ||
        keccak256(code) !== identity.runtimeKeccak256
      );
    })
  ) {
    return "runtime_identity_mismatch";
  }
  if (state.slots.some((value) => value !== ZERO_WORD)) return "proxy_slot_nonzero";
  if (
    !addressEquals(state.managerFactory, BSC_TESTNET_PANCAKE_V3_FACTORY) ||
    !addressEquals(state.managerDeployer, BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER) ||
    !addressEquals(state.managerWrappedNative, BSC_TESTNET_WBNB_ADDRESS) ||
    !addressEquals(state.factoryOwner, BSC_TESTNET_PANCAKE_V3_FACTORY_OWNER) ||
    !addressEquals(state.factoryLmPoolDeployer, BSC_TESTNET_PANCAKE_V3_LM_POOL_DEPLOYER) ||
    !addressEquals(state.factoryPoolDeployer, BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER) ||
    !addressEquals(state.deployerFactory, BSC_TESTNET_PANCAKE_V3_FACTORY) ||
    !addressEquals(state.deployerParameters[0], ZERO_ADDRESS) ||
    !addressEquals(state.deployerParameters[1], ZERO_ADDRESS) ||
    !addressEquals(state.deployerParameters[2], ZERO_ADDRESS) ||
    state.deployerParameters[3] !== 0n ||
    state.deployerParameters[4] !== 0n
  ) {
    return "protocol_binding_mismatch";
  }
  if (
    state.feeSpacing !== 10n ||
    state.feeExtraInfo[0] !== false ||
    state.feeExtraInfo[1] !== true
  ) {
    return "fee_tier_mismatch";
  }
  if (
    !addressEquals(state.getPool, ZERO_ADDRESS) ||
    state.candidateCode !== "0x" ||
    keccak256(state.candidateCode) !== BSC_TESTNET_PTA_WBNB_POOL_EMPTY_CODE_HASH ||
    state.candidateNonce !== 0n
  ) {
    return "pool_already_exists_or_raced";
  }
  if (state.senderCode !== "0x") return "sender_not_eoa";
  return null;
}

type CurrentState = Readonly<{
  balance: bigint;
  latestNonce: bigint;
  pendingNonce: bigint;
  latestPool: Address;
  pendingPool: Address;
  pendingCandidateCode: Hex;
  pendingCandidateNonce: bigint;
  gasPrice: bigint;
  simulationPool: Address;
  gasEstimate: bigint;
}>;

async function currentState(client: BscTestnetPtaWbnbPoolRpcClient): Promise<CurrentState | null> {
  const values = await Promise.all([
    client.request({
      method: "eth_getBalance",
      params: [BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest"]
    }),
    client.request({
      method: "eth_getTransactionCount",
      params: [BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest"]
    }),
    client.request({
      method: "eth_getTransactionCount",
      params: [BSC_TESTNET_PTA_WBNB_POOL_SENDER, "pending"]
    }),
    client.request(ethCall(STATIC_READ_CALLS.getPool.to, STATIC_READ_CALLS.getPool.data, "latest")),
    client.request(
      ethCall(STATIC_READ_CALLS.getPool.to, STATIC_READ_CALLS.getPool.data, "pending")
    ),
    client.request({
      method: "eth_getCode",
      params: [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, "pending"]
    }),
    client.request({
      method: "eth_getTransactionCount",
      params: [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, "pending"]
    }),
    client.request({ method: "eth_gasPrice", params: [] }),
    client.request({ method: "eth_call", params: [INITIALIZATION_CALL, "pending"] }),
    client.request({ method: "eth_estimateGas", params: [INITIALIZATION_CALL] })
  ]);
  const balance = parseQuantity(values[0]);
  const latestNonce = parseQuantity(values[1], UINT64_MAX);
  const pendingNonce = parseQuantity(values[2], UINT64_MAX);
  const latestPool = parseAddressWord(values[3]);
  const pendingPool = parseAddressWord(values[4]);
  const pendingCandidateCode = parseBytes(values[5]);
  const pendingCandidateNonce = parseQuantity(values[6], UINT64_MAX);
  const gasPrice = parseQuantity(values[7]);
  const simulationPool = parseAddressWord(values[8]);
  const gasEstimate = parseQuantity(values[9]);
  return balance !== null &&
    latestNonce !== null &&
    pendingNonce !== null &&
    latestPool !== null &&
    pendingPool !== null &&
    pendingCandidateCode !== null &&
    pendingCandidateNonce !== null &&
    gasPrice !== null &&
    simulationPool !== null &&
    gasEstimate !== null
    ? {
        balance,
        latestNonce,
        pendingNonce,
        latestPool,
        pendingPool,
        pendingCandidateCode,
        pendingCandidateNonce,
        gasPrice,
        simulationPool,
        gasEstimate
      }
    : null;
}

function sameCurrentStateExceptGasPrice(left: CurrentState, right: CurrentState): boolean {
  return (
    left.balance === right.balance &&
    left.latestNonce === right.latestNonce &&
    left.pendingNonce === right.pendingNonce &&
    left.latestPool === right.latestPool &&
    left.pendingPool === right.pendingPool &&
    left.pendingCandidateCode === right.pendingCandidateCode &&
    left.pendingCandidateNonce === right.pendingCandidateNonce &&
    left.simulationPool === right.simulationPool &&
    left.gasEstimate === right.gasEstimate
  );
}

async function requestPair(
  stage: BscTestnetPtaWbnbPoolCoordinatorStage,
  primaryClient: BscTestnetPtaWbnbPoolRpcClient,
  corroboratorClient: BscTestnetPtaWbnbPoolRpcClient,
  request: BscTestnetPtaWbnbPoolRpcRequest
): Promise<readonly [unknown, unknown]> {
  try {
    return await Promise.all([primaryClient.request(request), corroboratorClient.request(request)]);
  } catch (error) {
    if (error instanceof RpcTransportFailure) {
      throw new CoordinatorFailure(stage, error.reason);
    }
    throw new CoordinatorFailure(stage, "rpc_request_failed");
  }
}

async function inStage<Value>(
  stage: BscTestnetPtaWbnbPoolCoordinatorStage,
  operation: () => Promise<Value>
): Promise<Value> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RpcTransportFailure) {
      throw new CoordinatorFailure(stage, error.reason);
    }
    throw new CoordinatorFailure(stage, "rpc_request_failed");
  }
}

function freezeEnvelope(
  body: BscTestnetPtaWbnbPoolInitializationEnvelopeBody
): BscTestnetPtaWbnbPoolInitializationEnvelope {
  const envelopeHash = deriveBscTestnetPtaWbnbPoolInitializationEnvelopeHash(body);
  return Object.freeze({ ...body, envelopeHash });
}

/**
 * Dependency-injected read-only core. It exists for deterministic tests and is not a package export.
 * It can only construct a non-authorizing envelope for the one pinned initializer transaction.
 */
export async function coordinateBscTestnetPtaWbnbPoolInitializationForTests(
  options: BscTestnetPtaWbnbPoolCoordinatorTestOptions
): Promise<BscTestnetPtaWbnbPoolCoordinatorResult> {
  let attemptedAt: string | null = null;
  let rpcReadPerformed = false;
  try {
    const inspectedOptions = inspectCoordinatorOptions(options);
    if (inspectedOptions === null) return blocked("input", "invalid_options", null, false);
    const started = validClock(inspectedOptions.now);
    if (started === null) return blocked("clock", "invalid_clock", null, false);
    attemptedAt = started.iso;
    rpcReadPerformed = true;

    const [primaryChainRaw, corroboratorChainRaw] = await requestPair(
      "chain",
      inspectedOptions.primaryClient,
      inspectedOptions.corroboratorClient,
      { method: "eth_chainId", params: [] }
    );
    const primaryChain = parseQuantity(primaryChainRaw);
    const corroboratorChain = parseQuantity(corroboratorChainRaw);
    if (primaryChain === null || corroboratorChain === null) {
      return blocked("chain", "malformed_rpc_response", attemptedAt, true);
    }
    if (
      primaryChain !== BigInt(BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID) ||
      corroboratorChain !== BigInt(BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID)
    ) {
      return blocked("chain", "chain_mismatch", attemptedAt, true);
    }

    const [primaryFinalizedHeadRaw, corroboratorFinalizedHeadRaw] = await requestPair(
      "block",
      inspectedOptions.primaryClient,
      inspectedOptions.corroboratorClient,
      { method: "eth_getBlockByNumber", params: ["finalized", false] }
    );
    const primaryFinalizedHead = parseBlock(primaryFinalizedHeadRaw);
    const corroboratorFinalizedHead = parseBlock(corroboratorFinalizedHeadRaw);
    if (primaryFinalizedHead === null || corroboratorFinalizedHead === null) {
      return blocked("block", "malformed_rpc_response", attemptedAt, true);
    }
    const commonFinalizedNumber =
      primaryFinalizedHead.number < corroboratorFinalizedHead.number
        ? primaryFinalizedHead.number
        : corroboratorFinalizedHead.number;
    const commonFinalizedNumberHex = `0x${commonFinalizedNumber.toString(16)}` as Hex;
    const [primaryBlockRaw, corroboratorBlockRaw] = await requestPair(
      "block",
      inspectedOptions.primaryClient,
      inspectedOptions.corroboratorClient,
      { method: "eth_getBlockByNumber", params: [commonFinalizedNumberHex, false] }
    );
    const primaryBlock = parseBlock(primaryBlockRaw);
    const corroboratorBlock = parseBlock(corroboratorBlockRaw);
    if (primaryBlock === null || corroboratorBlock === null) {
      return blocked("block", "malformed_rpc_response", attemptedAt, true);
    }
    if (
      primaryBlock.number !== commonFinalizedNumber ||
      corroboratorBlock.number !== commonFinalizedNumber ||
      !sameBlock(primaryBlock, corroboratorBlock)
    ) {
      return blocked("block", "provider_disagreement", attemptedAt, true);
    }
    if (
      (primaryFinalizedHead.number === commonFinalizedNumber &&
        !sameBlock(primaryFinalizedHead, primaryBlock)) ||
      (corroboratorFinalizedHead.number === commonFinalizedNumber &&
        !sameBlock(corroboratorFinalizedHead, corroboratorBlock))
    ) {
      return blocked("block", "provider_disagreement", attemptedAt, true);
    }

    const canonicalBlock = Object.freeze({
      blockHash: primaryBlock.hash,
      requireCanonical: true as const
    });

    const [primaryFinalized, corroboratorFinalized] = await inStage("identity", () =>
      Promise.all([
        finalizedState(inspectedOptions.primaryClient, canonicalBlock),
        finalizedState(inspectedOptions.corroboratorClient, canonicalBlock)
      ])
    );
    if (primaryFinalized === null || corroboratorFinalized === null) {
      return blocked("identity", "malformed_rpc_response", attemptedAt, true);
    }
    if (!sameFinalizedState(primaryFinalized, corroboratorFinalized)) {
      return blocked("identity", "provider_disagreement", attemptedAt, true);
    }
    const finalizedIssue = validateFinalizedState(primaryFinalized);
    if (finalizedIssue !== null) {
      const stage =
        finalizedIssue === "proxy_slot_nonzero" || finalizedIssue === "runtime_identity_mismatch"
          ? "identity"
          : finalizedIssue === "fee_tier_mismatch"
            ? "binding"
            : finalizedIssue === "pool_already_exists_or_raced"
              ? "race"
              : finalizedIssue === "sender_not_eoa"
                ? "account"
                : "binding";
      return blocked(stage, finalizedIssue, attemptedAt, true);
    }

    const [primaryCurrent, corroboratorCurrent] = await inStage("simulation", () =>
      Promise.all([
        currentState(inspectedOptions.primaryClient),
        currentState(inspectedOptions.corroboratorClient)
      ])
    );
    if (primaryCurrent === null || corroboratorCurrent === null) {
      return blocked("account", "malformed_rpc_response", attemptedAt, true);
    }
    if (!sameCurrentStateExceptGasPrice(primaryCurrent, corroboratorCurrent)) {
      return blocked("race", "provider_disagreement", attemptedAt, true);
    }
    if (
      primaryCurrent.latestNonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE ||
      primaryCurrent.pendingNonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE
    ) {
      return blocked("account", "nonce_mismatch", attemptedAt, true);
    }
    if (
      !addressEquals(primaryCurrent.latestPool, ZERO_ADDRESS) ||
      !addressEquals(primaryCurrent.pendingPool, ZERO_ADDRESS) ||
      primaryCurrent.pendingCandidateCode !== "0x" ||
      primaryCurrent.pendingCandidateNonce !== 0n
    ) {
      return blocked("race", "pool_already_exists_or_raced", attemptedAt, true);
    }
    if (!addressEquals(primaryCurrent.simulationPool, BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE)) {
      return blocked("simulation", "simulation_mismatch", attemptedAt, true);
    }

    const gasPrice =
      primaryCurrent.gasPrice > corroboratorCurrent.gasPrice
        ? primaryCurrent.gasPrice
        : corroboratorCurrent.gasPrice;
    const gasLimit = calculateBscTestnetPtaWbnbPoolGasLimit(primaryCurrent.gasEstimate);
    if (
      gasLimit === null ||
      gasLimit > primaryBlock.gasLimit ||
      gasPrice === 0n ||
      gasPrice > BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI
    ) {
      return blocked("simulation", "gas_cap_exceeded", attemptedAt, true);
    }
    const boundedMaximumCost = gasLimit * gasPrice;
    if (boundedMaximumCost > BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI) {
      return blocked("simulation", "gas_cap_exceeded", attemptedAt, true);
    }
    if (primaryCurrent.balance < boundedMaximumCost) {
      return blocked("account", "insufficient_balance", attemptedAt, true);
    }

    const completed = validClock(inspectedOptions.now);
    if (completed === null || completed.milliseconds < started.milliseconds) {
      return blocked("clock", "invalid_clock", attemptedAt, true);
    }
    attemptedAt = completed.iso;
    const blockMilliseconds = primaryBlock.timestamp * 1_000n;
    const completedMilliseconds = BigInt(completed.milliseconds);
    if (blockMilliseconds > completedMilliseconds) {
      return blocked("block", "future_block", attemptedAt, true);
    }
    if (
      completedMilliseconds - blockMilliseconds >
      BigInt(BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS * 1_000)
    ) {
      return blocked("block", "stale_block", attemptedAt, true);
    }

    const body: BscTestnetPtaWbnbPoolInitializationEnvelopeBody = Object.freeze({
      schemaVersion: 1 as const,
      operation: "create_and_initialize_exact_pta_wbnb_pancake_v3_pool_once" as const,
      chainId: "97" as const,
      transaction: Object.freeze({
        from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
        to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
        nonce: "1" as const,
        data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
        dataBytes: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_BYTES,
        dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
        selector: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
        valueWei: "0" as const,
        gasLimit: gasLimit.toString(),
        gasPriceWei: gasPrice.toString()
      }),
      initializer: Object.freeze({
        token0: BSC_TESTNET_PTA_ADDRESS,
        token1: BSC_TESTNET_WBNB_ADDRESS,
        fee: "500" as const,
        sqrtPriceX96:
          BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96.toString() as "79228162514264337593543950",
        expectedPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
        priceMeaning: "fixed_test_scenario_not_market_price_oracle_peg_or_valuation" as const
      }),
      observation: Object.freeze({
        observedAt: completed.iso,
        finalizedBlockNumber: primaryBlock.number.toString(),
        finalizedBlockHash: primaryBlock.hash,
        finalizedBlockTimestamp: primaryBlock.timestamp.toString(),
        latestNonce: "1" as const,
        pendingNonce: "1" as const,
        pendingPool: ZERO_ADDRESS,
        providerAgreementVerified: true as const,
        allRuntimeIdentitiesVerified: true as const,
        allEip1967SlotsZero: true as const,
        allProtocolBindingsVerified: true as const,
        feeTierVerified: true as const,
        simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
        gasEstimate: primaryCurrent.gasEstimate.toString()
      }),
      caps: Object.freeze({
        gasMarginBps: BSC_TESTNET_PTA_WBNB_POOL_GAS_MARGIN_BPS.toString() as "2000",
        maximumGasEstimate: BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE.toString() as "5000000",
        maximumGasLimit: BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT.toString() as "6000000",
        maximumGasPriceWei: BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI.toString() as "3000000000",
        maximumTotalCostWei:
          BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI.toString() as "18000000000000000",
        boundedMaximumCostWei: boundedMaximumCost.toString()
      }),
      expiresAt: new Date(
        completed.milliseconds + BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS * 1_000
      ).toISOString(),
      raceBoundary: Object.freeze({
        initializerHasNoDeadline: true as const,
        publicMempoolCanRace: true as const,
        sameNonceReplacementCanRace: true as const,
        freshPendingRecheckRequiredAfterDurableClaim: true as const,
        postReceiptPoolCreatedReconciliationRequired: true as const,
        envelopeDoesNotReservePoolAddress: true as const
      }),
      authorization: Object.freeze({
        signingReady: false as const,
        signingAuthorized: false as const,
        executionAuthorized: false as const,
        secretRead: false as const,
        signerCreated: false as const,
        signatureCreated: false as const,
        transactionSubmitted: false as const,
        blockchainWritePerformed: false as const
      })
    });

    return Object.freeze({
      status: "observed" as const,
      signingReady: false as const,
      attemptedAt: completed.iso,
      envelope: freezeEnvelope(body),
      boundary: boundary(true)
    });
  } catch (error) {
    if (error instanceof CoordinatorFailure) {
      return blocked(error.stage, error.reason, attemptedAt, rpcReadPerformed);
    }
    return blocked("envelope", "rpc_request_failed", attemptedAt, rpcReadPerformed);
  }
}

type TransportReason = "rpc_request_failed" | "rpc_timeout" | "rpc_response_too_large";

class RpcTransportFailure extends CoordinatorFailure {
  override readonly name = "RpcTransportFailure";

  constructor(reason: TransportReason) {
    super("chain", reason);
  }
}

/** Strict JSON-RPC response-envelope inspector exposed only for boundary tests. */
export function inspectBscTestnetPtaWbnbPoolRpcResponseForTests(
  value: unknown,
  expectedId: number
): unknown {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    const sortedKeys = (keys as string[]).sort();
    const expectedKeys = ["id", "jsonrpc", "result"];
    if (
      sortedKeys.length !== expectedKeys.length ||
      sortedKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
        throw new RpcTransportFailure("rpc_request_failed");
      }
    }
    if (descriptors.jsonrpc?.value !== "2.0" || descriptors.id?.value !== expectedId) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    return descriptors.result?.value;
  } catch (error) {
    if (error instanceof RpcTransportFailure) throw error;
    throw new RpcTransportFailure("rpc_request_failed");
  }
}

async function readBoundedResponse(response: Response): Promise<string> {
  if (response.status !== 200 || response.redirected) {
    throw new RpcTransportFailure("rpc_request_failed");
  }
  const contentType = response.headers.get("content-type");
  if (
    contentType === null ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType.trim())
  ) {
    throw new RpcTransportFailure("rpc_request_failed");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/u.test(contentLength)) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    if (BigInt(contentLength) > BigInt(MAX_RPC_RESPONSE_BYTES)) {
      throw new RpcTransportFailure("rpc_response_too_large");
    }
  }
  if (response.body === null) throw new RpcTransportFailure("rpc_request_failed");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let output = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RPC_RESPONSE_BYTES) {
        await reader.cancel();
        throw new RpcTransportFailure("rpc_response_too_large");
      }
      output += decoder.decode(chunk.value, { stream: true });
    }
    output += decoder.decode();
  } catch (error) {
    if (error instanceof RpcTransportFailure) throw error;
    throw new RpcTransportFailure("rpc_request_failed");
  } finally {
    reader.releaseLock();
  }
  if (output.length === 0) throw new RpcTransportFailure("rpc_request_failed");
  return output;
}

function createFixedFetchClient(
  origin:
    | typeof BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN
    | typeof BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN
): BscTestnetPtaWbnbPoolRpcClient {
  let requestId = 0;
  return {
    async request(request): Promise<unknown> {
      requestId += 1;
      const id = requestId;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new RpcTransportFailure("rpc_timeout"));
        }, RPC_REQUEST_TIMEOUT_MILLISECONDS);
        timer.unref?.();
      });
      const operation = (async () => {
        let response: Response;
        try {
          response = await globalThis.fetch(origin, {
            method: "POST",
            headers: Object.freeze({
              accept: "application/json",
              "content-type": "application/json"
            }),
            body: JSON.stringify({ jsonrpc: "2.0", id, ...request }),
            cache: "no-store",
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
            signal: controller.signal
          });
        } catch {
          if (controller.signal.aborted) throw new RpcTransportFailure("rpc_timeout");
          throw new RpcTransportFailure("rpc_request_failed");
        }
        const body = await readBoundedResponse(response);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body) as unknown;
        } catch {
          throw new RpcTransportFailure("rpc_request_failed");
        }
        return inspectBscTestnetPtaWbnbPoolRpcResponseForTests(parsed, id);
      })();
      try {
        return await Promise.race([operation, timeout]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  };
}

/**
 * Performs fixed-origin public reads only. This function never reads custody or environment state,
 * never creates a signer, and never sends a write RPC method.
 */
export async function prepareBscTestnetPtaWbnbPoolInitializationEnvelope(): Promise<BscTestnetPtaWbnbPoolCoordinatorResult> {
  return coordinateBscTestnetPtaWbnbPoolInitializationForTests({
    primaryClient: createFixedFetchClient(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN),
    corroboratorClient: createFixedFetchClient(BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN),
    now: () => new Date()
  });
}
