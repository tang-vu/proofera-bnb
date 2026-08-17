import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url);
const DECLARATION_PATH = "evidence/termix/declarations/pancake-lp/2137d7a962db-125555414.json";
const ORDER_PATH = "evidence/termix/declarations/pancake-lp/2137d7a962db-125555414.run-order.json";
const SOURCE_COMMIT = "2137d7a962db96a4686dfdcaf500f1abd4e0b8f4";
const declaration = JSON.parse(await readFile(new URL(`../${DECLARATION_PATH}`, import.meta.url)));
const resolution = JSON.parse(await readFile(new URL(`../${ORDER_PATH}`, import.meta.url)));

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

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true }).trim();
}

test("retained LP declaration digest and pre-randomness publication are exact", () => {
  assert.equal(declaration.sourceCommitSha, SOURCE_COMMIT);
  assert.equal(
    sha256(JSON.stringify(canonical(declaration.declaration))),
    declaration.declarationSha256
  );
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

test("retained two-provider resolution proves finality, agreement and deterministic order", () => {
  assert.equal(resolution.state, "resolved");
  assert.equal(resolution.randomness.blockNumber, "125555414");
  assert.equal(resolution.randomness.finalityConfirmations, "12");
  assert.match(resolution.randomness.blockHash, /^0x[0-9a-f]{64}$/u);
  const bit = Number.parseInt(resolution.randomness.blockHash.slice(-1), 16) & 1;
  assert.equal(resolution.randomness.leastSignificantBit, bit);
  assert.deepEqual(
    resolution.randomness.runOrder,
    bit === 0 ? ["agent", "manual"] : ["manual", "agent"]
  );
  assert.equal(resolution.observations.length, 2);
  assert.equal(new Set(resolution.observations.map(({ provider }) => provider)).size, 2);
  for (const observation of resolution.observations) {
    assert.ok(BigInt(observation.headNumber) >= 125555426n);
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
    result: false
  });
});
