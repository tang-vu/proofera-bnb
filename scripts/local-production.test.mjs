import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, "..");
const configPath = path.join(repositoryRoot, "deploy", "windows", "ecosystem.config.cjs");
const require = createRequire(import.meta.url);
const testBuild = "test-release-0123456789";
const previousBuild = process.env.PROOFERA_BUILD_VERSION;
process.env.PROOFERA_BUILD_VERSION = testBuild;
const config = require(configPath);
if (previousBuild === undefined) delete process.env.PROOFERA_BUILD_VERSION;
else process.env.PROOFERA_BUILD_VERSION = previousBuild;

test("local production topology is loopback-only and exposes seven distinct processes", () => {
  assert.equal(config.apps.length, 7);
  assert.equal(new Set(config.apps.map(({ name }) => name)).size, 7);

  const ports = [];
  for (const application of config.apps) {
    assert.equal(application.instances, 1);
    assert.equal(application.exec_mode, "fork");
    assert.equal(application.autorestart, true);
    assert.match(application.cwd, /proofera-bnb/);

    if (application.name === "proofera-web") {
      assert.match(application.args, /--hostname 127\.0\.0\.1 --port 3030$/);
      assert.equal(application.env.NEXT_PUBLIC_APP_ORIGIN, "https://proofera.tangvu.dev");
      assert.equal(application.env.NEXT_PUBLIC_ALTANA_RP_ID, "proofera.tangvu.dev");
      assert.equal(application.env.PROOFERA_BUILD_VERSION, testBuild);
      assert.equal(application.env.PROOFERA_DATA_MODE, "strict");
      ports.push(3_030);
      continue;
    }

    if (application.name === "proofera-monitor") {
      assert.equal(application.script, "scripts/monitor-public-production.mjs");
      assert.equal(application.env.PROOFERA_BUILD_VERSION, testBuild);
      assert.equal(application.env.PROOFERA_MONITOR_INTERVAL_MS, "300000");
      continue;
    }

    if (application.name === "proofera-altana-test-action-worker") {
      assert.equal(application.script, "scripts/altana-test-action-worker.mjs");
      assert.equal(application.args, "--run");
      assert.equal(application.env.PROOFERA_BUILD_VERSION, testBuild);
      assert.deepEqual(Object.keys(application.env).sort(), ["NODE_ENV", "PROOFERA_BUILD_VERSION"]);
      continue;
    }

    assert.equal(application.env.AGENT_BIND_HOST, "127.0.0.1");
    assert.match(
      application.env.AGENTCORE_RUNTIME_URL,
      /^https:\/\/proofera-[a-z]+\.tangvu\.dev\/$/
    );
    ports.push(Number(application.env.AGENT_PORT));
  }

  assert.deepEqual(ports, [3_030, 9_101, 9_102, 9_103, 9_104]);
  assert.equal(new Set(ports).size, ports.length);
});

test("PM2 topology refuses a missing or malformed immutable build identifier", () => {
  for (const value of [undefined, "", "branch/name", "a".repeat(129)]) {
    const environment = { ...process.env };
    if (value === undefined) delete environment.PROOFERA_BUILD_VERSION;
    else environment.PROOFERA_BUILD_VERSION = value;
    const result = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(configPath)})`], {
      encoding: "utf8",
      env: environment,
      windowsHide: true
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PROOFERA_BUILD_VERSION must be an immutable release identifier/);
  }
});

test("tracked production files contain no credential fields or tunnel tokens", async () => {
  const sources = await Promise.all([
    readFile(configPath, "utf8"),
    readFile(path.join(directory, "check-local-production.mjs"), "utf8"),
    readFile(path.join(directory, "monitor-public-production.mjs"), "utf8")
  ]);
  const combined = sources.join("\n");

  assert.doesNotMatch(combined, /(?:api|access|auth|tunnel)[_-]?(?:key|secret|token)\s*[:=]/i);
  assert.doesNotMatch(combined, /eyJ[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(combined, /-----BEGIN [A-Z ]+PRIVATE KEY-----/);
});

test("public smoke probe covers the marketplace, every agent, and every Agent Card", async () => {
  const source = await readFile(path.join(directory, "check-local-production.mjs"), "utf8");
  for (const hostname of [
    "proofera.tangvu.dev",
    "proofera-lp.tangvu.dev",
    "proofera-grid.tangvu.dev",
    "proofera-yield.tangvu.dev",
    "proofera-health.tangvu.dev"
  ]) {
    assert.match(source, new RegExp(hostname.replaceAll(".", "\\.")));
  }
  assert.match(source, /\.well-known\/agent-card\.json/);
  for (const skillId of [
    "analyze_lp_range",
    "audit_altana_permission_bundle",
    "analyze_grid_trading",
    "analyze_yield_opportunities",
    "analyze_venus_health_factor"
  ]) {
    assert.match(source, new RegExp(skillId));
  }
  assert.match(source, /body\.skills\.map\(\(skill\) => skill\.id\)/);
  assert.match(source, /JSON\.stringify\(expectedSkills\)/);
  assert.match(source, /executionEnabled === false/);
  assert.match(source, /marketplace-readiness/);
  assert.match(source, /marketplace-proof-room/);
  assert.match(source, /body\.includes\(expectedBuild\)/);
  assert.match(source, /No — gates remain open/);
  assert.match(source, /audit_altana_permission_bundle/);
  assert.match(source, /body\?\.build === expectedBuild/);
});

test("production monitor keeps one long-lived interval without an unsettled await", async () => {
  const source = await readFile(path.join(directory, "monitor-public-production.mjs"), "utf8");
  assert.match(source, /setInterval\(\(\) => void monitor\(\), intervalCandidate\);/);
  assert.doesNotMatch(source, /\.unref\(\)/);
  assert.doesNotMatch(source, /new Promise\(\(\) => \{\}\)/);
});
