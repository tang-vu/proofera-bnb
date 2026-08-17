import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

import {
  CHAIN_ID,
  FINAL_URI_PLACEHOLDER,
  REGISTRY,
  REGISTRY_ABI,
  SET_AGENT_URI_SELECTOR,
  TRANSFER_TOPIC,
  finalRegistrationUri,
  validateRegistrationPair
} from "./erc8004-registration-evidence-lib.mjs";

const integrationRequire = createRequire(
  new URL("../packages/integrations/package.json", import.meta.url)
);
const { encodeFunctionData, toFunctionSelector } = integrationRequire("viem");

const preparation = JSON.parse(
  await readFile(
    new URL(
      "../evidence/erc8004/preparations/125510593-four-agent-registration-preparation.json",
      import.meta.url
    ),
    "utf8"
  )
);
const preparedAgent = preparation.agents[0];
const wallet = preparedAgent.wallet.toLowerCase();
const registerHash = `0x${"11".repeat(32)}`;
const updateHash = `0x${"22".repeat(32)}`;
const registerBlockHash = `0x${"33".repeat(32)}`;
const updateBlockHash = `0x${"44".repeat(32)}`;
const agentId = 123n;
const finalUri = finalRegistrationUri(preparedAgent, agentId);

function transaction(hash, input) {
  return {
    chainId: `0x${CHAIN_ID.toString(16)}`,
    from: wallet,
    hash,
    input,
    to: REGISTRY,
    value: "0x0"
  };
}

function receipt(hash, blockHash, blockNumber, transactionIndex, logs = []) {
  return {
    blockHash,
    blockNumber,
    contractAddress: null,
    effectiveGasPrice: "0x5f5e100",
    from: wallet,
    gasUsed: "0x5208",
    logs,
    status: "0x1",
    to: REGISTRY,
    transactionHash: hash,
    transactionIndex
  };
}

function transferLog() {
  return {
    address: REGISTRY,
    topics: [
      TRANSFER_TOPIC,
      `0x${"0".repeat(64)}`,
      `0x${"0".repeat(24)}${wallet.slice(2)}`,
      `0x${agentId.toString(16).padStart(64, "0")}`
    ]
  };
}

function validPair() {
  return {
    preparedAgent,
    registerHash,
    registerReceipt: receipt(registerHash, registerBlockHash, "0x64", "0x0", [transferLog()]),
    registerTransaction: transaction(
      registerHash,
      preparedAgent.initialRegistration.transaction.calldata
    ),
    updateHash,
    updateReceipt: receipt(updateHash, updateBlockHash, "0x65", "0x0"),
    updateTransaction: transaction(
      updateHash,
      encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: "setAgentURI",
        args: [agentId, finalUri]
      })
    )
  };
}

test("final registration URI replaces only the receipt-derived agent ID", () => {
  assert.equal(toFunctionSelector("setAgentURI(uint256,string)"), SET_AGENT_URI_SELECTOR);
  const encoded = finalRegistrationUri(preparedAgent, agentId);
  assert.ok(encoded.startsWith("data:application/json;base64,"));
  const decoded = JSON.parse(
    Buffer.from(encoded.slice("data:application/json;base64,".length), "base64").toString("utf8")
  );
  assert.deepEqual(decoded.registrations, [
    {
      agentId: Number(agentId),
      agentRegistry: `eip155:${CHAIN_ID}:${REGISTRY}`
    }
  ]);
  assert.equal(
    preparedAgent.completionTemplate.agentUriTemplate.registrations[0].agentId,
    FINAL_URI_PLACEHOLDER
  );
});

test("final registration URI refuses an agent ID that JSON cannot represent exactly", () => {
  assert.throws(
    () => finalRegistrationUri(preparedAgent, BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    /ERC8004_REGISTRATION_AGENT_ID_INVALID/u
  );
});

test("registration pair joins exact calldata, mint event, URI update and transaction order", () => {
  const result = validateRegistrationPair(validPair());
  assert.equal(result.agentId, agentId);
  assert.equal(result.wallet, wallet);
  assert.equal(result.finalUri, finalUri);
  assert.equal(result.registration.blockNumber, 100n);
  assert.equal(result.update.blockNumber, 101n);
});

test("registration pair rejects calldata, event, URI and ordering drift", () => {
  const wrongRegister = structuredClone(validPair());
  wrongRegister.registerTransaction.input = `${wrongRegister.registerTransaction.input.slice(0, -2)}${wrongRegister.registerTransaction.input.endsWith("00") ? "01" : "00"}`;
  assert.throws(
    () => validateRegistrationPair(wrongRegister),
    /ERC8004_REGISTRATION_CALLDATA_MISMATCH/u
  );

  const missingTransfer = structuredClone(validPair());
  missingTransfer.registerReceipt.logs = [];
  assert.throws(
    () => validateRegistrationPair(missingTransfer),
    /ERC8004_REGISTRATION_TRANSFER_EVENT_INVALID/u
  );

  const wrongUri = structuredClone(validPair());
  wrongUri.updateTransaction.input = encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "setAgentURI",
    args: [agentId, `${finalUri}drift`]
  });
  assert.throws(
    () => validateRegistrationPair(wrongUri),
    /ERC8004_REGISTRATION_URI_CALLDATA_MISMATCH/u
  );

  const reversed = structuredClone(validPair());
  reversed.updateReceipt.blockNumber = "0x63";
  assert.throws(
    () => validateRegistrationPair(reversed),
    /ERC8004_REGISTRATION_TRANSACTION_ORDER_INVALID/u
  );
});
