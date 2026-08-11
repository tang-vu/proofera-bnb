import { keccak256, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  EVM_CODE_IDENTITY_MAX_CONTRACTS,
  EVM_CODE_IDENTITY_MAX_RUNTIME_BYTES,
  createEvmCodeIdentityReader,
  type EvmCodeIdentityRequest,
  type EvmCodeIdentityRpcClient,
  type EvmCodeIdentityRpcRequest
} from "./evm-code-identity";

const BLOCK_NUMBER = 42_000_000n;
const BLOCK_TIMESTAMP = 1_786_464_000n;
const BLOCK_HASH = `0x${"ab".repeat(32)}` as Hex;
const OTHER_BLOCK_HASH = `0x${"cd".repeat(32)}` as Hex;
const MANAGER = "0x1111111111111111111111111111111111111111";
const FACTORY = "0x2222222222222222222222222222222222222222";
const CODE_ONE = "0x60006000" as Hex;
const CODE_TWO = "0x6001600155" as Hex;
const CODE_ONE_HASH = keccak256(CODE_ONE);
const CODE_TWO_HASH = keccak256(CODE_TWO);

interface FakeRpcOptions {
  readonly chainResponse?: unknown;
  readonly blockResponse?: unknown;
  readonly codeResponses?: readonly unknown[];
  readonly throwAt?: "chain" | "block";
  readonly throwCodeAt?: number;
}

function fakeRpc(options: FakeRpcOptions = {}) {
  const requests: EvmCodeIdentityRpcRequest[] = [];
  let codeIndex = 0;
  const request = vi.fn(async (rpcRequest: EvmCodeIdentityRpcRequest): Promise<unknown> => {
    requests.push(rpcRequest);
    if (rpcRequest.method === "eth_chainId") {
      if (options.throwAt === "chain") throw new Error("sensitive provider chain detail");
      return Object.hasOwn(options, "chainResponse") ? options.chainResponse : "0x38";
    }
    if (rpcRequest.method === "eth_getBlockByHash") {
      if (options.throwAt === "block") throw new Error("sensitive provider block detail");
      return Object.hasOwn(options, "blockResponse")
        ? options.blockResponse
        : {
            number: `0x${BLOCK_NUMBER.toString(16)}`,
            hash: BLOCK_HASH,
            timestamp: `0x${BLOCK_TIMESTAMP.toString(16)}`,
            providerSpecificField: "ignored"
          };
    }

    const currentCodeIndex = codeIndex;
    codeIndex += 1;
    if (options.throwCodeAt === currentCodeIndex) {
      throw new Error("EIP-1898 unsupported or block is not canonical: sensitive detail");
    }
    if (options.codeResponses !== undefined && currentCodeIndex < options.codeResponses.length) {
      return options.codeResponses[currentCodeIndex];
    }
    return currentCodeIndex === 0 ? CODE_ONE : CODE_TWO;
  });

  const client: EvmCodeIdentityRpcClient = { request };
  return { client, request, requests };
}

function validRequest(overrides: Partial<EvmCodeIdentityRequest> = {}): EvmCodeIdentityRequest {
  return {
    chainId: 56,
    block: {
      number: BLOCK_NUMBER.toString(10),
      hash: BLOCK_HASH,
      timestampUnix: BLOCK_TIMESTAMP.toString(10)
    },
    maximumBlockAgeSeconds: 120,
    maximumFutureSkewSeconds: 30,
    contracts: [
      { label: "Position Manager", address: MANAGER, expectedRuntimeCodeHash: CODE_ONE_HASH },
      { label: "Factory", address: FACTORY }
    ],
    ...overrides
  };
}

function reader(client: EvmCodeIdentityRpcClient, now: () => Date = fixedClock) {
  return createEvmCodeIdentityReader({ client, now });
}

function fixedClock(): Date {
  return new Date("2026-08-11T16:00:30.000Z");
}

function allStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => allStringValues(entry));
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap((entry) => allStringValues(entry));
}

describe("EVM runtime-code identity reader", () => {
  it("returns exact JSON-safe runtime identities with canonical EIP-1898 provenance", async () => {
    const fake = fakeRpc();

    const result = await reader(fake.client).read(validRequest());

    expect(result).toEqual({
      status: "available",
      observedAt: "2026-08-11T16:00:30.000Z",
      chainId: 56,
      environment: "bsc-mainnet",
      block: {
        number: BLOCK_NUMBER.toString(10),
        hash: BLOCK_HASH,
        timestampUnix: BLOCK_TIMESTAMP.toString(10),
        timestampUtc: "2026-08-11T16:00:00.000Z",
        ageMilliseconds: "30000"
      },
      contracts: [
        {
          label: "Position Manager",
          address: MANAGER,
          byteLength: "4",
          runtimeCodeHash: CODE_ONE_HASH,
          expectedRuntimeCodeHash: CODE_ONE_HASH,
          expectation: "matched",
          provenance: {
            method: "eth_getCode",
            address: MANAGER,
            blockSelector: { blockHash: BLOCK_HASH, requireCanonical: true }
          }
        },
        {
          label: "Factory",
          address: FACTORY,
          byteLength: "5",
          runtimeCodeHash: CODE_TWO_HASH,
          expectedRuntimeCodeHash: null,
          expectation: "not_supplied",
          provenance: {
            method: "eth_getCode",
            address: FACTORY,
            blockSelector: { blockHash: BLOCK_HASH, requireCanonical: true }
          }
        }
      ],
      provenance: {
        chainRead: { method: "eth_chainId", params: [] },
        blockRead: { method: "eth_getBlockByHash", params: [BLOCK_HASH, false] },
        codeRead: {
          method: "eth_getCode",
          blockSelector: { blockHash: BLOCK_HASH, requireCanonical: true }
        },
        fallbackUsed: false,
        latestTagUsed: false,
        blockNumberSelectorUsed: false,
        codeReadsAtomic: false
      },
      boundary: {
        identityKind: "keccak256_evm_runtime_bytecode_at_block",
        sourceCodeVerified: false,
        proxyImplementationIdentified: false,
        safetyEstablished: false,
        rawRuntimeCodeReturned: false,
        limitations: [
          "A runtime bytecode hash is not source-code verification.",
          "A proxy runtime hash does not identify or validate its implementation contract.",
          "Code presence or an expected-hash match does not establish safety, behavior, ownership, or upgradeability.",
          "Contract code reads are sequential at one block hash, not one atomic multi-contract observation."
        ]
      }
    });
    expect(fake.requests).toEqual([
      { method: "eth_chainId", params: [] },
      { method: "eth_getBlockByHash", params: [BLOCK_HASH, false] },
      {
        method: "eth_getCode",
        params: [MANAGER, { blockHash: BLOCK_HASH, requireCanonical: true }]
      },
      {
        method: "eth_getCode",
        params: [FACTORY, { blockHash: BLOCK_HASH, requireCanonical: true }]
      }
    ]);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(allStringValues(result)).not.toContain(CODE_ONE);
    expect(allStringValues(result)).not.toContain(CODE_TWO);
  });

  it("supports chain 97 without weakening the exact block selector", async () => {
    const fake = fakeRpc({ chainResponse: "0x61", codeResponses: [CODE_ONE] });

    const result = await reader(fake.client).read(
      validRequest({
        chainId: 97,
        contracts: [{ label: "Manager", address: MANAGER }]
      })
    );

    expect(result).toMatchObject({
      status: "available",
      chainId: 97,
      environment: "bsc-testnet",
      contracts: [{ runtimeCodeHash: CODE_ONE_HASH }]
    });
    expect(fake.requests.at(-1)).toEqual({
      method: "eth_getCode",
      params: [MANAGER, { blockHash: BLOCK_HASH, requireCanonical: true }]
    });
  });

  it("strictly rejects malformed, duplicate, oversized, and extra request fields before RPC", async () => {
    const tooManyContracts = Array.from(
      { length: EVM_CODE_IDENTITY_MAX_CONTRACTS + 1 },
      (_, index) => ({
        label: `Contract ${index}`,
        address: `0x${(index + 1).toString(16).padStart(40, "0")}`
      })
    );
    const base = validRequest();
    const invalidInputs: unknown[] = [
      { ...base, chainId: 1 },
      { ...base, maximumBlockAgeSeconds: 3_601 },
      { ...base, maximumFutureSkewSeconds: 61 },
      { ...base, block: { ...base.block, number: "042000000" } },
      { ...base, block: { ...base.block, hash: "0x12" } },
      { ...base, block: { ...base.block, timestampUnix: "253402300800" } },
      { ...base, block: { ...base.block, extra: true } },
      { ...base, contracts: [] },
      { ...base, contracts: tooManyContracts },
      {
        ...base,
        contracts: [
          { label: "Manager", address: MANAGER },
          { label: "manager", address: FACTORY }
        ]
      },
      {
        ...base,
        contracts: [
          { label: "Manager", address: MANAGER },
          { label: "Factory", address: MANAGER.toUpperCase().replace("0X", "0x") }
        ]
      },
      { ...base, contracts: [{ label: " Manager", address: MANAGER }] },
      { ...base, contracts: [{ label: "Manager\nspoof", address: MANAGER }] },
      {
        ...base,
        contracts: [{ label: "Manager", address: "0x0000000000000000000000000000000000000000" }]
      },
      { ...base, contracts: [{ label: "Manager", address: "not-an-address" }] },
      { ...base, contracts: [{ label: "Manager", address: MANAGER, extra: true }] },
      { ...base, extra: true }
    ];

    for (const input of invalidInputs) {
      const fake = fakeRpc();
      const result = await reader(fake.client).read(input);
      expect(result).toMatchObject({
        status: "unavailable",
        stage: "request",
        reason: "invalid_request",
        observedAt: null,
        provenance: null,
        contracts: null
      });
      expect(fake.request).not.toHaveBeenCalled();
    }
  });

  it("captures the injected clock once and fails closed when it throws or is invalid", async () => {
    const fake = fakeRpc({ codeResponses: [CODE_ONE] });
    const once = vi.fn(fixedClock);
    const success = await reader(fake.client, once).read(
      validRequest({ contracts: [{ label: "Manager", address: MANAGER }] })
    );
    expect(success.status).toBe("available");
    expect(once).toHaveBeenCalledTimes(1);

    for (const now of [
      () => new Date(Number.NaN),
      () => new Date(-1),
      () => new Date(253_402_300_800_000),
      () => {
        throw new Error("clock secret");
      }
    ]) {
      const localFake = fakeRpc();
      const result = await reader(localFake.client, now).read(validRequest());
      expect(result).toMatchObject({
        status: "unavailable",
        stage: "clock",
        reason: "invalid_clock",
        observedAt: null
      });
      expect(JSON.stringify(result)).not.toContain("secret");
      expect(localFake.request).not.toHaveBeenCalled();
    }
  });

  it("fails closed on chain read failure, malformed quantity, and chain mismatch", async () => {
    const cases: readonly [FakeRpcOptions, string][] = [
      [{ throwAt: "chain" }, "chain_read_failed"],
      [{ chainResponse: 56 }, "malformed_chain_response"],
      [{ chainResponse: "0x038" }, "malformed_chain_response"],
      [{ chainResponse: "0x61" }, "chain_mismatch"]
    ];

    for (const [options, reason] of cases) {
      const fake = fakeRpc(options);
      const result = await reader(fake.client).read(validRequest());
      expect(result).toMatchObject({ status: "unavailable", stage: "chain", reason });
      expect(fake.requests).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain("sensitive");
    }
  });

  it("binds the requested block number, hash, and timestamp through an exact hash read", async () => {
    const mismatches: unknown[] = [
      {
        number: `0x${(BLOCK_NUMBER + 1n).toString(16)}`,
        hash: BLOCK_HASH,
        timestamp: `0x${BLOCK_TIMESTAMP.toString(16)}`
      },
      {
        number: `0x${BLOCK_NUMBER.toString(16)}`,
        hash: OTHER_BLOCK_HASH,
        timestamp: `0x${BLOCK_TIMESTAMP.toString(16)}`
      },
      {
        number: `0x${BLOCK_NUMBER.toString(16)}`,
        hash: BLOCK_HASH,
        timestamp: `0x${(BLOCK_TIMESTAMP + 1n).toString(16)}`
      }
    ];

    for (const blockResponse of mismatches) {
      const fake = fakeRpc({ blockResponse });
      const result = await reader(fake.client).read(validRequest());
      expect(result).toMatchObject({
        status: "unavailable",
        stage: "block",
        reason: "block_mismatch"
      });
      expect(fake.requests).toEqual([
        { method: "eth_chainId", params: [] },
        { method: "eth_getBlockByHash", params: [BLOCK_HASH, false] }
      ]);
    }
  });

  it("separates block provider failure, absence, and malformed response", async () => {
    const cases: readonly [FakeRpcOptions, string][] = [
      [{ throwAt: "block" }, "block_read_failed"],
      [{ blockResponse: null }, "block_not_found"],
      [{ blockResponse: undefined }, "malformed_block_response"],
      [
        {
          blockResponse: {
            number: Number(BLOCK_NUMBER),
            hash: BLOCK_HASH,
            timestamp: `0x${BLOCK_TIMESTAMP.toString(16)}`
          }
        },
        "malformed_block_response"
      ],
      [
        {
          blockResponse: {
            number: `0x0${BLOCK_NUMBER.toString(16)}`,
            hash: BLOCK_HASH,
            timestamp: `0x${BLOCK_TIMESTAMP.toString(16)}`
          }
        },
        "malformed_block_response"
      ],
      [
        {
          blockResponse: {
            get number(): never {
              throw new Error("hostile block response detail");
            },
            hash: BLOCK_HASH,
            timestamp: `0x${BLOCK_TIMESTAMP.toString(16)}`
          }
        },
        "malformed_block_response"
      ]
    ];

    for (const [options, reason] of cases) {
      const fake = fakeRpc(options);
      const result = await reader(fake.client).read(validRequest());
      expect(result).toMatchObject({ status: "unavailable", stage: "block", reason });
      expect(fake.requests).toHaveLength(2);
    }
  });

  it("enforces exact block freshness and future-tolerance boundaries", async () => {
    const atStaleBoundary = await reader(fakeRpc().client).read(
      validRequest({ maximumBlockAgeSeconds: 30 })
    );
    expect(atStaleBoundary.status).toBe("available");

    const stale = await reader(fakeRpc().client, () => new Date("2026-08-11T16:00:30.001Z")).read(
      validRequest({ maximumBlockAgeSeconds: 30 })
    );
    expect(stale).toMatchObject({
      status: "unavailable",
      stage: "block",
      reason: "stale_block",
      block: { ageMilliseconds: "30001" }
    });

    const futureBlockTimestamp = BLOCK_TIMESTAMP + 61n;
    const futureRequest = validRequest({
      block: {
        number: BLOCK_NUMBER.toString(10),
        hash: BLOCK_HASH,
        timestampUnix: futureBlockTimestamp.toString(10)
      }
    });
    const futureFake = fakeRpc({
      blockResponse: {
        number: `0x${BLOCK_NUMBER.toString(16)}`,
        hash: BLOCK_HASH,
        timestamp: `0x${futureBlockTimestamp.toString(16)}`
      }
    });
    const future = await reader(futureFake.client).read(futureRequest);
    expect(future).toMatchObject({
      status: "unavailable",
      stage: "block",
      reason: "future_block",
      block: { ageMilliseconds: "-31000" }
    });
    expect(futureFake.requests).toHaveLength(2);
  });

  it("treats provider EIP-1898 rejection and noncanonical blocks as one fail-closed code stage", async () => {
    const fake = fakeRpc({ throwCodeAt: 0 });

    const result = await reader(fake.client).read(validRequest());

    expect(result).toMatchObject({
      status: "unavailable",
      stage: "code",
      reason: "canonical_code_read_failed",
      failedContract: {
        label: "Position Manager",
        address: MANAGER,
        observedRuntimeCodeHash: null,
        observedByteLength: null
      },
      provenance: {
        fallbackUsed: false,
        latestTagUsed: false,
        blockNumberSelectorUsed: false
      }
    });
    expect(fake.requests).toEqual([
      { method: "eth_chainId", params: [] },
      { method: "eth_getBlockByHash", params: [BLOCK_HASH, false] },
      {
        method: "eth_getCode",
        params: [MANAGER, { blockHash: BLOCK_HASH, requireCanonical: true }]
      }
    ]);
    expect(JSON.stringify(result)).not.toContain("sensitive detail");
  });

  it("does not retry or fall back when a later labeled contract fails", async () => {
    const fake = fakeRpc({ throwCodeAt: 1 });

    const result = await reader(fake.client).read(validRequest());

    expect(result).toMatchObject({
      status: "unavailable",
      stage: "code",
      reason: "canonical_code_read_failed",
      contracts: null,
      failedContract: { label: "Factory", address: FACTORY }
    });
    expect(fake.requests).toHaveLength(4);
    expect(
      fake.requests.every((rpcRequest) => {
        if (rpcRequest.method !== "eth_getCode") return true;
        const selector = rpcRequest.params[1];
        return (
          typeof selector === "object" &&
          selector.blockHash === BLOCK_HASH &&
          selector.requireCanonical === true &&
          !("blockNumber" in selector)
        );
      })
    ).toBe(true);
  });

  it("rejects missing, malformed, and oversized runtime code without hashing or echoing it", async () => {
    const oversizedCode = `0x${"aa".repeat(EVM_CODE_IDENTITY_MAX_RUNTIME_BYTES + 1)}`;
    const cases: readonly [unknown, string][] = [
      ["0x", "missing_runtime_code"],
      [undefined, "malformed_runtime_code"],
      [null, "malformed_runtime_code"],
      ["0x0", "malformed_runtime_code"],
      ["0xzz", "malformed_runtime_code"],
      [oversizedCode, "oversized_runtime_code"]
    ];

    for (const [codeResponse, reason] of cases) {
      const fake = fakeRpc({ codeResponses: [codeResponse] });
      const result = await reader(fake.client).read(
        validRequest({ contracts: [{ label: "Manager", address: MANAGER }] })
      );
      expect(result).toMatchObject({ status: "unavailable", stage: "code", reason });
      expect(result).toHaveProperty("failedContract.observedRuntimeCodeHash", null);
      expect(result).toHaveProperty("failedContract.observedByteLength", null);
      expect(JSON.stringify(result)).not.toContain(oversizedCode.slice(0, 200));
    }
  });

  it("fails closed on an expected hash mismatch while retaining only bounded hash diagnostics", async () => {
    const fake = fakeRpc({ codeResponses: [CODE_TWO] });

    const result = await reader(fake.client).read(
      validRequest({
        contracts: [{ label: "Manager", address: MANAGER, expectedRuntimeCodeHash: CODE_ONE_HASH }]
      })
    );

    expect(result).toMatchObject({
      status: "unavailable",
      stage: "code",
      reason: "runtime_code_hash_mismatch",
      contracts: null,
      failedContract: {
        label: "Manager",
        address: MANAGER,
        expectedRuntimeCodeHash: CODE_ONE_HASH,
        observedRuntimeCodeHash: CODE_TWO_HASH,
        observedByteLength: "5"
      }
    });
    expect(allStringValues(result)).not.toContain(CODE_TWO);
  });

  it("never issues latest, block-number, transaction, wallet, or write RPC methods", async () => {
    const success = fakeRpc();
    await reader(success.client).read(validRequest());
    const failure = fakeRpc({ throwCodeAt: 0 });
    await reader(failure.client).read(validRequest());

    for (const rpcRequest of [...success.requests, ...failure.requests]) {
      expect(["eth_chainId", "eth_getBlockByHash", "eth_getCode"]).toContain(rpcRequest.method);
      expect(JSON.stringify(rpcRequest)).not.toContain("latest");
      expect(JSON.stringify(rpcRequest)).not.toContain("eth_send");
      if (rpcRequest.method === "eth_getCode") {
        expect(rpcRequest.params[1]).toEqual({
          blockHash: BLOCK_HASH,
          requireCanonical: true
        });
      }
    }
  });
});
