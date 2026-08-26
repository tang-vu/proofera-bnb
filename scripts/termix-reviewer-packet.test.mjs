import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = "evidence/termix/reviewer-packets/20260822-v1/manifest.json";
const TASK_IDS = [
  "pancake-lp-range-decision",
  "autonomous-session-permission-audit",
  "venus-health-factor-decision"
];
const execFileAsync = promisify(execFile);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function bytes(path) {
  return readFile(resolve(ROOT, ...path.split("/")));
}

async function json(path) {
  return JSON.parse(await bytes(path));
}

test("reviewer packet binds three unverified pairs without inventing independence", async () => {
  const manifest = await json(MANIFEST_PATH);
  const { stdout: packetCommitOutput } = await execFileAsync(
    "git",
    ["log", "-1", "--format=%H", "--", MANIFEST_PATH],
    { cwd: ROOT, encoding: "utf8", windowsHide: true }
  );
  const packetCommit = packetCommitOutput.trim();
  assert.match(packetCommit, /^[0-9a-f]{40}$/u);
  assert.equal(manifest.schemaVersion, "proofera-termix-reviewer-packet-v1.0.0");
  assert.equal(manifest.state, "awaiting_independent_reviewer");
  assert.equal(manifest.independentReviewComplete, false);
  assert.equal(manifest.publishable, false);
  assert.deepEqual(
    manifest.tasks.map(({ taskId }) => taskId),
    TASK_IDS
  );
  assert.equal(new Set(manifest.tasks.map(({ pairId }) => pairId)).size, 3);

  for (const task of manifest.tasks) {
    const [pairBytes, reviewBytes] = await Promise.all([
      bytes(task.inputPairPath),
      bytes(task.selfReviewPath)
    ]);
    assert.equal(sha256(pairBytes), task.inputPairBytesSha256);
    assert.equal(sha256(reviewBytes), task.selfReviewBytesSha256);
    const pair = JSON.parse(pairBytes);
    const review = JSON.parse(reviewBytes);
    assert.equal(pair.pairId, task.pairId);
    assert.equal(pair.agentRun.declaration.task.taskId, task.taskId);
    assert.equal(pair.manualRun.declaration.task.taskId, task.taskId);
    assert.equal(pair.agentRun.evidenceState.state, "unverified");
    assert.equal(pair.manualRun.evidenceState.state, "unverified");
    assert.equal(review.pairSha256, task.inputPairLogicalSha256);
    assert.equal(review.checks.secondReviewerIndependent, false);
    assert.equal(task.selfReviewIndependent, false);

    for (const evidence of task.evidence) {
      const evidenceBytes = await bytes(evidence.path);
      assert.equal(sha256(evidenceBytes), evidence.sha256, evidence.path);
      if (evidence.payloadSha256 !== undefined) {
        assert.equal(evidenceBytes.at(-1), 0x0a);
        assert.equal(sha256(evidenceBytes.subarray(0, -1)), evidence.payloadSha256);
      }
    }

    await assert.rejects(
      execFileAsync(
        "git",
        ["cat-file", "-e", `${packetCommit}:${task.reviewerMustProduce.verifiedPairPath}`],
        { cwd: ROOT, encoding: "utf8", windowsHide: true }
      )
    );
    await assert.rejects(
      execFileAsync(
        "git",
        ["cat-file", "-e", `${packetCommit}:${task.reviewerMustProduce.adjudicationPath}`],
        { cwd: ROOT, encoding: "utf8", windowsHide: true }
      )
    );
  }
});

test("review contract and final compiler use the exact retained Venus task ID", async () => {
  const manifest = await json(MANIFEST_PATH);
  const [schemaBytes, compilerBytes, finalReportSource] = await Promise.all([
    bytes(manifest.reviewContract.adjudicationSchemaPath),
    bytes(manifest.reviewContract.finalCompilerPath),
    readFile(resolve(ROOT, "packages/benchmarks/src/finalReport.ts"), "utf8")
  ]);
  assert.equal(sha256(schemaBytes), manifest.reviewContract.adjudicationSchemaSha256);
  assert.equal(sha256(compilerBytes), manifest.reviewContract.finalCompilerSha256);
  assert.match(finalReportSource, /"venus-health-factor-decision"/u);
  assert.doesNotMatch(finalReportSource, /"venus-health-factor-replay"/u);
});
