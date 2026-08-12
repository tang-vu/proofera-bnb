import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createWindowsBscTestnetDeployerCustodyProbe } from "@proofera/integrations/server/bsc-testnet-deployer-custody";

const enabled = process.env.PROOFERA_RUN_LOCAL_DEPLOYER_CUSTODY === "1";

describe.skipIf(!enabled)("local BSC testnet deployer custody", () => {
  it("unlocks only far enough to confirm the pinned chain-97 address and then closes", async () => {
    const custodyDirectoryAbsolute = process.env.PROOFERA_LOCAL_DEPLOYER_CUSTODY_DIRECTORY;
    if (custodyDirectoryAbsolute === undefined) {
      throw new Error("The opt-in local custody paths are not configured.");
    }
    const probe = createWindowsBscTestnetDeployerCustodyProbe({ custodyDirectoryAbsolute });
    const readiness = await probe.probeReadiness();
    if (readiness.status === "unavailable") {
      throw new Error(`Local custody probe unavailable: ${readiness.reason}`);
    }
    expect(readiness).toMatchObject({
      address: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      chainId: 97,
      evidence: "local_unlock_and_address_match_only",
      status: "ready"
    });
    await expect(probe.close()).resolves.toEqual({ status: "closed" });
  }, 30_000);
});
