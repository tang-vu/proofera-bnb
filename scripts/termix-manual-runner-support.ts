import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, link, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TermixTimedRunRequestSchema,
  canonicalJson,
  isCanonicalJsonText,
  sha256Bytes,
  type TermixRunnerClock
} from "../packages/benchmarks/src/index";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAXIMUM_LINE_BYTES = 2_000_000;
const MAXIMUM_STDIN_BYTES = 4_000_000;
const MAXIMUM_GIT_OUTPUT_BYTES = 4_000_000;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

interface ManualInvocation {
  readonly timedRunRequest: unknown;
  readonly inputSha256: string;
}

interface ManualRunOptions {
  readonly request: unknown;
  readonly inputCanonicalJson: string;
  readonly inputSha256: string;
  readonly events: AsyncIterable<unknown>;
  readonly clock: TermixRunnerClock;
}

export interface TermixManualCliConfig {
  readonly executeFlag: string;
  readonly inputArgument: string;
  readonly inputPrefix: string;
  readonly outputDirectory: string;
  readonly invocationDigestKey: string;
  readonly errorPrefix: string;
  readonly args: readonly string[];
  readonly run: (options: ManualRunOptions) => Promise<unknown>;
}

function fail(config: TermixManualCliConfig, suffix: string): never {
  throw new Error(`${config.errorPrefix}_${suffix}`);
}

function parseArguments(config: TermixManualCliConfig): string {
  const normalized = config.args[0] === "--" ? config.args.slice(1) : config.args;
  if (
    normalized.length !== 3 ||
    normalized[0] !== config.executeFlag ||
    normalized[1] !== config.inputArgument ||
    normalized[2] === undefined
  ) {
    fail(config, "CLI_ARGUMENTS_INVALID");
  }
  const value = normalized[2];
  if (
    !value.startsWith(config.inputPrefix) ||
    !value.endsWith(".canonical-json") ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    isAbsolute(value) ||
    !/^[A-Za-z0-9._/-]+$/u.test(value)
  ) {
    fail(config, "INPUT_PATH_INVALID");
  }
  return value;
}

async function* readBoundedLines(config: TermixManualCliConfig): AsyncGenerator<string> {
  let pending = Buffer.alloc(0);
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    totalBytes += buffer.length;
    if (totalBytes > MAXIMUM_STDIN_BYTES) fail(config, "STDIN_TOO_LARGE");
    pending = Buffer.concat([pending, buffer]);
    let newlineIndex = pending.indexOf(0x0a);
    while (newlineIndex >= 0) {
      const line = pending.subarray(0, newlineIndex);
      pending = pending.subarray(newlineIndex + 1);
      if (line.length === 0 || line.length > MAXIMUM_LINE_BYTES || line.includes(0x0d)) {
        fail(config, "STDIN_LINE_INVALID");
      }
      try {
        yield UTF8_DECODER.decode(line);
      } catch {
        fail(config, "STDIN_UTF8_INVALID");
      }
      newlineIndex = pending.indexOf(0x0a);
    }
    if (pending.length > MAXIMUM_LINE_BYTES) fail(config, "STDIN_LINE_INVALID");
  }
  if (pending.length !== 0) fail(config, "STDIN_FINAL_NEWLINE_REQUIRED");
}

function parseJson(config: TermixManualCliConfig, text: string, suffix: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail(config, suffix);
  }
}

function parseInvocation(config: TermixManualCliConfig, text: string): ManualInvocation {
  const parsed = parseJson(config, text, "INVOCATION_JSON_INVALID");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail(config, "INVOCATION_INVALID");
  }
  const record = parsed as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !==
    [config.invocationDigestKey, "timedRunRequest"].sort().join(",")
  ) {
    fail(config, "INVOCATION_INVALID");
  }
  const digest = record[config.invocationDigestKey];
  if (typeof digest !== "string" || !/^[0-9a-f]{64}$/u.test(digest)) {
    fail(config, "INVOCATION_DIGEST_INVALID");
  }
  return { timedRunRequest: record.timedRunRequest, inputSha256: digest };
}

async function* parseEvents(
  config: TermixManualCliConfig,
  lines: AsyncIterator<string>
): AsyncGenerator<unknown> {
  for (;;) {
    const next = await lines.next();
    if (next.done === true) return;
    yield parseJson(config, next.value, "EVENT_JSON_INVALID");
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

function verifyReleaseState(config: TermixManualCliConfig, sourceCommitSha: string): void {
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail(config, "REPOSITORY_DIRTY");
  }
  const head = gitText(["rev-parse", "HEAD"]);
  if (head !== sourceCommitSha) fail(config, "SOURCE_COMMIT_MISMATCH");
  if (gitText(["rev-parse", "origin/main"]) !== head) fail(config, "SOURCE_NOT_PUBLISHED");
}

async function assertCanonicalPathWithinRepository(
  config: TermixManualCliConfig,
  absolutePath: string
): Promise<void> {
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
    fail(config, "PATH_UNTRUSTED");
  }
  let cursor = repositoryRealPath;
  for (const segment of local.split(sep)) {
    cursor = resolve(cursor, segment);
    if ((await lstat(cursor)).isSymbolicLink()) fail(config, "PATH_UNTRUSTED");
  }
}

async function verifyCommittedInput(
  config: TermixManualCliConfig,
  repositoryPath: string
): Promise<string> {
  const absolutePath = resolve(REPOSITORY_ROOT, ...repositoryPath.split("/"));
  await assertCanonicalPathWithinRepository(config, absolutePath);
  gitText(["ls-files", "--error-unmatch", "--", repositoryPath]);
  const workingBytes = await readFile(absolutePath);
  const committedBytes = gitBytes(["show", `HEAD:${repositoryPath}`]);
  if (!workingBytes.equals(committedBytes)) fail(config, "INPUT_NOT_COMMITTED");
  const text = workingBytes.toString("utf8");
  if (!text.endsWith("\n") || text.endsWith("\r\n") || text.slice(0, -1).includes("\n")) {
    fail(config, "INPUT_FILE_INVALID");
  }
  return text.slice(0, -1);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function assertOutputAvailable(
  config: TermixManualCliConfig,
  runId: string
): Promise<string> {
  const outputDirectory = resolve(REPOSITORY_ROOT, ...config.outputDirectory.split("/"));
  await assertCanonicalPathWithinRepository(config, outputDirectory);
  const outputPath = resolve(outputDirectory, `${runId}.json`);
  const local = relative(outputDirectory, outputPath);
  if (local === "" || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    fail(config, "OUTPUT_PATH_INVALID");
  }
  try {
    await access(outputPath, constants.F_OK);
    fail(config, "OUTPUT_ALREADY_EXISTS");
  } catch (error) {
    if (error instanceof Error && error.message === `${config.errorPrefix}_OUTPUT_ALREADY_EXISTS`) {
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

export async function runTermixManualCli(config: TermixManualCliConfig): Promise<string> {
  const inputPath = parseArguments(config);
  const lineIterator = readBoundedLines(config)[Symbol.asyncIterator]();
  const firstLine = await lineIterator.next();
  if (firstLine.done === true) fail(config, "STDIN_REQUIRED");
  const invocation = parseInvocation(config, firstLine.value);
  const timedRequest = TermixTimedRunRequestSchema.parse(invocation.timedRunRequest);
  verifyReleaseState(config, timedRequest.sourceCommitSha);
  const inputCanonicalJson = await verifyCommittedInput(config, inputPath);
  if (!isCanonicalJsonText(inputCanonicalJson)) fail(config, "INPUT_NOT_CANONICAL");
  if (sha256Bytes(inputCanonicalJson) !== invocation.inputSha256) {
    fail(config, "INPUT_DIGEST_MISMATCH");
  }
  const outputPath = await assertOutputAvailable(config, timedRequest.runId);
  const capture = await config.run({
    request: timedRequest,
    inputCanonicalJson,
    inputSha256: invocation.inputSha256,
    events: parseEvents(config, lineIterator),
    clock: {
      monotonicClockLabel: "Node.js process.hrtime.bigint",
      utcNow: () => new Date(),
      monotonicNowNanoseconds: () => process.hrtime.bigint()
    }
  });
  await writeCaptureCreateOnly(outputPath, `${canonicalJson(capture)}\n`);
  return relative(REPOSITORY_ROOT, outputPath).replaceAll("\\", "/");
}
