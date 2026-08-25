import { keccak256, serializeTransaction, type Hex } from "viem";
import type * as ViemModule from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof ViemModule>();
  return {
    ...original,
    recoverTransactionAddress: vi.fn(async () => "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49")
  };
});
vi.mock("./bsc-testnet-pta-wbnb-pool-signing-worker", () => ({
  authenticateBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse: vi.fn(() => false)
}));

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BscTestnetPtaWbnbPoolPrivateBroadcastFailure,
  createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests,
  type BscTestnetPtaWbnbPoolPrivateBroadcasterTestScenario
} from "./bsc-testnet-pta-wbnb-pool-private-broadcaster.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
  deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse,
  type BscTestnetPtaWbnbPoolSubmissionCapability
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V9_POLICY,
  type BscTestnetPtaWbnbPoolSubmissionRecoveryState
} from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";

const NOW = "2026-08-13T08:00:20.000Z";
const PRIVATE_KEY = `0x${"11".repeat(32)}` as Hex;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

async function capability(): Promise<BscTestnetPtaWbnbPoolSubmissionCapability> {
  const authenticatedAt = NOW;
  const expiresAt = "2026-08-13T08:01:05.000Z";
  const gasLimit = 5_983_857n;
  const gasPriceWei = 100_000_000n;
  const transaction = {
    chainId: 97,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    gas: gasLimit,
    gasPrice: gasPriceWei,
    nonce: 9,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    type: "legacy" as const,
    value: 0n
  };
  const unsigned = serializeTransaction(transaction);
  const signedTransaction = await privateKeyToAccount(PRIVATE_KEY).signTransaction(transaction);
  return Object.freeze({
    schemaVersion: 8,
    scope: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
    oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: "claim-private-broadcast-1",
    envelopeHash: `0x${"11".repeat(32)}`,
    reviewerApprovalDigest: `0x${"22".repeat(32)}`,
    ownerAuthorizationDigest: `0x${"33".repeat(32)}`,
    releaseCommit: "1".repeat(40),
    runtimeManifestSha256: `0x${"44".repeat(32)}`,
    recovery: Object.freeze({
      generation: 8,
      predecessorState: "failed_before_worker",
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256,
      attemptId: `0x${"46".repeat(32)}`
    }),
    authenticatedAt,
    expiresAt,
    signedCommitDurablyVerified: true,
    freshPreSubmissionDualRpcRecheckPerformed: true,
    preSubmission: Object.freeze({
      primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
      corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
      providerAgreementVerified: true,
      canonicalFinalizedBlockVerified: true,
      finalizedAnchorDualProviderExactNumberVerified: true,
      observedAt: authenticatedAt,
      finalizedBlockNumber: "100",
      finalizedBlockHash: `0x${"55".repeat(32)}`,
      finalizedBlockTimestamp: "1786608010",
      finalizedBlockGasLimit: "140000000",
      latestNonce: "9",
      pendingNonce: "9",
      transactionByHash: null,
      receiptByHash: null,
      factoryPoolForward: ZERO_ADDRESS,
      factoryPoolReverse: ZERO_ADDRESS,
      candidateCode: "0x",
      candidateNonce: "0",
      senderCode: "0x",
      senderBalanceWei: "100000000000000000",
      gasEstimate: "4986547",
      gasPriceWei: gasPriceWei.toString(),
      simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
    }),
    transaction: Object.freeze({
      type: "legacy",
      chainId: "97",
      from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      nonce: "9",
      valueWei: "0",
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPriceWei.toString(),
      maximumCostWei: (gasLimit * gasPriceWei).toString(),
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      signingHash: keccak256(unsigned),
      signedTransaction,
      transactionHash: keccak256(signedTransaction),
      recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
    })
  });
}

async function scenario(
  overrides: Partial<BscTestnetPtaWbnbPoolPrivateBroadcasterTestScenario> = {}
): Promise<BscTestnetPtaWbnbPoolPrivateBroadcasterTestScenario> {
  const cap = await capability();
  const derived = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
    cap,
    new Date(NOW)
  );
  if (derived === null) throw new Error("Synthetic capability invalid.");
  const recovery: BscTestnetPtaWbnbPoolSubmissionRecoveryState = Object.freeze({
    schemaVersion: 8,
    journalSchema: "bsc_testnet_pta_wbnb_pool_submission_journal_v9",
    state: "submission_started",
    ownerAuthorizationPolicy: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V9_POLICY,
    capability: cap,
    signedCommitSha256: `0x${"66".repeat(32)}`,
    submissionStartedRecordSha256: `0x${"77".repeat(32)}`,
    reconciliationDigest: null,
    journalEvidenceOnly: true,
    authorityReauthenticationRequired: true,
    sendingAuthorizedByJournal: false
  });
  return {
    now: NOW,
    recoveryState: recovery,
    journalState: Object.freeze({ ...derived, state: "submission_started" as const }),
    terminalPreSubmission: Object.freeze({
      ...cap.preSubmission,
      observedAt: NOW,
      finalizedBlockTimestamp: "1786608020"
    }),
    authorityOutcome: "accept",
    transportOutcome: "exact_hash",
    ...overrides
  };
}

describe("PTA/WBNB closure-private one-send broadcaster", () => {
  const afterTerminalObservation = (offsetMilliseconds: number): string =>
    new Date(Date.parse(NOW) + offsetMilliseconds).toISOString();

  const arm = async (
    realm: ReturnType<typeof createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests>,
    recovery: BscTestnetPtaWbnbPoolSubmissionRecoveryState,
    cap: object = realm.executionCapability
  ) => {
    if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
    return realm.broadcaster.acquireTerminalPreSendRecheck(
      cap,
      Object.freeze({
        transactionHash: recovery.capability.transaction.transactionHash,
        gasLimit: recovery.capability.transaction.gasLimit,
        gasPriceWei: recovery.capability.transaction.gasPriceWei
      })
    );
  };

  it("reads durable started state, performs terminal recheck, consumes authority, then sends once", async () => {
    const input = await scenario();
    const recovery = input.recoveryState;
    if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
    const realm = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests(input);

    await arm(realm, recovery);
    await expect(
      realm.broadcaster.sendExactRawTransactionOnce(
        realm.executionCapability,
        recovery.capability.transaction.signedTransaction
      )
    ).resolves.toMatch(/^0x[0-9a-f]{64}$/u);
    expect(realm.audit()).toEqual({ preflightCalls: 1, authorityCalls: 1, transportCalls: 1 });
    await expect(
      realm.broadcaster.sendExactRawTransactionOnce(
        realm.executionCapability,
        recovery.capability.transaction.signedTransaction
      )
    ).rejects.toMatchObject({ code: "PRIVATE_BROADCASTER_ALREADY_USED" });
    expect(realm.audit()).toEqual({ preflightCalls: 1, authorityCalls: 1, transportCalls: 1 });
  });

  it.each([29_999, 30_000])(
    "accepts terminal pre-send evidence at the inclusive freshness boundary (%i ms)",
    async (offsetMilliseconds) => {
      const instant = afterTerminalObservation(offsetMilliseconds);
      const input = await scenario({ nowSequence: [NOW, NOW, instant, instant] });
      const recovery = input.recoveryState;
      if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
      const realm = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests(input);

      await arm(realm, recovery);
      await expect(
        realm.broadcaster.sendExactRawTransactionOnce(
          realm.executionCapability,
          recovery.capability.transaction.signedTransaction
        )
      ).resolves.toBe(recovery.capability.transaction.transactionHash);
      expect(realm.audit()).toEqual({ preflightCalls: 1, authorityCalls: 1, transportCalls: 1 });
    }
  );

  it.each([30_001, 31_000, 44_000])(
    "rejects stale terminal evidence before authority consumption or raw send (%i ms)",
    async (offsetMilliseconds) => {
      const instant = afterTerminalObservation(offsetMilliseconds);
      const input = await scenario({ nowSequence: [NOW, NOW, instant, instant] });
      const recovery = input.recoveryState;
      if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
      const realm = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests(input);

      await arm(realm, recovery);
      await expect(
        realm.broadcaster.sendExactRawTransactionOnce(
          realm.executionCapability,
          recovery.capability.transaction.signedTransaction
        )
      ).rejects.toMatchObject({ code: "TERMINAL_PRE_SEND_RECHECK_INVALID" });
      expect(realm.audit()).toEqual({ preflightCalls: 1, authorityCalls: 0, transportCalls: 0 });
    }
  );

  it("rechecks freshness after authority consumption and blocks a final clock jump before raw send", async () => {
    const input = await scenario({
      nowSequence: [NOW, NOW, afterTerminalObservation(30_000), afterTerminalObservation(30_001)]
    });
    const recovery = input.recoveryState;
    if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
    const realm = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests(input);

    await arm(realm, recovery);
    await expect(
      realm.broadcaster.sendExactRawTransactionOnce(
        realm.executionCapability,
        recovery.capability.transaction.signedTransaction
      )
    ).rejects.toMatchObject({ code: "TERMINAL_PRE_SEND_RECHECK_INVALID" });
    expect(realm.audit()).toEqual({ preflightCalls: 1, authorityCalls: 1, transportCalls: 0 });
  });

  it("does not treat signed bytes or a durable journal as broadcast authority", async () => {
    const base = await scenario();
    const recovery = base.recoveryState;
    if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
    const realm = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests({
      ...base,
      recoveryState: { ...recovery, state: "signed_committed" }
    });

    await expect(arm(realm, recovery)).rejects.toMatchObject({
      code: "DURABLE_SUBMISSION_STATE_INVALID"
    });
    expect(realm.audit()).toEqual({ preflightCalls: 0, authorityCalls: 0, transportCalls: 0 });
  });

  it("rejects a replayed recovery attempt before terminal RPC or authority consumption", async () => {
    const base = await scenario();
    const recovery = base.recoveryState;
    if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
    const replayedRecovery = Object.freeze({
      ...recovery,
      capability: Object.freeze({
        ...recovery.capability,
        recovery: Object.freeze({
          ...recovery.capability.recovery,
          attemptId: `0x${"fe".repeat(32)}` as const
        })
      })
    });
    const realm = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests({
      ...base,
      recoveryState: replayedRecovery
    });

    await expect(arm(realm, replayedRecovery)).rejects.toMatchObject({
      code: "DURABLE_SUBMISSION_STATE_INVALID"
    });
    expect(realm.audit()).toEqual({ preflightCalls: 0, authorityCalls: 0, transportCalls: 0 });
  });

  it("fails before authority consumption on any terminal dual-RPC drift", async () => {
    const base = await scenario();
    const terminal =
      base.terminalPreSubmission as BscTestnetPtaWbnbPoolSubmissionCapability["preSubmission"];
    const realm = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests({
      ...base,
      terminalPreSubmission: Object.freeze({ ...terminal, pendingNonce: "2" })
    });

    await expect(arm(realm, base.recoveryState)).rejects.toMatchObject({
      code: "TERMINAL_PRE_SEND_RECHECK_INVALID"
    });
    expect(realm.audit()).toEqual({ preflightCalls: 1, authorityCalls: 0, transportCalls: 0 });
  });

  it("rejects a forged capability before the network and burns the broadcaster instance", async () => {
    const input = await scenario();
    const recovery = input.recoveryState;
    if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
    const realm = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests(input);
    const forgedCapability = Object.freeze({});
    await arm(realm, recovery, forgedCapability);
    await expect(
      realm.broadcaster.sendExactRawTransactionOnce(
        forgedCapability,
        recovery.capability.transaction.signedTransaction
      )
    ).rejects.toMatchObject({ code: "PRIVATE_BROADCAST_AUTHORITY_REJECTED" });
    expect(realm.audit()).toEqual({ preflightCalls: 1, authorityCalls: 1, transportCalls: 0 });
    await expect(
      realm.broadcaster.sendExactRawTransactionOnce(
        realm.executionCapability,
        recovery.capability.transaction.signedTransaction
      )
    ).rejects.toMatchObject({ code: "PRIVATE_BROADCASTER_ALREADY_USED" });
  });

  it("cannot send before arming and rejects raw-byte substitution before authority consumption", async () => {
    const input = await scenario();
    const recovery = input.recoveryState;
    if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
    const unarmed = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests(input);
    await expect(
      unarmed.broadcaster.sendExactRawTransactionOnce(
        unarmed.executionCapability,
        recovery.capability.transaction.signedTransaction
      )
    ).rejects.toMatchObject({ code: "PRIVATE_BROADCASTER_NOT_ARMED" });
    expect(unarmed.audit()).toEqual({ preflightCalls: 0, authorityCalls: 0, transportCalls: 0 });

    const armed = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests(input);
    await arm(armed, recovery);
    await expect(
      armed.broadcaster.sendExactRawTransactionOnce(
        armed.executionCapability,
        `0x${"01".repeat(32)}`
      )
    ).rejects.toMatchObject({ code: "PRIVATE_BROADCAST_AUTHORITY_REJECTED" });
    expect(armed.audit()).toEqual({ preflightCalls: 1, authorityCalls: 0, transportCalls: 0 });
  });

  it("makes a wrong RPC result terminally ambiguous and never offers retry", async () => {
    const input = await scenario({ transportOutcome: "wrong_hash" });
    const recovery = input.recoveryState;
    if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
    const realm = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests(input);

    await arm(realm, recovery);
    await expect(
      realm.broadcaster.sendExactRawTransactionOnce(
        realm.executionCapability,
        recovery.capability.transaction.signedTransaction
      )
    ).rejects.toMatchObject({
      code: "PRIVATE_BROADCAST_OUTCOME_UNKNOWN",
      retryBroadcastAllowed: false,
      submissionOutcomeUnknown: true
    });
    expect(realm.audit()).toEqual({ preflightCalls: 1, authorityCalls: 1, transportCalls: 1 });
  });

  it("preserves the original owner expiry instead of refreshing it from RPC time", async () => {
    const base = await scenario();
    const recovery = base.recoveryState;
    if (recovery.state !== "submission_started") throw new Error("Fixture drifted.");
    const realm = createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests({
      ...base,
      now: recovery.capability.expiresAt
    });

    await expect(arm(realm, recovery)).rejects.toMatchObject({
      code: "OWNER_AUTHORIZATION_EXPIRED"
    });
    expect(realm.audit()).toEqual({ preflightCalls: 0, authorityCalls: 0, transportCalls: 0 });
  });

  it("exposes no caller-selected RPC, journal, expected hash, transport, or authenticator", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(
        new URL("./bsc-testnet-pta-wbnb-pool-private-broadcaster.server.ts", import.meta.url),
        "utf8"
      )
    );
    expect(source).toContain("readonly acquireTerminalPreSendRecheck: (");
    expect(source).toContain("readonly sendExactRawTransactionOnce: (");
    expect(source).not.toContain("authenticateSubmissionCapability");
    expect(source).toContain('method: "eth_sendRawTransaction"');
    expect(source).toContain("BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN");
    expect(BscTestnetPtaWbnbPoolPrivateBroadcastFailure).toBeTypeOf("function");
  });
});
