import type { AgentCard, AgentSkill } from "@a2a-js/sdk";

const ANALYZE_LP_RANGE: AgentSkill = {
  id: "analyze_lp_range",
  name: "Analyze a PancakeSwap V3 LP range",
  description:
    'Send exactly one bounded JSON data part {"skill":"analyze_lp_range", ...} ' +
    "with a caller-supplied BSC block/time/source snapshot, V3 ticks, exact " +
    "decimal minor-unit economics, capital, and risk constraints. Returns " +
    "deterministic range status, tick buffers, violations, known net benefit or " +
    "null, methodology, provenance, and hold/review_rebalance/" +
    "insufficient_evidence. The snapshot is not independently attested and " +
    "executionEnabled is always false. This agent never fetches, negotiates, " +
    "signs, approves, rebalances, submits, or holds a wallet.",
  tags: ["pancakeswap-v3", "lp-range", "risk", "read-only", "bnb-chain"],
  inputModes: ["application/json"],
  outputModes: ["application/json"]
};

const AUDIT_ALTANA_PERMISSION_BUNDLE: AgentSkill = {
  id: "audit_altana_permission_bundle",
  name: "Audit a frozen Altana permission bundle",
  description:
    'Send exactly one bounded JSON data part {"skill":"audit_altana_permission_bundle","bundle":...}. ' +
    "Validates a secret-free, evidence-linked BSC testnet permission bundle and deterministically returns findings plus a corrected three-layer least-authority table. " +
    "It never fetches, signs, grants, retries, revokes, submits, broadcasts, stores secrets or mutates durable state; executionPerformed is always false.",
  tags: ["altana", "permission-audit", "security", "read-only", "bnb-chain"],
  inputModes: ["application/json"],
  outputModes: ["application/json"]
};

/** The card omits auth metadata because the M1 server enforces no auth. */
export function buildAgentCard(url = "http://localhost:9000/"): AgentCard {
  return {
    name: "ProofEra LP Risk Evidence Agent",
    description:
      "Deterministic, read-only PancakeSwap LP range and scoped permission evidence analysis on BSC mainnet and testnet.",
    url,
    version: "1.0.0",
    protocolVersion: "0.3.0",
    preferredTransport: "JSONRPC",
    capabilities: { streaming: false },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [ANALYZE_LP_RANGE, AUDIT_ALTANA_PERMISSION_BUNDLE]
  };
}
