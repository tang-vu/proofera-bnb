import { createHash } from "node:crypto";

import {
  getAddress,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type Hex,
  type TransactionSerialized
} from "viem";

import {
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import type {
  BscTestnetPtaWbnbPoolExistingLocalJournalResult,
  BscTestnetPtaWbnbPoolGeneration9RecordHashProbeResult
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import type {
  BscTestnetPtaWbnbPoolExistingSubmissionJournalResult,
  BscTestnetPtaWbnbPoolSubmissionRecoveryState
} from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";
import type { BscTestnetPtaWbnbPoolSubmissionCapability } from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";

export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10 = 10 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH =
  "0xa24d1dfa3440de3fcb644d9b52847bcc8d54f43a2e29b425f50bbce4bd684022" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_SIGNING_HASH =
  "0x9a0723fa13311288c76ed4bb2c51363e4b9299704a2380d44b5c58a87b5344c7" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256 =
  "0x07766be2bd9e7b75cb6ed4a6078a6966e995d45c166f013c2ae0cffacf5f8b56" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RELEASE_COMMIT =
  "d8f406eb5031502dab55d183c4702a5f9f52d318" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RUNTIME_MANIFEST_SHA256 =
  "0x3db315a2687b89ce39e1878d4d3d6aac80b977714bd96d74e01af668320e1558" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_CLAIM_ID =
  "pta-wbnb-pool-v9-ba5b693524eefa9b17e0d194d18ee9c0" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ENVELOPE_HASH =
  "0xfa801ef0610cf4f5b3576161d26a40b4fc02717dd9714a64bdff6a72db4caaea" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_OWNER_AUTHORIZATION_DIGEST =
  "0xbc036d95fb9cc7c703c665f1240fbd4a093cca8c470e6b8e281afaccd2c88345" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_REVIEWER_APPROVAL_DIGEST =
  "0xdbf041406cc0d7a39d2f606fbbb7e194cfa4fb36e8061b0c458c3a2f0387d855" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_AUTHORIZATION_RECEIPT_SHA256 =
  "0x2cff904f2b19a049c9bfa9bba5739505d2c393609b9184718316477d6b6c6531" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SERIALIZED_UNSIGNED_SHA256 =
  "0x235d8d1264a66fca75cd46e9704a51e7d1e8d2d442ebe22a8ff516cbddc3c48b" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ATTEMPT_ID =
  "0x6ef79cad62e2fb7ddc93f4682fa2fe3c5734641a7a1eb61bd97c524de91c55d0" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_TERMINAL_RAW_SHA256 =
  "0x3210fd8ab08c2282a5da1aeb426984592fed9a5b3a6832ac7d60991baaf4fc6d" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT = "6600000" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI = "100000000" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI = "660000000000000" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_BUNDLE_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.existing-signature-predecessor.v10" as const;

const EXPECTED_LOCAL_RECORDS = Object.freeze([
  Object.freeze({
    name: "01-claim.v9.json",
    byteLength: 1364,
    sha256: "0xe8812a8fadad8d092965c470a50fed3baf8f901de1c2e7ad8bef75e0b26380d0" as Hex
  }),
  Object.freeze({
    name: "02-transition.v9.json",
    byteLength: 1402,
    sha256: "0xf99f5c405598ba2d0f52e53beabcd8297c2a45d266d04745a0422077473be5ea" as Hex
  }),
  Object.freeze({
    name: "03-transition.v9.json",
    byteLength: 1399,
    sha256: "0x480c3933e3b4b4fa7eb7758a6057dd5d715b6c12f054dd9e32ad13a8cb15e852" as Hex
  }),
  Object.freeze({
    name: "04-transition.v9.json",
    byteLength: 1956,
    sha256: "0xf6e4754a2d5789c91acd4e159a14208d12bdbc1bc187d5c24144cc7c89c01cf2" as Hex
  })
]);

export interface BscTestnetPtaWbnbPoolGeneration10PredecessorBinding {
  readonly generation: 9;
  readonly state: "signed_committed_without_submission_started";
  readonly claimId: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_CLAIM_ID;
  readonly releaseCommit: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RELEASE_COMMIT;
  readonly runtimeManifestSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RUNTIME_MANIFEST_SHA256;
  readonly envelopeHash: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ENVELOPE_HASH;
  readonly attemptId: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ATTEMPT_ID;
  readonly transactionHash: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH;
  readonly signingHash: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_SIGNING_HASH;
  readonly signedTransactionKeccak256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH;
  readonly signedCommitSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256;
  readonly gasLimit: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT;
  readonly gasPriceWei: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI;
  readonly maximumCostWei: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI;
  readonly localRecordHashes: typeof EXPECTED_LOCAL_RECORDS;
  readonly predecessorBundleDigest: Hex;
  readonly newSignatureAuthorized: false;
  readonly maximumAdditionalSignatures: "0";
}

export type BscTestnetPtaWbnbPoolGeneration10PredecessorInspection =
  | Readonly<{
      status: "ready";
      binding: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding;
      capability: BscTestnetPtaWbnbPoolSubmissionCapability;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      binding: null;
      capability: null;
      issue: Readonly<{ code: "GENERATION_9_SIGNED_PREDECESSOR_INVALID"; message: string }>;
    }>;

function exactLocalRecords(probe: BscTestnetPtaWbnbPoolGeneration9RecordHashProbeResult): boolean {
  return (
    probe.status === "ready" &&
    probe.records.length === EXPECTED_LOCAL_RECORDS.length &&
    probe.records.every((record, index) => {
      const expected = EXPECTED_LOCAL_RECORDS[index];
      return (
        expected !== undefined &&
        record.name === expected.name &&
        record.byteLength === expected.byteLength &&
        record.sha256 === expected.sha256
      );
    })
  );
}

function exactSubmissionState(input: BscTestnetPtaWbnbPoolSubmissionRecoveryState): boolean {
  return (
    input.state === "signed_committed" &&
    input.signedCommitSha256 ===
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256 &&
    input.submissionStartedRecordSha256 === null &&
    input.reconciliationDigest === null &&
    input.journalEvidenceOnly === true &&
    input.authorityReauthenticationRequired === true &&
    input.sendingAuthorizedByJournal === false
  );
}

function deriveBindingDigest(body: object): Hex {
  return `0x${createHash("sha256")
    .update(`${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_BUNDLE_DIGEST_DOMAIN}\0`, "utf8")
    .update(JSON.stringify(body), "utf8")
    .digest("hex")}` as Hex;
}

export async function inspectBscTestnetPtaWbnbPoolGeneration10PredecessorForInternalUse(
  local: BscTestnetPtaWbnbPoolExistingLocalJournalResult,
  submission: BscTestnetPtaWbnbPoolExistingSubmissionJournalResult,
  localHashes: BscTestnetPtaWbnbPoolGeneration9RecordHashProbeResult
): Promise<BscTestnetPtaWbnbPoolGeneration10PredecessorInspection> {
  const blocked = (): BscTestnetPtaWbnbPoolGeneration10PredecessorInspection =>
    Object.freeze({
      status: "blocked" as const,
      binding: null,
      capability: null,
      issue: Object.freeze({
        code: "GENERATION_9_SIGNED_PREDECESSOR_INVALID" as const,
        message:
          "The immutable generation-9 signed transaction and pre-submission journal do not form the exact recovery predecessor."
      })
    });
  if (
    local.status !== "opened" ||
    submission.status !== "opened" ||
    !exactLocalRecords(localHashes) ||
    !exactSubmissionState(submission.state) ||
    submission.state.state !== "signed_committed"
  ) {
    return blocked();
  }
  const state = local.state;
  const capability = submission.state.capability;
  if (
    state.status !== "signed_committed" ||
    state.claimId !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_CLAIM_ID ||
    state.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    state.envelopeHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ENVELOPE_HASH ||
    state.authorizationReceiptSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_AUTHORIZATION_RECEIPT_SHA256 ||
    state.serializedUnsignedSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SERIALIZED_UNSIGNED_SHA256 ||
    state.reviewerApprovalDigest !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_REVIEWER_APPROVAL_DIGEST ||
    state.ownerAuthorizationDigest !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_OWNER_AUTHORIZATION_DIGEST ||
    state.releaseCommit !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RELEASE_COMMIT ||
    state.runtimeManifestSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RUNTIME_MANIFEST_SHA256 ||
    state.generation !== 9 ||
    state.predecessorState !== "failed_before_worker" ||
    state.predecessorTerminalRawSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_TERMINAL_RAW_SHA256 ||
    state.attemptId !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ATTEMPT_ID ||
    state.gasLimit !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT ||
    state.gasPriceWei !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI ||
    state.maxCostWei !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI ||
    state.signingHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_SIGNING_HASH ||
    state.transactionHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH ||
    state.serializedTransaction !== capability.transaction.signedTransaction ||
    capability.claimId !== state.claimId ||
    capability.envelopeHash !== state.envelopeHash ||
    capability.releaseCommit !== state.releaseCommit ||
    capability.runtimeManifestSha256 !== state.runtimeManifestSha256 ||
    capability.reviewerApprovalDigest !== state.reviewerApprovalDigest ||
    capability.ownerAuthorizationDigest !== state.ownerAuthorizationDigest ||
    capability.recovery.generation !== 9 ||
    capability.recovery.predecessorState !== "failed_before_worker" ||
    capability.recovery.predecessorTerminalRawSha256 !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_TERMINAL_RAW_SHA256 ||
    capability.recovery.attemptId !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ATTEMPT_ID ||
    capability.transaction.chainId !== "97" ||
    capability.transaction.from !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    capability.transaction.recoveredSigner !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    capability.transaction.to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
    capability.transaction.nonce !== "9" ||
    capability.transaction.valueWei !== "0" ||
    capability.transaction.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
    capability.transaction.gasLimit !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT ||
    capability.transaction.gasPriceWei !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI ||
    capability.transaction.maximumCostWei !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI ||
    capability.transaction.signingHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_SIGNING_HASH ||
    capability.transaction.transactionHash !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH ||
    keccak256(capability.transaction.signedTransaction) !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH
  ) {
    return blocked();
  }
  try {
    const parsed = parseTransaction(capability.transaction.signedTransaction);
    const recovered = getAddress(
      await recoverTransactionAddress({
        serializedTransaction: capability.transaction.signedTransaction as TransactionSerialized
      })
    );
    if (
      parsed.type !== "legacy" ||
      parsed.chainId !== 97 ||
      parsed.nonce !== 9 ||
      parsed.to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
      parsed.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
      parsed.gas !== 6_600_000n ||
      parsed.gasPrice !== 100_000_000n ||
      (parsed.value ?? 0n) !== 0n ||
      recovered !== BSC_TESTNET_PTA_WBNB_POOL_SENDER
    ) {
      return blocked();
    }
  } catch {
    return blocked();
  }
  const body = Object.freeze({
    generation: 9 as const,
    state: "signed_committed_without_submission_started" as const,
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
    localRecordHashes: EXPECTED_LOCAL_RECORDS,
    newSignatureAuthorized: false as const,
    maximumAdditionalSignatures: "0" as const
  });
  const binding = Object.freeze({
    ...body,
    predecessorBundleDigest: deriveBindingDigest(body)
  });
  return Object.freeze({ status: "ready" as const, binding, capability, issue: null });
}
