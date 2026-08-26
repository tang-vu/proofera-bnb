import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXECUTE_FLAG = "--generate-exact-termix-reviewer-packet-v4";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const V1_PATH = "evidence/termix/reviewer-packets/20260822-v1/manifest.json";
const SUPERSEDED_PATH = "evidence/termix/reviewer-packets/20260826-v3/manifest.json";
const OUTPUT_DIRECTORY = "evidence/termix/reviewer-packets/20260826-v4";
const OUTPUT_PATH = `${OUTPUT_DIRECTORY}/manifest.json`;
const REVIEW_RECORD_PATH = "evidence/termix/reviews/independent/20260826-v4.json";
const CONTRACT_PATHS = Object.freeze([
  "packages/benchmarks/src/canonical.ts",
  "packages/benchmarks/src/schemas.ts",
  "packages/benchmarks/src/pair.ts",
  "packages/benchmarks/src/independentReview.ts",
  "packages/benchmarks/src/protectedFinalReport.ts",
  "scripts/compile-termix-protected-final-evidence.ts",
  "scripts/materialize-termix-independent-review.ts",
  "scripts/termix-typescript-loader.mjs"
]);
const MAXIMUM_GIT_OUTPUT_BYTES = 10_000_000;

function fail(code) {
  throw new Error(code);
}

function exactArguments(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (
    normalized.length !== 3 ||
    normalized[0] !== EXECUTE_FLAG ||
    normalized[1] !== SOURCE_COMMIT_ARGUMENT ||
    !/^[0-9a-f]{40}$/u.test(normalized[2] ?? "")
  ) {
    fail("TERMIX_REVIEW_PACKET_V4_EXACT_INVOCATION_REQUIRED");
  }
  return normalized[2];
}

function gitText(args) {
  return execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function verifyRelease(sourceCommit) {
  if (gitText(["rev-parse", "HEAD"]) !== sourceCommit)
    fail("TERMIX_REVIEW_PACKET_V4_HEAD_MISMATCH");
  if (gitText(["rev-parse", "origin/main"]) !== sourceCommit) {
    fail("TERMIX_REVIEW_PACKET_V4_RELEASE_NOT_PUBLISHED");
  }
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("TERMIX_REVIEW_PACKET_V4_WORKTREE_DIRTY");
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exactTrackedBytes(path) {
  const bytes = await readFile(resolve(REPOSITORY_ROOT, ...path.split("/")));
  const committed = execFileSync("git", ["show", `HEAD:${path}`], {
    cwd: REPOSITORY_ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
  if (!bytes.equals(committed)) fail("TERMIX_REVIEW_PACKET_V4_INPUT_NOT_EXACT_HEAD");
  return bytes;
}

async function pathDoesNotExist(path) {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

function assertV1Task(task) {
  if (
    typeof task?.taskId !== "string" ||
    typeof task?.pairId !== "string" ||
    typeof task?.inputPairPath !== "string" ||
    typeof task?.inputPairBytesSha256 !== "string" ||
    typeof task?.inputPairLogicalSha256 !== "string" ||
    typeof task?.declarationSha256 !== "string" ||
    typeof task?.selfReviewPath !== "string" ||
    typeof task?.selfReviewBytesSha256 !== "string" ||
    !Array.isArray(task?.evidence)
  ) {
    fail("TERMIX_REVIEW_PACKET_V1_TASK_INVALID");
  }
}

export async function buildPacketV4(sourceCommit) {
  const v1Bytes = await exactTrackedBytes(V1_PATH);
  const supersededBytes = await exactTrackedBytes(SUPERSEDED_PATH);
  let v1;
  try {
    v1 = JSON.parse(v1Bytes.toString("utf8"));
  } catch {
    fail("TERMIX_REVIEW_PACKET_V1_JSON_INVALID");
  }
  if (!Array.isArray(v1?.tasks) || v1.tasks.length !== 3) {
    fail("TERMIX_REVIEW_PACKET_V1_INVALID");
  }
  const runtimeFiles = await Promise.all(
    CONTRACT_PATHS.map(async (path) => ({ path, sha256: sha256(await exactTrackedBytes(path)) }))
  );
  const tasks = v1.tasks.map((task) => {
    assertV1Task(task);
    const originalOutput = task.reviewerMustProduce?.verifiedPairPath;
    const originalAdjudication = task.reviewerMustProduce?.adjudicationPath;
    if (
      typeof originalOutput !== "string" ||
      !originalOutput.startsWith("evidence/termix/pairs/") ||
      typeof originalAdjudication !== "string"
    ) {
      fail("TERMIX_REVIEW_PACKET_V1_OUTPUT_INVALID");
    }
    return {
      taskId: task.taskId,
      pairId: task.pairId,
      inputPairPath: task.inputPairPath,
      inputPairBytesSha256: task.inputPairBytesSha256,
      inputPairLogicalSha256: task.inputPairLogicalSha256,
      declarationSha256: task.declarationSha256,
      selfReviewPath: task.selfReviewPath,
      selfReviewBytesSha256: task.selfReviewBytesSha256,
      reviewerMustProduce: {
        verifiedPairPath: originalOutput.replace(
          "evidence/termix/pairs/",
          "evidence/termix/final-pairs/"
        ),
        adjudicationPath: originalAdjudication
      },
      evidence: [
        ...task.evidence,
        {
          path: task.selfReviewPath,
          sha256: task.selfReviewBytesSha256,
          purpose:
            "Historical implementation-adjacent self-review retained only as an input to challenge, never as independent authority."
        }
      ]
    };
  });
  return {
    schemaVersion: "proofera-termix-reviewer-packet-v4.0.0",
    packetId: "termix-independent-review-20260826-v4",
    preparedAtUtc: new Date().toISOString(),
    inputPairBaseCommit: v1.pairCompilerReleaseCommit,
    state: "awaiting_independent_reviewer",
    independentReviewComplete: false,
    publishable: false,
    claimBoundary:
      "This append-only v4 packet adds runtime enforcement of optional payload digests and fixes stale provenance wording while preserving output-path and protected-transformation enforcement. It contains unverified input pairs and creates no verified claim by itself.",
    reviewContract: {
      runtimeFiles,
      reviewRecordPath: REVIEW_RECORD_PATH,
      requiredChecks: [
        "pairSchemaValidated",
        "artifactDigestsVerified",
        "receiptsReobserved",
        "rubricRecomputed",
        "rawOutputsReviewed",
        "manualNoAgentToolLogReviewed"
      ],
      verifiedPairRule:
        "The create-only materializer derives each verified pair from its exact unverified predecessor. It preserves the protected projection byte-for-byte and replaces only receipt verification, quality assessment, evidence state, and stale review-status limitations with exact reviewer-bound metadata.",
      adjudicationRule:
        "Each v4 adjudication binds the predecessor bytes/logical digest, derivative logical digest, packet bytes, review-record bytes, exact reviewer identity/time/checks, and the final compiler revalidates the protected transformation.",
      failureRule:
        "Any path mismatch, protected-field drift, stale self-review metadata, incomplete check, missing evidence, digest drift, or reviewer-binding mismatch blocks materialization and final compilation. Missing evidence cannot become verified."
    },
    tasks,
    generatedFrom: {
      sourceCommit,
      packetV1Path: V1_PATH,
      packetV1BytesSha256: sha256(v1Bytes),
      supersededPacketPath: SUPERSEDED_PATH,
      supersededPacketBytesSha256: sha256(supersededBytes),
      supersessionReason:
        "The published v3 packet was schema-valid and non-publishable, but its runtime checked only each full-file digest and did not enforce an optional payloadSha256 binding; its future adjudication purpose also retained stale v2 wording. No review record, verified pair, adjudication, or claim was created from v3."
    }
  };
}

async function main() {
  const sourceCommit = exactArguments(process.argv.slice(2));
  verifyRelease(sourceCommit);
  const packet = await buildPacketV4(sourceCommit);
  const outputDirectory = resolve(REPOSITORY_ROOT, ...OUTPUT_DIRECTORY.split("/"));
  const outputPath = resolve(REPOSITORY_ROOT, ...OUTPUT_PATH.split("/"));
  if (!(await pathDoesNotExist(outputDirectory))) fail("TERMIX_REVIEW_PACKET_V4_OUTPUT_EXISTS");
  await mkdir(outputDirectory, { recursive: false });
  const bytes = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`, "utf8");
  await writeFile(outputPath, bytes, { flag: "wx" });
  process.stdout.write(
    `${JSON.stringify({ outputPath: OUTPUT_PATH, packetSha256: sha256(bytes), sourceCommit })}\n`
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    process.stderr.write(`TermiX reviewer packet v4 generation failed: ${message}\n`);
    process.exitCode = 1;
  });
}
