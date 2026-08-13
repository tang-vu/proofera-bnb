import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  REPOSITORY_ROOT,
  REVIEW_REQUEST_CONSTANTS,
  hashCanonical,
  sha256Bytes,
  verifyCommittedReviewRequest,
  verifyReviewRequestObject
} from "./review-request-lib.mjs";

const ARTIFACT_RAW_SHA256 = "0x22148b3aa1b097789a3fbe3de2a607ec2bd7ad34cead091a87e10b533b3f4c7d";
const EXPECTED_FALSE_AUTHORIZATION_FLAGS = [
  "activationEligible",
  "executionReady",
  "authorizesWalletUse",
  "authorizesCustodyAccess",
  "authorizesSignature",
  "authorizesTransactionConstruction",
  "authorizesBroadcast",
  "authorizesOnchainWrite",
  "reviewerDecisionAloneAuthorizesExecution",
  "canonicalHashesAreAuthenticationOrAuthorization"
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reseal(value) {
  value.integrity.reviewSubjectCanonicalSha256 = hashCanonical(value.reviewSubject);
  value.integrity.reviewerDecisionSchemaCanonicalSha256 = hashCanonical(
    value.reviewerDecisionSchema
  );
  const body = { ...value };
  delete body.integrity;
  value.integrity.canonicalBodySha256 = hashCanonical(body);
}

function assertResealedMutationRejected(value, mutate) {
  const copy = clone(value);
  mutate(copy);
  reseal(copy);
  assert.throws(
    () => verifyReviewRequestObject(copy),
    /differs from the exact fail-closed deterministic form/u
  );
}

function assertNoSecretMaterial(value) {
  const forbiddenKeyFragments = [
    ["pri", "vateKey"].join(""),
    ["mne", "monic"].join(""),
    ["seed", "Phrase"].join(""),
    ["wallet", "Password"].join(""),
    ["keystore", "Password"].join(""),
    ["raw", "SignedTransaction"].join(""),
    ["signedTransaction", "Hex"].join("")
  ].map((entry) => entry.toLowerCase());

  function visit(entry, path = "$") {
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (entry !== null && typeof entry === "object") {
      for (const [key, nested] of Object.entries(entry)) {
        const normalized = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
        assert.equal(
          forbiddenKeyFragments.some((fragment) => normalized.includes(fragment)),
          false,
          `${path}.${key} is a forbidden secret-material field.`
        );
        visit(nested, `${path}.${key}`);
      }
    }
  }

  visit(value);
  const text = JSON.stringify(value);
  assert.equal(/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(text), false);
  assert.equal(/\b(?:ghp|github_pat|npm|sk-proj)_[A-Za-z0-9_-]{20,}\b/u.test(text), false);
}

test("committed request is deterministic and all canonical digests recompute", () => {
  const { raw, value } = verifyCommittedReviewRequest();
  assert.equal(sha256Bytes(raw), ARTIFACT_RAW_SHA256);
  assert.equal(value.integrity.reviewSubjectCanonicalSha256, hashCanonical(value.reviewSubject));
  assert.equal(
    value.integrity.reviewerDecisionSchemaCanonicalSha256,
    hashCanonical(value.reviewerDecisionSchema)
  );
  const body = { ...value };
  delete body.integrity;
  assert.equal(value.integrity.canonicalBodySha256, hashCanonical(body));
  assert.equal(value.integrity.authenticationMeaning, "none_unkeyed_integrity_only");
});

test("request pins the published Gist bytes and the exact source release", () => {
  const { value } = verifyCommittedReviewRequest();
  const published = value.reviewSubject.publishedInitializerArtifact;
  const release = value.reviewSubject.sourceRelease;
  assert.equal(
    published.contentAddressedRawUrl,
    "https://gist.githubusercontent.com/tang-vu/e983c3801247685472889075c43e263b/raw/e26e1462df484725bbfb795a2a23aaebfc44ed9b/2f78e23ba4892194f2e55c99de479c5a5421329cc4cf992ed2253dd5c0512f02.json"
  );
  assert.equal(
    published.rawSha256,
    "0x2f78e23ba4892194f2e55c99de479c5a5421329cc4cf992ed2253dd5c0512f02"
  );
  assert.equal(published.rawByteLength, 33327);
  assert.equal(release.commit, REVIEW_REQUEST_CONSTANTS.sourceCommit);
  assert.equal(release.parent, REVIEW_REQUEST_CONSTANTS.sourceParent);
  assert.equal(release.tree, REVIEW_REQUEST_CONSTANTS.sourceTree);
  assert.equal(release.publicAvailabilityCheckedByThisOfflineBundle, false);
  assert.equal(release.implementationFiles.length, 8);
  assert.equal(release.focusedTestFiles.length, 6);
  assert.equal(release.retainedEvidenceFiles.length, 8);
  for (const binding of [
    ...release.implementationFiles,
    ...release.focusedTestFiles,
    ...release.retainedEvidenceFiles
  ]) {
    assert.match(binding.path, /^(?:packages|evidence)\//u);
    assert.ok(binding.byteLength > 0);
    assert.match(binding.gitBlobOidSha1, /^[a-f0-9]{40}$/u);
    assert.match(binding.rawSha256, /^0x[a-f0-9]{64}$/u);
  }
});

test("direct initializer scope, calldata, targets and cost ceilings are exact", () => {
  const { value } = verifyCommittedReviewRequest();
  const scope = value.reviewSubject.exactDirectCallScope;
  assert.equal(scope.chainId, 97);
  assert.equal(scope.networkKind, "testnet");
  assert.equal(scope.maximumTopLevelCalls, 1);
  assert.equal(scope.from, "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49");
  assert.equal(scope.nonce, "1");
  assert.equal(scope.to, "0x427bF5b37357632377eCbEC9de3626C71A5396c1");
  assert.equal(scope.selector, "0x13ead562");
  assert.equal(scope.calldata, REVIEW_REQUEST_CONSTANTS.calldata);
  assert.equal(scope.calldataByteLength, 132);
  assert.equal(
    scope.calldataKeccak256,
    "0x31c57c19edeae364d99d6f4fb97c75f81d9b1ec5bd8e6673d9771d9ece53b0d3"
  );
  assert.equal(scope.valueWei, "0");
  assert.equal(scope.nestedCalldataAllowed, false);
  assert.equal(scope.allOtherTopLevelSelectorsAllowed, false);
  assert.deepEqual(scope.deniedMulticallSelectors, ["0xac9650d8", "0x5ae401dc", "0x1f0464d1"]);

  const initializer = value.reviewSubject.initializerArguments;
  assert.equal(initializer.token0, "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc");
  assert.equal(initializer.token1, "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd");
  assert.equal(initializer.fee, "500");
  assert.equal(initializer.sqrtPriceX96, "79228162514264337593543950");
  assert.equal(initializer.expectedConditionalPool, "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE");
  assert.equal(initializer.addsLiquidity, false);
  assert.equal(initializer.createsLpNft, false);

  assert.deepEqual(value.reviewSubject.boundedEnvelopePolicy, {
    maximumObservationAgeSeconds: 120,
    maximumEnvelopeLifetimeSeconds: 45,
    maximumPostClaimRecheckAgeSeconds: 30,
    gasMarginBasisPoints: "2000",
    maximumGasEstimate: "5000000",
    maximumGasLimit: "6000000",
    maximumGasPriceWei: "3000000000",
    maximumTotalCostWei: "18000000000000000"
  });
});

test("runtime, init-code, CREATE2 and historical non-proxy boundaries stay explicit", () => {
  const { value } = verifyCommittedReviewRequest();
  const identity = value.reviewSubject.contractIdentityAndNonProxyBoundary;
  assert.equal(identity.historicalCheckpoint.freshForSubmission, false);
  assert.equal(
    identity.claimStrength,
    "all_three_eip1967_slots_zero_at_historical_checkpoint_not_a_timeless_non_proxy_claim"
  );
  assert.equal(identity.positionManagerContainsReviewedMulticallSelfDelegatecall, true);
  assert.equal(identity.noReachableDelegatecallClaim, false);
  assert.equal(identity.freshTwoProviderCodeSlotAndBindingRecheckRequiredBeforeAnySubmission, true);
  assert.equal(identity.identities.length, 5);
  const zeroWord = `0x${"00".repeat(32)}`;
  for (const contract of identity.identities) {
    assert.deepEqual(Object.values(contract.historicalEip1967Slots), [
      zeroWord,
      zeroWord,
      zeroWord
    ]);
  }

  const construction = value.reviewSubject.poolConstruction;
  assert.equal(construction.poolCreationCodeByteLength, 23566);
  assert.equal(
    construction.poolCreationCodeKeccak256,
    "0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2"
  );
  assert.equal(construction.conditionalPoolAddress, "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE");
  assert.equal(
    construction.expectedImmutableLinkedRuntime.status,
    "counterfactual_expected_post_creation_runtime_not_onchain_observation"
  );
  assert.equal(construction.expectedImmutableLinkedRuntime.observedOnchain, false);
  assert.equal(construction.expectedImmutableLinkedRuntime.byteLength, 22962);
  assert.equal(
    construction.expectedImmutableLinkedRuntime.templateKeccak256,
    "0x4ef16dfd4d3a1481e945e15d2579e8fb74f78cc27678875fdee9b06eed2e86ac"
  );
  assert.equal(
    construction.expectedImmutableLinkedRuntime.keccak256,
    "0xc7187b6ca08de7a5856f7725d15e39a534b27a964fdc445abfd7663041b0e69d"
  );
  assert.deepEqual(
    construction.expectedImmutableLinkedRuntime.immutableAstBindings.map(({ astId, name }) => [
      astId,
      name
    ]),
    [
      ["78", "factory"],
      ["82", "token0"],
      ["86", "token1"],
      ["90", "fee"],
      ["94", "tickSpacing"],
      ["98", "maxLiquidityPerTick"]
    ]
  );
});

test("reviewer remains absent and owner approval remains a separate gate", () => {
  const { value } = verifyCommittedReviewRequest();
  assert.equal(value.status, "awaiting_authenticated_external_review");
  assert.equal(value.reviewer, null);
  assert.deepEqual(value.delivery, {
    status: "not_sent_by_this_bundle",
    recipient: null,
    networkCalled: false,
    externalWritePerformed: false
  });
  assert.equal(value.reviewerAuthentication.requiredMethod, "sigstore_keyless_blob_bundle_v0_3");
  assert.equal(value.reviewerAuthentication.exactReviewerIdentityProvisioned, null);
  assert.equal(value.reviewerAuthentication.authenticationEvidence, null);
  assert.equal(value.reviewerAuthentication.authenticatedIndependentReviewVerified, false);
  assert.equal(value.separateOwnerApproval.status, "not_requested_or_recorded");
  assert.equal(value.separateOwnerApproval.owner, null);
  assert.equal(value.separateOwnerApproval.approval, null);
  assert.equal(value.separateOwnerApproval.reviewerDecisionCanSubstitute, false);
  for (const key of EXPECTED_FALSE_AUTHORIZATION_FLAGS) {
    assert.equal(value.authorizationBoundary[key], false, `${key} must stay false.`);
  }
});

test("decision schema binds identity, exact inputs, every check and review-only effect", () => {
  const { value } = verifyCommittedReviewRequest();
  const schema = value.reviewerDecisionSchema;
  assert.equal(
    schema.fixedBindings.reviewSubjectCanonicalSha256,
    value.integrity.reviewSubjectCanonicalSha256
  );
  assert.equal(schema.fixedBindings.sourceCommit, REVIEW_REQUEST_CONSTANTS.sourceCommit);
  assert.equal(
    schema.fixedBindings.publishedInitializerRawSha256,
    "0x2f78e23ba4892194f2e55c99de479c5a5421329cc4cf992ed2253dd5c0512f02"
  );
  assert.equal(
    schema.reviewerIdentitySchema.exactIdentityMustBeProvisionedOutOfBandBeforeAcceptance,
    true
  );
  assert.equal(schema.reviewerIdentitySchema.selfAssertedIndependenceAloneIsSufficient, false);
  assert.deepEqual(
    schema.checksSchema.exactOrderedIds,
    value.reviewSubject.reviewerRequiredChecks.map(({ id }) => id)
  );
  assert.equal(schema.checksSchema.approvalRequiresEveryCheckPass, true);
  assert.equal(schema.findingsSchema.unresolvedCriticalOrHighPermittedForApproval, false);
  assert.equal(
    schema.authorizationEffect,
    "closes_external_review_gate_for_exact_pinned_subject_only_after_separate_verification"
  );
  assert.match(
    schema.limitationsAcknowledgedExact.join("\n"),
    /later post-claim, submission, reconciler, broadcaster, or production-composition code requires a new exact review request/u
  );
  assert.equal(schema.ownerApprovalEffect, "none");
  assert.match(
    value.limitations.join("\n"),
    /later post-claim, submission, reconciler, broadcaster, or production-composition code is outside its review subject/u
  );
});

test("resealed overclaims, scope drift and invented principals are still rejected", () => {
  const { value } = verifyCommittedReviewRequest();
  const mutations = [
    (copy) => {
      copy.status = "approved";
    },
    (copy) => {
      copy.reviewer = { identity: "invented" };
      copy.reviewerAuthentication.authenticatedIndependentReviewVerified = true;
    },
    (copy) => {
      copy.separateOwnerApproval.owner = "invented";
      copy.separateOwnerApproval.approval = { decision: "approve" };
    },
    (copy) => {
      copy.authorizationBoundary.authorizesSignature = true;
    },
    (copy) => {
      copy.authorizationBoundary.authorizesBroadcast = true;
    },
    (copy) => {
      copy.securityBoundary.walletAccessed = true;
    },
    (copy) => {
      copy.reviewSubject.exactDirectCallScope.selector = "0xac9650d8";
    },
    (copy) => {
      copy.reviewSubject.exactDirectCallScope.calldata = "0x";
    },
    (copy) => {
      copy.reviewSubject.contractIdentityAndNonProxyBoundary.historicalCheckpoint.freshForSubmission = true;
    },
    (copy) => {
      copy.reviewSubject.contractIdentityAndNonProxyBoundary.claimStrength =
        "timeless_non_proxy_claim";
    },
    (copy) => {
      copy.reviewSubject.excludedActions.pop();
    },
    (copy) => {
      copy.reviewerDecisionSchema.ownerApprovalEffect = "approves";
    }
  ];
  for (const mutate of mutations) assertResealedMutationRejected(value, mutate);
});

test("committed bundle contains no secret material and detector rejects an injected field", () => {
  const { value } = verifyCommittedReviewRequest();
  assertNoSecretMaterial(value);
  const injected = clone(value);
  injected[["mne", "monic"].join("")] = "not-a-secret";
  assert.throws(() => assertNoSecretMaterial(injected), /forbidden secret-material field/u);
});

test("generator is offline by construction and writes only under explicit --write", () => {
  const library = readFileSync(
    `${REPOSITORY_ROOT}/scripts/pancake-pool-external-review-request/review-request-lib.mjs`,
    "utf8"
  );
  const generator = readFileSync(
    `${REPOSITORY_ROOT}/scripts/pancake-pool-external-review-request/generate.mjs`,
    "utf8"
  );
  const source = `${library}\n${generator}`;
  assert.doesNotMatch(source, /from "node:(?:http|https|net|tls|dgram)"/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /process\.env/u);
  assert.match(generator, /if \(mode === "--write"\)/u);
  assert.equal(generator.includes("--publish"), false);
  assert.equal(generator.includes("--send"), false);
});
