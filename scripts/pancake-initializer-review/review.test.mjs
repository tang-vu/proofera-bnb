import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  REPOSITORY_ROOT,
  REVIEW_CONSTANTS,
  canonicalCompact,
  sha256Bytes,
  verifyCommittedEvidence,
  verifyEvidenceObject
} from "./review-lib.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reseal(evidence) {
  const body = { ...evidence };
  delete body.integrity;
  evidence.integrity.canonicalBodySha256 = sha256Bytes(Buffer.from(canonicalCompact(body), "utf8"));
}

function assertResealedMutationRejected(evidence, mutate) {
  const copy = clone(evidence);
  mutate(copy);
  reseal(copy);
  assert.throws(
    () => verifyEvidenceObject(copy),
    (error) => {
      assert.notEqual(error.message, "Initializer-review canonical body digest mismatch.");
      return true;
    }
  );
}

test("committed initializer review is internally consistent and retained-input bound", () => {
  const evidence = verifyCommittedEvidence();
  assert.equal(evidence.activationEligible, false);
  assert.equal(evidence.decision.status, "blocked");
  assert.equal(evidence.target.chainId, 97);
  assert.equal(evidence.target.address, REVIEW_CONSTANTS.managerAddress);
  assert.equal(evidence.target.selector, "0x13ead562");
  assert.equal(evidence.target.requiredNativeValueBaseUnits, "0");
  assert.equal(evidence.bindings.managerRuntime.exactRetainedRuntimeBytesEqual, true);
  assert.equal(evidence.bindings.historicalObservation.providerAgreementVerified, true);
});

test("direct-only policy denies multicall absorption and every unlisted selector", () => {
  const evidence = verifyCommittedEvidence();
  assert.deepEqual(evidence.directWriteScope.allowedDirectSelectors, ["0x13ead562"]);
  assert.equal(evidence.directWriteScope.maxTopLevelCalls, 1);
  assert.equal(evidence.directWriteScope.allUnlistedSelectorsDenied, true);
  assert.equal(evidence.directWriteScope.nestedCalldataDenied, true);
  assert.deepEqual(
    evidence.multicallAbsorptionBoundary.deniedOuterSelectors.map(({ selector }) => selector),
    ["0xac9650d8", "0x5ae401dc", "0x1f0464d1"]
  );
  assert.equal(evidence.multicallAbsorptionBoundary.runtimeWideSelfDelegatecallPc, 10_522);
  assert.deepEqual(
    evidence.multicallAbsorptionBoundary.initializerDirectSourceMappedDelegatecallPcs,
    []
  );
  assert.equal(evidence.multicallAbsorptionBoundary.directOnlyPolicyAbsorbsNestedCall, false);
});

test("source artifact retains its historical pre-publication and execution blockers", () => {
  const evidence = verifyCommittedEvidence();
  assert.equal(evidence.publication.activationEligible, false);
  assert.equal(evidence.publication.publicContentAddressedLocator, null);
  assert.equal(evidence.publication.independentRetrieval, null);
  assert.equal(evidence.publication.authenticatedIndependentReviewer, null);
  assert.deepEqual(
    evidence.blockers.map(({ status }) => status),
    ["open", "open", "open", "open"]
  );
  assert.equal(evidence.securityBoundary.walletUsed, false);
  assert.equal(evidence.securityBoundary.signerLoaded, false);
  assert.equal(evidence.securityBoundary.transactionConstructed, false);
  assert.equal(evidence.securityBoundary.transactionBroadcast, false);
  assert.equal(evidence.securityBoundary.onchainWritePerformed, false);
});

test("source call graph retains both new-pool and existing-pool branches", () => {
  const evidence = verifyCommittedEvidence();
  assert.deepEqual(
    evidence.selectorPath.sourceAnalysis.externalCalls.map(({ memberName }) => memberName),
    ["getPool", "createPool", "initialize", "slot0", "initialize"]
  );
  assert.equal(evidence.selectorPath.sourceAnalysis.guardConditions.length, 1);
  assert.equal(evidence.selectorPath.sourceAnalysis.branchConditions.length, 2);
  assert.deepEqual(evidence.selectorPath.sourceAnalysis.managerStateWriteNodes, []);
  assert.deepEqual(evidence.selectorPath.sourceAnalysis.lowLevelCallNodes, []);
  assert.deepEqual(evidence.selectorPath.sourceAnalysis.explicitCallOptionNodes, []);
  assert.deepEqual(evidence.selectorPath.sourceAnalysis.blockTimeOrHeightReadNodes, []);
  assert.deepEqual(
    evidence.selectorPath.callGraph.coreWriteFunctions.map(({ contract }) => contract),
    ["PancakeV3Factory", "PancakeV3PoolDeployer", "PancakeV3Pool"]
  );
});

test("resealed authorization, publication and security-boundary mutations fail closed", () => {
  const evidence = verifyCommittedEvidence();
  const decisionFalseFlags = [
    "authorizesMulticall",
    "authorizesSignature",
    "authorizesTransaction",
    "authorizesWalletUse",
    "executionReady",
    "publicAttestationReady"
  ];
  for (const key of decisionFalseFlags) {
    assertResealedMutationRejected(evidence, (copy) => {
      copy.decision[key] = true;
    });
  }

  for (const key of Object.keys(evidence.securityBoundary)) {
    assertResealedMutationRejected(evidence, (copy) => {
      copy.securityBoundary[key] = !copy.securityBoundary[key];
    });
  }

  const publicationMutations = [
    (copy) => {
      copy.publication.activationEligible = true;
    },
    (copy) => {
      copy.publication.eligibleAsDomainEvidenceReference = true;
    },
    (copy) => {
      copy.publication.publicContentAddressedLocator = "https://example.invalid/invented.json";
    },
    (copy) => {
      copy.publication.independentRetrieval = { status: "invented" };
    },
    (copy) => {
      copy.publication.authenticatedIndependentReviewer = { identity: "invented" };
    },
    (copy) => {
      copy.publication.unmetRequirements.pop();
    }
  ];
  for (const mutate of publicationMutations) assertResealedMutationRejected(evidence, mutate);
});

test("resealed value, call-count, direct-scope and call-graph mutations fail closed", () => {
  const evidence = verifyCommittedEvidence();
  const mutations = [
    (copy) => {
      copy.target.requiredNativeValueBaseUnits = "999";
    },
    (copy) => {
      copy.directWriteScope.exactNativeValueBaseUnits = "999";
    },
    (copy) => {
      copy.directWriteScope.maxTopLevelCalls = 999;
    },
    (copy) => {
      copy.directWriteScope.allowedDirectSelectors.push("0xac9650d8");
    },
    (copy) => {
      copy.directWriteScope.allowedDirectSignatures.push("multicall(bytes[])");
    },
    (copy) => {
      copy.directWriteScope.allUnlistedSelectorsDenied = false;
    },
    (copy) => {
      copy.directWriteScope.nestedCalldataDenied = false;
    },
    (copy) => {
      copy.directWriteScope.externalEffects.pop();
    },
    (copy) => {
      copy.selectorPath.callGraph.edges.pop();
    },
    (copy) => {
      copy.selectorPath.callGraph.nodes.pop();
    },
    (copy) => {
      copy.selectorPath.callGraph.coreWriteFunctions.pop();
    }
  ];
  for (const mutate of mutations) assertResealedMutationRejected(evidence, mutate);
});

test("resealed source, runtime, dispatcher and provenance mutations fail closed", () => {
  const evidence = verifyCommittedEvidence();
  const mutations = [
    (copy) => {
      copy.bindings.source.commit = "0".repeat(40);
    },
    (copy) => {
      copy.bindings.source.compiledSourceBindings[1].sha256 = `0x${"11".repeat(32)}`;
    },
    (copy) => {
      copy.bindings.compiler.optimizer.runs = 999;
    },
    (copy) => {
      copy.bindings.managerRuntime.immutableLinkedRuntimeKeccak256 = `0x${"22".repeat(32)}`;
    },
    (copy) => {
      copy.bindings.managerRuntime.immutableReferences.pop();
    },
    (copy) => {
      copy.bindings.historicalObservation.providerAgreementVerified = false;
    },
    (copy) => {
      copy.bindings.protocolImmutables.factory = REVIEW_CONSTANTS.managerAddress;
    },
    (copy) => {
      copy.bindings.retainedInputs[0].sha256 = `0x${"33".repeat(32)}`;
    },
    (copy) => {
      copy.selectorPath.sourceAnalysis.externalCalls.pop();
    },
    (copy) => {
      copy.selectorPath.bytecodeAnalysis.dispatcherEntry.destinationPc = 999;
    },
    (copy) => {
      copy.selectorPath.bytecodeAnalysis.wrapper.bodyPc = 999;
    },
    (copy) => {
      copy.selectorPath.bytecodeAnalysis.initializerMappedEffectInstructions.pop();
    }
  ];
  for (const mutate of mutations) assertResealedMutationRejected(evidence, mutate);
});

test("unsealed integrity mutation still fails closed", () => {
  const evidence = verifyCommittedEvidence();
  const copy = clone(evidence);
  copy.integrity.canonicalBodySha256 = `0x${"00".repeat(32)}`;
  assert.throws(() => verifyEvidenceObject(copy), /canonical body digest mismatch/u);
});

test("canonical serialization is stable and evidence contains no secret-shaped fields", () => {
  const evidence = verifyCommittedEvidence();
  assert.equal(canonicalCompact(evidence), canonicalCompact(clone(evidence)));
  const text = readFileSync(`${REPOSITORY_ROOT}/${REVIEW_CONSTANTS.artifactPath}`, "utf8");
  assert.equal(/-----BEGIN [A-Z ]*PRIVATE KEY-----/iu.test(text), false);
  assert.equal(
    /"(?:privateKey|mnemonic|walletPassword|rawSignedTransaction)"\s*:\s*"[^"]+"/iu.test(text),
    false
  );
  assert.match(sha256Bytes(Buffer.from(text, "utf8")), /^0x[0-9a-f]{64}$/u);
});
