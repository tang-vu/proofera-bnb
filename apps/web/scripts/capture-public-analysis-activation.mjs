import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const EXECUTE_FLAG = "--capture-public-analysis-activation";
const SOURCE_COMMIT_ARGUMENT = "--source-commit";
const PUBLIC_ORIGIN = "https://proofera.tangvu.dev";
const MAXIMUM_RESPONSE_BYTES = 384 * 1_024;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const agents = Object.freeze([
  Object.freeze({
    category: "lp-rebalancing",
    agentId: "1825",
    endpoint: "https://proofera-lp.tangvu.dev/",
    skill: "analyze_lp_range",
    evidenceSource: "PancakeSwap V3 / controlled ProofEra fixture",
    evidenceEnvironment: "bsc testnet",
    evidenceFactLabels: [
      "Current tick",
      "Position range",
      "Range state",
      "Position liquidity / raw",
      "Fee tier / raw"
    ]
  }),
  Object.freeze({
    category: "grid-trading",
    agentId: "1826",
    endpoint: "https://proofera-grid.tangvu.dev/",
    skill: "analyze_grid_trading",
    evidenceSource: "PancakeSwap V3 / controlled ProofEra fixture",
    evidenceEnvironment: "bsc testnet",
    evidenceFactLabels: [
      "Current tick",
      "sqrtPriceX96 / raw",
      "Tick spacing",
      "Oracle observations",
      "Pool lock state"
    ]
  }),
  Object.freeze({
    category: "yield-optimisation",
    agentId: "1827",
    endpoint: "https://proofera-yield.tangvu.dev/",
    skill: "analyze_yield_opportunities",
    evidenceSource: "Lista Moolah vault list / official API",
    evidenceEnvironment: "bsc mainnet",
    evidenceFactLabels: [
      "Source total",
      "First source / source order",
      "APY / raw decimal",
      "Deposits USD / raw decimal",
      "Utilization / raw decimal"
    ]
  }),
  Object.freeze({
    category: "health-factor-monitoring",
    agentId: "1828",
    endpoint: "https://proofera-health.tangvu.dev/",
    skill: "analyze_venus_health_factor",
    evidenceSource: "Venus Core Pool / unrelated public replay account",
    evidenceEnvironment: "bsc testnet",
    evidenceFactLabels: [
      "Excess liquidity / raw",
      "Shortfall / raw",
      "Contract signal",
      "Health factor",
      "Block hash"
    ]
  })
]);

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
    fail("PUBLIC_ANALYSIS_ACTIVATION_EXACT_INVOCATION_REQUIRED");
  }
  return argv[2];
}

function gitText(args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 8_000_000,
    windowsHide: true
  }).trim();
}

function verifyRelease(sourceCommit) {
  if (gitText(["rev-parse", "HEAD"]) !== sourceCommit) {
    fail("PUBLIC_ANALYSIS_ACTIVATION_HEAD_MISMATCH");
  }
  if (gitText(["rev-parse", "origin/main"]) !== sourceCommit) {
    fail("PUBLIC_ANALYSIS_ACTIVATION_NOT_PUBLISHED");
  }
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("PUBLIC_ANALYSIS_ACTIVATION_WORKTREE_DIRTY");
  }
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

async function fetchJson(path, expectedStatus) {
  const response = await fetch(`${PUBLIC_ORIGIN}${path}`, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000)
  });
  if (response.status !== expectedStatus) fail("PUBLIC_ANALYSIS_ACTIVATION_RELEASE_PROBE_INVALID");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAXIMUM_RESPONSE_BYTES) {
    fail("PUBLIC_ANALYSIS_ACTIVATION_RELEASE_PROBE_TOO_LARGE");
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("PUBLIC_ANALYSIS_ACTIVATION_RELEASE_PROBE_JSON_INVALID");
  }
}

function validateRelease(sourceCommit, health, readiness) {
  if (
    health?.build !== sourceCommit ||
    health?.service !== "proofera-marketplace" ||
    health?.status !== "ok" ||
    readiness?.build !== sourceCommit ||
    readiness?.schemaVersion !== "2" ||
    readiness?.status !== "not_ready" ||
    readiness?.readyForAnalysisActivation !== true ||
    readiness?.readyForCapitalActivation !== false ||
    readiness?.readyForJudging !== false ||
    readiness?.capabilities?.activation !== "analysis_only" ||
    readiness?.capabilities?.capitalExecution !== "unavailable"
  ) {
    fail("PUBLIC_ANALYSIS_ACTIVATION_RELEASE_IDENTITY_INVALID");
  }
}

function terminalText(result) {
  if (typeof result?.decision === "string" && result.decision.length > 0) return result.decision;
  if (typeof result?.error === "string" && result.error.length > 0) return result.error;
  return "terminal_without_decision";
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeExclusive(path, bytes) {
  await writeFile(path, bytes, {
    encoding: typeof bytes === "string" ? "utf8" : undefined,
    flag: "wx"
  });
}

function screenshotMetadata(file, bytes) {
  return Object.freeze({ file, bytes: bytes.byteLength, sha256: sha256(bytes) });
}

function validateRun(agent, body) {
  if (
    (body?.status !== "completed" && body?.status !== "rejected") ||
    typeof body?.runId !== "string" ||
    !/^[A-Za-z0-9-]{8,120}$/u.test(body.runId) ||
    body?.category !== agent.category ||
    body?.agent?.agentId !== agent.agentId ||
    body?.agent?.endpoint !== agent.endpoint ||
    body?.agent?.skill !== agent.skill ||
    typeof body?.observedAtUtc !== "string" ||
    !Number.isInteger(body?.latencyMilliseconds) ||
    body.latencyMilliseconds < 0 ||
    body?.boundary?.chainId !== 97 ||
    body?.boundary?.environment !== "bsc-testnet" ||
    body?.boundary?.executionEnabled !== false ||
    body?.boundary?.walletAccessed !== false ||
    body?.boundary?.transactionSubmitted !== false ||
    body?.boundary?.serverPersistence !== false ||
    body?.result?.executionEnabled !== false
  ) {
    fail("PUBLIC_ANALYSIS_ACTIVATION_RESPONSE_INVALID");
  }
}

async function captureRun(page, agent) {
  await page.goto(`${PUBLIC_ORIGIN}/marketplace?category=${agent.category}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000
  });
  const liveEvidencePanel = page.locator("[data-live-evidence-terminal-state]");
  await liveEvidencePanel.waitFor({ state: "visible", timeout: 30_000 });
  if ((await liveEvidencePanel.getAttribute("data-live-evidence-terminal-state")) !== "available") {
    fail("PUBLIC_ANALYSIS_ACTIVATION_CURRENT_EVIDENCE_UNAVAILABLE");
  }
  const definitionRows = await liveEvidencePanel.locator("dl > div").evaluateAll((rows) =>
    rows.map((row) => ({
      label: row.querySelector("dt")?.textContent?.trim() ?? "",
      value: row.querySelector("dd")?.textContent?.trim() ?? ""
    }))
  );
  const labels = definitionRows.map(({ label }) => label);
  const requiredMetadata = ["Source", "Environment", "Observed", "Freshness", "Method"];
  if (
    new Set(labels).size !== labels.length ||
    definitionRows.some(({ label, value }) => label.length === 0 || value.length === 0) ||
    definitionRows.find(({ label }) => label === "Source")?.value !== agent.evidenceSource ||
    definitionRows.find(({ label }) => label === "Environment")?.value !==
      agent.evidenceEnvironment ||
    definitionRows.find(({ label }) => label === "Observed")?.value === "Not established" ||
    JSON.stringify(labels.filter((label) => !requiredMetadata.includes(label))) !==
      JSON.stringify(agent.evidenceFactLabels) ||
    !(await liveEvidencePanel.getByText("No fallback applied", { exact: true }).isVisible()) ||
    !(await liveEvidencePanel.getByText("Capital execution disabled", { exact: true }).isVisible())
  ) {
    fail("PUBLIC_ANALYSIS_ACTIVATION_CURRENT_EVIDENCE_INVALID");
  }
  const currentEvidenceScreenshotBytes = await liveEvidencePanel.screenshot({ type: "png" });
  const currentEvidenceScreenshot = screenshotMetadata(
    `${agent.category}-current-evidence.png`,
    currentEvidenceScreenshotBytes
  );

  const activationLink = liveEvidencePanel.locator(`a[href="/studio?agent=${agent.category}"]`);
  await activationLink.waitFor({ state: "visible", timeout: 15_000 });
  if (
    (await activationLink.count()) !== 1 ||
    (await activationLink.innerText()).trim() !== "Activate analysis service"
  ) {
    fail("PUBLIC_ANALYSIS_ACTIVATION_MARKETPLACE_LINK_INVALID");
  }
  await activationLink.click();
  await page.waitForURL(`${PUBLIC_ORIGIN}/studio?agent=${agent.category}`, {
    timeout: 15_000
  });
  const selectedTab = page.locator(`#studio-tab-${agent.category}`);
  if ((await selectedTab.getAttribute("aria-selected")) !== "true") {
    fail("PUBLIC_ANALYSIS_ACTIVATION_CATEGORY_HANDOFF_INVALID");
  }

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${PUBLIC_ORIGIN}/api/analyzer-run` &&
      response.request().method() === "POST",
    { timeout: 30_000 }
  );
  await page.getByRole("button", { name: "Activate & run analysis service" }).click();
  const response = await responsePromise;
  if (response.status() !== 200) fail("PUBLIC_ANALYSIS_ACTIVATION_HTTP_INVALID");
  const bytes = await response.body();
  if (bytes.byteLength > MAXIMUM_RESPONSE_BYTES) {
    fail("PUBLIC_ANALYSIS_ACTIVATION_RESPONSE_TOO_LARGE");
  }
  let body;
  try {
    body = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("PUBLIC_ANALYSIS_ACTIVATION_RESPONSE_JSON_INVALID");
  }
  validateRun(agent, body);
  await page
    .getByText(body.status === "completed" ? "Analysis service complete" : "Input rejected", {
      exact: true
    })
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.getByText(body.runId, { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  const runPanel = page
    .getByText("ANALYSIS SERVICE RUN RECORD", { exact: true })
    .locator("xpath=ancestor::section");
  await runPanel.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const analysisRunScreenshotBytes = await runPanel.screenshot({ type: "png" });
  const analysisRunScreenshot = screenshotMetadata(
    `${agent.category}-analysis-run.png`,
    analysisRunScreenshotBytes
  );

  const metadata = Object.fromEntries(
    definitionRows
      .filter(({ label }) => requiredMetadata.includes(label))
      .map(({ label, value }) => [label, value])
  );
  const facts = definitionRows
    .filter(({ label }) => !requiredMetadata.includes(label))
    .map(({ label, value }) => Object.freeze({ label, value }));

  return Object.freeze({
    manifestRun: Object.freeze({
      category: agent.category,
      marketplaceHref: `/studio?agent=${agent.category}`,
      currentEvidence: Object.freeze({
        status: "available",
        source: metadata.Source,
        environment: metadata.Environment,
        observed: metadata.Observed,
        freshness: metadata.Freshness,
        methodology: metadata.Method,
        facts,
        fallbackApplied: false,
        capitalExecutionEnabled: false,
        screenshot: currentEvidenceScreenshot
      }),
      agentId: agent.agentId,
      endpoint: agent.endpoint,
      skill: agent.skill,
      status: body.status,
      runId: body.runId,
      observedAtUtc: body.observedAtUtc,
      latencyMilliseconds: body.latencyMilliseconds,
      methodologyVersion:
        typeof body?.result?.methodologyVersion === "string"
          ? body.result.methodologyVersion
          : body.agent.expectedMethodologyVersion,
      terminal: terminalText(body.result),
      responseBytes: bytes.byteLength,
      responseSha256: sha256(bytes),
      screenshot: analysisRunScreenshot,
      boundary: Object.freeze({
        chainId: 97,
        environment: "bsc-testnet",
        executionEnabled: false,
        walletAccessed: false,
        transactionSubmitted: false,
        serverPersistence: false
      })
    }),
    screenshots: Object.freeze([
      Object.freeze({
        file: currentEvidenceScreenshot.file,
        bytes: currentEvidenceScreenshotBytes
      }),
      Object.freeze({ file: analysisRunScreenshot.file, bytes: analysisRunScreenshotBytes })
    ])
  });
}

async function main() {
  const sourceCommit = parseArguments(process.argv.slice(2));
  verifyRelease(sourceCommit);
  const outputDirectory = resolve(
    repositoryRoot,
    "evidence",
    "submission",
    "public-analysis-activation",
    sourceCommit
  );
  const outputPath = resolve(outputDirectory, "manifest.json");
  if (!(await pathDoesNotExist(outputDirectory))) {
    fail("PUBLIC_ANALYSIS_ACTIVATION_OUTPUT_EXISTS");
  }

  const [health, readiness] = await Promise.all([
    fetchJson("/api/health", 200),
    fetchJson("/api/readiness", 503)
  ]);
  validateRelease(sourceCommit, health, readiness);

  const browser = await chromium.launch({ headless: true });
  const captures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
    await page.goto(PUBLIC_ORIGIN, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByRole("link", { name: "Find an agent" }).click();
    await page.waitForURL(`${PUBLIC_ORIGIN}/marketplace`, { timeout: 15_000 });
    const services = page
      .getByRole("heading", { name: "Four registered analyzers. Zero invented performance." })
      .locator("xpath=ancestor::section");
    for (const agent of agents) {
      const activationLink = services.locator(`a[href="/studio?agent=${agent.category}"]`);
      await activationLink.waitFor({ state: "visible", timeout: 15_000 });
      if (
        (await activationLink.count()) !== 1 ||
        (await activationLink.innerText()).trim() !== "Activate analysis service"
      ) {
        fail("PUBLIC_ANALYSIS_ACTIVATION_CATEGORY_PARITY_INVALID");
      }
    }
    for (const agent of agents) captures.push(await captureRun(page, agent));
  } finally {
    await browser.close();
  }

  const runs = captures.map(({ manifestRun }) => manifestRun);
  const manifest = {
    schemaVersion: "proofera-public-analysis-activation-v2.0.0",
    observedAtUtc: new Date().toISOString(),
    sourceCommit,
    publicOrigin: PUBLIC_ORIGIN,
    classification: {
      boundedHostOriginObservation: true,
      currentEvidenceObserved: true,
      currentEvidenceAppliedToAnalyzer: false,
      analysisServiceActivated: true,
      capitalExecutionPerformed: false,
      transactionSubmitted: false,
      walletAccessed: false,
      organizerEligibilityDecision: false,
      submissionCompleted: false
    },
    journey: [
      "land",
      "find",
      "inspect_current_evidence",
      "understand",
      "activate_analysis",
      "inspect_run"
    ],
    categoryParity: {
      required: 4,
      observed: runs.length,
      categories: agents.map(({ category }) => category)
    },
    readiness: {
      httpStatus: 503,
      status: readiness.status,
      readyForAnalysisActivation: readiness.readyForAnalysisActivation,
      readyForCapitalActivation: readiness.readyForCapitalActivation,
      readyForJudging: readiness.readyForJudging,
      activation: readiness.capabilities.activation,
      capitalExecution: readiness.capabilities.capitalExecution
    },
    runs,
    limitations: [
      "The current-evidence rail and analyzer preset are separate product boundaries. Current marketplace facts are not forwarded into the analyzer request.",
      "Three analyzer presets are synthetic scenarios and the health-factor analyzer input is a retained historical replay; the service runs remain availability/capability evidence.",
      "The controlled Pancake position, source-ordered Lista fields and unrelated public Venus replay do not establish recommendation quality, autonomous performance or economic benefit.",
      "A completed or rejected terminal analyzer response proves the bounded A2A service path, not trading, capital execution, strategy performance or economic benefit.",
      "This host-origin capture is not independent uptime monitoring or an organizer eligibility decision."
    ]
  };
  await mkdir(outputDirectory);
  for (const { screenshots } of captures) {
    for (const screenshot of screenshots) {
      await writeExclusive(resolve(outputDirectory, screenshot.file), screenshot.bytes);
    }
  }
  await writeExclusive(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${outputPath}\n`);
}

await main();
