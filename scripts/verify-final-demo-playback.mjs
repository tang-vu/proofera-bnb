import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const EXECUTE_FLAG = "--verify-final-demo-playback";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const PUBLIC_ORIGIN = "https://proofera.tangvu.dev";
const MAXIMUM_MEDIA_BYTES = 100_000_000;
const MAXIMUM_TOOL_OUTPUT_BYTES = 8_000_000;
const TIMEOUT_MS = 30_000;

function fail(code) {
  throw new Error(code);
}

function parseArguments(argv) {
  if (
    argv.length !== 3 ||
    argv[0] !== EXECUTE_FLAG ||
    argv[1] !== SOURCE_COMMIT_ARGUMENT ||
    !/^[0-9a-f]{40}$/u.test(argv[2] ?? "")
  ) {
    fail("FINAL_DEMO_PLAYBACK_EXACT_INVOCATION_REQUIRED");
  }
  return argv[2];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalTextSha256(bytes) {
  return sha256(Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8"));
}

function runMediaTool(command, args, failureCode) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: MAXIMUM_TOOL_OUTPUT_BYTES,
    timeout: 180_000,
    windowsHide: true
  });
  if (result.status !== 0 || result.error) fail(failureCode);
  return result.stdout;
}

function probeMedia(path) {
  const stdout = runMediaTool(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=format_name,duration,size:stream=codec_type,codec_name,width,height,channels,sample_rate",
      "-of",
      "json",
      path
    ],
    "FINAL_DEMO_PLAYBACK_FFPROBE_FAILED"
  );
  let probe;
  try {
    probe = JSON.parse(stdout);
  } catch {
    fail("FINAL_DEMO_PLAYBACK_FFPROBE_INVALID");
  }
  const video = probe?.streams?.filter((stream) => stream.codec_type === "video") ?? [];
  const audio = probe?.streams?.filter((stream) => stream.codec_type === "audio") ?? [];
  const durationSeconds = Number.parseFloat(probe?.format?.duration ?? "");
  if (
    video.length !== 1 ||
    audio.length !== 1 ||
    video[0].width !== 1440 ||
    video[0].height !== 900 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 240 ||
    durationSeconds > 330
  ) {
    fail("FINAL_DEMO_PLAYBACK_MEDIA_INVALID");
  }
  return Object.freeze({
    audioStream: Object.freeze({
      channels: audio[0].channels,
      codecName: audio[0].codec_name,
      sampleRate: audio[0].sample_rate
    }),
    durationSeconds: durationSeconds.toFixed(3),
    formatNames: probe.format.format_name,
    sizeBytes: Number.parseInt(probe.format.size, 10),
    videoStream: Object.freeze({
      codecName: video[0].codec_name,
      height: video[0].height,
      width: video[0].width
    })
  });
}

function decodeMedia(path) {
  runMediaTool(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"],
    "FINAL_DEMO_PLAYBACK_FULL_DECODE_FAILED"
  );
}

async function pathDoesNotExist(path) {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function verifyPublicScenes(sourceCommit, scenes, repositoryRoot) {
  const workspaceRequire = createRequire(resolve(repositoryRoot, "package.json"));
  const { chromium } = workspaceRequire("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: "en-US",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      viewport: { height: 900, width: 1440 }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);
    const observations = [];
    for (const scene of scenes) {
      const response = await page.goto(scene.url, { waitUntil: "domcontentloaded" });
      if (
        response === null ||
        response.status() !== 200 ||
        page.url() !== scene.url ||
        !scene.url.startsWith(`${PUBLIC_ORIGIN}/`)
      ) {
        fail("FINAL_DEMO_PLAYBACK_PUBLIC_SCENE_INVALID");
      }
      for (const assertion of scene.assertions) {
        await page.getByText(assertion, { exact: false }).first().waitFor({ state: "visible" });
      }
      if (scene.key === "proof-room") {
        await page.getByText(sourceCommit, { exact: true }).waitFor({ state: "visible" });
      }
      observations.push({
        assertionCount: scene.assertions.length,
        bodySha256: sha256(Buffer.from(await page.content(), "utf8")),
        key: scene.key,
        responseDate: response.headers().date ?? null,
        status: response.status(),
        title: await page.title(),
        url: page.url()
      });
    }
    await context.close();
    return observations;
  } finally {
    await browser.close();
  }
}

async function verifyPlayback(sourceCommit) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const finalDirectory = resolve(
    repositoryRoot,
    "evidence",
    "submission",
    "demo-videos",
    sourceCommit,
    "final"
  );
  const sourceManifestPath = resolve(finalDirectory, "manifest.json");
  const sourceManifestBytes = await readFile(sourceManifestPath);
  let sourceManifest;
  try {
    sourceManifest = JSON.parse(sourceManifestBytes.toString("utf8"));
  } catch {
    fail("FINAL_DEMO_PLAYBACK_SOURCE_MANIFEST_INVALID");
  }
  if (
    sourceManifest?.sourceCommit !== sourceCommit ||
    sourceManifest?.classification?.artifact !== "final_public_demo_video" ||
    sourceManifest?.classification?.videoRecorded !== true ||
    sourceManifest?.classification?.audioPresent !== true ||
    !Array.isArray(sourceManifest?.scenes) ||
    sourceManifest.scenes.length !== 6 ||
    sourceManifest?.media?.path !== "proofera-final-demo.mp4" ||
    !/^[0-9a-f]{64}$/u.test(sourceManifest?.media?.sha256 ?? "")
  ) {
    fail("FINAL_DEMO_PLAYBACK_SOURCE_MANIFEST_INVALID");
  }

  const mediaPath = resolve(finalDirectory, sourceManifest.media.path);
  const mediaBytes = await readFile(mediaPath);
  if (
    mediaBytes.length > MAXIMUM_MEDIA_BYTES ||
    sha256(mediaBytes) !== sourceManifest.media.sha256
  ) {
    fail("FINAL_DEMO_PLAYBACK_MEDIA_DIGEST_MISMATCH");
  }

  const outputDirectory = resolve(
    repositoryRoot,
    "evidence",
    "submission",
    "demo-videos",
    sourceCommit,
    "playback"
  );
  if (!(await pathDoesNotExist(outputDirectory))) fail("FINAL_DEMO_PLAYBACK_OUTPUT_EXISTS");

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "proofera-final-demo-playback-"));
  try {
    const copiedMediaPath = resolve(temporaryDirectory, "clean-room-copy.mp4");
    await copyFile(mediaPath, copiedMediaPath);
    const copiedBytes = await readFile(copiedMediaPath);
    if (!mediaBytes.equals(copiedBytes)) fail("FINAL_DEMO_PLAYBACK_COPY_MISMATCH");
    const probe = probeMedia(copiedMediaPath);
    decodeMedia(copiedMediaPath);
    const publicScenes = await verifyPublicScenes(
      sourceCommit,
      sourceManifest.scenes,
      repositoryRoot
    );
    const manifest = {
      schemaVersion: "proofera-final-demo-automated-playback-v1.0.0",
      classification: {
        artifact: "bounded_automated_playback_verification",
        fullAudioVideoDecode: true,
        hackathonEntrySubmitted: false,
        humanAudioIntelligibilityAttested: false,
        independentHumanReviewer: false,
        mediaCopiedToTemporaryBoundary: true,
        separateProcessFromCapture: true,
        submissionReady: false
      },
      sourceCommit,
      observedAtUtc: new Date().toISOString(),
      sourceDemo: {
        manifestPath: relative(repositoryRoot, sourceManifestPath).replaceAll("\\", "/"),
        manifestSha256: canonicalTextSha256(sourceManifestBytes),
        mediaPath: relative(repositoryRoot, mediaPath).replaceAll("\\", "/"),
        mediaSha256: sha256(mediaBytes)
      },
      temporaryCopy: {
        byteIdentityVerified: true,
        bytes: copiedBytes.length,
        sha256: sha256(copiedBytes)
      },
      playback: {
        fullDecodeCompleted: true,
        probe
      },
      publicScenes,
      limitations: [
        "This separate-process check verifies byte identity, one complete audio/video decode, media structure and the six public scene assertions; it is not an independent human review or a separate physical device attestation.",
        "Audio presence and decodability do not prove human-perceived narration intelligibility or presentation quality.",
        "The public checks introduce no transaction evidence and do not prove uptime outside the retained observation window.",
        "This artifact is not an organizer submission receipt and does not claim that the hackathon entry was submitted or accepted."
      ]
    };
    const outputBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await mkdir(outputDirectory);
    await writeFile(resolve(outputDirectory, "manifest.json"), outputBytes, { flag: "wx" });
    return Object.freeze({
      manifest: relative(repositoryRoot, resolve(outputDirectory, "manifest.json")).replaceAll(
        "\\",
        "/"
      ),
      manifestSha256: sha256(outputBytes),
      mediaSha256: sha256(mediaBytes),
      publicScenes: publicScenes.length
    });
  } finally {
    await rm(temporaryDirectory, { force: true, maxRetries: 20, recursive: true, retryDelay: 250 });
  }
}

const sourceCommit = parseArguments(process.argv.slice(2));
const result = await verifyPlayback(sourceCommit);
process.stdout.write(`${JSON.stringify(result)}\n`);
