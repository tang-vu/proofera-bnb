import { link, lstat, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, win32 } from "node:path";

import { privateKeyToAccount } from "viem/accounts";
import { keccak256, serializeTransaction, type Hex } from "viem";
import type * as ViemModule from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof ViemModule>();
  return {
    ...original,
    recoverTransactionAddress: vi.fn(async () => "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49")
  };
});

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE,
  BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
  deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse,
  type BscTestnetPtaWbnbPoolSubmissionCapability,
  type BscTestnetPtaWbnbPoolSubmissionStartedRequest,
  type BscTestnetPtaWbnbPoolTerminalReconciliationRequest
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";
import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V8_POLICY,
  createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse,
  createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests,
  openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests,
  openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationAtSyntheticDirectoryForTests,
  probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalAtSyntheticDirectoryForTests,
  probeWindowsBscTestnetPtaWbnbPoolGeneration3SubmissionJournalAtSyntheticDirectoryForTests,
  probeWindowsBscTestnetPtaWbnbPoolGeneration4SubmissionJournalAtSyntheticDirectoryForTests,
  probeWindowsBscTestnetPtaWbnbPoolGeneration5SubmissionJournalAtSyntheticDirectoryForTests,
  type BscTestnetPtaWbnbPoolDurableSignedCommitRequest,
  type BscTestnetPtaWbnbPoolSubmissionJournalPorts
} from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";

const NOW = "2026-08-13T10:00:00.000Z";
const SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-submission-journal.server.ts", import.meta.url),
  "utf8"
);
const PRIVATE_KEY = `0x${"11".repeat(32)}` as Hex;
const bytes32 = (byte: string) => `0x${byte.repeat(64)}` as Hex;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

async function capability(reference = NOW): Promise<BscTestnetPtaWbnbPoolSubmissionCapability> {
  const referenceMilliseconds = Date.parse(reference);
  const authenticatedAt = new Date(referenceMilliseconds - 5_000).toISOString();
  const expiresAt = new Date(referenceMilliseconds + 35_000).toISOString();
  const gasLimit = 5_983_857n;
  const gasPriceWei = 100_000_000n;
  const transaction = {
    chainId: 97,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    gas: gasLimit,
    gasPrice: gasPriceWei,
    nonce: 9,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    type: "legacy" as const,
    value: 0n
  };
  const unsigned = serializeTransaction(transaction);
  const signedTransaction = await privateKeyToAccount(PRIVATE_KEY).signTransaction(transaction);
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    scope: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
    oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    claimId: "claim-production-1",
    envelopeHash: bytes32("1"),
    reviewerApprovalDigest: bytes32("2"),
    ownerAuthorizationDigest: bytes32("3"),
    releaseCommit: "1".repeat(40),
    runtimeManifestSha256: bytes32("4"),
    recovery: Object.freeze({
      generation: 7,
      predecessorState: "failed_before_worker",
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256,
      attemptId: bytes32("7")
    }),
    authenticatedAt,
    expiresAt,
    signedCommitDurablyVerified: true,
    freshPreSubmissionDualRpcRecheckPerformed: true,
    preSubmission: Object.freeze({
      primaryOrigin: BSC_TESTNET_PTA_WBNB_POOL_PRIMARY_RPC_ORIGIN,
      corroboratorOrigin: BSC_TESTNET_PTA_WBNB_POOL_CORROBORATOR_RPC_ORIGIN,
      providerAgreementVerified: true,
      canonicalFinalizedBlockVerified: true,
      finalizedAnchorDualProviderExactNumberVerified: true,
      observedAt: authenticatedAt,
      finalizedBlockNumber: "124817266",
      finalizedBlockHash: bytes32("5"),
      finalizedBlockTimestamp: Math.floor(Date.parse(authenticatedAt) / 1_000).toString(),
      finalizedBlockGasLimit: "140000000",
      latestNonce: "9",
      pendingNonce: "9",
      transactionByHash: null,
      receiptByHash: null,
      factoryPoolForward: ZERO_ADDRESS,
      factoryPoolReverse: ZERO_ADDRESS,
      candidateCode: "0x",
      candidateNonce: "0",
      senderCode: "0x",
      senderBalanceWei: "100000000000000000",
      gasEstimate: "4986547",
      gasPriceWei: gasPriceWei.toString(),
      simulationReturnPool: BSC_TESTNET_PTA_WBNB_POOL_CANDIDATE
    }),
    transaction: Object.freeze({
      type: "legacy",
      chainId: "97",
      from: BSC_TESTNET_PTA_WBNB_POOL_SENDER,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      nonce: "9",
      valueWei: "0",
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPriceWei.toString(),
      maximumCostWei: (gasLimit * gasPriceWei).toString(),
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      signingHash: keccak256(unsigned),
      signedTransaction,
      transactionHash: keccak256(signedTransaction),
      recoveredSigner: BSC_TESTNET_PTA_WBNB_POOL_SENDER
    })
  });
}

function signedCommit(
  cap: BscTestnetPtaWbnbPoolSubmissionCapability
): BscTestnetPtaWbnbPoolDurableSignedCommitRequest {
  return Object.freeze({
    schemaVersion: 7,
    kind: "authenticated_owner_recovery_generation_7_signed_submission_commit_v7",
    ownerAuthorizationPolicy: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V8_POLICY,
    capability: cap
  });
}

async function requests(cap: BscTestnetPtaWbnbPoolSubmissionCapability, reference = NOW) {
  const state = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
    cap,
    new Date(reference)
  );
  if (state === null) throw new Error("Synthetic capability invalid.");
  const body = {
    schemaVersion: state.schemaVersion,
    operationKey: state.operationKey,
    claimId: state.claimId,
    envelopeHash: state.envelopeHash,
    releaseCommit: state.releaseCommit,
    runtimeManifestSha256: state.runtimeManifestSha256,
    reviewerApprovalDigest: state.reviewerApprovalDigest,
    ownerAuthorizationDigest: state.ownerAuthorizationDigest,
    recovery: state.recovery,
    signingHash: state.signingHash,
    transactionHash: state.transactionHash,
    signedTransactionKeccak256: state.signedTransactionKeccak256,
    submissionStartedDigest: state.submissionStartedDigest
  };
  return Object.freeze({
    state,
    start: Object.freeze({
      ...body,
      operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION
    }) satisfies BscTestnetPtaWbnbPoolSubmissionStartedRequest,
    terminal: Object.freeze({
      ...body,
      operation: BSC_TESTNET_PTA_WBNB_POOL_RECONCILIATION_OPERATION,
      outcome: "confirmed" as const,
      reconciliationDigest: bytes32("8")
    }) satisfies BscTestnetPtaWbnbPoolTerminalReconciliationRequest
  });
}

function memoryPorts(files = new Map<string, string>()): Readonly<{
  files: Map<string, string>;
  ports: BscTestnetPtaWbnbPoolSubmissionJournalPorts;
}> {
  return Object.freeze({
    files,
    ports: Object.freeze({
      now: () => new Date(NOW),
      listNames: async () => Object.freeze([...files.keys()].sort()),
      readBounded: async (name: string) => files.get(name) ?? null,
      createExclusive: async (name: string, content: string) => {
        if (files.has(name)) return "exists" as const;
        files.set(name, content);
        return "created" as const;
      },
      assertSecure: async () => true
    })
  });
}

const PROTECT_SYNTHETIC_PATH_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $spec = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $item = Get-Item -LiteralPath $spec.path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
  $existingAcl = Get-Acl -LiteralPath $item.FullName
  $existingOwner = try {
    ([System.Security.Principal.SecurityIdentifier]::new($existingAcl.Owner)).Value
  } catch {
    ([System.Security.Principal.NTAccount]::new($existingAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  }
  if ($existingOwner -ne $current.Value) { throw 'owner' }
  if ($item.PSIsContainer) {
    $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,$inherit,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow))
    [IO.Directory]::SetAccessControl($item.FullName, $acl)
  } else {
    $acl = [System.Security.AccessControl.FileSecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.AccessControlType]::Allow))
    [IO.File]::SetAccessControl($item.FullName, $acl)
  }
  [Console]::Out.Write('{"ok":true}')
} catch { exit 71 }
`;

const WEAKEN_SYNTHETIC_ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $path = ([Console]::In.ReadToEnd() | ConvertFrom-Json).path
  $acl = [IO.File]::GetAccessControl($path, [System.Security.AccessControl.AccessControlSections]::Access)
  $users = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-545')
  [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($users,[System.Security.AccessControl.FileSystemRights]::Read,[System.Security.AccessControl.AccessControlType]::Allow))
  [IO.File]::SetAccessControl($path, $acl)
  [Console]::Out.Write('{"ok":true}')
} catch { exit 72 }
`;

const SNAPSHOT_SYNTHETIC_ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $path = ([Console]::In.ReadToEnd() | ConvertFrom-Json).path
  $acl = Get-Acl -LiteralPath $path
  [Console]::Out.Write((@{ owner = $acl.Owner; sddl = $acl.Sddl } | ConvertTo-Json -Compress))
} catch { exit 75 }
`;

async function runSyntheticPowerShell(script: string, path: string): Promise<void> {
  const input = Buffer.from(JSON.stringify({ path }), "utf8");
  let output: Buffer | null = null;
  try {
    output = (
      await runPinnedPowerShellForInternalUse(script, input, 32, new AbortController().signal)
    ).output;
    expect(new TextDecoder("utf-8", { fatal: true }).decode(output)).toBe('{"ok":true}');
  } catch (error) {
    const reason =
      typeof error === "object" && error !== null
        ? Object.getOwnPropertyDescriptor(error, "reason")?.value
        : null;
    throw new Error(
      `Synthetic ${script === WEAKEN_SYNTHETIC_ACL_SCRIPT ? "ACL weakening" : "protection"} PowerShell failed: ${String(reason)}`
    );
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function snapshotSyntheticAcl(path: string): Promise<string> {
  const input = Buffer.from(JSON.stringify({ path }), "utf8");
  let output: Buffer | null = null;
  try {
    output = (
      await runPinnedPowerShellForInternalUse(
        SNAPSHOT_SYNTHETIC_ACL_SCRIPT,
        input,
        4_096,
        new AbortController().signal
      )
    ).output;
    return new TextDecoder("utf-8", { fatal: true }).decode(output);
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function snapshotSyntheticTree(directory: string): Promise<unknown> {
  const names = (await readdir(directory)).sort();
  const paths = [directory, ...names.map((name) => win32.join(directory, name))];
  const snapshots = [];
  for (const path of paths) {
    const metadata = await lstat(path, { bigint: true });
    snapshots.push(
      Object.freeze({
        path,
        mode: metadata.mode.toString(),
        size: metadata.size.toString(),
        nlink: metadata.nlink.toString(),
        mtimeNs: metadata.mtimeNs.toString(),
        ctimeNs: metadata.ctimeNs.toString(),
        birthtimeNs: metadata.birthtimeNs.toString(),
        acl: await snapshotSyntheticAcl(path)
      })
    );
  }
  return Object.freeze({ names: Object.freeze(names), snapshots: Object.freeze(snapshots) });
}

async function createSyntheticWindowsDirectory(): Promise<string> {
  const directory = win32.normalize(
    await mkdtemp(join(tmpdir(), "proofera-submission-journal-v2-test-"))
  );
  await runSyntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, directory);
  return directory;
}

async function removeSyntheticWindowsDirectory(directory: string): Promise<void> {
  const normalized = win32.normalize(directory);
  if (dirname(normalized).toLowerCase() !== win32.normalize(tmpdir()).toLowerCase()) {
    throw new Error("Synthetic journal cleanup escaped the OS temporary directory.");
  }
  await rm(normalized, { force: true, recursive: true });
}

describe("durable PTA/WBNB submission journal v7", () => {
  it("retains exact raw/preflight/release/review/envelope/policy recovery evidence without minting authority", async () => {
    const cap = await capability();
    const expected = await requests(cap);
    const fixture = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      fixture.ports
    );
    await expect(journal.initializeSignedCommit(signedCommit(cap))).resolves.toEqual({
      status: "initialized_by_this_call"
    });
    await expect(journal.readState()).resolves.toEqual(expected.state);
    await expect(journal.readRecoveryState()).resolves.toMatchObject({
      state: "signed_committed",
      capability: cap,
      ownerAuthorizationPolicy: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V8_POLICY,
      journalEvidenceOnly: true,
      authorityReauthenticationRequired: true,
      sendingAuthorizedByJournal: false
    });
    const retained = fixture.files.get("01-signed-commit.v8.json") ?? "";
    expect(retained).toContain(cap.transaction.signedTransaction);
    expect(retained).toContain(cap.preSubmission.finalizedBlockHash);
    expect(retained).toContain("one_send_only_no_retry_no_replacement_reconcile_after_ambiguity");
    expect(fixture.files.has("02-submission-started.v8.json")).toBe(false);
  });

  it("elects exactly one submission winner and all restarts are reconciliation-only", async () => {
    const cap = await capability();
    const { start } = await requests(cap);
    const fixture = memoryPorts();
    const journals = Array.from({ length: 16 }, () =>
      createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(fixture.ports)
    );
    await journals[0]?.initializeSignedCommit(signedCommit(cap));
    const outcomes = await Promise.all(
      journals.map((journal) => journal.commitSubmissionStarted(start))
    );
    expect(
      outcomes.filter((entry) => (entry as { status?: unknown }).status === "started_by_this_call")
    ).toHaveLength(1);
    expect(
      outcomes.filter((entry) => (entry as { status?: unknown }).status === "already_started")
    ).toHaveLength(15);
    await expect(journals[15]?.readRecoveryState()).resolves.toMatchObject({
      state: "submission_started",
      sendingAuthorizedByJournal: false,
      capability: { transaction: { signedTransaction: cap.transaction.signedTransaction } }
    });
  });

  it("makes ambiguous create acknowledgement terminal in-process and recoverable after restart", async () => {
    const cap = await capability();
    const { start } = await requests(cap);
    const fixture = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      Object.freeze({
        ...fixture.ports,
        createExclusive: async (name: string, content: string) => {
          if (fixture.files.has(name)) return "exists" as const;
          fixture.files.set(name, content);
          if (name === "02-submission-started.v8.json") throw new Error("power lost");
          return "created" as const;
        }
      })
    );
    await journal.initializeSignedCommit(signedCommit(cap));
    await expect(journal.commitSubmissionStarted(start)).rejects.toThrow("OUTCOME_UNKNOWN");
    await expect(journal.readRecoveryState()).resolves.toMatchObject({
      state: "unknown_outcome",
      capability: cap,
      sendingAuthorizedByJournal: false
    });
    await expect(journal.commitSubmissionStarted(start)).rejects.toThrow("OUTCOME_UNKNOWN");

    const restarted = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      fixture.ports
    );
    await expect(restarted.readRecoveryState()).resolves.toMatchObject({
      state: "submission_started",
      capability: cap
    });
    await expect(restarted.commitSubmissionStarted(start)).resolves.toMatchObject({
      status: "already_started"
    });
  });

  it("fails terminal on partial files, insecure ACL transition, and ambiguous readback", async () => {
    const cap = await capability();
    const { start } = await requests(cap);

    const partial = memoryPorts();
    const first = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(partial.ports);
    await first.initializeSignedCommit(signedCommit(cap));
    partial.files.set("02-submission-started.v8.json", '{"partial":true}');
    await expect(first.readRecoveryState()).resolves.toMatchObject({
      state: "unknown_outcome",
      capability: cap
    });

    const insecure = memoryPorts();
    let secure = true;
    const aclJournal = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      Object.freeze({
        ...insecure.ports,
        assertSecure: async () => secure,
        createExclusive: async (name: string, content: string) => {
          insecure.files.set(name, content);
          secure = false;
          return "created" as const;
        }
      })
    );
    await expect(aclJournal.initializeSignedCommit(signedCommit(cap))).rejects.toThrow(
      "OUTCOME_UNKNOWN"
    );
    await expect(aclJournal.readRecoveryState()).resolves.toMatchObject({
      state: "unknown_outcome"
    });

    const missingReadback = memoryPorts();
    const unreadable = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      Object.freeze({
        ...missingReadback.ports,
        readBounded: async () => null
      })
    );
    await expect(unreadable.initializeSignedCommit(signedCommit(cap))).rejects.toThrow(
      "OUTCOME_UNKNOWN"
    );
    await expect(unreadable.initializeSignedCommit(signedCommit(cap))).rejects.toThrow(
      "OUTCOME_UNKNOWN"
    );

    void start;
  });

  it("chains terminal evidence to exact signed and started bytes and rejects drift", async () => {
    const cap = await capability();
    const { start, terminal } = await requests(cap);
    const fixture = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      fixture.ports
    );
    await journal.initializeSignedCommit(signedCommit(cap));
    await journal.commitSubmissionStarted(start);
    await expect(journal.commitTerminalReconciliation(terminal)).resolves.toMatchObject({
      status: "confirmed"
    });
    await expect(journal.readRecoveryState()).resolves.toMatchObject({
      state: "confirmed",
      reconciliationDigest: terminal.reconciliationDigest
    });
    expect(fixture.files.get("03-terminal-reconciliation.v8.json")).toMatch(/signedCommitSha256/u);
    expect(fixture.files.get("03-terminal-reconciliation.v8.json")).toMatch(
      /submissionStartedRecordSha256/u
    );
    await expect(
      journal.commitTerminalReconciliation(
        Object.freeze({ ...terminal, reconciliationDigest: bytes32("9") })
      )
    ).rejects.toThrow("OUTCOME_UNKNOWN");
  });

  it("rejects policy drift, binding drift, proxy/accessor input, extra children, and hard-link security failure", async () => {
    const cap = await capability();
    const { start } = await requests(cap);
    const fixture = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      fixture.ports
    );
    await expect(
      journal.initializeSignedCommit(
        Object.freeze({
          ...signedCommit(cap),
          ownerAuthorizationPolicy: Object.freeze({
            ...BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V8_POLICY,
            retryAllowed: true
          })
        }) as unknown as BscTestnetPtaWbnbPoolDurableSignedCommitRequest
      )
    ).rejects.toThrow("INPUT_INVALID");
    await journal.initializeSignedCommit(signedCommit(cap));
    await expect(
      journal.commitSubmissionStarted(
        Object.freeze({
          ...start,
          recovery: Object.freeze({ ...start.recovery, attemptId: bytes32("f") })
        })
      )
    ).rejects.toThrow("OUTCOME_UNKNOWN");
    await expect(
      journal.commitSubmissionStarted(Object.freeze({ ...start, envelopeHash: bytes32("a") }))
    ).rejects.toThrow("OUTCOME_UNKNOWN");

    let traps = 0;
    const proxy = new Proxy(start, {
      get() {
        traps += 1;
        return undefined;
      },
      getPrototypeOf() {
        traps += 1;
        return Object.prototype;
      }
    });
    await expect(journal.commitSubmissionStarted(proxy)).rejects.toThrow("INPUT_INVALID");
    expect(traps).toBe(0);
    const getter = vi.fn(() => cap.transaction.transactionHash);
    const accessor = Object.freeze(
      Object.defineProperty({ ...start }, "transactionHash", { enumerable: true, get: getter })
    );
    await expect(journal.commitSubmissionStarted(accessor)).rejects.toThrow("INPUT_INVALID");
    expect(getter).not.toHaveBeenCalled();

    const contaminated = memoryPorts(new Map([["rogue.json", "{}\n"]]));
    await expect(
      createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
        contaminated.ports
      ).readRecoveryState()
    ).resolves.toMatchObject({ state: "unknown_outcome", capability: null });
    const retainedV2 = memoryPorts(new Map([["01-signed-commit.v2.json", "{}\n"]]));
    await expect(
      createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
        retainedV2.ports
      ).readRecoveryState()
    ).resolves.toMatchObject({ state: "unknown_outcome", capability: null });
    const linked = memoryPorts();
    const linkJournal = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      Object.freeze({ ...linked.ports, assertSecure: async () => false })
    );
    await expect(linkJournal.readRecoveryState()).resolves.toMatchObject({
      state: "unknown_outcome",
      capability: null
    });
  });

  it("keeps the fixed recovery path resolver read-only and separate from provisioning", () => {
    expect(SOURCE).not.toContain("process.env");
    expect(SOURCE).toContain(
      'const SUBDIRECTORY = ["ProofEra", "operations", "bsc-testnet-pta-wbnb-pool-submission-v6"]'
    );
    expect(SOURCE).not.toContain(".SetOwner(");
    const ownerValidation = SOURCE.indexOf("$existingOwner -ne $current.Value");
    const directoryAclWrite = SOURCE.indexOf("[IO.Directory]::SetAccessControl($cursor");
    expect(ownerValidation).toBeGreaterThan(0);
    expect(directoryAclWrite).toBeGreaterThan(ownerValidation);
    expect(SOURCE).toContain('const SIGNED_COMMIT_FILE = "01-signed-commit.v8.json"');
    expect(SOURCE).toContain('"bsc-testnet-pta-wbnb-pool-submission-v5"');
    expect(SOURCE).toContain('"01-signed-commit.v7.json"');
    expect(SOURCE).toContain('"bsc-testnet-pta-wbnb-pool-submission-v4"');
    expect(SOURCE).toContain('"01-signed-commit.v6.json"');
    expect(SOURCE).toContain('"bsc-testnet-pta-wbnb-pool-submission-v3"');
    expect(SOURCE).toContain('"01-signed-commit.v5.json"');
    expect(SOURCE).toContain('"bsc-testnet-pta-wbnb-pool-submission-v2"');
    expect(SOURCE).toContain('"01-signed-commit.v4.json"');
    const readOnlyStart = SOURCE.indexOf("const LOCAL_APPLICATION_DATA_READ_ONLY_PROBE_SCRIPT");
    const provisioningStart = SOURCE.indexOf("const PREPARE_SCRIPT");
    const readOnlyScript = SOURCE.slice(readOnlyStart, provisioningStart);
    expect(readOnlyStart).toBeGreaterThan(0);
    expect(provisioningStart).toBeGreaterThan(readOnlyStart);
    expect(readOnlyScript).not.toMatch(/New-Item|SetAccessControl|Remove-Item/u);
  });
});

describe.runIf(process.platform === "win32")(
  "Windows durable PTA/WBNB journal faults in synthetic temporary directories",
  () => {
    it("probes an empty existing directory without changing bytes, metadata, or ACL", async () => {
      const directory = await createSyntheticWindowsDirectory();
      try {
        const before = await snapshotSyntheticTree(directory);
        await expect(
          openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toMatchObject({ status: "absent", state: { state: "empty" } });
        expect(await snapshotSyntheticTree(directory)).toEqual(before);
      } finally {
        await removeSyntheticWindowsDirectory(directory);
      }
    }, 30_000);

    it("strictly exposes generation-3 submission-v3 exact-empty state without mutation", async () => {
      const directory = await createSyntheticWindowsDirectory();
      try {
        const before = await snapshotSyntheticTree(directory);
        await expect(
          probeWindowsBscTestnetPtaWbnbPoolGeneration3SubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toEqual({ status: "ready", presence: "empty", files: [], issue: null });
        expect(await snapshotSyntheticTree(directory)).toEqual(before);

        const retained = win32.join(directory, "01-signed-commit.v5.json");
        await writeFile(retained, '{"retained":true}\n', { encoding: "utf8", flag: "wx" });
        await runSyntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, retained);
        await expect(
          probeWindowsBscTestnetPtaWbnbPoolGeneration3SubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toMatchObject({ status: "ready", presence: "present" });
      } finally {
        await removeSyntheticWindowsDirectory(directory);
      }
    }, 30_000);

    it("strictly exposes generation-4 submission-v4 state without mutation", async () => {
      const directory = await createSyntheticWindowsDirectory();
      try {
        const emptyBefore = await snapshotSyntheticTree(directory);
        await expect(
          probeWindowsBscTestnetPtaWbnbPoolGeneration4SubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toEqual({ status: "ready", presence: "empty", files: [], issue: null });
        expect(await snapshotSyntheticTree(directory)).toEqual(emptyBefore);

        const retained = win32.join(directory, "01-signed-commit.v6.json");
        await writeFile(retained, '{"retained":true}\n', { encoding: "utf8", flag: "wx" });
        await runSyntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, retained);
        const retainedBefore = await snapshotSyntheticTree(directory);
        await expect(
          probeWindowsBscTestnetPtaWbnbPoolGeneration4SubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toEqual({
          status: "ready",
          presence: "present",
          files: ["01-signed-commit.v6.json"],
          issue: null
        });
        expect(await snapshotSyntheticTree(directory)).toEqual(retainedBefore);
      } finally {
        await removeSyntheticWindowsDirectory(directory);
      }
    }, 30_000);

    it("strictly exposes generation-5 submission-v5 state without mutation", async () => {
      const directory = await createSyntheticWindowsDirectory();
      try {
        const emptyBefore = await snapshotSyntheticTree(directory);
        await expect(
          probeWindowsBscTestnetPtaWbnbPoolGeneration5SubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toEqual({ status: "ready", presence: "empty", files: [], issue: null });
        expect(await snapshotSyntheticTree(directory)).toEqual(emptyBefore);

        const retained = win32.join(directory, "01-signed-commit.v7.json");
        await writeFile(retained, '{"retained":true}\n', { encoding: "utf8", flag: "wx" });
        await runSyntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, retained);
        const retainedBefore = await snapshotSyntheticTree(directory);
        await expect(
          probeWindowsBscTestnetPtaWbnbPoolGeneration5SubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toEqual({
          status: "ready",
          presence: "present",
          files: ["01-signed-commit.v7.json"],
          issue: null
        });
        expect(await snapshotSyntheticTree(directory)).toEqual(retainedBefore);
      } finally {
        await removeSyntheticWindowsDirectory(directory);
      }
    }, 30_000);

    it("strictly exposes predecessor-v2 presence and blocks contamination without mutation", async () => {
      const directory = await createSyntheticWindowsDirectory();
      try {
        const emptyBefore = await snapshotSyntheticTree(directory);
        await expect(
          probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toEqual({ status: "ready", presence: "empty", files: [], issue: null });
        expect(await snapshotSyntheticTree(directory)).toEqual(emptyBefore);

        const retained = win32.join(directory, "01-signed-commit.v4.json");
        await writeFile(retained, '{"retained":true}\n', { encoding: "utf8", flag: "wx" });
        await runSyntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, retained);
        const retainedBefore = await snapshotSyntheticTree(directory);
        await expect(
          probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toEqual({
          status: "ready",
          presence: "present",
          files: ["01-signed-commit.v4.json"],
          issue: null
        });
        expect(await snapshotSyntheticTree(directory)).toEqual(retainedBefore);

        const rogue = win32.join(directory, "rogue.json");
        await writeFile(rogue, "{}\n", { encoding: "utf8", flag: "wx" });
        await runSyntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, rogue);
        const contaminatedBefore = await snapshotSyntheticTree(directory);
        await expect(
          probeWindowsBscTestnetPtaWbnbPoolPredecessorSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toMatchObject({ status: "blocked", presence: "unknown", files: null });
        expect(await snapshotSyntheticTree(directory)).toEqual(contaminatedBefore);
      } finally {
        await removeSyntheticWindowsDirectory(directory);
      }
    }, 30_000);

    it("opens disjoint frozen read-only and terminal-only recovery facades", async () => {
      const directory = await createSyntheticWindowsDirectory();
      try {
        const reference = new Date().toISOString();
        const cap = await capability(reference);
        const { start } = await requests(cap, reference);
        const mutableJournal =
          await createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          );
        await mutableJournal.initializeSignedCommit(signedCommit(cap));
        await mutableJournal.commitSubmissionStarted(start);

        const beforeOpen = await snapshotSyntheticTree(directory);
        const startup =
          await openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          );
        expect(startup).toMatchObject({ status: "opened", state: { state: "submission_started" } });
        if (startup.status !== "opened") throw new Error("Expected startup recovery reader.");
        expect(Object.keys(startup.journal).sort()).toEqual([
          "readRecoveryState",
          "readStrictRecoveryState"
        ]);
        expect(
          (startup.journal as unknown as Record<string, unknown>).initializeSignedCommit
        ).toBeUndefined();
        expect(
          (startup.journal as unknown as Record<string, unknown>).commitSubmissionStarted
        ).toBeUndefined();

        const terminal =
          await openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationAtSyntheticDirectoryForTests(
            directory,
            startup.state
          );
        expect(terminal).toMatchObject({
          status: "opened",
          state: { state: "submission_started" }
        });
        if (terminal.status !== "opened") throw new Error("Expected terminal recovery handle.");
        expect(Object.keys(terminal.journal).sort()).toEqual([
          "commitTerminalReconciliation",
          "readState"
        ]);
        expect(
          (terminal.journal as unknown as Record<string, unknown>).initializeSignedCommit
        ).toBeUndefined();
        expect(
          (terminal.journal as unknown as Record<string, unknown>).commitSubmissionStarted
        ).toBeUndefined();
        await expect(
          openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationAtSyntheticDirectoryForTests(
            directory,
            structuredClone(startup.state)
          )
        ).resolves.toMatchObject({ status: "blocked", journal: null });
        expect(await snapshotSyntheticTree(directory)).toEqual(beforeOpen);

        const partialTerminal = win32.join(directory, "03-terminal-reconciliation.v8.json");
        await writeFile(partialTerminal, '{"partial":true}', { encoding: "utf8", flag: "wx" });
        await runSyntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, partialTerminal);
        const unknownStartup =
          await openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          );
        expect(unknownStartup).toMatchObject({
          status: "opened",
          state: { state: "unknown_outcome", capability: cap }
        });
        if (unknownStartup.status !== "opened") {
          throw new Error("Expected bounded unknown recovery reader.");
        }
        await expect(
          openExistingWindowsBscTestnetPtaWbnbPoolSubmissionJournalForTerminalReconciliationAtSyntheticDirectoryForTests(
            directory,
            unknownStartup.state
          )
        ).resolves.toMatchObject({
          status: "opened",
          state: { state: "unknown_outcome", capability: cap }
        });
      } finally {
        await removeSyntheticWindowsDirectory(directory);
      }
    }, 45_000);

    it("blocks partial/order-mismatched recovery files without changing them", async () => {
      for (const name of ["01-signed-commit.v8.json", "02-submission-started.v8.json"] as const) {
        const directory = await createSyntheticWindowsDirectory();
        try {
          const path = win32.join(directory, name);
          await writeFile(path, '{"partial":true}', { encoding: "utf8", flag: "wx" });
          await runSyntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, path);
          const before = await snapshotSyntheticTree(directory);
          await expect(
            openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
              directory
            )
          ).resolves.toMatchObject({ status: "blocked", state: null });
          expect(await snapshotSyntheticTree(directory)).toEqual(before);
        } finally {
          await removeSyntheticWindowsDirectory(directory);
        }
      }
    }, 45_000);

    it("flushes/protects an exact record and preserves signed evidence after a partial-file crash", async () => {
      const directory = await createSyntheticWindowsDirectory();
      try {
        const cap = await capability(new Date().toISOString());
        const journal =
          await createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          );
        await journal.initializeSignedCommit(signedCommit(cap));
        const restarted =
          await createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          );
        await expect(restarted.readRecoveryState()).resolves.toMatchObject({
          state: "signed_committed",
          capability: cap,
          sendingAuthorizedByJournal: false
        });

        const partialPath = win32.join(directory, "02-submission-started.v8.json");
        await writeFile(partialPath, '{"partial":true}', { encoding: "utf8", flag: "wx" });
        await runSyntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, partialPath);
        const afterPowerLoss =
          await createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          );
        await expect(afterPowerLoss.readRecoveryState()).resolves.toMatchObject({
          state: "unknown_outcome",
          capability: cap,
          sendingAuthorizedByJournal: false
        });
      } finally {
        await removeSyntheticWindowsDirectory(directory);
      }
    }, 30_000);

    // This covers two independent Windows ACL/link branches, each with several pinned
    // PowerShell probes. Keep the host budget bounded while allowing both branches to finish.
    it("rejects an ACL transition and a hard-linked retained record", async () => {
      const aclDirectory = await createSyntheticWindowsDirectory();
      try {
        const cap = await capability(new Date().toISOString());
        const journal =
          await createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            aclDirectory
          );
        await journal.initializeSignedCommit(signedCommit(cap));
        await runSyntheticPowerShell(
          WEAKEN_SYNTHETIC_ACL_SCRIPT,
          win32.join(aclDirectory, "01-signed-commit.v8.json")
        );
        const before = await snapshotSyntheticTree(aclDirectory);
        await expect(
          openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            aclDirectory
          )
        ).resolves.toMatchObject({ status: "blocked", state: null });
        expect(await snapshotSyntheticTree(aclDirectory)).toEqual(before);
        const restarted =
          await createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            aclDirectory
          );
        await expect(restarted.readRecoveryState()).resolves.toMatchObject({
          state: "unknown_outcome",
          capability: null
        });
      } finally {
        await removeSyntheticWindowsDirectory(aclDirectory);
      }

      const linkDirectory = await createSyntheticWindowsDirectory();
      try {
        const cap = await capability(new Date().toISOString());
        const journal =
          await createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            linkDirectory
          );
        await journal.initializeSignedCommit(signedCommit(cap));
        await link(
          win32.join(linkDirectory, "01-signed-commit.v8.json"),
          win32.join(linkDirectory, "02-submission-started.v8.json")
        );
        const before = await snapshotSyntheticTree(linkDirectory);
        await expect(
          openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            linkDirectory
          )
        ).resolves.toMatchObject({ status: "blocked", state: null });
        expect(await snapshotSyntheticTree(linkDirectory)).toEqual(before);
        const restarted =
          await createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            linkDirectory
          );
        await expect(restarted.readRecoveryState()).resolves.toMatchObject({
          state: "unknown_outcome",
          capability: null
        });
      } finally {
        await removeSyntheticWindowsDirectory(linkDirectory);
      }
    }, 60_000);

    it("rejects a reparse-point child without following it", async () => {
      const directory = await createSyntheticWindowsDirectory();
      const target = await createSyntheticWindowsDirectory();
      try {
        await symlink(target, win32.join(directory, "01-signed-commit.v8.json"), "junction");
        const targetBefore = await snapshotSyntheticTree(target);
        await expect(
          openExistingWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toMatchObject({ status: "blocked", state: null });
        expect(await snapshotSyntheticTree(target)).toEqual(targetBefore);
        const journal =
          await createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests(
            directory
          );
        await expect(journal.readRecoveryState()).resolves.toMatchObject({
          state: "unknown_outcome",
          capability: null
        });
      } finally {
        await removeSyntheticWindowsDirectory(directory);
        await removeSyntheticWindowsDirectory(target);
      }
    }, 30_000);
  }
);
