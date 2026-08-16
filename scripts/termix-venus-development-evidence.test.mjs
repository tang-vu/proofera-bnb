import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const artifactUrl = new URL(
  "../evidence/development/venus-core-exact-block-125469553-9d4fbf6b.json",
  import.meta.url
);
const artifactBytes = await readFile(artifactUrl);
const artifact = JSON.parse(artifactBytes.toString("utf8"));
const E18 = 10n ** 18n;

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function comparableObservation(observation) {
  const copy = structuredClone(observation);
  delete copy.providerId;
  delete copy.publicSourceUrl;
  delete copy.observedAtUtc;
  return copy;
}

function rpcRequests(transcript) {
  return transcript.flatMap(({ request }) => (Array.isArray(request) ? request : [request]));
}

test("committed Venus capture is a bounded clean-commit development observation", () => {
  assert.equal(artifactBytes.at(-1), 0x0a);
  assert.ok(artifactBytes.byteLength < 1_000_000);
  assert.equal(artifact.schemaVersion, "proofera-termix-venus-development-capture-v1.0.0");
  assert.equal(artifact.status, "DEVELOPMENT_READ_ONLY");
  assert.equal(artifact.publishable, false);
  assert.equal(artifact.termixRunStatus, "NOT_RUN");
  assert.equal(artifact.sourceCommit, "c1e0186cfaa6c7d40d240d8bb84542711b128e44");
  assert.equal(artifact.sourceCommitClean, true);
  assert.match(artifact.capturedAtUtc, /^2026-08-1[67]T[0-9:.]+Z$/);
  assert.ok(Date.parse(artifact.capturedAtUtc) >= Date.parse(artifact.evidence.blockTimestampUtc));
});

test("both provider transcripts hash exactly and contain read-only RPC methods", () => {
  assert.equal(artifact.providerCaptures.length, 2);
  const origins = new Set();
  for (const capture of artifact.providerCaptures) {
    assert.equal(digestJson(capture.transcript), capture.transcriptSha256);
    assert.equal(Buffer.byteLength(JSON.stringify(capture.transcript)), capture.transcriptBytes);
    origins.add(new URL(capture.observation.publicSourceUrl).origin);
    for (const request of rpcRequests(capture.transcript)) {
      assert.ok(
        ["eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_call"].includes(request.method)
      );
    }
  }
  assert.equal(origins.size, 2);
  assert.deepEqual(
    comparableObservation(artifact.providerCaptures[0].observation),
    comparableObservation(artifact.providerCaptures[1].observation)
  );
});

test("capture binds complete market state and reproduces the exact integer health factor", () => {
  const evidence = artifact.evidence;
  assert.equal(evidence.chainId, 97);
  assert.equal(evidence.account, "0x64DF36Cb7ef4ab5191A21b68e48954D09D4FBf6B");
  assert.equal(evidence.blockNumber, "125469553");
  assert.equal(
    evidence.blockHash,
    "0x33c9ef3a72e7905a3d124efa13956b1258ba2e974b5d8606b0df0d6e4641a311"
  );
  assert.equal(evidence.marketsEnumerated, 46);
  assert.equal(evidence.positions.length, 1);
  assert.ok(evidence.limitations.some((value) => value.includes("benchmark preparation")));

  const adjusted = evidence.positions.reduce(
    (sum, position) => sum + BigInt(position.adjustedCollateralValueUsdE18Raw),
    0n
  );
  const debt = evidence.positions.reduce(
    (sum, position) => sum + BigInt(position.debtValueUsdE18Raw),
    0n
  );
  assert.equal(evidence.adjustedCollateralValueUsdE18Raw, adjusted.toString());
  assert.equal(evidence.debtValueUsdE18Raw, debt.toString());
  assert.equal(evidence.healthFactorE18Raw, ((adjusted * E18) / debt).toString());

  for (const capture of artifact.providerCaptures) {
    assert.equal(capture.observation.markets.length, 46);
    assert.equal(capture.observation.vaiRepayAmountRaw, "0");
    const activeMarkets = capture.observation.markets.filter(
      ({ vTokenBalanceRaw, borrowBalanceRaw }) =>
        vTokenBalanceRaw !== "0" || borrowBalanceRaw !== "0"
    );
    assert.equal(activeMarkets.length, 1);
    assert.equal(activeMarkets[0].oraclePriceStatus, "available");
    assert.notEqual(activeMarkets[0].oraclePriceMantissaRaw, "0");
    assert.equal(
      capture.observation.markets.filter(
        ({ oraclePriceStatus }) => oraclePriceStatus === "unavailable"
      ).length,
      2
    );
  }
});

test("capture contains no secret-shaped field or transaction-result claim", () => {
  const serialized = artifactBytes.toString("utf8");
  assert.doesNotMatch(
    serialized,
    /private[_-]?key|mnemonic|seed[_-]?phrase|wallet[_-]?password|signed[_-]?transaction/i
  );
  assert.doesNotMatch(serialized, /"status"\s*:\s*"(?:success|verified|published)"/i);
  assert.doesNotMatch(serialized, /eth_sendRawTransaction|eth_sendTransaction/);
});
