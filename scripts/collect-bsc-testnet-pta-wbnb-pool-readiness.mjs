import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { keccak256Bytes } from "./pancake-selector-review/review-lib.mjs";

const EXECUTION_FLAG = "--collect-exact-read-only";
const CAPTURE_FLAG = "--capture-exact-read-only-transcript";
const TRANSCRIPT_OUTPUT_URL = new URL(
  "../evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json",
  import.meta.url
);
const CHAIN_ID = 97n;
const PROVIDERS = Object.freeze([
  Object.freeze({
    role: "primary",
    origin: "https://bsc-testnet-dataseed.bnbchain.org"
  }),
  Object.freeze({
    role: "corroborator",
    origin: "https://bsc-testnet.bnbchain.org"
  })
]);
const ADDRESSES = Object.freeze({
  pta: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
  wbnb: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
  factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  poolDeployer: "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
  positionManager: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
  factoryOwner: "0x261AF0030618a52FA767997ed310174b3Bc3B77F",
  lmPoolDeployer: "0x7F1745eb74D26877EC54dd9A317CC930Ad01350c"
});
const FEE500_CANDIDATE = "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE";
const POOL_INIT_CODE_HASH = "0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2";
const KECCAK_DEPENDENCY_SHA256 = "9882a0adc797eddcb10376c1a0eed5418a1774a0f4762730052dda4d829d9e6c";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const UINT24_MAX = (1n << 24n) - 1n;
const MAXIMUM_RESPONSE_BYTES = 1_048_576;
const RPC_TIMEOUT_MS = 15_000;
const EIP1967_SLOTS = Object.freeze({
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"
});
const PROVIDER_ROLES = PROVIDERS.map(({ role }) => role);
const HEX_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const QUANTITY_PATTERN = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const WORD_PATTERN = /^0x[0-9a-fA-F]{64}$/;

let requestId = 0;
let failureStage = "initialization";

function fail() {
  throw new Error("READ_ONLY_COLLECTION_FAILED");
}

function sha256Utf8(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactHex(value) {
  if (typeof value !== "string" || !HEX_PATTERN.test(value)) fail();
  return value.toLowerCase();
}

function quantity(value) {
  if (typeof value !== "string" || !QUANTITY_PATTERN.test(value)) fail();
  return BigInt(value);
}

function word(value) {
  if (typeof value !== "bigint" || value < 0n || value > (1n << 256n) - 1n) fail();
  return value.toString(16).padStart(64, "0");
}

function addressWord(address) {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) fail();
  return address.slice(2).toLowerCase().padStart(64, "0");
}

function selector(signature) {
  return keccak256Bytes(Buffer.from(signature, "utf8")).slice(0, 10);
}

function calldata(signature, words = []) {
  return `${selector(signature)}${words.join("")}`;
}

function splitWords(raw) {
  const value = exactHex(raw);
  if ((value.length - 2) % 64 !== 0) fail();
  return Array.from({ length: (value.length - 2) / 64 }, (_, index) =>
    value.slice(2 + index * 64, 2 + (index + 1) * 64)
  );
}

function decodeAddress(raw) {
  if (!WORD_PATTERN.test(raw) || raw.slice(2, 26) !== "0".repeat(24)) fail();
  return `0x${raw.slice(26).toLowerCase()}`;
}

function decodeUint(raw) {
  if (!WORD_PATTERN.test(raw)) fail();
  return BigInt(raw).toString();
}

function decodeUint24(raw) {
  if (!WORD_PATTERN.test(raw)) fail();
  const value = BigInt(raw);
  if (value > UINT24_MAX) fail();
  return value.toString();
}

function decodeInt24(raw) {
  if (!WORD_PATTERN.test(raw)) fail();
  const encoded = BigInt(raw);
  const low = encoded & UINT24_MAX;
  const negative = low >= 1n << 23n;
  const expected = negative ? ((1n << 256n) - (1n << 24n)) | low : low;
  if (encoded !== expected) fail();
  return (negative ? low - (1n << 24n) : low).toString();
}

function decodeBoolWord(wordValue) {
  const value = BigInt(`0x${wordValue}`);
  if (value !== 0n && value !== 1n) fail();
  return value === 1n;
}

function decodeString(raw) {
  const value = exactHex(raw);
  const bytes = Buffer.from(value.slice(2), "hex");
  if (bytes.length < 64 || BigInt(`0x${bytes.subarray(0, 32).toString("hex")}`) !== 32n) fail();
  const length = BigInt(`0x${bytes.subarray(32, 64).toString("hex")}`);
  if (length > 256n) fail();
  const paddedLength = ((Number(length) + 31) >> 5) << 5;
  if (bytes.length !== 64 + paddedLength) fail();
  const padding = bytes.subarray(64 + Number(length));
  if (padding.some((byte) => byte !== 0)) fail();
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(64, 64 + Number(length)));
}

function decodeTwoBools(raw) {
  const words = splitWords(raw);
  if (words.length !== 2) fail();
  return {
    whitelistRequested: decodeBoolWord(words[0]),
    enabled: decodeBoolWord(words[1])
  };
}

function decodeParameters(raw) {
  const words = splitWords(raw);
  if (words.length !== 5) fail();
  return {
    factory: decodeAddress(`0x${words[0]}`),
    token0: decodeAddress(`0x${words[1]}`),
    token1: decodeAddress(`0x${words[2]}`),
    fee: decodeUint24(`0x${words[3]}`),
    tickSpacing: decodeInt24(`0x${words[4]}`)
  };
}

function projectedHeader(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const number = quantity(value.number);
  const hash = exactHex(value.hash);
  if (!WORD_PATTERN.test(hash)) fail();
  const timestamp = quantity(value.timestamp);
  return {
    number: number.toString(),
    numberHex: `0x${number.toString(16)}`,
    hash,
    timestampUnix: timestamp.toString(),
    timestampUtc: new Date(Number(timestamp) * 1000).toISOString()
  };
}

function parseRpcResponse(text, expectedRequestId) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail();
  }
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).sort().join(",") !== "id,jsonrpc,result" ||
    body.jsonrpc !== "2.0" ||
    body.id !== expectedRequestId
  ) {
    fail();
  }
  return body.result;
}

function validateInvocation(args, captureTargetExists) {
  if (
    !Array.isArray(args) ||
    args.length !== 1 ||
    (args[0] !== EXECUTION_FLAG && args[0] !== CAPTURE_FLAG) ||
    typeof captureTargetExists !== "boolean" ||
    (args[0] === CAPTURE_FLAG && captureTargetExists)
  ) {
    fail();
  }
  return args[0];
}

async function readBoundedResponseText(response) {
  if (response.body === null) fail();
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      if (!(value instanceof Uint8Array)) fail();
      byteLength += value.byteLength;
      if (byteLength > MAXIMUM_RESPONSE_BYTES) fail();
      chunks.push(Buffer.from(value));
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, byteLength));
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function rpc(provider, method, params) {
  const url = new URL(provider.origin);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== ""
  ) {
    fail();
  }
  const expectedRequestId = ++requestId;
  const response = await fetch(provider.origin, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: expectedRequestId, method, params }),
    redirect: "error",
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS)
  });
  const responseUrl = new URL(response.url);
  if (responseUrl.origin !== url.origin || responseUrl.pathname !== url.pathname) fail();
  if (!response.ok) fail();
  const text = await readBoundedResponseText(response);
  return parseRpcResponse(text, expectedRequestId);
}

async function dual(method, params, normalize) {
  const results = await Promise.all(PROVIDERS.map((provider) => rpc(provider, method, params)));
  const normalized = results.map((result) => normalize(result));
  if (stableJson(normalized[0]) !== stableJson(normalized[1])) fail();
  return {
    normalized: normalized[0],
    normalizedResultsByProvider: PROVIDERS.map(({ role }, index) => ({
      role,
      normalizedResult: normalized[index]
    })),
    rawResultsByProvider: PROVIDERS.map(({ role }, index) => ({
      role,
      rawResult: results[index]
    }))
  };
}

function scalarRead(label, method, params, normalized, normalizedResultsByProvider, decoded) {
  return {
    label,
    method,
    params,
    result: {
      retention: "exact_normalized_hex",
      normalizedResult: normalized,
      normalizedResultsByProvider,
      decoded
    },
    observedOnProviderRoles: PROVIDER_ROLES,
    providerAgreementVerified: true
  };
}

async function collectScalar(reads, label, method, params, decode, normalize = exactHex) {
  failureStage = label;
  const { normalized, normalizedResultsByProvider } = await dual(method, params, normalize);
  reads.push({
    ...scalarRead(
      label,
      method,
      params,
      normalized,
      normalizedResultsByProvider,
      decode(normalized)
    ),
    result: {
      retention: "exact_normalized_hex",
      normalizedResult: normalized,
      normalizedResultsByProvider,
      decoded: decode(normalized)
    }
  });
  return normalized;
}

async function collectCode(reads, label, address, blockSelector) {
  failureStage = label;
  const params = [address, blockSelector];
  const { normalized, normalizedResultsByProvider } = await dual("eth_getCode", params, exactHex);
  const bytes = Buffer.from(normalized.slice(2), "hex");
  const result = {
    retention: "exact_normalized_hex",
    byteLength: bytes.length,
    runtimeKeccak256: keccak256Bytes(bytes),
    runtimeSha256: sha256Bytes(bytes),
    rawResultUtf8Sha256: sha256Utf8(normalized)
  };
  result.normalizedResult = normalized;
  result.normalizedResultsByProvider = normalizedResultsByProvider;
  reads.push({
    label,
    method: "eth_getCode",
    params,
    result,
    observedOnProviderRoles: PROVIDER_ROLES,
    providerAgreementVerified: true
  });
  return result;
}

function expectRead(reads, label) {
  const matches = reads.filter((read) => read.label === label);
  if (matches.length !== 1) fail();
  return matches[0];
}

function assertExpectedSnapshot(reads, checkpoint) {
  if (expectRead(reads, "chain.identity").result.decoded !== CHAIN_ID.toString()) fail();
  const expectedCode = {
    pta: [1826, "0x2f8caecd2e51f085ab11a67e5b8a89eeab7b667bd89ec708a481b66ed756e006"],
    wbnb: [3124, "0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6"],
    factory: [5151, "0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c"],
    pool_deployer: [24556, "0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b"],
    position_manager: [24466, "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7"],
    factory_owner: [0, "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"],
    lm_pool_deployer: [7965, "0xa67e11e02fe13db93c99031a765ce45a1dd90dc020ef654ed3045b5a200766b5"],
    fee500_candidate: [0, "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"]
  };
  for (const [role, [byteLength, runtimeKeccak256]] of Object.entries(expectedCode)) {
    const result = expectRead(reads, `code.${role}`).result;
    if (result.byteLength !== byteLength || result.runtimeKeccak256 !== runtimeKeccak256) fail();
  }
  const expectedBindings = {
    "manager_binding.factory": ADDRESSES.factory,
    "manager_binding.deployer": ADDRESSES.poolDeployer,
    "manager_binding.wrapped_native": ADDRESSES.wbnb,
    "factory_binding.owner": ADDRESSES.factoryOwner,
    "factory_binding.lm_pool_deployer": ADDRESSES.lmPoolDeployer,
    "factory_binding.pool_deployer": ADDRESSES.poolDeployer,
    "pool_deployer_binding.factory_address": ADDRESSES.factory
  };
  for (const [label, expected] of Object.entries(expectedBindings)) {
    if (expectRead(reads, label).result.decoded !== expected.toLowerCase()) fail();
  }
  for (const read of reads.filter(({ label }) => label.startsWith("proxy_slot."))) {
    if (read.result.decoded !== `0x${"0".repeat(64)}`) fail();
  }
  const expectedTiers = new Map([
    ["100", "1"],
    ["500", "10"],
    ["2500", "50"],
    ["10000", "200"]
  ]);
  for (const [fee, spacing] of expectedTiers) {
    if (expectRead(reads, `fee_tier.${fee}.tick_spacing`).result.decoded !== spacing) fail();
    const extra = expectRead(reads, `fee_tier.${fee}.extra_info`).result.decoded;
    if (extra.whitelistRequested !== false || extra.enabled !== true) fail();
    if (expectRead(reads, `fee_tier.${fee}.get_pool`).result.decoded !== ZERO_ADDRESS) fail();
  }
  const parameters = expectRead(reads, "pool_deployer_binding.transient_parameters").result.decoded;
  if (
    parameters.factory !== ZERO_ADDRESS ||
    parameters.token0 !== ZERO_ADDRESS ||
    parameters.token1 !== ZERO_ADDRESS ||
    parameters.fee !== "0" ||
    parameters.tickSpacing !== "0"
  ) {
    fail();
  }
  if (
    expectRead(reads, "token.pta.decimals").result.decoded !== "18" ||
    expectRead(reads, "token.pta.total_supply").result.decoded !== "1000000000000000000000000" ||
    expectRead(reads, "token.wbnb.decimals").result.decoded !== "18" ||
    expectRead(reads, "nonce.fee500_candidate").result.decoded !== "0" ||
    checkpoint.hash !== expectRead(reads, "checkpoint.header").result.projection.hash
  ) {
    fail();
  }
}

function abiCallParams(to, signature, words = [], blockSelector) {
  return [{ to, data: calldata(signature, words) }, blockSelector];
}

function create2Derivation() {
  const token0 = BigInt(ADDRESSES.pta) < BigInt(ADDRESSES.wbnb) ? ADDRESSES.pta : ADDRESSES.wbnb;
  const token1 = token0 === ADDRESSES.pta ? ADDRESSES.wbnb : ADDRESSES.pta;
  const fee = 500n;
  const encodedSaltInput = Buffer.from(
    `${addressWord(token0)}${addressWord(token1)}${word(fee)}`,
    "hex"
  );
  const salt = keccak256Bytes(encodedSaltInput);
  const create2Input = Buffer.concat([
    Buffer.from([0xff]),
    Buffer.from(ADDRESSES.poolDeployer.slice(2), "hex"),
    Buffer.from(salt.slice(2), "hex"),
    Buffer.from(POOL_INIT_CODE_HASH.slice(2), "hex")
  ]);
  const digest = keccak256Bytes(create2Input);
  const candidateAddress = `0x${digest.slice(-40)}`;
  if (candidateAddress !== FEE500_CANDIDATE.toLowerCase()) fail();

  const cake = "0xFa60D973F7642B748046464e165A65B7323b0DEE";
  const cakeToken0 = BigInt(ADDRESSES.wbnb) < BigInt(cake) ? ADDRESSES.wbnb : cake;
  const cakeToken1 = cakeToken0 === ADDRESSES.wbnb ? cake : ADDRESSES.wbnb;
  const cakeSalt = keccak256Bytes(
    Buffer.from(`${addressWord(cakeToken0)}${addressWord(cakeToken1)}${word(fee)}`, "hex")
  );
  const cakeDigest = keccak256Bytes(
    Buffer.concat([
      Buffer.from([0xff]),
      Buffer.from(ADDRESSES.poolDeployer.slice(2), "hex"),
      Buffer.from(cakeSalt.slice(2), "hex"),
      Buffer.from(POOL_INIT_CODE_HASH.slice(2), "hex")
    ])
  );

  return {
    method:
      "last20(keccak256(0xff || poolDeployer || keccak256(abi.encode(token0,token1,fee)) || poolInitCodeHash))",
    token0: token0.toLowerCase(),
    token1: token1.toLowerCase(),
    fee: fee.toString(),
    poolDeployer: ADDRESSES.poolDeployer.toLowerCase(),
    poolInitCodeKeccak256: POOL_INIT_CODE_HASH,
    salt,
    candidateAddress,
    retainedKnownPoolCrossCheck: {
      pair: "WBNB/CAKE",
      fee: fee.toString(),
      salt: cakeSalt,
      predictedAddress: `0x${cakeDigest.slice(-40)}`,
      retainedObservedAddress: "0xeaf78e3aa2c19df9495318cd9ea2ad83be7d5015",
      matches: `0x${cakeDigest.slice(-40)}` === "0xeaf78e3aa2c19df9495318cd9ea2ad83be7d5015"
    }
  };
}

function selectCommonFinalizedCheckpoint(finalizedRaw, exactHeightBlocks) {
  if (
    !Array.isArray(finalizedRaw) ||
    !Array.isArray(exactHeightBlocks) ||
    finalizedRaw.length !== PROVIDERS.length ||
    exactHeightBlocks.length !== PROVIDERS.length
  ) {
    fail();
  }
  const finalizedHeaders = finalizedRaw.map(projectedHeader);
  const checkpointNumber = finalizedHeaders
    .map(({ number }) => BigInt(number))
    .reduce((left, right) => (left < right ? left : right));
  const checkpointNumberHex = `0x${checkpointNumber.toString(16)}`;
  const exactHeightHeaders = exactHeightBlocks.map(projectedHeader);
  if (
    exactHeightHeaders.some(({ number }) => BigInt(number) !== checkpointNumber) ||
    stableJson(exactHeightHeaders[0]) !== stableJson(exactHeightHeaders[1]) ||
    stableJson(exactHeightBlocks[0]) !== stableJson(exactHeightBlocks[1])
  ) {
    fail();
  }
  const checkpoint = exactHeightHeaders[0];
  for (const finalizedHeader of finalizedHeaders) {
    if (
      BigInt(finalizedHeader.number) === checkpointNumber &&
      finalizedHeader.hash !== checkpoint.hash
    ) {
      fail();
    }
  }
  return {
    finalizedHeaders,
    checkpointNumber,
    checkpointNumberHex,
    exactHeightHeaders,
    checkpoint
  };
}

async function collect(selectedFlag) {
  if (
    process.argv.slice(2).length !== 1 ||
    (selectedFlag !== EXECUTION_FLAG && selectedFlag !== CAPTURE_FLAG)
  ) {
    fail();
  }
  const keccakDependencyBytes = readFileSync(
    new URL("./pancake-selector-review/review-lib.mjs", import.meta.url)
  );
  if (sha256Bytes(keccakDependencyBytes) !== KECCAK_DEPENDENCY_SHA256) fail();

  const reads = [];
  await collectScalar(
    reads,
    "chain.identity",
    "eth_chainId",
    [],
    (raw) => quantity(raw).toString(),
    (raw) => `0x${quantity(raw).toString(16)}`
  );

  failureStage = "finality_selection";
  const finalizedRaw = await Promise.all(
    PROVIDERS.map((provider) => rpc(provider, "eth_getFinalizedBlock", [-3, false]))
  );
  const preliminaryFinalizedHeaders = finalizedRaw.map(projectedHeader);
  const preliminaryCheckpointNumber = preliminaryFinalizedHeaders
    .map(({ number }) => BigInt(number))
    .reduce((left, right) => (left < right ? left : right));
  const preliminaryCheckpointNumberHex = `0x${preliminaryCheckpointNumber.toString(16)}`;
  const exactHeightBlocks = await Promise.all(
    PROVIDERS.map((provider) =>
      rpc(provider, "eth_getBlockByNumber", [preliminaryCheckpointNumberHex, false])
    )
  );
  const { finalizedHeaders, checkpointNumberHex, checkpoint } = selectCommonFinalizedCheckpoint(
    finalizedRaw,
    exactHeightBlocks
  );
  const blockSelector = Object.freeze({ blockHash: checkpoint.hash, requireCanonical: true });

  const headerParams = [checkpoint.hash, false];
  failureStage = "checkpoint_header";
  const headerRead = await dual("eth_getBlockByHash", headerParams, projectedHeader);
  if (
    stableJson(headerRead.normalized) !== stableJson(checkpoint) ||
    stableJson(headerRead.rawResultsByProvider[0].rawResult) !==
      stableJson(headerRead.rawResultsByProvider[1].rawResult)
  ) {
    fail();
  }
  reads.push({
    label: "checkpoint.header",
    method: "eth_getBlockByHash",
    params: headerParams,
    result: {
      retention: "exact_raw_result_plus_claimed_projection",
      rawResultsByProvider: headerRead.rawResultsByProvider,
      normalizedResult: headerRead.normalized,
      normalizedResultsByProvider: headerRead.normalizedResultsByProvider,
      projection: headerRead.normalized,
      rawResultCanonicalJsonSha256ByProvider: headerRead.rawResultsByProvider.map(
        ({ role, rawResult }) => ({ role, sha256: sha256Utf8(stableJson(rawResult)) })
      ),
      rawResultOmittedReason: null
    },
    observedOnProviderRoles: PROVIDER_ROLES,
    providerAgreementVerified: true
  });

  const codeRoles = [
    ["pta", ADDRESSES.pta],
    ["wbnb", ADDRESSES.wbnb],
    ["factory", ADDRESSES.factory],
    ["pool_deployer", ADDRESSES.poolDeployer],
    ["position_manager", ADDRESSES.positionManager],
    ["factory_owner", ADDRESSES.factoryOwner],
    ["lm_pool_deployer", ADDRESSES.lmPoolDeployer],
    ["fee500_candidate", FEE500_CANDIDATE]
  ];
  for (const [role, address] of codeRoles) {
    await collectCode(reads, `code.${role}`, address, blockSelector);
    await collectScalar(
      reads,
      `nonce.${role}`,
      "eth_getTransactionCount",
      [address, blockSelector],
      (raw) => quantity(raw).toString(),
      (raw) => `0x${quantity(raw).toString(16)}`
    );
  }

  for (const [role, address] of codeRoles.slice(0, 5)) {
    for (const [slotName, slot] of Object.entries(EIP1967_SLOTS)) {
      await collectScalar(
        reads,
        `proxy_slot.${role}.${slotName}`,
        "eth_getStorageAt",
        [address, slot, blockSelector],
        (raw) => exactHex(raw)
      );
    }
  }

  for (const [role, address] of [
    ["pta", ADDRESSES.pta],
    ["wbnb", ADDRESSES.wbnb]
  ]) {
    await collectScalar(
      reads,
      `token.${role}.name`,
      "eth_call",
      abiCallParams(address, "name()", [], blockSelector),
      decodeString
    );
    await collectScalar(
      reads,
      `token.${role}.symbol`,
      "eth_call",
      abiCallParams(address, "symbol()", [], blockSelector),
      decodeString
    );
    await collectScalar(
      reads,
      `token.${role}.decimals`,
      "eth_call",
      abiCallParams(address, "decimals()", [], blockSelector),
      decodeUint
    );
    await collectScalar(
      reads,
      `token.${role}.total_supply`,
      "eth_call",
      abiCallParams(address, "totalSupply()", [], blockSelector),
      decodeUint
    );
  }

  for (const [label, signature] of [
    ["factory", "factory()"],
    ["deployer", "deployer()"],
    ["wrapped_native", "WETH9()"]
  ]) {
    await collectScalar(
      reads,
      `manager_binding.${label}`,
      "eth_call",
      abiCallParams(ADDRESSES.positionManager, signature, [], blockSelector),
      decodeAddress
    );
  }

  for (const [label, signature] of [
    ["owner", "owner()"],
    ["lm_pool_deployer", "lmPoolDeployer()"],
    ["pool_deployer", "poolDeployer()"]
  ]) {
    await collectScalar(
      reads,
      `factory_binding.${label}`,
      "eth_call",
      abiCallParams(ADDRESSES.factory, signature, [], blockSelector),
      decodeAddress
    );
  }

  await collectScalar(
    reads,
    "pool_deployer_binding.factory_address",
    "eth_call",
    abiCallParams(ADDRESSES.poolDeployer, "factoryAddress()", [], blockSelector),
    decodeAddress
  );
  await collectScalar(
    reads,
    "pool_deployer_binding.transient_parameters",
    "eth_call",
    abiCallParams(ADDRESSES.poolDeployer, "parameters()", [], blockSelector),
    decodeParameters
  );

  for (const fee of [100n, 500n, 2500n, 10000n]) {
    const feeWord = word(fee);
    await collectScalar(
      reads,
      `fee_tier.${fee}.tick_spacing`,
      "eth_call",
      abiCallParams(ADDRESSES.factory, "feeAmountTickSpacing(uint24)", [feeWord], blockSelector),
      decodeInt24
    );
    await collectScalar(
      reads,
      `fee_tier.${fee}.extra_info`,
      "eth_call",
      abiCallParams(
        ADDRESSES.factory,
        "feeAmountTickSpacingExtraInfo(uint24)",
        [feeWord],
        blockSelector
      ),
      decodeTwoBools
    );
    await collectScalar(
      reads,
      `fee_tier.${fee}.get_pool`,
      "eth_call",
      abiCallParams(
        ADDRESSES.factory,
        "getPool(address,address,uint24)",
        [addressWord(ADDRESSES.pta), addressWord(ADDRESSES.wbnb), feeWord],
        blockSelector
      ),
      decodeAddress
    );
  }

  assertExpectedSnapshot(reads, checkpoint);

  const body = {
    schemaVersion: 1,
    recordType: "bsc_testnet_pta_wbnb_pool_readiness_rpc_transcript",
    status: "fresh_at_capture_read_only_non_authorizing_raw_transcript",
    snapshotObservedAt: new Date().toISOString(),
    chainId: Number(CHAIN_ID),
    collector: {
      path: "scripts/collect-bsc-testnet-pta-wbnb-pool-readiness.mjs",
      invocation: `node scripts/collect-bsc-testnet-pta-wbnb-pool-readiness.mjs ${selectedFlag}`,
      sourceSha256: sha256Bytes(readFileSync(fileURLToPath(import.meta.url))),
      dependencies: [
        {
          path: "scripts/pancake-selector-review/review-lib.mjs",
          purpose: "Keccak-256 implementation used for runtime and CREATE2 derivations",
          sourceSha256: KECCAK_DEPENDENCY_SHA256
        }
      ],
      acceptsCustomRpcOrigin: false,
      readsEnvironment: false,
      writesFiles: selectedFlag === CAPTURE_FLAG,
      writeBoundary:
        selectedFlag === CAPTURE_FLAG
          ? {
              mode: "create_new_fixed_public_transcript_only",
              path: "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json",
              acceptsCallerPath: false,
              overwritesExistingFile: false
            }
          : null,
      signsTransactions: false,
      broadcastsTransactions: false
    },
    providers: PROVIDERS.map(({ role, origin }) => ({
      role,
      origin,
      credentialFreePublicOrigin: true
    })),
    finalityCapture: {
      method: "eth_getFinalizedBlock",
      params: [-3, false],
      selection: "minimum finalized height returned by the two pinned providers",
      providerResults: PROVIDERS.map(({ role }, index) => ({
        role,
        rawResult: finalizedRaw[index],
        projectedHeader: finalizedHeaders[index]
      })),
      exactHeightCrossCheck: {
        method: "eth_getBlockByNumber",
        params: [checkpointNumberHex, false],
        providerRawResults: PROVIDERS.map(({ role }, index) => ({
          role,
          rawResult: exactHeightBlocks[index]
        })),
        providerAgreementVerified: true
      }
    },
    checkpoint: {
      ...checkpoint,
      stateSelector: blockSelector
    },
    retentionPolicy: {
      scalarAbiAndStorageResults:
        "both providers' exact normalized public results retained after equality",
      runtimeCodeResults:
        "both providers' exact normalized public bytecode retained with derived hashes",
      blockResults: "both providers' exact public block result objects retained",
      requestIdsRetained: false,
      requestHeadersRetained: false,
      responseHeadersRetained: false,
      rawSignedTransactionsRetained: false
    },
    reads,
    derivations: {
      // Computed only after every RPC observation has passed.
      fee500Create2: create2Derivation()
    },
    boundaries: {
      historicalAfterCapture: true,
      authorizesTransaction: false,
      poolCreationReceipt: false,
      poolExistsClaim: false,
      liquidityClaim: false,
      oracleClaim: false,
      activationClaim: false,
      rawLongRuntimeBytecodeFullyRetained: true
    }
  };

  return {
    ...body,
    integrity: {
      canonicalization:
        "UTF-8 JSON; recursive lexicographic object-key ordering; array order preserved; no whitespace",
      canonicalBodySha256: sha256Utf8(stableJson(body))
    }
  };
}

export {
  ADDRESSES,
  CAPTURE_FLAG,
  EIP1967_SLOTS,
  EXECUTION_FLAG,
  FEE500_CANDIDATE,
  KECCAK_DEPENDENCY_SHA256,
  POOL_INIT_CODE_HASH,
  PROVIDERS,
  ZERO_ADDRESS,
  addressWord,
  calldata,
  create2Derivation,
  decodeAddress,
  decodeBoolWord,
  decodeInt24,
  decodeParameters,
  decodeString,
  decodeTwoBools,
  decodeUint,
  decodeUint24,
  exactHex,
  parseRpcResponse,
  projectedHeader,
  quantity,
  selectCommonFinalizedCheckpoint,
  selector,
  sha256Bytes,
  sha256Utf8,
  splitWords,
  stableJson,
  validateInvocation,
  word
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const selectedFlag = validateInvocation(
      process.argv.slice(2),
      existsSync(fileURLToPath(TRANSCRIPT_OUTPUT_URL))
    );
    const transcript = await collect(selectedFlag);
    const serialized = `${JSON.stringify(transcript, null, 2)}\n`;
    if (selectedFlag === CAPTURE_FLAG) {
      const outputPath = fileURLToPath(TRANSCRIPT_OUTPUT_URL);
      const handle = openSync(outputPath, "wx", 0o600);
      try {
        writeFileSync(handle, serialized, { encoding: "utf8" });
        fsyncSync(handle);
      } finally {
        closeSync(handle);
      }
      process.stdout.write(
        `${JSON.stringify({
          status: "captured_fixed_public_transcript",
          path: "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json",
          canonicalBodySha256: transcript.integrity.canonicalBodySha256
        })}\n`
      );
    } else {
      process.stdout.write(serialized);
    }
  } catch {
    process.stderr.write(`READ_ONLY_COLLECTION_FAILED:${failureStage}\n`);
    process.exitCode = 1;
  }
}
