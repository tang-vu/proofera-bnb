import { isProxy } from "node:util/types";

import {
  fromRlp,
  getAddress,
  getContractAddress,
  keccak256,
  sha256,
  stringToHex,
  toHex,
  toRlp,
  type Address,
  type Hex
} from "viem";

import {
  BSC_TESTNET_PTA_CHAIN_ID,
  BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
  BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256,
  BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN,
  BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_SCHEMA_VERSION,
  BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
  BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
  BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE,
  BSC_TESTNET_PTA_GAS_MARGIN_BPS,
  BSC_TESTNET_PTA_HARD_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_HARD_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_HARD_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_MAX_ENVELOPE_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_MAX_OBSERVATION_AGE_SECONDS,
  BSC_TESTNET_PTA_RECIPIENT_ADDRESS,
  BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
  BSC_TESTNET_PTA_RPC_ORIGIN,
  BSC_TESTNET_PTA_RUNTIME_BYTES,
  BSC_TESTNET_PTA_RUNTIME_KECCAK256,
  BSC_TESTNET_PTA_RUNTIME_SHA256
} from "./bsc-testnet-pta-deployment-envelope";

export const BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_SCHEMA_VERSION = 1 as const;
export const BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_FORMAT =
  "legacy_eip155_unsigned_contract_creation" as const;

const UINT256_MAX = (1n << 256n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
const BASIS_POINTS = 10_000n;
const HARD_MAX_GAS_LIMIT = BigInt(BSC_TESTNET_PTA_HARD_MAX_GAS_LIMIT);
const HARD_MAX_GAS_PRICE_WEI = BigInt(BSC_TESTNET_PTA_HARD_MAX_GAS_PRICE_WEI);
const HARD_MAX_TOTAL_COST_WEI = BigInt(BSC_TESTNET_PTA_HARD_MAX_TOTAL_COST_WEI);
const EXACT_DEPLOYMENT_NONCE = BigInt(BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE);

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export type BscTestnetPtaUnsignedTransactionIssueCode =
  | "INPUT_INVALID"
  | "OPTIONS_INVALID"
  | "CLOCK_INVALID"
  | "ENVELOPE_METADATA_MISMATCH"
  | "ENVELOPE_HASH_INVALID"
  | "ENVELOPE_HASH_MISMATCH"
  | "RPC_METADATA_MISMATCH"
  | "RPC_OBSERVATION_INVALID"
  | "RPC_OBSERVATION_FROM_FUTURE"
  | "RPC_OBSERVATION_STALE"
  | "BLOCK_FROM_FUTURE"
  | "BLOCK_STALE"
  | "DEPLOYMENT_METADATA_MISMATCH"
  | "DEPLOYMENT_DATA_INVALID"
  | "DEPLOYMENT_DATA_DIGEST_MISMATCH"
  | "SIMULATION_OUTPUT_INVALID"
  | "SIMULATION_DIGEST_MISMATCH"
  | "TRANSACTION_METADATA_MISMATCH"
  | "NONCE_INVALID"
  | "PREDICTED_ADDRESS_INVALID"
  | "PREDICTED_ADDRESS_MISMATCH"
  | "FINANCES_INVALID"
  | "FINANCES_MISMATCH"
  | "POLICY_INVALID"
  | "ENVELOPE_EXPIRED"
  | "ENVELOPE_LIFETIME_EXCEEDED"
  | "GAS_LIMIT_EXCEEDS_BLOCK"
  | "GAS_LIMIT_EXCEEDS_POLICY"
  | "GAS_PRICE_EXCEEDS_POLICY"
  | "TOTAL_COST_EXCEEDS_POLICY"
  | "INSUFFICIENT_BALANCE"
  | "SERIALIZATION_INVALID"
  | "SERIALIZATION_ROUND_TRIP_MISMATCH"
  | "INTERNAL_VALIDATION_ERROR";

export interface BscTestnetPtaUnsignedTransactionIssue {
  readonly code: BscTestnetPtaUnsignedTransactionIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface BscTestnetPtaUnsignedTransactionOptions {
  readonly asOf: () => Date;
}

const PURE_UNSIGNED_BOUNDARY = Object.freeze({
  scope: "exact_bsc_testnet_pta_unsigned_transaction_only" as const,
  sourceEnvelopeAuthenticityEstablished: false,
  rpcProvenanceAuthenticated: false,
  freshSignerSideRpcRecheckPerformed: false,
  rpcReadPerformed: false,
  environmentRead: false,
  secretRead: false,
  signerCreated: false,
  signatureCreated: false,
  signedTransactionCreated: false,
  transactionSubmitted: false,
  blockchainWritePerformed: false,
  executionAuthorized: false,
  signingAuthorized: false
});

export interface BscTestnetPtaEip155SigningPayload {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_SCHEMA_VERSION;
  readonly format: typeof BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_FORMAT;
  readonly environment: "bsc-testnet";
  readonly chainId: typeof BSC_TESTNET_PTA_CHAIN_ID_DECIMAL;
  readonly expectedSigner: Readonly<{
    address: typeof BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
    role: "pta_testnet_deployer";
    requiredAccountType: "eoa";
    observedCode: "0x";
  }>;
  readonly deployment: Readonly<{
    constructorRecipient: typeof BSC_TESTNET_PTA_RECIPIENT_ADDRESS;
    predictedContractAddress: Address;
    data: Hex;
    dataBytes: typeof BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES;
    dataSha256: typeof BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256;
    dataKeccak256: typeof BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256;
    runtimeBytes: typeof BSC_TESTNET_PTA_RUNTIME_BYTES;
    runtimeSha256: typeof BSC_TESTNET_PTA_RUNTIME_SHA256;
    runtimeKeccak256: typeof BSC_TESTNET_PTA_RUNTIME_KECCAK256;
  }>;
  readonly transaction: Readonly<{
    type: "legacy";
    eip155ReplayProtection: true;
    contractCreation: true;
    from: typeof BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
    to: null;
    nonce: string;
    valueWei: "0";
    gasLimit: string;
    gasPriceWei: string;
    maximumCostWei: string;
  }>;
  readonly policy: Readonly<{
    expiresAt: string;
    maximumGasLimit: string;
    maximumGasPriceWei: string;
    maximumTotalCostWei: string;
  }>;
  readonly sourceEnvelopeHash: Hex;
  readonly serializedSigningPayload: Hex;
  readonly serializedSigningPayloadBytes: number;
  readonly signingHash: Hex;
  readonly rlp: Readonly<{
    fieldCount: 9;
    chainId: typeof BSC_TESTNET_PTA_CHAIN_ID_DECIMAL;
    signatureR: "0x";
    signatureS: "0x";
  }>;
  readonly signatureIncluded: false;
  readonly broadcastable: false;
  readonly signingAuthorized: false;
}

export type BscTestnetPtaUnsignedTransactionResult = DeepReadonly<
  | {
      status: "blocked";
      signingPayloadValid: false;
      signingReady: false;
      signingPayload: null;
      issues: readonly BscTestnetPtaUnsignedTransactionIssue[];
      boundary: typeof PURE_UNSIGNED_BOUNDARY;
    }
  | {
      status: "signing_payload_serialized";
      signingPayloadValid: true;
      signingReady: false;
      signingPayload: BscTestnetPtaEip155SigningPayload;
      issues: readonly never[];
      boundary: typeof PURE_UNSIGNED_BOUNDARY;
    }
>;

type DataRecord = Readonly<Record<string, unknown>>;

type InspectedEnvelope = Readonly<{
  schemaVersion: unknown;
  operation: unknown;
  environment: unknown;
  chainId: unknown;
  rpc: DataRecord;
  deployment: DataRecord;
  transaction: DataRecord;
  finances: DataRecord;
  policy: DataRecord;
  hashDomain: unknown;
  envelopeHash: unknown;
}>;

const ENVELOPE_KEYS = [
  "chainId",
  "deployment",
  "envelopeHash",
  "environment",
  "finances",
  "hashDomain",
  "operation",
  "policy",
  "rpc",
  "schemaVersion",
  "transaction"
] as const;
const RPC_KEYS = [
  "blockGasLimit",
  "blockHash",
  "blockNumber",
  "blockTimestamp",
  "endpointId",
  "endpointOrigin",
  "observedAt",
  "predictedContractCode",
  "predictedContractNonce",
  "signerCode",
  "simulationReturnData"
] as const;
const DEPLOYMENT_KEYS = [
  "deploymentDataKeccak256",
  "deploymentDataSha256",
  "from",
  "predictedContractAddress",
  "recipient",
  "runtimeKeccak256",
  "runtimeSha256",
  "to"
] as const;
const TRANSACTION_KEYS = [
  "chainId",
  "data",
  "from",
  "gasLimit",
  "gasPriceWei",
  "nonce",
  "to",
  "type",
  "valueWei"
] as const;
const FINANCES_KEYS = [
  "balanceWei",
  "gasEstimate",
  "gasLimit",
  "gasLimitMarginBps",
  "gasPriceWei",
  "maximumCostWei"
] as const;
const POLICY_KEYS = [
  "expiresAt",
  "gasLimitMarginBps",
  "maximumGasLimit",
  "maximumGasPriceWei",
  "maximumTotalCostWei"
] as const;

function inspectDataRecord(value: unknown, expectedKeys: readonly string[]): DataRecord | null {
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

function inspectEnvelope(value: unknown): InspectedEnvelope | null {
  const root = inspectDataRecord(value, ENVELOPE_KEYS);
  if (root === null) return null;
  const rpc = inspectDataRecord(root.rpc, RPC_KEYS);
  const deployment = inspectDataRecord(root.deployment, DEPLOYMENT_KEYS);
  const transaction = inspectDataRecord(root.transaction, TRANSACTION_KEYS);
  const finances = inspectDataRecord(root.finances, FINANCES_KEYS);
  const policy = inspectDataRecord(root.policy, POLICY_KEYS);
  if (
    rpc === null ||
    deployment === null ||
    transaction === null ||
    finances === null ||
    policy === null
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: root.schemaVersion,
    operation: root.operation,
    environment: root.environment,
    chainId: root.chainId,
    rpc,
    deployment,
    transaction,
    finances,
    policy,
    hashDomain: root.hashDomain,
    envelopeHash: root.envelopeHash
  });
}

function inspectAsOf(value: unknown): (() => unknown) | null {
  const options = inspectDataRecord(value, ["asOf"]);
  if (
    options === null ||
    typeof options.asOf !== "function" ||
    isProxy(options.asOf) ||
    Object.getPrototypeOf(options.asOf) !== Function.prototype
  ) {
    return null;
  }
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
  code: BscTestnetPtaUnsignedTransactionIssueCode,
  path: string,
  message: string
): BscTestnetPtaUnsignedTransactionIssue {
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

function deriveEnvelopeHash(body: unknown): Hex {
  return keccak256(
    stringToHex(
      `${BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN}\u0000${JSON.stringify(
        recursivelySortJsonKeys(body)
      )}`
    )
  );
}

function blocked(
  issues: readonly BscTestnetPtaUnsignedTransactionIssue[]
): BscTestnetPtaUnsignedTransactionResult {
  const retained = [...issues];
  if (retained.length === 0) {
    retained.push(
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "signingPayload",
        "EIP-155 signing-payload construction stopped without a specific validation issue."
      )
    );
  }
  return deepFreeze({
    status: "blocked" as const,
    signingPayloadValid: false as const,
    signingReady: false as const,
    signingPayload: null,
    issues: retained,
    boundary: PURE_UNSIGNED_BOUNDARY
  });
}

function encodeRlpUint(value: bigint): Hex {
  return value === 0n ? "0x" : toHex(value);
}

type FlatNineHex = readonly [Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex];

function inspectNineHexFields(value: unknown): FlatNineHex | null {
  if (!Array.isArray(value) || value.length !== 9) return null;
  const result: Hex[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !/^0x(?:[0-9a-f]{2})*$/u.test(entry)) return null;
    result.push(entry as Hex);
  }
  const [first, second, third, fourth, fifth, sixth, seventh, eighth, ninth] = result;
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    fifth === undefined ||
    sixth === undefined ||
    seventh === undefined ||
    eighth === undefined ||
    ninth === undefined
  ) {
    return null;
  }
  return [first, second, third, fourth, fifth, sixth, seventh, eighth, ninth];
}

function canonicalRlpUint(value: Hex, maximum = UINT256_MAX): bigint | null {
  if (value === "0x") return 0n;
  if (!/^0x[0-9a-f]{2,}$/u.test(value) || value.slice(2, 4) === "00") return null;
  try {
    const parsed = BigInt(value);
    return parsed > 0n && parsed <= maximum ? parsed : null;
  } catch {
    return null;
  }
}

function serializeAndVerifySigningPayload(input: {
  readonly nonce: bigint;
  readonly gasPriceWei: bigint;
  readonly gasLimit: bigint;
  readonly deploymentData: Hex;
}):
  | Readonly<{ serialized: Hex; signingHash: Hex; bytes: number }>
  | BscTestnetPtaUnsignedTransactionIssue {
  try {
    const fields = [
      encodeRlpUint(input.nonce),
      encodeRlpUint(input.gasPriceWei),
      encodeRlpUint(input.gasLimit),
      "0x",
      "0x",
      input.deploymentData,
      encodeRlpUint(BigInt(BSC_TESTNET_PTA_CHAIN_ID)),
      "0x",
      "0x"
    ] as const satisfies readonly Hex[];
    const serialized = toRlp(fields, "hex");
    const decoded = inspectNineHexFields(fromRlp(serialized, "hex"));
    if (decoded === null) {
      return issue(
        "SERIALIZATION_INVALID",
        "serializedSigningPayload",
        "The EIP-155 signing payload did not decode to exactly nine flat RLP fields."
      );
    }
    const decodedNonce = canonicalRlpUint(decoded[0], UINT64_MAX);
    const decodedGasPrice = canonicalRlpUint(decoded[1]);
    const decodedGasLimit = canonicalRlpUint(decoded[2]);
    const decodedChainId = canonicalRlpUint(decoded[6]);
    if (
      decodedNonce !== input.nonce ||
      decodedGasPrice !== input.gasPriceWei ||
      decodedGasLimit !== input.gasLimit ||
      decoded[3] !== "0x" ||
      decoded[4] !== "0x" ||
      decoded[5] !== input.deploymentData ||
      decodedChainId !== BigInt(BSC_TESTNET_PTA_CHAIN_ID) ||
      decoded[7] !== "0x" ||
      decoded[8] !== "0x" ||
      toRlp(decoded, "hex") !== serialized
    ) {
      return issue(
        "SERIALIZATION_ROUND_TRIP_MISMATCH",
        "serializedSigningPayload",
        "The unsigned legacy transaction failed its canonical EIP-155 RLP round trip."
      );
    }
    return {
      serialized,
      signingHash: keccak256(serialized),
      bytes: (serialized.length - 2) / 2
    };
  } catch {
    return issue(
      "SERIALIZATION_INVALID",
      "serializedSigningPayload",
      "The unsigned legacy EIP-155 transaction could not be serialized safely."
    );
  }
}

/**
 * Revalidates one exact PTA deployment envelope and serializes only its unsigned
 * legacy EIP-155 signing payload. The output is deliberately non-broadcastable:
 * it contains empty r/s fields, creates no signer or signature, authenticates no
 * RPC provider, and never authorizes signing or execution.
 */
export function buildBscTestnetPtaUnsignedTransaction(
  untrustedEnvelope: unknown,
  untrustedOptions: unknown
): BscTestnetPtaUnsignedTransactionResult {
  try {
    const envelope = inspectEnvelope(untrustedEnvelope);
    if (envelope === null) {
      return blocked([
        issue(
          "INPUT_INVALID",
          "envelope",
          "Envelope must use the exact JSON-safe PTA shape and own data properties."
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

    const issues: BscTestnetPtaUnsignedTransactionIssue[] = [];
    const rpc = envelope.rpc;
    const deployment = envelope.deployment;
    const transaction = envelope.transaction;
    const finances = envelope.finances;
    const policy = envelope.policy;

    if (
      envelope.schemaVersion !== BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_SCHEMA_VERSION ||
      envelope.operation !== BSC_TESTNET_PTA_DEPLOYMENT_OPERATION ||
      envelope.environment !== "bsc-testnet" ||
      envelope.chainId !== BSC_TESTNET_PTA_CHAIN_ID ||
      envelope.hashDomain !== BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN
    ) {
      issues.push(
        issue(
          "ENVELOPE_METADATA_MISMATCH",
          "envelope",
          "Envelope metadata must identify the exact reviewed PTA deployment on BSC testnet."
        )
      );
    }
    const suppliedEnvelopeHash = exactLowerHex(envelope.envelopeHash, 32);
    if (suppliedEnvelopeHash === null || suppliedEnvelopeHash === `0x${"00".repeat(32)}`) {
      issues.push(
        issue(
          "ENVELOPE_HASH_INVALID",
          "envelope.envelopeHash",
          "Envelope hash must be a non-zero lowercase bytes32 value."
        )
      );
    }

    if (
      rpc.endpointId !== BSC_TESTNET_PTA_RPC_ENDPOINT_ID ||
      rpc.endpointOrigin !== BSC_TESTNET_PTA_RPC_ORIGIN ||
      rpc.signerCode !== "0x" ||
      rpc.predictedContractCode !== "0x" ||
      rpc.predictedContractNonce !== "0"
    ) {
      issues.push(
        issue(
          "RPC_METADATA_MISMATCH",
          "envelope.rpc",
          "RPC metadata must retain the pinned endpoint and empty signer/target state."
        )
      );
    }

    const observedAt = canonicalUtc(rpc.observedAt);
    const blockNumber = canonicalNonZeroUint(rpc.blockNumber);
    const blockHash = exactLowerHex(rpc.blockHash, 32);
    const blockTimestamp = canonicalNonZeroUint(rpc.blockTimestamp);
    const blockGasLimit = canonicalNonZeroUint(rpc.blockGasLimit);
    if (
      observedAt === null ||
      blockNumber === null ||
      blockHash === null ||
      blockHash === `0x${"00".repeat(32)}` ||
      blockTimestamp === null ||
      blockGasLimit === null
    ) {
      issues.push(
        issue(
          "RPC_OBSERVATION_INVALID",
          "envelope.rpc",
          "RPC observation identity, timestamp, and gas limit must be canonical."
        )
      );
    } else {
      const observedMilliseconds = BigInt(observedAt.milliseconds);
      const asOfBigMilliseconds = BigInt(asOfMilliseconds);
      const blockMilliseconds = blockTimestamp * 1_000n;
      if (observedAt.milliseconds > asOfMilliseconds) {
        issues.push(
          issue(
            "RPC_OBSERVATION_FROM_FUTURE",
            "envelope.rpc.observedAt",
            "RPC observation is later than the injected asOf time."
          )
        );
      } else if (
        asOfMilliseconds - observedAt.milliseconds >
        BSC_TESTNET_PTA_MAX_OBSERVATION_AGE_SECONDS * 1_000
      ) {
        issues.push(
          issue(
            "RPC_OBSERVATION_STALE",
            "envelope.rpc.observedAt",
            "RPC observation is too old to serialize an EIP-155 signing payload."
          )
        );
      }
      if (blockMilliseconds > observedMilliseconds) {
        issues.push(
          issue(
            "BLOCK_FROM_FUTURE",
            "envelope.rpc.blockTimestamp",
            "Observed block timestamp is later than the RPC observation."
          )
        );
      } else if (
        asOfBigMilliseconds - blockMilliseconds >
        BigInt(BSC_TESTNET_PTA_MAX_OBSERVATION_AGE_SECONDS * 1_000)
      ) {
        issues.push(
          issue(
            "BLOCK_STALE",
            "envelope.rpc.blockTimestamp",
            "Observed block is too old to serialize an EIP-155 signing payload."
          )
        );
      }
    }

    if (
      deployment.from !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS ||
      deployment.recipient !== BSC_TESTNET_PTA_RECIPIENT_ADDRESS ||
      deployment.to !== null ||
      deployment.deploymentDataSha256 !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 ||
      deployment.deploymentDataKeccak256 !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256 ||
      deployment.runtimeSha256 !== BSC_TESTNET_PTA_RUNTIME_SHA256 ||
      deployment.runtimeKeccak256 !== BSC_TESTNET_PTA_RUNTIME_KECCAK256
    ) {
      issues.push(
        issue(
          "DEPLOYMENT_METADATA_MISMATCH",
          "envelope.deployment",
          "Deployment metadata must pin the exact deployer, recipient, and reviewed digests."
        )
      );
    }

    const deploymentData = exactLowerHex(transaction.data, BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES);
    if (deploymentData === null) {
      issues.push(
        issue(
          "DEPLOYMENT_DATA_INVALID",
          "envelope.transaction.data",
          "Creation data must be the exact lowercase 2947-byte payload."
        )
      );
    } else if (
      sha256(deploymentData).slice(2) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 ||
      keccak256(deploymentData) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256
    ) {
      issues.push(
        issue(
          "DEPLOYMENT_DATA_DIGEST_MISMATCH",
          "envelope.transaction.data",
          "Creation data does not match both reviewed artifact digests."
        )
      );
    }

    const simulationReturnData = exactLowerHex(
      rpc.simulationReturnData,
      BSC_TESTNET_PTA_RUNTIME_BYTES
    );
    if (simulationReturnData === null) {
      issues.push(
        issue(
          "SIMULATION_OUTPUT_INVALID",
          "envelope.rpc.simulationReturnData",
          "Simulation output must be the exact lowercase 1826-byte runtime."
        )
      );
    } else if (
      sha256(simulationReturnData).slice(2) !== BSC_TESTNET_PTA_RUNTIME_SHA256 ||
      keccak256(simulationReturnData) !== BSC_TESTNET_PTA_RUNTIME_KECCAK256
    ) {
      issues.push(
        issue(
          "SIMULATION_DIGEST_MISMATCH",
          "envelope.rpc.simulationReturnData",
          "Simulation output does not match both reviewed runtime digests."
        )
      );
    }

    if (
      transaction.type !== "legacy" ||
      transaction.chainId !== BSC_TESTNET_PTA_CHAIN_ID_DECIMAL ||
      transaction.from !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS ||
      transaction.to !== null ||
      transaction.valueWei !== "0"
    ) {
      issues.push(
        issue(
          "TRANSACTION_METADATA_MISMATCH",
          "envelope.transaction",
          "Transaction must be the exact zero-value legacy chain-97 contract creation."
        )
      );
    }

    const nonce = canonicalUint(transaction.nonce, UINT64_MAX);
    if (nonce === null || nonce !== EXACT_DEPLOYMENT_NONCE) {
      issues.push(
        issue(
          "NONCE_INVALID",
          "envelope.transaction.nonce",
          "The exact one-shot PTA deployment nonce must be canonical decimal zero."
        )
      );
    }
    const suppliedPredictedAddress = canonicalAddress(deployment.predictedContractAddress);
    let predictedContractAddress: Address | null = null;
    if (nonce !== null) {
      predictedContractAddress = getContractAddress({
        from: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
        nonce
      });
    }
    if (
      suppliedPredictedAddress === null ||
      suppliedPredictedAddress !== BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS
    ) {
      issues.push(
        issue(
          "PREDICTED_ADDRESS_INVALID",
          "envelope.deployment.predictedContractAddress",
          "Predicted CREATE address must equal the exact reviewed nonce-zero target."
        )
      );
    } else if (
      predictedContractAddress !== null &&
      suppliedPredictedAddress !== predictedContractAddress
    ) {
      issues.push(
        issue(
          "PREDICTED_ADDRESS_MISMATCH",
          "envelope.deployment.predictedContractAddress",
          "Predicted target must equal CREATE(pinned deployer, transaction nonce)."
        )
      );
    }

    const balanceWei = canonicalUint(finances.balanceWei);
    const gasEstimate = canonicalNonZeroUint(finances.gasEstimate);
    const financeGasLimit = canonicalNonZeroUint(finances.gasLimit);
    const financeGasPriceWei = canonicalNonZeroUint(finances.gasPriceWei);
    const financeMaximumCostWei = canonicalNonZeroUint(finances.maximumCostWei);
    const transactionGasLimit = canonicalNonZeroUint(transaction.gasLimit);
    const transactionGasPriceWei = canonicalNonZeroUint(transaction.gasPriceWei);
    if (
      balanceWei === null ||
      gasEstimate === null ||
      financeGasLimit === null ||
      financeGasPriceWei === null ||
      financeMaximumCostWei === null ||
      transactionGasLimit === null ||
      transactionGasPriceWei === null ||
      finances.gasLimitMarginBps !== BSC_TESTNET_PTA_GAS_MARGIN_BPS
    ) {
      issues.push(
        issue(
          "FINANCES_INVALID",
          "envelope.finances",
          "Balances and legacy fee fields must be canonical decimal uint256 strings."
        )
      );
    } else {
      const expectedGasLimit =
        (gasEstimate * (BASIS_POINTS + BigInt(BSC_TESTNET_PTA_GAS_MARGIN_BPS)) +
          BASIS_POINTS -
          1n) /
        BASIS_POINTS;
      const expectedMaximumCost = transactionGasLimit * transactionGasPriceWei;
      if (
        financeGasLimit !== transactionGasLimit ||
        financeGasPriceWei !== transactionGasPriceWei ||
        financeGasLimit !== expectedGasLimit ||
        financeMaximumCostWei !== expectedMaximumCost
      ) {
        issues.push(
          issue(
            "FINANCES_MISMATCH",
            "envelope.finances",
            "Envelope finances must exactly match the transaction and reviewed gas margin."
          )
        );
      }
      if (blockGasLimit !== null && transactionGasLimit > blockGasLimit) {
        issues.push(
          issue(
            "GAS_LIMIT_EXCEEDS_BLOCK",
            "envelope.transaction.gasLimit",
            "Transaction gas limit exceeds the observed block gas limit."
          )
        );
      }
      if (balanceWei < expectedMaximumCost) {
        issues.push(
          issue(
            "INSUFFICIENT_BALANCE",
            "envelope.finances.balanceWei",
            "Pinned deployer balance is below the transaction maximum cost."
          )
        );
      }
    }

    const expiresAt = canonicalUtc(policy.expiresAt);
    const maximumGasLimit = canonicalNonZeroUint(policy.maximumGasLimit);
    const maximumGasPriceWei = canonicalNonZeroUint(policy.maximumGasPriceWei);
    const maximumTotalCostWei = canonicalNonZeroUint(policy.maximumTotalCostWei);
    if (
      expiresAt === null ||
      maximumGasLimit === null ||
      maximumGasLimit > HARD_MAX_GAS_LIMIT ||
      maximumGasPriceWei === null ||
      maximumGasPriceWei > HARD_MAX_GAS_PRICE_WEI ||
      maximumTotalCostWei === null ||
      maximumTotalCostWei > HARD_MAX_TOTAL_COST_WEI ||
      policy.gasLimitMarginBps !== BSC_TESTNET_PTA_GAS_MARGIN_BPS
    ) {
      issues.push(
        issue(
          "POLICY_INVALID",
          "envelope.policy",
          "Expiry and fee caps must be canonical and no greater than reviewed hard caps."
        )
      );
    } else {
      if (expiresAt.milliseconds <= asOfMilliseconds) {
        issues.push(
          issue("ENVELOPE_EXPIRED", "envelope.policy.expiresAt", "Envelope has expired.")
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
            "envelope.policy.expiresAt",
            "Envelope expiry exceeds the reviewed five-minute lifetime."
          )
        );
      }
      if (transactionGasLimit !== null && transactionGasLimit > maximumGasLimit) {
        issues.push(
          issue(
            "GAS_LIMIT_EXCEEDS_POLICY",
            "envelope.transaction.gasLimit",
            "Transaction gas limit exceeds its envelope cap."
          )
        );
      }
      if (transactionGasPriceWei !== null && transactionGasPriceWei > maximumGasPriceWei) {
        issues.push(
          issue(
            "GAS_PRICE_EXCEEDS_POLICY",
            "envelope.transaction.gasPriceWei",
            "Transaction gas price exceeds its envelope cap."
          )
        );
      }
      if (
        transactionGasLimit !== null &&
        transactionGasPriceWei !== null &&
        transactionGasLimit * transactionGasPriceWei > maximumTotalCostWei
      ) {
        issues.push(
          issue(
            "TOTAL_COST_EXCEEDS_POLICY",
            "envelope.policy.maximumTotalCostWei",
            "Transaction maximum cost exceeds its envelope cap."
          )
        );
      }
    }

    if (
      issues.length > 0 ||
      suppliedEnvelopeHash === null ||
      observedAt === null ||
      blockNumber === null ||
      blockHash === null ||
      blockTimestamp === null ||
      blockGasLimit === null ||
      deploymentData === null ||
      simulationReturnData === null ||
      nonce === null ||
      suppliedPredictedAddress === null ||
      predictedContractAddress === null ||
      balanceWei === null ||
      gasEstimate === null ||
      financeGasLimit === null ||
      financeGasPriceWei === null ||
      financeMaximumCostWei === null ||
      transactionGasLimit === null ||
      transactionGasPriceWei === null ||
      expiresAt === null ||
      maximumGasLimit === null ||
      maximumGasPriceWei === null ||
      maximumTotalCostWei === null
    ) {
      return blocked(issues);
    }

    const canonicalEnvelopeBody = {
      schemaVersion: BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_SCHEMA_VERSION,
      operation: BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
      environment: "bsc-testnet" as const,
      chainId: BSC_TESTNET_PTA_CHAIN_ID,
      rpc: {
        endpointId: BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
        endpointOrigin: BSC_TESTNET_PTA_RPC_ORIGIN,
        observedAt: observedAt.iso,
        blockNumber: blockNumber.toString(),
        blockHash,
        blockTimestamp: blockTimestamp.toString(),
        blockGasLimit: blockGasLimit.toString(),
        signerCode: "0x" as const,
        predictedContractCode: "0x" as const,
        predictedContractNonce: "0" as const,
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
        type: "legacy" as const,
        chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
        from: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
        to: null,
        nonce: nonce.toString(),
        data: deploymentData,
        valueWei: "0" as const,
        gasLimit: transactionGasLimit.toString(),
        gasPriceWei: transactionGasPriceWei.toString()
      },
      finances: {
        balanceWei: balanceWei.toString(),
        gasEstimate: gasEstimate.toString(),
        gasLimitMarginBps: BSC_TESTNET_PTA_GAS_MARGIN_BPS,
        gasLimit: financeGasLimit.toString(),
        gasPriceWei: financeGasPriceWei.toString(),
        maximumCostWei: financeMaximumCostWei.toString()
      },
      policy: {
        expiresAt: expiresAt.iso,
        gasLimitMarginBps: BSC_TESTNET_PTA_GAS_MARGIN_BPS,
        maximumGasLimit: maximumGasLimit.toString(),
        maximumGasPriceWei: maximumGasPriceWei.toString(),
        maximumTotalCostWei: maximumTotalCostWei.toString()
      }
    };
    if (deriveEnvelopeHash(canonicalEnvelopeBody) !== suppliedEnvelopeHash) {
      return blocked([
        issue(
          "ENVELOPE_HASH_MISMATCH",
          "envelope.envelopeHash",
          "Envelope hash does not match its canonical PTA body."
        )
      ]);
    }

    const serialized = serializeAndVerifySigningPayload({
      nonce,
      gasPriceWei: transactionGasPriceWei,
      gasLimit: transactionGasLimit,
      deploymentData
    });
    if ("code" in serialized) return blocked([serialized]);

    const signingPayload: BscTestnetPtaEip155SigningPayload = {
      schemaVersion: BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_SCHEMA_VERSION,
      format: BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_FORMAT,
      environment: "bsc-testnet",
      chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
      expectedSigner: {
        address: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
        role: "pta_testnet_deployer",
        requiredAccountType: "eoa",
        observedCode: "0x"
      },
      deployment: {
        constructorRecipient: BSC_TESTNET_PTA_RECIPIENT_ADDRESS,
        predictedContractAddress,
        data: deploymentData,
        dataBytes: BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES,
        dataSha256: BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256,
        dataKeccak256: BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256,
        runtimeBytes: BSC_TESTNET_PTA_RUNTIME_BYTES,
        runtimeSha256: BSC_TESTNET_PTA_RUNTIME_SHA256,
        runtimeKeccak256: BSC_TESTNET_PTA_RUNTIME_KECCAK256
      },
      transaction: {
        type: "legacy",
        eip155ReplayProtection: true,
        contractCreation: true,
        from: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
        to: null,
        nonce: nonce.toString(),
        valueWei: "0",
        gasLimit: transactionGasLimit.toString(),
        gasPriceWei: transactionGasPriceWei.toString(),
        maximumCostWei: financeMaximumCostWei.toString()
      },
      policy: {
        expiresAt: expiresAt.iso,
        maximumGasLimit: maximumGasLimit.toString(),
        maximumGasPriceWei: maximumGasPriceWei.toString(),
        maximumTotalCostWei: maximumTotalCostWei.toString()
      },
      sourceEnvelopeHash: suppliedEnvelopeHash,
      serializedSigningPayload: serialized.serialized,
      serializedSigningPayloadBytes: serialized.bytes,
      signingHash: serialized.signingHash,
      rlp: {
        fieldCount: 9,
        chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
        signatureR: "0x",
        signatureS: "0x"
      },
      signatureIncluded: false,
      broadcastable: false,
      signingAuthorized: false
    };
    return deepFreeze({
      status: "signing_payload_serialized" as const,
      signingPayloadValid: true as const,
      signingReady: false as const,
      signingPayload,
      issues: [] as const,
      boundary: PURE_UNSIGNED_BOUNDARY
    });
  } catch {
    return blocked([
      issue(
        "INTERNAL_VALIDATION_ERROR",
        "signingPayload",
        "EIP-155 signing-payload construction failed closed at the untrusted input boundary."
      )
    ]);
  }
}
