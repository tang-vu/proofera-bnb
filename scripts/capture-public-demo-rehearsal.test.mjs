import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL("./capture-public-demo-rehearsal.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const source = await readFile(scriptUrl, "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("public demo rehearsal is exact-release gated and create-only", () => {
  assert.match(source, /--capture-exact-public-demo-rehearsal/u);
  assert.match(source, /--source-base-commit/u);
  assert.match(source, /rev-parse", "origin\/main/u);
  assert.match(source, /status", "--porcelain=v1", "--untracked-files=all/u);
  assert.match(source, /await mkdir\(outputDirectory\)/u);
  assert.match(source, /flag: "wx"/u);
  assert.equal(
    packageJson.scripts["capture:demo:rehearsal"],
    "node ./scripts/capture-public-demo-rehearsal.mjs --capture-exact-public-demo-rehearsal --source-base-commit"
  );
});

test("public demo rehearsal fixes six honest judge-facing scenes", () => {
  for (const path of [
    'path: "/"',
    'path: "/marketplace"',
    'path: "/reference-analyzers/lp-rebalancing"',
    'path: "/lp-activate"',
    'path: "/proof"',
    'path: "/mission-control"'
  ]) {
    assert.match(source, new RegExp(path.replaceAll("/", "\\/"), "u"));
  }
  assert.match(source, /No — gates remain open/u);
  assert.match(source, /videoRecorded: false/u);
  assert.match(source, /onchainReceiptEvidenceIntroduced: false/u);
  assert.match(source, /hackathonEntrySubmitted: false/u);
  assert.match(source, /submissionReady: false/u);
  assert.doesNotMatch(
    source,
    /eth_sendRawTransaction|eth_sendTransaction|wallet_|privateKey|page\.click|page\.fill/u
  );
});

test("public demo rehearsal rejects missing invocation before release or network access", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PUBLIC_DEMO_REHEARSAL_EXACT_INVOCATION_REQUIRED/u);
  assert.doesNotMatch(result.stderr, /PUBLIC_DEMO_REHEARSAL_(HEAD_MISMATCH|HEALTH_INVALID)/u);
});
