import "server-only";

import { isProxy } from "node:util/types";

import type { Address, Hex } from "viem";

import {
  BSC_TESTNET_PANCAKE_V3_FACTORY,
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE,
  BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_POST_RECHECK_EXECUTION_RESERVE_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  BSC_TESTNET_WBNB_ADDRESS,
  calculateBscTestnetPtaWbnbPoolGasLimit
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS,
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCHEMA_VERSION,
  BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse,
  type BscTestnetPtaWbnbPoolAuthorizedSigningIntent,
  type BscTestnetPtaWbnbPoolFreshRecheckCapability
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

const UINT256_MAX = (1n << 256n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_WORD = `0x${"00".repeat(32)}` as Hex;
const GET_POOL_SELECTOR = "0x1698ee82" as const;
const MAXIMUM_JSON_NODES = 512;
const MAXIMUM_JSON_DEPTH = 12;

function abiWord(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function addressWord(address: Address): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

const GET_POOL_DATA = `${GET_POOL_SELECTOR}${addressWord(BSC_TESTNET_PTA_ADDRESS)}${addressWord(
  BSC_TESTNET_WBNB_ADDRESS
)}${abiWord(500n)}` as Hex;

type RpcBlockTag = "finalized" | "latest" | "pending" | Hex;
type RpcCanonicalBlock = Readonly<{ blockHash: Hex; requireCanonical: true }>;
type RpcStateSelector = RpcBlockTag | RpcCanonicalBlock;
type RpcCall = Readonly<{
  to: Address;
  data: Hex;
}>;
type RpcInitializationCall = Readonly<{
  from: typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER;
  to: typeof BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER;
  data: typeof BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA;
  value: "0x0";
  gas: Hex;
  gasPrice: Hex;
}>;

export type BscTestnetPtaWbnbPoolPostClaimRpcRequest =
  | Readonly<{ method: "eth_chainId"; params: readonly [] }>
  | Readonly<{
      method: "eth_getBlockByNumber";
      params: readonly [RpcBlockTag, false];
    }>
  | Readonly<{
      method: "eth_getBalance";
      params: readonly [typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest"];
    }>
  | Readonly<{
      method: "eth_getTransactionCount";
      params: readonly [typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest" | "pending"];
    }>
  | Readonly<{
      method: "eth_getCode";
      params: readonly [
        typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE | typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER,
        RpcStateSelector
      ];
    }>
  | Readonly<{
      method: "eth_call";
      params: readonly [RpcCall, RpcStateSelector];
    }>
  | Readonly<{
      method: "eth_call";
      params: readonly [RpcInitializationCall, "pending"];
    }>
  | Readonly<{ method: "eth_gasPrice"; params: readonly [] }>
  | Readonly<{
      method: "eth_estimateGas";
      params: readonly [RpcInitializationCall];
    }>;

export interface BscTestnetPtaWbnbPoolPostClaimRpcClient {
  readonly origin:
    | typeof BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN
    | typeof BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN;
  readonly request: (request: BscTestnetPtaWbnbPoolPostClaimRpcRequest) => Promise<unknown>;
}

export interface BscTestnetPtaWbnbPoolPostClaimRecheckInput {
  readonly authorizedIntent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
  readonly claimId: string;
}

export interface BscTestnetPtaWbnbPoolPostClaimRecheckDependenciesForTests {
  readonly primaryClient: BscTestnetPtaWbnbPoolPostClaimRpcClient;
  readonly corroboratorClient: BscTestnetPtaWbnbPoolPostClaimRpcClient;
  readonly now: () => Date;
  readonly authenticateAuthorizedIntent: (intent: unknown) => boolean;
  readonly issueJournalClaimToken: () => Hex;
}

export type BscTestnetPtaWbnbPoolPostClaimRecheckIssueCode =
  | "CONFIGURATION_INVALID"
  | "PRODUCTION_AUTHORIZATION_UNAVAILABLE"
  | "INPUT_INVALID"
  | "AUTHORIZATION_AUTHENTICATION_FAILED"
  | "CLOCK_INVALID"
  | "AUTHORIZATION_EXPIRED"
  | "AUTHORIZATION_RESERVE_INSUFFICIENT"
  | "RPC_REQUEST_FAILED"
  | "MALFORMED_RPC_RESPONSE"
  | "CHAIN_MISMATCH"
  | "PROVIDER_DISAGREEMENT"
  | "FINALIZED_BLOCK_IN_FUTURE"
  | "FINALIZED_BLOCK_STALE"
  | "RECHECK_WINDOW_EXCEEDED"
  | "RECHECK_EXECUTION_RESERVE_EXHAUSTED"
  | "NONCE_MISMATCH"
  | "POOL_ALREADY_EXISTS_OR_RACED"
  | "SENDER_NOT_EOA"
  | "SIMULATION_MISMATCH"
  | "GAS_POLICY_VIOLATION"
  | "INSUFFICIENT_BALANCE"
  | "CAPABILITY_ISSUANCE_FAILED";

export type BscTestnetPtaWbnbPoolPostClaimRecheckStage =
  | "configuration"
  | "input"
  | "clock"
  | "chain"
  | "block"
  | "canonical_state"
  | "pending_state"
  | "simulation"
  | "capability";

export interface BscTestnetPtaWbnbPoolPostClaimRecheckIssue {
  readonly code: BscTestnetPtaWbnbPoolPostClaimRecheckIssueCode;
  readonly stage: BscTestnetPtaWbnbPoolPostClaimRecheckStage;
  readonly message: string;
}

const STATIC_BOUNDARY = Object.freeze({
  scope: "exact_pta_wbnb_pool_recovery_generation_5_after_atomic_claim_dual_rpc_recheck" as const,
  environment: "bsc-testnet" as const,
  chainId: "97" as const,
  primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  fixedOfficialRpcOriginsOnly: true as const,
  eip1898RequireCanonical: true as const,
  fallbackUsed: false as const,
  environmentRead: false as const,
  custodyRead: false as const,
  secretRead: false as const,
  journalWritePerformed: false as const,
  signerCreated: false as const,
  signatureCreated: false as const,
  transactionSubmitted: false as const,
  blockchainWritePerformed: false as const,
  genericRpcClientAcceptedByProduction: false as const,
  productionAuthorizationIssuerPresent: false as const,
  authenticatedAuthorizedIntentRequiredBeforeRpc: true as const
});

export interface BscTestnetPtaWbnbPoolPostClaimRecheckBoundary extends Readonly<
  typeof STATIC_BOUNDARY
> {
  readonly rpcReadPerformed: boolean;
}

export type BscTestnetPtaWbnbPoolPostClaimRecheckResult =
  | Readonly<{
      status: "verified";
      capability: BscTestnetPtaWbnbPoolFreshRecheckCapability;
      issue: null;
      boundary: BscTestnetPtaWbnbPoolPostClaimRecheckBoundary;
    }>
  | Readonly<{
      status: "blocked";
      capability: null;
      issue: BscTestnetPtaWbnbPoolPostClaimRecheckIssue;
      boundary: BscTestnetPtaWbnbPoolPostClaimRecheckBoundary;
    }>;

export interface BscTestnetPtaWbnbPoolPostClaimRechecker {
  readonly boundary: BscTestnetPtaWbnbPoolPostClaimRecheckBoundary;
  readonly recheck: (input: unknown) => Promise<BscTestnetPtaWbnbPoolPostClaimRecheckResult>;
  readonly authenticateFreshPostClaimRecheck: (capability: unknown) => boolean;
}

type DataRecord = Readonly<Record<string, unknown>>;

function boundary(rpcReadPerformed: boolean): BscTestnetPtaWbnbPoolPostClaimRecheckBoundary {
  return Object.freeze({ ...STATIC_BOUNDARY, rpcReadPerformed });
}

function blocked(
  code: BscTestnetPtaWbnbPoolPostClaimRecheckIssueCode,
  stage: BscTestnetPtaWbnbPoolPostClaimRecheckStage,
  message: string,
  rpcReadPerformed: boolean
): BscTestnetPtaWbnbPoolPostClaimRecheckResult {
  return Object.freeze({
    status: "blocked" as const,
    capability: null,
    issue: Object.freeze({ code, stage, message }),
    boundary: boundary(rpcReadPerformed)
  });
}

function inspectExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  requireFrozen = false
): DataRecord | null {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      isProxy(value) ||
      (requireFrozen && !Object.isFrozen(value))
    ) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return null;
    const actual = (keys as string[]).sort();
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

function strictJsonSnapshot(
  value: unknown,
  seen = new WeakSet<object>(),
  budget = { remaining: MAXIMUM_JSON_NODES },
  depth = 0
): unknown | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (
    typeof value !== "object" ||
    isProxy(value) ||
    seen.has(value) ||
    depth > MAXIMUM_JSON_DEPTH ||
    budget.remaining-- <= 0
  ) {
    return null;
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 64) return null;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Reflect.ownKeys(value);
      const expected = [
        ...Array.from({ length: value.length }, (_entry, index) => index.toString()),
        "length"
      ];
      if (
        keys.some((key) => typeof key !== "string") ||
        keys.length !== expected.length ||
        expected.some((key) => !Object.hasOwn(descriptors, key))
      ) {
        return null;
      }
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[index.toString()];
        if (
          descriptor === undefined ||
          descriptor.enumerable !== true ||
          !("value" in descriptor)
        ) {
          return null;
        }
        const captured = strictJsonSnapshot(descriptor.value, seen, budget, depth + 1);
        if (captured === null && descriptor.value !== null) return null;
        output.push(captured);
      }
      return output;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length > 64 || keys.some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
        return null;
      }
      const captured = strictJsonSnapshot(descriptor.value, seen, budget, depth + 1);
      if (captured === null && descriptor.value !== null) return null;
      output[key] = captured;
    }
    return Object.freeze(output);
  } catch {
    return null;
  } finally {
    seen.delete(value);
  }
}

function exactCallable(value: unknown): value is (...arguments_: never[]) => unknown {
  try {
    if (typeof value !== "function" || isProxy(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return (
      prototype === Function.prototype ||
      (prototype !== null && Object.getPrototypeOf(prototype) === Function.prototype)
    );
  } catch {
    return false;
  }
}

function captureDate(
  value: unknown
): { readonly iso: string; readonly milliseconds: number } | null {
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
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0
      ? Object.freeze({ iso: new Date(milliseconds).toISOString(), milliseconds })
      : null;
  } catch {
    return null;
  }
}

function captureClock(
  clock: () => Date
): { readonly iso: string; readonly milliseconds: number } | null {
  try {
    return captureDate(Reflect.apply(clock, undefined, []));
  } catch {
    return null;
  }
}

function canonicalUtc(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
}

function parseQuantity(value: unknown, maximum = UINT256_MAX): bigint | null {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= maximum ? parsed : null;
  } catch {
    return null;
  }
}

function parseBytes(value: unknown): Hex | null {
  return typeof value === "string" && /^0x(?:[0-9a-f]{2})*$/u.test(value) ? (value as Hex) : null;
}

function parseWord(value: unknown): Hex | null {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/u.test(value) ? (value as Hex) : null;
}

function parseAddressWord(value: unknown): Address | null {
  const word = parseWord(value);
  return word !== null && word.slice(2, 26) === "0".repeat(24)
    ? (`0x${word.slice(26)}` as Address)
    : null;
}

function exactNonzeroHex32(value: unknown): Hex | null {
  const parsed = parseWord(value);
  return parsed !== null && parsed !== ZERO_WORD ? parsed : null;
}

function exactClaimId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
    ? value
    : null;
}

interface BlockObservation {
  readonly number: bigint;
  readonly hash: Hex;
  readonly timestamp: bigint;
  readonly gasLimit: bigint;
}

function parseBlock(value: unknown): BlockObservation | null {
  const snapshot = strictJsonSnapshot(value);
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const record = snapshot as DataRecord;
  const number = parseQuantity(record.number, UINT64_MAX);
  const hash = exactNonzeroHex32(record.hash);
  const timestamp = parseQuantity(record.timestamp, UINT64_MAX);
  const gasLimit = parseQuantity(record.gasLimit, UINT64_MAX);
  return number !== null &&
    number > 0n &&
    hash !== null &&
    timestamp !== null &&
    timestamp > 0n &&
    gasLimit !== null &&
    gasLimit > 0n
    ? Object.freeze({ number, hash, timestamp, gasLimit })
    : null;
}

function sameBlock(left: BlockObservation, right: BlockObservation): boolean {
  return (
    left.number === right.number &&
    left.hash === right.hash &&
    left.timestamp === right.timestamp &&
    left.gasLimit === right.gasLimit
  );
}

function freezeParams<Value extends readonly unknown[]>(params: Value): Value {
  return Object.freeze(params) as Value;
}

function freezeRequest<Request extends BscTestnetPtaWbnbPoolPostClaimRpcRequest>(
  request: Request
): Request {
  return Object.freeze(request);
}

function getPoolRequest(selector: RpcStateSelector): BscTestnetPtaWbnbPoolPostClaimRpcRequest {
  const call = Object.freeze({ to: BSC_TESTNET_PANCAKE_V3_FACTORY, data: GET_POOL_DATA });
  return freezeRequest({ method: "eth_call" as const, params: freezeParams([call, selector]) });
}

function getCodeRequest(
  address: typeof BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE | typeof BSC_TESTNET_PTA_WBNB_POOL_SENDER,
  selector: RpcStateSelector
): BscTestnetPtaWbnbPoolPostClaimRpcRequest {
  return freezeRequest({
    method: "eth_getCode" as const,
    params: freezeParams([address, selector])
  });
}

function inspectDependencies(
  value: unknown
): BscTestnetPtaWbnbPoolPostClaimRecheckDependenciesForTests | null {
  const root = inspectExactRecord(value, [
    "authenticateAuthorizedIntent",
    "corroboratorClient",
    "issueJournalClaimToken",
    "now",
    "primaryClient"
  ]);
  const primary = root && inspectExactRecord(root.primaryClient, ["origin", "request"]);
  const corroborator = root && inspectExactRecord(root.corroboratorClient, ["origin", "request"]);
  if (
    root === null ||
    primary === null ||
    corroborator === null ||
    primary.origin !== BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN ||
    corroborator.origin !== BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN ||
    !exactCallable(primary.request) ||
    !exactCallable(corroborator.request) ||
    !exactCallable(root.now) ||
    !exactCallable(root.authenticateAuthorizedIntent) ||
    !exactCallable(root.issueJournalClaimToken)
  ) {
    return null;
  }
  return Object.freeze({
    primaryClient: Object.freeze({
      origin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
      request: primary.request as BscTestnetPtaWbnbPoolPostClaimRpcClient["request"]
    }),
    corroboratorClient: Object.freeze({
      origin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
      request: corroborator.request as BscTestnetPtaWbnbPoolPostClaimRpcClient["request"]
    }),
    now: root.now as () => Date,
    authenticateAuthorizedIntent: root.authenticateAuthorizedIntent as (intent: unknown) => boolean,
    issueJournalClaimToken: root.issueJournalClaimToken as () => Hex
  });
}

function inspectInput(value: unknown): Readonly<{
  authorizedIntent: BscTestnetPtaWbnbPoolAuthorizedSigningIntent;
  untrustedAuthorizedIntent: unknown;
  claimId: string;
}> | null {
  const root = inspectExactRecord(value, ["authorizedIntent", "claimId"], true);
  if (root === null) return null;
  const intent = parseBscTestnetPtaWbnbPoolAuthorizedSigningIntentForInternalUse(
    root.authorizedIntent
  );
  const claimId = exactClaimId(root.claimId);
  return intent !== null && claimId !== null
    ? Object.freeze({
        authorizedIntent: intent,
        untrustedAuthorizedIntent: root.authorizedIntent,
        claimId
      })
    : null;
}

async function requestOne(
  client: BscTestnetPtaWbnbPoolPostClaimRpcClient,
  request: BscTestnetPtaWbnbPoolPostClaimRpcRequest
): Promise<unknown> {
  return Reflect.apply(client.request, undefined, [request]);
}

async function requestPair(
  primary: BscTestnetPtaWbnbPoolPostClaimRpcClient,
  corroborator: BscTestnetPtaWbnbPoolPostClaimRpcClient,
  request: BscTestnetPtaWbnbPoolPostClaimRpcRequest
): Promise<readonly [unknown, unknown]> {
  return Promise.all([requestOne(primary, request), requestOne(corroborator, request)]);
}

interface CurrentObservation {
  readonly balance: bigint;
  readonly latestNonce: bigint;
  readonly pendingNonce: bigint;
  readonly latestPool: Address;
  readonly pendingPool: Address;
  readonly latestCandidateCode: Hex;
  readonly pendingCandidateCode: Hex;
  readonly latestSenderCode: Hex;
  readonly pendingSenderCode: Hex;
  readonly gasPrice: bigint;
  readonly simulationPool: Address;
  readonly gasEstimate: bigint;
}

function parseCurrent(values: readonly unknown[]): CurrentObservation | null {
  if (values.length !== 12) return null;
  const balance = parseQuantity(values[0]);
  const latestNonce = parseQuantity(values[1], UINT64_MAX);
  const pendingNonce = parseQuantity(values[2], UINT64_MAX);
  const latestPool = parseAddressWord(values[3]);
  const pendingPool = parseAddressWord(values[4]);
  const latestCandidateCode = parseBytes(values[5]);
  const pendingCandidateCode = parseBytes(values[6]);
  const latestSenderCode = parseBytes(values[7]);
  const pendingSenderCode = parseBytes(values[8]);
  const gasPrice = parseQuantity(values[9]);
  const simulationPool = parseAddressWord(values[10]);
  const gasEstimate = parseQuantity(values[11]);
  return balance !== null &&
    latestNonce !== null &&
    pendingNonce !== null &&
    latestPool !== null &&
    pendingPool !== null &&
    latestCandidateCode !== null &&
    pendingCandidateCode !== null &&
    latestSenderCode !== null &&
    pendingSenderCode !== null &&
    gasPrice !== null &&
    simulationPool !== null &&
    gasEstimate !== null
    ? Object.freeze({
        balance,
        latestNonce,
        pendingNonce,
        latestPool,
        pendingPool,
        latestCandidateCode,
        pendingCandidateCode,
        latestSenderCode,
        pendingSenderCode,
        gasPrice,
        simulationPool,
        gasEstimate
      })
    : null;
}

function sameCurrent(left: CurrentObservation, right: CurrentObservation): boolean {
  return (Object.keys(left) as (keyof CurrentObservation)[]).every(
    (key) => left[key] === right[key]
  );
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function invalidRechecker(
  code: "CONFIGURATION_INVALID" | "PRODUCTION_AUTHORIZATION_UNAVAILABLE",
  message: string
): BscTestnetPtaWbnbPoolPostClaimRechecker {
  const result = blocked(code, "configuration", message, false);
  const staticBoundary = boundary(false);
  return Object.freeze({
    boundary: staticBoundary,
    recheck: () => Promise.resolve(result),
    authenticateFreshPostClaimRecheck: () => false
  });
}

/**
 * Production is deliberately unavailable until the fixed dual-RPC reader and its authorization
 * composition receive independent review. This no-argument constructor cannot accept a client.
 */
export function createBscTestnetPtaWbnbPoolProductionPostClaimRechecker(): BscTestnetPtaWbnbPoolPostClaimRechecker {
  return invalidRechecker(
    "PRODUCTION_AUTHORIZATION_UNAVAILABLE",
    "The production post-claim capability issuer is unavailable in this release."
  );
}

/** Read-only deterministic harness. Only this explicitly test-scoped constructor accepts ports. */
function createBscTestnetPtaWbnbPoolPostClaimRechecker(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolPostClaimRechecker {
  const dependencies = inspectDependencies(untrustedDependencies);
  if (dependencies === null) {
    return invalidRechecker(
      "CONFIGURATION_INVALID",
      "Post-claim recheck requires exact own-data, non-proxy test ports."
    );
  }
  const brandedCapabilities = new WeakSet<object>();

  const recheck = async (
    untrustedInput: unknown
  ): Promise<BscTestnetPtaWbnbPoolPostClaimRecheckResult> => {
    let rpcReadPerformed = false;
    try {
      const input = inspectInput(untrustedInput);
      if (input === null) {
        return blocked(
          "INPUT_INVALID",
          "input",
          "The exact frozen claim binding is invalid.",
          false
        );
      }
      let intentAuthenticated = false;
      try {
        intentAuthenticated =
          Reflect.apply(dependencies.authenticateAuthorizedIntent, undefined, [
            input.untrustedAuthorizedIntent
          ]) === true;
      } catch {
        intentAuthenticated = false;
      }
      if (!intentAuthenticated) {
        return blocked(
          "AUTHORIZATION_AUTHENTICATION_FAILED",
          "input",
          "The parsed intent lacks the authorization gate's private object capability.",
          false
        );
      }
      const started = captureClock(dependencies.now);
      if (started === null) {
        return blocked("CLOCK_INVALID", "clock", "The post-claim clock is invalid.", false);
      }
      const authorizedExpiry = canonicalUtc(input.authorizedIntent.expiresAt);
      if (authorizedExpiry === null || authorizedExpiry <= started.milliseconds) {
        return blocked(
          "AUTHORIZATION_EXPIRED",
          "input",
          "The exact owner authorization expired before the post-claim read.",
          false
        );
      }
      const recheckNotAfterMilliseconds = Math.min(
        started.milliseconds + BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS * 1_000,
        authorizedExpiry - BSC_TESTNET_PTA_WBNB_POOL_POST_RECHECK_EXECUTION_RESERVE_SECONDS * 1_000
      );
      if (recheckNotAfterMilliseconds <= started.milliseconds) {
        return blocked(
          "AUTHORIZATION_RESERVE_INSUFFICIENT",
          "clock",
          "The post-claim read cannot preserve the exact post-recheck execution reserve.",
          false
        );
      }

      rpcReadPerformed = true;
      const chainRequest = freezeRequest({
        method: "eth_chainId" as const,
        params: freezeParams([])
      });
      const [primaryChainRaw, corroboratorChainRaw] = await requestPair(
        dependencies.primaryClient,
        dependencies.corroboratorClient,
        chainRequest
      );
      const primaryChain = parseQuantity(primaryChainRaw);
      const corroboratorChain = parseQuantity(corroboratorChainRaw);
      if (primaryChain === null || corroboratorChain === null) {
        return blocked(
          "MALFORMED_RPC_RESPONSE",
          "chain",
          "A chain-id response was not a canonical JSON-RPC quantity.",
          true
        );
      }
      if (
        primaryChain !== BigInt(BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID) ||
        corroboratorChain !== BigInt(BSC_TESTNET_PTA_WBNB_POOL_CHAIN_ID)
      ) {
        return blocked("CHAIN_MISMATCH", "chain", "Both endpoints must report chain 97.", true);
      }

      const finalizedRequest = freezeRequest({
        method: "eth_getBlockByNumber" as const,
        params: freezeParams(["finalized" as const, false as const])
      });
      const [primaryHeadRaw, corroboratorHeadRaw] = await requestPair(
        dependencies.primaryClient,
        dependencies.corroboratorClient,
        finalizedRequest
      );
      const primaryHead = parseBlock(primaryHeadRaw);
      const corroboratorHead = parseBlock(corroboratorHeadRaw);
      if (primaryHead === null || corroboratorHead === null) {
        return blocked(
          "MALFORMED_RPC_RESPONSE",
          "block",
          "A finalized block response was not strict JSON own data with canonical fields.",
          true
        );
      }
      const commonNumber =
        primaryHead.number < corroboratorHead.number ? primaryHead.number : corroboratorHead.number;
      const commonNumberHex = `0x${commonNumber.toString(16)}` as Hex;
      const commonRequest = freezeRequest({
        method: "eth_getBlockByNumber" as const,
        params: freezeParams([commonNumberHex, false as const])
      });
      const [primaryBlockRaw, corroboratorBlockRaw] = await requestPair(
        dependencies.primaryClient,
        dependencies.corroboratorClient,
        commonRequest
      );
      const primaryBlock = parseBlock(primaryBlockRaw);
      const corroboratorBlock = parseBlock(corroboratorBlockRaw);
      if (primaryBlock === null || corroboratorBlock === null) {
        return blocked(
          "MALFORMED_RPC_RESPONSE",
          "block",
          "The common finalized block response was malformed.",
          true
        );
      }
      if (
        primaryBlock.number !== commonNumber ||
        corroboratorBlock.number !== commonNumber ||
        !sameBlock(primaryBlock, corroboratorBlock) ||
        (primaryHead.number === commonNumber && !sameBlock(primaryHead, primaryBlock)) ||
        (corroboratorHead.number === commonNumber &&
          !sameBlock(corroboratorHead, corroboratorBlock))
      ) {
        return blocked(
          "PROVIDER_DISAGREEMENT",
          "block",
          "The endpoints did not agree on one canonical common finalized block.",
          true
        );
      }

      const canonicalSelector = Object.freeze({
        blockHash: primaryBlock.hash,
        requireCanonical: true as const
      });
      const canonicalRequests = Object.freeze([
        getPoolRequest(canonicalSelector),
        getCodeRequest(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, canonicalSelector),
        getCodeRequest(BSC_TESTNET_PTA_WBNB_POOL_SENDER, canonicalSelector)
      ]);
      const [primaryCanonicalRaw, corroboratorCanonicalRaw] = await Promise.all([
        Promise.all(
          canonicalRequests.map((request) => requestOne(dependencies.primaryClient, request))
        ),
        Promise.all(
          canonicalRequests.map((request) => requestOne(dependencies.corroboratorClient, request))
        )
      ]);
      const primaryCanonical = Object.freeze({
        pool: parseAddressWord(primaryCanonicalRaw[0]),
        candidateCode: parseBytes(primaryCanonicalRaw[1]),
        senderCode: parseBytes(primaryCanonicalRaw[2])
      });
      const corroboratorCanonical = Object.freeze({
        pool: parseAddressWord(corroboratorCanonicalRaw[0]),
        candidateCode: parseBytes(corroboratorCanonicalRaw[1]),
        senderCode: parseBytes(corroboratorCanonicalRaw[2])
      });
      if (
        primaryCanonical.pool === null ||
        primaryCanonical.candidateCode === null ||
        primaryCanonical.senderCode === null ||
        corroboratorCanonical.pool === null ||
        corroboratorCanonical.candidateCode === null ||
        corroboratorCanonical.senderCode === null
      ) {
        return blocked(
          "MALFORMED_RPC_RESPONSE",
          "canonical_state",
          "A canonical EIP-1898 state response was malformed.",
          true
        );
      }
      if (
        primaryCanonical.pool !== corroboratorCanonical.pool ||
        primaryCanonical.candidateCode !== corroboratorCanonical.candidateCode ||
        primaryCanonical.senderCode !== corroboratorCanonical.senderCode
      ) {
        return blocked(
          "PROVIDER_DISAGREEMENT",
          "canonical_state",
          "The endpoints disagreed on canonical pool or account state.",
          true
        );
      }
      if (primaryCanonical.pool !== ZERO_ADDRESS || primaryCanonical.candidateCode !== "0x") {
        return blocked(
          "POOL_ALREADY_EXISTS_OR_RACED",
          "canonical_state",
          "The exact pool or candidate code already exists at the common checkpoint.",
          true
        );
      }
      if (primaryCanonical.senderCode !== "0x") {
        return blocked(
          "SENDER_NOT_EOA",
          "canonical_state",
          "The exact sender has code at the common finalized checkpoint.",
          true
        );
      }

      const transactionGas = BigInt(input.authorizedIntent.transaction.gasLimit);
      const transactionGasPrice = BigInt(input.authorizedIntent.transaction.gasPriceWei);
      const initializationCall = Object.freeze({
        from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
        to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
        data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
        value: "0x0" as const,
        gas: `0x${transactionGas.toString(16)}` as Hex,
        gasPrice: `0x${transactionGasPrice.toString(16)}` as Hex
      });
      const currentRequests = Object.freeze([
        freezeRequest({
          method: "eth_getBalance" as const,
          params: freezeParams([BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest" as const])
        }),
        freezeRequest({
          method: "eth_getTransactionCount" as const,
          params: freezeParams([BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest" as const])
        }),
        freezeRequest({
          method: "eth_getTransactionCount" as const,
          params: freezeParams([BSC_TESTNET_PTA_WBNB_POOL_SENDER, "pending" as const])
        }),
        getPoolRequest("latest"),
        getPoolRequest("pending"),
        getCodeRequest(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, "latest"),
        getCodeRequest(BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE, "pending"),
        getCodeRequest(BSC_TESTNET_PTA_WBNB_POOL_SENDER, "latest"),
        getCodeRequest(BSC_TESTNET_PTA_WBNB_POOL_SENDER, "pending"),
        freezeRequest({ method: "eth_gasPrice" as const, params: freezeParams([]) }),
        freezeRequest({
          method: "eth_call" as const,
          params: freezeParams([initializationCall, "pending" as const])
        }),
        freezeRequest({
          method: "eth_estimateGas" as const,
          params: freezeParams([initializationCall])
        })
      ]);
      const [primaryCurrentRaw, corroboratorCurrentRaw] = await Promise.all([
        Promise.all(
          currentRequests.map((request) => requestOne(dependencies.primaryClient, request))
        ),
        Promise.all(
          currentRequests.map((request) => requestOne(dependencies.corroboratorClient, request))
        )
      ]);
      const primaryCurrent = parseCurrent(primaryCurrentRaw);
      const corroboratorCurrent = parseCurrent(corroboratorCurrentRaw);
      if (primaryCurrent === null || corroboratorCurrent === null) {
        return blocked(
          "MALFORMED_RPC_RESPONSE",
          "pending_state",
          "A latest or pending response was not canonically encoded.",
          true
        );
      }
      if (!sameCurrent(primaryCurrent, corroboratorCurrent)) {
        return blocked(
          "PROVIDER_DISAGREEMENT",
          "pending_state",
          "The endpoints disagreed on exact balance, nonce, pool, code, fee, estimate, or simulation.",
          true
        );
      }
      if (
        primaryCurrent.latestNonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE ||
        primaryCurrent.pendingNonce !== BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE
      ) {
        return blocked(
          "NONCE_MISMATCH",
          "pending_state",
          "The exact sender latest and pending nonce must both remain at the pinned value.",
          true
        );
      }
      if (
        primaryCurrent.latestPool !== ZERO_ADDRESS ||
        primaryCurrent.pendingPool !== ZERO_ADDRESS ||
        primaryCurrent.latestCandidateCode !== "0x" ||
        primaryCurrent.pendingCandidateCode !== "0x"
      ) {
        return blocked(
          "POOL_ALREADY_EXISTS_OR_RACED",
          "pending_state",
          "The exact pool or candidate code appeared after the durable claim.",
          true
        );
      }
      if (primaryCurrent.latestSenderCode !== "0x" || primaryCurrent.pendingSenderCode !== "0x") {
        return blocked(
          "SENDER_NOT_EOA",
          "pending_state",
          "The exact sender is not code-empty in latest and pending state.",
          true
        );
      }
      if (!sameAddress(primaryCurrent.simulationPool, BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE)) {
        return blocked(
          "SIMULATION_MISMATCH",
          "simulation",
          "The exact pending simulation did not return the candidate pool.",
          true
        );
      }

      const refreshedMinimumGasLimit = calculateBscTestnetPtaWbnbPoolGasLimit(
        primaryCurrent.gasEstimate
      );
      const maximumCost = transactionGas * transactionGasPrice;
      if (
        refreshedMinimumGasLimit === null ||
        primaryCurrent.gasEstimate > BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_ESTIMATE ||
        transactionGas < refreshedMinimumGasLimit ||
        transactionGas > BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_LIMIT ||
        transactionGas > primaryBlock.gasLimit ||
        primaryCurrent.gasPrice !== transactionGasPrice ||
        transactionGasPrice === 0n ||
        transactionGasPrice > BSC_TESTNET_PTA_WBNB_POOL_MAX_GAS_PRICE_WEI ||
        maximumCost > BSC_TESTNET_PTA_WBNB_POOL_MAX_TOTAL_COST_WEI ||
        maximumCost !== BigInt(input.authorizedIntent.transaction.maximumCostWei)
      ) {
        return blocked(
          "GAS_POLICY_VIOLATION",
          "simulation",
          "Fresh gas, block, transaction, or maximum-cost bounds no longer match authorization.",
          true
        );
      }
      if (primaryCurrent.balance < maximumCost) {
        return blocked(
          "INSUFFICIENT_BALANCE",
          "pending_state",
          "The exact sender balance does not cover the authorized maximum cost.",
          true
        );
      }

      const completed = captureClock(dependencies.now);
      if (completed === null || completed.milliseconds < started.milliseconds) {
        return blocked(
          "CLOCK_INVALID",
          "clock",
          "The post-claim completion clock is invalid.",
          true
        );
      }
      if (completed.milliseconds > recheckNotAfterMilliseconds) {
        return blocked(
          "RECHECK_EXECUTION_RESERVE_EXHAUSTED",
          "clock",
          "The dual-RPC read did not finish before the exact post-recheck execution reserve.",
          true
        );
      }
      if (
        completed.milliseconds - started.milliseconds >
        BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS * 1_000
      ) {
        return blocked(
          "RECHECK_WINDOW_EXCEEDED",
          "clock",
          "The complete dual-RPC observation exceeded the thirty-second recheck window.",
          true
        );
      }
      const blockMilliseconds = primaryBlock.timestamp * 1_000n;
      const completedMilliseconds = BigInt(completed.milliseconds);
      if (blockMilliseconds > completedMilliseconds) {
        return blocked(
          "FINALIZED_BLOCK_IN_FUTURE",
          "block",
          "The common finalized block timestamp is in the future.",
          true
        );
      }
      if (
        completedMilliseconds - blockMilliseconds >
        BigInt(BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS * 1_000)
      ) {
        return blocked(
          "FINALIZED_BLOCK_STALE",
          "block",
          "The common finalized block exceeded the permitted observation age.",
          true
        );
      }

      let journalClaimToken: Hex | null = null;
      try {
        journalClaimToken = exactNonzeroHex32(
          Reflect.apply(dependencies.issueJournalClaimToken, undefined, [])
        );
      } catch {
        journalClaimToken = null;
      }
      if (journalClaimToken === null) {
        return blocked(
          "CAPABILITY_ISSUANCE_FAILED",
          "capability",
          "A fresh opaque journal claim token could not be issued.",
          true
        );
      }
      const issuedAt = captureClock(dependencies.now);
      if (issuedAt === null || issuedAt.milliseconds < completed.milliseconds) {
        return blocked("CLOCK_INVALID", "clock", "The capability-issuance clock is invalid.", true);
      }
      if (issuedAt.milliseconds > recheckNotAfterMilliseconds) {
        return blocked(
          "RECHECK_EXECUTION_RESERVE_EXHAUSTED",
          "clock",
          "Capability issuance did not preserve the exact post-recheck execution reserve.",
          true
        );
      }
      if (
        issuedAt.milliseconds - started.milliseconds >
        BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_MAX_AGE_SECONDS * 1_000
      ) {
        return blocked(
          "RECHECK_WINDOW_EXCEEDED",
          "clock",
          "Capability issuance exceeded the complete thirty-second recheck window.",
          true
        );
      }
      const issuedAtMilliseconds = BigInt(issuedAt.milliseconds);
      if (blockMilliseconds > issuedAtMilliseconds) {
        return blocked(
          "FINALIZED_BLOCK_IN_FUTURE",
          "block",
          "The common finalized block is later than the issuance clock.",
          true
        );
      }
      if (
        issuedAtMilliseconds - blockMilliseconds >
        BigInt(BSC_TESTNET_PTA_WBNB_POOL_MAX_OBSERVATION_AGE_SECONDS * 1_000)
      ) {
        return blocked(
          "FINALIZED_BLOCK_STALE",
          "block",
          "The common finalized block became stale before capability issuance.",
          true
        );
      }
      const capability: BscTestnetPtaWbnbPoolFreshRecheckCapability = Object.freeze({
        schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCHEMA_VERSION,
        scope: BSC_TESTNET_PTA_WBNB_POOL_FRESH_RECHECK_SCOPE,
        operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
        envelopeHash: input.authorizedIntent.envelopeHash,
        reviewerApprovalDigest: input.authorizedIntent.reviewerApprovalDigest,
        ownerAuthorizationDigest: input.authorizedIntent.ownerAuthorizationDigest,
        claimId: input.claimId,
        journalClaimToken,
        releaseCommit: input.authorizedIntent.releaseCommit,
        runtimeManifestSha256: input.authorizedIntent.runtimeManifestSha256,
        authenticatedAt: issuedAt.iso,
        expiresAt: input.authorizedIntent.expiresAt,
        recovery: input.authorizedIntent.recovery,
        freshPostClaimDualRpcRecheckPerformed: true,
        rpc: Object.freeze({
          primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
          corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
          providerAgreementVerified: true,
          canonicalFinalizedBlockVerified: true,
          eip1898RequireCanonical: true,
          observedAt: issuedAt.iso,
          finalizedBlockNumber: primaryBlock.number.toString(),
          finalizedBlockHash: primaryBlock.hash,
          finalizedBlockTimestamp: primaryBlock.timestamp.toString(),
          finalizedBlockGasLimit: primaryBlock.gasLimit.toString(),
          latestNonce: BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL,
          pendingNonce: BSC_TESTNET_PTA_WBNB_POOL_EXPECTED_NONCE_DECIMAL,
          factoryPool: ZERO_ADDRESS,
          candidateCode: "0x",
          senderCode: "0x",
          senderBalanceWei: primaryCurrent.balance.toString(),
          gasEstimate: primaryCurrent.gasEstimate.toString(),
          gasPriceWei: primaryCurrent.gasPrice.toString(),
          simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
        }),
        transaction: input.authorizedIntent.transaction
      });
      brandedCapabilities.add(capability);
      return Object.freeze({
        status: "verified" as const,
        capability,
        issue: null,
        boundary: boundary(true)
      });
    } catch {
      return blocked(
        "RPC_REQUEST_FAILED",
        "pending_state",
        "The fixed dual-RPC post-claim read failed closed.",
        rpcReadPerformed
      );
    }
  };

  return Object.freeze({
    boundary: boundary(false),
    recheck,
    authenticateFreshPostClaimRecheck: (value: unknown) => {
      try {
        return (
          typeof value === "object" &&
          value !== null &&
          !isProxy(value) &&
          brandedCapabilities.has(value)
        );
      } catch {
        return false;
      }
    }
  });
}

/** Internal root-runner seam using only fixed official clients and a private intent brand. */
export function createBscTestnetPtaWbnbPoolPostClaimRecheckerForInternalUse(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolPostClaimRechecker {
  return createBscTestnetPtaWbnbPoolPostClaimRechecker(untrustedDependencies);
}

export function createBscTestnetPtaWbnbPoolPostClaimRecheckerForTests(
  untrustedDependencies: unknown
): BscTestnetPtaWbnbPoolPostClaimRechecker {
  return createBscTestnetPtaWbnbPoolPostClaimRechecker(untrustedDependencies);
}
