import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHAIN_ID,
  KEYSTORE,
  KEYSTORE_CONTROLLER,
  deriveAuthorityIds,
  exactHex,
  parseQuantity,
  validateGrantIntent,
  validateLifecycleSequence,
  validateOperationObservation,
  validateRelayCallsStatus
} from "./altana-lifecycle-evidence-lib.mjs";

const integrationRequire = createRequire(
  new URL("../packages/integrations/package.json", import.meta.url)
);
const { decodeFunctionResult, encodeFunctionData } = integrationRequire("viem");

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXECUTE_FLAG = "--capture-exact-altana-lifecycle";
const RELAY_URL = "https://testnet-relay.altana.network";
const FINALITY_DEPTH = 12n;
const MAXIMUM_GIT_BYTES = 4_000_000;
const MAXIMUM_BODY_BYTES = 4_000_000;
const TIMEOUT_MS = 30_000;
const PROVIDERS = Object.freeze([
  { name: "bnb-chain", url: "https://data-seed-prebsc-2-s2.binance.org:8545" },
  { name: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" }
]);

const KEYSTORE_ABI = Object.freeze([
  {
    type: "function",
    name: "isValidKey",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "keyId", type: "bytes32" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "getPublicKey",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "keyId", type: "bytes32" }
    ],
    outputs: [{ type: "bytes" }]
  }
]);

const ACCOUNT_ABI = Object.freeze([
  {
    type: "function",
    name: "getKeys",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "keys",
        type: "tuple[]",
        components: [
          { name: "expiry", type: "uint40" },
          { name: "keyType", type: "uint8" },
          { name: "isSuperAdmin", type: "bool" },
          { name: "publicKey", type: "bytes" }
        ]
      },
      { name: "keyHashes", type: "bytes32[]" }
    ]
  }
]);

function fail(code) {
  throw new Error(code);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseArguments(argv) {
  const expected = [
    EXECUTE_FLAG,
    "--source-base-commit",
    null,
    "--preparation",
    null,
    "--grant-intent",
    null,
    "--grant-tx",
    null,
    "--execute-calls-id",
    null,
    "--execute-tx",
    null,
    "--revoke-calls-id",
    null,
    "--revoke-tx",
    null
  ];
  if (argv.length !== expected.length) fail("ALTANA_LIFECYCLE_ARGUMENTS_INVALID");
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== null && argv[index] !== expected[index]) {
      fail("ALTANA_LIFECYCLE_ARGUMENTS_INVALID");
    }
  }
  const sourceBaseCommit = argv[2];
  if (!/^[0-9a-f]{40}$/u.test(sourceBaseCommit)) {
    fail("ALTANA_LIFECYCLE_SOURCE_BASE_COMMIT_INVALID");
  }
  const callsId = (value) => {
    if (!/^0x(?:[0-9a-fA-F]{2}){1,256}$/u.test(value)) {
      fail("ALTANA_LIFECYCLE_CALLS_ID_INVALID");
    }
    return value.toLowerCase();
  };
  return Object.freeze({
    executeCallsId: callsId(argv[10]),
    executeTransactionHash: exactHex(argv[12], 32, "ALTANA_LIFECYCLE_TRANSACTION_HASH_INVALID"),
    grantIntentPath: validatePath(
      argv[6],
      "evidence/altana/intents/",
      "ALTANA_LIFECYCLE_INTENT_PATH_INVALID"
    ),
    grantTransactionHash: exactHex(argv[8], 32, "ALTANA_LIFECYCLE_TRANSACTION_HASH_INVALID"),
    preparationPath: validatePath(
      argv[4],
      "evidence/altana/preparations/",
      "ALTANA_LIFECYCLE_PREPARATION_PATH_INVALID"
    ),
    revokeCallsId: callsId(argv[14]),
    revokeTransactionHash: exactHex(argv[16], 32, "ALTANA_LIFECYCLE_TRANSACTION_HASH_INVALID"),
    sourceBaseCommit
  });
}

function validatePath(value, prefix, code) {
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    !value.endsWith(".json") ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    isAbsolute(value) ||
    !/^[A-Za-z0-9._/-]+$/u.test(value)
  ) {
    fail(code);
  }
  return value;
}

function gitText(args) {
  return execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_BYTES,
    windowsHide: true
  }).trim();
}

function gitBytes(args) {
  return execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_BYTES,
    windowsHide: true
  });
}

function verifyRelease(sourceBaseCommit) {
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("ALTANA_LIFECYCLE_REPOSITORY_DIRTY");
  }
  const head = gitText(["rev-parse", "HEAD"]);
  if (head !== sourceBaseCommit) fail("ALTANA_LIFECYCLE_SOURCE_COMMIT_MISMATCH");
  if (gitText(["rev-parse", "origin/main"]) !== head) {
    fail("ALTANA_LIFECYCLE_SOURCE_NOT_PUBLISHED");
  }
}

async function assertCanonicalPath(repositoryPath) {
  const repositoryRealPath = await realpath(REPOSITORY_ROOT);
  const absolutePath = resolve(REPOSITORY_ROOT, ...repositoryPath.split("/"));
  const candidateRealPath = await realpath(absolutePath);
  const local = relative(repositoryRealPath, candidateRealPath);
  if (
    local === "" ||
    local === ".." ||
    local.startsWith(`..${sep}`) ||
    isAbsolute(local) ||
    resolve(absolutePath).toLowerCase() !== resolve(candidateRealPath).toLowerCase()
  ) {
    fail("ALTANA_LIFECYCLE_INPUT_PATH_UNTRUSTED");
  }
  let cursor = repositoryRealPath;
  for (const segment of local.split(sep)) {
    cursor = resolve(cursor, segment);
    if ((await lstat(cursor)).isSymbolicLink()) {
      fail("ALTANA_LIFECYCLE_INPUT_PATH_UNTRUSTED");
    }
  }
  return absolutePath;
}

async function committedJson(repositoryPath) {
  const absolutePath = await assertCanonicalPath(repositoryPath);
  gitText(["ls-files", "--error-unmatch", "--", repositoryPath]);
  const bytes = await readFile(absolutePath);
  if (!bytes.equals(gitBytes(["show", `HEAD:${repositoryPath}`]))) {
    fail("ALTANA_LIFECYCLE_INPUT_NOT_COMMITTED");
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("ALTANA_LIFECYCLE_INPUT_JSON_INVALID");
  }
  return Object.freeze({ bytes, path: repositoryPath, sha256: sha256(bytes), value });
}

function validatePreparation(preparation) {
  if (
    preparation?.schemaVersion !== "proofera-altana-bsc-testnet-readiness-v1.0.0" ||
    preparation?.sdk?.version !== "0.7.0" ||
    preparation?.sdk?.chainId !== CHAIN_ID ||
    preparation?.sdk?.keyStore?.toLowerCase() !== KEYSTORE ||
    preparation?.sdk?.keyStoreController?.toLowerCase() !== KEYSTORE_CONTROLLER ||
    preparation?.sdk?.relayUrl !== RELAY_URL ||
    preparation?.classification?.receiptEvidence !== false
  ) {
    fail("ALTANA_LIFECYCLE_PREPARATION_INVALID");
  }
}

const transcript = [];

async function jsonRpc(origin, label, method, params) {
  const id = `altana-lifecycle-${transcript.length + 1}`;
  const request = { id, jsonrpc: "2.0", method, params };
  const response = await fetch(origin, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(request),
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (response.status !== 200) fail("ALTANA_LIFECYCLE_HTTP_INVALID");
  const responseBody = await response.text();
  if (Buffer.byteLength(responseBody) > MAXIMUM_BODY_BYTES) {
    fail("ALTANA_LIFECYCLE_RESPONSE_TOO_LARGE");
  }
  let parsed;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    fail("ALTANA_LIFECYCLE_RESPONSE_JSON_INVALID");
  }
  if (parsed?.jsonrpc !== "2.0" || parsed?.id !== id || parsed?.error !== undefined) {
    fail("ALTANA_LIFECYCLE_RPC_ENVELOPE_INVALID");
  }
  transcript.push({ label, origin, request, response: parsed });
  return parsed.result;
}

async function rpc(provider, method, params) {
  return jsonRpc(provider.url, `rpc:${provider.name}`, method, params);
}

function same(left, right, code) {
  if (canonical(left) !== canonical(right)) fail(code);
}

async function operation(provider, hash) {
  const [transaction, receipt] = await Promise.all([
    rpc(provider, "eth_getTransactionByHash", [hash]),
    rpc(provider, "eth_getTransactionReceipt", [hash])
  ]);
  if (transaction === null || receipt === null) fail("ALTANA_LIFECYCLE_RECEIPT_MISSING");
  return { receipt, transaction };
}

async function blockAt(provider, blockHash) {
  const block = await rpc(provider, "eth_getBlockByHash", [blockHash, false]);
  if (
    block === null ||
    exactHex(block.hash, 32, "ALTANA_LIFECYCLE_BLOCK_HASH_INVALID") !== blockHash
  ) {
    fail("ALTANA_LIFECYCLE_BLOCK_INVALID");
  }
  return Object.freeze({
    blockHash,
    blockNumber: parseQuantity(block.number, "ALTANA_LIFECYCLE_BLOCK_NUMBER_INVALID"),
    blockTimestamp: parseQuantity(block.timestamp, "ALTANA_LIFECYCLE_BLOCK_TIMESTAMP_INVALID")
  });
}

async function callAt(provider, to, data, blockHash) {
  return rpc(provider, "eth_call", [
    { data, to },
    { blockHash, requireCanonical: true }
  ]);
}

function decode(abi, functionName, data, code) {
  try {
    return decodeFunctionResult({ abi, data, functionName });
  } catch {
    fail(code);
  }
}

async function authoritySnapshot(provider, intent, ids, blockHash, present) {
  const validData = encodeFunctionData({
    abi: KEYSTORE_ABI,
    functionName: "isValidKey",
    args: [intent.walletAddress, ids.keyStoreKeyId]
  });
  const keysData = encodeFunctionData({ abi: ACCOUNT_ABI, functionName: "getKeys" });
  const requests = [
    callAt(provider, KEYSTORE, validData, blockHash),
    callAt(provider, intent.walletAddress, keysData, blockHash)
  ];
  if (present) {
    const publicKeyData = encodeFunctionData({
      abi: KEYSTORE_ABI,
      functionName: "getPublicKey",
      args: [intent.walletAddress, ids.keyStoreKeyId]
    });
    requests.push(callAt(provider, KEYSTORE, publicKeyData, blockHash));
  }
  const [validRaw, keysRaw, publicKeyRaw] = await Promise.all(requests);
  const valid = decode(
    KEYSTORE_ABI,
    "isValidKey",
    validRaw,
    "ALTANA_LIFECYCLE_KEYSTORE_VALID_DECODE_INVALID"
  );
  const accountKeys = decode(
    ACCOUNT_ABI,
    "getKeys",
    keysRaw,
    "ALTANA_LIFECYCLE_ACCOUNT_KEYS_DECODE_INVALID"
  );
  if (!Array.isArray(accountKeys) || accountKeys.length !== 2 || !Array.isArray(accountKeys[1])) {
    fail("ALTANA_LIFECYCLE_ACCOUNT_KEYS_DECODE_INVALID");
  }
  const publicKey = present
    ? decode(
        KEYSTORE_ABI,
        "getPublicKey",
        publicKeyRaw,
        "ALTANA_LIFECYCLE_KEYSTORE_PUBLIC_KEY_DECODE_INVALID"
      )
    : null;
  return Object.freeze({
    accountKeyHashes: accountKeys[1].map((value) => value.toLowerCase()),
    keyStorePublicKey: typeof publicKey === "string" ? publicKey.toLowerCase() : null,
    keyStorePublicKeyRead: present,
    keyStoreValid: valid
  });
}

async function phaseSnapshot(phase, operationValue, intent, ids, present) {
  const blocks = await Promise.all(
    PROVIDERS.map((provider) => blockAt(provider, operationValue.blockHash))
  );
  same(blocks[0], blocks[1], "ALTANA_LIFECYCLE_PROVIDER_BLOCK_MISMATCH");
  if (blocks[0].blockNumber !== operationValue.blockNumber) {
    fail("ALTANA_LIFECYCLE_OPERATION_BLOCK_MISMATCH");
  }
  const observations = await Promise.all(
    PROVIDERS.map((provider) =>
      authoritySnapshot(provider, intent, ids, operationValue.blockHash, present)
    )
  );
  return Object.freeze({
    blockHash: operationValue.blockHash,
    blockNumber: operationValue.blockNumber.toString(),
    blockTimestamp: blocks[0].blockTimestamp.toString(),
    phase,
    providers: PROVIDERS.map((provider, index) => ({
      observation: observations[index],
      provider: provider.name
    }))
  });
}

async function finalSnapshot(intent, ids, revokeBlockNumber) {
  const heads = await Promise.all(
    PROVIDERS.map(async (provider) =>
      parseQuantity(await rpc(provider, "eth_blockNumber", []), "ALTANA_LIFECYCLE_HEAD_INVALID")
    )
  );
  const minimumHead = heads.reduce((left, right) => (left < right ? left : right));
  if (minimumHead < revokeBlockNumber + FINALITY_DEPTH) {
    fail("ALTANA_LIFECYCLE_NOT_FINALIZED");
  }
  const finalizedNumber = minimumHead - FINALITY_DEPTH;
  const blockTag = `0x${finalizedNumber.toString(16)}`;
  const blocks = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const block = await rpc(provider, "eth_getBlockByNumber", [blockTag, false]);
      if (block === null) fail("ALTANA_LIFECYCLE_FINAL_BLOCK_INVALID");
      return {
        blockHash: exactHex(block.hash, 32, "ALTANA_LIFECYCLE_FINAL_BLOCK_HASH_INVALID"),
        blockNumber: parseQuantity(block.number, "ALTANA_LIFECYCLE_FINAL_BLOCK_NUMBER_INVALID"),
        blockTimestamp: parseQuantity(
          block.timestamp,
          "ALTANA_LIFECYCLE_FINAL_BLOCK_TIMESTAMP_INVALID"
        )
      };
    })
  );
  same(blocks[0], blocks[1], "ALTANA_LIFECYCLE_PROVIDER_FINAL_BLOCK_MISMATCH");
  const observations = await Promise.all(
    PROVIDERS.map((provider) =>
      authoritySnapshot(provider, intent, ids, blocks[0].blockHash, false)
    )
  );
  return Object.freeze({
    blockHash: blocks[0].blockHash,
    blockNumber: blocks[0].blockNumber.toString(),
    blockTimestamp: blocks[0].blockTimestamp.toString(),
    providers: PROVIDERS.map((provider, index) => ({
      observation: observations[index],
      provider: provider.name
    }))
  });
}

async function capture(args) {
  verifyRelease(args.sourceBaseCommit);
  const [preparationSource, intentSource] = await Promise.all([
    committedJson(args.preparationPath),
    committedJson(args.grantIntentPath)
  ]);
  validatePreparation(preparationSource.value);
  const intent = validateGrantIntent(intentSource.value);
  const ids = deriveAuthorityIds(intent);

  const chainIds = await Promise.all(
    PROVIDERS.map(async (provider) =>
      parseQuantity(await rpc(provider, "eth_chainId", []), "ALTANA_LIFECYCLE_CHAIN_ID_INVALID")
    )
  );
  if (chainIds.some((chainId) => chainId !== BigInt(CHAIN_ID))) {
    fail("ALTANA_LIFECYCLE_WRONG_CHAIN");
  }

  const hashes = [
    args.grantTransactionHash,
    args.executeTransactionHash,
    args.revokeTransactionHash
  ];
  if (new Set(hashes).size !== hashes.length) fail("ALTANA_LIFECYCLE_HASH_DUPLICATE");
  const rawOperations = [];
  for (const hash of hashes) {
    rawOperations.push(await Promise.all(PROVIDERS.map((provider) => operation(provider, hash))));
  }
  const operations = rawOperations.map((providerValues, index) => {
    const validated = providerValues.map((value) =>
      validateOperationObservation(value, { hash: hashes[index] })
    );
    same(validated[0], validated[1], "ALTANA_LIFECYCLE_PROVIDER_OPERATION_MISMATCH");
    return validated[0];
  });
  const [grant, execute, revoke] = operations;

  const [executeRelayRaw, revokeRelayRaw] = await Promise.all([
    jsonRpc(RELAY_URL, "altana-testnet-relay", "wallet_getCallsStatus", [args.executeCallsId]),
    jsonRpc(RELAY_URL, "altana-testnet-relay", "wallet_getCallsStatus", [args.revokeCallsId])
  ]);
  const executeRelay = validateRelayCallsStatus(executeRelayRaw, {
    callsId: args.executeCallsId,
    ...execute
  });
  const revokeRelay = validateRelayCallsStatus(revokeRelayRaw, {
    callsId: args.revokeCallsId,
    ...revoke
  });

  const phaseSnapshots = await Promise.all([
    phaseSnapshot("grant", grant, intent, ids, true),
    phaseSnapshot("execute", execute, intent, ids, true),
    phaseSnapshot("revoke", revoke, intent, ids, false)
  ]);
  const final = await finalSnapshot(intent, ids, revoke.blockNumber);
  const lifecycle = validateLifecycleSequence({
    execute,
    finalSnapshot: final,
    grant,
    intent,
    phaseSnapshots,
    revoke
  });

  return Object.freeze({
    schemaVersion: "proofera-altana-lifecycle-evidence-v1.0.0",
    classification: {
      artifact: "two_provider_read_side_altana_authority_lifecycle",
      applicationCallSemanticsVerified: false,
      applicationEffectVerified: false,
      authorityAbsentAfterRevoke: lifecycle.authorityAbsentAfterRevoke,
      authorityPresentForExecution: lifecycle.authorityPresentForExecution,
      executeReceiptVerified: true,
      executeRelayReceiptJoined: true,
      grantReceiptVerified: true,
      privateSignerRead: false,
      revokeReceiptVerified: true,
      revokeRelayReceiptJoined: true,
      sessionSignatureDirectlyDecoded: false
    },
    sourceBaseCommit: args.sourceBaseCommit,
    sources: {
      grantIntent: {
        path: intentSource.path,
        sha256: intentSource.sha256
      },
      preparation: {
        path: preparationSource.path,
        sha256: preparationSource.sha256
      }
    },
    network: {
      chainId: CHAIN_ID,
      finalityDepth: FINALITY_DEPTH.toString(),
      keyStore: KEYSTORE,
      keyStoreController: KEYSTORE_CONTROLLER,
      providers: PROVIDERS,
      relayUrl: RELAY_URL
    },
    intent,
    derivedAuthorityIds: ids,
    operations: {
      execute: { ...execute, callsId: executeRelay.callsId },
      grant,
      revoke: { ...revoke, callsId: revokeRelay.callsId }
    },
    authorityTimeline: {
      finalized: final,
      phases: phaseSnapshots
    },
    limitations: [
      "Successful receipts, relay calls-ID joins and exact authority state prove the observed lifecycle but do not directly decode which key signed the execute intent.",
      "This artifact does not decode the relayed application call or prove a PancakeSwap state effect; a separately joined application-specific receipt and before/after artifact remain required.",
      "A public grant intent contains no session private key and this collector never reads a signer, wallet secret or browser credential."
    ],
    transcript
  });
}

async function writeCapture(manifest) {
  const blockNumber = manifest.authorityTimeline.finalized.blockNumber;
  const directory = resolve(REPOSITORY_ROOT, "evidence/altana/lifecycles");
  await mkdir(directory, { recursive: true });
  const revokeHashPrefix = manifest.operations.revoke.transactionHash.slice(2, 10);
  const output = resolve(directory, `${blockNumber}-${revokeHashPrefix}-altana-lifecycle.json`);
  const bytes = `${JSON.stringify(
    manifest,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  )}\n`;
  await writeFile(output, bytes, { encoding: "utf8", flag: "wx" });
  return { output, sha256: sha256(bytes) };
}

try {
  const args = parseArguments(process.argv.slice(2));
  const result = await writeCapture(await capture(args));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const message =
    error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : "ALTANA_LIFECYCLE_CAPTURE_FAILED";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
