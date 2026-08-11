import { describe, expect, it } from "vitest";

import {
  LP_ACTIVATION_INTENT_SCHEMA_VERSION,
  LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
  PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
  PANCAKE_V3_BSC_TESTNET_FACTORY,
  PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  deriveLpActivationContextIds,
  lpActivationContextPayloadForId,
  resolveLpActivationIntent,
  type LpActivationIntent,
  type LpActivationIntentIssueCode,
  type LpActivationServerContext,
  type ResolveLpActivationIntentOptions,
  type ResolveLpActivationIntentResult
} from "./lp-activation-intent";
import { PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION } from "./pancake-v3-liquidity-quote";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const MAX_UINT256 = (2n ** 256n - 1n).toString(10);
const OVERFLOW_UINT256 = (2n ** 256n).toString(10);
const WALLET = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const TOKEN_0 = "0x3333333333333333333333333333333333333333";
const TOKEN_1 = "0x4444444444444444444444444444444444444444";
const POOL_DEPLOYER = "0x5555555555555555555555555555555555555555";
const WRAPPED_NATIVE = "0x6666666666666666666666666666666666666666";
const CONTEXT_ID = `0x${"10".repeat(32)}`;
const QUOTE_ID = `0x${"20".repeat(32)}`;
const CONTEXT_NONCE = `0x${"11".repeat(32)}`;
const QUOTE_NONCE = `0x${"21".repeat(32)}`;
const REVIEW_ID = `0x${"30".repeat(32)}`;
const BLOCK_HASH = `0x${"40".repeat(32)}`;
const MANAGER_CODE_HASH = `0x${"50".repeat(32)}`;
const FACTORY_CODE_HASH = `0x${"60".repeat(32)}`;
const POOL_CODE_HASH = `0x${"70".repeat(32)}`;
const POOL_DEPLOYER_CODE_HASH = `0x${"80".repeat(32)}`;
const WRAPPED_NATIVE_CODE_HASH = `0x${"90".repeat(32)}`;
const TOKEN_0_CODE_HASH = `0x${"a0".repeat(32)}`;
const TOKEN_1_CODE_HASH = `0x${"b0".repeat(32)}`;

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

function contextFixture(): LpActivationServerContext {
  const candidate: LpActivationServerContext = {
    schemaVersion: LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
    contextId: CONTEXT_ID,
    quoteId: QUOTE_ID,
    chainId: 97,
    environment: "testnet",
    issuedAt: "2026-08-11T11:59:50.000Z",
    expiresAt: "2026-08-11T12:00:40.000Z",
    authenticatedWallet: WALLET,
    intentBinding: intentFixture(),
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
  overrides: Partial<ResolveLpActivationIntentOptions> = {}
): ResolveLpActivationIntentOptions {
  return {
    now: () => new Date(NOW),
    expectedContextId: contextFixture().contextId,
    contextNonce: CONTEXT_NONCE,
    quoteNonce: QUOTE_NONCE,
    consumedContextIds: [],
    consumedQuoteIds: [],
    ...overrides
  };
}

function resolve(
  intent: unknown = intentFixture(),
  context: unknown = contextFixture(),
  options: ResolveLpActivationIntentOptions = optionsFixture()
): ResolveLpActivationIntentResult {
  return resolveLpActivationIntent(intent, context, options);
}

function expectIssue(
  result: ResolveLpActivationIntentResult,
  code: LpActivationIntentIssueCode,
  path?: string
): void {
  expect(result.status).toBe("blocked");
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code, ...(path === undefined ? {} : { path }) })
    ])
  );
}

describe("resolveLpActivationIntent", () => {
  it("returns deeply immutable JSON-safe data with explicit field provenance", () => {
    const result = resolve();

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready fixture.");
    expect(result.issues).toEqual([]);
    expect(result.data.userIntent.positionTokenId).toBe(MAX_UINT256);
    expect(result.data.userIntent.capital.token0Raw).toBe(MAX_UINT256);
    expect(result.data.trustedEvidence.quote.token0.minimumAmountRaw).toBe(MAX_UINT256);
    expect(result.data.derived).toEqual({
      resolvedAt: "2026-08-11T12:00:00.000Z",
      sessionExpiresAtUnixSeconds: 1_786_453_200,
      sessionExpiresAtUtc: "2026-08-11T13:00:00.000Z",
      deadlineAtUnixSeconds: 1_786_449_630,
      deadlineAtUtc: "2026-08-11T12:00:30.000Z"
    });
    expect(result.data.fieldProvenance.userControlled).toContain("userIntent.capital.token0Raw");
    expect(result.data.fieldProvenance.serverOwned).toContain("trustedEvidence.reviewedDeployment");
    expect(result.data.scopeBoundary).toBe(
      "Resolved data only. No policy, authority, submission, or execution has been created."
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.data)).toBe(true);
    expect(Object.isFrozen(result.data.trustedEvidence.quote.token0)).toBe(true);
    expect(JSON.parse(JSON.stringify(result.data))).toEqual(result.data);
  });

  it("rejects attacker-supplied trust fields at top level and inside capital", () => {
    const intent = intentFixture();
    const result = resolve({
      ...intent,
      managerAddress: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      selector: "0x12345678",
      quoteSource: "https://attacker.test",
      capital: { ...intent.capital, token0Address: TOKEN_0 }
    });

    expectIssue(result, "INTENT_FIELD_NOT_ALLOWED", "managerAddress");
    expectIssue(result, "INTENT_FIELD_NOT_ALLOWED", "selector");
    expectIssue(result, "INTENT_FIELD_NOT_ALLOWED", "quoteSource");
    expectIssue(result, "INTENT_FIELD_NOT_ALLOWED", "capital.token0Address");
  });

  it("accepts BSC testnet only", () => {
    expectIssue(resolve({ ...intentFixture(), chainId: 56 }), "INTENT_SCHEMA_INVALID", "chainId");
    expectIssue(
      resolve(intentFixture(), { ...contextFixture(), environment: "mainnet" }),
      "SERVER_CONTEXT_SCHEMA_INVALID",
      "environment"
    );
  });

  it("blocks wallet, recipient, authenticated wallet, pool, and token ID drift", () => {
    expectIssue(
      resolve({ ...intentFixture(), recipient: TOKEN_0 }),
      "WALLET_RECIPIENT_MISMATCH",
      "recipient"
    );
    expectIssue(
      resolve(intentFixture(), { ...contextFixture(), authenticatedWallet: TOKEN_0 }),
      "AUTHENTICATED_WALLET_MISMATCH",
      "wallet"
    );
    expectIssue(
      resolve({ ...intentFixture(), poolAddress: TOKEN_0 }),
      "POOL_BINDING_MISMATCH",
      "poolAddress"
    );
    expectIssue(
      resolve({ ...intentFixture(), positionTokenId: "43" }),
      "POSITION_TOKEN_ID_MISMATCH",
      "positionTokenId"
    );
  });

  it("authenticates every execution-relevant intent field and the complete quote payload", () => {
    const intent = intentFixture();
    const context = contextFixture();
    for (const changedIntent of [
      { ...intent, desiredTick: { lower: -60, upper: 180 } },
      { ...intent, sessionDurationSeconds: 7_200 },
      { ...intent, txDeadlineSeconds: 40 },
      { ...intent, maxExecutionsPerDay: 5 }
    ]) {
      expectIssue(
        resolve(changedIntent, context, optionsFixture({ expectedContextId: context.contextId })),
        "INTENT_BINDING_MISMATCH",
        "serverContext.intentBinding"
      );
    }

    expectIssue(
      resolve(
        intent,
        {
          ...context,
          quote: {
            ...context.quote,
            token1: { ...context.quote.token1, minimumAmountRaw: "1800000" }
          }
        },
        optionsFixture({ expectedContextId: context.contextId })
      ),
      "CONTEXT_INTEGRITY_MISMATCH",
      "serverContext.contextId"
    );
    expectIssue(
      resolve(
        intent,
        {
          ...context,
          quote: {
            ...context.quote,
            calculation: { ...context.quote.calculation, tickUpper: 180 }
          }
        },
        optionsFixture({ expectedContextId: context.contextId })
      ),
      "QUOTE_ID_MISMATCH",
      "serverContext.quoteId"
    );
  });

  it("rejects non-official deployments and malicious observed code identity", () => {
    const context = contextFixture();
    const maliciousManager = TOKEN_0;
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        reviewedDeployment: {
          ...context.reviewedDeployment,
          positionManager: {
            ...context.reviewedDeployment.positionManager,
            address: maliciousManager
          }
        },
        observedDeployment: {
          ...context.observedDeployment,
          positionManager: {
            ...context.observedDeployment.positionManager,
            address: maliciousManager
          }
        },
        position: { ...context.position, managerAddress: maliciousManager }
      }),
      "OFFICIAL_MANAGER_MISMATCH"
    );

    expectIssue(
      resolve(intentFixture(), {
        ...context,
        observedDeployment: {
          ...context.observedDeployment,
          pool: { ...context.observedDeployment.pool, codeHash: MANAGER_CODE_HASH }
        }
      }),
      "CONTRACT_IDENTITY_MISMATCH",
      "serverContext.observedDeployment.pool"
    );

    expectIssue(
      resolve(intentFixture(), {
        ...context,
        observedDeployment: {
          ...context.observedDeployment,
          token0: { ...context.observedDeployment.token0, codeHash: TOKEN_1_CODE_HASH }
        }
      }),
      "CONTRACT_IDENTITY_MISMATCH",
      "serverContext.observedDeployment.token0"
    );

    expectIssue(
      resolve(intentFixture(), {
        ...context,
        reviewedDeployment: {
          ...context.reviewedDeployment,
          poolDeployer: {
            ...context.reviewedDeployment.poolDeployer,
            address: context.reviewedDeployment.pool.address
          }
        },
        observedDeployment: {
          ...context.observedDeployment,
          poolDeployer: {
            ...context.observedDeployment.poolDeployer,
            address: context.observedDeployment.pool.address
          }
        }
      }),
      "DEPLOYMENT_ADDRESS_COLLISION"
    );

    expectIssue(
      resolve(intentFixture(), {
        ...context,
        reviewedDeployment: {
          ...context.reviewedDeployment,
          sourceUrl: "https://attacker.test/fake-manifest.json"
        }
      }),
      "REVIEW_SOURCE_MISMATCH"
    );
  });

  it("rejects unauthorized or drifted owner/controller evidence", () => {
    const context = contextFixture();
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        authorization: { ...context.authorization, controllerAuthorized: false }
      }),
      "CONTROLLER_NOT_AUTHORIZED"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        authorization: { ...context.authorization, ownerAddress: TOKEN_0 }
      }),
      "AUTHORIZATION_EVIDENCE_MISMATCH"
    );
  });

  it("rejects stale, future, expired, and replayed server contexts", () => {
    const context = contextFixture();
    expectIssue(
      resolve(intentFixture(), { ...context, issuedAt: "2026-08-11T12:00:01.000Z" }),
      "CONTEXT_FROM_FUTURE"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        issuedAt: "2026-08-11T11:57:00.000Z",
        expiresAt: "2026-08-11T12:00:30.000Z"
      }),
      "CONTEXT_STALE"
    );
    expectIssue(
      resolve(intentFixture(), { ...context, expiresAt: "2026-08-11T11:59:59.000Z" }),
      "CONTEXT_EXPIRED"
    );
    expectIssue(
      resolve(
        intentFixture(),
        context,
        optionsFixture({ consumedContextIds: [context.contextId] })
      ),
      "CONTEXT_REPLAYED"
    );
    expectIssue(
      resolve(intentFixture(), context, optionsFixture({ consumedQuoteIds: [context.quoteId] })),
      "QUOTE_REPLAYED"
    );
    expectIssue(
      resolve(intentFixture(), context, optionsFixture({ expectedContextId: REVIEW_ID })),
      "CONTEXT_ID_MISMATCH"
    );
  });

  it("rejects future, stale, malformed, or cross-block evidence", () => {
    const context = contextFixture();
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        block: { ...context.block, timestamp: "2026-08-11T12:00:01.000Z" }
      }),
      "BLOCK_FROM_FUTURE"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        block: { ...context.block, timestamp: "2026-08-11T11:57:00.000Z" }
      }),
      "BLOCK_STALE"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        block: { ...context.block, number: "042000000" },
        observedDeployment: { ...context.observedDeployment, blockNumber: "042000000" },
        authorization: { ...context.authorization, blockNumber: "042000000" },
        quote: { ...context.quote, blockNumber: "042000000" }
      }),
      "BLOCK_IDENTITY_INVALID"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        authorization: { ...context.authorization, blockHash: REVIEW_ID }
      }),
      "EVIDENCE_BLOCK_MISMATCH"
    );
  });

  it("rejects uint256 overflow, leading zeros, and non-positive capital", () => {
    const intent = intentFixture();
    expectIssue(
      resolve({
        ...intent,
        capital: { ...intent.capital, token0Raw: OVERFLOW_UINT256 }
      }),
      "CAPITAL_AMOUNT_INVALID",
      "capital.token0Raw"
    );
    expectIssue(
      resolve({ ...intent, capital: { ...intent.capital, token1Raw: "01" } }),
      "CAPITAL_AMOUNT_INVALID",
      "capital.token1Raw"
    );
    expectIssue(
      resolve({ ...intent, capital: { ...intent.capital, token1Raw: "0" } }),
      "CAPITAL_AMOUNT_INVALID",
      "capital.token1Raw"
    );

    const context = contextFixture();
    expectIssue(
      resolve(
        { ...intent, positionTokenId: "01" },
        {
          ...context,
          position: { ...context.position, tokenId: "01" },
          authorization: { ...context.authorization, positionTokenId: "01" }
        }
      ),
      "POSITION_TOKEN_ID_INVALID",
      "positionTokenId"
    );
  });

  it("enforces tick bounds, order, and exact pool spacing", () => {
    const intent = intentFixture();
    expectIssue(
      resolve({ ...intent, desiredTick: { lower: -887_273, upper: 120 } }),
      "TICK_OUT_OF_BOUNDS"
    );
    expectIssue(
      resolve({ ...intent, desiredTick: { lower: 120, upper: -120 } }),
      "TICK_ORDER_INVALID"
    );
    expectIssue(
      resolve({ ...intent, desiredTick: { lower: -119, upper: 120 } }),
      "DESIRED_TICK_NOT_ALIGNED"
    );

    const context = contextFixture();
    expectIssue(
      resolve(intent, {
        ...context,
        factoryRelation: { ...context.factoryRelation, tickSpacing: 10 }
      }),
      "TICK_SPACING_INVALID"
    );
  });

  it("rejects expired, future, stale, overlong, and block-drifted quotes", () => {
    const context = contextFixture();
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: { ...context.quote, observedAt: "2026-08-11T12:00:01.000Z" }
      }),
      "QUOTE_FROM_FUTURE"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: {
          ...context.quote,
          observedAt: "2026-08-11T11:57:00.000Z",
          validUntil: "2026-08-11T12:05:00.000Z"
        }
      }),
      "QUOTE_TOO_OLD"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: { ...context.quote, validUntil: "2026-08-11T11:59:59.000Z" }
      }),
      "QUOTE_EXPIRED"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: { ...context.quote, validUntil: "2026-08-11T12:20:00.000Z" }
      }),
      "QUOTE_TTL_TOO_LONG"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: { ...context.quote, blockHash: REVIEW_ID }
      }),
      "QUOTE_BLOCK_MISMATCH"
    );
  });

  it("binds quote inputs and minimum outputs to capital and token order", () => {
    const context = contextFixture();
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: { ...context.quote, capitalToken0Raw: "1" }
      }),
      "QUOTE_BINDING_MISMATCH"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: {
          ...context.quote,
          token0: { ...context.quote.token0, minimumAmountRaw: OVERFLOW_UINT256 }
        }
      }),
      "MINIMUM_AMOUNT_INVALID"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: {
          ...context.quote,
          token1: { ...context.quote.token1, minimumAmountRaw: "2000001" }
        }
      }),
      "MINIMUM_EXCEEDS_CAPITAL"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: {
          ...context.quote,
          token0: { ...context.quote.token0, address: TOKEN_1 }
        }
      }),
      "MINIMUM_TOKEN_MISMATCH"
    );
  });

  it("binds block price, liquidity stages, calldata maxima, and provenance exactly", () => {
    const context = contextFixture();
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        pool: { ...context.pool, sqrtPriceX96: "01" }
      }),
      "POOL_PRICE_INVALID"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: {
          ...context.quote,
          calculation: { ...context.quote.calculation, currentTick: 1 }
        }
      }),
      "QUOTE_CALCULATION_MISMATCH"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: {
          ...context.quote,
          calculation: {
            ...context.quote.calculation,
            recomputedFromCalldataAtObservedPriceRaw: "2"
          }
        }
      }),
      "QUOTE_CALCULATION_MISMATCH"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: {
          ...context.quote,
          token1: { ...context.quote.token1, desiredMaximumRaw: OVERFLOW_UINT256 }
        }
      }),
      "CALLDATA_AMOUNT_INVALID"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: {
          ...context.quote,
          token1: { ...context.quote.token1, capitalNotSubmittedRaw: "1" }
        }
      }),
      "CALLDATA_AMOUNT_RELATION_INVALID"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: {
          ...context.quote,
          token1: {
            ...context.quote.token1,
            capitalNotSubmittedRaw: "100000",
            desiredMaximumRaw: "1900000",
            minimumAmountRaw: "1900001"
          }
        }
      }),
      "MINIMUM_EXCEEDS_CALLDATA"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        quote: { ...context.quote, sourceUrl: "https://example.com/pool" }
      }),
      "QUOTE_SOURCE_MISMATCH"
    );
  });

  it("rejects duplicate or confused pool tokens and malicious decimals", () => {
    const context = contextFixture();
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        reviewedDeployment: {
          ...context.reviewedDeployment,
          token1: { ...context.reviewedDeployment.token1, address: TOKEN_0 }
        },
        position: { ...context.position, token1Address: TOKEN_0 },
        pool: { ...context.pool, token1: { ...context.pool.token1, address: TOKEN_0 } },
        factoryRelation: { ...context.factoryRelation, token1Address: TOKEN_0 },
        quote: { ...context.quote, token1: { ...context.quote.token1, address: TOKEN_0 } }
      }),
      "DUPLICATE_POOL_TOKEN"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        position: {
          ...context.position,
          token0Address: TOKEN_1,
          token1Address: TOKEN_0
        }
      }),
      "TOKEN_RELATION_MISMATCH"
    );
    expectIssue(
      resolve(intentFixture(), {
        ...context,
        pool: {
          ...context.pool,
          token0: { ...context.pool.token0, decimals: 6 }
        }
      }),
      "TOKEN_RELATION_MISMATCH"
    );
  });

  it("enforces session, quote, and deadline relationships and user bounds", () => {
    const intent = intentFixture();
    expectIssue(resolve({ ...intent, maxSlippageBps: 101 }), "SLIPPAGE_OUT_OF_BOUNDS");
    expectIssue(
      resolve({ ...intent, sessionDurationSeconds: 299 }),
      "SESSION_DURATION_OUT_OF_BOUNDS"
    );
    expectIssue(resolve({ ...intent, txDeadlineSeconds: 1_801 }), "TX_DEADLINE_OUT_OF_BOUNDS");
    expectIssue(
      resolve({ ...intent, sessionDurationSeconds: 300, txDeadlineSeconds: 600 }),
      "TX_DEADLINE_EXCEEDS_SESSION"
    );
    expectIssue(resolve({ ...intent, maxExecutionsPerDay: 145 }), "EXECUTION_LIMIT_OUT_OF_BOUNDS");

    const context = contextFixture();
    expectIssue(
      resolve(intent, {
        ...context,
        quote: { ...context.quote, validUntil: "2026-08-11T12:00:20.000Z" }
      }),
      "DEADLINE_QUOTE_RELATION_INVALID"
    );
    expectIssue(
      resolve(
        { ...intent, sessionDurationSeconds: 300 },
        {
          ...context,
          expiresAt: "2026-08-11T12:05:01.000Z"
        }
      ),
      "SESSION_QUOTE_RELATION_INVALID"
    );
  });

  it("rejects unknown server-context fields and invalid injected clocks", () => {
    expectIssue(
      resolve(intentFixture(), { ...contextFixture(), trustedBecause: "user said so" }),
      "SERVER_CONTEXT_SCHEMA_INVALID"
    );
    expectIssue(
      resolve(
        intentFixture(),
        contextFixture(),
        optionsFixture({ now: () => new Date("invalid") })
      ),
      "CLOCK_INVALID",
      "resolver.now"
    );
    expectIssue(
      resolve(
        intentFixture(),
        contextFixture(),
        optionsFixture({
          now: () => {
            throw new Error("clock unavailable");
          }
        })
      ),
      "CLOCK_INVALID",
      "resolver.now"
    );
  });
});
