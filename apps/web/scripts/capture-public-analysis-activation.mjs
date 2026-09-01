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
    skill: "analyze_lp_range"
  }),
  Object.freeze({
    category: "grid-trading",
    agentId: "1826",
    endpoint: "https://proofera-grid.tangvu.dev/",
    skill: "analyze_grid_trading"
  }),
  Object.freeze({
    category: "yield-optimisation",
    agentId: "1827",
    endpoint: "https://proofera-yield.tangvu.dev/",
    skill: "analyze_yield_opportunities"
  }),
  Object.freeze({
    category: "health-factor-monitoring",
    agentId: "1828",
    endpoint: "https://proofera-health.tangvu.dev/",
    skill: "analyze_venus_health_factor"
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
  await page.goto(`${PUBLIC_ORIGIN}/marketplace`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000
  });
  const activationLink = page.locator(`a[href="/studio?agent=${agent.category}"]`);
  await activationLink.waitFor({ state: "visible", timeout: 15_000 });
  if (
    (await activationLink.count()) !== 1 ||
    (await activationLink.innerText()).trim() !== "Run live analyzer"
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
  await page.getByRole("button", { name: "Run public analyzer" }).click();
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
    .getByText(body.status === "completed" ? "Analysis complete" : "Input rejected", {
      exact: true
    })
    .waitFor({ state: "visible", timeout: 15_000 });

  return Object.freeze({
    category: agent.category,
    marketplaceHref: `/studio?agent=${agent.category}`,
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
    responseSha256: createHash("sha256").update(bytes).digest("hex"),
    boundary: Object.freeze({
      chainId: 97,
      environment: "bsc-testnet",
      executionEnabled: false,
      walletAccessed: false,
      transactionSubmitted: false,
      serverPersistence: false
    })
  });
}

async function main() {
  const sourceCommit = parseArguments(process.argv.slice(2));
  verifyRelease(sourceCommit);
  const outputPath = resolve(
    repositoryRoot,
    "evidence",
    "submission",
    "public-analysis-activation",
    sourceCommit,
    "manifest.json"
  );
  if (!(await pathDoesNotExist(outputPath))) {
    fail("PUBLIC_ANALYSIS_ACTIVATION_OUTPUT_EXISTS");
  }

  const [health, readiness] = await Promise.all([
    fetchJson("/api/health", 200),
    fetchJson("/api/readiness", 503)
  ]);
  validateRelease(sourceCommit, health, readiness);

  const browser = await chromium.launch({ headless: true });
  const runs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(PUBLIC_ORIGIN, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByRole("link", { name: "Find an agent" }).click();
    await page.waitForURL(`${PUBLIC_ORIGIN}/marketplace`, { timeout: 15_000 });
    for (const agent of agents) {
      const activationLink = page.locator(`a[href="/studio?agent=${agent.category}"]`);
      await activationLink.waitFor({ state: "visible", timeout: 15_000 });
      if (
        (await activationLink.count()) !== 1 ||
        (await activationLink.innerText()).trim() !== "Run live analyzer"
      ) {
        fail("PUBLIC_ANALYSIS_ACTIVATION_CATEGORY_PARITY_INVALID");
      }
    }
    for (const agent of agents) runs.push(await captureRun(page, agent));
  } finally {
    await browser.close();
  }

  const manifest = {
    schemaVersion: "proofera-public-analysis-activation-v1.0.0",
    observedAtUtc: new Date().toISOString(),
    sourceCommit,
    publicOrigin: PUBLIC_ORIGIN,
    classification: {
      boundedHostOriginObservation: true,
      analysisServiceActivated: true,
      capitalExecutionPerformed: false,
      transactionSubmitted: false,
      walletAccessed: false,
      organizerEligibilityDecision: false,
      submissionCompleted: false
    },
    journey: ["land", "find", "understand", "activate_analysis", "inspect"],
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
      "Three presets are synthetic scenarios and the health-factor input is a retained historical replay; these runs are service-availability evidence, not current market evidence.",
      "A completed or rejected terminal analyzer response proves the bounded A2A service path, not trading, capital execution, strategy performance or economic benefit.",
      "This host-origin capture is not independent uptime monitoring or an organizer eligibility decision."
    ]
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  process.stdout.write(`${outputPath}\n`);
}

await main();
