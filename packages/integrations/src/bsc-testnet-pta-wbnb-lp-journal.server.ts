import "server-only";

import { constants as fileConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, join, win32 } from "node:path";

import { keccak256, sha256, stringToHex, type Hex } from "viem";

import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import {
  BSC_TESTNET_PTA_WBNB_LP_OWNER,
  stableBscTestnetPtaWbnbLpJsonForInternalUse
} from "./bsc-testnet-pta-wbnb-lp-exact-scope";
import type {
  BscTestnetPtaWbnbLpConfirmedExecution,
  BscTestnetPtaWbnbLpSignedTransaction
} from "./bsc-testnet-pta-wbnb-lp-execution.server";

const JOURNAL_SCHEMA = "bsc_testnet_pta_wbnb_first_lp_journal_v1" as const;
const OPERATION_KEY = keccak256(
  stringToHex("ProofEra:bsc-testnet-pta-wbnb-first-lp-durable-operation:v1")
);
const ZERO_SHA256 = `0x${"0".repeat(64)}` as Hex;
const MAXIMUM_RECORD_BYTES = 16_384;
const RECORD_FILES = Object.freeze([
  "00-owner-confirmed.v1.json",
  "10-approval-signing-started.v1.json",
  "11-approval-signed.v1.json",
  "12-approval-submission-started.v1.json",
  "13-approval-terminal.v1.json",
  "20-mint-signing-started.v1.json",
  "21-mint-signed.v1.json",
  "22-mint-submission-started.v1.json",
  "23-mint-terminal.v1.json"
]);
const LOCAL_APPLICATION_DATA_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$path = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if ([String]::IsNullOrWhiteSpace($path)) { exit 47 }
[Console]::Out.Write($path)
`;
const PREPARE_DIRECTORY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
$path = $reader.ReadToEnd()
$reader.Dispose()
$current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$local = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$expected = [IO.Path]::GetFullPath([IO.Path]::Combine($local, 'ProofEra', 'operations', 'bsc-testnet-pta-wbnb-lp-v1'))
if ([IO.Path]::GetFullPath($path) -ne $expected) { exit 48 }
$localItem = Get-Item -LiteralPath $local -Force
if (-not $localItem.PSIsContainer -or (($localItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { exit 49 }
$cursor = $localItem.FullName
foreach ($segment in @('ProofEra', 'operations', 'bsc-testnet-pta-wbnb-lp-v1')) {
  $cursor = [IO.Path]::GetFullPath([IO.Path]::Combine($cursor, $segment))
  if (-not [IO.Directory]::Exists($cursor)) { [IO.Directory]::CreateDirectory($cursor) | Out-Null }
  $item = Get-Item -LiteralPath $cursor -Force
  if (-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $item.FullName -ne $cursor) { exit 50 }
}
$item = Get-Item -LiteralPath $path -Force
$existingAcl = Get-Acl -LiteralPath $path
$existingOwner = try {
  ([System.Security.Principal.SecurityIdentifier]::new($existingAcl.Owner)).Value
} catch {
  ([System.Security.Principal.NTAccount]::new($existingAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
}
if ($existingOwner -ne $current.Value) { exit 51 }
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($current)
$acl.SetAccessRuleProtection($true, $false)
$rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
  $current,
  [System.Security.AccessControl.FileSystemRights]::FullControl,
  [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
  [System.Security.AccessControl.PropagationFlags]::None,
  [System.Security.AccessControl.AccessControlType]::Allow
)
$acl.AddAccessRule($rule)
[IO.Directory]::SetAccessControl($path, $acl)
[Console]::Out.Write('{"ok":true}')
`;
const AUDIT_DIRECTORY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
$path = $reader.ReadToEnd()
$reader.Dispose()
$current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$local = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$expected = [IO.Path]::GetFullPath([IO.Path]::Combine($local, 'ProofEra', 'operations', 'bsc-testnet-pta-wbnb-lp-v1'))
if ([IO.Path]::GetFullPath($path) -ne $expected) { exit 60 }
$allowed = @(
  '00-owner-confirmed.v1.json',
  '10-approval-signing-started.v1.json',
  '11-approval-signed.v1.json',
  '12-approval-submission-started.v1.json',
  '13-approval-terminal.v1.json',
  '20-mint-signing-started.v1.json',
  '21-mint-signed.v1.json',
  '22-mint-submission-started.v1.json',
  '23-mint-terminal.v1.json'
)
$directory = Get-Item -LiteralPath $path -Force
if (-not $directory.PSIsContainer -or (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $directory.FullName -ne $expected) { exit 61 }
$directoryAcl = Get-Acl -LiteralPath $path
$owner = try {
  ([System.Security.Principal.SecurityIdentifier]::new($directoryAcl.Owner)).Value
} catch {
  ([System.Security.Principal.NTAccount]::new($directoryAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
}
if ($owner -ne $current.Value -or -not $directoryAcl.AreAccessRulesProtected) { exit 62 }
$directoryRules = @($directoryAcl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if ($directoryRules.Count -ne 1) { exit 62 }
$directoryRule = $directoryRules[0]
if (
  $directoryRule.IdentityReference.Value -ne $current.Value -or
  $directoryRule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
  $directoryRule.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl
) { exit 62 }
foreach ($entry in @(Get-ChildItem -LiteralPath $path -Force)) {
  if ($allowed -notcontains $entry.Name -or $entry.PSIsContainer -or (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $entry.Length -gt 16384) { exit 63 }
  $acl = Get-Acl -LiteralPath $entry.FullName
  $fileOwner = try {
    ([System.Security.Principal.SecurityIdentifier]::new($acl.Owner)).Value
  } catch {
    ([System.Security.Principal.NTAccount]::new($acl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  }
  $fileRules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  if ($fileOwner -ne $current.Value -or $fileRules.Count -ne 1) { exit 64 }
  $fileRule = $fileRules[0]
  if (
    $fileRule.IdentityReference.Value -ne $current.Value -or
    $fileRule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
    $fileRule.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl
  ) { exit 64 }
}
[Console]::Out.Write('{"ok":true}')
`;

type Step = "approval" | "mint";
type TerminalOutcome = "confirmed" | "reverted";
type JournalRecord = Readonly<Record<string, unknown>>;

export interface BscTestnetPtaWbnbLpJournalTerminalEvidence {
  readonly outcome: TerminalOutcome;
  readonly transactionHash: Hex;
  readonly receiptSha256: Hex;
  readonly finalitySha256: Hex;
  readonly blockNumber: string;
  readonly blockHash: Hex;
  readonly primaryFinalizedBlockNumber: string;
  readonly primaryFinalizedBlockHash: Hex;
  readonly corroboratorFinalizedBlockNumber: string;
  readonly corroboratorFinalizedBlockHash: Hex;
}

export type BscTestnetPtaWbnbLpJournalStatus =
  | "empty"
  | "owner_confirmed"
  | "approval_signing_started"
  | "approval_signed"
  | "approval_submission_started"
  | "approval_confirmed"
  | "approval_reverted"
  | "mint_signing_started"
  | "mint_signed"
  | "mint_submission_started"
  | "mint_confirmed"
  | "mint_reverted";

export interface BscTestnetPtaWbnbLpJournalState {
  readonly status: BscTestnetPtaWbnbLpJournalStatus;
  readonly records: readonly JournalRecord[];
  readonly ownerRecord: JournalRecord | null;
  readonly approvalSigned: BscTestnetPtaWbnbLpSignedTransaction | null;
  readonly mintSigned: BscTestnetPtaWbnbLpSignedTransaction | null;
  readonly approvalTerminal: BscTestnetPtaWbnbLpJournalTerminalEvidence | null;
  readonly mintTerminal: BscTestnetPtaWbnbLpJournalTerminalEvidence | null;
}

export interface BscTestnetPtaWbnbLpJournal {
  readonly readState: () => Promise<BscTestnetPtaWbnbLpJournalState>;
  readonly commitOwnerConfirmed: (
    authorization: BscTestnetPtaWbnbLpConfirmedExecution
  ) => Promise<void>;
  readonly commitSigningStarted: (
    authorization: BscTestnetPtaWbnbLpConfirmedExecution,
    step: Step
  ) => Promise<void>;
  readonly commitSigned: (
    authorization: BscTestnetPtaWbnbLpConfirmedExecution,
    step: Step,
    signed: BscTestnetPtaWbnbLpSignedTransaction
  ) => Promise<void>;
  readonly commitSubmissionStarted: (
    authorization: BscTestnetPtaWbnbLpConfirmedExecution,
    step: Step,
    signed: BscTestnetPtaWbnbLpSignedTransaction
  ) => Promise<void>;
  readonly commitTerminal: (
    authorization: BscTestnetPtaWbnbLpConfirmedExecution,
    step: Step,
    evidence: BscTestnetPtaWbnbLpJournalTerminalEvidence
  ) => Promise<void>;
  readonly commitTerminalFromRecovery: (
    step: Step,
    evidence: BscTestnetPtaWbnbLpJournalTerminalEvidence
  ) => Promise<void>;
}

export class BscTestnetPtaWbnbLpJournalFailure extends Error {
  override readonly name = "BscTestnetPtaWbnbLpJournalFailure";
  readonly code: "JOURNAL_INVALID" | "JOURNAL_OCCUPIED" | "JOURNAL_WRITE_UNKNOWN";

  constructor(code: BscTestnetPtaWbnbLpJournalFailure["code"]) {
    super("The exact BSC-testnet PTA/WBNB LP journal failed closed.");
    this.code = code;
  }
}

function canonicalUtc(now = new Date()): string {
  if (!Number.isFinite(now.getTime()))
    throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
  return now.toISOString();
}

function exactHex32(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/u.test(value);
}

function exactUintString(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value);
}

export function deriveBscTestnetPtaWbnbLpJournalRecordSha256ForInternalUse(
  record: JournalRecord
): Hex {
  return sha256(stringToHex(`${stableBscTestnetPtaWbnbLpJsonForInternalUse(record)}\n`));
}

const recordSha256 = deriveBscTestnetPtaWbnbLpJournalRecordSha256ForInternalUse;

function asRecord(value: unknown): JournalRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return value as JournalRecord;
}

function commonRecord(
  kind: string,
  sequence: number,
  previousRecordSha256: Hex,
  authorization: BscTestnetPtaWbnbLpConfirmedExecution
): Record<string, unknown> {
  return {
    schema: JOURNAL_SCHEMA,
    operationKey: OPERATION_KEY,
    sequence,
    kind,
    previousRecordSha256,
    scopeSha256: authorization.plan.exactScopeSha256,
    sourceCommit: authorization.plan.sourceCommit,
    runtimeManifestSha256: authorization.runtimeManifestSha256,
    ownerConfirmationSha256: authorization.ownerConfirmationSha256,
    owner: BSC_TESTNET_PTA_WBNB_LP_OWNER,
    recordedAt: canonicalUtc()
  };
}

function signedFromRecord(
  record: JournalRecord | undefined
): BscTestnetPtaWbnbLpSignedTransaction | null {
  if (
    record === undefined ||
    !exactHex32(record.rawTransactionKeccak256) ||
    !exactHex32(record.signingHash) ||
    !exactHex32(record.transactionHash) ||
    typeof record.rawTransaction !== "string" ||
    !/^0x[0-9a-f]+$/u.test(record.rawTransaction) ||
    record.recoveredSigner !== BSC_TESTNET_PTA_WBNB_LP_OWNER ||
    keccak256(record.rawTransaction as Hex) !== record.transactionHash ||
    record.rawTransactionKeccak256 !== record.transactionHash
  ) {
    return null;
  }
  return Object.freeze({
    rawTransaction: record.rawTransaction as Hex,
    rawTransactionKeccak256: record.rawTransactionKeccak256,
    signingHash: record.signingHash,
    transactionHash: record.transactionHash,
    recoveredSigner: BSC_TESTNET_PTA_WBNB_LP_OWNER
  });
}

function terminalFromRecord(
  record: JournalRecord | undefined
): BscTestnetPtaWbnbLpJournalTerminalEvidence | null {
  if (
    record === undefined ||
    (record.outcome !== "confirmed" && record.outcome !== "reverted") ||
    !exactHex32(record.transactionHash) ||
    !exactHex32(record.receiptSha256) ||
    !exactHex32(record.finalitySha256) ||
    !exactHex32(record.blockHash) ||
    !exactUintString(record.blockNumber) ||
    !exactUintString(record.primaryFinalizedBlockNumber) ||
    !exactHex32(record.primaryFinalizedBlockHash) ||
    !exactUintString(record.corroboratorFinalizedBlockNumber) ||
    !exactHex32(record.corroboratorFinalizedBlockHash)
  ) {
    return null;
  }
  const finality = {
    receiptBlockNumber: record.blockNumber,
    receiptBlockHash: record.blockHash,
    primaryFinalizedBlockNumber: record.primaryFinalizedBlockNumber,
    primaryFinalizedBlockHash: record.primaryFinalizedBlockHash,
    corroboratorFinalizedBlockNumber: record.corroboratorFinalizedBlockNumber,
    corroboratorFinalizedBlockHash: record.corroboratorFinalizedBlockHash,
    canonicalReceiptBlockAgreementVerified: true
  };
  if (
    BigInt(record.primaryFinalizedBlockNumber) < BigInt(record.blockNumber) ||
    BigInt(record.corroboratorFinalizedBlockNumber) < BigInt(record.blockNumber) ||
    sha256(stringToHex(stableBscTestnetPtaWbnbLpJsonForInternalUse(finality))) !==
      record.finalitySha256
  ) {
    return null;
  }
  return Object.freeze({
    outcome: record.outcome,
    transactionHash: record.transactionHash,
    receiptSha256: record.receiptSha256,
    finalitySha256: record.finalitySha256,
    blockNumber: record.blockNumber,
    blockHash: record.blockHash,
    primaryFinalizedBlockNumber: record.primaryFinalizedBlockNumber,
    primaryFinalizedBlockHash: record.primaryFinalizedBlockHash,
    corroboratorFinalizedBlockNumber: record.corroboratorFinalizedBlockNumber,
    corroboratorFinalizedBlockHash: record.corroboratorFinalizedBlockHash
  });
}

async function resolveJournalDirectory(): Promise<string> {
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
      throw new Error("local");
    }
    return win32.join(local, "ProofEra", "operations", "bsc-testnet-pta-wbnb-lp-v1");
  } catch {
    throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function runDirectoryScript(script: string, directory: string): Promise<void> {
  const input = Buffer.from(directory, "utf8");
  let output: Buffer | null = null;
  try {
    const result = await runPinnedPowerShellForInternalUse(
      script,
      input,
      32,
      new AbortController().signal
    );
    output = result.output;
    if (output.toString("utf8") !== '{"ok":true}') throw new Error("audit");
  } catch {
    throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function readRecord(directory: string, name: string): Promise<JournalRecord | null> {
  const path = join(directory, name);
  try {
    const beforePath = await lstat(path, { bigint: true });
    if (
      !beforePath.isFile() ||
      beforePath.isSymbolicLink() ||
      beforePath.nlink !== 1n ||
      beforePath.size <= 1n ||
      beforePath.size > BigInt(MAXIMUM_RECORD_BYTES)
    ) {
      throw new Error("metadata");
    }
    const canonicalPath = await realpath(path);
    if (
      win32.normalize(canonicalPath).toLowerCase() !== win32.normalize(path).toLowerCase() ||
      win32.normalize(dirname(canonicalPath)).toLowerCase() !==
        win32.normalize(directory).toLowerCase()
    ) {
      throw new Error("realpath");
    }
    const handle = await open(path, fileConstants.O_RDONLY | fileConstants.O_NOFOLLOW);
    try {
      const before = await handle.stat({ bigint: true });
      const bytes = await handle.readFile();
      const after = await handle.stat({ bigint: true });
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        bytes.byteLength !== Number(before.size) ||
        bytes.at(-1) !== 0x0a
      ) {
        throw new Error("unstable");
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const parsed = asRecord(JSON.parse(text.slice(0, -1)) as unknown);
      if (
        parsed === null ||
        `${stableBscTestnetPtaWbnbLpJsonForInternalUse(parsed)}\n` !== text ||
        parsed.schema !== JOURNAL_SCHEMA ||
        parsed.operationKey !== OPERATION_KEY
      ) {
        throw new Error("record");
      }
      return parsed;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
  }
}

async function createExclusive(
  directory: string,
  name: string,
  record: JournalRecord
): Promise<void> {
  const path = join(directory, name);
  const bytes = `${stableBscTestnetPtaWbnbLpJsonForInternalUse(record)}\n`;
  if (Buffer.byteLength(bytes) > MAXIMUM_RECORD_BYTES) {
    throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
  }
  try {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(bytes, { encoding: "utf8" });
      await handle.sync();
    } finally {
      await handle.close();
    }
    await runDirectoryScript(AUDIT_DIRECTORY_SCRIPT, directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_OCCUPIED");
    }
    if (error instanceof BscTestnetPtaWbnbLpJournalFailure) throw error;
    throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_WRITE_UNKNOWN");
  }
}

function deriveStatus(records: readonly JournalRecord[]): BscTestnetPtaWbnbLpJournalStatus {
  if (records.length === 0) return "empty";
  const last = records.at(-1);
  const kind = last?.kind;
  if (kind === "owner_confirmed") return "owner_confirmed";
  if (kind === "signing_started") {
    return last?.step === "approval" ? "approval_signing_started" : "mint_signing_started";
  }
  if (kind === "signed") return last?.step === "approval" ? "approval_signed" : "mint_signed";
  if (kind === "submission_started") {
    return last?.step === "approval" ? "approval_submission_started" : "mint_submission_started";
  }
  if (kind === "terminal" && last?.step === "approval" && last.outcome === "confirmed") {
    return "approval_confirmed";
  }
  if (kind === "terminal" && last?.step === "approval" && last.outcome === "reverted") {
    return "approval_reverted";
  }
  if (kind === "terminal" && last?.step === "mint" && last.outcome === "confirmed") {
    return "mint_confirmed";
  }
  if (kind === "terminal" && last?.step === "mint" && last.outcome === "reverted") {
    return "mint_reverted";
  }
  throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
}

export function parseBscTestnetPtaWbnbLpJournalRecordsForInternalUse(
  slots: readonly (JournalRecord | null)[]
): BscTestnetPtaWbnbLpJournalState {
  if (slots.length !== RECORD_FILES.length) {
    throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
  }
  const records: JournalRecord[] = [];
  let missingSeen = false;
  let previous = ZERO_SHA256;
  for (let index = 0; index < slots.length; index += 1) {
    const entry = slots[index];
    if (entry === null || entry === undefined) {
      missingSeen = true;
      continue;
    }
    if (
      missingSeen ||
      entry.sequence !== index ||
      entry.previousRecordSha256 !== previous ||
      !exactHex32(entry.previousRecordSha256)
    ) {
      throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
    }
    records.push(entry);
    previous = recordSha256(entry);
  }
  const owner = records[0];
  if (owner !== undefined) {
    if (
      owner.kind !== "owner_confirmed" ||
      owner.sequence !== 0 ||
      !exactHex32(owner.scopeSha256) ||
      typeof owner.sourceCommit !== "string" ||
      !/^[0-9a-f]{40}$/u.test(owner.sourceCommit) ||
      !exactHex32(owner.runtimeManifestSha256) ||
      !exactHex32(owner.ownerConfirmationSha256) ||
      owner.owner !== BSC_TESTNET_PTA_WBNB_LP_OWNER
    ) {
      throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
    }
    const expectedKinds = [
      ["owner_confirmed", undefined],
      ["signing_started", "approval"],
      ["signed", "approval"],
      ["submission_started", "approval"],
      ["terminal", "approval"],
      ["signing_started", "mint"],
      ["signed", "mint"],
      ["submission_started", "mint"],
      ["terminal", "mint"]
    ] as const;
    for (let index = 0; index < records.length; index += 1) {
      const entry = records[index];
      const expected = expectedKinds[index];
      if (
        entry === undefined ||
        expected === undefined ||
        entry.kind !== expected[0] ||
        (expected[1] === undefined ? "step" in entry : entry.step !== expected[1]) ||
        entry.scopeSha256 !== owner.scopeSha256 ||
        entry.sourceCommit !== owner.sourceCommit ||
        entry.runtimeManifestSha256 !== owner.runtimeManifestSha256 ||
        entry.ownerConfirmationSha256 !== owner.ownerConfirmationSha256 ||
        entry.owner !== owner.owner
      ) {
        throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
      }
    }
    const approvalTerminal = records[4];
    if (records.length > 5 && approvalTerminal?.outcome !== "confirmed") {
      throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
    }
  }
  const status = deriveStatus(records);
  const approvalSignedRecord = records.find(
    (entry) => entry.kind === "signed" && entry.step === "approval"
  );
  const mintSignedRecord = records.find(
    (entry) => entry.kind === "signed" && entry.step === "mint"
  );
  const approvalTerminalRecord = records.find(
    (entry) => entry.kind === "terminal" && entry.step === "approval"
  );
  const mintTerminalRecord = records.find(
    (entry) => entry.kind === "terminal" && entry.step === "mint"
  );
  const approvalSigned =
    approvalSignedRecord === undefined ? null : signedFromRecord(approvalSignedRecord);
  const mintSigned = mintSignedRecord === undefined ? null : signedFromRecord(mintSignedRecord);
  const approvalTerminal =
    approvalTerminalRecord === undefined ? null : terminalFromRecord(approvalTerminalRecord);
  const mintTerminal =
    mintTerminalRecord === undefined ? null : terminalFromRecord(mintTerminalRecord);
  if (
    (approvalSignedRecord !== undefined && approvalSigned === null) ||
    (mintSignedRecord !== undefined && mintSigned === null) ||
    (approvalTerminalRecord !== undefined && approvalTerminal === null) ||
    (mintTerminalRecord !== undefined && mintTerminal === null)
  ) {
    throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
  }
  return Object.freeze({
    status,
    records: Object.freeze(records),
    ownerRecord: records[0] ?? null,
    approvalSigned,
    mintSigned,
    approvalTerminal,
    mintTerminal
  });
}

async function loadState(directory: string): Promise<BscTestnetPtaWbnbLpJournalState> {
  await runDirectoryScript(AUDIT_DIRECTORY_SCRIPT, directory);
  const slots = await Promise.all(RECORD_FILES.map((name) => readRecord(directory, name)));
  return parseBscTestnetPtaWbnbLpJournalRecordsForInternalUse(slots);
}

function assertAuthorizationBinding(
  state: BscTestnetPtaWbnbLpJournalState,
  authorization: BscTestnetPtaWbnbLpConfirmedExecution
): void {
  const owner = state.ownerRecord;
  if (
    owner === null ||
    owner.scopeSha256 !== authorization.plan.exactScopeSha256 ||
    owner.sourceCommit !== authorization.plan.sourceCommit ||
    owner.runtimeManifestSha256 !== authorization.runtimeManifestSha256 ||
    owner.ownerConfirmationSha256 !== authorization.ownerConfirmationSha256
  ) {
    throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
  }
}

export async function createWindowsBscTestnetPtaWbnbLpJournalForInternalUse(): Promise<BscTestnetPtaWbnbLpJournal> {
  if (process.platform !== "win32") {
    throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
  }
  const directory = await resolveJournalDirectory();
  await runDirectoryScript(PREPARE_DIRECTORY_SCRIPT, directory);
  const readState = () => loadState(directory);

  const append = async (
    authorization: BscTestnetPtaWbnbLpConfirmedExecution,
    expectedStatus: BscTestnetPtaWbnbLpJournalStatus,
    fileIndex: number,
    fields: Readonly<Record<string, unknown>>
  ): Promise<void> => {
    const state = await readState();
    if (state.status !== expectedStatus) {
      throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_OCCUPIED");
    }
    if (state.status !== "empty") assertAuthorizationBinding(state, authorization);
    const last = state.records.at(-1);
    if (state.records.length !== 0 && last === undefined) {
      throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
    }
    const previous = last === undefined ? ZERO_SHA256 : recordSha256(last);
    const next = Object.freeze({
      ...commonRecord(fields.kind as string, fileIndex, previous, authorization),
      ...fields
    });
    await createExclusive(directory, RECORD_FILES[fileIndex] as string, next);
  };

  const journal: BscTestnetPtaWbnbLpJournal = {
    readState,
    async commitOwnerConfirmed(authorization): Promise<void> {
      await append(authorization, "empty", 0, {
        kind: "owner_confirmed",
        confirmedAt: authorization.confirmedAt,
        executionExpiresAt: authorization.executionExpiresAt,
        approvalNonce: authorization.plan.transactions[0].nonce.toString(),
        mintNonce: authorization.plan.transactions[1].nonce.toString(),
        maximumNativeOutflowWei: authorization.plan.maximumNativeOutflowWei.toString()
      });
    },
    async commitSigningStarted(authorization, step): Promise<void> {
      const approval = step === "approval";
      const expected = approval ? "owner_confirmed" : "approval_confirmed";
      const index = approval ? 1 : 5;
      const transaction = authorization.plan.transactions[approval ? 0 : 1];
      await append(authorization, expected, index, {
        kind: "signing_started",
        step,
        transactionOrder: transaction.order,
        nonce: transaction.nonce.toString(),
        to: transaction.to,
        dataKeccak256: transaction.dataKeccak256,
        valueWei: transaction.valueWei.toString(),
        gasLimit: transaction.gasLimit.toString(),
        gasPriceWei: transaction.gasPriceWei.toString()
      });
    },
    async commitSigned(authorization, step, signed): Promise<void> {
      const approval = step === "approval";
      await append(
        authorization,
        approval ? "approval_signing_started" : "mint_signing_started",
        approval ? 2 : 6,
        {
          kind: "signed",
          step,
          signingHash: signed.signingHash,
          transactionHash: signed.transactionHash,
          rawTransactionKeccak256: signed.rawTransactionKeccak256,
          recoveredSigner: signed.recoveredSigner,
          rawTransaction: signed.rawTransaction
        }
      );
    },
    async commitSubmissionStarted(authorization, step, signed): Promise<void> {
      const approval = step === "approval";
      await append(authorization, approval ? "approval_signed" : "mint_signed", approval ? 3 : 7, {
        kind: "submission_started",
        step,
        transactionHash: signed.transactionHash,
        rawTransactionKeccak256: signed.rawTransactionKeccak256,
        sendMaximum: 1,
        retryAllowed: false,
        replacementAllowed: false
      });
    },
    async commitTerminal(authorization, step, evidence): Promise<void> {
      const approval = step === "approval";
      await append(
        authorization,
        approval ? "approval_submission_started" : "mint_submission_started",
        approval ? 4 : 8,
        {
          kind: "terminal",
          step,
          outcome: evidence.outcome,
          transactionHash: evidence.transactionHash,
          receiptSha256: evidence.receiptSha256,
          finalitySha256: evidence.finalitySha256,
          blockNumber: evidence.blockNumber,
          blockHash: evidence.blockHash,
          primaryFinalizedBlockNumber: evidence.primaryFinalizedBlockNumber,
          primaryFinalizedBlockHash: evidence.primaryFinalizedBlockHash,
          corroboratorFinalizedBlockNumber: evidence.corroboratorFinalizedBlockNumber,
          corroboratorFinalizedBlockHash: evidence.corroboratorFinalizedBlockHash
        }
      );
    },
    async commitTerminalFromRecovery(step, evidence): Promise<void> {
      const state = await readState();
      const approval = step === "approval";
      const expected = approval ? "approval_submission_started" : "mint_submission_started";
      const signed = approval ? state.approvalSigned : state.mintSigned;
      if (
        state.status !== expected ||
        state.ownerRecord === null ||
        signed === null ||
        evidence.transactionHash !== signed.transactionHash
      ) {
        throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
      }
      const last = state.records.at(-1);
      if (last === undefined) {
        throw new BscTestnetPtaWbnbLpJournalFailure("JOURNAL_INVALID");
      }
      const previous = recordSha256(last);
      const owner = state.ownerRecord;
      const fileIndex = approval ? 4 : 8;
      const next = Object.freeze({
        schema: JOURNAL_SCHEMA,
        operationKey: OPERATION_KEY,
        sequence: fileIndex,
        kind: "terminal",
        previousRecordSha256: previous,
        scopeSha256: owner.scopeSha256,
        sourceCommit: owner.sourceCommit,
        runtimeManifestSha256: owner.runtimeManifestSha256,
        ownerConfirmationSha256: owner.ownerConfirmationSha256,
        owner: BSC_TESTNET_PTA_WBNB_LP_OWNER,
        recordedAt: canonicalUtc(),
        step,
        outcome: evidence.outcome,
        transactionHash: evidence.transactionHash,
        receiptSha256: evidence.receiptSha256,
        finalitySha256: evidence.finalitySha256,
        blockNumber: evidence.blockNumber,
        blockHash: evidence.blockHash,
        primaryFinalizedBlockNumber: evidence.primaryFinalizedBlockNumber,
        primaryFinalizedBlockHash: evidence.primaryFinalizedBlockHash,
        corroboratorFinalizedBlockNumber: evidence.corroboratorFinalizedBlockNumber,
        corroboratorFinalizedBlockHash: evidence.corroboratorFinalizedBlockHash
      });
      await createExclusive(directory, RECORD_FILES[fileIndex] as string, next);
    }
  };
  return Object.freeze(journal);
}

export const BSC_TESTNET_PTA_WBNB_LP_JOURNAL_BOUNDARY = Object.freeze({
  environment: "bsc-testnet" as const,
  chainId: 97 as const,
  operationKey: OPERATION_KEY,
  appendOnly: true as const,
  ownerCurrentUserAclOnly: true as const,
  signingStartedBeforeCustodyUnlockRequired: true as const,
  signedCommitBeforeSubmissionRequired: true as const,
  submissionStartedBeforeSendRequired: true as const,
  oneSendMaximumPerTransaction: true as const,
  retryOrReplacementAllowed: false as const,
  reconciliationOnlyAfterSubmissionStarted: true as const,
  mainnetWritePossible: false as const
});
