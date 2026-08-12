import { readFileSync } from "node:fs";

import {
  fromRlp,
  getContractAddress,
  keccak256,
  serializeTransaction,
  stringToHex,
  toRlp,
  type Hex
} from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN,
  BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
  BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
  BSC_TESTNET_PTA_RPC_ORIGIN,
  BSC_TESTNET_PTA_RUNTIME_BYTES,
  buildBscTestnetPtaDeploymentEnvelope
} from "./bsc-testnet-pta-deployment-envelope";
import {
  BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_FORMAT,
  buildBscTestnetPtaUnsignedTransaction
} from "./bsc-testnet-pta-unsigned-transaction";

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
const DEPLOYMENT_DATA = DEPLOYMENT_DATA_MATCH[1] as Hex;
const RUNTIME_PREFIX = "608060405234801561001057600080fd5b5060043610610093";
const runtimeStart = DEPLOYMENT_DATA.indexOf(RUNTIME_PREFIX, 2 + RUNTIME_PREFIX.length);
if (runtimeStart < 0) throw new Error("The reviewed runtime fixture was not found.");
const SIMULATION_RETURN_DATA = `0x${DEPLOYMENT_DATA.slice(
  runtimeStart,
  runtimeStart + BSC_TESTNET_PTA_RUNTIME_BYTES * 2
)}` as Hex;

const NOW = "2026-08-12T10:00:20.000Z";
const GOLDEN_SERIALIZED_PREFIX = "0xf90b95808405f5e100830927c08080b90b836080";
const GOLDEN_SERIALIZED_SUFFIX = "d959798f7c925076eaeff5855c5c2c1e5a49618080";
const GOLDEN_SIGNING_HASH = "0x7cea133f33e56b4ce17830ace18c61e5ae3ad531db070623535f5b22f4f58d26";

function validObservation() {
  return {
    schemaVersion: 1,
    operation: BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
    deploymentData: DEPLOYMENT_DATA,
    rpc: {
      endpointId: BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
      endpointOrigin: BSC_TESTNET_PTA_RPC_ORIGIN,
      observedAt: "2026-08-12T10:00:10.000Z",
      chainId: "97",
      blockNumber: "124634953",
      blockHash: `0x${"12".repeat(32)}`,
      blockTimestamp: "1786528800",
      blockGasLimit: "140000000",
      latestNonce: "0",
      pendingNonce: "0",
      signerCode: "0x",
      predictedContractAddress: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
      predictedContractCode: "0x",
      predictedContractNonce: "0",
      balanceWei: "1000000000000000",
      simulationReturnData: SIMULATION_RETURN_DATA,
      gasEstimate: "500000",
      feeModel: "legacy_gas_price",
      gasPriceWei: "100000000"
    },
    policy: {
      expiresAt: "2026-08-12T10:03:00.000Z",
      gasLimitMarginBps: "2000",
      maximumGasLimit: "800000",
      maximumGasPriceWei: "1000000000",
      maximumTotalCostWei: "1000000000000000"
    }
  };
}

function clock(at = NOW) {
  return { asOf: () => new Date(at) };
}

function reviewedEnvelope() {
  const result = buildBscTestnetPtaDeploymentEnvelope(validObservation(), clock());
  if (result.status !== "validated") throw new Error("Reviewed envelope fixture did not validate.");
  return result.envelope;
}

function mutableEnvelope(): Record<string, unknown> {
  return structuredClone(reviewedEnvelope()) as Record<string, unknown>;
}

function codes(result: ReturnType<typeof buildBscTestnetPtaUnsignedTransaction>) {
  return result.issues.map(({ code }) => code);
}

function recursivelySortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => recursivelySortJsonKeys(entry));
  if (value === null || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = recursivelySortJsonKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function replaceEnvelopeHash(input: Record<string, unknown>): void {
  const body = structuredClone(input);
  delete body.envelopeHash;
  delete body.hashDomain;
  input.envelopeHash = keccak256(
    stringToHex(
      `${BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN}\u0000${JSON.stringify(
        recursivelySortJsonKeys(body)
      )}`
    )
  );
}

describe("BSC testnet PTA EIP-155 signing payload", () => {
  it("serializes the reviewed contract creation deterministically without authorizing signing", () => {
    const first = buildBscTestnetPtaUnsignedTransaction(reviewedEnvelope(), clock());
    const second = buildBscTestnetPtaUnsignedTransaction(reviewedEnvelope(), clock());

    expect(first).toEqual(second);
    expect(first.status).toBe("signing_payload_serialized");
    if (first.status !== "signing_payload_serialized") {
      throw new Error("Expected serialized payload.");
    }
    const output = first.signingPayload;
    expect(output.format).toBe(BSC_TESTNET_PTA_UNSIGNED_TRANSACTION_FORMAT);
    expect(output.chainId).toBe("97");
    expect(output.expectedSigner).toEqual({
      address: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      role: "pta_testnet_deployer",
      requiredAccountType: "eoa",
      observedCode: "0x"
    });
    expect(output.deployment).toMatchObject({
      constructorRecipient: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      predictedContractAddress: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
      data: DEPLOYMENT_DATA,
      dataBytes: 2947,
      dataSha256: "45f05cb4c02100cccf74c7b2e7c31d04386642309ca2b9a9614684d0341cd239",
      dataKeccak256: "0xc5f631e51c930369f41ed53660de0c5b82a025a09ad223cb8c5d7986687cd0a1"
    });
    expect(output.transaction).toEqual({
      type: "legacy",
      eip155ReplayProtection: true,
      contractCreation: true,
      from: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      to: null,
      nonce: "0",
      valueWei: "0",
      gasLimit: "600000",
      gasPriceWei: "100000000",
      maximumCostWei: "60000000000000"
    });
    expect(output.rlp).toEqual({
      fieldCount: 9,
      chainId: "97",
      signatureR: "0x",
      signatureS: "0x"
    });
    expect(output.serializedSigningPayloadBytes).toBe(2968);
    expect(output.serializedSigningPayload.startsWith(GOLDEN_SERIALIZED_PREFIX)).toBe(true);
    expect(output.serializedSigningPayload.endsWith(GOLDEN_SERIALIZED_SUFFIX)).toBe(true);
    expect(output.signingHash).toBe(GOLDEN_SIGNING_HASH);
    expect(output.signingHash).toBe(keccak256(output.serializedSigningPayload));
    expect(output).toMatchObject({
      signatureIncluded: false,
      broadcastable: false,
      signingAuthorized: false
    });
    expect(first).toMatchObject({
      signingPayloadValid: true,
      signingReady: false,
      boundary: {
        sourceEnvelopeAuthenticityEstablished: false,
        rpcProvenanceAuthenticated: false,
        freshSignerSideRpcRecheckPerformed: false,
        rpcReadPerformed: false,
        environmentRead: false,
        secretRead: false,
        signerCreated: false,
        signatureCreated: false,
        signedTransactionCreated: false,
        transactionSubmitted: false,
        blockchainWritePerformed: false,
        executionAuthorized: false,
        signingAuthorized: false
      }
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.transaction)).toBe(true);
    expect(() => JSON.stringify(first)).not.toThrow();
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("matches viem serialization and independently decodes the exact nine-field preimage", () => {
    const result = buildBscTestnetPtaUnsignedTransaction(reviewedEnvelope(), clock());
    if (result.status !== "signing_payload_serialized") {
      throw new Error("Expected serialized payload.");
    }
    const serialized = result.signingPayload.serializedSigningPayload;
    const viemSerialized = serializeTransaction({
      type: "legacy",
      chainId: 97,
      nonce: 0,
      gasPrice: 100_000_000n,
      gas: 600_000n,
      value: 0n,
      data: DEPLOYMENT_DATA
    });
    expect(serialized).toBe(viemSerialized);
    expect(serialized).toBe(
      toRlp(["0x", "0x05f5e100", "0x0927c0", "0x", "0x", DEPLOYMENT_DATA, "0x61", "0x", "0x"])
    );
    expect(fromRlp(serialized)).toEqual([
      "0x",
      "0x05f5e100",
      "0x0927c0",
      "0x",
      "0x",
      DEPLOYMENT_DATA,
      "0x61",
      "0x",
      "0x"
    ]);
  });

  it("keeps a caller-forged but internally consistent envelope explicitly non-authorizing", () => {
    const forged = structuredClone(reviewedEnvelope());
    const result = buildBscTestnetPtaUnsignedTransaction(forged, clock());
    expect(result.status).toBe("signing_payload_serialized");
    if (result.status !== "signing_payload_serialized") {
      throw new Error("Expected serialized payload.");
    }
    expect(result).toMatchObject({
      signingReady: false,
      boundary: {
        sourceEnvelopeAuthenticityEstablished: false,
        rpcProvenanceAuthenticated: false,
        signingAuthorized: false,
        executionAuthorized: false
      }
    });
    expect(result.signingPayload).toMatchObject({
      signatureIncluded: false,
      broadcastable: false,
      signingAuthorized: false
    });
  });

  it("blocks nonce one even if its CREATE address and envelope hash are internally consistent", () => {
    const forged = mutableEnvelope();
    (forged.transaction as Record<string, unknown>).nonce = "1";
    (forged.deployment as Record<string, unknown>).predictedContractAddress = getContractAddress({
      from: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      nonce: 1n
    });
    replaceEnvelopeHash(forged);
    expect(codes(buildBscTestnetPtaUnsignedTransaction(forged, clock()))).toEqual(
      expect.arrayContaining(["NONCE_INVALID", "PREDICTED_ADDRESS_INVALID"])
    );
  });

  it("rejects tampering even when nested metadata looks plausible", () => {
    const cases: readonly [string, (input: Record<string, unknown>) => void, string][] = [
      [
        "chain",
        (input) => {
          input.chainId = 56;
        },
        "ENVELOPE_METADATA_MISMATCH"
      ],
      [
        "signer",
        (input) => {
          (input.transaction as Record<string, unknown>).from =
            "0x0000000000000000000000000000000000000001";
        },
        "TRANSACTION_METADATA_MISMATCH"
      ],
      [
        "recipient",
        (input) => {
          (input.deployment as Record<string, unknown>).recipient =
            "0x0000000000000000000000000000000000000001";
        },
        "DEPLOYMENT_METADATA_MISMATCH"
      ],
      [
        "data",
        (input) => {
          const transaction = input.transaction as Record<string, unknown>;
          transaction.data = `${DEPLOYMENT_DATA.slice(0, -1)}8`;
        },
        "DEPLOYMENT_DATA_DIGEST_MISMATCH"
      ],
      [
        "runtime",
        (input) => {
          const rpc = input.rpc as Record<string, unknown>;
          rpc.simulationReturnData = `${SIMULATION_RETURN_DATA.slice(0, -1)}8`;
        },
        "SIMULATION_DIGEST_MISMATCH"
      ],
      [
        "nonce",
        (input) => {
          (input.transaction as Record<string, unknown>).nonce = "1";
        },
        "PREDICTED_ADDRESS_MISMATCH"
      ],
      [
        "to",
        (input) => {
          (input.transaction as Record<string, unknown>).to =
            "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";
        },
        "TRANSACTION_METADATA_MISMATCH"
      ],
      [
        "value",
        (input) => {
          (input.transaction as Record<string, unknown>).valueWei = "1";
        },
        "TRANSACTION_METADATA_MISMATCH"
      ],
      [
        "gas",
        (input) => {
          (input.transaction as Record<string, unknown>).gasLimit = "800001";
        },
        "FINANCES_MISMATCH"
      ],
      [
        "gas price",
        (input) => {
          (input.transaction as Record<string, unknown>).gasPriceWei = "1000000001";
        },
        "FINANCES_MISMATCH"
      ]
    ];
    for (const [label, mutate, expected] of cases) {
      const input = mutableEnvelope();
      mutate(input);
      expect(codes(buildBscTestnetPtaUnsignedTransaction(input, clock())), label).toContain(
        expected
      );
    }
  });

  it("rejects an expired/stale envelope and noncanonical bigint strings", () => {
    expect(
      codes(
        buildBscTestnetPtaUnsignedTransaction(reviewedEnvelope(), clock("2026-08-12T10:03:00.000Z"))
      )
    ).toEqual(expect.arrayContaining(["RPC_OBSERVATION_STALE", "BLOCK_STALE", "ENVELOPE_EXPIRED"]));

    const nonce = mutableEnvelope();
    (nonce.transaction as Record<string, unknown>).nonce = "00";
    expect(codes(buildBscTestnetPtaUnsignedTransaction(nonce, clock()))).toContain("NONCE_INVALID");

    const gas = mutableEnvelope();
    (gas.transaction as Record<string, unknown>).gasLimit = "600000.0";
    expect(codes(buildBscTestnetPtaUnsignedTransaction(gas, clock()))).toContain(
      "FINANCES_INVALID"
    );

    const enormous = mutableEnvelope();
    (enormous.transaction as Record<string, unknown>).gasPriceWei = (1n << 256n).toString();
    expect(codes(buildBscTestnetPtaUnsignedTransaction(enormous, clock()))).toContain(
      "FINANCES_INVALID"
    );
  });

  it("enforces fee caps, balance, and bounded expiry on internally consistent envelopes", () => {
    const overGasLimit = mutableEnvelope();
    (overGasLimit.transaction as Record<string, unknown>).gasLimit = "900000";
    const overGasLimitFinances = overGasLimit.finances as Record<string, unknown>;
    overGasLimitFinances.gasEstimate = "750000";
    overGasLimitFinances.gasLimit = "900000";
    overGasLimitFinances.maximumCostWei = "90000000000000";
    replaceEnvelopeHash(overGasLimit);
    expect(codes(buildBscTestnetPtaUnsignedTransaction(overGasLimit, clock()))).toContain(
      "GAS_LIMIT_EXCEEDS_POLICY"
    );

    const overGasPrice = mutableEnvelope();
    (overGasPrice.transaction as Record<string, unknown>).gasPriceWei = "1500000000";
    const overGasPriceFinances = overGasPrice.finances as Record<string, unknown>;
    overGasPriceFinances.gasPriceWei = "1500000000";
    overGasPriceFinances.maximumCostWei = "900000000000000";
    replaceEnvelopeHash(overGasPrice);
    expect(codes(buildBscTestnetPtaUnsignedTransaction(overGasPrice, clock()))).toContain(
      "GAS_PRICE_EXCEEDS_POLICY"
    );

    const overTotal = mutableEnvelope();
    (overTotal.policy as Record<string, unknown>).maximumTotalCostWei = "50000000000000";
    replaceEnvelopeHash(overTotal);
    expect(codes(buildBscTestnetPtaUnsignedTransaction(overTotal, clock()))).toContain(
      "TOTAL_COST_EXCEEDS_POLICY"
    );

    const underfunded = mutableEnvelope();
    (underfunded.finances as Record<string, unknown>).balanceWei = "59999999999999";
    replaceEnvelopeHash(underfunded);
    expect(codes(buildBscTestnetPtaUnsignedTransaction(underfunded, clock()))).toContain(
      "INSUFFICIENT_BALANCE"
    );

    const excessiveLifetime = mutableEnvelope();
    (excessiveLifetime.policy as Record<string, unknown>).expiresAt = "2026-08-12T10:05:11.000Z";
    replaceEnvelopeHash(excessiveLifetime);
    expect(codes(buildBscTestnetPtaUnsignedTransaction(excessiveLifetime, clock()))).toContain(
      "ENVELOPE_LIFETIME_EXCEEDED"
    );
  });

  it("recomputes and rejects a stale source envelope hash after any body mutation", () => {
    const input = mutableEnvelope();
    input.envelopeHash = `0x${"34".repeat(32)}`;
    expect(codes(buildBscTestnetPtaUnsignedTransaction(input, clock()))).toEqual([
      "ENVELOPE_HASH_MISMATCH"
    ]);

    const badFormat = mutableEnvelope();
    badFormat.hashDomain = `${BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN}:other`;
    expect(codes(buildBscTestnetPtaUnsignedTransaction(badFormat, clock()))).toContain(
      "ENVELOPE_METADATA_MISMATCH"
    );
  });

  it("rejects extra, accessor, symbol, custom-prototype, and proxy inputs without invoking traps", () => {
    const extra = mutableEnvelope();
    extra.unexpectedField = "must-never-be-accepted";
    expect(codes(buildBscTestnetPtaUnsignedTransaction(extra, clock()))).toEqual(["INPUT_INVALID"]);

    const accessor = mutableEnvelope();
    const transaction = accessor.transaction as Record<string, unknown>;
    const data = transaction.data;
    Object.defineProperty(transaction, "data", { enumerable: true, get: () => data });
    expect(codes(buildBscTestnetPtaUnsignedTransaction(accessor, clock()))).toEqual([
      "INPUT_INVALID"
    ]);

    const symbol = mutableEnvelope();
    Object.defineProperty(symbol, Symbol("hidden"), { enumerable: true, value: true });
    expect(codes(buildBscTestnetPtaUnsignedTransaction(symbol, clock()))).toEqual([
      "INPUT_INVALID"
    ]);

    const custom = mutableEnvelope();
    Object.setPrototypeOf(custom.policy as object, { reviewed: true });
    expect(codes(buildBscTestnetPtaUnsignedTransaction(custom, clock()))).toEqual([
      "INPUT_INVALID"
    ]);

    let inputTrapCalls = 0;
    const proxied = new Proxy(reviewedEnvelope(), {
      ownKeys() {
        inputTrapCalls += 1;
        return [];
      },
      getOwnPropertyDescriptor() {
        inputTrapCalls += 1;
        return undefined;
      }
    });
    expect(codes(buildBscTestnetPtaUnsignedTransaction(proxied, clock()))).toEqual([
      "INPUT_INVALID"
    ]);
    expect(inputTrapCalls).toBe(0);
  });

  it("rejects proxy clock functions and Dates before invoking any proxy trap", () => {
    let functionTrapCalls = 0;
    const proxiedClock = new Proxy(() => new Date(NOW), {
      apply() {
        functionTrapCalls += 1;
        return new Date(NOW);
      }
    });
    expect(
      codes(buildBscTestnetPtaUnsignedTransaction(reviewedEnvelope(), { asOf: proxiedClock }))
    ).toEqual(["OPTIONS_INVALID"]);
    expect(functionTrapCalls).toBe(0);

    let dateTrapCalls = 0;
    const proxiedDate = new Proxy(new Date(NOW), {
      getPrototypeOf() {
        dateTrapCalls += 1;
        return Date.prototype;
      },
      get() {
        dateTrapCalls += 1;
        return undefined;
      }
    });
    expect(
      codes(buildBscTestnetPtaUnsignedTransaction(reviewedEnvelope(), { asOf: () => proxiedDate }))
    ).toEqual(["CLOCK_INVALID"]);
    expect(dateTrapCalls).toBe(0);

    const customPrototypeClock = () => new Date(NOW);
    Object.setPrototypeOf(customPrototypeClock, { custom: true });
    expect(
      codes(
        buildBscTestnetPtaUnsignedTransaction(reviewedEnvelope(), {
          asOf: customPrototypeClock
        })
      )
    ).toEqual(["OPTIONS_INVALID"]);
  });

  it("fails closed if the injected clock throws and never consults process or RPC", () => {
    const clockSpy = vi.fn(() => {
      throw new Error("clock failed");
    });
    expect(
      codes(buildBscTestnetPtaUnsignedTransaction(reviewedEnvelope(), { asOf: clockSpy }))
    ).toEqual(["CLOCK_INVALID"]);
    expect(clockSpy).toHaveBeenCalledTimes(1);
  });
});
