import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { Interface, keccak256 } from "ethers";

const preparationPath = "../../evidence/termix/hire-preparations/1787288386-hire-termix-v3.json";
const proposalPath =
  "../../evidence/termix/hire-preparations/1787288386-hire-termix-v3-approval-proposal.json";
const artifactPath = "artifacts/src/ProofEraTestnetHireReceipt.sol/ProofEraTestnetHireReceipt.json";
const preparationBytes = readFileSync(preparationPath);
const preparation = JSON.parse(preparationBytes.toString("utf8"));
const proposal = JSON.parse(readFileSync(proposalPath, "utf8"));
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const contractInterface = new Interface(artifact.abi);

test("approval proposal binds the exact unsigned preparation and remains unapproved", () => {
  const digest = createHash("sha256").update(preparationBytes).digest("hex");
  assert.equal(digest, "3e646c7cfdbd299771e4424457697bcbb1d66170e44c4b6356908dbf48531e3c");
  assert.equal(proposal.preparation.sha256, digest);
  assert.equal(proposal.sourceCommit, preparation.sourceCommit);
  assert.equal(proposal.approvalId, "HIRE-TERMIX-2026-08-17-V3");
  assert.equal(proposal.state, "proposed_unapproved");
  assert.equal(proposal.authorization, false);
  assert.equal(proposal.broadcast, false);
  assert.ok(Object.values(proposal.claims).every((value) => value === false));
  assert.match(proposal.requiredApprovalText, new RegExp(digest, "u"));
  assert.match(proposal.requiredApprovalText, /HIRE-TERMIX-2026-08-17-V3/u);
});

test("four transaction review rows match deployment and decoded hire bytes", () => {
  assert.equal(proposal.transactions.length, 4);
  const [deployment, ...hires] = proposal.transactions;
  assert.equal(deployment.dataKeccak256, preparation.deployment.dataKeccak256);
  assert.equal(deployment.artifactSha256, preparation.deployment.artifactSha256);
  assert.equal(deployment.nonce, preparation.deployment.nonce);
  assert.equal(deployment.gasLimit, preparation.deployment.gasLimit);

  for (const [index, reviewed] of hires.entries()) {
    const prepared = preparation.hires[index];
    assert.equal(reviewed.slug, prepared.slug);
    assert.equal(reviewed.nonce, prepared.nonce);
    assert.equal(reviewed.agentId, prepared.agentId);
    assert.equal(reviewed.engagementId, prepared.engagementId);
    assert.equal(reviewed.taskHash, prepared.taskHash);
    assert.equal(reviewed.valueWei, prepared.paymentWei);
    assert.equal(reviewed.gasLimit, prepared.gasLimit);
    assert.equal(reviewed.calldataKeccak256, keccak256(prepared.calldata));
    const decoded = contractInterface.decodeFunctionData("hire", prepared.calldata);
    assert.equal(decoded.agentId.toString(), reviewed.agentId);
    assert.equal(decoded.engagementId, reviewed.engagementId);
    assert.equal(decoded.taskHash, reviewed.taskHash);
    assert.equal(decoded.expiresAt.toString(), proposal.scope.expiryUnix);
  }
});

test("proposal arithmetic and both read-only provider observations agree", () => {
  const transactionGas = proposal.transactions.reduce(
    (total, transaction) => total + BigInt(transaction.gasLimit),
    0n
  );
  const payments = proposal.transactions.reduce(
    (total, transaction) => total + BigInt(transaction.valueWei),
    0n
  );
  assert.equal(transactionGas, 1_000_000n);
  assert.equal(payments.toString(), proposal.bounds.totalHirePaymentWei);
  assert.equal(
    (transactionGas * BigInt(proposal.bounds.maxGasPriceWei)).toString(),
    proposal.bounds.maxNetworkFeeWei
  );
  assert.equal(
    (payments + BigInt(proposal.bounds.maxNetworkFeeWei)).toString(),
    proposal.bounds.maxTotalSpendWei
  );
  assert.equal(proposal.observations.length, 2);
  for (const observation of proposal.observations) {
    assert.equal(observation.chainId, "0x61");
    assert.equal(observation.latestNonce, "0x5");
    assert.equal(observation.pendingNonce, "0x5");
    assert.equal(observation.balanceWei, "87934297300000000");
    assert.equal(observation.gasPriceWei, "100000000");
    assert.equal(observation.predictedCode, "0x");
    assert.equal(observation.deploymentGasEstimate, "355696");
  }
  assert.ok(
    proposal.observations.every(
      ({ balanceWei }) => BigInt(balanceWei) > BigInt(proposal.bounds.maxTotalSpendWei)
    )
  );
  assert.equal(proposal.unknownOutcomePolicy.blindRetry, false);
  assert.equal(proposal.unknownOutcomePolicy.continueAfterFailure, false);
});
