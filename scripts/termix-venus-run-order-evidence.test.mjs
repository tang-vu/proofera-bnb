import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url);
const SOURCE_COMMIT = "3ba85859ced39b457da819d27637d3fc02101c5d";
const DECLARATION_PATH = "evidence/termix/declarations/venus-health/3ba85859ced3-125568071.json";
const ORDER_PATH =
  "evidence/termix/declarations/venus-health/3ba85859ced3-125568071.run-order.json";
const declaration = JSON.parse(await readFile(new URL(`../${DECLARATION_PATH}`, import.meta.url)));
const resolution = JSON.parse(await readFile(new URL(`../${ORDER_PATH}`, import.meta.url)));
const requestBytes = await readFile(new URL(`../${declaration.input.path}`, import.meta.url));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true }).trim();
}

test("retained Venus declaration and request were published before randomness", () => {
  assert.equal(declaration.sourceCommitSha, SOURCE_COMMIT);
  assert.equal(declaration.registeredAgent.agentId, "1828");
  assert.equal(declaration.publicReplaySelection.ownershipClaimed, false);
  assert.equal(declaration.publicReplaySelection.executionAuthorityClaimed, false);
  assert.equal(declaration.sourceWindow.firstBlockNumber, "125563831");
  assert.equal(declaration.sourceWindow.lastBlockNumber, "125564152");
  assert.equal(
    sha256(JSON.stringify(canonical(declaration.declaration))),
    declaration.declarationSha256
  );
  assert.equal(requestBytes.at(-1), 0x0a);
  assert.equal(sha256(requestBytes.subarray(0, -1)), declaration.input.sha256);
  assert.equal(resolution.declaration.sha256, declaration.declarationSha256);
  assert.equal(resolution.declaration.sourceCommitSha, SOURCE_COMMIT);

  const additionCommit = git([
    "log",
    "--diff-filter=A",
    "-1",
    "--format=%H",
    "--",
    DECLARATION_PATH
  ]);
  const publicationTimestamp = BigInt(git(["show", "-s", "--format=%ct", additionCommit]));
  const randomnessTimestamp = BigInt(resolution.randomness.blockTimestamp);
  assert.ok(publicationTimestamp < randomnessTimestamp);
  assert.equal(
    spawnSync("git", ["merge-base", "--is-ancestor", additionCommit, "origin/main"], {
      cwd: ROOT,
      windowsHide: true
    }).status,
    0
  );
});

test("retained two-provider resolution proves finality and agent-first order", () => {
  assert.equal(resolution.state, "resolved");
  assert.equal(resolution.randomness.blockNumber, "125568071");
  assert.equal(resolution.randomness.finalityConfirmations, "12");
  assert.match(resolution.randomness.blockHash, /^0x[0-9a-f]{64}$/u);
  const bit = Number.parseInt(resolution.randomness.blockHash.slice(-1), 16) & 1;
  assert.equal(bit, 0);
  assert.equal(resolution.randomness.leastSignificantBit, bit);
  assert.deepEqual(resolution.randomness.runOrder, ["agent", "manual"]);
  assert.equal(resolution.observations.length, 2);
  assert.equal(new Set(resolution.observations.map(({ provider }) => provider)).size, 2);
  for (const observation of resolution.observations) {
    assert.ok(BigInt(observation.headNumber) >= 125568083n);
    assert.equal(observation.block.hash, resolution.randomness.blockHash);
    assert.equal(observation.block.timestamp, resolution.randomness.blockTimestamp);
    assert.deepEqual(
      observation.transcript.map(({ request }) => request.method),
      ["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber"]
    );
  }
  assert.deepEqual(resolution.claims, {
    hireVerified: false,
    agentRun: false,
    manualRun: false,
    result: false,
    intervention: false
  });
});
