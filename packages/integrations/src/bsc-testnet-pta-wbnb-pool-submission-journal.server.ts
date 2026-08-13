import "server-only";

import { constants as fileConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import type { Hex } from "viem";

import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import { BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY } from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  type BscTestnetPtaWbnbPoolSubmissionJournal,
  type BscTestnetPtaWbnbPoolSubmissionJournalState,
  type BscTestnetPtaWbnbPoolSubmissionStartedRequest,
  type BscTestnetPtaWbnbPoolTerminalReconciliationRequest
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SUBDIRECTORY = ["ProofEra", "operations", "bsc-testnet-pta-wbnb-pool-submission-v1"] as const;
const SCHEMA = "bsc_testnet_pta_wbnb_pool_submission_journal_v1" as const;
const SIGNED_COMMIT_FILE = "01-signed-commit.v1.json" as const;
const SUBMISSION_STARTED_FILE = "02-submission-started.v1.json" as const;
const TERMINAL_RECONCILIATION_FILE = "03-terminal-reconciliation.v1.json" as const;
const FILES = Object.freeze([
  SIGNED_COMMIT_FILE,
  SUBMISSION_STARTED_FILE,
  TERMINAL_RECONCILIATION_FILE
] as const);

function isJournalFileName(value: string): boolean {
  return FILES.some((name) => name === value);
}
const MAXIMUM_RECORD_BYTES = 32_768;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const RELEASE_COMMIT = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const BINDING_KEYS = [
  "claimId",
  "envelopeHash",
  "operationKey",
  "ownerAuthorizationDigest",
  "releaseCommit",
  "reviewerApprovalDigest",
  "runtimeManifestSha256",
  "signedTransactionKeccak256",
  "signingHash",
  "submissionStartedDigest",
  "transactionHash"
] as const;
const INITIAL_KEYS = [...BINDING_KEYS, "schemaVersion", "state"] as const;
const START_KEYS = [...BINDING_KEYS, "operation", "schemaVersion"] as const;
const TERMINAL_KEYS = [
  ...BINDING_KEYS,
  "operation",
  "outcome",
  "reconciliationDigest",
  "schemaVersion"
] as const;

type DataRecord = Readonly<Record<string, unknown>>;
type Binding = Pick<
  BscTestnetPtaWbnbPoolSubmissionJournalState,
  | "claimId"
  | "operationKey"
  | "envelopeHash"
  | "releaseCommit"
  | "runtimeManifestSha256"
  | "reviewerApprovalDigest"
  | "ownerAuthorizationDigest"
  | "signingHash"
  | "transactionHash"
  | "signedTransactionKeccak256"
  | "submissionStartedDigest"
>;

type StoredRecord = Readonly<
  Binding & {
    schema: typeof SCHEMA;
    kind: "signed_commit" | "submission_started" | "confirmed" | "reverted";
    recordedAt: string;
    reconciliationDigest?: Hex;
  }
>;

export interface BscTestnetPtaWbnbPoolSubmissionJournalPorts {
  readonly now: () => Date;
  readonly listNames: () => Promise<readonly string[]>;
  readonly readBounded: (name: string) => Promise<string | null>;
  readonly createExclusive: (name: string, content: string) => Promise<"created" | "exists">;
  readonly assertSecure: (existingFiles: readonly string[]) => Promise<boolean>;
}

export interface BscTestnetPtaWbnbPoolDurableSubmissionJournal extends BscTestnetPtaWbnbPoolSubmissionJournal {
  readonly initializeSignedCommit: (
    state: BscTestnetPtaWbnbPoolSubmissionJournalState
  ) => Promise<Readonly<{ status: "initialized_by_this_call" | "already_initialized" }>>;
}

function inspectRecord(input: unknown, expectedKeys?: readonly string[]): DataRecord | null {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input) || isProxy(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) return null;
    const actual = (keys as string[]).sort();
    if (expectedKeys !== undefined) {
      const expected = [...expectedKeys].sort();
      if (
        actual.length !== expected.length ||
        actual.some((key, index) => key !== expected[index])
      ) {
        return null;
      }
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of actual) {
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

function callable(input: unknown): input is (...arguments_: never[]) => unknown {
  return typeof input === "function" && !isProxy(input);
}

function exactHex32(input: unknown): input is Hex {
  return typeof input === "string" && BYTES32.test(input) && input !== `0x${"00".repeat(32)}`;
}

function exactClaimId(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input)
  );
}

function exactUtc(input: unknown): input is string {
  if (typeof input !== "string" || input.length !== 24 || !UTC.test(input)) return false;
  const milliseconds = Date.parse(input);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString() === input;
}

function captureNow(clock: () => Date): string | null {
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
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0
      ? new Date(milliseconds).toISOString()
      : null;
  } catch {
    return null;
  }
}

function parseBinding(input: DataRecord): Binding | null {
  if (
    input.operationKey !== BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY ||
    !exactClaimId(input.claimId) ||
    !exactHex32(input.envelopeHash) ||
    typeof input.releaseCommit !== "string" ||
    input.releaseCommit.length !== 40 ||
    !RELEASE_COMMIT.test(input.releaseCommit) ||
    input.releaseCommit === "0".repeat(40) ||
    !exactHex32(input.runtimeManifestSha256) ||
    !exactHex32(input.reviewerApprovalDigest) ||
    !exactHex32(input.ownerAuthorizationDigest) ||
    input.reviewerApprovalDigest === input.ownerAuthorizationDigest ||
    !exactHex32(input.signingHash) ||
    !exactHex32(input.transactionHash) ||
    !exactHex32(input.signedTransactionKeccak256) ||
    input.transactionHash !== input.signedTransactionKeccak256 ||
    !exactHex32(input.submissionStartedDigest)
  ) {
    return null;
  }
  return Object.freeze({
    claimId: input.claimId,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: input.envelopeHash,
    releaseCommit: input.releaseCommit,
    runtimeManifestSha256: input.runtimeManifestSha256,
    reviewerApprovalDigest: input.reviewerApprovalDigest,
    ownerAuthorizationDigest: input.ownerAuthorizationDigest,
    signingHash: input.signingHash,
    transactionHash: input.transactionHash,
    signedTransactionKeccak256: input.signedTransactionKeccak256,
    submissionStartedDigest: input.submissionStartedDigest
  });
}

function sameBinding(left: Binding, right: Binding): boolean {
  return BINDING_KEYS.every((key) => left[key] === right[key]);
}

function parseInitial(input: unknown): Binding | null {
  const record = inspectRecord(input, INITIAL_KEYS);
  if (
    record === null ||
    record.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION ||
    record.state !== "signed_committed"
  ) {
    return null;
  }
  return parseBinding(record);
}

function parseStart(input: unknown): Binding | null {
  const record = inspectRecord(input, START_KEYS);
  if (
    record === null ||
    record.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION ||
    record.operation !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION
  ) {
    return null;
  }
  return parseBinding(record);
}

function parseTerminal(
  input: unknown
): Readonly<{ binding: Binding; outcome: "confirmed" | "reverted"; digest: Hex }> | null {
  const record = inspectRecord(input, TERMINAL_KEYS);
  const binding = record === null ? null : parseBinding(record);
  if (
    record === null ||
    binding === null ||
    record.schemaVersion !== BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION ||
    record.operation !== BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION ||
    (record.outcome !== "confirmed" && record.outcome !== "reverted") ||
    !exactHex32(record.reconciliationDigest)
  ) {
    return null;
  }
  return Object.freeze({ binding, outcome: record.outcome, digest: record.reconciliationDigest });
}

function serialize(record: StoredRecord): string {
  return `${JSON.stringify(record)}\n`;
}

function parseStored(
  input: string | null,
  expectedKind: StoredRecord["kind"]
): StoredRecord | null {
  if (
    input === null ||
    Buffer.byteLength(input, "utf8") < 2 ||
    Buffer.byteLength(input, "utf8") > MAXIMUM_RECORD_BYTES ||
    !input.endsWith("\n")
  ) {
    return null;
  }
  try {
    const record = inspectRecord(JSON.parse(input.slice(0, -1)) as unknown);
    if (record === null) return null;
    const keys = ["schema", "kind", "recordedAt", ...BINDING_KEYS];
    if (expectedKind === "confirmed" || expectedKind === "reverted") {
      keys.push("reconciliationDigest");
    }
    const exact = inspectRecord(record, keys);
    const binding = exact === null ? null : parseBinding(exact);
    if (
      exact === null ||
      binding === null ||
      exact.schema !== SCHEMA ||
      exact.kind !== expectedKind ||
      !exactUtc(exact.recordedAt) ||
      ((expectedKind === "confirmed" || expectedKind === "reverted") &&
        !exactHex32(exact.reconciliationDigest))
    ) {
      return null;
    }
    return exact as unknown as StoredRecord;
  } catch {
    return null;
  }
}

function stateFrom(
  binding: Binding,
  state: BscTestnetPtaWbnbPoolSubmissionJournalState["state"]
): BscTestnetPtaWbnbPoolSubmissionJournalState {
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    ...binding,
    state
  });
}

function inspectPorts(input: unknown): BscTestnetPtaWbnbPoolSubmissionJournalPorts | null {
  const record = inspectRecord(input, [
    "assertSecure",
    "createExclusive",
    "listNames",
    "now",
    "readBounded"
  ]);
  return record !== null && Object.values(record).every(callable)
    ? (record as unknown as BscTestnetPtaWbnbPoolSubmissionJournalPorts)
    : null;
}

type Snapshot = Readonly<{
  binding: Binding | null;
  state: "empty" | BscTestnetPtaWbnbPoolSubmissionJournalState["state"];
  terminalDigest: Hex | null;
}>;

function unknownSnapshot(binding: Binding | null = null): Snapshot {
  return Object.freeze({ binding, state: "unknown_outcome", terminalDigest: null });
}

/** Append-only protocol core; production supplies only the fixed Windows adapter below. */
export function createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
  untrustedPorts: unknown
): BscTestnetPtaWbnbPoolDurableSubmissionJournal {
  const ports = inspectPorts(untrustedPorts);
  if (ports === null) throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");

  const readSnapshot = async (): Promise<Snapshot> => {
    try {
      const untrustedNames = await ports.listNames();
      if (
        !Array.isArray(untrustedNames) ||
        isProxy(untrustedNames) ||
        untrustedNames.length > FILES.length ||
        untrustedNames.some((name) => typeof name !== "string" || !isJournalFileName(name))
      ) {
        return unknownSnapshot();
      }
      const names = [...untrustedNames].sort();
      if (new Set(names).size !== names.length || !(await ports.assertSecure(names))) {
        return unknownSnapshot();
      }
      if (names.length === 0) {
        return Object.freeze({ binding: null, state: "empty" as const, terminalDigest: null });
      }
      if (names.some((name, index) => name !== FILES[index])) return unknownSnapshot();
      const initial = parseStored(await ports.readBounded(SIGNED_COMMIT_FILE), "signed_commit");
      if (initial === null) return unknownSnapshot();
      const binding = parseBinding(initial);
      if (binding === null) return unknownSnapshot();
      if (names.length === 1) {
        return Object.freeze({ binding, state: "signed_committed" as const, terminalDigest: null });
      }
      const started = parseStored(
        await ports.readBounded(SUBMISSION_STARTED_FILE),
        "submission_started"
      );
      if (started === null || !sameBinding(binding, started)) return unknownSnapshot(binding);
      if (names.length === 2) {
        return Object.freeze({
          binding,
          state: "submission_started" as const,
          terminalDigest: null
        });
      }
      const terminalText = await ports.readBounded(TERMINAL_RECONCILIATION_FILE);
      const confirmed = parseStored(terminalText, "confirmed");
      const reverted = confirmed === null ? parseStored(terminalText, "reverted") : null;
      const terminal = confirmed ?? reverted;
      if (
        terminal === null ||
        !sameBinding(binding, terminal) ||
        terminal.reconciliationDigest === undefined
      ) {
        return unknownSnapshot(binding);
      }
      return Object.freeze({
        binding,
        state: confirmed === null ? ("reverted" as const) : ("confirmed" as const),
        terminalDigest: terminal.reconciliationDigest
      });
    } catch {
      return unknownSnapshot();
    }
  };

  const initializeSignedCommit = async (
    input: BscTestnetPtaWbnbPoolSubmissionJournalState
  ): Promise<Readonly<{ status: "initialized_by_this_call" | "already_initialized" }>> => {
    const binding = parseInitial(input);
    const recordedAt = captureNow(ports.now);
    if (binding === null || recordedAt === null) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_INPUT_INVALID");
    }
    const before = await readSnapshot();
    if (before.state !== "empty") {
      if (before.binding === null || !sameBinding(before.binding, binding)) {
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
      }
      return Object.freeze({ status: "already_initialized" as const });
    }
    const outcome = await ports.createExclusive(
      SIGNED_COMMIT_FILE,
      serialize({ schema: SCHEMA, kind: "signed_commit", recordedAt, ...binding })
    );
    const after = await readSnapshot();
    if (after.binding === null || !sameBinding(after.binding, binding)) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    return Object.freeze({
      status: outcome === "created" ? "initialized_by_this_call" : "already_initialized"
    });
  };

  const readState = async (): Promise<unknown> => {
    const snapshot = await readSnapshot();
    return snapshot.binding === null
      ? Object.freeze({ state: snapshot.state })
      : stateFrom(
          snapshot.binding,
          snapshot.state as BscTestnetPtaWbnbPoolSubmissionJournalState["state"]
        );
  };

  const commitSubmissionStarted = async (
    input: BscTestnetPtaWbnbPoolSubmissionStartedRequest
  ): Promise<unknown> => {
    const binding = parseStart(input);
    const recordedAt = captureNow(ports.now);
    if (binding === null || recordedAt === null) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_INPUT_INVALID");
    }
    const before = await readSnapshot();
    if (before.binding === null || !sameBinding(before.binding, binding)) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    if (before.state !== "signed_committed") {
      if (
        before.state === "submission_started" ||
        before.state === "confirmed" ||
        before.state === "reverted"
      ) {
        return Object.freeze({
          status: "already_started" as const,
          transactionHash: binding.transactionHash,
          submissionStartedDigest: binding.submissionStartedDigest
        });
      }
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    const outcome = await ports.createExclusive(
      SUBMISSION_STARTED_FILE,
      serialize({ schema: SCHEMA, kind: "submission_started", recordedAt, ...binding })
    );
    const after = await readSnapshot();
    if (
      after.binding === null ||
      !sameBinding(after.binding, binding) ||
      (after.state !== "submission_started" &&
        after.state !== "confirmed" &&
        after.state !== "reverted")
    ) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    return Object.freeze({
      status: outcome === "created" ? "started_by_this_call" : "already_started",
      transactionHash: binding.transactionHash,
      submissionStartedDigest: binding.submissionStartedDigest
    });
  };

  const commitTerminalReconciliation = async (
    input: BscTestnetPtaWbnbPoolTerminalReconciliationRequest
  ): Promise<unknown> => {
    const parsed = parseTerminal(input);
    const recordedAt = captureNow(ports.now);
    if (parsed === null || recordedAt === null) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_INPUT_INVALID");
    }
    const before = await readSnapshot();
    if (before.binding === null || !sameBinding(before.binding, parsed.binding)) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
    }
    if (before.state === "confirmed" || before.state === "reverted") {
      if (before.state !== parsed.outcome || before.terminalDigest !== parsed.digest) {
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
      }
    } else {
      if (before.state !== "submission_started") {
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_STATE_MISMATCH");
      }
      await ports.createExclusive(
        TERMINAL_RECONCILIATION_FILE,
        serialize({
          schema: SCHEMA,
          kind: parsed.outcome,
          recordedAt,
          ...parsed.binding,
          reconciliationDigest: parsed.digest
        })
      );
      const after = await readSnapshot();
      if (after.state !== parsed.outcome || after.terminalDigest !== parsed.digest) {
        throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_OUTCOME_UNKNOWN");
      }
    }
    return Object.freeze({
      status: parsed.outcome,
      transactionHash: parsed.binding.transactionHash,
      submissionStartedDigest: parsed.binding.submissionStartedDigest,
      reconciliationDigest: parsed.digest
    });
  };

  return Object.freeze({
    initializeSignedCommit,
    readState,
    commitSubmissionStarted,
    commitTerminalReconciliation
  });
}

const PREPARE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if ([String]::IsNullOrWhiteSpace($base)) { throw 'base' }
  $baseItem = Get-Item -LiteralPath $base -Force
  if (-not $baseItem.PSIsContainer -or (($baseItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'base' }
  $cursor = $baseItem.FullName
  foreach ($segment in @('ProofEra', 'operations', 'bsc-testnet-pta-wbnb-pool-submission-v1')) {
    $candidate = [IO.Path]::GetFullPath([IO.Path]::Combine($cursor, $segment))
    if ([IO.Path]::GetDirectoryName($candidate) -ne [IO.Path]::GetFullPath($cursor)) { throw 'escape' }
    if (-not (Test-Path -LiteralPath $candidate)) { [void](New-Item -ItemType Directory -Path $candidate) }
    $item = Get-Item -LiteralPath $candidate -Force
    if (-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'path' }
    $cursor = $item.FullName
  }
  $allowed = @('01-signed-commit.v1.json','02-submission-started.v1.json','03-terminal-reconciliation.v1.json')
  foreach ($child in @(Get-ChildItem -LiteralPath $cursor -Force)) {
    if ($child.PSIsContainer -or ($allowed -notcontains $child.Name) -or (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $child.LinkType) { throw 'child' }
  }
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($current)
  $acl.SetAccessRuleProtection($true, $false)
  [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,$inherit,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow))
  [IO.Directory]::SetAccessControl($cursor, $acl)
  [Console]::Out.Write((@{ directory = $cursor } | ConvertTo-Json -Compress))
} catch { exit 61 }
`;

const ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $spec = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  foreach ($path in @($spec.paths)) {
    $item = Get-Item -LiteralPath $path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
    $acl = Get-Acl -LiteralPath $path
    if (-not $acl.AreAccessRulesProtected) { throw 'inheritance' }
    $owner = try { ([System.Security.Principal.SecurityIdentifier]::new($acl.Owner)).Value } catch { ([System.Security.Principal.NTAccount]::new($acl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value }
    if ($owner -ne $current.Value) { throw 'owner' }
    $rules = @($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]))
    if ($rules.Count -lt 1) { throw 'rules' }
    foreach ($rule in $rules) {
      if ($rule.IdentityReference.Value -ne $current.Value -or $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl)) { throw 'rule' }
    }
  }
  [Console]::Out.Write('{"ok":true}')
} catch { exit 62 }
`;

const PROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $spec = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $directory = Get-Item -LiteralPath $spec.directory -Force
  $file = Get-Item -LiteralPath $spec.file -Force
  if (-not $directory.PSIsContainer -or $file.PSIsContainer -or (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or [IO.Path]::GetDirectoryName($file.FullName) -ne $directory.FullName) { throw 'path' }
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = [System.Security.AccessControl.FileSecurity]::new()
  $acl.SetOwner($current)
  $acl.SetAccessRuleProtection($true, $false)
  [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.AccessControlType]::Allow))
  [IO.File]::SetAccessControl($file.FullName, $acl)
  [Console]::Out.Write('{"ok":true}')
} catch { exit 63 }
`;

async function powershellJson(script: string, value: unknown, maximum: number): Promise<unknown> {
  const input = Buffer.from(JSON.stringify(value), "utf8");
  let output: Buffer | null = null;
  try {
    const result = await runPinnedPowerShellForInternalUse(
      script,
      input,
      maximum,
      new AbortController().signal
    );
    output = result.output;
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)) as unknown;
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function readBounded(path: string): Promise<string | null> {
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
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_INVALID");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      after.nlink !== 1n ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_CHANGED");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function verifyPaths(directory: string, names: readonly string[]): Promise<boolean> {
  const directoryMetadata = await lstat(directory);
  const canonicalDirectory = await realpath(directory);
  if (
    !directoryMetadata.isDirectory() ||
    directoryMetadata.isSymbolicLink() ||
    win32.normalize(canonicalDirectory).toLowerCase() !== directory.toLowerCase()
  ) {
    return false;
  }
  for (const name of names) {
    if (!isJournalFileName(name)) return false;
    const path = win32.join(directory, name);
    const metadata = await lstat(path);
    const canonical = await realpath(path);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1 ||
      win32.normalize(canonical).toLowerCase() !== path.toLowerCase()
    ) {
      return false;
    }
  }
  const result = inspectRecord(
    await powershellJson(
      ACL_SCRIPT,
      { paths: [directory, ...names.map((name) => win32.join(directory, name))] },
      32
    ),
    ["ok"]
  );
  return result?.ok === true;
}

function expectedDirectory(value: unknown): string | null {
  const record = inspectRecord(value, ["directory"]);
  const directory = record?.directory;
  if (
    typeof directory !== "string" ||
    directory.length > 500 ||
    !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(directory) ||
    directory.includes("/") ||
    win32.normalize(directory) !== directory
  ) {
    return null;
  }
  const expectedSuffix = win32.join(...SUBDIRECTORY).toLowerCase();
  if (!directory.toLowerCase().endsWith(expectedSuffix)) return null;
  const relation = relative(REPOSITORY_ROOT, resolve(directory));
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")
    ? null
    : resolve(directory);
}

/** Fixed current-user-only Windows composition. No caller path or mutable storage choice exists. */
export async function createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(): Promise<BscTestnetPtaWbnbPoolDurableSubmissionJournal> {
  if (process.platform !== "win32") {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_WINDOWS_REQUIRED");
  }
  const directory = expectedDirectory(await powershellJson(PREPARE_SCRIPT, {}, 1_024));
  if (directory === null || !(await verifyPaths(directory, []))) {
    throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_CONFIGURATION_INVALID");
  }
  return createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
    Object.freeze({
      now: () => new Date(),
      listNames: async () => {
        const entries = await readdir(directory, { withFileTypes: true });
        const names: string[] = [];
        for (const entry of entries) {
          if (!entry.isFile() || !isJournalFileName(entry.name)) {
            throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_DIRECTORY_CONTAMINATED");
          }
          names.push(entry.name);
        }
        return Object.freeze(names.sort());
      },
      readBounded: (name: string) => {
        if (!isJournalFileName(name)) {
          throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_INVALID");
        }
        return readBounded(win32.join(directory, name));
      },
      createExclusive: async (name: string, content: string) => {
        if (!isJournalFileName(name) || Buffer.byteLength(content, "utf8") > MAXIMUM_RECORD_BYTES) {
          throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_INVALID");
        }
        const path = win32.join(directory, name);
        let handle;
        try {
          handle = await open(path, "wx", 0o600);
          await handle.writeFile(content, "utf8");
          await handle.sync();
          const retained = await handle.stat({ bigint: true });
          if (!retained.isFile() || retained.nlink !== 1n) {
            throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_FILE_INVALID");
          }
          await handle.close();
          handle = undefined;
          const protectedResult = inspectRecord(
            await powershellJson(PROTECT_SCRIPT, { directory, file: path }, 32),
            ["ok"]
          );
          if (protectedResult?.ok !== true || !(await verifyPaths(directory, [name]))) {
            throw new Error("PTA_WBNB_POOL_SUBMISSION_JOURNAL_ACL_INVALID");
          }
          return "created" as const;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") return "exists" as const;
          throw error;
        } finally {
          await handle?.close().catch(() => undefined);
        }
      },
      assertSecure: (names: readonly string[]) => verifyPaths(directory, names)
    })
  );
}
