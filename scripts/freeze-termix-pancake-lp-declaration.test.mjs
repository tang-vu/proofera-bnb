import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./freeze-termix-pancake-lp-declaration.ts", import.meta.url),
  "utf8"
);
const loaderSource = await readFile(
  new URL("./termix-typescript-loader.mjs", import.meta.url),
  "utf8"
);

test("LP declaration freezer binds release, input, identity and future randomness", () => {
  assert.match(source, /--freeze-exact-pancake-lp-declaration/u);
  assert.match(source, /116342186-7152618\.canonical-json/u);
  assert.match(source, /BenchmarkDeclarationSchema\.parse/u);
  assert.match(source, /normalizeBenchmarkDeclaration/u);
  assert.match(source, /run-order-randomness-commitment/u);
  assert.match(source, /least-significant bit/u);
  assert.match(source, /"1825"/u);
  assert.match(source, /0x8004A818BFB912233c491871b3d84c89A494BD9e/u);
  assert.match(source, /hired: false/u);
  assert.match(source, /agentRun: false/u);
  assert.match(source, /manualRun: false/u);
  assert.match(source, /open\(outputPath, "wx", 0o600\)/u);
  assert.doesNotMatch(
    source,
    /fetch\(|createWalletClient|sendTransaction|writeContract|signTransaction|privateKey/u
  );
  assert.match(loaderSource, /freeze-termix-pancake-lp-declaration\.ts/u);
});

test("LP declaration freezer rejects missing exact invocation before Git or output", async () => {
  const result = await runCli();
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /TERMIX_LP_FREEZE_ARGUMENTS_INVALID/u);
});

function runCli() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--no-warnings",
        "--conditions=react-server",
        "--experimental-loader",
        "./scripts/termix-typescript-loader.mjs",
        "./scripts/freeze-termix-pancake-lp-declaration.ts"
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
