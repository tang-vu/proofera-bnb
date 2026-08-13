import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REVIEW_CONSTANTS,
  analyzeCompilerInput,
  analyzeCompilerOutputs,
  compareSolcOutputToSnapshot,
  derivePoolCreate2,
  reviewConstructionControlPath,
  sha256Canonical,
  sha256File,
  verifyCommittedReview
} from "./review-lib.mjs";
import { keccak256Bytes, sha256Bytes } from "../pancake-selector-review/review-lib.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIRECTORY, "..", "..");
const CAPTURE_FLAG = "--capture-exact-offline-init-code-review";

function fail(message) {
  throw new Error(`Pancake pool init-code capture failed closed: ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: Object.hasOwn(options, "encoding") ? options.encoding : "utf8",
    input: options.input,
    maxBuffer: 48 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    fail(
      `${command} exited ${result.status}: ${(result.stderr || result.stdout || "").toString().trim()}`
    );
  }
  return result.stdout;
}

function git(checkoutRoot, args, options = {}) {
  return run("git", ["-C", checkoutRoot, ...args], options);
}

function writeNewJson(relativePath, value) {
  const absolutePath = resolve(REPO_ROOT, relativePath);
  if (existsSync(absolutePath)) fail(`refusing to overwrite ${relativePath}`);
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  return absolutePath;
}

function readBuildInfo(checkoutRoot, contractPath, contractName) {
  const artifactDirectory = join(
    checkoutRoot,
    "projects",
    "v3-core",
    "artifacts-proofera-init-code",
    "contracts",
    contractPath
  );
  const debug = JSON.parse(
    readFileSync(join(artifactDirectory, `${contractName}.dbg.json`), "utf8")
  );
  if (debug._format !== "hh-sol-dbg-1" || typeof debug.buildInfo !== "string") {
    fail(`${contractName} debug artifact shape drifted`);
  }
  const buildInfoPath = resolve(artifactDirectory, debug.buildInfo);
  return {
    path: buildInfoPath,
    value: JSON.parse(readFileSync(buildInfoPath, "utf8"))
  };
}

function compileStandardJson(solcPath, input) {
  const outputText = run(solcPath, ["--standard-json"], {
    input: JSON.stringify(input)
  });
  const output = JSON.parse(outputText);
  const fatal = (output.errors ?? []).filter(({ severity }) => severity === "error");
  if (fatal.length > 0) fail(`solc returned ${fatal.length} error(s)`);
  return output;
}

function artifactSnapshot(artifacts) {
  const keep = ({
    sourceName,
    contractName,
    creationBytecode,
    runtimeTemplate,
    immutableReferences
  }) => ({
    sourceName,
    contractName,
    creationBytecode,
    runtimeTemplate,
    immutableReferences
  });
  return {
    schemaVersion: 1,
    recordType: "exact_solc_standard_json_artifact_snapshot",
    compilerLongVersion: REVIEW_CONSTANTS.compiler.longVersion,
    contracts: {
      pool: keep(artifacts.pool),
      poolDeployer: keep(artifacts.poolDeployer),
      factory: keep(artifacts.factory)
    },
    boundary:
      "These are exact local compiler outputs bound to the retained Standard JSON inputs; they are not transaction data or execution authorization."
  };
}

function main() {
  const [flag, rawCheckoutRoot, rawSolcPath] = process.argv.slice(2);
  if (process.argv.slice(2).length !== 3 || flag !== CAPTURE_FLAG) {
    fail(`expected exactly: ${CAPTURE_FLAG} <official-checkout-root> <pinned-solc-path>`);
  }
  const checkoutRoot = resolve(rawCheckoutRoot);
  const solcPath = resolve(rawSolcPath);
  if (!existsSync(join(checkoutRoot, ".git"))) fail("official checkout is not a Git worktree");
  if (!existsSync(solcPath)) fail("pinned solc binary does not exist");
  if (sha256File(solcPath) !== REVIEW_CONSTANTS.compiler.sha256)
    fail("solc binary SHA-256 drifted");
  if (keccak256Bytes(readFileSync(solcPath)) !== REVIEW_CONSTANTS.compiler.keccak256) {
    fail("solc binary Keccak-256 drifted");
  }

  const head = git(checkoutRoot, ["rev-parse", "HEAD"]).trim();
  const tree = git(checkoutRoot, ["rev-parse", "HEAD^{tree}"]).trim();
  const trackedDiff = git(checkoutRoot, ["status", "--porcelain", "--untracked-files=no"]).trim();
  if (head !== REVIEW_CONSTANTS.sourceCommit || tree !== REVIEW_CONSTANTS.sourceTree) {
    fail("official source commit/tree drifted");
  }
  if (trackedDiff !== "") fail("official checkout has tracked modifications");
  const sourceArchive = git(checkoutRoot, ["archive", "--format=tar", "HEAD"], {
    encoding: null
  });
  if (
    sourceArchive.length !== REVIEW_CONSTANTS.sourceArchiveByteLength ||
    sha256Bytes(sourceArchive).slice(2) !== REVIEW_CONSTANTS.sourceArchiveSha256
  ) {
    fail("official source archive bytes drifted");
  }
  if (sha256File(join(checkoutRoot, "yarn.lock")) !== REVIEW_CONSTANTS.yarnLockSha256) {
    fail("official Yarn lockfile drifted");
  }

  const v3CoreRoot = join(checkoutRoot, "projects", "v3-core");
  const hardhatCli = join(checkoutRoot, "node_modules", "hardhat", "internal", "cli", "cli.js");
  if (!existsSync(hardhatCli)) fail("Hardhat 2.13.0 CLI is not installed in the official checkout");
  const hardhatPackage = JSON.parse(
    readFileSync(join(checkoutRoot, "node_modules", "hardhat", "package.json"), "utf8")
  );
  if (hardhatPackage.version !== "2.13.0") fail("installed Hardhat version drifted");
  run(
    process.execPath,
    [
      hardhatCli,
      "compile",
      "--force",
      "--config",
      join(SCRIPT_DIRECTORY, "hardhat.reproduction.config.cjs")
    ],
    { cwd: v3CoreRoot }
  );

  const poolBuild = readBuildInfo(checkoutRoot, "PancakeV3Pool.sol", "PancakeV3Pool");
  const deployerBuild = readBuildInfo(
    checkoutRoot,
    "PancakeV3PoolDeployer.sol",
    "PancakeV3PoolDeployer"
  );
  const factoryBuild = readBuildInfo(checkoutRoot, "PancakeV3Factory.sol", "PancakeV3Factory");
  if (poolBuild.value.solcLongVersion !== REVIEW_CONSTANTS.compiler.longVersion) {
    fail("pool build-info compiler version drifted");
  }
  if (deployerBuild.value.solcLongVersion !== REVIEW_CONSTANTS.compiler.longVersion) {
    fail("pool deployer build-info compiler version drifted");
  }
  if (factoryBuild.value.solcLongVersion !== REVIEW_CONSTANTS.compiler.longVersion) {
    fail("factory build-info compiler version drifted");
  }

  const poolInput = analyzeCompilerInput(deployerBuild.value.input, {
    optimizerRuns: 400,
    requiredSources: ["contracts/PancakeV3Pool.sol", "contracts/PancakeV3PoolDeployer.sol"]
  });
  const factoryInput = analyzeCompilerInput(factoryBuild.value.input, {
    optimizerRuns: 1_000_000,
    requiredSources: ["contracts/PancakeV3Factory.sol"]
  });
  reviewConstructionControlPath(deployerBuild.value.input, factoryBuild.value.input);
  if (
    poolInput.canonicalInputSha256 !==
    "56f4a6aa554a4480d46d359e49a3aa570bcc3d6e373b599f00591b456ff6d66c"
  ) {
    fail("pool/deployer canonical compiler input drifted");
  }
  if (
    factoryInput.canonicalInputSha256 !==
    "74bb2f58facb94e6f95b383dbb2c80a0ee5a7a54a11a03d287045b49354a1516"
  ) {
    fail("factory canonical compiler input drifted");
  }

  const poolOutput = compileStandardJson(solcPath, deployerBuild.value.input);
  const factoryOutput = compileStandardJson(solcPath, factoryBuild.value.input);
  const artifacts = analyzeCompilerOutputs(poolOutput, factoryOutput);
  const snapshot = artifactSnapshot(artifacts);
  compareSolcOutputToSnapshot(poolOutput, snapshot, ["pool", "poolDeployer"]);
  compareSolcOutputToSnapshot(factoryOutput, snapshot, ["factory"]);

  const inputPath = writeNewJson(
    REVIEW_CONSTANTS.evidencePaths.poolAndDeployerInput,
    deployerBuild.value.input
  );
  const factoryInputPath = writeNewJson(
    REVIEW_CONSTANTS.evidencePaths.factoryInput,
    factoryBuild.value.input
  );
  const artifactsPath = writeNewJson(REVIEW_CONSTANTS.evidencePaths.artifacts, snapshot);
  run(
    process.execPath,
    [
      join(SCRIPT_DIRECTORY, "capture-source-bindings.mjs"),
      "--capture-exact-source-bindings",
      checkoutRoot
    ],
    { cwd: REPO_ROOT }
  );
  const sourceBindingsPath = resolve(REPO_ROOT, REVIEW_CONSTANTS.evidencePaths.sourceBindings);
  if (!existsSync(sourceBindingsPath))
    fail("source-binding capture did not create its fixed output");

  const cake = derivePoolCreate2({
    poolDeployer: REVIEW_CONSTANTS.addresses.poolDeployer,
    token0: REVIEW_CONSTANTS.addresses.wbnb,
    token1: REVIEW_CONSTANTS.addresses.cake,
    fee: 500,
    initCodeHash: artifacts.pool.creationKeccak256
  });
  const pta = derivePoolCreate2({
    poolDeployer: REVIEW_CONSTANTS.addresses.poolDeployer,
    token0: REVIEW_CONSTANTS.addresses.pta,
    token1: REVIEW_CONSTANTS.addresses.wbnb,
    fee: 500,
    initCodeHash: artifacts.pool.creationKeccak256
  });
  const report = {
    schemaVersion: 1,
    evidenceId: "pancake-v3-pool-init-code-provenance-2026-08-13",
    capturedAt: new Date().toISOString(),
    environment: "development_offline_reproduction",
    chain: {
      name: "BNB Smart Chain testnet",
      chainId: 97
    },
    decision: {
      status: "pass_exact_compiler_artifact_and_historical_deployer_binding",
      compilerArtifactBlocker: "closed_exact_reproduction",
      executionAuthorized: false,
      currentStateFreshnessEstablished: false
    },
    officialSource: {
      repository: REVIEW_CONSTANTS.sourceRepository,
      commit: head,
      tree,
      archiveFormat: "git_archive_tar",
      archiveByteLength: sourceArchive.length,
      archiveSha256: sha256Bytes(sourceArchive).slice(2),
      license: "GPL-2.0-or-later",
      publisherSignatureAuthenticated: false,
      publisherBoundary:
        "The official-organization GitHub location and exact Git object IDs are provenance, not a cryptographic publisher signature.",
      yarnLockSha256: REVIEW_CONSTANTS.yarnLockSha256,
      hardhatVersion: hardhatPackage.version,
      captureNodeVersion: process.version,
      repositoryRequestedNodeVersion: "16.19.1",
      nodeBoundary:
        "Hardhat warned that the capture Node version was unsupported; the separately pinned native solc rerun matched every retained bytecode exactly.",
      reproductionConfig: {
        path: "scripts/pancake-pool-init-code-review/hardhat.reproduction.config.cjs",
        sha256: sha256File(join(SCRIPT_DIRECTORY, "hardhat.reproduction.config.cjs")),
        networkConfigurationIncluded: false,
        accountsIncluded: false,
        dotenvIncluded: false
      }
    },
    compiler: REVIEW_CONSTANTS.compiler,
    compilerInputs: {
      poolAndDeployer: {
        canonicalSha256: poolInput.canonicalInputSha256,
        canonicalSettingsSha256: poolInput.canonicalSettingsSha256,
        optimizerRuns: poolInput.optimizerRuns,
        sourceCount: poolInput.sourceCount,
        sources: poolInput.sources,
        hardhatBuildInfoSha256: sha256File(deployerBuild.path)
      },
      factory: {
        canonicalSha256: factoryInput.canonicalInputSha256,
        canonicalSettingsSha256: factoryInput.canonicalSettingsSha256,
        optimizerRuns: factoryInput.optimizerRuns,
        sourceCount: factoryInput.sourceCount,
        sources: factoryInput.sources,
        hardhatBuildInfoSha256: sha256File(factoryBuild.path)
      },
      gitBlobBindings: {
        path: REVIEW_CONSTANTS.evidencePaths.sourceBindings,
        entryCount: 61,
        compilerInputLineEndings: "crlf",
        normalizedIdentity: "exact_lf_bytes_equal_pinned_git_blobs"
      },
      boundary:
        "The exact Standard JSON source contents and settings required for these three contracts are retained; the full checkout, node_modules, compiler binary and complete Hardhat outputs are not committed."
    },
    artifactBindings: {
      pool: {
        creationByteLength: artifacts.pool.creationByteLength,
        creationCodeKeccak256: artifacts.pool.creationKeccak256,
        runtimeTemplateByteLength: artifacts.pool.runtimeTemplateByteLength,
        exactSolcRerunMatchedSnapshot: true
      },
      poolDeployer: {
        creationByteLength: artifacts.poolDeployer.creationByteLength,
        runtimeByteLength: artifacts.poolDeployer.runtimeTemplateByteLength,
        runtimeKeccak256: artifacts.poolDeployer.runtimeTemplateKeccak256,
        exactSolcRerunMatchedSnapshot: true,
        exactCompiledRuntimeMatchedRetainedChain97Runtime: true
      },
      factory: {
        creationByteLength: artifacts.factory.creationByteLength,
        runtimeTemplateByteLength: artifacts.factory.runtimeTemplateByteLength,
        patchedRuntimeKeccak256: REVIEW_CONSTANTS.expected.factoryPatchedRuntimeKeccak256,
        immutablePoolDeployer: REVIEW_CONSTANTS.addresses.poolDeployer,
        exactPatchedRuntimeMatchedRetainedChain97Runtime: true
      }
    },
    deployerProvenance: {
      officialDeploymentCommit: REVIEW_CONSTANTS.deploymentCommit,
      officialDeploymentManifestSha256: REVIEW_CONSTANTS.deploymentManifestSha256,
      factory: REVIEW_CONSTANTS.addresses.factory,
      poolDeployer: REVIEW_CONSTANTS.addresses.poolDeployer,
      sourceControlPath: {
        deployRestrictedToInitializedFactory: true,
        factorySetterCallerRestricted: false,
        factorySetterOneTimeZeroGuard: true,
        historicalInitializationRaceBoundary:
          "setFactoryAddress(address) was initially callable by anyone until the first nonzero assignment; the retained chain-97 getter is already bound to the official factory.",
        transientParametersSetBeforeCreate2AndDeletedAfter: true,
        create2SaltExpression: "keccak256(abi.encode(token0, token1, fee))",
        create2InitCode: "type(PancakeV3Pool).creationCode"
      },
      historicalCheckpoint: {
        blockNumber: "124767685",
        blockHash: "0x1657811b903d77aa58f2a6a78a9536a71e98e36d60c13a6098b75f8962e1fc7c",
        twoProviderAgreementRetained: true,
        freshForFutureSubmission: false
      }
    },
    create2CrossChecks: {
      formula:
        "last20(keccak256(0xff || poolDeployer || keccak256(abi.encode(token0,token1,fee)) || keccak256(PancakeV3Pool.creationCode)))",
      knownCakeWbnbFee500: {
        token0: REVIEW_CONSTANTS.addresses.wbnb,
        token1: REVIEW_CONSTANTS.addresses.cake,
        salt: cake.salt,
        derivedAddress: cake.address,
        retainedFactoryAuthenticatedAddress: REVIEW_CONSTANTS.addresses.cakeWbnbFee500Pool,
        exact: true
      },
      ptaWbnbFee500: {
        token0: REVIEW_CONSTANTS.addresses.pta,
        token1: REVIEW_CONSTANTS.addresses.wbnb,
        salt: pta.salt,
        conditionalCandidate: pta.address,
        exactGivenRetainedConstructionPath: true
      }
    },
    boundaries: {
      compilerArtifactProofScope:
        "Exact retained source/compiler inputs reproduce the pool creation code, deployer runtime and factory runtime template. Retained exact-block chain bytes bind that construction path historically.",
      ptaCandidateIsExistingPool: false,
      ptaPoolReceiptIncluded: false,
      ptaPoolCreatedEventIncluded: false,
      freshRuntimeOrFactoryStateIncluded: false,
      marketPriceClaimed: false,
      liquidityClaimed: false,
      remainingBeforeAnyWrite:
        "A fresh two-provider preflight, exact initializer selector attestation, simulation, nonce/gas/cost envelope, explicit transaction confirmation, mined receipt and post-state reconciliation remain separate gates."
    },
    securityBoundary: {
      testnetOnly: true,
      networkConfigurationRead: false,
      processEnvironmentDumped: false,
      rpcPerformed: false,
      walletUsed: false,
      privateKeyUsed: false,
      signerUsed: false,
      signatureRequested: false,
      transactionBroadcast: false,
      mainnetActionPerformed: false
    },
    integrity: {
      files: {
        poolAndDeployerInput: {
          path: REVIEW_CONSTANTS.evidencePaths.poolAndDeployerInput,
          sha256: sha256File(inputPath)
        },
        factoryInput: {
          path: REVIEW_CONSTANTS.evidencePaths.factoryInput,
          sha256: sha256File(factoryInputPath)
        },
        sourceBindings: {
          path: REVIEW_CONSTANTS.evidencePaths.sourceBindings,
          sha256: sha256File(sourceBindingsPath)
        },
        artifacts: {
          path: REVIEW_CONSTANTS.evidencePaths.artifacts,
          sha256: sha256File(artifactsPath)
        },
        report: {
          path: REVIEW_CONSTANTS.evidencePaths.report,
          sha256: null,
          reason: "self-referential digest intentionally omitted"
        }
      },
      canonicalBodySha256: sha256Canonical({
        poolInput: poolInput.canonicalInputSha256,
        factoryInput: factoryInput.canonicalInputSha256,
        poolCreation: artifacts.pool.creationKeccak256,
        poolDeployerRuntime: artifacts.poolDeployer.runtimeTemplateKeccak256,
        factoryRuntime: REVIEW_CONSTANTS.expected.factoryPatchedRuntimeKeccak256,
        cakeAddress: cake.address,
        ptaCandidate: pta.address
      })
    }
  };
  writeNewJson(REVIEW_CONSTANTS.evidencePaths.report, report);
  verifyCommittedReview(REPO_ROOT);
  process.stdout.write(
    `${JSON.stringify(
      {
        status: report.decision.status,
        initCodeHash: artifacts.pool.creationKeccak256,
        poolDeployerRuntime: artifacts.poolDeployer.runtimeTemplateKeccak256,
        knownPool: cake.address,
        ptaCandidate: pta.address
      },
      null,
      2
    )}\n`
  );
}

main();
