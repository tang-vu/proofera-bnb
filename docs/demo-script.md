# ProofEra judge demo script

Updated: 2026-08-17. This is the target five-minute script, not a claim that the final run exists. The marketplace, four public read-only analyzers, category dossiers/configuration surfaces, and `/proof` judge evidence index are live. A six-scene public-browser rehearsal is retained, but it is not a video or final demo check. Permission confirmation, activation, execution, populated Mission Control, revoke, registered identities, paired runs, and every bracketed evidence field remain unavailable until their real receipt/run paths are completed and verified.

## Retained public rehearsal

The create-only rehearsal at [`evidence/submission/rehearsals/b0e46cc192fbf15220a557c4b5bc8639c3c75eba/manifest.json`](../evidence/submission/rehearsals/b0e46cc192fbf15220a557c4b5bc8639c3c75eba/manifest.json) binds production commit `b0e46cc192fbf15220a557c4b5bc8639c3c75eba`, HTTP 200 responses, asserted text, and SHA-256 values for full-page captures of home, marketplace, LP dossier, LP configuration, proof room, and empty Mission Control. It deliberately records `videoRecorded: false`, `finalDemoCheck: false`, and `submissionReady: false`.

Reproduce only from a clean commit already published to `origin/main` and deployed as the exact public build:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:demo:rehearsal $releaseCommit
```

This command performs GET-only browser navigation and creates a new commit-named directory. It does not click, fill a form, connect a wallet, submit a transaction, authenticate evidence, or replace the final video plus timestamped clean-room playback check.

## Pre-demo truth check

- Public URL and four agent endpoints healthy through the judging window.
- Final build commit and data-source timestamps recorded.
- Testnet/mainnet badges visible and accurate.
- Altana wallet, key, grant, execute and revoke explorer links open in clean tabs.
- Pancake pool/position and TermiX raw run manifests open.
- No control depends on a fixture, placeholder endpoint or pre-seeded fake hash.
- The permission preview and activation controls are visibly wired to the server-owned policy and live authority state; the current standalone model/renderer is not sufficient to run this segment.
- `/proof` shows the exact final build, all seven closure gates, four Agent Cards/skills, and no `verified` gate unless `pnpm submission:require-ready` passes on the clean published release.

## 0:00–0:35 — thesis and intent

“Agent directories tell you who claims to exist. ProofEra answers whether an agent deserves authority over capital.” Start from “automate a CAKE/BNB LP,” then set capital, balanced risk, horizon and assets. Point out that the marketplace begins from a financial job, not protocol vocabulary.

Open `/proof` briefly before leaving the thesis: the judge can see the public build, exact agent skills, artifact hashes, and every still-open receipt gate without relying on narration.

## 0:35–1:25 — live discovery and evidence

Show the live ERC-8004/8004scan source timestamp and an unavailable/empty-state distinction. Open one source record. Explain that identity is observed but capability remains unverified until endpoint, activity and evidence checks pass. Open the curated LP Passport and show source/method/time/freshness/null states for range time, fee APR, IL estimate, rebalance frequency, gas drag and net outcome.

Show Proof Score formula/version, missing-evidence penalty and sample/confidence warning. Compare two to four agents; highlight worst outcome, permissions, costs and why the highest return is not automatically recommended.

## 1:25–2:30 — configure and inspect authority

Choose the curated testnet LP agent. Configure capital, range limits, slippage, deadline and expiry. The permission preview leads with worst case: target/function rows, raw token cap per period, wallet/recipient, network, code identity and revoke consequence.

Identify enforcement owner for every rule: Altana/onchain, ProofEra runtime, or wallet confirmation. Show that generic routers/multicall are denied and the decoded direct Position Manager operation matches the policy hash. Confirm with the passkey only after the judge sees the exact scope.

## 2:30–3:30 — execute and prove outcome

Show grant state and Keystore authority read. If the grant is uncertain, demonstrate that ProofEra disables retry/action and probes instead; never force a happy path. Run the current simulation, then the pre-funded minimal testnet action. Show `callsId`, transaction status, BscScan details and Altana explorer [LINKS TO INSERT].

Open Mission Control: allocation, outcome/cost, session cap/expiry and source-linked Proof Stream. Show that a pending state does not look confirmed.

## 3:30–4:05 — revoke

Request revoke with the admin passkey. While pending, show the authority as still active/pending. After account/Keystore reads confirm invalidity, show revoked state and a negative execution attempt [RECEIPT/LINK TO INSERT]. Explain recovery fallback on the final RP-ID domain.

## 4:05–4:35 — partner advantage

Show the Pancake before/after or agent/manual result net of gas, fees and slippage [RUN ID]. Open TermiX's three paired task manifests, including LP trading and permission security, with time/cost/quality and raw evidence. Show Altana explorer session evidence. Mention ERC-8183/x402 only if their real, current flows are complete.

## 4:35–5:00 — equal depth and adoption

Switch across LP, grid, yield and health passports to show the same trust/permission/state primitives and genuinely category-specific metrics. Close with maintainability: typed adapters, no silent mock fallback, source provenance, durable Studio-hosted agents and a clean path for third-party ERC-8004 ingestion.

## Failure-safe narration

An upstream outage is a demo feature only in the sense that ProofEra tells the truth: show unavailable/last-good stale, timestamp and confidence reduction. Do not switch to a fixture. A rejected biometric returns to configuration. A reverted or unknown transaction stays failed/unknown with no invented hash and no blind retry.
