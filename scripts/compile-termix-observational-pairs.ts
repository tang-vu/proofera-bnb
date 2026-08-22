import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPancakeLpPair,
  buildVenusHealthPair,
  canonicalJson
} from "../packages/benchmarks/src/index";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAXIMUM_GIT_OUTPUT_BYTES = 4_000_000;
const MAXIMUM_INPUT_BYTES = 4_000_000;

const LP_SOURCES = {
  agentCapturePath: "evidence/termix/runs/pancake-lp/pancake-lp-agent-20260818-v4.json",
  agentInvocationPath: "evidence/termix/invocations/pancake-lp-agent-20260818-v4.canonical-json",
  declarationPath: "evidence/termix/declarations/pancake-lp/f8b57f2b1842-125735511.json",
  inputPath: "evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json",
  manualCapturePath: "evidence/termix/runs/pancake-lp/manual/pancake-lp-manual-20260818-v1.json",
  operatorProcedurePath: "scripts/operator-ceremony-server.mjs",
  runOrderPath: "evidence/termix/declarations/pancake-lp/f8b57f2b1842-125735511.run-order.json"
} as const;

const VENUS_SOURCES = {
  agentCapturePath: "evidence/termix/runs/venus-health/venus-health-agent-20260818-v2.json",
  agentInvocationPath: "evidence/termix/invocations/venus-health-agent-20260818-v2.canonical-json",
  declarationPath: "evidence/termix/declarations/venus-health/402edbeae429-125808800.json",
  inputPath: "evidence/termix/frozen/venus-health/402edbeae429-125563831-125564152.canonical-json",
  manualCapturePath:
    "evidence/termix/runs/venus-health/manual/venus-health-manual-20260818-v2.json",
  operatorProcedurePath: "scripts/operator-ceremony-server.mjs",
  runOrderPath: "evidence/termix/declarations/venus-health/402edbeae429-125808800.run-order.json"
} as const;

const OUTPUTS = {
  lpPair: "evidence/termix/pairs/pancake-lp/pancake-lp-pair-20260822-v1.json",
  lpReview: "evidence/termix/reviews/pancake-lp/pancake-lp-pair-20260822-v1-self-review.json",
  venusPair: "evidence/termix/pairs/venus-health/venus-health-pair-20260822-v1.json",
  venusReview: "evidence/termix/reviews/venus-health/venus-health-pair-20260822-v1-self-review.json"
} as const;

function parseArguments(args: readonly string[]): void {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length !== 1 || normalized[0] !== "--compile-exact-observational-pairs") {
    throw new Error("TERMIX_OBSERVATIONAL_PAIR_CLI_ARGUMENTS_INVALID");
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

function verifyPublishedCleanHead(): void {
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("TERMIX_OBSERVATIONAL_PAIR_REPOSITORY_DIRTY");
  }
  if (gitText(["rev-parse", "HEAD"]) !== gitText(["rev-parse", "origin/main"])) {
    throw new Error("TERMIX_OBSERVATIONAL_PAIR_HEAD_NOT_PUBLISHED");
  }
}

async function readTrackedJson(repositoryPath: string): Promise<unknown> {
  const absolutePath = resolve(REPOSITORY_ROOT, ...repositoryPath.split("/"));
  await assertPathInside(REPOSITORY_ROOT, absolutePath, false);
  gitText(["ls-files", "--error-unmatch", "--", repositoryPath]);
  const working = await readBounded(absolutePath);
  if (!working.equals(gitBytes(["show", `HEAD:${repositoryPath}`]))) {
    throw new Error("TERMIX_OBSERVATIONAL_PAIR_INPUT_NOT_COMMITTED");
  }
  try {
    return JSON.parse(working.toString("utf8")) as unknown;
  } catch {
    throw new Error("TERMIX_OBSERVATIONAL_PAIR_INPUT_JSON_INVALID");
  }
}

async function readSources(sources: typeof LP_SOURCES | typeof VENUS_SOURCES) {
  const [agentCapture, manualCapture, agentInvocation, declarationEnvelope, frozenInput, runOrder] =
    await Promise.all([
      readTrackedJson(sources.agentCapturePath),
      readTrackedJson(sources.manualCapturePath),
      readTrackedJson(sources.agentInvocationPath),
      readTrackedJson(sources.declarationPath),
      readTrackedJson(sources.inputPath),
      readTrackedJson(sources.runOrderPath)
    ]);
  return {
    agentCapture,
    manualCapture,
    agentInvocation,
    declarationEnvelope,
    frozenInput,
    runOrder,
    sources
  };
}

async function readBounded(path: string): Promise<Buffer> {
  const bytes = await readFile(path);
  if (bytes.length === 0 || bytes.length > MAXIMUM_INPUT_BYTES) {
    throw new Error("TERMIX_OBSERVATIONAL_PAIR_INPUT_SIZE_INVALID");
  }
  return bytes;
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
    throw new Error("TERMIX_OBSERVATIONAL_PAIR_PATH_UNTRUSTED");
  }
  if (!allowMissing && (await lstat(candidateReal)).isSymbolicLink()) {
    throw new Error("TERMIX_OBSERVATIONAL_PAIR_PATH_UNTRUSTED");
  }
}

async function assertOutputAvailable(repositoryPath: string): Promise<string> {
  const absolutePath = resolve(REPOSITORY_ROOT, ...repositoryPath.split("/"));
  const outputRoot = resolve(REPOSITORY_ROOT, "evidence", "termix");
  await mkdir(dirname(absolutePath), { recursive: true });
  await assertPathInside(outputRoot, absolutePath, true);
  try {
    await access(absolutePath, constants.F_OK);
    throw new Error("TERMIX_OBSERVATIONAL_PAIR_OUTPUT_ALREADY_EXISTS");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "TERMIX_OBSERVATIONAL_PAIR_OUTPUT_ALREADY_EXISTS"
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
  parseArguments(process.argv.slice(2));
  verifyPublishedCleanHead();
  const [lp, venus] = await Promise.all([readSources(LP_SOURCES), readSources(VENUS_SOURCES)]);
  const reviewedAtUtc = new Date().toISOString();
  const lpResult = buildPancakeLpPair({ ...lp, reviewedAtUtc });
  const venusResult = buildVenusHealthPair({ ...venus, reviewedAtUtc });
  const values = [
    [OUTPUTS.lpPair, lpResult.pair],
    [OUTPUTS.lpReview, lpResult.selfReview],
    [OUTPUTS.venusPair, venusResult.pair],
    [OUTPUTS.venusReview, venusResult.selfReview]
  ] as const;
  const available = await Promise.all(values.map(([path]) => assertOutputAvailable(path)));
  const written: string[] = [];
  try {
    for (const [index, [, value]] of values.entries()) {
      const path = available[index];
      if (path === undefined) throw new Error("TERMIX_OBSERVATIONAL_PAIR_OUTPUT_INVALID");
      await writeCreateOnly(path, value);
      written.push(path);
    }
  } catch (error) {
    await Promise.all(written.map((path) => unlink(path).catch(() => undefined)));
    throw error;
  }
  process.stdout.write(`${Object.values(OUTPUTS).join("\n")}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`TermiX observational pair compilation failed: ${message}\n`);
  process.exitCode = 1;
});
