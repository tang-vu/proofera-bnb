import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { link, lstat, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, win32 } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { keccak256, serializeTransaction, type Hex } from "viem";
import type * as ViemModule from "viem";

vi.mock("server-only", () => ({}));
vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof ViemModule>();
  return {
    ...original,
    recoverTransactionAddress: vi.fn(async () => "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49")
  };
});

import {
  BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  createBscTestnetPtaWbnbPoolLocalJournalCore,
  deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256,
  deriveBscTestnetPtaWbnbPoolNoEffectProofDigest,
  openExistingWindowsBscTestnetPtaWbnbPoolActiveLocalJournalAtSyntheticDirectoryForTests,
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests,
  type BscTestnetPtaWbnbPoolLegacyClaimRequestForTests,
  type BscTestnetPtaWbnbPoolLocalJournalPorts,
  type BscTestnetPtaWbnbPoolNoEffectProof
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction,
  buildBscTestnetPtaWbnbPoolSigningWorkerRequest,
  type BscTestnetPtaWbnbPoolValidatedSigningIntent
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

const NOW = "2026-08-13T10:00:30.000Z";
const LEGACY_CLAIM_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v1","kind":"claim","claimId":"pta-wbnb-pool-e6c943aa33e600bfc1770ee654ee6b00","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0xeaf31374f49546dc2d02f351cf5872b9460b57fabaf94f39189411f45772d869","authorizationReceiptSha256":"0x3a69c8469b0a5f3bc2397975437969aec6ac144880992c3acae15a51d426c1b3","signingHash":"0xc1fde3400b68f5870d8f19d253fd58e9529a4aa440cecf4c3c1bf0de85f3efdc","serializedUnsignedSha256":"0x0ffa2338744fbb372a0b41df9551326c7de216e5381d4887dbbb29861880e76e","reviewerApprovalDigest":"0x330786388229f20ac735e394e0705395fcf130f1e241e11ab1080bf9e1d961f3","ownerAuthorizationDigest":"0xda498ee67ef685b6b47b7e3e2749db234c4951f6c9b15e376e18e7659d4188af","releaseCommit":"336af2967286795dc7703fff85034c71b8e84b5c","runtimeManifestSha256":"0xa1cda6fcf00f8a7d2b9a679cfb9b3fc28aa60674dae89c7dbfc032bdbcff5bdd","recordedAt":"2026-08-14T14:12:04.474Z","gasLimit":"5983857","gasPriceWei":"100000000","maxCostWei":"598385700000000","authorizedAt":"2026-08-14T14:11:35.280Z","expiresAt":"2026-08-14T14:12:20.280Z"}\n';
const SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-local-journal.server.ts", import.meta.url),
  "utf8"
);
const hex32 = (byte: string): Hex => `0x${byte.repeat(64)}` as Hex;

const PROTECT_SYNTHETIC_PATH_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $path = ([Console]::In.ReadToEnd() | ConvertFrom-Json).path
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $item = Get-Item -LiteralPath $path -Force
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
} catch { exit 73 }
`;

const SNAPSHOT_SYNTHETIC_ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $path = ([Console]::In.ReadToEnd() | ConvertFrom-Json).path
  $acl = Get-Acl -LiteralPath $path
  [Console]::Out.Write((@{ owner = $acl.Owner; sddl = $acl.Sddl } | ConvertTo-Json -Compress))
} catch { exit 74 }
`;

async function syntheticPowerShell(script: string, path: string): Promise<string> {
  const input = Buffer.from(JSON.stringify({ path }), "utf8");
  let output: Buffer | null = null;
  try {
    output = (
      await runPinnedPowerShellForInternalUse(script, input, 4_096, new AbortController().signal)
    ).output;
    return new TextDecoder("utf-8", { fatal: true }).decode(output);
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function protectSynthetic(path: string): Promise<void> {
  expect(await syntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, path)).toBe('{"ok":true}');
}

async function createSyntheticDirectory(): Promise<string> {
  const directory = win32.normalize(await mkdtemp(join(tmpdir(), "proofera-local-journal-test-")));
  await protectSynthetic(directory);
  return directory;
}

async function cleanupSyntheticDirectory(directory: string): Promise<void> {
  const normalized = win32.normalize(directory);
  if (dirname(normalized).toLowerCase() !== win32.normalize(tmpdir()).toLowerCase()) {
    throw new Error("Synthetic journal cleanup escaped the OS temporary directory.");
  }
  await rm(normalized, { force: true, recursive: true });
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
        acl: await syntheticPowerShell(SNAPSHOT_SYNTHETIC_ACL_SCRIPT, path)
      })
    );
  }
  return Object.freeze({ names: Object.freeze(names), snapshots: Object.freeze(snapshots) });
}

function exactTransaction() {
  const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: "1000000",
    gasPriceWei: "100000000",
    sourceEnvelopeHash: hex32("1")
  });
  if (transaction === null) throw new TypeError("invalid exact transaction fixture");
  return transaction;
}

function unsignedSha256(transaction: ReturnType<typeof exactTransaction>): Hex {
  return `0x${createHash("sha256")
    .update(Buffer.from(transaction.serializedUnsignedTransaction.slice(2), "hex"))
    .digest("hex")}`;
}

function claim(
  overrides: Partial<
    BscTestnetPtaWbnbPoolLegacyClaimRequestForTests & {
      generation: 2;
      predecessorState: "superseded_before_worker";
      predecessorFenceSha256: Hex;
      attemptId: Hex;
    }
  > = {}
) {
  const transaction = exactTransaction();
  const body = {
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: hex32("1"),
    signingHash: transaction.signingHash,
    serializedUnsignedSha256: unsignedSha256(transaction),
    gasLimit: transaction.gasLimit,
    gasPriceWei: transaction.gasPriceWei,
    maxCostWei: transaction.maximumCostWei,
    reviewerApprovalDigest: hex32("4"),
    ownerAuthorizationDigest: hex32("5"),
    releaseCommit: "6".repeat(40),
    runtimeManifestSha256: hex32("7"),
    authorizedAt: "2026-08-13T10:00:00.000Z",
    expiresAt: "2026-08-13T10:00:45.000Z",
    ...overrides
  };
  return Object.freeze({
    ...body,
    authorizationReceiptSha256: deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256(body)
  });
}

function workerExchange(request: BscTestnetPtaWbnbPoolLegacyClaimRequestForTests, token: Hex) {
  const recovery = Object.freeze({
    generation: 2 as const,
    predecessorState: "superseded_before_worker" as const,
    predecessorFenceSha256: hex32("9"),
    attemptId: hex32("a")
  });
  const intent = Object.freeze({
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: request.envelopeHash,
    reviewerApprovalDigest: request.reviewerApprovalDigest,
    ownerAuthorizationDigest: request.ownerAuthorizationDigest,
    claimId: binding(request).claimId,
    journalClaimToken: token,
    releaseCommit: request.releaseCommit,
    runtimeManifestSha256: request.runtimeManifestSha256,
    authenticatedAt: NOW,
    expiresAt: request.expiresAt,
    recovery,
    transaction: exactTransaction()
  }) satisfies BscTestnetPtaWbnbPoolValidatedSigningIntent;
  const workerRequest = buildBscTestnetPtaWbnbPoolSigningWorkerRequest(intent);
  const signedTransaction = serializeTransaction(
    {
      type: "legacy",
      chainId: 97,
      nonce: 1,
      gasPrice: BigInt(workerRequest.transaction.gasPriceWei),
      gas: BigInt(workerRequest.transaction.gasLimit),
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      value: 0n,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
    },
    { r: "0x01", s: "0x02", v: 229n }
  );
  return Object.freeze({
    workerRequest,
    workerResponse: Object.freeze({
      schemaVersion: 2 as const,
      operation: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
      status: "signed" as const,
      oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      claimId: workerRequest.claimId,
      journalClaimToken: token,
      releaseCommit: request.releaseCommit,
      runtimeManifestSha256: request.runtimeManifestSha256,
      requestHash: workerRequest.requestHash,
      signingHash: workerRequest.transaction.signingHash,
      signedTransaction,
      transactionHash: keccak256(signedTransaction)
    })
  });
}

function memoryPorts(initial: Readonly<Record<string, string>> = {}, now = NOW) {
  const files = new Map(Object.entries(initial));
  const calls: string[] = [];
  const ports: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
    now: () => new Date(now),
    listNames: async () => Object.freeze([...files.keys()].sort()),
    readBounded: async (name: string) => files.get(name) ?? null,
    createExclusive: async (name: string, content: string) => {
      calls.push(name);
      if (files.has(name)) return "exists" as const;
      files.set(name, content);
      return "created" as const;
    },
    createExclusiveFenceFromFactory: async (name: string, contentFactory: () => string) => {
      calls.push(name);
      if (files.has(name)) return "exists" as const;
      files.set(name, "");
      files.set(name, contentFactory());
      return "created" as const;
    },
    assertSecure: async (names: readonly string[]) =>
      Object.freeze({
        verified: true as const,
        ownerSid: "S-1-5-21-1",
        accessRulesProtected: true as const,
        currentUserOnlyFullControl: true as const,
        checkedPaths: names.length + 1
      })
  });
  return { ports, files, calls };
}

function exactNoEffectProof(
  overrides: Partial<BscTestnetPtaWbnbPoolNoEffectProof> = {}
): BscTestnetPtaWbnbPoolNoEffectProof {
  return Object.freeze({
    schemaVersion: 1,
    kind: "exact_fixed_dual_rpc_no_onchain_effect_after_claim_v1",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: hex32("b"),
    observedAt: "2026-08-14T14:12:21.000Z",
    finalizedBlockNumber: "1",
    finalizedBlockHash: hex32("c"),
    finalizedBlockTimestamp: "1",
    latestNonce: "1",
    pendingNonce: "1",
    pendingPool: "0x0000000000000000000000000000000000000000",
    candidateCode: "0x",
    candidateNonce: "0",
    providerAgreementVerified: true,
    allRuntimeIdentitiesVerified: true,
    allEip1967SlotsZero: true,
    allProtocolBindingsVerified: true,
    feeTierVerified: true,
    simulationReturnPool: "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE",
    submissionJournalPresence: "absent",
    ...overrides
  });
}

function binding(
  request: Pick<
    BscTestnetPtaWbnbPoolLegacyClaimRequestForTests,
    | "operationKey"
    | "envelopeHash"
    | "authorizationReceiptSha256"
    | "signingHash"
    | "serializedUnsignedSha256"
    | "reviewerApprovalDigest"
    | "ownerAuthorizationDigest"
    | "releaseCommit"
    | "runtimeManifestSha256"
  >
) {
  return {
    claimId: `pta-wbnb-pool-${request.operationKey.slice(2, 34)}`,
    operationKey: request.operationKey,
    envelopeHash: request.envelopeHash,
    authorizationReceiptSha256: request.authorizationReceiptSha256,
    signingHash: request.signingHash,
    serializedUnsignedSha256: request.serializedUnsignedSha256,
    reviewerApprovalDigest: request.reviewerApprovalDigest,
    ownerAuthorizationDigest: request.ownerAuthorizationDigest,
    releaseCommit: request.releaseCommit,
    runtimeManifestSha256: request.runtimeManifestSha256
  };
}

type DrivenStatus = "claimed" | "worker_authorized" | "worker_started" | "signed_committed";

async function driveTo(target: DrivenStatus) {
  const memory = memoryPorts();
  const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
  const request = claim();
  const exact = binding(request);
  const token = hex32("8");
  const exchange = workerExchange(request, token);
  const requestHash = exchange.workerRequest.requestHash;
  const serializedTransaction = exchange.workerResponse.signedTransaction;
  const transactionHash = exchange.workerResponse.transactionHash;
  await journal.claimExactInitialization(request);
  if (target !== "claimed") {
    await journal.authorizeWorker({
      ...exact,
      workerRequestHash: requestHash,
      authorizationTokenDigest: keccak256(token)
    });
  }
  if (target !== "claimed" && target !== "worker_authorized") {
    await journal.startWorker({
      ...exact,
      workerRequestHash: requestHash,
      authorizationToken: token
    });
  }
  if (target !== "claimed" && target !== "worker_authorized" && target !== "worker_started") {
    await journal.commitWorkerSignedTransaction(exchange.workerRequest, exchange.workerResponse);
  }
  return {
    memory,
    journal,
    request,
    exact,
    token,
    requestHash,
    workerRequest: exchange.workerRequest,
    workerResponse: exchange.workerResponse,
    serializedTransaction,
    transactionHash
  };
}

describe("PTA/WBNB pool local append-only journal", () => {
  it("fences only the exact incident claim after expiry and makes the predecessor terminal", async () => {
    expect(Buffer.byteLength(LEGACY_CLAIM_RECORD, "utf8")).toBe(1_123);
    expect(`0x${createHash("sha256").update(LEGACY_CLAIM_RECORD, "utf8").digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256
    );

    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 1);
    const candidate = await journal.readClaimOnlyRecoveryCandidate();
    expect(candidate).toMatchObject({
      status: "claimed",
      legacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
      legacyAuthorizationExpiresAt: "2026-08-14T14:12:20.280Z"
    });
    if (candidate === null) throw new TypeError("exact incident fixture was not recognized");
    const proof = exactNoEffectProof();
    const proofDigest = deriveBscTestnetPtaWbnbPoolNoEffectProofDigest(proof);
    const fence = await journal.fenceClaimBeforeWorker(
      Object.freeze({
        expectedLegacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
        proof
      })
    );
    expect(fence).toMatchObject({
      status: "superseded_before_worker",
      terminalCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN",
      workerAuthorizationOutcome: "not_attempted",
      workerStartOutcome: "not_attempted",
      signatureOutcome: "not_attempted",
      submissionOutcome: "not_attempted",
      submissionJournalState: "exact_empty",
      legacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
      noEffectProofDigest: proofDigest,
      noEffectEnvelopeHash: proof.envelopeHash,
      noEffectObservedAt: proof.observedAt,
      fenceRecordedAt: "2026-08-14T14:12:22.000Z"
    });
    await expect(journal.readClaimOnlyRecoveryCandidate()).resolves.toBeNull();
    await expect(
      journal.authorizeWorker({
        ...binding(candidate),
        workerRequestHash: hex32("d"),
        authorizationTokenDigest: hex32("e")
      })
    ).rejects.toThrow("STATE_MISMATCH");
    await expect(
      journal.recordUnknownOutcome({ ...binding(candidate), outcomeDigest: hex32("f") })
    ).rejects.toThrow("STATE_MISMATCH");
    expect(memory.files.size).toBe(2);
    await expect(journal.readStrictRecoveryState()).resolves.toMatchObject({
      status: "superseded_before_worker",
      supersessionFence: fence
    });
  });

  it("lets a stale worker authorization win slot 2 only by permanently blocking supersession", async () => {
    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 1);
    const candidate = await journal.readClaimOnlyRecoveryCandidate();
    if (candidate === null) throw new TypeError("exact incident fixture was not recognized");
    await journal.authorizeWorker({
      ...binding(candidate),
      workerRequestHash: hex32("d"),
      authorizationTokenDigest: hex32("e")
    });
    await expect(
      journal.fenceClaimBeforeWorker(
        Object.freeze({
          expectedLegacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
          proof: exactNoEffectProof()
        })
      )
    ).rejects.toThrow("PERMANENTLY_BLOCKED");
    await expect(journal.readState()).resolves.toMatchObject({ status: "worker_authorized" });
    expect(memory.calls).toEqual(["02-transition.v1.json"]);
  });

  it("aborts the current fence caller on O_EXCL exists even when retained bytes are exact", async () => {
    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    const racingPorts: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
      ...memory.ports,
      createExclusiveFenceFromFactory: async (name: string, contentFactory: () => string) => {
        if (name !== "02-transition.v1.json") throw new TypeError("unexpected slot");
        memory.files.set(name, contentFactory());
        return "exists" as const;
      }
    });
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(racingPorts, 1);
    await expect(
      journal.fenceClaimBeforeWorker(
        Object.freeze({
          expectedLegacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
          proof: exactNoEffectProof()
        })
      )
    ).rejects.toThrow("OUTCOME_UNKNOWN");
    await expect(journal.readStrictRecoveryState()).resolves.toMatchObject({
      status: "superseded_before_worker"
    });
  });

  it("rejects an already-stale proof before reserving slot 2", async () => {
    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    let stalled = false;
    const createFence = vi.fn(memory.ports.createExclusiveFenceFromFactory);
    const staleBeforeReservation: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
      ...memory.ports,
      now: () => new Date(stalled ? "2026-08-14T14:14:21.001Z" : "2026-08-14T14:12:22.000Z"),
      assertSecure: async (names: readonly string[]) => {
        const result = await memory.ports.assertSecure(names);
        // Simulates the strict snapshot/ACL read completing only after snapshot A has become stale.
        stalled = true;
        return result;
      },
      createExclusiveFenceFromFactory: createFence
    });
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(staleBeforeReservation, 1);

    await expect(
      journal.fenceClaimBeforeWorker(
        Object.freeze({
          expectedLegacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
          proof: exactNoEffectProof()
        })
      )
    ).rejects.toThrow("PROOF_INVALID");
    expect(createFence).not.toHaveBeenCalled();
    expect(memory.files.has("02-transition.v1.json")).toBe(false);
    expect(memory.calls).toEqual([]);
    await expect(journal.readStrictRecoveryState()).resolves.toMatchObject({ status: "claimed" });
    await expect(journal.readClaimOnlyRecoveryCandidate()).resolves.not.toBeNull();
  });

  it("rechecks proof age after O_EXCL reservation and blocks a stale resumed proof", async () => {
    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    let reserved = false;
    let clockCalls = 0;
    const stalledBeforeReservation: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
      ...memory.ports,
      now: () => {
        clockCalls += 1;
        return new Date(reserved ? "2026-08-14T14:14:21.001Z" : "2026-08-14T14:12:22.000Z");
      },
      createExclusiveFenceFromFactory: async (name: string, contentFactory: () => string) => {
        if (name !== "02-transition.v1.json") throw new TypeError("unexpected slot");
        memory.calls.push(name);
        if (memory.files.has(name)) return "exists" as const;
        // Simulates a process suspended after the precheck but before the kernel reservation. The
        // decisive fence time is recaptured after this point, so stale proof bytes cannot survive.
        reserved = true;
        memory.files.set(name, "");
        memory.files.set(name, contentFactory());
        return "created" as const;
      }
    });
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(stalledBeforeReservation, 1);
    const request = Object.freeze({
      expectedLegacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
      proof: exactNoEffectProof()
    });

    await expect(journal.fenceClaimBeforeWorker(request)).rejects.toThrow("PROOF_INVALID");
    expect(clockCalls).toBe(2);
    expect(memory.files.has("02-transition.v1.json")).toBe(true);
    expect(memory.files.get("02-transition.v1.json")).toBe("");
    expect(memory.calls).toEqual(["02-transition.v1.json"]);
    await expect(journal.readStrictRecoveryState()).resolves.toBeNull();
    const restarted = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 1);
    await expect(restarted.readStrictRecoveryState()).resolves.toBeNull();
  });

  it("leaves a crash after O_EXCL reservation as a strict restart block", async () => {
    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    const crashAfterReservation: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
      ...memory.ports,
      createExclusiveFenceFromFactory: async (name: string) => {
        if (name !== "02-transition.v1.json") throw new TypeError("unexpected slot");
        memory.calls.push(name);
        memory.files.set(name, "");
        throw new Error("synthetic-crash-after-reservation");
      }
    });
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(crashAfterReservation, 1);

    await expect(
      journal.fenceClaimBeforeWorker(
        Object.freeze({
          expectedLegacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
          proof: exactNoEffectProof()
        })
      )
    ).rejects.toThrow("synthetic-crash-after-reservation");
    expect(memory.files.get("02-transition.v1.json")).toBe("");
    expect(memory.calls).toEqual(["02-transition.v1.json"]);
    const restarted = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 1);
    await expect(restarted.readStrictRecoveryState()).resolves.toBeNull();
    await expect(restarted.readClaimOnlyRecoveryCandidate()).resolves.toBeNull();
  });

  it("rejects noncanonical, stale, pre-expiry, or unbounded no-effect proof fields", async () => {
    const invalidProofs = [
      exactNoEffectProof({ observedAt: "2026-08-14T14:12:20.000Z" }),
      exactNoEffectProof({ candidateNonce: "1" as "0" }),
      exactNoEffectProof({ submissionJournalPresence: "present" as "absent" }),
      exactNoEffectProof({ finalizedBlockNumber: "18446744073709551616" }),
      exactNoEffectProof({ finalizedBlockTimestamp: "9999999999999999999" })
    ];
    for (const proof of invalidProofs) {
      const memory = memoryPorts(
        { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
        "2026-08-14T14:12:22.000Z"
      );
      const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 1);
      await expect(
        journal.fenceClaimBeforeWorker(
          Object.freeze({
            expectedLegacyClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_LEGACY_CLAIM_RAW_SHA256,
            proof
          })
        )
      ).rejects.toThrow();
      expect(memory.files.size).toBe(1);
    }
  });

  it("uses a distinct generation-2 schema, receipt domain, recovery binding, and claim id", async () => {
    const recovery = Object.freeze({
      generation: 2 as const,
      predecessorState: "superseded_before_worker" as const,
      predecessorFenceSha256: hex32("9"),
      attemptId: hex32("a")
    });
    const request = claim(recovery);
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 2);
    const result = await journal.claimExactInitialization(request);
    expect(result).toMatchObject({ status: "claimed" });
    expect(result.claimId).toMatch(/^pta-wbnb-pool-v2-[0-9a-f]{32}$/u);
    expect(result.claimId).not.toBe(binding(claim()).claimId);
    expect(request.authorizationReceiptSha256).not.toBe(claim().authorizationReceiptSha256);
    expect(memory.files.get("01-claim.v2.json")).toContain(
      '"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v2"'
    );
    await expect(journal.readState()).resolves.toMatchObject({
      status: "claimed",
      generation: 2,
      predecessorState: recovery.predecessorState,
      predecessorFenceSha256: recovery.predecessorFenceSha256,
      attemptId: recovery.attemptId
    });
    await expect(
      createBscTestnetPtaWbnbPoolLocalJournalCore(memoryPorts().ports, 2).claimExactInitialization(
        claim()
      )
    ).rejects.toThrow("INPUT_INVALID");
    await expect(
      createBscTestnetPtaWbnbPoolLocalJournalCore(memoryPorts().ports, 1).claimExactInitialization(
        request
      )
    ).rejects.toThrow("INPUT_INVALID");

    for (const changed of [
      claim({ ...recovery, attemptId: hex32("b") }),
      claim({ ...recovery, predecessorFenceSha256: hex32("c") })
    ]) {
      const changedResult = await createBscTestnetPtaWbnbPoolLocalJournalCore(
        memoryPorts().ports,
        2
      ).claimExactInitialization(changed);
      expect(changedResult.claimId).not.toBe(result.claimId);
    }
  });

  it("claims once and returns every immutable recovery binding", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
    const request = claim();
    await expect(journal.claimExactInitialization(request)).resolves.toMatchObject({
      status: "claimed",
      claimId: binding(request).claimId
    });
    await expect(journal.readState()).resolves.toEqual({
      status: "claimed",
      ...binding(request),
      generation: 1,
      predecessorState: null,
      predecessorFenceSha256: null,
      attemptId: null,
      gasLimit: request.gasLimit,
      gasPriceWei: request.gasPriceWei,
      maxCostWei: request.maxCostWei,
      authorizedAt: request.authorizedAt,
      expiresAt: request.expiresAt,
      serializedTransaction: null,
      transactionHash: null,
      supersessionFence: null
    });
    await expect(journal.claimExactInitialization(request)).resolves.toMatchObject({
      status: "already_claimed",
      state: "claimed"
    });
    expect(memory.calls).toEqual(["01-claim.v1.json"]);
  });

  it("collapses concurrent claims to exactly one exclusive winner", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
    const outcomes = await Promise.all([
      journal.claimExactInitialization(claim()),
      journal.claimExactInitialization(claim())
    ]);
    expect(outcomes.map((result) => result.status).sort()).toEqual(["already_claimed", "claimed"]);
    expect(memory.files.size).toBe(1);
  });

  it("allows one winner among sixteen concurrent claim, authorize, and start attempts", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
    const request = claim();
    const exact = binding(request);
    const token = hex32("8");
    const requestHash = hex32("9");
    const claims = await Promise.all(
      Array.from({ length: 16 }, () => journal.claimExactInitialization(request))
    );
    expect(claims.filter((result) => result.status === "claimed")).toHaveLength(1);

    const authorizations = await Promise.allSettled(
      Array.from({ length: 16 }, () =>
        journal.authorizeWorker({
          ...exact,
          workerRequestHash: requestHash,
          authorizationTokenDigest: keccak256(token)
        })
      )
    );
    expect(authorizations.filter((result) => result.status === "fulfilled")).toHaveLength(1);

    const starts = await Promise.allSettled(
      Array.from({ length: 16 }, () =>
        journal.startWorker({
          ...exact,
          workerRequestHash: requestHash,
          authorizationToken: token
        })
      )
    );
    expect(starts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expect(journal.readState()).resolves.toMatchObject({ status: "worker_started" });
    expect(memory.files.size).toBe(3);
  });

  it("accepts only protocol-validated worker bytes and never self-asserts receipt success", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
    const request = claim();
    const exact = binding(request);
    const token = hex32("8");
    const exchange = workerExchange(request, token);
    const requestHash = exchange.workerRequest.requestHash;
    const raw = exchange.workerResponse.signedTransaction;
    const transactionHash = exchange.workerResponse.transactionHash;
    await journal.claimExactInitialization(request);
    await journal.authorizeWorker({
      ...exact,
      workerRequestHash: requestHash,
      authorizationTokenDigest: keccak256(token)
    });
    await expect(
      journal.startWorker({
        ...exact,
        workerRequestHash: requestHash,
        authorizationToken: hex32("a")
      })
    ).rejects.toThrow("WORKER_AUTHORIZATION_INVALID");
    await journal.startWorker({
      ...exact,
      workerRequestHash: requestHash,
      authorizationToken: token
    });
    await expect(
      journal.commitWorkerSignedTransaction(exchange.workerRequest, {
        ...exchange.workerResponse,
        signedTransaction: "0x01",
        transactionHash: keccak256("0x01")
      })
    ).rejects.toThrow("INPUT_INVALID");
    await journal.commitWorkerSignedTransaction(exchange.workerRequest, exchange.workerResponse);
    const writesAfterCommit = memory.calls.length;
    await expect(
      journal.commitWorkerSignedTransaction(exchange.workerRequest, exchange.workerResponse)
    ).resolves.toEqual({ status: "signed_committed" });
    expect(memory.calls).toHaveLength(writesAfterCommit);
    await expect(journal.readState()).resolves.toMatchObject({
      status: "signed_committed",
      serializedTransaction: raw,
      transactionHash
    });
    expect(journal).not.toHaveProperty("commitSignedTransaction");
    expect(journal).not.toHaveProperty("confirmSuccess");
    expect(journal).not.toHaveProperty("confirmReverted");
    expect(journal).not.toHaveProperty("startSubmission");
    expect(journal).not.toHaveProperty("acknowledgeBroadcast");
  });

  it("accepts exact signed replay only and rejects changed signed bytes after commit", async () => {
    const fixture = await driveTo("signed_committed");
    const writes = fixture.memory.calls.length;
    await expect(
      fixture.journal.commitWorkerSignedTransaction(fixture.workerRequest, fixture.workerResponse)
    ).resolves.toEqual({ status: "signed_committed" });
    expect(fixture.memory.calls).toHaveLength(writes);
    const changed = "0x02" as Hex;
    await expect(
      fixture.journal.commitWorkerSignedTransaction(fixture.workerRequest, {
        ...fixture.workerResponse,
        signedTransaction: changed,
        transactionHash: keccak256(changed)
      })
    ).rejects.toThrow("INPUT_INVALID");
    expect(fixture.memory.calls).toHaveLength(writes);
  });

  it("fails closed on malformed, missing-slot, extra-file and cross-bound retained records", async () => {
    const source = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(source.ports);
    const request = claim();
    await journal.claimExactInitialization(request);
    const claimContent = source.files.get("01-claim.v1.json");
    expect(claimContent).toBeDefined();
    if (claimContent === undefined) throw new TypeError("missing retained claim fixture");

    for (const initial of [
      { "01-claim.v1.json": "{bad" },
      { "02-transition.v1.json": claimContent },
      { "01-claim.v1.json": claimContent, "03-transition.v1.json": claimContent },
      { "01-claim.v1.json": claimContent, "unexpected.txt": "x" }
    ]) {
      const broken = createBscTestnetPtaWbnbPoolLocalJournalCore(memoryPorts(initial).ports);
      await expect(broken.readState()).resolves.toMatchObject({ status: "unknown_outcome" });
    }

    const authorized = await driveTo("worker_authorized");
    const transitionContent = authorized.memory.files.get("02-transition.v1.json");
    expect(transitionContent).toBeDefined();
    if (transitionContent === undefined) throw new TypeError("missing transition fixture");
    const transition = JSON.parse(transitionContent) as Record<string, unknown>;
    transition.envelopeHash = hex32("f");
    authorized.memory.files.set("02-transition.v1.json", `${JSON.stringify(transition)}\n`);
    await expect(authorized.journal.readState()).resolves.toMatchObject({
      status: "unknown_outcome"
    });
  });

  it("rejects mutation of every retained cross-binding field", async () => {
    const base = claim();
    const exact = binding(base);
    const mutations: Array<Partial<typeof exact>> = [
      { claimId: `pta-wbnb-pool-${"f".repeat(32)}` },
      { operationKey: hex32("f") },
      { envelopeHash: hex32("f") },
      { authorizationReceiptSha256: hex32("f") },
      { signingHash: hex32("f") },
      { serializedUnsignedSha256: hex32("f") },
      { reviewerApprovalDigest: hex32("f") },
      { ownerAuthorizationDigest: hex32("f") },
      { releaseCommit: "f".repeat(40) },
      { runtimeManifestSha256: hex32("f") }
    ];
    for (const mutation of mutations) {
      const memory = memoryPorts();
      const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
      await journal.claimExactInitialization(base);
      await expect(
        journal.authorizeWorker({
          ...exact,
          ...mutation,
          workerRequestHash: hex32("9"),
          authorizationTokenDigest: hex32("8")
        })
      ).rejects.toThrow();
      expect(memory.files.size).toBe(1);
    }
  });

  it("makes failure and unknown outcomes terminal without overwrite or retry", async () => {
    for (const terminal of ["failure", "unknown"] as const) {
      const memory = memoryPorts();
      const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
      const request = claim();
      const exact = binding(request);
      await journal.claimExactInitialization(request);
      if (terminal === "failure") {
        await journal.failBeforeSubmission({ ...exact, outcomeDigest: hex32("d") });
        await expect(journal.readState()).resolves.toMatchObject({
          status: "failed_before_submission"
        });
      } else {
        await journal.recordUnknownOutcome({ ...exact, outcomeDigest: hex32("e") });
        await expect(journal.readState()).resolves.toMatchObject({ status: "unknown_outcome" });
      }
      await expect(
        journal.authorizeWorker({
          ...exact,
          workerRequestHash: hex32("9"),
          authorizationTokenDigest: hex32("8")
        })
      ).rejects.toThrow("STATE_MISMATCH");
    }
  });

  it("records conservative terminal outcomes without claiming submission or receipt evidence", async () => {
    for (const status of [
      "claimed",
      "worker_authorized",
      "worker_started",
      "signed_committed"
    ] as const) {
      const fixture = await driveTo(status);
      await fixture.journal.failBeforeSubmission({
        ...fixture.exact,
        outcomeDigest: hex32("d"),
        ...(status === "signed_committed"
          ? {
              serializedTransaction: fixture.serializedTransaction,
              transactionHash: fixture.transactionHash
            }
          : {})
      });
      await expect(fixture.journal.readState()).resolves.toMatchObject({
        status: "failed_before_submission"
      });
    }
    for (const status of [
      "claimed",
      "worker_authorized",
      "worker_started",
      "signed_committed"
    ] as const) {
      const fixture = await driveTo(status);
      await fixture.journal.recordUnknownOutcome({
        ...fixture.exact,
        outcomeDigest: hex32("e"),
        ...(status === "signed_committed"
          ? {
              serializedTransaction: fixture.serializedTransaction,
              transactionHash: fixture.transactionHash
            }
          : {})
      });
      await expect(fixture.journal.readState()).resolves.toMatchObject({
        status: "unknown_outcome",
        transactionHash: status === "signed_committed" ? fixture.transactionHash : null
      });
    }
  });

  it("blocks a direct second worker start without creating another slot", async () => {
    const fixture = await driveTo("worker_started");
    const writes = fixture.memory.calls.length;
    await expect(
      fixture.journal.startWorker({
        ...fixture.exact,
        workerRequestHash: fixture.requestHash,
        authorizationToken: fixture.token
      })
    ).rejects.toThrow("STATE_MISMATCH");
    expect(fixture.memory.calls).toHaveLength(writes);
  });

  it("rejects expired/self-authenticated claims, cap drift, proxies and insecure metadata", async () => {
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memoryPorts().ports);
    const selfDigest = hex32("4");
    for (const request of [
      claim({ expiresAt: NOW }),
      claim({ expiresAt: "2026-08-13T10:00:45.001Z" }),
      claim({ expiresAt: "2026-08-13T10:05:00.000Z" }),
      claim({ authorizedAt: "2026-08-13T10:00:40.000Z", expiresAt: "2026-08-13T10:00:35.000Z" }),
      claim({ reviewerApprovalDigest: selfDigest, ownerAuthorizationDigest: selfDigest }),
      claim({ maxCostWei: "999" }),
      claim({ gasLimit: "6000001" })
    ]) {
      await expect(journal.claimExactInitialization(request)).rejects.toThrow("INPUT_INVALID");
    }

    let trapCalls = 0;
    const proxy = new Proxy(claim(), {
      get() {
        trapCalls += 1;
        throw new Error("trap");
      }
    });
    await expect(journal.claimExactInitialization(proxy)).rejects.toThrow("INPUT_INVALID");
    expect(trapCalls).toBe(0);

    const insecure = memoryPorts();
    const insecureJournal = createBscTestnetPtaWbnbPoolLocalJournalCore({
      ...insecure.ports,
      assertSecure: async () => ({
        verified: true,
        ownerSid: "S-1-5-21-1",
        accessRulesProtected: false,
        currentUserOnlyFullControl: true,
        checkedPaths: 1
      })
    });
    await expect(insecureJournal.readState()).resolves.toMatchObject({
      status: "unknown_outcome"
    });
  });

  it("keeps the Windows adapter fixed, env-free, and validates ancestors before ACL mutation", () => {
    expect(SOURCE).not.toContain("process.env");
    expect(SOURCE).toContain("GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)");
    expect(SOURCE).toContain('"bsc-testnet-pta-wbnb-pool-v1"');
    expect(SOURCE).toContain('"bsc-testnet-pta-wbnb-pool-v2"');
    const validation = SOURCE.indexOf(
      "# All ancestors have been validated before the first ACL mutation."
    );
    const directoryAclWrite = SOURCE.indexOf("[IO.Directory]::SetAccessControl($cursor");
    expect(validation).toBeGreaterThan(0);
    expect(directoryAclWrite).toBeGreaterThan(validation);
    expect(SOURCE).toContain('await open(path, "wx", 0o600)');
    expect(SOURCE).toContain("await handle.sync()");
    expect(SOURCE).toContain("retained.nlink !== 1n");
    expect(SOURCE).toContain("before.ctimeNs !== after.ctimeNs");
    expect(SOURCE).toContain("before.birthtimeNs !== after.birthtimeNs");
    expect(SOURCE).toContain("before.mode !== after.mode");
    expect(SOURCE).toContain("before.nlink !== after.nlink");
    expect(SOURCE).toContain("after.nlink !== 1n");
    const readOnlyStart = SOURCE.indexOf("const LOCAL_APPLICATION_DATA_READ_ONLY_PROBE_SCRIPT");
    const provisioningStart = SOURCE.indexOf("const LOCAL_APPLICATION_DATA_PROBE_SCRIPT");
    const readOnlyScript = SOURCE.slice(readOnlyStart, provisioningStart);
    const protectRecordStart = SOURCE.indexOf("const PROTECT_RECORD_SCRIPT");
    const provisioningScript = SOURCE.slice(provisioningStart, protectRecordStart);
    expect(readOnlyStart).toBeGreaterThan(0);
    expect(provisioningStart).toBeGreaterThan(readOnlyStart);
    expect(protectRecordStart).toBeGreaterThan(provisioningStart);
    expect(readOnlyScript).not.toMatch(/New-Item|SetAccessControl|Remove-Item/u);
    expect(provisioningScript).toContain("01-claim.v2.json");
    expect(provisioningScript).not.toContain("01-claim.v1.json");
  });
});

describe.runIf(process.platform === "win32")("read-only Windows signing recovery probe", () => {
  it("exposes narrow generation-specific restart facades and accepts active v2 slots", async () => {
    const legacyDirectory = await createSyntheticDirectory();
    const activeDirectory = await createSyntheticDirectory();
    try {
      const legacyPath = win32.join(legacyDirectory, "01-claim.v1.json");
      await writeFile(legacyPath, LEGACY_CLAIM_RECORD, { encoding: "utf8", flag: "wx" });
      await protectSynthetic(legacyPath);
      const legacy =
        await openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(
          legacyDirectory
        );
      expect(legacy.status).toBe("opened");
      if (legacy.status !== "opened") throw new TypeError("legacy fixture did not open");
      expect(Object.keys(legacy.journal).sort()).toEqual(
        [
          "fenceClaimBeforeWorker",
          "readClaimOnlyRecoveryCandidate",
          "readState",
          "readStrictRecoveryState"
        ].sort()
      );
      expect("authorizeWorker" in legacy.journal).toBe(false);
      expect("claimExactInitialization" in legacy.journal).toBe(false);

      const recovery = Object.freeze({
        generation: 2 as const,
        predecessorState: "superseded_before_worker" as const,
        predecessorFenceSha256: hex32("9"),
        attemptId: hex32("a")
      });
      const activeMemory = memoryPorts();
      await createBscTestnetPtaWbnbPoolLocalJournalCore(
        activeMemory.ports,
        2
      ).claimExactInitialization(claim(recovery));
      const activeContent = activeMemory.files.get("01-claim.v2.json");
      if (activeContent === undefined) throw new TypeError("active v2 fixture was not created");
      const activePath = win32.join(activeDirectory, "01-claim.v2.json");
      await writeFile(activePath, activeContent, { encoding: "utf8", flag: "wx" });
      await protectSynthetic(activePath);
      const active =
        await openExistingWindowsBscTestnetPtaWbnbPoolActiveLocalJournalAtSyntheticDirectoryForTests(
          activeDirectory
        );
      expect(active.status).toBe("opened");
      if (active.status !== "opened") throw new TypeError("active fixture did not open");
      expect(active.state).toMatchObject({ status: "claimed", generation: 2 });
      expect(Object.keys(active.journal).sort()).toEqual(
        ["readState", "readStrictRecoveryState"].sort()
      );
      expect("claimExactInitialization" in active.journal).toBe(false);
      expect("authorizeWorker" in active.journal).toBe(false);
    } finally {
      await cleanupSyntheticDirectory(legacyDirectory);
      await cleanupSyntheticDirectory(activeDirectory);
    }
  }, 45_000);

  it("reports an empty existing directory without changing bytes, metadata, or ACL", async () => {
    const directory = await createSyntheticDirectory();
    try {
      const before = await snapshotSyntheticTree(directory);
      await expect(
        openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(directory)
      ).resolves.toMatchObject({ status: "absent", state: { status: "empty" } });
      expect(await snapshotSyntheticTree(directory)).toEqual(before);
    } finally {
      await cleanupSyntheticDirectory(directory);
    }
  }, 30_000);

  it("blocks partial/mismatched files and hard links without changing retained state", async () => {
    for (const names of [["01-claim.v1.json"], ["02-transition.v1.json"]] as const) {
      const directory = await createSyntheticDirectory();
      try {
        for (const name of names) {
          const path = win32.join(directory, name);
          await writeFile(path, '{"partial":true}', { encoding: "utf8", flag: "wx" });
          await protectSynthetic(path);
        }
        const before = await snapshotSyntheticTree(directory);
        await expect(
          openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toMatchObject({ status: "blocked", state: null });
        expect(await snapshotSyntheticTree(directory)).toEqual(before);
      } finally {
        await cleanupSyntheticDirectory(directory);
      }
    }

    const directory = await createSyntheticDirectory();
    try {
      const first = win32.join(directory, "01-claim.v1.json");
      await writeFile(first, '{"partial":true}', { encoding: "utf8", flag: "wx" });
      await protectSynthetic(first);
      await link(first, win32.join(directory, "02-transition.v1.json"));
      const before = await snapshotSyntheticTree(directory);
      await expect(
        openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(directory)
      ).resolves.toMatchObject({ status: "blocked", state: null });
      expect(await snapshotSyntheticTree(directory)).toEqual(before);
    } finally {
      await cleanupSyntheticDirectory(directory);
    }
  }, 45_000);

  it("blocks a reparse-point child without following or mutating it", async () => {
    const directory = await createSyntheticDirectory();
    const target = await createSyntheticDirectory();
    try {
      await symlink(target, win32.join(directory, "01-claim.v1.json"), "junction");
      const before = await snapshotSyntheticTree(directory);
      await expect(
        openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(directory)
      ).resolves.toMatchObject({ status: "blocked", state: null });
      expect(await snapshotSyntheticTree(directory)).toEqual(before);
    } finally {
      await cleanupSyntheticDirectory(directory);
      await cleanupSyntheticDirectory(target);
    }
  }, 30_000);
});
