import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agents = [
  ["lpRangeAgent", "proofera-lp.tangvu.dev", "0xAd03eF7e21c35FD1446c153f6eE5e6165F696990"],
  ["gridTradingAgent", "proofera-grid.tangvu.dev", "0xFBfFa9BA36d578AFF2d05EDe840Fc7088e70ADB8"],
  [
    "yieldOptimisationAgent",
    "proofera-yield.tangvu.dev",
    "0x62Af37A6FD89374684C00e2402FD96143f96ee85"
  ],
  [
    "healthFactorGuardianAgent",
    "proofera-health.tangvu.dev",
    "0x708cb7F2b974d94005E762A140c469F1125e0cB4"
  ]
];

for (const [directory, hostname, address] of agents) {
  test(`${directory} has registration-safe public metadata`, async () => {
    const manifest = await readFile(
      path.join(repositoryRoot, "agents", directory, "app", "agent", "studio.toml"),
      "utf8"
    );

    assert.match(manifest, /^protocol = "A2A"$/mu);
    assert.match(manifest, /^protocols = \["A2A", "MCP"\]$/mu);
    assert.match(manifest, /^default = "bsc-testnet"$/mu);
    assert.match(
      manifest,
      new RegExp(`^endpoint = "https://${hostname.replaceAll(".", "\\.")}/"$`, "mu")
    );
    assert.match(manifest, /^kind = "evm-local"$/mu);
    assert.match(manifest, /^signer = "local"$/mu);
    assert.match(manifest, /^keystore_dir = "\.\.\/\.\.\/\.studio\/wallets"$/mu);
    assert.match(manifest, new RegExp(`^address = "${address}"$`, "mu"));
    assert.doesNotMatch(manifest, /private[_-]?key|wallet[_-]?password/i);
  });
}
