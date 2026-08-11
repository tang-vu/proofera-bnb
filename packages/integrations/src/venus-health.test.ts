import type { PublicClient } from "viem";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  VENUS_CORE_POOL_BSC_DEPLOYMENTS,
  createVenusHealthReader,
  type VenusAccountRiskSnapshotRequest,
  type VenusContractReadParameters,
  type VenusHealthReadClient
} from "./venus-health";

const BLOCK_NUMBER = 42_000_000n;
const BLOCK_TIMESTAMP = 1_786_464_000n;
const BLOCK_HASH = `0x${"ab".repeat(32)}`;
const OTHER_BLOCK_HASH = `0x${"cd".repeat(32)}`;
const ACCOUNT = "0x1111111111111111111111111111111111111111";
const UINT256_MAX_DECIMAL =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

interface FakeClientOptions {
  readonly chainId?: unknown;
  readonly block?: unknown;
  readonly code?: () => unknown;
  readonly liquidityResult?: unknown;
  readonly throwAt?: "chain" | "block" | "code" | "liquidity";
}

function createFakeClient(overrides: FakeClientOptions = {}) {
  const contractReads: VenusContractReadParameters[] = [];
  const getChainId = vi.fn(async (): Promise<unknown> => {
    if (overrides.throwAt === "chain") throw new Error("provider chain failure");
    return overrides.chainId ?? 56;
  });
  const getBlock = vi.fn(async (): Promise<unknown> => {
    if (overrides.throwAt === "block") throw new Error("provider block failure");
    return (
      overrides.block ?? {
        number: BLOCK_NUMBER,
        hash: BLOCK_HASH,
        timestamp: BLOCK_TIMESTAMP,
        ignoredProviderField: "not trusted"
      }
    );
  });
  const getCode = vi.fn(async (): Promise<unknown> => {
    if (overrides.throwAt === "code") throw new Error("provider code failure");
    return overrides.code === undefined ? "0x60006000" : overrides.code();
  });
  const readContract = vi.fn(async (parameters: VenusContractReadParameters): Promise<unknown> => {
    contractReads.push(parameters);
    if (overrides.throwAt === "liquidity") throw new Error("provider read failure");
    if (parameters.functionName !== "getAccountLiquidity") {
      throw new Error(`Unexpected read ${parameters.functionName}`);
    }
    return overrides.liquidityResult ?? [0n, 12_345n, 0n];
  });

  const client: VenusHealthReadClient = {
    getChainId,
    getBlock,
    getCode,
    readContract
  };
  return { client, getChainId, getBlock, getCode, readContract, contractReads };
}

function request(
  overrides: Partial<VenusAccountRiskSnapshotRequest> = {}
): VenusAccountRiskSnapshotRequest {
  const chainId = overrides.chainId ?? 56;
  return {
    chainId,
    account: ACCOUNT,
    comptrollerAddress:
      overrides.comptrollerAddress ?? VENUS_CORE_POOL_BSC_DEPLOYMENTS[chainId].comptroller,
    blockNumber: BLOCK_NUMBER.toString(10),
    expectedBlockHash: BLOCK_HASH,
    maximumBlockAgeSeconds: 120,
    ...overrides
  };
}

function createReader(client: VenusHealthReadClient) {
  return createVenusHealthReader({
    client,
    now: () => new Date("2026-08-11T16:00:30.000Z")
  });
}

describe("Venus Core Pool account risk snapshot", () => {
  it("pins the official Venus Core Pool proxy addresses for BSC 56 and 97", () => {
    expect(VENUS_CORE_POOL_BSC_DEPLOYMENTS[56].comptroller).toBe(
      "0xfD36E2c2a6789Db23113685031d7F16329158384"
    );
    expect(VENUS_CORE_POOL_BSC_DEPLOYMENTS[97].comptroller).toBe(
      "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D"
    );
  });

  it("accepts the read surface of a viem PublicClient", () => {
    expectTypeOf<PublicClient>().toMatchTypeOf<VenusHealthReadClient>();
  });

  it("preserves uint256 precision and pins the block, bytecode, and liquidity read", async () => {
    const fake = createFakeClient({ liquidityResult: [0n, BigInt(UINT256_MAX_DECIMAL), 0n] });

    const result = await createReader(fake.client).getAccountRiskSnapshot(request());

    expect(result).toEqual({
      status: "available",
      provenance: {
        chainId: 56,
        environment: "bsc-mainnet",
        account: ACCOUNT,
        observedAt: "2026-08-11T16:00:30.000Z",
        ageSeconds: 30,
        readsPinnedToBlock: true,
        block: {
          number: BLOCK_NUMBER.toString(10),
          hash: BLOCK_HASH,
          timestampUnix: BLOCK_TIMESTAMP.toString(10),
          timestampUtc: "2026-08-11T16:00:00.000Z"
        },
        source: {
          kind: "onchain_contract_read",
          protocol: "Venus Core Pool",
          contractAddress: VENUS_CORE_POOL_BSC_DEPLOYMENTS[56].comptroller,
          functionSignature: "getAccountLiquidity(address)",
          officialDeploymentDocumentationUrl: "https://docs-v4.venus.io/deployed-contracts/markets",
          officialContractDocumentationUrl:
            "https://docs-v4.venus.io/technical-reference/reference-core-pool/comptroller/diamond/facets/policy-facet",
          explorerUrl: VENUS_CORE_POOL_BSC_DEPLOYMENTS[56].explorerUrl
        },
        httpFallbackUsed: false
      },
      snapshot: {
        liquidationThresholdLiquidity: {
          errorCode: "0",
          excessLiquidityRaw: UINT256_MAX_DECIMAL,
          shortfallRaw: "0",
          rawUnit: "venus-comptroller-account-liquidity-unit",
          signal: "excess_liquidity_reported"
        },
        liquidationThresholdHealthFactor: {
          status: "not_computed",
          ratioDecimal: null,
          calculationBoundary: "aggregate_liquidity_difference_is_not_a_ratio",
          reason:
            "getAccountLiquidity returns an aggregate excess-or-shortfall difference, not the gross adjusted collateral and debt values required for a defensible ratio.",
          requiredAuthoritativeInputs: [
            "per-market supplied balances at the same block",
            "per-market borrowed balances at the same block",
            "oracle prices and decimals at the same block",
            "liquidation thresholds and applicable e-mode state at the same block"
          ]
        },
        methodologyVersion: "venus-core-account-risk-v1",
        limitations: [
          "Raw liquidity and shortfall units are preserved without an undocumented currency or decimal conversion.",
          "A zero/zero result can mean no relevant position or no reported excess/shortfall; this adapter does not guess which.",
          "A reported shortfall is a risk signal, not proof that a particular liquidation transaction is executable."
        ],
        executionEnabled: false
      }
    });
    expect(fake.getBlock).toHaveBeenCalledWith({ blockNumber: BLOCK_NUMBER });
    expect(fake.getCode).toHaveBeenCalledWith({
      address: VENUS_CORE_POOL_BSC_DEPLOYMENTS[56].comptroller,
      blockNumber: BLOCK_NUMBER
    });
    expect(fake.contractReads).toHaveLength(1);
    expect(fake.contractReads[0]).toMatchObject({
      address: VENUS_CORE_POOL_BSC_DEPLOYMENTS[56].comptroller,
      functionName: "getAccountLiquidity",
      args: [ACCOUNT],
      blockNumber: BLOCK_NUMBER
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("uses the official BSC testnet deployment and reports raw shortfall", async () => {
    const fake = createFakeClient({ chainId: 97, liquidityResult: [0n, 0n, 999n] });

    const result = await createReader(fake.client).getAccountRiskSnapshot(request({ chainId: 97 }));

    expect(result).toMatchObject({
      status: "available",
      provenance: {
        chainId: 97,
        environment: "bsc-testnet",
        source: {
          contractAddress: VENUS_CORE_POOL_BSC_DEPLOYMENTS[97].comptroller,
          explorerUrl: VENUS_CORE_POOL_BSC_DEPLOYMENTS[97].explorerUrl
        }
      },
      snapshot: {
        liquidationThresholdLiquidity: {
          excessLiquidityRaw: "0",
          shortfallRaw: "999",
          signal: "shortfall_reported"
        },
        liquidationThresholdHealthFactor: {
          status: "not_computed",
          ratioDecimal: null
        }
      }
    });
  });

  it("rejects a wrong RPC chain before block or contract reads", async () => {
    const fake = createFakeClient({ chainId: 97 });

    const result = await createReader(fake.client).getAccountRiskSnapshot(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "chain_mismatch",
      stage: "chain",
      retryable: false,
      executionEnabled: false
    });
    expect(fake.getBlock).not.toHaveBeenCalled();
    expect(fake.getCode).not.toHaveBeenCalled();
    expect(fake.readContract).not.toHaveBeenCalled();
  });

  it("rejects unsupported chains, bad accounts, spoofed deployments, and extra input", async () => {
    const fake = createFakeClient();
    const reader = createReader(fake.client);
    const cases: unknown[] = [
      { ...request(), chainId: 1 },
      { ...request(), account: "not-an-address" },
      { ...request(), account: "0x0000000000000000000000000000000000000000" },
      { ...request(), comptrollerAddress: "0x2222222222222222222222222222222222222222" },
      { ...request(), blockNumber: "042000000" },
      { ...request(), maximumBlockAgeSeconds: 0 },
      { ...request(), unexpected: "field" }
    ];

    for (const invalidRequest of cases) {
      const result = await reader.getAccountRiskSnapshot(
        invalidRequest as VenusAccountRiskSnapshotRequest
      );
      expect(result).toMatchObject({
        status: "unavailable",
        reason: "invalid_request",
        stage: "request",
        provenance: null
      });
    }
    expect(fake.getChainId).not.toHaveBeenCalled();
  });

  it("fails closed on block-number and expected-hash mismatches", async () => {
    const wrongNumber = createFakeClient({
      block: { number: BLOCK_NUMBER + 1n, hash: BLOCK_HASH, timestamp: BLOCK_TIMESTAMP }
    });
    const wrongHash = createFakeClient();

    const wrongNumberResult = await createReader(wrongNumber.client).getAccountRiskSnapshot(
      request()
    );
    const wrongHashResult = await createReader(wrongHash.client).getAccountRiskSnapshot(
      request({ expectedBlockHash: OTHER_BLOCK_HASH })
    );

    expect(wrongNumberResult).toMatchObject({
      status: "unavailable",
      reason: "block_mismatch",
      stage: "block"
    });
    expect(wrongHashResult).toMatchObject({
      status: "unavailable",
      reason: "block_mismatch",
      stage: "block"
    });
    expect(wrongNumber.getCode).not.toHaveBeenCalled();
    expect(wrongHash.getCode).not.toHaveBeenCalled();
  });

  it("rejects stale and implausibly future block timestamps", async () => {
    const stale = createFakeClient({
      block: { number: BLOCK_NUMBER, hash: BLOCK_HASH, timestamp: BLOCK_TIMESTAMP - 121n }
    });
    const future = createFakeClient({
      block: { number: BLOCK_NUMBER, hash: BLOCK_HASH, timestamp: BLOCK_TIMESTAMP + 91n }
    });

    const staleResult = await createReader(stale.client).getAccountRiskSnapshot(request());
    const futureResult = await createReader(future.client).getAccountRiskSnapshot(request());

    expect(staleResult).toMatchObject({
      status: "unavailable",
      reason: "stale_block",
      stage: "block"
    });
    expect(futureResult).toMatchObject({
      status: "unavailable",
      reason: "incompatible_response",
      stage: "block"
    });
    expect(stale.getCode).not.toHaveBeenCalled();
    expect(future.getCode).not.toHaveBeenCalled();
  });

  it("requires valid non-empty Comptroller bytecode at the pinned block", async () => {
    const absent = createFakeClient({ code: () => "0x" });
    const undefinedCode = createFakeClient({ code: () => undefined });
    const malformed = createFakeClient({ code: () => "0x123" });

    const absentResult = await createReader(absent.client).getAccountRiskSnapshot(request());
    const undefinedResult = await createReader(undefinedCode.client).getAccountRiskSnapshot(
      request()
    );
    const malformedResult = await createReader(malformed.client).getAccountRiskSnapshot(request());

    expect(absentResult).toMatchObject({
      status: "unavailable",
      reason: "missing_code",
      stage: "code"
    });
    expect(undefinedResult).toMatchObject({
      status: "unavailable",
      reason: "missing_code",
      stage: "code"
    });
    expect(malformedResult).toMatchObject({
      status: "unavailable",
      reason: "incompatible_response",
      stage: "code"
    });
    expect(absent.readContract).not.toHaveBeenCalled();
    expect(undefinedCode.readContract).not.toHaveBeenCalled();
    expect(malformed.readContract).not.toHaveBeenCalled();
  });

  it("rejects non-zero contract errors and impossible simultaneous liquidity and shortfall", async () => {
    const contractError = createFakeClient({ liquidityResult: [7n, 0n, 0n] });
    const contradictory = createFakeClient({ liquidityResult: [0n, 1n, 1n] });

    const errorResult = await createReader(contractError.client).getAccountRiskSnapshot(request());
    const contradictoryResult = await createReader(contradictory.client).getAccountRiskSnapshot(
      request()
    );

    expect(errorResult).toMatchObject({
      status: "unavailable",
      reason: "contract_error_code",
      stage: "liquidity",
      contractErrorCode: "7",
      retryable: false
    });
    expect(contradictoryResult).toMatchObject({
      status: "unavailable",
      reason: "incompatible_response",
      stage: "liquidity",
      contractErrorCode: null
    });
  });

  it("rejects lossy numbers, negative uints, overflow, and malformed tuples", async () => {
    const invalidResponses: unknown[] = [
      [0, 1, 0],
      [0n, -1n, 0n],
      [0n, BigInt(UINT256_MAX_DECIMAL) + 1n, 0n],
      [0n, 1n],
      { errorCode: 0n, liquidity: 1n, shortfall: 0n }
    ];

    for (const liquidityResult of invalidResponses) {
      const fake = createFakeClient({ liquidityResult });
      const result = await createReader(fake.client).getAccountRiskSnapshot(request());
      expect(result).toMatchObject({
        status: "unavailable",
        reason: "incompatible_response",
        stage: "liquidity"
      });
    }
  });

  it("makes provider failures explicit without exposing provider messages", async () => {
    for (const throwAt of ["chain", "block", "code", "liquidity"] as const) {
      const fake = createFakeClient({ throwAt });
      const result = await createReader(fake.client).getAccountRiskSnapshot(request());

      expect(result).toMatchObject({
        status: "unavailable",
        reason: "read_error",
        stage: throwAt,
        retryable: true,
        executionEnabled: false
      });
      expect(JSON.stringify(result)).not.toContain("provider");
    }
  });

  it("preserves zero/zero as an ambiguous signal instead of inventing a health factor", async () => {
    const fake = createFakeClient({ liquidityResult: [0n, 0n, 0n] });

    const result = await createReader(fake.client).getAccountRiskSnapshot(request());

    expect(result).toMatchObject({
      status: "available",
      snapshot: {
        liquidationThresholdLiquidity: {
          signal: "no_excess_or_shortfall_reported",
          excessLiquidityRaw: "0",
          shortfallRaw: "0"
        },
        liquidationThresholdHealthFactor: {
          status: "not_computed",
          ratioDecimal: null,
          calculationBoundary: "aggregate_liquidity_difference_is_not_a_ratio"
        }
      }
    });
  });

  it("fails closed when the injected observation clock is invalid", async () => {
    const fake = createFakeClient();
    const reader = createVenusHealthReader({
      client: fake.client,
      now: () => new Date(Number.NaN)
    });

    const result = await reader.getAccountRiskSnapshot(request());

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "incompatible_response",
      stage: "request",
      provenance: null
    });
    expect(fake.getChainId).not.toHaveBeenCalled();
  });
});
