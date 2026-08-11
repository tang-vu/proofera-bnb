import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";

import {
  ACTIVATION_POLICY_VERSION,
  activationPolicySchema,
  hashActivationPolicy,
  runtimeExpectationFromPolicy,
  validateActivationPolicy,
  type ActivationPolicy,
  type ActivationPolicyValidationContext,
  type ReviewedContractManifestEntry
} from "./activation-policy";

const token = "0x1111111111111111111111111111111111111111";
const wallet = "0x2222222222222222222222222222222222222222";
const attacker = "0x3333333333333333333333333333333333333333";
const wrongTarget = "0x4444444444444444444444444444444444444444";
const manager = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
const codeHash = `0x${"ab".repeat(32)}`;
const wrongCodeHash = `0x${"cd".repeat(32)}`;
const signature = "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))" as const;
const nowIso = "2026-08-11T12:00:00.000Z";
const transactionDeadline = Math.floor(Date.parse("2026-08-11T12:04:00.000Z") / 1_000);

const validPolicy = (): ActivationPolicy => ({
  agentId: "bsc-testnet:proof-range-guardian",
  calls: [
    {
      contractLabel: "PancakeSwap V3 Position Manager",
      expectedIdentity: { codeHash, kind: "code_hash" },
      operationKind: "direct",
      selector: toFunctionSelector(signature),
      signature,
      to: manager
    }
  ],
  capital: [{ address: token, amountRaw: "1000000000000000000", decimals: 18, symbol: "TEST" }],
  category: "lp-rebalancing",
  chain: { chainId: 97, environment: "testnet", name: "BSC Testnet" },
  deadlineSeconds: 300,
  emergency: {
    onDeviation: "block-and-alert",
    onStaleQuote: "block",
    userCanRevoke: true
  },
  enforcement: {
    callPermissions: "altana_onchain",
    grantConfirmation: "wallet_confirmation",
    runtimeConstraints: "proofera_runtime",
    sessionExpiry: "altana_onchain",
    spendLimits: "altana_onchain"
  },
  expiry: Math.floor(Date.parse("2026-08-11T13:00:00.000Z") / 1_000),
  maxExecutionsPerDay: 4,
  minimumAmounts: [{ amountRaw: "450000000000000000", token }],
  quote: {
    observedAt: "2026-08-11T11:59:00.000Z",
    sourceUrl: "https://testnet.bscscan.com/address/0x427bF5b37357632377eCbEC9de3626C71A5396c1",
    validUntil: "2026-08-11T12:05:00.000Z"
  },
  recipient: wallet,
  registerInKeystore: true,
  slippageBps: 50,
  spend: [{ limitRaw: "500000000000000000", period: "day", token }],
  tickRange: { lower: -600, upper: 600 },
  tokenId: "42",
  transactionDeadline,
  version: ACTIVATION_POLICY_VERSION,
  wallet
});

function manifestFor(policy = validPolicy()): ReviewedContractManifestEntry[] {
  const call = policy.calls[0];
  if (call === undefined) throw new Error("Test fixture requires one call permission.");
  return [
    {
      ...call,
      chainId: policy.chain.chainId,
      safeDirectOperation: true
    }
  ];
}

function validContext(): ActivationPolicyValidationContext {
  const policy = validPolicy();
  return {
    expectedChainId: 97,
    expectedRuntime: runtimeExpectationFromPolicy(policy),
    now: () => new Date(nowIso),
    reviewedContractManifest: manifestFor(policy)
  };
}

describe("activationPolicySchema", () => {
  it("accepts an exact direct contract and function permission", () => {
    expect(activationPolicySchema.parse(validPolicy())).toEqual(validPolicy());
  });

  it("rejects a selector that does not match its disclosed signature", () => {
    const policy = validPolicy();
    const firstCall = policy.calls[0];
    if (firstCall === undefined) throw new Error("Test fixture requires one call permission.");
    policy.calls[0] = { ...firstCall, selector: "0x12345678" };

    expect(() => activationPolicySchema.parse(policy)).toThrow(/selector does not match/i);
  });

  it("rejects unknown fields in nested structures", () => {
    const policy = validPolicy();
    const untrusted = {
      ...policy,
      quote: { ...policy.quote, silentlyTrustClient: true }
    };

    expect(activationPolicySchema.safeParse(untrusted).success).toBe(false);
  });
});

describe("validateActivationPolicy", () => {
  it("accepts the bounded BSC testnet policy and reports its canonical hash", () => {
    const policy = validPolicy();
    expect(validateActivationPolicy(policy, validContext())).toMatchObject({
      issues: [],
      policyHash: hashActivationPolicy(policy),
      valid: true
    });
  });

  it("uses a trusted clock and rejects stale, future, invalid, and overlong quote windows", () => {
    const cases: Array<[Partial<ActivationPolicy["quote"]>, string]> = [
      [{ observedAt: "2026-08-11T11:57:00.000Z" }, "QUOTE_TOO_OLD"],
      [{ observedAt: "2026-08-11T12:00:00.001Z" }, "QUOTE_FROM_FUTURE"],
      [
        {
          observedAt: "2026-08-11T11:59:00.000Z",
          validUntil: "2026-08-11T11:58:59.000Z"
        },
        "QUOTE_INVALID_WINDOW"
      ],
      [{ validUntil: "2026-08-11T12:20:00.000Z" }, "QUOTE_TTL_TOO_LONG"],
      [{ validUntil: "2026-08-11T11:59:59.000Z" }, "QUOTE_EXPIRED"]
    ];

    for (const [quoteChange, issueCode] of cases) {
      const policy = validPolicy();
      policy.quote = { ...policy.quote, ...quoteChange };
      const codes = validateActivationPolicy(policy, validContext()).issues.map(
        (issue) => issue.code
      );
      expect(codes, issueCode).toContain(issueCode);
    }
  });

  it("rejects duplicate token/period caps and compares their aggregate with capital", () => {
    const policy = validPolicy();
    policy.spend.push({ limitRaw: "600000000000000000", period: "day", token });

    const codes = validateActivationPolicy(policy, validContext()).issues.map(
      (issue) => issue.code
    );
    expect(codes).toEqual(
      expect.arrayContaining(["DUPLICATE_SPEND_PERMISSION", "SPEND_EXCEEDS_CAPITAL"])
    );
  });

  it.each([
    ["wrong target", wrongTarget, signature],
    ["wrong selector", manager, "collect((uint256,address,uint128,uint128))"]
  ])("rejects an unreviewed %s", (_label, target, alternateSignature) => {
    const policy = validPolicy();
    const firstCall = policy.calls[0];
    if (firstCall === undefined) throw new Error("Test fixture requires one call permission.");
    policy.calls[0] = {
      ...firstCall,
      selector: toFunctionSelector(alternateSignature as `${string}(${string})`),
      signature: alternateSignature,
      to: target
    };

    expect(validateActivationPolicy(policy, validContext()).issues).toContainEqual(
      expect.objectContaining({ code: "UNREVIEWED_CALL_PERMISSION" })
    );
  });

  it("rejects a contract code hash that differs from the reviewed manifest", () => {
    const policy = validPolicy();
    const firstCall = policy.calls[0];
    if (firstCall === undefined) throw new Error("Test fixture requires one call permission.");
    policy.calls[0] = {
      ...firstCall,
      expectedIdentity: { codeHash: wrongCodeHash, kind: "code_hash" }
    };

    expect(validateActivationPolicy(policy, validContext()).issues).toContainEqual(
      expect.objectContaining({ code: "CONTRACT_CODE_HASH_MISMATCH" })
    );
  });

  it.each([
    "multicall(bytes[])",
    "multicall(uint256,bytes[])",
    "multicall(bytes32,bytes[])",
    "execute(bytes,bytes[])",
    "permit(address,address,uint160,uint48,uint48)",
    "approve(address,uint256)",
    "transfer(address,uint256)",
    "sweepToken(address,uint256,address)",
    "refundETH()",
    "selfPermit(address,uint256,uint256,uint8,bytes32,bytes32)"
  ])("denies dangerous dispatcher or token-authority signature %s", (dangerousSignature) => {
    const policy = validPolicy();
    const call = policy.calls[0];
    if (call === undefined) throw new Error("Test fixture requires one call permission.");
    policy.calls[0] = {
      ...call,
      operationKind: "dispatcher",
      selector: toFunctionSelector(dangerousSignature as `${string}(${string})`),
      signature: dangerousSignature
    };
    const reviewedCall = policy.calls[0];
    if (reviewedCall === undefined) throw new Error("Test fixture requires one call permission.");
    const context = validContext();
    context.reviewedContractManifest = [
      {
        ...reviewedCall,
        chainId: 97,
        safeDirectOperation: false
      }
    ];

    const codes = validateActivationPolicy(policy, context).issues.map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        dangerousSignature.startsWith("multicall")
          ? "BROAD_MULTICALL_NOT_ALLOWED"
          : "DANGEROUS_DISPATCHER_NOT_ALLOWED"
      ])
    );
  });

  it("allows a denied-by-name operation only when its exact entry is reviewed as safe and direct", () => {
    const policy = validPolicy();
    const call = policy.calls[0];
    if (call === undefined) throw new Error("Test fixture requires one call permission.");
    const reviewedDirectSignature = "refund()";
    policy.calls[0] = {
      ...call,
      operationKind: "direct",
      selector: toFunctionSelector(reviewedDirectSignature),
      signature: reviewedDirectSignature
    };
    const reviewedCall = policy.calls[0];
    if (reviewedCall === undefined) throw new Error("Test fixture requires one call permission.");
    const context = validContext();
    context.reviewedContractManifest = [
      {
        ...reviewedCall,
        chainId: 97,
        safeDirectOperation: true
      }
    ];

    expect(validateActivationPolicy(policy, context)).toMatchObject({ issues: [], valid: true });
  });

  it.each([
    ["recipient", attacker, "RECIPIENT_MISMATCH"],
    ["tokenId", "43", "TOKEN_ID_MISMATCH"]
  ] as const)("rejects a tampered runtime %s", (field, maliciousValue, issueCode) => {
    const policy = validPolicy();
    policy[field] = maliciousValue;

    expect(validateActivationPolicy(policy, validContext()).issues).toContainEqual(
      expect.objectContaining({ code: issueCode })
    );
  });

  it("rejects a tampered tick range and minimum output", () => {
    const policy = validPolicy();
    policy.tickRange = { lower: -1_200, upper: 1_200 };
    policy.minimumAmounts = [{ amountRaw: "1", token }];

    const codes = validateActivationPolicy(policy, validContext()).issues.map(
      (issue) => issue.code
    );
    expect(codes).toEqual(
      expect.arrayContaining(["TICK_RANGE_MISMATCH", "MINIMUM_AMOUNTS_MISMATCH"])
    );
  });

  it("rejects tampered wallet, deadline, and execution-count controls", () => {
    const policy = validPolicy();
    policy.wallet = attacker;
    policy.transactionDeadline -= 30;
    policy.maxExecutionsPerDay += 1;

    const codes = validateActivationPolicy(policy, validContext()).issues.map(
      (issue) => issue.code
    );
    expect(codes).toEqual(
      expect.arrayContaining(["WALLET_MISMATCH", "DEADLINE_MISMATCH", "MAX_EXECUTIONS_MISMATCH"])
    );
  });

  it("rejects a transaction deadline outside the quote and configured execution window", () => {
    const policy = validPolicy();
    policy.transactionDeadline = Math.floor(Date.parse("2026-08-11T12:06:00.000Z") / 1_000);
    const context = validContext();
    context.expectedRuntime = runtimeExpectationFromPolicy(policy);

    expect(validateActivationPolicy(policy, context).issues).toContainEqual(
      expect.objectContaining({ code: "TRANSACTION_DEADLINE_INVALID" })
    );
  });

  it("blocks an unapproved mainnet policy", () => {
    const policy = validPolicy();
    policy.chain = { chainId: 56, environment: "mainnet", name: "BSC" };

    const result = validateActivationPolicy(policy, {
      ...validContext(),
      expectedChainId: 56
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "MAINNET_REQUIRES_APPROVAL" })
    );
  });

  it("produces a stable canonical hash and detects policy tampering", () => {
    const policy = validPolicy();
    const reversedTopLevelKeys = Object.fromEntries(Object.entries(policy).reverse());
    const lowerCaseAddressPolicy = {
      ...policy,
      calls: policy.calls.map((call) => ({ ...call, to: call.to.toLowerCase() }))
    };
    const confirmedHash = hashActivationPolicy(policy);

    expect(hashActivationPolicy(reversedTopLevelKeys)).toBe(confirmedHash);
    expect(hashActivationPolicy(lowerCaseAddressPolicy)).toBe(confirmedHash);

    policy.slippageBps = 51;
    expect(hashActivationPolicy(policy)).not.toBe(confirmedHash);
    expect(
      validateActivationPolicy(policy, {
        ...validContext(),
        expectedPolicyHash: confirmedHash
      }).issues
    ).toContainEqual(expect.objectContaining({ code: "POLICY_HASH_MISMATCH" }));
  });
});
