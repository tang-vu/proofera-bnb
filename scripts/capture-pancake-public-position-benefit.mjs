import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const EXECUTE_FLAG = "--capture-public-position-benefit";
const POSITION_ARGUMENT = "--position-id";
const RPC_URL = "https://bsc-rpc.publicnode.com";
const AGENT_ENDPOINT = "https://proofera-lp.tangvu.dev/";
const POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_BODY_BYTES = 2_000_000;
const TIMEOUT_MS = 30_000;
const SELECTORS = Object.freeze({
  positions: "0x99fbab88",
  ownerOf: "0x6352211e",
  getPool: "0x1698ee82",
  slot0: "0x3850c7bd",
  tickSpacing: "0xd0c93a7c",
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  fee: "0xddca3f43"
});

function fail(code) {
  throw new Error(code);
}

function exactPositionId(argv) {
  if (!argv.includes(EXECUTE_FLAG)) fail("PANCAKE_PUBLIC_CAPTURE_EXACT_FLAG_REQUIRED");
  const index = argv.indexOf(POSITION_ARGUMENT);
  const value = index < 0 ? undefined : argv[index + 1];
  if (value === undefined || !/^[1-9][0-9]{0,77}$/.test(value)) {
    fail("PANCAKE_PUBLIC_CAPTURE_POSITION_ID_REQUIRED");
  }
  const id = BigInt(value);
  if (id > MAX_UINT256) fail("PANCAKE_PUBLIC_CAPTURE_POSITION_ID_INVALID");
  return id;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function abiArgument(value) {
  return value.toString(16).padStart(64, "0");
}

function assertHex(value, bytes, code) {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`, "u").test(value)) {
    fail(code);
  }
  return value.toLowerCase();
}

function words(value, minimum, code) {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{64})+$/u.test(value)) fail(code);
  const body = value.slice(2);
  const result = [];
  for (let offset = 0; offset < body.length; offset += 64) {
    result.push(body.slice(offset, offset + 64).toLowerCase());
  }
  if (result.length < minimum) fail(code);
  return result;
}

function wordAddress(word, code) {
  if (!/^0{24}[0-9a-f]{40}$/u.test(word)) fail(code);
  return `0x${word.slice(24)}`;
}

function wordUint(word, code) {
  if (!/^[0-9a-f]{64}$/u.test(word)) fail(code);
  return BigInt(`0x${word}`);
}

function signed24(word, code) {
  const raw = wordUint(word, code);
  const low = raw & 0xff_ffffn;
  const negative = (low & 0x80_0000n) !== 0n;
  const high = raw >> 24n;
  const negativeHigh = (1n << 232n) - 1n;
  if ((!negative && high !== 0n) || (negative && high !== negativeHigh)) fail(code);
  return negative ? Number(low - 0x100_0000n) : Number(low);
}

function sameAddress(left, right) {
  return left.toLowerCase() === right.toLowerCase();
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

const transcript = [];

async function rpc(method, params) {
  const id = `pancake-public-rpc-${transcript.length + 1}`;
  const request = { id, jsonrpc: "2.0", method, params };
  const body = JSON.stringify(request);
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (response.status !== 200) fail("PANCAKE_PUBLIC_CAPTURE_RPC_HTTP_INVALID");
  const responseBody = await response.text();
  if (Buffer.byteLength(responseBody) > MAX_BODY_BYTES)
    fail("PANCAKE_PUBLIC_CAPTURE_RPC_TOO_LARGE");
  let parsed;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    fail("PANCAKE_PUBLIC_CAPTURE_RPC_JSON_INVALID");
  }
  if (parsed?.jsonrpc !== "2.0" || parsed?.id !== id || parsed?.error !== undefined) {
    fail("PANCAKE_PUBLIC_CAPTURE_RPC_ENVELOPE_INVALID");
  }
  transcript.push({ request, response: parsed });
  return parsed.result;
}

async function exactCall(to, data, selector) {
  return rpc("eth_call", [{ data, to }, selector]);
}

async function capture(positionId) {
  const chainId = await rpc("eth_chainId", []);
  if (chainId !== "0x38") fail("PANCAKE_PUBLIC_CAPTURE_WRONG_CHAIN");
  const head = await rpc("eth_blockNumber", []);
  if (!/^0x[1-9a-f][0-9a-f]*$/u.test(head)) fail("PANCAKE_PUBLIC_CAPTURE_HEAD_INVALID");
  const block = await rpc("eth_getBlockByNumber", [head, false]);
  const blockHash = assertHex(block?.hash, 32, "PANCAKE_PUBLIC_CAPTURE_BLOCK_INVALID");
  if (block?.number?.toLowerCase() !== head.toLowerCase())
    fail("PANCAKE_PUBLIC_CAPTURE_BLOCK_INVALID");
  const blockNumber = BigInt(head);
  const timestamp = BigInt(block.timestamp);
  const observedAtUtc = new Date(Number(timestamp) * 1_000).toISOString().replace(".000Z", "Z");
  const selector = { blockHash, requireCanonical: true };
  const idArgument = abiArgument(positionId);

  const positionWords = words(
    await exactCall(POSITION_MANAGER, `${SELECTORS.positions}${idArgument}`, selector),
    12,
    "PANCAKE_PUBLIC_CAPTURE_POSITION_INVALID"
  );
  const token0 = wordAddress(positionWords[2], "PANCAKE_PUBLIC_CAPTURE_TOKEN_INVALID");
  const token1 = wordAddress(positionWords[3], "PANCAKE_PUBLIC_CAPTURE_TOKEN_INVALID");
  const fee = Number(wordUint(positionWords[4], "PANCAKE_PUBLIC_CAPTURE_FEE_INVALID"));
  const lowerTick = signed24(positionWords[5], "PANCAKE_PUBLIC_CAPTURE_LOWER_TICK_INVALID");
  const upperTick = signed24(positionWords[6], "PANCAKE_PUBLIC_CAPTURE_UPPER_TICK_INVALID");
  const liquidity = wordUint(positionWords[7], "PANCAKE_PUBLIC_CAPTURE_LIQUIDITY_INVALID");
  if (
    !sameAddress(token0, USDT) ||
    !sameAddress(token1, WBNB) ||
    fee !== 500 ||
    lowerTick >= upperTick ||
    liquidity === 0n
  ) {
    fail("PANCAKE_PUBLIC_CAPTURE_REVIEWED_POSITION_SCOPE_INVALID");
  }

  const ownerWords = words(
    await exactCall(POSITION_MANAGER, `${SELECTORS.ownerOf}${idArgument}`, selector),
    1,
    "PANCAKE_PUBLIC_CAPTURE_OWNER_INVALID"
  );
  const owner = wordAddress(ownerWords[0], "PANCAKE_PUBLIC_CAPTURE_OWNER_INVALID");
  if (sameAddress(owner, "0x0000000000000000000000000000000000000000")) {
    fail("PANCAKE_PUBLIC_CAPTURE_OWNER_INVALID");
  }

  const poolWords = words(
    await exactCall(
      FACTORY,
      `${SELECTORS.getPool}${positionWords[2]}${positionWords[3]}${positionWords[4]}`,
      selector
    ),
    1,
    "PANCAKE_PUBLIC_CAPTURE_POOL_INVALID"
  );
  const pool = wordAddress(poolWords[0], "PANCAKE_PUBLIC_CAPTURE_POOL_INVALID");
  if (sameAddress(pool, "0x0000000000000000000000000000000000000000")) {
    fail("PANCAKE_PUBLIC_CAPTURE_POOL_INVALID");
  }
  const code = await rpc("eth_getCode", [pool, selector]);
  if (typeof code !== "string" || !/^0x[0-9a-f]+$/u.test(code) || code === "0x") {
    fail("PANCAKE_PUBLIC_CAPTURE_POOL_CODE_INVALID");
  }

  const poolToken0 = wordAddress(
    words(
      await exactCall(pool, SELECTORS.token0, selector),
      1,
      "PANCAKE_PUBLIC_CAPTURE_POOL_TOKEN_INVALID"
    )[0],
    "PANCAKE_PUBLIC_CAPTURE_POOL_TOKEN_INVALID"
  );
  const poolToken1 = wordAddress(
    words(
      await exactCall(pool, SELECTORS.token1, selector),
      1,
      "PANCAKE_PUBLIC_CAPTURE_POOL_TOKEN_INVALID"
    )[0],
    "PANCAKE_PUBLIC_CAPTURE_POOL_TOKEN_INVALID"
  );
  const poolFee = Number(
    wordUint(
      words(
        await exactCall(pool, SELECTORS.fee, selector),
        1,
        "PANCAKE_PUBLIC_CAPTURE_POOL_FEE_INVALID"
      )[0],
      "PANCAKE_PUBLIC_CAPTURE_POOL_FEE_INVALID"
    )
  );
  if (!sameAddress(poolToken0, token0) || !sameAddress(poolToken1, token1) || poolFee !== fee) {
    fail("PANCAKE_PUBLIC_CAPTURE_POOL_RELATION_INVALID");
  }

  const slot0 = words(
    await exactCall(pool, SELECTORS.slot0, selector),
    2,
    "PANCAKE_PUBLIC_CAPTURE_SLOT0_INVALID"
  );
  const currentTick = signed24(slot0[1], "PANCAKE_PUBLIC_CAPTURE_CURRENT_TICK_INVALID");
  const tickSpacing = Number(
    wordUint(
      words(
        await exactCall(pool, SELECTORS.tickSpacing, selector),
        1,
        "PANCAKE_PUBLIC_CAPTURE_TICK_SPACING_INVALID"
      )[0],
      "PANCAKE_PUBLIC_CAPTURE_TICK_SPACING_INVALID"
    )
  );
  if (tickSpacing <= 0 || lowerTick % tickSpacing !== 0 || upperTick % tickSpacing !== 0) {
    fail("PANCAKE_PUBLIC_CAPTURE_TICK_SPACING_INVALID");
  }

  const analysisAtUtc = new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
  const input = {
    analysisAtUtc,
    capital: {
      amountMinorUnits: liquidity.toString(),
      asset: "V3_LIQUIDITY_UNITS",
      maximumMinorUnits: MAX_UINT256.toString(),
      minimumMinorUnits: "0",
      minorUnitDecimals: 0
    },
    chainId: 56,
    currentTick,
    lowerTick,
    observedAtBlock: blockNumber.toString(),
    observedAtUtc,
    poolAddress: pool,
    positionId: positionId.toString(),
    positionManagerAddress: POSITION_MANAGER,
    riskConstraints: {
      futureToleranceSeconds: 30,
      maximumRangeWidthTicks: 20_000,
      maximumSourceAgeSeconds: 86_400,
      minimumNetBenefitMinorUnits: "0",
      reviewBufferTicks: tickSpacing
    },
    skill: "analyze_lp_range",
    sourceLocator: {
      blockNumber: blockNumber.toString(),
      chainId: 56,
      kind: "onchain",
      poolAddress: pool,
      poolRead: "slot0()",
      positionManagerAddress: POSITION_MANAGER,
      positionRead: "positions(uint256)"
    },
    tickSpacing,
    upperTick
  };
  const requestId = `pancake-public-${blockNumber}-${positionId}`;
  const agentRequest = {
    id: requestId,
    jsonrpc: "2.0",
    method: "message/send",
    params: {
      message: {
        kind: "message",
        messageId: `${requestId}-request`,
        parts: [{ data: input, kind: "data" }],
        role: "user"
      }
    }
  };
  const agentRequestBody = canonical(agentRequest);
  const agentResponse = await fetch(AGENT_ENDPOINT, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: agentRequestBody,
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (agentResponse.status !== 200) fail("PANCAKE_PUBLIC_CAPTURE_AGENT_HTTP_INVALID");
  const agentResponseBody = await agentResponse.text();
  if (Buffer.byteLength(agentResponseBody) > MAX_BODY_BYTES)
    fail("PANCAKE_PUBLIC_CAPTURE_AGENT_TOO_LARGE");
  let agentEnvelope;
  try {
    agentEnvelope = JSON.parse(agentResponseBody);
  } catch {
    fail("PANCAKE_PUBLIC_CAPTURE_AGENT_JSON_INVALID");
  }
  const data = agentEnvelope?.result?.parts?.[0]?.data;
  if (
    agentEnvelope?.jsonrpc !== "2.0" ||
    agentEnvelope?.id !== requestId ||
    agentEnvelope?.result?.parts?.length !== 1 ||
    data?.executionEnabled !== false ||
    data?.positionId !== positionId.toString() ||
    data?.observedAtBlock !== blockNumber.toString() ||
    data?.currentTick !== currentTick ||
    data?.lowerTick !== lowerTick ||
    data?.upperTick !== upperTick
  ) {
    fail("PANCAKE_PUBLIC_CAPTURE_AGENT_ENVELOPE_INVALID");
  }

  return {
    schemaVersion: "proofera-pancake-public-position-benefit-v1.0.0",
    capturedAtUtc: analysisAtUtc,
    classification: {
      agentRegisteredOrHired: false,
      agentTransactionReceipt: false,
      benefitDemonstrated:
        "Exact-block boundary-risk detection with an explicit refusal to recommend a rebalance when economics are incomplete.",
      executionAuthority: false,
      ownerControlledByProofEra: false,
      performanceClaim: false,
      position: "public third-party BSC mainnet position"
    },
    limitations: [
      "The position owner is an unrelated public address; this capture establishes no ownership, approval, grant, or authority.",
      "Contract addresses and exact-hash reads establish state relations, not source-code identity or token value.",
      "The agent analyzes the supplied snapshot and does not independently fetch, attest, sign, or transact.",
      "No fee APR, net return, impermanent loss, execution quality, or counterfactual performance is claimed."
    ],
    source: {
      agentEndpoint: AGENT_ENDPOINT,
      blockHash,
      blockNumber: blockNumber.toString(),
      chainId: 56,
      factory: FACTORY,
      owner,
      pool,
      positionId: positionId.toString(),
      positionManager: POSITION_MANAGER,
      rpcOrigin: RPC_URL,
      token0,
      token1
    },
    exactState: {
      currentTick,
      fee,
      liquidity: liquidity.toString(),
      lowerTick,
      observedAtUtc,
      tickSpacing,
      upperTick
    },
    agent: {
      requestBody: agentRequestBody,
      requestSha256: sha256(agentRequestBody),
      responseBody: agentResponseBody,
      responseSha256: sha256(agentResponseBody),
      validatedOutput: data
    },
    rpcTranscript: transcript
  };
}

const positionId = exactPositionId(process.argv.slice(2));
const evidence = await capture(positionId);
const directory = resolve("evidence/pancake/runs/public-position");
await mkdir(directory, { recursive: true });
const filename = `${evidence.source.blockNumber}-${evidence.source.positionId}.json`;
const outputPath = resolve(directory, filename);
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx"
});
process.stdout.write(
  `${JSON.stringify({ decision: evidence.agent.validatedOutput.decision, outputPath, ownerControlledByProofEra: false })}\n`
);
