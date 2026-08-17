import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";

const COMMIT = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: "../..",
  encoding: "utf8"
}).trim();
const argumentsList = [
  "scripts/prepare-recovery.mjs",
  "--deployer",
  "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
  "--nonce",
  "5",
  "--expires-at",
  "2000086400",
  "--source-commit",
  COMMIT
];

test("prepares only three bounded recovery hires against the finalized deployment", () => {
  const preparation = JSON.parse(
    execFileSync(process.execPath, argumentsList, { encoding: "utf8" })
  );
  assert.equal(preparation.schemaVersion, "proofera-testnet-hire-recovery-preparation-v1.0.0");
  assert.equal(preparation.classification.authorization, false);
  assert.equal(
    preparation.recovery.deploymentTransactionHash,
    "0x7fa5ad3e7b33dfb6dfccdfd06c6e54cc2d833d5aa005ec3f01c98cf72be3ddcf"
  );
  assert.equal(preparation.recovery.recoveredContract, preparation.contractAddress);
  assert.equal(preparation.bounds.deploymentCount, 0);
  assert.equal(preparation.bounds.hireCount, 3);
  assert.equal(preparation.bounds.maxNetworkFeeWei, "120000000000000");
  assert.equal(preparation.bounds.maxTotalSpendWei, "150000000000000");
  assert.deepEqual(
    preparation.hires.map(({ nonce }) => nonce),
    ["6", "7", "8"]
  );
});

test("recovery preparation fails closed before running the producer on malformed invocation", () => {
  const result = spawnSync(process.execPath, ["scripts/prepare-recovery.mjs"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "HIRE_RECOVERY_PREPARATION_ARGUMENTS_INVALID\n");
});
