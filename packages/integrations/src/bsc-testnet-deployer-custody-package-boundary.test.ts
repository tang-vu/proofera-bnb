import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as serverBoundary from "@proofera/integrations/server/bsc-testnet-deployer-custody";

import * as browserSafeRoot from "./index";

describe("BSC testnet deployer custody package boundary", () => {
  it("exports only the reviewed server construction surface", () => {
    expect(Object.keys(serverBoundary).sort()).toEqual([
      "BSC_TESTNET_DEPLOYER_CUSTODY_RELEASE_READINESS",
      "BscTestnetDeployerCustodyServerError",
      "createWindowsBscTestnetDeployerCustodyProbe"
    ]);
  });

  it("keeps custody, DPAPI, file, and crypto machinery out of the browser-safe root", () => {
    const rootKeys = Object.keys(browserSafeRoot);
    for (const forbidden of [
      "BSC_TESTNET_DEPLOYER_CUSTODY_RELEASE_READINESS",
      "BscTestnetDeployerCustodyServerError",
      "createWindowsBscTestnetDeployerCustodyProbe",
      "parseBscTestnetDeployerEncryptedStore",
      "probeWindowsBscTestnetDeployerCustody",
      "unlockBscTestnetDeployerEncryptedStore"
    ]) {
      expect(rootKeys).not.toContain(forbidden);
    }
  });

  it("has no environment, wallet-client, signing, RPC, or broadcast implementation", async () => {
    const sourceNames = [
      "bsc-testnet-deployer-custody-core.ts",
      "bsc-testnet-deployer-custody-windows.server.ts",
      "bsc-testnet-deployer-custody.server.ts"
    ];
    const sources = await Promise.all(
      sourceNames.map((name) => readFile(new URL(name, import.meta.url), "utf8"))
    );
    const implementation = sources.join("\n");
    for (const forbidden of [
      "createWalletClient",
      "fetch(",
      "privateKeyToAccount",
      "process.env",
      "sendRawTransaction",
      "sendTransaction",
      "signMessage",
      "signTransaction",
      "signTypedData",
      "writeContract"
    ]) {
      expect(implementation).not.toContain(forbidden);
    }
    expect(implementation).not.toContain("console.log");
    expect(implementation).not.toContain("console.error");
  });

  it("rejects configuration without retaining or echoing path detail", () => {
    expect(() =>
      serverBoundary.createWindowsBscTestnetDeployerCustodyProbe({
        custodyDirectoryAbsolute: "relative"
      })
    ).toThrowError(serverBoundary.BscTestnetDeployerCustodyServerError);
    try {
      serverBoundary.createWindowsBscTestnetDeployerCustodyProbe({
        custodyDirectoryAbsolute: "relative"
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "CONFIGURATION_INVALID" });
      expect(JSON.stringify(error)).not.toContain("relative");
    }
  });
});
