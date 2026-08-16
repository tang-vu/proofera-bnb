import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, link, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TermixTimedRunRequestSchema,
  canonicalJson,
  runPermissionAuditManualTermixMethod,
  sha256Bytes
} from "../packages/benchmarks/src/index";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_PREFIX = "evidence/termix/frozen/permission-audit/";
const INPUT_SUFFIX = ".canonical-json";
const OUTPUT_DIRECTORY = "evidence/termix/runs/permission-audit/manual";
const MAXIMUM_LINE_BYTES = 2_000_000;
const MAXIMUM_STDIN_BYTES = 4_000_000;
const MAXIMUM_GIT_OUTPUT_BYTES = 4_000_000;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

interface Invocation {
  readonly timedRunRequest: unknown;
  readonly bundleSha256: string;
}

function parseArguments(args: readonly string[]): string {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (
    normalized.length !== 3 ||
    normalized[0] !== "--execute-exact-permission-audit-manual-run" ||
    normalized[1] !== "--input-bundle" ||
    normalized[2] === undefined
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_CLI_ARGUMENTS_INVALID");
  }
  return validateRepositoryPath(normalized[2]);
}

function validateRepositoryPath(value: string): string {
  if (
    !value.startsWith(INPUT_PREFIX) ||
    !value.endsWith(INPUT_SUFFIX) ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    isAbsolute(value) ||
    !/^[A-Za-z0-9._/-]+$/u.test(value)
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_INPUT_PATH_INVALID");
  }
  return value;
}

async function* readBoundedLines(): AsyncGenerator<string> {
  let pending = Buffer.alloc(0);
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    totalBytes += buffer.length;
    if (totalBytes > MAXIMUM_STDIN_BYTES) {
      throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_STDIN_TOO_LARGE");
    }
    pending = Buffer.concat([pending, buffer]);
    let newlineIndex = pending.indexOf(0x0a);
    while (newlineIndex >= 0) {
      const line = pending.subarray(0, newlineIndex);
      pending = pending.subarray(newlineIndex + 1);
      if (line.length === 0 || line.length > MAXIMUM_LINE_BYTES || line.includes(0x0d)) {
        throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_STDIN_LINE_INVALID");
      }
      try {
        yield UTF8_DECODER.decode(line);
      } catch {
        throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_STDIN_UTF8_INVALID");
      }
      newlineIndex = pending.indexOf(0x0a);
    }
    if (pending.length > MAXIMUM_LINE_BYTES) {
      throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_STDIN_LINE_INVALID");
    }
  }
  if (pending.length !== 0) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_STDIN_FINAL_NEWLINE_REQUIRED");
  }
}

function parseJson(text: string, code: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(code);
  }
}

function parseInvocation(text: string): Invocation {
  const parsed = parseJson(text, "TERMIX_PERMISSION_AUDIT_MANUAL_INVOCATION_JSON_INVALID");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_INVOCATION_INVALID");
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "bundleSha256,timedRunRequest") {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_INVOCATION_INVALID");
  }
  if (typeof record.bundleSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(record.bundleSha256)) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_INVOCATION_DIGEST_INVALID");
  }
  return { timedRunRequest: record.timedRunRequest, bundleSha256: record.bundleSha256 };
}

async function* parseEvents(lines: AsyncIterator<string>): AsyncGenerator<unknown> {
  for (;;) {
    const next = await lines.next();
    if (next.done === true) return;
    yield parseJson(next.value, "TERMIX_PERMISSION_AUDIT_MANUAL_EVENT_JSON_INVALID");
  }
}

function gitText(args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function gitBytes(args: readonly string[]): Buffer {
  return execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
}

function verifyReleaseState(sourceCommitSha: string): void {
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_REPOSITORY_DIRTY");
  }
  const head = gitText(["rev-parse", "HEAD"]);
  const published = gitText(["rev-parse", "origin/main"]);
  if (head !== sourceCommitSha) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_SOURCE_COMMIT_MISMATCH");
  }
  if (published !== head) throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_SOURCE_NOT_PUBLISHED");
}

async function verifyCommittedInput(repositoryPath: string): Promise<string> {
  const absolutePath = resolve(REPOSITORY_ROOT, ...repositoryPath.split("/"));
  await assertCanonicalPathWithinRepository(absolutePath);
  gitText(["ls-files", "--error-unmatch", "--", repositoryPath]);
  const workingBytes = await readFile(absolutePath);
  const committedBytes = gitBytes(["show", `HEAD:${repositoryPath}`]);
  if (!workingBytes.equals(committedBytes)) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_INPUT_NOT_COMMITTED");
  }
  const text = workingBytes.toString("utf8");
  if (!text.endsWith("\n") || text.endsWith("\r\n") || text.slice(0, -1).includes("\n")) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_INPUT_FILE_INVALID");
  }
  return text.slice(0, -1);
}

async function assertCanonicalPathWithinRepository(absolutePath: string): Promise<void> {
  const repositoryRealPath = await realpath(REPOSITORY_ROOT);
  const candidateRealPath = await realpath(absolutePath);
  const local = relative(repositoryRealPath, candidateRealPath);
  if (
    local === "" ||
    local === ".." ||
    local.startsWith(`..${sep}`) ||
    isAbsolute(local) ||
    resolve(absolutePath).toLowerCase() !== resolve(candidateRealPath).toLowerCase()
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_INPUT_PATH_UNTRUSTED");
  }
  let cursor = repositoryRealPath;
  for (const segment of local.split(sep)) {
    cursor = resolve(cursor, segment);
    if ((await lstat(cursor)).isSymbolicLink()) {
      throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_INPUT_PATH_UNTRUSTED");
    }
  }
}

async function assertOutputAvailable(runId: string): Promise<string> {
  const outputDirectory = resolve(REPOSITORY_ROOT, ...OUTPUT_DIRECTORY.split("/"));
  await assertCanonicalPathWithinRepository(outputDirectory);
  const outputPath = resolve(outputDirectory, `${runId}.json`);
  const local = relative(outputDirectory, outputPath);
  if (local === "" || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_OUTPUT_PATH_INVALID");
  }
  try {
    await access(outputPath, constants.F_OK);
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_OUTPUT_ALREADY_EXISTS");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "TERMIX_PERMISSION_AUDIT_MANUAL_OUTPUT_ALREADY_EXISTS"
    ) {
      throw error;
    }
    if (!isMissingFileError(error)) throw error;
  }
  return outputPath;
}

async function writeCaptureCreateOnly(outputPath: string, body: string): Promise<void> {
  const temporaryPath = resolve(dirname(outputPath), `.${randomUUID()}.partial`);
  let temporaryExists = false;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    temporaryExists = true;
    try {
      await handle.writeFile(body, { encoding: "utf8" });
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporaryPath, outputPath);
    await unlink(temporaryPath);
    temporaryExists = false;
  } finally {
    if (temporaryExists) await unlink(temporaryPath).catch(() => undefined);
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function main(): Promise<void> {
  const inputPath = parseArguments(process.argv.slice(2));
  const lineIterator = readBoundedLines()[Symbol.asyncIterator]();
  const firstLine = await lineIterator.next();
  if (firstLine.done === true) throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_STDIN_REQUIRED");
  const invocation = parseInvocation(firstLine.value);
  const timedRequest = TermixTimedRunRequestSchema.parse(invocation.timedRunRequest);
  verifyReleaseState(timedRequest.sourceCommitSha);
  const bundleCanonicalJson = await verifyCommittedInput(inputPath);
  if (sha256Bytes(bundleCanonicalJson) !== invocation.bundleSha256) {
    throw new Error("TERMIX_PERMISSION_AUDIT_MANUAL_INPUT_DIGEST_MISMATCH");
  }
  const outputPath = await assertOutputAvailable(timedRequest.runId);
  const capture = await runPermissionAuditManualTermixMethod({
    request: timedRequest,
    bundleCanonicalJson,
    bundleSha256: invocation.bundleSha256,
    events: parseEvents(lineIterator),
    clock: {
      monotonicClockLabel: "Node.js process.hrtime.bigint",
      utcNow: () => new Date(),
      monotonicNowNanoseconds: () => process.hrtime.bigint()
    }
  });
  await writeCaptureCreateOnly(outputPath, `${canonicalJson(capture)}\n`);
  process.stdout.write(`${relative(REPOSITORY_ROOT, outputPath).replaceAll("\\", "/")}\n`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : error instanceof Error
        ? error.constructor.name
        : "Error";
  process.stderr.write(`TermiX permission audit manual runner failed: ${message}\n`);
  process.exitCode = 1;
});
