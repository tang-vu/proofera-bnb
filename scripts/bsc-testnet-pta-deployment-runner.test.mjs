import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { buildDeploymentPreparation } from "../contracts/testnet-fixed-asset/scripts/deployment-preparation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = resolve(ROOT, "scripts", "run-bsc-testnet-pta-deployment.ts");
const LOADER = resolve(ROOT, "scripts", "typescript-extension-loader.mjs");
const NODE_ARGUMENTS = [
  "--no-warnings",
  "--conditions=react-server",
  "--experimental-loader",
  pathToFileURL(LOADER).href,
  ENTRY
];
const DEPLOYER = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";
const DATA_SHA256 = "45f05cb4c02100cccf74c7b2e7c31d04386642309ca2b9a9614684d0341cd239";

function run(arguments_, input = "") {
  return spawnSync(process.execPath, [...NODE_ARGUMENTS, ...arguments_], {
    cwd: ROOT,
    encoding: "utf8",
    env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" },
    input,
    maxBuffer: 32_768,
    shell: false,
    timeout: 15_000,
    windowsHide: true
  });
}

test("deployment runner refuses invocation without the exact chain-97 execution flag", () => {
  const result = run([]);
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "blocked",
    code: "ARGUMENTS_INVALID"
  });
  assert.equal(result.stderr, "");
});

test("runner consumes the exact offline producer field and digest", async () => {
  const preparation = await buildDeploymentPreparation({ chainId: 97, recipient: DEPLOYER });
  assert.equal(preparation.status, "offline_unsigned_preparation_only");
  assert.equal(preparation.network.chainId, 97);
  assert.equal(preparation.contract.deploymentRecipient, DEPLOYER.toLowerCase());
  assert.equal(preparation.unsignedDeploymentData.length, 2 + 2_947 * 2);
  assert.equal(preparation.digests.unsignedDeploymentDataSha256, DATA_SHA256);

  const source = readFileSync(ENTRY, "utf8");
  assert.ok(source.includes("const data = preparation.unsignedDeploymentData"));
  assert.equal(source.includes("preparation.transaction"), false);
});

test("isolated worker rejects empty stdin without touching custody or printing detail", () => {
  const result = run(["--worker"]);
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "blocked",
    code: "WORKER_INPUT_INVALID"
  });
  assert.equal(result.stderr, "");
});

test("isolated worker rejects caller-selected custody and journal paths", () => {
  const result = run(
    ["--worker"],
    JSON.stringify({
      authorizationToken: `0x${"11".repeat(32)}`,
      request: {},
      custodyDirectoryAbsolute: "C:\\alternate\\wallets\\bsc-testnet",
      journalDirectoryAbsolute: "C:\\alternate\\deployments\\bsc-testnet-pta"
    })
  );
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "blocked",
    code: "WORKER_INPUT_INVALID"
  });
  assert.equal(result.stderr, "");
});

test("runner source keeps exact one-shot, child isolation, journal-before-broadcast boundaries", () => {
  const source = readFileSync(ENTRY, "utf8");
  for (const required of [
    'const EXACT_EXECUTION_FLAG = "--execute-exact-pta-chain-97"',
    "createBscTestnetPtaOneShotSignerCore",
    "createWindowsBscTestnetPtaLocalJournal",
    "invokeWorker",
    "const WORKER_TIMEOUT_MS = 120_000",
    "validateSignedTransaction",
    'rpc(PRIMARY_RPC, "eth_sendRawTransaction", [raw])',
    "waitForReceipt",
    "waitForFinality"
  ]) {
    assert.ok(source.includes(required), `missing reviewed boundary: ${required}`);
  }
  for (const forbidden of [
    "process.env",
    "PRIVATE_KEY",
    "MNEMONIC",
    "console.log",
    "console.error",
    "walletClient",
    "sendTransaction(",
    "signMessage(",
    "signTypedData("
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden runtime surface: ${forbidden}`);
  }
});

test("worker entry requires durable authorization consumption before custody composition", () => {
  const source = readFileSync(ENTRY, "utf8");
  assert.ok(
    source.includes('Object.keys(parsed).sort().join(",") !== "authorizationToken,request"')
  );
  assert.ok(source.includes("const directories = await resolveExecutionDirectories()"));
  const consume = source.indexOf("await journal.consumeWorkerAuthorization(");
  const custody = source.indexOf("createWindowsBscTestnetPtaSigningWorker(");
  assert.ok(consume >= 0 && custody > consume);
  assert.ok(
    source.includes("journal.prepareWorkerAuthorization(request, keccak256(authorizationToken))")
  );
  assert.ok(source.includes("worker-started.v1.json") === false);
  const childCommit = source.indexOf("await journal.commitSignedTransaction(");
  const childOutput = source.indexOf("process.stdout.write(JSON.stringify(response))");
  assert.ok(childCommit > custody && childOutput > childCommit);
});

test("recovery reads journal before fresh RPC and reconciles the deterministic hash", () => {
  const source = readFileSync(ENTRY, "utf8");
  const readState = source.indexOf("const initial = await journal.readState()");
  const fresh = source.indexOf("const fresh = await freshSigningPayload(deploymentData)");
  assert.ok(readState >= 0 && fresh > readState);
  assert.ok(source.includes("validateRetainedSignedTransaction(raw, transactionHash)"));
  assert.ok(source.includes("broadcastOrReconcile(raw, transactionHash)"));
  assert.ok(source.includes("MINT_EVENT_INVALID"));
  assert.ok(source.includes('initial.status === "exact_recovery_available"'));
});
