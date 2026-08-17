import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const runnerPath = "scripts/execute-approved.mjs";
const source = readFileSync(runnerPath, "utf8");

test("execution runner refuses before preparation, Git, RPC, or custody without exact flag", () => {
  const result = spawnSync(process.execPath, [runnerPath], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR
    }
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    event: "stopped",
    code: "HIRE_EXECUTION_EXACT_FLAG_REQUIRED"
  });
});

test("runner fixes chain, source, registry, providers, approval, gas and task owners", () => {
  for (const marker of [
    "const CHAIN_ID = 97n;",
    'const SOURCE = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49";',
    'const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";',
    'const APPROVAL_ID = "HIRE-TERMIX-2026-08-17-V5";',
    'const DEPLOYMENT_TX_HASH = "0x7fa5ad3e7b33dfb6dfccdfd06c6e54cc2d833d5aa005ec3f01c98cf72be3ddcf";',
    'url: "https://data-seed-prebsc-2-s2.binance.org:8545"',
    'url: "https://bsc-testnet-rpc.publicnode.com"',
    "const SIGNING_GAS_PRICE_WEI = 120_000_000n;",
    "const RECOVERY_MAX_TOTAL_SPEND_WEI = 150_000_000_000_000n;",
    '1825: "0xAd03eF7e21c35FD1446c153f6eE5e6165F696990"',
    '1828: "0x708cb7F2b974d94005E762A140c469F1125e0cB4"'
  ]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("recovery verifies the finalized deployment and unused engagements before any hire", () => {
  const preflightIndex = source.indexOf("async function preflight");
  const walletIndex = source.indexOf("const wallet = await loadWallet()");
  const prefix = source.slice(preflightIndex, walletIndex);
  assert.match(prefix, /materializeRuntimeBytecode\(artifact, REGISTRY\)/u);
  assert.match(prefix, /eth_getTransactionReceipt/u);
  assert.match(prefix, /eth_getTransactionByHash/u);
  assert.match(prefix, /receiptByEngagement/u);
  assert.match(prefix, /HIRE_EXECUTION_DEPLOYMENT_NOT_FINAL/u);
  assert.doesNotMatch(source, /sendOne\([^)]*"deploy"/u);
});

test("journal precedes broadcast and never persists raw signed bytes or secrets", () => {
  const journalIndex = source.indexOf("writeExclusive(journal");
  const broadcastIndex = source.indexOf('rpc(RPCS[0], "eth_sendRawTransaction"');
  assert.ok(journalIndex >= 0 && broadcastIndex > journalIndex);
  const journalBody = source.slice(journalIndex, broadcastIndex);
  assert.doesNotMatch(journalBody, /raw(?:Transaction)?\s*:/u);
  assert.doesNotMatch(source, /console\.log|privateKey\s*:/u);
  assert.match(source, /HIRE_EXECUTION_BROADCAST_OUTCOME_UNKNOWN/u);
  assert.match(source, /HIRE_EXECUTION_RECEIPT_PROVIDER_MISMATCH/u);
});

test("runner preserves the exact random password bytes across DPAPI and ethers", () => {
  assert.match(source, /Wallet\.fromEncryptedJson\([\s\S]*passwordBytes\s*\)/u);
  assert.doesNotMatch(source, /passwordBytes\.toString\s*\(/u);
  assert.match(source, /passwordBytes\.fill\(0\)/u);
  assert.match(source, /protectedBytes\.fill\(0\)/u);
});

test("runner binds committed preparation and unchanged published contract scope", () => {
  assert.match(source, /git\("status", "--porcelain"\)/u);
  assert.match(source, /git\("rev-parse", "origin\/main"\)/u);
  assert.match(source, /git", \["show", `HEAD:\$\{relativePath\}`\]/u);
  assert.match(source, /"merge-base", "--is-ancestor"/u);
  assert.match(source, /"diff", "--quiet"/u);
  assert.match(source, /HIRE_EXECUTION_PREPARATION_DRIFT/u);
});
