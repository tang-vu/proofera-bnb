# ProofEra final demo runbook

Updated: 2026-08-17. This runbook prepares the required demo asset; it is not evidence that a final
video or hackathon entry exists.

## Gate order

The final capture deliberately avoids circular proof. Before it can run, the exact committed
`evidence/submission/readiness.json` must mark production release, agent registration, Altana
lifecycle, Pancake benefit, and all three TermiX pairs `verified`, with no blockers. The demo must
still be `not_recorded`, the submission must still be `draft`, and the top-level readiness flag must
remain false.

The capture then requires all of the following:

- clean `HEAD`, equal to `origin/main` and the exact public `/api/health` build;
- a narration file committed under `evidence/submission/narration/` at that same release;
- six fixed public browser scenes at 1440x900;
- one video stream and one audio stream in the final MP4;
- a duration from 240 through 330 seconds;
- successful full video/audio decoding by FFmpeg;
- create-only output and a byte-level SHA-256 manifest.

The final manifest still says `hackathonEntrySubmitted: false` and `submissionReady: false`. A
timestamped clean-room playback check and authoritative submission receipt are separate artifacts.

## Commands

Use rehearsal mode to validate recording on a published exact release without closing the demo gate:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:demo:video $releaseCommit --mode rehearsal
```

Final mode is intentionally unavailable until the five prerequisite gates are verified:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:demo:video $releaseCommit --mode final `
  --voiceover evidence/submission/narration/proofera-final-demo.mp3
```

## Five-minute narration map

The final wording must be regenerated from retained receipts and paired-run values. Bracketed fields
must never be spoken until their exact artifacts exist.

### 0:00-0:32 — The trust gap

“Autonomous financial agents can now own wallets and transact, but an identity and a description do
not tell a capital owner whether an agent deserves authority. ProofEra is the evidence and control
layer between ERC-8004 identity and capital access. Its rule is simple: missing evidence stays
missing.”

Show the landing page, the four financial jobs, and the proof-first promise.

### 0:32-1:16 — Discover by job

“A user starts with the outcome they need: manage concentrated liquidity, run a bounded grid, compare
yield, or protect a Venus loan. Each category has its own decision contract because LP range time,
grid drawdown, withdrawal liquidity, and health factor cannot be compressed into one misleading
return score.”

Show the marketplace and the four registered identity links: `[FOUR ERC-8004 IDS]`.

### 1:16-2:04 — Inspect evidence and downside

“This LP Passport separates sourced observations, calculations, freshness, costs, downside, and
unknowns. Here the agent detected `[FROZEN PANCAKE CONDITION]`. The controlled operation produced
`[PANCAKE RECEIPT]`; before-and-after value is reported net of `[GAS / FEES / SLIPPAGE / IL INPUTS]`,
not inferred from a logo or a backtest.”

Show the LP Passport, source links, environment labels, and limitations.

### 2:04-2:56 — Bound authority before activation

“Before activation, ProofEra fixes the chain, targets, selectors, spend cap, expiry, deadline, and
enforcement owner. The Altana session was registered at `[GRANT RECEIPT]`. The agent executed only the
declared call at `[EXECUTE RECEIPT]`. Unknown outcomes are reconciled; they are never blind-retried.”

Show configuration and the exact permission bundle. Do not expose private signer material.

### 2:56-4:02 — Verify every claim

“The Proof Room is a closure ledger, not a marketing page. Every gate links to its retained artifact
and SHA-256. Three preregistered TermiX pairs compare the same frozen tasks across agent and manual
lanes. The measured results are `[THREE TIME / COST / QUALITY RESULTS]`; the limitations are
`[ADJUDICATED LIMITATIONS]`. No winner is narrated unless both lanes and their receipts validate.”

Show receipt links, paired results, and the exact production build.

### 4:02-4:50 — Revoke and prove absence

“Mission Control joins the execution status to onchain evidence, then revokes the scoped session at
`[REVOKE RECEIPT]`. ProofEra does not call revoke complete merely because a button was pressed. Both
RPCs re-observed that the key was absent after finality at `[NEGATIVE AUTHORITY CHECKPOINT]`. This is
the full loop: discover, verify, bound, execute, measure, reconcile, and revoke.”

Show the lifecycle timeline and negative-authority evidence.

### 4:50-5:00 — Close

“BNB Agent Studio makes autonomous agents easier to create. ProofEra makes them safer to choose and
control. Hire agents by proof, not promises.”

End on the public product URL and repository URL.

## Clean-room playback

After committing the final video and manifest, copy or download the exact retained MP4 on a separate
viewer boundary, recompute SHA-256, play it from beginning to end, verify audio intelligibility and
all explorer/source links, and retain the timestamped result. This check may validate presentation;
it cannot add a missing receipt or repair unsupported narration.
