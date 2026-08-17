import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./capture-termix-venus-health-run-order.mjs", import.meta.url),
  "utf8"
);

test("Venus run-order collector fixes two providers, finality and deterministic mapping", () => {
  assert.match(source, /data-seed-prebsc-2-s2\.binance\.org/u);
  assert.match(source, /bsc-testnet-rpc\.publicnode\.com/u);
  assert.match(source, /target \+ 12n/u);
  assert.match(source, /leastSignificantBit/u);
  assert.match(source, /\["agent", "manual"\] : \["manual", "agent"\]/u);
  assert.match(source, /agentId !== "1828"/u);
  assert.match(source, /ownershipClaimed !== false/u);
  assert.match(source, /intervention: false/u);
  assert.match(source, /verifyTermixPublishedReleaseState/u);
  assert.match(source, /writeCreateOnly/u);
});

test("Venus run-order collector rejects missing invocation before Git or RPC", async () => {
  const result = await runCli([]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_VENUS_ORDER_ARGUMENTS_INVALID/u);
  assert.equal(result.stdout, "");
});

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["./scripts/capture-termix-venus-health-run-order.mjs", ...args],
      {
        cwd: new URL("..", import.meta.url),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}
