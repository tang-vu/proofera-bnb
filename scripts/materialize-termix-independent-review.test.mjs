import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./materialize-termix-independent-review.ts", import.meta.url),
  "utf8"
);
const schema = await readFile(
  new URL("../packages/benchmarks/src/independentReview.ts", import.meta.url),
  "utf8"
);

test("TermiX materializer is create-only and validates the protected derivative", () => {
  assert.match(source, /materializeTermixVerifiedPair\(/u);
  assert.match(source, /assertTermixAdjudicationBinding\(/u);
  assert.match(source, /sameComparison\(before, after\)/u);
  assert.match(source, /flag: "wx"/u);
  assert.match(source, /TERMIX_REVIEW_CONTRACT_DRIFT/u);
  assert.match(source, /TERMIX_REVIEW_EVIDENCE_DRIFT/u);
  assert.match(schema, /termixProtectedPairProjection/u);
  assert.match(schema, /TERMIX_VERIFIED_PAIR_PROTECTED_PROJECTION_DRIFT/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /sendTransaction|signTransaction|privateKey/u);
});

test("TermiX materializer rejects a missing exact invocation before Git or output", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--conditions=react-server",
      "--experimental-loader",
      "./scripts/termix-typescript-loader.mjs",
      "./scripts/materialize-termix-independent-review.ts"
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TERMIX_REVIEW_MATERIALIZER_EXACT_INVOCATION_REQUIRED/u);
  assert.doesNotMatch(result.stderr, /TERMIX_REVIEW_HEAD_MISMATCH/u);
});
