import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TERMIX_FINAL_TASK_IDS,
  TermixIndependentAdjudicationSchema,
  canonicalJson,
  compileTermixFinalBundle,
  sha256Bytes,
  summarizePairedBenchmark
} from "../packages/benchmarks/src/index";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXECUTE_FLAG = "--compile-exact-termix-final-evidence";
const SOURCE_COMMIT_ARGUMENT = "--source-base-commit";
const PAIR_PREFIX = "evidence/termix/final-pairs/";
const ADJUDICATION_PREFIX = "evidence/termix/adjudications/";
const EVIDENCE_PREFIX = "evidence/termix/";
const OUTPUT_PREFIX = "evidence/submission/final/termix/";
const MAXIMUM_STDIN_BYTES = 100_000;
const MAXIMUM_ARTIFACT_BYTES = 8_000_000;
const MAXIMUM_GIT_OUTPUT_BYTES = 10_000_000;

interface SourceInvocation {
  readonly taskId: (typeof TERMIX_FINAL_TASK_IDS)[number];
  readonly pairPath: string;
  readonly adjudicationPath: string;
}

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
    fail("TERMIX_FINAL_EXACT_INVOCATION_REQUIRED");
  }
  return normalized[2];
}

async function readBoundedStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    bytes += buffer.length;
    if (bytes > MAXIMUM_STDIN_BYTES) fail("TERMIX_FINAL_STDIN_TOO_LARGE");
    chunks.push(buffer);
  }
  if (bytes === 0) fail("TERMIX_FINAL_STDIN_REQUIRED");
  return decodeUtf8(Buffer.concat(chunks), "TERMIX_FINAL_STDIN_UTF8_INVALID");
}

function parseInvocation(text: string): readonly SourceInvocation[] {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    fail("TERMIX_FINAL_STDIN_JSON_INVALID");
  }
  if (canonicalJson(value) !== text) fail("TERMIX_FINAL_STDIN_NOT_CANONICAL");
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("TERMIX_FINAL_STDIN_SHAPE_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).join(",") !== "sources" || !Array.isArray(record.sources)) {
    fail("TERMIX_FINAL_STDIN_SHAPE_INVALID");
  }
  if (record.sources.length !== TERMIX_FINAL_TASK_IDS.length) {
    fail("TERMIX_FINAL_SOURCE_SET_INVALID");
  }
  const sources = record.sources.map((source): SourceInvocation => {
    if (typeof source !== "object" || source === null || Array.isArray(source)) {
      fail("TERMIX_FINAL_SOURCE_INVALID");
    }
    const fields = source as Record<string, unknown>;
    if (Object.keys(fields).sort().join(",") !== "adjudicationPath,pairPath,taskId") {
      fail("TERMIX_FINAL_SOURCE_INVALID");
    }
    if (
      typeof fields.taskId !== "string" ||
      !TERMIX_FINAL_TASK_IDS.includes(fields.taskId as (typeof TERMIX_FINAL_TASK_IDS)[number]) ||
      typeof fields.pairPath !== "string" ||
      typeof fields.adjudicationPath !== "string"
    ) {
      fail("TERMIX_FINAL_SOURCE_INVALID");
    }
    return {
      taskId: fields.taskId as (typeof TERMIX_FINAL_TASK_IDS)[number],
      pairPath: validatePath(fields.pairPath, PAIR_PREFIX),
      adjudicationPath: validatePath(fields.adjudicationPath, ADJUDICATION_PREFIX)
    };
  });
  if (new Set(sources.map(({ taskId }) => taskId)).size !== TERMIX_FINAL_TASK_IDS.length) {
    fail("TERMIX_FINAL_SOURCE_SET_INVALID");
  }
  return sources;
}

function validatePath(value: string, prefix: string): string {
  if (
    !value.startsWith(prefix) ||
    !value.endsWith(".json") ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    isAbsolute(value) ||
    !/^[A-Za-z0-9._/-]+$/u.test(value)
  ) {
    fail("TERMIX_FINAL_PATH_INVALID");
  }
  return value;
}

function gitText(args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function verifyRelease(sourceCommit: string): void {
  if (gitText(["rev-parse", "HEAD"]) !== sourceCommit) fail("TERMIX_FINAL_HEAD_MISMATCH");
  if (gitText(["rev-parse", "origin/main"]) !== sourceCommit) {
    fail("TERMIX_FINAL_RELEASE_NOT_PUBLISHED");
  }
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("TERMIX_FINAL_WORKTREE_DIRTY");
  }
}

function resolveWithinRepository(path: string): string {
  const absolute = resolve(REPOSITORY_ROOT, ...path.split("/"));
  const local = relative(REPOSITORY_ROOT, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    fail("TERMIX_FINAL_PATH_ESCAPE");
  }
  return absolute;
}

async function readExactTracked(path: string): Promise<Buffer> {
  const bytes = await readFile(resolveWithinRepository(path));
  if (bytes.length === 0 || bytes.length > MAXIMUM_ARTIFACT_BYTES) {
    fail("TERMIX_FINAL_ARTIFACT_SIZE_INVALID");
  }
  const committed = execFileSync("git", ["show", `HEAD:${path}`], {
    cwd: REPOSITORY_ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
  if (!bytes.equals(committed)) fail("TERMIX_FINAL_ARTIFACT_NOT_EXACT_HEAD");
  return bytes;
}

function parseJson(bytes: Buffer, code: string): unknown {
  try {
    return JSON.parse(decodeUtf8(bytes, code)) as unknown;
  } catch {
    fail(code);
  }
}

function decodeUtf8(bytes: Uint8Array, code: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(code);
  }
}

async function verifyAdjudicationEvidence(adjudication: {
  readonly evidence: readonly { readonly path: string; readonly sha256: string }[];
}): Promise<void> {
  for (const evidence of adjudication.evidence) {
    const path = validatePath(evidence.path, EVIDENCE_PREFIX);
    const bytes = await readExactTracked(path);
    if (sha256Bytes(bytes) !== evidence.sha256) fail("TERMIX_FINAL_REVIEW_EVIDENCE_DRIFT");
  }
}

async function buildSources(sources: readonly SourceInvocation[]) {
  return Promise.all(
    sources.map(async (source) => {
      const pairBytes = await readExactTracked(source.pairPath);
      const pair = parseJson(pairBytes, "TERMIX_FINAL_PAIR_JSON_INVALID");
      const summary = summarizePairedBenchmark(pair);
      if (typeof pair !== "object" || pair === null || Array.isArray(pair)) {
        fail("TERMIX_FINAL_PAIR_INVALID");
      }
      const pairRecord = pair as {
        readonly agentRun: {
          readonly runId: string;
          readonly declaration: { readonly task: { readonly taskId: string } };
        };
        readonly manualRun: { readonly runId: string };
      };
      if (pairRecord.agentRun.declaration.task.taskId !== source.taskId) {
        fail("TERMIX_FINAL_PAIR_TASK_MISMATCH");
      }

      const adjudicationBytes = await readExactTracked(source.adjudicationPath);
      const adjudication = TermixIndependentAdjudicationSchema.parse(
        parseJson(adjudicationBytes, "TERMIX_FINAL_ADJUDICATION_JSON_INVALID")
      );
      await verifyAdjudicationEvidence(adjudication);

      return {
        taskId: source.taskId,
        pairPath: source.pairPath,
        pairBytesSha256: sha256Bytes(pairBytes),
        agentRunId: pairRecord.agentRun.runId,
        manualRunId: pairRecord.manualRun.runId,
        summary,
        adjudicationPath: source.adjudicationPath,
        adjudicationBytesSha256: sha256Bytes(adjudicationBytes),
        adjudication
      };
    })
  );
}

async function writeFinalArtifacts(
  sourceCommit: string,
  bundle: ReturnType<typeof compileTermixFinalBundle>
) {
  const directory = resolveWithinRepository(`${OUTPUT_PREFIX}${sourceCommit}`);
  await mkdir(directory, { recursive: true });
  const outputs = [
    { name: "paired-report.json", value: bundle.pairedReport },
    { name: "raw-runs.json", value: bundle.rawRuns },
    { name: "adjudication.json", value: bundle.adjudication }
  ] as const;
  const result = [];
  for (const output of outputs) {
    const bytes = `${canonicalJson(output.value)}\n`;
    const path = resolve(directory, output.name);
    await writeFile(path, bytes, { encoding: "utf8", flag: "wx" });
    result.push({
      path: `${OUTPUT_PREFIX}${sourceCommit}/${output.name}`,
      sha256: createHash("sha256").update(bytes, "utf8").digest("hex")
    });
  }
  return result;
}

async function main(): Promise<void> {
  const sourceCommit = exactArguments(process.argv.slice(2));
  const stdin = await readBoundedStdin();
  const invocation = parseInvocation(stdin);
  verifyRelease(sourceCommit);
  const sources = await buildSources(invocation);
  const bundle = compileTermixFinalBundle({
    compiledAtUtc: new Date().toISOString(),
    sourceCommitSha: sourceCommit,
    invocationSha256: sha256Bytes(stdin),
    sources
  });
  const outputs = await writeFinalArtifacts(sourceCommit, bundle);
  process.stdout.write(`${canonicalJson({ outputs, sourceCommit })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  process.stderr.write(`TermiX final evidence compiler failed: ${message}\n`);
  process.exitCode = 1;
});
