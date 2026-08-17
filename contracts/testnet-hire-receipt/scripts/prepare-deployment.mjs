import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  encodeDeployData,
  encodeFunctionData,
  getContractAddress,
  isAddress,
  keccak256,
  parseEther,
  sha256,
  stringToHex
} from "viem";

const CHAIN_ID = 97;
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const PAYMENT_WEI = parseEther("0.00001");
const DEPLOYMENT_GAS_LIMIT = 400_000n;
const HIRE_GAS_LIMIT = 200_000n;
const MAX_GAS_PRICE_WEI = 200_000_000n;
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const TASKS = Object.freeze([
  Object.freeze({ agentId: 1825n, slug: "pancake-lp-range-decision" }),
  Object.freeze({ agentId: 1825n, slug: "autonomous-session-permission-audit" }),
  Object.freeze({ agentId: 1828n, slug: "venus-health-factor-decision" })
]);

function fail(code) {
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  if (argv.length !== 8) throw new Error("HIRE_PREPARATION_ARGUMENTS_INVALID");
  const expected = ["--deployer", "--nonce", "--expires-at", "--source-commit"];
  const values = {};
  for (let index = 0; index < expected.length; index += 1) {
    if (argv[index * 2] !== expected[index]) {
      throw new Error("HIRE_PREPARATION_ARGUMENTS_INVALID");
    }
    values[expected[index].slice(2)] = argv[index * 2 + 1];
  }
  if (!isAddress(values.deployer, { strict: true })) {
    throw new Error("HIRE_PREPARATION_DEPLOYER_INVALID");
  }
  if (!/^(?:0|[1-9][0-9]*)$/u.test(values.nonce)) {
    throw new Error("HIRE_PREPARATION_NONCE_INVALID");
  }
  if (!/^(?:0|[1-9][0-9]*)$/u.test(values["expires-at"])) {
    throw new Error("HIRE_PREPARATION_EXPIRY_INVALID");
  }
  const expiresAt = BigInt(values["expires-at"]);
  if (expiresAt > 18_446_744_073_709_551_615n) {
    throw new Error("HIRE_PREPARATION_EXPIRY_INVALID");
  }
  if (!/^[0-9a-f]{40}$/u.test(values["source-commit"])) {
    throw new Error("HIRE_PREPARATION_COMMIT_INVALID");
  }
  const sourceExists = spawnSync("git", ["cat-file", "-e", `${values["source-commit"]}^{commit}`], {
    cwd: REPOSITORY_ROOT,
    stdio: "ignore"
  });
  if (sourceExists.status !== 0) {
    throw new Error("HIRE_PREPARATION_COMMIT_NOT_FOUND");
  }
  return Object.freeze({
    deployer: values.deployer,
    nonce: BigInt(values.nonce),
    expiresAt,
    sourceCommit: values["source-commit"]
  });
}

const artifactPath = resolve(
  PACKAGE_ROOT,
  "artifacts/src/ProofEraTestnetHireReceipt.sol/ProofEraTestnetHireReceipt.json"
);

try {
  const args = parseArguments(process.argv.slice(2));
  const artifactBytes = await readFile(artifactPath);
  const artifact = JSON.parse(artifactBytes.toString("utf8"));
  const deploymentData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [REGISTRY]
  });
  const contractAddress = getContractAddress({
    from: args.deployer,
    nonce: args.nonce
  });
  const hires = TASKS.map((task, index) => {
    const taskHash = keccak256(stringToHex(`proofera-termix:${task.slug}:v1`));
    const engagementId = keccak256(
      stringToHex(`proofera:${args.sourceCommit}:${task.slug}:${task.agentId.toString()}`)
    );
    return Object.freeze({
      agentId: task.agentId.toString(),
      calldata: encodeFunctionData({
        abi: artifact.abi,
        functionName: "hire",
        args: [task.agentId, engagementId, taskHash, args.expiresAt]
      }),
      engagementId,
      expiresAt: args.expiresAt.toString(),
      gasLimit: HIRE_GAS_LIMIT.toString(),
      nonce: (args.nonce + BigInt(index) + 1n).toString(),
      paymentWei: PAYMENT_WEI.toString(),
      slug: task.slug,
      taskHash,
      to: contractAddress
    });
  });
  const manifest = {
    schemaVersion: "proofera-testnet-hire-deployment-preparation-v1.0.0",
    classification: {
      artifact: "unsigned_transaction_preparation",
      authorization: false,
      broadcast: false,
      performanceEvidence: false
    },
    chainId: CHAIN_ID,
    sourceCommit: args.sourceCommit,
    deployer: args.deployer,
    deployerNonce: args.nonce.toString(),
    identityRegistry: REGISTRY,
    contractAddress,
    deployment: {
      data: deploymentData,
      dataKeccak256: keccak256(deploymentData),
      artifactSha256: sha256(artifactBytes),
      gasLimit: DEPLOYMENT_GAS_LIMIT.toString(),
      nonce: args.nonce.toString(),
      valueWei: "0"
    },
    hires,
    bounds: {
      deploymentCount: 1,
      hireCount: hires.length,
      paymentPerHireWei: PAYMENT_WEI.toString(),
      totalHirePaymentWei: (PAYMENT_WEI * BigInt(hires.length)).toString(),
      contractMaxPaymentWei: parseEther("0.01").toString(),
      contractMaxHireDurationSeconds: "604800",
      maxGasPriceWei: MAX_GAS_PRICE_WEI.toString(),
      maxNetworkFeeWei: (
        (DEPLOYMENT_GAS_LIMIT + HIRE_GAS_LIMIT * BigInt(hires.length)) *
        MAX_GAS_PRICE_WEI
      ).toString(),
      maxTotalSpendWei: (
        PAYMENT_WEI * BigInt(hires.length) +
        (DEPLOYMENT_GAS_LIMIT + HIRE_GAS_LIMIT * BigInt(hires.length)) * MAX_GAS_PRICE_WEI
      ).toString()
    },
    caveats: [
      "This manifest is unsigned preparation and authorizes no transaction.",
      "A successful event proves a paid testnet hire, not agent performance or execution authority.",
      "Nonce, code absence at the predicted address, expiry, chain, calldata, gas and balance require fresh pre-sign checks."
    ]
  };
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
} catch (error) {
  fail(error instanceof Error ? error.message : "HIRE_PREPARATION_FAILED");
}
