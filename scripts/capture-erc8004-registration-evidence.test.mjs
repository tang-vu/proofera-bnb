import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL("./capture-erc8004-registration-evidence.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const source = await readFile(scriptUrl, "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const prettierIgnore = await readFile(new URL("../.prettierignore", import.meta.url), "utf8");

test("registration evidence capture is exact-release gated, read-only and create-only", () => {
  assert.match(source, /--capture-exact-four-agent-registration/u);
  assert.match(source, /--source-base-commit/u);
  assert.match(source, /--preparation/u);
  assert.match(source, /rev-parse", "origin\/main/u);
  assert.match(source, /status", "--porcelain=v1", "--untracked-files=all/u);
  assert.match(source, /merge-base", "--is-ancestor/u);
  assert.match(source, /flag: "wx"/u);
  assert.equal(
    packageJson.scripts["capture:erc8004:registration"],
    "node ./scripts/capture-erc8004-registration-evidence.mjs --capture-exact-four-agent-registration --source-base-commit"
  );
  assert.match(prettierIgnore, /^evidence\/erc8004\/registrations\/\*\.json$/mu);
  assert.doesNotMatch(
    source,
    /eth_sendRawTransaction|eth_sendTransaction|wallet_|privateKey|WALLET_PASSWORD/u
  );
});

test("registration evidence capture fixes four wallets, two providers and final state joins", () => {
  for (const key of ["lp-range", "grid-trading", "yield-optimisation", "health-factor"]) {
    assert.match(source, new RegExp(key, "u"));
  }
  assert.match(source, /data-seed-prebsc-2-s2\.binance\.org/u);
  assert.match(source, /bsc-testnet-rpc\.publicnode\.com/u);
  assert.match(source, /eth_getTransactionByHash/u);
  assert.match(source, /eth_getTransactionReceipt/u);
  assert.match(source, /functionName: "ownerOf"/u);
  assert.match(source, /functionName: "tokenURI"/u);
  assert.match(source, /functionName: "balanceOf"/u);
  assert.match(source, /ownedAgentCount !== 1n/u);
  assert.match(source, /marketplaceEligibilityProven: false/u);
  assert.match(source, /hireReceiptEvidence: false/u);
  assert.match(source, /executionAuthority: false/u);
});

test("registration evidence capture rejects missing invocation before Git or network", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERC8004_REGISTRATION_EVIDENCE_EXACT_INVOCATION_REQUIRED/u);
  assert.doesNotMatch(
    result.stderr,
    /ERC8004_REGISTRATION_EVIDENCE_(HEAD_MISMATCH|RPC_HTTP_INVALID)/u
  );
});
