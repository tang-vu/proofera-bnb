import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./generate-termix-reviewer-packet-v3.mjs", import.meta.url),
  "utf8"
);

test("TermiX packet v3 supersedes invalid v2 and binds protected materialization", () => {
  assert.match(source, /evidence\/termix\/final-pairs\//u);
  assert.match(source, /materialize-termix-independent-review\.ts/u);
  assert.match(source, /protectedFinalReport\.ts/u);
  assert.match(source, /termix-typescript-loader\.mjs/u);
  assert.match(source, /protected projection/u);
  assert.match(source, /SUPERSEDED_PATH/u);
  assert.match(source, /supersessionReason/u);
  assert.match(source, /flag: "wx"/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /sendTransaction|signTransaction|privateKey/u);
});

test("TermiX packet v3 generator rejects missing invocation before Git or output", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-termix-reviewer-packet-v3.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TERMIX_REVIEW_PACKET_V3_EXACT_INVOCATION_REQUIRED/u);
  assert.doesNotMatch(result.stderr, /TERMIX_REVIEW_PACKET_V3_HEAD_MISMATCH/u);
});
