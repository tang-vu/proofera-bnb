import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./compile-termix-observational-pairs.ts", import.meta.url),
  "utf8"
);
const loader = await readFile(new URL("./termix-typescript-loader.mjs", import.meta.url), "utf8");

test("observational pair compiler is release-bound, create-only and non-publishable", () => {
  assert.match(source, /--compile-exact-observational-pairs/u);
  assert.match(source, /verifyPublishedCleanHead\(\)/u);
  assert.match(source, /open\(path, "wx"/u);
  assert.match(source, /buildPancakeLpPair/u);
  assert.match(source, /buildVenusHealthPair/u);
  assert.doesNotMatch(source, /secondReviewerIndependent:\s*true/u);
  assert.doesNotMatch(source, /publishableClaim:\s*true/u);
  assert.match(loader, /scripts\/compile-termix-observational-pairs\.ts/u);
});
