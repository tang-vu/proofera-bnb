import { describe, expect, it } from "vitest";

import { parseAgentRouteIdentity } from "./agent-route";

describe("parseAgentRouteIdentity", () => {
  it("preserves exact uint256 token IDs on supported BSC networks", () => {
    const maximum =
      "115792089237316195423570985008687907853269984665640564039457584007913129639935";

    expect(parseAgentRouteIdentity({ chainId: "56", tokenId: maximum })).toEqual({
      chainId: 56,
      tokenId: maximum
    });
    expect(parseAgentRouteIdentity({ chainId: "97", tokenId: "0" })).toEqual({
      chainId: 97,
      tokenId: "0"
    });
  });

  it("rejects unsupported chains, non-canonical IDs, traversal, and uint256 overflow", () => {
    const overflow =
      "115792089237316195423570985008687907853269984665640564039457584007913129639936";

    expect(parseAgentRouteIdentity({ chainId: "1", tokenId: "7" })).toBeNull();
    expect(parseAgentRouteIdentity({ chainId: "56", tokenId: "007" })).toBeNull();
    expect(parseAgentRouteIdentity({ chainId: "56", tokenId: "1/../../stats" })).toBeNull();
    expect(parseAgentRouteIdentity({ chainId: "56", tokenId: overflow })).toBeNull();
  });
});
