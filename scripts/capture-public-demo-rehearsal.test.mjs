import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL("./capture-public-demo-rehearsal.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const source = await readFile(scriptUrl, "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const prettierIgnore = await readFile(new URL("../.prettierignore", import.meta.url), "utf8");

test("public demo rehearsal is exact-release gated and create-only", () => {
  assert.match(source, /--capture-exact-public-demo-rehearsal/u);
  assert.match(source, /--source-base-commit/u);
  assert.match(source, /rev-parse", "origin\/main/u);
  assert.match(source, /status", "--porcelain=v1", "--untracked-files=all/u);
  assert.match(source, /await mkdir\(outputDirectory\)/u);
  assert.match(source, /flag: "wx"/u);
  assert.match(prettierIgnore, /^evidence\/submission\/rehearsals\/\*\/manifest\.json$/mu);
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

test("retained public demo rehearsal binds six real screenshots without closing the demo gate", async () => {
  const directory = new URL(
    "../evidence/submission/rehearsals/b0e46cc192fbf15220a557c4b5bc8639c3c75eba/",
    import.meta.url
  );
  const manifestBytes = await readFile(new URL("manifest.json", directory));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.equal(manifest.schemaVersion, "proofera-public-demo-rehearsal-v1.0.0");
  assert.equal(manifest.sourceCommit, "b0e46cc192fbf15220a557c4b5bc8639c3c75eba");
  assert.deepEqual(manifest.classification, {
    artifact: "public_demo_rehearsal",
    browserAutomation: true,
    finalDemoCheck: false,
    hackathonEntrySubmitted: false,
    onchainReceiptEvidenceIntroduced: false,
    submissionReady: false,
    videoRecorded: false
  });
  assert.deepEqual(
    manifest.scenes.map(({ httpStatus, key, screenshot, url }) => ({
      httpStatus,
      key,
      screenshot,
      url
    })),
    [
      {
        httpStatus: 200,
        key: "home",
        screenshot: "01-home.png",
        url: "https://proofera.tangvu.dev/"
      },
      {
        httpStatus: 200,
        key: "marketplace",
        screenshot: "02-marketplace.png",
        url: "https://proofera.tangvu.dev/marketplace"
      },
      {
        httpStatus: 200,
        key: "lp-passport",
        screenshot: "03-lp-passport.png",
        url: "https://proofera.tangvu.dev/reference-analyzers/lp-rebalancing"
      },
      {
        httpStatus: 200,
        key: "lp-configuration",
        screenshot: "04-lp-configuration.png",
        url: "https://proofera.tangvu.dev/lp-activate"
      },
      {
        httpStatus: 200,
        key: "proof-room",
        screenshot: "05-proof-room.png",
        url: "https://proofera.tangvu.dev/proof"
      },
      {
        httpStatus: 200,
        key: "mission-control",
        screenshot: "06-mission-control.png",
        url: "https://proofera.tangvu.dev/mission-control"
      }
    ]
  );
  for (const scene of manifest.scenes) {
    const screenshotBytes = await readFile(new URL(scene.screenshot, directory));
    assert.equal(screenshotBytes.length, scene.screenshotBytes);
    assert.equal(
      createHash("sha256").update(screenshotBytes).digest("hex"),
      scene.screenshotSha256
    );
  }
});
