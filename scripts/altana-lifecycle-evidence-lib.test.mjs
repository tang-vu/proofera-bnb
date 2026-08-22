import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CHAIN_ID,
  deriveAuthorityIds,
  deriveGrantIntentFromTestActionPolicy,
  validateAuthoritySnapshot,
  validateGrantIntent,
  validateLifecycleSequence,
  validateOperationObservation,
  validatePtaApprovalReceipt,
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
const PTA_TARGET = "0x4ed64525d6fb06b7da926c683cbd809632c9b4cc";
const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const ZERO_WORD = `0x${"0".repeat(64)}`;

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
    accountKeyExpiry: present ? intent.expiry.toString() : null,
    keyStoreValid: present,
    keyStorePublicKey: present ? PUBLIC_KEY : null,
    keyStorePublicKeyRead: present,
    accountKeyHashes: present ? [ids.accountKeyHash] : []
  };
}

function addressTopic(address) {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
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

test("bounded v2 policy derives the exact public grant intent", async () => {
  const policy = JSON.parse(
    await readFile(new URL("../deploy/windows/altana-test-action.v2.json", import.meta.url), "utf8")
  );
  const derived = deriveGrantIntentFromTestActionPolicy(policy, 1_787_392_650);
  assert.equal(derived.expiry, 1_787_392_650);
  assert.equal(derived.sessionKey.custody, "worker-kms");
  assert.equal(derived.permissions.calls[0].to, PTA_TARGET);
  assert.deepEqual(derived.permissions.spend, [
    { token: null, limit: "500000000000000", period: "day" }
  ]);

  const wrongCap = structuredClone(policy);
  wrongCap.permissions.spend[0].limit = "1";
  assert.throws(
    () => deriveGrantIntentFromTestActionPolicy(wrongCap, 1_787_392_650),
    /ALTANA_LIFECYCLE_POLICY_PERMISSION_MISMATCH/u
  );
  const wrongAction = structuredClone(policy);
  wrongAction.action.amount = "1";
  assert.throws(
    () => deriveGrantIntentFromTestActionPolicy(wrongAction, 1_787_392_650),
    /ALTANA_LIFECYCLE_POLICY_INVALID/u
  );
});

test("retained v2 lifecycle binds real receipts and explicit evidence limits", async () => {
  const [lifecycleBytes, finalBytes] = await Promise.all([
    readFile(
      new URL(
        "../evidence/altana/lifecycles/126543819-72e7cf94-altana-lifecycle.json",
        import.meta.url
      )
    ),
    readFile(new URL("../evidence/submission/final/altana-lifecycle.json", import.meta.url))
  ]);
  assert.deepEqual(finalBytes, lifecycleBytes);
  assert.equal(
    createHash("sha256").update(lifecycleBytes).digest("hex"),
    "e001d4f9eb8e87d95408206e72c937c1ff8cd68d9885898a4d02aabdfe661b19"
  );
  const evidence = JSON.parse(lifecycleBytes.toString("utf8"));
  assert.equal(evidence.schemaVersion, "proofera-altana-lifecycle-evidence-v1.2.0");
  assert.equal(evidence.sourceBaseCommit, "823f04a03dd4ac97fd37cd6245004263179e8a7d");
  assert.equal(evidence.ceremonySourceCommit, "9a483c95586736f45c35cdad5d07f642fef8ff63");
  assert.equal(evidence.classification.authorityPresentForExecution, true);
  assert.equal(evidence.classification.authorityAbsentAfterRevoke, true);
  assert.equal(evidence.classification.ptaZeroApprovalEventVerified, true);
  assert.equal(evidence.classification.applicationStateChangeVerified, false);
  assert.equal(evidence.classification.exactGrantIntentPrecommitted, false);
  assert.equal(evidence.classification.historicalAuthorityProviderCount, 1);
  assert.equal(evidence.classification.twoProviderHistoricalAuthorityVerified, false);
  assert.equal(evidence.classification.twoProviderFinalAuthorityAbsenceVerified, true);
  assert.equal(
    evidence.operations.grant.transactionHash,
    "0xbfa1e3216d38efa0fc013efa504e808e16360b113f9a35bced6e1689345180c7"
  );
  assert.equal(
    evidence.operations.execute.transactionHash,
    "0xad65e59018c177ce1379b7e7de4e2449e03083f1569e7fcf0b2068e76cb0268e"
  );
  assert.equal(
    evidence.operations.revoke.transactionHash,
    "0x72e7cf94527ec6bed65856ce6ccc96ef94c7d8af8e5183ffa4667854637bceb7"
  );
  assert.deepEqual(
    evidence.authorityTimeline.phases.map(({ phase, providers }) => [
      phase,
      providers.map(({ provider }) => provider)
    ]),
    [
      ["grant", ["publicnode"]],
      ["execute", ["publicnode"]],
      ["revoke", ["publicnode"]]
    ]
  );
  assert.deepEqual(
    evidence.authorityTimeline.finalized.providers.map(({ provider, observation }) => [
      provider,
      observation.keyStoreValid
    ]),
    [
      ["bnb-chain", false],
      ["publicnode", false]
    ]
  );
  assert.equal(evidence.applicationEvidence.eventSignature, "Approval(address,address,uint256)");
  assert.equal(evidence.applicationEvidence.amount, "0");
  assert.ok(
    evidence.transcript.every(({ request }) =>
      [
        "eth_blockNumber",
        "eth_call",
        "eth_chainId",
        "eth_getBlockByHash",
        "eth_getBlockByNumber",
        "eth_getTransactionByHash",
        "eth_getTransactionReceipt",
        "wallet_getCallsStatus"
      ].includes(request.method)
    )
  );
  assert.doesNotMatch(
    lifecycleBytes.toString("utf8"),
    /privateKey|walletPassword|passkeySecret|encryptedSigner/u
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

test("PTA receipt proves only the exact zero Approval event", () => {
  const fixture = operationFixture(hash("b"), 101, 1);
  fixture.receipt.logs = [
    {
      address: PTA_TARGET,
      blockHash: fixture.receipt.blockHash,
      blockNumber: fixture.receipt.blockNumber,
      data: ZERO_WORD,
      logIndex: "0xa",
      topics: [APPROVAL_TOPIC, addressTopic(WALLET), addressTopic(SESSION_ADDRESS)],
      transactionHash: fixture.receipt.transactionHash
    }
  ];
  const operation = validateOperationObservation(fixture, { hash: hash("b") });
  assert.deepEqual(
    validatePtaApprovalReceipt(fixture.receipt, {
      ...operation,
      owner: WALLET,
      spender: SESSION_ADDRESS
    }),
    {
      amount: "0",
      blockHash: operation.blockHash,
      blockNumber: 101n,
      contractAddress: PTA_TARGET,
      eventSignature: "Approval(address,address,uint256)",
      logIndex: 10n,
      owner: WALLET,
      spender: SESSION_ADDRESS,
      transactionHash: hash("b")
    }
  );
  fixture.receipt.logs[0].data = `0x${"0".repeat(63)}1`;
  assert.throws(
    () =>
      validatePtaApprovalReceipt(fixture.receipt, {
        ...operation,
        owner: WALLET,
        spender: SESSION_ADDRESS
      }),
    /ALTANA_LIFECYCLE_PTA_APPROVAL_EVENT_MISMATCH/u
  );
});

test("authority snapshot requires KeyStore and account agreement", () => {
  const ids = deriveAuthorityIds(intent);
  assert.equal(
    validateAuthoritySnapshot(snapshot(true, ids), {
      accountKeyHash: ids.accountKeyHash,
      expiry: intent.expiry,
      present: true,
      publicKey: PUBLIC_KEY
    }).accountKeyPresent,
    true
  );
  assert.throws(
    () =>
      validateAuthoritySnapshot(
        { ...snapshot(true, ids), accountKeyHashes: [] },
        {
          accountKeyHash: ids.accountKeyHash,
          expiry: intent.expiry,
          present: true,
          publicKey: PUBLIC_KEY
        }
      ),
    /ALTANA_LIFECYCLE_AUTHORITY_STATE_MISMATCH/u
  );
  assert.throws(
    () =>
      validateAuthoritySnapshot(
        { ...snapshot(true, ids), accountKeyExpiry: "1999999999" },
        {
          accountKeyHash: ids.accountKeyHash,
          expiry: intent.expiry,
          present: true,
          publicKey: PUBLIC_KEY
        }
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
    providers: [{ provider: "publicnode", observation }]
  };
}
