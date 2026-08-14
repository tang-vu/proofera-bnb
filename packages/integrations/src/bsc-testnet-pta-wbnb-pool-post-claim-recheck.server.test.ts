import { readFile } from "node:fs/promises";

import { type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BSC_TESTNET_PANCAKE_V3_FACTORY,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction,
  validateBscTestnetPtaWbnbPoolFreshRecheckCapability,
  type BscTestnetPtaWbnbPoolAuthorizedSigningIntent
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  createBscTestnetPtaWbnbPoolPostClaimRecheckerForTests,
  createBscTestnetPtaWbnbPoolProductionPostClaimRechecker,
  type BscTestnetPtaWbnbPoolPostClaimRpcRequest
} from "./bsc-testnet-pta-wbnb-pool-post-claim-recheck.server";

const ENVELOPE_HASH = `0x${"11".repeat(32)}` as Hex;
const REVIEWER_DIGEST = `0x${"22".repeat(32)}` as Hex;
const OWNER_DIGEST = `0x${"33".repeat(32)}` as Hex;
const CLAIM_TOKEN = `0x${"44".repeat(32)}` as Hex;
const MANIFEST = `0x${"55".repeat(32)}` as Hex;
const BLOCK_HASH = `0x${"66".repeat(32)}` as Hex;
const RELEASE = "a".repeat(40);
const START = "2026-08-13T04:30:00.000Z";
const COMPLETE = "2026-08-13T04:30:01.000Z";
const BLOCK_TIMESTAMP = BigInt(Math.floor(Date.parse("2026-08-13T04:29:30.000Z") / 1_000));
const COMMON_HEIGHT = 124_775_556n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function addressResult(address: string): Hex {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}` as Hex;
}

function quantity(value: bigint): Hex {
  return `0x${value.toString(16)}` as Hex;
}

function transaction() {
  const value = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: "5983857",
    gasPriceWei: "100000000",
    sourceEnvelopeHash: ENVELOPE_HASH
  });
  if (value === null) throw new Error("Exact transaction fixture failed.");
  return value;
}

function authorizedIntent(): BscTestnetPtaWbnbPoolAuthorizedSigningIntent {
  return Object.freeze({
    schemaVersion: 1,
    scope: "owner_designated_internal_release_policy_and_exact_owner_pool_initialization",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    reviewerApprovalDigest: REVIEWER_DIGEST,
    ownerAuthorizationDigest: OWNER_DIGEST,
    releaseCommit: RELEASE,
    runtimeManifestSha256: MANIFEST,
    authenticatedAt: "2026-08-13T04:29:45.000Z",
    expiresAt: "2026-08-13T04:30:30.000Z",
    transaction: transaction()
  });
}

function input() {
  return Object.freeze({ authorizedIntent: authorizedIntent(), claimId: "claim-pool-001" });
}

interface RpcOverrides {
  readonly chainId?: unknown;
  readonly finalizedHeight?: bigint;
  readonly finalizedHash?: Hex;
  readonly exactHash?: Hex;
  readonly blockTimestamp?: bigint;
  readonly blockGasLimit?: bigint;
  readonly exactBlockResponse?: unknown;
  readonly canonicalPool?: string;
  readonly canonicalCandidateCode?: Hex;
  readonly canonicalSenderCode?: Hex;
  readonly balance?: unknown;
  readonly latestNonce?: unknown;
  readonly pendingNonce?: unknown;
  readonly latestPool?: string;
  readonly pendingPool?: string;
  readonly latestCandidateCode?: Hex;
  readonly pendingCandidateCode?: Hex;
  readonly latestSenderCode?: Hex;
  readonly pendingSenderCode?: Hex;
  readonly gasPrice?: unknown;
  readonly simulation?: string;
  readonly gasEstimate?: unknown;
  readonly throwMethod?: string;
}

function block(number = COMMON_HEIGHT, hash = BLOCK_HASH, overrides: RpcOverrides = {}) {
  return {
    number: quantity(number),
    hash,
    timestamp: quantity(overrides.blockTimestamp ?? BLOCK_TIMESTAMP),
    gasLimit: quantity(overrides.blockGasLimit ?? 140_000_000n),
    transactions: []
  };
}

function stateSelector(request: BscTestnetPtaWbnbPoolPostClaimRpcRequest): unknown {
  return request.params.at(-1);
}

function makeClient(
  origin:
    | typeof BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN
    | typeof BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  overrides: RpcOverrides = {}
) {
  const calls: BscTestnetPtaWbnbPoolPostClaimRpcRequest[] = [];
  const request = async (
    rpcRequest: BscTestnetPtaWbnbPoolPostClaimRpcRequest
  ): Promise<unknown> => {
    calls.push(rpcRequest);
    if (overrides.throwMethod === rpcRequest.method) throw new Error("sensitive transport detail");
    if (rpcRequest.method === "eth_chainId") return overrides.chainId ?? "0x61";
    if (rpcRequest.method === "eth_getBlockByNumber") {
      const tag = rpcRequest.params[0];
      if (tag === "finalized") {
        const height = overrides.finalizedHeight ?? COMMON_HEIGHT;
        return block(height, overrides.finalizedHash ?? BLOCK_HASH, overrides);
      }
      if (overrides.exactBlockResponse !== undefined) return overrides.exactBlockResponse;
      return block(BigInt(tag), overrides.exactHash ?? BLOCK_HASH, overrides);
    }
    if (rpcRequest.method === "eth_getBalance") {
      return overrides.balance ?? quantity(100_000_000_000_000_000n);
    }
    if (rpcRequest.method === "eth_getTransactionCount") {
      return rpcRequest.params[1] === "latest"
        ? (overrides.latestNonce ?? "0x1")
        : (overrides.pendingNonce ?? "0x1");
    }
    if (rpcRequest.method === "eth_getCode") {
      const [address, selector] = rpcRequest.params;
      const isCandidate = address === BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE;
      if (typeof selector === "object") {
        return isCandidate
          ? (overrides.canonicalCandidateCode ?? "0x")
          : (overrides.canonicalSenderCode ?? "0x");
      }
      if (isCandidate) {
        return selector === "latest"
          ? (overrides.latestCandidateCode ?? "0x")
          : (overrides.pendingCandidateCode ?? "0x");
      }
      return selector === "latest"
        ? (overrides.latestSenderCode ?? "0x")
        : (overrides.pendingSenderCode ?? "0x");
    }
    if (rpcRequest.method === "eth_gasPrice") return overrides.gasPrice ?? quantity(100_000_000n);
    if (rpcRequest.method === "eth_estimateGas") {
      return overrides.gasEstimate ?? quantity(4_986_547n);
    }
    if (rpcRequest.method === "eth_call") {
      const [call, selector] = rpcRequest.params;
      if (call.to === BSC_TESTNET_PANCAKE_V3_FACTORY) {
        const pool =
          typeof selector === "object"
            ? (overrides.canonicalPool ?? ZERO_ADDRESS)
            : selector === "latest"
              ? (overrides.latestPool ?? ZERO_ADDRESS)
              : (overrides.pendingPool ?? ZERO_ADDRESS);
        return addressResult(pool);
      }
      if (call.to === BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER) {
        return addressResult(overrides.simulation ?? BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE);
      }
    }
    throw new Error(`Unexpected RPC method: ${rpcRequest.method}`);
  };
  return { client: { origin, request }, calls };
}

function clocks(values: readonly string[]) {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)] ?? "invalid");
}

function setup(
  primaryOverrides: RpcOverrides = {},
  corroboratorOverrides: RpcOverrides = primaryOverrides,
  options: Readonly<{
    clock?: () => Date;
    authenticateAuthorizedIntent?: (intent: unknown) => boolean;
    token?: Hex;
    countToken?: (count: number) => void;
  }> = {}
) {
  const primary = makeClient(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN, primaryOverrides);
  const corroborator = makeClient(
    BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
    corroboratorOverrides
  );
  let tokenCalls = 0;
  const rechecker = createBscTestnetPtaWbnbPoolPostClaimRecheckerForTests({
    primaryClient: primary.client,
    corroboratorClient: corroborator.client,
    now: options.clock ?? clocks([START, COMPLETE]),
    authenticateAuthorizedIntent: options.authenticateAuthorizedIntent ?? (() => true),
    issueJournalClaimToken: () => {
      tokenCalls += 1;
      options.countToken?.(tokenCalls);
      return options.token ?? CLAIM_TOKEN;
    }
  });
  return { rechecker, primary, corroborator, tokenCalls: () => tokenCalls };
}

describe("PTA/WBNB post-claim dual-RPC recheck", () => {
  it("issues one branded capability only after exact common-finalized and current-state agreement", async () => {
    const request = input();
    const execution = setup(
      {},
      {},
      {
        authenticateAuthorizedIntent: (candidate) => candidate === request.authorizedIntent
      }
    );
    const result = await execution.rechecker.recheck(request);
    expect(result).toMatchObject({
      status: "verified",
      issue: null,
      boundary: {
        chainId: "97",
        fixedOfficialRpcOriginsOnly: true,
        eip1898RequireCanonical: true,
        custodyRead: false,
        journalWritePerformed: false,
        signatureCreated: false,
        transactionSubmitted: false,
        blockchainWritePerformed: false,
        rpcReadPerformed: true
      }
    });
    if (result.status !== "verified") throw new Error(result.issue.message);
    expect(result.capability).toMatchObject({
      claimId: "claim-pool-001",
      journalClaimToken: CLAIM_TOKEN,
      authenticatedAt: COMPLETE,
      expiresAt: "2026-08-13T04:30:30.000Z",
      rpc: {
        finalizedBlockNumber: COMMON_HEIGHT.toString(),
        finalizedBlockHash: BLOCK_HASH,
        finalizedBlockGasLimit: "140000000",
        latestNonce: "1",
        pendingNonce: "1",
        factoryPool: ZERO_ADDRESS,
        candidateCode: "0x",
        senderCode: "0x",
        senderBalanceWei: "100000000000000000",
        gasEstimate: "4986547",
        gasPriceWei: "100000000",
        simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
      }
    });
    expect(
      validateBscTestnetPtaWbnbPoolFreshRecheckCapability(
        result.capability,
        { authorizedIntent: request.authorizedIntent, claimId: request.claimId },
        new Date("2026-08-13T04:30:02.000Z")
      )
    ).toMatchObject({ status: "valid" });
    expect(execution.rechecker.authenticateFreshPostClaimRecheck(result.capability)).toBe(true);
    expect(
      execution.rechecker.authenticateFreshPostClaimRecheck(structuredClone(result.capability))
    ).toBe(false);
    expect(
      execution.rechecker.authenticateFreshPostClaimRecheck(new Proxy(result.capability, {}))
    ).toBe(false);
    expect(execution.tokenCalls()).toBe(1);

    for (const calls of [execution.primary.calls, execution.corroborator.calls]) {
      expect(calls.every(Object.isFrozen)).toBe(true);
      expect(calls.slice(0, 3)).toEqual([
        { method: "eth_chainId", params: [] },
        { method: "eth_getBlockByNumber", params: ["finalized", false] },
        {
          method: "eth_getBlockByNumber",
          params: [quantity(COMMON_HEIGHT), false]
        }
      ]);
      const canonicalSelectors = calls
        .filter(
          (call) =>
            (call.method === "eth_call" || call.method === "eth_getCode") &&
            typeof stateSelector(call) === "object"
        )
        .map(stateSelector);
      expect(canonicalSelectors).toHaveLength(3);
      expect(canonicalSelectors).toEqual(
        Array.from({ length: 3 }, () => ({ blockHash: BLOCK_HASH, requireCanonical: true }))
      );
      expect(calls.find((call) => call.method === "eth_estimateGas")).toMatchObject({
        params: [
          {
            from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
            to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
            data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
            value: "0x0",
            gas: quantity(5_983_857n),
            gasPrice: quantity(100_000_000n)
          }
        ]
      });
    }
  });

  it("requires the authorization gate's private intent brand before clock, RPC, or token issuance", async () => {
    let authenticationCalls = 0;
    const execution = setup(
      {},
      {},
      {
        authenticateAuthorizedIntent: () => {
          authenticationCalls += 1;
          return false;
        }
      }
    );
    await expect(execution.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      capability: null,
      issue: { code: "AUTHORIZATION_AUTHENTICATION_FAILED", stage: "input" },
      boundary: {
        authenticatedAuthorizedIntentRequiredBeforeRpc: true,
        rpcReadPerformed: false
      }
    });
    expect(authenticationCalls).toBe(1);
    expect(execution.primary.calls).toHaveLength(0);
    expect(execution.corroborator.calls).toHaveLength(0);
    expect(execution.tokenCalls()).toBe(0);
  });

  it.each([
    [{ pendingNonce: "0x2" }, "NONCE_MISMATCH"],
    [{ pendingPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE }, "POOL_ALREADY_EXISTS_OR_RACED"],
    [{ pendingCandidateCode: "0x00" }, "POOL_ALREADY_EXISTS_OR_RACED"],
    [{ pendingSenderCode: "0x00" }, "SENDER_NOT_EOA"],
    [{ simulation: ZERO_ADDRESS }, "SIMULATION_MISMATCH"],
    [{ gasPrice: quantity(100_000_001n) }, "GAS_POLICY_VIOLATION"],
    [{ gasEstimate: quantity(5_000_001n) }, "GAS_POLICY_VIOLATION"],
    [{ balance: "0x1" }, "INSUFFICIENT_BALANCE"],
    [{ blockGasLimit: 5_000_000n }, "GAS_POLICY_VIOLATION"]
  ] as const)("fails closed for a material exact-state change", async (overrides, code) => {
    const execution = setup(overrides);
    await expect(execution.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      capability: null,
      issue: { code }
    });
    expect(execution.tokenCalls()).toBe(0);
  });

  it("requires exact agreement for balance, fee, estimate, and simulation across providers", async () => {
    for (const primaryOverrides of [
      { balance: quantity(100_000_000_000_000_001n) },
      { gasPrice: quantity(99_999_999n) },
      { gasEstimate: quantity(4_986_546n) },
      { simulation: ZERO_ADDRESS }
    ]) {
      const execution = setup(primaryOverrides, {});
      const result = await execution.rechecker.recheck(input());
      expect(result).toMatchObject({
        status: "blocked",
        issue: { code: "PROVIDER_DISAGREEMENT" }
      });
      expect(execution.tokenCalls()).toBe(0);
    }
  });

  it("binds the lower common finalized checkpoint and enforces canonical block freshness", async () => {
    const higherCorroborator = setup({}, { finalizedHeight: COMMON_HEIGHT + 2n });
    await expect(higherCorroborator.rechecker.recheck(input())).resolves.toMatchObject({
      status: "verified"
    });

    const mismatchedCheckpoint = setup(
      {},
      { finalizedHeight: COMMON_HEIGHT + 2n, exactHash: `0x${"77".repeat(32)}` }
    );
    await expect(mismatchedCheckpoint.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "PROVIDER_DISAGREEMENT", stage: "block" }
    });

    const stale = setup({ blockTimestamp: BLOCK_TIMESTAMP - 100n });
    await expect(stale.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "FINALIZED_BLOCK_STALE" }
    });
    const future = setup({ blockTimestamp: BigInt(Math.floor(Date.parse(COMPLETE) / 1_000)) + 1n });
    await expect(future.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "FINALIZED_BLOCK_IN_FUTURE" }
    });
  });

  it("rejects expired or overlong observations before issuing a journal token", async () => {
    const expired = setup({}, {}, { clock: clocks(["2026-08-13T04:30:30.000Z"]) });
    await expect(expired.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "AUTHORIZATION_EXPIRED" },
      boundary: { rpcReadPerformed: false }
    });
    expect(expired.tokenCalls()).toBe(0);

    const overlong = setup(
      {},
      {},
      {
        clock: clocks(["2026-08-13T04:29:55.000Z", "2026-08-13T04:30:26.000Z"])
      }
    );
    await expect(overlong.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "RECHECK_WINDOW_EXCEEDED" }
    });
    expect(overlong.tokenCalls()).toBe(0);

    const zeroToken = setup({}, {}, { token: `0x${"00".repeat(32)}` as Hex });
    await expect(zeroToken.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "CAPABILITY_ISSUANCE_FAILED" }
    });
  });

  it("rejects proxies, accessors, symbols, malformed quantities, and transport ambiguity", async () => {
    const validDependencies = {
      primaryClient: makeClient(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN).client,
      corroboratorClient: makeClient(BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN).client,
      now: clocks([START, COMPLETE]),
      authenticateAuthorizedIntent: () => true,
      issueJournalClaimToken: () => CLAIM_TOKEN
    };
    const invalidConfiguration = createBscTestnetPtaWbnbPoolPostClaimRecheckerForTests(
      new Proxy(validDependencies, {})
    );
    await expect(invalidConfiguration.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "CONFIGURATION_INVALID" }
    });
    const swappedOrigins = createBscTestnetPtaWbnbPoolPostClaimRecheckerForTests({
      ...validDependencies,
      primaryClient: makeClient(BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN).client
    });
    await expect(swappedOrigins.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "CONFIGURATION_INVALID" },
      boundary: { rpcReadPerformed: false }
    });

    let inputGetterCalls = 0;
    const accessorInput = Object.freeze(
      Object.defineProperty({ claimId: "claim-pool-001" }, "authorizedIntent", {
        enumerable: true,
        get: () => {
          inputGetterCalls += 1;
          return authorizedIntent();
        }
      })
    );
    const normal = setup();
    await expect(normal.rechecker.recheck(accessorInput)).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "INPUT_INVALID" }
    });
    expect(inputGetterCalls).toBe(0);
    await expect(normal.rechecker.recheck(new Proxy(input(), {}))).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "INPUT_INVALID" }
    });

    let blockGetterCalls = 0;
    const accessorBlock = block();
    Object.defineProperty(accessorBlock, "irrelevant", {
      enumerable: true,
      get: () => {
        blockGetterCalls += 1;
        return "trap";
      }
    });
    const accessorExecution = setup({ exactBlockResponse: accessorBlock });
    await expect(accessorExecution.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "MALFORMED_RPC_RESPONSE" }
    });
    expect(blockGetterCalls).toBe(0);

    const malformed = setup({ chainId: "0x061" });
    await expect(malformed.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "MALFORMED_RPC_RESPONSE" }
    });
    const transport = setup({ throwMethod: "eth_getCode" });
    await expect(transport.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "RPC_REQUEST_FAILED" },
      boundary: { rpcReadPerformed: true }
    });

    const throwingClock = setup(
      {},
      {},
      {
        clock: () => {
          throw new Error("sensitive clock detail");
        }
      }
    );
    await expect(throwingClock.rechecker.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "CLOCK_INVALID" },
      boundary: { rpcReadPerformed: false }
    });
    expect(throwingClock.primary.calls).toHaveLength(0);
    expect(throwingClock.corroborator.calls).toHaveLength(0);
  });

  it("keeps production no-argument, non-injectable, and deliberately non-authorizing", async () => {
    let calls = 0;
    const hostileDependencies = {
      primaryClient: {
        origin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
        request: async () => (calls += 1)
      },
      corroboratorClient: {
        origin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
        request: async () => (calls += 1)
      },
      now: () => new Date(START),
      authenticateAuthorizedIntent: () => true,
      issueJournalClaimToken: () => CLAIM_TOKEN
    };
    expect(createBscTestnetPtaWbnbPoolProductionPostClaimRechecker.length).toBe(0);
    const production = Reflect.apply(
      createBscTestnetPtaWbnbPoolProductionPostClaimRechecker,
      undefined,
      [hostileDependencies]
    );
    await expect(production.recheck(input())).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "PRODUCTION_AUTHORIZATION_UNAVAILABLE" },
      boundary: {
        genericRpcClientAcceptedByProduction: false,
        rpcReadPerformed: false,
        custodyRead: false,
        transactionSubmitted: false
      }
    });
    expect(production.authenticateFreshPostClaimRecheck({})).toBe(false);
    expect(calls).toBe(0);
  });

  it("contains no environment, custody, signing, write, or broadcast path", async () => {
    const source = await readFile(
      new URL("./bsc-testnet-pta-wbnb-pool-post-claim-recheck.server.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(/process\.env|node:fs|child_process|privateKey|signTransaction/u);
    expect(source).not.toMatch(/eth_sendRawTransaction|eth_sendTransaction|personal_sign/u);
    expect(source).not.toMatch(/writeFile|appendFile|createWriteStream|deployer-custody/u);
    const productionStart = source.indexOf(
      "export function createBscTestnetPtaWbnbPoolProductionPostClaimRechecker"
    );
    const harnessStart = source.indexOf("function createBscTestnetPtaWbnbPoolPostClaimRechecker(");
    expect(productionStart).toBeGreaterThanOrEqual(0);
    expect(harnessStart).toBeGreaterThan(productionStart);
    const productionBody = source.slice(productionStart, harnessStart);
    expect(productionBody).toContain('"PRODUCTION_AUTHORIZATION_UNAVAILABLE"');
    expect(productionBody).not.toMatch(/primaryClient|corroboratorClient|untrustedDependencies/u);
  });
});
