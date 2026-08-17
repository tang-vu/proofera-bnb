import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./run-termix-pancake-lp-manual.ts", import.meta.url),
  "utf8"
);
const supportSource = await readFile(
  new URL("./termix-manual-runner-support.ts", import.meta.url),
  "utf8"
);
const loaderSource = await readFile(
  new URL("./termix-typescript-loader.mjs", import.meta.url),
  "utf8"
);

test("Pancake LP manual CLI fixes release, NDJSON timing, and create-only output", () => {
  assert.match(source, /--execute-exact-pancake-lp-manual-run/u);
  assert.match(source, /evidence\/termix\/frozen\/pancake-lp\//u);
  assert.match(source, /evidence\/termix\/runs\/pancake-lp\/manual/u);
  assert.match(source, /runPancakeLpManualTermixMethod/u);
  assert.match(supportSource, /readBoundedLines/u);
  assert.match(supportSource, /events: parseEvents\(config, lineIterator\)/u);
  assert.match(supportSource, /process\.hrtime\.bigint/u);
  assert.match(
    supportSource,
    /gitText\(\["status", "--porcelain=v1", "--untracked-files=all"\]\)/u
  );
  assert.match(supportSource, /gitText\(\["rev-parse", "origin\/main"\]\)/u);
  assert.match(supportSource, /gitBytes\(\["show", `HEAD:\$\{repositoryPath\}`\]\)/u);
  assert.match(supportSource, /isCanonicalJsonText\(inputCanonicalJson\)/u);
  assert.match(supportSource, /open\(temporaryPath, "wx", 0o600\)/u);
  assert.match(supportSource, /link\(temporaryPath, outputPath\)/u);
  assert.doesNotMatch(
    `${source}\n${supportSource}`,
    /fetch\(|createWalletClient|sendTransaction|writeContract|signTransaction|privateKey|authorization:/u
  );
  assert.match(loaderSource, /run-termix-pancake-lp-manual\.ts/u);
  assert.match(loaderSource, /termix-manual-runner-support\.ts/u);
});

test("Pancake LP manual CLI rejects missing exact invocation before input", async () => {
  const result = await runCli([], "");
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_PANCAKE_LP_MANUAL_CLI_ARGUMENTS_INVALID/u);
  assert.equal(result.stdout, "");
});

test("Pancake LP manual CLI rejects empty stdin before Git or output", async () => {
  const result = await runCli(validArguments, "");
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_PANCAKE_LP_MANUAL_STDIN_REQUIRED/u);
  assert.equal(result.stdout, "");
});

test("Pancake LP manual CLI rejects CRLF before Git or output", async () => {
  const result = await runCli(validArguments, "{}\r\n");
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_PANCAKE_LP_MANUAL_STDIN_LINE_INVALID/u);
  assert.equal(result.stdout, "");
});

test("Pancake LP manual CLI rejects non-UTF-8 before Git or output", async () => {
  const result = await runCli(validArguments, Buffer.from([0xff, 0x0a]));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TERMIX_PANCAKE_LP_MANUAL_STDIN_UTF8_INVALID/u);
  assert.equal(result.stdout, "");
});

const validArguments = [
  "--",
  "--execute-exact-pancake-lp-manual-run",
  "--input-bundle",
  "evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json"
];

function runCli(args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--no-warnings",
        "--conditions=react-server",
        "--experimental-loader",
        "./scripts/termix-typescript-loader.mjs",
        "./scripts/run-termix-pancake-lp-manual.ts",
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
    child.stdin.end(stdin);
  });
}
