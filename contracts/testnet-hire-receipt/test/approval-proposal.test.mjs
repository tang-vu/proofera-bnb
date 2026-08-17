import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { Interface, keccak256 } from "ethers";

const preparationPath =
  "../../evidence/termix/hire-preparations/1787288386-hire-termix-v5-recovery.json";
const proposalPath =
  "../../evidence/termix/hire-preparations/1787288386-hire-termix-v5-recovery-approval-proposal.json";
const artifactPath = "artifacts/src/ProofEraTestnetHireReceipt.sol/ProofEraTestnetHireReceipt.json";
const preparationBytes = readFileSync(preparationPath);
const preparation = JSON.parse(preparationBytes.toString("utf8"));
const proposal = JSON.parse(readFileSync(proposalPath, "utf8"));
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const contractInterface = new Interface(artifact.abi);

test("approval proposal binds the exact unsigned preparation and remains unapproved", () => {
  const digest = createHash("sha256").update(preparationBytes).digest("hex");
  assert.equal(digest, "44a5fd0779c9ae81ef257484805b26cdfd682f065a89360ea35c60bf80ea1389");
  assert.equal(proposal.preparation.sha256, digest);
  assert.equal(proposal.sourceCommit, preparation.sourceCommit);
  assert.equal(proposal.approvalId, "HIRE-TERMIX-2026-08-17-V5");
  assert.equal(proposal.state, "proposed_unapproved");
  assert.equal(proposal.authorization, false);
  assert.equal(proposal.broadcast, false);
  assert.equal(proposal.claims.deployed, true);
  assert.ok(
    Object.entries(proposal.claims)
      .filter(([claim]) => claim !== "deployed")
      .every(([, value]) => value === false)
  );
  assert.match(proposal.requiredApprovalText, new RegExp(digest, "u"));
  assert.match(proposal.requiredApprovalText, /HIRE-TERMIX-2026-08-17-V5/u);
});

test("three recovery transaction rows match decoded hire bytes", () => {
  assert.equal(proposal.transactions.length, 3);
  assert.ok(proposal.transactions.every(({ kind }) => kind === "hire"));
  assert.equal(
    proposal.recoveryEvidence.deploymentTransactionHash,
    preparation.recovery.deploymentTransactionHash
  );
  assert.equal(
    proposal.recoveryEvidence.deploymentInputKeccak256,
    preparation.deployment.dataKeccak256
  );

  for (const [index, reviewed] of proposal.transactions.entries()) {
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
  assert.equal(transactionGas, 600_000n);
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
    assert.equal(observation.latestNonce, "0x6");
    assert.equal(observation.pendingNonce, "0x6");
    assert.equal(observation.balanceWei, "87892088860000000");
    assert.equal(observation.gasPriceWei, "100000000");
    assert.equal(observation.runtimeBytes, 1355);
    assert.equal(observation.runtimeKeccak256, proposal.recoveryEvidence.runtimeKeccak256);
    assert.equal(observation.deploymentReceiptStatus, "0x1");
    assert.equal(observation.deploymentBlock, "125583149");
    assert.deepEqual(observation.hireGasEstimates, ["69858", "69846", "69858"]);
    assert.ok(observation.storedEngagementReceipts.every((value) => BigInt(value) === 0n));
  }
  assert.ok(
    proposal.observations.every(
      ({ balanceWei }) => BigInt(balanceWei) > BigInt(proposal.bounds.maxTotalSpendWei)
    )
  );
  assert.equal(proposal.unknownOutcomePolicy.blindRetry, false);
  assert.equal(proposal.unknownOutcomePolicy.continueAfterFailure, false);
});
