import { createCipheriv, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  getAddress,
  keccak256,
  numberToHex,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
  type Hex,
  type TransactionSerialized
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction,
  buildBscTestnetPtaWbnbPoolSigningWorkerRequest,
  type BscTestnetPtaWbnbPoolSigningWorkerRequest,
  type BscTestnetPtaWbnbPoolSigningWorkerResponse,
  type BscTestnetPtaWbnbPoolValidatedSigningIntent
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";
import {
  authenticateBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse,
  createBscTestnetPtaWbnbPoolProductionWorkerIssuerForInternalUse,
  createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse,
  createWindowsBscTestnetPtaWbnbPoolSigningWorker,
  isBscTestnetPtaWbnbPoolSigningDeadlineCurrentForInternalUse,
  reconstructExactBscTestnetPtaWbnbPoolRfc6979TransactionForInternalUse,
  signExactBscTestnetPtaWbnbPoolEncryptedStoreForInternalUse,
  signExactBscTestnetPtaWbnbPoolEncryptedStoreWithExpectedSignerForInternalUse,
  inspectExactBscTestnetPtaWbnbPoolSignedTransactionForInternalUse,
  type BscTestnetPtaWbnbPoolExactSigningTransaction
} from "./bsc-testnet-pta-wbnb-pool-signing-worker";

const SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-signing-worker.ts", import.meta.url),
  "utf8"
);
const WINDOWS_CUSTODY_SOURCE = readFileSync(
  new URL("./bsc-testnet-deployer-custody-windows.server.ts", import.meta.url),
  "utf8"
);
const CLI_SOURCE = readFileSync(
  new URL("../../../scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts", import.meta.url),
  "utf8"
);
const PHASE_ZERO_SOURCE = readFileSync(
  new URL("../../../scripts/run-bsc-testnet-pta-wbnb-pool-phase0.mjs", import.meta.url),
  "utf8"
);
const ROOT_PACKAGE = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
) as Readonly<{ scripts?: Readonly<Record<string, unknown>> }>;
const SYNTHETIC_PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const SECP256K1_HALF_ORDER =
  BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141") / 2n;
const NOW = "2026-08-13T05:00:10.000Z";
const RELEASE_COMMIT = "70".repeat(20);
const RUNTIME_MANIFEST_SHA256 = `0x${"22".repeat(32)}` as const;
const RFC6979_KAT_TRANSACTION_HASH =
  "0x5fb4c8d0538d62767b9108d2344b400f666fb67e4c38c8b0eeace73fcd61f363";

function exactTransaction(
  overrides: Partial<BscTestnetPtaWbnbPoolExactSigningTransaction> = {}
): BscTestnetPtaWbnbPoolExactSigningTransaction {
  return Object.freeze({
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    gasLimit: 5_983_857n,
    gasPriceWei: 100_000_000n,
    nonce: 1n,
    signingNotAfterMilliseconds: Date.now() + 60_000,
    ...overrides
  });
}

function syntheticEncryptedStore(
  privateKey: Hex = SYNTHETIC_PRIVATE_KEY
): Readonly<{ password: Buffer; store: Buffer }> {
  const password = Buffer.alloc(48, 0x42);
  const salt = Buffer.alloc(32, 0x22);
  const iv = Buffer.alloc(16, 0x33);
  const privateKeyBytes = Buffer.from(privateKey.slice(2), "hex");
  const derivedKey = scryptSync(password, salt, 32, {
    N: 131_072,
    maxmem: 256 * 1024 * 1024,
    p: 1,
    r: 8
  });
  const cipher = createCipheriv("aes-128-ctr", derivedKey.subarray(0, 16), iv);
  const cipherText = Buffer.concat([cipher.update(privateKeyBytes), cipher.final()]);
  const macMaterial = Buffer.concat([derivedKey.subarray(16, 32), cipherText]);
  const mac = keccak256(macMaterial).slice(2);
  const store = Buffer.from(
    JSON.stringify({
      address: privateKeyToAccount(privateKey).address.slice(2).toLowerCase(),
      crypto: {
        cipher: "aes-128-ctr",
        cipherparams: { iv: iv.toString("hex") },
        ciphertext: cipherText.toString("hex"),
        kdf: "scrypt",
        kdfparams: {
          dklen: 32,
          n: 131_072,
          p: 1,
          r: 8,
          salt: salt.toString("hex")
        },
        mac
      },
      id: "11111111-1111-4111-8111-111111111111",
      version: 3
    }),
    "utf8"
  );
  derivedKey.fill(0);
  privateKeyBytes.fill(0);
  cipherText.fill(0);
  macMaterial.fill(0);
  return Object.freeze({ password, store });
}

function reviewedWorkerRequest() {
  const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: "5983857",
    gasPriceWei: "100000000",
    sourceEnvelopeHash: `0x${"33".repeat(32)}`
  });
  if (transaction === null) throw new Error("The exact transaction fixture did not validate.");
  const intent: BscTestnetPtaWbnbPoolValidatedSigningIntent = Object.freeze({
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: transaction.sourceEnvelopeHash,
    reviewerApprovalDigest: `0x${"44".repeat(32)}`,
    ownerAuthorizationDigest: `0x${"55".repeat(32)}`,
    claimId: "claim-pool-test-001",
    journalClaimToken: `0x${"66".repeat(32)}`,
    releaseCommit: RELEASE_COMMIT,
    runtimeManifestSha256: RUNTIME_MANIFEST_SHA256,
    authenticatedAt: "2026-08-13T05:00:00.000Z",
    expiresAt: "2026-08-13T05:00:30.000Z",
    transaction
  });
  return buildBscTestnetPtaWbnbPoolSigningWorkerRequest(intent);
}

function releaseTrust() {
  return Object.freeze({
    schemaVersion: 1 as const,
    releaseCommit: RELEASE_COMMIT,
    originReference: "refs/remotes/origin/main" as const,
    cleanPublishedHead: true as const,
    workerSourceSha256: `0x${"77".repeat(32)}` as const,
    runtimeManifestSha256: RUNTIME_MANIFEST_SHA256
  });
}

function syntheticAttestedResponse(
  request: BscTestnetPtaWbnbPoolSigningWorkerRequest,
  raw: Hex = "0x01"
): BscTestnetPtaWbnbPoolSigningWorkerResponse {
  return Object.freeze({
    schemaVersion: request.schemaVersion,
    operation: request.operation,
    status: "signed" as const,
    oneShotIntentId: request.oneShotIntentId,
    operationKey: request.operationKey,
    claimId: request.claimId,
    journalClaimToken: request.journalClaimToken,
    releaseCommit: request.releaseCommit,
    runtimeManifestSha256: request.runtimeManifestSha256,
    requestHash: request.requestHash,
    signingHash: request.transaction.signingHash,
    signedTransaction: raw,
    transactionHash: keccak256(raw)
  });
}

function workerPorts(
  overrides: Partial<{
    now: () => Date;
    inspectReleaseTrust: () => Promise<ReturnType<typeof releaseTrust>>;
    consumeWorkerAuthorization: () => Promise<Readonly<{ status: "worker_started" }>>;
    commitSignedTransaction: () => Promise<Readonly<{ status: "signed_committed" }>>;
    attestExactTransaction: (
      raw: Hex,
      request: BscTestnetPtaWbnbPoolSigningWorkerRequest
    ) => Promise<BscTestnetPtaWbnbPoolSigningWorkerResponse | null>;
    signExactTransaction: () => Promise<Hex>;
  }> = {}
) {
  return Object.freeze({
    now: () => new Date(NOW),
    inspectReleaseTrust: async () => releaseTrust(),
    consumeWorkerAuthorization: async () => Object.freeze({ status: "worker_started" as const }),
    commitSignedTransaction: async () => Object.freeze({ status: "signed_committed" as const }),
    attestExactTransaction: async (raw: Hex, request: BscTestnetPtaWbnbPoolSigningWorkerRequest) =>
      syntheticAttestedResponse(request, raw),
    signExactTransaction: async () => "0x01" as Hex,
    ...overrides
  });
}

function canonicalBytes(request: BscTestnetPtaWbnbPoolSigningWorkerRequest): Buffer {
  return Buffer.from(JSON.stringify(request), "utf8");
}

async function signSyntheticExact(
  privateKey: Hex,
  overrides: Partial<{
    chainId: number;
    data: Hex;
    gas: bigint;
    gasPrice: bigint;
    nonce: number;
    to: Hex;
    value: bigint;
  }> = {}
): Promise<Hex> {
  return privateKeyToAccount(privateKey).signTransaction({
    chainId: 97,
    data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
    gas: 5_983_857n,
    gasPrice: 100_000_000n,
    nonce: 1,
    to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
    type: "legacy",
    value: 0n,
    ...overrides
  });
}

describe("PTA/WBNB exact pool signing worker cryptography", () => {
  it("byte-binds every production authority source loaded before custody", () => {
    expect(SOURCE).toContain(
      '"packages/integrations/src/bsc-testnet-pta-wbnb-pool-authorization.server.ts"'
    );
    expect(SOURCE).toContain(
      '"packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-boundary.server.ts"'
    );
    expect(SOURCE).toContain(
      '"packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-authority.server.ts"'
    );
    expect(SOURCE).toContain('"packages/integrations/src/bsc-testnet-pta-deployment-envelope.ts"');
    expect(SOURCE).toContain(
      '"packages/integrations/src/bsc-testnet-pta-one-shot-worker-protocol.ts"'
    );
    expect(SOURCE).toContain('"packages/integrations/src/bsc-testnet-pta-unsigned-transaction.ts"');
    expect(SOURCE).toContain('"scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts" as const');
    expect(SOURCE).toContain('"scripts/typescript-extension-loader.mjs" as const');
    expect(SOURCE).toContain('"scripts/run-bsc-testnet-pta-wbnb-pool-phase0.mjs" as const');
    expect(SOURCE).toContain('"scripts/run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1"');
    expect(SOURCE).toContain('".gitattributes"');
    expect(SOURCE).not.toContain('"packages/domain/src/index.ts"');
  });

  it("admits only the phase-minus-one scrubber before phase zero and the exact child stack", () => {
    expect(ROOT_PACKAGE.scripts?.["initialize:pta-wbnb:testnet"]).toBe(
      "node -e \"process.stderr.write('Blocked: use the audited phase-minus-one command in docs/deployment.md.');process.exit(1)\""
    );
    expect(PHASE_ZERO_SOURCE).toContain('const PINNED_NODE_EXECUTABLE = "D:\\\\Node\\\\node.exe"');
    expect(PHASE_ZERO_SOURCE).toContain("async function assertPhaseZeroReadOnlyRelease(expected)");
    expect(PHASE_ZERO_SOURCE).toContain("assertPinnedExternalRuntimeTrees()");
    expect(PHASE_ZERO_SOURCE).toContain('GIT_NO_REPLACE_OBJECTS: "1"');
    expect(SOURCE).toContain('GIT_NO_REPLACE_OBJECTS: "1"');
    expect(PHASE_ZERO_SOURCE).toContain('stdio: "inherit"');
    expect(PHASE_ZERO_SOURCE).toContain("shell: false");
    expect(PHASE_ZERO_SOURCE).not.toMatch(/from\s+["'](?!node:)/u);
    expect(CLI_SOURCE).toContain("FORBIDDEN_ENVIRONMENT_NAMES");
    expect(CLI_SOURCE).toContain("hasExactProductionEnvironment()");
    expect(CLI_SOURCE).toContain("actualNames.length === expectedNames.length");
    expect(CLI_SOURCE).toContain('"--conditions=react-server"');
    expect(CLI_SOURCE).toContain('"--experimental-loader"');
    expect(CLI_SOURCE).toContain("execArgv.length === EXPECTED_EXEC_ARGV.length");
    expect(CLI_SOURCE).toContain('"--runtime-manifest-sha256"');
    expect(CLI_SOURCE).toContain("stablePinnedFileSha256(execPath");
    expect(CLI_SOURCE).toContain("stablePinnedFileSha256(LOADER_PATH");
    expect(CLI_SOURCE).not.toMatch(
      /import\s+\{\s*runBscTestnetPtaWbnbPoolProductionOnceFromStdin/u
    );
    const bootstrapIndex = CLI_SOURCE.indexOf("assertExactProductionBootstrap();");
    const dynamicImportIndex = CLI_SOURCE.indexOf(
      'await import("../packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-runner.server")'
    );
    expect(bootstrapIndex).toBeGreaterThan(0);
    expect(dynamicImportIndex).toBeGreaterThan(bootstrapIndex);
    expect(SOURCE).toContain("process.execArgv");
    expect(SOURCE).toContain("FORBIDDEN_PRODUCTION_ENVIRONMENT_NAMES");
    expect(SOURCE).toContain("hasExactProductionEnvironment()");
    expect(PHASE_ZERO_SOURCE).toContain('PATH: "C:\\\\Windows\\\\System32"');
    expect(PHASE_ZERO_SOURCE).toContain('USERPROFILE: "C:\\\\Users\\\\tangm"');
    expect(SOURCE).toContain("releaseIdentityMatchesExpectedProductionArguments");
  });

  it("reconstructs the exact deterministic low-S EIP-155 legacy transaction", async () => {
    const transaction = exactTransaction({ signingNotAfterMilliseconds: 9_000_000_000_000_000 });
    const firstScalar = Buffer.from(SYNTHETIC_PRIVATE_KEY.slice(2), "hex");
    const secondScalar = Buffer.from(SYNTHETIC_PRIVATE_KEY.slice(2), "hex");
    const first = reconstructExactBscTestnetPtaWbnbPoolRfc6979TransactionForInternalUse(
      firstScalar,
      transaction
    );
    const second = reconstructExactBscTestnetPtaWbnbPoolRfc6979TransactionForInternalUse(
      secondScalar,
      transaction
    );
    const expected = await privateKeyToAccount(SYNTHETIC_PRIVATE_KEY).signTransaction({
      chainId: 97,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      gas: transaction.gasLimit,
      gasPrice: transaction.gasPriceWei,
      nonce: 1,
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      type: "legacy",
      value: 0n
    });

    expect(first).toBe(second);
    expect(first).toBe(expected);
    expect([...firstScalar]).toEqual(new Array(32).fill(0));
    expect([...secondScalar]).toEqual(new Array(32).fill(0));

    const parsed = parseTransaction(first);
    expect(parsed).toMatchObject({
      chainId: 97,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
      gas: transaction.gasLimit,
      gasPrice: transaction.gasPriceWei,
      nonce: 1,
      type: "legacy"
    });
    expect(getAddress(parsed.to ?? "0x0000000000000000000000000000000000000000")).toBe(
      BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER
    );
    expect(parsed.value ?? 0n).toBe(0n);
    expect(BigInt(parsed.s ?? "0x0")).toBeLessThanOrEqual(SECP256K1_HALF_ORDER);
    await expect(
      recoverTransactionAddress({ serializedTransaction: first as TransactionSerialized })
    ).resolves.toBe(getAddress(privateKeyToAccount(SYNTHETIC_PRIVATE_KEY).address));
    expect(keccak256(first as Hex)).toBe(RFC6979_KAT_TRANSACTION_HASH);
  });

  it("fails closed on transaction drift and still clears the owned scalar", () => {
    const scalar = Buffer.from(SYNTHETIC_PRIVATE_KEY.slice(2), "hex");
    const drifted = exactTransaction({ gasLimit: 6_000_001n });
    expect(() =>
      reconstructExactBscTestnetPtaWbnbPoolRfc6979TransactionForInternalUse(scalar, drifted)
    ).toThrow("failed closed");
    expect([...scalar]).toEqual(new Array(32).fill(0));
  });

  it("decrypts a synthetic Web3 V3 store only inside the exact-purpose seam and clears inputs", async () => {
    const fixture = syntheticEncryptedStore();
    await expect(
      signExactBscTestnetPtaWbnbPoolEncryptedStoreForInternalUse(
        fixture.store,
        fixture.password,
        exactTransaction()
      )
    ).rejects.toThrow("failed closed");
    expect([...fixture.store]).toEqual(new Array(fixture.store.byteLength).fill(0));
    expect([...fixture.password]).toEqual(new Array(48).fill(0));
  });

  it("uses a strict deadline and contains no RPC, broadcast, log, env, or arbitrary-target surface", async () => {
    const transaction = exactTransaction({ signingNotAfterMilliseconds: 10_000 });
    expect(isBscTestnetPtaWbnbPoolSigningDeadlineCurrentForInternalUse(transaction, 9_999)).toBe(
      true
    );
    expect(isBscTestnetPtaWbnbPoolSigningDeadlineCurrentForInternalUse(transaction, 10_000)).toBe(
      false
    );
    expect(SOURCE).toContain("extraEntropy: false");
    expect(SOURCE).toContain("lowS: true");
    expect(SOURCE.match(/process\s*\.\s*env/gu)).toHaveLength(3);
    expect(SOURCE.match(/process\s*\.\s*argv/gu)).toHaveLength(1);
    expect(SOURCE).not.toMatch(/\bfetch\s*\(/u);
    expect(SOURCE).not.toMatch(/\bconsole\./u);
    expect(SOURCE).not.toMatch(/eth_sendRawTransaction|eth_sendTransaction/u);
    expect(SOURCE).not.toMatch(/"node:(?:http|https|net|tls|dgram)"/u);
    expect(SOURCE).not.toMatch(/\bWebSocket\b/u);
    expect(createWindowsBscTestnetPtaWbnbPoolSigningWorker.length).toBe(0);
    expect(SOURCE).toContain("consumeWorkerAuthorization(validated.request)");
    expect(SOURCE).toContain("commitSignedTransaction(validated.request, attested)");
    await expect(createWindowsBscTestnetPtaWbnbPoolSigningWorker()).rejects.toThrow(
      "failed closed"
    );
    expect(SOURCE).toContain('"PRODUCTION_AUTHORIZATION_UNAVAILABLE"');
    const hardBlockedFactoryMarker =
      "export async function createWindowsBscTestnetPtaWbnbPoolSigningWorker";
    const factorySource = SOURCE.slice(SOURCE.indexOf(hardBlockedFactoryMarker));
    expect(factorySource).not.toMatch(
      /createWindowsBscTestnetPtaWbnbPoolLocalJournal|nativeWindowsSignExactPoolTransaction|consumeWorkerAuthorization|commitWorkerSignedTransaction/u
    );
  });

  it("keeps the native production worker unavailable even with forged capabilities and callbacks", () => {
    const consumeWorkerAuthorization = vi.fn();
    const commitWorkerSignedTransaction = vi.fn();
    const issuer = createBscTestnetPtaWbnbPoolProductionWorkerIssuerForInternalUse();

    expect(() =>
      issuer.issue(Object.freeze(Object.create(null) as object), {
        consumeWorkerAuthorization,
        commitWorkerSignedTransaction
      })
    ).toThrow("failed closed");
    expect(consumeWorkerAuthorization).not.toHaveBeenCalled();
    expect(commitWorkerSignedTransaction).not.toHaveBeenCalled();
  });

  it("keeps native preparation read-only until its own ceremony command activates custody", () => {
    const nativeMarker =
      "export async function createWindowsBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse";
    const nativeSource = SOURCE.slice(
      SOURCE.indexOf(nativeMarker),
      SOURCE.indexOf("/** Non-executable production boundary", SOURCE.indexOf(nativeMarker))
    );
    const activationIndex = nativeSource.indexOf("const activateAfterCeremony = async");
    const invocationIndex = nativeSource.indexOf(
      "await assertExactBscTestnetPtaWbnbPoolProductionInvocation()"
    );
    const releaseIndex = nativeSource.indexOf(
      "await inspectBscTestnetPtaWbnbPoolExactReleaseIdentityForInternalUse()"
    );
    const custodyIndex = nativeSource.indexOf(
      "await assertFixedWindowsBscTestnetPtaWbnbPoolCustodyMetadataForInternalUse()"
    );
    const journalIndex = nativeSource.indexOf(
      "await createWindowsBscTestnetPtaWbnbPoolLocalJournal()"
    );
    expect(activationIndex).toBeGreaterThan(0);
    expect(invocationIndex).toBeGreaterThan(0);
    expect(releaseIndex).toBeGreaterThan(invocationIndex);
    expect(custodyIndex).toBeGreaterThan(activationIndex);
    expect(journalIndex).toBeGreaterThan(custodyIndex);
    expect(nativeSource).toContain(
      "const localCustodyPathAclCapability = Object.freeze(Object.create(null) as object)"
    );
    expect(nativeSource).toContain("const ceremonyCommands = new WeakMap<object");
    expect(nativeSource).toContain("ceremonyCommands.get(command) !== descriptor");
    expect(nativeSource).toContain(
      "issuer.reserveExecutionCapabilityForWorker(candidateCapability)"
    );
    const durableIndex = nativeSource.indexOf(
      "await signingJournal.consumeWorkerAuthorization(request)"
    );
    const authorityIndex = nativeSource.indexOf(
      "issuer.consumeExecutionCapabilityAfterDurableStart(candidateCapability, request)"
    );
    expect(durableIndex).toBeGreaterThan(0);
    expect(authorityIndex).toBeGreaterThan(durableIndex);
    expect(nativeSource).not.toContain("authenticateExecutionCapability:");
    expect(nativeSource).not.toMatch(/process\s*\.\s*(?:env|argv)/u);
    expect(
      authenticateBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse(Object.freeze({}))
    ).toBe(false);
  });

  it("keeps every pre-activation custody check metadata-only and places unlock behind durable start", () => {
    const metadataProbeMarker =
      "export const probeWindowsBscTestnetDeployerCustodyMetadataForInternalUse";
    const fullProbeMarker = "export const probeWindowsBscTestnetDeployerCustody:";
    const metadataProbeIndex = WINDOWS_CUSTODY_SOURCE.indexOf(metadataProbeMarker);
    const fullProbeIndex = WINDOWS_CUSTODY_SOURCE.indexOf(fullProbeMarker);
    expect(metadataProbeIndex).toBeGreaterThan(0);
    expect(fullProbeIndex).toBeGreaterThan(metadataProbeIndex);

    const metadataOnlySource = WINDOWS_CUSTODY_SOURCE.slice(metadataProbeIndex, fullProbeIndex);
    expect(metadataOnlySource).toContain("const paths = await inspectPaths(configuration)");
    expect(metadataOnlySource).toContain("await assertExactLocalAcl(configuration, paths, signal)");
    expect(metadataOnlySource).toContain("const finalPaths = await inspectPaths(configuration)");
    expect(metadataOnlySource).toContain(
      "await assertExactLocalAcl(configuration, finalPaths, signal)"
    );
    expect(metadataOnlySource).not.toMatch(
      /assertFinalCustodyState|readAndVerifyPinnedArtifacts|readBoundedStableRegularFile|\bopen\s*\(|\.readFile\s*\(|sha256Hex|createHash|createDecipheriv|scrypt\s*\(|DPAPI_UNPROTECT_SCRIPT|unprotectCurrentUser|unlockBscTestnetDeployerEncryptedStore|secretScalar/u
    );

    const poolMetadataMarker =
      "export async function assertFixedWindowsBscTestnetPtaWbnbPoolCustodyMetadataForInternalUse";
    const poolMetadataIndex = SOURCE.indexOf(poolMetadataMarker);
    const poolMetadataEndIndex = SOURCE.indexOf("function executePinnedGit", poolMetadataIndex);
    const poolMetadataSource = SOURCE.slice(poolMetadataIndex, poolMetadataEndIndex);
    expect(poolMetadataSource).toContain(
      "probeWindowsBscTestnetDeployerCustodyMetadataForInternalUse("
    );
    expect(poolMetadataSource).not.toMatch(
      /probeWindowsBscTestnetDeployerCustody\s*\(|readAndVerifyPinnedCustody|readStableFile|\bopen\s*\(|\.readFile\s*\(|sha256Hex|createHash|createDecipheriv|scrypt\s*\(|DPAPI_UNPROTECT_SCRIPT|assertReadyCustody|secretScalar/u
    );

    const activationMarker = "const activateAfterCeremony = async";
    const journalMarker = "await createWindowsBscTestnetPtaWbnbPoolLocalJournal()";
    const activationIndex = SOURCE.indexOf(activationMarker);
    const journalIndex = SOURCE.indexOf(journalMarker, activationIndex);
    const preJournalActivationSource = SOURCE.slice(activationIndex, journalIndex);
    expect(preJournalActivationSource).toContain(
      "await assertFixedWindowsBscTestnetPtaWbnbPoolCustodyMetadataForInternalUse()"
    );
    expect(preJournalActivationSource).not.toMatch(
      /probeWindowsBscTestnetDeployerCustody\s*\(|readAndVerifyPinnedArtifacts|readBoundedStableRegularFile|\bopen\s*\(|\.readFile\s*\(|DPAPI_UNPROTECT_SCRIPT|unprotectCurrentUser|unlockBscTestnetDeployerEncryptedStore|secretScalar/u
    );

    const workerMarker = "export function createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse";
    const workerIndex = SOURCE.indexOf(workerMarker);
    const durableStartIndex = SOURCE.indexOf(
      "await ports.consumeWorkerAuthorization(validated.request)",
      workerIndex
    );
    const custodySignIndex = SOURCE.indexOf(
      "await ports.signExactTransaction(validated.transaction)",
      workerIndex
    );
    expect(durableStartIndex).toBeGreaterThan(workerIndex);
    expect(custodySignIndex).toBeGreaterThan(durableStartIndex);

    const nativeSignerMarker = "async function nativeWindowsSignExactPoolTransaction(";
    const nativeSignerIndex = SOURCE.indexOf(nativeSignerMarker);
    const nativeSignerEndIndex = SOURCE.indexOf(poolMetadataMarker, nativeSignerIndex);
    const nativeSignerSource = SOURCE.slice(nativeSignerIndex, nativeSignerEndIndex);
    expect(nativeSignerSource).toContain("await assertReadyCustody(custody, signal)");
    expect(nativeSignerSource).toContain("DPAPI_UNPROTECT_SCRIPT");
    expect(nativeSignerSource).toContain(
      "await signExactBscTestnetPtaWbnbPoolEncryptedStoreForInternalUse("
    );
    expect(SOURCE).toContain("signExactTransaction: nativeWindowsSignExactPoolTransaction");
  });

  it("binds broadcast authority to the exact successfully returned worker attestation", () => {
    const nativeMarker =
      "export async function createWindowsBscTestnetPtaWbnbPoolNativeProductionBridgeForInternalUse";
    const nativeSource = SOURCE.slice(
      SOURCE.indexOf(nativeMarker),
      SOURCE.indexOf("/** Non-executable production boundary", SOURCE.indexOf(nativeMarker))
    );
    expect(nativeSource).toContain(
      "let successfulSigningRequest: BscTestnetPtaWbnbPoolSigningWorkerRequest | null = null"
    );
    expect(nativeSource).toContain(
      "let successfulSigningResponse: BscTestnetPtaWbnbPoolSigningWorkerResponse | null = null"
    );
    expect(nativeSource).toContain("successfulSigningResponse = durablyCommittedResponse");
    const localMatchIndex = nativeSource.indexOf("exactBroadcastMatchesSuccessfulSigning(");
    const delegatedIndex = nativeSource.indexOf(
      "issuer.consumeExactBroadcastAuthorizationAfterDurableStart("
    );
    expect(localMatchIndex).toBeGreaterThan(0);
    expect(delegatedIndex).toBeGreaterThan(localMatchIndex);
    expect(nativeSource).toContain("nativeActivatedProductionBridges.add(bridge)");
  });

  it("durably starts before custody unlock/sign and refuses a canonical transaction from any other signer", async () => {
    const order: string[] = [];
    const consumeWorkerAuthorization = vi.fn(async () => {
      order.push("durable-start");
      return Object.freeze({ status: "worker_started" as const });
    });
    const signExactTransaction = vi.fn(
      async (transaction: BscTestnetPtaWbnbPoolExactSigningTransaction) => {
        order.push("custody-unlock-and-sign");
        return privateKeyToAccount(SYNTHETIC_PRIVATE_KEY).signTransaction({
          chainId: 97,
          data: transaction.data,
          gas: transaction.gasLimit,
          gasPrice: transaction.gasPriceWei,
          nonce: 1,
          to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
          type: "legacy",
          value: 0n
        });
      }
    );
    const commitSignedTransaction = vi.fn(async () => {
      order.push("durable-commit");
      return Object.freeze({ status: "signed_committed" as const });
    });
    const worker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      Object.freeze({
        now: () => new Date(NOW),
        inspectReleaseTrust: async () => releaseTrust(),
        consumeWorkerAuthorization,
        commitSignedTransaction,
        attestExactTransaction: async () => null,
        signExactTransaction
      })
    );

    await expect(worker.invokeExactSigningWorker(reviewedWorkerRequest())).rejects.toThrow(
      "failed closed"
    );
    expect(order).toEqual(["durable-start", "custody-unlock-and-sign"]);
    expect(consumeWorkerAuthorization).toHaveBeenCalledTimes(1);
    expect(signExactTransaction).toHaveBeenCalledTimes(1);
    expect(commitSignedTransaction).not.toHaveBeenCalled();
  });

  it("makes an ambiguous durable-start attempt terminal within the worker instance", async () => {
    const consumeWorkerAuthorization = vi.fn(async () => {
      throw new Error("synthetic ambiguous durable write");
    });
    const custodyUnlockAndSign = vi.fn(async () => "0x" as Hex);
    const worker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      Object.freeze({
        now: () => new Date(NOW),
        inspectReleaseTrust: async () => releaseTrust(),
        consumeWorkerAuthorization,
        commitSignedTransaction: vi.fn(),
        attestExactTransaction: vi.fn(),
        signExactTransaction: custodyUnlockAndSign
      })
    );
    const request = reviewedWorkerRequest();
    await expect(worker.invokeExactSigningWorker(request)).rejects.toThrow("failed closed");
    await expect(worker.invokeExactSigningWorker(request)).rejects.toThrow("failed closed");
    expect(consumeWorkerAuthorization).toHaveBeenCalledTimes(1);
    expect(custodyUnlockAndSign).not.toHaveBeenCalled();
  });

  it("rejects non-canonical request key order before any durable or secret action", async () => {
    const request = reviewedWorkerRequest();
    const reordered = Buffer.from(
      JSON.stringify(
        Object.fromEntries([
          ["requestHash", request.requestHash],
          ...Object.entries(request).filter(([key]) => key !== "requestHash")
        ])
      ),
      "utf8"
    );
    const consumeWorkerAuthorization = vi.fn();
    const signExactTransaction = vi.fn();
    const worker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      Object.freeze({
        now: () => new Date(NOW),
        inspectReleaseTrust: async () => releaseTrust(),
        consumeWorkerAuthorization,
        commitSignedTransaction: vi.fn(),
        attestExactTransaction: vi.fn(),
        signExactTransaction
      })
    );
    await expect(worker.executeCanonicalStdin(reordered)).rejects.toThrow("failed closed");
    expect(consumeWorkerAuthorization).not.toHaveBeenCalled();
    expect(signExactTransaction).not.toHaveBeenCalled();
    reordered.fill(0);
  });

  it("commits the attested bytes durably before returning them", async () => {
    const order: string[] = [];
    let releaseChecks = 0;
    const worker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      workerPorts({
        inspectReleaseTrust: async () => {
          order.push(
            releaseChecks++ === 0
              ? "release-before"
              : releaseChecks === 2
                ? "release-before-commit"
                : "release-after-commit"
          );
          return releaseTrust();
        },
        consumeWorkerAuthorization: async () => {
          order.push("durable-start");
          return Object.freeze({ status: "worker_started" as const });
        },
        signExactTransaction: async () => {
          order.push("sign");
          return "0x01";
        },
        attestExactTransaction: async (raw, request) => {
          order.push("attest");
          return syntheticAttestedResponse(request, raw);
        },
        commitSignedTransaction: async () => {
          order.push("durable-commit");
          return Object.freeze({ status: "signed_committed" as const });
        }
      })
    );
    const result = await worker.invokeExactSigningWorker(reviewedWorkerRequest());
    order.push("returned");
    expect(result.signedTransaction).toBe("0x01");
    expect(order).toEqual([
      "release-before",
      "durable-start",
      "sign",
      "attest",
      "release-before-commit",
      "durable-commit",
      "release-after-commit",
      "returned"
    ]);
  });

  it("returns no signed bytes when the durable signed commit is ambiguous", async () => {
    const releaseCheck = vi.fn(async () => releaseTrust());
    const commit = vi.fn(async () => {
      throw new Error("synthetic ambiguous fsync outcome");
    });
    const worker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      workerPorts({ inspectReleaseTrust: releaseCheck, commitSignedTransaction: commit })
    );
    let returned: unknown = null;
    try {
      returned = await worker.invokeExactSigningWorker(reviewedWorkerRequest());
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
    expect(returned).toBeNull();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(releaseCheck).toHaveBeenCalledTimes(2);
  });

  it("rejects release drift both before durable start and after durable signed commit", async () => {
    const consumeBefore = vi.fn();
    const signBefore = vi.fn();
    const beforeWorker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      workerPorts({
        inspectReleaseTrust: async () =>
          Object.freeze({ ...releaseTrust(), releaseCommit: "71".repeat(20) }),
        consumeWorkerAuthorization: consumeBefore,
        signExactTransaction: signBefore
      })
    );
    await expect(beforeWorker.invokeExactSigningWorker(reviewedWorkerRequest())).rejects.toThrow(
      "failed closed"
    );
    expect(consumeBefore).not.toHaveBeenCalled();
    expect(signBefore).not.toHaveBeenCalled();

    let beforeCommitReleaseCheck = 0;
    const commitBeforeDrift = vi.fn();
    const beforeCommitWorker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      workerPorts({
        inspectReleaseTrust: async () =>
          beforeCommitReleaseCheck++ === 0
            ? releaseTrust()
            : Object.freeze({ ...releaseTrust(), runtimeManifestSha256: `0x${"89".repeat(32)}` }),
        commitSignedTransaction: commitBeforeDrift
      })
    );
    await expect(
      beforeCommitWorker.invokeExactSigningWorker(reviewedWorkerRequest())
    ).rejects.toThrow("failed closed");
    expect(commitBeforeDrift).not.toHaveBeenCalled();

    let releaseCheck = 0;
    const commitAfter = vi.fn(async () => Object.freeze({ status: "signed_committed" as const }));
    const afterWorker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      workerPorts({
        inspectReleaseTrust: async () =>
          releaseCheck++ < 2
            ? releaseTrust()
            : Object.freeze({ ...releaseTrust(), runtimeManifestSha256: `0x${"88".repeat(32)}` }),
        commitSignedTransaction: commitAfter
      })
    );
    await expect(afterWorker.invokeExactSigningWorker(reviewedWorkerRequest())).rejects.toThrow(
      "failed closed"
    );
    expect(commitAfter).toHaveBeenCalledTimes(1);
  });

  it("lets a shared durable journal reject a direct second-process replay before signing", async () => {
    let durableStarted = false;
    const consume = vi.fn(async () => {
      if (durableStarted) throw new Error("worker_started already exists");
      durableStarted = true;
      return Object.freeze({ status: "worker_started" as const });
    });
    const sign = vi.fn(async () => "0x01" as Hex);
    const first = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      workerPorts({ consumeWorkerAuthorization: consume, signExactTransaction: sign })
    );
    const second = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      workerPorts({ consumeWorkerAuthorization: consume, signExactTransaction: sign })
    );
    await expect(first.invokeExactSigningWorker(reviewedWorkerRequest())).resolves.toMatchObject({
      status: "signed"
    });
    await expect(second.invokeExactSigningWorker(reviewedWorkerRequest())).rejects.toThrow(
      "failed closed"
    );
    expect(consume).toHaveBeenCalledTimes(2);
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it("rechecks expiry before durable start and again after the terminal durable start", async () => {
    const expires = "2026-08-13T05:00:30.000Z";
    const initialExpired = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      workerPorts({ now: () => new Date(expires) })
    );
    await expect(initialExpired.invokeExactSigningWorker(reviewedWorkerRequest())).rejects.toThrow(
      "failed closed"
    );

    const afterReleaseTimes = [NOW, expires];
    const consumeAfterRelease = vi.fn();
    const afterRelease = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      workerPorts({
        now: () => new Date(afterReleaseTimes.shift() ?? expires),
        consumeWorkerAuthorization: consumeAfterRelease
      })
    );
    await expect(afterRelease.invokeExactSigningWorker(reviewedWorkerRequest())).rejects.toThrow(
      "failed closed"
    );
    expect(consumeAfterRelease).not.toHaveBeenCalled();

    const afterStartTimes = [NOW, NOW, expires];
    const consumeAfterStart = vi.fn(async () =>
      Object.freeze({ status: "worker_started" as const })
    );
    const signAfterStart = vi.fn();
    const afterStart = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
      workerPorts({
        now: () => new Date(afterStartTimes.shift() ?? expires),
        consumeWorkerAuthorization: consumeAfterStart,
        signExactTransaction: signAfterStart
      })
    );
    await expect(afterStart.invokeExactSigningWorker(reviewedWorkerRequest())).rejects.toThrow(
      "failed closed"
    );
    expect(consumeAfterStart).toHaveBeenCalledTimes(1);
    expect(signAfterStart).not.toHaveBeenCalled();
  });

  it("rejects a mutation of every request and transaction field before durable start", async () => {
    const request = reviewedWorkerRequest();
    const mutations: Array<Readonly<{ label: string; value: unknown }>> = [];
    for (const key of Object.keys(request)) {
      const mutated = JSON.parse(JSON.stringify(request)) as Record<string, unknown>;
      mutated[key] = key === "schemaVersion" ? 2 : key === "transaction" ? null : "__mutated__";
      mutations.push({ label: key, value: mutated });
    }
    for (const key of Object.keys(request.transaction)) {
      const mutated = JSON.parse(JSON.stringify(request)) as Record<string, unknown>;
      const transaction = mutated.transaction as Record<string, unknown>;
      transaction[key] = key === "eip155ReplayProtection" ? false : "__mutated__";
      mutations.push({ label: `transaction.${key}`, value: mutated });
    }
    expect(mutations).toHaveLength(
      Object.keys(request).length + Object.keys(request.transaction).length
    );
    for (const mutation of mutations) {
      const consume = vi.fn();
      const sign = vi.fn();
      const worker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
        workerPorts({ consumeWorkerAuthorization: consume, signExactTransaction: sign })
      );
      await expect(
        worker.invokeExactSigningWorker(mutation.value as never),
        mutation.label
      ).rejects.toThrow("failed closed");
      expect(consume, mutation.label).not.toHaveBeenCalled();
      expect(sign, mutation.label).not.toHaveBeenCalled();
    }
  });

  it("rejects malformed, duplicate, padded, extra-key, reordered, and proxied input", async () => {
    const request = reviewedWorkerRequest();
    const valid = JSON.stringify(request);
    const reordered = JSON.stringify(
      Object.fromEntries([
        ["requestHash", request.requestHash],
        ...Object.entries(request).filter(([key]) => key !== "requestHash")
      ])
    );
    const duplicate = valid.replace('"schemaVersion":1,', '"schemaVersion":1,"schemaVersion":1,');
    const extra = JSON.stringify({ ...request, extra: true });
    const malformedInputs: Uint8Array[] = [
      Buffer.alloc(0),
      Buffer.from("{", "utf8"),
      Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from(valid, "utf8")]),
      Buffer.from(` ${valid}`, "utf8"),
      Buffer.from(duplicate, "utf8"),
      Buffer.from(extra, "utf8"),
      Buffer.from(reordered, "utf8"),
      Buffer.alloc(32_769, 0x20)
    ];
    for (const input of malformedInputs) {
      const consume = vi.fn();
      const sign = vi.fn();
      const worker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(
        workerPorts({ consumeWorkerAuthorization: consume, signExactTransaction: sign })
      );
      await expect(worker.executeCanonicalStdin(input)).rejects.toThrow("failed closed");
      expect(consume).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      Buffer.from(input).fill(0);
    }
    const proxyRequest = new Proxy(request, {});
    const proxyWorker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(workerPorts());
    await expect(proxyWorker.invokeExactSigningWorker(proxyRequest)).rejects.toThrow(
      "failed closed"
    );
    const proxiedBytes = new Proxy(canonicalBytes(request), {});
    const bytesWorker = createBscTestnetPtaWbnbPoolSigningWorkerForInternalUse(workerPorts());
    await expect(bytesWorker.executeCanonicalStdin(proxiedBytes)).rejects.toThrow("failed closed");
  });

  it("accepts canonical short signature scalars and rejects all exact transaction drifts", async () => {
    const shortScalarKey = `0x${(18).toString(16).padStart(64, "0")}` as Hex;
    const shortAccount = privateKeyToAccount(shortScalarKey);
    const shortRaw = await signSyntheticExact(shortScalarKey);
    const shortParsed = parseTransaction(shortRaw);
    expect(Math.min(shortParsed.r?.length ?? 66, shortParsed.s?.length ?? 66)).toBeLessThan(66);
    await expect(
      inspectExactBscTestnetPtaWbnbPoolSignedTransactionForInternalUse(
        shortRaw,
        exactTransaction(),
        getAddress(shortAccount.address)
      )
    ).resolves.toMatchObject({ serializedTransaction: shortRaw });

    const exactRaw = await signSyntheticExact(SYNTHETIC_PRIVATE_KEY);
    const expectedSigner = getAddress(privateKeyToAccount(SYNTHETIC_PRIVATE_KEY).address);
    await expect(
      inspectExactBscTestnetPtaWbnbPoolSignedTransactionForInternalUse(
        exactRaw,
        exactTransaction(),
        expectedSigner
      )
    ).resolves.not.toBeNull();
    const drifts = await Promise.all([
      signSyntheticExact(SYNTHETIC_PRIVATE_KEY, { chainId: 56 }),
      signSyntheticExact(SYNTHETIC_PRIVATE_KEY, { nonce: 2 }),
      signSyntheticExact(SYNTHETIC_PRIVATE_KEY, {
        to: "0x0000000000000000000000000000000000000001"
      }),
      signSyntheticExact(SYNTHETIC_PRIVATE_KEY, { data: "0x13ead563" }),
      signSyntheticExact(SYNTHETIC_PRIVATE_KEY, { gas: 5_983_858n }),
      signSyntheticExact(SYNTHETIC_PRIVATE_KEY, { gasPrice: 100_000_001n }),
      signSyntheticExact(SYNTHETIC_PRIVATE_KEY, { value: 1n }),
      signSyntheticExact(`0x${"22".repeat(32)}` as Hex)
    ]);
    for (const drift of drifts) {
      await expect(
        inspectExactBscTestnetPtaWbnbPoolSignedTransactionForInternalUse(
          drift,
          exactTransaction(),
          expectedSigner
        )
      ).resolves.toBeNull();
    }
    await expect(
      inspectExactBscTestnetPtaWbnbPoolSignedTransactionForInternalUse(
        `${exactRaw}00`,
        exactTransaction(),
        expectedSigner
      )
    ).resolves.toBeNull();

    const parsed = parseTransaction(exactRaw);
    if (parsed.r === undefined || parsed.v === undefined) {
      throw new Error("The synthetic signed fixture lost its signature fields.");
    }
    const highS =
      BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141") -
      BigInt(parsed.s ?? "0x0");
    const highSRaw = serializeTransaction(
      {
        chainId: 97,
        data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
        gas: 5_983_857n,
        gasPrice: 100_000_000n,
        nonce: 1,
        to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
        type: "legacy",
        value: 0n
      },
      { r: parsed.r, s: numberToHex(highS), v: parsed.v }
    );
    await expect(
      inspectExactBscTestnetPtaWbnbPoolSignedTransactionForInternalUse(
        highSRaw,
        exactTransaction(),
        expectedSigner
      )
    ).resolves.toBeNull();
  });

  it("expires between decrypt and sign and wipes every owned secret buffer", async () => {
    const expectedSigner = getAddress(privateKeyToAccount(SYNTHETIC_PRIVATE_KEY).address);
    const successful = syntheticEncryptedStore();
    const signingDeadline = Date.now() + 60_000;
    const signed =
      await signExactBscTestnetPtaWbnbPoolEncryptedStoreWithExpectedSignerForInternalUse(
        successful.store,
        successful.password,
        exactTransaction({ signingNotAfterMilliseconds: signingDeadline }),
        expectedSigner
      );
    expect(signed).toMatch(/^0x[0-9a-f]+$/u);
    expect([...successful.store]).toEqual(new Array(successful.store.byteLength).fill(0));
    expect([...successful.password]).toEqual(new Array(48).fill(0));

    const raced = syntheticEncryptedStore();
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(signingDeadline - 1)
      .mockReturnValueOnce(signingDeadline);
    await expect(
      signExactBscTestnetPtaWbnbPoolEncryptedStoreWithExpectedSignerForInternalUse(
        raced.store,
        raced.password,
        exactTransaction({ signingNotAfterMilliseconds: signingDeadline }),
        expectedSigner
      )
    ).rejects.toThrow("failed closed");
    nowSpy.mockRestore();
    expect([...raced.store]).toEqual(new Array(raced.store.byteLength).fill(0));
    expect([...raced.password]).toEqual(new Array(48).fill(0));

    const wrongPassword = syntheticEncryptedStore();
    wrongPassword.password.writeUInt8(wrongPassword.password.readUInt8(0) ^ 0xff, 0);
    await expect(
      signExactBscTestnetPtaWbnbPoolEncryptedStoreWithExpectedSignerForInternalUse(
        wrongPassword.store,
        wrongPassword.password,
        exactTransaction(),
        expectedSigner
      )
    ).rejects.toThrow("failed closed");
    expect([...wrongPassword.store]).toEqual(new Array(wrongPassword.store.byteLength).fill(0));
    expect([...wrongPassword.password]).toEqual(new Array(48).fill(0));

    const malformedStore = Buffer.from("{}", "utf8");
    const password = Buffer.alloc(48, 1);
    await expect(
      signExactBscTestnetPtaWbnbPoolEncryptedStoreWithExpectedSignerForInternalUse(
        malformedStore,
        password,
        exactTransaction(),
        expectedSigner
      )
    ).rejects.toThrow("failed closed");
    expect([...malformedStore]).toEqual([0, 0]);
    expect([...password]).toEqual(new Array(48).fill(0));
  });
});
