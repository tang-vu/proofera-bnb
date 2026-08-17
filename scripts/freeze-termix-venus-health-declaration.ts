import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, link, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BenchmarkDeclarationSchema,
  TERMIX_AGENT_REGISTRY_CHAIN_PARAMETER,
  VENUS_HEALTH_AGENT_ENDPOINT,
  VENUS_HEALTH_AGENT_LANE_CONFIGURATION_SHA256,
  VENUS_HEALTH_MANUAL_PROCEDURE_VERSION,
  canonicalJson,
  normalizeBenchmarkDeclaration,
  sha256Bytes,
  sha256Canonical
} from "../packages/benchmarks/src/index";
import { buildHealthFactorInputFromExactWindow } from "../agents/healthFactorGuardianAgent/app/agent/src/venusExactWindow";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WINDOW_MANIFEST =
  "evidence/development/venus-core-exact-window-125563831-125564152-9d4fbf6b.json";
const SELECTION_ARTIFACT = "evidence/development/venus-core-exact-block-125469553-9d4fbf6b.json";
const REQUEST_DIRECTORY = "evidence/termix/frozen/venus-health";
const DECLARATION_DIRECTORY = "evidence/termix/declarations/venus-health";
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const AGENT_ID = "1828";
const MAXIMUM_GIT_OUTPUT_BYTES = 6_000_000;
const PROVIDERS = Object.freeze([
  "https://data-seed-prebsc-2-s2.binance.org:8545",
  "https://bsc-testnet-rpc.publicnode.com"
]);

interface Options {
  readonly sourceCommitSha: string;
  readonly randomnessBlock: string;
}

interface WindowManifest {
  readonly schemaVersion: string;
  readonly status: string;
  readonly publishable: boolean;
  readonly termixRunStatus: string;
  readonly sourceCommit: string;
  readonly sourceCommitClean: boolean;
  readonly capturedAtUtc: string;
  readonly evidenceWindow: readonly unknown[];
  readonly captureArtifacts: readonly {
    readonly blockNumber: string;
    readonly blockHash: string;
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
}

function parseArguments(args: readonly string[]): Options {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (
    normalized.length !== 5 ||
    normalized[0] !== "--freeze-exact-venus-health-declaration" ||
    normalized[1] !== "--source-commit" ||
    normalized[3] !== "--randomness-block" ||
    normalized[2] === undefined ||
    normalized[4] === undefined ||
    !/^[0-9a-f]{40}$/u.test(normalized[2]) ||
    !/^[1-9][0-9]*$/u.test(normalized[4])
  ) {
    throw new Error("TERMIX_VENUS_FREEZE_ARGUMENTS_INVALID");
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

function verifyExactPublishedSource(sourceCommitSha: string): void {
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("TERMIX_VENUS_FREEZE_REPOSITORY_DIRTY");
  }
  if (gitText(["rev-parse", "HEAD"]) !== sourceCommitSha) {
    throw new Error("TERMIX_VENUS_FREEZE_SOURCE_COMMIT_MISMATCH");
  }
  if (gitText(["rev-parse", "origin/main"]) !== sourceCommitSha) {
    throw new Error("TERMIX_VENUS_FREEZE_SOURCE_NOT_PUBLISHED");
  }
}

async function committedBytes(path: string): Promise<Buffer> {
  const absolute = resolve(ROOT, ...path.split("/"));
  if ((await realpath(absolute)) !== absolute) {
    throw new Error("TERMIX_VENUS_FREEZE_INPUT_UNTRUSTED");
  }
  gitText(["ls-files", "--error-unmatch", "--", path]);
  const working = await readFile(absolute);
  const committed = execFileSync("git", ["show", `HEAD:${path}`], {
    cwd: ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
  if (!working.equals(committed)) throw new Error("TERMIX_VENUS_FREEZE_INPUT_NOT_COMMITTED");
  return working;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function loadWindow(): Promise<{
  readonly manifest: WindowManifest;
  readonly manifestSha256: string;
  readonly captureDigests: readonly string[];
}> {
  const manifestBytes = await committedBytes(WINDOW_MANIFEST);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as WindowManifest;
  if (
    manifest.schemaVersion !== "proofera-termix-venus-development-window-v1.1.0" ||
    manifest.status !== "DEVELOPMENT_READ_ONLY" ||
    manifest.publishable !== false ||
    manifest.termixRunStatus !== "NOT_RUN" ||
    manifest.sourceCommitClean !== true ||
    !/^[0-9a-f]{40}$/u.test(manifest.sourceCommit) ||
    Number.isNaN(Date.parse(manifest.capturedAtUtc)) ||
    manifest.evidenceWindow.length !== 3 ||
    manifest.captureArtifacts.length !== 3
  ) {
    throw new Error("TERMIX_VENUS_FREEZE_WINDOW_INVALID");
  }
  const captureDigests: string[] = [];
  for (const [index, reference] of manifest.captureArtifacts.entries()) {
    if (
      !reference.path.startsWith("evidence/development/venus-core-exact-window-") ||
      !reference.path.endsWith(`.block-${reference.blockNumber}.json`) ||
      !/^[0-9a-f]{64}$/u.test(reference.sha256) ||
      !Number.isSafeInteger(reference.bytes) ||
      reference.bytes <= 0 ||
      reference.bytes >= 1_000_000
    ) {
      throw new Error("TERMIX_VENUS_FREEZE_CAPTURE_REFERENCE_INVALID");
    }
    const bytes = await committedBytes(reference.path);
    if (bytes.byteLength !== reference.bytes || sha256(bytes) !== reference.sha256) {
      throw new Error("TERMIX_VENUS_FREEZE_CAPTURE_DIGEST_MISMATCH");
    }
    const evidence = manifest.evidenceWindow[index] as
      { blockNumber?: unknown; blockHash?: unknown } | undefined;
    if (
      evidence?.blockNumber !== reference.blockNumber ||
      evidence.blockHash !== reference.blockHash
    ) {
      throw new Error("TERMIX_VENUS_FREEZE_CAPTURE_JOIN_MISMATCH");
    }
    captureDigests.push(reference.sha256);
  }
  return { manifest, manifestSha256: sha256(manifestBytes), captureDigests };
}

async function loadSelection(): Promise<{
  readonly sha256: string;
  readonly selectedAtUtc: string;
  readonly account: string;
}> {
  const bytes = await committedBytes(SELECTION_ARTIFACT);
  const artifact = JSON.parse(bytes.toString("utf8")) as {
    status?: unknown;
    publishable?: unknown;
    termixRunStatus?: unknown;
    capturedAtUtc?: unknown;
    evidence?: { account?: unknown };
  };
  if (
    artifact.status !== "DEVELOPMENT_READ_ONLY" ||
    artifact.publishable !== false ||
    artifact.termixRunStatus !== "NOT_RUN" ||
    typeof artifact.capturedAtUtc !== "string" ||
    Number.isNaN(Date.parse(artifact.capturedAtUtc)) ||
    typeof artifact.evidence?.account !== "string"
  ) {
    throw new Error("TERMIX_VENUS_FREEZE_SELECTION_INVALID");
  }
  return {
    sha256: sha256(bytes),
    selectedAtUtc: artifact.capturedAtUtc,
    account: artifact.evidence.account
  };
}

async function ensureAbsent(path: string): Promise<void> {
  try {
    await access(path);
    throw new Error("TERMIX_VENUS_FREEZE_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof Error && error.message === "TERMIX_VENUS_FREEZE_OUTPUT_EXISTS") {
      throw error;
    }
  }
}

async function writeCreateOnly(path: string, body: string): Promise<void> {
  const temporary = resolve(dirname(path), `.${randomUUID()}.partial`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(body, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  verifyExactPublishedSource(options.sourceCommitSha);
  const [{ manifest, manifestSha256, captureDigests }, selection] = await Promise.all([
    loadWindow(),
    loadSelection()
  ]);
  const first = manifest.evidenceWindow[0] as {
    blockNumber?: unknown;
    blockTimestampUtc?: unknown;
  };
  const last = manifest.evidenceWindow.at(-1) as
    { blockNumber?: unknown; blockTimestampUtc?: unknown } | undefined;
  if (
    typeof first.blockNumber !== "string" ||
    typeof first.blockTimestampUtc !== "string" ||
    typeof last?.blockNumber !== "string" ||
    typeof last.blockTimestampUtc !== "string" ||
    Date.parse(selection.selectedAtUtc) > Date.parse(first.blockTimestampUtc) ||
    selection.account.toLowerCase() !==
      String((manifest.evidenceWindow[0] as { account?: unknown }).account).toLowerCase()
  ) {
    throw new Error("TERMIX_VENUS_FREEZE_SELECTION_WINDOW_MISMATCH");
  }
  const policy = {
    healthFactorScaleDecimals: 18,
    alertHealthFactorRaw: "1500000000000000000",
    interventionHealthFactorRaw: "1100000000000000000",
    maximumCurrentEvidenceAgeSeconds: 300,
    maximumObservationAgeSeconds: 3_600,
    futureToleranceSeconds: 30,
    minimumHistoryObservations: 3,
    minimumObservationWindowSeconds: 120,
    maximumAlertLatencySeconds: 60,
    minimumAlertReceipts: 0,
    configuredAtUtc: "2026-08-17T07:00:00.000Z",
    source: { kind: "caller" as const, reference: "Frozen TermiX Venus policy v1" }
  };
  const built = buildHealthFactorInputFromExactWindow({
    evidenceWindow: manifest.evidenceWindow,
    analysisAtUtc: manifest.capturedAtUtc,
    policy,
    accountAuthorization: {
      state: "public_testnet_replay_non_authority",
      account: selection.account,
      selectedAtUtc: selection.selectedAtUtc,
      selectionArtifactSha256: selection.sha256,
      reference: SELECTION_ARTIFACT,
      ownershipClaimed: false,
      executionAuthorityClaimed: false
    }
  });
  const requestCanonicalJson = canonicalJson({
    skill: "analyze_venus_health_factor",
    ...built.input
  });
  const requestSha256 = sha256Bytes(requestCanonicalJson);
  const randomnessCommitment = {
    chainId: 97,
    blockNumber: options.randomnessBlock,
    finalityConfirmations: "12",
    mapping: "least-significant bit of the finalized block hash: 0=agent-first, 1=manual-first",
    providers: PROVIDERS
  };
  const declaration = BenchmarkDeclarationSchema.parse({
    benchmarkId: "venus-health-public-replay-v1",
    task: {
      taskId: "venus-health-factor-decision",
      title: "Venus public replay health-factor decision",
      domain: "lending",
      exactDefinition:
        "Given one frozen BNB Smart Chain testnet Venus public-account evidence bundle and ordered exact-block window, recompute integer health factors, identify threshold state and minimum health factor, and return a bounded read-only decision with explicit uncertainty. Neither method may sign or broadcast.",
      successCondition:
        "Both methods use byte-identical request and source artifacts, reproduce every integer result, preserve non-authority and return a supported hold, monitor, review-intervention or insufficient-evidence decision without a wallet or write."
    },
    inputs: [
      {
        inputId: "health-factor-request-sha256",
        description: "SHA-256 of the canonical Health Guardian request supplied to both methods.",
        value: { encoding: "string", value: requestSha256 },
        unit: null
      },
      {
        inputId: "venus-window-manifest-sha256",
        description: "SHA-256 of the retained three-observation Venus window manifest.",
        value: { encoding: "string", value: manifestSha256 },
        unit: null
      },
      {
        inputId: "venus-window-capture-sha256-list",
        description: "Ordered SHA-256 list for the three raw two-provider capture artifacts.",
        value: { encoding: "canonical_json", value: canonicalJson(captureDigests) },
        unit: null
      },
      {
        inputId: "public-replay-selection-sha256",
        description:
          "SHA-256 of the prior public replay selection artifact; it grants no authority.",
        value: { encoding: "string", value: selection.sha256 },
        unit: null
      }
    ],
    constraints: [
      {
        constraintId: "bsc-testnet-only",
        description:
          "The replay evidence and agent commerce use BNB Smart Chain testnet chain ID 97.",
        enforcement: "hard",
        expected: { encoding: "decimal_integer", value: "97" }
      },
      {
        constraintId: "timed-run-no-write",
        description:
          "Neither method may sign, approve, repay, transfer, submit, broadcast or access a wallet.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      },
      {
        constraintId: "public-account-non-authority",
        description:
          "The public replay account is unrelated and grants no ownership or execution authority.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      },
      {
        constraintId: "integer-health-factor",
        description:
          "All financial calculations use declared integer scales without floating point.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      },
      {
        constraintId: "fixed-source-window",
        description:
          "No source refresh, fallback or undeclared network access may replace the frozen window.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      },
      {
        constraintId: "decision-window",
        description: "Finish within 900 seconds; overruns remain recorded and lose timing credit.",
        enforcement: "scored",
        expected: { encoding: "decimal_integer", value: "900" }
      }
    ],
    environment: {
      kind: "testnet",
      chainId: 97,
      networkName: "BNB Smart Chain Testnet public-state replay",
      softwareCommitSha: options.sourceCommitSha,
      components: [
        { name: "node", version: process.version, configurationSha256: null },
        {
          name: "proofera-health-factor-guardian",
          version: "1.3.0",
          configurationSha256: VENUS_HEALTH_AGENT_LANE_CONFIGURATION_SHA256
        },
        {
          name: "manual-procedure",
          version: VENUS_HEALTH_MANUAL_PROCEDURE_VERSION,
          configurationSha256: sha256Canonical({
            version: VENUS_HEALTH_MANUAL_PROCEDURE_VERSION
          })
        },
        {
          name: "venus-window",
          version: `${first.blockNumber}-${last.blockNumber}`,
          configurationSha256: manifestSha256
        }
      ],
      parameters: [
        {
          key: TERMIX_AGENT_REGISTRY_CHAIN_PARAMETER,
          value: { encoding: "decimal_integer", value: "97" }
        },
        { key: "erc8004-registry", value: { encoding: "evm_address", value: REGISTRY } },
        { key: "health-agent-id", value: { encoding: "decimal_integer", value: AGENT_ID } },
        {
          key: "health-agent-endpoint",
          value: { encoding: "string", value: VENUS_HEALTH_AGENT_ENDPOINT }
        },
        { key: "account-address", value: { encoding: "evm_address", value: selection.account } },
        {
          key: "first-source-block",
          value: { encoding: "decimal_integer", value: first.blockNumber }
        },
        {
          key: "last-source-block",
          value: { encoding: "decimal_integer", value: last.blockNumber }
        },
        {
          key: "run-order-randomness-commitment",
          value: { encoding: "canonical_json", value: canonicalJson(randomnessCommitment) }
        }
      ]
    },
    qualityRubric: {
      rubricId: "termix-venus-health-rubric-v1",
      version: "1.0.0",
      declaredAtUtc: "2026-08-11T18:22:25.921Z",
      criteria: [
        {
          criterionId: "state-and-calculation",
          description:
            "Validate sources and calculate collateral, debt and health factor for every observation.",
          measurement: "Recompute each integer calculation from the frozen exact-block evidence.",
          evidenceRequired: "Raw state artifacts, canonical request, output and calculation trace.",
          maximumPoints: 30
        },
        {
          criterionId: "threshold-and-latency",
          description:
            "Identify threshold state, minimum health factor and reported alert-latency state.",
          measurement:
            "Compare output with the frozen ordered window and zero-internal-receipt policy.",
          evidenceRequired: "Observation window, thresholds, raw output and timing capture.",
          maximumPoints: 20
        },
        {
          criterionId: "safe-policy-compliance",
          description:
            "Choose only an allowed read-only decision and preserve every policy boundary.",
          measurement: "Validate the decision and absence of execution against the frozen policy.",
          evidenceRequired: "Policy, canonical decision, limitations and validation log.",
          maximumPoints: 25
        },
        {
          criterionId: "explanation-uncertainty",
          description: "Explain risk and missing authority without claiming guaranteed protection.",
          measurement: "Apply the fixed overclaim checklist to unedited output.",
          evidenceRequired: "Raw output and reviewer checklist.",
          maximumPoints: 10
        },
        {
          criterionId: "evidence-reproducibility",
          description: "Provide deterministic output, source joins, complete timing and costs.",
          measurement: "Second reviewer checks every hash, API receipt and reproduction command.",
          evidenceRequired: "Run captures, hashes, timings, costs and reproduction log.",
          maximumPoints: 15
        }
      ],
      totalMaximumPoints: 100
    },
    requiredReceiptKinds: ["api"]
  });
  const normalized = normalizeBenchmarkDeclaration(declaration);
  const declarationSha256 = sha256Bytes(canonicalJson(normalized));
  const requestPath = `${REQUEST_DIRECTORY}/${options.sourceCommitSha.slice(0, 12)}-${first.blockNumber}-${last.blockNumber}.canonical-json`;
  const declarationPath = `${DECLARATION_DIRECTORY}/${options.sourceCommitSha.slice(0, 12)}-${options.randomnessBlock}.json`;
  const requestAbsolute = resolve(ROOT, ...requestPath.split("/"));
  const declarationAbsolute = resolve(ROOT, ...declarationPath.split("/"));
  await Promise.all([ensureAbsent(requestAbsolute), ensureAbsent(declarationAbsolute)]);
  const artifact = {
    schemaVersion: "proofera-termix-frozen-declaration-v1.0.0",
    state: "frozen-awaiting-randomness-and-runs",
    sourceCommitSha: options.sourceCommitSha,
    input: { path: requestPath, sha256: requestSha256 },
    sourceWindow: {
      manifestPath: WINDOW_MANIFEST,
      manifestSha256,
      captureSha256: captureDigests,
      firstBlockNumber: first.blockNumber,
      lastBlockNumber: last.blockNumber
    },
    publicReplaySelection: {
      path: SELECTION_ARTIFACT,
      sha256: selection.sha256,
      selectedAtUtc: selection.selectedAtUtc,
      ownershipClaimed: false,
      executionAuthorityClaimed: false
    },
    registeredAgent: { chainId: 97, registryAddress: REGISTRY, agentId: AGENT_ID },
    randomnessCommitment,
    declaration: normalized,
    declarationSha256,
    claims: {
      hired: false,
      runOrderResolved: false,
      agentRun: false,
      manualRun: false,
      result: false,
      intervention: false
    }
  };
  await writeCreateOnly(requestAbsolute, `${requestCanonicalJson}\n`);
  await writeCreateOnly(declarationAbsolute, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stdout.write(
    `${relative(ROOT, requestAbsolute).replaceAll("\\", "/")}\n${relative(ROOT, declarationAbsolute).replaceAll("\\", "/")}\n`
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : error instanceof Error
        ? error.constructor.name
        : "Error";
  process.stderr.write(`TermiX Venus declaration freeze failed: ${message}\n`);
  process.exitCode = 1;
});
