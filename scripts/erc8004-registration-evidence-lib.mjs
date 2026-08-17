import { createRequire } from "node:module";

const integrationRequire = createRequire(
  new URL("../packages/integrations/package.json", import.meta.url)
);
const { decodeFunctionData } = integrationRequire("viem");

export const CHAIN_ID = 97;
export const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
export const REGISTER_SELECTOR = "0x8ea42286";
export const SET_AGENT_URI_SELECTOR = "0x0af28bd3";
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const FINAL_URI_PLACEHOLDER = "<agentId-from-confirmed-Registered-event>";

export const REGISTRY_ABI = Object.freeze([
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }]
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "uri", type: "string" }]
  },
  {
    type: "function",
    name: "setAgentURI",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" }
    ],
    outputs: []
  }
]);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function exactHex(value, bytes, code) {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`, "u").test(value)) {
    throw new Error(code);
  }
  return value.toLowerCase();
}

export function parseQuantity(value, code) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/iu.test(value)) {
    throw new Error(code);
  }
  return BigInt(value);
}

function exactAddress(value, code) {
  return exactHex(value, 20, code);
}

function addressTopic(address) {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

export function finalRegistrationUri(preparedAgent, agentId) {
  if (typeof agentId !== "bigint" || agentId < 0n || agentId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("ERC8004_REGISTRATION_AGENT_ID_INVALID");
  }
  const template = structuredClone(preparedAgent?.completionTemplate?.agentUriTemplate);
  if (
    template === null ||
    typeof template !== "object" ||
    !Array.isArray(template.registrations) ||
    template.registrations.length !== 1 ||
    template.registrations[0]?.agentId !== FINAL_URI_PLACEHOLDER ||
    template.registrations[0]?.agentRegistry !== `eip155:${CHAIN_ID}:${REGISTRY}`
  ) {
    throw new Error("ERC8004_REGISTRATION_URI_TEMPLATE_INVALID");
  }
  // SDK 0.4.2 emits the EIP-8004 agentId as a JSON integer. Keep the
  // placeholder string only in the pre-registration template, then bind the
  // receipt-derived value using the SDK's exact serialized type.
  template.registrations[0].agentId = Number(agentId);
  return `data:application/json;base64,${Buffer.from(canonical(template), "utf8").toString("base64")}`;
}

function exactTransactionBase(transaction, receipt, expected) {
  const transactionHash = exactHex(
    transaction?.hash,
    32,
    "ERC8004_REGISTRATION_TRANSACTION_HASH_INVALID"
  );
  if (transactionHash !== expected.hash) {
    throw new Error("ERC8004_REGISTRATION_TRANSACTION_HASH_MISMATCH");
  }
  if (
    exactAddress(transaction.from, "ERC8004_REGISTRATION_TRANSACTION_FROM_INVALID") !==
      expected.wallet ||
    exactAddress(transaction.to, "ERC8004_REGISTRATION_TRANSACTION_TO_INVALID") !==
      REGISTRY.toLowerCase() ||
    parseQuantity(transaction.value, "ERC8004_REGISTRATION_TRANSACTION_VALUE_INVALID") !== 0n
  ) {
    throw new Error("ERC8004_REGISTRATION_TRANSACTION_SCOPE_MISMATCH");
  }
  if (
    transaction.chainId !== undefined &&
    parseQuantity(transaction.chainId, "ERC8004_REGISTRATION_TRANSACTION_CHAIN_INVALID") !==
      BigInt(CHAIN_ID)
  ) {
    throw new Error("ERC8004_REGISTRATION_TRANSACTION_CHAIN_MISMATCH");
  }
  if (
    exactHex(receipt?.transactionHash, 32, "ERC8004_REGISTRATION_RECEIPT_HASH_INVALID") !==
      expected.hash ||
    exactAddress(receipt.from, "ERC8004_REGISTRATION_RECEIPT_FROM_INVALID") !== expected.wallet ||
    exactAddress(receipt.to, "ERC8004_REGISTRATION_RECEIPT_TO_INVALID") !==
      REGISTRY.toLowerCase() ||
    parseQuantity(receipt.status, "ERC8004_REGISTRATION_RECEIPT_STATUS_INVALID") !== 1n
  ) {
    throw new Error("ERC8004_REGISTRATION_RECEIPT_SCOPE_MISMATCH");
  }
  const blockNumber = parseQuantity(
    receipt.blockNumber,
    "ERC8004_REGISTRATION_RECEIPT_BLOCK_INVALID"
  );
  const blockHash = exactHex(
    receipt.blockHash,
    32,
    "ERC8004_REGISTRATION_RECEIPT_BLOCK_HASH_INVALID"
  );
  const gasUsed = parseQuantity(receipt.gasUsed, "ERC8004_REGISTRATION_RECEIPT_GAS_INVALID");
  const effectiveGasPrice = parseQuantity(
    receipt.effectiveGasPrice,
    "ERC8004_REGISTRATION_RECEIPT_GAS_PRICE_INVALID"
  );
  if (receipt.contractAddress !== null) {
    throw new Error("ERC8004_REGISTRATION_RECEIPT_CONTRACT_CREATION_INVALID");
  }
  return { blockHash, blockNumber, effectiveGasPrice, gasUsed, transactionHash };
}

function transferAgentId(receipt, wallet) {
  if (!Array.isArray(receipt.logs)) {
    throw new Error("ERC8004_REGISTRATION_RECEIPT_LOGS_INVALID");
  }
  const matches = receipt.logs.filter((log) => {
    if (
      typeof log !== "object" ||
      log === null ||
      typeof log.address !== "string" ||
      !Array.isArray(log.topics)
    ) {
      return false;
    }
    return (
      log.address.toLowerCase() === REGISTRY.toLowerCase() &&
      log.topics.length === 4 &&
      log.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
      log.topics[1]?.toLowerCase() === `0x${"0".repeat(64)}` &&
      log.topics[2]?.toLowerCase() === addressTopic(wallet)
    );
  });
  if (matches.length !== 1) {
    throw new Error("ERC8004_REGISTRATION_TRANSFER_EVENT_INVALID");
  }
  return BigInt(
    exactHex(matches[0].topics[3], 32, "ERC8004_REGISTRATION_TRANSFER_AGENT_ID_INVALID")
  );
}

export function validateRegistrationPair({
  preparedAgent,
  registerHash,
  registerReceipt,
  registerTransaction,
  updateHash,
  updateReceipt,
  updateTransaction
}) {
  const wallet = exactAddress(preparedAgent?.wallet, "ERC8004_REGISTRATION_WALLET_INVALID");
  const expectedRegisterCalldata = preparedAgent?.initialRegistration?.transaction?.calldata;
  if (
    typeof expectedRegisterCalldata !== "string" ||
    !expectedRegisterCalldata.toLowerCase().startsWith(REGISTER_SELECTOR)
  ) {
    throw new Error("ERC8004_REGISTRATION_PREPARED_CALLDATA_INVALID");
  }
  const registration = exactTransactionBase(registerTransaction, registerReceipt, {
    hash: registerHash,
    wallet
  });
  if (registerTransaction.input?.toLowerCase() !== expectedRegisterCalldata.toLowerCase()) {
    throw new Error("ERC8004_REGISTRATION_CALLDATA_MISMATCH");
  }
  const agentId = transferAgentId(registerReceipt, wallet);
  const finalUri = finalRegistrationUri(preparedAgent, agentId);

  const update = exactTransactionBase(updateTransaction, updateReceipt, {
    hash: updateHash,
    wallet
  });
  if (
    typeof updateTransaction.input !== "string" ||
    !updateTransaction.input.toLowerCase().startsWith(SET_AGENT_URI_SELECTOR)
  ) {
    throw new Error("ERC8004_REGISTRATION_URI_CALLDATA_INVALID");
  }
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: REGISTRY_ABI, data: updateTransaction.input });
  } catch {
    throw new Error("ERC8004_REGISTRATION_URI_CALLDATA_INVALID");
  }
  if (
    decoded.functionName !== "setAgentURI" ||
    decoded.args?.length !== 2 ||
    decoded.args[0] !== agentId ||
    decoded.args[1] !== finalUri
  ) {
    throw new Error("ERC8004_REGISTRATION_URI_CALLDATA_MISMATCH");
  }
  if (
    update.blockNumber < registration.blockNumber ||
    (update.blockNumber === registration.blockNumber &&
      parseQuantity(updateReceipt.transactionIndex, "ERC8004_REGISTRATION_RECEIPT_INDEX_INVALID") <=
        parseQuantity(
          registerReceipt.transactionIndex,
          "ERC8004_REGISTRATION_RECEIPT_INDEX_INVALID"
        ))
  ) {
    throw new Error("ERC8004_REGISTRATION_TRANSACTION_ORDER_INVALID");
  }
  return Object.freeze({
    agentId,
    finalUri,
    registration: Object.freeze(registration),
    update: Object.freeze(update),
    wallet
  });
}
