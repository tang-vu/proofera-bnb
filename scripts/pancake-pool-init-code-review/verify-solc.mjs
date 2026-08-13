import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REVIEW_CONSTANTS,
  compareSolcOutputToSnapshot,
  sha256File,
  verifyCommittedReview
} from "./review-lib.mjs";
import { keccak256Bytes } from "../pancake-selector-review/review-lib.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIRECTORY, "..", "..");
const VERIFY_FLAG = "--verify-retained-standard-json";

function fail(message) {
  throw new Error(`Pancake retained solc verification failed closed: ${message}`);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relativePath), "utf8"));
}

function compile(solcPath, input) {
  const result = spawnSync(solcPath, ["--standard-json"], {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 48 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error) fail(`compiler could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`compiler exited ${result.status}: ${result.stderr.trim()}`);
  const output = JSON.parse(result.stdout);
  const fatal = (output.errors ?? []).filter(({ severity }) => severity === "error");
  if (fatal.length > 0) fail(`compiler returned ${fatal.length} error(s)`);
  return output;
}

function main() {
  const [flag, rawSolcPath] = process.argv.slice(2);
  if (process.argv.slice(2).length !== 2 || flag !== VERIFY_FLAG) {
    fail(`expected exactly: ${VERIFY_FLAG} <pinned-solc-path>`);
  }
  const solcPath = resolve(rawSolcPath);
  if (sha256File(solcPath) !== REVIEW_CONSTANTS.compiler.sha256) {
    fail("compiler binary SHA-256 drifted");
  }
  if (keccak256Bytes(readFileSync(solcPath)) !== REVIEW_CONSTANTS.compiler.keccak256) {
    fail("compiler binary Keccak-256 drifted");
  }
  const poolInput = readJson(REVIEW_CONSTANTS.evidencePaths.poolAndDeployerInput);
  const factoryInput = readJson(REVIEW_CONSTANTS.evidencePaths.factoryInput);
  const snapshot = readJson(REVIEW_CONSTANTS.evidencePaths.artifacts);
  compareSolcOutputToSnapshot(compile(solcPath, poolInput), snapshot, ["pool", "poolDeployer"]);
  compareSolcOutputToSnapshot(compile(solcPath, factoryInput), snapshot, ["factory"]);
  const review = verifyCommittedReview(REPO_ROOT);
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "pass_exact_retained_standard_json_reproduction",
        compiler: REVIEW_CONSTANTS.compiler.longVersion,
        poolCreationKeccak256: review.artifacts.pool.creationKeccak256,
        poolDeployerRuntimeKeccak256: review.artifacts.poolDeployer.runtimeTemplateKeccak256,
        factoryPatchedRuntimeKeccak256: REVIEW_CONSTANTS.expected.factoryPatchedRuntimeKeccak256
      },
      null,
      2
    )}\n`
  );
}

main();
