import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_ROOT = join(PACKAGE_ROOT, "vendor", "pancake-v3");
const SOURCE_COMMIT = "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57";
const DEPLOYMENT_COMMIT = "986847948755cba528324d41be19480731c36c2a";
const PROVENANCE_MANIFEST_SHA256 =
  "8f8cf45cae3d3a8cc51bfb27f6602a7cd43220d4793f1c7a8801a42250758dc1";
const MASK_64 = (1n << 64n) - 1n;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const KECCAK_ROTATION_OFFSETS = Object.freeze([
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
]);

const KECCAK_ROUND_CONSTANTS = Object.freeze([
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
]);

const ARTIFACT_SPECS = Object.freeze([
  Object.freeze({
    id: "bscTestnetDeployment",
    path: `${DEPLOYMENT_COMMIT}/deployments/bscTestnet.json`,
    upstreamPath: "deployments/bscTestnet.json",
    commit: DEPLOYMENT_COMMIT,
    gitBlobSha1: "caee7134e35cc17a5c1874bd21ae2f909f3cac04",
    byteLength: 768,
    sha256: "18e6a1db8212ac187d579476c26ebcc1ae86bc11d5e6467c5fe8e8b18606c441",
  }),
  Object.freeze({
    id: "poolInitializerInterface",
    path: `${SOURCE_COMMIT}/projects/v3-periphery/contracts/interfaces/IPoolInitializer.sol`,
    upstreamPath:
      "projects/v3-periphery/contracts/interfaces/IPoolInitializer.sol",
    commit: SOURCE_COMMIT,
    gitBlobSha1: "d2949b3d6c42d6409af4c90333b41b2410723c4d",
    byteLength: 1162,
    sha256: "1c6c3661807129156f46ac0e3a8a582a2600cbfe983751b79844981b573ac33a",
  }),
  Object.freeze({
    id: "poolInitializerImplementation",
    path: `${SOURCE_COMMIT}/projects/v3-periphery/contracts/base/PoolInitializer.sol`,
    upstreamPath: "projects/v3-periphery/contracts/base/PoolInitializer.sol",
    commit: SOURCE_COMMIT,
    gitBlobSha1: "2c4dd9058d8b496d62fd6dbd3f532dd9ada8fb8b",
    byteLength: 1190,
    sha256: "ed0d234b15dab205f874522cc4c76761b584ecdebd89a45cdf1edb3d5e84ab88",
  }),
  Object.freeze({
    id: "factoryInterface",
    path: `${SOURCE_COMMIT}/projects/v3-core/contracts/interfaces/IPancakeV3Factory.sol`,
    upstreamPath: "projects/v3-core/contracts/interfaces/IPancakeV3Factory.sol",
    commit: SOURCE_COMMIT,
    gitBlobSha1: "2665464a147e09b4760271aabb3da76278b3c3ed",
    byteLength: 5977,
    sha256: "390685b7ff3fe9d4a0895fc9a420402dd0ce01adb6dc7137c022d68c65a66bdd",
  }),
  Object.freeze({
    id: "factoryImplementation",
    path: `${SOURCE_COMMIT}/projects/v3-core/contracts/PancakeV3Factory.sol`,
    upstreamPath: "projects/v3-core/contracts/PancakeV3Factory.sol",
    commit: SOURCE_COMMIT,
    gitBlobSha1: "e55da82dcd790cecad352b946400e9fc662ff646",
    byteLength: 6218,
    sha256: "6f4364c4b9761586f7b6eb71bf2344485e12eb01851419da4c1c81ad266d2a00",
  }),
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

function rotateLeft64(value, offset) {
  if (offset === 0) return value & MASK_64;
  const shift = BigInt(offset);
  return ((value << shift) | (value >> (64n - shift))) & MASK_64;
}

function keccakPermutation(state) {
  for (const roundConstant of KECCAK_ROUND_CONSTANTS) {
    const parity = Array.from({ length: 5 }, (_, x) =>
      [0, 1, 2, 3, 4].reduce((value, y) => value ^ state[x + 5 * y], 0n),
    );
    const deltas = Array.from(
      { length: 5 },
      (_, x) => parity[(x + 4) % 5] ^ rotateLeft64(parity[(x + 1) % 5], 1),
    );
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (state[x + 5 * y] ^ deltas[x]) & MASK_64;
      }
    }

    const rotated = Array(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const destinationX = y;
        const destinationY = (2 * x + 3 * y) % 5;
        rotated[destinationX + 5 * destinationY] = rotateLeft64(
          state[x + 5 * y],
          KECCAK_ROTATION_OFFSETS[x + 5 * y],
        );
      }
    }

    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const current = rotated[x + 5 * y];
        const next = rotated[((x + 1) % 5) + 5 * y];
        const afterNext = rotated[((x + 2) % 5) + 5 * y];
        state[x + 5 * y] = (current ^ (~next & MASK_64 & afterNext)) & MASK_64;
      }
    }

    state[0] = (state[0] ^ roundConstant) & MASK_64;
  }
}

export function keccak256Utf8(value) {
  if (typeof value !== "string") {
    throw new Error("Keccak input must be a UTF-8 string.");
  }

  const input = Buffer.from(value, "utf8");
  const rateBytes = 136;
  const paddedLength = Math.ceil((input.length + 1) / rateBytes) * rateBytes;
  const padded = Buffer.alloc(paddedLength);
  input.copy(padded);
  padded[input.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;

  const state = Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += rateBytes) {
    for (let lane = 0; lane < rateBytes / 8; lane += 1) {
      let valueAtLane = 0n;
      for (let byte = 0; byte < 8; byte += 1) {
        valueAtLane |=
          BigInt(padded[offset + lane * 8 + byte]) << BigInt(byte * 8);
      }
      state[lane] ^= valueAtLane;
    }
    keccakPermutation(state);
  }

  const output = Buffer.alloc(32);
  for (let byte = 0; byte < output.length; byte += 1) {
    output[byte] = Number(
      (state[Math.floor(byte / 8)] >> BigInt((byte % 8) * 8)) & 0xffn,
    );
  }
  return `0x${output.toString("hex")}`;
}

function stripSolidityComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function parseParameters(rawParameters) {
  if (rawParameters.trim() === "") return [];
  return rawParameters.split(",").map((rawParameter) => {
    const tokens = rawParameter
      .trim()
      .split(/\s+/)
      .filter(
        (token) =>
          !["calldata", "indexed", "memory", "storage"].includes(token),
      );
    if (
      tokens.length < 1 ||
      !/^[A-Za-z_][A-Za-z0-9_]*(?:\[\])?$/.test(tokens[0])
    ) {
      throw new Error(
        "Retained Solidity artifact contains an unsupported parameter shape.",
      );
    }
    return {
      type: tokens[0],
      indexed: /\bindexed\b/.test(rawParameter),
    };
  });
}

function extractDeclaration(source, declarationKind, name) {
  const stripped = stripSolidityComments(source);
  const expression = new RegExp(
    `\\b${declarationKind}\\s+${name}\\s*\\(([\\s\\S]*?)\\)`,
    "g",
  );
  const matches = [...stripped.matchAll(expression)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${declarationKind} ${name} in retained source; found ${matches.length}.`,
    );
  }
  const parameters = parseParameters(matches[0][1]);
  return {
    name,
    parameters,
    signature: `${name}(${parameters.map(({ type }) => type).join(",")})`,
  };
}

function assertExactSignature(declaration, expected) {
  if (declaration.signature !== expected) {
    throw new Error(
      `Retained official declaration drifted: expected ${expected}, found ${declaration.signature}.`,
    );
  }
  return declaration;
}

function readPinnedArtifact(spec) {
  const bytes = readFileSync(join(VENDOR_ROOT, spec.path));
  if (
    bytes.length !== spec.byteLength ||
    sha256(bytes) !== spec.sha256 ||
    gitBlobSha1(bytes) !== spec.gitBlobSha1
  ) {
    throw new Error(`Retained official artifact bytes drifted: ${spec.path}`);
  }
  if (bytes.at(-1) !== 0x0a || bytes.includes(0x0d)) {
    throw new Error(
      `Retained official artifact must preserve exact LF Git blob bytes: ${spec.path}`,
    );
  }
  return {
    ...spec,
    bytes,
    text: bytes.toString("utf8"),
  };
}

function normalizeDeploymentAddress(value, label) {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) {
    throw new Error(
      `Retained deployment ${label} is not an exact EVM address.`,
    );
  }
  return value.toLowerCase();
}

function parseFeeTiers(factorySource) {
  const stripped = stripSolidityComments(factorySource);
  const matches = [
    ...stripped.matchAll(
      /feeAmountTickSpacing\s*\[\s*([0-9]+)\s*\]\s*=\s*([0-9]+)\s*;/g,
    ),
  ];
  const tiers = matches.map((match) => ({
    fee: Number(match[1]),
    tickSpacing: Number(match[2]),
  }));
  const expected = [
    { fee: 100, tickSpacing: 1 },
    { fee: 500, tickSpacing: 10 },
    { fee: 2500, tickSpacing: 50 },
    { fee: 10000, tickSpacing: 200 },
  ];
  if (JSON.stringify(tiers) !== JSON.stringify(expected)) {
    throw new Error(
      "Retained official factory fee-tier constructor assignments drifted.",
    );
  }
  if (
    !/feeAmountTickSpacingExtraInfo\s*\[\s*500\s*\]\s*=\s*TickSpacingExtraInfo\s*\(\s*\{\s*whitelistRequested:\s*false,\s*enabled:\s*true\s*\}\s*\)\s*;/.test(
      stripped,
    )
  ) {
    throw new Error(
      "Retained official fee-500 enabled-state assignment is missing.",
    );
  }
  return tiers;
}

function loadOfficialPancakeArtifacts() {
  const provenanceBytes = readFileSync(join(VENDOR_ROOT, "PROVENANCE.json"));
  if (sha256(provenanceBytes) !== PROVENANCE_MANIFEST_SHA256) {
    throw new Error("Retained Pancake provenance manifest bytes drifted.");
  }
  const provenance = JSON.parse(provenanceBytes.toString("utf8"));
  if (
    provenance.sourceCommit !== SOURCE_COMMIT ||
    provenance.deploymentCommit !== DEPLOYMENT_COMMIT ||
    !Array.isArray(provenance.artifacts) ||
    provenance.artifacts.length !== ARTIFACT_SPECS.length
  ) {
    throw new Error(
      "Retained Pancake provenance manifest has an unexpected shape.",
    );
  }

  const artifacts = Object.fromEntries(
    ARTIFACT_SPECS.map((spec) => {
      const retained = readPinnedArtifact(spec);
      const manifestEntry = provenance.artifacts.find(
        ({ retainedPath }) => retainedPath === spec.path,
      );
      if (
        manifestEntry?.commit !== spec.commit ||
        manifestEntry.gitBlobSha1 !== spec.gitBlobSha1 ||
        manifestEntry.byteLength !== spec.byteLength ||
        manifestEntry.sha256 !== spec.sha256
      ) {
        throw new Error(
          `Provenance entry does not bind retained artifact: ${spec.path}`,
        );
      }
      return [spec.id, retained];
    }),
  );

  const expectedDeploymentKeys = [
    "MasterChefV3",
    "QuoterV2",
    "PancakeV3Factory",
    "PancakeV3PoolDeployer",
    "SwapRouter",
    "V3Migrator",
    "TickLens",
    "NonfungibleTokenPositionDescriptor",
    "NonfungiblePositionManager",
    "PancakeInterfaceMulticall",
    "PancakeV3LmPoolDeployer",
  ].sort();
  const deployment = JSON.parse(artifacts.bscTestnetDeployment.text);
  if (
    JSON.stringify(Object.keys(deployment).sort()) !==
    JSON.stringify(expectedDeploymentKeys)
  ) {
    throw new Error("Retained official BSC-testnet deployment keys drifted.");
  }

  const initializerDeclaration = assertExactSignature(
    extractDeclaration(
      artifacts.poolInitializerInterface.text,
      "function",
      "createAndInitializePoolIfNecessary",
    ),
    "createAndInitializePoolIfNecessary(address,address,uint24,uint160)",
  );
  const initializerImplementationDeclaration = assertExactSignature(
    extractDeclaration(
      artifacts.poolInitializerImplementation.text,
      "function",
      "createAndInitializePoolIfNecessary",
    ),
    initializerDeclaration.signature,
  );
  const factoryGetPoolDeclaration = assertExactSignature(
    extractDeclaration(artifacts.factoryInterface.text, "function", "getPool"),
    "getPool(address,address,uint24)",
  );
  const feeSpacingDeclaration = assertExactSignature(
    extractDeclaration(
      artifacts.factoryInterface.text,
      "function",
      "feeAmountTickSpacing",
    ),
    "feeAmountTickSpacing(uint24)",
  );
  const poolCreatedDeclaration = assertExactSignature(
    extractDeclaration(artifacts.factoryInterface.text, "event", "PoolCreated"),
    "PoolCreated(address,address,uint24,int24,address)",
  );
  if (
    JSON.stringify(
      poolCreatedDeclaration.parameters.map(({ indexed }) => indexed),
    ) !== JSON.stringify([true, true, true, false, false])
  ) {
    throw new Error(
      "Retained official PoolCreated indexed-parameter layout drifted.",
    );
  }

  const implementationWithoutComments = stripSolidityComments(
    artifacts.poolInitializerImplementation.text,
  );
  if (
    /\bdeadline\b|\bblock\s*\.\s*timestamp\b/.test(
      implementationWithoutComments,
    )
  ) {
    throw new Error(
      "Retained initializer unexpectedly contains a deadline/time check.",
    );
  }
  for (const requiredOperation of [
    "getPool",
    "createPool",
    "initialize",
    "slot0",
  ]) {
    if (
      !new RegExp(`\\b${requiredOperation}\\s*\\(`).test(
        implementationWithoutComments,
      )
    ) {
      throw new Error(
        `Retained initializer is missing required operation: ${requiredOperation}`,
      );
    }
  }

  const feeTiers = parseFeeTiers(artifacts.factoryImplementation.text);
  const signatureHash = (signature) => keccak256Utf8(signature);
  const initializerHash = signatureHash(initializerDeclaration.signature);
  const getPoolHash = signatureHash(factoryGetPoolDeclaration.signature);
  const feeSpacingHash = signatureHash(feeSpacingDeclaration.signature);
  const poolCreatedTopic0 = signatureHash(poolCreatedDeclaration.signature);

  return Object.freeze({
    provenance: Object.freeze({
      repository: provenance.repository,
      sourceCommit: SOURCE_COMMIT,
      deploymentCommit: DEPLOYMENT_COMMIT,
      manifestPath: "vendor/pancake-v3/PROVENANCE.json",
      manifestSha256: PROVENANCE_MANIFEST_SHA256,
      sourceArchiveSha256: provenance.sourceArchive.sha256,
      artifacts: Object.freeze(
        ARTIFACT_SPECS.map((spec) =>
          Object.freeze({
            id: spec.id,
            retainedPath: `vendor/pancake-v3/${spec.path}`,
            upstreamPath: spec.upstreamPath,
            commit: spec.commit,
            gitBlobSha1: spec.gitBlobSha1,
            byteLength: spec.byteLength,
            sha256: spec.sha256,
          }),
        ),
      ),
      limitation:
        "Exact retained Git blob bytes and digests provide reproducible source provenance, not fresh runtime identity, a publisher signature, or independent approval.",
    }),
    deployments: Object.freeze({
      factory: normalizeDeploymentAddress(
        deployment.PancakeV3Factory,
        "factory",
      ),
      poolDeployer: normalizeDeploymentAddress(
        deployment.PancakeV3PoolDeployer,
        "pool deployer",
      ),
      positionManager: normalizeDeploymentAddress(
        deployment.NonfungiblePositionManager,
        "position manager",
      ),
    }),
    initializer: Object.freeze({
      signature: initializerDeclaration.signature,
      keccak256: initializerHash,
      selector: initializerHash.slice(0, 10),
      parameterTypes: Object.freeze(
        initializerImplementationDeclaration.parameters.map(({ type }) => type),
      ),
      payable: /\)\s*external\s+payable\s+override\s+returns/.test(
        implementationWithoutComments,
      ),
      hasDeadlineParameter: false,
      hasOnchainTimeCheck: false,
    }),
    factoryReads: Object.freeze({
      getPool: Object.freeze({
        signature: factoryGetPoolDeclaration.signature,
        keccak256: getPoolHash,
        selector: getPoolHash.slice(0, 10),
      }),
      feeAmountTickSpacing: Object.freeze({
        signature: feeSpacingDeclaration.signature,
        keccak256: feeSpacingHash,
        selector: feeSpacingHash.slice(0, 10),
      }),
    }),
    poolCreatedEvent: Object.freeze({
      signature: poolCreatedDeclaration.signature,
      topic0: poolCreatedTopic0,
      parameterTypes: Object.freeze(
        poolCreatedDeclaration.parameters.map(({ type }) => type),
      ),
      indexed: Object.freeze(
        poolCreatedDeclaration.parameters.map(({ indexed }) => indexed),
      ),
    }),
    feeTiers: Object.freeze(feeTiers.map((tier) => Object.freeze(tier))),
  });
}

export const OFFICIAL_PANCAKE_V3_ARTIFACTS = loadOfficialPancakeArtifacts();
