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
import { buildDemoTitleCard } from "./demo-video-title-card.mjs";

const EXECUTE_FLAG = "--capture-exact-public-demo-video";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const MODE_ARGUMENT = "--mode";
const VOICEOVER_ARGUMENT = "--voiceover";
const PUBLIC_ORIGIN = "https://proofera.tangvu.dev";
const VIEWPORT = Object.freeze({ height: 900, width: 1440 });
const TIMEOUT_MS = 30_000;
const MAXIMUM_GIT_OUTPUT_BYTES = 8_000_000;
const FINAL_INTRO_HOLD_MS = 8_000;
const FINAL_OUTRO_HOLD_MS = 8_000;
const REHEARSAL_TITLE_HOLD_MS = 2_000;
const RECORDING_LEAD_TRIM_SECONDS = 1;
const NAVIGATION_FADE_MS = 650;
const NAVIGATION_BUDGET_PER_SCENE_MS = 1_000;
const FINAL_VISUAL_TAIL_PADDING_MS = 1_500;
const FINAL_PREREQUISITE_GATES = Object.freeze([
  "production-release",
  "agent-registration",
  "altana-lifecycle",
  "termix-pairs"
]);
const PANCAKE_OUTCOME_REQUIRED_KINDS = Object.freeze([
  "transaction_receipt",
  "before_after_metrics",
  "manual_baseline"
]);
const PRIOR_DEMO_REQUIRED_KINDS = Object.freeze([
  "video",
  "demo_check",
  "automated_playback_check"
]);
const PUBLIC_RUNTIME_PATHS = Object.freeze([
  "apps",
  "packages",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "deploy/windows/ecosystem.config.cjs"
]);
const MAXIMUM_LINEAGE_PATHS = 256;

const SCENES = Object.freeze([
  Object.freeze({
    assertions: ["Four jobs. Equal scrutiny.", "Missing evidence is a result."],
    finalWeight: 83,
    key: "home",
    path: "/",
    rehearsalHoldMs: 3_000
  }),
  Object.freeze({
    assertions: ["Start with the job.", "Four registered analyzers. Zero invented performance."],
    finalWeight: 98,
    key: "marketplace",
    path: "/marketplace",
    rehearsalHoldMs: 3_000
  }),
  Object.freeze({
    assertions: ["LP Range Analyzer", "Identity exists. Execution gates remain closed."],
    finalWeight: 125,
    key: "lp-passport",
    path: "/reference-analyzers/lp-rebalancing",
    rehearsalHoldMs: 3_000
  }),
  Object.freeze({
    assertions: ["Grant once. Keep every action bounded.", "Define the boundaries"],
    finalWeight: 109,
    key: "lp-configuration",
    path: "/lp-activate",
    rehearsalHoldMs: 3_000
  }),
  Object.freeze({
    assertions: ["Proof, including what is missing.", "Seven gates."],
    finalWeight: 163,
    key: "proof-room",
    path: "/proof",
    rehearsalHoldMs: 3_000
  }),
  Object.freeze({
    assertions: ["Control the mandate, not every action.", "No active agent session exists."],
    finalWeight: 96,
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

function pancakeOutcomeSupportsFinalDemo(gate) {
  if (gate === null || typeof gate !== "object" || !Array.isArray(gate.artifacts)) return false;
  const kinds = new Set(gate.artifacts.map((artifact) => artifact?.kind));
  if (!PANCAKE_OUTCOME_REQUIRED_KINDS.every((kind) => kinds.has(kind))) return false;
  if (gate.state === "verified") return Array.isArray(gate.blockers) && gate.blockers.length === 0;
  return (
    gate.state === "controlled_outcome_observed" &&
    Array.isArray(gate.blockers) &&
    gate.blockers.length > 0 &&
    typeof gate.claim === "string" &&
    gate.claim.includes("No fee income, price movement or liquidity change was observed") &&
    gate.claim.includes("neither realized economic benefit nor autonomous-agent advantage")
  );
}

function priorDemoSupportsSuccessor(gate) {
  if (gate?.state === "not_recorded") return true;
  if (
    gate?.state !== "recorded_pending_human_playback" ||
    !Array.isArray(gate.artifacts) ||
    !Array.isArray(gate.blockers) ||
    gate.blockers.length === 0
  ) {
    return false;
  }
  const kinds = new Set(gate.artifacts.map((artifact) => artifact?.kind));
  return PRIOR_DEMO_REQUIRED_KINDS.every((kind) => kinds.has(kind));
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
  const pancakeGate = gates.get("pancake-benefit");
  const demoGate = gates.get("demo");
  if (
    FINAL_PREREQUISITE_GATES.some(
      (gateId) =>
        gates.get(gateId)?.state !== "verified" || gates.get(gateId)?.blockers?.length !== 0
    ) ||
    !pancakeOutcomeSupportsFinalDemo(pancakeGate) ||
    !priorDemoSupportsSuccessor(demoGate) ||
    gates.get("submission")?.state !== "draft" ||
    readiness.readyForSubmission !== false
  ) {
    fail("PUBLIC_DEMO_VIDEO_PREREQUISITES_OPEN");
  }
  return Object.freeze({
    priorDemoGateState: demoGate.state,
    pancakeBenefitClaimVerified: pancakeGate.state === "verified",
    pancakeOutcomeGateState: pancakeGate.state
  });
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

async function exactHealth() {
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
    !/^[0-9a-f]{40}$/u.test(body?.build ?? "")
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

function verifyPublicSourceLineage(publicBuildCommit, sourceCommit) {
  if (publicBuildCommit === sourceCommit) {
    return Object.freeze({
      changedPaths: Object.freeze([]),
      publicBuildCommit,
      relationship: "exact_commit",
      runtimePathsChecked: PUBLIC_RUNTIME_PATHS,
      sourceCommit
    });
  }

  const ancestor = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", publicBuildCommit, sourceCommit],
    { encoding: "utf8", maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES, windowsHide: true }
  );
  if (ancestor.status !== 0 || ancestor.error) fail("PUBLIC_DEMO_VIDEO_BUILD_MISMATCH");

  const runtimeChanges = gitText([
    "diff",
    "--name-only",
    `${publicBuildCommit}..${sourceCommit}`,
    "--",
    ...PUBLIC_RUNTIME_PATHS
  ]);
  if (runtimeChanges !== "") fail("PUBLIC_DEMO_VIDEO_PUBLIC_RUNTIME_MISMATCH");

  const changedText = gitText([
    "diff",
    "--name-only",
    "--diff-filter=ACDMRTUXB",
    `${publicBuildCommit}..${sourceCommit}`,
    "--"
  ]);
  const changedPaths = changedText === "" ? [] : changedText.split(/\r?\n/u);
  if (changedPaths.length === 0 || changedPaths.length > MAXIMUM_LINEAGE_PATHS) {
    fail("PUBLIC_DEMO_VIDEO_LINEAGE_INVALID");
  }
  return Object.freeze({
    changedPaths: Object.freeze(changedPaths),
    publicBuildCommit,
    relationship: "runtime_equivalent_descendant",
    runtimePathsChecked: PUBLIC_RUNTIME_PATHS,
    sourceCommit
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

function probeNarration(path) {
  const stdout = runMediaTool(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,channels,sample_rate",
      "-of",
      "json",
      path
    ],
    "PUBLIC_DEMO_VIDEO_VOICEOVER_PROBE_FAILED"
  );
  let probe;
  try {
    probe = JSON.parse(stdout);
  } catch {
    fail("PUBLIC_DEMO_VIDEO_VOICEOVER_PROBE_INVALID");
  }
  const durationSeconds = Number.parseFloat(probe?.format?.duration ?? "");
  const audioStreams = Array.isArray(probe?.streams)
    ? probe.streams.filter((stream) => stream.codec_type === "audio")
    : [];
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 220 ||
    durationSeconds > 330 ||
    audioStreams.length !== 1
  ) {
    fail("PUBLIC_DEMO_VIDEO_VOICEOVER_MEDIA_INVALID");
  }
  return Object.freeze({
    channels: audioStreams[0].channels,
    codecName: audioStreams[0].codec_name,
    durationSeconds,
    sampleRate: audioStreams[0].sample_rate
  });
}

function decodeMedia(path) {
  runMediaTool(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-"],
    "PUBLIC_DEMO_VIDEO_DECODE_FAILED"
  );
}

async function glide(page, targetFraction, durationMs) {
  await page.evaluate(
    ({ duration, fraction }) =>
      new Promise((resolveGlide) => {
        const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const from = window.scrollY;
        const to = Math.round(maximum * fraction);
        const started = performance.now();
        const frame = (now) => {
          const progress = Math.min(1, (now - started) / duration);
          const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
          window.scrollTo({
            behavior: "instant",
            left: 0,
            top: Math.round(from + (to - from) * eased)
          });
          if (progress < 1) requestAnimationFrame(frame);
          else resolveGlide();
        };
        requestAnimationFrame(frame);
      }),
    { duration: durationMs, fraction: targetFraction }
  );
}

async function tour(page, holdMs) {
  const leadInMs = Math.min(2_500, Math.round(holdMs * 0.12));
  const returnMs = Math.min(5_000, Math.round(holdMs * 0.22));
  const descendMs = Math.max(1_000, holdMs - leadInMs - returnMs);
  await page.waitForTimeout(leadInMs);
  await glide(page, 1, descendMs);
  await glide(page, 0, returnMs);
}

function plannedSceneHolds(mode, narrationDurationSeconds) {
  if (mode === "rehearsal") return SCENES.map((scene) => scene.rehearsalHoldMs);
  const weights = SCENES.map((scene) => scene.finalWeight);
  const transitionBudgetMs =
    SCENES.length * (NAVIGATION_FADE_MS * 2 + NAVIGATION_BUDGET_PER_SCENE_MS);
  const availableMs = Math.max(
    180_000,
    Math.round(narrationDurationSeconds * 1_000) +
      RECORDING_LEAD_TRIM_SECONDS * 1_000 +
      FINAL_VISUAL_TAIL_PADDING_MS -
      FINAL_INTRO_HOLD_MS -
      FINAL_OUTRO_HOLD_MS -
      transitionBudgetMs
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((weight) => Math.round((availableMs * weight) / totalWeight));
}

async function recordTitleCard(page, kind, sourceCommit, holdMs) {
  await page.setContent(buildDemoTitleCard({ kind, sourceCommit }), { waitUntil: "load" });
  await page.locator(`[data-proofera-title-card="${kind}"]`).waitFor({ state: "visible" });
  await page.waitForTimeout(holdMs);
}

async function revealScene(page) {
  await page.evaluate((durationMs) => {
    document.documentElement.style.transition = `opacity ${durationMs}ms cubic-bezier(.2,.8,.2,1)`;
    document.documentElement.style.opacity = "1";
  }, NAVIGATION_FADE_MS);
  await page.waitForTimeout(NAVIGATION_FADE_MS);
}

async function concealScene(page) {
  await page.evaluate(() => {
    document.documentElement.style.opacity = "0";
  });
  await page.waitForTimeout(NAVIGATION_FADE_MS);
}

async function recordBrowserVideo(
  sourceCommit,
  mode,
  temporaryDirectory,
  narrationDurationSeconds
) {
  const workspaceRequire = createRequire(new URL("../package.json", import.meta.url));
  const { chromium } = workspaceRequire("@playwright/test");
  const playwrightVersion = workspaceRequire("@playwright/test/package.json").version;
  const browser = await chromium.launch({ headless: true });
  const retainedScenes = [];
  const retainedTitleCards = [];
  let video;
  const rawPath = join(temporaryDirectory, "browser-tour.webm");
  try {
    const context = await browser.newContext({
      colorScheme: "dark",
      locale: "en-US",
      recordVideo: { dir: temporaryDirectory, size: VIEWPORT },
      reducedMotion: "reduce",
      serviceWorkers: "block",
      viewport: VIEWPORT
    });
    await context.addInitScript(() => {
      document.documentElement.style.background = "#070a08";
      document.documentElement.style.opacity = "0";
    });
    const page = await context.newPage();
    video = page.video();
    page.setDefaultTimeout(TIMEOUT_MS);
    const introHoldMs = mode === "final" ? FINAL_INTRO_HOLD_MS : REHEARSAL_TITLE_HOLD_MS;
    const outroHoldMs = mode === "final" ? FINAL_OUTRO_HOLD_MS : REHEARSAL_TITLE_HOLD_MS;
    await recordTitleCard(page, "intro", sourceCommit, introHoldMs);
    retainedTitleCards.push({ holdMs: introHoldMs, key: "intro", localEditorialCard: true });
    const sceneHolds = plannedSceneHolds(mode, narrationDurationSeconds);
    for (const [sceneIndex, scene] of SCENES.entries()) {
      const expectedUrl = `${PUBLIC_ORIGIN}${scene.path}`;
      const response = await page.goto(expectedUrl, { waitUntil: "domcontentloaded" });
      if (response === null || response.status() !== 200 || page.url() !== expectedUrl) {
        fail("PUBLIC_DEMO_VIDEO_SCENE_RESPONSE_INVALID");
      }
      for (const assertion of scene.assertions) {
        await page.getByText(assertion, { exact: false }).first().waitFor({ state: "visible" });
      }
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolveFrame) =>
          requestAnimationFrame(() => requestAnimationFrame(resolveFrame))
        );
      });
      if (scene.key === "proof-room") {
        await page.getByText(sourceCommit, { exact: true }).waitFor({ state: "visible" });
      }
      await revealScene(page);
      const holdMs = sceneHolds[sceneIndex];
      retainedScenes.push({
        assertions: scene.assertions,
        holdMs,
        httpStatus: response.status(),
        key: scene.key,
        title: await page.title(),
        url: page.url()
      });
      await tour(page, holdMs);
      await concealScene(page);
    }
    await recordTitleCard(page, "outro", sourceCommit, outroHoldMs);
    retainedTitleCards.push({ holdMs: outroHoldMs, key: "outro", localEditorialCard: true });
    await context.close();
    if (video === null || video === undefined) fail("PUBLIC_DEMO_VIDEO_RECORDING_MISSING");
    await video.saveAs(rawPath);
  } finally {
    await browser.close();
  }
  return Object.freeze({
    playwrightVersion,
    rawPath,
    scenes: retainedScenes,
    titleCards: retainedTitleCards
  });
}

async function removeTemporaryDirectory(temporaryDirectory) {
  try {
    await rm(temporaryDirectory, {
      force: true,
      maxRetries: 20,
      recursive: true,
      retryDelay: 250
    });
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
    process.stderr.write(`PUBLIC_DEMO_VIDEO_TEMPORARY_CLEANUP_WARNING:${code}\n`);
  }
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
      "-filter_complex",
      `[0:v:0]trim=start=${RECORDING_LEAD_TRIM_SECONDS},setpts=PTS-STARTPTS[video]`,
      "-map",
      "[video]",
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

async function trimRehearsalVideo(rawPath, outputPath) {
  runMediaTool(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      rawPath,
      "-filter_complex",
      `[0:v:0]trim=start=${RECORDING_LEAD_TRIM_SECONDS},setpts=PTS-STARTPTS[video]`,
      "-map",
      "[video]",
      "-an",
      "-c:v",
      "libvpx",
      "-crf",
      "20",
      "-b:v",
      "2M",
      outputPath
    ],
    "PUBLIC_DEMO_VIDEO_REHEARSAL_TRIM_FAILED"
  );
}

async function capture({ mode, sourceCommit, voiceover }) {
  verifyRelease(sourceCommit);
  const prerequisites = mode === "final" ? verifyFinalPrerequisites() : null;
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
  const narrationProbe =
    mode === "final" ? probeNarration(resolve(repositoryRoot, voiceover)) : null;
  const health = await exactHealth();
  const publicSourceLineage = verifyPublicSourceLineage(health.build, sourceCommit);
  const observedAtUtc = new Date().toISOString();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "proofera-demo-video-"));
  try {
    const recording = await recordBrowserVideo(
      health.build,
      mode,
      temporaryDirectory,
      narrationProbe?.durationSeconds ?? 0
    );
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
      await trimRehearsalVideo(recording.rawPath, temporaryMediaPath);
    }
    const mediaProbe = probeMedia(temporaryMediaPath, mode);
    decodeMedia(temporaryMediaPath);
    const mediaBytes = await readFile(temporaryMediaPath);
    const manifest = {
      schemaVersion: "proofera-public-demo-video-v1.2.0",
      classification: {
        artifact: mode === "final" ? "final_public_demo_video" : "public_demo_video_rehearsal",
        audioPresent: mode === "final",
        browserAutomation: true,
        finalDemoCheck: mode === "final",
        hackathonEntrySubmitted: false,
        localEditorialTitleCards: true,
        onchainReceiptEvidenceIntroduced: false,
        publicRuntimeTreeMatchesCaptureSource: true,
        ...(mode === "final"
          ? {
              pancakeBenefitClaimVerified: prerequisites?.pancakeBenefitClaimVerified === true,
              pancakeOutcomeGateState: prerequisites?.pancakeOutcomeGateState,
              priorDemoGateState: prerequisites?.priorDemoGateState
            }
          : {}),
        playbackDecoded: true,
        submissionReady: false,
        videoRecorded: true
      },
      sourceCommit,
      observedAtUtc,
      publicHealth: health,
      publicSourceLineage,
      captureEnvironment: {
        browser: "chromium",
        locale: "en-US",
        navigationFadeMs: NAVIGATION_FADE_MS,
        playwrightVersion: recording.playwrightVersion,
        reducedMotion: "reduce",
        viewport: VIEWPORT
      },
      voiceover:
        voiceoverEvidence === null ? null : { ...voiceoverEvidence, probe: narrationProbe },
      titleCards: recording.titleCards,
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
              "This artifact binds public rendering to publicHealth.build and retained narration bytes to sourceCommit; publicSourceLineage records their exact relationship and rejects any runtime-path difference.",
              "It proves media decoding and the listed scene assertions; it does not prove the hackathon entry was submitted or accepted.",
              "The collector introduces no onchain evidence; all receipt claims shown in the product must already be bound by the prerequisite readiness gates.",
              prerequisites?.pancakeBenefitClaimVerified === true
                ? "The Pancake benefit gate was verified by the retained readiness record."
                : "The retained Pancake result is a controlled negative outcome, not a realized-benefit or autonomous-agent-advantage claim.",
              "A separate timestamped clean-room playback and authoritative submission receipt remain required."
            ]
          : [
              "This rehearsal binds the rendered pages to publicHealth.build and records how sourceCommit relates to that public build without admitting runtime-path differences.",
              "It proves only that those public pages rendered and that the retained silent browser recording decoded.",
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
    await removeTemporaryDirectory(temporaryDirectory);
  }
}

const input = parseArguments(process.argv.slice(2));
const result = await capture(input);
process.stdout.write(`${JSON.stringify(result)}\n`);
