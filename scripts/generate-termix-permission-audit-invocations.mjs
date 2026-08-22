import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, link, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyTermixPublishedReleaseState } from "./termix-release-state.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DECLARATION_PREFIX = "evidence/termix/declarations/permission-audit/";
const INVOCATION_DIRECTORY = "evidence/termix/invocations";
const HIRE_SLUG = "autonomous-session-permission-audit";
const AGENT_ID = "1825";
const REGISTRY_SOURCE_URL =
  "https://testnet.bscscan.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e";
const PROTOCOL_VERSION = "proofera-termix-timed-runner-v1.0.0";
const MANUAL_PROCEDURE_VERSION = "proofera-termix-permission-audit-manual-v1.0.0";
const MAXIMUM_GIT_OUTPUT_BYTES = 8_000_000;

function fail(code) {
  throw new Error(code);
}

function parseArguments(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (
    normalized.length !== 9 ||
    normalized[0] !== "--generate-exact-permission-audit-invocations" ||
    normalized[1] !== "--declaration" ||
    normalized[3] !== "--source-commit" ||
    normalized[5] !== "--agent-run-id" ||
    normalized[7] !== "--manual-run-id" ||
    typeof normalized[2] !== "string" ||
    typeof normalized[4] !== "string" ||
    typeof normalized[6] !== "string" ||
    typeof normalized[8] !== "string" ||
    !normalized[2].startsWith(DECLARATION_PREFIX) ||
    !/^[A-Za-z0-9._/-]+\.json$/u.test(normalized[2]) ||
    normalized[2].includes("..") ||
    normalized[2].endsWith(".run-order.json") ||
    !/^[0-9a-f]{40}$/u.test(normalized[4]) ||
    !/^[a-z0-9][a-z0-9-]{2,99}$/u.test(normalized[6]) ||
    !/^[a-z0-9][a-z0-9-]{2,99}$/u.test(normalized[8]) ||
    normalized[6] === normalized[8]
  ) {
    fail("TERMIX_PERMISSION_INVOCATION_ARGUMENTS_INVALID");
  }
  return {
    declarationPath: normalized[2],
    sourceCommitSha: normalized[4],
    agentRunId: normalized[6],
    manualRunId: normalized[8]
  };
}

function gitBytes(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
}

function gitText(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function assertTrustedPath(absolutePath) {
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
    fail("TERMIX_PERMISSION_INVOCATION_INPUT_UNTRUSTED");
  }
}

async function readCommittedJson(repositoryPath) {
  const absolutePath = resolve(ROOT, ...repositoryPath.split("/"));
  await assertTrustedPath(absolutePath);
  gitText(["ls-files", "--error-unmatch", "--", repositoryPath]);
  const working = await readFile(absolutePath);
  const committed = gitBytes(["show", `HEAD:${repositoryPath}`]);
  if (!working.equals(committed)) fail("TERMIX_PERMISSION_INVOCATION_INPUT_NOT_COMMITTED");
  let parsed;
  try {
    parsed = JSON.parse(working.toString("utf8"));
  } catch {
    fail("TERMIX_PERMISSION_INVOCATION_INPUT_JSON_INVALID");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail("TERMIX_PERMISSION_INVOCATION_INPUT_JSON_INVALID");
  }
  return { bytes: working, value: parsed };
}

function component(declaration, name) {
  const value = declaration.environment?.components?.find((candidate) => candidate.name === name);
  if (
    typeof value?.configurationSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(value.configurationSha256)
  ) {
    fail("TERMIX_PERMISSION_INVOCATION_CONFIGURATION_INVALID");
  }
  return value;
}

async function ensureAbsent(path) {
  try {
    await access(path);
    fail("TERMIX_PERMISSION_INVOCATION_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof Error && error.message === "TERMIX_PERMISSION_INVOCATION_OUTPUT_EXISTS") {
      throw error;
    }
  }
}

async function stageExclusive(path, body) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = resolve(dirname(path), `.${randomUUID()}.partial`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${body}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return temporary;
}

async function publishPair(outputs) {
  await Promise.all(outputs.map(({ path }) => ensureAbsent(path)));
  const staged = [];
  const published = [];
  try {
    for (const output of outputs) {
      staged.push({ path: output.path, temporary: await stageExclusive(output.path, output.body) });
    }
    for (const item of staged) {
      await link(item.temporary, item.path);
      published.push(item.path);
    }
  } catch (error) {
    await Promise.all(published.map((path) => unlink(path).catch(() => undefined)));
    throw error;
  } finally {
    await Promise.all(staged.map(({ temporary }) => unlink(temporary).catch(() => undefined)));
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  verifyTermixPublishedReleaseState({
    repositoryRoot: ROOT,
    sourceCommitSha: options.sourceCommitSha,
    protectedPaths: [
      "package.json",
      "pnpm-lock.yaml",
      "packages/benchmarks/src",
      "agents/lpRangeAgent/app/agent/src/permissionAudit.ts",
      "scripts/generate-termix-permission-audit-invocations.mjs",
      "scripts/run-termix-permission-audit-agent.ts",
      "scripts/run-termix-permission-audit-manual.ts",
      "scripts/termix-release-state.mjs",
      "scripts/termix-typescript-loader.mjs"
    ],
    errorPrefix: "TERMIX_PERMISSION_INVOCATION"
  });
  const runOrderPath = options.declarationPath.replace(/\.json$/u, ".run-order.json");
  const declarationInput = await readCommittedJson(options.declarationPath);
  const orderInput = await readCommittedJson(runOrderPath);
  const frozen = declarationInput.value;
  const order = orderInput.value;
  if (
    frozen.schemaVersion !== "proofera-termix-frozen-declaration-v1.0.0" ||
    frozen.sourceCommitSha !== options.sourceCommitSha ||
    frozen.registeredAgent?.chainId !== 97 ||
    frozen.registeredAgent?.agentId !== AGENT_ID ||
    frozen.declaration?.task?.taskId !== HIRE_SLUG ||
    frozen.claims?.hired !== true ||
    frozen.claims?.agentRun !== false ||
    frozen.claims?.manualRun !== false ||
    typeof frozen.declarationSha256 !== "string" ||
    sha256(canonicalJson(frozen.declaration)) !== frozen.declarationSha256 ||
    typeof frozen.input?.path !== "string" ||
    typeof frozen.input?.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(frozen.input.sha256)
  ) {
    fail("TERMIX_PERMISSION_INVOCATION_DECLARATION_INVALID");
  }
  if (
    order.state !== "resolved" ||
    order.declaration?.path !== options.declarationPath ||
    order.declaration?.sha256 !== frozen.declarationSha256 ||
    order.declaration?.sourceCommitSha !== options.sourceCommitSha ||
    !Array.isArray(order.randomness?.runOrder) ||
    !["agent,manual", "manual,agent"].includes(order.randomness.runOrder.join(",")) ||
    order.claims?.agentRun !== false ||
    order.claims?.manualRun !== false ||
    order.claims?.result !== false
  ) {
    fail("TERMIX_PERMISSION_INVOCATION_ORDER_INVALID");
  }
  const hirePath = frozen.hireEvidence?.path;
  if (typeof hirePath !== "string" || !hirePath.startsWith("evidence/termix/hire-receipts/")) {
    fail("TERMIX_PERMISSION_INVOCATION_HIRE_INVALID");
  }
  const hireInput = await readCommittedJson(hirePath);
  if (sha256(hireInput.bytes) !== frozen.hireEvidence.sha256) {
    fail("TERMIX_PERMISSION_INVOCATION_HIRE_INVALID");
  }
  const hire = hireInput.value.hires?.find((candidate) => candidate.slug === HIRE_SLUG);
  if (
    hire?.agentId !== AGENT_ID ||
    hire.termixHireReceipt?.state !== "verified" ||
    hire.termixHireReceipt?.chainId !== 97
  ) {
    fail("TERMIX_PERMISSION_INVOCATION_HIRE_INVALID");
  }
  const agentComponent = component(frozen.declaration, "proofera-security-auditor");
  component(frozen.declaration, "manual-procedure");
  const common = {
    protocolVersion: PROTOCOL_VERSION,
    declaration: frozen.declaration,
    declarationSha256: frozen.declarationSha256,
    sourceCommitSha: options.sourceCommitSha,
    repositoryClean: true
  };
  const agentRequest = {
    ...common,
    runId: options.agentRunId,
    runnerId: "permission-audit-agent-v1",
    method: {
      kind: "agent",
      label: "Registered ProofEra Security Auditor",
      marketplace: "ProofEra",
      runtime: "self-hosted TypeScript A2A analyzer",
      configurationSha256: agentComponent.configurationSha256,
      agentReference: {
        state: "registered",
        standard: "ERC-8004",
        chainId: frozen.registeredAgent.chainId,
        registryAddress: frozen.registeredAgent.registryAddress,
        agentId: frozen.registeredAgent.agentId,
        registrySourceUrl: REGISTRY_SOURCE_URL
      }
    },
    hireReceipt: hire.termixHireReceipt
  };
  const manualRequest = {
    ...common,
    runId: options.manualRunId,
    runnerId: "permission-audit-manual-v1",
    method: {
      kind: "manual",
      label: "Independent bounded permission-audit worksheet",
      operatorRole: "Repository owner using the bounded no-agent security worksheet",
      procedureVersion: MANUAL_PROCEDURE_VERSION,
      tools: [
        { name: "human-reviewed-canonical-json-worksheet", version: "1.0.0" },
        { name: "node-sha256", version: "node-crypto" },
        { name: "publicnode-bsc-testnet-json-rpc", version: "eth-json-rpc" }
      ]
    },
    hireReceipt: null
  };
  const invocationRoot = resolve(ROOT, ...INVOCATION_DIRECTORY.split("/"));
  const agentPath = resolve(invocationRoot, `${options.agentRunId}.canonical-json`);
  const manualPath = resolve(invocationRoot, `${options.manualRunId}.canonical-json`);
  await publishPair([
    {
      path: agentPath,
      body: canonicalJson({ bundleSha256: frozen.input.sha256, timedRunRequest: agentRequest })
    },
    {
      path: manualPath,
      body: canonicalJson({ bundleSha256: frozen.input.sha256, timedRunRequest: manualRequest })
    }
  ]);
  process.stdout.write(
    `${relative(ROOT, agentPath).replaceAll("\\", "/")}\n${relative(ROOT, manualPath).replaceAll("\\", "/")}\n`
  );
}

main().catch((error) => {
  const message =
    error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : error instanceof Error
        ? error.constructor.name
        : "Error";
  process.stderr.write(`TermiX permission-audit invocation generation failed: ${message}\n`);
  process.exitCode = 1;
});
