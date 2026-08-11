import { describe, expect, it } from "vitest";

import {
  calculatePancakeV3LiquidityQuote,
  PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION,
  PANCAKE_V3_MAX_SQRT_RATIO,
  PANCAKE_V3_MAX_TICK,
  PANCAKE_V3_MIN_SQRT_RATIO,
  PANCAKE_V3_MIN_TICK,
  type PancakeV3LiquidityQuote,
  type PancakeV3LiquidityQuoteInput,
  type PancakeV3LiquidityQuoteIssueCode
} from "./pancake-v3-liquidity-quote";

const Q96 = "79228162514264337593543950336";
const TICK_NEGATIVE_120_SQRT = "78754240422856966435523493930";
const TICK_POSITIVE_120_SQRT = "79704936542881920863903188246";
const UINT256_MAX =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const UINT256_OVERFLOW =
  "115792089237316195423570985008687907853269984665640564039457584007913129639936";

function fixture(
  overrides: Partial<PancakeV3LiquidityQuoteInput> = {}
): PancakeV3LiquidityQuoteInput {
  return {
    schemaVersion: 2,
    sqrtPriceX96: Q96,
    currentTick: 0,
    tickLower: -120,
    tickUpper: 120,
    amount0Desired: "1000000000000000000",
    amount1Desired: "2000000000000000000",
    maxSlippageBps: 50,
    ...overrides
  };
}

function quoted(input: unknown = fixture()): Readonly<PancakeV3LiquidityQuote> {
  const result = calculatePancakeV3LiquidityQuote(input);
  expect(result.status).toBe("quoted");
  if (result.status !== "quoted") {
    throw new Error(`Expected quote, received ${JSON.stringify(result.issues)}`);
  }
  return result.quote;
}

function expectBlocked(
  input: unknown,
  code: PancakeV3LiquidityQuoteIssueCode,
  path?: string
): void {
  const result = calculatePancakeV3LiquidityQuote(input);
  expect(result.status).toBe("blocked");
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code, ...(path === undefined ? {} : { path }) })
    ])
  );
  expect(result.quote).toBeNull();
}

describe("calculatePancakeV3LiquidityQuote", () => {
  it("matches an official SDK 3.10.1 in-range golden vector exactly", () => {
    // Generated independently with Pool, Position.fromAmounts(useFullPrecision: false),
    // Position.mintAmounts, and Position.mintAmountsWithSlippage from the published package.
    const quote = quoted();

    expect(quote.tickRatios).toEqual({
      lowerSqrtPriceX96: TICK_NEGATIVE_120_SQRT,
      upperSqrtPriceX96: TICK_POSITIVE_120_SQRT
    });
    expect(quote.positionState).toBe("in_range");
    expect(quote.liquidityCalculation).toEqual({
      preliminaryFromCapitalRaw: "167175499835819766909",
      recomputedFromCalldataAtObservedPriceRaw: "167175499835819766909",
      exactMatchRequired: true
    });
    expect(quote.calldataAmounts).toEqual({
      amount0DesiredMaximumRaw: "1000000000000000000",
      amount1DesiredMaximumRaw: "1000000000000000000",
      capital0NotSubmittedRaw: "0",
      capital1NotSubmittedRaw: "1000000000000000000"
    });
    expect(quote.slippageMinimums).toEqual({
      amount0Raw: "583622018870502158",
      amount1Raw: "581537516819099282",
      maxSlippageBps: 50,
      lowerCounterfactualSqrtPriceX96: "79029843899059723247256258061",
      upperCounterfactualSqrtPriceX96: "79425985949584624389260073348"
    });
  });

  it("matches a large asymmetric official SDK vector without floating-point loss", () => {
    const quote = quoted(
      fixture({
        sqrtPriceX96: "146833747148999714326655770475",
        currentTick: 12_340,
        tickLower: 12_000,
        tickUpper: 12_600,
        amount0Desired: "123456789012345678901234567890",
        amount1Desired: "98765432109876543210987654321",
        maxSlippageBps: 73
      })
    );

    expect(quote.liquidityCalculation).toEqual({
      preliminaryFromCapitalRaw: "3161677377722058758278199277156",
      recomputedFromCalldataAtObservedPriceRaw: "3161677377722058758278199277156",
      exactMatchRequired: true
    });
    expect(quote.calldataAmounts).toEqual({
      amount0DesiredMaximumRaw: "22032976786880197849214189137",
      amount1DesiredMaximumRaw: "98765432109876543210987654321",
      capital0NotSubmittedRaw: "101423812225465481052020378753",
      capital1NotSubmittedRaw: "0"
    });
    expect(quote.slippageMinimums).toEqual({
      amount0Raw: "15840073831220804025714544367",
      amount1Raw: "77338920009335411800460998830",
      maxSlippageBps: 73,
      lowerCounterfactualSqrtPriceX96: "146296822289184128910644427878",
      upperCounterfactualSqrtPriceX96: "147368715783641275924131222437"
    });
  });

  it("matches SDK rounding for a price strictly inside its current tick", () => {
    const quote = quoted(
      fixture({
        sqrtPriceX96: "79228162514264337593667407125",
        amount0Desired: "1234567890123456789",
        amount1Desired: "987654321098765432",
        maxSlippageBps: 37
      })
    );

    expect(quote.liquidityCalculation.preliminaryFromCapitalRaw).toBe("165111604794693343783");
    expect(quote.calldataAmounts).toMatchObject({
      amount0DesiredMaximumRaw: "987654321098765432",
      amount1DesiredMaximumRaw: "987654321098765432"
    });
    expect(quote.slippageMinimums).toMatchObject({
      amount0Raw: "683042888801111176",
      amount1Raw: "681914781070583656"
    });
  });

  it("supports exact single-sided token0 below range", () => {
    const quote = quoted(
      fixture({
        sqrtPriceX96: "78439868342809377387252074393",
        currentTick: -200,
        amount0Desired: "1000000000000000000",
        amount1Desired: "0"
      })
    );

    expect(quote.positionState).toBe("below_range");
    expect(quote.liquidityCalculation).toEqual({
      preliminaryFromCapitalRaw: "83336999957657038083",
      recomputedFromCalldataAtObservedPriceRaw: "83336999957657038083",
      exactMatchRequired: true
    });
    expect(quote.calldataAmounts).toEqual({
      amount0DesiredMaximumRaw: "1000000000000000000",
      amount1DesiredMaximumRaw: "0",
      capital0NotSubmittedRaw: "0",
      capital1NotSubmittedRaw: "0"
    });
    expect(quote.slippageMinimums.amount0Raw).toBe("1000000000000000000");
    expect(quote.slippageMinimums.amount1Raw).toBe("0");
  });

  it("supports exact single-sided token1 above range", () => {
    const quote = quoted(
      fixture({
        sqrtPriceX96: "80024378775772204256025656563",
        currentTick: 200,
        amount0Desired: "0",
        amount1Desired: "1000000000000000000"
      })
    );

    expect(quote.positionState).toBe("above_range");
    expect(quote.liquidityCalculation).toEqual({
      preliminaryFromCapitalRaw: "83336999957657038083",
      recomputedFromCalldataAtObservedPriceRaw: "83336999957657038083",
      exactMatchRequired: true
    });
    expect(quote.calldataAmounts).toEqual({
      amount0DesiredMaximumRaw: "0",
      amount1DesiredMaximumRaw: "1000000000000000000",
      capital0NotSubmittedRaw: "0",
      capital1NotSubmittedRaw: "0"
    });
    expect(quote.slippageMinimums.amount0Raw).toBe("0");
    expect(quote.slippageMinimums.amount1Raw).toBe("1000000000000000000");
  });

  it("rejects zero or unusable single-sided inputs instead of returning a zero quote", () => {
    expectBlocked(fixture({ amount0Desired: "0", amount1Desired: "0" }), "DESIRED_AMOUNTS_ZERO");
    expectBlocked(fixture({ amount0Desired: "0" }), "ZERO_LIQUIDITY");
    expectBlocked(
      fixture({
        sqrtPriceX96: "78439868342809377387252074393",
        currentTick: -200,
        amount0Desired: "0",
        amount1Desired: "1000000000000000000"
      }),
      "ZERO_LIQUIDITY"
    );
  });

  it("accepts the full TickMath range and exposes both exact boundary ratios", () => {
    const quote = quoted(
      fixture({
        tickLower: PANCAKE_V3_MIN_TICK,
        tickUpper: PANCAKE_V3_MAX_TICK,
        amount0Desired: "1000000000000000000",
        amount1Desired: "1000000000000000000"
      })
    );

    expect(quote.tickRatios).toEqual({
      lowerSqrtPriceX96: PANCAKE_V3_MIN_SQRT_RATIO,
      upperSqrtPriceX96: PANCAKE_V3_MAX_SQRT_RATIO
    });
    expect(quote.boundaries.maximumSqrtPriceX96Exclusive).toBe(PANCAKE_V3_MAX_SQRT_RATIO);
  });

  it("uses a half-open current-tick interval and exact TickMath price bounds", () => {
    expectBlocked(
      fixture({ sqrtPriceX96: "79232123823359799118286999568" }),
      "SQRT_PRICE_TICK_MISMATCH",
      "sqrtPriceX96"
    );
    expectBlocked(
      fixture({ sqrtPriceX96: (BigInt(PANCAKE_V3_MIN_SQRT_RATIO) - 1n).toString() }),
      "SQRT_PRICE_OUT_OF_BOUNDS"
    );
    expectBlocked(fixture({ sqrtPriceX96: PANCAKE_V3_MAX_SQRT_RATIO }), "SQRT_PRICE_OUT_OF_BOUNDS");
    expectBlocked(fixture({ currentTick: PANCAKE_V3_MAX_TICK }), "INPUT_SCHEMA_INVALID");
  });

  it("rejects invalid tick order, bounds, fractions, and non-numeric tick values", () => {
    expectBlocked(fixture({ tickLower: 120, tickUpper: -120 }), "TICK_ORDER_INVALID");
    expectBlocked(fixture({ tickLower: PANCAKE_V3_MIN_TICK - 1 }), "INPUT_SCHEMA_INVALID");
    expectBlocked(fixture({ tickUpper: PANCAKE_V3_MAX_TICK + 1 }), "INPUT_SCHEMA_INVALID");
    expectBlocked(fixture({ currentTick: 0.5 }), "INPUT_SCHEMA_INVALID");
    expectBlocked({ ...fixture(), currentTick: "0" }, "INPUT_SCHEMA_INVALID");
  });

  it("rejects non-canonical, overflowing, and non-integer financial input", () => {
    expectBlocked(fixture({ amount0Desired: "01" }), "INPUT_SCHEMA_INVALID");
    expectBlocked(fixture({ amount0Desired: "1.0" }), "INPUT_SCHEMA_INVALID");
    expectBlocked(fixture({ amount0Desired: "1e18" }), "INPUT_SCHEMA_INVALID");
    expectBlocked(fixture({ amount0Desired: "-1" }), "INPUT_SCHEMA_INVALID");
    expectBlocked(fixture({ amount0Desired: UINT256_OVERFLOW }), "INPUT_SCHEMA_INVALID");
    expectBlocked({ ...fixture(), amount0Desired: 1_000_000 }, "INPUT_SCHEMA_INVALID");
  });

  it("preserves max uint256 exactly when it is not the limiting side", () => {
    const quote = quoted(
      fixture({ amount0Desired: UINT256_MAX, amount1Desired: "1000000000000000000" })
    );

    expect(quote.input.amount0Desired).toBe(UINT256_MAX);
    expect(quote.calldataAmounts.amount0DesiredMaximumRaw).toBe("1000000000000000000");
    expect(quote.calldataAmounts.capital0NotSubmittedRaw).toBe(
      (BigInt(UINT256_MAX) - 1_000_000_000_000_000_000n).toString()
    );
  });

  it("blocks max uint256 inputs when selected liquidity exceeds the onchain uint128 type", () => {
    expectBlocked(
      fixture({ amount0Desired: UINT256_MAX, amount1Desired: UINT256_MAX }),
      "LIQUIDITY_EXCEEDS_UINT128",
      "liquidityCalculation.preliminaryFromCapitalRaw"
    );
  });

  it("blocks a non-selected calldata candidate that Pancake periphery would downcast first", () => {
    // This vector produces selected liquidity == uint128 max, while the token0 candidate is
    // 2,371,354,335,906,870 units larger. LiquidityAmounts evaluates and downcasts both
    // in-range candidates before choosing the minimum, so an SDK-only min() would be unsafe.
    expectBlocked(
      fixture({
        sqrtPriceX96: "9393197851239089313268424701983007247361",
        currentTick: 509_999,
        tickLower: 490_000,
        tickUpper: 510_000,
        amount0Desired: "143497056415560406781775",
        amount1Desired: "25500457449153245677413844733736578012307253620925"
      }),
      "CALLDATA_LIQUIDITY_CANDIDATE_EXCEEDS_UINT128",
      "liquidityCalculation.recomputedFromCalldataAtObservedPriceRaw"
    );
  });

  it("blocks a nonzero pre-round position whose rounded calldata produces zero liquidity", () => {
    expectBlocked(
      fixture({
        sqrtPriceX96: "12728274922838404",
        currentTick: -589_220,
        tickLower: -648_340,
        tickUpper: -535_290,
        amount0Desired: "6000000000000",
        amount1Desired: "100000000000000",
        maxSlippageBps: 50
      }),
      "CALLDATA_ZERO_LIQUIDITY",
      "liquidityCalculation.recomputedFromCalldataAtObservedPriceRaw"
    );
  });

  it("blocks divergent preliminary and router liquidity until execution fields are unambiguous", () => {
    expectBlocked(
      fixture({
        sqrtPriceX96: "12728274922838404",
        currentTick: -589_220,
        tickLower: -648_340,
        tickUpper: -535_290,
        amount0Desired: "117000000000000",
        amount1Desired: "100000000000000",
        maxSlippageBps: 50
      }),
      "CALLDATA_LIQUIDITY_DRIFT",
      "liquidityCalculation.recomputedFromCalldataAtObservedPriceRaw"
    );
  });

  it("enforces the complete slippage domain and clamps the 100 percent lower price", () => {
    expectBlocked(fixture({ maxSlippageBps: -1 }), "INPUT_SCHEMA_INVALID");
    expectBlocked(fixture({ maxSlippageBps: 10_001 }), "INPUT_SCHEMA_INVALID");
    expectBlocked(fixture({ maxSlippageBps: 0.5 }), "INPUT_SCHEMA_INVALID");

    const quote = quoted(fixture({ maxSlippageBps: 10_000 }));
    expect(quote.slippageMinimums.lowerCounterfactualSqrtPriceX96).toBe(
      (BigInt(PANCAKE_V3_MIN_SQRT_RATIO) + 1n).toString()
    );
    expect(quote.slippageMinimums.amount0Raw).toBe("0");
    expect(quote.slippageMinimums.amount1Raw).toBe("0");
  });

  it("produces monotonically non-increasing minimums as slippage widens", () => {
    const zero = quoted(fixture({ maxSlippageBps: 0 }));
    const fifty = quoted(fixture({ maxSlippageBps: 50 }));
    const hundred = quoted(fixture({ maxSlippageBps: 100 }));

    expect(zero.slippageMinimums.amount0Raw).toBe(zero.calldataAmounts.amount0DesiredMaximumRaw);
    expect(zero.slippageMinimums.amount1Raw).toBe(zero.calldataAmounts.amount1DesiredMaximumRaw);
    expect(BigInt(zero.slippageMinimums.amount0Raw)).toBeGreaterThanOrEqual(
      BigInt(fifty.slippageMinimums.amount0Raw)
    );
    expect(BigInt(fifty.slippageMinimums.amount0Raw)).toBeGreaterThanOrEqual(
      BigInt(hundred.slippageMinimums.amount0Raw)
    );
    expect(BigInt(zero.slippageMinimums.amount1Raw)).toBeGreaterThanOrEqual(
      BigInt(fifty.slippageMinimums.amount1Raw)
    );
    expect(BigInt(fifty.slippageMinimums.amount1Raw)).toBeGreaterThanOrEqual(
      BigInt(hundred.slippageMinimums.amount1Raw)
    );
  });

  it("rejects hostile extra fields and bounds issue output", () => {
    expectBlocked(
      {
        ...fixture(),
        poolAddress: "0x0000000000000000000000000000000000000001"
      },
      "INPUT_OBJECT_TOO_WIDE",
      "input"
    );

    const result = calculatePancakeV3LiquidityQuote({
      schemaVersion: 2,
      one: true,
      two: true,
      three: true,
      four: true,
      five: true,
      six: true,
      seven: true,
      eight: true
    });
    expect(result.status).toBe("blocked");
    expect(result.issues).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("poolAddress");
  });

  it("returns deeply immutable JSON-safe data with explicit provenance and scope", () => {
    const result = calculatePancakeV3LiquidityQuote(fixture());
    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") throw new Error("Expected quote.");

    expect(result.quote.methodology.version).toBe(PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION);
    expect(result.quote.schemaVersion).toBe(2);
    expect(result.quote.methodology.sdkVersion).toBe("3.10.1");
    expect(result.quote.methodology.transitiveMathPackages).toEqual([
      {
        package: "@pancakeswap/sdk",
        version: "5.9.1",
        artifactIntegrity:
          "sha512-cx09y009ZIWaJM0lBRCpmjErjQJJc0kjbdYaNvs6PIa9WL6fXkPTnNyAg4EbM8eHlvqKzqF4wDES09Pf3FdFcg=="
      },
      {
        package: "@pancakeswap/swap-sdk-core",
        version: "1.6.0",
        artifactIntegrity:
          "sha512-NGMqdizZart6CPPxg3PJuCLeTHOTtoWh6mwe9wLACI3C+HvngJyeUNHlNiKBmzKPIsuWXx0HVVbSYiKPI9YCzw=="
      }
    ]);
    expect(result.quote.methodology.officialSources).toHaveLength(5);
    expect(result.quote.methodology.officialSources.join("\n")).not.toContain("/blob/main/");
    expect(result.quote.methodology.officialSources).toEqual(
      expect.arrayContaining([expect.stringContaining("986847948755cba528324d41be19480731c36c2a")])
    );
    expect(result.quote.provenance).toMatchObject({
      inputs: "caller_supplied_unverified",
      chainId: null,
      chainBindingVerified: false,
      livePoolReadPerformed: false,
      poolIdentityVerified: false,
      observationBlock: null,
      observationTimestamp: null
    });
    expect(result.quote.boundaries.tickSpacingVerified).toBe(false);
    expect(result.quote.executionReady).toBe(false);
    expect(result.quote.scopeBoundary).toContain("not a live quote");
    expect(result.quote.scopeBoundary).toContain("transaction");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.quote)).toBe(true);
    expect(Object.isFrozen(result.quote.slippageMinimums)).toBe(true);
    expect(Object.isFrozen(result.quote.methodology.officialSources)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toMatch(/\d+n\b/);
  });
});
