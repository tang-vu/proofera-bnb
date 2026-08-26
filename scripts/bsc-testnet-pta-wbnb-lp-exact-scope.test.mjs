import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_PATH = resolve(
  ROOT,
  "evidence/development/bsc-testnet-pta-wbnb-lp-exact-scope-127358821.json"
);
const MODULE_PATH = resolve(
  ROOT,
  "packages/integrations/src/bsc-testnet-pta-wbnb-lp-exact-scope.ts"
);
const CLI_PATH = resolve(ROOT, "scripts/prepare-bsc-testnet-pta-wbnb-lp.ts");
const ZERO_WORD = `0x${"0".repeat(64)}`;
const OWNER = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";
const PTA = "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const MANAGER = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
const POOL = "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE";

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function readEvidence() {
  return JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
}

function words(calldata) {
  assert.match(calldata, /^0x[0-9a-f]+$/u);
  const payload = calldata.slice(10);
  assert.equal(payload.length % 64, 0);
  return Array.from({ length: payload.length / 64 }, (_, index) =>
    payload.slice(index * 64, (index + 1) * 64)
  );
}

function addressWord(address) {
  return address.toLowerCase().slice(2).padStart(64, "0");
}

function uintWord(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function signedWord(value, bits) {
  const integer = BigInt(value);
  const encoded = integer < 0n ? (1n << BigInt(bits)) + integer : integer;
  const prefix = integer < 0n ? "f" : "0";
  return encoded
    .toString(16)
    .padStart(bits / 4, prefix)
    .padStart(64, prefix);
}

test("retained first-LP scope binds two exact direct chain-97 transactions without authority", () => {
  const evidence = readEvidence();
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.kind, "bsc_testnet_pta_wbnb_first_lp_exact_scope");
  assert.equal(evidence.status, "prepared_not_authorized");
  assert.equal(evidence.sourceCommit, "c1df68635f1f7b83acc49bc2dad9a32187c050bd");
  assert.equal(evidence.chain.chainId, 97);
  assert.equal(evidence.chain.environment, "bsc-testnet");
  assert.equal(evidence.chain.mainnetWritePossible, false);
  assert.equal(evidence.owner, OWNER);
  assert.equal(evidence.position.pool, POOL);
  assert.equal(evidence.position.token0, PTA);
  assert.equal(evidence.position.token1, WBNB);
  assert.equal(evidence.position.manager, MANAGER);
  assert.equal(evidence.position.recipient, OWNER);
  assert.equal(evidence.position.fee, "500");
  assert.equal(evidence.position.tickLower, -887270);
  assert.equal(evidence.position.tickUpper, 887270);
  assert.equal(evidence.position.maximumSlippageBps, 0);
  assert.equal(evidence.position.amount0DesiredRaw, "1000000000000000000000");
  assert.equal(evidence.position.amount1DesiredRaw, "1000000000000000");
  assert.equal(evidence.position.amount0MinRaw, evidence.position.amount0DesiredRaw);
  assert.equal(evidence.position.amount1MinRaw, evidence.position.amount1DesiredRaw);
  assert.equal(evidence.position.expectedLiquidityRaw, "1000000000000000000");
  assert.equal(evidence.exactTransactions.length, 2);
  assert.deepEqual(
    evidence.exactTransactions.map(({ order, nonce, to, selector, valueWei }) => ({
      order,
      nonce,
      to,
      selector,
      valueWei
    })),
    [
      { order: 1, nonce: "10", to: PTA, selector: "0x095ea7b3", valueWei: "0" },
      {
        order: 2,
        nonce: "11",
        to: MANAGER,
        selector: "0x88316456",
        valueWei: "1000000000000000"
      }
    ]
  );
  assert.equal(evidence.authorization.preparationAuthorizedByOwner, true);
  assert.equal(evidence.authorization.signingAuthorized, false);
  assert.equal(evidence.authorization.custodyUnlockAuthorized, false);
  assert.equal(evidence.authorization.broadcastAuthorized, false);
  assert.equal(evidence.authorization.signatureCreated, false);
  assert.equal(evidence.authorization.transactionSubmitted, false);
  assert.equal(evidence.authorization.blockchainWritePerformed, false);
  assert.equal(evidence.failureCleanup.preauthorized, false);
  assert.equal(evidence.prohibited.multicall, true);
  assert.equal(evidence.prohibited.mainnet, true);
  assert.equal(evidence.reusableAfterExpiry, false);
  assert.ok(Date.parse(evidence.scopeExpiresAt) > Date.parse(evidence.preparedAt));
  assert.ok(Date.parse(evidence.position.deadlineUtc) > Date.parse(evidence.scopeExpiresAt));
});

test("retained provider observations agree on identity, first-mint state and simulations", () => {
  const evidence = readEvidence();
  const [primary, corroborator] = evidence.observation.observations;
  const strip = (observation) => ({
    ...observation,
    provider: null,
    rpcOrigin: null,
    tipBlockNumber: null
  });
  assert.deepEqual(strip(primary), strip(corroborator));
  assert.equal(evidence.observation.providerAgreementVerified, true);
  assert.equal(primary.chainId, 97);
  assert.equal(primary.block.number, evidence.observation.commonBlockNumber);
  assert.equal(primary.block.hash, evidence.observation.commonBlockHash);
  assert.equal(primary.pool.sqrtPriceX96, "79228162514264337593543950");
  assert.equal(primary.pool.currentTick, -138163);
  assert.equal(primary.pool.liquidityRaw, "0");
  assert.equal(primary.pool.unlocked, true);
  assert.equal(primary.sender.ptaAllowanceToManagerRaw, "0");
  assert.equal(primary.sender.wbnbAllowanceToManagerRaw, "0");
  assert.equal(primary.sender.commonBlockNonce, primary.sender.pendingNonce);
  assert.equal(primary.contracts.length, 6);
  for (const contract of primary.contracts) {
    assert.equal(contract.eip1967.implementation, ZERO_WORD);
    assert.equal(contract.eip1967.admin, ZERO_WORD);
    assert.equal(contract.eip1967.beacon, ZERO_WORD);
  }
  const [first, second] = evidence.simulations.simulations;
  assert.deepEqual(first.approval, second.approval);
  assert.deepEqual(first.mint, second.mint);
  assert.equal(first.mint.liquidityRaw, "1000000000000000000");
  assert.equal(first.mint.amount0Raw, evidence.position.amount0DesiredRaw);
  assert.equal(first.mint.amount1Raw, evidence.position.amount1DesiredRaw);
  assert.equal(evidence.simulations.tokenIdIsUnconstrainedReturnValue, true);
});

test("approval and mint calldata independently decode to the retained exact scope", () => {
  const evidence = readEvidence();
  const [approval, mint] = evidence.exactTransactions;
  const approvalWords = words(approval.data);
  assert.equal(approvalWords.length, 2);
  assert.equal(approvalWords[0], addressWord(MANAGER));
  assert.equal(approvalWords[1], uintWord(evidence.position.amount0DesiredRaw));

  const mintWords = words(mint.data);
  assert.equal(mintWords.length, 11);
  assert.equal(mintWords[0], addressWord(PTA));
  assert.equal(mintWords[1], addressWord(WBNB));
  assert.equal(mintWords[2], uintWord(500));
  assert.equal(mintWords[3], signedWord(-887270, 24));
  assert.equal(mintWords[4], signedWord(887270, 24));
  assert.equal(mintWords[5], uintWord(evidence.position.amount0DesiredRaw));
  assert.equal(mintWords[6], uintWord(evidence.position.amount1DesiredRaw));
  assert.equal(mintWords[7], uintWord(evidence.position.amount0MinRaw));
  assert.equal(mintWords[8], uintWord(evidence.position.amount1MinRaw));
  assert.equal(mintWords[9], addressWord(OWNER));
  assert.equal(mintWords[10], uintWord(evidence.position.deadlineUnix));
});

test("exact-scope digest is reproducible and the capture surface excludes custody and signing", () => {
  const evidence = readEvidence();
  const { exactScopeSha256, ...body } = evidence;
  assert.equal(
    exactScopeSha256,
    `0x${createHash("sha256").update(stableJson(body)).digest("hex")}`
  );
  const source = `${readFileSync(MODULE_PATH, "utf8")}\n${readFileSync(CLI_PATH, "utf8")}`;
  assert.doesNotMatch(source, /privateKey|mnemonic|keystore|signTransaction|sendRawTransaction/u);
  assert.doesNotMatch(source, /process\.env|\.env\b/u);
  assert.match(source, /prepared_not_authorized/u);
  assert.match(source, /broadcastAuthorized: false/u);
  assert.match(source, /open\(path, "wx"/u);
});
