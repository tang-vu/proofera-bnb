import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(currentDirectory, "..", "..");

const RELEASE_COMMIT = "bc7000eee4d9698e272cc9deb7dda5748b34318b";
const RELEASE_PARENT = "00f21c405881a5dc320bddf3c757ba13599b1e71";
const RELEASE_TREE = "c63821a1c7b035b0d40221ed8cd6066c69d33041";

const SUBJECT_PATHS = Object.freeze([
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-authorization.server.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-authorization.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-coordinator.server.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-coordinator.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-initialization.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-local-journal.server.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-local-journal.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-boundary.server.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-boundary.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-protocol.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-protocol.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-signer-core.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-signer-core.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-post-claim-recheck.server.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-post-claim-recheck.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-preparation-package-boundary.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-preparation.server.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-signing-worker.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-signing-worker.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-submission-reconciler.server.test.ts",
  "packages/integrations/src/bsc-testnet-pta-wbnb-pool-submission-reconciler.server.ts"
]);

const CONTEXT_PATHS = Object.freeze([
  "README.md",
  "docs/EXECUTION_PLAN.md",
  "docs/deployment.md",
  "docs/pancake-v3-testnet-pta-wbnb-preparation.md",
  "docs/requirements-traceability.md",
  "docs/research.md",
  "docs/security.md",
  "evidence/README.md",
  "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json",
  "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json",
  "evidence/development/pancake-v3-pool-init-code-provenance-2026-08-13.json",
  "evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json",
  "package.json",
  "packages/integrations/package.json",
  "packages/integrations/src/index.ts"
]);

let expectedDecisionCache;
let exactSubjectPathsCache;

export const REVIEW_CONSTANTS = Object.freeze({
  artifactPath:
    "evidence/development/pancake-v3-pta-wbnb-owner-designated-internal-review-2026-08-13.json",
  releaseCommit: RELEASE_COMMIT,
  releaseParent: RELEASE_PARENT,
  releaseTree: RELEASE_TREE,
  subjectPrefix: "packages/integrations/src/bsc-testnet-pta-wbnb-pool-"
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
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  });
}

function gitText(arguments_) {
  return gitBuffer(arguments_).toString("utf8").trim();
}

function commitFile(releaseCommit, path) {
  return gitBuffer(["show", `${releaseCommit}:${path}`]);
}

function bindCommitFile(releaseCommit, path) {
  const bytes = commitFile(releaseCommit, path);
  return {
    path,
    byteLength: bytes.length,
    gitBlobOidSha1: gitText(["rev-parse", `${releaseCommit}:${path}`]),
    rawSha256: sha256Bytes(bytes)
  };
}

function exactSubjectPaths(releaseCommit) {
  if (releaseCommit === RELEASE_COMMIT && exactSubjectPathsCache !== undefined) {
    return exactSubjectPathsCache;
  }
  const paths = gitText([
    "ls-tree",
    "-r",
    "--name-only",
    releaseCommit,
    "packages/integrations/src"
  ])
    .split(/\r?\n/u)
    .filter((path) => path.startsWith(REVIEW_CONSTANTS.subjectPrefix))
    .sort(compareStrings);
  if (releaseCommit === RELEASE_COMMIT) exactSubjectPathsCache = Object.freeze(paths);
  return paths;
}

function assertExactRelease(releaseCommit) {
  if (releaseCommit !== RELEASE_COMMIT) {
    throw new Error(
      `Review release mismatch: expected ${RELEASE_COMMIT}; received ${releaseCommit}. A changed implementation needs a new decision.`
    );
  }
  const tree = gitText(["rev-parse", `${releaseCommit}^{tree}`]);
  const parent = gitText(["show", "-s", "--format=%P", releaseCommit]);
  if (tree !== RELEASE_TREE || parent !== RELEASE_PARENT) {
    throw new Error("Pinned review release tree or parent does not match the decision constants.");
  }
  const actualPaths = exactSubjectPaths(releaseCommit);
  if (canonicalCompact(actualPaths) !== canonicalCompact([...SUBJECT_PATHS].sort(compareStrings))) {
    throw new Error("The exact PTA/WBNB pool-init subject file set drifted.");
  }
}

function buildSubject(releaseCommit) {
  assertExactRelease(releaseCommit);
  return {
    reviewScope: "exact_nonexecuting_one_shot_chain97_pta_wbnb_pool_initialization_scaffold",
    release: {
      repository: "https://github.com/tang-vu/proofera-bnb.git",
      commit: releaseCommit,
      parent: RELEASE_PARENT,
      tree: RELEASE_TREE,
      commitLocator: `https://github.com/tang-vu/proofera-bnb/commit/${releaseCommit}`,
      wholeRepositoryTreeBound: true,
      subjectFiles: SUBJECT_PATHS.map((path) => bindCommitFile(releaseCommit, path)),
      contextFiles: CONTEXT_PATHS.map((path) => bindCommitFile(releaseCommit, path))
    },
    exactTransactionScope: {
      network: "BNB Smart Chain Testnet",
      chainId: 97,
      sender: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      nonce: "1",
      to: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
      valueWei: "0",
      signature: "createAndInitializePoolIfNecessary(address,address,uint24,uint160)",
      selector: "0x13ead562",
      calldata:
        "0x13ead5620000000000000000000000004ed64525d6fb06b7da926c683cbd809632c9b4cc000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd00000000000000000000000000000000000000000000000000000000000001f40000000000000000000000000000000000000000004189374bc6a7ef9db22d0e",
      calldataByteLength: 132,
      calldataKeccak256: "0x31c57c19edeae364d99d6f4fb97c75f81d9b1ec5bd8e6673d9771d9ece53b0d3",
      operationKey: "0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc",
      token0: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
      token1: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
      fee: "500",
      tickSpacing: "10",
      sqrtPriceX96: "79228162514264337593543950",
      expectedConditionalPool: "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE",
      maximumTopLevelCalls: 1,
      nestedCalldataAllowed: false,
      transactionType: "legacy_eip155",
      maximumGasEstimate: "5000000",
      maximumGasLimit: "6000000",
      maximumGasPriceWei: "3000000000",
      maximumTotalCostWei: "18000000000000000"
    }
  };
}

function reviewerDecisions() {
  return [
    {
      taskLabel: "/root/pool_reconciler_review",
      role: "owner_designated_distinct_read_only_subagent",
      subjectImplementationContributor: false,
      externalReviewer: false,
      thirdPartyIdentityAuthenticated: false,
      sigstoreEvidence: null,
      decision: "approve_internal_technical_scope_only",
      p0Findings: [],
      p1Findings: [],
      p2Findings: [],
      retainedSummary:
        "The exact-commit final review reported GO with no P0/P1/P2; the complete pool-prefix suite passed 107 tests, the focused reconciler/post-claim/package boundary passed 39 tests, the old request passed 9 tests, and the evidence gate passed 58 tests. The report existed only in the owner-designated collaboration session and is not cryptographic identity evidence."
    },
    {
      taskLabel: "/root/milestone_final_audit",
      role: "owner_designated_distinct_read_only_subagent",
      subjectImplementationContributor: false,
      externalReviewer: false,
      thirdPartyIdentityAuthenticated: false,
      sigstoreEvidence: null,
      decision: "approve_internal_technical_scope_only",
      p0Findings: [],
      p1Findings: [],
      p2Findings: [
        "The post-claim test core uses one bounded parallel latest/pending sample without an internal terminal reread; the separate pre-submission snapshot remains mandatory and production is hard-blocked."
      ],
      retainedSummary:
        "The final milestone audit reported GO after exact artifact, subject, documentation, package-boundary, secret and non-authorizing checks. The report existed only in the owner-designated collaboration session and is not cryptographic identity evidence."
    }
  ];
}

export function buildReviewDecision(releaseCommit) {
  if (releaseCommit === RELEASE_COMMIT && expectedDecisionCache !== undefined) {
    return expectedDecisionCache;
  }
  const reviewSubject = buildSubject(releaseCommit);
  const reviewSubjectCanonicalSha256 = hashCanonical(reviewSubject);
  const body = {
    schemaVersion: 1,
    recordType: "proofera_owner_designated_internal_multi_agent_technical_review_v1",
    status: "owner_designated_internal_technical_review_complete",
    lane: {
      designation: "repository_owner_designated_distinct_agent_internal_technical_review",
      designationSource:
        "repository-owner instruction in the current collaboration session; not an authenticated external identity assertion",
      organizationalIndependenceClaimed: false,
      externalReviewClaimed: false,
      sigstoreAuthenticationClaimed: false,
      authenticatedThirdPartyReviewClaimed: false,
      publicReviewerIdentityClaimed: false,
      decisionEffect:
        "closes_only_the_owner_designated_internal_technical_review_gate_for_the_exact_nonexecuting_subject"
    },
    reviewSubject,
    reviewSubjectCanonicalSha256,
    reviewers: reviewerDecisions(),
    checklist: [
      {
        id: "EXACT_RELEASE",
        outcome: "pass",
        evidence: "commit_tree_parent_and_all_subject_blob_bindings"
      },
      {
        id: "EXACT_CHAIN97_CALL",
        outcome: "pass",
        evidence: "one_fixed_sender_nonce_target_selector_calldata_and_cost_policy"
      },
      {
        id: "PRODUCTION_FAIL_CLOSED",
        outcome: "pass",
        evidence:
          "all_production_authority_signer_worker_recheck_and_submission_entries_unavailable"
      },
      {
        id: "PACKAGE_BOUNDARY",
        outcome: "pass",
        evidence: "post_claim_signing_and_submission_modules_not_package_exported"
      },
      {
        id: "AT_MOST_ONCE",
        outcome: "pass",
        evidence: "winner_only_submission_started_then_no_resend_or_replacement"
      },
      {
        id: "FINALIZED_RECONCILIATION",
        outcome: "pass",
        evidence: "dual_provider_transaction_receipt_logs_and_eip1898_post_state_specified"
      },
      {
        id: "NO_SECRET_OR_EXECUTION",
        outcome: "pass",
        evidence: "no_new_custody_rpc_adapter_sign_send_broadcast_or_receipt"
      },
      {
        id: "SEPARATE_OWNER_APPROVAL",
        outcome: "pass",
        evidence: "exact_transaction_owner_authorization_remains_absent_and_required"
      }
    ],
    knownLimitations: [
      "This is an owner-designated internal multi-agent technical review, not an external review, Sigstore identity proof, authenticated third-party decision, or claim of organizational independence.",
      "The decision binds only commit bc7000eee4d9698e272cc9deb7dda5748b34318b and the exact nonexecuting chain-97 subject. Any source, transaction, chain, policy, production composition, or execution-release change requires a new decision.",
      "The post-claim test core observes volatile latest/pending values in one bounded parallel sample; a separate fresh pre-submission snapshot is required. No production adapter exists.",
      "Local tests and unkeyed hashes establish reproducibility and integrity only. They do not establish reviewer identity, current chain state, transaction authority, or an onchain outcome."
    ],
    authorizationBoundary: {
      ownerDesignatedInternalTechnicalReviewSatisfied: true,
      externalReviewPerformed: false,
      sigstoreEvidencePresent: false,
      authenticatedThirdPartyReviewerPresent: false,
      exactOwnerTransactionApprovalPresent: false,
      productionCompositionPresent: false,
      productionActivationEligible: false,
      authorizesCustodyAccess: false,
      authorizesSigning: false,
      authorizesBroadcast: false,
      authorizesOnchainWrite: false,
      executionReady: false
    },
    executionEvidence: {
      walletAccessedByThisLane: false,
      secretReadByThisLane: false,
      rpcCalledByThisLane: false,
      signatureCreatedByThisLane: false,
      transactionBroadcastByThisLane: false,
      receiptCreatedByThisLane: false,
      poolCreatedByThisLane: false,
      liquidityCreatedByThisLane: false
    }
  };
  const decision = {
    ...body,
    integrity: {
      canonicalization:
        "UTF-8 JSON after recursive lexicographic object-key sorting; array order preserved; no insignificant whitespace",
      algorithm: "sha256",
      reviewSubjectCanonicalSha256,
      canonicalBodySha256: hashCanonical(body),
      authenticationMeaning: "none_unkeyed_integrity_only"
    }
  };
  if (releaseCommit === RELEASE_COMMIT) expectedDecisionCache = decision;
  return decision;
}

export function verifyReviewDecisionObject(value, releaseCommit = RELEASE_COMMIT) {
  const expected = buildReviewDecision(releaseCommit);
  if (canonicalCompact(value) !== canonicalCompact(expected)) {
    throw new Error(
      "Internal technical-review decision differs from the exact deterministic form."
    );
  }
  return value;
}

export function verifyCommittedReviewDecision(releaseCommit = RELEASE_COMMIT) {
  const path = resolve(REPOSITORY_ROOT, REVIEW_CONSTANTS.artifactPath);
  const raw = readFileSync(path);
  if (raw[0] !== 0x7b || raw.at(-1) !== 0x0a || raw.at(-2) === 0x0a) {
    throw new Error("Committed internal review must be one JSON object with exactly one final LF.");
  }
  const value = JSON.parse(raw.toString("utf8"));
  verifyReviewDecisionObject(value, releaseCommit);
  return { raw, value };
}

export function listExactSubjectPaths(releaseCommit = RELEASE_COMMIT) {
  assertExactRelease(releaseCommit);
  return exactSubjectPaths(releaseCommit);
}
