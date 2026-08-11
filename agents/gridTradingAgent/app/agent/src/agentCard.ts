import type { AgentCard, AgentSkill } from "@a2a-js/sdk";
import { GRID_TRADING_SKILL } from "./gridAnalysis.js";

const GRID_ANALYSIS_SKILL: AgentSkill = {
  id: GRID_TRADING_SKILL,
  name: "Analyze a bounded BSC grid candidate",
  description:
    "Analyze explicitly sourced current price, arithmetic grid range, fee, " +
    "round-trip gas, exact capital minor units, and caller risk constraints " +
    "for BSC 56 or 97. Returns hold, review_grid, or insufficient_evidence " +
    "with provenance and methodology. Realized performance remains unknown. " +
    "Read-only: executionEnabled is always false.",
  tags: ["grid-trading", "risk", "evidence", "read-only", "bnb-chain"],
  inputModes: ["application/json"],
  outputModes: ["application/json"]
};

/** Build the discoverable A2A card; the hosting layer supplies its public URL. */
export function buildGridTradingAgentCard(url = "http://localhost:9000/"): AgentCard {
  return {
    name: "ProofEra Grid Trading Evidence Agent",
    description:
      "Deterministic, read-only BSC grid candidate analysis backed only by caller-supplied evidence.",
    url,
    version: "1.0.0",
    protocolVersion: "0.3.0",
    preferredTransport: "JSONRPC",
    capabilities: { streaming: false },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [GRID_ANALYSIS_SKILL]
  };
}
