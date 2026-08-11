import { describe, expect, it, vi } from "vitest";

import { parseVenusHealthQuery, resolveVenusHealthQuery } from "./venus-health-query";

const ACCOUNT = "0x1111111111111111111111111111111111111111";

describe("Venus health query", () => {
  it("keeps an absent query blank without invoking the loader", async () => {
    const load = vi.fn();

    expect(parseVenusHealthQuery({})).toEqual({
      status: "blank",
      formValues: { chainId: "56", account: "" }
    });
    await expect(resolveVenusHealthQuery({}, load)).resolves.toMatchObject({ status: "blank" });
    expect(load).not.toHaveBeenCalled();
  });

  it.each([56, 97] as const)("accepts BSC chain %s and canonicalizes the account", (chainId) => {
    expect(
      parseVenusHealthQuery({ chainId: chainId.toString(10), account: ACCOUNT.toLowerCase() })
    ).toEqual({
      status: "ready",
      formValues: { chainId: chainId.toString(10), account: ACCOUNT },
      input: { chainId, account: ACCOUNT }
    });
  });

  it.each([
    { label: "unsupported chain", query: { chainId: "1", account: ACCOUNT } },
    { label: "missing account", query: { chainId: "56" } },
    { label: "blank account", query: { chainId: "97", account: "" } },
    { label: "bad account", query: { chainId: "56", account: "not-an-address" } },
    {
      label: "zero account",
      query: { chainId: "56", account: "0x0000000000000000000000000000000000000000" }
    },
    { label: "repeated account", query: { chainId: "56", account: [ACCOUNT, ACCOUNT] } },
    {
      label: "unknown RPC parameter",
      query: { chainId: "56", account: ACCOUNT, rpcUrl: "https://secret-provider.test/key" }
    }
  ])("rejects $label without invoking the loader", async ({ query }) => {
    const load = vi.fn();

    await expect(resolveVenusHealthQuery(query, load)).resolves.toMatchObject({
      status: "invalid"
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("bounds reflected invalid input", () => {
    const result = parseVenusHealthQuery({ chainId: "56", account: "a".repeat(10_000) });

    expect(result.status).toBe("invalid");
    expect(result.formValues.account).toHaveLength(100);
  });

  it("invokes the loader exactly once after strict validation", async () => {
    const load = vi.fn(async () => ({ status: "sentinel" as const }));

    await expect(
      resolveVenusHealthQuery({ chainId: "97", account: ACCOUNT }, load)
    ).resolves.toMatchObject({ status: "loaded", result: { status: "sentinel" } });
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith({ chainId: 97, account: ACCOUNT });
  });
});
