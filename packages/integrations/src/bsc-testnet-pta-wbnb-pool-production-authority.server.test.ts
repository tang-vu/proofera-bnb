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
const RELEASE = "a".repeat(40);
const RELEASE_TREE = "b".repeat(40);
const CEREMONY_NONCE = `0x${"88".repeat(32)}` as const;
const POLICY_REVIEWED_AT = "2026-08-13T04:20:00.000Z";
const INSTANTIATED_AT = "2026-08-13T04:29:50.000Z";
const AUTHORIZED_AT = "2026-08-13T04:29:55.000Z";
const NOW = "2026-08-13T04:30:00.000Z";
const EXPIRES_AT = "2026-08-13T04:30:30.000Z";
const POLICY_EXPIRES_AT = "2026-08-13T05:00:00.000Z";

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

function reviewBinding(
  value: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    releaseCommit: value.releaseCommit,
    releaseTree: value.releaseTree,
    runtimeManifestSha256: value.runtimeManifestSha256,
    policyDigest: value.policyDigest,
    reviewedSubjectSha256: value.reviewedSubjectSha256,
    envelopeHash: value.envelopeHash,
    expiresAt: value.expiresAt,
    instantiationDigest: value.instantiationDigest
  });
}

function runtimeReview(
  overrides: Partial<BscTestnetPtaWbnbPoolRuntimeReviewInstantiation> = {},
  branded = true
): BscTestnetPtaWbnbPoolRuntimeReviewInstantiation {
  const value = deeplyFreeze({
    schemaVersion: 1,
    kind: "automated_release_policy_envelope_instantiation_v1",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    policyDigest: POLICY_DIGEST,
    releaseCommit: RELEASE,
    releaseTree: RELEASE_TREE,
    runtimeManifestSha256: RUNTIME_MANIFEST,
    reviewedSubjectSha256: REVIEWED_SUBJECT,
    reviewerTaskLabels: ["authority-security-review", "journal-recovery-review"],
    policyReviewedAt: POLICY_REVIEWED_AT,
    policyExpiresAt: POLICY_EXPIRES_AT,
    envelopeHash: ENVELOPE_HASH,
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
    schemaVersion: 1,
    kind: "execute_exact_bsc_testnet_pta_wbnb_pool_once_v1",
    executionFlag: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG,
    runtimeReviewInstantiation: instantiation,
    authorizedAt: AUTHORIZED_AT,
    ceremonyNonce: CEREMONY_NONCE,
    ownerAuthorizationText: challenge.ownerAuthorizationText,
    ownerAuthorizationTextSha256: challenge.ownerAuthorizationTextSha256
  });
}

async function confirmedCommand(
  instantiation: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation,
  releaseTrust: BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust
) {
  let displayed = "";
  let clock = Date.parse(AUTHORIZED_AT);
  const result = await conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse(
    descriptor(),
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
  const instantiation = runtimeReview();
  const command = await confirmedCommand(instantiation, setup.releaseTrust);
  const authorization = setup.authority.authorize(descriptor(), command, setup.localCapability);
  if (authorization.status !== "authorized") throw new Error(authorization.issue.message);
  return { ...setup, authorization };
}

function signingRequest(
  authorization: Extract<BscTestnetPtaWbnbPoolProductionAuthorityResult, { status: "authorized" }>,
  claimId = "claim-authority-capability-1"
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
    authenticatedAt: authorization.intent.authenticatedAt,
    expiresAt: authorization.intent.expiresAt,
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
    schemaVersion: 1,
    operation:
      "consume_exact_bsc_testnet_pta_wbnb_pool_broadcast_authorization_after_durable_start",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId,
    envelopeHash: authorization.intent.envelopeHash,
    releaseCommit: authorization.intent.releaseCommit,
    runtimeManifestSha256: authorization.intent.runtimeManifestSha256,
    reviewerApprovalDigest: authorization.intent.reviewerApprovalDigest,
    ownerAuthorizationDigest: authorization.intent.ownerAuthorizationDigest,
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
    expect(challenge.ownerAuthorizationText).toContain(`reviewedSubjectSha256=${REVIEWED_SUBJECT}`);
    expect(challenge.ownerAuthorizationText).toContain("automatedPolicyApplication=true");
    expect(challenge.ownerAuthorizationText).toContain("reviewerInspectedExactEnvelope=false");
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
    expect(
      authority.authorize(exactDescriptor, commandFor(instantiation, releaseTrust), localCapability)
    ).toMatchObject({ status: "blocked", issue: { code: "OWNER_CEREMONY_REQUIRED" } });
    const command = await confirmedCommand(instantiation, releaseTrust);
    const result = authority.authorize(exactDescriptor, command, localCapability);
    if (result.status !== "authorized") throw new Error(result.issue.message);
    expect(result.reviewDecisionDigest).toBe(INSTANTIATION_DIGEST);
    expect(result.intent.reviewerApprovalDigest).toBe(INSTANTIATION_DIGEST);
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
    expect(result.command.ownerAuthorizationText).toContain(
      `ceremonyNonce=${result.command.ceremonyNonce}`
    );
    expect(displayed).toHaveLength(1);
    displayed[0]?.fill(0);
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
