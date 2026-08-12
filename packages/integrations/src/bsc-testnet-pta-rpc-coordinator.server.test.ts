import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  coordinateBscTestnetPtaDeploymentForTests,
  prepareBscTestnetPtaDeploymentEnvelope,
  type BscTestnetPtaRpcCoordinatorClient,
  type BscTestnetPtaRpcCoordinatorRequest
} from "./bsc-testnet-pta-rpc-coordinator.server";

const ENVELOPE_TEST_SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-deployment-envelope.test.ts", import.meta.url),
  "utf8"
);
const DEPLOYMENT_DATA_MATCH = /const DEPLOYMENT_DATA =\s+"(0x[0-9a-f]+)";/u.exec(
  ENVELOPE_TEST_SOURCE
);
if (DEPLOYMENT_DATA_MATCH?.[1] === undefined) {
  throw new Error("The reviewed deployment fixture was not found.");
}
const DEPLOYMENT_DATA = DEPLOYMENT_DATA_MATCH[1];
const RUNTIME_PREFIX = "608060405234801561001057600080fd5b5060043610610093";
const runtimeStart = DEPLOYMENT_DATA.indexOf(RUNTIME_PREFIX, 2 + RUNTIME_PREFIX.length);
if (runtimeStart < 0) throw new Error("The reviewed runtime fixture was not found.");
const SIMULATION_RETURN_DATA = `0x${DEPLOYMENT_DATA.slice(runtimeStart, runtimeStart + 1_826 * 2)}`;

const BLOCK_HASH = `0x${"12".repeat(32)}`;
const BLOCK = {
  number: "0x76dc749",
  hash: BLOCK_HASH,
  timestamp: "0x6a7c5100",
  gasLimit: "0x8583b00"
};
const NOW = "2026-08-12T10:55:20.000Z";

interface ClientChanges {
  readonly chainId?: unknown;
  readonly block?: unknown;
  readonly balance?: unknown;
  readonly latestNonce?: unknown;
  readonly pendingNonce?: unknown;
  readonly signerCode?: unknown;
  readonly targetCode?: unknown;
  readonly targetNonce?: unknown;
  readonly gasPrice?: unknown;
  readonly gasEstimate?: unknown;
  readonly simulation?: unknown;
  readonly throwMethod?: BscTestnetPtaRpcCoordinatorRequest["method"];
}

function fakeClient(changes: ClientChanges = {}) {
  const calls: BscTestnetPtaRpcCoordinatorRequest[] = [];
  const client: BscTestnetPtaRpcCoordinatorClient = {
    async request(request) {
      calls.push(request);
      if (changes.throwMethod === request.method) throw new Error("secret transport detail");
      switch (request.method) {
        case "eth_chainId":
          return "chainId" in changes ? changes.chainId : "0x61";
        case "eth_getBlockByNumber":
          return "block" in changes ? changes.block : BLOCK;
        case "eth_getBalance":
          return "balance" in changes ? changes.balance : "0xde0b6b3a7640000";
        case "eth_getTransactionCount": {
          const selector = request.params[1];
          if (selector === "latest") {
            return "latestNonce" in changes ? changes.latestNonce : "0x0";
          }
          if (selector === "pending") {
            return "pendingNonce" in changes ? changes.pendingNonce : "0x0";
          }
          return "targetNonce" in changes ? changes.targetNonce : "0x0";
        }
        case "eth_getCode":
          return request.params[0] === "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49"
            ? "signerCode" in changes
              ? changes.signerCode
              : "0x"
            : "targetCode" in changes
              ? changes.targetCode
              : "0x";
        case "eth_gasPrice":
          return "gasPrice" in changes ? changes.gasPrice : "0x5f5e100";
        case "eth_estimateGas":
          return "gasEstimate" in changes ? changes.gasEstimate : "0x7a120";
        case "eth_call":
          return "simulation" in changes ? changes.simulation : SIMULATION_RETURN_DATA;
      }
    }
  };
  return { client, calls };
}

function run(primary: ClientChanges = {}, corroborator: ClientChanges = {}) {
  const first = fakeClient(primary);
  const second = fakeClient(corroborator);
  return {
    result: coordinateBscTestnetPtaDeploymentForTests(DEPLOYMENT_DATA, {
      primaryClient: first.client,
      corroboratorClient: second.client,
      now: () => new Date(NOW)
    }),
    first,
    second
  };
}

describe("BSC testnet PTA RPC coordinator", () => {
  it("corroborates every material read and returns observation evidence, not signing authority", async () => {
    const execution = run();
    const result = await execution.result;

    expect(result.status).toBe("observed");
    if (result.status !== "observed") return;
    expect(result).toMatchObject({
      signingReady: false,
      envelopeValid: true,
      observation: {
        blockNumber: "124634953",
        blockHash: BLOCK_HASH,
        blockTimestamp: "1786532096",
        blockGasLimit: "140000000",
        gasEstimateBlockSelection: "latest",
        providerAgreementVerified: true,
        coordinatorObservationDigest: expect.stringMatching(/^0x[0-9a-f]{64}$/u)
      },
      finances: {
        balanceWei: "1000000000000000000",
        gasEstimate: "500000",
        gasLimit: "600000",
        gasPriceWei: "100000000"
      },
      boundary: {
        rpcReadPerformed: true,
        providerAgreementVerified: true,
        signingAuthorized: false,
        envelopeAloneAuthorizesSigning: false,
        freshRecheckRequiredBeforeSigning: true,
        observationDigestAuthenticatesProvider: false,
        executionAuthorized: false,
        transactionSubmitted: false
      }
    });
    expect(result.observation.sources.map(({ origin }) => origin)).toEqual([
      "https://bsc-testnet-dataseed.bnbchain.org",
      "https://bsc-testnet.bnbchain.org"
    ]);
    expect(execution.first.calls[1]).toEqual({
      method: "eth_getBlockByNumber",
      params: ["finalized", false]
    });
    expect(execution.second.calls[1]).toEqual({
      method: "eth_getBlockByNumber",
      params: ["0x76dc749", false]
    });
    expect(execution.first.calls).toHaveLength(11);
    expect(execution.second.calls).toHaveLength(11);
    expect(execution.first.calls.find(({ method }) => method === "eth_estimateGas")).toEqual({
      method: "eth_estimateGas",
      params: [
        {
          from: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
          data: DEPLOYMENT_DATA,
          value: "0x0"
        }
      ]
    });
  });

  it("keeps a truthful zero-balance observation blocked", async () => {
    const result = await run({ balance: "0x0" }, { balance: "0x0" }).result;
    expect(result.status).toBe("blocked");
    expect(result.signingReady).toBe(false);
    if (result.status !== "blocked") return;
    expect(result.issues.map(({ code }) => code)).toContain("INSUFFICIENT_BALANCE");
    expect(result.finances).toMatchObject({ balanceWei: "0" });
    expect(result.observation.coordinatorObservationDigest).toBeNull();
    expect(result.boundary.providerAgreementVerified).toBe(true);
  });

  it.each([
    ["block hash", {}, { block: { ...BLOCK, hash: `0x${"34".repeat(32)}` } }, "block"],
    ["balance", {}, { balance: "0x2" }, "account"],
    ["pending nonce", {}, { pendingNonce: "0x1" }, "account"],
    ["gas price", {}, { gasPrice: "0x5f5e101" }, "account"],
    ["target code", {}, { targetCode: "0x00" }, "simulation"],
    ["gas estimate", {}, { gasEstimate: "0x7a121" }, "simulation"],
    ["simulation", {}, { simulation: "0x00" }, "simulation"]
  ] as const)("fails closed on provider drift: %s", async (_label, primary, second, stage) => {
    const result = await run(primary, second).result;
    expect(result).toMatchObject({
      status: "unavailable",
      signingReady: false,
      stage,
      reason: "provider_disagreement",
      envelope: null,
      observation: null
    });
  });

  it.each([
    ["wrong chain", { chainId: "0x38" }, "chain", "chain_mismatch"],
    ["decimal chain", { chainId: "97" }, "chain", "malformed_rpc_response"],
    [
      "malformed block",
      { block: { ...BLOCK, number: "124634953" } },
      "block",
      "malformed_rpc_response"
    ],
    ["target collision", { targetCode: "0x00" }, "envelope", "blocked"],
    ["transport error", { throwMethod: "eth_call" }, "simulation", "rpc_request_failed"]
  ] as const)(
    "handles %s without leaking provider errors",
    async (_label, changes, stage, reason) => {
      const result = await run(changes, changes).result;
      if (reason === "blocked") {
        expect(result.status).toBe("blocked");
        if (result.status === "blocked") {
          expect(result.issues.map(({ code }) => code)).toContain("TARGET_CODE_PRESENT");
        }
        return;
      }
      expect(result).toMatchObject({ status: "unavailable", stage, reason });
      expect(JSON.stringify(result)).not.toContain("secret transport detail");
    }
  );

  it("rejects stale blocks and tampered deployment bytes before authority can be implied", async () => {
    const stale = await run(
      { block: { ...BLOCK, timestamp: "0x6a7c5000" } },
      { block: { ...BLOCK, timestamp: "0x6a7c5000" } }
    ).result;
    expect(stale).toMatchObject({ status: "unavailable", reason: "stale_block" });

    const primary = fakeClient();
    const second = fakeClient();
    const tampered = await coordinateBscTestnetPtaDeploymentForTests(
      `${DEPLOYMENT_DATA.slice(0, -1)}8`,
      {
        primaryClient: primary.client,
        corroboratorClient: second.client,
        now: () => new Date(NOW)
      }
    );
    expect(tampered).toMatchObject({
      status: "unavailable",
      reason: "invalid_deployment_data",
      attemptedAt: NOW
    });
    expect(primary.calls).toHaveLength(0);
    expect(second.calls).toHaveLength(0);
  });

  it("rejects a proxied clock result without invoking reflection traps", async () => {
    let prototypeTrapCalls = 0;
    const proxiedDate = new Proxy(new Date(NOW), {
      getPrototypeOf: () => {
        prototypeTrapCalls += 1;
        return Date.prototype;
      }
    });
    const primary = fakeClient();
    const second = fakeClient();
    const result = await coordinateBscTestnetPtaDeploymentForTests(DEPLOYMENT_DATA, {
      primaryClient: primary.client,
      corroboratorClient: second.client,
      now: () => proxiedDate
    });
    expect(result).toMatchObject({ status: "unavailable", reason: "invalid_clock" });
    expect(prototypeTrapCalls).toBe(0);
    expect(primary.calls).toHaveLength(0);
    expect(second.calls).toHaveLength(0);
  });

  it("bounds production RPC response bodies without exposing their contents", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("x".repeat(1024 * 1024 + 1), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
      )
    );
    try {
      const result = await prepareBscTestnetPtaDeploymentEnvelope(DEPLOYMENT_DATA);
      expect(result).toMatchObject({
        status: "unavailable",
        stage: "chain",
        reason: "rpc_response_too_large"
      });
      expect(JSON.stringify(result)).not.toContain("xxxxx");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("maps a production transport timeout to its active coordinator stage", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        id: number;
        method: BscTestnetPtaRpcCoordinatorRequest["method"];
        params: readonly unknown[];
      };
      if (request.method === "eth_call") {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("secret timeout detail", "AbortError"));
          });
        });
      }
      const result = (() => {
        switch (request.method) {
          case "eth_chainId":
            return "0x61";
          case "eth_getBlockByNumber":
            return BLOCK;
          case "eth_getBalance":
            return "0xde0b6b3a7640000";
          case "eth_getTransactionCount":
            return "0x0";
          case "eth_getCode":
            return "0x";
          case "eth_gasPrice":
            return "0x5f5e100";
          case "eth_estimateGas":
            return "0x7a120";
        }
      })();
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const pending = prepareBscTestnetPtaDeploymentEnvelope(DEPLOYMENT_DATA);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(4_001);
      const result = await pending;
      expect(result).toMatchObject({
        status: "unavailable",
        stage: "simulation",
        reason: "rpc_timeout"
      });
      expect(JSON.stringify(result)).not.toContain("secret timeout detail");
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
