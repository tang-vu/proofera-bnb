import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./generate-termix-agent-invocations.mjs", import.meta.url),
  "utf8"
);

test("agent invocation generator is create-only and fixes agent-first declarations", () => {
  assert.match(source, /open\(absolute, "wx"/u);
  assert.match(source, /order\.randomness\.runOrder\.join\(","\) !== "agent,manual"/u);
  assert.match(source, /proofera-termix-timed-runner-v1\.0\.0/u);
  assert.match(source, /125715654-7fa5ad3e\.json/u);
  assert.match(source, /6e657638c684-125722978\.run-order\.json/u);
  assert.match(source, /selectedLane\(process\.argv\.slice\(2\)\)/u);
  assert.match(source, /TERMIX_AGENT_INVOCATION_LANE_INVALID/u);
  assert.doesNotMatch(source, /fetch\(|eth_send|privateKey|WALLET_PASSWORD/u);
});

for (const retained of [
  {
    path: "../evidence/termix/invocations/pancake-lp-agent-20260818-v1.canonical-json",
    sha256: "b1f998af1fe21ee4e23cadd9aeac884dbe70b3f1a4418107608c8e41c315de6d",
    digestKey: "inputBundleSha256",
    runId: "pancake-lp-agent-20260818-v1",
    transactionHash: "0x068b450a9867d220cc1eda156e9eb3cb6b8037901a7f7feaaa126aa7e1169747"
  },
  {
    path: "../evidence/termix/invocations/pancake-lp-agent-20260818-v2.canonical-json",
    sha256: "7a487729eccf1e1198dece262a053a7c218f3ecb0f516a5901c8152c0d7dd6b5",
    digestKey: "inputBundleSha256",
    runId: "pancake-lp-agent-20260818-v2",
    transactionHash: "0x068b450a9867d220cc1eda156e9eb3cb6b8037901a7f7feaaa126aa7e1169747"
  },
  {
    path: "../evidence/termix/invocations/pancake-lp-agent-20260818-v3.canonical-json",
    sha256: "7c92b324843b1bfa9478cb767ba4ded8784195218aa7ecbff761088859f0cbd8",
    digestKey: "inputBundleSha256",
    runId: "pancake-lp-agent-20260818-v3",
    transactionHash: "0x068b450a9867d220cc1eda156e9eb3cb6b8037901a7f7feaaa126aa7e1169747"
  },
  {
    path: "../evidence/termix/invocations/venus-health-agent-20260818-v1.canonical-json",
    sha256: "3cbbaf5ae6edb93f8efd64283540b6ba13971dc367391293a4106f8ccfeda8be",
    digestKey: "requestInputSha256",
    runId: "venus-health-agent-20260818-v1",
    transactionHash: "0xfa53e2c826d574bf12835e34e7396e6a362e509b76682b4d468b4db86cbb4ea6"
  }
]) {
  test(`retained invocation ${retained.runId} binds the exact paid hire`, async () => {
    const bytes = await readFile(new URL(retained.path, import.meta.url));
    const invocation = JSON.parse(bytes.toString("utf8"));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), retained.sha256);
    assert.match(invocation[retained.digestKey], /^[0-9a-f]{64}$/u);
    assert.equal(invocation.timedRunRequest.runId, retained.runId);
    assert.equal(invocation.timedRunRequest.method.kind, "agent");
    assert.equal(invocation.timedRunRequest.hireReceipt.transactionHash, retained.transactionHash);
  });
}
