import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  canonicalCompact,
  canonicalJson,
  DENIED_MULTICALLS,
  DIRECT_CALLS,
  keccak256Bytes,
  REVIEW_CONSTANTS,
  sha256Bytes,
  sha256Canonical,
  verifyCommittedEvidence
} from "./review-lib.mjs";

const EVIDENCE_DIRECTORY = path.resolve("evidence/development/pancake-v3-selector-paths");

test("canonical JSON recursively sorts object keys while preserving array order", () => {
  const value = { z: [{ b: 2, a: 1 }], a: true };
  assert.equal(canonicalCompact(value), '{"a":true,"z":[{"a":1,"b":2}]}');
  assert.equal(canonicalJson(value).endsWith("\n"), true);
  assert.equal(
    sha256Canonical(value),
    "0x4f1cc1676b4591a84b76768886f93f659ac89c3c0ff933f4a0dccb6b2ceda86b"
  );
});

test("Keccak-256 implementation matches the Ethereum empty and abc vectors", () => {
  assert.equal(
    keccak256Bytes(Buffer.alloc(0)),
    "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
  );
  assert.equal(
    keccak256Bytes(Buffer.from("abc", "utf8")),
    "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
  );
});

test("all reviewed signatures remain bound to their exact selectors", () => {
  for (const definition of [...DIRECT_CALLS, ...DENIED_MULTICALLS]) {
    assert.equal(
      keccak256Bytes(Buffer.from(definition.signature, "utf8")).slice(0, 10),
      definition.selector
    );
  }
});

test("write scope matches the canonical lowercase integration serialization and rejects address-case drift", () => {
  const canonicalWriteScope = {
    schemaVersion: 1,
    targetChainId: 97,
    targetAddress: "0x427bf5b37357632377ecbec9de3626c71a5396c1",
    allowedDirectSignatures: [
      "collect((uint256,address,uint128,uint128))",
      "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))",
      "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))",
      "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))"
    ],
    deniedDispatcherSignatures: [
      "multicall(bytes[])",
      "multicall(bytes32,bytes[])",
      "multicall(uint256,bytes[])"
    ],
    allUnlistedSelectorsDenied: true,
    nestedCalldataDenied: true
  };
  const canonicalDigest = sha256Bytes(Buffer.from(JSON.stringify(canonicalWriteScope), "utf8"));
  assert.equal(
    canonicalDigest,
    "0x3a80eb853ccea37b7a1d04430a015d22941fd7a7cd2d8ab9d31b896fc74d5218"
  );
  assert.equal(canonicalDigest, REVIEW_CONSTANTS.writeScopeSha256);
  assert.equal(REVIEW_CONSTANTS.managerAddress, canonicalWriteScope.targetAddress);

  const checksummedAddressDrift = {
    ...canonicalWriteScope,
    targetAddress: "0x427bF5b37357632377eCbEC9de3626C71A5396c1"
  };
  assert.equal(
    sha256Bytes(Buffer.from(JSON.stringify(checksummedAddressDrift), "utf8")),
    "0x353219926dff8e8642ce1287b91a7276ed69c138e2d68c9fe8bf771d5e7bd7d4"
  );
  assert.notEqual(
    sha256Bytes(Buffer.from(JSON.stringify(checksummedAddressDrift), "utf8")),
    canonicalDigest
  );
});

test("committed artifacts are canonical, content-addressed, distinct, and fail closed", () => {
  const manifest = verifyCommittedEvidence(EVIDENCE_DIRECTORY);
  assert.equal(manifest.bindings.managerRuntimeCodeHash, REVIEW_CONSTANTS.linkedRuntimeKeccak256);
  assert.equal(manifest.bindings.sourceTreeSha256, REVIEW_CONSTANTS.sourceTreeSha256);
  assert.equal(manifest.bindings.writeScopeSha256, REVIEW_CONSTANTS.writeScopeSha256);
});

test("manifest hashes exact raw artifact bytes including the single final LF", () => {
  const manifest = JSON.parse(readFileSync(path.join(EVIDENCE_DIRECTORY, "manifest.json"), "utf8"));
  for (const file of manifest.files) {
    const bytes = readFileSync(path.join(EVIDENCE_DIRECTORY, file.file));
    assert.equal(bytes.at(-1), 0x0a, `${file.file} must end in LF`);
    assert.notEqual(bytes.at(-2), 0x0a, `${file.file} must have only one final LF`);
    assert.equal(sha256Bytes(bytes), file.sha256);
    assert.notEqual(
      sha256Bytes(bytes.subarray(0, bytes.length - 1)),
      file.sha256,
      `${file.file} digest must bind the final LF`
    );
  }
});

test("analysis timestamp and compile configuration are pinned reproducibility inputs", () => {
  const manifest = JSON.parse(readFileSync(path.join(EVIDENCE_DIRECTORY, "manifest.json"), "utf8"));
  assert.equal(manifest.analyzedAt, REVIEW_CONSTANTS.analyzedAt);
  assert.equal(
    sha256Bytes(readFileSync("scripts/pancake-selector-review/hardhat.proofera.config.cjs")),
    REVIEW_CONSTANTS.compileOnlyConfigSha256
  );
  for (const file of manifest.files) {
    const artifact = JSON.parse(readFileSync(path.join(EVIDENCE_DIRECTORY, file.file), "utf8"));
    assert.equal(artifact.analyzedAt, REVIEW_CONSTANTS.analyzedAt);
  }
});

test("human review document lists every exact artifact and path digest", () => {
  const manifest = JSON.parse(readFileSync(path.join(EVIDENCE_DIRECTORY, "manifest.json"), "utf8"));
  const document = readFileSync("docs/pancake-v3-selector-path-review.md", "utf8");
  for (const file of manifest.files) {
    assert.match(document, new RegExp(file.file.replace(".", "\\.")));
    assert.ok(document.includes(file.sha256), `${file.file} whole-file digest is undocumented`);
    assert.ok(
      document.includes(file.sourcePathSha256),
      `${file.file} source-path digest is undocumented`
    );
    assert.ok(
      document.includes(file.bytecodePathSha256),
      `${file.file} bytecode-path digest is undocumented`
    );
  }
});

test("direct paths do not absorb the runtime multicall delegatecall", () => {
  for (const call of DIRECT_CALLS) {
    const artifact = JSON.parse(
      readFileSync(path.join(EVIDENCE_DIRECTORY, `${call.operation}.json`), "utf8")
    );
    assert.deepEqual(artifact.bytecodePath.forbiddenOpcodeFindings.delegatecallPcsOnMappedPath, []);
    assert.equal(artifact.sourcePath.multicallDefinitionReachable, false);
    assert.deepEqual(artifact.bytecodePath.runtimeWideDelegatecallPcs, [10_522]);
  }
});

test("multicall boundary binds the observed delegatecall and distinguishes absent overloads", () => {
  const artifact = JSON.parse(
    readFileSync(path.join(EVIDENCE_DIRECTORY, "denied-multicalls.json"), "utf8")
  );
  assert.deepEqual(
    artifact.bytecodePath.mappedDelegatecalls.map(({ pc }) => pc),
    [10_522]
  );
  assert.equal(artifact.deniedMulticalls[0].currentRuntimeMethodIdentifierPresent, true);
  assert.equal(artifact.deniedMulticalls[1].currentRuntimeMethodIdentifierPresent, false);
  assert.equal(artifact.deniedMulticalls[2].currentRuntimeMethodIdentifierPresent, false);
  assert.ok(artifact.deniedMulticalls.every(({ decision }) => decision === "denied"));
});
