import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  coordinateBscTestnetPtaWbnbPoolInitializationForTests,
  type BscTestnetPtaWbnbPoolRpcClient,
  type BscTestnetPtaWbnbPoolRpcRequest
} from "./bsc-testnet-pta-wbnb-pool-coordinator.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  deriveBscTestnetPtaWbnbPoolInitializationEnvelopeHash,
  type BscTestnetPtaWbnbPoolInitializationEnvelope,
  type BscTestnetPtaWbnbPoolInitializationEnvelopeBody
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import { describeBscTestnetPtaWbnbPoolOneShotBoundary } from "./bsc-testnet-pta-wbnb-pool-one-shot-boundary.server";

const TRANSCRIPT = JSON.parse(
  readFileSync(
    new URL(
      "../../../evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json",
      import.meta.url
    ),
    "utf8"
  )
) as { reads: Array<{ label: string; result: { normalizedResult: string } }> };

const NOW = "2026-08-13T10:00:30.000Z";
const BLOCK_HASH = `0x${"42".repeat(32)}`;
const ZERO_WORD = `0x${"00".repeat(32)}`;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CANDIDATE = "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE";
const ADDRESSES = {
  pta: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
  wbnb: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
  factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  deployer: "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
  manager: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
  owner: "0x261AF0030618a52FA767997ed310174b3Bc3B77F",
  lm: "0x7F1745eb74D26877EC54dd9A317CC930Ad01350c",
  sender: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49"
} as const;

function code(label: string): string {
  const value = TRANSCRIPT.reads.find((read) => read.label === label)?.result.normalizedResult;
  if (value === undefined) throw new TypeError(label);
  return value;
}

const CODES = new Map([
  [ADDRESSES.pta.toLowerCase(), code("code.pta")],
  [ADDRESSES.wbnb.toLowerCase(), code("code.wbnb")],
  [ADDRESSES.factory.toLowerCase(), code("code.factory")],
  [ADDRESSES.deployer.toLowerCase(), code("code.pool_deployer")],
  [ADDRESSES.manager.toLowerCase(), code("code.position_manager")]
]);

function addressWord(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function uintWord(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function client(): BscTestnetPtaWbnbPoolRpcClient {
  return {
    async request(request: BscTestnetPtaWbnbPoolRpcRequest) {
      switch (request.method) {
        case "eth_chainId":
          return "0x61";
        case "eth_getBlockByNumber":
          return {
            number: "0x7704c00",
            hash: BLOCK_HASH,
            timestamp: `0x${(Math.floor(Date.parse(NOW) / 1_000) - 30).toString(16)}`,
            gasLimit: "0x8583b00"
          };
        case "eth_getCode": {
          const address = request.params[0].toLowerCase();
          if (address === ADDRESSES.sender.toLowerCase() || address === CANDIDATE.toLowerCase()) {
            return "0x";
          }
          return CODES.get(address) ?? "0x";
        }
        case "eth_getStorageAt":
          return ZERO_WORD;
        case "eth_getTransactionCount":
          return request.params[0].toLowerCase() === ADDRESSES.sender.toLowerCase() ? "0x1" : "0x0";
        case "eth_getBalance":
          return "0x16312e1b2439d00";
        case "eth_gasPrice":
          return "0x5f5e100";
        case "eth_estimateGas":
          return "0x4c16b3";
        case "eth_call": {
          const selector = request.params[0].data.slice(0, 10);
          switch (selector) {
            case "0x13ead562":
              return addressWord(CANDIDATE);
            case "0xc45a0155":
            case "0x966dae0e":
              return addressWord(ADDRESSES.factory);
            case "0xd5f39488":
            case "0x3119049a":
              return addressWord(ADDRESSES.deployer);
            case "0x4aa4a4fc":
              return addressWord(ADDRESSES.wbnb);
            case "0x8da5cb5b":
              return addressWord(ADDRESSES.owner);
            case "0x5e492ac8":
              return addressWord(ADDRESSES.lm);
            case "0x89035730":
              return `0x${"0".repeat(320)}`;
            case "0x22afcccb":
              return uintWord(10n);
            case "0x88e8006d":
              return `${uintWord(0n)}${uintWord(1n).slice(2)}`;
            case "0x1698ee82":
              return addressWord(ZERO_ADDRESS);
            default:
              throw new TypeError(selector);
          }
        }
      }
    }
  };
}

async function envelope(): Promise<BscTestnetPtaWbnbPoolInitializationEnvelope> {
  const result = await coordinateBscTestnetPtaWbnbPoolInitializationForTests({
    primaryClient: client(),
    corroboratorClient: client(),
    now: () => new Date(NOW)
  });
  if (result.status !== "observed") throw new TypeError(result.reason);
  return result.envelope;
}

function deepFrozenClone<Value>(value: Value): Value {
  const clone = structuredClone(value);
  function freeze(candidate: unknown): void {
    if (candidate !== null && typeof candidate === "object") {
      for (const nested of Object.values(candidate)) freeze(nested);
      Object.freeze(candidate);
    }
  }
  freeze(clone);
  return clone;
}

function rehash(
  changed: BscTestnetPtaWbnbPoolInitializationEnvelope
): BscTestnetPtaWbnbPoolInitializationEnvelope {
  const body: BscTestnetPtaWbnbPoolInitializationEnvelopeBody = {
    schemaVersion: changed.schemaVersion,
    operation: changed.operation,
    chainId: changed.chainId,
    transaction: changed.transaction,
    initializer: changed.initializer,
    observation: changed.observation,
    caps: changed.caps,
    expiresAt: changed.expiresAt,
    raceBoundary: changed.raceBoundary,
    authorization: changed.authorization
  };
  return Object.freeze({
    ...body,
    envelopeHash: deriveBscTestnetPtaWbnbPoolInitializationEnvelopeHash(body)
  });
}

describe("PTA/WBNB durable one-shot boundary specification", () => {
  it("describes exact future seams while remaining wholly non-authorizing", async () => {
    const prepared = describeBscTestnetPtaWbnbPoolOneShotBoundary(
      await envelope(),
      () => new Date("2026-08-13T10:00:40.000Z")
    );
    expect(prepared).toMatchObject({
      status: "prepared_non_authorizing",
      operationKey: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
      envelopeObservedAt: NOW,
      exactBinding: {
        chainId: 97,
        from: ADDRESSES.sender,
        nonce: 1n,
        to: ADDRESSES.manager,
        selector: "0x13ead562",
        data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA,
        dataKeccak256: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
        valueWei: 0n,
        gasLimit: 5_983_857n,
        gasPriceWei: 100_000_000n
      },
      signingReady: false,
      signingAuthorized: false,
      executionAuthorized: false,
      authorizationReceiptCreated: false,
      journalClaimCreated: false,
      signerInvoked: false,
      signatureCreated: false,
      transactionSubmitted: false,
      requirements: {
        externalExactAuthorizationRequired: true,
        durableAtomicClaimRequiredBeforeCustodyAccess: true,
        freshPendingNonceAndPoolRecheckRequiredAfterClaim: true,
        ambiguousClaimOrSigningOutcomeIsNonRetryableUntilReconciled: true,
        journalMustPersistSignedBytesBeforeSubmission: true,
        postSubmissionCanonicalReceiptReconciliationRequired: true
      }
    });
  });

  it("keeps one durable operation key across refreshable observation envelopes", async () => {
    const first = await envelope();
    const refreshed = deepFrozenClone(first);
    const refreshedBody: BscTestnetPtaWbnbPoolInitializationEnvelopeBody = {
      schemaVersion: refreshed.schemaVersion,
      operation: refreshed.operation,
      chainId: refreshed.chainId,
      transaction: refreshed.transaction,
      initializer: refreshed.initializer,
      observation: Object.freeze({
        ...refreshed.observation,
        observedAt: "2026-08-13T10:00:31.000Z"
      }),
      caps: refreshed.caps,
      expiresAt: "2026-08-13T10:05:31.000Z",
      raceBoundary: refreshed.raceBoundary,
      authorization: refreshed.authorization
    };
    const second = Object.freeze({
      ...refreshedBody,
      envelopeHash: deriveBscTestnetPtaWbnbPoolInitializationEnvelopeHash(refreshedBody)
    });
    const firstDescriptor = describeBscTestnetPtaWbnbPoolOneShotBoundary(
      first,
      () => new Date("2026-08-13T10:00:40.000Z")
    );
    const secondDescriptor = describeBscTestnetPtaWbnbPoolOneShotBoundary(
      second,
      () => new Date("2026-08-13T10:00:40.000Z")
    );
    expect(firstDescriptor.status).toBe("prepared_non_authorizing");
    expect(secondDescriptor.status).toBe("prepared_non_authorizing");
    if (
      firstDescriptor.status !== "prepared_non_authorizing" ||
      secondDescriptor.status !== "prepared_non_authorizing"
    ) {
      return;
    }
    expect(secondDescriptor.envelopeHash).not.toBe(firstDescriptor.envelopeHash);
    expect(secondDescriptor.operationKey).toBe(firstDescriptor.operationKey);
  });

  it("requires the exact 300-second envelope lifetime", async () => {
    const exact = await envelope();
    expect(
      describeBscTestnetPtaWbnbPoolOneShotBoundary(
        exact,
        () => new Date("2026-08-13T10:00:40.000Z")
      )
    ).toMatchObject({ status: "prepared_non_authorizing" });

    const extended = rehash(
      Object.freeze({ ...deepFrozenClone(exact), expiresAt: "2026-08-13T10:05:30.001Z" })
    );
    expect(
      describeBscTestnetPtaWbnbPoolOneShotBoundary(
        extended,
        () => new Date("2026-08-13T10:00:40.000Z")
      )
    ).toMatchObject({ status: "blocked", reason: "invalid_envelope" });
  });

  it("rejects a recomputed-hash forgery in every nested exact boundary", async () => {
    const original = await envelope();
    const forged = deepFrozenClone(original);
    const changed = {
      ...forged,
      initializer: Object.freeze({ ...forged.initializer, fee: "501" as "500" })
    };
    const rehashed = rehash(Object.freeze(changed));
    expect(
      describeBscTestnetPtaWbnbPoolOneShotBoundary(rehashed, () => new Date(NOW))
    ).toMatchObject({ status: "blocked", reason: "invalid_envelope" });

    const extra = deepFrozenClone(original) as BscTestnetPtaWbnbPoolInitializationEnvelope & {
      transaction: BscTestnetPtaWbnbPoolInitializationEnvelope["transaction"] & { extra?: boolean };
    };
    const transactionWithExtra = Object.freeze({ ...extra.transaction, extra: true });
    const extraEnvelope = rehash(
      Object.freeze({
        ...extra,
        transaction: transactionWithExtra
      }) as BscTestnetPtaWbnbPoolInitializationEnvelope
    );
    expect(
      describeBscTestnetPtaWbnbPoolOneShotBoundary(extraEnvelope, () => new Date(NOW))
    ).toMatchObject({ status: "blocked", reason: "invalid_envelope" });

    for (const observation of [
      Object.freeze({ ...original.observation, candidateCode: "0x01" as "0x" }),
      Object.freeze({ ...original.observation, candidateNonce: "1" as "0" })
    ]) {
      const candidateForgery = rehash(
        Object.freeze({
          ...original,
          observation
        }) as BscTestnetPtaWbnbPoolInitializationEnvelope
      );
      expect(
        describeBscTestnetPtaWbnbPoolOneShotBoundary(candidateForgery, () => new Date(NOW))
      ).toMatchObject({ status: "blocked", reason: "invalid_envelope" });
    }
  });

  it("rejects expired envelopes and proxy/accessor clocks trap-zero", async () => {
    const original = await envelope();
    expect(
      describeBscTestnetPtaWbnbPoolOneShotBoundary(
        original,
        () => new Date("2026-08-13T10:05:30.000Z")
      )
    ).toMatchObject({ status: "blocked", reason: "expired_envelope" });

    let proxyCalls = 0;
    const proxyClock = new Proxy(() => new Date(NOW), {
      apply() {
        proxyCalls += 1;
        throw new Error("must not execute");
      }
    });
    expect(describeBscTestnetPtaWbnbPoolOneShotBoundary(original, proxyClock)).toMatchObject({
      status: "blocked",
      reason: "invalid_clock"
    });
    expect(proxyCalls).toBe(0);

    let dateAccessorCalls = 0;
    const dateWithAccessor = new Date(NOW);
    Object.defineProperty(dateWithAccessor, "hidden", {
      get() {
        dateAccessorCalls += 1;
        return true;
      }
    });
    expect(
      describeBscTestnetPtaWbnbPoolOneShotBoundary(original, () => dateWithAccessor)
    ).toMatchObject({ status: "blocked", reason: "invalid_clock" });
    expect(dateAccessorCalls).toBe(0);
  });
});
