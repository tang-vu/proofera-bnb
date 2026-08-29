import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXECUTE_FLAG = "--capture-exact-pta-wbnb-lp-outcome";
const SOURCE_COMMIT_ARGUMENT = "--source-commit";
const FINALITY_CONFIRMATIONS = 12n;
const MAXIMUM_BODY_BYTES = 2_000_000;
const MAXIMUM_GIT_OUTPUT_BYTES = 8_000_000;
const RPC_TIMEOUT_MS = 20_000;
const UINT256_MODULUS = 1n << 256n;
const Q128 = 1n << 128n;

const OWNER = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";
const PTA = "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const POSITION_MANAGER = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
const POOL = "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE";
const TOKEN_ID = 37_109n;
const FEE = 500n;
const TICK_LOWER = -887_270;
const TICK_UPPER = 887_270;
const INITIALIZER_TRANSACTION_HASH =
  "0xa24d1dfa3440de3fcb644d9b52847bcc8d54f43a2e29b425f50bbce4bd684022";
const INITIALIZER_BLOCK_HASH = "0xd7b9b18b3a02e3b0b8bcc8f403507e2fb53ba575eb02b9ca0002d9a8bb9131d6";
const INITIALIZER_BLOCK_NUMBER = 127_284_872n;
const INITIALIZE_TOPIC = "0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95";
const INITIAL_SQRT_PRICE_X96 = 79_228_162_514_264_337_593_543_950n;
const INITIAL_TICK = -138_163;
const INITIAL_LIQUIDITY = 1_000_000_000_000_000_000n;
const DESIRED_PTA_RAW = 1_000_000_000_000_000_000_000n;
const DESIRED_NATIVE_WEI = 1_000_000_000_000_000n;

const FIRST_LP_ARTIFACT =
  "evidence/onchain/bsc-testnet-pta-wbnb-first-lp-eed9c32a107b57735f45bd6246d967cb12fbb1579a05faa9f17e0ead46187d01.json";
const FIRST_LP_SHA256 = "3fa80573ea8cd3ee85208670048bffed48d757c2e8674757ac3331077f121d6a";
const MANUAL_BASELINE_ARTIFACT =
  "evidence/termix/runs/pancake-lp/manual/pancake-lp-manual-20260818-v1.json";

const RPC_PROVIDERS = Object.freeze([
  Object.freeze({ id: "bnb-chain", url: "https://data-seed-prebsc-2-s2.binance.org:8545" }),
  Object.freeze({ id: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" })
]);

const SELECTORS = Object.freeze({
  feeGrowthGlobal0X128: "0xf3058399",
  feeGrowthGlobal1X128: "0x46141319",
  liquidity: "0x1a686502",
  ownerOf: "0x6352211e",
  positions: "0x99fbab88",
  slot0: "0x3850c7bd",
  ticks: "0xf30dba93"
});

function fail(code) {
  throw new Error(code);
}

function parseArguments(argv) {
  if (
    argv.length !== 3 ||
    argv[0] !== EXECUTE_FLAG ||
    argv[1] !== SOURCE_COMMIT_ARGUMENT ||
    !/^[0-9a-f]{40}$/u.test(argv[2] ?? "")
  ) {
    fail("PTA_WBNB_OUTCOME_EXACT_INVOCATION_REQUIRED");
  }
  return argv[2];
}

function git(repositoryRoot, arguments_) {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function verifyRelease(repositoryRoot, sourceCommit) {
  if (git(repositoryRoot, ["rev-parse", "HEAD"]) !== sourceCommit) {
    fail("PTA_WBNB_OUTCOME_HEAD_MISMATCH");
  }
  if (git(repositoryRoot, ["rev-parse", "origin/main"]) !== sourceCommit) {
    fail("PTA_WBNB_OUTCOME_RELEASE_UNPUBLISHED");
  }
  if (git(repositoryRoot, ["status", "--porcelain"]) !== "") {
    fail("PTA_WBNB_OUTCOME_WORKTREE_DIRTY");
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function doesNotExist(path) {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

function quantity(value, code) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(value)) fail(code);
  return BigInt(value);
}

function hex32(value, code) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/u.test(value)) fail(code);
  return value;
}

function words(value, expected, code) {
  if (typeof value !== "string" || !/^0x(?:[0-9a-f]{64})+$/u.test(value)) fail(code);
  const body = value.slice(2);
  const result = [];
  for (let index = 0; index < body.length; index += 64) result.push(body.slice(index, index + 64));
  if (result.length !== expected) fail(code);
  return result;
}

function unsigned(word, bits, code) {
  if (!/^[0-9a-f]{64}$/u.test(word)) fail(code);
  const value = BigInt(`0x${word}`);
  if (value >= 1n << BigInt(bits)) fail(code);
  return value;
}

function signed(word, bits, code) {
  if (!/^[0-9a-f]{64}$/u.test(word)) fail(code);
  const width = BigInt(bits);
  const raw = BigInt(`0x${word}`);
  const lowMask = (1n << width) - 1n;
  const low = raw & lowMask;
  const negative = (low & (1n << (width - 1n))) !== 0n;
  const high = raw >> width;
  const expectedHigh = negative ? (1n << (256n - width)) - 1n : 0n;
  if (high !== expectedHigh) fail(code);
  return negative ? low - (1n << width) : low;
}

function address(word, code) {
  if (!/^0{24}[0-9a-f]{40}$/u.test(word)) fail(code);
  return `0x${word.slice(24)}`;
}

function booleanWord(word, code) {
  const value = unsigned(word, 8, code);
  if (value !== 0n && value !== 1n) fail(code);
  return value === 1n;
}

function abiUint(value) {
  if (value < 0n || value >= UINT256_MODULUS) fail("PTA_WBNB_OUTCOME_ABI_UINT_INVALID");
  return value.toString(16).padStart(64, "0");
}

function abiInt(value, bits) {
  const width = BigInt(bits);
  const minimum = -(1n << (width - 1n));
  const maximum = (1n << (width - 1n)) - 1n;
  if (value < minimum || value > maximum) fail("PTA_WBNB_OUTCOME_ABI_INT_INVALID");
  return BigInt.asUintN(256, value).toString(16).padStart(64, "0");
}

function sameAddress(left, right) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function normalizeBlock(value, expectedNumber, code) {
  if (value === null || typeof value !== "object") fail(code);
  const number = quantity(value.number, code);
  const timestamp = quantity(value.timestamp, code);
  const hash = hex32(value.hash, code);
  const parentHash = hex32(value.parentHash, code);
  if (number !== expectedNumber) fail(code);
  return Object.freeze({ hash, number, parentHash, timestamp });
}

function normalizeInitializerReceipt(value) {
  const code = "PTA_WBNB_OUTCOME_INITIALIZER_RECEIPT_INVALID";
  if (value === null || typeof value !== "object" || !Array.isArray(value.logs)) fail(code);
  if (
    hex32(value.transactionHash, code) !== INITIALIZER_TRANSACTION_HASH ||
    hex32(value.blockHash, code) !== INITIALIZER_BLOCK_HASH ||
    quantity(value.blockNumber, code) !== INITIALIZER_BLOCK_NUMBER ||
    quantity(value.status, code) !== 1n
  ) {
    fail(code);
  }
  const initializeLogs = value.logs.filter(
    (log) =>
      log !== null &&
      typeof log === "object" &&
      sameAddress(log.address ?? "", POOL) &&
      Array.isArray(log.topics) &&
      log.topics.length === 1 &&
      log.topics[0] === INITIALIZE_TOPIC
  );
  if (initializeLogs.length !== 1) fail(code);
  const decoded = words(initializeLogs[0].data, 2, code);
  const sqrtPriceX96 = unsigned(decoded[0], 160, code);
  const tick = Number(signed(decoded[1], 24, code));
  if (sqrtPriceX96 !== INITIAL_SQRT_PRICE_X96 || tick !== INITIAL_TICK) fail(code);
  return Object.freeze({
    blockHash: INITIALIZER_BLOCK_HASH,
    blockNumber: INITIALIZER_BLOCK_NUMBER,
    sqrtPriceX96,
    tick,
    transactionHash: INITIALIZER_TRANSACTION_HASH
  });
}

function decodePosition(raw) {
  const value = words(raw, 12, "PTA_WBNB_OUTCOME_POSITION_INVALID");
  return Object.freeze({
    nonce: unsigned(value[0], 96, "PTA_WBNB_OUTCOME_POSITION_INVALID"),
    operator: address(value[1], "PTA_WBNB_OUTCOME_POSITION_INVALID"),
    token0: address(value[2], "PTA_WBNB_OUTCOME_POSITION_INVALID"),
    token1: address(value[3], "PTA_WBNB_OUTCOME_POSITION_INVALID"),
    fee: unsigned(value[4], 24, "PTA_WBNB_OUTCOME_POSITION_INVALID"),
    tickLower: Number(signed(value[5], 24, "PTA_WBNB_OUTCOME_POSITION_INVALID")),
    tickUpper: Number(signed(value[6], 24, "PTA_WBNB_OUTCOME_POSITION_INVALID")),
    liquidity: unsigned(value[7], 128, "PTA_WBNB_OUTCOME_POSITION_INVALID"),
    feeGrowthInside0LastX128: unsigned(value[8], 256, "PTA_WBNB_OUTCOME_POSITION_INVALID"),
    feeGrowthInside1LastX128: unsigned(value[9], 256, "PTA_WBNB_OUTCOME_POSITION_INVALID"),
    tokensOwed0: unsigned(value[10], 128, "PTA_WBNB_OUTCOME_POSITION_INVALID"),
    tokensOwed1: unsigned(value[11], 128, "PTA_WBNB_OUTCOME_POSITION_INVALID")
  });
}

function decodeSlot0(raw) {
  const value = words(raw, 7, "PTA_WBNB_OUTCOME_SLOT0_INVALID");
  return Object.freeze({
    sqrtPriceX96: unsigned(value[0], 160, "PTA_WBNB_OUTCOME_SLOT0_INVALID"),
    tick: Number(signed(value[1], 24, "PTA_WBNB_OUTCOME_SLOT0_INVALID")),
    observationIndex: unsigned(value[2], 16, "PTA_WBNB_OUTCOME_SLOT0_INVALID"),
    observationCardinality: unsigned(value[3], 16, "PTA_WBNB_OUTCOME_SLOT0_INVALID"),
    observationCardinalityNext: unsigned(value[4], 16, "PTA_WBNB_OUTCOME_SLOT0_INVALID"),
    feeProtocol: unsigned(value[5], 32, "PTA_WBNB_OUTCOME_SLOT0_INVALID"),
    unlocked: booleanWord(value[6], "PTA_WBNB_OUTCOME_SLOT0_INVALID")
  });
}

function decodeTick(raw) {
  const value = words(raw, 8, "PTA_WBNB_OUTCOME_TICK_INVALID");
  return Object.freeze({
    liquidityGross: unsigned(value[0], 128, "PTA_WBNB_OUTCOME_TICK_INVALID"),
    liquidityNet: signed(value[1], 128, "PTA_WBNB_OUTCOME_TICK_INVALID"),
    feeGrowthOutside0X128: unsigned(value[2], 256, "PTA_WBNB_OUTCOME_TICK_INVALID"),
    feeGrowthOutside1X128: unsigned(value[3], 256, "PTA_WBNB_OUTCOME_TICK_INVALID"),
    initialized: booleanWord(value[7], "PTA_WBNB_OUTCOME_TICK_INVALID")
  });
}

function jsonBigInts(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function serialize(value) {
  return JSON.parse(JSON.stringify(value, jsonBigInts));
}

function subtractUint256(left, right) {
  return (left - right + UINT256_MODULUS) % UINT256_MODULUS;
}

function feeGrowthInside(state, token) {
  const global = token === 0 ? state.feeGrowthGlobal0X128 : state.feeGrowthGlobal1X128;
  const lowerOutside =
    token === 0 ? state.lowerTick.feeGrowthOutside0X128 : state.lowerTick.feeGrowthOutside1X128;
  const upperOutside =
    token === 0 ? state.upperTick.feeGrowthOutside0X128 : state.upperTick.feeGrowthOutside1X128;
  const below =
    state.slot0.tick >= TICK_LOWER ? lowerOutside : subtractUint256(global, lowerOutside);
  const above =
    state.slot0.tick < TICK_UPPER ? upperOutside : subtractUint256(global, upperOutside);
  return subtractUint256(subtractUint256(global, below), above);
}

function currentUncollectedFees(state) {
  const inside0 = feeGrowthInside(state, 0);
  const inside1 = feeGrowthInside(state, 1);
  const delta0 = subtractUint256(inside0, state.position.feeGrowthInside0LastX128);
  const delta1 = subtractUint256(inside1, state.position.feeGrowthInside1LastX128);
  return Object.freeze({
    feeGrowthInside0X128: inside0,
    feeGrowthInside1X128: inside1,
    amount0Raw: state.position.tokensOwed0 + (state.position.liquidity * delta0) / Q128,
    amount1Raw: state.position.tokensOwed1 + (state.position.liquidity * delta1) / Q128
  });
}

function createRpcClient(provider) {
  let requestIndex = 0;
  const transcript = [];
  return Object.freeze({
    provider,
    transcript,
    async call(method, params) {
      const id = `${provider.id}-${++requestIndex}`;
      const request = { id, jsonrpc: "2.0", method, params };
      const requestBody = JSON.stringify(request);
      const response = await fetch(provider.url, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: requestBody,
        redirect: "error",
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS)
      });
      const responseBody = await response.text();
      if (response.status !== 200 || Buffer.byteLength(responseBody) > MAXIMUM_BODY_BYTES) {
        fail("PTA_WBNB_OUTCOME_RPC_HTTP_INVALID");
      }
      let envelope;
      try {
        envelope = JSON.parse(responseBody);
      } catch {
        fail("PTA_WBNB_OUTCOME_RPC_JSON_INVALID");
      }
      if (
        envelope?.jsonrpc !== "2.0" ||
        envelope?.id !== id ||
        envelope?.error !== undefined ||
        envelope?.result === undefined
      ) {
        fail("PTA_WBNB_OUTCOME_RPC_ENVELOPE_INVALID");
      }
      transcript.push({
        request,
        requestSha256: sha256(Buffer.from(requestBody, "utf8")),
        response: envelope,
        responseSha256: sha256(Buffer.from(responseBody, "utf8"))
      });
      return envelope.result;
    }
  });
}

async function exactCall(client, to, data, blockHash) {
  return client.call("eth_call", [
    { data, to },
    { blockHash, requireCanonical: true }
  ]);
}

async function readState(client, blockHash) {
  const ownerWords = words(
    await exactCall(
      client,
      POSITION_MANAGER,
      `${SELECTORS.ownerOf}${abiUint(TOKEN_ID)}`,
      blockHash
    ),
    1,
    "PTA_WBNB_OUTCOME_OWNER_INVALID"
  );
  const position = decodePosition(
    await exactCall(
      client,
      POSITION_MANAGER,
      `${SELECTORS.positions}${abiUint(TOKEN_ID)}`,
      blockHash
    )
  );
  const slot0 = decodeSlot0(await exactCall(client, POOL, SELECTORS.slot0, blockHash));
  const poolLiquidity = unsigned(
    words(
      await exactCall(client, POOL, SELECTORS.liquidity, blockHash),
      1,
      "PTA_WBNB_OUTCOME_POOL_LIQUIDITY_INVALID"
    )[0],
    128,
    "PTA_WBNB_OUTCOME_POOL_LIQUIDITY_INVALID"
  );
  const feeGrowthGlobal0X128 = unsigned(
    words(
      await exactCall(client, POOL, SELECTORS.feeGrowthGlobal0X128, blockHash),
      1,
      "PTA_WBNB_OUTCOME_FEE_GROWTH_INVALID"
    )[0],
    256,
    "PTA_WBNB_OUTCOME_FEE_GROWTH_INVALID"
  );
  const feeGrowthGlobal1X128 = unsigned(
    words(
      await exactCall(client, POOL, SELECTORS.feeGrowthGlobal1X128, blockHash),
      1,
      "PTA_WBNB_OUTCOME_FEE_GROWTH_INVALID"
    )[0],
    256,
    "PTA_WBNB_OUTCOME_FEE_GROWTH_INVALID"
  );
  const lowerTick = decodeTick(
    await exactCall(client, POOL, `${SELECTORS.ticks}${abiInt(BigInt(TICK_LOWER), 24)}`, blockHash)
  );
  const upperTick = decodeTick(
    await exactCall(client, POOL, `${SELECTORS.ticks}${abiInt(BigInt(TICK_UPPER), 24)}`, blockHash)
  );
  return Object.freeze({
    owner: address(ownerWords[0], "PTA_WBNB_OUTCOME_OWNER_INVALID"),
    position,
    slot0,
    poolLiquidity,
    feeGrowthGlobal0X128,
    feeGrowthGlobal1X128,
    lowerTick,
    upperTick
  });
}

function validateIdentity(state) {
  if (
    !sameAddress(state.owner, OWNER) ||
    !sameAddress(state.position.operator, "0x0000000000000000000000000000000000000000") ||
    !sameAddress(state.position.token0, PTA) ||
    !sameAddress(state.position.token1, WBNB) ||
    state.position.fee !== FEE ||
    state.position.tickLower !== TICK_LOWER ||
    state.position.tickUpper !== TICK_UPPER ||
    !state.lowerTick.initialized ||
    !state.upperTick.initialized
  ) {
    fail("PTA_WBNB_OUTCOME_IDENTITY_DRIFT");
  }
}

function assertProviderAgreement(left, right, code) {
  if (canonical(serialize(left)) !== canonical(serialize(right))) fail(code);
}

async function capture(sourceCommit) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  verifyRelease(repositoryRoot, sourceCommit);

  const firstLpPath = resolve(repositoryRoot, FIRST_LP_ARTIFACT);
  const firstLpBytes = await readFile(firstLpPath);
  if (sha256(firstLpBytes) !== FIRST_LP_SHA256) fail("PTA_WBNB_OUTCOME_FIRST_LP_DIGEST_MISMATCH");
  const firstLp = JSON.parse(firstLpBytes.toString("utf8"));
  const mintBlockNumber = BigInt(firstLp?.mint?.receipt?.blockNumber ?? "");
  const mintBlockHash = hex32(
    firstLp?.mint?.receipt?.blockHash,
    "PTA_WBNB_OUTCOME_FIRST_LP_INVALID"
  );
  const mintAmount0 = BigInt(firstLp?.postState?.events?.amount0Raw ?? "");
  const mintAmount1 = BigInt(firstLp?.postState?.events?.amount1Raw ?? "");
  const initialObservation = firstLp?.postState?.observations?.[0];
  const initialPosition = initialObservation?.position;
  const approvalGas =
    BigInt(firstLp?.approval?.receipt?.gasUsed ?? "") *
    BigInt(firstLp?.approval?.receipt?.effectiveGasPrice ?? "");
  const mintGas =
    BigInt(firstLp?.mint?.receipt?.gasUsed ?? "") *
    BigInt(firstLp?.mint?.receipt?.effectiveGasPrice ?? "");
  if (
    mintBlockNumber !== 127_841_040n ||
    mintAmount0 !== DESIRED_PTA_RAW ||
    mintAmount1 !== DESIRED_NATIVE_WEI ||
    firstLp?.postState?.providerAgreementVerified !== true ||
    !sameAddress(initialObservation?.owner ?? "", OWNER) ||
    !sameAddress(initialPosition?.operator ?? "", "0x0000000000000000000000000000000000000000") ||
    !sameAddress(initialPosition?.token0 ?? "", PTA) ||
    !sameAddress(initialPosition?.token1 ?? "", WBNB) ||
    BigInt(initialPosition?.fee ?? "") !== FEE ||
    initialPosition?.tickLower !== TICK_LOWER ||
    initialPosition?.tickUpper !== TICK_UPPER ||
    BigInt(initialPosition?.liquidity ?? "") !== INITIAL_LIQUIDITY ||
    BigInt(initialPosition?.feeGrowthInside0LastX128 ?? "") !== 0n ||
    BigInt(initialPosition?.feeGrowthInside1LastX128 ?? "") !== 0n ||
    BigInt(initialPosition?.tokensOwed0 ?? "") !== 0n ||
    BigInt(initialPosition?.tokensOwed1 ?? "") !== 0n ||
    BigInt(initialObservation?.poolLiquidityRaw ?? "") !== INITIAL_LIQUIDITY
  ) {
    fail("PTA_WBNB_OUTCOME_FIRST_LP_INVALID");
  }

  const clients = RPC_PROVIDERS.map(createRpcClient);
  const heads = [];
  for (const client of clients) {
    if (quantity(await client.call("eth_chainId", []), "PTA_WBNB_OUTCOME_CHAIN_INVALID") !== 97n) {
      fail("PTA_WBNB_OUTCOME_CHAIN_INVALID");
    }
    heads.push(quantity(await client.call("eth_blockNumber", []), "PTA_WBNB_OUTCOME_HEAD_INVALID"));
  }
  const minimumHead = heads[0] < heads[1] ? heads[0] : heads[1];
  if (
    minimumHead <= FINALITY_CONFIRMATIONS ||
    minimumHead - FINALITY_CONFIRMATIONS <= mintBlockNumber
  ) {
    fail("PTA_WBNB_OUTCOME_WINDOW_TOO_SHORT");
  }
  const observationBlockNumber = minimumHead - FINALITY_CONFIRMATIONS;
  const observationTag = `0x${observationBlockNumber.toString(16)}`;

  const providerObservations = [];
  for (let index = 0; index < clients.length; index += 1) {
    const client = clients[index];
    const mintBlock = normalizeBlock(
      await client.call("eth_getBlockByHash", [mintBlockHash, false]),
      mintBlockNumber,
      "PTA_WBNB_OUTCOME_MINT_BLOCK_INVALID"
    );
    const initializerReceipt = normalizeInitializerReceipt(
      await client.call("eth_getTransactionReceipt", [INITIALIZER_TRANSACTION_HASH])
    );
    const observationBlock = normalizeBlock(
      await client.call("eth_getBlockByNumber", [observationTag, false]),
      observationBlockNumber,
      "PTA_WBNB_OUTCOME_OBSERVATION_BLOCK_INVALID"
    );
    const currentState = await readState(client, observationBlock.hash);
    validateIdentity(currentState);
    providerObservations.push({
      provider: client.provider.id,
      rpcOrigin: client.provider.url,
      headBlockNumber: heads[index],
      mintBlock,
      initializerReceipt,
      observationBlock,
      currentState,
      transcript: client.transcript
    });
  }

  assertProviderAgreement(
    providerObservations[0].mintBlock,
    providerObservations[1].mintBlock,
    "PTA_WBNB_OUTCOME_MINT_BLOCK_DISAGREEMENT"
  );
  assertProviderAgreement(
    providerObservations[0].observationBlock,
    providerObservations[1].observationBlock,
    "PTA_WBNB_OUTCOME_OBSERVATION_BLOCK_DISAGREEMENT"
  );
  assertProviderAgreement(
    providerObservations[0].initializerReceipt,
    providerObservations[1].initializerReceipt,
    "PTA_WBNB_OUTCOME_INITIALIZER_RECEIPT_DISAGREEMENT"
  );
  assertProviderAgreement(
    providerObservations[0].currentState,
    providerObservations[1].currentState,
    "PTA_WBNB_OUTCOME_CURRENT_STATE_DISAGREEMENT"
  );

  const currentState = providerObservations[0].currentState;
  const fees = currentUncollectedFees(currentState);
  const priceUnchanged = INITIAL_SQRT_PRICE_X96 === currentState.slot0.sqrtPriceX96;
  const tickUnchanged = INITIAL_TICK === currentState.slot0.tick;
  const positionUnchanged =
    INITIAL_LIQUIDITY === currentState.position.liquidity &&
    INITIAL_LIQUIDITY === currentState.poolLiquidity;
  const durationSeconds =
    providerObservations[0].observationBlock.timestamp -
    providerObservations[0].mintBlock.timestamp;
  if (durationSeconds <= 0n) fail("PTA_WBNB_OUTCOME_DURATION_INVALID");

  const manualBaselinePath = resolve(repositoryRoot, MANUAL_BASELINE_ARTIFACT);
  const manualBaselineBytes = await readFile(manualBaselinePath);
  const gasCostWei = approvalGas + mintGas;
  const outcome = {
    schemaVersion: "proofera-bsc-testnet-pta-wbnb-lp-outcome-v1.0.0",
    status: "bounded_outcome_observed",
    sourceCommit,
    observedAtUtc: new Date(
      Number(providerObservations[0].observationBlock.timestamp) * 1_000
    ).toISOString(),
    classification: {
      autonomousAgentExecution: false,
      benefitDemonstrated: false,
      economicValueClaim: false,
      mainnet: false,
      ownerExecutedFixture: true,
      readOnly: true,
      transactionAuthorized: false,
      transactionBroadcast: false
    },
    sourceEvidence: {
      firstLpArtifact: FIRST_LP_ARTIFACT,
      firstLpSha256: FIRST_LP_SHA256,
      manualBaselineArtifact: MANUAL_BASELINE_ARTIFACT,
      manualBaselineSha256: sha256(manualBaselineBytes)
    },
    identity: {
      chainId: 97,
      owner: OWNER,
      pool: POOL,
      positionManager: POSITION_MANAGER,
      token0: PTA,
      token1: WBNB,
      tokenId: TOKEN_ID,
      fee: FEE,
      tickLower: TICK_LOWER,
      tickUpper: TICK_UPPER
    },
    window: {
      finalityConfirmations: FINALITY_CONFIRMATIONS,
      mintBlockNumber,
      mintBlockHash,
      mintedAtUtc: new Date(
        Number(providerObservations[0].mintBlock.timestamp) * 1_000
      ).toISOString(),
      observationBlockNumber,
      observationBlockHash: providerObservations[0].observationBlock.hash,
      durationBlocks: observationBlockNumber - mintBlockNumber,
      durationSeconds,
      providerAgreementVerified: true
    },
    initialState: {
      priceSource: "dual-provider initializer receipt",
      positionSource: FIRST_LP_ARTIFACT,
      sqrtPriceX96: INITIAL_SQRT_PRICE_X96,
      tick: INITIAL_TICK,
      positionLiquidityRaw: INITIAL_LIQUIDITY,
      poolLiquidityRaw: INITIAL_LIQUIDITY,
      feeGrowthInside0LastX128: 0n,
      feeGrowthInside1LastX128: 0n,
      tokensOwed0Raw: 0n,
      tokensOwed1Raw: 0n
    },
    currentState: {
      sqrtPriceX96: currentState.slot0.sqrtPriceX96,
      tick: currentState.slot0.tick,
      positionLiquidityRaw: currentState.position.liquidity,
      poolLiquidityRaw: currentState.poolLiquidity,
      feeGrowthGlobal0X128: currentState.feeGrowthGlobal0X128,
      feeGrowthGlobal1X128: currentState.feeGrowthGlobal1X128,
      feeGrowthInside0X128: fees.feeGrowthInside0X128,
      feeGrowthInside1X128: fees.feeGrowthInside1X128,
      tokensOwed0Raw: currentState.position.tokensOwed0,
      tokensOwed1Raw: currentState.position.tokensOwed1
    },
    metrics: {
      priceUnchanged,
      tickUnchanged,
      positionLiquidityUnchanged: positionUnchanged,
      observedUncollectedFee0Raw: fees.amount0Raw,
      observedUncollectedFee1Raw: fees.amount1Raw,
      estimatedImpermanentLossBps: priceUnchanged && positionUnchanged ? 0 : null,
      impermanentLossMethod:
        priceUnchanged && positionUnchanged
          ? "Exact zero because the pool sqrt price and position liquidity are unchanged across the bounded window."
          : "Unavailable without a complete token valuation and counterfactual inventory calculation.",
      mintAmount0DesiredMinusConsumedRaw: DESIRED_PTA_RAW - mintAmount0,
      mintAmount1DesiredMinusConsumedRaw: DESIRED_NATIVE_WEI - mintAmount1,
      marketSlippageCostRaw: null,
      marketSlippageReason:
        "The direct mint supplied assets at the initialized pool price and did not execute a swap; no external market oracle was authorized or retained.",
      approvalGasCostWei: approvalGas,
      mintGasCostWei: mintGas,
      totalGasCostWei: gasCostWei,
      observedWbnbFeeMinusGasWei: fees.amount1Raw - gasCostWei
    },
    baselineComparison: {
      comparable: false,
      agentAdvantageEstablished: false,
      reason:
        "The frozen manual baseline is a read-only range-decision timing task over an unrelated BSC-mainnet position. This outcome is an owner-executed BSC-testnet fixture position, so an economic or autonomous-agent comparison would be invalid."
    },
    conclusion: {
      realizedBenefit: "not_observed",
      summary:
        fees.amount0Raw === 0n && fees.amount1Raw === 0n && priceUnchanged && positionUnchanged
          ? "No fee income, price movement, liquidity change or impermanent loss was observed in the bounded window; gas remains a recorded cost."
          : "The bounded state changed, but the retained data is insufficient for a realized-benefit or agent-advantage claim."
    },
    providers: providerObservations,
    limitations: [
      "PTA is a fixed-supply BSC-testnet fixture without an asserted market value; WBNB and gas amounts are testnet units.",
      "Zero estimated impermanent loss is limited to the exact unchanged pool-price and unchanged-liquidity window; it is not a forecast.",
      "Position-manager tokensOwed fields alone can be stale, so fee amounts are recomputed from exact fee-growth state and position liquidity.",
      "The initial price is bound to the Initialize event returned in the same transaction receipt by both fixed providers; the exact initial position fields come from the digest-pinned first-LP artifact because the public RPCs do not promise archival eth_call support.",
      "No external price oracle, token valuation, swap simulation, withdrawal, collect, burn, approval, signature or broadcast is introduced.",
      "The owner-executed mint cannot establish autonomous-agent performance or superiority over the unrelated manual decision baseline."
    ]
  };

  const serialized = serialize(outcome);
  const outputDirectory = resolve(
    repositoryRoot,
    "evidence",
    "pancake",
    "runs",
    "pta-wbnb-outcomes"
  );
  const outputPath = resolve(
    outputDirectory,
    `${mintBlockNumber.toString()}-${observationBlockNumber.toString()}.json`
  );
  if (!(await doesNotExist(outputPath))) fail("PTA_WBNB_OUTCOME_OUTPUT_EXISTS");
  const outputBytes = Buffer.from(`${JSON.stringify(serialized, null, 2)}\n`, "utf8");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, outputBytes, { flag: "wx" });
  return Object.freeze({
    artifact: relative(repositoryRoot, outputPath).replaceAll("\\", "/"),
    artifactSha256: sha256(outputBytes),
    durationSeconds: durationSeconds.toString(),
    observationBlockNumber: observationBlockNumber.toString(),
    realizedBenefit: serialized.conclusion.realizedBenefit
  });
}

const sourceCommit = parseArguments(process.argv.slice(2));
const result = await capture(sourceCommit);
process.stdout.write(`${JSON.stringify(result)}\n`);
