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
import {
  BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN,
  BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_POLICY_DIGEST_DOMAIN,
  BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_SUBJECT_DOMAIN,
  BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN,
  authenticateBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse,
  consumeBscTestnetPtaWbnbPoolRuntimeReviewInstantiationForInternalUse,
  createBscTestnetPtaWbnbPoolReleaseReviewPolicyRealmForTestsOnly,
  decodeBscTestnetPtaWbnbPoolReleaseReviewTtyTransportForTestsOnly,
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
const NO_EFFECT_ENVELOPE_HASH = `0x${"45".repeat(32)}` as Hex;
const NO_EFFECT_PROOF_DIGEST = `0x${"46".repeat(32)}` as Hex;
const PREDECESSOR_FENCE_SHA256 = `0x${"47".repeat(32)}` as Hex;
const NO_EFFECT_OBSERVED_AT = "2026-08-13T07:59:57.000Z";
const FENCE_RECORDED_AT = "2026-08-13T07:59:58.000Z";
const EXECUTION_ENVELOPE_OBSERVED_AT = "2026-08-13T07:59:59.000Z";
const TTY_NONCE = `0x${"ab".repeat(32)}` as Hex;
const TTY_STARTED_AT = 1_000;
const TTY_NOT_AFTER = 301_000;
const TTY_CHUNK_CHARACTERS = 2_304;

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

function predecessorFence() {
  return Object.freeze({
    status: "superseded_before_worker" as const,
    terminalCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" as const,
    workerAuthorizationOutcome: "not_attempted" as const,
    workerStartOutcome: "not_attempted" as const,
    signatureOutcome: "not_attempted" as const,
    submissionOutcome: "not_attempted" as const,
    submissionJournalState: "exact_empty" as const,
    fenceRecordedAt: FENCE_RECORDED_AT,
    legacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
    noEffectProofDigest: NO_EFFECT_PROOF_DIGEST,
    noEffectEnvelopeHash: NO_EFFECT_ENVELOPE_HASH,
    noEffectObservedAt: NO_EFFECT_OBSERVED_AT,
    predecessorFenceSha256: PREDECESSOR_FENCE_SHA256
  });
}

function instantiationInput(
  envelopeHash: Hex = ENVELOPE_HASH,
  expiresAt: string = ENVELOPE_EXPIRES_AT
) {
  return Object.freeze({
    envelopeHash,
    executionEnvelopeObservedAt: EXECUTION_ENVELOPE_OBSERVED_AT,
    expiresAt,
    predecessorFence: predecessorFence()
  });
}

function policyBody(release = releaseIdentity()): PolicyBody {
  const reviewedSubjectSha256 =
    deriveBscTestnetPtaWbnbPoolReleaseReviewSubjectSha256ForInternalUse(release);
  if (reviewedSubjectSha256 === null) throw new Error("synthetic release must be valid");
  return Object.freeze({
    schemaVersion: 2 as const,
    kind: "owner_designated_internal_multi_agent_release_review_policy_generation_2_v2" as const,
    decision: "GO_EXACT_CHAIN_97_RECOVERY_GENERATION_2_POLICY" as const,
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
      maximumEnvelopeLifetimeSeconds: "300" as const,
      maximumOwnerConfirmationWindowSeconds: "240" as const,
      maximumExecutionAuthorityLifetimeSeconds: "45" as const,
      maximumPostClaimRecheckAgeSeconds: "30" as const,
      recoveryGeneration: "2" as const,
      predecessorLegacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256
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
      priceIsMarketPriceOraclePegOrValuation: false as const,
      predecessorAppendOnlyFenceRequired: true as const,
      predecessorNoEffectProofRequired: true as const,
      predecessorStateRequired: "superseded_before_worker" as const,
      predecessorTerminalCodeRequired: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" as const,
      predecessorWorkerAuthorizationOutcomeRequired: "not_attempted" as const,
      predecessorWorkerStartOutcomeRequired: "not_attempted" as const,
      predecessorSignatureOutcomeRequired: "not_attempted" as const,
      predecessorSubmissionJournalStateRequired: "exact_empty" as const,
      predecessorSubmissionOutcomeRequired: "not_attempted" as const,
      fenceObservationMayBeReusedAsExecutionEnvelope: false as const,
      freshEnvelopeAfterFenceRequired: true as const
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
    recovery: instantiation.recovery,
    envelopeHash: instantiation.envelopeHash,
    executionEnvelopeObservedAt: instantiation.executionEnvelopeObservedAt,
    expiresAt: instantiation.expiresAt,
    instantiationDigest: instantiation.instantiationDigest
  });
}

function ttyTransportLines(policyBytes: Uint8Array, nonce: Hex = TTY_NONCE): string[] {
  const owned = Buffer.from(policyBytes);
  const encoded = owned.toString("base64url");
  const policySha256 = `0x${createHash("sha256").update(owned).digest("hex")}`;
  owned.fill(0);
  const chunkCount = Math.ceil(encoded.length / TTY_CHUNK_CHARACTERS);
  const metadata = `chunk-count=${chunkCount}|policy-byte-length=${policyBytes.byteLength}|policy-sha256=${policySha256}`;
  const lines = [
    `${BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN}|nonce=${nonce}|line-index=0|kind=BEGIN|${metadata}`
  ];
  for (let index = 0; index < chunkCount; index += 1) {
    const payload = encoded.slice(index * TTY_CHUNK_CHARACTERS, (index + 1) * TTY_CHUNK_CHARACTERS);
    lines.push(
      `${BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN}|nonce=${nonce}|line-index=${index + 1}|kind=CHUNK|chunk-index=${index}|${metadata}|policy-base64url=${payload}`
    );
  }
  lines.push(
    `${BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_TTY_FRAME_DOMAIN}|nonce=${nonce}|line-index=${chunkCount + 1}|kind=END|${metadata}`
  );
  return lines;
}

function ttyEvents(
  transport: Buffer,
  splitOffsets: readonly number[] = [],
  observedAtMilliseconds = TTY_STARTED_AT + 1
): readonly Readonly<{ bytes: Buffer; observedAtMilliseconds: number }>[] {
  const offsets = [0, ...splitOffsets, transport.byteLength];
  return offsets.slice(0, -1).map((offset, index) =>
    Object.freeze({
      bytes: Buffer.from(transport.subarray(offset, offsets[index + 1])),
      observedAtMilliseconds
    })
  );
}

function decodeTtyTransport(
  transport: Buffer,
  splitOffsets: readonly number[] = [],
  observedAtMilliseconds = TTY_STARTED_AT + 1
): Uint8Array | null {
  return decodeBscTestnetPtaWbnbPoolReleaseReviewTtyTransportForTestsOnly(
    ttyEvents(transport, splitOffsets, observedAtMilliseconds),
    TTY_NONCE,
    TTY_STARTED_AT,
    TTY_NOT_AFTER
  );
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
      schemaVersion: 2,
      decision: "GO_EXACT_CHAIN_97_RECOVERY_GENERATION_2_POLICY",
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
        maximumEnvelopeLifetimeSeconds: "300",
        maximumOwnerConfirmationWindowSeconds: "240",
        maximumExecutionAuthorityLifetimeSeconds: "45",
        maximumPostClaimRecheckAgeSeconds: "30",
        recoveryGeneration: "2",
        predecessorLegacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256
      },
      scope: {
        maximumSignatureCount: "1",
        maximumSubmissionCount: "1",
        liquidityActionAuthorized: false,
        lpPositionMintAuthorized: false,
        tokenApprovalAuthorized: false,
        tokenTransferAuthorized: false,
        mainnetWriteAuthorized: false,
        priceIsMarketPriceOraclePegOrValuation: false,
        predecessorStateRequired: "superseded_before_worker",
        predecessorTerminalCodeRequired: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN",
        predecessorWorkerAuthorizationOutcomeRequired: "not_attempted",
        predecessorWorkerStartOutcomeRequired: "not_attempted",
        predecessorSignatureOutcomeRequired: "not_attempted",
        predecessorSubmissionJournalStateRequired: "exact_empty",
        predecessorSubmissionOutcomeRequired: "not_attempted",
        fenceObservationMayBeReusedAsExecutionEnvelope: false,
        freshEnvelopeAfterFenceRequired: true
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

    const instantiation = admission.instantiate(instantiationInput());
    expect(instantiation).toMatchObject({
      policyDigest: admission.policyDigest,
      envelopeHash: ENVELOPE_HASH,
      executionEnvelopeObservedAt: EXECUTION_ENVELOPE_OBSERVED_AT,
      expiresAt: ENVELOPE_EXPIRES_AT,
      recovery: {
        generation: 2,
        predecessorFence: predecessorFence()
      },
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
    expect(admission.instantiate(instantiationInput())).toBeNull();
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
        (record.caps as Record<string, unknown>).maximumEnvelopeLifetimeSeconds = "45";
      },
      (record) => {
        (record.caps as Record<string, unknown>).maximumOwnerConfirmationWindowSeconds = "241";
      },
      (record) => {
        (record.caps as Record<string, unknown>).maximumExecutionAuthorityLifetimeSeconds = "46";
      },
      (record) => {
        (record.caps as Record<string, unknown>).maximumPostClaimRecheckAgeSeconds = "31";
      },
      (record) => {
        (record.caps as Record<string, unknown>).recoveryGeneration = "1";
      },
      (record) => {
        (record.caps as Record<string, unknown>).predecessorLegacyClaimRawSha256 =
          `0x${"01".repeat(32)}`;
      },
      (record) => {
        (record.scope as Record<string, unknown>).lpPositionMintAuthorized = true;
      },
      (record) => {
        (record.scope as Record<string, unknown>).predecessorWorkerStartOutcomeRequired =
          "attempted";
      },
      (record) => {
        (record.scope as Record<string, unknown>).predecessorSubmissionJournalStateRequired =
          "not_empty";
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

  it("rejects v1 policy replay and legacy exact-key caps that omit generation-2 bounds", () => {
    const v1 = decodedPolicy(serialize());
    v1.schemaVersion = 1;
    v1.kind = "owner_designated_internal_multi_agent_release_review_policy_v1";
    v1.decision = "GO_EXACT_CHAIN_97_ONE_SHOT_POLICY";
    expect(
      realm(resealPolicy(v1, BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_POLICY_DIGEST_DOMAIN))
    ).toBeNull();

    const legacy = decodedPolicy(serialize());
    const caps = legacy.caps as Record<string, unknown>;
    delete caps.maximumOwnerConfirmationWindowSeconds;
    delete caps.maximumExecutionAuthorityLifetimeSeconds;
    delete caps.maximumPostClaimRecheckAgeSeconds;
    delete caps.recoveryGeneration;
    delete caps.predecessorLegacyClaimRawSha256;
    expect(
      realm(resealPolicy(legacy, BSC_TESTNET_PTA_WBNB_POOL_RELEASE_REVIEW_POLICY_DIGEST_DOMAIN))
    ).toBeNull();
  });

  it("requires append-only fence ordering and a distinct later execution envelope B", () => {
    const {
      submissionJournalState: _omittedSubmissionJournalState,
      ...fenceWithoutSubmissionJournalState
    } = predecessorFence();
    void _omittedSubmissionJournalState;
    const cases = [
      instantiationInput(NO_EFFECT_ENVELOPE_HASH),
      Object.freeze({
        ...instantiationInput(),
        executionEnvelopeObservedAt: FENCE_RECORDED_AT
      }),
      Object.freeze({
        ...instantiationInput(),
        predecessorFence: Object.freeze({
          ...predecessorFence(),
          fenceRecordedAt: NO_EFFECT_OBSERVED_AT
        })
      }),
      Object.freeze({
        ...instantiationInput(),
        predecessorFence: Object.freeze({
          ...predecessorFence(),
          legacyClaimRawSha256: `0x${"01".repeat(32)}`
        })
      }),
      Object.freeze({
        ...instantiationInput(),
        predecessorFence: Object.freeze({
          ...predecessorFence(),
          workerAuthorizationOutcome: "attempted"
        })
      }),
      Object.freeze({
        ...instantiationInput(),
        predecessorFence: Object.freeze({
          ...predecessorFence(),
          submissionJournalState: "not_empty"
        })
      }),
      Object.freeze({
        ...instantiationInput(),
        predecessorFence: Object.freeze(fenceWithoutSubmissionJournalState)
      }),
      Object.freeze({
        ...instantiationInput(),
        predecessorFence: Object.freeze({
          ...predecessorFence(),
          predecessorFenceSha256: `0x${"02".repeat(32)}`,
          unexpected: true
        })
      })
    ];
    for (const input of cases) {
      const admission = realm();
      if (admission === null) throw new Error("expected realm");
      expect(admission.instantiate(input)).toBeNull();
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

    const exactInput = instantiationInput();
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
          executionEnvelopeObservedAt: EXECUTION_ENVELOPE_OBSERVED_AT,
          expiresAt: "2026-08-13T08:05:00.001Z",
          predecessorFence: predecessorFence()
        })
      )
    ).toBeNull();

    const maximumAdmission = realm(serialize(), releaseIdentity(), clock);
    expect(maximumAdmission).not.toBeNull();
    if (maximumAdmission === null) throw new Error("expected realm");
    expect(
      maximumAdmission.instantiate(
        Object.freeze({
          envelopeHash: ENVELOPE_HASH,
          executionEnvelopeObservedAt: EXECUTION_ENVELOPE_OBSERVED_AT,
          expiresAt: "2026-08-13T08:05:00.000Z",
          predecessorFence: predecessorFence()
        })
      )
    ).not.toBeNull();

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
          executionEnvelopeObservedAt: EXECUTION_ENVELOPE_OBSERVED_AT,
          expiresAt: "2026-08-13T07:59:29.999Z",
          predecessorFence: predecessorFence()
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
        binding.recovery = Object.freeze({
          generation: 2,
          predecessorFence: Object.freeze({
            ...predecessorFence(),
            predecessorFenceSha256: `0x${"78".repeat(32)}`
          })
        });
      },
      (binding) => {
        binding.envelopeHash = `0x${"88".repeat(32)}`;
      },
      (binding) => {
        binding.executionEnvelopeObservedAt = "2026-08-13T07:59:58.000Z";
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
      const instantiation = admission.instantiate(instantiationInput());
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

  it("reconstructs a 11,560-character policy across arbitrary events and mixed LF/CRLF lines", () => {
    const policyBytes = Buffer.alloc(8_670, 0xa5);
    expect(policyBytes.toString("base64url")).toHaveLength(11_560);
    const lines = ttyTransportLines(policyBytes);
    expect(lines).toHaveLength(8);
    const transport = Buffer.from(
      lines.map((line, index) => `${line}${index % 2 === 0 ? "\r\n" : "\n"}`).join(""),
      "ascii"
    );
    const firstCarriageReturn = transport.indexOf(0x0d);
    const splitOffsets = [
      7,
      firstCarriageReturn + 1,
      Math.floor(transport.byteLength / 2),
      transport.byteLength - 3
    ];
    const decoded = decodeTtyTransport(transport, splitOffsets);
    expect(decoded).not.toBeNull();
    expect(Buffer.from(decoded ?? []).equals(policyBytes)).toBe(true);
  });

  it("accepts the exact 65,536-byte policy boundary within the 100-KiB transport cap", () => {
    const policyBytes = Buffer.alloc(65_536, 0x5a);
    const lines = ttyTransportLines(policyBytes);
    const transport = Buffer.from(`${lines.join("\r\n")}\r\n`, "ascii");
    expect(lines).toHaveLength(40);
    const maximumLineBytes = Math.max(...lines.map((line) => Buffer.byteLength(line, "ascii")));
    expect(maximumLineBytes).toBe(2_618);
    expect(maximumLineBytes).toBeLessThanOrEqual(2_700);
    expect(transport.byteLength).toBe(99_934);
    expect(transport.byteLength).toBeLessThanOrEqual(100 * 1_024);
    const decoded = decodeTtyTransport(transport);
    expect(decoded).not.toBeNull();
    expect(Buffer.from(decoded ?? []).equals(policyBytes)).toBe(true);

    const oversizedPolicy = Buffer.alloc(65_537, 0x5a);
    const oversizedTransport = Buffer.from(
      `${ttyTransportLines(oversizedPolicy).join("\n")}\n`,
      "ascii"
    );
    expect(decodeTtyTransport(oversizedTransport)).toBeNull();
    expect(
      decodeTtyTransport(Buffer.from(`${ttyTransportLines(new Uint8Array(0)).join("\n")}\n`))
    ).toBeNull();
  });

  it("rejects reordered, duplicate, missing, truncated, extra and preloaded frame lines", () => {
    const policyBytes = Buffer.alloc(12_000, 0x36);
    const lines = ttyTransportLines(policyBytes);
    const valid = Buffer.from(`${lines.join("\n")}\n`, "ascii");
    const cases = [
      [lines[0], lines[2], lines[1], ...lines.slice(3)],
      [lines[0], lines[1], lines[1], ...lines.slice(2)],
      [lines[0], ...lines.slice(2)],
      lines.slice(0, -1),
      ["preloaded", ...lines],
      [...lines, "trailing"]
    ];
    for (const malformedLines of cases) {
      expect(decodeTtyTransport(Buffer.from(`${malformedLines.join("\n")}\n`, "ascii"))).toBeNull();
    }
    expect(decodeTtyTransport(valid.subarray(0, valid.byteLength - 1))).toBeNull();
    expect(decodeTtyTransport(Buffer.concat([valid, Buffer.from("trailing\n")]))).toBeNull();
    expect(
      decodeBscTestnetPtaWbnbPoolReleaseReviewTtyTransportForTestsOnly(
        [
          Object.freeze({ bytes: valid, observedAtMilliseconds: TTY_STARTED_AT + 1 }),
          Object.freeze({
            bytes: Buffer.from("buffered-after-end\n"),
            observedAtMilliseconds: TTY_STARTED_AT + 1
          })
        ],
        TTY_NONCE,
        TTY_STARTED_AT,
        TTY_NOT_AFTER
      )
    ).toBeNull();
  });

  it("rejects malformed metadata, indices, hashes, payloads and the retired v1 frame", () => {
    const policyBytes = Buffer.alloc(9_000, 0x71);
    const lines = ttyTransportLines(policyBytes);
    const wrongHash = `0x${"cd".repeat(32)}`;
    const mutations = [
      lines.map((line) =>
        line.replace(/policy-sha256=0x[0-9a-f]{64}/u, `policy-sha256=${wrongHash}`)
      ),
      lines.map((line) => line.replace("policy-byte-length=9000", "policy-byte-length=9001")),
      lines.map((line, index) =>
        index === 0 ? line.replace("chunk-count=6", "chunk-count=06") : line
      ),
      lines.map((line, index) =>
        index === 1 ? line.replace("line-index=1", "line-index=2") : line
      ),
      lines.map((line, index) =>
        index === 1 ? line.replace("chunk-index=0", "chunk-index=1") : line
      ),
      lines.map((line, index) =>
        index === 1 ? line.replace("policy-base64url=", "policy-base64url==") : line
      ),
      lines.map((line, index) => (index === 0 ? line.replace("kind=BEGIN", "kind=CHUNK") : line))
    ];
    for (const malformedLines of mutations) {
      expect(decodeTtyTransport(Buffer.from(`${malformedLines.join("\n")}\n`, "ascii"))).toBeNull();
    }
    const wrongNonce = lines.map((line) => line.replace(TTY_NONCE, `0x${"ac".repeat(32)}`));
    expect(decodeTtyTransport(Buffer.from(`${wrongNonce.join("\n")}\n`, "ascii"))).toBeNull();
    const v1 = Buffer.from(
      `ProofEra:bsc-testnet-pta-wbnb-pool-release-review-tty-frame:v1|nonce=${TTY_NONCE}|policy-base64url=${policyBytes.toString("base64url")}\n`,
      "ascii"
    );
    expect(decodeTtyTransport(v1)).toBeNull();
  });

  it("rejects empty lines, controls, lone CR, non-ASCII and overlong lines", () => {
    const policyBytes = Buffer.alloc(256, 0x19);
    const lines = ttyTransportLines(policyBytes);
    const valid = Buffer.from(`${lines.join("\n")}\n`, "ascii");
    const firstLf = valid.indexOf(0x0a);
    const controlCases = [
      Buffer.concat([
        valid.subarray(0, firstLf + 1),
        Buffer.from("\n"),
        valid.subarray(firstLf + 1)
      ]),
      Buffer.concat([valid.subarray(0, firstLf), Buffer.from("\rX"), valid.subarray(firstLf + 1)]),
      Buffer.concat([valid.subarray(0, 4), Buffer.from([0]), valid.subarray(4)]),
      Buffer.concat([valid.subarray(0, 4), Buffer.from([0xc3, 0xa9]), valid.subarray(4)]),
      Buffer.concat([valid.subarray(0, 4), Buffer.from([0x09]), valid.subarray(4)])
    ];
    for (const transport of controlCases) expect(decodeTtyTransport(transport)).toBeNull();

    const overlongLines = [...lines];
    overlongLines[1] = `${overlongLines[1]}${"A".repeat(4_097)}`;
    expect(decodeTtyTransport(Buffer.from(`${overlongLines.join("\n")}\n`, "ascii"))).toBeNull();
  });

  it("enforces one absolute deadline across all transport events", () => {
    const policyBytes = Buffer.alloc(4_000, 0x2b);
    const lines = ttyTransportLines(policyBytes);
    const lineEvents = lines.map((line, index) =>
      Object.freeze({
        bytes: Buffer.from(`${line}\n`, "ascii"),
        observedAtMilliseconds:
          index === lines.length - 1 ? TTY_NOT_AFTER : TTY_STARTED_AT + index + 1
      })
    );
    expect(
      decodeBscTestnetPtaWbnbPoolReleaseReviewTtyTransportForTestsOnly(
        lineEvents,
        TTY_NONCE,
        TTY_STARTED_AT,
        TTY_NOT_AFTER
      )
    ).toBeNull();
    const valid = Buffer.from(`${lines.join("\n")}\n`, "ascii");
    expect(decodeTtyTransport(valid, [], TTY_STARTED_AT - 1)).toBeNull();
    expect(decodeTtyTransport(valid, [], TTY_NOT_AFTER + 1)).toBeNull();
    expect(
      decodeBscTestnetPtaWbnbPoolReleaseReviewTtyTransportForTestsOnly(
        ttyEvents(valid),
        TTY_NONCE,
        TTY_STARTED_AT,
        TTY_NOT_AFTER + 1
      )
    ).toBeNull();
    const decreasingClockEvents = lines.map((line, index) =>
      Object.freeze({
        bytes: Buffer.from(`${line}\n`, "ascii"),
        observedAtMilliseconds: TTY_STARTED_AT + 100 - index
      })
    );
    expect(
      decodeBscTestnetPtaWbnbPoolReleaseReviewTtyTransportForTestsOnly(
        decreasingClockEvents,
        TTY_NONCE,
        TTY_STARTED_AT,
        TTY_NOT_AFTER
      )
    ).toBeNull();
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
