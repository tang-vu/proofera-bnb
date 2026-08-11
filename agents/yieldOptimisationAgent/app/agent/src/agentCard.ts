import type { AgentCard, AgentSkill } from "@a2a-js/sdk";

const ANALYZE_YIELD_OPPORTUNITIES: AgentSkill = {
  id: "analyze_yield_opportunities",
  name: "Analyze sourced BSC yield opportunities",
  description:
    'Send a bounded JSON data part {"skill":"analyze_yield_opportunities", ...} ' +
    "with caller-supplied BSC vault snapshots, source locators, documented APY " +
    "scales, capital and horizon, liquidity, withdrawal constraints, protocol " +
    "exposure, dimensioned cost valuation, fee reconciliation, route history, " +
    "and user risk limits. Returns per-opportunity hold/review_route/" +
    "insufficient_evidence decisions, exact decimal strings, provenance, and a " +
    "structured caller-supplied trust boundary. Every result is marketplace-, " +
    "activation-, and execution-ineligible and executionEnabled=false. It never " +
    "fetches, signs, connects a wallet, routes capital, or writes onchain.",
  tags: ["yield", "vaults", "risk", "read-only", "bnb-chain"],
  inputModes: ["application/json"],
  outputModes: ["application/json"]
};

/** M1 deliberately omits security metadata because the server enforces no auth. */
export function buildAgentCard(url = "http://localhost:9000/"): AgentCard {
  return {
    name: "yieldOptimisationAgent-agent",
    description:
      "ProofEra deterministic yield route evidence analyzer for BSC mainnet and testnet. Read-only; missing evidence lowers confidence.",
    url,
    version: "2.0.0",
    protocolVersion: "0.3.0",
    preferredTransport: "JSONRPC",
    capabilities: { streaming: false },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [ANALYZE_YIELD_OPPORTUNITIES]
  };
}
