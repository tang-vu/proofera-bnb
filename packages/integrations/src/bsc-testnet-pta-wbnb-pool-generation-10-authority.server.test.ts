import { readFileSync } from "node:fs";

import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_EXECUTION_FLAG,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_OWNER_CONFIRMATION_DOMAIN,
  buildBscTestnetPtaWbnbPoolGeneration10OwnerChallengeForInternalUse
} from "./bsc-testnet-pta-wbnb-pool-generation-10-authority.server";
import {
  buildBscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicyForInternalUse,
  createBscTestnetPtaWbnbPoolGeneration10PolicyRealmForTestsOnly,
  deriveBscTestnetPtaWbnbPoolGeneration10ReviewedSubjectSha256ForInternalUse
} from "./bsc-testnet-pta-wbnb-pool-generation-10-policy.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
  type BscTestnetPtaWbnbPoolGeneration10PredecessorBinding
} from "./bsc-testnet-pta-wbnb-pool-generation-10-recovery";
import { BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN } from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";

const bytes32 = (byte: string) => `0x${byte.repeat(64)}` as Hex;

describe("generation-10 owner authority", () => {
  it("authorizes one existing signature send and explicitly authorizes zero new signatures", () => {
    const release = Object.freeze({
      releaseCommit: "1".repeat(40),
      releaseTree: "2".repeat(40),
      runtimeManifest: Object.freeze({
        schemaVersion: 2 as const,
        domain: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN,
        nodeVersion: "v24.14.1",
        entries: Object.freeze([]),
        runtimeManifestSha256: bytes32("3")
      })
    });
    const predecessor = {
      generation: 9,
      transactionHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
      predecessorBundleDigest: bytes32("4")
    } as unknown as BscTestnetPtaWbnbPoolGeneration10PredecessorBinding;
    const subject = deriveBscTestnetPtaWbnbPoolGeneration10ReviewedSubjectSha256ForInternalUse(
      release,
      predecessor
    );
    const policy = buildBscTestnetPtaWbnbPoolGeneration10ReleaseReviewPolicyForInternalUse({
      release,
      predecessor,
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
    if (policy === null) throw new Error("policy fixture invalid");
    const realm = createBscTestnetPtaWbnbPoolGeneration10PolicyRealmForTestsOnly(
      policy,
      new Date("2026-08-26T05:01:00.000Z")
    );
    const instantiation = realm.instantiate({
      envelopeHash: bytes32("5"),
      executionEnvelopeObservedAt: "2026-08-26T05:00:59.000Z",
      expiresAt: "2026-08-26T05:05:00.000Z",
      predecessorBundleDigest: predecessor.predecessorBundleDigest
    });
    if (instantiation === null) throw new Error("instantiation fixture invalid");
    const challenge = buildBscTestnetPtaWbnbPoolGeneration10OwnerChallengeForInternalUse({
      instantiation,
      predecessor,
      release,
      ceremonyNonce: bytes32("6"),
      challengeIssuedAt: "2026-08-26T05:01:00.000Z",
      confirmationNotAfter: "2026-08-26T05:05:00.000Z"
    });
    expect(challenge).not.toBeNull();
    expect(challenge?.ownerAuthorizationText).toContain("existingSignatureOnly=true");
    expect(challenge?.ownerAuthorizationText).toContain("newSignatureAuthorized=false");
    expect(challenge?.ownerAuthorizationText).toContain("maximumAdditionalSignatures=0");
    expect(challenge?.ownerAuthorizationText).toContain("maximumSends=1");
    expect(challenge?.ownerAuthorizationText).toContain("liquidityActionAuthorized=false");
    expect(challenge?.ownerConfirmationText).toContain(
      `${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_OWNER_CONFIRMATION_DOMAIN}|executionFlag=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_EXECUTION_FLAG}`
    );
    expect(challenge?.ownerConfirmationText).toContain(
      `transactionHash=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH}`
    );
  });

  it("keeps custody, DPAPI and signing-worker imports outside the Gen10 runner path", () => {
    for (const name of [
      "bsc-testnet-pta-wbnb-pool-generation-10-authority.server.ts",
      "bsc-testnet-pta-wbnb-pool-generation-10-release.server.ts",
      "bsc-testnet-pta-wbnb-pool-generation-10-runner.server.ts"
    ]) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
      expect(source).not.toContain('from "./bsc-testnet-pta-wbnb-pool-signing-worker"');
      expect(source).not.toContain("DPAPI_UNPROTECT");
      expect(source).not.toContain("nativeWindowsSignExactPoolTransaction");
    }
  });
});
