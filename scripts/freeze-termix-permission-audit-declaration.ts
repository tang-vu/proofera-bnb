import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "prettier";

import {
  BenchmarkDeclarationSchema,
  PERMISSION_AUDIT_AGENT_ENDPOINT,
  PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256,
  PERMISSION_AUDIT_ENGINE_VERSION,
  PERMISSION_AUDIT_MANUAL_PROCEDURE_VERSION,
  PERMISSION_AUDIT_RPC_ENDPOINT,
  PermissionAuditBundleSchema,
  TERMIX_AGENT_REGISTRY_CHAIN_PARAMETER,
  auditPermissionBundle,
  canonicalJson,
  expectedPermissionAuditDeclarationInputs,
  normalizeBenchmarkDeclaration,
  sha256Bytes,
  sha256Canonical,
  type PermissionAuditBundle
} from "../packages/benchmarks/src/index";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = "scripts/freeze-termix-permission-audit-declaration.ts";
const LIFECYCLE_PATH = "evidence/altana/lifecycles/126543819-72e7cf94-altana-lifecycle.json";
const SDK_PATH = "evidence/altana/preparations/125493138-bsc-testnet-readiness.json";
const PTA_DEPLOYMENT_PATH = "evidence/development/bsc-testnet-pta-deployment-2026-08-12.json";
const POLICY_PATH = "deploy/windows/altana-test-action.v2.json";
const MIGRATION_PATH = "packages/integrations/migrations/0002_altana_grant_claim_schema_v1.sql";
const HIRE_PATH = "evidence/termix/hire-receipts/125715654-7fa5ad3e.json";
const PREPARATION_DIRECTORY = "evidence/termix/preparations/permission-audit";
const BUNDLE_DIRECTORY = "evidence/termix/frozen/permission-audit";
const DECLARATION_DIRECTORY = "evidence/termix/declarations/permission-audit";
const ANSWER_KEY_DIRECTORY = "ProofEra/termix-permission-audit-reviewer";
const GRANT_CONTAINER = "proofera-postgres-grant";
const GRANT_DATABASE = "proofera_altana_grant_claim";
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const AGENT_ID = "1825";
const PTA = "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc";
const APPROVE_SELECTOR = "0x095ea7b3";
const EXPECTED_MIGRATION_SHA256 =
  "fced0c471135a969a726eb1e2233c9b18976c0a2d66377fa40a9d52a552d17cb";
const EXPECTED_SEMANTIC_SHA256 = "fc81399172bf962fe4d0b017d58846a3651ca5ccd850004e20d280ebdad9639a";
const EXPECTED_PTA_RUNTIME_SHA256 =
  "e018f428a384212f11817a24f4828c1a479403d86491e256a7f79d3142395527";
const MAXIMUM_GIT_OUTPUT_BYTES = 8_000_000;
const MAXIMUM_COMMAND_OUTPUT_BYTES = 2_000_000;
const MINIMUM_RANDOMNESS_MARGIN_BLOCKS = 1_200n;
const JSON_FORMAT_OPTIONS = Object.freeze({
  arrowParens: "always",
  endOfLine: "lf",
  parser: "json",
  printWidth: 100,
  proseWrap: "preserve",
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "none"
});

interface Options {
  readonly randomnessBlock: string;
  readonly sourceCommitSha: string;
}

interface CommittedJson {
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly value: Record<string, unknown>;
}

function fail(code: string): never {
  throw new Error(code);
}

function parseArguments(args: readonly string[]): Options {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (
    normalized.length !== 5 ||
    normalized[0] !== "--freeze-exact-permission-audit-declaration" ||
    normalized[1] !== "--source-commit" ||
    normalized[3] !== "--randomness-block" ||
    normalized[2] === undefined ||
    normalized[4] === undefined ||
    !/^[0-9a-f]{40}$/u.test(normalized[2]) ||
    !/^[1-9][0-9]*$/u.test(normalized[4])
  ) {
    fail("TERMIX_PERMISSION_FREEZE_ARGUMENTS_INVALID");
  }
  return { sourceCommitSha: normalized[2], randomnessBlock: normalized[4] };
}

function gitText(args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function gitBytes(args: readonly string[]): Buffer {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
}

function verifyExactPublishedSource(sourceCommitSha: string): void {
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("TERMIX_PERMISSION_FREEZE_REPOSITORY_DIRTY");
  }
  if (gitText(["rev-parse", "HEAD"]) !== sourceCommitSha) {
    fail("TERMIX_PERMISSION_FREEZE_SOURCE_COMMIT_MISMATCH");
  }
  if (gitText(["rev-parse", "origin/main"]) !== sourceCommitSha) {
    fail("TERMIX_PERMISSION_FREEZE_SOURCE_NOT_PUBLISHED");
  }
}

async function assertTrustedPath(absolutePath: string): Promise<void> {
  const root = await realpath(ROOT);
  const canonical = await realpath(absolutePath);
  const local = relative(root, canonical);
  if (
    local === "" ||
    local === ".." ||
    local.startsWith(`..${sep}`) ||
    isAbsolute(local) ||
    resolve(absolutePath).toLowerCase() !== resolve(canonical).toLowerCase()
  ) {
    fail("TERMIX_PERMISSION_FREEZE_INPUT_UNTRUSTED");
  }
}

async function committedBytes(path: string): Promise<Buffer> {
  const absolutePath = resolve(ROOT, ...path.split("/"));
  await assertTrustedPath(absolutePath);
  gitText(["ls-files", "--error-unmatch", "--", path]);
  const working = await readFile(absolutePath);
  const committed = gitBytes(["show", `HEAD:${path}`]);
  if (!working.equals(committed)) fail("TERMIX_PERMISSION_FREEZE_INPUT_NOT_COMMITTED");
  return working;
}

async function committedJson(path: string): Promise<CommittedJson> {
  const bytes = await committedBytes(path);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    fail("TERMIX_PERMISSION_FREEZE_INPUT_JSON_INVALID");
  }
  return { bytes, sha256: sha256(bytes), value: record(value, "INPUT_RECORD_INVALID") };
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function array(value: unknown, code: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(code);
  return value;
}

function string(value: unknown, pattern: RegExp, code: string): string {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}

function decimal(value: unknown, code: string): string {
  return string(value, /^(0|[1-9][0-9]*)$/u, code);
}

function hash(value: unknown, code: string): string {
  return string(value, /^0x[0-9a-fA-F]{64}$/u, code).toLowerCase();
}

function address(value: unknown, code: string): string {
  return string(value, /^0x[0-9a-fA-F]{40}$/u, code).toLowerCase();
}

function unixTimestampToUtc(value: unknown, code: string): string {
  const seconds = BigInt(decimal(value, code));
  if (seconds > BigInt(Number.MAX_SAFE_INTEGER) / 1_000n) fail(code);
  const result = new Date(Number(seconds) * 1_000);
  if (!Number.isFinite(result.getTime())) fail(code);
  return result.toISOString();
}

function commandText(command: string, args: readonly string[]): string {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: MAXIMUM_COMMAND_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function captureDatabaseReceipt(): Record<string, unknown> {
  const state = commandText("docker", ["inspect", "--format={{.State.Status}}", GRANT_CONTAINER]);
  const configuredImage = commandText("docker", [
    "inspect",
    "--format={{.Config.Image}}",
    GRANT_CONTAINER
  ]);
  const imageId = commandText("docker", ["inspect", "--format={{.Image}}", GRANT_CONTAINER]);
  const restartPolicy = commandText("docker", [
    "inspect",
    "--format={{.HostConfig.RestartPolicy.Name}}",
    GRANT_CONTAINER
  ]);
  if (
    state !== "running" ||
    configuredImage !== "postgres:17.9-bookworm" ||
    !/^sha256:[0-9a-f]{64}$/u.test(imageId) ||
    restartPolicy !== "unless-stopped"
  ) {
    fail("TERMIX_PERMISSION_FREEZE_DATABASE_CONTAINER_INVALID");
  }
  const receiptText = commandText("docker", [
    "exec",
    "-u",
    "postgres",
    GRANT_CONTAINER,
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    GRANT_DATABASE,
    "-At",
    "-c",
    "SELECT json_build_object('migrationVersion', migration_version::text, 'domainSchemaVersion', domain_schema_version::text, 'postgresMajor', postgres_major::text, 'semanticContractSha256', semantic_contract_sha256, 'deploymentId', deployment_id::text, 'appliedAtUtc', to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'))::text FROM proofera_altana_grant_claim.schema_receipt"
  ]);
  let receiptValue: unknown;
  try {
    receiptValue = JSON.parse(receiptText) as unknown;
  } catch {
    fail("TERMIX_PERMISSION_FREEZE_DATABASE_RECEIPT_INVALID");
  }
  const receipt = record(receiptValue, "TERMIX_PERMISSION_FREEZE_DATABASE_RECEIPT_INVALID");
  if (
    receipt.migrationVersion !== "1" ||
    receipt.domainSchemaVersion !== "1" ||
    receipt.postgresMajor !== "17" ||
    receipt.semanticContractSha256 !== EXPECTED_SEMANTIC_SHA256 ||
    typeof receipt.deploymentId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      receipt.deploymentId
    ) ||
    typeof receipt.appliedAtUtc !== "string" ||
    Number.isNaN(Date.parse(receipt.appliedAtUtc))
  ) {
    fail("TERMIX_PERMISSION_FREEZE_DATABASE_RECEIPT_INVALID");
  }
  const claimCount = commandText("docker", [
    "exec",
    "-u",
    "postgres",
    GRANT_CONTAINER,
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    GRANT_DATABASE,
    "-At",
    "-c",
    "SELECT count(*)::text FROM proofera_altana_grant_claim.submission_claims"
  ]);
  if (claimCount !== "0") fail("TERMIX_PERMISSION_FREEZE_DATABASE_CLAIM_JOIN_UNKNOWN");
  return {
    connectionBoundary: "container-local Unix socket read-only catalog queries",
    container: {
      configuredImage,
      imageId,
      name: GRANT_CONTAINER,
      restartPolicy,
      state
    },
    database: GRANT_DATABASE,
    receipt,
    submissionClaimCount: claimCount
  };
}

async function rpc(
  method: string,
  params: readonly unknown[],
  id: string
): Promise<{
  readonly request: Record<string, unknown>;
  readonly response: Record<string, unknown>;
}> {
  const request = { id, jsonrpc: "2.0", method, params };
  const response = await fetch(PERMISSION_AUDIT_RPC_ENDPOINT, {
    body: canonicalJson(request),
    headers: { accept: "application/json", "content-type": "application/json" },
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) fail("TERMIX_PERMISSION_FREEZE_RPC_HTTP_INVALID");
  const responseBody = await response.text();
  if (Buffer.byteLength(responseBody) > 1_000_000) {
    fail("TERMIX_PERMISSION_FREEZE_RPC_RESPONSE_TOO_LARGE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody) as unknown;
  } catch {
    fail("TERMIX_PERMISSION_FREEZE_RPC_JSON_INVALID");
  }
  const envelope = record(parsed, "TERMIX_PERMISSION_FREEZE_RPC_ENVELOPE_INVALID");
  if (envelope.id !== id || envelope.jsonrpc !== "2.0" || Object.hasOwn(envelope, "error")) {
    fail("TERMIX_PERMISSION_FREEZE_RPC_ENVELOPE_INVALID");
  }
  return { request, response: envelope };
}

async function captureCodeAttestation(
  blockNumber: string,
  blockHash: string,
  randomnessBlock: string
): Promise<Record<string, unknown>> {
  const chain = await rpc("eth_chainId", [], "permission-freeze-chain");
  if (chain.response.result !== "0x61") fail("TERMIX_PERMISSION_FREEZE_RPC_CHAIN_INVALID");
  const head = await rpc("eth_blockNumber", [], "permission-freeze-head");
  const headQuantity = string(
    head.response.result,
    /^0x(?:0|[1-9a-f][0-9a-f]*)$/u,
    "TERMIX_PERMISSION_FREEZE_RPC_HEAD_INVALID"
  );
  const headNumber = BigInt(headQuantity);
  if (BigInt(randomnessBlock) < headNumber + MINIMUM_RANDOMNESS_MARGIN_BLOCKS) {
    fail("TERMIX_PERMISSION_FREEZE_RANDOMNESS_BLOCK_TOO_NEAR");
  }
  const block = await rpc("eth_getBlockByHash", [blockHash, false], "permission-freeze-block");
  const blockResult = record(block.response.result, "TERMIX_PERMISSION_FREEZE_RPC_BLOCK_INVALID");
  if (
    hash(blockResult.hash, "TERMIX_PERMISSION_FREEZE_RPC_BLOCK_INVALID") !== blockHash ||
    BigInt(
      string(
        blockResult.number,
        /^0x(?:0|[1-9a-f][0-9a-f]*)$/u,
        "TERMIX_PERMISSION_FREEZE_RPC_BLOCK_INVALID"
      )
    ) !== BigInt(blockNumber) ||
    headNumber < BigInt(blockNumber) + 12n
  ) {
    fail("TERMIX_PERMISSION_FREEZE_RPC_BLOCK_MISMATCH");
  }
  const code = await rpc(
    "eth_getCode",
    [PTA.toLowerCase(), { blockHash, requireCanonical: true }],
    "permission-freeze-code"
  );
  const runtime = string(
    code.response.result,
    /^0x(?:[0-9a-fA-F]{2})+$/u,
    "TERMIX_PERMISSION_FREEZE_RPC_CODE_INVALID"
  ).toLowerCase();
  const runtimeSha256 = sha256(Buffer.from(runtime.slice(2), "hex"));
  if (runtimeSha256 !== EXPECTED_PTA_RUNTIME_SHA256) {
    fail("TERMIX_PERMISSION_FREEZE_RPC_CODE_MISMATCH");
  }
  return {
    blockHash,
    blockNumber,
    finalityMinimum: "12",
    headNumber: headNumber.toString(),
    provider: PERMISSION_AUDIT_RPC_ENDPOINT,
    queryBinding: "EIP-1898 blockHash requireCanonical",
    runtimeBytes: (runtime.length - 2) / 2,
    runtimeCode: runtime,
    runtimeSha256,
    target: PTA.toLowerCase(),
    transcript: [chain, head, block, code]
  };
}

function lifecyclePhase(
  lifecycle: Record<string, unknown>,
  expectedPhase: "execute" | "grant" | "revoke"
): Record<string, unknown> {
  const timeline = record(
    lifecycle.authorityTimeline,
    "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
  );
  const phases = array(timeline.phases, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
  const phase = phases.find(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).phase === expectedPhase
  );
  return record(phase, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
}

function operation(
  lifecycle: Record<string, unknown>,
  name: "execute" | "grant" | "revoke"
): Record<string, unknown> {
  const operations = record(lifecycle.operations, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
  return record(operations[name], "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
}

function validatePublicState(
  lifecycle: Record<string, unknown>,
  policy: Record<string, unknown>
): Record<string, unknown> {
  const localAppData = process.env.LOCALAPPDATA;
  if (typeof localAppData !== "string" || localAppData.length === 0) {
    fail("TERMIX_PERMISSION_FREEZE_LOCAL_STATE_UNAVAILABLE");
  }
  const publicStatePath = resolve(
    localAppData,
    "ProofEra",
    "altana-test-action-v2",
    "public-state.json"
  );
  const raw = execFileSync(
    process.execPath,
    [
      "-e",
      "const fs=require('node:fs');process.stdout.write(fs.readFileSync(process.argv[1]))",
      publicStatePath
    ],
    {
      encoding: "utf8",
      maxBuffer: MAXIMUM_COMMAND_OUTPUT_BYTES,
      windowsHide: true
    }
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    fail("TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID");
  }
  const state = record(parsed, "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID");
  const intent = record(lifecycle.intent, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
  const sessionKey = record(intent.sessionKey, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
  const execute = operation(lifecycle, "execute");
  const publicExecute = record(state.execute, "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID");
  if (
    state.schemaVersion !== 1 ||
    state.chainId !== 97 ||
    state.status !== "lifecycle_complete" ||
    state.authorityPresent !== false ||
    address(state.walletAddress, "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID") !==
      address(intent.walletAddress, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID") ||
    address(state.sessionKeyAddress, "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID") !==
      address(sessionKey.address, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID") ||
    state.sessionExpiry !== intent.expiry ||
    hash(publicExecute.callsId, "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID") !==
      hash(execute.callsId, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID") ||
    hash(publicExecute.transactionHash, "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID") !==
      hash(execute.transactionHash, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID") ||
    publicExecute.relayStatusCode !== 200 ||
    policy.schemaVersion !== 1
  ) {
    fail("TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_MISMATCH");
  }
  return {
    authorityPresent: false,
    chainId: 97,
    claimObservation:
      "inferred from lifecycle_complete plus the pinned worker's claim-before-sign ordering; the private claim journal was not opened",
    configHash: string(
      state.configHash,
      /^0x[0-9a-f]{64}$/u,
      "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID"
    ),
    execute: {
      blockHash: hash(publicExecute.blockHash, "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID"),
      blockNumber: decimal(
        publicExecute.blockNumber,
        "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID"
      ),
      callsId: hash(publicExecute.callsId, "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID"),
      confirmedAtUtc: string(
        publicExecute.confirmedAt,
        /^\d{4}-\d{2}-\d{2}T/u,
        "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID"
      ),
      relayStatusCode: 200,
      transactionHash: hash(
        publicExecute.transactionHash,
        "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID"
      )
    },
    observedAtUtc: string(
      state.observedAt,
      /^\d{4}-\d{2}-\d{2}T/u,
      "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID"
    ),
    sessionExpiry: decimal(
      String(state.sessionExpiry),
      "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID"
    ),
    sessionKeyAddress: address(
      state.sessionKeyAddress,
      "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID"
    ),
    status: "lifecycle_complete",
    walletAddress: address(state.walletAddress, "TERMIX_PERMISSION_FREEZE_PUBLIC_STATE_INVALID")
  };
}

function mutatedCase(
  base: PermissionAuditBundle["activationProposal"]["candidate"],
  caseId: string,
  mutation: Partial<PermissionAuditBundle["activationProposal"]["candidate"]>
): PermissionAuditBundle["activationProposal"] {
  return {
    candidate: { ...structuredClone(base), ...mutation },
    caseId,
    evidenceArtifactIds: ["adversarial-corpus"]
  };
}

function adversarialCorpus(
  base: PermissionAuditBundle["activationProposal"]["candidate"],
  executeObservedAtUtc: string
): PermissionAuditBundle["adversarialCorpus"] {
  const call = base.calls[0];
  if (call === undefined) fail("TERMIX_PERMISSION_FREEZE_CALL_INVALID");
  const spendCap = base.spendCaps[0];
  if (spendCap === undefined) fail("TERMIX_PERMISSION_FREEZE_SPEND_CAP_INVALID");
  const changedCall = (
    change: Partial<PermissionAuditBundle["activationProposal"]["candidate"]["calls"][number]>
  ) => [{ ...call, ...change }];
  return [
    mutatedCase(base, "case-001", { dispatcher: "generic" }),
    mutatedCase(base, "case-002", { sessionSignerExposure: "raw-material" }),
    mutatedCase(base, "case-003", { chainId: 56 }),
    mutatedCase(base, "case-004", { calls: changedCall({ target: `0x${"1".repeat(40)}` }) }),
    mutatedCase(base, "case-005", { calls: changedCall({ recipient: `0x${"2".repeat(40)}` }) }),
    mutatedCase(base, "case-006", { calls: changedCall({ token: `0x${"3".repeat(40)}` }) }),
    mutatedCase(base, "case-007", { spendCaps: [] }),
    mutatedCase(base, "case-008", { unknownOutcomePolicy: "retry-immediately" }),
    mutatedCase(base, "case-009", { revokePath: "missing" }),
    mutatedCase(base, "case-010", { calls: changedCall({ selector: "0x12345678" }) }),
    mutatedCase(base, "case-011", { calls: changedCall({ codeSha256: "0".repeat(64) }) }),
    mutatedCase(base, "case-012", {
      expiresAtUtc: new Date(Date.parse(base.expiresAtUtc) + 60_000).toISOString()
    }),
    mutatedCase(base, "case-013", {
      quoteObservedAtUtc: new Date(Date.parse(executeObservedAtUtc) - 4_000_000).toISOString()
    }),
    mutatedCase(base, "case-014", {
      spendCaps: [{ ...spendCap, limitBaseUnits: "1" }]
    })
  ];
}

async function ensureAbsent(path: string): Promise<void> {
  try {
    await access(path);
    fail("TERMIX_PERMISSION_FREEZE_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof Error && error.message === "TERMIX_PERMISSION_FREEZE_OUTPUT_EXISTS") {
      throw error;
    }
  }
}

async function writeExclusive(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(body, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  verifyExactPublishedSource(options.sourceCommitSha);
  const [lifecycleInput, sdkInput, ptaInput, policyInput, hireInput, migrationBytes, scriptBytes] =
    await Promise.all([
      committedJson(LIFECYCLE_PATH),
      committedJson(SDK_PATH),
      committedJson(PTA_DEPLOYMENT_PATH),
      committedJson(POLICY_PATH),
      committedJson(HIRE_PATH),
      committedBytes(MIGRATION_PATH),
      committedBytes(SCRIPT_PATH)
    ]);
  if (sha256(migrationBytes) !== EXPECTED_MIGRATION_SHA256) {
    fail("TERMIX_PERMISSION_FREEZE_MIGRATION_DIGEST_MISMATCH");
  }
  const lifecycle = lifecycleInput.value;
  const classification = record(
    lifecycle.classification,
    "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
  );
  if (
    lifecycle.schemaVersion !== "proofera-altana-lifecycle-evidence-v1.2.0" ||
    classification.grantReceiptVerified !== true ||
    classification.executeReceiptVerified !== true ||
    classification.revokeReceiptVerified !== true ||
    classification.authorityAbsentAfterRevoke !== true ||
    classification.applicationStateChangeVerified !== false
  ) {
    fail("TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
  }
  const intent = record(lifecycle.intent, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
  const sessionKey = record(intent.sessionKey, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
  const grant = operation(lifecycle, "grant");
  const execute = operation(lifecycle, "execute");
  const revoke = operation(lifecycle, "revoke");
  const grantPhase = lifecyclePhase(lifecycle, "grant");
  const executePhase = lifecyclePhase(lifecycle, "execute");
  const revokePhase = lifecyclePhase(lifecycle, "revoke");
  const timeline = record(
    lifecycle.authorityTimeline,
    "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
  );
  const finalized = record(timeline.finalized, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
  const finalBlockNumber = decimal(
    finalized.blockNumber,
    "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
  );
  const finalBlockHash = hash(finalized.blockHash, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID");
  const codeAttestation = await captureCodeAttestation(
    finalBlockNumber,
    finalBlockHash,
    options.randomnessBlock
  );
  const database = captureDatabaseReceipt();
  const publicState = validatePublicState(lifecycle, policyInput.value);
  const ptaContract = record(ptaInput.value.contract, "TERMIX_PERMISSION_FREEZE_PTA_INVALID");
  if (
    ptaInput.value.chainId !== 97 ||
    address(ptaContract.address, "TERMIX_PERMISSION_FREEZE_PTA_INVALID") !== PTA.toLowerCase() ||
    ptaContract.runtimeSha256 !== EXPECTED_PTA_RUNTIME_SHA256
  ) {
    fail("TERMIX_PERMISSION_FREEZE_PTA_INVALID");
  }
  const sdk = record(sdkInput.value.sdk, "TERMIX_PERMISSION_FREEZE_SDK_INVALID");
  const sdkFiles = array(sdk.files, "TERMIX_PERMISSION_FREEZE_SDK_INVALID");
  if (sdk.version !== "0.7.0" || sdk.package !== "@altananetwork/sdk" || sdkFiles.length !== 6) {
    fail("TERMIX_PERMISSION_FREEZE_SDK_INVALID");
  }
  const sdkPackageBytesSha256 = sha256Canonical({
    files: sdkFiles,
    package: sdk.package,
    version: sdk.version
  });
  const hires = array(hireInput.value.hires, "TERMIX_PERMISSION_FREEZE_HIRE_INVALID");
  const hire = hires.find(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).slug === "autonomous-session-permission-audit"
  );
  const hireRecord = record(hire, "TERMIX_PERMISSION_FREEZE_HIRE_INVALID");
  const hireReceipt = record(hireRecord.termixHireReceipt, "TERMIX_PERMISSION_FREEZE_HIRE_INVALID");
  if (
    hireRecord.agentId !== AGENT_ID ||
    hireReceipt.state !== "verified" ||
    hireReceipt.chainId !== 97
  ) {
    fail("TERMIX_PERMISSION_FREEZE_HIRE_INVALID");
  }
  const observedAtUtc = new Date().toISOString();
  const preparation = {
    schemaVersion: "proofera-termix-permission-audit-preparation-v1.0.0",
    classification: {
      databaseClaimRecordObserved: false,
      databaseDeploymentReceiptObserved: true,
      localProofWorkerClaimDirectlyRead: false,
      localProofWorkerClaimInferredFromPinnedOrdering: true,
      readOnly: true,
      secretMaterialRead: false,
      termixRun: false
    },
    codeAttestation,
    database,
    lifecycle: { path: LIFECYCLE_PATH, sha256: lifecycleInput.sha256 },
    limitations: [
      "The proof worker used a local create-only claim file, not the deployed PostgreSQL production claim ledger.",
      "The private claim journal and every custody artifact were deliberately not opened; claim existence is inferred from pinned claim-before-sign source ordering plus the successful execution receipt.",
      "The PostgreSQL deployment receipt is real host-local staging evidence, but submissionClaimCount is zero and no database row joins this lifecycle.",
      "PublicNode alone retains the exact historical PTA runtime at the lifecycle final block; this does not upgrade the lifecycle's single-provider historical authority limit.",
      "This preparation performs only fixed local reads and read-only JSON-RPC calls. It is not a timed TermiX run or an advantage claim."
    ],
    observedAtUtc,
    publicWorkerState: publicState,
    sourceCommitSha: options.sourceCommitSha,
    sources: {
      hire: { path: HIRE_PATH, sha256: hireInput.sha256 },
      migration: { path: MIGRATION_PATH, sha256: sha256(migrationBytes) },
      policy: { path: POLICY_PATH, sha256: policyInput.sha256 },
      ptaDeployment: { path: PTA_DEPLOYMENT_PATH, sha256: ptaInput.sha256 },
      sdk: { path: SDK_PATH, sha256: sdkInput.sha256 }
    }
  };
  const prefix = `${options.sourceCommitSha.slice(0, 12)}-${finalBlockNumber}`;
  const preparationPath = `${PREPARATION_DIRECTORY}/${prefix}.json`;
  const bundlePath = `${BUNDLE_DIRECTORY}/${prefix}.canonical-json`;
  const declarationPath = `${DECLARATION_DIRECTORY}/${options.sourceCommitSha.slice(0, 12)}-${options.randomnessBlock}.json`;
  const preparationBody = await format(JSON.stringify(preparation), JSON_FORMAT_OPTIONS);
  const preparationSha256 = sha256(preparationBody);
  const grantObservedAtUtc = unixTimestampToUtc(
    grantPhase.blockTimestamp,
    "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
  );
  const executeObservedAtUtc = unixTimestampToUtc(
    executePhase.blockTimestamp,
    "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
  );
  const revokeObservedAtUtc = unixTimestampToUtc(
    revokePhase.blockTimestamp,
    "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
  );
  const expiresAtUtc = unixTimestampToUtc(
    String(intent.expiry),
    "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
  );
  const call = {
    codeSha256: EXPECTED_PTA_RUNTIME_SHA256,
    recipient: address(sessionKey.address, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"),
    selector: APPROVE_SELECTOR,
    target: PTA.toLowerCase(),
    token: PTA.toLowerCase()
  };
  const safeCorpusCandidate: PermissionAuditBundle["activationProposal"]["candidate"] = {
    calls: [call],
    chainId: 97,
    dispatcher: "direct-only",
    expiresAtUtc,
    quoteObservedAtUtc: grantObservedAtUtc,
    revokePath: "present",
    sessionSignerExposure: "none",
    spendCaps: [{ limitBaseUnits: "0", periodSeconds: "86400", token: PTA.toLowerCase() }],
    unknownOutcomePolicy: "halt-and-probe"
  };
  const evidence = [
    { artifactId: "activation-proposal", locator: POLICY_PATH, sha256: policyInput.sha256 },
    { artifactId: "adversarial-corpus", locator: SCRIPT_PATH, sha256: sha256(scriptBytes) },
    { artifactId: "authority-lifecycle", locator: LIFECYCLE_PATH, sha256: lifecycleInput.sha256 },
    { artifactId: "code-attestation", locator: preparationPath, sha256: preparationSha256 },
    { artifactId: "database-deployment", locator: preparationPath, sha256: preparationSha256 },
    { artifactId: "pta-deployment", locator: PTA_DEPLOYMENT_PATH, sha256: ptaInput.sha256 },
    { artifactId: "sdk-behavior", locator: SDK_PATH, sha256: sdkInput.sha256 },
    { artifactId: "worker-public-state", locator: preparationPath, sha256: preparationSha256 }
  ];
  const bundle = PermissionAuditBundleSchema.parse({
    activationProposal: {
      candidate: { ...safeCorpusCandidate, spendCaps: [] },
      caseId: "activation-proposal",
      evidenceArtifactIds: [
        "activation-proposal",
        "authority-lifecycle",
        "code-attestation",
        "database-deployment",
        "worker-public-state"
      ]
    },
    adversarialCorpus: adversarialCorpus(safeCorpusCandidate, executeObservedAtUtc),
    authorityLifecycle: {
      chainId: 97,
      executeBlockHash: hash(execute.blockHash, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"),
      executeObservedAtUtc,
      executeTransactionHash: hash(
        execute.transactionHash,
        "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
      ),
      finalAuthorityState: "revoked",
      grantBlockHash: hash(grant.blockHash, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"),
      grantObservedAtUtc,
      grantTransactionHash: hash(
        grant.transactionHash,
        "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
      ),
      revokeBlockHash: hash(revoke.blockHash, "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"),
      revokeObservedAtUtc,
      revokeTransactionHash: hash(
        revoke.transactionHash,
        "TERMIX_PERMISSION_FREEZE_LIFECYCLE_INVALID"
      )
    },
    codeAuthorityAttestation: {
      attestedCalls: [call],
      blockHash: finalBlockHash,
      blockNumber: finalBlockNumber,
      chainId: 97
    },
    durableClaimState: {
      claimEnforcementLayer: "local-create-only-file",
      claimEvidenceLevel: "inferred-from-pinned-ordering",
      claimState: "claimed",
      databaseClaimRecordObserved: false,
      databaseDeploymentReceiptArtifactId: "database-deployment",
      reservationId: `altana-v2-${String(publicState.configHash).slice(2, 18)}`,
      unknownOutcomeRetryAllowed: false
    },
    evidence,
    expectedPolicy: {
      allowedCalls: [call],
      chainId: 97,
      expiresAtUtc,
      maximumQuoteAgeSeconds: 60,
      requiredClaimEnforcementLayer: "postgresql-grant-claim",
      requiresDatabaseClaimRecord: true,
      requiresDirectClaimEvidence: true,
      spendCaps: safeCorpusCandidate.spendCaps
    },
    frozenAtUtc: observedAtUtc,
    schemaVersion: "proofera-termix-permission-audit-bundle-v1.1.0",
    sdkBehavior: {
      callsIdRetainedAfterGrantException: "no",
      evidenceArtifactId: "sdk-behavior",
      packageBytesSha256: sdkPackageBytesSha256,
      version: "0.7.0"
    },
    sourceBindings: {
      activationProposalArtifactId: "activation-proposal",
      adversarialCorpusArtifactId: "adversarial-corpus",
      authorityLifecycleReceiptsArtifactId: "authority-lifecycle",
      codeAuthorityAttestationArtifactId: "code-attestation",
      sdkBehaviorEvidenceArtifactId: "sdk-behavior"
    }
  });
  const bundleCanonicalJson = canonicalJson(bundle);
  const bundleSha256 = sha256Bytes(bundleCanonicalJson);
  const auditOutput = auditPermissionBundle(bundle);
  const answerKeyCanonicalJson = canonicalJson({
    bundleSha256,
    engineVersion: PERMISSION_AUDIT_ENGINE_VERSION,
    output: auditOutput,
    schemaVersion: "proofera-termix-permission-audit-answer-key-v1.0.0"
  });
  const answerKeySha256 = sha256Bytes(answerKeyCanonicalJson);
  const randomnessCommitment = {
    blockNumber: options.randomnessBlock,
    chainId: 97,
    finalityConfirmations: "12",
    mapping: "least-significant bit of finalized block hash: 0=agent-first, 1=manual-first",
    providers: ["https://data-seed-prebsc-2-s2.binance.org:8545", PERMISSION_AUDIT_RPC_ENDPOINT]
  };
  const inputDescriptions: Readonly<Record<string, string>> = {
    "activation-proposal": "Exact policy/config evidence reference for the audited activation.",
    "adversarial-corpus": "Source-bound deterministic blind mutation corpus reference.",
    "authority-lifecycle-receipts":
      "Retained grant, execute and revoke lifecycle evidence reference.",
    "code-authority-attestation": "Exact-block PTA runtime attestation reference.",
    "sdk-behavior-evidence": "Pinned Altana SDK 0.7.0 behavior evidence reference."
  };
  const declaration = BenchmarkDeclarationSchema.parse({
    benchmarkId: "altana-permission-audit-v1",
    task: {
      domain: "security",
      exactDefinition:
        "Audit one immutable secret-free BSC testnet Altana activation bundle, identify authority and durability defects, and return evidence-linked findings plus a corrected three-layer enforcement table. The timed audit is read-only.",
      successCondition:
        "Both methods inspect byte-identical inputs, report reproducible findings without secrets or writes, and preserve the distinction between Altana/onchain, ProofEra runtime and explicit wallet enforcement.",
      taskId: "autonomous-session-permission-audit",
      title: "Altana/Pancake autonomous-session least-authority audit"
    },
    inputs: [...expectedPermissionAuditDeclarationInputs(bundle)].map(([inputId, value]) => ({
      description: inputDescriptions[inputId] ?? "Frozen permission-audit evidence reference.",
      inputId,
      unit: null,
      value: { encoding: "canonical_json", value }
    })),
    constraints: [
      {
        constraintId: "bsc-testnet-only",
        description: "All authority, receipt and code observations are BSC testnet chain 97.",
        enforcement: "hard",
        expected: { encoding: "decimal_integer", value: "97" }
      },
      {
        constraintId: "secret-free-bundle",
        description:
          "No credential, signer, passkey or opaque secret handle may enter either lane.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      },
      {
        constraintId: "timed-audit-read-only",
        description:
          "Neither lane may sign, grant, revoke, submit, broadcast or mutate a database.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      },
      {
        constraintId: "required-enforcement-layers",
        description: "Corrections must identify the actual enforcement layer.",
        enforcement: "hard",
        expected: {
          encoding: "canonical_json",
          value: canonicalJson([
            "altana-or-onchain",
            "explicit-wallet-confirmation",
            "proofera-runtime"
          ])
        }
      },
      {
        constraintId: "audit-window",
        description: "Finish within 1200 seconds; overruns remain recorded.",
        enforcement: "scored",
        expected: { encoding: "decimal_integer", value: "1200" }
      }
    ],
    environment: {
      chainId: 97,
      components: [
        { configurationSha256: null, name: "node", version: process.version },
        {
          configurationSha256: PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256,
          name: "proofera-security-auditor",
          version: PERMISSION_AUDIT_ENGINE_VERSION
        },
        {
          configurationSha256: sha256Canonical({
            version: PERMISSION_AUDIT_MANUAL_PROCEDURE_VERSION
          }),
          name: "manual-procedure",
          version: PERMISSION_AUDIT_MANUAL_PROCEDURE_VERSION
        },
        {
          configurationSha256: sdkPackageBytesSha256,
          name: "altana-sdk",
          version: "0.7.0"
        },
        {
          configurationSha256: preparationSha256,
          name: "postgresql",
          version: "17.9-host-local-staging"
        },
        {
          configurationSha256: preparationSha256,
          name: "rpc-and-explorer",
          version: finalBlockNumber
        }
      ],
      kind: "testnet",
      networkName: "BNB Smart Chain Testnet lifecycle replay",
      parameters: [
        {
          key: TERMIX_AGENT_REGISTRY_CHAIN_PARAMETER,
          value: { encoding: "decimal_integer", value: "97" }
        },
        { key: "erc8004-registry", value: { encoding: "evm_address", value: REGISTRY } },
        {
          key: "permission-audit-agent-id",
          value: { encoding: "decimal_integer", value: AGENT_ID }
        },
        {
          key: "permission-audit-agent-endpoint",
          value: { encoding: "string", value: PERMISSION_AUDIT_AGENT_ENDPOINT }
        },
        {
          key: "permission-audit-rpc-endpoint",
          value: { encoding: "string", value: PERMISSION_AUDIT_RPC_ENDPOINT }
        },
        {
          key: "authority-source-block",
          value: { encoding: "decimal_integer", value: finalBlockNumber }
        },
        {
          key: "corpus-answer-key-digest",
          value: { encoding: "string", value: answerKeySha256 }
        },
        {
          key: "run-order-randomness-commitment",
          value: { encoding: "canonical_json", value: canonicalJson(randomnessCommitment) }
        }
      ],
      softwareCommitSha: options.sourceCommitSha
    },
    qualityRubric: {
      criteria: [
        {
          criterionId: "true-positive-coverage",
          description: "Find seeded and naturally present authority, durability and retry defects.",
          evidenceRequired: "Raw report, normalized findings, corpus digest and answer-key trace.",
          maximumPoints: 35,
          measurement: "Compare normalized finding IDs and severities with the frozen answer key."
        },
        {
          criterionId: "false-positive-discipline",
          description: "Avoid claims unsupported by code, receipts, SDK evidence or policy.",
          evidenceRequired: "Finding-to-source join table and adjudication.",
          maximumPoints: 15,
          measurement: "Review every finding against exact evidence."
        },
        {
          criterionId: "impact-reproduction",
          description: "Explain impact and safe read-only reproduction.",
          evidenceRequired: "Reproduction log and source hashes.",
          maximumPoints: 15,
          measurement: "Replay each approved read-only reproduction."
        },
        {
          criterionId: "least-authority-correction",
          description: "Return a complete corrected three-layer policy.",
          evidenceRequired: "Corrected table and reviewer checklist.",
          maximumPoints: 20,
          measurement:
            "Validate target, selector, amount, expiry, claim, retry and revoke controls."
        },
        {
          criterionId: "evidence-reproducibility",
          description: "Preserve hashes, receipts, timing, costs and limitations.",
          evidenceRequired: "Raw/canonical output, receipt joins and verification log.",
          maximumPoints: 15,
          measurement: "Second-review the complete source joins and deterministic output."
        }
      ],
      declaredAtUtc: "2026-08-11T18:22:25.921Z",
      rubricId: "termix-permission-audit-rubric-v1",
      totalMaximumPoints: 100,
      version: "1.0.0"
    },
    requiredReceiptKinds: ["api", "transaction"]
  });
  const normalizedDeclaration = normalizeBenchmarkDeclaration(declaration);
  const declarationSha256 = sha256Bytes(canonicalJson(normalizedDeclaration));
  const declarationArtifact = {
    schemaVersion: "proofera-termix-frozen-declaration-v1.0.0",
    answerKey: {
      access: "reviewer-held local file; not supplied to either timed lane",
      sha256: answerKeySha256
    },
    claims: {
      agentRun: false,
      hired: true,
      manualRun: false,
      result: false,
      runOrderResolved: false
    },
    declaration: normalizedDeclaration,
    declarationSha256,
    hireEvidence: { path: HIRE_PATH, sha256: hireInput.sha256 },
    input: { path: bundlePath, sha256: bundleSha256 },
    preparation: { path: preparationPath, sha256: preparationSha256 },
    randomnessCommitment,
    registeredAgent: { agentId: AGENT_ID, chainId: 97, registryAddress: REGISTRY },
    sourceCommitSha: options.sourceCommitSha,
    state: "frozen-awaiting-randomness-and-runs"
  };
  const localAnswerRoot = process.env.LOCALAPPDATA;
  if (typeof localAnswerRoot !== "string" || localAnswerRoot.length === 0) {
    fail("TERMIX_PERMISSION_FREEZE_ANSWER_KEY_PATH_UNAVAILABLE");
  }
  const answerKeyPath = resolve(
    localAnswerRoot,
    ...ANSWER_KEY_DIRECTORY.split("/"),
    `${bundleSha256}.canonical-json`
  );
  const absolutePreparationPath = resolve(ROOT, ...preparationPath.split("/"));
  const absoluteBundlePath = resolve(ROOT, ...bundlePath.split("/"));
  const absoluteDeclarationPath = resolve(ROOT, ...declarationPath.split("/"));
  await Promise.all([
    ensureAbsent(absolutePreparationPath),
    ensureAbsent(absoluteBundlePath),
    ensureAbsent(absoluteDeclarationPath),
    ensureAbsent(answerKeyPath)
  ]);
  await writeExclusive(absolutePreparationPath, preparationBody);
  await writeExclusive(absoluteBundlePath, `${bundleCanonicalJson}\n`);
  await writeExclusive(
    absoluteDeclarationPath,
    await format(JSON.stringify(declarationArtifact), JSON_FORMAT_OPTIONS)
  );
  await writeExclusive(answerKeyPath, `${answerKeyCanonicalJson}\n`);
  process.stdout.write(
    `${preparationPath}\n${bundlePath}\n${declarationPath}\nanswer-key-sha256:${answerKeySha256}\n`
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : error instanceof Error
        ? error.constructor.name
        : "Error";
  process.stderr.write(`TermiX permission audit freeze failed: ${message}\n`);
  process.exitCode = 1;
});
