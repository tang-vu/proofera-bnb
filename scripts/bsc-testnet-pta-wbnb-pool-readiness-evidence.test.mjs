import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_PATH = resolve(
  ROOT,
  "evidence",
  "development",
  "bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json"
);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_WORD = `0x${"0".repeat(64)}`;
const EMPTY_CODE_KECCAK = "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
const BLOCK_HASH = "0x1657811b903d77aa58f2a6a78a9536a71e98e36d60c13a6098b75f8962e1fc7c";
const PTA = "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const DEPLOYER = "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9";
const MANAGER = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";

const EXPECTED_IDENTITIES = {
  pta: {
    address: PTA,
    runtimeBytes: 1826,
    runtimeKeccak256: "0x2f8caecd2e51f085ab11a67e5b8a89eeab7b667bd89ec708a481b66ed756e006"
  },
  wbnb: {
    address: WBNB,
    runtimeBytes: 3124,
    runtimeKeccak256: "0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6"
  },
  factory: {
    address: FACTORY,
    runtimeBytes: 5151,
    runtimeKeccak256: "0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c"
  },
  poolDeployer: {
    address: DEPLOYER,
    runtimeBytes: 24556,
    runtimeKeccak256: "0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b"
  },
  positionManager: {
    address: MANAGER,
    runtimeBytes: 24466,
    runtimeKeccak256: "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7"
  }
};

function readEvidenceText() {
  return readFileSync(EVIDENCE_PATH, "utf8");
}

function readEvidence() {
  return JSON.parse(readEvidenceText());
}

test("pool-readiness snapshot binds one two-provider finalized chain-97 checkpoint", () => {
  const evidence = readEvidence();

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.recordType, "bsc_testnet_pta_wbnb_pool_readiness_snapshot");
  assert.equal(evidence.status, "historical_after_capture_read_only_not_submission_ready");
  assert.equal(evidence.observedAt, "2026-08-13T03:30:36.176Z");
  assert.equal(evidence.scope.chainId, 97);
  assert.match(evidence.scope.mode, /retained bounded public-result transcript/u);
  assert.equal(evidence.scope.boundedRpcResultPayloadsRetained, true);
  assert.equal(evidence.scope.jsonRpcEnvelopesAndRequestIdsRetained, false);
  assert.match(evidence.scope.retentionBoundary, /Both providers' normalized public/u);
  assert.equal(evidence.scope.onchainWritesPerformed, false);
  assert.equal(evidence.scope.localEvidenceFileWritten, true);
  assert.equal(
    evidence.scope.rawTranscript,
    "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json"
  );
  assert.equal(evidence.checkpoint.blockNumber, "124767685");
  assert.equal(evidence.checkpoint.blockNumberHex, "0x76fcdc5");
  assert.equal(evidence.checkpoint.blockHash, BLOCK_HASH);
  assert.equal(evidence.checkpoint.blockTimestampUnix, "1786591831");
  assert.equal(evidence.checkpoint.blockTimestampUtc, "2026-08-13T03:30:31.000Z");
  assert.deepEqual(evidence.checkpoint.stateSelector, {
    blockHash: BLOCK_HASH,
    requireCanonical: true
  });
  assert.equal(evidence.checkpoint.latestTagUsedForEvidence, false);
  assert.equal(evidence.checkpoint.providerAgreementVerified, true);
  assert.deepEqual(
    evidence.checkpoint.providerFinalizedHeads.map(({ blockNumber, blockHash }) => ({
      blockNumber,
      blockHash
    })),
    [
      { blockNumber: "124767685", blockHash: BLOCK_HASH },
      { blockNumber: "124767685", blockHash: BLOCK_HASH }
    ]
  );
  assert.deepEqual(
    evidence.sources.map(({ role, origin, credentialFreePublicOrigin }) => ({
      role,
      origin,
      credentialFreePublicOrigin
    })),
    [
      {
        role: "primary",
        origin: "https://bsc-testnet-dataseed.bnbchain.org",
        credentialFreePublicOrigin: true
      },
      {
        role: "corroborator",
        origin: "https://bsc-testnet.bnbchain.org",
        credentialFreePublicOrigin: true
      }
    ]
  );
});

test("all five retained identities and proxy-slot observations are exact", () => {
  const evidence = readEvidence();

  assert.deepEqual(evidence.proxySlotDefinitions, {
    implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
    beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"
  });
  assert.deepEqual(Object.keys(evidence.contracts), Object.keys(EXPECTED_IDENTITIES));

  for (const [role, expected] of Object.entries(EXPECTED_IDENTITIES)) {
    const observed = evidence.contracts[role];
    assert.equal(observed.address, expected.address, `${role} address drifted`);
    assert.equal(observed.runtimeBytes, expected.runtimeBytes, `${role} length drifted`);
    assert.equal(observed.runtimeKeccak256, expected.runtimeKeccak256, `${role} hash drifted`);
    assert.equal(observed.providerAgreementVerified, true, `${role} lacks provider agreement`);
    assert.deepEqual(observed.proxySlotValues, {
      implementation: ZERO_WORD,
      admin: ZERO_WORD,
      beacon: ZERO_WORD
    });
  }

  assert.equal(evidence.contracts.positionManager.noReachableDelegatecallClaim, false);
  assert.match(evidence.contracts.positionManager.knownDelegatecallBoundary, /self-DELEGATECALL/u);
  assert.match(
    evidence.contracts.positionManager.knownDelegatecallBoundary,
    /zero proxy slots do not support a no-reachable-DELEGATECALL claim/u
  );
  assert.equal(evidence.contracts.pta.tokenState.decimals, 18);
  assert.equal(evidence.contracts.pta.tokenState.totalSupplyBaseUnits, "1000000000000000000000000");
  assert.equal(evidence.contracts.pta.tokenState.name, "ProofEra Test Asset");
  assert.equal(evidence.contracts.pta.tokenState.symbol, "PTA");
  assert.equal(evidence.contracts.wbnb.tokenState.decimals, 18);
  assert.equal(evidence.contracts.wbnb.tokenState.name, "Wrapped BNB");
  assert.equal(evidence.contracts.wbnb.tokenState.symbol, "WBNB");
  assert.equal(evidence.contracts.wbnb.tokenState.totalSupplyBaseUnits, "274497234179431013975965");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(evidence.contracts).map(([name, contract]) => [name, contract.accountNonce])
    ),
    {
      pta: "1",
      wbnb: "1",
      factory: "1",
      poolDeployer: "20176",
      positionManager: "1"
    }
  );
});

test("manager, factory, deployer, fee-tier, and mutable-control reads remain bounded", () => {
  const evidence = readEvidence();

  assert.deepEqual(evidence.protocolBindings.positionManager, {
    factory: FACTORY,
    deployer: DEPLOYER,
    wrappedNative: WBNB
  });
  assert.deepEqual(evidence.protocolBindings.factory, {
    poolDeployer: DEPLOYER,
    owner: "0x261AF0030618a52FA767997ed310174b3Bc3B77F",
    lmPoolDeployer: "0x7F1745eb74D26877EC54dd9A317CC930Ad01350c"
  });
  assert.equal(evidence.protocolBindings.poolDeployer.factoryAddress, FACTORY);
  assert.deepEqual(evidence.protocolBindings.poolDeployer.transientParameters, {
    factory: ZERO_ADDRESS,
    token0: ZERO_ADDRESS,
    token1: ZERO_ADDRESS,
    fee: "0",
    tickSpacing: "0"
  });

  assert.deepEqual(
    evidence.feeTierReads.map(({ fee, tickSpacing }) => [fee, tickSpacing]),
    [
      ["100", "1"],
      ["500", "10"],
      ["2500", "50"],
      ["10000", "200"]
    ]
  );
  for (const tier of evidence.feeTierReads) {
    assert.equal(tier.whitelistRequested, false);
    assert.equal(tier.enabled, true);
    assert.equal(tier.factoryGetPool, ZERO_ADDRESS);
  }

  assert.equal(evidence.mutableControls.factoryOwner.observedRuntimeBytes, 0);
  assert.equal(
    evidence.mutableControls.factoryOwner.classificationAtCheckpoint,
    "empty_code_account_ownership_type_unproven"
  );
  for (const capability of [
    "setOwner(address)",
    "setFeeAmountExtraInfo(uint24,bool,bool)",
    "setFeeProtocol(address,uint32,uint32)",
    "collectProtocol(address,address,uint128,uint128)",
    "setLmPool(address,address)"
  ]) {
    assert.ok(evidence.mutableControls.factoryOwner.reviewedCapabilities.includes(capability));
  }
  assert.equal(
    evidence.mutableControls.lmPoolDeployer.sourceIdentityReviewedForThisSnapshot,
    false
  );
  assert.match(evidence.mutableControls.risk, /change fee-tier enabled and whitelist/u);
});

test("fee-500 CREATE2 candidate is exact, empty, and not represented as a reservation", () => {
  const evidence = readEvidence();
  const candidate = evidence.fee500Create2Candidate;

  assert.equal(candidate.poolDeployer, DEPLOYER);
  assert.equal(
    candidate.poolInitCodeKeccak256,
    "0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2"
  );
  assert.equal(candidate.token0, PTA);
  assert.equal(candidate.token1, WBNB);
  assert.ok(BigInt(candidate.token0) < BigInt(candidate.token1));
  assert.equal(candidate.fee, "500");
  assert.equal(
    candidate.salt,
    "0x5c030acd8d38b759c124229312bdac56cbc3a78d527496a161966c188174d172"
  );
  assert.equal(candidate.candidateAddress, "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE");
  assert.equal(candidate.factoryGetPool, ZERO_ADDRESS);
  assert.equal(candidate.observedRuntimeBytes, 0);
  assert.equal(candidate.observedRuntimeKeccak256, EMPTY_CODE_KECCAK);
  assert.equal(candidate.observedAccountNonce, "0");
  assert.equal(candidate.providerAgreementVerified, true);
  assert.equal(candidate.candidateExists, false);
  assert.equal(candidate.addressIsReservation, false);
  assert.equal(candidate.crossCheck.matches, true);
  assert.equal(candidate.crossCheck.predictedAddress, candidate.crossCheck.retainedObservedAddress);
  assert.equal(candidate.crossCheck.predictedAddress, "0xeaf78e3AA2C19dF9495318Cd9EA2aD83Be7D5015");
});

test("snapshot cannot be interpreted as authorization, receipt, pool, or activation evidence", () => {
  const text = readEvidenceText();
  const evidence = JSON.parse(text);

  assert.equal(evidence.decision.authorizesTransaction, false);
  assert.equal(evidence.decision.isPoolCreationReceipt, false);
  assert.equal(evidence.decision.poolExistsAtReviewedFeeTiers, false);
  assert.equal(evidence.decision.poolActive, false);
  assert.equal(evidence.decision.executionReady, false);
  assert.equal(evidence.scope.onchainWritesPerformed, false);
  assert.equal(evidence.scope.localEvidenceFileWritten, true);
  assert.equal(evidence.scope.signaturesRequested, false);
  assert.equal(evidence.scope.transactionsBroadcast, false);
  assert.equal(evidence.scope.boundedRpcResultPayloadsRetained, true);
  assert.equal(evidence.prospectiveInitializerBoundary.target, MANAGER);
  assert.equal(evidence.prospectiveInitializerBoundary.selector, "0x13ead562");
  assert.equal(evidence.prospectiveInitializerBoundary.nativeValueBaseUnits, "0");
  assert.equal(evidence.prospectiveInitializerBoundary.calldataIncluded, false);
  assert.equal(evidence.prospectiveInitializerBoundary.transactionEnvelopeIncluded, false);
  assert.equal(evidence.prospectiveInitializerBoundary.authorizationMeaning, "none");
  assert.ok(
    evidence.decision.doesNotEstablish.some((claim) => /pool creation receipt/u.test(claim))
  );
  assert.ok(evidence.decision.doesNotEstablish.some((claim) => /Liquidity/u.test(claim)));
  assert.ok(evidence.decision.doesNotEstablish.some((claim) => /Permission to sign/u.test(claim)));

  assert.ok(evidence.blockers.length >= 8);
  assert.ok(evidence.blockers.every(({ status }) => status === "open"));
  for (const requiredBlocker of [
    "fresh_complete_preflight",
    "pool_initializer_selector_attestation",
    "initialization_price",
    "inclusion_time_race",
    "simulation_and_execution_envelope",
    "explicit_user_confirmation",
    "liquidity_oracle_and_ownership",
    "scoped_automation_authority"
  ]) {
    assert.ok(evidence.blockers.some(({ id }) => id === requiredBlocker));
  }

  assert.equal(evidence.securityBoundary.testnetOnly, true);
  for (const boundary of [
    "mainnetActionPerformed",
    "privateKeyIncluded",
    "walletPasswordIncluded",
    "mnemonicIncluded",
    "signerIncluded",
    "rawSignedTransactionIncluded",
    "authenticatedRpcUrlIncluded",
    "poolReceiptIncluded"
  ]) {
    assert.equal(evidence.securityBoundary[boundary], false, `${boundary} must remain false`);
  }

  assert.equal(/private[_ -]?key\s*[:=]\s*["']?0x[0-9a-f]{64}/iu.test(text), false);
  for (const forbiddenKey of [
    '"privateKey":',
    '"walletPassword":',
    '"mnemonic":',
    '"seedPhrase":',
    '"signedTransaction":',
    '"rawTransaction":',
    '"transactionHash":',
    '"receipt":'
  ]) {
    assert.equal(text.includes(forbiddenKey), false);
  }
  assert.equal(/0x[0-9a-f]{1000,}/u.test(text), false);
});
