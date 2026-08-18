import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("../evidence/termix/hire-receipts/125715654-7fa5ad3e.json", import.meta.url);
const bytes = await readFile(path);
const evidence = JSON.parse(bytes.toString("utf8"));

test("retained hire evidence binds three finalized paid testnet hires without performance claims", () => {
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "8a79415f0ab07ebab13d1174ca033536a53b55497fd167202b844e30a59072a8"
  );
  assert.equal(evidence.chainId, 97);
  assert.equal(evidence.finalBlock.number, "125715654");
  assert.equal(evidence.finalBlock.finalityDepth, "12");
  assert.equal(evidence.hires.length, 3);
  assert.equal(evidence.economics.totalHirePaymentWei, "30000000000000");
  assert.equal(evidence.claims.contractDeployed, true);
  assert.equal(evidence.claims.threePaidHiresFinalized, true);
  assert.equal(evidence.claims.termixRunsCompleted, false);
  assert.equal(evidence.claims.taskCompletion, false);
  assert.equal(evidence.claims.agentPerformance, false);
});
