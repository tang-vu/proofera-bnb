import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, "..");
const configPath = path.join(repositoryRoot, "deploy", "windows", "ecosystem.config.cjs");
const require = createRequire(import.meta.url);

test("local production topology is loopback-only and exposes five distinct processes", () => {
  const config = require(configPath);
  assert.equal(config.apps.length, 5);
  assert.equal(new Set(config.apps.map(({ name }) => name)).size, 5);

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
      ports.push(3_030);
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

test("tracked production files contain no credential fields or tunnel tokens", async () => {
  const sources = await Promise.all([
    readFile(configPath, "utf8"),
    readFile(path.join(directory, "check-local-production.mjs"), "utf8")
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
  assert.match(source, /executionEnabled === false/);
});
