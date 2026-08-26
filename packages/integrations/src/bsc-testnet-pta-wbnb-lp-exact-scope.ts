import { calculatePancakeV3LiquidityQuote } from "@proofera/domain/pancake-v3-liquidity-quote";
import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  hexToBigInt,
  isAddressEqual,
  keccak256,
  parseAbi,
  sha256,
  stringToHex,
  toHex,
  type Address,
  type Hex
} from "viem";

export const BSC_TESTNET_PTA_WBNB_LP_SCOPE_SCHEMA_VERSION = 1 as const;
export const BSC_TESTNET_PTA_WBNB_LP_POLICY_ID =
  "ProofEra:bsc-testnet-pta-wbnb-first-lp-exact-scope:v1" as const;
export const BSC_TESTNET_PTA_WBNB_LP_POOL_RUNTIME_BYTES = 22_962 as const;
export const BSC_TESTNET_PTA_WBNB_LP_POOL_RUNTIME_KECCAK256 =
  "0xc7187b6ca08de7a5856f7725d15e39a534b27a964fdc445abfd7663041b0e69d" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW = 1_000n * 10n ** 18n;
export const BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI = 10n ** 15n;
export const BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER = -887_270 as const;
export const BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER = 887_270 as const;
export const BSC_TESTNET_PTA_WBNB_LP_SLIPPAGE_BPS = 0 as const;
export const BSC_TESTNET_PTA_WBNB_LP_SCOPE_LIFETIME_SECONDS = 120 as const;
export const BSC_TESTNET_PTA_WBNB_LP_DEADLINE_SECONDS = 900 as const;
export const BSC_TESTNET_PTA_WBNB_LP_MAX_BLOCK_AGE_SECONDS = 120 as const;
export const BSC_TESTNET_PTA_WBNB_LP_GAS_MARGIN_BPS = 2_000 as const;
export const BSC_TESTNET_PTA_WBNB_LP_MAX_GAS_PRICE_WEI = 300_000_000n;
export const BSC_TESTNET_PTA_WBNB_LP_MAX_APPROVAL_GAS = 100_000n;
export const BSC_TESTNET_PTA_WBNB_LP_MAX_MINT_GAS = 800_000n;

const RPC_TIMEOUT_MILLISECONDS = 15_000;
const MAX_RPC_RESPONSE_BYTES = 1_048_576;
const UINT256_MAX = (1n << 256n) - 1n;
const ZERO_WORD = `0x${"0".repeat(64)}` as const satisfies Hex;
const EXPECTED_CURRENT_TICK = -138_163;
const PTA_ALLOWANCES_STORAGE_SLOT = 1n;

// These exact values deliberately mirror the independently reviewed initializer envelope. Keeping
// this read-only LP surface self-contained lets Node execute it without loading any custody or
// initializer submission module.
const BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID = 97 as const;
const BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN =
  "https://bsc-testnet-dataseed.bnbchain.org" as const;
const BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN =
  "https://bsc-testnet.bnbchain.org" as const;
const BSC_TESTNET_PTA_WBNB_POOL_SENDER =
  "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49" as const satisfies Address;
const BSC_TESTNET_PTA_ADDRESS =
  "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc" as const satisfies Address;
const BSC_TESTNET_WBNB_ADDRESS =
  "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd" as const satisfies Address;
const BSC_TESTNET_PANCAKE_V3_FACTORY =
  "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as const satisfies Address;
const BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER =
  "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9" as const satisfies Address;
const BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER =
  "0x427bF5b37357632377eCbEC9de3626C71A5396c1" as const satisfies Address;
const BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE =
  "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE" as const satisfies Address;
const BSC_TESTNET_PTA_WBNB_POOL_FEE = 500 as const;
const BSC_TESTNET_PTA_WBNB_POOL_TICK_SPACING = 10 as const;
const BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96 = 79_228_162_514_264_337_593_543_950n;
const BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES = Object.freeze({
  pta: Object.freeze({
    byteLength: 1_826,
    runtimeKeccak256: "0x2f8caecd2e51f085ab11a67e5b8a89eeab7b667bd89ec708a481b66ed756e006" as Hex
  }),
  wbnb: Object.freeze({
    byteLength: 3_124,
    runtimeKeccak256: "0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6" as Hex
  }),
  factory: Object.freeze({
    byteLength: 5_151,
    runtimeKeccak256: "0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c" as Hex
  }),
  poolDeployer: Object.freeze({
    byteLength: 24_556,
    runtimeKeccak256: "0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b" as Hex
  }),
  positionManager: Object.freeze({
    byteLength: 24_466,
    runtimeKeccak256: "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7" as Hex
  })
});

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)"
]);
const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint32 feeProtocol,bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
  "function factory() view returns (address)"
]);
const FACTORY_ABI = parseAbi([
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address)",
  "function feeAmountTickSpacing(uint24 fee) view returns (int24)"
]);
const MANAGER_ABI = parseAbi([
  "function factory() view returns (address)",
  "function WETH9() view returns (address)",
  "function deployer() view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
]);

type JsonRpcMethod =
  | "eth_blockNumber"
  | "eth_call"
  | "eth_chainId"
  | "eth_estimateGas"
  | "eth_gasPrice"
  | "eth_getBalance"
  | "eth_getBlockByNumber"
  | "eth_getCode"
  | "eth_getStorageAt"
  | "eth_getTransactionCount";

export interface BscTestnetPtaWbnbLpRpcClient {
  readonly label: "primary" | "corroborator";
  readonly origin: string;
  request(method: JsonRpcMethod, params: readonly unknown[]): Promise<unknown>;
}

interface RpcBlock {
  readonly number: bigint;
  readonly hash: Hex;
  readonly timestamp: bigint;
}

interface ContractIdentity {
  readonly address: Address;
  readonly byteLength: number;
  readonly runtimeKeccak256: Hex;
  readonly eip1967: {
    readonly implementation: Hex;
    readonly admin: Hex;
    readonly beacon: Hex;
  };
}

interface ProviderObservation {
  readonly provider: "primary" | "corroborator";
  readonly rpcOrigin: string;
  readonly chainId: number;
  readonly tipBlockNumber: string;
  readonly block: {
    readonly number: string;
    readonly hash: Hex;
    readonly timestampUnix: string;
    readonly timestampUtc: string;
  };
  readonly sender: {
    readonly nativeBalanceWei: string;
    readonly ptaBalanceRaw: string;
    readonly wbnbBalanceRaw: string;
    readonly ptaAllowanceToManagerRaw: string;
    readonly wbnbAllowanceToManagerRaw: string;
    readonly commonBlockNonce: string;
    readonly pendingNonce: string;
    readonly managerNftBalance: string;
  };
  readonly tokens: {
    readonly ptaDecimals: number;
    readonly ptaSymbol: string;
    readonly ptaTotalSupplyRaw: string;
    readonly wbnbDecimals: number;
    readonly wbnbSymbol: string;
  };
  readonly pool: {
    readonly sqrtPriceX96: string;
    readonly currentTick: number;
    readonly observationIndex: number;
    readonly observationCardinality: number;
    readonly observationCardinalityNext: number;
    readonly feeProtocol: number;
    readonly unlocked: boolean;
    readonly liquidityRaw: string;
    readonly token0: Address;
    readonly token1: Address;
    readonly fee: number;
    readonly tickSpacing: number;
    readonly factory: Address;
  };
  readonly relations: {
    readonly factoryPool: Address;
    readonly factoryTickSpacing: number;
    readonly managerFactory: Address;
    readonly managerWeth9: Address;
    readonly managerDeployer: Address;
  };
  readonly gasPriceWei: string;
  readonly contracts: readonly ContractIdentity[];
}

export interface PrepareBscTestnetPtaWbnbLpExactScopeOptions {
  readonly primary: BscTestnetPtaWbnbLpRpcClient;
  readonly corroborator: BscTestnetPtaWbnbLpRpcClient;
  readonly now: () => Date;
  readonly sourceCommit: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dataHex(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/u.test(value)) {
    throw new Error(`${label} was not canonical even-length RPC hex data.`);
  }
  return value.toLowerCase() as Hex;
}

function quantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/u.test(value)) {
    throw new Error(`${label} was not a canonical RPC quantity.`);
  }
  const parsed = hexToBigInt(value as Hex);
  if (parsed > UINT256_MAX) throw new Error(`${label} exceeded uint256.`);
  return parsed;
}

function rpcBlock(value: unknown): RpcBlock {
  if (!isRecord(value)) throw new Error("RPC block was missing or malformed.");
  const number = quantity(value.number, "block.number");
  const timestamp = quantity(value.timestamp, "block.timestamp");
  const hash = dataHex(value.hash, "block.hash");
  if (hash.length !== 66) throw new Error("RPC block hash was not 32 bytes.");
  return { number, hash, timestamp };
}

function exactDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${label} was not a valid clock value.`);
  }
  return new Date(value.getTime());
}

function canonicalSourceCommit(value: string): string {
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error("Source commit must be one exact lowercase 40-hex Git object ID.");
  }
  return value;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function marginGas(estimate: bigint, maximum: bigint, label: string): bigint {
  if (estimate <= 0n) throw new Error(`${label} gas estimate was zero.`);
  const limit =
    (estimate * (10_000n + BigInt(BSC_TESTNET_PTA_WBNB_LP_GAS_MARGIN_BPS)) + 9_999n) / 10_000n;
  if (limit > maximum) throw new Error(`${label} gas estimate exceeded its reviewed cap.`);
  return limit;
}

function sameObservation(left: ProviderObservation, right: ProviderObservation): boolean {
  const stripProvider = (value: ProviderObservation) => ({
    ...value,
    provider: null,
    rpcOrigin: null,
    tipBlockNumber: null
  });
  return stableJson(stripProvider(left)) === stableJson(stripProvider(right));
}

function expectedIdentity(address: Address): { readonly byteLength: number; readonly hash: Hex } {
  if (isAddressEqual(address, BSC_TESTNET_PTA_ADDRESS)) {
    return {
      byteLength: BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES.pta.byteLength,
      hash: BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES.pta.runtimeKeccak256
    };
  }
  if (isAddressEqual(address, BSC_TESTNET_WBNB_ADDRESS)) {
    return {
      byteLength: BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES.wbnb.byteLength,
      hash: BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES.wbnb.runtimeKeccak256
    };
  }
  if (isAddressEqual(address, BSC_TESTNET_PANCAKE_V3_FACTORY)) {
    return {
      byteLength: BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES.factory.byteLength,
      hash: BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES.factory.runtimeKeccak256
    };
  }
  if (isAddressEqual(address, BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER)) {
    return {
      byteLength: BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES.poolDeployer.byteLength,
      hash: BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES.poolDeployer.runtimeKeccak256
    };
  }
  if (isAddressEqual(address, BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER)) {
    return {
      byteLength: BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES.positionManager.byteLength,
      hash: BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES.positionManager.runtimeKeccak256
    };
  }
  if (isAddressEqual(address, BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE)) {
    return {
      byteLength: BSC_TESTNET_PTA_WBNB_LP_POOL_RUNTIME_BYTES,
      hash: BSC_TESTNET_PTA_WBNB_LP_POOL_RUNTIME_KECCAK256
    };
  }
  throw new Error("Unexpected contract identity address.");
}

function verifiedEip1967Slots(): Readonly<{
  implementation: Hex;
  admin: Hex;
  beacon: Hex;
}> {
  const slot = (label: string): Hex =>
    toHex(BigInt(keccak256(stringToHex(label))) - 1n, { size: 32 });
  return Object.freeze({
    implementation: slot("eip1967.proxy.implementation"),
    admin: slot("eip1967.proxy.admin"),
    beacon: slot("eip1967.proxy.beacon")
  });
}

const VERIFIED_EIP1967_SLOTS = verifiedEip1967Slots();

async function contractCall(
  client: BscTestnetPtaWbnbLpRpcClient,
  target: Address,
  data: Hex,
  blockTag: Hex,
  stateOverride?: Readonly<Record<string, unknown>>
): Promise<Hex> {
  const params: readonly unknown[] = stateOverride
    ? [{ to: target, data }, blockTag, stateOverride]
    : [{ to: target, data }, blockTag];
  return dataHex(await client.request("eth_call", params), "eth_call result");
}

async function identityAt(
  client: BscTestnetPtaWbnbLpRpcClient,
  address: Address,
  blockTag: Hex
): Promise<ContractIdentity> {
  const [rawCode, implementation, admin, beacon] = await Promise.all([
    client.request("eth_getCode", [address, blockTag]),
    client.request("eth_getStorageAt", [address, VERIFIED_EIP1967_SLOTS.implementation, blockTag]),
    client.request("eth_getStorageAt", [address, VERIFIED_EIP1967_SLOTS.admin, blockTag]),
    client.request("eth_getStorageAt", [address, VERIFIED_EIP1967_SLOTS.beacon, blockTag])
  ]);
  const code = dataHex(rawCode, "contract runtime");
  const result = {
    address,
    byteLength: (code.length - 2) / 2,
    runtimeKeccak256: keccak256(code),
    eip1967: {
      implementation: dataHex(implementation, "EIP-1967 implementation slot"),
      admin: dataHex(admin, "EIP-1967 admin slot"),
      beacon: dataHex(beacon, "EIP-1967 beacon slot")
    }
  };
  const expected = expectedIdentity(address);
  if (
    result.byteLength !== expected.byteLength ||
    result.runtimeKeccak256 !== expected.hash ||
    Object.values(result.eip1967).some((value) => value !== ZERO_WORD)
  ) {
    throw new Error(`Runtime or proxy identity mismatch at ${address}.`);
  }
  return result;
}

async function observeProvider(
  client: BscTestnetPtaWbnbLpRpcClient,
  tip: bigint,
  block: RpcBlock,
  blockTag: Hex
): Promise<ProviderObservation> {
  const addresses = [
    BSC_TESTNET_PTA_ADDRESS,
    BSC_TESTNET_WBNB_ADDRESS,
    BSC_TESTNET_PANCAKE_V3_FACTORY,
    BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER,
    BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
  ] as const;
  const [
    nativeBalance,
    ptaBalanceRaw,
    wbnbBalanceRaw,
    ptaAllowanceRaw,
    wbnbAllowanceRaw,
    ptaDecimalsRaw,
    wbnbDecimalsRaw,
    ptaSymbolRaw,
    wbnbSymbolRaw,
    ptaSupplyRaw,
    slot0Raw,
    liquidityRaw,
    token0Raw,
    token1Raw,
    feeRaw,
    tickSpacingRaw,
    poolFactoryRaw,
    factoryPoolRaw,
    factoryTickSpacingRaw,
    managerFactoryRaw,
    managerWethRaw,
    managerDeployerRaw,
    managerNftBalanceRaw,
    commonBlockNonce,
    pendingNonce,
    gasPrice,
    contracts
  ] = await Promise.all([
    client.request("eth_getBalance", [BSC_TESTNET_PTA_WBNB_POOL_SENDER, blockTag]),
    contractCall(
      client,
      BSC_TESTNET_PTA_ADDRESS,
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [BSC_TESTNET_PTA_WBNB_POOL_SENDER]
      }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_WBNB_ADDRESS,
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [BSC_TESTNET_PTA_WBNB_POOL_SENDER]
      }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_ADDRESS,
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [BSC_TESTNET_PTA_WBNB_POOL_SENDER, BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER]
      }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_WBNB_ADDRESS,
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [BSC_TESTNET_PTA_WBNB_POOL_SENDER, BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER]
      }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_ADDRESS,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "decimals" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_WBNB_ADDRESS,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "decimals" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_ADDRESS,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "symbol" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_WBNB_ADDRESS,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "symbol" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_ADDRESS,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "totalSupply" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      encodeFunctionData({ abi: POOL_ABI, functionName: "slot0" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      encodeFunctionData({ abi: POOL_ABI, functionName: "liquidity" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      encodeFunctionData({ abi: POOL_ABI, functionName: "token0" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      encodeFunctionData({ abi: POOL_ABI, functionName: "token1" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      encodeFunctionData({ abi: POOL_ABI, functionName: "fee" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      encodeFunctionData({ abi: POOL_ABI, functionName: "tickSpacing" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      encodeFunctionData({ abi: POOL_ABI, functionName: "factory" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PANCAKE_V3_FACTORY,
      encodeFunctionData({
        abi: FACTORY_ABI,
        functionName: "getPool",
        args: [BSC_TESTNET_PTA_ADDRESS, BSC_TESTNET_WBNB_ADDRESS, BSC_TESTNET_PTA_WBNB_POOL_FEE]
      }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PANCAKE_V3_FACTORY,
      encodeFunctionData({
        abi: FACTORY_ABI,
        functionName: "feeAmountTickSpacing",
        args: [BSC_TESTNET_PTA_WBNB_POOL_FEE]
      }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      encodeFunctionData({ abi: MANAGER_ABI, functionName: "factory" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      encodeFunctionData({ abi: MANAGER_ABI, functionName: "WETH9" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      encodeFunctionData({ abi: MANAGER_ABI, functionName: "deployer" }),
      blockTag
    ),
    contractCall(
      client,
      BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      encodeFunctionData({
        abi: MANAGER_ABI,
        functionName: "balanceOf",
        args: [BSC_TESTNET_PTA_WBNB_POOL_SENDER]
      }),
      blockTag
    ),
    client.request("eth_getTransactionCount", [BSC_TESTNET_PTA_WBNB_POOL_SENDER, blockTag]),
    client.request("eth_getTransactionCount", [BSC_TESTNET_PTA_WBNB_POOL_SENDER, "pending"]),
    client.request("eth_gasPrice", []),
    Promise.all(addresses.map((address) => identityAt(client, address, blockTag)))
  ]);

  const ptaBalance = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "balanceOf",
    data: ptaBalanceRaw
  });
  const wbnbBalance = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "balanceOf",
    data: wbnbBalanceRaw
  });
  const ptaAllowance = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "allowance",
    data: ptaAllowanceRaw
  });
  const wbnbAllowance = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "allowance",
    data: wbnbAllowanceRaw
  });
  const ptaDecimals = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "decimals",
    data: ptaDecimalsRaw
  });
  const wbnbDecimals = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "decimals",
    data: wbnbDecimalsRaw
  });
  const ptaSymbol = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "symbol",
    data: ptaSymbolRaw
  });
  const wbnbSymbol = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "symbol",
    data: wbnbSymbolRaw
  });
  const ptaSupply = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "totalSupply",
    data: ptaSupplyRaw
  });
  const slot0 = decodeFunctionResult({ abi: POOL_ABI, functionName: "slot0", data: slot0Raw });
  const liquidity = decodeFunctionResult({
    abi: POOL_ABI,
    functionName: "liquidity",
    data: liquidityRaw
  });
  const token0 = decodeFunctionResult({ abi: POOL_ABI, functionName: "token0", data: token0Raw });
  const token1 = decodeFunctionResult({ abi: POOL_ABI, functionName: "token1", data: token1Raw });
  const fee = decodeFunctionResult({ abi: POOL_ABI, functionName: "fee", data: feeRaw });
  const tickSpacing = decodeFunctionResult({
    abi: POOL_ABI,
    functionName: "tickSpacing",
    data: tickSpacingRaw
  });
  const poolFactory = decodeFunctionResult({
    abi: POOL_ABI,
    functionName: "factory",
    data: poolFactoryRaw
  });
  const factoryPool = decodeFunctionResult({
    abi: FACTORY_ABI,
    functionName: "getPool",
    data: factoryPoolRaw
  });
  const factoryTickSpacing = decodeFunctionResult({
    abi: FACTORY_ABI,
    functionName: "feeAmountTickSpacing",
    data: factoryTickSpacingRaw
  });
  const managerFactory = decodeFunctionResult({
    abi: MANAGER_ABI,
    functionName: "factory",
    data: managerFactoryRaw
  });
  const managerWeth = decodeFunctionResult({
    abi: MANAGER_ABI,
    functionName: "WETH9",
    data: managerWethRaw
  });
  const managerDeployer = decodeFunctionResult({
    abi: MANAGER_ABI,
    functionName: "deployer",
    data: managerDeployerRaw
  });
  const managerNftBalance = decodeFunctionResult({
    abi: MANAGER_ABI,
    functionName: "balanceOf",
    data: managerNftBalanceRaw
  });

  if (
    typeof ptaBalance !== "bigint" ||
    typeof wbnbBalance !== "bigint" ||
    typeof ptaAllowance !== "bigint" ||
    typeof wbnbAllowance !== "bigint" ||
    typeof ptaDecimals !== "number" ||
    typeof wbnbDecimals !== "number" ||
    typeof ptaSymbol !== "string" ||
    typeof wbnbSymbol !== "string" ||
    typeof ptaSupply !== "bigint" ||
    !Array.isArray(slot0) ||
    slot0.length !== 7 ||
    typeof liquidity !== "bigint" ||
    typeof token0 !== "string" ||
    typeof token1 !== "string" ||
    typeof fee !== "number" ||
    typeof tickSpacing !== "number" ||
    typeof poolFactory !== "string" ||
    typeof factoryPool !== "string" ||
    typeof factoryTickSpacing !== "number" ||
    typeof managerFactory !== "string" ||
    typeof managerWeth !== "string" ||
    typeof managerDeployer !== "string" ||
    typeof managerNftBalance !== "bigint"
  ) {
    throw new Error("A contract read decoded to an unexpected ABI shape.");
  }
  const [
    sqrtPriceX96,
    currentTick,
    observationIndex,
    cardinality,
    cardinalityNext,
    feeProtocol,
    unlocked
  ] = slot0;
  if (
    typeof sqrtPriceX96 !== "bigint" ||
    typeof currentTick !== "number" ||
    typeof observationIndex !== "number" ||
    typeof cardinality !== "number" ||
    typeof cardinalityNext !== "number" ||
    typeof feeProtocol !== "number" ||
    typeof unlocked !== "boolean"
  ) {
    throw new Error("Pool slot0 decoded to an unexpected ABI shape.");
  }

  return {
    provider: client.label,
    rpcOrigin: client.origin,
    chainId: Number(quantity(await client.request("eth_chainId", []), "chain ID")),
    tipBlockNumber: tip.toString(),
    block: {
      number: block.number.toString(),
      hash: block.hash,
      timestampUnix: block.timestamp.toString(),
      timestampUtc: new Date(Number(block.timestamp) * 1_000).toISOString()
    },
    sender: {
      nativeBalanceWei: quantity(nativeBalance, "native balance").toString(),
      ptaBalanceRaw: ptaBalance.toString(),
      wbnbBalanceRaw: wbnbBalance.toString(),
      ptaAllowanceToManagerRaw: ptaAllowance.toString(),
      wbnbAllowanceToManagerRaw: wbnbAllowance.toString(),
      commonBlockNonce: quantity(commonBlockNonce, "common-block nonce").toString(),
      pendingNonce: quantity(pendingNonce, "pending nonce").toString(),
      managerNftBalance: managerNftBalance.toString()
    },
    tokens: {
      ptaDecimals,
      ptaSymbol,
      ptaTotalSupplyRaw: ptaSupply.toString(),
      wbnbDecimals,
      wbnbSymbol
    },
    pool: {
      sqrtPriceX96: sqrtPriceX96.toString(),
      currentTick,
      observationIndex,
      observationCardinality: cardinality,
      observationCardinalityNext: cardinalityNext,
      feeProtocol,
      unlocked,
      liquidityRaw: liquidity.toString(),
      token0: getAddress(token0),
      token1: getAddress(token1),
      fee,
      tickSpacing,
      factory: getAddress(poolFactory)
    },
    relations: {
      factoryPool: getAddress(factoryPool),
      factoryTickSpacing,
      managerFactory: getAddress(managerFactory),
      managerWeth9: getAddress(managerWeth),
      managerDeployer: getAddress(managerDeployer)
    },
    gasPriceWei: quantity(gasPrice, "gas price").toString(),
    contracts
  };
}

function assertObservation(observation: ProviderObservation): void {
  const sender = observation.sender;
  const pool = observation.pool;
  const relations = observation.relations;
  if (observation.chainId !== BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID) {
    throw new Error("RPC chain identity was not BSC testnet chain 97.");
  }
  if (
    sender.ptaBalanceRaw !== "1000000000000000000000000" ||
    BigInt(sender.ptaBalanceRaw) < BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW ||
    BigInt(sender.nativeBalanceWei) <= BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI ||
    sender.ptaAllowanceToManagerRaw !== "0" ||
    sender.wbnbAllowanceToManagerRaw !== "0" ||
    sender.commonBlockNonce !== sender.pendingNonce
  ) {
    throw new Error("Sender balance, allowance, or pending-nonce precondition failed.");
  }
  if (
    observation.tokens.ptaDecimals !== 18 ||
    observation.tokens.wbnbDecimals !== 18 ||
    observation.tokens.ptaSymbol !== "PTA" ||
    observation.tokens.wbnbSymbol !== "WBNB" ||
    observation.tokens.ptaTotalSupplyRaw !== "1000000000000000000000000"
  ) {
    throw new Error("Token identity or fixed-supply precondition failed.");
  }
  if (
    pool.sqrtPriceX96 !== BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96.toString() ||
    pool.currentTick !== EXPECTED_CURRENT_TICK ||
    pool.liquidityRaw !== "0" ||
    !pool.unlocked ||
    !isAddressEqual(pool.token0, BSC_TESTNET_PTA_ADDRESS) ||
    !isAddressEqual(pool.token1, BSC_TESTNET_WBNB_ADDRESS) ||
    pool.fee !== BSC_TESTNET_PTA_WBNB_POOL_FEE ||
    pool.tickSpacing !== BSC_TESTNET_PTA_WBNB_POOL_TICK_SPACING ||
    !isAddressEqual(pool.factory, BSC_TESTNET_PANCAKE_V3_FACTORY)
  ) {
    throw new Error("Pool first-mint state or immutable relation failed.");
  }
  if (
    !isAddressEqual(relations.factoryPool, BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE) ||
    relations.factoryTickSpacing !== BSC_TESTNET_PTA_WBNB_POOL_TICK_SPACING ||
    !isAddressEqual(relations.managerFactory, BSC_TESTNET_PANCAKE_V3_FACTORY) ||
    !isAddressEqual(relations.managerWeth9, BSC_TESTNET_WBNB_ADDRESS) ||
    !isAddressEqual(relations.managerDeployer, BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER)
  ) {
    throw new Error("Factory or Position Manager relation failed.");
  }
  if (BigInt(observation.gasPriceWei) > BSC_TESTNET_PTA_WBNB_LP_MAX_GAS_PRICE_WEI) {
    throw new Error("Observed gas price exceeded the exact-scope cap.");
  }
}

function allowanceStorageSlot(owner: Address, spender: Address): Hex {
  const inner = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [owner, PTA_ALLOWANCES_STORAGE_SLOT]
    )
  );
  return keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [spender, inner])
  );
}

async function simulateExactTransactions(
  client: BscTestnetPtaWbnbLpRpcClient,
  blockTag: Hex,
  approvalData: Hex,
  mintData: Hex,
  approvalAmount: bigint,
  nativeValue: bigint
): Promise<{
  readonly provider: "primary" | "corroborator";
  readonly approval: { readonly returned: true; readonly gasEstimate: string };
  readonly mint: {
    readonly simulatedTokenId: string;
    readonly liquidityRaw: string;
    readonly amount0Raw: string;
    readonly amount1Raw: string;
    readonly gasEstimate: string;
    readonly allowanceStateOverrideSlot: Hex;
  };
}> {
  const approvalTransaction = {
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    to: BSC_TESTNET_PTA_ADDRESS,
    data: approvalData,
    value: "0x0"
  };
  const approvalCall = await client.request("eth_call", [approvalTransaction, blockTag]);
  const approvalReturned = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "approve",
    data: dataHex(approvalCall, "approval simulation")
  });
  if (approvalReturned !== true) throw new Error("PTA approval simulation did not return true.");
  const approvalEstimate = quantity(
    await client.request("eth_estimateGas", [approvalTransaction, blockTag]),
    "approval gas estimate"
  );

  const slot = allowanceStorageSlot(
    BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER
  );
  const stateOverride = {
    [BSC_TESTNET_PTA_ADDRESS]: {
      stateDiff: { [slot]: toHex(approvalAmount, { size: 32 }) }
    }
  };
  const mintTransaction = {
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    data: mintData,
    value: toHex(nativeValue)
  };
  const mintCall = dataHex(
    await client.request("eth_call", [mintTransaction, blockTag, stateOverride]),
    "mint simulation"
  );
  const mintResult = decodeFunctionResult({
    abi: MANAGER_ABI,
    functionName: "mint",
    data: mintCall
  });
  if (!Array.isArray(mintResult) || mintResult.length !== 4) {
    throw new Error("Mint simulation returned an unexpected ABI shape.");
  }
  const [tokenId, liquidity, amount0, amount1] = mintResult;
  if (
    typeof tokenId !== "bigint" ||
    typeof liquidity !== "bigint" ||
    typeof amount0 !== "bigint" ||
    typeof amount1 !== "bigint"
  ) {
    throw new Error("Mint simulation returned non-integer values.");
  }
  const mintEstimate = quantity(
    await client.request("eth_estimateGas", [mintTransaction, blockTag, stateOverride]),
    "mint gas estimate"
  );
  return {
    provider: client.label,
    approval: { returned: true, gasEstimate: approvalEstimate.toString() },
    mint: {
      simulatedTokenId: tokenId.toString(),
      liquidityRaw: liquidity.toString(),
      amount0Raw: amount0.toString(),
      amount1Raw: amount1.toString(),
      gasEstimate: mintEstimate.toString(),
      allowanceStateOverrideSlot: slot
    }
  };
}

export async function prepareBscTestnetPtaWbnbLpExactScope(
  options: PrepareBscTestnetPtaWbnbLpExactScopeOptions
): Promise<Readonly<Record<string, unknown>>> {
  const sourceCommit = canonicalSourceCommit(options.sourceCommit);
  const now = exactDate(options.now(), "Preparation clock");
  const nowUnix = BigInt(Math.floor(now.getTime() / 1_000));
  if (
    options.primary.label !== "primary" ||
    options.corroborator.label !== "corroborator" ||
    options.primary.origin !== BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN ||
    options.corroborator.origin !== BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN
  ) {
    throw new Error("Exact fixed official dual-RPC topology was not supplied.");
  }
  const [primaryTip, corroboratorTip] = await Promise.all([
    quantity(await options.primary.request("eth_blockNumber", []), "primary tip"),
    quantity(await options.corroborator.request("eth_blockNumber", []), "corroborator tip")
  ]);
  const commonBlockNumber = primaryTip < corroboratorTip ? primaryTip : corroboratorTip;
  const blockTag = toHex(commonBlockNumber);
  const [primaryBlock, corroboratorBlock] = await Promise.all([
    options.primary.request("eth_getBlockByNumber", [blockTag, false]).then(rpcBlock),
    options.corroborator.request("eth_getBlockByNumber", [blockTag, false]).then(rpcBlock)
  ]);
  if (
    primaryBlock.number !== commonBlockNumber ||
    corroboratorBlock.number !== commonBlockNumber ||
    primaryBlock.hash !== corroboratorBlock.hash ||
    primaryBlock.timestamp !== corroboratorBlock.timestamp
  ) {
    throw new Error("Fixed RPCs did not agree on the common block identity.");
  }
  const blockAge = nowUnix - primaryBlock.timestamp;
  if (blockAge < -5n || blockAge > BigInt(BSC_TESTNET_PTA_WBNB_LP_MAX_BLOCK_AGE_SECONDS)) {
    throw new Error("Common block timestamp was stale or too far in the future.");
  }

  const observations = await Promise.all([
    observeProvider(options.primary, primaryTip, primaryBlock, blockTag),
    observeProvider(options.corroborator, corroboratorTip, corroboratorBlock, blockTag)
  ]);
  const [primaryObservation, corroboratorObservation] = observations;
  assertObservation(primaryObservation);
  assertObservation(corroboratorObservation);
  if (!sameObservation(primaryObservation, corroboratorObservation)) {
    throw new Error("Fixed RPCs disagreed on an exact-scope observation.");
  }

  const quoteResult = calculatePancakeV3LiquidityQuote({
    schemaVersion: 2,
    sqrtPriceX96: primaryObservation.pool.sqrtPriceX96,
    currentTick: primaryObservation.pool.currentTick,
    tickLower: BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER,
    tickUpper: BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER,
    amount0Desired: BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW.toString(),
    amount1Desired: BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI.toString(),
    maxSlippageBps: BSC_TESTNET_PTA_WBNB_LP_SLIPPAGE_BPS
  });
  if (quoteResult.status !== "quoted") {
    throw new Error(`Liquidity calculation blocked: ${quoteResult.issues[0]?.code ?? "unknown"}.`);
  }
  const quote = quoteResult.quote;
  const amount0 = BigInt(quote.calldataAmounts.amount0DesiredMaximumRaw);
  const amount1 = BigInt(quote.calldataAmounts.amount1DesiredMaximumRaw);
  const amount0Min = BigInt(quote.slippageMinimums.amount0Raw);
  const amount1Min = BigInt(quote.slippageMinimums.amount1Raw);
  if (
    amount0 !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW ||
    amount1 !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI ||
    amount0Min !== amount0 ||
    amount1Min !== amount1 ||
    quote.liquidityCalculation.preliminaryFromCapitalRaw !== "1000000000000000000" ||
    quote.liquidityCalculation.recomputedFromCalldataAtObservedPriceRaw !== "1000000000000000000"
  ) {
    throw new Error("Zero-slippage full-range quote did not preserve every exact amount.");
  }

  const scopeExpiresAt = new Date(
    now.getTime() + BSC_TESTNET_PTA_WBNB_LP_SCOPE_LIFETIME_SECONDS * 1_000
  );
  const deadline = nowUnix + BigInt(BSC_TESTNET_PTA_WBNB_LP_DEADLINE_SECONDS);
  const approvalData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER, amount0]
  });
  const revokeData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER, 0n]
  });
  const mintData = encodeFunctionData({
    abi: MANAGER_ABI,
    functionName: "mint",
    args: [
      {
        token0: BSC_TESTNET_PTA_ADDRESS,
        token1: BSC_TESTNET_WBNB_ADDRESS,
        fee: BSC_TESTNET_PTA_WBNB_POOL_FEE,
        tickLower: BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER,
        tickUpper: BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER,
        amount0Desired: amount0,
        amount1Desired: amount1,
        amount0Min,
        amount1Min,
        recipient: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
        deadline
      }
    ]
  });
  if (approvalData.slice(0, 10) !== "0x095ea7b3" || mintData.slice(0, 10) !== "0x88316456") {
    throw new Error("Exact selector invariant failed.");
  }

  const [primarySimulation, corroboratorSimulation] = await Promise.all([
    simulateExactTransactions(options.primary, blockTag, approvalData, mintData, amount0, amount1),
    simulateExactTransactions(
      options.corroborator,
      blockTag,
      approvalData,
      mintData,
      amount0,
      amount1
    )
  ]);
  const simulations = [primarySimulation, corroboratorSimulation] as const;
  if (
    stableJson(primarySimulation) !== stableJson({ ...corroboratorSimulation, provider: "primary" })
  ) {
    throw new Error("Fixed RPCs disagreed on exact approval or mint simulation.");
  }
  for (const simulation of simulations) {
    if (
      simulation.mint.liquidityRaw !== "1000000000000000000" ||
      simulation.mint.amount0Raw !== amount0.toString() ||
      simulation.mint.amount1Raw !== amount1.toString()
    ) {
      throw new Error("Mint simulation did not consume the exact zero-slippage amounts.");
    }
  }

  const approvalGasLimit = marginGas(
    BigInt(primarySimulation.approval.gasEstimate),
    BSC_TESTNET_PTA_WBNB_LP_MAX_APPROVAL_GAS,
    "Approval"
  );
  const mintGasLimit = marginGas(
    BigInt(primarySimulation.mint.gasEstimate),
    BSC_TESTNET_PTA_WBNB_LP_MAX_MINT_GAS,
    "Mint"
  );
  const gasPriceWei = BigInt(primaryObservation.gasPriceWei);
  const approvalNonce = BigInt(primaryObservation.sender.pendingNonce);
  const mintNonce = approvalNonce + 1n;
  const maximumGasCostWei = (approvalGasLimit + mintGasLimit) * gasPriceWei;
  const maximumNativeOutflowWei = maximumGasCostWei + amount1;
  if (BigInt(primaryObservation.sender.nativeBalanceWei) < maximumNativeOutflowWei) {
    throw new Error("Sender native balance did not cover exact value plus bounded gas.");
  }

  const body = {
    schemaVersion: BSC_TESTNET_PTA_WBNB_LP_SCOPE_SCHEMA_VERSION,
    kind: "bsc_testnet_pta_wbnb_first_lp_exact_scope",
    policyId: BSC_TESTNET_PTA_WBNB_LP_POLICY_ID,
    status: "prepared_not_authorized",
    sourceCommit,
    preparedAt: now.toISOString(),
    scopeExpiresAt: scopeExpiresAt.toISOString(),
    reusableAfterExpiry: false,
    chain: {
      environment: "bsc-testnet",
      chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
      mainnetWritePossible: false,
      fixedOfficialDualRpc: true
    },
    owner: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    observation: {
      commonBlockNumber: commonBlockNumber.toString(),
      commonBlockHash: primaryBlock.hash,
      commonBlockTimestampUnix: primaryBlock.timestamp.toString(),
      commonBlockTimestampUtc: new Date(Number(primaryBlock.timestamp) * 1_000).toISOString(),
      blockAgeSeconds: blockAge.toString(),
      providerAgreementVerified: true,
      observations
    },
    position: {
      pool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      manager: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      recipient: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      token0: BSC_TESTNET_PTA_ADDRESS,
      token1: BSC_TESTNET_WBNB_ADDRESS,
      fee: BSC_TESTNET_PTA_WBNB_POOL_FEE.toString(),
      tickLower: BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER,
      tickUpper: BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER,
      range: "full_range_aligned_to_tick_spacing_10",
      amount0DesiredRaw: amount0.toString(),
      amount1DesiredRaw: amount1.toString(),
      amount0MinRaw: amount0Min.toString(),
      amount1MinRaw: amount1Min.toString(),
      maximumSlippageBps: BSC_TESTNET_PTA_WBNB_LP_SLIPPAGE_BPS,
      expectedLiquidityRaw: quote.liquidityCalculation.preliminaryFromCapitalRaw,
      deadlineUnix: deadline.toString(),
      deadlineUtc: new Date(Number(deadline) * 1_000).toISOString(),
      priceMeaning: "fixed_non_economic_test_scenario_not_market_price_oracle_peg_or_valuation",
      nativeFundingMethod: "direct_payable_mint_wraps_only_the_exact_WBNB_amount_owed"
    },
    exactTransactions: [
      {
        order: 1,
        purpose: "exact_PTA_allowance_for_one_mint",
        chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
        type: "legacy",
        from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
        nonce: approvalNonce.toString(),
        to: BSC_TESTNET_PTA_ADDRESS,
        selector: "0x095ea7b3",
        data: approvalData,
        dataKeccak256: keccak256(approvalData),
        valueWei: "0",
        gasLimit: approvalGasLimit.toString(),
        gasPriceWei: gasPriceWei.toString()
      },
      {
        order: 2,
        purpose: "direct_zero_slippage_full_range_Pancake_V3_mint",
        chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
        type: "legacy",
        from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
        nonce: mintNonce.toString(),
        to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
        selector: "0x88316456",
        data: mintData,
        dataKeccak256: keccak256(mintData),
        valueWei: amount1.toString(),
        gasLimit: mintGasLimit.toString(),
        gasPriceWei: gasPriceWei.toString()
      }
    ],
    caps: {
      ptaSpendRaw: amount0.toString(),
      nativeMintValueWei: amount1.toString(),
      gasPriceWei: gasPriceWei.toString(),
      maximumGasPriceWei: BSC_TESTNET_PTA_WBNB_LP_MAX_GAS_PRICE_WEI.toString(),
      approvalGasEstimate: primarySimulation.approval.gasEstimate,
      approvalGasLimit: approvalGasLimit.toString(),
      mintGasEstimate: primarySimulation.mint.gasEstimate,
      mintGasLimit: mintGasLimit.toString(),
      maximumGasCostWei: maximumGasCostWei.toString(),
      maximumNativeOutflowWei: maximumNativeOutflowWei.toString()
    },
    simulations: {
      stateOverridePurpose:
        "read_only simulation of mint after the exact preceding PTA approval; no persistent state change",
      providerAgreementVerified: true,
      tokenIdIsUnconstrainedReturnValue: true,
      simulations
    },
    failureCleanup: {
      target: BSC_TESTNET_PTA_ADDRESS,
      selector: "0x095ea7b3",
      data: revokeData,
      dataKeccak256: keccak256(revokeData),
      valueWei: "0",
      rule: "If approval confirms but mint does not confirm, stop all mint retries and prepare one fresh-nonce exact approve(manager,0) cleanup scope after reconciling the mint outcome.",
      preauthorized: false
    },
    prohibited: {
      multicall: true,
      dispatcher: true,
      WBNBApproval: true,
      tokenTransfer: true,
      swap: true,
      additionalLiquidity: true,
      retryAfterAmbiguousSubmission: true,
      replacement: true,
      mainnet: true
    },
    authorization: {
      preparationAuthorizedByOwner: true,
      signingAuthorized: false,
      custodyUnlockAuthorized: false,
      broadcastAuthorized: false,
      signatureCreated: false,
      transactionSubmitted: false,
      blockchainWritePerformed: false
    },
    evidenceBoundary: {
      preparationIsNotReceipt: true,
      simulationIsNotExecution: true,
      tokenIdMayRaceBecauseItIsNotAFunctionInput: true,
      successfulReceiptAndPostStateRequiredBeforeLiquidityClaim: true,
      realizedBenefitRemainsUnknown: true
    }
  } as const;
  return Object.freeze({
    ...body,
    exactScopeSha256: sha256(stringToHex(stableJson(body)))
  });
}

export function createFixedBscTestnetPtaWbnbLpRpcClient(
  label: "primary" | "corroborator",
  origin: string
): BscTestnetPtaWbnbLpRpcClient {
  let requestId = 0;
  return Object.freeze({
    label,
    origin,
    async request(method: JsonRpcMethod, params: readonly unknown[]): Promise<unknown> {
      requestId += 1;
      const id = requestId;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MILLISECONDS);
      let response: Response;
      try {
        response = await fetch(origin, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          redirect: "error",
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`${label} RPC returned HTTP ${response.status}.`);
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RPC_RESPONSE_BYTES) {
        throw new Error(`${label} RPC response exceeded its byte limit.`);
      }
      let payload: unknown;
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new Error(`${label} RPC returned invalid JSON.`);
      }
      if (!isRecord(payload) || payload.jsonrpc !== "2.0" || String(payload.id) !== String(id)) {
        throw new Error(`${label} RPC envelope was malformed.`);
      }
      if (isRecord(payload.error)) {
        const code = typeof payload.error.code === "number" ? payload.error.code : "unknown";
        throw new Error(`${label} RPC ${method} failed with code ${code}.`);
      }
      if (!("result" in payload)) throw new Error(`${label} RPC result was missing.`);
      return payload.result;
    }
  });
}

export function createFixedOfficialBscTestnetPtaWbnbLpRpcClients(): Readonly<{
  primary: BscTestnetPtaWbnbLpRpcClient;
  corroborator: BscTestnetPtaWbnbLpRpcClient;
}> {
  return Object.freeze({
    primary: createFixedBscTestnetPtaWbnbLpRpcClient(
      "primary",
      BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN
    ),
    corroborator: createFixedBscTestnetPtaWbnbLpRpcClient(
      "corroborator",
      BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN
    )
  });
}
