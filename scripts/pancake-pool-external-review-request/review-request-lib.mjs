import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { keccak256Bytes } from "../pancake-selector-review/review-lib.mjs";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(currentDirectory, "..", "..");

const ZERO_WORD = `0x${"00".repeat(32)}`;
const SOURCE_COMMIT = "00f21c405881a5dc320bddf3c757ba13599b1e71";
const SOURCE_PARENT = "70795081fd4d23fb00c4c04ebffaac0f1632adcb";
const SOURCE_TREE = "cb2dff273ffc85d3290e0e1a9ffab3b4e7291a1c";
const PUBLIC_ARTIFACT_SHA256 = "2f78e23ba4892194f2e55c99de479c5a5421329cc4cf992ed2253dd5c0512f02";
const PUBLIC_GIST_REVISION = "e26e1462df484725bbfb795a2a23aaebfc44ed9b";
const PUBLIC_GIST_ID = "e983c3801247685472889075c43e263b";
const PUBLIC_FILENAME = `${PUBLIC_ARTIFACT_SHA256}.json`;
const PUBLIC_URL = `https://gist.githubusercontent.com/tang-vu/${PUBLIC_GIST_ID}/raw/${PUBLIC_GIST_REVISION}/${PUBLIC_FILENAME}`;
let expectedCanonicalRequestCache;

const CALLDATA =
  "0x13ead5620000000000000000000000004ed64525d6fb06b7da926c683cbd809632c9b4cc000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd00000000000000000000000000000000000000000000000000000000000001f40000000000000000000000000000000000000000004189374bc6a7ef9db22d0e";

const IMPLEMENTATION_PATHS = Object.freeze([
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-initialization.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-coordinator.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-boundary.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-authorization.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-local-journal.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-protocol.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-signer-core.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-signing-worker.ts"
]);

const TEST_PATHS = Object.freeze([
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-authorization.server.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-local-journal.server.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-protocol.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-signer-core.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-signing-worker.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-preparation-package-boundary.test.ts"
]);

const EVIDENCE_PATHS = Object.freeze([
  "evidence/development/pancake-v3-initializer-selector-review-2026-08-13.json",
  "evidence/development/pancake-v3-initializer-selector-publication-manifest-2026-08-13.json",
  "evidence/development/pancake-v3-initializer-selector-public-retrieval-2026-08-13.json",
  "evidence/development/pancake-v3-pool-init-code-provenance-2026-08-13.json",
  "evidence/development/pancake-v3-pool-init-code-artifacts-2026-08-13.json",
  "evidence/development/pancake-v3-pool-init-code-source-bindings-2026-08-13.json",
  "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json",
  "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json"
]);

export const REVIEW_REQUEST_CONSTANTS = Object.freeze({
  artifactPath: "evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json",
  sourceCommit: SOURCE_COMMIT,
  sourceParent: SOURCE_PARENT,
  sourceTree: SOURCE_TREE,
  publicArtifactSha256: PUBLIC_ARTIFACT_SHA256,
  publicUrl: PUBLIC_URL,
  calldata: CALLDATA
});

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function canonicalCompact(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Canonical JSON accepts safe integers only.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalCompact(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => compareStrings(left, right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalCompact(entry)}`)
      .join(",")}}`;
  }
  throw new Error(`Unsupported canonical JSON value: ${typeof value}.`);
}

export function sha256Bytes(bytes) {
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

export function hashCanonical(value) {
  return sha256Bytes(Buffer.from(canonicalCompact(value), "utf8"));
}

function gitBuffer(arguments_) {
  return execFileSync("git", ["-C", REPOSITORY_ROOT, ...arguments_], {
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true
  });
}

function gitText(arguments_) {
  return gitBuffer(arguments_).toString("utf8").trim();
}

function commitFile(path) {
  return gitBuffer(["show", `${SOURCE_COMMIT}:${path}`]);
}

function bindCommitFile(path) {
  const bytes = commitFile(path);
  return {
    path,
    byteLength: bytes.length,
    gitBlobOidSha1: gitText(["rev-parse", `${SOURCE_COMMIT}:${path}`]),
    rawSha256: sha256Bytes(bytes)
  };
}

function word(value) {
  const normalized = value.toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]+$/u.test(normalized) || normalized.length > 64) {
    throw new Error("Immutable value is not a uint256-compatible hexadecimal value.");
  }
  return normalized.padStart(64, "0");
}

function deriveExpectedPoolRuntime() {
  const artifact = JSON.parse(
    commitFile("evidence/development/pancake-v3-pool-init-code-artifacts-2026-08-13.json").toString(
      "utf8"
    )
  );
  const pool = artifact.contracts?.pool;
  if (pool?.runtimeTemplate === undefined || pool?.immutableReferences === undefined) {
    throw new Error(
      "Pinned pool artifact is missing its runtime template or immutable references."
    );
  }

  const immutableWords = {
    78: word("0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865"),
    82: word("0x4ed64525d6fb06b7da926c683cbd809632c9b4cc"),
    86: word("0xae13d989dac2f0debff460ac112a837c89baa7cd"),
    90: word("0x01f4"),
    94: word("0x0a"),
    98: word(BigInt("1917569901783203986719870431555990").toString(16))
  };
  let runtime = pool.runtimeTemplate.slice(2).toLowerCase();
  for (const [astId, references] of Object.entries(pool.immutableReferences)) {
    const replacement = immutableWords[astId];
    if (replacement === undefined) throw new Error(`Unexpected pool immutable AST id ${astId}.`);
    for (const reference of references) {
      if (reference.length !== 32)
        throw new Error(`Unexpected immutable width for AST id ${astId}.`);
      const offset = reference.start * 2;
      runtime = `${runtime.slice(0, offset)}${replacement}${runtime.slice(offset + 64)}`;
    }
  }
  const runtimeBytes = Buffer.from(runtime, "hex");
  return {
    byteLength: runtimeBytes.length,
    keccak256: keccak256Bytes(runtimeBytes),
    templateByteLength: Buffer.from(pool.runtimeTemplate.slice(2), "hex").length,
    templateKeccak256: keccak256Bytes(Buffer.from(pool.runtimeTemplate.slice(2), "hex")),
    immutableAstBindings: [
      {
        astId: "78",
        name: "factory",
        value: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"
      },
      {
        astId: "82",
        name: "token0",
        value: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc"
      },
      {
        astId: "86",
        name: "token1",
        value: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"
      },
      { astId: "90", name: "fee", value: "500" },
      { astId: "94", name: "tickSpacing", value: "10" },
      {
        astId: "98",
        name: "maxLiquidityPerTick",
        value: "1917569901783203986719870431555990"
      }
    ]
  };
}

function codeIdentities() {
  return [
    {
      role: "pta",
      address: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
      runtimeByteLength: 1826,
      runtimeKeccak256: "0x2f8caecd2e51f085ab11a67e5b8a89eeab7b667bd89ec708a481b66ed756e006"
    },
    {
      role: "wbnb",
      address: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
      runtimeByteLength: 3124,
      runtimeKeccak256: "0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6"
    },
    {
      role: "factory",
      address: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
      runtimeByteLength: 5151,
      runtimeKeccak256: "0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c"
    },
    {
      role: "poolDeployer",
      address: "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
      runtimeByteLength: 24556,
      runtimeKeccak256: "0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b"
    },
    {
      role: "positionManager",
      address: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
      runtimeByteLength: 24466,
      runtimeKeccak256: "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7"
    }
  ].map((identity) => ({
    ...identity,
    historicalEip1967Slots: {
      implementation: ZERO_WORD,
      admin: ZERO_WORD,
      beacon: ZERO_WORD
    }
  }));
}

function buildReviewSubject() {
  const calldataBytes = Buffer.from(CALLDATA.slice(2), "hex");
  const expectedPoolRuntime = deriveExpectedPoolRuntime();
  const commitAuthoredAt = new Date(
    gitText(["show", "-s", "--format=%aI", SOURCE_COMMIT])
  ).toISOString();
  if (calldataBytes.length !== 132) throw new Error("Fixed initializer calldata length drifted.");
  if (
    keccak256Bytes(calldataBytes) !==
    "0x31c57c19edeae364d99d6f4fb97c75f81d9b1ec5bd8e6673d9771d9ece53b0d3"
  ) {
    throw new Error("Fixed initializer calldata digest drifted.");
  }
  if (
    expectedPoolRuntime.keccak256 !==
    "0xc7187b6ca08de7a5856f7725d15e39a534b27a964fdc445abfd7663041b0e69d"
  ) {
    throw new Error("Expected immutable-linked PTA/WBNB pool runtime digest drifted.");
  }

  return {
    reviewKind: "independent_security_and_scope_review_only",
    publishedInitializerArtifact: {
      provider: "GitHub Gist",
      gistId: PUBLIC_GIST_ID,
      revision: PUBLIC_GIST_REVISION,
      filename: PUBLIC_FILENAME,
      contentAddressedRawUrl: PUBLIC_URL,
      rawByteLength: 33327,
      rawSha256: `0x${PUBLIC_ARTIFACT_SHA256}`,
      localSourcePath:
        "evidence/development/pancake-v3-initializer-selector-review-2026-08-13.json",
      localSourceCommit: "08926dfe69546e897ee2509d905c32a37c9502b7",
      localGitBlobOidSha1: "72b669a0869bd79f89e8b6e6e4a8efe2508a4cd1",
      publicRetrievalReceiptRawSha256:
        "0x65e56ff4b5b2109cee954337a820acd33536c3fa5ef1a1ae7da4e2eee8c7301b",
      publicationManifestRawSha256:
        "0xa70b93a14494824439db1dc6c3fe5c7f046d2e30abdbdb0943f7d99d31da96e5"
    },
    sourceRelease: {
      repository: "https://github.com/tang-vu/proofera-bnb.git",
      commitLocator: `https://github.com/tang-vu/proofera-bnb/commit/${SOURCE_COMMIT}`,
      commit: SOURCE_COMMIT,
      parent: SOURCE_PARENT,
      tree: SOURCE_TREE,
      commitAuthoredAt,
      publicAvailabilityCheckedByThisOfflineBundle: false,
      implementationFiles: IMPLEMENTATION_PATHS.map(bindCommitFile),
      focusedTestFiles: TEST_PATHS.map(bindCommitFile),
      retainedEvidenceFiles: EVIDENCE_PATHS.map(bindCommitFile)
    },
    exactDirectCallScope: {
      chain: "BNB Smart Chain Testnet",
      chainId: 97,
      networkKind: "testnet",
      maximumTopLevelCalls: 1,
      from: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      nonce: "1",
      to: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
      contract: "NonfungiblePositionManager",
      signature: "createAndInitializePoolIfNecessary(address,address,uint24,uint160)",
      selector: "0x13ead562",
      calldata: CALLDATA,
      calldataByteLength: 132,
      calldataKeccak256: "0x31c57c19edeae364d99d6f4fb97c75f81d9b1ec5bd8e6673d9771d9ece53b0d3",
      valueWei: "0",
      transactionType: "legacy_eip155",
      operationKey: "0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc",
      intentId: "proofera:bsc-testnet:97:pta-wbnb:pancake-v3-fee-500:sender-nonce-1:v1",
      nestedCalldataAllowed: false,
      allOtherTopLevelSelectorsAllowed: false,
      deniedMulticallSelectors: ["0xac9650d8", "0x5ae401dc", "0x1f0464d1"]
    },
    initializerArguments: {
      token0: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
      token1: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
      fee: "500",
      tickSpacing: "10",
      sqrtPriceX96: "79228162514264337593543950",
      impliedInitialTick: "-138163",
      expectedConditionalPool: "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE",
      priceMeaning: "fixed_test_scenario_not_market_price_oracle_peg_or_valuation",
      addsLiquidity: false,
      createsLpNft: false
    },
    contractIdentityAndNonProxyBoundary: {
      historicalCheckpoint: {
        blockNumber: "124767685",
        blockHash: "0x1657811b903d77aa58f2a6a78a9536a71e98e36d60c13a6098b75f8962e1fc7c",
        blockTimestampUtc: "2026-08-13T03:30:31.000Z",
        twoProviderAgreementRetained: true,
        freshForSubmission: false
      },
      identities: codeIdentities(),
      claimStrength:
        "all_three_eip1967_slots_zero_at_historical_checkpoint_not_a_timeless_non_proxy_claim",
      positionManagerContainsReviewedMulticallSelfDelegatecall: true,
      noReachableDelegatecallClaim: false,
      freshTwoProviderCodeSlotAndBindingRecheckRequiredBeforeAnySubmission: true
    },
    poolConstruction: {
      factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
      poolDeployer: "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
      create2Salt: "0x5c030acd8d38b759c124229312bdac56cbc3a78d527496a161966c188174d172",
      poolCreationCodeByteLength: 23566,
      poolCreationCodeKeccak256:
        "0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2",
      conditionalPoolAddress: "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE",
      create2Formula:
        "last20(keccak256(0xff || poolDeployer || keccak256(abi.encode(token0,token1,fee)) || keccak256(PancakeV3Pool.creationCode)))",
      expectedImmutableLinkedRuntime: {
        status: "counterfactual_expected_post_creation_runtime_not_onchain_observation",
        observedOnchain: false,
        ...expectedPoolRuntime
      },
      poolCreatedTopic0: "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
      initializeTopic0: "0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95"
    },
    boundedEnvelopePolicy: {
      maximumObservationAgeSeconds: 120,
      maximumEnvelopeLifetimeSeconds: 45,
      maximumPostClaimRecheckAgeSeconds: 30,
      gasMarginBasisPoints: "2000",
      maximumGasEstimate: "5000000",
      maximumGasLimit: "6000000",
      maximumGasPriceWei: "3000000000",
      maximumTotalCostWei: "18000000000000000"
    },
    excludedActions: [
      "wallet or custody access",
      "message or transaction signing",
      "transaction construction or broadcast",
      "token approval or transfer",
      "WBNB wrapping",
      "liquidity minting",
      "LP NFT creation",
      "mainnet action",
      "claim that the historical checkpoint is current"
    ],
    reviewerRequiredChecks: [
      {
        id: "PUBLIC_BYTES",
        requirement:
          "Independently retrieve the revision-pinned Gist without credentials or redirects and match the exact byte length and SHA-256."
      },
      {
        id: "SELECTOR_AND_CALLDATA",
        requirement:
          "Reproduce the selector and ABI-decode all four fixed arguments from the exact calldata; reject any wrapper or nested call."
      },
      {
        id: "SOURCE_RUNTIME_PATH",
        requirement:
          "Review the pinned source/runtime call graph, mutable dependencies, direct-only scope, and known manager self-DELEGATECALL boundary."
      },
      {
        id: "NON_PROXY_FRESHNESS",
        requirement:
          "Treat zero EIP-1967 slots as a historical observation only and require a fresh two-provider exact-block recheck before submission."
      },
      {
        id: "INIT_CODE_AND_RUNTIME",
        requirement:
          "Reproduce pool creation-code hash, CREATE2 salt/address, immutable-reference patch, expected deployed runtime hash, and post-receipt identities."
      },
      {
        id: "FAIL_CLOSED_AUTHORIZATION",
        requirement:
          "Review the pinned commit for self-issued reviewer/owner capability, self-claim, direct worker, package-export, release-binding, journal-race, custody, and broadcast bypasses; production paths must remain unavailable."
      },
      {
        id: "SEPARATE_OWNER_APPROVAL",
        requirement:
          "Confirm that a review decision can close only the external-review gate for this exact pinned subject and source commit; it does not review later post-claim, submission, or production-composition code and cannot substitute for exact owner authorization."
      },
      {
        id: "NO_EXECUTION_CLAIM",
        requirement:
          "Confirm the bundle contains no wallet access, signature, signed transaction, broadcast, receipt, deployed pool, liquidity, or execution claim."
      }
    ]
  };
}

function buildDecisionSchema(reviewSubjectCanonicalSha256) {
  const checkIds = [
    "PUBLIC_BYTES",
    "SELECTOR_AND_CALLDATA",
    "SOURCE_RUNTIME_PATH",
    "NON_PROXY_FRESHNESS",
    "INIT_CODE_AND_RUNTIME",
    "FAIL_CLOSED_AUTHORIZATION",
    "SEPARATE_OWNER_APPROVAL",
    "NO_EXECUTION_CLAIM"
  ];
  return {
    schemaId: "proofera_authenticated_independent_pool_initializer_review_decision_v1",
    canonicalization:
      "UTF-8 JSON encoded after recursive lexicographic object-key sorting; array order preserved; no insignificant whitespace",
    signedPayloadRequiredFields: [
      "schemaVersion",
      "reviewSubjectCanonicalSha256",
      "publishedInitializerRawSha256",
      "sourceCommit",
      "reviewerIdentity",
      "reviewerIndependenceDeclaration",
      "reviewedAt",
      "decision",
      "checks",
      "findings",
      "limitationsAcknowledged"
    ],
    fixedBindings: {
      schemaVersion: 1,
      reviewSubjectCanonicalSha256,
      publishedInitializerRawSha256: `0x${PUBLIC_ARTIFACT_SHA256}`,
      sourceCommit: SOURCE_COMMIT
    },
    reviewerIdentitySchema: {
      requiredFields: ["subjectAlternativeName", "oidcIssuer", "publicProfileLocator"],
      exactIdentityMustBeProvisionedOutOfBandBeforeAcceptance: true,
      mustNotEqualRepositoryOwnerPublisherImplementerOrKeyCustodian: true,
      selfAssertedIndependenceAloneIsSufficient: false
    },
    reviewerIndependenceDeclarationConst:
      "I am independent of the repository owner, artifact publisher, implementation authors, wallet owner, and key custodian for this review.",
    reviewedAtFormat: "UTC ISO 8601 with millisecond precision",
    decisionEnum: ["approve_review_scope_only", "reject", "needs_changes"],
    checksSchema: {
      exactOrderedIds: checkIds,
      outcomeEnum: ["pass", "fail", "not_verified"],
      evidenceAndReasonRequiredForEveryCheck: true,
      approvalRequiresEveryCheckPass: true
    },
    findingsSchema: {
      requiredFields: ["id", "severity", "summary", "evidence"],
      severityEnum: ["critical", "high", "medium", "low", "informational"],
      unresolvedCriticalOrHighPermittedForApproval: false
    },
    limitationsAcknowledgedExact: [
      "The review is not owner authorization.",
      "The review does not authorize wallet access, signing, broadcast, or any onchain write.",
      "The review covers only the exact pinned subject and source commit; later post-claim, submission, reconciler, broadcaster, or production-composition code requires a new exact review request and decision.",
      "Historical observations require a fresh two-provider pre-submission recheck.",
      "Pool initialization creates no liquidity and establishes no market price, oracle, peg, or valuation.",
      "A self-hash, repository account, Gist owner, or internal agent label is not an authenticated independent reviewer."
    ],
    authorizationEffect:
      "closes_external_review_gate_for_exact_pinned_subject_only_after_separate_verification",
    ownerApprovalEffect: "none"
  };
}

export function buildReviewRequest() {
  const actualTree = gitText(["rev-parse", `${SOURCE_COMMIT}^{tree}`]);
  const actualParent = gitText(["show", "-s", "--format=%P", SOURCE_COMMIT]);
  if (actualTree !== SOURCE_TREE || actualParent !== SOURCE_PARENT) {
    throw new Error("Pinned source commit tree or parent does not match the request constants.");
  }

  const reviewSubject = buildReviewSubject();
  const reviewSubjectCanonicalSha256 = hashCanonical(reviewSubject);
  const reviewerDecisionSchema = buildDecisionSchema(reviewSubjectCanonicalSha256);
  const body = {
    schemaVersion: 1,
    recordType: "pancake_v3_pta_wbnb_external_review_request_v1",
    status: "awaiting_authenticated_external_review",
    reviewer: null,
    delivery: {
      status: "not_sent_by_this_bundle",
      recipient: null,
      networkCalled: false,
      externalWritePerformed: false
    },
    reviewerAuthentication: {
      status: "awaiting_identity_and_cryptographic_evidence",
      requiredMethod: "sigstore_keyless_blob_bundle_v0_3",
      signedObject: "canonical_reviewer_decision_json_bytes",
      requiredVerification: [
        "verify the Sigstore bundle and Fulcio certificate chain",
        "verify Rekor transparency-log inclusion",
        "match the certificate subjectAlternativeName and OIDC issuer to an out-of-band provisioned exact reviewer identity",
        "verify the signature covers the exact canonical reviewer-decision bytes",
        "verify the decision bindings equal this request's fixed subject, public artifact, and source commit"
      ],
      exactReviewerIdentityProvisioned: null,
      authenticationEvidence: null,
      authenticatedIndependentReviewVerified: false
    },
    reviewSubject,
    reviewerDecisionSchema,
    separateOwnerApproval: {
      status: "not_requested_or_recorded",
      owner: null,
      approval: null,
      requiredAfterAuthenticatedExternalReview: true,
      mustBindExactTransactionEnvelopeAndExpiry: true,
      reviewerDecisionCanSubstitute: false
    },
    authorizationBoundary: {
      activationEligible: false,
      executionReady: false,
      authorizesWalletUse: false,
      authorizesCustodyAccess: false,
      authorizesSignature: false,
      authorizesTransactionConstruction: false,
      authorizesBroadcast: false,
      authorizesOnchainWrite: false,
      reviewerDecisionAloneAuthorizesExecution: false,
      canonicalHashesAreAuthenticationOrAuthorization: false
    },
    securityBoundary: {
      networkCalledByGenerator: false,
      externalPublicationPerformed: false,
      environmentRead: false,
      walletAccessed: false,
      custodyMaterialAccessed: false,
      signerCreated: false,
      signatureCreated: false,
      signedTransactionCreated: false,
      transactionBroadcast: false,
      onchainWritePerformed: false
    },
    limitations: [
      "This deterministic bundle prepares a review request; it does not assert that a reviewer exists, accepted the request, or approved anything.",
      "The Sigstore method is specified, but the exact accepted reviewer identity is intentionally null until provisioned and verified out of band.",
      "The public Gist and source-commit locators are pinned inputs; this offline generator performs no availability check.",
      "This request covers only source commit 00f21c405881a5dc320bddf3c757ba13599b1e71; later post-claim, submission, reconciler, broadcaster, or production-composition code is outside its review subject and requires a new exact request and authenticated decision.",
      "Historical runtime and proxy-slot evidence is not current state and cannot authorize a later submission.",
      "No review decision can replace the separate owner authorization, fresh preflight, production composition review, or receipt reconciliation."
    ]
  };

  const request = {
    ...body,
    integrity: {
      canonicalization:
        "UTF-8 JSON encoded after recursive lexicographic object-key sorting; array order preserved; no insignificant whitespace",
      algorithm: "sha256",
      reviewSubjectCanonicalSha256,
      reviewerDecisionSchemaCanonicalSha256: hashCanonical(reviewerDecisionSchema),
      canonicalBodySha256: hashCanonical(body),
      authenticationMeaning: "none_unkeyed_integrity_only"
    }
  };
  expectedCanonicalRequestCache ??= canonicalCompact(request);
  return request;
}

export function verifyReviewRequestObject(value) {
  expectedCanonicalRequestCache ??= canonicalCompact(buildReviewRequest());
  if (canonicalCompact(value) !== expectedCanonicalRequestCache) {
    throw new Error(
      "External-review request differs from the exact fail-closed deterministic form."
    );
  }
  return value;
}

export function verifyCommittedReviewRequest() {
  const path = resolve(REPOSITORY_ROOT, REVIEW_REQUEST_CONSTANTS.artifactPath);
  const raw = readFileSync(path);
  if (raw[0] !== 0x7b || raw.at(-1) !== 0x0a || raw.at(-2) === 0x0a) {
    throw new Error(
      "Committed external-review request must be one JSON object with exactly one LF."
    );
  }
  const value = JSON.parse(raw.toString("utf8"));
  verifyReviewRequestObject(value);
  return { raw, value };
}
