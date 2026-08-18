import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const join = JSON.parse(
  readFileSync("evidence/termix/hire-preparations/125626011-actual-execution-join-v1.json", "utf8")
);

test("hire evidence join input binds both exact preparations without claiming receipts", () => {
  assert.equal(join.classification.authorization, false);
  assert.equal(join.classification.preregistration, false);
  assert.equal(join.classification.receiptEvidence, false);
  assert.equal(join.classification.performanceEvidence, false);
  assert.equal(join.preparationProvenance.length, 2);
  const preparations = join.preparationProvenance.map(({ path, sha256 }) => {
    const bytes = readFileSync(path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256);
    return JSON.parse(bytes.toString("utf8"));
  });
  assert.deepEqual(join.deployment, preparations[0].deployment);
  assert.deepEqual(join.hires, [
    preparations[0].hires[0],
    preparations[0].hires[1],
    preparations[1].hires[0]
  ]);
  assert.deepEqual(join.executionTransactions.hires, [
    "0x068b450a9867d220cc1eda156e9eb3cb6b8037901a7f7feaaa126aa7e1169747",
    "0x0ec15407ab12df85e1a50e39f2316033c31aa28bca756bab6f7ac41a14023e6c",
    "0xfa53e2c826d574bf12835e34e7396e6a362e509b76682b4d468b4db86cbb4ea6"
  ]);
});
