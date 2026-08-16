import { getAddress, isAddress, type Address, type Hex } from "viem";
import { z } from "zod";

import { VENUS_CORE_POOL_BSC_DEPLOYMENTS } from "./venus-health";

const UINT256_MAX = (1n << 256n) - 1n;
const EXP_SCALE = 10n ** 18n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Invalid EVM address")
  .transform((value) => getAddress(value.toLowerCase()) as Address);

const nonZeroAddressSchema = addressSchema.refine(
  (value) => value !== ZERO_ADDRESS,
  "The zero address is not allowed"
);

const uint256Schema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/, "Expected a canonical uint256 decimal string")
  .refine((value) => BigInt(value) <= UINT256_MAX, "Value exceeds uint256");

const hashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hash")
  .transform((value) => value.toLowerCase() as Hex);

const runtimeCodeSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2})+$/, "Expected non-empty EVM runtime code")
  .transform((value) => value.toLowerCase() as Hex);

const utcSchema = z.string().datetime({ offset: false });

const marketSchema = z.strictObject({
  vTokenAddress: nonZeroAddressSchema,
  vTokenRuntimeCode: runtimeCodeSchema,
  vTokenSymbol: z.string().trim().min(1).max(64),
  vTokenDecimals: z.number().int().min(0).max(36),
  underlyingAddress: nonZeroAddressSchema.nullable(),
  underlyingSymbol: z.string().trim().min(1).max(48),
  underlyingDecimals: z.number().int().min(0).max(36),
  isListed: z.boolean(),
  collateralFactorMantissaRaw: uint256Schema,
  liquidationThresholdMantissaRaw: uint256Schema,
  effectiveLiquidationThresholdMantissaRaw: uint256Schema,
  isBorrowAllowed: z.boolean(),
  accountSnapshotErrorCode: uint256Schema,
  vTokenBalanceRaw: uint256Schema,
  borrowBalanceRaw: uint256Schema,
  exchangeRateMantissaRaw: uint256Schema,
  oraclePriceMantissaRaw: uint256Schema
});

export const venusCoreExactBlockProviderObservationSchema = z
  .strictObject({
    schemaVersion: z.literal("proofera-venus-core-exact-block-provider-v1.0.0"),
    providerId: z.string().trim().min(1).max(80),
    publicSourceUrl: z.string().url().startsWith("https://"),
    observedAtUtc: utcSchema,
    chainId: z.literal(97),
    account: nonZeroAddressSchema,
    comptrollerAddress: nonZeroAddressSchema,
    blockNumber: uint256Schema,
    blockHash: hashSchema,
    blockTimestampUtc: utcSchema,
    comptrollerRuntimeCode: runtimeCodeSchema,
    oracleAddress: nonZeroAddressSchema,
    oracleRuntimeCode: runtimeCodeSchema,
    vaiControllerAddress: nonZeroAddressSchema,
    vaiRepayAmountRaw: uint256Schema,
    assetsIn: z.array(nonZeroAddressSchema).max(64),
    markets: z.array(marketSchema).min(1).max(64)
  })
  .superRefine((observation, context) => {
    if (observation.comptrollerAddress !== VENUS_CORE_POOL_BSC_DEPLOYMENTS[97].comptroller) {
      context.addIssue({
        code: "custom",
        path: ["comptrollerAddress"],
        message: "Expected the official Venus Core Pool Comptroller on BSC testnet"
      });
    }

    const marketAddresses = new Set<string>();
    for (const [index, market] of observation.markets.entries()) {
      const address = market.vTokenAddress.toLowerCase();
      if (marketAddresses.has(address)) {
        context.addIssue({
          code: "custom",
          path: ["markets", index, "vTokenAddress"],
          message: "Duplicate vToken market"
        });
      }
      marketAddresses.add(address);
      if (market.accountSnapshotErrorCode !== "0") {
        context.addIssue({
          code: "custom",
          path: ["markets", index, "accountSnapshotErrorCode"],
          message: "Venus account snapshot returned a non-zero error code"
        });
      }
      if (BigInt(market.effectiveLiquidationThresholdMantissaRaw) > EXP_SCALE) {
        context.addIssue({
          code: "custom",
          path: ["markets", index, "effectiveLiquidationThresholdMantissaRaw"],
          message: "Effective liquidation threshold exceeds 1e18"
        });
      }
      if (
        (market.vTokenBalanceRaw !== "0" || market.borrowBalanceRaw !== "0") &&
        !observation.assetsIn.some(
          (asset) => asset.toLowerCase() === market.vTokenAddress.toLowerCase()
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["markets", index],
          message: "A non-zero account position is missing from getAssetsIn"
        });
      }
      if (
        (market.vTokenBalanceRaw !== "0" || market.borrowBalanceRaw !== "0") &&
        (!market.isListed || market.oraclePriceMantissaRaw === "0")
      ) {
        context.addIssue({
          code: "custom",
          path: ["markets", index],
          message: "An active position requires a listed market and non-zero oracle price"
        });
      }
    }

    const assets = new Set<string>();
    for (const [index, asset] of observation.assetsIn.entries()) {
      const address = asset.toLowerCase();
      if (assets.has(address)) {
        context.addIssue({
          code: "custom",
          path: ["assetsIn", index],
          message: "Duplicate getAssetsIn market"
        });
      }
      assets.add(address);
      if (!marketAddresses.has(address)) {
        context.addIssue({
          code: "custom",
          path: ["assetsIn", index],
          message: "getAssetsIn contains a market absent from getAllMarkets"
        });
      }
    }

    if (observation.vaiRepayAmountRaw !== "0") {
      context.addIssue({
        code: "custom",
        path: ["vaiRepayAmountRaw"],
        message: "VAI debt is not representable by the current Health Guardian input contract"
      });
    }
  });

export type VenusCoreExactBlockProviderObservation = z.output<
  typeof venusCoreExactBlockProviderObservationSchema
>;

export interface VenusCoreDerivedMarketPosition {
  readonly vTokenAddress: Address;
  readonly vTokenSymbol: string;
  readonly underlyingSymbol: string;
  readonly vTokenBalanceRaw: string;
  readonly borrowBalanceRaw: string;
  readonly exchangeRateMantissaRaw: string;
  readonly oraclePriceMantissaRaw: string;
  readonly effectiveLiquidationThresholdMantissaRaw: string;
  readonly suppliedValueUsdE18Raw: string;
  readonly adjustedCollateralValueUsdE18Raw: string;
  readonly debtValueUsdE18Raw: string;
}

export interface VenusCoreExactBlockEvidence {
  readonly schemaVersion: "proofera-venus-core-exact-block-evidence-v1.0.0";
  readonly chainId: 97;
  readonly account: Address;
  readonly comptrollerAddress: Address;
  readonly blockNumber: string;
  readonly blockHash: Hex;
  readonly blockTimestampUtc: string;
  readonly oracleAddress: Address;
  readonly marketsEnumerated: number;
  readonly assetsIn: readonly Address[];
  readonly positions: readonly VenusCoreDerivedMarketPosition[];
  readonly adjustedCollateralValueUsdE18Raw: string;
  readonly debtValueUsdE18Raw: string;
  readonly healthFactorE18Raw: string | null;
  readonly providerAttestations: readonly {
    readonly providerId: string;
    readonly publicSourceUrl: string;
    readonly observedAtUtc: string;
  }[];
  readonly limitations: readonly string[];
}

function multiplyExp(left: bigint, right: bigint): bigint {
  const result = (left * right) / EXP_SCALE;
  if (result > UINT256_MAX) throw new Error("VENUS_UINT256_OVERFLOW");
  return result;
}

function multiplyExpByScalar(value: bigint, scalar: bigint): bigint {
  const product = value * scalar;
  if (product > UINT256_MAX) throw new Error("VENUS_UINT256_OVERFLOW");
  return product / EXP_SCALE;
}

function comparableObservation(observation: VenusCoreExactBlockProviderObservation): string {
  const providerLocalFields = new Set(["providerId", "publicSourceUrl", "observedAtUtc"]);
  return JSON.stringify(observation, (key, value: unknown) =>
    providerLocalFields.has(key) ? undefined : value
  );
}

/**
 * Builds evidence only when every independent provider reports byte-for-byte equivalent,
 * runtime-validated exact-block state. The arithmetic mirrors ComptrollerLens:
 * threshold*exchange/1e18, then *price/1e18, then *vTokenBalance/1e18.
 */
export function buildVenusCoreExactBlockEvidence(
  rawObservations: readonly unknown[]
): VenusCoreExactBlockEvidence {
  if (rawObservations.length < 2) throw new Error("VENUS_TWO_PROVIDERS_REQUIRED");
  const observations = rawObservations.map((value) =>
    venusCoreExactBlockProviderObservationSchema.parse(value)
  );
  const providerIds = new Set(observations.map(({ providerId }) => providerId));
  const providerOrigins = new Set(
    observations.map(({ publicSourceUrl }) => new URL(publicSourceUrl).origin)
  );
  if (providerIds.size !== observations.length || providerOrigins.size !== observations.length) {
    throw new Error("VENUS_INDEPENDENT_PROVIDERS_REQUIRED");
  }
  const source = observations.at(0);
  if (source === undefined) throw new Error("VENUS_TWO_PROVIDERS_REQUIRED");
  const expected = comparableObservation(source);
  if (observations.some((observation) => comparableObservation(observation) !== expected)) {
    throw new Error("VENUS_PROVIDER_MISMATCH");
  }

  const positions = source.markets
    .filter(
      ({ vTokenBalanceRaw, borrowBalanceRaw }) =>
        vTokenBalanceRaw !== "0" || borrowBalanceRaw !== "0"
    )
    .map((market): VenusCoreDerivedMarketPosition => {
      const balance = BigInt(market.vTokenBalanceRaw);
      const borrow = BigInt(market.borrowBalanceRaw);
      const exchangeRate = BigInt(market.exchangeRateMantissaRaw);
      const price = BigInt(market.oraclePriceMantissaRaw);
      const threshold = BigInt(market.effectiveLiquidationThresholdMantissaRaw);
      const suppliedValue = multiplyExpByScalar(multiplyExp(exchangeRate, price), balance);
      const adjustedCollateral = multiplyExpByScalar(
        multiplyExp(multiplyExp(threshold, exchangeRate), price),
        balance
      );
      const debtValue = multiplyExpByScalar(price, borrow);
      return {
        vTokenAddress: market.vTokenAddress,
        vTokenSymbol: market.vTokenSymbol,
        underlyingSymbol: market.underlyingSymbol,
        vTokenBalanceRaw: market.vTokenBalanceRaw,
        borrowBalanceRaw: market.borrowBalanceRaw,
        exchangeRateMantissaRaw: market.exchangeRateMantissaRaw,
        oraclePriceMantissaRaw: market.oraclePriceMantissaRaw,
        effectiveLiquidationThresholdMantissaRaw: market.effectiveLiquidationThresholdMantissaRaw,
        suppliedValueUsdE18Raw: suppliedValue.toString(),
        adjustedCollateralValueUsdE18Raw: adjustedCollateral.toString(),
        debtValueUsdE18Raw: debtValue.toString()
      };
    });
  const adjustedCollateral = positions.reduce(
    (sum, position) => sum + BigInt(position.adjustedCollateralValueUsdE18Raw),
    0n
  );
  const debt = positions.reduce((sum, position) => sum + BigInt(position.debtValueUsdE18Raw), 0n);
  if (adjustedCollateral > UINT256_MAX || debt > UINT256_MAX) {
    throw new Error("VENUS_UINT256_OVERFLOW");
  }

  return {
    schemaVersion: "proofera-venus-core-exact-block-evidence-v1.0.0",
    chainId: 97,
    account: source.account,
    comptrollerAddress: source.comptrollerAddress,
    blockNumber: source.blockNumber,
    blockHash: source.blockHash,
    blockTimestampUtc: source.blockTimestampUtc,
    oracleAddress: source.oracleAddress,
    marketsEnumerated: source.markets.length,
    assetsIn: source.assetsIn,
    positions,
    adjustedCollateralValueUsdE18Raw: adjustedCollateral.toString(),
    debtValueUsdE18Raw: debt.toString(),
    healthFactorE18Raw: debt === 0n ? null : ((adjustedCollateral * EXP_SCALE) / debt).toString(),
    providerAttestations: observations.map(({ providerId, publicSourceUrl, observedAtUtc }) => ({
      providerId,
      publicSourceUrl,
      observedAtUtc
    })),
    limitations: [
      "This is read-only exact-block evidence, not a transaction, alert-delivery receipt, or authorization.",
      "A null health factor means no enumerated debt; it must never be presented as infinite or safe.",
      "The observation is benchmark preparation until a frozen TermiX declaration and required hire receipt exist."
    ]
  };
}
