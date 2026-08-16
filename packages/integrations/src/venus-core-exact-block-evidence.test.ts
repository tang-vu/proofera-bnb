import { describe, expect, it } from "vitest";

import { buildVenusCoreExactBlockEvidence } from "./venus-core-exact-block-evidence";
import { VENUS_CORE_POOL_BSC_DEPLOYMENTS } from "./venus-health";

const ACCOUNT = "0x64DF36Cb7ef4ab5191A21b68e48954D09D4FBf6B";
const VTOKEN = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";

function provider(providerId: string, publicSourceUrl: string) {
  return {
    schemaVersion: "proofera-venus-core-exact-block-provider-v1.0.0",
    providerId,
    publicSourceUrl,
    observedAtUtc: "2026-08-17T03:00:30.000Z",
    chainId: 97,
    account: ACCOUNT,
    comptrollerAddress: VENUS_CORE_POOL_BSC_DEPLOYMENTS[97].comptroller,
    blockNumber: "125465272",
    blockHash: `0x${"ab".repeat(32)}`,
    blockTimestampUtc: "2026-08-17T03:00:00.000Z",
    comptrollerRuntimeCode: "0x6000",
    oracleAddress: "0x3cD69251D04A28d887Ac14cbe2E14c52F3D57823",
    oracleRuntimeCode: "0x6001",
    vaiControllerAddress: "0xf70C3C6b749BbAb89C081737334E74C9aFD4BE16",
    vaiRepayAmountRaw: "0",
    assetsIn: [VTOKEN],
    markets: [
      {
        vTokenAddress: VTOKEN,
        vTokenSymbol: "vUSDT",
        vTokenDecimals: 8,
        underlyingAddress: "0x7ef95a0Fe8B8dC0F1701bE7eA72d5A098C3aB1a1",
        underlyingSymbol: "USDT",
        underlyingDecimals: 18,
        isListed: true,
        collateralFactorMantissaRaw: "800000000000000000",
        liquidationThresholdMantissaRaw: "850000000000000000",
        effectiveLiquidationThresholdMantissaRaw: "850000000000000000",
        isBorrowAllowed: true,
        accountSnapshotErrorCode: "0",
        vTokenBalanceRaw: "1411021975758406",
        borrowBalanceRaw: "192053000000",
        exchangeRateMantissaRaw: "200776461931237",
        oraclePriceStatus: "available",
        oraclePriceMantissaRaw: "1000000000000000000"
      }
    ]
  };
}

describe("Venus Core exact-block evidence", () => {
  it("requires matching independent providers and mirrors Venus truncation order", () => {
    const result = buildVenusCoreExactBlockEvidence([
      provider("publicnode-bsc-testnet", "https://bsc-testnet-rpc.publicnode.com"),
      provider("bnbchain-dataseed", "https://bsc-testnet-dataseed.bnbchain.org")
    ]);

    const threshold = 850000000000000000n;
    const exchange = 200776461931237n;
    const price = 1000000000000000000n;
    const balance = 1411021975758406n;
    const borrow = 192053000000n;
    const expectedAdjusted = (((threshold * exchange) / 10n ** 18n) * price) / 10n ** 18n;
    const expectedAdjustedValue = (expectedAdjusted * balance) / 10n ** 18n;
    const expectedDebt = (price * borrow) / 10n ** 18n;

    expect(result.adjustedCollateralValueUsdE18Raw).toBe(expectedAdjustedValue.toString());
    expect(result.debtValueUsdE18Raw).toBe(expectedDebt.toString());
    expect(result.healthFactorE18Raw).toBe(
      ((expectedAdjustedValue * 10n ** 18n) / expectedDebt).toString()
    );
    expect(result.marketsEnumerated).toBe(1);
    expect(result.providerAttestations).toHaveLength(2);
  });

  it("rejects provider disagreement, duplicated origins, hidden VAI debt and missing membership", () => {
    const first = provider("one", "https://one.example/rpc");
    const mismatch = provider("two", "https://two.example/rpc");
    mismatch.blockHash = `0x${"cd".repeat(32)}`;
    expect(() => buildVenusCoreExactBlockEvidence([first, mismatch])).toThrow(
      "VENUS_PROVIDER_MISMATCH"
    );

    expect(() =>
      buildVenusCoreExactBlockEvidence([first, provider("two", "https://one.example/another-rpc")])
    ).toThrow("VENUS_INDEPENDENT_PROVIDERS_REQUIRED");

    const vaiDebt = provider("two", "https://two.example/rpc");
    vaiDebt.vaiRepayAmountRaw = "1";
    expect(() => buildVenusCoreExactBlockEvidence([first, vaiDebt])).toThrow();

    const missingMembership = provider("two", "https://two.example/rpc");
    missingMembership.assetsIn = [];
    expect(() => buildVenusCoreExactBlockEvidence([first, missingMembership])).toThrow();
  });

  it("does not turn a debt-free observation into a safety claim", () => {
    const first = provider("one", "https://one.example/rpc");
    const second = provider("two", "https://two.example/rpc");
    const firstMarket = first.markets.at(0);
    const secondMarket = second.markets.at(0);
    if (firstMarket === undefined || secondMarket === undefined) throw new Error("Missing fixture");
    firstMarket.borrowBalanceRaw = "0";
    secondMarket.borrowBalanceRaw = "0";
    const result = buildVenusCoreExactBlockEvidence([first, second]);
    expect(result.healthFactorE18Raw).toBeNull();
    expect(result.limitations.join(" ")).toContain("must never be presented as infinite or safe");
  });

  it("permits an unavailable oracle only for a market with no account position", () => {
    const first = provider("one", "https://one.example/rpc");
    const second = provider("two", "https://two.example/rpc");
    for (const observation of [first, second]) {
      const market = observation.markets.at(0);
      if (market === undefined) throw new Error("Missing fixture");
      market.vTokenBalanceRaw = "0";
      market.borrowBalanceRaw = "0";
      market.oraclePriceStatus = "unavailable";
      market.oraclePriceMantissaRaw = "0";
      observation.assetsIn = [];
    }
    expect(buildVenusCoreExactBlockEvidence([first, second]).positions).toEqual([]);

    const active = provider("three", "https://three.example/rpc");
    const activePeer = provider("four", "https://four.example/rpc");
    for (const observation of [active, activePeer]) {
      const market = observation.markets.at(0);
      if (market === undefined) throw new Error("Missing fixture");
      market.oraclePriceStatus = "unavailable";
      market.oraclePriceMantissaRaw = "0";
    }
    expect(() => buildVenusCoreExactBlockEvidence([active, activePeer])).toThrow();
  });
});
