import "server-only";

import { createDecipheriv, scrypt, timingSafeEqual } from "node:crypto";
import { constants as fileConstants, type BigIntStats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, join, win32 } from "node:path";
import { isProxy } from "node:util/types";

import { secp256k1 } from "@noble/curves/secp256k1";
import {
  decodeFunctionData,
  getAddress,
  keccak256,
  numberToHex,
  parseAbi,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
  sha256,
  stringToHex,
  type Address,
  type Hex,
  type TransactionSerialized
} from "viem";

import {
  BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_FILE,
  BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_SHA256,
  BSC_TESTNET_DEPLOYER_STORE_FILE,
  BSC_TESTNET_DEPLOYER_STORE_SHA256,
  parseBscTestnetDeployerCustodyConfiguration,
  parseBscTestnetDeployerEncryptedStore,
  sha256Hex,
  type ParsedBscTestnetDeployerCustodyConfiguration
} from "./bsc-testnet-deployer-custody-core";
import {
  probeWindowsBscTestnetDeployerCustodyMetadataForInternalUse,
  runPinnedPowerShellForInternalUse
} from "./bsc-testnet-deployer-custody-windows.server";
import { assertPinnedDeterministicSigningRuntimeForInternalUse } from "./bsc-testnet-pta-signing-worker";
import {
  BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID,
  BSC_TESTNET_PTA_WBNB_LP_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_LP_DEADLINE_SECONDS,
  BSC_TESTNET_PTA_WBNB_LP_FEE,
  BSC_TESTNET_PTA_WBNB_LP_MAX_APPROVAL_GAS,
  BSC_TESTNET_PTA_WBNB_LP_MAX_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_LP_MAX_MINT_GAS,
  BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI,
  BSC_TESTNET_PTA_WBNB_LP_OWNER,
  BSC_TESTNET_PTA_WBNB_LP_POLICY_ID,
  BSC_TESTNET_PTA_WBNB_LP_POOL,
  BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_LP_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS,
  BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW,
  BSC_TESTNET_PTA_WBNB_LP_SCOPE_LIFETIME_SECONDS,
  BSC_TESTNET_PTA_WBNB_LP_SCOPE_SCHEMA_VERSION,
  BSC_TESTNET_PTA_WBNB_LP_SLIPPAGE_BPS,
  BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER,
  BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER,
  BSC_TESTNET_PTA_WBNB_LP_WBNB_ADDRESS,
  deriveBscTestnetPtaWbnbLpExactScopeSha256ForInternalUse
} from "./bsc-testnet-pta-wbnb-lp-exact-scope";

const MAXIMUM_STORE_BYTES = 65_536;
const MAXIMUM_PROTECTED_BLOB_BYTES = 4_096;
const PASSWORD_BYTES = 48;
const DERIVED_KEY_BYTES = 32;
const SCRYPT_MAXIMUM_MEMORY_BYTES = 256 * 1024 * 1024;
const UINT256_MAX = (1n << 256n) - 1n;
export const BSC_TESTNET_PTA_WBNB_LP_MINIMUM_EXECUTION_WINDOW_MILLISECONDS = 120_000 as const;
const PINNED_POWERSHELL_EXECUTABLE =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const PINNED_POWERSHELL_SHA256 = "9785001b0dcf755eddb8af294a373c0b87b2498660f724e76c4d53f9c217c7a3";
const OWNER_CONFIRMATION_PROTOCOL =
  "ProofEra:bsc-testnet-pta-wbnb-first-lp-owner-exact-byte-confirmation:v8" as const;
const OWNER_CONFIRMATION_DECISION =
  "CONFIRM_ONE_EXACT_TESTNET_LP_APPROVE_AND_MINT_NO_RETRY_NO_REPLACEMENT" as const;
const LOCAL_APPLICATION_DATA_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$path = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if ([String]::IsNullOrWhiteSpace($path)) { exit 47 }
[Console]::Out.Write($path)
`;
const DPAPI_UNPROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$protectedBytes = $null
$clearBytes = $null
try {
  $inputStream = [Console]::OpenStandardInput()
  $memory = [System.IO.MemoryStream]::new()
  $inputStream.CopyTo($memory)
  $protectedBytes = $memory.ToArray()
  $memory.Dispose()
  $null = Add-Type -AssemblyName System.Security
  $clearBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protectedBytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  $outputStream = [Console]::OpenStandardOutput()
  $outputStream.Write($clearBytes, 0, $clearBytes.Length)
  $outputStream.Flush()
} catch {
  exit 31
} finally {
  if ($null -ne $protectedBytes) { [Array]::Clear($protectedBytes, 0, $protectedBytes.Length) }
  if ($null -ne $clearBytes) { [Array]::Clear($clearBytes, 0, $clearBytes.Length) }
}
`;

const ERC20_ABI = parseAbi(["function approve(address spender,uint256 amount) returns (bool)"]);
const MANAGER_ABI = parseAbi([
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
]);

type PlainRecord = Readonly<Record<string, unknown>>;

export interface BscTestnetPtaWbnbLpExactExecutionTransaction {
  readonly order: 1 | 2;
  readonly purpose:
    "exact_PTA_allowance_for_one_mint" | "direct_zero_slippage_full_range_Pancake_V3_mint";
  readonly chainId: typeof BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID;
  readonly type: "legacy";
  readonly from: typeof BSC_TESTNET_PTA_WBNB_LP_OWNER;
  readonly nonce: bigint;
  readonly to:
    typeof BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS | typeof BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER;
  readonly selector: "0x095ea7b3" | "0x88316456";
  readonly data: Hex;
  readonly dataKeccak256: Hex;
  readonly valueWei: bigint;
  readonly gasLimit: bigint;
  readonly gasPriceWei: bigint;
}

export interface BscTestnetPtaWbnbLpExactExecutionPlan {
  readonly schemaVersion: 1;
  readonly sourceCommit: string;
  readonly exactScopeSha256: Hex;
  readonly preparedAt: string;
  readonly preparedAtMilliseconds: number;
  readonly scopeExpiresAt: string;
  readonly scopeExpiresAtMilliseconds: number;
  readonly commonBlockNumber: bigint;
  readonly commonBlockHash: Hex;
  readonly deadlineUnix: bigint;
  readonly maximumGasCostWei: bigint;
  readonly maximumNativeOutflowWei: bigint;
  readonly transactions: readonly [
    BscTestnetPtaWbnbLpExactExecutionTransaction,
    BscTestnetPtaWbnbLpExactExecutionTransaction
  ];
}

export interface BscTestnetPtaWbnbLpOwnerChallenge {
  readonly confirmationLine: string;
  readonly confirmationLineSha256: Hex;
  readonly challengeBindingSha256: Hex;
  readonly ceremonyNonce: Hex;
  readonly runtimeManifestSha256: Hex;
  readonly plan: BscTestnetPtaWbnbLpExactExecutionPlan;
}

const CONFIRMED_EXECUTION_BRAND = Symbol("ProofEraBscTestnetPtaWbnbLpConfirmedExecution");
const EXECUTION_PLANS = new WeakSet<object>();
const OWNER_CHALLENGES = new WeakSet<object>();
const CONFIRMED_EXECUTIONS = new WeakSet<object>();
const CONFIRMED_EXECUTION_SIGNED_ORDERS = new WeakMap<object, Set<1 | 2>>();

export interface BscTestnetPtaWbnbLpConfirmedExecution {
  readonly [CONFIRMED_EXECUTION_BRAND]: true;
  readonly confirmedAt: string;
  readonly confirmedAtMilliseconds: number;
  readonly executionExpiresAt: string;
  readonly executionExpiresAtMilliseconds: number;
  readonly ownerConfirmationSha256: Hex;
  readonly ownerChallengeBindingSha256: Hex;
  readonly runtimeManifestSha256: Hex;
  readonly plan: BscTestnetPtaWbnbLpExactExecutionPlan;
}

export type BscTestnetPtaWbnbLpSignedTransaction<
  TSigner extends Address = typeof BSC_TESTNET_PTA_WBNB_LP_OWNER
> = Readonly<{
  rawTransaction: Hex;
  rawTransactionKeccak256: Hex;
  signingHash: Hex;
  transactionHash: Hex;
  recoveredSigner: TSigner;
}>;

export class BscTestnetPtaWbnbLpExecutionFailure extends Error {
  override readonly name = "BscTestnetPtaWbnbLpExecutionFailure";
  readonly code:
    | "CONFIRMATION_EXPIRED"
    | "CONFIRMATION_INVALID"
    | "CUSTODY_UNAVAILABLE"
    | "PLAN_INVALID"
    | "SIGNING_FAILED";

  constructor(code: BscTestnetPtaWbnbLpExecutionFailure["code"]) {
    super("The exact BSC-testnet PTA/WBNB LP operation failed closed.");
    this.code = code;
  }
}

export type BscTestnetPtaWbnbLpCustodySigningProbeStage =
  | "platform"
  | "runtime_precheck"
  | "custody_location"
  | "metadata_acl"
  | "artifact_read"
  | "artifact_hash"
  | "dpapi_unprotect"
  | "keystore_unlock"
  | "postcheck"
  | "runtime_postcheck";

class BscTestnetPtaWbnbLpCustodySigningProbeFailure extends Error {
  override readonly name = "BscTestnetPtaWbnbLpCustodySigningProbeFailure";

  constructor(readonly stage: BscTestnetPtaWbnbLpCustodySigningProbeStage) {
    super("The bounded LP signing-custody probe failed safely.");
  }
}

function record(value: unknown): PlainRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value))
    return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some(
      (descriptor) => !("value" in descriptor) || descriptor.enumerable !== true
    )
  ) {
    return null;
  }
  return value as PlainRecord;
}

function exactKeys(value: PlainRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function canonicalUint(value: unknown, maximum = UINT256_MAX): bigint | null {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= maximum ? parsed : null;
  } catch {
    return null;
  }
}

function utcMilliseconds(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}

function exactHex(value: unknown, bytes?: number): Hex | null {
  if (
    typeof value !== "string" ||
    !/^0x(?:[0-9a-f]{2})*$/u.test(value) ||
    (bytes !== undefined && value.length !== bytes * 2 + 2)
  ) {
    return null;
  }
  return value as Hex;
}

function exactAddress(value: unknown, expected: Address): boolean {
  if (typeof value !== "string" || value !== expected) return false;
  try {
    return getAddress(value) === expected;
  } catch {
    return false;
  }
}

function exactBooleanRecord(value: unknown, expected: Readonly<Record<string, boolean>>): boolean {
  const parsed = record(value);
  const keys = Object.keys(expected);
  return (
    parsed !== null && exactKeys(parsed, keys) && keys.every((key) => parsed[key] === expected[key])
  );
}

function parseTransactionRecord(
  input: unknown,
  order: 1 | 2
): BscTestnetPtaWbnbLpExactExecutionTransaction | null {
  const value = record(input);
  if (
    value === null ||
    !exactKeys(value, [
      "order",
      "purpose",
      "chainId",
      "type",
      "from",
      "nonce",
      "to",
      "selector",
      "data",
      "dataKeccak256",
      "valueWei",
      "gasLimit",
      "gasPriceWei"
    ]) ||
    value.order !== order ||
    value.chainId !== BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID ||
    value.type !== "legacy" ||
    !exactAddress(value.from, BSC_TESTNET_PTA_WBNB_LP_OWNER)
  ) {
    return null;
  }
  const nonce = canonicalUint(value.nonce, BigInt(Number.MAX_SAFE_INTEGER));
  const data = exactHex(value.data);
  const dataKeccak256 = exactHex(value.dataKeccak256, 32);
  const valueWei = canonicalUint(value.valueWei);
  const gasLimit = canonicalUint(value.gasLimit);
  const gasPriceWei = canonicalUint(value.gasPriceWei);
  if (
    nonce === null ||
    data === null ||
    dataKeccak256 === null ||
    dataKeccak256 !== keccak256(data) ||
    valueWei === null ||
    gasLimit === null ||
    gasPriceWei === null ||
    gasPriceWei === 0n ||
    gasPriceWei > BSC_TESTNET_PTA_WBNB_LP_MAX_GAS_PRICE_WEI
  ) {
    return null;
  }
  if (order === 1) {
    if (
      value.purpose !== "exact_PTA_allowance_for_one_mint" ||
      !exactAddress(value.to, BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS) ||
      value.selector !== "0x095ea7b3" ||
      data.slice(0, 10) !== value.selector ||
      valueWei !== 0n ||
      gasLimit === 0n ||
      gasLimit > BSC_TESTNET_PTA_WBNB_LP_MAX_APPROVAL_GAS
    ) {
      return null;
    }
    try {
      const decoded = decodeFunctionData({ abi: ERC20_ABI, data });
      if (
        decoded.functionName !== "approve" ||
        decoded.args[0] !== BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER ||
        decoded.args[1] !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW
      ) {
        return null;
      }
    } catch {
      return null;
    }
  } else {
    if (
      value.purpose !== "direct_zero_slippage_full_range_Pancake_V3_mint" ||
      !exactAddress(value.to, BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER) ||
      value.selector !== "0x88316456" ||
      data.slice(0, 10) !== value.selector ||
      valueWei !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI ||
      gasLimit === 0n ||
      gasLimit > BSC_TESTNET_PTA_WBNB_LP_MAX_MINT_GAS
    ) {
      return null;
    }
  }
  return Object.freeze({
    order,
    purpose: value.purpose as BscTestnetPtaWbnbLpExactExecutionTransaction["purpose"],
    chainId: BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID,
    type: "legacy" as const,
    from: BSC_TESTNET_PTA_WBNB_LP_OWNER,
    nonce,
    to: value.to as BscTestnetPtaWbnbLpExactExecutionTransaction["to"],
    selector: value.selector as BscTestnetPtaWbnbLpExactExecutionTransaction["selector"],
    data,
    dataKeccak256,
    valueWei,
    gasLimit,
    gasPriceWei
  });
}

function validateMintData(data: Hex, deadlineUnix: bigint): boolean {
  try {
    const decoded = decodeFunctionData({ abi: MANAGER_ABI, data });
    if (decoded.functionName !== "mint") return false;
    const params = decoded.args[0];
    return (
      params.token0 === BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS &&
      params.token1 === BSC_TESTNET_PTA_WBNB_LP_WBNB_ADDRESS &&
      params.fee === BSC_TESTNET_PTA_WBNB_LP_FEE &&
      params.tickLower === BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER &&
      params.tickUpper === BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER &&
      params.amount0Desired === BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW &&
      params.amount1Desired === BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI &&
      params.amount0Min === BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW &&
      params.amount1Min === BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI &&
      params.recipient === BSC_TESTNET_PTA_WBNB_LP_OWNER &&
      params.deadline === deadlineUnix
    );
  } catch {
    return false;
  }
}

export function parseBscTestnetPtaWbnbLpExactExecutionPlanForInternalUse(
  input: unknown,
  nowMilliseconds: number
): BscTestnetPtaWbnbLpExactExecutionPlan {
  try {
    const scope = record(input);
    if (
      scope === null ||
      !Number.isSafeInteger(nowMilliseconds) ||
      !exactKeys(scope, [
        "schemaVersion",
        "kind",
        "policyId",
        "status",
        "sourceCommit",
        "preparedAt",
        "scopeExpiresAt",
        "reusableAfterExpiry",
        "chain",
        "owner",
        "observation",
        "position",
        "exactTransactions",
        "caps",
        "simulations",
        "failureCleanup",
        "prohibited",
        "authorization",
        "evidenceBoundary",
        "exactScopeSha256"
      ]) ||
      scope.schemaVersion !== BSC_TESTNET_PTA_WBNB_LP_SCOPE_SCHEMA_VERSION ||
      scope.kind !== "bsc_testnet_pta_wbnb_first_lp_exact_scope" ||
      scope.policyId !== BSC_TESTNET_PTA_WBNB_LP_POLICY_ID ||
      scope.status !== "prepared_not_authorized" ||
      typeof scope.sourceCommit !== "string" ||
      !/^[0-9a-f]{40}$/u.test(scope.sourceCommit) ||
      scope.reusableAfterExpiry !== false ||
      !exactAddress(scope.owner, BSC_TESTNET_PTA_WBNB_LP_OWNER)
    ) {
      throw new Error("shape");
    }
    const exactScopeSha256 = exactHex(scope.exactScopeSha256, 32);
    if (exactScopeSha256 === null) throw new Error("digest");
    const body = Object.fromEntries(
      Object.entries(scope).filter(([key]) => key !== "exactScopeSha256")
    );
    if (deriveBscTestnetPtaWbnbLpExactScopeSha256ForInternalUse(body) !== exactScopeSha256) {
      throw new Error("digest");
    }
    const preparedAtMilliseconds = utcMilliseconds(scope.preparedAt);
    const scopeExpiresAtMilliseconds = utcMilliseconds(scope.scopeExpiresAt);
    if (
      preparedAtMilliseconds === null ||
      scopeExpiresAtMilliseconds === null ||
      scopeExpiresAtMilliseconds - preparedAtMilliseconds !==
        BSC_TESTNET_PTA_WBNB_LP_SCOPE_LIFETIME_SECONDS * 1_000 ||
      nowMilliseconds < preparedAtMilliseconds - 5_000 ||
      nowMilliseconds >= scopeExpiresAtMilliseconds
    ) {
      throw new Error("clock");
    }
    const chain = record(scope.chain);
    if (
      chain === null ||
      !exactKeys(chain, [
        "environment",
        "chainId",
        "mainnetWritePossible",
        "fixedOfficialDualRpc"
      ]) ||
      chain.environment !== "bsc-testnet" ||
      chain.chainId !== BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID ||
      chain.mainnetWritePossible !== false ||
      chain.fixedOfficialDualRpc !== true
    ) {
      throw new Error("chain");
    }
    const observation = record(scope.observation);
    const commonBlockNumber = canonicalUint(observation?.commonBlockNumber);
    const commonBlockHash = exactHex(observation?.commonBlockHash, 32);
    if (
      observation === null ||
      observation.providerAgreementVerified !== true ||
      commonBlockNumber === null ||
      commonBlockHash === null ||
      !Array.isArray(observation.observations) ||
      observation.observations.length !== 2
    ) {
      throw new Error("observation");
    }
    const origins = observation.observations.map((entry) => record(entry)?.rpcOrigin);
    if (
      origins[0] !== BSC_TESTNET_PTA_WBNB_LP_PRIMARY_RPC_ORIGIN ||
      origins[1] !== BSC_TESTNET_PTA_WBNB_LP_CORROBORATOR_RPC_ORIGIN
    ) {
      throw new Error("rpc");
    }
    const position = record(scope.position);
    const deadlineUnix = canonicalUint(position?.deadlineUnix);
    if (
      position === null ||
      deadlineUnix === null ||
      position.pool !== BSC_TESTNET_PTA_WBNB_LP_POOL ||
      position.manager !== BSC_TESTNET_PTA_WBNB_LP_POSITION_MANAGER ||
      position.recipient !== BSC_TESTNET_PTA_WBNB_LP_OWNER ||
      position.token0 !== BSC_TESTNET_PTA_WBNB_LP_PTA_ADDRESS ||
      position.token1 !== BSC_TESTNET_PTA_WBNB_LP_WBNB_ADDRESS ||
      position.fee !== String(BSC_TESTNET_PTA_WBNB_LP_FEE) ||
      position.tickLower !== BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER ||
      position.tickUpper !== BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER ||
      position.amount0DesiredRaw !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW.toString() ||
      position.amount1DesiredRaw !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI.toString() ||
      position.amount0MinRaw !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW.toString() ||
      position.amount1MinRaw !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI.toString() ||
      position.maximumSlippageBps !== BSC_TESTNET_PTA_WBNB_LP_SLIPPAGE_BPS ||
      position.expectedLiquidityRaw !== "1000000000000000000" ||
      deadlineUnix !==
        BigInt(Math.floor(preparedAtMilliseconds / 1_000)) +
          BigInt(BSC_TESTNET_PTA_WBNB_LP_DEADLINE_SECONDS)
    ) {
      throw new Error("position");
    }
    if (!Array.isArray(scope.exactTransactions) || scope.exactTransactions.length !== 2) {
      throw new Error("transactions");
    }
    const approval = parseTransactionRecord(scope.exactTransactions[0], 1);
    const mint = parseTransactionRecord(scope.exactTransactions[1], 2);
    if (
      approval === null ||
      mint === null ||
      mint.nonce !== approval.nonce + 1n ||
      mint.gasPriceWei !== approval.gasPriceWei ||
      !validateMintData(mint.data, deadlineUnix)
    ) {
      throw new Error("transactions");
    }
    const caps = record(scope.caps);
    const maximumGasCostWei = canonicalUint(caps?.maximumGasCostWei);
    const maximumNativeOutflowWei = canonicalUint(caps?.maximumNativeOutflowWei);
    if (
      caps === null ||
      maximumGasCostWei === null ||
      maximumNativeOutflowWei === null ||
      caps.ptaSpendRaw !== BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW.toString() ||
      caps.nativeMintValueWei !== BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI.toString() ||
      caps.gasPriceWei !== approval.gasPriceWei.toString() ||
      caps.maximumGasPriceWei !== BSC_TESTNET_PTA_WBNB_LP_MAX_GAS_PRICE_WEI.toString() ||
      caps.approvalGasLimit !== approval.gasLimit.toString() ||
      caps.mintGasLimit !== mint.gasLimit.toString() ||
      maximumGasCostWei !== (approval.gasLimit + mint.gasLimit) * approval.gasPriceWei ||
      maximumNativeOutflowWei !== maximumGasCostWei + BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI
    ) {
      throw new Error("caps");
    }
    if (
      !exactBooleanRecord(scope.authorization, {
        preparationAuthorizedByOwner: true,
        signingAuthorized: false,
        custodyUnlockAuthorized: false,
        broadcastAuthorized: false,
        signatureCreated: false,
        transactionSubmitted: false,
        blockchainWritePerformed: false
      }) ||
      !exactBooleanRecord(scope.prohibited, {
        multicall: true,
        dispatcher: true,
        WBNBApproval: true,
        tokenTransfer: true,
        swap: true,
        additionalLiquidity: true,
        retryAfterAmbiguousSubmission: true,
        replacement: true,
        mainnet: true
      })
    ) {
      throw new Error("authority");
    }
    const plan = Object.freeze({
      schemaVersion: 1 as const,
      sourceCommit: scope.sourceCommit,
      exactScopeSha256,
      preparedAt: scope.preparedAt as string,
      preparedAtMilliseconds,
      scopeExpiresAt: scope.scopeExpiresAt as string,
      scopeExpiresAtMilliseconds,
      commonBlockNumber,
      commonBlockHash,
      deadlineUnix,
      maximumGasCostWei,
      maximumNativeOutflowWei,
      transactions: Object.freeze([approval, mint]) as readonly [
        BscTestnetPtaWbnbLpExactExecutionTransaction,
        BscTestnetPtaWbnbLpExactExecutionTransaction
      ]
    });
    EXECUTION_PLANS.add(plan);
    return plan;
  } catch (error) {
    if (error instanceof BscTestnetPtaWbnbLpExecutionFailure) throw error;
    throw new BscTestnetPtaWbnbLpExecutionFailure("PLAN_INVALID");
  }
}

export function createBscTestnetPtaWbnbLpOwnerChallengeForInternalUse(input: {
  readonly plan: BscTestnetPtaWbnbLpExactExecutionPlan;
  readonly ceremonyNonce: Hex;
  readonly runtimeManifestSha256: Hex;
}): BscTestnetPtaWbnbLpOwnerChallenge {
  if (
    !EXECUTION_PLANS.has(input.plan) ||
    exactHex(input.ceremonyNonce, 32) === null ||
    exactHex(input.runtimeManifestSha256, 32) === null
  ) {
    throw new BscTestnetPtaWbnbLpExecutionFailure("PLAN_INVALID");
  }
  const [approval, mint] = input.plan.transactions;
  const binding = [
    OWNER_CONFIRMATION_PROTOCOL,
    `chainId=${BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID}`,
    `scopeSha256=${input.plan.exactScopeSha256}`,
    `sourceCommit=${input.plan.sourceCommit}`,
    `runtimeManifestSha256=${input.runtimeManifestSha256}`,
    `owner=${BSC_TESTNET_PTA_WBNB_LP_OWNER}`,
    `approvalNonce=${approval.nonce}`,
    `mintNonce=${mint.nonce}`,
    `ptaAmountRaw=${BSC_TESTNET_PTA_WBNB_LP_PTA_CAPITAL_RAW}`,
    `nativeAmountWei=${BSC_TESTNET_PTA_WBNB_LP_NATIVE_CAPITAL_WEI}`,
    `tickLower=${BSC_TESTNET_PTA_WBNB_LP_TICK_LOWER}`,
    `tickUpper=${BSC_TESTNET_PTA_WBNB_LP_TICK_UPPER}`,
    `slippageBps=${BSC_TESTNET_PTA_WBNB_LP_SLIPPAGE_BPS}`,
    `maximumNativeOutflowWei=${input.plan.maximumNativeOutflowWei}`,
    `scopeExpiresAt=${input.plan.scopeExpiresAt}`,
    `ceremonyNonce=${input.ceremonyNonce}`,
    `decision=${OWNER_CONFIRMATION_DECISION}`
  ].join("|");
  const challengeBindingSha256 = sha256(stringToHex(binding));
  const line = "CONFIRM";
  const challenge = Object.freeze({
    confirmationLine: line,
    confirmationLineSha256: sha256(stringToHex(line)),
    challengeBindingSha256,
    ceremonyNonce: input.ceremonyNonce,
    runtimeManifestSha256: input.runtimeManifestSha256,
    plan: input.plan
  });
  OWNER_CHALLENGES.add(challenge);
  return challenge;
}

export function confirmBscTestnetPtaWbnbLpOwnerChallengeForInternalUse(
  challenge: BscTestnetPtaWbnbLpOwnerChallenge,
  receivedLine: string,
  confirmedAtMilliseconds: number
): BscTestnetPtaWbnbLpConfirmedExecution {
  if (!OWNER_CHALLENGES.has(challenge) || receivedLine !== challenge.confirmationLine) {
    throw new BscTestnetPtaWbnbLpExecutionFailure("CONFIRMATION_INVALID");
  }
  OWNER_CHALLENGES.delete(challenge);
  if (
    !Number.isSafeInteger(confirmedAtMilliseconds) ||
    confirmedAtMilliseconds < challenge.plan.preparedAtMilliseconds ||
    challenge.plan.scopeExpiresAtMilliseconds - confirmedAtMilliseconds <
      BSC_TESTNET_PTA_WBNB_LP_MINIMUM_EXECUTION_WINDOW_MILLISECONDS
  ) {
    throw new BscTestnetPtaWbnbLpExecutionFailure("CONFIRMATION_EXPIRED");
  }
  const authorization = Object.freeze({
    [CONFIRMED_EXECUTION_BRAND]: true as const,
    confirmedAt: new Date(confirmedAtMilliseconds).toISOString(),
    confirmedAtMilliseconds,
    executionExpiresAt: challenge.plan.scopeExpiresAt,
    executionExpiresAtMilliseconds: challenge.plan.scopeExpiresAtMilliseconds,
    ownerConfirmationSha256: challenge.confirmationLineSha256,
    ownerChallengeBindingSha256: challenge.challengeBindingSha256,
    runtimeManifestSha256: challenge.runtimeManifestSha256,
    plan: challenge.plan
  });
  CONFIRMED_EXECUTIONS.add(authorization);
  CONFIRMED_EXECUTION_SIGNED_ORDERS.set(authorization, new Set());
  return authorization;
}

type FileSnapshot = Readonly<{
  birthtimeNanoseconds: bigint;
  changeTimeNanoseconds: bigint;
  device: bigint;
  inode: bigint;
  mode: bigint;
  modifiedTimeNanoseconds: bigint;
  links: bigint;
  size: bigint;
}>;

function snapshot(metadata: BigIntStats): FileSnapshot {
  return Object.freeze({
    birthtimeNanoseconds: metadata.birthtimeNs,
    changeTimeNanoseconds: metadata.ctimeNs,
    device: metadata.dev,
    inode: metadata.ino,
    mode: metadata.mode,
    modifiedTimeNanoseconds: metadata.mtimeNs,
    links: metadata.nlink,
    size: metadata.size
  });
}

function sameSnapshot(left: FileSnapshot, right: FileSnapshot): boolean {
  return (
    left.birthtimeNanoseconds === right.birthtimeNanoseconds &&
    left.changeTimeNanoseconds === right.changeTimeNanoseconds &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.modifiedTimeNanoseconds === right.modifiedTimeNanoseconds &&
    left.links === right.links &&
    left.size === right.size
  );
}

async function readStableRegularFile(
  path: string,
  maximumBytes: number,
  requireSingleLink = true,
  secret = true
): Promise<Readonly<{ bytes: Buffer; snapshot: FileSnapshot }>> {
  const handle = await open(path, fileConstants.O_RDONLY | fileConstants.O_NOFOLLOW);
  let bytes: Buffer | null = null;
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      (requireSingleLink && before.nlink !== 1n) ||
      before.size > BigInt(maximumBytes)
    ) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
    }
    bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      !sameSnapshot(snapshot(before), snapshot(after)) ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
    }
    const result = Object.freeze({ bytes, snapshot: snapshot(after) });
    bytes = null;
    return result;
  } finally {
    if (secret) bytes?.fill(0);
    await handle.close();
  }
}

async function resolveFixedCustody(): Promise<ParsedBscTestnetDeployerCustodyConfiguration> {
  const input = Buffer.alloc(0);
  let output: Buffer | null = null;
  try {
    const result = await runPinnedPowerShellForInternalUse(
      LOCAL_APPLICATION_DATA_SCRIPT,
      input,
      512,
      new AbortController().signal
    );
    output = result.output;
    const local = new TextDecoder("utf-8", { fatal: true }).decode(output);
    if (
      !/^[A-Za-z]:\\[^\0\r\n]+$/u.test(local) ||
      local.trim() !== local ||
      win32.normalize(local) !== local
    ) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
    }
    const parsed = parseBscTestnetDeployerCustodyConfiguration({
      custodyDirectoryAbsolute: win32.join(local, "ProofEra", "wallets", "bsc-testnet")
    });
    if (parsed === null) throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
    return parsed;
  } catch (error) {
    if (error instanceof BscTestnetPtaWbnbLpExecutionFailure) throw error;
    throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function inspectCustodyPaths(
  custody: ParsedBscTestnetDeployerCustodyConfiguration
): Promise<Readonly<{ protectedBlobPath: string; storePath: string }>> {
  const directory = custody.custodyDirectoryAbsolute;
  const storePath = join(directory, BSC_TESTNET_DEPLOYER_STORE_FILE);
  const protectedBlobPath = join(directory, BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_FILE);
  if (
    win32.basename(directory).toLowerCase() !== "bsc-testnet" ||
    win32.basename(dirname(directory)).toLowerCase() !== "wallets" ||
    win32.basename(dirname(dirname(directory))).toLowerCase() !== "proofera"
  ) {
    throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
  }
  try {
    const [directoryMetadata, storeMetadata, blobMetadata, executableMetadata] = await Promise.all([
      lstat(directory),
      lstat(storePath),
      lstat(protectedBlobPath),
      lstat(PINNED_POWERSHELL_EXECUTABLE)
    ]);
    if (
      !directoryMetadata.isDirectory() ||
      directoryMetadata.isSymbolicLink() ||
      !storeMetadata.isFile() ||
      storeMetadata.isSymbolicLink() ||
      storeMetadata.nlink !== 1 ||
      !blobMetadata.isFile() ||
      blobMetadata.isSymbolicLink() ||
      blobMetadata.nlink !== 1 ||
      !executableMetadata.isFile() ||
      executableMetadata.isSymbolicLink()
    ) {
      throw new Error("metadata");
    }
    const [realDirectory, realStore, realBlob, realExecutable] = await Promise.all([
      realpath(directory),
      realpath(storePath),
      realpath(protectedBlobPath),
      realpath(PINNED_POWERSHELL_EXECUTABLE)
    ]);
    if (
      win32.normalize(realDirectory).toLowerCase() !== win32.normalize(directory).toLowerCase() ||
      win32.normalize(realStore).toLowerCase() !== win32.normalize(storePath).toLowerCase() ||
      win32.normalize(realBlob).toLowerCase() !==
        win32.normalize(protectedBlobPath).toLowerCase() ||
      win32.normalize(realExecutable).toLowerCase() !==
        win32.normalize(PINNED_POWERSHELL_EXECUTABLE).toLowerCase() ||
      win32.normalize(dirname(realStore)).toLowerCase() !==
        win32.normalize(realDirectory).toLowerCase() ||
      win32.normalize(dirname(realBlob)).toLowerCase() !==
        win32.normalize(realDirectory).toLowerCase()
    ) {
      throw new Error("realpath");
    }
    return Object.freeze({ protectedBlobPath, storePath });
  } catch (error) {
    if (error instanceof BscTestnetPtaWbnbLpExecutionFailure) throw error;
    throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
  }
}

function deriveKey(password: Uint8Array, salt: Uint8Array): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    scrypt(
      password,
      salt,
      DERIVED_KEY_BYTES,
      { N: 131_072, maxmem: SCRYPT_MAXIMUM_MEMORY_BYTES, p: 1, r: 8 },
      (error, derivedKey) => {
        if (error !== null) {
          rejectPromise(new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE"));
          return;
        }
        resolvePromise(derivedKey);
      }
    );
  });
}

function serializeAndSignExactTransaction<TSigner extends Address>(
  secretScalar: Buffer,
  transaction: BscTestnetPtaWbnbLpExactExecutionTransaction,
  expectedSigner: TSigner
): BscTestnetPtaWbnbLpSignedTransaction<TSigner> {
  let digest: Buffer | null = null;
  try {
    if (secretScalar.byteLength !== 32) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("SIGNING_FAILED");
    }
    const unsignedTransaction = {
      chainId: BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID,
      data: transaction.data,
      gas: transaction.gasLimit,
      gasPrice: transaction.gasPriceWei,
      nonce: Number(transaction.nonce),
      to: transaction.to,
      type: "legacy" as const,
      value: transaction.valueWei
    };
    const unsigned = serializeTransaction(unsignedTransaction);
    const signingHash = keccak256(unsigned);
    digest = Buffer.from(signingHash.slice(2), "hex");
    const signature = secp256k1.sign(digest, secretScalar, {
      lowS: true,
      extraEntropy: false,
      prehash: false
    });
    if (signature.recovery !== 0 && signature.recovery !== 1) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("SIGNING_FAILED");
    }
    const rawTransaction = serializeTransaction(unsignedTransaction, {
      r: numberToHex(signature.r, { size: 32 }),
      s: numberToHex(signature.s, { size: 32 }),
      v: signature.recovery === 0 ? 27n : 28n
    });
    const transactionHash = keccak256(rawTransaction);
    return {
      rawTransaction,
      rawTransactionKeccak256: transactionHash,
      signingHash,
      transactionHash,
      recoveredSigner: expectedSigner
    };
  } finally {
    digest?.fill(0);
    secretScalar.fill(0);
  }
}

async function unlockEncryptedStoreSecretForSigning(
  storeBytes: Buffer,
  passwordBytes: Buffer
): Promise<Buffer> {
  let parsed: ReturnType<typeof parseBscTestnetDeployerEncryptedStore> = null;
  let derivedKey: Buffer | null = null;
  let macMaterial: Buffer | null = null;
  let calculatedMac: Buffer | null = null;
  let secretScalar: Buffer | null = null;
  let publicKey: Buffer | null = null;
  try {
    if (passwordBytes.byteLength !== PASSWORD_BYTES) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
    }
    parsed = parseBscTestnetDeployerEncryptedStore(storeBytes, BSC_TESTNET_PTA_WBNB_LP_OWNER);
    if (parsed === null) throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
    derivedKey = await deriveKey(passwordBytes, parsed.salt);
    macMaterial = Buffer.concat([derivedKey.subarray(16, 32), parsed.cipherText]);
    calculatedMac = Buffer.from(keccak256(macMaterial).slice(2), "hex");
    macMaterial.fill(0);
    macMaterial = null;
    if (!timingSafeEqual(calculatedMac, parsed.mac)) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
    }
    calculatedMac.fill(0);
    calculatedMac = null;
    const decipher = createDecipheriv("aes-128-ctr", derivedKey.subarray(0, 16), parsed.iv);
    secretScalar = Buffer.concat([decipher.update(parsed.cipherText), decipher.final()]);
    publicKey = Buffer.from(secp256k1.getPublicKey(secretScalar, false));
    const recoveredAddress = getAddress(`0x${keccak256(publicKey.subarray(1)).slice(-40)}`);
    publicKey.fill(0);
    publicKey = null;
    if (recoveredAddress !== BSC_TESTNET_PTA_WBNB_LP_OWNER) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
    }
    const ownedScalar = secretScalar;
    secretScalar = null;
    return ownedScalar;
  } finally {
    storeBytes.fill(0);
    passwordBytes.fill(0);
    derivedKey?.fill(0);
    macMaterial?.fill(0);
    calculatedMac?.fill(0);
    secretScalar?.fill(0);
    publicKey?.fill(0);
    parsed?.cipherText.fill(0);
    parsed?.iv.fill(0);
    parsed?.mac.fill(0);
    parsed?.salt.fill(0);
  }
}

async function prepareBscTestnetPtaWbnbLpSigningSecretForInternalUse(): Promise<Buffer> {
  let stage: BscTestnetPtaWbnbLpCustodySigningProbeStage = "platform";
  let storeBytes: Buffer | null = null;
  let protectedBytes: Buffer | null = null;
  let passwordBytes: Buffer | null = null;
  let executableBytes: Buffer | null = null;
  let secretScalar: Buffer | null = null;
  try {
    if (process.platform !== "win32") {
      throw new Error("platform");
    }
    const signal = new AbortController().signal;
    stage = "runtime_precheck";
    await assertPinnedDeterministicSigningRuntimeForInternalUse();
    stage = "custody_location";
    const custody = await resolveFixedCustody();
    stage = "metadata_acl";
    const readiness = await probeWindowsBscTestnetDeployerCustodyMetadataForInternalUse(
      custody,
      signal
    );
    if (readiness.status !== "ready") throw new Error("metadata");
    stage = "artifact_read";
    const paths = await inspectCustodyPaths(custody);
    const [storeFile, protectedFile, executableFile] = await Promise.all([
      readStableRegularFile(paths.storePath, MAXIMUM_STORE_BYTES),
      readStableRegularFile(paths.protectedBlobPath, MAXIMUM_PROTECTED_BLOB_BYTES),
      readStableRegularFile(PINNED_POWERSHELL_EXECUTABLE, 1_048_576, false, false)
    ]);
    storeBytes = storeFile.bytes;
    protectedBytes = protectedFile.bytes;
    executableBytes = executableFile.bytes;
    stage = "artifact_hash";
    if (
      sha256Hex(storeBytes) !== BSC_TESTNET_DEPLOYER_STORE_SHA256 ||
      sha256Hex(protectedBytes) !== BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_SHA256 ||
      sha256Hex(executableBytes) !== PINNED_POWERSHELL_SHA256
    ) {
      throw new Error("artifact hash");
    }
    executableBytes.fill(0);
    executableBytes = null;
    stage = "dpapi_unprotect";
    const unprotected = await runPinnedPowerShellForInternalUse(
      DPAPI_UNPROTECT_SCRIPT,
      protectedBytes,
      PASSWORD_BYTES,
      signal
    );
    passwordBytes = unprotected.output;
    stage = "keystore_unlock";
    secretScalar = await unlockEncryptedStoreSecretForSigning(storeBytes, passwordBytes);
    storeBytes = null;
    passwordBytes = null;
    stage = "postcheck";
    const afterPaths = await inspectCustodyPaths(custody);
    if (
      afterPaths.storePath !== paths.storePath ||
      afterPaths.protectedBlobPath !== paths.protectedBlobPath
    ) {
      throw new Error("path drift");
    }
    const [afterStore, afterProtected] = await Promise.all([
      readStableRegularFile(afterPaths.storePath, MAXIMUM_STORE_BYTES),
      readStableRegularFile(afterPaths.protectedBlobPath, MAXIMUM_PROTECTED_BLOB_BYTES)
    ]);
    try {
      if (
        !sameSnapshot(afterStore.snapshot, storeFile.snapshot) ||
        !sameSnapshot(afterProtected.snapshot, protectedFile.snapshot) ||
        sha256Hex(afterStore.bytes) !== BSC_TESTNET_DEPLOYER_STORE_SHA256 ||
        sha256Hex(afterProtected.bytes) !== BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_SHA256
      ) {
        throw new Error("artifact drift");
      }
    } finally {
      afterStore.bytes.fill(0);
      afterProtected.bytes.fill(0);
    }
    stage = "runtime_postcheck";
    await assertPinnedDeterministicSigningRuntimeForInternalUse();
    const ownedScalar = secretScalar;
    secretScalar = null;
    return ownedScalar;
  } catch (error) {
    if (error instanceof BscTestnetPtaWbnbLpCustodySigningProbeFailure) throw error;
    throw new BscTestnetPtaWbnbLpCustodySigningProbeFailure(stage);
  } finally {
    storeBytes?.fill(0);
    protectedBytes?.fill(0);
    passwordBytes?.fill(0);
    executableBytes?.fill(0);
    secretScalar?.fill(0);
  }
}

export async function probeBscTestnetPtaWbnbLpSigningCustodyForInternalUse(): Promise<
  | Readonly<{ status: "ready" }>
  | Readonly<{
      status: "unavailable";
      stage: BscTestnetPtaWbnbLpCustodySigningProbeStage | "unknown";
    }>
> {
  let secretScalar: Buffer | null = null;
  try {
    secretScalar = await prepareBscTestnetPtaWbnbLpSigningSecretForInternalUse();
    return Object.freeze({ status: "ready" as const });
  } catch (error) {
    return Object.freeze({
      status: "unavailable" as const,
      stage:
        error instanceof BscTestnetPtaWbnbLpCustodySigningProbeFailure
          ? error.stage
          : ("unknown" as const)
    });
  } finally {
    secretScalar?.fill(0);
  }
}

function assertSignedTransaction<TSigner extends Address>(
  signed: BscTestnetPtaWbnbLpSignedTransaction<TSigner>,
  expected: BscTestnetPtaWbnbLpExactExecutionTransaction,
  expectedSigner: TSigner
): Promise<BscTestnetPtaWbnbLpSignedTransaction<TSigner>> {
  return (async () => {
    const serialized = signed.rawTransaction as TransactionSerialized;
    const parsed = parseTransaction(serialized);
    const recovered = await recoverTransactionAddress({
      serializedTransaction: serialized
    });
    if (
      recovered !== expectedSigner ||
      signed.recoveredSigner !== recovered ||
      signed.transactionHash !== keccak256(signed.rawTransaction) ||
      signed.rawTransactionKeccak256 !== signed.transactionHash ||
      parsed.type !== "legacy" ||
      parsed.chainId !== BSC_TESTNET_PTA_WBNB_LP_CHAIN_ID ||
      parsed.nonce !== Number(expected.nonce) ||
      parsed.to === null ||
      parsed.to === undefined ||
      getAddress(parsed.to) !== expected.to ||
      parsed.data !== expected.data ||
      (parsed.value ?? 0n) !== expected.valueWei ||
      parsed.gas !== expected.gasLimit ||
      parsed.gasPrice !== expected.gasPriceWei
    ) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("SIGNING_FAILED");
    }
    return Object.freeze(signed);
  })();
}

export async function reconstructExactBscTestnetPtaWbnbLpTransactionForInternalUse<
  TSigner extends Address
>(
  secretScalar: Buffer,
  transaction: BscTestnetPtaWbnbLpExactExecutionTransaction,
  expectedSigner: TSigner
): Promise<BscTestnetPtaWbnbLpSignedTransaction<TSigner>> {
  try {
    if (getAddress(expectedSigner) !== expectedSigner) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("SIGNING_FAILED");
    }
    const signed = serializeAndSignExactTransaction(secretScalar, transaction, expectedSigner);
    return await assertSignedTransaction(signed, transaction, expectedSigner);
  } catch (error) {
    if (error instanceof BscTestnetPtaWbnbLpExecutionFailure) throw error;
    throw new BscTestnetPtaWbnbLpExecutionFailure("SIGNING_FAILED");
  } finally {
    secretScalar.fill(0);
  }
}

export async function assertFixedBscTestnetPtaWbnbLpCustodyMetadataForInternalUse(): Promise<void> {
  if (process.platform !== "win32") {
    throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
  }
  const custody = await resolveFixedCustody();
  const readiness = await probeWindowsBscTestnetDeployerCustodyMetadataForInternalUse(
    custody,
    new AbortController().signal
  );
  if (readiness.status !== "ready") {
    throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
  }
}

export async function signBscTestnetPtaWbnbLpExactTransactionForInternalUse(
  authorization: BscTestnetPtaWbnbLpConfirmedExecution,
  order: 1 | 2,
  nowMilliseconds: number
): Promise<BscTestnetPtaWbnbLpSignedTransaction> {
  const signedOrders = CONFIRMED_EXECUTION_SIGNED_ORDERS.get(authorization);
  if (
    !CONFIRMED_EXECUTIONS.has(authorization) ||
    signedOrders === undefined ||
    authorization[CONFIRMED_EXECUTION_BRAND] !== true ||
    !Number.isSafeInteger(nowMilliseconds) ||
    nowMilliseconds < authorization.confirmedAtMilliseconds ||
    nowMilliseconds >= authorization.executionExpiresAtMilliseconds
  ) {
    throw new BscTestnetPtaWbnbLpExecutionFailure("CONFIRMATION_EXPIRED");
  }
  const transaction = authorization.plan.transactions[order - 1];
  if (transaction?.order !== order) {
    throw new BscTestnetPtaWbnbLpExecutionFailure("PLAN_INVALID");
  }
  if (signedOrders.has(order)) {
    throw new BscTestnetPtaWbnbLpExecutionFailure("SIGNING_FAILED");
  }
  signedOrders.add(order);
  let secretScalar: Buffer | null = null;
  try {
    secretScalar = await prepareBscTestnetPtaWbnbLpSigningSecretForInternalUse();
    if (Date.now() >= authorization.executionExpiresAtMilliseconds) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("CONFIRMATION_EXPIRED");
    }
    const ownedScalar = secretScalar;
    secretScalar = null;
    return await reconstructExactBscTestnetPtaWbnbLpTransactionForInternalUse(
      ownedScalar,
      transaction,
      BSC_TESTNET_PTA_WBNB_LP_OWNER
    );
  } catch (error) {
    if (error instanceof BscTestnetPtaWbnbLpCustodySigningProbeFailure) {
      throw new BscTestnetPtaWbnbLpExecutionFailure("CUSTODY_UNAVAILABLE");
    }
    if (error instanceof BscTestnetPtaWbnbLpExecutionFailure) throw error;
    throw new BscTestnetPtaWbnbLpExecutionFailure("SIGNING_FAILED");
  } finally {
    secretScalar?.fill(0);
  }
}
