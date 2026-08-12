import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_PATH = resolve(
  ROOT,
  "evidence",
  "development",
  "bsc-testnet-pta-deployment-2026-08-12.json"
);
const EXPECTED_TRANSACTION = "0x0852f32bf54aeac58815d93a64a5d38cda2f8615f2a997b4a601a06b380168c7";
const EXPECTED_CONTRACT = "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc";
const EXPECTED_RECIPIENT = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";

function readEvidence() {
  return JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
}

test("PTA deployment evidence binds the finalized chain-97 receipt and state", () => {
  const evidence = readEvidence();
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.recordType, "bsc_testnet_pta_deployment_receipt");
  assert.equal(evidence.status, "deployed_finalized");
  assert.equal(evidence.chainId, 97);
  assert.equal(evidence.observedAt, "2026-08-12T17:25:27.390Z");
  assert.equal(evidence.deploymentRunnerCommit, "d9c975394b46c84ad909e11d31437399560268a0");
  assert.equal(evidence.verificationRunnerCommit, "88ad789c08b05824216016bfedbce0c6d55b89b4");
  assert.equal(evidence.transaction.hash, EXPECTED_TRANSACTION);
  assert.equal(evidence.transaction.blockNumber, "124684970");
  assert.equal(
    evidence.transaction.blockHash,
    "0x816366c03b0aaec4a99642d75a00c5ef9a8f2545105d78dac7c26c3c7b20b36c"
  );
  assert.equal(evidence.transaction.contractAddress, EXPECTED_CONTRACT);
  assert.equal(evidence.transaction.from, EXPECTED_RECIPIENT);
  assert.equal(evidence.transaction.nonce, "0");
  assert.equal(evidence.transaction.to, null);
  assert.equal(evidence.transaction.valueWei, "0");
  assert.equal(evidence.transaction.deploymentDataBytes, 2947);
  assert.equal(
    evidence.transaction.deploymentDataSha256,
    "45f05cb4c02100cccf74c7b2e7c31d04386642309ca2b9a9614684d0341cd239"
  );
  assert.equal(
    evidence.transaction.deploymentDataKeccak256,
    "0xc5f631e51c930369f41ed53660de0c5b82a025a09ad223cb8c5d7986687cd0a1"
  );
  assert.equal(evidence.contract.address, EXPECTED_CONTRACT);
  assert.equal(evidence.contract.runtimeBytes, 1826);
  assert.equal(
    evidence.contract.runtimeSha256,
    "e018f428a384212f11817a24f4828c1a479403d86491e256a7f79d3142395527"
  );
  assert.equal(
    evidence.contract.runtimeKeccak256,
    "0x2f8caecd2e51f085ab11a67e5b8a89eeab7b667bd89ec708a481b66ed756e006"
  );
  assert.equal(evidence.token.recipient, EXPECTED_RECIPIENT);
  assert.equal(evidence.token.totalSupplyBaseUnits, "1000000000000000000000000");
  assert.equal(evidence.token.recipientBalanceBaseUnits, evidence.token.totalSupplyBaseUnits);
  assert.equal(evidence.token.exactSingleMintTransferVerified, true);
  assert.equal(evidence.token.surfaceReviewBasis, "exact_runtime_matches_reviewed_artifact");
  assert.equal(evidence.finality.deploymentBlockCanonicalOnBothProviders, true);
  assert.equal(evidence.finality.deploymentFinalizedOnBothProviders, true);
  assert.equal(evidence.finality.receiptProviderAgreementVerified, true);
  assert.equal(evidence.contract.runtimeProviderAgreementVerified, true);
  assert.equal(evidence.stateObservation.blockNumber, "124686818");
  assert.equal(
    evidence.stateObservation.blockHash,
    "0xfd6482de9fa3337aa04f6400cf3b6983313bdfdec5e4a0f5926604c9343aafab"
  );
  assert.equal(evidence.stateObservation.blockTimestamp, "2026-08-12T17:24:00.000Z");
  assert.equal(evidence.stateObservation.queryBinding, "eip1898_block_hash_require_canonical");
  assert.equal(evidence.stateObservation.providerAgreementVerified, true);
  assert.ok(
    BigInt(evidence.stateObservation.blockNumber) >= BigInt(evidence.transaction.blockNumber)
  );
  assert.deepEqual(
    evidence.sources.map(({ role, origin }) => ({ role, origin })),
    [
      {
        role: "primary",
        origin: "https://bsc-testnet-dataseed.bnbchain.org"
      },
      {
        role: "corroborator",
        origin: "https://bsc-testnet.bnbchain.org"
      }
    ]
  );
});

test("PTA deployment evidence has internally consistent gas and balance arithmetic", () => {
  const evidence = readEvidence();
  const gasUsed = BigInt(evidence.transaction.gasUsed);
  const gasPrice = BigInt(evidence.transaction.effectiveGasPriceWei);
  const fee = BigInt(evidence.transaction.feeWei);
  assert.equal(gasUsed * gasPrice, fee);
  assert.equal(
    100_000_000_000_000_000n - fee,
    BigInt(evidence.stateObservation.deployerBalanceWei)
  );
  assert.equal(evidence.transaction.feeTbnb, "0.0000556227");
});

test("PTA deployment evidence exposes only public references and narrow boundaries", () => {
  const evidenceText = readFileSync(EVIDENCE_PATH, "utf8");
  const evidence = JSON.parse(evidenceText);
  assert.equal(evidence.explorerReferences.transaction.endsWith(EXPECTED_TRANSACTION), true);
  assert.equal(evidence.explorerReferences.contract.endsWith(EXPECTED_CONTRACT), true);
  assert.equal(evidence.boundaries.testnetOnly, true);
  assert.equal(evidence.boundaries.mainnetWritePerformed, false);
  assert.equal(evidence.boundaries.privateKeyIncluded, false);
  assert.equal(evidence.boundaries.walletPasswordIncluded, false);
  assert.equal(evidence.boundaries.rawSignedTransactionIncluded, false);
  assert.equal(evidence.boundaries.verificationRunSignedAgain, false);
  assert.equal(evidence.boundaries.verificationRunBroadcastAgain, false);
  assert.equal(evidence.boundaries.replacementTransactionCreated, false);
  assert.equal(evidence.boundaries.finalizedStateObservationUsed, true);
  assert.equal(/private[_ -]?key\s*[:=]\s*["']?0x[0-9a-f]{64}/iu.test(evidenceText), false);
  for (const forbiddenKey of [
    '"privateKey":',
    '"walletPassword":',
    '"mnemonic":',
    '"seedPhrase":',
    '"signedTransaction":',
    '"rawTransaction":'
  ]) {
    assert.equal(evidenceText.includes(forbiddenKey), false);
  }
  assert.equal(/0x[0-9a-f]{1000,}/u.test(evidenceText), false);
});
