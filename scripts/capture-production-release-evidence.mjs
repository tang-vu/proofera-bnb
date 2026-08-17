import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import tls from "node:tls";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXECUTE_FLAG = "--capture-exact-production-release";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const MODE_ARGUMENT = "--mode";
const PUBLIC_ORIGIN = "https://proofera.tangvu.dev";
const MAXIMUM_BODY_BYTES = 1_000_000;
const MAXIMUM_GIT_OUTPUT_BYTES = 8_000_000;
const TIMEOUT_MS = 15_000;
const JUDGING_THROUGH_UTC = "2026-09-23T23:59:59.000Z";
const FINAL_PREREQUISITE_GATES = Object.freeze([
  "agent-registration",
  "altana-lifecycle",
  "pancake-benefit",
  "termix-pairs"
]);

const AGENTS = Object.freeze([
  Object.freeze({
    key: "lp-range",
    origin: "https://proofera-lp.tangvu.dev",
    skills: Object.freeze(["analyze_lp_range", "audit_altana_permission_bundle"])
  }),
  Object.freeze({
    key: "grid-trading",
    origin: "https://proofera-grid.tangvu.dev",
    skills: Object.freeze(["analyze_grid_trading"])
  }),
  Object.freeze({
    key: "yield-optimisation",
    origin: "https://proofera-yield.tangvu.dev",
    skills: Object.freeze(["analyze_yield_opportunities"])
  }),
  Object.freeze({
    key: "health-factor",
    origin: "https://proofera-health.tangvu.dev",
    skills: Object.freeze(["analyze_venus_health_factor"])
  })
]);

const HOSTS = Object.freeze([
  new URL(PUBLIC_ORIGIN).hostname,
  ...AGENTS.map(({ origin }) => new URL(origin).hostname)
]);

const DNS_RESOLVERS = Object.freeze([
  Object.freeze({
    documentation: "https://developers.google.com/speed/public-dns/docs/doh/json",
    endpoint: "https://dns.google/resolve",
    key: "google-public-dns"
  }),
  Object.freeze({
    documentation:
      "https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/",
    endpoint: "https://cloudflare-dns.com/dns-query",
    key: "cloudflare-1.1.1.1"
  })
]);

function fail(code) {
  throw new Error(code);
}

function parseArguments(argv) {
  if (
    argv.length !== 5 ||
    argv[0] !== EXECUTE_FLAG ||
    argv[1] !== SOURCE_COMMIT_ARGUMENT ||
    !/^[0-9a-f]{40}$/u.test(argv[2] ?? "") ||
    argv[3] !== MODE_ARGUMENT ||
    (argv[4] !== "rehearsal" && argv[4] !== "final")
  ) {
    fail("PRODUCTION_RELEASE_EXACT_INVOCATION_REQUIRED");
  }
  return Object.freeze({ mode: argv[4], sourceCommit: argv[2] });
}

function gitText(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function verifyRelease(sourceCommit) {
  if (gitText(["rev-parse", "HEAD"]) !== sourceCommit) fail("PRODUCTION_RELEASE_HEAD_MISMATCH");
  if (gitText(["rev-parse", "origin/main"]) !== sourceCommit) {
    fail("PRODUCTION_RELEASE_NOT_PUBLISHED");
  }
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("PRODUCTION_RELEASE_WORKTREE_DIRTY");
  }
}

function verifyFinalPrerequisites() {
  let readiness;
  try {
    readiness = JSON.parse(gitText(["show", "HEAD:evidence/submission/readiness.json"]));
  } catch {
    fail("PRODUCTION_RELEASE_READINESS_INVALID");
  }
  if (!Array.isArray(readiness?.gates)) fail("PRODUCTION_RELEASE_READINESS_INVALID");
  const gates = new Map(readiness.gates.map((gate) => [gate?.gateId, gate]));
  if (
    gates.get("production-release")?.state !== "deployed_unfrozen" ||
    FINAL_PREREQUISITE_GATES.some(
      (gateId) =>
        gates.get(gateId)?.state !== "verified" || gates.get(gateId)?.blockers?.length !== 0
    ) ||
    gates.get("demo")?.state !== "not_recorded" ||
    gates.get("submission")?.state !== "draft" ||
    readiness.readyForSubmission !== false
  ) {
    fail("PRODUCTION_RELEASE_PREREQUISITES_OPEN");
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

async function readBounded(response) {
  if (response.body === null) fail("PRODUCTION_RELEASE_HTTP_BODY_MISSING");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAXIMUM_BODY_BYTES) {
      await reader.cancel();
      fail("PRODUCTION_RELEASE_HTTP_BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total
  );
}

function exactJson(bytes, code) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(code);
  }
}

function publicHeaders(response) {
  return Object.freeze({
    cacheControl: response.headers.get("cache-control"),
    contentType: response.headers.get("content-type"),
    date: response.headers.get("date"),
    proofEraService: response.headers.get("x-proofera-service")
  });
}

async function fetchExact(url, expectedStatus, accept) {
  const response = await fetch(url, {
    headers: { accept },
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (response.status !== expectedStatus || response.url !== url) {
    fail("PRODUCTION_RELEASE_HTTP_RESPONSE_INVALID");
  }
  const bytes = await readBounded(response);
  return Object.freeze({
    bytes,
    headers: publicHeaders(response),
    status: response.status,
    url: response.url
  });
}

async function captureHttp(sourceCommit) {
  const observations = [];

  const health = await fetchExact(`${PUBLIC_ORIGIN}/api/health`, 200, "application/json");
  const healthBody = exactJson(health.bytes, "PRODUCTION_RELEASE_HEALTH_JSON_INVALID");
  if (
    healthBody?.service !== "proofera-marketplace" ||
    healthBody?.status !== "ok" ||
    healthBody?.build !== sourceCommit
  ) {
    fail("PRODUCTION_RELEASE_HEALTH_INVALID");
  }
  observations.push(
    httpObservation("marketplace-health", health, {
      build: healthBody.build,
      service: healthBody.service,
      status: healthBody.status
    })
  );

  const readiness = await fetchExact(`${PUBLIC_ORIGIN}/api/readiness`, 503, "application/json");
  const readinessBody = exactJson(readiness.bytes, "PRODUCTION_RELEASE_READINESS_JSON_INVALID");
  if (
    readinessBody?.build !== sourceCommit ||
    readinessBody?.status !== "not_ready" ||
    readinessBody?.readyForActivation !== false ||
    readinessBody?.readyForJudging !== false ||
    readinessBody?.capabilities?.activation !== "unavailable"
  ) {
    fail("PRODUCTION_RELEASE_READINESS_HTTP_INVALID");
  }
  observations.push(
    httpObservation("marketplace-readiness", readiness, {
      build: readinessBody.build,
      activation: readinessBody.capabilities.activation,
      readyForActivation: readinessBody.readyForActivation,
      readyForJudging: readinessBody.readyForJudging,
      status: readinessBody.status
    })
  );

  const proof = await fetchExact(`${PUBLIC_ORIGIN}/proof`, 200, "text/html");
  const proofText = proof.bytes.toString("utf8");
  if (
    !proofText.includes(sourceCommit) ||
    !proofText.includes("No \u2014 gates remain open") ||
    !proofText.includes("audit_altana_permission_bundle")
  ) {
    fail("PRODUCTION_RELEASE_PROOF_ROOM_INVALID");
  }
  observations.push(
    httpObservation("marketplace-proof-room", proof, {
      buildVisible: true,
      openGatesVisible: true,
      permissionAuditSkillVisible: true
    })
  );

  for (const agent of AGENTS) {
    const ping = await fetchExact(`${agent.origin}/ping`, 200, "application/json");
    const pingBody = exactJson(ping.bytes, "PRODUCTION_RELEASE_AGENT_PING_JSON_INVALID");
    if (pingBody?.status !== "HEALTHY" || pingBody?.executionEnabled !== false) {
      fail("PRODUCTION_RELEASE_AGENT_PING_INVALID");
    }
    observations.push(
      httpObservation(`${agent.key}-ping`, ping, {
        executionEnabled: pingBody.executionEnabled,
        status: pingBody.status
      })
    );

    const card = await fetchExact(
      `${agent.origin}/.well-known/agent-card.json`,
      200,
      "application/json"
    );
    const cardBody = exactJson(card.bytes, "PRODUCTION_RELEASE_AGENT_CARD_JSON_INVALID");
    const skillIds = Array.isArray(cardBody?.skills)
      ? cardBody.skills.map((skill) => skill?.id)
      : null;
    if (
      cardBody?.url !== `${agent.origin}/` ||
      cardBody?.protocolVersion !== "0.3.0" ||
      JSON.stringify(skillIds) !== JSON.stringify(agent.skills)
    ) {
      fail("PRODUCTION_RELEASE_AGENT_CARD_INVALID");
    }
    observations.push(
      httpObservation(`${agent.key}-agent-card`, card, {
        protocolVersion: cardBody.protocolVersion,
        skillIds,
        url: cardBody.url
      })
    );
  }
  return Object.freeze(observations);
}

function httpObservation(key, response, facts) {
  return Object.freeze({
    bodyBytes: response.bytes.length,
    bodySha256: sha256(response.bytes),
    facts: Object.freeze(facts),
    headers: response.headers,
    key,
    status: response.status,
    url: response.url
  });
}

function validIpv4(value) {
  const parts = typeof value === "string" ? value.split(".") : [];
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/u.test(part) && Number.parseInt(part, 10) <= 255 && String(Number(part)) === part
    )
  );
}

async function queryDns(resolver, hostname) {
  const url = `${resolver.endpoint}?name=${encodeURIComponent(hostname)}&type=A`;
  const response = await fetchExact(url, 200, "application/dns-json");
  const body = exactJson(response.bytes, "PRODUCTION_RELEASE_DNS_JSON_INVALID");
  const expectedQuestion = `${hostname}.`;
  if (
    body?.Status !== 0 ||
    body?.TC !== false ||
    !Array.isArray(body?.Question) ||
    body.Question.length !== 1 ||
    body.Question[0]?.name?.toLowerCase() !== expectedQuestion ||
    body.Question[0]?.type !== 1 ||
    !Array.isArray(body?.Answer)
  ) {
    fail("PRODUCTION_RELEASE_DNS_RESPONSE_INVALID");
  }
  const addresses = body.Answer.filter((answer) => answer?.type === 1).map((answer) => answer.data);
  if (addresses.length === 0 || addresses.some((address) => !validIpv4(address))) {
    fail("PRODUCTION_RELEASE_DNS_ADDRESS_INVALID");
  }
  const uniqueAddresses = [...new Set(addresses)].sort();
  if (uniqueAddresses.length !== addresses.length) fail("PRODUCTION_RELEASE_DNS_ADDRESS_DUPLICATE");
  return Object.freeze({
    addresses: Object.freeze(uniqueAddresses),
    authenticatedData: body.AD === true,
    bodyBytes: response.bytes.length,
    bodySha256: sha256(response.bytes),
    documentation: resolver.documentation,
    resolver: resolver.key,
    responseDate: response.headers.date,
    url
  });
}

async function captureDns() {
  const hosts = [];
  for (const hostname of HOSTS) {
    const observations = [];
    for (const resolver of DNS_RESOLVERS) observations.push(await queryDns(resolver, hostname));
    const expected = JSON.stringify(observations[0].addresses);
    if (observations.some(({ addresses }) => JSON.stringify(addresses) !== expected)) {
      fail("PRODUCTION_RELEASE_DNS_RESOLVER_DISAGREEMENT");
    }
    hosts.push(
      Object.freeze({
        agreedAddresses: observations[0].addresses,
        hostname,
        resolverAgreement: true,
        resolvers: Object.freeze(observations)
      })
    );
  }
  return Object.freeze(hosts);
}

function tlsSnapshot(hostname, mode) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = tls.connect({
      ALPNProtocols: ["h2", "http/1.1"],
      host: hostname,
      port: 443,
      rejectUnauthorized: true,
      servername: hostname
    });
    let settled = false;
    const reject = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      rejectPromise(error instanceof Error ? error : new Error("PRODUCTION_RELEASE_TLS_FAILED"));
    };
    socket.setTimeout(TIMEOUT_MS, () => reject(new Error("PRODUCTION_RELEASE_TLS_TIMEOUT")));
    socket.once("error", reject);
    socket.once("secureConnect", () => {
      try {
        if (!socket.authorized) fail("PRODUCTION_RELEASE_TLS_UNAUTHORIZED");
        const certificate = socket.getPeerCertificate();
        const validFrom = new Date(certificate.valid_from);
        const validTo = new Date(certificate.valid_to);
        if (
          !Number.isFinite(validFrom.getTime()) ||
          !Number.isFinite(validTo.getTime()) ||
          validFrom.getTime() > Date.now() ||
          validTo.getTime() <= Date.now() ||
          typeof certificate.fingerprint256 !== "string" ||
          !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/u.test(certificate.fingerprint256)
        ) {
          fail("PRODUCTION_RELEASE_TLS_CERTIFICATE_INVALID");
        }
        if (mode === "final" && validTo.getTime() < Date.parse(JUDGING_THROUGH_UTC)) {
          fail("PRODUCTION_RELEASE_TLS_JUDGING_WINDOW_UNCOVERED");
        }
        const cipher = socket.getCipher();
        const result = Object.freeze({
          alpnProtocol: socket.alpnProtocol,
          authorized: socket.authorized,
          cipher: cipher?.name ?? null,
          fingerprint256: certificate.fingerprint256,
          hostname,
          issuer: Object.freeze({
            commonName: certificate.issuer?.CN ?? null,
            organization: certificate.issuer?.O ?? null
          }),
          protocol: socket.getProtocol(),
          serialNumber: certificate.serialNumber,
          subjectCommonName: certificate.subject?.CN ?? null,
          validFromUtc: validFrom.toISOString(),
          validToUtc: validTo.toISOString()
        });
        settled = true;
        socket.end();
        resolvePromise(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function captureTls(mode) {
  const observations = [];
  for (const hostname of HOSTS) observations.push(await tlsSnapshot(hostname, mode));
  return Object.freeze(observations);
}

async function capture({ mode, sourceCommit }) {
  verifyRelease(sourceCommit);
  if (mode === "final") verifyFinalPrerequisites();
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const outputDirectory = resolve(
    repositoryRoot,
    "evidence",
    "submission",
    "release-probes",
    sourceCommit,
    mode
  );
  if (!(await pathDoesNotExist(outputDirectory))) fail("PRODUCTION_RELEASE_OUTPUT_EXISTS");

  const observedAtUtc = new Date().toISOString();
  const dns = await captureDns();
  const tlsEvidence = await captureTls(mode);
  const http = await captureHttp(sourceCommit);
  const completedAtUtc = new Date().toISOString();
  const manifest = {
    schemaVersion: "proofera-production-release-evidence-v1.0.0",
    classification: {
      artifact:
        mode === "final" ? "final_production_release_probe" : "production_release_rehearsal",
      externalHttpMonitoring: false,
      finalReleaseCheck: mode === "final",
      hackathonEntrySubmitted: false,
      independentDnsResolvers: DNS_RESOLVERS.length,
      onchainReceiptEvidenceIntroduced: false,
      readOnly: true,
      submissionReady: false
    },
    sourceCommit,
    mode,
    observedAtUtc,
    completedAtUtc,
    judgingThroughUtc: JUDGING_THROUGH_UTC,
    topology: {
      agentCount: AGENTS.length,
      hostCount: HOSTS.length,
      marketplaceOrigin: PUBLIC_ORIGIN
    },
    dns,
    tls: tlsEvidence,
    http,
    summary: {
      dnsAgreement: dns.every(({ resolverAgreement }) => resolverAgreement),
      exactBuildObserved: http.some(
        ({ key, facts }) => key === "marketplace-health" && facts.build === sourceCommit
      ),
      httpObservationCount: http.length,
      tlsAuthorized: tlsEvidence.every(({ authorized }) => authorized)
    },
    limitations: [
      "HTTP and TLS requests originated from the production host network, not an independent external uptime monitor.",
      "Google and Cloudflare agreed on public A records; their AD fields are retained and resolver agreement is not represented as DNSSEC proof.",
      "TLS, DNS, health, readiness and render observations prove bounded availability only; they do not prove ERC-8004 registration, authority, transactions, performance, judging uptime or hackathon submission.",
      mode === "final"
        ? "Final mode freezes only the exact observed release; a separate rollback exercise, final demo playback and authoritative submission receipt remain required."
        : "Rehearsal mode does not freeze the production release or close the production-release readiness gate."
    ]
  };
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await mkdir(resolve(outputDirectory, ".."), { recursive: true });
  await mkdir(outputDirectory);
  const outputPath = resolve(outputDirectory, "manifest.json");
  await writeFile(outputPath, bytes, { flag: "wx" });
  return Object.freeze({
    httpObservations: http.length,
    manifest: relative(repositoryRoot, outputPath).replaceAll("\\", "/"),
    manifestSha256: sha256(bytes),
    mode,
    tlsHosts: tlsEvidence.length
  });
}

const input = parseArguments(process.argv.slice(2));
const result = await capture(input);
process.stdout.write(`${JSON.stringify(result)}\n`);
