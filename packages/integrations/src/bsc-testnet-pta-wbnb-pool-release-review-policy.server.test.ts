import { createHash } from "node:crypto";

import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_WBNB_ADDRESS
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN,
  BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_POLICY_DIGEST_DOMAIN,
  BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_SUBJECT_DOMAIN,
  authenticateBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse,
  consumeBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse,
  createBscTestnetPtaWbnbPoolReleaseReviewPolicyRealmForTestsOnly,
  deriveBscTestnetPtaWbnbPoolProductionRuntimeManifestSha256ForInternalUse,
  deriveBscTestnetPtaWbnbPoolReleaseReviewSubjectSha256ForInternalUse,
  serializeBscTestnetPtaWbnbPoolReleaseReviewPolicyForTestsOnly,
  type BscTestnetPtaWbnbPoolExactReleaseIdentity,
  type BscTestnetPtaWbnbPoolReleaseReviewPolicy,
  type BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding,
  type BscTestnetPtaWbnbPoolRuntimeReviewInstantiation
} from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";

const NOW = "2026-08-13T08:00:00.000Z";
const REVIEWED_AT = "2026-08-13T07:59:00.000Z";
const POLICY_EXPIRES_AT = "2026-08-13T09:00:00.000Z";
const ENVELOPE_EXPIRES_AT = "2026-08-13T08:00:30.000Z";
const ENVELOPE_HASH = `0x${"44".repeat(32)}` as Hex;

function releaseIdentity(): BscTestnetPtaWbnbPoolExactReleaseIdentity {
  const manifestBody = Object.freeze({
    schemaVersion: 2 as const,
    domain: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN,
    nodeVersion: process.version,
    entries: Object.freeze([
      Object.freeze({
        path: ".gitattributes",
        byteLength: 815,
        sha256: `0x${"11".repeat(32)}` as Hex
      }),
      Object.freeze({
        path: "package.json",
        byteLength: 2_048,
        sha256: `0x${"33".repeat(32)}` as Hex
      }),
      Object.freeze({
        path: "packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-runner.server.ts",
        byteLength: 4_096,
        sha256: `0x${"22".repeat(32)}` as Hex
      })
    ])
  });
  const runtimeManifestSha256 =
    deriveBscTestnetPtaWbnbPoolProductionRuntimeManifestSha256ForInternalUse(manifestBody);
  if (runtimeManifestSha256 === null) throw new Error("synthetic manifest must be valid");
  return Object.freeze({
    releaseCommit: "1".repeat(40),
    releaseTree: "2".repeat(40),
    runtimeManifest: Object.freeze({
      ...manifestBody,
      runtimeManifestSha256
    })
  });
}

type PolicyBody = Omit<BscTestnetPtaWbnbPoolReleaseReviewPolicy, "policyDigest">;

function policyBody(release = releaseIdentity()): PolicyBody {
  const reviewedSubjectSha256 =
    deriveBscTestnetPtaWbnbPoolReleaseReviewSubjectSha256ForInternalUse(release);
  if (reviewedSubjectSha256 === null) throw new Error("synthetic release must be valid");
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: "owner_designated_internal_multi_agent_release_review_policy_v1" as const,
    decision: "GO_EXACT_CHAIN_97_ONE_SHOT_POLICY" as const,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    release,
    transaction: Object.freeze({
      chainId: "97" as const,
      from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      nonce: "1" as const,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      selector: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
      valueWei: "0" as const,
      expectedPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      token0: BSC_TESTNET_PTA_ADDRESS,
      token1: BSC_TESTNET_WBNB_ADDRESS,
      fee: "500" as const,
      sqrtPriceX96: "79228162514264337593543950" as const,
      expectedTick: "-138163" as const,
      fixedTestScenarioPrice: "1 PTA = 0.000001 WBNB" as const
    }),
    caps: Object.freeze({
      gasMarginBps: "2000" as const,
      maximumGasEstimate: "5000000" as const,
      maximumGasLimit: "6000000" as const,
      maximumGasPriceWei: "3000000000" as const,
      maximumTotalCostWei: "18000000000000000" as const,
      maximumEnvelopeLifetimeSeconds: "45" as const
    }),
    scope: Object.freeze({
      exactFreshEnvelopeRequired: true as const,
      maximumSignatureCount: "1" as const,
      maximumSubmissionCount: "1" as const,
      broadcastPolicy: "one_send_only_no_retry_no_replacement_reconcile_after_ambiguity" as const,
      liquidityActionAuthorized: false as const,
      lpPositionMintAuthorized: false as const,
      tokenApprovalAuthorized: false as const,
      tokenTransferAuthorized: false as const,
      mainnetWriteAuthorized: false as const,
      initializerHasNoDeadline: true as const,
      publicMempoolCanRace: true as const,
      priceIsMarketPriceOraclePegOrValuation: false as const
    }),
    reviewedSubjectSha256,
    implementationAgentIdentity: "root-implementation-agent",
    reviewers: Object.freeze([
      Object.freeze({
        taskLabel: "audit-agent-a",
        modelRole: "owner-designated-security-reviewer",
        decision: "GO_WITH_ZERO_P0_AND_ZERO_P1" as const,
        p0Findings: 0 as const,
        p1Findings: 0 as const,
        reviewedSubjectSha256
      }),
      Object.freeze({
        taskLabel: "audit-agent-b",
        modelRole: "owner-designated-recovery-reviewer",
        decision: "GO_WITH_ZERO_P0_AND_ZERO_P1" as const,
        p0Findings: 0 as const,
        p1Findings: 0 as const,
        reviewedSubjectSha256
      })
    ]),
    reviewedAt: REVIEWED_AT,
    expiresAt: POLICY_EXPIRES_AT,
    limitations: Object.freeze({
      ownerDesignatedInternalReview: true as const,
      cryptographicReviewerIdentityAvailable: false as const,
      externalIndependentReviewAvailable: false as const,
      sigstoreAttestationAvailable: false as const,
      reviewIsNotTransactionAuthorization: true as const,
      separateExactOwnerTransactionAuthorizationRequired: true as const,
      reviewersDidNotInspectFutureRuntimeEnvelopes: true as const,
      automatedPolicyApplicationRequired: true as const
    })
  });
}

function serialize(
  body: unknown = policyBody(),
  release: unknown = releaseIdentity(),
  now: unknown = NOW
): Uint8Array {
  const bytes = serializeBscTestnetPtaWbnbPoolReleaseReviewPolicyForTestsOnly(body, release, now);
  if (bytes === null) throw new Error("synthetic policy must serialize");
  return bytes;
}

function realm(
  bytes: unknown = serialize(),
  release: unknown = releaseIdentity(),
  clock: unknown = (): Date => new Date(NOW)
) {
  return createBscTestnetPtaWbnbPoolReleaseReviewPolicyRealmForTestsOnly(bytes, release, clock);
}

function decodedPolicy(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>;
}

function domainDigest(domain: string, bytes: Uint8Array): Hex {
  return `0x${createHash("sha256").update(domain, "utf8").update("\0", "utf8").update(bytes).digest("hex")}`;
}

function resealPolicy(record: Record<string, unknown>, domain: string): Uint8Array {
  const body = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "policyDigest"));
  const bodyBytes = Buffer.from(JSON.stringify(body), "utf8");
  const policyDigest = domainDigest(domain, bodyBytes);
  bodyBytes.fill(0);
  return Buffer.from(JSON.stringify({ ...body, policyDigest }), "utf8");
}

function deepFreeze(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function reviewerAt(body: Record<string, unknown>, index: number): Record<string, unknown> {
  const reviewers = body.reviewers;
  if (!Array.isArray(reviewers)) throw new Error("synthetic reviewers must be an array");
  const reviewer = reviewers[index];
  if (reviewer === null || typeof reviewer !== "object" || Array.isArray(reviewer)) {
    throw new Error("synthetic reviewer must be a record");
  }
  return reviewer as Record<string, unknown>;
}

function expectedBinding(
  instantiation: BscTestnetPtaWbnbPoolRuntimeReviewInstantiation
): BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding {
  return Object.freeze({
    releaseCommit: instantiation.releaseCommit,
    releaseTree: instantiation.releaseTree,
    runtimeManifestSha256: instantiation.runtimeManifestSha256,
    policyDigest: instantiation.policyDigest,
    reviewedSubjectSha256: instantiation.reviewedSubjectSha256,
    envelopeHash: instantiation.envelopeHash,
    expiresAt: instantiation.expiresAt,
    instantiationDigest: instantiation.instantiationDigest
  });
}

describe("BSC testnet PTA/WBNB release-review policy", () => {
  it("binds one full release and exact no-LP chain-97 policy without claiming envelope inspection", () => {
    const expectedRelease = releaseIdentity();
    const admission = realm(
      serialize(policyBody(expectedRelease), expectedRelease),
      expectedRelease
    );
    expect(admission).not.toBeNull();
    if (admission === null) throw new Error("expected realm");

    expect(admission.policy).toMatchObject({
      schemaVersion: 1,
      decision: "GO_EXACT_CHAIN_97_ONE_SHOT_POLICY",
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      release: expectedRelease,
      transaction: {
        chainId: "97",
        from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
        nonce: "1",
        to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
        selector: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
        dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
        valueWei: "0",
        expectedPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
      },
      caps: {
        gasMarginBps: "2000",
        maximumGasEstimate: "5000000",
        maximumGasLimit: "6000000",
        maximumGasPriceWei: "3000000000",
        maximumTotalCostWei: "18000000000000000",
        maximumEnvelopeLifetimeSeconds: "45"
      },
      scope: {
        maximumSignatureCount: "1",
        maximumSubmissionCount: "1",
        liquidityActionAuthorized: false,
        lpPositionMintAuthorized: false,
        tokenApprovalAuthorized: false,
        tokenTransferAuthorized: false,
        mainnetWriteAuthorized: false,
        priceIsMarketPriceOraclePegOrValuation: false
      },
      limitations: {
        ownerDesignatedInternalReview: true,
        cryptographicReviewerIdentityAvailable: false,
        externalIndependentReviewAvailable: false,
        sigstoreAttestationAvailable: false,
        reviewIsNotTransactionAuthorization: true,
        separateExactOwnerTransactionAuthorizationRequired: true,
        reviewersDidNotInspectFutureRuntimeEnvelopes: true,
        automatedPolicyApplicationRequired: true
      }
    });
    expect(admission.policy).not.toHaveProperty("envelopeHash");
    expect(admission.policy.reviewers).toHaveLength(2);
    expect(admission.policy.reviewers.map((reviewer) => reviewer.taskLabel)).toEqual([
      "audit-agent-a",
      "audit-agent-b"
    ]);

    const instantiation = admission.instantiate(
      Object.freeze({ envelopeHash: ENVELOPE_HASH, expiresAt: ENVELOPE_EXPIRES_AT })
    );
    expect(instantiation).toMatchObject({
      policyDigest: admission.policyDigest,
      envelopeHash: ENVELOPE_HASH,
      expiresAt: ENVELOPE_EXPIRES_AT,
      automatedPolicyApplication: true,
      reviewerInspectedExactEnvelope: false,
      reviewIsNotTransactionAuthorization: true
    });
    if (instantiation === null) throw new Error("expected instantiation");
    const binding = expectedBinding(instantiation);
    expect(admission.authenticateForTestsOnly(instantiation, binding)).toBe(true);
    expect(
      authenticateBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse(
        instantiation,
        binding
      )
    ).toBe(false);
    expect(
      consumeBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse(instantiation, binding)
    ).toBe(false);
    expect(admission.consumeForTestsOnly(instantiation, binding)).toBe(true);
    expect(admission.authenticateForTestsOnly(instantiation, binding)).toBe(false);
    expect(admission.consumeForTestsOnly(instantiation, binding)).toBe(false);
    expect(
      admission.instantiate(
        Object.freeze({ envelopeHash: ENVELOPE_HASH, expiresAt: ENVELOPE_EXPIRES_AT })
      )
    ).toBeNull();
  });

  it("requires exact canonical UTF-8 bytes and a digest in the policy domain", () => {
    const bytes = serialize();
    expect(realm(bytes)).not.toBeNull();
    expect(realm(Buffer.concat([Buffer.from(" "), Buffer.from(bytes)]))).toBeNull();
    expect(realm(Buffer.concat([Buffer.from(bytes), Buffer.from("\n")]))).toBeNull();

    const reordered = decodedPolicy(bytes);
    const digest = reordered.policyDigest;
    delete reordered.policyDigest;
    expect(
      realm(Buffer.from(JSON.stringify({ policyDigest: digest, ...reordered }), "utf8"))
    ).toBeNull();

    const wrongDomain = decodedPolicy(bytes);
    expect(
      realm(resealPolicy(wrongDomain, BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_SUBJECT_DOMAIN))
    ).toBeNull();

    const badDigest = decodedPolicy(bytes);
    badDigest.policyDigest = `0x${"99".repeat(32)}`;
    expect(realm(Buffer.from(JSON.stringify(badDigest), "utf8"))).toBeNull();

    const invalidUtf8 = Uint8Array.from([0xc3, 0x28]);
    expect(realm(invalidUtf8)).toBeNull();
    expect(realm(new Uint8Array(0))).toBeNull();
    expect(realm(new Uint8Array(65_537))).toBeNull();
    expect(realm(new Proxy(bytes, {}))).toBeNull();
  });

  it("rejects field mutation even when an attacker reseals the unkeyed digest", () => {
    const cases: Array<(record: Record<string, unknown>) => void> = [
      (record) => {
        (record.transaction as Record<string, unknown>).dataKeccak256 = `0x${"88".repeat(32)}`;
      },
      (record) => {
        (record.caps as Record<string, unknown>).maximumGasLimit = "6000001";
      },
      (record) => {
        (record.scope as Record<string, unknown>).lpPositionMintAuthorized = true;
      },
      (record) => {
        (record.limitations as Record<string, unknown>).externalIndependentReviewAvailable = true;
      },
      (record) => {
        record.reviewedSubjectSha256 = `0x${"77".repeat(32)}`;
      },
      (record) => {
        (record.release as Record<string, unknown>).releaseTree = "a".repeat(40);
      }
    ];
    for (const mutate of cases) {
      const record = decodedPolicy(serialize());
      mutate(record);
      expect(
        realm(resealPolicy(record, BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_POLICY_DIGEST_DOMAIN))
      ).toBeNull();
    }
  });

  it("requires a deeply frozen, exact and ordered schema-v2 expected manifest", () => {
    const valid = releaseIdentity();
    expect(deriveBscTestnetPtaWbnbPoolReleaseReviewSubjectSha256ForInternalUse(valid)).toMatch(
      /^0x[0-9a-f]{64}$/u
    );

    const unfrozen = JSON.parse(JSON.stringify(valid)) as unknown;
    expect(
      deriveBscTestnetPtaWbnbPoolReleaseReviewSubjectSha256ForInternalUse(unfrozen)
    ).toBeNull();
    expect(realm(serialize(), unfrozen)).toBeNull();
    expect(realm(serialize(), new Proxy(valid, {}))).toBeNull();

    const accessor = Object.freeze(
      Object.defineProperties(Object.create(null) as object, {
        releaseCommit: { enumerable: true, get: () => valid.releaseCommit },
        releaseTree: { enumerable: true, value: valid.releaseTree },
        runtimeManifest: { enumerable: true, value: valid.runtimeManifest }
      })
    );
    expect(realm(serialize(), accessor)).toBeNull();

    const reversed = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
    const manifest = reversed.runtimeManifest as Record<string, unknown>;
    manifest.entries = [...(manifest.entries as unknown[])].reverse();
    const frozenReversed = deepFreeze(reversed);
    expect(realm(serialize(), frozenReversed)).toBeNull();

    const extra = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
    (extra.runtimeManifest as Record<string, unknown>).unexpected = true;
    expect(realm(serialize(), deepFreeze(extra))).toBeNull();

    const wrongNode = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
    (wrongNode.runtimeManifest as Record<string, unknown>).nodeVersion = "v0.0.0";
    expect(realm(serialize(), deepFreeze(wrongNode))).toBeNull();
  });

  it("requires two or three sorted distinct zero-P0/zero-P1 reviewer verdicts", () => {
    const mutations: Array<(body: Record<string, unknown>) => void> = [
      (body) => {
        body.reviewers = [(body.reviewers as unknown[])[0]];
      },
      (body) => {
        body.reviewers = [...(body.reviewers as unknown[]), {}, {}];
      },
      (body) => {
        body.reviewers = [...(body.reviewers as unknown[])].reverse();
      },
      (body) => {
        reviewerAt(body, 1).taskLabel = reviewerAt(body, 0).taskLabel;
      },
      (body) => {
        reviewerAt(body, 0).p0Findings = 1;
      },
      (body) => {
        reviewerAt(body, 0).p1Findings = 1;
      },
      (body) => {
        reviewerAt(body, 0).decision = "GO";
      },
      (body) => {
        reviewerAt(body, 0).reviewedSubjectSha256 = `0x${"aa".repeat(32)}`;
      },
      (body) => {
        body.implementationAgentIdentity = "audit-agent-a";
      }
    ];
    for (const mutate of mutations) {
      const body = JSON.parse(JSON.stringify(policyBody())) as Record<string, unknown>;
      mutate(body);
      expect(
        serializeBscTestnetPtaWbnbPoolReleaseReviewPolicyForTestsOnly(body, releaseIdentity(), NOW)
      ).toBeNull();
    }
  });

  it("rejects stale, future, excessively long, expired, and malformed policy lifetimes", () => {
    const cases: Array<Readonly<{ now: string; reviewedAt: string; expiresAt: string }>> = [
      {
        now: NOW,
        reviewedAt: "2026-08-13T08:00:00.001Z",
        expiresAt: POLICY_EXPIRES_AT
      },
      {
        now: NOW,
        reviewedAt: "2026-08-12T07:59:59.999Z",
        expiresAt: POLICY_EXPIRES_AT
      },
      { now: NOW, reviewedAt: REVIEWED_AT, expiresAt: NOW },
      {
        now: NOW,
        reviewedAt: REVIEWED_AT,
        expiresAt: "2026-08-14T08:00:00.000Z"
      },
      { now: NOW, reviewedAt: "not-a-date", expiresAt: POLICY_EXPIRES_AT }
    ];
    for (const value of cases) {
      const body = { ...policyBody(), reviewedAt: value.reviewedAt, expiresAt: value.expiresAt };
      expect(
        serializeBscTestnetPtaWbnbPoolReleaseReviewPolicyForTestsOnly(
          body,
          releaseIdentity(),
          value.now
        )
      ).toBeNull();
    }
  });

  it("fails closed for untrusted instantiation records, counterfeits and expiry", () => {
    let nowMilliseconds = Date.parse(NOW);
    const clock = (): Date => new Date(nowMilliseconds);
    const admission = realm(serialize(), releaseIdentity(), clock);
    expect(admission).not.toBeNull();
    if (admission === null) throw new Error("expected realm");

    const exactInput = Object.freeze({
      envelopeHash: ENVELOPE_HASH,
      expiresAt: ENVELOPE_EXPIRES_AT
    });
    expect(admission.instantiate({ ...exactInput })).toBeNull();
    expect(admission.instantiate(new Proxy(exactInput, {}))).toBeNull();
    const accessorInput = Object.freeze(
      Object.defineProperties(Object.create(null) as object, {
        envelopeHash: { enumerable: true, get: () => ENVELOPE_HASH },
        expiresAt: { enumerable: true, value: ENVELOPE_EXPIRES_AT }
      })
    );
    expect(admission.instantiate(accessorInput)).toBeNull();
    expect(
      admission.instantiate(Object.freeze({ ...exactInput, [Symbol("unexpected")]: "unexpected" }))
    ).toBeNull();
    expect(
      admission.instantiate(
        Object.freeze({
          envelopeHash: ENVELOPE_HASH,
          expiresAt: "2026-08-13T08:00:45.001Z"
        })
      )
    ).toBeNull();

    const secondAdmission = realm(serialize(), releaseIdentity(), clock);
    expect(secondAdmission).not.toBeNull();
    if (secondAdmission === null) throw new Error("expected realm");
    const instantiation = secondAdmission.instantiate(exactInput);
    expect(instantiation).not.toBeNull();
    if (instantiation === null) throw new Error("expected instantiation");
    const binding = expectedBinding(instantiation);
    expect(
      secondAdmission.authenticateForTestsOnly(Object.freeze({ ...instantiation }), binding)
    ).toBe(false);
    expect(secondAdmission.authenticateForTestsOnly(instantiation, binding)).toBe(true);

    nowMilliseconds = Date.parse(ENVELOPE_EXPIRES_AT);
    expect(secondAdmission.authenticateForTestsOnly(instantiation, binding)).toBe(false);
    expect(secondAdmission.consumeForTestsOnly(instantiation, binding)).toBe(false);

    nowMilliseconds = Date.parse(NOW);
    const rollbackAdmission = realm(serialize(), releaseIdentity(), clock);
    if (rollbackAdmission === null) throw new Error("expected realm");
    const rollbackInstantiation = rollbackAdmission.instantiate(exactInput);
    if (rollbackInstantiation === null) throw new Error("expected instantiation");
    const rollbackBinding = expectedBinding(rollbackInstantiation);
    nowMilliseconds -= 1;
    expect(rollbackAdmission.authenticateForTestsOnly(rollbackInstantiation, rollbackBinding)).toBe(
      false
    );
    expect(rollbackAdmission.consumeForTestsOnly(rollbackInstantiation, rollbackBinding)).toBe(
      false
    );

    nowMilliseconds = Date.parse(NOW);
    const preReviewAdmission = realm(serialize(), releaseIdentity(), clock);
    if (preReviewAdmission === null) throw new Error("expected realm");
    nowMilliseconds = Date.parse(REVIEWED_AT) - 1;
    expect(
      preReviewAdmission.instantiate(
        Object.freeze({
          envelopeHash: ENVELOPE_HASH,
          expiresAt: "2026-08-13T07:59:29.999Z"
        })
      )
    ).toBeNull();
  });

  it("binds every trusted runtime field and terminally consumes a branded value on mismatch", () => {
    const mutations: Array<
      (binding: Record<keyof BscTestnetPtaWbnbPoolRuntimeReviewExpectedBinding, unknown>) => void
    > = [
      (binding) => {
        binding.releaseCommit = "a".repeat(40);
      },
      (binding) => {
        binding.releaseTree = "b".repeat(40);
      },
      (binding) => {
        binding.runtimeManifestSha256 = `0x${"55".repeat(32)}`;
      },
      (binding) => {
        binding.policyDigest = `0x${"66".repeat(32)}`;
      },
      (binding) => {
        binding.reviewedSubjectSha256 = `0x${"77".repeat(32)}`;
      },
      (binding) => {
        binding.envelopeHash = `0x${"88".repeat(32)}`;
      },
      (binding) => {
        binding.expiresAt = "2026-08-13T08:00:29.999Z";
      },
      (binding) => {
        binding.instantiationDigest = `0x${"99".repeat(32)}`;
      }
    ];
    for (const mutate of mutations) {
      const admission = realm();
      if (admission === null) throw new Error("expected realm");
      const instantiation = admission.instantiate(
        Object.freeze({ envelopeHash: ENVELOPE_HASH, expiresAt: ENVELOPE_EXPIRES_AT })
      );
      if (instantiation === null) throw new Error("expected instantiation");
      const binding = { ...expectedBinding(instantiation) };
      mutate(binding);
      const frozenMismatch = Object.freeze(binding);
      expect(admission.authenticateForTestsOnly(instantiation, frozenMismatch)).toBe(false);
      expect(admission.consumeForTestsOnly(instantiation, frozenMismatch)).toBe(false);
      expect(
        admission.authenticateForTestsOnly(instantiation, expectedBinding(instantiation))
      ).toBe(false);
      expect(admission.consumeForTestsOnly(instantiation, expectedBinding(instantiation))).toBe(
        false
      );
    }
  });

  it("rejects proxy clocks and invalid Date instances without executing proxy traps", () => {
    let traps = 0;
    const proxiedClock = new Proxy(() => new Date(NOW), {
      apply: () => {
        traps += 1;
        return new Date(NOW);
      }
    });
    expect(realm(serialize(), releaseIdentity(), proxiedClock)).toBeNull();
    expect(traps).toBe(0);
    expect(realm(serialize(), releaseIdentity(), () => new Date(Number.NaN))).toBeNull();
    expect(realm(serialize(), releaseIdentity(), () => new Proxy(new Date(NOW), {}))).toBeNull();
  });
});
