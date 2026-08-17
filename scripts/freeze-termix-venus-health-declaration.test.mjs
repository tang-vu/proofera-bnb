import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./freeze-termix-venus-health-declaration.ts", import.meta.url),
  "utf8"
);

test("Venus freezer binds the exact live window, non-authority selection and identity", () => {
  assert.match(source, /125563831-125564152-9d4fbf6b/u);
  assert.match(source, /public_testnet_replay_non_authority/u);
  assert.match(source, /ownershipClaimed: false/u);
  assert.match(source, /executionAuthorityClaimed: false/u);
  assert.match(source, /const AGENT_ID = "1828"/u);
  assert.match(source, /minimumObservationWindowSeconds: 120/u);
  assert.match(source, /minimumAlertReceipts: 0/u);
  assert.match(source, /timed-run-no-write/u);
  assert.match(source, /sha256\(bytes\) !== reference\.sha256/u);
  assert.match(source, /verifyExactPublishedSource/u);
  assert.match(source, /writeCreateOnly/u);
});

test("Venus freezer rejects missing exact invocation before Git or output", async () => {
  const result = await runCli([]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_VENUS_FREEZE_ARGUMENTS_INVALID/u);
  assert.equal(result.stdout, "");
});

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--no-warnings",
        "--conditions=react-server",
        "--experimental-loader",
        "./scripts/termix-typescript-loader.mjs",
        "./scripts/freeze-termix-venus-health-declaration.ts",
        ...args
      ],
      { cwd: new URL("..", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
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
