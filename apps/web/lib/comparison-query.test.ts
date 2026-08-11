import { describe, expect, it } from "vitest";

import { parseComparisonSelection } from "./comparison-query";

describe("parseComparisonSelection", () => {
  it("accepts two to four unique exact BSC identities in order", () => {
    expect(parseComparisonSelection({ agent: ["56:7", "97:8", "56:9", "97:10"] })).toEqual({
      status: "ready",
      agents: [
        { chainId: 56, tokenId: "7" },
        { chainId: 97, tokenId: "8" },
        { chainId: 56, tokenId: "9" },
        { chainId: 97, tokenId: "10" }
      ]
    });
  });

  it("accepts the repeated legacy agents parameter without changing exact IDs", () => {
    const maximum =
      "115792089237316195423570985008687907853269984665640564039457584007913129639935";

    expect(parseComparisonSelection({ agents: [`56:${maximum}`, "97:0"] })).toEqual({
      status: "ready",
      agents: [
        { chainId: 56, tokenId: maximum },
        { chainId: 97, tokenId: "0" }
      ]
    });
  });

  it("rejects mixed canonical and legacy parameter names as ambiguous", () => {
    expect(parseComparisonSelection({ agent: "56:7", agents: "97:8" })).toEqual({
      status: "invalid",
      reason: "ambiguous_query",
      agents: []
    });
  });

  it("deduplicates identities and then enforces the minimum", () => {
    expect(parseComparisonSelection({ agent: ["56:7", "56:7"] })).toEqual({
      status: "invalid",
      reason: "too_few",
      agents: [{ chainId: 56, tokenId: "7" }]
    });
  });

  it("rejects too many, unsupported chains, and malformed IDs before fetching", () => {
    expect(
      parseComparisonSelection({ agent: ["56:1", "56:2", "56:3", "56:4", "56:5"] })
    ).toMatchObject({ status: "invalid", reason: "too_many" });
    expect(parseComparisonSelection({ agent: ["1:1", "56:2"] })).toMatchObject({
      status: "invalid",
      reason: "invalid_identity"
    });
    expect(parseComparisonSelection({ agent: ["56:1:2", "56:3"] })).toMatchObject({
      status: "invalid",
      reason: "invalid_identity"
    });
    expect(parseComparisonSelection({ agent: ["56:1/../../stats", "56:3"] })).toMatchObject({
      status: "invalid",
      reason: "invalid_identity"
    });
  });
});
