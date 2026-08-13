import "server-only";

import { isProxy } from "node:util/types";

import { keccak256, stringToHex, type Hex } from "viem";

import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import { BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN } from "./bsc-testnet-pta-wbnb-pool-initialization";
import { acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse } from "./bsc-testnet-pta-wbnb-pool-production-rpc.server";
import {
  deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse,
  type BscTestnetPtaWbnbPoolSubmissionCapability,
  type BscTestnetPtaWbnbPoolSubmissionJournalState
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY,
  createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse,
  type BscTestnetPtaWbnbPoolDurableSubmissionJournal,
  type BscTestnetPtaWbnbPoolDurableOwnerV2Policy,
  type BscTestnetPtaWbnbPoolSubmissionRecoveryState
} from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";
import {
  authenticateBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse,
  type BscTestnetPtaWbnbPoolNativeProductionBridge
} from "./bsc-testnet-pta-wbnb-pool-signing-worker";

const BROADCAST_OPERATION =
  "consume_exact_bsc_testnet_pta_wbnb_pool_broadcast_authorization_after_durable_start" as const;
const TERMINAL_PREFLIGHT_DIGEST_DOMAIN =
  "proofera.bsc-testnet.pta-wbnb-pool.terminal-pre-send.v1" as const;
const MAXIMUM_RPC_RESPONSE_BYTES = 32_768;
const RPC_TIMEOUT_MILLISECONDS = 8_000;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const ARM_INPUT_KEYS = ["gasLimit", "gasPriceWei", "transactionHash"] as const;
const PRE_SUBMISSION_KEYS = [
  "candidateCode",
  "candidateNonce",
  "canonicalFinalizedBlockVerified",
  "corroboratorOrigin",
  "factoryPoolForward",
  "factoryPoolReverse",
  "finalizedAnchorDualProviderExactNumberVerified",
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
const JOURNAL_STATE_KEYS = [
  "claimId",
  "envelopeHash",
  "operationKey",
  "ownerAuthorizationDigest",
  "releaseCommit",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "schemaVersion",
  "signedTransactionKeccak256",
  "signingHash",
  "state",
  "submissionStartedDigest",
  "transactionHash"
] as const;

export interface BscTestnetPtaWbnbPoolExactBroadcastAuthorizationRequest {
  readonly schemaVersion: 1;
  readonly operation: typeof BROADCAST_OPERATION;
  readonly operationKey: typeof BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY;
  readonly claimId: string;
  readonly envelopeHash: Hex;
  readonly releaseCommit: string;
  readonly runtimeManifestSha256: Hex;
  readonly reviewerApprovalDigest: Hex;
  readonly ownerAuthorizationDigest: Hex;
  readonly signingHash: Hex;
  readonly transactionHash: Hex;
  readonly signedTransactionKeccak256: Hex;
  readonly submissionStartedDigest: Hex;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
  readonly signedTransaction: Hex;
  readonly terminalPreSubmissionObservedAt: string;
  readonly terminalPreSubmissionDigest: Hex;
}

export interface BscTestnetPtaWbnbPoolPrivateBroadcaster {
  /** Arms one exact journal-bound post-ack recheck inside this closure. */
  readonly acquireTerminalPreSendRecheck: (
    executionCapability: unknown,
    input: Readonly<{ transactionHash: Hex; gasLimit: string; gasPriceWei: string }>
  ) => Promise<BscTestnetPtaWbnbPoolSubmissionCapability["preSubmission"]>;
  /** Consumes authority and sends only the capability/raw bytes armed by the preceding method. */
  readonly sendExactRawTransactionOnce: (
    executionCapability: unknown,
    signedTransaction: Hex
  ) => Promise<Hex>;
}

export type BscTestnetPtaWbnbPoolPrivateBroadcastFailureCode =
  | "PRIVATE_BROADCASTER_CONFIGURATION_INVALID"
  | "PRIVATE_BROADCASTER_ALREADY_USED"
  | "PRIVATE_BROADCASTER_NOT_ARMED"
  | "DURABLE_SUBMISSION_STATE_INVALID"
  | "OWNER_AUTHORIZATION_EXPIRED"
  | "TERMINAL_PRE_SEND_RECHECK_FAILED"
  | "TERMINAL_PRE_SEND_RECHECK_INVALID"
  | "PRIVATE_BROADCAST_AUTHORITY_REJECTED"
  | "PRIVATE_BROADCAST_OUTCOME_UNKNOWN";

export class BscTestnetPtaWbnbPoolPrivateBroadcastFailure extends Error {
  override readonly name = "BscTestnetPtaWbnbPoolPrivateBroadcastFailure";
  readonly retryBroadcastAllowed = false as const;
  readonly code: BscTestnetPtaWbnbPoolPrivateBroadcastFailureCode;
  readonly submissionOutcomeUnknown: boolean;

  constructor(
    code: BscTestnetPtaWbnbPoolPrivateBroadcastFailureCode,
    submissionOutcomeUnknown = false
  ) {
    super("The exact BSC testnet PTA/WBNB private broadcast failed closed.");
    this.code = code;
    this.submissionOutcomeUnknown = submissionOutcomeUnknown;
  }
}

type FixedBridge = BscTestnetPtaWbnbPoolNativeProductionBridge &
  Readonly<{
    consumeExactBroadcastAuthorizationAfterDurableStart: (
      capability: unknown,
      request: BscTestnetPtaWbnbPoolExactBroadcastAuthorizationRequest
    ) => boolean;
  }>;

type ReadJournal = Readonly<{
  readRecoveryState: () => Promise<BscTestnetPtaWbnbPoolSubmissionRecoveryState>;
  readState: () => Promise<unknown>;
}>;

type PrivateDependencies = Readonly<{
  now: () => Date;
  journal: ReadJournal;
  acquireTerminalPreflight: (
    input: Readonly<{ transactionHash: Hex; gasLimit: string; gasPriceWei: string }>
  ) => Promise<unknown>;
  consumeBroadcastAuthority: (
    capability: unknown,
    request: BscTestnetPtaWbnbPoolExactBroadcastAuthorizationRequest
  ) => boolean;
  sendFixedRawTransaction: (signedTransaction: Hex, expectedHash: Hex) => Promise<Hex>;
}>;

function exactNow(clock: () => Date): Date | null {
  try {
    const value = Reflect.apply(clock, undefined, []);
    if (
      isProxy(value) ||
      !(value instanceof Date) ||
      Object.getPrototypeOf(value) !== Date.prototype ||
      Reflect.ownKeys(value).length !== 0
    ) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? new Date(milliseconds) : null;
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

function sameRecordValues(
  left: Readonly<Record<string, unknown>> | null,
  right: unknown,
  keys: readonly string[]
): boolean {
  const rightSnapshot = snapshotPlainRecord(right, keys);
  return (
    left !== null && rightSnapshot !== null && keys.every((key) => left[key] === rightSnapshot[key])
  );
}

function snapshotPlainRecord(
  input: unknown,
  expectedKeys: readonly string[],
  requireFrozen = false
): Readonly<Record<string, unknown>> | null {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      isProxy(input) ||
      (requireFrozen && !Object.isFrozen(input))
    ) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(input);
    const sorted = [...expectedKeys].sort();
    if (
      keys.some((key) => typeof key !== "string") ||
      keys.length !== sorted.length ||
      (keys as string[]).sort().some((key, index) => key !== sorted[index])
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const snapshot: Record<string, unknown> = {};
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

function snapshotPreSubmission(
  input: unknown
): BscTestnetPtaWbnbPoolSubmissionCapability["preSubmission"] | null {
  return snapshotPlainRecord(input, PRE_SUBMISSION_KEYS, true) as
    BscTestnetPtaWbnbPoolSubmissionCapability["preSubmission"] | null;
}

function exactOwnerPolicy(value: unknown): value is BscTestnetPtaWbnbPoolDurableOwnerV2Policy {
  return sameJson(value, BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY);
}

function startedState(
  derived: BscTestnetPtaWbnbPoolSubmissionJournalState
): BscTestnetPtaWbnbPoolSubmissionJournalState {
  return Object.freeze({ ...derived, state: "submission_started" as const });
}

function terminalCapability(
  capability: BscTestnetPtaWbnbPoolSubmissionCapability,
  preSubmission: unknown
): unknown {
  return Object.freeze({ ...capability, preSubmission });
}

function authorizationRequest(
  capability: BscTestnetPtaWbnbPoolSubmissionCapability,
  journalState: BscTestnetPtaWbnbPoolSubmissionJournalState,
  terminalPreSubmission: BscTestnetPtaWbnbPoolSubmissionCapability["preSubmission"]
): BscTestnetPtaWbnbPoolExactBroadcastAuthorizationRequest {
  return Object.freeze({
    schemaVersion: 1 as const,
    operation: BROADCAST_OPERATION,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: capability.claimId,
    envelopeHash: capability.envelopeHash,
    releaseCommit: capability.releaseCommit,
    runtimeManifestSha256: capability.runtimeManifestSha256,
    reviewerApprovalDigest: capability.reviewerApprovalDigest,
    ownerAuthorizationDigest: capability.ownerAuthorizationDigest,
    signingHash: capability.transaction.signingHash,
    transactionHash: capability.transaction.transactionHash,
    signedTransactionKeccak256: keccak256(capability.transaction.signedTransaction),
    submissionStartedDigest: journalState.submissionStartedDigest,
    authenticatedAt: capability.authenticatedAt,
    expiresAt: capability.expiresAt,
    signedTransaction: capability.transaction.signedTransaction,
    terminalPreSubmissionObservedAt: terminalPreSubmission.observedAt,
    terminalPreSubmissionDigest: keccak256(
      stringToHex(
        `${TERMINAL_PREFLIGHT_DIGEST_DOMAIN}\u0000${JSON.stringify(terminalPreSubmission)}`
      )
    )
  });
}

function createPrivateBroadcaster(
  dependencies: PrivateDependencies
): BscTestnetPtaWbnbPoolPrivateBroadcaster {
  let acquisitionAttempted = false;
  let sendAttempted = false;
  let armed: Readonly<{
    executionCapability: unknown;
    capability: BscTestnetPtaWbnbPoolSubmissionCapability;
    request: BscTestnetPtaWbnbPoolExactBroadcastAuthorizationRequest;
    originalExpiry: number;
  }> | null = null;
  return Object.freeze({
    async acquireTerminalPreSendRecheck(
      executionCapability: unknown,
      input: Readonly<{ transactionHash: Hex; gasLimit: string; gasPriceWei: string }>
    ): Promise<BscTestnetPtaWbnbPoolSubmissionCapability["preSubmission"]> {
      if (acquisitionAttempted) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("PRIVATE_BROADCASTER_ALREADY_USED");
      }
      acquisitionAttempted = true;

      const initialNow = exactNow(dependencies.now);
      if (initialNow === null) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("DURABLE_SUBMISSION_STATE_INVALID");
      }
      let recovery: BscTestnetPtaWbnbPoolSubmissionRecoveryState;
      let rawJournalState: unknown;
      try {
        [recovery, rawJournalState] = await Promise.all([
          dependencies.journal.readRecoveryState(),
          dependencies.journal.readState()
        ]);
      } catch {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("DURABLE_SUBMISSION_STATE_INVALID");
      }
      if (
        recovery.state !== "submission_started" ||
        recovery.journalEvidenceOnly !== true ||
        recovery.authorityReauthenticationRequired !== true ||
        recovery.sendingAuthorizedByJournal !== false ||
        !exactOwnerPolicy(recovery.ownerAuthorizationPolicy)
      ) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("DURABLE_SUBMISSION_STATE_INVALID");
      }
      const capability = recovery.capability;
      const armInput = snapshotPlainRecord(input, ARM_INPUT_KEYS, true);
      if (
        armInput === null ||
        armInput.transactionHash !== capability.transaction.transactionHash ||
        armInput.gasLimit !== capability.transaction.gasLimit ||
        armInput.gasPriceWei !== capability.transaction.gasPriceWei
      ) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("DURABLE_SUBMISSION_STATE_INVALID");
      }
      const originalExpiry = Date.parse(capability.expiresAt);
      if (!Number.isSafeInteger(originalExpiry) || initialNow.getTime() >= originalExpiry) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("OWNER_AUTHORIZATION_EXPIRED");
      }
      const derived = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
        capability,
        initialNow
      );
      const journalSnapshot = snapshotPlainRecord(rawJournalState, JOURNAL_STATE_KEYS, true);
      if (
        derived === null ||
        !sameRecordValues(journalSnapshot, startedState(derived), JOURNAL_STATE_KEYS)
      ) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("DURABLE_SUBMISSION_STATE_INVALID");
      }

      let rawTerminalPreflight: unknown;
      try {
        rawTerminalPreflight = await dependencies.acquireTerminalPreflight(
          Object.freeze({
            transactionHash: capability.transaction.transactionHash,
            gasLimit: capability.transaction.gasLimit,
            gasPriceWei: capability.transaction.gasPriceWei
          })
        );
      } catch {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("TERMINAL_PRE_SEND_RECHECK_FAILED");
      }
      const afterPreflight = exactNow(dependencies.now);
      if (afterPreflight === null || afterPreflight.getTime() >= originalExpiry) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("OWNER_AUTHORIZATION_EXPIRED");
      }
      const terminalPreSubmission = snapshotPreSubmission(rawTerminalPreflight);
      if (terminalPreSubmission === null) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("TERMINAL_PRE_SEND_RECHECK_INVALID");
      }
      const terminalDerived = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
        terminalCapability(capability, terminalPreSubmission),
        afterPreflight
      );
      if (
        terminalDerived === null ||
        terminalDerived.submissionStartedDigest !== derived.submissionStartedDigest
      ) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("TERMINAL_PRE_SEND_RECHECK_INVALID");
      }
      const observedAt = Date.parse(terminalPreSubmission.observedAt);
      if (
        !Number.isSafeInteger(observedAt) ||
        observedAt < initialNow.getTime() ||
        observedAt > afterPreflight.getTime()
      ) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("TERMINAL_PRE_SEND_RECHECK_INVALID");
      }
      const request = authorizationRequest(capability, derived, terminalPreSubmission);
      armed = Object.freeze({ executionCapability, capability, request, originalExpiry });
      return terminalPreSubmission;
    },
    async sendExactRawTransactionOnce(
      executionCapability: unknown,
      signedTransaction: Hex
    ): Promise<Hex> {
      if (sendAttempted) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("PRIVATE_BROADCASTER_ALREADY_USED");
      }
      if (armed === null) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("PRIVATE_BROADCASTER_NOT_ARMED");
      }
      sendAttempted = true;
      const retained = armed;
      armed = null;
      if (
        executionCapability !== retained.executionCapability ||
        signedTransaction !== retained.capability.transaction.signedTransaction
      ) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure(
          "PRIVATE_BROADCAST_AUTHORITY_REJECTED"
        );
      }
      const beforeConsumption = exactNow(dependencies.now);
      if (beforeConsumption === null || beforeConsumption.getTime() >= retained.originalExpiry) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("OWNER_AUTHORIZATION_EXPIRED");
      }
      let authorityConsumed = false;
      try {
        authorityConsumed =
          dependencies.consumeBroadcastAuthority(executionCapability, retained.request) === true;
      } catch {
        authorityConsumed = false;
      }
      if (!authorityConsumed) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure(
          "PRIVATE_BROADCAST_AUTHORITY_REJECTED"
        );
      }
      const immediatelyBeforeSend = exactNow(dependencies.now);
      if (
        immediatelyBeforeSend === null ||
        immediatelyBeforeSend.getTime() < beforeConsumption.getTime() ||
        immediatelyBeforeSend.getTime() >= retained.originalExpiry
      ) {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure("OWNER_AUTHORIZATION_EXPIRED");
      }
      try {
        const result = await dependencies.sendFixedRawTransaction(
          retained.capability.transaction.signedTransaction,
          retained.capability.transaction.transactionHash
        );
        if (result !== retained.capability.transaction.transactionHash) {
          throw new Error("RPC_RESULT_MISMATCH");
        }
        return result;
      } catch {
        throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure(
          "PRIVATE_BROADCAST_OUTCOME_UNKNOWN",
          true
        );
      }
    }
  });
}

async function readBoundedRpcResponse(response: Response): Promise<unknown> {
  if (!response.ok || response.body === null) throw new Error("RPC_TRANSPORT_FAILED");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) throw new Error("RPC_TRANSPORT_FAILED");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM_RPC_RESPONSE_BYTES) throw new Error("RPC_RESPONSE_TOO_LARGE");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } finally {
    bytes.fill(0);
  }
}

async function sendFixedRawTransaction(signedTransaction: Hex, expectedHash: Hex): Promise<Hex> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MILLISECONDS);
  timer.unref?.();
  try {
    const response = await fetch(BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: Object.freeze({ accept: "application/json", "content-type": "application/json" }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendRawTransaction",
        params: [signedTransaction]
      }),
      signal: controller.signal
    });
    if (
      response.url !== BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN &&
      response.url !== `${BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN}/`
    ) {
      throw new Error("RPC_REDIRECTED");
    }
    const envelope = await readBoundedRpcResponse(response);
    if (
      envelope === null ||
      typeof envelope !== "object" ||
      Array.isArray(envelope) ||
      isProxy(envelope) ||
      Object.getPrototypeOf(envelope) !== Object.prototype
    ) {
      throw new Error("RPC_RESPONSE_INVALID");
    }
    const record = envelope as Record<string, unknown>;
    if (
      Reflect.ownKeys(record).length !== 3 ||
      record.jsonrpc !== "2.0" ||
      record.id !== 1 ||
      record.result !== expectedHash ||
      typeof record.result !== "string" ||
      !BYTES32.test(record.result)
    ) {
      throw new Error("RPC_RESPONSE_INVALID");
    }
    return expectedHash;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Production-only factory. The bridge brand is authenticated by the fixed signing-worker module;
 * callers cannot inject an authenticator, journal, RPC origin, expected hash, or transport. The
 * core-provided raw bytes must exactly match the journal bytes retained during the arm phase.
 */
export async function createBscTestnetPtaWbnbPoolPrivateBroadcasterForInternalUse(
  nativeBridge: unknown
): Promise<
  Readonly<{
    submissionJournal: BscTestnetPtaWbnbPoolDurableSubmissionJournal;
    broadcaster: BscTestnetPtaWbnbPoolPrivateBroadcaster;
  }>
> {
  if (!authenticateBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse(nativeBridge)) {
    throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure(
      "PRIVATE_BROADCASTER_CONFIGURATION_INVALID"
    );
  }
  const bridge = nativeBridge as FixedBridge;
  if (typeof bridge.consumeExactBroadcastAuthorizationAfterDurableStart !== "function") {
    throw new BscTestnetPtaWbnbPoolPrivateBroadcastFailure(
      "PRIVATE_BROADCASTER_CONFIGURATION_INVALID"
    );
  }
  const journal = await createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse();
  const broadcaster = createPrivateBroadcaster(
    Object.freeze({
      now: () => new Date(),
      journal,
      acquireTerminalPreflight: acquireBscTestnetPtaWbnbPoolProductionPreSubmissionForInternalUse,
      consumeBroadcastAuthority: (capability, request) =>
        bridge.consumeExactBroadcastAuthorizationAfterDurableStart(capability, request),
      sendFixedRawTransaction
    })
  );
  return Object.freeze({ submissionJournal: journal, broadcaster });
}

export interface BscTestnetPtaWbnbPoolPrivateBroadcasterTestScenario {
  readonly now: string;
  readonly recoveryState: BscTestnetPtaWbnbPoolSubmissionRecoveryState;
  readonly journalState: unknown;
  readonly terminalPreSubmission: unknown;
  readonly authorityOutcome: "accept" | "reject";
  readonly transportOutcome: "exact_hash" | "wrong_hash" | "throw";
}

/** Synthetic-only realm: plain outcomes only, no authenticator/transport/RPC callback injection. */
export function createBscTestnetPtaWbnbPoolPrivateBroadcasterTestRealmForTests(
  scenario: BscTestnetPtaWbnbPoolPrivateBroadcasterTestScenario
): Readonly<{
  broadcaster: BscTestnetPtaWbnbPoolPrivateBroadcaster;
  executionCapability: object;
  audit: () => Readonly<{ preflightCalls: number; authorityCalls: number; transportCalls: number }>;
}> {
  const executionCapability = Object.freeze(Object.create(null) as object);
  let preflightCalls = 0;
  let authorityCalls = 0;
  let transportCalls = 0;
  let authorityConsumed = false;
  const broadcaster = createPrivateBroadcaster(
    Object.freeze({
      now: () => new Date(scenario.now),
      journal: Object.freeze({
        readRecoveryState: async () => scenario.recoveryState,
        readState: async () => scenario.journalState
      }),
      acquireTerminalPreflight: async () => {
        preflightCalls += 1;
        return scenario.terminalPreSubmission;
      },
      consumeBroadcastAuthority: (candidate) => {
        authorityCalls += 1;
        if (
          authorityConsumed ||
          scenario.authorityOutcome !== "accept" ||
          candidate !== executionCapability
        ) {
          authorityConsumed = true;
          return false;
        }
        authorityConsumed = true;
        return true;
      },
      sendFixedRawTransaction: async (_signedTransaction, expectedHash) => {
        transportCalls += 1;
        if (scenario.transportOutcome === "throw") throw new Error("synthetic ambiguity");
        return scenario.transportOutcome === "exact_hash"
          ? expectedHash
          : (`0x${"99".repeat(32)}` as Hex);
      }
    })
  );
  return Object.freeze({
    broadcaster,
    executionCapability,
    audit: () => Object.freeze({ preflightCalls, authorityCalls, transportCalls })
  });
}
