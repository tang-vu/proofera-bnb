import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url);
const MANIFEST_PATH =
  "evidence/development/venus-core-exact-window-125563831-125564152-9d4fbf6b.json";
const SOURCE_COMMIT = "076b2aabaa6da536a786f3589d7123e051198a1a";
const ACCOUNT = "0x64DF36Cb7ef4ab5191A21b68e48954D09D4FBf6B";
const PROVIDERS = new Set([
  "https://bsc-testnet-rpc.publicnode.com",
  "https://bsc-testnet-dataseed.bnbchain.org"
]);
const E18 = 10n ** 18n;
const manifestBytes = await readFile(new URL(`../${MANIFEST_PATH}`, import.meta.url));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const captures = await Promise.all(
  manifest.captureArtifacts.map(async (reference) => {
    const bytes = await readFile(new URL(`../${reference.path}`, import.meta.url));
    return { reference, bytes, artifact: JSON.parse(bytes.toString("utf8")) };
  })
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true }).trim();
}

test("retained Venus live-window manifest is clean-source development evidence only", () => {
  assert.equal(manifestBytes.at(-1), 0x0a);
  assert.ok(manifestBytes.byteLength < 20_000);
  assert.equal(manifest.schemaVersion, "proofera-termix-venus-development-window-v1.1.0");
  assert.equal(manifest.status, "DEVELOPMENT_READ_ONLY");
  assert.equal(manifest.publishable, false);
  assert.equal(manifest.termixRunStatus, "NOT_RUN");
  assert.equal(manifest.sourceCommit, SOURCE_COMMIT);
  assert.equal(manifest.sourceCommitClean, true);
  assert.equal(git(["rev-parse", SOURCE_COMMIT]), SOURCE_COMMIT);
  assert.equal(
    spawnSync("git", ["merge-base", "--is-ancestor", SOURCE_COMMIT, "origin/main"], {
      cwd: ROOT,
      windowsHide: true
    }).status,
    0
  );
});

test("three ordered exact observations span over two minutes and recompute", () => {
  assert.equal(manifest.evidenceWindow.length, 3);
  assert.equal(captures.length, 3);
  const firstTimestamp = Date.parse(manifest.evidenceWindow[0].blockTimestampUtc);
  const lastTimestamp = Date.parse(manifest.evidenceWindow.at(-1).blockTimestampUtc);
  assert.ok(lastTimestamp - firstTimestamp >= 120_000);
  assert.ok(Date.parse(manifest.capturedAtUtc) >= lastTimestamp);

  let previousBlock = 0n;
  for (const evidence of manifest.evidenceWindow) {
    const block = BigInt(evidence.blockNumber);
    assert.ok(block > previousBlock);
    previousBlock = block;
    assert.equal(evidence.chainId, 97);
    assert.equal(evidence.account, ACCOUNT);
    assert.match(evidence.blockHash, /^0x[0-9a-f]{64}$/u);
    assert.equal(evidence.marketsEnumerated, 46);
    assert.equal(evidence.positions.length, 1);
    const adjusted = evidence.positions.reduce(
      (sum, position) => sum + BigInt(position.adjustedCollateralValueUsdE18Raw),
      0n
    );
    const debt = evidence.positions.reduce(
      (sum, position) => sum + BigInt(position.debtValueUsdE18Raw),
      0n
    );
    assert.ok(debt > 0n);
    assert.equal(evidence.adjustedCollateralValueUsdE18Raw, adjusted.toString());
    assert.equal(evidence.debtValueUsdE18Raw, debt.toString());
    assert.equal(evidence.healthFactorE18Raw, ((adjusted * E18) / debt).toString());
    assert.ok(evidence.limitations.some((value) => value.includes("not a transaction")));
    assert.ok(evidence.limitations.some((value) => value.includes("authorization")));
  }
});

test("manifest joins three bounded raw artifacts with two-provider read-only agreement", () => {
  for (const [index, { reference, bytes, artifact }] of captures.entries()) {
    assert.equal(bytes.at(-1), 0x0a);
    assert.ok(bytes.byteLength < 1_000_000);
    assert.equal(bytes.byteLength, reference.bytes);
    assert.equal(sha256(bytes), reference.sha256);
    assert.equal(artifact.schemaVersion, "proofera-termix-venus-development-window-block-v1.0.0");
    assert.equal(artifact.status, "DEVELOPMENT_READ_ONLY");
    assert.equal(artifact.publishable, false);
    assert.equal(artifact.termixRunStatus, "NOT_RUN");
    assert.equal(artifact.sourceCommit, SOURCE_COMMIT);
    assert.equal(artifact.sourceCommitClean, true);
    assert.deepEqual(artifact.evidence, manifest.evidenceWindow[index]);
    assert.equal(artifact.evidence.blockNumber, reference.blockNumber);
    assert.equal(artifact.evidence.blockHash, reference.blockHash);
    assert.equal(artifact.providerCaptures.length, 2);
    assert.deepEqual(
      new Set(artifact.providerCaptures.map(({ observation }) => observation.publicSourceUrl)),
      PROVIDERS
    );
    assert.deepEqual(
      comparableObservation(artifact.providerCaptures[0].observation),
      comparableObservation(artifact.providerCaptures[1].observation)
    );
    for (const providerCapture of artifact.providerCaptures) {
      assert.equal(
        sha256(JSON.stringify(providerCapture.transcript)),
        providerCapture.transcriptSha256
      );
      assert.equal(
        Buffer.byteLength(JSON.stringify(providerCapture.transcript)),
        providerCapture.transcriptBytes
      );
      for (const request of rpcRequests(providerCapture.transcript)) {
        assert.ok(
          ["eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_call"].includes(
            request.method
          )
        );
      }
    }
  }
  const serialized = captures.map(({ bytes }) => bytes.toString("utf8")).join("");
  assert.doesNotMatch(serialized, /eth_sendRawTransaction|eth_sendTransaction/u);
  assert.doesNotMatch(
    serialized,
    /private[_-]?key|mnemonic|seed[_-]?phrase|wallet[_-]?password|signed[_-]?transaction/iu
  );
});
