import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEPLOYMENT_TX_HASH = "0x7fa5ad3e7b33dfb6dfccdfd06c6e54cc2d833d5aa005ec3f01c98cf72be3ddcf";
const COMPLETED_HIRES = Object.freeze([
  Object.freeze({
    engagementId: "0xa3959c83bef9efbf0ce853b7c7f4d84504e658fad4724b9a45a48e65310762c2",
    receiptHash: "0xadb671a0c7142031633a18c5ba2bf5890dfc5edaf6dd0b760ac02244c5c55910",
    transactionHash: "0x068b450a9867d220cc1eda156e9eb3cb6b8037901a7f7feaaa126aa7e1169747"
  }),
  Object.freeze({
    engagementId: "0xb0568b852938419e5856e215153a1bbb1399b2ad99348b94da45af7b1fda5240",
    receiptHash: "0xfb5c1bf05526ba1b0e3d28398a96b8619a852496c1b4bcfbd1298d66554d1e27",
    transactionHash: "0x0ec15407ab12df85e1a50e39f2316033c31aa28bca756bab6f7ac41a14023e6c"
  })
]);
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
      completedHires: COMPLETED_HIRES,
      deploymentTransactionHash: DEPLOYMENT_TX_HASH,
      requiredDeploymentStatus: "confirmed_finalized",
      recoveredContract: deployment.contractAddress
    },
    bounds: {
      ...deployment.bounds,
      deploymentCount: 0,
      hireCount: 1,
      totalHirePaymentWei: "10000000000000",
      maxNetworkFeeWei: "40000000000000",
      maxTotalSpendWei: "50000000000000"
    },
    hires: [deployment.hires[2]],
    caveats: [
      "This manifest prepares the one remaining recovery hire transaction and authorizes no transaction.",
      "The prior deployment and two completed hire receipts, finalized runtime, nonce, unused engagement, owner, expiry, chain, calldata, gas and balance require fresh pre-sign checks.",
      "A successful event proves a paid testnet hire, not agent performance or execution authority."
    ]
  };
  process.stdout.write(`${JSON.stringify(recovery, null, 2)}\n`);
} catch {
  process.stderr.write("HIRE_RECOVERY_PREPARATION_FAILED\n");
  process.exitCode = 1;
}
