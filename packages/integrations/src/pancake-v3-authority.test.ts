import { describe, expect, it } from "vitest";
import { encodeAbiParameters, type Address, type Hex } from "viem";

import {
  createPancakeV3PositionAuthorityReader,
  type PancakeV3PositionAuthorityRpcClient,
  type PancakeV3PositionAuthorityRpcRequest
} from "./pancake-v3-authority";
import { PANCAKE_V3_BSC_DEPLOYMENTS } from "./pancake-v3";

const BLOCK_HASH = `0x${"ab".repeat(32)}` as Hex;
const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const CONTROLLER = "0x2222222222222222222222222222222222222222" as Address;
const OTHER = "0x3333333333333333333333333333333333333333" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const NOW = new Date("2026-08-11T12:00:30.000Z");
const TIMESTAMP = "1786449600";

function addressWord(address: Address): Hex {
  return encodeAbiParameters([{ type: "address" }], [address]);
}

function boolWord(value: boolean): Hex {
  return encodeAbiParameters([{ type: "bool" }], [value]);
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 97,
    positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[97].positionManager,
    positionTokenId: "36761",
    controllerAddress: CONTROLLER,
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
  readonly owner?: unknown;
  readonly tokenApproval?: unknown;
  readonly operatorApproved?: unknown;
  readonly throwAt?: "chain" | "block" | "owner" | "token" | "operator";
}

function client(options: ClientOptions = {}) {
  const calls: PancakeV3PositionAuthorityRpcRequest[] = [];
  let contractCall = 0;
  const rpc: PancakeV3PositionAuthorityRpcClient = {
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
          : {
              number: "0x76b024c",
              hash: BLOCK_HASH,
              timestamp: "0x6a7b0ec0"
            };
      }
      contractCall += 1;
      if (contractCall === 1) {
        if (options.throwAt === "owner") throw new Error("revert payload must not escape");
        return "owner" in options ? options.owner : addressWord(OWNER);
      }
      if (contractCall === 2) {
        if (options.throwAt === "token") throw new Error("revert payload must not escape");
        return "tokenApproval" in options ? options.tokenApproval : addressWord(CONTROLLER);
      }
      if (options.throwAt === "operator") throw new Error("revert payload must not escape");
      return "operatorApproved" in options ? options.operatorApproved : boolWord(false);
    }
  };
  return { rpc, calls };
}

function reader(rpc: PancakeV3PositionAuthorityRpcClient, now = () => NOW) {
  return createPancakeV3PositionAuthorityReader({
    client: rpc,
    now,
    freshnessPolicy: { maximumBlockAgeSeconds: 120, maximumFutureSkewSeconds: 5 },
    rpcProvider: {
      id: "unit-test-provider",
      publicSourceUrl: "https://rpc.example.test/source"
    }
  });
}

describe("Pancake V3 position authority reader", () => {
  it("establishes a token-approved controller at one exact canonical block hash", async () => {
    const fake = client();
    const result = await reader(fake.rpc).read(request());

    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.authorization).toMatchObject({
      ownerAddress: OWNER,
      controllerAddress: CONTROLLER,
      tokenApprovalAddress: CONTROLLER,
      operatorApproved: false,
      controllerAuthorized: true,
      authorizationKind: "token_controller",
      source: "onchain_owner_and_controller_read"
    });
    expect(result.block.ageMilliseconds).toBe("30000");
    expect(result.boundary).toMatchObject({
      establishesRuntimeCodeIdentity: false,
      establishesFutureAuthority: false,
      permitsExecution: false
    });
    expect(fake.calls).toHaveLength(5);
    for (const call of fake.calls.slice(2)) {
      expect(call).toMatchObject({
        method: "eth_call",
        params: [
          { to: PANCAKE_V3_BSC_DEPLOYMENTS[97].positionManager },
          { blockHash: BLOCK_HASH, requireCanonical: true }
        ]
      });
    }
    expect(result.provenance.latestTagUsed).toBe(false);
    expect(result.provenance.blockNumberSelectorUsed).toBe(false);
    expect(result.provenance.fallbackUsed).toBe(false);
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
      }
    });
  });

  it("uses the separate official mainnet manager and labels mainnet evidence", async () => {
    const fake = client({ chainId: "0x38" });
    const result = await reader(fake.rpc).read(
      request({
        chainId: 56,
        positionManagerAddress: PANCAKE_V3_BSC_DEPLOYMENTS[56].positionManager
      })
    );

    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.environment).toBe("bsc-mainnet");
    expect(result.provenance.deploymentSourceUrl).toContain("bscMainnet.json");
  });

  it.each([
    ["owner", OWNER, ZERO, false, "owner"],
    ["token approval", OWNER, CONTROLLER, false, "token_controller"],
    ["operator approval", OWNER, OTHER, true, "operator_controller"],
    ["unauthorized", OWNER, OTHER, false, null]
  ] as const)(
    "classifies %s without inferring more authority",
    async (_label, owner, token, operator, kind) => {
      const fake = client({
        owner: addressWord(owner),
        tokenApproval: addressWord(token),
        operatorApproved: boolWord(operator)
      });
      const input = kind === "owner" ? request({ controllerAddress: OWNER }) : request();
      const result = await reader(fake.rpc).read(input);

      expect(result.status).toBe("available");
      if (result.status !== "available") return;
      expect(result.authorization.authorizationKind).toBe(kind);
      expect(result.authorization.controllerAuthorized).toBe(kind !== null);
    }
  );

  it("never treats an ownerOf revert as evidence of no authority", async () => {
    const fake = client({ throwAt: "owner" });
    const result = await reader(fake.rpc).read(request());

    expect(result).toMatchObject({
      status: "unavailable",
      stage: "owner",
      reason: "contract_read_failed",
      authorization: null
    });
    expect(JSON.stringify(result)).not.toContain("revert payload");
    expect(fake.calls).toHaveLength(3);
  });

  it.each([
    ["token", "token_approval"],
    ["operator", "operator_approval"]
  ] as const)("keeps a failed %s approval read unavailable", async (throwAt, stage) => {
    const fake = client({ throwAt });
    const result = await reader(fake.rpc).read(request());
    expect(result).toMatchObject({ status: "unavailable", stage, reason: "contract_read_failed" });
  });

  it.each([
    ["malformed owner padding", { owner: `0x01${"00".repeat(31)}` }, "owner"],
    ["zero owner", { owner: addressWord(ZERO) }, "owner"],
    ["malformed token approval", { tokenApproval: "0x01" }, "token_approval"],
    ["non-canonical bool", { operatorApproved: `0x${"0".repeat(63)}2` }, "operator_approval"]
  ] as const)("rejects %s", async (_label, options, stage) => {
    const fake = client(options);
    const result = await reader(fake.rpc).read(request());
    expect(result).toMatchObject({
      status: "unavailable",
      stage,
      reason: "malformed_contract_response"
    });
  });

  it("rejects a manager that is not the official chain deployment before RPC", async () => {
    const fake = client();
    const result = await reader(fake.rpc).read(
      request({ positionManagerAddress: "0x4444444444444444444444444444444444444444" })
    );
    expect(result).toMatchObject({
      status: "unavailable",
      stage: "request",
      reason: "invalid_request"
    });
    expect(fake.calls).toHaveLength(0);
  });

  it.each([
    ["wrong chain", { chainId: "0x38" }, "chain", "chain_mismatch"],
    ["missing block", { block: null }, "block", "block_not_found"],
    [
      "block number drift",
      { block: { number: "0x1", hash: BLOCK_HASH, timestamp: "0x6a7b0ec0" } },
      "block",
      "block_mismatch"
    ],
    [
      "block hash drift",
      { block: { number: "0x76b024c", hash: `0x${"cd".repeat(32)}`, timestamp: "0x6a7b0ec0" } },
      "block",
      "block_mismatch"
    ]
  ] as const)("fails closed on %s", async (_label, options, stage, reason) => {
    const fake = client(options);
    const result = await reader(fake.rpc).read(request());
    expect(result).toMatchObject({ status: "unavailable", stage, reason });
  });

  it.each([
    ["chain transport failure", { throwAt: "chain" }, "chain", "chain_read_failed"],
    ["malformed chain", { chainId: "97" }, "chain", "malformed_chain_response"],
    ["block transport failure", { throwAt: "block" }, "block", "block_read_failed"],
    ["malformed block", { block: { number: "124453452" } }, "block", "malformed_block_response"]
  ] as const)("sanitizes %s", async (_label, options, stage, reason) => {
    const fake = client(options);
    const result = await reader(fake.rpc).read(request());
    expect(result).toMatchObject({ status: "unavailable", stage, reason, authorization: null });
    expect(JSON.stringify(result)).not.toContain("provider secret");
  });

  it("rejects stale and future blocks with the server-owned clock", async () => {
    const stale = client();
    const staleResult = await reader(stale.rpc, () => new Date("2026-08-11T12:03:00.001Z")).read(
      request()
    );
    expect(staleResult).toMatchObject({ status: "unavailable", reason: "stale_block" });

    const future = client();
    const futureResult = await reader(future.rpc, () => new Date("2026-08-11T11:59:54.999Z")).read(
      request()
    );
    expect(futureResult).toMatchObject({ status: "unavailable", reason: "future_block" });
  });

  it("rejects malformed clocks, uint256 values, repeated fields, and unsupported chains", async () => {
    const fake = client();
    const malformedClock = await reader(fake.rpc, () => new Date(Number.NaN)).read(request());
    expect(malformedClock).toMatchObject({ status: "unavailable", reason: "invalid_clock" });

    for (const input of [
      request({ positionTokenId: "01" }),
      request({ positionTokenId: (1n << 256n).toString() }),
      request({ chainId: 1 }),
      { ...request(), unexpected: true }
    ]) {
      const result = await reader(fake.rpc).read(input);
      expect(result).toMatchObject({ status: "unavailable", reason: "invalid_request" });
    }
  });

  it("keeps freshness and provider provenance in trusted reader configuration", async () => {
    const fake = client();
    const requestWithAttackerPolicy = {
      ...request(),
      maximumBlockAgeSeconds: 3_600,
      maximumFutureSkewSeconds: 60
    };
    const attackerResult = await reader(fake.rpc).read(requestWithAttackerPolicy);
    expect(attackerResult).toMatchObject({
      status: "unavailable",
      stage: "request",
      reason: "invalid_request"
    });
    expect(fake.calls).toHaveLength(0);

    const invalidConfiguration = createPancakeV3PositionAuthorityReader({
      client: fake.rpc,
      now: () => NOW,
      freshnessPolicy: { maximumBlockAgeSeconds: 0, maximumFutureSkewSeconds: 5 },
      rpcProvider: {
        id: "provider",
        publicSourceUrl: "https://user:secret@rpc.example.test/source"
      }
    });
    const invalidResult = await invalidConfiguration.read(request());
    expect(invalidResult).toMatchObject({
      status: "unavailable",
      stage: "configuration",
      reason: "invalid_configuration",
      provenance: null
    });
    expect(JSON.stringify(invalidResult)).not.toContain("secret");
    expect(fake.calls).toHaveLength(0);
  });

  it("preserves the maximum uint256 token ID without Number conversion", async () => {
    const fake = client();
    const maximum = ((1n << 256n) - 1n).toString();
    const result = await reader(fake.rpc).read(request({ positionTokenId: maximum }));
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.authorization.positionTokenId).toBe(maximum);
    expect(JSON.parse(JSON.stringify(result)).authorization.positionTokenId).toBe(maximum);
  });
});
