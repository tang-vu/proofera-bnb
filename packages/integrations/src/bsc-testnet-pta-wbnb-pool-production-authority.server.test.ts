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
import {
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  buildBscTestnetPtaWbnbPoolSigningWorkerRequest
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG,
  BSC_TESTNET_PTA_WBNB_POOL_OWNER_CONFIRMATION_DOMAIN,
  BSC_TESTNET_PTA_WBNB_POOL_OWNER_DESIGNATED_REVIEW_DOMAIN,
  buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse,
  conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse,
  createBscTestnetPtaWbnbPoolAuthorityIssuerForTests,
  deriveBscTestnetPtaWbnbPoolOwnerDesignatedReviewDigestForInternalUse,
  type BscTestnetPtaWbnbPoolOwnerDesignatedReviewDecision
} from "./bsc-testnet-pta-wbnb-pool-production-authority.server";
import type { BscTestnetPtaWbnbPoolSigningWorkerReleaseTrust } from "./bsc-testnet-pta-wbnb-pool-signing-worker";

const ENVELOPE_HASH = `0x${"11".repeat(32)}` as Hex;
const RUNTIME_MANIFEST = `0x${"22".repeat(32)}` as Hex;
const WORKER_SOURCE = `0x${"33".repeat(32)}` as Hex;
const RELEASE = "a".repeat(40);
const RELEASE_TREE = "b".repeat(40);
const CEREMONY_NONCE = `0x${"88".repeat(32)}` as const;
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
    schemaVersion: 2,
    kind: "owner_designated_multi_agent_review_v2",
    decision: "GO_EXACT_CHAIN_97_ONE_SHOT_ONLY",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: ENVELOPE_HASH,
    releaseCommit: RELEASE,
    reviewedReleaseTree: RELEASE_TREE,
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
      authenticateLocalCustodyOwnerCapability: (value: unknown) =>
        typeof value === "object" && value !== null && localBrands.has(value)
    })
  );
  return { authority, localCapability, releaseTrust };
}

function authorizedHarness(now: () => Date = () => new Date(NOW)) {
  const exactDescriptor = descriptor();
  const exactReview = review();
  const setup = harness(now);
  const challenge = buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
    exactDescriptor,
    exactReview,
    setup.releaseTrust,
    RELEASE_TREE,
    CEREMONY_NONCE,
    AUTHORIZED_AT
  );
  if (challenge === null) throw new Error("Challenge fixture failed.");
  const command = deeplyFreeze({
    schemaVersion: 1,
    kind: "execute_exact_bsc_testnet_pta_wbnb_pool_once_v1",
    executionFlag: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_EXECUTION_FLAG,
    reviewDecision: exactReview,
    authorizedAt: AUTHORIZED_AT,
    ceremonyNonce: CEREMONY_NONCE,
    ownerAuthorizationText: challenge.ownerAuthorizationText,
    ownerAuthorizationTextSha256: challenge.ownerAuthorizationTextSha256
  });
  const authorization = setup.authority.authorize(exactDescriptor, command, setup.localCapability);
  if (authorization.status !== "authorized") throw new Error(authorization.issue.message);
  return { ...setup, authorization };
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
      ceremonyNonce: CEREMONY_NONCE,
      ownerAuthorizationText: challenge.ownerAuthorizationText,
      ownerAuthorizationTextSha256: challenge.ownerAuthorizationTextSha256
    });
    const result = authority.authorize(exactDescriptor, command, localCapability);
    if (result.status !== "authorized") {
      throw new Error(`${result.issue.code}: ${result.issue.message}`);
    }
    expect(result).toMatchObject({ status: "authorized" });
    expect(authority.authenticateAuthorizedIntent(result.intent)).toBe(true);
    expect(authority.authenticateExecutionCapability(result.executionCapability)).toBe(true);
    expect(authority.reserveExecutionCapabilityForWorker(result.executionCapability)).toBe(true);
    expect(authority.reserveExecutionCapabilityForWorker(result.executionCapability)).toBe(false);
    const exactRequest = buildBscTestnetPtaWbnbPoolSigningWorkerRequest({
      operationKey: result.intent.operationKey,
      envelopeHash: result.intent.envelopeHash,
      reviewerApprovalDigest: result.intent.reviewerApprovalDigest,
      ownerAuthorizationDigest: result.intent.ownerAuthorizationDigest,
      claimId: "claim-authority-capability-1",
      journalClaimToken: `0x${"99".repeat(32)}`,
      releaseCommit: result.intent.releaseCommit,
      runtimeManifestSha256: result.intent.runtimeManifestSha256,
      authenticatedAt: result.intent.authenticatedAt,
      expiresAt: result.intent.expiresAt,
      transaction: result.intent.transaction
    });
    expect(
      authority.consumeExecutionCapabilityAfterDurableStart(
        result.executionCapability,
        exactRequest
      )
    ).toBe(true);
    expect(authority.authenticateExecutionCapability(result.executionCapability)).toBe(false);
    expect(
      authority.consumeExecutionCapabilityAfterDurableStart(
        result.executionCapability,
        exactRequest
      )
    ).toBe(false);
    expect(authority.reserveExecutionCapabilityForWorker(new Proxy({}, {}))).toBe(false);

    const authorizeFresh = (value: unknown) => {
      const fresh = harness();
      return fresh.authority.authorize(exactDescriptor, value, fresh.localCapability);
    };

    expect(authorizeFresh({ ...command })).toMatchObject({
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
    expect(authorizeFresh(proxiedCommand)).toMatchObject({
      status: "blocked",
      issue: { code: "AUTHORIZATION_REQUIRED" }
    });
    expect(commandProxyTraps).toBe(0);

    expect(
      authorizeFresh(
        deeplyFreeze({
          schemaVersion: 1,
          kind: "exact_owner_envelope_authorization_v1",
          decision: "authorize_one_chain_97_pool_initialization_signature"
        })
      )
    ).toMatchObject({ status: "blocked", issue: { code: "AUTHORIZATION_REQUIRED" } });

    const changedText = `${challenge.ownerAuthorizationText}\nliquidityActionAuthorized=true`;
    expect(
      authorizeFresh(
        deeplyFreeze({
          ...command,
          ownerAuthorizationText: changedText,
          ownerAuthorizationTextSha256: `0x${createHash("sha256").update(changedText).digest("hex")}`
        })
      )
    ).toMatchObject({ status: "blocked", issue: { code: "OWNER_AUTHORIZATION_MISMATCH" } });
    expect(
      authorizeFresh(
        deeplyFreeze({ ...command, ownerAuthorizationTextSha256: `0x${"44".repeat(32)}` })
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
        RELEASE_TREE,
        CEREMONY_NONCE,
        AUTHORIZED_AT
      )
    ).toBeNull();
    expect(traps).toBe(0);
    expect(
      buildBscTestnetPtaWbnbPoolOwnerAuthorizationChallengeForInternalUse(
        descriptor(),
        { ...exactReview },
        releaseTrust,
        RELEASE_TREE,
        CEREMONY_NONCE,
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

  it("terminally consumes reserved authority on request proxy, mutation, or expiry", () => {
    const requestFor = (intent: ReturnType<typeof authorizedHarness>["authorization"]["intent"]) =>
      buildBscTestnetPtaWbnbPoolSigningWorkerRequest({
        operationKey: intent.operationKey,
        envelopeHash: intent.envelopeHash,
        reviewerApprovalDigest: intent.reviewerApprovalDigest,
        ownerAuthorizationDigest: intent.ownerAuthorizationDigest,
        claimId: "claim-authority-adversarial-1",
        journalClaimToken: `0x${"99".repeat(32)}`,
        releaseCommit: intent.releaseCommit,
        runtimeManifestSha256: intent.runtimeManifestSha256,
        authenticatedAt: intent.authenticatedAt,
        expiresAt: intent.expiresAt,
        transaction: intent.transaction
      });

    let proxyTraps = 0;
    const proxyCase = authorizedHarness();
    expect(
      proxyCase.authority.reserveExecutionCapabilityForWorker(
        proxyCase.authorization.executionCapability
      )
    ).toBe(true);
    const proxiedRequest = new Proxy(requestFor(proxyCase.authorization.intent), {
      get: () => {
        proxyTraps += 1;
        throw new Error("trap");
      },
      getPrototypeOf: () => {
        proxyTraps += 1;
        throw new Error("trap");
      }
    });
    expect(
      proxyCase.authority.consumeExecutionCapabilityAfterDurableStart(
        proxyCase.authorization.executionCapability,
        proxiedRequest
      )
    ).toBe(false);
    expect(proxyTraps).toBe(0);
    expect(
      proxyCase.authority.consumeExecutionCapabilityAfterDurableStart(
        proxyCase.authorization.executionCapability,
        requestFor(proxyCase.authorization.intent)
      )
    ).toBe(false);

    const mutationCase = authorizedHarness();
    expect(
      mutationCase.authority.reserveExecutionCapabilityForWorker(
        mutationCase.authorization.executionCapability
      )
    ).toBe(true);
    const request = requestFor(mutationCase.authorization.intent);
    expect(
      mutationCase.authority.consumeExecutionCapabilityAfterDurableStart(
        mutationCase.authorization.executionCapability,
        deeplyFreeze({ ...request, claimId: "claim-mutated" })
      )
    ).toBe(false);

    let current = new Date(NOW);
    const expiryCase = authorizedHarness(() => current);
    expect(
      expiryCase.authority.reserveExecutionCapabilityForWorker(
        expiryCase.authorization.executionCapability
      )
    ).toBe(true);
    current = new Date(EXPIRES_AT);
    expect(
      expiryCase.authority.consumeExecutionCapabilityAfterDurableStart(
        expiryCase.authorization.executionCapability,
        requestFor(expiryCase.authorization.intent)
      )
    ).toBe(false);
  });

  it("performs one same-process challenge/confirmation round with a fresh nonce", async () => {
    const { releaseTrust } = harness();
    const displayed: Buffer[] = [];
    let clock = Date.parse(AUTHORIZED_AT);
    const result = await conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse(
      descriptor(),
      review(),
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
          const confirmation = text.slice(text.indexOf(marker) + marker.length).trimEnd();
          return Buffer.from(confirmation, "utf8");
        }
      })
    );
    expect(result).toMatchObject({ status: "confirmed", issue: null });
    if (result.status !== "confirmed") throw new Error(result.issue.message);
    expect(result.command.ceremonyNonce).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(result.command.ceremonyNonce).not.toBe(`0x${"00".repeat(32)}`);
    expect(result.command.ownerAuthorizationText).toContain(
      `ceremonyNonce=${result.command.ceremonyNonce}`
    );
    expect(displayed).toHaveLength(1);
    displayed[0]?.fill(0);
  });

  it("rejects confirmation mutation, replay nonce drift, accessors, and expiry", async () => {
    const { releaseTrust } = harness();
    const exactDescriptor = descriptor();
    const exactReview = review();
    let firstExactConfirmation: string | null = null;
    const run = (
      readExactConfirmation: (display: () => string) => Promise<Uint8Array>,
      timestamps = [
        Date.parse(AUTHORIZED_AT),
        Date.parse(AUTHORIZED_AT) + 1,
        Date.parse(AUTHORIZED_AT) + 2
      ]
    ) => {
      let displayed = "";
      return conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse(
        exactDescriptor,
        exactReview,
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
    const first = await run(async (display) => {
      const marker =
        "Paste exactly the following UTF-8 confirmation bytes, with no leading/trailing whitespace:\n";
      firstExactConfirmation = display()
        .slice(display().indexOf(marker) + marker.length)
        .trimEnd();
      return Buffer.from(firstExactConfirmation, "utf8");
    });
    expect(first).toMatchObject({ status: "confirmed" });
    if (firstExactConfirmation === null)
      throw new Error("First ceremony did not display confirmation.");
    await expect(
      run(async () => Buffer.from(firstExactConfirmation as string, "utf8"))
    ).resolves.toMatchObject({
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

    let getterCalls = 0;
    const accessorPorts = Object.freeze(
      Object.defineProperty({}, "now", {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return () => new Date(AUTHORIZED_AT);
        }
      })
    );
    await expect(
      conductBscTestnetPtaWbnbPoolOwnerCeremonyForInternalUse(
        exactDescriptor,
        exactReview,
        releaseTrust,
        RELEASE_TREE,
        accessorPorts
      )
    ).resolves.toMatchObject({ status: "blocked" });
    expect(getterCalls).toBe(0);
  });
});
