import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeRelayStatus,
  normalizeAccountExpiry,
  validateAltanaTestActionConfig
} from "./altana-test-action-worker.mjs";

const CONFIG_URL = new URL("../deploy/windows/altana-test-action.v2.json", import.meta.url);
const SOURCE_URL = new URL("./altana-test-action-worker.mjs", import.meta.url);

test("tracked Altana test-action config is one bounded chain-97 zero approval", async () => {
  const config = validateAltanaTestActionConfig(JSON.parse(await readFile(CONFIG_URL, "utf8")));

  assert.equal(config.chainId, 97);
  assert.equal(config.walletAddress, "0x91Aa0E6627bFF6C911B38CEd5F7885E063b7C27a");
  assert.equal(config.action.target, "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc");
  assert.equal(config.action.functionSignature, "approve(address,uint256)");
  assert.equal(config.action.spender, config.sessionKey.address);
  assert.equal(config.action.amount, "0");
  assert.equal(config.action.valueWei, "0");
  assert.deepEqual(config.permissions.spend, [
    { token: null, limit: "500000000000000", period: "day" }
  ]);
  assert.equal(config.sessionLifetimeSeconds, 3_600);
});

test("worker source keeps custody encrypted and execution one-shot", async () => {
  const source = await readFile(SOURCE_URL, "utf8");

  assert.match(source, /DataProtectionScope\]::CurrentUser/u);
  assert.match(source, /session-key\.dpapi/u);
  assert.match(source, /writeCreateOnlyJson\(paths\.claim/u);
  assert.match(source, /noWait:\s*true/u);
  assert.match(source, /execute_outcome_unknown/u);
  assert.match(source, /keysRaw === "0x"/u);
  assert.match(source, /"wallet_getCallsStatus", \[callsId\]/u);
  assert.doesNotMatch(source, /"wallet_getCallsStatus", \[\{\s*id:/u);
  assert.doesNotMatch(source, /console\.log|JSON\.stringify\((?:signer|.*_privateKey)/u);
});

test("authority expiry accepts viem uint40 number and bigint representations", () => {
  assert.equal(normalizeAccountExpiry(1_787_330_074), 1_787_330_074);
  assert.equal(normalizeAccountExpiry(1_787_330_074n), 1_787_330_074);
  assert.throws(() => normalizeAccountExpiry(Number.NaN), /ALTANA_TEST_ACTION_AUTHORITY_INVALID/u);
  assert.throws(() => normalizeAccountExpiry(2 ** 40), /ALTANA_TEST_ACTION_AUTHORITY_INVALID/u);
});

test("relay status follows viem EIP-5792 categories instead of polling terminal failures", () => {
  assert.equal(normalizeRelayStatus(100), "pending");
  assert.equal(normalizeRelayStatus(199), "pending");
  assert.equal(normalizeRelayStatus(200), "confirmed");
  assert.equal(normalizeRelayStatus(299), "confirmed");
  assert.equal(normalizeRelayStatus(300), "failed");
  assert.equal(normalizeRelayStatus(699), "failed");
  assert.equal(normalizeRelayStatus("PENDING"), "pending");
  assert.equal(normalizeRelayStatus("CONFIRMED"), "confirmed");
  assert.equal(normalizeRelayStatus("FAILED"), "failed");
  assert.equal(normalizeRelayStatus(700), "unknown");
});

test("config rejects expanded calldata and mismatched signer bindings", async () => {
  const config = JSON.parse(await readFile(CONFIG_URL, "utf8"));

  assert.throws(
    () =>
      validateAltanaTestActionConfig({
        ...config,
        permissions: { ...config.permissions, spend: [{ token: null, limit: "1", period: "day" }] }
      }),
    /ALTANA_TEST_ACTION_PERMISSIONS_INVALID/u
  );
  assert.throws(
    () => validateAltanaTestActionConfig({ ...config, action: { ...config.action, amount: "1" } }),
    /ALTANA_TEST_ACTION_CALL_INVALID/u
  );
  assert.throws(
    () =>
      validateAltanaTestActionConfig({
        ...config,
        sessionKey: {
          ...config.sessionKey,
          address: "0x0000000000000000000000000000000000000001"
        }
      }),
    /ALTANA_TEST_ACTION_SESSION_KEY_MISMATCH/u
  );
});
