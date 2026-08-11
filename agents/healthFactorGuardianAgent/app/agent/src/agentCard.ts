import type { AgentCard, AgentSkill } from "@a2a-js/sdk";
import { HEALTH_FACTOR_SKILL } from "./healthFactorAnalysis.js";

const HEALTH_FACTOR_ANALYSIS_SKILL: AgentSkill = {
  id: HEALTH_FACTOR_SKILL,
  name: "Analyze Venus Core Pool health-factor evidence",
  description:
    "Analyze a complete caller-supplied same-block Venus Core Pool collateral/debt " +
    "snapshot for BSC 56 or 97 using account-specific effective liquidation " +
    "thresholds, exact fixed-point arithmetic, observation history, alert receipts, " +
    "and user policy. Returns hold, monitor, review_intervention, or " +
    "insufficient_evidence. Read-only: executionEnabled is always false.",
  tags: ["venus", "health-factor", "liquidation-risk", "read-only", "bnb-chain"],
  inputModes: ["application/json"],
  outputModes: ["application/json"]
};

/** Build the discoverable A2A card; the hosting layer supplies its public URL. */
export function buildHealthFactorGuardianAgentCard(url = "http://localhost:9000/"): AgentCard {
  return {
    name: "ProofEra Health-Factor Guardian Evidence Agent",
    description:
      "Deterministic, read-only Venus Core Pool health-factor and monitoring-evidence analysis.",
    url,
    version: "1.0.0",
    protocolVersion: "0.3.0",
    preferredTransport: "JSONRPC",
    capabilities: { streaming: false },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [HEALTH_FACTOR_ANALYSIS_SKILL]
  };
}
