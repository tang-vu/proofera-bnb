import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./collect-termix-venus-exact-block.ts", import.meta.url),
  "utf8"
);

test("Venus collector is fixed to two public testnet providers and one official Comptroller", () => {
  assert.match(source, /https:\/\/bsc-testnet-rpc\.publicnode\.com/);
  assert.match(source, /https:\/\/bsc-testnet-dataseed\.bnbchain\.org/);
  assert.match(source, /VENUS_CORE_POOL_BSC_DEPLOYMENTS\[97\]\.comptroller/);
  assert.match(source, /buildVenusCoreExactBlockEvidence/);
});

test("Venus collector stays read only and writes only an explicit development artifact", () => {
  assert.doesNotMatch(
    source,
    /createWalletClient|sendTransaction|writeContract|signTransaction|privateKeyToAccount/
  );
  assert.match(source, /--write-development-evidence/);
  assert.match(source, /if \(options\.writeDevelopmentEvidence\)/);
  assert.match(source, /COLLECTOR_DIRTY_WORKTREE/);
  assert.match(source, /flag: "wx"/);
  assert.match(source, /publishable: false/);
  assert.match(source, /termixRunStatus: "NOT_RUN"/);
});

test("Venus collector retains exact-block raw inputs and explicit oracle unavailability", () => {
  for (const field of [
    "accountSnapshotErrorCode",
    "vTokenBalanceRaw",
    "borrowBalanceRaw",
    "exchangeRateMantissaRaw",
    "effectiveLiquidationThresholdMantissaRaw",
    "oraclePriceStatus",
    "oraclePriceMantissaRaw",
    "transcriptSha256"
  ]) {
    assert.match(source, new RegExp(field));
  }
  assert.match(source, /blockNumber/);
  assert.match(source, /block\.hash/);
  assert.match(source, /vaiRepayAmountRaw/);
});

test("Venus collector captures an ordered finalized window before one create-only write", () => {
  assert.match(source, /--blocks/);
  assert.match(source, /COLLECTOR_BLOCK_WINDOW_INVALID/);
  assert.match(source, /block <= \(parsed\[position - 1\] \?\? 0n\)/);
  assert.match(source, /for \(const block of fixedBlocks\)/);
  assert.match(source, /block > minimumHead - FINALITY_BLOCKS/);
  assert.match(source, /proofera-termix-venus-development-window-v1\.0\.0/);
  assert.match(source, /venus-core-exact-window-/);
  assert.match(source, /observationCount: evidenceWindow\.length/);
  assert.match(source, /writeFile\(path/);
});

test("Venus collector can acquire a live window without historical-state substitution", () => {
  assert.match(source, /--live-window/);
  assert.match(source, /COLLECTOR_LIVE_WINDOW_INVALID/);
  assert.match(source, /observations < 3/);
  assert.match(source, /spacingSeconds < 60/);
  assert.match(source, /minimumProviderHead/);
  assert.match(source, /block <= previous/);
  assert.match(source, /await waitMilliseconds\(options\.liveWindow\.spacingSeconds \* 1_000\)/);
  assert.doesNotMatch(source, /archive fallback|fixture fallback/i);
});
