import { toFunctionSelector } from "viem";
import { describe, expect, it, vi } from "vitest";

import { hashActivationPolicy, runtimeExpectationFromPolicy } from "./activation-policy";
import {
  buildLpActivationPolicy,
  type BuildLpActivationPolicyOptions,
  type LpActivationPolicyBuilderResult
} from "./lp-activation-policy";
import {
  LP_ACTIVATION_INTENT_SCHEMA_VERSION,
  LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
  PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
  PANCAKE_V3_BSC_TESTNET_FACTORY,
  PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  deriveLpActivationContextIds,
  lpActivationContextPayloadForId,
  type LpActivationIntent,
  type LpActivationServerContext
} from "./lp-activation-intent";
import { PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION } from "./pancake-v3-liquidity-quote";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const MAX_UINT256 = (2n ** 256n - 1n).toString(10);
const WALLET = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const TOKEN_0 = "0x3333333333333333333333333333333333333333";
const TOKEN_1 = "0x4444444444444444444444444444444444444444";
const POOL_DEPLOYER = "0x5555555555555555555555555555555555555555";
const WRAPPED_NATIVE = "0x6666666666666666666666666666666666666666";
const CONTEXT_ID = `0x${"10".repeat(32)}` as `0x${string}`;
const QUOTE_ID = `0x${"20".repeat(32)}` as `0x${string}`;
const CONTEXT_NONCE = `0x${"11".repeat(32)}` as `0x${string}`;
const QUOTE_NONCE = `0x${"21".repeat(32)}` as `0x${string}`;
const REVIEW_ID = `0x${"30".repeat(32)}` as `0x${string}`;
const BLOCK_HASH = `0x${"40".repeat(32)}` as `0x${string}`;
const MANAGER_CODE_HASH = `0x${"50".repeat(32)}` as `0x${string}`;
const FACTORY_CODE_HASH = `0x${"60".repeat(32)}` as `0x${string}`;
const POOL_CODE_HASH = `0x${"70".repeat(32)}` as `0x${string}`;
const POOL_DEPLOYER_CODE_HASH = `0x${"80".repeat(32)}` as `0x${string}`;
const WRAPPED_NATIVE_CODE_HASH = `0x${"90".repeat(32)}` as `0x${string}`;
const TOKEN_0_CODE_HASH = `0x${"a0".repeat(32)}` as `0x${string}`;
const TOKEN_1_CODE_HASH = `0x${"b0".repeat(32)}` as `0x${string}`;

function intentFixture(): LpActivationIntent {
  return {
    schemaVersion: LP_ACTIVATION_INTENT_SCHEMA_VERSION,
    chainId: 97,
    wallet: WALLET,
    recipient: WALLET,
    poolAddress: POOL,
    positionTokenId: MAX_UINT256,
    desiredTick: { lower: -120, upper: 120 },
    capital: { token0Raw: MAX_UINT256, token1Raw: "2000000" },
    maxSlippageBps: 50,
    sessionDurationSeconds: 3_600,
    txDeadlineSeconds: 30,
    maxExecutionsPerDay: 4
  };
}

function contextFixture(
  boundIntent: LpActivationIntent = intentFixture()
): LpActivationServerContext {
  const candidate: LpActivationServerContext = {
    schemaVersion: LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
    contextId: CONTEXT_ID,
    quoteId: QUOTE_ID,
    chainId: 97,
    environment: "testnet",
    issuedAt: "2026-08-11T11:59:50.000Z",
    expiresAt: "2026-08-11T12:00:40.000Z",
    authenticatedWallet: WALLET,
    intentBinding: boundIntent,
    reviewedDeployment: {
      protocol: "PancakeSwap V3",
      reviewId: REVIEW_ID,
      reviewedAt: "2026-08-01T00:00:00.000Z",
      sourceUrl: PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
      fee: 2_500,
      tickSpacing: 60,
      token0: { address: TOKEN_0, codeHash: TOKEN_0_CODE_HASH, decimals: 18 },
      token1: { address: TOKEN_1, codeHash: TOKEN_1_CODE_HASH, decimals: 6 },
      positionManager: {
        address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        codeHash: MANAGER_CODE_HASH
      },
      factory: {
        address: PANCAKE_V3_BSC_TESTNET_FACTORY,
        codeHash: FACTORY_CODE_HASH
      },
      pool: { address: POOL, codeHash: POOL_CODE_HASH },
      poolDeployer: { address: POOL_DEPLOYER, codeHash: POOL_DEPLOYER_CODE_HASH },
      wrappedNative: { address: WRAPPED_NATIVE, codeHash: WRAPPED_NATIVE_CODE_HASH }
    },
    observedDeployment: {
      blockNumber: "42000000",
      blockHash: BLOCK_HASH,
      positionManager: {
        address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        codeHash: MANAGER_CODE_HASH
      },
      factory: {
        address: PANCAKE_V3_BSC_TESTNET_FACTORY,
        codeHash: FACTORY_CODE_HASH
      },
      pool: { address: POOL, codeHash: POOL_CODE_HASH },
      poolDeployer: { address: POOL_DEPLOYER, codeHash: POOL_DEPLOYER_CODE_HASH },
      token0: { address: TOKEN_0, codeHash: TOKEN_0_CODE_HASH },
      token1: { address: TOKEN_1, codeHash: TOKEN_1_CODE_HASH },
      wrappedNative: { address: WRAPPED_NATIVE, codeHash: WRAPPED_NATIVE_CODE_HASH }
    },
    position: {
      fee: 2_500,
      managerAddress: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      ownerAddress: WALLET,
      poolAddress: POOL,
      tickLower: -60,
      tickUpper: 60,
      token0Address: TOKEN_0,
      token1Address: TOKEN_1,
      tokenId: MAX_UINT256
    },
    pool: {
      address: POOL,
      currentTick: 0,
      factoryAddress: PANCAKE_V3_BSC_TESTNET_FACTORY,
      fee: 2_500,
      sqrtPriceX96: "79228162514264337593543950336",
      tickSpacing: 60,
      token0: { address: TOKEN_0, decimals: 18 },
      token1: { address: TOKEN_1, decimals: 6 }
    },
    factoryRelation: {
      factoryAddress: PANCAKE_V3_BSC_TESTNET_FACTORY,
      fee: 2_500,
      poolAddress: POOL,
      tickSpacing: 60,
      token0Address: TOKEN_0,
      token1Address: TOKEN_1
    },
    authorization: {
      blockNumber: "42000000",
      blockHash: BLOCK_HASH,
      authorizationKind: "owner",
      controllerAddress: WALLET,
      controllerAuthorized: true,
      observedAt: "2026-08-11T11:59:35.000Z",
      ownerAddress: WALLET,
      positionTokenId: MAX_UINT256,
      source: "onchain_owner_and_controller_read"
    },
    block: {
      hash: BLOCK_HASH,
      number: "42000000",
      timestamp: "2026-08-11T11:59:30.000Z"
    },
    quote: {
      blockNumber: "42000000",
      blockHash: BLOCK_HASH,
      capitalToken0Raw: MAX_UINT256,
      capitalToken1Raw: "2000000",
      calculation: {
        currentTick: 0,
        exactLiquidityMatchRequired: true,
        methodologyVersion: PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION,
        preliminaryLiquidityRaw: "1",
        recomputedFromCalldataAtObservedPriceRaw: "1",
        sqrtPriceX96: "79228162514264337593543950336",
        tickLower: -120,
        tickUpper: 120
      },
      maxSlippageBps: 50,
      observedAt: "2026-08-11T11:59:40.000Z",
      poolAddress: POOL,
      sourceKind: "pancake_v3_block_pinned_math",
      sourceUrl: `https://testnet.bscscan.com/address/${POOL}`,
      token0: {
        address: TOKEN_0,
        capitalNotSubmittedRaw: "0",
        desiredMaximumRaw: MAX_UINT256,
        minimumAmountRaw: MAX_UINT256
      },
      token1: {
        address: TOKEN_1,
        capitalNotSubmittedRaw: "0",
        desiredMaximumRaw: "2000000",
        minimumAmountRaw: "1900000"
      },
      validUntil: "2026-08-11T12:00:40.000Z"
    }
  };
  return {
    ...candidate,
    ...deriveLpActivationContextIds(
      candidate.intentBinding,
      lpActivationContextPayloadForId(candidate),
      {
        contextNonce: CONTEXT_NONCE,
        quoteNonce: QUOTE_NONCE
      }
    )
  };
}

function optionsFixture(
  overrides: Partial<BuildLpActivationPolicyOptions> = {}
): BuildLpActivationPolicyOptions {
  return {
    agentId: "proofera:lp-range-guardian:v1",
    token0Symbol: "WBNB",
    token1Symbol: "USDT",
    expectedContextId: contextFixture().contextId as `0x${string}`,
    contextNonce: CONTEXT_NONCE,
    quoteNonce: QUOTE_NONCE,
    consumedContextIds: [],
    consumedQuoteIds: [],
    now: () => new Date(NOW),
    ...overrides
  };
}

function build(
  intent: unknown = intentFixture(),
  context: unknown = contextFixture(),
  options: unknown = optionsFixture()
): LpActivationPolicyBuilderResult {
  return buildLpActivationPolicy(intent, context, options);
}

function sourceCodes(result: LpActivationPolicyBuilderResult): (string | null)[] {
  return result.issues.map((entry) => entry.sourceCode);
}

describe("LP activation policy trust seam", () => {
  it("builds one deeply immutable, JSON-safe policy-only result", () => {
    const result = build();

    expect(result).toMatchObject({
      status: "ready",
      policy: {
        version: "1.0.0-draft",
        agentId: "proofera:lp-range-guardian:v1",
        category: "lp-rebalancing",
        chain: { chainId: 97, environment: "testnet", name: "BSC Testnet" },
        wallet: WALLET,
        recipient: WALLET,
        tokenId: MAX_UINT256,
        tickRange: { lower: -120, upper: 120 },
        slippageBps: 50,
        expiry: Math.floor(NOW.getTime() / 1_000) + 3_600,
        deadlineSeconds: 30,
        transactionDeadline: Math.floor(NOW.getTime() / 1_000) + 30,
        maxExecutionsPerDay: 4,
        registerInKeystore: true
      },
      sourceBinding: {
        contextId: contextFixture().contextId,
        quoteId: contextFixture().quoteId,
        contextIssuedAt: "2026-08-11T11:59:50.000Z",
        contextExpiresAt: "2026-08-11T12:00:40.000Z",
        blockNumber: "42000000",
        blockHash: BLOCK_HASH,
        blockTimestamp: "2026-08-11T11:59:30.000Z",
        resolvedAt: NOW.toISOString()
      },
      scopeBoundary: {
        outputKind: "validated_policy_only",
        authorityCreated: false,
        permissionPreviewCreated: false,
        walletSignatureRequested: false,
        transactionCalldataCreated: false,
        transactionSubmitted: false,
        executionPerformed: false,
        nativeAssetAuthority: false
      },
      issues: []
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== "ready") throw new Error("Expected ready policy fixture.");
    expect(Object.isFrozen(result.policy)).toBe(true);
    expect(Object.isFrozen(result.policy.calls)).toBe(true);
    expect(Object.isFrozen(result.reviewedManifest[0])).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect("preview" in result).toBe(false);
    expect("grant" in result).toBe(false);
    expect("transaction" in result).toBe(false);
    expect("execution" in result).toBe(false);
  });

  it("maps every source amount, cap, minimum, time, and token field exactly", () => {
    const result = build();
    if (result.status !== "ready") throw new Error("Expected ready policy fixture.");
    const policy = result.policy;

    expect(policy.capital).toEqual([
      { address: TOKEN_0, amountRaw: MAX_UINT256, decimals: 18, symbol: "WBNB" },
      { address: TOKEN_1, amountRaw: "2000000", decimals: 6, symbol: "USDT" }
    ]);
    expect(policy.spend).toEqual([
      { token: TOKEN_0, limitRaw: MAX_UINT256, period: "day" },
      { token: TOKEN_1, limitRaw: "2000000", period: "day" }
    ]);
    expect(policy.minimumAmounts).toEqual([
      { token: TOKEN_0, amountRaw: MAX_UINT256 },
      { token: TOKEN_1, amountRaw: "1900000" }
    ]);
    expect(policy.quote).toEqual({
      observedAt: "2026-08-11T11:59:40.000Z",
      validUntil: "2026-08-11T12:00:40.000Z",
      sourceUrl: `https://testnet.bscscan.com/address/${POOL}`
    });
    for (const spend of policy.spend) {
      const capital = policy.capital.find((entry) => entry.address === spend.token);
      expect(capital).toBeDefined();
      expect(BigInt(spend.limitRaw)).toBeLessThanOrEqual(BigInt(capital?.amountRaw ?? "0"));
    }
    expect(result.runtimeExpectation).toEqual(runtimeExpectationFromPolicy(policy));
    expect(result.policyHash).toBe(hashActivationPolicy(policy));
  });

  it("derives exactly four direct reviewed calls with the pinned manager code hash", () => {
    const result = build();
    if (result.status !== "ready") throw new Error("Expected ready policy fixture.");
    const signatures = [
      "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))",
      "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))",
      "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))",
      "collect((uint256,address,uint128,uint128))"
    ];

    expect(result.policy.calls).toHaveLength(4);
    expect(result.reviewedManifest).toHaveLength(4);
    expect(new Set(result.policy.calls.map((entry) => entry.signature))).toEqual(
      new Set(signatures)
    );
    for (const call of result.policy.calls) {
      expect(call).toMatchObject({
        to: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        operationKind: "direct",
        contractLabel: "PancakeSwap V3 Position Manager",
        expectedIdentity: { kind: "code_hash", codeHash: MANAGER_CODE_HASH }
      });
      expect(call.selector).toBe(
        toFunctionSelector(call.signature as `${string}(${string})`).toLowerCase()
      );
    }
    for (const entry of result.reviewedManifest) {
      expect(entry).toMatchObject({
        chainId: 97,
        to: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        operationKind: "direct",
        safeDirectOperation: true,
        expectedIdentity: { kind: "code_hash", codeHash: MANAGER_CODE_HASH }
      });
    }
    const forbidden = /multicall|execute|permit|approve|transfer|sweep|refund/i;
    expect(result.policy.calls.some((entry) => forbidden.test(entry.signature))).toBe(false);
    expect(result.policy.capital.every((entry) => typeof entry.address === "string")).toBe(true);
    expect(result.policy.spend.every((entry) => typeof entry.token === "string")).toBe(true);
  });

  it("captures the injected clock once and produces a stable canonical hash", () => {
    const firstClock = vi.fn(() => new Date(NOW));
    const secondClock = vi.fn(() => new Date(NOW));
    const first = build(intentFixture(), contextFixture(), optionsFixture({ now: firstClock }));
    const second = build(intentFixture(), contextFixture(), optionsFixture({ now: secondClock }));

    expect(firstClock).toHaveBeenCalledTimes(1);
    expect(secondClock).toHaveBeenCalledTimes(1);
    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(first.policyHash).toBe(second.policyHash);
    expect(first).toEqual(second);
  });

  it("re-resolves raw inputs and ignores forged ready/policy-shaped objects", () => {
    const ready = build();
    expect(ready.status).toBe("ready");
    const forgedResolution = { status: "ready", data: ready };
    const forgedIntent = build(forgedResolution, contextFixture());
    const forgedContext = build(intentFixture(), forgedResolution);
    const clientPolicyFields = build({ ...intentFixture(), calls: [], policyHash: CONTEXT_ID });

    expect(forgedIntent.status).toBe("blocked");
    expect(forgedContext.status).toBe("blocked");
    expect(clientPolicyFields.status).toBe("blocked");
    expect(sourceCodes(forgedIntent)).toContain("INTENT_SCHEMA_INVALID");
    expect(sourceCodes(forgedContext)).toContain("SERVER_CONTEXT_SCHEMA_INVALID");
    expect(sourceCodes(clientPolicyFields)).toEqual(
      expect.arrayContaining(["INTENT_FIELD_NOT_ALLOWED"])
    );
  });

  it("blocks context/quote replay and expected-context mismatch", () => {
    const context = contextFixture();
    const contextReplay = build(
      intentFixture(),
      context,
      optionsFixture({ consumedContextIds: [context.contextId as `0x${string}`] })
    );
    const quoteReplay = build(
      intentFixture(),
      context,
      optionsFixture({ consumedQuoteIds: [context.quoteId as `0x${string}`] })
    );
    const mismatch = build(
      intentFixture(),
      contextFixture(),
      optionsFixture({ expectedContextId: `0x${"99".repeat(32)}` as `0x${string}` })
    );

    expect(sourceCodes(contextReplay)).toContain("CONTEXT_REPLAYED");
    expect(sourceCodes(quoteReplay)).toContain("QUOTE_REPLAYED");
    expect(sourceCodes(mismatch)).toContain("CONTEXT_ID_MISMATCH");
    for (const result of [contextReplay, quoteReplay, mismatch]) {
      expect(result).toMatchObject({
        status: "blocked",
        policy: null,
        policyHash: null,
        reviewedManifest: [],
        runtimeExpectation: null
      });
    }
  });

  it("blocks stale evidence and reviewed/observed contract drift", () => {
    const context = contextFixture();
    const stale = build(intentFixture(), {
      ...context,
      issuedAt: "2026-08-11T11:57:00.000Z"
    });
    const drift = build(intentFixture(), {
      ...context,
      observedDeployment: {
        ...context.observedDeployment,
        positionManager: {
          ...context.observedDeployment.positionManager,
          codeHash: `0x${"88".repeat(32)}`
        }
      }
    });

    expect(sourceCodes(stale)).toContain("CONTEXT_STALE");
    expect(sourceCodes(drift)).toContain("CONTRACT_IDENTITY_MISMATCH");
  });

  it("keeps session expiry at or below the 24-hour resolver and policy limit", () => {
    const maximumIntent = { ...intentFixture(), sessionDurationSeconds: 24 * 60 * 60 };
    const maximumContext = contextFixture(maximumIntent);
    const maximum = build(
      maximumIntent,
      maximumContext,
      optionsFixture({ expectedContextId: maximumContext.contextId as `0x${string}` })
    );
    const excessive = build({ ...intentFixture(), sessionDurationSeconds: 24 * 60 * 60 + 1 });

    expect(maximum.status).toBe("ready");
    if (maximum.status === "ready") {
      expect(maximum.policy.expiry - Math.floor(NOW.getTime() / 1_000)).toBe(24 * 60 * 60);
    }
    expect(excessive.status).toBe("blocked");
    expect(sourceCodes(excessive)).toContain("SESSION_DURATION_OUT_OF_BOUNDS");
  });

  it.each([
    { label: "non-first-party agent", overrides: { agentId: "thirdparty:lp:v1" } },
    { label: "HTML token symbol", overrides: { token0Symbol: "<WBNB>" } },
    { label: "space-padded symbol", overrides: { token1Symbol: " USDT" } },
    { label: "duplicate symbols", overrides: { token1Symbol: "WBNB" } },
    { label: "missing symbol", overrides: { token0Symbol: undefined } },
    { label: "extra operations", overrides: { operations: ["multicall"] } }
  ])("strictly rejects $label in server-owned options", ({ overrides }) => {
    const result = build(intentFixture(), contextFixture(), {
      ...optionsFixture(),
      ...overrides
    });
    expect(result).toMatchObject({
      status: "blocked",
      issues: [{ code: "OPTIONS_INVALID", sourceCode: null }]
    });
  });

  it("fails closed on invalid/accessor clocks without invoking trust-field getters", () => {
    const invalid = build(
      intentFixture(),
      contextFixture(),
      optionsFixture({ now: () => new Date(Number.NaN) })
    );
    const accessor = buildLpActivationPolicy(intentFixture(), contextFixture(), {
      ...optionsFixture(),
      get now() {
        throw new Error("must not invoke an options getter");
      }
    });
    expect(invalid.issues[0]?.code).toBe("CLOCK_INVALID");
    expect(accessor.issues[0]?.code).toBe("OPTIONS_INVALID");
  });

  it("rejects symbolic or trap-based option records as non-plain server configuration", () => {
    const withSymbol = Object.assign(optionsFixture(), { [Symbol("hidden")]: true });
    const throwingProxy = new Proxy(optionsFixture(), {
      ownKeys() {
        throw new Error("options trap");
      }
    });

    expect(build(intentFixture(), contextFixture(), withSymbol).issues[0]?.code).toBe(
      "OPTIONS_INVALID"
    );
    expect(build(intentFixture(), contextFixture(), throwingProxy).issues[0]?.code).toBe(
      "OPTIONS_INVALID"
    );
  });

  it("bounds and sanitizes adversarial resolver issue output", () => {
    const hostileFields = Object.fromEntries(
      Array.from({ length: 180 }, (_, index) => [`hostile\nfield:${index}`, true])
    );
    const result = build({ ...intentFixture(), ...hostileFields });

    expect(result.status).toBe("blocked");
    expect(result.issues.length).toBeLessThanOrEqual(128);
    expect(result.issues.at(-1)).toMatchObject({
      code: "INTERNAL_VALIDATION_ERROR",
      sourceCode: "ADDITIONAL_ISSUES_OMITTED"
    });
    expect(JSON.stringify(result)).not.toContain("\\nfield");
  });
});
