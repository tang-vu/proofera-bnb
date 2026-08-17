import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./capture-altana-lifecycle-evidence.mjs", import.meta.url),
  "utf8"
);

test("Altana lifecycle capture is exact-release gated, read-only and create-only", () => {
  assert.match(source, /--capture-exact-altana-lifecycle/u);
  assert.match(source, /--source-base-commit/u);
  assert.match(source, /wallet_getCallsStatus/u);
  assert.match(source, /eth_getTransactionByHash/u);
  assert.match(source, /eth_getTransactionReceipt/u);
  assert.match(source, /eth_call/u);
  assert.match(source, /requireCanonical: true/u);
  assert.match(source, /flag: "wx"/u);
  assert.match(source, /gitText\(\["rev-parse", "origin\/main"\]\)/u);
  assert.doesNotMatch(
    source,
    /eth_sendRawTransaction|wallet_sendCalls|wallet_sendPreparedCalls|createWalletClient|signTransaction|privateKey|WALLET_PASSWORD/u
  );
});

test("Altana lifecycle capture fixes authority and honest non-claim joins", () => {
  assert.match(source, /const FINALITY_DEPTH = 12n/u);
  assert.match(source, /https:\/\/testnet-relay\.altana\.network/u);
  assert.match(source, /https:\/\/data-seed-prebsc-2-s2\.binance\.org:8545/u);
  assert.match(source, /https:\/\/bsc-testnet-rpc\.publicnode\.com/u);
  assert.match(source, /isValidKey/u);
  assert.match(source, /getPublicKey/u);
  assert.match(source, /getKeys/u);
  assert.match(source, /applicationCallSemanticsVerified: false/u);
  assert.match(source, /applicationEffectVerified: false/u);
  assert.match(source, /sessionSignatureDirectlyDecoded: false/u);
  assert.match(source, /privateSignerRead: false/u);
});

test("Altana lifecycle capture rejects missing invocation before Git or network", async () => {
  const result = await runCli([]);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^ALTANA_LIFECYCLE_ARGUMENTS_INVALID\r?\n$/u);
});

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["./scripts/capture-altana-lifecycle-evidence.mjs", ...args],
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
