import { parseAgentRouteIdentity, type AgentRouteIdentity } from "./agent-route";

export interface ComparisonSearchParams {
  readonly agent?: string | readonly string[];
  readonly agents?: string | readonly string[];
}

export type ComparisonSelection =
  | {
      readonly status: "ready";
      readonly agents: readonly [AgentRouteIdentity, AgentRouteIdentity, ...AgentRouteIdentity[]];
    }
  | {
      readonly status: "invalid";
      readonly reason: "ambiguous_query" | "invalid_identity" | "too_few" | "too_many";
      readonly agents: readonly AgentRouteIdentity[];
    };

export function parseComparisonSelection(params: ComparisonSearchParams): ComparisonSelection {
  if (params.agent !== undefined && params.agents !== undefined) {
    return { status: "invalid", reason: "ambiguous_query", agents: [] };
  }

  const submitted = params.agent ?? params.agents;
  const raw = submitted === undefined ? [] : Array.isArray(submitted) ? submitted : [submitted];
  if (raw.length > 4) return { status: "invalid", reason: "too_many", agents: [] };

  const agents: AgentRouteIdentity[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const separator = value.indexOf(":");
    if (separator <= 0 || separator !== value.lastIndexOf(":")) {
      return { status: "invalid", reason: "invalid_identity", agents: [] };
    }

    const identity = parseAgentRouteIdentity({
      chainId: value.slice(0, separator),
      tokenId: value.slice(separator + 1)
    });
    if (identity === null) return { status: "invalid", reason: "invalid_identity", agents: [] };

    const key = `${identity.chainId}:${identity.tokenId}`;
    if (!seen.has(key)) {
      agents.push(identity);
      seen.add(key);
    }
  }

  if (agents.length < 2) return { status: "invalid", reason: "too_few", agents };
  return {
    status: "ready",
    agents: agents as [AgentRouteIdentity, AgentRouteIdentity, ...AgentRouteIdentity[]]
  };
}
