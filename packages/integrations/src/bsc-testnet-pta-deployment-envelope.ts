import { isProxy } from "node:util/types";

import { getAddress, keccak256, sha256, stringToHex, type Address, type Hex } from "viem";

export const BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_SCHEMA_VERSION = 1 as const;
export const BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN =
  "ProofEra:bsc-testnet-pta-deployment-envelope:v1" as const;
export const BSC_TESTNET_PTA_DEPLOYMENT_OPERATION = "deploy_proofera_test_asset" as const;
export const BSC_TESTNET_PTA_CHAIN_ID = 97 as const;
export const BSC_TESTNET_PTA_CHAIN_ID_DECIMAL = "97" as const;
export const BSC_TESTNET_PTA_RPC_ENDPOINT_ID = "bnb-chain-public-bsc-testnet-dataseed" as const;
export const BSC_TESTNET_PTA_RPC_ORIGIN = "https://bsc-testnet-dataseed.bnbchain.org" as const;
export const BSC_TESTNET_PTA_DEPLOYER_ADDRESS =
  "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49" as const satisfies Address;
export const BSC_TESTNET_PTA_RECIPIENT_ADDRESS = BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
export const BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE = "0" as const;
export const BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS =
  "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc" as const satisfies Address;
export const BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES = 2_947 as const;
export const BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 =
  "45f05cb4c02100cccf74c7b2e7c31d04386642309ca2b9a9614684d0341cd239" as const;
export const BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256 =
  "0xc5f631e51c930369f41ed53660de0c5b82a025a09ad223cb8c5d7986687cd0a1" as const;
export const BSC_TESTNET_PTA_RUNTIME_BYTES = 1_826 as const;
export const BSC_TESTNET_PTA_RUNTIME_SHA256 =
  "e018f428a384212f11817a24f4828c1a479403d86491e256a7f79d3142395527" as const;
export const BSC_TESTNET_PTA_RUNTIME_KECCAK256 =
  "0x2f8caecd2e51f085ab11a67e5b8a89eeab7b667bd89ec708a481b66ed756e006" as const;

export const BSC_TESTNET_PTA_GAS_MARGIN_BPS = "2000" as const;
export const BSC_TESTNET_PTA_HARD_MAX_GAS_LIMIT = "1000000" as const;
export const BSC_TESTNET_PTA_HARD_MAX_GAS_PRICE_WEI = "3000000000" as const;
export const BSC_TESTNET_PTA_HARD_MAX_TOTAL_COST_WEI = "3000000000000000" as const;
export const BSC_TESTNET_PTA_MAX_OBSERVATION_AGE_SECONDS = 120 as const;
export const BSC_TESTNET_PTA_MAX_ENVELOPE_LIFETIME_SECONDS = 300 as const;

const UINT256_MAX = (1n << 256n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
const BASIS_POINTS = 10_000n;
const HARD_MAX_GAS_LIMIT = BigInt(BSC_TESTNET_PTA_HARD_MAX_GAS_LIMIT);
const HARD_MAX_GAS_PRICE_WEI = BigInt(BSC_TESTNET_PTA_HARD_MAX_GAS_PRICE_WEI);
const HARD_MAX_TOTAL_COST_WEI = BigInt(BSC_TESTNET_PTA_HARD_MAX_TOTAL_COST_WEI);

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export type BscTestnetPtaDeploymentEnvelopeIssueCode =
  | "INPUT_INVALID"
  | "OPTIONS_INVALID"
  | "CLOCK_INVALID"
  | "DEPLOYMENT_DATA_INVALID"
  | "DEPLOYMENT_DATA_SHA256_MISMATCH"
  | "DEPLOYMENT_DATA_KECCAK_MISMATCH"
  | "RPC_ENDPOINT_MISMATCH"
  | "CHAIN_ID_MISMATCH"
  | "BLOCK_OBSERVATION_INVALID"
  | "OBSERVATION_FROM_FUTURE"
  | "OBSERVATION_STALE"
  | "BLOCK_FROM_FUTURE"
  | "BLOCK_STALE"
  | "ENVELOPE_EXPIRY_INVALID"
  | "ENVELOPE_EXPIRED"
  | "ENVELOPE_LIFETIME_EXCEEDED"
  | "NONCE_INVALID"
  | "NONCE_DRIFT"
  | "DEPLOYER_NONCE_ALREADY_USED"
  | "SIGNER_CODE_PRESENT"
  | "PREDICTED_ADDRESS_INVALID"
  | "PREDICTED_ADDRESS_MISMATCH"
  | "TARGET_CODE_PRESENT"
  | "TARGET_NONCE_NONZERO"
  | "SIMULATION_OUTPUT_INVALID"
  | "SIMULATION_SHA256_MISMATCH"
  | "SIMULATION_KECCAK_MISMATCH"
  | "FEE_MODEL_INVALID"
  | "GAS_MARGIN_POLICY_INVALID"
  | "GAS_LIMIT_POLICY_INVALID"
  | "GAS_PRICE_POLICY_INVALID"
  | "TOTAL_COST_POLICY_INVALID"
  | "BALANCE_INVALID"
  | "GAS_ESTIMATE_INVALID"
  | "GAS_PRICE_INVALID"
  | "GAS_LIMIT_EXCEEDS_BLOCK"
  | "GAS_LIMIT_EXCEEDS_POLICY"
  | "GAS_PRICE_EXCEEDS_POLICY"
  | "TOTAL_COST_EXCEEDS_POLICY"
  | "INSUFFICIENT_BALANCE"
  | "INTERNAL_VALIDATION_ERROR";

export interface BscTestnetPtaDeploymentEnvelopeIssue {
  readonly code: BscTestnetPtaDeploymentEnvelopeIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface BscTestnetPtaDeploymentRpcObservationInput {
  readonly endpointId: typeof BSC_TESTNET_PTA_RPC_ENDPOINT_ID;
  readonly endpointOrigin: typeof BSC_TESTNET_PTA_RPC_ORIGIN;
  readonly observedAt: string;
  readonly chainId: typeof BSC_TESTNET_PTA_CHAIN_ID_DECIMAL;
  readonly blockNumber: string;
  readonly blockHash: Hex;
  readonly blockTimestamp: string;
  readonly blockGasLimit: string;
  readonly latestNonce: string;
  readonly pendingNonce: string;
  readonly signerCode: Hex;
  readonly predictedContractAddress: Address;
  readonly predictedContractCode: Hex;
  readonly predictedContractNonce: string;
  readonly balanceWei: string;
  readonly simulationReturnData: Hex;
  readonly gasEstimate: string;
  readonly feeModel: "legacy_gas_price";
  readonly gasPriceWei: string;
}

export interface BscTestnetPtaDeploymentPolicyInput {
  readonly expiresAt: string;
  readonly gasLimitMarginBps: typeof BSC_TESTNET_PTA_GAS_MARGIN_BPS;
  readonly maximumGasLimit: string;
  readonly maximumGasPriceWei: string;
  readonly maximumTotalCostWei: string;
}

export interface BscTestnetPtaDeploymentEnvelopeInput {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_SCHEMA_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_DEPLOYMENT_OPERATION;
  readonly deploymentData: Hex;
  readonly rpc: BscTestnetPtaDeploymentRpcObservationInput;
  readonly policy: BscTestnetPtaDeploymentPolicyInput;
}

export interface BscTestnetPtaDeploymentEnvelopeOptions {
  readonly asOf: () => Date;
}

export interface BscTestnetPtaDeploymentFinances {
  readonly balanceWei: string;
  readonly gasEstimate: string;
  readonly gasLimitMarginBps: typeof BSC_TESTNET_PTA_GAS_MARGIN_BPS;
  readonly gasLimit: string;
  readonly gasPriceWei: string;
  readonly maximumCostWei: string;
}

const PURE_BOUNDARY = Object.freeze({
  scope: "exact_bsc_testnet_pta_deployment_envelope_only" as const,
  rpcProvenanceAuthenticated: false,
  rpcReadPerformed: false,
  secretRead: false,
  signerCreated: false,
  signatureCreated: false,
  transactionSubmitted: false,
  blockchainWritePerformed: false,
  executionAuthorized: false,
  signingAuthorized: false
});

type EnvelopeBody = Readonly<{
  schemaVersion: typeof BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_SCHEMA_VERSION;
  operation: typeof BSC_TESTNET_PTA_DEPLOYMENT_OPERATION;
  environment: "bsc-testnet";
  chainId: typeof BSC_TESTNET_PTA_CHAIN_ID;
  rpc: Readonly<{
    endpointId: typeof BSC_TESTNET_PTA_RPC_ENDPOINT_ID;
    endpointOrigin: typeof BSC_TESTNET_PTA_RPC_ORIGIN;
    observedAt: string;
    blockNumber: string;
    blockHash: Hex;
    blockTimestamp: string;
    blockGasLimit: string;
    signerCode: "0x";
    predictedContractCode: "0x";
    predictedContractNonce: "0";
    simulationReturnData: Hex;
  }>;
  deployment: Readonly<{
    from: typeof BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
    recipient: typeof BSC_TESTNET_PTA_RECIPIENT_ADDRESS;
    to: null;
    predictedContractAddress: Address;
    deploymentDataSha256: typeof BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256;
    deploymentDataKeccak256: typeof BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256;
    runtimeSha256: typeof BSC_TESTNET_PTA_RUNTIME_SHA256;
    runtimeKeccak256: typeof BSC_TESTNET_PTA_RUNTIME_KECCAK256;
  }>;
  transaction: Readonly<{
    type: "legacy";
    chainId: typeof BSC_TESTNET_PTA_CHAIN_ID_DECIMAL;
    from: typeof BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
    to: null;
    nonce: typeof BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE;
    data: Hex;
    valueWei: "0";
    gasLimit: string;
    gasPriceWei: string;
  }>;
  finances: BscTestnetPtaDeploymentFinances;
  policy: BscTestnetPtaDeploymentPolicyInput;
}>;

export type BscTestnetPtaDeploymentEnvelope = DeepReadonly<
  EnvelopeBody & {
    hashDomain: typeof BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN;
    envelopeHash: Hex;
  }
>;

export type BscTestnetPtaDeploymentEnvelopeResult = DeepReadonly<
  | {
      status: "blocked";
      signingReady: false;
      envelopeValid: false;
      envelope: null;
      finances: BscTestnetPtaDeploymentFinances | null;
      predictedContractAddress: Address | null;
      issues: readonly BscTestnetPtaDeploymentEnvelopeIssue[];
      boundary: typeof PURE_BOUNDARY;
    }
  | {
      status: "validated";
      signingReady: false;
      envelopeValid: true;
      envelope: BscTestnetPtaDeploymentEnvelope;
      finances: BscTestnetPtaDeploymentFinances;
      predictedContractAddress: Address;
      issues: readonly never[];
      boundary: typeof PURE_BOUNDARY;
    }
>;

type InspectedInput = Readonly<{
  schemaVersion: unknown;
  operation: unknown;
  deploymentData: unknown;
  rpc: Readonly<Record<string, unknown>>;
  policy: Readonly<Record<string, unknown>>;
}>;

const INPUT_KEYS = ["deploymentData", "operation", "policy", "rpc", "schemaVersion"] as const;
const POLICY_KEYS = [
  "expiresAt",
  "gasLimitMarginBps",
  "maximumGasLimit",
  "maximumGasPriceWei",
  "maximumTotalCostWei"
] as const;
const RPC_KEYS = [
  "balanceWei",
  "blockGasLimit",
  "blockHash",
  "blockNumber",
  "blockTimestamp",
  "chainId",
  "endpointId",
  "endpointOrigin",
  "feeModel",
  "gasEstimate",
  "gasPriceWei",
  "latestNonce",
  "observedAt",
  "pendingNonce",
  "predictedContractAddress",
  "predictedContractCode",
  "predictedContractNonce",
  "signerCode",
  "simulationReturnData"
] as const;

function inspectDataRecord(
  value: unknown,
  expectedKeys: readonly string[]
): Readonly<Record<string, unknown>> | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return null;
    const sortedKeys = (ownKeys as string[]).sort();
    const sortedExpected = [...expectedKeys].sort();
    if (
      sortedKeys.length !== sortedExpected.length ||
      sortedKeys.some((key, index) => key !== sortedExpected[index])
    ) {
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

function inspectInput(value: unknown): InspectedInput | null {
  const root = inspectDataRecord(value, INPUT_KEYS);
  if (root === null) return null;
  const rpc = inspectDataRecord(root.rpc, RPC_KEYS);
  const policy = inspectDataRecord(root.policy, POLICY_KEYS);
  if (rpc === null || policy === null) return null;
  return Object.freeze({
    schemaVersion: root.schemaVersion,
    operation: root.operation,
    deploymentData: root.deploymentData,
    rpc,
    policy
  });
}

function inspectAsOf(value: unknown): (() => unknown) | null {
  const options = inspectDataRecord(value, ["asOf"]);
  if (options === null || typeof options.asOf !== "function" || isProxy(options.asOf)) return null;
  const asOfFunction = options.asOf as (...arguments_: readonly unknown[]) => unknown;
  return () => Reflect.apply(asOfFunction, undefined, []);
}

function captureAsOf(asOf: () => unknown): number | null {
  try {
    const value = asOf();
    if (
      isProxy(value) ||
      !(value instanceof Date) ||
      Object.getPrototypeOf(value) !== Date.prototype
    ) {
      return null;
    }
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isFinite(milliseconds) ? milliseconds : null;
  } catch {
    return null;
  }
}

function canonicalUint(value: unknown, maximum = UINT256_MAX): bigint | null {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 78 ||
    !/^(0|[1-9][0-9]*)$/u.test(value)
  ) {
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

function canonicalUtc(
  value: unknown
): { readonly iso: string; readonly milliseconds: number } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return null;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? { iso: value, milliseconds }
    : null;
}

function exactLowerHex(value: unknown, bytes: number): Hex | null {
  return typeof value === "string" && new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, "u").test(value)
    ? (value as Hex)
    : null;
}

function exactLowerBytes32(value: unknown, allowZero = false): Hex | null {
  const parsed = exactLowerHex(value, 32);
  return parsed !== null && (allowZero || parsed !== `0x${"00".repeat(32)}`) ? parsed : null;
}

function exactHexBytes(value: unknown, bytes: number): Hex | null {
  return exactLowerHex(value, bytes);
}

function canonicalAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(value)) return null;
  try {
    const checksummed = getAddress(value);
    return checksummed === value ? checksummed : null;
  } catch {
    return null;
  }
}

function issue(
  code: BscTestnetPtaDeploymentEnvelopeIssueCode,
  path: string,
  message: string
): BscTestnetPtaDeploymentEnvelopeIssue {
  return { code, path, message };
}

function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<Value>;
}

function recursivelySortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => recursivelySortJsonKeys(entry));
  if (value === null || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = recursivelySortJsonKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function deriveEnvelopeHash(body: EnvelopeBody): Hex {
  return keccak256(
    stringToHex(
      `${BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN}\u0000${JSON.stringify(
        recursivelySortJsonKeys(body)
      )}`
    )
  );
}

function blocked(
  issues: readonly BscTestnetPtaDeploymentEnvelopeIssue[],
  finances: BscTestnetPtaDeploymentFinances | null = null,
  predictedContractAddress: Address | null = null
): BscTestnetPtaDeploymentEnvelopeResult {
  const retained = [...issues];
  if (retained.length === 0) {
    retained.push(
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "envelope",
        "Envelope construction stopped without a specific validation issue."
      )
    );
  }
  return deepFreeze({
    status: "blocked" as const,
    signingReady: false as const,
    envelopeValid: false as const,
    envelope: null,
    finances,
    predictedContractAddress,
    issues: retained,
    boundary: PURE_BOUNDARY
  });
}

/**
 * Validates an untrusted, already-collected RPC-shaped snapshot and creates a
 * deterministic candidate envelope. This pure calculation authenticates no
 * provider and never authorizes signing; a server-owned multi-provider
 * coordinator and a fresh signer-side recheck remain mandatory.
 * This pure boundary never reads RPC, secrets, process state, or a signer and never signs/submits.
 */
export function buildBscTestnetPtaDeploymentEnvelope(
  untrustedInput: unknown,
  untrustedOptions: unknown
): BscTestnetPtaDeploymentEnvelopeResult {
  try {
    const input = inspectInput(untrustedInput);
    if (input === null) {
      return blocked([
        issue(
          "INPUT_INVALID",
          "input",
          "Input must use the exact JSON-safe deployment observation shape and own data properties."
        )
      ]);
    }
    const asOfFunction = inspectAsOf(untrustedOptions);
    if (asOfFunction === null) {
      return blocked([
        issue(
          "OPTIONS_INVALID",
          "options",
          "Options must contain only an injected asOf clock as an own data property."
        )
      ]);
    }
    const asOfMilliseconds = captureAsOf(asOfFunction);
    if (asOfMilliseconds === null) {
      return blocked([
        issue("CLOCK_INVALID", "options.asOf", "The injected asOf clock returned no valid Date.")
      ]);
    }

    const issues: BscTestnetPtaDeploymentEnvelopeIssue[] = [];
    const rpc = input.rpc;
    const policy = input.policy;

    if (
      input.schemaVersion !== BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_SCHEMA_VERSION ||
      input.operation !== BSC_TESTNET_PTA_DEPLOYMENT_OPERATION
    ) {
      issues.push(
        issue(
          "INPUT_INVALID",
          "input",
          "Schema version and operation must match the exact PTA deployment operation."
        )
      );
    }

    const deploymentData = exactHexBytes(
      input.deploymentData,
      BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES
    );
    if (deploymentData === null) {
      issues.push(
        issue(
          "DEPLOYMENT_DATA_INVALID",
          "deploymentData",
          "Deployment data must be the exact lowercase 2947-byte hexadecimal payload."
        )
      );
    } else {
      if (sha256(deploymentData).slice(2) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256) {
        issues.push(
          issue(
            "DEPLOYMENT_DATA_SHA256_MISMATCH",
            "deploymentData",
            "Deployment data does not match the reviewed SHA-256 digest."
          )
        );
      }
      if (keccak256(deploymentData) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256) {
        issues.push(
          issue(
            "DEPLOYMENT_DATA_KECCAK_MISMATCH",
            "deploymentData",
            "Deployment data does not match the reviewed Keccak-256 digest."
          )
        );
      }
    }

    if (
      rpc.endpointId !== BSC_TESTNET_PTA_RPC_ENDPOINT_ID ||
      rpc.endpointOrigin !== BSC_TESTNET_PTA_RPC_ORIGIN
    ) {
      issues.push(
        issue(
          "RPC_ENDPOINT_MISMATCH",
          "rpc.endpointOrigin",
          "The observation must come from the pinned official BSC testnet endpoint."
        )
      );
    }
    if (rpc.chainId !== BSC_TESTNET_PTA_CHAIN_ID_DECIMAL) {
      issues.push(
        issue("CHAIN_ID_MISMATCH", "rpc.chainId", "The observed chain ID must be decimal 97.")
      );
    }

    const blockNumber = canonicalNonZeroUint(rpc.blockNumber);
    const blockHash = exactLowerBytes32(rpc.blockHash);
    const blockTimestamp = canonicalNonZeroUint(rpc.blockTimestamp);
    const blockGasLimit = canonicalNonZeroUint(rpc.blockGasLimit);
    const observedAt = canonicalUtc(rpc.observedAt);
    if (
      blockNumber === null ||
      blockHash === null ||
      blockTimestamp === null ||
      blockGasLimit === null ||
      observedAt === null
    ) {
      issues.push(
        issue(
          "BLOCK_OBSERVATION_INVALID",
          "rpc",
          "Block identity, UTC observation time, timestamp, and gas limit must be canonical."
        )
      );
    } else {
      const asOfBigMilliseconds = BigInt(asOfMilliseconds);
      const observedBigMilliseconds = BigInt(observedAt.milliseconds);
      const blockBigMilliseconds = blockTimestamp * 1_000n;
      if (observedAt.milliseconds > asOfMilliseconds) {
        issues.push(
          issue(
            "OBSERVATION_FROM_FUTURE",
            "rpc.observedAt",
            "The RPC observation is later than the injected asOf time."
          )
        );
      } else if (
        asOfMilliseconds - observedAt.milliseconds >
        BSC_TESTNET_PTA_MAX_OBSERVATION_AGE_SECONDS * 1_000
      ) {
        issues.push(
          issue(
            "OBSERVATION_STALE",
            "rpc.observedAt",
            "The RPC observation is too old for a deployment envelope."
          )
        );
      }
      if (blockBigMilliseconds > observedBigMilliseconds) {
        issues.push(
          issue(
            "BLOCK_FROM_FUTURE",
            "rpc.blockTimestamp",
            "The observed block timestamp is later than the RPC observation."
          )
        );
      } else if (
        asOfBigMilliseconds - blockBigMilliseconds >
        BigInt(BSC_TESTNET_PTA_MAX_OBSERVATION_AGE_SECONDS * 1_000)
      ) {
        issues.push(
          issue(
            "BLOCK_STALE",
            "rpc.blockTimestamp",
            "The observed block is too old for a deployment envelope."
          )
        );
      }
    }

    const expiresAt = canonicalUtc(policy.expiresAt);
    if (expiresAt === null) {
      issues.push(
        issue(
          "ENVELOPE_EXPIRY_INVALID",
          "policy.expiresAt",
          "Envelope expiry must be a canonical UTC timestamp."
        )
      );
    } else if (expiresAt.milliseconds <= asOfMilliseconds) {
      issues.push(
        issue("ENVELOPE_EXPIRED", "policy.expiresAt", "The deployment envelope has expired.")
      );
    } else if (
      expiresAt.milliseconds - asOfMilliseconds >
        BSC_TESTNET_PTA_MAX_ENVELOPE_LIFETIME_SECONDS * 1_000 ||
      (observedAt !== null &&
        expiresAt.milliseconds - observedAt.milliseconds >
          BSC_TESTNET_PTA_MAX_ENVELOPE_LIFETIME_SECONDS * 1_000)
    ) {
      issues.push(
        issue(
          "ENVELOPE_LIFETIME_EXCEEDED",
          "policy.expiresAt",
          "Envelope expiry exceeds the bounded five-minute lifetime."
        )
      );
    }

    const latestNonce = canonicalUint(rpc.latestNonce, UINT64_MAX);
    const pendingNonce = canonicalUint(rpc.pendingNonce, UINT64_MAX);
    if (latestNonce === null || pendingNonce === null) {
      issues.push(
        issue("NONCE_INVALID", "rpc.pendingNonce", "Both nonces must be canonical uint64 strings.")
      );
    } else if (latestNonce !== pendingNonce) {
      issues.push(
        issue(
          "NONCE_DRIFT",
          "rpc.pendingNonce",
          "Latest and pending nonce must match; pending transactions are not allowed."
        )
      );
    } else if (latestNonce !== BigInt(BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE)) {
      issues.push(
        issue(
          "DEPLOYER_NONCE_ALREADY_USED",
          "rpc.latestNonce",
          "The exact one-shot PTA deployment requires the unused deployer nonce 0."
        )
      );
    }

    if (rpc.signerCode !== "0x") {
      issues.push(
        issue("SIGNER_CODE_PRESENT", "rpc.signerCode", "The pinned deployer must be an EOA.")
      );
    }

    const suppliedPredictedAddress = canonicalAddress(rpc.predictedContractAddress);
    const predictedContractAddress: Address = BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS;
    if (suppliedPredictedAddress === null) {
      issues.push(
        issue(
          "PREDICTED_ADDRESS_INVALID",
          "rpc.predictedContractAddress",
          "The predicted CREATE address must use its canonical checksum representation."
        )
      );
    } else if (suppliedPredictedAddress !== predictedContractAddress) {
      issues.push(
        issue(
          "PREDICTED_ADDRESS_MISMATCH",
          "rpc.predictedContractAddress",
          "The supplied target does not equal the reviewed CREATE(deployer, nonce 0) address."
        )
      );
    }
    if (rpc.predictedContractCode !== "0x") {
      issues.push(
        issue(
          "TARGET_CODE_PRESENT",
          "rpc.predictedContractCode",
          "The predicted CREATE address already has runtime code."
        )
      );
    }
    if (rpc.predictedContractNonce !== "0") {
      issues.push(
        issue(
          "TARGET_NONCE_NONZERO",
          "rpc.predictedContractNonce",
          "The predicted CREATE address must have transaction count zero."
        )
      );
    }

    const simulationReturnData = exactHexBytes(
      rpc.simulationReturnData,
      BSC_TESTNET_PTA_RUNTIME_BYTES
    );
    if (simulationReturnData === null) {
      issues.push(
        issue(
          "SIMULATION_OUTPUT_INVALID",
          "rpc.simulationReturnData",
          "eth_call must return the exact lowercase 1826-byte runtime payload."
        )
      );
    } else {
      if (sha256(simulationReturnData).slice(2) !== BSC_TESTNET_PTA_RUNTIME_SHA256) {
        issues.push(
          issue(
            "SIMULATION_SHA256_MISMATCH",
            "rpc.simulationReturnData",
            "Simulation output does not match the reviewed runtime SHA-256 digest."
          )
        );
      }
      if (keccak256(simulationReturnData) !== BSC_TESTNET_PTA_RUNTIME_KECCAK256) {
        issues.push(
          issue(
            "SIMULATION_KECCAK_MISMATCH",
            "rpc.simulationReturnData",
            "Simulation output does not match the reviewed runtime Keccak-256 digest."
          )
        );
      }
    }

    if (rpc.feeModel !== "legacy_gas_price") {
      issues.push(
        issue(
          "FEE_MODEL_INVALID",
          "rpc.feeModel",
          "Only an explicit legacy gasPrice transaction is allowed."
        )
      );
    }
    if (policy.gasLimitMarginBps !== BSC_TESTNET_PTA_GAS_MARGIN_BPS) {
      issues.push(
        issue(
          "GAS_MARGIN_POLICY_INVALID",
          "policy.gasLimitMarginBps",
          "The deterministic gas-limit margin must be exactly 2000 basis points."
        )
      );
    }

    const maximumGasLimit = canonicalNonZeroUint(policy.maximumGasLimit);
    if (maximumGasLimit === null || maximumGasLimit > HARD_MAX_GAS_LIMIT) {
      issues.push(
        issue(
          "GAS_LIMIT_POLICY_INVALID",
          "policy.maximumGasLimit",
          "Maximum gas limit must be canonical and no greater than the hard cap."
        )
      );
    }
    const maximumGasPriceWei = canonicalNonZeroUint(policy.maximumGasPriceWei);
    if (maximumGasPriceWei === null || maximumGasPriceWei > HARD_MAX_GAS_PRICE_WEI) {
      issues.push(
        issue(
          "GAS_PRICE_POLICY_INVALID",
          "policy.maximumGasPriceWei",
          "Maximum gas price must be canonical and no greater than the hard cap."
        )
      );
    }
    const maximumTotalCostWei = canonicalNonZeroUint(policy.maximumTotalCostWei);
    if (maximumTotalCostWei === null || maximumTotalCostWei > HARD_MAX_TOTAL_COST_WEI) {
      issues.push(
        issue(
          "TOTAL_COST_POLICY_INVALID",
          "policy.maximumTotalCostWei",
          "Maximum total cost must be canonical and no greater than the hard cap."
        )
      );
    }

    const balanceWei = canonicalUint(rpc.balanceWei);
    if (balanceWei === null) {
      issues.push(
        issue("BALANCE_INVALID", "rpc.balanceWei", "Balance must be a canonical uint256 string.")
      );
    }
    const gasEstimate = canonicalNonZeroUint(rpc.gasEstimate);
    if (gasEstimate === null) {
      issues.push(
        issue(
          "GAS_ESTIMATE_INVALID",
          "rpc.gasEstimate",
          "Gas estimate must be a positive canonical uint256 string."
        )
      );
    }
    const gasPriceWei = canonicalNonZeroUint(rpc.gasPriceWei);
    if (gasPriceWei === null) {
      issues.push(
        issue(
          "GAS_PRICE_INVALID",
          "rpc.gasPriceWei",
          "Legacy gas price must be a positive canonical uint256 string."
        )
      );
    }

    let finances: BscTestnetPtaDeploymentFinances | null = null;
    if (balanceWei !== null && gasEstimate !== null && gasPriceWei !== null) {
      const gasLimit =
        (gasEstimate * (BASIS_POINTS + BigInt(BSC_TESTNET_PTA_GAS_MARGIN_BPS)) +
          BASIS_POINTS -
          1n) /
        BASIS_POINTS;
      const maximumCostWei = gasLimit * gasPriceWei;
      finances = {
        balanceWei: balanceWei.toString(),
        gasEstimate: gasEstimate.toString(),
        gasLimitMarginBps: BSC_TESTNET_PTA_GAS_MARGIN_BPS,
        gasLimit: gasLimit.toString(),
        gasPriceWei: gasPriceWei.toString(),
        maximumCostWei: maximumCostWei.toString()
      };
      if (blockGasLimit !== null && gasLimit > blockGasLimit) {
        issues.push(
          issue(
            "GAS_LIMIT_EXCEEDS_BLOCK",
            "rpc.blockGasLimit",
            "The bounded gas limit exceeds the observed block gas limit."
          )
        );
      }
      if (maximumGasLimit !== null && gasLimit > maximumGasLimit) {
        issues.push(
          issue(
            "GAS_LIMIT_EXCEEDS_POLICY",
            "policy.maximumGasLimit",
            "The bounded gas limit exceeds the reviewed policy cap."
          )
        );
      }
      if (maximumGasPriceWei !== null && gasPriceWei > maximumGasPriceWei) {
        issues.push(
          issue(
            "GAS_PRICE_EXCEEDS_POLICY",
            "policy.maximumGasPriceWei",
            "The observed legacy gas price exceeds the reviewed policy cap."
          )
        );
      }
      if (maximumTotalCostWei !== null && maximumCostWei > maximumTotalCostWei) {
        issues.push(
          issue(
            "TOTAL_COST_EXCEEDS_POLICY",
            "policy.maximumTotalCostWei",
            "The transaction maximum cost exceeds the reviewed policy cap."
          )
        );
      }
      if (maximumCostWei > balanceWei) {
        issues.push(
          issue(
            "INSUFFICIENT_BALANCE",
            "rpc.balanceWei",
            "The pinned deployer balance is below the bounded transaction maximum cost."
          )
        );
      }
    }

    if (
      issues.length > 0 ||
      deploymentData === null ||
      blockNumber === null ||
      blockHash === null ||
      blockTimestamp === null ||
      blockGasLimit === null ||
      observedAt === null ||
      expiresAt === null ||
      latestNonce === null ||
      pendingNonce === null ||
      suppliedPredictedAddress === null ||
      simulationReturnData === null ||
      maximumGasLimit === null ||
      maximumGasPriceWei === null ||
      maximumTotalCostWei === null ||
      finances === null
    ) {
      return blocked(issues, finances, predictedContractAddress);
    }

    const body: EnvelopeBody = {
      schemaVersion: BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_SCHEMA_VERSION,
      operation: BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
      environment: "bsc-testnet",
      chainId: BSC_TESTNET_PTA_CHAIN_ID,
      rpc: {
        endpointId: BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
        endpointOrigin: BSC_TESTNET_PTA_RPC_ORIGIN,
        observedAt: observedAt.iso,
        blockNumber: blockNumber.toString(),
        blockHash,
        blockTimestamp: blockTimestamp.toString(),
        blockGasLimit: blockGasLimit.toString(),
        signerCode: "0x",
        predictedContractCode: "0x",
        predictedContractNonce: "0",
        simulationReturnData
      },
      deployment: {
        from: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
        recipient: BSC_TESTNET_PTA_RECIPIENT_ADDRESS,
        to: null,
        predictedContractAddress,
        deploymentDataSha256: BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256,
        deploymentDataKeccak256: BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256,
        runtimeSha256: BSC_TESTNET_PTA_RUNTIME_SHA256,
        runtimeKeccak256: BSC_TESTNET_PTA_RUNTIME_KECCAK256
      },
      transaction: {
        type: "legacy",
        chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
        from: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
        to: null,
        nonce: BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE,
        data: deploymentData,
        valueWei: "0",
        gasLimit: finances.gasLimit,
        gasPriceWei: finances.gasPriceWei
      },
      finances,
      policy: {
        expiresAt: expiresAt.iso,
        gasLimitMarginBps: BSC_TESTNET_PTA_GAS_MARGIN_BPS,
        maximumGasLimit: maximumGasLimit.toString(),
        maximumGasPriceWei: maximumGasPriceWei.toString(),
        maximumTotalCostWei: maximumTotalCostWei.toString()
      }
    };
    const envelope = deepFreeze({
      ...body,
      hashDomain: BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN,
      envelopeHash: deriveEnvelopeHash(body)
    });
    return deepFreeze({
      status: "validated" as const,
      signingReady: false as const,
      envelopeValid: true as const,
      envelope,
      finances,
      predictedContractAddress,
      issues: [] as const,
      boundary: PURE_BOUNDARY
    });
  } catch {
    return blocked([
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "envelope",
        "Envelope construction failed closed at the untrusted input boundary."
      )
    ]);
  }
}
