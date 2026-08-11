import { describe, expect, it } from "vitest";

import {
  AgentPassportSchema,
  LpRebalancingAgentPassportSchema,
  type AgentPassport,
  type LpRebalancingAgentPassport
} from "./agent.js";
import type { EvidenceEnvironment, MetricUnit } from "./evidence.js";
import {
  RECOMMENDATION_METHOD_POLICY,
  RECOMMENDATION_METHOD_VERSION,
  RecommendationIntentSchema,
  recommendAgents,
  type EvaluatedRecommendationResult,
  type RecommendationIntent
} from "./recommendation.js";

const asOf = "2026-08-11T12:00:00.000Z";
const observedAt = "2026-08-11T11:55:00.000Z";
const ingestedAt = "2026-08-11T11:56:00.000Z";
const address = "0x1111111111111111111111111111111111111111";
const registryAddress = "0x2222222222222222222222222222222222222222";
const transactionHash = `0x${"a".repeat(64)}`;

const methodology = {
  summary: "Deterministic recommendation test evidence from a named record.",
  version: "1.0.0-test",
  observationWindow: { start: "2026-08-01T00:00:00.000Z", end: observedAt },
  limitations: ["Test values establish engine behavior, not production performance."]
} as const;

const source = {
  kind: "api" as const,
  label: "ProofEra recommendation test evidence",
  locator: {
    type: "external-id" as const,
    id: "packages/domain/src/recommendation.test.ts#live-evidence"
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

const unknown = <U extends MetricUnit>(unit: U) => ({
  availability: "unknown" as const,
  value: null,
  unit,
  source: null,
  observedAt: null,
  ingestedAt,
  methodology,
  freshness: "unknown" as const,
  environment: "testnet" as const,
  reason: "No trustworthy current source is available.",
  expectedSource: null,
  attemptedAt: null,
  error: null,
  lastGood: null
});

const asset = {
  symbol: "USDT",
  chainId: 97,
  address,
  decimals: 18
};

function commonMetrics(agentId: string) {
  return {
    identity: available(
      {
        standard: "ERC-8004" as const,
        agentId,
        registryAddress,
        metadataLocator: {
          type: "http" as const,
          url: `https://example.com/agents/${agentId}`
        }
      },
      "none"
    ),
    owner: available(address, "none"),
    chain: available(
      {
        chainId: 97 as const,
        name: "BNB Smart Chain Testnet" as const,
        network: "testnet" as const
      },
      "none"
    ),
    registration: available(
      {
        standard: "ERC-8004" as const,
        agentId,
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
        totalMetricCount: 24,
        freshMetricCount: 24,
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
        expiresAt: "2026-08-20T00:00:00.000Z",
        revocable: true
      },
      "none"
    )
  };
}

function lpPassport(slug = "lp-reference", agentId = "7"): LpRebalancingAgentPassport {
  return LpRebalancingAgentPassportSchema.parse({
    passportVersion: "1.0.0",
    slug,
    environment: "testnet",
    metadata: {
      name: slug,
      summary: "A deterministic passport used only to test recommendation decisions.",
      operatorName: "ProofEra",
      operatorType: "first-party",
      iconUrl: null,
      documentationUrl: "https://example.com/agent",
      tags: ["recommendation-test"]
    },
    common: commonMetrics(agentId),
    category: "lp-rebalancing",
    categoryMetrics: {
      inRangeTime: available(0.82, "ratio"),
      feeAprPct: available(12.4, "percent"),
      estimatedImpermanentLossPct: available(2.1, "percent"),
      rebalanceFrequency: available({ count: 4, periodDays: 30 }, "count"),
      gasDragPct: available(0.35, "percent"),
      netPerformancePct: available(3.6, "percent")
    }
  });
}

function gridPassport(): AgentPassport {
  return AgentPassportSchema.parse({
    passportVersion: "1.0.0",
    slug: "grid-reference",
    environment: "testnet",
    metadata: {
      name: "grid-reference",
      summary: "A deterministic passport used only to test category isolation.",
      operatorName: "ProofEra",
      operatorType: "first-party",
      iconUrl: null,
      documentationUrl: "https://example.com/agent",
      tags: ["recommendation-test"]
    },
    common: commonMetrics("8"),
    category: "grid-trading",
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
}

function intent(overrides: Partial<RecommendationIntent> = {}): RecommendationIntent {
  return {
    category: "lp-rebalancing",
    capitalUsd: 100,
    riskTolerance: "medium",
    horizonDays: 7,
    preferredAssets: ["USDT"],
    permittedProtocols: ["Example Protocol"],
    chainId: 97,
    ...overrides
  };
}

function evaluated(
  candidates: unknown[],
  recommendationIntent: unknown = intent()
): EvaluatedRecommendationResult {
  const result = recommendAgents(recommendationIntent, candidates, { asOf });
  if (result.status !== "evaluated") {
    throw new Error(`Expected an evaluated result, got ${JSON.stringify(result.issues)}`);
  }
  return result;
}

function reasonCodes(result: EvaluatedRecommendationResult, bucket: "eligible" | "rejected") {
  const candidate = result[bucket][0];
  if (candidate === undefined) throw new Error(`Expected a candidate in ${bucket}.`);
  return candidate.reasons.map((item) => item.code);
}

describe("RecommendationIntentSchema", () => {
  it("trims and deduplicates asset and protocol intent lists case-insensitively", () => {
    const parsed = RecommendationIntentSchema.parse({
      ...intent(),
      preferredAssets: [" usdt ", "USDT", "WBNB"],
      permittedProtocols: [" Example Protocol ", "example protocol", "PancakeSwap"]
    });

    expect(parsed.preferredAssets).toEqual(["usdt", "WBNB"]);
    expect(parsed.permittedProtocols).toEqual(["Example Protocol", "PancakeSwap"]);
  });

  it("rejects unknown intent keys and invalid capital", () => {
    expect(
      RecommendationIntentSchema.safeParse({ ...intent(), undocumentedPreference: true }).success
    ).toBe(false);
    expect(RecommendationIntentSchema.safeParse({ ...intent(), capitalUsd: 0 }).success).toBe(
      false
    );
  });
});

describe("recommendAgents", () => {
  it("accepts the exact capital boundary and matches assets/protocols without case sensitivity", () => {
    const result = evaluated(
      [lpPassport()],
      intent({
        capitalUsd: 100,
        preferredAssets: [" usdt ", "USDT"],
        permittedProtocols: ["example protocol", "EXAMPLE PROTOCOL"]
      })
    );

    expect(result.methodVersion).toBe(RECOMMENDATION_METHOD_VERSION);
    expect(result.outcome).toBe("eligible-agents-found");
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]).toMatchObject({
      status: "eligible",
      rank: 1,
      matchedAssets: ["usdt"],
      matchedProtocols: ["example protocol"],
      confidence: "high"
    });
    expect(reasonCodes(result, "eligible")).toEqual(
      expect.arrayContaining([
        "CATEGORY_MATCH",
        "CHAIN_MATCH",
        "CAPITAL_MEETS_MINIMUM",
        "RISK_WITHIN_TOLERANCE",
        "ASSET_MATCH",
        "PROTOCOL_MATCH",
        "PERMISSION_HORIZON_COVERED",
        "EVIDENCE_QUALITY"
      ])
    );
  });

  it("hard-blocks capital below the reported minimum", () => {
    const result = evaluated([lpPassport()], intent({ capitalUsd: 99.99 }));

    expect(result.eligible).toEqual([]);
    expect(result.outcome).toBe("no-eligible-agent");
    expect(reasonCodes(result, "rejected")).toContain("CAPITAL_BELOW_MINIMUM");
  });

  it.each([
    ["asset", intent({ preferredAssets: ["WBNB"] }), "ASSET_MISMATCH"],
    ["protocol", intent({ permittedProtocols: ["PancakeSwap"] }), "PROTOCOL_MISMATCH"],
    ["chain", intent({ chainId: 56 }), "CHAIN_MISMATCH"],
    ["risk tolerance", intent({ riskTolerance: "low" }), "RISK_EXCEEDS_TOLERANCE"]
  ] as const)("hard-blocks a %s mismatch", (_label, requestedIntent, expectedCode) => {
    const result = evaluated([lpPassport()], requestedIntent);

    expect(result.eligible).toEqual([]);
    expect(reasonCodes(result, "rejected")).toContain(expectedCode);
  });

  it("requires every requested asset instead of treating a partial pair as suitable", () => {
    const result = evaluated([lpPassport()], intent({ preferredAssets: ["USDT", "WBNB"] }));

    expect(result.eligible).toEqual([]);
    expect(result.rejected[0]?.matchedAssets).toEqual(["USDT"]);
    expect(reasonCodes(result, "rejected")).toContain("ASSET_MISMATCH");
    expect(
      result.rejected[0]?.reasons.find((item) => item.code === "ASSET_MISMATCH")?.message
    ).toMatch(/missing: WBNB/i);
  });

  it("never admits an overall or factor-level critical risk", () => {
    const passport = lpPassport();
    const currentRisk = passport.common.risk;
    if (currentRisk.availability !== "available") throw new Error("Fixture risk must exist.");
    const criticalFactorPassport = {
      ...passport,
      common: {
        ...passport.common,
        risk: {
          ...currentRisk,
          value: {
            ...currentRisk.value,
            level: "low",
            factors: [
              {
                code: "UNBOUNDED_AUTHORITY",
                severity: "critical",
                description: "The observed authority is not sufficiently bounded.",
                mitigation: null
              }
            ]
          }
        }
      }
    };

    const result = evaluated([criticalFactorPassport], intent({ riskTolerance: "high" }));

    expect(result.rejected).toHaveLength(1);
    expect(reasonCodes(result, "rejected")).toContain("CRITICAL_RISK");
  });

  it("keeps missing and stale evidence discoverable but ineligible without imputing a value", () => {
    const missingBase = lpPassport("missing-evidence", "9");
    const missing = {
      ...missingBase,
      categoryMetrics: {
        ...missingBase.categoryMetrics,
        inRangeTime: unknown("ratio")
      }
    };
    const staleBase = lpPassport("stale-evidence", "10");
    const stale = {
      ...staleBase,
      categoryMetrics: {
        ...staleBase.categoryMetrics,
        gasDragPct: { ...staleBase.categoryMetrics.gasDragPct, freshness: "stale" }
      }
    };

    const result = evaluated([missing, stale]);

    expect(result.eligible).toEqual([]);
    expect(result.insufficientEvidence).toHaveLength(2);
    expect(result.insufficientEvidence.map((candidate) => candidate.status)).toEqual([
      "discoverable-insufficient",
      "discoverable-insufficient"
    ]);
    expect(
      result.insufficientEvidence.flatMap((candidate) =>
        candidate.publicationIssues.map((issue) => issue.code)
      )
    ).toEqual(expect.arrayContaining(["CATEGORY_EVIDENCE_UNKNOWN", "CATEGORY_EVIDENCE_STALE"]));
    expect(result.insufficientEvidence.map((candidate) => candidate.confidence)).toEqual([
      "medium",
      "medium"
    ]);
    expect(result.outcome).toBe("no-eligible-agent");
  });

  it("requires permission scope to cover the requested horizon, allowing the exact boundary", () => {
    const exactBase = lpPassport("exact-permission", "11");
    const exactPermission = exactBase.common.permissionSummary;
    if (exactPermission.availability !== "available") {
      throw new Error("Fixture permission must exist.");
    }
    const exact = {
      ...exactBase,
      common: {
        ...exactBase.common,
        permissionSummary: {
          ...exactPermission,
          value: { ...exactPermission.value, expiresAt: "2026-08-18T12:00:00.000Z" }
        }
      }
    };
    const shortBase = lpPassport("short-permission", "12");
    const shortPermission = shortBase.common.permissionSummary;
    if (shortPermission.availability !== "available") {
      throw new Error("Fixture permission must exist.");
    }
    const short = {
      ...shortBase,
      common: {
        ...shortBase.common,
        permissionSummary: {
          ...shortPermission,
          value: { ...shortPermission.value, expiresAt: "2026-08-18T11:59:59.000Z" }
        }
      }
    };

    const result = evaluated([short, exact]);

    expect(result.eligible.map((candidate) => candidate.slug)).toEqual(["exact-permission"]);
    expect(result.rejected.map((candidate) => candidate.slug)).toEqual(["short-permission"]);
    expect(reasonCodes(result, "rejected")).toContain("PERMISSION_HORIZON_TOO_SHORT");
    expect(result.eligible[0]?.requestedPermissionEndsAt).toBe("2026-08-18T12:00:00.000Z");
    expect(result.eligible[0]?.permissionExpiresAt).toBe("2026-08-18T12:00:00.000Z");
  });

  it("isolates categories and never ranks a different category against the request", () => {
    const result = evaluated([gridPassport(), lpPassport()]);

    expect(result.eligible.map((candidate) => candidate.category)).toEqual(["lp-rebalancing"]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ category: "grid-trading", rank: null });
    expect(reasonCodes(result, "rejected")).toContain("CATEGORY_MISMATCH");
  });

  it("retains an invalid passport as an explicit rejected decision", () => {
    const passport = lpPassport();
    const { risk: removedRisk, ...missingRiskCommon } = passport.common;
    void removedRisk;
    const invalidPassport = { ...passport, common: missingRiskCommon };

    const result = evaluated([invalidPassport]);

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      slug: null,
      name: null,
      category: null,
      confidence: "none",
      evidence: null,
      publicationStatus: "rejected"
    });
    expect(result.rejected[0]?.publicationIssues[0]?.code).toBe("CORE_EVIDENCE_MISSING");
    expect(result.outcome).toBe("no-eligible-agent");
  });

  it("uses stable evidence/identity ties and ignores economic-return fields", () => {
    const zetaBase = lpPassport("zeta-agent", "100");
    const alphaBase = lpPassport("alpha-agent", "200");
    const zeta = {
      ...zetaBase,
      categoryMetrics: {
        ...zetaBase.categoryMetrics,
        netPerformancePct: {
          ...zetaBase.categoryMetrics.netPerformancePct,
          value: 999_999
        }
      }
    };
    const alpha = {
      ...alphaBase,
      categoryMetrics: {
        ...alphaBase.categoryMetrics,
        netPerformancePct: {
          ...alphaBase.categoryMetrics.netPerformancePct,
          value: -99
        }
      }
    };

    const forward = evaluated([zeta, alpha]);
    const reverse = evaluated([alpha, zeta]);

    expect(forward.eligible.map((candidate) => [candidate.slug, candidate.rank])).toEqual([
      ["alpha-agent", 1],
      ["zeta-agent", 2]
    ]);
    expect(reverse.eligible.map((candidate) => [candidate.slug, candidate.rank])).toEqual([
      ["alpha-agent", 1],
      ["zeta-agent", 2]
    ]);
    expect(RECOMMENDATION_METHOD_POLICY).toMatchObject({
      economicReturnMetricsUsed: false,
      suitabilityScore: null,
      comparesOnlyRequestedCategory: true
    });
    expect(forward.economicReturnStatement).toBe(
      "No economic-return metric was used, ranked, or inferred."
    );
    expect(
      forward.eligible
        .flatMap((candidate) => candidate.reasons.map((item) => item.message))
        .join(" ")
    ).not.toMatch(/\b(?:apy|apr|pnl|performance)\b/i);
  });

  it("retains only the first canonical candidate and rejects duplicate records", () => {
    const passport = lpPassport();
    const result = evaluated([passport, structuredClone(passport)]);

    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]?.inputIndex).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.inputIndex).toBe(1);
    expect(reasonCodes(result, "rejected")).toContain("DUPLICATE_CANDIDATE");
  });

  it("does not fabricate a fallback recommendation when nothing is proven eligible", () => {
    const staleBase = lpPassport();
    const stale = {
      ...staleBase,
      categoryMetrics: {
        ...staleBase.categoryMetrics,
        inRangeTime: { ...staleBase.categoryMetrics.inRangeTime, freshness: "expired" }
      }
    };

    const result = evaluated([stale]);

    expect(result.outcome).toBe("no-eligible-agent");
    expect(result.eligible).toEqual([]);
    expect(result.insufficientEvidence).toHaveLength(1);
    expect(result.insufficientEvidence[0]?.publicationIssues.map((issue) => issue.code)).toContain(
      "CATEGORY_EVIDENCE_EXPIRED"
    );
  });

  it("returns an invalid run instead of evaluating an unknown-key intent", () => {
    const result = recommendAgents({ ...intent(), secretPreference: "ignored?" }, [lpPassport()], {
      asOf
    });

    expect(result).toMatchObject({
      status: "invalid",
      outcome: "no-eligible-agent",
      candidates: [],
      eligible: []
    });
    if (result.status !== "invalid") throw new Error("Expected an invalid result.");
    expect(result.issues[0]).toMatchObject({ source: "intent", code: "unrecognized_keys" });
  });
});
