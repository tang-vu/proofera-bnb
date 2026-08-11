import { describe, expect, it } from "vitest";

import { AgentPassportSchema, GridRangeSchema, TradingCostsSchema } from "./agent.js";
import type { EvidenceEnvironment, MetricUnit } from "./evidence.js";

const observedAt = "2026-08-11T08:00:00.000Z";
const ingestedAt = "2026-08-11T08:00:02.000Z";
const address = "0x1111111111111111111111111111111111111111";
const registryAddress = "0x2222222222222222222222222222222222222222";
const transactionHash = `0x${"a".repeat(64)}`;

const methodology = {
  summary: "Deterministic test observation from a named fixture dataset.",
  version: "1.0.0-test",
  observationWindow: {
    start: "2026-08-01T00:00:00.000Z",
    end: observedAt
  },
  limitations: ["This is schema-validation evidence, not live performance evidence."]
} as const;

const available = <T, U extends MetricUnit>(
  value: T,
  unit: U,
  environment: EvidenceEnvironment
) => ({
  availability: "available" as const,
  value,
  unit,
  source: {
    kind: "fixture" as const,
    label: "Passport schema fixture",
    locator: {
      type: "external-id" as const,
      id: `packages/domain/src/agent.test.ts#${environment}`
    }
  },
  observedAt,
  ingestedAt,
  methodology,
  freshness: "fresh" as const,
  environment,
  reason: null,
  expectedSource: null,
  attemptedAt: null,
  error: null,
  lastGood: null
});

const unavailable = <U extends MetricUnit>(unit: U, environment: EvidenceEnvironment) => ({
  availability: "unavailable" as const,
  value: null,
  unit,
  source: null,
  observedAt: null,
  ingestedAt,
  methodology,
  freshness: "unknown" as const,
  environment,
  reason: "The expected fixture source was temporarily unavailable.",
  expectedSource: {
    kind: "fixture" as const,
    label: "Passport schema fixture",
    locator: {
      type: "external-id" as const,
      id: `packages/domain/src/agent.test.ts#${environment}`
    }
  },
  attemptedAt: observedAt,
  error: {
    provider: "Passport schema fixture",
    code: "FIXTURE_UNAVAILABLE",
    message: "The requested fixture observation was intentionally unavailable.",
    retryable: false
  },
  lastGood: null
});

const asset = (chainId: number) => ({
  symbol: "USDT",
  chainId,
  address,
  decimals: 18
});

const commonMetrics = (
  environment: EvidenceEnvironment,
  network: "testnet" | "mainnet" = "testnet"
) => {
  const chain =
    network === "mainnet"
      ? { chainId: 56 as const, name: "BNB Smart Chain" as const, network: "mainnet" as const }
      : {
          chainId: 97 as const,
          name: "BNB Smart Chain Testnet" as const,
          network: "testnet" as const
        };

  return {
    identity: available(
      {
        standard: "ERC-8004" as const,
        agentId: "7",
        registryAddress,
        metadataLocator: { type: "http" as const, url: "https://example.com/agents/7" }
      },
      "none",
      environment
    ),
    owner: available(address, "none", environment),
    chain: available(chain, "none", environment),
    registration: available(
      {
        standard: "ERC-8004" as const,
        agentId: "7",
        registryAddress,
        transactionHash,
        registeredAt: "2026-08-01T00:00:00.000Z"
      },
      "none",
      environment
    ),
    verification: available(
      {
        status: "unverified" as const,
        verifier: null,
        verifiedAt: null,
        claims: [],
        reason: "No independent verifier has attested to this agent yet."
      },
      "none",
      environment
    ),
    lifecycleStatus: available("live" as const, "none", environment),
    lastActivityAt: available("2026-08-11T07:55:00.000Z", "timestamp", environment),
    executionCount: available(20, "count", environment),
    successRate: available(0.9, "ratio", environment),
    fees: available(
      {
        kind: "flat" as const,
        amountUsd: 0.25,
        chargedPer: "execution" as const,
        description: "A fixed execution fee, excluding protocol and gas costs."
      },
      "none",
      environment
    ),
    uptime: available(0.995, "ratio", environment),
    dataFreshness: available(
      {
        newestObservedAt: observedAt,
        oldestObservedAt: "2026-08-01T00:00:00.000Z",
        totalMetricCount: 18,
        freshMetricCount: 17,
        staleMetricCount: 0,
        expiredMetricCount: 0,
        unknownMetricCount: 1
      },
      "none",
      environment
    ),
    risk: available(
      {
        level: "medium" as const,
        score: 42,
        factors: [
          {
            code: "SMART_CONTRACT",
            severity: "medium" as const,
            description: "The strategy interacts with external protocol contracts.",
            mitigation: "Targets and selectors are allowlisted in the session scope."
          }
        ],
        worstObservedOutcome: null
      },
      "none",
      environment
    ),
    reputation: available(
      {
        rating: 4.5,
        reviewCount: 10,
        positiveReviewRatio: 0.9
      },
      "none",
      environment
    ),
    supportedAssets: available([asset(chain.chainId)], "none", environment),
    supportedProtocols: available(
      [
        {
          name: "Example Protocol",
          documentationUrl: "https://example.com/docs",
          contractAddresses: [address]
        }
      ],
      "none",
      environment
    ),
    minimumCapitalUsd: available(100, "usd", environment),
    permissionSummary: available(
      {
        calls: [
          {
            targetContract: address,
            functionSignature: "execute(uint256)",
            functionSelector: "0x12345678"
          }
        ],
        spendCaps: [
          {
            token: asset(chain.chainId),
            amountBaseUnits: "500000000000000000000",
            period: { kind: "session" as const }
          }
        ],
        enforcementLayer: "session-key-policy" as const,
        expiresAt: "2026-08-12T08:00:00.000Z",
        revocable: true
      },
      "none",
      environment
    )
  };
};

const metadata = {
  name: "ProofEra Reference Agent",
  summary: "A bounded reference strategy used to validate the passport contract.",
  operatorName: "ProofEra",
  operatorType: "first-party" as const,
  iconUrl: null,
  documentationUrl: "https://example.com/docs/agent",
  tags: ["reference", "bounded"]
};

const lpPassport = {
  passportVersion: "1.0.0" as const,
  slug: "lp-range-reference",
  environment: "testnet" as const,
  metadata,
  common: commonMetrics("testnet"),
  category: "lp-rebalancing" as const,
  categoryMetrics: {
    inRangeTime: available(0.82, "ratio", "testnet"),
    feeAprPct: available(12.4, "percent", "testnet"),
    estimatedImpermanentLossPct: available(2.1, "percent", "testnet"),
    rebalanceFrequency: available({ count: 4, periodDays: 30 }, "count", "testnet"),
    gasDragPct: available(0.35, "percent", "testnet"),
    netPerformancePct: available(3.6, "percent", "testnet")
  }
};

const gridPassport = {
  passportVersion: "1.0.0" as const,
  slug: "bounded-grid-reference",
  environment: "simulation" as const,
  metadata,
  common: commonMetrics("simulation"),
  category: "grid-trading" as const,
  categoryMetrics: {
    realizedPnlUsd: available(18.5, "usd", "simulation"),
    fills: available(31, "count", "simulation"),
    winRate: available(0.61, "ratio", "simulation"),
    maximumDrawdownPct: available(4.4, "percent", "simulation"),
    turnoverUsd: available(2_800, "usd", "simulation"),
    configuredRange: available(
      {
        baseAsset: "WBNB",
        quoteAsset: "USDT",
        lowerPrice: "760",
        upperPrice: "840"
      },
      "none",
      "simulation"
    ),
    costs: available(
      {
        gasUsd: "1.20",
        tradingFeesUsd: "4.50",
        slippageUsd: "0.80",
        agentFeesUsd: "0.25",
        otherUsd: "0",
        totalUsd: "6.75"
      },
      "usd",
      "simulation"
    )
  }
};

const yieldPassport = {
  passportVersion: "1.0.0" as const,
  slug: "stable-yield-reference",
  environment: "mainnet" as const,
  metadata,
  common: commonMetrics("mainnet", "mainnet"),
  category: "yield-optimisation" as const,
  categoryMetrics: {
    baseApyPct: available(3.1, "percent", "mainnet"),
    rewardApyPct: available(1.4, "percent", "mainnet"),
    netApyPct: available(4.1, "percent", "mainnet"),
    tvlUsd: available(8_000_000, "usd", "mainnet"),
    liquidityUsd: available(3_000_000, "usd", "mainnet"),
    protocolExposure: available(
      [{ protocol: "Example Protocol", asset: "USDT", allocationRatio: 1 }],
      "ratio",
      "mainnet"
    ),
    withdrawalConstraints: available(
      {
        lockupEndsAt: null,
        cooldownSeconds: 0,
        exitFeePct: 0,
        minimumWithdrawalBaseUnits: "1",
        notes: ["Withdrawals remain subject to protocol liquidity."]
      },
      "none",
      "mainnet"
    ),
    routeHistory: available(
      [
        {
          enteredAt: "2026-08-10T00:00:00.000Z",
          exitedAt: null,
          protocol: "Example Protocol",
          asset: "USDT",
          amountBaseUnits: "1000000000000000000",
          transactionHash
        }
      ],
      "count",
      "mainnet"
    ),
    gasImpactPct: available(0.12, "percent", "mainnet")
  }
};

const healthPassport = {
  passportVersion: "1.0.0" as const,
  slug: "health-guardian-reference",
  environment: "fixture" as const,
  metadata,
  common: commonMetrics("fixture"),
  category: "health-factor-monitoring" as const,
  categoryMetrics: {
    currentHealthFactor: available(1.8, "ratio", "fixture"),
    minimumHealthFactor: available(1.42, "ratio", "fixture"),
    monitoredCollateral: available(
      [{ asset: asset(97), amountBaseUnits: "1000000000000000000", valueUsd: 800 }],
      "base_units",
      "fixture"
    ),
    monitoredDebt: available(
      [{ asset: asset(97), amountBaseUnits: "300000000000000000", valueUsd: 300 }],
      "base_units",
      "fixture"
    ),
    alertLatencySeconds: available(5, "seconds", "fixture"),
    interventionPolicy: available(
      {
        warningHealthFactor: 1.5,
        criticalHealthFactor: 1.2,
        action: "alert-only" as const,
        maximumRepayBps: 0,
        allowedProtocols: ["Example Protocol"],
        humanConfirmationRequired: true
      },
      "none",
      "fixture"
    ),
    executionHistory: available(
      [
        {
          occurredAt: observedAt,
          action: "alert" as const,
          status: "succeeded" as const,
          healthFactorBefore: 1.42,
          healthFactorAfter: 1.42,
          transactionHash: null
        }
      ],
      "count",
      "fixture"
    ),
    liquidationRiskThresholds: available(
      {
        protocolLiquidationHealthFactor: 1,
        criticalHealthFactor: 1.2,
        warningHealthFactor: 1.5
      },
      "ratio",
      "fixture"
    )
  }
};

describe("AgentPassportSchema", () => {
  it.each([
    ["LP rebalancing", lpPassport, "lp-rebalancing"],
    ["grid trading", gridPassport, "grid-trading"],
    ["yield optimisation", yieldPassport, "yield-optimisation"],
    ["health-factor monitoring", healthPassport, "health-factor-monitoring"]
  ] as const)("accepts a complete %s passport", (_label, passport, category) => {
    const result = AgentPassportSchema.parse(passport);

    expect(result.category).toBe(category);
  });

  it("preserves an explicit unverified verification state", () => {
    const result = AgentPassportSchema.parse(lpPassport);

    expect(result.common.verification.availability).toBe("available");
    if (result.common.verification.availability === "available") {
      expect(result.common.verification.value.status).toBe("unverified");
    }
  });

  it("accepts a missing metric only when it uses an explicit unavailable envelope", () => {
    const passport = {
      ...lpPassport,
      categoryMetrics: {
        ...lpPassport.categoryMetrics,
        feeAprPct: unavailable("percent", "testnet")
      }
    };

    const result = AgentPassportSchema.parse(passport);
    expect(result.category).toBe("lp-rebalancing");
    if (result.category === "lp-rebalancing") {
      expect(result.categoryMetrics.feeAprPct.availability).toBe("unavailable");
    }
  });

  it("rejects a bare category metric", () => {
    const passport = {
      ...lpPassport,
      categoryMetrics: {
        ...lpPassport.categoryMetrics,
        feeAprPct: 12.4
      }
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });

  it("rejects category labels whose metric schema does not match", () => {
    const passport = {
      ...lpPassport,
      category: "grid-trading"
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });

  it("rejects mainnet classification paired with BSC testnet", () => {
    const passport = {
      ...yieldPassport,
      common: commonMetrics("mainnet", "testnet")
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });

  it("rejects an impossible historical minimum health factor", () => {
    const passport = {
      ...healthPassport,
      categoryMetrics: {
        ...healthPassport.categoryMetrics,
        minimumHealthFactor: available(2.1, "ratio", "fixture")
      }
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });

  it("rejects unrecognized passport fields", () => {
    const passport = {
      ...lpPassport,
      promotionalApr: 99
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });
});

describe("unit and permission integrity", () => {
  it("preserves each target, signature, and selector as one permission record", () => {
    const result = AgentPassportSchema.parse(lpPassport);

    expect(result.common.permissionSummary.unit).toBe("none");
    if (result.common.permissionSummary.availability === "available") {
      expect(result.common.permissionSummary.value).toMatchObject({
        calls: [
          {
            targetContract: address,
            functionSignature: "execute(uint256)",
            functionSelector: "0x12345678"
          }
        ],
        spendCaps: [
          {
            amountBaseUnits: "500000000000000000000",
            period: { kind: "session" }
          }
        ],
        enforcementLayer: "session-key-policy"
      });
    }
  });

  it("rejects duplicate target-selector permission pairs", () => {
    const common = commonMetrics("testnet");
    const permission = common.permissionSummary.value;
    const passport = {
      ...lpPassport,
      common: {
        ...common,
        permissionSummary: available(
          {
            ...permission,
            calls: [...permission.calls, permission.calls[0]]
          },
          "none",
          "testnet"
        )
      }
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });

  it("rejects duplicate caps for the same token and enforcement period", () => {
    const common = commonMetrics("testnet");
    const permission = common.permissionSummary.value;
    const passport = {
      ...lpPassport,
      common: {
        ...common,
        permissionSummary: available(
          {
            ...permission,
            spendCaps: [...permission.spendCaps, permission.spendCaps[0]]
          },
          "none",
          "testnet"
        )
      }
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });

  it("rejects a permission spend cap for a different chain", () => {
    const common = commonMetrics("testnet");
    const permission = common.permissionSummary.value;
    const passport = {
      ...lpPassport,
      common: {
        ...common,
        permissionSummary: available(
          {
            ...permission,
            spendCaps: [
              {
                token: asset(56),
                amountBaseUnits: "1",
                period: { kind: "per-transaction" as const }
              }
            ]
          },
          "none",
          "testnet"
        )
      }
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });

  it("rejects the legacy unpaired target and selector arrays", () => {
    const passport = {
      ...lpPassport,
      common: {
        ...lpPassport.common,
        permissionSummary: available(
          {
            targetContracts: [address],
            functionSelectors: ["0x12345678"],
            spendCapUsd: 500,
            expiresAt: "2026-08-12T08:00:00.000Z",
            revocable: true
          },
          "none",
          "testnet"
        )
      }
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });

  it("rejects a percent metric mislabeled as a ratio", () => {
    const passport = {
      ...lpPassport,
      categoryMetrics: {
        ...lpPassport.categoryMetrics,
        feeAprPct: { ...lpPassport.categoryMetrics.feeAprPct, unit: "ratio" }
      }
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });

  it("rejects unsafe metadata URLs", () => {
    const passport = {
      ...lpPassport,
      metadata: {
        ...lpPassport.metadata,
        documentationUrl: "javascript:alert(1)"
      }
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });

  it("accepts separately typed IPFS identity metadata", () => {
    const common = commonMetrics("testnet");
    const identity = common.identity.value;
    const passport = {
      ...lpPassport,
      common: {
        ...common,
        identity: available(
          {
            ...identity,
            metadataLocator: {
              type: "ipfs" as const,
              uri: `ipfs://Qm${"a".repeat(44)}/agent.json`
            }
          },
          "none",
          "testnet"
        )
      }
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(true);
  });

  it("rejects whitespace or script text in a permission signature", () => {
    const common = commonMetrics("testnet");
    const permission = common.permissionSummary.value;
    const passport = {
      ...lpPassport,
      common: {
        ...common,
        permissionSummary: available(
          {
            ...permission,
            calls: [
              {
                targetContract: address,
                functionSignature: "execute(uint256) javascript:alert(1)",
                functionSelector: "0x12345678"
              }
            ]
          },
          "none",
          "testnet"
        )
      }
    };

    expect(AgentPassportSchema.safeParse(passport).success).toBe(false);
  });
});

describe("exact grid arithmetic", () => {
  it("orders consecutive integers beyond Number.MAX_SAFE_INTEGER exactly", () => {
    expect(
      GridRangeSchema.safeParse({
        baseAsset: "WBNB",
        quoteAsset: "USDT",
        lowerPrice: "9007199254740992",
        upperPrice: "9007199254740993"
      }).success
    ).toBe(true);
  });

  it("orders decimal fractions below IEEE-754 precision exactly", () => {
    expect(
      GridRangeSchema.safeParse({
        baseAsset: "WBNB",
        quoteAsset: "USDT",
        lowerPrice: "1.0000000000000000001",
        upperPrice: "1.0000000000000000002"
      }).success
    ).toBe(true);
  });

  it.each([
    ["9007199254740993", "9007199254740992"],
    ["1.000", "1"],
    ["1.0000000000000000002", "1.0000000000000000001"]
  ])("rejects non-increasing grid bounds %s to %s", (lowerPrice, upperPrice) => {
    expect(
      GridRangeSchema.safeParse({
        baseAsset: "WBNB",
        quoteAsset: "USDT",
        lowerPrice,
        upperPrice
      }).success
    ).toBe(false);
  });

  it("sums decimal costs exactly in integer cents", () => {
    expect(
      TradingCostsSchema.safeParse({
        gasUsd: "0.10",
        tradingFeesUsd: "0.20",
        slippageUsd: "0",
        agentFeesUsd: "0",
        otherUsd: "0",
        totalUsd: "0.30"
      }).success
    ).toBe(true);
  });

  it("rejects a total that differs from its components by one cent", () => {
    expect(
      TradingCostsSchema.safeParse({
        gasUsd: "0.10",
        tradingFeesUsd: "0.20",
        slippageUsd: "0",
        agentFeesUsd: "0",
        otherUsd: "0",
        totalUsd: "0.31"
      }).success
    ).toBe(false);
  });

  it("rejects sub-cent cost precision instead of silently rounding", () => {
    expect(
      TradingCostsSchema.safeParse({
        gasUsd: "0.001",
        tradingFeesUsd: "0",
        slippageUsd: "0",
        agentFeesUsd: "0",
        otherUsd: "0",
        totalUsd: "0"
      }).success
    ).toBe(false);
  });

  it("returns a validation failure instead of throwing on a non-decimal cost", () => {
    expect(() =>
      TradingCostsSchema.safeParse({
        gasUsd: "not-a-number",
        tradingFeesUsd: "0",
        slippageUsd: "0",
        agentFeesUsd: "0",
        otherUsd: "0",
        totalUsd: "0"
      })
    ).not.toThrow();
    expect(
      TradingCostsSchema.safeParse({
        gasUsd: "not-a-number",
        tradingFeesUsd: "0",
        slippageUsd: "0",
        agentFeesUsd: "0",
        otherUsd: "0",
        totalUsd: "0"
      }).success
    ).toBe(false);
  });
});
