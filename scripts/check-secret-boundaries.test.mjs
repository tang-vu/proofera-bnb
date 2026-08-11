import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatScanReport,
  maximumTextFileBytes,
  scanRepository
} from "./check-secret-boundaries.mjs";

const execFile = promisify(execFileCallback);
const temporaryPrefix = "proofera-boundary-test-";
const temporaryRoots = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), temporaryPrefix));
  temporaryRoots.push(directory);
  return directory;
}

async function removeTemporaryDirectory(directory) {
  const absolute = resolve(directory);
  const temporaryRoot = resolve(tmpdir());
  if (dirname(absolute) !== temporaryRoot || !basename(absolute).startsWith(temporaryPrefix)) {
    throw new Error("Refusing to remove a directory outside the scanner test boundary");
  }
  await rm(absolute, { force: true, recursive: true });
}

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    const directory = temporaryRoots.pop();
    if (directory !== undefined) await removeTemporaryDirectory(directory);
  }
});

async function initializeRepository() {
  const workspace = await temporaryDirectory();
  await execFile("git", ["init", "--quiet", workspace], { windowsHide: true });
  return workspace;
}

function syntheticCredential() {
  return [["s", "k"].join(""), "proj", "syntheticBoundaryValue1234567890"].join("-");
}

function publicRpcVariable() {
  return [["NEXT", "PUBLIC"].join("_"), "BSC", "RPC", "URL"].join("_");
}

describe("secret-boundary candidate selection", () => {
  test("uses Git candidates, reports forbidden tracked names without opening them, and ignores local files", async () => {
    const workspace = await initializeRepository();
    const ignoredDirectory = join(workspace, "ignored-local");
    const sourceDirectory = join(workspace, "src");
    const forbiddenDirectory = join(workspace, "vault");
    await Promise.all([mkdir(ignoredDirectory), mkdir(sourceDirectory), mkdir(forbiddenDirectory)]);
    await writeFile(
      join(workspace, ".gitignore"),
      ["ignored-local/", "**/*keystore*.json", ""].join("\n")
    );
    const marker = syntheticCredential();
    await writeFile(join(ignoredDirectory, "local.json"), marker);
    await writeFile(
      join(sourceDirectory, "config.ts"),
      `export const ${publicRpcVariable()} = "${marker}";\n`
    );
    const forbiddenPath = join(forbiddenDirectory, "synthetic-keystore.json");
    await writeFile(forbiddenPath, marker);
    await execFile("git", ["-C", workspace, "add", "-f", "vault/synthetic-keystore.json"], {
      windowsHide: true
    });
    await unlink(forbiddenPath);

    const openedPaths = [];
    const result = await scanRepository({
      onRead: (path) => openedPaths.push(path),
      workspace
    });
    const report = formatScanReport(result);

    assert.equal(result.source, "git");
    assert.ok(
      result.findings.some(
        (finding) =>
          finding.path === "vault/synthetic-keystore.json" &&
          finding.rule === "forbidden-secret-path"
      )
    );
    assert.ok(
      result.findings.some(
        (finding) =>
          finding.path === "src/config.ts" && finding.rule === "public-secret-variable-name"
      )
    );
    assert.ok(!openedPaths.includes("vault/synthetic-keystore.json"));
    assert.ok(!openedPaths.some((path) => path.startsWith("ignored-local/")));
    assert.ok(!result.findings.some((finding) => finding.path.includes("ignored-local")));
    assert.ok(!report.includes(marker));
  });

  test("fails closed on oversized text rather than silently skipping it", async () => {
    const workspace = await initializeRepository();
    await writeFile(join(workspace, "oversized.txt"), "a".repeat(maximumTextFileBytes + 1));

    const result = await scanRepository({ workspace });
    assert.ok(
      result.findings.some(
        (finding) => finding.path === "oversized.txt" && finding.rule === "oversized-text-file"
      )
    );
  });

  test("rejects unexpected binary content instead of treating it as unscannable text", async () => {
    const workspace = await initializeRepository();
    await writeFile(join(workspace, "hidden.ts"), Buffer.from([0, 1, 2, 3]));

    const result = await scanRepository({ workspace });
    assert.ok(
      result.findings.some(
        (finding) => finding.path === "hidden.ts" && finding.rule === "unexpected-binary-file"
      )
    );
  });

  test("allows only a path- and value-bound integration fixture annotation", async () => {
    const workspace = await initializeRepository();
    const fixtureDirectory = join(workspace, "packages", "integrations", "src");
    await mkdir(fixtureDirectory, { recursive: true });
    const fixturePath = join(fixtureDirectory, "8004scan.test.ts");
    const value = "synthetic-fixture-value-12345";
    const digest = createHash("sha256").update(value).digest("hex");
    const source = (candidate) =>
      [
        "export const fixture = {",
        `  // proofera-secret-fixture-sha256=${digest}`,
        `  apiKey: "${candidate}"`,
        "};",
        ""
      ].join("\n");
    await writeFile(fixturePath, source(value));

    const allowed = await scanRepository({ workspace });
    assert.ok(
      !allowed.findings.some((finding) => finding.rule === "literal-credential-assignment")
    );

    await writeFile(fixturePath, source(`${value}-tampered`));
    const tampered = await scanRepository({ workspace });
    assert.ok(
      tampered.findings.some((finding) => finding.rule === "literal-credential-assignment")
    );
  });

  test("uses a fail-closed safe fallback only when Git is unavailable", async () => {
    const workspace = await temporaryDirectory();
    await mkdir(join(workspace, "src"));
    await writeFile(
      join(workspace, "src", "config.ts"),
      `export const ${publicRpcVariable()} = "${syntheticCredential()}";\n`
    );
    await writeFile(join(workspace, ".env.local"), syntheticCredential());

    const openedPaths = [];
    const result = await scanRepository({
      gitBinary: join(workspace, "definitely-missing-git"),
      onRead: (path) => openedPaths.push(path),
      workspace
    });

    assert.equal(result.source, "fallback");
    assert.ok(result.findings.some((finding) => finding.rule === "git-unavailable-fallback"));
    assert.equal(result.candidateCount, 0);
    assert.equal(openedPaths.length, 0);
    assert.ok(!openedPaths.includes(".env.local"));
    assert.ok(!result.findings.some((finding) => finding.path === ".env.local"));
  });

  test("allows only the root environment example and never opens nested environment files", async () => {
    const workspace = await initializeRepository();
    await mkdir(join(workspace, "nested"));
    await writeFile(join(workspace, ".env.example"), "PROOFERA_8004SCAN_API_KEY=\n");
    await writeFile(join(workspace, "nested", ".env.example"), syntheticCredential());

    const openedPaths = [];
    const result = await scanRepository({
      onRead: (path) => openedPaths.push(path),
      workspace
    });

    assert.ok(openedPaths.includes(".env.example"));
    assert.ok(!openedPaths.includes("nested/.env.example"));
    assert.ok(
      result.findings.some(
        (finding) =>
          finding.path === "nested/.env.example" && finding.rule === "forbidden-secret-path"
      )
    );
  });
});

test("report serialization prevents filename control sequences from becoming log commands", () => {
  const report = formatScanReport({
    candidateCount: 1,
    findings: [{ line: 1, path: "::error\nsynthetic.ts", rule: "synthetic-rule" }],
    source: "git"
  });
  assert.ok(report.startsWith("{"));
  assert.ok(!report.startsWith("::"));
  assert.ok(!report.includes("\nsynthetic.ts"));
  assert.match(report, /\\\\u000a/);
});
