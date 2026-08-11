import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@a2a-js/sdk";
import {
  DefaultExecutionEventBus,
  RequestContext,
  type AgentExecutionEvent
} from "@a2a-js/sdk/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { HealthFactorGuardianAgentExecutor } from "../src/a2a.js";
import { buildHealthFactorGuardianAgentCard } from "../src/agentCard.js";
import {
  analyzeHealthFactor,
  handleHealthFactorA2a,
  handleHealthFactorMcp,
  healthFactorAnalysisInputSchema,
  healthFactorAnalysisResultSchema,
  VENUS_CORE_COMPTROLLER_BY_CHAIN,
  type HealthFactorAnalysisInput
} from "../src/healthFactorAnalysis.js";
import { buildHealthFactorGuardianMcpServer } from "../src/mcp.js";

const ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const V_BNB = "0x3333333333333333333333333333333333333333";
const V_USDC = "0x4444444444444444444444444444444444444444";
const V_BTCB = "0x5555555555555555555555555555555555555555";
const V_ETH = "0x6666666666666666666666666666666666666666";
const TX = `0x${"9".repeat(64)}`;
const TX_2 = `0x${"8".repeat(64)}`;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const ZERO_HASH = `0x${"0".repeat(64)}`;
const E18 = 10n ** 18n;
const THRESHOLD = 800000000000000000n;
const DEBT = 1000000000n;
const QUOTE_VALUE_UNIT = "usd" as const;
const QUOTE_VALUE_SCALE_DECIMALS = 6;

function blockHash(character: string): string {
  return `0x${character.repeat(64)}`;
}

function sourceCommon(
  chainId: 56 | 97,
  blockNumber: string,
  hash: string,
  blockTimestampUtc: string
) {
  return {
    kind: "onchain" as const,
    chainId,
    comptrollerAddress: VENUS_CORE_COMPTROLLER_BY_CHAIN[chainId],
    account: ACCOUNT,
    blockNumber,
    blockHash: hash,
    blockTimestampUtc,
    quoteValueUnit: QUOTE_VALUE_UNIT,
    quoteValueScaleDecimals: QUOTE_VALUE_SCALE_DECIMALS
  };
}

function methodologySource(
  chainId: 56 | 97,
  blockNumber: string,
  hash: string,
  blockTimestampUtc: string,
  collateralVTokenAddresses = [V_BNB]
) {
  return {
    ...sourceCommon(chainId, blockNumber, hash, blockTimestampUtc),
    readMethod: "venus_core_pool_effective_liquidation_thresholds_v1" as const,
    collateralVTokenAddresses
  };
}

function snapshotSource(
  chainId: 56 | 97,
  blockNumber: string,
  hash: string,
  blockTimestampUtc: string,
  collateralVTokenAddresses = [V_BNB],
  debtVTokenAddresses = [V_USDC]
) {
  return {
    ...sourceCommon(chainId, blockNumber, hash, blockTimestampUtc),
    readMethod: "venus_core_pool_complete_account_markets_v1" as const,
    collateralVTokenAddresses,
    debtVTokenAddresses
  };
}

function collateralSource(
  chainId: 56 | 97,
  blockNumber: string,
  hash: string,
  blockTimestampUtc: string,
  market = "Venus BNB Core",
  underlyingAsset = "BNB",
  vTokenAddress = V_BNB
) {
  return {
    ...sourceCommon(chainId, blockNumber, hash, blockTimestampUtc),
    readMethod: "venus_core_pool_collateral_value_and_threshold_v1" as const,
    market,
    underlyingAsset,
    vTokenAddress
  };
}

function debtSource(
  chainId: 56 | 97,
  blockNumber: string,
  hash: string,
  blockTimestampUtc: string,
  market = "Venus USDC Core",
  underlyingAsset = "USDC",
  vTokenAddress = V_USDC
) {
  return {
    ...sourceCommon(chainId, blockNumber, hash, blockTimestampUtc),
    readMethod: "venus_core_pool_debt_value_v1" as const,
    market,
    underlyingAsset,
    vTokenAddress
  };
}

function observationSource(
  chainId: 56 | 97,
  blockNumber: string,
  hash: string,
  blockTimestampUtc: string,
  collateralVTokenAddresses = [V_BNB],
  debtVTokenAddresses = [V_USDC]
) {
  return {
    ...sourceCommon(chainId, blockNumber, hash, blockTimestampUtc),
    readMethod: "venus_core_pool_account_health_observation_v1" as const,
    collateralVTokenAddresses,
    debtVTokenAddresses
  };
}

function transactionSource(
  chainId: 56 | 97,
  blockNumber: string,
  hash: string,
  blockTimestampUtc: string,
  transactionHash: string
) {
  return {
    kind: "onchain_transaction" as const,
    readMethod: "eth_getTransactionReceipt" as const,
    chainId,
    comptrollerAddress: VENUS_CORE_COMPTROLLER_BY_CHAIN[chainId],
    account: ACCOUNT,
    transactionHash,
    blockNumber,
    blockHash: hash,
    blockTimestampUtc
  };
}

function adjustedValueRaw(healthFactorRaw: bigint, debt = DEBT): string {
  return ((healthFactorRaw * debt) / E18).toString();
}

function fixture(chainId: 56 | 97 = 97): HealthFactorAnalysisInput {
  const currentBlock = "500";
  const currentHash = blockHash("c");
  const currentObservedAt = "2026-08-11T09:59:50Z";
  const currentHealthRaw = 1600000000000000000n;
  return {
    chainId,
    account: ACCOUNT,
    analysisAtUtc: "2026-08-11T10:00:00Z",
    methodology: {
      protocol: "venus-core-pool",
      thresholdKind: "effective_user_liquidation_threshold",
      weightingStrategy: "USE_LIQUIDATION_THRESHOLD",
      thresholdRead: "getEffectiveLtvFactor",
      quoteValueUnit: QUOTE_VALUE_UNIT,
      quoteValueScaleDecimals: QUOTE_VALUE_SCALE_DECIMALS,
      liquidationThresholdScaleDecimals: 18,
      chainId,
      account: ACCOUNT,
      blockNumber: currentBlock,
      blockHash: currentHash,
      observedAtUtc: currentObservedAt,
      source: methodologySource(chainId, currentBlock, currentHash, currentObservedAt)
    },
    currentSnapshot: {
      chainId,
      account: ACCOUNT,
      blockNumber: currentBlock,
      blockHash: currentHash,
      observedAtUtc: currentObservedAt,
      quoteValueUnit: QUOTE_VALUE_UNIT,
      quoteValueScaleDecimals: QUOTE_VALUE_SCALE_DECIMALS,
      collateralComplete: true,
      debtComplete: true,
      collateralPositions: [
        {
          market: "Venus BNB Core",
          underlyingAsset: "BNB",
          vTokenAddress: V_BNB,
          collateralValueRaw: "2000000000",
          quoteValueUnit: QUOTE_VALUE_UNIT,
          quoteValueScaleDecimals: QUOTE_VALUE_SCALE_DECIMALS,
          effectiveLiquidationThresholdRaw: THRESHOLD.toString(),
          liquidationThresholdScaleDecimals: 18,
          chainId,
          account: ACCOUNT,
          blockNumber: currentBlock,
          blockHash: currentHash,
          observedAtUtc: currentObservedAt,
          source: collateralSource(chainId, currentBlock, currentHash, currentObservedAt)
        }
      ],
      debtPositions: [
        {
          market: "Venus USDC Core",
          underlyingAsset: "USDC",
          vTokenAddress: V_USDC,
          debtValueRaw: DEBT.toString(),
          quoteValueUnit: QUOTE_VALUE_UNIT,
          quoteValueScaleDecimals: QUOTE_VALUE_SCALE_DECIMALS,
          chainId,
          account: ACCOUNT,
          blockNumber: currentBlock,
          blockHash: currentHash,
          observedAtUtc: currentObservedAt,
          source: debtSource(chainId, currentBlock, currentHash, currentObservedAt)
        }
      ],
      source: snapshotSource(chainId, currentBlock, currentHash, currentObservedAt)
    },
    observationSeries: {
      complete: true,
      observations: [
        {
          chainId,
          account: ACCOUNT,
          blockNumber: "498",
          blockHash: blockHash("a"),
          observedAtUtc: "2026-08-11T09:57:00Z",
          adjustedCollateralValueRaw: adjustedValueRaw(1400000000000000000n),
          debtValueRaw: DEBT.toString(),
          quoteValueUnit: QUOTE_VALUE_UNIT,
          quoteValueScaleDecimals: QUOTE_VALUE_SCALE_DECIMALS,
          liquidationThresholdScaleDecimals: 18,
          source: observationSource(chainId, "498", blockHash("a"), "2026-08-11T09:57:00Z")
        },
        {
          chainId,
          account: ACCOUNT,
          blockNumber: "499",
          blockHash: blockHash("b"),
          observedAtUtc: "2026-08-11T09:58:00Z",
          adjustedCollateralValueRaw: adjustedValueRaw(1550000000000000000n),
          debtValueRaw: DEBT.toString(),
          quoteValueUnit: QUOTE_VALUE_UNIT,
          quoteValueScaleDecimals: QUOTE_VALUE_SCALE_DECIMALS,
          liquidationThresholdScaleDecimals: 18,
          source: observationSource(chainId, "499", blockHash("b"), "2026-08-11T09:58:00Z")
        },
        {
          chainId,
          account: ACCOUNT,
          blockNumber: currentBlock,
          blockHash: currentHash,
          observedAtUtc: currentObservedAt,
          adjustedCollateralValueRaw: adjustedValueRaw(currentHealthRaw),
          debtValueRaw: DEBT.toString(),
          quoteValueUnit: QUOTE_VALUE_UNIT,
          quoteValueScaleDecimals: QUOTE_VALUE_SCALE_DECIMALS,
          liquidationThresholdScaleDecimals: 18,
          source: observationSource(chainId, currentBlock, currentHash, currentObservedAt)
        }
      ]
    },
    policy: {
      healthFactorScaleDecimals: 18,
      alertHealthFactorRaw: "1500000000000000000",
      interventionHealthFactorRaw: "1100000000000000000",
      maximumCurrentEvidenceAgeSeconds: 300,
      maximumObservationAgeSeconds: 3600,
      futureToleranceSeconds: 30,
      minimumHistoryObservations: 3,
      minimumObservationWindowSeconds: 120,
      maximumAlertLatencySeconds: 60,
      minimumAlertReceipts: 1,
      configuredAtUtc: "2026-08-11T09:59:40Z",
      source: { kind: "caller", reference: "ProofEra guardian policy" }
    },
    alertReceipts: [
      {
        receiptId: "alert-498",
        chainId,
        account: ACCOUNT,
        triggerBlockNumber: "498",
        triggerBlockHash: blockHash("a"),
        triggerObservedAtUtc: "2026-08-11T09:57:00Z",
        deliveredAtUtc: "2026-08-11T09:57:30Z",
        channel: "webhook",
        receiptUrl: "https://alerts.example/receipts/alert-498",
        contentSha256: "ab".repeat(32)
      }
    ],
    alertReceiptsComplete: true,
    executionReceipts: null
  };
}

test("computes exact current and minimum health factors with explicit provenance", () => {
  const testnet = analyzeHealthFactor(fixture(97));
  const mainnet = analyzeHealthFactor(fixture(56));

  assert.equal(testnet.environment, "bsc-testnet");
  assert.equal(mainnet.environment, "bsc-mainnet");
  assert.equal(testnet.evidenceMode, "caller_supplied_unverified");
  assert.equal(testnet.currentHealthFactor.state, "computed");
  assert.equal(testnet.currentHealthFactor.decimalValueFloor, "1.6");
  assert.equal(testnet.currentHealthFactor.numerator, adjustedValueRaw(1600000000000000000n));
  assert.equal(testnet.currentHealthFactor.denominator, DEBT.toString());
  assert.equal(testnet.monitoredPositions.quoteValueUnit, "usd");
  assert.equal(testnet.monitoredPositions.quoteValueScaleDecimals, 6);
  assert.equal(testnet.observationWindow.status, "sufficient");
  assert.equal(testnet.observationWindow.windowSeconds, 170);
  assert.equal(testnet.observationWindow.minimumHealthFactor.state, "computed");
  assert.equal(testnet.observationWindow.minimumHealthFactor.decimalValueFloor, "1.4");
  assert.equal(testnet.alertLatency.status, "within_limit");
  assert.equal(testnet.alertLatency.suppliedComplete, true);
  assert.equal(testnet.alertLatency.triggerObservationCount, 1);
  assert.equal(testnet.alertLatency.coveredTriggerCount, 1);
  assert.equal(testnet.alertLatency.maximumObservedMilliseconds, "30000");
  assert.equal(testnet.executionHistory.status, "unknown_no_receipts");
  assert.equal(testnet.decision, "monitor");
  assert.equal(testnet.sourceContentsVerified, false);
  assert.equal(testnet.freshnessAttestedByAgent, false);
  assert.equal(testnet.marketplaceEligible, false);
  assert.equal(testnet.activationEligible, false);
  assert.equal(testnet.executionEnabled, false);
});

test("matches Venus per-market truncation before summing adjusted collateral", () => {
  const input = fixture();
  const snapshot = input.currentSnapshot;
  const series = input.observationSeries;
  const policy = input.policy;
  const methodology = input.methodology;
  assert.ok(snapshot);
  assert.ok(series);
  assert.ok(policy);
  assert.ok(methodology);
  const collateral = snapshot.collateralPositions[0];
  const debt = snapshot.debtPositions[0];
  const currentObservation = series.observations.at(-1);
  assert.ok(collateral);
  assert.ok(debt);
  assert.ok(currentObservation);

  const halfThreshold = (E18 / 2n).toString();
  snapshot.collateralPositions = [
    {
      ...collateral,
      collateralValueRaw: "1",
      effectiveLiquidationThresholdRaw: halfThreshold
    },
    {
      ...collateral,
      market: "Venus BTCB Core",
      underlyingAsset: "BTCB",
      vTokenAddress: V_BTCB,
      collateralValueRaw: "1",
      effectiveLiquidationThresholdRaw: halfThreshold,
      source: {
        ...collateral.source,
        market: "Venus BTCB Core",
        underlyingAsset: "BTCB",
        vTokenAddress: V_BTCB
      }
    }
  ];
  methodology.source.collateralVTokenAddresses = [V_BNB, V_BTCB];
  snapshot.source.collateralVTokenAddresses = [V_BNB, V_BTCB];
  snapshot.debtPositions[0] = { ...debt, debtValueRaw: "1" };
  input.observationSeries = {
    complete: true,
    observations: [
      {
        ...currentObservation,
        adjustedCollateralValueRaw: "0",
        debtValueRaw: "1",
        source: {
          ...currentObservation.source,
          collateralVTokenAddresses: [V_BNB, V_BTCB]
        }
      }
    ]
  };
  input.policy = {
    ...policy,
    minimumHistoryObservations: 1,
    minimumObservationWindowSeconds: 0,
    minimumAlertReceipts: 0
  };
  input.alertReceipts = null;

  const result = analyzeHealthFactor(input);
  assert.equal(result.monitoredPositions.totalCollateralValueRaw, "2");
  assert.equal(result.monitoredPositions.adjustedCollateralValueRaw, "0");
  assert.equal(result.currentHealthFactor.state, "computed");
  assert.equal(result.currentHealthFactor.numerator, "0");
  assert.equal(result.currentHealthFactor.denominator, "1");
  assert.equal(result.currentHealthFactor.decimalValueFloor, "0");
  assert.equal(result.decision, "review_intervention");
});

test("returns hold for a healthy sufficient window when alert receipts are not required", () => {
  const input = fixture();
  const series = input.observationSeries;
  const policy = input.policy;
  assert.ok(series);
  assert.ok(policy);
  const firstObservation = series.observations[0];
  const secondObservation = series.observations[1];
  assert.ok(firstObservation);
  assert.ok(secondObservation);
  series.observations[0] = {
    ...firstObservation,
    adjustedCollateralValueRaw: adjustedValueRaw(1700000000000000000n)
  };
  series.observations[1] = {
    ...secondObservation,
    adjustedCollateralValueRaw: adjustedValueRaw(1650000000000000000n)
  };
  input.policy = { ...policy, minimumAlertReceipts: 0 };
  input.alertReceipts = null;

  const result = analyzeHealthFactor(input);
  assert.equal(result.observationWindow.minimumHealthFactor.decimalValueFloor, "1.6");
  assert.equal(result.alertLatency.status, "not_required");
  assert.equal(result.decision, "hold");
});

test("stale, future, and missing current evidence withhold the health factor", () => {
  const stale = fixture();
  const staleSnapshot = stale.currentSnapshot;
  assert.ok(staleSnapshot);
  stale.currentSnapshot = { ...staleSnapshot, observedAtUtc: "2026-08-11T09:00:00Z" };
  const staleResult = analyzeHealthFactor(stale);
  assert.equal(staleResult.decision, "insufficient_evidence");
  assert.equal(staleResult.currentHealthFactor.state, "unavailable");
  assert.ok(staleResult.constraintViolations.some(({ code }) => code === "SOURCE_STALE"));

  const future = fixture();
  const methodology = future.methodology;
  assert.ok(methodology);
  future.methodology = { ...methodology, observedAtUtc: "2026-08-11T10:01:00Z" };
  const futureResult = analyzeHealthFactor(future);
  assert.equal(futureResult.decision, "insufficient_evidence");
  assert.ok(futureResult.constraintViolations.some(({ code }) => code === "SOURCE_IN_FUTURE"));

  const missing = fixture();
  delete missing.methodology;
  const missingResult = analyzeHealthFactor(missing);
  assert.equal(missingResult.decision, "insufficient_evidence");
  assert.equal(missingResult.monitoredPositions.adjustedCollateralValueRaw, null);
  assert.ok(missingResult.constraintViolations.some(({ code }) => code === "MISSING_METHODOLOGY"));
});

test("cross-block and fixed-point scale mismatches fail closed", () => {
  const crossBlock = fixture();
  const snapshot = crossBlock.currentSnapshot;
  assert.ok(snapshot);
  const debt = snapshot.debtPositions[0];
  assert.ok(debt);
  snapshot.debtPositions[0] = {
    ...debt,
    blockNumber: "501",
    blockHash: blockHash("d")
  };
  const crossBlockResult = analyzeHealthFactor(crossBlock);
  assert.equal(crossBlockResult.decision, "insufficient_evidence");
  assert.ok(crossBlockResult.constraintViolations.some(({ code }) => code === "BLOCK_MISMATCH"));

  const wrongScale = fixture();
  const wrongSnapshot = wrongScale.currentSnapshot;
  assert.ok(wrongSnapshot);
  const wrongDebt = wrongSnapshot.debtPositions[0];
  assert.ok(wrongDebt);
  wrongSnapshot.debtPositions[0] = { ...wrongDebt, quoteValueScaleDecimals: 18 };
  const wrongScaleResult = analyzeHealthFactor(wrongScale);
  assert.equal(wrongScaleResult.decision, "insufficient_evidence");
  assert.ok(wrongScaleResult.constraintViolations.some(({ code }) => code === "SCALE_MISMATCH"));
  assert.ok(wrongScaleResult.provenance.some(({ state }) => state === "scale_mismatch"));
});

test("requires official typed Venus sources and one quote unit across every current value", () => {
  const wrongChainComptroller = fixture(97);
  const wrongMethodology = wrongChainComptroller.methodology;
  assert.ok(wrongMethodology);
  wrongMethodology.source.comptrollerAddress = VENUS_CORE_COMPTROLLER_BY_CHAIN[56];
  const wrongChainResult = analyzeHealthFactor(wrongChainComptroller);
  assert.equal(wrongChainResult.currentHealthFactor.state, "unavailable");
  assert.ok(
    wrongChainResult.constraintViolations.some(
      ({ code }) => code === "OFFICIAL_COMPTROLLER_MISMATCH"
    )
  );

  const unrelatedContract = fixture();
  const unrelatedMethodology = unrelatedContract.methodology;
  assert.ok(unrelatedMethodology);
  unrelatedMethodology.source.comptrollerAddress = "0x7777777777777777777777777777777777777777";
  assert.equal(healthFactorAnalysisInputSchema.safeParse(unrelatedContract).success, false);

  const freeTextRead = fixture();
  const freeTextSnapshot = freeTextRead.currentSnapshot;
  assert.ok(freeTextSnapshot);
  const freeTextCollateral = freeTextSnapshot.collateralPositions[0];
  assert.ok(freeTextCollateral);
  Object.assign(freeTextCollateral.source, {
    readMethod: "balanceOf(address)",
    read: "trust me"
  });
  assert.equal(healthFactorAnalysisInputSchema.safeParse(freeTextRead).success, false);

  const wrongRelationship = fixture();
  const relationshipSnapshot = wrongRelationship.currentSnapshot;
  assert.ok(relationshipSnapshot);
  const relationshipCollateral = relationshipSnapshot.collateralPositions[0];
  assert.ok(relationshipCollateral);
  relationshipCollateral.source.vTokenAddress = V_BTCB;
  const relationshipResult = analyzeHealthFactor(wrongRelationship);
  assert.equal(relationshipResult.currentHealthFactor.state, "unavailable");
  assert.ok(
    relationshipResult.constraintViolations.some(({ code }) => code === "SOURCE_RELATION_MISMATCH")
  );

  const wrongBlockTimestamp = fixture();
  const timestampSnapshot = wrongBlockTimestamp.currentSnapshot;
  assert.ok(timestampSnapshot);
  timestampSnapshot.source.blockTimestampUtc = "2026-08-11T09:59:49Z";
  const timestampResult = analyzeHealthFactor(wrongBlockTimestamp);
  assert.equal(timestampResult.currentHealthFactor.state, "unavailable");
  assert.ok(
    timestampResult.constraintViolations.some(({ code }) => code === "SOURCE_RELATION_MISMATCH")
  );

  const wrongQuoteUnit = fixture();
  const quoteSnapshot = wrongQuoteUnit.currentSnapshot;
  assert.ok(quoteSnapshot);
  const quoteDebt = quoteSnapshot.debtPositions[0];
  assert.ok(quoteDebt);
  Object.assign(quoteDebt, { quoteValueUnit: "bnb" });
  assert.equal(healthFactorAnalysisInputSchema.safeParse(wrongQuoteUnit).success, false);
});

test("an incomplete collateral or debt enumeration never becomes a zero position", () => {
  const input = fixture();
  const snapshot = input.currentSnapshot;
  assert.ok(snapshot);
  input.currentSnapshot = { ...snapshot, collateralComplete: false, collateralPositions: [] };

  const result = analyzeHealthFactor(input);
  assert.equal(result.currentHealthFactor.state, "unavailable");
  assert.equal(result.decision, "insufficient_evidence");
  assert.ok(
    result.constraintViolations.some(({ code }) => code === "COLLATERAL_ENUMERATION_INCOMPLETE")
  );
});

test("models zero debt as not applicable without infinity", () => {
  const input = fixture();
  const snapshot = input.currentSnapshot;
  const series = input.observationSeries;
  const policy = input.policy;
  assert.ok(snapshot);
  assert.ok(series);
  assert.ok(policy);
  const debt = snapshot.debtPositions[0];
  assert.ok(debt);
  snapshot.debtPositions[0] = { ...debt, debtValueRaw: "0" };
  const currentObservation = series.observations.at(-1);
  assert.ok(currentObservation);
  series.observations[series.observations.length - 1] = {
    ...currentObservation,
    debtValueRaw: "0"
  };
  input.policy = { ...policy, minimumAlertReceipts: 0 };
  input.alertReceipts = null;

  const result = analyzeHealthFactor(input);
  assert.equal(result.currentHealthFactor.state, "not_applicable_zero_debt");
  assert.equal(result.currentHealthFactor.decimalValueFloor, null);
  assert.equal(result.currentHealthFactor.scaledValueFloor, null);
  assert.match(result.currentHealthFactor.statement, /infinity is not reported/i);
  assert.equal(result.decision, "hold");
});

test("uses exact policy threshold crossings for monitor and intervention review", () => {
  const alert = fixture();
  setCurrentHealthFactor(alert, 1400000000000000000n);
  const alertResult = analyzeHealthFactor(alert);
  assert.equal(alertResult.currentHealthFactor.decimalValueFloor, "1.4");
  assert.equal(alertResult.decision, "monitor");

  const intervention = fixture();
  setCurrentHealthFactor(intervention, 1100000000000000000n);
  const interventionResult = analyzeHealthFactor(intervention);
  assert.equal(interventionResult.currentHealthFactor.decimalValueFloor, "1.1");
  assert.equal(interventionResult.decision, "review_intervention");
});

test("insufficient observation history remains visible and triggers monitor", () => {
  const input = fixture();
  const series = input.observationSeries;
  assert.ok(series);
  const current = series.observations.at(-1);
  assert.ok(current);
  input.observationSeries = { complete: true, observations: [current] };

  const result = analyzeHealthFactor(input);
  assert.equal(result.currentHealthFactor.state, "computed");
  assert.equal(result.observationWindow.status, "insufficient");
  assert.equal(result.observationWindow.minimumHealthFactor.state, "unavailable");
  assert.equal(result.observationWindow.minimumObservedAtUtc, null);
  assert.equal(result.decision, "monitor");
  assert.ok(result.constraintViolations.some(({ code }) => code === "HISTORY_COUNT_INSUFFICIENT"));
});

test("observations after the current snapshot block cannot satisfy the history window", () => {
  const input = fixture();
  const series = input.observationSeries;
  const policy = input.policy;
  assert.ok(series);
  assert.ok(policy);
  const first = series.observations[0];
  const second = series.observations[1];
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.source.kind, "onchain");
  assert.equal(second.source.kind, "onchain");
  series.observations[0] = {
    ...first,
    blockNumber: "501",
    adjustedCollateralValueRaw: adjustedValueRaw(1700000000000000000n),
    source: { ...first.source, blockNumber: "501" }
  };
  series.observations[1] = {
    ...second,
    blockNumber: "502",
    adjustedCollateralValueRaw: adjustedValueRaw(1650000000000000000n),
    source: { ...second.source, blockNumber: "502" }
  };
  input.policy = { ...policy, minimumAlertReceipts: 0 };
  input.alertReceipts = null;

  const result = analyzeHealthFactor(input);
  assert.equal(result.observationWindow.status, "insufficient");
  assert.equal(result.observationWindow.minimumHealthFactor.state, "unavailable");
  assert.notEqual(result.decision, "hold");
  assert.ok(
    result.observationWindow.observations
      .slice(0, 2)
      .every(({ issues }) =>
        issues.some((issue) => /after the current snapshot block/i.test(issue))
      )
  );
});

test("alert latency breach warrants intervention review", () => {
  const input = fixture();
  const receipts = input.alertReceipts;
  const policy = input.policy;
  assert.ok(receipts);
  assert.ok(policy);
  const receipt = receipts[0];
  assert.ok(receipt);
  input.alertReceipts = [{ ...receipt, deliveredAtUtc: "2026-08-11T09:59:00Z" }];
  input.policy = { ...policy, minimumAlertReceipts: 2 };

  const result = analyzeHealthFactor(input);
  assert.equal(result.alertLatency.status, "breach");
  assert.equal(result.alertLatency.maximumObservedMilliseconds, "120000");
  assert.equal(result.decision, "review_intervention");
  assert.ok(result.constraintViolations.some(({ code }) => code === "ALERT_LATENCY_BREACH"));
  assert.ok(
    result.constraintViolations.some(({ code }) => code === "ALERT_LATENCY_EVIDENCE_INSUFFICIENT")
  );
});

test("alert latency requires complete coverage of every threshold-crossing observation", () => {
  const input = fixture();
  const series = input.observationSeries;
  assert.ok(series);
  const second = series.observations[1];
  assert.ok(second);
  series.observations[1] = {
    ...second,
    adjustedCollateralValueRaw: adjustedValueRaw(1450000000000000000n)
  };

  const result = analyzeHealthFactor(input);
  assert.equal(result.alertLatency.triggerObservationCount, 2);
  assert.equal(result.alertLatency.coveredTriggerCount, 1);
  assert.equal(result.alertLatency.status, "insufficient_evidence");
  assert.ok(
    result.constraintViolations.some(({ code }) => code === "ALERT_TRIGGER_COVERAGE_INCOMPLETE")
  );

  const incomplete = fixture();
  incomplete.alertReceiptsComplete = false;
  const incompleteResult = analyzeHealthFactor(incomplete);
  assert.equal(incompleteResult.alertLatency.status, "insufficient_evidence");
  assert.ok(
    incompleteResult.constraintViolations.some(
      ({ code }) => code === "ALERT_RECEIPT_ENUMERATION_INCOMPLETE"
    )
  );
});

test("duplicate alert receipts cannot inflate latency evidence count", () => {
  const input = fixture();
  const policy = input.policy;
  const receipts = input.alertReceipts;
  assert.ok(policy);
  assert.ok(receipts);
  const receipt = receipts[0];
  assert.ok(receipt);
  input.policy = { ...policy, minimumAlertReceipts: 2 };
  input.alertReceipts = [receipt, { ...receipt }];

  const result = analyzeHealthFactor(input);
  assert.equal(result.alertLatency.validReceiptCount, 1);
  assert.equal(result.alertLatency.coveredTriggerCount, 1);
  assert.equal(result.alertLatency.status, "insufficient_evidence");
  assert.equal(result.alertLatency.receipts[1]?.state, "invalid");
  assert.ok(result.constraintViolations.some(({ code }) => code === "ALERT_RECEIPT_INVALID"));
  assert.ok(
    result.constraintViolations.some(({ code }) => code === "ALERT_LATENCY_EVIDENCE_INSUFFICIENT")
  );
});

test("alert trigger timestamps are compared as instants rather than strings", () => {
  const input = fixture();
  const series = input.observationSeries;
  assert.ok(series);
  const trigger = series.observations[0];
  assert.ok(trigger);
  series.observations[0] = { ...trigger, observedAtUtc: "2026-08-11T09:57:00.000Z" };

  const result = analyzeHealthFactor(input);
  assert.equal(result.alertLatency.status, "within_limit");
  assert.equal(result.alertLatency.receipts[0]?.state, "valid");
  assert.equal(result.alertLatency.maximumObservedMilliseconds, "30000");
});

test("execution history remains unknown even when a context-consistent claim is supplied", () => {
  const unknown = analyzeHealthFactor(fixture());
  assert.equal(unknown.executionHistory.status, "unknown_no_receipts");
  assert.equal(unknown.executionHistory.latestSuppliedTransactionHash, null);

  const input = fixture();
  input.executionReceipts = [
    {
      chainId: 97,
      account: ACCOUNT,
      transactionHash: TX,
      action: "repay",
      status: "success",
      blockNumber: "490",
      blockHash: blockHash("e"),
      observedAtUtc: "2026-08-11T09:50:00Z",
      source: transactionSource(97, "490", blockHash("e"), "2026-08-11T09:50:00Z", TX)
    }
  ];
  const unverified = analyzeHealthFactor(input);
  assert.equal(unverified.executionHistory.status, "unknown_unverified_supplied_receipts");
  assert.equal(unverified.executionHistory.contextConsistentReceiptCount, 1);
  assert.equal(unverified.executionHistory.claimedSuccessReceiptCount, 1);
  assert.equal(unverified.executionHistory.latestSuppliedTransactionHash, TX);
  assert.match(unverified.executionHistory.statement, /unverified caller claims/i);

  const invalid = fixture();
  invalid.executionReceipts = [
    {
      chainId: 56,
      account: ACCOUNT,
      transactionHash: TX,
      action: "repay",
      status: "success",
      blockNumber: "490",
      blockHash: blockHash("e"),
      observedAtUtc: "2026-08-11T09:50:00Z",
      source: transactionSource(56, "490", blockHash("e"), "2026-08-11T09:50:00Z", TX)
    }
  ];
  const invalidResult = analyzeHealthFactor(invalid);
  assert.equal(invalidResult.executionHistory.status, "unknown_unverified_supplied_receipts");
  assert.equal(invalidResult.executionHistory.contextConsistentReceiptCount, 0);
  assert.ok(
    invalidResult.constraintViolations.some(({ code }) => code === "EXECUTION_RECEIPT_INVALID")
  );
});

test("future execution claims are invalid without relying on a policy tolerance", () => {
  const input = fixture();
  delete input.policy;
  input.executionReceipts = [
    {
      chainId: 97,
      account: ACCOUNT,
      transactionHash: TX,
      action: "repay",
      status: "success",
      blockNumber: "501",
      blockHash: blockHash("f"),
      observedAtUtc: "2027-08-11T10:00:00Z",
      source: transactionSource(97, "501", blockHash("f"), "2027-08-11T10:00:00Z", TX)
    }
  ];

  const result = analyzeHealthFactor(input);
  assert.equal(result.executionHistory.status, "unknown_unverified_supplied_receipts");
  assert.equal(result.executionHistory.contextConsistentReceiptCount, 0);
  assert.equal(result.executionHistory.receipts[0]?.state, "invalid");
  assert.ok(result.constraintViolations.some(({ code }) => code === "EXECUTION_RECEIPT_INVALID"));
});

test("execution receipt violations retain their original array index", () => {
  const input = fixture();
  input.executionReceipts = [
    {
      chainId: 97,
      account: ACCOUNT,
      transactionHash: TX,
      action: "repay",
      status: "success",
      blockNumber: "490",
      blockHash: blockHash("e"),
      observedAtUtc: "2026-08-11T09:50:00Z",
      source: transactionSource(97, "490", blockHash("e"), "2026-08-11T09:50:00Z", TX)
    },
    {
      chainId: 56,
      account: ACCOUNT,
      transactionHash: TX_2,
      action: "add_collateral",
      status: "reverted",
      blockNumber: "491",
      blockHash: blockHash("f"),
      observedAtUtc: "2026-08-11T09:51:00Z",
      source: transactionSource(56, "491", blockHash("f"), "2026-08-11T09:51:00Z", TX_2)
    }
  ];

  const result = analyzeHealthFactor(input);
  const violation = result.constraintViolations.find(
    ({ code }) => code === "EXECUTION_RECEIPT_INVALID"
  );
  assert.equal(violation?.path, "executionReceipts.1");
});

test("history cannot claim a current window when its current-block aggregate differs", () => {
  const input = fixture();
  const series = input.observationSeries;
  assert.ok(series);
  const current = series.observations.at(-1);
  assert.ok(current);
  series.observations[series.observations.length - 1] = {
    ...current,
    adjustedCollateralValueRaw: (BigInt(current.adjustedCollateralValueRaw) + 1n).toString()
  };

  const result = analyzeHealthFactor(input);
  assert.equal(result.currentHealthFactor.state, "computed");
  assert.equal(result.observationWindow.includesCurrentObservation, false);
  assert.equal(result.observationWindow.status, "insufficient");
  assert.ok(
    result.constraintViolations.some(({ code }) => code === "HISTORY_CURRENT_OBSERVATION_MISMATCH")
  );
});

test("preserves huge uint256 values and exact rational arithmetic", () => {
  const input = fixture();
  const snapshot = input.currentSnapshot;
  const series = input.observationSeries;
  const policy = input.policy;
  assert.ok(snapshot);
  assert.ok(series);
  assert.ok(policy);
  const collateral = snapshot.collateralPositions[0];
  const debt = snapshot.debtPositions[0];
  const currentObservation = series.observations.at(-1);
  assert.ok(collateral);
  assert.ok(debt);
  assert.ok(currentObservation);
  const maximum = ((1n << 256n) - 1n).toString();
  snapshot.collateralPositions[0] = {
    ...collateral,
    collateralValueRaw: maximum,
    effectiveLiquidationThresholdRaw: E18.toString()
  };
  snapshot.debtPositions[0] = { ...debt, debtValueRaw: "1" };
  series.observations = [
    {
      ...currentObservation,
      adjustedCollateralValueRaw: maximum,
      debtValueRaw: "1"
    }
  ];
  input.policy = {
    ...policy,
    minimumHistoryObservations: 1,
    minimumObservationWindowSeconds: 0,
    minimumAlertReceipts: 0
  };
  input.alertReceipts = null;

  const result = analyzeHealthFactor(input);
  assert.equal(result.monitoredPositions.totalCollateralValueRaw, maximum);
  assert.equal(result.currentHealthFactor.numerator, maximum);
  assert.equal(result.currentHealthFactor.denominator, "1");
  assert.equal(result.executionEnabled, false);
});

test("fails closed when summed adjusted collateral or debt exceeds uint256", () => {
  const input = fixture();
  const snapshot = input.currentSnapshot;
  assert.ok(snapshot);
  const collateral = snapshot.collateralPositions[0];
  const debt = snapshot.debtPositions[0];
  assert.ok(collateral);
  assert.ok(debt);
  const maximum = ((1n << 256n) - 1n).toString();
  snapshot.collateralPositions = [
    {
      ...collateral,
      collateralValueRaw: maximum,
      effectiveLiquidationThresholdRaw: E18.toString()
    },
    {
      ...collateral,
      market: "Venus BTCB Core",
      underlyingAsset: "BTCB",
      vTokenAddress: V_BTCB,
      collateralValueRaw: maximum,
      effectiveLiquidationThresholdRaw: E18.toString()
    }
  ];
  snapshot.debtPositions = [
    { ...debt, debtValueRaw: maximum },
    {
      ...debt,
      market: "Venus ETH Core",
      underlyingAsset: "ETH",
      vTokenAddress: V_ETH,
      debtValueRaw: maximum
    }
  ];

  const result = analyzeHealthFactor(input);
  assert.equal(result.currentHealthFactor.state, "unavailable");
  assert.equal(result.decision, "insufficient_evidence");
  assert.ok(
    result.constraintViolations.some(
      ({ code }) => code === "ADJUSTED_COLLATERAL_AGGREGATE_EXCEEDS_UINT256"
    )
  );
  assert.ok(
    result.constraintViolations.some(({ code }) => code === "DEBT_AGGREGATE_EXCEEDS_UINT256")
  );
});

test("strict schemas reject unsafe metadata and unknown keys", () => {
  assert.equal(
    healthFactorAnalysisInputSchema.safeParse({ ...fixture(), unexpected: true }).success,
    false
  );

  const unsafe = fixture();
  const receipts = unsafe.alertReceipts;
  assert.ok(receipts);
  const receipt = receipts[0];
  assert.ok(receipt);
  unsafe.alertReceipts = [
    { ...receipt, receiptUrl: "https://user:password@alerts.example/receipt#secret" }
  ];
  assert.equal(healthFactorAnalysisInputSchema.safeParse(unsafe).success, false);

  const badPolicy = fixture();
  const policy = badPolicy.policy;
  assert.ok(policy);
  badPolicy.policy = {
    ...policy,
    interventionHealthFactorRaw: "1600000000000000000",
    alertHealthFactorRaw: "1500000000000000000"
  };
  assert.equal(healthFactorAnalysisInputSchema.safeParse(badPolicy).success, false);
});

test("rejects zero identifiers, insecure evidence URLs, and wider historical aggregates", () => {
  const zeroAccount = fixture();
  zeroAccount.account = ZERO_ADDRESS;

  const zeroVToken = fixture();
  const zeroVTokenSnapshot = zeroVToken.currentSnapshot;
  assert.ok(zeroVTokenSnapshot);
  const collateral = zeroVTokenSnapshot.collateralPositions[0];
  assert.ok(collateral);
  zeroVTokenSnapshot.collateralPositions[0] = {
    ...collateral,
    vTokenAddress: ZERO_ADDRESS
  };

  const zeroContract = fixture();
  const zeroContractMethodology = zeroContract.methodology;
  assert.ok(zeroContractMethodology);
  assert.equal(zeroContractMethodology.source.kind, "onchain");
  zeroContractMethodology.source = {
    ...zeroContractMethodology.source,
    comptrollerAddress: ZERO_ADDRESS
  };

  const zeroBlockHash = fixture();
  const zeroBlockSnapshot = zeroBlockHash.currentSnapshot;
  assert.ok(zeroBlockSnapshot);
  zeroBlockSnapshot.blockHash = ZERO_HASH;

  const zeroTransactionHash = fixture();
  zeroTransactionHash.executionReceipts = [
    {
      chainId: 97,
      account: ACCOUNT,
      transactionHash: ZERO_HASH,
      action: "repay",
      status: "success",
      blockNumber: "490",
      blockHash: blockHash("e"),
      observedAtUtc: "2026-08-11T09:50:00Z",
      source: transactionSource(97, "490", blockHash("e"), "2026-08-11T09:50:00Z", ZERO_HASH)
    }
  ];

  const zeroDigest = fixture();
  const zeroDigestReceipts = zeroDigest.alertReceipts;
  assert.ok(zeroDigestReceipts);
  const zeroDigestReceipt = zeroDigestReceipts[0];
  assert.ok(zeroDigestReceipt);
  zeroDigest.alertReceipts = [{ ...zeroDigestReceipt, contentSha256: "0".repeat(64) }];

  const insecureUrl = fixture();
  const insecureReceipts = insecureUrl.alertReceipts;
  assert.ok(insecureReceipts);
  const insecureReceipt = insecureReceipts[0];
  assert.ok(insecureReceipt);
  insecureUrl.alertReceipts = [
    { ...insecureReceipt, receiptUrl: "http://evidence.example/fixture" }
  ];

  const loopbackUrl = fixture();
  const loopbackReceipts = loopbackUrl.alertReceipts;
  assert.ok(loopbackReceipts);
  const loopbackReceipt = loopbackReceipts[0];
  assert.ok(loopbackReceipt);
  loopbackUrl.alertReceipts = [{ ...loopbackReceipt, receiptUrl: "https://127.0.0.1/fixture" }];

  const widerHistoryAggregate = fixture();
  const widerSeries = widerHistoryAggregate.observationSeries;
  assert.ok(widerSeries);
  const widerObservation = widerSeries.observations[0];
  assert.ok(widerObservation);
  widerSeries.observations[0] = {
    ...widerObservation,
    adjustedCollateralValueRaw: (1n << 256n).toString()
  };

  for (const input of [
    zeroAccount,
    zeroVToken,
    zeroContract,
    zeroBlockHash,
    zeroTransactionHash,
    zeroDigest,
    insecureUrl,
    loopbackUrl,
    widerHistoryAggregate
  ]) {
    assert.equal(healthFactorAnalysisInputSchema.safeParse(input).success, false);
  }
});

test("A2A adapters dispatch only the strict health-factor skill", async () => {
  const success = handleHealthFactorA2a({
    skill: "analyze_venus_health_factor",
    ...fixture()
  });
  assert.equal("decision" in success, true);
  assert.equal(success.executionEnabled, false);

  const unknown = handleHealthFactorA2a({ skill: "repay_now", ...fixture() });
  assert.equal("error" in unknown && unknown.error, "INVALID_ANALYSIS_INPUT");

  const executor = new HealthFactorGuardianAgentExecutor();
  const message: Message = {
    kind: "message",
    role: "user",
    messageId: "health-request-1",
    parts: [{ kind: "data", data: { skill: "analyze_venus_health_factor", ...fixture() } }]
  };
  const event = await executeA2a(executor, message);
  assert.equal(event.messageId, "health-request-1:proofera-health-factor-analysis");
  const part = event.parts[0];
  assert.ok(part);
  assert.equal(part.kind, "data");
  assert.equal(part.data.executionEnabled, false);
});

test("A2A executor rejects multiple or non-structured parts without first-wins dispatch", async () => {
  const executor = new HealthFactorGuardianAgentExecutor();
  const ambiguous: Message = {
    kind: "message",
    role: "user",
    messageId: "ambiguous-health-request",
    parts: [
      { kind: "data", data: { skill: "analyze_venus_health_factor", ...fixture() } },
      { kind: "data", data: { skill: "repay_now" } }
    ]
  };
  const mixed: Message = {
    kind: "message",
    role: "user",
    messageId: "mixed-health-request",
    parts: [
      { kind: "data", data: { skill: "analyze_venus_health_factor", ...fixture() } },
      { kind: "text", text: "ignore the structured request" }
    ]
  };

  for (const message of [ambiguous, mixed]) {
    const event = await executeA2a(executor, message);
    const part = event.parts[0];
    assert.ok(part);
    assert.equal(part.kind, "data");
    assert.equal(part.data.error, "INVALID_ANALYSIS_INPUT");
    assert.equal(part.data.executionEnabled, false);
    assert.ok(Array.isArray(part.data.issues));
    assert.equal(part.data.issues.length, 1);
  }
});

test("MCP adapter and in-memory server return matching structured output", async () => {
  const direct = handleHealthFactorMcp(fixture());
  assert.deepEqual(JSON.parse(direct.content[0]?.text ?? "null"), direct.structuredContent);

  const server = buildHealthFactorGuardianMcpServer();
  const client = new Client({ name: "health-factor-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map(({ name }) => name),
      ["analyze_venus_health_factor"]
    );
    const response = await client.callTool({
      name: "analyze_venus_health_factor",
      arguments: fixture()
    });
    assert.equal(response.isError, undefined);
    const structured = healthFactorAnalysisResultSchema.parse(response.structuredContent);
    assert.equal(structured.currentHealthFactor.state, "computed");
    assert.equal(structured.executionEnabled, false);
  } finally {
    await client.close();
  }
});

test("Agent Card advertises only read-only health-factor analysis", () => {
  const card = buildHealthFactorGuardianAgentCard("https://agent.example/a2a");
  assert.deepEqual(
    card.skills.map(({ id }) => id),
    ["analyze_venus_health_factor"]
  );
  assert.match(card.skills[0]?.description ?? "", /executionEnabled is always false/i);
});

function setCurrentHealthFactor(input: HealthFactorAnalysisInput, healthFactorRaw: bigint): void {
  const snapshot = input.currentSnapshot;
  const series = input.observationSeries;
  assert.ok(snapshot);
  assert.ok(series);
  const collateral = snapshot.collateralPositions[0];
  const currentObservation = series.observations.at(-1);
  assert.ok(collateral);
  assert.ok(currentObservation);
  const collateralValue = (healthFactorRaw * DEBT) / THRESHOLD;
  snapshot.collateralPositions[0] = {
    ...collateral,
    collateralValueRaw: collateralValue.toString()
  };
  series.observations[series.observations.length - 1] = {
    ...currentObservation,
    adjustedCollateralValueRaw: adjustedValueRaw(healthFactorRaw)
  };
}

async function executeA2a(
  executor: HealthFactorGuardianAgentExecutor,
  message: Message
): Promise<Message> {
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
