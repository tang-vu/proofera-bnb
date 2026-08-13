import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REVIEW_CONSTANTS, sha256File } from "./review-lib.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIRECTORY, "..", "..");
const CAPTURE_FLAG = "--capture-exact-source-bindings";
const OUTPUT_PATH =
  "evidence/development/pancake-v3-pool-init-code-source-bindings-2026-08-13.json";

function fail(message) {
  throw new Error(`Pancake source-binding capture failed closed: ${message}`);
}

function git(checkoutRoot, args, encoding = "utf8") {
  const result = spawnSync("git", ["-C", checkoutRoot, ...args], {
    encoding,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error) fail(`git could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`git exited ${result.status}: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

function upstreamPath(sourceName) {
  if (sourceName.startsWith("contracts/")) {
    return `projects/v3-core/${sourceName}`;
  }
  const prefix = "@pancakeswap/v3-lm-pool/";
  if (sourceName.startsWith(prefix)) {
    return `projects/v3-lm-pool/${sourceName.slice(prefix.length)}`;
  }
  fail(`unsupported compiler source namespace: ${sourceName}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha1(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`, "utf8").update(bytes).digest("hex");
}

function readInput(relativePath) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relativePath), "utf8"));
}

function main() {
  const [flag, rawCheckoutRoot] = process.argv.slice(2);
  if (process.argv.slice(2).length !== 2 || flag !== CAPTURE_FLAG) {
    fail(`expected exactly: ${CAPTURE_FLAG} <official-checkout-root>`);
  }
  const checkoutRoot = resolve(rawCheckoutRoot);
  if (!existsSync(resolve(checkoutRoot, ".git"))) fail("official checkout is not a Git worktree");
  if (git(checkoutRoot, ["rev-parse", "HEAD"]).trim() !== REVIEW_CONSTANTS.sourceCommit) {
    fail("official source commit drifted");
  }
  if (git(checkoutRoot, ["rev-parse", "HEAD^{tree}"]).trim() !== REVIEW_CONSTANTS.sourceTree) {
    fail("official source tree drifted");
  }
  if (git(checkoutRoot, ["status", "--porcelain", "--untracked-files=no"]).trim() !== "") {
    fail("official checkout has tracked modifications");
  }

  const inputs = [
    readInput(REVIEW_CONSTANTS.evidencePaths.poolAndDeployerInput),
    readInput(REVIEW_CONSTANTS.evidencePaths.factoryInput)
  ];
  const compilerSources = new Map();
  for (const input of inputs) {
    for (const [sourceName, { content }] of Object.entries(input.sources)) {
      if (compilerSources.has(sourceName) && compilerSources.get(sourceName) !== content) {
        fail(`duplicate compiler source content differs: ${sourceName}`);
      }
      compilerSources.set(sourceName, content);
    }
  }

  const entries = [...compilerSources]
    .map(([sourceName, content]) => {
      const path = upstreamPath(sourceName);
      const compilerBytes = Buffer.from(content, "utf8");
      const withoutCrLf = content.replaceAll("\r\n", "");
      if (withoutCrLf.includes("\r") || withoutCrLf.includes("\n")) {
        fail(`compiler source has mixed or lone line endings: ${sourceName}`);
      }
      const normalizedBytes = Buffer.from(content.replaceAll("\r\n", "\n"), "utf8");
      const blob = git(checkoutRoot, ["show", `${REVIEW_CONSTANTS.sourceCommit}:${path}`], null);
      if (!normalizedBytes.equals(blob))
        fail(`LF-normalized compiler source differs from Git blob: ${path}`);
      const objectId = git(checkoutRoot, [
        "rev-parse",
        `${REVIEW_CONSTANTS.sourceCommit}:${path}`
      ]).trim();
      if (gitBlobSha1(blob) !== objectId) fail(`Git blob object ID mismatch: ${path}`);
      return {
        compilerSourceName: sourceName,
        upstreamPath: path,
        compilerInputLineEndings: content.includes("\r\n") ? "crlf" : "none",
        compilerInputByteLength: compilerBytes.length,
        compilerInputSha256: sha256(compilerBytes),
        lfNormalizedByteLength: normalizedBytes.length,
        lfNormalizedSha256: sha256(normalizedBytes),
        gitBlobSha1: objectId
      };
    })
    .sort((left, right) => left.compilerSourceName.localeCompare(right.compilerSourceName));

  const output = {
    schemaVersion: 1,
    evidenceId: "pancake-v3-pool-init-code-source-bindings-2026-08-13",
    sourceRepository: REVIEW_CONSTANTS.sourceRepository,
    sourceCommit: REVIEW_CONSTANTS.sourceCommit,
    sourceTree: REVIEW_CONSTANTS.sourceTree,
    compilerInputFiles: [
      {
        path: REVIEW_CONSTANTS.evidencePaths.poolAndDeployerInput,
        sha256: sha256File(resolve(REPO_ROOT, REVIEW_CONSTANTS.evidencePaths.poolAndDeployerInput))
      },
      {
        path: REVIEW_CONSTANTS.evidencePaths.factoryInput,
        sha256: sha256File(resolve(REPO_ROOT, REVIEW_CONSTANTS.evidencePaths.factoryInput))
      }
    ],
    mappingRule: {
      "contracts/*": "projects/v3-core/contracts/*",
      "@pancakeswap/v3-lm-pool/*": "projects/v3-lm-pool/*"
    },
    entryCount: entries.length,
    entries,
    boundary:
      "The Windows compiler inputs contain exact CRLF checkout text. LF normalization is byte-equal to each named Git blob at the pinned official commit; no claim of an authenticated publisher signature is made.",
    securityBoundary: {
      rpcPerformed: false,
      processEnvironmentDumped: false,
      signerUsed: false,
      transactionBroadcast: false
    }
  };
  const outputPath = resolve(REPO_ROOT, OUTPUT_PATH);
  if (existsSync(outputPath)) fail(`refusing to overwrite ${OUTPUT_PATH}`);
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  process.stdout.write(
    `${JSON.stringify({ status: "pass_exact_git_blob_bindings", entryCount: entries.length }, null, 2)}\n`
  );
}

main();
