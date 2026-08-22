import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./compile-termix-permission-audit-pair.ts", import.meta.url),
  "utf8"
);
const loader = await readFile(new URL("./termix-typescript-loader.mjs", import.meta.url), "utf8");

test("permission-audit pair compiler is create-only and keeps independent review open", () => {
  assert.match(source, /--compile-exact-permission-audit-pair/u);
  assert.match(source, /EXPECTED_ANSWER_KEY_SHA256/u);
  assert.match(source, /verifyPublishedCleanHead\(\)/u);
  assert.match(source, /open\(path, "wx"/u);
  assert.match(source, /buildPermissionAuditPair/u);
  assert.doesNotMatch(source, /secondReviewerIndependent:\s*true/u);
  assert.doesNotMatch(source, /publishableClaim:\s*true/u);
  assert.match(loader, /scripts\/compile-termix-permission-audit-pair\.ts/u);
});
