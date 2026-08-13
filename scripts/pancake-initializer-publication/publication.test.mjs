import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const ARTIFACT_PATH = "evidence/development/pancake-v3-initializer-selector-review-2026-08-13.json";
const RETRIEVAL_PATH =
  "evidence/development/pancake-v3-initializer-selector-public-retrieval-2026-08-13.json";
const MANIFEST_PATH =
  "evidence/development/pancake-v3-initializer-selector-publication-manifest-2026-08-13.json";
const ARTIFACT_SHA256 = "2f78e23ba4892194f2e55c99de479c5a5421329cc4cf992ed2253dd5c0512f02";
const ARTIFACT_GIT_BLOB_OID = "72b669a0869bd79f89e8b6e6e4a8efe2508a4cd1";
const ARTIFACT_BYTES = 33_327;
const SOURCE_COMMIT = "08926dfe69546e897ee2509d905c32a37c9502b7";
const GIST_ID = "e983c3801247685472889075c43e263b";
const GIST_REVISION = "e26e1462df484725bbfb795a2a23aaebfc44ed9b";
const PUBLIC_FILENAME = `${ARTIFACT_SHA256}.json`;
const PUBLIC_URL = `https://gist.githubusercontent.com/tang-vu/${GIST_ID}/raw/${GIST_REVISION}/${PUBLIC_FILENAME}`;
const RETRIEVAL_SHA256 = "65e56ff4b5b2109cee954337a820acd33536c3fa5ef1a1ae7da4e2eee8c7301b";
const MANIFEST_SHA256 = "a70b93a14494824439db1dc6c3fe5c7f046d2e30abdbdb0943f7d99d31da96e5";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobOid(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function loadJson(path) {
  const raw = readFileSync(path);
  assert.equal(raw[0], 0x7b, `${path} must start with a JSON object.`);
  assert.equal(raw.at(-1), 0x0a, `${path} must end in exactly one LF.`);
  assert.notEqual(raw.at(-2), 0x0a, `${path} must not end in multiple blank lines.`);
  return { raw, value: JSON.parse(raw.toString("utf8")) };
}

function assertExactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} shape drifted.`);
}

function assertUtcOrder(start, end) {
  assert.match(start, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.match(end, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.ok(Date.parse(start) <= Date.parse(end));
}

function assertContentAddressedUrl(value) {
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, "gist.githubusercontent.com");
  assert.equal(parsed.username, "");
  assert.equal(parsed.password, "");
  assert.equal(parsed.port, "");
  assert.equal(parsed.search, "");
  assert.equal(parsed.hash, "");
  assert.equal(parsed.pathname, `/tang-vu/${GIST_ID}/raw/${GIST_REVISION}/${PUBLIC_FILENAME}`);
}

test("published initializer artifact identity stays byte-for-byte bound", () => {
  const { raw, value } = loadJson(ARTIFACT_PATH);
  assert.equal(raw.length, ARTIFACT_BYTES);
  assert.equal(sha256(raw), ARTIFACT_SHA256);
  assert.equal(gitBlobOid(raw), ARTIFACT_GIT_BLOB_OID);
  assert.equal(value.target.chainId, 97);
  assert.equal(value.target.selector, "0x13ead562");
  assert.equal(value.decision.authorizesWalletUse, false);
  assert.equal(value.decision.authorizesSignature, false);
  assert.equal(value.decision.authorizesTransaction, false);
});

test("retrieval receipt binds public metadata and exact no-redirect response", () => {
  const { raw, value } = loadJson(RETRIEVAL_PATH);
  assert.equal(sha256(raw), RETRIEVAL_SHA256);
  assertExactKeys(
    value,
    [
      "recordType",
      "recordedAt",
      "status",
      "sourceArtifact",
      "publication",
      "retrieval",
      "decisionBoundary",
      "limitations"
    ],
    "retrieval receipt"
  );
  assert.equal(value.sourceArtifact.path, ARTIFACT_PATH);
  assert.equal(value.sourceArtifact.sourceCommit, SOURCE_COMMIT);
  assert.equal(value.sourceArtifact.gitBlobOidSha1, ARTIFACT_GIT_BLOB_OID);
  assert.equal(value.sourceArtifact.rawByteLength, ARTIFACT_BYTES);
  assert.equal(value.sourceArtifact.rawSha256, ARTIFACT_SHA256);

  assert.equal(value.publication.gistId, GIST_ID);
  assert.equal(value.publication.public, true);
  assert.equal(value.publication.revision, GIST_REVISION);
  assert.equal(value.publication.filename, PUBLIC_FILENAME);
  assert.equal(value.publication.contentAddressedRawUrl, PUBLIC_URL);
  assert.equal(value.publication.locatorProperties.credentialFreeHttps, true);
  assert.equal(value.publication.locatorProperties.digestNamed, true);
  assert.equal(value.publication.locatorProperties.revisionPinned, true);
  assert.equal(value.publication.locatorProperties.availabilityDurabilityGuaranteed, false);
  assert.equal(value.publication.unauthenticatedMetadataObservation.requestAuthenticated, false);
  assert.equal(value.publication.unauthenticatedMetadataObservation.redirectCount, 0);
  assert.equal(value.publication.unauthenticatedMetadataObservation.httpStatus, 200);
  assert.equal(value.publication.unauthenticatedMetadataObservation.normalizedPublic, true);
  assert.equal(
    value.publication.unauthenticatedMetadataObservation.normalizedRevision,
    GIST_REVISION
  );
  assert.equal(
    value.publication.unauthenticatedMetadataObservation.normalizedFilename,
    PUBLIC_FILENAME
  );
  assert.equal(
    value.publication.unauthenticatedMetadataObservation.normalizedFileSize,
    ARTIFACT_BYTES
  );
  assert.equal(value.publication.unauthenticatedMetadataObservation.normalizedFileTruncated, false);

  assertUtcOrder(value.retrieval.requestedAt, value.retrieval.completedAt);
  assert.equal(value.retrieval.requestedUrl, PUBLIC_URL);
  assert.equal(value.retrieval.finalUrl, PUBLIC_URL);
  assert.equal(value.retrieval.requestAuthenticationHeaderSent, false);
  assert.equal(value.retrieval.redirectCount, 0);
  assert.equal(value.retrieval.redirectFollowed, false);
  assert.equal(value.retrieval.httpStatus, 200);
  assert.equal(value.retrieval.locationHeader, null);
  assert.equal(value.retrieval.contentType, "text/plain; charset=utf-8");
  assert.equal(value.retrieval.contentEncoding, null);
  assert.equal(value.retrieval.contentLengthHeader, String(ARTIFACT_BYTES));
  assert.equal(value.retrieval.responseMaxBytes, 131_072);
  assert.equal(value.retrieval.rawByteLength, ARTIFACT_BYTES);
  assert.equal(value.retrieval.rawSha256, ARTIFACT_SHA256);
  assert.equal(value.retrieval.tlsCertificateValidated, true);
  assert.equal(value.retrieval.bodyCompleteByContentLength, true);
  assert.equal(value.retrieval.bodyParsesAsJsonByExactLocalByteEquality, true);
  assert.equal(value.retrieval.exactExpectedByteLengthMatched, true);
  assert.equal(value.retrieval.exactExpectedSha256Matched, true);
  assert.equal(value.retrieval.exactLocalBytesMatched, true);
  assert.equal(value.retrieval.responseBodyRetainedAgain, false);
  assert.equal(value.retrieval.independenceBoundary.separateTaskFromInitializerReviewBuilder, true);
  assert.equal(value.retrieval.independenceBoundary.separateNetworkRequestAfterPublication, true);
  assert.equal(
    value.retrieval.independenceBoundary.publicResponseHashedBeforeLocalByteComparison,
    true
  );
  assert.equal(
    value.retrieval.independenceBoundary.localArtifactLoadedBeforePublicResponseHash,
    false
  );
  assert.equal(value.retrieval.independenceBoundary.publiclyAuthenticatedRetrieverIdentity, null);
  assertContentAddressedUrl(value.retrieval.requestedUrl);
});

test("publication manifest closes only publication and exact refetch", () => {
  const retrieval = loadJson(RETRIEVAL_PATH);
  const manifest = loadJson(MANIFEST_PATH);
  assert.equal(sha256(manifest.raw), MANIFEST_SHA256);
  assert.equal(manifest.value.canonicalSourceArtifact.path, ARTIFACT_PATH);
  assert.equal(manifest.value.canonicalSourceArtifact.sourceCommit, SOURCE_COMMIT);
  assert.equal(manifest.value.canonicalSourceArtifact.gitBlobOidSha1, ARTIFACT_GIT_BLOB_OID);
  assert.equal(manifest.value.canonicalSourceArtifact.rawByteLength, ARTIFACT_BYTES);
  assert.equal(manifest.value.canonicalSourceArtifact.rawSha256, ARTIFACT_SHA256);
  assert.equal(manifest.value.publicArtifact.gistId, GIST_ID);
  assert.equal(manifest.value.publicArtifact.revision, GIST_REVISION);
  assert.equal(manifest.value.publicArtifact.filename, PUBLIC_FILENAME);
  assert.equal(manifest.value.publicArtifact.locator, PUBLIC_URL);
  assertContentAddressedUrl(manifest.value.publicArtifact.locator);
  assert.equal(manifest.value.retrievalEvidence.path, RETRIEVAL_PATH);
  assert.equal(manifest.value.retrievalEvidence.rawSha256, sha256(retrieval.raw));
  assert.equal(manifest.value.retrievalEvidence.artifactRawSha256, ARTIFACT_SHA256);
  assert.equal(manifest.value.retrievalEvidence.rawByteLength, ARTIFACT_BYTES);
  assert.equal(manifest.value.retrievalEvidence.noRedirect, true);
  assert.equal(manifest.value.retrievalEvidence.httpStatus, 200);
  assert.equal(manifest.value.retrievalEvidence.exactSourceBytesMatched, true);
  assert.equal(
    manifest.value.gateAssessment.exactBytesPublishedAtCommitPinnedDigestNamedPublicHttpsLocator,
    true
  );
  assert.equal(
    manifest.value.gateAssessment.separateUnauthenticatedNoRedirectRefetchMatchedExactBytes,
    true
  );
  assert.equal(manifest.value.gateAssessment.publicationAndRefetchComplete, true);
  assert.equal(manifest.value.securityBoundary.exactSourceArtifactPublishedToPublicGist, true);
  assert.equal(manifest.value.securityBoundary.contentBeyondExactSourceArtifactPublished, false);
});

test("reviewer authentication, activation, execution and wallet use remain fail-closed", () => {
  const { value: retrieval } = loadJson(RETRIEVAL_PATH);
  const { value: manifest } = loadJson(MANIFEST_PATH);
  assert.equal(retrieval.decisionBoundary.authenticatedIndependentReviewer, null);
  assert.equal(retrieval.decisionBoundary.authenticatedIndependentReviewVerified, false);
  assert.equal(retrieval.decisionBoundary.activationEligible, false);
  assert.equal(retrieval.decisionBoundary.executionAuthorized, false);
  for (const key of [
    "walletUsed",
    "signerLoaded",
    "signatureCreated",
    "transactionConstructed",
    "transactionBroadcast",
    "onchainWritePerformed"
  ]) {
    assert.equal(retrieval.decisionBoundary[key], false, `${key} must stay false.`);
  }
  assert.equal(manifest.gateAssessment.authenticatedIndependentReviewer, null);
  assert.equal(manifest.gateAssessment.authenticatedIndependentReviewVerified, false);
  assert.equal(manifest.gateAssessment.activationEligible, false);
  assert.equal(manifest.gateAssessment.executionReady, false);
  assert.equal(manifest.gateAssessment.authorizesWalletUse, false);
  assert.equal(manifest.gateAssessment.authorizesSignature, false);
  assert.equal(manifest.gateAssessment.authorizesTransaction, false);
  assert.match(manifest.gateAssessment.remainingBlocker, /authenticated independent reviewer/u);
  for (const key of [
    "repositoryVisibilityChanged",
    "contentBeyondExactSourceArtifactPublished",
    "secretPublished",
    "rpcCalled",
    "walletAccessed",
    "signerAccessed",
    "signatureCreated",
    "transactionConstructed",
    "transactionBroadcast",
    "onchainWritePerformed"
  ]) {
    assert.equal(manifest.securityBoundary[key], false, `${key} must stay false.`);
  }
});

test("publication evidence contains no secret or signed-transaction material", () => {
  for (const path of [RETRIEVAL_PATH, MANIFEST_PATH]) {
    const text = readFileSync(path, "utf8");
    assert.equal(/-----BEGIN [A-Z ]*PRIVATE KEY-----/iu.test(text), false);
    assert.equal(
      /"(?:privateKey|mnemonic|walletPassword|rawSignedTransaction)"\s*:\s*"[^"]+"/iu.test(text),
      false
    );
  }
});
