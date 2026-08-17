import { createRequire } from "node:module";

const integrationRequire = createRequire(
  new URL("../packages/integrations/package.json", import.meta.url)
);
const { encodeAbiParameters, getAddress, isAddress, keccak256, padHex, parseAbiItem } =
  integrationRequire("viem");
const { publicKeyToAddress } = integrationRequire("viem/accounts");

export const CHAIN_ID = 97;
export const KEYSTORE = "0x6b8361c29d05d498b1a12b54a37310f94171e94a";
export const KEYSTORE_CONTROLLER = "0xb530d1971f5453f3359518343f05d0aedfff7e12";
const UINT40_MAX = 2 ** 40 - 1;
const UINT256_MAX = (1n << 256n) - 1n;
const SECP256K1_FIELD_PRIME = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const PERIODS = new Set(["minute", "hour", "day", "week", "month", "year"]);

function fail(code) {
  throw new Error(code);
}

function strictRecord(value, keys, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) fail(code);
  return value;
}

export function exactHex(value, bytes, code) {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`, "u").test(value)) {
    fail(code);
  }
  return value.toLowerCase();
}

export function parseQuantity(value, code) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/iu.test(value)) fail(code);
  return BigInt(value);
}

function exactAddress(value, code) {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) fail(code);
  const address = getAddress(value).toLowerCase();
  if (address === "0x0000000000000000000000000000000000000000") fail(code);
  return address;
}

function publicKey(value) {
  const normalized = exactHex(value, 65, "ALTANA_LIFECYCLE_PUBLIC_KEY_INVALID");
  if (!normalized.startsWith("0x04")) fail("ALTANA_LIFECYCLE_PUBLIC_KEY_INVALID");
  const x = BigInt(`0x${normalized.slice(4, 68)}`);
  const y = BigInt(`0x${normalized.slice(68, 132)}`);
  if (
    x >= SECP256K1_FIELD_PRIME ||
    y >= SECP256K1_FIELD_PRIME ||
    (y * y) % SECP256K1_FIELD_PRIME !== (x * x * x + 7n) % SECP256K1_FIELD_PRIME
  ) {
    fail("ALTANA_LIFECYCLE_PUBLIC_KEY_INVALID");
  }
  return normalized;
}

function canonicalSignature(value) {
  if (typeof value !== "string" || value.length < 3 || value.length > 512 || /\s/u.test(value)) {
    fail("ALTANA_LIFECYCLE_CALL_SIGNATURE_INVALID");
  }
  try {
    if (parseAbiItem(`function ${value}`).type !== "function") throw new Error();
  } catch {
    fail("ALTANA_LIFECYCLE_CALL_SIGNATURE_INVALID");
  }
  return value;
}

function decimalUint256(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    fail("ALTANA_LIFECYCLE_SPEND_LIMIT_INVALID");
  }
  const parsed = BigInt(value);
  if (parsed > UINT256_MAX) fail("ALTANA_LIFECYCLE_SPEND_LIMIT_INVALID");
  return parsed.toString();
}

function normalizePermissions(input) {
  const permissions = strictRecord(
    input,
    ["calls", "spend"],
    "ALTANA_LIFECYCLE_PERMISSIONS_INVALID"
  );
  if (
    !Array.isArray(permissions.calls) ||
    permissions.calls.length === 0 ||
    permissions.calls.length > 32 ||
    !Array.isArray(permissions.spend) ||
    permissions.spend.length === 0 ||
    permissions.spend.length > 32
  ) {
    fail("ALTANA_LIFECYCLE_PERMISSIONS_INVALID");
  }
  const calls = permissions.calls.map((inputCall) => {
    const call = strictRecord(
      inputCall,
      ["signature", "to"],
      "ALTANA_LIFECYCLE_CALL_PERMISSION_INVALID"
    );
    return {
      signature: canonicalSignature(call.signature),
      to: exactAddress(call.to, "ALTANA_LIFECYCLE_CALL_TARGET_INVALID")
    };
  });
  const spend = permissions.spend.map((inputSpend) => {
    const entry = strictRecord(
      inputSpend,
      ["limit", "period", "token"],
      "ALTANA_LIFECYCLE_SPEND_PERMISSION_INVALID"
    );
    if (!PERIODS.has(entry.period)) fail("ALTANA_LIFECYCLE_SPEND_PERIOD_INVALID");
    return {
      limit: decimalUint256(entry.limit),
      period: entry.period,
      token:
        entry.token === null
          ? null
          : exactAddress(entry.token, "ALTANA_LIFECYCLE_SPEND_TOKEN_INVALID")
    };
  });
  const callKeys = calls.map(({ signature, to }) => `${to}:${signature}`);
  const spendKeys = spend.map(({ period, token }) => `${token ?? "native"}:${period}`);
  if (new Set(callKeys).size !== callKeys.length || new Set(spendKeys).size !== spendKeys.length) {
    fail("ALTANA_LIFECYCLE_PERMISSION_DUPLICATE");
  }
  return { calls, spend };
}

export function validateGrantIntent(input) {
  const intent = strictRecord(
    input,
    [
      "chainId",
      "expiry",
      "permissions",
      "registerInKeystore",
      "schemaVersion",
      "sessionKey",
      "walletAddress"
    ],
    "ALTANA_LIFECYCLE_GRANT_INTENT_INVALID"
  );
  if (
    intent.schemaVersion !== 1 ||
    intent.chainId !== CHAIN_ID ||
    intent.registerInKeystore !== true ||
    !Number.isInteger(intent.expiry) ||
    intent.expiry <= 0 ||
    intent.expiry > UINT40_MAX
  ) {
    fail("ALTANA_LIFECYCLE_GRANT_INTENT_INVALID");
  }
  const key = strictRecord(
    intent.sessionKey,
    ["address", "curve", "custody", "publicKey", "schemaVersion"],
    "ALTANA_LIFECYCLE_SESSION_KEY_INVALID"
  );
  if (key.schemaVersion !== 1 || key.custody !== "worker-kms" || key.curve !== "secp256k1") {
    fail("ALTANA_LIFECYCLE_SESSION_KEY_INVALID");
  }
  const normalizedPublicKey = publicKey(key.publicKey);
  const address = exactAddress(key.address, "ALTANA_LIFECYCLE_SESSION_ADDRESS_INVALID");
  if (publicKeyToAddress(normalizedPublicKey).toLowerCase() !== address) {
    fail("ALTANA_LIFECYCLE_SESSION_KEY_MISMATCH");
  }
  return Object.freeze({
    chainId: CHAIN_ID,
    expiry: intent.expiry,
    permissions: normalizePermissions(intent.permissions),
    registerInKeystore: true,
    schemaVersion: 1,
    sessionKey: Object.freeze({
      address,
      curve: "secp256k1",
      custody: "worker-kms",
      publicKey: normalizedPublicKey,
      schemaVersion: 1
    }),
    walletAddress: exactAddress(intent.walletAddress, "ALTANA_LIFECYCLE_WALLET_INVALID")
  });
}

export function deriveAuthorityIds(validatedIntent) {
  const intent = validateGrantIntent(validatedIntent);
  const keyStoreKeyId = keccak256(intent.sessionKey.publicKey);
  const encodedAddress = padHex(intent.sessionKey.address, { size: 32 });
  const publicKeyHash = keccak256(encodedAddress);
  const accountKeyHash = keccak256(
    encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }], [2n, publicKeyHash])
  );
  return Object.freeze({ accountKeyHash, keyStoreKeyId });
}

export function validateOperationObservation(input, expected) {
  const operation = strictRecord(
    input,
    ["receipt", "transaction"],
    "ALTANA_LIFECYCLE_OPERATION_OBSERVATION_INVALID"
  );
  const transaction = operation.transaction;
  const receipt = operation.receipt;
  const expectedHash = exactHex(expected.hash, 32, "ALTANA_LIFECYCLE_EXPECTED_HASH_INVALID");
  if (
    exactHex(transaction?.hash, 32, "ALTANA_LIFECYCLE_TRANSACTION_HASH_INVALID") !== expectedHash ||
    exactHex(receipt?.transactionHash, 32, "ALTANA_LIFECYCLE_RECEIPT_HASH_INVALID") !==
      expectedHash ||
    parseQuantity(receipt?.status, "ALTANA_LIFECYCLE_RECEIPT_STATUS_INVALID") !== 1n
  ) {
    fail("ALTANA_LIFECYCLE_OPERATION_FAILED");
  }
  if (
    transaction.chainId !== undefined &&
    parseQuantity(transaction.chainId, "ALTANA_LIFECYCLE_TRANSACTION_CHAIN_INVALID") !==
      BigInt(CHAIN_ID)
  ) {
    fail("ALTANA_LIFECYCLE_TRANSACTION_CHAIN_MISMATCH");
  }
  const blockNumber = parseQuantity(receipt.blockNumber, "ALTANA_LIFECYCLE_RECEIPT_BLOCK_INVALID");
  const blockHash = exactHex(receipt.blockHash, 32, "ALTANA_LIFECYCLE_RECEIPT_BLOCK_HASH_INVALID");
  if (
    parseQuantity(transaction.blockNumber, "ALTANA_LIFECYCLE_TRANSACTION_BLOCK_INVALID") !==
      blockNumber ||
    exactHex(transaction.blockHash, 32, "ALTANA_LIFECYCLE_TRANSACTION_BLOCK_HASH_INVALID") !==
      blockHash ||
    parseQuantity(transaction.transactionIndex, "ALTANA_LIFECYCLE_TRANSACTION_INDEX_INVALID") !==
      parseQuantity(receipt.transactionIndex, "ALTANA_LIFECYCLE_RECEIPT_INDEX_INVALID")
  ) {
    fail("ALTANA_LIFECYCLE_TRANSACTION_RECEIPT_MISMATCH");
  }
  if (
    exactAddress(transaction.from, "ALTANA_LIFECYCLE_TRANSACTION_FROM_INVALID") !==
      exactAddress(receipt.from, "ALTANA_LIFECYCLE_RECEIPT_FROM_INVALID") ||
    exactAddress(transaction.to, "ALTANA_LIFECYCLE_TRANSACTION_TO_INVALID") !==
      exactAddress(receipt.to, "ALTANA_LIFECYCLE_RECEIPT_TO_INVALID") ||
    typeof transaction.input !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})*$/u.test(transaction.input) ||
    !Array.isArray(receipt.logs) ||
    receipt.contractAddress !== null
  ) {
    fail("ALTANA_LIFECYCLE_TRANSACTION_RECEIPT_SCOPE_INVALID");
  }
  return Object.freeze({
    blockHash,
    blockNumber,
    from: transaction.from.toLowerCase(),
    gasUsed: parseQuantity(receipt.gasUsed, "ALTANA_LIFECYCLE_RECEIPT_GAS_INVALID"),
    input: transaction.input.toLowerCase(),
    to: transaction.to.toLowerCase(),
    transactionHash: expectedHash,
    transactionIndex: parseQuantity(
      receipt.transactionIndex,
      "ALTANA_LIFECYCLE_RECEIPT_INDEX_INVALID"
    ),
    value: parseQuantity(transaction.value, "ALTANA_LIFECYCLE_TRANSACTION_VALUE_INVALID")
  });
}

export function validateRelayCallsStatus(input, expected) {
  const status = strictRecord(
    input,
    ["id", "receipts", "status"],
    "ALTANA_LIFECYCLE_RELAY_STATUS_INVALID"
  );
  if (
    typeof status.id !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2}){1,256}$/u.test(status.id) ||
    !/^0x(?:[0-9a-fA-F]{2}){1,256}$/u.test(expected.callsId) ||
    status.id.toLowerCase() !== expected.callsId.toLowerCase() ||
    status.status !== 200 ||
    !Array.isArray(status.receipts) ||
    status.receipts.length !== 1
  ) {
    fail("ALTANA_LIFECYCLE_RELAY_STATUS_MISMATCH");
  }
  const receipt = status.receipts[0];
  if (
    Number(receipt.chainId) !== CHAIN_ID ||
    exactHex(receipt.transactionHash, 32, "ALTANA_LIFECYCLE_RELAY_HASH_INVALID") !==
      expected.transactionHash ||
    exactHex(receipt.blockHash, 32, "ALTANA_LIFECYCLE_RELAY_BLOCK_HASH_INVALID") !==
      expected.blockHash ||
    BigInt(receipt.blockNumber) !== expected.blockNumber ||
    parseQuantity(receipt.status, "ALTANA_LIFECYCLE_RELAY_RECEIPT_STATUS_INVALID") !== 1n
  ) {
    fail("ALTANA_LIFECYCLE_RELAY_RECEIPT_MISMATCH");
  }
  return Object.freeze({ callsId: status.id.toLowerCase(), status: "CONFIRMED" });
}

export function validateAuthoritySnapshot(input, expected) {
  const snapshot = strictRecord(
    input,
    ["accountKeyHashes", "keyStorePublicKey", "keyStorePublicKeyRead", "keyStoreValid"],
    "ALTANA_LIFECYCLE_AUTHORITY_SNAPSHOT_INVALID"
  );
  if (
    typeof snapshot.keyStoreValid !== "boolean" ||
    typeof snapshot.keyStorePublicKeyRead !== "boolean" ||
    !Array.isArray(snapshot.accountKeyHashes)
  ) {
    fail("ALTANA_LIFECYCLE_AUTHORITY_SNAPSHOT_INVALID");
  }
  const hashes = snapshot.accountKeyHashes.map((value) =>
    exactHex(value, 32, "ALTANA_LIFECYCLE_ACCOUNT_KEY_HASH_INVALID")
  );
  if (new Set(hashes).size !== hashes.length) {
    fail("ALTANA_LIFECYCLE_ACCOUNT_KEY_HASH_DUPLICATE");
  }
  const accountPresent = hashes.includes(expected.accountKeyHash);
  if (
    snapshot.keyStoreValid !== expected.present ||
    accountPresent !== expected.present ||
    (expected.present
      ? snapshot.keyStorePublicKeyRead !== true ||
        exactHex(snapshot.keyStorePublicKey, 65, "ALTANA_LIFECYCLE_KEYSTORE_PUBLIC_KEY_INVALID") !==
          expected.publicKey
      : snapshot.keyStorePublicKeyRead !== false || snapshot.keyStorePublicKey !== null)
  ) {
    fail("ALTANA_LIFECYCLE_AUTHORITY_STATE_MISMATCH");
  }
  return Object.freeze({
    accountKeyPresent: accountPresent,
    accountKeyHashes: Object.freeze(hashes),
    keyStorePublicKey: snapshot.keyStorePublicKey,
    keyStorePublicKeyRead: snapshot.keyStorePublicKeyRead,
    keyStoreValid: snapshot.keyStoreValid
  });
}

function before(left, right) {
  return (
    left.blockNumber < right.blockNumber ||
    (left.blockNumber === right.blockNumber && left.transactionIndex < right.transactionIndex)
  );
}

function validateProviders(providers, expected) {
  if (
    !Array.isArray(providers) ||
    providers.length !== 2 ||
    providers
      .map(({ provider }) => provider)
      .sort()
      .join(",") !== "bnb-chain,publicnode"
  ) {
    fail("ALTANA_LIFECYCLE_PROVIDER_SET_INVALID");
  }
  const observations = providers.map((provider) =>
    validateAuthoritySnapshot(provider.observation, expected)
  );
  if (JSON.stringify(observations[0]) !== JSON.stringify(observations[1])) {
    fail("ALTANA_LIFECYCLE_PROVIDER_STATE_MISMATCH");
  }
}

export function validateLifecycleSequence({
  execute,
  finalSnapshot,
  grant,
  intent,
  phaseSnapshots,
  revoke
}) {
  const normalizedIntent = validateGrantIntent(intent);
  const ids = deriveAuthorityIds(normalizedIntent);
  if (
    new Set([grant.transactionHash, execute.transactionHash, revoke.transactionHash]).size !== 3 ||
    !before(grant, execute) ||
    !before(execute, revoke)
  ) {
    fail("ALTANA_LIFECYCLE_OPERATION_ORDER_INVALID");
  }
  if (
    !Array.isArray(phaseSnapshots) ||
    phaseSnapshots.length !== 3 ||
    finalSnapshot === null ||
    typeof finalSnapshot !== "object" ||
    Array.isArray(finalSnapshot)
  ) {
    fail("ALTANA_LIFECYCLE_SNAPSHOT_SET_INVALID");
  }
  const phases = [
    ["grant", grant, true],
    ["execute", execute, true],
    ["revoke", revoke, false]
  ];
  const validatedPhases = phases.map(([phase, operation, present], index) => {
    const entry = strictRecord(
      phaseSnapshots[index],
      ["blockHash", "blockNumber", "blockTimestamp", "phase", "providers"],
      "ALTANA_LIFECYCLE_PHASE_SNAPSHOT_INVALID"
    );
    if (
      entry.phase !== phase ||
      BigInt(entry.blockNumber) !== operation.blockNumber ||
      entry.blockHash !== operation.blockHash ||
      typeof entry.blockTimestamp !== "string" ||
      !/^[1-9][0-9]*$/u.test(entry.blockTimestamp)
    ) {
      fail("ALTANA_LIFECYCLE_PHASE_SNAPSHOT_MISMATCH");
    }
    if (
      (phase === "grant" || phase === "execute") &&
      BigInt(entry.blockTimestamp) >= BigInt(normalizedIntent.expiry)
    ) {
      fail("ALTANA_LIFECYCLE_AUTHORITY_EXPIRED_AT_EXECUTION");
    }
    validateProviders(entry.providers, {
      accountKeyHash: ids.accountKeyHash,
      present,
      publicKey: normalizedIntent.sessionKey.publicKey
    });
    return Object.freeze({
      blockHash: entry.blockHash,
      blockNumber: entry.blockNumber,
      blockTimestamp: entry.blockTimestamp,
      phase
    });
  });
  const final = strictRecord(
    finalSnapshot,
    ["blockHash", "blockNumber", "blockTimestamp", "providers"],
    "ALTANA_LIFECYCLE_FINAL_SNAPSHOT_INVALID"
  );
  if (
    typeof final.blockNumber !== "string" ||
    !/^[1-9][0-9]*$/u.test(final.blockNumber) ||
    BigInt(final.blockNumber) < revoke.blockNumber + 12n ||
    typeof final.blockTimestamp !== "string" ||
    !/^[1-9][0-9]*$/u.test(final.blockTimestamp) ||
    !/^0x[0-9a-f]{64}$/u.test(final.blockHash)
  ) {
    fail("ALTANA_LIFECYCLE_FINAL_SNAPSHOT_INVALID");
  }
  validateProviders(final.providers, {
    accountKeyHash: ids.accountKeyHash,
    present: false,
    publicKey: normalizedIntent.sessionKey.publicKey
  });
  return Object.freeze({
    authorityAbsentAfterRevoke: true,
    authorityPresentForExecution: true,
    derivedAuthorityIds: ids,
    finalizedAt: Object.freeze({
      blockHash: final.blockHash,
      blockNumber: final.blockNumber,
      blockTimestamp: final.blockTimestamp
    }),
    phases: Object.freeze(validatedPhases)
  });
}
