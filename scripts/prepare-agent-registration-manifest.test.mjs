import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./prepare-agent-registration-manifest.mjs", import.meta.url),
  "utf8"
);
const prettierIgnore = await readFile(new URL("../.prettierignore", import.meta.url), "utf8");

test("registration preparation is read-only, exact-flagged, and create-only", () => {
  assert.match(source, /--prepare-exact-registration-manifest/u);
  assert.match(source, /--source-base-commit/u);
  assert.match(source, /flag: "wx"/u);
  assert.doesNotMatch(
    source,
    /eth_sendRawTransaction|eth_sendTransaction|privateKey|WALLET_PASSWORD/u
  );
  assert.match(prettierIgnore, /^evidence\/erc8004\/preparations\/\*\.json$/mu);
});

test("registration preparation fixes the reviewed chain, registry, SDK and wallets", () => {
  assert.match(source, /const CHAIN_ID = 97/u);
  assert.match(source, /0x8004A818BFB912233c491871b3d84c89A494BD9e/u);
  assert.match(source, /const SDK_VERSION = "0\.4\.2"/u);
  assert.match(source, /register\(string,\(string,bytes\)\[\]\)/u);
  assert.match(source, /setAgentURI\(uint256,string\)/u);
  for (const wallet of [
    "0xAd03eF7e21c35FD1446c153f6eE5e6165F696990",
    "0xFBfFa9BA36d578AFF2d05EDe840Fc7088e70ADB8",
    "0x62Af37A6FD89374684C00e2402FD96143f96ee85",
    "0x708cb7F2b974d94005E762A140c469F1125e0cB4"
  ]) {
    assert.match(source, new RegExp(wallet, "u"));
  }
});

test("registration preparation binds the exact public agent metadata and skill contracts", () => {
  assert.match(source, /ProofEra LP Risk Evidence Agent/u);
  assert.match(
    source,
    /Deterministic, read-only PancakeSwap LP range and scoped permission evidence analysis on BSC mainnet and testnet\./u
  );
  for (const skillId of [
    "analyze_lp_range",
    "audit_altana_permission_bundle",
    "analyze_grid_trading",
    "analyze_yield_opportunities",
    "analyze_venus_health_factor"
  ]) {
    assert.match(source, new RegExp(`skills: \\[?[^\\]]*${skillId}|${skillId}`, "u"));
  }
  assert.match(source, /skillIds\.length !== agent\.skills\.length/u);
  assert.match(source, /skillId !== agent\.skills\[index\]/u);
});

test("registration preparation requires two-provider agreement and preserves unknown step two", () => {
  assert.match(source, /data-seed-prebsc-2-s2\.binance\.org/u);
  assert.match(source, /bsc-testnet-rpc\.publicnode\.com/u);
  assert.match(source, /ERC8004_PROVIDER_BLOCK_HASH_MISMATCH/u);
  assert.match(source, /ERC8004_PROVIDER_STATE_MISMATCH/u);
  assert.match(source, /not_knowable_before_confirmed_registration/u);
  assert.match(source, /registrationAuthorized: false/u);
  assert.match(source, /registrationReceiptEvidence: false/u);
});

test("retained registration preparation proves only read-only preflight state", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL(
        "../evidence/erc8004/preparations/125490457-four-agent-registration-preparation.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  assert.equal(manifest.schemaVersion, "proofera-erc8004-registration-preparation-v1.0.0");
  assert.deepEqual(manifest.classification, {
    artifact: "read_only_preparation",
    fundingExecuted: false,
    registrationExecuted: false,
    registrationReceiptEvidence: false,
    signingPerformed: false
  });
  assert.equal(manifest.sourceBaseCommit, "0f078022fca1eddc0b2427b047c3c7898c2d0cc4");
  assert.equal(manifest.network.chainId, 97);
  assert.equal(manifest.network.blockNumber, "125490457");
  assert.equal(
    manifest.network.blockHash,
    "0x468d5912d25a475727033e41a8bf0c673750ad3ff8ea2befb79b8024a5ae76a0"
  );
  assert.equal(manifest.network.providers.length, 2);
  assert.deepEqual(manifest.costBoundary.observedGasPriceWeiByProvider, {
    "bnb-chain": "100000000",
    publicnode: "100000000"
  });
  assert.equal(manifest.costBoundary.observedGasPriceWithinCap, true);
  assert.equal(manifest.costBoundary.fundingTotalWei, "12000000000000000");
  assert.equal(manifest.costBoundary.maximumRegistrationGasCostAllAgentsWei, "1600000000000000");
  assert.equal(manifest.agents.length, 4);

  for (const agent of manifest.agents) {
    assert.deepEqual(
      agent.observations.map(({ balanceWei, nonce, ownedAgentCount, registerGasEstimate }) => ({
        balanceWei,
        nonce,
        ownedAgentCount,
        estimateStatus: registerGasEstimate.status
      })),
      [
        { balanceWei: "0", estimateStatus: "available", nonce: "0", ownedAgentCount: "0" },
        { balanceWei: "0", estimateStatus: "available", nonce: "0", ownedAgentCount: "0" }
      ]
    );
    assert.equal(
      agent.observations[0].registerGasEstimate.gas,
      agent.observations[1].registerGasEstimate.gas
    );
    assert.equal(agent.readiness.status, "blocked_unfunded");
    assert.equal(agent.readiness.alreadyRegistered, false);
    assert.equal(agent.readiness.funded, false);
    assert.equal(agent.readiness.registrationAuthorized, false);
    assert.equal(agent.initialRegistration.transaction.calldata.slice(0, 10), "0x8ea42286");
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(agent.initialRegistration.transaction.calldata.slice(2), "hex"))
        .digest("hex"),
      agent.initialRegistration.transaction.calldataBytesSha256
    );
    assert.equal(agent.completionTemplate.calldata, null);
    assert.equal(agent.completionTemplate.gasEstimate, null);
    assert.equal(
      agent.completionTemplate.calldataStatus,
      "not_knowable_before_confirmed_registration"
    );
  }
  const allowedMethods = new Set([
    "eth_blockNumber",
    "eth_call",
    "eth_chainId",
    "eth_estimateGas",
    "eth_gasPrice",
    "eth_getBalance",
    "eth_getBlockByNumber",
    "eth_getCode",
    "eth_getTransactionCount"
  ]);
  assert.equal(manifest.rpcTranscript.length, 42);
  for (const exchange of manifest.rpcTranscript) {
    assert.ok(allowedMethods.has(exchange.request.method));
    assert.equal(exchange.response.error, undefined);
  }
});

test("current registration preparation binds the five deployed skill contracts", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL(
        "../evidence/erc8004/preparations/125530553-four-agent-registration-preparation.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  assert.equal(manifest.sourceBaseCommit, "e10e2415dac8deb183dcc2fbdf7bd09fe0f44fc4");
  assert.equal(manifest.network.blockNumber, "125530553");
  assert.equal(
    manifest.network.blockHash,
    "0x2611ead874d30b1f38bfbac2103fa1dac095a0e9a35a4fc127103b88071706b3"
  );
  assert.equal(manifest.rpcTranscript.length, 42);
  assert.deepEqual(
    manifest.agents.map((agent) => ({
      key: agent.key,
      skills: JSON.parse(agent.publicSurface.agentCard.responseBody).skills.map(({ id }) => id),
      status: agent.readiness.status
    })),
    [
      {
        key: "lp-range",
        skills: ["analyze_lp_range", "audit_altana_permission_bundle"],
        status: "blocked_unfunded"
      },
      {
        key: "grid-trading",
        skills: ["analyze_grid_trading"],
        status: "blocked_unfunded"
      },
      {
        key: "yield-optimisation",
        skills: ["analyze_yield_opportunities"],
        status: "blocked_unfunded"
      },
      {
        key: "health-factor",
        skills: ["analyze_venus_health_factor"],
        status: "blocked_unfunded"
      }
    ]
  );
});
