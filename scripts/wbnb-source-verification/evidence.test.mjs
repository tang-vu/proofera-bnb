import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const evidencePath = join(
  repositoryRoot,
  "evidence",
  "development",
  "pancake-v3-testnet-wbnb-source-verification-2026-08-11.json"
);
const verifierPath = join(repositoryRoot, "scripts", "wbnb-source-verification", "verify.mjs");
const reviewPath = join(repositoryRoot, "docs", "pancake-v3-testnet-wbnb-source-verification.md");
const expectedEvidenceSha256 = "4bc0a265a26d48501877318299a5d4688fb5f939491c391aacad273dd386e53a";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("WBNB machine record is exact, narrow, and content-addressed", () => {
  const raw = readFileSync(evidencePath);
  assert.equal(sha256(raw), expectedEvidenceSha256);
  const evidence = JSON.parse(raw.toString("utf8"));

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.scope.chainId, 97);
  assert.equal(evidence.scope.contract, "0xae13d989dac2f0debff460ac112a837c89baa7cd");
  assert.equal(evidence.scope.writesOrSignatures, false);
  assert.equal(evidence.decision.wbnbComponentEligible, true);
  assert.equal(evidence.decision.ptaWbnbTokenAdmissionGate, "WBNB-side closed");
  assert.ok(evidence.decision.doesNotEstablish.some((item) => item.includes("PTA")));
  assert.ok(evidence.decision.doesNotEstablish.some((item) => item.includes("Pool liquidity")));

  assert.equal(evidence.deployment.creationInputBytes, 3504);
  assert.equal(evidence.deployment.constructorArgumentsBytes, 0);
  assert.equal(evidence.deployment.completeRebuildMatchesTransactionInput, true);
  assert.equal(evidence.bytecode.creation.exactMatch, true);
  assert.equal(evidence.bytecode.runtime.bytes, 3124);
  assert.equal(evidence.bytecode.runtime.exactMatch, true);
  assert.equal(
    evidence.bytecode.runtime.keccak256,
    "0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6"
  );

  const opcodes = evidence.proxyAndOpcodeReview.linearDisassembly;
  for (const opcode of ["callcode", "delegatecall", "create", "create2", "selfdestruct"]) {
    assert.equal(opcodes[opcode], 0, `${opcode} must remain absent`);
  }
});

test("deterministic verifier and human review bind the retained record", () => {
  const verifier = readFileSync(verifierPath, "utf8");
  const review = readFileSync(reviewPath, "utf8");

  for (const value of [
    "5d5321f1058680235574f06826be8ab853d89538013c3144bb8f4ee32995d874",
    "1dd38a19dbc4ea04b114ee330b75aba1ccea7cccd4886a0a37e0e1d11aba696a",
    "e96eee25c3a063ffcfbe4ae2aa2c44e5c99ddf236adb7828676f6fd7f8605742",
    "0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6"
  ]) {
    assert.ok(verifier.includes(value), `verifier is missing ${value}`);
  }
  assert.ok(review.includes(expectedEvidenceSha256));
  assert.match(review, /does not admit a PTA token or a pool/i);
});
