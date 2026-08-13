import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { format, resolveConfig } from "prettier";

import {
  REPOSITORY_ROOT,
  REVIEW_CONSTANTS,
  buildReviewDecision,
  verifyReviewDecisionObject
} from "./review-lib.mjs";

function usage() {
  return [
    "Usage:",
    `  node scripts/pancake-pool-owner-designated-review/generate.mjs --release-commit ${REVIEW_CONSTANTS.releaseCommit} --check`,
    `  node scripts/pancake-pool-owner-designated-review/generate.mjs --release-commit ${REVIEW_CONSTANTS.releaseCommit} --write`
  ].join("\n");
}

function parseArguments(arguments_) {
  if (
    arguments_.length !== 3 ||
    arguments_[0] !== "--release-commit" ||
    !/^[a-f0-9]{40}$/u.test(arguments_[1] ?? "") ||
    !["--check", "--write"].includes(arguments_[2])
  ) {
    throw new Error(usage());
  }
  return { releaseCommit: arguments_[1], mode: arguments_[2] };
}

async function main() {
  const { releaseCommit, mode } = parseArguments(process.argv.slice(2));
  const decision = buildReviewDecision(releaseCommit);
  verifyReviewDecisionObject(decision, releaseCommit);
  const outputPath = resolve(REPOSITORY_ROOT, REVIEW_CONSTANTS.artifactPath);
  const prettierConfig = (await resolveConfig(outputPath)) ?? {};
  const serialized = await format(`${JSON.stringify(decision, null, 2)}\n`, {
    ...prettierConfig,
    filepath: outputPath
  });

  if (mode === "--write") {
    writeFileSync(outputPath, serialized, { encoding: "utf8" });
    process.stdout.write(`wrote ${REVIEW_CONSTANTS.artifactPath}\n`);
    return;
  }
  if (readFileSync(outputPath, "utf8") !== serialized) {
    throw new Error(`Committed internal review differs from deterministic output.`);
  }
  process.stdout.write(`verified ${REVIEW_CONSTANTS.artifactPath}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
