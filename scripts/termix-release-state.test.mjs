import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { verifyTermixPublishedReleaseState } from "./termix-release-state.mjs";

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}

async function repository() {
  const root = await mkdtemp(join(tmpdir(), "proofera-termix-release-"));
  git(root, ["init", "--initial-branch=main"]);
  git(root, ["config", "user.name", "ProofEra test"]);
  git(root, ["config", "user.email", "test@proofera.invalid"]);
  await writeFile(join(root, "runner.ts"), "export const version = 1;\n", "utf8");
  await writeFile(join(root, "evidence.json"), "{}\n", "utf8");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "source release"]);
  const sourceCommitSha = git(root, ["rev-parse", "HEAD"]);
  git(root, ["update-ref", "refs/remotes/origin/main", sourceCommitSha]);
  return { root, sourceCommitSha };
}

function verify(root, sourceCommitSha) {
  verifyTermixPublishedReleaseState({
    repositoryRoot: root,
    sourceCommitSha,
    protectedPaths: ["runner.ts"],
    errorPrefix: "TERMIX_TEST"
  });
}

test("TermiX release gate accepts the exact clean published source commit", async (context) => {
  const fixture = await repository();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.doesNotThrow(() => verify(fixture.root, fixture.sourceCommitSha));
});

test("TermiX release gate accepts a published evidence-only descendant", async (context) => {
  const fixture = await repository();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "evidence.json"), '{"verified":true}\n', "utf8");
  git(fixture.root, ["add", "evidence.json"]);
  git(fixture.root, ["commit", "-m", "add evidence"]);
  git(fixture.root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  assert.doesNotThrow(() => verify(fixture.root, fixture.sourceCommitSha));
});

test("TermiX release gate rejects protected runtime drift", async (context) => {
  const fixture = await repository();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "runner.ts"), "export const version = 2;\n", "utf8");
  git(fixture.root, ["add", "runner.ts"]);
  git(fixture.root, ["commit", "-m", "drift runner"]);
  git(fixture.root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  assert.throws(() => verify(fixture.root, fixture.sourceCommitSha), {
    message: "TERMIX_TEST_RELEASE_SCOPE_DRIFT"
  });
});

test("TermiX release gate rejects dirty and unpublished states", async (context) => {
  const fixture = await repository();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.root, "evidence.json"), '{"dirty":true}\n', "utf8");
  assert.throws(() => verify(fixture.root, fixture.sourceCommitSha), {
    message: "TERMIX_TEST_REPOSITORY_DIRTY"
  });
  git(fixture.root, ["add", "evidence.json"]);
  git(fixture.root, ["commit", "-m", "unpublished evidence"]);
  assert.throws(() => verify(fixture.root, fixture.sourceCommitSha), {
    message: "TERMIX_TEST_SOURCE_NOT_PUBLISHED"
  });
});

test("TermiX release gate rejects a source commit outside published HEAD ancestry", async (context) => {
  const fixture = await repository();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  git(fixture.root, ["switch", "--orphan", "unrelated"]);
  await writeFile(join(fixture.root, "runner.ts"), "export const unrelated = true;\n", "utf8");
  await writeFile(join(fixture.root, "evidence.json"), "{}\n", "utf8");
  git(fixture.root, ["add", "."]);
  git(fixture.root, ["commit", "-m", "unrelated release"]);
  git(fixture.root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  assert.throws(() => verify(fixture.root, fixture.sourceCommitSha), {
    message: "TERMIX_TEST_SOURCE_COMMIT_MISMATCH"
  });
});
