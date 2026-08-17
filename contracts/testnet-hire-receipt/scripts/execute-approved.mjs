import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  closeSync,
  fsyncSync
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Interface, Transaction, Wallet, getAddress, keccak256 } from "ethers";

import { materializeRuntimeBytecode } from "./hire-runtime-bytecode.mjs";

const CHAIN_ID = 97n;
const SOURCE = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const APPROVAL_ID = "HIRE-TERMIX-2026-08-17-V6";
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
const KEYSTORE_NAME =
  "UTC--2026-08-12T09-45-30.464Z--997cd959798f7c925076eaeff5855c5c2c1e5a49.keystore.json";
const PASSWORD_BLOB_NAME = "deployer-password.dpapi";
const PASSWORD_BYTES = 48;
const SIGNING_GAS_PRICE_WEI = 120_000_000n;
const RECOVERY_MAX_TOTAL_SPEND_WEI = 50_000_000_000_000n;
const FINALITY_DEPTH = 12n;
const RPCS = Object.freeze([
  Object.freeze({
    name: "bnb-chain",
    url: "https://data-seed-prebsc-2-s2.binance.org:8545"
  }),
  Object.freeze({ name: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" })
]);
const EXPECTED_AGENT_OWNERS = Object.freeze({
  1825: "0xAd03eF7e21c35FD1446c153f6eE5e6165F696990",
  1828: "0x708cb7F2b974d94005E762A140c469F1125e0cB4"
});
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const PREPARE_SCRIPT = resolve(PACKAGE_ROOT, "scripts", "prepare-recovery.mjs");
const ARTIFACT_PATH = resolve(
  PACKAGE_ROOT,
  "artifacts",
  "src",
  "ProofEraTestnetHireReceipt.sol",
  "ProofEraTestnetHireReceipt.json"
);
const CONTRACT_SCOPE = Object.freeze([
  "contracts/testnet-hire-receipt/src/ProofEraTestnetHireReceipt.sol",
  "contracts/testnet-hire-receipt/hardhat.config.js",
  "contracts/testnet-hire-receipt/package.json",
  "contracts/testnet-hire-receipt/pnpm-lock.yaml",
  "contracts/testnet-hire-receipt/scripts/prepare-deployment.mjs",
  "contracts/testnet-hire-receipt/scripts/prepare-recovery.mjs",
  "contracts/testnet-hire-receipt/scripts/hire-runtime-bytecode.mjs",
  "contracts/testnet-hire-receipt/scripts/execute-approved.mjs"
]);

function emit(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ event, ...fields })}\n`);
}

function fail(code) {
  throw new Error(code);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactHex(value, bytes, code) {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`, "u").test(value)) {
    fail(code);
  }
  return value.toLowerCase();
}

function decimal(value, code) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) fail(code);
  return BigInt(value);
}

function quantity(value, code) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(value)) fail(code);
  return BigInt(value);
}

function parseArguments(argv) {
  const expected = [
    "--execute-approved-hire-termix-final-recovery",
    "--approval-id",
    "--preparation",
    "--preparation-sha256",
    "--head-commit"
  ];
  if (argv.length !== 9 || argv[0] !== expected[0]) fail("HIRE_EXECUTION_EXACT_FLAG_REQUIRED");
  const values = {};
  for (let index = 1; index < expected.length; index += 1) {
    const offset = index * 2 - 1;
    if (argv[offset] !== expected[index]) fail("HIRE_EXECUTION_ARGUMENTS_INVALID");
    values[expected[index].slice(2)] = argv[offset + 1];
  }
  if (values["approval-id"] !== APPROVAL_ID) fail("HIRE_EXECUTION_APPROVAL_ID_INVALID");
  if (!/^[0-9a-f]{64}$/u.test(values["preparation-sha256"])) {
    fail("HIRE_EXECUTION_PREPARATION_DIGEST_INVALID");
  }
  if (!/^[0-9a-f]{40}$/u.test(values["head-commit"])) fail("HIRE_EXECUTION_HEAD_INVALID");
  return Object.freeze({
    approvalId: values["approval-id"],
    headCommit: values["head-commit"],
    preparationPath: resolve(REPOSITORY_ROOT, values.preparation),
    preparationSha256: values["preparation-sha256"]
  });
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  }).trim();
}

function validateRelease(args, preparationBytes, preparation) {
  if (git("rev-parse", "HEAD") !== args.headCommit) fail("HIRE_EXECUTION_HEAD_MISMATCH");
  if (git("status", "--porcelain") !== "") fail("HIRE_EXECUTION_REPOSITORY_DIRTY");
  if (git("rev-parse", "origin/main") !== args.headCommit)
    fail("HIRE_EXECUTION_HEAD_NOT_PUBLISHED");
  const relativePath = relative(REPOSITORY_ROOT, args.preparationPath).split(sep).join("/");
  if (
    !relativePath.startsWith("evidence/termix/hire-preparations/") ||
    relativePath.includes("..")
  ) {
    fail("HIRE_EXECUTION_PREPARATION_PATH_INVALID");
  }
  const committed = execFileSync("git", ["show", `HEAD:${relativePath}`], {
    cwd: REPOSITORY_ROOT,
    encoding: null,
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (!committed.equals(preparationBytes)) fail("HIRE_EXECUTION_PREPARATION_NOT_COMMITTED");
  const sourceCommit = preparation.sourceCommit;
  if (typeof sourceCommit !== "string" || !/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    fail("HIRE_EXECUTION_SOURCE_COMMIT_INVALID");
  }
  const ancestor = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", sourceCommit, args.headCommit],
    {
      cwd: REPOSITORY_ROOT,
      stdio: "ignore"
    }
  );
  if (ancestor.status !== 0) fail("HIRE_EXECUTION_SOURCE_NOT_ANCESTOR");
  const drift = spawnSync(
    "git",
    ["diff", "--quiet", sourceCommit, args.headCommit, "--", ...CONTRACT_SCOPE],
    {
      cwd: REPOSITORY_ROOT,
      stdio: "ignore"
    }
  );
  if (drift.status !== 0) fail("HIRE_EXECUTION_CONTRACT_SCOPE_DRIFT");
}

function regenerate(preparation) {
  const output = execFileSync(
    process.execPath,
    [
      PREPARE_SCRIPT,
      "--deployer",
      preparation.deployer,
      "--nonce",
      preparation.deployerNonce,
      "--expires-at",
      preparation.hires[0].expiresAt,
      "--source-commit",
      preparation.sourceCommit
    ],
    { cwd: PACKAGE_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  const regenerated = JSON.parse(output);
  if (stableJson(regenerated) !== stableJson(preparation)) fail("HIRE_EXECUTION_PREPARATION_DRIFT");
}

function validatePreparation(preparation, artifactBytes) {
  if (
    preparation.schemaVersion !== "proofera-testnet-hire-recovery-preparation-v1.0.0" ||
    preparation.classification?.authorization !== false ||
    preparation.classification?.broadcast !== false ||
    preparation.chainId !== Number(CHAIN_ID) ||
    getAddress(preparation.deployer) !== SOURCE ||
    getAddress(preparation.identityRegistry) !== REGISTRY ||
    preparation.hires?.length !== 1 ||
    preparation.deployment?.artifactSha256 !== `0x${sha256(artifactBytes)}` ||
    preparation.deployment?.dataKeccak256 !== keccak256(preparation.deployment.data) ||
    preparation.recovery?.deploymentTransactionHash !== DEPLOYMENT_TX_HASH ||
    preparation.recovery?.requiredDeploymentStatus !== "confirmed_finalized" ||
    stableJson(preparation.recovery?.completedHires) !== stableJson(COMPLETED_HIRES) ||
    getAddress(preparation.recovery?.recoveredContract) !==
      getAddress(preparation.contractAddress) ||
    decimal(preparation.deployment.nonce, "HIRE_EXECUTION_DEPLOYMENT_NONCE_INVALID") !==
      decimal(preparation.deployerNonce, "HIRE_EXECUTION_NONCE_INVALID") ||
    decimal(preparation.deployment.gasLimit, "HIRE_EXECUTION_DEPLOYMENT_GAS_INVALID") !==
      400_000n ||
    decimal(preparation.bounds?.maxGasPriceWei, "HIRE_EXECUTION_GAS_PRICE_CAP_INVALID") !==
      200_000_000n ||
    preparation.bounds?.deploymentCount !== 0 ||
    preparation.bounds?.hireCount !== 1 ||
    decimal(preparation.bounds?.totalHirePaymentWei, "HIRE_EXECUTION_PAYMENT_CAP_INVALID") !==
      10_000_000_000_000n ||
    decimal(preparation.bounds?.maxNetworkFeeWei, "HIRE_EXECUTION_NETWORK_FEE_CAP_INVALID") !==
      40_000_000_000_000n ||
    decimal(preparation.bounds?.maxTotalSpendWei, "HIRE_EXECUTION_SPEND_CAP_INVALID") !==
      RECOVERY_MAX_TOTAL_SPEND_WEI
  ) {
    fail("HIRE_EXECUTION_PREPARATION_INVALID");
  }
  const expectedAgents = ["1828"];
  for (const [index, hire] of preparation.hires.entries()) {
    if (
      hire.agentId !== expectedAgents[index] ||
      getAddress(hire.to) !== getAddress(preparation.contractAddress) ||
      decimal(hire.nonce, "HIRE_EXECUTION_HIRE_NONCE_INVALID") !==
        decimal(preparation.deployerNonce, "HIRE_EXECUTION_NONCE_INVALID") + BigInt(index) + 3n ||
      decimal(hire.gasLimit, "HIRE_EXECUTION_HIRE_GAS_INVALID") !== 200_000n ||
      decimal(hire.paymentWei, "HIRE_EXECUTION_PAYMENT_INVALID") !== 10_000_000_000_000n ||
      !hire.calldata.startsWith("0xc7d43bd2")
    ) {
      fail("HIRE_EXECUTION_HIRE_INVALID");
    }
  }
  const expiry = decimal(preparation.hires[0].expiresAt, "HIRE_EXECUTION_EXPIRY_INVALID");
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (expiry <= now + 900n || expiry > now + 604_800n) fail("HIRE_EXECUTION_EXPIRY_OUT_OF_WINDOW");
}

async function rpc(provider, method, params) {
  const response = await fetch(provider.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) fail("HIRE_EXECUTION_RPC_HTTP_INVALID");
  const body = await response.json();
  if (body?.jsonrpc !== "2.0" || body?.id !== 1 || body.error !== undefined) {
    fail("HIRE_EXECUTION_RPC_RESPONSE_INVALID");
  }
  return body.result;
}

async function allRpc(method, params) {
  return Promise.all(RPCS.map((provider) => rpc(provider, method, params)));
}

function requireSame(values, code) {
  if (values.length !== 2 || stableJson(values[0]) !== stableJson(values[1])) fail(code);
  return values[0];
}

async function preflight(preparation, artifact) {
  const chainIds = await allRpc("eth_chainId", []);
  if (chainIds.some((value) => quantity(value, "HIRE_EXECUTION_CHAIN_INVALID") !== CHAIN_ID)) {
    fail("HIRE_EXECUTION_WRONG_CHAIN");
  }
  const deploymentNonce = decimal(preparation.deployerNonce, "HIRE_EXECUTION_NONCE_INVALID");
  const nonce = deploymentNonce + 3n;
  const [
    latest,
    pending,
    balances,
    gasPrices,
    predictedCode,
    registryCode,
    receipts,
    transactions
  ] = await Promise.all([
    allRpc("eth_getTransactionCount", [SOURCE, "latest"]),
    allRpc("eth_getTransactionCount", [SOURCE, "pending"]),
    allRpc("eth_getBalance", [SOURCE, "latest"]),
    allRpc("eth_gasPrice", []),
    allRpc("eth_getCode", [preparation.contractAddress, "latest"]),
    allRpc("eth_getCode", [REGISTRY, "latest"]),
    allRpc("eth_getTransactionReceipt", [DEPLOYMENT_TX_HASH]),
    allRpc("eth_getTransactionByHash", [DEPLOYMENT_TX_HASH])
  ]);
  if (
    latest.some((value) => quantity(value, "HIRE_EXECUTION_NONCE_INVALID") !== nonce) ||
    pending.some((value) => quantity(value, "HIRE_EXECUTION_NONCE_INVALID") !== nonce)
  ) {
    fail("HIRE_EXECUTION_NONCE_MISMATCH");
  }
  if (
    balances.some(
      (value) => quantity(value, "HIRE_EXECUTION_BALANCE_INVALID") < RECOVERY_MAX_TOTAL_SPEND_WEI
    )
  ) {
    fail("HIRE_EXECUTION_BALANCE_INSUFFICIENT");
  }
  const gasCap = decimal(preparation.bounds.maxGasPriceWei, "HIRE_EXECUTION_GAS_PRICE_CAP_INVALID");
  if (
    gasPrices.some((value) => quantity(value, "HIRE_EXECUTION_GAS_PRICE_INVALID") > gasCap) ||
    SIGNING_GAS_PRICE_WEI > gasCap
  ) {
    fail("HIRE_EXECUTION_GAS_PRICE_EXCEEDS_CAP");
  }
  if (registryCode.some((value) => typeof value !== "string" || value === "0x")) {
    fail("HIRE_EXECUTION_REGISTRY_CODE_MISSING");
  }
  const expectedRuntime = materializeRuntimeBytecode(artifact, REGISTRY).toLowerCase();
  if (
    predictedCode.some(
      (value) => typeof value !== "string" || value.toLowerCase() !== expectedRuntime
    )
  ) {
    fail("HIRE_EXECUTION_DEPLOYED_CODE_MISMATCH");
  }
  if (receipts.some((receipt) => receipt === null) || transactions.some((tx) => tx === null)) {
    fail("HIRE_EXECUTION_DEPLOYMENT_EVIDENCE_MISSING");
  }
  const normalizedReceipts = receipts.map((receipt) => {
    const normalized = { ...receipt };
    delete normalized.blockTimestamp;
    return normalized;
  });
  const receipt = requireSame(
    normalizedReceipts,
    "HIRE_EXECUTION_DEPLOYMENT_RECEIPT_PROVIDER_MISMATCH"
  );
  const transaction = requireSame(
    transactions.map((tx) => {
      const normalized = { ...tx };
      delete normalized.blockTimestamp;
      return normalized;
    }),
    "HIRE_EXECUTION_DEPLOYMENT_TRANSACTION_PROVIDER_MISMATCH"
  );
  if (
    exactHex(receipt.transactionHash, 32, "HIRE_EXECUTION_DEPLOYMENT_HASH_INVALID") !==
      DEPLOYMENT_TX_HASH ||
    quantity(receipt.status, "HIRE_EXECUTION_DEPLOYMENT_STATUS_INVALID") !== 1n ||
    getAddress(receipt.contractAddress) !== getAddress(preparation.contractAddress) ||
    getAddress(transaction.from) !== SOURCE ||
    transaction.to !== null ||
    quantity(transaction.nonce, "HIRE_EXECUTION_DEPLOYMENT_NONCE_INVALID") !== deploymentNonce ||
    transaction.input.toLowerCase() !== preparation.deployment.data.toLowerCase() ||
    quantity(transaction.value, "HIRE_EXECUTION_DEPLOYMENT_VALUE_INVALID") !== 0n ||
    quantity(transaction.gas, "HIRE_EXECUTION_DEPLOYMENT_GAS_INVALID") !== 400_000n ||
    quantity(transaction.gasPrice, "HIRE_EXECUTION_DEPLOYMENT_GAS_PRICE_INVALID") !==
      SIGNING_GAS_PRICE_WEI
  ) {
    fail("HIRE_EXECUTION_DEPLOYMENT_EVIDENCE_INVALID");
  }
  const heads = await allRpc("eth_blockNumber", []);
  const deploymentBlock = quantity(receipt.blockNumber, "HIRE_EXECUTION_DEPLOYMENT_BLOCK_INVALID");
  if (
    heads.some(
      (head) =>
        quantity(head, "HIRE_EXECUTION_HEAD_BLOCK_INVALID") < deploymentBlock + FINALITY_DEPTH
    )
  ) {
    fail("HIRE_EXECUTION_DEPLOYMENT_NOT_FINAL");
  }
  const contractInterface = new Interface(artifact.abi);
  for (const completed of COMPLETED_HIRES) {
    const completedReceipts = await allRpc("eth_getTransactionReceipt", [
      completed.transactionHash
    ]);
    if (completedReceipts.some((completedReceipt) => completedReceipt === null)) {
      fail("HIRE_EXECUTION_COMPLETED_HIRE_RECEIPT_MISSING");
    }
    const completedReceipt = requireSame(
      completedReceipts.map((value) => {
        const normalized = { ...value };
        delete normalized.blockTimestamp;
        return normalized;
      }),
      "HIRE_EXECUTION_COMPLETED_HIRE_RECEIPT_PROVIDER_MISMATCH"
    );
    const completedBlock = quantity(
      completedReceipt.blockNumber,
      "HIRE_EXECUTION_COMPLETED_HIRE_BLOCK_INVALID"
    );
    if (
      quantity(completedReceipt.status, "HIRE_EXECUTION_COMPLETED_HIRE_STATUS_INVALID") !== 1n ||
      exactHex(
        completedReceipt.transactionHash,
        32,
        "HIRE_EXECUTION_COMPLETED_HIRE_HASH_INVALID"
      ) !== completed.transactionHash ||
      heads.some(
        (head) =>
          quantity(head, "HIRE_EXECUTION_HEAD_BLOCK_INVALID") < completedBlock + FINALITY_DEPTH
      )
    ) {
      fail("HIRE_EXECUTION_COMPLETED_HIRE_EVIDENCE_INVALID");
    }
    const storedCompleted = await allRpc("eth_call", [
      {
        to: preparation.contractAddress,
        data: contractInterface.encodeFunctionData("receiptByEngagement", [completed.engagementId])
      },
      "latest"
    ]);
    if (
      storedCompleted.some(
        (value) =>
          exactHex(value, 32, "HIRE_EXECUTION_COMPLETED_HIRE_STATE_INVALID") !==
          completed.receiptHash
      )
    ) {
      fail("HIRE_EXECUTION_COMPLETED_HIRE_STATE_MISMATCH");
    }
  }
  for (const hire of preparation.hires) {
    const stored = await allRpc("eth_call", [
      {
        to: preparation.contractAddress,
        data: contractInterface.encodeFunctionData("receiptByEngagement", [hire.engagementId])
      },
      "latest"
    ]);
    if (
      stored.some(
        (value) =>
          exactHex(value, 32, "HIRE_EXECUTION_EXISTING_RECEIPT_INVALID") !== `0x${"0".repeat(64)}`
      )
    ) {
      fail("HIRE_EXECUTION_ENGAGEMENT_ALREADY_USED");
    }
  }
  emit("preflight", {
    approvalId: APPROVAL_ID,
    balanceWei: quantity(balances[0], "HIRE_EXECUTION_BALANCE_INVALID").toString(),
    chainId: Number(CHAIN_ID),
    deploymentBlock: deploymentBlock.toString(),
    deploymentTransactionHash: DEPLOYMENT_TX_HASH,
    nonce: nonce.toString(),
    recoveredContract: preparation.contractAddress,
    signingGasPriceWei: SIGNING_GAS_PRICE_WEI.toString()
  });
}

function unprotectPassword(protectedBytes) {
  const powershell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const script = `
$ErrorActionPreference = 'Stop'
$protectedBytes = $null
$clearBytes = $null
try {
  $inputStream = [Console]::OpenStandardInput()
  $memory = [System.IO.MemoryStream]::new()
  $inputStream.CopyTo($memory)
  $protectedBytes = $memory.ToArray()
  $memory.Dispose()
  $null = Add-Type -AssemblyName System.Security
  $clearBytes = [System.Security.Cryptography.ProtectedData]::Unprotect($protectedBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  $outputStream = [Console]::OpenStandardOutput()
  $outputStream.Write($clearBytes, 0, $clearBytes.Length)
  $outputStream.Flush()
} catch { exit 31 } finally {
  if ($null -ne $protectedBytes) { [Array]::Clear($protectedBytes, 0, $protectedBytes.Length) }
  if ($null -ne $clearBytes) { [Array]::Clear($clearBytes, 0, $clearBytes.Length) }
}`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const result = spawnSync(
    powershell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encoded
    ],
    {
      input: protectedBytes,
      encoding: null,
      timeout: 15_000,
      windowsHide: true,
      env: {
        SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
        WINDIR: process.env.WINDIR ?? "C:\\Windows"
      }
    }
  );
  if (result.status !== 0 || result.stdout.length !== PASSWORD_BYTES) {
    fail("HIRE_EXECUTION_DPAPI_UNPROTECT_FAILED");
  }
  return result.stdout;
}

async function loadWallet() {
  const localAppData = process.env.LOCALAPPDATA;
  if (typeof localAppData !== "string" || localAppData.length === 0)
    fail("HIRE_EXECUTION_LOCALAPPDATA_MISSING");
  const custody = realpathSync(resolve(localAppData, "ProofEra", "wallets", "bsc-testnet"));
  const expected = realpathSync(resolve(localAppData, "ProofEra", "wallets", "bsc-testnet"));
  if (custody !== expected) fail("HIRE_EXECUTION_CUSTODY_PATH_INVALID");
  const protectedBytes = readFileSync(resolve(custody, PASSWORD_BLOB_NAME));
  const passwordBytes = unprotectPassword(protectedBytes);
  try {
    const wallet = await Wallet.fromEncryptedJson(
      readFileSync(resolve(custody, KEYSTORE_NAME), "utf8"),
      passwordBytes
    );
    if (wallet.address !== SOURCE) fail("HIRE_EXECUTION_WALLET_MISMATCH");
    return wallet;
  } finally {
    passwordBytes.fill(0);
    protectedBytes.fill(0);
  }
}

function writeExclusive(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value)}\n`, { encoding: "utf8" });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

async function waitForReceipt(hash) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const receipts = await allRpc("eth_getTransactionReceipt", [hash]);
    if (receipts.every((receipt) => receipt !== null)) {
      const normalized = receipts.map((receipt) => {
        const standardReceipt = { ...receipt };
        delete standardReceipt.blockTimestamp;
        return standardReceipt;
      });
      const receipt = requireSame(normalized, "HIRE_EXECUTION_RECEIPT_PROVIDER_MISMATCH");
      if (
        exactHex(receipt.transactionHash, 32, "HIRE_EXECUTION_RECEIPT_HASH_INVALID") !==
        hash.toLowerCase()
      ) {
        fail("HIRE_EXECUTION_RECEIPT_HASH_MISMATCH");
      }
      return receipt;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  fail("HIRE_EXECUTION_RECEIPT_TIMEOUT_UNKNOWN");
}

async function sendOne(wallet, journalDir, transaction, label) {
  const [latest, pending, gasPrices, balances] = await Promise.all([
    allRpc("eth_getTransactionCount", [SOURCE, "latest"]),
    allRpc("eth_getTransactionCount", [SOURCE, "pending"]),
    allRpc("eth_gasPrice", []),
    allRpc("eth_getBalance", [SOURCE, "latest"])
  ]);
  const expectedNonce = BigInt(transaction.nonce);
  if (
    latest.some((value) => quantity(value, "HIRE_EXECUTION_NONCE_INVALID") !== expectedNonce) ||
    pending.some((value) => quantity(value, "HIRE_EXECUTION_NONCE_INVALID") !== expectedNonce)
  ) {
    fail("HIRE_EXECUTION_NONCE_CHANGED_BEFORE_SIGN");
  }
  if (
    gasPrices.some((value) => quantity(value, "HIRE_EXECUTION_GAS_PRICE_INVALID") > 200_000_000n)
  ) {
    fail("HIRE_EXECUTION_GAS_PRICE_CHANGED_ABOVE_CAP");
  }
  const requiredBalance =
    BigInt(transaction.value) + BigInt(transaction.gasLimit) * BigInt(transaction.gasPrice);
  if (
    balances.some((value) => quantity(value, "HIRE_EXECUTION_BALANCE_INVALID") < requiredBalance)
  ) {
    fail("HIRE_EXECUTION_BALANCE_CHANGED_BELOW_REQUIRED");
  }
  const raw = await wallet.signTransaction(transaction);
  const parsed = Transaction.from(raw);
  const hash = parsed.hash;
  if (hash === null || hash !== keccak256(raw)) fail("HIRE_EXECUTION_SIGNED_HASH_INVALID");
  const journal = resolve(journalDir, `${transaction.nonce}-${label}-${hash.slice(2)}.json`);
  writeExclusive(journal, {
    approvalId: APPROVAL_ID,
    chainId: Number(CHAIN_ID),
    dataKeccak256: keccak256(transaction.data),
    from: SOURCE,
    gasLimit: transaction.gasLimit.toString(),
    gasPriceWei: transaction.gasPrice.toString(),
    label,
    nonce: transaction.nonce,
    status: "signed_before_broadcast",
    to: transaction.to ?? null,
    transactionHash: hash,
    valueWei: transaction.value.toString()
  });
  emit("signed", { label, nonce: String(transaction.nonce), transactionHash: hash });
  let broadcastHash;
  try {
    broadcastHash = await rpc(RPCS[0], "eth_sendRawTransaction", [raw]);
  } catch {
    const probes = await allRpc("eth_getTransactionByHash", [hash]);
    if (probes.every((probe) => probe === null)) fail("HIRE_EXECUTION_BROADCAST_OUTCOME_UNKNOWN");
    broadcastHash = hash;
  }
  if (exactHex(broadcastHash, 32, "HIRE_EXECUTION_BROADCAST_HASH_INVALID") !== hash.toLowerCase()) {
    fail("HIRE_EXECUTION_BROADCAST_HASH_MISMATCH");
  }
  const receipt = await waitForReceipt(hash);
  if (quantity(receipt.status, "HIRE_EXECUTION_RECEIPT_STATUS_INVALID") !== 1n) {
    fail("HIRE_EXECUTION_TRANSACTION_FAILED");
  }
  writeExclusive(`${journal}.confirmed`, {
    blockHash: receipt.blockHash,
    blockNumber: quantity(receipt.blockNumber, "HIRE_EXECUTION_RECEIPT_BLOCK_INVALID").toString(),
    label,
    status: "confirmed",
    transactionHash: hash
  });
  emit("confirmed", {
    blockNumber: quantity(receipt.blockNumber, "HIRE_EXECUTION_RECEIPT_BLOCK_INVALID").toString(),
    label,
    transactionHash: hash
  });
  return receipt;
}

async function ownerOf(agentId) {
  const calldata = `0x6352211e${BigInt(agentId).toString(16).padStart(64, "0")}`;
  const result = requireSame(
    await allRpc("eth_call", [{ to: REGISTRY, data: calldata }, "latest"]),
    "HIRE_EXECUTION_OWNER_PROVIDER_MISMATCH"
  );
  return getAddress(`0x${exactHex(result, 32, "HIRE_EXECUTION_OWNER_INVALID").slice(-40)}`);
}

async function execute(preparation, artifact, wallet) {
  const localAppData = process.env.LOCALAPPDATA;
  if (typeof localAppData !== "string") fail("HIRE_EXECUTION_LOCALAPPDATA_MISSING");
  const journalDir = resolve(localAppData, "ProofEra", "testnet-hire-journal", APPROVAL_ID);
  const contractInterface = new Interface(artifact.abi);
  for (const hire of preparation.hires) {
    const expectedOwner = getAddress(EXPECTED_AGENT_OWNERS[hire.agentId]);
    if ((await ownerOf(hire.agentId)) !== expectedOwner)
      fail("HIRE_EXECUTION_AGENT_OWNER_MISMATCH");
    const request = {
      from: SOURCE,
      to: preparation.contractAddress,
      data: hire.calldata,
      value: `0x${decimal(hire.paymentWei, "HIRE_EXECUTION_PAYMENT_INVALID").toString(16)}`
    };
    const estimates = await allRpc("eth_estimateGas", [request]);
    if (
      estimates.some(
        (estimate) =>
          quantity(estimate, "HIRE_EXECUTION_HIRE_ESTIMATE_INVALID") >
          decimal(hire.gasLimit, "HIRE_EXECUTION_HIRE_GAS_INVALID")
      )
    ) {
      fail("HIRE_EXECUTION_HIRE_GAS_EXCEEDS_CAP");
    }
    const receipt = await sendOne(
      wallet,
      journalDir,
      {
        chainId: Number(CHAIN_ID),
        nonce: Number(decimal(hire.nonce, "HIRE_EXECUTION_HIRE_NONCE_INVALID")),
        to: preparation.contractAddress,
        data: hire.calldata,
        value: decimal(hire.paymentWei, "HIRE_EXECUTION_PAYMENT_INVALID"),
        gasLimit: decimal(hire.gasLimit, "HIRE_EXECUTION_HIRE_GAS_INVALID"),
        gasPrice: SIGNING_GAS_PRICE_WEI,
        type: 0
      },
      `hire-${hire.slug}`
    );
    const events = receipt.logs
      .filter((log) => getAddress(log.address) === getAddress(preparation.contractAddress))
      .map((log) => {
        try {
          return contractInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((event) => event?.name === "AgentHired");
    if (
      events.length !== 1 ||
      events[0].args.engagementId.toLowerCase() !== hire.engagementId.toLowerCase() ||
      events[0].args.agentId.toString() !== hire.agentId ||
      getAddress(events[0].args.hirer) !== SOURCE ||
      getAddress(events[0].args.agentOwner) !== expectedOwner ||
      events[0].args.taskHash.toLowerCase() !== hire.taskHash.toLowerCase() ||
      events[0].args.expiresAt.toString() !== hire.expiresAt ||
      events[0].args.paymentWei.toString() !== hire.paymentWei
    ) {
      fail("HIRE_EXECUTION_EVENT_MISMATCH");
    }
  }
  const heads = await allRpc("eth_blockNumber", []);
  const minimumHead = heads
    .map((head) => quantity(head, "HIRE_EXECUTION_HEAD_BLOCK_INVALID"))
    .reduce((left, right) => (left < right ? left : right));
  emit("complete", {
    finalityPending: true,
    minimumObservedHead: minimumHead.toString(),
    requiredFinalityDepth: FINALITY_DEPTH.toString()
  });
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const preparationBytes = readFileSync(args.preparationPath);
  if (sha256(preparationBytes) !== args.preparationSha256) {
    fail("HIRE_EXECUTION_PREPARATION_DIGEST_MISMATCH");
  }
  const preparation = JSON.parse(preparationBytes.toString("utf8"));
  const artifactBytes = readFileSync(ARTIFACT_PATH);
  const artifact = JSON.parse(artifactBytes.toString("utf8"));
  validateRelease(args, preparationBytes, preparation);
  validatePreparation(preparation, artifactBytes);
  regenerate(preparation);
  await preflight(preparation, artifact);
  const wallet = await loadWallet();
  await execute(preparation, artifact, wallet);
}

try {
  await main();
} catch (error) {
  emit("stopped", {
    code:
      error instanceof Error && /^HIRE_EXECUTION_[A-Z0-9_]+$/u.test(error.message)
        ? error.message
        : "HIRE_EXECUTION_FAILED"
  });
  process.exitCode = 1;
}
