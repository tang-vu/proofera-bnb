import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./capture-termix-hire-evidence.mjs", import.meta.url),
  "utf8"
);

test("hire evidence capture uses the receiptByEngagement(bytes32) selector", () => {
  assert.match(source, /0x86807df6/u);
  assert.doesNotMatch(source, /0x0afdca31/u);
});

test("hire evidence capture is finalized, read-only and create-only", () => {
  assert.match(source, /--capture-finalized/u);
  assert.match(source, /eth_getTransactionByHash/u);
  assert.match(source, /eth_getTransactionReceipt/u);
  assert.match(source, /eth_call/u);
  assert.match(source, /eth_getCode/u);
  assert.match(source, /requireCanonical: true/u);
  assert.match(source, /openSync\(path, "wx"/u);
  assert.doesNotMatch(
    source,
    /eth_sendRawTransaction|eth_sendTransaction|signTransaction|privateKey|WALLET_PASSWORD/u
  );
});

test("hire evidence capture rejects a missing invocation before Git or network", async () => {
  const result = await runCli([]);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^HIRE_CAPTURE_EXACT_FLAG_REQUIRED\r?\n$/u);
});

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["./scripts/capture-termix-hire-evidence.mjs", ...args], {
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
