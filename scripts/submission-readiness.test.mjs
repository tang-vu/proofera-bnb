import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  SUBMISSION_READINESS_SCHEMA_VERSION,
  validateSubmissionReadiness,
  verifySubmissionArtifacts
} from "./submission-readiness-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(repositoryRoot, "evidence/submission/readiness.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const librarySource = await readFile(
  resolve(repositoryRoot, "scripts/submission-readiness-lib.mjs"),
  "utf8"
);

test("submission readiness records all seven objective gates without claiming completion", async () => {
  const readiness = validateSubmissionReadiness(manifest);
  assert.equal(readiness.schemaVersion, SUBMISSION_READINESS_SCHEMA_VERSION);
  assert.equal(readiness.readyForSubmission, false);
  assert.deepEqual(
    readiness.gates.map(({ gateId, state }) => [gateId, state]),
    [
      ["production-release", "deployed_unfrozen"],
      ["agent-registration", "verified"],
      ["altana-lifecycle", "verified"],
      ["pancake-benefit", "read_only_only"],
      ["termix-pairs", "preregistered_only"],
      ["demo", "not_recorded"],
      ["submission", "draft"]
    ]
  );
  assert.equal(readiness.gates[1].blockers.length, 0);
  assert.equal(readiness.gates[2].blockers.length, 0);
  assert.ok(
    readiness.gates.every(({ blockers }, index) => [1, 2].includes(index) || blockers.length > 0)
  );
  await verifySubmissionArtifacts(readiness, repositoryRoot);
});

test("submission readiness cannot turn green by changing only its top-level boolean", () => {
  const altered = structuredClone(manifest);
  altered.readyForSubmission = true;
  assert.throws(
    () => validateSubmissionReadiness(altered),
    /SUBMISSION_READINESS_BOOLEAN_MISMATCH/u
  );
});

test("a verified gate requires its full final-evidence kind set and final paths", () => {
  const missingKinds = structuredClone(manifest);
  missingKinds.gates[0].state = "verified";
  missingKinds.gates[0].blockers = [];
  assert.throws(
    () => validateSubmissionReadiness(missingKinds),
    /SUBMISSION_READINESS_VERIFIED_EVIDENCE_INCOMPLETE/u
  );

  const preparationAsFinal = structuredClone(manifest);
  preparationAsFinal.gates[1].state = "verified";
  preparationAsFinal.gates[1].blockers = [];
  preparationAsFinal.gates[1].artifacts = [
    {
      kind: "registration_receipts",
      path: "evidence/erc8004/preparations/125490457-four-agent-registration-preparation.json",
      sha256: "30e9d4d7e86fd7e2af79913843b847411859afc7a0a6ca1da5ecba64d649ed2d"
    },
    {
      kind: "registry_reobservation",
      path: "evidence/erc8004/preparations/125490457-four-agent-registration-preparation.json",
      sha256: "30e9d4d7e86fd7e2af79913843b847411859afc7a0a6ca1da5ecba64d649ed2d"
    }
  ];
  assert.throws(
    () => validateSubmissionReadiness(preparationAsFinal),
    /SUBMISSION_READINESS_VERIFIED_PATH_INVALID/u
  );
});

test("artifact bytes are digest-bound", async () => {
  const altered = validateSubmissionReadiness({
    ...structuredClone(manifest),
    gates: structuredClone(manifest.gates).map((gate, index) =>
      index === 1
        ? {
            ...gate,
            artifacts: gate.artifacts.map((artifact) => ({ ...artifact, sha256: "0".repeat(64) }))
          }
        : gate
    )
  });
  await assert.rejects(
    () => verifySubmissionArtifacts(altered, repositoryRoot),
    /SUBMISSION_READINESS_ARTIFACT_DIGEST_MISMATCH/u
  );
});

test("final release gate binds tracked HEAD bytes and a clean published commit", () => {
  assert.match(librarySource, /\["ls-files", "--error-unmatch", "--", artifact\.path\]/u);
  assert.match(librarySource, /\["show", `HEAD:\$\{artifact\.path\}`\]/u);
  assert.match(librarySource, /\["status", "--porcelain=v1", "--untracked-files=all"\]/u);
  assert.match(librarySource, /\["rev-parse", "origin\/main"\]/u);
});

test("status mode succeeds honestly while final submission mode fails closed", () => {
  const status = runCheck([]);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /ready-for-submission: false/u);
  assert.equal(status.stderr, "");

  const finalGate = runCheck(["--require-ready"]);
  assert.equal(finalGate.status, 1);
  assert.match(finalGate.stdout, /ready-for-submission: false/u);
  assert.equal(finalGate.stderr, "SUBMISSION_NOT_READY\n");
});

function runCheck(args) {
  return spawnSync(process.execPath, ["scripts/check-submission-readiness.mjs", ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true
  });
}
