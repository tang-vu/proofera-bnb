import { encodeFunctionData, parseAbi, toFunctionSelector, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
  evaluatePancakeV3DirectCalldata,
  type PancakeV3CalldataDecision,
  type PancakeV3CalldataIssueCode,
  type PancakeV3DirectOperation,
  type PancakeV3ExecutionPlan
} from "./pancake-v3-calldata";
import { PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER } from "./lp-activation-intent";

const NOW_UNIX = 1_800_000_000;
const DEADLINE_RAW = (NOW_UNIX + 300).toString(10);
const POLICY_HASH = `0x${"11".repeat(32)}` as `0x${string}`;
const OTHER_POLICY_HASH = `0x${"22".repeat(32)}` as `0x${string}`;
const WALLET = "0x1111111111111111111111111111111111111111" as const;
const OTHER_WALLET = "0x2222222222222222222222222222222222222222" as const;
const TOKEN_0 = "0x3333333333333333333333333333333333333333" as const;
const TOKEN_1 = "0x4444444444444444444444444444444444444444" as const;
const OTHER_TARGET = "0x5555555555555555555555555555555555555555" as const;
const UINT256_MAX = (2n ** 256n - 1n).toString(10);
const UINT256_OVERFLOW = (2n ** 256n).toString(10);
const UINT128_MAX = (2n ** 128n - 1n).toString(10);
const TOKEN_ID_RAW = UINT256_MAX;
const AMOUNT_0_DESIRED_RAW = UINT256_MAX;
const AMOUNT_1_DESIRED_RAW = "2000";
const AMOUNT_0_MINIMUM_RAW = (2n ** 256n - 2n).toString(10);
const AMOUNT_1_MINIMUM_RAW = "1800";

const commonPlan = {
  schemaVersion: 1 as const,
  chainId: 97 as const,
  positionManager: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  policyHash: POLICY_HASH,
  wallet: WALLET,
  recipient: WALLET,
  token0: TOKEN_0,
  token1: TOKEN_1,
  fee: 2_500,
  ticks: { lower: -120, upper: 120, spacing: 60 },
  nativeValueRaw: "0" as const,
  deadlineRaw: DEADLINE_RAW
};

const liquidityAmounts = {
  amount0DesiredRaw: AMOUNT_0_DESIRED_RAW,
  amount1DesiredRaw: AMOUNT_1_DESIRED_RAW,
  amount0CapitalCeilingRaw: AMOUNT_0_DESIRED_RAW,
  amount1CapitalCeilingRaw: "2200",
  amount0MinimumRaw: AMOUNT_0_MINIMUM_RAW,
  amount1MinimumRaw: AMOUNT_1_MINIMUM_RAW
};

function plan(operation: PancakeV3DirectOperation): PancakeV3ExecutionPlan {
  if (operation === "increaseLiquidity") {
    return {
      ...commonPlan,
      ...liquidityAmounts,
      operation,
      tokenIdRaw: TOKEN_ID_RAW
    };
  }
  if (operation === "decreaseLiquidity") {
    return {
      ...commonPlan,
      operation,
      tokenIdRaw: TOKEN_ID_RAW,
      liquidityRaw: UINT128_MAX,
      amount0MinimumRaw: AMOUNT_0_MINIMUM_RAW,
      amount1MinimumRaw: AMOUNT_1_MINIMUM_RAW
    };
  }
  if (operation === "collect") {
    return {
      ...commonPlan,
      operation,
      tokenIdRaw: TOKEN_ID_RAW,
      amount0MaximumRaw: UINT128_MAX,
      amount1MaximumRaw: "999"
    };
  }
  return { ...commonPlan, ...liquidityAmounts, operation };
}

type ParameterOverrides = Readonly<Record<string, unknown>>;

function calldata(operation: PancakeV3DirectOperation, overrides: ParameterOverrides = {}): Hex {
  if (operation === "increaseLiquidity") {
    return encodeFunctionData({
      abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
      functionName: "increaseLiquidity",
      args: [
        {
          tokenId: BigInt(TOKEN_ID_RAW),
          amount0Desired: BigInt(AMOUNT_0_DESIRED_RAW),
          amount1Desired: BigInt(AMOUNT_1_DESIRED_RAW),
          amount0Min: BigInt(AMOUNT_0_MINIMUM_RAW),
          amount1Min: BigInt(AMOUNT_1_MINIMUM_RAW),
          deadline: BigInt(DEADLINE_RAW),
          ...overrides
        }
      ]
    });
  }
  if (operation === "decreaseLiquidity") {
    return encodeFunctionData({
      abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
      functionName: "decreaseLiquidity",
      args: [
        {
          tokenId: BigInt(TOKEN_ID_RAW),
          liquidity: BigInt(UINT128_MAX),
          amount0Min: BigInt(AMOUNT_0_MINIMUM_RAW),
          amount1Min: BigInt(AMOUNT_1_MINIMUM_RAW),
          deadline: BigInt(DEADLINE_RAW),
          ...overrides
        }
      ]
    });
  }
  if (operation === "collect") {
    return encodeFunctionData({
      abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
      functionName: "collect",
      args: [
        {
          tokenId: BigInt(TOKEN_ID_RAW),
          recipient: WALLET,
          amount0Max: BigInt(UINT128_MAX),
          amount1Max: 999n,
          ...overrides
        }
      ]
    });
  }
  return encodeFunctionData({
    abi: PANCAKE_V3_DIRECT_POSITION_MANAGER_ABI,
    functionName: "mint",
    args: [
      {
        token0: TOKEN_0,
        token1: TOKEN_1,
        fee: 2_500,
        tickLower: -120,
        tickUpper: 120,
        amount0Desired: BigInt(AMOUNT_0_DESIRED_RAW),
        amount1Desired: BigInt(AMOUNT_1_DESIRED_RAW),
        amount0Min: BigInt(AMOUNT_0_MINIMUM_RAW),
        amount1Min: BigInt(AMOUNT_1_MINIMUM_RAW),
        recipient: WALLET,
        deadline: BigInt(DEADLINE_RAW),
        ...overrides
      }
    ]
  });
}

function call(
  data: Hex,
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    chainId: 97,
    to: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
    wallet: WALLET,
    policyHash: POLICY_HASH,
    valueRaw: "0",
    calldata: data,
    ...overrides
  };
}

function evaluate(
  operation: PancakeV3DirectOperation,
  data: Hex = calldata(operation),
  executionPlan: unknown = plan(operation),
  callOverrides: Readonly<Record<string, unknown>> = {}
): PancakeV3CalldataDecision {
  return evaluatePancakeV3DirectCalldata(call(data, callOverrides), {
    executionPlan,
    now: () => new Date(NOW_UNIX * 1_000)
  });
}

function issueCodes(decision: PancakeV3CalldataDecision): PancakeV3CalldataIssueCode[] {
  return decision.status === "blocked" ? decision.issues.map((issue) => issue.code) : [];
}

describe("Pancake V3 direct calldata semantic gate", () => {
  it.each(["increaseLiquidity", "decreaseLiquidity", "collect", "mint"] as const)(
    "accepts one canonical direct %s call",
    (operation) => {
      const decision = evaluate(operation);

      expect(decision).toMatchObject({
        status: "ready",
        schemaVersion: 1,
        chainId: 97,
        positionManager: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        operation,
        plan: {
          policyHash: POLICY_HASH,
          wallet: WALLET,
          recipient: WALLET,
          token0: TOKEN_0,
          token1: TOKEN_1,
          deadlineRaw: DEADLINE_RAW
        },
        decoded: {
          policyHash: POLICY_HASH,
          wallet: WALLET,
          recipient: WALLET,
          token0: TOKEN_0,
          token1: TOKEN_1,
          deadlineRaw: DEADLINE_RAW
        }
      });
      expect(() => JSON.stringify(decision)).not.toThrow();
      expect(JSON.stringify(decision)).not.toMatch(/\d+\.\d+/);
      if (decision.status === "ready" && decision.operation === "increaseLiquidity") {
        expect(decision.decoded.tokenIdRaw).toBe(UINT256_MAX);
        expect(decision.decoded.amount0DesiredRaw).toBe(UINT256_MAX);
      }
      if (decision.status === "ready" && decision.operation === "decreaseLiquidity") {
        expect(decision.decoded.liquidityRaw).toBe(UINT128_MAX);
      }
      if (decision.status === "ready" && decision.operation === "collect") {
        expect(decision.decoded.amount0MaximumRaw).toBe(UINT128_MAX);
      }
    }
  );

  it("rejects a wrong target and a selector/plan pairing mismatch", () => {
    const wrongTarget = evaluate("increaseLiquidity", calldata("increaseLiquidity"), undefined, {
      to: OTHER_TARGET
    });
    const wrongPair = evaluate("increaseLiquidity", calldata("collect"), plan("increaseLiquidity"));

    expect(issueCodes(wrongTarget)).toContain("WRONG_TARGET");
    expect(wrongPair).toMatchObject({
      status: "blocked",
      operation: "collect",
      issues: [{ code: "SELECTOR_OPERATION_MISMATCH" }]
    });
  });

  it("denies nested multicall and every named dispatcher/permit/transfer family", () => {
    const multicallAbi = parseAbi(["function multicall(bytes[] data) payable returns (bytes[])"]);
    const nested = encodeFunctionData({
      abi: multicallAbi,
      functionName: "multicall",
      args: [[calldata("increaseLiquidity")]]
    });
    expect(issueCodes(evaluate("increaseLiquidity", nested))).toContain("DISPATCHER_DENIED");

    const deniedSignatures = [
      "multicall(uint256,bytes[])",
      "execute(bytes,bytes[],uint256)",
      "permit(address,address,uint160,uint48,uint48,bytes)",
      "approve(address,uint256)",
      "transfer(address,uint256)",
      "sweepToken(address,uint256,address)",
      "refundETH()",
      "selfPermit(address,uint256,uint256,uint8,bytes32,bytes32)"
    ] as const;
    for (const signature of deniedSignatures) {
      const selector = toFunctionSelector(signature).toLowerCase() as Hex;
      expect(issueCodes(evaluate("increaseLiquidity", selector))).toContain("DISPATCHER_DENIED");
    }
    expect(issueCodes(evaluate("increaseLiquidity", "0x12345678"))).toContain("UNKNOWN_SELECTOR");
  });

  it.each(["collect", "mint"] as const)("rejects %s recipient tampering", (operation) => {
    const decision = evaluate(operation, calldata(operation, { recipient: OTHER_WALLET }));
    expect(issueCodes(decision)).toContain("RECIPIENT_MISMATCH");
  });

  it.each([
    { field: "token0", value: TOKEN_1, code: "TOKEN_ORDER_MISMATCH" },
    { field: "fee", value: 500, code: "FEE_MISMATCH" },
    { field: "tickLower", value: -60, code: "TICK_RANGE_MISMATCH" },
    { field: "tickUpper", value: 180, code: "TICK_RANGE_MISMATCH" }
  ] as const)("rejects mint $field tampering", ({ field, value, code }) => {
    const decision = evaluate("mint", calldata("mint", { [field]: value }));
    expect(issueCodes(decision)).toContain(code);
  });

  it.each(["increaseLiquidity", "decreaseLiquidity", "collect"] as const)(
    "rejects %s token ID tampering",
    (operation) => {
      const decision = evaluate(operation, calldata(operation, { tokenId: 1n }));
      expect(issueCodes(decision)).toContain("TOKEN_ID_MISMATCH");
    }
  );

  it.each(["increaseLiquidity", "decreaseLiquidity", "mint"] as const)(
    "rejects %s deadline tampering",
    (operation) => {
      const decision = evaluate(
        operation,
        calldata(operation, { deadline: BigInt(DEADLINE_RAW) + 1n })
      );
      expect(issueCodes(decision)).toContain("DEADLINE_MISMATCH");
    }
  );

  it.each(["increaseLiquidity", "mint"] as const)(
    "rejects %s desired amount and capital-ceiling tampering",
    (operation) => {
      const decision = evaluate(operation, calldata(operation, { amount1Desired: 2_300n }));
      expect(issueCodes(decision)).toEqual(
        expect.arrayContaining(["DESIRED_AMOUNT_MISMATCH", "CAPITAL_CEILING_EXCEEDED"])
      );
    }
  );

  it.each(["increaseLiquidity", "decreaseLiquidity", "mint"] as const)(
    "rejects %s minimum amount tampering",
    (operation) => {
      const decision = evaluate(operation, calldata(operation, { amount1Min: 1_799n }));
      expect(issueCodes(decision)).toContain("MINIMUM_AMOUNT_MISMATCH");
    }
  );

  it("rejects removal liquidity and collection-maximum tampering", () => {
    const liquidity = evaluate(
      "decreaseLiquidity",
      calldata("decreaseLiquidity", { liquidity: BigInt(UINT128_MAX) - 1n })
    );
    const collection = evaluate("collect", calldata("collect", { amount1Max: 998n }));
    expect(issueCodes(liquidity)).toContain("LIQUIDITY_MISMATCH");
    expect(issueCodes(collection)).toContain("COLLECTION_MAXIMUM_MISMATCH");
  });

  it("rejects uint overflow in the plan and non-canonical uint128 calldata", () => {
    const overflowPlan = {
      ...plan("increaseLiquidity"),
      amount0CapitalCeilingRaw: UINT256_OVERFLOW
    };
    const planDecision = evaluate("increaseLiquidity", calldata("increaseLiquidity"), overflowPlan);
    expect(issueCodes(planDecision)).toContain("PLAN_SCHEMA_INVALID");

    const valid = calldata("decreaseLiquidity");
    const liquidityWordStart = 10 + 64;
    const overflowWord = (1n << 128n).toString(16).padStart(64, "0");
    const nonCanonical = `${valid.slice(0, liquidityWordStart)}${overflowWord}${valid.slice(
      liquidityWordStart + 64
    )}` as Hex;
    const calldataDecision = evaluate("decreaseLiquidity", nonCanonical);
    expect(issueCodes(calldataDecision)).toContain("MALFORMED_CALLDATA");
  });

  it("rejects shortened calldata, trailing bytes, and concatenated-call smuggling", () => {
    const valid = calldata("increaseLiquidity");
    const short = valid.slice(0, -2) as Hex;
    const trailing = `${valid}00` as Hex;
    const concatenated = `${valid}${calldata("collect").slice(2)}` as Hex;

    expect(issueCodes(evaluate("increaseLiquidity", short))).toContain("MALFORMED_CALLDATA");
    expect(issueCodes(evaluate("increaseLiquidity", trailing))).toContain("TRAILING_CALLDATA");
    expect(issueCodes(evaluate("increaseLiquidity", concatenated))).toContain("TRAILING_CALLDATA");
  });

  it("rejects policy, wallet, native-value, and chain tampering", () => {
    expect(
      issueCodes(
        evaluate("increaseLiquidity", calldata("increaseLiquidity"), undefined, {
          policyHash: OTHER_POLICY_HASH
        })
      )
    ).toContain("POLICY_HASH_MISMATCH");
    expect(
      issueCodes(
        evaluate("increaseLiquidity", calldata("increaseLiquidity"), undefined, {
          wallet: OTHER_WALLET
        })
      )
    ).toContain("WALLET_MISMATCH");
    expect(
      issueCodes(
        evaluate("increaseLiquidity", calldata("increaseLiquidity"), undefined, { valueRaw: "1" })
      )
    ).toContain("NATIVE_VALUE_MISMATCH");
    expect(
      issueCodes(
        evaluate("increaseLiquidity", calldata("increaseLiquidity"), undefined, { chainId: 56 })
      )
    ).toContain("WRONG_CHAIN");
    expect(
      issueCodes(
        evaluate("mint", calldata("mint"), {
          ...plan("mint"),
          nativeValueRaw: "1"
        })
      )
    ).toContain("PLAN_SCHEMA_INVALID");
  });

  it("rejects expired/far deadlines and invalid server clocks", () => {
    const expired = { ...plan("collect"), deadlineRaw: NOW_UNIX.toString(10) };
    const far = { ...plan("collect"), deadlineRaw: (NOW_UNIX + 1_801).toString(10) };
    expect(issueCodes(evaluate("collect", calldata("collect"), expired))).toContain(
      "DEADLINE_EXPIRED"
    );
    expect(issueCodes(evaluate("collect", calldata("collect"), far))).toContain("DEADLINE_TOO_FAR");

    const invalidClock = evaluatePancakeV3DirectCalldata(call(calldata("collect")), {
      executionPlan: plan("collect"),
      now: () => new Date(Number.NaN)
    });
    expect(issueCodes(invalidClock)).toContain("CLOCK_INVALID");
  });

  it("strictly rejects client-injected trusted fields and plan extras", () => {
    const clientInjected = evaluatePancakeV3DirectCalldata(
      { ...call(calldata("mint")), executionPlan: plan("mint") },
      { executionPlan: plan("mint"), now: () => new Date(NOW_UNIX * 1_000) }
    );
    const planExtra = evaluate("mint", calldata("mint"), {
      ...plan("mint"),
      clientApproved: true
    });
    expect(issueCodes(clientInjected)).toContain("REQUEST_SCHEMA_INVALID");
    expect(issueCodes(planExtra)).toContain("PLAN_SCHEMA_INVALID");
  });

  it("runtime-validates the injected gate boundary itself", () => {
    const missing = evaluatePancakeV3DirectCalldata(call(calldata("mint")), undefined);
    const accessor = evaluatePancakeV3DirectCalldata(call(calldata("mint")), {
      executionPlan: plan("mint"),
      get now() {
        throw new Error("must not invoke an options accessor");
      }
    });
    const extra = evaluatePancakeV3DirectCalldata(call(calldata("mint")), {
      executionPlan: plan("mint"),
      now: () => new Date(NOW_UNIX * 1_000),
      clientTrusted: true
    });

    expect(issueCodes(missing)).toContain("GATE_OPTIONS_INVALID");
    expect(issueCodes(accessor)).toContain("GATE_OPTIONS_INVALID");
    expect(issueCodes(extra)).toContain("GATE_OPTIONS_INVALID");
  });
});
