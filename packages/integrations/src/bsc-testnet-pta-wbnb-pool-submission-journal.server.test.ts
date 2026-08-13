import { link, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
  BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY,
  createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse,
  createWindowsBscTestnetPtaWbnbPoolDurableSubmissionJournalAtSyntheticDirectoryForTests,
  type BscTestnetPtaWbnbPoolDurableSignedCommitRequest,
  type BscTestnetPtaWbnbPoolSubmissionJournalPorts
} from "./bsc-testnet-pta-wbnb-pool-submission-journal.server";

const NOW = "2026-08-13T10:00:00.000Z";
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
    nonce: 1,
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
      latestNonce: "1",
      pendingNonce: "1",
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
      nonce: "1",
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
    schemaVersion: 1,
    kind: "authenticated_owner_v2_signed_submission_commit_v1",
    ownerAuthorizationPolicy: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY,
    capability: cap
  });
}

async function requests(cap: BscTestnetPtaWbnbPoolSubmissionCapability) {
  const state = await deriveBscTestnetPtaWbnbPoolSubmissionJournalStateForInternalUse(
    cap,
    new Date(NOW)
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
  if ($item.PSIsContainer) {
    $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($current)
    $acl.SetAccessRuleProtection($true, $false)
    [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,$inherit,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow))
    [IO.Directory]::SetAccessControl($item.FullName, $acl)
  } else {
    $acl = [System.Security.AccessControl.FileSecurity]::new()
    $acl.SetOwner($current)
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

describe("durable PTA/WBNB submission journal v2", () => {
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
      ownerAuthorizationPolicy: BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY,
      journalEvidenceOnly: true,
      authorityReauthenticationRequired: true,
      sendingAuthorizedByJournal: false
    });
    const retained = fixture.files.get("01-signed-commit.v2.json") ?? "";
    expect(retained).toContain(cap.transaction.signedTransaction);
    expect(retained).toContain(cap.preSubmission.finalizedBlockHash);
    expect(retained).toContain("one_send_only_no_retry_no_replacement_reconcile_after_ambiguity");
    expect(fixture.files.has("02-submission-started.v2.json")).toBe(false);
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
          if (name === "02-submission-started.v2.json") throw new Error("power lost");
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
    partial.files.set("02-submission-started.v2.json", '{"partial":true}');
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
    expect(fixture.files.get("03-terminal-reconciliation.v2.json")).toMatch(/signedCommitSha256/u);
    expect(fixture.files.get("03-terminal-reconciliation.v2.json")).toMatch(
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
            ...BSC_TESTNET_PTA_WBNB_POOL_DURABLE_OWNER_V2_POLICY,
            retryAllowed: true
          })
        }) as unknown as BscTestnetPtaWbnbPoolDurableSignedCommitRequest
      )
    ).rejects.toThrow("INPUT_INVALID");
    await journal.initializeSignedCommit(signedCommit(cap));
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
    const linked = memoryPorts();
    const linkJournal = createBscTestnetPtaWbnbPoolDurableSubmissionJournalForInternalUse(
      Object.freeze({ ...linked.ports, assertSecure: async () => false })
    );
    await expect(linkJournal.readRecoveryState()).resolves.toMatchObject({
      state: "unknown_outcome",
      capability: null
    });
  });
});

describe.runIf(process.platform === "win32")(
  "Windows durable PTA/WBNB journal faults in synthetic temporary directories",
  () => {
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

        const partialPath = win32.join(directory, "02-submission-started.v2.json");
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
          win32.join(aclDirectory, "01-signed-commit.v2.json")
        );
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
          win32.join(linkDirectory, "01-signed-commit.v2.json"),
          win32.join(linkDirectory, "02-submission-started.v2.json")
        );
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
    }, 30_000);

    it("rejects a reparse-point child without following it", async () => {
      const directory = await createSyntheticWindowsDirectory();
      const target = await createSyntheticWindowsDirectory();
      try {
        await symlink(target, win32.join(directory, "01-signed-commit.v2.json"), "junction");
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
