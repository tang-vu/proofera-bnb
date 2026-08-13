import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { format, resolveConfig } from "prettier";

import {
  REPOSITORY_ROOT,
  REVIEW_CONSTANTS,
  buildEvidence,
  canonicalJson,
  verifyEvidenceObject
} from "./review-lib.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/pancake-initializer-review/generate.mjs --source-root <path> --write",
    "  node scripts/pancake-initializer-review/generate.mjs --source-root <path> --check"
  ].join("\n");
}

function parseArguments(argv) {
  if (
    argv.length !== 3 ||
    argv[0] !== "--source-root" ||
    !["--write", "--check"].includes(argv[2])
  ) {
    throw new Error(usage());
  }
  if (argv[1].trim() === "") throw new Error("Source root must not be empty.");
  return {
    mode: argv[2] === "--write" ? "write" : "check",
    sourceRoot: argv[1]
  };
}

async function main() {
  const { mode, sourceRoot } = parseArguments(process.argv.slice(2));
  const evidence = buildEvidence(sourceRoot);
  verifyEvidenceObject(evidence);
  const outputPath = path.join(REPOSITORY_ROOT, REVIEW_CONSTANTS.artifactPath);
  const prettierConfig = (await resolveConfig(outputPath)) ?? {};
  const serialized = await format(canonicalJson(evidence), {
    ...prettierConfig,
    filepath: outputPath
  });

  if (mode === "write") {
    writeFileSync(outputPath, serialized, { encoding: "utf8" });
    process.stdout.write(`wrote ${REVIEW_CONSTANTS.artifactPath}\n`);
    return;
  }

  const committed = readFileSync(outputPath, "utf8");
  if (committed !== serialized) {
    throw new Error(
      `Committed initializer review differs from deterministic output: ${REVIEW_CONSTANTS.artifactPath}`
    );
  }
  process.stdout.write(`verified ${REVIEW_CONSTANTS.artifactPath}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
