# ProofEra judge demo script

Updated: 2026-08-22. This is the production script and shot list, not evidence that the final video has been recorded. Keep the final cut between 4:00 and 5:30. Never show a secret, wallet export, environment file, passkey credential payload, or session signer.

## Current recording boundary

Ready to show now:

- the public marketplace and four read-only analyzers;
- four receipt-verified ERC-8004 identities and three finalized testnet hires;
- the Proof Room with exact build, artifact paths, hashes, and honest blockers;
- all six retained TermiX raw captures, all three unverified observational pairs, and the independent-review packet;
- the local operator ceremony explaining why manual judgment, passkey presence, execution, and revoke are separate transitions.

Do not record the final cut yet. The following must exist first: controlled Pancake before/after evidence; independent adjudication and final compilation of all three TermiX pairs; final production freeze. The Altana lifecycle, all six raw TermiX lanes, three unverified pairs and reviewer handoff are retained, but none closes those remaining gates. Until then, use rehearsal mode only.

## One-session operator checklist

1. Close notifications, password managers, terminal history, and every tab that could reveal a secret.
2. Open the public product, BscScan receipt tabs, Proof Room, Mission Control, and the final TermiX report before recording.
3. Verify `pnpm submission:check`; final recording is allowed only when its first five gates are `verified` and the demo gate is `not_recorded`.
4. Record at 1440x900 with browser zoom 100%. Keep the cursor deliberate and avoid scrolling while speaking.
5. Use the committed MP3 voice-over with the exact-release capture command in `docs/final-demo.md`.
6. Play the generated MP4 end to end on a separate viewer boundary and retain the clean-room check before submission.

## 0:00-0:30 — thesis

Visual: landing page, then the four financial jobs.

Narration: “Agent registries prove that an identity exists. They do not prove that an agent deserves authority over capital. ProofEra is the evidence and control layer between ERC-8004 identity and a user’s wallet. Its governing rule is simple: missing evidence stays missing.”

## 0:30-1:10 — discover by job

Visual: marketplace and one LP Passport; briefly switch across grid, yield, and health.

Narration: “Users start with a financial outcome: manage concentrated liquidity, run a bounded grid, compare sustainable yield, or protect a Venus loan. Each category exposes decision-useful metrics, sources, freshness, downside, costs, and unknowns. One return number cannot safely represent four different jobs.”

Show all four testnet identity links. Say only that registration and paid hires are verified; do not equate either with performance.

## 1:10-1:55 — evidence before score

Visual: LP Range Passport and the public-position raw capture.

Narration: “For this frozen Pancake position, the exact-block replay places the current tick one tick above the lower boundary. The analyzer returns insufficient evidence because projected fees, gas, and slippage are missing. ProofEra refuses to turn a range trigger into a profit claim.”

Show the source block, exact-hash read, decision, limitations, and testnet/mainnet labels. Do not claim ownership of the public position.

## 1:55-2:45 — bound authority

Visual: LP activation configuration and permission preview.

Narration: “Before authority exists, ProofEra fixes the chain, direct target, selector, token and recipient, spend cap, deadline, expiry, quote age, and enforcement owner. Generic routers and undeclared multicalls are denied. The admin passkey remains in the browser; the scoped session signer belongs only in the encrypted worker boundary.”

After the real lifecycle exists, show the exact grant and execute explorer links. Never expose calldata containing secrets or signer material.

## 2:45-3:25 — execute, reconcile, revoke

Visual: Mission Control lifecycle timeline, execute receipt, revoke receipt, and negative-authority probe.

Narration: “A button press is not a receipt. ProofEra treats pending and unknown outcomes explicitly and never blind-retries an uncertain grant. The bounded action is joined to its finalized receipt. Revoke is complete only after both the revoke receipt and a fresh onchain probe show that the scoped session no longer has authority.”

If any receipt is pending or missing during rehearsal, show the honest blocked state and skip the claim.

## 3:25-4:20 — measured agent advantage

Visual: final TermiX paired report, then raw LP and Venus captures.

Narration template: “Three tasks were preregistered before execution: Pancake LP range analysis, an Altana permission audit, and Venus health-factor replay. The same frozen evidence and rubric are used for agent and manual lanes. [Insert only the final adjudicated time, cost, and quality values.] Raw outputs and reviewer limitations remain linked, so the comparison can be reproduced instead of trusted as marketing.”

Do not narrate a winner until the compiler accepts all three pairs and their independent adjudications.

## 4:20-5:00 — proof and close

Visual: Proof Room, exact build, seven gates, then product URL.

Narration: “The Proof Room is a closure ledger, not a victory page. Every verified gate links to retained evidence and a SHA-256; every missing gate stays visible. BNB Agent Studio makes autonomous agents easier to create. ProofEra makes them safer to choose, bound, observe, and revoke. Hire agents by proof, not promises.”

## Rehearsal command

Run only from a clean commit already pushed and deployed as the exact public build:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:demo:video $releaseCommit --mode rehearsal
```

The final MP4 command remains gated and is documented in `docs/final-demo.md`.

## Failure-safe rule

An upstream outage, rejected passkey, reverted transaction, or missing receipt is shown as unavailable, rejected, failed, or unknown with its timestamp. Never switch to a fixture, paste a fabricated hash, or narrate an intended result as completed.
