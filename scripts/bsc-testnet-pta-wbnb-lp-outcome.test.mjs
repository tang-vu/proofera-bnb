import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const collectorPath = resolve(
  repositoryRoot,
  "scripts/capture-bsc-testnet-pta-wbnb-lp-outcome.mjs"
);
const outcomeDirectory = resolve(repositoryRoot, "evidence/pancake/runs/pta-wbnb-outcomes");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("PTA/WBNB outcome collector is exact, dual-provider, read-only and create-only", async () => {
  const source = await readFile(collectorPath, "utf8");
  assert.match(source, /--capture-exact-pta-wbnb-lp-outcome/u);
  assert.match(source, /--source-commit/u);
  assert.match(source, /https:\/\/data-seed-prebsc-2-s2\.binance\.org:8545/u);
  assert.match(source, /https:\/\/bsc-testnet-rpc\.publicnode\.com/u);
  assert.match(source, /eth_call/u);
  assert.match(source, /requireCanonical: true/u);
  assert.match(source, /writeFile\(outputPath, outputBytes, \{ flag: "wx" \}\)/u);
  assert.doesNotMatch(source, /eth_sendRawTransaction|privateKey|keystore|decrypt/u);
});

test("retained PTA/WBNB outcomes preserve bounded non-benefit claims", async () => {
  const entries = (await readdir(outcomeDirectory)).filter((entry) => entry.endsWith(".json"));
  for (const entry of entries) {
    const bytes = await readFile(resolve(outcomeDirectory, entry));
    const evidence = JSON.parse(bytes.toString("utf8"));
    assert.equal(evidence.schemaVersion, "proofera-bsc-testnet-pta-wbnb-lp-outcome-v1.0.0");
    assert.equal(evidence.status, "bounded_outcome_observed");
    assert.equal(evidence.identity.chainId, 97);
    assert.equal(evidence.classification.readOnly, true);
    assert.equal(evidence.classification.transactionAuthorized, false);
    assert.equal(evidence.classification.transactionBroadcast, false);
    assert.equal(evidence.classification.autonomousAgentExecution, false);
    assert.equal(evidence.classification.benefitDemonstrated, false);
    assert.equal(evidence.window.providerAgreementVerified, true);
    assert.equal(evidence.baselineComparison.comparable, false);
    assert.equal(evidence.baselineComparison.agentAdvantageEstablished, false);
    assert.equal(evidence.providers.length, 2);
    assert.ok(BigInt(evidence.window.durationSeconds) > 0n);
    assert.equal(
      BigInt(evidence.metrics.totalGasCostWei),
      BigInt(evidence.metrics.approvalGasCostWei) + BigInt(evidence.metrics.mintGasCostWei)
    );
    const firstLp = await readFile(
      resolve(repositoryRoot, evidence.sourceEvidence.firstLpArtifact)
    );
    const manual = await readFile(
      resolve(repositoryRoot, evidence.sourceEvidence.manualBaselineArtifact)
    );
    assert.equal(sha256(firstLp), evidence.sourceEvidence.firstLpSha256);
    assert.equal(sha256(manual), evidence.sourceEvidence.manualBaselineSha256);
    assert.doesNotMatch(
      bytes.toString("utf8"),
      /privateKey|rawTransaction|signedTransaction|keystore|password/iu
    );
  }
});
