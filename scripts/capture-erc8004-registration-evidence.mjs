import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import {
  CHAIN_ID,
  REGISTRY,
  REGISTRY_ABI,
  canonical,
  exactHex,
  parseQuantity,
  validateRegistrationPair
} from "./erc8004-registration-evidence-lib.mjs";

const integrationRequire = createRequire(
  new URL("../packages/integrations/package.json", import.meta.url)
);
const { decodeFunctionResult, encodeFunctionData, keccak256 } = integrationRequire("viem");

const EXECUTE_FLAG = "--capture-exact-four-agent-registration";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const PREPARATION_ARGUMENT = "--preparation";
const FINALITY_DEPTH = 12n;
const TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 2_000_000;
const MAXIMUM_GIT_OUTPUT_BYTES = 8_000_000;
const PREPARATION_PATH =
  /^evidence\/erc8004\/preparations\/[1-9][0-9]*-four-agent-registration-preparation\.json$/u;
const AGENT_KEYS = Object.freeze([
  "lp-range",
  "grid-trading",
  "yield-optimisation",
  "health-factor"
]);
const PROVIDERS = Object.freeze([
  { name: "bnb-chain", url: "https://data-seed-prebsc-2-s2.binance.org:8545" },
  { name: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" }
]);

let rpcId = 0;
const rpcTranscript = [];

function fail(code) {
  throw new Error(code);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hexQuantity(value) {
  return `0x${value.toString(16)}`;
}

function exactArguments(argv) {
  const expectedLength = 5 + AGENT_KEYS.length * 4;
  if (
    argv.length !== expectedLength ||
    argv[0] !== EXECUTE_FLAG ||
    argv[1] !== SOURCE_COMMIT_ARGUMENT ||
    !/^[0-9a-f]{40}$/u.test(argv[2]) ||
    argv[3] !== PREPARATION_ARGUMENT ||
    !PREPARATION_PATH.test(argv[4])
  ) {
    fail("ERC8004_REGISTRATION_EVIDENCE_EXACT_INVOCATION_REQUIRED");
  }
  const transactions = {};
  let offset = 5;
  for (const key of AGENT_KEYS) {
    if (
      argv[offset] !== `--${key}-register` ||
      !/^0x[0-9a-f]{64}$/u.test(argv[offset + 1]) ||
      argv[offset + 2] !== `--${key}-uri-update` ||
      !/^0x[0-9a-f]{64}$/u.test(argv[offset + 3])
    ) {
      fail("ERC8004_REGISTRATION_EVIDENCE_EXACT_INVOCATION_REQUIRED");
    }
    transactions[key] = Object.freeze({
      registerHash: argv[offset + 1],
      updateHash: argv[offset + 3]
    });
    offset += 4;
  }
  const hashes = Object.values(transactions).flatMap(({ registerHash, updateHash }) => [
    registerHash,
    updateHash
  ]);
  if (new Set(hashes).size !== hashes.length) {
    fail("ERC8004_REGISTRATION_EVIDENCE_TRANSACTION_HASH_DUPLICATE");
  }
  return Object.freeze({
    preparationPath: argv[4],
    sourceCommit: argv[2],
    transactions: Object.freeze(transactions)
  });
}

function gitText(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function verifyRelease(sourceCommit) {
  if (gitText(["rev-parse", "HEAD"]) !== sourceCommit) {
    fail("ERC8004_REGISTRATION_EVIDENCE_HEAD_MISMATCH");
  }
  if (gitText(["rev-parse", "origin/main"]) !== sourceCommit) {
    fail("ERC8004_REGISTRATION_EVIDENCE_RELEASE_NOT_PUBLISHED");
  }
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("ERC8004_REGISTRATION_EVIDENCE_WORKTREE_DIRTY");
  }
}

async function readPreparation(path, sourceCommit) {
  const bytes = await readFile(resolve(...path.split("/")));
  const committed = execFileSync("git", ["show", `HEAD:${path}`], {
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
  if (!bytes.equals(committed)) {
    fail("ERC8004_REGISTRATION_EVIDENCE_PREPARATION_NOT_COMMITTED");
  }
  const value = JSON.parse(bytes.toString("utf8"));
  if (
    value?.schemaVersion !== "proofera-erc8004-registration-preparation-v1.0.0" ||
    !/^[0-9a-f]{40}$/u.test(value?.sourceBaseCommit) ||
    value?.network?.chainId !== CHAIN_ID ||
    value?.network?.registry !== REGISTRY ||
    value?.classification?.registrationExecuted !== false ||
    !Array.isArray(value?.agents) ||
    value.agents.length !== AGENT_KEYS.length ||
    value.agents.some((agent, index) => agent?.key !== AGENT_KEYS[index])
  ) {
    fail("ERC8004_REGISTRATION_EVIDENCE_PREPARATION_INVALID");
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", value.sourceBaseCommit, sourceCommit], {
      encoding: "buffer",
      maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
      windowsHide: true
    });
  } catch {
    fail("ERC8004_REGISTRATION_EVIDENCE_PREPARATION_SOURCE_NOT_ANCESTOR");
  }
  return Object.freeze({
    bytes,
    sha256: sha256(bytes),
    sourceBaseCommit: value.sourceBaseCommit,
    value
  });
}

async function rpc(provider, method, params) {
  const request = { id: ++rpcId, jsonrpc: "2.0", method, params };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  let body;
  try {
    response = await fetch(provider.url, {
      body: JSON.stringify(request),
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: controller.signal
    });
    body = await response.text();
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok || Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    fail("ERC8004_REGISTRATION_EVIDENCE_RPC_HTTP_INVALID");
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    fail("ERC8004_REGISTRATION_EVIDENCE_RPC_JSON_INVALID");
  }
  if (
    parsed?.jsonrpc !== "2.0" ||
    parsed?.id !== request.id ||
    Object.hasOwn(parsed, "error") ||
    !Object.hasOwn(parsed, "result")
  ) {
    fail("ERC8004_REGISTRATION_EVIDENCE_RPC_RESPONSE_INVALID");
  }
  rpcTranscript.push({
    provider: provider.name,
    request,
    response: parsed
  });
  return parsed.result;
}

function requireAgreement(values, code) {
  if (values.length !== PROVIDERS.length || new Set(values.map(canonical)).size !== 1) {
    fail(code);
  }
  return values[0];
}

async function providerValues(method, params) {
  return Promise.all(PROVIDERS.map((provider) => rpc(provider, method, params)));
}

async function exactCall(data, blockTag) {
  const result = requireAgreement(
    await providerValues("eth_call", [{ data, to: REGISTRY }, blockTag]),
    "ERC8004_REGISTRATION_EVIDENCE_PROVIDER_STATE_MISMATCH"
  );
  if (typeof result !== "string" || !/^0x[0-9a-f]*$/iu.test(result)) {
    fail("ERC8004_REGISTRATION_EVIDENCE_CALL_RESULT_INVALID");
  }
  return result;
}

async function capture(argumentsValue) {
  verifyRelease(argumentsValue.sourceCommit);
  const preparation = await readPreparation(
    argumentsValue.preparationPath,
    argumentsValue.sourceCommit
  );

  const chainIds = await providerValues("eth_chainId", []);
  if (
    chainIds.some(
      (chainId) =>
        parseQuantity(chainId, "ERC8004_REGISTRATION_EVIDENCE_CHAIN_INVALID") !== BigInt(CHAIN_ID)
    )
  ) {
    fail("ERC8004_REGISTRATION_EVIDENCE_WRONG_CHAIN");
  }
  const heads = (await providerValues("eth_blockNumber", [])).map((value) =>
    parseQuantity(value, "ERC8004_REGISTRATION_EVIDENCE_HEAD_INVALID")
  );
  const minimumHead = heads.reduce((left, right) => (left < right ? left : right));
  if (minimumHead <= FINALITY_DEPTH) fail("ERC8004_REGISTRATION_EVIDENCE_HEAD_TOO_LOW");
  const blockNumber = minimumHead - FINALITY_DEPTH;
  const blockTag = hexQuantity(blockNumber);
  const blocks = await providerValues("eth_getBlockByNumber", [blockTag, false]);
  const blockHashes = blocks.map((block) =>
    exactHex(block?.hash, 32, "ERC8004_REGISTRATION_EVIDENCE_BLOCK_INVALID")
  );
  if (new Set(blockHashes).size !== 1) {
    fail("ERC8004_REGISTRATION_EVIDENCE_PROVIDER_BLOCK_HASH_MISMATCH");
  }
  const blockHash = blockHashes[0];
  const observedAtUtc = new Date(
    Number(
      parseQuantity(blocks[0]?.timestamp, "ERC8004_REGISTRATION_EVIDENCE_BLOCK_TIMESTAMP_INVALID")
    ) * 1_000
  ).toISOString();

  const codes = await providerValues("eth_getCode", [REGISTRY, blockTag]);
  const codeHashes = codes.map((code) => {
    if (typeof code !== "string" || !/^0x[0-9a-f]+$/iu.test(code) || code === "0x") {
      fail("ERC8004_REGISTRATION_EVIDENCE_REGISTRY_CODE_INVALID");
    }
    return keccak256(code);
  });
  if (new Set(codeHashes).size !== 1) {
    fail("ERC8004_REGISTRATION_EVIDENCE_REGISTRY_CODE_MISMATCH");
  }

  const agents = [];
  const agentIds = new Set();
  let totalNetworkGasCostWei = 0n;
  for (const preparedAgent of preparation.value.agents) {
    const hashes = argumentsValue.transactions[preparedAgent.key];
    const registerTransactions = await providerValues("eth_getTransactionByHash", [
      hashes.registerHash
    ]);
    const registerReceipts = await providerValues("eth_getTransactionReceipt", [
      hashes.registerHash
    ]);
    const updateTransactions = await providerValues("eth_getTransactionByHash", [
      hashes.updateHash
    ]);
    const updateReceipts = await providerValues("eth_getTransactionReceipt", [hashes.updateHash]);
    if (
      [...registerTransactions, ...registerReceipts, ...updateTransactions, ...updateReceipts].some(
        (value) => value === null
      )
    ) {
      fail("ERC8004_REGISTRATION_EVIDENCE_TRANSACTION_PENDING_OR_UNKNOWN");
    }
    const registerTransaction = requireAgreement(
      registerTransactions,
      "ERC8004_REGISTRATION_EVIDENCE_PROVIDER_TRANSACTION_MISMATCH"
    );
    const registerReceipt = requireAgreement(
      registerReceipts,
      "ERC8004_REGISTRATION_EVIDENCE_PROVIDER_RECEIPT_MISMATCH"
    );
    const updateTransaction = requireAgreement(
      updateTransactions,
      "ERC8004_REGISTRATION_EVIDENCE_PROVIDER_TRANSACTION_MISMATCH"
    );
    const updateReceipt = requireAgreement(
      updateReceipts,
      "ERC8004_REGISTRATION_EVIDENCE_PROVIDER_RECEIPT_MISMATCH"
    );
    const validated = validateRegistrationPair({
      preparedAgent,
      registerHash: hashes.registerHash,
      registerReceipt,
      registerTransaction,
      updateHash: hashes.updateHash,
      updateReceipt,
      updateTransaction
    });
    if (
      validated.registration.blockNumber > blockNumber ||
      validated.update.blockNumber > blockNumber
    ) {
      fail("ERC8004_REGISTRATION_EVIDENCE_RECEIPT_NOT_FINALIZED");
    }
    if (agentIds.has(validated.agentId.toString())) {
      fail("ERC8004_REGISTRATION_EVIDENCE_AGENT_ID_DUPLICATE");
    }
    agentIds.add(validated.agentId.toString());

    const ownerResult = await exactCall(
      encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: "ownerOf",
        args: [validated.agentId]
      }),
      blockTag
    );
    const tokenUriResult = await exactCall(
      encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: "tokenURI",
        args: [validated.agentId]
      }),
      blockTag
    );
    const balanceResult = await exactCall(
      encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: "balanceOf",
        args: [validated.wallet]
      }),
      blockTag
    );
    const owner = decodeFunctionResult({
      abi: REGISTRY_ABI,
      data: ownerResult,
      functionName: "ownerOf"
    }).toLowerCase();
    const tokenUri = decodeFunctionResult({
      abi: REGISTRY_ABI,
      data: tokenUriResult,
      functionName: "tokenURI"
    });
    const ownedAgentCount = decodeFunctionResult({
      abi: REGISTRY_ABI,
      data: balanceResult,
      functionName: "balanceOf"
    });
    if (owner !== validated.wallet || tokenUri !== validated.finalUri || ownedAgentCount !== 1n) {
      fail("ERC8004_REGISTRATION_EVIDENCE_FINAL_STATE_MISMATCH");
    }

    const registrationGasCostWei =
      validated.registration.gasUsed * validated.registration.effectiveGasPrice;
    const updateGasCostWei = validated.update.gasUsed * validated.update.effectiveGasPrice;
    totalNetworkGasCostWei += registrationGasCostWei + updateGasCostWei;
    agents.push({
      key: preparedAgent.key,
      wallet: preparedAgent.wallet,
      agentId: validated.agentId.toString(),
      agentRegistry: `eip155:${CHAIN_ID}:${REGISTRY}`,
      finalAgentUri: validated.finalUri,
      registrationTransaction: {
        hash: hashes.registerHash,
        explorerUrl: `https://testnet.bscscan.com/tx/${hashes.registerHash}`,
        blockNumber: validated.registration.blockNumber.toString(),
        blockHash: validated.registration.blockHash,
        gasUsed: validated.registration.gasUsed.toString(),
        effectiveGasPriceWei: validated.registration.effectiveGasPrice.toString(),
        networkGasCostWei: registrationGasCostWei.toString(),
        transaction: registerTransaction,
        receipt: registerReceipt
      },
      uriUpdateTransaction: {
        hash: hashes.updateHash,
        explorerUrl: `https://testnet.bscscan.com/tx/${hashes.updateHash}`,
        blockNumber: validated.update.blockNumber.toString(),
        blockHash: validated.update.blockHash,
        gasUsed: validated.update.gasUsed.toString(),
        effectiveGasPriceWei: validated.update.effectiveGasPrice.toString(),
        networkGasCostWei: updateGasCostWei.toString(),
        transaction: updateTransaction,
        receipt: updateReceipt
      },
      finalState: {
        observedBlockNumber: blockNumber.toString(),
        observedBlockHash: blockHash,
        owner,
        ownedAgentCount: ownedAgentCount.toString(),
        tokenUri
      },
      claimBoundary: {
        endpointAvailabilityProvenByRegistration: false,
        executionAuthority: false,
        hireReceiptEvidence: false,
        marketplaceEligibilityProvenByRegistration: false,
        performanceEvidence: false
      }
    });
  }

  const manifest = {
    schemaVersion: "proofera-erc8004-four-agent-registration-evidence-v1.0.0",
    classification: {
      artifact: "onchain_registration_evidence",
      executionAuthority: false,
      fourAgentIdentitiesObserved: true,
      hireReceiptEvidence: false,
      marketplaceEligibilityProven: false,
      performanceEvidence: false,
      registrationReceiptEvidence: true,
      uriUpdateReceiptEvidence: true
    },
    sourceBaseCommit: argumentsValue.sourceCommit,
    preparation: {
      path: argumentsValue.preparationPath,
      sha256: preparation.sha256,
      sourceBaseCommit: preparation.sourceBaseCommit
    },
    network: {
      name: "bsc-testnet",
      chainId: CHAIN_ID,
      registry: REGISTRY,
      registryCodeHash: codeHashes[0],
      blockNumber: blockNumber.toString(),
      blockHash,
      observedAtUtc,
      finalityDepth: FINALITY_DEPTH.toString(),
      providers: PROVIDERS
    },
    costObservation: {
      meaning:
        "Sum of receipt gasUsed × effectiveGasPrice across the eight observed transactions; it does not identify who economically funded or sponsored gas.",
      totalNetworkGasCostWei: totalNetworkGasCostWei.toString()
    },
    agents,
    rpcTranscript
  };
  const directory = resolve("evidence", "erc8004", "registrations");
  const output = resolve(directory, `${blockNumber}-four-agent-registration-evidence.json`);
  await mkdir(directory, { recursive: true });
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(output, bytes, { encoding: "utf8", flag: "wx" });
  return { output, sha256: sha256(bytes) };
}

const argumentsValue = exactArguments(process.argv.slice(2));
const result = await capture(argumentsValue);
process.stdout.write(`${JSON.stringify(result)}\n`);
