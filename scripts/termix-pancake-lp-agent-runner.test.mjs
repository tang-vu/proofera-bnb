import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("./run-termix-pancake-lp-agent.ts", import.meta.url), "utf8");
const loaderSource = await readFile(
  new URL("./termix-typescript-loader.mjs", import.meta.url),
  "utf8"
);
const releaseSource = await readFile(
  new URL("./termix-release-state.mjs", import.meta.url),
  "utf8"
);
const supersededCaptureBytes = await readFile(
  new URL("../evidence/termix/runs/pancake-lp/pancake-lp-agent-20260818-v3.json", import.meta.url)
);

test("Pancake LP timed CLI fixes release, input, endpoint lane, and create-only output", () => {
  assert.match(source, /--execute-exact-pancake-lp-agent-run/u);
  assert.match(source, /evidence\/termix\/frozen\/pancake-lp\//u);
  assert.match(source, /evidence\/termix\/runs\/pancake-lp/u);
  assert.match(source, /verifyTermixPublishedReleaseState/u);
  assert.match(releaseSource, /"status", "--porcelain=v1", "--untracked-files=all"/u);
  assert.match(releaseSource, /"rev-parse", "origin\/main"/u);
  assert.match(releaseSource, /"merge-base", "--is-ancestor"/u);
  assert.match(releaseSource, /"diff",\s*"--quiet"/u);
  assert.match(source, /gitBytes\(\["show", `HEAD:\$\{repositoryPath\}`\]\)/u);
  assert.match(source, /runPancakeLpAgentTermixMethod/u);
  assert.match(source, /open\(temporaryPath, "wx", 0o600\)/u);
  assert.match(source, /link\(temporaryPath, outputPath\)/u);
  assert.doesNotMatch(
    source,
    /createWalletClient|sendTransaction|writeContract|signTransaction|privateKey|authorization:/u
  );
  assert.match(loaderSource, /run-termix-pancake-lp-agent\.ts/u);
  assert.match(loaderSource, /packages\/benchmarks\/src/u);
  assert.match(loaderSource, /Untrusted TermiX TypeScript module resolution/u);
});

test("Pancake LP timed CLI rejects missing exact invocation before network or output", async () => {
  const result = await runCli([]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_PANCAKE_LP_CLI_ARGUMENTS_INVALID/u);
  assert.equal(result.stdout, "");
});

test("Pancake LP timed CLI rejects empty stdin before Git, network, or output", async () => {
  const result = await runCli([
    "--",
    "--execute-exact-pancake-lp-agent-run",
    "--input-bundle",
    "evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json"
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_PANCAKE_LP_STDIN_REQUIRED/u);
  assert.equal(result.stdout, "");
});

test("retained LP archive capture is immutable but excluded for its stale provider label", () => {
  assert.equal(
    createHash("sha256").update(supersededCaptureBytes).digest("hex"),
    "ef03325fdeeded09707266b71806c4f187024cd4613f6d6e35fff41d3df79b83"
  );
  const capture = JSON.parse(supersededCaptureBytes.toString("utf8"));
  assert.equal(capture.runId, "pancake-lp-agent-20260818-v3");
  assert.equal(capture.methodKind, "agent");
  assert.equal(capture.boundaries.agentWasRegisteredBeforeStart, true);
  assert.equal(capture.boundaries.hireReceiptWasVerifiedBeforeStart, true);
  assert.equal(capture.apiResponses.length, 2);
  assert.equal(capture.apiResponses[0].endpointUrl, "https://bnb.api.onfinality.io/public");
  assert.equal(capture.apiResponses[0].provider, "PublicNode BSC mainnet JSON-RPC");
  assert.equal(
    capture.output.sha256,
    "e7564a74e1319f3274406d667cf4949cabc31343d7717b7082018d1b41771501"
  );
  assert.equal(JSON.parse(capture.output.body).executionEnabled, false);
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
        "./scripts/run-termix-pancake-lp-agent.ts",
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
