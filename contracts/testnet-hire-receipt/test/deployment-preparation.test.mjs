import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeFunctionData, getContractAddress, keccak256 } from "viem";

const DEPLOYER = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";
const COMMIT = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: "../..",
  encoding: "utf8"
}).trim();
const NONCE = 12n;
const EXPIRY = 2_000_086_400n;
const artifact = JSON.parse(
  readFileSync(
    "artifacts/src/ProofEraTestnetHireReceipt.sol/ProofEraTestnetHireReceipt.json",
    "utf8"
  )
);

function prepare() {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/prepare-deployment.mjs",
      "--deployer",
      DEPLOYER,
      "--nonce",
      NONCE.toString(),
      "--expires-at",
      EXPIRY.toString(),
      "--source-commit",
      COMMIT
    ],
    { encoding: "utf8" }
  );
  return JSON.parse(output);
}

test("prepares one exact deployment and three bounded hires", () => {
  const manifest = prepare();
  assert.equal(manifest.chainId, 97);
  assert.equal(manifest.classification.authorization, false);
  assert.equal(manifest.classification.broadcast, false);
  assert.equal(manifest.contractAddress, getContractAddress({ from: DEPLOYER, nonce: NONCE }));
  assert.equal(manifest.deployment.dataKeccak256, keccak256(manifest.deployment.data));
  assert.equal(manifest.bounds.hireCount, 3);
  assert.equal(manifest.bounds.totalHirePaymentWei, "30000000000000");
  assert.equal(manifest.bounds.maxGasPriceWei, "200000000");
  assert.equal(manifest.bounds.maxNetworkFeeWei, "200000000000000");
  assert.equal(manifest.bounds.maxTotalSpendWei, "230000000000000");
  assert.equal(manifest.deployment.gasLimit, "400000");
  assert.equal(manifest.deployment.nonce, NONCE.toString());
  assert.deepEqual(
    manifest.hires.map(({ agentId }) => agentId),
    ["1825", "1825", "1828"]
  );
  for (const [index, hire] of manifest.hires.entries()) {
    const decoded = decodeFunctionData({ abi: artifact.abi, data: hire.calldata });
    assert.equal(decoded.functionName, "hire");
    assert.equal(decoded.args[0].toString(), hire.agentId);
    assert.equal(decoded.args[1], hire.engagementId);
    assert.equal(decoded.args[2], hire.taskHash);
    assert.equal(decoded.args[3].toString(), hire.expiresAt);
    assert.equal(hire.paymentWei, "10000000000000");
    assert.equal(hire.gasLimit, "200000");
    assert.equal(hire.nonce, (NONCE + BigInt(index) + 1n).toString());
    assert.equal(hire.to, manifest.contractAddress);
  }
});

test("fails closed on malformed preparation arguments", () => {
  const result = spawnSync(process.execPath, ["scripts/prepare-deployment.mjs"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "HIRE_PREPARATION_ARGUMENTS_INVALID\n");
});

test("fails closed when a syntactically valid source commit does not exist", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/prepare-deployment.mjs",
      "--deployer",
      DEPLOYER,
      "--nonce",
      NONCE.toString(),
      "--expires-at",
      EXPIRY.toString(),
      "--source-commit",
      "0000000000000000000000000000000000000000"
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "HIRE_PREPARATION_COMMIT_NOT_FOUND\n");
});

test("preparation script contains no signing or broadcast primitive", () => {
  const source = readFileSync("scripts/prepare-deployment.mjs", "utf8");
  assert.doesNotMatch(
    source,
    /eth_sendRawTransaction|sendTransaction|signTransaction|privateKey|WALLET_PASSWORD/u
  );
});
