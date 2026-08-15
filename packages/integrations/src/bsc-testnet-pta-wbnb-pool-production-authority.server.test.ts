import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256, type Hex } from "viem";

const reviewBrands = vi.hoisted(() => ({
  states: new WeakMap<object, { fresh: boolean; binding: Readonly<Record<string, unknown>> }>()
}));

vi.mock("server-only", () => ({}));

vi.mock("./bsc-testnet-pta-wbnb-pool-release-review-policy.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const same = (left: unknown, right: unknown): boolean => {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  };
  return {
    ...actual,
    authenticateBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse: (
      value: unknown,
      binding: unknown
    ) => {
      if (value === null || typeof value !== "object") return false;
      const state = reviewBrands.states.get(value);
      return state?.fresh === true && same(state.binding, binding);
    },
    consumeBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse: (
      value: unknown,
      binding: unknown
    ) => {
      if (value === null || typeof value !== "object") return false;
      const state = reviewBrands.states.get(value);
      if (state === undefined || !state.fresh) return false;
      state.fresh = false;
      return same(state.binding, binding);
    }
  };
});

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
import type { BscTestnetPtaWbnbPoolOneShotPreparedDescriptor } from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  buildBscTestnetPtaWbnbPoolSigningWorkerRequest
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_OWNER_CONFIRMATION_DOMAIN,
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG,
  buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse,
  conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse,
  createBscTestnetPtaWbnbPoolAuthorityIssuerForTests,
  type BscTestnetPtaWbnbPoolProductionAuthorityResult
} from "./bsc-testnet-pta-wbnb-pool-production-authority.server";
import type { BscTestnetPtaWbnbPoolRuntimeReviewInstantiation } from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";
import type { BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust } from "./bsc-testnet-pta-wbnb-pool-signing-worker";

const ENVELOPE_HASH = `0x${"11".repeat(32)}` as Hex;
const RUNTIME_MANIFEST = `0x${"22".repeat(32)}` as Hex;
const WORKER_SOURCE = `0x${"33".repeat(32)}` as Hex;
const POLICY_DIGEST = `0x${"44".repeat(32)}` as Hex;
const REVIEWED_SUBJECT = `0x${"55".repeat(32)}` as Hex;
const INSTANTIATION_DIGEST = `0x${"66".repeat(32)}` as Hex;
const NO_EFFECT_PROOF_DIGEST = `0x${"67".repeat(32)}` as Hex;
const NO_EFFECT_ENVELOPE_HASH = `0x${"68".repeat(32)}` as Hex;
const PREDECESSOR_FENCE_SHA256 = `0x${"69".repeat(32)}` as Hex;
const RELEASE = "a".repeat(40);
const RELEASE_TREE = "b".repeat(40);
const CEREMONY_NONCE = `0x${"88".repeat(32)}` as const;
const POLICY_REVIEWED_AT = "2026-08-13T04:20:00.000Z";
const ENVELOPE_OBSERVED_AT = "2026-08-13T04:29:48.000Z";
const INSTANTIATED_AT = "2026-08-13T04:29:50.000Z";
const AUTHORIZED_AT = "2026-08-13T04:29:55.000Z";
const CONFIRMED_AT = "2026-08-13T04:29:55.002Z";
const EXECUTION_EXPIRES_AT = "2026-08-13T04:30:40.002Z";
const NOW = "2026-08-13T04:30:00.000Z";
const EXPIRES_AT = "2026-08-13T04:34:48.000Z";
const POLICY_EXPIRES_AT = "2026-08-13T05:00:00.000Z";

function deeplyFreeze<Value>(value: Value): Readonly<Value> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deeplyFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function descriptor(
  envelopeExpiresAt = EXPIRES_AT
): BscTestnetPtaWbnbPoolOneShotPreparedDescriptor {
  const envelopeObservedAt = new Date(Date.parse(envelopeExpiresAt) - 300_000).toISOString();
  return deeplyFreeze({
    status: "prepared_non_authorizing",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    envelopeObservedAt,
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
    envelopeExpiresAt,
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

function reviewBinding(
  value: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    releaseCommit: value.releaseCommit,
    releaseTree: value.releaseTree,
    runtimeManifestSha256: value.runtimeManifestSha256,
    policyDigest: value.policyDigest,
    reviewedSubjectSha256: value.reviewedSubjectSha256,
    recovery: value.recovery,
    envelopeHash: value.envelopeHash,
    executionEnvelopeObservedAt: value.executionEnvelopeObservedAt,
    expiresAt: value.expiresAt,
    instantiationDigest: value.instantiationDigest
  });
}

function runtimeRecoveryForEnvelopeObservedAt(
  envelopeObservedAt = ENVELOPE_OBSERVED_AT
): BscTestnetPtaWbnbPoolRuntimeReviewInstantiation["recovery"] {
  const observed = Date.parse(envelopeObservedAt);
  return deeplyFreeze({
    generation: 3,
    predecessorFence: {
      status: "superseded_before_worker",
      terminalCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN",
      workerAuthorizationOutcome: "not_attempted",
      workerStartOutcome: "not_attempted",
      signatureOutcome: "not_attempted",
      submissionOutcome: "not_attempted",
      submissionJournalState: "exact_empty",
      fenceRecordedAt: new Date(observed - 1_000).toISOString(),
      predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256,
      noEffectProofDigest: NO_EFFECT_PROOF_DIGEST,
      noEffectEnvelopeHash: NO_EFFECT_ENVELOPE_HASH,
      noEffectObservedAt: new Date(observed - 2_000).toISOString(),
      predecessorFenceSha256: PREDECESSOR_FENCE_SHA256
    }
  });
}

function runtimeReview(
  overrides: Partial<BscTestnetPtaWbnbPoolRuntimeReviewInstantiation> = {},
  branded = true
): BscTestnetPtaWbnbPoolRuntimeReviewInstantiation {
  const value = deeplyFreeze({
    schemaVersion: 3,
    kind: "automated_release_policy_recovery_envelope_instantiation_v3",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    policyDigest: POLICY_DIGEST,
    releaseCommit: RELEASE,
    releaseTree: RELEASE_TREE,
    runtimeManifestSha256: RUNTIME_MANIFEST,
    reviewedSubjectSha256: REVIEWED_SUBJECT,
    recovery: runtimeRecoveryForEnvelopeObservedAt(),
    reviewerTaskLabels: ["authority-security-review", "journal-recovery-review"],
    policyReviewedAt: POLICY_REVIEWED_AT,
    policyExpiresAt: POLICY_EXPIRES_AT,
    envelopeHash: ENVELOPE_HASH,
    executionEnvelopeObservedAt: ENVELOPE_OBSERVED_AT,
    instantiatedAt: INSTANTIATED_AT,
    expiresAt: EXPIRES_AT,
    automatedPolicyApplication: true,
    reviewerInspectedExactEnvelope: false,
    reviewIsNotTransactionAuthorization: true,
    instantiationDigest: INSTANTIATION_DIGEST,
    ...overrides
  }) as BscTestnetPtaWbnbPoolRuntimeReviewInstantiation;
  if (branded) reviewBrands.states.set(value, { fresh: true, binding: reviewBinding(value) });
  return value;
}

function harness(now: () => Date = () => new Date(NOW)) {
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
      now,
      releaseTrust,
      releaseTree: RELEASE_TREE,
      authenticateLocalCustodyPathAclCapability: (value: unknown) =>
        typeof value === "object" && value !== null && localBrands.has(value)
    })
  );
  return { authority, localCapability, releaseTrust };
}

function commandFor(
  instantiation: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation,
  releaseTrust: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust
) {
  const challenge = buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
    descriptor(),
    instantiation,
    releaseTrust,
    RELEASE_TREE,
    CEREMONY_NONCE,
    AUTHORIZED_AT
  );
  if (challenge === null) throw new Error("Challenge fixture failed.");
  return deeplyFreeze({
    schemaVersion: 6,
    kind: "execute_exact_bsc_testnet_pta_wbnb_pool_recovery_generation_3_once_v6",
    executionFlag: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG,
    runtimeReviewInstantiation: instantiation,
    challengeIssuedAt: AUTHORIZED_AT,
    recovery: challenge.recovery,
    ceremonyNonce: CEREMONY_NONCE,
    ownerAuthorizationText: challenge.ownerAuthorizationText,
    ownerAuthorizationTextSha256: challenge.ownerAuthorizationTextSha256
  });
}

async function confirmedCommand(
  instantiation: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation,
  releaseTrust: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust,
  exactDescriptor = descriptor()
) {
  let displayed = "";
  let clock = Date.parse(AUTHORIZED_AT);
  const result = await conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse(
    exactDescriptor,
    instantiation,
    releaseTrust,
    RELEASE_TREE,
    Object.freeze({
      now: () => new Date(clock++),
      writeChallenge: async (bytes: Uint8Array) => {
        displayed = Buffer.from(bytes).toString("utf8");
      },
      readExactConfirmation: async () => {
        const marker =
          "Paste exactly the following UTF-8 confirmation bytes, with no leading/trailing whitespace:\n";
        return Buffer.from(
          displayed.slice(displayed.indexOf(marker) + marker.length).trimEnd(),
          "utf8"
        );
      }
    })
  );
  if (result.status !== "confirmed") throw new Error(result.issue.message);
  return result.command;
}

async function authorizedHarness(now: () => Date = () => new Date(NOW)) {
  const setup = harness(now);
  const exactDescriptor = descriptor();
  const instantiation = runtimeReview();
  const command = await confirmedCommand(instantiation, setup.releaseTrust, exactDescriptor);
  const authorization = setup.authority.authorize(exactDescriptor, command, setup.localCapability);
  if (authorization.status !== "authorized") throw new Error(authorization.issue.message);
  return { ...setup, authorization };
}

function signingRequest(
  authorization: Extract<BscTestnetPtaWbnbPoolProductionAuthorityResult, { status: "authorized" }>,
  claimId = "claim-authority-capability-1",
  authenticatedAt = authorization.intent.authenticatedAt
) {
  return buildBscTestnetPtaWbnbPoolSigningWorkerRequest({
    operationKey: authorization.intent.operationKey,
    envelopeHash: authorization.intent.envelopeHash,
    reviewerApprovalDigest: authorization.intent.reviewerApprovalDigest,
    ownerAuthorizationDigest: authorization.intent.ownerAuthorizationDigest,
    claimId,
    journalClaimToken: `0x${"99".repeat(32)}`,
    releaseCommit: authorization.intent.releaseCommit,
    runtimeManifestSha256: authorization.intent.runtimeManifestSha256,
    authenticatedAt,
    expiresAt: authorization.intent.expiresAt,
    recovery: authorization.intent.recovery,
    transaction: authorization.intent.transaction
  });
}

function broadcastRequest(
  authorization: Extract<BscTestnetPtaWbnbPoolProductionAuthorityResult, { status: "authorized" }>,
  claimId = "claim-authority-capability-1"
) {
  const signedTransaction = "0x01" as Hex;
  const transactionHash = keccak256(signedTransaction);
  return deeplyFreeze({
    schemaVersion: 3,
    operation:
      "consume_exact_bsc_testnet_pta_wbnb_pool_broadcast_authorization_after_durable_start",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId,
    envelopeHash: authorization.intent.envelopeHash,
    releaseCommit: authorization.intent.releaseCommit,
    runtimeManifestSha256: authorization.intent.runtimeManifestSha256,
    reviewerApprovalDigest: authorization.intent.reviewerApprovalDigest,
    ownerAuthorizationDigest: authorization.intent.ownerAuthorizationDigest,
    recovery: authorization.intent.recovery,
    signingHash: authorization.intent.transaction.signingHash,
    transactionHash,
    signedTransactionKeccak256: transactionHash,
    submissionStartedDigest: `0x${"77".repeat(32)}`,
    authenticatedAt: authorization.intent.authenticatedAt,
    expiresAt: authorization.intent.expiresAt,
    signedTransaction,
    terminalPreSubmissionObservedAt: NOW,
    terminalPreSubmissionDigest: `0x${"aa".repeat(32)}`
  });
}

beforeEach(() => {
  reviewBrands.states = new WeakMap();
});

describe("PTA/WBNB runtime-policy and exact owner authority", () => {
  it("binds the full transaction, release policy, automated instantiation, and no-LP scope", async () => {
    const exactDescriptor = descriptor();
    const instantiation = runtimeReview();
    const { authority, localCapability, releaseTrust } = harness();
    const challenge = buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
      exactDescriptor,
      instantiation,
      releaseTrust,
      RELEASE_TREE,
      CEREMONY_NONCE,
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
    expect(challenge.ownerAuthorizationText).toContain(
      `releaseReviewPolicyDigest=${POLICY_DIGEST}`
    );
    expect(challenge.ownerAuthorizationText).toContain(
      `runtimeReviewInstantiationDigest=${INSTANTIATION_DIGEST}`
    );
    expect(challenge.ownerAuthorizationText).toContain(
      `predecessorFenceSha256=${PREDECESSOR_FENCE_SHA256}`
    );
    expect(challenge.ownerAuthorizationText).toContain(
      `predecessorClaimRawSha256=${BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256}`
    );
    expect(challenge.ownerAuthorizationText).toContain(
      "predecessorWorkerAuthorizationOutcome=not_attempted"
    );
    expect(challenge.ownerAuthorizationText).toContain(
      "predecessorSubmissionJournalState=exact_empty"
    );
    expect(challenge.ownerAuthorizationText).toContain(`attemptId=${challenge.recovery.attemptId}`);
    expect(challenge.ownerAuthorizationText).toContain(`reviewedSubjectSha256=${REVIEWED_SUBJECT}`);
    expect(challenge.ownerAuthorizationText).toContain("automatedPolicyApplication=true");
    expect(challenge.ownerAuthorizationText).toContain("reviewerInspectedExactEnvelope=false");
    expect(challenge.ownerAuthorizationText).toContain(`challengeIssuedAt=${AUTHORIZED_AT}`);
    expect(challenge.ownerAuthorizationText).toContain(
      "confirmationNotAfter=2026-08-13T04:33:55.000Z"
    );
    expect(challenge.ownerAuthorizationText).toContain("executionAuthorizationLifetimeSeconds=45");
    expect(challenge.ownerAuthorizationText).toContain(
      "executionAuthorizationRule=confirmedAt_is_captured_after_exact_match_and_executionExpiresAt_equals_confirmedAt_plus_lifetime"
    );
    expect(challenge.ownerAuthorizationText).toContain("liquidityActionAuthorized=false");
    expect(challenge.ownerAuthorizationText).toContain(
      "ack.custodyUnlockVerifiedBeforeDurableClaim=false"
    );
    expect(challenge.ownerAuthorizationText).toContain(
      "ack.custodyKeyAddressVerifiedBeforeDurableClaim=false"
    );
    expect(challenge.ownerAuthorizationText).toContain(
      "ack.expectedSignerVerifiedOnlyByPostClaimSignedAttestation=true"
    );
    expect(challenge.ownerAuthorizationTextSha256).toBe(
      `0x${createHash("sha256").update(challenge.ownerAuthorizationText).digest("hex")}`
    );
    expect(challenge.ownerConfirmationText).toContain(
      "decision=CONFIRM_FRESH_GENERATION_3_AUTHORIZATION_AFTER_APPEND_ONLY_PREDECESSOR_FENCE_ONE_SIGNATURE_AND_ONE_SUBMISSION_NO_RETRY_NO_REPLACEMENT"
    );
    expect(challenge.ownerConfirmationText).not.toContain("GENERATION_2_AUTHORIZATION");
    expect(
      authority.authorize(exactDescriptor, commandFor(instantiation, releaseTrust), localCapability)
    ).toMatchObject({ status: "blocked", issue: { code: "OWNER_CEREMONY_REQUIRED" } });
    const command = await confirmedCommand(instantiation, releaseTrust, exactDescriptor);
    const result = authority.authorize(exactDescriptor, command, localCapability);
    if (result.status !== "authorized") throw new Error(result.issue.message);
    expect(result.reviewDecisionDigest).toBe(INSTANTIATION_DIGEST);
    expect(result.intent.reviewerApprovalDigest).toBe(INSTANTIATION_DIGEST);
    expect(result.intent.authenticatedAt).toBe(CONFIRMED_AT);
    expect(result.intent.expiresAt).toBe(EXECUTION_EXPIRES_AT);
    expect(result.intent.recovery).toEqual(challenge.recovery);
    expect(result.boundary).toMatchObject({
      authorityModel: "windows_current_user_fixed_custody_path_acl_object_capability",
      custodyKeyAddressVerifiedBeforeDurableClaim: false,
      custodyUnlockVerifiedBeforeDurableClaim: false
    });
    expect(authority.authenticateAuthorizedIntent(result.intent)).toBe(true);
    expect(authority.authenticateExecutionCapability(result.executionCapability)).toBe(true);
    expect(reviewBrands.states.get(instantiation)?.fresh).toBe(false);
  });

  it("rejects structural review copies, binding drift, accessors, and proxy inputs without traps", async () => {
    const setup = harness();
    const branded = runtimeReview();
    const unbranded = deeplyFreeze({ ...branded });
    await expect(
      conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse(
        descriptor(),
        unbranded,
        setup.releaseTrust,
        RELEASE_TREE,
        Object.freeze({
          now: () => new Date(AUTHORIZED_AT),
          writeChallenge: async () => undefined,
          readExactConfirmation: async () => new Uint8Array()
        })
      )
    ).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "RUNTIME_REVIEW_INSTANTIATION_INVALID" }
    });

    const drift = runtimeReview({ envelopeHash: `0x${"12".repeat(32)}` as Hex });
    expect(
      buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
        descriptor(),
        drift,
        setup.releaseTrust,
        RELEASE_TREE,
        CEREMONY_NONCE,
        AUTHORIZED_AT
      )
    ).toBeNull();

    let traps = 0;
    const proxy = new Proxy(branded, {
      get: () => {
        traps += 1;
        throw new Error("trap");
      },
      getPrototypeOf: () => {
        traps += 1;
        throw new Error("trap");
      }
    });
    expect(
      buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
        descriptor(),
        proxy,
        setup.releaseTrust,
        RELEASE_TREE,
        CEREMONY_NONCE,
        AUTHORIZED_AT
      )
    ).toBeNull();
    expect(traps).toBe(0);
  });

  it("rejects v4 owner replay and every fixed predecessor recovery mutation", async () => {
    const setup = harness();
    const exactDescriptor = descriptor();
    const branded = runtimeReview();
    const command = await confirmedCommand(branded, setup.releaseTrust, exactDescriptor);
    const oldV4 = deeplyFreeze({
      schemaVersion: 4,
      kind: "execute_exact_bsc_testnet_pta_wbnb_pool_once_v4",
      executionFlag: command.executionFlag,
      runtimeReviewInstantiation: command.runtimeReviewInstantiation,
      challengeIssuedAt: command.challengeIssuedAt,
      confirmedAt: CONFIRMED_AT,
      executionExpiresAt: EXECUTION_EXPIRES_AT,
      ceremonyNonce: command.ceremonyNonce,
      ownerAuthorizationText: command.ownerAuthorizationText,
      ownerAuthorizationTextSha256: command.ownerAuthorizationTextSha256
    });
    expect(setup.authority.authorize(exactDescriptor, oldV4, setup.localCapability)).toMatchObject({
      status: "blocked",
      issue: { code: "OWNER_CEREMONY_REQUIRED" }
    });

    const baseRecovery = runtimeRecoveryForEnvelopeObservedAt();
    const fence = baseRecovery.predecessorFence;
    const {
      submissionJournalState: _omittedSubmissionJournalState,
      ...fenceWithoutSubmissionJournalState
    } = fence;
    void _omittedSubmissionJournalState;
    const mutations: unknown[] = [
      Object.freeze({ ...baseRecovery, generation: 1 }),
      Object.freeze({
        ...baseRecovery,
        predecessorFence: deeplyFreeze({ ...fence, status: "claimed" })
      }),
      Object.freeze({
        ...baseRecovery,
        predecessorFence: deeplyFreeze({ ...fence, workerStartOutcome: "attempted" })
      }),
      Object.freeze({
        ...baseRecovery,
        predecessorFence: deeplyFreeze({ ...fence, submissionJournalState: "not_empty" })
      }),
      Object.freeze({
        ...baseRecovery,
        predecessorFence: deeplyFreeze(fenceWithoutSubmissionJournalState)
      }),
      Object.freeze({
        ...baseRecovery,
        predecessorFence: deeplyFreeze({
          ...fence,
          predecessorClaimRawSha256: `0x${"01".repeat(32)}`
        })
      }),
      Object.freeze({
        ...baseRecovery,
        predecessorFence: deeplyFreeze({
          ...fence,
          fenceRecordedAt: fence.noEffectObservedAt
        })
      })
    ];
    for (const recovery of mutations) {
      const altered = runtimeReview({
        recovery: recovery as BscTestnetPtaWbnbPoolRuntimeReviewInstantiation["recovery"]
      });
      expect(
        buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
          exactDescriptor,
          altered,
          setup.releaseTrust,
          RELEASE_TREE,
          CEREMONY_NONCE,
          AUTHORIZED_AT
        )
      ).toBeNull();
    }
  });

  it("terminally separates signing consumption from exactly one broadcast consumption", async () => {
    const setup = await authorizedHarness();
    const capability = setup.authorization.executionCapability;
    const exactSigningRequest = signingRequest(setup.authorization);
    const exactBroadcastRequest = broadcastRequest(setup.authorization);

    expect(
      setup.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
        capability,
        exactBroadcastRequest
      )
    ).toBe(false);
    // A premature broadcast attempt terminally poisons the whole one-shot capability.
    expect(setup.authority.reserveExecutionCapabilityForWorker(capability)).toBe(false);
    expect(
      setup.authority.consumeExecutionCapabilityAfterDurableStart(capability, exactSigningRequest)
    ).toBe(false);
    expect(
      setup.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
        capability,
        exactBroadcastRequest
      )
    ).toBe(false);

    const happy = await authorizedHarness();
    const happyCapability = happy.authorization.executionCapability;
    expect(happy.authority.reserveExecutionCapabilityForWorker(happyCapability)).toBe(true);
    expect(
      happy.authority.consumeExecutionCapabilityAfterDurableStart(
        happyCapability,
        signingRequest(happy.authorization)
      )
    ).toBe(true);
    expect(
      happy.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
        happyCapability,
        broadcastRequest(happy.authorization)
      )
    ).toBe(true);
    expect(
      happy.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
        happyCapability,
        broadcastRequest(happy.authorization)
      )
    ).toBe(false);

    const mismatch = await authorizedHarness();
    const mismatchCapability = mismatch.authorization.executionCapability;
    expect(mismatch.authority.reserveExecutionCapabilityForWorker(mismatchCapability)).toBe(true);
    expect(
      mismatch.authority.consumeExecutionCapabilityAfterDurableStart(
        mismatchCapability,
        signingRequest(mismatch.authorization)
      )
    ).toBe(true);
    expect(
      mismatch.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
        mismatchCapability,
        deeplyFreeze({ ...broadcastRequest(mismatch.authorization), claimId: "wrong-claim" })
      )
    ).toBe(false);
    expect(
      mismatch.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
        mismatchCapability,
        broadcastRequest(mismatch.authorization)
      )
    ).toBe(false);

    const v1Replay = await authorizedHarness();
    const v1ReplayCapability = v1Replay.authorization.executionCapability;
    expect(v1Replay.authority.reserveExecutionCapabilityForWorker(v1ReplayCapability)).toBe(true);
    expect(
      v1Replay.authority.consumeExecutionCapabilityAfterDurableStart(
        v1ReplayCapability,
        signingRequest(v1Replay.authorization)
      )
    ).toBe(true);
    expect(
      v1Replay.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
        v1ReplayCapability,
        deeplyFreeze({ ...broadcastRequest(v1Replay.authorization), schemaVersion: 1 })
      )
    ).toBe(false);

    const recoveryReplay = await authorizedHarness();
    const recoveryReplayCapability = recoveryReplay.authorization.executionCapability;
    expect(
      recoveryReplay.authority.reserveExecutionCapabilityForWorker(recoveryReplayCapability)
    ).toBe(true);
    expect(
      recoveryReplay.authority.consumeExecutionCapabilityAfterDurableStart(
        recoveryReplayCapability,
        signingRequest(recoveryReplay.authorization)
      )
    ).toBe(true);
    expect(
      recoveryReplay.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
        recoveryReplayCapability,
        deeplyFreeze({
          ...broadcastRequest(recoveryReplay.authorization),
          recovery: {
            ...recoveryReplay.authorization.intent.recovery,
            attemptId: `0x${"fe".repeat(32)}`
          }
        })
      )
    ).toBe(false);
  });

  it.each([29_999, 30_000])(
    "accepts terminal pre-submission evidence at the inclusive freshness boundary (%i ms)",
    async (offsetMilliseconds) => {
      let authorityNow = Date.parse(NOW);
      const setup = await authorizedHarness(() => new Date(authorityNow));
      const capability = setup.authorization.executionCapability;
      expect(setup.authority.reserveExecutionCapabilityForWorker(capability)).toBe(true);
      expect(
        setup.authority.consumeExecutionCapabilityAfterDurableStart(
          capability,
          signingRequest(setup.authorization)
        )
      ).toBe(true);

      authorityNow = Date.parse(NOW) + offsetMilliseconds;
      expect(
        setup.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
          capability,
          broadcastRequest(setup.authorization)
        )
      ).toBe(true);
    }
  );

  it.each([30_001, 31_000])(
    "rejects terminal pre-submission evidence older than the freshness limit (%i ms)",
    async (offsetMilliseconds) => {
      let authorityNow = Date.parse(NOW);
      const setup = await authorizedHarness(() => new Date(authorityNow));
      const capability = setup.authorization.executionCapability;
      expect(setup.authority.reserveExecutionCapabilityForWorker(capability)).toBe(true);
      expect(
        setup.authority.consumeExecutionCapabilityAfterDurableStart(
          capability,
          signingRequest(setup.authorization)
        )
      ).toBe(true);

      authorityNow = Date.parse(NOW) + offsetMilliseconds;
      expect(
        setup.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
          capability,
          broadcastRequest(setup.authorization)
        )
      ).toBe(false);
    }
  );

  it("rejects 44-second-old evidence while the exact 45-second owner authority is still live", async () => {
    let authorityNow = Date.parse(NOW);
    const setup = await authorizedHarness(() => new Date(authorityNow));
    const capability = setup.authorization.executionCapability;
    expect(setup.authority.reserveExecutionCapabilityForWorker(capability)).toBe(true);
    expect(
      setup.authority.consumeExecutionCapabilityAfterDurableStart(
        capability,
        signingRequest(setup.authorization)
      )
    ).toBe(true);

    authorityNow = Date.parse(CONFIRMED_AT) + 44_000;
    expect(authorityNow).toBeLessThan(Date.parse(setup.authorization.intent.expiresAt));
    expect(
      setup.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
        capability,
        deeplyFreeze({
          ...broadcastRequest(setup.authorization),
          terminalPreSubmissionObservedAt: CONFIRMED_AT
        })
      )
    ).toBe(false);
  });

  it("rejects a terminal observation later than the final authority clock", async () => {
    const authorityNow = Date.parse(NOW);
    const setup = await authorizedHarness(() => new Date(authorityNow));
    const capability = setup.authorization.executionCapability;
    expect(setup.authority.reserveExecutionCapabilityForWorker(capability)).toBe(true);
    expect(
      setup.authority.consumeExecutionCapabilityAfterDurableStart(
        capability,
        signingRequest(setup.authorization)
      )
    ).toBe(true);

    expect(
      setup.authority.consumeExactBroadcastAuthorizationAfterDurableStart(
        capability,
        deeplyFreeze({
          ...broadcastRequest(setup.authorization),
          terminalPreSubmissionObservedAt: new Date(authorityNow + 1).toISOString()
        })
      )
    ).toBe(false);
  });

  it("accepts only canonical fresh post-claim authentication at or after owner confirmation", async () => {
    const refreshed = await authorizedHarness();
    const refreshedCapability = refreshed.authorization.executionCapability;
    expect(refreshed.authority.reserveExecutionCapabilityForWorker(refreshedCapability)).toBe(true);
    expect(
      refreshed.authority.consumeExecutionCapabilityAfterDurableStart(
        refreshedCapability,
        signingRequest(refreshed.authorization, "claim-refreshed-authentication", NOW)
      )
    ).toBe(true);

    const beforeConfirmation = await authorizedHarness();
    const beforeCapability = beforeConfirmation.authorization.executionCapability;
    const preConfirmationTimestamp = new Date(
      Date.parse(beforeConfirmation.authorization.intent.authenticatedAt) - 1
    ).toISOString();
    expect(beforeConfirmation.authority.reserveExecutionCapabilityForWorker(beforeCapability)).toBe(
      true
    );
    expect(
      beforeConfirmation.authority.consumeExecutionCapabilityAfterDurableStart(
        beforeCapability,
        signingRequest(
          beforeConfirmation.authorization,
          "claim-pre-confirmation-authentication",
          preConfirmationTimestamp
        )
      )
    ).toBe(false);

    const malformed = await authorizedHarness();
    const malformedCapability = malformed.authorization.executionCapability;
    expect(malformed.authority.reserveExecutionCapabilityForWorker(malformedCapability)).toBe(true);
    expect(
      malformed.authority.consumeExecutionCapabilityAfterDurableStart(
        malformedCapability,
        signingRequest(
          malformed.authorization,
          "claim-malformed-authentication",
          "not-a-utc-timestamp"
        )
      )
    ).toBe(false);
  });

  it("rejects a structurally exact copied command while preserving the original private brand", async () => {
    const exactDescriptor = descriptor();
    const setup = harness();
    const instantiation = runtimeReview();
    const command = await confirmedCommand(instantiation, setup.releaseTrust, exactDescriptor);
    const copiedCommand = deeplyFreeze({ ...command });
    expect(
      setup.authority.authorize(exactDescriptor, copiedCommand, setup.localCapability)
    ).toMatchObject({ status: "blocked", issue: { code: "OWNER_CEREMONY_REQUIRED" } });
    expect(
      setup.authority.authorize(exactDescriptor, command, setup.localCapability)
    ).toMatchObject({ status: "authorized" });
  });

  it("accepts the execution authority immediately before expiry and rejects its exact boundary", async () => {
    const authorizeAtExecutionOffset = async (offsetMilliseconds: number) => {
      let authorityClock = Date.parse(NOW);
      const setup = harness(() => new Date(authorityClock));
      const exactDescriptor = descriptor();
      const instantiation = runtimeReview();
      const command = await confirmedCommand(instantiation, setup.releaseTrust, exactDescriptor);
      authorityClock = Date.parse(EXECUTION_EXPIRES_AT) + offsetMilliseconds;
      return setup.authority.authorize(exactDescriptor, command, setup.localCapability);
    };

    await expect(authorizeAtExecutionOffset(-1)).resolves.toMatchObject({ status: "authorized" });
    await expect(authorizeAtExecutionOffset(0)).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "AUTHORIZATION_REQUIRED" }
    });
  });

  it("performs one same-process exact challenge/confirmation round with a fresh nonce", async () => {
    const { releaseTrust } = harness();
    const instantiation = runtimeReview();
    const displayed: Buffer[] = [];
    let clock = Date.parse(AUTHORIZED_AT);
    const result = await conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse(
      descriptor(),
      instantiation,
      releaseTrust,
      RELEASE_TREE,
      Object.freeze({
        now: () => new Date(clock++),
        writeChallenge: async (bytes: Uint8Array) => {
          displayed.push(Buffer.from(bytes));
        },
        readExactConfirmation: async () => {
          const text = displayed[0]?.toString("utf8") ?? "";
          const marker =
            "Paste exactly the following UTF-8 confirmation bytes, with no leading/trailing whitespace:\n";
          return Buffer.from(text.slice(text.indexOf(marker) + marker.length).trimEnd(), "utf8");
        }
      })
    );
    expect(result).toMatchObject({ status: "confirmed", issue: null });
    if (result.status !== "confirmed") throw new Error(result.issue.message);
    expect(result.command.ceremonyNonce).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(result.command.ceremonyNonce).not.toBe(`0x${"00".repeat(32)}`);
    expect(result.command.runtimeReviewInstantiation).toBe(instantiation);
    expect(result.command.schemaVersion).toBe(6);
    expect(result.command.kind).toBe(
      "execute_exact_bsc_testnet_pta_wbnb_pool_recovery_generation_3_once_v6"
    );
    expect(result.command.challengeIssuedAt).toBe(AUTHORIZED_AT);
    expect(result.command).not.toHaveProperty("confirmedAt");
    expect(result.command).not.toHaveProperty("executionExpiresAt");
    expect(result.command.recovery).toMatchObject({
      generation: 3,
      predecessorFenceSha256: PREDECESSOR_FENCE_SHA256
    });
    expect(result.command.ownerAuthorizationText).toContain(
      `ceremonyNonce=${result.command.ceremonyNonce}`
    );
    expect(displayed).toHaveLength(1);
    displayed[0]?.fill(0);
  });

  it("reserves the exact execution lifetime, enforces both confirmation deadlines, and rejects clock rollback", async () => {
    const issueAt = Date.parse(AUTHORIZED_AT);
    const exactConfirmation = (display: string): Buffer => {
      const marker =
        "Paste exactly the following UTF-8 confirmation bytes, with no leading/trailing whitespace:\n";
      return Buffer.from(display.slice(display.indexOf(marker) + marker.length).trimEnd(), "utf8");
    };
    const run = async (envelopeExpiresAt: string, timestamps: number[]) => {
      const exactDescriptor = descriptor(envelopeExpiresAt);
      const setup = harness();
      const executionEnvelopeObservedAt = exactDescriptor.envelopeObservedAt;
      const instantiation = runtimeReview({
        expiresAt: envelopeExpiresAt,
        executionEnvelopeObservedAt,
        recovery: runtimeRecoveryForEnvelopeObservedAt(executionEnvelopeObservedAt)
      });
      let displayed = "";
      let observedNotAfter: number | null = null;
      const result = await conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse(
        exactDescriptor,
        instantiation,
        setup.releaseTrust,
        RELEASE_TREE,
        Object.freeze({
          now: () => new Date(timestamps.shift() ?? Date.parse(envelopeExpiresAt)),
          writeChallenge: async (bytes: Uint8Array) => {
            displayed = Buffer.from(bytes).toString("utf8");
          },
          readExactConfirmation: async (limits: Readonly<{ notAfterMilliseconds: number }>) => {
            observedNotAfter = limits.notAfterMilliseconds;
            return exactConfirmation(displayed);
          }
        })
      );
      return { result, observedNotAfter };
    };

    const ownerWindow = await run(EXPIRES_AT, [issueAt, issueAt + 1, issueAt + 240_000 - 1]);
    expect(ownerWindow.observedNotAfter).toBe(issueAt + 240_000);
    expect(ownerWindow.result).toMatchObject({ status: "confirmed" });

    const exactOwnerBoundary = await run(EXPIRES_AT, [issueAt, issueAt + 1, issueAt + 240_000]);
    expect(exactOwnerBoundary.result).toMatchObject({
      status: "blocked",
      issue: { code: "CEREMONY_EXPIRED" }
    });

    const reserveExpiry = new Date(issueAt + 180_000).toISOString();
    const envelopeReserve = await run(reserveExpiry, [issueAt, issueAt + 1, issueAt + 135_000 - 1]);
    expect(envelopeReserve.observedNotAfter).toBe(issueAt + 135_000);
    expect(envelopeReserve.result).toMatchObject({ status: "confirmed" });

    const rollback = await run(EXPIRES_AT, [issueAt, issueAt + 2, issueAt + 1]);
    expect(rollback.result).toMatchObject({
      status: "blocked",
      issue: { code: "CEREMONY_CLOCK_INVALID" }
    });
  });

  it("rejects confirmation mutation, replay nonce drift, and expiry", async () => {
    const run = (
      readExactConfirmation: (display: () => string) => Promise<Uint8Array>,
      timestamps = [
        Date.parse(AUTHORIZED_AT),
        Date.parse(AUTHORIZED_AT) + 1,
        Date.parse(AUTHORIZED_AT) + 2
      ]
    ) => {
      const { releaseTrust } = harness();
      let displayed = "";
      return conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse(
        descriptor(),
        runtimeReview(),
        releaseTrust,
        RELEASE_TREE,
        Object.freeze({
          now: () => new Date(timestamps.shift() ?? Date.parse(EXPIRES_AT)),
          writeChallenge: async (bytes: Uint8Array) => {
            displayed = Buffer.from(bytes).toString("utf8");
          },
          readExactConfirmation: () => readExactConfirmation(() => displayed)
        })
      );
    };
    await expect(run(async () => Buffer.from("mutated", "utf8"))).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "OWNER_CONFIRMATION_MISMATCH" }
    });
    let firstConfirmation = "";
    const first = await run(async (display) => {
      const marker =
        "Paste exactly the following UTF-8 confirmation bytes, with no leading/trailing whitespace:\n";
      firstConfirmation = display()
        .slice(display().indexOf(marker) + marker.length)
        .trimEnd();
      return Buffer.from(firstConfirmation, "utf8");
    });
    expect(first).toMatchObject({ status: "confirmed" });
    await expect(run(async () => Buffer.from(firstConfirmation, "utf8"))).resolves.toMatchObject({
      status: "blocked",
      issue: { code: "OWNER_CONFIRMATION_MISMATCH" }
    });
    await expect(
      run(async (display) => {
        const match = /ownerAuthorizationTextSha256=(0x[0-9a-f]{64})/u.exec(display());
        return Buffer.from(
          `${BSC_TESTNET_PTA_WBNB_POOL_OWNER_CONFIRMATION_DOMAIN}|${match?.[1] ?? ""}`,
          "utf8"
        );
      })
    ).resolves.toMatchObject({ status: "blocked" });
    await expect(
      run(
        async (display) => {
          const marker =
            "Paste exactly the following UTF-8 confirmation bytes, with no leading/trailing whitespace:\n";
          return Buffer.from(
            display()
              .slice(display().indexOf(marker) + marker.length)
              .trimEnd()
          );
        },
        [Date.parse(AUTHORIZED_AT), Date.parse(EXPIRES_AT), Date.parse(EXPIRES_AT)]
      )
    ).resolves.toMatchObject({ status: "blocked", issue: { code: "CEREMONY_EXPIRED" } });
  });
});
