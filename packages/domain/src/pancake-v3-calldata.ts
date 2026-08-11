import {
  decodeFunctionData,
  encodeFunctionData,
  parseAbi,
  toFunctionSelector,
  type Hex
} from "viem";
import { z } from "zod";

import { PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER } from "./lp-activation-intent";

const UINT128_MAX = (1n << 128n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const UINT24_MAX = (1n << 24n) - 1n;
const PANCAKE_V3_MIN_TICK = -887_272;
const PANCAKE_V3_MAX_TICK = 887_272;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
export const PANCAKE_V3_MAX_DEADLINE_LEAD_SECONDS = 1_800n;

export const PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI = parseAbi([
  "function increaseLiquidity((uint256 tokenId,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params) payable returns (uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params) payable returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max) params) payable returns (uint256 amount0,uint256 amount1)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
]);

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 20-byte EVM address")
  .transform((value) => value.toLowerCase() as `0x${string}`)
  .refine((value) => value !== ZERO_ADDRESS, "The zero address is not allowed");
const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hexadecimal value")
  .transform((value) => value.toLowerCase() as `0x${string}`)
  .refine((value) => value !== ZERO_BYTES32, "The zero bytes32 value is not allowed");
const calldataInputSchema = z
  .string()
  .min(10)
  .max(4_096)
  .regex(/^0x(?:[0-9a-fA-F]{2})+$/, "Expected even-length hexadecimal calldata")
  .transform((value) => value.toLowerCase() as Hex);

function decimalSchema(maximum: bigint, positive: boolean) {
  return z
    .string()
    .min(1)
    .max(78)
    .regex(positive ? /^[1-9][0-9]*$/ : /^(0|[1-9][0-9]*)$/, "Expected canonical raw base units")
    .refine((value) => {
      try {
        return BigInt(value) <= maximum;
      } catch {
        return false;
      }
    }, "Raw value exceeds its ABI integer type");
}

const uint256RawSchema = decimalSchema(UINT256_MAX, false);
const positiveUint256RawSchema = decimalSchema(UINT256_MAX, true);
const uint128RawSchema = decimalSchema(UINT128_MAX, false);
const positiveUint128RawSchema = decimalSchema(UINT128_MAX, true);
const deadlineRawSchema = positiveUint256RawSchema;

export const pancakeV3DirectCallSchema = z.strictObject({
  schemaVersion: z.literal(1),
  chainId: z.number().int().safe(),
  to: addressSchema,
  wallet: addressSchema,
  policyHash: bytes32Schema,
  valueRaw: uint256RawSchema,
  calldata: calldataInputSchema
});

export type PancakeV3DirectCall = z.infer<typeof pancakeV3DirectCallSchema>;

const tickContextSchema = z
  .strictObject({
    lower: z.number().int().min(PANCAKE_V3_MIN_TICK).max(PANCAKE_V3_MAX_TICK),
    upper: z.number().int().min(PANCAKE_V3_MIN_TICK).max(PANCAKE_V3_MAX_TICK),
    spacing: z.number().int().positive().max(PANCAKE_V3_MAX_TICK)
  })
  .superRefine((ticks, context) => {
    if (ticks.lower >= ticks.upper) {
      context.addIssue({
        code: "custom",
        path: ["lower"],
        message: "Lower tick must be below upper tick"
      });
    }
    if (ticks.lower % ticks.spacing !== 0 || ticks.upper % ticks.spacing !== 0) {
      context.addIssue({
        code: "custom",
        path: ["spacing"],
        message: "Ticks must align to the server-reviewed spacing"
      });
    }
  });

const commonExecutionPlanShape = {
  schemaVersion: z.literal(1),
  chainId: z.literal(97),
  positionManager: addressSchema.refine(
    (value) => value === PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
    "Expected the official Pancake V3 BSC testnet position manager"
  ),
  policyHash: bytes32Schema,
  wallet: addressSchema,
  recipient: addressSchema,
  token0: addressSchema,
  token1: addressSchema,
  fee: z.number().int().positive().max(Number(UINT24_MAX)),
  ticks: tickContextSchema,
  // M1 deliberately excludes native BNB forwarding. Supporting WBNB unwrap/pay
  // paths would require a separate reviewed value cap and refund analysis.
  nativeValueRaw: z.literal("0"),
  deadlineRaw: deadlineRawSchema
} as const;

const liquidityAmountsShape = {
  amount0DesiredRaw: uint256RawSchema,
  amount1DesiredRaw: uint256RawSchema,
  amount0CapitalCeilingRaw: uint256RawSchema,
  amount1CapitalCeilingRaw: uint256RawSchema,
  amount0MinimumRaw: uint256RawSchema,
  amount1MinimumRaw: uint256RawSchema
} as const;

function refineCommonPlan(
  plan: {
    wallet: string;
    recipient: string;
    token0: string;
    token1: string;
  },
  context: z.RefinementCtx
): void {
  if (plan.wallet !== plan.recipient) {
    context.addIssue({
      code: "custom",
      path: ["recipient"],
      message: "Recipient must equal the server-authenticated wallet"
    });
  }
  if (plan.token0 === plan.token1 || BigInt(plan.token0) >= BigInt(plan.token1)) {
    context.addIssue({
      code: "custom",
      path: ["token1"],
      message: "Token order must be distinct and canonical"
    });
  }
}

function refineLiquidityAmounts(
  plan: {
    amount0DesiredRaw: string;
    amount1DesiredRaw: string;
    amount0CapitalCeilingRaw: string;
    amount1CapitalCeilingRaw: string;
    amount0MinimumRaw: string;
    amount1MinimumRaw: string;
  },
  context: z.RefinementCtx
): void {
  const desired0 = BigInt(plan.amount0DesiredRaw);
  const desired1 = BigInt(plan.amount1DesiredRaw);
  if (desired0 === 0n && desired1 === 0n) {
    context.addIssue({
      code: "custom",
      path: ["amount0DesiredRaw"],
      message: "At least one exact desired amount must be positive"
    });
  }
  if (desired0 > BigInt(plan.amount0CapitalCeilingRaw)) {
    context.addIssue({
      code: "custom",
      path: ["amount0CapitalCeilingRaw"],
      message: "Token 0 desired amount exceeds its capital ceiling"
    });
  }
  if (desired1 > BigInt(plan.amount1CapitalCeilingRaw)) {
    context.addIssue({
      code: "custom",
      path: ["amount1CapitalCeilingRaw"],
      message: "Token 1 desired amount exceeds its capital ceiling"
    });
  }
  if (BigInt(plan.amount0MinimumRaw) > desired0) {
    context.addIssue({
      code: "custom",
      path: ["amount0MinimumRaw"],
      message: "Token 0 minimum exceeds its desired amount"
    });
  }
  if (BigInt(plan.amount1MinimumRaw) > desired1) {
    context.addIssue({
      code: "custom",
      path: ["amount1MinimumRaw"],
      message: "Token 1 minimum exceeds its desired amount"
    });
  }
}

const increasePlanSchema = z
  .strictObject({
    ...commonExecutionPlanShape,
    ...liquidityAmountsShape,
    operation: z.literal("increaseLiquidity"),
    tokenIdRaw: uint256RawSchema
  })
  .superRefine((plan, context) => {
    refineCommonPlan(plan, context);
    refineLiquidityAmounts(plan, context);
  });

const decreasePlanSchema = z
  .strictObject({
    ...commonExecutionPlanShape,
    operation: z.literal("decreaseLiquidity"),
    tokenIdRaw: uint256RawSchema,
    liquidityRaw: positiveUint128RawSchema,
    amount0MinimumRaw: uint256RawSchema,
    amount1MinimumRaw: uint256RawSchema
  })
  .superRefine(refineCommonPlan);

const collectPlanSchema = z
  .strictObject({
    ...commonExecutionPlanShape,
    operation: z.literal("collect"),
    tokenIdRaw: uint256RawSchema,
    amount0MaximumRaw: uint128RawSchema,
    amount1MaximumRaw: uint128RawSchema
  })
  .superRefine((plan, context) => {
    refineCommonPlan(plan, context);
    if (BigInt(plan.amount0MaximumRaw) === 0n && BigInt(plan.amount1MaximumRaw) === 0n) {
      context.addIssue({
        code: "custom",
        path: ["amount0MaximumRaw"],
        message: "At least one collection maximum must be positive"
      });
    }
  });

const mintPlanSchema = z
  .strictObject({
    ...commonExecutionPlanShape,
    ...liquidityAmountsShape,
    operation: z.literal("mint")
  })
  .superRefine((plan, context) => {
    refineCommonPlan(plan, context);
    refineLiquidityAmounts(plan, context);
  });

export const pancakeV3ExecutionPlanSchema = z.discriminatedUnion("operation", [
  increasePlanSchema,
  decreasePlanSchema,
  collectPlanSchema,
  mintPlanSchema
]);

export type PancakeV3ExecutionPlan = z.infer<typeof pancakeV3ExecutionPlanSchema>;
export type PancakeV3DirectOperation = PancakeV3ExecutionPlan["operation"];

const selectorSchema = z.string().regex(/^0x[0-9a-f]{8}$/);

const issueCodeSchema = z.enum([
  "REQUEST_SCHEMA_INVALID",
  "GATE_OPTIONS_INVALID",
  "PLAN_SCHEMA_INVALID",
  "CLOCK_INVALID",
  "WRONG_CHAIN",
  "WRONG_TARGET",
  "WALLET_MISMATCH",
  "POLICY_HASH_MISMATCH",
  "NATIVE_VALUE_MISMATCH",
  "DISPATCHER_DENIED",
  "UNKNOWN_SELECTOR",
  "SELECTOR_OPERATION_MISMATCH",
  "MALFORMED_CALLDATA",
  "TRAILING_CALLDATA",
  "RECIPIENT_MISMATCH",
  "TOKEN_ID_MISMATCH",
  "TOKEN_ORDER_MISMATCH",
  "FEE_MISMATCH",
  "TICK_RANGE_MISMATCH",
  "DESIRED_AMOUNT_MISMATCH",
  "CAPITAL_CEILING_EXCEEDED",
  "MINIMUM_AMOUNT_MISMATCH",
  "DEADLINE_MISMATCH",
  "DEADLINE_EXPIRED",
  "DEADLINE_TOO_FAR",
  "LIQUIDITY_MISMATCH",
  "COLLECTION_MAXIMUM_MISMATCH"
]);

export type PancakeV3CalldataIssueCode = z.infer<typeof issueCodeSchema>;

const issueSchema = z.strictObject({
  code: issueCodeSchema,
  path: z.string().min(1).max(160),
  message: z.string().min(1).max(240)
});

export type PancakeV3CalldataIssue = z.infer<typeof issueSchema>;

const commonDecodedShape = {
  policyHash: bytes32Schema,
  wallet: addressSchema,
  recipient: addressSchema,
  token0: addressSchema,
  token1: addressSchema,
  fee: z.number().int().positive().max(Number(UINT24_MAX)),
  tickLower: z.number().int().min(PANCAKE_V3_MIN_TICK).max(PANCAKE_V3_MAX_TICK),
  tickUpper: z.number().int().min(PANCAKE_V3_MIN_TICK).max(PANCAKE_V3_MAX_TICK),
  nativeValueRaw: uint256RawSchema,
  deadlineRaw: deadlineRawSchema
} as const;

const increaseDecodedSchema = z.strictObject({
  ...commonDecodedShape,
  tokenIdRaw: uint256RawSchema,
  amount0DesiredRaw: uint256RawSchema,
  amount1DesiredRaw: uint256RawSchema,
  amount0CapitalCeilingRaw: uint256RawSchema,
  amount1CapitalCeilingRaw: uint256RawSchema,
  amount0MinimumRaw: uint256RawSchema,
  amount1MinimumRaw: uint256RawSchema
});

const decreaseDecodedSchema = z.strictObject({
  ...commonDecodedShape,
  tokenIdRaw: uint256RawSchema,
  liquidityRaw: positiveUint128RawSchema,
  amount0MinimumRaw: uint256RawSchema,
  amount1MinimumRaw: uint256RawSchema
});

const collectDecodedSchema = z.strictObject({
  ...commonDecodedShape,
  tokenIdRaw: uint256RawSchema,
  amount0MaximumRaw: uint128RawSchema,
  amount1MaximumRaw: uint128RawSchema
});

const mintDecodedSchema = z.strictObject({
  ...commonDecodedShape,
  amount0DesiredRaw: uint256RawSchema,
  amount1DesiredRaw: uint256RawSchema,
  amount0CapitalCeilingRaw: uint256RawSchema,
  amount1CapitalCeilingRaw: uint256RawSchema,
  amount0MinimumRaw: uint256RawSchema,
  amount1MinimumRaw: uint256RawSchema
});

const blockedDecisionSchema = z.strictObject({
  status: z.literal("blocked"),
  operation: z.enum(["increaseLiquidity", "decreaseLiquidity", "collect", "mint"]).nullable(),
  selector: selectorSchema.nullable(),
  issues: z.array(issueSchema).min(1).max(32)
});

function readyDecisionSchema<
  Operation extends PancakeV3DirectOperation,
  PlanSchema extends z.ZodType,
  DecodedSchema extends z.ZodType
>(operation: Operation, plan: PlanSchema, decoded: DecodedSchema) {
  return z.strictObject({
    status: z.literal("ready"),
    schemaVersion: z.literal(1),
    chainId: z.literal(97),
    positionManager: z.literal(PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER),
    operation: z.literal(operation),
    selector: selectorSchema,
    calldata: calldataInputSchema,
    plan,
    decoded
  });
}

const increaseReadySchema = readyDecisionSchema(
  "increaseLiquidity",
  increasePlanSchema,
  increaseDecodedSchema
);
const decreaseReadySchema = readyDecisionSchema(
  "decreaseLiquidity",
  decreasePlanSchema,
  decreaseDecodedSchema
);
const collectReadySchema = readyDecisionSchema("collect", collectPlanSchema, collectDecodedSchema);
const mintReadySchema = readyDecisionSchema("mint", mintPlanSchema, mintDecodedSchema);

export const pancakeV3CalldataDecisionSchema = z.union([
  blockedDecisionSchema,
  increaseReadySchema,
  decreaseReadySchema,
  collectReadySchema,
  mintReadySchema
]);

export type PancakeV3CalldataDecision = z.infer<typeof pancakeV3CalldataDecisionSchema>;

export interface PancakeV3CalldataGateOptions {
  /** This must be injected from server-owned state, never copied from request JSON. */
  readonly executionPlan: unknown;
  readonly now: () => unknown;
}

const operationSignatures = {
  increaseLiquidity: "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))",
  decreaseLiquidity: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))",
  collect: "collect((uint256,address,uint128,uint128))",
  mint: "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))"
} as const;

const operationSelectors = {
  increaseLiquidity: toFunctionSelector(operationSignatures.increaseLiquidity).toLowerCase(),
  decreaseLiquidity: toFunctionSelector(operationSignatures.decreaseLiquidity).toLowerCase(),
  collect: toFunctionSelector(operationSignatures.collect).toLowerCase(),
  mint: toFunctionSelector(operationSignatures.mint).toLowerCase()
} as const;

const selectorOperations = new Map<string, PancakeV3DirectOperation>(
  Object.entries(operationSelectors).map(([operation, selector]) => [
    selector,
    operation as PancakeV3DirectOperation
  ])
);

const deniedSignatures = [
  "multicall(bytes[])",
  "multicall(uint256,bytes[])",
  "execute(bytes,bytes[])",
  "execute(bytes,bytes[],uint256)",
  "permit(address,address,uint160,uint48,uint48,bytes)",
  "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
  "permit(address,uint256,uint256,uint8,bytes32,bytes32)",
  "approve(address,uint256)",
  "transfer(address,uint256)",
  "transferFrom(address,address,uint256)",
  "sweepToken(address,uint256,address)",
  "sweepToken(address,uint256)",
  "sweepTokenWithFee(address,uint256,address,uint256,address)",
  "refundETH()",
  "selfPermit(address,uint256,uint256,uint8,bytes32,bytes32)",
  "selfPermitIfNecessary(address,uint256,uint256,uint8,bytes32,bytes32)",
  "selfPermitAllowed(address,uint256,uint256,uint8,bytes32,bytes32)",
  "selfPermitAllowedIfNecessary(address,uint256,uint256,uint8,bytes32,bytes32)"
] as const;

const deniedSelectors = new Set(
  deniedSignatures.map((signature) =>
    toFunctionSelector(signature as `${string}(${string})`).toLowerCase()
  )
);

const expectedCalldataHexLengths: Record<PancakeV3DirectOperation, number> = {
  increaseLiquidity: 2 + 8 + 6 * 64,
  decreaseLiquidity: 2 + 8 + 5 * 64,
  collect: 2 + 8 + 4 * 64,
  mint: 2 + 8 + 11 * 64
};

type DecodedOperation =
  | {
      operation: "increaseLiquidity";
      canonicalCalldata: Hex;
      params: z.infer<typeof increaseParamsSchema>;
    }
  | {
      operation: "decreaseLiquidity";
      canonicalCalldata: Hex;
      params: z.infer<typeof decreaseParamsSchema>;
    }
  | {
      operation: "collect";
      canonicalCalldata: Hex;
      params: z.infer<typeof collectParamsSchema>;
    }
  | {
      operation: "mint";
      canonicalCalldata: Hex;
      params: z.infer<typeof mintParamsSchema>;
    };

const increaseParamsSchema = z.strictObject({
  tokenId: z.bigint().min(0n).max(UINT256_MAX),
  amount0Desired: z.bigint().min(0n).max(UINT256_MAX),
  amount1Desired: z.bigint().min(0n).max(UINT256_MAX),
  amount0Min: z.bigint().min(0n).max(UINT256_MAX),
  amount1Min: z.bigint().min(0n).max(UINT256_MAX),
  deadline: z.bigint().min(1n).max(UINT256_MAX)
});

const decreaseParamsSchema = z.strictObject({
  tokenId: z.bigint().min(0n).max(UINT256_MAX),
  liquidity: z.bigint().min(1n).max(UINT128_MAX),
  amount0Min: z.bigint().min(0n).max(UINT256_MAX),
  amount1Min: z.bigint().min(0n).max(UINT256_MAX),
  deadline: z.bigint().min(1n).max(UINT256_MAX)
});

const collectParamsSchema = z.strictObject({
  tokenId: z.bigint().min(0n).max(UINT256_MAX),
  recipient: addressSchema,
  amount0Max: z.bigint().min(0n).max(UINT128_MAX),
  amount1Max: z.bigint().min(0n).max(UINT128_MAX)
});

const mintParamsSchema = z.strictObject({
  token0: addressSchema,
  token1: addressSchema,
  fee: z.number().int().positive().max(Number(UINT24_MAX)),
  tickLower: z.number().int().min(PANCAKE_V3_MIN_TICK).max(PANCAKE_V3_MAX_TICK),
  tickUpper: z.number().int().min(PANCAKE_V3_MIN_TICK).max(PANCAKE_V3_MAX_TICK),
  amount0Desired: z.bigint().min(0n).max(UINT256_MAX),
  amount1Desired: z.bigint().min(0n).max(UINT256_MAX),
  amount0Min: z.bigint().min(0n).max(UINT256_MAX),
  amount1Min: z.bigint().min(0n).max(UINT256_MAX),
  recipient: addressSchema,
  deadline: z.bigint().min(1n).max(UINT256_MAX)
});

function addIssue(
  issues: PancakeV3CalldataIssue[],
  code: PancakeV3CalldataIssueCode,
  path: string,
  message: string
): void {
  if (issues.some((issue) => issue.code === code && issue.path === path)) return;
  issues.push(issueSchema.parse({ code, path, message }));
}

function blocked(
  issues: PancakeV3CalldataIssue[],
  selector: string | null,
  operation: PancakeV3DirectOperation | null
): PancakeV3CalldataDecision {
  return blockedDecisionSchema.parse({ status: "blocked", selector, operation, issues });
}

function decodeDirectCalldata(
  calldata: Hex,
  operation: PancakeV3DirectOperation
): DecodedOperation | null {
  try {
    if (operation === "increaseLiquidity") {
      const decoded = decodeFunctionData({
        abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
        data: calldata
      });
      if (decoded.functionName !== "increaseLiquidity") return null;
      const params = increaseParamsSchema.parse(decoded.args?.[0]);
      const canonicalCalldata = encodeFunctionData({
        abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
        functionName: "increaseLiquidity",
        args: [params]
      });
      return { operation, params, canonicalCalldata };
    }
    if (operation === "decreaseLiquidity") {
      const decoded = decodeFunctionData({
        abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
        data: calldata
      });
      if (decoded.functionName !== "decreaseLiquidity") return null;
      const params = decreaseParamsSchema.parse(decoded.args?.[0]);
      const canonicalCalldata = encodeFunctionData({
        abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
        functionName: "decreaseLiquidity",
        args: [params]
      });
      return { operation, params, canonicalCalldata };
    }
    if (operation === "collect") {
      const decoded = decodeFunctionData({
        abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
        data: calldata
      });
      if (decoded.functionName !== "collect") return null;
      const params = collectParamsSchema.parse(decoded.args?.[0]);
      const canonicalCalldata = encodeFunctionData({
        abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
        functionName: "collect",
        args: [params]
      });
      return { operation, params, canonicalCalldata };
    }
    const decoded = decodeFunctionData({
      abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
      data: calldata
    });
    if (decoded.functionName !== "mint") return null;
    const params = mintParamsSchema.parse(decoded.args?.[0]);
    const canonicalCalldata = encodeFunctionData({
      abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
      functionName: "mint",
      args: [params]
    });
    return { operation, params, canonicalCalldata };
  } catch {
    return null;
  }
}

function readNow(now: () => unknown): bigint | null {
  let unparsedDate: unknown;
  try {
    unparsedDate = now();
  } catch {
    return null;
  }
  if (!(unparsedDate instanceof Date)) return null;
  const date = unparsedDate;
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const seconds = Math.floor(date.getTime() / 1_000);
  if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
  return BigInt(seconds);
}

function parseGateOptions(input: unknown): PancakeV3CalldataGateOptions | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Object.keys(descriptors).sort();
  if (keys.length !== 2 || keys[0] !== "executionPlan" || keys[1] !== "now") return null;
  const executionPlanDescriptor = descriptors.executionPlan;
  const nowDescriptor = descriptors.now;
  if (
    executionPlanDescriptor === undefined ||
    nowDescriptor === undefined ||
    !("value" in executionPlanDescriptor) ||
    !("value" in nowDescriptor) ||
    typeof nowDescriptor.value !== "function"
  ) {
    return null;
  }
  const nowFunction: (...args: readonly unknown[]) => unknown = nowDescriptor.value;
  return {
    executionPlan: executionPlanDescriptor.value,
    now: () => Reflect.apply(nowFunction, undefined, [])
  };
}

function commonDecoded(plan: PancakeV3ExecutionPlan) {
  return {
    policyHash: plan.policyHash,
    wallet: plan.wallet,
    recipient: plan.recipient,
    token0: plan.token0,
    token1: plan.token1,
    fee: plan.fee,
    tickLower: plan.ticks.lower,
    tickUpper: plan.ticks.upper,
    nativeValueRaw: plan.nativeValueRaw,
    deadlineRaw: plan.deadlineRaw
  };
}

function compareCommon(
  call: PancakeV3DirectCall,
  plan: PancakeV3ExecutionPlan,
  now: bigint,
  issues: PancakeV3CalldataIssue[]
): void {
  if (call.chainId !== 97) {
    addIssue(issues, "WRONG_CHAIN", "call.chainId", "Only BSC testnet chain 97 is allowed.");
  }
  if (call.to !== PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER || call.to !== plan.positionManager) {
    addIssue(
      issues,
      "WRONG_TARGET",
      "call.to",
      "Call target must be the exact official Pancake V3 BSC testnet position manager."
    );
  }
  if (call.wallet !== plan.wallet) {
    addIssue(
      issues,
      "WALLET_MISMATCH",
      "call.wallet",
      "Transaction wallet does not match the server-owned execution plan."
    );
  }
  if (call.policyHash !== plan.policyHash) {
    addIssue(
      issues,
      "POLICY_HASH_MISMATCH",
      "call.policyHash",
      "Call policy hash does not match the server-owned execution plan."
    );
  }
  if (call.valueRaw !== plan.nativeValueRaw) {
    addIssue(
      issues,
      "NATIVE_VALUE_MISMATCH",
      "call.valueRaw",
      "Native transaction value does not match the execution plan."
    );
  }

  const deadline = BigInt(plan.deadlineRaw);
  if (deadline <= now) {
    addIssue(
      issues,
      "DEADLINE_EXPIRED",
      "plan.deadlineRaw",
      "The server-owned execution deadline has expired."
    );
  } else if (deadline - now > PANCAKE_V3_MAX_DEADLINE_LEAD_SECONDS) {
    addIssue(
      issues,
      "DEADLINE_TOO_FAR",
      "plan.deadlineRaw",
      "The execution deadline exceeds the bounded submission window."
    );
  }
}

function compareAmounts(
  params: {
    amount0Desired: bigint;
    amount1Desired: bigint;
    amount0Min: bigint;
    amount1Min: bigint;
  },
  plan: z.infer<typeof increasePlanSchema> | z.infer<typeof mintPlanSchema>,
  issues: PancakeV3CalldataIssue[]
): void {
  if (
    params.amount0Desired.toString(10) !== plan.amount0DesiredRaw ||
    params.amount1Desired.toString(10) !== plan.amount1DesiredRaw
  ) {
    addIssue(
      issues,
      "DESIRED_AMOUNT_MISMATCH",
      "calldata.params.amountDesired",
      "Exact desired token amounts do not match the execution plan."
    );
  }
  if (
    params.amount0Desired > BigInt(plan.amount0CapitalCeilingRaw) ||
    params.amount1Desired > BigInt(plan.amount1CapitalCeilingRaw)
  ) {
    addIssue(
      issues,
      "CAPITAL_CEILING_EXCEEDED",
      "calldata.params.amountDesired",
      "Desired token amount exceeds a server-owned capital ceiling."
    );
  }
  if (
    params.amount0Min.toString(10) !== plan.amount0MinimumRaw ||
    params.amount1Min.toString(10) !== plan.amount1MinimumRaw
  ) {
    addIssue(
      issues,
      "MINIMUM_AMOUNT_MISMATCH",
      "calldata.params.amountMinimum",
      "Exact minimum token amounts do not match the execution plan."
    );
  }
}

function compareDeadline(
  deadline: bigint,
  plan: PancakeV3ExecutionPlan,
  issues: PancakeV3CalldataIssue[]
): void {
  if (deadline.toString(10) !== plan.deadlineRaw) {
    addIssue(
      issues,
      "DEADLINE_MISMATCH",
      "calldata.params.deadline",
      "Calldata deadline does not match the server-owned execution deadline."
    );
  }
}

/**
 * Decodes and authorizes a direct manager call against separately injected,
 * server-owned state. Client JSON never supplies the trusted execution plan.
 */
export function evaluatePancakeV3DirectCalldata(
  unparsedCall: unknown,
  unparsedOptions: unknown
): PancakeV3CalldataDecision {
  const callResult = pancakeV3DirectCallSchema.safeParse(unparsedCall);
  if (!callResult.success) {
    return blocked(
      [
        issueSchema.parse({
          code: "REQUEST_SCHEMA_INVALID",
          path: "call",
          message: "The direct-call envelope failed strict runtime validation."
        })
      ],
      null,
      null
    );
  }
  const options = parseGateOptions(unparsedOptions);
  if (options === null) {
    return blocked(
      [
        issueSchema.parse({
          code: "GATE_OPTIONS_INVALID",
          path: "gate",
          message: "The server-owned execution plan and injected clock are required."
        })
      ],
      callResult.data.calldata.slice(0, 10),
      null
    );
  }
  const planResult = pancakeV3ExecutionPlanSchema.safeParse(options.executionPlan);
  if (!planResult.success) {
    return blocked(
      [
        issueSchema.parse({
          code: "PLAN_SCHEMA_INVALID",
          path: "plan",
          message: "The injected server execution plan failed strict runtime validation."
        })
      ],
      callResult.data.calldata.slice(0, 10),
      null
    );
  }
  const call = callResult.data;
  const plan = planResult.data;
  const selector = call.calldata.slice(0, 10);
  const operation = selectorOperations.get(selector) ?? null;
  const issues: PancakeV3CalldataIssue[] = [];
  const now = readNow(options.now);
  if (now === null) {
    addIssue(
      issues,
      "CLOCK_INVALID",
      "gate.now",
      "The injected server clock returned an invalid time."
    );
    return blocked(issues, selector, operation);
  }
  compareCommon(call, plan, now, issues);

  if (operation === null) {
    addIssue(
      issues,
      deniedSelectors.has(selector) ? "DISPATCHER_DENIED" : "UNKNOWN_SELECTOR",
      "call.calldata.selector",
      deniedSelectors.has(selector)
        ? "Dispatcher, permit, transfer, sweep, refund, and self-permit calls are denied."
        : "Only four reviewed direct Pancake V3 manager selectors are allowed."
    );
    return blocked(issues, selector, null);
  }
  if (operation !== plan.operation) {
    addIssue(
      issues,
      "SELECTOR_OPERATION_MISMATCH",
      "call.calldata.selector",
      "Direct selector does not match the server-owned operation plan."
    );
    return blocked(issues, selector, operation);
  }

  const expectedLength = expectedCalldataHexLengths[operation];
  if (call.calldata.length > expectedLength) {
    addIssue(
      issues,
      "TRAILING_CALLDATA",
      "call.calldata",
      "Canonical direct calldata must not contain trailing or nested bytes."
    );
    return blocked(issues, selector, operation);
  }
  if (call.calldata.length < expectedLength) {
    addIssue(
      issues,
      "MALFORMED_CALLDATA",
      "call.calldata",
      "Direct calldata is shorter than the canonical ABI encoding."
    );
    return blocked(issues, selector, operation);
  }

  const decoded = decodeDirectCalldata(call.calldata, operation);
  if (decoded === null || decoded.canonicalCalldata.toLowerCase() !== call.calldata) {
    addIssue(
      issues,
      "MALFORMED_CALLDATA",
      "call.calldata",
      "Direct calldata is malformed or not canonically ABI encoded."
    );
    return blocked(issues, selector, operation);
  }

  if (decoded.operation === "increaseLiquidity" && plan.operation === "increaseLiquidity") {
    const params = decoded.params;
    if (params.tokenId.toString(10) !== plan.tokenIdRaw) {
      addIssue(
        issues,
        "TOKEN_ID_MISMATCH",
        "calldata.params.tokenId",
        "Position token ID does not match the execution plan."
      );
    }
    compareAmounts(params, plan, issues);
    compareDeadline(params.deadline, plan, issues);
    if (issues.length > 0) return blocked(issues, selector, operation);
    return increaseReadySchema.parse({
      status: "ready",
      schemaVersion: 1,
      chainId: 97,
      positionManager: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      operation,
      selector,
      calldata: decoded.canonicalCalldata,
      plan,
      decoded: {
        ...commonDecoded(plan),
        tokenIdRaw: params.tokenId.toString(10),
        amount0DesiredRaw: params.amount0Desired.toString(10),
        amount1DesiredRaw: params.amount1Desired.toString(10),
        amount0CapitalCeilingRaw: plan.amount0CapitalCeilingRaw,
        amount1CapitalCeilingRaw: plan.amount1CapitalCeilingRaw,
        amount0MinimumRaw: params.amount0Min.toString(10),
        amount1MinimumRaw: params.amount1Min.toString(10)
      }
    });
  }

  if (decoded.operation === "decreaseLiquidity" && plan.operation === "decreaseLiquidity") {
    const params = decoded.params;
    if (params.tokenId.toString(10) !== plan.tokenIdRaw) {
      addIssue(
        issues,
        "TOKEN_ID_MISMATCH",
        "calldata.params.tokenId",
        "Position token ID does not match the execution plan."
      );
    }
    if (params.liquidity.toString(10) !== plan.liquidityRaw) {
      addIssue(
        issues,
        "LIQUIDITY_MISMATCH",
        "calldata.params.liquidity",
        "Exact removal liquidity does not match the execution plan."
      );
    }
    if (
      params.amount0Min.toString(10) !== plan.amount0MinimumRaw ||
      params.amount1Min.toString(10) !== plan.amount1MinimumRaw
    ) {
      addIssue(
        issues,
        "MINIMUM_AMOUNT_MISMATCH",
        "calldata.params.amountMinimum",
        "Exact removal minimums do not match the execution plan."
      );
    }
    compareDeadline(params.deadline, plan, issues);
    if (issues.length > 0) return blocked(issues, selector, operation);
    return decreaseReadySchema.parse({
      status: "ready",
      schemaVersion: 1,
      chainId: 97,
      positionManager: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      operation,
      selector,
      calldata: decoded.canonicalCalldata,
      plan,
      decoded: {
        ...commonDecoded(plan),
        tokenIdRaw: params.tokenId.toString(10),
        liquidityRaw: params.liquidity.toString(10),
        amount0MinimumRaw: params.amount0Min.toString(10),
        amount1MinimumRaw: params.amount1Min.toString(10)
      }
    });
  }

  if (decoded.operation === "collect" && plan.operation === "collect") {
    const params = decoded.params;
    if (params.tokenId.toString(10) !== plan.tokenIdRaw) {
      addIssue(
        issues,
        "TOKEN_ID_MISMATCH",
        "calldata.params.tokenId",
        "Position token ID does not match the execution plan."
      );
    }
    if (params.recipient !== plan.recipient) {
      addIssue(
        issues,
        "RECIPIENT_MISMATCH",
        "calldata.params.recipient",
        "Collection recipient does not match the authenticated wallet."
      );
    }
    if (
      params.amount0Max.toString(10) !== plan.amount0MaximumRaw ||
      params.amount1Max.toString(10) !== plan.amount1MaximumRaw
    ) {
      addIssue(
        issues,
        "COLLECTION_MAXIMUM_MISMATCH",
        "calldata.params.amountMaximum",
        "Exact collection maxima do not match the execution plan."
      );
    }
    if (issues.length > 0) return blocked(issues, selector, operation);
    return collectReadySchema.parse({
      status: "ready",
      schemaVersion: 1,
      chainId: 97,
      positionManager: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      operation,
      selector,
      calldata: decoded.canonicalCalldata,
      plan,
      decoded: {
        ...commonDecoded(plan),
        tokenIdRaw: params.tokenId.toString(10),
        amount0MaximumRaw: params.amount0Max.toString(10),
        amount1MaximumRaw: params.amount1Max.toString(10)
      }
    });
  }

  if (decoded.operation === "mint" && plan.operation === "mint") {
    const params = decoded.params;
    if (params.token0 !== plan.token0 || params.token1 !== plan.token1) {
      addIssue(
        issues,
        "TOKEN_ORDER_MISMATCH",
        "calldata.params.tokens",
        "Mint tokens do not preserve the exact reviewed token order."
      );
    }
    if (params.fee !== plan.fee) {
      addIssue(
        issues,
        "FEE_MISMATCH",
        "calldata.params.fee",
        "Mint fee tier does not match the reviewed pool."
      );
    }
    if (params.tickLower !== plan.ticks.lower || params.tickUpper !== plan.ticks.upper) {
      addIssue(
        issues,
        "TICK_RANGE_MISMATCH",
        "calldata.params.ticks",
        "Mint ticks do not match the server-owned desired range."
      );
    }
    if (params.recipient !== plan.recipient) {
      addIssue(
        issues,
        "RECIPIENT_MISMATCH",
        "calldata.params.recipient",
        "Mint recipient does not match the authenticated wallet."
      );
    }
    compareAmounts(params, plan, issues);
    compareDeadline(params.deadline, plan, issues);
    if (issues.length > 0) return blocked(issues, selector, operation);
    return mintReadySchema.parse({
      status: "ready",
      schemaVersion: 1,
      chainId: 97,
      positionManager: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      operation,
      selector,
      calldata: decoded.canonicalCalldata,
      plan,
      decoded: {
        ...commonDecoded(plan),
        amount0DesiredRaw: params.amount0Desired.toString(10),
        amount1DesiredRaw: params.amount1Desired.toString(10),
        amount0CapitalCeilingRaw: plan.amount0CapitalCeilingRaw,
        amount1CapitalCeilingRaw: plan.amount1CapitalCeilingRaw,
        amount0MinimumRaw: params.amount0Min.toString(10),
        amount1MinimumRaw: params.amount1Min.toString(10)
      }
    });
  }

  addIssue(
    issues,
    "SELECTOR_OPERATION_MISMATCH",
    "call.calldata.selector",
    "Decoded operation does not match the execution plan."
  );
  return blocked(issues, selector, operation);
}
