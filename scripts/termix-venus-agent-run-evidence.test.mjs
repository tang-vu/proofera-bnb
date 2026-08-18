import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bytes = await readFile(
  new URL(
    "../evidence/termix/runs/venus-health/venus-health-agent-20260818-v1.json",
    import.meta.url
  )
);
const prettierIgnore = await readFile(new URL("../.prettierignore", import.meta.url), "utf8");
const capture = JSON.parse(bytes.toString("utf8"));
const output = JSON.parse(capture.output.body);

test("retained Venus agent-first capture binds timing, hire and bounded output", () => {
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "6f3037fce19c42b6d6ee2eb8142fecc17febb3e07e1800476842939a2906540f"
  );
  assert.equal(capture.runId, "venus-health-agent-20260818-v1");
  assert.equal(capture.methodKind, "agent");
  assert.equal(capture.boundaries.repositoryWasCleanBeforeStart, true);
  assert.equal(capture.boundaries.declarationDigestMatched, true);
  assert.equal(capture.boundaries.hireReceiptWasVerifiedBeforeStart, true);
  assert.equal(
    capture.hireReceipt.transactionHash,
    "0xfa53e2c826d574bf12835e34e7396e6a362e509b76682b4d468b4db86cbb4ea6"
  );
  assert.equal(capture.timing.monotonicDurationNanoseconds, "2517940100");
  assert.equal(capture.timing.activeDurationNanoseconds, "2513993700");
  assert.equal(capture.apiResponses.length, 1);
  assert.equal(output.decision, "hold");
  assert.equal(output.executionEnabled, false);
  assert.equal(output.activationEligible, false);
  assert.match(
    prettierIgnore,
    /^evidence\/termix\/runs\/venus-health\/venus-health-agent-20260818-v1\.json$/mu
  );
  assert.doesNotMatch(prettierIgnore, /^evidence\/termix\/runs\/\*\*/mu);
});
