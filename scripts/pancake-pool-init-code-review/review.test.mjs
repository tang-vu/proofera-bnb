import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  REVIEW_CONSTANTS,
  analyzeCompilerInput,
  computeReportCanonicalBodySha256,
  derivePoolCreate2,
  patchRuntimeImmutables,
  reviewConstructionControlPath,
  verifyCommittedReview,
  verifyReportAttestation,
  verifySourceBindingAttestation
} from "./review-lib.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIRECTORY, "..", "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relativePath), "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitBlobSha1(value) {
  return createHash("sha1").update(`blob ${value.length}\0`, "utf8").update(value).digest("hex");
}

test("retained exact compiler inputs, artifacts and historical chain bindings agree", () => {
  const result = verifyCommittedReview(REPO_ROOT);
  assert.equal(
    result.artifacts.pool.creationKeccak256,
    REVIEW_CONSTANTS.expected.poolCreationKeccak256
  );
  assert.equal(result.cakeCreate2.address, REVIEW_CONSTANTS.addresses.cakeWbnbFee500Pool);
  assert.equal(result.ptaCreate2.address, REVIEW_CONSTANTS.addresses.ptaWbnbFee500Candidate);
  assert.equal(result.report.decision.executionAuthorized, false);
  assert.equal(result.report.boundaries.ptaCandidateIsExistingPool, false);
});

test("compiler settings and every retained transitive source are pinned", () => {
  const input = readJson(REVIEW_CONSTANTS.evidencePaths.poolAndDeployerInput);
  const review = analyzeCompilerInput(input, {
    optimizerRuns: 400,
    requiredSources: ["contracts/PancakeV3Pool.sol", "contracts/PancakeV3PoolDeployer.sol"]
  });
  assert.equal(review.sourceCount, 32);
  assert.equal(
    review.canonicalInputSha256,
    "56f4a6aa554a4480d46d359e49a3aa570bcc3d6e373b599f00591b456ff6d66c"
  );
  assert.equal(
    review.canonicalSettingsSha256,
    "87a5fecad1294a4400cb04e12e79d584400d89527258d3a011f8e8e3a16b0680"
  );
});

test("construction path review requires the factory/deployer access and CREATE2 source forms", () => {
  const poolInput = readJson(REVIEW_CONSTANTS.evidencePaths.poolAndDeployerInput);
  const factoryInput = readJson(REVIEW_CONSTANTS.evidencePaths.factoryInput);
  assert.deepEqual(reviewConstructionControlPath(poolInput, factoryInput), {
    deployRestrictedToInitializedFactory: true,
    factorySetterCallerRestricted: false,
    factorySetterOneTimeZeroGuard: true,
    factoryBindsImmutablePoolDeployer: true,
    transientParametersSetBeforeCreate2AndDeletedAfter: true,
    saltExpression: "keccak256(abi.encode(token0, token1, fee))"
  });
  const altered = structuredClone(poolInput);
  altered.sources["contracts/PancakeV3PoolDeployer.sol"].content = altered.sources[
    "contracts/PancakeV3PoolDeployer.sol"
  ].content.replace("msg.sender == factoryAddress", "msg.sender != factoryAddress");
  assert.throws(() => reviewConstructionControlPath(altered, factoryInput), /failed closed/);
});

test("CREATE2 derivation fails closed on unsorted tokens and altered init code", () => {
  assert.throws(
    () =>
      derivePoolCreate2({
        poolDeployer: REVIEW_CONSTANTS.addresses.poolDeployer,
        token0: REVIEW_CONSTANTS.addresses.cake,
        token1: REVIEW_CONSTANTS.addresses.wbnb,
        fee: 500,
        initCodeHash: REVIEW_CONSTANTS.expected.poolCreationKeccak256
      }),
    /token order/
  );
  const altered = derivePoolCreate2({
    poolDeployer: REVIEW_CONSTANTS.addresses.poolDeployer,
    token0: REVIEW_CONSTANTS.addresses.pta,
    token1: REVIEW_CONSTANTS.addresses.wbnb,
    fee: 500,
    initCodeHash: `0x${"00".repeat(32)}`
  });
  assert.notEqual(altered.address, REVIEW_CONSTANTS.addresses.ptaWbnbFee500Candidate);
});

test("immutable patching rejects incomplete AST bindings", () => {
  const snapshot = readJson(REVIEW_CONSTANTS.evidencePaths.artifacts);
  assert.throws(
    () =>
      patchRuntimeImmutables(
        snapshot.contracts.factory.runtimeTemplate,
        snapshot.contracts.factory.immutableReferences,
        {}
      ),
    /immutable AST-id set drifted/
  );
});

test("evidence remains testnet-only and cannot be interpreted as a pool receipt", () => {
  const report = readJson(REVIEW_CONSTANTS.evidencePaths.report);
  assert.equal(report.chain.chainId, 97);
  assert.equal(report.securityBoundary.testnetOnly, true);
  assert.equal(report.securityBoundary.rpcPerformed, false);
  assert.equal(report.securityBoundary.privateKeyUsed, false);
  assert.equal(report.securityBoundary.signerUsed, false);
  assert.equal(report.securityBoundary.signatureRequested, false);
  assert.equal(report.securityBoundary.transactionBroadcast, false);
  assert.equal(report.boundaries.ptaPoolReceiptIncluded, false);
  assert.equal(report.boundaries.ptaPoolCreatedEventIncluded, false);
  assert.equal(report.boundaries.freshRuntimeOrFactoryStateIncluded, false);
});

test("adversarial report mutations fail even after resealing the report-local body digest", () => {
  const original = readJson(REVIEW_CONSTANTS.evidencePaths.report);
  const mutations = [
    (report) => {
      report.decision.currentStateFreshnessEstablished = true;
    },
    (report) => {
      report.boundaries.marketPriceClaimed = true;
    },
    (report) => {
      report.boundaries.liquidityClaimed = true;
    },
    (report) => {
      report.boundaries.ptaPoolReceiptIncluded = true;
      report.boundaries.ptaPoolCreatedEventIncluded = true;
      report.boundaries.freshRuntimeOrFactoryStateIncluded = true;
    },
    (report) => {
      report.securityBoundary.walletUsed = true;
      report.securityBoundary.privateKeyUsed = true;
      report.securityBoundary.signerUsed = true;
      report.securityBoundary.signatureRequested = true;
      report.securityBoundary.mainnetActionPerformed = true;
    },
    (report) => {
      report.officialSource.commit = "0".repeat(40);
      report.officialSource.publisherSignatureAuthenticated = true;
    },
    (report) => {
      report.compiler.sha256 = "0".repeat(64);
      report.compilerInputs.poolAndDeployer.sources[0].sha256 = "0".repeat(64);
    },
    (report) => {
      report.artifactBindings.pool.exactSolcRerunMatchedSnapshot = false;
      report.deployerProvenance.historicalCheckpoint.freshForFutureSubmission = true;
      report.create2CrossChecks.knownCakeWbnbFee500.exact = false;
    },
    (report) => {
      report.integrity.files.artifacts.sha256 = "0".repeat(64);
    }
  ];
  assert.equal(verifyReportAttestation(original), true);
  for (const mutate of mutations) {
    const report = structuredClone(original);
    mutate(report);
    report.integrity.canonicalBodySha256 = computeReportCanonicalBodySha256(report);
    assert.throws(
      () => verifyReportAttestation(report),
      /independently pinned report section digest drifted/
    );
  }
});

test("report shape rejects added or removed nested claims before digest review", () => {
  const original = readJson(REVIEW_CONSTANTS.evidencePaths.report);
  const added = structuredClone(original);
  added.decision.unreviewedClaim = true;
  assert.throws(() => verifyReportAttestation(added), /report\.decision keys drifted/);
  const removed = structuredClone(original);
  delete removed.securityBoundary.privateKeyUsed;
  assert.throws(() => verifyReportAttestation(removed), /report\.securityBoundary keys drifted/);
});

test("compiler source and recomputed self fields cannot reseal the pinned official blob manifest", () => {
  const poolInput = readJson(REVIEW_CONSTANTS.evidencePaths.poolAndDeployerInput);
  const factoryInput = readJson(REVIEW_CONSTANTS.evidencePaths.factoryInput);
  const bindings = readJson(REVIEW_CONSTANTS.evidencePaths.sourceBindings);
  const sourceName = "contracts/PancakeV3PoolDeployer.sol";
  poolInput.sources[sourceName].content += " ";
  const compilerBytes = Buffer.from(poolInput.sources[sourceName].content, "utf8");
  const normalizedBytes = Buffer.from(
    poolInput.sources[sourceName].content.replaceAll("\r\n", "\n"),
    "utf8"
  );
  const entry = bindings.entries.find(
    ({ compilerSourceName }) => compilerSourceName === sourceName
  );
  entry.compilerInputByteLength = compilerBytes.length;
  entry.compilerInputSha256 = sha256(compilerBytes);
  entry.lfNormalizedByteLength = normalizedBytes.length;
  entry.lfNormalizedSha256 = sha256(normalizedBytes);
  entry.gitBlobSha1 = gitBlobSha1(normalizedBytes);
  assert.throws(
    () => verifySourceBindingAttestation(bindings, [poolInput, factoryInput]),
    /independently pinned official source path\/blob manifest drifted/
  );
});
