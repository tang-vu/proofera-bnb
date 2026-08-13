import { keccak256, stringToHex, type Address, type Hex } from "viem";

export const BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID = 97 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN =
  "https://bsc-testnet-dataseed.bnbchain.org" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN =
  "https://bsc-testnet.bnbchain.org" as const;

export const BSC_TESTNET_PTA_WBNB_POOL_SENDER =
  "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49" as const satisfies Address;
export const BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE = 1n;
export const BSC_TESTNET_PTA_ADDRESS =
  "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc" as const satisfies Address;
export const BSC_TESTNET_WBNB_ADDRESS =
  "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd" as const satisfies Address;
export const BSC_TESTNET_PANCAKE_V3_FACTORY =
  "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as const satisfies Address;
export const BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER =
  "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9" as const satisfies Address;
export const BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER =
  "0x427bF5b37357632377eCbEC9de3626C71A5396c1" as const satisfies Address;
export const BSC_TESTNET_PANCAKE_V3_FACTORY_OWNER =
  "0x261AF0030618a52FA767997ed310174b3Bc3B77F" as const satisfies Address;
export const BSC_TESTNET_PANCAKE_V3_LM_POOL_DEPLOYER =
  "0x7F1745eb74D26877EC54dd9A317CC930Ad01350c" as const satisfies Address;
export const BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE =
  "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE" as const satisfies Address;

export const BSC_TESTNET_PTA_WBNB_POOL_FEE = 500 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_TICK_SPACING = 10 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96 = 79_228_162_514_264_337_593_543_950n;
export const BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR = "0x13ead562" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA =
  "0x13ead5620000000000000000000000004ed64525d6fb06b7da926c683cbd809632c9b4cc000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd00000000000000000000000000000000000000000000000000000000000001f40000000000000000000000000000000000000000004189374bc6a7ef9db22d0e" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_BYTES = 132 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256 =
  "0x31c57c19edeae364d99d6f4fb97c75f81d9b1ec5bd8e6673d9771d9ece53b0d3" as const satisfies Hex;

export const BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS = 120 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS = 45 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GAS_MARGIN_BPS = 2_000 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE = 5_000_000n;
export const BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT = 6_000_000n;
export const BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI = 3_000_000_000n;
export const BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI = 18_000_000_000_000_000n;

export const BSC_TESTNET_PTA_WBNB_POOL_EMPTY_CODE_HASH =
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470" as const satisfies Hex;

export const BSC_TESTNET_PTA_WBNB_POOL_CODE_IDENTITIES = Object.freeze({
  pta: Object.freeze({
    address: BSC_TESTNET_PTA_ADDRESS,
    byteLength: 1_826,
    runtimeKeccak256: "0x2f8caecd2e51f085ab11a67e5b8a89eeab7b667bd89ec708a481b66ed756e006" as Hex
  }),
  wbnb: Object.freeze({
    address: BSC_TESTNET_WBNB_ADDRESS,
    byteLength: 3_124,
    runtimeKeccak256: "0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6" as Hex
  }),
  factory: Object.freeze({
    address: BSC_TESTNET_PANCAKE_V3_FACTORY,
    byteLength: 5_151,
    runtimeKeccak256: "0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c" as Hex
  }),
  poolDeployer: Object.freeze({
    address: BSC_TESTNET_PANCAKE_V3_POOL_DEPLOYER,
    byteLength: 24_556,
    runtimeKeccak256: "0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b" as Hex
  }),
  positionManager: Object.freeze({
    address: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    byteLength: 24_466,
    runtimeKeccak256: "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7" as Hex
  })
});

export const BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_HASH_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-initialization-envelope:v1" as const;

export interface BscTestnetPtaWbnbPoolInitializationEnvelopeBody {
  readonly schemaVersion: 1;
  readonly operation: "create_and_initialize_exact_pta_wbnb_pancake_v3_pool_once";
  readonly chainId: "97";
  readonly transaction: Readonly<{
    from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
    to: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
    nonce: "1";
    data: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA;
    dataBytes: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_BYTES;
    dataKeccak256: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256;
    selector: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR;
    valueWei: "0";
    gasLimit: string;
    gasPriceWei: string;
  }>;
  readonly initializer: Readonly<{
    token0: typeof BSC_TESTNET_PTA_ADDRESS;
    token1: typeof BSC_TESTNET_WBNB_ADDRESS;
    fee: "500";
    sqrtPriceX96: "79228162514264337593543950";
    expectedPool: typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE;
    priceMeaning: "fixed_test_scenario_not_market_price_oracle_peg_or_valuation";
  }>;
  readonly observation: Readonly<{
    observedAt: string;
    finalizedBlockNumber: string;
    finalizedBlockHash: Hex;
    finalizedBlockTimestamp: string;
    latestNonce: "1";
    pendingNonce: "1";
    pendingPool: "0x0000000000000000000000000000000000000000";
    providerAgreementVerified: true;
    allRuntimeIdentitiesVerified: true;
    allEip1967SlotsZero: true;
    allProtocolBindingsVerified: true;
    feeTierVerified: true;
    simulationReturnPool: typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE;
    gasEstimate: string;
  }>;
  readonly caps: Readonly<{
    gasMarginBps: "2000";
    maximumGasEstimate: "5000000";
    maximumGasLimit: "6000000";
    maximumGasPriceWei: "3000000000";
    maximumTotalCostWei: "18000000000000000";
    boundedMaximumCostWei: string;
  }>;
  readonly expiresAt: string;
  readonly raceBoundary: Readonly<{
    initializerHasNoDeadline: true;
    publicMempoolCanRace: true;
    sameNonceReplacementCanRace: true;
    freshPendingRecheckRequiredAfterDurableClaim: true;
    postReceiptPoolCreatedReconciliationRequired: true;
    envelopeDoesNotReservePoolAddress: true;
  }>;
  readonly authorization: Readonly<{
    signingReady: false;
    signingAuthorized: false;
    executionAuthorized: false;
    secretRead: false;
    signerCreated: false;
    signatureCreated: false;
    transactionSubmitted: false;
    blockchainWritePerformed: false;
  }>;
}

export interface BscTestnetPtaWbnbPoolInitializationEnvelope extends BscTestnetPtaWbnbPoolInitializationEnvelopeBody {
  /** Unkeyed integrity digest. It is not an authorization or provider authentication. */
  readonly envelopeHash: Hex;
}

export function deriveBscTestnetPtaWbnbPoolInitializationEnvelopeHash(
  body: BscTestnetPtaWbnbPoolInitializationEnvelopeBody
): Hex {
  return keccak256(
    stringToHex(`${BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_HASH_DOMAIN}\u0000${JSON.stringify(body)}`)
  );
}

export function calculateBscTestnetPtaWbnbPoolGasLimit(gasEstimate: bigint): bigint | null {
  if (gasEstimate <= 0n || gasEstimate > BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE) return null;
  const gasLimit =
    (gasEstimate * (10_000n + BigInt(BSC_TESTNET_PTA_WBNB_POOL_GAS_MARGIN_BPS)) + 9_999n) / 10_000n;
  return gasLimit <= BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT ? gasLimit : null;
}
