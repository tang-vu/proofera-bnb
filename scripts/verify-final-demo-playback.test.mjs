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
  assert.match(scriptSource, /sourceManifest\.publicHealth\.build/u);
  assert.match(scriptSource, /publicRuntimeTreeMatchesCaptureSource/u);
  assert.match(scriptSource, /runtime_equivalent_descendant/u);
  assert.match(scriptSource, /humanAudioIntelligibilityAttested: false/u);
});

test("retained MiMo successor playback rehashes the runtime-bound final media", async () => {
  const successorDirectory = resolve(
    repositoryRoot,
    "evidence",
    "submission",
    "demo-videos",
    "89a99e84c62905fa77aed9c431e7cb730f2c342f"
  );
  const successorFinal = JSON.parse(
    await readFile(resolve(successorDirectory, "final", "manifest.json"), "utf8")
  );
  const successorPlaybackBytes = await readFile(
    resolve(successorDirectory, "playback", "manifest.json")
  );
  const successorPlayback = JSON.parse(successorPlaybackBytes.toString("utf8"));

  assert.equal(successorPlayback.schemaVersion, "proofera-final-demo-automated-playback-v1.1.0");
  assert.equal(successorPlayback.sourceCommit, successorFinal.sourceCommit);
  assert.equal(successorPlayback.sourceDemo.publicBuildCommit, successorFinal.publicHealth.build);
  assert.equal(successorPlayback.sourceDemo.mediaSha256, successorFinal.media.sha256);
  assert.equal(successorPlayback.temporaryCopy.byteIdentityVerified, true);
  assert.equal(successorPlayback.playback.fullDecodeCompleted, true);
  assert.equal(successorPlayback.playback.probe.durationSeconds, "325.014");
  assert.equal(successorPlayback.publicScenes.length, 6);
  assert.ok(successorPlayback.publicScenes.every(({ status }) => status === 200));
  assert.equal(
    sha256(successorPlaybackBytes),
    "612add66becfc9fbbf962efde445dc9a6a6c8fbd1ae00c621c1a99edf2abda1f"
  );
});

test("retained YouTube publication observation stays bounded to anonymous availability", async () => {
  const publishedMediaBytes = await readFile(
    resolve(
      repositoryRoot,
      "evidence",
      "submission",
      "demo-videos",
      "89a99e84c62905fa77aed9c431e7cb730f2c342f",
      "final",
      "proofera-final-demo.mp4"
    )
  );
  const observation = JSON.parse(
    await readFile(
      resolve(repositoryRoot, "evidence", "submission", "youtube-publication-2026-09-05.json"),
      "utf8"
    )
  );

  assert.equal(observation.schemaVersion, "proofera-youtube-publication-observation-v1.0.0");
  assert.equal(observation.video.id, "ron927GeVXI");
  assert.equal(observation.video.shortUrl, "https://youtu.be/ron927GeVXI");
  assert.equal(observation.video.canonicalUrl, "https://www.youtube.com/watch?v=ron927GeVXI");
  assert.equal(observation.video.durationSeconds, 325);
  assert.equal(observation.anonymousObservation.oembed.httpStatus, 200);
  assert.equal(observation.anonymousObservation.watchPage.httpStatus, 200);
  assert.equal(observation.anonymousObservation.watchPage.playabilityStatus, "OK");
  assert.equal(observation.anonymousObservation.watchPage.isPrivate, false);
  assert.equal(observation.anonymousObservation.watchPage.isUnlisted, false);
  assert.equal(observation.classification.anonymousAccessObserved, true);
  assert.equal(observation.classification.publicVisibilityObserved, true);
  assert.equal(observation.classification.youtubePublicationObserved, true);
  assert.equal(observation.classification.humanPlaybackAttested, false);
  assert.equal(observation.classification.hackathonEntrySubmitted, false);
  assert.equal(observation.classification.organizerAcceptanceObserved, false);
  assert.equal(observation.retainedMedia.bytes, publishedMediaBytes.byteLength);
  assert.equal(observation.retainedMedia.sha256, sha256(publishedMediaBytes));
  assert.equal(observation.retainedMedia.durationSeconds, "325.014");
  assert.match(observation.limitations.join(" "), /does not prove human playback/u);
  assert.match(observation.limitations.join(" "), /does not prove byte identity/u);
  assert.match(observation.limitations.join(" "), /organizer acceptance/u);
});
