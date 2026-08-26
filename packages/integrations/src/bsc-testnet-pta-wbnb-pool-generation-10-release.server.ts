import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

import type { Hex } from "viem";

import {
  BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN,
  deriveBscTestnetPtaWbnbPoolProductionRuntimeManifestSha256ForInternalUse,
  type BscTestnetPtaWbnbPoolExactReleaseIdentity,
  type BscTestnetPtaWbnbPoolProductionRuntimeManifestEntry
} from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PINNED_GIT_EXECUTABLE = "D:\\Git\\mingw64\\bin\\git.exe";
const PINNED_ORIGIN_REFERENCE = "refs/remotes/origin/main";
const ARGUMENT_LABELS = Object.freeze([
  "--release-commit",
  "--release-tree",
  "--runtime-manifest-sha256"
]);
const GIT_OBJECT = /^[0-9a-f]{40}$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;

export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_RELEASE_SOURCE_PATHS = Object.freeze(
  [
    ".gitattributes",
    "package.json",
    "packages/integrations/package.json",
    "packages/integrations/src/bsc-testnet-deployer-custody-core.ts",
    "packages/integrations/src/bsc-testnet-deployer-custody-windows.server.ts",
    "packages/integrations/src/bsc-testnet-pta-deployment-envelope.ts",
    "packages/integrations/src/bsc-testnet-pta-one-shot-worker-protocol.ts",
    "packages/integrations/src/bsc-testnet-pta-signing-worker.ts",
    "packages/integrations/src/bsc-testnet-pta-unsigned-transaction.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-authorization.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-coordinator.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-generation-10-authority.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-generation-10-journal.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-generation-10-policy.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-generation-10-recovery.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-generation-10-release.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-generation-10-runner.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-initialization.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-local-journal.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-boundary.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-protocol.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-signer-core.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-post-claim-recheck.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-private-broadcaster.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-authority.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-composition.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-rpc.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-runner.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-release-review-policy.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-signing-worker.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-submission-journal.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-submission-reconciler.server.ts",
    "pnpm-lock.yaml",
    "scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts",
    "scripts/run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1",
    "scripts/run-bsc-testnet-pta-wbnb-pool-phase0.mjs",
    "scripts/typescript-extension-loader.mjs"
  ].sort()
);

const FIXED_GIT_ENVIRONMENT = Object.freeze({
  HOMEDRIVE: "C:",
  HOMEPATH: "\\Users\\tangm",
  LOGONSERVER: "\\\\DESKTOP-1A6OPC9",
  PATH: "C:\\Windows\\System32",
  SYSTEMDRIVE: "C:",
  SystemRoot: "C:\\Windows",
  TEMP: "C:\\Users\\tangm\\AppData\\Local\\Temp",
  USERDOMAIN: "DESKTOP-1A6OPC9",
  USERNAME: "tangm",
  USERPROFILE: "C:\\Users\\tangm",
  WINDIR: "C:\\Windows",
  WS_NO_BUFFER_UTIL: "1",
  WS_NO_UTF_8_VALIDATE: "1",
  GIT_ATTR_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "NUL",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
  LC_ALL: "C"
});

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function isWithin(parent: string, candidate: string): boolean {
  const local = relative(parent, candidate);
  return local === "" || (!local.startsWith(`..${sep}`) && local !== ".." && !isAbsolute(local));
}

function git(arguments_: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      PINNED_GIT_EXECUTABLE,
      [
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=NUL",
        "-c",
        "core.attributesFile=NUL",
        "-c",
        "core.autocrlf=false",
        "-c",
        "core.eol=lf",
        "-c",
        "diff.external=",
        "-C",
        REPOSITORY_ROOT,
        ...arguments_
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: FIXED_GIT_ENVIRONMENT,
        maxBuffer: 64 * 1024,
        shell: false,
        timeout: 10_000,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error !== null || stderr !== "" || Buffer.byteLength(stdout, "utf8") > 64 * 1024) {
          rejectPromise(new Error("GENERATION_10_RELEASE_INVALID"));
          return;
        }
        resolvePromise(stdout.trim());
      }
    );
  });
}

async function stableFile(path: string): Promise<Buffer> {
  let handle;
  try {
    const [pathMetadata, canonical] = await Promise.all([lstat(path), realpath(path)]);
    if (!pathMetadata.isFile() || pathMetadata.isSymbolicLink() || !samePath(path, canonical)) {
      throw new Error("GENERATION_10_RELEASE_INVALID");
    }
    handle = await open(path, fileConstants.O_RDONLY);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size < 0n || before.size > 16n * 1024n * 1024n) {
      throw new Error("GENERATION_10_RELEASE_INVALID");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(bytes.byteLength) !== before.size
    ) {
      bytes.fill(0);
      throw new Error("GENERATION_10_RELEASE_INVALID");
    }
    return bytes;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function expectedArguments(): Readonly<{
  releaseCommit: string;
  releaseTree: string;
  runtimeManifestSha256: Hex;
}> {
  if (
    argv.length !== 8 ||
    argv[2] !== ARGUMENT_LABELS[0] ||
    argv[4] !== ARGUMENT_LABELS[1] ||
    argv[6] !== ARGUMENT_LABELS[2] ||
    !GIT_OBJECT.test(argv[3] ?? "") ||
    !GIT_OBJECT.test(argv[5] ?? "") ||
    !BYTES32.test(argv[7] ?? "")
  ) {
    throw new Error("GENERATION_10_RELEASE_INVALID");
  }
  return Object.freeze({
    releaseCommit: argv[3] as string,
    releaseTree: argv[5] as string,
    runtimeManifestSha256: argv[7] as Hex
  });
}

export async function inspectBscTestnetPtaWbnbPoolGeneration10ReleaseIdentityForInternalUse(): Promise<BscTestnetPtaWbnbPoolExactReleaseIdentity> {
  const expected = expectedArguments();
  const [root, head, published, tree, status, objectFormat] = await Promise.all([
    git(["rev-parse", "--show-toplevel"]),
    git(["rev-parse", "--verify", "HEAD"]),
    git(["rev-parse", "--verify", PINNED_ORIGIN_REFERENCE]),
    git(["rev-parse", "--verify", "HEAD^{tree}"]),
    git(["status", "--porcelain=v1", "--untracked-files=all"]),
    git(["rev-parse", "--show-object-format"])
  ]);
  if (
    !samePath(root, REPOSITORY_ROOT) ||
    head !== expected.releaseCommit ||
    published !== expected.releaseCommit ||
    tree !== expected.releaseTree ||
    status !== "" ||
    objectFormat !== "sha1"
  ) {
    throw new Error("GENERATION_10_RELEASE_INVALID");
  }
  const entries: BscTestnetPtaWbnbPoolProductionRuntimeManifestEntry[] = [];
  for (const relativePath of BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_RELEASE_SOURCE_PATHS) {
    const path = resolve(REPOSITORY_ROOT, ...relativePath.split("/"));
    if (!isWithin(REPOSITORY_ROOT, path)) throw new Error("GENERATION_10_RELEASE_INVALID");
    const bytes = await stableFile(path);
    try {
      const blob = createHash("sha1")
        .update(`blob ${bytes.byteLength}\0`, "utf8")
        .update(bytes)
        .digest("hex");
      const expectedBlob = await git(["rev-parse", "--verify", `${head}:${relativePath}`]);
      if (blob !== expectedBlob) throw new Error("GENERATION_10_RELEASE_INVALID");
      entries.push(
        Object.freeze({
          path: relativePath,
          byteLength: bytes.byteLength,
          sha256: `0x${createHash("sha256").update(bytes).digest("hex")}` as Hex
        })
      );
    } finally {
      bytes.fill(0);
    }
  }
  const body = Object.freeze({
    schemaVersion: 2 as const,
    domain: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_RUNTIME_MANIFEST_DOMAIN,
    nodeVersion: process.version,
    entries: Object.freeze(entries)
  });
  const digest = deriveBscTestnetPtaWbnbPoolProductionRuntimeManifestSha256ForInternalUse(body);
  const [headAfter, publishedAfter, statusAfter] = await Promise.all([
    git(["rev-parse", "--verify", "HEAD"]),
    git(["rev-parse", "--verify", PINNED_ORIGIN_REFERENCE]),
    git(["status", "--porcelain=v1", "--untracked-files=all"])
  ]);
  if (
    digest === null ||
    digest !== expected.runtimeManifestSha256 ||
    headAfter !== head ||
    publishedAfter !== head ||
    statusAfter !== ""
  ) {
    throw new Error("GENERATION_10_RELEASE_INVALID");
  }
  return Object.freeze({
    releaseCommit: head,
    releaseTree: tree,
    runtimeManifest: Object.freeze({ ...body, runtimeManifestSha256: digest })
  });
}
