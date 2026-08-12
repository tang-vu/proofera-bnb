import { isProxy } from "node:util/types";

import {
  fromRlp,
  getAddress,
  getContractAddress,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
  sha256,
  stringToHex,
  toRlp,
  type Address,
  type Hex,
  type TransactionSerialized
} from "viem";

import {
  BSC_TESTNET_PTA_CHAIN_ID,
  BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
  BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256,
  BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
  BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE,
  BSC_TESTNET_PTA_HARD_MAX_GAS_LIMIT,
  BSC_TESTNET_PTA_HARD_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_HARD_MAX_TOTAL_COST_WEI,
  BSC_TESTNET_PTA_MAX_ENVELOPE_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_RECIPIENT_ADDRESS,
  BSC_TESTNET_PTA_RUNTIME_BYTES,
  BSC_TESTNET_PTA_RUNTIME_KECCAK256,
  BSC_TESTNET_PTA_RUNTIME_SHA256
} from "./bsc-testnet-pta-deployment-envelope";
import {
  BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_FORMAT,
  BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_SCHEMA_VERSION,
  type BscTestnetPtaEip155SigningPayload
} from "./bsc-testnet-pta-unsigned-transaction";

export const BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCHEMA_VERSION = 1 as const;
export const BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE =
  "exact_bsc_testnet_pta_deployment_after_fresh_rpc_recheck" as const;
export const BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_MAX_AGE_SECONDS = 60 as const;
export const BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID =
  "proofera:bsc-testnet:97:pta-fixed-test-asset:deployer-nonce-0:v1" as const;
export const BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION = 1 as const;
export const BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION =
  "sign_exact_bsc_testnet_pta_contract_creation" as const;
export const BSC_TESTNET_PTA_SIGNING_WORKER_REQUEST_HASH_DOMAIN =
  "proofera.bsc-testnet.pta-signing-worker-request.v1" as const;

const UINT256_MAX = (1n << 256n) - 1n;
const SECP256K1_ORDER = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"
);
const SECP256K1_HALF_ORDER = SECP256K1_ORDER / 2n;
const HARD_MAX_GAS_LIMIT = BigInt(BSC_TESTNET_PTA_HARD_MAX_GAS_LIMIT);
const HARD_MAX_GAS_PRICE_WEI = BigInt(BSC_TESTNET_PTA_HARD_MAX_GAS_PRICE_WEI);
const HARD_MAX_TOTAL_COST_WEI = BigInt(BSC_TESTNET_PTA_HARD_MAX_TOTAL_COST_WEI);
const MAXIMUM_SIGNED_TRANSACTION_BYTES = 4_096;

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export interface BscTestnetPtaFreshSigningCapability {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCHEMA_VERSION;
  readonly scope: typeof BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE;
  readonly authenticatedAt: string;
  readonly freshSignerSideRpcRecheckPerformed: true;
  readonly signingPayload: BscTestnetPtaEip155SigningPayload;
}

export type BscTestnetPtaWorkerProtocolIssueCode =
  | "CAPABILITY_INVALID"
  | "CAPABILITY_FROM_FUTURE"
  | "CAPABILITY_STALE"
  | "CAPABILITY_EXPIRED"
  | "SIGNING_PAYLOAD_INVALID"
  | "SIGNING_PAYLOAD_MISMATCH"
  | "POLICY_EXCEEDED"
  | "CLAIM_ID_INVALID"
  | "WORKER_REQUEST_INVALID"
  | "WORKER_RESPONSE_INVALID"
  | "SIGNED_TRANSACTION_INVALID"
  | "SIGNED_TRANSACTION_MISMATCH"
  | "SIGNER_MISMATCH";

export interface BscTestnetPtaWorkerProtocolIssue {
  readonly code: BscTestnetPtaWorkerProtocolIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface BscTestnetPtaValidatedSigningIntent {
  readonly authenticatedAt: string;
  readonly expiresAt: string;
  readonly sourceEnvelopeHash: Hex;
  readonly serializedSigningPayload: Hex;
  readonly signingHash: Hex;
  readonly deploymentData: Hex;
  readonly gasLimit: string;
  readonly gasPriceWei: string;
  readonly maximumCostWei: string;
}

export interface BscTestnetPtaSigningWorkerRequest {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION;
  readonly environment: "bsc-testnet";
  readonly chainId: typeof BSC_TESTNET_PTA_CHAIN_ID_DECIMAL;
  readonly oneShotIntentId: typeof BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID;
  readonly claimId: string;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
  readonly expectedSigner: typeof BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
  readonly predictedContractAddress: typeof BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS;
  readonly transaction: Readonly<{
    type: "legacy";
    eip155ReplayProtection: true;
    contractCreation: true;
    nonce: typeof BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE;
    to: null;
    valueWei: "0";
    gasLimit: string;
    gasPriceWei: string;
    maximumCostWei: string;
    data: Hex;
    serializedSigningPayload: Hex;
    signingHash: Hex;
    sourceEnvelopeHash: Hex;
  }>;
  readonly requestHashDomain: typeof BSC_TESTNET_PTA_SIGNING_WORKER_REQUEST_HASH_DOMAIN;
  readonly requestHash: Hex;
}

export interface BscTestnetPtaSigningWorkerSignedResponse {
  readonly schemaVersion: typeof BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION;
  readonly operation: typeof BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION;
  readonly status: "signed";
  readonly oneShotIntentId: typeof BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID;
  readonly claimId: string;
  readonly requestHash: Hex;
  readonly signingHash: Hex;
  readonly signedTransaction: Hex;
  readonly transactionHash: Hex;
}

export type BscTestnetPtaCapabilityValidationResult = DeepReadonly<
  | {
      status: "valid";
      intent: BscTestnetPtaValidatedSigningIntent;
      issue: null;
    }
  | {
      status: "invalid";
      intent: null;
      issue: BscTestnetPtaWorkerProtocolIssue;
    }
>;

export type BscTestnetPtaWorkerResponseValidationResult = DeepReadonly<
  | {
      status: "valid";
      signedTransaction: Hex;
      transactionHash: Hex;
      recoveredSigner: typeof BSC_TESTNET_PTA_DEPLOYER_ADDRESS;
      issue: null;
    }
  | {
      status: "invalid";
      signedTransaction: null;
      transactionHash: null;
      recoveredSigner: null;
      issue: BscTestnetPtaWorkerProtocolIssue;
    }
>;

export type BscTestnetPtaWorkerRequestValidationResult = DeepReadonly<
  | {
      status: "valid";
      request: BscTestnetPtaSigningWorkerRequest;
      issue: null;
    }
  | {
      status: "invalid";
      request: null;
      issue: BscTestnetPtaWorkerProtocolIssue;
    }
>;

type DataRecord = Readonly<Record<string, unknown>>;

const CAPABILITY_KEYS = [
  "authenticatedAt",
  "freshSignerSideRpcRecheckPerformed",
  "schemaVersion",
  "scope",
  "signingPayload"
] as const;
const SIGNING_PAYLOAD_KEYS = [
  "broadcastable",
  "chainId",
  "deployment",
  "environment",
  "expectedSigner",
  "format",
  "policy",
  "rlp",
  "schemaVersion",
  "serializedSigningPayload",
  "serializedSigningPayloadBytes",
  "signatureIncluded",
  "signingAuthorized",
  "signingHash",
  "sourceEnvelopeHash",
  "transaction"
] as const;
const EXPECTED_SIGNER_KEYS = ["address", "observedCode", "requiredAccountType", "role"] as const;
const DEPLOYMENT_KEYS = [
  "constructorRecipient",
  "data",
  "dataBytes",
  "dataKeccak256",
  "dataSha256",
  "predictedContractAddress",
  "runtimeBytes",
  "runtimeKeccak256",
  "runtimeSha256"
] as const;
const TRANSACTION_KEYS = [
  "contractCreation",
  "eip155ReplayProtection",
  "from",
  "gasLimit",
  "gasPriceWei",
  "maximumCostWei",
  "nonce",
  "to",
  "type",
  "valueWei"
] as const;
const POLICY_KEYS = [
  "expiresAt",
  "maximumGasLimit",
  "maximumGasPriceWei",
  "maximumTotalCostWei"
] as const;
const RLP_KEYS = ["chainId", "fieldCount", "signatureR", "signatureS"] as const;
const WORKER_REQUEST_KEYS = [
  "authenticatedAt",
  "chainId",
  "claimId",
  "environment",
  "expectedSigner",
  "expiresAt",
  "oneShotIntentId",
  "operation",
  "predictedContractAddress",
  "requestHash",
  "requestHashDomain",
  "schemaVersion",
  "transaction"
] as const;
const WORKER_TRANSACTION_KEYS = [
  "contractCreation",
  "data",
  "eip155ReplayProtection",
  "gasLimit",
  "gasPriceWei",
  "maximumCostWei",
  "nonce",
  "serializedSigningPayload",
  "signingHash",
  "sourceEnvelopeHash",
  "to",
  "type",
  "valueWei"
] as const;
const WORKER_RESPONSE_KEYS = [
  "claimId",
  "oneShotIntentId",
  "operation",
  "requestHash",
  "schemaVersion",
  "signedTransaction",
  "signingHash",
  "status",
  "transactionHash"
] as const;

function issue(
  code: BscTestnetPtaWorkerProtocolIssueCode,
  path: string,
  message: string
): BscTestnetPtaWorkerProtocolIssue {
  return Object.freeze({ code, path, message });
}

function invalidCapability(
  problem: BscTestnetPtaWorkerProtocolIssue
): BscTestnetPtaCapabilityValidationResult {
  return Object.freeze({ status: "invalid" as const, intent: null, issue: problem });
}

function invalidWorkerResponse(
  problem: BscTestnetPtaWorkerProtocolIssue
): BscTestnetPtaWorkerResponseValidationResult {
  return Object.freeze({
    status: "invalid" as const,
    signedTransaction: null,
    transactionHash: null,
    recoveredSigner: null,
    issue: problem
  });
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
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? { iso: value, milliseconds }
    : null;
}

function captureDate(value: unknown): number | null {
  try {
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

function exactLowerHex(value: unknown, bytes?: number): Hex | null {
  if (typeof value !== "string") return null;
  const expression =
    bytes === undefined ? /^0x(?:[0-9a-f]{2})+$/u : new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, "u");
  return expression.test(value) ? (value as Hex) : null;
}

function exactClaimId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
    ? value
    : null;
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

function deriveRequestHash(body: unknown): Hex {
  return keccak256(
    stringToHex(
      `${BSC_TESTNET_PTA_SIGNING_WORKER_REQUEST_HASH_DOMAIN}\u0000${JSON.stringify(
        recursivelySortJsonKeys(body)
      )}`
    )
  );
}

function inspectNineRlpFields(value: unknown): readonly Hex[] | null {
  if (!Array.isArray(value) || value.length !== 9) return null;
  const fields: Hex[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !/^0x(?:[0-9a-f]{2})*$/u.test(entry)) return null;
    fields.push(entry as Hex);
  }
  return fields;
}

function encodeRlpUint(value: bigint): Hex {
  if (value === 0n) return "0x";
  let encoded = value.toString(16);
  if (encoded.length % 2 !== 0) encoded = `0${encoded}`;
  return `0x${encoded}`;
}

function parseCapabilityShape(input: unknown): {
  readonly root: DataRecord;
  readonly payload: DataRecord;
  readonly expectedSigner: DataRecord;
  readonly deployment: DataRecord;
  readonly transaction: DataRecord;
  readonly policy: DataRecord;
  readonly rlp: DataRecord;
} | null {
  const root = inspectDataRecord(input, CAPABILITY_KEYS);
  if (root === null) return null;
  const payload = inspectDataRecord(root.signingPayload, SIGNING_PAYLOAD_KEYS);
  if (payload === null) return null;
  const expectedSigner = inspectDataRecord(payload.expectedSigner, EXPECTED_SIGNER_KEYS);
  const deployment = inspectDataRecord(payload.deployment, DEPLOYMENT_KEYS);
  const transaction = inspectDataRecord(payload.transaction, TRANSACTION_KEYS);
  const policy = inspectDataRecord(payload.policy, POLICY_KEYS);
  const rlp = inspectDataRecord(payload.rlp, RLP_KEYS);
  return expectedSigner !== null &&
    deployment !== null &&
    transaction !== null &&
    policy !== null &&
    rlp !== null
    ? { root, payload, expectedSigner, deployment, transaction, policy, rlp }
    : null;
}

/**
 * Validates the JSON-safe contents of a capability. This function does not establish
 * capability authenticity; the signer core separately asks its injected authority
 * to authenticate the original object identity before any durable claim is made.
 */
export function validateBscTestnetPtaFreshSigningCapability(
  untrustedCapability: unknown,
  untrustedAsOf: unknown
): BscTestnetPtaCapabilityValidationResult {
  try {
    const asOfMilliseconds = captureDate(untrustedAsOf);
    if (asOfMilliseconds === null) {
      return invalidCapability(
        issue("CAPABILITY_INVALID", "asOf", "The signer clock did not return an exact Date.")
      );
    }
    const inspected = parseCapabilityShape(untrustedCapability);
    if (inspected === null) {
      return invalidCapability(
        issue(
          "CAPABILITY_INVALID",
          "capability",
          "Capability must use the exact JSON-safe PTA shape and own data properties."
        )
      );
    }
    const { root, payload, expectedSigner, deployment, transaction, policy, rlp } = inspected;
    if (
      root.schemaVersion !== BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCHEMA_VERSION ||
      root.scope !== BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE ||
      root.freshSignerSideRpcRecheckPerformed !== true
    ) {
      return invalidCapability(
        issue(
          "CAPABILITY_INVALID",
          "capability",
          "Capability does not attest the exact fresh signer-side PTA recheck scope."
        )
      );
    }
    const authenticatedAt = canonicalUtc(root.authenticatedAt);
    const expiresAt = canonicalUtc(policy.expiresAt);
    if (authenticatedAt === null || expiresAt === null) {
      return invalidCapability(
        issue(
          "CAPABILITY_INVALID",
          "capability.authenticatedAt",
          "Capability and policy timestamps must be canonical UTC timestamps."
        )
      );
    }
    if (authenticatedAt.milliseconds > asOfMilliseconds) {
      return invalidCapability(
        issue(
          "CAPABILITY_FROM_FUTURE",
          "capability.authenticatedAt",
          "Capability authentication time is in the future."
        )
      );
    }
    if (
      asOfMilliseconds - authenticatedAt.milliseconds >
      BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_MAX_AGE_SECONDS * 1_000
    ) {
      return invalidCapability(
        issue(
          "CAPABILITY_STALE",
          "capability.authenticatedAt",
          "Capability is older than the sixty-second signer-side freshness window."
        )
      );
    }
    if (expiresAt.milliseconds <= asOfMilliseconds) {
      return invalidCapability(
        issue("CAPABILITY_EXPIRED", "signingPayload.policy.expiresAt", "Capability policy expired.")
      );
    }
    if (
      expiresAt.milliseconds - authenticatedAt.milliseconds >
      BSC_TESTNET_PTA_MAX_ENVELOPE_LIFETIME_SECONDS * 1_000
    ) {
      return invalidCapability(
        issue(
          "CAPABILITY_INVALID",
          "signingPayload.policy.expiresAt",
          "Capability lifetime exceeds the reviewed PTA envelope lifetime."
        )
      );
    }

    const deploymentData = exactLowerHex(deployment.data);
    const sourceEnvelopeHash = exactLowerHex(payload.sourceEnvelopeHash, 32);
    const serializedSigningPayload = exactLowerHex(payload.serializedSigningPayload);
    const signingHash = exactLowerHex(payload.signingHash, 32);
    const gasLimit = canonicalNonZeroUint(transaction.gasLimit);
    const gasPriceWei = canonicalNonZeroUint(transaction.gasPriceWei);
    const maximumCostWei = canonicalNonZeroUint(transaction.maximumCostWei);
    const policyGasLimit = canonicalNonZeroUint(policy.maximumGasLimit);
    const policyGasPriceWei = canonicalNonZeroUint(policy.maximumGasPriceWei);
    const policyTotalCostWei = canonicalNonZeroUint(policy.maximumTotalCostWei);
    if (
      deploymentData === null ||
      sourceEnvelopeHash === null ||
      sourceEnvelopeHash === `0x${"00".repeat(32)}` ||
      serializedSigningPayload === null ||
      signingHash === null ||
      gasLimit === null ||
      gasPriceWei === null ||
      maximumCostWei === null ||
      policyGasLimit === null ||
      policyGasPriceWei === null ||
      policyTotalCostWei === null
    ) {
      return invalidCapability(
        issue(
          "SIGNING_PAYLOAD_INVALID",
          "signingPayload",
          "Signing payload contains a non-canonical hash, amount, or serialization."
        )
      );
    }

    if (
      payload.schemaVersion !== BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_SCHEMA_VERSION ||
      payload.format !== BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_FORMAT ||
      payload.environment !== "bsc-testnet" ||
      payload.chainId !== BSC_TESTNET_PTA_CHAIN_ID_DECIMAL ||
      payload.signatureIncluded !== false ||
      payload.broadcastable !== false ||
      payload.signingAuthorized !== false ||
      expectedSigner.address !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS ||
      expectedSigner.role !== "pta_testnet_deployer" ||
      expectedSigner.requiredAccountType !== "eoa" ||
      expectedSigner.observedCode !== "0x" ||
      deployment.constructorRecipient !== BSC_TESTNET_PTA_RECIPIENT_ADDRESS ||
      deployment.predictedContractAddress !== BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS ||
      deployment.dataBytes !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES ||
      deployment.dataSha256 !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 ||
      deployment.dataKeccak256 !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256 ||
      deployment.runtimeBytes !== BSC_TESTNET_PTA_RUNTIME_BYTES ||
      deployment.runtimeSha256 !== BSC_TESTNET_PTA_RUNTIME_SHA256 ||
      deployment.runtimeKeccak256 !== BSC_TESTNET_PTA_RUNTIME_KECCAK256 ||
      transaction.type !== "legacy" ||
      transaction.eip155ReplayProtection !== true ||
      transaction.contractCreation !== true ||
      transaction.from !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS ||
      transaction.to !== null ||
      transaction.nonce !== BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE ||
      transaction.valueWei !== "0" ||
      rlp.fieldCount !== 9 ||
      rlp.chainId !== BSC_TESTNET_PTA_CHAIN_ID_DECIMAL ||
      rlp.signatureR !== "0x" ||
      rlp.signatureS !== "0x"
    ) {
      return invalidCapability(
        issue(
          "SIGNING_PAYLOAD_MISMATCH",
          "signingPayload",
          "Signing payload is not the exact reviewed nonce-zero PTA contract creation."
        )
      );
    }

    if (
      deploymentData.length !== 2 + BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES * 2 ||
      sha256(deploymentData).slice(2) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 ||
      keccak256(deploymentData) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256 ||
      getContractAddress({
        from: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
        nonce: BigInt(BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE)
      }) !== BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS
    ) {
      return invalidCapability(
        issue(
          "SIGNING_PAYLOAD_MISMATCH",
          "signingPayload.deployment",
          "Deployment bytecode or deterministic CREATE address does not match the reviewed artifact."
        )
      );
    }

    if (
      gasLimit > HARD_MAX_GAS_LIMIT ||
      gasPriceWei > HARD_MAX_GAS_PRICE_WEI ||
      maximumCostWei > HARD_MAX_TOTAL_COST_WEI ||
      policyGasLimit > HARD_MAX_GAS_LIMIT ||
      policyGasPriceWei > HARD_MAX_GAS_PRICE_WEI ||
      policyTotalCostWei > HARD_MAX_TOTAL_COST_WEI ||
      gasLimit > policyGasLimit ||
      gasPriceWei > policyGasPriceWei ||
      maximumCostWei > policyTotalCostWei ||
      gasLimit * gasPriceWei !== maximumCostWei
    ) {
      return invalidCapability(
        issue(
          "POLICY_EXCEEDED",
          "signingPayload.transaction",
          "Gas, fee, or maximum-cost values exceed the immutable PTA signing caps."
        )
      );
    }

    let decoded: readonly Hex[] | null = null;
    try {
      decoded = inspectNineRlpFields(fromRlp(serializedSigningPayload, "hex"));
    } catch {
      decoded = null;
    }
    const expectedUnsigned = toRlp(
      [
        "0x",
        encodeRlpUint(gasPriceWei),
        encodeRlpUint(gasLimit),
        "0x",
        "0x",
        deploymentData,
        encodeRlpUint(BigInt(BSC_TESTNET_PTA_CHAIN_ID)),
        "0x",
        "0x"
      ],
      "hex"
    );
    if (
      decoded === null ||
      expectedUnsigned !== serializedSigningPayload ||
      keccak256(serializedSigningPayload) !== signingHash ||
      payload.serializedSigningPayloadBytes !== (serializedSigningPayload.length - 2) / 2
    ) {
      return invalidCapability(
        issue(
          "SIGNING_PAYLOAD_MISMATCH",
          "signingPayload.serializedSigningPayload",
          "Unsigned EIP-155 RLP preimage does not round-trip to the exact PTA transaction."
        )
      );
    }

    return Object.freeze({
      status: "valid" as const,
      intent: Object.freeze({
        authenticatedAt: authenticatedAt.iso,
        expiresAt: expiresAt.iso,
        sourceEnvelopeHash,
        serializedSigningPayload,
        signingHash,
        deploymentData,
        gasLimit: gasLimit.toString(),
        gasPriceWei: gasPriceWei.toString(),
        maximumCostWei: maximumCostWei.toString()
      }),
      issue: null
    });
  } catch {
    return invalidCapability(
      issue(
        "CAPABILITY_INVALID",
        "capability",
        "Capability validation failed closed at the untrusted boundary."
      )
    );
  }
}

export function buildBscTestnetPtaSigningWorkerRequest(
  intent: BscTestnetPtaValidatedSigningIntent,
  untrustedClaimId: unknown
): BscTestnetPtaSigningWorkerRequest | BscTestnetPtaWorkerProtocolIssue {
  const claimId = exactClaimId(untrustedClaimId);
  if (claimId === null) {
    return issue(
      "CLAIM_ID_INVALID",
      "claimId",
      "Durable claim identifier must be a bounded canonical identifier."
    );
  }
  const body = {
    schemaVersion: BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION,
    operation: BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
    environment: "bsc-testnet" as const,
    chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
    oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
    claimId,
    authenticatedAt: intent.authenticatedAt,
    expiresAt: intent.expiresAt,
    expectedSigner: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
    predictedContractAddress: BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
    transaction: {
      type: "legacy" as const,
      eip155ReplayProtection: true as const,
      contractCreation: true as const,
      nonce: BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE,
      to: null,
      valueWei: "0" as const,
      gasLimit: intent.gasLimit,
      gasPriceWei: intent.gasPriceWei,
      maximumCostWei: intent.maximumCostWei,
      data: intent.deploymentData,
      serializedSigningPayload: intent.serializedSigningPayload,
      signingHash: intent.signingHash,
      sourceEnvelopeHash: intent.sourceEnvelopeHash
    },
    requestHashDomain: BSC_TESTNET_PTA_SIGNING_WORKER_REQUEST_HASH_DOMAIN
  };
  return Object.freeze({
    ...body,
    transaction: Object.freeze(body.transaction),
    requestHash: deriveRequestHash(body)
  });
}

function inspectWorkerRequest(input: unknown): BscTestnetPtaSigningWorkerRequest | null {
  const root = inspectDataRecord(input, WORKER_REQUEST_KEYS);
  if (root === null) return null;
  const transaction = inspectDataRecord(root.transaction, WORKER_TRANSACTION_KEYS);
  if (transaction === null) return null;
  const requestHash = exactLowerHex(root.requestHash, 32);
  const signingHash = exactLowerHex(transaction.signingHash, 32);
  const sourceEnvelopeHash = exactLowerHex(transaction.sourceEnvelopeHash, 32);
  const serializedSigningPayload = exactLowerHex(transaction.serializedSigningPayload);
  const data = exactLowerHex(transaction.data);
  const claimId = exactClaimId(root.claimId);
  const authenticatedAt = canonicalUtc(root.authenticatedAt);
  const expiresAt = canonicalUtc(root.expiresAt);
  const gasLimit = canonicalNonZeroUint(transaction.gasLimit);
  const gasPriceWei = canonicalNonZeroUint(transaction.gasPriceWei);
  const maximumCostWei = canonicalNonZeroUint(transaction.maximumCostWei);
  if (
    root.schemaVersion !== BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION ||
    root.operation !== BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION ||
    root.environment !== "bsc-testnet" ||
    root.chainId !== BSC_TESTNET_PTA_CHAIN_ID_DECIMAL ||
    root.oneShotIntentId !== BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID ||
    root.expectedSigner !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS ||
    root.predictedContractAddress !== BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS ||
    root.requestHashDomain !== BSC_TESTNET_PTA_SIGNING_WORKER_REQUEST_HASH_DOMAIN ||
    authenticatedAt === null ||
    expiresAt === null ||
    authenticatedAt.milliseconds >= expiresAt.milliseconds ||
    expiresAt.milliseconds - authenticatedAt.milliseconds >
      BSC_TESTNET_PTA_MAX_ENVELOPE_LIFETIME_SECONDS * 1_000 ||
    claimId === null ||
    requestHash === null ||
    transaction.type !== "legacy" ||
    transaction.eip155ReplayProtection !== true ||
    transaction.contractCreation !== true ||
    transaction.nonce !== BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE ||
    transaction.to !== null ||
    transaction.valueWei !== "0" ||
    gasLimit === null ||
    gasPriceWei === null ||
    maximumCostWei === null ||
    gasLimit > HARD_MAX_GAS_LIMIT ||
    gasPriceWei > HARD_MAX_GAS_PRICE_WEI ||
    maximumCostWei > HARD_MAX_TOTAL_COST_WEI ||
    gasLimit * gasPriceWei !== maximumCostWei ||
    data === null ||
    data.length !== 2 + BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES * 2 ||
    sha256(data).slice(2) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 ||
    keccak256(data) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256 ||
    serializedSigningPayload === null ||
    signingHash === null ||
    sourceEnvelopeHash === null ||
    sourceEnvelopeHash === `0x${"00".repeat(32)}`
  ) {
    return null;
  }
  const expectedSerializedSigningPayload = toRlp(
    [
      "0x",
      encodeRlpUint(gasPriceWei),
      encodeRlpUint(gasLimit),
      "0x",
      "0x",
      data,
      encodeRlpUint(BigInt(BSC_TESTNET_PTA_CHAIN_ID)),
      "0x",
      "0x"
    ],
    "hex"
  );
  if (
    serializedSigningPayload !== expectedSerializedSigningPayload ||
    keccak256(serializedSigningPayload) !== signingHash
  ) {
    return null;
  }
  const body = {
    schemaVersion: root.schemaVersion,
    operation: root.operation,
    environment: root.environment,
    chainId: root.chainId,
    oneShotIntentId: root.oneShotIntentId,
    claimId,
    authenticatedAt: authenticatedAt.iso,
    expiresAt: expiresAt.iso,
    expectedSigner: root.expectedSigner,
    predictedContractAddress: root.predictedContractAddress,
    transaction: {
      type: transaction.type,
      eip155ReplayProtection: transaction.eip155ReplayProtection,
      contractCreation: transaction.contractCreation,
      nonce: transaction.nonce,
      to: transaction.to,
      valueWei: transaction.valueWei,
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPriceWei.toString(),
      maximumCostWei: maximumCostWei.toString(),
      data,
      serializedSigningPayload,
      signingHash,
      sourceEnvelopeHash
    },
    requestHashDomain: root.requestHashDomain
  } as const;
  if (deriveRequestHash(body) !== requestHash) return null;
  return Object.freeze({
    ...body,
    transaction: Object.freeze(body.transaction),
    requestHash
  });
}

/**
 * Worker-side untrusted-input gate. A future isolated secret worker must call this
 * immediately before unlocking its scoped key; a request hash alone is never an
 * authenticity or authorization mechanism.
 */
export function validateBscTestnetPtaSigningWorkerRequest(
  untrustedRequest: unknown,
  untrustedAsOf: unknown
): BscTestnetPtaWorkerRequestValidationResult {
  try {
    const asOfMilliseconds = captureDate(untrustedAsOf);
    const request = inspectWorkerRequest(untrustedRequest);
    if (asOfMilliseconds === null || request === null) {
      return Object.freeze({
        status: "invalid" as const,
        request: null,
        issue: issue(
          "WORKER_REQUEST_INVALID",
          "request",
          "Worker request or worker-local clock failed exact PTA validation."
        )
      });
    }
    const authenticatedAt = canonicalUtc(request.authenticatedAt);
    const expiresAt = canonicalUtc(request.expiresAt);
    if (authenticatedAt === null || expiresAt === null) {
      return Object.freeze({
        status: "invalid" as const,
        request: null,
        issue: issue(
          "WORKER_REQUEST_INVALID",
          "request",
          "Worker request timestamps are not canonical UTC timestamps."
        )
      });
    }
    if (authenticatedAt.milliseconds > asOfMilliseconds) {
      return Object.freeze({
        status: "invalid" as const,
        request: null,
        issue: issue(
          "CAPABILITY_FROM_FUTURE",
          "request.authenticatedAt",
          "Worker request authentication time is in the future."
        )
      });
    }
    if (
      asOfMilliseconds - authenticatedAt.milliseconds >
      BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_MAX_AGE_SECONDS * 1_000
    ) {
      return Object.freeze({
        status: "invalid" as const,
        request: null,
        issue: issue(
          "CAPABILITY_STALE",
          "request.authenticatedAt",
          "Worker request exceeded the sixty-second signer-side freshness window."
        )
      });
    }
    if (expiresAt.milliseconds <= asOfMilliseconds) {
      return Object.freeze({
        status: "invalid" as const,
        request: null,
        issue: issue(
          "CAPABILITY_EXPIRED",
          "request.expiresAt",
          "Worker request policy expired before secret unlock."
        )
      });
    }
    return Object.freeze({ status: "valid" as const, request, issue: null });
  } catch {
    return Object.freeze({
      status: "invalid" as const,
      request: null,
      issue: issue(
        "WORKER_REQUEST_INVALID",
        "request",
        "Worker request validation failed closed at the untrusted boundary."
      )
    });
  }
}

/** Internal server-only parser for durable worker authorization composition. */
export function parseBscTestnetPtaSigningWorkerRequestForInternalUse(
  input: unknown
): BscTestnetPtaSigningWorkerRequest | null {
  return inspectWorkerRequest(input);
}

/** Validates and recovers a signed legacy transaction returned by the isolated worker. */
export async function validateBscTestnetPtaSigningWorkerResponse(
  untrustedResponse: unknown,
  untrustedRequest: unknown
): Promise<BscTestnetPtaWorkerResponseValidationResult> {
  try {
    const request = inspectWorkerRequest(untrustedRequest);
    if (request === null) {
      return invalidWorkerResponse(
        issue(
          "WORKER_REQUEST_INVALID",
          "request",
          "Worker request is not the exact canonical PTA signing request."
        )
      );
    }
    const response = inspectDataRecord(untrustedResponse, WORKER_RESPONSE_KEYS);
    if (response === null) {
      return invalidWorkerResponse(
        issue(
          "WORKER_RESPONSE_INVALID",
          "response",
          "Worker response must use the exact JSON-safe signed-response shape."
        )
      );
    }
    const signedTransaction = exactLowerHex(response.signedTransaction);
    const transactionHash = exactLowerHex(response.transactionHash, 32);
    if (
      response.schemaVersion !== BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION ||
      response.operation !== BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION ||
      response.status !== "signed" ||
      response.oneShotIntentId !== BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID ||
      response.claimId !== request.claimId ||
      response.requestHash !== request.requestHash ||
      response.signingHash !== request.transaction.signingHash ||
      signedTransaction === null ||
      transactionHash === null ||
      (signedTransaction.length - 2) / 2 > MAXIMUM_SIGNED_TRANSACTION_BYTES ||
      keccak256(signedTransaction) !== transactionHash
    ) {
      return invalidWorkerResponse(
        issue(
          "WORKER_RESPONSE_INVALID",
          "response",
          "Worker response correlation fields or transaction hash do not match the request."
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
    const r = exactLowerHex(transaction.r, 32);
    const s = exactLowerHex(transaction.s, 32);
    const yParity = transaction.yParity;
    const rValue = r === null ? null : BigInt(r);
    const sValue = s === null ? null : BigInt(s);
    const expectedV =
      yParity === 0 || yParity === 1
        ? BigInt(BSC_TESTNET_PTA_CHAIN_ID) * 2n + 35n + BigInt(yParity)
        : null;
    const requestGasLimit = BigInt(request.transaction.gasLimit);
    const requestGasPriceWei = BigInt(request.transaction.gasPriceWei);
    if (
      transaction.type !== "legacy" ||
      transaction.chainId !== BSC_TESTNET_PTA_CHAIN_ID ||
      transaction.nonce !== Number(BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE) ||
      transaction.to !== undefined ||
      (transaction.value ?? 0n) !== 0n ||
      transaction.gas !== requestGasLimit ||
      transaction.gasPrice !== requestGasPriceWei ||
      transaction.data !== request.transaction.data ||
      r === null ||
      s === null ||
      rValue === null ||
      sValue === null ||
      rValue <= 0n ||
      rValue >= SECP256K1_ORDER ||
      sValue <= 0n ||
      sValue > SECP256K1_HALF_ORDER ||
      expectedV === null ||
      transaction.v !== expectedV
    ) {
      return invalidWorkerResponse(
        issue(
          "SIGNED_TRANSACTION_MISMATCH",
          "response.signedTransaction",
          "Signed transaction fields, signature, chain, nonce, fees, or bytecode differ from the request."
        )
      );
    }
    const reconstructedUnsigned = serializeTransaction({
      type: "legacy",
      chainId: BSC_TESTNET_PTA_CHAIN_ID,
      nonce: Number(BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE),
      gasPrice: requestGasPriceWei,
      gas: requestGasLimit,
      value: 0n,
      data: request.transaction.data
    });
    const canonicalSigned = serializeTransaction(
      {
        type: "legacy",
        chainId: BSC_TESTNET_PTA_CHAIN_ID,
        nonce: Number(BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE),
        gasPrice: requestGasPriceWei,
        gas: requestGasLimit,
        value: 0n,
        data: request.transaction.data
      },
      { r, s, v: expectedV }
    );
    if (
      reconstructedUnsigned !== request.transaction.serializedSigningPayload ||
      keccak256(reconstructedUnsigned) !== request.transaction.signingHash ||
      canonicalSigned !== signedTransaction
    ) {
      return invalidWorkerResponse(
        issue(
          "SIGNED_TRANSACTION_MISMATCH",
          "response.signedTransaction",
          "Signed transaction failed canonical signed and unsigned serialization round trips."
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
          "The worker signature could not recover a signer address."
        )
      );
    }
    if (
      recoveredSigner !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS ||
      getContractAddress({
        from: recoveredSigner,
        nonce: BigInt(BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE)
      }) !== BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS
    ) {
      return invalidWorkerResponse(
        issue(
          "SIGNER_MISMATCH",
          "response.signedTransaction",
          "Recovered signer or nonce-zero CREATE address does not match the dedicated PTA deployer."
        )
      );
    }
    return Object.freeze({
      status: "valid" as const,
      signedTransaction,
      transactionHash,
      recoveredSigner: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
      issue: null
    });
  } catch {
    return invalidWorkerResponse(
      issue(
        "WORKER_RESPONSE_INVALID",
        "response",
        "Worker response validation failed closed at the untrusted boundary."
      )
    );
  }
}
