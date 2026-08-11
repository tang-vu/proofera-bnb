import {
  LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION,
  PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
  PANCAKE_V3_BSC_TESTNET_FACTORY,
  PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
  lpActivationServerContextSchema,
  resolveLpActivationIntent,
  type LpActivationIntent
} from "@proofera/domain/lp-activation-intent";
import { keccak256, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import type { EvmCodeIdentityResult, EvmRuntimeCodeIdentity } from "./evm-code-identity";
import {
  PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER,
  PANCAKE_V3_BSC_TESTNET_WRAPPED_NATIVE,
  assembleTrustedLpContext,
  deriveReviewedLpDeploymentReviewId,
  type AssembleTrustedLpContextOptions,
  type LpContextAssemblyIssueCode,
  type LpContextAssemblyResult,
  type ReviewedLpDeployment,
  type ReviewedLpDeploymentManifest
} from "./lp-context-assembly";
import type { PancakeV3LatestSnapshotResult } from "./pancake-v3-latest";
import type { PancakeV3PositionAuthorityResult } from "./pancake-v3-authority";
import type { PancakeV3StaticContextResult } from "./pancake-v3-static-context";

const BLOCK_NUMBER = "124453452";
const BLOCK_TIMESTAMP = 1_786_449_600;
const BLOCK_HASH = `0x${"ab".repeat(32)}` as Hex;
const OTHER_HASH = `0x${"cd".repeat(32)}` as Hex;
const PARENT_HASH = `0x${"ef".repeat(32)}` as Hex;
const BLOCK_UTC = new Date(BLOCK_TIMESTAMP * 1_000).toISOString();
const OBSERVED_AT = new Date((BLOCK_TIMESTAMP + 10) * 1_000).toISOString();
const NOW = new Date((BLOCK_TIMESTAMP + 30) * 1_000);
const TOKEN0 = "0x1000000000000000000000000000000000000001" as Address;
const TOKEN1 = "0x2000000000000000000000000000000000000002" as Address;
const POOL = "0x9000000000000000000000000000000000000009" as Address;
const WALLET = "0x8000000000000000000000000000000000000008" as Address;
const OTHER = "0x7000000000000000000000000000000000000007" as Address;
const MULTICALL = "0x3000000000000000000000000000000000000003" as Address;
const Q96 = "79228162514264337593543950336";
const POSITION_ID = "36761";
const CONTEXT_NONCE = `0x${"41".repeat(32)}` as Hex;
const QUOTE_NONCE = `0x${"42".repeat(32)}` as Hex;

const HASHES = Object.freeze({
  manager: `0x${"11".repeat(32)}` as Hex,
  factory: `0x${"12".repeat(32)}` as Hex,
  deployer: `0x${"13".repeat(32)}` as Hex,
  wrapped: `0x${"14".repeat(32)}` as Hex,
  pool: `0x${"15".repeat(32)}` as Hex,
  token0: `0x${"16".repeat(32)}` as Hex,
  token1: `0x${"17".repeat(32)}` as Hex
});

function replaceAt<T>(value: T, path: readonly (string | number)[], replacement: unknown): T {
  const clone = structuredClone(value) as unknown;
  let current = clone as Record<string | number, unknown>;
  for (const segment of path.slice(0, -1)) {
    current = current[segment] as Record<string | number, unknown>;
  }
  const last = path.at(-1);
  if (last !== undefined) current[last] = replacement;
  return clone as T;
}

function reviewedDeploymentManifest(): ReviewedLpDeploymentManifest {
  return {
    schemaVersion: 1,
    chainId: 97,
    protocol: "PancakeSwap V3",
    reviewedAt: new Date((BLOCK_TIMESTAMP - 86_400) * 1_000).toISOString(),
    sourceUrl: PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
    fee: 500,
    tickSpacing: 10,
    token0: { address: TOKEN0, decimals: 18, codeHash: HASHES.token0 },
    token1: { address: TOKEN1, decimals: 6, codeHash: HASHES.token1 },
    positionManager: {
      address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      codeHash: HASHES.manager
    },
    factory: { address: PANCAKE_V3_BSC_TESTNET_FACTORY, codeHash: HASHES.factory },
    poolDeployer: {
      address: PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER,
      codeHash: HASHES.deployer
    },
    wrappedNative: {
      address: PANCAKE_V3_BSC_TESTNET_WRAPPED_NATIVE,
      codeHash: HASHES.wrapped
    },
    pool: { address: POOL, codeHash: HASHES.pool }
  };
}

function reviewedDeployment(): ReviewedLpDeployment {
  const manifest = reviewedDeploymentManifest();
  return { ...manifest, reviewId: deriveReviewedLpDeploymentReviewId(manifest) };
}

function refreshReviewId(deployment: ReviewedLpDeployment): ReviewedLpDeployment {
  const manifest: ReviewedLpDeploymentManifest = {
    schemaVersion: deployment.schemaVersion,
    chainId: deployment.chainId,
    protocol: deployment.protocol,
    reviewedAt: deployment.reviewedAt,
    sourceUrl: deployment.sourceUrl,
    fee: deployment.fee,
    tickSpacing: deployment.tickSpacing,
    token0: deployment.token0,
    token1: deployment.token1,
    positionManager: deployment.positionManager,
    factory: deployment.factory,
    poolDeployer: deployment.poolDeployer,
    wrappedNative: deployment.wrappedNative,
    pool: deployment.pool
  };
  return { ...manifest, reviewId: deriveReviewedLpDeploymentReviewId(manifest) };
}

function intent(overrides: Partial<LpActivationIntent> = {}): LpActivationIntent {
  return {
    schemaVersion: 1,
    chainId: 97,
    wallet: WALLET,
    recipient: WALLET,
    poolAddress: POOL,
    positionTokenId: POSITION_ID,
    desiredTick: { lower: -120, upper: 120 },
    capital: { token0Raw: "1000000000000000000", token1Raw: "2000000000000000000" },
    maxSlippageBps: 50,
    sessionDurationSeconds: 3_600,
    txDeadlineSeconds: 30,
    maxExecutionsPerDay: 4,
    ...overrides
  };
}

function latestSnapshot(): PancakeV3LatestSnapshotResult {
  return {
    status: "available",
    snapshot: {
      position: {
        id: POSITION_ID,
        nonce: "0",
        operator: "0x0000000000000000000000000000000000000000",
        token0: TOKEN0,
        token1: TOKEN1,
        fee: 500,
        tickLower: -120,
        tickUpper: 120,
        liquidity: "1000",
        feeGrowthInside0LastX128: "0",
        feeGrowthInside1LastX128: "0",
        tokensOwed0: "0",
        tokensOwed1: "0",
        inRange: true
      },
      pool: {
        token0: TOKEN0,
        token1: TOKEN1,
        fee: 500,
        tickSpacing: 10,
        sqrtPriceX96: Q96,
        tick: 0,
        observationIndex: 1,
        observationCardinality: 2,
        observationCardinalityNext: 2,
        feeProtocol: 0,
        unlocked: true
      }
    },
    provenance: {
      chainId: 97,
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      blockTimestamp: BLOCK_UTC,
      blockTimestampUnix: BLOCK_TIMESTAMP.toString(),
      observedAt: OBSERVED_AT,
      ageSeconds: 10,
      readsPinnedToBlock: true,
      positionManagerAddress: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      factoryAddress: PANCAKE_V3_BSC_TESTNET_FACTORY,
      poolAddress: POOL,
      consistency: "atomic_latest_multicall3",
      stageTwoAtomicCallCount: 12,
      multicall3Address: MULTICALL,
      parentBlockHash: PARENT_HASH,
      historicalContractStateRequests: false,
      discoveryUsedAsEvidence: false,
      contractPresenceEvidence: "successful_stage_two_calls",
      codeHashIdentity: "not_established",
      currentBlockHashAvailableInsideSnapshot: false,
      blockHashSource: "post_snapshot_exact_block_header",
      reorgSignalsChecked: "block_number_timestamp_parent_hash"
    }
  };
}

function staticContext(): PancakeV3StaticContextResult {
  return {
    status: "available",
    chainId: 97,
    environment: "bsc-testnet",
    block: {
      number: BLOCK_NUMBER,
      hash: BLOCK_HASH,
      timestampUnix: BLOCK_TIMESTAMP.toString(),
      timestampUtc: BLOCK_UTC,
      ageMilliseconds: "10000"
    },
    evidence: {
      positionManagerAddress: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      factoryAddress: PANCAKE_V3_BSC_TESTNET_FACTORY,
      poolDeployerAddress: PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER,
      wrappedNativeAddress: PANCAKE_V3_BSC_TESTNET_WRAPPED_NATIVE,
      token0: { address: TOKEN0, decimals: 18 },
      token1: { address: TOKEN1, decimals: 6 },
      observedAt: OBSERVED_AT,
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      source: "onchain_manager_immutables_and_token_decimals"
    },
    provenance: {
      deploymentCommit: "986847948755cba528324d41be19480731c36c2a",
      deploymentSourceUrl: PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
      rpcProvider: { id: "public-test", publicSourceUrl: "https://rpc.example.test/source" },
      freshnessPolicy: {
        maximumBlockAgeSeconds: 120,
        maximumFutureSkewSeconds: 5,
        ownership: "trusted_reader_configuration"
      },
      chainRead: { method: "eth_chainId", params: [] },
      blockRead: { method: "eth_getBlockByHash", params: [BLOCK_HASH, false] },
      staticReadPlan: [] as unknown as PancakeV3StaticContextResult extends {
        provenance: infer Provenance;
      }
        ? Provenance extends { staticReadPlan: infer Plan }
          ? Plan
          : never
        : never,
      blockSelector: { blockHash: BLOCK_HASH, requireCanonical: true },
      latestTagUsed: false,
      blockNumberSelectorUsed: false,
      fallbackUsed: false,
      readsAtomic: false
    },
    boundary: {
      establishesManagerImmutableRelationsAtBoundBlock: true,
      establishesTokenDecimalsAtBoundBlock: true,
      establishesRuntimeCodeIdentity: false,
      establishesTokenSymbolOrEconomicMeaning: false,
      establishesFutureState: false,
      permitsExecution: false,
      limitations: ["one", "two", "three", "four"]
    }
  } as PancakeV3StaticContextResult;
}

function codeContract(label: string, address: Address, hash: Hex): EvmRuntimeCodeIdentity {
  return {
    label,
    address,
    byteLength: "4",
    runtimeCodeHash: hash,
    expectedRuntimeCodeHash: hash,
    expectation: "matched",
    provenance: {
      method: "eth_getCode",
      address,
      blockSelector: { blockHash: BLOCK_HASH, requireCanonical: true }
    }
  };
}

function codeIdentity(): EvmCodeIdentityResult {
  return {
    status: "available",
    observedAt: OBSERVED_AT,
    chainId: 97,
    environment: "bsc-testnet",
    block: {
      number: BLOCK_NUMBER,
      hash: BLOCK_HASH,
      timestampUnix: BLOCK_TIMESTAMP.toString(),
      timestampUtc: BLOCK_UTC,
      ageMilliseconds: "10000"
    },
    contracts: [
      codeContract("Manager", PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER, HASHES.manager),
      codeContract("Factory", PANCAKE_V3_BSC_TESTNET_FACTORY, HASHES.factory),
      codeContract("Deployer", PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER, HASHES.deployer),
      codeContract("Wrapped native", PANCAKE_V3_BSC_TESTNET_WRAPPED_NATIVE, HASHES.wrapped),
      codeContract("Pool", POOL, HASHES.pool),
      codeContract("Token 0", TOKEN0, HASHES.token0),
      codeContract("Token 1", TOKEN1, HASHES.token1)
    ],
    provenance: {
      chainRead: { method: "eth_chainId", params: [] },
      blockRead: { method: "eth_getBlockByHash", params: [BLOCK_HASH, false] },
      codeRead: {
        method: "eth_getCode",
        blockSelector: { blockHash: BLOCK_HASH, requireCanonical: true }
      },
      fallbackUsed: false,
      latestTagUsed: false,
      blockNumberSelectorUsed: false,
      codeReadsAtomic: false
    },
    boundary: {
      identityKind: "keccak256_evm_runtime_bytecode_at_block",
      sourceCodeVerified: false,
      proxyImplementationIdentified: false,
      safetyEstablished: false,
      rawRuntimeCodeReturned: false,
      limitations: ["one", "two", "three", "four"]
    }
  };
}

function authority(): PancakeV3PositionAuthorityResult {
  return {
    status: "available",
    chainId: 97,
    environment: "bsc-testnet",
    block: {
      number: BLOCK_NUMBER,
      hash: BLOCK_HASH,
      timestampUnix: BLOCK_TIMESTAMP.toString(),
      timestampUtc: BLOCK_UTC,
      ageMilliseconds: "10000"
    },
    authorization: {
      positionTokenId: POSITION_ID,
      positionManagerAddress: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
      ownerAddress: WALLET,
      controllerAddress: WALLET,
      tokenApprovalAddress: "0x0000000000000000000000000000000000000000",
      operatorApproved: false,
      controllerAuthorized: true,
      authorizationKind: "owner",
      observedAt: OBSERVED_AT,
      source: "onchain_owner_and_controller_read",
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH
    },
    provenance: {
      deploymentSourceUrl: PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE,
      deploymentCommit: "986847948755cba528324d41be19480731c36c2a",
      rpcProvider: { id: "public-test", publicSourceUrl: "https://rpc.example.test/source" },
      freshnessPolicy: {
        maximumBlockAgeSeconds: 120,
        maximumFutureSkewSeconds: 5,
        ownership: "trusted_reader_configuration"
      },
      chainRead: { method: "eth_chainId", params: [] },
      blockRead: { method: "eth_getBlockByHash", params: [BLOCK_HASH, false] },
      authorityReadPlan: [] as unknown as never,
      latestTagUsed: false,
      blockNumberSelectorUsed: false,
      fallbackUsed: false,
      readsAtomic: false
    },
    boundary: {
      establishesCurrentErc721AuthorityAtBoundBlock: true,
      establishesRuntimeCodeIdentity: false,
      establishesFutureAuthority: false,
      permitsExecution: false,
      limitations: ["one", "two", "three"]
    }
  } as PancakeV3PositionAuthorityResult;
}

function options(
  overrides: Partial<AssembleTrustedLpContextOptions> = {}
): AssembleTrustedLpContextOptions {
  return {
    reviewedDeployment: reviewedDeployment(),
    latestSnapshot: latestSnapshot(),
    staticContext: staticContext(),
    codeIdentity: codeIdentity(),
    authority: authority(),
    now: () => new Date(NOW),
    contextNonce: CONTEXT_NONCE,
    quoteNonce: QUOTE_NONCE,
    contextTtlSeconds: 120,
    quoteTtlSeconds: 60,
    consumedContextIds: [],
    consumedQuoteIds: [],
    ...overrides
  };
}

function expectIssue(
  result: LpContextAssemblyResult,
  code: LpContextAssemblyIssueCode,
  path?: string
): void {
  expect(result.status).toBe("blocked");
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code, ...(path === undefined ? {} : { path }) })
    ])
  );
}

describe("trusted LP context assembly", () => {
  it("assembles an exact v3 context with internally derived quote maxima, minimums, and IDs", () => {
    const result = assembleTrustedLpContext(intent(), options());

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(lpActivationServerContextSchema.safeParse(result.context).success).toBe(true);
    expect(result.context.schemaVersion).toBe(LP_ACTIVATION_SERVER_CONTEXT_SCHEMA_VERSION);
    expect(result.context.pool.sqrtPriceX96).toBe(Q96);
    expect(result.context.reviewedDeployment).toMatchObject({
      token0: { address: TOKEN0, decimals: 18, codeHash: HASHES.token0 },
      token1: { address: TOKEN1, decimals: 6, codeHash: HASHES.token1 },
      positionManager: {
        address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        codeHash: HASHES.manager
      },
      factory: { address: PANCAKE_V3_BSC_TESTNET_FACTORY, codeHash: HASHES.factory },
      pool: { address: POOL, codeHash: HASHES.pool },
      poolDeployer: {
        address: PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER,
        codeHash: HASHES.deployer
      },
      wrappedNative: {
        address: PANCAKE_V3_BSC_TESTNET_WRAPPED_NATIVE,
        codeHash: HASHES.wrapped
      }
    });
    expect(result.context.observedDeployment).toMatchObject({
      positionManager: {
        address: PANCAKE_V3_BSC_TESTNET_POSITION_MANAGER,
        codeHash: HASHES.manager
      },
      factory: { address: PANCAKE_V3_BSC_TESTNET_FACTORY, codeHash: HASHES.factory },
      pool: { address: POOL, codeHash: HASHES.pool },
      poolDeployer: {
        address: PANCAKE_V3_BSC_TESTNET_POOL_DEPLOYER,
        codeHash: HASHES.deployer
      },
      wrappedNative: {
        address: PANCAKE_V3_BSC_TESTNET_WRAPPED_NATIVE,
        codeHash: HASHES.wrapped
      },
      token0: { address: TOKEN0, codeHash: HASHES.token0 },
      token1: { address: TOKEN1, codeHash: HASHES.token1 }
    });
    expect(result.context.quote).toMatchObject({
      sourceKind: "pancake_v3_block_pinned_math",
      observedAt: OBSERVED_AT,
      validUntil: new Date((BLOCK_TIMESTAMP + 70) * 1_000).toISOString(),
      calculation: {
        currentTick: 0,
        exactLiquidityMatchRequired: true,
        methodologyVersion: "pancakeswap-v3-sdk-3.10.1-router-compatible-v2",
        preliminaryLiquidityRaw: "167175499835819766909",
        recomputedFromCalldataAtObservedPriceRaw: "167175499835819766909",
        sqrtPriceX96: Q96
      },
      token0: {
        desiredMaximumRaw: "1000000000000000000",
        capitalNotSubmittedRaw: "0",
        minimumAmountRaw: "583622018870502158"
      },
      token1: {
        desiredMaximumRaw: "1000000000000000000",
        capitalNotSubmittedRaw: "1000000000000000000",
        minimumAmountRaw: "581537516819099282"
      }
    });
    expect(result.context.contextId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.context.quoteId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.context.contextId).not.toBe(result.context.quoteId);
    expect(result.boundary).toMatchObject({
      authorityCreated: false,
      sessionCreated: false,
      calldataEncoded: false,
      signatureRequested: false,
      transactionSubmitted: false,
      executionPerformed: false
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.context.quote.token0)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(
      resolveLpActivationIntent(intent(), result.context, {
        now: () => new Date(NOW),
        expectedContextId: result.context.contextId,
        contextNonce: CONTEXT_NONCE,
        quoteNonce: QUOTE_NONCE,
        consumedContextIds: [],
        consumedQuoteIds: []
      }).status
    ).toBe("ready");
  });

  it("is canonically stable and rejects replayed derived IDs", () => {
    const first = assembleTrustedLpContext(intent(), options());
    const second = assembleTrustedLpContext(intent(), options());
    expect(first).toEqual(second);
    expect(first.status).toBe("ready");
    if (first.status !== "ready") return;

    expectIssue(
      assembleTrustedLpContext(
        intent(),
        options({
          consumedContextIds: [first.context.contextId],
          consumedQuoteIds: [first.context.quoteId]
        })
      ),
      "CONTEXT_REPLAYED"
    );
    expectIssue(
      assembleTrustedLpContext(intent(), options({ consumedQuoteIds: [first.context.quoteId] })),
      "QUOTE_REPLAYED"
    );
  });

  it("rejects post-assembly intent, tick, and minimum mutations with unchanged IDs", () => {
    const rawIntent = intent();
    const assembled = assembleTrustedLpContext(rawIntent, options());
    expect(assembled.status).toBe("ready");
    if (assembled.status !== "ready") return;

    const resolve = (candidateIntent: unknown, candidateContext: unknown) =>
      resolveLpActivationIntent(candidateIntent, candidateContext, {
        now: () => new Date(NOW),
        expectedContextId: assembled.context.contextId,
        contextNonce: CONTEXT_NONCE,
        quoteNonce: QUOTE_NONCE,
        consumedContextIds: [],
        consumedQuoteIds: []
      });

    expect(
      resolve({ ...rawIntent, desiredTick: { lower: -110, upper: 130 } }, assembled.context).issues
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "INTENT_BINDING_MISMATCH" })])
    );
    expect(
      resolve(rawIntent, {
        ...assembled.context,
        quote: {
          ...assembled.context.quote,
          token0: { ...assembled.context.quote.token0, minimumAmountRaw: "1" }
        }
      }).issues
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "CONTEXT_INTEGRITY_MISMATCH" })])
    );
    expect(
      resolve(rawIntent, {
        ...assembled.context,
        quote: {
          ...assembled.context.quote,
          calculation: { ...assembled.context.quote.calculation, tickUpper: 130 }
        }
      }).issues
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: "QUOTE_ID_MISMATCH" })]));
  });

  it("canonicalizes reviewed key order and binds all raw intent and code-identity inputs", () => {
    const baseline = assembleTrustedLpContext(intent(), options());
    const reversedReview = Object.fromEntries(Object.entries(reviewedDeployment()).reverse());
    reversedReview.reviewedAt = reviewedDeployment().reviewedAt.replace("Z", "+00:00");
    const reordered = assembleTrustedLpContext(
      intent(),
      options({ reviewedDeployment: reversedReview })
    );
    expect(reordered).toEqual(baseline);
    expect(baseline.status).toBe("ready");
    if (baseline.status !== "ready") return;

    const changedIntent = assembleTrustedLpContext(intent({ maxExecutionsPerDay: 5 }), options());
    expect(changedIntent.status).toBe("ready");
    if (changedIntent.status !== "ready") return;
    expect(changedIntent.context.contextId).not.toBe(baseline.context.contextId);
    expect(changedIntent.context.quoteId).not.toBe(baseline.context.quoteId);

    const changedReview = refreshReviewId(
      replaceAt(reviewedDeployment(), ["positionManager", "codeHash"], OTHER_HASH)
    );
    const changedCode = replaceAt(
      replaceAt(codeIdentity(), ["contracts", 0, "runtimeCodeHash"], OTHER_HASH),
      ["contracts", 0, "expectedRuntimeCodeHash"],
      OTHER_HASH
    );
    const changedIdentity = assembleTrustedLpContext(
      intent(),
      options({ reviewedDeployment: changedReview, codeIdentity: changedCode })
    );
    expect(changedIdentity.status).toBe("ready");
    if (changedIdentity.status !== "ready") return;
    expect(changedIdentity.context.contextId).not.toBe(baseline.context.contextId);
    expect(changedIdentity.context.quoteId).not.toBe(baseline.context.quoteId);
  });

  it("derives a canonical content address for the complete reviewed manifest", () => {
    const manifest = reviewedDeploymentManifest();
    const reversed = Object.fromEntries(
      Object.entries(manifest).reverse()
    ) as ReviewedLpDeploymentManifest;
    reversed.reviewedAt = manifest.reviewedAt.replace("Z", "+00:00");
    reversed.token0 = Object.fromEntries(
      Object.entries(manifest.token0).reverse()
    ) as ReviewedLpDeploymentManifest["token0"];

    const reviewId = deriveReviewedLpDeploymentReviewId(manifest);
    expect(reviewId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(deriveReviewedLpDeploymentReviewId(reversed)).toBe(reviewId);
    expect(
      deriveReviewedLpDeploymentReviewId({
        ...manifest,
        fee: 2_500
      })
    ).not.toBe(reviewId);
  });

  it.each([
    ["timestamp", ["reviewedAt"], new Date((BLOCK_TIMESTAMP - 86_399) * 1_000).toISOString()],
    ["fee", ["fee"], 2_500],
    ["tick spacing", ["tickSpacing"], 20],
    ["token decimals", ["token0", "decimals"], 17],
    ["token code hash", ["token1", "codeHash"], OTHER_HASH],
    ["manager code hash", ["positionManager", "codeHash"], OTHER_HASH]
  ] as const)("rejects a retained review ID after a %s change", (_label, path, value) => {
    const retainedIdMutation = replaceAt(reviewedDeployment(), path, value);
    expectIssue(
      assembleTrustedLpContext(intent(), options({ reviewedDeployment: retainedIdMutation })),
      "REVIEW_INVALID"
    );
  });

  it("rejects hostile unknown intent/options and never accepts a caller quote or caller IDs", () => {
    expectIssue(
      assembleTrustedLpContext({ ...intent(), quote: { forged: true } }, options()),
      "INTENT_INVALID"
    );
    expectIssue(
      assembleTrustedLpContext(intent(), {
        ...options(),
        callerQuote: { status: "quoted" },
        contextId: `0x${"99".repeat(32)}`
      } as unknown as AssembleTrustedLpContextOptions),
      "OPTIONS_INVALID"
    );
  });

  it("rejects option accessors, symbols, and hidden fields without invoking getters", () => {
    const accessorOptions = options() as unknown as Record<string, unknown>;
    let getterInvoked = false;
    Object.defineProperty(accessorOptions, "quoteNonce", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("must not execute");
      }
    });
    expectIssue(
      assembleTrustedLpContext(
        intent(),
        accessorOptions as unknown as AssembleTrustedLpContextOptions
      ),
      "OPTIONS_INVALID"
    );
    expect(getterInvoked).toBe(false);

    const symbolOptions = options() as AssembleTrustedLpContextOptions & {
      [key: symbol]: unknown;
    };
    symbolOptions[Symbol("hostile")] = "hidden";
    expectIssue(assembleTrustedLpContext(intent(), symbolOptions), "OPTIONS_INVALID");

    const hiddenOptions = options() as unknown as Record<string, unknown>;
    Object.defineProperty(hiddenOptions, "hidden", { value: "hostile", enumerable: false });
    expectIssue(
      assembleTrustedLpContext(
        intent(),
        hiddenOptions as unknown as AssembleTrustedLpContextOptions
      ),
      "OPTIONS_INVALID"
    );
  });

  it("snapshots every nested trust input without invoking accessors", () => {
    let getterInvocations = 0;
    const installTrap = (target: object, key: PropertyKey) => {
      Object.defineProperty(target, key, {
        enumerable: true,
        get() {
          getterInvocations += 1;
          throw new Error("must not execute");
        }
      });
    };

    const hostileIntent = intent();
    installTrap(hostileIntent.capital, "token0Raw");
    expectIssue(assembleTrustedLpContext(hostileIntent, options()), "INTENT_INVALID");

    const hostileReview = reviewedDeployment();
    installTrap(hostileReview.token0, "codeHash");
    expectIssue(
      assembleTrustedLpContext(intent(), options({ reviewedDeployment: hostileReview })),
      "REVIEW_INVALID"
    );

    const hostileLatest = latestSnapshot();
    if (hostileLatest.status !== "available") throw new Error("fixture must be available");
    installTrap(hostileLatest.provenance, "blockNumber");
    expectIssue(
      assembleTrustedLpContext(intent(), options({ latestSnapshot: hostileLatest })),
      "EVIDENCE_UNAVAILABLE"
    );

    const hostileStatic = staticContext();
    if (hostileStatic.status !== "available") throw new Error("fixture must be available");
    installTrap(hostileStatic.block, "number");
    expectIssue(
      assembleTrustedLpContext(intent(), options({ staticContext: hostileStatic })),
      "EVIDENCE_UNAVAILABLE"
    );

    const hostileCode = codeIdentity();
    if (hostileCode.status !== "available") throw new Error("fixture must be available");
    const firstCode = hostileCode.contracts[0];
    if (firstCode === undefined) throw new Error("fixture must contain code identity");
    installTrap(firstCode, "runtimeCodeHash");
    expectIssue(
      assembleTrustedLpContext(intent(), options({ codeIdentity: hostileCode })),
      "EVIDENCE_UNAVAILABLE"
    );

    const hostileAuthority = authority();
    if (hostileAuthority.status !== "available") throw new Error("fixture must be available");
    installTrap(hostileAuthority.authorization, "ownerAddress");
    expectIssue(
      assembleTrustedLpContext(intent(), options({ authority: hostileAuthority })),
      "EVIDENCE_UNAVAILABLE"
    );

    expect(getterInvocations).toBe(0);
  });

  it("rejects symbols, hidden properties, custom prototypes, cycles, and excess depth", () => {
    const symbolIntent = intent() as LpActivationIntent & { [key: symbol]: unknown };
    symbolIntent[Symbol("hostile")] = true;
    expectIssue(assembleTrustedLpContext(symbolIntent, options()), "INTENT_INVALID");

    const hiddenIntent = intent();
    Object.defineProperty(hiddenIntent.capital, "hidden", {
      enumerable: false,
      value: "hostile"
    });
    expectIssue(assembleTrustedLpContext(hiddenIntent, options()), "INTENT_INVALID");

    const customPrototypeIntent = Object.assign(Object.create({ inherited: true }), intent());
    expectIssue(assembleTrustedLpContext(customPrototypeIntent, options()), "INTENT_INVALID");

    const cyclicIntent = intent() as LpActivationIntent & { self?: unknown };
    cyclicIntent.self = cyclicIntent;
    expectIssue(assembleTrustedLpContext(cyclicIntent, options()), "INTENT_INVALID");

    const deepIntent = intent() as LpActivationIntent & { deep?: unknown };
    const deepRoot: Record<string, unknown> = {};
    let cursor = deepRoot;
    for (let index = 0; index < 40; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    deepIntent.deep = deepRoot;
    expectIssue(assembleTrustedLpContext(deepIntent, options()), "INTENT_INVALID");
  });

  it.each(["latestSnapshot", "staticContext", "codeIdentity", "authority"] as const)(
    "returns a typed block for malformed available %s evidence",
    (optionKey) => {
      const result = assembleTrustedLpContext(
        intent(),
        options({ [optionKey]: { status: "available" } as never })
      );
      expectIssue(result, "INTERNAL_VALIDATION_ERROR", "assembly");
    }
  );

  it("requires immutable reviewed provenance, canonical token order, and distinct infrastructure", () => {
    expectIssue(
      assembleTrustedLpContext(
        intent(),
        options({
          reviewedDeployment: {
            ...reviewedDeployment(),
            sourceUrl: `${PANCAKE_V3_BSC_TESTNET_DEPLOYMENT_SOURCE}?mutable=true`
          }
        })
      ),
      "REVIEW_INVALID"
    );
    expectIssue(
      assembleTrustedLpContext(
        intent(),
        options({
          reviewedDeployment: {
            ...reviewedDeployment(),
            token0: reviewedDeployment().token1,
            token1: reviewedDeployment().token0
          }
        })
      ),
      "REVIEW_INVALID"
    );
    expectIssue(
      assembleTrustedLpContext(
        intent(),
        options({
          reviewedDeployment: {
            ...reviewedDeployment(),
            pool: {
              address: PANCAKE_V3_BSC_TESTNET_WRAPPED_NATIVE,
              codeHash: HASHES.wrapped
            }
          }
        })
      ),
      "REVIEW_INVALID"
    );
    expectIssue(
      assembleTrustedLpContext(
        intent(),
        options({ reviewedDeployment: { ...reviewedDeployment(), quote: { forged: true } } })
      ),
      "REVIEW_INVALID"
    );
  });

  it.each([
    ["latest chain", "latestSnapshot", ["provenance", "chainId"], 56, "WRONG_CHAIN"],
    ["static chain", "staticContext", ["chainId"], 56, "WRONG_CHAIN"],
    ["code chain", "codeIdentity", ["chainId"], 56, "WRONG_CHAIN"],
    ["authority chain", "authority", ["chainId"], 56, "WRONG_CHAIN"],
    ["latest number", "latestSnapshot", ["provenance", "blockNumber"], "1", "BLOCK_MISMATCH"],
    [
      "latest Unix timestamp",
      "latestSnapshot",
      ["provenance", "blockTimestampUnix"],
      "1",
      "BLOCK_MISMATCH"
    ],
    ["static block", "staticContext", ["block", "hash"], OTHER_HASH, "BLOCK_MISMATCH"],
    ["code block", "codeIdentity", ["block", "number"], "1", "BLOCK_MISMATCH"],
    ["authority timestamp", "authority", ["block", "timestampUnix"], "1", "BLOCK_MISMATCH"],
    [
      "static UTC timestamp",
      "staticContext",
      ["block", "timestampUtc"],
      new Date((BLOCK_TIMESTAMP + 1) * 1_000).toISOString(),
      "BLOCK_MISMATCH"
    ],
    [
      "code UTC timestamp",
      "codeIdentity",
      ["block", "timestampUtc"],
      new Date((BLOCK_TIMESTAMP + 1) * 1_000).toISOString(),
      "BLOCK_MISMATCH"
    ],
    [
      "authority UTC timestamp",
      "authority",
      ["block", "timestampUtc"],
      new Date((BLOCK_TIMESTAMP + 1) * 1_000).toISOString(),
      "BLOCK_MISMATCH"
    ],
    [
      "static nested block",
      "staticContext",
      ["evidence", "blockHash"],
      OTHER_HASH,
      "BLOCK_MISMATCH"
    ],
    [
      "authority nested block",
      "authority",
      ["authorization", "blockNumber"],
      "1",
      "BLOCK_MISMATCH"
    ],
    [
      "code call block selector",
      "codeIdentity",
      ["contracts", 0, "provenance", "blockSelector", "blockHash"],
      OTHER_HASH,
      "BLOCK_MISMATCH"
    ]
  ] as const)("blocks cross-result mismatch: %s", (_label, optionKey, path, value, code) => {
    const base = options();
    const changed = replaceAt(base[optionKey], path, value);
    expectIssue(assembleTrustedLpContext(intent(), options({ [optionKey]: changed })), code);
  });

  it("blocks stale blocks, future blocks, and future observation times", () => {
    expectIssue(
      assembleTrustedLpContext(
        intent(),
        options({ now: () => new Date((BLOCK_TIMESTAMP + 121) * 1_000) })
      ),
      "BLOCK_STALE"
    );
    expectIssue(
      assembleTrustedLpContext(
        intent(),
        options({ now: () => new Date((BLOCK_TIMESTAMP - 1) * 1_000) })
      ),
      "BLOCK_FROM_FUTURE"
    );
    expectIssue(
      assembleTrustedLpContext(
        intent(),
        options({
          authority: replaceAt(
            authority(),
            ["authorization", "observedAt"],
            new Date((BLOCK_TIMESTAMP + 31) * 1_000).toISOString()
          )
        })
      ),
      "EVIDENCE_TIME_INVALID"
    );
    expectIssue(
      assembleTrustedLpContext(
        intent(),
        options({
          latestSnapshot: replaceAt(
            latestSnapshot(),
            ["provenance", "observedAt"],
            new Date((BLOCK_TIMESTAMP + 1) * 1_000).toISOString()
          ),
          now: () => new Date((BLOCK_TIMESTAMP + 61) * 1_000)
        })
      ),
      "QUOTE_WINDOW_INVALID"
    );
  });

  it.each([
    [
      "snapshot manager",
      "latestSnapshot",
      ["provenance", "positionManagerAddress"],
      OTHER,
      "OFFICIAL_DEPLOYMENT_MISMATCH"
    ],
    [
      "snapshot factory",
      "latestSnapshot",
      ["provenance", "factoryAddress"],
      OTHER,
      "OFFICIAL_DEPLOYMENT_MISMATCH"
    ],
    [
      "snapshot pool",
      "latestSnapshot",
      ["provenance", "poolAddress"],
      OTHER,
      "OFFICIAL_DEPLOYMENT_MISMATCH"
    ],
    [
      "snapshot token order",
      "latestSnapshot",
      ["snapshot", "pool", "token0"],
      OTHER,
      "TOKEN_MISMATCH"
    ],
    [
      "snapshot position token order",
      "latestSnapshot",
      ["snapshot", "position", "token1"],
      OTHER,
      "TOKEN_MISMATCH"
    ],
    [
      "static token decimals",
      "staticContext",
      ["evidence", "token1", "decimals"],
      18,
      "TOKEN_DECIMALS_MISMATCH"
    ],
    ["snapshot fee", "latestSnapshot", ["snapshot", "position", "fee"], 2500, "FEE_MISMATCH"],
    [
      "snapshot spacing",
      "latestSnapshot",
      ["snapshot", "pool", "tickSpacing"],
      60,
      "TICK_SPACING_MISMATCH"
    ],
    [
      "static deployer",
      "staticContext",
      ["evidence", "poolDeployerAddress"],
      OTHER,
      "RELATION_MISMATCH"
    ],
    [
      "static manager",
      "staticContext",
      ["evidence", "positionManagerAddress"],
      OTHER,
      "RELATION_MISMATCH"
    ],
    ["static factory", "staticContext", ["evidence", "factoryAddress"], OTHER, "RELATION_MISMATCH"],
    [
      "static wrapped native",
      "staticContext",
      ["evidence", "wrappedNativeAddress"],
      OTHER,
      "RELATION_MISMATCH"
    ],
    ["position ID", "latestSnapshot", ["snapshot", "position", "id"], "99", "POSITION_ID_MISMATCH"],
    [
      "authority wallet",
      "authority",
      ["authorization", "controllerAddress"],
      OTHER,
      "WALLET_MISMATCH"
    ],
    [
      "authority revoked",
      "authority",
      ["authorization", "controllerAuthorized"],
      false,
      "CONTROLLER_NOT_AUTHORIZED"
    ],
    [
      "authority manager",
      "authority",
      ["authorization", "positionManagerAddress"],
      OTHER,
      "POSITION_ID_MISMATCH"
    ],
    [
      "code hash",
      "codeIdentity",
      ["contracts", 0, "runtimeCodeHash"],
      OTHER_HASH,
      "CODE_IDENTITY_MISMATCH"
    ],
    [
      "code expected hash",
      "codeIdentity",
      ["contracts", 6, "expectedRuntimeCodeHash"],
      OTHER_HASH,
      "CODE_IDENTITY_MISMATCH"
    ],
    [
      "code review status",
      "codeIdentity",
      ["contracts", 3, "expectation"],
      "not_reviewed",
      "CODE_IDENTITY_MISMATCH"
    ]
  ] as const)("blocks trusted relation mismatch: %s", (_label, optionKey, path, value, code) => {
    const base = options();
    const changed = replaceAt(base[optionKey], path, value);
    expectIssue(assembleTrustedLpContext(intent(), options({ [optionKey]: changed })), code);
  });

  it("enforces product slippage, tick alignment, and TTL ceilings", () => {
    expectIssue(
      assembleTrustedLpContext(intent({ maxSlippageBps: 101 }), options()),
      "SLIPPAGE_INVALID"
    );
    expectIssue(
      assembleTrustedLpContext(intent({ desiredTick: { lower: -119, upper: 120 } }), options()),
      "TICK_ALIGNMENT_INVALID"
    );
    expectIssue(
      assembleTrustedLpContext(intent(), options({ quoteTtlSeconds: 61 })),
      "OPTIONS_INVALID"
    );
    expectIssue(
      assembleTrustedLpContext(intent(), options({ contextTtlSeconds: 30, quoteTtlSeconds: 60 })),
      "OPTIONS_INVALID"
    );
    expectIssue(
      assembleTrustedLpContext(intent({ txDeadlineSeconds: 41 }), options()),
      "QUOTE_WINDOW_INVALID"
    );
  });

  it.each([
    ["zero second-pass liquidity", "6000000000000", "100000000000000", "CALLDATA_ZERO_LIQUIDITY"],
    ["nonzero second-pass drift", "117000000000000", "100000000000000", "CALLDATA_LIQUIDITY_DRIFT"]
  ] as const)("blocks quote regression: %s", (_label, amount0, amount1, cause) => {
    const latest = replaceAt(
      replaceAt(latestSnapshot(), ["snapshot", "pool", "sqrtPriceX96"], "12728274922838404"),
      ["snapshot", "pool", "tick"],
      -589220
    );
    const result = assembleTrustedLpContext(
      intent({
        desiredTick: { lower: -648340, upper: -535290 },
        capital: { token0Raw: amount0, token1Raw: amount1 }
      }),
      options({ latestSnapshot: latest })
    );
    expectIssue(result, "QUOTE_CALCULATION_BLOCKED", "executionQuote");
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ cause })]));
  });

  it("does not return raw bytecode, provider credentials, nonces, or injected failures", () => {
    const taintedCode = codeIdentity() as EvmCodeIdentityResult & {
      contracts: Array<EvmRuntimeCodeIdentity & { rawRuntimeCode?: string }>;
      provenance: { credential?: string };
    };
    const firstCodeIdentity = taintedCode.contracts[0];
    if (firstCodeIdentity === undefined) throw new Error("fixture must contain code identity");
    firstCodeIdentity.rawRuntimeCode = "0x60006000";
    taintedCode.provenance.credential = "credential-sentinel";
    const taintedStatic = staticContext() as PancakeV3StaticContextResult & {
      provenance: { rpcProvider: { credential?: string } };
    };
    taintedStatic.provenance.rpcProvider.credential = "provider-secret-sentinel";
    const result = assembleTrustedLpContext(
      intent(),
      options({ codeIdentity: taintedCode, staticContext: taintedStatic })
    );
    expect(result.status).toBe("ready");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(CONTEXT_NONCE);
    expect(serialized).not.toContain(QUOTE_NONCE);
    expect(serialized).not.toContain("rpc.example.test");
    expect(serialized).not.toContain("0x60006000");
    expect(serialized).not.toContain("credential-sentinel");
    expect(serialized).not.toContain("provider-secret-sentinel");
    expect(keccak256("0x60006000")).not.toBe(HASHES.manager);
  });
});
