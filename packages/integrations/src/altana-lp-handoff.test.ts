import {
  EIP1967_ADMIN_SLOT,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  EVM_EMPTY_RUNTIME_CODE_HASH,
  LP_ACTIVATION_INTENT_SCHEMA_VERSION,
  LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
  PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
  PANCAKE_V3_BSC_TESTNET_FACTORY,
  PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION,
  PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD,
  PROOFERA_PANCAKE_V3_DENIED_MULTICALLS,
  PROOFERA_PANCAKE_V3_DIRECT_CALLS,
  WRITE_TARGET_ATTESTATION_SCHEMA_VERSION,
  assessWriteTargetAttestation,
  deriveLpActivationContextIds,
  deriveWriteTargetReviewId,
  lpActivationContextPayloadForId,
  type BuildLpActivationPolicyOptions,
  type LpActivationIntent,
  type LpActivationServerContext,
  type WriteTargetAttestation,
  type WriteTargetAttestationManifest,
  type WriteTargetAttestationResult,
  type WriteTargetSourceReview
} from "@proofera/domain";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prepareAltanaBootstrap } from "./altana-bootstrap";
import {
  buildAltanaLpBootstrapRequest,
  type AltanaLpDurableReservationDependency,
  type AltanaLpReservationReceipt,
  type AltanaLpReservationRequest
} from "./altana-lp-handoff";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const MAX_UINT256 = (2n ** 256n - 1n).toString();
const WALLET = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const TOKEN_0 = "0x3333333333333333333333333333333333333333";
const TOKEN_1 = "0x4444444444444444444444444444444444444444";
const POOL_DEPLOYER = "0x5555555555555555555555555555555555555555";
const WRAPPED_NATIVE = "0x6666666666666666666666666666666666666666";
const CONTEXT_ID = `0x${"10".repeat(32)}` as `0x${string}`;
const QUOTE_ID = `0x${"20".repeat(32)}` as `0x${string}`;
const CONTEXT_NONCE = `0x${"11".repeat(32)}` as `0x${string}`;
const QUOTE_NONCE = `0x${"21".repeat(32)}` as `0x${string}`;
const REVIEW_ID = `0x${"30".repeat(32)}` as `0x${string}`;
const BLOCK_HASH = `0x${"40".repeat(32)}` as `0x${string}`;
const MANAGER_CODE_HASH = `0x${"50".repeat(32)}` as `0x${string}`;
const FACTORY_CODE_HASH = `0x${"60".repeat(32)}` as `0x${string}`;
const POOL_CODE_HASH = `0x${"70".repeat(32)}` as `0x${string}`;
const POOL_DEPLOYER_CODE_HASH = `0x${"80".repeat(32)}` as `0x${string}`;
const WRAPPED_NATIVE_CODE_HASH = `0x${"90".repeat(32)}` as `0x${string}`;
const TOKEN_0_CODE_HASH = `0x${"a0".repeat(32)}` as `0x${string}`;
const TOKEN_1_CODE_HASH = `0x${"b0".repeat(32)}` as `0x${string}`;
const RESERVATION_ID = `0x${"c0".repeat(32)}` as `0x${string}`;
const PROXY_IMPLEMENTATION = "0x7777777777777777777777777777777777777777";
const PROXY_ADMIN = "0x8888888888888888888888888888888888888888";
const PROXY_IMPLEMENTATION_CODE_HASH = `0x${"d0".repeat(32)}` as `0x${string}`;
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

function evidence(seed: string) {
  return {
    locator: {
      scheme: "https" as const,
      uri: `https://evidence.proofera.example/reviews/${seed}.json`
    },
    sha256: `0x${seed.slice(0, 2).padEnd(2, "0").repeat(32)}`
  };
}

function sourceReview(runtimeCodeHash: string, seed: string): WriteTargetSourceReview {
  return {
    runtimeCodeHash,
    source: {
      repositoryUrl: "https://github.com/proofera-fi/reviewed-contracts",
      commit: "abcdef0123456789abcdef0123456789abcdef01",
      artifactPath: `artifacts/${seed}/ReviewedContract.json`,
      contractName: "ReviewedContract",
      sourceTreeSha256: `0x${"61".repeat(32)}`
    },
    compiler: {
      name: "solc",
      version: "0.8.26+commit.8a97fa7a",
      compilerInputSha256: `0x${"62".repeat(32)}`,
      compilerSettingsSha256: `0x${"63".repeat(32)}`,
      outputArtifactSha256: `0x${"64".repeat(32)}`,
      outputRuntimeCodeHash: runtimeCodeHash,
      optimizer: { enabled: true, runs: 200 },
      viaIr: false,
      evmVersion: "cancun",
      metadataBytecodeHash: "ipfs"
    },
    verification: {
      kind: "reproducible_build",
      claim: "runtime_bytecode_exact_match",
      runtimeCodeHash,
      verifiedAt: "2026-08-01T00:00:00.000Z",
      evidence: evidence("65")
    },
    independentReview: {
      decision: "approved_for_exact_scoped_writes",
      methodology: "manual_source_build_and_control_path_review",
      reviewerIdentity: "ProofEra Security Review 2026-08",
      reviewedAt: "2026-08-02T00:00:00.000Z",
      runtimeCodeHash,
      writeScopeSha256: `0x${"66".repeat(32)}`,
      evidence: evidence("67")
    }
  };
}

function reviewedContract(
  address: string,
  runtimeCodeHash: string,
  seed: string,
  blockNumber = "42000000",
  blockHash: string = BLOCK_HASH
) {
  return {
    code: {
      blockNumber,
      blockHash,
      address,
      runtimeCodeHash,
      observedAt: "2026-08-11T11:59:35.000Z"
    },
    sourceReview: sourceReview(runtimeCodeHash, seed)
  };
}

function writeTargetManifest(
  overrides: Readonly<{
    address?: string;
    runtimeCodeHash?: string;
    blockNumber?: string;
    blockHash?: string;
  }> = {}
): WriteTargetAttestationManifest {
  const address = overrides.address ?? PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER;
  const runtimeCodeHash = overrides.runtimeCodeHash ?? MANAGER_CODE_HASH;
  const blockNumber = overrides.blockNumber ?? "42000000";
  const blockHash = overrides.blockHash ?? BLOCK_HASH;
  return {
    schemaVersion: WRITE_TARGET_ATTESTATION_SCHEMA_VERSION,
    chainId: 97,
    environment: "testnet",
    canonicalBlock: {
      number: blockNumber,
      hash: blockHash,
      timestamp: "2026-08-11T11:59:30.000Z"
    },
    attestedAt: "2026-08-11T11:59:45.000Z",
    target: reviewedContract(address, runtimeCodeHash, "position-manager", blockNumber, blockHash),
    proxyAssessment: {
      kind: "non_proxy",
      decision: "independently_reviewed_non_proxy_selector_scoped",
      targetAddress: address,
      blockNumber,
      blockHash,
      runtimeCodeHash,
      observedAt: "2026-08-11T11:59:40.000Z",
      evidence: evidence("68"),
      selectorCallPathAssessment: {
        scope: "pancake_v3_position_manager_direct_calls",
        runtimeCodeHash,
        sourceTreeSha256: `0x${"61".repeat(32)}`,
        compilerOutputArtifactSha256: `0x${"64".repeat(32)}`,
        writeScopeSha256: `0x${"66".repeat(32)}`,
        allowedDirectCalls: PROOFERA_PANCAKE_V3_DIRECT_CALLS.map((definition, index) => ({
          ...definition,
          decision: "allowed_direct_entrypoint" as const,
          analyzedAt: "2026-08-02T00:00:00.000Z",
          method: PANCAKE_V3_SELECTOR_PATH_ANALYSIS_METHOD,
          bindings: {
            runtimeCodeHash,
            sourceTreeSha256: `0x${"61".repeat(32)}`,
            compilerOutputArtifactSha256: `0x${"64".repeat(32)}`,
            writeScopeSha256: `0x${"66".repeat(32)}`
          },
          reachability: {
            controlFlowCoverage: "all_branches_resolved" as const,
            delegatecall: "unreachable" as const,
            arbitraryDispatcher: "unreachable" as const,
            unknownPaths: "none" as const
          },
          analysisArtifact: evidence(`a${index + 1}`),
          sourcePathSha256: `0x${(index + 1).toString(16).padStart(2, "0").repeat(32)}`,
          bytecodePathSha256: `0x${(index + 11).toString(16).padStart(2, "0").repeat(32)}`
        })) as never,
        delegatecallBoundary: {
          classification: "known_self_delegatecall_dispatcher_present",
          delegatecallProgramCounter: 10_522,
          reviewedSourceLocation:
            "projects/v3-periphery/contracts/base/Multicall.sol#multicall(bytes[])_self_delegatecall",
          runtimeCodeHash,
          compilerOutputArtifactSha256: `0x${"64".repeat(32)}`,
          reviewedAt: "2026-08-02T00:00:00.000Z",
          analysisArtifact: evidence("af"),
          deniedMulticalls: PROOFERA_PANCAKE_V3_DENIED_MULTICALLS.map((definition) => ({
            ...definition,
            decision: "denied" as const
          })) as never,
          unlistedSelectors: "denied",
          nestedCalldata: "denied"
        }
      }
    }
  };
}

function transparentWriteTargetManifest(): WriteTargetAttestationManifest {
  return {
    ...writeTargetManifest(),
    proxyAssessment: {
      kind: "recognized_proxy",
      standard: "eip1967_transparent",
      proxyAddress: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      blockNumber: "42000000",
      blockHash: BLOCK_HASH,
      observedAt: "2026-08-11T11:59:40.000Z",
      evidence: {
        decision: "recognized_standard_and_control_paths_reviewed",
        reviewedAt: "2026-08-02T00:00:00.000Z",
        evidence: evidence("69")
      },
      slots: {
        implementation: {
          blockNumber: "42000000",
          blockHash: BLOCK_HASH,
          slot: EIP1967_IMPLEMENTATION_SLOT,
          value: `0x${"0".repeat(24)}${PROXY_IMPLEMENTATION.slice(2)}`
        },
        admin: {
          blockNumber: "42000000",
          blockHash: BLOCK_HASH,
          slot: EIP1967_ADMIN_SLOT,
          value: `0x${"0".repeat(24)}${PROXY_ADMIN.slice(2)}`
        },
        beacon: {
          blockNumber: "42000000",
          blockHash: BLOCK_HASH,
          slot: EIP1967_BEACON_SLOT,
          value: ZERO_BYTES32
        }
      },
      implementation: reviewedContract(
        PROXY_IMPLEMENTATION,
        PROXY_IMPLEMENTATION_CODE_HASH,
        "proxy-implementation"
      ),
      admin: {
        accountKind: "eoa",
        code: {
          blockNumber: "42000000",
          blockHash: BLOCK_HASH,
          address: PROXY_ADMIN,
          runtimeCodeHash: EVM_EMPTY_RUNTIME_CODE_HASH,
          observedAt: "2026-08-11T11:59:35.000Z"
        },
        sourceReview: null
      },
      beacon: null
    }
  };
}

function attest(manifest: WriteTargetAttestationManifest): WriteTargetAttestation {
  return { ...manifest, reviewId: deriveWriteTargetReviewId(manifest) };
}

function evaluatedWriteTarget(
  manifest: WriteTargetAttestationManifest = writeTargetManifest()
): WriteTargetAttestationResult {
  const attestation = attest(manifest);
  return assessWriteTargetAttestation(attestation, {
    asOf: () => new Date(NOW),
    expectedReviewId: attestation.reviewId
  });
}

function blockedEvaluatedWriteTarget(): WriteTargetAttestationResult {
  const base = writeTargetManifest();
  return evaluatedWriteTarget({
    ...base,
    proxyAssessment: {
      kind: "blocked",
      classification: "delegatecall_ambiguous",
      targetAddress: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      blockNumber: "42000000",
      blockHash: BLOCK_HASH,
      observedAt: "2026-08-11T11:59:40.000Z",
      evidence: evidence("6a")
    }
  });
}

const TRUSTED_WRITE_TARGET_REVIEW_ID = attest(writeTargetManifest()).reviewId;

function intentFixture(): LpActivationIntent {
  return {
    schemaVersion: LP_ACTIVATION_INTENT_SCHEMA_VERSION,
    chainId: 97,
    wallet: WALLET,
    recipient: WALLET,
    poolAddress: POOL,
    positionTokenId: MAX_UINT256,
    desiredTick: { lower: -120, upper: 120 },
    capital: { token0Raw: MAX_UINT256, token1Raw: "2000000" },
    maxSlippageBps: 50,
    sessionDurationSeconds: 3_600,
    txDeadlineSeconds: 40,
    maxExecutionsPerDay: 4
  };
}

function contextFixture(): LpActivationServerContext {
  const candidate: LpActivationServerContext = {
    schemaVersion: LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
    contextId: CONTEXT_ID,
    quoteId: QUOTE_ID,
    chainId: 97,
    environment: "testnet",
    issuedAt: "2026-08-11T11:59:50.000Z",
    expiresAt: "2026-08-11T12:00:40.000Z",
    authenticatedWallet: WALLET,
    intentBinding: intentFixture(),
    reviewedDeployment: {
      protocol: "PancakeSwap V3",
      reviewId: REVIEW_ID,
      reviewedAt: "2026-08-01T00:00:00.000Z",
      sourceUrl: PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
      fee: 2_500,
      tickSpacing: 60,
      token0: { address: TOKEN_0, codeHash: TOKEN_0_CODE_HASH, decimals: 18 },
      token1: { address: TOKEN_1, codeHash: TOKEN_1_CODE_HASH, decimals: 6 },
      positionManager: {
        address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        codeHash: MANAGER_CODE_HASH
      },
      factory: { address: PANCAKE_V3_BSC_TESTNET_FACTORY, codeHash: FACTORY_CODE_HASH },
      pool: { address: POOL, codeHash: POOL_CODE_HASH },
      poolDeployer: { address: POOL_DEPLOYER, codeHash: POOL_DEPLOYER_CODE_HASH },
      wrappedNative: { address: WRAPPED_NATIVE, codeHash: WRAPPED_NATIVE_CODE_HASH }
    },
    observedDeployment: {
      blockNumber: "42000000",
      blockHash: BLOCK_HASH,
      positionManager: {
        address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        codeHash: MANAGER_CODE_HASH
      },
      factory: { address: PANCAKE_V3_BSC_TESTNET_FACTORY, codeHash: FACTORY_CODE_HASH },
      pool: { address: POOL, codeHash: POOL_CODE_HASH },
      poolDeployer: { address: POOL_DEPLOYER, codeHash: POOL_DEPLOYER_CODE_HASH },
      token0: { address: TOKEN_0, codeHash: TOKEN_0_CODE_HASH },
      token1: { address: TOKEN_1, codeHash: TOKEN_1_CODE_HASH },
      wrappedNative: { address: WRAPPED_NATIVE, codeHash: WRAPPED_NATIVE_CODE_HASH }
    },
    position: {
      fee: 2_500,
      managerAddress: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      ownerAddress: WALLET,
      poolAddress: POOL,
      tickLower: -60,
      tickUpper: 60,
      token0Address: TOKEN_0,
      token1Address: TOKEN_1,
      tokenId: MAX_UINT256
    },
    pool: {
      address: POOL,
      currentTick: 0,
      factoryAddress: PANCAKE_V3_BSC_TESTNET_FACTORY,
      fee: 2_500,
      sqrtPriceX96: "79228162514264337593543950336",
      tickSpacing: 60,
      token0: { address: TOKEN_0, decimals: 18 },
      token1: { address: TOKEN_1, decimals: 6 }
    },
    factoryRelation: {
      factoryAddress: PANCAKE_V3_BSC_TESTNET_FACTORY,
      fee: 2_500,
      poolAddress: POOL,
      tickSpacing: 60,
      token0Address: TOKEN_0,
      token1Address: TOKEN_1
    },
    authorization: {
      blockNumber: "42000000",
      blockHash: BLOCK_HASH,
      authorizationKind: "owner",
      controllerAddress: WALLET,
      controllerAuthorized: true,
      observedAt: "2026-08-11T11:59:35.000Z",
      ownerAddress: WALLET,
      positionTokenId: MAX_UINT256,
      source: "onchain_owner_and_controller_read"
    },
    block: {
      hash: BLOCK_HASH,
      number: "42000000",
      timestamp: "2026-08-11T11:59:30.000Z"
    },
    quote: {
      blockNumber: "42000000",
      blockHash: BLOCK_HASH,
      capitalToken0Raw: MAX_UINT256,
      capitalToken1Raw: "2000000",
      calculation: {
        currentTick: 0,
        exactLiquidityMatchRequired: true,
        methodologyVersion: PANCAKE_V3_LIQUIDITY_QUOTE_METHODOLOGY_VERSION,
        preliminaryLiquidityRaw: "1",
        recomputedFromCalldataAtObservedPriceRaw: "1",
        sqrtPriceX96: "79228162514264337593543950336",
        tickLower: -120,
        tickUpper: 120
      },
      maxSlippageBps: 50,
      observedAt: "2026-08-11T11:59:40.000Z",
      poolAddress: POOL,
      sourceKind: "pancake_v3_block_pinned_math",
      sourceUrl: `https://testnet.bscscan.com/address/${POOL}`,
      token0: {
        address: TOKEN_0,
        capitalNotSubmittedRaw: "0",
        desiredMaximumRaw: MAX_UINT256,
        minimumAmountRaw: MAX_UINT256
      },
      token1: {
        address: TOKEN_1,
        capitalNotSubmittedRaw: "0",
        desiredMaximumRaw: "2000000",
        minimumAmountRaw: "1900000"
      },
      validUntil: "2026-08-11T12:00:40.000Z"
    }
  };
  return {
    ...candidate,
    ...deriveLpActivationContextIds(
      candidate.intentBinding,
      lpActivationContextPayloadForId(candidate),
      {
        contextNonce: CONTEXT_NONCE,
        quoteNonce: QUOTE_NONCE
      }
    )
  };
}

function policyOptions(
  overrides: Partial<BuildLpActivationPolicyOptions> = {}
): BuildLpActivationPolicyOptions {
  return {
    agentId: "proofera:lp-range-guardian:v1",
    token0Symbol: "WBNB",
    token1Symbol: "USDT",
    expectedContextId: contextFixture().contextId as `0x${string}`,
    contextNonce: CONTEXT_NONCE,
    quoteNonce: QUOTE_NONCE,
    consumedContextIds: [],
    consumedQuoteIds: [],
    now: () => new Date(NOW),
    ...overrides
  };
}

function receiptFor(
  request: AltanaLpReservationRequest,
  overrides: Partial<AltanaLpReservationReceipt> = {}
): AltanaLpReservationReceipt {
  return {
    ...request,
    state: "consumed",
    ...overrides
  };
}

function reservationDependency(
  consumeOrRead: AltanaLpDurableReservationDependency["consumeOrRead"] = async (request) =>
    receiptFor(request)
): AltanaLpDurableReservationDependency {
  return { consumeOrRead };
}

function build(
  intent: unknown = intentFixture(),
  context: unknown = contextFixture(),
  options: BuildLpActivationPolicyOptions = policyOptions(),
  bootstrapOptions: unknown = { userId: "user:test:1", bootstrapTtlSeconds: 30 },
  writeTargetAttestationResult: unknown = evaluatedWriteTarget(),
  reservation: unknown = reservationDependency(async (request) => ({
    ...request,
    state: "consumed"
  })),
  priorReservationRequest: unknown = null,
  expectedWriteTargetReviewId: unknown = TRUSTED_WRITE_TARGET_REVIEW_ID
) {
  return buildAltanaLpBootstrapRequest(
    intent,
    context,
    options,
    bootstrapOptions,
    writeTargetAttestationResult,
    expectedWriteTargetReviewId,
    reservation,
    priorReservationRequest
  );
}

describe("LP policy to Altana bootstrap handoff", () => {
  it("re-resolves raw inputs, reserves their exact binding, and maps policy authority", async () => {
    const result = await build();
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected a ready handoff fixture.");

    expect(result.bootstrapRequest).toMatchObject({
      schemaVersion: 1,
      userId: "user:test:1",
      chainId: 97,
      walletAddress: WALLET,
      policyHash: result.policyBuild.policyHash,
      sessionExpiry: result.policyBuild.policy.expiry,
      bootstrapTtlSeconds: 30
    });
    expect(
      result.bootstrapRequest.permissions.calls.map(({ to, signature }) => ({
        to: to.toLowerCase(),
        signature
      }))
    ).toEqual(result.policyBuild.policy.calls.map(({ to, signature }) => ({ to, signature })));
    expect(result.bootstrapRequest.permissions.spend).toEqual([
      { token: TOKEN_0, limit: MAX_UINT256, period: "day" },
      { token: TOKEN_1, limit: "2000000", period: "day" }
    ]);
    expect(result.bootstrapRequest.permissions.spend.every(({ token }) => token !== null)).toBe(
      true
    );
    expect(result.writeTargetBinding).toEqual({
      chainId: 97,
      address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      runtimeCodeHash: MANAGER_CODE_HASH,
      canonicalBlockNumber: "42000000",
      canonicalBlockHash: BLOCK_HASH,
      reviewId: attest(writeTargetManifest()).reviewId,
      proxyKind: "none"
    });
    expect(result.reservationReceipt).toMatchObject({
      schemaVersion: 2,
      contextId: result.policyBuild.sourceBinding.contextId,
      quoteId: result.policyBuild.sourceBinding.quoteId,
      userId: "user:test:1",
      policyHash: result.policyBuild.policyHash,
      writeTargetBinding: result.writeTargetBinding,
      consumedAt: NOW.toISOString(),
      expiresAt: "2026-08-11T12:00:30.000Z",
      state: "consumed"
    });
    expect(result.reservationReceipt).toEqual({
      ...result.reservationRequest,
      state: "consumed"
    });
    expect(result.reservationReceipt.reservationId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.scopeBoundary).toEqual({
      outputKind: "validated_bootstrap_request_with_durable_reservation",
      rawIntentReResolved: true,
      contextQuoteReservationConsumedAtomically: true,
      reservationOutcome: "context_quote_pair_consumed_atomically_or_identical_receipt_read",
      reservationReceiptValidated: true,
      sessionKeyCreated: false,
      secretHandleCreated: false,
      bootstrapPersisted: false,
      authorityCreated: false,
      walletSignatureRequested: false,
      transactionSubmitted: false,
      executionPerformed: false
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.bootstrapRequest.permissions)).toBe(true);
    expect(Object.isFrozen(result.writeTargetBinding)).toBe(true);
    expect(Object.isFrozen(result.reservationRequest)).toBe(true);
    expect(Object.isFrozen(result.reservationReceipt)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect("sessionKey" in result.bootstrapRequest).toBe(false);
    expect("secretHandle" in result.bootstrapRequest).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/private.?key/i);
  });

  it("preserves the full TTL when policy resolution has fractional milliseconds", async () => {
    const fractionalNow = new Date("2026-08-11T12:00:00.999Z");
    const intent = intentFixture();
    const baseContext = contextFixture();
    const contextCandidate = {
      ...baseContext,
      expiresAt: "2026-08-11T12:00:40.999Z",
      intentBinding: intent,
      quote: {
        ...baseContext.quote,
        observedAt: "2026-08-11T11:59:40.999Z",
        validUntil: "2026-08-11T12:00:40.999Z"
      }
    };
    const context = {
      ...contextCandidate,
      ...deriveLpActivationContextIds(
        contextCandidate.intentBinding,
        lpActivationContextPayloadForId(contextCandidate),
        { contextNonce: CONTEXT_NONCE, quoteNonce: QUOTE_NONCE }
      )
    };
    const result = await build(
      intent,
      context,
      policyOptions({
        expectedContextId: context.contextId,
        now: () => new Date(fractionalNow)
      })
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected a ready fractional-time handoff.");
    expect(result.reservationReceipt.consumedAt).toBe(fractionalNow.toISOString());
    expect(result.reservationReceipt.expiresAt).toBe("2026-08-11T12:00:30.999Z");
    expect(
      Date.parse(result.reservationReceipt.expiresAt) -
        Date.parse(result.reservationReceipt.consumedAt)
    ).toBe(30_000);
  });

  it("feeds the existing bootstrap state machine without creating a key or grant", async () => {
    const handoff = await build();
    if (handoff.status !== "ready") throw new Error("Expected a ready handoff fixture.");
    const state = prepareAltanaBootstrap(handoff.bootstrapRequest, {
      clock: () => new Date(NOW),
      id: () => "bootstrap:test:1",
      nonce: () => `0x${"90".repeat(32)}`
    });

    expect(state.status).toBe("bootstrap_ready");
    expect(state.policyHash).toBe(handoff.policyBuild.policyHash);
    expect("sessionKey" in state).toBe(false);
    expect("secretHandle" in state).toBe(false);
  });

  it("does not accept a client-supplied ready-policy envelope in place of raw inputs", async () => {
    const ready = await build();
    expect(ready.status).toBe("ready");

    const forgedIntent = await build(ready, contextFixture());
    const forgedContext = await build(intentFixture(), ready);
    expect(forgedIntent.status).toBe("blocked");
    expect(forgedContext.status).toBe("blocked");
    for (const result of [forgedIntent, forgedContext]) {
      expect(result.bootstrapRequest).toBeNull();
      expect(result.issues[0]?.code).toBe("POLICY_BUILD_BLOCKED");
      expect(result.policyBuild?.status).toBe("blocked");
    }
  });

  it("requires an evaluated ready attestation result and never reads unsafe accessors", async () => {
    let getterCalls = 0;
    const accessorResult = {
      get status() {
        getterCalls += 1;
        return "ready";
      }
    };
    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
      receiptFor(request)
    );
    const dependency = reservationDependency(consumeOrRead);
    const candidates: ReadonlyArray<readonly [unknown, string]> = [
      [null, "WRITE_TARGET_ATTESTATION_INVALID"],
      [{ status: "ready" }, "WRITE_TARGET_ATTESTATION_INVALID"],
      [accessorResult, "WRITE_TARGET_ATTESTATION_INVALID"],
      [attest(writeTargetManifest()), "WRITE_TARGET_ATTESTATION_INVALID"],
      [blockedEvaluatedWriteTarget(), "WRITE_TARGET_ATTESTATION_BLOCKED"]
    ];

    for (const [candidate, expectedCode] of candidates) {
      const result = await build(
        intentFixture(),
        contextFixture(),
        policyOptions(),
        { userId: "user:test:1", bootstrapTtlSeconds: 30 },
        candidate,
        dependency
      );
      expect(result.status).toBe("blocked");
      expect(result.issues[0]?.code).toBe(expectedCode);
      expect(result.bootstrapRequest).toBeNull();
      expect(result.writeTargetBinding).toBeNull();
    }
    expect(getterCalls).toBe(0);
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it("requires the independently provisioned full-review ID before durable reservation", async () => {
    const base = writeTargetManifest();
    const forgedManifest: WriteTargetAttestationManifest = {
      ...base,
      target: {
        ...base.target,
        sourceReview: {
          ...base.target.sourceReview,
          independentReview: {
            ...base.target.sourceReview.independentReview,
            evidence: evidence("aa")
          }
        }
      }
    };
    const forgedEvaluatedResult = evaluatedWriteTarget(forgedManifest);
    expect(forgedEvaluatedResult.status).toBe("ready");
    if (forgedEvaluatedResult.status !== "ready") {
      throw new Error("Expected a schema-valid independently evaluated forged fixture.");
    }
    expect(forgedEvaluatedResult.attestation.reviewId).not.toBe(TRUSTED_WRITE_TARGET_REVIEW_ID);

    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
      receiptFor(request)
    );
    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      forgedEvaluatedResult,
      reservationDependency(consumeOrRead)
    );

    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "WRITE_TARGET_ATTESTATION_NOT_TRUSTED" })
    ]);
    expect(result.writeTargetBinding).toBeNull();
    expect(result.reservationRequest).toBeNull();
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it.each([null, `0x${"00".repeat(32)}`, `0x${"ff".repeat(31)}`])(
    "fails closed on a missing or malformed full-review trust root",
    async (expectedWriteTargetReviewId) => {
      const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
        receiptFor(request)
      );
      const result = await build(
        intentFixture(),
        contextFixture(),
        policyOptions(),
        { userId: "user:test:1", bootstrapTtlSeconds: 30 },
        evaluatedWriteTarget(),
        reservationDependency(consumeOrRead),
        null,
        expectedWriteTargetReviewId
      );

      expect(result.status).toBe("blocked");
      expect(result.issues[0]?.code).toBe("WRITE_TARGET_ATTESTATION_NOT_TRUSTED");
      expect(consumeOrRead).not.toHaveBeenCalled();
    }
  );

  it("blocks when the full-review trust-root argument is absent", async () => {
    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
      receiptFor(request)
    );
    const result = await buildAltanaLpBootstrapRequest(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      undefined,
      reservationDependency(consumeOrRead)
    );

    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe("WRITE_TARGET_ATTESTATION_NOT_TRUSTED");
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "address",
      result: evaluatedWriteTarget({
        ...writeTargetManifest({ address: "0x9999999999999999999999999999999999999999" })
      }),
      code: "WRITE_TARGET_ATTESTATION_BINDING_MISMATCH"
    },
    {
      label: "runtime hash",
      result: evaluatedWriteTarget({
        ...writeTargetManifest({ runtimeCodeHash: `0x${"e0".repeat(32)}` })
      }),
      code: "WRITE_TARGET_ATTESTATION_BINDING_MISMATCH"
    },
    {
      label: "canonical block number",
      result: evaluatedWriteTarget({ ...writeTargetManifest({ blockNumber: "42000001" }) }),
      code: "WRITE_TARGET_ATTESTATION_BINDING_MISMATCH"
    },
    {
      label: "canonical block hash",
      result: evaluatedWriteTarget({
        ...writeTargetManifest({ blockHash: `0x${"e1".repeat(32)}` })
      }),
      code: "WRITE_TARGET_ATTESTATION_BINDING_MISMATCH"
    },
    {
      label: "chain",
      result: (() => {
        const ready = evaluatedWriteTarget();
        if (ready.status !== "ready") throw new Error("Expected a ready write-target fixture.");
        return {
          ...ready,
          attestation: { ...ready.attestation, chainId: 56 },
          effectiveTarget: { ...ready.effectiveTarget, chainId: 56 }
        };
      })(),
      code: "WRITE_TARGET_ATTESTATION_INVALID"
    },
    {
      label: "review ID",
      result: (() => {
        const ready = evaluatedWriteTarget();
        if (ready.status !== "ready") throw new Error("Expected a ready write-target fixture.");
        const wrongReviewId = `0x${"e2".repeat(32)}`;
        return {
          ...ready,
          attestation: { ...ready.attestation, reviewId: wrongReviewId },
          effectiveTarget: { ...ready.effectiveTarget, reviewId: wrongReviewId }
        };
      })(),
      code: "WRITE_TARGET_ATTESTATION_BINDING_MISMATCH"
    }
  ])(
    "rejects a ready attestation with the wrong $label before reservation",
    async ({ result, code }) => {
      const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
        receiptFor(request)
      );
      const handoff = await build(
        intentFixture(),
        contextFixture(),
        policyOptions(),
        { userId: "user:test:1", bootstrapTtlSeconds: 30 },
        result,
        reservationDependency(consumeOrRead)
      );

      expect(handoff.status).toBe("blocked");
      expect(handoff.issues[0]?.code).toBe(code);
      expect(handoff.writeTargetBinding).toBeNull();
      expect(consumeOrRead).not.toHaveBeenCalled();
    }
  );

  it("joins policy and write-target evidence on the exact canonical block timestamp", async () => {
    const baseContext = contextFixture();
    const contextCandidate = {
      ...baseContext,
      block: { ...baseContext.block, timestamp: "2026-08-11T11:59:31.000Z" }
    };
    const context = {
      ...contextCandidate,
      ...deriveLpActivationContextIds(
        contextCandidate.intentBinding,
        lpActivationContextPayloadForId(contextCandidate),
        { contextNonce: CONTEXT_NONCE, quoteNonce: QUOTE_NONCE }
      )
    };
    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
      receiptFor(request)
    );

    const result = await build(
      intentFixture(),
      context,
      policyOptions({ expectedContextId: context.contextId }),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(consumeOrRead)
    );

    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe("WRITE_TARGET_ATTESTATION_BINDING_MISMATCH");
    expect(result.writeTargetBinding).toBeNull();
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it("keeps evaluated proxy targets analysis-only before durable reservation", async () => {
    const evaluatedProxy = evaluatedWriteTarget(transparentWriteTargetManifest());
    expect(evaluatedProxy.status).toBe("ready");
    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
      receiptFor(request)
    );

    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedProxy,
      reservationDependency(consumeOrRead)
    );

    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe("WRITE_TARGET_PROXY_UNSUPPORTED");
    expect(result.writeTargetBinding).toBeNull();
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it("fails closed when context evidence is stale or its reviewed identity drifts", async () => {
    const staleContext = { ...contextFixture(), issuedAt: "2026-08-11T11:57:00.000Z" };
    const context = contextFixture();
    const driftedContext = {
      ...context,
      observedDeployment: {
        ...context.observedDeployment,
        positionManager: {
          ...context.observedDeployment.positionManager,
          codeHash: `0x${"99".repeat(32)}`
        }
      }
    };

    for (const result of await Promise.all([
      build(intentFixture(), staleContext),
      build(intentFixture(), driftedContext)
    ])) {
      expect(result.status).toBe("blocked");
      expect(result.bootstrapRequest).toBeNull();
      expect(result.issues[0]?.code).toBe("POLICY_BUILD_BLOCKED");
    }
  });

  it("requires the bootstrap to expire before context, quote, transaction, and session windows", async () => {
    const validBoundary = await build(intentFixture(), contextFixture(), policyOptions(), {
      userId: "user:test:1",
      bootstrapTtlSeconds: 39
    });
    const contextExpiryBoundary = await build(intentFixture(), contextFixture(), policyOptions(), {
      userId: "user:test:1",
      bootstrapTtlSeconds: 40
    });

    expect(validBoundary.status).toBe("ready");
    expect(contextExpiryBoundary.status).toBe("blocked");
    expect(contextExpiryBoundary.issues[0]?.code).toBe("BOOTSTRAP_WINDOW_INVALID");
  });

  it.each([
    { label: "too-short TTL", value: { userId: "user:test:1", bootstrapTtlSeconds: 29 } },
    { label: "invalid user", value: { userId: "<script>", bootstrapTtlSeconds: 30 } },
    {
      label: "unexpected key",
      value: { userId: "user:test:1", bootstrapTtlSeconds: 30, sessionKey: "forged" }
    }
  ])("rejects $label before building policy", async ({ value }) => {
    let clockCalls = 0;
    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions({
        now: () => {
          clockCalls += 1;
          return new Date(NOW);
        }
      }),
      value
    );

    expect(result.status).toBe("blocked");
    expect(result.policyBuild).toBeNull();
    expect(result.issues[0]?.code).toBe("BOOTSTRAP_OPTIONS_INVALID");
    expect(clockCalls).toBe(0);
  });

  it("rejects accessor and symbolic bootstrap option records without invoking getters", async () => {
    let getterCalls = 0;
    const accessor = {
      userId: "user:test:1",
      get bootstrapTtlSeconds() {
        getterCalls += 1;
        return 60;
      }
    };
    const symbolic = Object.assign(
      { userId: "user:test:1", bootstrapTtlSeconds: 60 },
      { [Symbol("hidden")]: true }
    );

    expect((await build(intentFixture(), contextFixture(), policyOptions(), accessor)).status).toBe(
      "blocked"
    );
    expect((await build(intentFixture(), contextFixture(), policyOptions(), symbolic)).status).toBe(
      "blocked"
    );
    expect(getterCalls).toBe(0);
  });

  it("recursively snapshots raw intent and context without invoking nested getters", async () => {
    let getterCalls = 0;
    const intent = intentFixture();
    Object.defineProperty(intent.desiredTick, "lower", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return -120;
      }
    });
    const context = contextFixture();
    Object.defineProperty(context.reviewedDeployment.positionManager, "codeHash", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return MANAGER_CODE_HASH;
      }
    });
    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
      receiptFor(request)
    );

    const intentResult = await build(
      intent,
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(consumeOrRead)
    );
    const contextResult = await build(
      intentFixture(),
      context,
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(consumeOrRead)
    );

    expect(intentResult.issues[0]?.code).toBe("POLICY_BUILD_BLOCKED");
    expect(contextResult.issues[0]?.code).toBe("POLICY_BUILD_BLOCKED");
    expect(getterCalls).toBe(0);
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it("requires an exact durable dependency and rejects accessors without invoking them", async () => {
    let getterCalls = 0;
    const accessorDependency = {
      get consumeOrRead() {
        getterCalls += 1;
        return async () => null;
      }
    };
    const missing = await buildAltanaLpBootstrapRequest(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      TRUSTED_WRITE_TARGET_REVIEW_ID,
      undefined
    );
    const malformed = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      { consumeOrRead: async () => null, extra: true }
    );
    const accessor = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      accessorDependency
    );

    for (const result of [missing, malformed, accessor]) {
      expect(result.status).toBe("blocked");
      expect(result.issues[0]?.code).toBe("RESERVATION_DEPENDENCY_INVALID");
      expect(result.reservationReceipt).toBeNull();
    }
    expect(getterCalls).toBe(0);
  });

  it("rejects proxy-wrapped direct inputs and clocks without invoking traps", async () => {
    const trap = vi.fn();
    const handler: ProxyHandler<object> = {
      apply() {
        trap();
        return new Date(NOW);
      },
      getOwnPropertyDescriptor() {
        trap();
        return undefined;
      },
      getPrototypeOf() {
        trap();
        return Object.prototype;
      },
      ownKeys() {
        trap();
        return [];
      }
    };
    const proxiedContext = await build(intentFixture(), new Proxy(contextFixture(), handler));
    const baseClockOptions = policyOptions();
    const clockOptions = {
      ...baseClockOptions,
      now: new Proxy(baseClockOptions.now, handler as ProxyHandler<() => Date>)
    };
    const proxiedClock = await build(intentFixture(), contextFixture(), clockOptions);
    const dateOptions = policyOptions({
      now: () => new Proxy(new Date(NOW), handler) as Date
    });
    const proxiedDate = await build(intentFixture(), contextFixture(), dateOptions);

    expect(proxiedContext.issues[0]?.code).toBe("POLICY_BUILD_BLOCKED");
    expect(proxiedClock.issues[0]?.code).toBe("POLICY_BUILD_BLOCKED");
    expect(proxiedDate.issues[0]?.code).toBe("POLICY_BUILD_BLOCKED");
    expect(trap).not.toHaveBeenCalled();
  });

  it("snapshots nested policy-option arrays without invoking accessors", async () => {
    let getterCalls = 0;
    const consumedContextIds: string[] = [];
    Object.defineProperty(consumedContextIds, "0", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return CONTEXT_ID;
      }
    });
    const options = policyOptions({
      consumedContextIds: consumedContextIds as `0x${string}`[]
    });

    const result = await build(intentFixture(), contextFixture(), options);

    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe("POLICY_BUILD_BLOCKED");
    expect(getterCalls).toBe(0);
  });

  it("fails closed when the durable operation throws and hides its error", async () => {
    const consumeOrRead = vi.fn(async () => {
      throw new Error("database URL and credentials must not escape");
    });
    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(consumeOrRead)
    );

    expect(consumeOrRead).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe("RESERVATION_FAILED");
    expect(result.scopeBoundary).toMatchObject({
      contextQuoteReservationConsumedAtomically: null,
      reservationOutcome: "unknown",
      bootstrapPersisted: false
    });
    expect(result.reservationRequest).not.toBeNull();
    expect(Object.isFrozen(result.reservationRequest)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("database URL");
  });

  it.each([
    { outcome: "not_attempted", consumed: false },
    { outcome: "rolled_back", consumed: false },
    { outcome: "committed_unusable", consumed: true },
    { outcome: "unknown", consumed: null }
  ] as const)(
    "preserves the strict $outcome durable failure outcome",
    async ({ outcome, consumed }) => {
      const consumeOrRead = vi.fn(async () => {
        throw Object.assign(new Error("safe test failure"), {
          reservationOutcome: outcome
        });
      });
      const result = await build(
        intentFixture(),
        contextFixture(),
        policyOptions(),
        { userId: "user:test:1", bootstrapTtlSeconds: 30 },
        evaluatedWriteTarget(),
        reservationDependency(consumeOrRead)
      );

      expect(result.status).toBe("blocked");
      expect(result.scopeBoundary).toMatchObject({
        reservationOutcome: outcome,
        contextQuoteReservationConsumedAtomically: consumed
      });
      expect(result.reservationRequest).not.toBeNull();
    }
  );

  it("does not invoke a thrown error outcome accessor", async () => {
    let getterCalls = 0;
    const unsafeError = Object.defineProperty(new Error("unsafe outcome"), "reservationOutcome", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "rolled_back";
      }
    });
    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(async () => {
        throw unsafeError;
      })
    );

    expect(result.status).toBe("blocked");
    expect(result.scopeBoundary.reservationOutcome).toBe("unknown");
    expect(getterCalls).toBe(0);
  });

  it("reconciles a lost commit acknowledgement with the exact request under an advancing clock", async () => {
    let committedReceipt: AltanaLpReservationReceipt | undefined;
    const firstConsume = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) => {
      committedReceipt = receiptFor(request);
      throw new Error("test-only lost commit acknowledgement");
    });
    const first = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(firstConsume)
    );
    expect(first.status).toBe("blocked");
    expect(first.issues[0]?.code).toBe("RESERVATION_FAILED");
    expect(first.reservationRequest).not.toBeNull();
    if (first.reservationRequest === null || committedReceipt === undefined) {
      throw new Error("Expected the unknown attempt to retain its exact reconciliation request.");
    }

    const reconcileConsume = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) => {
      expect(request).toEqual(first.reservationRequest);
      return committedReceipt;
    });
    const reconciled = await build(
      intentFixture(),
      contextFixture(),
      policyOptions({ now: () => new Date("2026-08-11T12:00:05.000Z") }),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(reconcileConsume),
      first.reservationRequest
    );

    expect(reconcileConsume).toHaveBeenCalledTimes(1);
    expect(reconciled.status).toBe("ready");
    if (reconciled.status !== "ready") {
      throw new Error("Expected the exact live retry to reconcile.");
    }
    expect(reconciled.reservationRequest).toEqual(first.reservationRequest);
    expect(reconciled.reservationReceipt).toEqual(committedReceipt);
    expect(reconciled.policyBuild.sourceBinding.resolvedAt).toBe(NOW.toISOString());
  });

  it("blocks direct reconciliation when the post-reservation clock rewinds", async () => {
    const initial = await build();
    if (initial.status !== "ready") throw new Error("Expected a ready handoff fixture.");
    const now = vi
      .fn<() => Date>()
      .mockImplementationOnce(() => new Date(Date.parse(NOW.toISOString()) + 29_000))
      .mockImplementationOnce(() => new Date(Date.parse(NOW.toISOString()) + 1_000));
    const consumeOrRead = vi.fn(async () => initial.reservationReceipt);

    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions({ now }),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(consumeOrRead),
      initial.reservationRequest
    );

    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe("RESERVATION_CLOCK_INVALID");
    expect(result.scopeBoundary.reservationOutcome).toBe("committed_unusable");
    expect(consumeOrRead).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed or changed reconciliation requests before durable access", async () => {
    const initial = await build();
    if (initial.status !== "ready") throw new Error("Expected a ready handoff fixture.");
    let getterCalls = 0;
    const accessor = Object.defineProperty({ ...initial.reservationRequest }, "policyHash", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return initial.reservationRequest.policyHash;
      }
    });
    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
      receiptFor(request)
    );
    const dependency = reservationDependency(consumeOrRead);
    const invalid = await build(
      intentFixture(),
      contextFixture(),
      policyOptions({ now: () => new Date("2026-08-11T12:00:05.000Z") }),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      dependency,
      accessor
    );
    const changed = await build(
      intentFixture(),
      contextFixture(),
      policyOptions({ now: () => new Date("2026-08-11T12:00:05.000Z") }),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      dependency,
      { ...initial.reservationRequest, policyHash: RESERVATION_ID }
    );

    expect(invalid.issues[0]?.code).toBe("RECONCILIATION_REQUEST_INVALID");
    expect(changed.issues[0]?.code).toBe("RECONCILIATION_REQUEST_MISMATCH");
    expect(getterCalls).toBe(0);
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it("rejects nested reconciliation accessors without invoking them", async () => {
    const initial = await build();
    if (initial.status !== "ready") throw new Error("Expected a ready handoff fixture.");
    let getterCalls = 0;
    const nestedBinding = Object.defineProperty(
      { ...initial.reservationRequest.writeTargetBinding },
      "runtimeCodeHash",
      {
        enumerable: true,
        get() {
          getterCalls += 1;
          return initial.reservationRequest.writeTargetBinding.runtimeCodeHash;
        }
      }
    );
    const prior = { ...initial.reservationRequest, writeTargetBinding: nestedBinding };
    const consumeOrRead = vi.fn();

    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions({ now: () => new Date("2026-08-11T12:00:05.000Z") }),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(consumeOrRead),
      prior
    );

    expect(result.issues[0]?.code).toBe("RECONCILIATION_REQUEST_INVALID");
    expect(getterCalls).toBe(0);
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "future",
      now: "2026-08-11T12:00:05.000Z",
      mutate: (request: AltanaLpReservationRequest) => ({
        ...request,
        consumedAt: "2026-08-11T12:00:06.000Z"
      }),
      code: "RECONCILIATION_REQUEST_FUTURE"
    },
    {
      label: "expired",
      now: "2026-08-11T12:00:30.000Z",
      mutate: (request: AltanaLpReservationRequest) => request,
      code: "RECONCILIATION_REQUEST_EXPIRED"
    }
  ])("rejects a $label prior reservation before durable access", async ({ now, mutate, code }) => {
    const initial = await build();
    if (initial.status !== "ready") throw new Error("Expected a ready handoff fixture.");
    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
      receiptFor(request)
    );

    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions({ now: () => new Date(now) }),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(consumeOrRead),
      mutate(initial.reservationRequest)
    );

    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe(code);
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it.each([
    { label: "missing receipt", receipt: null },
    { label: "array receipt", receipt: [] },
    { label: "unexpected field", receipt: { unexpected: true } },
    {
      label: "non-JSON bigint",
      receipt: {
        schemaVersion: 1,
        reservationId: RESERVATION_ID,
        contextId: CONTEXT_ID,
        quoteId: QUOTE_ID,
        userId: "user:test:1",
        policyHash: RESERVATION_ID,
        consumedAt: NOW.toISOString(),
        expiresAt: "2026-08-11T12:00:30.000Z",
        state: "consumed",
        unsafe: 1n
      }
    }
  ])("rejects a $label as a malformed durable receipt", async ({ receipt }) => {
    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(async () => receipt)
    );

    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe("RESERVATION_RECEIPT_INVALID");
    expect(result.reservationReceipt).toBeNull();
  });

  it("rejects receipt accessors without invoking them", async () => {
    let getterCalls = 0;
    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(async (request) => ({
        ...request,
        state: "consumed",
        get userId() {
          getterCalls += 1;
          return request.userId;
        }
      }))
    );

    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe("RESERVATION_RECEIPT_INVALID");
    expect(getterCalls).toBe(0);
  });

  it("rejects nested receipt accessors and custom prototypes without invoking them", async () => {
    let getterCalls = 0;
    const accessorResult = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(async (request) => ({
        ...request,
        state: "consumed",
        writeTargetBinding: Object.defineProperty(
          { ...request.writeTargetBinding },
          "runtimeCodeHash",
          {
            enumerable: true,
            get() {
              getterCalls += 1;
              return request.writeTargetBinding.runtimeCodeHash;
            }
          }
        )
      }))
    );
    const prototypeResult = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(async (request) => {
        const binding = { ...request.writeTargetBinding };
        Object.setPrototypeOf(binding, { unsafe: true });
        return { ...request, state: "consumed", writeTargetBinding: binding };
      })
    );

    expect(accessorResult.issues[0]?.code).toBe("RESERVATION_RECEIPT_INVALID");
    expect(prototypeResult.issues[0]?.code).toBe("RESERVATION_RECEIPT_INVALID");
    expect(getterCalls).toBe(0);
  });

  it.each([
    { field: "reservationId", value: RESERVATION_ID },
    { field: "contextId", value: RESERVATION_ID },
    { field: "quoteId", value: RESERVATION_ID },
    { field: "userId", value: "user:test:other" },
    { field: "policyHash", value: RESERVATION_ID },
    {
      field: "writeTargetBinding",
      value: {
        chainId: 97,
        address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        runtimeCodeHash: MANAGER_CODE_HASH,
        canonicalBlockNumber: "42000000",
        canonicalBlockHash: BLOCK_HASH,
        reviewId: RESERVATION_ID,
        proxyKind: "none"
      }
    },
    { field: "expiresAt", value: "2026-08-11T12:00:31.000Z" }
  ] as const)("rejects a mismatched $field receipt binding", async ({ field, value }) => {
    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(async (request) => receiptFor(request, { [field]: value }))
    );

    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe("RESERVATION_RECEIPT_MISMATCH");
  });

  it("derives distinct reservations for distinct approved target reviews", async () => {
    const baseManifest = writeTargetManifest();
    const alternateManifest: WriteTargetAttestationManifest = {
      ...baseManifest,
      target: {
        ...baseManifest.target,
        sourceReview: {
          ...baseManifest.target.sourceReview,
          independentReview: {
            ...baseManifest.target.sourceReview.independentReview,
            reviewerIdentity: "ProofEra Security Review 2026-08 alternate"
          }
        }
      }
    };
    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
      receiptFor(request)
    );
    const dependency = reservationDependency(consumeOrRead);

    const first = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(baseManifest),
      dependency
    );
    const second = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(alternateManifest),
      dependency,
      null,
      attest(alternateManifest).reviewId
    );

    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(consumeOrRead).toHaveBeenCalledTimes(2);
    if (first.status !== "ready" || second.status !== "ready") {
      throw new Error("Expected both approved target reviews to be ready.");
    }
    expect(first.writeTargetBinding.reviewId).not.toBe(second.writeTargetBinding.reviewId);
    expect(first.reservationReceipt.reservationId).not.toBe(
      second.reservationReceipt.reservationId
    );
  });

  it.each([
    {
      label: "stale",
      overrides: { consumedAt: "2026-08-11T11:59:59.000Z" },
      code: "RESERVATION_RECEIPT_STALE"
    },
    {
      label: "future",
      overrides: { consumedAt: "2026-08-11T12:00:01.000Z" },
      code: "RESERVATION_RECEIPT_FUTURE"
    },
    {
      label: "expired",
      overrides: { expiresAt: "2026-08-11T12:00:00.000Z" },
      code: "RESERVATION_RECEIPT_EXPIRED"
    }
  ] as const)("rejects a $label reservation receipt", async ({ overrides, code }) => {
    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(async (request) => receiptFor(request, overrides))
    );

    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe(code);
  });

  it("withholds an exact receipt that expires while durable access is in flight", async () => {
    let clockReads = 0;
    const result = await build(
      intentFixture(),
      contextFixture(),
      policyOptions({
        now: () => {
          clockReads += 1;
          return clockReads === 1 ? new Date(NOW) : new Date("2026-08-11T12:00:30.000Z");
        }
      }),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      reservationDependency(async (request) => receiptFor(request))
    );

    expect(clockReads).toBe(2);
    expect(result.status).toBe("blocked");
    expect(result.issues[0]?.code).toBe("RESERVATION_RECEIPT_EXPIRED");
    expect(result.scopeBoundary).toMatchObject({
      reservationOutcome: "committed_unusable",
      contextQuoteReservationConsumedAtomically: true,
      bootstrapPersisted: false
    });
    expect(result.reservationRequest).not.toBeNull();
    expect(result.bootstrapRequest).toBeNull();
  });

  it("accepts an identical immutable receipt on an idempotent second call", async () => {
    let storedReceipt: AltanaLpReservationReceipt | undefined;
    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) => {
      storedReceipt ??= receiptFor(request);
      return storedReceipt;
    });
    const dependency = reservationDependency(consumeOrRead);

    const first = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      dependency
    );
    const second = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      dependency
    );

    expect(consumeOrRead).toHaveBeenCalledTimes(2);
    expect(Object.isFrozen(consumeOrRead.mock.calls[0]?.[0])).toBe(true);
    expect(consumeOrRead.mock.calls[1]?.[0]).toEqual(consumeOrRead.mock.calls[0]?.[0]);
    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    if (first.status !== "ready" || second.status !== "ready") {
      throw new Error("Expected both idempotent handoffs to be ready.");
    }
    expect(second.reservationReceipt).toEqual(first.reservationReceipt);
  });

  it("does not call the durable dependency before earlier validation gates pass", async () => {
    const consumeOrRead = vi.fn(async (request: Readonly<AltanaLpReservationRequest>) =>
      receiptFor(request)
    );
    const dependency = reservationDependency(consumeOrRead);
    const invalidOptions = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "<script>", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      dependency
    );
    const blockedPolicy = await build(
      { ...intentFixture(), chainId: 56 },
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 30 },
      evaluatedWriteTarget(),
      dependency
    );
    const invalidWindow = await build(
      intentFixture(),
      contextFixture(),
      policyOptions(),
      { userId: "user:test:1", bootstrapTtlSeconds: 40 },
      evaluatedWriteTarget(),
      dependency
    );

    expect(invalidOptions.issues[0]?.code).toBe("BOOTSTRAP_OPTIONS_INVALID");
    expect(blockedPolicy.issues[0]?.code).toBe("POLICY_BUILD_BLOCKED");
    expect(invalidWindow.issues[0]?.code).toBe("BOOTSTRAP_WINDOW_INVALID");
    expect(invalidWindow.scopeBoundary).toMatchObject({
      contextQuoteReservationConsumedAtomically: false,
      reservationOutcome: "not_attempted",
      bootstrapPersisted: false
    });
    expect(consumeOrRead).not.toHaveBeenCalled();
  });

  it("rejects hostile policy options rather than widening calls or spend", async () => {
    const result = await build(intentFixture(), contextFixture(), {
      ...policyOptions(),
      operations: ["multicall"]
    } as BuildLpActivationPolicyOptions);

    expect(result.status).toBe("blocked");
    expect(result.bootstrapRequest).toBeNull();
    expect(result.issues[0]?.code).toBe("POLICY_BUILD_BLOCKED");
  });
});
