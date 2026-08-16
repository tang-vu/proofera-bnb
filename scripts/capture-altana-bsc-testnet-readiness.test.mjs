import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./capture-altana-bsc-testnet-readiness.mjs", import.meta.url),
  "utf8"
);

test("Altana readiness capture is explicitly gated, read-only, and create-only", () => {
  assert.match(source, /--capture-altana-bsc-testnet-readiness/u);
  assert.match(source, /--source-base-commit/u);
  assert.match(source, /wallet_getCapabilities/u);
  assert.match(source, /flag: "wx"/u);
  assert.doesNotMatch(
    source,
    /wallet_prepareCalls|wallet_sendPreparedCalls|eth_sendRawTransaction|privateKey|signDigest/u
  );
});

test("Altana readiness capture fixes the reviewed BSC testnet SDK surface", () => {
  assert.match(source, /const CHAIN_ID = 97/u);
  assert.match(source, /https:\/\/testnet-relay\.altana\.network/u);
  assert.match(source, /@altananetwork\/sdk/u);
  assert.match(source, /BNB_TESTNET/u);
  assert.match(source, /getRegistrationFeeInWei/u);
  assert.match(source, /adminSignerCreatedOrRead: false/u);
  assert.match(source, /sessionSignerCreatedOrRead: false/u);
  assert.match(source, /receiptEvidence: false/u);
});

test("retained Altana readiness evidence proves only network and SDK preparation", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL(
        "../evidence/altana/preparations/125493138-bsc-testnet-readiness.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  assert.equal(manifest.schemaVersion, "proofera-altana-bsc-testnet-readiness-v1.0.0");
  assert.deepEqual(manifest.classification, {
    artifact: "read_only_network_and_sdk_preparation",
    adminSignerCreatedOrRead: false,
    sessionSignerCreatedOrRead: false,
    walletCreated: false,
    grantSubmitted: false,
    executionSubmitted: false,
    revocationSubmitted: false,
    receiptEvidence: false
  });
  assert.equal(manifest.sourceBaseCommit, "42a05ad7bd91620eba44d1637bdea822684766b2");
  assert.equal(manifest.sdk.version, "0.7.0");
  assert.equal(manifest.sdk.chainId, 97);
  assert.equal(manifest.sdk.keyStore, "0x6b8361c29d05d498b1a12b54a37310f94171e94a");
  assert.equal(manifest.sdk.keyStoreController, "0xb530d1971f5453f3359518343f05d0aedfff7e12");
  assert.equal(manifest.sdk.files.length, 6);
  assert.equal(manifest.checkpoint.blockNumber, "125493138");
  assert.equal(
    manifest.checkpoint.blockHash,
    "0xfbf9512fd09357f123fb21bcd46dd74cdd1e82781902a37b466fb3ee5925b760"
  );
  assert.equal(manifest.checkpoint.providers.length, 2);
  assert.equal(manifest.relay.chainKey, "0x61");
  assert.equal(manifest.relay.reachableWithExpectedCapabilities, true);
  assert.equal(manifest.onchain.allObservedContractsHaveMatchingNonemptyRuntime, true);
  assert.equal(manifest.onchain.contracts.length, 8);
  for (const contract of manifest.onchain.contracts) {
    assert.equal(contract.observations.length, 2);
    assert.equal(
      contract.observations[0].runtimeByteLength,
      contract.observations[1].runtimeByteLength
    );
    assert.equal(
      contract.observations[0].runtimeCodeHash,
      contract.observations[1].runtimeCodeHash
    );
    assert.ok(contract.observations[0].runtimeByteLength > 0);
  }
  assert.equal(
    manifest.onchain.registrationFee.observations[0].registrationFeeWei,
    manifest.onchain.registrationFee.observations[1].registrationFeeWei
  );
  assert.equal(
    manifest.onchain.registrationFee.observations[0].registrationFeeWei,
    "827855982236974"
  );
  assert.deepEqual(manifest.readiness, {
    networkAndRelayObserved: true,
    endToEndJourneyReady: false,
    status: "blocked_missing_authority_and_eligible_action",
    missing: [
      "admin_wallet_and_signer_unbound",
      "session_signer_worker_secret_unbound",
      "eligible_pancake_action_unbound",
      "explicit_transaction_approval_absent"
    ],
    requiredReceiptSequence: [
      "grant_and_keystore_registration",
      "session_signed_pancake_execution",
      "session_revocation_and_fresh_authority_absence"
    ]
  });
  const allowed = new Set([
    "eth_blockNumber",
    "eth_call",
    "eth_chainId",
    "eth_getBlockByNumber",
    "eth_getCode",
    "wallet_getCapabilities"
  ]);
  assert.equal(manifest.transcript.length, 25);
  for (const exchange of manifest.transcript) {
    assert.ok(allowed.has(exchange.request.method));
    assert.equal(exchange.response.error, undefined);
  }
  for (const file of manifest.sdk.files) {
    assert.match(file.sha256, /^[0-9a-f]{64}$/u);
    assert.ok(file.bytes > 0);
    const relativePath = file.path.replace("@altananetwork/sdk/", "");
    const bytes = await readFile(
      new URL(
        `../packages/integrations/node_modules/@altananetwork/sdk/${relativePath}`,
        import.meta.url
      )
    );
    assert.equal(bytes.byteLength, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  }
  const relayExchange = manifest.transcript.find(
    ({ request }) => request.method === "wallet_getCapabilities"
  );
  assert.equal(
    createHash("sha256").update(JSON.stringify(relayExchange.response.result)).digest("hex").length,
    64
  );
});
