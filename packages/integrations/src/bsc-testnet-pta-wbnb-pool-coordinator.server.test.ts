import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EIP1967_ADMIN_SLOT,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT
} from "@proofera/domain";

import {
  coordinateBscTestnetPtaWbnbPoolInitializationForTests,
  inspectBscTestnetPtaWbnbPoolRpcResponseForTests,
  type BscTestnetPtaWbnbPoolCoordinatorTestOptions,
  type BscTestnetPtaWbnbPoolRpcClient,
  type BscTestnetPtaWbnbPoolRpcRequest
} from "./bsc-testnet-pta-wbnb-pool-coordinator.server";
import {
  BSC_TESTNET_PANCAKE_V3_FACTORY,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256
} from "./bsc-testnet-pta-wbnb-pool-initialization";

const COORDINATOR_SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-coordinator.server.ts", import.meta.url),
  "utf8"
);

const TRANSCRIPT = JSON.parse(
  readFileSync(
    new URL(
      "../../../evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json",
      import.meta.url
    ),
    "utf8"
  )
) as unknown;

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function retainedCode(label: string): string {
  const transcript = record(TRANSCRIPT);
  const reads = transcript?.reads;
  if (!Array.isArray(reads)) throw new TypeError("Missing retained RPC reads.");
  const read = reads.find((candidate) => record(candidate)?.label === label);
  const result = record(record(read)?.result);
  const code = result?.normalizedResult;
  if (typeof code !== "string" || !/^0x[0-9a-f]+$/u.test(code)) {
    throw new TypeError(`Missing retained code for ${label}.`);
  }
  return code;
}

const ADDRESSES = Object.freeze({
  pta: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
  wbnb: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
  factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  poolDeployer: "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
  manager: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
  owner: "0x261AF0030618a52FA767997ed310174b3Bc3B77F",
  lmPoolDeployer: "0x7F1745eb74D26877EC54dd9A317CC930Ad01350c",
  sender: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
  candidate: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  zero: "0x0000000000000000000000000000000000000000"
});

const CODES = new Map<string, string>([
  [ADDRESSES.pta.toLowerCase(), retainedCode("code.pta")],
  [ADDRESSES.wbnb.toLowerCase(), retainedCode("code.wbnb")],
  [ADDRESSES.factory.toLowerCase(), retainedCode("code.factory")],
  [ADDRESSES.poolDeployer.toLowerCase(), retainedCode("code.pool_deployer")],
  [ADDRESSES.manager.toLowerCase(), retainedCode("code.position_manager")]
]);

const NOW = "2026-08-13T10:00:30.000Z";
const BLOCK_TIMESTAMP = Math.floor(Date.parse(NOW) / 1_000) - 30;
const COMMON_BLOCK_NUMBER = 124_800_000n;
const COMMON_BLOCK_HASH = `0x${"42".repeat(32)}`;
const ZERO_WORD = `0x${"00".repeat(32)}`;

function block(number = COMMON_BLOCK_NUMBER, hash = COMMON_BLOCK_HASH) {
  return {
    number: `0x${number.toString(16)}`,
    hash,
    timestamp: `0x${BLOCK_TIMESTAMP.toString(16)}`,
    gasLimit: "0x8583b00"
  };
}

function addressResult(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function uintResult(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function parametersResult(): string {
  return `0x${"0".repeat(64 * 5)}`;
}

interface FakeChanges {
  readonly finalizedHeight?: bigint;
  readonly finalizedBlock?: unknown;
  readonly exactBlock?: unknown;
  readonly chainId?: unknown;
  readonly codeAddress?: string;
  readonly codeValue?: unknown;
  readonly storageValue?: unknown;
  readonly callSelector?: string;
  readonly callValue?: unknown;
  readonly latestNonce?: unknown;
  readonly pendingNonce?: unknown;
  readonly latestPool?: string;
  readonly pendingPool?: string;
  readonly pendingCandidateCode?: unknown;
  readonly pendingCandidateNonce?: unknown;
  readonly balance?: unknown;
  readonly gasPrice?: unknown;
  readonly gasEstimate?: unknown;
  readonly simulation?: unknown;
  readonly throwMethod?: BscTestnetPtaWbnbPoolRpcRequest["method"];
  readonly throwOnInitializerCall?: boolean;
}

function fakeClient(changes: FakeChanges = {}) {
  const calls: BscTestnetPtaWbnbPoolRpcRequest[] = [];
  const client: BscTestnetPtaWbnbPoolRpcClient = {
    async request(request) {
      calls.push(request);
      if (changes.throwMethod === request.method) throw new Error("private transport detail");
      switch (request.method) {
        case "eth_chainId":
          return "chainId" in changes ? changes.chainId : "0x61";
        case "eth_getBlockByNumber":
          if (request.params[0] === "finalized") {
            return "finalizedBlock" in changes
              ? changes.finalizedBlock
              : block(changes.finalizedHeight ?? COMMON_BLOCK_NUMBER);
          }
          return "exactBlock" in changes ? changes.exactBlock : block();
        case "eth_getCode": {
          const address = request.params[0].toLowerCase();
          if (changes.codeAddress?.toLowerCase() === address) return changes.codeValue;
          if (address === ADDRESSES.sender.toLowerCase()) return "0x";
          if (address === ADDRESSES.candidate.toLowerCase()) {
            return request.params[1] === "pending" && "pendingCandidateCode" in changes
              ? changes.pendingCandidateCode
              : "0x";
          }
          return CODES.get(address) ?? "0x";
        }
        case "eth_getStorageAt":
          return "storageValue" in changes ? changes.storageValue : ZERO_WORD;
        case "eth_getTransactionCount": {
          const address = request.params[0].toLowerCase();
          if (address === ADDRESSES.sender.toLowerCase()) {
            return request.params[1] === "pending"
              ? "pendingNonce" in changes
                ? changes.pendingNonce
                : "0x1"
              : "latestNonce" in changes
                ? changes.latestNonce
                : "0x1";
          }
          return request.params[1] === "pending" && "pendingCandidateNonce" in changes
            ? changes.pendingCandidateNonce
            : "0x0";
        }
        case "eth_getBalance":
          return "balance" in changes ? changes.balance : "0x16312e1b2439d00";
        case "eth_gasPrice":
          return "gasPrice" in changes ? changes.gasPrice : "0x5f5e100";
        case "eth_estimateGas":
          return "gasEstimate" in changes ? changes.gasEstimate : "0x4c16b3";
        case "eth_call": {
          const [call, selector] = request.params;
          const functionSelector = call.data.slice(0, 10);
          if (functionSelector === "0x13ead562") {
            if (changes.throwOnInitializerCall === true) {
              throw new Error("private simulation transport detail");
            }
            return "simulation" in changes
              ? changes.simulation
              : addressResult(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE);
          }
          if (changes.callSelector === functionSelector) return changes.callValue;
          switch (functionSelector) {
            case "0xc45a0155":
              return addressResult(ADDRESSES.factory);
            case "0xd5f39488":
              return addressResult(ADDRESSES.poolDeployer);
            case "0x4aa4a4fc":
              return addressResult(ADDRESSES.wbnb);
            case "0x8da5cb5b":
              return addressResult(ADDRESSES.owner);
            case "0x5e492ac8":
              return addressResult(ADDRESSES.lmPoolDeployer);
            case "0x3119049a":
              return addressResult(ADDRESSES.poolDeployer);
            case "0x966dae0e":
              return addressResult(ADDRESSES.factory);
            case "0x89035730":
              return parametersResult();
            case "0x22afcccb":
              return uintResult(10n);
            case "0x88e8006d":
              return `${uintResult(0n)}${uintResult(1n).slice(2)}`;
            case "0x1698ee82":
              return addressResult(
                selector === "pending"
                  ? (changes.pendingPool ?? ADDRESSES.zero)
                  : selector === "latest"
                    ? (changes.latestPool ?? ADDRESSES.zero)
                    : ADDRESSES.zero
              );
            default:
              throw new TypeError(`Unexpected eth_call selector ${functionSelector}.`);
          }
        }
      }
    }
  };
  return { client, calls };
}

function run(primaryChanges: FakeChanges = {}, corroboratorChanges: FakeChanges = {}) {
  const primary = fakeClient(primaryChanges);
  const corroborator = fakeClient(corroboratorChanges);
  const options: BscTestnetPtaWbnbPoolCoordinatorTestOptions = {
    primaryClient: primary.client,
    corroboratorClient: corroborator.client,
    now: () => new Date(NOW)
  };
  return {
    result: coordinateBscTestnetPtaWbnbPoolInitializationForTests(options),
    primary,
    corroborator
  };
}

describe("BSC testnet PTA/WBNB pool coordinator", () => {
  it("keeps the exact EIP-1967 slots local without evaluating the domain barrel", () => {
    expect(COORDINATOR_SOURCE).not.toMatch(/from\s+["']@proofera\/domain["']/u);
    expect(COORDINATOR_SOURCE).toContain(`"${EIP1967_IMPLEMENTATION_SLOT}" as const`);
    expect(COORDINATOR_SOURCE).toContain(`"${EIP1967_ADMIN_SLOT}" as const`);
    expect(COORDINATOR_SOURCE).toContain(`"${EIP1967_BEACON_SLOT}" as const`);
  });

  it("constructs only the exact zero-value, nonce-one, non-authorizing envelope", async () => {
    const execution = run({}, { finalizedHeight: COMMON_BLOCK_NUMBER + 3n });
    const result = await execution.result;

    expect(result.status, JSON.stringify(result)).toBe("observed");
    if (result.status !== "observed") return;
    expect(result).toMatchObject({
      signingReady: false,
      envelope: {
        operation: "create_and_initialize_exact_pta_wbnb_pancake_v3_pool_once",
        chainId: "97",
        transaction: {
          from: ADDRESSES.sender,
          to: ADDRESSES.manager,
          nonce: "1",
          data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
          dataBytes: 132,
          dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
          selector: "0x13ead562",
          valueWei: "0",
          gasLimit: "5983857",
          gasPriceWei: "100000000"
        },
        initializer: {
          token0: ADDRESSES.pta,
          token1: ADDRESSES.wbnb,
          fee: "500",
          sqrtPriceX96: "79228162514264337593543950",
          expectedPool: ADDRESSES.candidate,
          priceMeaning: "fixed_test_scenario_not_market_price_oracle_peg_or_valuation"
        },
        observation: {
          finalizedBlockNumber: COMMON_BLOCK_NUMBER.toString(),
          finalizedBlockHash: COMMON_BLOCK_HASH,
          latestNonce: "1",
          pendingNonce: "1",
          pendingPool: ADDRESSES.zero,
          candidateCode: "0x",
          candidateNonce: "0",
          providerAgreementVerified: true,
          allRuntimeIdentitiesVerified: true,
          allEip1967SlotsZero: true,
          allProtocolBindingsVerified: true,
          feeTierVerified: true,
          simulationReturnPool: ADDRESSES.candidate,
          gasEstimate: "4986547"
        },
        caps: {
          gasMarginBps: "2000",
          maximumGasEstimate: "5000000",
          maximumGasLimit: "6000000",
          maximumGasPriceWei: "3000000000",
          maximumTotalCostWei: "18000000000000000",
          boundedMaximumCostWei: "598385700000000"
        },
        authorization: {
          signingReady: false,
          signingAuthorized: false,
          executionAuthorized: false,
          secretRead: false,
          signerCreated: false,
          signatureCreated: false,
          transactionSubmitted: false,
          blockchainWritePerformed: false
        },
        envelopeHash: expect.stringMatching(/^0x[0-9a-f]{64}$/u)
      },
      boundary: {
        fixedOfficialRpcOriginsOnly: true,
        custodyRead: false,
        secretRead: false,
        signingReady: false,
        signingAuthorized: false,
        executionAuthorized: false,
        transactionSubmitted: false,
        blockchainWritePerformed: false
      }
    });
    expect(result.envelope.expiresAt).toBe("2026-08-13T10:05:30.000Z");
    expect(execution.primary.calls.slice(1, 3)).toEqual([
      { method: "eth_getBlockByNumber", params: ["finalized", false] },
      {
        method: "eth_getBlockByNumber",
        params: [`0x${COMMON_BLOCK_NUMBER.toString(16)}`, false]
      }
    ]);
    const stateSelectors = execution.primary.calls
      .filter(({ method }) => ["eth_getCode", "eth_getStorageAt"].includes(method))
      .map((request) => request.params.at(-1));
    expect(stateSelectors).toContainEqual({
      blockHash: COMMON_BLOCK_HASH,
      requireCanonical: true
    });
    expect(execution.primary.calls.find(({ method }) => method === "eth_estimateGas")).toEqual({
      method: "eth_estimateGas",
      params: [
        {
          from: ADDRESSES.sender,
          to: ADDRESSES.manager,
          data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
          value: "0x0"
        }
      ]
    });
  });

  it.each([
    [{ chainId: "0x38" }, {}, "chain_mismatch"],
    [
      { exactBlock: block(COMMON_BLOCK_NUMBER, `0x${"43".repeat(32)}`) },
      {},
      "provider_disagreement"
    ],
    [
      { codeAddress: ADDRESSES.pta, codeValue: "0x00" },
      { codeAddress: ADDRESSES.pta, codeValue: "0x00" },
      "runtime_identity_mismatch"
    ],
    [
      { storageValue: `0x${"00".repeat(31)}01` },
      { storageValue: `0x${"00".repeat(31)}01` },
      "proxy_slot_nonzero"
    ],
    [
      { callSelector: "0xc45a0155", callValue: addressResult(ADDRESSES.zero) },
      { callSelector: "0xc45a0155", callValue: addressResult(ADDRESSES.zero) },
      "protocol_binding_mismatch"
    ],
    [
      { callSelector: "0x22afcccb", callValue: uintResult(60n) },
      { callSelector: "0x22afcccb", callValue: uintResult(60n) },
      "fee_tier_mismatch"
    ],
    [{ pendingNonce: "0x2" }, { pendingNonce: "0x2" }, "nonce_mismatch"],
    [
      { pendingPool: ADDRESSES.candidate },
      { pendingPool: ADDRESSES.candidate },
      "pool_already_exists_or_raced"
    ],
    [
      { simulation: addressResult(ADDRESSES.zero) },
      { simulation: addressResult(ADDRESSES.zero) },
      "simulation_mismatch"
    ],
    [{ gasEstimate: "0x4c4b41" }, { gasEstimate: "0x4c4b41" }, "gas_cap_exceeded"],
    [{ gasPrice: "0xb2d05e01" }, { gasPrice: "0xb2d05e01" }, "gas_cap_exceeded"],
    [{ balance: "0x1" }, { balance: "0x1" }, "insufficient_balance"]
  ] as const)("fails closed for a material mismatch", async (primary, corroborator, reason) => {
    const result = await run(primary, corroborator).result;
    expect(result).toMatchObject({
      status: "blocked",
      signingReady: false,
      reason,
      envelope: null,
      boundary: {
        signingAuthorized: false,
        executionAuthorized: false,
        transactionSubmitted: false
      }
    });
  });

  it("binds the minimum finalized tag to the exact checkpoint and enforces block gas limit", async () => {
    const differentFinalizedHash = `0x${"55".repeat(32)}`;
    const tagMismatch = await run(
      { finalizedBlock: block(COMMON_BLOCK_NUMBER, differentFinalizedHash) },
      { finalizedHeight: COMMON_BLOCK_NUMBER + 3n }
    ).result;
    expect(tagMismatch).toMatchObject({
      status: "blocked",
      stage: "block",
      reason: "provider_disagreement"
    });

    const tinyBlockGasLimit = {
      ...block(),
      gasLimit: "0x4c4b40"
    };
    const blockGasLimitExceeded = await run(
      { finalizedBlock: tinyBlockGasLimit, exactBlock: tinyBlockGasLimit },
      { finalizedBlock: tinyBlockGasLimit, exactBlock: tinyBlockGasLimit }
    ).result;
    expect(blockGasLimitExceeded).toMatchObject({
      status: "blocked",
      stage: "simulation",
      reason: "gas_cap_exceeded"
    });
  });

  it("rejects malformed canonical quantities and accessor/proxy block responses without invoking traps", async () => {
    const accessorBlock = block();
    let accessorCalls = 0;
    Object.defineProperty(accessorBlock, "hash", {
      enumerable: true,
      get() {
        accessorCalls += 1;
        return COMMON_BLOCK_HASH;
      }
    });
    const accessorResult = await run({ exactBlock: accessorBlock }).result;
    expect(accessorResult).toMatchObject({ status: "blocked", reason: "malformed_rpc_response" });
    expect(accessorCalls).toBe(0);

    let proxyCalls = 0;
    const proxyBlock = new Proxy(block(), {
      get(target, property, receiver) {
        // Promise resolution performs the language-mandated `then` lookup before our parser sees it.
        if (property === "then") return undefined;
        proxyCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    const proxyResult = await run({ exactBlock: proxyBlock }).result;
    expect(proxyResult).toMatchObject({ status: "blocked", reason: "malformed_rpc_response" });
    expect(proxyCalls).toBe(0);

    const quantityResult = await run({ pendingNonce: "0x01" }, { pendingNonce: "0x01" }).result;
    expect(quantityResult).toMatchObject({ status: "blocked", reason: "malformed_rpc_response" });
  });

  it("snapshots strict options and rejects proxies, accessors, symbols, and custom prototypes trap-zero", async () => {
    const base = run();
    await base.result;
    const validOptions = {
      primaryClient: base.primary.client,
      corroboratorClient: base.corroborator.client,
      now: () => new Date(NOW)
    };

    let proxyCalls = 0;
    const proxied = new Proxy(validOptions, {
      get() {
        proxyCalls += 1;
        throw new Error("must not execute");
      }
    });
    expect(
      await coordinateBscTestnetPtaWbnbPoolInitializationForTests(
        proxied as BscTestnetPtaWbnbPoolCoordinatorTestOptions
      )
    ).toMatchObject({ status: "blocked", reason: "invalid_options" });
    expect(proxyCalls).toBe(0);

    let accessorCalls = 0;
    const accessorOptions = {
      primaryClient: base.primary.client,
      corroboratorClient: base.corroborator.client
    } as Record<string, unknown>;
    Object.defineProperty(accessorOptions, "now", {
      enumerable: true,
      get() {
        accessorCalls += 1;
        return () => new Date(NOW);
      }
    });
    expect(
      await coordinateBscTestnetPtaWbnbPoolInitializationForTests(
        accessorOptions as unknown as BscTestnetPtaWbnbPoolCoordinatorTestOptions
      )
    ).toMatchObject({ status: "blocked", reason: "invalid_options" });
    expect(accessorCalls).toBe(0);

    const symbolOptions = { ...validOptions, [Symbol("hidden")]: true };
    expect(
      await coordinateBscTestnetPtaWbnbPoolInitializationForTests(symbolOptions)
    ).toMatchObject({ status: "blocked", reason: "invalid_options" });

    const customPrototype = Object.assign(Object.create({ hidden: true }) as object, validOptions);
    expect(
      await coordinateBscTestnetPtaWbnbPoolInitializationForTests(
        customPrototype as BscTestnetPtaWbnbPoolCoordinatorTestOptions
      )
    ).toMatchObject({ status: "blocked", reason: "invalid_options" });
  });

  it("strictly inspects JSON-RPC envelopes without invoking proxy or accessor traps", () => {
    expect(
      inspectBscTestnetPtaWbnbPoolRpcResponseForTests({ jsonrpc: "2.0", id: 7, result: "0x61" }, 7)
    ).toBe("0x61");
    expect(() =>
      inspectBscTestnetPtaWbnbPoolRpcResponseForTests({ jsonrpc: "2.0", id: 8, result: "0x61" }, 7)
    ).toThrow();
    expect(() =>
      inspectBscTestnetPtaWbnbPoolRpcResponseForTests(
        { jsonrpc: "2.0", id: 7, result: "0x61", extra: true },
        7
      )
    ).toThrow();
    expect(() =>
      inspectBscTestnetPtaWbnbPoolRpcResponseForTests(
        { jsonrpc: "2.0", id: 7, result: "0x61", [Symbol("hidden")]: true },
        7
      )
    ).toThrow();

    let accessorCalls = 0;
    const accessorEnvelope = { jsonrpc: "2.0", id: 7 } as Record<string, unknown>;
    Object.defineProperty(accessorEnvelope, "result", {
      enumerable: true,
      get() {
        accessorCalls += 1;
        return "0x61";
      }
    });
    expect(() => inspectBscTestnetPtaWbnbPoolRpcResponseForTests(accessorEnvelope, 7)).toThrow();
    expect(accessorCalls).toBe(0);

    let proxyCalls = 0;
    const proxyEnvelope = new Proxy(
      { jsonrpc: "2.0", id: 7, result: "0x61" },
      {
        get() {
          proxyCalls += 1;
          throw new Error("must not execute");
        }
      }
    );
    expect(() => inspectBscTestnetPtaWbnbPoolRpcResponseForTests(proxyEnvelope, 7)).toThrow();
    expect(proxyCalls).toBe(0);
  });

  it("never emits a write RPC method or accepts arbitrary transaction input", async () => {
    const execution = run();
    const result = await execution.result;
    expect(result.status).toBe("observed");
    const methods = [...execution.primary.calls, ...execution.corroborator.calls].map(
      ({ method }) => method
    );
    expect(methods).not.toContain("eth_sendRawTransaction");
    expect(methods).not.toContain("eth_sendTransaction");
    expect(BSC_TESTNET_PANCAKE_V3_FACTORY).toBe(ADDRESSES.factory);
    expect(BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER).toBe(ADDRESSES.manager);
  });

  it("reports transport failures at the phase that issued the read", async () => {
    const identityFailure = await run(
      { throwMethod: "eth_getStorageAt" },
      { throwMethod: "eth_getStorageAt" }
    ).result;
    expect(identityFailure).toMatchObject({
      status: "blocked",
      stage: "identity",
      reason: "rpc_request_failed"
    });

    const simulationFailure = await run(
      { throwOnInitializerCall: true },
      { throwOnInitializerCall: true }
    ).result;
    expect(simulationFailure).toMatchObject({
      status: "blocked",
      stage: "simulation",
      reason: "rpc_request_failed"
    });
  });
});
