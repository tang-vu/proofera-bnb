import { PANCAKE_V3_BSC_DEPLOYMENTS } from "@proofera/integrations";
import { describe, expect, it, vi } from "vitest";

import { parsePancakePositionQuery, resolvePancakePositionQuery } from "./pancake-position-query";

const POOL = "0x1111111111111111111111111111111111111111";
const UINT256_MAX =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

describe("Pancake position query", () => {
  it("keeps the initial state blank without invoking the loader", async () => {
    const load = vi.fn();

    expect(parsePancakePositionQuery({})).toEqual({
      status: "blank",
      formValues: { chainId: "56", poolAddress: "", positionId: "" }
    });
    await expect(resolvePancakePositionQuery({}, load)).resolves.toMatchObject({
      status: "blank"
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("preserves an exact uint256 ID and canonicalizes a ready pool address", () => {
    expect(
      parsePancakePositionQuery({
        chainId: "97",
        poolAddress: POOL.toLowerCase(),
        positionId: UINT256_MAX
      })
    ).toEqual({
      status: "ready",
      formValues: { chainId: "97", poolAddress: POOL, positionId: UINT256_MAX },
      input: { chainId: 97, poolAddress: POOL, positionId: UINT256_MAX }
    });
  });

  it.each([
    { label: "unsupported chain", query: { chainId: "1", poolAddress: POOL, positionId: "1" } },
    {
      label: "repeated value",
      query: { chainId: "56", poolAddress: [POOL, POOL], positionId: "1" }
    },
    {
      label: "bad address",
      query: { chainId: "56", poolAddress: "not-an-address", positionId: "1" }
    },
    { label: "non-canonical ID", query: { chainId: "56", poolAddress: POOL, positionId: "007" } },
    {
      label: "overflowing ID",
      query: {
        chainId: "56",
        poolAddress: POOL,
        positionId: "115792089237316195423570985008687907853269984665640564039457584007913129639936"
      }
    },
    {
      label: "unknown parameter",
      query: { chainId: "56", poolAddress: POOL, positionId: "1", rpcUrl: "https://example.test" }
    },
    {
      label: "manager instead of pool",
      query: {
        chainId: "56",
        poolAddress: PANCAKE_V3_BSC_DEPLOYMENTS[56].positionManager,
        positionId: "1"
      }
    }
  ])("rejects $label without invoking the loader", async ({ query }) => {
    const load = vi.fn();

    await expect(resolvePancakePositionQuery(query, load)).resolves.toMatchObject({
      status: "invalid"
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("invokes the loader exactly once only after validation", async () => {
    const load = vi.fn(async () => ({ status: "sentinel" as const }));

    await expect(
      resolvePancakePositionQuery({ chainId: "56", poolAddress: POOL, positionId: "9" }, load)
    ).resolves.toMatchObject({ status: "loaded", result: { status: "sentinel" } });
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith({ chainId: 56, poolAddress: POOL, positionId: "9" });
  });
});
