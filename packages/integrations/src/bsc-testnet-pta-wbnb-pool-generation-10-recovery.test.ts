import type { Hex } from "viem";
import type * as ViemModule from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof ViemModule>();
  return {
    ...original,
    keccak256: vi.fn((value: Hex) =>
      value === "0x01"
        ? "0xa24d1dfa3440de3fcb644d9b52847bcc8d54f43a2e29b425f50bbce4bd684022"
        : original.keccak256(value)
    ),
    parseTransaction: vi.fn((value: Hex) =>
      value === "0x01"
        ? {
            type: "legacy",
            chainId: 97,
            nonce: 9,
            to: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
            data: "0x13ead5620000000000000000000000004ed64525d6fb06b7da926c683cbd809632c9b4cc000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd00000000000000000000000000000000000000000000000000000000000001f40000000000000000000000000000000000000000004189374bc6a7ef9db22d0e",
            gas: 6_600_000n,
            gasPrice: 100_000_000n,
            value: 0n
          }
        : original.parseTransaction(value)
    ),
    recoverTransactionAddress: vi.fn(async () => "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49")
  };
});

import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ATTEMPT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_AUTHORIZATION_RECEIPT_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_CLAIM_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ENVELOPE_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_OWNER_AUTHORIZATION_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RELEASE_COMMIT,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_REVIEWER_APPROVAL_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RUNTIME_MANIFEST_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SERIALIZED_UNSIGNED_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_TERMINAL_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_SIGNING_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
  inspectBscTestnetPtaWbnbPoolGeneration10PredecessorForInternalUse
} from "./bsc-testnet-pta-wbnb-pool-generation-10-recovery";
import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

function fixture() {
  const transaction = Object.freeze({
    type: "legacy" as const,
    chainId: "97" as const,
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    nonce: "9" as const,
    valueWei: "0" as const,
    gasLimit: "6600000",
    gasPriceWei: "100000000",
    maximumCostWei: "660000000000000",
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    signingHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_SIGNING_HASH,
    signedTransaction: "0x01" as Hex,
    transactionHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
    recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
  });
  const capability = Object.freeze({
    claimId: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_CLAIM_ID,
    envelopeHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ENVELOPE_HASH,
    releaseCommit: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RELEASE_COMMIT,
    runtimeManifestSha256:
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RUNTIME_MANIFEST_SHA256,
    reviewerApprovalDigest:
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_REVIEWER_APPROVAL_DIGEST,
    ownerAuthorizationDigest:
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_OWNER_AUTHORIZATION_DIGEST,
    recovery: Object.freeze({
      generation: 9,
      predecessorState: "failed_before_worker",
      predecessorTerminalRawSha256:
        BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_TERMINAL_RAW_SHA256,
      attemptId: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ATTEMPT_ID
    }),
    transaction
  });
  return {
    local: {
      status: "opened",
      state: {
        status: "signed_committed",
        claimId: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_CLAIM_ID,
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
        envelopeHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ENVELOPE_HASH,
        authorizationReceiptSha256:
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_AUTHORIZATION_RECEIPT_SHA256,
        serializedUnsignedSha256:
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SERIALIZED_UNSIGNED_SHA256,
        reviewerApprovalDigest:
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_REVIEWER_APPROVAL_DIGEST,
        ownerAuthorizationDigest:
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_OWNER_AUTHORIZATION_DIGEST,
        releaseCommit: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RELEASE_COMMIT,
        runtimeManifestSha256:
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_RUNTIME_MANIFEST_SHA256,
        generation: 9,
        predecessorState: "failed_before_worker",
        predecessorTerminalRawSha256:
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_TERMINAL_RAW_SHA256,
        attemptId: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_ATTEMPT_ID,
        gasLimit: "6600000",
        gasPriceWei: "100000000",
        maxCostWei: "660000000000000",
        signingHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_SIGNING_HASH,
        transactionHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
        serializedTransaction: "0x01"
      }
    },
    submission: {
      status: "opened",
      state: {
        state: "signed_committed",
        capability,
        signedCommitSha256:
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
        submissionStartedRecordSha256: null,
        reconciliationDigest: null,
        journalEvidenceOnly: true,
        authorityReauthenticationRequired: true,
        sendingAuthorizedByJournal: false
      }
    },
    hashes: {
      status: "ready",
      records: [
        {
          name: "01-claim.v9.json",
          byteLength: 1364,
          sha256: "0xe8812a8fadad8d092965c470a50fed3baf8f901de1c2e7ad8bef75e0b26380d0"
        },
        {
          name: "02-transition.v9.json",
          byteLength: 1402,
          sha256: "0xf99f5c405598ba2d0f52e53beabcd8297c2a45d266d04745a0422077473be5ea"
        },
        {
          name: "03-transition.v9.json",
          byteLength: 1399,
          sha256: "0x480c3933e3b4b4fa7eb7758a6057dd5d715b6c12f054dd9e32ad13a8cb15e852"
        },
        {
          name: "04-transition.v9.json",
          byteLength: 1956,
          sha256: "0xf6e4754a2d5789c91acd4e159a14208d12bdbc1bc187d5c24144cc7c89c01cf2"
        }
      ]
    }
  };
}

describe("generation-10 immutable signed predecessor", () => {
  it("accepts only the exact four local records plus the signed-without-start submission state", async () => {
    const value = fixture();
    const result = await inspectBscTestnetPtaWbnbPoolGeneration10PredecessorForInternalUse(
      value.local as never,
      value.submission as never,
      value.hashes as never
    );
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.binding).toMatchObject({
        state: "signed_committed_without_submission_started",
        transactionHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
        newSignatureAuthorized: false,
        maximumAdditionalSignatures: "0"
      });
      expect(result.capability.transaction.signedTransaction).toBe("0x01");
    }
  });

  it("rejects any local record hash mutation", async () => {
    const value = fixture();
    const signedRecord = value.hashes.records[3];
    if (signedRecord === undefined) throw new Error("Expected the signed predecessor record");
    signedRecord.sha256 = `0x${"00".repeat(32)}`;
    const result = await inspectBscTestnetPtaWbnbPoolGeneration10PredecessorForInternalUse(
      value.local as never,
      value.submission as never,
      value.hashes as never
    );
    expect(result).toMatchObject({
      status: "blocked",
      issue: { code: "GENERATION_9_SIGNED_PREDECESSOR_INVALID" }
    });
  });
});
