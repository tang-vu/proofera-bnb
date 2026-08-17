import { execFileSync } from "node:child_process";
import { open, readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BenchmarkDeclarationSchema,
  PANCAKE_LP_AGENT_ENDPOINT,
  PANCAKE_LP_AGENT_LANE_CONFIGURATION_SHA256,
  PANCAKE_LP_MANUAL_PROCEDURE_VERSION,
  PANCAKE_LP_SOURCE_RPC_ENDPOINT,
  PancakeLpInputBundleSchema,
  TERMIX_AGENT_REGISTRY_CHAIN_PARAMETER,
  canonicalJson,
  normalizeBenchmarkDeclaration,
  sha256Bytes,
  sha256Canonical
} from "../packages/benchmarks/src/index";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = "evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json";
const OUTPUT_DIRECTORY = "evidence/termix/declarations/pancake-lp";
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const AGENT_ID = "1825";
const MAXIMUM_GIT_OUTPUT_BYTES = 4_000_000;

interface Options {
  readonly sourceCommitSha: string;
  readonly randomnessBlock: string;
}

function parseArguments(args: readonly string[]): Options {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (
    normalized.length !== 5 ||
    normalized[0] !== "--freeze-exact-pancake-lp-declaration" ||
    normalized[1] !== "--source-commit" ||
    normalized[3] !== "--randomness-block" ||
    normalized[2] === undefined ||
    normalized[4] === undefined ||
    !/^[0-9a-f]{40}$/u.test(normalized[2]) ||
    !/^[1-9][0-9]*$/u.test(normalized[4])
  ) {
    throw new Error("TERMIX_LP_FREEZE_ARGUMENTS_INVALID");
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
    throw new Error("TERMIX_LP_FREEZE_REPOSITORY_DIRTY");
  }
  const head = gitText(["rev-parse", "HEAD"]);
  if (head !== sourceCommitSha) throw new Error("TERMIX_LP_FREEZE_SOURCE_COMMIT_MISMATCH");
  if (gitText(["rev-parse", "origin/main"]) !== head) {
    throw new Error("TERMIX_LP_FREEZE_SOURCE_NOT_PUBLISHED");
  }
}

async function committedCanonicalInput(): Promise<string> {
  const absolute = resolve(ROOT, ...INPUT.split("/"));
  if ((await realpath(absolute)) !== absolute) throw new Error("TERMIX_LP_FREEZE_INPUT_UNTRUSTED");
  gitText(["ls-files", "--error-unmatch", "--", INPUT]);
  const working = await readFile(absolute);
  const committed = execFileSync("git", ["show", `HEAD:${INPUT}`], {
    cwd: ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
  if (!working.equals(committed)) throw new Error("TERMIX_LP_FREEZE_INPUT_NOT_COMMITTED");
  const text = working.toString("utf8");
  if (!text.endsWith("\n") || text.endsWith("\r\n") || text.slice(0, -1).includes("\n")) {
    throw new Error("TERMIX_LP_FREEZE_INPUT_ENCODING_INVALID");
  }
  return text.slice(0, -1);
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  verifyExactPublishedSource(options.sourceCommitSha);
  const inputCanonicalJson = await committedCanonicalInput();
  const inputSha256 = sha256Bytes(inputCanonicalJson);
  const input = PancakeLpInputBundleSchema.parse(JSON.parse(inputCanonicalJson) as unknown);
  const randomnessCommitment = {
    chainId: 97,
    blockNumber: options.randomnessBlock,
    finalityConfirmations: "12",
    mapping: "least-significant bit of the finalized block hash: 0=agent-first, 1=manual-first",
    providers: [
      "https://data-seed-prebsc-2-s2.binance.org:8545",
      "https://bsc-testnet-rpc.publicnode.com"
    ]
  };
  const declaration = BenchmarkDeclarationSchema.parse({
    benchmarkId: "pancake-lp-public-position-v2",
    task: {
      taskId: "pancake-lp-range-decision",
      title: "PancakeSwap V3 public-position range decision",
      domain: "trading",
      exactDefinition:
        "Given the immutable BNB Smart Chain mainnet public-position bundle, validate its retained identity and exact-hash slot0 replay; determine range and boundary state; then return canonical JSON with exact tick buffers, policy violations, only supplied economics, a bounded hold/review/insufficient-evidence decision, rationale and limitations. The position is unrelated to ProofEra and neither method may write onchain.",
      successCondition:
        "Both methods use identical declaration and input bytes, produce source-bound recomputable output, preserve missing economics, and make no ownership, authority, performance or execution claim from the public position."
    },
    inputs: [
      {
        inputId: "lp-range-input-bundle-sha256",
        description: "SHA-256 of the shared canonical LP input bundle.",
        value: { encoding: "string", value: inputSha256 },
        unit: null
      },
      {
        inputId: "source-evidence-sha256",
        description: "SHA-256 of the retained public-position source evidence.",
        value: { encoding: "string", value: input.sourceEvidence.sha256 },
        unit: null
      }
    ],
    constraints: [
      {
        constraintId: "bsc-mainnet-source-only",
        description: "The analyzed source state is BNB Smart Chain mainnet chain ID 56.",
        enforcement: "hard",
        expected: { encoding: "decimal_integer", value: "56" }
      },
      {
        constraintId: "bsc-testnet-agent-commerce",
        description: "ERC-8004 identity and hire commerce are isolated to BSC testnet chain ID 97.",
        enforcement: "hard",
        expected: { encoding: "decimal_integer", value: "97" }
      },
      {
        constraintId: "timed-run-no-write",
        description: "Neither method may sign, approve, submit, broadcast or access a wallet.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      },
      {
        constraintId: "public-position-non-authority",
        description: "The third-party position is never ProofEra-owned, authorized or executable.",
        enforcement: "hard",
        expected: { encoding: "canonical_json", value: "true" }
      },
      {
        constraintId: "no-hidden-source",
        description: "Only the bundle and fixed exact-hash slot0 RPC access are allowed.",
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
      kind: "mainnet",
      chainId: 56,
      networkName: "BNB Smart Chain Mainnet public-state replay",
      softwareCommitSha: options.sourceCommitSha,
      components: [
        { name: "node", version: process.version, configurationSha256: null },
        {
          name: "proofera-lp-range-agent-lane",
          version: "1.0.0",
          configurationSha256: PANCAKE_LP_AGENT_LANE_CONFIGURATION_SHA256
        },
        {
          name: "manual-procedure",
          version: PANCAKE_LP_MANUAL_PROCEDURE_VERSION,
          configurationSha256: sha256Canonical({ version: PANCAKE_LP_MANUAL_PROCEDURE_VERSION })
        },
        {
          name: "retained-pancakeswap-position",
          version: input.sourceEvidence.blockNumber,
          configurationSha256: input.sourceEvidence.sha256
        }
      ],
      parameters: [
        {
          key: TERMIX_AGENT_REGISTRY_CHAIN_PARAMETER,
          value: { encoding: "decimal_integer", value: "97" }
        },
        { key: "erc8004-registry", value: { encoding: "evm_address", value: REGISTRY } },
        { key: "lp-agent-id", value: { encoding: "decimal_integer", value: AGENT_ID } },
        {
          key: "lp-agent-endpoint",
          value: { encoding: "string", value: PANCAKE_LP_AGENT_ENDPOINT }
        },
        {
          key: "lp-source-rpc-endpoint",
          value: { encoding: "string", value: PANCAKE_LP_SOURCE_RPC_ENDPOINT }
        },
        {
          key: "source-block",
          value: { encoding: "decimal_integer", value: input.sourceEvidence.blockNumber }
        },
        {
          key: "source-block-hash",
          value: { encoding: "string", value: input.sourceEvidence.blockHash }
        },
        {
          key: "run-order-randomness-commitment",
          value: { encoding: "canonical_json", value: canonicalJson(randomnessCommitment) }
        }
      ]
    },
    qualityRubric: {
      rubricId: "termix-lp-range-rubric-v2",
      version: "2.0.0",
      declaredAtUtc: "2026-08-16T21:32:00.000Z",
      criteria: [
        {
          criterionId: "verified-inputs",
          description: "Preserve and validate exact source identity and slot0 state.",
          measurement: "Recompute the source join and exact-hash slot0 receipt.",
          evidenceRequired: "Frozen bundle, raw evidence, API receipt and trace.",
          maximumPoints: 25
        },
        {
          criterionId: "range-risk-accuracy",
          description: "Calculate exact range state, tick buffers and policy violations.",
          measurement: "Independently recompute every integer field.",
          evidenceRequired: "Raw output, canonical result and reviewer worksheet.",
          maximumPoints: 25
        },
        {
          criterionId: "economics-decision-integrity",
          description:
            "Keep absent economics unavailable and make only a supported bounded decision.",
          measurement: "Reject unsupported economics, substitutions and action recommendations.",
          evidenceRequired: "Known/unknown fields, violations, decision and trace.",
          maximumPoints: 25
        },
        {
          criterionId: "explanation-uncertainty",
          description: "Explain risk, decision, non-authority and limitations.",
          measurement: "Apply the fixed checklist to unedited output.",
          evidenceRequired: "Raw output and reviewer checklist.",
          maximumPoints: 10
        },
        {
          criterionId: "reproducibility",
          description: "Produce deterministic output, timing, cost and receipt evidence.",
          measurement: "Verify declaration parity, hashes, receipts and tool logs.",
          evidenceRequired: "Run captures, hashes, timings, costs and reproduction log.",
          maximumPoints: 15
        }
      ],
      totalMaximumPoints: 100
    },
    requiredReceiptKinds: ["api"]
  });
  const normalized = normalizeBenchmarkDeclaration(declaration);
  const declarationCanonicalJson = canonicalJson(normalized);
  const artifact = {
    schemaVersion: "proofera-termix-frozen-declaration-v1.0.0",
    state: "frozen-awaiting-randomness-and-runs",
    sourceCommitSha: options.sourceCommitSha,
    input: { path: INPUT, sha256: inputSha256 },
    registeredAgent: { chainId: 97, registryAddress: REGISTRY, agentId: AGENT_ID },
    randomnessCommitment,
    declaration: normalized,
    declarationSha256: sha256Bytes(declarationCanonicalJson),
    claims: {
      hired: false,
      runOrderResolved: false,
      agentRun: false,
      manualRun: false,
      result: false
    }
  };
  const outputPath = resolve(
    ROOT,
    OUTPUT_DIRECTORY,
    `${options.sourceCommitSha.slice(0, 12)}-${options.randomnessBlock}.json`
  );
  const handle = await open(outputPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  process.stdout.write(`${relative(ROOT, outputPath).replaceAll("\\", "/")}\n`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : error instanceof Error
        ? error.constructor.name
        : "Error";
  process.stderr.write(`TermiX LP declaration freeze failed: ${message}\n`);
  process.exitCode = 1;
});
