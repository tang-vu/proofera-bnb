import "server-only";

import { isProxy } from "node:util/types";

import type { Hex } from "viem";

import {
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_HASH_DOMAIN,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_BYTES,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96,
  BSC_TESTNET_WBNB_ADDRESS,
  calculateBscTestnetPtaWbnbPoolGasLimit,
  deriveBscTestnetPtaWbnbPoolInitializationEnvelopeHash,
  type BscTestnetPtaWbnbPoolInitializationEnvelope,
  type BscTestnetPtaWbnbPoolInitializationEnvelopeBody
} from "./bsc-testnet-pta-wbnb-pool-initialization";

export type BscTestnetPtaWbnbPoolOneShotJournalState =
  "claimed" | "signed" | "submitted" | "confirmed" | "failed_before_submission" | "unknown_outcome";

export interface BscTestnetPtaWbnbPoolOneShotExactBinding {
  readonly chainId: typeof BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID;
  readonly from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
  readonly nonce: typeof BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE;
  readonly to: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
  readonly selector: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR;
  readonly data: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA;
  readonly dataKeccak256: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256;
  readonly valueWei: 0n;
  readonly gasLimit: bigint;
  readonly gasPriceWei: bigint;
}

/**
 * Legacy preparation-only receipt shape. It is non-authorizing: the executable generation-6 path
 * obtains a separately branded owner-v9 intent outside this module, and copied JSON/digests here
 * cannot substitute for that authority.
 */
export interface BscTestnetPtaWbnbPoolExternalAuthorizationReceipt {
  readonly kind: "exact_pta_wbnb_pool_initialization_user_authorization_v1";
  readonly envelopeHash: Hex;
  readonly authorizedAt: string;
  readonly expiresAt: string;
  readonly receiptSha256: Hex;
}

export interface BscTestnetPtaWbnbPoolAtomicClaimRequest {
  readonly operationKey: Hex;
  readonly envelopeHash: Hex;
  readonly authorizationReceipt: BscTestnetPtaWbnbPoolExternalAuthorizationReceipt;
  readonly exactBinding: BscTestnetPtaWbnbPoolOneShotExactBinding;
  readonly envelopeExpiresAt: string;
}

export type BscTestnetPtaWbnbPoolAtomicClaimResult =
  | Readonly<{
      status: "claimed";
      durableClaimId: string;
      claimedAt: string;
      previousClaimExisted: false;
    }>
  | Readonly<{
      status: "already_claimed";
      durableClaimId: string;
      state: BscTestnetPtaWbnbPoolOneShotJournalState;
    }>
  | Readonly<{ status: "unavailable" }>;

/**
 * Specification-only future durable journal contract. No implementation is present or accepted by
 * this module, and structural TypeScript compatibility is not evidence of runtime conformance.
 */
export interface BscTestnetPtaWbnbPoolFutureDurableOneShotJournalContract {
  atomicClaimExactInitialization(
    request: BscTestnetPtaWbnbPoolAtomicClaimRequest
  ): Promise<BscTestnetPtaWbnbPoolAtomicClaimResult>;
  compareAndSetExactInitializationState(
    input: Readonly<{
      durableClaimId: string;
      operationKey: Hex;
      expectedState: BscTestnetPtaWbnbPoolOneShotJournalState;
      nextState: BscTestnetPtaWbnbPoolOneShotJournalState;
      evidenceDigest: Hex;
      observedAt: string;
    }>
  ): Promise<"updated" | "state_mismatch" | "unavailable">;
  readExactInitializationByOperationKey(operationKey: Hex): Promise<
    | Readonly<{
        durableClaimId: string;
        state: BscTestnetPtaWbnbPoolOneShotJournalState;
        transactionHash: Hex | null;
      }>
    | null
    | "unavailable"
  >;
}

/**
 * Specification-only future exact-operation signer contract. No implementation is present or
 * accepted by this module; it deliberately has no arbitrary address/data signing method.
 */
export interface BscTestnetPtaWbnbPoolFutureExactOneShotSignerContract {
  signClaimedExactInitialization(
    input: Readonly<{
      durableClaimId: string;
      operationKey: Hex;
      envelopeHash: Hex;
      authorizationReceiptSha256: Hex;
      exactBinding: BscTestnetPtaWbnbPoolOneShotExactBinding;
    }>
  ): Promise<
    | Readonly<{
        status: "signed";
        serializedTransaction: Hex;
        transactionHash: Hex;
      }>
    | Readonly<{ status: "refused" }>
  >;
}

export interface BscTestnetPtaWbnbPoolOneShotPreparedDescriptor {
  readonly status: "prepared_non_authorizing";
  readonly operationKey: Hex;
  readonly envelopeHash: Hex;
  readonly envelopeObservedAt: string;
  readonly exactBinding: BscTestnetPtaWbnbPoolOneShotExactBinding;
  readonly envelopeExpiresAt: string;
  readonly signingReady: false;
  readonly signingAuthorized: false;
  readonly executionAuthorized: false;
  readonly authorizationReceiptCreated: false;
  readonly journalClaimCreated: false;
  readonly signerInvoked: false;
  readonly signatureCreated: false;
  readonly transactionSubmitted: false;
  readonly requirements: Readonly<{
    externalExactAuthorizationRequired: true;
    durableAtomicClaimRequiredBeforeCustodyAccess: true;
    freshPendingNonceAndPoolRecheckRequiredAfterClaim: true;
    ambiguousClaimOrSigningOutcomeIsNonRetryableUntilReconciled: true;
    journalMustPersistSignedBytesBeforeSubmission: true;
    postSubmissionCanonicalReceiptReconciliationRequired: true;
  }>;
}

export type BscTestnetPtaWbnbPoolOneShotDescriptorResult =
  | BscTestnetPtaWbnbPoolOneShotPreparedDescriptor
  | Readonly<{
      status: "blocked";
      reason: "invalid_envelope" | "invalid_clock" | "expired_envelope";
      signingReady: false;
      signingAuthorized: false;
      executionAuthorized: false;
      journalClaimCreated: false;
      signerInvoked: false;
      transactionSubmitted: false;
    }>;

function canonicalUnsignedDecimal(value: unknown, maximum: bigint): bigint | null {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= maximum ? parsed : null;
  } catch {
    return null;
  }
}

function plainFrozenRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  try {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !isProxy(value) &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.isFrozen(value)
    );
  } catch {
    return false;
  }
}

function exactOwnDataKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return false;
    const sorted = (keys as string[]).sort();
    const expectedSorted = [...expected].sort();
    if (
      sorted.length !== expectedSorted.length ||
      sorted.some((key, index) => key !== expectedSorted[index])
    ) {
      return false;
    }
    return expected.every((key) => {
      const descriptor = descriptors[key];
      return descriptor?.enumerable === true && "value" in descriptor;
    });
  } catch {
    return false;
  }
}

function inspectedEnvelope(value: unknown): BscTestnetPtaWbnbPoolInitializationEnvelope | null {
  if (
    !plainFrozenRecord(value) ||
    !exactOwnDataKeys(value, [
      "schemaVersion",
      "operation",
      "chainId",
      "transaction",
      "initializer",
      "observation",
      "caps",
      "expiresAt",
      "raceBoundary",
      "authorization",
      "envelopeHash"
    ])
  ) {
    return null;
  }
  const envelope = value as unknown as BscTestnetPtaWbnbPoolInitializationEnvelope;
  if (
    !plainFrozenRecord(envelope.transaction) ||
    !exactOwnDataKeys(envelope.transaction, [
      "from",
      "to",
      "nonce",
      "data",
      "dataBytes",
      "dataKeccak256",
      "selector",
      "valueWei",
      "gasLimit",
      "gasPriceWei"
    ]) ||
    !plainFrozenRecord(envelope.initializer) ||
    !exactOwnDataKeys(envelope.initializer, [
      "token0",
      "token1",
      "fee",
      "sqrtPriceX96",
      "expectedPool",
      "priceMeaning"
    ]) ||
    !plainFrozenRecord(envelope.observation) ||
    !exactOwnDataKeys(envelope.observation, [
      "observedAt",
      "finalizedBlockNumber",
      "finalizedBlockHash",
      "finalizedBlockTimestamp",
      "latestNonce",
      "pendingNonce",
      "pendingPool",
      "providerAgreementVerified",
      "allRuntimeIdentitiesVerified",
      "allEip1967SlotsZero",
      "allProtocolBindingsVerified",
      "candidateCode",
      "candidateNonce",
      "feeTierVerified",
      "simulationReturnPool",
      "gasEstimate"
    ]) ||
    !plainFrozenRecord(envelope.caps) ||
    !exactOwnDataKeys(envelope.caps, [
      "gasMarginBps",
      "maximumGasEstimate",
      "maximumGasLimit",
      "maximumGasPriceWei",
      "maximumTotalCostWei",
      "boundedMaximumCostWei"
    ]) ||
    !plainFrozenRecord(envelope.raceBoundary) ||
    !exactOwnDataKeys(envelope.raceBoundary, [
      "initializerHasNoDeadline",
      "publicMempoolCanRace",
      "sameNonceReplacementCanRace",
      "freshPendingRecheckRequiredAfterDurableClaim",
      "postReceiptPoolCreatedReconciliationRequired",
      "envelopeDoesNotReservePoolAddress"
    ]) ||
    !plainFrozenRecord(envelope.authorization) ||
    !exactOwnDataKeys(envelope.authorization, [
      "signingReady",
      "signingAuthorized",
      "executionAuthorized",
      "secretRead",
      "signerCreated",
      "signatureCreated",
      "transactionSubmitted",
      "blockchainWritePerformed"
    ])
  ) {
    return null;
  }
  const gasLimit = canonicalUnsignedDecimal(
    envelope.transaction.gasLimit,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT
  );
  const gasPrice = canonicalUnsignedDecimal(
    envelope.transaction.gasPriceWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI
  );
  const boundedCost = canonicalUnsignedDecimal(
    envelope.caps.boundedMaximumCostWei,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI
  );
  const gasEstimate = canonicalUnsignedDecimal(
    envelope.observation.gasEstimate,
    BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE
  );
  const expiresMilliseconds = Date.parse(envelope.expiresAt);
  const observedMilliseconds = Date.parse(envelope.observation.observedAt);
  if (
    envelope.schemaVersion !== 2 ||
    envelope.operation !== "create_and_initialize_exact_pta_wbnb_pancake_v3_pool_once" ||
    envelope.chainId !== "97" ||
    envelope.transaction.from !== BSC_TESTNET_PTA_WBNB_POOL_SENDER ||
    envelope.transaction.to !== BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER ||
    envelope.transaction.nonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL ||
    envelope.transaction.selector !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR ||
    envelope.transaction.data !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA ||
    envelope.transaction.dataBytes !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_BYTES ||
    envelope.transaction.dataKeccak256 !== BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256 ||
    envelope.transaction.valueWei !== "0" ||
    gasLimit === null ||
    gasLimit === 0n ||
    gasPrice === null ||
    gasPrice === 0n ||
    boundedCost === null ||
    boundedCost !== gasLimit * gasPrice ||
    gasEstimate === null ||
    calculateBscTestnetPtaWbnbPoolGasLimit(gasEstimate) !== gasLimit ||
    envelope.initializer.token0 !== BSC_TESTNET_PTA_ADDRESS ||
    envelope.initializer.token1 !== BSC_TESTNET_WBNB_ADDRESS ||
    envelope.initializer.fee !== "500" ||
    envelope.initializer.sqrtPriceX96 !== BSC_TESTNET_PTA_WBNB_POOL_SQRT_PRICE_X96.toString() ||
    envelope.initializer.expectedPool !== BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE ||
    envelope.initializer.priceMeaning !==
      "fixed_test_scenario_not_market_price_oracle_peg_or_valuation" ||
    !/^0x[0-9a-f]{64}$/u.test(envelope.observation.finalizedBlockHash) ||
    !/^[1-9][0-9]*$/u.test(envelope.observation.finalizedBlockNumber) ||
    !/^[1-9][0-9]*$/u.test(envelope.observation.finalizedBlockTimestamp) ||
    envelope.observation.latestNonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL ||
    envelope.observation.pendingNonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL ||
    envelope.observation.pendingPool !== "0x0000000000000000000000000000000000000000" ||
    envelope.observation.candidateCode !== "0x" ||
    envelope.observation.candidateNonce !== "0" ||
    envelope.observation.providerAgreementVerified !== true ||
    envelope.observation.allRuntimeIdentitiesVerified !== true ||
    envelope.observation.allEip1967SlotsZero !== true ||
    envelope.observation.allProtocolBindingsVerified !== true ||
    envelope.observation.feeTierVerified !== true ||
    envelope.observation.simulationReturnPool !== BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE ||
    !Number.isSafeInteger(observedMilliseconds) ||
    !Number.isSafeInteger(expiresMilliseconds) ||
    expiresMilliseconds - observedMilliseconds !==
      BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_LIFETIME_SECONDS * 1_000 ||
    envelope.caps.gasMarginBps !== "2000" ||
    envelope.caps.maximumGasEstimate !== "5000000" ||
    envelope.caps.maximumGasLimit !== "6000000" ||
    envelope.caps.maximumGasPriceWei !== "3000000000" ||
    envelope.caps.maximumTotalCostWei !== "18000000000000000" ||
    envelope.raceBoundary.initializerHasNoDeadline !== true ||
    envelope.raceBoundary.publicMempoolCanRace !== true ||
    envelope.raceBoundary.sameNonceReplacementCanRace !== true ||
    envelope.raceBoundary.freshPendingRecheckRequiredAfterDurableClaim !== true ||
    envelope.raceBoundary.postReceiptPoolCreatedReconciliationRequired !== true ||
    envelope.raceBoundary.envelopeDoesNotReservePoolAddress !== true ||
    envelope.authorization.signingReady !== false ||
    envelope.authorization.signingAuthorized !== false ||
    envelope.authorization.executionAuthorized !== false ||
    envelope.authorization.secretRead !== false ||
    envelope.authorization.signerCreated !== false ||
    envelope.authorization.signatureCreated !== false ||
    envelope.authorization.transactionSubmitted !== false ||
    envelope.authorization.blockchainWritePerformed !== false
  ) {
    return null;
  }
  const body: BscTestnetPtaWbnbPoolInitializationEnvelopeBody = {
    schemaVersion: envelope.schemaVersion,
    operation: envelope.operation,
    chainId: envelope.chainId,
    transaction: envelope.transaction,
    initializer: envelope.initializer,
    observation: envelope.observation,
    caps: envelope.caps,
    expiresAt: envelope.expiresAt,
    raceBoundary: envelope.raceBoundary,
    authorization: envelope.authorization
  };
  if (envelope.envelopeHash !== deriveBscTestnetPtaWbnbPoolInitializationEnvelopeHash(body)) {
    return null;
  }
  return envelope;
}

/**
 * Creates only a non-authorizing descriptor. It accepts no signer, journal, custody, transport, or
 * broadcast dependency, so calling it cannot claim, sign, or submit anything.
 */
export function describeBscTestnetPtaWbnbPoolOneShotBoundary(
  envelopeValue: unknown,
  now: () => Date
): BscTestnetPtaWbnbPoolOneShotDescriptorResult {
  const envelope = inspectedEnvelope(envelopeValue);
  if (envelope === null) {
    return Object.freeze({
      status: "blocked" as const,
      reason: "invalid_envelope" as const,
      signingReady: false as const,
      signingAuthorized: false as const,
      executionAuthorized: false as const,
      journalClaimCreated: false as const,
      signerInvoked: false as const,
      transactionSubmitted: false as const
    });
  }
  let currentMilliseconds: number;
  try {
    if (typeof now !== "function" || isProxy(now)) throw new TypeError("invalid clock");
    const functionPrototype = Object.getPrototypeOf(now);
    if (
      functionPrototype !== Function.prototype &&
      Object.getPrototypeOf(functionPrototype) !== Function.prototype
    ) {
      throw new TypeError("invalid clock");
    }
    const date = now();
    if (
      isProxy(date) ||
      !(date instanceof Date) ||
      Object.getPrototypeOf(date) !== Date.prototype ||
      Reflect.ownKeys(date).length !== 0
    ) {
      throw new TypeError("invalid clock");
    }
    currentMilliseconds = Date.prototype.getTime.call(date);
  } catch {
    currentMilliseconds = Number.NaN;
  }
  const expiresMilliseconds = Date.parse(envelope.expiresAt);
  if (!Number.isSafeInteger(currentMilliseconds) || currentMilliseconds < 0) {
    return Object.freeze({
      status: "blocked" as const,
      reason: "invalid_clock" as const,
      signingReady: false as const,
      signingAuthorized: false as const,
      executionAuthorized: false as const,
      journalClaimCreated: false as const,
      signerInvoked: false as const,
      transactionSubmitted: false as const
    });
  }
  if (!Number.isSafeInteger(expiresMilliseconds) || expiresMilliseconds <= currentMilliseconds) {
    return Object.freeze({
      status: "blocked" as const,
      reason: "expired_envelope" as const,
      signingReady: false as const,
      signingAuthorized: false as const,
      executionAuthorized: false as const,
      journalClaimCreated: false as const,
      signerInvoked: false as const,
      transactionSubmitted: false as const
    });
  }
  // The one-shot key binds the irreversible pool-creation operation and its immutable predecessor
  // lineage, not a refreshable observation envelope or a sender nonce that can advance before an
  // unused recovery generation signs. The exact nonce remains separately bound below.
  const operationKey = BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  const exactBinding: BscTestnetPtaWbnbPoolOneShotExactBinding = Object.freeze({
    chainId: BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
    from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
    nonce: BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    selector: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_SELECTOR,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
    valueWei: 0n,
    gasLimit: BigInt(envelope.transaction.gasLimit),
    gasPriceWei: BigInt(envelope.transaction.gasPriceWei)
  });
  return Object.freeze({
    status: "prepared_non_authorizing" as const,
    operationKey,
    envelopeHash: envelope.envelopeHash,
    envelopeObservedAt: envelope.observation.observedAt,
    exactBinding,
    envelopeExpiresAt: envelope.expiresAt,
    signingReady: false as const,
    signingAuthorized: false as const,
    executionAuthorized: false as const,
    authorizationReceiptCreated: false as const,
    journalClaimCreated: false as const,
    signerInvoked: false as const,
    signatureCreated: false as const,
    transactionSubmitted: false as const,
    requirements: Object.freeze({
      externalExactAuthorizationRequired: true as const,
      durableAtomicClaimRequiredBeforeCustodyAccess: true as const,
      freshPendingNonceAndPoolRecheckRequiredAfterClaim: true as const,
      ambiguousClaimOrSigningOutcomeIsNonRetryableUntilReconciled: true as const,
      journalMustPersistSignedBytesBeforeSubmission: true as const,
      postSubmissionCanonicalReceiptReconciliationRequired: true as const
    })
  });
}

// The envelope domain is intentionally referenced here so future seam changes cannot silently
// reinterpret an envelope from another domain.
void BSC_TESTNET_PTA_WBNB_POOL_ENVELOPE_HASH_DOMAIN;
