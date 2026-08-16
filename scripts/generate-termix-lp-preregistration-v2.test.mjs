import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./generate-termix-lp-preregistration-v2.mjs", import.meta.url),
  "utf8"
);

test("LP v2 preregistration generator is offline, versioned and create-only", () => {
  assert.match(source, /termix-task-01-lp-range-v2/u);
  assert.match(source, /superseded-preregistrations\/task-01-lp-range-v1\.json/u);
  assert.match(source, /preregistrations\/task-01-lp-range-v2\.json/u);
  assert.match(source, /flag: "wx"/u);
  assert.match(source, /status: "NOT RUN"/u);
  assert.match(source, /publishable: false/u);
  assert.doesNotMatch(source, /fetch\(|https\.request|sendTransaction|privateKey/u);
});
