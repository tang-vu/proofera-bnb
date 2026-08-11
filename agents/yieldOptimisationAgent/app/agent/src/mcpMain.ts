import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  handleYieldAnalysisMcp,
  yieldAnalysisInputSchema,
  yieldAnalysisResultSchema
} from "./yieldAnalysis.js";

const PURE_ANALYSIS_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "proofera-yield-analysis", version: "2.0.0" });
  server.registerTool(
    "analyze_yield_opportunities",
    {
      description:
        "Deterministically evaluate up to eight explicitly sourced BSC yield " +
        "opportunities against capital, freshness, liquidity, withdrawal, " +
        "protocol concentration, APY-scale, and exact known-cost constraints. " +
        "The tool never fetches or executes and always returns executionEnabled=false.",
      inputSchema: yieldAnalysisInputSchema,
      outputSchema: yieldAnalysisResultSchema,
      annotations: PURE_ANALYSIS_ANNOTATIONS
    },
    (input) => handleYieldAnalysisMcp(input)
  );
  return server;
}
