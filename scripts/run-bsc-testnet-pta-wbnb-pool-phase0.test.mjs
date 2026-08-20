import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

import { resolve as resolveProductionModule } from "./typescript-extension-loader.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "scripts/run-bsc-testnet-pta-wbnb-pool-phase0.mjs");
const PHASE_MINUS_ONE_SOURCE = resolve(
  ROOT,
  "scripts/run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1"
);
const SIGNING_WORKER_SOURCE = resolve(
  ROOT,
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-signing-worker.ts"
);
const GENERIC_SIGNING_WORKER_SOURCE = resolve(
  ROOT,
  "packages/integrations/src/bsc-testnet-pta-signing-worker.ts"
);
const POOL_CLI_SOURCE = resolve(ROOT, "scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts");
const PREFIX = "proofera-phase0-blackbox-";
const COMMIT = "1".repeat(40);
const TREE = "2".repeat(40);
const MANIFEST = `0x${"3".repeat(64)}`;
const EXACT_PHASE_ONE_ENVIRONMENT = Object.freeze({
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
const temporaryRoots = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), PREFIX));
  temporaryRoots.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const directory = temporaryRoots.pop();
    if (
      directory === undefined ||
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !resolve(directory).toLowerCase().includes(PREFIX)
    ) {
      throw new Error("Unsafe phase-zero test cleanup target.");
    }
    rmSync(directory, { force: true, recursive: true });
  }
});

function exactArguments(entry = SOURCE) {
  return [
    entry,
    "--release-commit",
    COMMIT,
    "--release-tree",
    TREE,
    "--runtime-manifest-sha256",
    MANIFEST
  ];
}

function run(arguments_, environment = {}) {
  return spawnSync(process.execPath, arguments_, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...EXACT_PHASE_ONE_ENVIRONMENT, ...environment },
    maxBuffer: 32 * 1024,
    shell: false,
    timeout: 30_000,
    windowsHide: true
  });
}

function assertBlocked(result) {
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "blocked",
    code: "PHASE_ZERO_BOOTSTRAP_FAILED",
    message: "The trusted local release bootstrap failed closed before phase one."
  });
  assert.equal(result.stderr, "");
}

function replaced(values, index, value) {
  const result = [...values];
  result[index] = value;
  return result;
}

function exactPowerShellFunction(source, name) {
  const start = source.indexOf(`function ${name} {`);
  assert.ok(start >= 0, `missing PowerShell function ${name}`);
  const end = source.indexOf("\n}\n\ntry {", start);
  assert.ok(end > start, `unterminated PowerShell function ${name}`);
  return source.slice(start, end + 2);
}

function literalReleasePaths(source, endMarker, additions) {
  const start = source.indexOf("const RELEASE_SOURCE_PATHS");
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  const paths = [
    ...block.matchAll(
      /"((?:\.gitattributes|package\.json|pnpm-lock\.yaml|(?:packages|scripts)\/[^"\r\n]+))"/gu
    )
  ].map((match) => match[1]);
  return [...new Set([...paths, ...additions])].sort();
}

test("phase zero rejects missing, extra, malformed, and reordered release arguments", () => {
  const exact = exactArguments();
  const cases = [
    [SOURCE],
    [...exact, "--unexpected"],
    replaced(exact, 1, "--release-tree"),
    replaced(exact, 2, "not-a-commit"),
    replaced(exact, 4, "0".repeat(40)),
    replaced(exact, 6, `0x${"00".repeat(32)}`)
  ];
  for (const arguments_ of cases) assertBlocked(run(arguments_));
});

test("phase zero rejects every security-sensitive ambient variable case-insensitively", () => {
  for (const name of [
    "ALL_PROXY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NODE_PATH",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "NODE_USE_ENV_PROXY",
    "NO_PROXY",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE"
  ]) {
    const result = run(exactArguments(), { [name.toLowerCase()]: "synthetic" });
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
    assertBlocked(result);
  }
  const compileCacheRoot = temporaryDirectory();
  assertBlocked(
    run(exactArguments(), {
      node_compile_cache: resolve(compileCacheRoot, "node-compile-cache")
    })
  );
  // NODE_OPTIONS and NODE_EXTRA_CA_CERTS are consumed by Node before user code. A harmless value
  // still proves that the bootstrap cannot accidentally admit either ambient channel.
  assertBlocked(run(exactArguments(), { NODE_OPTIONS: "--no-warnings" }));
  // OpenSSL reads this before JavaScript; nonzero pre-bootstrap termination is the only safe result.
  const openssl = run(exactArguments(), { OPENSSL_CONF: "Z:\\missing-synthetic.cnf" });
  assert.notEqual(openssl.status, 0);
  assert.equal(openssl.stdout.includes('"status":"confirmed"'), false);
  const extraCa = run(exactArguments(), {
    NODE_EXTRA_CA_CERTS: "Z:\\missing-synthetic.pem"
  });
  assert.notEqual(extraCa.status, 0);
  assert.equal(extraCa.stdout.includes('"status":"confirmed"'), false);
});

test("phase zero refuses a copied or symlinked entrypoint before any child can exist", () => {
  const directory = temporaryDirectory();
  const copy = resolve(directory, "phase0-copy.mjs");
  copyFileSync(SOURCE, copy);
  assertBlocked(run(exactArguments(copy)));

  if (process.platform !== "win32") {
    const link = resolve(directory, "phase0-link.mjs");
    symlinkSync(SOURCE, link);
    assertBlocked(run(exactArguments(link)));
  }
  assert.equal(existsSync(resolve(directory, "child-sentinel")), false);
});

test("the fixed phase-one environment survives a Node subprocess boundary exactly", () => {
  const result = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(JSON.stringify(process.env))"],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: EXACT_PHASE_ONE_ENVIRONMENT,
      maxBuffer: 32 * 1024,
      shell: false,
      timeout: 30_000,
      windowsHide: true
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.deepEqual(JSON.parse(result.stdout), EXACT_PHASE_ONE_ENVIRONMENT);
  const source = readFileSync(SOURCE, "utf8");
  assert.match(
    source,
    /const MINIMAL_PHASE_ONE_ENVIRONMENT = FIXED_WINDOWS_SUBPROCESS_ENVIRONMENT;/u
  );
  for (const [name, value] of Object.entries(EXACT_PHASE_ONE_ENVIRONMENT)) {
    assert.ok(source.includes(`${name}: ${JSON.stringify(value)}`), name);
  }
});

test(
  "the fixed environment preserves the pinned Windows custody profile",
  {
    skip: process.platform !== "win32"
  },
  () => {
    const localApplicationData = spawnSync(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Console]::Out.Write([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData))"
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: EXACT_PHASE_ONE_ENVIRONMENT,
        maxBuffer: 32 * 1024,
        shell: false,
        timeout: 30_000,
        windowsHide: true
      }
    );
    assert.equal(localApplicationData.status, 0, localApplicationData.stderr);
    assert.equal(localApplicationData.stdout, "C:\\Users\\tangm\\AppData\\Local");
  }
);

test("phase-zero source has only Node built-ins, no test bypass, and one ordered spawn", () => {
  const source = readFileSync(SOURCE, "utf8");
  assert.doesNotMatch(source, /from\s+["'](?!node:)/u);
  assert.doesNotMatch(source, /PROOFERA_PHASE_ZERO_TEST|testModeEnabled|testOverride/u);
  assert.equal((source.match(/child = spawn\(/gu) ?? []).length, 1);
  const firstIdentity = source.indexOf("await assertExpectedGitIdentity(expected, false)");
  const firstManifest = source.indexOf("deriveReleaseSourceManifest(expected)", firstIdentity);
  const externalRuntime = source.indexOf("assertPinnedExternalRuntimeTrees()", firstManifest);
  const secondIdentity = source.indexOf("await assertExpectedGitIdentity(expected, true)");
  const secondManifest = source.indexOf("await deriveReleaseSourceManifest(expected)");
  const spawn = source.indexOf("child = spawn(");
  assert.ok(firstIdentity >= 0 && firstManifest > firstIdentity);
  assert.ok(externalRuntime > firstManifest);
  assert.ok(secondIdentity > externalRuntime && secondManifest > secondIdentity);
  assert.ok(spawn > secondManifest);
  assert.equal(lstatSync(SOURCE).isSymbolicLink(), false);
  assert.ok(readFileSync(SOURCE).byteLength < 64 * 1024);
});

test("phase zero and phase one bind the same complete release-source set", () => {
  const phaseZero = literalReleasePaths(
    readFileSync(SOURCE, "utf8"),
    "const PINNED_RUNTIME_TREE_MANIFESTS",
    [
      "scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts",
      "scripts/run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1",
      "scripts/typescript-extension-loader.mjs"
    ]
  );
  const phaseOne = literalReleasePaths(
    readFileSync(SIGNING_WORKER_SOURCE, "utf8"),
    "const PRODUCTION_RELEASE_ARGUMENT_LABELS",
    [
      "packages/integrations/src/bsc-testnet-pta-wbnb-pool-signing-worker.ts",
      "scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts",
      "scripts/run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1",
      "scripts/run-bsc-testnet-pta-wbnb-pool-phase0.mjs",
      "scripts/typescript-extension-loader.mjs"
    ]
  );
  assert.deepEqual(phaseZero, phaseOne);
});

test("every nested noble resolver junction stays bound to the hashed canonical tree", () => {
  const curves = realpathSync(resolve(ROOT, "packages/integrations/node_modules/@noble/curves"));
  const hashes = realpathSync(resolve(ROOT, "packages/integrations/node_modules/@noble/hashes"));
  const viem = realpathSync(resolve(ROOT, "packages/integrations/node_modules/viem"));
  const ox = realpathSync(resolve(dirname(viem), "ox"));
  const mappings = [
    [resolve(dirname(viem), "@noble/curves"), curves],
    [resolve(dirname(viem), "@noble/hashes"), hashes],
    [resolve(dirname(ox), "@noble/curves"), curves],
    [resolve(dirname(ox), "@noble/hashes"), hashes],
    [resolve(dirname(curves), "hashes"), hashes]
  ];
  for (const [accessPath, expectedRoot] of mappings) {
    assert.equal(lstatSync(accessPath).isSymbolicLink(), true, accessPath);
    assert.equal(realpathSync(accessPath).toLowerCase(), expectedRoot.toLowerCase(), accessPath);
  }

  const source = readFileSync(SOURCE, "utf8");
  assert.match(source, /async function openEquivalentRuntimeRoot\(accessPath, expected\)/u);
  assert.match(source, /!samePath\(root\.canonicalRoot, expected\.canonicalRoot\)/u);
  for (const path of [
    'resolve(dirname(viem.canonicalRoot), "@noble/curves")',
    'resolve(dirname(viem.canonicalRoot), "@noble/hashes")',
    'resolve(dirname(ox.canonicalRoot), "@noble/curves")',
    'resolve(dirname(ox.canonicalRoot), "@noble/hashes")',
    'resolve(dirname(curves.canonicalRoot), "hashes")'
  ]) {
    assert.ok(source.includes(path), path);
  }
  assert.match(source, /\.map\(\(root\) => assertRuntimeRootStable\(root\)\)/u);
});

test("phase zero closes the exact external runtime graph and every closer shadow path", () => {
  const source = readFileSync(SOURCE, "utf8");
  const expectedVariants = [
    "viem@2.55.13_typescript@6.0.3_zod@4.4.3",
    "ox@0.14.33_typescript@6.0.3_zod@4.4.3",
    "abitype@1.2.3_typescript@6.0.3_zod@4.4.3",
    "abitype@1.2.4_typescript@6.0.3_zod@4.4.3",
    "@noble+curves@1.9.1",
    "@noble+hashes@1.8.0",
    "typescript@6.0.3",
    "server-only@0.0.1",
    "isows@1.0.7_ws@8.21.0",
    "ws@8.21.0"
  ];
  for (const variant of expectedVariants) assert.ok(source.includes(variant), variant);
  for (const path of [
    "scripts/node_modules",
    "packages/integrations/src/node_modules",
    "packages/integrations/node_modules/@noble/node_modules",
    "typescript/lib/node_modules",
    "typescript/lib/package.json"
  ]) {
    assert.ok(source.includes(path), path);
  }
  assert.match(source, /entry\.name\.toLowerCase\(\) === "node_modules"/u);
  assert.match(source, /await listRuntimeFiles\(root\.canonicalRoot, directory, names\)/u);
  assert.match(source, /EXACT_PACKAGE_BIN_FILES/u);
  assert.match(source, /assertExactPnpmPackageParentTopologies/u);
  assert.match(source, /assertWsOptionalNativeModulesAbsent/u);
  assert.equal(existsSync(resolve(ROOT, "scripts/node_modules")), false);
  assert.equal(existsSync(resolve(ROOT, "packages/integrations/src/node_modules")), false);
});

test("the production loader admits only committed source and the ten hashed runtime variants", () => {
  const source = readFileSync(resolve(ROOT, "scripts/typescript-extension-loader.mjs"), "utf8");
  assert.match(source, /ALLOWED_PRODUCTION_SOURCE_PATHS/u);
  assert.match(source, /ALLOWED_RUNTIME_DIRECTORIES/u);
  assert.match(source, /ALLOWED_RUNTIME_FILES/u);
  assert.match(source, /assertAdmittedResolution/u);
  assert.match(source, /samePath\(path, canonicalPath\)/u);
  assert.match(source, /Untrusted production module resolution/u);
  assert.match(source, /isows@1\.0\.7_ws@8\.21\.0/u);
  assert.match(source, /ws@8\.21\.0/u);
  const actualVariants = [
    ...new Set([...source.matchAll(/node_modules\/\.pnpm\/([^/"]+)\//gu)].map((match) => match[1]))
  ].sort();
  assert.deepEqual(actualVariants, [
    "@noble+curves@1.9.1",
    "@noble+hashes@1.8.0",
    "abitype@1.2.3_typescript@6.0.3_zod@4.4.3",
    "abitype@1.2.4_typescript@6.0.3_zod@4.4.3",
    "isows@1.0.7_ws@8.21.0",
    "ox@0.14.33_typescript@6.0.3_zod@4.4.3",
    "server-only@0.0.1",
    "typescript@6.0.3",
    "viem@2.55.13_typescript@6.0.3_zod@4.4.3",
    "ws@8.21.0"
  ]);
});

test("both pool release inspectors pin the exact final loader bytes", () => {
  const loaderBytes = readFileSync(resolve(ROOT, "scripts/typescript-extension-loader.mjs"));
  const digest = createHash("sha256").update(loaderBytes).digest("hex");
  assert.equal(loaderBytes.byteLength, 6_684);
  assert.equal(digest, "91c74ade17c12cca55e030935d59fed0838cd3ededd721417c147a097f968107");
  assert.ok(readFileSync(POOL_CLI_SOURCE, "utf8").includes(digest));
  assert.ok(readFileSync(GENERIC_SIGNING_WORKER_SOURCE, "utf8").includes(digest));
});

test("the loader preserves legacy entrypoints and rejects shadows only after the exact pool entry", async () => {
  const legacyUrl = pathToFileURL(resolve(ROOT, "scripts/run-bsc-testnet-pta-deployment.ts")).href;
  const legacyResolution = await resolveProductionModule(
    legacyUrl,
    { parentURL: undefined },
    async () => ({ format: "module", shortCircuit: true, url: legacyUrl })
  );
  assert.equal(legacyResolution.url, legacyUrl);

  const poolUrl = pathToFileURL(
    resolve(ROOT, "scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts")
  ).href;
  const poolResolution = await resolveProductionModule(
    poolUrl,
    { parentURL: undefined },
    async () => ({ format: "module", shortCircuit: true, url: poolUrl })
  );
  assert.equal(poolResolution.url, poolUrl);

  const shadowUrl = pathToFileURL(resolve(ROOT, "scripts/node_modules/typescript/index.js")).href;
  await assert.rejects(
    resolveProductionModule(
      "typescript",
      { parentURL: pathToFileURL(resolve(ROOT, "scripts/typescript-extension-loader.mjs")).href },
      async () => ({ format: "module", shortCircuit: true, url: shadowUrl })
    ),
    /Untrusted production module/u
  );
});

test("the production loader behaviorally links the complete admitted release graph", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--conditions=react-server",
      "--experimental-loader",
      "./scripts/typescript-extension-loader.mjs",
      "--input-type=module",
      "-e",
      "await import('./packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-runner.server.ts');process.stdout.write('linked')"
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: EXACT_PHASE_ONE_ENVIRONMENT,
      maxBuffer: 32 * 1024,
      shell: false,
      timeout: 30_000,
      windowsHide: true
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, "linked");
});

test("phase minus one is a minimal fixed pre-Node environment scrubber", () => {
  const source = readFileSync(PHASE_MINUS_ONE_SOURCE, "utf8");
  assert.doesNotMatch(
    source,
    /Invoke-Expression|Import-Module|Add-Type|Start-Process|New-Object|\.\s+\$|PROOFERA_PHASE_ZERO_TEST/iu
  );
  assert.equal((source.match(/Disable-ConsoleQuickEdit\s*$/gmu) ?? []).length, 1);
  assert.match(source, /Microsoft\.Win32\.Win32Native/u);
  assert.match(source, /'GetStdHandle'/u);
  assert.match(source, /'GetConsoleMode'/u);
  assert.match(source, /'SetConsoleMode'/u);
  assert.match(source, /\$enableQuickEditMode = \[Int32\]0x0040/u);
  assert.match(source, /\$enableExtendedFlags = \[Int32\]0x0080/u);
  assert.doesNotMatch(
    source,
    /WriteConsoleInput|ReadConsoleInput|PeekConsoleInput|FlushConsoleInputBuffer|OpenStandardInput|Console\]::In/u
  );
  const hardening = source.indexOf("Disable-ConsoleQuickEdit", source.indexOf("$fixedEnvironment"));
  const node = source.indexOf("& 'D:\\Node\\node.exe'");
  assert.ok(hardening >= 0 && node > hardening);
  assert.match(source, /\[Environment\]::GetEnvironmentVariables\('Process'\)\.Keys/u);
  assert.match(source, /SetEnvironmentVariable\(\[string\]\$name, \$null, 'Process'\)/u);
  assert.match(source, /& 'D:\\Node\\node\.exe' @childArguments/u);
  assert.equal((source.match(/& 'D:\\Node\\node\.exe'/gu) ?? []).length, 1);
  assert.match(
    source,
    /\$expectedRepositoryRoot = 'C:\\Users\\tangm\\Documents\\GitHub\\proofera-bnb'/u
  );
  assert.match(
    source,
    /\$expectedPhaseZeroPath = 'C:\\Users\\tangm\\Documents\\GitHub\\proofera-bnb\\scripts\\run-bsc-testnet-pta-wbnb-pool-phase0\.mjs'/u
  );
  assert.doesNotMatch(source, /'\.\\scripts\\run-bsc-testnet-pta-wbnb-pool-phase0\.mjs'/u);
  for (const [name, value] of Object.entries(EXACT_PHASE_ONE_ENVIRONMENT)) {
    assert.ok(source.includes(`${name} = '${value}'`), name);
  }
  assert.equal(lstatSync(PHASE_MINUS_ONE_SOURCE).isSymbolicLink(), false);
  assert.ok(readFileSync(PHASE_MINUS_ONE_SOURCE).byteLength < 8 * 1024);
});

test(
  "the exact QuickEdit hardener fails closed when its native console type is unavailable",
  {
    skip: process.platform !== "win32"
  },
  () => {
    const directory = temporaryDirectory();
    const probe = resolve(directory, "quick-edit-missing-native.ps1");
    const hardener = exactPowerShellFunction(
      readFileSync(PHASE_MINUS_ONE_SOURCE, "utf8"),
      "Disable-ConsoleQuickEdit"
    ).replace("Microsoft.Win32.Win32Native", "ProofEra.Missing.ConsoleNative");
    writeFileSync(
      probe,
      `${hardener}\ntry { Disable-ConsoleQuickEdit; exit 90 } catch { exit 47 }\n`,
      "utf8"
    );
    const result = spawnSync(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", probe],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: EXACT_PHASE_ONE_ENVIRONMENT,
        maxBuffer: 4 * 1024,
        shell: false,
        timeout: 10_000,
        windowsHide: true
      }
    );
    assert.equal(result.status, 47, result.stderr);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  }
);

test(
  "the exact hardener clears QuickEdit in a new classic console without mutating queued input",
  {
    skip: process.platform !== "win32"
  },
  () => {
    const directory = temporaryDirectory();
    const probe = resolve(directory, "quick-edit-classic-console.ps1");
    const resultPath = resolve(directory, "quick-edit-result.json");
    const hardener = exactPowerShellFunction(
      readFileSync(PHASE_MINUS_ONE_SOURCE, "utf8"),
      "Disable-ConsoleQuickEdit"
    );
    writeFileSync(
      probe,
      `${hardener}
$ErrorActionPreference = 'Stop'
try {
  $flags = [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Static
  $native = [Console].Assembly.GetType('Microsoft.Win32.Win32Native', $true, $false)
  $getHandle = $native.GetMethod('GetStdHandle', $flags, $null, [Type[]]@([Int32]), $null)
  $getMode = $native.GetMethod('GetConsoleMode', $flags, $null, [Type[]]@([IntPtr], [Int32].MakeByRefType()), $null)
  $setMode = $native.GetMethod('SetConsoleMode', $flags, $null, [Type[]]@([IntPtr], [Int32]), $null)
  $peek = $native.GetMethods($flags) | Where-Object Name -ceq 'PeekConsoleInput' | Select-Object -First 1
  if ($null -eq $peek) { throw 'peek-unavailable' }
  $handle = [IntPtr]$getHandle.Invoke($null, [object[]]@([Int32]-10))
  $originalArguments = [object[]]@($handle, [Int32]0)
  if (-not [bool]$getMode.Invoke($null, $originalArguments)) { throw 'original-mode' }
  $originalMode = [Int32]$originalArguments[1]
  $testMode = [Int32](($originalMode -band (-bnot ([Int32]0x0018))) -bor ([Int32]0x00c0))
  if (-not [bool]$setMode.Invoke($null, [object[]]@($handle, $testMode))) { throw 'test-mode' }
  $beforeRecordType = $peek.GetParameters()[1].ParameterType.GetElementType()
  $beforeArguments = [object[]]@($handle, [Activator]::CreateInstance($beforeRecordType), [Int32]1, [Int32]0)
  if (-not [bool]$peek.Invoke($null, $beforeArguments)) { throw 'peek-before' }
  Disable-ConsoleQuickEdit
  $afterArguments = [object[]]@($handle, [Activator]::CreateInstance($beforeRecordType), [Int32]1, [Int32]0)
  if (-not [bool]$peek.Invoke($null, $afterArguments)) { throw 'peek-after' }
  $verifiedArguments = [object[]]@($handle, [Int32]0)
  if (-not [bool]$getMode.Invoke($null, $verifiedArguments)) { throw 'verified-mode' }
  $payload = @{
    initialMode = $testMode
    verifiedMode = [Int32]$verifiedArguments[1]
    queuedBefore = [Int32]$beforeArguments[3]
    queuedAfter = [Int32]$afterArguments[3]
  }
  [IO.File]::WriteAllText($args[0], ($payload | ConvertTo-Json -Compress), [Text.Encoding]::UTF8)
} catch {
  [IO.File]::WriteAllText(
    $args[0],
    ((@{ error = $_.Exception.Message }) | ConvertTo-Json -Compress),
    [Text.Encoding]::UTF8
  )
  exit 48
} finally {
  if ($null -ne $setMode -and $null -ne $handle -and $null -ne $originalMode) {
    [void]$setMode.Invoke($null, [object[]]@($handle, $originalMode))
  }
}
`,
      "utf8"
    );
    const escapePowerShellLiteral = (value) => value.replaceAll("'", "''");
    const executable = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    const launch =
      `$child = Start-Process -FilePath '${escapePowerShellLiteral(executable)}' ` +
      `-ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','${escapePowerShellLiteral(probe)}','${escapePowerShellLiteral(resultPath)}') ` +
      "-WindowStyle Normal -PassThru -Wait; exit $child.ExitCode";
    const result = spawnSync(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        launch
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: EXACT_PHASE_ONE_ENVIRONMENT,
        maxBuffer: 4 * 1024,
        shell: false,
        timeout: 10_000,
        windowsHide: true
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.equal(existsSync(resultPath), true);
    const observation = JSON.parse(readFileSync(resultPath, "utf8").replace(/^\uFEFF/u, ""));
    assert.equal(observation.error, undefined, observation.error);
    assert.equal(observation.initialMode & 0x40, 0x40);
    assert.equal(observation.verifiedMode & 0x40, 0);
    assert.equal(observation.verifiedMode & 0x80, 0x80);
    assert.equal(observation.verifiedMode & ~0xc0, observation.initialMode & ~0xc0);
    assert.equal(observation.queuedAfter, observation.queuedBefore);
  }
);

test(
  "phase minus one rejects redirected input before starting phase zero or a harmless preload",
  {
    skip: process.platform !== "win32"
  },
  () => {
    const directory = temporaryDirectory();
    const sentinel = resolve(directory, "preload-sentinel");
    const preload = resolve(directory, "preload.cjs");
    writeFileSync(
      preload,
      `require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "unexpected");\n`,
      "utf8"
    );
    const result = spawnSync(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        PHASE_MINUS_ONE_SOURCE,
        "--release-commit",
        COMMIT,
        "--release-tree",
        TREE,
        "--runtime-manifest-sha256",
        MANIFEST
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: `--require=${preload}` },
        maxBuffer: 32 * 1024,
        shell: false,
        timeout: 30_000,
        windowsHide: true
      }
    );
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.signal, null);
    assert.equal(existsSync(sentinel), false);
    assert.deepEqual(JSON.parse(result.stdout), {
      status: "blocked",
      code: "PHASE_MINUS_ONE_BOOTSTRAP_FAILED",
      message: "The trusted Windows bootstrap failed closed before Node startup."
    });
  }
);
