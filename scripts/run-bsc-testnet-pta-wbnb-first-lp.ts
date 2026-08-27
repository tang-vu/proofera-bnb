import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { dirname, relative, resolve, sep, win32 } from "node:path";
import { cwd, env, execArgv, execPath, stdin, stdout, version } from "node:process";
import { fileURLToPath } from "node:url";

import {
  decodeEventLog,
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  hexToBigInt,
  keccak256,
  parseAbi,
  parseTransaction,
  recoverTransactionAddress,
  sha256,
  stringToHex,
  toHex,
  type Address,
  type Hex,
  type TransactionSerialized
} from "viem";

import {
  BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_LP_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_LP_FEE,
  BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI,
  BSC_TESTNET_PTA_WBNB_LP_OWNER,
  BSC_TESTNET_PTA_WBNB_LP_POOL,
  BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_LP_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW,
  BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER,
  BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER,
  BSC_TESTNET_PTA_WBNB_LP_WBNB_ADDRESS,
  createFixedOfficialBscTestnetPtaWbnbLpRpcClients,
  prepareBscTestnetPtaWbnbLpExactScope,
  stableBscTestnetPtaWbnbLpJsonForInternalUse
} from "../packages/integrations/src/bsc-testnet-pta-wbnb-lp-exact-scope.ts";
import {
  BSC_TESTNET_PTA_WBNB_LP_MINIMUM_EXECUTION_WINDOW_MILLISECONDS,
  BscTestnetPtaWbnbLpExecutionFailure,
  assertFixedBscTestnetPtaWbnbLpCustodyMetadataForInternalUse,
  confirmBscTestnetPtaWbnbLpOwnerChallengeForInternalUse,
  createBscTestnetPtaWbnbLpOwnerChallengeForInternalUse,
  parseBscTestnetPtaWbnbLpExactExecutionPlanForInternalUse,
  signBscTestnetPtaWbnbLpExactTransactionForInternalUse,
  type BscTestnetPtaWbnbLpConfirmedExecution,
  type BscTestnetPtaWbnbLpExactExecutionPlan,
  type BscTestnetPtaWbnbLpExactExecutionTransaction,
  type BscTestnetPtaWbnbLpSignedTransaction
} from "../packages/integrations/src/bsc-testnet-pta-wbnb-lp-execution.server.ts";
import {
  BscTestnetPtaWbnbLpJournalFailure,
  assertRetiredWindowsBscTestnetPtaWbnbLpV1V2V3BoundedForInternalUse,
  createWindowsBscTestnetPtaWbnbLpJournalForInternalUse,
  type BscTestnetPtaWbnbLpJournal,
  type BscTestnetPtaWbnbLpJournalState,
  type BscTestnetPtaWbnbLpJournalTerminalEvidence
} from "../packages/integrations/src/bsc-testnet-pta-wbnb-lp-journal.server.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXACT_EXECUTION_FLAG = "--execute-exact-first-lp-chain-97";
const READ_ONLY_REHEARSAL_FLAG = "--rehearse-read-only-first-lp-chain-97";
const MAXIMUM_RPC_RESPONSE_BYTES = 1_048_576;
const RPC_TIMEOUT_MILLISECONDS = 12_000;
const RECEIPT_TIMEOUT_MILLISECONDS = 90_000;
const RECEIPT_POLL_MILLISECONDS = 2_000;
const OWNER_LINE_MAXIMUM_BYTES = 4_096;
const PINNED_GIT_EXECUTABLE = "D:\\Git\\mingw64\\bin\\git.exe";
const PINNED_GIT_EXECUTABLE_BYTES = 4_344_192;
const PINNED_GIT_SHA256 = "c39b1b4f7a57935bbeadf246dc2466316619453a6a9da77c4a9c6bd6d8fb21d3";
const PINNED_NODE_VERSION = "v24.14.1";
const PINNED_NODE_SHA256 = "58e74bf02fc5bbacc41dcb8bef089961cd5bddd37830b87784e4fc624d145d1f";
const EXPECTED_EXEC_ARGV = Object.freeze([
  "--no-warnings",
  "--conditions=react-server",
  "--experimental-loader",
  "./scripts/typescript-extension-loader.mjs"
]);
const FORBIDDEN_RUNTIME_ENVIRONMENT_NAMES = Object.freeze([
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_EXTRA_CA_CERTS",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "TS_NODE_PROJECT",
  "TS_NODE_TRANSPILE_ONLY",
  "TS_NODE_COMPILER_OPTIONS"
]);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const satisfies Address;
const RELEASE_SOURCE_PATHS = Object.freeze([
  ".gitattributes",
  "package.json",
  "pnpm-lock.yaml",
  "packages/domain/package.json",
  "packages/domain/src/pancake-v3-liquidity-quote.ts",
  "packages/integrations/package.json",
  "packages/integrations/src/bsc-testnet-deployer-custody-core.ts",
  "packages/integrations/src/bsc-testnet-deployer-custody-windows.server.ts",
  "packages/integrations/src/bsc-testnet-pta-signing-worker.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-lp-exact-scope.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-lp-execution.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-lp-journal.server.ts",
  "scripts/run-bsc-testnet-pta-wbnb-first-lp.ts",
  "scripts/typescript-extension-loader.mjs",
  "scripts/tsconfig.pta-wbnb-lp-execution.json"
]);

const ERC20_ABI = parseAbi([
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)"
]);
const POOL_ABI = parseAbi([
  "function liquidity() view returns (uint128)",
  "event Mint(address sender,address indexed owner,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount,uint256 amount0,uint256 amount1)"
]);
const MANAGER_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
  "event IncreaseLiquidity(uint256 indexed tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
]);

let failureJournal: BscTestnetPtaWbnbLpJournal | null = null;

type RpcMethod =
  | "eth_blockNumber"
  | "eth_call"
  | "eth_chainId"
  | "eth_estimateGas"
  | "eth_gasPrice"
  | "eth_getBalance"
  | "eth_getBlockByHash"
  | "eth_getBlockByNumber"
  | "eth_getTransactionByHash"
  | "eth_getTransactionCount"
  | "eth_getTransactionReceipt"
  | "eth_sendRawTransaction";

type PlainRecord = Readonly<Record<string, unknown>>;

class FirstLpRunnerFailure extends Error {
  override readonly name = "FirstLpRunnerFailure";
  readonly code:
    | "ARGUMENTS_INVALID"
    | "BROADCAST_OUTCOME_UNKNOWN"
    | "JOURNAL_BLOCKED"
    | "OWNER_CONFIRMATION_INVALID"
    | "POST_STATE_INVALID"
    | "PRE_SUBMISSION_RECHECK_FAILED"
    | "RECEIPT_REVERTED"
    | "RECEIPT_UNKNOWN"
    | "RELEASE_INVALID"
    | "RPC_INVALID";

  constructor(code: FirstLpRunnerFailure["code"]) {
    super("The exact BSC-testnet first-LP runner failed closed.");
    this.code = code;
  }
}

function fail(code: FirstLpRunnerFailure["code"]): never {
  throw new FirstLpRunnerFailure(code);
}

function record(value: unknown): PlainRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? (value as PlainRecord) : null;
}

function quantity(value: unknown, label: string): bigint {
  void label;
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/u.test(value)) {
    throw new FirstLpRunnerFailure("RPC_INVALID");
  }
  try {
    return hexToBigInt(value as Hex);
  } catch {
    throw new FirstLpRunnerFailure("RPC_INVALID");
  }
}

function dataHex(value: unknown, bytes?: number): Hex {
  if (
    typeof value !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})*$/u.test(value) ||
    (bytes !== undefined && value.length !== bytes * 2 + 2)
  ) {
    throw new FirstLpRunnerFailure("RPC_INVALID");
  }
  return value.toLowerCase() as Hex;
}

function exactAddress(value: unknown): Address {
  if (typeof value !== "string") throw new FirstLpRunnerFailure("RPC_INVALID");
  try {
    return getAddress(value);
  } catch {
    throw new FirstLpRunnerFailure("RPC_INVALID");
  }
}

function stable(value: unknown): string {
  return stableBscTestnetPtaWbnbLpJsonForInternalUse(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

class FixedRpcClient {
  readonly label: "primary" | "corroborator";
  readonly origin: string;
  #requestId = 0;
  #sent = new Set<Hex>();

  constructor(label: "primary" | "corroborator", origin: string) {
    this.label = label;
    this.origin = origin;
  }

  async request(method: RpcMethod, params: readonly unknown[]): Promise<unknown> {
    const requestId = (this.#requestId += 1);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MILLISECONDS);
    let response: Response;
    try {
      response = await fetch(this.origin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
        redirect: "error",
        signal: controller.signal
      });
    } catch {
      clearTimeout(timeout);
      throw new FirstLpRunnerFailure("RPC_INVALID");
    }
    clearTimeout(timeout);
    if (
      !response.ok ||
      response.url !== new URL(this.origin).href ||
      response.type === "opaqueredirect"
    ) {
      throw new FirstLpRunnerFailure("RPC_INVALID");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAXIMUM_RPC_RESPONSE_BYTES) {
      throw new FirstLpRunnerFailure("RPC_INVALID");
    }
    let parsed: PlainRecord | null = null;
    try {
      parsed = record(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown
      );
    } catch {
      throw new FirstLpRunnerFailure("RPC_INVALID");
    }
    if (parsed === null || parsed.jsonrpc !== "2.0" || parsed.id !== requestId) {
      throw new FirstLpRunnerFailure("RPC_INVALID");
    }
    if ("error" in parsed) throw new FirstLpRunnerFailure("RPC_INVALID");
    if (!("result" in parsed)) throw new FirstLpRunnerFailure("RPC_INVALID");
    return parsed.result;
  }

  async sendRawOnce(rawTransaction: Hex): Promise<Hex> {
    const hash = keccak256(rawTransaction);
    if (this.label !== "primary" || this.#sent.has(hash)) {
      throw new FirstLpRunnerFailure("BROADCAST_OUTCOME_UNKNOWN");
    }
    this.#sent.add(hash);
    const result = await this.request("eth_sendRawTransaction", [rawTransaction]);
    const returned = dataHex(result, 32);
    if (returned !== hash) throw new FirstLpRunnerFailure("BROADCAST_OUTCOME_UNKNOWN");
    return returned;
  }
}

type ReleaseIdentity = Readonly<{
  releaseCommit: string;
  releaseTree: string;
  runtimeManifestSha256: Hex;
}>;

async function runPinnedGit(arguments_: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      PINNED_GIT_EXECUTABLE,
      [
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=NUL",
        "-c",
        "core.attributesFile=NUL",
        "-c",
        "core.autocrlf=false",
        "-c",
        "core.eol=lf",
        "-C",
        ROOT,
        ...arguments_
      ],
      {
        cwd: ROOT,
        env: {
          GIT_CONFIG_GLOBAL: "NUL",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_OPTIONAL_LOCKS: "0",
          LC_ALL: "C",
          SystemRoot: "C:\\Windows",
          WINDIR: "C:\\Windows"
        },
        encoding: "utf8",
        maxBuffer: 1_048_576,
        windowsHide: true
      },
      (error, output) => {
        if (error !== null) {
          rejectPromise(new FirstLpRunnerFailure("RELEASE_INVALID"));
          return;
        }
        resolvePromise(output.trim());
      }
    );
  });
}

function insideRoot(path: string): boolean {
  const rel = relative(ROOT, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !win32.isAbsolute(rel);
}

async function assertExactRuntimeInvocation(): Promise<void> {
  try {
    const expectedEntry = resolve(ROOT, "scripts", "run-bsc-testnet-pta-wbnb-first-lp.ts");
    const expectedLoader = resolve(ROOT, "scripts", "typescript-extension-loader.mjs");
    const [
      entryMetadata,
      loaderMetadata,
      nodeMetadata,
      canonicalEntry,
      canonicalLoader,
      canonicalNode
    ] = await Promise.all([
      lstat(expectedEntry),
      lstat(expectedLoader),
      lstat(execPath),
      realpath(expectedEntry),
      realpath(expectedLoader),
      realpath(execPath)
    ]);
    const nodeBytes = await readFile(execPath);
    const nodeSha256 = createHash("sha256").update(nodeBytes).digest("hex");
    nodeBytes.fill(0);
    if (
      version !== PINNED_NODE_VERSION ||
      nodeSha256 !== PINNED_NODE_SHA256 ||
      !entryMetadata.isFile() ||
      entryMetadata.isSymbolicLink() ||
      !loaderMetadata.isFile() ||
      loaderMetadata.isSymbolicLink() ||
      !nodeMetadata.isFile() ||
      nodeMetadata.isSymbolicLink() ||
      canonicalEntry !== expectedEntry ||
      canonicalLoader !== expectedLoader ||
      win32.normalize(canonicalNode).toLowerCase() !== win32.normalize(execPath).toLowerCase() ||
      resolve(cwd()) !== ROOT ||
      resolve(process.argv[1] ?? "") !== expectedEntry ||
      execArgv.length !== EXPECTED_EXEC_ARGV.length ||
      !execArgv.every((value, index) => value === EXPECTED_EXEC_ARGV[index]) ||
      FORBIDDEN_RUNTIME_ENVIRONMENT_NAMES.some((name) => Object.hasOwn(env, name))
    ) {
      fail("RELEASE_INVALID");
    }
  } catch (error) {
    if (error instanceof FirstLpRunnerFailure) throw error;
    throw new FirstLpRunnerFailure("RELEASE_INVALID");
  }
}

async function inspectRelease(): Promise<ReleaseIdentity> {
  try {
    const gitMetadata = await lstat(PINNED_GIT_EXECUTABLE);
    const gitCanonical = await realpath(PINNED_GIT_EXECUTABLE);
    const gitBytes = await readFile(PINNED_GIT_EXECUTABLE);
    const gitSha = createHash("sha256").update(gitBytes).digest("hex");
    gitBytes.fill(0);
    if (
      !gitMetadata.isFile() ||
      gitMetadata.isSymbolicLink() ||
      gitMetadata.size !== PINNED_GIT_EXECUTABLE_BYTES ||
      win32.normalize(gitCanonical).toLowerCase() !==
        win32.normalize(PINNED_GIT_EXECUTABLE).toLowerCase() ||
      gitSha !== PINNED_GIT_SHA256
    ) {
      fail("RELEASE_INVALID");
    }
    const [releaseCommit, publishedCommit, releaseTree, branch, status] = await Promise.all([
      runPinnedGit(["rev-parse", "--verify", "HEAD"]),
      runPinnedGit(["rev-parse", "--verify", "refs/remotes/origin/main"]),
      runPinnedGit(["rev-parse", "HEAD^{tree}"]),
      runPinnedGit(["branch", "--show-current"]),
      runPinnedGit(["status", "--porcelain=v1", "--untracked-files=normal"])
    ]);
    if (
      !/^[0-9a-f]{40}$/u.test(releaseCommit) ||
      releaseCommit !== publishedCommit ||
      !/^[0-9a-f]{40}$/u.test(releaseTree) ||
      branch !== "main" ||
      status !== ""
    ) {
      fail("RELEASE_INVALID");
    }
    const entries: Array<{ path: string; byteLength: number; sha256: Hex }> = [];
    for (const relativePath of RELEASE_SOURCE_PATHS) {
      const path = resolve(ROOT, relativePath);
      const metadata = await lstat(path);
      const canonical = await realpath(path);
      if (
        !insideRoot(path) ||
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        canonical !== path
      ) {
        fail("RELEASE_INVALID");
      }
      const bytes = await readFile(path);
      entries.push({
        path: relativePath,
        byteLength: bytes.byteLength,
        sha256: `0x${createHash("sha256").update(bytes).digest("hex")}` as Hex
      });
    }
    const manifest = {
      schemaVersion: 1,
      domain: "ProofEra:bsc-testnet-pta-wbnb-first-lp-runtime-manifest:v1",
      releaseCommit,
      releaseTree,
      nodeVersion: process.version,
      entries
    };
    return Object.freeze({
      releaseCommit,
      releaseTree,
      runtimeManifestSha256: sha256(stringToHex(stable(manifest)))
    });
  } catch (error) {
    if (error instanceof FirstLpRunnerFailure) throw error;
    throw new FirstLpRunnerFailure("RELEASE_INVALID");
  }
}

function transactionRpcObject(transaction: BscTestnetPtaWbnbLpExactExecutionTransaction) {
  return {
    from: transaction.from,
    to: transaction.to,
    data: transaction.data,
    value: toHex(transaction.valueWei),
    gas: toHex(transaction.gasLimit),
    gasPrice: toHex(transaction.gasPriceWei)
  };
}

async function readCall(
  client: FixedRpcClient,
  to: Address,
  data: Hex,
  block: string | Readonly<{ blockHash: Hex; requireCanonical: true }> = "latest"
): Promise<Hex> {
  return dataHex(await client.request("eth_call", [{ to, data }, block]));
}

async function preSubmissionObservation(
  client: FixedRpcClient,
  plan: BscTestnetPtaWbnbLpExactExecutionPlan,
  transaction: BscTestnetPtaWbnbLpExactExecutionTransaction,
  step: "approval" | "mint",
  commonBlockNumber: bigint
) {
  const blockTag = toHex(commonBlockNumber);
  const [chainIdRaw, pendingNonceRaw, commonNonceRaw, gasPriceRaw] = await Promise.all([
    client.request("eth_chainId", []),
    client.request("eth_getTransactionCount", [BSC_TESTNET_PTA_WBNB_LP_OWNER, "pending"]),
    client.request("eth_getTransactionCount", [BSC_TESTNET_PTA_WBNB_LP_OWNER, blockTag]),
    client.request("eth_gasPrice", [])
  ]);
  const chainId = quantity(chainIdRaw, "chainId");
  const pendingNonce = quantity(pendingNonceRaw, "pending nonce");
  const commonNonce = quantity(commonNonceRaw, "common nonce");
  const gasPrice = quantity(gasPriceRaw, "gas price");
  const blockRaw = record(await client.request("eth_getBlockByNumber", [blockTag, false]));
  if (blockRaw === null) fail("PRE_SUBMISSION_RECHECK_FAILED");
  const blockNumber = quantity(blockRaw.number, "block.number");
  const blockHash = dataHex(blockRaw.hash, 32);
  const blockTimestamp = quantity(blockRaw.timestamp, "block.timestamp");
  const nowUnix = BigInt(Math.floor(Date.now() / 1_000));
  if (
    chainId !== BigInt(BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID) ||
    blockNumber !== commonBlockNumber ||
    nowUnix < blockTimestamp ||
    nowUnix - blockTimestamp > 120n ||
    pendingNonce !== transaction.nonce ||
    commonNonce !== transaction.nonce ||
    gasPrice > transaction.gasPriceWei ||
    nowUnix >= plan.deadlineUnix
  ) {
    fail("PRE_SUBMISSION_RECHECK_FAILED");
  }
  const allowanceData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [BSC_TESTNET_PTA_WBNB_LP_OWNER, BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER]
  });
  const balanceData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [BSC_TESTNET_PTA_WBNB_LP_OWNER]
  });
  const liquidityData = encodeFunctionData({ abi: POOL_ABI, functionName: "liquidity" });
  const [allowanceRaw, ptaBalanceRaw, nativeBalanceRaw, simulationRaw, estimateRaw, liquidityRaw] =
    await Promise.all([
      readCall(client, BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS, allowanceData, blockTag),
      readCall(client, BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS, balanceData, blockTag),
      client.request("eth_getBalance", [BSC_TESTNET_PTA_WBNB_LP_OWNER, blockTag]),
      client.request("eth_call", [transactionRpcObject(transaction), blockTag]),
      client.request("eth_estimateGas", [transactionRpcObject(transaction), blockTag]),
      readCall(client, BSC_TESTNET_PTA_WBNB_LP_POOL, liquidityData, blockTag)
    ]);
  const allowance = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "allowance",
    data: allowanceRaw
  });
  const ptaBalance = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "balanceOf",
    data: ptaBalanceRaw
  });
  const nativeBalance = quantity(nativeBalanceRaw, "native balance");
  const gasEstimate = quantity(estimateRaw, "gas estimate");
  const liquidity = decodeFunctionResult({
    abi: POOL_ABI,
    functionName: "liquidity",
    data: liquidityRaw
  });
  if (
    typeof allowance !== "bigint" ||
    typeof ptaBalance !== "bigint" ||
    typeof liquidity !== "bigint" ||
    allowance !== (step === "approval" ? 0n : BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW) ||
    ptaBalance < BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW ||
    liquidity !== 0n ||
    gasEstimate === 0n ||
    gasEstimate > transaction.gasLimit ||
    nativeBalance < transaction.valueWei + transaction.gasLimit * transaction.gasPriceWei
  ) {
    fail("PRE_SUBMISSION_RECHECK_FAILED");
  }
  if (step === "approval") {
    const returned = decodeFunctionResult({
      abi: ERC20_ABI,
      functionName: "approve",
      data: dataHex(simulationRaw)
    });
    if (returned !== true) fail("PRE_SUBMISSION_RECHECK_FAILED");
  } else {
    const [tokenId, mintedLiquidity, amount0, amount1] = decodeFunctionResult({
      abi: MANAGER_ABI,
      functionName: "mint",
      data: dataHex(simulationRaw)
    });
    if (
      typeof tokenId !== "bigint" ||
      mintedLiquidity !== 1_000_000_000_000_000_000n ||
      amount0 !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW ||
      amount1 !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI
    ) {
      fail("PRE_SUBMISSION_RECHECK_FAILED");
    }
  }
  return {
    provider: client.label,
    chainId: chainId.toString(),
    blockNumber: blockNumber.toString(),
    blockHash,
    blockTimestamp: blockTimestamp.toString(),
    pendingNonce: pendingNonce.toString(),
    commonNonce: commonNonce.toString(),
    gasPriceWei: gasPrice.toString(),
    allowanceRaw: allowance.toString(),
    ptaBalanceRaw: ptaBalance.toString(),
    nativeBalanceWei: nativeBalance.toString(),
    poolLiquidityRaw: liquidity.toString(),
    gasEstimate: gasEstimate.toString()
  };
}

async function dualPreSubmissionRecheck(
  primary: FixedRpcClient,
  corroborator: FixedRpcClient,
  plan: BscTestnetPtaWbnbLpExactExecutionPlan,
  transaction: BscTestnetPtaWbnbLpExactExecutionTransaction,
  step: "approval" | "mint"
): Promise<void> {
  const [primaryTipRaw, corroboratorTipRaw] = await Promise.all([
    primary.request("eth_blockNumber", []),
    corroborator.request("eth_blockNumber", [])
  ]);
  const primaryTip = quantity(primaryTipRaw, "primary tip");
  const corroboratorTip = quantity(corroboratorTipRaw, "corroborator tip");
  const commonBlockNumber = primaryTip < corroboratorTip ? primaryTip : corroboratorTip;
  const [left, right] = await Promise.all([
    preSubmissionObservation(primary, plan, transaction, step, commonBlockNumber),
    preSubmissionObservation(corroborator, plan, transaction, step, commonBlockNumber)
  ]);
  const normalizedLeft = { ...left, provider: null };
  const normalizedRight = { ...right, provider: null };
  if (stable(normalizedLeft) !== stable(normalizedRight)) fail("PRE_SUBMISSION_RECHECK_FAILED");
}

type NormalizedLog = Readonly<{
  address: Address;
  topics: readonly Hex[];
  data: Hex;
  logIndex: string;
}>;

type NormalizedReceipt = Readonly<{
  transactionHash: Hex;
  blockHash: Hex;
  blockNumber: string;
  from: Address;
  to: Address;
  status: "0" | "1";
  gasUsed: string;
  effectiveGasPrice: string;
  logs: readonly NormalizedLog[];
}>;

type NormalizedFinality = Readonly<{
  receiptBlockNumber: string;
  receiptBlockHash: Hex;
  primaryFinalizedBlockNumber: string;
  primaryFinalizedBlockHash: Hex;
  corroboratorFinalizedBlockNumber: string;
  corroboratorFinalizedBlockHash: Hex;
  canonicalReceiptBlockAgreementVerified: true;
}>;

function normalizeTransaction(
  value: unknown,
  expected: BscTestnetPtaWbnbLpExactExecutionTransaction,
  expectedHash: Hex
): Readonly<Record<string, unknown>> | null {
  const tx = record(value);
  if (tx === null) return null;
  const hash = dataHex(tx.hash, 32);
  const from = exactAddress(tx.from);
  const to = exactAddress(tx.to);
  const input = dataHex(tx.input ?? tx.data);
  const chainId = quantity(tx.chainId, "tx.chainId");
  const nonce = quantity(tx.nonce, "tx.nonce");
  const gas = quantity(tx.gas, "tx.gas");
  const gasPrice = quantity(tx.gasPrice, "tx.gasPrice");
  const valueWei = quantity(tx.value, "tx.value");
  if (
    hash !== expectedHash ||
    from !== expected.from ||
    to !== expected.to ||
    input !== expected.data ||
    chainId !== BigInt(expected.chainId) ||
    nonce !== expected.nonce ||
    gas !== expected.gasLimit ||
    gasPrice !== expected.gasPriceWei ||
    valueWei !== expected.valueWei
  ) {
    fail("RPC_INVALID");
  }
  return {
    hash,
    from,
    to,
    input,
    chainId: chainId.toString(),
    nonce: nonce.toString(),
    gas: gas.toString(),
    gasPrice: gasPrice.toString(),
    valueWei: valueWei.toString(),
    blockHash: tx.blockHash === null ? null : dataHex(tx.blockHash, 32),
    blockNumber:
      tx.blockNumber === null ? null : quantity(tx.blockNumber, "tx.blockNumber").toString()
  };
}

function normalizeReceipt(
  value: unknown,
  expected: BscTestnetPtaWbnbLpExactExecutionTransaction,
  expectedHash: Hex
): NormalizedReceipt | null {
  const receipt = record(value);
  if (receipt === null) return null;
  const transactionHash = dataHex(receipt.transactionHash, 32);
  const blockHash = dataHex(receipt.blockHash, 32);
  const blockNumber = quantity(receipt.blockNumber, "receipt.blockNumber");
  const from = exactAddress(receipt.from);
  const to = exactAddress(receipt.to);
  const statusQuantity = quantity(receipt.status, "receipt.status");
  const gasUsed = quantity(receipt.gasUsed, "receipt.gasUsed");
  const effectiveGasPrice = quantity(receipt.effectiveGasPrice, "receipt.effectiveGasPrice");
  if (
    transactionHash !== expectedHash ||
    from !== BSC_TESTNET_PTA_WBNB_LP_OWNER ||
    to !== expected.to ||
    (statusQuantity !== 0n && statusQuantity !== 1n) ||
    gasUsed > expected.gasLimit ||
    effectiveGasPrice !== expected.gasPriceWei ||
    !Array.isArray(receipt.logs)
  ) {
    fail("RPC_INVALID");
  }
  const logs = receipt.logs.map((entry) => {
    const log = record(entry);
    if (log === null || !Array.isArray(log.topics)) fail("RPC_INVALID");
    if (
      dataHex(log.transactionHash, 32) !== expectedHash ||
      dataHex(log.blockHash, 32) !== blockHash ||
      quantity(log.blockNumber, "log.blockNumber") !== blockNumber
    ) {
      fail("RPC_INVALID");
    }
    return {
      address: exactAddress(log.address),
      topics: log.topics.map((topic) => dataHex(topic, 32)),
      data: dataHex(log.data),
      logIndex: quantity(log.logIndex, "log.logIndex").toString()
    };
  });
  return Object.freeze({
    transactionHash,
    blockHash,
    blockNumber: blockNumber.toString(),
    from,
    to,
    status: statusQuantity === 1n ? "1" : "0",
    gasUsed: gasUsed.toString(),
    effectiveGasPrice: effectiveGasPrice.toString(),
    logs: Object.freeze(logs)
  });
}

async function reconcileReceipt(
  primary: FixedRpcClient,
  corroborator: FixedRpcClient,
  expected: BscTestnetPtaWbnbLpExactExecutionTransaction,
  transactionHash: Hex,
  timeoutMilliseconds = RECEIPT_TIMEOUT_MILLISECONDS
): Promise<
  Readonly<{
    receipt: NormalizedReceipt;
    finality: NormalizedFinality;
    evidence: BscTestnetPtaWbnbLpJournalTerminalEvidence;
  }>
> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const [primaryTxRaw, corroboratorTxRaw, primaryReceiptRaw, corroboratorReceiptRaw] =
      await Promise.all([
        primary.request("eth_getTransactionByHash", [transactionHash]),
        corroborator.request("eth_getTransactionByHash", [transactionHash]),
        primary.request("eth_getTransactionReceipt", [transactionHash]),
        corroborator.request("eth_getTransactionReceipt", [transactionHash])
      ]);
    if (
      primaryTxRaw === null ||
      corroboratorTxRaw === null ||
      primaryReceiptRaw === null ||
      corroboratorReceiptRaw === null
    ) {
      await delay(RECEIPT_POLL_MILLISECONDS);
      continue;
    }
    const primaryTx = normalizeTransaction(primaryTxRaw, expected, transactionHash);
    const corroboratorTx = normalizeTransaction(corroboratorTxRaw, expected, transactionHash);
    const primaryReceipt = normalizeReceipt(primaryReceiptRaw, expected, transactionHash);
    const corroboratorReceipt = normalizeReceipt(corroboratorReceiptRaw, expected, transactionHash);
    if (
      primaryTx === null ||
      corroboratorTx === null ||
      primaryReceipt === null ||
      corroboratorReceipt === null ||
      stable(primaryTx) !== stable(corroboratorTx) ||
      stable(primaryReceipt) !== stable(corroboratorReceipt)
    ) {
      fail("RPC_INVALID");
    }
    if (
      primaryTx.blockHash !== primaryReceipt.blockHash ||
      primaryTx.blockNumber !== primaryReceipt.blockNumber ||
      corroboratorTx.blockHash !== corroboratorReceipt.blockHash ||
      corroboratorTx.blockNumber !== corroboratorReceipt.blockNumber
    ) {
      fail("RPC_INVALID");
    }
    const receiptBlockTag = toHex(BigInt(primaryReceipt.blockNumber));
    const [
      primaryBlockRaw,
      corroboratorBlockRaw,
      primaryCanonicalBlockRaw,
      corroboratorCanonicalBlockRaw,
      primaryFinalizedRaw,
      corroboratorFinalizedRaw
    ] = await Promise.all([
      primary.request("eth_getBlockByHash", [primaryReceipt.blockHash, false]),
      corroborator.request("eth_getBlockByHash", [primaryReceipt.blockHash, false]),
      primary.request("eth_getBlockByNumber", [receiptBlockTag, false]),
      corroborator.request("eth_getBlockByNumber", [receiptBlockTag, false]),
      primary.request("eth_getBlockByNumber", ["finalized", false]),
      corroborator.request("eth_getBlockByNumber", ["finalized", false])
    ]);
    const primaryBlock = record(primaryBlockRaw);
    const corroboratorBlock = record(corroboratorBlockRaw);
    const primaryCanonicalBlock = record(primaryCanonicalBlockRaw);
    const corroboratorCanonicalBlock = record(corroboratorCanonicalBlockRaw);
    const primaryFinalized = record(primaryFinalizedRaw);
    const corroboratorFinalized = record(corroboratorFinalizedRaw);
    if (
      primaryBlock === null ||
      corroboratorBlock === null ||
      primaryCanonicalBlock === null ||
      corroboratorCanonicalBlock === null ||
      primaryFinalized === null ||
      corroboratorFinalized === null ||
      dataHex(primaryBlock.hash, 32) !== primaryReceipt.blockHash ||
      dataHex(corroboratorBlock.hash, 32) !== primaryReceipt.blockHash ||
      dataHex(primaryCanonicalBlock.hash, 32) !== primaryReceipt.blockHash ||
      dataHex(corroboratorCanonicalBlock.hash, 32) !== primaryReceipt.blockHash ||
      quantity(primaryBlock.number, "block.number").toString() !== primaryReceipt.blockNumber ||
      quantity(corroboratorBlock.number, "block.number").toString() !==
        primaryReceipt.blockNumber ||
      quantity(primaryCanonicalBlock.number, "block.number").toString() !==
        primaryReceipt.blockNumber ||
      quantity(corroboratorCanonicalBlock.number, "block.number").toString() !==
        primaryReceipt.blockNumber
    ) {
      fail("RPC_INVALID");
    }
    const primaryFinalizedBlockNumber = quantity(
      primaryFinalized.number,
      "primary.finalized.number"
    );
    const corroboratorFinalizedBlockNumber = quantity(
      corroboratorFinalized.number,
      "corroborator.finalized.number"
    );
    const receiptBlockNumber = BigInt(primaryReceipt.blockNumber);
    if (
      primaryFinalizedBlockNumber < receiptBlockNumber ||
      corroboratorFinalizedBlockNumber < receiptBlockNumber
    ) {
      await delay(RECEIPT_POLL_MILLISECONDS);
      continue;
    }
    const finality = Object.freeze({
      receiptBlockNumber: primaryReceipt.blockNumber,
      receiptBlockHash: primaryReceipt.blockHash,
      primaryFinalizedBlockNumber: primaryFinalizedBlockNumber.toString(),
      primaryFinalizedBlockHash: dataHex(primaryFinalized.hash, 32),
      corroboratorFinalizedBlockNumber: corroboratorFinalizedBlockNumber.toString(),
      corroboratorFinalizedBlockHash: dataHex(corroboratorFinalized.hash, 32),
      canonicalReceiptBlockAgreementVerified: true as const
    });
    const receiptSha256 = sha256(stringToHex(stable(primaryReceipt)));
    return Object.freeze({
      receipt: primaryReceipt,
      finality,
      evidence: Object.freeze({
        outcome: primaryReceipt.status === "1" ? "confirmed" : "reverted",
        transactionHash,
        receiptSha256,
        finalitySha256: sha256(stringToHex(stable(finality))),
        blockNumber: primaryReceipt.blockNumber,
        blockHash: primaryReceipt.blockHash,
        primaryFinalizedBlockNumber: finality.primaryFinalizedBlockNumber,
        primaryFinalizedBlockHash: finality.primaryFinalizedBlockHash,
        corroboratorFinalizedBlockNumber: finality.corroboratorFinalizedBlockNumber,
        corroboratorFinalizedBlockHash: finality.corroboratorFinalizedBlockHash
      })
    });
  }
  throw new FirstLpRunnerFailure("RECEIPT_UNKNOWN");
}

function assertExactApprovalEvent(receipt: NormalizedReceipt): void {
  let exactApprovalCount = 0;
  for (const log of receipt.logs) {
    if (log.address !== BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS || log.topics.length === 0) continue;
    try {
      const decoded = decodeEventLog({
        abi: ERC20_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]]
      });
      if (
        decoded.eventName === "Approval" &&
        decoded.args.owner === BSC_TESTNET_PTA_WBNB_LP_OWNER &&
        decoded.args.spender === BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER &&
        decoded.args.value === BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW
      ) {
        exactApprovalCount += 1;
      }
    } catch {
      // Unrelated logs do not substitute for the one exact Approval event.
    }
  }
  if (exactApprovalCount !== 1) fail("POST_STATE_INVALID");
}

function extractMintEvents(receipt: NormalizedReceipt): Readonly<{
  tokenId: bigint;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
}> {
  let tokenId: bigint | null = null;
  let increase: Readonly<{
    tokenId: bigint;
    liquidity: bigint;
    amount0: bigint;
    amount1: bigint;
  }> | null = null;
  for (const log of receipt.logs) {
    if (log.address !== BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER) continue;
    try {
      if (log.topics.length === 0) continue;
      const decoded = decodeEventLog({
        abi: MANAGER_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]]
      });
      if (
        decoded.eventName === "Transfer" &&
        decoded.args.from === ZERO_ADDRESS &&
        decoded.args.to === BSC_TESTNET_PTA_WBNB_LP_OWNER
      ) {
        if (tokenId !== null) fail("POST_STATE_INVALID");
        tokenId = decoded.args.tokenId;
      }
      if (decoded.eventName === "IncreaseLiquidity") {
        if (increase !== null) fail("POST_STATE_INVALID");
        increase = Object.freeze({
          tokenId: decoded.args.tokenId,
          liquidity: decoded.args.liquidity,
          amount0: decoded.args.amount0,
          amount1: decoded.args.amount1
        });
      }
    } catch (error) {
      if (error instanceof FirstLpRunnerFailure) throw error;
    }
  }
  if (
    tokenId === null ||
    increase === null ||
    increase.tokenId !== tokenId ||
    increase.liquidity !== 1_000_000_000_000_000_000n ||
    increase.amount0 !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW ||
    increase.amount1 !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI
  ) {
    fail("POST_STATE_INVALID");
  }
  return Object.freeze(increase);
}

async function postStateObservation(
  client: FixedRpcClient,
  receipt: NormalizedReceipt,
  tokenId: bigint
): Promise<Readonly<Record<string, unknown>>> {
  const block = { blockHash: receipt.blockHash, requireCanonical: true as const };
  const allowanceData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [BSC_TESTNET_PTA_WBNB_LP_OWNER, BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER]
  });
  const ownerOfData = encodeFunctionData({
    abi: MANAGER_ABI,
    functionName: "ownerOf",
    args: [tokenId]
  });
  const positionsData = encodeFunctionData({
    abi: MANAGER_ABI,
    functionName: "positions",
    args: [tokenId]
  });
  const liquidityData = encodeFunctionData({ abi: POOL_ABI, functionName: "liquidity" });
  const [allowanceRaw, ownerRaw, positionRaw, liquidityRaw] = await Promise.all([
    readCall(client, BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS, allowanceData, block),
    readCall(client, BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER, ownerOfData, block),
    readCall(client, BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER, positionsData, block),
    readCall(client, BSC_TESTNET_PTA_WBNB_LP_POOL, liquidityData, block)
  ]);
  const allowance = decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "allowance",
    data: allowanceRaw
  });
  const owner = decodeFunctionResult({ abi: MANAGER_ABI, functionName: "ownerOf", data: ownerRaw });
  const position = decodeFunctionResult({
    abi: MANAGER_ABI,
    functionName: "positions",
    data: positionRaw
  });
  const poolLiquidity = decodeFunctionResult({
    abi: POOL_ABI,
    functionName: "liquidity",
    data: liquidityRaw
  });
  const [
    positionNonce,
    operator,
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    liquidity,
    feeGrowth0,
    feeGrowth1,
    tokensOwed0,
    tokensOwed1
  ] = position;
  if (
    allowance !== 0n ||
    owner !== BSC_TESTNET_PTA_WBNB_LP_OWNER ||
    token0 !== BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS ||
    token1 !== BSC_TESTNET_PTA_WBNB_LP_WBNB_ADDRESS ||
    fee !== BSC_TESTNET_PTA_WBNB_LP_FEE ||
    tickLower !== BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER ||
    tickUpper !== BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER ||
    liquidity !== 1_000_000_000_000_000_000n ||
    poolLiquidity !== 1_000_000_000_000_000_000n
  ) {
    fail("POST_STATE_INVALID");
  }
  return {
    provider: client.label,
    eip1898BlockHash: receipt.blockHash,
    tokenId: tokenId.toString(),
    owner,
    allowanceRaw: allowance.toString(),
    position: {
      nonce: positionNonce.toString(),
      operator,
      token0,
      token1,
      fee: fee.toString(),
      tickLower,
      tickUpper,
      liquidity: liquidity.toString(),
      feeGrowthInside0LastX128: feeGrowth0.toString(),
      feeGrowthInside1LastX128: feeGrowth1.toString(),
      tokensOwed0: tokensOwed0.toString(),
      tokensOwed1: tokensOwed1.toString()
    },
    poolLiquidityRaw: poolLiquidity.toString()
  };
}

async function verifyMintPostState(
  primary: FixedRpcClient,
  corroborator: FixedRpcClient,
  receipt: NormalizedReceipt
): Promise<Readonly<Record<string, unknown>>> {
  const events = extractMintEvents(receipt);
  const [left, right] = await Promise.all([
    postStateObservation(primary, receipt, events.tokenId),
    postStateObservation(corroborator, receipt, events.tokenId)
  ]);
  if (stable({ ...left, provider: null }) !== stable({ ...right, provider: null })) {
    fail("POST_STATE_INVALID");
  }
  return Object.freeze({
    events: {
      tokenId: events.tokenId.toString(),
      liquidityRaw: events.liquidity.toString(),
      amount0Raw: events.amount0.toString(),
      amount1Raw: events.amount1.toString()
    },
    providerAgreementVerified: true,
    observations: [left, right]
  });
}

async function readOwnerLine(timeoutMilliseconds: number): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || timeoutMilliseconds <= 0) {
    throw new FirstLpRunnerFailure("OWNER_CONFIRMATION_INVALID");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  const terminal = createInterface({ input: stdin, output: stdout, terminal: true });
  try {
    const line = await terminal.question("", { signal: controller.signal });
    if (
      Buffer.byteLength(line, "utf8") === 0 ||
      Buffer.byteLength(line, "utf8") > OWNER_LINE_MAXIMUM_BYTES ||
      /[\r\n\0]/u.test(line) ||
      line.trim() !== line
    ) {
      throw new FirstLpRunnerFailure("OWNER_CONFIRMATION_INVALID");
    }
    return line;
  } catch (error) {
    if (error instanceof FirstLpRunnerFailure) throw error;
    throw new FirstLpRunnerFailure("OWNER_CONFIRMATION_INVALID");
  } finally {
    clearTimeout(timeout);
    terminal.close();
  }
}

async function signSubmitAndReconcile(
  authorization: BscTestnetPtaWbnbLpConfirmedExecution,
  journal: BscTestnetPtaWbnbLpJournal,
  primary: FixedRpcClient,
  corroborator: FixedRpcClient,
  step: "approval" | "mint"
): Promise<
  Readonly<{
    signed: BscTestnetPtaWbnbLpSignedTransaction;
    receipt: NormalizedReceipt;
    finality: NormalizedFinality;
  }>
> {
  const order = step === "approval" ? 1 : 2;
  const transaction =
    step === "approval" ? authorization.plan.transactions[0] : authorization.plan.transactions[1];
  await dualPreSubmissionRecheck(primary, corroborator, authorization.plan, transaction, step);
  await journal.commitSigningStarted(authorization, step);
  const signed = await signBscTestnetPtaWbnbLpExactTransactionForInternalUse(
    authorization,
    order,
    Date.now()
  );
  await journal.commitSigned(authorization, step, signed);
  await dualPreSubmissionRecheck(primary, corroborator, authorization.plan, transaction, step);
  await journal.commitSubmissionStarted(authorization, step, signed);
  await dualPreSubmissionRecheck(primary, corroborator, authorization.plan, transaction, step);
  try {
    await primary.sendRawOnce(signed.rawTransaction);
  } catch {
    // A send response is not evidence that the transaction was or was not accepted. Reconcile only.
  }
  const reconciled = await reconcileReceipt(
    primary,
    corroborator,
    transaction,
    signed.transactionHash
  );
  if (reconciled.evidence.outcome === "confirmed") {
    if (step === "approval") assertExactApprovalEvent(reconciled.receipt);
    else extractMintEvents(reconciled.receipt);
  }
  await journal.commitTerminal(authorization, step, reconciled.evidence);
  if (reconciled.evidence.outcome !== "confirmed") {
    throw new FirstLpRunnerFailure("RECEIPT_REVERTED");
  }
  return Object.freeze({
    signed,
    receipt: reconciled.receipt,
    finality: reconciled.finality
  });
}

async function exactTransactionFromJournal(
  state: BscTestnetPtaWbnbLpJournalState,
  step: "approval" | "mint"
): Promise<
  Readonly<{
    signed: BscTestnetPtaWbnbLpSignedTransaction;
    expected: BscTestnetPtaWbnbLpExactExecutionTransaction;
  }>
> {
  const approval = step === "approval";
  const signed = approval ? state.approvalSigned : state.mintSigned;
  const signingRecord = state.records[approval ? 1 : 5];
  if (state.ownerRecord === null || signed === null || signingRecord === undefined) {
    fail("JOURNAL_BLOCKED");
  }
  const raw = signed.rawTransaction;
  const parsed = parseTransaction(raw);
  const recoveredSigner = await recoverTransactionAddress({
    serializedTransaction: raw as TransactionSerialized
  });
  const nonceField = approval ? "approvalNonce" : "mintNonce";
  const maximumGasLimit = approval ? 100_000n : 800_000n;
  if (
    recoveredSigner !== BSC_TESTNET_PTA_WBNB_LP_OWNER ||
    signed.transactionHash !== keccak256(raw) ||
    parsed.type !== "legacy" ||
    parsed.chainId !== BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID ||
    parsed.nonce === undefined ||
    parsed.to === undefined ||
    parsed.data === undefined ||
    parsed.value === undefined ||
    parsed.gas === undefined ||
    parsed.gasPrice === undefined ||
    parsed.gas === 0n ||
    parsed.gas > maximumGasLimit ||
    parsed.gasPrice === 0n ||
    parsed.gasPrice > 300_000_000n ||
    String(parsed.nonce) !== state.ownerRecord[nonceField] ||
    signingRecord.kind !== "signing_started" ||
    signingRecord.step !== step ||
    signingRecord.nonce !== String(parsed.nonce) ||
    signingRecord.to !== parsed.to ||
    signingRecord.dataKeccak256 !== keccak256(parsed.data) ||
    signingRecord.valueWei !== parsed.value.toString() ||
    signingRecord.gasLimit !== parsed.gas.toString() ||
    signingRecord.gasPriceWei !== parsed.gasPrice.toString()
  ) {
    fail("JOURNAL_BLOCKED");
  }
  if (approval) {
    if (
      parsed.to !== BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS ||
      parsed.value !== 0n ||
      parsed.data.slice(0, 10) !== "0x095ea7b3"
    ) {
      fail("JOURNAL_BLOCKED");
    }
    const decoded = decodeFunctionData({ abi: ERC20_ABI, data: parsed.data });
    if (
      decoded.functionName !== "approve" ||
      decoded.args[0] !== BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER ||
      decoded.args[1] !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW
    ) {
      fail("JOURNAL_BLOCKED");
    }
  } else {
    if (
      parsed.to !== BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER ||
      parsed.value !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI ||
      parsed.data.slice(0, 10) !== "0x88316456"
    ) {
      fail("JOURNAL_BLOCKED");
    }
    const decoded = decodeFunctionData({ abi: MANAGER_ABI, data: parsed.data });
    if (decoded.functionName !== "mint") fail("JOURNAL_BLOCKED");
    const params = decoded.args[0];
    if (
      params.token0 !== BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS ||
      params.token1 !== BSC_TESTNET_PTA_WBNB_LP_WBNB_ADDRESS ||
      params.fee !== BSC_TESTNET_PTA_WBNB_LP_FEE ||
      params.tickLower !== BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER ||
      params.tickUpper !== BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER ||
      params.amount0Desired !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW ||
      params.amount1Desired !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI ||
      params.amount0Min !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW ||
      params.amount1Min !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI ||
      params.recipient !== BSC_TESTNET_PTA_WBNB_LP_OWNER
    ) {
      fail("JOURNAL_BLOCKED");
    }
  }
  return Object.freeze({
    signed,
    expected: Object.freeze({
      order: approval ? 1 : 2,
      purpose: approval
        ? "exact_PTA_allowance_for_one_mint"
        : "direct_zero_slippage_full_range_Pancake_V3_mint",
      chainId: BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID,
      type: "legacy",
      from: BSC_TESTNET_PTA_WBNB_LP_OWNER,
      nonce: BigInt(parsed.nonce),
      to: parsed.to,
      selector: approval ? "0x095ea7b3" : "0x88316456",
      data: parsed.data,
      dataKeccak256: keccak256(parsed.data),
      valueWei: parsed.value,
      gasLimit: parsed.gas,
      gasPriceWei: parsed.gasPrice
    })
  });
}

async function finishRecoveredMintEvidence(
  release: ReleaseIdentity,
  journal: BscTestnetPtaWbnbLpJournal,
  primary: FixedRpcClient,
  corroborator: FixedRpcClient
): Promise<never> {
  const state = await journal.readState();
  if (
    state.status !== "mint_confirmed" ||
    state.ownerRecord === null ||
    state.approvalTerminal?.outcome !== "confirmed" ||
    state.mintTerminal?.outcome !== "confirmed" ||
    state.ownerRecord.sourceCommit !== release.releaseCommit ||
    state.ownerRecord.runtimeManifestSha256 !== release.runtimeManifestSha256
  ) {
    fail("JOURNAL_BLOCKED");
  }
  const approval = await exactTransactionFromJournal(state, "approval");
  const mint = await exactTransactionFromJournal(state, "mint");
  const [approvalReconciled, mintReconciled] = await Promise.all([
    reconcileReceipt(primary, corroborator, approval.expected, approval.signed.transactionHash),
    reconcileReceipt(primary, corroborator, mint.expected, mint.signed.transactionHash)
  ]);
  if (
    approvalReconciled.evidence.outcome !== "confirmed" ||
    mintReconciled.evidence.outcome !== "confirmed" ||
    approvalReconciled.evidence.transactionHash !== state.approvalTerminal.transactionHash ||
    approvalReconciled.evidence.receiptSha256 !== state.approvalTerminal.receiptSha256 ||
    approvalReconciled.evidence.blockNumber !== state.approvalTerminal.blockNumber ||
    approvalReconciled.evidence.blockHash !== state.approvalTerminal.blockHash ||
    mintReconciled.evidence.transactionHash !== state.mintTerminal.transactionHash ||
    mintReconciled.evidence.receiptSha256 !== state.mintTerminal.receiptSha256 ||
    mintReconciled.evidence.blockNumber !== state.mintTerminal.blockNumber ||
    mintReconciled.evidence.blockHash !== state.mintTerminal.blockHash
  ) {
    fail("JOURNAL_BLOCKED");
  }
  assertExactApprovalEvent(approvalReconciled.receipt);
  extractMintEvents(mintReconciled.receipt);
  const postState = await verifyMintPostState(primary, corroborator, mintReconciled.receipt);
  const evidence = await writeFinalEvidence(
    release,
    {
      exactScopeSha256: state.ownerRecord.scopeSha256 as Hex,
      ownerConfirmationSha256: state.ownerRecord.ownerConfirmationSha256 as Hex,
      ownerChallengeBindingSha256: state.ownerRecord.ownerChallengeBindingSha256 as Hex
    },
    {
      signed: approval.signed,
      receipt: approvalReconciled.receipt,
      finality: approvalReconciled.finality
    },
    {
      signed: mint.signed,
      receipt: mintReconciled.receipt,
      finality: mintReconciled.finality
    },
    postState
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "confirmed_recovered_without_resend",
        chainId: 97,
        approvalTransactionHash: approval.signed.transactionHash,
        mintTransactionHash: mint.signed.transactionHash,
        evidence,
        retryBroadcastAllowed: false,
        mainnetWritePossible: false
      },
      null,
      2
    )}\n`
  );
  process.exit(0);
}

async function recoverExisting(
  release: ReleaseIdentity,
  journal: BscTestnetPtaWbnbLpJournal,
  primary: FixedRpcClient,
  corroborator: FixedRpcClient
): Promise<never> {
  const state = await journal.readState();
  if (state.status === "mint_confirmed") {
    return finishRecoveredMintEvidence(release, journal, primary, corroborator);
  }
  if (state.status === "approval_submission_started" && state.approvalSigned !== null) {
    const raw = state.approvalSigned.rawTransaction;
    const parsed = parseTransaction(raw);
    const recoveredSigner = await recoverTransactionAddress({
      serializedTransaction: raw as TransactionSerialized
    });
    if (
      state.ownerRecord === null ||
      recoveredSigner !== BSC_TESTNET_PTA_WBNB_LP_OWNER ||
      parsed.type !== "legacy" ||
      parsed.chainId !== BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID ||
      parsed.nonce === undefined ||
      parsed.to !== BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS ||
      parsed.data === undefined ||
      parsed.data.slice(0, 10) !== "0x095ea7b3" ||
      parsed.value === undefined ||
      parsed.gas === undefined ||
      parsed.gasPrice === undefined ||
      parsed.value !== 0n ||
      parsed.gas > 100_000n ||
      parsed.gasPrice > 300_000_000n ||
      String(parsed.nonce) !== state.ownerRecord.approvalNonce
    ) {
      fail("JOURNAL_BLOCKED");
    }
    const decodedApproval = decodeFunctionData({ abi: ERC20_ABI, data: parsed.data });
    if (
      decodedApproval.functionName !== "approve" ||
      decodedApproval.args[0] !== BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER ||
      decodedApproval.args[1] !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW
    ) {
      fail("JOURNAL_BLOCKED");
    }
    const expected: BscTestnetPtaWbnbLpExactExecutionTransaction = {
      order: 1,
      purpose: "exact_PTA_allowance_for_one_mint",
      chainId: BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID,
      type: "legacy",
      from: BSC_TESTNET_PTA_WBNB_LP_OWNER,
      nonce: BigInt(parsed.nonce),
      to: BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS,
      selector: "0x095ea7b3",
      data: parsed.data,
      dataKeccak256: keccak256(parsed.data),
      valueWei: parsed.value,
      gasLimit: parsed.gas,
      gasPriceWei: parsed.gasPrice ?? 0n
    };
    const reconciled = await reconcileReceipt(
      primary,
      corroborator,
      expected,
      state.approvalSigned.transactionHash
    );
    if (reconciled.evidence.outcome === "confirmed") {
      assertExactApprovalEvent(reconciled.receipt);
    }
    await journal.commitTerminalFromRecovery("approval", reconciled.evidence);
    process.stdout.write(
      `${JSON.stringify({
        status: "approval_reconciled_owner_action_required",
        transactionHash: reconciled.evidence.transactionHash,
        outcome: reconciled.evidence.outcome,
        retryBroadcastAllowed: false,
        mintAttempted: false
      })}\n`
    );
    process.exit(0);
  }
  if (state.status === "mint_submission_started" && state.mintSigned !== null) {
    const raw = state.mintSigned.rawTransaction;
    const parsed = parseTransaction(raw);
    const recoveredSigner = await recoverTransactionAddress({
      serializedTransaction: raw as TransactionSerialized
    });
    if (
      state.ownerRecord === null ||
      recoveredSigner !== BSC_TESTNET_PTA_WBNB_LP_OWNER ||
      parsed.type !== "legacy" ||
      parsed.chainId !== BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID ||
      parsed.nonce === undefined ||
      parsed.to !== BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER ||
      parsed.data === undefined ||
      parsed.data.slice(0, 10) !== "0x88316456" ||
      parsed.value === undefined ||
      parsed.gas === undefined ||
      parsed.gasPrice === undefined ||
      parsed.value !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI ||
      parsed.gas > 800_000n ||
      parsed.gasPrice > 300_000_000n ||
      String(parsed.nonce) !== state.ownerRecord.mintNonce
    ) {
      fail("JOURNAL_BLOCKED");
    }
    const decodedMint = decodeFunctionData({ abi: MANAGER_ABI, data: parsed.data });
    if (decodedMint.functionName !== "mint") fail("JOURNAL_BLOCKED");
    const params = decodedMint.args[0];
    if (
      params.token0 !== BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS ||
      params.token1 !== BSC_TESTNET_PTA_WBNB_LP_WBNB_ADDRESS ||
      params.fee !== BSC_TESTNET_PTA_WBNB_LP_FEE ||
      params.tickLower !== BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER ||
      params.tickUpper !== BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER ||
      params.amount0Desired !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW ||
      params.amount1Desired !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI ||
      params.amount0Min !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW ||
      params.amount1Min !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI ||
      params.recipient !== BSC_TESTNET_PTA_WBNB_LP_OWNER
    ) {
      fail("JOURNAL_BLOCKED");
    }
    const expected: BscTestnetPtaWbnbLpExactExecutionTransaction = {
      order: 2,
      purpose: "direct_zero_slippage_full_range_Pancake_V3_mint",
      chainId: BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID,
      type: "legacy",
      from: BSC_TESTNET_PTA_WBNB_LP_OWNER,
      nonce: BigInt(parsed.nonce),
      to: BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER,
      selector: "0x88316456",
      data: parsed.data,
      dataKeccak256: keccak256(parsed.data),
      valueWei: parsed.value,
      gasLimit: parsed.gas,
      gasPriceWei: parsed.gasPrice ?? 0n
    };
    const reconciled = await reconcileReceipt(
      primary,
      corroborator,
      expected,
      state.mintSigned.transactionHash
    );
    if (reconciled.evidence.outcome === "confirmed") {
      extractMintEvents(reconciled.receipt);
    }
    await journal.commitTerminalFromRecovery("mint", reconciled.evidence);
    if (reconciled.evidence.outcome === "confirmed") {
      return finishRecoveredMintEvidence(release, journal, primary, corroborator);
    }
    process.stdout.write(
      `${JSON.stringify({
        status: "mint_reconciled",
        transactionHash: reconciled.evidence.transactionHash,
        outcome: reconciled.evidence.outcome,
        retryBroadcastAllowed: false
      })}\n`
    );
    process.exit(0);
  }
  process.stdout.write(
    `${JSON.stringify({
      status: "blocked_existing_durable_state",
      journalStatus: state.status,
      retryBroadcastAllowed: false,
      message:
        "Existing append-only LP state requires an explicit recovery review; no signing or send was attempted."
    })}\n`
  );
  process.exit(1);
}

async function writeFinalEvidence(
  release: ReleaseIdentity,
  binding: Readonly<{
    exactScopeSha256: Hex;
    ownerConfirmationSha256: Hex;
    ownerChallengeBindingSha256: Hex;
  }>,
  approval: Readonly<{
    signed: BscTestnetPtaWbnbLpSignedTransaction;
    receipt: NormalizedReceipt;
    finality: NormalizedFinality;
  }>,
  mint: Readonly<{
    signed: BscTestnetPtaWbnbLpSignedTransaction;
    receipt: NormalizedReceipt;
    finality: NormalizedFinality;
  }>,
  postState: Readonly<Record<string, unknown>>
): Promise<Readonly<{ path: string; sha256: Hex }>> {
  const relativePath = `evidence/onchain/bsc-testnet-pta-wbnb-first-lp-${mint.signed.transactionHash.slice(2)}.json`;
  const path = resolve(ROOT, relativePath);
  const body = {
    schemaVersion: 1,
    kind: "bsc_testnet_pta_wbnb_first_lp_execution_evidence",
    status: "dual_provider_finalized_receipts_confirmed_post_state_verified",
    release,
    exactScopeSha256: binding.exactScopeSha256,
    ownerConfirmationSha256: binding.ownerConfirmationSha256,
    ownerChallengeBindingSha256: binding.ownerChallengeBindingSha256,
    chain: { environment: "bsc-testnet", chainId: 97, mainnetWritePossible: false },
    boundary: {
      noRetry: true,
      noReplacement: true,
      approvalSentAtMostOnce: true,
      mintSentAtMostOnce: true,
      liquidityClaimRequiresTheseReceipts: true,
      realizedEconomicBenefitStillUnknown: true
    },
    approval: {
      transactionHash: approval.signed.transactionHash,
      receipt: approval.receipt,
      finality: approval.finality
    },
    mint: {
      transactionHash: mint.signed.transactionHash,
      receipt: mint.receipt,
      finality: mint.finality
    },
    postState
  };
  const bytes = `${JSON.stringify(body, null, 2)}\n`;
  await import("node:fs/promises").then(async ({ mkdir }) =>
    mkdir(dirname(path), { recursive: true })
  );
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return Object.freeze({
    path: relativePath,
    sha256: `0x${createHash("sha256").update(bytes).digest("hex")}` as Hex
  });
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (
    process.argv.length !== 3 ||
    (mode !== EXACT_EXECUTION_FLAG && mode !== READ_ONLY_REHEARSAL_FLAG)
  ) {
    fail("ARGUMENTS_INVALID");
  }
  await assertExactRuntimeInvocation();
  const release = await inspectRelease();
  await assertRetiredWindowsBscTestnetPtaWbnbLpV1V2V3BoundedForInternalUse();
  if (mode === READ_ONLY_REHEARSAL_FLAG) {
    const scopeClients = createFixedOfficialBscTestnetPtaWbnbLpRpcClients();
    const scope = await prepareBscTestnetPtaWbnbLpExactScope({
      ...scopeClients,
      now: () => new Date(),
      sourceCommit: release.releaseCommit
    });
    const plan = parseBscTestnetPtaWbnbLpExactExecutionPlanForInternalUse(scope, Date.now());
    const primary = new FixedRpcClient("primary", BSC_TESTNET_PTA_WBNB_LP_PRIMARY_RPC_ORIGIN);
    const corroborator = new FixedRpcClient(
      "corroborator",
      BSC_TESTNET_PTA_WBNB_LP_CORROBORATOR_RPC_ORIGIN
    );
    for (let pass = 0; pass < 3; pass += 1) {
      await dualPreSubmissionRecheck(primary, corroborator, plan, plan.transactions[0], "approval");
    }
    process.stdout.write(
      `${JSON.stringify({
        status: "read_only_rehearsal_passed",
        releaseCommit: release.releaseCommit,
        runtimeManifestSha256: release.runtimeManifestSha256,
        exactScopeSha256: plan.exactScopeSha256,
        preSubmissionPasses: 3,
        custodyAccessed: false,
        journalV4Created: false,
        signed: false,
        broadcast: false,
        mainnetWritePossible: false
      })}\n`
    );
    return;
  }
  const journal = await createWindowsBscTestnetPtaWbnbLpJournalForInternalUse();
  failureJournal = journal;
  const existing = await journal.readState();
  const primary = new FixedRpcClient("primary", BSC_TESTNET_PTA_WBNB_LP_PRIMARY_RPC_ORIGIN);
  const corroborator = new FixedRpcClient(
    "corroborator",
    BSC_TESTNET_PTA_WBNB_LP_CORROBORATOR_RPC_ORIGIN
  );
  if (existing.status !== "empty") {
    await recoverExisting(release, journal, primary, corroborator);
  }
  await assertFixedBscTestnetPtaWbnbLpCustodyMetadataForInternalUse();
  const clients = createFixedOfficialBscTestnetPtaWbnbLpRpcClients();
  const scope = await prepareBscTestnetPtaWbnbLpExactScope({
    ...clients,
    now: () => new Date(),
    sourceCommit: release.releaseCommit
  });
  const plan = parseBscTestnetPtaWbnbLpExactExecutionPlanForInternalUse(scope, Date.now());
  const ceremonyNonce = `0x${randomBytes(32).toString("hex")}` as Hex;
  const challenge = createBscTestnetPtaWbnbLpOwnerChallengeForInternalUse({
    plan,
    ceremonyNonce,
    runtimeManifestSha256: release.runtimeManifestSha256
  });
  process.stdout.write(
    [
      "----- PROOFERA EXACT BSC-TESTNET FIRST-LP AUTHORIZATION -----",
      `releaseCommit=${release.releaseCommit}`,
      `runtimeManifestSha256=${release.runtimeManifestSha256}`,
      `exactScopeSha256=${plan.exactScopeSha256}`,
      `ownerChallengeBindingSha256=${challenge.challengeBindingSha256}`,
      "chainId=97",
      `owner=${BSC_TESTNET_PTA_WBNB_LP_OWNER}`,
      `approval=PTA approve(manager, ${BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW})`,
      `mint=full range ${BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW} PTA raw + ${BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI} wei`,
      `nonces=${plan.transactions[0].nonce},${plan.transactions[1].nonce}`,
      `maximumNativeOutflowWei=${plan.maximumNativeOutflowWei}`,
      `scopeExpiresAt=${plan.scopeExpiresAt}`,
      "mainnet=false; retry=false; replacement=false; chatIsAuthorization=false",
      "The full ownerChallengeBindingSha256 above binds every displayed scope/runtime/nonce field.",
      "To authorize exactly that same-process challenge, type CONFIRM and press Enter:",
      challenge.confirmationLine,
      "----- END PROOFERA EXACT BSC-TESTNET FIRST-LP AUTHORIZATION -----",
      ""
    ].join("\n")
  );
  const timeout =
    plan.scopeExpiresAtMilliseconds -
    Date.now() -
    BSC_TESTNET_PTA_WBNB_LP_MINIMUM_EXECUTION_WINDOW_MILLISECONDS;
  const received = await readOwnerLine(timeout);
  let authorization: BscTestnetPtaWbnbLpConfirmedExecution;
  try {
    authorization = confirmBscTestnetPtaWbnbLpOwnerChallengeForInternalUse(
      challenge,
      received,
      Date.now()
    );
  } catch {
    throw new FirstLpRunnerFailure("OWNER_CONFIRMATION_INVALID");
  }
  await journal.commitOwnerConfirmed(authorization);
  const approval = await signSubmitAndReconcile(
    authorization,
    journal,
    primary,
    corroborator,
    "approval"
  );
  const mint = await signSubmitAndReconcile(authorization, journal, primary, corroborator, "mint");
  const postState = await verifyMintPostState(primary, corroborator, mint.receipt);
  const evidence = await writeFinalEvidence(
    release,
    {
      exactScopeSha256: authorization.plan.exactScopeSha256,
      ownerConfirmationSha256: authorization.ownerConfirmationSha256,
      ownerChallengeBindingSha256: authorization.ownerChallengeBindingSha256
    },
    approval,
    mint,
    postState
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "confirmed",
        chainId: 97,
        approvalTransactionHash: approval.signed.transactionHash,
        mintTransactionHash: mint.signed.transactionHash,
        evidence,
        retryBroadcastAllowed: false,
        mainnetWritePossible: false
      },
      null,
      2
    )}\n`
  );
}

main().catch(async (error: unknown) => {
  const code =
    error instanceof FirstLpRunnerFailure ||
    error instanceof BscTestnetPtaWbnbLpExecutionFailure ||
    error instanceof BscTestnetPtaWbnbLpJournalFailure
      ? error.code
      : "UNEXPECTED_FAILURE";
  let journalStatus: string | null = null;
  let approvalTransactionHash: Hex | null = null;
  let mintTransactionHash: Hex | null = null;
  try {
    const state = await failureJournal?.readState();
    journalStatus = state?.status ?? null;
    approvalTransactionHash = state?.approvalSigned?.transactionHash ?? null;
    mintTransactionHash = state?.mintSigned?.transactionHash ?? null;
  } catch {
    journalStatus = "unavailable";
  }
  process.stderr.write(
    `${JSON.stringify({
      status: "blocked",
      code,
      journalStatus,
      approvalTransactionHash,
      mintTransactionHash,
      retryBroadcastAllowed: false,
      mainnetWritePossible: false,
      message:
        "Exact first-LP runner failed closed; inspect durable state before any further action."
    })}\n`
  );
  process.exitCode = 1;
});
