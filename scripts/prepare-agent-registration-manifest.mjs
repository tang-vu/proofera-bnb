import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const integrationRequire = createRequire(
  new URL("../packages/integrations/package.json", import.meta.url)
);
const { encodeFunctionData, keccak256 } = integrationRequire("viem");

const EXECUTE_FLAG = "--prepare-exact-registration-manifest";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const CHAIN_ID = 97;
const PROTOCOL_VERSION = "0.3.0";
const SDK_VERSION = "0.4.2";
const BUILT_WITH = `https://github.com/bnb-chain/bnbagent-sdk#v${SDK_VERSION}`;
const FUNDING_PER_WALLET_WEI = 3_000_000_000_000_000n;
const GAS_PRICE_CAP_WEI = 200_000_000n;
const GAS_LIMIT_CAP_PER_TRANSACTION = 1_000_000n;
const FINALITY_DEPTH = 12n;
const TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 1_000_000;

const PROVIDERS = Object.freeze([
  { name: "bnb-chain", url: "https://data-seed-prebsc-2-s2.binance.org:8545" },
  { name: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" }
]);

const AGENTS = Object.freeze([
  {
    key: "lp-range",
    wallet: "0xAd03eF7e21c35FD1446c153f6eE5e6165F696990",
    root: "https://proofera-lp.tangvu.dev/",
    name: "ProofEra LP Risk Evidence Agent",
    description:
      "Deterministic, read-only PancakeSwap LP range and scoped permission evidence analysis on BSC mainnet and testnet.",
    skills: ["analyze_lp_range", "audit_altana_permission_bundle"]
  },
  {
    key: "grid-trading",
    wallet: "0xFBfFa9BA36d578AFF2d05EDe840Fc7088e70ADB8",
    root: "https://proofera-grid.tangvu.dev/",
    name: "ProofEra Grid Trading Evidence Agent",
    description:
      "Deterministic, read-only BSC grid candidate analysis backed only by caller-supplied evidence.",
    skills: ["analyze_grid_trading"]
  },
  {
    key: "yield-optimisation",
    wallet: "0x62Af37A6FD89374684C00e2402FD96143f96ee85",
    root: "https://proofera-yield.tangvu.dev/",
    name: "yieldOptimisationAgent-agent",
    description:
      "ProofEra deterministic yield route evidence analyzer for BSC mainnet and testnet. Read-only; missing evidence lowers confidence.",
    skills: ["analyze_yield_opportunities"]
  },
  {
    key: "health-factor",
    wallet: "0x708cb7F2b974d94005E762A140c469F1125e0cB4",
    root: "https://proofera-health.tangvu.dev/",
    name: "ProofEra Health-Factor Guardian Evidence Agent",
    description:
      "Deterministic, read-only Venus Core Pool health-factor and monitoring-evidence analysis.",
    skills: ["analyze_venus_health_factor"]
  }
]);

const REGISTRY_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  },
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentURI", type: "string" },
      {
        name: "metadata",
        type: "tuple[]",
        components: [
          { name: "metadataKey", type: "string" },
          { name: "metadataValue", type: "bytes" }
        ]
      }
    ],
    outputs: [{ name: "agentId", type: "uint256" }]
  },
  {
    type: "function",
    name: "setAgentURI",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" }
    ],
    outputs: []
  }
];

function fail(code) {
  throw new Error(code);
}

function sourceBaseCommit(argv) {
  const index = argv.indexOf(SOURCE_COMMIT_ARGUMENT);
  const value = index < 0 ? undefined : argv[index + 1];
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    fail("ERC8004_PREPARATION_SOURCE_BASE_COMMIT_REQUIRED");
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function dataUri(value) {
  return `data:application/json;base64,${Buffer.from(canonical(value), "utf8").toString("base64")}`;
}

function hexQuantity(value) {
  return `0x${value.toString(16)}`;
}

function parseQuantity(value, code) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/iu.test(value)) fail(code);
  return BigInt(value);
}

function exactHex(value, bytes, code) {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, "iu").test(value)) {
    fail(code);
  }
  return value.toLowerCase();
}

const rpcTranscript = [];

async function rpc(provider, method, params, allowError = false) {
  const id = `erc8004-${provider.name}-${rpcTranscript.length + 1}`;
  const request = { id, jsonrpc: "2.0", method, params };
  const response = await fetch(provider.url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(request),
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (response.status !== 200) fail("ERC8004_RPC_HTTP_INVALID");
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) fail("ERC8004_RPC_TOO_LARGE");
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    fail("ERC8004_RPC_JSON_INVALID");
  }
  if (parsed?.jsonrpc !== "2.0" || parsed?.id !== id) fail("ERC8004_RPC_ENVELOPE_INVALID");
  rpcTranscript.push({ provider: provider.name, request, response: parsed });
  if (parsed.error !== undefined) {
    if (allowError) return { error: parsed.error };
    fail("ERC8004_RPC_RETURNED_ERROR");
  }
  return { result: parsed.result };
}

async function readJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (response.status !== 200) fail("ERC8004_AGENT_HTTP_INVALID");
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) fail("ERC8004_AGENT_BODY_TOO_LARGE");
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    fail("ERC8004_AGENT_JSON_INVALID");
  }
  return { body, parsed, sha256: sha256(body), status: response.status, url };
}

function registrationFile(agent, agentId) {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: agent.name,
    description: agent.description,
    image: "",
    services: [
      {
        name: "A2A",
        endpoint: `${agent.root}.well-known/agent-card.json`,
        version: PROTOCOL_VERSION
      }
    ],
    registrations:
      agentId === undefined ? [] : [{ agentId, agentRegistry: `eip155:${CHAIN_ID}:${REGISTRY}` }]
  };
}

function decodeUint256(value, code) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/iu.test(value)) fail(code);
  return BigInt(value);
}

function validateCard(agent, card) {
  const skillIds = Array.isArray(card.skills)
    ? card.skills.map((skill) =>
        skill !== null && typeof skill === "object" && typeof skill.id === "string"
          ? skill.id
          : null
      )
    : [];
  if (
    card.name !== agent.name ||
    card.description !== agent.description ||
    card.protocolVersion !== PROTOCOL_VERSION ||
    card.url !== agent.root ||
    skillIds.length !== agent.skills.length ||
    skillIds.some((skillId, index) => skillId !== agent.skills[index])
  ) {
    fail("ERC8004_AGENT_CARD_MISMATCH");
  }
}

async function prepare(baseCommit) {
  const chainIds = await Promise.all(
    PROVIDERS.map(async (provider) =>
      parseQuantity((await rpc(provider, "eth_chainId", [])).result, "ERC8004_CHAIN_ID_INVALID")
    )
  );
  if (chainIds.some((chainId) => chainId !== BigInt(CHAIN_ID))) fail("ERC8004_WRONG_CHAIN");

  const heads = await Promise.all(
    PROVIDERS.map(async (provider) =>
      parseQuantity((await rpc(provider, "eth_blockNumber", [])).result, "ERC8004_HEAD_INVALID")
    )
  );
  const minimumHead = heads.reduce((left, right) => (left < right ? left : right));
  if (minimumHead <= FINALITY_DEPTH) fail("ERC8004_HEAD_TOO_LOW");
  const blockNumber = minimumHead - FINALITY_DEPTH;
  const blockTag = hexQuantity(blockNumber);
  const blocks = await Promise.all(
    PROVIDERS.map(
      async (provider) => (await rpc(provider, "eth_getBlockByNumber", [blockTag, false])).result
    )
  );
  const blockHashes = blocks.map((block) => exactHex(block?.hash, 32, "ERC8004_BLOCK_INVALID"));
  if (new Set(blockHashes).size !== 1) fail("ERC8004_PROVIDER_BLOCK_HASH_MISMATCH");
  const blockHash = blockHashes[0];
  const observedAtUtc = new Date(
    Number(parseQuantity(blocks[0].timestamp, "ERC8004_BLOCK_TIMESTAMP_INVALID")) * 1_000
  ).toISOString();

  const registryCodes = await Promise.all(
    PROVIDERS.map(
      async (provider) => (await rpc(provider, "eth_getCode", [REGISTRY, blockTag])).result
    )
  );
  for (const code of registryCodes) {
    if (typeof code !== "string" || !/^0x[0-9a-f]+$/iu.test(code) || code === "0x") {
      fail("ERC8004_REGISTRY_CODE_INVALID");
    }
  }
  const registryCodeHashes = registryCodes.map((code) => keccak256(code));
  if (new Set(registryCodeHashes).size !== 1) fail("ERC8004_REGISTRY_CODE_MISMATCH");

  const gasPrices = await Promise.all(
    PROVIDERS.map(async (provider) =>
      parseQuantity((await rpc(provider, "eth_gasPrice", [])).result, "ERC8004_GAS_PRICE_INVALID")
    )
  );
  const cardReads = await Promise.all(
    AGENTS.map(async (agent) => {
      const ping = await readJson(`${agent.root}ping`);
      if (ping.parsed?.status !== "HEALTHY" || ping.parsed?.executionEnabled !== false) {
        fail("ERC8004_AGENT_PING_INVALID");
      }
      const card = await readJson(`${agent.root}.well-known/agent-card.json`);
      validateCard(agent, card.parsed);
      return { card, ping };
    })
  );

  const agents = [];
  for (const [index, agent] of AGENTS.entries()) {
    const initialFile = registrationFile(agent);
    const initialUri = dataUri(initialFile);
    const registerCalldata = encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: "register",
      args: [
        initialUri,
        [
          {
            metadataKey: "built_with",
            metadataValue: `0x${Buffer.from(BUILT_WITH).toString("hex")}`
          }
        ]
      ]
    });
    const balanceOfCalldata = encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: "balanceOf",
      args: [agent.wallet]
    });
    const observations = [];
    for (const provider of PROVIDERS) {
      const balance = parseQuantity(
        (await rpc(provider, "eth_getBalance", [agent.wallet, blockTag])).result,
        "ERC8004_BALANCE_INVALID"
      );
      const nonce = parseQuantity(
        (await rpc(provider, "eth_getTransactionCount", [agent.wallet, blockTag])).result,
        "ERC8004_NONCE_INVALID"
      );
      const owned = decodeUint256(
        (await rpc(provider, "eth_call", [{ data: balanceOfCalldata, to: REGISTRY }, blockTag]))
          .result,
        "ERC8004_OWNED_COUNT_INVALID"
      );
      const estimate = await rpc(
        provider,
        "eth_estimateGas",
        [{ data: registerCalldata, from: agent.wallet, to: REGISTRY, value: "0x0" }, blockTag],
        true
      );
      observations.push({
        provider: provider.name,
        balanceWei: balance.toString(),
        nonce: nonce.toString(),
        ownedAgentCount: owned.toString(),
        registerGasEstimate:
          estimate.error === undefined
            ? {
                gas: parseQuantity(estimate.result, "ERC8004_GAS_ESTIMATE_INVALID").toString(),
                status: "available"
              }
            : { error: estimate.error, status: "unavailable" }
      });
    }
    if (
      observations.some(
        (observation) =>
          observation.balanceWei !== observations[0].balanceWei ||
          observation.nonce !== observations[0].nonce ||
          observation.ownedAgentCount !== observations[0].ownedAgentCount
      )
    ) {
      fail("ERC8004_PROVIDER_STATE_MISMATCH");
    }
    const cardRead = cardReads[index];
    agents.push({
      key: agent.key,
      wallet: agent.wallet,
      publicSurface: {
        root: agent.root,
        ping: {
          bodySha256: cardRead.ping.sha256,
          responseBody: cardRead.ping.body,
          status: cardRead.ping.status,
          url: cardRead.ping.url
        },
        agentCard: {
          bodySha256: cardRead.card.sha256,
          responseBody: cardRead.card.body,
          status: cardRead.card.status,
          url: cardRead.card.url
        }
      },
      initialRegistration: {
        decodedAgentUri: initialFile,
        agentUri: initialUri,
        metadata: [{ key: "built_with", value: BUILT_WITH }],
        transaction: {
          calldata: registerCalldata,
          calldataBytesSha256: sha256(Buffer.from(registerCalldata.slice(2), "hex")),
          function: "register(string,(string,bytes)[])",
          to: REGISTRY,
          valueWei: "0"
        }
      },
      completionTemplate: {
        binding:
          "Replace <agentId-from-confirmed-Registered-event> only after transaction 1 is confirmed; regenerate the canonical URI with registrations[0].agentId set to that exact integer.",
        function: "setAgentURI(uint256,string)",
        agentUriTemplate: registrationFile(agent, "<agentId-from-confirmed-Registered-event>"),
        calldata: null,
        calldataStatus: "not_knowable_before_confirmed_registration",
        gasEstimate: null,
        gasEstimateStatus: "not_knowable_before_confirmed_registration",
        to: REGISTRY,
        valueWei: "0"
      },
      observations,
      readiness: {
        alreadyRegistered: observations[0].ownedAgentCount !== "0",
        funded: BigInt(observations[0].balanceWei) >= FUNDING_PER_WALLET_WEI,
        registrationAuthorized: false,
        status:
          observations[0].ownedAgentCount !== "0"
            ? "manual_reconciliation_required"
            : BigInt(observations[0].balanceWei) < FUNDING_PER_WALLET_WEI
              ? "blocked_unfunded"
              : "awaiting_explicit_approval"
      }
    });
  }

  const maxObservedGasPrice = gasPrices.reduce((left, right) => (left > right ? left : right));
  const manifest = {
    schemaVersion: "proofera-erc8004-registration-preparation-v1.0.0",
    classification: {
      artifact: "read_only_preparation",
      fundingExecuted: false,
      registrationExecuted: false,
      registrationReceiptEvidence: false,
      signingPerformed: false
    },
    sourceBaseCommit: baseCommit,
    network: {
      name: "bsc-testnet",
      chainId: CHAIN_ID,
      registry: REGISTRY,
      registryCodeHash: registryCodeHashes[0],
      blockNumber: blockNumber.toString(),
      blockHash,
      observedAtUtc,
      finalityDepth: FINALITY_DEPTH.toString(),
      providers: PROVIDERS.map(({ name, url }) => ({ name, url }))
    },
    toolchain: {
      bagVersion: "0.0.5",
      bnbagentSdkVersion: SDK_VERSION,
      protocol: "A2A",
      protocolVersion: PROTOCOL_VERSION,
      sdkRegisterFlow: ["register(string,(string,bytes)[])", "setAgentURI(uint256,string)"]
    },
    costBoundary: {
      fundingPerWalletWei: FUNDING_PER_WALLET_WEI.toString(),
      fundingTotalWei: (FUNDING_PER_WALLET_WEI * BigInt(AGENTS.length)).toString(),
      gasLimitCapPerTransaction: GAS_LIMIT_CAP_PER_TRANSACTION.toString(),
      gasPriceCapWei: GAS_PRICE_CAP_WEI.toString(),
      maximumRegistrationTransactions: 2,
      maximumRegistrationGasCostPerAgentWei: (
        GAS_LIMIT_CAP_PER_TRANSACTION *
        GAS_PRICE_CAP_WEI *
        2n
      ).toString(),
      maximumRegistrationGasCostAllAgentsWei: (
        GAS_LIMIT_CAP_PER_TRANSACTION *
        GAS_PRICE_CAP_WEI *
        2n *
        BigInt(AGENTS.length)
      ).toString(),
      observedGasPriceWeiByProvider: Object.fromEntries(
        PROVIDERS.map((provider, index) => [provider.name, gasPrices[index].toString()])
      ),
      observedGasPriceWithinCap: maxObservedGasPrice <= GAS_PRICE_CAP_WEI,
      approvalScope:
        "Any funding, signing, registration, retry, or completion transaction remains separately and explicitly approval-gated."
    },
    agents,
    rpcTranscript
  };
  const directory = resolve("evidence", "erc8004", "preparations");
  const output = resolve(directory, `${blockNumber}-four-agent-registration-preparation.json`);
  await mkdir(directory, { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  return { output, sha256: sha256(`${JSON.stringify(manifest, null, 2)}\n`) };
}

const argv = process.argv.slice(2);
if (!argv.includes(EXECUTE_FLAG)) fail("ERC8004_PREPARATION_EXACT_FLAG_REQUIRED");

const result = await prepare(sourceBaseCommit(argv));
process.stdout.write(`${JSON.stringify(result)}\n`);
