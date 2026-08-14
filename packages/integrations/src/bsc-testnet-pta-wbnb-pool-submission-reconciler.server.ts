import "server-only";

import { isProxy } from "node:util/types";

import {
  encodeAbiParameters,
  getAddress,
  hexToBytes,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
  stringToHex,
  type Hex,
  type TransactionSerialized
} from "viem";

import {
  BSC_TESTNET_PANCAKE_V3_FACTORY,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
  BSC_TESTNET_PTA_WBNB_POOL_FEE,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96,
  BSC_TESTNET_PTA_WBNB_POOL_TICK_SPACING,
  BSC_TESTNET_WBNB_ADDRESS,
  calculateBscTestnetPtaWbnbPoolGasLimit
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
  BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
  type BscTestnetPtaWbnbPoolRecoveryAttemptBinding
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

export const BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION = 2 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE =
  "authenticated_exact_pool_recovery_generation_2_submission_after_durable_signed_commit" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION =
  "submit_exact_bsc_testnet_pta_wbnb_pool_initialization_once" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION =
  "reconcile_exact_bsc_testnet_pta_wbnb_pool_initialization" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_TICK = -138_163 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_RUNTIME_BYTES = 22_962 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_RUNTIME_KECCAK256 =
  "0xc7187b6ca08de7a5856f7725d15e39a534b27a964fdc445abfd7663041b0e69d" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_MAX_LIQUIDITY_PER_TICK =
  1_917_569_901_783_203_986_719_870_431_555_990n;
export const BSC_TESTNET_PTA_WBNB_POOL_CREATED_TOPIC =
  "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_INITIALIZE_TOPIC =
  "0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95" as const satisfies Hex;

const SUBMISSION_STARTED_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.submission-started.v2" as const;
const RECONCILIATION_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.reconciliation.v2" as const;
const MAXIMUM_CAPABILITY_LIFETIME_MILLISECONDS =
  BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS * 1_000;
const MAXIMUM_PRE_SUBMISSION_OBSERVATION_AGE_MILLISECONDS =
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS * 1_000;
const MAXIMUM_SIGNED_TRANSACTION_BYTES = 2_048;
const MAXIMUM_BLOCK_TRANSACTION_HASHES = 100_000;
export const BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_FINALITY_ANCESTRY_BLOCKS = 128 as const;
const SECP256K1_ORDER = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"
);
const SECP256K1_HALF_ORDER = SECP256K1_ORDER / 2n;
const UINT256_MAX = (1n << 256n) - 1n;
const ZERO_WORD = `0x${"00".repeat(32)}` as Hex;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_RELEASE_COMMIT = "0".repeat(40);
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const BYTES = /^0x(?:[0-9a-f]{2})*$/u;
const RAW_TRANSACTION = /^0x[0-9a-f]+$/u;
const BLOOM = /^0x[0-9a-f]{512}$/u;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/u;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const RELEASE_COMMIT = /^[0-9a-f]{40}$/u;

const POOL_CREATED_TOKEN0_TOPIC = encodeAbiParameters(
  [{ type: "address" }],
  [BSC_TESTNET_PTA_ADDRESS]
);
const POOL_CREATED_TOKEN1_TOPIC = encodeAbiParameters(
  [{ type: "address" }],
  [BSC_TESTNET_WBNB_ADDRESS]
);
const POOL_CREATED_FEE_TOPIC = encodeAbiParameters(
  [{ type: "uint24" }],
  [BSC_TESTNET_PTA_WBNB_POOL_FEE]
);
const POOL_CREATED_DATA = encodeAbiParameters(
  [{ type: "int24" }, { type: "address" }],
  [BSC_TESTNET_PTA_WBNB_POOL_TICK_SPACING, BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE]
);
const INITIALIZE_DATA = encodeAbiParameters(
  [{ type: "uint160" }, { type: "int24" }],
  [BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96, BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_TICK]
);

const BOUNDARY = Object.freeze({
  environment: "bsc-testnet" as const,
  chainId: "97" as const,
  operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  exactTransactionOnly: true as const,
  callerTransactionInputAccepted: false as const,
  productionAuthorizationIssuerPresent: true as const,
  productionBroadcasterPresent: true as const,
  genericProductionFactoryAvailable: false as const,
  privateExactReleasePathOnly: true as const,
  testDependencyInjectionOnly: false as const,
  durableSignedCommitRequired: true as const,
  separateAuthenticatedSubmissionCapabilityRequired: true as const,
  durableSubmissionStartedRequiredBeforeSend: true as const,
  terminalDualRpcRecheckAfterDurableStartRequired: true as const,
  rawTransactionMayBeSentAtMostOnce: true as const,
  replacementTransactionAllowed: false as const,
  resendAfterAmbiguousSubmissionAllowed: false as const,
  reconciliationOnlyRetryAllowedAfterSubmissionStarted: true as const,
  dualProviderTransactionAndReceiptRequired: true as const,
  commonFinalizedCanonicalityRequired: true as const,
  boundedExactHeaderAncestryRequired: true as const,
  eip1898PostStateRequired: true as const,
  exactPoolCreatedAndInitializeLogsRequired: true as const,
  mainnetWritePossible: false as const
});

export const BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_BOUNDARY = BOUNDARY;

export interface BscTestnetPtaWbnbPoolSubmissionCapability {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION;
  readonly scope: typeof BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE;
  readonly operation: typeof BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION;
  readonly oneShotIntentId: typeof BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly claimId: string;
  readonly envelopeHash: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
  readonly signedCommitDurablyVerified: true;
  readonly freshPreSubmissionDualRpcRecheckPerformed: true;
  readonly preSubmission: Readonly<{
    primaryOrigin: typeof BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN;
    corroboratorOrigin: typeof BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN;
    providerAgreementVerified: true;
    canonicalFinalizedBlockVerified: true;
    finalizedAnchorDualProviderExactNumberVerified: true;
    observedAt: string;
    finalizedBlockNumber: string;
    finalizedBlockHash: Hex;
    finalizedBlockTimestamp: string;
    finalizedBlockGasLimit: string;
    latestNonce: "1";
    pendingNonce: "1";
    transactionByHash: null;
    receiptByHash: null;
    factoryPoolForward: typeof ZERO_ADDRESS;
    factoryPoolReverse: typeof ZERO_ADDRESS;
    candidateCode: "0x";
    candidateNonce: "0";
    senderCode: "0x";
    senderBalanceWei: string;
    gasEstimate: string;
    gasPriceWei: string;
    simulationReturnPool: typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE;
  }>;
  readonly transaction: Readonly<{
    type: "legacy";
    chainId: "97";
    from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
    to: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
    nonce: "1";
    valueWei: "0";
    gasLimit: string;
    gasPriceWei: string;
    maximumCostWei: string;
    data: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA;
    signingHash: Hex;
    signedTransaction: Hex;
    transactionHash: Hex;
    recoveredSigner: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
  }>;
}

export interface BscTestnetPtaWbnbPoolSubmissionJournalState {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly claimId: string;
  readonly envelopeHash: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
  readonly signingHash: Hex;
  readonly transactionHash: Hex;
  readonly signedTransactionKeccak256: Hex;
  readonly submissionStartedDigest: Hex;
  readonly state:
    "signed_committed" | "submission_started" | "confirmed" | "reverted" | "unknown_outcome";
}

export interface BscTestnetPtaWbnbPoolSubmissionStartedRequest {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly claimId: string;
  readonly envelopeHash: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
  readonly signingHash: Hex;
  readonly transactionHash: Hex;
  readonly signedTransactionKeccak256: Hex;
  readonly submissionStartedDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolTerminalReconciliationRequest {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly claimId: string;
  readonly envelopeHash: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
  readonly signingHash: Hex;
  readonly transactionHash: Hex;
  readonly signedTransactionKeccak256: Hex;
  readonly submissionStartedDigest: Hex;
  readonly outcome: "confirmed" | "reverted";
  readonly reconciliationDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolSubmissionJournal {
  readonly readState: () => Promise<unknown>;
  readonly commitSubmissionStarted: (
    request: BscTestnetPtaWbnbPoolSubmissionStartedRequest
  ) => Promise<unknown>;
  readonly commitTerminalReconciliation: (
    request: BscTestnetPtaWbnbPoolTerminalReconciliationRequest
  ) => Promise<unknown>;
}

/**
 * Restart-only durable evidence handle. Its runtime surface cannot initialize a signed commit or
 * append submission_started, so reconciliation can only read the retained binding and append the
 * terminal observation derived from fixed RPC evidence.
 */
export interface BscTestnetPtaWbnbPoolTerminalReconciliationJournal {
  readonly readState: () => Promise<unknown>;
  readonly commitTerminalReconciliation: (
    request: BscTestnetPtaWbnbPoolTerminalReconciliationRequest
  ) => Promise<unknown>;
}

export interface BscTestnetPtaWbnbPoolNormalizedTransaction {
  readonly hash: Hex;
  readonly type: "legacy";
  readonly chainId: "97";
  readonly from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
  readonly to: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
  readonly nonce: "1";
  readonly valueWei: "0";
  readonly gasLimit: string;
  readonly gasPriceWei: string;
  readonly input: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA;
  readonly blockHash: Hex | null;
  readonly blockNumber: string | null;
  readonly transactionIndex: string | null;
}

export interface BscTestnetPtaWbnbPoolNormalizedLog {
  readonly address: string;
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly blockHash: Hex;
  readonly blockNumber: string;
  readonly transactionHash: Hex;
  readonly transactionIndex: string;
  readonly logIndex: string;
  readonly removed: false;
}

export interface BscTestnetPtaWbnbPoolNormalizedReceipt {
  readonly transactionHash: Hex;
  readonly transactionIndex: string;
  readonly blockHash: Hex;
  readonly blockNumber: string;
  readonly from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
  readonly to: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
  readonly contractAddress: null;
  readonly cumulativeGasUsed: string;
  readonly gasUsed: string;
  readonly effectiveGasPriceWei: string;
  readonly status: "0" | "1";
  readonly type: "legacy";
  readonly logsBloom: Hex;
  readonly logs: readonly BscTestnetPtaWbnbPoolNormalizedLog[];
}

export interface BscTestnetPtaWbnbPoolNormalizedBlock {
  readonly number: string;
  readonly hash: Hex;
  readonly parentHash: Hex;
  readonly timestamp: string;
  readonly transactionHashes: readonly Hex[];
}

export interface BscTestnetPtaWbnbPoolNormalizedAncestryHeader {
  readonly number: string;
  readonly hash: Hex;
  readonly parentHash: Hex;
  readonly timestamp: string;
}

export interface BscTestnetPtaWbnbPoolPostState {
  readonly eip1898Block: Readonly<{ blockHash: Hex; requireCanonical: true }>;
  readonly factoryPoolForward: typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE;
  readonly factoryPoolReverse: typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE;
  readonly poolAccountNonce: "1";
  readonly poolRuntimeCode: Hex;
  readonly eip1967Slots: Readonly<{
    implementation: typeof ZERO_WORD;
    admin: typeof ZERO_WORD;
    beacon: typeof ZERO_WORD;
  }>;
  readonly pool: Readonly<{
    factory: typeof BSC_TESTNET_PANCAKE_V3_FACTORY;
    token0: typeof BSC_TESTNET_PTA_ADDRESS;
    token1: typeof BSC_TESTNET_WBNB_ADDRESS;
    fee: "500";
    tickSpacing: "10";
    maxLiquidityPerTick: "1917569901783203986719870431555990";
    liquidity: "0";
    lmPool: typeof ZERO_ADDRESS;
    slot0: Readonly<{
      sqrtPriceX96: "79228162514264337593543950";
      tick: "-138163";
      observationIndex: "0";
      observationCardinality: "1";
      observationCardinalityNext: "1";
      feeProtocol: "222825800";
      unlocked: true;
    }>;
    observation0: Readonly<{
      blockTimestamp: string;
      tickCumulative: "0";
      secondsPerLiquidityCumulativeX128: "0";
      initialized: true;
    }>;
  }>;
}

export interface BscTestnetPtaWbnbPoolProviderReconciliationEvidence {
  readonly origin:
    | typeof BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN
    | typeof BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN;
  readonly chainId: "97";
  readonly transaction: BscTestnetPtaWbnbPoolNormalizedTransaction | null;
  readonly receipt: BscTestnetPtaWbnbPoolNormalizedReceipt | null;
  /** First finalized-tag observation, taken before the fixed checkpoint proof. */
  readonly reportedFinalizedHead: BscTestnetPtaWbnbPoolNormalizedBlock;
  /** Second finalized-tag observation, taken before the terminal checkpoint canonicality probe. */
  readonly recheckedFinalizedHead: BscTestnetPtaWbnbPoolNormalizedBlock;
  readonly commonFinalizedBlock: BscTestnetPtaWbnbPoolNormalizedBlock | null;
  /** Exact-number re-read of commonFinalizedBlock after the bounded ancestry was collected. */
  readonly checkpointBlockRecheck: BscTestnetPtaWbnbPoolNormalizedBlock | null;
  /** Successful EIP-1898 state read proving the fixed checkpoint hash was canonical. */
  readonly checkpointCanonicalAttestation: Readonly<{
    method: "eth_getBalance";
    address: typeof ZERO_ADDRESS;
    eip1898Block: Readonly<{ blockHash: Hex; requireCanonical: true }>;
    resultWei: string;
  }> | null;
  readonly receiptBlockLookup: Readonly<{
    method: "eth_getBlockByNumber";
    requestedBlockNumber: string;
    includeFullTransactions: false;
    exactNumberCanonicalLookup: true;
  }> | null;
  readonly receiptBlock: BscTestnetPtaWbnbPoolNormalizedBlock | null;
  /** Exactly 128 canonical blocks after receiptBlock through the fixed finalized checkpoint. */
  readonly receiptToCommonFinalizedAncestry: readonly BscTestnetPtaWbnbPoolNormalizedAncestryHeader[];
  readonly postState: BscTestnetPtaWbnbPoolPostState | null;
}

export interface BscTestnetPtaWbnbPoolReconciliationEvidence {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly transactionHash: Hex;
  readonly observedAt: string;
  readonly primary: BscTestnetPtaWbnbPoolProviderReconciliationEvidence;
  readonly corroborator: BscTestnetPtaWbnbPoolProviderReconciliationEvidence;
}

export type BscTestnetPtaWbnbPoolReconciliationIssueCode =
  | "INPUT_INVALID"
  | "CLOCK_INVALID"
  | "CAPABILITY_INVALID"
  | "CAPABILITY_EXPIRED"
  | "SIGNED_TRANSACTION_INVALID"
  | "SIGNER_MISMATCH"
  | "PROVIDER_DISAGREEMENT"
  | "TRANSACTION_INVALID"
  | "RECEIPT_INVALID"
  | "FINALITY_PENDING"
  | "CANONICALITY_INVALID"
  | "LOGS_INVALID"
  | "POST_STATE_INVALID";

export interface BscTestnetPtaWbnbPoolReconciliationIssue {
  readonly code: BscTestnetPtaWbnbPoolReconciliationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type BscTestnetPtaWbnbPoolReconciliationResult =
  | Readonly<{
      status: "pending";
      transactionHash: Hex;
      reconciliationDigest: null;
      issue: BscTestnetPtaWbnbPoolReconciliationIssue | null;
    }>
  | Readonly<{
      status: "confirmed" | "reverted";
      transactionHash: Hex;
      reconciliationDigest: Hex;
      issue: null;
    }>
  | Readonly<{
      status: "invalid";
      transactionHash: Hex | null;
      reconciliationDigest: null;
      issue: BscTestnetPtaWbnbPoolReconciliationIssue;
    }>;

export type BscTestnetPtaWbnbPoolSubmissionResult =
  | Readonly<{
      status: "blocked_before_submission";
      retryBroadcastAllowed: false;
      reconciliationRetryAllowed: false;
      transactionHash: Hex | null;
      issue: Readonly<{ code: string; phase: string; message: string }>;
      boundary: typeof BOUNDARY;
    }>
  | Readonly<{
      status: "do_not_retry";
      retryBroadcastAllowed: false;
      reconciliationRetryAllowed: boolean;
      transactionHash: Hex | null;
      issue: Readonly<{ code: string; phase: string; message: string }>;
      boundary: typeof BOUNDARY;
    }>
  | Readonly<{
      status: "reconciliation_pending";
      retryBroadcastAllowed: false;
      reconciliationRetryAllowed: true;
      transactionHash: Hex;
      issue: BscTestnetPtaWbnbPoolReconciliationIssue | null;
      boundary: typeof BOUNDARY;
    }>
  | Readonly<{
      status: "confirmed" | "reverted";
      retryBroadcastAllowed: false;
      reconciliationRetryAllowed: false;
      transactionHash: Hex;
      reconciliationDigest: Hex;
      issue: null;
      boundary: typeof BOUNDARY;
    }>;

export interface BscTestnetPtaWbnbPoolSubmissionCore {
  readonly boundary: typeof BOUNDARY;
  readonly submitAndReconcileOnce: () => Promise<BscTestnetPtaWbnbPoolSubmissionResult>;
}

export interface BscTestnetPtaWbnbPoolSubmissionTestDependencies {
  readonly now: () => Date;
  readonly acquireSubmissionCapability: () => Promise<unknown>;
  readonly authenticateSubmissionCapability: (capability: unknown) => boolean;
  readonly journal: BscTestnetPtaWbnbPoolSubmissionJournal;
  readonly acquireTerminalPreSendRecheck: (
    input: Readonly<{ transactionHash: Hex; gasLimit: string; gasPriceWei: string }>
  ) => Promise<unknown>;
  readonly sendExactRawTransactionOnce: (signedTransaction: Hex) => Promise<unknown>;
  readonly observeExactTransaction: (transactionHash: Hex) => Promise<unknown>;
}

/** Restart seam: only a terminal-evidence append handle exists; signing/submission cannot start. */
export interface BscTestnetPtaWbnbPoolReconciliationRecoveryDependencies {
  readonly now: () => Date;
  readonly acquireRecoveryCapability: () => Promise<unknown>;
  readonly journal: BscTestnetPtaWbnbPoolTerminalReconciliationJournal;
  readonly observeExactTransaction: (transactionHash: Hex) => Promise<unknown>;
}

type DataRecord = Readonly<Record<string, unknown>>;

function issue(
  code: BscTestnetPtaWbnbPoolReconciliationIssueCode,
  path: string,
  message: string
): BscTestnetPtaWbnbPoolReconciliationIssue {
  return Object.freeze({ code, path, message });
}

function inspectRecord(input: unknown, expectedKeys: readonly string[]): DataRecord | null {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input) || isProxy(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) return null;
    const actual = (keys as string[]).sort();
    const expected = [...expectedKeys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function inspectArray(input: unknown, maximumLength: number): readonly unknown[] | null {
  try {
    if (
      !Array.isArray(input) ||
      isProxy(input) ||
      Object.getPrototypeOf(input) !== Array.prototype ||
      !Number.isSafeInteger(maximumLength) ||
      maximumLength < 0 ||
      input.length > maximumLength
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(input);
    const expectedKeys = [
      ...Array.from({ length: input.length }, (_unused, index) => index.toString()),
      "length"
    ];
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key, index) => key !== expectedKeys[index])
    ) {
      return null;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = descriptors[index.toString()];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        return null;
      }
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function canonicalUint(value: unknown, maximum: bigint = UINT256_MAX): bigint | null {
  if (typeof value !== "string" || value.length > 78 || !CANONICAL_UINT.test(value)) return null;
  try {
    const parsed = BigInt(value);
    if (parsed > maximum) return null;
    return parsed;
  } catch {
    return null;
  }
}

function exactBytes32(value: unknown): value is Hex {
  return typeof value === "string" && BYTES32.test(value);
}

function snapshotRecoveryAttempt(
  input: unknown
): BscTestnetPtaWbnbPoolRecoveryAttemptBinding | null {
  const recovery = inspectRecord(input, RECOVERY_KEYS);
  if (
    recovery === null ||
    recovery.generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION ||
    recovery.predecessorState !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE ||
    !exactBytes32(recovery.predecessorFenceSha256) ||
    recovery.predecessorFenceSha256 === ZERO_WORD ||
    !exactBytes32(recovery.attemptId) ||
    recovery.attemptId === ZERO_WORD
  ) {
    return null;
  }
  return Object.freeze({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorState: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
    predecessorFenceSha256: recovery.predecessorFenceSha256,
    attemptId: recovery.attemptId
  });
}

function sameRecoveryAttempt(
  left: BscTestnetPtaWbnbPoolRecoveryAttemptBinding,
  right: BscTestnetPtaWbnbPoolRecoveryAttemptBinding
): boolean {
  return RECOVERY_KEYS.every((key) => left[key] === right[key]);
}

function exactBytes(value: unknown, maximumBytes: number): value is Hex {
  return (
    typeof value === "string" &&
    Number.isSafeInteger(maximumBytes) &&
    maximumBytes >= 0 &&
    value.length <= 2 + maximumBytes * 2 &&
    BYTES.test(value)
  );
}

function exactUtc(value: unknown): number | null {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
}

function safeAddress(value: unknown): string | null {
  if (typeof value !== "string" || value.length !== 42) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function strictDateMilliseconds(value: unknown): number | null {
  try {
    if (isProxy(value) || !(value instanceof Date)) return null;
    if (Object.getPrototypeOf(value) !== Date.prototype || Reflect.ownKeys(value).length !== 0) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isSafeInteger(milliseconds) ? milliseconds : null;
  } catch {
    return null;
  }
}

function validClock(now: () => Date): number | null {
  try {
    if (typeof now !== "function" || isProxy(now)) return null;
    return strictDateMilliseconds(now());
  } catch {
    return null;
  }
}

const CAPABILITY_KEYS = [
  "authenticatedAt",
  "claimId",
  "envelopeHash",
  "expiresAt",
  "freshPreSubmissionDualRpcRecheckPerformed",
  "oneShotIntentId",
  "operation",
  "operationKey",
  "ownerAuthorizationDigest",
  "preSubmission",
  "recovery",
  "releaseCommit",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "schemaVersion",
  "scope",
  "signedCommitDurablyVerified",
  "transaction"
] as const;
const RECOVERY_KEYS = [
  "attemptId",
  "generation",
  "predecessorFenceSha256",
  "predecessorState"
] as const;
const PRE_SUBMISSION_KEYS = [
  "candidateCode",
  "candidateNonce",
  "canonicalFinalizedBlockVerified",
  "corroboratorOrigin",
  "finalizedAnchorDualProviderExactNumberVerified",
  "factoryPoolForward",
  "factoryPoolReverse",
  "finalizedBlockGasLimit",
  "finalizedBlockHash",
  "finalizedBlockNumber",
  "finalizedBlockTimestamp",
  "gasEstimate",
  "gasPriceWei",
  "latestNonce",
  "observedAt",
  "pendingNonce",
  "primaryOrigin",
  "providerAgreementVerified",
  "receiptByHash",
  "senderBalanceWei",
  "senderCode",
  "simulationReturnPool",
  "transactionByHash"
] as const;
const CAPABILITY_TRANSACTION_KEYS = [
  "chainId",
  "data",
  "from",
  "gasLimit",
  "gasPriceWei",
  "maximumCostWei",
  "nonce",
  "recoveredSigner",
  "signedTransaction",
  "signingHash",
  "to",
  "transactionHash",
  "type",
  "valueWei"
] as const;

async function validateSubmissionCapability(
  input: unknown,
  nowMilliseconds: number,
  requireCurrent: boolean
): Promise<
  | Readonly<{ status: "valid"; capability: BscTestnetPtaWbnbPoolSubmissionCapability }>
  | Readonly<{ status: "invalid"; issue: BscTestnetPtaWbnbPoolReconciliationIssue }>
> {
  const capability = inspectRecord(input, CAPABILITY_KEYS);
  if (capability === null) {
    return {
      status: "invalid",
      issue: issue("CAPABILITY_INVALID", "capability", "Capability shape is not exact plain data.")
    };
  }
  const recovery = snapshotRecoveryAttempt(capability.recovery);
  if (
    capability.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION ||
    capability.scope !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE ||
    capability.operation !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION ||
    capability.oneShotIntentId !== BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID ||
    capability.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    capability.signedCommitDurablyVerified !== true ||
    capability.freshPreSubmissionDualRpcRecheckPerformed !== true ||
    typeof capability.claimId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(capability.claimId) ||
    !exactBytes32(capability.envelopeHash) ||
    capability.envelopeHash === ZERO_WORD ||
    !exactBytes32(capability.reviewerApprovalDigest) ||
    capability.reviewerApprovalDigest === ZERO_WORD ||
    !exactBytes32(capability.ownerAuthorizationDigest) ||
    capability.ownerAuthorizationDigest === ZERO_WORD ||
    capability.reviewerApprovalDigest === capability.ownerAuthorizationDigest ||
    typeof capability.releaseCommit !== "string" ||
    !RELEASE_COMMIT.test(capability.releaseCommit) ||
    capability.releaseCommit === ZERO_RELEASE_COMMIT ||
    !exactBytes32(capability.runtimeManifestSha256) ||
    capability.runtimeManifestSha256 === ZERO_WORD ||
    recovery === null
  ) {
    return {
      status: "invalid",
      issue: issue("CAPABILITY_INVALID", "capability", "Capability binding is not exact.")
    };
  }
  const authenticatedAt = exactUtc(capability.authenticatedAt);
  const expiresAt = exactUtc(capability.expiresAt);
  if (
    authenticatedAt === null ||
    expiresAt === null ||
    expiresAt <= authenticatedAt ||
    expiresAt - authenticatedAt > MAXIMUM_CAPABILITY_LIFETIME_MILLISECONDS
  ) {
    return {
      status: "invalid",
      issue: issue(
        "CAPABILITY_INVALID",
        "capability.expiresAt",
        "Capability time window is invalid."
      )
    };
  }
  if (requireCurrent && (authenticatedAt > nowMilliseconds || nowMilliseconds >= expiresAt)) {
    return {
      status: "invalid",
      issue: issue(
        "CAPABILITY_EXPIRED",
        "capability.expiresAt",
        "Capability is not currently valid."
      )
    };
  }

  const preSubmission = inspectRecord(capability.preSubmission, PRE_SUBMISSION_KEYS);
  const preSubmissionObservedAt =
    preSubmission === null ? null : exactUtc(preSubmission.observedAt);
  const finalizedBlockNumber =
    preSubmission === null ? null : canonicalUint(preSubmission.finalizedBlockNumber);
  const finalizedBlockTimestamp =
    preSubmission === null ? null : canonicalUint(preSubmission.finalizedBlockTimestamp);
  const finalizedBlockGasLimit =
    preSubmission === null ? null : canonicalUint(preSubmission.finalizedBlockGasLimit);
  const senderBalanceWei =
    preSubmission === null ? null : canonicalUint(preSubmission.senderBalanceWei);
  const preflightGasEstimate =
    preSubmission === null
      ? null
      : canonicalUint(preSubmission.gasEstimate, BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE);
  const preflightGasPriceWei =
    preSubmission === null
      ? null
      : canonicalUint(preSubmission.gasPriceWei, BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI);
  if (
    preSubmission === null ||
    preSubmission.primaryOrigin !== BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN ||
    preSubmission.corroboratorOrigin !== BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN ||
    preSubmission.providerAgreementVerified !== true ||
    preSubmission.canonicalFinalizedBlockVerified !== true ||
    preSubmission.finalizedAnchorDualProviderExactNumberVerified !== true ||
    preSubmissionObservedAt === null ||
    preSubmissionObservedAt < authenticatedAt ||
    preSubmissionObservedAt >= expiresAt ||
    finalizedBlockNumber === null ||
    finalizedBlockNumber === 0n ||
    !exactBytes32(preSubmission.finalizedBlockHash) ||
    finalizedBlockTimestamp === null ||
    finalizedBlockTimestamp * 1_000n > BigInt(preSubmissionObservedAt) ||
    BigInt(preSubmissionObservedAt) - finalizedBlockTimestamp * 1_000n > 120_000n ||
    finalizedBlockGasLimit === null ||
    preSubmission.latestNonce !== "1" ||
    preSubmission.pendingNonce !== "1" ||
    preSubmission.transactionByHash !== null ||
    preSubmission.receiptByHash !== null ||
    preSubmission.factoryPoolForward !== ZERO_ADDRESS ||
    preSubmission.factoryPoolReverse !== ZERO_ADDRESS ||
    preSubmission.candidateCode !== "0x" ||
    preSubmission.candidateNonce !== "0" ||
    preSubmission.senderCode !== "0x" ||
    senderBalanceWei === null ||
    preflightGasEstimate === null ||
    preflightGasEstimate === 0n ||
    preflightGasPriceWei === null ||
    preflightGasPriceWei === 0n ||
    preSubmission.simulationReturnPool !== BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
  ) {
    return {
      status: "invalid",
      issue: issue(
        "CAPABILITY_INVALID",
        "capability.preSubmission",
        "Fresh two-provider pre-submission recheck is absent, stale, or not exact."
      )
    };
  }

  const transaction = inspectRecord(capability.transaction, CAPABILITY_TRANSACTION_KEYS);
  if (transaction === null) {
    return {
      status: "invalid",
      issue: issue(
        "CAPABILITY_INVALID",
        "capability.transaction",
        "Transaction binding is not exact plain data."
      )
    };
  }
  const gasLimit = canonicalUint(transaction.gasLimit, BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT);
  const gasPriceWei = canonicalUint(
    transaction.gasPriceWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI
  );
  const maximumCostWei = canonicalUint(
    transaction.maximumCostWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI
  );
  if (
    transaction.type !== "legacy" ||
    transaction.chainId !== BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID.toString() ||
    transaction.from !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    transaction.to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
    transaction.nonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE.toString() ||
    transaction.valueWei !== "0" ||
    transaction.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
    transaction.recoveredSigner !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    gasLimit === null ||
    gasLimit === 0n ||
    gasPriceWei === null ||
    gasPriceWei === 0n ||
    maximumCostWei === null ||
    gasLimit * gasPriceWei !== maximumCostWei ||
    calculateBscTestnetPtaWbnbPoolGasLimit(preflightGasEstimate) !== gasLimit ||
    preflightGasPriceWei !== gasPriceWei ||
    senderBalanceWei < maximumCostWei ||
    finalizedBlockGasLimit < gasLimit ||
    !exactBytes32(transaction.signingHash) ||
    transaction.signingHash === ZERO_WORD ||
    !exactBytes32(transaction.transactionHash) ||
    typeof transaction.signedTransaction !== "string" ||
    transaction.signedTransaction.length % 2 !== 0 ||
    (transaction.signedTransaction.length - 2) / 2 > MAXIMUM_SIGNED_TRANSACTION_BYTES ||
    !RAW_TRANSACTION.test(transaction.signedTransaction) ||
    keccak256(transaction.signedTransaction as Hex) !== transaction.transactionHash
  ) {
    return {
      status: "invalid",
      issue: issue(
        "SIGNED_TRANSACTION_INVALID",
        "capability.transaction",
        "Signed transaction content or fixed caps do not match the exact operation."
      )
    };
  }

  try {
    const raw = transaction.signedTransaction as Hex;
    const parsed = parseTransaction(raw);
    const parsedTo = parsed.to === undefined ? null : safeAddress(parsed.to);
    const yParity = parsed.yParity;
    const expectedV =
      yParity === 0 || yParity === 1
        ? BigInt(BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID) * 2n + 35n + BigInt(yParity)
        : null;
    if (
      parsed.type !== "legacy" ||
      parsed.chainId !== BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID ||
      parsed.nonce !== Number(BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE) ||
      parsedTo !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
      (parsed.value ?? 0n) !== 0n ||
      parsed.gas !== gasLimit ||
      parsed.gasPrice !== gasPriceWei ||
      parsed.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
      parsed.r === undefined ||
      parsed.s === undefined ||
      BigInt(parsed.r) === 0n ||
      BigInt(parsed.r) >= SECP256K1_ORDER ||
      BigInt(parsed.s) === 0n ||
      BigInt(parsed.s) > SECP256K1_HALF_ORDER ||
      expectedV === null ||
      parsed.v !== expectedV
    ) {
      return {
        status: "invalid",
        issue: issue(
          "SIGNED_TRANSACTION_INVALID",
          "capability.transaction.signedTransaction",
          "Serialized signed transaction is not the exact low-s legacy transaction."
        )
      };
    }
    const unsigned = serializeTransaction({
      chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      gas: gasLimit,
      gasPrice: gasPriceWei,
      nonce: Number(BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE),
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      type: "legacy",
      value: 0n
    });
    const canonicalSigned = serializeTransaction(
      {
        chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
        data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
        gas: gasLimit,
        gasPrice: gasPriceWei,
        nonce: Number(BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE),
        to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
        type: "legacy",
        value: 0n
      },
      { r: parsed.r, s: parsed.s, v: expectedV }
    );
    if (
      keccak256(unsigned) !== transaction.signingHash ||
      canonicalSigned !== raw ||
      keccak256(canonicalSigned) !== transaction.transactionHash
    ) {
      return {
        status: "invalid",
        issue: issue(
          "SIGNED_TRANSACTION_INVALID",
          "capability.transaction.signingHash",
          "Signing hash does not bind the exact unsigned transaction."
        )
      };
    }
    const recovered = getAddress(
      await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized })
    );
    if (recovered !== BSC_TESTNET_PTA_WBNB_POOL_SENDER) {
      return {
        status: "invalid",
        issue: issue(
          "SIGNER_MISMATCH",
          "capability.transaction.recoveredSigner",
          "Signed transaction does not recover the fixed sender."
        )
      };
    }
  } catch {
    return {
      status: "invalid",
      issue: issue(
        "SIGNED_TRANSACTION_INVALID",
        "capability.transaction.signedTransaction",
        "Signed transaction could not be parsed or recovered."
      )
    };
  }

  return {
    status: "valid",
    capability: Object.freeze({
      schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
      scope: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
      operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
      oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      claimId: capability.claimId,
      envelopeHash: capability.envelopeHash,
      reviewerApprovalDigest: capability.reviewerApprovalDigest,
      ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
      releaseCommit: capability.releaseCommit,
      runtimeManifestSha256: capability.runtimeManifestSha256,
      recovery,
      authenticatedAt: capability.authenticatedAt as string,
      expiresAt: capability.expiresAt as string,
      signedCommitDurablyVerified: true,
      freshPreSubmissionDualRpcRecheckPerformed: true,
      preSubmission: Object.freeze({
        primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
        corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
        providerAgreementVerified: true,
        canonicalFinalizedBlockVerified: true,
        finalizedAnchorDualProviderExactNumberVerified: true,
        observedAt: preSubmission.observedAt as string,
        finalizedBlockNumber: preSubmission.finalizedBlockNumber as string,
        finalizedBlockHash: preSubmission.finalizedBlockHash as Hex,
        finalizedBlockTimestamp: preSubmission.finalizedBlockTimestamp as string,
        finalizedBlockGasLimit: preSubmission.finalizedBlockGasLimit as string,
        latestNonce: "1",
        pendingNonce: "1",
        transactionByHash: null,
        receiptByHash: null,
        factoryPoolForward: ZERO_ADDRESS,
        factoryPoolReverse: ZERO_ADDRESS,
        candidateCode: "0x",
        candidateNonce: "0",
        senderCode: "0x",
        senderBalanceWei: preSubmission.senderBalanceWei as string,
        gasEstimate: preSubmission.gasEstimate as string,
        gasPriceWei: preSubmission.gasPriceWei as string,
        simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
      }),
      transaction: Object.freeze({
        type: "legacy",
        chainId: "97",
        from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
        to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
        nonce: "1",
        valueWei: "0",
        gasLimit: transaction.gasLimit as string,
        gasPriceWei: transaction.gasPriceWei as string,
        maximumCostWei: transaction.maximumCostWei as string,
        data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
        signingHash: transaction.signingHash,
        signedTransaction: transaction.signedTransaction as Hex,
        transactionHash: transaction.transactionHash,
        recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
      })
    })
  };
}

function parseJournalState(
  input: unknown,
  capability: BscTestnetPtaWbnbPoolSubmissionCapability
): BscTestnetPtaWbnbPoolSubmissionJournalState | null {
  const state = inspectRecord(input, [
    "claimId",
    "envelopeHash",
    "operationKey",
    "ownerAuthorizationDigest",
    "recovery",
    "releaseCommit",
    "reviewerApprovalDigest",
    "runtimeManifestSha256",
    "schemaVersion",
    "signedTransactionKeccak256",
    "signingHash",
    "state",
    "submissionStartedDigest",
    "transactionHash"
  ]);
  const expectedStart = submissionStartedRequest(capability);
  const recovery = state === null ? null : snapshotRecoveryAttempt(state.recovery);
  if (
    state === null ||
    recovery === null ||
    state.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION ||
    state.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    state.claimId !== capability.claimId ||
    state.envelopeHash !== capability.envelopeHash ||
    state.releaseCommit !== capability.releaseCommit ||
    state.runtimeManifestSha256 !== capability.runtimeManifestSha256 ||
    state.reviewerApprovalDigest !== capability.reviewerApprovalDigest ||
    state.ownerAuthorizationDigest !== capability.ownerAuthorizationDigest ||
    !sameRecoveryAttempt(recovery, capability.recovery) ||
    state.signingHash !== capability.transaction.signingHash ||
    state.transactionHash !== capability.transaction.transactionHash ||
    state.signedTransactionKeccak256 !== expectedStart.signedTransactionKeccak256 ||
    state.submissionStartedDigest !== expectedStart.submissionStartedDigest ||
    (state.state !== "signed_committed" &&
      state.state !== "submission_started" &&
      state.state !== "confirmed" &&
      state.state !== "reverted" &&
      state.state !== "unknown_outcome")
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: capability.claimId,
    envelopeHash: capability.envelopeHash,
    releaseCommit: capability.releaseCommit,
    runtimeManifestSha256: capability.runtimeManifestSha256,
    reviewerApprovalDigest: capability.reviewerApprovalDigest,
    ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
    recovery: capability.recovery,
    signingHash: capability.transaction.signingHash,
    transactionHash: capability.transaction.transactionHash,
    signedTransactionKeccak256: expectedStart.signedTransactionKeccak256,
    submissionStartedDigest: expectedStart.submissionStartedDigest,
    state: state.state
  });
}

function submissionStartedRequest(
  capability: BscTestnetPtaWbnbPoolSubmissionCapability
): BscTestnetPtaWbnbPoolSubmissionStartedRequest {
  const body = Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: capability.claimId,
    envelopeHash: capability.envelopeHash,
    releaseCommit: capability.releaseCommit,
    runtimeManifestSha256: capability.runtimeManifestSha256,
    reviewerApprovalDigest: capability.reviewerApprovalDigest,
    ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
    recovery: capability.recovery,
    signingHash: capability.transaction.signingHash,
    transactionHash: capability.transaction.transactionHash,
    signedTransactionKeccak256: keccak256(capability.transaction.signedTransaction)
  });
  return Object.freeze({
    ...body,
    submissionStartedDigest: keccak256(
      stringToHex(`${SUBMISSION_STARTED_DIGEST_DOMAIN}\u0000${JSON.stringify(body)}`)
    )
  });
}

/** Strictly derives the immutable durable-journal seed from an authenticated capability's bytes. */
export async function deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
  untrustedCapability: unknown,
  asOf: unknown
): Promise<BscTestnetPtaWbnbPoolSubmissionJournalState | null> {
  const milliseconds = strictDateMilliseconds(asOf);
  if (milliseconds === null) return null;
  const validated = await validateSubmissionCapability(untrustedCapability, milliseconds, false);
  if (validated.status === "invalid") return null;
  const capability = validated.capability;
  const started = submissionStartedRequest(capability);
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: capability.claimId,
    envelopeHash: capability.envelopeHash,
    releaseCommit: capability.releaseCommit,
    runtimeManifestSha256: capability.runtimeManifestSha256,
    reviewerApprovalDigest: capability.reviewerApprovalDigest,
    ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
    recovery: capability.recovery,
    signingHash: capability.transaction.signingHash,
    transactionHash: capability.transaction.transactionHash,
    signedTransactionKeccak256: keccak256(capability.transaction.signedTransaction),
    submissionStartedDigest: started.submissionStartedDigest,
    state: "signed_committed" as const
  });
}

function validSubmissionStartedAck(
  input: unknown,
  request: BscTestnetPtaWbnbPoolSubmissionStartedRequest
): "started_by_this_call" | "already_started" | null {
  const ack = inspectRecord(input, ["status", "submissionStartedDigest", "transactionHash"]);
  if (
    ack !== null &&
    (ack.status === "started_by_this_call" || ack.status === "already_started") &&
    ack.submissionStartedDigest === request.submissionStartedDigest &&
    ack.transactionHash === request.transactionHash
  ) {
    return ack.status;
  }
  return null;
}

function parseBlock(input: unknown): BscTestnetPtaWbnbPoolNormalizedBlock | null {
  const block = inspectRecord(input, [
    "hash",
    "number",
    "parentHash",
    "timestamp",
    "transactionHashes"
  ]);
  const transactionHashes =
    block === null ? null : inspectArray(block.transactionHashes, MAXIMUM_BLOCK_TRANSACTION_HASHES);
  if (
    block === null ||
    transactionHashes === null ||
    transactionHashes.some((hash) => !exactBytes32(hash)) ||
    canonicalUint(block.number) === null ||
    canonicalUint(block.timestamp) === null ||
    !exactBytes32(block.hash) ||
    !exactBytes32(block.parentHash)
  ) {
    return null;
  }
  return Object.freeze({
    number: block.number as string,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: block.timestamp as string,
    transactionHashes: Object.freeze(transactionHashes as Hex[])
  });
}

function parseAncestryHeader(input: unknown): BscTestnetPtaWbnbPoolNormalizedAncestryHeader | null {
  const header = inspectRecord(input, ["hash", "number", "parentHash", "timestamp"]);
  const number = header === null ? null : canonicalUint(header.number);
  const timestamp = header === null ? null : canonicalUint(header.timestamp);
  if (
    header === null ||
    number === null ||
    timestamp === null ||
    !exactBytes32(header.hash) ||
    !exactBytes32(header.parentHash)
  ) {
    return null;
  }
  return Object.freeze({
    number: number.toString(),
    hash: header.hash,
    parentHash: header.parentHash,
    timestamp: timestamp.toString()
  });
}

function parseNormalizedTransaction(
  input: unknown,
  capability: BscTestnetPtaWbnbPoolSubmissionCapability
): BscTestnetPtaWbnbPoolNormalizedTransaction | null {
  const transaction = inspectRecord(input, [
    "blockHash",
    "blockNumber",
    "chainId",
    "from",
    "gasLimit",
    "gasPriceWei",
    "hash",
    "input",
    "nonce",
    "to",
    "transactionIndex",
    "type",
    "valueWei"
  ]);
  if (transaction === null) return null;
  const from = safeAddress(transaction.from);
  const to = safeAddress(transaction.to);
  const minedValuesAreNull =
    transaction.blockHash === null &&
    transaction.blockNumber === null &&
    transaction.transactionIndex === null;
  const minedValuesAreComplete =
    exactBytes32(transaction.blockHash) &&
    canonicalUint(transaction.blockNumber) !== null &&
    canonicalUint(transaction.transactionIndex) !== null;
  if (
    transaction.hash !== capability.transaction.transactionHash ||
    transaction.type !== "legacy" ||
    transaction.chainId !== "97" ||
    from !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
    transaction.nonce !== "1" ||
    transaction.valueWei !== "0" ||
    transaction.gasLimit !== capability.transaction.gasLimit ||
    transaction.gasPriceWei !== capability.transaction.gasPriceWei ||
    transaction.input !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
    (!minedValuesAreNull && !minedValuesAreComplete)
  ) {
    return null;
  }
  return Object.freeze({
    hash: capability.transaction.transactionHash,
    type: "legacy",
    chainId: "97",
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    nonce: "1",
    valueWei: "0",
    gasLimit: capability.transaction.gasLimit,
    gasPriceWei: capability.transaction.gasPriceWei,
    input: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    blockHash: transaction.blockHash as Hex | null,
    blockNumber: transaction.blockNumber as string | null,
    transactionIndex: transaction.transactionIndex as string | null
  });
}

function parseLog(input: unknown): BscTestnetPtaWbnbPoolNormalizedLog | null {
  const log = inspectRecord(input, [
    "address",
    "blockHash",
    "blockNumber",
    "data",
    "logIndex",
    "removed",
    "topics",
    "transactionHash",
    "transactionIndex"
  ]);
  if (log === null) return null;
  const address = safeAddress(log.address);
  const topics = inspectArray(log.topics, 4);
  if (
    address === null ||
    topics === null ||
    topics.some((topic) => !exactBytes32(topic)) ||
    !exactBytes(log.data, 128) ||
    !exactBytes32(log.blockHash) ||
    canonicalUint(log.blockNumber) === null ||
    !exactBytes32(log.transactionHash) ||
    canonicalUint(log.transactionIndex) === null ||
    canonicalUint(log.logIndex) === null ||
    log.removed !== false
  ) {
    return null;
  }
  return Object.freeze({
    address,
    topics: Object.freeze(topics as Hex[]),
    data: log.data,
    blockHash: log.blockHash,
    blockNumber: log.blockNumber as string,
    transactionHash: log.transactionHash,
    transactionIndex: log.transactionIndex as string,
    logIndex: log.logIndex as string,
    removed: false
  });
}

function deriveLogsBloom(logs: readonly BscTestnetPtaWbnbPoolNormalizedLog[]): Hex {
  const bloom = new Uint8Array(256);
  for (const log of logs) {
    const values = [log.address as Hex, ...log.topics] as const;
    for (const value of values) {
      const hash = hexToBytes(keccak256(value));
      for (let offset = 0; offset < 6; offset += 2) {
        const high = hash[offset];
        const low = hash[offset + 1];
        if (high === undefined || low === undefined) throw new Error("Keccak digest is truncated.");
        const bit = ((high << 8) | low) & 2_047;
        const byteIndex = 255 - Math.floor(bit / 8);
        const current = bloom[byteIndex];
        if (current === undefined) throw new Error("Bloom bit is out of bounds.");
        bloom[byteIndex] = current | (1 << (bit % 8));
      }
    }
  }
  return `0x${Array.from(bloom, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function parseReceipt(
  input: unknown,
  capability: BscTestnetPtaWbnbPoolSubmissionCapability
): BscTestnetPtaWbnbPoolNormalizedReceipt | null {
  const receipt = inspectRecord(input, [
    "blockHash",
    "blockNumber",
    "contractAddress",
    "cumulativeGasUsed",
    "effectiveGasPriceWei",
    "from",
    "gasUsed",
    "logs",
    "logsBloom",
    "status",
    "to",
    "transactionHash",
    "transactionIndex",
    "type"
  ]);
  if (receipt === null) return null;
  const from = safeAddress(receipt.from);
  const to = safeAddress(receipt.to);
  const cumulativeGasUsed = canonicalUint(receipt.cumulativeGasUsed);
  const gasUsed = canonicalUint(receipt.gasUsed, BigInt(capability.transaction.gasLimit));
  const effectiveGasPriceWei = canonicalUint(
    receipt.effectiveGasPriceWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI
  );
  const logs = inspectArray(receipt.logs, 2);
  if (
    receipt.transactionHash !== capability.transaction.transactionHash ||
    canonicalUint(receipt.transactionIndex) === null ||
    !exactBytes32(receipt.blockHash) ||
    canonicalUint(receipt.blockNumber) === null ||
    from !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
    receipt.contractAddress !== null ||
    cumulativeGasUsed === null ||
    gasUsed === null ||
    gasUsed === 0n ||
    cumulativeGasUsed < gasUsed ||
    effectiveGasPriceWei === null ||
    effectiveGasPriceWei !== BigInt(capability.transaction.gasPriceWei) ||
    (receipt.status !== "0" && receipt.status !== "1") ||
    receipt.type !== "legacy" ||
    typeof receipt.logsBloom !== "string" ||
    !BLOOM.test(receipt.logsBloom) ||
    logs === null
  ) {
    return null;
  }
  const parsedLogs: BscTestnetPtaWbnbPoolNormalizedLog[] = [];
  for (const entry of logs) {
    const parsed = parseLog(entry);
    if (parsed === null) return null;
    parsedLogs.push(parsed);
  }
  if (deriveLogsBloom(parsedLogs) !== receipt.logsBloom) return null;
  return Object.freeze({
    transactionHash: capability.transaction.transactionHash,
    transactionIndex: receipt.transactionIndex as string,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber as string,
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    contractAddress: null,
    cumulativeGasUsed: receipt.cumulativeGasUsed as string,
    gasUsed: receipt.gasUsed as string,
    effectiveGasPriceWei: receipt.effectiveGasPriceWei as string,
    status: receipt.status,
    type: "legacy",
    logsBloom: receipt.logsBloom as Hex,
    logs: Object.freeze(parsedLogs)
  });
}

function parsePostState(input: unknown): BscTestnetPtaWbnbPoolPostState | null {
  const postState = inspectRecord(input, [
    "eip1898Block",
    "eip1967Slots",
    "factoryPoolForward",
    "factoryPoolReverse",
    "pool",
    "poolAccountNonce",
    "poolRuntimeCode"
  ]);
  if (postState === null) return null;
  const eip1898Block = inspectRecord(postState.eip1898Block, ["blockHash", "requireCanonical"]);
  const slots = inspectRecord(postState.eip1967Slots, ["admin", "beacon", "implementation"]);
  const pool = inspectRecord(postState.pool, [
    "factory",
    "fee",
    "liquidity",
    "lmPool",
    "maxLiquidityPerTick",
    "observation0",
    "slot0",
    "tickSpacing",
    "token0",
    "token1"
  ]);
  if (eip1898Block === null || slots === null || pool === null) return null;
  const slot0 = inspectRecord(pool.slot0, [
    "feeProtocol",
    "observationCardinality",
    "observationCardinalityNext",
    "observationIndex",
    "sqrtPriceX96",
    "tick",
    "unlocked"
  ]);
  const observation0 = inspectRecord(pool.observation0, [
    "blockTimestamp",
    "initialized",
    "secondsPerLiquidityCumulativeX128",
    "tickCumulative"
  ]);
  if (
    slot0 === null ||
    observation0 === null ||
    !exactBytes32(eip1898Block.blockHash) ||
    eip1898Block.requireCanonical !== true ||
    postState.factoryPoolForward !== BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE ||
    postState.factoryPoolReverse !== BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE ||
    postState.poolAccountNonce !== "1" ||
    !exactBytes(postState.poolRuntimeCode, BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_RUNTIME_BYTES) ||
    (postState.poolRuntimeCode.length - 2) / 2 !==
      BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_RUNTIME_BYTES ||
    keccak256(postState.poolRuntimeCode) !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_RUNTIME_KECCAK256 ||
    slots.implementation !== ZERO_WORD ||
    slots.admin !== ZERO_WORD ||
    slots.beacon !== ZERO_WORD ||
    pool.factory !== BSC_TESTNET_PANCAKE_V3_FACTORY ||
    pool.token0 !== BSC_TESTNET_PTA_ADDRESS ||
    pool.token1 !== BSC_TESTNET_WBNB_ADDRESS ||
    pool.fee !== BSC_TESTNET_PTA_WBNB_POOL_FEE.toString() ||
    pool.tickSpacing !== BSC_TESTNET_PTA_WBNB_POOL_TICK_SPACING.toString() ||
    pool.maxLiquidityPerTick !==
      BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_MAX_LIQUIDITY_PER_TICK.toString() ||
    pool.liquidity !== "0" ||
    pool.lmPool !== ZERO_ADDRESS ||
    slot0.sqrtPriceX96 !== BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96.toString() ||
    slot0.tick !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_TICK.toString() ||
    slot0.observationIndex !== "0" ||
    slot0.observationCardinality !== "1" ||
    slot0.observationCardinalityNext !== "1" ||
    slot0.feeProtocol !== "222825800" ||
    slot0.unlocked !== true ||
    canonicalUint(observation0.blockTimestamp, (1n << 32n) - 1n) === null ||
    observation0.tickCumulative !== "0" ||
    observation0.secondsPerLiquidityCumulativeX128 !== "0" ||
    observation0.initialized !== true
  ) {
    return null;
  }
  return Object.freeze({
    eip1898Block: Object.freeze({ blockHash: eip1898Block.blockHash, requireCanonical: true }),
    factoryPoolForward: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
    factoryPoolReverse: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
    poolAccountNonce: "1",
    poolRuntimeCode: postState.poolRuntimeCode,
    eip1967Slots: Object.freeze({
      implementation: ZERO_WORD,
      admin: ZERO_WORD,
      beacon: ZERO_WORD
    }),
    pool: Object.freeze({
      factory: BSC_TESTNET_PANCAKE_V3_FACTORY,
      token0: BSC_TESTNET_PTA_ADDRESS,
      token1: BSC_TESTNET_WBNB_ADDRESS,
      fee: "500",
      tickSpacing: "10",
      maxLiquidityPerTick:
        BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_MAX_LIQUIDITY_PER_TICK.toString() as "1917569901783203986719870431555990",
      liquidity: "0",
      lmPool: ZERO_ADDRESS,
      slot0: Object.freeze({
        sqrtPriceX96:
          BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96.toString() as "79228162514264337593543950",
        tick: BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_TICK.toString() as "-138163",
        observationIndex: "0",
        observationCardinality: "1",
        observationCardinalityNext: "1",
        feeProtocol: "222825800",
        unlocked: true
      }),
      observation0: Object.freeze({
        blockTimestamp: observation0.blockTimestamp as string,
        tickCumulative: "0",
        secondsPerLiquidityCumulativeX128: "0",
        initialized: true
      })
    })
  });
}

function parseProvider(
  input: unknown,
  expectedOrigin:
    | typeof BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN
    | typeof BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  capability: BscTestnetPtaWbnbPoolSubmissionCapability
): BscTestnetPtaWbnbPoolProviderReconciliationEvidence | null {
  const provider = inspectRecord(input, [
    "chainId",
    "checkpointBlockRecheck",
    "checkpointCanonicalAttestation",
    "commonFinalizedBlock",
    "origin",
    "postState",
    "receipt",
    "receiptBlock",
    "receiptBlockLookup",
    "receiptToCommonFinalizedAncestry",
    "recheckedFinalizedHead",
    "reportedFinalizedHead",
    "transaction"
  ]);
  if (provider === null || provider.origin !== expectedOrigin || provider.chainId !== "97") {
    return null;
  }
  const transaction =
    provider.transaction === null
      ? null
      : parseNormalizedTransaction(provider.transaction, capability);
  const receipt = provider.receipt === null ? null : parseReceipt(provider.receipt, capability);
  const reportedFinalizedHead = parseBlock(provider.reportedFinalizedHead);
  const recheckedFinalizedHead = parseBlock(provider.recheckedFinalizedHead);
  const commonFinalizedBlock =
    provider.commonFinalizedBlock === null ? null : parseBlock(provider.commonFinalizedBlock);
  const checkpointBlockRecheck =
    provider.checkpointBlockRecheck === null ? null : parseBlock(provider.checkpointBlockRecheck);
  const checkpointCanonicalAttestation =
    provider.checkpointCanonicalAttestation === null
      ? null
      : inspectRecord(provider.checkpointCanonicalAttestation, [
          "address",
          "eip1898Block",
          "method",
          "resultWei"
        ]);
  const checkpointCanonicalEip1898Block =
    checkpointCanonicalAttestation === null
      ? null
      : inspectRecord(checkpointCanonicalAttestation.eip1898Block, [
          "blockHash",
          "requireCanonical"
        ]);
  const receiptBlock = provider.receiptBlock === null ? null : parseBlock(provider.receiptBlock);
  const ancestryInput = inspectArray(
    provider.receiptToCommonFinalizedAncestry,
    BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_FINALITY_ANCESTRY_BLOCKS
  );
  const ancestry =
    ancestryInput === null ? null : ancestryInput.map((entry) => parseAncestryHeader(entry));
  const receiptBlockLookup =
    provider.receiptBlockLookup === null
      ? null
      : inspectRecord(provider.receiptBlockLookup, [
          "exactNumberCanonicalLookup",
          "includeFullTransactions",
          "method",
          "requestedBlockNumber"
        ]);
  const postState = provider.postState === null ? null : parsePostState(provider.postState);
  if (
    (provider.transaction !== null && transaction === null) ||
    (provider.receipt !== null && receipt === null) ||
    reportedFinalizedHead === null ||
    recheckedFinalizedHead === null ||
    (provider.commonFinalizedBlock !== null && commonFinalizedBlock === null) ||
    (provider.checkpointBlockRecheck !== null && checkpointBlockRecheck === null) ||
    (provider.checkpointCanonicalAttestation !== null &&
      (checkpointCanonicalAttestation === null ||
        checkpointCanonicalAttestation.method !== "eth_getBalance" ||
        checkpointCanonicalAttestation.address !== ZERO_ADDRESS ||
        checkpointCanonicalEip1898Block === null ||
        !exactBytes32(checkpointCanonicalEip1898Block.blockHash) ||
        checkpointCanonicalEip1898Block.requireCanonical !== true ||
        canonicalUint(checkpointCanonicalAttestation.resultWei) === null)) ||
    (provider.receiptBlock !== null && receiptBlock === null) ||
    ancestry === null ||
    ancestry.some((block) => block === null) ||
    (provider.receiptBlockLookup !== null &&
      (receiptBlockLookup === null ||
        receiptBlockLookup.method !== "eth_getBlockByNumber" ||
        receiptBlockLookup.includeFullTransactions !== false ||
        receiptBlockLookup.exactNumberCanonicalLookup !== true ||
        canonicalUint(receiptBlockLookup.requestedBlockNumber) === null)) ||
    (provider.postState !== null && postState === null)
  ) {
    return null;
  }
  return Object.freeze({
    origin: expectedOrigin,
    chainId: "97",
    transaction,
    receipt,
    reportedFinalizedHead,
    recheckedFinalizedHead,
    commonFinalizedBlock,
    checkpointBlockRecheck,
    checkpointCanonicalAttestation:
      checkpointCanonicalAttestation === null || checkpointCanonicalEip1898Block === null
        ? null
        : Object.freeze({
            method: "eth_getBalance" as const,
            address: ZERO_ADDRESS,
            eip1898Block: Object.freeze({
              blockHash: checkpointCanonicalEip1898Block.blockHash as Hex,
              requireCanonical: true as const
            }),
            resultWei: checkpointCanonicalAttestation.resultWei as string
          }),
    receiptBlockLookup:
      receiptBlockLookup === null
        ? null
        : Object.freeze({
            method: "eth_getBlockByNumber" as const,
            requestedBlockNumber: receiptBlockLookup.requestedBlockNumber as string,
            includeFullTransactions: false as const,
            exactNumberCanonicalLookup: true as const
          }),
    receiptBlock,
    receiptToCommonFinalizedAncestry: Object.freeze(
      ancestry as BscTestnetPtaWbnbPoolNormalizedAncestryHeader[]
    ),
    postState
  });
}

function exactLogBindings(
  receipt: BscTestnetPtaWbnbPoolNormalizedReceipt,
  receiptBlock: BscTestnetPtaWbnbPoolNormalizedBlock,
  postState: BscTestnetPtaWbnbPoolPostState | null
): boolean {
  if (receipt.status === "0") return receipt.logs.length === 0 && postState === null;
  if (receipt.logs.length !== 2 || postState === null) return false;
  const [poolCreated, initialize] = receipt.logs;
  if (poolCreated === undefined || initialize === undefined) return false;
  const commonLogBinding = (log: BscTestnetPtaWbnbPoolNormalizedLog) =>
    log.blockHash === receipt.blockHash &&
    log.blockNumber === receipt.blockNumber &&
    log.transactionHash === receipt.transactionHash &&
    log.transactionIndex === receipt.transactionIndex &&
    log.removed === false;
  const firstLogIndex = canonicalUint(poolCreated.logIndex);
  const secondLogIndex = canonicalUint(initialize.logIndex);
  return (
    commonLogBinding(poolCreated) &&
    commonLogBinding(initialize) &&
    firstLogIndex !== null &&
    secondLogIndex === firstLogIndex + 1n &&
    poolCreated.address === BSC_TESTNET_PANCAKE_V3_FACTORY &&
    poolCreated.topics.length === 4 &&
    poolCreated.topics[0] === BSC_TESTNET_PTA_WBNB_POOL_CREATED_TOPIC &&
    poolCreated.topics[1] === POOL_CREATED_TOKEN0_TOPIC &&
    poolCreated.topics[2] === POOL_CREATED_TOKEN1_TOPIC &&
    poolCreated.topics[3] === POOL_CREATED_FEE_TOPIC &&
    poolCreated.data === POOL_CREATED_DATA &&
    initialize.address === BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE &&
    initialize.topics.length === 1 &&
    initialize.topics[0] === BSC_TESTNET_PTA_WBNB_POOL_INITIALIZE_TOPIC &&
    initialize.data === INITIALIZE_DATA &&
    postState.pool.observation0.blockTimestamp === receiptBlock.timestamp
  );
}

function invalidReconciliation(
  code: BscTestnetPtaWbnbPoolReconciliationIssueCode,
  path: string,
  message: string,
  transactionHash: Hex | null
): BscTestnetPtaWbnbPoolReconciliationResult {
  return Object.freeze({
    status: "invalid" as const,
    transactionHash,
    reconciliationDigest: null,
    issue: issue(code, path, message)
  });
}

function pendingReconciliation(
  transactionHash: Hex,
  pendingIssue: BscTestnetPtaWbnbPoolReconciliationIssue | null = null
): BscTestnetPtaWbnbPoolReconciliationResult {
  return Object.freeze({
    status: "pending" as const,
    transactionHash,
    reconciliationDigest: null,
    issue: pendingIssue
  });
}

function reconcileEvidence(
  evidenceInput: unknown,
  capability: BscTestnetPtaWbnbPoolSubmissionCapability,
  nowMilliseconds: number
): BscTestnetPtaWbnbPoolReconciliationResult {
  const evidence = inspectRecord(evidenceInput, [
    "corroborator",
    "observedAt",
    "operation",
    "operationKey",
    "primary",
    "schemaVersion",
    "transactionHash"
  ]);
  if (
    evidence === null ||
    evidence.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION ||
    evidence.operation !== BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION ||
    evidence.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    evidence.transactionHash !== capability.transaction.transactionHash
  ) {
    return invalidReconciliation(
      "INPUT_INVALID",
      "evidence",
      "Reconciliation evidence binding is not exact.",
      capability.transaction.transactionHash
    );
  }
  const observedAt = exactUtc(evidence.observedAt);
  if (observedAt === null || observedAt > nowMilliseconds) {
    return invalidReconciliation(
      "CLOCK_INVALID",
      "evidence.observedAt",
      "Reconciliation observation time is invalid or from the future.",
      capability.transaction.transactionHash
    );
  }
  const primary = parseProvider(
    evidence.primary,
    BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
    capability
  );
  const corroborator = parseProvider(
    evidence.corroborator,
    BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
    capability
  );
  if (primary === null || corroborator === null) {
    return invalidReconciliation(
      "INPUT_INVALID",
      "evidence.providers",
      "A provider observation is malformed or not bound to its fixed origin.",
      capability.transaction.transactionHash
    );
  }

  if (primary.transaction === null || corroborator.transaction === null) {
    if (
      primary.receipt !== null ||
      corroborator.receipt !== null ||
      primary.postState !== null ||
      corroborator.postState !== null
    ) {
      return invalidReconciliation(
        "TRANSACTION_INVALID",
        "evidence.providers.transaction",
        "Receipt or post-state exists without the exact transaction on both providers.",
        capability.transaction.transactionHash
      );
    }
    return pendingReconciliation(capability.transaction.transactionHash);
  }
  if (!sameJson(primary.transaction, corroborator.transaction)) {
    return pendingReconciliation(
      capability.transaction.transactionHash,
      issue(
        "PROVIDER_DISAGREEMENT",
        "evidence.providers.transaction",
        "Providers do not yet agree on the exact normalized transaction."
      )
    );
  }

  if (primary.receipt === null || corroborator.receipt === null) {
    if (primary.postState !== null || corroborator.postState !== null) {
      return invalidReconciliation(
        "RECEIPT_INVALID",
        "evidence.providers.receipt",
        "Post-state exists without receipts from both providers.",
        capability.transaction.transactionHash
      );
    }
    return pendingReconciliation(
      capability.transaction.transactionHash,
      primary.receipt === corroborator.receipt
        ? null
        : issue(
            "PROVIDER_DISAGREEMENT",
            "evidence.providers.receipt",
            "Only one provider currently observes the receipt."
          )
    );
  }
  if (!sameJson(primary.receipt, corroborator.receipt)) {
    return pendingReconciliation(
      capability.transaction.transactionHash,
      issue(
        "PROVIDER_DISAGREEMENT",
        "evidence.providers.receipt",
        "Providers do not agree on the exact normalized receipt."
      )
    );
  }
  const transaction = primary.transaction;
  const receipt = primary.receipt;
  if (
    transaction.blockHash !== receipt.blockHash ||
    transaction.blockNumber !== receipt.blockNumber ||
    transaction.transactionIndex !== receipt.transactionIndex
  ) {
    return invalidReconciliation(
      "TRANSACTION_INVALID",
      "evidence.providers.transaction",
      "Mined transaction location does not match its receipt.",
      capability.transaction.transactionHash
    );
  }

  const primaryHead = canonicalUint(primary.reportedFinalizedHead.number);
  const corroboratorHead = canonicalUint(corroborator.reportedFinalizedHead.number);
  const primaryRecheckedHead = canonicalUint(primary.recheckedFinalizedHead.number);
  const corroboratorRecheckedHead = canonicalUint(corroborator.recheckedFinalizedHead.number);
  if (
    primaryHead === null ||
    corroboratorHead === null ||
    primaryRecheckedHead === null ||
    corroboratorRecheckedHead === null
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.reportedFinalizedHead",
      "Finalized-head sandwich quantities are invalid.",
      capability.transaction.transactionHash
    );
  }
  const observedAtMilliseconds = BigInt(observedAt);
  const primaryHeadTimestamp = canonicalUint(primary.reportedFinalizedHead.timestamp);
  const corroboratorHeadTimestamp = canonicalUint(corroborator.reportedFinalizedHead.timestamp);
  const primaryRecheckedHeadTimestamp = canonicalUint(primary.recheckedFinalizedHead.timestamp);
  const corroboratorRecheckedHeadTimestamp = canonicalUint(
    corroborator.recheckedFinalizedHead.timestamp
  );
  if (
    primaryHeadTimestamp === null ||
    corroboratorHeadTimestamp === null ||
    primaryRecheckedHeadTimestamp === null ||
    corroboratorRecheckedHeadTimestamp === null ||
    primaryHeadTimestamp * 1_000n > observedAtMilliseconds ||
    corroboratorHeadTimestamp * 1_000n > observedAtMilliseconds ||
    primaryRecheckedHeadTimestamp * 1_000n > observedAtMilliseconds ||
    corroboratorRecheckedHeadTimestamp * 1_000n > observedAtMilliseconds
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.reportedFinalizedHead.timestamp",
      "Finalized-head sandwich timestamps are invalid or future-dated.",
      capability.transaction.transactionHash
    );
  }
  if (
    primaryRecheckedHead < primaryHead ||
    corroboratorRecheckedHead < corroboratorHead ||
    primaryRecheckedHeadTimestamp < primaryHeadTimestamp ||
    corroboratorRecheckedHeadTimestamp < corroboratorHeadTimestamp ||
    (primaryRecheckedHead === primaryHead &&
      !sameJson(primary.reportedFinalizedHead, primary.recheckedFinalizedHead)) ||
    (corroboratorRecheckedHead === corroboratorHead &&
      !sameJson(corroborator.reportedFinalizedHead, corroborator.recheckedFinalizedHead))
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.recheckedFinalizedHead",
      "The second finalized head regressed or changed at the same block number.",
      capability.transaction.transactionHash
    );
  }
  const receiptNumber = canonicalUint(receipt.blockNumber);
  if (receiptNumber === null) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.receipt.blockNumber",
      "Receipt block number is invalid.",
      capability.transaction.transactionHash
    );
  }
  const expectedCheckpointNumber =
    receiptNumber + BigInt(BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_FINALITY_ANCESTRY_BLOCKS);
  if (expectedCheckpointNumber > UINT256_MAX) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.receipt.blockNumber",
      "Receipt block cannot derive the fixed finality checkpoint.",
      capability.transaction.transactionHash
    );
  }
  if (
    primaryHead < expectedCheckpointNumber ||
    corroboratorHead < expectedCheckpointNumber ||
    primaryRecheckedHead < expectedCheckpointNumber ||
    corroboratorRecheckedHead < expectedCheckpointNumber
  ) {
    return pendingReconciliation(
      capability.transaction.transactionHash,
      issue(
        "FINALITY_PENDING",
        "evidence.providers.reportedFinalizedHead",
        "The fixed receipt-plus-128 checkpoint is not yet below both finalized-head sandwiches."
      )
    );
  }
  if (primary.commonFinalizedBlock === null || corroborator.commonFinalizedBlock === null) {
    return pendingReconciliation(
      capability.transaction.transactionHash,
      issue(
        "FINALITY_PENDING",
        "evidence.providers.commonFinalizedBlock",
        "The fixed receipt-plus-128 finalized checkpoint has not been observed on both providers."
      )
    );
  }
  if (!sameJson(primary.commonFinalizedBlock, corroborator.commonFinalizedBlock)) {
    return pendingReconciliation(
      capability.transaction.transactionHash,
      issue(
        "PROVIDER_DISAGREEMENT",
        "evidence.providers.commonFinalizedBlock",
        "Providers do not agree on the fixed receipt-plus-128 finalized checkpoint."
      )
    );
  }
  if (primary.commonFinalizedBlock.number !== expectedCheckpointNumber.toString()) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.commonFinalizedBlock",
      "The finalized checkpoint is not exactly 128 blocks after the receipt block.",
      capability.transaction.transactionHash
    );
  }
  if (
    (primaryHead === expectedCheckpointNumber &&
      !sameJson(primary.reportedFinalizedHead, primary.commonFinalizedBlock)) ||
    (corroboratorHead === expectedCheckpointNumber &&
      !sameJson(corroborator.reportedFinalizedHead, corroborator.commonFinalizedBlock)) ||
    (primaryRecheckedHead === expectedCheckpointNumber &&
      !sameJson(primary.recheckedFinalizedHead, primary.commonFinalizedBlock)) ||
    (corroboratorRecheckedHead === expectedCheckpointNumber &&
      !sameJson(corroborator.recheckedFinalizedHead, corroborator.commonFinalizedBlock))
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.reportedFinalizedHead",
      "A finalized-head sandwich endpoint at the fixed checkpoint did not bind that exact block.",
      capability.transaction.transactionHash
    );
  }
  if (
    primary.checkpointBlockRecheck === null ||
    corroborator.checkpointBlockRecheck === null ||
    !sameJson(primary.commonFinalizedBlock, primary.checkpointBlockRecheck) ||
    !sameJson(corroborator.commonFinalizedBlock, corroborator.checkpointBlockRecheck) ||
    !sameJson(primary.checkpointBlockRecheck, corroborator.checkpointBlockRecheck)
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.checkpointBlockRecheck",
      "The fixed checkpoint changed during its exact-number re-read.",
      capability.transaction.transactionHash
    );
  }
  if (
    primary.checkpointCanonicalAttestation === null ||
    corroborator.checkpointCanonicalAttestation === null ||
    !sameJson(
      primary.checkpointCanonicalAttestation,
      corroborator.checkpointCanonicalAttestation
    ) ||
    primary.checkpointCanonicalAttestation.eip1898Block.blockHash !==
      primary.commonFinalizedBlock.hash
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.checkpointCanonicalAttestation",
      "Both fixed providers must attest the agreed checkpoint hash with an EIP-1898 canonical read.",
      capability.transaction.transactionHash
    );
  }
  const commonFinalizedTimestamp = canonicalUint(primary.commonFinalizedBlock.timestamp);
  if (
    commonFinalizedTimestamp === null ||
    commonFinalizedTimestamp > primaryHeadTimestamp ||
    commonFinalizedTimestamp > corroboratorHeadTimestamp ||
    commonFinalizedTimestamp > primaryRecheckedHeadTimestamp ||
    commonFinalizedTimestamp > corroboratorRecheckedHeadTimestamp
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.reportedFinalizedHead.timestamp",
      "Finalized block timestamps are future-dated or inconsistent with the common checkpoint.",
      capability.transaction.transactionHash
    );
  }

  if (
    primary.receiptBlockLookup === null ||
    corroborator.receiptBlockLookup === null ||
    !sameJson(primary.receiptBlockLookup, corroborator.receiptBlockLookup) ||
    primary.receiptBlockLookup.requestedBlockNumber !== receipt.blockNumber ||
    primary.receiptBlock === null ||
    corroborator.receiptBlock === null ||
    !sameJson(primary.receiptBlock, corroborator.receiptBlock) ||
    primary.receiptBlock.number !== receipt.blockNumber ||
    primary.receiptBlock.hash !== receipt.blockHash
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.receiptBlock",
      "Receipt block is not canonically bound by both providers.",
      capability.transaction.transactionHash
    );
  }
  const commonFinalizedNumber = canonicalUint(primary.commonFinalizedBlock.number);
  if (commonFinalizedNumber === null) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.commonFinalizedBlock.number",
      "Common finalized block number is invalid.",
      capability.transaction.transactionHash
    );
  }
  const ancestryLength = commonFinalizedNumber - receiptNumber;
  if (
    ancestryLength !== BigInt(BSC_TESTNET_PTA_WBNB_POOL_MAXIMUM_FINALITY_ANCESTRY_BLOCKS) ||
    primary.receiptToCommonFinalizedAncestry.length !== Number(ancestryLength) ||
    !sameJson(
      primary.receiptToCommonFinalizedAncestry,
      corroborator.receiptToCommonFinalizedAncestry
    )
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.receiptToCommonFinalizedAncestry",
      "The exact receipt-to-checkpoint ancestry must contain 128 identical provider-agreed blocks.",
      capability.transaction.transactionHash
    );
  }
  let ancestryParent: BscTestnetPtaWbnbPoolNormalizedAncestryHeader = Object.freeze({
    number: primary.receiptBlock.number,
    hash: primary.receiptBlock.hash,
    parentHash: primary.receiptBlock.parentHash,
    timestamp: primary.receiptBlock.timestamp
  });
  for (const [index, block] of primary.receiptToCommonFinalizedAncestry.entries()) {
    const number = canonicalUint(block.number);
    const parentNumber = canonicalUint(ancestryParent.number);
    const parentTimestamp = canonicalUint(ancestryParent.timestamp);
    const timestamp = canonicalUint(block.timestamp);
    if (
      number === null ||
      parentNumber === null ||
      parentTimestamp === null ||
      timestamp === null ||
      number !== receiptNumber + BigInt(index) + 1n ||
      number !== parentNumber + 1n ||
      block.parentHash !== ancestryParent.hash ||
      timestamp < parentTimestamp
    ) {
      return invalidReconciliation(
        "CANONICALITY_INVALID",
        `evidence.providers.receiptToCommonFinalizedAncestry[${index}]`,
        "A bounded exact-number ancestry header is discontinuous or timestamp-regressive.",
        capability.transaction.transactionHash
      );
    }
    ancestryParent = block;
  }
  if (
    ancestryParent.number !== primary.commonFinalizedBlock.number ||
    ancestryParent.hash !== primary.commonFinalizedBlock.hash ||
    ancestryParent.parentHash !== primary.commonFinalizedBlock.parentHash ||
    ancestryParent.timestamp !== primary.commonFinalizedBlock.timestamp
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.receiptToCommonFinalizedAncestry",
      "Receipt-to-finalized ancestry does not terminate at the common finalized block.",
      capability.transaction.transactionHash
    );
  }
  const receiptBlockTimestamp = canonicalUint(primary.receiptBlock.timestamp);
  if (receiptBlockTimestamp === null || receiptBlockTimestamp > commonFinalizedTimestamp) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.receiptBlock.timestamp",
      "Receipt block timestamp is later than the common finalized checkpoint.",
      capability.transaction.transactionHash
    );
  }
  const transactionIndex = canonicalUint(receipt.transactionIndex, BigInt(Number.MAX_SAFE_INTEGER));
  if (
    transactionIndex === null ||
    primary.receiptBlock.transactionHashes[Number(transactionIndex)] !== receipt.transactionHash
  ) {
    return invalidReconciliation(
      "CANONICALITY_INVALID",
      "evidence.providers.receiptBlock.transactionHashes",
      "Canonical receipt block does not contain the exact transaction at its receipt index.",
      capability.transaction.transactionHash
    );
  }

  if (receipt.status === "0") {
    if (
      primary.postState !== null ||
      corroborator.postState !== null ||
      !exactLogBindings(receipt, primary.receiptBlock, null)
    ) {
      return invalidReconciliation(
        "LOGS_INVALID",
        "evidence.providers.receipt.logs",
        "A reverted receipt must not retain logs or success post-state.",
        capability.transaction.transactionHash
      );
    }
  } else {
    if (primary.postState === null || corroborator.postState === null) {
      return invalidReconciliation(
        "POST_STATE_INVALID",
        "evidence.providers.postState",
        "A successful receipt requires exact post-state from both providers.",
        capability.transaction.transactionHash
      );
    }
    if (!sameJson(primary.postState, corroborator.postState)) {
      return invalidReconciliation(
        "PROVIDER_DISAGREEMENT",
        "evidence.providers.postState",
        "Providers disagree on exact EIP-1898 post-state.",
        capability.transaction.transactionHash
      );
    }
    if (
      primary.postState.eip1898Block.blockHash !== primary.receiptBlock.hash ||
      !exactLogBindings(receipt, primary.receiptBlock, primary.postState)
    ) {
      return invalidReconciliation(
        "POST_STATE_INVALID",
        "evidence.providers.postState",
        "Exact logs or canonical EIP-1898 pool post-state do not match.",
        capability.transaction.transactionHash
      );
    }
  }

  const normalized = Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    operation: BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    recovery: capability.recovery,
    transactionHash: capability.transaction.transactionHash,
    observedAt: evidence.observedAt as string,
    primary,
    corroborator
  });
  const reconciliationDigest = keccak256(
    stringToHex(`${RECONCILIATION_DIGEST_DOMAIN}\u0000${JSON.stringify(normalized)}`)
  );
  return Object.freeze({
    status: receipt.status === "1" ? ("confirmed" as const) : ("reverted" as const),
    transactionHash: capability.transaction.transactionHash,
    reconciliationDigest,
    issue: null
  });
}

/**
 * Content-only validator used by the fixed private RPC observation path. It does not authenticate a
 * submission capability and cannot submit a transaction.
 */
export async function reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse(
  untrustedCapability: unknown,
  evidence: unknown,
  asOf: unknown
): Promise<BscTestnetPtaWbnbPoolReconciliationResult> {
  const milliseconds = strictDateMilliseconds(asOf);
  if (milliseconds === null) {
    return invalidReconciliation("CLOCK_INVALID", "asOf", "Reconciliation clock is invalid.", null);
  }
  const capability = await validateSubmissionCapability(untrustedCapability, milliseconds, false);
  if (capability.status === "invalid") {
    return Object.freeze({
      status: "invalid" as const,
      transactionHash: null,
      reconciliationDigest: null,
      issue: capability.issue
    });
  }
  return reconcileEvidence(evidence, capability.capability, milliseconds);
}

function submissionFailure(
  status: "blocked_before_submission" | "do_not_retry",
  code: string,
  phase: string,
  message: string,
  transactionHash: Hex | null,
  reconciliationRetryAllowed: boolean
): BscTestnetPtaWbnbPoolSubmissionResult {
  if (status === "blocked_before_submission") {
    return Object.freeze({
      status,
      retryBroadcastAllowed: false as const,
      reconciliationRetryAllowed: false as const,
      transactionHash,
      issue: Object.freeze({ code, phase, message }),
      boundary: BOUNDARY
    });
  }
  return Object.freeze({
    status,
    retryBroadcastAllowed: false as const,
    reconciliationRetryAllowed,
    transactionHash,
    issue: Object.freeze({ code, phase, message }),
    boundary: BOUNDARY
  });
}

function inspectDependencies(
  input: unknown
): BscTestnetPtaWbnbPoolSubmissionTestDependencies | null {
  const dependencies = inspectRecord(input, [
    "acquireTerminalPreSendRecheck",
    "acquireSubmissionCapability",
    "authenticateSubmissionCapability",
    "journal",
    "now",
    "observeExactTransaction",
    "sendExactRawTransactionOnce"
  ]);
  if (dependencies === null) return null;
  const journal = inspectRecord(dependencies.journal, [
    "commitSubmissionStarted",
    "commitTerminalReconciliation",
    "readState"
  ]);
  const functions = [
    dependencies.acquireTerminalPreSendRecheck,
    dependencies.acquireSubmissionCapability,
    dependencies.authenticateSubmissionCapability,
    dependencies.now,
    dependencies.observeExactTransaction,
    dependencies.sendExactRawTransactionOnce,
    journal?.commitSubmissionStarted,
    journal?.commitTerminalReconciliation,
    journal?.readState
  ];
  if (
    journal === null ||
    functions.some((entry) => typeof entry !== "function" || isProxy(entry))
  ) {
    return null;
  }
  return Object.freeze({
    now: dependencies.now as () => Date,
    acquireSubmissionCapability: dependencies.acquireSubmissionCapability as () => Promise<unknown>,
    authenticateSubmissionCapability: dependencies.authenticateSubmissionCapability as (
      capability: unknown
    ) => boolean,
    acquireTerminalPreSendRecheck: dependencies.acquireTerminalPreSendRecheck as (
      input: Readonly<{ transactionHash: Hex; gasLimit: string; gasPriceWei: string }>
    ) => Promise<unknown>,
    journal: Object.freeze({
      readState: journal.readState as () => Promise<unknown>,
      commitSubmissionStarted: journal.commitSubmissionStarted as (
        request: BscTestnetPtaWbnbPoolSubmissionStartedRequest
      ) => Promise<unknown>,
      commitTerminalReconciliation: journal.commitTerminalReconciliation as (
        request: BscTestnetPtaWbnbPoolTerminalReconciliationRequest
      ) => Promise<unknown>
    }),
    sendExactRawTransactionOnce: dependencies.sendExactRawTransactionOnce as (
      signedTransaction: Hex
    ) => Promise<unknown>,
    observeExactTransaction: dependencies.observeExactTransaction as (
      transactionHash: Hex
    ) => Promise<unknown>
  });
}

function inspectRecoveryDependencies(
  input: unknown
): BscTestnetPtaWbnbPoolReconciliationRecoveryDependencies | null {
  const dependencies = inspectRecord(input, [
    "acquireRecoveryCapability",
    "journal",
    "now",
    "observeExactTransaction"
  ]);
  if (dependencies === null) return null;
  const journal = inspectRecord(dependencies.journal, [
    "commitTerminalReconciliation",
    "readState"
  ]);
  const functions = [
    dependencies.acquireRecoveryCapability,
    dependencies.now,
    dependencies.observeExactTransaction,
    journal?.commitTerminalReconciliation,
    journal?.readState
  ];
  if (
    journal === null ||
    functions.some((entry) => typeof entry !== "function" || isProxy(entry))
  ) {
    return null;
  }
  return Object.freeze({
    now: dependencies.now as () => Date,
    acquireRecoveryCapability: dependencies.acquireRecoveryCapability as () => Promise<unknown>,
    journal: Object.freeze({
      readState: journal.readState as () => Promise<unknown>,
      commitTerminalReconciliation: journal.commitTerminalReconciliation as (
        request: BscTestnetPtaWbnbPoolTerminalReconciliationRequest
      ) => Promise<unknown>
    }),
    observeExactTransaction: dependencies.observeExactTransaction as (
      transactionHash: Hex
    ) => Promise<unknown>
  });
}

function terminalAckValid(
  input: unknown,
  request: BscTestnetPtaWbnbPoolTerminalReconciliationRequest
): boolean {
  const ack = inspectRecord(input, [
    "reconciliationDigest",
    "status",
    "submissionStartedDigest",
    "transactionHash"
  ]);
  return (
    ack !== null &&
    ack.status === request.outcome &&
    ack.transactionHash === request.transactionHash &&
    ack.submissionStartedDigest === request.submissionStartedDigest &&
    ack.reconciliationDigest === request.reconciliationDigest
  );
}

/**
 * Internal one-shot composition core. The caller cannot provide transaction bytes to the returned
 * method. Production supplies the append-only fsync/O_EXCL v3 journal through the fixed private
 * bridge; tests inject deterministic non-network ports.
 */
function createBscTestnetPtaWbnbPoolSubmissionCore(
  dependenciesInput: BscTestnetPtaWbnbPoolSubmissionTestDependencies
): BscTestnetPtaWbnbPoolSubmissionCore {
  const dependencies = inspectDependencies(dependenciesInput);
  let invoked = false;
  return Object.freeze({
    boundary: BOUNDARY,
    async submitAndReconcileOnce(): Promise<BscTestnetPtaWbnbPoolSubmissionResult> {
      if (invoked) {
        return submissionFailure(
          "do_not_retry",
          "ONE_SHOT_CORE_ALREADY_USED",
          "configuration",
          "This one-shot core instance has already been used.",
          null,
          false
        );
      }
      invoked = true;
      if (dependencies === null) {
        return submissionFailure(
          "blocked_before_submission",
          "CONFIGURATION_INVALID",
          "configuration",
          "Test dependency boundary is not exact plain data.",
          null,
          false
        );
      }
      const nowMilliseconds = validClock(dependencies.now);
      if (nowMilliseconds === null) {
        return submissionFailure(
          "blocked_before_submission",
          "CLOCK_INVALID",
          "configuration",
          "Submission clock is invalid.",
          null,
          false
        );
      }

      let rawCapability: unknown;
      try {
        rawCapability = await dependencies.acquireSubmissionCapability();
      } catch {
        return submissionFailure(
          "blocked_before_submission",
          "CAPABILITY_ACQUISITION_FAILED",
          "authorization",
          "Authenticated submission capability could not be acquired.",
          null,
          false
        );
      }
      let authenticated = false;
      try {
        authenticated = dependencies.authenticateSubmissionCapability(rawCapability) === true;
      } catch {
        authenticated = false;
      }
      if (!authenticated) {
        return submissionFailure(
          "blocked_before_submission",
          "CAPABILITY_AUTHENTICATION_FAILED",
          "authorization",
          "Submission capability authenticity was not established.",
          null,
          false
        );
      }
      const capabilityResult = await validateSubmissionCapability(
        rawCapability,
        nowMilliseconds,
        false
      );
      if (capabilityResult.status === "invalid") {
        return submissionFailure(
          "blocked_before_submission",
          capabilityResult.issue.code,
          "authorization",
          capabilityResult.issue.message,
          null,
          false
        );
      }
      const capability = capabilityResult.capability;
      const transactionHash = capability.transaction.transactionHash;

      let journalState: BscTestnetPtaWbnbPoolSubmissionJournalState | null;
      try {
        journalState = parseJournalState(await dependencies.journal.readState(), capability);
      } catch {
        journalState = null;
      }
      if (journalState === null) {
        return submissionFailure(
          "do_not_retry",
          "JOURNAL_STATE_UNKNOWN",
          "journal",
          "Durable submission journal state could not be authenticated or parsed.",
          transactionHash,
          false
        );
      }
      if (journalState.state === "confirmed" || journalState.state === "reverted") {
        return submissionFailure(
          "do_not_retry",
          "TERMINAL_STATE_ALREADY_COMMITTED",
          "journal",
          "The exact transaction already has a durable terminal state.",
          transactionHash,
          false
        );
      }

      let submissionWasAlreadyStarted =
        journalState.state === "submission_started" || journalState.state === "unknown_outcome";
      if (journalState.state === "signed_committed") {
        const authenticatedAt = exactUtc(capability.authenticatedAt);
        const expiresAt = exactUtc(capability.expiresAt);
        const preSubmissionObservedAt = exactUtc(capability.preSubmission.observedAt);
        if (
          authenticatedAt === null ||
          expiresAt === null ||
          preSubmissionObservedAt === null ||
          authenticatedAt > nowMilliseconds ||
          nowMilliseconds >= expiresAt ||
          preSubmissionObservedAt > nowMilliseconds ||
          nowMilliseconds - preSubmissionObservedAt >
            MAXIMUM_PRE_SUBMISSION_OBSERVATION_AGE_MILLISECONDS
        ) {
          return submissionFailure(
            "blocked_before_submission",
            "CAPABILITY_EXPIRED",
            "authorization",
            "Capability expired before durable submission_started was recorded.",
            transactionHash,
            false
          );
        }
        const request = submissionStartedRequest(capability);
        let ack: unknown;
        try {
          ack = await dependencies.journal.commitSubmissionStarted(request);
        } catch {
          return submissionFailure(
            "do_not_retry",
            "SUBMISSION_START_OUTCOME_UNKNOWN",
            "journal",
            "Durable submission_started outcome is unknown; sending is forbidden.",
            transactionHash,
            false
          );
        }
        const startOutcome = validSubmissionStartedAck(ack, request);
        if (startOutcome === null) {
          return submissionFailure(
            "do_not_retry",
            "SUBMISSION_START_OUTCOME_UNKNOWN",
            "journal",
            "Journal did not attest the exact durable submission_started record.",
            transactionHash,
            false
          );
        }
        submissionWasAlreadyStarted = startOutcome === "already_started";
      }

      if (!submissionWasAlreadyStarted) {
        const durableStartMilliseconds = validClock(dependencies.now);
        const expiresAt = exactUtc(capability.expiresAt);
        if (
          durableStartMilliseconds === null ||
          durableStartMilliseconds < nowMilliseconds ||
          expiresAt === null ||
          durableStartMilliseconds >= expiresAt
        ) {
          return submissionFailure(
            "do_not_retry",
            "SUBMISSION_WINDOW_CLOSED_AFTER_DURABLE_START",
            "submission",
            "The original owner authorization expired after durable submission_started; sending and rebroadcast are forbidden.",
            transactionHash,
            true
          );
        }
        let terminalPreSendEvidence: unknown;
        try {
          terminalPreSendEvidence = await dependencies.acquireTerminalPreSendRecheck(
            Object.freeze({
              transactionHash,
              gasLimit: capability.transaction.gasLimit,
              gasPriceWei: capability.transaction.gasPriceWei
            })
          );
        } catch {
          return submissionFailure(
            "do_not_retry",
            "TERMINAL_PRE_SEND_RECHECK_FAILED",
            "submission",
            "Fresh fixed-origin dual-RPC state could not be re-read after durable submission_started; sending is forbidden.",
            transactionHash,
            true
          );
        }
        const preSendMilliseconds = validClock(dependencies.now);
        if (
          preSendMilliseconds === null ||
          preSendMilliseconds < durableStartMilliseconds ||
          preSendMilliseconds >= expiresAt
        ) {
          return submissionFailure(
            "do_not_retry",
            "SUBMISSION_WINDOW_CLOSED_AFTER_DURABLE_START",
            "submission",
            "The original owner authorization expired during the terminal dual-RPC recheck; sending and rebroadcast are forbidden.",
            transactionHash,
            true
          );
        }
        const terminalCapability = await validateSubmissionCapability(
          Object.freeze({ ...capability, preSubmission: terminalPreSendEvidence }),
          preSendMilliseconds,
          true
        );
        const terminalObservedAt =
          terminalCapability.status === "valid"
            ? exactUtc(terminalCapability.capability.preSubmission.observedAt)
            : null;
        if (
          terminalCapability.status === "invalid" ||
          terminalObservedAt === null ||
          terminalObservedAt < durableStartMilliseconds ||
          terminalObservedAt > preSendMilliseconds
        ) {
          return submissionFailure(
            "do_not_retry",
            "TERMINAL_PRE_SEND_RECHECK_INVALID",
            "submission",
            "Post-ack dual-RPC evidence is not exact, current, or ordered after durable submission_started; sending is forbidden.",
            transactionHash,
            true
          );
        }
        try {
          const sendResult = await dependencies.sendExactRawTransactionOnce(
            capability.transaction.signedTransaction
          );
          if (sendResult !== transactionHash) {
            // A malformed or mismatched result is still an ambiguous submission outcome. The exact
            // raw transaction is never sent again; deterministic reconciliation is the only path.
          }
        } catch {
          // Transport failure after the call begins is ambiguous. Never resend or replace.
        }
      }

      return reconcileFromDurableStartedState(dependencies, capability, nowMilliseconds);
    }
  });
}

async function reconcileFromDurableStartedState(
  dependencies: Pick<
    BscTestnetPtaWbnbPoolReconciliationRecoveryDependencies,
    "journal" | "now" | "observeExactTransaction"
  >,
  capability: BscTestnetPtaWbnbPoolSubmissionCapability,
  notBeforeMilliseconds: number
): Promise<BscTestnetPtaWbnbPoolSubmissionResult> {
  const transactionHash = capability.transaction.transactionHash;
  let rawEvidence: unknown;
  try {
    rawEvidence = await dependencies.observeExactTransaction(transactionHash);
  } catch {
    return Object.freeze({
      status: "reconciliation_pending" as const,
      retryBroadcastAllowed: false as const,
      reconciliationRetryAllowed: true as const,
      transactionHash,
      issue: issue(
        "INPUT_INVALID",
        "evidence",
        "Reconciliation observation is currently unavailable."
      ),
      boundary: BOUNDARY
    });
  }
  const reconciledAt = validClock(dependencies.now);
  if (reconciledAt === null || reconciledAt < notBeforeMilliseconds) {
    return submissionFailure(
      "do_not_retry",
      "CLOCK_INVALID",
      "reconciliation",
      "Reconciliation clock moved backward or became invalid.",
      transactionHash,
      true
    );
  }
  const reconciliation = reconcileEvidence(rawEvidence, capability, reconciledAt);
  if (reconciliation.status === "pending") {
    return Object.freeze({
      status: "reconciliation_pending" as const,
      retryBroadcastAllowed: false as const,
      reconciliationRetryAllowed: true as const,
      transactionHash,
      issue: reconciliation.issue,
      boundary: BOUNDARY
    });
  }
  if (reconciliation.status === "invalid") {
    return submissionFailure(
      "do_not_retry",
      reconciliation.issue.code,
      "reconciliation",
      reconciliation.issue.message,
      transactionHash,
      true
    );
  }
  const terminalRequest = Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    operation: BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: capability.claimId,
    envelopeHash: capability.envelopeHash,
    releaseCommit: capability.releaseCommit,
    runtimeManifestSha256: capability.runtimeManifestSha256,
    reviewerApprovalDigest: capability.reviewerApprovalDigest,
    ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
    recovery: capability.recovery,
    signingHash: capability.transaction.signingHash,
    transactionHash,
    signedTransactionKeccak256: keccak256(capability.transaction.signedTransaction),
    submissionStartedDigest: submissionStartedRequest(capability).submissionStartedDigest,
    outcome: reconciliation.status,
    reconciliationDigest: reconciliation.reconciliationDigest
  });
  let terminalAck: unknown;
  try {
    terminalAck = await dependencies.journal.commitTerminalReconciliation(terminalRequest);
  } catch {
    return submissionFailure(
      "do_not_retry",
      "TERMINAL_COMMIT_OUTCOME_UNKNOWN",
      "journal",
      "Validated terminal reconciliation could not be durably committed.",
      transactionHash,
      true
    );
  }
  if (!terminalAckValid(terminalAck, terminalRequest)) {
    return submissionFailure(
      "do_not_retry",
      "TERMINAL_COMMIT_OUTCOME_UNKNOWN",
      "journal",
      "Journal did not attest the exact terminal reconciliation digest.",
      transactionHash,
      true
    );
  }
  return Object.freeze({
    status: reconciliation.status,
    retryBroadcastAllowed: false,
    reconciliationRetryAllowed: false,
    transactionHash,
    reconciliationDigest: reconciliation.reconciliationDigest,
    issue: null,
    boundary: BOUNDARY
  });
}

/**
 * Restart-only reconciliation. It cannot sign, start submission, send, resend, or replace because
 * none of those capabilities exist on this dependency boundary.
 */
export function createBscTestnetPtaWbnbPoolReconciliationRecoveryCoreForInternalUse(
  dependenciesInput: BscTestnetPtaWbnbPoolReconciliationRecoveryDependencies
): BscTestnetPtaWbnbPoolSubmissionCore {
  const dependencies = inspectRecoveryDependencies(dependenciesInput);
  let invoked = false;
  return Object.freeze({
    boundary: BOUNDARY,
    async submitAndReconcileOnce(): Promise<BscTestnetPtaWbnbPoolSubmissionResult> {
      if (invoked) {
        return submissionFailure(
          "do_not_retry",
          "ONE_SHOT_CORE_ALREADY_USED",
          "configuration",
          "This recovery core instance has already been used.",
          null,
          false
        );
      }
      invoked = true;
      if (dependencies === null) {
        return submissionFailure(
          "do_not_retry",
          "CONFIGURATION_INVALID",
          "configuration",
          "Recovery dependency boundary is not exact plain data.",
          null,
          false
        );
      }
      const nowMilliseconds = validClock(dependencies.now);
      if (nowMilliseconds === null) {
        return submissionFailure(
          "do_not_retry",
          "CLOCK_INVALID",
          "configuration",
          "Recovery clock is invalid.",
          null,
          false
        );
      }
      let rawCapability: unknown;
      try {
        rawCapability = await dependencies.acquireRecoveryCapability();
      } catch {
        return submissionFailure(
          "do_not_retry",
          "RECOVERY_CAPABILITY_UNAVAILABLE",
          "recovery",
          "Durable recovery material is unavailable.",
          null,
          false
        );
      }
      const capabilityResult = await validateSubmissionCapability(
        rawCapability,
        nowMilliseconds,
        false
      );
      if (capabilityResult.status === "invalid") {
        return submissionFailure(
          "do_not_retry",
          capabilityResult.issue.code,
          "recovery",
          capabilityResult.issue.message,
          null,
          false
        );
      }
      const capability = capabilityResult.capability;
      const transactionHash = capability.transaction.transactionHash;
      let journalState: BscTestnetPtaWbnbPoolSubmissionJournalState | null;
      try {
        journalState = parseJournalState(await dependencies.journal.readState(), capability);
      } catch {
        journalState = null;
      }
      if (journalState === null) {
        return submissionFailure(
          "do_not_retry",
          "JOURNAL_STATE_UNKNOWN",
          "journal",
          "Durable submission journal state could not be authenticated or parsed.",
          transactionHash,
          false
        );
      }
      if (journalState.state === "confirmed" || journalState.state === "reverted") {
        return submissionFailure(
          "do_not_retry",
          "TERMINAL_STATE_ALREADY_COMMITTED",
          "journal",
          "The exact transaction already has a durable terminal state.",
          transactionHash,
          false
        );
      }
      if (journalState.state !== "submission_started" && journalState.state !== "unknown_outcome") {
        return submissionFailure(
          "do_not_retry",
          "RECOVERY_REQUIRES_DURABLE_SUBMISSION_START",
          "journal",
          "Recovery cannot sign or begin a submission from this journal state.",
          transactionHash,
          false
        );
      }
      return reconcileFromDurableStartedState(dependencies, capability, nowMilliseconds);
    }
  });
}

/**
 * Internal root-runner seam. Its capability authenticator must be backed by a private WeakSet and
 * its journal/broadcaster/observer must remain the fixed production implementations.
 */
export function createBscTestnetPtaWbnbPoolSubmissionCoreForInternalUse(
  dependenciesInput: BscTestnetPtaWbnbPoolSubmissionTestDependencies
): BscTestnetPtaWbnbPoolSubmissionCore {
  return createBscTestnetPtaWbnbPoolSubmissionCore(dependenciesInput);
}

export function createBscTestnetPtaWbnbPoolSubmissionCoreForTests(
  dependenciesInput: BscTestnetPtaWbnbPoolSubmissionTestDependencies
): BscTestnetPtaWbnbPoolSubmissionCore {
  return createBscTestnetPtaWbnbPoolSubmissionCore(dependenciesInput);
}

export class BscTestnetPtaWbnbPoolProductionSubmissionUnavailableError extends Error {
  readonly code = "PRODUCTION_AUTHORIZATION_UNAVAILABLE" as const;

  constructor() {
    super(
      "The generic production submission factory is intentionally unavailable; the exact root runner uses only the private release-policy, owner, journal, and attestation-bound path."
    );
    this.name = "BscTestnetPtaWbnbPoolProductionSubmissionUnavailableError";
  }
}

/** The generic factory stays unavailable; production uses the separately wired exact private path. */
export function createProductionBscTestnetPtaWbnbPoolSubmissionCore(): never {
  throw new BscTestnetPtaWbnbPoolProductionSubmissionUnavailableError();
}
