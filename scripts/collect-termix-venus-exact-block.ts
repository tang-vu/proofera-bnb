import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Hex
} from "viem";

import {
  buildVenusCoreExactBlockEvidence,
  venusCoreExactBlockProviderObservationSchema,
  VENUS_CORE_POOL_BSC_DEPLOYMENTS
} from "../packages/integrations/src/index";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FINALITY_BLOCKS = 30n;
const MAX_TRANSCRIPT_BYTES = 12 * 1024 * 1024;
const COMPTROLLER = VENUS_CORE_POOL_BSC_DEPLOYMENTS[97].comptroller;
const PROVIDERS = Object.freeze([
  Object.freeze({
    id: "publicnode-bsc-testnet",
    url: "https://bsc-testnet-rpc.publicnode.com"
  }),
  Object.freeze({
    id: "bnbchain-testnet-dataseed",
    url: "https://bsc-testnet-dataseed.bnbchain.org"
  })
]);
const bscTestnet = defineChain({
  id: 97,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "Test BNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: PROVIDERS.map(({ url }) => url) } },
  blockExplorers: { default: { name: "BscScan", url: "https://testnet.bscscan.com" } },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 17_422_483
    }
  }
});

const comptrollerAbi = parseAbi([
  "function getAllMarkets() view returns (address[])",
  "function getAssetsIn(address account) view returns (address[])",
  "function oracle() view returns (address)",
  "function vaiController() view returns (address)",
  "function markets(address vToken) view returns (bool isListed, uint256 collateralFactorMantissa, bool isVenus, uint256 liquidationThresholdMantissa, uint256 liquidationIncentiveMantissa, uint96 marketPoolId, bool isBorrowAllowed)",
  "function getEffectiveLtvFactor(address account, address vToken, uint8 weightingStrategy) view returns (uint256)"
]);
const marketConfigAbi = parseAbi([
  "function markets(address vToken) view returns (bool isListed, uint256 collateralFactorMantissa, bool isVenus, uint256 liquidationThresholdMantissa, uint256 liquidationIncentiveMantissa, uint96 marketPoolId, bool isBorrowAllowed)"
]);
const effectiveThresholdAbi = parseAbi([
  "function getEffectiveLtvFactor(address account, address vToken, uint8 weightingStrategy) view returns (uint256)"
]);
const vTokenSnapshotAbi = parseAbi([
  "function getAccountSnapshot(address account) view returns (uint256 errorCode, uint256 vTokenBalance, uint256 borrowBalance, uint256 exchangeRateMantissa)"
]);
const symbolAbi = parseAbi(["function symbol() view returns (string)"]);
const decimalsAbi = parseAbi(["function decimals() view returns (uint8)"]);
const underlyingAbi = parseAbi(["function underlying() view returns (address)"]);
const oracleAbi = parseAbi(["function getUnderlyingPrice(address vToken) view returns (uint256)"]);
const vaiControllerAbi = parseAbi([
  "function getVAIRepayAmount(address account) view returns (uint256)"
]);

interface RpcTranscriptEntry {
  readonly request: unknown;
  readonly response: unknown;
}

interface CliOptions {
  readonly account: Address;
  readonly blockNumber: bigint | null;
  readonly blockWindow: readonly bigint[] | null;
  readonly liveWindow: { readonly observations: number; readonly spacingSeconds: number } | null;
  readonly latestFinalized: boolean;
  readonly writeDevelopmentEvidence: boolean;
}

function parseCli(args: readonly string[]): CliOptions {
  let account: Address | null = null;
  let blockNumber: bigint | null = null;
  let blockWindow: readonly bigint[] | null = null;
  let liveWindow: CliOptions["liveWindow"] = null;
  let latestFinalized = false;
  let writeDevelopmentEvidence = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--account") {
      const value = args[index + 1];
      if (value === undefined || !isAddress(value, { strict: false })) {
        throw new Error("COLLECTOR_ACCOUNT_INVALID");
      }
      account = getAddress(value.toLowerCase());
      index += 1;
    } else if (argument === "--block") {
      const value = args[index + 1];
      if (value === undefined || !/^[1-9][0-9]*$/.test(value)) {
        throw new Error("COLLECTOR_BLOCK_INVALID");
      }
      blockNumber = BigInt(value);
      index += 1;
    } else if (argument === "--latest-finalized") {
      latestFinalized = true;
    } else if (argument === "--blocks") {
      const value = args[index + 1];
      if (value === undefined || !/^[1-9][0-9]*(?:,[1-9][0-9]*){2,15}$/.test(value)) {
        throw new Error("COLLECTOR_BLOCK_WINDOW_INVALID");
      }
      const parsed = value.split(",").map(BigInt);
      if (parsed.some((block, position) => position > 0 && block <= (parsed[position - 1] ?? 0n))) {
        throw new Error("COLLECTOR_BLOCK_WINDOW_INVALID");
      }
      blockWindow = parsed;
      index += 1;
    } else if (argument === "--live-window") {
      const value = args[index + 1];
      if (value === undefined || !/^[0-9]+,[0-9]+$/.test(value)) {
        throw new Error("COLLECTOR_LIVE_WINDOW_INVALID");
      }
      const [observationsText, spacingText] = value.split(",");
      const observations = Number(observationsText);
      const spacingSeconds = Number(spacingText);
      if (
        !Number.isSafeInteger(observations) ||
        observations < 3 ||
        observations > 16 ||
        !Number.isSafeInteger(spacingSeconds) ||
        spacingSeconds < 60 ||
        spacingSeconds > 600
      ) {
        throw new Error("COLLECTOR_LIVE_WINDOW_INVALID");
      }
      liveWindow = { observations, spacingSeconds };
      index += 1;
    } else if (argument === "--write-development-evidence") {
      writeDevelopmentEvidence = true;
    } else {
      throw new Error("COLLECTOR_ARGUMENT_INVALID");
    }
  }
  if (account === null) throw new Error("COLLECTOR_ACCOUNT_REQUIRED");
  if (
    [blockNumber !== null, latestFinalized, blockWindow !== null, liveWindow !== null].filter(
      Boolean
    ).length !== 1
  ) {
    throw new Error("COLLECTOR_EXACTLY_ONE_BLOCK_MODE_REQUIRED");
  }
  return {
    account,
    blockNumber,
    blockWindow,
    liveWindow,
    latestFinalized,
    writeDevelopmentEvidence
  };
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function createRecordingFetch(transcript: RpcTranscriptEntry[]) {
  let transcriptBytes = 0;
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const requestText = await request.clone().text();
    const response = await fetch(request);
    const responseText = await response.clone().text();
    transcriptBytes += Buffer.byteLength(requestText) + Buffer.byteLength(responseText);
    if (transcriptBytes > MAX_TRANSCRIPT_BYTES) throw new Error("COLLECTOR_TRANSCRIPT_TOO_LARGE");
    transcript.push({ request: parseJson(requestText), response: parseJson(responseText) });
    return response;
  };
}

function required<T>(items: readonly T[], index: number, label: string): T {
  const value = items.at(index);
  if (value === undefined) throw new Error(`COLLECTOR_MISSING_${label}`);
  return value;
}

function requireCode(code: Hex | undefined, label: string): Hex {
  if (code === undefined || code === "0x") throw new Error(`COLLECTOR_EMPTY_CODE_${label}`);
  return code;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function collectProvider(
  provider: (typeof PROVIDERS)[number],
  account: Address,
  blockNumber: bigint
) {
  const transcript: RpcTranscriptEntry[] = [];
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(provider.url, {
      batch: { batchSize: 64, wait: 10 },
      fetchFn: createRecordingFetch(transcript),
      retryCount: 2,
      timeout: 20_000
    })
  });
  const chainId = await client.getChainId();
  if (chainId !== 97) throw new Error("COLLECTOR_CHAIN_MISMATCH");
  const block = await client.getBlock({ blockNumber });
  if (block.hash === null) throw new Error("COLLECTOR_BLOCK_HASH_MISSING");
  const [comptrollerRuntimeCode, oracleAddress, vaiControllerAddress, markets, assetsIn] =
    await Promise.all([
      client.getCode({ address: COMPTROLLER, blockNumber }),
      client.readContract({
        address: COMPTROLLER,
        abi: comptrollerAbi,
        functionName: "oracle",
        blockNumber
      }),
      client.readContract({
        address: COMPTROLLER,
        abi: comptrollerAbi,
        functionName: "vaiController",
        blockNumber
      }),
      client.readContract({
        address: COMPTROLLER,
        abi: comptrollerAbi,
        functionName: "getAllMarkets",
        blockNumber
      }),
      client.readContract({
        address: COMPTROLLER,
        abi: comptrollerAbi,
        functionName: "getAssetsIn",
        args: [account],
        blockNumber
      })
    ]);
  const [oracleRuntimeCode, vaiRepayAmountRaw] = await Promise.all([
    client.getCode({ address: oracleAddress, blockNumber }),
    client.readContract({
      address: vaiControllerAddress,
      abi: vaiControllerAbi,
      functionName: "getVAIRepayAmount",
      args: [account],
      blockNumber
    })
  ]);

  const [snapshots, symbols, vTokenDecimals, underlyingResults, marketConfigs, thresholds, prices] =
    await Promise.all([
      client.multicall({
        contracts: markets.map((address) => ({
          address,
          abi: vTokenSnapshotAbi,
          functionName: "getAccountSnapshot",
          args: [account]
        })),
        allowFailure: false,
        blockNumber
      }),
      client.multicall({
        contracts: markets.map((address) => ({
          address,
          abi: symbolAbi,
          functionName: "symbol"
        })),
        allowFailure: false,
        blockNumber
      }),
      client.multicall({
        contracts: markets.map((address) => ({
          address,
          abi: decimalsAbi,
          functionName: "decimals"
        })),
        allowFailure: false,
        blockNumber
      }),
      client.multicall({
        contracts: markets.map((address) => ({
          address,
          abi: underlyingAbi,
          functionName: "underlying"
        })),
        allowFailure: true,
        blockNumber
      }),
      client.multicall({
        contracts: markets.map((vToken) => ({
          address: COMPTROLLER,
          abi: marketConfigAbi,
          functionName: "markets",
          args: [vToken]
        })),
        allowFailure: false,
        blockNumber
      }),
      client.multicall({
        contracts: markets.map((vToken) => ({
          address: COMPTROLLER,
          abi: effectiveThresholdAbi,
          functionName: "getEffectiveLtvFactor",
          args: [account, vToken, 1]
        })),
        allowFailure: false,
        blockNumber
      }),
      client.multicall({
        contracts: markets.map((vToken) => ({
          address: oracleAddress,
          abi: oracleAbi,
          functionName: "getUnderlyingPrice",
          args: [vToken]
        })),
        allowFailure: true,
        blockNumber
      })
    ]);

  const underlyingMetadata = await Promise.all(
    underlyingResults.map(async (result, index) => {
      if (result.status === "failure") {
        const symbol = required(symbols, index, "VTOKEN_SYMBOL");
        if (symbol !== "vBNB") throw new Error("COLLECTOR_UNDERLYING_READ_FAILED");
        return { address: null, symbol: "BNB", decimals: 18 } as const;
      }
      const address = result.result;
      const [symbol, decimals] = await Promise.all([
        client.readContract({ address, abi: symbolAbi, functionName: "symbol", blockNumber }),
        client.readContract({ address, abi: decimalsAbi, functionName: "decimals", blockNumber })
      ]);
      return { address, symbol, decimals } as const;
    })
  );

  const normalizedMarkets = markets.map((vTokenAddress, index) => {
    const snapshot = required(snapshots, index, "SNAPSHOT");
    const config = required(marketConfigs, index, "MARKET_CONFIG");
    const underlying = required(underlyingMetadata, index, "UNDERLYING");
    const price = required(prices, index, "PRICE");
    return {
      vTokenAddress,
      vTokenSymbol: required(symbols, index, "VTOKEN_SYMBOL"),
      vTokenDecimals: required(vTokenDecimals, index, "VTOKEN_DECIMALS"),
      underlyingAddress: underlying.address,
      underlyingSymbol: underlying.symbol,
      underlyingDecimals: underlying.decimals,
      isListed: required(config, 0, "LISTED"),
      collateralFactorMantissaRaw: required(config, 1, "COLLATERAL_FACTOR").toString(),
      liquidationThresholdMantissaRaw: required(config, 3, "LIQUIDATION_THRESHOLD").toString(),
      effectiveLiquidationThresholdMantissaRaw: required(thresholds, index, "THRESHOLD").toString(),
      isBorrowAllowed: required(config, 6, "BORROW_ALLOWED"),
      accountSnapshotErrorCode: snapshot[0].toString(),
      vTokenBalanceRaw: snapshot[1].toString(),
      borrowBalanceRaw: snapshot[2].toString(),
      exchangeRateMantissaRaw: snapshot[3].toString(),
      oraclePriceStatus: price.status === "success" ? "available" : "unavailable",
      oraclePriceMantissaRaw: price.status === "success" ? price.result.toString() : "0"
    };
  });
  const observedAtUtc = new Date().toISOString();
  const observation = venusCoreExactBlockProviderObservationSchema.parse({
    schemaVersion: "proofera-venus-core-exact-block-provider-v1.0.0",
    providerId: provider.id,
    publicSourceUrl: provider.url,
    observedAtUtc,
    chainId: 97,
    account,
    comptrollerAddress: COMPTROLLER,
    blockNumber: blockNumber.toString(),
    blockHash: block.hash,
    blockTimestampUtc: new Date(Number(block.timestamp) * 1_000).toISOString(),
    comptrollerRuntimeCode: requireCode(comptrollerRuntimeCode, "COMPTROLLER"),
    oracleAddress,
    oracleRuntimeCode: requireCode(oracleRuntimeCode, "ORACLE"),
    vaiControllerAddress,
    vaiRepayAmountRaw: vaiRepayAmountRaw.toString(),
    assetsIn,
    markets: normalizedMarkets
  });
  const transcriptJson = JSON.stringify(transcript);
  return {
    observation,
    transcript,
    transcriptSha256: sha256(transcriptJson),
    transcriptBytes: Buffer.byteLength(transcriptJson)
  };
}

async function gitState(): Promise<{ commit: string; clean: boolean }> {
  const execFileAsync = promisify(execFile);
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }),
    execFileAsync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" })
  ]);
  return { commit: commit.trim(), clean: status.trim().length === 0 };
}

async function minimumProviderHead(): Promise<bigint> {
  const heads = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const client = createPublicClient({
        chain: bscTestnet,
        transport: http(provider.url, { retryCount: 2, timeout: 20_000 })
      });
      return client.getBlockNumber();
    })
  );
  return heads.reduce((minimum, head) => (head < minimum ? head : minimum));
}

function waitMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const blockNumbers: bigint[] = [];
  const windowResults = [];
  if (options.liveWindow !== null) {
    for (let index = 0; index < options.liveWindow.observations; index += 1) {
      const block = (await minimumProviderHead()) - FINALITY_BLOCKS;
      const previous = blockNumbers.at(-1);
      if (block <= 0n || (previous !== undefined && block <= previous)) {
        throw new Error("COLLECTOR_LIVE_WINDOW_BLOCK_ORDER_INVALID");
      }
      blockNumbers.push(block);
      windowResults.push(
        await Promise.all(
          PROVIDERS.map((provider) => collectProvider(provider, options.account, block))
        )
      );
      if (index + 1 < options.liveWindow.observations) {
        await waitMilliseconds(options.liveWindow.spacingSeconds * 1_000);
      }
    }
  } else {
    const minimumHead = await minimumProviderHead();
    const fixedBlocks = options.latestFinalized
      ? [minimumHead - FINALITY_BLOCKS]
      : (options.blockWindow ?? (options.blockNumber === null ? [] : [options.blockNumber]));
    if (
      fixedBlocks.length === 0 ||
      fixedBlocks.some((block) => block <= 0n || block > minimumHead - FINALITY_BLOCKS)
    ) {
      throw new Error("COLLECTOR_BLOCK_NOT_FINALIZED");
    }
    for (const block of fixedBlocks) {
      blockNumbers.push(block);
      windowResults.push(
        await Promise.all(
          PROVIDERS.map((provider) => collectProvider(provider, options.account, block))
        )
      );
    }
  }
  const evidenceWindow = windowResults.map((results) =>
    buildVenusCoreExactBlockEvidence(results.map(({ observation }) => observation))
  );
  const evidence = evidenceWindow.at(-1);
  if (evidence === undefined) throw new Error("COLLECTOR_BLOCK_WINDOW_EMPTY");
  const repository = await gitState();
  const windowMode = blockNumbers.length > 1;
  const artifact = {
    schemaVersion: windowMode
      ? "proofera-termix-venus-development-window-v1.0.0"
      : "proofera-termix-venus-development-capture-v1.0.0",
    status: "DEVELOPMENT_READ_ONLY",
    publishable: false,
    termixRunStatus: "NOT_RUN",
    sourceCommit: repository.commit,
    sourceCommitClean: repository.clean,
    capturedAtUtc: new Date().toISOString(),
    ...(windowMode ? { evidenceWindow } : { evidence }),
    providerCaptures: windowMode ? windowResults : windowResults[0]
  };
  if (options.writeDevelopmentEvidence) {
    if (!repository.clean) throw new Error("COLLECTOR_DIRTY_WORKTREE");
    const accountSuffix = options.account.slice(-8).toLowerCase();
    const firstBlock = blockNumbers[0];
    const lastBlock = blockNumbers.at(-1);
    if (firstBlock === undefined || lastBlock === undefined) {
      throw new Error("COLLECTOR_BLOCK_WINDOW_EMPTY");
    }
    const fileName = windowMode
      ? `venus-core-exact-window-${firstBlock.toString()}-${lastBlock.toString()}-${accountSuffix}.json`
      : `venus-core-exact-block-${lastBlock.toString()}-${accountSuffix}.json`;
    const path = resolve(ROOT, "evidence", "development", fileName);
    await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    process.stdout.write(`${path}\n`);
    return;
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        status: artifact.status,
        publishable: false,
        termixRunStatus: artifact.termixRunStatus,
        sourceCommit: repository.commit,
        sourceCommitClean: repository.clean,
        account: evidence.account,
        firstBlockNumber: evidenceWindow[0]?.blockNumber,
        lastBlockNumber: evidence.blockNumber,
        lastBlockHash: evidence.blockHash,
        observationCount: evidenceWindow.length,
        marketsEnumerated: evidence.marketsEnumerated,
        positions: evidence.positions.length,
        healthFactorE18Raw: evidence.healthFactorE18Raw,
        providerTranscriptSha256: windowResults.flatMap((results) =>
          results.map(({ transcriptSha256 }) => transcriptSha256)
        )
      },
      null,
      2
    )}\n`
  );
}

await main();
