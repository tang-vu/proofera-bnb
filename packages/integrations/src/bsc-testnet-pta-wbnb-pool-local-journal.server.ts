import "server-only";

import { createHash } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import { keccak256, type Address, type Hex } from "viem";

import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_FENCE_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ATTEMPT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ENVELOPE_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_RELEASE_COMMIT,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_RUNTIME_MANIFEST_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_ATTEMPT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_ENVELOPE_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_RELEASE_COMMIT,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_RUNTIME_MANIFEST_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_ATTEMPT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_ENVELOPE_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_RELEASE_COMMIT,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_RUNTIME_MANIFEST_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_ATTEMPT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_ENVELOPE_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_RELEASE_COMMIT,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_RUNTIME_MANIFEST_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ATTEMPT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ENVELOPE_HASH,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_RELEASE_COMMIT,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_RUNTIME_MANIFEST_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
  BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
  parseBscTestnetPtaWbnbPoolSigningWorkerRequestForInternalUse,
  validateBscTestnetPtaWbnbPoolSigningWorkerRequest,
  validateBscTestnetPtaWbnbPoolSigningWorkerResponse,
  type BscTestnetPtaWbnbPoolSigningWorkerRequest,
  type BscTestnetPtaWbnbPoolSigningWorkerResponse
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_POST_CLAIM_RECHECK_ISSUE_CODES,
  type BscTestnetPtaWbnbPoolPostClaimRecheckIssueCode
} from "./bsc-testnet-pta-wbnb-pool-post-claim-recheck.server";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function isOutsideRepository(candidate: string): boolean {
  const relation = relative(REPOSITORY_ROOT, candidate);
  return (
    relation !== "" &&
    (isAbsolute(relation) || relation === ".." || relation.startsWith(`..${sep}`))
  );
}
const LEGACY_JOURNAL_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-v1"
] as const;
const GENERATION_2_JOURNAL_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-v2"
] as const;
const GENERATION_3_JOURNAL_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-v3"
] as const;
const GENERATION_4_JOURNAL_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-v4"
] as const;
const GENERATION_5_JOURNAL_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-v5"
] as const;
const GENERATION_6_JOURNAL_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-v6"
] as const;
const GENERATION_7_JOURNAL_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-v7"
] as const;
const PREDECESSOR_JOURNAL_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-v8"
] as const;
const ACTIVE_JOURNAL_SUBDIRECTORY = [
  "ProofEra",
  "operations",
  "bsc-testnet-pta-wbnb-pool-v9"
] as const;
const LEGACY_SCHEMA_VERSION = "bsc_testnet_pta_wbnb_pool_local_journal_v1" as const;
const GENERATION_2_SCHEMA_VERSION = "bsc_testnet_pta_wbnb_pool_local_journal_v2" as const;
const GENERATION_3_SCHEMA_VERSION = "bsc_testnet_pta_wbnb_pool_local_journal_v3" as const;
const GENERATION_4_SCHEMA_VERSION = "bsc_testnet_pta_wbnb_pool_local_journal_v4" as const;
const GENERATION_5_SCHEMA_VERSION = "bsc_testnet_pta_wbnb_pool_local_journal_v5" as const;
const GENERATION_6_SCHEMA_VERSION = "bsc_testnet_pta_wbnb_pool_local_journal_v6" as const;
const GENERATION_7_SCHEMA_VERSION = "bsc_testnet_pta_wbnb_pool_local_journal_v7" as const;
const PREDECESSOR_SCHEMA_VERSION = "bsc_testnet_pta_wbnb_pool_local_journal_v8" as const;
const ACTIVE_SCHEMA_VERSION = "bsc_testnet_pta_wbnb_pool_local_journal_v9" as const;
const SUPERSESSION_FENCE_SCHEMA_VERSION =
  "bsc_testnet_pta_wbnb_pool_pre_worker_supersession_fence_v3" as const;
const GENERATION_2_SUPERSESSION_FENCE_SCHEMA_VERSION =
  "bsc_testnet_pta_wbnb_pool_pre_worker_supersession_fence_v2" as const;
const LEGACY_SUPERSESSION_FENCE_SCHEMA_VERSION =
  "bsc_testnet_pta_wbnb_pool_pre_worker_supersession_fence_v1" as const;
const LEGACY_AUTHORIZATION_KIND =
  "exact_pta_wbnb_pool_initialization_user_authorization_v1" as const;
const ACTIVE_AUTHORIZATION_KIND =
  "exact_pta_wbnb_pool_recovery_generation_9_user_authorization_v9" as const;
const PREDECESSOR_AUTHORIZATION_KIND =
  "exact_pta_wbnb_pool_recovery_generation_8_user_authorization_v8" as const;
const GENERATION_7_AUTHORIZATION_KIND =
  "exact_pta_wbnb_pool_recovery_generation_7_user_authorization_v7" as const;
const GENERATION_6_AUTHORIZATION_KIND =
  "exact_pta_wbnb_pool_recovery_generation_6_user_authorization_v6" as const;
const GENERATION_5_AUTHORIZATION_KIND =
  "exact_pta_wbnb_pool_recovery_generation_5_user_authorization_v5" as const;
const GENERATION_4_AUTHORIZATION_KIND =
  "exact_pta_wbnb_pool_recovery_generation_4_user_authorization_v4" as const;
const GENERATION_3_AUTHORIZATION_KIND =
  "exact_pta_wbnb_pool_recovery_generation_3_user_authorization_v3" as const;
const GENERATION_2_AUTHORIZATION_KIND =
  "exact_pta_wbnb_pool_recovery_generation_2_user_authorization_v2" as const;
const GENERATION_2_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.authorization-receipt.v2" as const;
const GENERATION_2_CLAIM_ID_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.claim-id.v2" as const;
const GENERATION_3_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.authorization-receipt.v3" as const;
const GENERATION_3_CLAIM_ID_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.claim-id.v3" as const;
const GENERATION_4_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.authorization-receipt.v4" as const;
const GENERATION_4_CLAIM_ID_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.claim-id.v4" as const;
const GENERATION_5_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.authorization-receipt.v5" as const;
const GENERATION_5_CLAIM_ID_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.claim-id.v5" as const;
const GENERATION_6_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.authorization-receipt.v6" as const;
const GENERATION_6_CLAIM_ID_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.claim-id.v6" as const;
const GENERATION_7_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.authorization-receipt.v7" as const;
const GENERATION_7_CLAIM_ID_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.claim-id.v7" as const;
const PREDECESSOR_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.authorization-receipt.v8" as const;
const PREDECESSOR_CLAIM_ID_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.claim-id.v8" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_ACTIVE_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.authorization-receipt.v9" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_ACTIVE_CLAIM_ID_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.claim-id.v9" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_SUPERSESSION_FENCE_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.pre-worker-supersession-fence.v3" as const;
const GENERATION_2_SUPERSESSION_FENCE_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.pre-worker-supersession-fence.v2" as const;
const LEGACY_SUPERSESSION_FENCE_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.pre-worker-supersession-fence.v1" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_NO_EFFECT_PROOF_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.pre-worker-no-effect-proof.v2" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_FAILED_BEFORE_WORKER_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.failed-before-worker.v9" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_FAILED_BEFORE_WORKER_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.failed-before-worker.v8" as const;
const HISTORICAL_PREDECESSOR_STATE = "superseded_before_worker" as const;
export {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_FENCE_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256
};
const MAXIMUM_RECORD_BYTES = 32_768;
const MAXIMUM_AUTHORIZATION_LIFETIME_MILLISECONDS =
  BSC_TESTNET_PTA_WBNB_POOL_EXECUTION_AUTHORITY_LIFETIME_SECONDS * 1_000;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const RAW_TRANSACTION = /^0x[0-9a-f]+$/u;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/u;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const RELEASE_COMMIT = /^[0-9a-f]{40}$/u;
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;
const UINT64_MAX = (1n << 64n) - 1n;

const LEGACY_SLOT_FILES = Object.freeze([
  "01-claim.v1.json",
  "02-transition.v1.json",
  "03-transition.v1.json",
  "04-transition.v1.json",
  "05-transition.v1.json"
]);
const ACTIVE_SLOT_FILES = Object.freeze([
  "01-claim.v9.json",
  "02-transition.v9.json",
  "03-transition.v9.json",
  "04-transition.v9.json",
  "05-transition.v9.json"
]);
const GENERATION_2_SLOT_FILES = Object.freeze([
  "01-claim.v2.json",
  "02-transition.v2.json",
  "03-transition.v2.json",
  "04-transition.v2.json",
  "05-transition.v2.json"
]);
const GENERATION_5_SLOT_FILES = Object.freeze([
  "01-claim.v5.json",
  "02-transition.v5.json",
  "03-transition.v5.json",
  "04-transition.v5.json",
  "05-transition.v5.json"
]);
const GENERATION_6_SLOT_FILES = Object.freeze([
  "01-claim.v6.json",
  "02-transition.v6.json",
  "03-transition.v6.json",
  "04-transition.v6.json",
  "05-transition.v6.json"
]);
const GENERATION_7_SLOT_FILES = Object.freeze([
  "01-claim.v7.json",
  "02-transition.v7.json",
  "03-transition.v7.json",
  "04-transition.v7.json",
  "05-transition.v7.json"
]);
const PREDECESSOR_SLOT_FILES = Object.freeze([
  "01-claim.v8.json",
  "02-transition.v8.json",
  "03-transition.v8.json",
  "04-transition.v8.json",
  "05-transition.v8.json"
]);
const GENERATION_4_SLOT_FILES = Object.freeze([
  "01-claim.v4.json",
  "02-transition.v4.json",
  "03-transition.v4.json",
  "04-transition.v4.json",
  "05-transition.v4.json"
]);
const GENERATION_3_SLOT_FILES = Object.freeze([
  "01-claim.v3.json",
  "02-transition.v3.json",
  "03-transition.v3.json",
  "04-transition.v3.json",
  "05-transition.v3.json"
]);

export { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY };

type JournalGeneration =
  | 1
  | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
  | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
  | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4
  | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
  | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
  | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
  | typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
  | typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION;

function isFenceableGeneration(generation: JournalGeneration): generation is 1 | 2 | 3 {
  return generation <= BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3;
}

function slotFilesFor(generation: JournalGeneration): readonly string[] {
  switch (generation) {
    case 1:
      return LEGACY_SLOT_FILES;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2:
      return GENERATION_2_SLOT_FILES;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3:
      return GENERATION_3_SLOT_FILES;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4:
      return GENERATION_4_SLOT_FILES;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5:
      return GENERATION_5_SLOT_FILES;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6:
      return GENERATION_6_SLOT_FILES;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7:
      return GENERATION_7_SLOT_FILES;
    case BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION:
      return PREDECESSOR_SLOT_FILES;
    case BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION:
      return ACTIVE_SLOT_FILES;
  }
}

function expectedClaimRawSha256For(generation: 1 | 2 | 3): Hex {
  switch (generation) {
    case 1:
      return BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2:
      return BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3:
      return BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256;
  }
}

export interface BscTestnetPtaWbnbPoolRecoveryJournalBinding {
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION;
  readonly predecessorState: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
  readonly predecessorTerminalRawSha256: Hex;
  readonly attemptId: Hex;
}

/** Exact generation-1 wire shape, exported only for deterministic legacy-fixture tests. */
export interface BscTestnetPtaWbnbPoolLegacyClaimRequestForTests {
  readonly operationKey: Hex;
  readonly envelopeHash: Hex;
  readonly signingHash: Hex;
  readonly serializedUnsignedSha256: Hex;
  readonly gasLimit: string;
  readonly gasPriceWei: string;
  readonly maxCostWei: string;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly authorizedAt: string;
  readonly expiresAt: string;
  /** Integrity only. It is not authentication or authorization by itself. */
  readonly authorizationReceiptSha256: Hex;
}

interface BscTestnetPtaWbnbPoolRecoveryClaimRequest extends BscTestnetPtaWbnbPoolLegacyClaimRequestForTests {
  readonly generation:
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
    | typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
    | typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION;
  readonly predecessorState:
    typeof HISTORICAL_PREDECESSOR_STATE | typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
  readonly predecessorFenceSha256?: Hex;
  readonly predecessorTerminalRawSha256?: Hex;
  readonly attemptId: Hex;
}

export interface BscTestnetPtaWbnbPoolGeneration9ClaimRequest extends BscTestnetPtaWbnbPoolRecoveryClaimRequest {
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION;
  readonly predecessorState: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
  readonly predecessorFenceSha256?: never;
  readonly predecessorTerminalRawSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolGeneration8ClaimRequest extends BscTestnetPtaWbnbPoolRecoveryClaimRequest {
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION;
  readonly predecessorState: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
  readonly predecessorFenceSha256?: never;
  readonly predecessorTerminalRawSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolGeneration7ClaimRequest extends BscTestnetPtaWbnbPoolRecoveryClaimRequest {
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7;
  readonly predecessorState: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
  readonly predecessorFenceSha256?: never;
  readonly predecessorTerminalRawSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolGeneration6ClaimRequest extends BscTestnetPtaWbnbPoolRecoveryClaimRequest {
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6;
  readonly predecessorState: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
  readonly predecessorFenceSha256?: never;
  readonly predecessorTerminalRawSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolGeneration5ClaimRequest extends BscTestnetPtaWbnbPoolRecoveryClaimRequest {
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5;
  readonly predecessorState: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
  readonly predecessorFenceSha256?: never;
  readonly predecessorTerminalRawSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolGeneration4ClaimRequest extends BscTestnetPtaWbnbPoolRecoveryClaimRequest {
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4;
  readonly predecessorState: typeof HISTORICAL_PREDECESSOR_STATE;
  readonly predecessorFenceSha256: Hex;
  readonly predecessorTerminalRawSha256?: never;
}

export interface BscTestnetPtaWbnbPoolGeneration3ClaimRequest extends BscTestnetPtaWbnbPoolRecoveryClaimRequest {
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3;
  readonly predecessorState: typeof HISTORICAL_PREDECESSOR_STATE;
  readonly predecessorFenceSha256: Hex;
  readonly predecessorTerminalRawSha256?: never;
}

type AnyClaimRequest =
  BscTestnetPtaWbnbPoolLegacyClaimRequestForTests | BscTestnetPtaWbnbPoolRecoveryClaimRequest;
type LegacyClaimBody = Omit<
  BscTestnetPtaWbnbPoolLegacyClaimRequestForTests,
  "authorizationReceiptSha256"
>;
type RecoveryClaimBody = Omit<
  BscTestnetPtaWbnbPoolRecoveryClaimRequest,
  "authorizationReceiptSha256"
>;
type AnyClaimBody = LegacyClaimBody | RecoveryClaimBody;

function isRecoveryClaim(
  request: AnyClaimRequest | AnyClaimBody
): request is BscTestnetPtaWbnbPoolRecoveryClaimRequest | RecoveryClaimBody {
  return (
    "generation" in request &&
    (request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2 ||
      request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3 ||
      request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4 ||
      request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5 ||
      request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6 ||
      request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7 ||
      request.generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION ||
      request.generation === BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION)
  );
}

function predecessorStateFor(generation: Exclude<JournalGeneration, 1>) {
  return generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5 ||
    generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6 ||
    generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7 ||
    generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION ||
    generation === BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
    ? BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE
    : HISTORICAL_PREDECESSOR_STATE;
}

function usesTerminalPredecessor(
  generation: Exclude<JournalGeneration, 1>
): generation is
  | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
  | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
  | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
  | typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
  | typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION {
  return (
    generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5 ||
    generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6 ||
    generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7 ||
    generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION ||
    generation === BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
  );
}

function expectedPredecessorTerminalRawSha256(
  generation:
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
    | typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
    | typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
): Hex {
  return generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
    ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256
    : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
      ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256
      : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
        ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256
        : generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
          ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256
          : BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256;
}

function predecessorAttemptId(
  generation:
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
    | typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
    | typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
): Hex {
  return generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
    ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ATTEMPT_ID
    : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
      ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_ATTEMPT_ID
      : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
        ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_ATTEMPT_ID
        : generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
          ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_ATTEMPT_ID
          : BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ATTEMPT_ID;
}

interface JournalBinding {
  readonly claimId: string;
  readonly operationKey: Hex;
  readonly envelopeHash: Hex;
  readonly authorizationReceiptSha256: Hex;
  readonly signingHash: Hex;
  readonly serializedUnsignedSha256: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly generation?:
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
    | typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
    | typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
    | typeof BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION;
  readonly predecessorState?:
    typeof HISTORICAL_PREDECESSOR_STATE | typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE;
  readonly predecessorFenceSha256?: Hex;
  readonly predecessorTerminalRawSha256?: Hex;
  readonly attemptId?: Hex;
}

export interface BscTestnetPtaWbnbPoolWorkerAuthorizationRequest extends JournalBinding {
  readonly workerRequestHash: Hex;
  readonly authorizationTokenDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolWorkerStartRequest extends JournalBinding {
  readonly workerRequestHash: Hex;
  readonly authorizationToken: Hex;
}

interface ValidatedWorkerSignedCommit extends JournalBinding {
  readonly workerRequestHash: Hex;
  readonly serializedTransaction: Hex;
  readonly transactionHash: Hex;
  readonly recoveredSigner: Address;
}

interface RetainedTransactionBinding extends JournalBinding {
  readonly serializedTransaction: Hex;
  readonly transactionHash: Hex;
}

export interface BscTestnetPtaWbnbPoolTerminalRequest extends JournalBinding {
  readonly outcomeDigest: Hex;
  readonly serializedTransaction?: Hex;
  readonly transactionHash?: Hex;
}

export type BscTestnetPtaWbnbPoolFailedBeforeWorkerIssueCode =
  | "POST_CLAIM_RECHECK_REJECTED"
  | "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN"
  | "EXECUTION_AUTHORITY_EXPIRED"
  | BscTestnetPtaWbnbPoolPostClaimRecheckIssueCode;

export interface BscTestnetPtaWbnbPoolFailedBeforeWorkerRequest extends JournalBinding {
  readonly phase: "post_claim_recheck";
  readonly issueCode: BscTestnetPtaWbnbPoolFailedBeforeWorkerIssueCode;
  readonly outcomeDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolNoEffectProof {
  readonly schemaVersion: 1;
  readonly kind: "exact_fixed_dual_rpc_no_onchain_effect_after_claim_v1";
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly envelopeHash: Hex;
  readonly observedAt: string;
  readonly finalizedBlockNumber: string;
  readonly finalizedBlockHash: Hex;
  readonly finalizedBlockTimestamp: string;
  readonly latestNonce: "1";
  readonly pendingNonce: "1";
  readonly pendingPool: "0x0000000000000000000000000000000000000000";
  readonly candidateCode: "0x";
  readonly candidateNonce: "0";
  readonly providerAgreementVerified: true;
  readonly allRuntimeIdentitiesVerified: true;
  readonly allEip1967SlotsZero: true;
  readonly allProtocolBindingsVerified: true;
  readonly feeTierVerified: true;
  readonly simulationReturnPool: typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE;
  readonly submissionJournalPresence: "absent";
}

export interface BscTestnetPtaWbnbPoolClaimOnlyRecoveryCandidate extends JournalBinding {
  readonly status: "claimed";
  readonly predecessorClaimRawSha256: Hex;
  readonly predecessorClaimRecordedAt: string;
  readonly predecessorAuthorizationExpiresAt: string;
}

export interface BscTestnetPtaWbnbPoolSupersessionFenceState {
  readonly status: "superseded_before_worker";
  readonly terminalCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN";
  readonly workerAuthorizationOutcome: "not_attempted";
  readonly workerStartOutcome: "not_attempted";
  readonly signatureOutcome: "not_attempted";
  readonly submissionOutcome: "not_attempted";
  readonly submissionJournalState: "exact_empty";
  readonly predecessorClaimRawSha256: Hex;
  readonly noEffectProofDigest: Hex;
  readonly noEffectEnvelopeHash: Hex;
  readonly noEffectObservedAt: string;
  readonly fenceRecordedAt: string;
  readonly predecessorFenceSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolPredecessorTerminalState {
  readonly status: "failed_before_worker";
  readonly generation: typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION;
  readonly predecessorClaimRawSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256;
  readonly predecessorTerminalRawSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256;
  readonly predecessorEnvelopeHash: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ENVELOPE_HASH;
  readonly inheritedPredecessorTerminalRawSha256: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256;
  readonly predecessorAttemptId: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ATTEMPT_ID;
  readonly phase: "post_claim_recheck";
  readonly issueCode: "GAS_POLICY_VIOLATION";
  readonly outcomeDigest: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_FAILED_BEFORE_WORKER_OUTCOME_DIGEST;
  readonly workerAuthorizationOutcome: "not_attempted";
  readonly workerStartOutcome: "not_attempted";
  readonly signatureOutcome: "not_attempted";
  readonly recordedAt: string;
}

export interface BscTestnetPtaWbnbPoolFenceClaimBeforeWorkerRequest {
  readonly expectedPredecessorClaimRawSha256: Hex;
  readonly proof: BscTestnetPtaWbnbPoolNoEffectProof;
}

export type BscTestnetPtaWbnbPoolLocalJournalStatus =
  | "empty"
  | "claimed"
  | "worker_authorized"
  | "worker_started"
  | "signed_committed"
  | "superseded_before_worker"
  | "failed_before_worker"
  | "failed_before_submission"
  | "unknown_outcome";

export interface BscTestnetPtaWbnbPoolLocalJournalState {
  readonly status: BscTestnetPtaWbnbPoolLocalJournalStatus;
  readonly claimId: string | null;
  readonly operationKey: Hex | null;
  readonly envelopeHash: Hex | null;
  readonly authorizationReceiptSha256: Hex | null;
  readonly signingHash: Hex | null;
  readonly serializedUnsignedSha256: Hex | null;
  readonly reviewerApprovalDigest: Hex | null;
  readonly ownerAuthorizationDigest: Hex | null;
  readonly releaseCommit: string | null;
  readonly runtimeManifestSha256: Hex | null;
  readonly generation: JournalGeneration | null;
  readonly predecessorState:
    typeof HISTORICAL_PREDECESSOR_STATE | typeof BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE | null;
  readonly predecessorFenceSha256: Hex | null;
  readonly predecessorTerminalRawSha256: Hex | null;
  readonly attemptId: Hex | null;
  readonly gasLimit: string | null;
  readonly gasPriceWei: string | null;
  readonly maxCostWei: string | null;
  readonly authorizedAt: string | null;
  readonly expiresAt: string | null;
  readonly serializedTransaction: Hex | null;
  readonly transactionHash: Hex | null;
  readonly supersessionFence: BscTestnetPtaWbnbPoolSupersessionFenceState | null;
}

export interface BscTestnetPtaWbnbPoolLocalJournal {
  readonly claimExactInitialization: (
    request: BscTestnetPtaWbnbPoolGeneration9ClaimRequest
  ) => Promise<
    | Readonly<{ status: "claimed"; claimId: string }>
    | Readonly<{
        status: "already_claimed";
        claimId: string;
        state: Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty">;
      }>
  >;
  readonly authorizeWorker: (
    request: BscTestnetPtaWbnbPoolWorkerAuthorizationRequest
  ) => Promise<Readonly<{ status: "worker_authorized" }>>;
  readonly failBeforeWorker: (
    request: BscTestnetPtaWbnbPoolFailedBeforeWorkerRequest
  ) => Promise<Readonly<{ status: "failed_before_worker" }>>;
  readonly startWorker: (
    request: BscTestnetPtaWbnbPoolWorkerStartRequest
  ) => Promise<Readonly<{ status: "worker_started" }>>;
  /** Worker-only fixed request seam; must complete before any custody access. */
  readonly consumeWorkerAuthorization: (
    workerRequest: BscTestnetPtaWbnbPoolSigningWorkerRequest
  ) => Promise<Readonly<{ status: "worker_started" }>>;
  /** The only signed-byte commit seam; it revalidates the exact worker request and response. */
  readonly commitWorkerSignedTransaction: (
    workerRequest: BscTestnetPtaWbnbPoolSigningWorkerRequest,
    workerResponse: BscTestnetPtaWbnbPoolSigningWorkerResponse
  ) => Promise<Readonly<{ status: "signed_committed" }>>;
  readonly failBeforeSubmission: (
    request: BscTestnetPtaWbnbPoolTerminalRequest
  ) => Promise<Readonly<{ status: "failed_before_submission" }>>;
  readonly recordUnknownOutcome: (
    request: BscTestnetPtaWbnbPoolTerminalRequest
  ) => Promise<Readonly<{ status: "unknown_outcome" }>>;
  readonly readState: () => Promise<BscTestnetPtaWbnbPoolLocalJournalState>;
}

/** Read-only active-generation recovery view; it deliberately exposes no mutation method. */
export interface BscTestnetPtaWbnbPoolLocalJournalRecoveryReader {
  readonly readState: () => Promise<BscTestnetPtaWbnbPoolLocalJournalState>;
  readonly readStrictRecoveryState: () => Promise<BscTestnetPtaWbnbPoolLocalJournalState | null>;
}

export interface BscTestnetPtaWbnbPoolLegacyLocalJournalRecoveryReader {
  readonly readClaimOnlyRecoveryCandidate: () => Promise<BscTestnetPtaWbnbPoolClaimOnlyRecoveryCandidate | null>;
  readonly fenceClaimBeforeWorker: (
    request: BscTestnetPtaWbnbPoolFenceClaimBeforeWorkerRequest
  ) => Promise<BscTestnetPtaWbnbPoolSupersessionFenceState>;
  readonly readState: () => Promise<BscTestnetPtaWbnbPoolLocalJournalState>;
  readonly readStrictRecoveryState: () => Promise<BscTestnetPtaWbnbPoolLocalJournalState | null>;
}

export interface BscTestnetPtaWbnbPoolPredecessorLocalJournalRecoveryReader {
  readonly readState: () => Promise<BscTestnetPtaWbnbPoolLocalJournalState>;
  readonly readStrictRecoveryState: () => Promise<BscTestnetPtaWbnbPoolLocalJournalState | null>;
  readonly readExactTerminalRecoveryBinding: () => Promise<BscTestnetPtaWbnbPoolPredecessorTerminalState | null>;
}

interface BscTestnetPtaWbnbPoolLocalJournalCore
  extends
    BscTestnetPtaWbnbPoolLocalJournal,
    BscTestnetPtaWbnbPoolLocalJournalRecoveryReader,
    BscTestnetPtaWbnbPoolLegacyLocalJournalRecoveryReader {
  readonly claimExactInitialization: (
    request: AnyClaimRequest
  ) => ReturnType<BscTestnetPtaWbnbPoolLocalJournal["claimExactInitialization"]>;
  readonly readExactTerminalRecoveryBinding: () => Promise<BscTestnetPtaWbnbPoolPredecessorTerminalState | null>;
}

export type BscTestnetPtaWbnbPoolLocalJournalRecoveryProbeResult =
  | Readonly<{
      status: "ready";
      presence: "absent" | "present";
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      presence: "unknown";
      state: null;
      issue: Readonly<{ code: "RECOVERY_JOURNAL_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolGeneration9RecordHashProbeResult =
  | Readonly<{
      status: "ready";
      records: readonly Readonly<{ name: string; byteLength: number; sha256: Hex }>[];
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      records: null;
      issue: Readonly<{ code: "GENERATION_9_RECORD_HASHES_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolExistingLocalJournalResult =
  | Readonly<{
      status: "absent";
      journal: null;
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>
  | Readonly<{
      status: "opened";
      journal: BscTestnetPtaWbnbPoolLocalJournalRecoveryReader;
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      journal: null;
      state: null;
      issue: Readonly<{ code: "RECOVERY_JOURNAL_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult =
  | Readonly<{
      status: "absent";
      journal: null;
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>
  | Readonly<{
      status: "opened";
      journal: BscTestnetPtaWbnbPoolLegacyLocalJournalRecoveryReader;
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      journal: null;
      state: null;
      issue: Readonly<{ code: "RECOVERY_JOURNAL_INVALID"; message: string }>;
    }>;

export type BscTestnetPtaWbnbPoolExistingPredecessorLocalJournalResult =
  | Exclude<BscTestnetPtaWbnbPoolExistingLocalJournalResult, Readonly<{ status: "opened" }>>
  | Readonly<{
      status: "opened";
      journal: BscTestnetPtaWbnbPoolPredecessorLocalJournalRecoveryReader;
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>;

export interface BscTestnetPtaWbnbPoolJournalSecurityMetadata {
  readonly verified: true;
  readonly ownerSid: string;
  readonly accessRulesProtected: true;
  readonly currentUserOnlyFullControl: true;
  readonly checkedPaths: number;
}

export interface BscTestnetPtaWbnbPoolLocalJournalPorts {
  readonly now: () => Date;
  readonly listNames: () => Promise<readonly string[]>;
  readonly readBounded: (name: string) => Promise<string | null>;
  readonly createExclusive: (name: string, content: string) => Promise<"created" | "exists">;
  /** Legacy slot-2 only: the adapter reserves O_EXCL before invoking the synchronous factory. */
  readonly createExclusiveFenceFromFactory: (
    name: string,
    contentFactory: () => string
  ) => Promise<"created" | "exists">;
  readonly assertSecure: (
    existingFiles: readonly string[]
  ) => Promise<BscTestnetPtaWbnbPoolJournalSecurityMetadata>;
}

type DataRecord = Readonly<Record<string, unknown>>;
type RecordKind =
  | "claim"
  | "worker_authorized"
  | "worker_started"
  | "signed_committed"
  | "superseded_before_worker"
  | "failed_before_worker"
  | "failed_before_submission"
  | "unknown_outcome";

interface ParsedRecord extends JournalBinding {
  readonly schemaVersion:
    | typeof LEGACY_SCHEMA_VERSION
    | typeof GENERATION_2_SCHEMA_VERSION
    | typeof GENERATION_3_SCHEMA_VERSION
    | typeof GENERATION_4_SCHEMA_VERSION
    | typeof GENERATION_5_SCHEMA_VERSION
    | typeof GENERATION_6_SCHEMA_VERSION
    | typeof GENERATION_7_SCHEMA_VERSION
    | typeof PREDECESSOR_SCHEMA_VERSION
    | typeof ACTIVE_SCHEMA_VERSION;
  readonly kind: RecordKind;
  readonly recordedAt: string;
  readonly claim?: AnyClaimRequest;
  readonly workerRequestHash?: Hex;
  readonly authorizationTokenDigest?: Hex;
  readonly serializedTransaction?: Hex;
  readonly transactionHash?: Hex;
  readonly recoveredSigner?: Address;
  readonly outcomeDigest?: Hex;
  readonly phase?: "post_claim_recheck";
  readonly issueCode?: BscTestnetPtaWbnbPoolFailedBeforeWorkerIssueCode;
  readonly supersessionFence?: BscTestnetPtaWbnbPoolSupersessionFenceState;
}

function dataRecord(input: unknown): DataRecord | null {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input) || isProxy(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) return null;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys as string[]) {
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
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch {
    return null;
  }
}

function exactKeys(record: DataRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalDate(value: unknown): string | null {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? value
    : null;
}

function captureNow(now: () => Date): string | null {
  try {
    const value = Reflect.apply(now, undefined, []);
    if (
      isProxy(value) ||
      !(value instanceof Date) ||
      Object.getPrototypeOf(value) !== Date.prototype ||
      Reflect.ownKeys(value).length !== 0
    ) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
  } catch {
    return null;
  }
}

function exactBytes32(value: unknown): value is Hex {
  return typeof value === "string" && BYTES32.test(value) && value !== ZERO_BYTES32;
}

function canonicalPositiveUint(value: unknown, maximum: bigint): bigint | null {
  if (typeof value !== "string" || !CANONICAL_UINT.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed > 0n && parsed <= maximum ? parsed : null;
  } catch {
    return null;
  }
}

function sha256Hex(value: string): Hex {
  return `0x${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function sha256HexBytes(value: Hex): Hex {
  return `0x${createHash("sha256")
    .update(Buffer.from(value.slice(2), "hex"))
    .digest("hex")}`;
}

const NO_EFFECT_PROOF_KEYS = [
  "schemaVersion",
  "kind",
  "operationKey",
  "envelopeHash",
  "observedAt",
  "finalizedBlockNumber",
  "finalizedBlockHash",
  "finalizedBlockTimestamp",
  "latestNonce",
  "pendingNonce",
  "pendingPool",
  "candidateCode",
  "candidateNonce",
  "providerAgreementVerified",
  "allRuntimeIdentitiesVerified",
  "allEip1967SlotsZero",
  "allProtocolBindingsVerified",
  "feeTierVerified",
  "simulationReturnPool",
  "submissionJournalPresence"
] as const;

function inspectNoEffectProof(input: unknown): BscTestnetPtaWbnbPoolNoEffectProof | null {
  const record = dataRecord(input);
  const observedAt = record === null ? null : canonicalDate(record.observedAt);
  const finalizedBlockNumber =
    record === null ? null : canonicalPositiveUint(record.finalizedBlockNumber, UINT64_MAX);
  const finalizedBlockTimestamp =
    record === null ? null : canonicalPositiveUint(record.finalizedBlockTimestamp, UINT64_MAX);
  if (
    record === null ||
    !Object.isFrozen(input) ||
    !exactKeys(record, NO_EFFECT_PROOF_KEYS) ||
    record.schemaVersion !== 1 ||
    record.kind !== "exact_fixed_dual_rpc_no_onchain_effect_after_claim_v1" ||
    record.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    !exactBytes32(record.envelopeHash) ||
    observedAt === null ||
    finalizedBlockNumber === null ||
    !exactBytes32(record.finalizedBlockHash) ||
    finalizedBlockTimestamp === null ||
    finalizedBlockTimestamp * 1_000n > BigInt(Date.parse(observedAt)) ||
    record.latestNonce !== "1" ||
    record.pendingNonce !== "1" ||
    record.pendingPool !== "0x0000000000000000000000000000000000000000" ||
    record.candidateCode !== "0x" ||
    record.candidateNonce !== "0" ||
    record.providerAgreementVerified !== true ||
    record.allRuntimeIdentitiesVerified !== true ||
    record.allEip1967SlotsZero !== true ||
    record.allProtocolBindingsVerified !== true ||
    record.feeTierVerified !== true ||
    record.simulationReturnPool !== BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE ||
    record.submissionJournalPresence !== "absent"
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: "exact_fixed_dual_rpc_no_onchain_effect_after_claim_v1" as const,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: record.envelopeHash,
    observedAt,
    finalizedBlockNumber: finalizedBlockNumber.toString(),
    finalizedBlockHash: record.finalizedBlockHash,
    finalizedBlockTimestamp: finalizedBlockTimestamp.toString(),
    latestNonce: "1" as const,
    pendingNonce: "1" as const,
    pendingPool: "0x0000000000000000000000000000000000000000" as const,
    candidateCode: "0x" as const,
    candidateNonce: "0" as const,
    providerAgreementVerified: true as const,
    allRuntimeIdentitiesVerified: true as const,
    allEip1967SlotsZero: true as const,
    allProtocolBindingsVerified: true as const,
    feeTierVerified: true as const,
    simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
    submissionJournalPresence: "absent" as const
  });
}

export function deriveBscTestnetPtaWbnbPoolNoEffectProofDigest(input: unknown): Hex | null {
  const proof = inspectNoEffectProof(input);
  return proof === null
    ? null
    : sha256Hex(
        `${BSC_TESTNET_PTA_WBNB_POOL_NO_EFFECT_PROOF_DIGEST_DOMAIN}\u0000${JSON.stringify(proof)}`
      );
}

function inspectFailedBeforeWorkerIssueCode(
  input: unknown
): BscTestnetPtaWbnbPoolFailedBeforeWorkerIssueCode | null {
  if (
    input === "POST_CLAIM_RECHECK_REJECTED" ||
    input === "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" ||
    input === "EXECUTION_AUTHORITY_EXPIRED"
  ) {
    return input;
  }
  return typeof input === "string" &&
    BSC_TESTNET_PTA_WBNB_POOL_POST_CLAIM_RECHECK_ISSUE_CODES.some((code) => code === input)
    ? (input as BscTestnetPtaWbnbPoolPostClaimRecheckIssueCode)
    : null;
}

export function deriveBscTestnetPtaWbnbPoolFailedBeforeWorkerOutcomeDigest(
  input: unknown
): Hex | null {
  const record = dataRecord(input);
  const issueCode = record === null ? null : inspectFailedBeforeWorkerIssueCode(record.issueCode);
  return record !== null &&
    exactKeys(record, ["phase", "issueCode", "evidenceDigest"]) &&
    record.phase === "post_claim_recheck" &&
    issueCode !== null &&
    exactBytes32(record.evidenceDigest)
    ? sha256Hex(
        `${BSC_TESTNET_PTA_WBNB_POOL_FAILED_BEFORE_WORKER_DIGEST_DOMAIN}\u0000${JSON.stringify({
          phase: record.phase,
          issueCode,
          evidenceDigest: record.evidenceDigest
        })}`
      )
    : null;
}

function supersessionFenceDigestBody(
  input: Readonly<{
    binding: JournalBinding;
    predecessorClaimRawSha256: Hex;
    noEffectProofDigest: Hex;
    noEffectEnvelopeHash: Hex;
    noEffectObservedAt: string;
    recordedAt: string;
  }>
) {
  const commonBinding = {
    claimId: input.binding.claimId,
    operationKey: input.binding.operationKey,
    envelopeHash: input.binding.envelopeHash,
    authorizationReceiptSha256: input.binding.authorizationReceiptSha256,
    signingHash: input.binding.signingHash,
    serializedUnsignedSha256: input.binding.serializedUnsignedSha256,
    reviewerApprovalDigest: input.binding.reviewerApprovalDigest,
    ownerAuthorizationDigest: input.binding.ownerAuthorizationDigest,
    releaseCommit: input.binding.releaseCommit,
    runtimeManifestSha256: input.binding.runtimeManifestSha256
  };
  const fenceBinding =
    input.binding.generation !== undefined
      ? {
          ...commonBinding,
          generation: input.binding.generation,
          predecessorState: input.binding.predecessorState,
          ancestorFenceSha256: input.binding.predecessorFenceSha256,
          attemptId: input.binding.attemptId
        }
      : commonBinding;
  const predecessorClaimBinding =
    input.binding.generation !== undefined
      ? { predecessorClaimRawSha256: input.predecessorClaimRawSha256 }
      : { legacyClaimRawSha256: input.predecessorClaimRawSha256 };
  return {
    schemaVersion:
      input.binding.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
        ? GENERATION_2_SUPERSESSION_FENCE_SCHEMA_VERSION
        : input.binding.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
          ? SUPERSESSION_FENCE_SCHEMA_VERSION
          : LEGACY_SUPERSESSION_FENCE_SCHEMA_VERSION,
    kind: "superseded_before_worker",
    ...fenceBinding,
    terminalCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN",
    workerAuthorizationOutcome: "not_attempted",
    workerStartOutcome: "not_attempted",
    signatureOutcome: "not_attempted",
    submissionOutcome: "not_attempted",
    submissionJournalState: "exact_empty",
    ...predecessorClaimBinding,
    noEffectProofDigest: input.noEffectProofDigest,
    noEffectEnvelopeHash: input.noEffectEnvelopeHash,
    noEffectObservedAt: input.noEffectObservedAt,
    recordedAt: input.recordedAt
  };
}

function deriveSupersessionFenceSha256(input: Parameters<typeof supersessionFenceDigestBody>[0]) {
  return sha256Hex(
    `${
      input.binding.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
        ? BSC_TESTNET_PTA_WBNB_POOL_SUPERSESSION_FENCE_DIGEST_DOMAIN
        : input.binding.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
          ? GENERATION_2_SUPERSESSION_FENCE_DIGEST_DOMAIN
          : LEGACY_SUPERSESSION_FENCE_DIGEST_DOMAIN
    }\u0000${JSON.stringify(supersessionFenceDigestBody(input))}`
  );
}

function receiptBody(request: AnyClaimBody) {
  const common = {
    operationKey: request.operationKey,
    envelopeHash: request.envelopeHash,
    signingHash: request.signingHash,
    serializedUnsignedSha256: request.serializedUnsignedSha256,
    gasLimit: request.gasLimit,
    gasPriceWei: request.gasPriceWei,
    maxCostWei: request.maxCostWei,
    reviewerApprovalDigest: request.reviewerApprovalDigest,
    ownerAuthorizationDigest: request.ownerAuthorizationDigest,
    releaseCommit: request.releaseCommit,
    runtimeManifestSha256: request.runtimeManifestSha256,
    authorizedAt: request.authorizedAt,
    expiresAt: request.expiresAt
  };
  return isRecoveryClaim(request)
    ? {
        schemaVersion: request.generation,
        kind:
          request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
            ? GENERATION_2_AUTHORIZATION_KIND
            : request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
              ? GENERATION_3_AUTHORIZATION_KIND
              : request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4
                ? GENERATION_4_AUTHORIZATION_KIND
                : request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
                  ? GENERATION_5_AUTHORIZATION_KIND
                  : request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
                    ? GENERATION_6_AUTHORIZATION_KIND
                    : request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
                      ? GENERATION_7_AUTHORIZATION_KIND
                      : request.generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
                        ? PREDECESSOR_AUTHORIZATION_KIND
                        : ACTIVE_AUTHORIZATION_KIND,
        ...common,
        generation: request.generation,
        predecessorState: request.predecessorState,
        ...(usesTerminalPredecessor(request.generation)
          ? { predecessorTerminalRawSha256: request.predecessorTerminalRawSha256 }
          : { predecessorFenceSha256: request.predecessorFenceSha256 }),
        attemptId: request.attemptId
      }
    : { kind: LEGACY_AUTHORIZATION_KIND, ...common };
}

/** Deterministic integrity digest only; callers must authenticate both capability digests elsewhere. */
export function deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256(request: AnyClaimBody): Hex {
  const body = receiptBody(request);
  return isRecoveryClaim(request)
    ? sha256Hex(
        `${
          request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
            ? GENERATION_2_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN
            : request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
              ? GENERATION_3_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN
              : request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4
                ? GENERATION_4_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN
                : request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
                  ? GENERATION_5_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN
                  : request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
                    ? GENERATION_6_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN
                    : request.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
                      ? GENERATION_7_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN
                      : request.generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
                        ? PREDECESSOR_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN
                        : BSC_TESTNET_PTA_WBNB_POOL_ACTIVE_AUTHORIZATION_RECEIPT_DIGEST_DOMAIN
        }\u0000${JSON.stringify(body)}`
      )
    : sha256Hex(JSON.stringify(body));
}

function inspectClaimRequest(
  input: unknown,
  now: string | null,
  generation: JournalGeneration
): AnyClaimRequest | null {
  const record = dataRecord(input);
  const expected = [
    "operationKey",
    "envelopeHash",
    "signingHash",
    "serializedUnsignedSha256",
    "gasLimit",
    "gasPriceWei",
    "maxCostWei",
    "reviewerApprovalDigest",
    "ownerAuthorizationDigest",
    "releaseCommit",
    "runtimeManifestSha256",
    "authorizedAt",
    "expiresAt",
    "authorizationReceiptSha256",
    ...(generation !== 1 ? recoveryBindingKeysFor(generation) : [])
  ];
  if (record === null || !exactKeys(record, expected)) return null;
  const gasLimit = canonicalPositiveUint(record.gasLimit, BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT);
  const gasPrice = canonicalPositiveUint(
    record.gasPriceWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI
  );
  const maxCost = canonicalPositiveUint(
    record.maxCostWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI
  );
  const authorizedAt = canonicalDate(record.authorizedAt);
  const expiresAt = canonicalDate(record.expiresAt);
  const nowMilliseconds = now === null ? null : Date.parse(now);
  const authorizedMilliseconds = authorizedAt === null ? Number.NaN : Date.parse(authorizedAt);
  const expiresMilliseconds = expiresAt === null ? Number.NaN : Date.parse(expiresAt);
  if (
    record.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    !exactBytes32(record.envelopeHash) ||
    !exactBytes32(record.signingHash) ||
    !exactBytes32(record.serializedUnsignedSha256) ||
    !exactBytes32(record.reviewerApprovalDigest) ||
    !exactBytes32(record.ownerAuthorizationDigest) ||
    record.reviewerApprovalDigest === record.ownerAuthorizationDigest ||
    typeof record.releaseCommit !== "string" ||
    !RELEASE_COMMIT.test(record.releaseCommit) ||
    !exactBytes32(record.runtimeManifestSha256) ||
    !exactBytes32(record.authorizationReceiptSha256) ||
    (generation !== 1 &&
      (record.generation !== generation ||
        record.predecessorState !== predecessorStateFor(generation) ||
        !(usesTerminalPredecessor(generation)
          ? exactBytes32(record.predecessorTerminalRawSha256)
          : exactBytes32(record.predecessorFenceSha256)) ||
        !exactBytes32(record.attemptId) ||
        (usesTerminalPredecessor(generation) &&
          (record.predecessorTerminalRawSha256 !==
            expectedPredecessorTerminalRawSha256(generation) ||
            record.attemptId === predecessorAttemptId(generation))))) ||
    gasLimit === null ||
    gasPrice === null ||
    maxCost === null ||
    maxCost !== gasLimit * gasPrice ||
    authorizedAt === null ||
    expiresAt === null ||
    (nowMilliseconds !== null && authorizedMilliseconds > nowMilliseconds) ||
    (nowMilliseconds !== null && expiresMilliseconds <= nowMilliseconds) ||
    expiresMilliseconds <= authorizedMilliseconds ||
    expiresMilliseconds - authorizedMilliseconds > MAXIMUM_AUTHORIZATION_LIFETIME_MILLISECONDS
  ) {
    return null;
  }
  const inspected = Object.freeze({
    operationKey: record.operationKey,
    envelopeHash: record.envelopeHash,
    signingHash: record.signingHash,
    serializedUnsignedSha256: record.serializedUnsignedSha256,
    gasLimit: record.gasLimit as string,
    gasPriceWei: record.gasPriceWei as string,
    maxCostWei: record.maxCostWei as string,
    reviewerApprovalDigest: record.reviewerApprovalDigest,
    ownerAuthorizationDigest: record.ownerAuthorizationDigest,
    releaseCommit: record.releaseCommit,
    runtimeManifestSha256: record.runtimeManifestSha256,
    authorizedAt,
    expiresAt,
    authorizationReceiptSha256: record.authorizationReceiptSha256,
    ...(generation !== 1
      ? {
          generation,
          predecessorState: predecessorStateFor(generation),
          ...(usesTerminalPredecessor(generation)
            ? { predecessorTerminalRawSha256: record.predecessorTerminalRawSha256 as Hex }
            : { predecessorFenceSha256: record.predecessorFenceSha256 as Hex }),
          attemptId: record.attemptId as Hex
        }
      : {})
  }) satisfies AnyClaimRequest;
  return deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256(inspected) ===
    inspected.authorizationReceiptSha256
    ? inspected
    : null;
}

function claimIdFor(request: AnyClaimRequest, generation: JournalGeneration): string {
  if (generation === 1 || !isRecoveryClaim(request)) {
    return `pta-wbnb-pool-${request.operationKey.slice(2, 34)}`;
  }
  const digest = sha256Hex(
    `${
      generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
        ? GENERATION_2_CLAIM_ID_DIGEST_DOMAIN
        : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
          ? GENERATION_3_CLAIM_ID_DIGEST_DOMAIN
          : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4
            ? GENERATION_4_CLAIM_ID_DIGEST_DOMAIN
            : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
              ? GENERATION_5_CLAIM_ID_DIGEST_DOMAIN
              : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
                ? GENERATION_6_CLAIM_ID_DIGEST_DOMAIN
                : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
                  ? GENERATION_7_CLAIM_ID_DIGEST_DOMAIN
                  : generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
                    ? PREDECESSOR_CLAIM_ID_DIGEST_DOMAIN
                    : BSC_TESTNET_PTA_WBNB_POOL_ACTIVE_CLAIM_ID_DIGEST_DOMAIN
    }\u0000${JSON.stringify({
      operationKey: request.operationKey,
      generation,
      predecessorState: request.predecessorState,
      ...(usesTerminalPredecessor(generation)
        ? { predecessorTerminalRawSha256: request.predecessorTerminalRawSha256 }
        : { predecessorFenceSha256: request.predecessorFenceSha256 }),
      attemptId: request.attemptId
    })}`
  );
  return `pta-wbnb-pool-v${generation}-${digest.slice(2, 34)}`;
}

function bindingFromClaim(request: AnyClaimRequest, generation: JournalGeneration): JournalBinding {
  const base = {
    claimId: claimIdFor(request, generation),
    operationKey: request.operationKey,
    envelopeHash: request.envelopeHash,
    authorizationReceiptSha256: request.authorizationReceiptSha256,
    signingHash: request.signingHash,
    serializedUnsignedSha256: request.serializedUnsignedSha256,
    reviewerApprovalDigest: request.reviewerApprovalDigest,
    ownerAuthorizationDigest: request.ownerAuthorizationDigest,
    releaseCommit: request.releaseCommit,
    runtimeManifestSha256: request.runtimeManifestSha256
  } as const;
  if (generation === 1 || !isRecoveryClaim(request)) return Object.freeze(base);
  if (
    usesTerminalPredecessor(generation) &&
    request.generation === generation &&
    request.predecessorTerminalRawSha256 !== undefined
  ) {
    return Object.freeze({
      ...base,
      generation,
      predecessorState: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_STATE,
      predecessorTerminalRawSha256: request.predecessorTerminalRawSha256,
      attemptId: request.attemptId
    });
  }
  if (
    !usesTerminalPredecessor(generation) &&
    request.generation === generation &&
    request.predecessorFenceSha256 !== undefined
  ) {
    return Object.freeze({
      ...base,
      generation,
      predecessorState: HISTORICAL_PREDECESSOR_STATE,
      predecessorFenceSha256: request.predecessorFenceSha256,
      attemptId: request.attemptId
    });
  }
  throw new Error("PTA_WBNB_POOL_JOURNAL_GENERATION_BINDING_MISMATCH");
}

function recoveryBindingKeysFor(generation: Exclude<JournalGeneration, 1>): readonly string[] {
  return usesTerminalPredecessor(generation)
    ? ["generation", "predecessorState", "predecessorTerminalRawSha256", "attemptId"]
    : ["generation", "predecessorState", "predecessorFenceSha256", "attemptId"];
}

function inspectBinding(
  input: unknown,
  extras: readonly string[],
  generation: JournalGeneration
): DataRecord | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !exactKeys(record, [
      "claimId",
      "operationKey",
      "envelopeHash",
      "authorizationReceiptSha256",
      "signingHash",
      "serializedUnsignedSha256",
      "reviewerApprovalDigest",
      "ownerAuthorizationDigest",
      "releaseCommit",
      "runtimeManifestSha256",
      ...(generation !== 1 ? recoveryBindingKeysFor(generation) : []),
      ...extras
    ]) ||
    typeof record.claimId !== "string" ||
    !(
      generation === 1
        ? /^pta-wbnb-pool-[0-9a-f]{32}$/u
        : new RegExp(`^pta-wbnb-pool-v${generation}-[0-9a-f]{32}$`, "u")
    ).test(record.claimId) ||
    record.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    !exactBytes32(record.envelopeHash) ||
    !exactBytes32(record.authorizationReceiptSha256) ||
    !exactBytes32(record.signingHash) ||
    !exactBytes32(record.serializedUnsignedSha256) ||
    !exactBytes32(record.reviewerApprovalDigest) ||
    !exactBytes32(record.ownerAuthorizationDigest) ||
    record.reviewerApprovalDigest === record.ownerAuthorizationDigest ||
    typeof record.releaseCommit !== "string" ||
    !RELEASE_COMMIT.test(record.releaseCommit) ||
    !exactBytes32(record.runtimeManifestSha256) ||
    (generation !== 1 &&
      (record.generation !== generation ||
        record.predecessorState !== predecessorStateFor(generation) ||
        !(usesTerminalPredecessor(generation)
          ? exactBytes32(record.predecessorTerminalRawSha256)
          : exactBytes32(record.predecessorFenceSha256)) ||
        !exactBytes32(record.attemptId) ||
        (usesTerminalPredecessor(generation) &&
          (record.predecessorTerminalRawSha256 !==
            expectedPredecessorTerminalRawSha256(generation) ||
            record.attemptId === predecessorAttemptId(generation)))))
  ) {
    return null;
  }
  return record;
}

function sameBinding(left: JournalBinding, right: JournalBinding): boolean {
  return (
    left.claimId === right.claimId &&
    left.operationKey === right.operationKey &&
    left.envelopeHash === right.envelopeHash &&
    left.authorizationReceiptSha256 === right.authorizationReceiptSha256 &&
    left.signingHash === right.signingHash &&
    left.serializedUnsignedSha256 === right.serializedUnsignedSha256 &&
    left.reviewerApprovalDigest === right.reviewerApprovalDigest &&
    left.ownerAuthorizationDigest === right.ownerAuthorizationDigest &&
    left.releaseCommit === right.releaseCommit &&
    left.runtimeManifestSha256 === right.runtimeManifestSha256 &&
    left.generation === right.generation &&
    left.predecessorState === right.predecessorState &&
    left.predecessorFenceSha256 === right.predecessorFenceSha256 &&
    left.predecessorTerminalRawSha256 === right.predecessorTerminalRawSha256 &&
    left.attemptId === right.attemptId
  );
}

function bindingOf(record: DataRecord | JournalBinding): JournalBinding {
  return Object.freeze({
    claimId: record.claimId as string,
    operationKey: record.operationKey as Hex,
    envelopeHash: record.envelopeHash as Hex,
    authorizationReceiptSha256: record.authorizationReceiptSha256 as Hex,
    signingHash: record.signingHash as Hex,
    serializedUnsignedSha256: record.serializedUnsignedSha256 as Hex,
    reviewerApprovalDigest: record.reviewerApprovalDigest as Hex,
    ownerAuthorizationDigest: record.ownerAuthorizationDigest as Hex,
    releaseCommit: record.releaseCommit as string,
    runtimeManifestSha256: record.runtimeManifestSha256 as Hex,
    ...(record.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2 ||
    record.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3 ||
    record.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4 ||
    record.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5 ||
    record.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6 ||
    record.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7 ||
    record.generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION ||
    record.generation === BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
      ? {
          generation: record.generation,
          predecessorState: predecessorStateFor(record.generation),
          ...(usesTerminalPredecessor(record.generation)
            ? { predecessorTerminalRawSha256: record.predecessorTerminalRawSha256 as Hex }
            : { predecessorFenceSha256: record.predecessorFenceSha256 as Hex }),
          attemptId: record.attemptId as Hex
        }
      : {})
  });
}

function transactionFields(record: DataRecord): RetainedTransactionBinding | null {
  if (
    typeof record.serializedTransaction !== "string" ||
    !RAW_TRANSACTION.test(record.serializedTransaction) ||
    record.serializedTransaction.length > 16_386 ||
    !exactBytes32(record.transactionHash) ||
    keccak256(record.serializedTransaction as Hex) !== record.transactionHash
  ) {
    return null;
  }
  return Object.freeze({
    ...bindingOf(record),
    serializedTransaction: record.serializedTransaction as Hex,
    transactionHash: record.transactionHash
  });
}

function commonRecord(
  kind: RecordKind,
  binding: JournalBinding,
  recordedAt: string,
  generation: JournalGeneration = binding.generation ?? 1
) {
  return {
    schemaVersion: schemaVersionFor(generation),
    kind,
    ...binding,
    recordedAt
  };
}

function serialize(value: Readonly<Record<string, unknown>>): string {
  return `${JSON.stringify(value)}\n`;
}

function schemaVersionFor(generation: JournalGeneration) {
  switch (generation) {
    case 1:
      return LEGACY_SCHEMA_VERSION;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2:
      return GENERATION_2_SCHEMA_VERSION;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3:
      return GENERATION_3_SCHEMA_VERSION;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4:
      return GENERATION_4_SCHEMA_VERSION;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5:
      return GENERATION_5_SCHEMA_VERSION;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6:
      return GENERATION_6_SCHEMA_VERSION;
    case BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7:
      return GENERATION_7_SCHEMA_VERSION;
    case BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION:
      return PREDECESSOR_SCHEMA_VERSION;
    case BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION:
      return ACTIVE_SCHEMA_VERSION;
  }
}

const BINDING_KEYS = [
  "claimId",
  "operationKey",
  "envelopeHash",
  "authorizationReceiptSha256",
  "signingHash",
  "serializedUnsignedSha256",
  "reviewerApprovalDigest",
  "ownerAuthorizationDigest",
  "releaseCommit",
  "runtimeManifestSha256"
] as const;
const CLAIM_EXTRA_KEYS = ["gasLimit", "gasPriceWei", "maxCostWei", "authorizedAt", "expiresAt"];
const WORKER_EXTRA_KEYS = ["workerRequestHash", "authorizationTokenDigest"];
const TRANSACTION_EXTRA_KEYS = ["serializedTransaction", "transactionHash"];
const SUPERSESSION_FENCE_KEYS = [
  "schemaVersion",
  "kind",
  ...BINDING_KEYS,
  "generation",
  "predecessorState",
  "ancestorFenceSha256",
  "attemptId",
  "terminalCode",
  "workerAuthorizationOutcome",
  "workerStartOutcome",
  "signatureOutcome",
  "submissionOutcome",
  "submissionJournalState",
  "predecessorClaimRawSha256",
  "noEffectProofDigest",
  "noEffectEnvelopeHash",
  "noEffectObservedAt",
  "recordedAt",
  "predecessorFenceSha256"
] as const;
const LEGACY_SUPERSESSION_FENCE_KEYS = [
  "schemaVersion",
  "kind",
  ...BINDING_KEYS,
  "terminalCode",
  "workerAuthorizationOutcome",
  "workerStartOutcome",
  "signatureOutcome",
  "submissionOutcome",
  "submissionJournalState",
  "legacyClaimRawSha256",
  "noEffectProofDigest",
  "noEffectEnvelopeHash",
  "noEffectObservedAt",
  "recordedAt",
  "predecessorFenceSha256"
] as const;

function inspectStoredCommon(
  record: DataRecord,
  extraKeys: readonly string[],
  generation: JournalGeneration
): JournalBinding | null {
  const bindingKeys = [
    ...BINDING_KEYS,
    ...(generation !== 1 ? recoveryBindingKeysFor(generation) : [])
  ];
  if (
    !exactKeys(record, ["schemaVersion", "kind", ...bindingKeys, "recordedAt", ...extraKeys]) ||
    record.schemaVersion !== schemaVersionFor(generation) ||
    canonicalDate(record.recordedAt) === null
  ) {
    return null;
  }
  const candidate: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of bindingKeys) candidate[key] = record[key];
  return inspectBinding(candidate, [], generation) === null ? null : bindingOf(record);
}

function parseStored(
  content: string | null,
  slot: number,
  generation: JournalGeneration
): ParsedRecord | null {
  if (content === null || content.length > MAXIMUM_RECORD_BYTES) return null;
  let record: DataRecord | null = null;
  try {
    record = dataRecord(JSON.parse(content));
  } catch {
    return null;
  }
  if (record === null || typeof record.kind !== "string") return null;
  const kind = record.kind as RecordKind;
  const allowed: Readonly<Record<number, readonly RecordKind[]>> = {
    1: ["claim"],
    2: [
      "worker_authorized",
      "superseded_before_worker",
      "failed_before_worker",
      "failed_before_submission",
      "unknown_outcome"
    ],
    3: ["worker_started", "failed_before_submission", "unknown_outcome"],
    4: ["signed_committed", "failed_before_submission", "unknown_outcome"],
    5: ["failed_before_submission", "unknown_outcome"]
  };
  if (!allowed[slot]?.includes(kind)) return null;

  if (kind === "superseded_before_worker") {
    const noEffectObservedAt = canonicalDate(record.noEffectObservedAt);
    const fenceRecordedAt = canonicalDate(record.recordedAt);
    const predecessorClaimRawSha256 =
      generation === 1 ? record.legacyClaimRawSha256 : record.predecessorClaimRawSha256;
    if (
      !isFenceableGeneration(generation) ||
      !exactKeys(
        record,
        generation === 1 ? LEGACY_SUPERSESSION_FENCE_KEYS : SUPERSESSION_FENCE_KEYS
      ) ||
      record.schemaVersion !==
        (generation === 1
          ? LEGACY_SUPERSESSION_FENCE_SCHEMA_VERSION
          : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
            ? GENERATION_2_SUPERSESSION_FENCE_SCHEMA_VERSION
            : SUPERSESSION_FENCE_SCHEMA_VERSION) ||
      record.terminalCode !== "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" ||
      record.workerAuthorizationOutcome !== "not_attempted" ||
      record.workerStartOutcome !== "not_attempted" ||
      record.signatureOutcome !== "not_attempted" ||
      record.submissionOutcome !== "not_attempted" ||
      record.submissionJournalState !== "exact_empty" ||
      predecessorClaimRawSha256 !== expectedClaimRawSha256For(generation) ||
      !exactBytes32(record.noEffectProofDigest) ||
      !exactBytes32(record.noEffectEnvelopeHash) ||
      noEffectObservedAt === null ||
      fenceRecordedAt === null ||
      !exactBytes32(record.predecessorFenceSha256)
    ) {
      return null;
    }
    const bindingCandidate: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    for (const key of BINDING_KEYS) bindingCandidate[key] = record[key];
    if (generation !== 1) {
      bindingCandidate.generation = record.generation;
      bindingCandidate.predecessorState = record.predecessorState;
      bindingCandidate.predecessorFenceSha256 = record.ancestorFenceSha256;
      bindingCandidate.attemptId = record.attemptId;
    }
    const binding = inspectBinding(bindingCandidate, [], generation);
    if (binding === null) return null;
    const digestInput = Object.freeze({
      binding: bindingOf(binding),
      predecessorClaimRawSha256: predecessorClaimRawSha256 as Hex,
      noEffectProofDigest: record.noEffectProofDigest,
      noEffectEnvelopeHash: record.noEffectEnvelopeHash,
      noEffectObservedAt,
      recordedAt: fenceRecordedAt
    });
    if (deriveSupersessionFenceSha256(digestInput) !== record.predecessorFenceSha256) return null;
    const supersessionFence = Object.freeze({
      status: "superseded_before_worker" as const,
      terminalCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" as const,
      workerAuthorizationOutcome: "not_attempted" as const,
      workerStartOutcome: "not_attempted" as const,
      signatureOutcome: "not_attempted" as const,
      submissionOutcome: "not_attempted" as const,
      submissionJournalState: "exact_empty" as const,
      predecessorClaimRawSha256: predecessorClaimRawSha256 as Hex,
      noEffectProofDigest: record.noEffectProofDigest,
      noEffectEnvelopeHash: record.noEffectEnvelopeHash,
      noEffectObservedAt,
      fenceRecordedAt,
      predecessorFenceSha256: record.predecessorFenceSha256
    });
    const parsed: ParsedRecord = Object.freeze({
      schemaVersion: schemaVersionFor(generation),
      kind,
      ...bindingOf(binding),
      recordedAt: fenceRecordedAt,
      supersessionFence
    });
    return content ===
      serialize({
        ...supersessionFenceDigestBody(digestInput),
        predecessorFenceSha256: supersessionFence.predecessorFenceSha256
      })
      ? parsed
      : null;
  }

  if (kind === "claim") {
    const binding = inspectStoredCommon(record, CLAIM_EXTRA_KEYS, generation);
    if (binding === null) return null;
    const claimCandidate = {
      operationKey: record.operationKey,
      envelopeHash: record.envelopeHash,
      signingHash: record.signingHash,
      serializedUnsignedSha256: record.serializedUnsignedSha256,
      gasLimit: record.gasLimit,
      gasPriceWei: record.gasPriceWei,
      maxCostWei: record.maxCostWei,
      reviewerApprovalDigest: record.reviewerApprovalDigest,
      ownerAuthorizationDigest: record.ownerAuthorizationDigest,
      releaseCommit: record.releaseCommit,
      runtimeManifestSha256: record.runtimeManifestSha256,
      authorizedAt: record.authorizedAt,
      expiresAt: record.expiresAt,
      authorizationReceiptSha256: record.authorizationReceiptSha256,
      ...(generation !== 1
        ? {
            generation: record.generation,
            predecessorState: record.predecessorState,
            ...(usesTerminalPredecessor(generation)
              ? { predecessorTerminalRawSha256: record.predecessorTerminalRawSha256 }
              : { predecessorFenceSha256: record.predecessorFenceSha256 }),
            attemptId: record.attemptId
          }
        : {})
    };
    const claim = inspectClaimRequest(claimCandidate, null, generation);
    if (claim === null || binding.claimId !== claimIdFor(claim, generation)) return null;
    const parsed: ParsedRecord = Object.freeze({
      schemaVersion: schemaVersionFor(generation),
      kind,
      ...binding,
      recordedAt: record.recordedAt as string,
      claim
    });
    return content === claimRecord(claim, parsed.recordedAt, generation) ? parsed : null;
  }

  if (kind === "worker_authorized" || kind === "worker_started") {
    const binding = inspectStoredCommon(record, WORKER_EXTRA_KEYS, generation);
    if (
      binding === null ||
      !exactBytes32(record.workerRequestHash) ||
      !exactBytes32(record.authorizationTokenDigest)
    ) {
      return null;
    }
    const parsed: ParsedRecord = Object.freeze({
      schemaVersion: schemaVersionFor(generation),
      kind,
      ...binding,
      recordedAt: record.recordedAt as string,
      workerRequestHash: record.workerRequestHash,
      authorizationTokenDigest: record.authorizationTokenDigest
    });
    return content ===
      serialize({
        ...commonRecord(kind, binding, parsed.recordedAt),
        workerRequestHash: parsed.workerRequestHash,
        authorizationTokenDigest: parsed.authorizationTokenDigest
      })
      ? parsed
      : null;
  }

  if (kind === "signed_committed") {
    const binding = inspectStoredCommon(
      record,
      ["workerRequestHash", ...TRANSACTION_EXTRA_KEYS, "recoveredSigner"],
      generation
    );
    const transaction = transactionFields(record);
    if (
      binding === null ||
      transaction === null ||
      !exactBytes32(record.workerRequestHash) ||
      record.recoveredSigner !== BSC_TESTNET_PTA_WBNB_POOL_SENDER
    ) {
      return null;
    }
    const parsed: ParsedRecord = Object.freeze({
      schemaVersion: schemaVersionFor(generation),
      kind,
      ...binding,
      recordedAt: record.recordedAt as string,
      workerRequestHash: record.workerRequestHash,
      serializedTransaction: transaction.serializedTransaction,
      transactionHash: transaction.transactionHash,
      recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
    });
    return content ===
      serialize({
        ...commonRecord(kind, binding, parsed.recordedAt),
        workerRequestHash: parsed.workerRequestHash,
        serializedTransaction: parsed.serializedTransaction,
        transactionHash: parsed.transactionHash,
        recoveredSigner: parsed.recoveredSigner
      })
      ? parsed
      : null;
  }

  if (kind === "failed_before_worker") {
    const binding = inspectStoredCommon(
      record,
      ["phase", "issueCode", "outcomeDigest"],
      generation
    );
    const issueCode = inspectFailedBeforeWorkerIssueCode(record.issueCode);
    if (
      (generation !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4 &&
        generation !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5 &&
        generation !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6 &&
        generation !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7 &&
        generation !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION &&
        generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION) ||
      binding === null ||
      record.phase !== "post_claim_recheck" ||
      issueCode === null ||
      !exactBytes32(record.outcomeDigest) ||
      ((generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4 ||
        generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5 ||
        generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6 ||
        generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7) &&
        (issueCode !== "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" ||
          record.outcomeDigest !==
            (generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4
              ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_FAILED_BEFORE_WORKER_OUTCOME_DIGEST
              : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
                ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_FAILED_BEFORE_WORKER_OUTCOME_DIGEST
                : generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
                  ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST
                  : BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_FAILED_BEFORE_WORKER_OUTCOME_DIGEST))) ||
      (generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION &&
        (issueCode !== "GAS_POLICY_VIOLATION" ||
          record.outcomeDigest !==
            BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_FAILED_BEFORE_WORKER_OUTCOME_DIGEST))
    ) {
      return null;
    }
    const parsed: ParsedRecord = Object.freeze({
      schemaVersion: schemaVersionFor(generation),
      kind,
      ...binding,
      recordedAt: record.recordedAt as string,
      phase: "post_claim_recheck" as const,
      issueCode,
      outcomeDigest: record.outcomeDigest
    });
    return content ===
      serialize({
        ...commonRecord(kind, binding, parsed.recordedAt),
        phase: parsed.phase,
        issueCode: parsed.issueCode,
        outcomeDigest: parsed.outcomeDigest
      })
      ? parsed
      : null;
  }

  const binding = inspectStoredCommon(
    record,
    ["outcomeDigest", "serializedTransaction", "transactionHash"],
    generation
  );
  if (binding === null || !exactBytes32(record.outcomeDigest)) return null;
  const transactionIsAbsent =
    record.serializedTransaction === null && record.transactionHash === null;
  const transaction = transactionIsAbsent ? null : transactionFields(record);
  if (!transactionIsAbsent && transaction === null) return null;
  const parsed: ParsedRecord = Object.freeze({
    schemaVersion: schemaVersionFor(generation),
    kind,
    ...binding,
    recordedAt: record.recordedAt as string,
    outcomeDigest: record.outcomeDigest,
    ...(transaction === null
      ? {}
      : {
          serializedTransaction: transaction.serializedTransaction,
          transactionHash: transaction.transactionHash
        })
  });
  return content ===
    serialize({
      ...commonRecord(kind, binding, parsed.recordedAt),
      outcomeDigest: parsed.outcomeDigest,
      serializedTransaction: parsed.serializedTransaction ?? null,
      transactionHash: parsed.transactionHash ?? null
    })
    ? parsed
    : null;
}

function claimRecord(
  request: AnyClaimRequest,
  recordedAt: string,
  generation: JournalGeneration
): string {
  const binding = bindingFromClaim(request, generation);
  return serialize({
    ...commonRecord("claim", binding, recordedAt),
    gasLimit: request.gasLimit,
    gasPriceWei: request.gasPriceWei,
    maxCostWei: request.maxCostWei,
    authorizedAt: request.authorizedAt,
    expiresAt: request.expiresAt
  });
}

function stateFrom(
  status: BscTestnetPtaWbnbPoolLocalJournalStatus,
  claim: ParsedRecord | null,
  transaction: ParsedRecord | null = null,
  fence: ParsedRecord | null = null
): BscTestnetPtaWbnbPoolLocalJournalState {
  return Object.freeze({
    status,
    claimId: claim?.claimId ?? null,
    operationKey: claim?.operationKey ?? null,
    envelopeHash: claim?.envelopeHash ?? null,
    authorizationReceiptSha256: claim?.authorizationReceiptSha256 ?? null,
    signingHash: claim?.signingHash ?? null,
    serializedUnsignedSha256: claim?.serializedUnsignedSha256 ?? null,
    reviewerApprovalDigest: claim?.reviewerApprovalDigest ?? null,
    ownerAuthorizationDigest: claim?.ownerAuthorizationDigest ?? null,
    releaseCommit: claim?.releaseCommit ?? null,
    runtimeManifestSha256: claim?.runtimeManifestSha256 ?? null,
    generation:
      claim === null
        ? null
        : claim.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
          ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
          : claim.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
            ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
            : claim.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4
              ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4
              : claim.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
                ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
                : claim.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
                  ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
                  : claim.generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
                    ? BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
                    : claim.generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
                      ? BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
                      : claim.generation === BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
                        ? BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
                        : 1,
    predecessorState: claim?.predecessorState ?? null,
    predecessorFenceSha256: claim?.predecessorFenceSha256 ?? null,
    predecessorTerminalRawSha256: claim?.predecessorTerminalRawSha256 ?? null,
    attemptId: claim?.attemptId ?? null,
    gasLimit: claim?.claim?.gasLimit ?? null,
    gasPriceWei: claim?.claim?.gasPriceWei ?? null,
    maxCostWei: claim?.claim?.maxCostWei ?? null,
    authorizedAt: claim?.claim?.authorizedAt ?? null,
    expiresAt: claim?.claim?.expiresAt ?? null,
    serializedTransaction: transaction?.serializedTransaction ?? null,
    transactionHash: transaction?.transactionHash ?? null,
    supersessionFence: fence?.supersessionFence ?? null
  });
}

function securityMetadata(input: unknown, expectedPaths: number): boolean {
  const record = dataRecord(input);
  return (
    record !== null &&
    exactKeys(record, [
      "verified",
      "ownerSid",
      "accessRulesProtected",
      "currentUserOnlyFullControl",
      "checkedPaths"
    ]) &&
    record.verified === true &&
    typeof record.ownerSid === "string" &&
    /^S-1-[0-9-]+$/u.test(record.ownerSid) &&
    record.accessRulesProtected === true &&
    record.currentUserOnlyFullControl === true &&
    record.checkedPaths === expectedPaths
  );
}

function inspectPorts(input: unknown): BscTestnetPtaWbnbPoolLocalJournalPorts | null {
  const record = dataRecord(input);
  if (
    record === null ||
    !exactKeys(record, [
      "now",
      "listNames",
      "readBounded",
      "createExclusive",
      "createExclusiveFenceFromFactory",
      "assertSecure"
    ])
  ) {
    return null;
  }
  for (const key of [
    "now",
    "listNames",
    "readBounded",
    "createExclusive",
    "createExclusiveFenceFromFactory",
    "assertSecure"
  ]) {
    if (typeof record[key] !== "function" || isProxy(record[key])) return null;
  }
  return record as unknown as BscTestnetPtaWbnbPoolLocalJournalPorts;
}

interface JournalSnapshot {
  readonly state: BscTestnetPtaWbnbPoolLocalJournalState;
  readonly records: readonly ParsedRecord[];
  readonly rawRecords: readonly string[];
}

function unknownSnapshot(claim: ParsedRecord | null = null): JournalSnapshot {
  return Object.freeze({
    state: stateFrom("unknown_outcome", claim),
    records: Object.freeze([]),
    rawRecords: Object.freeze([])
  });
}

function statusFor(kind: RecordKind): Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty"> {
  return kind === "claim" ? "claimed" : kind;
}

function inspectSecurityNames(
  value: unknown,
  slotFiles: readonly string[]
): readonly string[] | null {
  try {
    if (
      !Array.isArray(value) ||
      isProxy(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      return null;
    }
    const names = value.map((entry) =>
      typeof entry === "string" && slotFiles.some((allowed) => allowed === entry) ? entry : null
    );
    if (names.some((entry) => entry === null)) return null;
    const sorted = [...(names as string[])].sort();
    if (new Set(sorted).size !== sorted.length) return null;
    return Object.freeze(sorted);
  } catch {
    return null;
  }
}

/**
 * Core append-only state machine. Ports are injected only for deterministic tests and the fixed
 * Windows adapter below. No method offers generic CAS, overwrite, delete, or retry semantics.
 */
export function createBscTestnetPtaWbnbPoolLocalJournalCore(
  untrustedPorts: unknown,
  untrustedGeneration: unknown = 1
): BscTestnetPtaWbnbPoolLocalJournalCore {
  const ports = inspectPorts(untrustedPorts);
  if (
    ports === null ||
    (untrustedGeneration !== 1 &&
      untrustedGeneration !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2 &&
      untrustedGeneration !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3 &&
      untrustedGeneration !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4 &&
      untrustedGeneration !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5 &&
      untrustedGeneration !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6 &&
      untrustedGeneration !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7 &&
      untrustedGeneration !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION &&
      untrustedGeneration !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION)
  ) {
    throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
  }
  const generation: JournalGeneration = untrustedGeneration;
  const slotFiles = slotFilesFor(generation);

  const readSnapshot = async (): Promise<JournalSnapshot> => {
    const listed = inspectSecurityNames(await ports.listNames(), slotFiles);
    if (listed === null) return unknownSnapshot();
    const security = await ports.assertSecure(listed);
    if (!securityMetadata(security, listed.length + 1)) return unknownSnapshot();
    if (listed.length === 0) {
      return Object.freeze({
        state: stateFrom("empty", null),
        records: Object.freeze([]),
        rawRecords: Object.freeze([])
      });
    }
    const highest = Math.max(...listed.map((name) => slotFiles.indexOf(name) + 1));
    if (highest !== listed.length) return unknownSnapshot();
    const records: ParsedRecord[] = [];
    const rawRecords: string[] = [];
    for (let index = 0; index < listed.length; index += 1) {
      if (listed[index] !== slotFiles[index]) return unknownSnapshot(records[0] ?? null);
      const slotFile = slotFiles[index];
      if (slotFile === undefined) return unknownSnapshot(records[0] ?? null);
      const rawRecord = await ports.readBounded(slotFile);
      const parsed = parseStored(rawRecord, index + 1, generation);
      if (parsed === null) return unknownSnapshot(records[0] ?? null);
      records.push(parsed);
      rawRecords.push(rawRecord as string);
    }
    const claim = records[0];
    if (claim === undefined || claim.kind !== "claim" || claim.claim === undefined) {
      return unknownSnapshot();
    }
    for (const record of records.slice(1)) {
      if (!sameBinding(record, claim)) return unknownSnapshot(claim);
    }
    const kinds = records.map((record) => record.kind);
    if (kinds.slice(0, -1).some((kind) => kind.endsWith("outcome"))) {
      return unknownSnapshot(claim);
    }
    const workerAuthorized = records.find((record) => record.kind === "worker_authorized");
    const workerStarted = records.find((record) => record.kind === "worker_started");
    const signed = records.find((record) => record.kind === "signed_committed");
    const fence = records.find((record) => record.kind === "superseded_before_worker");
    if (
      fence !== undefined &&
      (records.length !== 2 ||
        records.at(-1) !== fence ||
        !isFenceableGeneration(generation) ||
        fence.supersessionFence === undefined ||
        fence.supersessionFence.predecessorClaimRawSha256 !==
          expectedClaimRawSha256For(generation) ||
        sha256Hex(claimRecord(claim.claim, claim.recordedAt, generation)) !==
          fence.supersessionFence.predecessorClaimRawSha256 ||
        Date.parse(fence.supersessionFence.noEffectObservedAt) <
          Date.parse(claim.claim.expiresAt) ||
        Date.parse(fence.supersessionFence.fenceRecordedAt) <=
          Date.parse(fence.supersessionFence.noEffectObservedAt) ||
        Date.parse(fence.supersessionFence.fenceRecordedAt) -
          Date.parse(fence.supersessionFence.noEffectObservedAt) >
          BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS * 1_000)
    ) {
      return unknownSnapshot(claim);
    }
    if (
      workerStarted !== undefined &&
      (workerAuthorized === undefined ||
        workerStarted.workerRequestHash !== workerAuthorized.workerRequestHash ||
        workerStarted.authorizationTokenDigest !== workerAuthorized.authorizationTokenDigest)
    ) {
      return unknownSnapshot(claim);
    }
    if (
      signed !== undefined &&
      (workerStarted === undefined || signed.workerRequestHash !== workerStarted.workerRequestHash)
    ) {
      return unknownSnapshot(claim);
    }
    for (const downstream of [records.at(-1)]) {
      if (
        downstream !== undefined &&
        downstream.serializedTransaction !== undefined &&
        (signed === undefined ||
          downstream.serializedTransaction !== signed.serializedTransaction ||
          downstream.transactionHash !== signed.transactionHash)
      ) {
        return unknownSnapshot(claim);
      }
    }
    const last = records.at(-1);
    if (last === undefined) return unknownSnapshot(claim);
    const expectedPrefixes: Readonly<Record<RecordKind, readonly RecordKind[]>> = {
      claim: ["claim"],
      worker_authorized: ["claim", "worker_authorized"],
      worker_started: ["claim", "worker_authorized", "worker_started"],
      signed_committed: ["claim", "worker_authorized", "worker_started", "signed_committed"],
      superseded_before_worker: ["claim", "superseded_before_worker"],
      failed_before_worker: ["claim", "failed_before_worker"],
      failed_before_submission: kinds,
      unknown_outcome: kinds
    };
    const expected = expectedPrefixes[last.kind];
    if (expected.length !== kinds.length || expected.some((kind, index) => kind !== kinds[index])) {
      return unknownSnapshot(claim);
    }
    if (
      generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4 &&
      (records.length !== 2 ||
        last.kind !== "failed_before_worker" ||
        last.phase !== "post_claim_recheck" ||
        last.issueCode !== "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" ||
        last.outcomeDigest !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_FAILED_BEFORE_WORKER_OUTCOME_DIGEST ||
        claim.envelopeHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ENVELOPE_HASH ||
        claim.attemptId !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_ATTEMPT_ID ||
        claim.releaseCommit !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_RELEASE_COMMIT ||
        claim.runtimeManifestSha256 !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_RUNTIME_MANIFEST_SHA256 ||
        claim.predecessorFenceSha256 !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_FENCE_SHA256 ||
        Buffer.byteLength(rawRecords[0] as string, "utf8") !== 1_362 ||
        Buffer.byteLength(rawRecords[1] as string, "utf8") !== 1_381 ||
        sha256Hex(rawRecords[0] as string) !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_CLAIM_RAW_SHA256 ||
        sha256Hex(rawRecords[1] as string) !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256)
    ) {
      return unknownSnapshot(claim);
    }
    if (
      generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5 &&
      (records.length !== 2 ||
        last.kind !== "failed_before_worker" ||
        last.phase !== "post_claim_recheck" ||
        last.issueCode !== "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" ||
        last.outcomeDigest !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_FAILED_BEFORE_WORKER_OUTCOME_DIGEST ||
        claim.envelopeHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_ENVELOPE_HASH ||
        claim.attemptId !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_ATTEMPT_ID ||
        claim.releaseCommit !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_RELEASE_COMMIT ||
        claim.runtimeManifestSha256 !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_RUNTIME_MANIFEST_SHA256 ||
        claim.predecessorTerminalRawSha256 !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256 ||
        Buffer.byteLength(rawRecords[0] as string, "utf8") !== 1_364 ||
        Buffer.byteLength(rawRecords[1] as string, "utf8") !== 1_383 ||
        sha256Hex(rawRecords[0] as string) !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_CLAIM_RAW_SHA256 ||
        sha256Hex(rawRecords[1] as string) !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256)
    ) {
      return unknownSnapshot(claim);
    }
    if (
      generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6 &&
      (records.length !== 2 ||
        last.kind !== "failed_before_worker" ||
        last.phase !== "post_claim_recheck" ||
        last.issueCode !== "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" ||
        last.outcomeDigest !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_FAILED_BEFORE_WORKER_OUTCOME_DIGEST ||
        claim.envelopeHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_ENVELOPE_HASH ||
        claim.attemptId !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_ATTEMPT_ID ||
        claim.releaseCommit !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_RELEASE_COMMIT ||
        claim.runtimeManifestSha256 !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_RUNTIME_MANIFEST_SHA256 ||
        claim.predecessorTerminalRawSha256 !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256 ||
        Buffer.byteLength(rawRecords[0] as string, "utf8") !== 1_364 ||
        Buffer.byteLength(rawRecords[1] as string, "utf8") !== 1_383 ||
        sha256Hex(rawRecords[0] as string) !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_CLAIM_RAW_SHA256 ||
        sha256Hex(rawRecords[1] as string) !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256)
    ) {
      return unknownSnapshot(claim);
    }
    if (
      generation === BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7 &&
      (records.length !== 2 ||
        last.kind !== "failed_before_worker" ||
        last.phase !== "post_claim_recheck" ||
        last.issueCode !== "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN" ||
        last.outcomeDigest !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_FAILED_BEFORE_WORKER_OUTCOME_DIGEST ||
        claim.envelopeHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_ENVELOPE_HASH ||
        claim.attemptId !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_ATTEMPT_ID ||
        claim.releaseCommit !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_RELEASE_COMMIT ||
        claim.runtimeManifestSha256 !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_RUNTIME_MANIFEST_SHA256 ||
        claim.predecessorTerminalRawSha256 !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256 ||
        Buffer.byteLength(rawRecords[0] as string, "utf8") !== 1_364 ||
        Buffer.byteLength(rawRecords[1] as string, "utf8") !== 1_383 ||
        sha256Hex(rawRecords[0] as string) !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_CLAIM_RAW_SHA256 ||
        sha256Hex(rawRecords[1] as string) !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256)
    ) {
      return unknownSnapshot(claim);
    }
    if (
      generation === BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION &&
      (records.length !== 2 ||
        last.kind !== "failed_before_worker" ||
        last.phase !== "post_claim_recheck" ||
        last.issueCode !== "GAS_POLICY_VIOLATION" ||
        last.outcomeDigest !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_FAILED_BEFORE_WORKER_OUTCOME_DIGEST ||
        claim.envelopeHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ENVELOPE_HASH ||
        claim.attemptId !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ATTEMPT_ID ||
        claim.releaseCommit !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_RELEASE_COMMIT ||
        claim.runtimeManifestSha256 !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_RUNTIME_MANIFEST_SHA256 ||
        claim.predecessorTerminalRawSha256 !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256 ||
        Buffer.byteLength(rawRecords[0] as string, "utf8") !== 1_364 ||
        Buffer.byteLength(rawRecords[1] as string, "utf8") !== 1_369 ||
        sha256Hex(rawRecords[0] as string) !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256 ||
        sha256Hex(rawRecords[1] as string) !==
          BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256)
    ) {
      return unknownSnapshot(claim);
    }
    return Object.freeze({
      state: stateFrom(statusFor(last.kind), claim, signed ?? null, fence ?? null),
      records: Object.freeze(records),
      rawRecords: Object.freeze(rawRecords)
    });
  };

  const readState = async (): Promise<BscTestnetPtaWbnbPoolLocalJournalState> => {
    try {
      return (await readSnapshot()).state;
    } catch {
      return stateFrom("unknown_outcome", null);
    }
  };

  const readStrictRecoveryState =
    async (): Promise<BscTestnetPtaWbnbPoolLocalJournalState | null> => {
      try {
        const snapshot = await readSnapshot();
        if (snapshot.state.status === "empty") {
          return snapshot.records.length === 0 ? snapshot.state : null;
        }
        const last = snapshot.records.at(-1);
        return last !== undefined && statusFor(last.kind) === snapshot.state.status
          ? snapshot.state
          : null;
      } catch {
        return null;
      }
    };

  const readExactTerminalRecoveryBinding =
    async (): Promise<BscTestnetPtaWbnbPoolPredecessorTerminalState | null> => {
      if (generation !== BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION) return null;
      try {
        const snapshot = await readSnapshot();
        const claim = snapshot.records[0];
        const terminal = snapshot.records[1];
        if (
          snapshot.state.status !== "failed_before_worker" ||
          snapshot.records.length !== 2 ||
          claim === undefined ||
          terminal === undefined ||
          claim.kind !== "claim" ||
          terminal.kind !== "failed_before_worker" ||
          terminal.phase !== "post_claim_recheck" ||
          terminal.issueCode !== "GAS_POLICY_VIOLATION" ||
          terminal.outcomeDigest !==
            BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_FAILED_BEFORE_WORKER_OUTCOME_DIGEST ||
          claim.predecessorTerminalRawSha256 !==
            BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256 ||
          claim.attemptId === undefined
        ) {
          return null;
        }
        return Object.freeze({
          status: "failed_before_worker" as const,
          generation: BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION,
          predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256,
          predecessorTerminalRawSha256:
            BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
          predecessorEnvelopeHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ENVELOPE_HASH,
          inheritedPredecessorTerminalRawSha256:
            BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256,
          predecessorAttemptId: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_ATTEMPT_ID,
          phase: "post_claim_recheck" as const,
          issueCode: "GAS_POLICY_VIOLATION" as const,
          outcomeDigest: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_FAILED_BEFORE_WORKER_OUTCOME_DIGEST,
          workerAuthorizationOutcome: "not_attempted" as const,
          workerStartOutcome: "not_attempted" as const,
          signatureOutcome: "not_attempted" as const,
          recordedAt: terminal.recordedAt
        });
      } catch {
        return null;
      }
    };

  const requireSnapshot = async (
    expected: BscTestnetPtaWbnbPoolLocalJournalStatus,
    binding: JournalBinding
  ): Promise<JournalSnapshot> => {
    const snapshot = await readSnapshot();
    const claim = snapshot.records[0];
    if (snapshot.state.status !== expected || claim === undefined || !sameBinding(claim, binding)) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_STATE_MISMATCH");
    }
    return snapshot;
  };

  const append = async (
    slot: number,
    content: string,
    expectedStatus: BscTestnetPtaWbnbPoolLocalJournalStatus,
    nextStatus: Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty">,
    binding: JournalBinding
  ): Promise<void> => {
    await requireSnapshot(expectedStatus, binding);
    const name = slotFiles[slot - 1];
    if (name === undefined) throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    if ((await ports.createExclusive(name, content)) !== "created") {
      throw new Error("PTA_WBNB_POOL_JOURNAL_OUTCOME_UNKNOWN");
    }
    const retained = await readSnapshot();
    if (retained.state.status !== nextStatus) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_OUTCOME_UNKNOWN");
    }
  };

  const claimExactInitialization = async (
    untrustedRequest: AnyClaimRequest
  ): Promise<
    | Readonly<{ status: "claimed"; claimId: string }>
    | Readonly<{
        status: "already_claimed";
        claimId: string;
        state: Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty">;
      }>
  > => {
    const recordedAt = captureNow(ports.now);
    const request =
      recordedAt === null ? null : inspectClaimRequest(untrustedRequest, recordedAt, generation);
    if (request === null || recordedAt === null) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const initial = await readSnapshot();
    const binding = bindingFromClaim(request, generation);
    if (initial.state.status !== "empty") {
      const existing = initial.records[0];
      if (existing === undefined || !sameBinding(existing, binding)) {
        throw new Error("PTA_WBNB_POOL_JOURNAL_OUTCOME_UNKNOWN");
      }
      return Object.freeze({
        status: "already_claimed" as const,
        claimId: binding.claimId,
        state: initial.state.status as Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty">
      });
    }
    const claimFile = slotFiles[0];
    if (claimFile === undefined) throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    const outcome = await ports.createExclusive(
      claimFile,
      claimRecord(request, recordedAt, generation)
    );
    const retained = await readSnapshot();
    const retainedClaim = retained.records[0];
    if (retainedClaim === undefined || !sameBinding(retainedClaim, binding)) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_OUTCOME_UNKNOWN");
    }
    if (outcome === "created" && retained.state.status === "claimed") {
      return Object.freeze({ status: "claimed" as const, claimId: binding.claimId });
    }
    return Object.freeze({
      status: "already_claimed" as const,
      claimId: binding.claimId,
      state: retained.state.status as Exclude<BscTestnetPtaWbnbPoolLocalJournalStatus, "empty">
    });
  };

  const readClaimOnlyRecoveryCandidate =
    async (): Promise<BscTestnetPtaWbnbPoolClaimOnlyRecoveryCandidate | null> => {
      const snapshot = await readSnapshot();
      const claim = snapshot.records[0];
      if (
        !isFenceableGeneration(generation) ||
        snapshot.state.status !== "claimed" ||
        snapshot.records.length !== 1 ||
        claim === undefined ||
        claim.kind !== "claim" ||
        claim.claim === undefined
      ) {
        return null;
      }
      const rawSha256 = sha256Hex(claimRecord(claim.claim, claim.recordedAt, generation));
      const expectedRawSha256 = expectedClaimRawSha256For(generation);
      if (rawSha256 !== expectedRawSha256) return null;
      return Object.freeze({
        status: "claimed" as const,
        ...bindingOf(claim),
        predecessorClaimRawSha256: rawSha256,
        predecessorClaimRecordedAt: claim.recordedAt,
        predecessorAuthorizationExpiresAt: claim.claim.expiresAt
      });
    };

  const fenceClaimBeforeWorker = async (
    untrustedRequest: BscTestnetPtaWbnbPoolFenceClaimBeforeWorkerRequest
  ): Promise<BscTestnetPtaWbnbPoolSupersessionFenceState> => {
    const request = dataRecord(untrustedRequest);
    const proof = request === null ? null : inspectNoEffectProof(request.proof);
    const proofDigest =
      proof === null ? null : deriveBscTestnetPtaWbnbPoolNoEffectProofDigest(proof);
    if (
      request === null ||
      !Object.isFrozen(untrustedRequest) ||
      !exactKeys(request, ["expectedPredecessorClaimRawSha256", "proof"]) ||
      proof === null ||
      proofDigest === null
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_SUPERSESSION_INPUT_INVALID");
    }
    const snapshot = await readSnapshot();
    const claim = snapshot.records[0];
    if (
      snapshot.state.status !== "claimed" ||
      snapshot.records.length !== 1 ||
      claim === undefined ||
      claim.kind !== "claim" ||
      claim.claim === undefined
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_SUPERSESSION_PERMANENTLY_BLOCKED");
    }
    if (!isFenceableGeneration(generation)) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_SUPERSESSION_PERMANENTLY_BLOCKED");
    }
    const predecessorClaimRawSha256 = sha256Hex(
      claimRecord(claim.claim, claim.recordedAt, generation)
    );
    const expectedRawSha256 = expectedClaimRawSha256For(generation);
    const predecessorExpiresAt = Date.parse(claim.claim.expiresAt);
    const noEffectObservedAt = Date.parse(proof.observedAt);
    if (
      predecessorClaimRawSha256 !== expectedRawSha256 ||
      request.expectedPredecessorClaimRawSha256 !== predecessorClaimRawSha256 ||
      noEffectObservedAt < predecessorExpiresAt
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_SUPERSESSION_PROOF_INVALID");
    }
    const binding = bindingOf(claim);
    const fenceFile = slotFiles[1];
    if (fenceFile === undefined) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    let recordedAt: string | null = null;
    let predecessorFenceSha256: Hex | null = null;
    // Avoid permanently reserving slot 2 when the proof is already known to be stale. This check
    // is synchronous and immediately precedes the adapter call; the factory repeats it after the
    // kernel O_EXCL reservation so a stall or clock jump between these two checks still fails closed.
    const preReservationAt = captureNow(ports.now);
    if (preReservationAt === null) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_SUPERSESSION_PROOF_INVALID");
    }
    const preReservationMilliseconds = Date.parse(preReservationAt);
    if (
      preReservationMilliseconds < predecessorExpiresAt ||
      noEffectObservedAt >= preReservationMilliseconds ||
      preReservationMilliseconds - noEffectObservedAt >
        BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS * 1_000
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_SUPERSESSION_PROOF_INVALID");
    }
    const outcome = await ports.createExclusiveFenceFromFactory(fenceFile, () => {
      // The adapter has already reserved legacy slot 2 with O_EXCL. No awaited preflight or stale
      // worker authorization can occur between this clock capture and ownership of that slot.
      const reservedAt = captureNow(ports.now);
      if (reservedAt === null) {
        throw new Error("PTA_WBNB_POOL_JOURNAL_SUPERSESSION_PROOF_INVALID");
      }
      const fenceRecordedAt = Date.parse(reservedAt);
      if (
        fenceRecordedAt < predecessorExpiresAt ||
        noEffectObservedAt >= fenceRecordedAt ||
        fenceRecordedAt - noEffectObservedAt >
          BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS * 1_000
      ) {
        throw new Error("PTA_WBNB_POOL_JOURNAL_SUPERSESSION_PROOF_INVALID");
      }
      const digestInput = Object.freeze({
        binding,
        predecessorClaimRawSha256,
        noEffectProofDigest: proofDigest,
        noEffectEnvelopeHash: proof.envelopeHash,
        noEffectObservedAt: proof.observedAt,
        recordedAt: reservedAt
      });
      const derivedFenceSha256 = deriveSupersessionFenceSha256(digestInput);
      recordedAt = reservedAt;
      predecessorFenceSha256 = derivedFenceSha256;
      return serialize({
        ...supersessionFenceDigestBody(digestInput),
        predecessorFenceSha256: derivedFenceSha256
      });
    });
    const retained = await readSnapshot();
    const retainedFence = retained.state.supersessionFence;
    if (
      recordedAt === null ||
      predecessorFenceSha256 === null ||
      retained.state.status !== "superseded_before_worker" ||
      retained.records.length !== 2 ||
      retainedFence === null ||
      retainedFence.predecessorClaimRawSha256 !== predecessorClaimRawSha256 ||
      retainedFence.noEffectProofDigest !== proofDigest ||
      retainedFence.noEffectEnvelopeHash !== proof.envelopeHash ||
      retainedFence.noEffectObservedAt !== proof.observedAt ||
      retainedFence.fenceRecordedAt !== recordedAt ||
      retainedFence.predecessorFenceSha256 !== predecessorFenceSha256
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_SUPERSESSION_OUTCOME_UNKNOWN");
    }
    if (outcome !== "created") {
      throw new Error("PTA_WBNB_POOL_JOURNAL_SUPERSESSION_OUTCOME_UNKNOWN");
    }
    return retainedFence;
  };

  const authorizeWorker = async (
    untrustedRequest: BscTestnetPtaWbnbPoolWorkerAuthorizationRequest
  ): Promise<Readonly<{ status: "worker_authorized" }>> => {
    const recordedAt = captureNow(ports.now);
    const record = inspectBinding(
      untrustedRequest,
      ["workerRequestHash", "authorizationTokenDigest"],
      generation
    );
    if (
      recordedAt === null ||
      record === null ||
      !exactBytes32(record.workerRequestHash) ||
      !exactBytes32(record.authorizationTokenDigest)
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const binding = bindingOf(record);
    await append(
      2,
      serialize({
        ...commonRecord("worker_authorized", binding, recordedAt),
        workerRequestHash: record.workerRequestHash,
        authorizationTokenDigest: record.authorizationTokenDigest
      }),
      "claimed",
      "worker_authorized",
      binding
    );
    return Object.freeze({ status: "worker_authorized" as const });
  };

  const failBeforeWorker = async (
    untrustedRequest: BscTestnetPtaWbnbPoolFailedBeforeWorkerRequest
  ): Promise<Readonly<{ status: "failed_before_worker" }>> => {
    const recordedAt = captureNow(ports.now);
    const record = inspectBinding(
      untrustedRequest,
      ["phase", "issueCode", "outcomeDigest"],
      generation
    );
    const issueCode = record === null ? null : inspectFailedBeforeWorkerIssueCode(record.issueCode);
    if (
      generation !== BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION ||
      recordedAt === null ||
      record === null ||
      record.phase !== "post_claim_recheck" ||
      issueCode === null ||
      !exactBytes32(record.outcomeDigest)
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const binding = bindingOf(record);
    await append(
      2,
      serialize({
        ...commonRecord("failed_before_worker", binding, recordedAt),
        phase: "post_claim_recheck",
        issueCode,
        outcomeDigest: record.outcomeDigest
      }),
      "claimed",
      "failed_before_worker",
      binding
    );
    return Object.freeze({ status: "failed_before_worker" as const });
  };

  const startWorker = async (
    untrustedRequest: BscTestnetPtaWbnbPoolWorkerStartRequest
  ): Promise<Readonly<{ status: "worker_started" }>> => {
    const recordedAt = captureNow(ports.now);
    const record = inspectBinding(
      untrustedRequest,
      ["workerRequestHash", "authorizationToken"],
      generation
    );
    if (
      recordedAt === null ||
      record === null ||
      !exactBytes32(record.workerRequestHash) ||
      !exactBytes32(record.authorizationToken)
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const binding = bindingOf(record);
    const snapshot = await requireSnapshot("worker_authorized", binding);
    const authorization = snapshot.records[1];
    const authorizationToken = record.authorizationToken as Hex;
    const tokenDigest = keccak256(authorizationToken);
    if (
      authorization?.workerRequestHash !== record.workerRequestHash ||
      authorization.authorizationTokenDigest !== tokenDigest
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_WORKER_AUTHORIZATION_INVALID");
    }
    await append(
      3,
      serialize({
        ...commonRecord("worker_started", binding, recordedAt),
        workerRequestHash: record.workerRequestHash,
        authorizationTokenDigest: tokenDigest
      }),
      "worker_authorized",
      "worker_started",
      binding
    );
    return Object.freeze({ status: "worker_started" as const });
  };

  const consumeWorkerAuthorization = async (
    untrustedWorkerRequest: BscTestnetPtaWbnbPoolSigningWorkerRequest
  ): Promise<Readonly<{ status: "worker_started" }>> => {
    const recordedAt = captureNow(ports.now);
    const workerRequest =
      parseBscTestnetPtaWbnbPoolSigningWorkerRequestForInternalUse(untrustedWorkerRequest);
    const validation = validateBscTestnetPtaWbnbPoolSigningWorkerRequest(
      untrustedWorkerRequest,
      recordedAt === null ? null : new Date(recordedAt)
    );
    if (workerRequest === null || validation.status !== "valid") {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const snapshot = await readSnapshot();
    const claim = snapshot.records[0];
    if (claim === undefined) throw new Error("PTA_WBNB_POOL_JOURNAL_CLAIM_MISMATCH");
    const binding = bindingOf(claim);
    if (
      workerRequest.claimId !== binding.claimId ||
      workerRequest.operationKey !== binding.operationKey ||
      workerRequest.transaction.sourceEnvelopeHash !== binding.envelopeHash ||
      workerRequest.transaction.signingHash !== binding.signingHash ||
      sha256HexBytes(workerRequest.transaction.serializedUnsignedTransaction) !==
        binding.serializedUnsignedSha256 ||
      workerRequest.reviewerApprovalDigest !== binding.reviewerApprovalDigest ||
      workerRequest.ownerAuthorizationDigest !== binding.ownerAuthorizationDigest ||
      workerRequest.releaseCommit !== binding.releaseCommit ||
      workerRequest.runtimeManifestSha256 !== binding.runtimeManifestSha256 ||
      (generation === BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION &&
        (workerRequest.recovery.generation !== binding.generation ||
          workerRequest.recovery.predecessorState !== binding.predecessorState ||
          workerRequest.recovery.predecessorTerminalRawSha256 !==
            binding.predecessorTerminalRawSha256 ||
          workerRequest.recovery.attemptId !== binding.attemptId))
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CLAIM_MISMATCH");
    }
    return startWorker({
      ...binding,
      workerRequestHash: workerRequest.requestHash,
      authorizationToken: workerRequest.journalClaimToken
    });
  };

  const commitValidatedWorkerSignedTransaction = async (
    untrustedRequest: ValidatedWorkerSignedCommit
  ): Promise<Readonly<{ status: "signed_committed" }>> => {
    const recordedAt = captureNow(ports.now);
    const record = inspectBinding(
      untrustedRequest,
      ["workerRequestHash", "serializedTransaction", "transactionHash", "recoveredSigner"],
      generation
    );
    const transaction = record === null ? null : transactionFields(record);
    if (
      recordedAt === null ||
      record === null ||
      transaction === null ||
      !exactBytes32(record.workerRequestHash) ||
      record.recoveredSigner !== BSC_TESTNET_PTA_WBNB_POOL_SENDER
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const binding = bindingOf(record);
    const current = await readSnapshot();
    if (current.state.status === "signed_committed") {
      const retained = current.records[3];
      if (
        retained !== undefined &&
        sameBinding(retained, binding) &&
        retained.workerRequestHash === record.workerRequestHash &&
        retained.serializedTransaction === transaction.serializedTransaction &&
        retained.transactionHash === transaction.transactionHash &&
        retained.recoveredSigner === BSC_TESTNET_PTA_WBNB_POOL_SENDER
      ) {
        return Object.freeze({ status: "signed_committed" as const });
      }
      throw new Error("PTA_WBNB_POOL_JOURNAL_OUTCOME_UNKNOWN");
    }
    const snapshot = await requireSnapshot("worker_started", binding);
    if (snapshot.records[2]?.workerRequestHash !== record.workerRequestHash) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_WORKER_MISMATCH");
    }
    await append(
      4,
      serialize({
        ...commonRecord("signed_committed", binding, recordedAt),
        workerRequestHash: record.workerRequestHash,
        serializedTransaction: transaction.serializedTransaction,
        transactionHash: transaction.transactionHash,
        recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
      }),
      "worker_started",
      "signed_committed",
      binding
    );
    return Object.freeze({ status: "signed_committed" as const });
  };

  const commitWorkerSignedTransaction = async (
    untrustedWorkerRequest: BscTestnetPtaWbnbPoolSigningWorkerRequest,
    untrustedWorkerResponse: BscTestnetPtaWbnbPoolSigningWorkerResponse
  ): Promise<Readonly<{ status: "signed_committed" }>> => {
    const workerRequest =
      parseBscTestnetPtaWbnbPoolSigningWorkerRequestForInternalUse(untrustedWorkerRequest);
    const response = dataRecord(untrustedWorkerResponse);
    const validated = await validateBscTestnetPtaWbnbPoolSigningWorkerResponse(
      untrustedWorkerResponse,
      untrustedWorkerRequest
    );
    if (
      workerRequest === null ||
      response === null ||
      validated.status !== "valid" ||
      typeof response.signedTransaction !== "string" ||
      !RAW_TRANSACTION.test(response.signedTransaction) ||
      !exactBytes32(response.transactionHash) ||
      keccak256(response.signedTransaction as Hex) !== response.transactionHash ||
      response.requestHash !== workerRequest.requestHash ||
      response.claimId !== workerRequest.claimId ||
      response.operationKey !== workerRequest.operationKey ||
      response.signingHash !== workerRequest.transaction.signingHash
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const snapshot = await readSnapshot();
    const claim = snapshot.records[0];
    if (claim === undefined) throw new Error("PTA_WBNB_POOL_JOURNAL_CLAIM_MISMATCH");
    const binding = bindingOf(claim);
    return commitValidatedWorkerSignedTransaction({
      ...binding,
      workerRequestHash: workerRequest.requestHash,
      serializedTransaction: validated.signedTransaction,
      transactionHash: validated.transactionHash,
      recoveredSigner: validated.recoveredSigner
    });
  };

  const appendTerminal = async (
    kind: "failed_before_submission" | "unknown_outcome",
    untrustedRequest: BscTestnetPtaWbnbPoolTerminalRequest
  ): Promise<void> => {
    const recordedAt = captureNow(ports.now);
    const rawRecord = dataRecord(untrustedRequest);
    const hasTransaction =
      rawRecord !== null &&
      Object.hasOwn(rawRecord, "serializedTransaction") &&
      Object.hasOwn(rawRecord, "transactionHash");
    const extras = hasTransaction
      ? ["outcomeDigest", ...TRANSACTION_EXTRA_KEYS]
      : ["outcomeDigest"];
    const record = inspectBinding(untrustedRequest, extras, generation);
    const transaction = record === null || !hasTransaction ? null : transactionFields(record);
    if (
      recordedAt === null ||
      record === null ||
      !exactBytes32(record.outcomeDigest) ||
      (hasTransaction && transaction === null)
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_INPUT_INVALID");
    }
    const binding = bindingOf(record);
    const snapshot = await readSnapshot();
    const expected = snapshot.state.status;
    const slot = snapshot.records.length + 1;
    const signed = snapshot.records.find((entry) => entry.kind === "signed_committed");
    if (
      expected === "empty" ||
      expected === "superseded_before_worker" ||
      expected === "failed_before_worker" ||
      expected === "unknown_outcome" ||
      expected === "failed_before_submission" ||
      slot > slotFiles.length ||
      (signed === undefined && transaction !== null) ||
      (signed !== undefined &&
        (transaction === null ||
          transaction.serializedTransaction !== signed.serializedTransaction ||
          transaction.transactionHash !== signed.transactionHash))
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_STATE_MISMATCH");
    }
    await append(
      slot,
      serialize({
        ...commonRecord(kind, binding, recordedAt),
        outcomeDigest: record.outcomeDigest,
        serializedTransaction: transaction?.serializedTransaction ?? null,
        transactionHash: transaction?.transactionHash ?? null
      }),
      expected,
      kind,
      binding
    );
  };

  const failBeforeSubmission = async (request: BscTestnetPtaWbnbPoolTerminalRequest) => {
    await appendTerminal("failed_before_submission", request);
    return Object.freeze({ status: "failed_before_submission" as const });
  };

  const recordUnknownOutcome = async (request: BscTestnetPtaWbnbPoolTerminalRequest) => {
    await appendTerminal("unknown_outcome", request);
    return Object.freeze({ status: "unknown_outcome" as const });
  };

  return Object.freeze({
    claimExactInitialization,
    readClaimOnlyRecoveryCandidate,
    fenceClaimBeforeWorker,
    authorizeWorker,
    failBeforeWorker,
    startWorker,
    consumeWorkerAuthorization,
    commitWorkerSignedTransaction,
    failBeforeSubmission,
    recordUnknownOutcome,
    readState,
    readStrictRecoveryState,
    readExactTerminalRecoveryBinding
  });
}

const ACL_PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
  $spec = $reader.ReadToEnd() | ConvertFrom-Json
  $reader.Dispose()
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $account = $current.Translate([System.Security.Principal.NTAccount]).Value
  foreach ($path in @($spec.paths)) {
    $item = Get-Item -LiteralPath $path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
    $acl = Get-Acl -LiteralPath $path
    if ($acl.Owner -ne $current.Value -and $acl.Owner -ne $account) { throw 'owner' }
    if (-not $acl.AreAccessRulesProtected) { throw 'inheritance' }
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    if ($rules.Count -lt 1) { throw 'rules' }
    foreach ($rule in $rules) {
      if ($rule.IdentityReference.Value -ne $current.Value) { throw 'principal' }
      if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { throw 'deny' }
      if (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { throw 'rights' }
    }
  }
  [Console]::Out.Write((@{
    verified = $true
    ownerSid = $current.Value
    accessRulesProtected = $true
    currentUserOnlyFullControl = $true
    checkedPaths = @($spec.paths).Count
  } | ConvertTo-Json -Compress))
} catch { exit 43 }
`;

const LOCAL_APPLICATION_DATA_READ_ONLY_PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if ([String]::IsNullOrWhiteSpace($base)) { throw 'base' }
  $item = Get-Item -LiteralPath $base -Force
  if (-not $item.PSIsContainer) { throw 'type' }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
  if ([IO.Path]::GetFullPath($item.FullName) -ne [IO.Path]::GetFullPath($base)) { throw 'path' }
  [Console]::Out.Write((@{ localApplicationData = $item.FullName } | ConvertTo-Json -Compress))
} catch { exit 46 }
`;

const LOCAL_APPLICATION_DATA_PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if ([String]::IsNullOrWhiteSpace($base)) { throw 'base' }
  $baseItem = Get-Item -LiteralPath $base -Force
  if (-not $baseItem.PSIsContainer) { throw 'base-type' }
  if (($baseItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'base-reparse' }
  if ([IO.Path]::GetFullPath($baseItem.FullName) -ne [IO.Path]::GetFullPath($base)) { throw 'base-path' }

  $cursor = $baseItem.FullName
  foreach ($segment in @('ProofEra', 'operations', 'bsc-testnet-pta-wbnb-pool-v9')) {
    $candidate = [IO.Path]::GetFullPath([IO.Path]::Combine($cursor, $segment))
    if ([IO.Path]::GetDirectoryName($candidate) -ne [IO.Path]::GetFullPath($cursor)) { throw 'escape' }
    if (Test-Path -LiteralPath $candidate) {
      $item = Get-Item -LiteralPath $candidate -Force
      if (-not $item.PSIsContainer) { throw 'ancestor-type' }
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'ancestor-reparse' }
      if ([IO.Path]::GetFullPath($item.FullName) -ne $candidate) { throw 'ancestor-path' }
    } else {
      $item = New-Item -ItemType Directory -Path $candidate
      if (-not $item.PSIsContainer) { throw 'created-type' }
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'created-reparse' }
    }
    $cursor = $item.FullName
  }

  # All ancestors have been validated before the first ACL mutation.
  $allowed = @(
     '01-claim.v9.json', '02-transition.v9.json', '03-transition.v9.json',
     '04-transition.v9.json', '05-transition.v9.json'
  )
  $retainedFiles = @()
  foreach ($child in @(Get-ChildItem -LiteralPath $cursor -Force)) {
    if ($child.PSIsContainer -or ($allowed -notcontains $child.Name)) { throw 'unexpected-child' }
    if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'child-reparse' }
    if ($child.LinkType) { throw 'child-link' }
    $retainedFiles += $child.FullName
  }

  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $existingDirectoryAcl = Get-Acl -LiteralPath $cursor
  $existingDirectoryOwner = try {
    ([System.Security.Principal.SecurityIdentifier]::new($existingDirectoryAcl.Owner)).Value
  } catch {
    ([System.Security.Principal.NTAccount]::new($existingDirectoryAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  }
  if ($existingDirectoryOwner -ne $current.Value) { throw 'pre-owner' }
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $directoryAcl = [System.Security.AccessControl.DirectorySecurity]::new()
  $directoryAcl.SetAccessRuleProtection($true, $false)
  $directoryRule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $current,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    $inherit,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$directoryAcl.AddAccessRule($directoryRule)
  [IO.Directory]::SetAccessControl($cursor, $directoryAcl)

  # Never rewrite a retained record's ACL. Existing records must already satisfy the exact policy.
  # Post-validate the directory and every retained record after the directory ACL write.
  foreach ($path in @($cursor) + $retainedFiles) {
    $item = Get-Item -LiteralPath $path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'post-reparse' }
    $acl = Get-Acl -LiteralPath $path
    if (-not $acl.AreAccessRulesProtected) { throw 'post-inheritance' }
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    if ($rules.Count -lt 1) { throw 'post-rules' }
    foreach ($rule in $rules) {
      if ($rule.IdentityReference.Value -ne $current.Value) { throw 'post-principal' }
      if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { throw 'post-deny' }
      if (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { throw 'post-rights' }
    }
  }
  [Console]::Out.Write((@{ localApplicationData = $baseItem.FullName } | ConvertTo-Json -Compress))
} catch { exit 44 }
`;

const PROTECT_RECORD_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
  $spec = $reader.ReadToEnd() | ConvertFrom-Json
  $reader.Dispose()
  $directory = Get-Item -LiteralPath $spec.directory -Force
  $file = Get-Item -LiteralPath $spec.file -Force
  if (-not $directory.PSIsContainer -or $file.PSIsContainer) { throw 'type' }
  if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'directory-reparse' }
  if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'file-reparse' }
  if ([IO.Path]::GetDirectoryName($file.FullName) -ne $directory.FullName) { throw 'parent' }
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $directoryAcl = Get-Acl -LiteralPath $directory.FullName
  if (-not $directoryAcl.AreAccessRulesProtected) { throw 'directory-inheritance' }
  $existingFileAcl = Get-Acl -LiteralPath $file.FullName
  $existingFileOwner = try {
    ([System.Security.Principal.SecurityIdentifier]::new($existingFileAcl.Owner)).Value
  } catch {
    ([System.Security.Principal.NTAccount]::new($existingFileAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  }
  if ($existingFileOwner -ne $current.Value) { throw 'file-owner' }
  $fileAcl = [System.Security.AccessControl.FileSecurity]::new()
  $fileAcl.SetAccessRuleProtection($true, $false)
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $current,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$fileAcl.AddAccessRule($rule)
  [IO.File]::SetAccessControl($file.FullName, $fileAcl)
  $retained = Get-Acl -LiteralPath $file.FullName
  if (-not $retained.AreAccessRulesProtected) { throw 'post-inheritance' }
  $rules = @($retained.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  if ($rules.Count -lt 1) { throw 'post-rules' }
  foreach ($entry in $rules) {
    if ($entry.IdentityReference.Value -ne $current.Value) { throw 'post-principal' }
    if ($entry.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { throw 'post-deny' }
    if (($entry.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { throw 'post-rights' }
  }
  [Console]::Out.Write('{"ok":true}')
} catch { exit 45 }
`;

function expectedJournalDirectoryFromLocalAppData(
  input: unknown,
  subdirectory: readonly string[]
): string | null {
  if (
    typeof input !== "string" ||
    input.length < 3 ||
    input.length > 400 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(input) ||
    input.includes("/") ||
    win32.normalize(input) !== input
  ) {
    return null;
  }
  if (
    subdirectory !== LEGACY_JOURNAL_SUBDIRECTORY &&
    subdirectory !== GENERATION_2_JOURNAL_SUBDIRECTORY &&
    subdirectory !== GENERATION_3_JOURNAL_SUBDIRECTORY &&
    subdirectory !== GENERATION_4_JOURNAL_SUBDIRECTORY &&
    subdirectory !== GENERATION_5_JOURNAL_SUBDIRECTORY &&
    subdirectory !== GENERATION_6_JOURNAL_SUBDIRECTORY &&
    subdirectory !== GENERATION_7_JOURNAL_SUBDIRECTORY &&
    subdirectory !== PREDECESSOR_JOURNAL_SUBDIRECTORY &&
    subdirectory !== ACTIVE_JOURNAL_SUBDIRECTORY
  ) {
    return null;
  }
  const directory = win32.join(input, ...subdirectory);
  const resolved = resolve(directory);
  const relation = relative(REPOSITORY_ROOT, resolved);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")
    ? null
    : resolved;
}

async function stableDirectoryPresence(path: string): Promise<"present" | "absent"> {
  try {
    const before = await lstat(path, { bigint: true });
    const canonical = await realpath(path);
    const after = await lstat(path, { bigint: true });
    if (
      !before.isDirectory() ||
      before.isSymbolicLink() ||
      !after.isDirectory() ||
      after.isSymbolicLink() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.birthtimeNs !== after.birthtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.mode !== after.mode ||
      before.nlink !== after.nlink ||
      after.nlink < 1n ||
      win32.normalize(canonical).toLowerCase() !== win32.normalize(path).toLowerCase()
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_DIRECTORY_INVALID");
    }
    return "present";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
}

async function readOnlyFixedJournalDirectory(
  subdirectory: readonly string[]
): Promise<string | null> {
  const input = Buffer.alloc(0);
  let output: Buffer | null = null;
  try {
    const result = await runPinnedPowerShellForInternalUse(
      LOCAL_APPLICATION_DATA_READ_ONLY_PROBE_SCRIPT,
      input,
      1_024,
      new AbortController().signal
    );
    output = result.output;
    const parsed = dataRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)));
    if (parsed === null || !exactKeys(parsed, ["localApplicationData"])) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    const expected = expectedJournalDirectoryFromLocalAppData(
      parsed.localApplicationData,
      subdirectory
    );
    if (expected === null || typeof parsed.localApplicationData !== "string") {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    let cursor = resolve(parsed.localApplicationData);
    if ((await stableDirectoryPresence(cursor)) !== "present") {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    for (const segment of subdirectory) {
      const candidate = win32.join(cursor, segment);
      if (win32.dirname(candidate).toLowerCase() !== win32.normalize(cursor).toLowerCase()) {
        throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
      }
      if ((await stableDirectoryPresence(candidate)) === "absent") return null;
      cursor = candidate;
    }
    if (win32.normalize(cursor).toLowerCase() !== win32.normalize(expected).toLowerCase()) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    return expected;
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

function emptyLocalJournalState(): BscTestnetPtaWbnbPoolLocalJournalState {
  return stateFrom("empty", null);
}

function recoveryBlocked(): Readonly<{
  status: "blocked";
  journal: null;
  state: null;
  issue: Readonly<{ code: "RECOVERY_JOURNAL_INVALID"; message: string }>;
}> {
  return Object.freeze({
    status: "blocked" as const,
    journal: null,
    state: null,
    issue: Object.freeze({
      code: "RECOVERY_JOURNAL_INVALID" as const,
      message: "The existing signing journal could not be validated without mutation."
    })
  });
}

async function readBoundedFile(path: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, fileConstants.O_RDONLY);
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.size < 1n ||
      before.size > BigInt(MAXIMUM_RECORD_BYTES)
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.birthtimeNs !== after.birthtimeNs ||
      before.mode !== after.mode ||
      before.nlink !== after.nlink ||
      after.nlink !== 1n ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_CHANGED");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function verifyPaths(
  directory: string,
  files: readonly string[],
  slotFiles: readonly string[]
): Promise<void> {
  const directoryBefore = await lstat(directory, { bigint: true });
  const canonicalDirectory = await realpath(directory);
  const directoryAfter = await lstat(directory, { bigint: true });
  if (
    !directoryBefore.isDirectory() ||
    directoryBefore.isSymbolicLink() ||
    !directoryAfter.isDirectory() ||
    directoryAfter.isSymbolicLink() ||
    directoryBefore.dev !== directoryAfter.dev ||
    directoryBefore.ino !== directoryAfter.ino ||
    directoryBefore.birthtimeNs !== directoryAfter.birthtimeNs ||
    directoryBefore.ctimeNs !== directoryAfter.ctimeNs ||
    directoryBefore.mode !== directoryAfter.mode ||
    directoryBefore.nlink !== directoryAfter.nlink ||
    directoryAfter.nlink < 1n ||
    win32.normalize(canonicalDirectory).toLowerCase() !== directory.toLowerCase()
  ) {
    throw new Error("PTA_WBNB_POOL_JOURNAL_DIRECTORY_INVALID");
  }
  for (const name of files) {
    if (!slotFiles.some((allowed) => allowed === name)) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
    }
    const path = win32.join(directory, name);
    const before = await lstat(path, { bigint: true });
    const canonical = await realpath(path);
    const after = await lstat(path, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      !after.isFile() ||
      after.isSymbolicLink() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.birthtimeNs !== after.birthtimeNs ||
      before.mode !== after.mode ||
      before.nlink !== after.nlink ||
      after.nlink !== 1n ||
      win32.normalize(canonical).toLowerCase() !== path.toLowerCase()
    ) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
    }
  }
}

async function assertWindowsJournalSecure(
  directory: string,
  files: readonly string[],
  slotFiles: readonly string[]
): Promise<BscTestnetPtaWbnbPoolJournalSecurityMetadata> {
  await verifyPaths(directory, files, slotFiles);
  const input = Buffer.from(
    JSON.stringify({ paths: [directory, ...files.map((name) => win32.join(directory, name))] }),
    "utf8"
  );
  let output: Buffer | null = null;
  try {
    const controller = new AbortController();
    const result = await runPinnedPowerShellForInternalUse(
      ACL_PROBE_SCRIPT,
      input,
      512,
      controller.signal
    );
    output = result.output;
    const parsed = dataRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)));
    if (parsed === null || !securityMetadata(parsed, files.length + 1)) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_ACL_INVALID");
    }
    return parsed as unknown as BscTestnetPtaWbnbPoolJournalSecurityMetadata;
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function protectWindowsJournalRecord(directory: string, path: string): Promise<void> {
  const input = Buffer.from(JSON.stringify({ directory, file: path }), "utf8");
  let output: Buffer | null = null;
  try {
    const controller = new AbortController();
    const result = await runPinnedPowerShellForInternalUse(
      PROTECT_RECORD_SCRIPT,
      input,
      32,
      controller.signal
    );
    output = result.output;
    const record = dataRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)));
    if (record === null || !exactKeys(record, ["ok"]) || record.ok !== true) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_ACL_INVALID");
    }
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

function createWindowsAdapter(
  directory: string,
  generation: JournalGeneration
): BscTestnetPtaWbnbPoolLocalJournalCore {
  const slotFiles = slotFilesFor(generation);
  const createExclusiveRecord = async (
    name: string,
    contentFactory: () => string
  ): Promise<"created" | "exists"> => {
    if (!slotFiles.some((allowed) => allowed === name)) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
    }
    let handle;
    try {
      const path = win32.join(directory, name);
      handle = await open(path, "wx", 0o600);
      // For the predecessor fence, this callback captures time and derives bytes only after the
      // kernel has atomically reserved slot 2. A throw/crash leaves an empty or partial file that
      // every strict restart probe rejects; it is never deleted or overwritten.
      const content = contentFactory();
      await handle.writeFile(content, "utf8");
      await handle.sync();
      const retained = await handle.stat({ bigint: true });
      if (!retained.isFile() || retained.nlink !== 1n) {
        throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
      }
      await handle.close();
      handle = undefined;
      await protectWindowsJournalRecord(directory, path);
      await assertWindowsJournalSecure(directory, [name], slotFiles);
      return "created" as const;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return "exists" as const;
      throw error;
    } finally {
      await handle?.close().catch(() => undefined);
    }
  };
  return createBscTestnetPtaWbnbPoolLocalJournalCore(
    Object.freeze({
      now: () => new Date(),
      listNames: async () => {
        const entries = await readdir(directory, { withFileTypes: true });
        const names: string[] = [];
        for (const entry of entries) {
          if (!entry.isFile() || !slotFiles.some((allowed) => allowed === entry.name)) {
            throw new Error("PTA_WBNB_POOL_JOURNAL_DIRECTORY_CONTAMINATED");
          }
          names.push(entry.name);
        }
        return Object.freeze(names.sort());
      },
      readBounded: (name: string) => readBoundedFile(win32.join(directory, name)),
      createExclusive: (name: string, content: string) =>
        createExclusiveRecord(name, () => content),
      createExclusiveFenceFromFactory: (name: string, contentFactory: () => string) => {
        if (!isFenceableGeneration(generation) || name !== slotFiles[1]) {
          throw new Error("PTA_WBNB_POOL_JOURNAL_FILE_INVALID");
        }
        return createExclusiveRecord(name, contentFactory);
      },
      assertSecure: (files: readonly string[]) =>
        assertWindowsJournalSecure(directory, files, slotFiles)
    }),
    generation
  );
}

function activeJournalFacade(
  core: BscTestnetPtaWbnbPoolLocalJournalCore
): BscTestnetPtaWbnbPoolLocalJournal {
  return Object.freeze({
    claimExactInitialization: core.claimExactInitialization,
    authorizeWorker: core.authorizeWorker,
    failBeforeWorker: core.failBeforeWorker,
    startWorker: core.startWorker,
    consumeWorkerAuthorization: core.consumeWorkerAuthorization,
    commitWorkerSignedTransaction: core.commitWorkerSignedTransaction,
    failBeforeSubmission: core.failBeforeSubmission,
    recordUnknownOutcome: core.recordUnknownOutcome,
    readState: core.readState
  });
}

function activeRecoveryFacade(
  core: BscTestnetPtaWbnbPoolLocalJournalCore
): BscTestnetPtaWbnbPoolLocalJournalRecoveryReader {
  return Object.freeze({
    readState: core.readState,
    readStrictRecoveryState: core.readStrictRecoveryState
  });
}

function predecessorRecoveryFacade(
  core: BscTestnetPtaWbnbPoolLocalJournalCore
): BscTestnetPtaWbnbPoolPredecessorLocalJournalRecoveryReader {
  return Object.freeze({
    readState: core.readState,
    readStrictRecoveryState: core.readStrictRecoveryState,
    readExactTerminalRecoveryBinding: core.readExactTerminalRecoveryBinding
  });
}

function legacyRecoveryFacade(
  core: BscTestnetPtaWbnbPoolLocalJournalCore
): BscTestnetPtaWbnbPoolLegacyLocalJournalRecoveryReader {
  return Object.freeze({
    readClaimOnlyRecoveryCandidate: core.readClaimOnlyRecoveryCandidate,
    fenceClaimBeforeWorker: core.fenceClaimBeforeWorker,
    readState: core.readState,
    readStrictRecoveryState: core.readStrictRecoveryState
  });
}

type ExistingCoreJournalResult =
  | Readonly<{
      status: "absent";
      journal: null;
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>
  | Readonly<{
      status: "opened";
      journal: BscTestnetPtaWbnbPoolLocalJournalCore;
      state: BscTestnetPtaWbnbPoolLocalJournalState;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      journal: null;
      state: null;
      issue: Readonly<{ code: "RECOVERY_JOURNAL_INVALID"; message: string }>;
    }>;

async function openExistingLocalAtDirectory(
  directory: string,
  generation: JournalGeneration
): Promise<ExistingCoreJournalResult> {
  try {
    const slotFiles = slotFilesFor(generation);
    const names = (await readdir(directory, { withFileTypes: true })).map((entry) => {
      if (!entry.isFile() || !slotFiles.some((allowed) => allowed === entry.name)) {
        throw new Error("PTA_WBNB_POOL_JOURNAL_DIRECTORY_CONTAMINATED");
      }
      return entry.name;
    });
    await verifyPaths(directory, names, slotFiles);
    await assertWindowsJournalSecure(directory, names, slotFiles);
    if (names.length === 0) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const journal = createWindowsAdapter(directory, generation);
    const state = await journal.readStrictRecoveryState();
    return state === null
      ? recoveryBlocked()
      : Object.freeze({ status: "opened" as const, journal, state, issue: null });
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Fixed production composition. The caller cannot redirect it: Windows resolves its own current
 * user's LocalApplicationData folder through a pinned PowerShell probe, and
 * the adapter provisions and revalidates the fixed directory with a protected current-user-only ACL.
 */
export async function createWindowsBscTestnetPtaWbnbPoolLocalJournal(): Promise<BscTestnetPtaWbnbPoolLocalJournal> {
  if (process.platform !== "win32") throw new Error("PTA_WBNB_POOL_JOURNAL_WINDOWS_REQUIRED");
  const input = Buffer.alloc(0);
  let output: Buffer | null = null;
  let localApplicationData: unknown = null;
  try {
    const controller = new AbortController();
    const result = await runPinnedPowerShellForInternalUse(
      LOCAL_APPLICATION_DATA_PROBE_SCRIPT,
      input,
      1_024,
      controller.signal
    );
    output = result.output;
    const record = dataRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)));
    if (record === null || !exactKeys(record, ["localApplicationData"])) {
      throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
    }
    localApplicationData = record.localApplicationData;
  } finally {
    output?.fill(0);
  }
  const directory = expectedJournalDirectoryFromLocalAppData(
    localApplicationData,
    ACTIVE_JOURNAL_SUBDIRECTORY
  );
  if (directory === null) throw new Error("PTA_WBNB_POOL_JOURNAL_CONFIGURATION_INVALID");
  return activeJournalFacade(
    createWindowsAdapter(directory, BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION)
  );
}

/**
 * Opens only an already-existing fixed journal. It never creates a directory/file, changes an ACL,
 * reads custody, contacts RPC, or turns malformed retained bytes into an empty state.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedJournalDirectory(ACTIVE_JOURNAL_SUBDIRECTORY);
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const opened = await openExistingLocalAtDirectory(
      directory,
      BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
    );
    return opened.status === "opened"
      ? Object.freeze({ ...opened, journal: activeRecoveryFacade(opened.journal) })
      : opened;
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Opens the immutable generation-1 predecessor journal for read/fence recovery only. It never
 * provisions that namespace. A stale generation-1 worker therefore competes for the same slot-2
 * O_EXCL fence and cannot cross a retained supersession record.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolLegacyLocalJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedJournalDirectory(LEGACY_JOURNAL_SUBDIRECTORY);
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const opened = await openExistingLocalAtDirectory(directory, 1);
    return opened.status === "opened"
      ? Object.freeze({ ...opened, journal: legacyRecoveryFacade(opened.journal) })
      : opened;
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Opens immutable generation 2 for historical chain verification/fencing. This named seam is kept
 * separate from the current predecessor so advancing generations never changes the bytes parsed.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolGeneration2LocalJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedJournalDirectory(GENERATION_2_JOURNAL_SUBDIRECTORY);
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const opened = await openExistingLocalAtDirectory(
      directory,
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2
    );
    return opened.status === "opened"
      ? Object.freeze({ ...opened, journal: legacyRecoveryFacade(opened.journal) })
      : opened;
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Opens immutable generation 3 for historical chain verification/fencing.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolGeneration3LocalJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedJournalDirectory(GENERATION_3_JOURNAL_SUBDIRECTORY);
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const opened = await openExistingLocalAtDirectory(
      directory,
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3
    );
    return opened.status === "opened"
      ? Object.freeze({ ...opened, journal: legacyRecoveryFacade(opened.journal) })
      : opened;
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Opens immutable generation 4 for historical terminal-lineage verification only.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolGeneration4LocalJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedJournalDirectory(GENERATION_4_JOURNAL_SUBDIRECTORY);
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const opened = await openExistingLocalAtDirectory(
      directory,
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4
    );
    return opened.status === "opened"
      ? Object.freeze({ ...opened, journal: activeRecoveryFacade(opened.journal) })
      : opened;
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Opens immutable generation 5 for historical terminal-lineage verification only.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolGeneration5LocalJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedJournalDirectory(GENERATION_5_JOURNAL_SUBDIRECTORY);
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const opened = await openExistingLocalAtDirectory(
      directory,
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5
    );
    return opened.status === "opened"
      ? Object.freeze({ ...opened, journal: activeRecoveryFacade(opened.journal) })
      : opened;
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Opens immutable generation 6 for historical terminal-lineage verification only.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolGeneration6LocalJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedJournalDirectory(GENERATION_6_JOURNAL_SUBDIRECTORY);
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const opened = await openExistingLocalAtDirectory(
      directory,
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6
    );
    return opened.status === "opened"
      ? Object.freeze({ ...opened, journal: activeRecoveryFacade(opened.journal) })
      : opened;
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Opens immutable generation 7 for historical terminal-lineage verification only.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolGeneration7LocalJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedJournalDirectory(GENERATION_7_JOURNAL_SUBDIRECTORY);
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const opened = await openExistingLocalAtDirectory(
      directory,
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7
    );
    return opened.status === "opened"
      ? Object.freeze({ ...opened, journal: activeRecoveryFacade(opened.journal) })
      : opened;
  } catch {
    return recoveryBlocked();
  }
}

/**
 * Opens the immutable exact generation-8 failed-before-worker predecessor read-only. Its durable
 * two-slot terminal ordering proves no worker authorization/start/signature occurred. Submission
 * absence is established separately from the exact-empty submission-v7 namespace plus code
 * ordering; this facade deliberately exposes no fence or mutation method.
 */
export async function openExistingWindowsBscTestnetPtaWbnbPoolPredecessorLocalJournalForRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolExistingPredecessorLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  try {
    const directory = await readOnlyFixedJournalDirectory(PREDECESSOR_JOURNAL_SUBDIRECTORY);
    if (directory === null) {
      return Object.freeze({
        status: "absent" as const,
        journal: null,
        state: emptyLocalJournalState(),
        issue: null
      });
    }
    const opened = await openExistingLocalAtDirectory(
      directory,
      BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_GENERATION
    );
    return opened.status === "opened"
      ? Object.freeze({ ...opened, journal: predecessorRecoveryFacade(opened.journal) })
      : opened;
  } catch {
    return recoveryBlocked();
  }
}

/** Strict no-argument recovery probe over the fixed LocalAppData location. */
export async function probeWindowsBscTestnetPtaWbnbPoolLocalJournalRecoveryForInternalUse(): Promise<BscTestnetPtaWbnbPoolLocalJournalRecoveryProbeResult> {
  const opened =
    await openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalForRecoveryForInternalUse();
  return opened.status === "blocked"
    ? Object.freeze({
        status: "blocked" as const,
        presence: "unknown" as const,
        state: null,
        issue: opened.issue
      })
    : Object.freeze({
        status: "ready" as const,
        presence: opened.status === "opened" ? ("present" as const) : ("absent" as const),
        state: opened.state,
        issue: null
      });
}

/**
 * Read-only generation-9 raw-record fingerprint probe for the append-only signed-commit recovery.
 * It returns names, lengths and SHA-256 values only; retained transaction bytes never cross this
 * boundary. Exactly four occupied slots are required because generation 9 stopped at signed_commit.
 */
export async function probeWindowsBscTestnetPtaWbnbPoolGeneration9RecordHashesForInternalUse(): Promise<BscTestnetPtaWbnbPoolGeneration9RecordHashProbeResult> {
  const blocked = (): BscTestnetPtaWbnbPoolGeneration9RecordHashProbeResult =>
    Object.freeze({
      status: "blocked" as const,
      records: null,
      issue: Object.freeze({
        code: "GENERATION_9_RECORD_HASHES_INVALID" as const,
        message: "The exact generation-9 signing record fingerprints could not be verified."
      })
    });
  if (process.platform !== "win32") return blocked();
  try {
    const directory = await readOnlyFixedJournalDirectory(ACTIVE_JOURNAL_SUBDIRECTORY);
    if (directory === null) return blocked();
    const names = (await readdir(directory)).sort();
    const expected = ACTIVE_SLOT_FILES.slice(0, 4);
    if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
      return blocked();
    }
    await verifyPaths(directory, names, ACTIVE_SLOT_FILES);
    const records: Readonly<{ name: string; byteLength: number; sha256: Hex }>[] = [];
    for (const name of names) {
      const text = await readBoundedFile(win32.join(directory, name));
      if (text === null) return blocked();
      records.push(
        Object.freeze({
          name,
          byteLength: Buffer.byteLength(text, "utf8"),
          sha256: `0x${createHash("sha256").update(text, "utf8").digest("hex")}` as Hex
        })
      );
    }
    return Object.freeze({
      status: "ready" as const,
      records: Object.freeze(records),
      issue: null
    });
  } catch {
    return blocked();
  }
}

/** Test-only no-write recovery seam over a caller-created synthetic directory. */
export async function openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(
  untrustedDirectory: unknown
): Promise<BscTestnetPtaWbnbPoolExistingLegacyLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  if (
    typeof untrustedDirectory !== "string" ||
    untrustedDirectory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(untrustedDirectory) ||
    untrustedDirectory.includes("/") ||
    win32.normalize(untrustedDirectory) !== untrustedDirectory
  ) {
    return recoveryBlocked();
  }
  const directory = resolve(untrustedDirectory);
  if (!isOutsideRepository(directory)) {
    return recoveryBlocked();
  }
  const opened = await openExistingLocalAtDirectory(directory, 1);
  return opened.status === "opened"
    ? Object.freeze({ ...opened, journal: legacyRecoveryFacade(opened.journal) })
    : opened;
}

/** Test-only active-generation no-write recovery seam over a caller-created temp directory. */
export async function openExistingWindowsBscTestnetPtaWbnbPoolActiveLocalJournalAtSyntheticDirectoryForTests(
  untrustedDirectory: unknown
): Promise<BscTestnetPtaWbnbPoolExistingLocalJournalResult> {
  if (process.platform !== "win32") return recoveryBlocked();
  if (
    typeof untrustedDirectory !== "string" ||
    untrustedDirectory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(untrustedDirectory) ||
    untrustedDirectory.includes("/") ||
    win32.normalize(untrustedDirectory) !== untrustedDirectory
  ) {
    return recoveryBlocked();
  }
  const directory = resolve(untrustedDirectory);
  if (!isOutsideRepository(directory)) {
    return recoveryBlocked();
  }
  const opened = await openExistingLocalAtDirectory(
    directory,
    BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION
  );
  return opened.status === "opened"
    ? Object.freeze({ ...opened, journal: activeRecoveryFacade(opened.journal) })
    : opened;
}
