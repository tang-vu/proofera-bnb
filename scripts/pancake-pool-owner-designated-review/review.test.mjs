import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  REPOSITORY_ROOT,
  REVIEW_CONSTANTS,
  hashCanonical,
  listExactSubjectPaths,
  sha256Bytes,
  verifyCommittedReviewDecision,
  verifyReviewDecisionObject
} from "./review-lib.mjs";

const ARTIFACT_RAW_SHA256 = "0x491bca60db5283978234891b07b23245312702d81ace15b48e71b2a74f9d1ec3";

function commitText(path) {
  return execFileSync(
    "git",
    ["-C", REPOSITORY_ROOT, "show", `${REVIEW_CONSTANTS.releaseCommit}:${path}`],
    {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true
    }
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reseal(value) {
  value.reviewSubjectCanonicalSha256 = hashCanonical(value.reviewSubject);
  const body = { ...value };
  delete body.integrity;
  value.integrity.reviewSubjectCanonicalSha256 = value.reviewSubjectCanonicalSha256;
  value.integrity.canonicalBodySha256 = hashCanonical(body);
}

function assertResealedMutationRejected(value, mutate) {
  const copy = clone(value);
  mutate(copy);
  reseal(copy);
  assert.throws(
    () => verifyReviewDecisionObject(copy),
    /differs from the exact deterministic form/u
  );
}

test("decision is deterministic and binds its exact canonical subject", () => {
  const { raw, value } = verifyCommittedReviewDecision();
  assert.equal(sha256Bytes(raw), ARTIFACT_RAW_SHA256);
  assert.equal(value.reviewSubjectCanonicalSha256, hashCanonical(value.reviewSubject));
  assert.equal(value.integrity.reviewSubjectCanonicalSha256, value.reviewSubjectCanonicalSha256);
  const body = { ...value };
  delete body.integrity;
  assert.equal(value.integrity.canonicalBodySha256, hashCanonical(body));
  assert.equal(value.integrity.authenticationMeaning, "none_unkeyed_integrity_only");
});

test("release, tree, parent and every pool-prefixed subject file are exact", () => {
  const { value } = verifyCommittedReviewDecision();
  const release = value.reviewSubject.release;
  assert.equal(release.commit, REVIEW_CONSTANTS.releaseCommit);
  assert.equal(release.parent, REVIEW_CONSTANTS.releaseParent);
  assert.equal(release.tree, REVIEW_CONSTANTS.releaseTree);
  assert.equal(release.wholeRepositoryTreeBound, true);
  assert.deepEqual(
    release.subjectFiles.map(({ path }) => path).sort(),
    [...listExactSubjectPaths()].sort()
  );
  assert.equal(release.subjectFiles.length, 21);
  for (const binding of [...release.subjectFiles, ...release.contextFiles]) {
    assert.ok(binding.byteLength > 0);
    assert.match(binding.gitBlobOidSha1, /^[a-f0-9]{40}$/u);
    assert.match(binding.rawSha256, /^0x[a-f0-9]{64}$/u);
  }
});

test("technical decision is limited to one exact BSC-testnet initializer tuple", () => {
  const { value } = verifyCommittedReviewDecision();
  const scope = value.reviewSubject.exactTransactionScope;
  assert.equal(scope.chainId, 97);
  assert.equal(scope.sender, "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49");
  assert.equal(scope.nonce, "1");
  assert.equal(scope.to, "0x427bF5b37357632377eCbEC9de3626C71A5396c1");
  assert.equal(scope.valueWei, "0");
  assert.equal(scope.selector, "0x13ead562");
  assert.equal(scope.calldataByteLength, 132);
  assert.equal(
    scope.calldataKeccak256,
    "0x31c57c19edeae364d99d6f4fb97c75f81d9b1ec5bd8e6673d9771d9ece53b0d3"
  );
  assert.equal(scope.maximumTopLevelCalls, 1);
  assert.equal(scope.nestedCalldataAllowed, false);
  assert.equal(scope.maximumGasLimit, "6000000");
  assert.equal(scope.maximumTotalCostWei, "18000000000000000");
});

test("lane is owner-designated and internal, never external or identity-authenticated", () => {
  const { value } = verifyCommittedReviewDecision();
  assert.equal(value.status, "owner_designated_internal_technical_review_complete");
  assert.equal(
    value.lane.designation,
    "repository_owner_designated_distinct_agent_internal_technical_review"
  );
  assert.equal(value.lane.organizationalIndependenceClaimed, false);
  assert.equal(value.lane.externalReviewClaimed, false);
  assert.equal(value.lane.sigstoreAuthenticationClaimed, false);
  assert.equal(value.lane.authenticatedThirdPartyReviewClaimed, false);
  assert.equal(value.lane.publicReviewerIdentityClaimed, false);
  assert.match(value.lane.decisionEffect, /closes_only_the_owner_designated_internal/u);
});

test("two distinct read-only task labels approve technical scope only", () => {
  const { value } = verifyCommittedReviewDecision();
  assert.equal(value.reviewers.length, 2);
  assert.equal(new Set(value.reviewers.map(({ taskLabel }) => taskLabel)).size, 2);
  for (const reviewer of value.reviewers) {
    assert.equal(reviewer.role, "owner_designated_distinct_read_only_subagent");
    assert.equal(reviewer.subjectImplementationContributor, false);
    assert.equal(reviewer.externalReviewer, false);
    assert.equal(reviewer.thirdPartyIdentityAuthenticated, false);
    assert.equal(reviewer.sigstoreEvidence, null);
    assert.equal(reviewer.decision, "approve_internal_technical_scope_only");
    assert.deepEqual(reviewer.p0Findings, []);
    assert.deepEqual(reviewer.p1Findings, []);
    assert.ok(Array.isArray(reviewer.p2Findings));
  }
});

test("owner approval, production composition and every execution permission stay false", () => {
  const { value } = verifyCommittedReviewDecision();
  assert.equal(value.authorizationBoundary.ownerDesignatedInternalTechnicalReviewSatisfied, true);
  for (const key of [
    "externalReviewPerformed",
    "sigstoreEvidencePresent",
    "authenticatedThirdPartyReviewerPresent",
    "exactOwnerTransactionApprovalPresent",
    "productionCompositionPresent",
    "productionActivationEligible",
    "authorizesCustodyAccess",
    "authorizesSigning",
    "authorizesBroadcast",
    "authorizesOnchainWrite",
    "executionReady"
  ]) {
    assert.equal(value.authorizationBoundary[key], false, `${key} must remain false.`);
  }
  for (const [key, flag] of Object.entries(value.executionEvidence)) {
    assert.equal(flag, false, `${key} must remain false.`);
  }
});

test("pinned production entries remain hard-blocked and package-private", () => {
  const { value } = verifyCommittedReviewDecision();
  const release = value.reviewSubject.release;
  const sourceByPath = new Map(release.subjectFiles.map(({ path }) => [path, commitText(path)]));
  const hardBlocks = new Map([
    [
      "packages/integrations/src/bsc-testnet-pta-wbnb-pool-authorization.server.ts",
      /createBscTestnetPtaWbnbPoolProductionAuthorizationGate[\s\S]*return invalidGate\(\)/u
    ],
    [
      "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-signer-core.ts",
      /PRODUCTION_AUTHORIZATION_UNAVAILABLE/u
    ],
    [
      "packages/integrations/src/bsc-testnet-pta-wbnb-pool-signing-worker.ts",
      /PRODUCTION_AUTHORIZATION_UNAVAILABLE/u
    ],
    [
      "packages/integrations/src/bsc-testnet-pta-wbnb-pool-post-claim-recheck.server.ts",
      /PRODUCTION_AUTHORIZATION_UNAVAILABLE/u
    ],
    [
      "packages/integrations/src/bsc-testnet-pta-wbnb-pool-submission-reconciler.server.ts",
      /PRODUCTION_AUTHORIZATION_UNAVAILABLE/u
    ]
  ]);
  for (const [path, pattern] of hardBlocks) {
    assert.match(sourceByPath.get(path), pattern, path);
  }
  const packageJson = JSON.parse(commitText("packages/integrations/package.json"));
  const serializedExports = JSON.stringify(packageJson.exports ?? {});
  assert.doesNotMatch(serializedExports, /post-claim|submission-reconciler|signing-worker/u);
});

test("resealed authority, identity, release and transaction mutations fail closed", () => {
  const { value } = verifyCommittedReviewDecision();
  const mutations = [
    (copy) => {
      copy.authorizationBoundary.exactOwnerTransactionApprovalPresent = true;
    },
    (copy) => {
      copy.authorizationBoundary.authorizesBroadcast = true;
    },
    (copy) => {
      copy.lane.externalReviewClaimed = true;
    },
    (copy) => {
      copy.reviewers[0].thirdPartyIdentityAuthenticated = true;
    },
    (copy) => {
      copy.reviewers[0].sigstoreEvidence = { invented: true };
    },
    (copy) => {
      copy.reviewSubject.release.commit = "0".repeat(40);
    },
    (copy) => {
      copy.reviewSubject.exactTransactionScope.chainId = 56;
    },
    (copy) => {
      copy.reviewSubject.exactTransactionScope.calldata = "0x";
    },
    (copy) => {
      copy.checklist.pop();
    }
  ];
  for (const mutate of mutations) assertResealedMutationRejected(value, mutate);
});

test("generator is offline, argument-pinned and writes only under explicit --write", () => {
  const library = readFileSync(
    `${REPOSITORY_ROOT}/scripts/pancake-pool-owner-designated-review/review-lib.mjs`,
    "utf8"
  );
  const generator = readFileSync(
    `${REPOSITORY_ROOT}/scripts/pancake-pool-owner-designated-review/generate.mjs`,
    "utf8"
  );
  const source = `${library}\n${generator}`;
  assert.doesNotMatch(source, /from "node:(?:http|https|net|tls|dgram)"/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /process\.env/u);
  assert.match(generator, /--release-commit/u);
  assert.match(generator, /if \(mode === "--write"\)/u);
  assert.doesNotMatch(generator, /--publish|--send/u);
});

test("decision contains no secret material or signed transaction", () => {
  const { value } = verifyCommittedReviewDecision();
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /-----BEGIN [A-Z ]*PRIVATE KEY-----/u);
  assert.doesNotMatch(text, /\b(?:ghp|github_pat|npm|sk-proj)_[A-Za-z0-9_-]{20,}\b/u);
  assert.doesNotMatch(text, /"(?:privateKey|mnemonic|seedPhrase|walletPassword)"\s*:/u);
  assert.doesNotMatch(text, /"(?:rawSignedTransaction|signedTransactionHex)"\s*:/u);
});
