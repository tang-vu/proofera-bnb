import { execFileSync, spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const EXECUTE_FLAG = "--capture-exact-public-demo-video";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const MODE_ARGUMENT = "--mode";
const VOICEOVER_ARGUMENT = "--voiceover";
const PUBLIC_ORIGIN = "https://proofera.tangvu.dev";
const VIEWPORT = Object.freeze({ height: 900, width: 1440 });
const TIMEOUT_MS = 30_000;
const MAXIMUM_GIT_OUTPUT_BYTES = 8_000_000;
const FINAL_PREREQUISITE_GATES = Object.freeze([
  "production-release",
  "agent-registration",
  "altana-lifecycle",
  "pancake-benefit",
  "termix-pairs"
]);

const SCENES = Object.freeze([
  Object.freeze({
    assertions: ["Hire agents by proof,", "Four jobs. Equal scrutiny."],
    finalHoldMs: 32_000,
    key: "home",
    path: "/",
    rehearsalHoldMs: 3_000
  }),
  Object.freeze({
    assertions: ["Start with the job.", "Four analyzers. Zero invented agents."],
    finalHoldMs: 44_000,
    key: "marketplace",
    path: "/marketplace",
    rehearsalHoldMs: 3_000
  }),
  Object.freeze({
    assertions: ["LP Range Analyzer", "Every execution gate is closed."],
    finalHoldMs: 48_000,
    key: "lp-passport",
    path: "/reference-analyzers/lp-rebalancing",
    rehearsalHoldMs: 3_000
  }),
  Object.freeze({
    assertions: ["Set boundaries before authority.", "Define the boundaries"],
    finalHoldMs: 52_000,
    key: "lp-configuration",
    path: "/lp-activate",
    rehearsalHoldMs: 3_000
  }),
  Object.freeze({
    assertions: ["Proof, including what is missing.", "Seven gates."],
    finalHoldMs: 66_000,
    key: "proof-room",
    path: "/proof",
    rehearsalHoldMs: 3_000
  }),
  Object.freeze({
    assertions: ["Mission Control begins with verified state."],
    finalHoldMs: 48_000,
    key: "mission-control",
    path: "/mission-control",
    rehearsalHoldMs: 3_000
  })
]);

function fail(code) {
  throw new Error(code);
}

function parseArguments(argv) {
  const baseValid =
    argv[0] === EXECUTE_FLAG &&
    argv[1] === SOURCE_COMMIT_ARGUMENT &&
    /^[0-9a-f]{40}$/u.test(argv[2] ?? "") &&
    argv[3] === MODE_ARGUMENT &&
    (argv[4] === "rehearsal" || argv[4] === "final");
  if (!baseValid) fail("PUBLIC_DEMO_VIDEO_EXACT_INVOCATION_REQUIRED");

  if (argv[4] === "rehearsal" && argv.length === 5) {
    return Object.freeze({ mode: "rehearsal", sourceCommit: argv[2], voiceover: null });
  }
  if (
    argv[4] === "final" &&
    argv.length === 7 &&
    argv[5] === VOICEOVER_ARGUMENT &&
    typeof argv[6] === "string" &&
    argv[6].length > 0
  ) {
    return Object.freeze({ mode: "final", sourceCommit: argv[2], voiceover: argv[6] });
  }
  fail("PUBLIC_DEMO_VIDEO_EXACT_INVOCATION_REQUIRED");
}

function gitText(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function verifyRelease(sourceCommit) {
  if (gitText(["rev-parse", "HEAD"]) !== sourceCommit) {
    fail("PUBLIC_DEMO_VIDEO_HEAD_MISMATCH");
  }
  if (gitText(["rev-parse", "origin/main"]) !== sourceCommit) {
    fail("PUBLIC_DEMO_VIDEO_RELEASE_NOT_PUBLISHED");
  }
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("PUBLIC_DEMO_VIDEO_WORKTREE_DIRTY");
  }
}

function verifyFinalPrerequisites() {
  let readiness;
  try {
    readiness = JSON.parse(gitText(["show", "HEAD:evidence/submission/readiness.json"]));
  } catch {
    fail("PUBLIC_DEMO_VIDEO_READINESS_INVALID");
  }
  if (!Array.isArray(readiness?.gates)) fail("PUBLIC_DEMO_VIDEO_READINESS_INVALID");
  const gates = new Map(readiness.gates.map((gate) => [gate?.gateId, gate]));
  if (
    FINAL_PREREQUISITE_GATES.some(
      (gateId) =>
        gates.get(gateId)?.state !== "verified" || gates.get(gateId)?.blockers?.length !== 0
    ) ||
    gates.get("demo")?.state !== "not_recorded" ||
    gates.get("submission")?.state !== "draft" ||
    readiness.readyForSubmission !== false
  ) {
    fail("PUBLIC_DEMO_VIDEO_PREREQUISITES_OPEN");
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

async function exactTrackedVoiceover(repositoryRoot, requestedPath, sourceCommit) {
  if (isAbsolute(requestedPath)) fail("PUBLIC_DEMO_VIDEO_VOICEOVER_PATH_INVALID");
  const normalized = requestedPath.replaceAll("\\", "/");
  if (!normalized.startsWith("evidence/submission/narration/") || !/\.mp3$/u.test(normalized)) {
    fail("PUBLIC_DEMO_VIDEO_VOICEOVER_PATH_INVALID");
  }
  const absolute = resolve(repositoryRoot, requestedPath);
  const rootWithSeparator = `${repositoryRoot}${sep}`;
  if (!absolute.startsWith(rootWithSeparator)) fail("PUBLIC_DEMO_VIDEO_VOICEOVER_PATH_INVALID");
  const canonical = await realpath(absolute);
  if (canonical !== absolute) fail("PUBLIC_DEMO_VIDEO_VOICEOVER_PATH_INVALID");
  const repositoryPath = relative(repositoryRoot, absolute).replaceAll("\\", "/");
  gitText(["ls-files", "--error-unmatch", "--", repositoryPath]);
  const committed = execFileSync("git", ["show", `${sourceCommit}:${repositoryPath}`], {
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
  const disk = await readFile(absolute);
  if (!committed.equals(disk)) fail("PUBLIC_DEMO_VIDEO_VOICEOVER_BYTES_MISMATCH");
  return Object.freeze({ bytes: disk.length, path: repositoryPath, sha256: sha256(disk) });
}

async function exactHealth(sourceCommit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${PUBLIC_ORIGIN}/api/health`, {
      headers: { accept: "application/json" },
      method: "GET",
      redirect: "error",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok || response.url !== `${PUBLIC_ORIGIN}/api/health`) {
    fail("PUBLIC_DEMO_VIDEO_HEALTH_INVALID");
  }
  const body = await response.json();
  if (
    body?.service !== "proofera-marketplace" ||
    body?.status !== "ok" ||
    body?.build !== sourceCommit
  ) {
    fail("PUBLIC_DEMO_VIDEO_BUILD_MISMATCH");
  }
  return Object.freeze({
    build: body.build,
    responseDate: response.headers.get("date"),
    status: response.status,
    url: response.url
  });
}

function runMediaTool(command, args, failureCode) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    timeout: 120_000,
    windowsHide: true
  });
  if (result.status !== 0 || result.error) fail(failureCode);
  return result.stdout;
}

function probeMedia(path, mode) {
  const stdout = runMediaTool(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=format_name,duration:stream=codec_type,codec_name,width,height,channels,sample_rate",
      "-of",
      "json",
      path
    ],
    "PUBLIC_DEMO_VIDEO_FFPROBE_FAILED"
  );
  let probe;
  try {
    probe = JSON.parse(stdout);
  } catch {
    fail("PUBLIC_DEMO_VIDEO_FFPROBE_INVALID");
  }
  const durationSeconds = Number.parseFloat(probe?.format?.duration ?? "");
  const videoStreams = Array.isArray(probe?.streams)
    ? probe.streams.filter((stream) => stream.codec_type === "video")
    : [];
  const audioStreams = Array.isArray(probe?.streams)
    ? probe.streams.filter((stream) => stream.codec_type === "audio")
    : [];
  if (
    !Number.isFinite(durationSeconds) ||
    videoStreams.length !== 1 ||
    videoStreams[0].width !== VIEWPORT.width ||
    videoStreams[0].height !== VIEWPORT.height
  ) {
    fail("PUBLIC_DEMO_VIDEO_MEDIA_INVALID");
  }
  if (mode === "final") {
    if (durationSeconds < 240 || durationSeconds > 330 || audioStreams.length !== 1) {
      fail("PUBLIC_DEMO_VIDEO_FINAL_MEDIA_INVALID");
    }
  } else if (durationSeconds < 15 || durationSeconds > 90 || audioStreams.length !== 0) {
    fail("PUBLIC_DEMO_VIDEO_REHEARSAL_MEDIA_INVALID");
  }
  return Object.freeze({
    audioStreams: audioStreams.map(({ channels, codec_name: codecName, sample_rate: sampleRate }) =>
      Object.freeze({ channels, codecName, sampleRate })
    ),
    durationSeconds: durationSeconds.toFixed(3),
    formatNames: probe.format.format_name,
    videoStream: Object.freeze({
      codecName: videoStreams[0].codec_name,
      height: videoStreams[0].height,
      width: videoStreams[0].width
    })
  });
}

function decodeMedia(path) {
  runMediaTool(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-"],
    "PUBLIC_DEMO_VIDEO_DECODE_FAILED"
  );
}

async function tour(page, holdMs) {
  const started = Date.now();
  const stepMs = 750;
  while (Date.now() - started < holdMs) {
    const elapsed = Date.now() - started;
    const phase = Math.min(1, elapsed / holdMs);
    const triangular = phase <= 0.75 ? phase / 0.75 : (1 - phase) / 0.25;
    await page.evaluate(
      (fraction) => {
        const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo({ behavior: "instant", left: 0, top: Math.round(maximum * fraction) });
      },
      Math.max(0, triangular)
    );
    await page.waitForTimeout(Math.min(stepMs, holdMs - elapsed));
  }
  await page.evaluate(() => window.scrollTo({ behavior: "instant", left: 0, top: 0 }));
}

async function recordBrowserVideo(sourceCommit, mode, temporaryDirectory) {
  const workspaceRequire = createRequire(new URL("../package.json", import.meta.url));
  const { chromium } = workspaceRequire("@playwright/test");
  const playwrightVersion = workspaceRequire("@playwright/test/package.json").version;
  const browser = await chromium.launch({ headless: true });
  const retainedScenes = [];
  let video;
  const rawPath = join(temporaryDirectory, "browser-tour.webm");
  try {
    const context = await browser.newContext({
      colorScheme: "light",
      locale: "en-US",
      recordVideo: { dir: temporaryDirectory, size: VIEWPORT },
      reducedMotion: "reduce",
      serviceWorkers: "block",
      viewport: VIEWPORT
    });
    const page = await context.newPage();
    video = page.video();
    page.setDefaultTimeout(TIMEOUT_MS);
    for (const scene of SCENES) {
      const expectedUrl = `${PUBLIC_ORIGIN}${scene.path}`;
      const response = await page.goto(expectedUrl, { waitUntil: "domcontentloaded" });
      if (response === null || response.status() !== 200 || page.url() !== expectedUrl) {
        fail("PUBLIC_DEMO_VIDEO_SCENE_RESPONSE_INVALID");
      }
      for (const assertion of scene.assertions) {
        await page.getByText(assertion, { exact: false }).first().waitFor({ state: "visible" });
      }
      if (scene.key === "proof-room") {
        await page.getByText(sourceCommit, { exact: true }).waitFor({ state: "visible" });
      }
      const holdMs = mode === "final" ? scene.finalHoldMs : scene.rehearsalHoldMs;
      retainedScenes.push({
        assertions: scene.assertions,
        holdMs,
        httpStatus: response.status(),
        key: scene.key,
        title: await page.title(),
        url: page.url()
      });
      await tour(page, holdMs);
    }
    await context.close();
    if (video === null || video === undefined) fail("PUBLIC_DEMO_VIDEO_RECORDING_MISSING");
    await video.saveAs(rawPath);
  } finally {
    await browser.close();
  }
  return Object.freeze({ playwrightVersion, rawPath, scenes: retainedScenes });
}

async function muxFinalVideo(rawPath, voiceoverPath, outputPath) {
  runMediaTool(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      rawPath,
      "-i",
      voiceoverPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath
    ],
    "PUBLIC_DEMO_VIDEO_MUX_FAILED"
  );
}

async function capture({ mode, sourceCommit, voiceover }) {
  verifyRelease(sourceCommit);
  if (mode === "final") verifyFinalPrerequisites();
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const outputDirectory = resolve(
    repositoryRoot,
    "evidence",
    "submission",
    "demo-videos",
    sourceCommit,
    mode
  );
  if (!(await pathDoesNotExist(outputDirectory))) fail("PUBLIC_DEMO_VIDEO_OUTPUT_EXISTS");

  const voiceoverEvidence =
    mode === "final" ? await exactTrackedVoiceover(repositoryRoot, voiceover, sourceCommit) : null;
  const health = await exactHealth(sourceCommit);
  const observedAtUtc = new Date().toISOString();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "proofera-demo-video-"));
  try {
    const recording = await recordBrowserVideo(sourceCommit, mode, temporaryDirectory);
    const extension = mode === "final" ? "mp4" : "webm";
    const mediaFilename = `proofera-${mode}-demo.${extension}`;
    const temporaryMediaPath = join(temporaryDirectory, mediaFilename);
    if (mode === "final") {
      await muxFinalVideo(
        recording.rawPath,
        resolve(repositoryRoot, voiceover),
        temporaryMediaPath
      );
    } else {
      await copyFile(recording.rawPath, temporaryMediaPath, fsConstants.COPYFILE_EXCL);
    }
    const mediaProbe = probeMedia(temporaryMediaPath, mode);
    decodeMedia(temporaryMediaPath);
    const mediaBytes = await readFile(temporaryMediaPath);
    const manifest = {
      schemaVersion: "proofera-public-demo-video-v1.0.0",
      classification: {
        artifact: mode === "final" ? "final_public_demo_video" : "public_demo_video_rehearsal",
        audioPresent: mode === "final",
        browserAutomation: true,
        finalDemoCheck: mode === "final",
        hackathonEntrySubmitted: false,
        onchainReceiptEvidenceIntroduced: false,
        playbackDecoded: true,
        submissionReady: false,
        videoRecorded: true
      },
      sourceCommit,
      observedAtUtc,
      publicHealth: health,
      captureEnvironment: {
        browser: "chromium",
        locale: "en-US",
        playwrightVersion: recording.playwrightVersion,
        reducedMotion: "reduce",
        viewport: VIEWPORT
      },
      voiceover: voiceoverEvidence,
      scenes: recording.scenes,
      media: {
        bytes: mediaBytes.length,
        path: mediaFilename,
        probe: mediaProbe,
        sha256: sha256(mediaBytes)
      },
      limitations:
        mode === "final"
          ? [
              "This artifact proves exact-release public rendering, retained narration bytes, media decoding and the listed scene assertions; it does not prove the hackathon entry was submitted or accepted.",
              "The collector introduces no onchain evidence; all receipt claims shown in the product must already be bound by the prerequisite readiness gates.",
              "A separate timestamped clean-room playback and authoritative submission receipt remain required."
            ]
          : [
              "This rehearsal proves only that the exact public release rendered and that the retained silent browser recording decoded.",
              "It is not the narrated final demo, a clean-room playback, an uptime record, a transaction receipt, or a hackathon submission receipt.",
              "Dynamic upstream data outside the asserted text is not independently authenticated by this artifact."
            ]
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await mkdir(dirname(outputDirectory), { recursive: true });
    await mkdir(outputDirectory);
    await copyFile(
      temporaryMediaPath,
      resolve(outputDirectory, mediaFilename),
      fsConstants.COPYFILE_EXCL
    );
    await writeFile(resolve(outputDirectory, "manifest.json"), manifestBytes, { flag: "wx" });
    return Object.freeze({
      manifest: relative(repositoryRoot, resolve(outputDirectory, "manifest.json")).replaceAll(
        "\\",
        "/"
      ),
      manifestSha256: sha256(manifestBytes),
      media: relative(repositoryRoot, resolve(outputDirectory, mediaFilename)).replaceAll(
        "\\",
        "/"
      ),
      mediaSha256: sha256(mediaBytes),
      mode,
      scenes: recording.scenes.length
    });
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

const input = parseArguments(process.argv.slice(2));
const result = await capture(input);
process.stdout.write(`${JSON.stringify(result)}\n`);
