import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const EXECUTE_FLAG = "--capture-exact-public-demo-rehearsal";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const PUBLIC_ORIGIN = "https://proofera.tangvu.dev";
const VIEWPORT = Object.freeze({ height: 900, width: 1440 });
const TIMEOUT_MS = 30_000;
const MAXIMUM_GIT_OUTPUT_BYTES = 8_000_000;

const SCENES = Object.freeze([
  {
    key: "home",
    path: "/",
    screenshot: "01-home.png",
    assertions: ["Hire agents by proof,", "Four jobs. Equal scrutiny."]
  },
  {
    key: "marketplace",
    path: "/marketplace",
    screenshot: "02-marketplace.png",
    assertions: ["Start with the job.", "Four analyzers. Zero invented agents."]
  },
  {
    key: "lp-passport",
    path: "/reference-analyzers/lp-rebalancing",
    screenshot: "03-lp-passport.png",
    assertions: ["LP Range Analyzer", "Every execution gate is closed."]
  },
  {
    key: "lp-configuration",
    path: "/lp-activate",
    screenshot: "04-lp-configuration.png",
    assertions: ["Set boundaries before authority.", "Define the boundaries"]
  },
  {
    key: "proof-room",
    path: "/proof",
    screenshot: "05-proof-room.png",
    assertions: ["Proof, including what is missing.", "Seven gates. No inferred receipts."]
  },
  {
    key: "mission-control",
    path: "/mission-control",
    screenshot: "06-mission-control.png",
    assertions: ["Mission Control begins with verified state.", "No active agent session exists."]
  }
]);

function fail(code) {
  throw new Error(code);
}

function exactSourceCommit(argv) {
  if (
    argv.length !== 3 ||
    argv[0] !== EXECUTE_FLAG ||
    argv[1] !== SOURCE_COMMIT_ARGUMENT ||
    !/^[0-9a-f]{40}$/u.test(argv[2])
  ) {
    fail("PUBLIC_DEMO_REHEARSAL_EXACT_INVOCATION_REQUIRED");
  }
  return argv[2];
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
    fail("PUBLIC_DEMO_REHEARSAL_HEAD_MISMATCH");
  }
  if (gitText(["rev-parse", "origin/main"]) !== sourceCommit) {
    fail("PUBLIC_DEMO_REHEARSAL_RELEASE_NOT_PUBLISHED");
  }
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("PUBLIC_DEMO_REHEARSAL_WORKTREE_DIRTY");
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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
    fail("PUBLIC_DEMO_REHEARSAL_HEALTH_INVALID");
  }
  const body = await response.json();
  if (
    body?.service !== "proofera-marketplace" ||
    body?.status !== "healthy" ||
    body?.build !== sourceCommit
  ) {
    fail("PUBLIC_DEMO_REHEARSAL_BUILD_MISMATCH");
  }
  return Object.freeze({
    build: body.build,
    responseDate: response.headers.get("date"),
    status: response.status,
    url: response.url
  });
}

async function capture(sourceCommit) {
  verifyRelease(sourceCommit);
  const health = await exactHealth(sourceCommit);
  const observedAtUtc = new Date().toISOString();
  const parent = resolve("evidence", "submission", "rehearsals");
  const outputDirectory = resolve(parent, sourceCommit);
  await mkdir(parent, { recursive: true });
  await mkdir(outputDirectory);

  const workspaceRequire = createRequire(new URL("../package.json", import.meta.url));
  const { chromium } = workspaceRequire("@playwright/test");
  const playwrightVersion = workspaceRequire("@playwright/test/package.json").version;
  const browser = await chromium.launch({ headless: true });
  const retainedScenes = [];
  try {
    const context = await browser.newContext({
      colorScheme: "light",
      locale: "en-US",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      viewport: VIEWPORT
    });
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);

    for (const scene of SCENES) {
      const expectedUrl = `${PUBLIC_ORIGIN}${scene.path}`;
      const response = await page.goto(expectedUrl, { waitUntil: "domcontentloaded" });
      if (response === null || response.status() !== 200 || page.url() !== expectedUrl) {
        fail("PUBLIC_DEMO_REHEARSAL_SCENE_RESPONSE_INVALID");
      }
      for (const assertion of scene.assertions) {
        await page.getByText(assertion, { exact: false }).first().waitFor({ state: "visible" });
      }
      if (scene.key === "proof-room") {
        await page.getByText(sourceCommit, { exact: true }).waitFor({ state: "visible" });
        await page
          .getByText("No — gates remain open.", { exact: true })
          .waitFor({ state: "visible" });
      }
      const screenshotPath = resolve(outputDirectory, scene.screenshot);
      await page.screenshot({ animations: "disabled", fullPage: true, path: screenshotPath });
      const screenshotBytes = await readFile(screenshotPath);
      retainedScenes.push({
        assertions: scene.assertions,
        httpStatus: response.status(),
        key: scene.key,
        screenshot: scene.screenshot,
        screenshotBytes: screenshotBytes.length,
        screenshotSha256: sha256(screenshotBytes),
        title: await page.title(),
        url: page.url()
      });
    }
    await context.close();
  } finally {
    await browser.close();
  }

  const manifest = {
    schemaVersion: "proofera-public-demo-rehearsal-v1.0.0",
    classification: {
      artifact: "public_demo_rehearsal",
      browserAutomation: true,
      finalDemoCheck: false,
      hackathonEntrySubmitted: false,
      onchainReceiptEvidenceIntroduced: false,
      submissionReady: false,
      videoRecorded: false
    },
    sourceCommit,
    observedAtUtc,
    publicHealth: health,
    captureEnvironment: {
      browser: "chromium",
      locale: "en-US",
      playwrightVersion,
      reducedMotion: "reduce",
      viewport: VIEWPORT
    },
    scenes: retainedScenes,
    limitations: [
      "Screenshots prove only that the listed public pages rendered the asserted text at capture time.",
      "This rehearsal is not a demo video, uptime record, accessibility audit, wallet ceremony, transaction receipt, agent registration, execution proof, performance result, or hackathon submission receipt.",
      "Dynamic upstream data outside the asserted text is not independently authenticated by this artifact."
    ]
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = resolve(outputDirectory, "manifest.json");
  await writeFile(manifestPath, manifestBytes, { encoding: "utf8", flag: "wx" });
  return {
    manifest: manifestPath,
    manifestSha256: sha256(manifestBytes),
    scenes: retainedScenes.length
  };
}

const sourceCommit = exactSourceCommit(process.argv.slice(2));
const result = await capture(sourceCommit);
process.stdout.write(`${JSON.stringify(result)}\n`);
