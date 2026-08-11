import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@a2a-js/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  DefaultExecutionEventBus,
  RequestContext,
  type AgentExecutionEvent
} from "@a2a-js/sdk/server";
import { GridTradingAgentExecutor } from "../src/a2a.js";
import { buildGridTradingAgentCard } from "../src/agentCard.js";
import {
  analyzeGridTrading,
  gridTradingAnalysisInputSchema,
  gridTradingAnalysisResultSchema,
  handleGridTradingA2a,
  handleGridTradingMcp,
  type GridTradingAnalysisInput
} from "../src/gridAnalysis.js";
import { buildGridTradingMcpServer } from "../src/mcp.js";

const CONTRACT = "0x1111111111111111111111111111111111111111";

function caller(reference: string) {
  return { kind: "caller" as const, reference };
}

function fixture(chainId: 56 | 97 = 97): GridTradingAnalysisInput {
  const observedAtUtc = "2026-08-11T10:00:00Z";
  return {
    chainId,
    market: { baseAsset: "BNB", quoteAsset: "USDC" },
    analysisAtUtc: "2026-08-11T10:01:00Z",
    currentPrice: {
      value: "100",
      observedAtUtc,
      source: {
        kind: "http",
        url: "https://prices.example/snapshots/bnb-usdc.json",
        publisher: "Example price publisher",
        contentSha256: "ab".repeat(32)
      }
    },
    gridRange: {
      lowerPrice: "90",
      upperPrice: "110",
      levels: 5,
      observedAtUtc,
      source: caller("ProofEra grid configuration")
    },
    tradingFee: {
      oneWayFeeBps: 25,
      observedAtUtc,
      source: caller("Caller-supplied venue fee tier")
    },
    estimatedRoundTripGas: {
      amountMinorUnits: "100000",
      asset: "USDC",
      minorUnitDecimals: 6,
      observedAtUtc,
      source: caller("Caller-supplied round-trip gas estimate")
    },
    capital: {
      amountMinorUnits: "1000000000",
      minimumMinorUnits: "1000000",
      maximumMinorUnits: "10000000000",
      asset: "USDC",
      minorUnitDecimals: 6,
      observedAtUtc,
      source: caller("ProofEra capital configuration")
    },
    riskConstraints: {
      minimumGridLevels: 3,
      maximumGridLevels: 20,
      maximumRangeWidthBps: 2500,
      maximumDownsideToLowerBps: 1500,
      maximumKnownRoundTripCostBps: 100,
      maximumSourceAgeSeconds: 900,
      futureToleranceSeconds: 30,
      observedAtUtc,
      source: caller("ProofEra risk configuration")
    }
  };
}

test("returns review_grid only after complete current BSC evidence passes constraints", () => {
  const testnet = analyzeGridTrading(fixture(97));
  const mainnet = analyzeGridTrading(fixture(56));

  assert.equal(testnet.environment, "bsc-testnet");
  assert.equal(mainnet.environment, "bsc-mainnet");
  assert.equal(testnet.decision, "review_grid");
  assert.equal(testnet.executionEnabled, false);
  assert.equal(testnet.metrics.rangeWidth, "20");
  assert.equal(testnet.metrics.adjacentSpacingBpsFloor, "476");
  assert.equal(testnet.costs.knownRoundTripCostMinorUnits, "1100000");
  assert.equal(testnet.costs.grossAdjacentSpacingBudgetMinorUnitsFloor, "9523809");
  assert.equal(testnet.costs.residualAfterKnownCostsMinorUnits, "8423809");
  assert.ok(testnet.provenance.every(({ state }) => state === "fresh"));
});

test("preserves exact decimals and bigint capital beyond Number precision", () => {
  const input = fixture();
  input.currentPrice = {
    value: "1.000000000000000001",
    observedAtUtc: "2026-08-11T10:00:00Z",
    source: caller("Exact decimal test price")
  };
  input.gridRange = {
    lowerPrice: "0.900000000000000001",
    upperPrice: "1.100000000000000001",
    levels: 5,
    observedAtUtc: "2026-08-11T10:00:00Z",
    source: caller("Exact decimal test range")
  };
  const amount = 900719925474099312345n;
  input.capital = {
    amountMinorUnits: amount.toString(),
    minimumMinorUnits: amount.toString(),
    maximumMinorUnits: amount.toString(),
    asset: "USDC",
    minorUnitDecimals: 6,
    observedAtUtc: "2026-08-11T10:00:00Z",
    source: caller("Exact bigint capital")
  };
  input.tradingFee = {
    oneWayFeeBps: 1,
    observedAtUtc: "2026-08-11T10:00:00Z",
    source: caller("Exact fee")
  };
  input.estimatedRoundTripGas = {
    amountMinorUnits: "3",
    asset: "USDC",
    minorUnitDecimals: 6,
    observedAtUtc: "2026-08-11T10:00:00Z",
    source: caller("Exact gas")
  };

  const result = analyzeGridTrading(input);
  const perLevel = amount / 5n;
  const expectedFee = (perLevel * 2n + 9_999n) / 10_000n;

  assert.equal(result.evidence.currentPrice?.value, "1.000000000000000001");
  assert.equal(result.metrics.rangeWidth, "0.2");
  assert.deepEqual(result.metrics.adjacentSpacingRational, {
    numerator: "200000000000000000",
    denominator: "4",
    decimalScale: 18
  });
  assert.equal(result.metrics.capitalPerGridLevelMinorUnits, perLevel.toString());
  assert.equal(result.metrics.unallocatedCapitalMinorUnits, (amount % 5n).toString());
  assert.equal(result.costs.roundTripTradingFeeProxyMinorUnits, expectedFee.toString());
  assert.equal(result.costs.knownRoundTripCostMinorUnits, (expectedFee + 3n).toString());
});

test("keeps extreme valid decimal ratios exact without overflowing derived strings", () => {
  const input = fixture();
  const maximumUint256 = ((1n << 256n) - 1n).toString();
  input.currentPrice = {
    value: "0.000000000000000002",
    observedAtUtc: "2026-08-11T10:00:00Z",
    source: caller("Extreme exact price")
  };
  input.gridRange = {
    lowerPrice: "0.000000000000000001",
    upperPrice: "9".repeat(78),
    levels: 2,
    observedAtUtc: "2026-08-11T10:00:00Z",
    source: caller("Extreme exact range")
  };
  input.capital = {
    amountMinorUnits: maximumUint256,
    minimumMinorUnits: "0",
    maximumMinorUnits: maximumUint256,
    asset: "USDC",
    minorUnitDecimals: 6,
    observedAtUtc: "2026-08-11T10:00:00Z",
    source: caller("Extreme exact capital")
  };
  const constraints = input.riskConstraints;
  assert.ok(constraints);
  input.riskConstraints = {
    ...constraints,
    minimumGridLevels: 2,
    maximumRangeWidthBps: 1_000_000
  };

  const result = analyzeGridTrading(input);
  const grossBudget = result.costs.grossAdjacentSpacingBudgetMinorUnitsFloor;
  assert.ok(grossBudget);
  assert.ok(grossBudget.length > 160);
  assert.match(grossBudget, /^[0-9]+$/);
  assert.equal(result.executionEnabled, false);
});

test("stale, future, and missing evidence are explicit insufficient_evidence outcomes", () => {
  const stale = fixture();
  const stalePrice = stale.currentPrice;
  assert.ok(stalePrice);
  stale.currentPrice = { ...stalePrice, observedAtUtc: "2026-08-11T09:00:00Z" };
  const staleResult = analyzeGridTrading(stale);
  assert.equal(staleResult.decision, "insufficient_evidence");
  assert.ok(staleResult.constraintViolations.some(({ code }) => code === "SOURCE_STALE"));
  assert.equal(
    staleResult.provenance.find(({ field }) => field === "currentPrice")?.state,
    "stale"
  );

  const future = fixture();
  const futureGas = future.estimatedRoundTripGas;
  assert.ok(futureGas);
  future.estimatedRoundTripGas = {
    ...futureGas,
    observedAtUtc: "2026-08-11T10:02:00Z"
  };
  const futureResult = analyzeGridTrading(future);
  assert.equal(futureResult.decision, "insufficient_evidence");
  assert.ok(
    futureResult.constraintViolations.some(
      ({ code, field }) => code === "SOURCE_IN_FUTURE" && field === "estimatedRoundTripGas"
    )
  );

  const missing = fixture();
  delete missing.tradingFee;
  const missingResult = analyzeGridTrading(missing);
  assert.equal(missingResult.decision, "insufficient_evidence");
  assert.equal(missingResult.evidence.tradingFee, null);
  assert.equal(missingResult.costs.knownRoundTripCostMinorUnits, null);
  assert.ok(
    missingResult.constraintViolations.some(
      ({ code, field }) => code === "MISSING_EVIDENCE" && field === "tradingFee"
    )
  );
});

test("missing freshness constraints leave present evidence explicitly unassessed", () => {
  const input = fixture();
  input.riskConstraints = null;
  const result = analyzeGridTrading(input);

  assert.equal(result.decision, "insufficient_evidence");
  assert.ok(result.provenance.some(({ state }) => state === "freshness_unassessed"));
  assert.ok(
    result.constraintViolations.some(
      ({ code, field }) => code === "MISSING_EVIDENCE" && field === "riskConstraints"
    )
  );
});

test("enforces structural range rules and configured grid-level limits", () => {
  const reversed = fixture();
  const reversedRange = reversed.gridRange;
  assert.ok(reversedRange);
  reversed.gridRange = { ...reversedRange, lowerPrice: "110", upperPrice: "90" };
  assert.equal(gridTradingAnalysisInputSchema.safeParse(reversed).success, false);

  const tooManyStructural = fixture();
  const structuralRange = tooManyStructural.gridRange;
  assert.ok(structuralRange);
  tooManyStructural.gridRange = { ...structuralRange, levels: 501 };
  assert.equal(gridTradingAnalysisInputSchema.safeParse(tooManyStructural).success, false);

  const belowPolicy = fixture();
  const belowRange = belowPolicy.gridRange;
  assert.ok(belowRange);
  belowPolicy.gridRange = { ...belowRange, levels: 2 };
  const belowResult = analyzeGridTrading(belowPolicy);
  assert.equal(belowResult.decision, "hold");
  assert.ok(
    belowResult.constraintViolations.some(({ code }) => code === "GRID_LEVELS_BELOW_MINIMUM")
  );

  const abovePolicy = fixture();
  const aboveRange = abovePolicy.gridRange;
  assert.ok(aboveRange);
  abovePolicy.gridRange = { ...aboveRange, levels: 21 };
  const aboveResult = analyzeGridTrading(abovePolicy);
  assert.equal(aboveResult.decision, "hold");
  assert.ok(
    aboveResult.constraintViolations.some(({ code }) => code === "GRID_LEVELS_ABOVE_MAXIMUM")
  );
});

test("holds when current price is not strictly inside the proposed range", () => {
  const input = fixture();
  const price = input.currentPrice;
  assert.ok(price);
  input.currentPrice = { ...price, value: "110" };

  const result = analyzeGridTrading(input);
  assert.equal(result.decision, "hold");
  assert.ok(
    result.constraintViolations.some(({ code }) => code === "CURRENT_PRICE_OUTSIDE_OPEN_RANGE")
  );
});

test("holds when known fees and gas consume the adjacent-grid spacing budget", () => {
  const input = fixture();
  const range = input.gridRange;
  const constraints = input.riskConstraints;
  assert.ok(range);
  assert.ok(constraints);
  input.gridRange = { ...range, lowerPrice: "99.9", upperPrice: "100.1", levels: 20 };
  input.riskConstraints = {
    ...constraints,
    maximumGridLevels: 20,
    maximumRangeWidthBps: 100,
    maximumDownsideToLowerBps: 100,
    maximumKnownRoundTripCostBps: 10_000
  };

  const result = analyzeGridTrading(input);
  assert.equal(result.decision, "hold");
  assert.ok(
    result.constraintViolations.some(({ code }) => code === "KNOWN_COSTS_CONSUME_GRID_SPACING")
  );
  assert.ok(BigInt(result.costs.residualAfterKnownCostsMinorUnits ?? "0") < 0n);
});

test("screens costs against the narrowest highest-price interval, not current price", () => {
  const input = fixture();
  const price = input.currentPrice;
  const range = input.gridRange;
  const fee = input.tradingFee;
  const gas = input.estimatedRoundTripGas;
  const capital = input.capital;
  const constraints = input.riskConstraints;
  assert.ok(price);
  assert.ok(range);
  assert.ok(fee);
  assert.ok(gas);
  assert.ok(capital);
  assert.ok(constraints);
  input.currentPrice = { ...price, value: "91" };
  input.gridRange = { ...range, lowerPrice: "90", upperPrice: "110", levels: 3 };
  input.tradingFee = { ...fee, oneWayFeeBps: 0 };
  input.estimatedRoundTripGas = { ...gas, amountMinorUnits: "10500" };
  input.capital = {
    ...capital,
    amountMinorUnits: "300000",
    minimumMinorUnits: "0",
    maximumMinorUnits: "300000"
  };
  input.riskConstraints = {
    ...constraints,
    maximumKnownRoundTripCostBps: 2000
  };

  const result = analyzeGridTrading(input);
  assert.equal(result.costs.grossAdjacentSpacingBudgetMinorUnitsFloor, "10000");
  assert.equal(result.costs.knownRoundTripCostMinorUnits, "10500");
  assert.equal(result.costs.residualAfterKnownCostsMinorUnits, "-500");
  assert.equal(result.decision, "hold");
  assert.ok(
    result.constraintViolations.some(({ code }) => code === "KNOWN_COSTS_CONSUME_GRID_SPACING")
  );
});

test("drawdown-risk output is a static boundary and never invented performance", () => {
  const input = fixture();
  const range = input.gridRange;
  const constraints = input.riskConstraints;
  assert.ok(range);
  assert.ok(constraints);
  input.gridRange = { ...range, lowerPrice: "50", upperPrice: "110" };
  input.riskConstraints = {
    ...constraints,
    maximumRangeWidthBps: 10_000,
    maximumDownsideToLowerBps: 1500
  };

  const result = analyzeGridTrading(input);
  assert.equal(result.drawdownRisk.configuredDownsideToLowerBpsFloor, "5000");
  assert.equal(result.drawdownRisk.withinLimit, false);
  assert.equal(result.performance.maximumDrawdownBps, null);
  assert.equal(result.performance.realizedPnlMinorUnits, null);
  assert.equal(result.performance.fills, null);
  assert.equal(result.performance.winRate, null);
  assert.equal(result.decision, "hold");
});

test("drawdown limit comparison stays exact at a fractional basis-point boundary", () => {
  const input = fixture();
  const range = input.gridRange;
  const constraints = input.riskConstraints;
  assert.ok(range);
  assert.ok(constraints);
  input.gridRange = { ...range, lowerPrice: "84.999", upperPrice: "110" };
  input.riskConstraints = {
    ...constraints,
    maximumRangeWidthBps: 3000,
    maximumDownsideToLowerBps: 1500
  };

  const result = analyzeGridTrading(input);
  assert.equal(result.drawdownRisk.configuredDownsideToLowerBpsFloor, "1500");
  assert.equal(result.drawdownRisk.withinLimit, false);
  assert.ok(
    result.constraintViolations.some(({ code }) => code === "DOWNSIDE_TO_LOWER_EXCEEDS_MAXIMUM")
  );
});

test("capital boundaries and a zero per-level allocation fail closed", () => {
  const below = fixture();
  const belowCapital = below.capital;
  assert.ok(belowCapital);
  below.capital = { ...belowCapital, amountMinorUnits: "999999" };
  assert.ok(
    analyzeGridTrading(below).constraintViolations.some(
      ({ code }) => code === "CAPITAL_BELOW_MINIMUM"
    )
  );

  const above = fixture();
  const aboveCapital = above.capital;
  assert.ok(aboveCapital);
  above.capital = { ...aboveCapital, amountMinorUnits: "10000000001" };
  assert.ok(
    analyzeGridTrading(above).constraintViolations.some(
      ({ code }) => code === "CAPITAL_ABOVE_MAXIMUM"
    )
  );

  const zero = fixture();
  const zeroCapital = zero.capital;
  assert.ok(zeroCapital);
  zero.capital = {
    ...zeroCapital,
    amountMinorUnits: "2",
    minimumMinorUnits: "0",
    maximumMinorUnits: "10"
  };
  assert.ok(
    analyzeGridTrading(zero).constraintViolations.some(
      ({ code }) => code === "CAPITAL_PER_LEVEL_ZERO"
    )
  );
});

test("strictly rejects cross-chain provenance, incomparable units, unsafe URLs, and unknown keys", () => {
  const wrongChain = fixture(97);
  const fee = wrongChain.tradingFee;
  assert.ok(fee);
  wrongChain.tradingFee = {
    ...fee,
    source: {
      kind: "onchain",
      chainId: 56,
      blockNumber: "900719925474099312345",
      contractAddress: CONTRACT,
      read: "fee()"
    }
  };
  assert.equal(gridTradingAnalysisInputSchema.safeParse(wrongChain).success, false);

  const mismatchedUnits = fixture();
  const gas = mismatchedUnits.estimatedRoundTripGas;
  assert.ok(gas);
  mismatchedUnits.estimatedRoundTripGas = { ...gas, minorUnitDecimals: 18 };
  assert.equal(gridTradingAnalysisInputSchema.safeParse(mismatchedUnits).success, false);

  const unsafeUrl = fixture();
  const price = unsafeUrl.currentPrice;
  assert.ok(price);
  unsafeUrl.currentPrice = {
    ...price,
    source: {
      kind: "http",
      url: "https://user:password@prices.example/data#secret",
      publisher: "Unsafe",
      contentSha256: "cd".repeat(32)
    }
  };
  assert.equal(gridTradingAnalysisInputSchema.safeParse(unsafeUrl).success, false);

  assert.equal(
    gridTradingAnalysisInputSchema.safeParse({ ...fixture(), unexpected: true }).success,
    false
  );
});

test("A2A flat data dispatch accepts only the strict analysis skill", () => {
  const success = handleGridTradingA2a({ skill: "analyze_grid_trading", ...fixture() });
  assert.equal("decision" in success && success.decision, "review_grid");
  assert.equal(success.executionEnabled, false);

  const unknown = handleGridTradingA2a({ skill: "trade_now", ...fixture() });
  assert.equal("error" in unknown && unknown.error, "INVALID_ANALYSIS_INPUT");

  const extra = handleGridTradingA2a({
    skill: "analyze_grid_trading",
    ...fixture(),
    approveToken: true
  });
  assert.equal("error" in extra && extra.error, "INVALID_ANALYSIS_INPUT");
});

test("A2A executor dispatches a data part and rejects plain text as invalid input", async () => {
  const executor = new GridTradingAgentExecutor();
  const dataMessage: Message = {
    kind: "message",
    role: "user",
    messageId: "request-1",
    parts: [{ kind: "data", data: { skill: "analyze_grid_trading", ...fixture() } }]
  };
  const dataEvent = await executeA2a(executor, dataMessage);
  assert.equal(dataEvent.kind, "message");
  assert.equal(dataEvent.messageId, "request-1:proofera-grid-analysis");
  const dataPart = dataEvent.parts[0];
  assert.ok(dataPart);
  assert.equal(dataPart.kind, "data");
  assert.equal(dataPart.data.decision, "review_grid");

  const textMessage: Message = {
    kind: "message",
    role: "user",
    messageId: "request-2",
    parts: [{ kind: "text", text: "trade this grid now" }]
  };
  const textEvent = await executeA2a(executor, textMessage);
  assert.equal(textEvent.kind, "message");
  const textPart = textEvent.parts[0];
  assert.ok(textPart);
  assert.equal(textPart.kind, "data");
  assert.equal(textPart.data.error, "INVALID_ANALYSIS_INPUT");

  const ambiguousMessage: Message = {
    kind: "message",
    role: "user",
    messageId: "request-3",
    parts: [
      { kind: "data", data: { skill: "analyze_grid_trading", ...fixture() } },
      { kind: "data", data: { skill: "trade_now" } }
    ]
  };
  const ambiguousEvent = await executeA2a(executor, ambiguousMessage);
  const ambiguousPart = ambiguousEvent.parts[0];
  assert.ok(ambiguousPart);
  assert.equal(ambiguousPart.kind, "data");
  assert.equal(ambiguousPart.data.error, "INVALID_ANALYSIS_INPUT");
  assert.equal(ambiguousPart.data.executionEnabled, false);
});

test("MCP adapter and in-memory server expose matching structured read-only output", async () => {
  const direct = handleGridTradingMcp(fixture());
  assert.deepEqual(JSON.parse(direct.content[0]?.text ?? "null"), direct.structuredContent);
  assert.equal(direct.structuredContent.executionEnabled, false);

  const server = buildGridTradingMcpServer();
  const client = new Client({ name: "grid-analysis-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map(({ name }) => name),
      ["analyze_grid_trading"]
    );
    const response = await client.callTool({
      name: "analyze_grid_trading",
      arguments: fixture()
    });
    assert.equal(response.isError, undefined);
    const structured = gridTradingAnalysisResultSchema.parse(response.structuredContent);
    assert.equal(structured.decision, "review_grid");
    assert.equal(structured.executionEnabled, false);
  } finally {
    await client.close();
  }
});

test("Agent Card advertises only the evidence analyzer and no execution skill", () => {
  const card = buildGridTradingAgentCard("https://agent.example/a2a");
  assert.equal(card.url, "https://agent.example/a2a");
  assert.deepEqual(
    card.skills.map(({ id }) => id),
    ["analyze_grid_trading"]
  );
  assert.match(card.skills[0]?.description ?? "", /executionEnabled is always false/i);
});

async function executeA2a(executor: GridTradingAgentExecutor, message: Message): Promise<Message> {
  const bus = new DefaultExecutionEventBus();
  let published: AgentExecutionEvent | undefined;
  bus.on("event", (event) => {
    published = event;
  });
  await executor.execute(new RequestContext(message, "task-1", "context-1"), bus);
  assert.ok(published);
  assert.equal(published.kind, "message");
  return published;
}
