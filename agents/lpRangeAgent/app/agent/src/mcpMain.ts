import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  handleLpAnalysisMcp,
  lpAnalysisInputSchema,
  lpAnalysisResultSchema
} from "./lpAnalysis.js";

const PURE_ANALYSIS_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

/** Build an in-process MCP server exposing only deterministic LP analysis. */
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "proofera-lp-range-analysis", version: "1.0.0" });
  server.registerTool(
    "analyze_lp_range",
    {
      description:
        "Deterministically analyze a bounded caller-supplied PancakeSwap V3 LP " +
        "range snapshot on BSC 56 or 97. Never fetches, negotiates, signs, or executes; " +
        "executionEnabled is always false.",
      inputSchema: lpAnalysisInputSchema,
      outputSchema: lpAnalysisResultSchema,
      annotations: PURE_ANALYSIS_ANNOTATIONS
    },
    (input) => handleLpAnalysisMcp(input)
  );
  return server;
}
