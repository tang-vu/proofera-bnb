import { z } from "zod";

import {
  AgentCategorySchema,
  type AgentPassport,
  type CommonAgentMetrics,
  type GridTradingAgentPassport,
  type HealthFactorMonitoringAgentPassport,
  type LpRebalancingAgentPassport,
  type YieldOptimisationAgentPassport
} from "./agent";
import { type EvidenceMetric } from "./evidence";
import {
  StrictLivePublicationContextSchema,
  evaluateStrictLivePublication,
  type PublicationIssue,
  type StrictLivePublicationStatus
} from "./publication";

/**
 * This version changes whenever intent semantics, eligibility gates, or ordering
 * change. There is deliberately no return-based suitability score.
 */
export const RECOMMENDATION_METHOD_VERSION = "1.0.0" as const;

export const RECOMMENDATION_METHOD_POLICY = {
  comparesOnlyRequestedCategory: true,
  economicReturnMetricsUsed: false,
  suitabilityScore: null,
  ordering: [
    "eligibility status",
    "fresh evidence ratio within the requested category",
    "evidence completeness within the requested category",
    "canonical passport slug",
    "ERC-8004 agent ID",
    "original input position for otherwise indistinguishable records"
  ],
  duplicateCandidatePolicy: "first canonical candidate retained; later duplicates rejected"
} as const;

export const RECOMMENDATION_EVIDENCE_CONFIDENCE_POLICY = {
  high: { minimumCompletenessRatio: 1, minimumFreshRatio: 1 },
  medium: { minimumCompletenessRatio: 0.8, minimumFreshRatio: 0.8 },
  low: { minimumCompletenessRatio: 0, minimumFreshRatio: 0 }
} as const;

export const RecommendationRiskToleranceSchema = z.enum(["low", "medium", "high"]);

const deduplicatedListSchema = (maximumItemLength: number, maximumItems: number) =>
  z
    .array(z.string().trim().min(1).max(maximumItemLength))
    .min(1)
    .max(maximumItems)
    .transform((values) => {
      const seen = new Set<string>();
      return values.filter((value) => {
        const key = normalizeMatchKey(value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

/** Strict user intent. Lists retain their first spelling but match case-insensitively. */
export const RecommendationIntentSchema = z.strictObject({
  category: AgentCategorySchema,
  capitalUsd: z.number().finite().positive(),
  riskTolerance: RecommendationRiskToleranceSchema,
  horizonDays: z.number().int().positive().max(3_650),
  preferredAssets: deduplicatedListSchema(24, 100),
  permittedProtocols: deduplicatedListSchema(100, 50),
  chainId: z.union([z.literal(56), z.literal(97)])
});

export const RecommendationContextSchema = StrictLivePublicationContextSchema;

export type RecommendationIntent = z.infer<typeof RecommendationIntentSchema>;
export type RecommendationRiskTolerance = z.infer<typeof RecommendationRiskToleranceSchema>;

export type RecommendationInputIssue = {
  source: "intent" | "context" | "candidates";
  code: string;
  message: string;
  path: readonly (string | number)[];
};

export type RecommendationEvidenceConfidence = "none" | "low" | "medium" | "high";

export type RecommendationEvidenceSummary = {
  totalMetricCount: number;
  availableMetricCount: number;
  freshMetricCount: number;
  staleMetricCount: number;
  expiredMetricCount: number;
  unknownMetricCount: number;
  unavailableMetricCount: number;
  completenessRatio: number;
  freshRatio: number;
  confidence: Exclude<RecommendationEvidenceConfidence, "none">;
};

export type RecommendationReasonKind = "match" | "block" | "evidence";

export type RecommendationReason = {
  kind: RecommendationReasonKind;
  code: string;
  message: string;
  path: readonly (string | number)[];
};

export type RecommendationCandidateStatus = "eligible" | "discoverable-insufficient" | "rejected";

export type RecommendationCandidateDecision = {
  inputIndex: number;
  candidateKey: string;
  slug: string | null;
  name: string | null;
  agentId: string | null;
  category: AgentPassport["category"] | null;
  status: RecommendationCandidateStatus;
  rank: number | null;
  publicationStatus: StrictLivePublicationStatus;
  publicationDiscoverable: boolean;
  publicationHireable: boolean;
  publicationIssues: readonly PublicationIssue[];
  evidence: RecommendationEvidenceSummary | null;
  confidence: RecommendationEvidenceConfidence;
  matchedAssets: readonly string[];
  matchedProtocols: readonly string[];
  requestedPermissionEndsAt: string;
  permissionExpiresAt: string | null;
  reasons: readonly RecommendationReason[];
  economicReturnStatement: "No economic-return metric was used, ranked, or inferred.";
};

type RecommendationResultBase = {
  methodVersion: typeof RECOMMENDATION_METHOD_VERSION;
  methodPolicy: typeof RECOMMENDATION_METHOD_POLICY;
  economicReturnStatement: "No economic-return metric was used, ranked, or inferred.";
};

export type InvalidRecommendationResult = RecommendationResultBase & {
  status: "invalid";
  asOf: string | null;
  intent: null;
  issues: readonly RecommendationInputIssue[];
  candidates: readonly [];
  eligible: readonly [];
  insufficientEvidence: readonly [];
  rejected: readonly [];
  outcome: "no-eligible-agent";
};

export type EvaluatedRecommendationResult = RecommendationResultBase & {
  status: "evaluated";
  asOf: string;
  intent: RecommendationIntent;
  issues: readonly [];
  candidates: readonly RecommendationCandidateDecision[];
  eligible: readonly RecommendationCandidateDecision[];
  insufficientEvidence: readonly RecommendationCandidateDecision[];
  rejected: readonly RecommendationCandidateDecision[];
  outcome: "eligible-agents-found" | "no-eligible-agent";
};

export type RecommendationResult = InvalidRecommendationResult | EvaluatedRecommendationResult;

const ECONOMIC_RETURN_STATEMENT =
  "No economic-return metric was used, ranked, or inferred." as const;

const commonMetricFields = [
  "identity",
  "owner",
  "chain",
  "registration",
  "verification",
  "lifecycleStatus",
  "lastActivityAt",
  "executionCount",
  "successRate",
  "fees",
  "uptime",
  "dataFreshness",
  "risk",
  "reputation",
  "supportedAssets",
  "supportedProtocols",
  "minimumCapitalUsd",
  "permissionSummary"
] as const satisfies readonly (keyof CommonAgentMetrics)[];

const lpMetricFields = [
  "inRangeTime",
  "feeAprPct",
  "estimatedImpermanentLossPct",
  "rebalanceFrequency",
  "gasDragPct",
  "netPerformancePct"
] as const satisfies readonly (keyof LpRebalancingAgentPassport["categoryMetrics"])[];

const gridMetricFields = [
  "realizedPnlUsd",
  "fills",
  "winRate",
  "maximumDrawdownPct",
  "turnoverUsd",
  "configuredRange",
  "costs"
] as const satisfies readonly (keyof GridTradingAgentPassport["categoryMetrics"])[];

const yieldMetricFields = [
  "baseApyPct",
  "rewardApyPct",
  "netApyPct",
  "tvlUsd",
  "liquidityUsd",
  "protocolExposure",
  "withdrawalConstraints",
  "routeHistory",
  "gasImpactPct"
] as const satisfies readonly (keyof YieldOptimisationAgentPassport["categoryMetrics"])[];

const healthMetricFields = [
  "currentHealthFactor",
  "minimumHealthFactor",
  "monitoredCollateral",
  "monitoredDebt",
  "alertLatencySeconds",
  "interventionPolicy",
  "executionHistory",
  "liquidationRiskThresholds"
] as const satisfies readonly (keyof HealthFactorMonitoringAgentPassport["categoryMetrics"])[];

const riskRank = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
} as const;

function normalizeMatchKey(value: string): string {
  return value.trim().toLowerCase();
}

function roundRatio(value: number): number {
  return Number(value.toFixed(3));
}

function categoryEvidence(passport: AgentPassport): readonly EvidenceMetric<unknown>[] {
  switch (passport.category) {
    case "lp-rebalancing":
      return lpMetricFields.map((field) => passport.categoryMetrics[field]);
    case "grid-trading":
      return gridMetricFields.map((field) => passport.categoryMetrics[field]);
    case "yield-optimisation":
      return yieldMetricFields.map((field) => passport.categoryMetrics[field]);
    case "health-factor-monitoring":
      return healthMetricFields.map((field) => passport.categoryMetrics[field]);
  }
}

function evidenceSummary(passport: AgentPassport): RecommendationEvidenceSummary {
  const metrics: readonly EvidenceMetric<unknown>[] = [
    ...commonMetricFields.map((field) => passport.common[field]),
    ...categoryEvidence(passport)
  ];
  let availableMetricCount = 0;
  let freshMetricCount = 0;
  let staleMetricCount = 0;
  let expiredMetricCount = 0;
  let unknownMetricCount = 0;
  let unavailableMetricCount = 0;

  for (const metric of metrics) {
    if (metric.availability === "unknown") {
      unknownMetricCount += 1;
    } else if (metric.availability === "unavailable") {
      unavailableMetricCount += 1;
    } else {
      availableMetricCount += 1;
      if (metric.freshness === "fresh") freshMetricCount += 1;
      else if (metric.freshness === "stale") staleMetricCount += 1;
      else expiredMetricCount += 1;
    }
  }

  const totalMetricCount = metrics.length;
  const completenessRatio = roundRatio(availableMetricCount / totalMetricCount);
  const freshRatio = roundRatio(freshMetricCount / totalMetricCount);
  const high = RECOMMENDATION_EVIDENCE_CONFIDENCE_POLICY.high;
  const medium = RECOMMENDATION_EVIDENCE_CONFIDENCE_POLICY.medium;
  const confidence =
    completenessRatio >= high.minimumCompletenessRatio && freshRatio >= high.minimumFreshRatio
      ? "high"
      : completenessRatio >= medium.minimumCompletenessRatio &&
          freshRatio >= medium.minimumFreshRatio
        ? "medium"
        : "low";

  return {
    totalMetricCount,
    availableMetricCount,
    freshMetricCount,
    staleMetricCount,
    expiredMetricCount,
    unknownMetricCount,
    unavailableMetricCount,
    completenessRatio,
    freshRatio,
    confidence
  };
}

function zodPath(path: readonly PropertyKey[]): readonly (string | number)[] {
  return path.map((segment) =>
    typeof segment === "symbol" ? (segment.description ?? "symbol") : segment
  );
}

function inputIssues(
  source: RecommendationInputIssue["source"],
  error: z.ZodError
): readonly RecommendationInputIssue[] {
  return error.issues.map((issue) => ({
    source,
    code: issue.code,
    message: issue.message,
    path: zodPath(issue.path)
  }));
}

function invalidResult(
  issues: readonly RecommendationInputIssue[],
  asOf: string | null = null
): InvalidRecommendationResult {
  return {
    status: "invalid",
    methodVersion: RECOMMENDATION_METHOD_VERSION,
    methodPolicy: RECOMMENDATION_METHOD_POLICY,
    economicReturnStatement: ECONOMIC_RETURN_STATEMENT,
    asOf,
    intent: null,
    issues,
    candidates: [],
    eligible: [],
    insufficientEvidence: [],
    rejected: [],
    outcome: "no-eligible-agent"
  };
}

function publicationReason(issue: PublicationIssue): RecommendationReason {
  return {
    kind: issue.blockingLevel === "discoverability" ? "block" : "evidence",
    code: `PUBLICATION_${issue.code}`,
    message: issue.message,
    path: issue.path
  };
}

function reason(
  kind: RecommendationReasonKind,
  code: string,
  message: string,
  path: readonly (string | number)[]
): RecommendationReason {
  return { kind, code, message, path };
}

function evidenceQualifier(freshness: "fresh" | "stale" | "expired"): string {
  return freshness === "fresh"
    ? "Fresh evidence"
    : `${freshness[0]?.toUpperCase()}${freshness.slice(1)} evidence`;
}

function requestedPermissionEnd(asOf: string, horizonDays: number): string | null {
  const endMs = Date.parse(asOf) + horizonDays * 86_400_000;
  if (!Number.isFinite(endMs)) return null;
  try {
    return new Date(endMs).toISOString();
  } catch {
    return null;
  }
}

function candidateKey(passport: AgentPassport): string {
  const chainId =
    passport.common.chain.availability === "available"
      ? String(passport.common.chain.value.chainId)
      : passport.environment;
  const agentId =
    passport.common.identity.availability === "available"
      ? passport.common.identity.value.agentId
      : "unproven";
  return `${chainId}:${agentId}:${passport.slug}`;
}

function evaluateCandidate(
  unparsedPassport: unknown,
  inputIndex: number,
  intent: RecommendationIntent,
  asOf: string,
  permissionEnd: string
): RecommendationCandidateDecision {
  const publication = evaluateStrictLivePublication(unparsedPassport, { asOf });
  if (publication.passport === null) {
    return {
      inputIndex,
      candidateKey: `invalid-candidate:${inputIndex}`,
      slug: null,
      name: null,
      agentId: null,
      category: null,
      status: "rejected",
      rank: null,
      publicationStatus: publication.status,
      publicationDiscoverable: publication.discoverable,
      publicationHireable: publication.hireable,
      publicationIssues: publication.issues,
      evidence: null,
      confidence: "none",
      matchedAssets: [],
      matchedProtocols: [],
      requestedPermissionEndsAt: permissionEnd,
      permissionExpiresAt: null,
      reasons: publication.issues.map(publicationReason),
      economicReturnStatement: ECONOMIC_RETURN_STATEMENT
    };
  }

  const passport = publication.passport;
  const summary = evidenceSummary(passport);
  const reasons: RecommendationReason[] = publication.issues.map(publicationReason);
  const blocks: RecommendationReason[] = [];
  const matches: RecommendationReason[] = [];

  if (passport.category !== intent.category) {
    blocks.push(
      reason(
        "block",
        "CATEGORY_MISMATCH",
        `Requested ${intent.category}; this passport is ${passport.category}. Cross-category ranking is not performed.`,
        ["category"]
      )
    );
  } else {
    matches.push(
      reason(
        "match",
        "CATEGORY_MATCH",
        `Passport category matches the requested ${intent.category} category.`,
        ["category"]
      )
    );
  }

  const chain = passport.common.chain;
  if (chain.availability === "available") {
    const qualifier = evidenceQualifier(chain.freshness);
    if (chain.value.chainId !== intent.chainId) {
      blocks.push(
        reason(
          "block",
          "CHAIN_MISMATCH",
          `${qualifier} identifies chain ${chain.value.chainId}; the intent requires chain ${intent.chainId}.`,
          ["common", "chain"]
        )
      );
    } else {
      matches.push(
        reason(
          chain.freshness === "fresh" ? "match" : "evidence",
          "CHAIN_MATCH",
          `${qualifier} identifies the requested chain ${intent.chainId}.`,
          ["common", "chain"]
        )
      );
    }
  }

  const minimumCapital = passport.common.minimumCapitalUsd;
  if (minimumCapital.availability === "available") {
    const qualifier = evidenceQualifier(minimumCapital.freshness);
    if (intent.capitalUsd < minimumCapital.value) {
      blocks.push(
        reason(
          "block",
          "CAPITAL_BELOW_MINIMUM",
          `${qualifier} reports a minimum capital of USD ${minimumCapital.value}; the intent provides USD ${intent.capitalUsd}.`,
          ["common", "minimumCapitalUsd"]
        )
      );
    } else {
      matches.push(
        reason(
          minimumCapital.freshness === "fresh" ? "match" : "evidence",
          "CAPITAL_MEETS_MINIMUM",
          `${qualifier} reports a USD ${minimumCapital.value} minimum, met by the USD ${intent.capitalUsd} intent.`,
          ["common", "minimumCapitalUsd"]
        )
      );
    }
  }

  const risk = passport.common.risk;
  if (risk.availability === "available") {
    const criticalFactor = risk.value.factors.find((factor) => factor.severity === "critical");
    const qualifier = evidenceQualifier(risk.freshness);
    if (risk.value.level === "critical" || criticalFactor !== undefined) {
      const factorText =
        criticalFactor === undefined
          ? "overall risk is critical"
          : `factor ${criticalFactor.code} is critical`;
      blocks.push(
        reason(
          "block",
          "CRITICAL_RISK",
          `${qualifier} reports ${factorText}; critical risk is never recommendation-eligible.`,
          ["common", "risk"]
        )
      );
    } else if (riskRank[risk.value.level] > riskRank[intent.riskTolerance]) {
      blocks.push(
        reason(
          "block",
          "RISK_EXCEEDS_TOLERANCE",
          `${qualifier} reports ${risk.value.level} risk, above the ${intent.riskTolerance} tolerance.`,
          ["common", "risk"]
        )
      );
    } else {
      matches.push(
        reason(
          risk.freshness === "fresh" ? "match" : "evidence",
          "RISK_WITHIN_TOLERANCE",
          `${qualifier} reports ${risk.value.level} risk, within the ${intent.riskTolerance} tolerance.`,
          ["common", "risk"]
        )
      );
    }
  }

  const supportedAssets = passport.common.supportedAssets;
  let matchedAssets: readonly string[] = [];
  if (supportedAssets.availability === "available") {
    const supportedKeys = new Set(
      supportedAssets.value
        .filter((asset) => asset.chainId === intent.chainId)
        .map((asset) => normalizeMatchKey(asset.symbol))
    );
    matchedAssets = intent.preferredAssets.filter((asset) =>
      supportedKeys.has(normalizeMatchKey(asset))
    );
    const qualifier = evidenceQualifier(supportedAssets.freshness);
    const missingAssets = intent.preferredAssets.filter(
      (asset) => !supportedKeys.has(normalizeMatchKey(asset))
    );
    if (missingAssets.length > 0) {
      blocks.push(
        reason(
          "block",
          "ASSET_MISMATCH",
          `${qualifier} does not support every requested asset on chain ${intent.chainId}; missing: ${missingAssets.join(", ")}.`,
          ["common", "supportedAssets"]
        )
      );
    } else {
      matches.push(
        reason(
          supportedAssets.freshness === "fresh" ? "match" : "evidence",
          "ASSET_MATCH",
          `${qualifier} supports requested asset${matchedAssets.length === 1 ? "" : "s"}: ${matchedAssets.join(", ")}.`,
          ["common", "supportedAssets"]
        )
      );
    }
  }

  const supportedProtocols = passport.common.supportedProtocols;
  let matchedProtocols: readonly string[] = [];
  if (supportedProtocols.availability === "available") {
    const supportedKeys = new Set(
      supportedProtocols.value.map((protocol) => normalizeMatchKey(protocol.name))
    );
    matchedProtocols = intent.permittedProtocols.filter((protocol) =>
      supportedKeys.has(normalizeMatchKey(protocol))
    );
    const qualifier = evidenceQualifier(supportedProtocols.freshness);
    if (matchedProtocols.length === 0) {
      blocks.push(
        reason(
          "block",
          "PROTOCOL_MISMATCH",
          `${qualifier} shows no overlap with the permitted protocol list.`,
          ["common", "supportedProtocols"]
        )
      );
    } else {
      matches.push(
        reason(
          supportedProtocols.freshness === "fresh" ? "match" : "evidence",
          "PROTOCOL_MATCH",
          `${qualifier} supports permitted protocol${matchedProtocols.length === 1 ? "" : "s"}: ${matchedProtocols.join(", ")}.`,
          ["common", "supportedProtocols"]
        )
      );
    }
  }

  const permission = passport.common.permissionSummary;
  let permissionExpiresAt: string | null = null;
  if (permission.availability === "available") {
    permissionExpiresAt = permission.value.expiresAt;
    const qualifier = evidenceQualifier(permission.freshness);
    if (Date.parse(permissionExpiresAt) < Date.parse(permissionEnd)) {
      blocks.push(
        reason(
          "block",
          "PERMISSION_HORIZON_TOO_SHORT",
          `${qualifier} expires at ${permissionExpiresAt}, before the requested horizon ends at ${permissionEnd}.`,
          ["common", "permissionSummary", "value", "expiresAt"]
        )
      );
    } else {
      matches.push(
        reason(
          permission.freshness === "fresh" ? "match" : "evidence",
          "PERMISSION_HORIZON_COVERED",
          `${qualifier} covers the requested horizon through ${permissionEnd} and expires at ${permissionExpiresAt}.`,
          ["common", "permissionSummary", "value", "expiresAt"]
        )
      );
    }
  }

  reasons.push(...blocks, ...matches);
  reasons.push(
    reason(
      "evidence",
      "EVIDENCE_QUALITY",
      `${summary.availableMetricCount}/${summary.totalMetricCount} evidence fields are available and ${summary.freshMetricCount}/${summary.totalMetricCount} are fresh; confidence is ${summary.confidence}.`,
      []
    )
  );

  const status: RecommendationCandidateStatus =
    blocks.length > 0 || !publication.discoverable
      ? "rejected"
      : publication.hireable
        ? "eligible"
        : "discoverable-insufficient";
  const agentId =
    passport.common.identity.availability === "available"
      ? passport.common.identity.value.agentId
      : null;

  return {
    inputIndex,
    candidateKey: candidateKey(passport),
    slug: passport.slug,
    name: passport.metadata.name,
    agentId,
    category: passport.category,
    status,
    rank: null,
    publicationStatus: publication.status,
    publicationDiscoverable: publication.discoverable,
    publicationHireable: publication.hireable,
    publicationIssues: publication.issues,
    evidence: summary,
    confidence: summary.confidence,
    matchedAssets,
    matchedProtocols,
    requestedPermissionEndsAt: permissionEnd,
    permissionExpiresAt,
    reasons,
    economicReturnStatement: ECONOMIC_RETURN_STATEMENT
  };
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

const statusOrder: Readonly<Record<RecommendationCandidateStatus, number>> = {
  eligible: 0,
  "discoverable-insufficient": 1,
  rejected: 2
};

function compareCandidates(
  left: RecommendationCandidateDecision,
  right: RecommendationCandidateDecision,
  requestedCategory: RecommendationIntent["category"]
): number {
  const statusDifference = statusOrder[left.status] - statusOrder[right.status];
  if (statusDifference !== 0) return statusDifference;

  const sameRequestedCategory =
    left.category === requestedCategory && right.category === requestedCategory;
  if (sameRequestedCategory && left.evidence !== null && right.evidence !== null) {
    const freshnessDifference = right.evidence.freshRatio - left.evidence.freshRatio;
    if (freshnessDifference !== 0) return freshnessDifference;
    const completenessDifference =
      right.evidence.completenessRatio - left.evidence.completenessRatio;
    if (completenessDifference !== 0) return completenessDifference;
  }

  const slugDifference = compareText(
    normalizeMatchKey(left.slug ?? left.candidateKey),
    normalizeMatchKey(right.slug ?? right.candidateKey)
  );
  if (slugDifference !== 0) return slugDifference;
  const agentDifference = compareText(left.agentId ?? "", right.agentId ?? "");
  if (agentDifference !== 0) return agentDifference;
  return left.inputIndex - right.inputIndex;
}

/**
 * Evaluates candidates without fetching or substituting data. Invalid candidate
 * passports remain visible as rejected decisions; an invalid intent/context/list
 * invalidates the run and produces no recommendations.
 */
export function recommendAgents(
  unparsedIntent: unknown,
  unparsedCandidates: unknown,
  unparsedContext: unknown
): RecommendationResult {
  const parsedIntent = RecommendationIntentSchema.safeParse(unparsedIntent);
  if (!parsedIntent.success) return invalidResult(inputIssues("intent", parsedIntent.error));

  const parsedContext = RecommendationContextSchema.safeParse(unparsedContext);
  if (!parsedContext.success) return invalidResult(inputIssues("context", parsedContext.error));

  const parsedCandidates = z.array(z.unknown()).max(500).safeParse(unparsedCandidates);
  if (!parsedCandidates.success) {
    return invalidResult(
      inputIssues("candidates", parsedCandidates.error),
      parsedContext.data.asOf
    );
  }

  const permissionEnd = requestedPermissionEnd(
    parsedContext.data.asOf,
    parsedIntent.data.horizonDays
  );
  if (permissionEnd === null) {
    return invalidResult(
      [
        {
          source: "context",
          code: "HORIZON_TIMESTAMP_OVERFLOW",
          message: "The requested horizon cannot be represented from the evaluation timestamp.",
          path: ["asOf"]
        }
      ],
      parsedContext.data.asOf
    );
  }

  const evaluated = parsedCandidates.data.map((passport, inputIndex) =>
    evaluateCandidate(
      passport,
      inputIndex,
      parsedIntent.data,
      parsedContext.data.asOf,
      permissionEnd
    )
  );
  const seenCandidateKeys = new Set<string>();
  const deduplicated = evaluated.map((candidate) => {
    if (candidate.slug === null || !seenCandidateKeys.has(candidate.candidateKey)) {
      if (candidate.slug !== null) seenCandidateKeys.add(candidate.candidateKey);
      return candidate;
    }
    return {
      ...candidate,
      rank: null,
      status: "rejected" as const,
      reasons: [
        ...candidate.reasons,
        reason(
          "block",
          "DUPLICATE_CANDIDATE",
          "This canonical agent candidate already appeared earlier in the same recommendation run.",
          []
        )
      ]
    };
  });
  const sorted = [...deduplicated].sort((left, right) =>
    compareCandidates(left, right, parsedIntent.data.category)
  );
  let nextRank = 1;
  const candidates = sorted.map((candidate) =>
    candidate.status === "eligible" ? { ...candidate, rank: nextRank++ } : candidate
  );
  const eligible = candidates.filter((candidate) => candidate.status === "eligible");
  const insufficientEvidence = candidates.filter(
    (candidate) => candidate.status === "discoverable-insufficient"
  );
  const rejected = candidates.filter((candidate) => candidate.status === "rejected");

  return {
    status: "evaluated",
    methodVersion: RECOMMENDATION_METHOD_VERSION,
    methodPolicy: RECOMMENDATION_METHOD_POLICY,
    economicReturnStatement: ECONOMIC_RETURN_STATEMENT,
    asOf: parsedContext.data.asOf,
    intent: parsedIntent.data,
    issues: [],
    candidates,
    eligible,
    insufficientEvidence,
    rejected,
    outcome: eligible.length > 0 ? "eligible-agents-found" : "no-eligible-agent"
  };
}
