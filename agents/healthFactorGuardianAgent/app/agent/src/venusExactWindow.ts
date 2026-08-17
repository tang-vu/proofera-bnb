import { createHash } from "node:crypto";

import { z } from "zod";

import {
  VENUS_CORE_COMPTROLLER_BY_CHAIN,
  analyzeHealthFactor,
  healthFactorAnalysisInputSchema,
  type HealthFactorAnalysisInput
} from "./healthFactorAnalysis.js";

const UINT256_MAX = (1n << 256n) - 1n;
const E18 = 10n ** 18n;
const MAX_POSITIONS = 64;
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .refine((value) => !/^0x0{40}$/i.test(value));
const hashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .refine((value) => !/^0x0{64}$/i.test(value));
const sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .refine((value) => !/^0{64}$/.test(value));
const uint256Schema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine((value) => BigInt(value) <= UINT256_MAX);
const utcSchema = z.string().datetime({ offset: false });
const safeHttpsSchema = z.string().url().startsWith("https://");

const exactPositionSchema = z
  .object({
    vTokenAddress: addressSchema,
    vTokenSymbol: z.string().trim().min(1).max(64),
    underlyingSymbol: z
      .string()
      .trim()
      .min(1)
      .max(48)
      .regex(/^[A-Za-z0-9._-]+$/),
    vTokenBalanceRaw: uint256Schema,
    borrowBalanceRaw: uint256Schema,
    exchangeRateMantissaRaw: uint256Schema,
    oraclePriceMantissaRaw: uint256Schema,
    effectiveLiquidationThresholdMantissaRaw: uint256Schema.refine((value) => BigInt(value) <= E18),
    suppliedValueUsdE18Raw: uint256Schema,
    adjustedCollateralValueUsdE18Raw: uint256Schema,
    debtValueUsdE18Raw: uint256Schema
  })
  .strict();

const providerAttestationSchema = z
  .object({
    providerId: z.string().trim().min(1).max(80),
    publicSourceUrl: safeHttpsSchema,
    observedAtUtc: utcSchema
  })
  .strict();

export const venusCoreExactBlockEvidenceForWindowSchema = z
  .object({
    schemaVersion: z.literal("proofera-venus-core-exact-block-evidence-v1.0.0"),
    chainId: z.literal(97),
    account: addressSchema,
    comptrollerAddress: addressSchema,
    blockNumber: uint256Schema,
    blockHash: hashSchema,
    blockTimestampUtc: utcSchema,
    oracleAddress: addressSchema,
    marketsEnumerated: z.number().int().min(1).max(MAX_POSITIONS),
    assetsIn: z.array(addressSchema).max(MAX_POSITIONS),
    positions: z.array(exactPositionSchema).max(MAX_POSITIONS),
    adjustedCollateralValueUsdE18Raw: uint256Schema,
    debtValueUsdE18Raw: uint256Schema,
    healthFactorE18Raw: uint256Schema.nullable(),
    providerAttestations: z.array(providerAttestationSchema).min(2).max(8),
    limitations: z.array(z.string().trim().min(1).max(500)).min(1).max(20)
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      evidence.comptrollerAddress.toLowerCase() !==
      VENUS_CORE_COMPTROLLER_BY_CHAIN[97].toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        path: ["comptrollerAddress"],
        message: "Expected the official Venus Core Pool Comptroller on chain 97"
      });
    }
    const positionAddresses = new Set<string>();
    const assetAddresses = new Set(evidence.assetsIn.map((address) => address.toLowerCase()));
    if (assetAddresses.size !== evidence.assetsIn.length) {
      context.addIssue({
        code: "custom",
        path: ["assetsIn"],
        message: "Exact-block evidence contains a duplicate entered market"
      });
    }
    let adjusted = 0n;
    let debt = 0n;
    for (const [index, position] of evidence.positions.entries()) {
      const address = position.vTokenAddress.toLowerCase();
      if (positionAddresses.has(address)) {
        context.addIssue({
          code: "custom",
          path: ["positions", index, "vTokenAddress"],
          message: "Duplicate exact-block position"
        });
      }
      positionAddresses.add(address);
      if (
        (position.vTokenBalanceRaw === "0" && position.borrowBalanceRaw === "0") ||
        position.oraclePriceMantissaRaw === "0" ||
        !assetAddresses.has(address)
      ) {
        context.addIssue({
          code: "custom",
          path: ["positions", index],
          message: "An active exact-block position requires membership and a non-zero oracle price"
        });
      }
      try {
        const supplied = checkedMulE18(
          checkedMulE18(
            BigInt(position.exchangeRateMantissaRaw),
            BigInt(position.oraclePriceMantissaRaw)
          ),
          BigInt(position.vTokenBalanceRaw)
        );
        const adjustedPosition = checkedMulE18(
          checkedMulE18(
            checkedMulE18(
              BigInt(position.effectiveLiquidationThresholdMantissaRaw),
              BigInt(position.exchangeRateMantissaRaw)
            ),
            BigInt(position.oraclePriceMantissaRaw)
          ),
          BigInt(position.vTokenBalanceRaw)
        );
        const debtPosition = checkedMulE18(
          BigInt(position.oraclePriceMantissaRaw),
          BigInt(position.borrowBalanceRaw)
        );
        if (
          position.suppliedValueUsdE18Raw !== supplied.toString() ||
          position.adjustedCollateralValueUsdE18Raw !== adjustedPosition.toString() ||
          position.debtValueUsdE18Raw !== debtPosition.toString()
        ) {
          context.addIssue({
            code: "custom",
            path: ["positions", index],
            message: "Exact-block position derived values do not match raw Venus operands"
          });
        }
        adjusted += adjustedPosition;
        debt += debtPosition;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "VENUS_UINT256_OVERFLOW") throw error;
        context.addIssue({
          code: "custom",
          path: ["positions", index],
          message: "Exact-block position overflows uint256"
        });
      }
    }
    if (adjusted > UINT256_MAX || debt > UINT256_MAX) {
      context.addIssue({
        code: "custom",
        path: ["positions"],
        message: "Exact-block position aggregate exceeds uint256"
      });
    }
    if (
      evidence.adjustedCollateralValueUsdE18Raw !== adjusted.toString() ||
      evidence.debtValueUsdE18Raw !== debt.toString()
    ) {
      context.addIssue({
        code: "custom",
        path: ["positions"],
        message: "Exact-block aggregate does not match its positions"
      });
    }
    const healthFactor = debt === 0n ? null : ((adjusted * E18) / debt).toString();
    if (evidence.healthFactorE18Raw !== healthFactor) {
      context.addIssue({
        code: "custom",
        path: ["healthFactorE18Raw"],
        message: "Exact-block health factor does not match adjusted collateral and debt"
      });
    }
    const providerIds = new Set(evidence.providerAttestations.map(({ providerId }) => providerId));
    const providerOrigins = new Set(
      evidence.providerAttestations.map(({ publicSourceUrl }) => new URL(publicSourceUrl).origin)
    );
    if (
      providerIds.size !== evidence.providerAttestations.length ||
      providerOrigins.size !== evidence.providerAttestations.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["providerAttestations"],
        message: "Exact-block evidence requires distinct provider identities and origins"
      });
    }
  });

const accountBindingSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("explicit_testnet_authorization"),
      account: addressSchema,
      authorizedAtUtc: utcSchema,
      authorizationArtifactSha256: sha256Schema,
      reference: z.string().trim().min(1).max(500)
    })
    .strict(),
  z
    .object({
      state: z.literal("public_testnet_replay_non_authority"),
      account: addressSchema,
      selectedAtUtc: utcSchema,
      selectionArtifactSha256: sha256Schema,
      reference: z.string().trim().min(1).max(500),
      ownershipClaimed: z.literal(false),
      executionAuthorityClaimed: z.literal(false)
    })
    .strict()
]);

export interface BuildHealthFactorExactWindowOptions {
  readonly evidenceWindow: readonly unknown[];
  readonly analysisAtUtc: string;
  readonly policy: NonNullable<HealthFactorAnalysisInput["policy"]>;
  readonly accountAuthorization: unknown;
}

export interface HealthFactorExactWindowBuild {
  readonly schemaVersion: "proofera-health-factor-exact-window-build-v1.0.0";
  readonly input: HealthFactorAnalysisInput;
  readonly bindings: {
    readonly accountAuthorization: z.output<typeof accountBindingSchema>;
    readonly firstBlockNumber: string;
    readonly lastBlockNumber: string;
    readonly observationCount: number;
    readonly evidenceSha256: readonly string[];
    readonly providerIds: readonly string[];
  };
  readonly limitations: readonly string[];
}

function checkedMulE18(left: bigint, right: bigint): bigint {
  if (left !== 0n && right > UINT256_MAX / left) {
    throw new Error("VENUS_UINT256_OVERFLOW");
  }
  return (left * right) / E18;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function positionSource(
  evidence: z.output<typeof venusCoreExactBlockEvidenceForWindowSchema>,
  position: z.output<typeof exactPositionSchema>,
  kind: "collateral" | "debt"
) {
  return {
    kind: "onchain" as const,
    readMethod:
      kind === "collateral"
        ? ("venus_core_pool_collateral_operands_and_values_v2" as const)
        : ("venus_core_pool_debt_operands_and_value_v2" as const),
    chainId: 97 as const,
    comptrollerAddress: evidence.comptrollerAddress,
    account: evidence.account,
    blockNumber: evidence.blockNumber,
    blockHash: evidence.blockHash,
    blockTimestampUtc: evidence.blockTimestampUtc,
    quoteValueUnit: "usd" as const,
    quoteValueScaleDecimals: 18 as const,
    market: position.vTokenSymbol,
    underlyingAsset: position.underlyingSymbol,
    vTokenAddress: position.vTokenAddress
  };
}

function collateralPositions(
  evidence: z.output<typeof venusCoreExactBlockEvidenceForWindowSchema>
) {
  return evidence.positions
    .filter(({ vTokenBalanceRaw }) => vTokenBalanceRaw !== "0")
    .map((position) => ({
      market: position.vTokenSymbol,
      underlyingAsset: position.underlyingSymbol,
      vTokenAddress: position.vTokenAddress,
      vTokenBalanceRaw: position.vTokenBalanceRaw,
      exchangeRateMantissaRaw: position.exchangeRateMantissaRaw,
      oraclePriceMantissaRaw: position.oraclePriceMantissaRaw,
      fixedPointScaleDecimals: 18 as const,
      collateralValueRaw: position.suppliedValueUsdE18Raw,
      adjustedCollateralValueRaw: position.adjustedCollateralValueUsdE18Raw,
      quoteValueUnit: "usd" as const,
      quoteValueScaleDecimals: 18 as const,
      effectiveLiquidationThresholdRaw: position.effectiveLiquidationThresholdMantissaRaw,
      liquidationThresholdScaleDecimals: 18,
      chainId: 97 as const,
      account: evidence.account,
      blockNumber: evidence.blockNumber,
      blockHash: evidence.blockHash,
      observedAtUtc: evidence.blockTimestampUtc,
      source: positionSource(evidence, position, "collateral")
    }));
}

function debtPositions(evidence: z.output<typeof venusCoreExactBlockEvidenceForWindowSchema>) {
  return evidence.positions
    .filter(({ borrowBalanceRaw }) => borrowBalanceRaw !== "0")
    .map((position) => ({
      market: position.vTokenSymbol,
      underlyingAsset: position.underlyingSymbol,
      vTokenAddress: position.vTokenAddress,
      borrowBalanceRaw: position.borrowBalanceRaw,
      oraclePriceMantissaRaw: position.oraclePriceMantissaRaw,
      fixedPointScaleDecimals: 18 as const,
      debtValueRaw: position.debtValueUsdE18Raw,
      quoteValueUnit: "usd" as const,
      quoteValueScaleDecimals: 18 as const,
      chainId: 97 as const,
      account: evidence.account,
      blockNumber: evidence.blockNumber,
      blockHash: evidence.blockHash,
      observedAtUtc: evidence.blockTimestampUtc,
      source: positionSource(evidence, position, "debt")
    }));
}

function observationSource(
  evidence: z.output<typeof venusCoreExactBlockEvidenceForWindowSchema>,
  collateralVTokenAddresses: readonly string[],
  debtVTokenAddresses: readonly string[]
) {
  return {
    kind: "onchain" as const,
    readMethod: "venus_core_pool_account_health_observation_v1" as const,
    chainId: 97 as const,
    comptrollerAddress: evidence.comptrollerAddress,
    account: evidence.account,
    blockNumber: evidence.blockNumber,
    blockHash: evidence.blockHash,
    blockTimestampUtc: evidence.blockTimestampUtc,
    quoteValueUnit: "usd" as const,
    quoteValueScaleDecimals: 18 as const,
    collateralVTokenAddresses: [...collateralVTokenAddresses],
    debtVTokenAddresses: [...debtVTokenAddresses]
  };
}

/**
 * Converts an already captured, independently-provider-matched exact-block
 * window into the strict Health Guardian v1.3 input. It performs no network,
 * wallet, signature, transaction, or filesystem operation.
 */
export function buildHealthFactorInputFromExactWindow(
  options: BuildHealthFactorExactWindowOptions
): HealthFactorExactWindowBuild {
  const analysisAtUtc = utcSchema.parse(options.analysisAtUtc);
  const analysisTime = Date.parse(analysisAtUtc);
  const authorization = accountBindingSchema.parse(options.accountAuthorization);
  if (options.evidenceWindow.length === 0 || options.evidenceWindow.length > 128) {
    throw new Error("VENUS_WINDOW_SIZE_INVALID");
  }
  const window = options.evidenceWindow.map((evidence) =>
    venusCoreExactBlockEvidenceForWindowSchema.parse(evidence)
  );
  const first = window[0];
  const current = window.at(-1);
  if (first === undefined || current === undefined) throw new Error("VENUS_WINDOW_SIZE_INVALID");
  if (!sameAddress(authorization.account, current.account)) {
    throw new Error("VENUS_WINDOW_ACCOUNT_NOT_AUTHORIZED");
  }
  const expectedProviders = current.providerAttestations
    .map(({ providerId, publicSourceUrl }) => `${providerId}:${new URL(publicSourceUrl).origin}`)
    .sort();
  for (const [index, evidence] of window.entries()) {
    if (
      !sameAddress(evidence.account, current.account) ||
      !sameAddress(evidence.comptrollerAddress, current.comptrollerAddress) ||
      !sameAddress(evidence.oracleAddress, current.oracleAddress) ||
      evidence.marketsEnumerated !== current.marketsEnumerated
    ) {
      throw new Error("VENUS_WINDOW_CONTEXT_MISMATCH");
    }
    const providers = evidence.providerAttestations
      .map(({ providerId, publicSourceUrl }) => `${providerId}:${new URL(publicSourceUrl).origin}`)
      .sort();
    if (JSON.stringify(providers) !== JSON.stringify(expectedProviders)) {
      throw new Error("VENUS_WINDOW_PROVIDER_SET_MISMATCH");
    }
    if (
      evidence.providerAttestations.some(
        ({ observedAtUtc }) =>
          Date.parse(observedAtUtc) < Date.parse(evidence.blockTimestampUtc) ||
          Date.parse(observedAtUtc) > analysisTime
      )
    ) {
      throw new Error("VENUS_WINDOW_PROVIDER_TIME_INVALID");
    }
    if (index > 0) {
      const previous = window[index - 1];
      if (
        previous === undefined ||
        BigInt(evidence.blockNumber) <= BigInt(previous.blockNumber) ||
        Date.parse(evidence.blockTimestampUtc) <= Date.parse(previous.blockTimestampUtc)
      ) {
        throw new Error("VENUS_WINDOW_ORDER_INVALID");
      }
    }
  }
  const bindingTime =
    authorization.state === "explicit_testnet_authorization"
      ? authorization.authorizedAtUtc
      : authorization.selectedAtUtc;
  if (Date.parse(bindingTime) > Date.parse(first.blockTimestampUtc)) {
    throw new Error("VENUS_WINDOW_ACCOUNT_BINDING_TOO_LATE");
  }
  if (options.policy.minimumAlertReceipts !== 0) {
    throw new Error("VENUS_WINDOW_RUNNER_LATENCY_REQUIRES_ZERO_INTERNAL_RECEIPTS");
  }

  const observations = window.map((evidence) => {
    const collateral = collateralPositions(evidence);
    const debt = debtPositions(evidence);
    const collateralAddresses = collateral.map(({ vTokenAddress }) => vTokenAddress);
    const debtAddresses = debt.map(({ vTokenAddress }) => vTokenAddress);
    return {
      chainId: 97 as const,
      account: evidence.account,
      blockNumber: evidence.blockNumber,
      blockHash: evidence.blockHash,
      observedAtUtc: evidence.blockTimestampUtc,
      adjustedCollateralValueRaw: evidence.adjustedCollateralValueUsdE18Raw,
      debtValueRaw: evidence.debtValueUsdE18Raw,
      quoteValueUnit: "usd" as const,
      quoteValueScaleDecimals: 18 as const,
      liquidationThresholdScaleDecimals: 18,
      collateralComplete: true,
      debtComplete: true,
      collateralPositions: collateral,
      debtPositions: debt,
      source: observationSource(evidence, collateralAddresses, debtAddresses)
    };
  });
  const currentObservation = observations.at(-1);
  if (currentObservation === undefined) throw new Error("VENUS_WINDOW_SIZE_INVALID");
  const collateralAddresses = currentObservation.collateralPositions.map(
    ({ vTokenAddress }) => vTokenAddress
  );
  const debtAddresses = currentObservation.debtPositions.map(({ vTokenAddress }) => vTokenAddress);
  const sourceCommon = {
    kind: "onchain" as const,
    chainId: 97 as const,
    comptrollerAddress: current.comptrollerAddress,
    account: current.account,
    blockNumber: current.blockNumber,
    blockHash: current.blockHash,
    blockTimestampUtc: current.blockTimestampUtc,
    quoteValueUnit: "usd" as const,
    quoteValueScaleDecimals: 18 as const
  };
  const input = healthFactorAnalysisInputSchema.parse({
    chainId: 97,
    account: current.account,
    analysisAtUtc,
    methodology: {
      protocol: "venus-core-pool",
      thresholdKind: "effective_user_liquidation_threshold",
      weightingStrategy: "USE_LIQUIDATION_THRESHOLD",
      thresholdRead: "getEffectiveLtvFactor",
      quoteValueUnit: "usd",
      quoteValueScaleDecimals: 18,
      liquidationThresholdScaleDecimals: 18,
      chainId: 97,
      account: current.account,
      blockNumber: current.blockNumber,
      blockHash: current.blockHash,
      observedAtUtc: current.blockTimestampUtc,
      source: {
        ...sourceCommon,
        readMethod: "venus_core_pool_effective_liquidation_thresholds_v1",
        collateralVTokenAddresses: collateralAddresses
      }
    },
    currentSnapshot: {
      chainId: 97,
      account: current.account,
      blockNumber: current.blockNumber,
      blockHash: current.blockHash,
      observedAtUtc: current.blockTimestampUtc,
      quoteValueUnit: "usd",
      quoteValueScaleDecimals: 18,
      collateralComplete: true,
      debtComplete: true,
      collateralPositions: currentObservation.collateralPositions,
      debtPositions: currentObservation.debtPositions,
      source: {
        ...sourceCommon,
        readMethod: "venus_core_pool_complete_account_markets_v1",
        collateralVTokenAddresses: collateralAddresses,
        debtVTokenAddresses: debtAddresses
      }
    },
    observationSeries: { complete: true, observations },
    policy: options.policy,
    alertReceipts: null,
    alertReceiptsComplete: true,
    executionReceipts: null
  });
  const preflight = analyzeHealthFactor(input);
  if (
    preflight.currentHealthFactor.state === "unavailable" ||
    preflight.observationWindow.status !== "sufficient" ||
    preflight.constraintViolations.some(({ scope }) =>
      ["current_evidence", "history"].includes(scope)
    )
  ) {
    throw new Error("VENUS_WINDOW_HEALTH_INPUT_NOT_DECISION_READY");
  }

  return {
    schemaVersion: "proofera-health-factor-exact-window-build-v1.0.0",
    input,
    bindings: {
      accountAuthorization: authorization,
      firstBlockNumber: first.blockNumber,
      lastBlockNumber: current.blockNumber,
      observationCount: window.length,
      evidenceSha256: window.map(sha256Json),
      providerIds: current.providerAttestations.map(({ providerId }) => providerId).sort()
    },
    limitations: [
      "The adapter validates and transforms caller-supplied exact-block artifacts but performs no fresh RPC read.",
      authorization.state === "explicit_testnet_authorization"
        ? "The authorization binding identifies a reviewed artifact digest; the adapter does not authenticate the human principal behind it."
        : "The account is an unrelated public testnet replay subject; the binding claims neither ownership nor execution authority.",
      "Runner-level API and hire receipts remain separate TermiX gates and are not fabricated as Health Guardian alert receipts.",
      "The produced Health Guardian input remains caller_supplied_unverified and cannot authorize or execute an intervention."
    ]
  };
}
