import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL("./capture-production-release-evidence.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const source = await readFile(scriptUrl, "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const prettierIgnore = await readFile(new URL("../.prettierignore", import.meta.url), "utf8");

test("production release collector is exact-release gated and create-only", () => {
  assert.match(source, /--capture-exact-production-release/u);
  assert.match(source, /--source-base-commit/u);
  assert.match(source, /rev-parse", "origin\/main/u);
  assert.match(source, /status", "--porcelain=v1", "--untracked-files=all/u);
  assert.match(source, /PRODUCTION_RELEASE_OUTPUT_EXISTS/u);
  assert.match(source, /flag: "wx"/u);
  assert.match(prettierIgnore, /^evidence\/submission\/release-probes\/\*\/\*\/manifest\.json$/mu);
  assert.equal(
    packageJson.scripts["capture:production:release"],
    "node ./scripts/capture-production-release-evidence.mjs --capture-exact-production-release --source-base-commit"
  );
});

test("collector fixes the five public hosts and exact judge-facing HTTP surface", () => {
  for (const hostname of [
    "proofera.tangvu.dev",
    "proofera-lp.tangvu.dev",
    "proofera-grid.tangvu.dev",
    "proofera-yield.tangvu.dev",
    "proofera-health.tangvu.dev"
  ]) {
    assert.match(source, new RegExp(hostname.replaceAll(".", "\\."), "u"));
  }
  for (const path of [
    "/api/health",
    "/api/readiness",
    "/proof",
    "/ping",
    "/.well-known/agent-card.json"
  ]) {
    assert.match(source, new RegExp(path.replaceAll("/", "\\/"), "u"));
  }
  assert.match(source, /No \\u2014 gates remain open/u);
  assert.match(source, /audit_altana_permission_bundle/u);
  assert.match(source, /executionEnabled !== false/u);
  assert.match(source, /protocolVersion !== "0\.3\.0"/u);
  assert.match(source, /MAXIMUM_BODY_BYTES = 1_000_000/u);
  assert.match(source, /redirect: "error"/u);
});

test("collector binds official Google and Cloudflare DoH plus authorized TLS", () => {
  assert.match(source, /https:\/\/dns\.google\/resolve/u);
  assert.match(source, /developers\.google\.com\/speed\/public-dns\/docs\/doh\/json/u);
  assert.match(source, /https:\/\/cloudflare-dns\.com\/dns-query/u);
  assert.match(source, /developers\.cloudflare\.com\/1\.1\.1\.1\/encryption\/dns-over-https/u);
  assert.match(source, /PRODUCTION_RELEASE_DNS_RESOLVER_DISAGREEMENT/u);
  assert.match(source, /rejectUnauthorized: true/u);
  assert.match(source, /servername: hostname/u);
  assert.match(source, /PRODUCTION_RELEASE_TLS_JUDGING_WINDOW_UNCOVERED/u);
  assert.match(source, /externalHttpMonitoring: false/u);
  assert.match(source, /onchainReceiptEvidenceIntroduced: false/u);
  assert.match(source, /submissionReady: false/u);
});

test("final mode requires the core receipt and paired-run gates before freeze", () => {
  for (const gate of [
    "agent-registration",
    "altana-lifecycle",
    "pancake-benefit",
    "termix-pairs"
  ]) {
    assert.match(source, new RegExp(`"${gate}"`, "u"));
  }
  assert.match(source, /gates\.get\("production-release"\)\?\.state !== "deployed_unfrozen"/u);
  assert.match(source, /gates\.get\("demo"\)\?\.state !== "not_recorded"/u);
  assert.match(source, /finalReleaseCheck: mode === "final"/u);
});

test("collector rejects missing invocation before Git, DNS, TLS or HTTP", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PRODUCTION_RELEASE_EXACT_INVOCATION_REQUIRED/u);
  assert.doesNotMatch(
    result.stderr,
    /PRODUCTION_RELEASE_(HEAD_MISMATCH|DNS_RESPONSE_INVALID|TLS_FAILED|HTTP_RESPONSE_INVALID)/u
  );
});
