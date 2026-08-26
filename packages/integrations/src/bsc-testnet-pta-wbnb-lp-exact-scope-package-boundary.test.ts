import * as publicSurface from "@proofera/integrations";
import { describe, expect, it } from "vitest";

import * as serverSurface from "./bsc-testnet-pta-wbnb-lp-exact-scope";

describe("BSC testnet PTA/WBNB LP exact-scope package boundary", () => {
  it("keeps the RPC preparer off the browser-compatible package surface", () => {
    expect("prepareBscTestnetPtaWbnbLpExactScope" in publicSurface).toBe(false);
    expect(typeof serverSurface.prepareBscTestnetPtaWbnbLpExactScope).toBe("function");
    expect(typeof serverSurface.createFixedOfficialBscTestnetPtaWbnbLpRpcClients).toBe("function");
  });
});
