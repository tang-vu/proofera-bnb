import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { argv, cwd, env, execArgv, execPath, version } from "node:process";
import { fileURLToPath } from "node:url";

const PINNED_NODE_VERSION = "v24.14.1";
const PINNED_NODE_EXECUTABLE = "D:\\Node\\node.exe";
const PINNED_NODE_EXECUTABLE_BYTES = 91_426_304;
const PINNED_NODE_EXECUTABLE_SHA256 =
  "58e74bf02fc5bbacc41dcb8bef089961cd5bddd37830b87784e4fc624d145d1f";
const PINNED_GIT_EXECUTABLE = "D:\\Git\\mingw64\\bin\\git.exe";
const PINNED_GIT_EXECUTABLE_BYTES = 4_344_192;
const PINNED_GIT_EXECUTABLE_SHA256 =
  "c39b1b4f7a57935bbeadf246dc2466316619453a6a9da77c4a9c6bd6d8fb21d3";
const PINNED_ORIGIN_REFERENCE = "refs/remotes/origin/main";
const PHASE_ZERO_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(PHASE_ZERO_PATH), "..");
const PHASE_ONE_CLI_RELATIVE_PATH = "scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts";
const TYPESCRIPT_LOADER_RELATIVE_PATH = "scripts/typescript-extension-loader.mjs";
const RUNTIME_MANIFEST_DOMAIN = "ProofEra:bsc-testnet-pta-wbnb-pool-production-runtime-manifest:v2";
const GIT_OBJECT = /^[0-9a-f]{40}$/u;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const ZERO_GIT_OBJECT = "0".repeat(40);
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const MAXIMUM_GIT_OUTPUT_BYTES = 64 * 1024;

const EXPECTED_ARGUMENT_LABELS = Object.freeze([
  "--release-commit",
  "--release-tree",
  "--runtime-manifest-sha256"
]);

const FORBIDDEN_ENVIRONMENT_NAMES = new Set(
  [
    "ALL_PROXY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NODE_COMPILE_CACHE",
    "NODE_EXTRA_CA_CERTS",
    "NODE_OPTIONS",
    "NODE_PATH",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "NODE_USE_ENV_PROXY",
    "NO_PROXY",
    "OPENSSL_CONF",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE"
  ].map((name) => name.toUpperCase())
);

const RELEASE_SOURCE_PATHS = Object.freeze(
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
    PHASE_ONE_CLI_RELATIVE_PATH,
    "scripts/run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1",
    "scripts/run-bsc-testnet-pta-wbnb-pool-phase0.mjs",
    TYPESCRIPT_LOADER_RELATIVE_PATH
  ].sort()
);

const PINNED_RUNTIME_TREE_MANIFESTS = Object.freeze({
  abitypeForOx: Object.freeze({
    digest: "a3bd5acaa177d5ed6727bc3cc0dafdd86760080298ff2c1df015f55e561614bb",
    files: 78,
    bytes: 311_080
  }),
  abitypeForViem: Object.freeze({
    digest: "8d6261a7b5e1a24e7f06b160875a937029d182af92d5fea13fdd3935f6270f13",
    files: 78,
    bytes: 311_078
  }),
  nobleCurves: Object.freeze({
    digest: "0b15d6b3cb213030e3f4f5a7879fbd413c48300cd8afc8851a1a0d9ebc86dd3e",
    files: 102,
    bytes: 718_233
  }),
  nobleHashes: Object.freeze({
    digest: "6919a52a894c1339de126f8aff264c451bb418523c2406e9ce8e4d323d196a43",
    files: 110,
    bytes: 469_735
  }),
  isows: Object.freeze({
    digest: "fd68a1861b8ac7b4cb4495ceaa332de832665bf6c99fe7a6d2d7808fd1106e3e",
    files: 8,
    bytes: 3_119
  }),
  ox: Object.freeze({
    digest: "22cecb50c1bd7865bdc420b7d47af5ec60a528e6346f882bb26542d6e4de8eab",
    files: 314,
    bytes: 1_729_976
  }),
  serverOnly: Object.freeze({
    digest: "03dfa375a287d93459c50e5d9ab699bc1fdd243d68b4634dfd9062912c3511f6",
    files: 2,
    bytes: 467
  }),
  typescript: Object.freeze({
    digest: "302672759659a7328a03eaa29da9bd6db0823e5207bd3497080fc56dc7d99c9a",
    files: 8,
    bytes: 9_156_391
  }),
  viem: Object.freeze({
    digest: "74890c82645aa02e07a2935e777fa5a323cffdae2c549ed62a591e9da13291e3",
    files: 2_870,
    bytes: 5_151_217
  }),
  ws: Object.freeze({
    digest: "00fb84072f891ecd824aafaa4eb031549d29e0027283736a60ce1c2d2445819d",
    files: 19,
    bytes: 151_087
  })
});

const PINNED_RUNTIME_ROOT_RELATIVE_PATHS = Object.freeze({
  abitypeForOx: "node_modules/.pnpm/abitype@1.2.4_typescript@6.0.3_zod@4.4.3/node_modules/abitype",
  abitypeForViem:
    "node_modules/.pnpm/abitype@1.2.3_typescript@6.0.3_zod@4.4.3/node_modules/abitype",
  nobleCurves: "node_modules/.pnpm/@noble+curves@1.9.1/node_modules/@noble/curves",
  nobleHashes: "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes",
  isows: "node_modules/.pnpm/isows@1.0.7_ws@8.21.0/node_modules/isows",
  ox: "node_modules/.pnpm/ox@0.14.33_typescript@6.0.3_zod@4.4.3/node_modules/ox",
  serverOnly: "node_modules/.pnpm/server-only@0.0.1/node_modules/server-only",
  typescript: "node_modules/.pnpm/typescript@6.0.3/node_modules/typescript",
  viem: "node_modules/.pnpm/viem@2.55.13_typescript@6.0.3_zod@4.4.3/node_modules/viem",
  ws: "node_modules/.pnpm/ws@8.21.0/node_modules/ws"
});

const EXACT_PACKAGE_BIN_FILES = Object.freeze([
  "tsc",
  "tsc.CMD",
  "tsc.ps1",
  "tsserver",
  "tsserver.CMD",
  "tsserver.ps1"
]);

const PINNED_PNPM_PACKAGE_PARENT_TOPOLOGIES = Object.freeze([
  Object.freeze({
    path: "node_modules/.pnpm/viem@2.55.13_typescript@6.0.3_zod@4.4.3/node_modules",
    entries: Object.freeze({
      "@noble": Object.freeze({
        kind: "directory",
        entries: Object.freeze({
          curves: Object.freeze({
            kind: "symlink",
            target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.nobleCurves
          }),
          hashes: Object.freeze({
            kind: "symlink",
            target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.nobleHashes
          })
        })
      }),
      "@scure": Object.freeze({
        kind: "directory",
        entries: Object.freeze({
          bip32: Object.freeze({
            kind: "symlink",
            target: "node_modules/.pnpm/@scure+bip32@1.7.0/node_modules/@scure/bip32"
          }),
          bip39: Object.freeze({
            kind: "symlink",
            target: "node_modules/.pnpm/@scure+bip39@1.6.0/node_modules/@scure/bip39"
          })
        })
      }),
      abitype: Object.freeze({
        kind: "symlink",
        target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.abitypeForViem
      }),
      isows: Object.freeze({
        kind: "symlink",
        target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.isows
      }),
      ox: Object.freeze({ kind: "symlink", target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.ox }),
      typescript: Object.freeze({
        kind: "symlink",
        target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.typescript
      }),
      viem: Object.freeze({ kind: "directory" }),
      ws: Object.freeze({ kind: "symlink", target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.ws })
    })
  }),
  Object.freeze({
    path: "node_modules/.pnpm/ox@0.14.33_typescript@6.0.3_zod@4.4.3/node_modules",
    entries: Object.freeze({
      "@adraffy": Object.freeze({
        kind: "directory",
        entries: Object.freeze({
          "ens-normalize": Object.freeze({
            kind: "symlink",
            target:
              "node_modules/.pnpm/@adraffy+ens-normalize@1.11.1/node_modules/@adraffy/ens-normalize"
          })
        })
      }),
      "@noble": Object.freeze({
        kind: "directory",
        entries: Object.freeze({
          ciphers: Object.freeze({
            kind: "symlink",
            target: "node_modules/.pnpm/@noble+ciphers@1.3.0/node_modules/@noble/ciphers"
          }),
          curves: Object.freeze({
            kind: "symlink",
            target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.nobleCurves
          }),
          hashes: Object.freeze({
            kind: "symlink",
            target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.nobleHashes
          })
        })
      }),
      "@scure": Object.freeze({
        kind: "directory",
        entries: Object.freeze({
          bip32: Object.freeze({
            kind: "symlink",
            target: "node_modules/.pnpm/@scure+bip32@1.7.0/node_modules/@scure/bip32"
          }),
          bip39: Object.freeze({
            kind: "symlink",
            target: "node_modules/.pnpm/@scure+bip39@1.6.0/node_modules/@scure/bip39"
          })
        })
      }),
      abitype: Object.freeze({
        kind: "symlink",
        target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.abitypeForOx
      }),
      eventemitter3: Object.freeze({
        kind: "symlink",
        target: "node_modules/.pnpm/eventemitter3@5.0.1/node_modules/eventemitter3"
      }),
      ox: Object.freeze({ kind: "directory" }),
      typescript: Object.freeze({
        kind: "symlink",
        target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.typescript
      })
    })
  }),
  Object.freeze({
    path: "node_modules/.pnpm/abitype@1.2.3_typescript@6.0.3_zod@4.4.3/node_modules",
    entries: Object.freeze({
      abitype: Object.freeze({ kind: "directory" }),
      typescript: Object.freeze({
        kind: "symlink",
        target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.typescript
      }),
      zod: Object.freeze({
        kind: "symlink",
        target: "node_modules/.pnpm/zod@4.4.3/node_modules/zod"
      })
    })
  }),
  Object.freeze({
    path: "node_modules/.pnpm/abitype@1.2.4_typescript@6.0.3_zod@4.4.3/node_modules",
    entries: Object.freeze({
      abitype: Object.freeze({ kind: "directory" }),
      typescript: Object.freeze({
        kind: "symlink",
        target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.typescript
      }),
      zod: Object.freeze({
        kind: "symlink",
        target: "node_modules/.pnpm/zod@4.4.3/node_modules/zod"
      })
    })
  }),
  Object.freeze({
    path: "node_modules/.pnpm/@noble+curves@1.9.1/node_modules/@noble",
    entries: Object.freeze({
      curves: Object.freeze({ kind: "directory" }),
      hashes: Object.freeze({
        kind: "symlink",
        target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.nobleHashes
      })
    })
  }),
  Object.freeze({
    path: "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble",
    entries: Object.freeze({ hashes: Object.freeze({ kind: "directory" }) })
  }),
  Object.freeze({
    path: "node_modules/.pnpm/typescript@6.0.3/node_modules",
    entries: Object.freeze({ typescript: Object.freeze({ kind: "directory" }) })
  }),
  Object.freeze({
    path: "node_modules/.pnpm/server-only@0.0.1/node_modules",
    entries: Object.freeze({ "server-only": Object.freeze({ kind: "directory" }) })
  }),
  Object.freeze({
    path: "node_modules/.pnpm/isows@1.0.7_ws@8.21.0/node_modules",
    entries: Object.freeze({
      isows: Object.freeze({ kind: "directory" }),
      ws: Object.freeze({ kind: "symlink", target: PINNED_RUNTIME_ROOT_RELATIVE_PATHS.ws })
    })
  }),
  Object.freeze({
    path: "node_modules/.pnpm/ws@8.21.0/node_modules",
    entries: Object.freeze({ ws: Object.freeze({ kind: "directory" }) })
  })
]);

const GIT_PREFIX_ARGUMENTS = Object.freeze([
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
  REPOSITORY_ROOT
]);

const FIXED_WINDOWS_SUBPROCESS_ENVIRONMENT = Object.freeze({
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
  WS_NO_UTF_8_VALIDATE: "1"
});

const MINIMAL_GIT_ENVIRONMENT = Object.freeze({
  ...FIXED_WINDOWS_SUBPROCESS_ENVIRONMENT,
  GIT_ATTR_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "NUL",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_TERMINAL_PROMPT: "0",
  LC_ALL: "C"
});

const MINIMAL_PHASE_ONE_ENVIRONMENT = FIXED_WINDOWS_SUBPROCESS_ENVIRONMENT;

class PhaseZeroFailure extends Error {
  constructor() {
    super("The exact BSC testnet PTA/WBNB phase-zero bootstrap failed closed.");
    this.name = "PhaseZeroFailure";
  }
}

function fail() {
  throw new PhaseZeroFailure();
}

function samePath(left, right) {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function isWithin(parent, candidate) {
  const local = relative(parent, candidate);
  return local === "" || (!local.startsWith(`..${sep}`) && local !== ".." && !isAbsolute(local));
}

function fileSnapshot(metadata) {
  return Object.freeze({
    birthtimeNanoseconds: metadata.birthtimeNs,
    changeTimeNanoseconds: metadata.ctimeNs,
    device: metadata.dev,
    inode: metadata.ino,
    links: metadata.nlink,
    mode: metadata.mode,
    modifiedTimeNanoseconds: metadata.mtimeNs,
    size: metadata.size
  });
}

function sameSnapshot(left, right) {
  return (
    left.birthtimeNanoseconds === right.birthtimeNanoseconds &&
    left.changeTimeNanoseconds === right.changeTimeNanoseconds &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.links === right.links &&
    left.mode === right.mode &&
    left.modifiedTimeNanoseconds === right.modifiedTimeNanoseconds &&
    left.size === right.size
  );
}

async function readStableRegularFile(path, maximumBytes, allowEmpty = false) {
  let handle;
  try {
    const [pathMetadata, canonicalPath] = await Promise.all([lstat(path), realpath(path)]);
    if (!pathMetadata.isFile() || pathMetadata.isSymbolicLink() || !samePath(canonicalPath, path)) {
      fail();
    }
    handle = await open(path, fileConstants.O_RDONLY);
    const beforeMetadata = await handle.stat({ bigint: true });
    if (
      !beforeMetadata.isFile() ||
      beforeMetadata.size < (allowEmpty ? 0n : 1n) ||
      beforeMetadata.size > BigInt(maximumBytes)
    ) {
      fail();
    }
    const before = fileSnapshot(beforeMetadata);
    const bytes = await handle.readFile();
    const after = fileSnapshot(await handle.stat({ bigint: true }));
    if (BigInt(bytes.byteLength) !== before.size || !sameSnapshot(before, after)) {
      bytes.fill(0);
      fail();
    }
    return Object.freeze({ bytes, snapshot: before });
  } catch (error) {
    if (error instanceof PhaseZeroFailure) throw error;
    fail();
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function assertPinnedExecutable(path, expectedBytes, expectedSha256) {
  const file = await readStableRegularFile(path, 128 * 1024 * 1024);
  try {
    if (
      file.bytes.byteLength !== expectedBytes ||
      createHash("sha256").update(file.bytes).digest("hex") !== expectedSha256
    ) {
      fail();
    }
  } finally {
    file.bytes.fill(0);
  }
}

function parseExpectedReleaseArguments() {
  if (
    !Array.isArray(execArgv) ||
    Object.getPrototypeOf(execArgv) !== Array.prototype ||
    execArgv.length !== 0 ||
    !Array.isArray(argv) ||
    Object.getPrototypeOf(argv) !== Array.prototype ||
    argv.length !== 8 ||
    argv[2] !== EXPECTED_ARGUMENT_LABELS[0] ||
    argv[4] !== EXPECTED_ARGUMENT_LABELS[1] ||
    argv[6] !== EXPECTED_ARGUMENT_LABELS[2] ||
    typeof argv[3] !== "string" ||
    typeof argv[5] !== "string" ||
    typeof argv[7] !== "string" ||
    !GIT_OBJECT.test(argv[3]) ||
    !GIT_OBJECT.test(argv[5]) ||
    !BYTES32.test(argv[7]) ||
    argv[3] === ZERO_GIT_OBJECT ||
    argv[5] === ZERO_GIT_OBJECT ||
    argv[7] === ZERO_BYTES32
  ) {
    fail();
  }
  return Object.freeze({
    releaseCommit: argv[3],
    releaseTree: argv[5],
    runtimeManifestSha256: argv[7]
  });
}

function assertEnvironmentBoundary() {
  const actualNames = Object.keys(env);
  const expectedNames = Object.keys(FIXED_WINDOWS_SUBPROCESS_ENVIRONMENT);
  if (
    actualNames.length !== expectedNames.length ||
    expectedNames.some((name) => env[name] !== FIXED_WINDOWS_SUBPROCESS_ENVIRONMENT[name]) ||
    Object.keys(env).some((name) => FORBIDDEN_ENVIRONMENT_NAMES.has(name.toUpperCase()))
  ) {
    fail();
  }
}

function executePinnedGit(arguments_) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      PINNED_GIT_EXECUTABLE,
      [...GIT_PREFIX_ARGUMENTS, ...arguments_],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: MINIMAL_GIT_ENVIRONMENT,
        maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
        shell: false,
        timeout: 10_000,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (
          error !== null ||
          stderr !== "" ||
          Buffer.byteLength(stdout, "utf8") > MAXIMUM_GIT_OUTPUT_BYTES
        ) {
          rejectPromise(new PhaseZeroFailure());
          return;
        }
        resolvePromise(stdout.trim());
      }
    );
  });
}

async function assertNoRepositoryAttributeOverride() {
  const infoAttributes = resolve(REPOSITORY_ROOT, ".git/info/attributes");
  try {
    await lstat(infoAttributes);
    fail();
  } catch (error) {
    if (error instanceof PhaseZeroFailure) throw error;
    if (error?.code !== "ENOENT") fail();
  }
}

async function assertPathAbsent(path) {
  try {
    await lstat(path);
    fail();
  } catch (error) {
    if (error instanceof PhaseZeroFailure) throw error;
    if (error?.code !== "ENOENT") fail();
  }
}

async function assertExactDirectoryTopology(directory, expectedEntries) {
  const [metadata, canonicalDirectory] = await Promise.all([
    lstat(directory, { bigint: true }),
    realpath(directory)
  ]);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    !samePath(canonicalDirectory, directory)
  ) {
    fail();
  }
  const before = fileSnapshot(metadata);
  const actualNames = (await readdir(directory)).sort();
  const expectedNames = Object.keys(expectedEntries).sort();
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    fail();
  }
  for (const name of expectedNames) {
    const entry = expectedEntries[name];
    const path = resolve(directory, name);
    const entryMetadata = await lstat(path, { bigint: true });
    const entryBefore = fileSnapshot(entryMetadata);
    if (entry.kind === "directory") {
      if (entryMetadata.isSymbolicLink() || !entryMetadata.isDirectory()) fail();
      if (entry.entries !== undefined) {
        await assertExactDirectoryTopology(path, entry.entries);
      } else if (!samePath(await realpath(path), path)) {
        fail();
      }
    } else if (
      entry.kind !== "symlink" ||
      !entryMetadata.isSymbolicLink() ||
      !samePath(await realpath(path), resolve(REPOSITORY_ROOT, ...entry.target.split("/")))
    ) {
      fail();
    }
    const entryAfter = fileSnapshot(await lstat(path, { bigint: true }));
    if (!sameSnapshot(entryBefore, entryAfter)) fail();
  }
  const after = fileSnapshot(await lstat(directory, { bigint: true }));
  if (!sameSnapshot(before, after)) fail();
}

async function assertExactPnpmPackageParentTopologies() {
  for (const topology of PINNED_PNPM_PACKAGE_PARENT_TOPOLOGIES) {
    await assertExactDirectoryTopology(
      resolve(REPOSITORY_ROOT, ...topology.path.split("/")),
      topology.entries
    );
  }
}

async function assertCloserRuntimeShadowPathsAbsent() {
  await Promise.all(
    [
      "scripts/node_modules",
      "packages/integrations/src/node_modules",
      "packages/integrations/node_modules/@noble/node_modules",
      "node_modules/.pnpm/@noble+curves@1.9.1/node_modules/@noble/node_modules",
      "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/node_modules",
      "node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/node_modules",
      "node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/package.json"
    ].map((path) => assertPathAbsent(resolve(REPOSITORY_ROOT, ...path.split("/"))))
  );
}

async function assertWsOptionalNativeModulesAbsent(wsCanonicalRoot) {
  const candidates = new Set();
  let cursor = resolve(wsCanonicalRoot, "lib");
  for (;;) {
    for (const packageName of ["bufferutil", "utf-8-validate"]) {
      candidates.add(resolve(cursor, packageName));
      candidates.add(resolve(cursor, "node_modules", packageName));
    }
    const parent = dirname(cursor);
    if (samePath(parent, cursor)) break;
    cursor = parent;
  }
  await Promise.all([...candidates].map((path) => assertPathAbsent(path)));
}

async function assertTypeScriptOptionalModuleAbsent(typescriptCanonicalRoot) {
  const candidates = new Set();
  let cursor = resolve(typescriptCanonicalRoot, "lib");
  for (;;) {
    candidates.add(resolve(cursor, "node_modules/source-map-support"));
    const parent = dirname(cursor);
    if (samePath(parent, cursor)) break;
    cursor = parent;
  }
  await Promise.all([...candidates].map((path) => assertPathAbsent(path)));
}

async function assertExpectedGitIdentity(expected, requireClean) {
  const [root, head, published, tree, objectFormat, status] = await Promise.all([
    executePinnedGit(["rev-parse", "--show-toplevel"]),
    executePinnedGit(["rev-parse", "--verify", "HEAD"]),
    executePinnedGit(["rev-parse", "--verify", PINNED_ORIGIN_REFERENCE]),
    executePinnedGit(["rev-parse", "--verify", "HEAD^{tree}"]),
    executePinnedGit(["rev-parse", "--show-object-format"]),
    requireClean
      ? executePinnedGit(["status", "--porcelain=v1", "--untracked-files=all"])
      : Promise.resolve("")
  ]);
  if (
    !samePath(root, REPOSITORY_ROOT) ||
    objectFormat !== "sha1" ||
    head !== expected.releaseCommit ||
    published !== expected.releaseCommit ||
    tree !== expected.releaseTree ||
    status !== ""
  ) {
    fail();
  }
}

function gitBlobOid(bytes) {
  return createHash("sha1")
    .update(`blob ${bytes.byteLength}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}

async function deriveReleaseSourceManifest(expected) {
  const entries = [];
  for (const relativePath of RELEASE_SOURCE_PATHS) {
    const absolutePath = resolve(REPOSITORY_ROOT, ...relativePath.split("/"));
    const canonicalPath = await realpath(absolutePath);
    if (!samePath(canonicalPath, absolutePath) || !isWithin(REPOSITORY_ROOT, canonicalPath)) fail();
    const file = await readStableRegularFile(absolutePath, 16 * 1024 * 1024, true);
    try {
      const expectedBlobOid = await executePinnedGit([
        "rev-parse",
        "--verify",
        `${expected.releaseCommit}:${relativePath}`
      ]);
      if (!GIT_OBJECT.test(expectedBlobOid) || gitBlobOid(file.bytes) !== expectedBlobOid) fail();
      entries.push(
        Object.freeze({
          path: relativePath,
          byteLength: file.bytes.byteLength,
          sha256: `0x${createHash("sha256").update(file.bytes).digest("hex")}`
        })
      );
    } finally {
      file.bytes.fill(0);
    }
  }
  const body = Object.freeze({
    schemaVersion: 2,
    domain: RUNTIME_MANIFEST_DOMAIN,
    nodeVersion: version,
    entries: Object.freeze(entries)
  });
  const bodyBytes = Buffer.from(JSON.stringify(body), "utf8");
  try {
    return `0x${createHash("sha256")
      .update(RUNTIME_MANIFEST_DOMAIN, "utf8")
      .update("\0", "utf8")
      .update(bodyBytes)
      .digest("hex")}`;
  } finally {
    bodyBytes.fill(0);
  }
}

async function openPinnedRuntimeRoot(accessPath, expectedRelativePath) {
  const canonicalPnpmRoot = await realpath(resolve(REPOSITORY_ROOT, "node_modules/.pnpm"));
  const before = fileSnapshot(await lstat(accessPath, { bigint: true }));
  const accessMetadata = await lstat(accessPath);
  const canonicalRoot = await realpath(accessPath);
  const rootMetadata = await lstat(canonicalRoot, { bigint: true });
  if (
    !accessMetadata.isSymbolicLink() ||
    !rootMetadata.isDirectory() ||
    rootMetadata.isSymbolicLink() ||
    !isWithin(canonicalPnpmRoot, canonicalRoot) ||
    !samePath(canonicalRoot, resolve(REPOSITORY_ROOT, ...expectedRelativePath.split("/")))
  ) {
    fail();
  }
  return Object.freeze({
    accessPath,
    before,
    canonicalRoot,
    rootBefore: fileSnapshot(rootMetadata)
  });
}

async function openEquivalentRuntimeRoot(accessPath, expected) {
  const root = await openPinnedRuntimeRoot(
    accessPath,
    relative(REPOSITORY_ROOT, expected.canonicalRoot).split(sep).join("/")
  );
  if (!samePath(root.canonicalRoot, expected.canonicalRoot)) fail();
  return root;
}

async function assertRuntimeRootStable(root) {
  const after = fileSnapshot(await lstat(root.accessPath, { bigint: true }));
  const rootAfter = fileSnapshot(await lstat(root.canonicalRoot, { bigint: true }));
  if (
    !sameSnapshot(root.before, after) ||
    !sameSnapshot(root.rootBefore, rootAfter) ||
    !samePath(await realpath(root.accessPath), root.canonicalRoot)
  ) {
    fail();
  }
}

async function listRuntimeFiles(canonicalRoot, relativeDirectory, output) {
  const directory = resolve(canonicalRoot, ...relativeDirectory.split("/").filter(Boolean));
  const [metadata, canonicalDirectory] = await Promise.all([
    lstat(directory, { bigint: true }),
    realpath(directory)
  ]);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    !isWithin(canonicalRoot, canonicalDirectory)
  ) {
    fail();
  }
  const before = fileSnapshot(metadata);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const entry of entries) {
    const relativeName =
      relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) fail();
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === "node_modules") fail();
      await listRuntimeFiles(canonicalRoot, relativeName, output);
    } else if (entry.isFile()) {
      output.push(relativeName);
    } else {
      fail();
    }
  }
  const after = fileSnapshot(await lstat(directory, { bigint: true }));
  if (!sameSnapshot(before, after)) fail();
}

async function addExactPackageBinFiles(root, names, required) {
  const nodeModulesPath = resolve(root.canonicalRoot, "node_modules");
  if (!required) {
    await assertPathAbsent(nodeModulesPath);
    return;
  }
  const binPath = resolve(nodeModulesPath, ".bin");
  const [nodeModulesMetadata, nodeModulesCanonical, binMetadata, binCanonical] = await Promise.all([
    lstat(nodeModulesPath, { bigint: true }),
    realpath(nodeModulesPath),
    lstat(binPath, { bigint: true }),
    realpath(binPath)
  ]);
  if (
    !nodeModulesMetadata.isDirectory() ||
    nodeModulesMetadata.isSymbolicLink() ||
    !samePath(nodeModulesCanonical, nodeModulesPath) ||
    !binMetadata.isDirectory() ||
    binMetadata.isSymbolicLink() ||
    !samePath(binCanonical, binPath)
  ) {
    fail();
  }
  const nodeModulesBefore = fileSnapshot(nodeModulesMetadata);
  const binBefore = fileSnapshot(binMetadata);
  const nodeModulesNames = await readdir(nodeModulesPath);
  const binNames = (await readdir(binPath)).sort();
  if (
    nodeModulesNames.length !== 1 ||
    nodeModulesNames[0] !== ".bin" ||
    binNames.length !== EXACT_PACKAGE_BIN_FILES.length ||
    binNames.some((name, index) => name !== EXACT_PACKAGE_BIN_FILES[index])
  ) {
    fail();
  }
  for (const name of binNames) {
    const path = resolve(binPath, name);
    const [metadata, canonicalPath] = await Promise.all([lstat(path), realpath(path)]);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !samePath(canonicalPath, path)) fail();
    names.push(`node_modules/.bin/${name}`);
  }
  if (
    !sameSnapshot(
      nodeModulesBefore,
      fileSnapshot(await lstat(nodeModulesPath, { bigint: true }))
    ) ||
    !sameSnapshot(binBefore, fileSnapshot(await lstat(binPath, { bigint: true })))
  ) {
    fail();
  }
}

async function deriveRuntimeTreeManifest(
  root,
  subdirectories,
  exactFiles = ["package.json"],
  packageBinRequired = false
) {
  const names = [...exactFiles];
  for (const directory of subdirectories) {
    await listRuntimeFiles(root.canonicalRoot, directory, names);
  }
  await addExactPackageBinFiles(root, names, packageBinRequired);
  names.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  if (names.length === 0 || new Set(names).size !== names.length) fail();
  const digest = createHash("sha256");
  digest.update("ProofEra/BSC-Testnet/PTA/runtime-tree/v1\0", "utf8");
  let totalBytes = 0;
  for (const name of names) {
    if (name.includes("\\") || name.startsWith("/") || name.includes("../")) fail();
    const path = resolve(root.canonicalRoot, ...name.split("/"));
    const canonicalPath = await realpath(path);
    if (!isWithin(root.canonicalRoot, canonicalPath)) fail();
    const file = await readStableRegularFile(path, 16 * 1024 * 1024, true);
    const nameBytes = Buffer.from(name, "utf8");
    const frame = Buffer.alloc(12);
    try {
      frame.writeUInt32BE(nameBytes.byteLength, 0);
      frame.writeBigUInt64BE(BigInt(file.bytes.byteLength), 4);
      digest.update(frame);
      digest.update(nameBytes);
      digest.update(file.bytes);
      totalBytes += file.bytes.byteLength;
    } finally {
      frame.fill(0);
      nameBytes.fill(0);
      file.bytes.fill(0);
    }
  }
  await assertRuntimeRootStable(root);
  return Object.freeze({ digest: digest.digest("hex"), files: names.length, bytes: totalBytes });
}

function sameRuntimeTreeManifest(actual, expected) {
  return (
    actual.digest === expected.digest &&
    actual.files === expected.files &&
    actual.bytes === expected.bytes
  );
}

async function assertPinnedExternalRuntimeTrees() {
  const curves = await openPinnedRuntimeRoot(
    resolve(REPOSITORY_ROOT, "packages/integrations/node_modules/@noble/curves"),
    PINNED_RUNTIME_ROOT_RELATIVE_PATHS.nobleCurves
  );
  const hashes = await openPinnedRuntimeRoot(
    resolve(REPOSITORY_ROOT, "packages/integrations/node_modules/@noble/hashes"),
    PINNED_RUNTIME_ROOT_RELATIVE_PATHS.nobleHashes
  );
  const viem = await openPinnedRuntimeRoot(
    resolve(REPOSITORY_ROOT, "packages/integrations/node_modules/viem"),
    PINNED_RUNTIME_ROOT_RELATIVE_PATHS.viem
  );
  const isows = await openPinnedRuntimeRoot(
    resolve(dirname(viem.canonicalRoot), "isows"),
    PINNED_RUNTIME_ROOT_RELATIVE_PATHS.isows
  );
  const serverOnly = await openPinnedRuntimeRoot(
    resolve(REPOSITORY_ROOT, "packages/integrations/node_modules/server-only"),
    PINNED_RUNTIME_ROOT_RELATIVE_PATHS.serverOnly
  );
  const typescript = await openPinnedRuntimeRoot(
    resolve(REPOSITORY_ROOT, "node_modules/typescript"),
    PINNED_RUNTIME_ROOT_RELATIVE_PATHS.typescript
  );
  const ws = await openEquivalentRuntimeRoot(resolve(dirname(isows.canonicalRoot), "ws"), {
    canonicalRoot: resolve(REPOSITORY_ROOT, ...PINNED_RUNTIME_ROOT_RELATIVE_PATHS.ws.split("/"))
  });
  const abitypeForViem = await openPinnedRuntimeRoot(
    resolve(dirname(viem.canonicalRoot), "abitype"),
    PINNED_RUNTIME_ROOT_RELATIVE_PATHS.abitypeForViem
  );
  const ox = await openPinnedRuntimeRoot(
    resolve(dirname(viem.canonicalRoot), "ox"),
    PINNED_RUNTIME_ROOT_RELATIVE_PATHS.ox
  );
  const abitypeForOx = await openPinnedRuntimeRoot(
    resolve(dirname(ox.canonicalRoot), "abitype"),
    PINNED_RUNTIME_ROOT_RELATIVE_PATHS.abitypeForOx
  );
  const viemCurves = await openEquivalentRuntimeRoot(
    resolve(dirname(viem.canonicalRoot), "@noble/curves"),
    curves
  );
  const viemHashes = await openEquivalentRuntimeRoot(
    resolve(dirname(viem.canonicalRoot), "@noble/hashes"),
    hashes
  );
  const oxCurves = await openEquivalentRuntimeRoot(
    resolve(dirname(ox.canonicalRoot), "@noble/curves"),
    curves
  );
  const oxHashes = await openEquivalentRuntimeRoot(
    resolve(dirname(ox.canonicalRoot), "@noble/hashes"),
    hashes
  );
  const curvesHashes = await openEquivalentRuntimeRoot(
    resolve(dirname(curves.canonicalRoot), "hashes"),
    hashes
  );
  const actual = Object.freeze({
    abitypeForOx: await deriveRuntimeTreeManifest(
      abitypeForOx,
      ["dist/esm"],
      ["package.json"],
      true
    ),
    abitypeForViem: await deriveRuntimeTreeManifest(
      abitypeForViem,
      ["dist/esm"],
      ["package.json"],
      true
    ),
    nobleCurves: await deriveRuntimeTreeManifest(curves, ["esm"]),
    nobleHashes: await deriveRuntimeTreeManifest(hashes, ["esm"]),
    isows: await deriveRuntimeTreeManifest(isows, ["_esm"]),
    ox: await deriveRuntimeTreeManifest(ox, ["_esm"], ["package.json"], true),
    serverOnly: await deriveRuntimeTreeManifest(serverOnly, [], ["empty.js", "package.json"]),
    typescript: await deriveRuntimeTreeManifest(
      typescript,
      [],
      ["lib/typescript.js", "package.json"],
      true
    ),
    viem: await deriveRuntimeTreeManifest(viem, ["_esm"], ["package.json"], true),
    ws: await deriveRuntimeTreeManifest(ws, [""], [])
  });
  for (const name of Object.keys(PINNED_RUNTIME_TREE_MANIFESTS)) {
    if (!sameRuntimeTreeManifest(actual[name], PINNED_RUNTIME_TREE_MANIFESTS[name])) fail();
  }
  await assertWsOptionalNativeModulesAbsent(ws.canonicalRoot);
  await assertTypeScriptOptionalModuleAbsent(typescript.canonicalRoot);
  await Promise.all(
    [
      abitypeForOx,
      abitypeForViem,
      curves,
      curvesHashes,
      hashes,
      isows,
      ox,
      oxCurves,
      oxHashes,
      serverOnly,
      typescript,
      viem,
      viemCurves,
      viemHashes,
      ws
    ].map((root) => assertRuntimeRootStable(root))
  );
}

async function assertPhaseZeroReadOnlyRelease(expected) {
  if (
    version !== PINNED_NODE_VERSION ||
    !samePath(execPath, PINNED_NODE_EXECUTABLE) ||
    !samePath(argv[0], PINNED_NODE_EXECUTABLE) ||
    !samePath(argv[1], PHASE_ZERO_PATH) ||
    !samePath(await realpath(REPOSITORY_ROOT), REPOSITORY_ROOT) ||
    !samePath(await realpath(cwd()), REPOSITORY_ROOT)
  ) {
    fail();
  }
  assertEnvironmentBoundary();
  await Promise.all([
    assertPinnedExecutable(
      PINNED_NODE_EXECUTABLE,
      PINNED_NODE_EXECUTABLE_BYTES,
      PINNED_NODE_EXECUTABLE_SHA256
    ),
    assertPinnedExecutable(
      PINNED_GIT_EXECUTABLE,
      PINNED_GIT_EXECUTABLE_BYTES,
      PINNED_GIT_EXECUTABLE_SHA256
    ),
    assertNoRepositoryAttributeOverride()
  ]);
  await assertExpectedGitIdentity(expected, false);
  const [runtimeManifestSha256] = await Promise.all([
    deriveReleaseSourceManifest(expected),
    assertPinnedExternalRuntimeTrees(),
    assertCloserRuntimeShadowPathsAbsent(),
    assertExactPnpmPackageParentTopologies()
  ]);
  if (runtimeManifestSha256 !== expected.runtimeManifestSha256) fail();
  await assertExpectedGitIdentity(expected, true);
  if ((await deriveReleaseSourceManifest(expected)) !== expected.runtimeManifestSha256) fail();
  await assertPinnedExternalRuntimeTrees();
  await assertCloserRuntimeShadowPathsAbsent();
  await assertExactPnpmPackageParentTopologies();
}

function spawnExactPhaseOne(expected) {
  const childArguments = [
    "--no-warnings",
    "--conditions=react-server",
    "--experimental-loader",
    `./${TYPESCRIPT_LOADER_RELATIVE_PATH}`,
    `./${PHASE_ONE_CLI_RELATIVE_PATH}`,
    "--release-commit",
    expected.releaseCommit,
    "--release-tree",
    expected.releaseTree,
    "--runtime-manifest-sha256",
    expected.runtimeManifestSha256
  ];
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let child;
    try {
      child = spawn(PINNED_NODE_EXECUTABLE, childArguments, {
        cwd: REPOSITORY_ROOT,
        env: MINIMAL_PHASE_ONE_ENVIRONMENT,
        shell: false,
        stdio: "inherit",
        windowsHide: true
      });
    } catch {
      rejectPromise(new PhaseZeroFailure());
      return;
    }
    child.once("error", () => {
      if (settled) return;
      settled = true;
      rejectPromise(new PhaseZeroFailure());
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (signal !== null || !Number.isInteger(code) || code < 0 || code > 255) {
        rejectPromise(new PhaseZeroFailure());
        return;
      }
      resolvePromise(code);
    });
  });
}

async function writeBlockedResult() {
  const bytes = Buffer.from(
    `${JSON.stringify({
      status: "blocked",
      code: "PHASE_ZERO_BOOTSTRAP_FAILED",
      message: "The trusted local release bootstrap failed closed before phase one."
    })}\n`,
    "utf8"
  );
  try {
    await new Promise((resolvePromise, rejectPromise) => {
      process.stdout.write(bytes, (error) =>
        error === null || error === undefined ? resolvePromise() : rejectPromise(error)
      );
    });
  } finally {
    bytes.fill(0);
  }
}

async function main() {
  const expected = parseExpectedReleaseArguments();
  await assertPhaseZeroReadOnlyRelease(expected);
  process.exitCode = await spawnExactPhaseOne(expected);
}

main().catch(async () => {
  process.exitCode = 1;
  try {
    await writeBlockedResult();
  } catch {
    // The process remains failed. Phase zero never prints argv, environment, paths, or file bytes.
  }
});
