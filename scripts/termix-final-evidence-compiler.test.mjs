import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./compile-termix-final-evidence.ts", import.meta.url),
  "utf8"
);
const loader = await readFile(new URL("./termix-typescript-loader.mjs", import.meta.url), "utf8");

test("TermiX final compiler fixes the three verified pair and adjudication boundary", () => {
  assert.match(source, /TERMIX_FINAL_TASK_IDS/u);
  assert.match(source, /summarizePairedBenchmark\(pair\)/u);
  assert.match(source, /TermixIndependentAdjudicationSchema\.parse/u);
  assert.match(source, /verifyAdjudicationEvidence\(adjudication\)/u);
  assert.match(source, /gitText\(\["rev-parse", "origin\/main"\]\)/u);
  assert.match(source, /gitText\(\["status", "--porcelain=v1", "--untracked-files=all"\]\)/u);
  assert.match(source, /evidence\/submission\/final\/termix\//u);
  assert.match(source, /paired-report\.json/u);
  assert.match(source, /raw-runs\.json/u);
  assert.match(source, /adjudication\.json/u);
  assert.match(source, /flag: "wx"/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.match(loader, /compile-termix-final-evidence\.ts/u);
});

test("TermiX final compiler rejects a missing exact invocation before input or Git", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--conditions=react-server",
      "--experimental-loader",
      "./scripts/termix-typescript-loader.mjs",
      "./scripts/compile-termix-final-evidence.ts"
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8", input: "" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TERMIX_FINAL_EXACT_INVOCATION_REQUIRED/u);
  assert.doesNotMatch(result.stderr, /TERMIX_FINAL_STDIN_REQUIRED/u);
});

test("TermiX final compiler rejects empty stdin before release inspection or output", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--conditions=react-server",
      "--experimental-loader",
      "./scripts/termix-typescript-loader.mjs",
      "./scripts/compile-termix-final-evidence.ts",
      "--compile-exact-termix-final-evidence",
      "--source-base-commit",
      "a".repeat(40)
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8", input: "" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TERMIX_FINAL_STDIN_REQUIRED/u);
  assert.doesNotMatch(result.stderr, /TERMIX_FINAL_HEAD_MISMATCH/u);
});

test("TermiX final compiler rejects non-UTF-8 stdin before release inspection", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--conditions=react-server",
      "--experimental-loader",
      "./scripts/termix-typescript-loader.mjs",
      "./scripts/compile-termix-final-evidence.ts",
      "--compile-exact-termix-final-evidence",
      "--source-base-commit",
      "a".repeat(40)
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8", input: Buffer.from([0xff]) }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TERMIX_FINAL_STDIN_UTF8_INVALID/u);
  assert.doesNotMatch(result.stderr, /TERMIX_FINAL_HEAD_MISMATCH/u);
});
