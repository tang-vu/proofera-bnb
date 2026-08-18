import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  HIRE_EVENT_TOPIC,
  computeHireReceiptHash,
  sha256Text,
  validateAndBuildHireEvidence
} from "./termix-hire-evidence-lib.mjs";

const preparation = JSON.parse(
  readFileSync("evidence/termix/hire-preparations/1787288386-hire-termix-v2.json", "utf8")
);
const runtime = JSON.parse(
  readFileSync("evidence/termix/hire-preparations/e9bb678-hire-runtime.json", "utf8")
);
const SOURCE = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";
const OWNERS = {
  1825: "0xAd03eF7e21c35FD1446c153f6eE5e6165F696990",
  1828: "0x708cb7F2b974d94005E762A140c469F1125e0cB4"
};

function materializeRuntime(runtimeCode) {
  const bytes = Buffer.from(runtimeCode.slice(2), "hex");
  const registryWord = Buffer.alloc(32);
  Buffer.from(preparation.identityRegistry.slice(2), "hex").copy(registryWord, 12);
  for (const start of [148, 625]) registryWord.copy(bytes, start);
  return `0x${bytes.toString("hex")}`;
}

function hexQuantity(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function word(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function addressWord(value) {
  return value.slice(2).toLowerCase().padStart(64, "0");
}

function hashFor(index) {
  return `0x${index.toString(16).padStart(64, "0")}`;
}

function blockHashFor(index) {
  return `0x${(index + 1_000).toString(16).padStart(64, "0")}`;
}

function operation({
  hash,
  blockNumber,
  nonce,
  to,
  input,
  value,
  contractAddress = null,
  logs = []
}) {
  const blockHash = blockHashFor(blockNumber);
  return {
    transaction: {
      hash,
      blockHash,
      blockNumber: hexQuantity(blockNumber),
      transactionIndex: "0x0",
      chainId: "0x61",
      from: SOURCE,
      to,
      nonce: hexQuantity(nonce),
      input,
      value: hexQuantity(value),
      gas: "0x30d40",
      gasPrice: "0x7270e00",
      type: "0x0"
    },
    receipt: {
      transactionHash: hash,
      blockHash,
      blockNumber: hexQuantity(blockNumber),
      transactionIndex: "0x0",
      from: SOURCE,
      to,
      status: "0x1",
      gasUsed: "0x186a0",
      effectiveGasPrice: "0x7270e00",
      contractAddress,
      cumulativeGasUsed: "0x186a0",
      logs,
      logsBloom: `0x${"00".repeat(256)}`,
      type: "0x0"
    },
    block: {
      number: hexQuantity(blockNumber),
      hash: blockHash,
      timestamp: hexQuantity(1_786_942_000 + blockNumber)
    }
  };
}

function hireLog(prepared, hash, blockNumber) {
  const owner = OWNERS[prepared.agentId];
  const receiptHash = computeHireReceiptHash({
    contractAddress: preparation.contractAddress,
    engagementId: prepared.engagementId,
    agentId: prepared.agentId,
    hirer: SOURCE,
    agentOwner: owner,
    taskHash: prepared.taskHash,
    expiresAt: prepared.expiresAt,
    paymentWei: prepared.paymentWei
  });
  return {
    address: preparation.contractAddress,
    blockHash: blockHashFor(blockNumber),
    blockNumber: hexQuantity(blockNumber),
    transactionHash: hash,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
    topics: [
      HIRE_EVENT_TOPIC,
      prepared.engagementId,
      `0x${word(prepared.agentId)}`,
      `0x${addressWord(SOURCE)}`
    ],
    data: `0x${addressWord(owner)}${prepared.taskHash.slice(2)}${word(prepared.expiresAt)}${word(
      prepared.paymentWei
    )}${receiptHash.slice(2)}`,
    receiptHash
  };
}

function fixture() {
  const deploymentHash = hashFor(1);
  const hireHashes = [hashFor(2), hashFor(3), hashFor(4)];
  const deployment = operation({
    hash: deploymentHash,
    blockNumber: 100,
    nonce: 5,
    to: null,
    input: preparation.deployment.data,
    value: 0,
    contractAddress: preparation.contractAddress
  });
  const logs = preparation.hires.map((prepared, index) =>
    hireLog(prepared, hireHashes[index], 101 + index)
  );
  const hires = preparation.hires.map((prepared, index) =>
    operation({
      hash: hireHashes[index],
      blockNumber: 101 + index,
      nonce: 6 + index,
      to: preparation.contractAddress,
      input: prepared.calldata,
      value: prepared.paymentWei,
      logs: [logs[index]]
    })
  );
  const receiptStates = Object.fromEntries(
    preparation.hires.map((prepared, index) => [prepared.engagementId, logs[index].receiptHash])
  );
  return {
    preparation,
    hashes: { deployment: deploymentHash, hires: hireHashes },
    deployment,
    hires,
    finalBlock: { number: "0x73", hash: blockHashFor(115), timestamp: "0x6a87d000" },
    runtimeCode: materializeRuntime(runtime.runtimeCode),
    ownerStates: OWNERS,
    receiptStates,
    verifiedAtUtc: "2026-08-17T05:10:00.000Z",
    sourceCommit: "0123456789abcdef0123456789abcdef01234567",
    preparationPath: "evidence/termix/hire-preparations/1787288386-hire-termix-v2.json",
    preparationSha256: "d2f945588c3dd7d8403c713e7119ea3f53bc9bea6ce5ead073dc91b7037b6a5b",
    providers: [
      { name: "bnb-chain", url: "https://data-seed-prebsc-2-s2.binance.org:8545" },
      { name: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" }
    ]
  };
}

test("builds three runner-compatible finalized hire receipts without performance claims", () => {
  const manifest = validateAndBuildHireEvidence(fixture());
  assert.equal(manifest.claims.contractDeployed, true);
  assert.equal(manifest.claims.threePaidHiresFinalized, true);
  assert.equal(manifest.claims.termixRunsCompleted, false);
  assert.equal(manifest.classification.agentPerformance, false);
  assert.equal(manifest.hires.length, 3);
  for (const { termixHireReceipt } of manifest.hires) {
    assert.equal(termixHireReceipt.state, "verified");
    assert.equal(termixHireReceipt.chainId, 97);
    assert.equal(sha256Text(termixHireReceipt.rawReceipt), termixHireReceipt.rawReceiptSha256);
    assert.match(termixHireReceipt.explorerUrl, /testnet\.bscscan\.com\/tx\/0x/u);
  }
  assert.equal(manifest.economics.totalHirePaymentWei, "30000000000000");
  assert.equal(manifest.economics.totalGasCostWei, "48000000000000");
});

test("rejects event, runtime, finality and calldata drift", () => {
  const eventDrift = fixture();
  eventDrift.hires[0].receipt.logs[0].data = `${eventDrift.hires[0].receipt.logs[0].data.slice(0, -1)}0`;
  assert.throws(
    () => validateAndBuildHireEvidence(eventDrift),
    /HIRE_EVIDENCE_RECEIPT_HASH_MISMATCH/u
  );

  const runtimeDrift = fixture();
  runtimeDrift.runtimeCode = `${runtimeDrift.runtimeCode.slice(0, -2)}00`;
  assert.throws(
    () => validateAndBuildHireEvidence(runtimeDrift),
    /HIRE_EVIDENCE_RUNTIME_HASH_MISMATCH/u
  );

  const finalityDrift = fixture();
  finalityDrift.finalBlock.number = "0x72";
  assert.throws(() => validateAndBuildHireEvidence(finalityDrift), /HIRE_EVIDENCE_NOT_FINALIZED/u);

  const calldataDrift = fixture();
  calldataDrift.hires[1].transaction.input = `${calldataDrift.hires[1].transaction.input.slice(0, -1)}0`;
  assert.throws(
    () => validateAndBuildHireEvidence(calldataDrift),
    /HIRE_EVIDENCE_HIRE_TRANSACTION_MISMATCH/u
  );
});

test("collector refuses missing invocation before Git, RPC or output", () => {
  const result = spawnSync(process.execPath, ["scripts/capture-termix-hire-evidence.mjs"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "HIRE_CAPTURE_EXACT_FLAG_REQUIRED\n");
});

test("collector is fixed to read-only RPC and create-only evidence output", () => {
  const source = readFileSync("scripts/capture-termix-hire-evidence.mjs", "utf8");
  assert.doesNotMatch(
    source,
    /eth_sendRawTransaction|eth_sendTransaction|wallet_sendCalls|signTransaction|privateKey/u
  );
  assert.match(source, /"eth_getTransactionByHash"/u);
  assert.match(source, /"eth_getTransactionReceipt"/u);
  assert.match(source, /"eth_getCode"/u);
  assert.match(source, /"eth_call"/u);
  assert.match(source, /openSync\(path, "wx"/u);
});
