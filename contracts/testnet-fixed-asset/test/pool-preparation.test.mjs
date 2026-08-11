import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, posix, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  OFFICIAL_PANCAKE_V3_ARTIFACTS,
  keccak256Utf8,
} from "../scripts/official-pancake-artifacts.mjs";

import {
  BSC_TESTNET_CHAIN_ID,
  BSC_TESTNET_WBNB,
  FACTORY_FEE_SPACING_SELECTOR,
  FACTORY_GET_POOL_SELECTOR,
  PANCAKE_V3_BSC_TESTNET_FACTORY,
  PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER,
  PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  PANCAKE_V3_FEE,
  PANCAKE_V3_TICK_SPACING,
  POOL_CREATED_EVENT_SIGNATURE,
  POOL_CREATED_EVENT_TOPIC0,
  POOL_INITIALIZER_SELECTOR,
  RAW_UNIT_ONE_TO_ONE_SQRT_PRICE_X96,
  assertPoolPreparationChainId,
  assertPtaDeploymentAddress,
  buildPoolPreparation,
  canonicalTokenOrder,
  decodePoolInitializationCalldata,
  encodePoolInitializationCalldata,
  parsePoolPreparationArguments,
  serializePoolPreparation,
  stableJson,
} from "../scripts/pool-preparation.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOWER_PTA = "0x1111111111111111111111111111111111111111";
const HIGHER_PTA = "0xffffffffffffffffffffffffffffffffffffffff";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const EXPECTED_PROVENANCE_MANIFEST_SHA256 =
  "8f8cf45cae3d3a8cc51bfb27f6602a7cd43220d4793f1c7a8801a42250758dc1";
const EXPECTED_GOLDEN_EVIDENCE_SHA256 =
  "2b0e40632d8704672304d38c64c9583b722a56618d07a5ee3f13cc199cd8a455";
const EXPECTED_GOLDEN_CASES = Object.freeze([
  Object.freeze({
    id: "pta_lower_than_wbnb",
    ptaAddress: LOWER_PTA,
    token0: LOWER_PTA,
    token1: BSC_TESTNET_WBNB,
    ptaIsToken0: true,
    canonicalInputSha256:
      "cb898e3b65d263c532a22b3fa6cc5664556b55a75973806c99b45c084f6faace",
    canonicalPlanBodySha256:
      "c53f3ae460f8068fd682a54d6a0b1058cd42f9df38cb1721e8e30b036f2212c5",
    calldataSha256:
      "cafedb0e8b5372db3a27914c5f99005046f643480ba89c2962a614b34dde4143",
    serializedCliOutputByteLength: 22194,
    serializedCliOutputSha256:
      "a0ec4b965c6d61243c2ba8155db22d187ebfb7acf8d55d8a40d993472fb1b786",
  }),
  Object.freeze({
    id: "pta_higher_than_wbnb",
    ptaAddress: HIGHER_PTA,
    token0: BSC_TESTNET_WBNB,
    token1: HIGHER_PTA,
    ptaIsToken0: false,
    canonicalInputSha256:
      "44ce5f69418145571957e3a67fe11b0136a9004f254bf86d1b184f9db088581f",
    canonicalPlanBodySha256:
      "3e842451516f3a410d0dfc696f51376ca1fb24854c80b228539207b4fca0a729",
    calldataSha256:
      "4ce16a5002cbfaac8a58db426838d2a4770a7ab1c79e02b3e3f1ba6d320efb20",
    serializedCliOutputByteLength: 22195,
    serializedCliOutputSha256:
      "b75a8975ccbd8f4d1a2511e97174d9a283aecbca6b30ec6db08d49a61e7e9ff8",
  }),
]);
const EXPECTED_OFFICIAL_ARTIFACTS = Object.freeze([
  {
    path: "vendor/pancake-v3/986847948755cba528324d41be19480731c36c2a/deployments/bscTestnet.json",
    byteLength: 768,
    sha256: "18e6a1db8212ac187d579476c26ebcc1ae86bc11d5e6467c5fe8e8b18606c441",
  },
  {
    path: "vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-periphery/contracts/interfaces/IPoolInitializer.sol",
    byteLength: 1162,
    sha256: "1c6c3661807129156f46ac0e3a8a582a2600cbfe983751b79844981b573ac33a",
  },
  {
    path: "vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-periphery/contracts/base/PoolInitializer.sol",
    byteLength: 1190,
    sha256: "ed0d234b15dab205f874522cc4c76761b584ecdebd89a45cdf1edb3d5e84ab88",
  },
  {
    path: "vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/interfaces/IPancakeV3Factory.sol",
    byteLength: 5977,
    sha256: "390685b7ff3fe9d4a0895fc9a420402dd0ce01adb6dc7137c022d68c65a66bdd",
  },
  {
    path: "vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3Factory.sol",
    byteLength: 6218,
    sha256: "6f4364c4b9761586f7b6eb71bf2344485e12eb01851419da4c1c81ad266d2a00",
  },
]);
const EXPECTED_RUNTIME_MODULE_EDGES = Object.freeze({
  "scripts/official-pancake-artifacts.mjs": Object.freeze([
    Object.freeze({
      kind: "import-from",
      specifier: "node:crypto",
      statement: 'import { createHash } from "node:crypto";',
    }),
    Object.freeze({
      kind: "import-from",
      specifier: "node:fs",
      statement: 'import { readFileSync } from "node:fs";',
    }),
    Object.freeze({
      kind: "import-from",
      specifier: "node:path",
      statement: 'import { dirname, join, resolve } from "node:path";',
    }),
    Object.freeze({
      kind: "import-from",
      specifier: "node:url",
      statement: 'import { fileURLToPath } from "node:url";',
    }),
  ]),
  "scripts/pool-preparation.mjs": Object.freeze([
    Object.freeze({
      kind: "import-from",
      specifier: "node:crypto",
      statement: 'import { createHash } from "node:crypto";',
    }),
    Object.freeze({
      kind: "import-from",
      specifier: "./official-pancake-artifacts.mjs",
      statement:
        'import { OFFICIAL_PANCAKE_V3_ARTIFACTS } from "./official-pancake-artifacts.mjs";',
    }),
  ]),
  "scripts/prepare-pool.mjs": Object.freeze([
    Object.freeze({
      kind: "import-from",
      specifier: "./pool-preparation.mjs",
      statement:
        'import { buildPoolPreparation, parsePoolPreparationArguments, serializePoolPreparation, } from "./pool-preparation.mjs";',
    }),
  ]),
});
const FORBIDDEN_RUNTIME_PATTERNS = Object.freeze([
  /\bimport\s*\(/,
  /\brequire\s*\(/,
  /\beval\s*\(/,
  /\bnew\s+Function\b/,
  /\bprocess\s*(?:\?\.\s*)?\[/,
  /\bprocess\s*(?:\?\.|\.)\s*env\b/,
  /\bprocess\s*\.\s*(?:binding|dlopen)\s*\(/,
  /globalThis\s*(?:\.|\[)/,
  /Reflect\s*\.\s*get\s*\(\s*process/,
  /node:(?:child_process|dns|dgram|http|https|net|tls|worker_threads)/,
  /from\s+["'](?:node:)?(?:child_process|dns|dgram|http|https|net|tls|worker_threads)["']/,
  /from\s+["'](?:undici|ws|viem|ethers|web3|wagmi)["']/,
  /\bfetch\s*\(/,
  /\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/,
  /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync|rename|renameSync|copyFile|copyFileSync|watch)\b/,
  /\b(?:exec|execFile|spawn|fork)(?:Sync)?\s*\(/,
  /\b(?:sendTransaction|writeContract|signTransaction|signMessage)\s*\(/,
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitBlobSha1(bytes) {
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}

function tokenizeModuleSyntax(source) {
  const tokens = [];
  const depth = { brace: 0, bracket: 0, parenthesis: 0 };
  let index = 0;

  const pushToken = (type, value, start, end) => {
    tokens.push({ type, value, start, end, depth: { ...depth } });
  };
  const previousTokenAllowsRegex = () => {
    const previous = tokens.at(-1);
    if (previous === undefined) return true;
    if (
      previous.type === "identifier" &&
      [
        "case",
        "delete",
        "else",
        "in",
        "instanceof",
        "return",
        "throw",
        "typeof",
        "void",
        "yield",
      ].includes(previous.value)
    ) {
      return true;
    }
    return (
      previous.type === "punctuator" &&
      [
        "(",
        "[",
        "{",
        ",",
        ";",
        ":",
        "=",
        "!",
        "?",
        "&",
        "|",
        "+",
        "-",
        "*",
        "%",
        "^",
        "~",
        ">",
        "<",
      ].includes(previous.value)
    );
  };

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      index += 2;
      while (index < source.length && !/[\r\n]/.test(source[index])) index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) throw new Error("Unterminated JavaScript block comment.");
      index = end + 2;
      continue;
    }
    if (character === "/" && previousTokenAllowsRegex()) {
      const start = index;
      let escaped = false;
      let inCharacterClass = false;
      index += 1;
      while (index < source.length) {
        const current = source[index];
        if (escaped) {
          escaped = false;
        } else if (current === "\\") {
          escaped = true;
        } else if (current === "[") {
          inCharacterClass = true;
        } else if (current === "]") {
          inCharacterClass = false;
        } else if (current === "/" && !inCharacterClass) {
          index += 1;
          while (/[A-Za-z]/.test(source[index] ?? "")) index += 1;
          pushToken("regex", source.slice(start, index), start, index);
          break;
        }
        index += 1;
      }
      if (tokens.at(-1)?.start !== start) {
        throw new Error("Unterminated JavaScript regular expression.");
      }
      continue;
    }
    if (character === '"' || character === "'") {
      const quote = character;
      const start = index;
      let escaped = false;
      index += 1;
      while (index < source.length) {
        const current = source[index];
        if (escaped) {
          escaped = false;
        } else if (current === "\\") {
          escaped = true;
        } else if (current === quote) {
          index += 1;
          pushToken("string", source.slice(start + 1, index - 1), start, index);
          break;
        } else if (current === "\n" || current === "\r") {
          throw new Error("Unterminated JavaScript string literal.");
        }
        index += 1;
      }
      if (tokens.at(-1)?.start !== start) {
        throw new Error("Unterminated JavaScript string literal.");
      }
      continue;
    }
    if (character === "`") {
      const start = index;
      let escaped = false;
      index += 1;
      while (index < source.length) {
        const current = source[index];
        if (escaped) {
          escaped = false;
        } else if (current === "\\") {
          escaped = true;
        } else if (current === "`") {
          index += 1;
          pushToken("template", source.slice(start, index), start, index);
          break;
        }
        index += 1;
      }
      if (tokens.at(-1)?.start !== start) {
        throw new Error("Unterminated JavaScript template literal.");
      }
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      index += 1;
      while (/[A-Za-z0-9_$]/.test(source[index] ?? "")) index += 1;
      pushToken("identifier", source.slice(start, index), start, index);
      continue;
    }

    const start = index;
    pushToken("punctuator", character, start, start + 1);
    index += 1;
    if (character === "{") depth.brace += 1;
    if (character === "[") depth.bracket += 1;
    if (character === "(") depth.parenthesis += 1;
    if (character === "}") depth.brace -= 1;
    if (character === "]") depth.bracket -= 1;
    if (character === ")") depth.parenthesis -= 1;
    if (Object.values(depth).some((value) => value < 0)) {
      throw new Error(
        "Unbalanced JavaScript delimiter while scanning modules.",
      );
    }
  }

  if (Object.values(depth).some((value) => value !== 0)) {
    throw new Error("Unbalanced JavaScript delimiter while scanning modules.");
  }
  return tokens;
}

function isTopLevel(token) {
  return Object.values(token.depth).every((value) => value === 0);
}

function staticModuleEdges(source) {
  const tokens = tokenizeModuleSyntax(source);
  const edges = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      token.type !== "identifier" ||
      !isTopLevel(token) ||
      !["import", "export"].includes(token.value)
    ) {
      continue;
    }

    const next = tokens[index + 1];
    if (
      token.value === "import" &&
      (next?.value === "(" || next?.value === ".")
    ) {
      continue;
    }
    if (token.value === "export" && !["{", "*"].includes(next?.value)) {
      continue;
    }

    const endIndex = tokens.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        candidate.value === ";" &&
        isTopLevel(candidate),
    );
    if (endIndex === -1) {
      throw new Error(`Unterminated top-level ${token.value} declaration.`);
    }
    const declarationTokens = tokens.slice(index + 1, endIndex);
    const fromIndex = declarationTokens.findIndex(
      (candidate) =>
        candidate.type === "identifier" &&
        candidate.value === "from" &&
        isTopLevel(candidate),
    );
    let kind;
    let specifierToken;
    if (token.value === "import" && next?.type === "string") {
      kind = "bare-import";
      specifierToken = next;
    } else if (fromIndex !== -1) {
      specifierToken = declarationTokens[fromIndex + 1];
      kind =
        token.value === "import"
          ? "import-from"
          : next?.value === "*"
            ? "wildcard-reexport"
            : "named-reexport";
    } else if (token.value === "export" && next?.value === "{") {
      index = endIndex;
      continue;
    } else {
      throw new Error(`Unrecognized top-level ${token.value} declaration.`);
    }
    if (specifierToken?.type !== "string") {
      throw new Error(`${kind} must use one static string module specifier.`);
    }
    const rawSpecifier = source.slice(
      specifierToken.start + 1,
      specifierToken.end - 1,
    );
    if (rawSpecifier.includes("\\")) {
      throw new Error("Escaped static module specifiers are forbidden.");
    }
    edges.push({
      kind,
      specifier: specifierToken.value,
      statement: source
        .slice(token.start, tokens[endIndex].end)
        .replace(/\s+/g, " ")
        .trim(),
    });
    index = endIndex;
  }

  return edges;
}

function resolveLocalModulePath(importerPath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const resolved = posix.normalize(
    posix.join(posix.dirname(importerPath), specifier),
  );
  if (
    resolved.startsWith("../") ||
    posix.isAbsolute(resolved) ||
    !resolved.startsWith("scripts/")
  ) {
    throw new Error(`Local runtime module escapes scripts/: ${specifier}`);
  }
  return resolved;
}

function validateRuntimeModuleGraph({ sources, allowedEdges, entrypoint }) {
  const pending = [entrypoint];
  const visited = new Set();

  while (pending.length > 0) {
    const modulePath = pending.shift();
    if (visited.has(modulePath)) continue;
    const source = sources[modulePath];
    if (typeof source !== "string") {
      throw new Error(
        `Reachable runtime module is not loaded for scanning: ${modulePath}`,
      );
    }
    const actualEdges = staticModuleEdges(source);
    if (
      JSON.stringify(actualEdges) !==
      JSON.stringify(allowedEdges[modulePath] ?? null)
    ) {
      throw new Error(`Runtime module edge allowlist mismatch: ${modulePath}`);
    }
    for (const pattern of FORBIDDEN_RUNTIME_PATTERNS) {
      if (pattern.test(source)) {
        throw new Error(
          `Forbidden runtime side effect in ${modulePath}: ${pattern}`,
        );
      }
    }
    visited.add(modulePath);
    for (const { specifier } of actualEdges) {
      const localPath = resolveLocalModulePath(modulePath, specifier);
      if (localPath !== null) pending.push(localPath);
    }
  }

  const loadedPaths = Object.keys(sources).sort();
  const visitedPaths = [...visited].sort();
  if (JSON.stringify(loadedPaths) !== JSON.stringify(visitedPaths)) {
    throw new Error(
      "Runtime source set contains an unreachable unscanned module.",
    );
  }
  return visitedPaths;
}

async function readPoolAbiCompilation() {
  const artifactDirectory = resolve(
    PACKAGE_ROOT,
    "artifacts/pool-abi/abi/IPancakeV3PoolPreparation.sol",
  );
  const poolReadArtifact = JSON.parse(
    await readFile(
      resolve(artifactDirectory, "IPancakeV3PoolPreparation.json"),
      "utf8",
    ),
  );
  const [buildInfo, buildOutput] = await Promise.all([
    readFile(
      resolve(
        PACKAGE_ROOT,
        `artifacts/pool-abi/build-info/${poolReadArtifact.buildInfoId}.json`,
      ),
      "utf8",
    ).then(JSON.parse),
    readFile(
      resolve(
        PACKAGE_ROOT,
        `artifacts/pool-abi/build-info/${poolReadArtifact.buildInfoId}.output.json`,
      ),
      "utf8",
    ).then(JSON.parse),
  ]);
  const poolContracts =
    buildOutput.output.contracts["project/abi/IPancakeV3PoolPreparation.sol"];
  const initializerContracts =
    buildOutput.output.contracts[
      "project/vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-periphery/contracts/interfaces/IPoolInitializer.sol"
    ];
  const factoryContracts =
    buildOutput.output.contracts[
      "project/vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/interfaces/IPancakeV3Factory.sol"
    ];

  return {
    poolReadArtifact,
    buildInfo,
    poolContract: poolContracts.IPancakeV3PoolPreparation,
    initializerContract: initializerContracts.IPoolInitializer,
    factoryContract: factoryContracts.IPancakeV3Factory,
  };
}

test("retained official deployment and source Git blobs match independent byte pins", async () => {
  const provenanceRaw = await readFile(
    resolve(PACKAGE_ROOT, "vendor/pancake-v3/PROVENANCE.json"),
  );
  const provenance = JSON.parse(provenanceRaw.toString("utf8"));
  assert.equal(sha256(provenanceRaw), EXPECTED_PROVENANCE_MANIFEST_SHA256);
  assert.equal(
    provenance.sourceCommit,
    "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57",
  );
  assert.equal(
    provenance.deploymentCommit,
    "986847948755cba528324d41be19480731c36c2a",
  );

  for (const expected of EXPECTED_OFFICIAL_ARTIFACTS) {
    const bytes = await readFile(resolve(PACKAGE_ROOT, expected.path));
    assert.equal(bytes.length, expected.byteLength, expected.path);
    assert.equal(sha256(bytes), expected.sha256, expected.path);
    assert.equal(bytes.at(-1), 0x0a, expected.path);
    assert.equal(bytes.includes(0x0d), false, expected.path);
    const retained = OFFICIAL_PANCAKE_V3_ARTIFACTS.provenance.artifacts.find(
      ({ retainedPath }) => retainedPath === expected.path,
    );
    assert.equal(retained?.byteLength, expected.byteLength);
    assert.equal(retained?.sha256, expected.sha256);
    assert.match(retained?.gitBlobSha1 ?? "", /^[0-9a-f]{40}$/);
    assert.equal(gitBlobSha1(bytes), retained?.gitBlobSha1, expected.path);
  }

  const deployment = JSON.parse(
    await readFile(
      resolve(PACKAGE_ROOT, EXPECTED_OFFICIAL_ARTIFACTS[0].path),
      "utf8",
    ),
  );
  assert.equal(
    deployment.PancakeV3Factory.toLowerCase(),
    PANCAKE_V3_BSC_TESTNET_FACTORY,
  );
  assert.equal(
    deployment.PancakeV3PoolDeployer.toLowerCase(),
    PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER,
  );
  assert.equal(
    deployment.NonfungiblePositionManager.toLowerCase(),
    PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  );
});

test("retained official bytes independently derive signatures, fee spacing, and event layout", () => {
  assert.equal(
    OFFICIAL_PANCAKE_V3_ARTIFACTS.initializer.signature,
    "createAndInitializePoolIfNecessary(address,address,uint24,uint160)",
  );
  assert.equal(
    OFFICIAL_PANCAKE_V3_ARTIFACTS.initializer.selector,
    "0x13ead562",
  );
  assert.equal(OFFICIAL_PANCAKE_V3_ARTIFACTS.initializer.payable, true);
  assert.equal(
    OFFICIAL_PANCAKE_V3_ARTIFACTS.initializer.hasDeadlineParameter,
    false,
  );
  assert.equal(
    OFFICIAL_PANCAKE_V3_ARTIFACTS.initializer.hasOnchainTimeCheck,
    false,
  );
  assert.equal(
    OFFICIAL_PANCAKE_V3_ARTIFACTS.factoryReads.getPool.signature,
    "getPool(address,address,uint24)",
  );
  assert.equal(
    OFFICIAL_PANCAKE_V3_ARTIFACTS.factoryReads.feeAmountTickSpacing.signature,
    "feeAmountTickSpacing(uint24)",
  );
  assert.deepEqual(OFFICIAL_PANCAKE_V3_ARTIFACTS.feeTiers, [
    { fee: 100, tickSpacing: 1 },
    { fee: 500, tickSpacing: 10 },
    { fee: 2500, tickSpacing: 50 },
    { fee: 10000, tickSpacing: 200 },
  ]);
  assert.equal(
    OFFICIAL_PANCAKE_V3_ARTIFACTS.poolCreatedEvent.signature,
    POOL_CREATED_EVENT_SIGNATURE,
  );
  assert.equal(
    OFFICIAL_PANCAKE_V3_ARTIFACTS.poolCreatedEvent.topic0,
    POOL_CREATED_EVENT_TOPIC0,
  );
  assert.deepEqual(OFFICIAL_PANCAKE_V3_ARTIFACTS.poolCreatedEvent.indexed, [
    true,
    true,
    true,
    false,
    false,
  ]);
});

test("local Keccak implementation matches canonical vectors and all derived declarations", () => {
  assert.equal(
    keccak256Utf8(""),
    "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  );
  assert.equal(
    keccak256Utf8("abc"),
    "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
  );
  assert.equal(
    keccak256Utf8(POOL_CREATED_EVENT_SIGNATURE),
    "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
  );
});

test("pool preparation accepts only decimal chain 97 and a distinct deployed PTA address", () => {
  assert.equal(assertPoolPreparationChainId("97"), BSC_TESTNET_CHAIN_ID);
  assert.equal(assertPoolPreparationChainId(97), BSC_TESTNET_CHAIN_ID);
  assert.equal(
    assertPtaDeploymentAddress(LOWER_PTA.toUpperCase().replace("0X", "0x")),
    LOWER_PTA,
  );

  for (const rejected of ["56", "0x61", "097", 56, undefined, null, ""]) {
    assert.throws(
      () => assertPoolPreparationChainId(rejected),
      /chain ID must be decimal 97/,
    );
  }

  for (const rejected of [
    ZERO_ADDRESS,
    BSC_TESTNET_WBNB,
    PANCAKE_V3_BSC_TESTNET_FACTORY,
    PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER,
    PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  ]) {
    assert.throws(() => assertPtaDeploymentAddress(rejected));
  }
  for (const rejected of [
    "",
    "0x1",
    "0X1111111111111111111111111111111111111111",
    "0xgg11111111111111111111111111111111111111",
    undefined,
    null,
  ]) {
    assert.throws(
      () => assertPtaDeploymentAddress(rejected),
      /20-byte 0x-prefixed hexadecimal address/,
    );
  }
});

test("CLI accepts only the two explicit non-secret inputs", () => {
  assert.deepEqual(
    parsePoolPreparationArguments([
      "--chain-id",
      "97",
      "--pta-address",
      LOWER_PTA,
    ]),
    { chainId: 97, ptaAddress: LOWER_PTA },
  );

  for (const rejected of [
    [],
    ["--chain-id", "97"],
    ["--pta-address", LOWER_PTA],
    ["--chain-id", "97", "--pta-address"],
    [
      "--chain-id",
      "97",
      "--pta-address",
      LOWER_PTA,
      "--pta-address",
      LOWER_PTA,
    ],
    ["--chain-id", "97", "--pta-address", LOWER_PTA, "--rpc-url", "x"],
    ["--chain-id", "97", "--pta-address", LOWER_PTA, "--signer", "x"],
    ["--chain-id", "97", "--pta-address", LOWER_PTA, "--private-key", "x"],
    ["--chain-id", "97", "--pta-address", LOWER_PTA, "--broadcast", "true"],
    ["--chain-id", "97", "--pta-address", LOWER_PTA, "--approval", "1"],
    ["--chain-id", "97", "--pta-address", LOWER_PTA, "--liquidity", "1"],
    ["--chain-id", "97", "--pta-address", LOWER_PTA, "--owner", LOWER_PTA],
    ["--chain-id", "97", "--pta-address", LOWER_PTA, "--recipient", LOWER_PTA],
  ]) {
    assert.throws(() => parsePoolPreparationArguments(rejected));
  }
});

test("canonical ordering compares exact address bytes in both directions", () => {
  assert.deepEqual(canonicalTokenOrder(LOWER_PTA), {
    token0: LOWER_PTA,
    token1: BSC_TESTNET_WBNB,
    ptaIsToken0: true,
  });
  assert.deepEqual(canonicalTokenOrder(HIGHER_PTA), {
    token0: BSC_TESTNET_WBNB,
    token1: HIGHER_PTA,
    ptaIsToken0: false,
  });
});

test("initializer calldata round-trips the exact static ABI values", () => {
  const { token0, token1 } = canonicalTokenOrder(LOWER_PTA);
  const calldata = encodePoolInitializationCalldata({ token0, token1 });

  assert.equal(calldata.slice(0, 10), POOL_INITIALIZER_SELECTOR);
  assert.equal(calldata.length, 2 + 8 + 4 * 64);
  assert.deepEqual(decodePoolInitializationCalldata(calldata), {
    token0,
    token1,
    fee: String(PANCAKE_V3_FEE),
    sqrtPriceX96: RAW_UNIT_ONE_TO_ONE_SQRT_PRICE_X96.toString(),
  });
  assert.equal(
    calldata,
    "0x13ead5620000000000000000000000001111111111111111111111111111111111111111000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd00000000000000000000000000000000000000000000000000000000000001f40000000000000000000000000000000000000001000000000000000000000000",
  );
});

test("calldata encoder and decoder fail closed on noncanonical and out-of-range values", () => {
  assert.throws(
    () =>
      encodePoolInitializationCalldata({
        token0: BSC_TESTNET_WBNB,
        token1: LOWER_PTA,
      }),
    /canonical ascending address order/,
  );
  assert.throws(() =>
    encodePoolInitializationCalldata({
      token0: LOWER_PTA,
      token1: BSC_TESTNET_WBNB,
      fee: 1n << 24n,
    }),
  );
  assert.throws(() =>
    encodePoolInitializationCalldata({
      token0: LOWER_PTA,
      token1: BSC_TESTNET_WBNB,
      sqrtPriceX96: 1n << 160n,
    }),
  );

  const valid = encodePoolInitializationCalldata({
    token0: LOWER_PTA,
    token1: BSC_TESTNET_WBNB,
  });
  for (const rejected of [
    valid.toUpperCase().replace("0X", "0x"),
    `0x00000000${valid.slice(10)}`,
    valid.slice(0, -2),
    `${valid}00`,
    `${valid.slice(0, 10)}f${valid.slice(11)}`,
    `${valid.slice(0, 10 + 64 * 2)}0000000000000000000000000000000000000000000000000000000001000000${valid.slice(10 + 64 * 3)}`,
  ]) {
    assert.throws(() => decodePoolInitializationCalldata(rejected));
  }
});

test("deterministic address corpus preserves ordering and calldata values", () => {
  const candidates = [];
  for (let index = 1n; index <= 256n; index += 1n) {
    candidates.push(`0x${index.toString(16).padStart(40, "0")}`);
    candidates.push(
      `0x${((1n << 160n) - 1n - index).toString(16).padStart(40, "0")}`,
    );
  }

  for (const ptaAddress of candidates) {
    const order = canonicalTokenOrder(ptaAddress);
    assert.ok(BigInt(order.token0) < BigInt(order.token1));
    const decoded = decodePoolInitializationCalldata(
      encodePoolInitializationCalldata(order),
    );
    assert.equal(decoded.token0, order.token0);
    assert.equal(decoded.token1, order.token1);
    assert.equal(decoded.fee, "500");
    assert.equal(
      decoded.sqrtPriceX96,
      RAW_UNIT_ONE_TO_ONE_SQRT_PRICE_X96.toString(),
    );
  }
});

test("plan is deterministic, canonical, explicitly blocked, and emits no liquidity or approval", () => {
  const first = buildPoolPreparation({ chainId: 97, ptaAddress: LOWER_PTA });
  const second = buildPoolPreparation({
    chainId: "97",
    ptaAddress: LOWER_PTA,
  });

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.executionReady, false);
  assert.equal(first.signatureRequested, false);
  assert.equal(first.reviewCallTupleEmitted, true);
  assert.equal(first.completeTransactionRequestEmitted, false);
  assert.equal(first.serializedTransactionRequestEmitted, false);
  assert.equal(first.unsignedTransactionEnvelopeEmitted, false);
  assert.equal(first.signedTransactionEnvelopeEmitted, false);
  assert.equal(first.status, "offline_unsigned_preparation_only");
  assert.equal(
    first.initialization.target,
    PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  );
  assert.equal(first.initialization.poolAddress, null);
  assert.equal(
    first.initialization.poolAddressStatus,
    "unresolved_not_guessed",
  );
  assert.equal(first.initialization.nativeValueBaseUnits, "0");
  assert.equal(first.initialization.price.expectedInitialTick, "0");
  assert.match(first.initialization.price.economicMeaning, /^none:/);
  assert.equal(first.safety.networkCalls, false);
  assert.equal(first.safety.signsTransactions, false);
  assert.equal(first.safety.readsRetainedPublicArtifacts, true);
  assert.equal(first.safety.fileSystemWrites, false);
  assert.equal(first.safety.reviewCallTupleEmitted, true);
  assert.equal(first.safety.completeTransactionRequestEmitted, false);
  assert.equal(first.safety.serializedTransactionRequestEmitted, false);
  assert.equal(first.safety.unsignedTransactionEnvelopeEmitted, false);
  assert.equal(first.safety.signedTransactionEnvelopeEmitted, false);
  assert.equal(first.safety.approvalCalldataEmitted, false);
  assert.equal(first.safety.liquidityCalldataEmitted, false);
  assert.equal(first.scope.excludes.includes("liquidity mint"), true);
  assert.equal(first.scope.excludes.includes("token approval"), true);
  assert.deepEqual(
    first.blockers.map(({ id }) => id),
    [
      "fresh_wbnb_code",
      "deployed_pta_code_and_source",
      "fresh_pancake_core_identity",
      "pool_create2_and_factory_lineage",
      "oracle_cardinality_and_history",
      "liquidity",
      "ownership",
      "selector_publication_attestation",
      "altana_policy_and_authority",
      "initializer_no_deadline_submission_lifecycle",
      "simulation",
      "user_confirmation",
    ],
  );
  assert.ok(first.blockers.every(({ status }) => status === "open"));
  assert.equal(
    first.preflightReadCalls.feeAmountTickSpacing.selector,
    FACTORY_FEE_SPACING_SELECTOR,
  );
  assert.equal(
    first.preflightReadCalls.feeAmountTickSpacing.requiredDecodedResult,
    String(PANCAKE_V3_TICK_SPACING),
  );
  assert.equal(
    first.preflightReadCalls.getPoolBeforeSubmission.selector,
    FACTORY_GET_POOL_SELECTOR,
  );
  assert.equal(
    first.preflightReadCalls.getPoolBeforeSubmission.requiredDecodedResult,
    ZERO_ADDRESS,
  );
  assert.deepEqual(first.reviewCallTuple, {
    chainId: 97,
    to: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
    data: first.initialization.calldata,
    nativeValueBaseUnits: "0",
    status: "review_components_only_not_a_transaction_request",
    omittedTransactionFields: [
      "from",
      "nonce",
      "gasLimit",
      "maxFeePerGas",
      "maxPriorityFeePerGas",
      "transactionType",
      "accessList",
      "broadcastNotBefore",
      "broadcastExpiresAt",
      "idempotencyClaim",
    ],
  });
  assert.equal(
    first.protocol.retainedOfficialArtifacts.manifestSha256,
    EXPECTED_PROVENANCE_MANIFEST_SHA256,
  );
  assert.equal(
    first.protocol.derivedOfficialInterface.initializer.hasDeadlineParameter,
    false,
  );
  assert.equal(
    first.submissionLifecycleRequirements.initializerHasDeadlineParameter,
    false,
  );
  assert.equal(
    first.submissionLifecycleRequirements.initializerHasOnchainTimeCheck,
    false,
  );
  assert.match(
    first.submissionLifecycleRequirements.warning,
    /cannot make this calldata expire onchain/,
  );
  assert.equal(
    first.poolCreatedReceiptRequirement.topic0,
    POOL_CREATED_EVENT_TOPIC0,
  );
  assert.equal(
    first.poolCreatedReceiptRequirement.emitter,
    PANCAKE_V3_BSC_TESTNET_FACTORY,
  );
  assert.equal(
    first.poolCreatedReceiptRequirement
      .ordinaryReceiptContainsFunctionReturnData,
    false,
  );
  assert.deepEqual(first.poolCreatedReceiptRequirement.indexedTopics, [
    `0x${LOWER_PTA.slice(2).padStart(64, "0")}`,
    `0x${BSC_TESTNET_WBNB.slice(2).padStart(64, "0")}`,
    `0x${BigInt(PANCAKE_V3_FEE).toString(16).padStart(64, "0")}`,
  ]);
  assert.match(
    first.poolCreatedReceiptRequirement.optionalReturnValueEvidence,
    /not a transaction-receipt field/,
  );
  assert.ok(
    first.verificationRequirements.afterConfirmedReceipt.some((requirement) =>
      requirement.includes(
        "receipts do not contain Solidity function return data",
      ),
    ),
  );
  assert.ok(
    first.verificationRequirements.afterConfirmedReceipt.some((requirement) =>
      requirement.includes("decode exactly one PoolCreated log"),
    ),
  );

  const { digests, ...body } = first;
  assert.equal(digests.canonicalInputSha256, sha256(stableJson(first.input)));
  assert.equal(digests.canonicalPlanBodySha256, sha256(stableJson(body)));
  assert.equal(
    digests.calldataSha256,
    sha256(Buffer.from(first.initialization.calldata.slice(2), "hex")),
  );
  for (const digest of [
    digests.canonicalInputSha256,
    digests.canonicalPlanBodySha256,
    digests.calldataSha256,
    first.pair.wbnb.retainedProofFileSha256,
  ]) {
    assert.match(digest, /^[0-9a-f]{64}$/);
  }
});

test("golden plans and actual CLI bytes are pinned on both sides of WBNB ordering", async () => {
  const goldenRaw = await readFile(
    resolve(
      PACKAGE_ROOT,
      "evidence/pool-preparation-golden-digests-2026-08-12.json",
    ),
  );
  const golden = JSON.parse(goldenRaw.toString("utf8"));

  assert.equal(sha256(goldenRaw), EXPECTED_GOLDEN_EVIDENCE_SHA256);
  assert.equal(golden.status, "fixture_only_offline_unsigned_golden_digests");
  assert.equal(golden.scope.chainId, BSC_TESTNET_CHAIN_ID);
  assert.equal(golden.scope.fixtureAddressesAreDeployedOrAuthorized, false);
  assert.equal(golden.scope.networkRpcSigningOrBroadcastUsed, false);
  assert.equal(golden.cases.length, EXPECTED_GOLDEN_CASES.length);

  for (const expected of EXPECTED_GOLDEN_CASES) {
    const retained = golden.cases.find(({ id }) => id === expected.id);
    assert.ok(retained, expected.id);
    assert.equal(retained.ptaAddress, expected.ptaAddress);
    assert.deepEqual(retained.ordering, {
      token0: expected.token0,
      token1: expected.token1,
      ptaIsToken0: expected.ptaIsToken0,
    });

    const plan = buildPoolPreparation({
      chainId: BSC_TESTNET_CHAIN_ID,
      ptaAddress: expected.ptaAddress,
    });
    assert.equal(plan.pair.token0, expected.token0);
    assert.equal(plan.pair.token1, expected.token1);
    assert.equal(plan.pair.ptaIsToken0, expected.ptaIsToken0);
    assert.equal(
      plan.digests.canonicalInputSha256,
      expected.canonicalInputSha256,
    );
    assert.equal(
      plan.digests.canonicalPlanBodySha256,
      expected.canonicalPlanBodySha256,
    );
    assert.equal(plan.digests.calldataSha256, expected.calldataSha256);
    assert.equal(plan.initialization.calldata, retained.calldata);
    assert.deepEqual(retained.digests, {
      canonicalInputSha256: expected.canonicalInputSha256,
      canonicalPlanBodySha256: expected.canonicalPlanBodySha256,
      calldataSha256: expected.calldataSha256,
      serializedCliOutputSha256: expected.serializedCliOutputSha256,
    });
    assert.equal(
      retained.serializedCliOutputByteLength,
      expected.serializedCliOutputByteLength,
    );

    const expectedBytes = Buffer.from(serializePoolPreparation(plan), "utf8");
    const cliBytes = execFileSync(
      process.execPath,
      [
        resolve(PACKAGE_ROOT, "scripts/prepare-pool.mjs"),
        "--chain-id",
        String(BSC_TESTNET_CHAIN_ID),
        "--pta-address",
        expected.ptaAddress,
      ],
      {
        cwd: PACKAGE_ROOT,
        encoding: null,
        env: {},
        timeout: 10_000,
        windowsHide: true,
      },
    );
    assert.deepEqual(cliBytes, expectedBytes);
    assert.equal(cliBytes.length, expected.serializedCliOutputByteLength);
    assert.equal(sha256(cliBytes), expected.serializedCliOutputSha256);
    assert.equal(cliBytes.at(-1), 0x0a);
  }
});

test("pinned WBNB reference matches the retained exact-proof file without treating it as fresh state", async () => {
  const proofRaw = await readFile(
    resolve(
      PACKAGE_ROOT,
      "../../evidence/development/pancake-v3-testnet-wbnb-source-verification-2026-08-11.json",
    ),
  );
  const proof = JSON.parse(proofRaw.toString("utf8"));
  const plan = buildPoolPreparation({ chainId: 97, ptaAddress: LOWER_PTA });

  assert.equal(sha256(proofRaw), plan.pair.wbnb.retainedProofFileSha256);
  assert.equal(proof.scope.chainId, 97);
  assert.equal(proof.scope.contract, BSC_TESTNET_WBNB);
  assert.equal(proof.scope.writesOrSignatures, false);
  assert.equal(proof.decision.wbnbComponentEligible, true);
  assert.equal(proof.decision.ptaWbnbTokenAdmissionGate, "WBNB-side closed");
  assert.equal(
    plan.pair.wbnb.status,
    "retained_exact_proof_requires_fresh_code_binding",
  );
  assert.equal(
    plan.blockers.find(({ id }) => id === "fresh_wbnb_code")?.status,
    "open",
  );
});

test("exact compiler-derived ABI method identifiers match every pinned selector", async () => {
  const {
    poolReadArtifact,
    buildInfo,
    poolContract,
    initializerContract,
    factoryContract,
  } = await readPoolAbiCompilation();

  assert.equal(poolReadArtifact._format, "hh3-artifact-1");
  assert.equal(
    poolReadArtifact.sourceName,
    "abi/IPancakeV3PoolPreparation.sol",
  );
  assert.deepEqual(initializerContract.evm.methodIdentifiers, {
    "createAndInitializePoolIfNecessary(address,address,uint24,uint160)":
      POOL_INITIALIZER_SELECTOR.slice(2),
  });
  assert.equal(
    factoryContract.evm.methodIdentifiers["feeAmountTickSpacing(uint24)"],
    FACTORY_FEE_SPACING_SELECTOR.slice(2),
  );
  assert.equal(
    factoryContract.evm.methodIdentifiers["getPool(address,address,uint24)"],
    FACTORY_GET_POOL_SELECTOR.slice(2),
  );
  assert.deepEqual(poolContract.evm.methodIdentifiers, {
    "factory()": "c45a0155",
    "fee()": "ddca3f43",
    "liquidity()": "1a686502",
    "slot0()": "3850c7bd",
    "tickSpacing()": "d0c93a7c",
    "token0()": "0dfe1681",
    "token1()": "d21220a7",
  });

  const initializerAbi = initializerContract.abi.find(
    ({ type }) => type === "function",
  );
  assert.equal(initializerAbi.name, "createAndInitializePoolIfNecessary");
  assert.equal(initializerAbi.stateMutability, "payable");
  assert.deepEqual(
    initializerAbi.inputs.map(({ type }) => type),
    ["address", "address", "uint24", "uint160"],
  );
  assert.deepEqual(
    initializerAbi.outputs.map(({ type }) => type),
    ["address"],
  );

  const poolCreatedAbi = factoryContract.abi.find(
    ({ type, name }) => type === "event" && name === "PoolCreated",
  );
  assert.deepEqual(
    poolCreatedAbi.inputs.map(({ type, indexed }) => ({ type, indexed })),
    [
      { type: "address", indexed: true },
      { type: "address", indexed: true },
      { type: "uint24", indexed: true },
      { type: "int24", indexed: false },
      { type: "address", indexed: false },
    ],
  );

  const embeddedInitializer =
    buildInfo.input.sources[
      "project/vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-periphery/contracts/interfaces/IPoolInitializer.sol"
    ].content;
  const embeddedFactory =
    buildInfo.input.sources[
      "project/vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/interfaces/IPancakeV3Factory.sol"
    ].content;
  assert.equal(
    sha256(embeddedInitializer),
    EXPECTED_OFFICIAL_ARTIFACTS[1].sha256,
  );
  assert.equal(sha256(embeddedFactory), EXPECTED_OFFICIAL_ARTIFACTS[3].sha256);
});

test("secondary compiler output stays under existing ignored artifact/cache boundaries", async () => {
  const [config, gitignore, prettierignore] = await Promise.all([
    readFile(resolve(PACKAGE_ROOT, "hardhat.pool-abi.config.js"), "utf8"),
    readFile(resolve(PACKAGE_ROOT, ".gitignore"), "utf8"),
    readFile(resolve(PACKAGE_ROOT, ".prettierignore"), "utf8"),
  ]);

  assert.match(config, /artifacts: "\.\/artifacts\/pool-abi"/);
  assert.match(config, /cache: "\.\/cache\/pool-abi"/);
  assert.doesNotMatch(config, /abi-artifacts|abi-cache/);
  assert.match(gitignore, /^artifacts\/$/m);
  assert.match(gitignore, /^cache\/$/m);
  assert.match(prettierignore, /^artifacts\/$/m);
  assert.match(prettierignore, /^cache\/$/m);
});

test("recursive runtime module graph permits only the exact pinned imports and scanned local modules", async () => {
  const sources = Object.fromEntries(
    await Promise.all(
      [
        "scripts/official-pancake-artifacts.mjs",
        "scripts/pool-preparation.mjs",
        "scripts/prepare-pool.mjs",
      ].map(async (path) => [
        path,
        await readFile(resolve(PACKAGE_ROOT, path), "utf8"),
      ]),
    ),
  );

  assert.deepEqual(
    validateRuntimeModuleGraph({
      sources,
      allowedEdges: EXPECTED_RUNTIME_MODULE_EDGES,
      entrypoint: "scripts/prepare-pool.mjs",
    }),
    [
      "scripts/official-pancake-artifacts.mjs",
      "scripts/pool-preparation.mjs",
      "scripts/prepare-pool.mjs",
    ],
  );

  for (const [label, maliciousSource] of [
    ["dynamic import", 'await import("node:fs")'],
    ["CommonJS require", 'require("node:fs")'],
    ["bracketed environment", 'process["env"].RPC_URL'],
    ["optional bracketed environment", 'process?.["env"]?.RPC_URL'],
    ["dot environment", "process.env.RPC_URL"],
    ["optional dot environment", "process?.env?.RPC_URL"],
    ["child process", 'import { spawn } from "node:child_process"'],
    ["DNS", 'import dns from "node:dns"'],
    ["datagram", 'import dgram from "node:dgram"'],
    ["HTTP client", 'import { request } from "undici"'],
    ["WebSocket", "new WebSocket(endpoint)"],
    ["filesystem write", "writeFileSync(path, bytes)"],
  ]) {
    assert.ok(
      FORBIDDEN_RUNTIME_PATTERNS.some((pattern) =>
        pattern.test(maliciousSource),
      ),
      `${label} negative control must be rejected`,
    );
  }
  assert.equal(
    sources["scripts/official-pancake-artifacts.mjs"].match(
      /\breadFileSync\s*\(/g,
    )?.length,
    2,
  );
});

test("module graph scanner rejects bare imports, re-exports, and reachable silent side effects", () => {
  const moduleSyntaxControls = [
    {
      label: "bare local import",
      source: 'import "./silent-side-effect.mjs";\n',
      expected: {
        kind: "bare-import",
        specifier: "./silent-side-effect.mjs",
        statement: 'import "./silent-side-effect.mjs";',
      },
    },
    {
      label: "bare built-in import",
      source: 'import "node:fs";\n',
      expected: {
        kind: "bare-import",
        specifier: "node:fs",
        statement: 'import "node:fs";',
      },
    },
    {
      label: "named re-export",
      source: 'export { danger } from "./danger.mjs";\n',
      expected: {
        kind: "named-reexport",
        specifier: "./danger.mjs",
        statement: 'export { danger } from "./danger.mjs";',
      },
    },
    {
      label: "wildcard re-export",
      source: 'export * from "./danger.mjs";\n',
      expected: {
        kind: "wildcard-reexport",
        specifier: "./danger.mjs",
        statement: 'export * from "./danger.mjs";',
      },
    },
  ];

  for (const { label, source, expected } of moduleSyntaxControls) {
    assert.deepEqual(staticModuleEdges(source), [expected], label);
    assert.throws(
      () =>
        validateRuntimeModuleGraph({
          sources: { "scripts/entry.mjs": source },
          allowedEdges: { "scripts/entry.mjs": [] },
          entrypoint: "scripts/entry.mjs",
        }),
      /Runtime module edge allowlist mismatch/,
      label,
    );
  }

  const entrySource = 'import "./reachable-side-effect.mjs";\n';
  const reachableSource =
    'writeFileSync("never-created", "silent forbidden side effect");\n';
  assert.throws(
    () =>
      validateRuntimeModuleGraph({
        sources: {
          "scripts/entry.mjs": entrySource,
          "scripts/reachable-side-effect.mjs": reachableSource,
        },
        allowedEdges: {
          "scripts/entry.mjs": staticModuleEdges(entrySource),
          "scripts/reachable-side-effect.mjs": [],
        },
        entrypoint: "scripts/entry.mjs",
      }),
    /Forbidden runtime side effect in scripts\/reachable-side-effect\.mjs/,
  );
});
