import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runBscTestnetPtaWbnbPoolProductionOnceFromStdin } from "./bsc-testnet-pta-wbnb-pool-production-runner.server";
import { sendExactBscTestnetPtaWbnbPoolRawTransactionOnceForInternalUse } from "./bsc-testnet-pta-wbnb-pool-production-rpc.server";

const RUNNER_SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-production-runner.server.ts", import.meta.url),
  "utf8"
);
const WORKER_SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-signing-worker.ts", import.meta.url),
  "utf8"
);
const AUTHORITY_SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-production-authority.server.ts", import.meta.url),
  "utf8"
);

describe("PTA/WBNB production execution hard block", () => {
  it("returns before stdin, RPC, journal, custody, signing, or broadcast access", async () => {
    await expect(runBscTestnetPtaWbnbPoolProductionOnceFromStdin()).resolves.toMatchObject({
      status: "blocked",
      code: "PRODUCTION_AUTHORIZATION_UNAVAILABLE",
      transactionHash: null
    });
    expect(RUNNER_SOURCE).not.toMatch(
      /process\.stdin|process\.argv|\bfetch\s*\(|eth_sendRawTransaction|createWindowsBscTestnetPtaWbnbPoolLocalJournal|assertFixedWindows/u
    );
    await expect(
      sendExactBscTestnetPtaWbnbPoolRawTransactionOnceForInternalUse("0x01")
    ).rejects.toThrow("PRODUCTION_AUTHORIZATION_UNAVAILABLE");
  });

  it("does not bridge test authority brands into the native worker", () => {
    expect(AUTHORITY_SOURCE).not.toContain("productionExecutionCapabilities");
    expect(AUTHORITY_SOURCE).not.toContain(
      "createBscTestnetPtaWbnbPoolProductionAuthorityForInternalUse"
    );
    expect(WORKER_SOURCE).not.toContain(
      "authenticateBscTestnetPtaWbnbPoolProductionExecutionCapabilityForInternalUse"
    );
    expect(WORKER_SOURCE).toContain(
      'throw new PoolSigningWorkerFailure("PRODUCTION_AUTHORIZATION_UNAVAILABLE")'
    );
  });

  it("retains truthful owner-designated review semantics without external identity claims", () => {
    expect(AUTHORITY_SOURCE).toContain(
      'kind: "owner_designated_internal_multi_agent_initializer_review_v1"'
    );
    expect(AUTHORITY_SOURCE).toContain("cryptographicReviewerIdentityAvailable: false");
    expect(AUTHORITY_SOURCE).toContain("reviewIsNotTransactionAuthorization: true");
    expect(AUTHORITY_SOURCE).toMatch(
      /decision:\s*"authorize_one_chain_97_pool_initialization_signature_and_single_broadcast"/u
    );
    expect(AUTHORITY_SOURCE).toContain("liquidityActionAuthorized: false as const");
  });
});
