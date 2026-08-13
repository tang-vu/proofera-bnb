import "server-only";

import { isProxy } from "node:util/types";

import {
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  keccak256,
  toFunctionSelector,
  type Address,
  type Hex
} from "viem";

import {
  BSC_TESTNET_PANCAKE_V3_FACTORY,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_WBNB_ADDRESS
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_FINALITY_ANCESTRY_BLOCKS,
  type BscTestnetPtaWbnbPoolNormalizedAncestryHeader,
  type BscTestnetPtaWbnbPoolNormalizedBlock,
  type BscTestnetPtaWbnbPoolNormalizedLog,
  type BscTestnetPtaWbnbPoolNormalizedReceipt,
  type BscTestnetPtaWbnbPoolNormalizedTransaction,
  type BscTestnetPtaWbnbPoolPostState,
  type BscTestnetPtaWbnbPoolProviderReconciliationEvidence,
  type BscTestnetPtaWbnbPoolReconciliationEvidence,
  type BscTestnetPtaWbnbPoolSubmissionCapability
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";
import type {
  BscTestnetPtaWbnbPoolPostClaimRpcClient,
  BscTestnetPtaWbnbPoolPostClaimRpcRequest
} from "./bsc-testnet-pta-wbnb-pool-post-claim-recheck.server";

type RpcOrigin =
  | typeof BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN
  | typeof BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN;
type DataRecord = Readonly<Record<string, unknown>>;

const MAXIMUM_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MILLISECONDS = 8_000;
const MAXIMUM_BLOCK_TRANSACTIONS = 100_000;
const MAXIMUM_RECEIPT_LOGS = 64;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as const;
const BYTES = /^0x(?:[0-9a-f]{2})*$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/u;

const selector = (signature: string) => toFunctionSelector(signature);
const word = (value: bigint) => value.toString(16).padStart(64, "0");
const addressWord = (value: Address) => value.slice(2).toLowerCase().padStart(64, "0");
const GET_POOL = selector("getPool(address,address,uint24)");
const OBSERVATIONS = selector("observations(uint256)");

function getPoolData(first: Address, second: Address): Hex {
  return `${GET_POOL}${addressWord(first)}${addressWord(second)}${word(500n)}` as Hex;
}

const FORWARD_GET_POOL = getPoolData(BSC_TESTNET_PTA_ADDRESS, BSC_TESTNET_WBNB_ADDRESS);
const REVERSE_GET_POOL = getPoolData(BSC_TESTNET_WBNB_ADDRESS, BSC_TESTNET_PTA_ADDRESS);

function inspectRecord(input: unknown): DataRecord | null {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input) || isProxy(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(input).some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (
        descriptor.enumerable !== true ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        return null;
      }
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch {
    return null;
  }
}

function inspectArray(input: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (
      !Array.isArray(input) ||
      isProxy(input) ||
      Object.getPrototypeOf(input) !== Array.prototype ||
      input.length > maximum
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const expected = Array.from({ length: input.length }, (_unused, index) => String(index));
    const keys = Reflect.ownKeys(input).filter((key) => key !== "length");
    if (
      keys.some((key) => typeof key !== "string") ||
      keys.length !== expected.length ||
      expected.some((key) => !Object.hasOwn(descriptors, key))
    ) {
      return null;
    }
    return Object.freeze(
      expected.map((key) => {
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined
        ) {
          throw new TypeError("invalid array");
        }
        return descriptor.value;
      })
    );
  } catch {
    return null;
  }
}

function exactBytes(input: unknown, maximumBytes = 65_536): Hex | null {
  return typeof input === "string" && input.length <= 2 + maximumBytes * 2 && BYTES.test(input)
    ? (input as Hex)
    : null;
}

function exactBytes32(input: unknown): Hex | null {
  return typeof input === "string" && input.length === 66 && BYTES32.test(input)
    ? (input as Hex)
    : null;
}

function quantity(input: unknown): bigint | null {
  if (typeof input !== "string" || input.length > 66 || !QUANTITY.test(input)) return null;
  try {
    const parsed = BigInt(input);
    return parsed <= (1n << 256n) - 1n ? parsed : null;
  } catch {
    return null;
  }
}

function address(input: unknown): Address | null {
  if (typeof input !== "string" || input.length !== 42) return null;
  try {
    return getAddress(input);
  } catch {
    return null;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

async function readBoundedResponse(response: Response): Promise<unknown> {
  if (!response.ok || response.body === null) throw new Error("RPC_TRANSPORT_FAILED");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) throw new Error("RPC_TRANSPORT_FAILED");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM_RESPONSE_BYTES) throw new Error("RPC_RESPONSE_TOO_LARGE");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } finally {
    bytes.fill(0);
  }
}

const requestCounters = new Map<RpcOrigin, number>();

async function rpc(
  origin: RpcOrigin,
  method: string,
  params: readonly unknown[]
): Promise<unknown> {
  const id = (requestCounters.get(origin) ?? 0) + 1;
  requestCounters.set(origin, id);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MILLISECONDS);
  timer.unref?.();
  try {
    const response = await fetch(origin, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: Object.freeze({ accept: "application/json", "content-type": "application/json" }),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal
    });
    if (response.url !== origin && response.url !== `${origin}/`) {
      throw new Error("RPC_REDIRECTED");
    }
    const envelope = inspectRecord(await readBoundedResponse(response));
    if (
      envelope === null ||
      envelope.jsonrpc !== "2.0" ||
      envelope.id !== id ||
      Object.hasOwn(envelope, "error") ||
      !Object.hasOwn(envelope, "result")
    ) {
      throw new Error("RPC_RESPONSE_INVALID");
    }
    return envelope.result;
  } finally {
    clearTimeout(timer);
  }
}

function createClient(origin: RpcOrigin): BscTestnetPtaWbnbPoolPostClaimRpcClient {
  return Object.freeze({
    origin,
    request: (request: BscTestnetPtaWbnbPoolPostClaimRpcRequest) =>
      rpc(origin, request.method, request.params)
  });
}

/** Fixed official read clients; callers cannot inject or redirect an endpoint. */
export function createFixedOfficialBscTestnetPtaWbnbPoolPostClaimRpcClientsForInternalUse(): Readonly<{
  primaryClient: BscTestnetPtaWbnbPoolPostClaimRpcClient;
  corroboratorClient: BscTestnetPtaWbnbPoolPostClaimRpcClient;
}> {
  return Object.freeze({
    primaryClient: createClient(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN),
    corroboratorClient: createClient(BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN)
  });
}

function normalizeBlock(input: unknown): BscTestnetPtaWbnbPoolNormalizedBlock | null {
  const block = inspectRecord(input);
  const number = quantity(block?.number);
  const timestamp = quantity(block?.timestamp);
  const hash = exactBytes32(block?.hash);
  const parentHash = exactBytes32(block?.parentHash);
  const transactions = inspectArray(block?.transactions, MAXIMUM_BLOCK_TRANSACTIONS);
  if (
    block === null ||
    number === null ||
    timestamp === null ||
    hash === null ||
    parentHash === null ||
    transactions === null ||
    transactions.some((entry) => exactBytes32(entry) === null)
  ) {
    return null;
  }
  return Object.freeze({
    number: number.toString(),
    hash,
    parentHash,
    timestamp: timestamp.toString(),
    transactionHashes: Object.freeze(transactions as Hex[])
  });
}

function normalizeAncestryHeader(
  input: unknown
): BscTestnetPtaWbnbPoolNormalizedAncestryHeader | null {
  const block = inspectRecord(input);
  const number = quantity(block?.number);
  const timestamp = quantity(block?.timestamp);
  const hash = exactBytes32(block?.hash);
  const parentHash = exactBytes32(block?.parentHash);
  if (
    block === null ||
    number === null ||
    timestamp === null ||
    hash === null ||
    parentHash === null
  ) {
    return null;
  }
  return Object.freeze({
    number: number.toString(),
    hash,
    parentHash,
    timestamp: timestamp.toString()
  });
}

function normalizeTransaction(input: unknown): BscTestnetPtaWbnbPoolNormalizedTransaction | null {
  if (input === null) return null;
  const transaction = inspectRecord(input);
  const hash = exactBytes32(transaction?.hash);
  const chainId = quantity(transaction?.chainId);
  const nonce = quantity(transaction?.nonce);
  const value = quantity(transaction?.value);
  const gas = quantity(transaction?.gas);
  const gasPrice = quantity(transaction?.gasPrice);
  const from = address(transaction?.from);
  const to = address(transaction?.to);
  const inputData = exactBytes(transaction?.input, 512);
  const blockHash = transaction?.blockHash === null ? null : exactBytes32(transaction?.blockHash);
  const blockNumber = transaction?.blockNumber === null ? null : quantity(transaction?.blockNumber);
  const transactionIndex =
    transaction?.transactionIndex === null ? null : quantity(transaction?.transactionIndex);
  const minedNull = blockHash === null && blockNumber === null && transactionIndex === null;
  const minedComplete = blockHash !== null && blockNumber !== null && transactionIndex !== null;
  if (
    transaction === null ||
    transaction.type !== "0x0" ||
    hash === null ||
    chainId !== BigInt(BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID) ||
    nonce !== 1n ||
    value !== 0n ||
    gas === null ||
    gasPrice === null ||
    from !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
    inputData !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
    (!minedNull && !minedComplete)
  ) {
    return null;
  }
  return Object.freeze({
    hash,
    type: "legacy" as const,
    chainId: "97" as const,
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    nonce: "1" as const,
    valueWei: "0" as const,
    gasLimit: gas.toString(),
    gasPriceWei: gasPrice.toString(),
    input: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    blockHash,
    blockNumber: blockNumber?.toString() ?? null,
    transactionIndex: transactionIndex?.toString() ?? null
  });
}

function normalizeLog(input: unknown): BscTestnetPtaWbnbPoolNormalizedLog | null {
  const log = inspectRecord(input);
  const normalizedAddress = address(log?.address);
  const topics = inspectArray(log?.topics, 4);
  const data = exactBytes(log?.data, 128);
  const blockHash = exactBytes32(log?.blockHash);
  const blockNumber = quantity(log?.blockNumber);
  const transactionHash = exactBytes32(log?.transactionHash);
  const transactionIndex = quantity(log?.transactionIndex);
  const logIndex = quantity(log?.logIndex);
  if (
    log === null ||
    normalizedAddress === null ||
    topics === null ||
    topics.some((topic) => exactBytes32(topic) === null) ||
    data === null ||
    blockHash === null ||
    blockNumber === null ||
    transactionHash === null ||
    transactionIndex === null ||
    logIndex === null ||
    log.removed !== false
  ) {
    return null;
  }
  return Object.freeze({
    address: normalizedAddress,
    topics: Object.freeze(topics as Hex[]),
    data,
    blockHash,
    blockNumber: blockNumber.toString(),
    transactionHash,
    transactionIndex: transactionIndex.toString(),
    logIndex: logIndex.toString(),
    removed: false as const
  });
}

function normalizeReceipt(input: unknown): BscTestnetPtaWbnbPoolNormalizedReceipt | null {
  if (input === null) return null;
  const receipt = inspectRecord(input);
  const transactionHash = exactBytes32(receipt?.transactionHash);
  const transactionIndex = quantity(receipt?.transactionIndex);
  const blockHash = exactBytes32(receipt?.blockHash);
  const blockNumber = quantity(receipt?.blockNumber);
  const from = address(receipt?.from);
  const to = address(receipt?.to);
  const cumulativeGasUsed = quantity(receipt?.cumulativeGasUsed);
  const gasUsed = quantity(receipt?.gasUsed);
  const effectiveGasPrice = quantity(receipt?.effectiveGasPrice);
  const status = quantity(receipt?.status);
  const logsBloom = exactBytes(receipt?.logsBloom, 256);
  const logs = inspectArray(receipt?.logs, MAXIMUM_RECEIPT_LOGS);
  if (
    receipt === null ||
    transactionHash === null ||
    transactionIndex === null ||
    blockHash === null ||
    blockNumber === null ||
    from !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
    receipt.contractAddress !== null ||
    cumulativeGasUsed === null ||
    gasUsed === null ||
    effectiveGasPrice === null ||
    (status !== 0n && status !== 1n) ||
    receipt.type !== "0x0" ||
    logsBloom === null ||
    logsBloom.length !== 514 ||
    logs === null
  ) {
    return null;
  }
  const normalizedLogs: BscTestnetPtaWbnbPoolNormalizedLog[] = [];
  for (const entry of logs) {
    const normalized = normalizeLog(entry);
    if (normalized === null) return null;
    normalizedLogs.push(normalized);
  }
  return Object.freeze({
    transactionHash,
    transactionIndex: transactionIndex.toString(),
    blockHash,
    blockNumber: blockNumber.toString(),
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    contractAddress: null,
    cumulativeGasUsed: cumulativeGasUsed.toString(),
    gasUsed: gasUsed.toString(),
    effectiveGasPriceWei: effectiveGasPrice.toString(),
    status: status === 1n ? ("1" as const) : ("0" as const),
    type: "legacy" as const,
    logsBloom,
    logs: Object.freeze(normalizedLogs)
  });
}

function decodeAddressWord(input: unknown): Address | null {
  const value = exactBytes(input, 32);
  if (value === null || value.length !== 66) return null;
  try {
    return getAddress(decodeAbiParameters([{ type: "address" }], value)[0]);
  } catch {
    return null;
  }
}

function decodeUint(input: unknown, bits: 16 | 24 | 32 | 128 | 256): bigint | null {
  const value = exactBytes(input, 32);
  if (value === null || value.length !== 66) return null;
  try {
    return decodeAbiParameters([{ type: `uint${bits}` }], value)[0] as bigint;
  } catch {
    return null;
  }
}

function decodeInt(input: unknown, bits: 24 | 56): bigint | null {
  const value = exactBytes(input, 32);
  if (value === null || value.length !== 66) return null;
  try {
    return decodeAbiParameters([{ type: `int${bits}` }], value)[0] as bigint;
  } catch {
    return null;
  }
}

async function commonFinalized(origin: RpcOrigin): Promise<
  Readonly<{
    head: BscTestnetPtaWbnbPoolNormalizedBlock;
    rawHeadNumber: bigint;
  }>
> {
  const [chainRaw, headRaw] = await Promise.all([
    rpc(origin, "eth_chainId", []),
    rpc(origin, "eth_getBlockByNumber", ["finalized", false])
  ]);
  const chain = quantity(chainRaw);
  const head = normalizeBlock(headRaw);
  if (chain !== 97n || head === null) throw new Error("RPC_FINALIZED_INVALID");
  return Object.freeze({ head, rawHeadNumber: BigInt(head.number) });
}

function callObject(to: Address, data: Hex): Readonly<{ to: Address; data: Hex }> {
  return Object.freeze({ to, data });
}

async function postState(
  origin: RpcOrigin,
  block: BscTestnetPtaWbnbPoolNormalizedBlock
): Promise<BscTestnetPtaWbnbPoolPostState> {
  const state = Object.freeze({ blockHash: block.hash, requireCanonical: true as const });
  const calls = Object.freeze([
    rpc(origin, "eth_call", [callObject(BSC_TESTNET_PANCAKE_V3_FACTORY, FORWARD_GET_POOL), state]),
    rpc(origin, "eth_call", [callObject(BSC_TESTNET_PANCAKE_V3_FACTORY, REVERSE_GET_POOL), state]),
    rpc(origin, "eth_getTransactionCount", [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, state]),
    rpc(origin, "eth_getCode", [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, state]),
    rpc(origin, "eth_getStorageAt", [
      BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      IMPLEMENTATION_SLOT,
      state
    ]),
    rpc(origin, "eth_getStorageAt", [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, ADMIN_SLOT, state]),
    rpc(origin, "eth_getStorageAt", [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, BEACON_SLOT, state]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, selector("factory()")),
      state
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, selector("token0()")),
      state
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, selector("token1()")),
      state
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, selector("fee()")),
      state
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, selector("tickSpacing()")),
      state
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, selector("maxLiquidityPerTick()")),
      state
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, selector("liquidity()")),
      state
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, selector("lmPool()")),
      state
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, selector("slot0()")),
      state
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, `${OBSERVATIONS}${word(0n)}` as Hex),
      state
    ])
  ]);
  const raw = await Promise.all(calls);
  const forward = decodeAddressWord(raw[0]);
  const reverse = decodeAddressWord(raw[1]);
  const nonce = quantity(raw[2]);
  const code = exactBytes(raw[3], 32_768);
  const implementation = exactBytes32(raw[4]);
  const admin = exactBytes32(raw[5]);
  const beacon = exactBytes32(raw[6]);
  const factory = decodeAddressWord(raw[7]);
  const token0 = decodeAddressWord(raw[8]);
  const token1 = decodeAddressWord(raw[9]);
  const fee = decodeUint(raw[10], 24);
  const tickSpacing = decodeInt(raw[11], 24);
  const maximumLiquidity = decodeUint(raw[12], 128);
  const liquidity = decodeUint(raw[13], 128);
  const lmPool = decodeAddressWord(raw[14]);
  const slot0Bytes = exactBytes(raw[15], 224);
  const observationBytes = exactBytes(raw[16], 128);
  if (
    forward === null ||
    reverse === null ||
    nonce === null ||
    code === null ||
    implementation === null ||
    admin === null ||
    beacon === null ||
    factory === null ||
    token0 === null ||
    token1 === null ||
    fee === null ||
    tickSpacing === null ||
    maximumLiquidity === null ||
    liquidity === null ||
    lmPool === null ||
    slot0Bytes === null ||
    observationBytes === null
  ) {
    throw new Error("RPC_POST_STATE_INVALID");
  }
  let slot0: readonly [bigint, number, number, number, number, number, boolean];
  let observation: readonly [number, bigint, bigint, boolean];
  try {
    slot0 = decodeAbiParameters(
      [
        { type: "uint160" },
        { type: "int24" },
        { type: "uint16" },
        { type: "uint16" },
        { type: "uint16" },
        { type: "uint32" },
        { type: "bool" }
      ],
      slot0Bytes
    );
    observation = decodeAbiParameters(
      [{ type: "uint32" }, { type: "int56" }, { type: "uint160" }, { type: "bool" }],
      observationBytes
    );
  } catch {
    throw new Error("RPC_POST_STATE_INVALID");
  }
  if (slot0[6] !== true || observation[3] !== true) {
    throw new Error("RPC_POST_STATE_INVALID");
  }
  return Object.freeze({
    eip1898Block: state,
    factoryPoolForward: forward as typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
    factoryPoolReverse: reverse as typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
    poolAccountNonce: nonce.toString() as "1",
    poolRuntimeCode: code,
    eip1967Slots: Object.freeze({ implementation, admin, beacon }),
    pool: Object.freeze({
      factory: factory as typeof BSC_TESTNET_PANCAKE_V3_FACTORY,
      token0: token0 as typeof BSC_TESTNET_PTA_ADDRESS,
      token1: token1 as typeof BSC_TESTNET_WBNB_ADDRESS,
      fee: fee.toString() as "500",
      tickSpacing: tickSpacing.toString() as "10",
      maxLiquidityPerTick: maximumLiquidity.toString() as "1917569901783203986719870431555990",
      liquidity: liquidity.toString() as "0",
      lmPool: lmPool as typeof ZERO_ADDRESS,
      slot0: Object.freeze({
        sqrtPriceX96: slot0[0].toString() as "79228162514264337593543950",
        tick: slot0[1].toString() as "-138163",
        observationIndex: slot0[2].toString() as "0",
        observationCardinality: slot0[3].toString() as "1",
        observationCardinalityNext: slot0[4].toString() as "1",
        feeProtocol: slot0[5].toString() as "222825800",
        unlocked: true as const
      }),
      observation0: Object.freeze({
        blockTimestamp: observation[0].toString(),
        tickCumulative: observation[1].toString() as "0",
        secondsPerLiquidityCumulativeX128: observation[2].toString() as "0",
        initialized: true as const
      })
    })
  });
}

export interface BscTestnetPtaWbnbPoolProductionPreSubmissionInput {
  readonly transactionHash: Hex;
  readonly gasLimit: string;
  readonly gasPriceWei: string;
}

async function providerPreflight(
  origin: RpcOrigin,
  input: BscTestnetPtaWbnbPoolProductionPreSubmissionInput
): Promise<
  Readonly<{
    head: BscTestnetPtaWbnbPoolNormalizedBlock;
    commonBlock: BscTestnetPtaWbnbPoolNormalizedBlock;
    transaction: unknown;
    receipt: unknown;
    latestNonce: bigint;
    pendingNonce: bigint;
    forwardLatest: Address;
    forwardPending: Address;
    reverseLatest: Address;
    reversePending: Address;
    candidateCodeLatest: Hex;
    candidateCodePending: Hex;
    candidateNonceLatest: bigint;
    candidateNoncePending: bigint;
    senderCodeLatest: Hex;
    senderCodePending: Hex;
    balance: bigint;
    gasPrice: bigint;
    simulation: Address;
    gasEstimate: bigint;
  }>
> {
  const finalized = await commonFinalized(origin);
  const commonNumber = `0x${finalized.rawHeadNumber.toString(16)}` as Hex;
  const commonBlock = normalizeBlock(
    await rpc(origin, "eth_getBlockByNumber", [commonNumber, false])
  );
  if (commonBlock === null || !sameJson(finalized.head, commonBlock)) {
    throw new Error("RPC_FINALIZED_INVALID");
  }
  const call = Object.freeze({
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    value: "0x0" as const,
    gas: `0x${BigInt(input.gasLimit).toString(16)}` as Hex,
    gasPrice: `0x${BigInt(input.gasPriceWei).toString(16)}` as Hex
  });
  const raw = await Promise.all([
    rpc(origin, "eth_getTransactionByHash", [input.transactionHash]),
    rpc(origin, "eth_getTransactionReceipt", [input.transactionHash]),
    rpc(origin, "eth_getTransactionCount", [BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest"]),
    rpc(origin, "eth_getTransactionCount", [BSC_TESTNET_PTA_WBNB_POOL_SENDER, "pending"]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PANCAKE_V3_FACTORY, FORWARD_GET_POOL),
      "latest"
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PANCAKE_V3_FACTORY, FORWARD_GET_POOL),
      "pending"
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PANCAKE_V3_FACTORY, REVERSE_GET_POOL),
      "latest"
    ]),
    rpc(origin, "eth_call", [
      callObject(BSC_TESTNET_PANCAKE_V3_FACTORY, REVERSE_GET_POOL),
      "pending"
    ]),
    rpc(origin, "eth_getCode", [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, "latest"]),
    rpc(origin, "eth_getCode", [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, "pending"]),
    rpc(origin, "eth_getTransactionCount", [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, "latest"]),
    rpc(origin, "eth_getTransactionCount", [BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, "pending"]),
    rpc(origin, "eth_getCode", [BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest"]),
    rpc(origin, "eth_getCode", [BSC_TESTNET_PTA_WBNB_POOL_SENDER, "pending"]),
    rpc(origin, "eth_getBalance", [BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest"]),
    rpc(origin, "eth_gasPrice", []),
    rpc(origin, "eth_call", [call, "pending"]),
    rpc(origin, "eth_estimateGas", [call])
  ]);
  const parsed = Object.freeze({
    head: finalized.head,
    commonBlock,
    transaction: raw[0],
    receipt: raw[1],
    latestNonce: quantity(raw[2]),
    pendingNonce: quantity(raw[3]),
    forwardLatest: decodeAddressWord(raw[4]),
    forwardPending: decodeAddressWord(raw[5]),
    reverseLatest: decodeAddressWord(raw[6]),
    reversePending: decodeAddressWord(raw[7]),
    candidateCodeLatest: exactBytes(raw[8]),
    candidateCodePending: exactBytes(raw[9]),
    candidateNonceLatest: quantity(raw[10]),
    candidateNoncePending: quantity(raw[11]),
    senderCodeLatest: exactBytes(raw[12]),
    senderCodePending: exactBytes(raw[13]),
    balance: quantity(raw[14]),
    gasPrice: quantity(raw[15]),
    simulation: decodeAddressWord(raw[16]),
    gasEstimate: quantity(raw[17])
  });
  if (
    Object.entries(parsed).some(
      ([key, value]) => key !== "transaction" && key !== "receipt" && value === null
    )
  ) {
    throw new Error("RPC_PREFLIGHT_INVALID");
  }
  return parsed as unknown as Awaited<ReturnType<typeof providerPreflight>>;
}

/** Fresh dual-provider proof required immediately before durable submission_started. */
export async function acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse(
  input: BscTestnetPtaWbnbPoolProductionPreSubmissionInput
): Promise<BscTestnetPtaWbnbPoolSubmissionCapability["preSubmission"]> {
  const [primaryHead, corroboratorHead] = await Promise.all([
    commonFinalized(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN),
    commonFinalized(BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN)
  ]);
  const commonNumber =
    primaryHead.rawHeadNumber < corroboratorHead.rawHeadNumber
      ? primaryHead.rawHeadNumber
      : corroboratorHead.rawHeadNumber;
  const commonHex = `0x${commonNumber.toString(16)}` as Hex;
  const [primaryCommonRaw, corroboratorCommonRaw] = await Promise.all([
    rpc(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN, "eth_getBlockByNumber", [commonHex, false]),
    rpc(BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN, "eth_getBlockByNumber", [
      commonHex,
      false
    ])
  ]);
  const primaryCommon = normalizeBlock(primaryCommonRaw);
  const corroboratorCommon = normalizeBlock(corroboratorCommonRaw);
  if (
    primaryCommon === null ||
    corroboratorCommon === null ||
    !sameJson(primaryCommon, corroboratorCommon) ||
    (primaryHead.rawHeadNumber === commonNumber && !sameJson(primaryHead.head, primaryCommon)) ||
    (corroboratorHead.rawHeadNumber === commonNumber &&
      !sameJson(corroboratorHead.head, corroboratorCommon))
  ) {
    throw new Error("RPC_PROVIDER_DISAGREEMENT");
  }
  const [primary, corroborator] = await Promise.all([
    providerPreflight(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN, input),
    providerPreflight(BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN, input)
  ]);
  const comparable = (value: Awaited<ReturnType<typeof providerPreflight>>) =>
    Object.freeze({
      transaction: value.transaction,
      receipt: value.receipt,
      latestNonce: value.latestNonce.toString(),
      pendingNonce: value.pendingNonce.toString(),
      forwardLatest: value.forwardLatest,
      forwardPending: value.forwardPending,
      reverseLatest: value.reverseLatest,
      reversePending: value.reversePending,
      candidateCodeLatest: value.candidateCodeLatest,
      candidateCodePending: value.candidateCodePending,
      candidateNonceLatest: value.candidateNonceLatest.toString(),
      candidateNoncePending: value.candidateNoncePending.toString(),
      senderCodeLatest: value.senderCodeLatest,
      senderCodePending: value.senderCodePending,
      balance: value.balance.toString(),
      gasPrice: value.gasPrice.toString(),
      simulation: value.simulation,
      gasEstimate: value.gasEstimate.toString()
    });
  if (!sameJson(comparable(primary), comparable(corroborator))) {
    throw new Error("RPC_PROVIDER_DISAGREEMENT");
  }
  if (
    primary.transaction !== null ||
    primary.receipt !== null ||
    primary.latestNonce !== 1n ||
    primary.pendingNonce !== 1n ||
    primary.forwardLatest !== ZERO_ADDRESS ||
    primary.forwardPending !== ZERO_ADDRESS ||
    primary.reverseLatest !== ZERO_ADDRESS ||
    primary.reversePending !== ZERO_ADDRESS ||
    primary.candidateCodeLatest !== "0x" ||
    primary.candidateCodePending !== "0x" ||
    primary.candidateNonceLatest !== 0n ||
    primary.candidateNoncePending !== 0n ||
    primary.senderCodeLatest !== "0x" ||
    primary.senderCodePending !== "0x" ||
    primary.simulation !== BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
  ) {
    throw new Error("RPC_PRE_SUBMISSION_RACE");
  }
  const observedAt = new Date().toISOString();
  return Object.freeze({
    primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
    corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
    providerAgreementVerified: true,
    canonicalFinalizedBlockVerified: true,
    finalizedAnchorDualProviderExactNumberVerified: true,
    observedAt,
    finalizedBlockNumber: primaryCommon.number,
    finalizedBlockHash: primaryCommon.hash,
    finalizedBlockTimestamp: primaryCommon.timestamp,
    finalizedBlockGasLimit: (() => {
      const raw = inspectRecord(primaryCommonRaw);
      const gasLimit = quantity(raw?.gasLimit);
      if (gasLimit === null) throw new Error("RPC_FINALIZED_INVALID");
      return gasLimit.toString();
    })(),
    latestNonce: "1",
    pendingNonce: "1",
    transactionByHash: null,
    receiptByHash: null,
    factoryPoolForward: ZERO_ADDRESS,
    factoryPoolReverse: ZERO_ADDRESS,
    candidateCode: "0x",
    candidateNonce: "0",
    senderCode: "0x",
    senderBalanceWei: primary.balance.toString(),
    gasEstimate: primary.gasEstimate.toString(),
    gasPriceWei: primary.gasPrice.toString(),
    simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
  });
}

/**
 * Non-executable broadcaster boundary. The fixed read adapters are retained for review, but this
 * release has no production one-consume authority bridge and therefore cannot send raw bytes.
 */
export async function sendExactBscTestnetPtaWbnbPoolRawTransactionOnceForInternalUse(
  signedTransaction: Hex
): Promise<unknown> {
  void signedTransaction;
  throw new Error("PRODUCTION_AUTHORIZATION_UNAVAILABLE");
}

async function providerObservation(
  origin: RpcOrigin,
  transactionHash: Hex,
  reportedHead: BscTestnetPtaWbnbPoolNormalizedBlock
): Promise<BscTestnetPtaWbnbPoolProviderReconciliationEvidence> {
  const [transactionRaw, receiptRaw] = await Promise.all([
    rpc(origin, "eth_getTransactionByHash", [transactionHash]),
    rpc(origin, "eth_getTransactionReceipt", [transactionHash])
  ]);
  const transaction = transactionRaw === null ? null : normalizeTransaction(transactionRaw);
  const receipt = receiptRaw === null ? null : normalizeReceipt(receiptRaw);
  if (
    (transactionRaw !== null && transaction === null) ||
    (receiptRaw !== null && receipt === null)
  ) {
    throw new Error("RPC_OBSERVATION_INVALID");
  }
  let receiptBlock: BscTestnetPtaWbnbPoolNormalizedBlock | null = null;
  let receiptBlockLookup: BscTestnetPtaWbnbPoolProviderReconciliationEvidence["receiptBlockLookup"] =
    null;
  let commonFinalizedBlock: BscTestnetPtaWbnbPoolNormalizedBlock | null = null;
  let checkpointBlockRecheck: BscTestnetPtaWbnbPoolNormalizedBlock | null = null;
  let checkpointCanonicalAttestation: BscTestnetPtaWbnbPoolProviderReconciliationEvidence["checkpointCanonicalAttestation"] =
    null;
  let retainedPostState: BscTestnetPtaWbnbPoolPostState | null = null;
  let receiptToCommonFinalizedAncestry: readonly BscTestnetPtaWbnbPoolNormalizedAncestryHeader[] =
    Object.freeze([]);
  if (receipt !== null) {
    const numberHex = `0x${BigInt(receipt.blockNumber).toString(16)}` as Hex;
    receiptBlock = normalizeBlock(await rpc(origin, "eth_getBlockByNumber", [numberHex, false]));
    if (receiptBlock === null) throw new Error("RPC_OBSERVATION_INVALID");
    receiptBlockLookup = Object.freeze({
      method: "eth_getBlockByNumber" as const,
      requestedBlockNumber: receipt.blockNumber,
      includeFullTransactions: false as const,
      exactNumberCanonicalLookup: true as const
    });
    const receiptNumber = BigInt(receipt.blockNumber);
    const checkpointNumber =
      receiptNumber + BigInt(BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_FINALITY_ANCESTRY_BLOCKS);
    if (checkpointNumber > (1n << 256n) - 1n) {
      throw new Error("RPC_FINALITY_CHECKPOINT_INVALID");
    }
    if (BigInt(reportedHead.number) >= checkpointNumber) {
      const rawAncestry = await Promise.all(
        Array.from(
          { length: BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_FINALITY_ANCESTRY_BLOCKS },
          (_unused, index) => {
            const number = receiptNumber + BigInt(index) + 1n;
            return rpc(origin, "eth_getBlockByNumber", [`0x${number.toString(16)}`, false]);
          }
        )
      );
      const normalizedAncestry = rawAncestry.map((entry) => normalizeAncestryHeader(entry));
      if (normalizedAncestry.some((entry) => entry === null)) {
        throw new Error("RPC_FINALITY_ANCESTRY_INVALID");
      }
      const checkpointRaw = rawAncestry.at(-1);
      commonFinalizedBlock = normalizeBlock(checkpointRaw);
      if (
        commonFinalizedBlock === null ||
        BigInt(commonFinalizedBlock.number) !== checkpointNumber
      ) {
        throw new Error("RPC_FINALITY_CHECKPOINT_INVALID");
      }
      receiptToCommonFinalizedAncestry = Object.freeze(
        normalizedAncestry as BscTestnetPtaWbnbPoolNormalizedAncestryHeader[]
      );
      if (receipt.status === "1") {
        retainedPostState = await postState(origin, receiptBlock);
      }
      checkpointBlockRecheck = normalizeBlock(
        await rpc(origin, "eth_getBlockByNumber", [`0x${checkpointNumber.toString(16)}`, false])
      );
      if (
        checkpointBlockRecheck === null ||
        !sameJson(commonFinalizedBlock, checkpointBlockRecheck)
      ) {
        throw new Error("RPC_FINALITY_CHECKPOINT_CHANGED");
      }
    }
  }
  const recheckedFinalized = await commonFinalized(origin);
  if (
    recheckedFinalized.rawHeadNumber < BigInt(reportedHead.number) ||
    (recheckedFinalized.rawHeadNumber === BigInt(reportedHead.number) &&
      !sameJson(reportedHead, recheckedFinalized.head)) ||
    (commonFinalizedBlock !== null &&
      recheckedFinalized.rawHeadNumber < BigInt(commonFinalizedBlock.number))
  ) {
    throw new Error("RPC_FINALIZED_HEAD_CHANGED");
  }
  if (commonFinalizedBlock !== null) {
    const checkpointState = Object.freeze({
      blockHash: commonFinalizedBlock.hash,
      requireCanonical: true as const
    });
    const checkpointBalance = quantity(
      await rpc(origin, "eth_getBalance", [ZERO_ADDRESS, checkpointState])
    );
    if (checkpointBalance === null) {
      throw new Error("RPC_FINALITY_CANONICAL_ATTESTATION_INVALID");
    }
    checkpointCanonicalAttestation = Object.freeze({
      method: "eth_getBalance" as const,
      address: ZERO_ADDRESS,
      eip1898Block: checkpointState,
      resultWei: checkpointBalance.toString()
    });
  }
  return Object.freeze({
    origin,
    chainId: "97",
    transaction,
    receipt,
    reportedFinalizedHead: reportedHead,
    recheckedFinalizedHead: recheckedFinalized.head,
    commonFinalizedBlock,
    checkpointBlockRecheck,
    checkpointCanonicalAttestation,
    receiptBlockLookup,
    receiptBlock,
    receiptToCommonFinalizedAncestry,
    postState: retainedPostState
  });
}

/** Dual-provider normalized evidence only; the strict reconciler decides pending/terminal validity. */
export async function observeExactBscTestnetPtaWbnbPoolTransactionForInternalUse(
  transactionHash: Hex
): Promise<BscTestnetPtaWbnbPoolReconciliationEvidence> {
  const [primaryHead, corroboratorHead] = await Promise.all([
    commonFinalized(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN),
    commonFinalized(BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN)
  ]);
  const [primary, corroborator] = await Promise.all([
    providerObservation(
      BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
      transactionHash,
      primaryHead.head
    ),
    providerObservation(
      BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
      transactionHash,
      corroboratorHead.head
    )
  ]);
  return Object.freeze({
    schemaVersion: 1,
    operation: "reconcile_exact_bsc_testnet_pta_wbnb_pool_initialization",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    transactionHash,
    observedAt: new Date().toISOString(),
    primary,
    corroborator
  });
}

/** Public-integrity helper used by the authority challenge, never an authority by itself. */
export function deriveBscTestnetPtaWbnbPoolReviewDecisionDigestForInternalUse(
  canonicalDecision: string
): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "string" }],
      ["proofera.bsc-testnet.pta-wbnb.owner-designated-multi-agent-review.v1", canonicalDecision]
    )
  );
}
