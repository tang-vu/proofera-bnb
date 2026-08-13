import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";

import {
  REPOSITORY_ROOT,
  REVIEW_REQUEST_CONSTANTS,
  buildReviewRequest,
  verifyReviewRequestObject
} from "./review-request-lib.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/pancake-pool-external-review-request/generate.mjs --check",
    "  node scripts/pancake-pool-external-review-request/generate.mjs --write"
  ].join("\n");
}

function parseMode(arguments_) {
  if (arguments_.length !== 1 || !["--check", "--write"].includes(arguments_[0])) {
    throw new Error(usage());
  }
  return arguments_[0];
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const evidence = buildReviewRequest();
  verifyReviewRequestObject(evidence);
  const outputPath = resolve(REPOSITORY_ROOT, REVIEW_REQUEST_CONSTANTS.artifactPath);
  const prettierConfig = (await resolveConfig(outputPath)) ?? {};
  const serialized = await format(`${JSON.stringify(evidence, null, 2)}\n`, {
    ...prettierConfig,
    filepath: outputPath
  });

  if (mode === "--write") {
    writeFileSync(outputPath, serialized, { encoding: "utf8" });
    process.stdout.write(`wrote ${REVIEW_REQUEST_CONSTANTS.artifactPath}\n`);
    return;
  }

  if (readFileSync(outputPath, "utf8") !== serialized) {
    throw new Error(
      `Committed external-review request differs from deterministic output: ${REVIEW_REQUEST_CONSTANTS.artifactPath}`
    );
  }
  process.stdout.write(`verified ${REVIEW_REQUEST_CONSTANTS.artifactPath}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
