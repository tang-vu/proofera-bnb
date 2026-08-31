import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceCommit = "ad0349811df96f39b110a505f0c6d9ded6d4746b";
const sourceDirectory = resolve(
  repositoryRoot,
  "evidence",
  "submission",
  "demo-videos",
  sourceCommit
);
const sourceManifestBytes = await readFile(resolve(sourceDirectory, "final", "manifest.json"));
const sourceManifest = JSON.parse(sourceManifestBytes.toString("utf8"));
const mediaBytes = await readFile(resolve(sourceDirectory, "final", "proofera-final-demo.mp4"));
const playback = JSON.parse(
  await readFile(resolve(sourceDirectory, "playback", "manifest.json"), "utf8")
);
const scriptSource = await readFile(
  resolve(repositoryRoot, "scripts", "verify-final-demo-playback.mjs"),
  "utf8"
);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("retained final demo playback remains bounded and digest-bound", () => {
  assert.equal(playback.sourceCommit, sourceCommit);
  assert.equal(playback.classification.artifact, "bounded_automated_playback_verification");
  assert.equal(playback.classification.fullAudioVideoDecode, true);
  assert.equal(playback.classification.mediaCopiedToTemporaryBoundary, true);
  assert.equal(playback.classification.separateProcessFromCapture, true);
  assert.equal(playback.classification.humanAudioIntelligibilityAttested, false);
  assert.equal(playback.classification.independentHumanReviewer, false);
  assert.equal(playback.classification.hackathonEntrySubmitted, false);
  assert.equal(playback.classification.submissionReady, false);
  assert.equal(playback.playback.fullDecodeCompleted, true);
  assert.equal(playback.playback.probe.durationSeconds, sourceManifest.media.probe.durationSeconds);
  assert.equal(playback.publicScenes.length, 6);
  assert.ok(playback.publicScenes.every(({ status }) => status === 200));
  assert.equal(playback.sourceDemo.mediaSha256, sha256(mediaBytes));
  assert.equal(playback.temporaryCopy.sha256, sha256(mediaBytes));
  assert.equal(
    playback.sourceDemo.manifestSha256,
    sha256(Buffer.from(sourceManifestBytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8"))
  );
  assert.match(playback.limitations.join(" "), /not an independent human review/u);
  assert.match(playback.limitations.join(" "), /not an organizer submission receipt/u);
});

test("playback collector uses a copied boundary, full decode and live scene assertions", () => {
  assert.match(scriptSource, /mkdtemp\(join\(tmpdir\(\), "proofera-final-demo-playback-"\)\)/u);
  assert.match(scriptSource, /await copyFile\(mediaPath, copiedMediaPath\)/u);
  assert.match(scriptSource, /"ffprobe"/u);
  assert.match(scriptSource, /"ffmpeg"/u);
  assert.match(scriptSource, /page\.getByText\(assertion/u);
  assert.match(scriptSource, /humanAudioIntelligibilityAttested: false/u);
});
