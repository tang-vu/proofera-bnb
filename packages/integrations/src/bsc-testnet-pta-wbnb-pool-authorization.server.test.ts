import { keccak256, stringToHex, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_REVIEW_ARTIFACT_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN,
  BSC_TESTNET_PTA_WBNB_POOL_REVIEWER_APPROVAL_DIGEST_DOMAIN,
  createBscTestnetPtaWbnbPoolAuthorizationGateForTests,
  createBscTestnetPtaWbnbPoolProductionAuthorizationGate
} from "./bsc-testnet-pta-wbnb-pool-authorization.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

const ENVELOPE_HASH = `0x${"11".repeat(32)}` as Hex;
const MANIFEST = `0x${"22".repeat(32)}` as Hex;
const TEXT_DIGEST = `0x${"33".repeat(32)}` as Hex;
const RELEASE = "a".repeat(40);
const REVIEWED_AT = "2026-08-13T04:29:50.000Z";
const AUTHORIZED_AT = "2026-08-13T04:29:55.000Z";
const EXPIRES_AT = "2026-08-13T04:30:30.000Z";

function deeplyFreeze<Value>(value: Value): Readonly<Value> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deeplyFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalDigest(domain: string, body: Readonly<Record<string, unknown>>): Hex {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(body).sort()) sorted[key] = body[key];
  return keccak256(stringToHex(`${domain}\u0000${JSON.stringify(sorted)}`));
}

function descriptor() {
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

function reviewerApproval() {
  const body = {
    schemaVersion: 1,
    kind: "authenticated_independent_initializer_reviewer_approval_v1",
    decision: "approve_exact_direct_initializer_only",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    releaseCommit: RELEASE,
    runtimeManifestSha256: MANIFEST,
    reviewerIdentity: "Independent Reviewer A",
    independence: "independent_from_implementation_owner_and_rpc_rechecker",
    reviewedArtifactSha256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_REVIEW_ARTIFACT_SHA256,
    manager: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    selector: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
    dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
    expectedPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
    reviewedAt: REVIEWED_AT,
    expiresAt: EXPIRES_AT
  } as const;
  return deeplyFreeze({
    ...body,
    approvalDigest: canonicalDigest(BSC_TESTNET_PTA_WBNB_POOL_REVIEWER_APPROVAL_DIGEST_DOMAIN, body)
  });
}

function ownerAuthorization(reviewerDigest: Hex) {
  const exact = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: "5983857",
    gasPriceWei: "100000000",
    sourceEnvelopeHash: ENVELOPE_HASH
  });
  if (exact === null) throw new Error("Transaction fixture failed.");
  const body = {
    schemaVersion: 1,
    kind: "exact_owner_envelope_authorization_v1",
    decision: "authorize_one_chain_97_pool_initialization_signature",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    releaseCommit: RELEASE,
    runtimeManifestSha256: MANIFEST,
    reviewerApprovalDigest: reviewerDigest,
    ownerIdentity: "ProofEra Repository Owner",
    authorizationTextSha256: TEXT_DIGEST,
    signingHash: exact.signingHash,
    gasLimit: exact.gasLimit,
    gasPriceWei: exact.gasPriceWei,
    maximumCostWei: exact.maximumCostWei,
    authorizedAt: AUTHORIZED_AT,
    expiresAt: EXPIRES_AT
  } as const;
  return deeplyFreeze({
    ...body,
    authorizationDigest: canonicalDigest(
      BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN,
      body
    )
  });
}

function harness(options: { reviewer?: boolean; owner?: boolean } = {}) {
  const reviewer = reviewerApproval();
  const owner = ownerAuthorization(reviewer.approvalDigest);
  const reviewerBrands = new WeakSet<object>();
  const ownerBrands = new WeakSet<object>();
  if (options.reviewer !== false) reviewerBrands.add(reviewer);
  if (options.owner !== false) ownerBrands.add(owner);
  const gate = createBscTestnetPtaWbnbPoolAuthorizationGateForTests({
    asOf: () => new Date("2026-08-13T04:30:00.000Z"),
    authenticateExternalReviewerApproval: (value: unknown) =>
      typeof value === "object" && value !== null && reviewerBrands.has(value),
    authenticateOwnerEnvelopeAuthorization: (value: unknown) =>
      typeof value === "object" && value !== null && ownerBrands.has(value)
  });
  return { gate, reviewer, owner };
}

describe("PTA/WBNB pool exact authorization composition", () => {
  it("keeps the production gate permanently non-authorizing in this release", () => {
    const gate = createBscTestnetPtaWbnbPoolProductionAuthorizationGate();
    expect(
      gate.authorize(descriptor(), reviewerApproval(), ownerAuthorization(`0x${"44".repeat(32)}`))
    ).toMatchObject({
      status: "blocked",
      issue: { code: "CONFIGURATION_INVALID" },
      boundary: { productionReceiptIssuerPresent: false }
    });
    expect(gate.authenticateAuthorizedIntent(Object.freeze({}))).toBe(false);
  });

  it("requires both externally authenticated capabilities and brands only the exact output", () => {
    const { gate, reviewer, owner } = harness();
    const result = gate.authorize(descriptor(), reviewer, owner);
    expect(result).toMatchObject({
      status: "authorized",
      issue: null,
      intent: {
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
        envelopeHash: ENVELOPE_HASH,
        reviewerApprovalDigest: reviewer.approvalDigest,
        ownerAuthorizationDigest: owner.authorizationDigest,
        releaseCommit: RELEASE,
        runtimeManifestSha256: MANIFEST
      }
    });
    if (result.status !== "authorized") throw new Error(result.issue.message);
    expect(gate.authenticateAuthorizedIntent(result.intent)).toBe(true);
    expect(gate.authenticateAuthorizedIntent(structuredClone(result.intent))).toBe(false);
  });

  it("does not mistake correctly self-sealed receipt bytes for authentication", () => {
    for (const options of [{ reviewer: false }, { owner: false }]) {
      const { gate, reviewer, owner } = harness(options);
      expect(gate.authorize(descriptor(), reviewer, owner)).toMatchObject({
        status: "blocked",
        issue: {
          code:
            options.reviewer === false
              ? "REVIEWER_AUTHENTICATION_FAILED"
              : "OWNER_AUTHENTICATION_FAILED"
        }
      });
    }
  });

  it("rejects release/digest mutations, owner-reviewer identity reuse, accessors, symbols, and proxies", () => {
    const { gate, reviewer, owner } = harness();
    const changedRelease = deeplyFreeze({ ...owner, releaseCommit: "b".repeat(40) });
    expect(gate.authorize(descriptor(), reviewer, changedRelease)).toMatchObject({
      status: "blocked"
    });
    const sameIdentityBody = { ...owner, ownerIdentity: reviewer.reviewerIdentity };
    Reflect.deleteProperty(sameIdentityBody, "authorizationDigest");
    const sameIdentity = deeplyFreeze({
      ...sameIdentityBody,
      authorizationDigest: canonicalDigest(
        BSC_TESTNET_PTA_WBNB_POOL_OWNER_AUTHORIZATION_DIGEST_DOMAIN,
        sameIdentityBody
      )
    });
    expect(gate.authorize(descriptor(), reviewer, sameIdentity)).toMatchObject({
      status: "blocked"
    });
    expect(gate.authorize(new Proxy(descriptor(), {}), reviewer, owner)).toMatchObject({
      status: "blocked",
      issue: { code: "DESCRIPTOR_INVALID" }
    });
    expect(
      gate.authorize(deeplyFreeze({ ...descriptor(), [Symbol("extra")]: true }), reviewer, owner)
    ).toMatchObject({ status: "blocked" });
    let getterCalls = 0;
    const accessor = Object.freeze(
      Object.defineProperty({}, "approvalDigest", {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return reviewer.approvalDigest;
        }
      })
    );
    expect(gate.authorize(descriptor(), accessor, owner)).toMatchObject({ status: "blocked" });
    expect(getterCalls).toBe(0);
  });
});
