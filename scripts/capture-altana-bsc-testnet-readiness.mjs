import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXECUTE_FLAG = "--capture-altana-bsc-testnet-readiness";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const CHAIN_ID = 97;
const FINALITY_DEPTH = 12n;
const TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 2_000_000;
const RELAY_URL = "https://testnet-relay.altana.network";
const RPC_PROVIDERS = Object.freeze([
  { name: "bnb-chain", url: "https://data-seed-prebsc-2-s2.binance.org:8545" },
  { name: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" }
]);

const integrationRequire = createRequire(
  new URL("../packages/integrations/package.json", import.meta.url)
);
const { decodeFunctionResult, encodeFunctionData, keccak256 } = integrationRequire("viem");
const sdkEntryUrl = new URL(
  "../packages/integrations/node_modules/@altananetwork/sdk/dist/index.js",
  import.meta.url
);
const sdkEntry = fileURLToPath(sdkEntryUrl);
const { BNB_TESTNET } = await import(sdkEntryUrl.href);

const CONTROLLER_ABI = [
  {
    type: "function",
    name: "getRegistrationFeeInWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  }
];

function fail(code) {
  throw new Error(code);
}

function sourceBaseCommit(argv) {
  const index = argv.indexOf(SOURCE_COMMIT_ARGUMENT);
  const value = index < 0 ? undefined : argv[index + 1];
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    fail("ALTANA_READINESS_SOURCE_BASE_COMMIT_REQUIRED");
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactAddress(value, code) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{40}$/iu.test(value)) fail(code);
  if (/^0x0{40}$/iu.test(value)) fail(code);
  return value.toLowerCase();
}

function exactHex(value, bytes, code) {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, "iu").test(value)) {
    fail(code);
  }
  return value.toLowerCase();
}

function parseQuantity(value, code) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/iu.test(value)) fail(code);
  return BigInt(value);
}

function hexQuantity(value) {
  return `0x${value.toString(16)}`;
}

const transcript = [];

async function jsonRpc(origin, label, method, params) {
  const id = `altana-readiness-${transcript.length + 1}`;
  const request = { id, jsonrpc: "2.0", method, params };
  const response = await fetch(origin, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(request),
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (response.status !== 200) fail("ALTANA_READINESS_HTTP_INVALID");
  const responseBody = await response.text();
  if (Buffer.byteLength(responseBody) > MAX_BODY_BYTES) fail("ALTANA_READINESS_BODY_TOO_LARGE");
  let parsed;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    fail("ALTANA_READINESS_JSON_INVALID");
  }
  if (parsed?.jsonrpc !== "2.0" || parsed?.id !== id || parsed?.error !== undefined) {
    fail("ALTANA_READINESS_RPC_ENVELOPE_INVALID");
  }
  transcript.push({ label, origin, request, response: parsed });
  return parsed.result;
}

async function rpc(provider, method, params) {
  return jsonRpc(provider.url, `rpc:${provider.name}`, method, params);
}

function relayContracts(result) {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    fail("ALTANA_READINESS_RELAY_CAPABILITIES_INVALID");
  }
  const chainKeys = Object.keys(result);
  if (chainKeys.length !== 1 || chainKeys[0].toLowerCase() !== "0x61") {
    fail("ALTANA_READINESS_RELAY_CHAIN_INVALID");
  }
  const chain = result[chainKeys[0]];
  if (chain === null || typeof chain !== "object" || Array.isArray(chain)) {
    fail("ALTANA_READINESS_RELAY_CAPABILITIES_INVALID");
  }
  const contracts = chain.contracts;
  if (contracts === null || typeof contracts !== "object" || Array.isArray(contracts)) {
    fail("ALTANA_READINESS_RELAY_CAPABILITIES_INVALID");
  }
  const required = [
    "accountImplementation",
    "accountProxy",
    "escrow",
    "funder",
    "orchestrator",
    "simulator"
  ];
  const normalized = {};
  for (const key of required) {
    const entry = contracts[key];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail("ALTANA_READINESS_RELAY_CAPABILITIES_INVALID");
    }
    if (entry.version !== null && typeof entry.version !== "string") {
      fail("ALTANA_READINESS_RELAY_CAPABILITIES_INVALID");
    }
    normalized[key] = {
      address: exactAddress(entry.address, "ALTANA_READINESS_RELAY_ADDRESS_INVALID"),
      version: entry.version
    };
  }
  if (
    !Array.isArray(contracts.legacyAccountImplementations) ||
    !Array.isArray(contracts.legacyOrchestrators)
  ) {
    fail("ALTANA_READINESS_RELAY_CAPABILITIES_INVALID");
  }
  return { chain, contracts: normalized };
}

async function hashFile(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.byteLength, path, sha256: sha256(bytes) };
}

async function capture(baseCommit) {
  if (
    BNB_TESTNET?.chainId !== CHAIN_ID ||
    BNB_TESTNET?.relayUrl !== RELAY_URL ||
    BNB_TESTNET?.publicRpcUrl !== "https://bsc-testnet-rpc.publicnode.com"
  ) {
    fail("ALTANA_READINESS_SDK_NETWORK_CONFIG_INVALID");
  }
  const keyStore = exactAddress(BNB_TESTNET.keyStore, "ALTANA_READINESS_KEYSTORE_INVALID");
  const keyStoreController = exactAddress(
    BNB_TESTNET.keyStoreController,
    "ALTANA_READINESS_CONTROLLER_INVALID"
  );

  const capabilitiesResult = await jsonRpc(
    RELAY_URL,
    "altana-testnet-relay",
    "wallet_getCapabilities",
    []
  );
  const capabilities = relayContracts(capabilitiesResult);

  const chainIds = await Promise.all(
    RPC_PROVIDERS.map(async (provider) =>
      parseQuantity(await rpc(provider, "eth_chainId", []), "ALTANA_READINESS_CHAIN_ID_INVALID")
    )
  );
  if (chainIds.some((chainId) => chainId !== BigInt(CHAIN_ID)))
    fail("ALTANA_READINESS_WRONG_CHAIN");
  const heads = await Promise.all(
    RPC_PROVIDERS.map(async (provider) =>
      parseQuantity(await rpc(provider, "eth_blockNumber", []), "ALTANA_READINESS_HEAD_INVALID")
    )
  );
  const minimumHead = heads.reduce((left, right) => (left < right ? left : right));
  if (minimumHead <= FINALITY_DEPTH) fail("ALTANA_READINESS_HEAD_TOO_LOW");
  const blockNumber = minimumHead - FINALITY_DEPTH;
  const blockTag = hexQuantity(blockNumber);
  const blocks = await Promise.all(
    RPC_PROVIDERS.map(
      async (provider) => await rpc(provider, "eth_getBlockByNumber", [blockTag, false])
    )
  );
  const blockHashes = blocks.map((block) =>
    exactHex(block?.hash, 32, "ALTANA_READINESS_BLOCK_INVALID")
  );
  if (new Set(blockHashes).size !== 1) fail("ALTANA_READINESS_BLOCK_HASH_MISMATCH");
  const observedAtUtc = new Date(
    Number(parseQuantity(blocks[0].timestamp, "ALTANA_READINESS_TIMESTAMP_INVALID")) * 1_000
  ).toISOString();

  const targets = {
    keyStore: { address: keyStore, source: "sdk_bnb_testnet_config" },
    keyStoreController: { address: keyStoreController, source: "sdk_bnb_testnet_config" },
    ...Object.fromEntries(
      Object.entries(capabilities.contracts).map(([key, value]) => [
        `relay:${key}`,
        { address: value.address, source: "relay_wallet_getCapabilities" }
      ])
    )
  };
  const contractObservations = [];
  for (const [label, target] of Object.entries(targets)) {
    const observations = [];
    for (const provider of RPC_PROVIDERS) {
      const runtimeCode = await rpc(provider, "eth_getCode", [target.address, blockTag]);
      if (
        typeof runtimeCode !== "string" ||
        !/^0x[0-9a-f]+$/iu.test(runtimeCode) ||
        runtimeCode === "0x"
      ) {
        fail("ALTANA_READINESS_RUNTIME_CODE_INVALID");
      }
      observations.push({
        provider: provider.name,
        runtimeByteLength: (runtimeCode.length - 2) / 2,
        runtimeCodeHash: keccak256(runtimeCode)
      });
    }
    if (
      observations[0].runtimeByteLength !== observations[1].runtimeByteLength ||
      observations[0].runtimeCodeHash !== observations[1].runtimeCodeHash
    ) {
      fail("ALTANA_READINESS_RUNTIME_MISMATCH");
    }
    contractObservations.push({ label, ...target, observations });
  }

  const feeCalldata = encodeFunctionData({
    abi: CONTROLLER_ABI,
    functionName: "getRegistrationFeeInWei"
  });
  const feeObservations = [];
  for (const provider of RPC_PROVIDERS) {
    const raw = await rpc(provider, "eth_call", [
      { data: feeCalldata, to: keyStoreController },
      blockTag
    ]);
    let value;
    try {
      value = decodeFunctionResult({
        abi: CONTROLLER_ABI,
        functionName: "getRegistrationFeeInWei",
        data: raw
      });
    } catch {
      fail("ALTANA_READINESS_REGISTRATION_FEE_INVALID");
    }
    feeObservations.push({ provider: provider.name, registrationFeeWei: value.toString() });
  }
  if (feeObservations[0].registrationFeeWei !== feeObservations[1].registrationFeeWei) {
    fail("ALTANA_READINESS_REGISTRATION_FEE_MISMATCH");
  }

  const sdkDirectory = dirname(sdkEntry);
  const sdkFiles = await Promise.all(
    [
      "config.js",
      "execute.js",
      "grantSession.js",
      "revokeSession.js",
      "internal/keystore.js",
      "internal/relay.js"
    ].map(async (relativePath) => {
      const result = await hashFile(resolve(sdkDirectory, relativePath));
      return { ...result, path: `@altananetwork/sdk/dist/${relativePath.replaceAll("\\", "/")}` };
    })
  );

  const manifest = {
    schemaVersion: "proofera-altana-bsc-testnet-readiness-v1.0.0",
    classification: {
      artifact: "read_only_network_and_sdk_preparation",
      adminSignerCreatedOrRead: false,
      sessionSignerCreatedOrRead: false,
      walletCreated: false,
      grantSubmitted: false,
      executionSubmitted: false,
      revocationSubmitted: false,
      receiptEvidence: false
    },
    sourceBaseCommit: baseCommit,
    sdk: {
      package: "@altananetwork/sdk",
      version: "0.7.0",
      networkExport: "BNB_TESTNET",
      chainId: BNB_TESTNET.chainId,
      publicRpcUrl: BNB_TESTNET.publicRpcUrl,
      relayUrl: BNB_TESTNET.relayUrl,
      explorer: BNB_TESTNET.explorer,
      keyStore,
      keyStoreController,
      files: sdkFiles
    },
    checkpoint: {
      blockNumber: blockNumber.toString(),
      blockHash: blockHashes[0],
      observedAtUtc,
      finalityDepth: FINALITY_DEPTH.toString(),
      providers: RPC_PROVIDERS
    },
    relay: {
      method: "wallet_getCapabilities",
      chainKey: "0x61",
      contracts: capabilities.contracts,
      rawResult: capabilitiesResult,
      reachableWithExpectedCapabilities: true
    },
    onchain: {
      allObservedContractsHaveMatchingNonemptyRuntime: true,
      contracts: contractObservations,
      registrationFee: {
        calldata: feeCalldata,
        observations: feeObservations
      }
    },
    readiness: {
      networkAndRelayObserved: true,
      endToEndJourneyReady: false,
      status: "blocked_missing_authority_and_eligible_action",
      missing: [
        "admin_wallet_and_signer_unbound",
        "session_signer_worker_secret_unbound",
        "eligible_pancake_action_unbound",
        "explicit_transaction_approval_absent"
      ],
      requiredReceiptSequence: [
        "grant_and_keystore_registration",
        "session_signed_pancake_execution",
        "session_revocation_and_fresh_authority_absence"
      ]
    },
    transcript
  };
  const directory = resolve("evidence", "altana", "preparations");
  const output = resolve(directory, `${blockNumber}-bsc-testnet-readiness.json`);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await mkdir(directory, { recursive: true });
  await writeFile(output, serialized, { encoding: "utf8", flag: "wx" });
  return { output, sha256: sha256(serialized) };
}

const argv = process.argv.slice(2);
if (!argv.includes(EXECUTE_FLAG)) fail("ALTANA_READINESS_EXACT_FLAG_REQUIRED");
const result = await capture(sourceBaseCommit(argv));
process.stdout.write(`${JSON.stringify(result)}\n`);
