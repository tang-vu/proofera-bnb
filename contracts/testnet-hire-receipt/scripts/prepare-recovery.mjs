import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEPLOYMENT_TX_HASH = "0x7fa5ad3e7b33dfb6dfccdfd06c6e54cc2d833d5aa005ec3f01c98cf72be3ddcf";
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PREPARE_DEPLOYMENT = resolve(PACKAGE_ROOT, "scripts", "prepare-deployment.mjs");

if (process.argv.slice(2).length !== 8) {
  process.stderr.write("HIRE_RECOVERY_PREPARATION_ARGUMENTS_INVALID\n");
  process.exit(1);
}

try {
  const deployment = JSON.parse(
    execFileSync(process.execPath, [PREPARE_DEPLOYMENT, ...process.argv.slice(2)], {
      cwd: PACKAGE_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
  );
  const recovery = {
    ...deployment,
    schemaVersion: "proofera-testnet-hire-recovery-preparation-v1.0.0",
    classification: {
      ...deployment.classification,
      artifact: "unsigned_recovery_transaction_preparation"
    },
    recovery: {
      deploymentTransactionHash: DEPLOYMENT_TX_HASH,
      requiredDeploymentStatus: "confirmed_finalized",
      recoveredContract: deployment.contractAddress
    },
    bounds: {
      ...deployment.bounds,
      deploymentCount: 0,
      maxNetworkFeeWei: "120000000000000",
      maxTotalSpendWei: "150000000000000"
    },
    caveats: [
      "This manifest prepares three recovery hire transactions and authorizes no transaction.",
      "The prior deployment receipt, finalized runtime, nonce, unused engagements, owners, expiry, chain, calldata, gas and balance require fresh pre-sign checks.",
      "A successful event proves a paid testnet hire, not agent performance or execution authority."
    ]
  };
  process.stdout.write(`${JSON.stringify(recovery, null, 2)}\n`);
} catch {
  process.stderr.write("HIRE_RECOVERY_PREPARATION_FAILED\n");
  process.exitCode = 1;
}
