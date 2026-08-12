import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as serverBoundary from "@proofera/integrations/server/bsc-testnet-pta-deployment-observation";

import * as browserSafeRoot from "./index";

describe("BSC testnet PTA deployment observation package boundary", () => {
  it("exports only the fixed read-only observation surface", () => {
    expect(Object.keys(serverBoundary).sort()).toEqual([
      "BSC_TESTNET_PTA_DEPLOYMENT_OBSERVATION_RELEASE_READINESS",
      "prepareBscTestnetPtaDeploymentObservation"
    ]);
  });

  it("keeps RPC coordination and deployment-envelope machinery out of the browser root", () => {
    const rootKeys = Object.keys(browserSafeRoot);
    for (const forbidden of [
      "BSC_TESTNET_PTA_DEPLOYMENT_OBSERVATION_RELEASE_READINESS",
      "buildBscTestnetPtaDeploymentEnvelope",
      "coordinateBscTestnetPtaDeploymentForTests",
      "prepareBscTestnetPtaDeploymentEnvelope",
      "prepareBscTestnetPtaDeploymentObservation"
    ]) {
      expect(rootKeys).not.toContain(forbidden);
    }
  });

  it("does not overstate deployment or signing readiness", () => {
    expect(serverBoundary.BSC_TESTNET_PTA_DEPLOYMENT_OBSERVATION_RELEASE_READINESS).toEqual({
      deploymentReady: false,
      fundingVerified: false,
      readOnlyTwoProviderObservationImplemented: true,
      releaseReady: false,
      signerImplemented: false,
      transactionBroadcastImplemented: false
    });
  });
});
