import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  canonicalCompact,
  keccak256Bytes,
  sha256Bytes
} from "../pancake-selector-review/review-lib.mjs";

export const REVIEW_CONSTANTS = Object.freeze({
  sourceRepository: "https://github.com/pancakeswap/pancake-v3-contracts",
  sourceCommit: "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57",
  sourceTree: "a5f9c90fce18ca4cdb0716322f254881aa626ed0",
  sourceArchiveSha256: "b3cd0b3fd4563287f587c2776eac78e5b5a4ad98f6c805a005df10727bee782d",
  sourceArchiveByteLength: 9_912_320,
  deploymentCommit: "986847948755cba528324d41be19480731c36c2a",
  deploymentManifestSha256: "18e6a1db8212ac187d579476c26ebcc1ae86bc11d5e6467c5fe8e8b18606c441",
  yarnLockSha256: "0ea72eb976bdc96f72b2c6e21d06a92ce6af8c858715936c927610d79923183f",
  compiler: Object.freeze({
    version: "0.7.6",
    longVersion: "0.7.6+commit.7338295f",
    platform: "windows-amd64",
    fileName: "solc-windows-amd64-v0.7.6+commit.7338295f.exe",
    releaseManifestUrl: "https://binaries.soliditylang.org/windows-amd64/list.json",
    binaryUrl:
      "https://binaries.soliditylang.org/windows-amd64/solc-windows-amd64-v0.7.6+commit.7338295f.exe",
    sha256: "9214e06741c5cb51a61d745697c905f37480c0c8da1d5ac69e3bacda0063dfa5",
    keccak256: "0x4fbd020496c3a9e02c1eeb825d23f4d83d9198c4e21fda19deccdb7e74435edf"
  }),
  addresses: Object.freeze({
    factory: "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865",
    poolDeployer: "0x41ff9aa7e16b8b1a8a8dc4f0efacd93d02d071c9",
    wbnb: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
    cake: "0xfa60d973f7642b748046464e165a65b7323b0dee",
    cakeWbnbFee500Pool: "0xeaf78e3aa2c19df9495318cd9ea2ad83be7d5015",
    pta: "0x4ed64525d6fb06b7da926c683cbd809632c9b4cc",
    ptaWbnbFee500Candidate: "0x30b07e82d7181a53ae2ea98cd08b6733ffd831ae"
  }),
  expected: Object.freeze({
    poolCreationByteLength: 23_566,
    poolCreationKeccak256: "0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2",
    poolRuntimeTemplateByteLength: 22_962,
    cakePoolPatchedRuntimeKeccak256:
      "0x829cb2fca10db13c6c7f0a1a576e7e5d812e1209a8c5aa516924de8d34bcc13f",
    poolDeployerCreationByteLength: 24_588,
    poolDeployerRuntimeByteLength: 24_556,
    poolDeployerRuntimeKeccak256:
      "0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b",
    factoryCreationByteLength: 6_261,
    factoryRuntimeTemplateByteLength: 5_151,
    factoryPatchedRuntimeKeccak256:
      "0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c"
  }),
  retainedDependencies: Object.freeze({
    keccakLibraryPath: "scripts/pancake-selector-review/review-lib.mjs",
    keccakLibrarySha256: "9882a0adc797eddcb10376c1a0eed5418a1774a0f4762730052dda4d829d9e6c",
    rpcTranscriptPath:
      "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json",
    rpcTranscriptSha256: "da8f495ac9fa9f5cfc55585d4d1889e4841e48ca317c3492fd5b3c3746ffe13d",
    cakeEvidencePath:
      "evidence/development/pancake-v3-testnet-cake-wbnb-verification-2026-08-11.json",
    cakeEvidenceSha256: "9e8ef430166ede762685c25315e4907fbdafe44317ffea21a0366242cafed0f7",
    deploymentManifestPath:
      "contracts/testnet-fixed-asset/vendor/pancake-v3/986847948755cba528324d41be19480731c36c2a/deployments/bscTestnet.json"
  }),
  evidencePaths: Object.freeze({
    poolAndDeployerInput:
      "evidence/development/pancake-v3-pool-and-deployer-compiler-input-2026-08-13.json",
    factoryInput: "evidence/development/pancake-v3-factory-compiler-input-2026-08-13.json",
    sourceBindings:
      "evidence/development/pancake-v3-pool-init-code-source-bindings-2026-08-13.json",
    artifacts: "evidence/development/pancake-v3-pool-init-code-artifacts-2026-08-13.json",
    report: "evidence/development/pancake-v3-pool-init-code-provenance-2026-08-13.json"
  }),
  retainedEvidenceSha256: Object.freeze({
    poolAndDeployerInput: "4577068ddd94002be02dabc5473d1cc7755dc2dc1b661b550bbf39ce73f16aaa",
    factoryInput: "358f3ad79a6d60420381a7508af6d6358ca4b92a15799d54777c3b5f011b0b7a",
    sourceBindings: "ee6ccc7c7e20333805760c96e7b2bb88b476ac37c8ead66689d13f08a6a9444f",
    artifacts: "d47c34094d1a28e5684341380b78a8f4c7624da8c78a126fa972e9ea4519fd5a",
    report: "17511aeb99584d4c03c2a5c7452986a5692296c6bfd5dbed5945937d1ee66084"
  }),
  officialSourceBindingEntriesCanonicalSha256:
    "6b58cd9fc2446853835d2f4bb80781f5714f97f1704c5dc32f24e3bfde795299"
});

const LEAF = Symbol("report-leaf");
const SOURCE_ENTRY_SHAPE = Object.freeze({
  sourceName: LEAF,
  byteLength: LEAF,
  sha256: LEAF
});
const FILE_DIGEST_SHAPE = Object.freeze({ path: LEAF, sha256: LEAF });

const REPORT_SHAPE = Object.freeze({
  schemaVersion: LEAF,
  evidenceId: LEAF,
  capturedAt: LEAF,
  environment: LEAF,
  chain: Object.freeze({ name: LEAF, chainId: LEAF }),
  decision: Object.freeze({
    status: LEAF,
    compilerArtifactBlocker: LEAF,
    executionAuthorized: LEAF,
    currentStateFreshnessEstablished: LEAF
  }),
  officialSource: Object.freeze({
    repository: LEAF,
    commit: LEAF,
    tree: LEAF,
    archiveFormat: LEAF,
    archiveByteLength: LEAF,
    archiveSha256: LEAF,
    license: LEAF,
    publisherSignatureAuthenticated: LEAF,
    publisherBoundary: LEAF,
    yarnLockSha256: LEAF,
    hardhatVersion: LEAF,
    captureNodeVersion: LEAF,
    repositoryRequestedNodeVersion: LEAF,
    nodeBoundary: LEAF,
    reproductionConfig: Object.freeze({
      path: LEAF,
      sha256: LEAF,
      networkConfigurationIncluded: LEAF,
      accountsIncluded: LEAF,
      dotenvIncluded: LEAF
    })
  }),
  compiler: Object.freeze({
    version: LEAF,
    longVersion: LEAF,
    platform: LEAF,
    fileName: LEAF,
    releaseManifestUrl: LEAF,
    binaryUrl: LEAF,
    sha256: LEAF,
    keccak256: LEAF
  }),
  compilerInputs: Object.freeze({
    poolAndDeployer: Object.freeze({
      canonicalSha256: LEAF,
      canonicalSettingsSha256: LEAF,
      optimizerRuns: LEAF,
      sourceCount: LEAF,
      sources: Object.freeze([SOURCE_ENTRY_SHAPE]),
      hardhatBuildInfoSha256: LEAF
    }),
    factory: Object.freeze({
      canonicalSha256: LEAF,
      canonicalSettingsSha256: LEAF,
      optimizerRuns: LEAF,
      sourceCount: LEAF,
      sources: Object.freeze([SOURCE_ENTRY_SHAPE]),
      hardhatBuildInfoSha256: LEAF
    }),
    gitBlobBindings: Object.freeze({
      path: LEAF,
      entryCount: LEAF,
      compilerInputLineEndings: LEAF,
      normalizedIdentity: LEAF
    }),
    boundary: LEAF
  }),
  artifactBindings: Object.freeze({
    pool: Object.freeze({
      creationByteLength: LEAF,
      creationCodeKeccak256: LEAF,
      runtimeTemplateByteLength: LEAF,
      exactSolcRerunMatchedSnapshot: LEAF
    }),
    poolDeployer: Object.freeze({
      creationByteLength: LEAF,
      runtimeByteLength: LEAF,
      runtimeKeccak256: LEAF,
      exactSolcRerunMatchedSnapshot: LEAF,
      exactCompiledRuntimeMatchedRetainedChain97Runtime: LEAF
    }),
    factory: Object.freeze({
      creationByteLength: LEAF,
      runtimeTemplateByteLength: LEAF,
      patchedRuntimeKeccak256: LEAF,
      immutablePoolDeployer: LEAF,
      exactPatchedRuntimeMatchedRetainedChain97Runtime: LEAF
    })
  }),
  deployerProvenance: Object.freeze({
    officialDeploymentCommit: LEAF,
    officialDeploymentManifestSha256: LEAF,
    factory: LEAF,
    poolDeployer: LEAF,
    sourceControlPath: Object.freeze({
      deployRestrictedToInitializedFactory: LEAF,
      factorySetterCallerRestricted: LEAF,
      factorySetterOneTimeZeroGuard: LEAF,
      historicalInitializationRaceBoundary: LEAF,
      transientParametersSetBeforeCreate2AndDeletedAfter: LEAF,
      create2SaltExpression: LEAF,
      create2InitCode: LEAF
    }),
    historicalCheckpoint: Object.freeze({
      blockNumber: LEAF,
      blockHash: LEAF,
      twoProviderAgreementRetained: LEAF,
      freshForFutureSubmission: LEAF
    })
  }),
  create2CrossChecks: Object.freeze({
    formula: LEAF,
    knownCakeWbnbFee500: Object.freeze({
      token0: LEAF,
      token1: LEAF,
      salt: LEAF,
      derivedAddress: LEAF,
      retainedFactoryAuthenticatedAddress: LEAF,
      exact: LEAF
    }),
    ptaWbnbFee500: Object.freeze({
      token0: LEAF,
      token1: LEAF,
      salt: LEAF,
      conditionalCandidate: LEAF,
      exactGivenRetainedConstructionPath: LEAF
    })
  }),
  boundaries: Object.freeze({
    compilerArtifactProofScope: LEAF,
    ptaCandidateIsExistingPool: LEAF,
    ptaPoolReceiptIncluded: LEAF,
    ptaPoolCreatedEventIncluded: LEAF,
    freshRuntimeOrFactoryStateIncluded: LEAF,
    marketPriceClaimed: LEAF,
    liquidityClaimed: LEAF,
    remainingBeforeAnyWrite: LEAF
  }),
  securityBoundary: Object.freeze({
    testnetOnly: LEAF,
    networkConfigurationRead: LEAF,
    processEnvironmentDumped: LEAF,
    rpcPerformed: LEAF,
    walletUsed: LEAF,
    privateKeyUsed: LEAF,
    signerUsed: LEAF,
    signatureRequested: LEAF,
    transactionBroadcast: LEAF,
    mainnetActionPerformed: LEAF
  }),
  integrity: Object.freeze({
    files: Object.freeze({
      poolAndDeployerInput: FILE_DIGEST_SHAPE,
      factoryInput: FILE_DIGEST_SHAPE,
      sourceBindings: FILE_DIGEST_SHAPE,
      artifacts: FILE_DIGEST_SHAPE,
      report: Object.freeze({ path: LEAF, sha256: LEAF, reason: LEAF })
    }),
    canonicalBodySha256: LEAF
  })
});

const REPORT_SECTION_SHA256 = Object.freeze({
  schemaVersion: "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
  evidenceId: "48dabe3c002d2347525cc223686edde733acc077e59b65fb7a6e7fd7261445f2",
  capturedAt: "d5ce7e3cb1cb8c612b7df3ddfa61615c19b94c3f34e0a7a4baac7094fbe3f5d4",
  environment: "98084570738a8a99f6fc4759266eca86216623b2647c3933eb8774fd75e94b27",
  chain: "36e7278c4166691d83b38908c68ed7ae4062a5ed962e021268900535305ea90d",
  decision: "fc7f4f62de9c36f1e7a2337d23a26d96a8f38e0cb7ea39942bb1b67d5d696ffa",
  officialSource: "3988a0e3b4ffab041ea74bb6190b7a77566c1d5ee144308f288b9300d337ab3b",
  compiler: "dbaaffa371f2e8417206669747e009fb6c1b4df86cafa8dc66f09f6b33d13f65",
  compilerInputs: "440d8bdcdbc64c75e570448411755ced25011373b0dc8628e67781f2e0fb84ae",
  artifactBindings: "8c4721e1c2a763ffccd9d69869937e5b5b4e4787a1a14ce2bf71940fdd4227d9",
  deployerProvenance: "d5911050f02fc9e610f1823cb5100a0a5b0b1361251dc9538f649a093b161e49",
  create2CrossChecks: "8a6557580f8183416d66317ae597ae441b89691f9c02be9aad168724bc32ae75",
  boundaries: "a18ee82a04f248d3c0aea20b34689b5fe1c9d8c23bdb1e6effe698293a63f258",
  securityBoundary: "dd23810eeae349755e6cff3edd447d7ff2680bacfb6fae6e459c281e8ce9cb73",
  integrity: "c37eb44d7fafa0dc45bf1a1e0838c77535c366d6adb9d82658fb5d0363dbdb66"
});

function fail(message) {
  throw new Error(`Pancake pool init-code review failed closed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertExactKeys(value, expected, label) {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`
  );
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(JSON.stringify(actual) === JSON.stringify(wanted), `${label} keys drifted`);
}

function normalizeHex(value, label, bytes) {
  assert(typeof value === "string" && /^(?:0x)?[0-9a-fA-F]*$/.test(value), `${label} is not hex`);
  const normalized = value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`;
  assert((normalized.length - 2) % 2 === 0, `${label} has an odd hex length`);
  if (bytes !== undefined) {
    assert((normalized.length - 2) / 2 === bytes, `${label} byte length drifted`);
  }
  return normalized;
}

function normalizeAddress(value, label) {
  return normalizeHex(value, label, 20);
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Raw(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitBlobSha1(value) {
  return createHash("sha1").update(`blob ${value.length}\0`, "utf8").update(value).digest("hex");
}

export function sha256Canonical(value) {
  return sha256Bytes(Buffer.from(canonicalCompact(value), "utf8")).slice(2);
}

function assertExactShape(value, shape, label) {
  if (shape === LEAF) {
    assert(
      value === null || ["boolean", "number", "string"].includes(typeof value),
      `${label} must be a primitive or null`
    );
    return;
  }
  if (Array.isArray(shape)) {
    assert(Array.isArray(value), `${label} must be an array`);
    assert(shape.length === 1, `${label} verifier array shape is invalid`);
    value.forEach((entry, index) => assertExactShape(entry, shape[0], `${label}[${index}]`));
    return;
  }
  assertExactKeys(value, Object.keys(shape), label);
  for (const [key, childShape] of Object.entries(shape)) {
    assertExactShape(value[key], childShape, `${label}.${key}`);
  }
}

export function computeReportCanonicalBodySha256(report) {
  return sha256Canonical({
    poolInput: report.compilerInputs.poolAndDeployer.canonicalSha256,
    factoryInput: report.compilerInputs.factory.canonicalSha256,
    poolCreation: report.artifactBindings.pool.creationCodeKeccak256,
    poolDeployerRuntime: report.artifactBindings.poolDeployer.runtimeKeccak256,
    factoryRuntime: report.artifactBindings.factory.patchedRuntimeKeccak256,
    cakeAddress: report.create2CrossChecks.knownCakeWbnbFee500.derivedAddress,
    ptaCandidate: report.create2CrossChecks.ptaWbnbFee500.conditionalCandidate
  });
}

export function verifyReportAttestation(report) {
  assertExactShape(report, REPORT_SHAPE, "report");
  assert(
    computeReportCanonicalBodySha256(report) === report.integrity.canonicalBodySha256,
    "report canonicalBodySha256 does not match its deterministic projection"
  );
  for (const [section, expectedSha256] of Object.entries(REPORT_SECTION_SHA256)) {
    assert(
      sha256Canonical(report[section]) === expectedSha256,
      `independently pinned report section digest drifted: ${section}`
    );
  }
  return true;
}

function wordFromBigInt(value, label) {
  assert(
    typeof value === "bigint" && value >= 0n && value < 1n << 256n,
    `${label} is outside uint256`
  );
  return value.toString(16).padStart(64, "0");
}

function addressWord(address, label) {
  return normalizeAddress(address, label).slice(2).padStart(64, "0");
}

export function derivePoolCreate2({ poolDeployer, token0, token1, fee, initCodeHash }) {
  const deployer = normalizeAddress(poolDeployer, "pool deployer");
  const firstToken = normalizeAddress(token0, "token0");
  const secondToken = normalizeAddress(token1, "token1");
  assert(BigInt(firstToken) < BigInt(secondToken), "token order must be strictly ascending");
  assert(Number.isSafeInteger(fee) && fee >= 0 && fee < 2 ** 24, "fee must fit uint24");
  const initHash = normalizeHex(initCodeHash, "init-code hash", 32);
  const encodedSaltInput = Buffer.from(
    `${addressWord(firstToken, "token0")}${addressWord(secondToken, "token1")}${wordFromBigInt(BigInt(fee), "fee")}`,
    "hex"
  );
  const salt = keccak256Bytes(encodedSaltInput);
  const digest = keccak256Bytes(
    Buffer.concat([
      Buffer.from("ff", "hex"),
      Buffer.from(deployer.slice(2), "hex"),
      Buffer.from(salt.slice(2), "hex"),
      Buffer.from(initHash.slice(2), "hex")
    ])
  );
  return Object.freeze({
    salt,
    address: `0x${digest.slice(-40)}`
  });
}

function expectedCompilerSettings(runs) {
  return {
    evmVersion: "istanbul",
    optimizer: { enabled: true, runs },
    metadata: { bytecodeHash: "none" },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "evm.methodIdentifiers", "metadata"],
        "": ["ast"]
      }
    }
  };
}

export function analyzeCompilerInput(input, { optimizerRuns, requiredSources }) {
  assertExactKeys(input, ["language", "sources", "settings"], "compiler input");
  assert(input.language === "Solidity", "compiler language must be Solidity");
  assert(
    canonicalCompact(input.settings) === canonicalCompact(expectedCompilerSettings(optimizerRuns)),
    "compiler settings drifted"
  );
  assertExactKeys(input.sources, Object.keys(input.sources), "compiler sources");
  for (const sourceName of requiredSources) {
    assert(
      Object.hasOwn(input.sources, sourceName),
      `required compiler source missing: ${sourceName}`
    );
  }
  const sources = Object.entries(input.sources)
    .map(([sourceName, source]) => {
      assertExactKeys(source, ["content"], `source ${sourceName}`);
      assert(typeof source.content === "string", `source ${sourceName} content must be text`);
      return {
        sourceName,
        byteLength: Buffer.byteLength(source.content, "utf8"),
        sha256: sha256Bytes(Buffer.from(source.content, "utf8")).slice(2)
      };
    })
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
  return Object.freeze({
    optimizerRuns,
    canonicalInputSha256: sha256Canonical(input),
    canonicalSettingsSha256: sha256Canonical(input.settings),
    sourceCount: sources.length,
    sources
  });
}

function sourceText(input, sourceName) {
  const source = input.sources?.[sourceName];
  assert(source && typeof source.content === "string", `review source missing: ${sourceName}`);
  return source.content;
}

function upstreamSourcePath(sourceName) {
  if (sourceName.startsWith("contracts/")) {
    return `projects/v3-core/${sourceName}`;
  }
  const prefix = "@pancakeswap/v3-lm-pool/";
  if (sourceName.startsWith(prefix)) {
    return `projects/v3-lm-pool/${sourceName.slice(prefix.length)}`;
  }
  fail(`unsupported compiler source namespace: ${sourceName}`);
}

export function verifySourceBindingAttestation(bindingEvidence, compilerInputs) {
  assert(bindingEvidence.schemaVersion === 1, "source-binding schema drifted");
  assert(
    bindingEvidence.sourceRepository === REVIEW_CONSTANTS.sourceRepository &&
      bindingEvidence.sourceCommit === REVIEW_CONSTANTS.sourceCommit &&
      bindingEvidence.sourceTree === REVIEW_CONSTANTS.sourceTree,
    "source-binding repository identity drifted"
  );
  assert(
    sha256Canonical({
      sourceCommit: bindingEvidence.sourceCommit,
      sourceTree: bindingEvidence.sourceTree,
      entries: bindingEvidence.entries
    }) === REVIEW_CONSTANTS.officialSourceBindingEntriesCanonicalSha256,
    "independently pinned official source path/blob manifest drifted"
  );
  const union = new Map();
  for (const input of compilerInputs) {
    for (const [sourceName, { content }] of Object.entries(input.sources)) {
      if (union.has(sourceName)) {
        assert(
          union.get(sourceName) === content,
          `duplicate source content differs: ${sourceName}`
        );
      } else {
        union.set(sourceName, content);
      }
    }
  }
  assert(
    bindingEvidence.entryCount === union.size && bindingEvidence.entries.length === union.size,
    "source-binding entry count drifted"
  );
  const entries = new Map(
    bindingEvidence.entries.map((entry) => [entry.compilerSourceName, entry])
  );
  assert(entries.size === bindingEvidence.entries.length, "duplicate source-binding name");
  for (const [sourceName, content] of union) {
    const entry = entries.get(sourceName);
    assert(entry, `source binding missing: ${sourceName}`);
    assert(
      entry.upstreamPath === upstreamSourcePath(sourceName),
      `upstream path drifted: ${sourceName}`
    );
    const compilerBytes = Buffer.from(content, "utf8");
    const withoutCrLf = content.replaceAll("\r\n", "");
    assert(
      !withoutCrLf.includes("\r") && !withoutCrLf.includes("\n"),
      `compiler source has mixed or lone line endings: ${sourceName}`
    );
    const expectedLineEndings = content.includes("\r\n") ? "crlf" : "none";
    assert(
      entry.compilerInputLineEndings === expectedLineEndings &&
        entry.compilerInputByteLength === compilerBytes.length &&
        entry.compilerInputSha256 === sha256Raw(compilerBytes),
      `compiler source byte binding drifted: ${sourceName}`
    );
    const normalizedBytes = Buffer.from(content.replaceAll("\r\n", "\n"), "utf8");
    assert(
      entry.lfNormalizedByteLength === normalizedBytes.length &&
        entry.lfNormalizedSha256 === sha256Raw(normalizedBytes) &&
        entry.gitBlobSha1 === gitBlobSha1(normalizedBytes),
      `LF-normalized Git blob binding drifted: ${sourceName}`
    );
  }
  assert(
    bindingEvidence.securityBoundary.rpcPerformed === false &&
      bindingEvidence.securityBoundary.signerUsed === false &&
      bindingEvidence.securityBoundary.transactionBroadcast === false,
    "source-binding evidence crossed its offline boundary"
  );
}

export function reviewConstructionControlPath(poolAndDeployerInput, factoryInput) {
  const deployer = sourceText(poolAndDeployerInput, "contracts/PancakeV3PoolDeployer.sol");
  const factory = sourceText(factoryInput, "contracts/PancakeV3Factory.sol");
  const requiredDeployerPatterns = [
    /modifier\s+onlyFactory\s*\(\s*\)\s*\{[\s\S]*?require\s*\(\s*msg\.sender\s*==\s*factoryAddress\s*,/,
    /function\s+setFactoryAddress\s*\(\s*address\s+_factoryAddress\s*\)\s+external\s*\{/,
    /require\s*\(\s*factoryAddress\s*==\s*address\s*\(\s*0\s*\)\s*,\s*["']already initialized["']\s*\)/,
    /parameters\s*=\s*Parameters\s*\(\s*\{\s*factory:\s*factory\s*,\s*token0:\s*token0\s*,\s*token1:\s*token1\s*,\s*fee:\s*fee\s*,\s*tickSpacing:\s*tickSpacing\s*\}\s*\)/,
    /new\s+PancakeV3Pool\s*\{\s*salt:\s*keccak256\s*\(\s*abi\.encode\s*\(\s*token0\s*,\s*token1\s*,\s*fee\s*\)\s*\)\s*\}\s*\(\s*\)/,
    /delete\s+parameters\s*;/
  ];
  requiredDeployerPatterns.forEach((pattern, index) => {
    assert(pattern.test(deployer), `pool deployer control-path pattern ${index + 1} drifted`);
  });
  const requiredFactoryPatterns = [
    /address\s+public\s+immutable\s+poolDeployer\s*;/,
    /constructor\s*\(\s*address\s+_poolDeployer\s*\)\s*\{[\s\S]*?poolDeployer\s*=\s*_poolDeployer\s*;/,
    /IPancakeV3PoolDeployer\s*\(\s*poolDeployer\s*\)\s*\.\s*deploy\s*\(\s*address\s*\(\s*this\s*\)\s*,\s*token0\s*,\s*token1\s*,\s*fee\s*,\s*tickSpacing\s*\)/
  ];
  requiredFactoryPatterns.forEach((pattern, index) => {
    assert(pattern.test(factory), `factory construction-path pattern ${index + 1} drifted`);
  });
  return Object.freeze({
    deployRestrictedToInitializedFactory: true,
    factorySetterCallerRestricted: false,
    factorySetterOneTimeZeroGuard: true,
    factoryBindsImmutablePoolDeployer: true,
    transientParametersSetBeforeCreate2AndDeletedAfter: true,
    saltExpression: "keccak256(abi.encode(token0, token1, fee))"
  });
}

function contractArtifact(output, sourceName, contractName) {
  const contract = output?.contracts?.[sourceName]?.[contractName];
  assert(contract, `compiler output missing ${sourceName}:${contractName}`);
  const bytecode = normalizeHex(
    contract.evm?.bytecode?.object,
    `${contractName} creation bytecode`
  );
  const runtime = normalizeHex(
    contract.evm?.deployedBytecode?.object,
    `${contractName} runtime template`
  );
  assert(
    Object.keys(contract.evm?.bytecode?.linkReferences ?? {}).length === 0,
    `${contractName} creation bytecode has unresolved link references`
  );
  assert(
    Object.keys(contract.evm?.deployedBytecode?.linkReferences ?? {}).length === 0,
    `${contractName} runtime has unresolved link references`
  );
  return Object.freeze({
    sourceName,
    contractName,
    creationBytecode: bytecode,
    creationByteLength: (bytecode.length - 2) / 2,
    creationKeccak256: keccak256Bytes(Buffer.from(bytecode.slice(2), "hex")),
    runtimeTemplate: runtime,
    runtimeTemplateByteLength: (runtime.length - 2) / 2,
    runtimeTemplateKeccak256: keccak256Bytes(Buffer.from(runtime.slice(2), "hex")),
    immutableReferences: contract.evm?.deployedBytecode?.immutableReferences ?? {}
  });
}

function assertNoCompilerErrors(output, label) {
  const errors = Array.isArray(output?.errors) ? output.errors : [];
  const fatal = errors.filter(({ severity }) => severity === "error");
  assert(fatal.length === 0, `${label} compiler output contains ${fatal.length} error(s)`);
}

export function analyzeCompilerOutputs(poolAndDeployerOutput, factoryOutput) {
  assertNoCompilerErrors(poolAndDeployerOutput, "pool/deployer");
  assertNoCompilerErrors(factoryOutput, "factory");
  const pool = contractArtifact(
    poolAndDeployerOutput,
    "contracts/PancakeV3Pool.sol",
    "PancakeV3Pool"
  );
  const poolDeployer = contractArtifact(
    poolAndDeployerOutput,
    "contracts/PancakeV3PoolDeployer.sol",
    "PancakeV3PoolDeployer"
  );
  const factory = contractArtifact(
    factoryOutput,
    "contracts/PancakeV3Factory.sol",
    "PancakeV3Factory"
  );

  const expected = REVIEW_CONSTANTS.expected;
  assert(
    pool.creationByteLength === expected.poolCreationByteLength,
    "pool creation length drifted"
  );
  assert(pool.creationKeccak256 === expected.poolCreationKeccak256, "pool init-code hash drifted");
  assert(
    pool.runtimeTemplateByteLength === expected.poolRuntimeTemplateByteLength,
    "pool runtime length drifted"
  );
  assert(
    poolDeployer.creationByteLength === expected.poolDeployerCreationByteLength,
    "pool deployer creation length drifted"
  );
  assert(
    poolDeployer.runtimeTemplateByteLength === expected.poolDeployerRuntimeByteLength,
    "pool deployer runtime length drifted"
  );
  assert(
    poolDeployer.runtimeTemplateKeccak256 === expected.poolDeployerRuntimeKeccak256,
    "pool deployer runtime hash drifted"
  );
  assert(
    factory.creationByteLength === expected.factoryCreationByteLength,
    "factory creation length drifted"
  );
  assert(
    factory.runtimeTemplateByteLength === expected.factoryRuntimeTemplateByteLength,
    "factory runtime length drifted"
  );
  return Object.freeze({ pool, poolDeployer, factory });
}

function immutableWord(value, label) {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) {
    return addressWord(value, label);
  }
  const integer = typeof value === "bigint" ? value : BigInt(value);
  return wordFromBigInt(integer, label);
}

export function patchRuntimeImmutables(runtimeTemplate, immutableReferences, values) {
  let patched = normalizeHex(runtimeTemplate, "runtime template").slice(2);
  const expectedIds = Object.keys(values).sort();
  assert(
    JSON.stringify(Object.keys(immutableReferences).sort()) === JSON.stringify(expectedIds),
    "immutable AST-id set drifted"
  );
  for (const [astId, value] of Object.entries(values)) {
    const word = immutableWord(value, `immutable ${astId}`);
    const references = immutableReferences[astId];
    assert(
      Array.isArray(references) && references.length > 0,
      `immutable ${astId} has no references`
    );
    for (const reference of references) {
      assertExactKeys(reference, ["length", "start"], `immutable ${astId} reference`);
      assert(reference.length === 32, `immutable ${astId} reference length is not one word`);
      const start = reference.start * 2;
      assert(
        start >= 0 && start + 64 <= patched.length,
        `immutable ${astId} reference is out of bounds`
      );
      patched = `${patched.slice(0, start)}${word}${patched.slice(start + 64)}`;
    }
  }
  return `0x${patched}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireDependencyHash(repoRoot, path, expectedSha256) {
  const absolutePath = resolve(repoRoot, path);
  assert(sha256File(absolutePath) === expectedSha256, `retained dependency drifted: ${path}`);
  return absolutePath;
}

function findRead(transcript, label) {
  const matches = transcript.reads.filter((entry) => entry.label === label);
  assert(matches.length === 1, `expected one retained RPC read for ${label}`);
  const [read] = matches;
  assert(read.providerAgreementVerified === true, `provider agreement missing for ${label}`);
  assert(
    Array.isArray(read.result.normalizedResultsByProvider) &&
      read.result.normalizedResultsByProvider.length === 2 &&
      read.result.normalizedResultsByProvider.every(
        ({ normalizedResult }) => normalizedResult === read.result.normalizedResult
      ),
    `both exact normalized provider results are not retained for ${label}`
  );
  return read;
}

function snapshotOutput(snapshot, key) {
  const entry = snapshot.contracts[key];
  assert(entry, `artifact snapshot missing ${key}`);
  return {
    contracts: {
      [entry.sourceName]: {
        [entry.contractName]: {
          evm: {
            bytecode: {
              object: entry.creationBytecode,
              linkReferences: {}
            },
            deployedBytecode: {
              object: entry.runtimeTemplate,
              linkReferences: {},
              immutableReferences: entry.immutableReferences
            }
          }
        }
      }
    }
  };
}

export function verifyCommittedReview(repoRoot) {
  const paths = Object.fromEntries(
    Object.entries(REVIEW_CONSTANTS.evidencePaths).map(([key, path]) => [
      key,
      resolve(repoRoot, path)
    ])
  );
  assertExactKeys(
    REVIEW_CONSTANTS.retainedEvidenceSha256,
    Object.keys(paths),
    "independent retained evidence digest pins"
  );
  for (const [key, path] of Object.entries(paths)) {
    assert(
      sha256File(path) === REVIEW_CONSTANTS.retainedEvidenceSha256[key],
      `independently pinned retained evidence SHA-256 drifted: ${key}`
    );
  }
  const report = readJson(paths.report);
  verifyReportAttestation(report);
  const poolAndDeployerInput = readJson(paths.poolAndDeployerInput);
  const factoryInput = readJson(paths.factoryInput);
  const sourceBindings = readJson(paths.sourceBindings);
  const snapshot = readJson(paths.artifacts);
  assert(snapshot.schemaVersion === 1, "artifact snapshot schema drifted");
  assert(
    snapshot.compilerLongVersion === REVIEW_CONSTANTS.compiler.longVersion,
    "artifact snapshot compiler version drifted"
  );
  assert(
    report.chain?.chainId === 97 &&
      report.officialSource?.commit === REVIEW_CONSTANTS.sourceCommit &&
      report.officialSource?.tree === REVIEW_CONSTANTS.sourceTree &&
      report.officialSource?.archiveSha256 === REVIEW_CONSTANTS.sourceArchiveSha256,
    "report source or chain binding drifted"
  );
  assert(
    report.officialSource.publisherSignatureAuthenticated === false,
    "report overclaims an authenticated publisher signature"
  );
  assert(
    canonicalCompact(report.compiler) === canonicalCompact(REVIEW_CONSTANTS.compiler),
    "report compiler pin drifted"
  );
  const reproductionConfigPath = resolve(repoRoot, report.officialSource.reproductionConfig.path);
  assert(
    sha256File(reproductionConfigPath) === report.officialSource.reproductionConfig.sha256,
    "compile-only reproduction config drifted"
  );
  const reproductionConfig = readFileSync(reproductionConfigPath, "utf8");
  for (const forbidden of ["networks", "accounts", "dotenv", "privateKey", "mnemonic"]) {
    assert(
      !new RegExp(`\\b${forbidden}\\b`, "i").test(reproductionConfig),
      `compile-only reproduction config contains forbidden capability: ${forbidden}`
    );
  }

  const poolInputReview = analyzeCompilerInput(poolAndDeployerInput, {
    optimizerRuns: 400,
    requiredSources: ["contracts/PancakeV3Pool.sol", "contracts/PancakeV3PoolDeployer.sol"]
  });
  const factoryInputReview = analyzeCompilerInput(factoryInput, {
    optimizerRuns: 1_000_000,
    requiredSources: ["contracts/PancakeV3Factory.sol"]
  });
  reviewConstructionControlPath(poolAndDeployerInput, factoryInput);
  verifySourceBindingAttestation(sourceBindings, [poolAndDeployerInput, factoryInput]);
  assert(
    canonicalCompact(sourceBindings.compilerInputFiles) ===
      canonicalCompact([
        {
          path: REVIEW_CONSTANTS.evidencePaths.poolAndDeployerInput,
          sha256: sha256File(paths.poolAndDeployerInput)
        },
        {
          path: REVIEW_CONSTANTS.evidencePaths.factoryInput,
          sha256: sha256File(paths.factoryInput)
        }
      ]),
    "source bindings do not bind both retained compiler-input files"
  );
  assert(
    report.compilerInputs.gitBlobBindings.path === REVIEW_CONSTANTS.evidencePaths.sourceBindings &&
      report.compilerInputs.gitBlobBindings.entryCount === sourceBindings.entryCount &&
      report.compilerInputs.gitBlobBindings.normalizedIdentity ===
        "exact_lf_bytes_equal_pinned_git_blobs",
    "report Git-blob binding summary drifted"
  );
  const artifacts = analyzeCompilerOutputs(
    {
      contracts: {
        ...snapshotOutput(snapshot, "pool").contracts,
        ...snapshotOutput(snapshot, "poolDeployer").contracts
      }
    },
    snapshotOutput(snapshot, "factory")
  );

  assertExactKeys(report.integrity.files, Object.keys(paths), "report integrity files");
  for (const [key, path] of Object.entries(paths)) {
    assert(
      report.integrity.files[key].path === REVIEW_CONSTANTS.evidencePaths[key],
      `evidence path drifted: ${key}`
    );
    if (key === "report") continue;
    assert(
      sha256File(path) === report.integrity.files[key].sha256,
      `evidence file SHA-256 drifted: ${key}`
    );
  }
  assert(
    poolInputReview.canonicalInputSha256 === report.compilerInputs.poolAndDeployer.canonicalSha256,
    "pool/deployer canonical compiler-input digest drifted"
  );
  assert(
    factoryInputReview.canonicalInputSha256 === report.compilerInputs.factory.canonicalSha256,
    "factory canonical compiler-input digest drifted"
  );
  assert(
    canonicalCompact(poolInputReview.sources) ===
      canonicalCompact(report.compilerInputs.poolAndDeployer.sources),
    "pool/deployer transitive source manifest drifted"
  );
  assert(
    canonicalCompact(factoryInputReview.sources) ===
      canonicalCompact(report.compilerInputs.factory.sources),
    "factory transitive source manifest drifted"
  );

  const dependencyPaths = REVIEW_CONSTANTS.retainedDependencies;
  const transcriptPath = requireDependencyHash(
    repoRoot,
    dependencyPaths.rpcTranscriptPath,
    dependencyPaths.rpcTranscriptSha256
  );
  const cakeEvidencePath = requireDependencyHash(
    repoRoot,
    dependencyPaths.cakeEvidencePath,
    dependencyPaths.cakeEvidenceSha256
  );
  requireDependencyHash(
    repoRoot,
    dependencyPaths.keccakLibraryPath,
    dependencyPaths.keccakLibrarySha256
  );
  const deploymentPath = requireDependencyHash(
    repoRoot,
    dependencyPaths.deploymentManifestPath,
    REVIEW_CONSTANTS.deploymentManifestSha256
  );
  const deployment = readJson(deploymentPath);
  assert(
    normalizeAddress(deployment.PancakeV3Factory, "manifest factory") ===
      REVIEW_CONSTANTS.addresses.factory,
    "deployment manifest factory drifted"
  );
  assert(
    normalizeAddress(deployment.PancakeV3PoolDeployer, "manifest pool deployer") ===
      REVIEW_CONSTANTS.addresses.poolDeployer,
    "deployment manifest pool deployer drifted"
  );

  const transcript = readJson(transcriptPath);
  assert(transcript.chainId === 97, "retained transcript is not chain 97");
  const deployerRead = findRead(transcript, "code.pool_deployer");
  const factoryRead = findRead(transcript, "code.factory");
  assert(
    normalizeHex(deployerRead.result.normalizedResult, "observed deployer runtime") ===
      artifacts.poolDeployer.runtimeTemplate,
    "compiled pool deployer runtime is not byte-equal to retained chain-97 runtime"
  );
  const factoryRuntime = patchRuntimeImmutables(
    artifacts.factory.runtimeTemplate,
    artifacts.factory.immutableReferences,
    { 28: REVIEW_CONSTANTS.addresses.poolDeployer }
  );
  assert(
    factoryRuntime ===
      normalizeHex(factoryRead.result.normalizedResult, "observed factory runtime"),
    "patched compiled factory runtime is not byte-equal to retained chain-97 runtime"
  );
  assert(
    keccak256Bytes(Buffer.from(factoryRuntime.slice(2), "hex")) ===
      REVIEW_CONSTANTS.expected.factoryPatchedRuntimeKeccak256,
    "patched factory runtime hash drifted"
  );

  const cakeRuntime = patchRuntimeImmutables(
    artifacts.pool.runtimeTemplate,
    artifacts.pool.immutableReferences,
    {
      78: REVIEW_CONSTANTS.addresses.factory,
      82: REVIEW_CONSTANTS.addresses.wbnb,
      86: REVIEW_CONSTANTS.addresses.cake,
      90: 500n,
      94: 10n,
      98: 1_917_569_901_783_203_986_719_870_431_555_990n
    }
  );
  assert(
    keccak256Bytes(Buffer.from(cakeRuntime.slice(2), "hex")) ===
      REVIEW_CONSTANTS.expected.cakePoolPatchedRuntimeKeccak256,
    "known CAKE/WBNB pool patched runtime hash drifted"
  );
  const cakeEvidence = readJson(cakeEvidencePath);
  assert(
    cakeEvidence.contracts.pool.observedRuntimeKeccak256 ===
      REVIEW_CONSTANTS.expected.cakePoolPatchedRuntimeKeccak256 &&
      cakeEvidence.contracts.pool.fullRuntimeBytesEqual === true &&
      normalizeAddress(
        cakeEvidence.contracts.pool.factoryRelation.factoryGetPoolToken0Token1Fee,
        "known pool"
      ) === REVIEW_CONSTANTS.addresses.cakeWbnbFee500Pool,
    "retained CAKE/WBNB source/runtime/factory cross-check drifted"
  );

  const cakeCreate2 = derivePoolCreate2({
    poolDeployer: REVIEW_CONSTANTS.addresses.poolDeployer,
    token0: REVIEW_CONSTANTS.addresses.wbnb,
    token1: REVIEW_CONSTANTS.addresses.cake,
    fee: 500,
    initCodeHash: artifacts.pool.creationKeccak256
  });
  assert(
    cakeCreate2.address === REVIEW_CONSTANTS.addresses.cakeWbnbFee500Pool,
    "known pool CREATE2 derivation drifted"
  );
  const ptaCreate2 = derivePoolCreate2({
    poolDeployer: REVIEW_CONSTANTS.addresses.poolDeployer,
    token0: REVIEW_CONSTANTS.addresses.pta,
    token1: REVIEW_CONSTANTS.addresses.wbnb,
    fee: 500,
    initCodeHash: artifacts.pool.creationKeccak256
  });
  assert(
    ptaCreate2.address === REVIEW_CONSTANTS.addresses.ptaWbnbFee500Candidate,
    "PTA/WBNB conditional CREATE2 derivation drifted"
  );
  assert(
    findRead(transcript, "factory_binding.pool_deployer").result.decoded ===
      REVIEW_CONSTANTS.addresses.poolDeployer,
    "factory-to-pool-deployer chain binding drifted"
  );
  assert(
    findRead(transcript, "pool_deployer_binding.factory_address").result.decoded ===
      REVIEW_CONSTANTS.addresses.factory,
    "pool-deployer-to-factory chain binding drifted"
  );
  assert(
    report.deployerProvenance.sourceControlPath.factorySetterCallerRestricted === false &&
      report.deployerProvenance.sourceControlPath.factorySetterOneTimeZeroGuard === true,
    "historical pool-deployer initialization race boundary drifted"
  );

  assert(
    report.decision.compilerArtifactBlocker === "closed_exact_reproduction",
    "report does not close only the compiler/artifact blocker"
  );
  assert(report.decision.executionAuthorized === false, "report must not authorize execution");
  assert(report.securityBoundary.rpcPerformed === false, "review report must remain offline");
  assert(
    report.securityBoundary.signatureRequested === false,
    "review report requested a signature"
  );
  assert(
    report.securityBoundary.transactionBroadcast === false,
    "review report claims a broadcast"
  );
  assert(
    report.boundaries.ptaCandidateIsExistingPool === false,
    "conditional candidate was promoted to a pool"
  );

  return Object.freeze({
    report,
    poolInputReview,
    factoryInputReview,
    artifacts,
    cakeCreate2,
    ptaCreate2
  });
}

export function compareSolcOutputToSnapshot(output, snapshot, keys) {
  assertNoCompilerErrors(output, "retained standard-json");
  for (const key of keys) {
    const expected = snapshot.contracts[key];
    const actual = contractArtifact(output, expected.sourceName, expected.contractName);
    assert(
      actual.creationBytecode === expected.creationBytecode,
      `${key} creation bytecode differs from snapshot`
    );
    assert(
      actual.runtimeTemplate === expected.runtimeTemplate,
      `${key} runtime template differs from snapshot`
    );
    assert(
      canonicalCompact(actual.immutableReferences) ===
        canonicalCompact(expected.immutableReferences),
      `${key} immutable references differ from snapshot`
    );
  }
}
