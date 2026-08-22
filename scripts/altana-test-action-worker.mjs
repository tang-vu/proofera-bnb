import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CHAIN_ID = 97;
const WORKER_SCHEMA_VERSION = 1;
const WORKER_DIRECTORY_NAME = "altana-test-action-v1";
const CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "deploy",
  "windows",
  "altana-test-action.v1.json"
);
const POLL_INTERVAL_MS = 5_000;
const RPC_TIMEOUT_MS = 20_000;
const MAX_PUBLIC_FILE_BYTES = 32_768;
const UINT40_MAX = 2 ** 40 - 1;
const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const KEYSTORE = "0x6b8361C29d05D498b1a12B54A37310f94171E94A";
const RELAY_URL = "https://testnet-relay.altana.network";
const PROVIDERS = Object.freeze([
  Object.freeze({ name: "bnb-chain", url: "https://data-seed-prebsc-2-s2.binance.org:8545" }),
  Object.freeze({ name: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" })
]);
const SECRET_FILE = "session-key.dpapi";
const DESCRIPTOR_FILE = "session-key.public.json";
const CLAIM_FILE = "execute-claim.json";
const SUBMISSION_FILE = "execute-submission.json";
const RECEIPT_FILE = "execute-receipt.json";
const PUBLIC_STATE_FILE = "public-state.json";

const integrationRequire = createRequire(
  new URL("../packages/integrations/package.json", import.meta.url)
);
const {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  padHex
} = integrationRequire("viem");
const { publicKeyToAddress } = integrationRequire("viem/accounts");
const sdkEntryUrl = new URL(
  "../packages/integrations/node_modules/@altananetwork/sdk/dist/index.js",
  import.meta.url
);

const KEYSTORE_ABI = Object.freeze([
  Object.freeze({
    type: "function",
    name: "isValidKey",
    stateMutability: "view",
    inputs: Object.freeze([
      Object.freeze({ name: "user", type: "address" }),
      Object.freeze({ name: "keyId", type: "bytes32" })
    ]),
    outputs: Object.freeze([Object.freeze({ type: "bool" })])
  })
]);
const ACCOUNT_ABI = Object.freeze([
  Object.freeze({
    type: "function",
    name: "getKeys",
    stateMutability: "view",
    inputs: Object.freeze([]),
    outputs: Object.freeze([
      Object.freeze({
        name: "keys",
        type: "tuple[]",
        components: Object.freeze([
          Object.freeze({ name: "expiry", type: "uint40" }),
          Object.freeze({ name: "keyType", type: "uint8" }),
          Object.freeze({ name: "isSuperAdmin", type: "bool" }),
          Object.freeze({ name: "publicKey", type: "bytes" })
        ])
      }),
      Object.freeze({ name: "keyHashes", type: "bytes32[]" })
    ])
  })
]);
const PTA_ABI = Object.freeze([
  Object.freeze({
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: Object.freeze([
      Object.freeze({ name: "spender", type: "address" }),
      Object.freeze({ name: "amount", type: "uint256" })
    ]),
    outputs: Object.freeze([Object.freeze({ type: "bool" })])
  })
]);

const DPAPI_PROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$raw = [Console]::In.ReadToEnd().Trim()
$clear = [Convert]::FromBase64String($raw)
$entropy = [Text.Encoding]::UTF8.GetBytes('ProofEra Altana test action signer v1')
try {
  $protected = [System.Security.Cryptography.ProtectedData]::Protect(
    $clear,
    $entropy,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  [Console]::Out.Write([Convert]::ToBase64String($protected))
} finally {
  if ($null -ne $clear) { [Array]::Clear($clear, 0, $clear.Length) }
  if ($null -ne $entropy) { [Array]::Clear($entropy, 0, $entropy.Length) }
}`;

const DPAPI_UNPROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$raw = [Console]::In.ReadToEnd().Trim()
$protected = [Convert]::FromBase64String($raw)
$entropy = [Text.Encoding]::UTF8.GetBytes('ProofEra Altana test action signer v1')
try {
  $clear = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protected,
    $entropy,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  [Console]::Out.Write([Convert]::ToBase64String($clear))
} finally {
  if ($null -ne $clear) { [Array]::Clear($clear, 0, $clear.Length) }
  if ($null -ne $protected) { [Array]::Clear($protected, 0, $protected.Length) }
  if ($null -ne $entropy) { [Array]::Clear($entropy, 0, $entropy.Length) }
}`;

const PROTECT_DIRECTORY_ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd().Trim()
$path = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($raw))
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($identity)
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule(
  $identity,
  [Security.AccessControl.FileSystemRights]::FullControl,
  [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
  [Security.AccessControl.PropagationFlags]::None,
  [Security.AccessControl.AccessControlType]::Allow
)
[void]$acl.AddAccessRule($rule)
[IO.Directory]::SetAccessControl($path, $acl)
[Console]::Out.Write('ok')`;

function fail(code) {
  throw new Error(code);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, keys, code) {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code);
  }
  return value;
}

function exactAddress(value, code) {
  if (typeof value !== "string" || !isAddress(value) || /^0x0{40}$/iu.test(value)) fail(code);
  return getAddress(value);
}

function exactHex(value, bytes, code) {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`, "u").test(value)) {
    fail(code);
  }
  return value.toLowerCase();
}

function decimal(value, { allowZero = false } = {}) {
  if (
    typeof value !== "string" ||
    !(allowZero ? /^(?:0|[1-9][0-9]*)$/u : /^[1-9][0-9]*$/u).test(value)
  ) {
    fail("ALTANA_TEST_ACTION_DECIMAL_INVALID");
  }
  return BigInt(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function configHash(config) {
  return `0x${createHash("sha256").update(canonical(config)).digest("hex")}`;
}

export function validateAltanaTestActionConfig(input) {
  const config = exactKeys(
    input,
    [
      "action",
      "chainId",
      "minimumNativeBalanceWei",
      "permissions",
      "schemaVersion",
      "sessionKey",
      "sessionLifetimeSeconds",
      "walletAddress"
    ],
    "ALTANA_TEST_ACTION_CONFIG_INVALID"
  );
  if (config.schemaVersion !== 1 || config.chainId !== CHAIN_ID) {
    fail("ALTANA_TEST_ACTION_CONFIG_INVALID");
  }
  const walletAddress = exactAddress(config.walletAddress, "ALTANA_TEST_ACTION_WALLET_INVALID");
  const sessionKey = exactKeys(
    config.sessionKey,
    ["address", "custody", "curve", "publicKey", "schemaVersion"],
    "ALTANA_TEST_ACTION_SESSION_KEY_INVALID"
  );
  if (
    sessionKey.schemaVersion !== 1 ||
    sessionKey.custody !== "worker-dpapi-current-user" ||
    sessionKey.curve !== "secp256k1"
  ) {
    fail("ALTANA_TEST_ACTION_SESSION_KEY_INVALID");
  }
  const publicKey = exactHex(sessionKey.publicKey, 65, "ALTANA_TEST_ACTION_SESSION_KEY_INVALID");
  if (!publicKey.startsWith("0x04")) fail("ALTANA_TEST_ACTION_SESSION_KEY_INVALID");
  const sessionAddress = exactAddress(sessionKey.address, "ALTANA_TEST_ACTION_SESSION_KEY_INVALID");
  if (publicKeyToAddress(publicKey) !== sessionAddress) {
    fail("ALTANA_TEST_ACTION_SESSION_KEY_MISMATCH");
  }

  const action = exactKeys(
    config.action,
    ["amount", "functionSignature", "spender", "target", "valueWei"],
    "ALTANA_TEST_ACTION_CALL_INVALID"
  );
  const target = exactAddress(action.target, "ALTANA_TEST_ACTION_CALL_INVALID");
  const spender = exactAddress(action.spender, "ALTANA_TEST_ACTION_CALL_INVALID");
  if (
    target !== "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc" ||
    spender !== sessionAddress ||
    action.functionSignature !== "approve(address,uint256)" ||
    action.amount !== "0" ||
    action.valueWei !== "0"
  ) {
    fail("ALTANA_TEST_ACTION_CALL_INVALID");
  }

  const permissions = exactKeys(
    config.permissions,
    ["calls", "spend"],
    "ALTANA_TEST_ACTION_PERMISSIONS_INVALID"
  );
  if (!Array.isArray(permissions.calls) || permissions.calls.length !== 1) {
    fail("ALTANA_TEST_ACTION_PERMISSIONS_INVALID");
  }
  const callPermission = exactKeys(
    permissions.calls[0],
    ["signature", "to"],
    "ALTANA_TEST_ACTION_PERMISSIONS_INVALID"
  );
  if (
    exactAddress(callPermission.to, "ALTANA_TEST_ACTION_PERMISSIONS_INVALID") !== target ||
    callPermission.signature !== action.functionSignature
  ) {
    fail("ALTANA_TEST_ACTION_PERMISSIONS_INVALID");
  }
  if (!Array.isArray(permissions.spend) || permissions.spend.length !== 1) {
    fail("ALTANA_TEST_ACTION_PERMISSIONS_INVALID");
  }
  const spend = exactKeys(
    permissions.spend[0],
    ["limit", "period", "token"],
    "ALTANA_TEST_ACTION_PERMISSIONS_INVALID"
  );
  if (spend.token !== null || spend.period !== "day" || decimal(spend.limit) !== 1n) {
    fail("ALTANA_TEST_ACTION_PERMISSIONS_INVALID");
  }
  if (
    !Number.isInteger(config.sessionLifetimeSeconds) ||
    config.sessionLifetimeSeconds !== 3_600 ||
    decimal(config.minimumNativeBalanceWei) !== 5_000_000_000_000_000n
  ) {
    fail("ALTANA_TEST_ACTION_CONFIG_INVALID");
  }
  return Object.freeze({
    ...config,
    walletAddress,
    sessionKey: Object.freeze({ ...sessionKey, address: sessionAddress, publicKey }),
    action: Object.freeze({ ...action, spender, target }),
    permissions: Object.freeze({
      calls: Object.freeze([Object.freeze({ signature: callPermission.signature, to: target })]),
      spend: Object.freeze([Object.freeze({ limit: spend.limit, period: "day", token: null })])
    })
  });
}

function workerDirectory(environment = process.env) {
  const localAppData = environment.LOCALAPPDATA;
  if (typeof localAppData !== "string" || localAppData.trim().length === 0) {
    fail("ALTANA_TEST_ACTION_LOCALAPPDATA_REQUIRED");
  }
  const base = resolve(localAppData);
  const directory = resolve(base, "ProofEra", WORKER_DIRECTORY_NAME);
  const relative = directory.slice(base.length);
  if (!relative.startsWith("\\") || relative.includes("..")) {
    fail("ALTANA_TEST_ACTION_WORKER_PATH_INVALID");
  }
  return directory;
}

function workerPaths(environment = process.env) {
  const directory = workerDirectory(environment);
  return Object.freeze({
    directory,
    secret: resolve(directory, SECRET_FILE),
    descriptor: resolve(directory, DESCRIPTOR_FILE),
    claim: resolve(directory, CLAIM_FILE),
    submission: resolve(directory, SUBMISSION_FILE),
    receipt: resolve(directory, RECEIPT_FILE),
    publicState: resolve(directory, PUBLIC_STATE_FILE)
  });
}

async function runPowerShell(script, input, operation) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      POWERSHELL,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
    );
    const output = [];
    let outputBytes = 0;
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes <= MAX_PUBLIC_FILE_BYTES) output.push(chunk);
    });
    child.stderr.resume();
    child.once("error", () =>
      reject(new Error(`ALTANA_TEST_ACTION_POWERSHELL_${operation}_SPAWN_FAILED`))
    );
    child.once("close", (code) => {
      if (code !== 0 || outputBytes > MAX_PUBLIC_FILE_BYTES) {
        reject(
          new Error(
            code !== 0
              ? `ALTANA_TEST_ACTION_POWERSHELL_${operation}_EXIT_${String(code)}`
              : `ALTANA_TEST_ACTION_POWERSHELL_${operation}_OUTPUT_TOO_LARGE`
          )
        );
        return;
      }
      resolvePromise(Buffer.concat(output).toString("utf8").trim());
    });
    child.stdin.end(input);
  });
}

async function exactJsonFile(path, { optional = false } = {}) {
  try {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size < 2 ||
      stat.size > MAX_PUBLIC_FILE_BYTES
    ) {
      fail("ALTANA_TEST_ACTION_FILE_INVALID");
    }
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeCreateOnlyJson(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
}

async function writePublicState(paths, config, state) {
  const publicState = Object.freeze({
    schemaVersion: WORKER_SCHEMA_VERSION,
    chainId: CHAIN_ID,
    configHash: configHash(config),
    walletAddress: config.walletAddress,
    sessionKeyAddress: config.sessionKey.address,
    ...state,
    observedAt: new Date().toISOString()
  });
  await writeFile(paths.publicState, `${JSON.stringify(publicState)}\n`, {
    encoding: "utf8",
    flag: "w"
  });
}

async function provision() {
  if (process.platform !== "win32") fail("ALTANA_TEST_ACTION_WINDOWS_REQUIRED");
  const paths = workerPaths();
  await mkdir(paths.directory, { recursive: true });
  const aclResult = await runPowerShell(
    PROTECT_DIRECTORY_ACL_SCRIPT,
    Buffer.from(paths.directory, "utf8").toString("base64"),
    "ACL"
  );
  if (aclResult !== "ok") fail("ALTANA_TEST_ACTION_ACL_FAILED");

  const existingDescriptor = await exactJsonFile(paths.descriptor, { optional: true });
  const secretExists = await access(paths.secret, fsConstants.F_OK).then(
    () => true,
    () => false
  );
  if (existingDescriptor !== null || secretExists) {
    if (existingDescriptor === null || !secretExists) fail("ALTANA_TEST_ACTION_CUSTODY_PARTIAL");
    process.stdout.write(`${JSON.stringify(existingDescriptor)}\n`);
    return;
  }

  const { createPrivateKeySigner } = await import(sdkEntryUrl.href);
  const signer = createPrivateKeySigner();
  const clear = Buffer.from(signer._privateKey.slice(2), "hex");
  let protectedBase64;
  try {
    protectedBase64 = await runPowerShell(
      DPAPI_PROTECT_SCRIPT,
      clear.toString("base64"),
      "PROTECT"
    );
  } finally {
    clear.fill(0);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(protectedBase64)) {
    fail("ALTANA_TEST_ACTION_DPAPI_OUTPUT_INVALID");
  }
  const descriptor = Object.freeze({
    schemaVersion: 1,
    custody: "worker-dpapi-current-user",
    curve: "secp256k1",
    publicKey: signer.publicKey.toLowerCase(),
    address: signer.address
  });
  await writeFile(paths.secret, Buffer.from(protectedBase64, "base64"), { flag: "wx" });
  await writeCreateOnlyJson(paths.descriptor, descriptor);
  process.stdout.write(`${JSON.stringify(descriptor)}\n`);
}

async function rpc(url, method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });
    if (!response.ok) fail("ALTANA_TEST_ACTION_RPC_UNAVAILABLE");
    const body = await response.json();
    if (!isRecord(body) || body.error !== undefined || !("result" in body)) {
      fail("ALTANA_TEST_ACTION_RPC_INVALID");
    }
    return body.result;
  } finally {
    clearTimeout(timeout);
  }
}

function authorityIds(config) {
  const keyStoreKeyId = keccak256(config.sessionKey.publicKey);
  const encodedAddress = padHex(config.sessionKey.address, { size: 32 });
  const publicKeyHash = keccak256(encodedAddress);
  const accountKeyHash = keccak256(
    encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }], [2n, publicKeyHash])
  );
  return Object.freeze({ accountKeyHash, keyStoreKeyId });
}

export function normalizeAccountExpiry(value) {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= UINT40_MAX
  ) {
    return value;
  }
  if (typeof value === "bigint" && value >= 0n && value <= BigInt(UINT40_MAX)) {
    return Number(value);
  }
  fail("ALTANA_TEST_ACTION_AUTHORITY_INVALID");
}

async function authorityAt(provider, config, ids) {
  const validData = encodeFunctionData({
    abi: KEYSTORE_ABI,
    functionName: "isValidKey",
    args: [config.walletAddress, ids.keyStoreKeyId]
  });
  const keysData = encodeFunctionData({ abi: ACCOUNT_ABI, functionName: "getKeys" });
  const [validRaw, keysRaw, balanceRaw] = await Promise.all([
    rpc(provider.url, "eth_call", [{ data: validData, to: KEYSTORE }, "latest"]),
    rpc(provider.url, "eth_call", [{ data: keysData, to: config.walletAddress }, "latest"]),
    rpc(provider.url, "eth_getBalance", [config.walletAddress, "latest"])
  ]);
  const valid = decodeFunctionResult({
    abi: KEYSTORE_ABI,
    functionName: "isValidKey",
    data: validRaw
  });
  const decoded =
    keysRaw === "0x"
      ? [[], []]
      : decodeFunctionResult({ abi: ACCOUNT_ABI, functionName: "getKeys", data: keysRaw });
  if (
    !Array.isArray(decoded) ||
    decoded.length !== 2 ||
    !Array.isArray(decoded[0]) ||
    !Array.isArray(decoded[1])
  ) {
    fail("ALTANA_TEST_ACTION_AUTHORITY_INVALID");
  }
  const index = decoded[1].findIndex((value) => value.toLowerCase() === ids.accountKeyHash);
  const expiry = index < 0 ? null : normalizeAccountExpiry(decoded[0][index]?.expiry);
  if (typeof balanceRaw !== "string" || !/^0x[0-9a-f]+$/iu.test(balanceRaw)) {
    fail("ALTANA_TEST_ACTION_BALANCE_INVALID");
  }
  return Object.freeze({
    provider: provider.name,
    status:
      valid === true && index >= 0
        ? "present"
        : valid === false && index < 0
          ? "absent"
          : "mismatch",
    expiry,
    balanceWei: BigInt(balanceRaw)
  });
}

async function observeAuthority(config) {
  const ids = authorityIds(config);
  const observations = await Promise.all(
    PROVIDERS.map((provider) => authorityAt(provider, config, ids))
  );
  const [first, second] = observations;
  if (
    first.status !== second.status ||
    first.expiry !== second.expiry ||
    first.balanceWei !== second.balanceWei
  ) {
    fail("ALTANA_TEST_ACTION_RPC_DISAGREEMENT");
  }
  if (first.status === "mismatch") fail("ALTANA_TEST_ACTION_AUTHORITY_MISMATCH");
  return Object.freeze({
    present: first.status === "present",
    expiry: first.expiry,
    balanceWei: first.balanceWei,
    providers: Object.freeze(observations.map(({ provider }) => provider))
  });
}

function actionCall(config) {
  return Object.freeze({
    to: config.action.target,
    value: 0n,
    data: encodeFunctionData({
      abi: PTA_ABI,
      functionName: "approve",
      args: [config.action.spender, 0n]
    })
  });
}

async function simulateAction(config, call) {
  const results = await Promise.all(
    PROVIDERS.map((provider) =>
      rpc(provider.url, "eth_call", [
        { data: call.data, from: config.walletAddress, to: call.to, value: "0x0" },
        "latest"
      ])
    )
  );
  for (const result of results) {
    const approved = decodeFunctionResult({ abi: PTA_ABI, functionName: "approve", data: result });
    if (approved !== true) fail("ALTANA_TEST_ACTION_SIMULATION_FAILED");
  }
}

async function signerFromCustody(paths, config) {
  const stat = await lstat(paths.secret);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 32 || stat.size > 4_096) {
    fail("ALTANA_TEST_ACTION_SECRET_FILE_INVALID");
  }
  const protectedBytes = await readFile(paths.secret);
  let clear;
  try {
    const clearBase64 = await runPowerShell(
      DPAPI_UNPROTECT_SCRIPT,
      protectedBytes.toString("base64"),
      "UNPROTECT"
    );
    clear = Buffer.from(clearBase64, "base64");
    if (clear.length !== 32) fail("ALTANA_TEST_ACTION_SECRET_INVALID");
    const { signerFromPrivateKey } = await import(sdkEntryUrl.href);
    const signer = signerFromPrivateKey(`0x${clear.toString("hex")}`);
    if (
      signer.address !== config.sessionKey.address ||
      signer.publicKey.toLowerCase() !== config.sessionKey.publicKey
    ) {
      fail("ALTANA_TEST_ACTION_CUSTODY_BINDING_MISMATCH");
    }
    return signer;
  } finally {
    protectedBytes.fill(0);
    clear?.fill(0);
  }
}

function publicExecuteIdentifiers(input) {
  if (!isRecord(input)) fail("ALTANA_TEST_ACTION_SUBMISSION_INVALID");
  const callsId = exactHex(
    input.callsId,
    (input.callsId.length - 2) / 2,
    "ALTANA_TEST_ACTION_CALLS_ID_INVALID"
  );
  if (callsId.length > 514) fail("ALTANA_TEST_ACTION_CALLS_ID_INVALID");
  return Object.freeze({ callsId });
}

async function submitExecute(paths, config, expiry) {
  const now = Math.floor(Date.now() / 1_000);
  if (
    !Number.isInteger(expiry) ||
    expiry <= now ||
    expiry > now + config.sessionLifetimeSeconds + 300
  ) {
    fail("ALTANA_TEST_ACTION_SESSION_EXPIRY_INVALID");
  }
  const claim = Object.freeze({
    schemaVersion: 1,
    configHash: configHash(config),
    operation: "pta_approve_zero",
    claimedAt: new Date().toISOString(),
    sessionExpiry: expiry
  });
  await writeCreateOnlyJson(paths.claim, claim);
  await writePublicState(paths, config, {
    status: "submitting_execute",
    authorityPresent: true,
    balanceWei: null,
    sessionExpiry: expiry,
    execute: null
  });
  const call = actionCall(config);
  await simulateAction(config, call);
  const signer = await signerFromCustody(paths, config);
  const { BNB_TESTNET, createClient } = await import(sdkEntryUrl.href);
  const client = createClient({ chains: [BNB_TESTNET], defaultChainId: CHAIN_ID });
  const result = await client.execute({
    session: {
      walletAddress: config.walletAddress,
      signer,
      publicKey: config.sessionKey.publicKey,
      permissions: {
        calls: config.permissions.calls,
        spend: [{ limit: 1n, period: "day" }]
      },
      expiry
    },
    calls: call,
    chainId: CHAIN_ID,
    noWait: true
  });
  const identifiers = publicExecuteIdentifiers(result);
  await writeCreateOnlyJson(paths.submission, {
    schemaVersion: 1,
    ...identifiers,
    submittedAt: new Date().toISOString()
  });
  return identifiers;
}

export function normalizeRelayStatus(rawStatus) {
  if (
    rawStatus === "CONFIRMED" ||
    (Number.isInteger(rawStatus) && rawStatus >= 200 && rawStatus < 300)
  ) {
    return "confirmed";
  }
  if (
    rawStatus === "FAILED" ||
    (Number.isInteger(rawStatus) && rawStatus >= 300 && rawStatus < 700)
  ) {
    return "failed";
  }
  if (
    rawStatus === "PENDING" ||
    (Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus < 200)
  ) {
    return "pending";
  }
  return "unknown";
}

async function relayStatus(callsId) {
  const result = await rpc(RELAY_URL, "wallet_getCallsStatus", [callsId]);
  if (!isRecord(result)) fail("ALTANA_TEST_ACTION_RELAY_STATUS_INVALID");
  const rawStatus = result.status;
  const status = normalizeRelayStatus(rawStatus);
  const receipt = Array.isArray(result.receipts) ? result.receipts[0] : undefined;
  const transactionHash =
    isRecord(receipt) && typeof receipt.transactionHash === "string"
      ? exactHex(receipt.transactionHash, 32, "ALTANA_TEST_ACTION_TRANSACTION_HASH_INVALID")
      : null;
  return Object.freeze({ rawStatus, status, transactionHash });
}

async function confirmedReceipt(transactionHash) {
  const observations = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const receipt = await rpc(provider.url, "eth_getTransactionReceipt", [transactionHash]);
      if (!isRecord(receipt)) return null;
      if (
        receipt.transactionHash?.toLowerCase() !== transactionHash ||
        BigInt(receipt.status) !== 1n ||
        typeof receipt.blockHash !== "string" ||
        typeof receipt.blockNumber !== "string"
      ) {
        fail("ALTANA_TEST_ACTION_RECEIPT_INVALID");
      }
      return Object.freeze({
        provider: provider.name,
        blockHash: exactHex(receipt.blockHash, 32, "ALTANA_TEST_ACTION_RECEIPT_INVALID"),
        blockNumber: BigInt(receipt.blockNumber).toString(10)
      });
    })
  );
  if (observations.some((value) => value === null)) return null;
  const [first, second] = observations;
  if (first.blockHash !== second.blockHash || first.blockNumber !== second.blockNumber) {
    fail("ALTANA_TEST_ACTION_RECEIPT_DISAGREEMENT");
  }
  return Object.freeze({
    transactionHash,
    blockHash: first.blockHash,
    blockNumber: first.blockNumber
  });
}

async function runWorker() {
  if (process.platform !== "win32") fail("ALTANA_TEST_ACTION_WINDOWS_REQUIRED");
  const paths = workerPaths();
  const config = validateAltanaTestActionConfig(await exactJsonFile(CONFIG_PATH));
  const descriptor = await exactJsonFile(paths.descriptor);
  if (canonical(descriptor) !== canonical(config.sessionKey)) {
    fail("ALTANA_TEST_ACTION_PUBLIC_DESCRIPTOR_MISMATCH");
  }
  const secretStat = await lstat(paths.secret);
  if (!secretStat.isFile() || secretStat.isSymbolicLink())
    fail("ALTANA_TEST_ACTION_SECRET_FILE_INVALID");

  while (true) {
    try {
      const claim = await exactJsonFile(paths.claim, { optional: true });
      let submission = await exactJsonFile(paths.submission, { optional: true });
      const receipt = await exactJsonFile(paths.receipt, { optional: true });
      const authority = await observeAuthority(config);

      if (receipt !== null) {
        await writePublicState(paths, config, {
          status: authority.present ? "execute_confirmed" : "lifecycle_complete",
          authorityPresent: authority.present,
          balanceWei: authority.balanceWei.toString(10),
          sessionExpiry: claim?.sessionExpiry ?? null,
          execute: receipt
        });
      } else if (submission !== null) {
        const identifiers = publicExecuteIdentifiers(submission);
        const relay = await relayStatus(identifiers.callsId);
        if (relay.status === "failed") {
          await writePublicState(paths, config, {
            status: "execute_failed",
            authorityPresent: authority.present,
            balanceWei: authority.balanceWei.toString(10),
            sessionExpiry: claim?.sessionExpiry ?? authority.expiry,
            execute: {
              callsId: identifiers.callsId,
              relayStatusCode: relay.rawStatus,
              transactionHash: relay.transactionHash
            }
          });
        } else if (relay.status === "confirmed" && relay.transactionHash !== null) {
          const confirmed = await confirmedReceipt(relay.transactionHash);
          if (confirmed !== null) {
            const record = Object.freeze({
              schemaVersion: 1,
              callsId: identifiers.callsId,
              relayStatusCode: relay.rawStatus,
              ...confirmed,
              confirmedAt: new Date().toISOString()
            });
            await writeCreateOnlyJson(paths.receipt, record);
            await writePublicState(paths, config, {
              status: "execute_confirmed",
              authorityPresent: authority.present,
              balanceWei: authority.balanceWei.toString(10),
              sessionExpiry: claim?.sessionExpiry ?? authority.expiry,
              execute: record
            });
          }
        } else if (relay.status === "pending") {
          await writePublicState(paths, config, {
            status: "execute_pending",
            authorityPresent: authority.present,
            balanceWei: authority.balanceWei.toString(10),
            sessionExpiry: claim?.sessionExpiry ?? authority.expiry,
            execute: {
              callsId: identifiers.callsId,
              relayStatusCode: relay.rawStatus,
              transactionHash: relay.transactionHash
            }
          });
        } else {
          await writePublicState(paths, config, {
            status: "execute_outcome_unknown",
            authorityPresent: authority.present,
            balanceWei: authority.balanceWei.toString(10),
            sessionExpiry: claim?.sessionExpiry ?? authority.expiry,
            execute: {
              callsId: identifiers.callsId,
              relayStatusCode: relay.rawStatus,
              transactionHash: relay.transactionHash
            }
          });
        }
      } else if (claim !== null) {
        await writePublicState(paths, config, {
          status: "execute_outcome_unknown",
          authorityPresent: authority.present,
          balanceWei: authority.balanceWei.toString(10),
          sessionExpiry: claim.sessionExpiry ?? authority.expiry,
          execute: null
        });
      } else if (authority.present && authority.expiry !== null) {
        submission = await submitExecute(paths, config, authority.expiry);
        await writePublicState(paths, config, {
          status: "execute_pending",
          authorityPresent: true,
          balanceWei: authority.balanceWei.toString(10),
          sessionExpiry: authority.expiry,
          execute: submission
        });
      } else {
        await writePublicState(paths, config, {
          status: "waiting_authority",
          authorityPresent: false,
          balanceWei: authority.balanceWei.toString(10),
          sessionExpiry: null,
          execute: null
        });
      }
    } catch (error) {
      const code =
        error instanceof Error && /^ALTANA_TEST_ACTION_[A-Z0-9_]+$/u.test(error.message)
          ? error.message
          : "ALTANA_TEST_ACTION_WORKER_ERROR";
      try {
        const config = validateAltanaTestActionConfig(await exactJsonFile(CONFIG_PATH));
        await writePublicState(paths, config, {
          status: "worker_blocked",
          authorityPresent: null,
          balanceWei: null,
          sessionExpiry: null,
          execute: null,
          error: code
        });
      } catch {
        // The process log receives only a stable public code below.
      }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_INTERVAL_MS));
  }
}

function invokedDirectly() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  );
}

if (invokedDirectly()) {
  const mode = process.argv[2];
  const action = mode === "--provision" ? provision : mode === "--run" ? runWorker : null;
  if (action === null || process.argv.length !== 3) {
    process.stderr.write("ALTANA_TEST_ACTION_ARGUMENTS_INVALID\n");
    process.exitCode = 1;
  } else {
    action().catch((error) => {
      const code =
        error instanceof Error && /^ALTANA_TEST_ACTION_[A-Z0-9_]+$/u.test(error.message)
          ? error.message
          : "ALTANA_TEST_ACTION_FAILED";
      process.stderr.write(`${code}\n`);
      process.exitCode = 1;
    });
  }
}
