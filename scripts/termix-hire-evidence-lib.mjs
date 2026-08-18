import { createHash } from "node:crypto";

import { keccak256Bytes } from "./pancake-selector-review/review-lib.mjs";

export const HIRE_EVIDENCE_SCHEMA_VERSION = "proofera-termix-hire-evidence-v1.0.0";
export const HIRE_EVENT_TOPIC =
  "0x056bb0724c406420fb4961e32735016984ec1231d987795e31fa362aa79eb947";
export const EXPECTED_RUNTIME_KECCAK256 =
  "0xf5e90b8e01c3b3cc9e9d629dce7ec367ba41e21cc64842decd9e5f4ab69a46ec";
export const EXPECTED_RUNTIME_BYTES = 1355;
export const FINALITY_DEPTH = 12n;

const CHAIN_ID = 97n;
const SOURCE = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";
const EXPECTED_OWNERS = Object.freeze({
  1825: "0xAd03eF7e21c35FD1446c153f6eE5e6165F696990",
  1828: "0x708cb7F2b974d94005E762A140c469F1125e0cB4"
});

function fail(code) {
  throw new Error(code);
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exactHex(value, bytes, code) {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`, "u").test(value)) {
    fail(code);
  }
  return value.toLowerCase();
}

function address(value, code) {
  return `0x${exactHex(value, 20, code).slice(2)}`;
}

function quantity(value, code) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/u.test(value)) {
    fail(code);
  }
  return BigInt(value);
}

function decimal(value, code) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) fail(code);
  return BigInt(value);
}

function word(value, code) {
  return exactHex(value, 32, code).slice(2);
}

function numberWord(value) {
  if (value < 0n || value >= 1n << 256n) fail("HIRE_EVIDENCE_UINT256_INVALID");
  return value.toString(16).padStart(64, "0");
}

function addressWord(value) {
  return address(value, "HIRE_EVIDENCE_ADDRESS_INVALID").slice(2).padStart(64, "0");
}

export function computeHireReceiptHash({
  contractAddress,
  engagementId,
  agentId,
  hirer,
  agentOwner,
  taskHash,
  expiresAt,
  paymentWei
}) {
  const encoded = Buffer.from(
    [
      numberWord(CHAIN_ID),
      addressWord(contractAddress),
      word(engagementId, "HIRE_EVIDENCE_ENGAGEMENT_INVALID"),
      numberWord(BigInt(agentId)),
      addressWord(hirer),
      addressWord(agentOwner),
      word(taskHash, "HIRE_EVIDENCE_TASK_HASH_INVALID"),
      numberWord(BigInt(expiresAt)),
      numberWord(BigInt(paymentWei))
    ].join(""),
    "hex"
  );
  return keccak256Bytes(encoded);
}

function decodeHireEvent(log, prepared, contractAddress) {
  if (
    address(log.address, "HIRE_EVIDENCE_LOG_ADDRESS_INVALID") !== contractAddress.toLowerCase() ||
    log.topics?.length !== 4 ||
    exactHex(log.topics[0], 32, "HIRE_EVIDENCE_EVENT_TOPIC_INVALID") !== HIRE_EVENT_TOPIC
  ) {
    fail("HIRE_EVIDENCE_EVENT_SCOPE_INVALID");
  }
  const engagementId = exactHex(log.topics[1], 32, "HIRE_EVIDENCE_ENGAGEMENT_INVALID");
  const agentId = BigInt(log.topics[2]).toString();
  const hirer = `0x${word(log.topics[3], "HIRE_EVIDENCE_HIRER_TOPIC_INVALID").slice(-40)}`;
  const data = exactHex(log.data, 160, "HIRE_EVIDENCE_EVENT_DATA_INVALID").slice(2);
  const words = Array.from({ length: 5 }, (_, index) => data.slice(index * 64, (index + 1) * 64));
  const agentOwner = `0x${words[0].slice(-40)}`;
  const taskHash = `0x${words[1]}`;
  const expiresAt = BigInt(`0x${words[2]}`).toString();
  const paymentWei = BigInt(`0x${words[3]}`).toString();
  const receiptHash = `0x${words[4]}`;
  const expectedOwner = EXPECTED_OWNERS[prepared.agentId]?.toLowerCase();
  if (
    engagementId !== prepared.engagementId.toLowerCase() ||
    agentId !== prepared.agentId ||
    hirer !== SOURCE.toLowerCase() ||
    agentOwner !== expectedOwner ||
    taskHash !== prepared.taskHash.toLowerCase() ||
    expiresAt !== prepared.expiresAt ||
    paymentWei !== prepared.paymentWei
  ) {
    fail("HIRE_EVIDENCE_EVENT_BINDING_MISMATCH");
  }
  const expectedReceiptHash = computeHireReceiptHash({
    contractAddress,
    engagementId,
    agentId,
    hirer,
    agentOwner,
    taskHash,
    expiresAt,
    paymentWei
  });
  if (receiptHash !== expectedReceiptHash) fail("HIRE_EVIDENCE_RECEIPT_HASH_MISMATCH");
  return Object.freeze({
    engagementId,
    agentId,
    hirer,
    agentOwner,
    taskHash,
    expiresAt,
    paymentWei,
    receiptHash
  });
}

function validateJoin(operation, expectedHash) {
  const transactionHash = exactHex(
    operation.transaction?.hash,
    32,
    "HIRE_EVIDENCE_TX_HASH_INVALID"
  );
  if (
    transactionHash !== expectedHash.toLowerCase() ||
    exactHex(operation.receipt?.transactionHash, 32, "HIRE_EVIDENCE_RECEIPT_TX_INVALID") !==
      transactionHash ||
    quantity(operation.receipt?.status, "HIRE_EVIDENCE_STATUS_INVALID") !== 1n ||
    exactHex(operation.transaction?.blockHash, 32, "HIRE_EVIDENCE_TX_BLOCK_HASH_INVALID") !==
      exactHex(operation.receipt?.blockHash, 32, "HIRE_EVIDENCE_RECEIPT_BLOCK_HASH_INVALID") ||
    quantity(operation.transaction?.blockNumber, "HIRE_EVIDENCE_TX_BLOCK_INVALID") !==
      quantity(operation.receipt?.blockNumber, "HIRE_EVIDENCE_RECEIPT_BLOCK_INVALID") ||
    quantity(operation.transaction?.transactionIndex, "HIRE_EVIDENCE_TX_INDEX_INVALID") !==
      quantity(operation.receipt?.transactionIndex, "HIRE_EVIDENCE_RECEIPT_INDEX_INVALID") ||
    exactHex(operation.block?.hash, 32, "HIRE_EVIDENCE_BLOCK_HASH_INVALID") !==
      exactHex(operation.receipt?.blockHash, 32, "HIRE_EVIDENCE_RECEIPT_BLOCK_HASH_INVALID") ||
    quantity(operation.block?.number, "HIRE_EVIDENCE_BLOCK_NUMBER_INVALID") !==
      quantity(operation.receipt?.blockNumber, "HIRE_EVIDENCE_RECEIPT_BLOCK_INVALID") ||
    address(operation.transaction?.from, "HIRE_EVIDENCE_TX_FROM_INVALID") !==
      SOURCE.toLowerCase() ||
    address(operation.receipt?.from, "HIRE_EVIDENCE_RECEIPT_FROM_INVALID") !== SOURCE.toLowerCase()
  ) {
    fail("HIRE_EVIDENCE_TRANSACTION_RECEIPT_JOIN_INVALID");
  }
  const chainId = operation.transaction.chainId;
  if (chainId !== undefined && quantity(chainId, "HIRE_EVIDENCE_CHAIN_INVALID") !== CHAIN_ID) {
    fail("HIRE_EVIDENCE_WRONG_CHAIN");
  }
}

function operationOrder(operation) {
  return [
    quantity(operation.receipt.blockNumber, "HIRE_EVIDENCE_RECEIPT_BLOCK_INVALID"),
    quantity(operation.receipt.transactionIndex, "HIRE_EVIDENCE_RECEIPT_INDEX_INVALID")
  ];
}

function strictlyBefore(left, right) {
  const [leftBlock, leftIndex] = operationOrder(left);
  const [rightBlock, rightIndex] = operationOrder(right);
  return leftBlock < rightBlock || (leftBlock === rightBlock && leftIndex < rightIndex);
}

function gasCost(operation) {
  const price = operation.receipt.effectiveGasPrice ?? operation.transaction.gasPrice;
  return (
    quantity(operation.receipt.gasUsed, "HIRE_EVIDENCE_GAS_USED_INVALID") *
    quantity(price, "HIRE_EVIDENCE_GAS_PRICE_INVALID")
  );
}

export function validateAndBuildHireEvidence(input) {
  const {
    preparation,
    hashes,
    deployment,
    hires,
    finalBlock,
    runtimeCode,
    ownerStates,
    receiptStates,
    verifiedAtUtc,
    sourceCommit,
    preparationPath,
    preparationSha256,
    providers
  } = input;
  if (hires?.length !== 3 || hashes?.hires?.length !== 3) fail("HIRE_EVIDENCE_HIRE_SET_INVALID");
  if (preparation.chainId !== Number(CHAIN_ID) || preparation.hires?.length !== 3) {
    fail("HIRE_EVIDENCE_PREPARATION_INVALID");
  }
  const contractAddress = address(preparation.contractAddress, "HIRE_EVIDENCE_CONTRACT_INVALID");
  validateJoin(deployment, hashes.deployment);
  if (
    deployment.transaction.to !== null ||
    quantity(deployment.transaction.nonce, "HIRE_EVIDENCE_NONCE_INVALID") !==
      decimal(preparation.deployment.nonce, "HIRE_EVIDENCE_PREPARED_NONCE_INVALID") ||
    deployment.transaction.input.toLowerCase() !== preparation.deployment.data.toLowerCase() ||
    quantity(deployment.transaction.value, "HIRE_EVIDENCE_VALUE_INVALID") !== 0n ||
    address(deployment.receipt.contractAddress, "HIRE_EVIDENCE_DEPLOYED_ADDRESS_INVALID") !==
      contractAddress
  ) {
    fail("HIRE_EVIDENCE_DEPLOYMENT_MISMATCH");
  }
  const decodedEvents = [];
  for (const [index, operation] of hires.entries()) {
    const prepared = preparation.hires[index];
    validateJoin(operation, hashes.hires[index]);
    if (
      address(operation.transaction.to, "HIRE_EVIDENCE_HIRE_TARGET_INVALID") !== contractAddress ||
      address(operation.receipt.to, "HIRE_EVIDENCE_HIRE_RECEIPT_TARGET_INVALID") !==
        contractAddress ||
      quantity(operation.transaction.nonce, "HIRE_EVIDENCE_NONCE_INVALID") !==
        decimal(prepared.nonce, "HIRE_EVIDENCE_PREPARED_NONCE_INVALID") ||
      operation.transaction.input.toLowerCase() !== prepared.calldata.toLowerCase() ||
      quantity(operation.transaction.value, "HIRE_EVIDENCE_VALUE_INVALID") !==
        decimal(prepared.paymentWei, "HIRE_EVIDENCE_PREPARED_PAYMENT_INVALID")
    ) {
      fail("HIRE_EVIDENCE_HIRE_TRANSACTION_MISMATCH");
    }
    const matchingLogs = operation.receipt.logs.filter(
      (log) => log.topics?.[0]?.toLowerCase() === HIRE_EVENT_TOPIC
    );
    if (matchingLogs.length !== 1) fail("HIRE_EVIDENCE_EVENT_COUNT_INVALID");
    decodedEvents.push(decodeHireEvent(matchingLogs[0], prepared, contractAddress));
  }
  const ordered = [deployment, ...hires];
  for (let index = 1; index < ordered.length; index += 1) {
    if (!strictlyBefore(ordered[index - 1], ordered[index]))
      fail("HIRE_EVIDENCE_OPERATION_ORDER_INVALID");
  }
  const finalNumber = quantity(finalBlock.number, "HIRE_EVIDENCE_FINAL_BLOCK_INVALID");
  const lastBlock = operationOrder(hires[2])[0];
  if (finalNumber < lastBlock + FINALITY_DEPTH) fail("HIRE_EVIDENCE_NOT_FINALIZED");
  const runtimeBytes = Buffer.from(
    exactHex(runtimeCode, EXPECTED_RUNTIME_BYTES, "HIRE_EVIDENCE_RUNTIME_INVALID").slice(2),
    "hex"
  );
  if (keccak256Bytes(runtimeBytes) !== EXPECTED_RUNTIME_KECCAK256) {
    fail("HIRE_EVIDENCE_RUNTIME_HASH_MISMATCH");
  }
  for (const prepared of preparation.hires) {
    if (
      address(ownerStates[prepared.agentId], "HIRE_EVIDENCE_OWNER_STATE_INVALID") !==
      EXPECTED_OWNERS[prepared.agentId].toLowerCase()
    ) {
      fail("HIRE_EVIDENCE_OWNER_STATE_MISMATCH");
    }
  }
  for (const event of decodedEvents) {
    if (
      exactHex(receiptStates[event.engagementId], 32, "HIRE_EVIDENCE_RECEIPT_STATE_INVALID") !==
      event.receiptHash
    ) {
      fail("HIRE_EVIDENCE_RECEIPT_STATE_MISMATCH");
    }
  }
  const operations = ordered.map((operation) => ({
    transactionHash: operation.transaction.hash.toLowerCase(),
    blockNumber: quantity(
      operation.receipt.blockNumber,
      "HIRE_EVIDENCE_RECEIPT_BLOCK_INVALID"
    ).toString(),
    blockHash: operation.receipt.blockHash.toLowerCase(),
    transactionIndex: quantity(
      operation.receipt.transactionIndex,
      "HIRE_EVIDENCE_RECEIPT_INDEX_INVALID"
    ).toString(),
    gasUsed: quantity(operation.receipt.gasUsed, "HIRE_EVIDENCE_GAS_USED_INVALID").toString(),
    effectiveGasPriceWei: quantity(
      operation.receipt.effectiveGasPrice ?? operation.transaction.gasPrice,
      "HIRE_EVIDENCE_GAS_PRICE_INVALID"
    ).toString(),
    gasCostWei: gasCost(operation).toString()
  }));
  const hireReceipts = hires.map((operation, index) => {
    const rawReceipt = stableJson(operation.receipt);
    const blockTimestamp = quantity(
      operation.block.timestamp,
      "HIRE_EVIDENCE_BLOCK_TIMESTAMP_INVALID"
    );
    return {
      slug: preparation.hires[index].slug,
      agentId: preparation.hires[index].agentId,
      event: decodedEvents[index],
      termixHireReceipt: {
        state: "verified",
        chainId: Number(CHAIN_ID),
        transactionHash: operation.transaction.hash.toLowerCase(),
        explorerUrl: `https://testnet.bscscan.com/tx/${operation.transaction.hash.toLowerCase()}`,
        observedAtUtc: new Date(Number(blockTimestamp) * 1000).toISOString(),
        verifiedAtUtc,
        verifier: "ProofEra two-provider finalized hire collector v1",
        verificationMethod:
          "Two fixed BSC-testnet RPCs agreed on transaction, receipt and canonical block; exact calldata, ERC-8004 owner, runtime, event, receipt hash and finalized mapping state were verified.",
        rawReceipt,
        rawReceiptSha256: sha256Text(rawReceipt)
      }
    };
  });
  const totalGasCost = operations.reduce(
    (sum, operation) => sum + BigInt(operation.gasCostWei),
    0n
  );
  return {
    schemaVersion: HIRE_EVIDENCE_SCHEMA_VERSION,
    classification: {
      artifact: "finalized_paid_testnet_hire_evidence",
      taskCompletion: false,
      agentPerformance: false,
      executionAuthority: false,
      mainnet: false
    },
    sourceCommit,
    preparation: { path: preparationPath, sha256: preparationSha256 },
    chainId: Number(CHAIN_ID),
    providers,
    finalBlock: {
      number: finalNumber.toString(),
      hash: exactHex(finalBlock.hash, 32, "HIRE_EVIDENCE_FINAL_HASH_INVALID"),
      timestamp: quantity(finalBlock.timestamp, "HIRE_EVIDENCE_FINAL_TIMESTAMP_INVALID").toString(),
      finalityDepth: FINALITY_DEPTH.toString()
    },
    contract: {
      address: contractAddress,
      runtimeBytes: EXPECTED_RUNTIME_BYTES,
      runtimeKeccak256: EXPECTED_RUNTIME_KECCAK256,
      deployment: operations[0]
    },
    hires: hireReceipts,
    economics: {
      totalHirePaymentWei: preparation.bounds.totalHirePaymentWei,
      totalGasCostWei: totalGasCost.toString(),
      totalObservedSpendWei: (
        totalGasCost + BigInt(preparation.bounds.totalHirePaymentWei)
      ).toString()
    },
    claims: {
      contractDeployed: true,
      threePaidHiresFinalized: true,
      termixRunsCompleted: false,
      taskCompletion: false,
      agentPerformance: false
    }
  };
}
