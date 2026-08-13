import { readFileSync } from "node:fs";

import {
  encodeAbiParameters,
  hexToBytes,
  keccak256,
  serializeTransaction,
  stringToHex,
  type Hex
} from "viem";
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

import {
  BSC_TESTNET_PANCAKE_V3_FACTORY,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96,
  BSC_TESTNET_WBNB_ADDRESS
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_CREATED_TOPIC,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_MAX_LIQUIDITY_PER_TICK,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_TICK,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZE_TOPIC,
  BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
  BscTestnetPtaWbnbPoolProductionSubmissionUnavailableError,
  createBscTestnetPtaWbnbPoolSubmissionCoreForTests,
  createProductionBscTestnetPtaWbnbPoolSubmissionCore,
  reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse,
  type BscTestnetPtaWbnbPoolPostState,
  type BscTestnetPtaWbnbPoolProviderReconciliationEvidence,
  type BscTestnetPtaWbnbPoolReconciliationEvidence,
  type BscTestnetPtaWbnbPoolSubmissionCapability,
  type BscTestnetPtaWbnbPoolSubmissionTestDependencies
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";

const NOW = "2026-08-13T08:00:20.000Z";
const PRIVATE_KEY = `0x${"11".repeat(32)}` as Hex;
const RELEASE_COMMIT = "00f21c405881a5dc320bddf3c757ba13599b1e71";
const ENVELOPE_HASH = `0x${"11".repeat(32)}` as Hex;
const REVIEWER_DIGEST = `0x${"22".repeat(32)}` as Hex;
const OWNER_DIGEST = `0x${"33".repeat(32)}` as Hex;
const MANIFEST_DIGEST = `0x${"44".repeat(32)}` as Hex;
const RECEIPT_BLOCK_HASH = `0x${"aa".repeat(32)}` as Hex;
const RECEIPT_PARENT_HASH = `0x${"bb".repeat(32)}` as Hex;
const FINALIZED_BLOCK_HASH = `0x${"cc".repeat(32)}` as Hex;
const FINALIZED_PARENT_HASH = RECEIPT_BLOCK_HASH;
const ZERO_WORD = `0x${"00".repeat(32)}` as Hex;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const POOL_CREATED_DATA = encodeAbiParameters(
  [{ type: "int24" }, { type: "address" }],
  [10, BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE]
);
const INITIALIZE_DATA = encodeAbiParameters(
  [{ type: "uint160" }, { type: "int24" }],
  [BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96, BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_TICK]
);
const TOKEN0_TOPIC = encodeAbiParameters([{ type: "address" }], [BSC_TESTNET_PTA_ADDRESS]);
const TOKEN1_TOPIC = encodeAbiParameters([{ type: "address" }], [BSC_TESTNET_WBNB_ADDRESS]);
const FEE_TOPIC = encodeAbiParameters([{ type: "uint24" }], [500]);

function logsBloom(logs: readonly Readonly<{ address: string; topics: readonly Hex[] }>[]): Hex {
  const bloom = new Uint8Array(256);
  for (const log of logs) {
    for (const value of [log.address as Hex, ...log.topics]) {
      const hash = hexToBytes(keccak256(value));
      for (let offset = 0; offset < 6; offset += 2) {
        const high = hash[offset];
        const low = hash[offset + 1];
        if (high === undefined || low === undefined) throw new Error("Keccak digest truncated.");
        const bit = ((high << 8) | low) & 2_047;
        const byteIndex = 255 - Math.floor(bit / 8);
        const current = bloom[byteIndex];
        if (current === undefined) throw new Error("Bloom bit out of range.");
        bloom[byteIndex] = current | (1 << (bit % 8));
      }
    }
  }
  return `0x${Array.from(bloom, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

interface RetainedPoolArtifact {
  readonly contracts: Readonly<{
    pool: Readonly<{
      runtimeTemplate: Hex;
      immutableReferences: Readonly<
        Record<string, readonly Readonly<{ length: number; start: number }>[]>
      >;
    }>;
  }>;
}

function expectedPoolRuntime(): Hex {
  const parsed: unknown = JSON.parse(
    readFileSync(
      new URL(
        "../../../evidence/development/pancake-v3-pool-init-code-artifacts-2026-08-13.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  const artifact = parsed as RetainedPoolArtifact;
  const words: Readonly<Record<string, string>> = Object.freeze({
    "78": BSC_TESTNET_PANCAKE_V3_FACTORY.slice(2).toLowerCase().padStart(64, "0"),
    "82": BSC_TESTNET_PTA_ADDRESS.slice(2).toLowerCase().padStart(64, "0"),
    "86": BSC_TESTNET_WBNB_ADDRESS.slice(2).toLowerCase().padStart(64, "0"),
    "90": BigInt(500).toString(16).padStart(64, "0"),
    "94": BigInt(10).toString(16).padStart(64, "0"),
    "98": BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_MAX_LIQUIDITY_PER_TICK.toString(16).padStart(64, "0")
  });
  let runtime = artifact.contracts.pool.runtimeTemplate.slice(2).toLowerCase();
  for (const [astId, references] of Object.entries(artifact.contracts.pool.immutableReferences)) {
    const replacement = words[astId];
    if (replacement === undefined) throw new Error(`Unexpected immutable AST id ${astId}.`);
    for (const reference of references) {
      if (reference.length !== 32) throw new Error("Immutable reference width drifted.");
      const offset = reference.start * 2;
      runtime = `${runtime.slice(0, offset)}${replacement}${runtime.slice(offset + 64)}`;
    }
  }
  return `0x${runtime}`;
}

const EXPECTED_POOL_RUNTIME = expectedPoolRuntime();

async function submissionCapability(
  times: Readonly<{
    authenticatedAt: string;
    expiresAt: string;
  }> = {
    authenticatedAt: "2026-08-13T08:00:10.000Z",
    expiresAt: "2026-08-13T08:00:40.000Z"
  }
): Promise<BscTestnetPtaWbnbPoolSubmissionCapability> {
  const gasLimit = 5_983_857n;
  const gasPrice = 100_000_000n;
  const unsigned = serializeTransaction({
    chainId: 97,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    gas: gasLimit,
    gasPrice,
    nonce: 1,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    type: "legacy",
    value: 0n
  });
  const signedTransaction = await privateKeyToAccount(PRIVATE_KEY).signTransaction({
    chainId: 97,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    gas: gasLimit,
    gasPrice,
    nonce: 1,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    type: "legacy",
    value: 0n
  });
  return Object.freeze({
    schemaVersion: 1,
    scope: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
    oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: "claim-pool-submission-001",
    envelopeHash: ENVELOPE_HASH,
    reviewerApprovalDigest: REVIEWER_DIGEST,
    ownerAuthorizationDigest: OWNER_DIGEST,
    releaseCommit: RELEASE_COMMIT,
    runtimeManifestSha256: MANIFEST_DIGEST,
    authenticatedAt: times.authenticatedAt,
    expiresAt: times.expiresAt,
    signedCommitDurablyVerified: true,
    freshPreSubmissionDualRpcRecheckPerformed: true,
    preSubmission: Object.freeze({
      primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
      corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
      providerAgreementVerified: true,
      canonicalFinalizedBlockVerified: true,
      eip1898RequireCanonical: true,
      observedAt: times.authenticatedAt,
      finalizedBlockNumber: "99",
      finalizedBlockHash: `0x${"55".repeat(32)}`,
      finalizedBlockTimestamp: Math.floor(Date.parse(times.authenticatedAt) / 1_000).toString(),
      finalizedBlockGasLimit: "140000000",
      latestNonce: "1",
      pendingNonce: "1",
      transactionByHash: null,
      receiptByHash: null,
      factoryPoolForward: ZERO_ADDRESS,
      factoryPoolReverse: ZERO_ADDRESS,
      candidateCode: "0x",
      candidateNonce: "0",
      senderCode: "0x",
      senderBalanceWei: "100000000000000000",
      gasEstimate: "4986547",
      gasPriceWei: gasPrice.toString(),
      simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
    }),
    transaction: Object.freeze({
      type: "legacy",
      chainId: "97",
      from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      nonce: "1",
      valueWei: "0",
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPrice.toString(),
      maximumCostWei: (gasLimit * gasPrice).toString(),
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      signingHash: keccak256(unsigned),
      signedTransaction,
      transactionHash: keccak256(signedTransaction),
      recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
    })
  });
}

function postState(): BscTestnetPtaWbnbPoolPostState {
  return {
    eip1898Block: { blockHash: FINALIZED_BLOCK_HASH, requireCanonical: true },
    factoryPoolForward: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
    factoryPoolReverse: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
    poolAccountNonce: "1",
    poolRuntimeCode: EXPECTED_POOL_RUNTIME,
    eip1967Slots: {
      implementation: ZERO_WORD,
      admin: ZERO_WORD,
      beacon: ZERO_WORD
    },
    pool: {
      factory: BSC_TESTNET_PANCAKE_V3_FACTORY,
      token0: BSC_TESTNET_PTA_ADDRESS,
      token1: BSC_TESTNET_WBNB_ADDRESS,
      fee: "500",
      tickSpacing: "10",
      maxLiquidityPerTick: "1917569901783203986719870431555990",
      liquidity: "0",
      lmPool: ZERO_ADDRESS,
      slot0: {
        sqrtPriceX96: "79228162514264337593543950",
        tick: "-138163",
        observationIndex: "0",
        observationCardinality: "1",
        observationCardinalityNext: "1",
        feeProtocol: "222825800",
        unlocked: true
      },
      observation0: {
        blockTimestamp: "1786588800",
        tickCumulative: "0",
        secondsPerLiquidityCumulativeX128: "0",
        initialized: true
      }
    }
  };
}

function providerEvidence(
  origin:
    | typeof BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN
    | typeof BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  capability: BscTestnetPtaWbnbPoolSubmissionCapability,
  state: BscTestnetPtaWbnbPoolPostState | null = postState()
): BscTestnetPtaWbnbPoolProviderReconciliationEvidence {
  const transactionHash = capability.transaction.transactionHash;
  const receiptBlock = {
    number: "100",
    hash: RECEIPT_BLOCK_HASH,
    parentHash: RECEIPT_PARENT_HASH,
    timestamp: "1786588800",
    transactionHashes: [transactionHash]
  } as const;
  const finalizedBlock = {
    number: "101",
    hash: FINALIZED_BLOCK_HASH,
    parentHash: FINALIZED_PARENT_HASH,
    timestamp: "1786588803",
    transactionHashes: []
  } as const;
  const logs = [
    {
      address: BSC_TESTNET_PANCAKE_V3_FACTORY,
      topics: [BSC_TESTNET_PTA_WBNB_POOL_CREATED_TOPIC, TOKEN0_TOPIC, TOKEN1_TOPIC, FEE_TOPIC],
      data: POOL_CREATED_DATA,
      blockHash: RECEIPT_BLOCK_HASH,
      blockNumber: "100",
      transactionHash,
      transactionIndex: "0",
      logIndex: "3",
      removed: false
    },
    {
      address: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
      topics: [BSC_TESTNET_PTA_WBNB_POOL_INITIALIZE_TOPIC],
      data: INITIALIZE_DATA,
      blockHash: RECEIPT_BLOCK_HASH,
      blockNumber: "100",
      transactionHash,
      transactionIndex: "0",
      logIndex: "4",
      removed: false
    }
  ] as const;
  return {
    origin,
    chainId: "97",
    transaction: {
      hash: transactionHash,
      type: "legacy",
      chainId: "97",
      from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      nonce: "1",
      valueWei: "0",
      gasLimit: capability.transaction.gasLimit,
      gasPriceWei: capability.transaction.gasPriceWei,
      input: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      blockHash: RECEIPT_BLOCK_HASH,
      blockNumber: "100",
      transactionIndex: "0"
    },
    receipt: {
      transactionHash,
      transactionIndex: "0",
      blockHash: RECEIPT_BLOCK_HASH,
      blockNumber: "100",
      from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      contractAddress: null,
      cumulativeGasUsed: "4900000",
      gasUsed: "4800000",
      effectiveGasPriceWei: capability.transaction.gasPriceWei,
      status: "1",
      type: "legacy",
      logsBloom: logsBloom(logs),
      logs
    },
    reportedFinalizedHead: finalizedBlock,
    commonFinalizedBlock: finalizedBlock,
    receiptBlockLookup: {
      method: "eth_getBlockByNumber",
      requestedBlockNumber: "100",
      includeFullTransactions: false,
      exactNumberCanonicalLookup: true
    },
    receiptBlock,
    postState: state
  };
}

function evidence(
  capability: BscTestnetPtaWbnbPoolSubmissionCapability
): BscTestnetPtaWbnbPoolReconciliationEvidence {
  return {
    schemaVersion: 1,
    operation: BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    transactionHash: capability.transaction.transactionHash,
    observedAt: NOW,
    primary: providerEvidence(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN, capability),
    corroborator: providerEvidence(BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN, capability)
  };
}

function journalState(
  capability: BscTestnetPtaWbnbPoolSubmissionCapability,
  state: "signed_committed" | "submission_started" = "signed_committed"
) {
  const body = Object.freeze({
    schemaVersion: 1,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: capability.claimId,
    envelopeHash: capability.envelopeHash,
    releaseCommit: capability.releaseCommit,
    runtimeManifestSha256: capability.runtimeManifestSha256,
    reviewerApprovalDigest: capability.reviewerApprovalDigest,
    ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
    signingHash: capability.transaction.signingHash,
    transactionHash: capability.transaction.transactionHash,
    signedTransactionKeccak256: keccak256(capability.transaction.signedTransaction)
  });
  return Object.freeze({
    schemaVersion: 1,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: capability.claimId,
    envelopeHash: capability.envelopeHash,
    releaseCommit: capability.releaseCommit,
    runtimeManifestSha256: capability.runtimeManifestSha256,
    reviewerApprovalDigest: capability.reviewerApprovalDigest,
    ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
    signingHash: capability.transaction.signingHash,
    transactionHash: capability.transaction.transactionHash,
    signedTransactionKeccak256: body.signedTransactionKeccak256,
    submissionStartedDigest: keccak256(
      stringToHex(
        `proofera.bsc-testnet.pta-wbnb-pool.submission-started.v1\u0000${JSON.stringify(body)}`
      )
    ),
    state
  });
}

function dependencies(
  capability: BscTestnetPtaWbnbPoolSubmissionCapability,
  reconciliationEvidence: unknown,
  overrides: Partial<BscTestnetPtaWbnbPoolSubmissionTestDependencies> = {}
) {
  const transactionHash = capability.transaction.transactionHash;
  const commitSubmissionStarted = vi.fn(async (request) => ({
    status: "started_by_this_call",
    submissionStartedDigest: request.submissionStartedDigest,
    transactionHash
  }));
  const commitTerminalReconciliation = vi.fn(async (request) => ({
    status: request.outcome,
    reconciliationDigest: request.reconciliationDigest,
    submissionStartedDigest: request.submissionStartedDigest,
    transactionHash
  }));
  return {
    now: () => new Date(NOW),
    acquireSubmissionCapability: async () => capability,
    authenticateSubmissionCapability: (candidate: unknown) => candidate === capability,
    journal: {
      readState: async () => journalState(capability),
      commitSubmissionStarted,
      commitTerminalReconciliation
    },
    sendExactRawTransactionOnce: vi.fn(async () => transactionHash),
    observeExactTransaction: vi.fn(async () => reconciliationEvidence),
    ...overrides
  } satisfies BscTestnetPtaWbnbPoolSubmissionTestDependencies;
}

function mutatePostState(
  value: BscTestnetPtaWbnbPoolReconciliationEvidence,
  mutate: (state: BscTestnetPtaWbnbPoolPostState) => unknown
): unknown {
  const primary = value.primary.postState;
  const corroborator = value.corroborator.postState;
  if (primary === null || corroborator === null) throw new Error("Post-state fixture missing.");
  return {
    ...value,
    primary: { ...value.primary, postState: mutate(primary) },
    corroborator: { ...value.corroborator, postState: mutate(corroborator) }
  };
}

describe("BSC testnet exact PTA/WBNB submission reconciler", () => {
  it("durably records submission_started before one send and terminal evidence before confirmed", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const ports = dependencies(capability, exactEvidence);
    const core = createBscTestnetPtaWbnbPoolSubmissionCoreForTests(ports);

    const result = await core.submitAndReconcileOnce();

    expect(result.status).toBe("confirmed");
    expect(ports.journal.commitSubmissionStarted).toHaveBeenCalledTimes(1);
    expect(ports.sendExactRawTransactionOnce).toHaveBeenCalledTimes(1);
    expect(ports.sendExactRawTransactionOnce).toHaveBeenCalledWith(
      capability.transaction.signedTransaction
    );
    expect(ports.journal.commitTerminalReconciliation).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(ports.journal.commitSubmissionStarted).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(ports.sendExactRawTransactionOnce).mock.invocationCallOrder[0] ?? 0);
    expect(vi.mocked(ports.sendExactRawTransactionOnce).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ports.journal.commitTerminalReconciliation).mock.invocationCallOrder[0] ?? 0
    );
    expect(await core.submitAndReconcileOnce()).toMatchObject({
      status: "do_not_retry",
      retryBroadcastAllowed: false
    });
    expect(ports.sendExactRawTransactionOnce).toHaveBeenCalledTimes(1);
  });

  it("never sends when durable submission_started acknowledgement is unknown", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const send = vi.fn(async () => capability.transaction.transactionHash);
    const observe = vi.fn(async () => exactEvidence);
    const ports = dependencies(capability, exactEvidence, {
      journal: {
        readState: async () => journalState(capability),
        commitSubmissionStarted: async () => {
          throw new Error("ambiguous fsync");
        },
        commitTerminalReconciliation: async () => ({ status: "unreachable" })
      },
      sendExactRawTransactionOnce: send,
      observeExactTransaction: observe
    });

    expect(
      await createBscTestnetPtaWbnbPoolSubmissionCoreForTests(ports).submitAndReconcileOnce()
    ).toMatchObject({
      status: "do_not_retry",
      retryBroadcastAllowed: false,
      reconciliationRetryAllowed: false,
      issue: { code: "SUBMISSION_START_OUTCOME_UNKNOWN" }
    });
    expect(send).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it("rechecks freshness after winning the durable start and refuses a delayed send", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const send = vi.fn(async () => capability.transaction.transactionHash);
    const observe = vi.fn(async () => exactEvidence);
    const clock = vi
      .fn<() => Date>()
      .mockReturnValueOnce(new Date(NOW))
      .mockReturnValueOnce(new Date("2026-08-13T08:00:40.000Z"));
    const ports = dependencies(capability, exactEvidence, {
      now: clock,
      sendExactRawTransactionOnce: send,
      observeExactTransaction: observe
    });

    expect(
      await createBscTestnetPtaWbnbPoolSubmissionCoreForTests(ports).submitAndReconcileOnce()
    ).toMatchObject({
      status: "do_not_retry",
      retryBroadcastAllowed: false,
      reconciliationRetryAllowed: true,
      issue: { code: "SUBMISSION_WINDOW_CLOSED_AFTER_DURABLE_START" }
    });
    expect(ports.journal.commitSubmissionStarted).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it("skips send on restart after submission_started even when capability has expired", async () => {
    const capability = await submissionCapability({
      authenticatedAt: "2026-08-13T07:59:00.000Z",
      expiresAt: "2026-08-13T07:59:30.000Z"
    });
    const exactEvidence = evidence(capability);
    const send = vi.fn(async () => capability.transaction.transactionHash);
    const ports = dependencies(capability, exactEvidence, {
      journal: {
        readState: async () => journalState(capability, "submission_started"),
        commitSubmissionStarted: async () => ({ status: "must_not_run" }),
        commitTerminalReconciliation: async (request) => ({
          status: request.outcome,
          reconciliationDigest: request.reconciliationDigest,
          submissionStartedDigest: request.submissionStartedDigest,
          transactionHash: request.transactionHash
        })
      },
      sendExactRawTransactionOnce: send
    });

    expect(
      await createBscTestnetPtaWbnbPoolSubmissionCoreForTests(ports).submitAndReconcileOnce()
    ).toMatchObject({ status: "confirmed", retryBroadcastAllowed: false });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects restart journal state with any immutable capability binding drift", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const send = vi.fn(async () => capability.transaction.transactionHash);
    const observe = vi.fn(async () => exactEvidence);
    const ports = dependencies(capability, exactEvidence, {
      journal: {
        readState: async () => ({
          ...journalState(capability, "submission_started"),
          ownerAuthorizationDigest: `0x${"98".repeat(32)}`
        }),
        commitSubmissionStarted: async () => ({ status: "must_not_run" }),
        commitTerminalReconciliation: async () => ({ status: "must_not_run" })
      },
      sendExactRawTransactionOnce: send,
      observeExactTransaction: observe
    });

    expect(
      await createBscTestnetPtaWbnbPoolSubmissionCoreForTests(ports).submitAndReconcileOnce()
    ).toMatchObject({
      status: "do_not_retry",
      retryBroadcastAllowed: false,
      reconciliationRetryAllowed: false,
      issue: { code: "JOURNAL_STATE_UNKNOWN" }
    });
    expect(send).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it("turns an ambiguous send into reconciliation only and never resends", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const send = vi.fn(async () => {
      throw new Error("connection reset after write");
    });
    const ports = dependencies(capability, exactEvidence, {
      sendExactRawTransactionOnce: send
    });
    const core = createBscTestnetPtaWbnbPoolSubmissionCoreForTests(ports);

    expect(await core.submitAndReconcileOnce()).toMatchObject({ status: "confirmed" });
    expect(await core.submitAndReconcileOnce()).toMatchObject({ status: "do_not_retry" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("allows exactly one sender across a 16-way durable-start race", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const transactionHash = capability.transaction.transactionHash;
    let winnerChosen = false;
    const send = vi.fn(async () => transactionHash);
    const commitSubmissionStarted = vi.fn(async (request) => {
      const status = winnerChosen ? "already_started" : "started_by_this_call";
      winnerChosen = true;
      await Promise.resolve();
      return {
        status,
        submissionStartedDigest: request.submissionStartedDigest,
        transactionHash
      };
    });
    const sharedJournal = {
      readState: async () => journalState(capability),
      commitSubmissionStarted,
      commitTerminalReconciliation: async (request) => ({
        status: request.outcome,
        reconciliationDigest: request.reconciliationDigest,
        submissionStartedDigest: request.submissionStartedDigest,
        transactionHash
      })
    } satisfies BscTestnetPtaWbnbPoolSubmissionTestDependencies["journal"];

    const results = await Promise.all(
      Array.from({ length: 16 }, async () => {
        const ports = dependencies(capability, exactEvidence, {
          journal: sharedJournal,
          sendExactRawTransactionOnce: send
        });
        return createBscTestnetPtaWbnbPoolSubmissionCoreForTests(ports).submitAndReconcileOnce();
      })
    );

    expect(results.every((result) => result.status === "confirmed")).toBe(true);
    expect(commitSubmissionStarted).toHaveBeenCalledTimes(16);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(capability.transaction.signedTransaction);
  });

  it("requires a fresh exact two-provider pre-submission snapshot", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const mutations: unknown[] = [
      { ...capability, freshPreSubmissionDualRpcRecheckPerformed: false },
      {
        ...capability,
        preSubmission: { ...capability.preSubmission, pendingNonce: "2" }
      },
      {
        ...capability,
        preSubmission: {
          ...capability.preSubmission,
          factoryPoolReverse: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
        }
      },
      {
        ...capability,
        preSubmission: {
          ...capability.preSubmission,
          transactionByHash: { hash: capability.transaction.transactionHash }
        }
      },
      {
        ...capability,
        preSubmission: {
          ...capability.preSubmission,
          observedAt: "2026-08-13T07:59:00.000Z"
        }
      },
      {
        ...capability,
        preSubmission: { ...capability.preSubmission, gasPriceWei: "100000001" }
      },
      {
        ...capability,
        preSubmission: { ...capability.preSubmission, senderBalanceWei: "1" }
      }
    ];

    for (const mutation of mutations) {
      const send = vi.fn(async () => capability.transaction.transactionHash);
      const ports = dependencies(capability, exactEvidence, {
        acquireSubmissionCapability: async () => mutation,
        authenticateSubmissionCapability: (candidate: unknown) => candidate === mutation,
        sendExactRawTransactionOnce: send
      });
      expect(
        await createBscTestnetPtaWbnbPoolSubmissionCoreForTests(ports).submitAndReconcileOnce()
      ).toMatchObject({
        status: "blocked_before_submission",
        retryBroadcastAllowed: false
      });
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("rejects feeProtocol drift, either getPool direction drift, and nonzero lmPool", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const mutations: unknown[] = [
      mutatePostState(exactEvidence, (state) => ({
        ...state,
        pool: { ...state.pool, slot0: { ...state.pool.slot0, feeProtocol: "0" } }
      })),
      mutatePostState(exactEvidence, (state) => ({
        ...state,
        factoryPoolForward: ZERO_ADDRESS
      })),
      mutatePostState(exactEvidence, (state) => ({
        ...state,
        factoryPoolReverse: ZERO_ADDRESS
      })),
      mutatePostState(exactEvidence, (state) => ({
        ...state,
        pool: { ...state.pool, lmPool: BSC_TESTNET_PTA_ADDRESS }
      }))
    ];
    for (const mutation of mutations) {
      expect(
        await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
          capability,
          mutation,
          new Date(NOW)
        )
      ).toMatchObject({ status: "invalid", issue: { code: "INPUT_INVALID" } });
    }
  });

  it("rejects a substituted minimum finalized head and missing receipt-block membership", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const substitutedHead = {
      ...exactEvidence,
      primary: {
        ...exactEvidence.primary,
        reportedFinalizedHead: {
          ...exactEvidence.primary.reportedFinalizedHead,
          hash: `0x${"ef".repeat(32)}`
        }
      }
    };
    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        capability,
        substitutedHead,
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CANONICALITY_INVALID" } });

    const primaryReceiptBlock = exactEvidence.primary.receiptBlock;
    const corroboratorReceiptBlock = exactEvidence.corroborator.receiptBlock;
    if (primaryReceiptBlock === null || corroboratorReceiptBlock === null) {
      throw new Error("Receipt-block fixture missing.");
    }
    const missingMembership = {
      ...exactEvidence,
      primary: {
        ...exactEvidence.primary,
        receiptBlock: {
          ...primaryReceiptBlock,
          transactionHashes: [`0x${"99".repeat(32)}`]
        }
      },
      corroborator: {
        ...exactEvidence.corroborator,
        receiptBlock: {
          ...corroboratorReceiptBlock,
          transactionHashes: [`0x${"99".repeat(32)}`]
        }
      }
    };
    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        capability,
        missingMembership,
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CANONICALITY_INVALID" } });
  });

  it("rejects oversized sparse RPC arrays before enumerating billions of entries", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const receiptBlock = exactEvidence.primary.receiptBlock;
    if (receiptBlock === null) throw new Error("Receipt-block fixture missing.");
    const hostileSparseArray: Hex[] = [];
    hostileSparseArray.length = 0xffff_ffff;
    const oversized = {
      ...exactEvidence,
      primary: {
        ...exactEvidence.primary,
        receiptBlock: { ...receiptBlock, transactionHashes: hostileSparseArray }
      }
    };

    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        capability,
        oversized,
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "INPUT_INVALID" } });
  });

  it("rejects oversized scalar, raw-transaction, log-data, and runtime strings", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const primaryReceipt = exactEvidence.primary.receipt;
    const corroboratorReceipt = exactEvidence.corroborator.receipt;
    const primaryPostState = exactEvidence.primary.postState;
    const corroboratorPostState = exactEvidence.corroborator.postState;
    if (
      primaryReceipt === null ||
      corroboratorReceipt === null ||
      primaryPostState === null ||
      corroboratorPostState === null
    ) {
      throw new Error("Receipt/post-state fixture missing.");
    }
    const huge = "9".repeat(100_000);
    const hugeHex = `0x${"aa".repeat(100_000)}`;
    const mutations: readonly Readonly<{ capability: unknown; evidence: unknown }>[] = [
      {
        capability: {
          ...capability,
          transaction: { ...capability.transaction, signedTransaction: hugeHex }
        },
        evidence: exactEvidence
      },
      {
        capability,
        evidence: {
          ...exactEvidence,
          primary: {
            ...exactEvidence.primary,
            receipt: { ...primaryReceipt, gasUsed: huge }
          },
          corroborator: {
            ...exactEvidence.corroborator,
            receipt: { ...corroboratorReceipt, gasUsed: huge }
          }
        }
      },
      {
        capability,
        evidence: {
          ...exactEvidence,
          primary: {
            ...exactEvidence.primary,
            receipt: {
              ...primaryReceipt,
              logs: primaryReceipt.logs.map((log, index) =>
                index === 0 ? { ...log, data: hugeHex } : log
              )
            }
          },
          corroborator: {
            ...exactEvidence.corroborator,
            receipt: {
              ...corroboratorReceipt,
              logs: corroboratorReceipt.logs.map((log, index) =>
                index === 0 ? { ...log, data: hugeHex } : log
              )
            }
          }
        }
      },
      {
        capability,
        evidence: {
          ...exactEvidence,
          primary: {
            ...exactEvidence.primary,
            postState: { ...primaryPostState, poolRuntimeCode: hugeHex }
          },
          corroborator: {
            ...exactEvidence.corroborator,
            postState: { ...corroboratorPostState, poolRuntimeCode: hugeHex }
          }
        }
      }
    ];
    for (const mutation of mutations) {
      expect(
        await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
          mutation.capability,
          mutation.evidence,
          new Date(NOW)
        )
      ).toMatchObject({ status: "invalid" });
    }
  });

  it("rejects future finalized timestamps and receipt blocks later than the common checkpoint", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const futureBlock = {
      ...exactEvidence.primary.reportedFinalizedHead,
      timestamp: "9999999999"
    };
    const futureFinality = {
      ...exactEvidence,
      primary: {
        ...exactEvidence.primary,
        reportedFinalizedHead: futureBlock,
        commonFinalizedBlock: futureBlock
      },
      corroborator: {
        ...exactEvidence.corroborator,
        reportedFinalizedHead: futureBlock,
        commonFinalizedBlock: futureBlock
      }
    };
    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        capability,
        futureFinality,
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CANONICALITY_INVALID" } });

    const primaryReceiptBlock = exactEvidence.primary.receiptBlock;
    const corroboratorReceiptBlock = exactEvidence.corroborator.receiptBlock;
    if (primaryReceiptBlock === null || corroboratorReceiptBlock === null) {
      throw new Error("Receipt-block fixture missing.");
    }
    const lateReceipt = {
      ...exactEvidence,
      primary: {
        ...exactEvidence.primary,
        receiptBlock: { ...primaryReceiptBlock, timestamp: "9999999999" }
      },
      corroborator: {
        ...exactEvidence.corroborator,
        receiptBlock: { ...corroboratorReceiptBlock, timestamp: "9999999999" }
      }
    };
    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        capability,
        lateReceipt,
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CANONICALITY_INVALID" } });
  });

  it("requires exact receipt gas accounting, recomputed bloom, and block lookup provenance", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const primaryReceipt = exactEvidence.primary.receipt;
    const corroboratorReceipt = exactEvidence.corroborator.receipt;
    const primaryCommon = exactEvidence.primary.commonFinalizedBlock;
    const corroboratorCommon = exactEvidence.corroborator.commonFinalizedBlock;
    if (
      primaryReceipt === null ||
      corroboratorReceipt === null ||
      primaryCommon === null ||
      corroboratorCommon === null
    ) {
      throw new Error("Receipt/finality fixture missing.");
    }
    const mutations: unknown[] = [
      {
        ...exactEvidence,
        primary: {
          ...exactEvidence.primary,
          receipt: { ...primaryReceipt, cumulativeGasUsed: "1" }
        },
        corroborator: {
          ...exactEvidence.corroborator,
          receipt: { ...corroboratorReceipt, cumulativeGasUsed: "1" }
        }
      },
      {
        ...exactEvidence,
        primary: {
          ...exactEvidence.primary,
          receipt: { ...primaryReceipt, logsBloom: `0x${"00".repeat(256)}` }
        },
        corroborator: {
          ...exactEvidence.corroborator,
          receipt: { ...corroboratorReceipt, logsBloom: `0x${"00".repeat(256)}` }
        }
      },
      {
        ...exactEvidence,
        primary: { ...exactEvidence.primary, receiptBlockLookup: null },
        corroborator: { ...exactEvidence.corroborator, receiptBlockLookup: null }
      },
      {
        ...exactEvidence,
        primary: {
          ...exactEvidence.primary,
          reportedFinalizedHead: {
            ...exactEvidence.primary.reportedFinalizedHead,
            parentHash: `0x${"76".repeat(32)}`
          },
          commonFinalizedBlock: {
            ...primaryCommon,
            parentHash: `0x${"76".repeat(32)}`
          }
        },
        corroborator: {
          ...exactEvidence.corroborator,
          reportedFinalizedHead: {
            ...exactEvidence.corroborator.reportedFinalizedHead,
            parentHash: `0x${"76".repeat(32)}`
          },
          commonFinalizedBlock: {
            ...corroboratorCommon,
            parentHash: `0x${"76".repeat(32)}`
          }
        }
      }
    ];
    for (const mutation of mutations) {
      expect(
        await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
          capability,
          mutation,
          new Date(NOW)
        )
      ).toMatchObject({ status: "invalid" });
    }
  });

  it("rejects swapped success logs and malformed proxy/accessor evidence", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const primaryReceipt = exactEvidence.primary.receipt;
    const corroboratorReceipt = exactEvidence.corroborator.receipt;
    if (primaryReceipt === null || corroboratorReceipt === null) {
      throw new Error("Receipt fixture missing.");
    }
    const swapped = {
      ...exactEvidence,
      primary: {
        ...exactEvidence.primary,
        receipt: { ...primaryReceipt, logs: [...primaryReceipt.logs].reverse() }
      },
      corroborator: {
        ...exactEvidence.corroborator,
        receipt: { ...corroboratorReceipt, logs: [...corroboratorReceipt.logs].reverse() }
      }
    };
    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(capability, swapped, new Date(NOW))
    ).toMatchObject({ status: "invalid" });

    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        capability,
        new Proxy(exactEvidence, {}),
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "INPUT_INVALID" } });
    let getterRead = false;
    const accessor = Object.defineProperty({}, "primary", {
      enumerable: true,
      get() {
        getterRead = true;
        return exactEvidence.primary;
      }
    });
    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        capability,
        accessor,
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid" });
    expect(getterRead).toBe(false);
  });

  it("never turns a reverted receipt with success-like post-state into a reverted claim", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const primaryReceipt = exactEvidence.primary.receipt;
    const corroboratorReceipt = exactEvidence.corroborator.receipt;
    if (primaryReceipt === null || corroboratorReceipt === null) {
      throw new Error("Receipt fixture missing.");
    }
    const contradictory = {
      ...exactEvidence,
      primary: {
        ...exactEvidence.primary,
        receipt: { ...primaryReceipt, status: "0", logsBloom: `0x${"00".repeat(256)}`, logs: [] }
      },
      corroborator: {
        ...exactEvidence.corroborator,
        receipt: {
          ...corroboratorReceipt,
          status: "0",
          logsBloom: `0x${"00".repeat(256)}`,
          logs: []
        }
      }
    };

    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        capability,
        contradictory,
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "LOGS_INVALID" } });
  });

  it("strictly validates untrusted capability content before reading reconciliation evidence", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const get = vi.fn();
    const getPrototypeOf = vi.fn();
    const ownKeys = vi.fn();
    const proxyCapability = new Proxy(capability, { get, getPrototypeOf, ownKeys });

    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        proxyCapability,
        exactEvidence,
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CAPABILITY_INVALID" } });
    expect(get).not.toHaveBeenCalled();
    expect(getPrototypeOf).not.toHaveBeenCalled();
    expect(ownKeys).not.toHaveBeenCalled();

    let getterRead = false;
    const accessorCapability = Object.defineProperty({}, "transaction", {
      enumerable: true,
      get() {
        getterRead = true;
        return capability.transaction;
      }
    });
    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        accessorCapability,
        exactEvidence,
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CAPABILITY_INVALID" } });
    expect(getterRead).toBe(false);

    const malformedSignedCapability = {
      ...capability,
      transaction: {
        ...capability.transaction,
        signedTransaction: "0x01"
      }
    };
    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        malformedSignedCapability,
        exactEvidence,
        new Date(NOW)
      )
    ).toMatchObject({ status: "invalid", issue: { code: "SIGNED_TRANSACTION_INVALID" } });

    const zeroBytes32 = `0x${"00".repeat(32)}`;
    const bindingMutations: unknown[] = [
      { ...capability, envelopeHash: zeroBytes32 },
      { ...capability, reviewerApprovalDigest: capability.ownerAuthorizationDigest },
      { ...capability, runtimeManifestSha256: zeroBytes32 },
      { ...capability, releaseCommit: "0".repeat(40) },
      {
        ...capability,
        transaction: { ...capability.transaction, signingHash: zeroBytes32 }
      }
    ];
    for (const mutation of bindingMutations) {
      expect(
        await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
          mutation,
          exactEvidence,
          new Date(NOW)
        )
      ).toMatchObject({ status: "invalid" });
    }
  });

  it("rejects proxied clocks without triggering proxy traps", async () => {
    const capability = await submissionCapability();
    const exactEvidence = evidence(capability);
    const get = vi.fn();
    const getPrototypeOf = vi.fn();
    const ownKeys = vi.fn();
    const proxyDate = new Proxy(new Date(NOW), { get, getPrototypeOf, ownKeys });
    const acquire = vi.fn(async () => capability);
    const ports = dependencies(capability, exactEvidence, {
      now: () => proxyDate,
      acquireSubmissionCapability: acquire
    });

    expect(
      await createBscTestnetPtaWbnbPoolSubmissionCoreForTests(ports).submitAndReconcileOnce()
    ).toMatchObject({
      status: "blocked_before_submission",
      issue: { code: "CLOCK_INVALID" }
    });
    expect(acquire).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(getPrototypeOf).not.toHaveBeenCalled();
    expect(ownKeys).not.toHaveBeenCalled();

    expect(
      await reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
        capability,
        exactEvidence,
        proxyDate
      )
    ).toMatchObject({ status: "invalid", issue: { code: "CLOCK_INVALID" } });
    expect(get).not.toHaveBeenCalled();
    expect(getPrototypeOf).not.toHaveBeenCalled();
    expect(ownKeys).not.toHaveBeenCalled();
  });

  it("keeps the production factory hard-blocked before any injected dependency", () => {
    expect(() => createProductionBscTestnetPtaWbnbPoolSubmissionCore()).toThrow(
      BscTestnetPtaWbnbPoolProductionSubmissionUnavailableError
    );
    try {
      createProductionBscTestnetPtaWbnbPoolSubmissionCore();
    } catch (error) {
      expect(error).toMatchObject({ code: "PRODUCTION_AUTHORIZATION_UNAVAILABLE" });
    }
  });
});
