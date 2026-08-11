import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  healthFactorAnalysisInputSchema,
  healthFactorAnalysisResultSchema,
  handleHealthFactorMcp
} from "./healthFactorAnalysis.js";

const PURE_ANALYSIS_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

/** Build an in-process MCP server exposing only the pure analysis tool. */
export function buildHealthFactorGuardianMcpServer(): McpServer {
  const server = new McpServer({
    name: "proofera-health-factor-guardian-agent",
    version: "1.0.0"
  });
  server.registerTool(
    "analyze_venus_health_factor",
    {
      description:
        "Deterministically analyze explicitly sourced, same-block Venus Core Pool " +
        "collateral/debt evidence, effective liquidation thresholds, observation " +
        "history, alert receipts, and policy on BSC 56 or 97. Never fetches or executes.",
      inputSchema: healthFactorAnalysisInputSchema,
      outputSchema: healthFactorAnalysisResultSchema,
      annotations: PURE_ANALYSIS_ANNOTATIONS
    },
    (input) => handleHealthFactorMcp(input)
  );
  return server;
}
