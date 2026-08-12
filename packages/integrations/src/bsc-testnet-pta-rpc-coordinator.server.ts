import "server-only";

import { isProxy } from "node:util/types";

import { keccak256, sha256, stringToHex, type Address, type Hex } from "viem";

import {
  BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
  BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256,
  BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_SCHEMA_VERSION,
  BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
  BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
  BSC_TESTNET_PTA_GAS_MARGIN_BPS,
  BSC_TESTNET_PTA_HARD_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_HARD_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_HARD_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_MAX_OBSERVATION_AGE_SECONDS,
  BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
  BSC_TESTNET_PTA_RPC_ORIGIN,
  buildBscTestnetPtaDeploymentEnvelope,
  type BscTestnetPtaDeploymentEnvelope,
  type BscTestnetPtaDeploymentEnvelopeIssue,
  type BscTestnetPtaDeploymentFinances
} from "./bsc-testnet-pta-deployment-envelope";

export const BSC_TESTNET_PTA_CORROBORATOR_RPC_ORIGIN = "https://bsc-testnet.bnbchain.org" as const;
export const BSC_TESTNET_PTA_COORDINATOR_OBSERVATION_DIGEST_DOMAIN =
  "ProofEra:bsc-testnet-pta-rpc-coordinator-observation:v1" as const;

const UINT256_MAX = (1n << 256n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
const MAX_RPC_RESPONSE_BYTES = 1024 * 1024;
const RPC_REQUEST_TIMEOUT_MILLISECONDS = 4_000;
const ENVELOPE_LIFETIME_MILLISECONDS = 4 * 60 * 1_000;

type RpcBlockTag = "finalized" | "latest" | "pending" | Hex;

type DeploymentTransactionCall = Readonly<{
  from: typeof BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
  data: Hex;
  value: "0x0";
}>;

export type BscTestnetPtaRpcCoordinatorRequest =
  | Readonly<{ method: "eth_chainId"; params: readonly [] }>
  | Readonly<{
      method: "eth_getBlockByNumber";
      params: readonly [RpcBlockTag, false];
    }>
  | Readonly<{
      method: "eth_getBalance";
      params: readonly [Address, Hex];
    }>
  | Readonly<{
      method: "eth_getTransactionCount";
      params: readonly [Address, RpcBlockTag];
    }>
  | Readonly<{
      method: "eth_getCode";
      params: readonly [Address, Hex];
    }>
  | Readonly<{ method: "eth_gasPrice"; params: readonly [] }>
  | Readonly<{
      method: "eth_estimateGas";
      params: readonly [DeploymentTransactionCall];
    }>
  | Readonly<{
      method: "eth_call";
      params: readonly [DeploymentTransactionCall, Hex];
    }>;

/** Read-only JSON-RPC capability used by the test core. */
export interface BscTestnetPtaRpcCoordinatorClient {
  request(request: BscTestnetPtaRpcCoordinatorRequest): Promise<unknown>;
}

export interface BscTestnetPtaRpcCoordinatorCoreOptions {
  readonly primaryClient: BscTestnetPtaRpcCoordinatorClient;
  readonly corroboratorClient: BscTestnetPtaRpcCoordinatorClient;
  readonly now: () => Date;
}

export type BscTestnetPtaRpcCoordinatorStage =
  "input" | "clock" | "chain" | "block" | "account" | "target" | "simulation" | "envelope";

export type BscTestnetPtaRpcCoordinatorUnavailableReason =
  | "invalid_deployment_data"
  | "invalid_clock"
  | "rpc_request_failed"
  | "rpc_timeout"
  | "rpc_response_too_large"
  | "malformed_rpc_response"
  | "chain_mismatch"
  | "provider_disagreement"
  | "stale_block"
  | "future_block"
  | "internal_error";

export interface BscTestnetPtaRpcCoordinatorSource {
  readonly role: "primary" | "corroborator";
  readonly origin:
    typeof BSC_TESTNET_PTA_RPC_ORIGIN | typeof BSC_TESTNET_PTA_CORROBORATOR_RPC_ORIGIN;
  readonly blockSelection: "finalized" | "primary_exact_block_number";
}

export interface BscTestnetPtaRpcCoordinatorObservation {
  readonly observedAt: string;
  readonly blockNumber: string;
  readonly blockHash: Hex;
  readonly blockTimestamp: string;
  readonly blockGasLimit: string;
  readonly gasEstimateBlockSelection: "latest";
  readonly providerAgreementVerified: true;
  /** Unkeyed integrity digest only; it authenticates no provider or capability. */
  readonly coordinatorObservationDigest: Hex | null;
  readonly sources: readonly [BscTestnetPtaRpcCoordinatorSource, BscTestnetPtaRpcCoordinatorSource];
}

export interface BscTestnetPtaRpcCoordinatorBoundary {
  readonly scope: "exact_bsc_testnet_pta_read_only_deployment_preparation";
  readonly rpcReadPerformed: boolean;
  readonly providerAgreementVerified: boolean;
  readonly fallbackUsed: false;
  readonly secretRead: false;
  readonly signerCreated: false;
  readonly signatureCreated: false;
  readonly transactionSubmitted: false;
  readonly blockchainWritePerformed: false;
  readonly signingAuthorized: false;
  readonly envelopeAloneAuthorizesSigning: false;
  readonly freshRecheckRequiredBeforeSigning: true;
  readonly observationDigestAuthenticatesProvider: false;
  readonly executionAuthorized: false;
}

export interface BscTestnetPtaRpcCoordinatorUnavailableResult {
  readonly status: "unavailable";
  readonly signingReady: false;
  readonly stage: BscTestnetPtaRpcCoordinatorStage;
  readonly reason: BscTestnetPtaRpcCoordinatorUnavailableReason;
  readonly message: string;
  readonly attemptedAt: string | null;
  readonly observation: null;
  readonly envelope: null;
  readonly finances: null;
  readonly predictedContractAddress: null;
  readonly issues: readonly [];
  readonly boundary: BscTestnetPtaRpcCoordinatorBoundary;
}

export interface BscTestnetPtaRpcCoordinatorBlockedResult {
  readonly status: "blocked";
  readonly signingReady: false;
  readonly attemptedAt: string;
  readonly observation: BscTestnetPtaRpcCoordinatorObservation;
  readonly envelope: null;
  readonly finances: BscTestnetPtaDeploymentFinances | null;
  readonly predictedContractAddress: Address | null;
  readonly issues: readonly BscTestnetPtaDeploymentEnvelopeIssue[];
  readonly boundary: BscTestnetPtaRpcCoordinatorBoundary;
}

export interface BscTestnetPtaRpcCoordinatorObservedResult {
  readonly status: "observed";
  readonly signingReady: false;
  readonly envelopeValid: true;
  readonly attemptedAt: string;
  readonly observation: BscTestnetPtaRpcCoordinatorObservation;
  readonly envelope: BscTestnetPtaDeploymentEnvelope;
  readonly finances: BscTestnetPtaDeploymentFinances;
  readonly predictedContractAddress: Address;
  readonly issues: readonly [];
  readonly boundary: BscTestnetPtaRpcCoordinatorBoundary;
}

export type BscTestnetPtaRpcCoordinatorResult =
  | BscTestnetPtaRpcCoordinatorUnavailableResult
  | BscTestnetPtaRpcCoordinatorBlockedResult
  | BscTestnetPtaRpcCoordinatorObservedResult;

const SOURCES = Object.freeze([
  Object.freeze({
    role: "primary" as const,
    origin: BSC_TESTNET_PTA_RPC_ORIGIN,
    blockSelection: "finalized" as const
  }),
  Object.freeze({
    role: "corroborator" as const,
    origin: BSC_TESTNET_PTA_CORROBORATOR_RPC_ORIGIN,
    blockSelection: "primary_exact_block_number" as const
  })
]) as readonly [BscTestnetPtaRpcCoordinatorSource, BscTestnetPtaRpcCoordinatorSource];

const UNAVAILABLE_MESSAGES: Readonly<Record<BscTestnetPtaRpcCoordinatorUnavailableReason, string>> =
  Object.freeze({
    invalid_deployment_data: "The deployment payload does not match the reviewed PTA artifact.",
    invalid_clock: "The trusted coordinator clock was invalid.",
    rpc_request_failed: "An official BSC testnet RPC read failed.",
    rpc_timeout: "An official BSC testnet RPC read exceeded the bounded timeout.",
    rpc_response_too_large: "An official BSC testnet RPC response exceeded the bounded size.",
    malformed_rpc_response: "An official BSC testnet RPC response was malformed.",
    chain_mismatch: "An RPC endpoint did not report BSC testnet chain 97.",
    provider_disagreement: "The two official BSC testnet RPC observations did not agree.",
    stale_block: "The primary finalized block was older than the permitted observation window.",
    future_block: "The primary finalized block timestamp was later than the observation clock.",
    internal_error: "Deployment preparation failed closed at the coordinator boundary."
  });

class CoordinatorFailure extends Error {
  override readonly name: string = "CoordinatorFailure";

  constructor(
    readonly stage: BscTestnetPtaRpcCoordinatorStage,
    readonly reason: BscTestnetPtaRpcCoordinatorUnavailableReason
  ) {
    super(UNAVAILABLE_MESSAGES[reason]);
  }
}

type BlockObservation = Readonly<{
  number: bigint;
  numberHex: Hex;
  hash: Hex;
  timestamp: bigint;
  gasLimit: bigint;
}>;

type AccountObservation = Readonly<{
  balance: bigint;
  latestNonce: bigint;
  pendingNonce: bigint;
  signerCode: Hex;
  gasPrice: bigint;
}>;

type TargetObservation = Readonly<{
  targetCode: Hex;
  targetNonce: bigint;
  gasEstimate: bigint;
  simulationReturnData: Hex;
}>;

type ValidClock = Readonly<{ iso: string; milliseconds: number }>;

function boundary(
  rpcReadPerformed: boolean,
  providerAgreementVerified: boolean
): BscTestnetPtaRpcCoordinatorBoundary {
  return Object.freeze({
    scope: "exact_bsc_testnet_pta_read_only_deployment_preparation" as const,
    rpcReadPerformed,
    providerAgreementVerified,
    fallbackUsed: false as const,
    secretRead: false as const,
    signerCreated: false as const,
    signatureCreated: false as const,
    transactionSubmitted: false as const,
    blockchainWritePerformed: false as const,
    signingAuthorized: false as const,
    envelopeAloneAuthorizesSigning: false as const,
    freshRecheckRequiredBeforeSigning: true as const,
    observationDigestAuthenticatesProvider: false as const,
    executionAuthorized: false as const
  });
}

function unavailable(
  stage: BscTestnetPtaRpcCoordinatorStage,
  reason: BscTestnetPtaRpcCoordinatorUnavailableReason,
  attemptedAt: string | null,
  rpcReadPerformed: boolean
): BscTestnetPtaRpcCoordinatorUnavailableResult {
  return Object.freeze({
    status: "unavailable" as const,
    signingReady: false as const,
    stage,
    reason,
    message: UNAVAILABLE_MESSAGES[reason],
    attemptedAt,
    observation: null,
    envelope: null,
    finances: null,
    predictedContractAddress: null,
    issues: [] as const,
    boundary: boundary(rpcReadPerformed, false)
  });
}

function validClock(now: () => Date): ValidClock | null {
  try {
    const date = now();
    if (
      isProxy(date) ||
      !(date instanceof Date) ||
      Object.getPrototypeOf(date) !== Date.prototype
    ) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(date);
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) return null;
    return { iso: Date.prototype.toISOString.call(date), milliseconds };
  } catch {
    return null;
  }
}

function isReviewedDeploymentData(value: unknown): value is Hex {
  if (
    typeof value !== "string" ||
    value.length !== 2 + BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES * 2 ||
    !/^0x[0-9a-f]+$/u.test(value)
  ) {
    return false;
  }
  const data = value as Hex;
  return (
    sha256(data).slice(2) === BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 &&
    keccak256(data) === BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256
  );
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

function requiredOwnData(record: unknown, key: string): unknown | null {
  try {
    if (record === null || typeof record !== "object" || Array.isArray(record) || isProxy(record)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor?.enumerable === true && "value" in descriptor ? descriptor.value : null;
  } catch {
    return null;
  }
}

function parseBlock(value: unknown): BlockObservation | null {
  const numberRaw = requiredOwnData(value, "number");
  const hashRaw = requiredOwnData(value, "hash");
  const timestampRaw = requiredOwnData(value, "timestamp");
  const gasLimitRaw = requiredOwnData(value, "gasLimit");
  const number = parseQuantity(numberRaw);
  const timestamp = parseQuantity(timestampRaw);
  const gasLimit = parseQuantity(gasLimitRaw);
  if (
    number === null ||
    number === 0n ||
    timestamp === null ||
    timestamp === 0n ||
    gasLimit === null ||
    gasLimit === 0n ||
    typeof hashRaw !== "string" ||
    !/^0x[0-9a-f]{64}$/u.test(hashRaw) ||
    hashRaw === `0x${"00".repeat(32)}`
  ) {
    return null;
  }
  return {
    number,
    numberHex: `0x${number.toString(16)}` as Hex,
    hash: hashRaw as Hex,
    timestamp,
    gasLimit
  };
}

function sameBlock(left: BlockObservation, right: BlockObservation): boolean {
  return (
    left.number === right.number &&
    left.hash === right.hash &&
    left.timestamp === right.timestamp &&
    left.gasLimit === right.gasLimit
  );
}

function parseAccount(values: readonly unknown[]): AccountObservation | null {
  const balance = parseQuantity(values[0]);
  const latestNonce = parseQuantity(values[1], UINT64_MAX);
  const pendingNonce = parseQuantity(values[2], UINT64_MAX);
  const signerCode = parseBytes(values[3]);
  const gasPrice = parseQuantity(values[4]);
  if (
    balance === null ||
    latestNonce === null ||
    pendingNonce === null ||
    signerCode === null ||
    gasPrice === null
  ) {
    return null;
  }
  return { balance, latestNonce, pendingNonce, signerCode, gasPrice };
}

function sameAccount(left: AccountObservation, right: AccountObservation): boolean {
  return (
    left.balance === right.balance &&
    left.latestNonce === right.latestNonce &&
    left.pendingNonce === right.pendingNonce &&
    left.signerCode === right.signerCode &&
    left.gasPrice === right.gasPrice
  );
}

function parseTarget(values: readonly unknown[]): TargetObservation | null {
  const targetCode = parseBytes(values[0]);
  const targetNonce = parseQuantity(values[1], UINT64_MAX);
  const gasEstimate = parseQuantity(values[2]);
  const simulationReturnData = parseBytes(values[3]);
  if (
    targetCode === null ||
    targetNonce === null ||
    gasEstimate === null ||
    simulationReturnData === null
  ) {
    return null;
  }
  return { targetCode, targetNonce, gasEstimate, simulationReturnData };
}

function sameTarget(left: TargetObservation, right: TargetObservation): boolean {
  return (
    left.targetCode === right.targetCode &&
    left.targetNonce === right.targetNonce &&
    left.gasEstimate === right.gasEstimate &&
    left.simulationReturnData === right.simulationReturnData
  );
}

function coordinatorFailure(error: unknown, fallbackStage: BscTestnetPtaRpcCoordinatorStage) {
  if (error instanceof RpcTransportFailure) {
    return new CoordinatorFailure(fallbackStage, error.reason);
  }
  return error instanceof CoordinatorFailure
    ? error
    : new CoordinatorFailure(fallbackStage, "rpc_request_failed");
}

async function requestPair(
  stage: BscTestnetPtaRpcCoordinatorStage,
  primaryClient: BscTestnetPtaRpcCoordinatorClient,
  corroboratorClient: BscTestnetPtaRpcCoordinatorClient,
  primaryRequest: BscTestnetPtaRpcCoordinatorRequest,
  corroboratorRequest: BscTestnetPtaRpcCoordinatorRequest = primaryRequest
): Promise<readonly [unknown, unknown]> {
  try {
    return await Promise.all([
      primaryClient.request(primaryRequest),
      corroboratorClient.request(corroboratorRequest)
    ]);
  } catch (error) {
    throw coordinatorFailure(error, stage);
  }
}

async function accountObservation(
  client: BscTestnetPtaRpcCoordinatorClient,
  blockNumber: Hex
): Promise<readonly unknown[]> {
  return Promise.all([
    client.request({
      method: "eth_getBalance",
      params: [BSC_TESTNET_PTA_DEPLOYER_ADDRESS, blockNumber]
    }),
    client.request({
      method: "eth_getTransactionCount",
      params: [BSC_TESTNET_PTA_DEPLOYER_ADDRESS, "latest"]
    }),
    client.request({
      method: "eth_getTransactionCount",
      params: [BSC_TESTNET_PTA_DEPLOYER_ADDRESS, "pending"]
    }),
    client.request({
      method: "eth_getCode",
      params: [BSC_TESTNET_PTA_DEPLOYER_ADDRESS, blockNumber]
    }),
    client.request({ method: "eth_gasPrice", params: [] })
  ]);
}

async function targetObservation(
  client: BscTestnetPtaRpcCoordinatorClient,
  blockNumber: Hex,
  predictedContractAddress: Address,
  transaction: DeploymentTransactionCall
): Promise<readonly unknown[]> {
  return Promise.all([
    client.request({
      method: "eth_getCode",
      params: [predictedContractAddress, blockNumber]
    }),
    client.request({
      method: "eth_getTransactionCount",
      params: [predictedContractAddress, blockNumber]
    }),
    client.request({ method: "eth_estimateGas", params: [transaction] }),
    client.request({ method: "eth_call", params: [transaction, blockNumber] })
  ]);
}

function observation(
  block: BlockObservation,
  observedAt: string,
  coordinatorObservationDigest: Hex | null
) {
  return Object.freeze({
    observedAt,
    blockNumber: block.number.toString(),
    blockHash: block.hash,
    blockTimestamp: block.timestamp.toString(),
    blockGasLimit: block.gasLimit.toString(),
    gasEstimateBlockSelection: "latest" as const,
    providerAgreementVerified: true as const,
    coordinatorObservationDigest,
    sources: SOURCES
  });
}

function digestCoordinatorObservation(
  envelopeHash: Hex,
  block: BlockObservation,
  observedAt: string
): Hex {
  return keccak256(
    stringToHex(
      `${BSC_TESTNET_PTA_COORDINATOR_OBSERVATION_DIGEST_DOMAIN}\u0000${JSON.stringify({
        envelopeHash,
        primaryOrigin: BSC_TESTNET_PTA_RPC_ORIGIN,
        corroboratorOrigin: BSC_TESTNET_PTA_CORROBORATOR_RPC_ORIGIN,
        blockNumber: block.number.toString(),
        blockHash: block.hash,
        blockTimestamp: block.timestamp.toString(),
        blockGasLimit: block.gasLimit.toString(),
        observedAt,
        gasEstimateBlockSelection: "latest",
        providerAgreementVerified: true
      })}`
    )
  );
}

/**
 * Dependency-injected read-only core for deterministic tests. It is intentionally
 * not intended for a package export; production callers use the fixed function below.
 */
export async function coordinateBscTestnetPtaDeploymentForTests(
  deploymentData: unknown,
  options: BscTestnetPtaRpcCoordinatorCoreOptions
): Promise<BscTestnetPtaRpcCoordinatorResult> {
  let attemptedAt: string | null = null;
  let rpcReadPerformed = false;
  try {
    const started = validClock(options.now);
    if (started === null) return unavailable("clock", "invalid_clock", null, false);
    attemptedAt = started.iso;
    if (!isReviewedDeploymentData(deploymentData)) {
      return unavailable("input", "invalid_deployment_data", attemptedAt, false);
    }

    rpcReadPerformed = true;
    const [primaryChainRaw, corroboratorChainRaw] = await requestPair(
      "chain",
      options.primaryClient,
      options.corroboratorClient,
      { method: "eth_chainId", params: [] }
    );
    const primaryChain = parseQuantity(primaryChainRaw);
    const corroboratorChain = parseQuantity(corroboratorChainRaw);
    if (primaryChain === null || corroboratorChain === null) {
      return unavailable("chain", "malformed_rpc_response", attemptedAt, true);
    }
    if (
      primaryChain.toString() !== BSC_TESTNET_PTA_CHAIN_ID_DECIMAL ||
      corroboratorChain.toString() !== BSC_TESTNET_PTA_CHAIN_ID_DECIMAL
    ) {
      return unavailable("chain", "chain_mismatch", attemptedAt, true);
    }

    let primaryBlockRaw: unknown;
    try {
      primaryBlockRaw = await options.primaryClient.request({
        method: "eth_getBlockByNumber",
        params: ["finalized", false]
      });
    } catch (error) {
      const failure = coordinatorFailure(error, "block");
      return unavailable(failure.stage, failure.reason, attemptedAt, true);
    }
    const primaryBlock = parseBlock(primaryBlockRaw);
    if (primaryBlock === null) {
      return unavailable("block", "malformed_rpc_response", attemptedAt, true);
    }

    let corroboratorBlockRaw: unknown;
    try {
      corroboratorBlockRaw = await options.corroboratorClient.request({
        method: "eth_getBlockByNumber",
        params: [primaryBlock.numberHex, false]
      });
    } catch (error) {
      const failure = coordinatorFailure(error, "block");
      return unavailable(failure.stage, failure.reason, attemptedAt, true);
    }
    const corroboratorBlock = parseBlock(corroboratorBlockRaw);
    if (corroboratorBlock === null) {
      return unavailable("block", "malformed_rpc_response", attemptedAt, true);
    }
    if (!sameBlock(primaryBlock, corroboratorBlock)) {
      return unavailable("block", "provider_disagreement", attemptedAt, true);
    }

    let accountPair: readonly [unknown, unknown];
    try {
      accountPair = await Promise.all([
        accountObservation(options.primaryClient, primaryBlock.numberHex),
        accountObservation(options.corroboratorClient, primaryBlock.numberHex)
      ]);
    } catch (error) {
      const failure = coordinatorFailure(error, "account");
      return unavailable(failure.stage, failure.reason, attemptedAt, true);
    }
    const primaryAccount = parseAccount(accountPair[0] as readonly unknown[]);
    const corroboratorAccount = parseAccount(accountPair[1] as readonly unknown[]);
    if (primaryAccount === null || corroboratorAccount === null) {
      return unavailable("account", "malformed_rpc_response", attemptedAt, true);
    }
    if (!sameAccount(primaryAccount, corroboratorAccount)) {
      return unavailable("account", "provider_disagreement", attemptedAt, true);
    }

    const predictedContractAddress = BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS;
    const transaction = Object.freeze({
      from: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
      data: deploymentData,
      value: "0x0" as const
    });

    let targetPair: readonly [unknown, unknown];
    try {
      targetPair = await Promise.all([
        targetObservation(
          options.primaryClient,
          primaryBlock.numberHex,
          predictedContractAddress,
          transaction
        ),
        targetObservation(
          options.corroboratorClient,
          primaryBlock.numberHex,
          predictedContractAddress,
          transaction
        )
      ]);
    } catch (error) {
      const failure = coordinatorFailure(error, "simulation");
      return unavailable(failure.stage, failure.reason, attemptedAt, true);
    }
    const primaryTarget = parseTarget(targetPair[0] as readonly unknown[]);
    const corroboratorTarget = parseTarget(targetPair[1] as readonly unknown[]);
    if (primaryTarget === null || corroboratorTarget === null) {
      return unavailable("simulation", "malformed_rpc_response", attemptedAt, true);
    }
    if (!sameTarget(primaryTarget, corroboratorTarget)) {
      return unavailable("simulation", "provider_disagreement", attemptedAt, true);
    }

    const completed = validClock(options.now);
    if (completed === null || completed.milliseconds < started.milliseconds) {
      return unavailable("clock", "invalid_clock", attemptedAt, true);
    }
    attemptedAt = completed.iso;
    const blockMilliseconds = primaryBlock.timestamp * 1_000n;
    const completedMilliseconds = BigInt(completed.milliseconds);
    if (blockMilliseconds > completedMilliseconds) {
      return unavailable("block", "future_block", attemptedAt, true);
    }
    if (
      completedMilliseconds - blockMilliseconds >
      BigInt(BSC_TESTNET_PTA_MAX_OBSERVATION_AGE_SECONDS * 1_000)
    ) {
      return unavailable("block", "stale_block", attemptedAt, true);
    }

    const expiresAt = new Date(
      completed.milliseconds + ENVELOPE_LIFETIME_MILLISECONDS
    ).toISOString();
    const envelopeResult = buildBscTestnetPtaDeploymentEnvelope(
      {
        schemaVersion: BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_SCHEMA_VERSION,
        operation: BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
        deploymentData,
        rpc: {
          endpointId: BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
          endpointOrigin: BSC_TESTNET_PTA_RPC_ORIGIN,
          observedAt: completed.iso,
          chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
          blockNumber: primaryBlock.number.toString(),
          blockHash: primaryBlock.hash,
          blockTimestamp: primaryBlock.timestamp.toString(),
          blockGasLimit: primaryBlock.gasLimit.toString(),
          latestNonce: primaryAccount.latestNonce.toString(),
          pendingNonce: primaryAccount.pendingNonce.toString(),
          signerCode: primaryAccount.signerCode,
          predictedContractAddress,
          predictedContractCode: primaryTarget.targetCode,
          predictedContractNonce: primaryTarget.targetNonce.toString(),
          balanceWei: primaryAccount.balance.toString(),
          simulationReturnData: primaryTarget.simulationReturnData,
          gasEstimate: primaryTarget.gasEstimate.toString(),
          feeModel: "legacy_gas_price",
          gasPriceWei: primaryAccount.gasPrice.toString()
        },
        policy: {
          expiresAt,
          gasLimitMarginBps: BSC_TESTNET_PTA_GAS_MARGIN_BPS,
          maximumGasLimit: BSC_TESTNET_PTA_HARD_MAX_GAS_LIMIT,
          maximumGasPriceWei: BSC_TESTNET_PTA_HARD_MAX_GAS_PRICE_WEI,
          maximumTotalCostWei: BSC_TESTNET_PTA_HARD_MAX_TOTAL_COST_WEI
        }
      },
      { asOf: () => new Date(completed.milliseconds) }
    );
    if (envelopeResult.status === "blocked") {
      return Object.freeze({
        status: "blocked" as const,
        signingReady: false as const,
        attemptedAt: completed.iso,
        observation: observation(primaryBlock, completed.iso, null),
        envelope: null,
        finances: envelopeResult.finances,
        predictedContractAddress: envelopeResult.predictedContractAddress,
        issues: envelopeResult.issues,
        boundary: boundary(true, true)
      });
    }
    const coordinatorObservationDigest = digestCoordinatorObservation(
      envelopeResult.envelope.envelopeHash,
      primaryBlock,
      completed.iso
    );
    return Object.freeze({
      status: "observed" as const,
      signingReady: false as const,
      envelopeValid: true as const,
      attemptedAt: completed.iso,
      observation: observation(primaryBlock, completed.iso, coordinatorObservationDigest),
      envelope: envelopeResult.envelope,
      finances: envelopeResult.finances,
      predictedContractAddress: envelopeResult.predictedContractAddress,
      issues: [] as const,
      boundary: boundary(true, true)
    });
  } catch (error) {
    if (error instanceof CoordinatorFailure) {
      return unavailable(error.stage, error.reason, attemptedAt, rpcReadPerformed);
    }
    return unavailable("envelope", "internal_error", attemptedAt, rpcReadPerformed);
  }
}

type TransportFailureReason = "rpc_request_failed" | "rpc_timeout" | "rpc_response_too_large";

class RpcTransportFailure extends CoordinatorFailure {
  override readonly name = "RpcTransportFailure";

  constructor(reason: TransportFailureReason) {
    super("chain", reason);
  }
}

function inspectRpcResponse(value: unknown, expectedId: number): unknown {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    const hasResult = Object.hasOwn(descriptors, "result");
    const expectedKeys = hasResult ? ["id", "jsonrpc", "result"] : ["error", "id", "jsonrpc"];
    const sortedKeys = (keys as string[]).sort();
    if (
      sortedKeys.length !== expectedKeys.length ||
      sortedKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
        throw new RpcTransportFailure("rpc_request_failed");
      }
    }
    if (descriptors.jsonrpc?.value !== "2.0" || descriptors.id?.value !== expectedId) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    if (!hasResult) throw new RpcTransportFailure("rpc_request_failed");
    return descriptors.result?.value;
  } catch (error) {
    if (error instanceof RpcTransportFailure) throw error;
    throw new RpcTransportFailure("rpc_request_failed");
  }
}

async function readBoundedResponse(response: Response): Promise<string> {
  if (response.status !== 200 || response.redirected) {
    throw new RpcTransportFailure("rpc_request_failed");
  }
  const contentType = response.headers.get("content-type");
  if (
    contentType === null ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType.trim())
  ) {
    throw new RpcTransportFailure("rpc_request_failed");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/u.test(contentLength)) {
      throw new RpcTransportFailure("rpc_request_failed");
    }
    if (BigInt(contentLength) > BigInt(MAX_RPC_RESPONSE_BYTES)) {
      throw new RpcTransportFailure("rpc_response_too_large");
    }
  }
  if (response.body === null) throw new RpcTransportFailure("rpc_request_failed");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let output = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RPC_RESPONSE_BYTES) {
        await reader.cancel();
        throw new RpcTransportFailure("rpc_response_too_large");
      }
      output += decoder.decode(chunk.value, { stream: true });
    }
    output += decoder.decode();
  } catch (error) {
    if (error instanceof RpcTransportFailure) throw error;
    throw new RpcTransportFailure("rpc_request_failed");
  } finally {
    reader.releaseLock();
  }
  if (output.length === 0) throw new RpcTransportFailure("rpc_request_failed");
  return output;
}

function createFixedFetchClient(
  origin: typeof BSC_TESTNET_PTA_RPC_ORIGIN | typeof BSC_TESTNET_PTA_CORROBORATOR_RPC_ORIGIN
): BscTestnetPtaRpcCoordinatorClient {
  let requestId = 0;
  return {
    async request(request): Promise<unknown> {
      requestId += 1;
      const id = requestId;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new RpcTransportFailure("rpc_timeout"));
        }, RPC_REQUEST_TIMEOUT_MILLISECONDS);
        timer.unref?.();
      });
      const operation = (async () => {
        let response: Response;
        try {
          response = await globalThis.fetch(origin, {
            method: "POST",
            headers: Object.freeze({
              accept: "application/json",
              "content-type": "application/json"
            }),
            body: JSON.stringify({ jsonrpc: "2.0", id, ...request }),
            cache: "no-store",
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
            signal: controller.signal
          });
        } catch {
          if (controller.signal.aborted) throw new RpcTransportFailure("rpc_timeout");
          throw new RpcTransportFailure("rpc_request_failed");
        }
        const body = await readBoundedResponse(response);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body) as unknown;
        } catch {
          throw new RpcTransportFailure("rpc_request_failed");
        }
        return inspectRpcResponse(parsed, id);
      })();
      try {
        return await Promise.race([operation, timeout]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  };
}

/**
 * Collects a fail-closed, two-provider BSC-testnet observation for only the reviewed
 * PTA deployment. It performs no environment read, secret read, signing, or write RPC.
 */
export async function prepareBscTestnetPtaDeploymentEnvelope(
  deploymentData: unknown
): Promise<BscTestnetPtaRpcCoordinatorResult> {
  return coordinateBscTestnetPtaDeploymentForTests(deploymentData, {
    primaryClient: createFixedFetchClient(BSC_TESTNET_PTA_RPC_ORIGIN),
    corroboratorClient: createFixedFetchClient(BSC_TESTNET_PTA_CORROBORATOR_RPC_ORIGIN),
    now: () => new Date()
  });
}
