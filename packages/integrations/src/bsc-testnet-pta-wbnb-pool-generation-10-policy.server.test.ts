import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  authenticateBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse,
  buildBscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicyForInternalUse,
  consumeBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse,
  createBscTestnetPtaWbnbPoolGeneration10PolicyRealmForTestsOnly,
  deriveBscTestnetPtaWbnbPoolGeneration10ReviewedSubjectSha256ForInternalUse
} from "./bsc-testnet-pta-wbnb-pool-generation-10-policy.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ATTEMPT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_CLAIM_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ENVELOPE_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RELEASE_COMMIT,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RUNTIME_MANIFEST_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_SIGNING_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
  type BscTestnetPtaWbnbPoolGeneration10PredecessorBinding
} from "./bsc-testnet-pta-wbnb-pool-generation-10-recovery";
import { BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN } from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";

const hex = (byte: string) => `0x${byte.repeat(64)}` as const;

function release() {
  return Object.freeze({
    releaseCommit: "1".repeat(40),
    releaseTree: "2".repeat(40),
    runtimeManifest: Object.freeze({
      schemaVersion: 2 as const,
      domain: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN,
      nodeVersion: "v24.14.1",
      entries: Object.freeze([]),
      runtimeManifestSha256: hex("3")
    })
  });
}

function predecessor(): BscTestnetPtaWbnbPoolGeneration10PredecessorBinding {
  return Object.freeze({
    generation: 9,
    state: "signed_committed_without_submission_started",
    claimId: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_CLAIM_ID,
    releaseCommit: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RELEASE_COMMIT,
    runtimeManifestSha256:
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RUNTIME_MANIFEST_SHA256,
    envelopeHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ENVELOPE_HASH,
    attemptId: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ATTEMPT_ID,
    transactionHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
    signingHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_SIGNING_HASH,
    signedTransactionKeccak256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
    signedCommitSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
    gasLimit: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT,
    gasPriceWei: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI,
    maximumCostWei: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI,
    localRecordHashes: Object.freeze([
      { name: "01-claim.v9.json", byteLength: 1364, sha256: hex("4") },
      { name: "02-transition.v9.json", byteLength: 1402, sha256: hex("5") },
      { name: "03-transition.v9.json", byteLength: 1399, sha256: hex("6") },
      { name: "04-transition.v9.json", byteLength: 1956, sha256: hex("7") }
    ]) as BscTestnetPtaWbnbPoolGeneration10PredecessorBinding["localRecordHashes"],
    predecessorBundleDigest: hex("8"),
    newSignatureAuthorized: false,
    maximumAdditionalSignatures: "0"
  });
}

describe("generation-10 existing-signature release policy", () => {
  it("binds exactly two zero-P0/P1 internal reviews and mints a one-use runtime instantiation", () => {
    const exactRelease = release();
    const exactPredecessor = predecessor();
    const subject = deriveBscTestnetPtaWbnbPoolGeneration10ReviewedSubjectSha256ForInternalUse(
      exactRelease,
      exactPredecessor
    );
    const policy = buildBscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicyForInternalUse({
      release: exactRelease,
      predecessor: exactPredecessor,
      reviewers: [
        {
          taskLabel: "release_review_a",
          modelRole: "independent_internal_security_reviewer",
          decision: "GO_WITH_ZERO_P0_AND_ZERO_P1",
          p0Findings: 0,
          p1Findings: 0,
          reviewedSubjectSha256: subject
        },
        {
          taskLabel: "release_review_b",
          modelRole: "independent_internal_release_reviewer",
          decision: "GO_WITH_ZERO_P0_AND_ZERO_P1",
          p0Findings: 0,
          p1Findings: 0,
          reviewedSubjectSha256: subject
        }
      ],
      reviewedAt: "2026-08-26T05:00:00.000Z",
      expiresAt: "2026-08-27T05:00:00.000Z"
    });
    expect(policy).not.toBeNull();
    expect(policy?.scope).toMatchObject({
      existingSignatureOnly: true,
      newSignatureAuthorized: false,
      maximumAdditionalSignatures: "0",
      maximumSends: "1",
      liquidityActionAuthorized: false,
      mainnetWriteAuthorized: false
    });
    if (policy === null) throw new Error("Expected an admitted policy");
    const realm = createBscTestnetPtaWbnbPoolGeneration10PolicyRealmForTestsOnly(
      policy,
      new Date("2026-08-26T05:01:00.000Z")
    );
    const instantiation = realm.instantiate({
      envelopeHash: hex("9"),
      executionEnvelopeObservedAt: "2026-08-26T05:00:59.000Z",
      expiresAt: "2026-08-26T05:05:00.000Z",
      predecessorBundleDigest: exactPredecessor.predecessorBundleDigest
    });
    expect(instantiation).not.toBeNull();
    expect(instantiation?.newSignatureAuthorized).toBe(false);
    expect(
      authenticateBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse(instantiation)
    ).toBe(true);
    expect(consumeBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse(instantiation)).toBe(
      true
    );
    expect(
      authenticateBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse(instantiation)
    ).toBe(false);
  });

  it("rejects an incomplete reviewer set", () => {
    const exactRelease = release();
    const exactPredecessor = predecessor();
    const subject = deriveBscTestnetPtaWbnbPoolGeneration10ReviewedSubjectSha256ForInternalUse(
      exactRelease,
      exactPredecessor
    );
    expect(
      buildBscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicyForInternalUse({
        release: exactRelease,
        predecessor: exactPredecessor,
        reviewers: [
          {
            taskLabel: "release_review_a",
            modelRole: "independent_internal_security_reviewer",
            decision: "GO_WITH_ZERO_P0_AND_ZERO_P1",
            p0Findings: 0,
            p1Findings: 0,
            reviewedSubjectSha256: subject
          }
        ],
        reviewedAt: "2026-08-26T05:00:00.000Z",
        expiresAt: "2026-08-27T05:00:00.000Z"
      })
    ).toBeNull();
  });
});
