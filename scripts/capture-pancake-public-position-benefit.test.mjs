import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./capture-pancake-public-position-benefit.mjs", import.meta.url),
  "utf8"
);

test("public Pancake capture is explicitly gated and create-only", () => {
  assert.match(source, /--capture-public-position-benefit/u);
  assert.match(source, /--position-id/u);
  assert.match(source, /flag: "wx"/u);
  assert.doesNotMatch(source, /eth_sendRawTransaction|eth_sendTransaction|wallet_|privateKey/u);
});

test("public Pancake capture fixes trusted origins and preserves non-claims", () => {
  assert.match(source, /https:\/\/bsc-rpc\.publicnode\.com/u);
  assert.match(source, /https:\/\/proofera-lp\.tangvu\.dev\//u);
  assert.match(source, /ownerControlledByProofEra: false/u);
  assert.match(source, /performanceClaim: false/u);
  assert.match(source, /agentTransactionReceipt: false/u);
  assert.match(source, /requireCanonical: true/u);
});

test("public Pancake capture admits only the reviewed USDT WBNB fee tier", () => {
  assert.match(source, /0x55d398326f99059ff775485246999027b3197955/u);
  assert.match(source, /0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c/u);
  assert.match(source, /fee !== 500/u);
  assert.match(source, /PANCAKE_PUBLIC_CAPTURE_REVIEWED_POSITION_SCOPE_INVALID/u);
  assert.match(source, /negativeHigh = \(1n << 232n\) - 1n/u);
});

test("retained public-position evidence preserves exact read and A2A boundaries", async () => {
  const evidence = JSON.parse(
    await readFile(
      new URL("../evidence/pancake/runs/public-position/116342186-7152618.json", import.meta.url),
      "utf8"
    )
  );
  assert.equal(evidence.schemaVersion, "proofera-pancake-public-position-benefit-v1.0.0");
  assert.deepEqual(evidence.classification, {
    agentRegisteredOrHired: false,
    agentTransactionReceipt: false,
    benefitDemonstrated:
      "Exact-block boundary-risk detection with an explicit refusal to recommend a rebalance when economics are incomplete.",
    executionAuthority: false,
    ownerControlledByProofEra: false,
    performanceClaim: false,
    position: "public third-party BSC mainnet position"
  });
  assert.equal(evidence.source.chainId, 56);
  assert.equal(evidence.source.blockNumber, "116342186");
  assert.equal(
    evidence.source.blockHash,
    "0xe0dae09e27c2b8dfcb8d603794289a7b3b221b078e41169cc61b5233aee385bb"
  );
  assert.equal(evidence.source.positionId, "7152618");
  assert.equal(evidence.source.token0, "0x55d398326f99059ff775485246999027b3197955");
  assert.equal(evidence.source.token1, "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c");
  assert.deepEqual(evidence.exactState, {
    currentTick: -64059,
    fee: 500,
    liquidity: "473868241523090200860021",
    lowerTick: -64060,
    observedAtUtc: "2026-08-16T21:11:48Z",
    tickSpacing: 10,
    upperTick: -64050
  });
  assert.equal(evidence.rpcTranscript.length, 12);
  const readMethods = new Set([
    "eth_chainId",
    "eth_blockNumber",
    "eth_getBlockByNumber",
    "eth_call",
    "eth_getCode"
  ]);
  for (const exchange of evidence.rpcTranscript) {
    assert.ok(readMethods.has(exchange.request.method));
    assert.equal(exchange.request.jsonrpc, "2.0");
    assert.equal(exchange.response.jsonrpc, "2.0");
    assert.equal(exchange.response.id, exchange.request.id);
    assert.equal(exchange.response.error, undefined);
  }
  assert.equal(
    createHash("sha256").update(evidence.agent.requestBody).digest("hex"),
    evidence.agent.requestSha256
  );
  assert.equal(
    createHash("sha256").update(evidence.agent.responseBody).digest("hex"),
    evidence.agent.responseSha256
  );
  const request = JSON.parse(evidence.agent.requestBody);
  const response = JSON.parse(evidence.agent.responseBody);
  assert.equal(request.method, "message/send");
  assert.equal(response.id, request.id);
  assert.equal(evidence.agent.validatedOutput.executionEnabled, false);
  assert.equal(evidence.agent.validatedOutput.inRange, true);
  assert.deepEqual(evidence.agent.validatedOutput.tickBuffers, {
    fromLowerTick: 1,
    toUpperExclusiveTick: 9
  });
  assert.equal(evidence.agent.validatedOutput.decision, "insufficient_evidence");
  assert.deepEqual(
    evidence.agent.validatedOutput.constraintViolations.map(({ code }) => code),
    ["ECONOMICS_INCOMPLETE"]
  );
});
