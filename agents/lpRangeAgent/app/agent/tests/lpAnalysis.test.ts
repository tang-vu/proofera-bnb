import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildAgentCard } from "../src/agentCard.js";
import {
  analyzeLpRange,
  handleLpAnalysisA2a,
  handleLpAnalysisMcp,
  lpAnalysisInputSchema
} from "../src/lpAnalysis.js";
import { buildMcpServer } from "../src/mcpMain.js";

const POOL = "0x1111111111111111111111111111111111111111";
const POSITION_MANAGER = "0x2222222222222222222222222222222222222222";

function fixture(chainId: 56 | 97 = 97): Record<string, unknown> {
  return {
    chainId,
    poolAddress: POOL,
    positionManagerAddress: POSITION_MANAGER,
    positionId: "900719925474099312345",
    observedAtBlock: "76543210",
    observedAtUtc: "2026-08-11T10:00:00Z",
    analysisAtUtc: "2026-08-11T10:01:00Z",
    sourceLocator: {
      kind: "onchain",
      chainId,
      blockNumber: "76543210",
      poolAddress: POOL,
      positionManagerAddress: POSITION_MANAGER,
      poolRead: "slot0()",
      positionRead: "positions(uint256)"
    },
    currentTick: 0,
    tickSpacing: 60,
    lowerTick: -600,
    upperTick: 600,
    capital: {
      asset: "USDC",
      minorUnitDecimals: 6,
      amountMinorUnits: "1000000000",
      minimumMinorUnits: "1000000",
      maximumMinorUnits: "10000000000"
    },
    riskConstraints: {
      reviewBufferTicks: 120,
      maximumRangeWidthTicks: 1800,
      maximumSourceAgeSeconds: 900,
      futureToleranceSeconds: 30,
      minimumNetBenefitMinorUnits: "100",
      maximumKnownCostsMinorUnits: "1000000"
    },
    economics: {
      quoteAsset: "USDC",
      minorUnitDecimals: 6,
      projectedIncrementalFeesMinorUnits: "10000",
      knownGasCostMinorUnits: "1000",
      knownSlippageCostMinorUnits: "2000"
    }
  };
}

test("supports BSC mainnet and testnet without changing methodology", () => {
  const mainnet = analyzeLpRange(fixture(56));
  const testnet = analyzeLpRange(fixture(97));
  assert.equal(mainnet.environment, "bsc-mainnet");
  assert.equal(testnet.environment, "bsc-testnet");
  assert.equal(mainnet.methodologyVersion, testnet.methodologyVersion);
  assert.equal(mainnet.executionEnabled, false);
  assert.equal(testnet.executionEnabled, false);
});

test("uses bigint minor units beyond Number precision", () => {
  const input = fixture();
  input.economics = {
    quoteAsset: "USDC",
    minorUnitDecimals: 6,
    projectedIncrementalFeesMinorUnits: "900719925474099312345",
    knownGasCostMinorUnits: "2",
    knownSlippageCostMinorUnits: "3"
  };
  const result = analyzeLpRange(input);
  assert.equal(result.economics.knownTotalCostsMinorUnits, "5");
  assert.equal(result.economics.knownNetBenefitMinorUnits, "900719925474099312340");
});

test("stale and future observations fail the evidence policy", () => {
  const stale = fixture();
  stale.analysisAtUtc = "2026-08-11T11:00:00Z";
  const staleResult = analyzeLpRange(stale);
  assert.equal(staleResult.decision, "insufficient_evidence");
  assert.ok(staleResult.constraintViolations.some(({ code }) => code === "SOURCE_STALE"));

  const future = fixture();
  future.observedAtUtc = "2026-08-11T10:02:00Z";
  const futureResult = analyzeLpRange(future);
  assert.equal(futureResult.decision, "insufficient_evidence");
  assert.ok(futureResult.constraintViolations.some(({ code }) => code === "SOURCE_IN_FUTURE"));

  const fractionallyStale = fixture();
  fractionallyStale.analysisAtUtc = "2026-08-11T10:15:00.001Z";
  assert.ok(
    analyzeLpRange(fractionallyStale).constraintViolations.some(
      ({ code }) => code === "SOURCE_STALE"
    )
  );
});

test("accepts an HTTPS source only with publisher and content digest provenance", () => {
  const input = fixture();
  input.sourceLocator = {
    kind: "http",
    url: "https://evidence.example/snapshots/position-1.json",
    publisher: "Evidence Publisher",
    contentSha256: "ab".repeat(32)
  };
  const result = analyzeLpRange(input);
  assert.equal(result.sourceLocator.kind, "http");
  assert.equal(result.limitations.length, 4);
});

test("rejects invalid ticks, addresses, source schemes, and source mismatches", () => {
  const badTick = fixture();
  badTick.lowerTick = -599;
  assert.equal(lpAnalysisInputSchema.safeParse(badTick).success, false);

  const badAddress = fixture();
  badAddress.poolAddress = "0x1234";
  assert.equal(lpAnalysisInputSchema.safeParse(badAddress).success, false);

  const badScheme = fixture();
  badScheme.sourceLocator = {
    kind: "http",
    url: "ftp://example.com/snapshot.json",
    publisher: "Example",
    contentSha256: "a".repeat(64)
  };
  assert.equal(lpAnalysisInputSchema.safeParse(badScheme).success, false);

  const mismatch = fixture();
  mismatch.sourceLocator = {
    ...(mismatch.sourceLocator as Record<string, unknown>),
    blockNumber: "76543211"
  };
  assert.equal(lpAnalysisInputSchema.safeParse(mismatch).success, false);

  const malformedPosition = fixture();
  malformedPosition.positionId = "1/../../stats";
  assert.doesNotThrow(() => lpAnalysisInputSchema.safeParse(malformedPosition));
  assert.equal(lpAnalysisInputSchema.safeParse(malformedPosition).success, false);
});

test("requires complete benefit evidence when an out-of-range snapshot triggers review", () => {
  const input = fixture();
  input.currentTick = 720;
  delete input.economics;
  const result = analyzeLpRange(input);
  assert.equal(result.inRange, false);
  assert.equal(result.economics.knownNetBenefitMinorUnits, null);
  assert.equal(result.decision, "insufficient_evidence");
  assert.ok(result.constraintViolations.some(({ code }) => code === "ECONOMICS_INCOMPLETE"));
});

test("returns review_rebalance for out-of-range evidence with sufficient known net benefit", () => {
  const input = fixture();
  input.currentTick = 720;
  const result = analyzeLpRange(input);
  assert.equal(result.inRange, false);
  assert.deepEqual(result.tickBuffers, {
    fromLowerTick: 1320,
    toUpperExclusiveTick: -120
  });
  assert.equal(result.economics.knownNetBenefitMinorUnits, "7000");
  assert.equal(result.decision, "review_rebalance");
});

test("never recommends review when a configured risk limit is violated", () => {
  const input = fixture();
  input.currentTick = 720;
  input.capital = {
    ...(input.capital as Record<string, unknown>),
    amountMinorUnits: "10000000001"
  };

  const result = analyzeLpRange(input);
  assert.equal(result.economics.knownNetBenefitMinorUnits, "7000");
  assert.equal(result.decision, "hold");
  assert.ok(result.constraintViolations.some(({ code }) => code === "CAPITAL_ABOVE_MAXIMUM"));
  const firstRationale = result.rationale[0];
  assert.ok(firstRationale);
  assert.match(firstRationale, /risk constraints prohibit/i);
});

test("A2A adapter accepts only the flat analyze_lp_range data-part envelope", () => {
  const success = handleLpAnalysisA2a({
    skill: "analyze_lp_range",
    ...fixture()
  });
  assert.equal("decision" in success, true);
  assert.equal(success.executionEnabled, false);

  const invalid = handleLpAnalysisA2a({
    skill: "analyze_lp_range",
    ...fixture(),
    unexpected: true
  });
  assert.equal("error" in invalid && invalid.error, "INVALID_ANALYSIS_INPUT");
  assert.ok("issues" in invalid && invalid.issues.length > 0);
});

test("MCP adapter returns matching JSON text and structured content", () => {
  const response = handleLpAnalysisMcp(fixture());
  const firstContent = response.content[0];
  assert.ok(firstContent);
  assert.deepEqual(JSON.parse(firstContent.text), response.structuredContent);
  assert.equal(response.structuredContent.executionEnabled, false);
  assert.equal(response.structuredContent.decision, "hold");
});

test("AgentCard advertises only honest read-only evidence analysis", () => {
  const card = buildAgentCard();
  assert.deepEqual(
    card.skills.map(({ id }) => id),
    ["analyze_lp_range", "audit_altana_permission_bundle"]
  );
  assert.equal(card.security, undefined);
  assert.equal(card.securitySchemes, undefined);
  assert.match(card.skills[0]?.description ?? "", /executionEnabled is always false/i);
  assert.match(card.skills[1]?.description ?? "", /executionPerformed is always false/i);
  assert.doesNotMatch(card.description, /commerce|seller|signer/i);
});

test("MCP server exposes and executes only analyze_lp_range", async () => {
  const server = buildMcpServer();
  const client = new Client({ name: "lp-analysis-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map(({ name }) => name),
      ["analyze_lp_range"]
    );

    const response = await client.callTool({
      name: "analyze_lp_range",
      arguments: fixture()
    });
    assert.equal(response.isError, undefined);
    const structured = response.structuredContent as Record<string, unknown> | undefined;
    assert.ok(structured);
    assert.equal(structured.executionEnabled, false);
    assert.equal(structured.decision, "hold");
  } finally {
    await client.close();
  }
});
