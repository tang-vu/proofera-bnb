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
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  createBscTestnetPtaWbnbPoolLocalJournalCore,
  deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256,
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests,
  type BscTestnetPtaWbnbPoolClaimRequest,
  type BscTestnetPtaWbnbPoolLocalJournalPorts
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

function claim(overrides: Partial<BscTestnetPtaWbnbPoolClaimRequest> = {}) {
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

function workerExchange(request: BscTestnetPtaWbnbPoolClaimRequest, token: Hex) {
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
      schemaVersion: 1 as const,
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

function memoryPorts(initial: Readonly<Record<string, string>> = {}) {
  const files = new Map(Object.entries(initial));
  const calls: string[] = [];
  const ports: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
    now: () => new Date(NOW),
    listNames: async () => Object.freeze([...files.keys()].sort()),
    readBounded: async (name: string) => files.get(name) ?? null,
    createExclusive: async (name: string, content: string) => {
      calls.push(name);
      if (files.has(name)) return "exists" as const;
      files.set(name, content);
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

function binding(request: BscTestnetPtaWbnbPoolClaimRequest) {
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
      gasLimit: request.gasLimit,
      gasPriceWei: request.gasPriceWei,
      maxCostWei: request.maxCostWei,
      authorizedAt: request.authorizedAt,
      expiresAt: request.expiresAt,
      serializedTransaction: null,
      transactionHash: null
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
    expect(SOURCE).toContain('["ProofEra", "operations", "bsc-testnet-pta-wbnb-pool-v1"] as const');
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
    expect(readOnlyStart).toBeGreaterThan(0);
    expect(provisioningStart).toBeGreaterThan(readOnlyStart);
    expect(readOnlyScript).not.toMatch(/New-Item|SetAccessControl|Remove-Item/u);
  });
});

describe.runIf(process.platform === "win32")("read-only Windows signing recovery probe", () => {
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
