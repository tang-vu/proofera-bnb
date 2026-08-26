import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TERMIX_REVIEW_TASK_IDS,
  TermixProtectedIndependentAdjudicationSchema,
  TermixIndependentReviewRecordSchema,
  TermixReviewerPacketV2Schema,
  assertTermixAdjudicationBinding,
  benchmarkDeclarationSha256,
  canonicalJson,
  materializeTermixVerifiedPair,
  sha256Bytes,
  summarizePairedBenchmark
} from "../packages/benchmarks/src/index";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXECUTE_FLAG = "--materialize-exact-termix-independent-review";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const PACKET_PATH = "evidence/termix/reviewer-packets/20260826-v2/manifest.json";
const REVIEW_RECORD_PATH = "evidence/termix/reviews/independent/20260826-v2.json";
const MAXIMUM_ARTIFACT_BYTES = 8_000_000;
const MAXIMUM_GIT_OUTPUT_BYTES = 10_000_000;

function fail(code: string): never {
  throw new Error(code);
}

function exactArguments(args: readonly string[]): string {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (
    normalized.length !== 3 ||
    normalized[0] !== EXECUTE_FLAG ||
    normalized[1] !== SOURCE_COMMIT_ARGUMENT ||
    normalized[2] === undefined ||
    !/^[0-9a-f]{40}$/u.test(normalized[2])
  ) {
    fail("TERMIX_REVIEW_MATERIALIZER_EXACT_INVOCATION_REQUIRED");
  }
  return normalized[2];
}

function gitText(args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function gitIsAncestor(ancestor: string, descendant: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
}

function verifyRelease(sourceCommit: string): void {
  if (gitText(["rev-parse", "HEAD"]) !== sourceCommit) fail("TERMIX_REVIEW_HEAD_MISMATCH");
  if (gitText(["rev-parse", "origin/main"]) !== sourceCommit) {
    fail("TERMIX_REVIEW_RELEASE_NOT_PUBLISHED");
  }
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("TERMIX_REVIEW_WORKTREE_DIRTY");
  }
}

function validateRepositoryPath(path: string): string {
  if (
    path === "" ||
    path.includes("\\") ||
    path.split("/").includes("..") ||
    isAbsolute(path) ||
    !/^[A-Za-z0-9._/-]+$/u.test(path)
  ) {
    fail("TERMIX_REVIEW_PATH_INVALID");
  }
  return path;
}

function resolveWithinRepository(path: string): string {
  const absolute = resolve(REPOSITORY_ROOT, ...validateRepositoryPath(path).split("/"));
  const local = relative(REPOSITORY_ROOT, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    fail("TERMIX_REVIEW_PATH_ESCAPE");
  }
  return absolute;
}

async function readExactTracked(path: string): Promise<Buffer> {
  const bytes = await readFile(resolveWithinRepository(path));
  if (bytes.length === 0 || bytes.length > MAXIMUM_ARTIFACT_BYTES) {
    fail("TERMIX_REVIEW_ARTIFACT_SIZE_INVALID");
  }
  const committed = execFileSync("git", ["show", `HEAD:${path}`], {
    cwd: REPOSITORY_ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
  if (!bytes.equals(committed)) fail("TERMIX_REVIEW_ARTIFACT_NOT_EXACT_HEAD");
  return bytes;
}

function parseJson(bytes: Buffer, code: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    fail(code);
  }
}

async function pathDoesNotExist(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return true;
    }
    throw error;
  }
}

async function verifyContract(packet: ReturnType<typeof TermixReviewerPacketV2Schema.parse>) {
  for (const runtimeFile of packet.reviewContract.runtimeFiles) {
    if (sha256Bytes(await readExactTracked(runtimeFile.path)) !== runtimeFile.sha256) {
      fail("TERMIX_REVIEW_CONTRACT_DRIFT");
    }
  }
}

function sameComparison(
  before: ReturnType<typeof summarizePairedBenchmark>,
  after: ReturnType<typeof summarizePairedBenchmark>
): boolean {
  return (
    canonicalJson(before.duration) === canonicalJson(after.duration) &&
    canonicalJson(before.costs) === canonicalJson(after.costs) &&
    canonicalJson(before.quality) === canonicalJson(after.quality) &&
    before.declarationSha256 === after.declarationSha256
  );
}

async function main(): Promise<void> {
  const sourceCommit = exactArguments(process.argv.slice(2));
  verifyRelease(sourceCommit);

  const packetBytes = await readExactTracked(PACKET_PATH);
  const packet = TermixReviewerPacketV2Schema.parse(
    parseJson(packetBytes, "TERMIX_REVIEW_PACKET_JSON_INVALID")
  );
  const reviewRecordBytes = await readExactTracked(REVIEW_RECORD_PATH);
  const reviewRecord = TermixIndependentReviewRecordSchema.parse(
    parseJson(reviewRecordBytes, "TERMIX_REVIEW_RECORD_JSON_INVALID")
  );
  if (
    gitText(["log", "-1", "--format=%H", "--", PACKET_PATH]) !== reviewRecord.reviewedCommit ||
    !gitIsAncestor(reviewRecord.reviewedCommit, sourceCommit) ||
    reviewRecord.packetId !== packet.packetId ||
    reviewRecord.packetPath !== PACKET_PATH ||
    reviewRecord.packetBytesSha256 !== sha256Bytes(packetBytes) ||
    packet.reviewContract.reviewRecordPath !== REVIEW_RECORD_PATH
  ) {
    fail("TERMIX_REVIEW_RECORD_PACKET_BINDING_MISMATCH");
  }
  await verifyContract(packet);

  const pending: Array<{ path: string; bytes: string }> = [];
  for (const taskId of TERMIX_REVIEW_TASK_IDS) {
    const packetTask = packet.tasks.find((task) => task.taskId === taskId);
    const reviewTask = reviewRecord.tasks.find((task) => task.taskId === taskId);
    if (
      packetTask === undefined ||
      reviewTask === undefined ||
      packetTask.pairId !== reviewTask.pairId ||
      packetTask.inputPairPath !== reviewTask.inputPairPath ||
      packetTask.inputPairBytesSha256 !== reviewTask.inputPairBytesSha256 ||
      packetTask.inputPairLogicalSha256 !== reviewTask.inputPairLogicalSha256 ||
      packetTask.declarationSha256 !== reviewTask.declarationSha256 ||
      packetTask.reviewerMustProduce.verifiedPairPath !== reviewTask.outputPairPath ||
      packetTask.reviewerMustProduce.adjudicationPath !== reviewTask.adjudicationPath ||
      canonicalJson(packetTask.evidence) !== canonicalJson(reviewTask.evidence)
    ) {
      fail("TERMIX_REVIEW_TASK_PACKET_BINDING_MISMATCH");
    }
    for (const evidence of reviewTask.evidence) {
      if (sha256Bytes(await readExactTracked(evidence.path)) !== evidence.sha256) {
        fail("TERMIX_REVIEW_EVIDENCE_DRIFT");
      }
    }

    const inputPairBytes = await readExactTracked(packetTask.inputPairPath);
    if (sha256Bytes(inputPairBytes) !== packetTask.inputPairBytesSha256) {
      fail("TERMIX_REVIEW_INPUT_PAIR_BYTES_DRIFT");
    }
    const inputPair = parseJson(inputPairBytes, "TERMIX_REVIEW_INPUT_PAIR_JSON_INVALID");
    const before = summarizePairedBenchmark(inputPair);
    if (
      before.pairId !== packetTask.pairId ||
      before.pairSha256 !== packetTask.inputPairLogicalSha256 ||
      before.declarationSha256 !== packetTask.declarationSha256 ||
      before.claimState !== "unverified" ||
      before.publishableClaim
    ) {
      fail("TERMIX_REVIEW_INPUT_PAIR_STATE_INVALID");
    }

    const verifiedPair = materializeTermixVerifiedPair(inputPair, reviewRecord, taskId);
    const after = summarizePairedBenchmark(verifiedPair);
    if (
      after.claimState !== "verified" ||
      !after.publishableClaim ||
      !sameComparison(before, after) ||
      benchmarkDeclarationSha256(verifiedPair.agentRun.declaration) !== packetTask.declarationSha256
    ) {
      fail("TERMIX_REVIEW_VERIFIED_PAIR_COMPARISON_DRIFT");
    }

    const adjudication = TermixProtectedIndependentAdjudicationSchema.parse({
      schemaVersion: "proofera-termix-adjudication-v2.0.0",
      taskId,
      pairId: verifiedPair.pairId,
      pairSha256: after.pairSha256,
      declarationSha256: after.declarationSha256,
      inputPairPath: packetTask.inputPairPath,
      inputPairBytesSha256: packetTask.inputPairBytesSha256,
      inputPairLogicalSha256: packetTask.inputPairLogicalSha256,
      packetPath: PACKET_PATH,
      packetBytesSha256: sha256Bytes(packetBytes),
      reviewRecordPath: REVIEW_RECORD_PATH,
      reviewRecordBytesSha256: sha256Bytes(reviewRecordBytes),
      reviewedAtUtc: reviewRecord.reviewedAtUtc,
      reviewer: reviewRecord.reviewer,
      checks: reviewTask.checks,
      evidence: [
        {
          path: PACKET_PATH,
          sha256: sha256Bytes(packetBytes),
          purpose: "Append-only v2 reviewer packet and protected output contract."
        },
        {
          path: REVIEW_RECORD_PATH,
          sha256: sha256Bytes(reviewRecordBytes),
          purpose: "Owner-designated independent review record with per-task recomputation."
        }
      ],
      limitations: [...reviewTask.limitations, ...reviewRecord.limitations]
    });
    assertTermixAdjudicationBinding(inputPair, verifiedPair, reviewRecord, adjudication);

    pending.push({
      path: packetTask.reviewerMustProduce.verifiedPairPath,
      bytes: `${canonicalJson(verifiedPair)}\n`
    });
    pending.push({
      path: packetTask.reviewerMustProduce.adjudicationPath,
      bytes: `${canonicalJson(adjudication)}\n`
    });
  }

  for (const output of pending) {
    if (!(await pathDoesNotExist(resolveWithinRepository(output.path)))) {
      fail("TERMIX_REVIEW_OUTPUT_EXISTS");
    }
  }
  for (const output of pending) {
    const absolute = resolveWithinRepository(output.path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, output.bytes, { encoding: "utf8", flag: "wx" });
  }
  process.stdout.write(
    `${canonicalJson({
      outputCount: pending.length,
      outputs: pending.map(({ bytes, path }) => ({
        path,
        sha256: createHash("sha256").update(bytes, "utf8").digest("hex")
      })),
      sourceCommit
    })}\n`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  process.stderr.write(`TermiX independent review materializer failed: ${message}\n`);
  process.exitCode = 1;
});
