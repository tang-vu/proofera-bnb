import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { link, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyTermixPublishedReleaseState } from "./termix-release-state.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "evidence/termix/declarations/pancake-lp/";
const MAXIMUM_GIT_OUTPUT_BYTES = 4_000_000;
const PROVIDERS = Object.freeze([
  Object.freeze({ id: "bnb-chain", url: "https://data-seed-prebsc-2-s2.binance.org:8545" }),
  Object.freeze({ id: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" })
]);

function fail(code) {
  throw new Error(code);
}

function parseArguments(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (
    normalized.length !== 5 ||
    normalized[0] !== "--capture-exact-pancake-lp-run-order" ||
    normalized[1] !== "--declaration" ||
    normalized[3] !== "--source-commit" ||
    typeof normalized[2] !== "string" ||
    typeof normalized[4] !== "string" ||
    !normalized[2].startsWith(PREFIX) ||
    !/^[A-Za-z0-9._/-]+\.json$/u.test(normalized[2]) ||
    normalized[2].includes("..") ||
    normalized[2].endsWith(".run-order.json") ||
    !/^[0-9a-f]{40}$/u.test(normalized[4])
  ) {
    fail("TERMIX_LP_ORDER_ARGUMENTS_INVALID");
  }
  return { declarationPath: normalized[2], sourceCommitSha: normalized[4] };
}

function gitText(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

async function readCommittedDeclaration(path) {
  const absolute = resolve(ROOT, ...path.split("/"));
  if ((await realpath(absolute)) !== absolute) fail("TERMIX_LP_ORDER_DECLARATION_UNTRUSTED");
  gitText(["ls-files", "--error-unmatch", "--", path]);
  const working = await readFile(absolute);
  const committed = execFileSync("git", ["show", `HEAD:${path}`], {
    cwd: ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
  if (!working.equals(committed)) fail("TERMIX_LP_ORDER_DECLARATION_NOT_COMMITTED");
  let parsed;
  try {
    parsed = JSON.parse(working.toString("utf8"));
  } catch {
    fail("TERMIX_LP_ORDER_DECLARATION_JSON_INVALID");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    parsed.schemaVersion !== "proofera-termix-frozen-declaration-v1.0.0" ||
    parsed.sourceCommitSha === undefined ||
    typeof parsed.declarationSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(parsed.declarationSha256) ||
    typeof parsed.randomnessCommitment !== "object" ||
    parsed.randomnessCommitment === null ||
    parsed.randomnessCommitment.chainId !== 97 ||
    !/^[1-9][0-9]*$/u.test(parsed.randomnessCommitment.blockNumber) ||
    parsed.randomnessCommitment.finalityConfirmations !== "12" ||
    JSON.stringify(parsed.randomnessCommitment.providers) !==
      JSON.stringify(PROVIDERS.map(({ url }) => url)) ||
    parsed.claims?.runOrderResolved !== false
  ) {
    fail("TERMIX_LP_ORDER_DECLARATION_INVALID");
  }
  return parsed;
}

async function rpc(provider, method, params, id) {
  const request = { jsonrpc: "2.0", id, method, params };
  const response = await fetch(provider.url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(request),
    redirect: "error",
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) fail("TERMIX_LP_ORDER_RPC_HTTP_FAILED");
  const body = await response.text();
  if (Buffer.byteLength(body) > 1_000_000) fail("TERMIX_LP_ORDER_RPC_RESPONSE_TOO_LARGE");
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    fail("TERMIX_LP_ORDER_RPC_JSON_INVALID");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    parsed.jsonrpc !== "2.0" ||
    parsed.id !== id ||
    Object.hasOwn(parsed, "error")
  ) {
    fail("TERMIX_LP_ORDER_RPC_ENVELOPE_INVALID");
  }
  return { request, response: parsed };
}

function quantity(value, code) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(value)) fail(code);
  return BigInt(value);
}

function blockResult(value, target) {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof value.number !== "string" ||
    typeof value.hash !== "string" ||
    typeof value.timestamp !== "string" ||
    !/^0x[0-9a-f]{64}$/u.test(value.hash)
  ) {
    fail("TERMIX_LP_ORDER_BLOCK_INVALID");
  }
  if (quantity(value.number, "TERMIX_LP_ORDER_BLOCK_NUMBER_INVALID") !== target) {
    fail("TERMIX_LP_ORDER_BLOCK_MISMATCH");
  }
  quantity(value.timestamp, "TERMIX_LP_ORDER_BLOCK_TIMESTAMP_INVALID");
  return { number: value.number, hash: value.hash, timestamp: value.timestamp };
}

async function observe(provider, target) {
  const chain = await rpc(provider, "eth_chainId", [], `${provider.id}-chain`);
  if (chain.response.result !== "0x61") fail("TERMIX_LP_ORDER_CHAIN_MISMATCH");
  const head = await rpc(provider, "eth_blockNumber", [], `${provider.id}-head`);
  const headNumber = quantity(head.response.result, "TERMIX_LP_ORDER_HEAD_INVALID");
  if (headNumber < target + 12n) fail("TERMIX_LP_ORDER_NOT_FINALIZED");
  const block = await rpc(
    provider,
    "eth_getBlockByNumber",
    [`0x${target.toString(16)}`, false],
    `${provider.id}-block`
  );
  return {
    provider: provider.id,
    url: provider.url,
    headNumber: headNumber.toString(),
    block: blockResult(block.response.result, target),
    transcript: [chain, head, block]
  };
}

async function writeCreateOnly(path, body) {
  const temporary = resolve(dirname(path), `.${randomUUID()}.partial`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(body, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  verifyTermixPublishedReleaseState({
    repositoryRoot: ROOT,
    sourceCommitSha: options.sourceCommitSha,
    protectedPaths: [
      "package.json",
      "pnpm-lock.yaml",
      "packages/benchmarks/src",
      "scripts/capture-termix-pancake-lp-run-order.mjs",
      "scripts/freeze-termix-pancake-lp-declaration.ts",
      "scripts/termix-release-state.mjs",
      "scripts/termix-typescript-loader.mjs"
    ],
    errorPrefix: "TERMIX_LP_ORDER"
  });
  const declaration = await readCommittedDeclaration(options.declarationPath);
  if (declaration.sourceCommitSha !== options.sourceCommitSha) {
    fail("TERMIX_LP_ORDER_SOURCE_COMMIT_MISMATCH");
  }
  const target = BigInt(declaration.randomnessCommitment.blockNumber);
  const observations = await Promise.all(PROVIDERS.map((provider) => observe(provider, target)));
  const [first, second] = observations;
  if (
    first === undefined ||
    second === undefined ||
    first.block.hash !== second.block.hash ||
    first.block.timestamp !== second.block.timestamp
  ) {
    fail("TERMIX_LP_ORDER_PROVIDER_DISAGREEMENT");
  }
  const leastSignificantBit = Number.parseInt(first.block.hash.slice(-1), 16) & 1;
  const result = {
    schemaVersion: "proofera-termix-run-order-resolution-v1.0.0",
    state: "resolved",
    declaration: {
      path: options.declarationPath,
      sha256: declaration.declarationSha256,
      sourceCommitSha: options.sourceCommitSha
    },
    randomness: {
      chainId: 97,
      blockNumber: target.toString(),
      blockHash: first.block.hash,
      blockTimestamp: first.block.timestamp,
      finalityConfirmations: "12",
      leastSignificantBit,
      runOrder: leastSignificantBit === 0 ? ["agent", "manual"] : ["manual", "agent"]
    },
    observedAtUtc: new Date().toISOString(),
    observations,
    claims: { hireVerified: false, agentRun: false, manualRun: false, result: false }
  };
  const output = resolve(ROOT, options.declarationPath.replace(/\.json$/u, ".run-order.json"));
  await writeCreateOnly(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${relative(ROOT, output).replaceAll("\\", "/")}\n`);
}

main().catch((error) => {
  const message =
    error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : error instanceof Error
        ? error.constructor.name
        : "Error";
  process.stderr.write(`TermiX LP run-order capture failed: ${message}\n`);
  process.exitCode = 1;
});
