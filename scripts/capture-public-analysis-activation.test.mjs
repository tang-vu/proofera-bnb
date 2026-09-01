import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../apps/web/scripts/capture-public-analysis-activation.mjs", import.meta.url),
  "utf8"
);
const retainedRelease = "f25a67daa0292b5a04c142a42606888f7ec2b8e6";
const retainedDirectory = new URL(
  `../evidence/submission/public-analysis-activation/${retainedRelease}/`,
  import.meta.url
);
const retainedManifestBytes = await readFile(new URL("manifest.json", retainedDirectory));
const retainedManifest = JSON.parse(retainedManifestBytes.toString("utf8"));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("public analysis activation capture is exact-release gated and create-only", () => {
  assert.match(source, /--capture-public-analysis-activation/u);
  assert.match(source, /origin\/main/u);
  assert.match(source, /PUBLIC_ANALYSIS_ACTIVATION_WORKTREE_DIRTY/u);
  assert.match(source, /flag: "wx"/u);
  assert.equal(source.match(/await writeFile\(/gu)?.length, 1);
  assert.match(source, /await mkdir\(outputDirectory\)/u);
});

test("capture traverses four categories and preserves the no-capital boundary", () => {
  for (const category of [
    "lp-rebalancing",
    "grid-trading",
    "yield-optimisation",
    "health-factor-monitoring"
  ]) {
    assert.match(source, new RegExp(`category: "${category}"`, "u"));
  }
  assert.match(source, /Activate analysis service/u);
  assert.match(source, /Activate & run analysis service/u);
  assert.match(source, /data-live-evidence-terminal-state/u);
  assert.match(source, /CURRENT_EVIDENCE_UNAVAILABLE/u);
  assert.match(source, /evidenceFactLabels/u);
  assert.match(source, /currentEvidenceAppliedToAnalyzer: false/u);
  assert.match(source, /screenshotMetadata/u);
  assert.match(source, /height: 1400/u);
  assert.match(source, /scrollIntoView\(\{ block: "center" \}\)/u);
  assert.match(source, /readyForAnalysisActivation/u);
  assert.match(source, /readyForCapitalActivation/u);
  assert.match(source, /capitalExecutionPerformed: false/u);
  assert.match(source, /transactionSubmitted: false/u);
  assert.match(source, /walletAccessed: false/u);
});

test("retained v2 journey binds four available evidence panels and four completed service runs", async () => {
  assert.equal(
    sha256(retainedManifestBytes),
    "fbbd92fd07509eea9de0bdfa43cabdc2310f4deae7101f6cb379db9f70a1cd37"
  );
  assert.equal(retainedManifest.schemaVersion, "proofera-public-analysis-activation-v2.0.0");
  assert.equal(retainedManifest.sourceCommit, retainedRelease);
  assert.deepEqual(retainedManifest.classification, {
    boundedHostOriginObservation: true,
    currentEvidenceObserved: true,
    currentEvidenceAppliedToAnalyzer: false,
    analysisServiceActivated: true,
    capitalExecutionPerformed: false,
    transactionSubmitted: false,
    walletAccessed: false,
    organizerEligibilityDecision: false,
    submissionCompleted: false
  });
  assert.deepEqual(retainedManifest.journey, [
    "land",
    "find",
    "inspect_current_evidence",
    "understand",
    "activate_analysis",
    "inspect_run"
  ]);
  assert.equal(retainedManifest.categoryParity.required, 4);
  assert.equal(retainedManifest.categoryParity.observed, 4);
  assert.equal(retainedManifest.runs.length, 4);

  for (const run of retainedManifest.runs) {
    assert.equal(run.currentEvidence.status, "available");
    assert.equal(run.currentEvidence.facts.length, 5);
    assert.equal(run.currentEvidence.fallbackApplied, false);
    assert.equal(run.currentEvidence.capitalExecutionEnabled, false);
    assert.equal(run.status, "completed");
    assert.equal(run.boundary.chainId, 97);
    assert.equal(run.boundary.executionEnabled, false);
    assert.equal(run.boundary.walletAccessed, false);
    assert.equal(run.boundary.transactionSubmitted, false);
    assert.equal(run.boundary.serverPersistence, false);
    assert.match(run.runId, /^[A-Za-z0-9-]{8,120}$/u);
    assert.match(run.responseSha256, /^[0-9a-f]{64}$/u);

    for (const screenshot of [run.currentEvidence.screenshot, run.screenshot]) {
      const screenshotBytes = await readFile(new URL(screenshot.file, retainedDirectory));
      assert.equal(screenshotBytes.byteLength, screenshot.bytes);
      assert.equal(sha256(screenshotBytes), screenshot.sha256);
      assert.ok(screenshot.bytes > 40_000);
    }
  }

  const health = retainedManifest.runs.find(
    ({ category }) => category === "health-factor-monitoring"
  );
  assert.ok(health);
  assert.deepEqual(
    health.currentEvidence.facts.find(({ label }) => label === "Health factor"),
    { label: "Health factor", value: "UNKNOWN / not computed" }
  );
});
