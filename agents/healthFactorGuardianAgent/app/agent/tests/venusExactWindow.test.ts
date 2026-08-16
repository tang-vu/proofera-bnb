import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VENUS_CORE_COMPTROLLER_BY_CHAIN,
  analyzeHealthFactor,
  type HealthFactorAnalysisInput
} from "../src/healthFactorAnalysis.js";
import { buildHealthFactorInputFromExactWindow } from "../src/venusExactWindow.js";

const ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_ACCOUNT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const VTOKEN = "0x3333333333333333333333333333333333333333";
const ORACLE = "0x4444444444444444444444444444444444444444";
const E18 = 10n ** 18n;
const THRESHOLD = 800000000000000000n;
const DEBT = 1000000000n;

function hash(character: string): string {
  return `0x${character.repeat(64)}`;
}

function required<T>(value: T | undefined): T {
  assert.ok(value);
  return value;
}

function exactEvidence(
  blockNumber: string,
  blockHash: string,
  blockTimestampUtc: string,
  healthFactorRaw: bigint
) {
  const balance = (healthFactorRaw * DEBT) / THRESHOLD;
  const supplied = balance;
  const adjusted = (THRESHOLD * balance) / E18;
  const debt = DEBT;
  return {
    schemaVersion: "proofera-venus-core-exact-block-evidence-v1.0.0",
    chainId: 97,
    account: ACCOUNT,
    comptrollerAddress: VENUS_CORE_COMPTROLLER_BY_CHAIN[97],
    blockNumber,
    blockHash,
    blockTimestampUtc,
    oracleAddress: ORACLE,
    marketsEnumerated: 46,
    assetsIn: [VTOKEN],
    positions: [
      {
        vTokenAddress: VTOKEN,
        vTokenSymbol: "vUSDT",
        underlyingSymbol: "USDT",
        vTokenBalanceRaw: balance.toString(),
        borrowBalanceRaw: debt.toString(),
        exchangeRateMantissaRaw: E18.toString(),
        oraclePriceMantissaRaw: E18.toString(),
        effectiveLiquidationThresholdMantissaRaw: THRESHOLD.toString(),
        suppliedValueUsdE18Raw: supplied.toString(),
        adjustedCollateralValueUsdE18Raw: adjusted.toString(),
        debtValueUsdE18Raw: debt.toString()
      }
    ],
    adjustedCollateralValueUsdE18Raw: adjusted.toString(),
    debtValueUsdE18Raw: debt.toString(),
    healthFactorE18Raw: ((adjusted * E18) / debt).toString(),
    providerAttestations: [
      {
        providerId: "publicnode-bsc-testnet",
        publicSourceUrl: "https://bsc-testnet-rpc.publicnode.com",
        observedAtUtc: new Date(Date.parse(blockTimestampUtc) + 10_000).toISOString()
      },
      {
        providerId: "bnbchain-testnet-dataseed",
        publicSourceUrl: "https://bsc-testnet-dataseed.bnbchain.org",
        observedAtUtc: new Date(Date.parse(blockTimestampUtc) + 11_000).toISOString()
      }
    ],
    limitations: ["Read-only exact-block evidence."]
  };
}

function window() {
  return [
    exactEvidence("498", hash("a"), "2026-08-11T09:57:00.000Z", 1400000000000000000n),
    exactEvidence("499", hash("b"), "2026-08-11T09:58:00.000Z", 1550000000000000000n),
    exactEvidence("500", hash("c"), "2026-08-11T09:59:50.000Z", 1600000000000000000n)
  ];
}

function policy(): NonNullable<HealthFactorAnalysisInput["policy"]> {
  return {
    healthFactorScaleDecimals: 18,
    alertHealthFactorRaw: "1500000000000000000",
    interventionHealthFactorRaw: "1100000000000000000",
    maximumCurrentEvidenceAgeSeconds: 300,
    maximumObservationAgeSeconds: 3600,
    futureToleranceSeconds: 30,
    minimumHistoryObservations: 3,
    minimumObservationWindowSeconds: 120,
    maximumAlertLatencySeconds: 60,
    minimumAlertReceipts: 0,
    configuredAtUtc: "2026-08-11T09:56:00.000Z",
    source: { kind: "caller", reference: "Frozen TermiX guardian policy" }
  };
}

function authorization(account = ACCOUNT) {
  return {
    state: "explicit_testnet_authorization",
    account,
    authorizedAtUtc: "2026-08-11T09:00:00.000Z",
    authorizationArtifactSha256: "ab".repeat(32),
    reference: "Reviewed account authorization artifact"
  };
}

test("builds a strict v1.3 replay input from a provider-matched exact-block window", () => {
  const build = buildHealthFactorInputFromExactWindow({
    evidenceWindow: window(),
    analysisAtUtc: "2026-08-11T10:00:30.000Z",
    policy: policy(),
    accountAuthorization: authorization()
  });

  assert.equal(build.bindings.firstBlockNumber, "498");
  assert.equal(build.bindings.lastBlockNumber, "500");
  assert.equal(build.bindings.observationCount, 3);
  assert.equal(build.bindings.evidenceSha256.length, 3);
  assert.deepEqual(build.bindings.providerIds, [
    "bnbchain-testnet-dataseed",
    "publicnode-bsc-testnet"
  ]);
  assert.equal(build.input.alertReceiptsComplete, true);
  assert.equal(build.input.currentSnapshot?.collateralPositions[0]?.vTokenBalanceRaw, "2000000000");

  const result = analyzeHealthFactor(build.input);
  assert.equal(result.currentHealthFactor.decimalValueFloor, "1.6");
  assert.equal(result.observationWindow.status, "sufficient");
  assert.equal(result.observationWindow.minimumHealthFactor.decimalValueFloor, "1.4");
  assert.equal(result.alertLatency.status, "not_required");
  assert.equal(result.sourceContentsVerified, false);
  assert.equal(result.executionEnabled, false);
});

test("rejects unauthorized, reordered, provider-drifted and arithmetically mutated windows", () => {
  assert.throws(
    () =>
      buildHealthFactorInputFromExactWindow({
        evidenceWindow: window(),
        analysisAtUtc: "2026-08-11T10:00:30.000Z",
        policy: policy(),
        accountAuthorization: authorization(OTHER_ACCOUNT)
      }),
    /VENUS_WINDOW_ACCOUNT_NOT_AUTHORIZED/
  );

  const reordered = window();
  const first = required(reordered[0]);
  const second = required(reordered[1]);
  reordered[0] = second;
  reordered[1] = first;
  assert.throws(
    () =>
      buildHealthFactorInputFromExactWindow({
        evidenceWindow: reordered,
        analysisAtUtc: "2026-08-11T10:00:30.000Z",
        policy: policy(),
        accountAuthorization: authorization()
      }),
    /VENUS_WINDOW_ORDER_INVALID/
  );

  const providerDrift = window();
  required(required(providerDrift[0]).providerAttestations[0]).providerId = "unexpected-provider";
  assert.throws(
    () =>
      buildHealthFactorInputFromExactWindow({
        evidenceWindow: providerDrift,
        analysisAtUtc: "2026-08-11T10:00:30.000Z",
        policy: policy(),
        accountAuthorization: authorization()
      }),
    /VENUS_WINDOW_PROVIDER_SET_MISMATCH/
  );

  const mutated = window();
  required(required(mutated[0]).positions[0]).adjustedCollateralValueUsdE18Raw = "1";
  assert.throws(() =>
    buildHealthFactorInputFromExactWindow({
      evidenceWindow: mutated,
      analysisAtUtc: "2026-08-11T10:00:30.000Z",
      policy: policy(),
      accountAuthorization: authorization()
    })
  );
});

test("keeps authorization, provider time and runner-latency boundaries fail closed", () => {
  const lateAuthorization = authorization();
  lateAuthorization.authorizedAtUtc = "2026-08-11T09:57:01.000Z";
  assert.throws(
    () =>
      buildHealthFactorInputFromExactWindow({
        evidenceWindow: window(),
        analysisAtUtc: "2026-08-11T10:00:30.000Z",
        policy: policy(),
        accountAuthorization: lateAuthorization
      }),
    /VENUS_WINDOW_AUTHORIZATION_TOO_LATE/
  );

  const futureProvider = window();
  required(required(futureProvider[2]).providerAttestations[0]).observedAtUtc =
    "2026-08-11T10:00:31.000Z";
  assert.throws(
    () =>
      buildHealthFactorInputFromExactWindow({
        evidenceWindow: futureProvider,
        analysisAtUtc: "2026-08-11T10:00:30.000Z",
        policy: policy(),
        accountAuthorization: authorization()
      }),
    /VENUS_WINDOW_PROVIDER_TIME_INVALID/
  );

  const internalReceipts = policy();
  internalReceipts.minimumAlertReceipts = 1;
  assert.throws(
    () =>
      buildHealthFactorInputFromExactWindow({
        evidenceWindow: window(),
        analysisAtUtc: "2026-08-11T10:00:30.000Z",
        policy: internalReceipts,
        accountAuthorization: authorization()
      }),
    /VENUS_WINDOW_RUNNER_LATENCY_REQUIRES_ZERO_INTERNAL_RECEIPTS/
  );

  const stale = policy();
  stale.maximumCurrentEvidenceAgeSeconds = 1;
  assert.throws(
    () =>
      buildHealthFactorInputFromExactWindow({
        evidenceWindow: window(),
        analysisAtUtc: "2026-08-11T10:00:30.000Z",
        policy: stale,
        accountAuthorization: authorization()
      }),
    /VENUS_WINDOW_HEALTH_INPUT_NOT_DECISION_READY/
  );
});
