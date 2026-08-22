import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./freeze-termix-permission-audit-declaration.ts", import.meta.url),
  "utf8"
);
const loaderSource = await readFile(
  new URL("./termix-typescript-loader.mjs", import.meta.url),
  "utf8"
);

test("permission audit freezer binds lifecycle, staging receipt, public state and blind corpus", () => {
  assert.match(source, /--freeze-exact-permission-audit-declaration/u);
  assert.match(source, /126543819-72e7cf94-altana-lifecycle\.json/u);
  assert.match(source, /altana-test-action\.v2\.json/u);
  assert.match(source, /proofera-postgres-grant/u);
  assert.match(source, /47f917f7409eacd22fc5dfb1dee634e1b55cf0c01d1a7eb701be2227a03e0641/u);
  assert.match(
    source,
    /SELECT count\(\*\)::text FROM proofera_altana_grant_claim\.submission_claims/u
  );
  assert.match(source, /'appliedAtUtc', applied_at::text/u);
  assert.doesNotMatch(source, /to_char\(applied_at/u);
  assert.match(source, /claimEnforcementLayer: "local-create-only-file"/u);
  assert.match(source, /claimEvidenceLevel: "inferred-from-pinned-ordering"/u);
  assert.match(source, /databaseClaimRecordObserved: false/u);
  assert.match(source, /EIP-1898 blockHash requireCanonical/u);
  assert.match(source, /answer-key-sha256/u);
  assert.match(source, /TERMIX_PERMISSION_FREEZE_BUNDLE_SCHEMA_INVALID/u);
  assert.match(source, /TERMIX_PERMISSION_FREEZE_DECLARATION_SCHEMA_INVALID/u);
  assert.match(source, /TERMIX_PERMISSION_FREEZE_OUTPUT_WRITE_FAILED/u);
  assert.match(source, /open\(path, "wx", 0o600\)/u);
  assert.doesNotMatch(
    source,
    /sendTransaction|writeContract|signTransaction|grantSession|revokeSession|createWalletClient/u
  );
  assert.match(loaderSource, /freeze-termix-permission-audit-declaration\.ts/u);
});

test("permission audit freezer rejects missing invocation before Git, Docker, RPC or output", async () => {
  const result = await runCli([]);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /TERMIX_PERMISSION_FREEZE_ARGUMENTS_INVALID/u);
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
        "./scripts/freeze-termix-permission-audit-declaration.ts",
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
    child.once("close", (code) => resolve({ code, stderr, stdout }));
  });
}
