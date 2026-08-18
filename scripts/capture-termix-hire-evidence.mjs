import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import process from "node:process";

import {
  FINALITY_DEPTH,
  stableJson,
  validateAndBuildHireEvidence
} from "./termix-hire-evidence-lib.mjs";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");
const OUTPUT_DIRECTORY = resolve(REPOSITORY_ROOT, "evidence", "termix", "hire-receipts");
const CONTRACT = "0x052fd2940Aa46F0Ae6660e0bf9eBDEdb6F610b1A";
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const RPCS = Object.freeze([
  Object.freeze({ name: "bnb-chain", url: "https://data-seed-prebsc-2-s2.binance.org:8545" }),
  Object.freeze({ name: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" })
]);
let activeStage = "ARGUMENTS";

function fail(code) {
  throw new Error(code);
}

function exactHash(value, code) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/u.test(value)) fail(code);
  return value.toLowerCase();
}

function quantity(value, code) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/u.test(value)) {
    fail(code);
  }
  return BigInt(value);
}

function parseArguments(argv) {
  const expected = [
    "--capture-finalized",
    "--source-commit",
    "--preparation",
    "--deployment-tx",
    "--lp-tx",
    "--audit-tx",
    "--venus-tx"
  ];
  if (argv.length !== 13 || argv[0] !== expected[0]) fail("HIRE_CAPTURE_EXACT_FLAG_REQUIRED");
  const values = {};
  for (let index = 1; index < expected.length; index += 1) {
    const offset = index * 2 - 1;
    if (argv[offset] !== expected[index]) fail("HIRE_CAPTURE_ARGUMENTS_INVALID");
    values[expected[index].slice(2)] = argv[offset + 1];
  }
  if (!/^[0-9a-f]{40}$/u.test(values["source-commit"])) fail("HIRE_CAPTURE_COMMIT_INVALID");
  return Object.freeze({
    sourceCommit: values["source-commit"],
    preparationPath: resolve(REPOSITORY_ROOT, values.preparation),
    deploymentHash: exactHash(values["deployment-tx"], "HIRE_CAPTURE_HASH_INVALID"),
    hireHashes: Object.freeze([
      exactHash(values["lp-tx"], "HIRE_CAPTURE_HASH_INVALID"),
      exactHash(values["audit-tx"], "HIRE_CAPTURE_HASH_INVALID"),
      exactHash(values["venus-tx"], "HIRE_CAPTURE_HASH_INVALID")
    ])
  });
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  }).trim();
}

function committedPreparation(path) {
  const relativePath = relative(REPOSITORY_ROOT, path).split(sep).join("/");
  if (
    !relativePath.startsWith("evidence/termix/hire-preparations/") ||
    relativePath.includes("..")
  ) {
    fail("HIRE_CAPTURE_PREPARATION_PATH_INVALID");
  }
  const bytes = readFileSync(path);
  const committed = execFileSync("git", ["show", `HEAD:${relativePath}`], {
    cwd: REPOSITORY_ROOT,
    encoding: null,
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (!committed.equals(bytes)) fail("HIRE_CAPTURE_PREPARATION_NOT_COMMITTED");
  return Object.freeze({
    bytes,
    path: relativePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    value: JSON.parse(bytes.toString("utf8"))
  });
}

function validateRelease(sourceCommit) {
  if (git("rev-parse", "HEAD") !== sourceCommit) fail("HIRE_CAPTURE_HEAD_MISMATCH");
  if (git("status", "--porcelain") !== "") fail("HIRE_CAPTURE_REPOSITORY_DIRTY");
  if (git("rev-parse", "origin/main") !== sourceCommit) fail("HIRE_CAPTURE_HEAD_NOT_PUBLISHED");
}

async function rpc(provider, method, params) {
  const response = await fetch(provider.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) fail("HIRE_CAPTURE_RPC_HTTP_INVALID");
  const body = await response.json();
  if (body?.jsonrpc !== "2.0" || body?.id !== 1 || body.error !== undefined) {
    fail("HIRE_CAPTURE_RPC_RESPONSE_INVALID");
  }
  return body.result;
}

function normalizeLog(log) {
  return {
    address: log.address,
    blockHash: log.blockHash,
    blockNumber: log.blockNumber,
    data: log.data,
    logIndex: log.logIndex,
    removed: log.removed,
    topics: log.topics,
    transactionHash: log.transactionHash,
    transactionIndex: log.transactionIndex
  };
}

function normalizeTransaction(transaction) {
  return {
    blockHash: transaction.blockHash,
    blockNumber: transaction.blockNumber,
    chainId: transaction.chainId,
    from: transaction.from,
    gas: transaction.gas,
    gasPrice: transaction.gasPrice,
    hash: transaction.hash,
    input: transaction.input,
    nonce: transaction.nonce,
    to: transaction.to,
    transactionIndex: transaction.transactionIndex,
    type: transaction.type,
    value: transaction.value
  };
}

function normalizeReceipt(receipt) {
  return {
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    contractAddress: receipt.contractAddress,
    cumulativeGasUsed: receipt.cumulativeGasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    from: receipt.from,
    gasUsed: receipt.gasUsed,
    logs: receipt.logs.map(normalizeLog),
    logsBloom: receipt.logsBloom,
    status: receipt.status,
    to: receipt.to,
    transactionHash: receipt.transactionHash,
    transactionIndex: receipt.transactionIndex,
    type: receipt.type
  };
}

function normalizeBlock(block) {
  return { hash: block.hash, number: block.number, timestamp: block.timestamp };
}

async function operation(provider, hash) {
  const transaction = await rpc(provider, "eth_getTransactionByHash", [hash]);
  const receipt = await rpc(provider, "eth_getTransactionReceipt", [hash]);
  if (transaction === null || receipt === null) fail("HIRE_CAPTURE_OPERATION_MISSING");
  const block = await rpc(provider, "eth_getBlockByHash", [receipt.blockHash, false]);
  if (block === null) fail("HIRE_CAPTURE_BLOCK_MISSING");
  return {
    transaction: normalizeTransaction(transaction),
    receipt: normalizeReceipt(receipt),
    block: normalizeBlock(block)
  };
}

function requireSame(values, code) {
  if (values.length !== 2 || stableJson(values[0]) !== stableJson(values[1])) fail(code);
  return values[0];
}

function ownerCalldata(agentId) {
  return `0x6352211e${BigInt(agentId).toString(16).padStart(64, "0")}`;
}

function receiptStateCalldata(engagementId) {
  return `0x86807df6${engagementId.slice(2)}`;
}

async function collect(args, committed) {
  const chainIds = await Promise.all(RPCS.map((provider) => rpc(provider, "eth_chainId", [])));
  if (chainIds.some((chainId) => quantity(chainId, "HIRE_CAPTURE_CHAIN_INVALID") !== 97n)) {
    fail("HIRE_CAPTURE_WRONG_CHAIN");
  }
  const hashes = [args.deploymentHash, ...args.hireHashes];
  const providerOperations = await Promise.all(
    RPCS.map((provider) => Promise.all(hashes.map((hash) => operation(provider, hash))))
  );
  const operations = hashes.map((_, index) =>
    requireSame(
      providerOperations.map((providerSet) => providerSet[index]),
      "HIRE_CAPTURE_PROVIDER_OPERATION_MISMATCH"
    )
  );
  const heads = await Promise.all(RPCS.map((provider) => rpc(provider, "eth_blockNumber", [])));
  const minimumHead = heads
    .map((head) => quantity(head, "HIRE_CAPTURE_HEAD_INVALID"))
    .reduce((left, right) => (left < right ? left : right));
  if (minimumHead <= FINALITY_DEPTH) fail("HIRE_CAPTURE_HEAD_TOO_LOW");
  const finalNumber = minimumHead - FINALITY_DEPTH;
  const finalTag = `0x${finalNumber.toString(16)}`;
  const finalBlocks = await Promise.all(
    RPCS.map((provider) => rpc(provider, "eth_getBlockByNumber", [finalTag, false]))
  );
  const finalBlock = requireSame(
    finalBlocks.map(normalizeBlock),
    "HIRE_CAPTURE_FINAL_BLOCK_MISMATCH"
  );
  const blockSelector = { blockHash: finalBlock.hash, requireCanonical: true };
  const code = requireSame(
    await Promise.all(
      RPCS.map((provider) => rpc(provider, "eth_getCode", [CONTRACT, blockSelector]))
    ),
    "HIRE_CAPTURE_RUNTIME_MISMATCH"
  );
  const agentIds = [...new Set(committed.value.hires.map(({ agentId }) => agentId))];
  const ownerStates = {};
  for (const agentId of agentIds) {
    const result = requireSame(
      await Promise.all(
        RPCS.map((provider) =>
          rpc(provider, "eth_call", [{ to: REGISTRY, data: ownerCalldata(agentId) }, blockSelector])
        )
      ),
      "HIRE_CAPTURE_OWNER_STATE_MISMATCH"
    );
    ownerStates[agentId] = `0x${result.slice(-40)}`;
  }
  const receiptStates = {};
  for (const { engagementId } of committed.value.hires) {
    receiptStates[engagementId.toLowerCase()] = requireSame(
      await Promise.all(
        RPCS.map((provider) =>
          rpc(provider, "eth_call", [
            { to: CONTRACT, data: receiptStateCalldata(engagementId) },
            blockSelector
          ])
        )
      ),
      "HIRE_CAPTURE_RECEIPT_STATE_MISMATCH"
    );
  }
  return validateAndBuildHireEvidence({
    preparation: committed.value,
    hashes: { deployment: args.deploymentHash, hires: args.hireHashes },
    deployment: operations[0],
    hires: operations.slice(1),
    finalBlock,
    runtimeCode: code,
    ownerStates,
    receiptStates,
    verifiedAtUtc: new Date().toISOString(),
    sourceCommit: args.sourceCommit,
    preparationPath: committed.path,
    preparationSha256: committed.sha256,
    providers: RPCS
  });
}

function writeExclusive(path, manifest) {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  } finally {
    closeSync(descriptor);
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  activeStage = "RELEASE";
  validateRelease(args.sourceCommit);
  activeStage = "PREPARATION";
  const committed = committedPreparation(args.preparationPath);
  activeStage = "COLLECTION";
  const manifest = await collect(args, committed);
  activeStage = "OUTPUT";
  const output = resolve(
    OUTPUT_DIRECTORY,
    `${manifest.finalBlock.number}-${args.deploymentHash.slice(2, 10)}.json`
  );
  writeExclusive(output, manifest);
  process.stdout.write(
    `${JSON.stringify({ output: relative(REPOSITORY_ROOT, output).split(sep).join("/"), sha256: createHash("sha256").update(readFileSync(output)).digest("hex") })}\n`
  );
}

try {
  await main();
} catch (error) {
  const code =
    error instanceof Error && /^HIRE_(?:CAPTURE|EVIDENCE)_[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : `HIRE_CAPTURE_${activeStage}_FAILED`;
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
