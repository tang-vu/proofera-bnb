import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, resolve, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  decodeFunctionResult,
  getAddress,
  getContractAddress,
  keccak256,
  parseAbi,
  parseTransaction,
  recoverTransactionAddress,
  sha256,
  type Hex,
  type TransactionSerialized
} from "viem";

import { buildDeploymentPreparation } from "../contracts/testnet-fixed-asset/scripts/deployment-preparation.mjs";
import {
  BSC_TESTNET_PTA_CHAIN_ID,
  BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256,
  BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
  BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE,
  BSC_TESTNET_PTA_RECIPIENT_ADDRESS,
  BSC_TESTNET_PTA_RUNTIME_BYTES,
  BSC_TESTNET_PTA_RUNTIME_KECCAK256,
  BSC_TESTNET_PTA_RUNTIME_SHA256
} from "../packages/integrations/src/bsc-testnet-pta-deployment-envelope";
import { prepareBscTestnetPtaDeploymentEnvelope } from "../packages/integrations/src/bsc-testnet-pta-rpc-coordinator.server";
import { buildBscTestnetPtaUnsignedTransaction } from "../packages/integrations/src/bsc-testnet-pta-unsigned-transaction";
import {
  BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCHEMA_VERSION,
  BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE,
  BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
  BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION,
  buildBscTestnetPtaSigningWorkerRequest,
  validateBscTestnetPtaFreshSigningCapability,
  validateBscTestnetPtaSigningWorkerResponse,
  type BscTestnetPtaFreshSigningCapability,
  type BscTestnetPtaSigningWorkerRequest
} from "../packages/integrations/src/bsc-testnet-pta-one-shot-worker-protocol";
import {
  BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION,
  BSC_TESTNET_PTA_DURABLE_COMMIT_OPERATION,
  createBscTestnetPtaOneShotSignerCore
} from "../packages/integrations/src/bsc-testnet-pta-one-shot-signer-core";
import {
  createWindowsBscTestnetPtaLocalJournal,
  type BscTestnetPtaLocalJournal
} from "../packages/integrations/src/bsc-testnet-pta-local-journal.server";
import { createWindowsBscTestnetPtaSigningWorker } from "../packages/integrations/src/bsc-testnet-pta-signing-worker";
import {
  probeWindowsBscTestnetDeployerCustody,
  runPinnedPowerShellForInternalUse
} from "../packages/integrations/src/bsc-testnet-deployer-custody-windows.server";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = fileURLToPath(import.meta.url);
const LOADER = resolve(ROOT, "scripts", "typescript-extension-loader.mjs");
const PRIMARY_RPC = "https://bsc-testnet-dataseed.bnbchain.org";
const CORROBORATOR_RPC = "https://bsc-testnet.bnbchain.org";
const MAXIMUM_STDIN_BYTES = 20_000;
const MAXIMUM_STDOUT_BYTES = 12_000;
const MAXIMUM_RPC_BYTES = 1_048_576;
const WORKER_TIMEOUT_MS = 120_000;
const WORKER_CLEANUP_TIMEOUT_MS = 10_000;
const RPC_TIMEOUT_MS = 8_000;
const RECEIPT_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;
const TASKKILL = "C:\\Windows\\System32\\taskkill.exe";
const PINNED_GIT = "D:\\Git\\cmd\\git.exe";
const PINNED_GIT_SHA256 = "37c5725818d602e951ba2563b870d62763322956b73373da4c33a0b566a80bc9";
const RECONSTRUCTION_PARENT_COMMIT = "2c4df05aec5eac9f41150382b58266fdcb93523f";
const EXACT_EXECUTION_FLAG = "--execute-exact-pta-chain-97";
const FIXED_SUPPLY_BASE_UNITS = 1_000_000n * 10n ** 18n;
const LOCAL_APPLICATION_DATA_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$path = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if ([String]::IsNullOrWhiteSpace($path)) { exit 47 }
[Console]::Out.Write($path)
`;
const PREPARE_JOURNAL_DIRECTORY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
$path = $reader.ReadToEnd()
$reader.Dispose()
$current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$local = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$expected = [IO.Path]::GetFullPath([IO.Path]::Combine($local, 'ProofEra', 'deployments', 'bsc-testnet-pta'))
if ([IO.Path]::GetFullPath($path) -ne $expected) { exit 48 }
$localItem = Get-Item -LiteralPath $local -Force
if (-not $localItem.PSIsContainer -or (($localItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $localItem.FullName -ne [IO.Path]::GetFullPath($local)) { exit 49 }
$cursor = $localItem.FullName
foreach ($segment in @('ProofEra', 'deployments', 'bsc-testnet-pta')) {
  $cursor = [IO.Path]::GetFullPath([IO.Path]::Combine($cursor, $segment))
  if (-not [IO.Directory]::Exists($cursor)) { [IO.Directory]::CreateDirectory($cursor) | Out-Null }
  $item = Get-Item -LiteralPath $cursor -Force
  if (-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $item.FullName -ne $cursor) { exit 49 }
}
$item = Get-Item -LiteralPath $path -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.FullName -ne $expected) { exit 50 }
$existingAcl = Get-Acl -LiteralPath $path
$existingOwner = try {
  ([System.Security.Principal.SecurityIdentifier]::new($existingAcl.Owner)).Value
} catch {
  ([System.Security.Principal.NTAccount]::new($existingAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
}
if ($existingOwner -ne $current.Value) { exit 50 }
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
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
$final = Get-Item -LiteralPath $path -Force
$finalAcl = Get-Acl -LiteralPath $path
if (($final.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $final.FullName -ne $expected -or -not $finalAcl.AreAccessRulesProtected) { exit 51 }
$cursor = $localItem.FullName
foreach ($segment in @('ProofEra', 'deployments', 'bsc-testnet-pta')) {
  $cursor = [IO.Path]::GetFullPath([IO.Path]::Combine($cursor, $segment))
  $verified = Get-Item -LiteralPath $cursor -Force
  if (-not $verified.PSIsContainer -or (($verified.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $verified.FullName -ne $cursor) { exit 52 }
}
[Console]::Out.Write('{"ok":true}')
`;

const TOKEN_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)"
]);

type JsonRpcEnvelope = Readonly<{
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: unknown;
}>;

type ExecutionArguments = Readonly<{
  custodyDirectoryAbsolute: string;
  journalDirectoryAbsolute: string;
}>;

class DeploymentFailure extends Error {
  override readonly name = "DeploymentFailure";
  readonly code: string;

  constructor(code: string) {
    super("The exact chain-97 PTA deployment failed closed.");
    this.code = code;
  }
}

function fail(code: string): never {
  throw new DeploymentFailure(code);
}

async function runPinnedGit(arguments_: readonly string[]): Promise<string> {
  const metadata = await lstat(PINNED_GIT);
  const canonical = await realpath(PINNED_GIT);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size !== 46_464 ||
    win32.normalize(canonical).toLowerCase() !== PINNED_GIT.toLowerCase()
  ) {
    fail("RECONSTRUCTION_GIT_STATE_INVALID");
  }
  const executable = await readFile(PINNED_GIT);
  const executableSha256 = createHash("sha256").update(executable).digest("hex");
  executable.fill(0);
  if (executableSha256 !== PINNED_GIT_SHA256) fail("RECONSTRUCTION_GIT_STATE_INVALID");
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(PINNED_GIT, ["-C", ROOT, ...arguments_], {
      cwd: ROOT,
      env: {
        GIT_CONFIG_GLOBAL: "NUL",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_OPTIONAL_LOCKS: "0",
        LC_ALL: "C",
        SystemRoot: "C:\\Windows",
        WINDIR: "C:\\Windows"
      },
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    const chunks: Buffer[] = [];
    let total = 0;
    child.stdout.on("data", (untrusted: Buffer) => {
      total += untrusted.byteLength;
      if (total > 4_096) {
        child.kill();
        return;
      }
      chunks.push(Buffer.from(untrusted));
    });
    child.once("error", () =>
      rejectPromise(new DeploymentFailure("RECONSTRUCTION_GIT_STATE_INVALID"))
    );
    child.once("close", (code) => {
      if (code !== 0 || total > 4_096) {
        rejectPromise(new DeploymentFailure("RECONSTRUCTION_GIT_STATE_INVALID"));
        return;
      }
      resolvePromise(Buffer.concat(chunks, total).toString("utf8").trim());
    });
  });
}

async function assertReviewedDeterministicReconstructionGitState(): Promise<void> {
  const [root, lineage, localHead, publishedHead, status] = await Promise.all([
    runPinnedGit(["rev-parse", "--show-toplevel"]),
    runPinnedGit(["rev-list", "--parents", "-n", "1", "HEAD"]),
    runPinnedGit(["rev-parse", "--verify", "HEAD"]),
    runPinnedGit(["rev-parse", "--verify", "refs/remotes/origin/main"]),
    runPinnedGit(["status", "--porcelain=v1", "--untracked-files=normal"])
  ]);
  const lineageParts = lineage.split(" ");
  if (
    win32.normalize(root).toLowerCase() !== ROOT.toLowerCase() ||
    lineageParts.length !== 2 ||
    lineageParts[0] !== localHead ||
    lineageParts[1] !== RECONSTRUCTION_PARENT_COMMIT ||
    publishedHead !== localHead ||
    status !== ""
  ) {
    fail("RECONSTRUCTION_GIT_STATE_INVALID");
  }
}

function assertExecutionArguments(values: readonly string[]): void {
  if (values.length !== 1 || values[0] !== EXACT_EXECUTION_FLAG) {
    fail("ARGUMENTS_INVALID");
  }
}

async function resolveExecutionDirectories(): Promise<ExecutionArguments> {
  const controller = new AbortController();
  const input = Buffer.alloc(0);
  let output: Buffer | null = null;
  try {
    const result = await runPinnedPowerShellForInternalUse(
      LOCAL_APPLICATION_DATA_SCRIPT,
      input,
      512,
      controller.signal
    );
    output = result.output;
    const localApplicationData = new TextDecoder("utf-8", { fatal: true }).decode(output);
    const custodyDirectoryAbsolute = win32.join(
      localApplicationData,
      "ProofEra",
      "wallets",
      "bsc-testnet"
    );
    const journalDirectoryAbsolute = win32.join(
      localApplicationData,
      "ProofEra",
      "deployments",
      "bsc-testnet-pta"
    );
    if (
      !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(custodyDirectoryAbsolute) ||
      !/^[A-Za-z]:\\[^\0\r\n]*$/u.test(journalDirectoryAbsolute) ||
      win32.normalize(custodyDirectoryAbsolute) !== custodyDirectoryAbsolute ||
      win32.normalize(journalDirectoryAbsolute) !== journalDirectoryAbsolute
    ) {
      return fail("ARGUMENTS_INVALID");
    }
    return Object.freeze({ custodyDirectoryAbsolute, journalDirectoryAbsolute });
  } catch (error) {
    if (error instanceof DeploymentFailure) throw error;
    return fail("LOCAL_DIRECTORY_RESOLUTION_FAILED");
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function prepareJournalDirectory(directoryAbsolute: string): Promise<void> {
  const input = Buffer.from(directoryAbsolute, "utf8");
  let output: Buffer | null = null;
  try {
    const controller = new AbortController();
    const result = await runPinnedPowerShellForInternalUse(
      PREPARE_JOURNAL_DIRECTORY_SCRIPT,
      input,
      32,
      controller.signal
    );
    output = result.output;
    const parsed = inspectRecord(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)) as unknown
    );
    if (parsed === null || Object.keys(parsed).join(",") !== "ok" || parsed.ok !== true) {
      fail("JOURNAL_DIRECTORY_PREPARATION_FAILED");
    }
  } catch (error) {
    if (error instanceof DeploymentFailure) throw error;
    fail("JOURNAL_DIRECTORY_PREPARATION_FAILED");
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

function inspectRecord(input: unknown): Readonly<Record<string, unknown>> | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null
    ? (input as Readonly<Record<string, unknown>>)
    : null;
}

async function readStdinBounded(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const untrusted of process.stdin) {
    const chunk = Buffer.isBuffer(untrusted) ? untrusted : Buffer.from(untrusted as Uint8Array);
    total += chunk.byteLength;
    if (total > MAXIMUM_STDIN_BYTES) fail("WORKER_INPUT_INVALID");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function runWorker(): Promise<void> {
  const input = await readStdinBounded();
  try {
    let parsed: Readonly<Record<string, unknown>> | null = null;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(input);
      parsed = inspectRecord(JSON.parse(decoded) as unknown);
    } catch {
      fail("WORKER_INPUT_INVALID");
    }
    if (
      parsed === null ||
      Object.keys(parsed).sort().join(",") !== "authorizationToken,request" ||
      typeof parsed.authorizationToken !== "string" ||
      !/^0x[0-9a-f]{64}$/u.test(parsed.authorizationToken)
    ) {
      fail("WORKER_INPUT_INVALID");
    }
    const directories = await resolveExecutionDirectories();
    const journal = createWindowsBscTestnetPtaLocalJournal(directories.journalDirectoryAbsolute);
    await journal.consumeWorkerAuthorization(
      parsed.request as BscTestnetPtaSigningWorkerRequest,
      parsed.authorizationToken as Hex
    );
    const worker = createWindowsBscTestnetPtaSigningWorker({
      custodyDirectoryAbsolute: directories.custodyDirectoryAbsolute
    });
    const response = await worker.invokeExactSigningWorker(
      parsed.request as BscTestnetPtaSigningWorkerRequest
    );
    await journal.commitSignedTransaction(
      Object.freeze({
        schemaVersion: BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION,
        operation: BSC_TESTNET_PTA_DURABLE_COMMIT_OPERATION,
        oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
        claimId: response.claimId,
        requestHash: response.requestHash,
        signingHash: response.signingHash,
        signedTransaction: response.signedTransaction,
        transactionHash: response.transactionHash,
        recoveredSigner: BSC_TESTNET_PTA_DEPLOYER_ADDRESS
      })
    );
    const postCommitCustody = await probeWindowsBscTestnetDeployerCustody(
      { custodyDirectoryAbsolute: directories.custodyDirectoryAbsolute },
      new AbortController().signal
    );
    if (postCommitCustody.status !== "ready") fail("WORKER_POST_COMMIT_CUSTODY_INVALID");
    process.stdout.write(JSON.stringify(response));
  } finally {
    input.fill(0);
  }
}

function terminateProcessTree(processId: number | undefined): void {
  if (processId === undefined) return;
  try {
    const killer = spawn(TASKKILL, ["/PID", String(processId), "/T", "/F"], {
      env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" },
      shell: false,
      stdio: "ignore",
      windowsHide: true
    });
    killer.unref();
  } catch {
    // The caller treats any missing close acknowledgement as unknown.
  }
}

async function invokeWorker(
  journal: BscTestnetPtaLocalJournal,
  request: BscTestnetPtaSigningWorkerRequest
): Promise<unknown> {
  const tokenBytes = randomBytes(32);
  const authorizationToken = `0x${tokenBytes.toString("hex")}` as Hex;
  try {
    await journal.prepareWorkerAuthorization(request, keccak256(authorizationToken));
  } catch {
    tokenBytes.fill(0);
    throw new DeploymentFailure("WORKER_AUTHORIZATION_UNKNOWN");
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [
        "--no-warnings",
        "--conditions=react-server",
        "--experimental-loader",
        pathToFileURL(LOADER).href,
        ENTRY,
        "--worker"
      ],
      {
        cwd: ROOT,
        env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      }
    );
    let settled = false;
    let outputBytes = 0;
    let errorBytes = 0;
    const output: Buffer[] = [];
    const clear = () => {
      for (const chunk of output) chunk.fill(0);
      output.length = 0;
    };
    let requestedFailure = false;
    let cleanupTimer: NodeJS.Timeout | null = null;
    const finishUnknown = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
      try {
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
      } catch {
        // Promise outcome remains unknown and non-retryable.
      }
      clear();
      rejectPromise(new DeploymentFailure("WORKER_OUTCOME_UNKNOWN"));
    };
    const requestTermination = () => {
      if (settled || requestedFailure) return;
      requestedFailure = true;
      terminateProcessTree(child.pid);
      cleanupTimer = setTimeout(finishUnknown, WORKER_CLEANUP_TIMEOUT_MS);
    };
    const timer = setTimeout(requestTermination, WORKER_TIMEOUT_MS);
    child.stdout.on("data", (untrusted: Buffer) => {
      const chunk = Buffer.from(untrusted);
      outputBytes += chunk.byteLength;
      if (outputBytes > MAXIMUM_STDOUT_BYTES) requestTermination();
      else output.push(chunk);
    });
    child.stderr.on("data", (untrusted: Buffer) => {
      errorBytes += Buffer.byteLength(untrusted);
      if (errorBytes > 0) requestTermination();
    });
    child.stdin.once("error", requestTermination);
    child.once("error", finishUnknown);
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
      if (
        requestedFailure ||
        code !== 0 ||
        signal !== null ||
        errorBytes !== 0 ||
        outputBytes === 0
      ) {
        clear();
        rejectPromise(new DeploymentFailure("WORKER_OUTCOME_UNKNOWN"));
        return;
      }
      const combined = Buffer.concat(output, outputBytes);
      try {
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(combined);
        resolvePromise(JSON.parse(decoded) as unknown);
      } catch {
        rejectPromise(new DeploymentFailure("WORKER_OUTPUT_INVALID"));
      } finally {
        combined.fill(0);
        clear();
      }
    });
    const input = Buffer.from(
      JSON.stringify({
        authorizationToken,
        request
      }),
      "utf8"
    );
    try {
      child.stdin.end(input);
    } finally {
      input.fill(0);
      tokenBytes.fill(0);
    }
  });
}

async function readRpcBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!response.ok || !contentType.includes("application/json") || response.body === null) {
    return fail("RPC_TRANSPORT_FAILED");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM_RPC_BYTES) return fail("RPC_TRANSPORT_FAILED");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
  } catch {
    return fail("RPC_RESPONSE_INVALID");
  } finally {
    body.fill(0);
  }
}

let rpcId = 0;
async function rpc(origin: string, method: string, params: readonly unknown[]): Promise<unknown> {
  const id = ++rpcId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const response = await fetch(origin, {
      method: "POST",
      redirect: "error",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal
    });
    if (response.url !== origin && response.url !== `${origin}/`) fail("RPC_REDIRECTED");
    const parsed = inspectRecord(await readRpcBody(response)) as JsonRpcEnvelope | null;
    if (parsed !== null && parsed.error !== undefined) {
      return fail("RPC_REMOTE_ERROR");
    }
    if (parsed === null || parsed.jsonrpc !== "2.0" || parsed.id !== id || !("result" in parsed)) {
      return fail("RPC_RESPONSE_INVALID");
    }
    return parsed.result;
  } catch (error) {
    if (error instanceof DeploymentFailure) throw error;
    return fail("RPC_TRANSPORT_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

function exactHex(input: unknown, bytes?: number): Hex {
  const pattern =
    bytes === undefined ? /^0x(?:[0-9a-f]{2})*$/u : new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, "u");
  return typeof input === "string" && pattern.test(input)
    ? (input as Hex)
    : fail("RPC_RESPONSE_INVALID");
}

function exactHexQuantity(input: unknown): Hex {
  return typeof input === "string" && /^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(input)
    ? (input as Hex)
    : fail("RPC_RESPONSE_INVALID");
}

function hexQuantity(input: unknown): bigint {
  return BigInt(exactHexQuantity(input));
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function loadDeploymentData(): Promise<Hex> {
  const preparation = (await buildDeploymentPreparation({
    chainId: BSC_TESTNET_PTA_CHAIN_ID,
    recipient: BSC_TESTNET_PTA_RECIPIENT_ADDRESS
  })) as Readonly<Record<string, unknown>>;
  const network = inspectRecord(preparation.network);
  const contract = inspectRecord(preparation.contract);
  const digests = inspectRecord(preparation.digests);
  const data = preparation.unsignedDeploymentData;
  if (
    preparation.schemaVersion !== 1 ||
    preparation.status !== "offline_unsigned_preparation_only" ||
    network === null ||
    network.name !== "BSC Testnet" ||
    network.chainId !== BSC_TESTNET_PTA_CHAIN_ID ||
    contract === null ||
    contract.deploymentRecipient !== BSC_TESTNET_PTA_RECIPIENT_ADDRESS.toLowerCase() ||
    contract.fixedSupplyBaseUnits !== FIXED_SUPPLY_BASE_UNITS.toString() ||
    contract.constructorEnforcedChainId !== BSC_TESTNET_PTA_CHAIN_ID ||
    digests === null ||
    digests.unsignedDeploymentDataSha256 !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 ||
    typeof data !== "string" ||
    data.length !== 2 + BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES * 2 ||
    !/^0x[0-9a-f]+$/u.test(data)
  ) {
    return fail("DEPLOYMENT_ARTIFACT_INVALID");
  }
  const deploymentData = data as Hex;
  if (
    sha256(deploymentData).slice(2) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 ||
    keccak256(deploymentData) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256
  ) {
    return fail("DEPLOYMENT_ARTIFACT_INVALID");
  }
  return deploymentData;
}

async function freshSigningPayload(deploymentData: Hex) {
  const observed = await prepareBscTestnetPtaDeploymentEnvelope(deploymentData);
  if (observed.status !== "observed") return fail("FRESH_OBSERVATION_BLOCKED");
  const unsigned = buildBscTestnetPtaUnsignedTransaction(observed.envelope, {
    asOf: () => new Date()
  });
  if (unsigned.status !== "signing_payload_serialized") {
    return fail("UNSIGNED_TRANSACTION_BLOCKED");
  }
  const capability = Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCHEMA_VERSION,
    scope: BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE,
    authenticatedAt: new Date().toISOString(),
    freshSignerSideRpcRecheckPerformed: true as const,
    signingPayload: unsigned.signingPayload
  }) satisfies BscTestnetPtaFreshSigningCapability;
  const validation = validateBscTestnetPtaFreshSigningCapability(capability, new Date());
  if (validation.status !== "valid") return fail("FRESH_CAPABILITY_INVALID");
  return Object.freeze({ capability, observed, validation });
}

async function validateSignedTransaction(
  raw: Hex,
  transactionHash: Hex,
  capability: BscTestnetPtaFreshSigningCapability
): Promise<void> {
  const validated = validateBscTestnetPtaFreshSigningCapability(
    capability,
    new Date(capability.authenticatedAt)
  );
  if (validated.status !== "valid") fail("SIGNED_TRANSACTION_INVALID");
  const claimId = `pta-${validated.intent.signingHash.slice(2, 34)}`;
  const request = buildBscTestnetPtaSigningWorkerRequest(validated.intent, claimId);
  if ("code" in request) fail("WORKER_REQUEST_INVALID");
  const response = {
    schemaVersion: BSC_TESTNET_PTA_SIGNING_WORKER_PROTOCOL_VERSION,
    operation: BSC_TESTNET_PTA_SIGNING_WORKER_OPERATION,
    status: "signed" as const,
    oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
    claimId,
    requestHash: request.requestHash,
    signingHash: request.transaction.signingHash,
    signedTransaction: raw,
    transactionHash
  };
  const result = await validateBscTestnetPtaSigningWorkerResponse(response, request);
  if (result.status !== "valid") fail("SIGNED_TRANSACTION_INVALID");
}

async function validateRetainedSignedTransaction(raw: Hex, transactionHash: Hex): Promise<void> {
  if (keccak256(raw) !== transactionHash) fail("SIGNED_TRANSACTION_INVALID");
  let parsed: ReturnType<typeof parseTransaction>;
  try {
    parsed = parseTransaction(raw as TransactionSerialized);
  } catch {
    return fail("SIGNED_TRANSACTION_INVALID");
  }
  const sender = getAddress(
    await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized })
  );
  if (
    sender !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS ||
    parsed.type !== "legacy" ||
    parsed.chainId !== BSC_TESTNET_PTA_CHAIN_ID ||
    parsed.nonce !== 0 ||
    parsed.to !== undefined ||
    (parsed.value ?? 0n) !== 0n ||
    parsed.data === undefined ||
    (parsed.data.length - 2) / 2 !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES ||
    sha256(parsed.data).slice(2) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 ||
    keccak256(parsed.data) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256 ||
    parsed.gas === undefined ||
    parsed.gas > 800_000n ||
    parsed.gasPrice === undefined ||
    parsed.gasPrice > 1_000_000_000n ||
    parsed.gas * parsed.gasPrice > 1_000_000_000_000_000n ||
    getContractAddress({ from: sender, nonce: 0n }) !== BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS
  ) {
    fail("SIGNED_TRANSACTION_INVALID");
  }
}

async function readReceiptIfPresent(
  transactionHash: Hex
): Promise<Readonly<Record<string, unknown>> | null> {
  const [primary, corroborator] = await Promise.all([
    rpc(PRIMARY_RPC, "eth_getTransactionReceipt", [transactionHash]),
    rpc(CORROBORATOR_RPC, "eth_getTransactionReceipt", [transactionHash])
  ]);
  if (primary === null && corroborator === null) return null;
  const left = inspectRecord(primary);
  const right = inspectRecord(corroborator);
  if (left === null || right === null || JSON.stringify(left) !== JSON.stringify(right)) {
    return fail("RECEIPT_PROVIDER_DISAGREEMENT");
  }
  return left;
}

async function broadcastOrReconcile(
  raw: Hex,
  expectedHash: Hex
): Promise<Readonly<Record<string, unknown>>> {
  const existing = await readReceiptIfPresent(expectedHash);
  if (existing !== null) return existing;
  try {
    const result = exactHex(await rpc(PRIMARY_RPC, "eth_sendRawTransaction", [raw]), 32);
    if (result !== expectedHash) fail("BROADCAST_HASH_MISMATCH");
  } catch {
    // Submission may have reached the node before the acknowledgement failed.
    // Only deterministic receipt lookup follows; no replacement is signed.
  }
  return waitForReceipt(expectedHash);
}

async function waitForReceipt(transactionHash: Hex): Promise<Readonly<Record<string, unknown>>> {
  const deadline = Date.now() + RECEIPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const receipt = await readReceiptIfPresent(transactionHash);
    if (receipt !== null) return receipt;
    await sleep(POLL_INTERVAL_MS);
  }
  return fail("RECEIPT_TIMEOUT");
}

type FinalizedStateObservation = Readonly<{
  receiptBlockTimestamp: bigint;
  stateBlockNumberHex: Hex;
  stateBlockHash: Hex;
  stateBlockTimestamp: bigint;
}>;

async function waitForFinality(
  blockNumberHex: Hex,
  blockHash: Hex
): Promise<FinalizedStateObservation> {
  const blockNumber = hexQuantity(blockNumberHex);
  const deadline = Date.now() + RECEIPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [leftFinalized, rightFinalized, leftBlock, rightBlock] = await Promise.all([
      rpc(PRIMARY_RPC, "eth_getFinalizedBlock", [-3, false]),
      rpc(CORROBORATOR_RPC, "eth_getFinalizedBlock", [-3, false]),
      rpc(PRIMARY_RPC, "eth_getBlockByNumber", [blockNumberHex, false]),
      rpc(CORROBORATOR_RPC, "eth_getBlockByNumber", [blockNumberHex, false])
    ]);
    const leftFinalizedRecord = inspectRecord(leftFinalized);
    const rightFinalizedRecord = inspectRecord(rightFinalized);
    const leftBlockRecord = inspectRecord(leftBlock);
    const rightBlockRecord = inspectRecord(rightBlock);
    if (
      leftFinalizedRecord === null ||
      rightFinalizedRecord === null ||
      leftBlockRecord === null ||
      rightBlockRecord === null ||
      hexQuantity(leftBlockRecord.number) !== blockNumber ||
      hexQuantity(rightBlockRecord.number) !== blockNumber ||
      exactHex(leftBlockRecord.hash, 32) !== blockHash ||
      exactHex(rightBlockRecord.hash, 32) !== blockHash
    ) {
      fail("FINALITY_PROVIDER_DISAGREEMENT");
    }
    const receiptBlockTimestamp = hexQuantity(leftBlockRecord.timestamp);
    if (hexQuantity(rightBlockRecord.timestamp) !== receiptBlockTimestamp) {
      fail("FINALITY_PROVIDER_DISAGREEMENT");
    }
    const leftFinalizedNumber = hexQuantity(leftFinalizedRecord.number);
    const rightFinalizedNumber = hexQuantity(rightFinalizedRecord.number);
    if (leftFinalizedNumber >= blockNumber && rightFinalizedNumber >= blockNumber) {
      // Public BSC endpoints may prune historical state even though they retain the
      // finalized receipt and block. Bind state reads to the newest exact block
      // finalized by both providers instead of silently falling back to `latest`.
      const stateBlockNumber =
        leftFinalizedNumber < rightFinalizedNumber ? leftFinalizedNumber : rightFinalizedNumber;
      const stateBlockNumberHex = `0x${stateBlockNumber.toString(16)}` as Hex;
      const [leftStateBlock, rightStateBlock] = await Promise.all([
        rpc(PRIMARY_RPC, "eth_getBlockByNumber", [stateBlockNumberHex, false]),
        rpc(CORROBORATOR_RPC, "eth_getBlockByNumber", [stateBlockNumberHex, false])
      ]);
      const leftStateRecord = inspectRecord(leftStateBlock);
      const rightStateRecord = inspectRecord(rightStateBlock);
      if (
        leftStateRecord === null ||
        rightStateRecord === null ||
        hexQuantity(leftStateRecord.number) !== stateBlockNumber ||
        hexQuantity(rightStateRecord.number) !== stateBlockNumber
      ) {
        fail("FINALITY_PROVIDER_DISAGREEMENT");
      }
      const stateBlockHash = exactHex(leftStateRecord.hash, 32);
      const stateBlockTimestamp = hexQuantity(leftStateRecord.timestamp);
      if (
        exactHex(rightStateRecord.hash, 32) !== stateBlockHash ||
        hexQuantity(rightStateRecord.timestamp) !== stateBlockTimestamp ||
        (leftFinalizedNumber === stateBlockNumber &&
          exactHex(leftFinalizedRecord.hash, 32) !== stateBlockHash) ||
        (rightFinalizedNumber === stateBlockNumber &&
          exactHex(rightFinalizedRecord.hash, 32) !== stateBlockHash)
      ) {
        fail("FINALITY_PROVIDER_DISAGREEMENT");
      }
      return Object.freeze({
        receiptBlockTimestamp,
        stateBlockNumberHex,
        stateBlockHash,
        stateBlockTimestamp
      });
    }
    await sleep(POLL_INTERVAL_MS);
  }
  fail("FINALITY_TIMEOUT");
}

type CanonicalBlockSelector = Readonly<{
  blockHash: Hex;
  requireCanonical: true;
}>;

async function tokenCall(data: Hex, blockSelector: CanonicalBlockSelector): Promise<Hex> {
  const [left, right] = await Promise.all([
    rpc(PRIMARY_RPC, "eth_call", [
      { to: BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS, data },
      blockSelector
    ]),
    rpc(CORROBORATOR_RPC, "eth_call", [
      { to: BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS, data },
      blockSelector
    ])
  ]);
  const leftHex = exactHex(left);
  const rightHex = exactHex(right);
  return leftHex === rightHex ? leftHex : fail("TOKEN_STATE_PROVIDER_DISAGREEMENT");
}

async function verifyDeployment(
  transactionHash: Hex,
  receipt: Readonly<Record<string, unknown>>,
  raw: Hex
) {
  // JSON-RPC quantities are not byte strings: canonical values may contain an odd
  // number of nibbles (for example, the deployed receipt block is `0x76e8aaa`).
  const blockNumberHex = exactHexQuantity(receipt.blockNumber);
  const blockHash = exactHex(receipt.blockHash, 32);
  if (
    exactHex(receipt.transactionHash, 32) !== transactionHash ||
    hexQuantity(receipt.status) !== 1n ||
    getAddress(String(receipt.from)) !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS ||
    receipt.to !== null ||
    getAddress(String(receipt.contractAddress)) !== BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS
  ) {
    return fail("RECEIPT_INVALID");
  }
  const parsed = parseTransaction(raw as TransactionSerialized);
  const sender = getAddress(
    await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized })
  );
  if (
    sender !== BSC_TESTNET_PTA_DEPLOYER_ADDRESS ||
    parsed.type !== "legacy" ||
    parsed.chainId !== BSC_TESTNET_PTA_CHAIN_ID ||
    parsed.nonce !== 0 ||
    parsed.to !== undefined ||
    (parsed.value ?? 0n) !== 0n ||
    parsed.data === undefined ||
    sha256(parsed.data).slice(2) !== BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256 ||
    getContractAddress({ from: sender, nonce: 0n }) !== BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS
  ) {
    return fail("BROADCAST_TRANSACTION_INVALID");
  }
  const finality = await waitForFinality(blockNumberHex, blockHash);
  const stateBlockSelector = Object.freeze({
    blockHash: finality.stateBlockHash,
    requireCanonical: true as const
  });
  const [leftCode, rightCode, leftRemainingBalance, rightRemainingBalance] = await Promise.all([
    rpc(PRIMARY_RPC, "eth_getCode", [
      BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
      stateBlockSelector
    ]),
    rpc(CORROBORATOR_RPC, "eth_getCode", [
      BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
      stateBlockSelector
    ]),
    rpc(PRIMARY_RPC, "eth_getBalance", [BSC_TESTNET_PTA_DEPLOYER_ADDRESS, stateBlockSelector]),
    rpc(CORROBORATOR_RPC, "eth_getBalance", [BSC_TESTNET_PTA_DEPLOYER_ADDRESS, stateBlockSelector])
  ]);
  const runtime = exactHex(leftCode);
  const remainingBalance = hexQuantity(leftRemainingBalance);
  if (
    runtime !== exactHex(rightCode) ||
    hexQuantity(rightRemainingBalance) !== remainingBalance ||
    (runtime.length - 2) / 2 !== BSC_TESTNET_PTA_RUNTIME_BYTES ||
    sha256(runtime).slice(2) !== BSC_TESTNET_PTA_RUNTIME_SHA256 ||
    keccak256(runtime) !== BSC_TESTNET_PTA_RUNTIME_KECCAK256
  ) {
    return fail("DEPLOYED_RUNTIME_INVALID");
  }
  const logs = Array.isArray(receipt.logs) ? receipt.logs : fail("RECEIPT_INVALID");
  const transferTopic = keccak256(new TextEncoder().encode("Transfer(address,address,uint256)"));
  const zeroAddressTopic = `0x${"00".repeat(32)}`;
  const recipientTopic = `0x${BSC_TESTNET_PTA_RECIPIENT_ADDRESS.slice(2)
    .toLowerCase()
    .padStart(64, "0")}`;
  const supplyData = `0x${FIXED_SUPPLY_BASE_UNITS.toString(16).padStart(64, "0")}`;
  const mintLogs = logs.filter((entry) => {
    const log = inspectRecord(entry);
    return (
      log !== null &&
      getAddress(String(log.address)) === BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS &&
      Array.isArray(log.topics) &&
      log.topics.length === 3 &&
      log.topics[0] === transferTopic &&
      log.topics[1] === zeroAddressTopic &&
      log.topics[2] === recipientTopic &&
      log.data === supplyData
    );
  });
  if (logs.length !== 1 || mintLogs.length !== 1) fail("MINT_EVENT_INVALID");
  const addressArgument = BSC_TESTNET_PTA_RECIPIENT_ADDRESS.slice(2)
    .toLowerCase()
    .padStart(64, "0");
  const [nameResult, symbolResult, decimalsResult, supplyResult, balanceResult] = await Promise.all(
    [
      tokenCall("0x06fdde03", stateBlockSelector),
      tokenCall("0x95d89b41", stateBlockSelector),
      tokenCall("0x313ce567", stateBlockSelector),
      tokenCall("0x18160ddd", stateBlockSelector),
      tokenCall(`0x70a08231${addressArgument}`, stateBlockSelector)
    ]
  );
  const name = decodeFunctionResult({ abi: TOKEN_ABI, functionName: "name", data: nameResult });
  const symbol = decodeFunctionResult({
    abi: TOKEN_ABI,
    functionName: "symbol",
    data: symbolResult
  });
  const decimals = decodeFunctionResult({
    abi: TOKEN_ABI,
    functionName: "decimals",
    data: decimalsResult
  });
  const totalSupply = decodeFunctionResult({
    abi: TOKEN_ABI,
    functionName: "totalSupply",
    data: supplyResult
  });
  const recipientBalance = decodeFunctionResult({
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    data: balanceResult
  });
  if (
    name !== "ProofEra Test Asset" ||
    symbol !== "PTA" ||
    decimals !== 18 ||
    totalSupply !== FIXED_SUPPLY_BASE_UNITS ||
    recipientBalance !== FIXED_SUPPLY_BASE_UNITS
  ) {
    return fail("DEPLOYED_TOKEN_STATE_INVALID");
  }
  return Object.freeze({
    schemaVersion: 1,
    recordType: "bsc_testnet_pta_deployment_receipt",
    status: "deployed_finalized",
    chainId: BSC_TESTNET_PTA_CHAIN_ID,
    transactionHash,
    contractAddress: BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
    deployer: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
    blockNumber: hexQuantity(blockNumberHex).toString(),
    blockHash,
    blockTimestampUnixSeconds: finality.receiptBlockTimestamp.toString(),
    gasUsed: hexQuantity(receipt.gasUsed).toString(),
    effectiveGasPriceWei: hexQuantity(receipt.effectiveGasPrice).toString(),
    remainingBalanceWei: remainingBalance.toString(),
    stateObservation: {
      blockSelection: "newest_common_finalized",
      blockNumber: hexQuantity(finality.stateBlockNumberHex).toString(),
      blockHash: finality.stateBlockHash,
      blockTimestampUnixSeconds: finality.stateBlockTimestamp.toString(),
      queryBinding: "eip1898_block_hash_require_canonical",
      providerAgreementVerified: true
    },
    runtime: {
      bytes: BSC_TESTNET_PTA_RUNTIME_BYTES,
      sha256: BSC_TESTNET_PTA_RUNTIME_SHA256,
      keccak256: BSC_TESTNET_PTA_RUNTIME_KECCAK256,
      providerAgreementVerified: true
    },
    token: {
      name,
      symbol,
      decimals,
      totalSupplyBaseUnits: totalSupply.toString(),
      recipient: BSC_TESTNET_PTA_RECIPIENT_ADDRESS,
      recipientBalanceBaseUnits: recipientBalance.toString(),
      mintTransferVerified: true
    },
    boundaries: {
      testnetOnly: true,
      chainId: BSC_TESTNET_PTA_CHAIN_ID,
      oneShotNonce: BSC_TESTNET_PTA_EXPECTED_DEPLOYER_NONCE,
      privateKeyReturned: false,
      walletPasswordReturned: false,
      rawSignedTransactionPrinted: false,
      mainnetWritePerformed: false,
      finalizedByTwoOfficialProviders: true,
      receiptBlockHistoricalStateRequired: false,
      finalizedStateObservationUsed: true
    }
  });
}

async function executeDeployment(arguments_: ExecutionArguments): Promise<void> {
  const deploymentData = await loadDeploymentData();
  await prepareJournalDirectory(arguments_.journalDirectoryAbsolute);
  const journal = createWindowsBscTestnetPtaLocalJournal(arguments_.journalDirectoryAbsolute);
  const initial = await journal.readState();
  let raw: Hex;
  let transactionHash: Hex;
  if (initial.status === "signed_committed") {
    raw = initial.signedTransaction;
    transactionHash = initial.transactionHash;
    await validateRetainedSignedTransaction(raw, transactionHash);
  } else if (
    initial.status === "empty" ||
    initial.status === "exact_recovery_available" ||
    initial.status === "deterministic_reconstruction_available"
  ) {
    if (initial.status === "deterministic_reconstruction_available") {
      await assertReviewedDeterministicReconstructionGitState();
    }
    const fresh = await freshSigningPayload(deploymentData);
    const authority = new WeakSet<object>();
    authority.add(fresh.capability);
    const signer = createBscTestnetPtaOneShotSignerCore({
      asOf: () => new Date(),
      acquireFreshCapability: async () => fresh.capability,
      authenticateFreshCapability: (candidate: unknown) =>
        typeof candidate === "object" && candidate !== null && authority.has(candidate),
      claimExactDeployment: journal.claimExactDeployment,
      invokeExactSigningWorker: (request: BscTestnetPtaSigningWorkerRequest) =>
        invokeWorker(journal, request),
      commitSignedTransaction: journal.commitSignedTransaction
    });
    const signed = await signer.signOnce();
    if (signed.status !== "signed_committed") {
      const reconciled = await journal.readState();
      if (reconciled.status !== "signed_committed") fail(`SIGNER_${signed.issue.code}`);
      raw = reconciled.signedTransaction;
      transactionHash = reconciled.transactionHash;
    } else {
      raw = signed.signedTransaction;
      transactionHash = signed.transactionHash;
    }
    await validateSignedTransaction(raw, transactionHash, fresh.capability);
  } else {
    fail(initial.status === "claimed" ? "ONE_SHOT_CLAIM_WITHOUT_SIGNATURE" : "JOURNAL_UNKNOWN");
  }
  const receipt = await broadcastOrReconcile(raw, transactionHash);
  const evidence = await verifyDeployment(transactionHash, receipt, raw);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

async function main(): Promise<void> {
  try {
    if (process.argv[2] === "--worker") {
      if (process.argv.length !== 3) fail("WORKER_ARGUMENTS_INVALID");
      await runWorker();
      return;
    }
    assertExecutionArguments(process.argv.slice(2));
    await executeDeployment(await resolveExecutionDirectories());
  } catch (error) {
    const code = error instanceof DeploymentFailure ? error.code : "UNEXPECTED_FAILURE";
    process.stdout.write(`${JSON.stringify({ status: "blocked", code })}\n`);
    process.exitCode = 1;
  }
}

await main();
