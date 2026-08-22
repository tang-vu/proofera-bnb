import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url);
const SCRIPT = new URL("./generate-termix-permission-audit-invocations.mjs", import.meta.url);
const source = await readFile(SCRIPT, "utf8");

test("permission-audit invocation generator binds both fixed lanes and real hire", () => {
  assert.match(source, /--generate-exact-permission-audit-invocations/u);
  assert.match(source, /autonomous-session-permission-audit/u);
  assert.match(source, /permission-audit-agent-v1/u);
  assert.match(source, /permission-audit-manual-v1/u);
  assert.match(source, /agentId !== AGENT_ID/u);
  assert.match(source, /termixHireReceipt\?\.state !== "verified"/u);
  assert.match(source, /hireReceipt: null/u);
  assert.match(source, /human-reviewed-canonical-json-worksheet/u);
  assert.match(source, /writeFile\(`\$\{body\}\\n`/u);
  assert.match(source, /publishPair/u);
});

test("permission-audit invocation generator rejects missing arguments before Git or files", async () => {
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      ["./scripts/generate-termix-permission-audit-invocations.mjs"],
      { cwd: ROOT, env: { PATH: "" }, stdio: ["ignore", "pipe", "pipe"] }
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
  assert.match(result.stderr, /TERMIX_PERMISSION_INVOCATION_ARGUMENTS_INVALID/u);
  assert.doesNotMatch(result.stderr, /ENOENT|git/u);
});
