import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL("./capture-public-demo-video.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const source = await readFile(scriptUrl, "utf8");
const narrationGenerator = await readFile(
  new URL("./generate-demo-narration.ps1", import.meta.url),
  "utf8"
);
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const prettierIgnore = await readFile(new URL("../.prettierignore", import.meta.url), "utf8");
const gitAttributes = await readFile(new URL("../.gitattributes", import.meta.url), "utf8");

test("public demo video capture is published-source gated and create-only", () => {
  assert.match(source, /--capture-exact-public-demo-video/u);
  assert.match(source, /--source-base-commit/u);
  assert.match(source, /rev-parse", "origin\/main/u);
  assert.match(source, /status", "--porcelain=v1", "--untracked-files=all/u);
  assert.match(source, /merge-base", "--is-ancestor"/u);
  assert.match(source, /PUBLIC_DEMO_VIDEO_PUBLIC_RUNTIME_MISMATCH/u);
  assert.match(source, /relationship: "runtime_equivalent_descendant"/u);
  assert.match(source, /publicSourceLineage/u);
  assert.match(source, /PUBLIC_DEMO_VIDEO_OUTPUT_EXISTS/u);
  assert.match(source, /COPYFILE_EXCL/u);
  assert.match(source, /flag: "wx"/u);
  assert.match(prettierIgnore, /^evidence\/submission\/demo-videos\/\*\/\*\/manifest\.json$/mu);
  assert.match(
    gitAttributes,
    /^evidence\/submission\/demo-videos\/\*\/\*\/manifest\.json text eol=lf$/mu
  );
  assert.match(gitAttributes, /^evidence\/submission\/demo-videos\/\*\/\*\/\*\.mp4 binary$/mu);
  assert.equal(
    packageJson.scripts["capture:demo:video"],
    "node ./scripts/capture-public-demo-video.mjs --capture-exact-public-demo-video --source-base-commit"
  );
});

test("retained MiMo successor video binds published media and runtime-equivalent public UI", async () => {
  const directory = new URL(
    "../evidence/submission/demo-videos/89a99e84c62905fa77aed9c431e7cb730f2c342f/final/",
    import.meta.url
  );
  const manifestBytes = await readFile(new URL("manifest.json", directory));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const mediaBytes = await readFile(new URL(manifest.media.path, directory));

  assert.equal(manifest.schemaVersion, "proofera-public-demo-video-v1.2.0");
  assert.equal(manifest.sourceCommit, "89a99e84c62905fa77aed9c431e7cb730f2c342f");
  assert.equal(manifest.publicHealth.build, "12829109f26b8f6d15fc2f7beda2008548ae9be0");
  assert.equal(manifest.publicSourceLineage.relationship, "runtime_equivalent_descendant");
  assert.equal(manifest.publicSourceLineage.sourceCommit, manifest.sourceCommit);
  assert.equal(manifest.publicSourceLineage.publicBuildCommit, manifest.publicHealth.build);
  assert.equal(manifest.classification.publicRuntimeTreeMatchesCaptureSource, true);
  assert.equal(manifest.classification.priorDemoGateState, "recorded_pending_human_playback");
  assert.equal(
    manifest.voiceover.sha256,
    "017adf5ca85588da4be7c447b1cd02def705b8cd144665b8952413348f1cf81e"
  );
  assert.equal(manifest.media.probe.durationSeconds, "325.014");
  assert.equal(manifest.scenes.length, 6);
  assert.equal(mediaBytes.length, 68_211_573);
  assert.equal(
    createHash("sha256").update(mediaBytes).digest("hex"),
    "b78b364efc104aed35da4ed70af3a030bc7ded59a781af82a7a7499bf13a4c8b"
  );
});

test("final mode requires prior objective gates, tracked narration and decoded media", () => {
  for (const gate of [
    "production-release",
    "agent-registration",
    "altana-lifecycle",
    "termix-pairs"
  ]) {
    assert.match(source, new RegExp(`"${gate}"`, "u"));
  }
  assert.match(source, /gates\.get\("submission"\)\?\.state !== "draft"/u);
  assert.match(source, /gate\.state === "controlled_outcome_observed"/u);
  assert.match(source, /PANCAKE_OUTCOME_REQUIRED_KINDS/u);
  assert.match(source, /No fee income, price movement or liquidity change was observed/u);
  assert.match(source, /neither realized economic benefit nor autonomous-agent advantage/u);
  assert.match(source, /pancakeBenefitClaimVerified: pancakeGate\.state === "verified"/u);
  assert.match(
    source,
    /pancakeBenefitClaimVerified:\s+prerequisites\?\.pancakeBenefitClaimVerified === true/u
  );
  assert.match(source, /pancakeOutcomeGateState: prerequisites\?\.pancakeOutcomeGateState/u);
  assert.match(source, /priorDemoSupportsSuccessor/u);
  assert.match(source, /"recorded_pending_human_playback"/u);
  assert.match(source, /PRIOR_DEMO_REQUIRED_KINDS/u);
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
  const contextClose = source.indexOf("await context.close()");
  const videoSave = source.indexOf("await video.saveAs(rawPath)");
  const browserClose = source.indexOf("await browser.close()", contextClose);
  assert.ok(contextClose >= 0 && contextClose < videoSave && videoSave < browserClose);
});

test("capture opens and closes with dark editorial cards and smooth deterministic motion", () => {
  assert.match(source, /buildDemoTitleCard/u);
  assert.match(source, /RECORDING_LEAD_TRIM_SECONDS = 1/u);
  assert.match(source, /trim=start=\$\{RECORDING_LEAD_TRIM_SECONDS\}/u);
  assert.match(source, /await recordTitleCard\(page, "intro"/u);
  assert.match(source, /await recordTitleCard\(page, "outro"/u);
  assert.match(source, /requestAnimationFrame/u);
  assert.match(source, /await context\.addInitScript/u);
  assert.match(source, /document\.documentElement\.style\.background = "#070a08"/u);
  assert.match(source, /await revealScene\(page\)/u);
  assert.match(source, /await concealScene\(page\)/u);
  assert.match(source, /localEditorialTitleCards: true/u);
  assert.match(source, /schemaVersion: "proofera-public-demo-video-v1\.2\.0"/u);
});

test("capture retries Windows temporary cleanup without masking the capture outcome", () => {
  assert.match(source, /async function removeTemporaryDirectory/u);
  assert.match(source, /maxRetries: 20/u);
  assert.match(source, /retryDelay: 250/u);
  assert.match(source, /PUBLIC_DEMO_VIDEO_TEMPORARY_CLEANUP_WARNING/u);
  assert.match(source, /await removeTemporaryDirectory\(temporaryDirectory\)/u);
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

test("retained silent rehearsal binds the exact release and decoded media bytes", async () => {
  const directory = new URL(
    "../evidence/submission/demo-videos/f3218e712db9eb001c577b5d116e5b0bc1a1067c/rehearsal/",
    import.meta.url
  );
  const manifestBytes = await readFile(new URL("manifest.json", directory));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.equal(manifest.schemaVersion, "proofera-public-demo-video-v1.0.0");
  assert.equal(manifest.sourceCommit, "f3218e712db9eb001c577b5d116e5b0bc1a1067c");
  assert.deepEqual(manifest.classification, {
    artifact: "public_demo_video_rehearsal",
    audioPresent: false,
    browserAutomation: true,
    finalDemoCheck: false,
    hackathonEntrySubmitted: false,
    onchainReceiptEvidenceIntroduced: false,
    playbackDecoded: true,
    submissionReady: false,
    videoRecorded: true
  });
  assert.equal(manifest.scenes.length, 6);
  assert.equal(manifest.media.probe.durationSeconds, "21.560");
  assert.deepEqual(manifest.media.probe.audioStreams, []);
  assert.deepEqual(manifest.media.probe.videoStream, {
    codecName: "vp8",
    height: 900,
    width: 1440
  });
  const mediaBytes = await readFile(new URL(manifest.media.path, directory));
  assert.equal(mediaBytes.length, manifest.media.bytes);
  assert.equal(createHash("sha256").update(mediaBytes).digest("hex"), manifest.media.sha256);
});

test("retained narration is create-only, bounded, hashed and decodable", async () => {
  const narrationUrl = new URL(
    "../evidence/submission/narration/proofera-final-demo.mp3",
    import.meta.url
  );
  const scriptText = await readFile(
    new URL("../evidence/submission/narration/proofera-final-demo-script.txt", import.meta.url),
    "utf8"
  );
  const narrationBytes = await readFile(narrationUrl);
  assert.equal(narrationBytes.length, 6_080_306);
  assert.equal(
    createHash("sha256").update(narrationBytes).digest("hex"),
    "aea3992fb2badedf8e52c7a5dbbaf57c6400d0a1190a7355e09b8cf3c31939bf"
  );
  assert.doesNotMatch(scriptText, /\[[A-Z][A-Z /-]+\]/u);
  assert.match(narrationGenerator, /Narration output already exists; generation is create-only/u);
  assert.match(narrationGenerator, /durationSeconds -lt 240 -or \$durationSeconds -gt 330/u);
  assert.match(narrationGenerator, /Microsoft Zira Desktop/u);

  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,sample_rate,channels",
      "-of",
      "json",
      fileURLToPath(narrationUrl)
    ],
    { encoding: "utf8", timeout: 10_000, windowsHide: true }
  );
  assert.equal(probe.status, 0, probe.stderr);
  const media = JSON.parse(probe.stdout);
  const durationSeconds = Number.parseFloat(media.format.duration);
  // ffprobe versions account for the final MP3 padding frame differently. Exact
  // bytes are enforced above; this bound verifies the same decodable timeline.
  assert.ok(durationSeconds >= 303.8 && durationSeconds <= 304.1);
  assert.deepEqual(media.streams, [
    {
      channels: 1,
      codec_name: "mp3",
      codec_type: "audio",
      sample_rate: "22050"
    }
  ]);
});
