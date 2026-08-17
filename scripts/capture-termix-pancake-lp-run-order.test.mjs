import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./capture-termix-pancake-lp-run-order.mjs", import.meta.url),
  "utf8"
);

test("LP run-order collector fixes two providers, finality and deterministic mapping", () => {
  assert.match(source, /--capture-exact-pancake-lp-run-order/u);
  assert.match(source, /data-seed-prebsc-2-s2\.binance\.org/u);
  assert.match(source, /bsc-testnet-rpc\.publicnode\.com/u);
  assert.match(source, /eth_getBlockByNumber/u);
  assert.match(source, /target \+ 12n/u);
  assert.match(source, /leastSignificantBit/u);
  assert.match(source, /first\.block\.hash !== second\.block\.hash/u);
  assert.match(source, /verifyTermixPublishedReleaseState/u);
  assert.match(source, /link\(temporary, path\)/u);
  assert.match(source, /hireVerified: false/u);
  assert.doesNotMatch(
    source,
    /createWalletClient|sendTransaction|writeContract|signTransaction|privateKey/u
  );
});

test("LP run-order collector rejects missing invocation before Git or RPC", async () => {
  const result = await runCli();
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /TERMIX_LP_ORDER_ARGUMENTS_INVALID/u);
});

function runCli() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["./scripts/capture-termix-pancake-lp-run-order.mjs"], {
      cwd: new URL("..", import.meta.url),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
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
