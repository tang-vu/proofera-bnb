import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, cwd, env, execArgv, execPath, stdin, stdout, version } from "node:process";
import { fileURLToPath } from "node:url";

const PINNED_NODE_VERSION = "v24.14.1";
const PINNED_NODE_EXECUTABLE_SHA256 =
  "58e74bf02fc5bbacc41dcb8bef089961cd5bddd37830b87784e4fc624d145d1f";
const PINNED_TYPESCRIPT_LOADER_SHA256 =
  "91c74ade17c12cca55e030935d59fed0838cd3ededd721417c147a097f968107";
const CLI_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(CLI_PATH), "..");
const LOADER_PATH = resolve(REPOSITORY_ROOT, "scripts/typescript-extension-loader.mjs");
const EXPECTED_EXEC_ARGV = Object.freeze([
  "--no-warnings",
  "--conditions=react-server",
  "--experimental-loader",
  "./scripts/typescript-extension-loader.mjs"
]);
const EXPECTED_RELEASE_ARGUMENT_LABELS = Object.freeze([
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
const EXPECTED_PRODUCTION_ENVIRONMENT = Object.freeze({
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

function hasExactProductionEnvironment(): boolean {
  const actualNames = Object.keys(env);
  const expectedNames = Object.keys(EXPECTED_PRODUCTION_ENVIRONMENT);
  return (
    actualNames.length === expectedNames.length &&
    expectedNames.every(
      (name) =>
        env[name] ===
        EXPECTED_PRODUCTION_ENVIRONMENT[name as keyof typeof EXPECTED_PRODUCTION_ENVIRONMENT]
    )
  );
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function stablePinnedFileSha256(
  path: string,
  maximumBytes: number,
  expectedSha256: string
): boolean {
  let descriptor: number | null = null;
  let bytes: Buffer | null = null;
  try {
    const pathMetadata = lstatSync(path, { bigint: true });
    if (
      !pathMetadata.isFile() ||
      pathMetadata.isSymbolicLink() ||
      pathMetadata.size < 1n ||
      pathMetadata.size > BigInt(maximumBytes) ||
      !samePath(realpathSync(path), path)
    ) {
      return false;
    }
    descriptor = openSync(path, constants.O_RDONLY);
    const before = fstatSync(descriptor, { bigint: true });
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    return (
      before.isFile() &&
      after.isFile() &&
      before.dev === after.dev &&
      before.ino === after.ino &&
      before.size === after.size &&
      before.mtimeNs === after.mtimeNs &&
      before.ctimeNs === after.ctimeNs &&
      BigInt(bytes.byteLength) === before.size &&
      createHash("sha256").update(bytes).digest("hex") === expectedSha256
    );
  } catch {
    return false;
  } finally {
    bytes?.fill(0);
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // Bootstrap remains failed if the preceding checks did not complete successfully.
      }
    }
  }
}

function assertExactProductionBootstrap(): void {
  const exactExecArguments =
    Array.isArray(execArgv) &&
    Object.getPrototypeOf(execArgv) === Array.prototype &&
    execArgv.length === EXPECTED_EXEC_ARGV.length &&
    execArgv.every((value, index) => value === EXPECTED_EXEC_ARGV[index]);
  if (
    version !== PINNED_NODE_VERSION ||
    !hasExactProductionEnvironment() ||
    Object.keys(env).some((name) => FORBIDDEN_ENVIRONMENT_NAMES.has(name.toUpperCase())) ||
    !exactExecArguments ||
    argv.length !== 8 ||
    typeof argv[0] !== "string" ||
    typeof argv[1] !== "string" ||
    argv[2] !== EXPECTED_RELEASE_ARGUMENT_LABELS[0] ||
    argv[4] !== EXPECTED_RELEASE_ARGUMENT_LABELS[1] ||
    argv[6] !== EXPECTED_RELEASE_ARGUMENT_LABELS[2] ||
    typeof argv[3] !== "string" ||
    typeof argv[5] !== "string" ||
    typeof argv[7] !== "string" ||
    !/^[0-9a-f]{40}$/u.test(argv[3]) ||
    !/^[0-9a-f]{40}$/u.test(argv[5]) ||
    !/^0x[0-9a-f]{64}$/u.test(argv[7]) ||
    argv[3] === "0".repeat(40) ||
    argv[5] === "0".repeat(40) ||
    argv[7] === `0x${"00".repeat(32)}` ||
    !samePath(argv[0], execPath) ||
    !samePath(argv[1], CLI_PATH) ||
    !samePath(realpathSync(REPOSITORY_ROOT), REPOSITORY_ROOT) ||
    !samePath(realpathSync(cwd()), REPOSITORY_ROOT) ||
    !stablePinnedFileSha256(execPath, 128 * 1024 * 1024, PINNED_NODE_EXECUTABLE_SHA256) ||
    !stablePinnedFileSha256(LOADER_PATH, 64 * 1024, PINNED_TYPESCRIPT_LOADER_SHA256)
  ) {
    throw new Error("PRODUCTION_BOOTSTRAP_INVALID");
  }
}

function writeResult(value: unknown): Promise<void> {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  return new Promise<void>((resolve, reject) => {
    stdout.write(bytes, (error) => {
      bytes.fill(0);
      if (error === null || error === undefined) resolve();
      else reject(error);
    });
  });
}

async function main(): Promise<void> {
  assertExactProductionBootstrap();
  if (stdin.isTTY !== true || stdout.isTTY !== true) {
    throw new Error("CONTROLLING_TTY_REQUIRED");
  }
  // Do not evaluate the executable stack until the active Node binary, arguments, condition,
  // sole loader, entrypoint, working tree root, and absence of NODE_OPTIONS have been checked.
  const { runBscTestnetPtaWbnbPoolProductionOnceFromStdin } =
    await import("../packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-runner.server");
  const result = await runBscTestnetPtaWbnbPoolProductionOnceFromStdin();
  await writeResult(result);
  if (result.status !== "confirmed") process.exitCode = 1;
}

main().catch(async () => {
  process.exitCode = 1;
  try {
    await writeResult(
      Object.freeze({
        status: "blocked",
        code: "POOL_INITIALIZATION_RUNNER_FAILED",
        message: "The exact BSC testnet PTA/WBNB pool runner failed closed."
      })
    );
  } catch {
    // The process remains failed; never print environment, input, custody, or transaction bytes.
  }
});
