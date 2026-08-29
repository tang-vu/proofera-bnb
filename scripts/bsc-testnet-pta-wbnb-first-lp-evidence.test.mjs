import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_PATH = resolve(
  ROOT,
  "evidence/onchain/bsc-testnet-pta-wbnb-first-lp-eed9c32a107b57735f45bd6246d967cb12fbb1579a05faa9f17e0ead46187d01.json"
);
const EVIDENCE_SHA256 = "3fa80573ea8cd3ee85208670048bffed48d757c2e8674757ac3331077f121d6a";
const OWNER = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";
const PTA = "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const MANAGER = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
const POOL = "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE";
const APPROVAL_TRANSACTION = "0x001c0e6c2f4fc567a455bcb0cd44be6c9ba768066551bdf1d94d978a33138c9d";
const MINT_TRANSACTION = "0xeed9c32a107b57735f45bd6246d967cb12fbb1579a05faa9f17e0ead46187d01";

function readEvidenceBytes() {
  return readFileSync(EVIDENCE_PATH);
}

function readEvidence() {
  return JSON.parse(readEvidenceBytes().toString("utf8"));
}

function assertFinality(finality, receipt) {
  assert.equal(finality.receiptBlockNumber, receipt.blockNumber);
  assert.equal(finality.receiptBlockHash, receipt.blockHash);
  assert.equal(finality.primaryFinalizedBlockNumber, finality.corroboratorFinalizedBlockNumber);
  assert.equal(finality.primaryFinalizedBlockHash, finality.corroboratorFinalizedBlockHash);
  assert.ok(BigInt(finality.primaryFinalizedBlockNumber) >= BigInt(receipt.blockNumber));
  assert.equal(finality.canonicalReceiptBlockAgreementVerified, true);
}

test("retained first-LP evidence is the exact runner-emitted artifact", () => {
  const bytes = readEvidenceBytes();
  assert.equal(createHash("sha256").update(bytes).digest("hex"), EVIDENCE_SHA256);

  const evidence = JSON.parse(bytes.toString("utf8"));
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.kind, "bsc_testnet_pta_wbnb_first_lp_execution_evidence");
  assert.equal(evidence.status, "dual_provider_finalized_receipts_confirmed_post_state_verified");
  assert.equal(evidence.release.releaseCommit, "2f7eb8c41ae01843ae47e8a182241d055ca4d1ab");
  assert.equal(evidence.release.releaseTree, "79ce22f1097e2cb8ef9aeb4a56d40e20152bc564");
  assert.equal(
    evidence.release.runtimeManifestSha256,
    "0xa33e74dace67c04e1b0cd0d532cd70a88884428c4d76827490e48f019a8ae5a8"
  );
  assert.equal(
    evidence.exactScopeSha256,
    "0xca4f1dde1a964eea8822253e130f47041126ca1c7895a887abeb3c93c0143912"
  );
  assert.equal(
    evidence.ownerChallengeBindingSha256,
    "0x91d6f6f5091228cb8c1457cb679cda48643a9a52e15ba77e2abaaad5cc38a414"
  );
  assert.equal(evidence.chain.environment, "bsc-testnet");
  assert.equal(evidence.chain.chainId, 97);
  assert.equal(evidence.chain.mainnetWritePossible, false);
  assert.deepEqual(evidence.boundary, {
    noRetry: true,
    noReplacement: true,
    approvalSentAtMostOnce: true,
    mintSentAtMostOnce: true,
    liquidityClaimRequiresTheseReceipts: true,
    realizedEconomicBenefitStillUnknown: true
  });
});

test("retained first-LP receipts bind the exact approval and mint", () => {
  const evidence = readEvidence();
  assert.equal(evidence.approval.transactionHash, APPROVAL_TRANSACTION);
  assert.equal(evidence.approval.receipt.transactionHash, APPROVAL_TRANSACTION);
  assert.equal(evidence.approval.receipt.from, OWNER);
  assert.equal(evidence.approval.receipt.to, PTA);
  assert.equal(evidence.approval.receipt.status, "1");
  assert.equal(evidence.approval.receipt.logs.length, 1);
  assert.equal(evidence.approval.receipt.logs[0].address, PTA);
  assert.equal(
    evidence.approval.receipt.logs[0].topics[0],
    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
  );
  assert.equal(
    evidence.approval.receipt.logs[0].data,
    "0x00000000000000000000000000000000000000000000003635c9adc5dea00000"
  );
  assertFinality(evidence.approval.finality, evidence.approval.receipt);

  assert.equal(evidence.mint.transactionHash, MINT_TRANSACTION);
  assert.equal(evidence.mint.receipt.transactionHash, MINT_TRANSACTION);
  assert.equal(evidence.mint.receipt.from, OWNER);
  assert.equal(evidence.mint.receipt.to, MANAGER);
  assert.equal(evidence.mint.receipt.status, "1");
  assert.deepEqual(
    evidence.mint.receipt.logs.map(({ address }) => address),
    [PTA, WBNB, WBNB, POOL, MANAGER, MANAGER]
  );
  assertFinality(evidence.mint.finality, evidence.mint.receipt);

  const actualGasWei =
    BigInt(evidence.approval.receipt.gasUsed) *
      BigInt(evidence.approval.receipt.effectiveGasPrice) +
    BigInt(evidence.mint.receipt.gasUsed) * BigInt(evidence.mint.receipt.effectiveGasPrice);
  assert.equal(actualGasWei, 64_146_300_000_000n);
  assert.ok(1_000_000_000_000_000n + actualGasWei <= 1_080_596_200_000_000n);
});

test("retained first-LP post-state proves ownership, exact liquidity and zero allowance", () => {
  const evidence = readEvidence();
  assert.deepEqual(evidence.postState.events, {
    tokenId: "37109",
    liquidityRaw: "1000000000000000000",
    amount0Raw: "1000000000000000000000",
    amount1Raw: "1000000000000000"
  });
  assert.equal(evidence.postState.providerAgreementVerified, true);
  assert.deepEqual(
    evidence.postState.observations.map(({ provider }) => provider),
    ["primary", "corroborator"]
  );

  for (const observation of evidence.postState.observations) {
    assert.equal(observation.eip1898BlockHash, evidence.mint.receipt.blockHash);
    assert.equal(observation.tokenId, "37109");
    assert.equal(observation.owner, OWNER);
    assert.equal(observation.allowanceRaw, "0");
    assert.equal(observation.position.token0, PTA);
    assert.equal(observation.position.token1, WBNB);
    assert.equal(observation.position.fee, "500");
    assert.equal(observation.position.tickLower, -887270);
    assert.equal(observation.position.tickUpper, 887270);
    assert.equal(observation.position.liquidity, "1000000000000000000");
    assert.equal(observation.position.tokensOwed0, "0");
    assert.equal(observation.position.tokensOwed1, "0");
    assert.equal(observation.poolLiquidityRaw, "1000000000000000000");
  }
});

test("retained first-LP evidence contains no custody or raw-transaction material", () => {
  const text = readEvidenceBytes().toString("utf8");
  for (const forbiddenKey of [
    '"privateKey":',
    '"walletPassword":',
    '"mnemonic":',
    '"seedPhrase":',
    '"signedTransaction":',
    '"rawTransaction":'
  ]) {
    assert.equal(text.includes(forbiddenKey), false);
  }
  assert.equal(/private[_ -]?key\s*[:=]\s*["']?0x[0-9a-f]{64}/iu.test(text), false);
  assert.equal(/0x[0-9a-f]{1000,}/u.test(text), false);
});
