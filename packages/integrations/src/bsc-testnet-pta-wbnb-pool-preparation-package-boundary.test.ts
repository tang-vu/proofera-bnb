import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as serverBoundary from "@proofera/integrations/server/bsc-testnet-pta-wbnb-pool-preparation";

import * as browserSafeRoot from "./index";

describe("BSC testnet PTA/WBNB pool preparation package boundary", () => {
  it("exports only the fixed read-only preparation function", () => {
    expect(Object.keys(serverBoundary).sort()).toEqual([
      "prepareBscTestnetPtaWbnbPoolInitializationEnvelope"
    ]);
  });

  it("keeps RPC preparation and future one-shot specifications out of the browser-safe root", () => {
    const rootKeys = Object.keys(browserSafeRoot);
    for (const forbidden of [
      "prepareBscTestnetPtaWbnbPoolInitializationEnvelope",
      "coordinateBscTestnetPtaWbnbPoolInitializationForTests",
      "describeBscTestnetPtaWbnbPoolOneShotBoundary",
      "createBscTestnetPtaWbnbPoolProductionAuthorizationGate",
      "createBscTestnetPtaWbnbPoolProductionOneShotSignerCore",
      "createWindowsBscTestnetPtaWbnbPoolLocalJournal",
      "createWindowsBscTestnetPtaWbnbPoolSigningWorker"
    ]) {
      expect(rootKeys).not.toContain(forbidden);
    }
  });
});
