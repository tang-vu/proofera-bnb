import { createHash } from "node:crypto";

import { OFFICIAL_PANCAKE_V3_ARTIFACTS } from "./official-pancake-artifacts.mjs";

export const BSC_TESTNET_CHAIN_ID = 97;
export const PANCAKE_V3_BSC_TESTNET_FACTORY =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.deployments.factory;
export const PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.deployments.poolDeployer;
export const PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.deployments.positionManager;
export const BSC_TESTNET_WBNB = "0xae13d989dac2f0debff460ac112a837c89baa7cd";
export const PANCAKE_V3_FEE = 500;
export const PANCAKE_V3_TICK_SPACING =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.feeTiers.find(
    ({ fee }) => fee === PANCAKE_V3_FEE,
  )?.tickSpacing;
const Q96 = 2n ** 96n;
const TEST_SCENARIO_SQRT_RATIO_SCALE = 1000n;
export const PTA_TOKEN0_TEST_SCENARIO_SQRT_PRICE_X96 =
  Q96 / TEST_SCENARIO_SQRT_RATIO_SCALE;
export const PTA_TOKEN1_TEST_SCENARIO_SQRT_PRICE_X96 =
  Q96 * TEST_SCENARIO_SQRT_RATIO_SCALE;
export const PTA_TOKEN0_TEST_SCENARIO_EXPECTED_TICK = -138163;
export const PTA_TOKEN1_TEST_SCENARIO_EXPECTED_TICK = 138162;

export const POOL_INITIALIZER_SIGNATURE =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.initializer.signature;
export const POOL_INITIALIZER_SELECTOR =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.initializer.selector;
export const FACTORY_GET_POOL_SIGNATURE =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.factoryReads.getPool.signature;
export const FACTORY_GET_POOL_SELECTOR =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.factoryReads.getPool.selector;
export const FACTORY_FEE_SPACING_SIGNATURE =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.factoryReads.feeAmountTickSpacing.signature;
export const FACTORY_FEE_SPACING_SELECTOR =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.factoryReads.feeAmountTickSpacing.selector;
export const POOL_CREATED_EVENT_SIGNATURE =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.poolCreatedEvent.signature;
export const POOL_CREATED_EVENT_TOPIC0 =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.poolCreatedEvent.topic0;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const SELECTOR_PATTERN = /^0x[0-9a-f]{8}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const UINT24_MAX = (1n << 24n) - 1n;
const UINT160_MAX = (1n << 160n) - 1n;
const POOL_INITIALIZER_CALLDATA_HEX_LENGTH = 8 + 4 * 64;
const OFFICIAL_DEPLOYMENT_COMMIT =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.provenance.deploymentCommit;
const REVIEWED_SOURCE_COMMIT =
  OFFICIAL_PANCAKE_V3_ARTIFACTS.provenance.sourceCommit;

if (PANCAKE_V3_TICK_SPACING !== 10) {
  throw new Error("Retained official fee-500 tick spacing must equal 10.");
}

const RESERVED_PROTOCOL_ADDRESSES = new Set([
  PANCAKE_V3_BSC_TESTNET_FACTORY,
  PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER,
  PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  BSC_TESTNET_WBNB,
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function assertPoolPreparationChainId(chainId) {
  const normalized = typeof chainId === "number" ? String(chainId) : chainId;

  if (normalized !== String(BSC_TESTNET_CHAIN_ID)) {
    throw new Error(
      `Refusing pool preparation: chain ID must be decimal ${BSC_TESTNET_CHAIN_ID} (BSC testnet).`,
    );
  }

  return BSC_TESTNET_CHAIN_ID;
}

export function assertPtaDeploymentAddress(address) {
  if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
    throw new Error(
      "Deployed PTA address must be an explicit 20-byte 0x-prefixed hexadecimal address.",
    );
  }

  const normalized = address.toLowerCase();
  if (normalized === ZERO_ADDRESS) {
    throw new Error("Deployed PTA address must not be the zero address.");
  }
  if (RESERVED_PROTOCOL_ADDRESSES.has(normalized)) {
    throw new Error(
      "Deployed PTA address must be distinct from WBNB and every pinned Pancake protocol address.",
    );
  }

  return normalized;
}

export function parsePoolPreparationArguments(arguments_) {
  const allowedKeys = new Set(["--chain-id", "--pta-address"]);
  const parsed = new Map();

  if (!Array.isArray(arguments_)) {
    throw new Error("Pool-preparation arguments must be an explicit array.");
  }

  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];

    if (
      !allowedKeys.has(key) ||
      typeof value !== "string" ||
      value.startsWith("--")
    ) {
      throw new Error(
        "Usage: --chain-id 97 --pta-address 0x...; RPC, signer, owner, recipient, private-key, approval, liquidity, and broadcast arguments are unsupported.",
      );
    }
    if (parsed.has(key)) {
      throw new Error(`Duplicate argument: ${key}`);
    }

    parsed.set(key, value);
  }

  if (parsed.size !== allowedKeys.size) {
    throw new Error("Both --chain-id and --pta-address are required.");
  }

  return {
    chainId: assertPoolPreparationChainId(parsed.get("--chain-id")),
    ptaAddress: assertPtaDeploymentAddress(parsed.get("--pta-address")),
  };
}

function encodeAddressWord(address) {
  const validated = assertAddress(address, "ABI address");
  return validated.slice(2).padStart(64, "0");
}

function assertAddress(address, label) {
  if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
    throw new Error(`${label} must be an exact 20-byte hexadecimal address.`);
  }

  const normalized = address.toLowerCase();
  if (normalized === ZERO_ADDRESS) {
    throw new Error(`${label} must not be the zero address.`);
  }

  return normalized;
}

function encodeUnsignedWord(value, maximum, label) {
  if (typeof value !== "bigint" || value < 0n || value > maximum) {
    throw new Error(`${label} is outside its unsigned ABI integer range.`);
  }

  return value.toString(16).padStart(64, "0");
}

function encodeStaticCall(selector, words) {
  if (!SELECTOR_PATTERN.test(selector)) {
    throw new Error("Function selector must be exactly four lowercase bytes.");
  }
  if (
    !Array.isArray(words) ||
    words.some((word) => !/^[0-9a-f]{64}$/.test(word))
  ) {
    throw new Error(
      "Every static ABI word must be exactly 32 lowercase bytes.",
    );
  }

  return `${selector}${words.join("")}`;
}

export function canonicalTokenOrder(ptaAddress) {
  const pta = assertPtaDeploymentAddress(ptaAddress);
  const wbnb = BSC_TESTNET_WBNB;

  return BigInt(pta) < BigInt(wbnb)
    ? { token0: pta, token1: wbnb, ptaIsToken0: true }
    : { token0: wbnb, token1: pta, ptaIsToken0: false };
}

export function buildTestScenarioSeedPrice(ptaIsToken0) {
  if (typeof ptaIsToken0 !== "boolean") {
    throw new Error(
      "Test-scenario seed construction requires an explicit PTA token-order boolean.",
    );
  }

  const sqrtPriceX96 = ptaIsToken0
    ? PTA_TOKEN0_TEST_SCENARIO_SQRT_PRICE_X96
    : PTA_TOKEN1_TEST_SCENARIO_SQRT_PRICE_X96;

  return {
    scenario: "fixed_non_economic_test_scenario",
    targetRatio: "1 PTA = 0.000001 WBNB",
    targetRatioStatus:
      "declared test-scenario input only; not observed or market-derived",
    tokenDecimals: {
      pta: 18,
      wbnb: 18,
    },
    priceConvention: "raw token1 units per raw token0 unit",
    sqrtPriceX96: sqrtPriceX96.toString(),
    expectedInitialTick: String(
      ptaIsToken0
        ? PTA_TOKEN0_TEST_SCENARIO_EXPECTED_TICK
        : PTA_TOKEN1_TEST_SCENARIO_EXPECTED_TICK,
    ),
    rawToken1PerToken0TargetNumerator: ptaIsToken0 ? "1" : "1000000",
    rawToken1PerToken0TargetDenominator: ptaIsToken0 ? "1000000" : "1",
    sqrtPriceX96Derivation: ptaIsToken0
      ? "floor(2^96 / 1000) because token1/token0 is WBNB/PTA = 1/1,000,000"
      : "2^96 * 1000 because token1/token0 is PTA/WBNB = 1,000,000",
    sqrtPriceX96Rounding: ptaIsToken0
      ? "floored to uint160; the encoded squared ratio is slightly below the declared target"
      : "exact integer Q64.96 encoding; the encoded squared ratio equals the declared target",
    encodedRatioRelationToTarget: ptaIsToken0
      ? "slightly_below_target_due_to_floor_rounding"
      : "exact_target",
    economicMeaning:
      "none: this target is an arbitrary test-scenario ratio, not a market price, peg, quote, valuation, oracle observation, or performance input",
  };
}

export function encodePoolInitializationCalldata({
  token0,
  token1,
  fee = PANCAKE_V3_FEE,
  sqrtPriceX96,
}) {
  const first = assertAddress(token0, "token0");
  const second = assertAddress(token1, "token1");
  if (BigInt(first) >= BigInt(second)) {
    throw new Error(
      "Pool tokens must be distinct and in canonical ascending address order.",
    );
  }

  const feeValue = typeof fee === "number" ? BigInt(fee) : fee;
  const sqrtPriceValue = sqrtPriceX96;

  return encodeStaticCall(POOL_INITIALIZER_SELECTOR, [
    encodeAddressWord(first),
    encodeAddressWord(second),
    encodeUnsignedWord(feeValue, UINT24_MAX, "fee"),
    encodeUnsignedWord(sqrtPriceValue, UINT160_MAX, "sqrtPriceX96"),
  ]);
}

export function decodePoolInitializationCalldata(calldata) {
  if (
    typeof calldata !== "string" ||
    !/^0x[0-9a-f]+$/.test(calldata) ||
    calldata.length !== 2 + POOL_INITIALIZER_CALLDATA_HEX_LENGTH
  ) {
    throw new Error(
      "Pool initializer calldata must be exact lowercase static ABI encoding for four arguments.",
    );
  }
  if (calldata.slice(0, 10) !== POOL_INITIALIZER_SELECTOR) {
    throw new Error("Pool initializer calldata has an unexpected selector.");
  }

  const payload = calldata.slice(10);
  const words = Array.from({ length: 4 }, (_, index) =>
    payload.slice(index * 64, (index + 1) * 64),
  );
  if (
    !words[0].startsWith("0".repeat(24)) ||
    !words[1].startsWith("0".repeat(24))
  ) {
    throw new Error("Pool initializer address word is not canonically padded.");
  }

  const token0 = assertAddress(`0x${words[0].slice(24)}`, "decoded token0");
  const token1 = assertAddress(`0x${words[1].slice(24)}`, "decoded token1");
  const fee = BigInt(`0x${words[2]}`);
  const sqrtPriceX96 = BigInt(`0x${words[3]}`);
  if (fee > UINT24_MAX || sqrtPriceX96 > UINT160_MAX) {
    throw new Error(
      "Pool initializer integer word exceeds its declared ABI width.",
    );
  }

  return {
    token0,
    token1,
    fee: fee.toString(),
    sqrtPriceX96: sqrtPriceX96.toString(),
  };
}

function buildPreflightReadCalls({ token0, token1 }) {
  return {
    feeAmountTickSpacing: {
      target: PANCAKE_V3_BSC_TESTNET_FACTORY,
      signature: FACTORY_FEE_SPACING_SIGNATURE,
      selector: FACTORY_FEE_SPACING_SELECTOR,
      calldata: encodeStaticCall(FACTORY_FEE_SPACING_SELECTOR, [
        encodeUnsignedWord(BigInt(PANCAKE_V3_FEE), UINT24_MAX, "fee"),
      ]),
      requiredDecodedResult: String(PANCAKE_V3_TICK_SPACING),
    },
    getPoolBeforeSubmission: {
      target: PANCAKE_V3_BSC_TESTNET_FACTORY,
      signature: FACTORY_GET_POOL_SIGNATURE,
      selector: FACTORY_GET_POOL_SELECTOR,
      calldata: encodeStaticCall(FACTORY_GET_POOL_SELECTOR, [
        encodeAddressWord(token0),
        encodeAddressWord(token1),
        encodeUnsignedWord(BigInt(PANCAKE_V3_FEE), UINT24_MAX, "fee"),
      ]),
      requiredDecodedResult: ZERO_ADDRESS,
      failureMeaning:
        "A pool already exists; this new-pool-only plan is stale and must not be submitted.",
    },
  };
}

function buildPoolCreatedReceiptRequirement({ token0, token1 }) {
  return {
    applicableOnlyWhen:
      "this exact transaction creates the pool; this new-pool-only plan is unsafe if the matching log is absent",
    emitter: PANCAKE_V3_BSC_TESTNET_FACTORY,
    signature: POOL_CREATED_EVENT_SIGNATURE,
    topic0: POOL_CREATED_EVENT_TOPIC0,
    indexedTopics: [
      `0x${encodeAddressWord(token0)}`,
      `0x${encodeAddressWord(token1)}`,
      `0x${encodeUnsignedWord(BigInt(PANCAKE_V3_FEE), UINT24_MAX, "fee")}`,
    ],
    dataLayout: [
      {
        word: 0,
        type: "int24",
        name: "tickSpacing",
        requiredDecodedValue: String(PANCAKE_V3_TICK_SPACING),
      },
      {
        word: 1,
        type: "address",
        name: "pool",
        requiredDecodedValue: null,
        status:
          "must equal the independently predicted CREATE2 address and fresh factory.getPool result",
      },
    ],
    ordinaryReceiptContainsFunctionReturnData: false,
    optionalReturnValueEvidence:
      "The returned pool address may be decoded from a pre-submission eth_call or an explicitly retained execution trace; it is not a transaction-receipt field and is never required as receipt evidence.",
  };
}

function buildOpenBlockers() {
  return [
    {
      id: "fresh_wbnb_code",
      status: "open",
      blocks: "pool_submission",
      resolution:
        "At one fresh finalized block, re-read WBNB runtime code and proxy slots and bind them to the retained exact source/creation/runtime proof.",
    },
    {
      id: "deployed_pta_code_and_source",
      status: "open",
      blocks: "pool_submission",
      resolution:
        "Verify the supplied address has the exact approved PTA runtime, constructor recipient, source verification, 18 decimals, fixed supply, and no proxy/control drift.",
    },
    {
      id: "fresh_pancake_core_identity",
      status: "open",
      blocks: "pool_submission",
      resolution:
        "At the same finalized block, bind manager, factory, and pool-deployer code and immutable/getter relationships to the retained reviewed builds.",
    },
    {
      id: "pool_create2_and_factory_lineage",
      status: "open",
      blocks: "pool_submission",
      resolution:
        "Bind the exact pool creation-code hash and deployer proof, predict the CREATE2 address, then require factory.getPool and every pool immutable to agree.",
    },
    {
      id: "oracle_cardinality_and_history",
      status: "open",
      blocks: "lp_activation",
      resolution:
        "A newly initialized pool begins without decision-useful observation history. Establish cardinality, elapsed history, observation integrity, and manipulation limits before analysis or activation.",
    },
    {
      id: "liquidity",
      status: "open",
      blocks: "lp_activation",
      resolution:
        "This plan adds no liquidity. Establish explicit bounded amounts, minima, deadline, slippage, approvals, capital source, and post-mint evidence in a separate reviewed plan.",
    },
    {
      id: "ownership",
      status: "open",
      blocks: "lp_activation",
      resolution:
        "Pool initialization creates no NFT or owned position. A later mint must explicitly bind recipient, NFT owner, operator approvals, and revoke authority.",
    },
    {
      id: "selector_publication_attestation",
      status: "open",
      blocks: "pool_submission",
      resolution:
        "Publish and independently re-fetch a source/runtime/path attestation for selector 0x13ead562. Existing local LP selector artifacts do not attest this initializer selector.",
    },
    {
      id: "altana_policy_and_authority",
      status: "open",
      blocks: "automated_submission",
      resolution:
        "Bind the exact manager selector, zero native value, chain, expiry, session signer, spend policy, and revoke path to a confirmed scoped Altana authority.",
    },
    {
      id: "initializer_no_deadline_submission_lifecycle",
      status: "open",
      blocks: "pool_submission",
      resolution:
        "The retained official initializer has no deadline parameter or onchain time check. Before any submission, bind one exact sender and nonce, maximum gas units, maximum fee-per-gas and total tBNB cost, a short externally enforced broadcast window, a durable atomic one-shot claim, duplicate/pending reconciliation, and an explicit same-nonce replacement/cancellation policy. A cancellation is not final until canonical mining is reconciled; any stale, duplicate, or ambiguously replaced mining is unsafe.",
    },
    {
      id: "simulation",
      status: "open",
      blocks: "pool_submission",
      resolution:
        "Immediately before confirmation, simulate the exact calldata from the intended sender at a fresh block and repeat every state/code/lineage read. A simulation cannot eliminate inclusion-time front-running.",
    },
    {
      id: "user_confirmation",
      status: "open",
      blocks: "pool_submission",
      resolution:
        "Obtain explicit wallet confirmation after showing the testnet, target, selector, zero value, arbitrary non-economic seed price, gas estimate, front-running caveat, and no-liquidity outcome.",
    },
  ];
}

export function buildPoolPreparation({ chainId, ptaAddress }) {
  const validatedChainId = assertPoolPreparationChainId(chainId);
  const validatedPtaAddress = assertPtaDeploymentAddress(ptaAddress);
  const tokenOrder = canonicalTokenOrder(validatedPtaAddress);
  const seedPrice = buildTestScenarioSeedPrice(tokenOrder.ptaIsToken0);
  const calldata = encodePoolInitializationCalldata({
    token0: tokenOrder.token0,
    token1: tokenOrder.token1,
    sqrtPriceX96: BigInt(seedPrice.sqrtPriceX96),
  });
  const decoded = decodePoolInitializationCalldata(calldata);
  const expectedDecoded = {
    token0: tokenOrder.token0,
    token1: tokenOrder.token1,
    fee: String(PANCAKE_V3_FEE),
    sqrtPriceX96: seedPrice.sqrtPriceX96,
  };
  if (stableJson(decoded) !== stableJson(expectedDecoded)) {
    throw new Error(
      "Independent calldata decode did not reproduce the bound inputs.",
    );
  }

  const canonicalInput = {
    chainId: validatedChainId,
    ptaAddress: validatedPtaAddress,
  };
  const planBody = {
    schemaVersion: 3,
    kind: "pancake_v3_bsc_testnet_pta_wbnb_pool_preparation",
    status: "offline_unsigned_preparation_only",
    executionReady: false,
    signatureRequested: false,
    reviewCallTupleEmitted: true,
    completeTransactionRequestEmitted: false,
    serializedTransactionRequestEmitted: false,
    unsignedTransactionEnvelopeEmitted: false,
    signedTransactionEnvelopeEmitted: false,
    network: {
      name: "BNB Smart Chain Testnet",
      chainId: validatedChainId,
    },
    input: canonicalInput,
    scope: {
      included: "new pool creation and initialization review only",
      recipientOrAdminInput:
        "not applicable: this call creates no position, assigns no pool owner, and accepts no recipient/admin argument",
      excludes: [
        "PTA deployment",
        "token wrapping",
        "token approval",
        "liquidity mint",
        "position ownership",
        "swap",
        "oracle-cardinality increase",
        "signing",
        "broadcasting",
      ],
    },
    protocol: {
      name: "PancakeSwap V3",
      deployments: {
        factory: PANCAKE_V3_BSC_TESTNET_FACTORY,
        poolDeployer: PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER,
        positionManager: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        wrappedNative: BSC_TESTNET_WBNB,
      },
      poolParameters: {
        fee: String(PANCAKE_V3_FEE),
        feeDenominator: "1000000",
        tickSpacing: String(PANCAKE_V3_TICK_SPACING),
        derivation:
          "fee and tick spacing parsed from exact retained official factory source bytes; fresh onchain getter confirmation remains required",
      },
      retainedOfficialArtifacts: OFFICIAL_PANCAKE_V3_ARTIFACTS.provenance,
      derivedOfficialInterface: {
        initializer: OFFICIAL_PANCAKE_V3_ARTIFACTS.initializer,
        factoryReads: OFFICIAL_PANCAKE_V3_ARTIFACTS.factoryReads,
        poolCreatedEvent: OFFICIAL_PANCAKE_V3_ARTIFACTS.poolCreatedEvent,
      },
      retainedSourceReferences: {
        deploymentCommit: OFFICIAL_DEPLOYMENT_COMMIT,
        deploymentUrl: `https://github.com/pancakeswap/pancake-v3-contracts/blob/${OFFICIAL_DEPLOYMENT_COMMIT}/deployments/bscTestnet.json`,
        reviewedSourceCommit: REVIEWED_SOURCE_COMMIT,
        initializerUrl: `https://github.com/pancakeswap/pancake-v3-contracts/blob/${REVIEWED_SOURCE_COMMIT}/projects/v3-periphery/contracts/base/PoolInitializer.sol`,
        initializerInterfaceUrl: `https://github.com/pancakeswap/pancake-v3-contracts/blob/${REVIEWED_SOURCE_COMMIT}/projects/v3-periphery/contracts/interfaces/IPoolInitializer.sol`,
        factoryUrl: `https://github.com/pancakeswap/pancake-v3-contracts/blob/${REVIEWED_SOURCE_COMMIT}/projects/v3-core/contracts/PancakeV3Factory.sol`,
        poolDeployerUrl: `https://github.com/pancakeswap/pancake-v3-contracts/blob/${REVIEWED_SOURCE_COMMIT}/projects/v3-core/contracts/PancakeV3PoolDeployer.sol`,
      },
    },
    pair: {
      pta: {
        address: validatedPtaAddress,
        expectedDecimals: 18,
        status: "caller_supplied_address_not_verified_by_offline_tool",
      },
      wbnb: {
        address: BSC_TESTNET_WBNB,
        expectedDecimals: 18,
        retainedProofPath:
          "evidence/development/pancake-v3-testnet-wbnb-source-verification-2026-08-11.json",
        retainedProofFileSha256:
          "4bc0a265a26d48501877318299a5d4688fb5f939491c391aacad273dd386e53a",
        status: "retained_exact_proof_requires_fresh_code_binding",
      },
      token0: tokenOrder.token0,
      token1: tokenOrder.token1,
      ptaIsToken0: tokenOrder.ptaIsToken0,
      orderingMethod:
        "unsigned numeric comparison of the two exact 20-byte addresses",
    },
    initialization: {
      target: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      signature: POOL_INITIALIZER_SIGNATURE,
      selector: POOL_INITIALIZER_SELECTOR,
      arguments: expectedDecoded,
      calldata,
      nativeValueBaseUnits: "0",
      price: seedPrice,
      poolAddress: null,
      poolAddressStatus: "unresolved_not_guessed",
      poolAddressReason:
        "This package does not carry an independently bound Pancake pool creation-code hash and deployer derivation. CREATE2 prediction is therefore withheld.",
    },
    reviewCallTuple: {
      chainId: validatedChainId,
      to: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      data: calldata,
      nativeValueBaseUnits: "0",
      status: "review_components_only_not_a_transaction_request",
      omittedTransactionFields: [
        "from",
        "nonce",
        "gasLimit",
        "maxFeePerGas",
        "maxPriorityFeePerGas",
        "transactionType",
        "accessList",
        "broadcastNotBefore",
        "broadcastExpiresAt",
        "idempotencyClaim",
      ],
    },
    preflightReadCalls: buildPreflightReadCalls(tokenOrder),
    poolCreatedReceiptRequirement:
      buildPoolCreatedReceiptRequirement(tokenOrder),
    postResolutionPoolReadSelectors: {
      factory: { signature: "factory()", selector: "0xc45a0155" },
      token0: { signature: "token0()", selector: "0x0dfe1681" },
      token1: { signature: "token1()", selector: "0xd21220a7" },
      fee: { signature: "fee()", selector: "0xddca3f43" },
      tickSpacing: { signature: "tickSpacing()", selector: "0xd0c93a7c" },
      liquidity: { signature: "liquidity()", selector: "0x1a686502" },
      slot0: { signature: "slot0()", selector: "0x3850c7bd" },
    },
    blockers: buildOpenBlockers(),
    submissionLifecycleRequirements: {
      initializerHasDeadlineParameter:
        OFFICIAL_PANCAKE_V3_ARTIFACTS.initializer.hasDeadlineParameter,
      initializerHasOnchainTimeCheck:
        OFFICIAL_PANCAKE_V3_ARTIFACTS.initializer.hasOnchainTimeCheck,
      status: "unbound_blocks_pool_submission",
      requiredBindings: [
        "one exact sender address",
        "one exact account nonce reserved through a durable atomic one-shot claim",
        "maximum gas units",
        "maximum fee per gas and maximum total tBNB cost",
        "short broadcast not-before and expiry timestamps enforced outside calldata",
        "double-submit rejection across clicks, reloads, workers, and retries",
        "pending transaction reconciliation before any retry",
        "same-nonce replacement/cancellation rules and canonical final-hash reconciliation",
        "unsafe terminal state for stale-window, duplicate, unexpected-nonce, or ambiguously replaced mining",
      ],
      warning:
        "An offchain broadcast window and cancellation attempt cannot make this calldata expire onchain. Never describe an unmined cancellation as final, and never issue an independent-nonce retry.",
    },
    verificationRequirements: {
      beforeAnySubmission: [
        "Close every blocker whose scope is pool_submission.",
        "Require factory feeAmountTickSpacing(500) to decode to signed int24 10.",
        "Require factory getPool(token0,token1,500) to decode to the zero address at the same fresh finalized block.",
        "Recompute and compare the exact CREATE2 pool address; do not infer it from this manifest.",
        "Bind sender, nonce, gas/tBNB caps, short broadcast window, durable one-shot claim, and replacement/cancellation reconciliation because the initializer has no deadline.",
        "Simulate this exact target, zero value, and calldata from the intended sender, then require explicit wallet confirmation.",
        "Treat any state or code drift between review and confirmation as a hard abort.",
      ],
      afterConfirmedReceipt: [
        "Capture the BSC-testnet transaction hash, success receipt, block number/hash, sender, target, zero value, calldata digest, and explorer URL.",
        "Ordinary transaction receipts do not contain Solidity function return data; never claim a returned pool address from the receipt.",
        "Because this is a new-pool-only plan, decode exactly one PoolCreated log emitted by the pinned factory in this receipt and require its indexed token0/token1/fee plus data tickSpacing/pool to match the plan. A missing matching log is an unsafe race/stale outcome.",
        "Require the decoded PoolCreated pool, independently predicted CREATE2 address, and fresh post-receipt factory.getPool result to be identical.",
        "Require pool factory/token0/token1/fee/tickSpacing to equal the pinned tuple.",
        "Require pool slot0 sqrtPriceX96 and tick to match the arbitrary seed unless the transaction was raced; any mismatch permanently rejects the pool.",
        "Treat an eth_call or retained execution-trace return value as optional corroboration only, never as receipt data.",
        "Record liquidity as zero unless separately proven otherwise; do not label the pool economically active.",
        "Do not admit the pool for LP analysis or activation until oracle history, liquidity, ownership, permission, simulation, and selector-attestation gates independently close.",
      ],
    },
    raceDisclosure:
      "createAndInitializePoolIfNecessary does not re-enforce the requested price if another party initializes the pool first. Fresh reads and simulation cannot remove the inclusion-time race. This no-funds bootstrap call must be rejected after receipt if the pool state differs; later liquidity must never rely on the requested price alone.",
    safety: {
      broadcasts: false,
      networkCalls: false,
      readsRetainedPublicArtifacts: true,
      retainedPublicArtifactReadCount:
        OFFICIAL_PANCAKE_V3_ARTIFACTS.provenance.artifacts.length + 1,
      fileSystemWrites: false,
      readsEnvironment: false,
      readsPrivateKey: false,
      readsSigner: false,
      signsTransactions: false,
      reviewCallTupleEmitted: true,
      completeTransactionRequestEmitted: false,
      serializedTransactionRequestEmitted: false,
      unsignedTransactionEnvelopeEmitted: false,
      signedTransactionEnvelopeEmitted: false,
      approvalCalldataEmitted: false,
      liquidityCalldataEmitted: false,
      predictedPoolAddressEmitted: false,
    },
  };

  return {
    ...planBody,
    digests: {
      algorithm: "sha256",
      canonicalization:
        "UTF-8 JSON; recursive lexicographic object-key ordering; array order preserved; no whitespace",
      canonicalInputSha256: sha256(stableJson(canonicalInput)),
      canonicalPlanBodySha256: sha256(stableJson(planBody)),
      calldataSha256: sha256(Buffer.from(calldata.slice(2), "hex")),
    },
  };
}

export function serializePoolPreparation(preparation) {
  if (
    preparation?.kind !== "pancake_v3_bsc_testnet_pta_wbnb_pool_preparation" ||
    preparation.executionReady !== false ||
    preparation.signatureRequested !== false
  ) {
    throw new Error("Refusing to serialize an invalid pool-preparation plan.");
  }
  return `${JSON.stringify(preparation, null, 2)}\n`;
}
