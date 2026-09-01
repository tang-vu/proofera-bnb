import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../apps/web/scripts/capture-public-analysis-activation.mjs", import.meta.url),
  "utf8"
);

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
  assert.match(source, /readyForAnalysisActivation/u);
  assert.match(source, /readyForCapitalActivation/u);
  assert.match(source, /capitalExecutionPerformed: false/u);
  assert.match(source, /transactionSubmitted: false/u);
  assert.match(source, /walletAccessed: false/u);
});
