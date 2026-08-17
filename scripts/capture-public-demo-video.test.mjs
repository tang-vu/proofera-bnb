import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL("./capture-public-demo-video.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const source = await readFile(scriptUrl, "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const prettierIgnore = await readFile(new URL("../.prettierignore", import.meta.url), "utf8");

test("public demo video capture is exact-release gated and create-only", () => {
  assert.match(source, /--capture-exact-public-demo-video/u);
  assert.match(source, /--source-base-commit/u);
  assert.match(source, /rev-parse", "origin\/main/u);
  assert.match(source, /status", "--porcelain=v1", "--untracked-files=all/u);
  assert.match(source, /PUBLIC_DEMO_VIDEO_OUTPUT_EXISTS/u);
  assert.match(source, /COPYFILE_EXCL/u);
  assert.match(source, /flag: "wx"/u);
  assert.match(prettierIgnore, /^evidence\/submission\/demo-videos\/\*\/\*\/manifest\.json$/mu);
  assert.equal(
    packageJson.scripts["capture:demo:video"],
    "node ./scripts/capture-public-demo-video.mjs --capture-exact-public-demo-video --source-base-commit"
  );
});

test("final mode requires prior objective gates, tracked narration and decoded media", () => {
  for (const gate of [
    "production-release",
    "agent-registration",
    "altana-lifecycle",
    "pancake-benefit",
    "termix-pairs"
  ]) {
    assert.match(source, new RegExp(`"${gate}"`, "u"));
  }
  assert.match(source, /gates\.get\("demo"\)\?\.state !== "not_recorded"/u);
  assert.match(source, /gates\.get\("submission"\)\?\.state !== "draft"/u);
  assert.match(source, /ls-files", "--error-unmatch/u);
  assert.match(source, /PUBLIC_DEMO_VIDEO_VOICEOVER_BYTES_MISMATCH/u);
  assert.match(source, /"ffprobe"/u);
  assert.match(source, /"ffmpeg"/u);
  assert.match(source, /durationSeconds < 240 \|\| durationSeconds > 330/u);
  assert.match(source, /audioStreams\.length !== 1/u);
  assert.match(source, /PUBLIC_DEMO_VIDEO_DECODE_FAILED/u);
  assert.match(source, /finalDemoCheck: mode === "final"/u);
  assert.match(source, /hackathonEntrySubmitted: false/u);
  assert.match(source, /submissionReady: false/u);
});

test("capture fixes six public scenes and performs no wallet or transaction action", () => {
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
  assert.doesNotMatch(
    source,
    /eth_sendRawTransaction|eth_sendTransaction|wallet_|privateKey|page\.click|page\.fill/u
  );
});

test("capture rejects missing invocation before Git, media tools or network", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PUBLIC_DEMO_VIDEO_EXACT_INVOCATION_REQUIRED/u);
  assert.doesNotMatch(
    result.stderr,
    /PUBLIC_DEMO_VIDEO_(HEAD_MISMATCH|FFPROBE_FAILED|HEALTH_INVALID)/u
  );
});
