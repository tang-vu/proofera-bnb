import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./run-termix-venus-health-agent.ts", import.meta.url),
  "utf8"
);
const loaderSource = await readFile(
  new URL("./termix-typescript-loader.mjs", import.meta.url),
  "utf8"
);

test("Venus timed CLI fixes release, input, endpoint lane, and create-only output boundaries", () => {
  assert.match(source, /--execute-exact-venus-health-agent-run/);
  assert.match(source, /evidence\/termix\/frozen\/venus-health\//);
  assert.match(source, /evidence\/termix\/runs\/venus-health/);
  assert.match(source, /gitText\(\["status", "--porcelain=v1", "--untracked-files=all"\]\)/);
  assert.match(source, /gitText\(\["rev-parse", "origin\/main"\]\)/);
  assert.match(source, /gitBytes\(\["show", `HEAD:\$\{repositoryPath\}`\]\)/);
  assert.match(source, /runVenusHealthAgentTermixMethod/);
  assert.match(source, /open\(temporaryPath, "wx", 0o600\)/);
  assert.match(source, /link\(temporaryPath, outputPath\)/);
  assert.doesNotMatch(
    source,
    /createWalletClient|sendTransaction|writeContract|signTransaction|privateKey|authorization:/
  );
  assert.match(loaderSource, /scripts\/run-termix-venus-health-agent\.ts/);
  assert.match(loaderSource, /packages\/benchmarks\/src/);
  assert.match(loaderSource, /Untrusted TermiX TypeScript module resolution/);
});

test("Venus timed CLI rejects missing exact invocation before network or output", async () => {
  const result = await runCli([]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_VENUS_CLI_ARGUMENTS_INVALID/);
  assert.equal(result.stdout, "");
});

test("Venus timed CLI rejects empty stdin before Git, network, or output", async () => {
  const result = await runCli([
    "--execute-exact-venus-health-agent-run",
    "--request-input",
    "evidence/termix/frozen/venus-health/final.canonical-json"
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_VENUS_STDIN_REQUIRED/);
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
        "./scripts/run-termix-venus-health-agent.ts",
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
