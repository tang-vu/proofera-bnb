import { describe, expect, it } from "vitest";

import { inspectLpConfiguration } from "./lp-activation-configuration";

const MAX_UINT256 = (2n ** 256n - 1n).toString(10);
const OVERFLOW_UINT256 = (2n ** 256n).toString(10);
const WALLET = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";

function fixture() {
  return {
    schemaVersion: 1,
    chainId: 97,
    wallet: WALLET,
    recipient: WALLET,
    poolAddress: POOL,
    positionTokenId: MAX_UINT256,
    desiredTick: { lower: -120, upper: 120 },
    capital: { token0Raw: MAX_UINT256, token1Raw: "2000000" },
    maxSlippageBps: 50,
    sessionDurationSeconds: 3_600,
    txDeadlineSeconds: 180,
    maxExecutionsPerDay: 4
  };
}

describe("LP configuration readiness service", () => {
  it("normalizes through the domain schema and preserves exact uint256 strings", () => {
    const input = fixture();
    input.wallet = WALLET.toUpperCase().replace("0X", "0x");
    input.recipient = input.wallet;
    const result = inspectLpConfiguration(input);

    expect(result.status).toBe("configuration_only");
    if (result.status !== "configuration_only") throw new Error("Expected configuration.");
    expect(result.readiness.configuration.wallet).toBe(WALLET);
    expect(result.readiness.configuration.positionTokenId).toBe(MAX_UINT256);
    expect(result.readiness.configuration.capital.token0Raw).toBe(MAX_UINT256);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.readiness.configuration.capital)).toBe(true);
  });

  it("returns a complete non-ready gate without synthesizing trusted artifacts", () => {
    const result = inspectLpConfiguration(fixture());

    expect(result.status).toBe("configuration_only");
    if (result.status !== "configuration_only") throw new Error("Expected configuration.");
    expect(result.readiness.blockers.map((blocker) => blocker.code)).toEqual([
      "WALLET_CONNECTION_ABSENT",
      "TRUSTED_CONTRACT_EVIDENCE_ABSENT",
      "OWNERSHIP_EVIDENCE_ABSENT",
      "QUOTE_EVIDENCE_ABSENT",
      "PERMISSION_POLICY_ABSENT",
      "ALTANA_AUTHORITY_ABSENT",
      "TRANSACTION_ABSENT"
    ]);
    expect(result.readiness.artifacts).toEqual({
      walletConnection: null,
      trustedContext: null,
      permissionPolicy: null,
      permissionPreview: null,
      altanaAuthority: null,
      transaction: null
    });
    expect(result.readiness.readyForPermissionPreview).toBe(false);
    expect(result.readiness.readyForWalletConfirmation).toBe(false);
    expect(result.readiness.readyForExecution).toBe(false);
  });

  it.each([
    {
      label: "recipient drift",
      alter: () => ({ ...fixture(), recipient: POOL }),
      code: "WALLET_RECIPIENT_MISMATCH"
    },
    {
      label: "leading-zero token ID",
      alter: () => ({ ...fixture(), positionTokenId: "01" }),
      code: "POSITION_TOKEN_ID_INVALID"
    },
    {
      label: "overflow capital",
      alter: () => ({
        ...fixture(),
        capital: { ...fixture().capital, token0Raw: OVERFLOW_UINT256 }
      }),
      code: "CAPITAL_AMOUNT_INVALID"
    },
    {
      label: "zero capital",
      alter: () => ({ ...fixture(), capital: { ...fixture().capital, token1Raw: "0" } }),
      code: "CAPITAL_AMOUNT_INVALID"
    },
    {
      label: "reversed ticks",
      alter: () => ({ ...fixture(), desiredTick: { lower: 120, upper: -120 } }),
      code: "TICK_ORDER_INVALID"
    },
    {
      label: "tick overflow",
      alter: () => ({ ...fixture(), desiredTick: { lower: -887_273, upper: 120 } }),
      code: "TICK_OUT_OF_BOUNDS"
    },
    {
      label: "slippage overflow",
      alter: () => ({ ...fixture(), maxSlippageBps: 101 }),
      code: "SLIPPAGE_OUT_OF_BOUNDS"
    },
    {
      label: "short session",
      alter: () => ({ ...fixture(), sessionDurationSeconds: 299 }),
      code: "SESSION_DURATION_OUT_OF_BOUNDS"
    },
    {
      label: "long deadline",
      alter: () => ({ ...fixture(), txDeadlineSeconds: 1_801 }),
      code: "TX_DEADLINE_OUT_OF_BOUNDS"
    },
    {
      label: "deadline beyond session",
      alter: () => ({ ...fixture(), sessionDurationSeconds: 300, txDeadlineSeconds: 600 }),
      code: "TX_DEADLINE_EXCEEDS_SESSION"
    },
    {
      label: "execution overflow",
      alter: () => ({ ...fixture(), maxExecutionsPerDay: 145 }),
      code: "EXECUTION_LIMIT_OUT_OF_BOUNDS"
    }
  ])("blocks $label", ({ alter, code }) => {
    const result = inspectLpConfiguration(alter());

    expect(result.status).toBe("invalid");
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });

  it("strictly rejects server-owned or unknown fields", () => {
    const result = inspectLpConfiguration({
      ...fixture(),
      managerAddress: "0x3333333333333333333333333333333333333333",
      codeHash: `0x${"aa".repeat(32)}`
    });

    expect(result.status).toBe("invalid");
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "INVALID_CONFIGURATION" })])
    );
  });
});
