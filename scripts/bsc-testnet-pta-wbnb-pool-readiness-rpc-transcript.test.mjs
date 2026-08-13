import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { keccak256Bytes } from "./pancake-selector-review/review-lib.mjs";
import {
  ADDRESSES,
  CAPTURE_FLAG,
  EIP1967_SLOTS,
  EXECUTION_FLAG,
  FEE500_CANDIDATE,
  KECCAK_DEPENDENCY_SHA256,
  ZERO_ADDRESS,
  create2Derivation,
  decodeInt24,
  decodeParameters,
  decodeString,
  decodeUint24,
  parseRpcResponse,
  projectedHeader,
  selectCommonFinalizedCheckpoint,
  selector,
  stableJson,
  validateInvocation,
  word
} from "./collect-bsc-testnet-pta-wbnb-pool-readiness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRANSCRIPT_PATH = resolve(
  ROOT,
  "evidence",
  "development",
  "bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json"
);
const SUMMARY_PATH = resolve(
  ROOT,
  "evidence",
  "development",
  "bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json"
);
const COLLECTOR_PATH = resolve(ROOT, "scripts", "collect-bsc-testnet-pta-wbnb-pool-readiness.mjs");
const KECCAK_DEPENDENCY_PATH = resolve(
  ROOT,
  "scripts",
  "pancake-selector-review",
  "review-lib.mjs"
);
const ZERO_WORD = `0x${"0".repeat(64)}`;

function transcript() {
  return JSON.parse(readFileSync(TRANSCRIPT_PATH, "utf8"));
}

function summary() {
  return JSON.parse(readFileSync(SUMMARY_PATH, "utf8"));
}

function readByLabel(evidence, label) {
  const matches = evidence.reads.filter((read) => read.label === label);
  assert.equal(matches.length, 1, `expected one transcript read for ${label}`);
  return matches[0];
}

test("raw transcript binds a fresh two-provider canonical checkpoint and safe collector", () => {
  const evidence = transcript();
  assert.equal(evidence.chainId, 97);
  assert.equal(evidence.status, "fresh_at_capture_read_only_non_authorizing_raw_transcript");
  assert.deepEqual(evidence.checkpoint.stateSelector, {
    blockHash: evidence.checkpoint.hash,
    requireCanonical: true
  });
  assert.equal(evidence.finalityCapture.providerResults.length, 2);
  assert.equal(evidence.finalityCapture.exactHeightCrossCheck.providerAgreementVerified, true);
  assert.ok(
    evidence.finalityCapture.providerResults.every(
      ({ projectedHeader }) => BigInt(projectedHeader.number) >= BigInt(evidence.checkpoint.number)
    )
  );
  assert.equal(evidence.collector.acceptsCustomRpcOrigin, false);
  assert.equal(evidence.collector.readsEnvironment, false);
  assert.equal(evidence.collector.writesFiles, true);
  assert.deepEqual(evidence.collector.writeBoundary, {
    mode: "create_new_fixed_public_transcript_only",
    path: "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json",
    acceptsCallerPath: false,
    overwritesExistingFile: false
  });
  assert.equal(evidence.collector.signsTransactions, false);
  assert.equal(evidence.collector.broadcastsTransactions, false);
  assert.deepEqual(evidence.collector.dependencies, [
    {
      path: "scripts/pancake-selector-review/review-lib.mjs",
      purpose: "Keccak-256 implementation used for runtime and CREATE2 derivations",
      sourceSha256: createHash("sha256").update(readFileSync(KECCAK_DEPENDENCY_PATH)).digest("hex")
    }
  ]);
  assert.equal(evidence.collector.dependencies[0].sourceSha256, KECCAK_DEPENDENCY_SHA256);
  const chainRead = readByLabel(evidence, "chain.identity");
  assert.equal(chainRead.result.decoded, "97");
  assert.equal(Number(chainRead.result.decoded), evidence.chainId);
  assert.equal(evidence.chainId, summary().scope.chainId);
  assert.equal(
    stableJson(evidence.finalityCapture.exactHeightCrossCheck.providerRawResults[0].rawResult),
    stableJson(evidence.finalityCapture.exactHeightCrossCheck.providerRawResults[1].rawResult)
  );
  const headerRead = readByLabel(evidence, "checkpoint.header");
  assert.equal(
    stableJson(headerRead.result.rawResultsByProvider[0].rawResult),
    stableJson(headerRead.result.rawResultsByProvider[1].rawResult)
  );
  for (const read of evidence.reads) {
    assert.equal(read.result.normalizedResultsByProvider.length, 2);
    assert.deepEqual(
      read.result.normalizedResultsByProvider.map(({ role }) => role),
      ["primary", "corroborator"]
    );
    assert.deepEqual(
      read.result.normalizedResultsByProvider[0].normalizedResult,
      read.result.normalizedResultsByProvider[1].normalizedResult
    );
    assert.deepEqual(
      read.result.normalizedResult,
      read.result.normalizedResultsByProvider[0].normalizedResult
    );
  }
  const allowedMethods = new Set([
    "eth_chainId",
    "eth_getBlockByHash",
    "eth_getCode",
    "eth_getTransactionCount",
    "eth_getStorageAt",
    "eth_call"
  ]);
  assert.ok(evidence.reads.every(({ method }) => allowedMethods.has(method)));
});

test("capture invocation is exact and fails before network when the fixed artifact exists", () => {
  assert.equal(validateInvocation([EXECUTION_FLAG], true), EXECUTION_FLAG);
  assert.equal(validateInvocation([CAPTURE_FLAG], false), CAPTURE_FLAG);
  assert.throws(() => validateInvocation([], false));
  assert.throws(() => validateInvocation(["--unknown"], false));
  assert.throws(() => validateInvocation([CAPTURE_FLAG, "extra"], false));
  assert.throws(() => validateInvocation([CAPTURE_FLAG], true));
});

test("offline replay derives every runtime identity and scalar pool-readiness claim", () => {
  const evidence = transcript();
  const readinessSummary = summary();
  const codeRoles = {
    pta: "pta",
    wbnb: "wbnb",
    factory: "factory",
    pool_deployer: "poolDeployer",
    position_manager: "positionManager"
  };
  for (const [transcriptRole, summaryRole] of Object.entries(codeRoles)) {
    const raw = readByLabel(evidence, `code.${transcriptRole}`).result.normalizedResult;
    const bytes = Buffer.from(raw.slice(2), "hex");
    const result = readByLabel(evidence, `code.${transcriptRole}`).result;
    assert.equal(bytes.length, result.byteLength);
    assert.equal(keccak256Bytes(bytes), result.runtimeKeccak256);
    assert.equal(result.byteLength, readinessSummary.contracts[summaryRole].runtimeBytes);
    assert.equal(result.runtimeKeccak256, readinessSummary.contracts[summaryRole].runtimeKeccak256);
    assert.equal(
      readByLabel(evidence, `nonce.${transcriptRole}`).result.decoded,
      readinessSummary.contracts[summaryRole].accountNonce
    );
  }
  for (const role of ["pta", "wbnb"]) {
    for (const [label, field] of [
      ["name", "name"],
      ["symbol", "symbol"],
      ["decimals", "decimals"],
      ["total_supply", "totalSupplyBaseUnits"]
    ]) {
      assert.equal(
        String(readByLabel(evidence, `token.${role}.${label}`).result.decoded),
        String(readinessSummary.contracts[role].tokenState[field])
      );
    }
  }
  assert.equal(
    readByLabel(evidence, "nonce.factory_owner").result.decoded,
    readinessSummary.mutableControls.factoryOwner.observedAccountNonce
  );
  const lmCode = readByLabel(evidence, "code.lm_pool_deployer").result;
  assert.equal(
    lmCode.byteLength,
    readinessSummary.mutableControls.lmPoolDeployer.observedRuntimeBytes
  );
  assert.equal(
    lmCode.runtimeKeccak256,
    readinessSummary.mutableControls.lmPoolDeployer.observedRuntimeKeccak256
  );
  assert.equal(
    readByLabel(evidence, "nonce.lm_pool_deployer").result.decoded,
    readinessSummary.mutableControls.lmPoolDeployer.observedAccountNonce
  );

  for (const [role, address] of Object.entries({
    pta: ADDRESSES.pta,
    wbnb: ADDRESSES.wbnb,
    factory: ADDRESSES.factory,
    pool_deployer: ADDRESSES.poolDeployer,
    position_manager: ADDRESSES.positionManager
  })) {
    for (const [slotName, slot] of Object.entries(EIP1967_SLOTS)) {
      const read = readByLabel(evidence, `proxy_slot.${role}.${slotName}`);
      assert.deepEqual(read.params, [address, slot, evidence.checkpoint.stateSelector]);
      assert.equal(read.result.normalizedResult, ZERO_WORD);
    }
  }

  for (const tier of readinessSummary.feeTierReads) {
    assert.equal(
      readByLabel(evidence, `fee_tier.${tier.fee}.tick_spacing`).result.decoded,
      tier.tickSpacing
    );
    assert.deepEqual(readByLabel(evidence, `fee_tier.${tier.fee}.extra_info`).result.decoded, {
      whitelistRequested: tier.whitelistRequested,
      enabled: tier.enabled
    });
    assert.equal(
      readByLabel(evidence, `fee_tier.${tier.fee}.get_pool`).result.decoded,
      ZERO_ADDRESS
    );
  }

  assert.equal(
    readByLabel(evidence, "manager_binding.factory").result.decoded,
    ADDRESSES.factory.toLowerCase()
  );
  assert.equal(
    readByLabel(evidence, "manager_binding.deployer").result.decoded,
    ADDRESSES.poolDeployer.toLowerCase()
  );
  assert.equal(
    readByLabel(evidence, "manager_binding.wrapped_native").result.decoded,
    ADDRESSES.wbnb.toLowerCase()
  );
  assert.equal(
    readByLabel(evidence, "factory_binding.owner").result.decoded,
    ADDRESSES.factoryOwner.toLowerCase()
  );
  assert.equal(
    readByLabel(evidence, "factory_binding.lm_pool_deployer").result.decoded,
    ADDRESSES.lmPoolDeployer.toLowerCase()
  );
  assert.equal(
    readByLabel(evidence, "pool_deployer_binding.transient_parameters").result.decoded.fee,
    "0"
  );
  assert.equal(readByLabel(evidence, "code.fee500_candidate").result.normalizedResult, "0x");
  assert.equal(readByLabel(evidence, "nonce.fee500_candidate").result.decoded, "0");
});

test("offline CREATE2 replay matches candidate and retained known-pool cross-check", () => {
  const evidence = transcript();
  const derived = create2Derivation();
  assert.deepEqual(evidence.derivations.fee500Create2, derived);
  assert.equal(derived.candidateAddress, FEE500_CANDIDATE.toLowerCase());
  assert.equal(derived.retainedKnownPoolCrossCheck.matches, true);
});

test("strict remote ABI decoders reject non-canonical encodings", () => {
  assert.equal(decodeInt24(`0x${word(10n)}`), "10");
  assert.equal(decodeInt24(`0x${"f".repeat(64)}`), "-1");
  assert.throws(() => decodeInt24(`0x${"0".repeat(56)}ffffff`));
  assert.throws(() => decodeInt24(`0x01${"0".repeat(62)}`));
  assert.equal(decodeUint24(`0x${word(500n)}`), "500");
  assert.throws(() => decodeUint24(`0x${word(1n << 24n)}`));

  const addressZero = "0".repeat(64);
  assert.equal(
    decodeParameters(`0x${addressZero}${addressZero}${addressZero}${word(500n)}${word(10n)}`).fee,
    "500"
  );
  assert.throws(() =>
    decodeParameters(`0x${addressZero}${addressZero}${addressZero}${word(1n << 24n)}${word(10n)}`)
  );

  const valid = `0x${word(32n)}${word(3n)}${Buffer.from("PTA", "utf8").toString("hex")}${"0".repeat(58)}`;
  assert.equal(decodeString(valid), "PTA");
  assert.throws(() => decodeString(`${valid}00`));
  assert.throws(() => decodeString(`${valid.slice(0, -2)}01`));

  const header = {
    number: "0x7b",
    hash: `0x${"12".repeat(32)}`,
    timestamp: "0x64"
  };
  assert.equal(projectedHeader(header).number, "123");
  assert.throws(() => projectedHeader({ ...header, hash: "0x12" }));
  assert.equal(
    parseRpcResponse(JSON.stringify({ jsonrpc: "2.0", id: 7, result: "0x61" }), 7),
    "0x61"
  );
  assert.throws(() =>
    parseRpcResponse(JSON.stringify({ jsonrpc: "2.0", id: 8, result: "0x61" }), 7)
  );
  assert.throws(() =>
    parseRpcResponse(JSON.stringify({ jsonrpc: "2.0", id: 7, result: "0x61", unexpected: true }), 7)
  );

  const finalized = [
    { ...header, number: "0x7b" },
    { ...header, number: "0x7c", hash: `0x${"34".repeat(32)}` }
  ];
  assert.equal(
    selectCommonFinalizedCheckpoint(finalized, [header, header]).checkpoint.number,
    "123"
  );
  assert.throws(() =>
    selectCommonFinalizedCheckpoint(finalized, [
      { ...header, number: "0x7a" },
      { ...header, number: "0x7a" }
    ])
  );
});

test("transcript is integrity-bound and cannot be read as execution evidence", () => {
  const evidence = transcript();
  const readinessSummary = summary();
  const { integrity, ...body } = evidence;
  assert.equal(
    createHash("sha256").update(stableJson(body), "utf8").digest("hex"),
    integrity.canonicalBodySha256
  );
  assert.equal(
    createHash("sha256").update(readFileSync(COLLECTOR_PATH)).digest("hex"),
    evidence.collector.sourceSha256
  );
  assert.equal(
    readinessSummary.scope.rawTranscript,
    TRANSCRIPT_PATH.slice(ROOT.length + 1).replaceAll("\\", "/")
  );
  assert.equal(readinessSummary.scope.collectorSourceSha256, evidence.collector.sourceSha256);
  assert.equal(
    readinessSummary.scope.rawTranscriptCanonicalBodySha256,
    integrity.canonicalBodySha256
  );
  assert.equal(readinessSummary.observedAt, evidence.snapshotObservedAt);
  assert.equal(readinessSummary.checkpoint.blockNumber, evidence.checkpoint.number);
  assert.equal(readinessSummary.checkpoint.blockHash, evidence.checkpoint.hash);
  assert.equal(readinessSummary.checkpoint.blockTimestampUtc, evidence.checkpoint.timestampUtc);
  assert.deepEqual(evidence.boundaries, {
    historicalAfterCapture: true,
    authorizesTransaction: false,
    poolCreationReceipt: false,
    poolExistsClaim: false,
    liquidityClaim: false,
    oracleClaim: false,
    activationClaim: false,
    rawLongRuntimeBytecodeFullyRetained: true
  });
  assert.equal(readFileSync(TRANSCRIPT_PATH, "utf8").includes('"privateKey"'), false);
  assert.equal(readFileSync(TRANSCRIPT_PATH, "utf8").includes('"signedTransaction"'), false);
  assert.equal(selector("feeAmountTickSpacingExtraInfo(uint24)"), "0x88e8006d");
});
