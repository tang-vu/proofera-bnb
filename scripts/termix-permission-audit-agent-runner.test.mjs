import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./run-termix-permission-audit-agent.ts", import.meta.url),
  "utf8"
);
const loaderSource = await readFile(
  new URL("./termix-typescript-loader.mjs", import.meta.url),
  "utf8"
);

test("permission audit agent CLI fixes release, bundle, lane, and create-only output", () => {
  assert.match(source, /--execute-exact-permission-audit-agent-run/u);
  assert.match(source, /evidence\/termix\/frozen\/permission-audit\//u);
  assert.match(source, /evidence\/termix\/runs\/permission-audit\/agent/u);
  assert.match(source, /gitText\(\["status", "--porcelain=v1", "--untracked-files=all"\]\)/u);
  assert.match(source, /gitText\(\["rev-parse", "origin\/main"\]\)/u);
  assert.match(source, /gitBytes\(\["show", `HEAD:\$\{repositoryPath\}`\]\)/u);
  assert.match(source, /runPermissionAuditAgentTermixMethod/u);
  assert.match(source, /open\(temporaryPath, "wx", 0o600\)/u);
  assert.match(source, /link\(temporaryPath, outputPath\)/u);
  assert.doesNotMatch(
    source,
    /createWalletClient|sendTransaction|writeContract|signTransaction|privateKey|authorization:/u
  );
  assert.match(loaderSource, /run-termix-permission-audit-agent\.ts/u);
  assert.match(loaderSource, /packages\/benchmarks\/src/u);
  assert.match(loaderSource, /Untrusted TermiX TypeScript module resolution/u);
});

test("permission audit agent CLI rejects missing exact invocation before network or output", async () => {
  const result = await runCli([]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_PERMISSION_AUDIT_AGENT_CLI_ARGUMENTS_INVALID/u);
  assert.equal(result.stdout, "");
});

test("permission audit agent CLI rejects empty stdin before Git, network, or output", async () => {
  const result = await runCli([
    "--",
    "--execute-exact-permission-audit-agent-run",
    "--input-bundle",
    "evidence/termix/frozen/permission-audit/final.canonical-json"
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_PERMISSION_AUDIT_AGENT_STDIN_REQUIRED/u);
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
        "./scripts/run-termix-permission-audit-agent.ts",
        ...args
      ],
      { cwd: new URL("..", import.meta.url), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
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
    child.stdin.end();
  });
}
