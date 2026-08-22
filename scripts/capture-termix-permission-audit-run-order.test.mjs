import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url);
const SCRIPT = new URL("./capture-termix-permission-audit-run-order.mjs", import.meta.url);
const source = await readFile(SCRIPT, "utf8");

test("permission-audit run-order collector fixes identity, providers and mapping", () => {
  assert.match(source, /--capture-exact-permission-audit-run-order/u);
  assert.match(source, /autonomous-session-permission-audit/u);
  assert.match(source, /agentId !== "1825"/u);
  assert.match(source, /data-seed-prebsc-2-s2\.binance\.org/u);
  assert.match(source, /bsc-testnet-rpc\.publicnode\.com/u);
  assert.match(source, /target \+ 12n/u);
  assert.match(source, /leastSignificantBit === 0 \? \["agent", "manual"\]/u);
  assert.match(source, /writeCreateOnly/u);
  assert.match(source, /hireVerified: true/u);
  assert.match(source, /agentRun: false/u);
  assert.match(source, /manualRun: false/u);
});

test("permission-audit collector rejects missing invocation before Git or RPC", async () => {
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      ["./scripts/capture-termix-permission-audit-run-order.mjs"],
      {
        cwd: ROOT,
        env: { PATH: "" },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolveResult({ code, stderr }));
  });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /TERMIX_PERMISSION_ORDER_ARGUMENTS_INVALID/u);
  assert.doesNotMatch(result.stderr, /ENOENT|fetch|git/u);
});
