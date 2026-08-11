import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";

import { ACTIVATION_POLICY_VERSION, type ActivationPolicy } from "./activation-policy";
import {
  activationPermissionPreviewSchema,
  buildActivationPermissionPreview,
  permissionPreviewEnforcementSchema
} from "./permission-preview";

const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";
const wallet = "0x3333333333333333333333333333333333333333";
const managerA = "0x4444444444444444444444444444444444444444";
const managerB = "0x5555555555555555555555555555555555555555";
const codeHashA = `0x${"aa".repeat(32)}`;
const codeHashB = `0x${"bb".repeat(32)}`;
const signatureA = "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))" as const;
const signatureB = "collect((uint256,address,uint128,uint128))" as const;

function policyFixture(): ActivationPolicy {
  return {
    agentId: "bsc-testnet:proof-range-guardian",
    calls: [
      {
        contractLabel: "Position Manager A",
        expectedIdentity: { codeHash: codeHashA, kind: "code_hash" },
        operationKind: "direct",
        selector: toFunctionSelector(signatureA),
        signature: signatureA,
        to: managerA
      },
      {
        contractLabel: "Position Manager B",
        expectedIdentity: {
          implementationAddress: managerB,
          implementationCodeHash: codeHashB,
          kind: "implementation"
        },
        operationKind: "direct",
        selector: toFunctionSelector(signatureB),
        signature: signatureB,
        to: managerB
      }
    ],
    capital: [
      { address: tokenA, amountRaw: "1000000000000000000", decimals: 18, symbol: "TKA" },
      { address: tokenB, amountRaw: "900719925474099312345678", decimals: 6, symbol: "TKB" }
    ],
    category: "lp-rebalancing",
    chain: { chainId: 97, environment: "testnet", name: "BSC Testnet" },
    deadlineSeconds: 300,
    emergency: {
      onDeviation: "block-and-alert",
      onStaleQuote: "block",
      userCanRevoke: true
    },
    enforcement: {
      callPermissions: "altana_onchain",
      grantConfirmation: "wallet_confirmation",
      runtimeConstraints: "proofera_runtime",
      sessionExpiry: "altana_onchain",
      spendLimits: "altana_onchain"
    },
    expiry: Math.floor(Date.parse("2026-08-11T13:00:00.000Z") / 1_000),
    maxExecutionsPerDay: 4,
    minimumAmounts: [
      { amountRaw: "450000000000000000", token: tokenA },
      { amountRaw: "123456789012345678", token: tokenB }
    ],
    quote: {
      observedAt: "2026-08-11T11:59:00.000Z",
      sourceUrl: `https://testnet.bscscan.com/address/${managerA}`,
      validUntil: "2026-08-11T12:05:00.000Z"
    },
    recipient: wallet,
    registerInKeystore: true,
    slippageBps: 50,
    spend: [
      { limitRaw: "500000000000000000", period: "day", token: tokenA },
      { limitRaw: "900719925474099312345678", period: "week", token: tokenB }
    ],
    tickRange: { lower: -600, upper: 600 },
    tokenId: "42",
    transactionDeadline: Math.floor(Date.parse("2026-08-11T12:04:00.000Z") / 1_000),
    version: ACTIVATION_POLICY_VERSION,
    wallet
  };
}

describe("buildActivationPermissionPreview", () => {
  it("assigns each permission to its real enforcement owner", () => {
    const preview = buildActivationPermissionPreview(policyFixture());

    expect(preview.callRows.every((row) => row.enforcement === "Altana/onchain")).toBe(true);
    expect(
      preview.callRows.every((row) => row.expectedIdentity.enforcement === "ProofEra runtime")
    ).toBe(true);
    expect(preview.capitalRows.every((row) => row.enforcement === "wallet confirmation")).toBe(
      true
    );
    expect(preview.spendCapRows.every((row) => row.enforcement === "Altana/onchain")).toBe(true);

    for (const row of preview.constraintRows) {
      expect(row.enforcement).toBe(
        row.kind === "revoke" ? "wallet confirmation" : "ProofEra runtime"
      );
    }
    expect(preview.overviewRows.expiry.enforcement).toBe("Altana/onchain");
    expect(preview.overviewRows.wallet.enforcement).toBe("ProofEra runtime");
    expect(preview.overviewRows.policyBinding.enforcement).toBe("wallet confirmation");
    expect(preview.scopeBoundary).toContain("It does not constrain calldata arguments");

    const allEnforcementValues = [
      ...preview.callRows.flatMap((row) => [row.enforcement, row.expectedIdentity.enforcement]),
      ...preview.capitalRows.map((row) => row.enforcement),
      ...preview.spendCapRows.map((row) => row.enforcement),
      ...preview.constraintRows.map((row) => row.enforcement),
      ...Object.values(preview.overviewRows).map((row) => row.enforcement)
    ];
    expect(
      allEnforcementValues.every(
        (value) => permissionPreviewEnforcementSchema.safeParse(value).success
      )
    ).toBe(true);
  });

  it("preserves exact contract, signature, and selector pairing after canonical ordering", () => {
    const preview = buildActivationPermissionPreview(policyFixture());
    const callA = preview.callRows.find((row) => row.contractAddress === managerA);
    const callB = preview.callRows.find((row) => row.contractAddress === managerB);

    expect(callA).toMatchObject({
      contractAddress: managerA,
      selector: toFunctionSelector(signatureA),
      signature: signatureA
    });
    expect(callA?.contractLabel).toEqual({ renderAs: "text", text: "Position Manager A" });
    expect(callB).toMatchObject({
      contractAddress: managerB,
      selector: toFunctionSelector(signatureB),
      signature: signatureB
    });
    expect(callB?.contractLabel).toEqual({ renderAs: "text", text: "Position Manager B" });
  });

  it("is canonical and stable when set-like policy arrays arrive in another order", () => {
    const policy = policyFixture();
    const reordered: ActivationPolicy = {
      ...policy,
      calls: [...policy.calls].reverse(),
      capital: [...policy.capital].reverse(),
      minimumAmounts: [...policy.minimumAmounts].reverse(),
      spend: [...policy.spend].reverse()
    };

    const first = buildActivationPermissionPreview(policy);
    const second = buildActivationPermissionPreview(reordered);
    expect(second.policyHash).toBe(first.policyHash);
    expect(second).toEqual(first);

    const tampered = policyFixture();
    tampered.tokenId = "43";
    expect(buildActivationPermissionPreview(tampered).policyHash).not.toBe(first.policyHash);
  });

  it("preserves maximum uint256 and other unsafe-for-Number raw amounts as strings", () => {
    const maxUint256 = (2n ** 256n - 1n).toString();
    const policy = policyFixture();
    const firstCapital = policy.capital[0];
    const firstSpend = policy.spend[0];
    const firstMinimum = policy.minimumAmounts[0];
    if (firstCapital === undefined || firstSpend === undefined || firstMinimum === undefined) {
      throw new Error("Test fixture requires capital, spend, and minimum amount entries.");
    }
    policy.capital[0] = { ...firstCapital, amountRaw: maxUint256 };
    policy.spend[0] = { ...firstSpend, limitRaw: maxUint256 };
    policy.minimumAmounts[0] = { ...firstMinimum, amountRaw: maxUint256 };
    policy.tokenId = maxUint256;

    const preview = buildActivationPermissionPreview(policy);
    const minimums = preview.constraintRows.find((row) => row.kind === "minimum_amounts");
    const tokenId = preview.constraintRows.find((row) => row.kind === "token_id");

    expect(preview.capitalRows[0]?.amountRaw).toBe(maxUint256);
    expect(preview.spendCapRows[0]?.limitRaw).toBe(maxUint256);
    expect(minimums?.kind === "minimum_amounts" ? minimums.amounts[0]?.amountRaw : null).toBe(
      maxUint256
    );
    expect(tokenId?.kind === "token_id" ? tokenId.tokenIdRaw : null).toBe(maxUint256);
    expect(activationPermissionPreviewSchema.parse(JSON.parse(JSON.stringify(preview)))).toEqual(
      preview
    );
  });

  it("keeps hostile labels as explicitly inert text data", () => {
    const policy = policyFixture();
    const firstCall = policy.calls[0];
    const firstCapital = policy.capital[0];
    if (firstCall === undefined || firstCapital === undefined) {
      throw new Error("Test fixture requires call and capital entries.");
    }
    policy.agentId = '<img src=x onerror="steal()">';
    policy.calls[0] = {
      ...firstCall,
      contractLabel: "<svg onload=steal()>"
    };
    policy.capital[0] = { ...firstCapital, symbol: "</script>" };

    const preview = buildActivationPermissionPreview(policy);
    const hostileCall = preview.callRows.find((row) => row.contractAddress === managerA);

    expect(preview.overviewRows.agent.agent).toEqual({
      renderAs: "text",
      text: '<img src=x onerror="steal()">'
    });
    expect(hostileCall?.contractLabel).toEqual({
      renderAs: "text",
      text: "<svg onload=steal()>"
    });
    expect(preview.capitalRows[0]?.symbol).toEqual({ renderAs: "text", text: "</script>" });
    expect(JSON.stringify(preview)).not.toContain("dangerouslySetInnerHTML");
  });

  it("shows quote timing without inventing build-time age, price, or fee fields", () => {
    const preview = buildActivationPermissionPreview(policyFixture());
    const quote = preview.constraintRows.find((row) => row.kind === "quote_age");
    expect(quote).toMatchObject({
      ageAtPreviewMilliseconds: null,
      observedAt: "2026-08-11T11:59:00.000Z",
      validUntil: "2026-08-11T12:05:00.000Z",
      validityWindowMilliseconds: 360_000
    });

    const keys: string[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (typeof value === "object" && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          keys.push(key);
          visit(child);
        }
      }
    };
    visit(preview);
    expect(keys).not.toEqual(expect.arrayContaining(["price", "fee", "estimatedFee"]));
  });

  it("supports all four categories without category-specific permission claims", () => {
    const categories: ActivationPolicy["category"][] = [
      "lp-rebalancing",
      "grid-trading",
      "yield-optimisation",
      "health-factor-monitoring"
    ];
    for (const category of categories) {
      const policy = policyFixture();
      policy.category = category;
      expect(() => buildActivationPermissionPreview(policy)).not.toThrow();
    }
  });

  it("leads with worst-case language and strictly rejects unknown input or output fields", () => {
    const policy = policyFixture();
    expect(() =>
      buildActivationPermissionPreview({
        ...policy,
        quote: { ...policy.quote, trustClientClock: true }
      })
    ).toThrow();

    const preview = buildActivationPermissionPreview(policy);
    expect(Object.keys(preview)[0]).toBe("worstCase");
    expect(preview.worstCase.startsWith("Worst case:")).toBe(true);

    const firstCall = preview.callRows[0];
    const firstCapital = preview.capitalRows[0];
    if (firstCall === undefined || firstCapital === undefined) {
      throw new Error("Preview requires call and capital rows.");
    }
    expect(
      activationPermissionPreviewSchema.safeParse({
        ...preview,
        callRows: [
          { ...firstCall, calldataArgumentsEnforcedByAltana: true },
          ...preview.callRows.slice(1)
        ]
      }).success
    ).toBe(false);

    expect(
      activationPermissionPreviewSchema.safeParse({
        ...preview,
        capitalRows: [
          { ...firstCapital, amountRaw: (2n ** 256n).toString() },
          ...preview.capitalRows.slice(1)
        ]
      }).success
    ).toBe(false);

    const wrongOwnerRows = preview.constraintRows.map((row) =>
      row.kind === "recipient" ? { ...row, enforcement: "Altana/onchain" as const } : row
    );
    expect(
      activationPermissionPreviewSchema.safeParse({
        ...preview,
        constraintRows: wrongOwnerRows
      }).success
    ).toBe(false);
  });
});
