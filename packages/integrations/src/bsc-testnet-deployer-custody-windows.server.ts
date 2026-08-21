import { spawn } from "node:child_process";
import { constants as fileConstants } from "node:fs";
import type { BigIntStats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_FILE,
  BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_SHA256,
  BSC_TESTNET_DEPLOYER_STORE_FILE,
  BSC_TESTNET_DEPLOYER_STORE_SHA256,
  sha256Hex,
  type BscTestnetDeployerCustodyUnavailableReason,
  type InternalCustodyProbeOperation,
  type InternalCustodyProbeResult,
  unlockBscTestnetDeployerEncryptedStore
} from "./bsc-testnet-deployer-custody-core";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MAXIMUM_PROTECTED_BLOB_BYTES = 4_096;
const MAXIMUM_STORE_BYTES = 65_536;
const PINNED_POWERSHELL_EXECUTABLE =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const PINNED_POWERSHELL_BYTES = 455_680;
const PINNED_POWERSHELL_SHA256 = "9785001b0dcf755eddb8af294a373c0b87b2498660f724e76c4d53f9c217c7a3";
const POWERSHELL_TIMEOUT_MS = 20_000;
const SUBPROCESS_CLEANUP_TIMEOUT_MS = 2_000;
const SYSTEM_TASKKILL_EXECUTABLE = "C:\\Windows\\System32\\taskkill.exe";

const ACL_PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Resolve-OwnerSid([System.Security.AccessControl.FileSystemSecurity]$Acl) {
  try {
    return ([System.Security.Principal.SecurityIdentifier]::new($Acl.Owner)).Value
  } catch {
    return ([System.Security.Principal.NTAccount]::new($Acl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  }
}

function Test-ExactCurrentUserAcl([string]$Path, [bool]$RequireDirectory, [bool]$RequireProtected) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if ($item.PSIsContainer -ne $RequireDirectory) { return $false }
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
  $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
  $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ((Resolve-OwnerSid $acl) -ne $currentSid) { return $false }
  if ($RequireProtected -and -not $acl.AreAccessRulesProtected) { return $false }
  $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  if ($rules.Count -ne 1) { return $false }
  $rule = $rules[0]
  if ($rule.IdentityReference.Value -ne $currentSid) { return $false }
  if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { return $false }
  $full = [System.Security.AccessControl.FileSystemRights]::FullControl
  if (($rule.FileSystemRights -band $full) -ne $full) { return $false }
  return $true
}

try {
  $specification = [Console]::In.ReadToEnd() | ConvertFrom-Json -ErrorAction Stop
  $ok = (Test-ExactCurrentUserAcl $specification.directory $true $true) -and
        (Test-ExactCurrentUserAcl $specification.store $false $false) -and
        (Test-ExactCurrentUserAcl $specification.blob $false $false)
  [Console]::Out.Write((ConvertTo-Json -Compress -InputObject @{ ok = [bool]$ok }))
  if (-not $ok) { exit 23 }
} catch {
  exit 24
}
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

class CustodyOperationError extends Error {
  override readonly name = "CustodyOperationError";
  readonly reason: Exclude<BscTestnetDeployerCustodyUnavailableReason, "closed">;

  constructor(reason: Exclude<BscTestnetDeployerCustodyUnavailableReason, "closed">) {
    super("The local custody readiness operation failed safely.");
    this.reason = reason;
  }
}

type FileSnapshot = Readonly<{
  birthtimeMs: number;
  ctimeMs: number;
  device: bigint;
  inode: bigint;
  links: bigint;
  mode: bigint;
  modifiedMs: number;
  size: number;
}>;

type PowerShellResult = Readonly<{
  output: Buffer;
  status: "ok";
}>;

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function isWithin(parent: string, candidate: string): boolean {
  const local = relative(parent, candidate);
  return local === "" || (!local.startsWith(`..${sep}`) && local !== ".." && !isAbsolute(local));
}

function encodePowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function createMinimalPowerShellEnvironment(): NodeJS.ProcessEnv {
  return Object.freeze({
    SystemRoot: "C:\\Windows",
    WINDIR: "C:\\Windows"
  });
}

export async function runPinnedPowerShellForInternalUse(
  script: string,
  input: Uint8Array,
  maximumOutputBytes: number,
  signal: AbortSignal,
  operationTimeoutMs = POWERSHELL_TIMEOUT_MS
): Promise<PowerShellResult> {
  if (signal.aborted) throw new CustodyOperationError("operation_failed");
  await assertPinnedPowerShellExecutableForInternalUse();
  let result: PowerShellResult;
  try {
    result = await new Promise((resolvePromise, rejectPromise) => {
      let settled = false;
      let outputBytes = 0;
      let errorBytes = 0;
      let requestedFailure: Exclude<BscTestnetDeployerCustodyUnavailableReason, "closed"> | null =
        null;
      let cleanupTimer: NodeJS.Timeout | null = null;
      const outputChunks: Buffer[] = [];
      let child;
      try {
        child = spawn(
          PINNED_POWERSHELL_EXECUTABLE,
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            encodePowerShell(script)
          ],
          {
            env: createMinimalPowerShellEnvironment(),
            shell: false,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true
          }
        );
      } catch {
        rejectPromise(new CustodyOperationError("operation_failed"));
        return;
      }

      const clearOutputChunks = () => {
        for (const chunk of outputChunks) chunk.fill(0);
        outputChunks.length = 0;
      };
      const destroyPipes = () => {
        try {
          child.stdin.destroy();
        } catch {
          // Best-effort local process cleanup.
        }
        try {
          child.stdout.destroy();
        } catch {
          // Best-effort local process cleanup.
        }
        try {
          child.stderr.destroy();
        } catch {
          // Best-effort local process cleanup.
        }
      };
      const finishRejected = (
        reason: Exclude<BscTestnetDeployerCustodyUnavailableReason, "closed">
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(operationTimer);
        if (cleanupTimer !== null) clearTimeout(cleanupTimer);
        signal.removeEventListener("abort", abort);
        destroyPipes();
        clearOutputChunks();
        rejectPromise(new CustodyOperationError(reason));
      };
      const requestTermination = (
        reason: Exclude<BscTestnetDeployerCustodyUnavailableReason, "closed">
      ) => {
        if (settled || requestedFailure !== null) return;
        requestedFailure = reason;
        destroyPipes();
        const processId = child.pid;
        if (processId === undefined) {
          finishRejected("subprocess_cleanup_unknown");
          return;
        }
        try {
          const killer = spawn(
            SYSTEM_TASKKILL_EXECUTABLE,
            ["/PID", String(processId), "/T", "/F"],
            {
              env: createMinimalPowerShellEnvironment(),
              shell: false,
              stdio: "ignore",
              windowsHide: true
            }
          );
          killer.once("error", () => {
            try {
              child.kill();
            } catch {
              // Cleanup watchdog below remains authoritative.
            }
          });
        } catch {
          try {
            child.kill();
          } catch {
            // Cleanup watchdog below remains authoritative.
          }
        }
        cleanupTimer ??= setTimeout(
          () => finishRejected("subprocess_cleanup_unknown"),
          SUBPROCESS_CLEANUP_TIMEOUT_MS
        );
      };
      const abort = () => requestTermination("operation_failed");
      const operationTimer = setTimeout(
        () => requestTermination("operation_failed"),
        operationTimeoutMs
      );

      signal.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk: Buffer) => {
        if (settled) {
          chunk.fill(0);
          return;
        }
        outputBytes += chunk.byteLength;
        if (outputBytes > maximumOutputBytes) {
          chunk.fill(0);
          requestTermination("operation_failed");
          return;
        }
        outputChunks.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        errorBytes += chunk.byteLength;
        chunk.fill(0);
        if (errorBytes > 4_096) requestTermination("operation_failed");
      });
      child.once("error", () => requestTermination("operation_failed"));
      child.once("close", (code, closeSignal) => {
        if (settled) return;
        if (requestedFailure !== null || code !== 0 || closeSignal !== null || errorBytes !== 0) {
          finishRejected(requestedFailure ?? "operation_failed");
          return;
        }
        settled = true;
        clearTimeout(operationTimer);
        if (cleanupTimer !== null) clearTimeout(cleanupTimer);
        signal.removeEventListener("abort", abort);
        const output = Buffer.concat(outputChunks, outputBytes);
        clearOutputChunks();
        resolvePromise(Object.freeze({ output, status: "ok" as const }));
      });
      child.stdin.once("error", () => requestTermination("operation_failed"));
      try {
        child.stdin.end(input);
      } catch {
        requestTermination("operation_failed");
      }
    });
  } finally {
    await assertPinnedPowerShellExecutableForInternalUse();
  }
  return result;
}

function snapshot(metadata: BigIntStats): FileSnapshot {
  return Object.freeze({
    birthtimeMs: Number(metadata.birthtimeMs),
    ctimeMs: Number(metadata.ctimeMs),
    device: metadata.dev,
    inode: metadata.ino,
    links: metadata.nlink,
    mode: metadata.mode,
    modifiedMs: Number(metadata.mtimeMs),
    size: Number(metadata.size)
  });
}

function sameSnapshot(left: FileSnapshot, right: FileSnapshot): boolean {
  return (
    left.birthtimeMs === right.birthtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.links === right.links &&
    left.mode === right.mode &&
    left.modifiedMs === right.modifiedMs &&
    left.size === right.size
  );
}

async function readBoundedStableRegularFile(
  path: string,
  maximumBytes: number,
  requireSingleLink = true
): Promise<Buffer> {
  let handle;
  try {
    handle = await open(path, fileConstants.O_RDONLY);
    const beforeMetadata = await handle.stat({ bigint: true });
    if (
      !beforeMetadata.isFile() ||
      (requireSingleLink && beforeMetadata.nlink !== 1n) ||
      beforeMetadata.size < 1n ||
      beforeMetadata.size > BigInt(maximumBytes)
    ) {
      throw new CustodyOperationError("file_security_invalid");
    }
    const before = snapshot(beforeMetadata);
    const content = await handle.readFile();
    const afterMetadata = await handle.stat({ bigint: true });
    const after = snapshot(afterMetadata);
    if (content.byteLength !== before.size || !sameSnapshot(before, after)) {
      content.fill(0);
      throw new CustodyOperationError("file_security_invalid");
    }
    return content;
  } catch (error) {
    if (error instanceof CustodyOperationError) throw error;
    throw new CustodyOperationError("file_unavailable");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function assertPinnedPowerShellExecutableForInternalUse(): Promise<void> {
  let executableBytes: Buffer | null = null;
  try {
    const [beforeMetadata, canonicalBefore] = await Promise.all([
      lstat(PINNED_POWERSHELL_EXECUTABLE, { bigint: true }),
      realpath(PINNED_POWERSHELL_EXECUTABLE)
    ]);
    if (
      !beforeMetadata.isFile() ||
      beforeMetadata.isSymbolicLink() ||
      beforeMetadata.size !== BigInt(PINNED_POWERSHELL_BYTES) ||
      !samePath(canonicalBefore, PINNED_POWERSHELL_EXECUTABLE)
    ) {
      throw new CustodyOperationError("powershell_integrity_mismatch");
    }
    const before = snapshot(beforeMetadata);
    executableBytes = await readBoundedStableRegularFile(
      PINNED_POWERSHELL_EXECUTABLE,
      1_048_576,
      false
    );
    const [afterMetadata, canonicalAfter] = await Promise.all([
      lstat(PINNED_POWERSHELL_EXECUTABLE, { bigint: true }),
      realpath(PINNED_POWERSHELL_EXECUTABLE)
    ]);
    if (
      !sameSnapshot(before, snapshot(afterMetadata)) ||
      !samePath(canonicalAfter, PINNED_POWERSHELL_EXECUTABLE) ||
      sha256Hex(executableBytes) !== PINNED_POWERSHELL_SHA256
    ) {
      throw new CustodyOperationError("powershell_integrity_mismatch");
    }
  } catch (error) {
    if (error instanceof CustodyOperationError) throw error;
    throw new CustodyOperationError("powershell_integrity_mismatch");
  } finally {
    executableBytes?.fill(0);
  }
}

async function inspectPaths(
  configuration: Parameters<InternalCustodyProbeOperation>[0]
): Promise<Readonly<{ executablePath: string; protectedBlobPath: string; storePath: string }>> {
  const directory = configuration.custodyDirectoryAbsolute;
  const storePath = join(directory, BSC_TESTNET_DEPLOYER_STORE_FILE);
  const protectedBlobPath = join(directory, BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_FILE);
  if (
    win32.basename(directory).toLowerCase() !== "bsc-testnet" ||
    win32.basename(win32.dirname(directory)).toLowerCase() !== "wallets" ||
    isWithin(REPOSITORY_ROOT, directory)
  ) {
    throw new CustodyOperationError("configuration_invalid");
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
      throw new CustodyOperationError("file_security_invalid");
    }
    const [realDirectory, realStore, realBlob, realExecutable] = await Promise.all([
      realpath(directory),
      realpath(storePath),
      realpath(protectedBlobPath),
      realpath(PINNED_POWERSHELL_EXECUTABLE)
    ]);
    if (
      !samePath(realDirectory, directory) ||
      !samePath(realStore, storePath) ||
      !samePath(realBlob, protectedBlobPath) ||
      !samePath(realExecutable, PINNED_POWERSHELL_EXECUTABLE) ||
      !samePath(dirname(realStore), realDirectory) ||
      !samePath(dirname(realBlob), realDirectory)
    ) {
      throw new CustodyOperationError("file_security_invalid");
    }
  } catch (error) {
    if (error instanceof CustodyOperationError) throw error;
    throw new CustodyOperationError("file_unavailable");
  }
  return Object.freeze({
    executablePath: PINNED_POWERSHELL_EXECUTABLE,
    protectedBlobPath,
    storePath
  });
}

async function assertExactLocalAcl(
  configuration: Parameters<InternalCustodyProbeOperation>[0],
  paths: Readonly<{ executablePath: string; protectedBlobPath: string; storePath: string }>,
  signal: AbortSignal
): Promise<void> {
  const specification = Buffer.from(
    JSON.stringify({
      blob: paths.protectedBlobPath,
      directory: configuration.custodyDirectoryAbsolute,
      store: paths.storePath
    }),
    "utf8"
  );
  let output: Buffer | null = null;
  try {
    const result = await runPinnedPowerShellForInternalUse(
      ACL_PROBE_SCRIPT,
      specification,
      64,
      signal
    );
    output = result.output;
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 1 ||
      !("ok" in parsed) ||
      parsed.ok !== true
    ) {
      throw new CustodyOperationError("file_security_invalid");
    }
  } catch (error) {
    if (error instanceof CustodyOperationError && error.reason === "subprocess_cleanup_unknown") {
      throw error;
    }
    if (error instanceof CustodyOperationError) {
      throw new CustodyOperationError("file_security_invalid");
    }
    throw new CustodyOperationError("file_security_invalid");
  } finally {
    specification.fill(0);
    output?.fill(0);
  }
}

async function unprotectCurrentUser(protectedBytes: Buffer, signal: AbortSignal): Promise<Buffer> {
  try {
    const result = await runPinnedPowerShellForInternalUse(
      DPAPI_UNPROTECT_SCRIPT,
      protectedBytes,
      48,
      signal
    );
    if (result.output.byteLength !== 48) {
      result.output.fill(0);
      throw new CustodyOperationError("dpapi_unprotect_failed");
    }
    return result.output;
  } catch (error) {
    if (error instanceof CustodyOperationError && error.reason === "subprocess_cleanup_unknown") {
      throw error;
    }
    throw new CustodyOperationError("dpapi_unprotect_failed");
  }
}

async function readAndVerifyPinnedArtifacts(
  paths: Readonly<{ executablePath: string; protectedBlobPath: string; storePath: string }>
): Promise<Readonly<{ protectedBytes: Buffer; storeBytes: Buffer }>> {
  let executableBytes: Buffer | null = null;
  let protectedBytes: Buffer | null = null;
  let storeBytes: Buffer | null = null;
  try {
    storeBytes = await readBoundedStableRegularFile(paths.storePath, MAXIMUM_STORE_BYTES);
    protectedBytes = await readBoundedStableRegularFile(
      paths.protectedBlobPath,
      MAXIMUM_PROTECTED_BLOB_BYTES
    );
    executableBytes = await readBoundedStableRegularFile(paths.executablePath, 1_048_576, false);
    if (sha256Hex(storeBytes) !== BSC_TESTNET_DEPLOYER_STORE_SHA256) {
      throw new CustodyOperationError("encrypted_store_integrity_mismatch");
    }
    if (sha256Hex(protectedBytes) !== BSC_TESTNET_DEPLOYER_PROTECTED_BLOB_SHA256) {
      throw new CustodyOperationError("protected_blob_integrity_mismatch");
    }
    if (sha256Hex(executableBytes) !== PINNED_POWERSHELL_SHA256) {
      throw new CustodyOperationError("powershell_integrity_mismatch");
    }
    return Object.freeze({ protectedBytes, storeBytes });
  } catch (error) {
    storeBytes?.fill(0);
    protectedBytes?.fill(0);
    throw error;
  } finally {
    executableBytes?.fill(0);
  }
}

async function assertFinalCustodyState(
  configuration: Parameters<InternalCustodyProbeOperation>[0],
  signal: AbortSignal
): Promise<void> {
  let protectedBytes: Buffer | null = null;
  let storeBytes: Buffer | null = null;
  try {
    const paths = await inspectPaths(configuration);
    ({ protectedBytes, storeBytes } = await readAndVerifyPinnedArtifacts(paths));
    const finalPaths = await inspectPaths(configuration);
    await assertExactLocalAcl(configuration, finalPaths, signal);
  } finally {
    protectedBytes?.fill(0);
    storeBytes?.fill(0);
  }
}

/**
 * Performs only fixed-path, file-kind, realpath, and current-user ACL checks that are safe before a
 * durable signing claim exists. This probe never opens custody artifacts, invokes DPAPI, or
 * decrypts/reconstructs custody secret material.
 */
export const probeWindowsBscTestnetDeployerCustodyMetadataForInternalUse: InternalCustodyProbeOperation =
  async (configuration, signal): Promise<InternalCustodyProbeResult> => {
    if (process.platform !== "win32") {
      return Object.freeze({
        reason: "unsupported_platform" as const,
        status: "unavailable" as const
      });
    }
    try {
      const paths = await inspectPaths(configuration);
      await assertExactLocalAcl(configuration, paths, signal);
      const finalPaths = await inspectPaths(configuration);
      if (
        !samePath(finalPaths.executablePath, paths.executablePath) ||
        !samePath(finalPaths.protectedBlobPath, paths.protectedBlobPath) ||
        !samePath(finalPaths.storePath, paths.storePath)
      ) {
        throw new CustodyOperationError("file_security_invalid");
      }
      await assertExactLocalAcl(configuration, finalPaths, signal);
      return Object.freeze({ status: "ready" as const });
    } catch (error) {
      return error instanceof CustodyOperationError
        ? Object.freeze({ reason: error.reason, status: "unavailable" as const })
        : Object.freeze({ reason: "operation_failed" as const, status: "unavailable" as const });
    }
  };

export const probeWindowsBscTestnetDeployerCustody: InternalCustodyProbeOperation = async (
  configuration,
  signal
): Promise<InternalCustodyProbeResult> => {
  if (process.platform !== "win32") {
    return Object.freeze({
      reason: "unsupported_platform" as const,
      status: "unavailable" as const
    });
  }
  let storeBytes: Buffer | null = null;
  let protectedBytes: Buffer | null = null;
  let clearBytes: Buffer | null = null;
  try {
    const paths = await inspectPaths(configuration);
    const pinned = await readAndVerifyPinnedArtifacts(paths);
    storeBytes = pinned.storeBytes;
    protectedBytes = pinned.protectedBytes;
    await assertExactLocalAcl(configuration, paths, signal);
    clearBytes = await unprotectCurrentUser(protectedBytes, signal);
    const unlocked = await unlockBscTestnetDeployerEncryptedStore(storeBytes, clearBytes);
    clearBytes = null;
    if (unlocked.status === "unavailable") {
      return Object.freeze({ reason: unlocked.reason, status: "unavailable" as const });
    }
    await assertFinalCustodyState(configuration, signal);
    return Object.freeze({ status: "ready" as const });
  } catch (error) {
    return error instanceof CustodyOperationError
      ? Object.freeze({ reason: error.reason, status: "unavailable" as const })
      : Object.freeze({ reason: "operation_failed" as const, status: "unavailable" as const });
  } finally {
    storeBytes?.fill(0);
    protectedBytes?.fill(0);
    clearBytes?.fill(0);
  }
};
