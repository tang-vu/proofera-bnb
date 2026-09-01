import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  assert.match(source, /questionName\.toLowerCase\(\)\.replace\(\/\\\.\$\/u, ""\) !== hostname/u);
  assert.match(source, /rejectUnauthorized: true/u);
  assert.match(source, /servername: hostname/u);
  assert.match(source, /PRODUCTION_RELEASE_TLS_JUDGING_WINDOW_UNCOVERED/u);
  assert.match(source, /externalHttpMonitoring: false/u);
  assert.match(source, /onchainReceiptEvidenceIntroduced: false/u);
  assert.match(source, /submissionReady: false/u);
});

test("final mode requires core verified gates and an exact terminal Pancake outcome", () => {
  for (const gate of ["agent-registration", "altana-lifecycle", "termix-pairs"]) {
    assert.match(source, new RegExp(`"${gate}"`, "u"));
  }
  for (const kind of ["transaction_receipt", "before_after_metrics", "manual_baseline"]) {
    assert.match(source, new RegExp(`"${kind}"`, "u"));
  }
  assert.match(source, /gate\.state === "controlled_outcome_observed"/u);
  assert.match(source, /No fee income, price movement or liquidity change was observed/u);
  assert.match(source, /neither realized economic benefit nor autonomous-agent advantage/u);
  assert.match(source, /pancakeBenefitClaimVerified: pancakeGate\.state === "verified"/u);
  assert.match(
    source,
    /pancakeBenefitClaimVerified: prerequisites\?\.pancakeBenefitClaimVerified === true/u
  );
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

test("retained rehearsal binds DNS agreement, TLS authorization and eleven exact responses", async () => {
  const manifestUrl = new URL(
    "../evidence/submission/release-probes/155f03ae84e505c8d7c981296699bac30fd16ee6/rehearsal/manifest.json",
    import.meta.url
  );
  const bytes = await readFile(manifestUrl);
  const manifest = JSON.parse(bytes.toString("utf8"));
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "489ef6855bff29921937725492df5ab836f31a16c65301454e7400ab47726052"
  );
  assert.equal(manifest.schemaVersion, "proofera-production-release-evidence-v1.0.0");
  assert.equal(manifest.sourceCommit, "155f03ae84e505c8d7c981296699bac30fd16ee6");
  assert.equal(manifest.mode, "rehearsal");
  assert.deepEqual(manifest.classification, {
    artifact: "production_release_rehearsal",
    externalHttpMonitoring: false,
    finalReleaseCheck: false,
    hackathonEntrySubmitted: false,
    independentDnsResolvers: 2,
    onchainReceiptEvidenceIntroduced: false,
    readOnly: true,
    submissionReady: false
  });
  assert.equal(manifest.dns.length, 5);
  assert.ok(
    manifest.dns.every(
      ({ resolverAgreement, resolvers }) => resolverAgreement && resolvers.length === 2
    )
  );
  assert.equal(manifest.tls.length, 5);
  assert.ok(
    manifest.tls.every(
      ({ authorized, protocol, validToUtc }) =>
        authorized &&
        protocol === "TLSv1.3" &&
        Date.parse(validToUtc) >= Date.parse(manifest.judgingThroughUtc)
    )
  );
  assert.equal(manifest.http.length, 11);
  assert.deepEqual(manifest.summary, {
    dnsAgreement: true,
    exactBuildObserved: true,
    httpObservationCount: 11,
    tlsAuthorized: true
  });
  assert.equal(manifest.http.find(({ key }) => key === "marketplace-readiness")?.status, 503);
});

test("retained final release binds the negative-benefit boundary, rollback and evidence carrier", async () => {
  const probeUrl = new URL(
    "../evidence/submission/release-probes/ad0cee11885b2131c27bfa14c3b0a27f2f8fee69/final/manifest.json",
    import.meta.url
  );
  const releaseUrl = new URL(
    "../evidence/submission/final/production-release.json",
    import.meta.url
  );
  const probeBytes = await readFile(probeUrl);
  const releaseBytes = await readFile(releaseUrl);
  const probe = JSON.parse(probeBytes.toString("utf8"));
  const release = JSON.parse(releaseBytes.toString("utf8"));
  assert.equal(
    createHash("sha256").update(probeBytes).digest("hex"),
    "3a296042cd9bd2ccbfba37c9c15ba8085e5ec82afd9d87d6042397df7ad70e68"
  );
  assert.equal(
    createHash("sha256").update(releaseBytes).digest("hex"),
    "bf02e8d1df867baa64c1b7b237e4e71be60cacd0cc041263c727055787eb591f"
  );
  assert.equal(probe.sourceCommit, "ad0cee11885b2131c27bfa14c3b0a27f2f8fee69");
  assert.equal(probe.mode, "final");
  assert.equal(probe.classification.pancakeBenefitClaimVerified, false);
  assert.equal(probe.classification.pancakeOutcomeGateState, "controlled_outcome_observed");
  assert.deepEqual(probe.summary, {
    dnsAgreement: true,
    exactBuildObserved: true,
    httpObservationCount: 11,
    tlsAuthorized: true
  });
  assert.equal(release.status, "verified");
  assert.equal(release.classification.finalReleaseFrozen, true);
  assert.equal(release.classification.submissionReady, false);
  assert.equal(release.publicProbe.sha256, createHash("sha256").update(probeBytes).digest("hex"));
  assert.equal(release.rollbackExercise.rollbackProbe.exitCode, 0);
  assert.equal(release.rollbackExercise.rollbackProbe.checkpointCount, 11);
  assert.equal(release.rollbackExercise.rollbackProbe.exactWebRuntimePathObserved, true);
  assert.equal(release.rollbackExercise.rollbackProbe.exactMonitorRuntimePathObserved, true);
  assert.equal(release.rollbackExercise.restorationProbe.exitCode, 0);
  assert.equal(release.rollbackExercise.restorationProbe.checkpointCount, 11);
  assert.equal(release.rollbackExercise.restorationProbe.exactWebRuntimePathObserved, true);
  assert.equal(release.rollbackExercise.restorationProbe.exactMonitorRuntimePathObserved, true);
  assert.equal(release.rollbackExercise.rejectedPreflight.status, "rejected_not_counted");
  assert.equal(release.rollbackExercise.rejectedPreflight.runtimePathsChanged, false);
  assert.equal(release.rollbackExercise.rejectedPreflight.evidenceClaimed, false);
  for (const processName of release.rollbackExercise.processesNotRestarted) {
    assert.equal(
      release.rollbackExercise.pidsBefore[processName],
      release.rollbackExercise.pidsAfter[processName]
    );
  }
  assert.equal(release.classification.evidenceCarrierDeployed, true);
  assert.equal(
    release.evidenceCarrierDeployment.sourceCommit,
    "1663e1f3a8755744739d4b63b32b7cb288221245"
  );
  assert.equal(release.evidenceCarrierDeployment.finalProbe.exitCode, 0);
  assert.equal(release.evidenceCarrierDeployment.finalProbe.checkpointCount, 11);
  assert.equal(release.evidenceCarrierDeployment.finalProbe.exactBuildObserved, true);
  assert.equal(release.evidenceCarrierDeployment.finalProbe.exactWebRuntimePathObserved, true);
  assert.equal(release.evidenceCarrierDeployment.finalProbe.exactMonitorRuntimePathObserved, true);
  assert.equal(release.evidenceCarrierDeployment.finalProbe.readinessObservedAsNotReady, true);
  assert.equal(release.evidenceCarrierDeployment.runtime.pm2ProcessListSaved, true);
  for (const processName of release.evidenceCarrierDeployment.processesNotRestarted) {
    assert.equal(
      release.evidenceCarrierDeployment.pidsBefore[processName],
      release.evidenceCarrierDeployment.pidsAfter[processName]
    );
  }
  assert.deepEqual(release.securityBoundary, {
    mainnetWritePossible: false,
    walletAccessed: false,
    signingAttempted: false,
    transactionBroadcastAttempted: false,
    altanaWorkerRestarted: false,
    databaseOrApplicationStateRolledBack: false
  });
});

test("current public product derivative binds the exact 9f32dda rehearsal without upgrading it", async () => {
  const probeBytes = await readFile(
    new URL(
      "../evidence/submission/release-probes/9f32dda65d8123f6f37a58fa869daef6340fd1be/rehearsal/manifest.json",
      import.meta.url
    )
  );
  const derivative = JSON.parse(
    await readFile(
      new URL("../evidence/submission/final/current-public-release.json", import.meta.url),
      "utf8"
    )
  );
  const probe = JSON.parse(probeBytes.toString("utf8"));
  assert.equal(derivative.status, "observed_rehearsal");
  assert.equal(derivative.sourceCommit, probe.sourceCommit);
  assert.equal(derivative.sourceProbe.mode, "rehearsal");
  assert.equal(derivative.classification.finalReleaseFrozen, false);
  assert.equal(derivative.classification.submissionReady, false);
  assert.equal(
    derivative.sourceProbe.sha256,
    createHash("sha256").update(probeBytes).digest("hex")
  );
  assert.deepEqual(derivative.summary, {
    dnsHostCount: probe.dns.length,
    dnsResolverAgreement: probe.summary.dnsAgreement,
    tlsHostCount: probe.tls.length,
    tlsAuthorized: probe.summary.tlsAuthorized,
    httpObservationCount: probe.summary.httpObservationCount,
    exactBuildObserved: probe.summary.exactBuildObserved,
    readinessObservedAsNotReady: true
  });
  assert.equal(probe.http.find(({ key }) => key === "marketplace-readiness")?.status, 503);
  assert.deepEqual(derivative.securityBoundary, {
    mainnetWritePossible: false,
    walletAccessed: false,
    signingAttempted: false,
    transactionBroadcastAttempted: false,
    serviceRestarted: false
  });
});

test("submission public release derivative binds readiness v2 without upgrading the rehearsal", async () => {
  const probeBytes = await readFile(
    new URL(
      "../evidence/submission/release-probes/6c862265fa8da29fd2e82ca84ee54e8b273a2beb/rehearsal/manifest.json",
      import.meta.url
    )
  );
  const derivative = JSON.parse(
    await readFile(
      new URL("../evidence/submission/final/submission-public-release.json", import.meta.url),
      "utf8"
    )
  );
  const probe = JSON.parse(probeBytes.toString("utf8"));
  const readiness = probe.http.find(({ key }) => key === "marketplace-readiness");
  assert.equal(derivative.status, "observed_rehearsal");
  assert.equal(derivative.sourceCommit, probe.sourceCommit);
  assert.equal(derivative.sourceProbe.mode, "rehearsal");
  assert.equal(derivative.classification.finalReleaseFrozen, false);
  assert.equal(derivative.classification.submissionReady, false);
  assert.equal(
    derivative.sourceProbe.sha256,
    createHash("sha256").update(probeBytes).digest("hex")
  );
  assert.deepEqual(derivative.summary, {
    dnsHostCount: probe.dns.length,
    dnsResolverAgreement: probe.summary.dnsAgreement,
    tlsHostCount: probe.tls.length,
    tlsAuthorized: probe.summary.tlsAuthorized,
    httpObservationCount: probe.summary.httpObservationCount,
    exactBuildObserved: probe.summary.exactBuildObserved
  });
  assert.equal(readiness?.status, derivative.readiness.httpStatus);
  assert.deepEqual(derivative.readiness, {
    httpStatus: readiness?.status,
    status: readiness?.facts.status,
    activation: readiness?.facts.activation,
    analysisActivation: readiness?.facts.analysisActivation,
    capitalExecution: readiness?.facts.capitalExecution,
    readyForAnalysisActivation: readiness?.facts.readyForAnalysisActivation,
    readyForCapitalActivation: readiness?.facts.readyForCapitalActivation,
    readyForActivation: readiness?.facts.readyForActivation,
    readyForJudging: readiness?.facts.readyForJudging
  });
  assert.deepEqual(derivative.securityBoundary, {
    mainnetWritePossible: false,
    walletAccessed: false,
    signingAttempted: false,
    transactionBroadcastAttempted: false,
    captureServiceRestarted: false
  });
});
