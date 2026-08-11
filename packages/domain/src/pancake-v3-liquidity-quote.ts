import { z } from "zod";

/**
 * Primary methodology sources checked 2026-08-11 UTC:
 *
 * - Published Pancake V3 SDK 3.10.1 metadata and immutable package artifact (MIT):
 *   https://registry.npmjs.org/@pancakeswap/v3-sdk/3.10.1
 *   https://unpkg.com/@pancakeswap/v3-sdk@3.10.1/dist/index.mjs
 * - Pancake V3 periphery liquidity calculation and uint128 boundary:
 *   https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/projects/v3-periphery/contracts/libraries/LiquidityAmounts.sol
 * - Pancake V3 TickMath bounds and exact Q64.96 tick conversion:
 *   https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/projects/v3-core/contracts/libraries/TickMath.sol
 * - Pancake V3 amount-delta rounding:
 *   https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/projects/v3-core/contracts/libraries/SqrtPriceMath.sol
 *
 * The SDK artifact is the canonical source for the client semantics reproduced here:
 * router-compatible (`useFullPrecision: false`) liquidity, round-up mint amounts,
 * counterfactual slippage prices, and the second router-compatible liquidity pass used by
 * `Position.mintAmountsWithSlippage`. The contracts are the canonical source for ABI bounds.
 */

export const PANCAKE_V3_LIQUIDITY_QUOTE_SCHEMA_VERSION = 2 as const;
export const PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION =
  "pancakeswap-v3-sdk-3.10.1-router-compatible-v2" as const;
export const PANCAKE_V3_MIN_TICK = -887_272 as const;
export const PANCAKE_V3_MAX_TICK = 887_272 as const;
export const PANCAKE_V3_MIN_SQRT_RATIO = "4295128739" as const;
export const PANCAKE_V3_MAX_SQRT_RATIO =
  "1461446703485210103287273052203988822378723970342" as const;

const Q32 = 1n << 32n;
const Q96 = 1n << 96n;
const UINT128_MAX = (1n << 128n) - 1n;
const UINT160_MAX = (1n << 160n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const MIN_SQRT_RATIO = BigInt(PANCAKE_V3_MIN_SQRT_RATIO);
const MAX_SQRT_RATIO = BigInt(PANCAKE_V3_MAX_SQRT_RATIO);
const BPS_DENOMINATOR = 10_000n;
const MAX_INPUT_KEYS = 8;
const MAX_SCHEMA_ISSUES = 16;

const OFFICIAL_SOURCES = [
  "https://registry.npmjs.org/@pancakeswap/v3-sdk/3.10.1",
  "https://unpkg.com/@pancakeswap/v3-sdk@3.10.1/dist/index.mjs",
  "https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/projects/v3-periphery/contracts/libraries/LiquidityAmounts.sol",
  "https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/projects/v3-core/contracts/libraries/TickMath.sol",
  "https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/projects/v3-core/contracts/libraries/SqrtPriceMath.sol"
] as const;

function canonicalUnsignedDecimalSchema(maximum: bigint) {
  return z
    .string()
    .min(1)
    .max(78)
    .regex(/^(0|[1-9][0-9]*)$/, "Expected a canonical unsigned decimal integer.")
    .refine((value) => {
      try {
        return BigInt(value) <= maximum;
      } catch {
        return false;
      }
    }, "Unsigned decimal integer exceeds its protocol type.");
}

export const pancakeV3LiquidityQuoteInputSchema = z.strictObject({
  schemaVersion: z.literal(PANCAKE_V3_LIQUIDITY_QUOTE_SCHEMA_VERSION),
  sqrtPriceX96: canonicalUnsignedDecimalSchema(UINT160_MAX),
  currentTick: z
    .number()
    .int()
    .safe()
    .min(PANCAKE_V3_MIN_TICK)
    .max(PANCAKE_V3_MAX_TICK - 1),
  tickLower: z.number().int().safe().min(PANCAKE_V3_MIN_TICK).max(PANCAKE_V3_MAX_TICK),
  tickUpper: z.number().int().safe().min(PANCAKE_V3_MIN_TICK).max(PANCAKE_V3_MAX_TICK),
  amount0Desired: canonicalUnsignedDecimalSchema(UINT256_MAX),
  amount1Desired: canonicalUnsignedDecimalSchema(UINT256_MAX),
  maxSlippageBps: z.number().int().safe().min(0).max(10_000)
});

export type PancakeV3LiquidityQuoteInput = z.infer<typeof pancakeV3LiquidityQuoteInputSchema>;

export type PancakeV3LiquidityQuoteIssueCode =
  | "INPUT_SCHEMA_INVALID"
  | "INPUT_OBJECT_TOO_WIDE"
  | "TICK_ORDER_INVALID"
  | "SQRT_PRICE_OUT_OF_BOUNDS"
  | "SQRT_PRICE_TICK_MISMATCH"
  | "DESIRED_AMOUNTS_ZERO"
  | "ZERO_LIQUIDITY"
  | "LIQUIDITY_EXCEEDS_UINT128"
  | "CALLDATA_ZERO_LIQUIDITY"
  | "CALLDATA_LIQUIDITY_DRIFT"
  | "CALLDATA_LIQUIDITY_CANDIDATE_EXCEEDS_UINT128"
  | "ARITHMETIC_INVARIANT_VIOLATION";

export interface PancakeV3LiquidityQuoteIssue {
  readonly code: PancakeV3LiquidityQuoteIssueCode;
  readonly path: string;
  readonly message: string;
}

type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export interface PancakeV3LiquidityQuote {
  readonly schemaVersion: 2;
  readonly methodology: {
    readonly id: "pancakeswap_v3_mint_or_increase_liquidity";
    readonly version: typeof PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION;
    readonly sdkPackage: "@pancakeswap/v3-sdk";
    readonly sdkVersion: "3.10.1";
    readonly sdkArtifactIntegrity: "sha512-E3mSF5kqqdpzCbbwQfDr1z6ixWFdS/S4TuUQvCYn6qcJOqWGVOXrVkm0HnfvGmRFHKtFQwc/0DHDR6MQDMAwdw==";
    readonly transitiveMathPackages: readonly (
      | {
          readonly package: "@pancakeswap/sdk";
          readonly version: "5.9.1";
          readonly artifactIntegrity: "sha512-cx09y009ZIWaJM0lBRCpmjErjQJJc0kjbdYaNvs6PIa9WL6fXkPTnNyAg4EbM8eHlvqKzqF4wDES09Pf3FdFcg==";
        }
      | {
          readonly package: "@pancakeswap/swap-sdk-core";
          readonly version: "1.6.0";
          readonly artifactIntegrity: "sha512-NGMqdizZart6CPPxg3PJuCLeTHOTtoWh6mwe9wLACI3C+HvngJyeUNHlNiKBmzKPIsuWXx0HVVbSYiKPI9YCzw==";
        }
    )[];
    readonly sdkLiquidityPrecision: "router_compatible_useFullPrecision_false";
    readonly checkedAt: "2026-08-11";
    readonly officialSources: readonly string[];
  };
  readonly provenance: {
    readonly inputs: "caller_supplied_unverified";
    readonly chainId: null;
    readonly chainBindingVerified: false;
    readonly livePoolReadPerformed: false;
    readonly poolIdentityVerified: false;
    readonly observationBlock: null;
    readonly observationTimestamp: null;
  };
  readonly input: PancakeV3LiquidityQuoteInput;
  readonly positionState: "below_range" | "in_range" | "above_range";
  readonly tickRatios: {
    readonly lowerSqrtPriceX96: string;
    readonly upperSqrtPriceX96: string;
  };
  readonly liquidityCalculation: {
    readonly preliminaryFromCapitalRaw: string;
    readonly recomputedFromCalldataAtObservedPriceRaw: string;
    readonly exactMatchRequired: true;
  };
  readonly calldataAmounts: {
    readonly amount0DesiredMaximumRaw: string;
    readonly amount1DesiredMaximumRaw: string;
    readonly capital0NotSubmittedRaw: string;
    readonly capital1NotSubmittedRaw: string;
  };
  readonly slippageMinimums: {
    readonly amount0Raw: string;
    readonly amount1Raw: string;
    readonly maxSlippageBps: number;
    readonly lowerCounterfactualSqrtPriceX96: string;
    readonly upperCounterfactualSqrtPriceX96: string;
  };
  readonly rounding: {
    readonly liquidityAmount0: string;
    readonly liquidityAmount1: string;
    readonly liquiditySelection: string;
    readonly calldataDesiredMaximums: string;
    readonly slippageSqrtRatios: string;
    readonly slippageMinimums: string;
  };
  readonly boundaries: {
    readonly minimumTickInclusive: number;
    readonly maximumTickInclusive: number;
    readonly currentTickMaximumInclusive: number;
    readonly minimumSqrtPriceX96Inclusive: string;
    readonly maximumSqrtPriceX96Exclusive: string;
    readonly maximumUint128Liquidity: string;
    readonly maximumUint256Amount: string;
    readonly slippageBpsMinimumInclusive: 0;
    readonly slippageBpsMaximumInclusive: 10_000;
    readonly tickSpacingVerified: false;
  };
  readonly limitations: readonly string[];
  readonly scopeBoundary: string;
  readonly executionReady: false;
}

export type PancakeV3LiquidityQuoteResult =
  | {
      readonly status: "quoted";
      readonly quote: DeepReadonly<PancakeV3LiquidityQuote>;
      readonly issues: readonly PancakeV3LiquidityQuoteIssue[];
    }
  | {
      readonly status: "blocked";
      readonly quote: null;
      readonly issues: readonly PancakeV3LiquidityQuoteIssue[];
    };

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function blocked(issues: readonly PancakeV3LiquidityQuoteIssue[]): PancakeV3LiquidityQuoteResult {
  return deepFreeze({ status: "blocked" as const, quote: null, issues: [...issues] });
}

function issue(
  code: PancakeV3LiquidityQuoteIssueCode,
  path: string,
  message: string
): PancakeV3LiquidityQuoteIssue {
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function zodPath(path: readonly PropertyKey[]): string {
  const rendered = path
    .map((segment) => (typeof segment === "symbol" ? (segment.description ?? "symbol") : segment))
    .join(".");
  return rendered.length === 0 ? "input" : rendered;
}

function schemaIssues(error: z.ZodError): PancakeV3LiquidityQuoteIssue[] {
  return error.issues
    .slice(0, MAX_SCHEMA_ISSUES)
    .map((entry) =>
      issue(
        "INPUT_SCHEMA_INVALID",
        zodPath(entry.path),
        entry.code === "unrecognized_keys"
          ? "Unknown input fields are not accepted."
          : "Input does not satisfy the strict liquidity-quote schema."
      )
    );
}

function mulShift128(value: bigint, multiplier: bigint): bigint {
  return (value * multiplier) >> 128n;
}

/** Exact Q64.96 TickMath conversion from the published Pancake V3 SDK 3.10.1. */
function sqrtRatioAtTick(tick: number): bigint {
  const absoluteTick = tick < 0 ? -tick : tick;
  let ratio =
    (absoluteTick & 1) !== 0
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;
  if ((absoluteTick & 2) !== 0) ratio = mulShift128(ratio, 0xfff97272373d413259a46990580e213an);
  if ((absoluteTick & 4) !== 0) ratio = mulShift128(ratio, 0xfff2e50f5f656932ef12357cf3c7fdccn);
  if ((absoluteTick & 8) !== 0) ratio = mulShift128(ratio, 0xffe5caca7e10e4e61c3624eaa0941cd0n);
  if ((absoluteTick & 16) !== 0) ratio = mulShift128(ratio, 0xffcb9843d60f6159c9db58835c926644n);
  if ((absoluteTick & 32) !== 0) ratio = mulShift128(ratio, 0xff973b41fa98c081472e6896dfb254c0n);
  if ((absoluteTick & 64) !== 0) ratio = mulShift128(ratio, 0xff2ea16466c96a3843ec78b326b52861n);
  if ((absoluteTick & 128) !== 0) ratio = mulShift128(ratio, 0xfe5dee046a99a2a811c461f1969c3053n);
  if ((absoluteTick & 256) !== 0) ratio = mulShift128(ratio, 0xfcbe86c7900a88aedcffc83b479aa3a4n);
  if ((absoluteTick & 512) !== 0) ratio = mulShift128(ratio, 0xf987a7253ac413176f2b074cf7815e54n);
  if ((absoluteTick & 1_024) !== 0) ratio = mulShift128(ratio, 0xf3392b0822b70005940c7a398e4b70f3n);
  if ((absoluteTick & 2_048) !== 0) ratio = mulShift128(ratio, 0xe7159475a2c29b7443b29c7fa6e889d9n);
  if ((absoluteTick & 4_096) !== 0) ratio = mulShift128(ratio, 0xd097f3bdfd2022b8845ad8f792aa5825n);
  if ((absoluteTick & 8_192) !== 0) ratio = mulShift128(ratio, 0xa9f746462d870fdf8a65dc1f90e061e5n);
  if ((absoluteTick & 16_384) !== 0)
    ratio = mulShift128(ratio, 0x70d869a156d2a1b890bb3df62baf32f7n);
  if ((absoluteTick & 32_768) !== 0)
    ratio = mulShift128(ratio, 0x31be135f97d08fd981231505542fcfa6n);
  if ((absoluteTick & 65_536) !== 0) ratio = mulShift128(ratio, 0x9aa508b5b7a84e1c677de54f3e99bc9n);
  if ((absoluteTick & 131_072) !== 0) ratio = mulShift128(ratio, 0x5d6af8dedb81196699c329225ee604n);
  if ((absoluteTick & 262_144) !== 0) ratio = mulShift128(ratio, 0x2216e584f5fa1ea926041bedfe98n);
  if ((absoluteTick & 524_288) !== 0) ratio = mulShift128(ratio, 0x48a170391f7dc42444e8fa2n);
  if (tick > 0) ratio = UINT256_MAX / ratio;
  return ratio % Q32 === 0n ? ratio / Q32 : ratio / Q32 + 1n;
}

function divideRoundingUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator % denominator === 0n ? quotient : quotient + 1n;
}

function amount0Delta(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): bigint {
  const lower = sqrtRatioAX96 < sqrtRatioBX96 ? sqrtRatioAX96 : sqrtRatioBX96;
  const upper = sqrtRatioAX96 < sqrtRatioBX96 ? sqrtRatioBX96 : sqrtRatioAX96;
  const numerator1 = liquidity << 96n;
  const firstRounded = divideRoundingUp(numerator1 * (upper - lower), upper);
  return divideRoundingUp(firstRounded, lower);
}

function amount1Delta(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): bigint {
  const lower = sqrtRatioAX96 < sqrtRatioBX96 ? sqrtRatioAX96 : sqrtRatioBX96;
  const upper = sqrtRatioAX96 < sqrtRatioBX96 ? sqrtRatioBX96 : sqrtRatioAX96;
  return divideRoundingUp(liquidity * (upper - lower), Q96);
}

function liquidityForAmount0(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  amount0: bigint
): bigint {
  const lower = sqrtRatioAX96 < sqrtRatioBX96 ? sqrtRatioAX96 : sqrtRatioBX96;
  const upper = sqrtRatioAX96 < sqrtRatioBX96 ? sqrtRatioBX96 : sqrtRatioAX96;
  const intermediate = (lower * upper) / Q96;
  return (amount0 * intermediate) / (upper - lower);
}

function liquidityForAmount1(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  amount1: bigint
): bigint {
  const lower = sqrtRatioAX96 < sqrtRatioBX96 ? sqrtRatioAX96 : sqrtRatioBX96;
  const upper = sqrtRatioAX96 < sqrtRatioBX96 ? sqrtRatioBX96 : sqrtRatioAX96;
  return (amount1 * Q96) / (upper - lower);
}

function liquidityForAmounts(
  sqrtPriceX96: bigint,
  lowerSqrtPriceX96: bigint,
  upperSqrtPriceX96: bigint,
  amount0: bigint,
  amount1: bigint
): bigint {
  const candidates = liquidityCandidatesForAmounts(
    sqrtPriceX96,
    lowerSqrtPriceX96,
    upperSqrtPriceX96,
    amount0,
    amount1
  );
  return candidates.length === 1 || candidates[0] < candidates[1] ? candidates[0] : candidates[1];
}

function liquidityCandidatesForAmounts(
  sqrtPriceX96: bigint,
  lowerSqrtPriceX96: bigint,
  upperSqrtPriceX96: bigint,
  amount0: bigint,
  amount1: bigint
): readonly [bigint] | readonly [bigint, bigint] {
  if (sqrtPriceX96 <= lowerSqrtPriceX96) {
    return [liquidityForAmount0(lowerSqrtPriceX96, upperSqrtPriceX96, amount0)];
  }
  if (sqrtPriceX96 < upperSqrtPriceX96) {
    const liquidity0 = liquidityForAmount0(sqrtPriceX96, upperSqrtPriceX96, amount0);
    const liquidity1 = liquidityForAmount1(lowerSqrtPriceX96, sqrtPriceX96, amount1);
    return [liquidity0, liquidity1];
  }
  return [liquidityForAmount1(lowerSqrtPriceX96, upperSqrtPriceX96, amount1)];
}

function amountsForLiquidityAtTick(
  currentTick: number,
  tickLower: number,
  tickUpper: number,
  sqrtPriceX96: bigint,
  lowerSqrtPriceX96: bigint,
  upperSqrtPriceX96: bigint,
  liquidity: bigint
): readonly [bigint, bigint] {
  if (currentTick < tickLower) {
    return [amount0Delta(lowerSqrtPriceX96, upperSqrtPriceX96, liquidity), 0n];
  }
  if (currentTick < tickUpper) {
    return [
      amount0Delta(sqrtPriceX96, upperSqrtPriceX96, liquidity),
      amount1Delta(lowerSqrtPriceX96, sqrtPriceX96, liquidity)
    ];
  }
  return [0n, amount1Delta(lowerSqrtPriceX96, upperSqrtPriceX96, liquidity)];
}

function amountsForLiquidityAtSqrtPrice(
  sqrtPriceX96: bigint,
  lowerSqrtPriceX96: bigint,
  upperSqrtPriceX96: bigint,
  liquidity: bigint
): readonly [bigint, bigint] {
  if (sqrtPriceX96 <= lowerSqrtPriceX96) {
    return [amount0Delta(lowerSqrtPriceX96, upperSqrtPriceX96, liquidity), 0n];
  }
  if (sqrtPriceX96 < upperSqrtPriceX96) {
    return [
      amount0Delta(sqrtPriceX96, upperSqrtPriceX96, liquidity),
      amount1Delta(lowerSqrtPriceX96, sqrtPriceX96, liquidity)
    ];
  }
  return [0n, amount1Delta(lowerSqrtPriceX96, upperSqrtPriceX96, liquidity)];
}

function integerSquareRoot(value: bigint): bigint {
  if (value < 0n) throw new Error("Square root input cannot be negative.");
  if (value <= 3n) return value === 0n ? 0n : 1n;
  let result = value;
  let candidate = value / 2n + 1n;
  while (candidate < result) {
    result = candidate;
    candidate = (value / candidate + candidate) / 2n;
  }
  return result;
}

function ratiosAfterSlippage(
  sqrtPriceX96: bigint,
  maxSlippageBps: number
): readonly [bigint, bigint] {
  const slippage = BigInt(maxSlippageBps);
  const squaredPrice = sqrtPriceX96 * sqrtPriceX96;
  let lower = integerSquareRoot((squaredPrice * (BPS_DENOMINATOR - slippage)) / BPS_DENOMINATOR);
  let upper = integerSquareRoot((squaredPrice * (BPS_DENOMINATOR + slippage)) / BPS_DENOMINATOR);
  if (lower <= MIN_SQRT_RATIO) lower = MIN_SQRT_RATIO + 1n;
  if (upper >= MAX_SQRT_RATIO) upper = MAX_SQRT_RATIO - 1n;
  return [lower, upper];
}

function positionState(
  currentTick: number,
  tickLower: number,
  tickUpper: number
): PancakeV3LiquidityQuote["positionState"] {
  if (currentTick < tickLower) return "below_range";
  if (currentTick < tickUpper) return "in_range";
  return "above_range";
}

/**
 * Computes Pancake V3 mint/increase liquidity amounts without reading a pool or creating calldata.
 * Caller-supplied state is deliberately marked unverified; a server-owned, block-pinned trust layer
 * must bind this result to a reviewed pool before it can inform a permission or wallet request.
 */
export function calculatePancakeV3LiquidityQuote(
  unparsedInput: unknown
): PancakeV3LiquidityQuoteResult {
  if (isRecord(unparsedInput) && Object.keys(unparsedInput).length > MAX_INPUT_KEYS) {
    return blocked([
      issue(
        "INPUT_OBJECT_TOO_WIDE",
        "input",
        `Liquidity-quote input may contain at most ${MAX_INPUT_KEYS} fields.`
      )
    ]);
  }

  const parsed = pancakeV3LiquidityQuoteInputSchema.safeParse(unparsedInput);
  if (!parsed.success) return blocked(schemaIssues(parsed.error));
  const input = parsed.data;
  const issues: PancakeV3LiquidityQuoteIssue[] = [];

  if (input.tickLower >= input.tickUpper) {
    issues.push(
      issue("TICK_ORDER_INVALID", "tickLower", "Lower tick must be strictly below upper tick.")
    );
  }

  const sqrtPriceX96 = BigInt(input.sqrtPriceX96);
  if (sqrtPriceX96 < MIN_SQRT_RATIO || sqrtPriceX96 >= MAX_SQRT_RATIO) {
    issues.push(
      issue(
        "SQRT_PRICE_OUT_OF_BOUNDS",
        "sqrtPriceX96",
        "Sqrt price must be within Pancake V3 TickMath bounds (maximum exclusive)."
      )
    );
  } else {
    const tickSqrtPriceX96 = sqrtRatioAtTick(input.currentTick);
    const nextTickSqrtPriceX96 = sqrtRatioAtTick(input.currentTick + 1);
    if (sqrtPriceX96 < tickSqrtPriceX96 || sqrtPriceX96 >= nextTickSqrtPriceX96) {
      issues.push(
        issue(
          "SQRT_PRICE_TICK_MISMATCH",
          "sqrtPriceX96",
          "Sqrt price is not inside the half-open interval represented by currentTick."
        )
      );
    }
  }

  const amount0Desired = BigInt(input.amount0Desired);
  const amount1Desired = BigInt(input.amount1Desired);
  if (amount0Desired === 0n && amount1Desired === 0n) {
    issues.push(
      issue(
        "DESIRED_AMOUNTS_ZERO",
        "amount0Desired",
        "At least one desired raw token amount must be positive."
      )
    );
  }
  if (issues.length > 0) return blocked(issues);

  const lowerSqrtPriceX96 = sqrtRatioAtTick(input.tickLower);
  const upperSqrtPriceX96 = sqrtRatioAtTick(input.tickUpper);
  const liquidity = liquidityForAmounts(
    sqrtPriceX96,
    lowerSqrtPriceX96,
    upperSqrtPriceX96,
    amount0Desired,
    amount1Desired
  );
  if (liquidity === 0n) {
    return blocked([
      issue(
        "ZERO_LIQUIDITY",
        "amount0Desired",
        "Desired amounts produce zero router-compatible liquidity at this range and price."
      )
    ]);
  }
  if (liquidity > UINT128_MAX) {
    return blocked([
      issue(
        "LIQUIDITY_EXCEEDS_UINT128",
        "liquidityCalculation.preliminaryFromCapitalRaw",
        "Calculated liquidity exceeds the Pancake V3 periphery uint128 boundary."
      )
    ]);
  }

  const [amount0CalldataMaximum, amount1CalldataMaximum] = amountsForLiquidityAtTick(
    input.currentTick,
    input.tickLower,
    input.tickUpper,
    sqrtPriceX96,
    lowerSqrtPriceX96,
    upperSqrtPriceX96,
    liquidity
  );
  if (amount0CalldataMaximum > amount0Desired || amount1CalldataMaximum > amount1Desired) {
    return blocked([
      issue(
        "ARITHMETIC_INVARIANT_VIOLATION",
        "calldataAmounts",
        "Router-compatible rounded amounts unexpectedly exceed desired amounts."
      )
    ]);
  }

  // The SDK intentionally recalculates liquidity from the rounded mint amounts before deriving
  // minimums. Omitting this second pass can create one-unit disagreements with calldata output.
  const minimumBasisCandidates = liquidityCandidatesForAmounts(
    sqrtPriceX96,
    lowerSqrtPriceX96,
    upperSqrtPriceX96,
    amount0CalldataMaximum,
    amount1CalldataMaximum
  );
  if (minimumBasisCandidates.some((candidate) => candidate > UINT128_MAX)) {
    return blocked([
      issue(
        "CALLDATA_LIQUIDITY_CANDIDATE_EXCEEDS_UINT128",
        "liquidityCalculation.recomputedFromCalldataAtObservedPriceRaw",
        "Rounded calldata amounts make Pancake periphery evaluate a liquidity candidate above uint128 before selecting the minimum."
      )
    ]);
  }
  const minimumBasisLiquidity =
    minimumBasisCandidates.length === 1 || minimumBasisCandidates[0] < minimumBasisCandidates[1]
      ? minimumBasisCandidates[0]
      : minimumBasisCandidates[1];
  if (minimumBasisLiquidity === 0n) {
    return blocked([
      issue(
        "CALLDATA_ZERO_LIQUIDITY",
        "liquidityCalculation.recomputedFromCalldataAtObservedPriceRaw",
        "Rounded calldata amounts produce zero router-compatible liquidity and would not create or increase a position."
      )
    ]);
  }
  if (minimumBasisLiquidity !== liquidity) {
    return blocked([
      issue(
        "CALLDATA_LIQUIDITY_DRIFT",
        "liquidityCalculation.recomputedFromCalldataAtObservedPriceRaw",
        "Rounded calldata amounts do not reproduce the preliminary position liquidity exactly; milestone 1 blocks this ambiguous execution expectation."
      )
    ]);
  }
  if (minimumBasisLiquidity > UINT128_MAX) {
    return blocked([
      issue(
        "ARITHMETIC_INVARIANT_VIOLATION",
        "liquidityCalculation.recomputedFromCalldataAtObservedPriceRaw",
        "Minimum calculation basis unexpectedly exceeds uint128."
      )
    ]);
  }

  const [lowerCounterfactualSqrtPriceX96, upperCounterfactualSqrtPriceX96] = ratiosAfterSlippage(
    sqrtPriceX96,
    input.maxSlippageBps
  );
  const [amount0Minimum] = amountsForLiquidityAtSqrtPrice(
    upperCounterfactualSqrtPriceX96,
    lowerSqrtPriceX96,
    upperSqrtPriceX96,
    minimumBasisLiquidity
  );
  const [, amount1Minimum] = amountsForLiquidityAtSqrtPrice(
    lowerCounterfactualSqrtPriceX96,
    lowerSqrtPriceX96,
    upperSqrtPriceX96,
    minimumBasisLiquidity
  );
  if (amount0Minimum > amount0CalldataMaximum || amount1Minimum > amount1CalldataMaximum) {
    return blocked([
      issue(
        "ARITHMETIC_INVARIANT_VIOLATION",
        "slippageMinimums",
        "Slippage minimum unexpectedly exceeds its rounded desired amount."
      )
    ]);
  }

  const quote: PancakeV3LiquidityQuote = {
    schemaVersion: PANCAKE_V3_LIQUIDITY_QUOTE_SCHEMA_VERSION,
    methodology: {
      id: "pancakeswap_v3_mint_or_increase_liquidity",
      version: PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION,
      sdkPackage: "@pancakeswap/v3-sdk",
      sdkVersion: "3.10.1",
      sdkArtifactIntegrity:
        "sha512-E3mSF5kqqdpzCbbwQfDr1z6ixWFdS/S4TuUQvCYn6qcJOqWGVOXrVkm0HnfvGmRFHKtFQwc/0DHDR6MQDMAwdw==",
      transitiveMathPackages: [
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
      ],
      sdkLiquidityPrecision: "router_compatible_useFullPrecision_false",
      checkedAt: "2026-08-11",
      officialSources: [...OFFICIAL_SOURCES]
    },
    provenance: {
      inputs: "caller_supplied_unverified",
      chainId: null,
      chainBindingVerified: false,
      livePoolReadPerformed: false,
      poolIdentityVerified: false,
      observationBlock: null,
      observationTimestamp: null
    },
    input: { ...input },
    positionState: positionState(input.currentTick, input.tickLower, input.tickUpper),
    tickRatios: {
      lowerSqrtPriceX96: lowerSqrtPriceX96.toString(),
      upperSqrtPriceX96: upperSqrtPriceX96.toString()
    },
    liquidityCalculation: {
      preliminaryFromCapitalRaw: liquidity.toString(),
      recomputedFromCalldataAtObservedPriceRaw: minimumBasisLiquidity.toString(),
      exactMatchRequired: true
    },
    calldataAmounts: {
      amount0DesiredMaximumRaw: amount0CalldataMaximum.toString(),
      amount1DesiredMaximumRaw: amount1CalldataMaximum.toString(),
      capital0NotSubmittedRaw: (amount0Desired - amount0CalldataMaximum).toString(),
      capital1NotSubmittedRaw: (amount1Desired - amount1CalldataMaximum).toString()
    },
    slippageMinimums: {
      amount0Raw: amount0Minimum.toString(),
      amount1Raw: amount1Minimum.toString(),
      maxSlippageBps: input.maxSlippageBps,
      lowerCounterfactualSqrtPriceX96: lowerCounterfactualSqrtPriceX96.toString(),
      upperCounterfactualSqrtPriceX96: upperCounterfactualSqrtPriceX96.toString()
    },
    rounding: {
      liquidityAmount0: "floor(amount0 * floor(sqrtA * sqrtB / Q96) / (sqrtB - sqrtA))",
      liquidityAmount1: "floor(amount1 * Q96 / (sqrtB - sqrtA))",
      liquiditySelection:
        "token0 below range; minimum of token0/token1 in range; token1 above range",
      calldataDesiredMaximums:
        "round up each Pancake SqrtPriceMath token delta for the preliminary liquidity; these values are calldata maxima, not realized consumption",
      slippageSqrtRatios:
        "floor integer square root of floor(currentSqrt^2 * (10000 +/- bps) / 10000), then protocol-bound clamp",
      slippageMinimums:
        "recompute router-compatible liquidity from rounded calldata maxima, require an exact match to preliminary liquidity, then round up token0 at the upper counterfactual price and token1 at the lower counterfactual price"
    },
    boundaries: {
      minimumTickInclusive: PANCAKE_V3_MIN_TICK,
      maximumTickInclusive: PANCAKE_V3_MAX_TICK,
      currentTickMaximumInclusive: PANCAKE_V3_MAX_TICK - 1,
      minimumSqrtPriceX96Inclusive: PANCAKE_V3_MIN_SQRT_RATIO,
      maximumSqrtPriceX96Exclusive: PANCAKE_V3_MAX_SQRT_RATIO,
      maximumUint128Liquidity: UINT128_MAX.toString(),
      maximumUint256Amount: UINT256_MAX.toString(),
      slippageBpsMinimumInclusive: 0,
      slippageBpsMaximumInclusive: 10_000,
      tickSpacingVerified: false
    },
    limitations: [
      "Inputs are caller supplied; no block, timestamp, pool, token, fee tier, code identity, or quote source was read or verified.",
      "A trusted caller must bind BSC mainnet chain 56 or BSC testnet chain 97; this chain-independent math primitive does not accept or establish chain identity.",
      "Tick spacing cannot be verified because fee tier and reviewed pool metadata are outside this calculator input.",
      "Calldata desired maxima assume the supplied price remains unchanged; they are deterministic math, not realized token consumption.",
      "Existing position liquidity, fees owed, balances, allowances, gas, price impact, and transaction outcome are outside this calculation."
    ],
    scopeBoundary:
      "This result is math only. It is not a live quote, recommendation, simulation, approval, permission, activation, transaction, or execution authorization.",
    executionReady: false
  };

  return deepFreeze({ status: "quoted" as const, quote, issues: [] as const });
}
