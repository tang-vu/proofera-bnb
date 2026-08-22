import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPermissionAuditPair,
  canonicalJson,
  sha256Bytes
} from "../packages/benchmarks/src/index";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ANSWER_KEY_BASENAME =
  "c50a2defc62a996cab8a8bf51be2b8b2bbe44cc007ea01e6d1512d7257a8f0cb.canonical-json";
const EXPECTED_ANSWER_KEY_SHA256 =
  "61494b199b7b41b30eee370fe6736d864671439c65b2acfbee107c5ea9efdbeb";
const PAIR_PATH = "evidence/termix/pairs/permission-audit/permission-audit-pair-20260822-v1.json";
const REVIEW_PATH =
  "evidence/termix/reviews/permission-audit/permission-audit-pair-20260822-v1-self-review.json";
const SOURCE_PATHS = {
  agentCapturePath:
    "evidence/termix/runs/permission-audit/agent/permission-audit-agent-20260822-v1.json",
  agentInvocationPath:
    "evidence/termix/invocations/permission-audit-agent-20260822-v1.canonical-json",
  manualCapturePath:
    "evidence/termix/runs/permission-audit/manual/permission-audit-manual-20260822-v1.json",
  manualInvocationPath:
    "evidence/termix/invocations/permission-audit-manual-20260822-v1.canonical-json"
} as const;
const MAXIMUM_GIT_OUTPUT_BYTES = 4_000_000;
const MAXIMUM_INPUT_BYTES = 4_000_000;

function parseArguments(args: readonly string[]): string {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (
    normalized.length !== 3 ||
    normalized[0] !== "--compile-exact-permission-audit-pair" ||
    normalized[1] !== "--answer-key" ||
    normalized[2] === undefined ||
    !isAbsolute(normalized[2]) ||
    basename(normalized[2]) !== ANSWER_KEY_BASENAME
  ) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_CLI_ARGUMENTS_INVALID");
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

function gitBytes(args: readonly string[]): Buffer {
  return execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "buffer",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
}

function verifyPublishedCleanHead(): void {
  if (gitText(["status", "--porcelain=v1"]) !== "") {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_REPOSITORY_DIRTY");
  }
  const head = gitText(["rev-parse", "HEAD"]);
  const remote = gitText(["rev-parse", "origin/main"]);
  if (head !== remote) throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_HEAD_NOT_PUBLISHED");
}

async function readTrackedJson(repositoryPath: string): Promise<unknown> {
  const absolutePath = resolve(REPOSITORY_ROOT, ...repositoryPath.split("/"));
  await assertPathInside(REPOSITORY_ROOT, absolutePath, false);
  gitText(["ls-files", "--error-unmatch", "--", repositoryPath]);
  const working = await readBounded(absolutePath);
  if (!working.equals(gitBytes(["show", `HEAD:${repositoryPath}`]))) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_INPUT_NOT_COMMITTED");
  }
  return parseJson(working.toString("utf8"), "TERMIX_PERMISSION_AUDIT_PAIR_INPUT_JSON_INVALID");
}

async function readAnswerKey(answerKeyPath: string): Promise<{
  readonly parsed: unknown;
  readonly sha256: string;
}> {
  const expectedRoot = resolve(dirname(answerKeyPath));
  await assertPathInside(expectedRoot, answerKeyPath, false);
  const bytes = await readBounded(answerKeyPath);
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n") || text.endsWith("\r\n") || text.slice(0, -1).includes("\n")) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_ANSWER_KEY_FILE_INVALID");
  }
  const payload = text.slice(0, -1);
  const parsed = parseJson(payload, "TERMIX_PERMISSION_AUDIT_PAIR_ANSWER_KEY_JSON_INVALID");
  if (canonicalJson(parsed) !== payload) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_ANSWER_KEY_NOT_CANONICAL");
  }
  const sha256 = sha256Bytes(payload);
  if (sha256 !== EXPECTED_ANSWER_KEY_SHA256) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_ANSWER_KEY_DIGEST_MISMATCH");
  }
  return { parsed, sha256 };
}

async function readBounded(path: string): Promise<Buffer> {
  const bytes = await readFile(path);
  if (bytes.length === 0 || bytes.length > MAXIMUM_INPUT_BYTES) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_INPUT_SIZE_INVALID");
  }
  return bytes;
}

function parseJson(text: string, code: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(code);
  }
}

async function assertPathInside(
  root: string,
  candidate: string,
  allowMissing: boolean
): Promise<void> {
  const rootReal = await realpath(root);
  let candidateReal: string;
  try {
    candidateReal = await realpath(candidate);
  } catch (error) {
    if (!allowMissing || !isMissingFileError(error)) throw error;
    candidateReal = resolve(candidate);
  }
  const local = relative(rootReal, candidateReal);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_PATH_UNTRUSTED");
  }
  if (!allowMissing && (await lstat(candidateReal)).isSymbolicLink()) {
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_PATH_UNTRUSTED");
  }
}

async function assertOutputAvailable(repositoryPath: string): Promise<string> {
  const absolutePath = resolve(REPOSITORY_ROOT, ...repositoryPath.split("/"));
  const outputRoot = resolve(REPOSITORY_ROOT, "evidence", "termix");
  await mkdir(dirname(absolutePath), { recursive: true });
  await assertPathInside(outputRoot, absolutePath, true);
  try {
    await access(absolutePath, constants.F_OK);
    throw new Error("TERMIX_PERMISSION_AUDIT_PAIR_OUTPUT_ALREADY_EXISTS");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "TERMIX_PERMISSION_AUDIT_PAIR_OUTPUT_ALREADY_EXISTS"
    ) {
      throw error;
    }
    if (!isMissingFileError(error)) throw error;
  }
  return absolutePath;
}

async function writeCreateOnly(path: string, value: unknown): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${canonicalJson(value)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
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
  const answerKeyPath = parseArguments(process.argv.slice(2));
  verifyPublishedCleanHead();
  const [agentCapture, manualCapture, agentInvocation, manualInvocation, answerKey] =
    await Promise.all([
      readTrackedJson(SOURCE_PATHS.agentCapturePath),
      readTrackedJson(SOURCE_PATHS.manualCapturePath),
      readTrackedJson(SOURCE_PATHS.agentInvocationPath),
      readTrackedJson(SOURCE_PATHS.manualInvocationPath),
      readAnswerKey(answerKeyPath)
    ]);
  const result = buildPermissionAuditPair({
    agentCapture,
    manualCapture,
    agentInvocation,
    manualInvocation,
    answerKey: answerKey.parsed,
    answerKeySha256: answerKey.sha256,
    reviewedAtUtc: new Date().toISOString(),
    sources: SOURCE_PATHS
  });
  const pairOutput = await assertOutputAvailable(PAIR_PATH);
  const reviewOutput = await assertOutputAvailable(REVIEW_PATH);
  let pairWritten = false;
  try {
    await writeCreateOnly(pairOutput, result.pair);
    pairWritten = true;
    await writeCreateOnly(reviewOutput, result.selfReview);
  } catch (error) {
    if (pairWritten) await unlink(pairOutput).catch(() => undefined);
    throw error;
  }
  process.stdout.write(`${PAIR_PATH}\n${REVIEW_PATH}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`TermiX permission-audit pair compilation failed: ${message}\n`);
  process.exitCode = 1;
});
