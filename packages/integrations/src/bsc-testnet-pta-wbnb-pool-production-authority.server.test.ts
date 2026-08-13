import { createHash } from "node:crypto";

import { keccak256, stringToHex, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96,
  BSC_TESTNET_WBNB_ADDRESS
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import { BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN } from "./bsc-testnet-pta-wbnb-pool-authorization.server";
import type { BscTestnetPtaWbnbPoolOneShotPreparedDescriptor } from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";
import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG,
  BSC_TESTNET_PTA_WBNB_POOL_OWNER_DESIGNATED_REVIEW_DOMAIN,
  buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse,
  createBscTestnetPtaWbnbPoolAuthorityIssuerForTests,
  deriveBscTestnetPtaWbnbPoolOwnerDesignatedReviewDigestForInternalUse,
  type BscTestnetPtaWbnbPoolOwnerDesignatedReviewDecision
} from "./bsc-testnet-pta-wbnb-pool-production-authority.server";
import type { BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust } from "./bsc-testnet-pta-wbnb-pool-signing-worker";

const ENVELOPE_HASH = `0x${"11".repeat(32)}` as Hex;
const RUNTIME_MANIFEST = `0x${"22".repeat(32)}` as Hex;
const WORKER_SOURCE = `0x${"33".repeat(32)}` as Hex;
const RELEASE = "a".repeat(40);
const REVIEWED_AT = "2026-08-13T04:29:50.000Z";
const AUTHORIZED_AT = "2026-08-13T04:29:55.000Z";
const NOW = "2026-08-13T04:30:00.000Z";
const EXPIRES_AT = "2026-08-13T04:30:30.000Z";

function deeplyFreeze<Value>(value: Value): Readonly<Value> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deeplyFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function descriptor(): BscTestnetPtaWbnbPoolOneShotPreparedDescriptor {
  return deeplyFreeze({
    status: "prepared_non_authorizing",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    exactBinding: {
      chainId: 97,
      from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      nonce: 1n,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      selector: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
      valueWei: 0n,
      gasLimit: 5_983_857n,
      gasPriceWei: 100_000_000n
    },
    envelopeExpiresAt: EXPIRES_AT,
    signingReady: false,
    signingAuthorized: false,
    executionAuthorized: false,
    authorizationReceiptCreated: false,
    journalClaimCreated: false,
    signerInvoked: false,
    signatureCreated: false,
    transactionSubmitted: false,
    requirements: {
      externalExactAuthorizationRequired: true,
      durableAtomicClaimRequiredBeforeCustodyAccess: true,
      freshPendingNonceAndPoolRecheckRequiredAfterClaim: true,
      ambiguousClaimOrSigningOutcomeIsNonRetryableUntilReconciled: true,
      journalMustPersistSignedBytesBeforeSubmission: true,
      postSubmissionCanonicalReceiptReconciliationRequired: true
    }
  });
}

function review(): BscTestnetPtaWbnbPoolOwnerDesignatedReviewDecision {
  return deeplyFreeze({
    schemaVersion: 1,
    kind: "owner_designated_multi_agent_review_v1",
    decision: "GO_EXACT_CHAIN_97_ONE_SHOT_ONLY",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    releaseCommit: RELEASE,
    reviewedReleaseManifestSha256: RUNTIME_MANIFEST,
    reviewerIdentity: "distinct-review-subagent",
    implementationAgentIdentity: "implementation-subagent",
    reviewedAt: REVIEWED_AT,
    expiresAt: EXPIRES_AT,
    limitations: {
      cryptographicReviewerIdentityAvailable: false,
      ownerDesignationAndAcknowledgementRequired: true,
      reviewIsNotTransactionAuthorization: true,
      separateExactOwnerTransactionAuthorizationRequired: true
    }
  });
}

function harness() {
  const localCapability = Object.freeze(Object.create(null) as object);
  const localBrands = new WeakSet<object>([localCapability]);
  const releaseTrust: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust = deeplyFreeze({
    schemaVersion: 1,
    releaseCommit: RELEASE,
    originReference: "refs/remotes/origin/main",
    cleanPublishedHead: true,
    workerSourceSha256: WORKER_SOURCE,
    runtimeManifestSha256: RUNTIME_MANIFEST
  });
  const authority = createBscTestnetPtaWbnbPoolAuthorityIssuerForTests(
    Object.freeze({
      now: () => new Date(NOW),
      releaseTrust,
      authenticateLocalCustodyOwnerCapability: (value: unknown) =>
        typeof value === "object" && value !== null && localBrands.has(value)
    })
  );
  return { authority, localCapability, releaseTrust };
}

describe("PTA/WBNB owner-designated authority protocol", () => {
  it("builds and authenticates the exact decoded one-signature/one-broadcast challenge", () => {
    const exactDescriptor = descriptor();
    const exactReview = review();
    const { authority, localCapability, releaseTrust } = harness();
    const challenge = buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
      exactDescriptor,
      exactReview,
      releaseTrust,
      AUTHORIZED_AT
    );
    expect(challenge).not.toBeNull();
    if (challenge === null) throw new Error("Challenge fixture failed.");
    expect(challenge.ownerAuthorizationText).toContain(`token0.PTA=${BSC_TESTNET_PTA_ADDRESS}`);
    expect(challenge.ownerAuthorizationText).toContain(`token1.WBNB=${BSC_TESTNET_WBNB_ADDRESS}`);
    expect(challenge.ownerAuthorizationText).toContain("fee=500");
    expect(challenge.ownerAuthorizationText).toContain(
      `sqrtPriceX96=${BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96}`
    );
    expect(challenge.ownerAuthorizationText).toContain("expectedTick=-138163");
    expect(challenge.ownerAuthorizationText).toContain("initialPrice=1 PTA = 0.000001 WBNB");
    expect(challenge.ownerAuthorizationText).toContain("liquidityActionAuthorized=false");
    expect(challenge.ownerAuthorizationTextSha256).toBe(
      `0x${createHash("sha256").update(challenge.ownerAuthorizationText).digest("hex")}`
    );
    const command = deeplyFreeze({
      schemaVersion: 1,
      kind: "execute_exact_bsc_testnet_pta_wbnb_pool_once_v1",
      executionFlag: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG,
      reviewDecision: exactReview,
      authorizedAt: AUTHORIZED_AT,
      ownerAuthorizationText: challenge.ownerAuthorizationText,
      ownerAuthorizationTextSha256: challenge.ownerAuthorizationTextSha256
    });
    const result = authority.authorize(exactDescriptor, command, localCapability);
    expect(result).toMatchObject({ status: "authorized" });
    if (result.status !== "authorized") throw new Error(result.issue.message);
    expect(authority.authenticateAuthorizedIntent(result.intent)).toBe(true);

    expect(authority.authorize(exactDescriptor, { ...command }, localCapability)).toMatchObject({
      status: "blocked",
      issue: { code: "AUTHORIZATION_REQUIRED" }
    });
    let commandProxyTraps = 0;
    const proxiedCommand = new Proxy(command, {
      get: () => {
        commandProxyTraps += 1;
        throw new Error("trap");
      },
      getPrototypeOf: () => {
        commandProxyTraps += 1;
        throw new Error("trap");
      }
    });
    expect(authority.authorize(exactDescriptor, proxiedCommand, localCapability)).toMatchObject({
      status: "blocked",
      issue: { code: "AUTHORIZATION_REQUIRED" }
    });
    expect(commandProxyTraps).toBe(0);

    expect(
      authority.authorize(
        exactDescriptor,
        deeplyFreeze({
          schemaVersion: 1,
          kind: "exact_owner_envelope_authorization_v1",
          decision: "authorize_one_chain_97_pool_initialization_signature"
        }),
        localCapability
      )
    ).toMatchObject({ status: "blocked", issue: { code: "AUTHORIZATION_REQUIRED" } });

    const changedText = `${challenge.ownerAuthorizationText}\nliquidityActionAuthorized=true`;
    expect(
      authority.authorize(
        exactDescriptor,
        deeplyFreeze({
          ...command,
          ownerAuthorizationText: changedText,
          ownerAuthorizationTextSha256: `0x${createHash("sha256").update(changedText).digest("hex")}`
        }),
        localCapability
      )
    ).toMatchObject({ status: "blocked", issue: { code: "OWNER_AUTHORIZATION_MISMATCH" } });
    expect(
      authority.authorize(
        exactDescriptor,
        deeplyFreeze({ ...command, ownerAuthorizationTextSha256: `0x${"44".repeat(32)}` }),
        localCapability
      )
    ).toMatchObject({ status: "blocked" });
  });

  it("rejects proxy/unfrozen review input without traps and domain-separates review from owner", () => {
    const exactReview = review();
    let traps = 0;
    const proxied = new Proxy(exactReview, {
      get: () => {
        traps += 1;
        throw new Error("trap");
      },
      getPrototypeOf: () => {
        traps += 1;
        throw new Error("trap");
      }
    });
    const { releaseTrust } = harness();
    expect(
      buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
        descriptor(),
        proxied,
        releaseTrust,
        AUTHORIZED_AT
      )
    ).toBeNull();
    expect(traps).toBe(0);
    expect(
      buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
        descriptor(),
        { ...exactReview },
        releaseTrust,
        AUTHORIZED_AT
      )
    ).toBeNull();
    const reviewDigest =
      deriveBscTestnetPtaWbnbPoolOwnerDesignatedReviewDigestForInternalUse(exactReview);
    expect(reviewDigest).not.toBe(
      keccak256(
        stringToHex(
          `${BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN}\u0000${JSON.stringify(exactReview)}`
        )
      )
    );
    expect(BSC_TESTNET_PTA_WBNB_POOL_OWNER_DESIGNATED_REVIEW_DOMAIN).not.toBe(
      BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN
    );
  });
});
