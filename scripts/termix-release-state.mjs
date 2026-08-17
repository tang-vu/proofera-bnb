import { execFileSync, spawnSync } from "node:child_process";

const MAXIMUM_GIT_OUTPUT_BYTES = 4_000_000;
const COMMIT_SHA = /^[0-9a-f]{40}$/u;
const REPOSITORY_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;

function gitText(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  }).trim();
}

function gitStatus(repositoryRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
    windowsHide: true
  });
  if (result.error !== undefined || result.signal !== null || result.status === null) {
    throw result.error ?? new Error("TERMIX_RELEASE_GIT_FAILED");
  }
  return result.status;
}

function fail(errorPrefix, suffix) {
  throw new Error(`${errorPrefix}_${suffix}`);
}

/**
 * Permit evidence-only commits after a frozen source release without permitting code drift.
 * The source commit must be a published ancestor of the clean current HEAD, and every path
 * capable of changing timed execution must remain byte-identical to that source commit.
 */
export function verifyTermixPublishedReleaseState({
  repositoryRoot,
  sourceCommitSha,
  protectedPaths,
  errorPrefix
}) {
  if (!COMMIT_SHA.test(sourceCommitSha)) fail(errorPrefix, "SOURCE_COMMIT_INVALID");
  if (
    !Array.isArray(protectedPaths) ||
    protectedPaths.length === 0 ||
    protectedPaths.some((path) => typeof path !== "string" || !REPOSITORY_PATH.test(path))
  ) {
    fail(errorPrefix, "PROTECTED_PATHS_INVALID");
  }
  if (gitText(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail(errorPrefix, "REPOSITORY_DIRTY");
  }
  const head = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
  if (gitText(repositoryRoot, ["rev-parse", "origin/main"]) !== head) {
    fail(errorPrefix, "SOURCE_NOT_PUBLISHED");
  }
  if (gitStatus(repositoryRoot, ["merge-base", "--is-ancestor", sourceCommitSha, head]) !== 0) {
    fail(errorPrefix, "SOURCE_COMMIT_MISMATCH");
  }
  const uniqueProtectedPaths = [...new Set(protectedPaths)].sort();
  if (
    gitStatus(repositoryRoot, [
      "diff",
      "--quiet",
      sourceCommitSha,
      head,
      "--",
      ...uniqueProtectedPaths
    ]) !== 0
  ) {
    fail(errorPrefix, "RELEASE_SCOPE_DRIFT");
  }
}
