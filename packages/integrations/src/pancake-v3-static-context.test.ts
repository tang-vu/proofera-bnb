import { encodeAbiParameters, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { PANCAKE_V3_BSC_DEPLOYMENTS } from "./pancake-v3";
import {
  createPancakeV3StaticContextReader,
  type PancakeV3StaticContextRpcClient,
  type PancakeV3StaticContextRpcRequest
} from "./pancake-v3-static-context";

const BLOCK_HASH = `0x${"ab".repeat(32)}` as Hex;
const TOKEN0 = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN1 = "0x2222222222222222222222222222222222222222" as Address;
const WRAPPED_NATIVE = "0x3333333333333333333333333333333333333333" as Address;
const OTHER = "0x4444444444444444444444444444444444444444" as Address;
const POOL_DEPLOYER = "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9" as Address;
const NOW = new Date("2026-08-11T12:00:30.000Z");
const TIMESTAMP = "1786449600";

function addressWord(address: Address): Hex {
  return encodeAbiParameters([{ type: "address" }], [address]);
}

function uintWord(value: bigint): Hex {
  return encodeAbiParameters([{ type: "uint256" }], [value]);
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 97,
    positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[97].positionManager,
    factoryAddress: PANCAKE_V3_BSC_DEPLOYMENTS[97].factory,
    token0Address: TOKEN0,
    token1Address: TOKEN1,
    block: {
      number: "124453452",
      hash: BLOCK_HASH,
      timestampUnix: TIMESTAMP
    },
    ...overrides
  };
}

interface ClientOptions {
  readonly chainId?: unknown;
  readonly block?: unknown;
  readonly responses?: readonly unknown[];
  readonly throwAt?: "chain" | "block" | number;
}

function client(options: ClientOptions = {}) {
  const calls: PancakeV3StaticContextRpcRequest[] = [];
  let contractCall = 0;
  const responses = options.responses ?? [
    addressWord(PANCAKE_V3_BSC_DEPLOYMENTS[97].factory),
    addressWord(POOL_DEPLOYER),
    addressWord(WRAPPED_NATIVE),
    uintWord(18n),
    uintWord(6n)
  ];
  const rpc: PancakeV3StaticContextRpcClient = {
    async request(call) {
      calls.push(call);
      if (call.method === "eth_chainId") {
        if (options.throwAt === "chain") throw new Error("provider secret must not escape");
        return "chainId" in options ? options.chainId : "0x61";
      }
      if (call.method === "eth_getBlockByHash") {
        if (options.throwAt === "block") throw new Error("provider secret must not escape");
        return "block" in options
          ? options.block
          : { number: "0x76b024c", hash: BLOCK_HASH, timestamp: "0x6a7b0ec0" };
      }
      const index = contractCall;
      contractCall += 1;
      if (options.throwAt === index) throw new Error("contract secret must not escape");
      return responses[index];
    }
  };
  return { rpc, calls };
}

function reader(rpc: PancakeV3StaticContextRpcClient, now = () => NOW) {
  return createPancakeV3StaticContextReader({
    client: rpc,
    now,
    freshnessPolicy: { maximumBlockAgeSeconds: 120, maximumFutureSkewSeconds: 5 },
    rpcProvider: {
      id: "unit-test-provider",
      publicSourceUrl: "https://rpc.example.test/source"
    }
  });
}

describe("Pancake V3 static activation context", () => {
  it("binds manager immutables and token decimals at one exact canonical block hash", async () => {
    const fake = client();
    const result = await reader(fake.rpc).read(request());

    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.evidence).toMatchObject({
      positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[97].positionManager,
      factoryAddress: PANCAKE_V3_BSC_DEPLOYMENTS[97].factory,
      poolDeployerAddress: POOL_DEPLOYER,
      wrappedNativeAddress: WRAPPED_NATIVE,
      token0: { address: TOKEN0, decimals: 18 },
      token1: { address: TOKEN1, decimals: 6 },
      source: "onchain_manager_immutables_and_token_decimals"
    });
    expect(result.block.ageMilliseconds).toBe("30000");
    expect(fake.calls).toHaveLength(7);
    for (const call of fake.calls.slice(2)) {
      expect(call).toMatchObject({
        method: "eth_call",
        params: [expect.any(Object), { blockHash: BLOCK_HASH, requireCanonical: true }]
      });
    }
    expect(result.provenance).toMatchObject({
      deploymentCommit: "986847948755cba528324d41be19480731c36c2a",
      rpcProvider: {
        id: "unit-test-provider",
        publicSourceUrl: "https://rpc.example.test/source"
      },
      freshnessPolicy: {
        maximumBlockAgeSeconds: 120,
        maximumFutureSkewSeconds: 5,
        ownership: "trusted_reader_configuration"
      },
      latestTagUsed: false,
      blockNumberSelectorUsed: false,
      fallbackUsed: false,
      readsAtomic: false
    });
    expect(result.provenance.staticReadPlan.map(({ role }) => role)).toEqual([
      "manager_factory",
      "manager_pool_deployer",
      "manager_wrapped_native",
      "token0_decimals",
      "token1_decimals"
    ]);
    expect(result.boundary.permitsExecution).toBe(false);
  });

  it("uses the separate official mainnet manager while retaining the same pool deployer", async () => {
    const fake = client({
      chainId: "0x38",
      responses: [
        addressWord(PANCAKE_V3_BSC_DEPLOYMENTS[56].factory),
        addressWord(POOL_DEPLOYER),
        addressWord(WRAPPED_NATIVE),
        uintWord(18n),
        uintWord(18n)
      ]
    });
    const result = await reader(fake.rpc).read(
      request({
        chainId: 56,
        positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[56].positionManager,
        factoryAddress: PANCAKE_V3_BSC_DEPLOYMENTS[56].factory
      })
    );
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.environment).toBe("bsc-mainnet");
    expect(result.provenance.deploymentSourceUrl).toContain("bscMainnet.json");
  });

  it.each([
    ["manager factory", 0, "manager_factory"],
    ["pool deployer", 1, "manager_pool_deployer"],
    ["wrapped native", 2, "manager_wrapped_native"],
    ["token 0 decimals", 3, "token0_decimals"],
    ["token 1 decimals", 4, "token1_decimals"]
  ] as const)("keeps a failed %s read unavailable", async (_label, throwAt, stage) => {
    const fake = client({ throwAt });
    const result = await reader(fake.rpc).read(request());
    expect(result).toMatchObject({
      status: "unavailable",
      stage,
      reason: "contract_read_failed",
      evidence: null
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it.each([
    ["wrong factory", 0, addressWord(OTHER), "manager_factory", "deployment_relation_mismatch"],
    [
      "wrong pool deployer",
      1,
      addressWord(OTHER),
      "manager_pool_deployer",
      "deployment_relation_mismatch"
    ],
    [
      "zero wrapped native",
      2,
      addressWord("0x0000000000000000000000000000000000000000"),
      "manager_wrapped_native",
      "malformed_contract_response"
    ],
    [
      "noncanonical address",
      0,
      `0x01${"00".repeat(31)}`,
      "manager_factory",
      "malformed_contract_response"
    ],
    ["decimals overflow", 3, uintWord(256n), "token0_decimals", "malformed_contract_response"],
    ["short decimals", 4, "0x12", "token1_decimals", "malformed_contract_response"]
  ] as const)("fails closed on %s", async (_label, index, response, stage, reason) => {
    const responses: unknown[] = [
      addressWord(PANCAKE_V3_BSC_DEPLOYMENTS[97].factory),
      addressWord(POOL_DEPLOYER),
      addressWord(WRAPPED_NATIVE),
      uintWord(18n),
      uintWord(6n)
    ];
    responses[index] = response;
    const result = await reader(client({ responses }).rpc).read(request());
    expect(result).toMatchObject({ status: "unavailable", stage, reason, evidence: null });
  });

  it.each([
    ["wrong chain", { chainId: "0x38" }, "chain", "chain_mismatch"],
    ["missing block", { block: null }, "block", "block_not_found"],
    ["chain transport", { throwAt: "chain" }, "chain", "chain_read_failed"],
    ["block transport", { throwAt: "block" }, "block", "block_read_failed"],
    ["malformed chain", { chainId: "97" }, "chain", "malformed_chain_response"],
    ["malformed block", { block: { number: "124453452" } }, "block", "malformed_block_response"],
    [
      "block drift",
      { block: { number: "0x1", hash: BLOCK_HASH, timestamp: "0x6a7b0ec0" } },
      "block",
      "block_mismatch"
    ]
  ] as const)("fails closed on %s", async (_label, options, stage, reason) => {
    const fake = client(options);
    const result = await reader(fake.rpc).read(request());
    expect(result).toMatchObject({ status: "unavailable", stage, reason, evidence: null });
  });

  it("uses only the trusted freshness policy", async () => {
    const fake = client();
    const attackerResult = await reader(fake.rpc).read({
      ...request(),
      maximumBlockAgeSeconds: 3_600
    });
    expect(attackerResult).toMatchObject({
      status: "unavailable",
      stage: "request",
      reason: "invalid_request"
    });
    expect(fake.calls).toHaveLength(0);

    const stale = await reader(client().rpc, () => new Date("2026-08-11T12:03:00.001Z")).read(
      request()
    );
    expect(stale).toMatchObject({ status: "unavailable", reason: "stale_block" });
    const future = await reader(client().rpc, () => new Date("2026-08-11T11:59:54.999Z")).read(
      request()
    );
    expect(future).toMatchObject({ status: "unavailable", reason: "future_block" });
  });

  it("rejects hostile request and reader configuration before RPC", async () => {
    const fake = client();
    for (const input of [
      request({ token1Address: TOKEN0 }),
      request({ token0Address: "0x0000000000000000000000000000000000000000" }),
      request({ factoryAddress: OTHER }),
      request({ chainId: 1 }),
      { ...request(), unexpected: true }
    ]) {
      const result = await reader(fake.rpc).read(input);
      expect(result).toMatchObject({ status: "unavailable", reason: "invalid_request" });
    }
    expect(fake.calls).toHaveLength(0);

    const invalid = createPancakeV3StaticContextReader({
      client: fake.rpc,
      now: () => NOW,
      freshnessPolicy: { maximumBlockAgeSeconds: 0, maximumFutureSkewSeconds: 5 },
      rpcProvider: {
        id: "provider",
        publicSourceUrl: "https://user:secret@rpc.example.test/source"
      }
    });
    const invalidResult = await invalid.read(request());
    expect(invalidResult).toMatchObject({
      status: "unavailable",
      stage: "configuration",
      reason: "invalid_configuration",
      provenance: null
    });
    expect(JSON.stringify(invalidResult)).not.toContain("secret");
    expect(fake.calls).toHaveLength(0);
  });

  it("returns deeply JSON-safe exact evidence without implying token trust", async () => {
    const result = await reader(client().rpc).read(request());
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.boundary).toMatchObject({
      establishesRuntimeCodeIdentity: false,
      establishesTokenSymbolOrEconomicMeaning: false,
      establishesFutureState: false,
      permitsExecution: false
    });
  });
});
