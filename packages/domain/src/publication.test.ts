import { describe, expect, it } from "vitest";

import { AgentPassportSchema, type AgentCategory, type AgentPassport } from "./agent.js";
import type { EvidenceEnvironment, MetricUnit } from "./evidence.js";
import { evaluateStrictLivePublication } from "./publication.js";

const asOf = "2026-08-11T12:00:00.000Z";
const observedAt = "2026-08-11T11:55:00.000Z";
const ingestedAt = "2026-08-11T11:56:00.000Z";
const address = "0x1111111111111111111111111111111111111111";
const registryAddress = "0x2222222222222222222222222222222222222222";
const transactionHash = `0x${"a".repeat(64)}`;

const methodology = {
  summary: "Deterministic publication-gate test evidence from a named record.",
  version: "1.0.0-test",
  observationWindow: { start: "2026-08-01T00:00:00.000Z", end: observedAt },
  limitations: ["Test-only values do not establish production performance."]
} as const;

const source = {
  kind: "api" as const,
  label: "ProofEra publication test evidence",
  locator: {
    type: "external-id" as const,
    id: "packages/domain/src/publication.test.ts#live-evidence"
  }
};

const available = <T, U extends MetricUnit>(
  value: T,
  unit: U,
  environment: EvidenceEnvironment = "testnet"
) => ({
  availability: "available" as const,
  value,
  unit,
  source,
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

const unknown = <U extends MetricUnit>(unit: U, environment: EvidenceEnvironment = "testnet") => ({
  availability: "unknown" as const,
  value: null,
  unit,
  source: null,
  observedAt: null,
  ingestedAt,
  methodology,
  freshness: "unknown" as const,
  environment,
  reason: "No trustworthy current source is available.",
  expectedSource: null,
  attemptedAt: null,
  error: null,
  lastGood: null
});

const unavailable = <U extends MetricUnit>(
  unit: U,
  environment: EvidenceEnvironment = "testnet"
) => ({
  availability: "unavailable" as const,
  value: null,
  unit,
  source: null,
  observedAt: null,
  ingestedAt,
  methodology,
  freshness: "unknown" as const,
  environment,
  reason: "The named live provider timed out.",
  expectedSource: source,
  attemptedAt: "2026-08-11T11:55:30.000Z",
  error: {
    provider: "ProofEra publication test evidence",
    code: "FETCH_TIMEOUT",
    message: "The bounded read timed out.",
    retryable: true
  },
  lastGood: null
});

const asset = {
  symbol: "USDT",
  chainId: 97,
  address,
  decimals: 18
};

const commonMetrics = () => ({
  identity: available(
    {
      standard: "ERC-8004" as const,
      agentId: "7",
      registryAddress,
      metadataLocator: { type: "http" as const, url: "https://example.com/agents/7" }
    },
    "none"
  ),
  owner: available(address, "none"),
  chain: available(
    { chainId: 97 as const, name: "BNB Smart Chain Testnet" as const, network: "testnet" as const },
    "none"
  ),
  registration: available(
    {
      standard: "ERC-8004" as const,
      agentId: "7",
      registryAddress,
      transactionHash,
      registeredAt: "2026-08-01T00:00:00.000Z"
    },
    "none"
  ),
  verification: available(
    {
      status: "verified" as const,
      verifier: "ProofEra deterministic test verifier",
      verifiedAt: observedAt,
      claims: ["Identity and capability evidence passed the test-only verification fixture."],
      reason: null
    },
    "none"
  ),
  lifecycleStatus: available("live" as const, "none"),
  lastActivityAt: available(observedAt, "timestamp"),
  executionCount: available(20, "count"),
  successRate: available(0.9, "ratio"),
  fees: available(
    {
      kind: "flat" as const,
      amountUsd: 0.25,
      chargedPer: "execution" as const,
      description: "Fixed agent fee excluding gas and protocol fees."
    },
    "none"
  ),
  uptime: available(0.995, "ratio"),
  dataFreshness: available(
    {
      newestObservedAt: observedAt,
      oldestObservedAt: "2026-08-01T00:00:00.000Z",
      totalMetricCount: 18,
      freshMetricCount: 18,
      staleMetricCount: 0,
      expiredMetricCount: 0,
      unknownMetricCount: 0
    },
    "none"
  ),
  risk: available(
    {
      level: "medium" as const,
      score: 40,
      factors: [
        {
          code: "EXTERNAL_PROTOCOL",
          severity: "medium" as const,
          description: "Execution depends on external protocol contracts.",
          mitigation: "Activation is bounded by reviewed targets and spend caps."
        }
      ],
      worstObservedOutcome: null
    },
    "none"
  ),
  reputation: available({ rating: 4.5, reviewCount: 10, positiveReviewRatio: 0.9 }, "none"),
  supportedAssets: available([asset], "none"),
  supportedProtocols: available(
    [
      {
        name: "Example Protocol",
        documentationUrl: "https://example.com/protocol",
        contractAddresses: [address]
      }
    ],
    "none"
  ),
  minimumCapitalUsd: available(100, "usd"),
  permissionSummary: available(
    {
      calls: [
        {
          targetContract: address,
          functionSignature: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))",
          functionSelector: "0x12345678"
        }
      ],
      spendCaps: [
        {
          token: asset,
          amountBaseUnits: "500000000000000000000",
          period: { kind: "session" as const }
        }
      ],
      enforcementLayer: "session-key-policy" as const,
      expiresAt: "2026-08-11T13:00:00.000Z",
      revocable: true
    },
    "none"
  )
});

const metadata = {
  name: "ProofEra Publication Reference",
  summary: "A deterministic full passport used only to test strict publication decisions.",
  operatorName: "ProofEra",
  operatorType: "first-party" as const,
  iconUrl: null,
  documentationUrl: "https://example.com/agent",
  tags: ["publication-test"]
};

function passportFor(category: AgentCategory): AgentPassport {
  const base = {
    passportVersion: "1.0.0" as const,
    slug: `${category}-publication-reference`,
    environment: "testnet" as const,
    metadata,
    common: commonMetrics()
  };

  switch (category) {
    case "lp-rebalancing":
      return AgentPassportSchema.parse({
        ...base,
        category,
        categoryMetrics: {
          inRangeTime: available(0.82, "ratio"),
          feeAprPct: available(12.4, "percent"),
          estimatedImpermanentLossPct: available(2.1, "percent"),
          rebalanceFrequency: available({ count: 4, periodDays: 30 }, "count"),
          gasDragPct: available(0.35, "percent"),
          netPerformancePct: available(3.6, "percent")
        }
      });
    case "grid-trading":
      return AgentPassportSchema.parse({
        ...base,
        category,
        categoryMetrics: {
          realizedPnlUsd: available(18.5, "usd"),
          fills: available(31, "count"),
          winRate: available(0.61, "ratio"),
          maximumDrawdownPct: available(4.4, "percent"),
          turnoverUsd: available(2_800, "usd"),
          configuredRange: available(
            { baseAsset: "WBNB", quoteAsset: "USDT", lowerPrice: "760", upperPrice: "840" },
            "none"
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
            "usd"
          )
        }
      });
    case "yield-optimisation":
      return AgentPassportSchema.parse({
        ...base,
        category,
        categoryMetrics: {
          baseApyPct: available(3.1, "percent"),
          rewardApyPct: available(1.4, "percent"),
          netApyPct: available(4.1, "percent"),
          tvlUsd: available(8_000_000, "usd"),
          liquidityUsd: available(3_000_000, "usd"),
          protocolExposure: available(
            [{ protocol: "Example Protocol", asset: "USDT", allocationRatio: 1 }],
            "ratio"
          ),
          withdrawalConstraints: available(
            {
              lockupEndsAt: null,
              cooldownSeconds: 0,
              exitFeePct: 0,
              minimumWithdrawalBaseUnits: "1",
              notes: ["Withdrawals depend on available protocol liquidity."]
            },
            "none"
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
            "count"
          ),
          gasImpactPct: available(0.12, "percent")
        }
      });
    case "health-factor-monitoring":
      return AgentPassportSchema.parse({
        ...base,
        category,
        categoryMetrics: {
          currentHealthFactor: available(1.8, "ratio"),
          minimumHealthFactor: available(1.42, "ratio"),
          monitoredCollateral: available(
            [{ asset, amountBaseUnits: "1000000000000000000", valueUsd: 800 }],
            "base_units"
          ),
          monitoredDebt: available(
            [{ asset, amountBaseUnits: "300000000000000000", valueUsd: 300 }],
            "base_units"
          ),
          alertLatencySeconds: available(5, "seconds"),
          interventionPolicy: available(
            {
              warningHealthFactor: 1.5,
              criticalHealthFactor: 1.2,
              action: "alert-only" as const,
              maximumRepayBps: 0,
              allowedProtocols: ["Example Protocol"],
              humanConfirmationRequired: true
            },
            "none"
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
            "count"
          ),
          liquidationRiskThresholds: available(
            {
              protocolLiquidationHealthFactor: 1,
              criticalHealthFactor: 1.2,
              warningHealthFactor: 1.5
            },
            "ratio"
          )
        }
      });
  }
}

function withNonLiveRealizedEvidence(passport: AgentPassport): {
  field: string;
  passport: unknown;
} {
  switch (passport.category) {
    case "lp-rebalancing":
      return {
        field: "netPerformancePct",
        passport: {
          ...passport,
          categoryMetrics: {
            ...passport.categoryMetrics,
            netPerformancePct: {
              ...passport.categoryMetrics.netPerformancePct,
              environment: "simulation"
            }
          }
        }
      };
    case "grid-trading":
      return {
        field: "realizedPnlUsd",
        passport: {
          ...passport,
          categoryMetrics: {
            ...passport.categoryMetrics,
            realizedPnlUsd: {
              ...passport.categoryMetrics.realizedPnlUsd,
              environment: "simulation"
            }
          }
        }
      };
    case "yield-optimisation":
      return {
        field: "routeHistory",
        passport: {
          ...passport,
          categoryMetrics: {
            ...passport.categoryMetrics,
            routeHistory: { ...passport.categoryMetrics.routeHistory, environment: "simulation" }
          }
        }
      };
    case "health-factor-monitoring":
      return {
        field: "executionHistory",
        passport: {
          ...passport,
          categoryMetrics: {
            ...passport.categoryMetrics,
            executionHistory: {
              ...passport.categoryMetrics.executionHistory,
              environment: "simulation"
            }
          }
        }
      };
  }
}

const context = { asOf };

describe("evaluateStrictLivePublication", () => {
  it.each([
    "lp-rebalancing",
    "grid-trading",
    "yield-optimisation",
    "health-factor-monitoring"
  ] as const)("accepts a complete live %s passport as hireable", (category) => {
    const decision = evaluateStrictLivePublication(passportFor(category), context);

    expect(decision).toMatchObject({
      discoverable: true,
      hireable: true,
      issues: [],
      status: "hireable"
    });
  });

  it.each([
    "lp-rebalancing",
    "grid-trading",
    "yield-optimisation",
    "health-factor-monitoring"
  ] as const)("rejects simulated realized evidence for %s", (category) => {
    const leak = withNonLiveRealizedEvidence(passportFor(category));
    const decision = evaluateStrictLivePublication(leak.passport, context);

    expect(decision.discoverable).toBe(false);
    expect(decision.hireable).toBe(false);
    expect(decision.issues).toContainEqual(
      expect.objectContaining({
        code: "NON_LIVE_REALIZED_EVIDENCE",
        path: ["categoryMetrics", leak.field]
      })
    );
    expect(decision.issues).toContainEqual(
      expect.objectContaining({ code: "EVIDENCE_ENVIRONMENT_MISMATCH" })
    );
  });

  it.each(["fixture", "simulation"] as const)(
    "rejects a passport labelled as %s",
    (environment) => {
      const passport = passportFor("lp-rebalancing");
      const decision = evaluateStrictLivePublication({ ...passport, environment }, context);

      expect(decision).toMatchObject({ discoverable: false, hireable: false, status: "rejected" });
      expect(decision.issues).toContainEqual(
        expect.objectContaining({ code: "PASSPORT_ENVIRONMENT_NOT_LIVE", path: ["environment"] })
      );
    }
  );

  it("rejects a fixture source hidden behind a live evidence environment", () => {
    const passport = passportFor("lp-rebalancing");
    const executionCount = passport.common.executionCount;
    if (executionCount.availability !== "available") {
      throw new Error("Fixture requires available execution count.");
    }
    const untrusted = {
      ...passport,
      common: {
        ...passport.common,
        executionCount: {
          ...executionCount,
          source: { ...executionCount.source, kind: "fixture" as const }
        }
      }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision.discoverable).toBe(false);
    expect(decision.issues).toContainEqual(
      expect.objectContaining({
        code: "FIXTURE_SOURCE_NOT_ALLOWED",
        path: ["common", "executionCount", "source", "kind"]
      })
    );
  });

  it("rejects a null fixture envelope instead of treating it as harmless missing data", () => {
    const passport = passportFor("lp-rebalancing");
    const untrusted = {
      ...passport,
      common: { ...passport.common, reputation: unknown("none", "fixture") }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision.discoverable).toBe(false);
    expect(decision.issues).toContainEqual(
      expect.objectContaining({
        code: "NON_LIVE_EVIDENCE",
        path: ["common", "reputation", "environment"]
      })
    );
  });

  it("rejects available evidence from a different live environment", () => {
    const passport = passportFor("lp-rebalancing");
    const executionCount = passport.common.executionCount;
    const untrusted = {
      ...passport,
      common: {
        ...passport.common,
        executionCount: { ...executionCount, environment: "mainnet" as const }
      }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision.discoverable).toBe(false);
    expect(decision.issues).toContainEqual(
      expect.objectContaining({
        code: "EVIDENCE_ENVIRONMENT_MISMATCH",
        path: ["common", "executionCount", "environment"]
      })
    );
  });

  it("keeps unknown core activation evidence discoverable but not hireable", () => {
    const passport = passportFor("lp-rebalancing");
    const untrusted = {
      ...passport,
      common: { ...passport.common, permissionSummary: unknown("none") }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision).toMatchObject({ discoverable: true, hireable: false, status: "discoverable" });
    expect(decision.issues).toContainEqual(
      expect.objectContaining({
        code: "CORE_EVIDENCE_UNKNOWN",
        path: ["common", "permissionSummary", "availability"]
      })
    );
    expect(decision.passport?.common.permissionSummary.value).toBeNull();
  });

  it("keeps unavailable core evidence and last-good non-promotion explicit", () => {
    const passport = passportFor("lp-rebalancing");
    const untrusted = {
      ...passport,
      common: { ...passport.common, risk: unavailable("none") }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision).toMatchObject({ discoverable: true, hireable: false });
    expect(decision.issues).toContainEqual(
      expect.objectContaining({ code: "CORE_EVIDENCE_UNAVAILABLE" })
    );
    expect(decision.passport?.common.risk.value).toBeNull();
  });

  it("blocks expired core evidence without hiding the passport", () => {
    const passport = passportFor("lp-rebalancing");
    const permissionSummary = passport.common.permissionSummary;
    if (permissionSummary.availability !== "available") {
      throw new Error("Fixture requires available permissions.");
    }
    const untrusted = {
      ...passport,
      common: {
        ...passport.common,
        permissionSummary: { ...permissionSummary, freshness: "expired" as const }
      }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision).toMatchObject({ discoverable: true, hireable: false });
    expect(decision.issues).toContainEqual(
      expect.objectContaining({
        code: "CORE_EVIDENCE_EXPIRED",
        path: ["common", "permissionSummary", "freshness"]
      })
    );
  });

  it("returns a typed rejection when a core evidence field is structurally missing", () => {
    const passport = passportFor("lp-rebalancing");
    const untrusted = {
      ...passport,
      common: { ...passport.common, permissionSummary: undefined }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision).toMatchObject({
      discoverable: false,
      hireable: false,
      passport: null,
      status: "rejected"
    });
    expect(decision.issues).toContainEqual(
      expect.objectContaining({
        code: "CORE_EVIDENCE_MISSING",
        path: ["common", "permissionSummary"]
      })
    );
  });

  it("blocks an elapsed or non-revocable permission scope", () => {
    const passport = passportFor("lp-rebalancing");
    const permissionSummary = passport.common.permissionSummary;
    if (permissionSummary.availability !== "available") {
      throw new Error("Fixture requires available permissions.");
    }
    const untrusted = {
      ...passport,
      common: {
        ...passport.common,
        permissionSummary: {
          ...permissionSummary,
          value: {
            ...permissionSummary.value,
            expiresAt: asOf,
            revocable: false
          }
        }
      }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision.discoverable).toBe(true);
    expect(decision.hireable).toBe(false);
    expect(decision.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["PERMISSION_SCOPE_EXPIRED", "PERMISSION_SCOPE_NOT_REVOCABLE"])
    );
  });

  it("blocks a paused lifecycle while leaving the evidence visible", () => {
    const passport = passportFor("lp-rebalancing");
    const lifecycleStatus = passport.common.lifecycleStatus;
    if (lifecycleStatus.availability !== "available") {
      throw new Error("Fixture requires available lifecycle evidence.");
    }
    const untrusted = {
      ...passport,
      common: {
        ...passport.common,
        lifecycleStatus: { ...lifecycleStatus, value: "paused" as const }
      }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision).toMatchObject({ discoverable: true, hireable: false });
    expect(decision.issues).toContainEqual(expect.objectContaining({ code: "LIFECYCLE_NOT_LIVE" }));
  });

  it("keeps an explicitly unverified identity discoverable but never hireable", () => {
    const passport = passportFor("lp-rebalancing");
    const verification = passport.common.verification;
    if (verification.availability !== "available") {
      throw new Error("Fixture requires available verification evidence.");
    }
    const untrusted = {
      ...passport,
      common: {
        ...passport.common,
        verification: {
          ...verification,
          value: {
            status: "unverified" as const,
            verifier: null,
            verifiedAt: null,
            claims: [],
            reason: "No independent verifier has attested to this agent."
          }
        }
      }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision).toMatchObject({ discoverable: true, hireable: false });
    expect(decision.issues).toContainEqual(
      expect.objectContaining({ code: "VERIFICATION_NOT_VERIFIED" })
    );
  });

  it("requires every category metric to be current before hiring", () => {
    const passport = passportFor("yield-optimisation");
    const untrusted = {
      ...passport,
      categoryMetrics: {
        ...passport.categoryMetrics,
        withdrawalConstraints: unknown("none")
      }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision).toMatchObject({ discoverable: true, hireable: false });
    expect(decision.issues).toContainEqual(
      expect.objectContaining({
        code: "CATEGORY_EVIDENCE_UNKNOWN",
        path: ["categoryMetrics", "withdrawalConstraints", "availability"]
      })
    );
  });

  it("rejects a future ingestion time even when the evidence value is unknown", () => {
    const passport = passportFor("lp-rebalancing");
    const untrusted = {
      ...passport,
      common: {
        ...passport.common,
        reputation: {
          ...unknown("none"),
          ingestedAt: "2026-08-11T12:00:00.001Z"
        }
      }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision.discoverable).toBe(false);
    expect(decision.issues).toContainEqual(
      expect.objectContaining({
        code: "EVIDENCE_TIMESTAMP_AFTER_EVALUATION",
        path: ["common", "reputation", "ingestedAt"]
      })
    );
  });

  it("rejects evidence that postdates the explicit deterministic evaluation time", () => {
    const passport = passportFor("lp-rebalancing");
    const uptime = passport.common.uptime;
    if (uptime.availability !== "available") {
      throw new Error("Fixture requires available uptime evidence.");
    }
    const untrusted = {
      ...passport,
      common: {
        ...passport.common,
        uptime: {
          ...uptime,
          observedAt: "2026-08-11T12:00:00.001Z",
          ingestedAt: "2026-08-11T12:00:00.002Z"
        }
      }
    };

    const decision = evaluateStrictLivePublication(untrusted, context);
    expect(decision.discoverable).toBe(false);
    expect(decision.issues).toContainEqual(
      expect.objectContaining({ code: "EVIDENCE_TIMESTAMP_AFTER_EVALUATION" })
    );
  });

  it("is deterministic for the same passport and explicit as-of time", () => {
    const passport = passportFor("yield-optimisation");
    expect(evaluateStrictLivePublication(passport, context)).toEqual(
      evaluateStrictLivePublication(passport, context)
    );
  });
});
