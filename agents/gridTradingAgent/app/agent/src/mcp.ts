import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  gridTradingAnalysisInputSchema,
  gridTradingAnalysisResultSchema,
  handleGridTradingMcp
} from "./gridAnalysis.js";

const PURE_ANALYSIS_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

/** Build an in-process MCP server exposing only the pure analysis tool. */
export function buildGridTradingMcpServer(): McpServer {
  const server = new McpServer({
    name: "proofera-grid-trading-agent",
    version: "1.0.0"
  });

  server.registerTool(
    "analyze_grid_trading",
    {
      description:
        "Deterministically screen a caller-supplied arithmetic grid candidate " +
        "on BSC 56 or 97. Requires explicit price, range, fee, gas, capital, " +
        "risk constraints, timestamps, and provenance. Returns evidence-aware " +
        "hold/review_grid/insufficient_evidence output and never executes.",
      inputSchema: gridTradingAnalysisInputSchema,
      outputSchema: gridTradingAnalysisResultSchema,
      annotations: PURE_ANALYSIS_ANNOTATIONS
    },
    (input) => handleGridTradingMcp(input)
  );

  return server;
}
