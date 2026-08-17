import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAIN_ID,
  deriveAuthorityIds,
  validateAuthoritySnapshot,
  validateGrantIntent,
  validateLifecycleSequence,
  validateOperationObservation,
  validateRelayCallsStatus
} from "./altana-lifecycle-evidence-lib.mjs";

const PUBLIC_KEY =
  "0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
const SESSION_ADDRESS = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";
const WALLET = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const RELAY_FROM = "0x4444444444444444444444444444444444444444";
const RELAY_TO = "0x5555555555555555555555555555555555555555";

const intent = {
  schemaVersion: 1,
  chainId: CHAIN_ID,
  walletAddress: WALLET,
  sessionKey: {
    schemaVersion: 1,
    custody: "worker-kms",
    curve: "secp256k1",
    publicKey: PUBLIC_KEY,
    address: SESSION_ADDRESS
  },
  permissions: {
    calls: [{ to: TARGET, signature: "approve(address,uint256)" }],
    spend: [{ token: TOKEN, limit: "1000000000000000000", period: "day" }]
  },
  expiry: 2_000_000_000,
  registerInKeystore: true
};

function hash(byte) {
  return `0x${byte.repeat(64)}`;
}

function operationFixture(transactionHash, blockNumber, transactionIndex) {
  const blockHash = hash(String((blockNumber % 8) + 1));
  return {
    transaction: {
      hash: transactionHash,
      chainId: "0x61",
      blockNumber: `0x${blockNumber.toString(16)}`,
      blockHash,
      transactionIndex: `0x${transactionIndex.toString(16)}`,
      from: RELAY_FROM,
      to: RELAY_TO,
      input: "0x1234",
      value: "0x0"
    },
    receipt: {
      transactionHash,
      blockNumber: `0x${blockNumber.toString(16)}`,
      blockHash,
      transactionIndex: `0x${transactionIndex.toString(16)}`,
      from: RELAY_FROM,
      to: RELAY_TO,
      status: "0x1",
      contractAddress: null,
      gasUsed: "0x5208",
      logs: []
    }
  };
}

function snapshot(present, ids) {
  return {
    keyStoreValid: present,
    keyStorePublicKey: present ? PUBLIC_KEY : null,
    keyStorePublicKeyRead: present,
    accountKeyHashes: present ? [ids.accountKeyHash] : []
  };
}

test("grant intent derives both public authority identifiers", () => {
  const validated = validateGrantIntent(intent);
  assert.equal(validated.walletAddress, WALLET);
  assert.equal(validated.sessionKey.address, SESSION_ADDRESS);
  assert.deepEqual(deriveAuthorityIds(validated), {
    accountKeyHash: "0xd523da3646afb69ef792be9d08b3988a3b81847c087cf9627c57417e45140f97",
    keyStoreKeyId: "0x393a75c54f3552ba0c8900297d6e99bb8abf8cc013bb0e912d0b176596fe7b88"
  });
});

test("grant intent rejects key, permissions and scope drift", () => {
  assert.throws(
    () => validateGrantIntent({ ...intent, chainId: 56 }),
    /ALTANA_LIFECYCLE_GRANT_INTENT_INVALID/u
  );
  assert.throws(
    () =>
      validateGrantIntent({
        ...intent,
        sessionKey: { ...intent.sessionKey, address: WALLET }
      }),
    /ALTANA_LIFECYCLE_SESSION_KEY_MISMATCH/u
  );
  assert.throws(
    () =>
      validateGrantIntent({
        ...intent,
        permissions: {
          ...intent.permissions,
          calls: [...intent.permissions.calls, ...intent.permissions.calls]
        }
      }),
    /ALTANA_LIFECYCLE_PERMISSION_DUPLICATE/u
  );
});

test("operation joins successful transaction and receipt exactly", () => {
  const fixture = operationFixture(hash("a"), 100, 2);
  const result = validateOperationObservation(fixture, { hash: hash("a") });
  assert.equal(result.blockNumber, 100n);
  assert.equal(result.transactionIndex, 2n);
  assert.equal(result.transactionHash, hash("a"));
  assert.throws(
    () =>
      validateOperationObservation(
        { ...fixture, receipt: { ...fixture.receipt, status: "0x0" } },
        { hash: hash("a") }
      ),
    /ALTANA_LIFECYCLE_OPERATION_FAILED/u
  );
});

test("relay status joins the confirmed calls id and receipt", () => {
  const operation = validateOperationObservation(operationFixture(hash("b"), 101, 1), {
    hash: hash("b")
  });
  const callsId = "0x1234";
  assert.deepEqual(
    validateRelayCallsStatus(
      {
        id: callsId,
        status: 200,
        receipts: [
          {
            chainId: CHAIN_ID,
            transactionHash: operation.transactionHash,
            blockHash: operation.blockHash,
            blockNumber: Number(operation.blockNumber),
            status: "0x1"
          }
        ]
      },
      { callsId, ...operation }
    ),
    { callsId, status: "CONFIRMED" }
  );
});

test("authority snapshot requires KeyStore and account agreement", () => {
  const ids = deriveAuthorityIds(intent);
  assert.equal(
    validateAuthoritySnapshot(snapshot(true, ids), {
      accountKeyHash: ids.accountKeyHash,
      present: true,
      publicKey: PUBLIC_KEY
    }).accountKeyPresent,
    true
  );
  assert.throws(
    () =>
      validateAuthoritySnapshot(
        { ...snapshot(true, ids), accountKeyHashes: [] },
        { accountKeyHash: ids.accountKeyHash, present: true, publicKey: PUBLIC_KEY }
      ),
    /ALTANA_LIFECYCLE_AUTHORITY_STATE_MISMATCH/u
  );
});

test("lifecycle requires ordered receipts, live execution authority and final absence", () => {
  const ids = deriveAuthorityIds(intent);
  const grant = validateOperationObservation(operationFixture(hash("a"), 100, 1), {
    hash: hash("a")
  });
  const execute = validateOperationObservation(operationFixture(hash("b"), 101, 1), {
    hash: hash("b")
  });
  const revoke = validateOperationObservation(operationFixture(hash("c"), 102, 1), {
    hash: hash("c")
  });
  const phaseSnapshots = [
    phase("grant", grant, snapshot(true, ids)),
    phase("execute", execute, snapshot(true, ids)),
    phase("revoke", revoke, snapshot(false, ids))
  ];
  const finalSnapshot = {
    blockNumber: "114",
    blockHash: hash("7"),
    blockTimestamp: "1900000014",
    providers: [
      { provider: "bnb-chain", observation: snapshot(false, ids) },
      { provider: "publicnode", observation: snapshot(false, ids) }
    ]
  };
  assert.deepEqual(
    validateLifecycleSequence({
      intent,
      grant,
      execute,
      revoke,
      phaseSnapshots,
      finalSnapshot
    }),
    {
      authorityAbsentAfterRevoke: true,
      authorityPresentForExecution: true,
      derivedAuthorityIds: ids,
      finalizedAt: {
        blockHash: hash("7"),
        blockNumber: "114",
        blockTimestamp: "1900000014"
      },
      phases: [
        {
          phase: "grant",
          blockNumber: "100",
          blockHash: grant.blockHash,
          blockTimestamp: "1900000000"
        },
        {
          phase: "execute",
          blockNumber: "101",
          blockHash: execute.blockHash,
          blockTimestamp: "1900000001"
        },
        {
          phase: "revoke",
          blockNumber: "102",
          blockHash: revoke.blockHash,
          blockTimestamp: "1900000002"
        }
      ]
    }
  );
  assert.throws(
    () =>
      validateLifecycleSequence({
        intent,
        grant,
        execute: { ...execute, blockNumber: 99n },
        revoke,
        phaseSnapshots,
        finalSnapshot
      }),
    /ALTANA_LIFECYCLE_OPERATION_ORDER_INVALID/u
  );
});

function phase(name, operation, observation) {
  return {
    phase: name,
    blockNumber: operation.blockNumber.toString(),
    blockHash: operation.blockHash,
    blockTimestamp: (1_900_000_000 + Number(operation.blockNumber) - 100).toString(),
    providers: [
      { provider: "bnb-chain", observation },
      { provider: "publicnode", observation: structuredClone(observation) }
    ]
  };
}
