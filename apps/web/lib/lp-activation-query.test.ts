import { describe, expect, it } from "vitest";

import { parseLpActivationQuery, type LpActivationSearchParams } from "./lp-activation-query";

const MAX_UINT256 = (2n ** 256n - 1n).toString(10);
const WALLET = "0x11111111111111111111111111111111111111aa";
const POOL = "0x22222222222222222222222222222222222222bb";

function validQuery(overrides: LpActivationSearchParams = {}): LpActivationSearchParams {
  return {
    schemaVersion: "1",
    chainId: "97",
    wallet: WALLET,
    recipient: WALLET,
    poolAddress: POOL,
    positionTokenId: MAX_UINT256,
    tickLower: "-120",
    tickUpper: "120",
    capitalToken0Raw: MAX_UINT256,
    capitalToken1Raw: "2000000",
    maxSlippageBps: "50",
    sessionDurationSeconds: "3600",
    txDeadlineSeconds: "180",
    maxExecutionsPerDay: "4",
    ...overrides
  };
}

describe("LP configuration query", () => {
  it("keeps an absent query blank with safe form defaults", () => {
    expect(parseLpActivationQuery({})).toEqual({
      status: "blank",
      formValues: {
        schemaVersion: "1",
        chainId: "97",
        wallet: "",
        recipient: "",
        poolAddress: "",
        positionTokenId: "",
        tickLower: "-120",
        tickUpper: "120",
        capitalToken0Raw: "",
        capitalToken1Raw: "",
        maxSlippageBps: "50",
        sessionDurationSeconds: "3600",
        txDeadlineSeconds: "180",
        maxExecutionsPerDay: "4"
      }
    });
  });

  it("normalizes addresses while preserving exact maximum uint256 strings", () => {
    const state = parseLpActivationQuery(
      validQuery({
        wallet: WALLET.toUpperCase().replace("0X", "0x"),
        recipient: WALLET.toUpperCase().replace("0X", "0x")
      })
    );

    expect(state.status).toBe("configured");
    if (state.status !== "configured") throw new Error("Expected configured query.");
    expect(state.configuration.wallet).toBe(WALLET);
    expect(state.configuration.positionTokenId).toBe(MAX_UINT256);
    expect(state.configuration.capital.token0Raw).toBe(MAX_UINT256);
    expect(state.formValues.capitalToken0Raw).toBe(MAX_UINT256);
    expect(state.readiness.status).toBe("configuration_only");
  });

  it.each([
    {
      label: "server manager",
      query: validQuery({ managerAddress: "0x3333333333333333333333333333333333333333" })
    },
    { label: "code hash", query: validQuery({ codeHash: `0x${"aa".repeat(32)}` }) },
    { label: "token metadata", query: validQuery({ token0Decimals: "18" }) },
    { label: "quote evidence", query: validQuery({ quoteObservedAt: "2026-08-11" }) },
    { label: "minimum output", query: validQuery({ minimumToken0Raw: "1" }) }
  ])("rejects unknown trust field: $label", ({ query }) => {
    const state = parseLpActivationQuery(query);

    expect(state.status).toBe("invalid");
    if (state.status !== "invalid") throw new Error("Expected invalid query.");
    expect(state.issues).toContainEqual({
      field: "query",
      message: "Only user-controlled LP configuration fields are accepted."
    });
  });

  it("rejects repeated fields instead of selecting one", () => {
    const state = parseLpActivationQuery(validQuery({ wallet: [WALLET, WALLET] }));

    expect(state.status).toBe("invalid");
    if (state.status !== "invalid") throw new Error("Expected invalid query.");
    expect(state.issues).toContainEqual({
      field: "wallet",
      message: "Each configuration field must appear exactly once."
    });
  });

  it.each([
    { field: "chainId", value: "56" },
    { field: "wallet", value: "not-an-address" },
    { field: "recipient", value: POOL },
    { field: "poolAddress", value: "0x0000000000000000000000000000000000000000" },
    { field: "positionTokenId", value: "01" },
    { field: "capitalToken0Raw", value: "0" },
    { field: "capitalToken1Raw", value: (2n ** 256n).toString(10) },
    { field: "tickLower", value: "-887273" },
    { field: "tickUpper", value: "-120" },
    { field: "maxSlippageBps", value: "101" },
    { field: "sessionDurationSeconds", value: "299" },
    { field: "txDeadlineSeconds", value: "1801" },
    { field: "maxExecutionsPerDay", value: "145" }
  ])("rejects invalid $field", ({ field, value }) => {
    const state = parseLpActivationQuery(validQuery({ [field]: value }));

    expect(state.status).toBe("invalid");
    if (state.status !== "invalid") throw new Error("Expected invalid query.");
    expect(state.issues.length).toBeGreaterThan(0);
  });

  it("bounds reflected invalid values", () => {
    const state = parseLpActivationQuery(validQuery({ wallet: "x".repeat(10_000) }));

    expect(state.status).toBe("invalid");
    expect(state.formValues.wallet).toHaveLength(100);
  });
});
