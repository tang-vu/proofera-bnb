import { readFile } from "node:fs/promises";

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

  it("keeps RPC, signing, post-claim, and submission machinery out of the browser-safe root", () => {
    const rootKeys = Object.keys(browserSafeRoot);
    for (const forbidden of [
      "prepareBscTestnetPtaWbnbPoolInitializationEnvelope",
      "coordinateBscTestnetPtaWbnbPoolInitializationForTests",
      "describeBscTestnetPtaWbnbPoolOneShotBoundary",
      "createBscTestnetPtaWbnbPoolProductionAuthorizationGate",
      "createBscTestnetPtaWbnbPoolProductionOneShotSignerCore",
      "createBscTestnetPtaWbnbPoolProductionPostClaimRechecker",
      "createBscTestnetPtaWbnbPoolPostClaimRecheckerForTests",
      "createBscTestnetPtaWbnbPoolSubmissionCoreForTests",
      "createProductionBscTestnetPtaWbnbPoolSubmissionCore",
      "createWindowsBscTestnetPtaWbnbPoolLocalJournal",
      "createWindowsBscTestnetPtaWbnbPoolSigningWorker",
      "BscTestnetPtaWbnbPoolProductionSubmissionUnavailableError",
      "reconcileBscTestnetPtaWbnbPoolEvidenceForInternalUse"
    ]) {
      expect(rootKeys).not.toContain(forbidden);
    }
  });

  it("does not publish post-claim or submission modules as package subpaths", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8")
    ) as { exports?: Record<string, unknown> };
    const exportKeys = Object.keys(packageJson.exports ?? {});
    const exportTargets = Object.values(packageJson.exports ?? {});

    expect(exportKeys).not.toContain("./server/bsc-testnet-pta-wbnb-pool-post-claim-recheck");
    expect(exportKeys).not.toContain("./server/bsc-testnet-pta-wbnb-pool-submission-reconciler");
    expect(exportTargets).not.toContain(
      "./src/bsc-testnet-pta-wbnb-pool-post-claim-recheck.server.ts"
    );
    expect(exportTargets).not.toContain(
      "./src/bsc-testnet-pta-wbnb-pool-submission-reconciler.server.ts"
    );
  });
});
