import { readFileSync } from "node:fs";

import { keccak256, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BSC_TESTNET_PTA_DURABLE_CLAIM_OPERATION,
  BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION,
  BSC_TESTNET_PTA_DURABLE_COMMIT_OPERATION,
  type BscTestnetPtaDurableClaimRequest,
  type BscTestnetPtaDurableSignedCommitRequest
} from "./bsc-testnet-pta-one-shot-signer-core";
import {
  createBscTestnetPtaLocalJournalCore,
  type BscTestnetPtaLocalJournalPorts
} from "./bsc-testnet-pta-local-journal.server";
import { BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID } from "./bsc-testnet-pta-one-shot-worker-protocol";
import {
  BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
  BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
  BSC_TESTNET_PTA_RPC_ORIGIN,
  BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
  BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
  BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
  BSC_TESTNET_PTA_RUNTIME_BYTES,
  buildBscTestnetPtaDeploymentEnvelope
} from "./bsc-testnet-pta-deployment-envelope";
import {
  BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE,
  buildBscTestnetPtaSigningWorkerRequest,
  validateBscTestnetPtaFreshSigningCapability,
  type BscTestnetPtaSigningWorkerRequest
} from "./bsc-testnet-pta-one-shot-worker-protocol";
import { buildBscTestnetPtaUnsignedTransaction } from "./bsc-testnet-pta-unsigned-transaction";

const NOW = "2026-08-12T14:00:00.000Z";
const ENVELOPE_SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-deployment-envelope.test.ts", import.meta.url),
  "utf8"
);
const DEPLOYMENT_DATA = /const DEPLOYMENT_DATA =\s+"(0x[0-9a-f]+)";/u.exec(ENVELOPE_SOURCE)?.[1] as
  Hex | undefined;
if (DEPLOYMENT_DATA === undefined) throw new Error("Missing reviewed deployment fixture.");
const RUNTIME_PREFIX = "608060405234801561001057600080fd5b5060043610610093";
const runtimeStart = DEPLOYMENT_DATA.indexOf(RUNTIME_PREFIX, 2 + RUNTIME_PREFIX.length);
if (runtimeStart < 0) throw new Error("Missing reviewed runtime fixture.");
const SIMULATION_RETURN_DATA = `0x${DEPLOYMENT_DATA.slice(
  runtimeStart,
  runtimeStart + BSC_TESTNET_PTA_RUNTIME_BYTES * 2
)}` as Hex;
const RAW_TRANSACTION = "0xf8610180808080018080" as Hex;
const TRANSACTION_HASH = keccak256(RAW_TRANSACTION);
const AUTHORIZATION_TOKEN = `0x${"66".repeat(32)}` as Hex;
const INCIDENT = Object.freeze({
  claimId: "pta-5435766f57e50ce0a2ae748336738e4e",
  signingHash: "0x5435766f57e50ce0a2ae748336738e4e7724d85f97c4774476a10bb1a88b44c1" as Hex,
  requestHash: "0x46297835692a5158fa1c003495321a02b450d0edebf9581fd4fc3fa2d137ec14" as Hex,
  sourceEnvelopeHash: "0xf5bc59afcbff9a79586d011e3c080d203fce45cdff794414e0373904d7127cea" as Hex,
  claimCreatedAt: "2026-08-12T14:52:27.146Z",
  authorizationRecordedAt: "2026-08-12T14:52:33.110Z",
  startedRecordedAt: "2026-08-12T14:52:41.561Z"
});
const RECONSTRUCTION_INCIDENT = Object.freeze({
  priorRequestHash: "0xe30ced1f9a906ff174b138834d06a35393d98fab85c12344857d2091a7c76162" as Hex,
  priorSourceEnvelopeHash:
    "0x08ddb021fa6c1cb17a41fca054ac9f1b278d9dd06b850f6906477fa71e9be688" as Hex,
  recoveryAuthorizationRecordedAt: "2026-08-12T15:32:51.369Z",
  recoveryStartedRecordedAt: "2026-08-12T15:32:59.979Z"
});

function workerRequest(gasEstimate = "500000"): BscTestnetPtaSigningWorkerRequest {
  const envelope = buildBscTestnetPtaDeploymentEnvelope(
    {
      schemaVersion: 1,
      operation: BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
      deploymentData: DEPLOYMENT_DATA,
      rpc: {
        endpointId: BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
        endpointOrigin: BSC_TESTNET_PTA_RPC_ORIGIN,
        observedAt: "2026-08-12T13:59:50.000Z",
        chainId: "97",
        blockNumber: "124634953",
        blockHash: `0x${"12".repeat(32)}`,
        blockTimestamp: "1786543180",
        blockGasLimit: "140000000",
        latestNonce: "0",
        pendingNonce: "0",
        signerCode: "0x",
        predictedContractAddress: BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
        predictedContractCode: "0x",
        predictedContractNonce: "0",
        balanceWei: "100000000000000000",
        simulationReturnData: SIMULATION_RETURN_DATA,
        gasEstimate,
        feeModel: "legacy_gas_price",
        gasPriceWei: "100000000"
      },
      policy: {
        expiresAt: "2026-08-12T14:03:00.000Z",
        gasLimitMarginBps: "2000",
        maximumGasLimit: "800000",
        maximumGasPriceWei: "1000000000",
        maximumTotalCostWei: "1000000000000000"
      }
    },
    { asOf: () => new Date(NOW) }
  );
  if (envelope.status !== "validated") throw new Error("Envelope fixture invalid.");
  const unsigned = buildBscTestnetPtaUnsignedTransaction(envelope.envelope, {
    asOf: () => new Date(NOW)
  });
  if (unsigned.status !== "signing_payload_serialized")
    throw new Error("Unsigned fixture invalid.");
  const capability = {
    schemaVersion: 1,
    scope: BSC_TESTNET_PTA_FRESH_SIGNING_CAPABILITY_SCOPE,
    authenticatedAt: NOW,
    freshSignerSideRpcRecheckPerformed: true as const,
    signingPayload: unsigned.signingPayload
  };
  const validated = validateBscTestnetPtaFreshSigningCapability(capability, new Date(NOW));
  if (validated.status !== "valid") throw new Error("Capability fixture invalid.");
  const claimId = `pta-${validated.intent.signingHash.slice(2, 34)}`;
  const request = buildBscTestnetPtaSigningWorkerRequest(validated.intent, claimId);
  if ("code" in request) throw new Error("Worker request fixture invalid.");
  return request;
}

const WORKER_REQUEST = workerRequest();
const RECOVERY_WORKER_REQUEST = workerRequest("561809");
if (
  RECOVERY_WORKER_REQUEST.transaction.signingHash !== INCIDENT.signingHash ||
  RECOVERY_WORKER_REQUEST.transaction.gasLimit !== "674171" ||
  RECOVERY_WORKER_REQUEST.transaction.gasPriceWei !== "100000000" ||
  RECOVERY_WORKER_REQUEST.transaction.maximumCostWei !== "67417100000000"
) {
  throw new Error("Recovery signing regression fixture invalid.");
}
const SIGNING_HASH = WORKER_REQUEST.transaction.signingHash;
const ENVELOPE_HASH = WORKER_REQUEST.transaction.sourceEnvelopeHash;
const CLAIM_ID = WORKER_REQUEST.claimId;

function claimRequest(): BscTestnetPtaDurableClaimRequest {
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION,
    operation: BSC_TESTNET_PTA_DURABLE_CLAIM_OPERATION,
    oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
    environment: "bsc-testnet" as const,
    chainId: BSC_TESTNET_PTA_CHAIN_ID_DECIMAL,
    expectedSigner: BSC_TESTNET_PTA_DEPLOYER_ADDRESS,
    predictedContractAddress: BSC_TESTNET_PTA_EXPECTED_CONTRACT_ADDRESS,
    signingHash: SIGNING_HASH,
    sourceEnvelopeHash: ENVELOPE_HASH
  });
}

function commitRequest(): BscTestnetPtaDurableSignedCommitRequest {
  return Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_DURABLE_CLAIM_SCHEMA_VERSION,
    operation: BSC_TESTNET_PTA_DURABLE_COMMIT_OPERATION,
    oneShotIntentId: BSC_TESTNET_PTA_ONE_SHOT_INTENT_ID,
    claimId: CLAIM_ID,
    requestHash: WORKER_REQUEST.requestHash,
    signingHash: SIGNING_HASH,
    signedTransaction: RAW_TRANSACTION,
    transactionHash: TRANSACTION_HASH,
    recoveredSigner: BSC_TESTNET_PTA_DEPLOYER_ADDRESS
  });
}

function memoryPorts() {
  const files = new Map<string, string>();
  const metadata = new Map<
    string,
    {
      birthtimeNanoseconds: string;
      modifiedTimeNanoseconds: string;
      sizeBytes: string;
      device: string;
      inode: string;
      contentSha256: string;
    }
  >();
  const asserted: string[][] = [];
  const ports: BscTestnetPtaLocalJournalPorts = {
    now: () => new Date(NOW),
    assertSecure: async (names) => {
      asserted.push([...names]);
    },
    createExclusive: async (name, content) => {
      if (files.has(name)) return "exists";
      files.set(name, content);
      return "created";
    },
    readBounded: async (name) => files.get(name) ?? null,
    readMetadata: async (name) => metadata.get(name) ?? null
  };
  return { asserted, files, metadata, ports };
}

function recoveryClaimRequest(): BscTestnetPtaDurableClaimRequest {
  return Object.freeze({
    ...claimRequest(),
    signingHash: INCIDENT.signingHash,
    sourceEnvelopeHash: RECOVERY_WORKER_REQUEST.transaction.sourceEnvelopeHash
  });
}

function recoveryCommitRequest(): BscTestnetPtaDurableSignedCommitRequest {
  return Object.freeze({
    ...commitRequest(),
    claimId: INCIDENT.claimId,
    requestHash: RECOVERY_WORKER_REQUEST.requestHash,
    signingHash: INCIDENT.signingHash
  });
}

function seedExactIncident(memory: ReturnType<typeof memoryPorts>): void {
  const originalClaim: BscTestnetPtaDurableClaimRequest = Object.freeze({
    ...claimRequest(),
    signingHash: INCIDENT.signingHash,
    sourceEnvelopeHash: INCIDENT.sourceEnvelopeHash
  });
  const originalWorkerRecord = Object.freeze({
    claimId: INCIDENT.claimId,
    requestHash: INCIDENT.requestHash,
    signingHash: INCIDENT.signingHash,
    sourceEnvelopeHash: INCIDENT.sourceEnvelopeHash,
    authorizationDigest: `0x${"ab".repeat(32)}`
  });
  memory.files.set(
    "claim.v1.json",
    `${JSON.stringify({
      schemaVersion: 1,
      recordType: "bsc_testnet_pta_one_shot_claim",
      createdAt: INCIDENT.claimCreatedAt,
      claimId: INCIDENT.claimId,
      request: originalClaim
    })}\n`
  );
  memory.files.set(
    "worker-authorization.v1.json",
    `${JSON.stringify({
      schemaVersion: 1,
      recordType: "bsc_testnet_pta_worker_authorization",
      recordedAt: INCIDENT.authorizationRecordedAt,
      record: originalWorkerRecord
    })}\n`
  );
  memory.files.set(
    "worker-started.v1.json",
    `${JSON.stringify({
      schemaVersion: 1,
      recordType: "bsc_testnet_pta_worker_started",
      recordedAt: INCIDENT.startedRecordedAt,
      record: originalWorkerRecord
    })}\n`
  );
  memory.metadata.set("claim.v1.json", {
    birthtimeNanoseconds: "1786546352538688400",
    modifiedTimeNanoseconds: "1786546352539689500",
    sizeBytes: "677",
    device: "1",
    inode: "11",
    contentSha256: "316599121ec06e0cc74a0268b693c13b41afb95bdfa37c540c385139e9f1b41b"
  });
  memory.metadata.set("worker-authorization.v1.json", {
    birthtimeNanoseconds: "1786546353665026000",
    modifiedTimeNanoseconds: "1786546353665026000",
    sizeBytes: "519",
    device: "1",
    inode: "12",
    contentSha256: "d9dc65953b0ad46f4adab1ac7d5213b36f6b4d6aff8e554206db9994f50e74eb"
  });
  memory.metadata.set("worker-started.v1.json", {
    birthtimeNanoseconds: "1786546365968244600",
    modifiedTimeNanoseconds: "1786546365969245000",
    sizeBytes: "513",
    device: "1",
    inode: "13",
    contentSha256: "37dcc7b65b8e2a44777f9545ff19fea65f865ac2f1803f89802ceede0c957b91"
  });
}

async function seedExactDeterministicReconstructionIncident(
  memory: ReturnType<typeof memoryPorts>
): Promise<void> {
  seedExactIncident(memory);
  const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
  await journal.prepareWorkerAuthorization(RECOVERY_WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN));
  await journal.consumeWorkerAuthorization(RECOVERY_WORKER_REQUEST, AUTHORIZATION_TOKEN);

  for (const [name, recordedAt] of [
    ["recovery-authorization.v1.json", RECONSTRUCTION_INCIDENT.recoveryAuthorizationRecordedAt],
    ["recovery-started.v1.json", RECONSTRUCTION_INCIDENT.recoveryStartedRecordedAt]
  ] as const) {
    const root = JSON.parse(memory.files.get(name) ?? "null") as {
      recordedAt: string;
      record: {
        recoveryRequestHash: Hex;
        recoverySourceEnvelopeHash: Hex;
      };
    };
    root.recordedAt = recordedAt;
    root.record.recoveryRequestHash = RECONSTRUCTION_INCIDENT.priorRequestHash;
    root.record.recoverySourceEnvelopeHash = RECONSTRUCTION_INCIDENT.priorSourceEnvelopeHash;
    memory.files.set(name, `${JSON.stringify(root)}\n`);
  }

  const originalMetadata = [
    ["claim.v1.json", "16044073675418124"],
    ["worker-authorization.v1.json", "15481123721918814"],
    ["worker-started.v1.json", "12666373954890445"]
  ] as const;
  for (const [name, inode] of originalMetadata) {
    const retained = memory.metadata.get(name);
    if (retained === undefined) throw new Error(`Missing ${name} metadata fixture.`);
    memory.metadata.set(name, { ...retained, device: "5362065", inode });
  }
  memory.metadata.set("recovery-authorization.v1.json", {
    birthtimeNanoseconds: "1786548772010941500",
    modifiedTimeNanoseconds: "1786548772011905900",
    sizeBytes: "2189",
    device: "5362065",
    inode: "6473924466404750",
    contentSha256: "a06407185d1365247b4cd4b4cf20662bf6fdce0a82d1a6f5f9065897c1657646"
  });
  memory.metadata.set("recovery-started.v1.json", {
    birthtimeNanoseconds: "1786548784286362400",
    modifiedTimeNanoseconds: "1786548784287357300",
    sizeBytes: "2183",
    device: "5362065",
    inode: "16044073673783358",
    contentSha256: "d1006f798e71ac47f80656d5e08eb9479e702cbe1840441572061afaaaefd2d1"
  });
}

async function authorizeAndConsume(
  journal: ReturnType<typeof createBscTestnetPtaLocalJournalCore>
): Promise<void> {
  await expect(
    journal.prepareWorkerAuthorization(WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN))
  ).resolves.toEqual({ status: "authorized" });
  await expect(
    journal.consumeWorkerAuthorization(WORKER_REQUEST, AUTHORIZATION_TOKEN)
  ).resolves.toEqual({ status: "consumed" });
}

describe("local one-shot PTA journal", () => {
  it("atomically claims, commits, and reconciles the exact signed transaction", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);

    await expect(journal.readState()).resolves.toEqual({
      status: "empty",
      signedTransaction: null,
      transactionHash: null
    });
    await expect(journal.claimExactDeployment(claimRequest())).resolves.toEqual({
      status: "claimed",
      claimId: CLAIM_ID
    });
    await expect(journal.readState()).resolves.toEqual({
      status: "claimed",
      signedTransaction: null,
      transactionHash: null
    });
    await authorizeAndConsume(journal);
    await expect(journal.commitSignedTransaction(commitRequest())).resolves.toEqual({
      status: "committed"
    });
    await expect(journal.readState()).resolves.toEqual({
      status: "signed_committed",
      signedTransaction: RAW_TRANSACTION,
      transactionHash: TRANSACTION_HASH
    });
    expect(memory.asserted).toContainEqual([
      "claim.v1.json",
      "worker-authorization.v1.json",
      "worker-started.v1.json",
      "signed.v1.json"
    ]);
  });

  it("never overwrites and reports exact replay as already claimed", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await journal.claimExactDeployment(claimRequest());
    const original = memory.files.get("claim.v1.json");
    await expect(journal.claimExactDeployment(claimRequest())).resolves.toEqual({
      status: "already_exists",
      state: "claimed"
    });
    expect(memory.files.get("claim.v1.json")).toBe(original);
  });

  it("rejects a signed record when retained worker authorization evidence drifts", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await journal.claimExactDeployment(claimRequest());
    await authorizeAndConsume(journal);
    await journal.commitSignedTransaction(commitRequest());

    const started = JSON.parse(memory.files.get("worker-started.v1.json") ?? "null") as {
      record: { requestHash: string };
    };
    started.record.requestHash = `0x${"99".repeat(32)}`;
    memory.files.set("worker-started.v1.json", `${JSON.stringify(started)}\n`);

    await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
  });

  it("fails closed on a conflicting retained claim and never creates a signed record", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await journal.claimExactDeployment(claimRequest());
    const conflict = {
      ...claimRequest(),
      sourceEnvelopeHash: `0x${"44".repeat(32)}` as Hex
    };
    await expect(journal.claimExactDeployment(conflict)).rejects.toThrow(
      "PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN"
    );
    expect(memory.files.has("signed.v1.json")).toBe(false);
  });

  it("treats claim-only, malformed, and cross-binding records as terminal unknown/claimed", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await journal.claimExactDeployment(claimRequest());
    await expect(journal.readState()).resolves.toMatchObject({ status: "claimed" });

    memory.files.set("signed.v1.json", "{}\n");
    await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
  });

  it("rejects commit before claim and a transaction-hash mismatch", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await expect(journal.commitSignedTransaction(commitRequest())).rejects.toThrow(
      "PTA_LOCAL_JOURNAL_CLAIM_MISMATCH"
    );
    await journal.claimExactDeployment(claimRequest());
    await authorizeAndConsume(journal);
    await expect(
      journal.commitSignedTransaction({
        ...commitRequest(),
        transactionHash: `0x${"55".repeat(32)}`
      })
    ).rejects.toThrow("PTA_LOCAL_JOURNAL_INPUT_INVALID");
  });

  it("rejects accessors, proxies, forged ports, and clock subclasses without invoking traps", async () => {
    let traps = 0;
    const proxiedPorts = new Proxy(memoryPorts().ports, {
      ownKeys: () => {
        traps += 1;
        return [];
      }
    });
    expect(() => createBscTestnetPtaLocalJournalCore(proxiedPorts)).toThrow(
      "PTA_LOCAL_JOURNAL_CONFIGURATION_INVALID"
    );
    expect(traps).toBe(0);

    const memory = memoryPorts();
    const accessor = Object.defineProperty({}, "signingHash", {
      enumerable: true,
      get: () => {
        traps += 1;
        return SIGNING_HASH;
      }
    });
    await expect(
      createBscTestnetPtaLocalJournalCore(memory.ports).claimExactDeployment(
        accessor as BscTestnetPtaDurableClaimRequest
      )
    ).rejects.toThrow("PTA_LOCAL_JOURNAL_INPUT_INVALID");
    expect(traps).toBe(0);

    class HostileDate extends Date {}
    const badClock = { ...memory.ports, now: () => new HostileDate(NOW) };
    await expect(
      createBscTestnetPtaLocalJournalCore(badClock).claimExactDeployment(claimRequest())
    ).rejects.toThrow("PTA_LOCAL_JOURNAL_INPUT_INVALID");
  });

  it("collapses concurrent exact claims to one creator and one immutable replay", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    const results = await Promise.all(
      Array.from({ length: 16 }, () => journal.claimExactDeployment(claimRequest()))
    );
    expect(results.filter((result) => result.status === "claimed")).toHaveLength(1);
    expect(results.filter((result) => result.status === "already_exists")).toHaveLength(15);
  });

  it("requires an unguessable prepared token and consumes worker start exactly once", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await journal.claimExactDeployment(claimRequest());
    await expect(
      journal.prepareWorkerAuthorization(WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN))
    ).resolves.toEqual({ status: "authorized" });
    await expect(
      journal.consumeWorkerAuthorization(WORKER_REQUEST, `0x${"77".repeat(32)}`)
    ).rejects.toThrow("PTA_LOCAL_JOURNAL_WORKER_AUTHORIZATION_INVALID");
    await expect(
      journal.consumeWorkerAuthorization(WORKER_REQUEST, AUTHORIZATION_TOKEN)
    ).resolves.toEqual({ status: "consumed" });
    await expect(
      journal.consumeWorkerAuthorization(WORKER_REQUEST, AUTHORIZATION_TOKEN)
    ).rejects.toThrow("PTA_LOCAL_JOURNAL_WORKER_ALREADY_STARTED");
  });

  it("makes authorization-without-start and start-without-commit terminal for re-signing", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await journal.claimExactDeployment(claimRequest());
    await journal.prepareWorkerAuthorization(WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN));
    await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
    await journal.consumeWorkerAuthorization(WORKER_REQUEST, AUTHORIZATION_TOKEN);
    await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
  });

  it("performs exactly one append-only recovery for the pinned pre-signature-expiry incident", async () => {
    const memory = memoryPorts();
    seedExactIncident(memory);
    const originals = new Map(memory.files);
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);

    await expect(journal.readState()).resolves.toEqual({
      status: "exact_recovery_available",
      signedTransaction: null,
      transactionHash: null
    });
    await expect(journal.claimExactDeployment(recoveryClaimRequest())).resolves.toEqual({
      status: "claimed",
      claimId: INCIDENT.claimId
    });
    await expect(
      journal.prepareWorkerAuthorization(RECOVERY_WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN))
    ).resolves.toEqual({ status: "authorized" });
    await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
    await expect(
      journal.consumeWorkerAuthorization(RECOVERY_WORKER_REQUEST, AUTHORIZATION_TOKEN)
    ).resolves.toEqual({ status: "consumed" });
    await expect(journal.commitSignedTransaction(recoveryCommitRequest())).resolves.toEqual({
      status: "committed"
    });
    // The isolated child and its parent both commit the same result. This exact
    // second commit is idempotent; no record is replaced.
    const signed = memory.files.get("signed.v1.json");
    await expect(journal.commitSignedTransaction(recoveryCommitRequest())).resolves.toEqual({
      status: "committed"
    });
    expect(memory.files.get("signed.v1.json")).toBe(signed);
    await expect(journal.readState()).resolves.toEqual({
      status: "signed_committed",
      signedTransaction: RAW_TRANSACTION,
      transactionHash: TRANSACTION_HASH
    });
    for (const name of [
      "claim.v1.json",
      "worker-authorization.v1.json",
      "worker-started.v1.json"
    ]) {
      expect(memory.files.get(name)).toBe(originals.get(name));
    }
    const recoveryAuthorization = JSON.parse(
      memory.files.get("recovery-authorization.v1.json") ?? "null"
    ) as { record: Record<string, unknown> };
    expect(recoveryAuthorization.record).toMatchObject({
      incidentId: "bsc-testnet-pta-pre-sign-expiry-2026-08-12",
      attemptCommit: "94e4bc4323138ca34ce9551c87e47b3e0eb8f2e3",
      evidenceCommit: "1537847",
      originalRequestHash: INCIDENT.requestHash,
      originalSourceEnvelopeHash: INCIDENT.sourceEnvelopeHash,
      recoveryRequestHash: RECOVERY_WORKER_REQUEST.requestHash,
      recoverySourceEnvelopeHash: RECOVERY_WORKER_REQUEST.transaction.sourceEnvelopeHash,
      signingHash: INCIDENT.signingHash,
      gasLimit: "674171",
      gasPriceWei: "100000000",
      maximumCostWei: "67417100000000"
    });
  });

  it("rejects incident timestamp, file hash, identity, and original cross-binding drift", async () => {
    const mutations: Array<(memory: ReturnType<typeof memoryPorts>) => void> = [
      (memory) => {
        const metadata = memory.metadata.get("worker-started.v1.json");
        if (metadata !== undefined)
          memory.metadata.set("worker-started.v1.json", {
            ...metadata,
            birthtimeNanoseconds: "1786546365968244700"
          });
      },
      (memory) => {
        const authorization = JSON.parse(
          memory.files.get("worker-authorization.v1.json") ?? "null"
        ) as { recordedAt: string };
        authorization.recordedAt = "2026-08-12T14:52:33.111Z";
        memory.files.set("worker-authorization.v1.json", `${JSON.stringify(authorization)}\n`);
      },
      (memory) => {
        const metadata = memory.metadata.get("worker-authorization.v1.json");
        if (metadata !== undefined)
          memory.metadata.set("worker-authorization.v1.json", {
            ...metadata,
            contentSha256: "0".repeat(64)
          });
      },
      (memory) => {
        const metadata = memory.metadata.get("worker-started.v1.json");
        if (metadata !== undefined)
          memory.metadata.set("worker-started.v1.json", { ...metadata, inode: "12" });
      },
      (memory) => {
        const started = JSON.parse(memory.files.get("worker-started.v1.json") ?? "null") as {
          record: { requestHash: Hex };
        };
        started.record.requestHash = `0x${"99".repeat(32)}`;
        memory.files.set("worker-started.v1.json", `${JSON.stringify(started)}\n`);
      }
    ];

    for (const mutate of mutations) {
      const memory = memoryPorts();
      seedExactIncident(memory);
      mutate(memory);
      const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
      await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
      await expect(journal.claimExactDeployment(recoveryClaimRequest())).rejects.toThrow(
        "PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN"
      );
      await expect(
        journal.prepareWorkerAuthorization(RECOVERY_WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN))
      ).rejects.toThrow("PTA_LOCAL_JOURNAL_CLAIM_MISMATCH");
      expect(memory.files.has("recovery-authorization.v1.json")).toBe(false);
      expect(memory.files.has("recovery-started.v1.json")).toBe(false);
    }
  });

  it("makes an authorized or started recovery terminal and never creates a third attempt", async () => {
    const memory = memoryPorts();
    seedExactIncident(memory);
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await journal.claimExactDeployment(recoveryClaimRequest());
    await journal.prepareWorkerAuthorization(
      RECOVERY_WORKER_REQUEST,
      keccak256(AUTHORIZATION_TOKEN)
    );
    await expect(journal.claimExactDeployment(recoveryClaimRequest())).rejects.toThrow(
      "PTA_LOCAL_JOURNAL_OUTCOME_UNKNOWN"
    );
    await expect(
      journal.prepareWorkerAuthorization(RECOVERY_WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN))
    ).rejects.toThrow();
    await journal.consumeWorkerAuthorization(RECOVERY_WORKER_REQUEST, AUTHORIZATION_TOKEN);
    await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
    await expect(
      journal.consumeWorkerAuthorization(RECOVERY_WORKER_REQUEST, AUTHORIZATION_TOKEN)
    ).rejects.toThrow("PTA_LOCAL_JOURNAL_WORKER_ALREADY_STARTED");
    expect(
      [...memory.files.keys()].filter((name) => name.startsWith("recovery-authorization"))
    ).toEqual(["recovery-authorization.v1.json"]);
    expect([...memory.files.keys()].filter((name) => name.startsWith("recovery-started"))).toEqual([
      "recovery-started.v1.json"
    ]);
  });

  it("allows only one recovery authorization under concurrent attempts", async () => {
    const memory = memoryPorts();
    seedExactIncident(memory);
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await journal.claimExactDeployment(recoveryClaimRequest());
    const settled = await Promise.allSettled(
      Array.from({ length: 16 }, () =>
        journal.prepareWorkerAuthorization(RECOVERY_WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN))
      )
    );
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(15);
    expect([...memory.files.keys()].filter((name) => name.startsWith("recovery-"))).toEqual([
      "recovery-authorization.v1.json"
    ]);
  });

  it("rejects same-signing-hash request field drift before writing recovery state", async () => {
    const memory = memoryPorts();
    seedExactIncident(memory);
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await journal.claimExactDeployment(recoveryClaimRequest());
    const collisionStyleDrift = {
      ...RECOVERY_WORKER_REQUEST,
      transaction: {
        ...RECOVERY_WORKER_REQUEST.transaction,
        gasLimit: "674172",
        signingHash: INCIDENT.signingHash
      }
    } as BscTestnetPtaSigningWorkerRequest;
    await expect(
      journal.prepareWorkerAuthorization(collisionStyleDrift, keccak256(AUTHORIZATION_TOKEN))
    ).rejects.toThrow("PTA_LOCAL_JOURNAL_INPUT_INVALID");
    expect(memory.files.has("recovery-authorization.v1.json")).toBe(false);
  });

  it("rejects a malformed or cross-bound recovery pair before accepting a signed commit", async () => {
    const memory = memoryPorts();
    seedExactIncident(memory);
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    await journal.claimExactDeployment(recoveryClaimRequest());
    await journal.prepareWorkerAuthorization(
      RECOVERY_WORKER_REQUEST,
      keccak256(AUTHORIZATION_TOKEN)
    );
    await journal.consumeWorkerAuthorization(RECOVERY_WORKER_REQUEST, AUTHORIZATION_TOKEN);
    const started = JSON.parse(memory.files.get("recovery-started.v1.json") ?? "null") as {
      record: { originalRequestHash: Hex };
    };
    started.record.originalRequestHash = `0x${"88".repeat(32)}`;
    memory.files.set("recovery-started.v1.json", `${JSON.stringify(started)}\n`);
    await expect(journal.commitSignedTransaction(recoveryCommitRequest())).rejects.toThrow(
      "PTA_LOCAL_JOURNAL_WORKER_NOT_STARTED"
    );
    expect(memory.files.has("signed.v1.json")).toBe(false);
    await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
  });

  it("performs one incident-bound deterministic reconstruction and commits append-only", async () => {
    const memory = memoryPorts();
    await seedExactDeterministicReconstructionIncident(memory);
    const originalFive = new Map(memory.files);
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);

    await expect(journal.readState()).resolves.toEqual({
      status: "deterministic_reconstruction_available",
      signedTransaction: null,
      transactionHash: null
    });
    await expect(journal.claimExactDeployment(recoveryClaimRequest())).resolves.toEqual({
      status: "claimed",
      claimId: INCIDENT.claimId
    });
    await expect(
      journal.prepareWorkerAuthorization(RECOVERY_WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN))
    ).resolves.toEqual({ status: "authorized" });
    await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
    await expect(
      journal.consumeWorkerAuthorization(RECOVERY_WORKER_REQUEST, AUTHORIZATION_TOKEN)
    ).resolves.toEqual({ status: "consumed" });
    await expect(journal.commitSignedTransaction(recoveryCommitRequest())).resolves.toEqual({
      status: "committed"
    });
    await expect(journal.readState()).resolves.toEqual({
      status: "signed_committed",
      signedTransaction: RAW_TRANSACTION,
      transactionHash: TRANSACTION_HASH
    });

    for (const [name, content] of originalFive) expect(memory.files.get(name)).toBe(content);
    const authorization = JSON.parse(
      memory.files.get("deterministic-reconstruction-authorization.v1.json") ?? "null"
    ) as { record: Record<string, unknown> };
    expect(authorization.record).toMatchObject({
      incidentId: "bsc-testnet-pta-deterministic-reconstruction-2026-08-12",
      reconstructionReason: "same_payload_rfc6979_reconstruction_after_unknown_worker_outcome",
      attemptCommit: "2c4df05aec5eac9f41150382b58266fdcb93523f",
      recoveryAuthenticatedAt: "2026-08-12T15:32:44.550Z",
      recoveryExpiresAt: "2026-08-12T15:36:44.494Z",
      recoverySigningNotAfter: "2026-08-12T15:33:44.550Z",
      priorRecoveryRequestHash: RECONSTRUCTION_INCIDENT.priorRequestHash,
      priorRecoverySourceEnvelopeHash: RECONSTRUCTION_INCIDENT.priorSourceEnvelopeHash,
      journalSourceBlob: "8e1ecde77f1f854b77a3d46834316f65850b7e7e",
      signerSourceBlob: "0393ce2b2e3463b390e3b0418776f982f7f877b5",
      nodeVersion: "v24.14.1",
      viemVersion: "2.55.13",
      nobleCurvesVersion: "1.9.1",
      nobleHashesVersion: "1.8.0",
      runtimeNodeExecutableSha256:
        "58e74bf02fc5bbacc41dcb8bef089961cd5bddd37830b87784e4fc624d145d1f",
      runtimeTypescriptLoaderSha256:
        "7783710b215e30285d7a36b41a3cbefbfe9c1fafdaaba929225c42c1da7abfc1",
      runtimeIntegrationsPackageSha256:
        "bc46e5fd4f006bd4282fa6d2033aa64da1dbc4abf8e1bc7a67599fcf718c5041",
      runtimePnpmLockSha256: "645b67708bc22122be8fdbcda35314019599cf2c4665a12abf7d5d767b4a72b1",
      runtimeViemSerializeTransactionSha256:
        "1cbe1acacdfdb2f409715164601f0cb1e1275fd29832968caeae27dffcfffd48",
      runtimeViemIndexSha256: "ea32975364e9f2d599b10639d81985ec6a3ed87f6942fe0cb73b1bf738959057",
      priorRuntimeViemSignSha256:
        "8320f27b64139ccb63dac093af688a68811924f129d1f15c83f9542dcfc12528",
      priorRuntimeViemSignTransactionSha256:
        "ac5a2c356782ec961c37eb3b3007fc00a505f9f812eaed03f5ea8a635c60ae54",
      runtimeNobleSecp256k1Sha256:
        "30943ee7362d12dcbb2ec8756055aa1b2d0246e1bea56288abcbf0aeb7969216",
      priorRuntimeNobleSecp256k1Sha256:
        "30943ee7362d12dcbb2ec8756055aa1b2d0246e1bea56288abcbf0aeb7969216",
      priorRuntimeNobleWeierstrassSha256:
        "cdc650e13a4b3e26699fcfd6d85b4a816f159efd16fb0905411495b57dce485f",
      priorRuntimeNobleSha2Sha256:
        "e729088b82e5450bff54c3a0013582aa42e1fe8f58dd31f5967f6ebe34c52299",
      priorRuntimeNobleHmacSha256:
        "a330af1af3fb00ebdbba2f023dd5e023aa367669081cd51c7d172eb499533d0b",
      runtimeTreeAbitypeForOxSha256:
        "e80d2f27751b0997a91f4c5d7a15cc122d3ae5536cd4378460c96711d89502b6",
      runtimeTreeAbitypeForViemSha256:
        "b9afb85169f3b43c7b04d8eef5d8d1443bcdbf9ae8c1b01cc9211ba3440f2533",
      runtimeTreeNobleCurvesSha256:
        "ead39ce3e8f73680bfc4d2eae7daa5035836b086d53b13c3e59285e2f04927bc",
      runtimeTreeNobleHashesSha256:
        "4fcf0fa01dad679b88ef13a350f68e754446ae0102c2aa6d52b77840c81fa65b",
      runtimeTreeOxSha256: "cb0acff895a96d3520f8875e65f9b7679cfa49f7405fc7725c607292e429d527",
      runtimeTreeServerOnlySha256:
        "03dfa375a287d93459c50e5d9ab699bc1fdd243d68b4634dfd9062912c3511f6",
      runtimeTreeTypescriptSha256:
        "310dc96e3ba5a379e07512ebb864d0e586b4abd24a9636fadabd4937e54489f8",
      runtimeTreeViemSha256: "e7b8b7334a5b6d3157b0a055eb3affa97670257c257c393a3077299839980f5a",
      deterministicAlgorithm: "RFC6979-secp256k1-SHA256-lowS",
      extraEntropy: false,
      signedRecordAbsentAtAuthorization: true,
      reconstructionRequestHash: RECOVERY_WORKER_REQUEST.requestHash,
      signingHash: INCIDENT.signingHash,
      gasLimit: "674171",
      gasPriceWei: "100000000",
      maximumCostWei: "67417100000000"
    });
    expect(memory.asserted).toContainEqual([
      "claim.v1.json",
      "worker-authorization.v1.json",
      "worker-started.v1.json",
      "recovery-authorization.v1.json",
      "recovery-started.v1.json",
      "deterministic-reconstruction-authorization.v1.json",
      "deterministic-reconstruction-started.v1.json",
      "signed.v1.json"
    ]);
  });

  it("requires all five exact incident files and signed-record absence", async () => {
    const mutations: Array<(memory: ReturnType<typeof memoryPorts>) => void> = [
      (memory) => {
        const metadata = memory.metadata.get("claim.v1.json");
        if (metadata !== undefined)
          memory.metadata.set("claim.v1.json", { ...metadata, inode: "16044073675418125" });
      },
      (memory) => {
        const metadata = memory.metadata.get("worker-authorization.v1.json");
        if (metadata !== undefined)
          memory.metadata.set("worker-authorization.v1.json", {
            ...metadata,
            contentSha256: "0".repeat(64)
          });
      },
      (memory) => {
        const metadata = memory.metadata.get("worker-started.v1.json");
        if (metadata !== undefined)
          memory.metadata.set("worker-started.v1.json", {
            ...metadata,
            modifiedTimeNanoseconds: "1786546365969245001"
          });
      },
      (memory) => {
        const metadata = memory.metadata.get("recovery-authorization.v1.json");
        if (metadata !== undefined)
          memory.metadata.set("recovery-authorization.v1.json", {
            ...metadata,
            sizeBytes: "2190"
          });
      },
      (memory) => {
        const metadata = memory.metadata.get("recovery-started.v1.json");
        if (metadata !== undefined)
          memory.metadata.set("recovery-started.v1.json", { ...metadata, device: "5362066" });
      },
      (memory) => {
        const recovery = JSON.parse(memory.files.get("recovery-started.v1.json") ?? "null") as {
          recordedAt: string;
        };
        recovery.recordedAt = "2026-08-12T15:32:59.980Z";
        memory.files.set("recovery-started.v1.json", `${JSON.stringify(recovery)}\n`);
      },
      (memory) => {
        memory.files.set("signed.v1.json", "{}\n");
      }
    ];

    for (const mutate of mutations) {
      const memory = memoryPorts();
      await seedExactDeterministicReconstructionIncident(memory);
      mutate(memory);
      const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
      await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
      await expect(
        journal.prepareWorkerAuthorization(RECOVERY_WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN))
      ).rejects.toThrow("PTA_LOCAL_JOURNAL_CLAIM_MISMATCH");
      expect(memory.files.has("deterministic-reconstruction-authorization.v1.json")).toBe(false);
    }
  });

  it("makes every uncommitted reconstruction state terminal and grants only one attempt", async () => {
    const memory = memoryPorts();
    await seedExactDeterministicReconstructionIncident(memory);
    const journal = createBscTestnetPtaLocalJournalCore(memory.ports);
    const settled = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        journal.prepareWorkerAuthorization(RECOVERY_WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN))
      )
    );
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(11);
    await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
    await expect(
      journal.consumeWorkerAuthorization(RECOVERY_WORKER_REQUEST, AUTHORIZATION_TOKEN)
    ).resolves.toEqual({ status: "consumed" });
    await expect(journal.readState()).resolves.toMatchObject({ status: "unknown" });
    await expect(
      journal.consumeWorkerAuthorization(RECOVERY_WORKER_REQUEST, AUTHORIZATION_TOKEN)
    ).rejects.toThrow("PTA_LOCAL_JOURNAL_WORKER_ALREADY_STARTED");
    await expect(
      journal.prepareWorkerAuthorization(RECOVERY_WORKER_REQUEST, keccak256(AUTHORIZATION_TOKEN))
    ).rejects.toThrow();
    expect(
      [...memory.files.keys()].filter((name) => name.startsWith("deterministic-reconstruction-"))
    ).toEqual([
      "deterministic-reconstruction-authorization.v1.json",
      "deterministic-reconstruction-started.v1.json"
    ]);
  });
});
