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
});
