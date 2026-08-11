import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildEvidence, canonicalJson } from "./review-lib.mjs";

const EXPECTED_OUTPUT = path.resolve("evidence/development/pancake-v3-selector-paths");

function usage() {
  return [
    "Usage:",
    "  node scripts/pancake-selector-review/generate.mjs --source-root <path> --write",
    "  node scripts/pancake-selector-review/generate.mjs --source-root <path> --check",
    "",
    "The source root must be the detached official PancakeSwap checkout with the retained",
    "compile-only artifacts-proofera build. This command performs no network or wallet action."
  ].join("\n");
}

function parseArguments(argv) {
  let sourceRoot = null;
  let mode = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source-root") {
      if (sourceRoot !== null || index + 1 >= argv.length) throw new Error(usage());
      sourceRoot = argv[index + 1];
      index += 1;
    } else if (argument === "--write" || argument === "--check") {
      if (mode !== null) throw new Error(usage());
      mode = argument.slice(2);
    } else {
      throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
    }
  }
  if (sourceRoot === null || mode === null) throw new Error(usage());
  return { mode, sourceRoot };
}

function main() {
  const { mode, sourceRoot } = parseArguments(process.argv.slice(2));
  const evidence = buildEvidence(sourceRoot);
  if (mode === "write") mkdirSync(EXPECTED_OUTPUT, { recursive: true });
  for (const [file, value] of evidence) {
    const outputPath = path.join(EXPECTED_OUTPUT, file);
    const expected = canonicalJson(value);
    if (mode === "write") {
      writeFileSync(outputPath, expected, { encoding: "utf8", flag: "w" });
    } else {
      if (!existsSync(outputPath)) throw new Error(`Missing generated artifact: ${outputPath}`);
      const actual = readFileSync(outputPath, "utf8");
      if (actual !== expected) throw new Error(`Generated artifact drifted: ${outputPath}`);
    }
  }
  process.stdout.write(
    `${mode === "write" ? "wrote" : "verified"} ${evidence.size} deterministic selector-review artifacts\n`
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
