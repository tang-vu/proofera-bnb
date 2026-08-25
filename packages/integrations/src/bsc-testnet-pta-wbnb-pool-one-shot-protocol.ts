import { isProxy } from "node:util/types";

import {
  getAddress,
  keccak256,
  numberToHex,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
  stringToHex,
  type Address,
  type Hex,
  type TransactionSerialized
} from "viem";

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  calculateBscTestnetPtaWbnbPoolGasLimit
} from "./bsc-testnet-pta-wbnb-pool-initialization";

export { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-initialization";
export const BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID =
  "proofera:bsc-testnet:97:pta-wbnb:pancake-v3-fee-500:sender-nonce-9:v8" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2 = 2 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3 = 3 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4 = 4 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5 = 5 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6 = 6 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION = 7 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION = 8 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE = "failed_before_worker" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_ATTEMPT_ID_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.recovery-attempt.v8" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256 =
  "0xf10e90eb836a94446ace100bbc9a6fc5de6cc35b1d82e4d10fb4736ef8559e32" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256 =
  "0x613df995936c3ccfff56e5da5588906f1bd28340ae8297eb08524274b9b8e1c3" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256 =
  "0x7ff780a8f0ac1a1f8ff7bced5d858259f918cdb1891c684aa208b6bca31c9585" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_FENCE_SHA256 =
  "0x9fa84a9cf79373dd1ccfd5217bb0159cb6e97f6821489d9a1afbc0c5df258f2e" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_CLAIM_RAW_SHA256 =
  "0xd5fc6da9f853c621f4f407c9d8a729f898c0297720bc50817e633fa538967f36" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256 =
  "0x2e0570423b1217f1dab6fa8cdb91a0a75b2d78023bacc611a6c81017d0033bab" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_FAILED_BEFORE_WORKER_OUTCOME_DIGEST =
  "0x23468d2bf83c3b855334c077890c866c59955a44c42c83f2e32af4a5ef73ad06" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ENVELOPE_HASH =
  "0xbed286a4d6fe682aeb089870307b816937d330fd9cbd19d51228b488d64be6b1" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ATTEMPT_ID =
  "0xc55caf41d8822860e080a208644e0d21f63b823bb2ee3dee64c31d0484c13819" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_RELEASE_COMMIT =
  "d160530e3d5b18f1a82665a604a3fd25a19338de" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_RUNTIME_MANIFEST_SHA256 =
  "0x5b61083d27e794e00f24f708ba7f1ad029a4a8fe509adc8c2394d8bde23a9fbc" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_CLAIM_RAW_SHA256 =
  "0x0d76c35b7d6cdec488b8b79dafcefacc597c79f057fe722a2202d284515017f1" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256 =
  "0x39a6295f3f816cb5bba6c8c3be11982bcafa45847608e1150de950738217c8c9" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_FAILED_BEFORE_WORKER_OUTCOME_DIGEST =
  "0x7db76f9069e2d46d674eaccb2c7453489e8b80ca1940288b49ac7da46196a93a" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_ENVELOPE_HASH =
  "0xff96825f7e22467ef692548d22ef3ed3aa392eeaec7f1396b4ccdeba1e36d43c" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_ATTEMPT_ID =
  "0x81edb062fff3165780e4e04bcfc4da63c152f08c34ce0937127c04d07b7a32a0" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_RELEASE_COMMIT =
  "e8f3f5b56a5a423094a77a679462f71baa7d6069" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_RUNTIME_MANIFEST_SHA256 =
  "0xfa2fffc0e211904c830aa963eaddda20543c66ecbeb750680fa790a409e05418" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_CLAIM_RAW_SHA256 =
  "0x2f7dffbe7fef710273206009a06c7e460fa9f289b2403d6760c805707467e2ed" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256 =
  "0x4a64cc2ef48529e271152004e31dfb7d35511d0a5691815838849c831638d6f7" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST =
  "0xfbece16f72e4ed39317a2ff6ad56933448150e8f8f9f3a86df8f77f793219f73" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_ENVELOPE_HASH =
  "0x747733735d59f9975f4b9fb5e2fdc9b60a3a004939b5c22c9bab0e53578c484a" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_ATTEMPT_ID =
  "0x29017850ccf109d2082edcdf62cacf96a41a71820ffebe0365eb896b388fb26d" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_RELEASE_COMMIT =
  "1655d39db63a636e7c66a007046c06eab65c55f1" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_RUNTIME_MANIFEST_SHA256 =
  "0xc34022bb89478052075a70d43017dfaaee44092cf72b3505bbbac1a56ea3256a" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_CLAIM_RAW_SHA256 =
  "0xceec9b1e6de22bc8eb11c9f1bea3d6cec730e34e1ce8f306705fa4782c39c3bd" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256 =
  "0x97bb22de4f86b517af0b517f6765d77896da7881708da6589d17703790abc3dc" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_FAILED_BEFORE_WORKER_OUTCOME_DIGEST =
  "0x62e2b9de9aecc9fd7a1377bb1f9c23ee2ad8e8c34ed04ecdeb289340e694514b" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_ENVELOPE_HASH =
  "0x1804e85a618e68168dce6608c33f809838b1e3c1843dfecfe604030ed5213643" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_ATTEMPT_ID =
  "0xec3ae4a15cb7c8c8ca957d1e8b9ea6f179acf23abf5119a6e12ef0a1403521a5" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_RELEASE_COMMIT =
  "dbd4950e62b469379dc9fc877668d247b38b6f93" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_RUNTIME_MANIFEST_SHA256 =
  "0xd42a5e8eb1251289edbae9383d2ec4a36dd4f668a608665d03dd50fff074ee67" as const satisfies Hex;
export const BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256 =
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_CLAIM_RAW_SHA256;
export const BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCHEMA_VERSION = 8 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE =
  "exact_pta_wbnb_pool_recovery_generation_8_after_atomic_claim_and_dual_rpc_recheck" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS = 30 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION = 8 as const;
export const BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION =
  "sign_exact_bsc_testnet_pta_wbnb_pool_initialization" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_REQUEST_HASH_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool-signing-worker-request.v8" as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const UINT256_MAX = (1n << 256n) - 1n;
const SECP256K1_ORDER = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"
);
const SECP256K1_HALF_ORDER = SECP256K1_ORDER / 2n;
const MAXIMUM_SIGNED_TRANSACTION_BYTES = 2_048;

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export interface BscTestnetPtaWbnbPoolReleaseBinding {
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolExactSigningTransaction {
  readonly type: "legacy";
  readonly eip155ReplayProtection: true;
  readonly from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
  readonly to: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
  readonly nonce: typeof BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL;
  readonly valueWei: "0";
  readonly gasLimit: string;
  readonly gasPriceWei: string;
  readonly maximumCostWei: string;
  readonly data: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA;
  readonly serializedUnsignedTransaction: Hex;
  readonly signingHash: Hex;
  readonly sourceEnvelopeHash: Hex;
}

export interface BscTestnetPtaWbnbPoolRecoveryAttemptBinding {
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION;
  readonly predecessorState: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
  readonly predecessorTerminalRawSha256: Hex;
  readonly attemptId: Hex;
}

export function deriveBscTestnetPtaWbnbPoolRecoveryAttemptId(
  input: Readonly<{
    generation: typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION;
    predecessorTerminalRawSha256: Hex;
    envelopeHash: Hex;
    runtimeReviewInstantiationDigest: Hex;
    releaseCommit: string;
    releaseTree: string;
    runtimeManifestSha256: Hex;
  }>
): Hex | null {
  if (
    input.generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION ||
    nonzeroHex32(input.predecessorTerminalRawSha256) === null ||
    nonzeroHex32(input.envelopeHash) === null ||
    nonzeroHex32(input.runtimeReviewInstantiationDigest) === null ||
    exactReleaseCommit(input.releaseCommit) === null ||
    exactReleaseTree(input.releaseTree) === null ||
    nonzeroHex32(input.runtimeManifestSha256) === null
  ) {
    return null;
  }
  const canonical = {
    generation: input.generation,
    predecessorTerminalRawSha256: input.predecessorTerminalRawSha256,
    envelopeHash: input.envelopeHash,
    runtimeReviewInstantiationDigest: input.runtimeReviewInstantiationDigest,
    releaseCommit: input.releaseCommit,
    releaseTree: input.releaseTree,
    runtimeManifestSha256: input.runtimeManifestSha256
  };
  return keccak256(
    stringToHex(
      `${BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_ATTEMPT_ID_DOMAIN}\u0000${JSON.stringify(canonical)}`
    )
  );
}

/** Content validated by the authorization server; authenticity is a separate object capability. */
export interface BscTestnetPtaWbnbPoolAuthorizedSigningIntent extends BscTestnetPtaWbnbPoolReleaseBinding {
  readonly schemaVersion: 8;
  readonly scope: "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_8";
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly envelopeHash: Hex;
  /** Legacy wire name: this is a private runtime-policy instantiation digest, not a reviewer signature. */
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
  readonly recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
  readonly transaction: BscTestnetPtaWbnbPoolExactSigningTransaction;
}

export interface BscTestnetPtaWbnbPoolFreshRecheckCapability extends BscTestnetPtaWbnbPoolReleaseBinding {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCHEMA_VERSION;
  readonly scope: typeof BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly envelopeHash: Hex;
  /** Legacy wire name: this is a private runtime-policy instantiation digest, not a reviewer signature. */
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly claimId: string;
  readonly journalClaimToken: Hex;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
  readonly recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
  readonly freshPostClaimDualRpcRecheckPerformed: true;
  readonly rpc: Readonly<{
    primaryOrigin: typeof BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN;
    corroboratorOrigin: typeof BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN;
    providerAgreementVerified: true;
    canonicalFinalizedBlockVerified: true;
    eip1898RequireCanonical: true;
    observedAt: string;
    finalizedBlockNumber: string;
    finalizedBlockHash: Hex;
    finalizedBlockTimestamp: string;
    finalizedBlockGasLimit: string;
    latestNonce: typeof BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL;
    pendingNonce: typeof BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL;
    factoryPool: typeof ZERO_ADDRESS;
    candidateCode: "0x";
    senderCode: "0x";
    senderBalanceWei: string;
    gasEstimate: string;
    gasPriceWei: string;
    simulationReturnPool: typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE;
  }>;
  readonly transaction: BscTestnetPtaWbnbPoolExactSigningTransaction;
}

export interface BscTestnetPtaWbnbPoolValidatedSigningIntent extends BscTestnetPtaWbnbPoolReleaseBinding {
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly envelopeHash: Hex;
  /** Legacy wire name: this is a private runtime-policy instantiation digest, not a reviewer signature. */
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly claimId: string;
  readonly journalClaimToken: Hex;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
  readonly recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
  readonly transaction: BscTestnetPtaWbnbPoolExactSigningTransaction;
}

export interface BscTestnetPtaWbnbPoolSigningWorkerRequest extends BscTestnetPtaWbnbPoolReleaseBinding {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION;
  readonly environment: "bsc-testnet";
  readonly chainId: "97";
  readonly oneShotIntentId: typeof BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly claimId: string;
  readonly journalClaimToken: Hex;
  /** Legacy wire name: this is a private runtime-policy instantiation digest, not a reviewer signature. */
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
  readonly recovery: BscTestnetPtaWbnbPoolRecoveryAttemptBinding;
  readonly transaction: BscTestnetPtaWbnbPoolExactSigningTransaction;
  readonly requestHashDomain: typeof BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_REQUEST_HASH_DOMAIN;
  readonly requestHash: Hex;
}

export interface BscTestnetPtaWbnbPoolSigningWorkerResponse extends BscTestnetPtaWbnbPoolReleaseBinding {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION;
  readonly status: "signed";
  readonly oneShotIntentId: typeof BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly claimId: string;
  readonly journalClaimToken: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly requestHash: Hex;
  readonly signingHash: Hex;
  readonly signedTransaction: Hex;
  readonly transactionHash: Hex;
}

export type BscTestnetPtaWbnbPoolProtocolIssueCode =
  | "BINDING_INVALID"
  | "CLOCK_INVALID"
  | "CAPABILITY_INVALID"
  | "CAPABILITY_FROM_FUTURE"
  | "CAPABILITY_STALE"
  | "CAPABILITY_EXPIRED"
  | "TRANSACTION_INVALID"
  | "POLICY_EXCEEDED"
  | "CLAIM_BINDING_INVALID"
  | "WORKER_REQUEST_INVALID"
  | "WORKER_RESPONSE_INVALID"
  | "SIGNED_TRANSACTION_INVALID"
  | "SIGNED_TRANSACTION_MISMATCH"
  | "SIGNER_MISMATCH";

export interface BscTestnetPtaWbnbPoolProtocolIssue {
  readonly code: BscTestnetPtaWbnbPoolProtocolIssueCode;
  readonly path: string;
  readonly message: string;
}

export type BscTestnetPtaWbnbPoolFreshRecheckValidationResult = DeepReadonly<
  | { status: "valid"; intent: BscTestnetPtaWbnbPoolValidatedSigningIntent; issue: null }
  | { status: "invalid"; intent: null; issue: BscTestnetPtaWbnbPoolProtocolIssue }
>;

export type BscTestnetPtaWbnbPoolWorkerRequestValidationResult = DeepReadonly<
  | { status: "valid"; request: BscTestnetPtaWbnbPoolSigningWorkerRequest; issue: null }
  | { status: "invalid"; request: null; issue: BscTestnetPtaWbnbPoolProtocolIssue }
>;

export type BscTestnetPtaWbnbPoolWorkerResponseValidationResult = DeepReadonly<
  | {
      status: "valid";
      signedTransaction: Hex;
      transactionHash: Hex;
      recoveredSigner: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
      issue: null;
    }
  | {
      status: "invalid";
      signedTransaction: null;
      transactionHash: null;
      recoveredSigner: null;
      issue: BscTestnetPtaWbnbPoolProtocolIssue;
    }
>;

type DataRecord = Readonly<Record<string, unknown>>;

const TRANSACTION_KEYS = [
  "data",
  "eip155ReplayProtection",
  "from",
  "gasLimit",
  "gasPriceWei",
  "maximumCostWei",
  "nonce",
  "serializedUnsignedTransaction",
  "signingHash",
  "sourceEnvelopeHash",
  "to",
  "type",
  "valueWei"
] as const;
const FRESH_CAPABILITY_KEYS = [
  "authenticatedAt",
  "claimId",
  "envelopeHash",
  "expiresAt",
  "freshPostClaimDualRpcRecheckPerformed",
  "journalClaimToken",
  "operationKey",
  "ownerAuthorizationDigest",
  "releaseCommit",
  "reviewerApprovalDigest",
  "recovery",
  "rpc",
  "runtimeManifestSha256",
  "schemaVersion",
  "scope",
  "transaction"
] as const;
const RPC_KEYS = [
  "candidateCode",
  "canonicalFinalizedBlockVerified",
  "corroboratorOrigin",
  "eip1898RequireCanonical",
  "factoryPool",
  "finalizedBlockHash",
  "finalizedBlockGasLimit",
  "finalizedBlockNumber",
  "finalizedBlockTimestamp",
  "gasEstimate",
  "gasPriceWei",
  "latestNonce",
  "pendingNonce",
  "primaryOrigin",
  "providerAgreementVerified",
  "observedAt",
  "senderBalanceWei",
  "senderCode",
  "simulationReturnPool"
] as const;
const WORKER_REQUEST_KEYS = [
  "authenticatedAt",
  "chainId",
  "claimId",
  "environment",
  "expiresAt",
  "journalClaimToken",
  "oneShotIntentId",
  "operation",
  "operationKey",
  "ownerAuthorizationDigest",
  "releaseCommit",
  "requestHash",
  "requestHashDomain",
  "reviewerApprovalDigest",
  "recovery",
  "runtimeManifestSha256",
  "schemaVersion",
  "transaction"
] as const;
const WORKER_RESPONSE_KEYS = [
  "claimId",
  "journalClaimToken",
  "oneShotIntentId",
  "operation",
  "operationKey",
  "releaseCommit",
  "requestHash",
  "runtimeManifestSha256",
  "schemaVersion",
  "signedTransaction",
  "signingHash",
  "status",
  "transactionHash"
] as const;
const AUTHORIZED_INTENT_KEYS = [
  "authenticatedAt",
  "envelopeHash",
  "expiresAt",
  "operationKey",
  "ownerAuthorizationDigest",
  "releaseCommit",
  "reviewerApprovalDigest",
  "recovery",
  "runtimeManifestSha256",
  "schemaVersion",
  "scope",
  "transaction"
] as const;
const RECOVERY_KEYS = [
  "attemptId",
  "generation",
  "predecessorTerminalRawSha256",
  "predecessorState"
] as const;

function issue(
  code: BscTestnetPtaWbnbPoolProtocolIssueCode,
  path: string,
  message: string
): BscTestnetPtaWbnbPoolProtocolIssue {
  return Object.freeze({ code, path, message });
}

function inspectDataRecord(value: unknown, expectedKeys: readonly string[]): DataRecord | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return null;
    const actual = (ownKeys as string[]).sort();
    const expected = [...expectedKeys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
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

function canonicalUtc(
  value: unknown
): { readonly iso: string; readonly milliseconds: number } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return null;
  }
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === value
    ? { iso: value, milliseconds }
    : null;
}

function captureDate(value: unknown): number | null {
  try {
    if (
      isProxy(value) ||
      !(value instanceof Date) ||
      Object.getPrototypeOf(value) !== Date.prototype ||
      Reflect.ownKeys(value).length !== 0
    ) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? milliseconds : null;
  } catch {
    return null;
  }
}

function canonicalUint(value: unknown, maximum = UINT256_MAX): bigint | null {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value) || value.length > 78) {
    return null;
  }
  try {
    const parsed = BigInt(value);
    return parsed <= maximum ? parsed : null;
  } catch {
    return null;
  }
}

function canonicalNonZeroUint(value: unknown, maximum = UINT256_MAX): bigint | null {
  const parsed = canonicalUint(value, maximum);
  return parsed !== null && parsed > 0n ? parsed : null;
}

function exactLowerHex(value: unknown, bytes?: number, allowEmpty = false): Hex | null {
  if (typeof value !== "string") return null;
  const expression =
    bytes === undefined
      ? allowEmpty
        ? /^0x(?:[0-9a-f]{2})*$/u
        : /^0x(?:[0-9a-f]{2})+$/u
      : new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, "u");
  return expression.test(value) ? (value as Hex) : null;
}

function nonzeroHex32(value: unknown): Hex | null {
  const parsed = exactLowerHex(value, 32);
  return parsed !== null && parsed !== `0x${"00".repeat(32)}` ? parsed : null;
}

function exactReleaseCommit(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value) && !/^0{40}$/u.test(value)
    ? value
    : null;
}

function exactReleaseTree(value: unknown): string | null {
  return exactReleaseCommit(value);
}

function inspectRecoveryAttemptBinding(
  input: unknown
): BscTestnetPtaWbnbPoolRecoveryAttemptBinding | null {
  const recovery = inspectDataRecord(input, RECOVERY_KEYS);
  const predecessorTerminalRawSha256 =
    recovery === null ? null : nonzeroHex32(recovery.predecessorTerminalRawSha256);
  const attemptId = recovery === null ? null : nonzeroHex32(recovery.attemptId);
  if (
    recovery === null ||
    !Object.isFrozen(input) ||
    recovery.generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION ||
    recovery.predecessorState !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE ||
    predecessorTerminalRawSha256 === null ||
    predecessorTerminalRawSha256 !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256 ||
    attemptId === null ||
    attemptId === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_ATTEMPT_ID
  ) {
    return null;
  }
  return Object.freeze({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorState: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
    predecessorTerminalRawSha256,
    attemptId
  });
}

function sameRecoveryAttemptBinding(
  left: BscTestnetPtaWbnbPoolRecoveryAttemptBinding,
  right: BscTestnetPtaWbnbPoolRecoveryAttemptBinding
): boolean {
  return RECOVERY_KEYS.every((key) => left[key] === right[key]);
}

function exactClaimId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
    ? value
    : null;
}

function canonicalJsonSnapshot(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
  budget = { remaining: 128 }
): unknown | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value !== "object" || depth > 12 || budget.remaining-- <= 0 || isProxy(value)) {
    return null;
  }
  if (seen.has(value)) return null;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return null;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.some((key) => typeof key !== "string")) return null;
      const expected = [
        ...Array.from({ length: value.length }, (_, index) => index.toString()),
        "length"
      ];
      if (
        ownKeys.length !== expected.length ||
        expected.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key))
      ) {
        return null;
      }
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[index.toString()];
        if (
          descriptor === undefined ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true
        ) {
          return null;
        }
        const captured = canonicalJsonSnapshot(descriptor.value, seen, depth + 1, budget);
        if (captured === null && descriptor.value !== null) return null;
        output.push(captured);
      }
      return output;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const output: Record<string, unknown> = {};
    for (const key of (ownKeys as string[]).sort()) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
        return null;
      }
      const captured = canonicalJsonSnapshot(descriptor.value, seen, depth + 1, budget);
      if (captured === null && descriptor.value !== null) return null;
      output[key] = captured;
    }
    return output;
  } catch {
    return null;
  } finally {
    seen.delete(value);
  }
}

export function deriveBscTestnetPtaWbnbPoolSigningWorkerRequestHash(body: unknown): Hex {
  const canonical = canonicalJsonSnapshot(body);
  if (canonical === null)
    throw new TypeError("Worker request hash input is not canonical JSON data.");
  return keccak256(
    stringToHex(
      `${BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_REQUEST_HASH_DOMAIN}\u0000${JSON.stringify(
        canonical
      )}`
    )
  );
}

function canonicalSignatureScalar(
  value: unknown
): { readonly value: bigint; readonly hex32: Hex } | null {
  if (typeof value !== "string" || !/^0x(?:[0-9a-f]{2}){1,32}$/u.test(value)) return null;
  if (value.startsWith("0x00")) return null;
  const parsed = BigInt(value);
  return parsed > 0n && parsed < SECP256K1_ORDER
    ? { value: parsed, hex32: numberToHex(parsed, { size: 32 }) }
    : null;
}

export function buildBscTestnetPtaWbnbPoolExactSigningTransaction(
  input: Readonly<{
    gasLimit: string;
    gasPriceWei: string;
    sourceEnvelopeHash: Hex;
  }>
): BscTestnetPtaWbnbPoolExactSigningTransaction | null {
  const gasLimit = canonicalNonZeroUint(input.gasLimit, BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT);
  const gasPriceWei = canonicalNonZeroUint(
    input.gasPriceWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI
  );
  const sourceEnvelopeHash = nonzeroHex32(input.sourceEnvelopeHash);
  if (
    gasLimit === null ||
    gasPriceWei === null ||
    sourceEnvelopeHash === null ||
    gasLimit * gasPriceWei > BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI
  ) {
    return null;
  }
  const serializedUnsignedTransaction = serializeTransaction({
    type: "legacy",
    chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
    nonce: Number(BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE),
    gasPrice: gasPriceWei,
    gas: gasLimit,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    value: 0n,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
  });
  return Object.freeze({
    type: "legacy" as const,
    eip155ReplayProtection: true as const,
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    nonce: BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL,
    valueWei: "0" as const,
    gasLimit: gasLimit.toString(),
    gasPriceWei: gasPriceWei.toString(),
    maximumCostWei: (gasLimit * gasPriceWei).toString(),
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    serializedUnsignedTransaction,
    signingHash: keccak256(serializedUnsignedTransaction),
    sourceEnvelopeHash
  });
}

function inspectExactTransaction(
  input: unknown
): BscTestnetPtaWbnbPoolExactSigningTransaction | null {
  const transaction = inspectDataRecord(input, TRANSACTION_KEYS);
  if (transaction === null) return null;
  const gasLimit = canonicalNonZeroUint(
    transaction.gasLimit,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT
  );
  const gasPriceWei = canonicalNonZeroUint(
    transaction.gasPriceWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI
  );
  const maximumCostWei = canonicalNonZeroUint(
    transaction.maximumCostWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI
  );
  const unsigned = exactLowerHex(transaction.serializedUnsignedTransaction);
  const signingHash = nonzeroHex32(transaction.signingHash);
  const sourceEnvelopeHash = nonzeroHex32(transaction.sourceEnvelopeHash);
  if (
    transaction.type !== "legacy" ||
    transaction.eip155ReplayProtection !== true ||
    transaction.from !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    transaction.to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
    transaction.nonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL ||
    transaction.valueWei !== "0" ||
    transaction.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
    gasLimit === null ||
    gasPriceWei === null ||
    maximumCostWei === null ||
    maximumCostWei !== gasLimit * gasPriceWei ||
    unsigned === null ||
    signingHash === null ||
    sourceEnvelopeHash === null
  ) {
    return null;
  }
  const rebuilt = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: gasLimit.toString(),
    gasPriceWei: gasPriceWei.toString(),
    sourceEnvelopeHash
  });
  if (
    rebuilt === null ||
    rebuilt.serializedUnsignedTransaction !== unsigned ||
    rebuilt.signingHash !== signingHash
  ) {
    return null;
  }
  return rebuilt;
}

/** Strict content parser; authenticity still requires the authorization gate's private brand. */
export function parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse(
  input: unknown
): BscTestnetPtaWbnbPoolAuthorizedSigningIntent | null {
  const root = inspectDataRecord(input, AUTHORIZED_INTENT_KEYS);
  if (root === null || !Object.isFrozen(input)) return null;
  const transaction = inspectExactTransaction(root.transaction);
  const envelopeHash = nonzeroHex32(root.envelopeHash);
  const reviewerApprovalDigest = nonzeroHex32(root.reviewerApprovalDigest);
  const ownerAuthorizationDigest = nonzeroHex32(root.ownerAuthorizationDigest);
  const recovery = inspectRecoveryAttemptBinding(root.recovery);
  const runtimeManifestSha256 = nonzeroHex32(root.runtimeManifestSha256);
  const releaseCommit = exactReleaseCommit(root.releaseCommit);
  const authenticatedAt = canonicalUtc(root.authenticatedAt);
  const expiresAt = canonicalUtc(root.expiresAt);
  if (
    transaction === null ||
    !Object.isFrozen(root.transaction) ||
    envelopeHash === null ||
    reviewerApprovalDigest === null ||
    ownerAuthorizationDigest === null ||
    recovery === null ||
    runtimeManifestSha256 === null ||
    releaseCommit === null ||
    authenticatedAt === null ||
    expiresAt === null ||
    root.schemaVersion !== 8 ||
    root.scope !==
      "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_8" ||
    root.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    transaction.sourceEnvelopeHash !== envelopeHash ||
    expiresAt.milliseconds - authenticatedAt.milliseconds !==
      BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS * 1_000
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: 8,
    scope: "owner_designated_internal_release_policy_and_exact_owner_pool_recovery_generation_8",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash,
    reviewerApprovalDigest,
    ownerAuthorizationDigest,
    releaseCommit,
    runtimeManifestSha256,
    authenticatedAt: authenticatedAt.iso,
    expiresAt: expiresAt.iso,
    recovery,
    transaction
  });
}

function inspectFreshCapability(
  input: unknown
): BscTestnetPtaWbnbPoolFreshRecheckCapability | null {
  const root = inspectDataRecord(input, FRESH_CAPABILITY_KEYS);
  if (root === null) return null;
  const rpc = inspectDataRecord(root.rpc, RPC_KEYS);
  const transaction = inspectExactTransaction(root.transaction);
  const releaseCommit = exactReleaseCommit(root.releaseCommit);
  const runtimeManifestSha256 = nonzeroHex32(root.runtimeManifestSha256);
  const envelopeHash = nonzeroHex32(root.envelopeHash);
  const reviewerApprovalDigest = nonzeroHex32(root.reviewerApprovalDigest);
  const ownerAuthorizationDigest = nonzeroHex32(root.ownerAuthorizationDigest);
  const recovery = inspectRecoveryAttemptBinding(root.recovery);
  const journalClaimToken = nonzeroHex32(root.journalClaimToken);
  const claimId = exactClaimId(root.claimId);
  const authenticatedAt = canonicalUtc(root.authenticatedAt);
  const expiresAt = canonicalUtc(root.expiresAt);
  const observedAt = rpc === null ? null : canonicalUtc(rpc.observedAt);
  const finalizedBlockTimestamp =
    rpc === null ? null : canonicalNonZeroUint(rpc.finalizedBlockTimestamp);
  const finalizedBlockGasLimit =
    rpc === null ? null : canonicalNonZeroUint(rpc.finalizedBlockGasLimit);
  const senderBalanceWei = rpc === null ? null : canonicalUint(rpc.senderBalanceWei);
  const gasEstimate =
    rpc === null
      ? null
      : canonicalNonZeroUint(rpc.gasEstimate, BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE);
  const rpcGasPriceWei =
    rpc === null
      ? null
      : canonicalNonZeroUint(rpc.gasPriceWei, BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI);
  const transactionGasLimit = transaction === null ? null : BigInt(transaction.gasLimit);
  const transactionGasPriceWei = transaction === null ? null : BigInt(transaction.gasPriceWei);
  const transactionMaximumCostWei =
    transaction === null ? null : BigInt(transaction.maximumCostWei);
  const refreshedMinimumGasLimit =
    gasEstimate === null ? null : calculateBscTestnetPtaWbnbPoolGasLimit(gasEstimate);
  if (
    rpc === null ||
    transaction === null ||
    releaseCommit === null ||
    runtimeManifestSha256 === null ||
    envelopeHash === null ||
    reviewerApprovalDigest === null ||
    ownerAuthorizationDigest === null ||
    recovery === null ||
    journalClaimToken === null ||
    claimId === null ||
    authenticatedAt === null ||
    expiresAt === null ||
    observedAt === null ||
    finalizedBlockTimestamp === null ||
    finalizedBlockGasLimit === null ||
    senderBalanceWei === null ||
    gasEstimate === null ||
    rpcGasPriceWei === null ||
    transactionGasLimit === null ||
    transactionGasPriceWei === null ||
    transactionMaximumCostWei === null ||
    refreshedMinimumGasLimit === null ||
    root.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCHEMA_VERSION ||
    root.scope !== BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE ||
    root.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    root.freshPostClaimDualRpcRecheckPerformed !== true ||
    rpc.primaryOrigin !== BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN ||
    rpc.corroboratorOrigin !== BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN ||
    rpc.providerAgreementVerified !== true ||
    rpc.canonicalFinalizedBlockVerified !== true ||
    rpc.eip1898RequireCanonical !== true ||
    typeof rpc.finalizedBlockNumber !== "string" ||
    !/^[1-9][0-9]*$/u.test(rpc.finalizedBlockNumber) ||
    nonzeroHex32(rpc.finalizedBlockHash) === null ||
    observedAt.iso !== authenticatedAt.iso ||
    finalizedBlockTimestamp * 1_000n > BigInt(observedAt.milliseconds) ||
    BigInt(observedAt.milliseconds) - finalizedBlockTimestamp * 1_000n >
      BigInt(BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS * 1_000) ||
    transactionGasLimit < refreshedMinimumGasLimit ||
    transactionGasLimit > finalizedBlockGasLimit ||
    rpcGasPriceWei !== transactionGasPriceWei ||
    senderBalanceWei < transactionMaximumCostWei ||
    rpc.latestNonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL ||
    rpc.pendingNonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL ||
    rpc.factoryPool !== ZERO_ADDRESS ||
    rpc.candidateCode !== "0x" ||
    rpc.senderCode !== "0x" ||
    rpc.simulationReturnPool !== BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE ||
    authenticatedAt.milliseconds >= expiresAt.milliseconds
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCHEMA_VERSION,
    scope: BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash,
    reviewerApprovalDigest,
    ownerAuthorizationDigest,
    claimId,
    journalClaimToken,
    releaseCommit,
    runtimeManifestSha256,
    authenticatedAt: authenticatedAt.iso,
    expiresAt: expiresAt.iso,
    recovery,
    freshPostClaimDualRpcRecheckPerformed: true,
    rpc: Object.freeze({
      primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
      corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
      providerAgreementVerified: true,
      canonicalFinalizedBlockVerified: true,
      eip1898RequireCanonical: true,
      observedAt: observedAt.iso,
      finalizedBlockNumber: rpc.finalizedBlockNumber,
      finalizedBlockHash: rpc.finalizedBlockHash as Hex,
      finalizedBlockTimestamp: finalizedBlockTimestamp.toString(),
      finalizedBlockGasLimit: finalizedBlockGasLimit.toString(),
      latestNonce: BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL,
      pendingNonce: BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL,
      factoryPool: ZERO_ADDRESS,
      candidateCode: "0x",
      senderCode: "0x",
      senderBalanceWei: senderBalanceWei.toString(),
      gasEstimate: gasEstimate.toString(),
      gasPriceWei: rpcGasPriceWei.toString(),
      simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
    }),
    transaction
  });
}

/**
 * Validates post-claim state content. Authentication remains a separate privileged
 * capability check in the signer core; JSON fields and digests cannot authenticate an RPC reader.
 */
export function validateBscTestnetPtaWbnbPoolFreshRecheckCapability(
  untrustedCapability: unknown,
  expected: Readonly<{
    authorizedIntent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
    claimId: string;
  }>,
  untrustedAsOf: unknown
): BscTestnetPtaWbnbPoolFreshRecheckValidationResult {
  try {
    const asOfMilliseconds = captureDate(untrustedAsOf);
    const capability = inspectFreshCapability(untrustedCapability);
    const expectedClaimId = exactClaimId(expected.claimId);
    if (asOfMilliseconds === null) {
      return Object.freeze({
        status: "invalid" as const,
        intent: null,
        issue: issue("CLOCK_INVALID", "asOf", "Signer clock must return an exact finite Date.")
      });
    }
    if (capability === null || expectedClaimId === null) {
      return Object.freeze({
        status: "invalid" as const,
        intent: null,
        issue: issue(
          "CAPABILITY_INVALID",
          "capability",
          "Post-claim capability must have the exact dual-RPC shape and canonical fields."
        )
      });
    }
    const authenticatedAt = canonicalUtc(capability.authenticatedAt);
    const expiresAt = canonicalUtc(capability.expiresAt);
    if (authenticatedAt === null || expiresAt === null) {
      return Object.freeze({
        status: "invalid" as const,
        intent: null,
        issue: issue("CAPABILITY_INVALID", "capability", "Capability timestamps are invalid.")
      });
    }
    if (authenticatedAt.milliseconds > asOfMilliseconds) {
      return Object.freeze({
        status: "invalid" as const,
        intent: null,
        issue: issue(
          "CAPABILITY_FROM_FUTURE",
          "capability.authenticatedAt",
          "Post-claim capability authentication time is in the future."
        )
      });
    }
    if (
      asOfMilliseconds - authenticatedAt.milliseconds >
      BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS * 1_000
    ) {
      return Object.freeze({
        status: "invalid" as const,
        intent: null,
        issue: issue(
          "CAPABILITY_STALE",
          "capability.authenticatedAt",
          "Post-claim capability exceeded its thirty-second freshness window."
        )
      });
    }
    if (expiresAt.milliseconds <= asOfMilliseconds) {
      return Object.freeze({
        status: "invalid" as const,
        intent: null,
        issue: issue("CAPABILITY_EXPIRED", "capability.expiresAt", "Capability has expired.")
      });
    }
    const authorizedIntent = parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse(
      expected.authorizedIntent
    );
    const authorizedAt =
      authorizedIntent === null ? null : canonicalUtc(authorizedIntent.authenticatedAt);
    const authorizedExpiry =
      authorizedIntent === null ? null : canonicalUtc(authorizedIntent.expiresAt);
    if (
      authorizedIntent === null ||
      authorizedAt === null ||
      authorizedExpiry === null ||
      capability.operationKey !== authorizedIntent.operationKey ||
      capability.envelopeHash !== authorizedIntent.envelopeHash ||
      capability.releaseCommit !== authorizedIntent.releaseCommit ||
      capability.runtimeManifestSha256 !== authorizedIntent.runtimeManifestSha256 ||
      capability.reviewerApprovalDigest !== authorizedIntent.reviewerApprovalDigest ||
      capability.ownerAuthorizationDigest !== authorizedIntent.ownerAuthorizationDigest ||
      !sameRecoveryAttemptBinding(capability.recovery, authorizedIntent.recovery) ||
      capability.claimId !== expectedClaimId ||
      capability.transaction.sourceEnvelopeHash !== authorizedIntent.envelopeHash ||
      JSON.stringify(capability.transaction) !== JSON.stringify(authorizedIntent.transaction) ||
      authenticatedAt.milliseconds < authorizedAt.milliseconds ||
      expiresAt.milliseconds !== authorizedExpiry.milliseconds
    ) {
      return Object.freeze({
        status: "invalid" as const,
        intent: null,
        issue: issue(
          "CLAIM_BINDING_INVALID",
          "capability",
          "Post-claim capability does not bind the exact authorization, release, claim, and transaction."
        )
      });
    }
    return Object.freeze({
      status: "valid" as const,
      intent: Object.freeze({
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
        envelopeHash: capability.envelopeHash,
        reviewerApprovalDigest: capability.reviewerApprovalDigest,
        ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
        claimId: capability.claimId,
        journalClaimToken: capability.journalClaimToken,
        releaseCommit: capability.releaseCommit,
        runtimeManifestSha256: capability.runtimeManifestSha256,
        authenticatedAt: capability.authenticatedAt,
        expiresAt: capability.expiresAt,
        recovery: capability.recovery,
        transaction: capability.transaction
      }),
      issue: null
    });
  } catch {
    return Object.freeze({
      status: "invalid" as const,
      intent: null,
      issue: issue(
        "CAPABILITY_INVALID",
        "capability",
        "Post-claim capability validation failed closed."
      )
    });
  }
}

export function buildBscTestnetPtaWbnbPoolSigningWorkerRequest(
  intent: BscTestnetPtaWbnbPoolValidatedSigningIntent
): BscTestnetPtaWbnbPoolSigningWorkerRequest {
  const body = {
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
    environment: "bsc-testnet" as const,
    chainId: "97" as const,
    oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: intent.claimId,
    journalClaimToken: intent.journalClaimToken,
    releaseCommit: intent.releaseCommit,
    runtimeManifestSha256: intent.runtimeManifestSha256,
    reviewerApprovalDigest: intent.reviewerApprovalDigest,
    ownerAuthorizationDigest: intent.ownerAuthorizationDigest,
    authenticatedAt: intent.authenticatedAt,
    expiresAt: intent.expiresAt,
    recovery: intent.recovery,
    transaction: intent.transaction,
    requestHashDomain: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_REQUEST_HASH_DOMAIN
  };
  return Object.freeze({
    ...body,
    requestHash: deriveBscTestnetPtaWbnbPoolSigningWorkerRequestHash(body)
  });
}

function inspectWorkerRequest(input: unknown): BscTestnetPtaWbnbPoolSigningWorkerRequest | null {
  const root = inspectDataRecord(input, WORKER_REQUEST_KEYS);
  if (root === null) return null;
  const transaction = inspectExactTransaction(root.transaction);
  const releaseCommit = exactReleaseCommit(root.releaseCommit);
  const runtimeManifestSha256 = nonzeroHex32(root.runtimeManifestSha256);
  const journalClaimToken = nonzeroHex32(root.journalClaimToken);
  const reviewerApprovalDigest = nonzeroHex32(root.reviewerApprovalDigest);
  const ownerAuthorizationDigest = nonzeroHex32(root.ownerAuthorizationDigest);
  const recovery = inspectRecoveryAttemptBinding(root.recovery);
  const claimId = exactClaimId(root.claimId);
  const authenticatedAt = canonicalUtc(root.authenticatedAt);
  const expiresAt = canonicalUtc(root.expiresAt);
  const requestHash = nonzeroHex32(root.requestHash);
  if (
    transaction === null ||
    releaseCommit === null ||
    runtimeManifestSha256 === null ||
    journalClaimToken === null ||
    reviewerApprovalDigest === null ||
    ownerAuthorizationDigest === null ||
    recovery === null ||
    claimId === null ||
    authenticatedAt === null ||
    expiresAt === null ||
    requestHash === null ||
    root.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION ||
    root.operation !== BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION ||
    root.environment !== "bsc-testnet" ||
    root.chainId !== "97" ||
    root.oneShotIntentId !== BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID ||
    root.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    root.requestHashDomain !== BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_REQUEST_HASH_DOMAIN ||
    authenticatedAt.milliseconds >= expiresAt.milliseconds ||
    expiresAt.milliseconds - authenticatedAt.milliseconds >
      BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS * 1_000 ||
    transaction.sourceEnvelopeHash === `0x${"00".repeat(32)}`
  ) {
    return null;
  }
  const body = {
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
    environment: "bsc-testnet" as const,
    chainId: "97" as const,
    oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId,
    journalClaimToken,
    releaseCommit,
    runtimeManifestSha256,
    reviewerApprovalDigest,
    ownerAuthorizationDigest,
    authenticatedAt: authenticatedAt.iso,
    expiresAt: expiresAt.iso,
    recovery,
    transaction,
    requestHashDomain: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_REQUEST_HASH_DOMAIN
  };
  if (deriveBscTestnetPtaWbnbPoolSigningWorkerRequestHash(body) !== requestHash) return null;
  return Object.freeze({ ...body, requestHash });
}

/** Worker-local exact request gate. It must run immediately before scoped secret access. */
export function validateBscTestnetPtaWbnbPoolSigningWorkerRequest(
  untrustedRequest: unknown,
  untrustedAsOf: unknown
): BscTestnetPtaWbnbPoolWorkerRequestValidationResult {
  try {
    const request = inspectWorkerRequest(untrustedRequest);
    const asOfMilliseconds = captureDate(untrustedAsOf);
    if (request === null || asOfMilliseconds === null) {
      return Object.freeze({
        status: "invalid" as const,
        request: null,
        issue: issue(
          "WORKER_REQUEST_INVALID",
          "request",
          "Worker request or worker-local clock failed exact validation."
        )
      });
    }
    const authenticatedAt = canonicalUtc(request.authenticatedAt);
    const expiresAt = canonicalUtc(request.expiresAt);
    if (authenticatedAt === null || expiresAt === null) {
      return Object.freeze({
        status: "invalid" as const,
        request: null,
        issue: issue("WORKER_REQUEST_INVALID", "request", "Worker timestamps are invalid.")
      });
    }
    if (
      authenticatedAt.milliseconds > asOfMilliseconds ||
      asOfMilliseconds - authenticatedAt.milliseconds >
        BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS * 1_000 ||
      expiresAt.milliseconds <= asOfMilliseconds
    ) {
      return Object.freeze({
        status: "invalid" as const,
        request: null,
        issue: issue(
          "CAPABILITY_EXPIRED",
          "request.authenticatedAt",
          "Worker request is future-dated, stale, or expired."
        )
      });
    }
    return Object.freeze({ status: "valid" as const, request, issue: null });
  } catch {
    return Object.freeze({
      status: "invalid" as const,
      request: null,
      issue: issue("WORKER_REQUEST_INVALID", "request", "Worker request validation failed closed.")
    });
  }
}

/** Internal parser for a server composition that already owns its clock gate. */
export function parseBscTestnetPtaWbnbPoolSigningWorkerRequestForInternalUse(
  input: unknown
): BscTestnetPtaWbnbPoolSigningWorkerRequest | null {
  return inspectWorkerRequest(input);
}

function invalidWorkerResponse(
  problem: BscTestnetPtaWbnbPoolProtocolIssue
): BscTestnetPtaWbnbPoolWorkerResponseValidationResult {
  return Object.freeze({
    status: "invalid" as const,
    signedTransaction: null,
    transactionHash: null,
    recoveredSigner: null,
    issue: problem
  });
}

/** Exact signed legacy transaction validation, including canonical RLP, low-S, and recovery. */
export async function validateBscTestnetPtaWbnbPoolSigningWorkerResponse(
  untrustedResponse: unknown,
  untrustedRequest: unknown
): Promise<BscTestnetPtaWbnbPoolWorkerResponseValidationResult> {
  try {
    const request = inspectWorkerRequest(untrustedRequest);
    if (request === null) {
      return invalidWorkerResponse(
        issue("WORKER_REQUEST_INVALID", "request", "Correlating worker request is invalid.")
      );
    }
    const response = inspectDataRecord(untrustedResponse, WORKER_RESPONSE_KEYS);
    const signedTransaction = response && exactLowerHex(response.signedTransaction);
    const transactionHash = response && nonzeroHex32(response.transactionHash);
    if (
      response === null ||
      signedTransaction === null ||
      transactionHash === null ||
      response.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_PROTOCOL_VERSION ||
      response.operation !== BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION ||
      response.status !== "signed" ||
      response.oneShotIntentId !== BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID ||
      response.operationKey !== request.operationKey ||
      response.claimId !== request.claimId ||
      response.journalClaimToken !== request.journalClaimToken ||
      response.releaseCommit !== request.releaseCommit ||
      response.runtimeManifestSha256 !== request.runtimeManifestSha256 ||
      response.requestHash !== request.requestHash ||
      response.signingHash !== request.transaction.signingHash ||
      (signedTransaction.length - 2) / 2 > MAXIMUM_SIGNED_TRANSACTION_BYTES ||
      keccak256(signedTransaction) !== transactionHash
    ) {
      return invalidWorkerResponse(
        issue(
          "WORKER_RESPONSE_INVALID",
          "response",
          "Worker response shape, release, claim, or transaction correlation is invalid."
        )
      );
    }

    let transaction: ReturnType<typeof parseTransaction>;
    try {
      transaction = parseTransaction(signedTransaction as TransactionSerialized);
    } catch {
      return invalidWorkerResponse(
        issue(
          "SIGNED_TRANSACTION_INVALID",
          "response.signedTransaction",
          "Worker output is not a canonical signed Ethereum transaction."
        )
      );
    }
    const r = canonicalSignatureScalar(transaction.r);
    const s = canonicalSignatureScalar(transaction.s);
    const yParity = transaction.yParity;
    const expectedV =
      yParity === 0 || yParity === 1
        ? BigInt(BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID) * 2n + 35n + BigInt(yParity)
        : null;
    let normalizedTo: Address | null = null;
    try {
      normalizedTo = typeof transaction.to === "string" ? getAddress(transaction.to) : null;
    } catch {
      normalizedTo = null;
    }
    const gasLimit = BigInt(request.transaction.gasLimit);
    const gasPriceWei = BigInt(request.transaction.gasPriceWei);
    if (
      transaction.type !== "legacy" ||
      transaction.chainId !== BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID ||
      transaction.nonce !== Number(BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE) ||
      normalizedTo !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
      (transaction.value ?? 0n) !== 0n ||
      transaction.gas !== gasLimit ||
      transaction.gasPrice !== gasPriceWei ||
      transaction.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
      r === null ||
      s === null ||
      s.value > SECP256K1_HALF_ORDER ||
      expectedV === null ||
      transaction.v !== expectedV
    ) {
      return invalidWorkerResponse(
        issue(
          "SIGNED_TRANSACTION_MISMATCH",
          "response.signedTransaction",
          "Signed fields, EIP-155 chain, nonce, gas, calldata, or low-S signature differ."
        )
      );
    }
    const canonicalSigned = serializeTransaction(
      {
        type: "legacy",
        chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
        nonce: Number(BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE),
        gasPrice: gasPriceWei,
        gas: gasLimit,
        to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
        value: 0n,
        data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
      },
      { r: r.hex32, s: s.hex32, v: expectedV }
    );
    const canonicalUnsigned = serializeTransaction({
      type: "legacy",
      chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
      nonce: Number(BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE),
      gasPrice: gasPriceWei,
      gas: gasLimit,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      value: 0n,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
    });
    if (
      canonicalSigned !== signedTransaction ||
      canonicalUnsigned !== request.transaction.serializedUnsignedTransaction ||
      keccak256(canonicalUnsigned) !== request.transaction.signingHash
    ) {
      return invalidWorkerResponse(
        issue(
          "SIGNED_TRANSACTION_MISMATCH",
          "response.signedTransaction",
          "Signed and unsigned transactions failed canonical RLP round trips."
        )
      );
    }
    let recoveredSigner: Address;
    try {
      recoveredSigner = getAddress(
        await recoverTransactionAddress({
          serializedTransaction: signedTransaction as TransactionSerialized
        })
      );
    } catch {
      return invalidWorkerResponse(
        issue(
          "SIGNED_TRANSACTION_INVALID",
          "response.signedTransaction",
          "Signature recovery failed."
        )
      );
    }
    if (recoveredSigner !== BSC_TESTNET_PTA_WBNB_POOL_SENDER) {
      return invalidWorkerResponse(
        issue(
          "SIGNER_MISMATCH",
          "response.signedTransaction",
          "Recovered signer is not the PTA deployer."
        )
      );
    }
    return Object.freeze({
      status: "valid" as const,
      signedTransaction,
      transactionHash,
      recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      issue: null
    });
  } catch {
    return invalidWorkerResponse(
      issue("WORKER_RESPONSE_INVALID", "response", "Worker response validation failed closed.")
    );
  }
}

// Compile-time/runtime anchors prevent accidental reinterpretation of the fixed calldata scope.
void BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR;
void BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256;
