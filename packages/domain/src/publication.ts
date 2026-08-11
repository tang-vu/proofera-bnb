import { z } from "zod";

import {
  AgentPassportSchema,
  type AgentPassport,
  type CommonAgentMetrics,
  type GridTradingAgentPassport,
  type HealthFactorMonitoringAgentPassport,
  type LpRebalancingAgentPassport,
  type YieldOptimisationAgentPassport
} from "./agent";
import { UtcDateTimeSchema, type EvidenceMetric } from "./evidence";

export const StrictLivePublicationContextSchema = z.strictObject({
  asOf: UtcDateTimeSchema
});

export type StrictLivePublicationContext = z.infer<typeof StrictLivePublicationContextSchema>;

export type PublicationPathSegment = string | number;

export type PublicationIssueCode =
  | "INVALID_PASSPORT"
  | "CORE_EVIDENCE_MISSING"
  | "PASSPORT_ENVIRONMENT_NOT_LIVE"
  | "NON_LIVE_EVIDENCE"
  | "FIXTURE_SOURCE_NOT_ALLOWED"
  | "EVIDENCE_ENVIRONMENT_MISMATCH"
  | "EVIDENCE_TIMESTAMP_AFTER_EVALUATION"
  | "NON_LIVE_REALIZED_EVIDENCE"
  | "CORE_EVIDENCE_UNKNOWN"
  | "CORE_EVIDENCE_UNAVAILABLE"
  | "CORE_EVIDENCE_STALE"
  | "CORE_EVIDENCE_EXPIRED"
  | "CATEGORY_EVIDENCE_UNKNOWN"
  | "CATEGORY_EVIDENCE_UNAVAILABLE"
  | "CATEGORY_EVIDENCE_STALE"
  | "CATEGORY_EVIDENCE_EXPIRED"
  | "LIFECYCLE_NOT_LIVE"
  | "VERIFICATION_NOT_VERIFIED"
  | "VERIFICATION_REVOKED"
  | "PERMISSION_SCOPE_EXPIRED"
  | "PERMISSION_SCOPE_NOT_REVOCABLE";

export type PublicationBlockingLevel = "discoverability" | "hireability";

export type PublicationIssue = {
  blockingLevel: PublicationBlockingLevel;
  code: PublicationIssueCode;
  message: string;
  path: readonly PublicationPathSegment[];
};

export type StrictLivePublicationStatus = "rejected" | "discoverable" | "hireable";

export type StrictLivePublicationDecision = {
  asOf: string;
  discoverable: boolean;
  hireable: boolean;
  issues: readonly PublicationIssue[];
  passport: AgentPassport | null;
  status: StrictLivePublicationStatus;
};

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

const coreActivationMetricFields = [
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
  "supportedAssets",
  "supportedProtocols",
  "minimumCapitalUsd",
  "permissionSummary"
] as const satisfies readonly (keyof CommonAgentMetrics)[];

const coreActivationMetricFieldSet: ReadonlySet<string> = new Set(coreActivationMetricFields);

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

const lpRealizedMetricFields: ReadonlySet<string> = new Set([
  "inRangeTime",
  "feeAprPct",
  "estimatedImpermanentLossPct",
  "rebalanceFrequency",
  "gasDragPct",
  "netPerformancePct"
]);
const gridRealizedMetricFields: ReadonlySet<string> = new Set([
  "realizedPnlUsd",
  "fills",
  "winRate",
  "maximumDrawdownPct",
  "turnoverUsd",
  "costs"
]);
const yieldRealizedMetricFields: ReadonlySet<string> = new Set([
  "netApyPct",
  "routeHistory",
  "gasImpactPct"
]);
const healthRealizedMetricFields: ReadonlySet<string> = new Set([
  "minimumHealthFactor",
  "alertLatencySeconds",
  "executionHistory"
]);

type PublicationEvidence = EvidenceMetric<unknown>;

type EvidenceVisitor = (
  path: readonly PublicationPathSegment[],
  evidence: PublicationEvidence,
  realized: boolean
) => void;

function visitCategoryEvidence(passport: AgentPassport, visitor: EvidenceVisitor): void {
  switch (passport.category) {
    case "lp-rebalancing":
      for (const field of lpMetricFields) {
        visitor(
          ["categoryMetrics", field],
          passport.categoryMetrics[field],
          lpRealizedMetricFields.has(field)
        );
      }
      return;
    case "grid-trading":
      for (const field of gridMetricFields) {
        visitor(
          ["categoryMetrics", field],
          passport.categoryMetrics[field],
          gridRealizedMetricFields.has(field)
        );
      }
      return;
    case "yield-optimisation":
      for (const field of yieldMetricFields) {
        visitor(
          ["categoryMetrics", field],
          passport.categoryMetrics[field],
          yieldRealizedMetricFields.has(field)
        );
      }
      return;
    case "health-factor-monitoring":
      for (const field of healthMetricFields) {
        visitor(
          ["categoryMetrics", field],
          passport.categoryMetrics[field],
          healthRealizedMetricFields.has(field)
        );
      }
  }
}

function isNonLiveEnvironment(environment: PublicationEvidence["environment"]): boolean {
  return environment === "fixture" || environment === "simulation";
}

function zodPath(path: readonly PropertyKey[]): PublicationPathSegment[] {
  return path.map((segment) =>
    typeof segment === "symbol" ? (segment.description ?? "symbol") : segment
  );
}

function isMissingCoreMetricIssue(issue: z.ZodIssue): boolean {
  return (
    issue.code === "invalid_type" &&
    issue.path.length === 2 &&
    issue.path[0] === "common" &&
    typeof issue.path[1] === "string" &&
    coreActivationMetricFieldSet.has(issue.path[1])
  );
}

function publicationStatus(discoverable: boolean, hireable: boolean): StrictLivePublicationStatus {
  if (!discoverable) return "rejected";
  return hireable ? "hireable" : "discoverable";
}

/**
 * Pure strict-live gate. It does not fetch, repair, backfill, or substitute any
 * evidence. Callers must persist the explicit as-of time with the decision.
 */
export function evaluateStrictLivePublication(
  unparsedPassport: unknown,
  unparsedContext: unknown
): StrictLivePublicationDecision {
  const context = StrictLivePublicationContextSchema.parse(unparsedContext);
  const parsedPassport = AgentPassportSchema.safeParse(unparsedPassport);
  if (!parsedPassport.success) {
    const issues: PublicationIssue[] = parsedPassport.error.issues.map((issue) => ({
      blockingLevel: "discoverability",
      code: isMissingCoreMetricIssue(issue) ? "CORE_EVIDENCE_MISSING" : "INVALID_PASSPORT",
      message: issue.message,
      path: zodPath(issue.path)
    }));
    return {
      asOf: context.asOf,
      discoverable: false,
      hireable: false,
      issues,
      passport: null,
      status: "rejected"
    };
  }

  const passport = parsedPassport.data;
  const asOfMs = Date.parse(context.asOf);
  const issues: PublicationIssue[] = [];
  const addIssue = (
    blockingLevel: PublicationBlockingLevel,
    code: PublicationIssueCode,
    path: readonly PublicationPathSegment[],
    message: string
  ): void => {
    issues.push({ blockingLevel, code, message, path });
  };

  if (passport.environment === "fixture" || passport.environment === "simulation") {
    addIssue(
      "discoverability",
      "PASSPORT_ENVIRONMENT_NOT_LIVE",
      ["environment"],
      "Strict live publication accepts only explicitly labelled testnet or mainnet passports."
    );
  }

  const inspectEvidence: EvidenceVisitor = (path, evidence, realized) => {
    const environmentIsNonLive = isNonLiveEnvironment(evidence.environment);
    const availableFixtureSource =
      evidence.availability === "available" && evidence.source.kind === "fixture";

    if (environmentIsNonLive) {
      addIssue(
        "discoverability",
        "NON_LIVE_EVIDENCE",
        [...path, "environment"],
        "Fixture and simulation evidence cannot enter strict live publication."
      );
    }

    if (evidence.availability === "available" && evidence.environment !== passport.environment) {
      addIssue(
        "discoverability",
        "EVIDENCE_ENVIRONMENT_MISMATCH",
        [...path, "environment"],
        "Available evidence environment must equal the passport environment."
      );
    }

    if (availableFixtureSource) {
      addIssue(
        "discoverability",
        "FIXTURE_SOURCE_NOT_ALLOWED",
        [...path, "source", "kind"],
        "A fixture source cannot support strict live publication."
      );
    }

    if (evidence.availability === "unavailable" && evidence.expectedSource.kind === "fixture") {
      addIssue(
        "discoverability",
        "FIXTURE_SOURCE_NOT_ALLOWED",
        [...path, "expectedSource", "kind"],
        "A fixture adapter cannot be the expected source for strict live publication."
      );
    }
    if (evidence.availability === "unavailable" && evidence.lastGood?.source.kind === "fixture") {
      addIssue(
        "discoverability",
        "FIXTURE_SOURCE_NOT_ALLOWED",
        [...path, "lastGood", "source", "kind"],
        "Nested last-good fixture evidence cannot enter strict live publication."
      );
    }

    const futureTimestampPath =
      Date.parse(evidence.ingestedAt) > asOfMs
        ? [...path, "ingestedAt"]
        : evidence.availability === "available" && Date.parse(evidence.observedAt) > asOfMs
          ? [...path, "observedAt"]
          : evidence.availability === "unavailable" && Date.parse(evidence.attemptedAt) > asOfMs
            ? [...path, "attemptedAt"]
            : evidence.availability === "unavailable" &&
                evidence.lastGood !== null &&
                Date.parse(evidence.lastGood.observedAt) > asOfMs
              ? [...path, "lastGood", "observedAt"]
              : evidence.methodology.observationWindow !== null &&
                  Date.parse(evidence.methodology.observationWindow.end) > asOfMs
                ? [...path, "methodology", "observationWindow", "end"]
                : null;
    if (futureTimestampPath !== null) {
      addIssue(
        "discoverability",
        "EVIDENCE_TIMESTAMP_AFTER_EVALUATION",
        futureTimestampPath,
        "Evidence cannot postdate the deterministic publication evaluation time."
      );
    }

    if (
      realized &&
      evidence.availability === "available" &&
      (environmentIsNonLive || availableFixtureSource)
    ) {
      addIssue(
        "discoverability",
        "NON_LIVE_REALIZED_EVIDENCE",
        path,
        "A realized category field requires testnet or mainnet evidence from a non-fixture source."
      );
    }
  };

  for (const field of commonMetricFields) {
    inspectEvidence(["common", field], passport.common[field], false);
  }
  visitCategoryEvidence(passport, inspectEvidence);

  visitCategoryEvidence(passport, (path, evidence) => {
    if (evidence.availability === "unknown") {
      addIssue(
        "hireability",
        "CATEGORY_EVIDENCE_UNKNOWN",
        [...path, "availability"],
        "Category evidence is unknown; the agent may be discovered but not hired."
      );
      return;
    }
    if (evidence.availability === "unavailable") {
      addIssue(
        "hireability",
        "CATEGORY_EVIDENCE_UNAVAILABLE",
        [...path, "availability"],
        "Category evidence is unavailable; last-good evidence is not promoted for hiring."
      );
      return;
    }
    if (evidence.freshness === "expired") {
      addIssue(
        "hireability",
        "CATEGORY_EVIDENCE_EXPIRED",
        [...path, "freshness"],
        "Expired category evidence cannot authorize hiring."
      );
    } else if (evidence.freshness === "stale") {
      addIssue(
        "hireability",
        "CATEGORY_EVIDENCE_STALE",
        [...path, "freshness"],
        "Strict hireability requires fresh category evidence."
      );
    }
  });

  for (const field of coreActivationMetricFields) {
    const evidence = passport.common[field];
    const path: readonly PublicationPathSegment[] = ["common", field];
    if (evidence.availability === "unknown") {
      addIssue(
        "hireability",
        "CORE_EVIDENCE_UNKNOWN",
        [...path, "availability"],
        "Core activation evidence is unknown; ProofEra does not substitute a value."
      );
      continue;
    }
    if (evidence.availability === "unavailable") {
      addIssue(
        "hireability",
        "CORE_EVIDENCE_UNAVAILABLE",
        [...path, "availability"],
        "Core activation evidence is unavailable; nested last-good data is not promoted."
      );
      continue;
    }
    if (evidence.freshness === "expired") {
      addIssue(
        "hireability",
        "CORE_EVIDENCE_EXPIRED",
        [...path, "freshness"],
        "Expired core activation evidence cannot authorize hiring."
      );
    } else if (evidence.freshness === "stale") {
      addIssue(
        "hireability",
        "CORE_EVIDENCE_STALE",
        [...path, "freshness"],
        "Strict hireability requires fresh core activation evidence."
      );
    }
  }

  if (
    passport.common.lifecycleStatus.availability === "available" &&
    passport.common.lifecycleStatus.value !== "live"
  ) {
    addIssue(
      "hireability",
      "LIFECYCLE_NOT_LIVE",
      ["common", "lifecycleStatus", "value"],
      "Only an agent with observed live lifecycle status can be hired."
    );
  }

  if (
    passport.common.verification.availability === "available" &&
    passport.common.verification.value.status === "revoked"
  ) {
    addIssue(
      "hireability",
      "VERIFICATION_REVOKED",
      ["common", "verification", "value", "status"],
      "A revoked verification state blocks hiring."
    );
  } else if (
    passport.common.verification.availability === "available" &&
    passport.common.verification.value.status !== "verified"
  ) {
    addIssue(
      "hireability",
      "VERIFICATION_NOT_VERIFIED",
      ["common", "verification", "value", "status"],
      "Strict hireability requires a current independent verified state."
    );
  }

  if (passport.common.permissionSummary.availability === "available") {
    const permissionSummary = passport.common.permissionSummary.value;
    if (Date.parse(permissionSummary.expiresAt) <= asOfMs) {
      addIssue(
        "hireability",
        "PERMISSION_SCOPE_EXPIRED",
        ["common", "permissionSummary", "value", "expiresAt"],
        "Permission scope must remain valid after the publication evaluation time."
      );
    }
    if (!permissionSummary.revocable) {
      addIssue(
        "hireability",
        "PERMISSION_SCOPE_NOT_REVOCABLE",
        ["common", "permissionSummary", "value", "revocable"],
        "Strict hireability requires an explicit revoke mechanism."
      );
    }
  }

  const discoverable = !issues.some((issue) => issue.blockingLevel === "discoverability");
  const hireable = discoverable && issues.length === 0;
  return {
    asOf: context.asOf,
    discoverable,
    hireable,
    issues,
    passport,
    status: publicationStatus(discoverable, hireable)
  };
}
