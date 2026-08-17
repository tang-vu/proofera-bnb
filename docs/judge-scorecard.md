# ProofEra judge scorecard

Updated: 2026-08-17. This is an internal pre-submission control sheet derived from the official Smart Money Era page review recorded in [`research.md`](./research.md). It is not a judging result, partner endorsement, or submission receipt. Every “current proof” item must remain independently inspectable; every open item blocks the corresponding claim.

## Top-1 thesis

ProofEra should win by demonstrating one coherent product loop rather than four disconnected integrations:

> Find an agent by financial job, inspect evidence and downside, grant narrowly bounded authority, observe the action and cost, compare agent value against a manual baseline, then revoke—with missing evidence remaining visible throughout.

The differentiator is not agent count. It is the evidence and authority layer between ERC-8004 identity and capital access. The strongest demo uses one Pancake LP journey to prove the full loop, then shows that the same trust model covers grid, yield, and health-factor agents without pretending their economic metrics are interchangeable.

## Main-track score control

| Judge signal                       | Current proof                                                                                                                                                    | Must close before final claim                                                                                               | Demo moment             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| End-to-end journey                 | Public landing, streamed marketplace, reference dossiers, four configuration surfaces, honest empty Mission Control, and `/proof` are live                       | Wire one registered/hired agent through permission preview, activation, receipt reconciliation, Mission Control, and revoke | 0:00–4:05               |
| Decision-useful live data          | Typed ERC-8004/8004scan ingestion; exact-block Pancake and Venus readers; explicit unavailable/stale/null states                                                 | Freeze current data timestamps and receipt-linked outcome/cost evidence for the judged action                               | 0:35–1:25 and 2:30–3:30 |
| Four first-class categories        | LP, grid, yield, and health each have a public analyzer, category contract, dossier, configuration surface, and exact Agent Card skill                           | Register all four on BSC and retain identity/marketplace evidence; do not imply equal execution history                     | 4:35–5:00               |
| Usability without Studio knowledge | Goal-first landing, plain-language mandate forms, permission ownership labels, failure-safe copy                                                                 | Clean-room run with a new viewer; retain mobile/keyboard evidence for the frozen release                                    | Throughout              |
| Trust and safety                   | Missing evidence lowers confidence; write targets/selectors/caps/expiry are explicit; unknown outcomes are not retried; revoke requires negative authority proof | Complete one real Altana grant/execute/revoke lifecycle and negative post-revoke attempt                                    | 1:25–4:05               |
| Production credibility             | Durable custom-domain deployment, PM2 supervision, exact-build public probe, proof room, six-scene rehearsal                                                     | Freeze final release, retain independent public probe/uptime record and rollback exercise                                   | Before recording        |

## Partner-track score control

### Altana

Eligibility story: an agent uses its own Altana session identity; calls, spend, and expiry are real; Keystore registration and session transactions are explorer-verifiable; inspection and revoke live in the product.

| Required evidence                        | Current state                                                                      | Closure artifact                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Agent-controlled scoped session identity | Public-descriptor and signer-handoff implementation tested; no live signer/session | Account/key explorer links plus authority probe                               |
| Real call allowlist, spend cap, expiry   | Exact SDK 0.7.0 policy and attestation boundaries implemented                      | Decoded grant receipt joined to exact policy                                  |
| Keystore registration                    | Two-provider readiness capture proves contracts/config only                        | Registered key record and fee-bearing receipt                                 |
| Real session transaction                 | Execute lifecycle and reconciliation code tested                                   | Altana `callsId`, BscScan receipt, decoded action                             |
| In-product inspection and revoke         | Honest empty Mission Control and revoke truth rule are public                      | Revoke receipt plus exact absent-authority probe and denied follow-up attempt |

No Altana partner claim is final until all five rows have the linked evidence.

### PancakeSwap

Eligibility story: prove a real, measurable benefit to an LP or trader; a logo or read-only integration is insufficient.

| Required evidence               | Current state                                                                             | Closure artifact                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Authentic Pancake product state | Exact-block public USDT/WBNB position capture and deterministic LP analysis retained      | Frozen controlled pool/position context                |
| Real bounded operation          | Direct V3 selector/calldata and at-most-once boundaries implemented; no operation receipt | Successful controlled testnet transaction receipt      |
| Before/after value              | Current capture identifies one-tick boundary risk but makes no performance claim          | Before/after range, fees, gas, slippage, and IL inputs |
| Fair alternative                | LP TermiX protocol is preregistered but not run                                           | Frozen manual baseline and adjudicated pair            |

### TermiX

Recorded rubric: service value 30%, measured agent advantage 30%, high-stakes category/track record 20%, and marketplace quality 20%. At least three real agent-versus-manual tasks must report time, cost, output quality, and raw outputs; at least one must be trading, equities, or security.

| Weighted signal                  | ProofEra design                                                           | Missing evidence                                               |
| -------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Service value — 30%              | Marketplace discovery plus fixed hire-gated agent lanes                   | Four registrations, verified hire receipts, final declarations |
| Measured advantage — 30%         | Deterministic paired schema, fixed timing/cost/rubric, no inferred winner | All six real method runs and independent adjudication          |
| High stakes / track record — 20% | Pancake LP, permission security, and Venus health protocols               | Receipt-complete task inputs and observation limitations       |
| Marketplace quality — 20%        | Public four-category UI, proof room, evidence-first controls              | Final zero-instruction hire journey and clean-room demo        |

The three frozen pairs are:

1. Pancake LP boundary decision versus manual analysis.
2. Altana/Pancake permission-security audit versus manual review.
3. Venus health-factor decision versus manual analysis.

Every method is still `NOT RUN`; no advantage may be narrated before the final paired report validates.

## Submission asset matrix

| Asset              | Current state                                                 | Final gate                                                 |
| ------------------ | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Public product     | Live on `proofera.tangvu.dev`; exact-build 11/11 probe passes | Freeze final commit and retain independent probe           |
| Four public agents | A2A/MCP endpoints and five skill IDs live                     | Four BSC registrations and hire evidence                   |
| Source repository  | Public, strict verification and evidence manifests            | Frozen release commit and hosted CI record                 |
| Proof room         | Public seven-gate ledger                                      | All seven gates verified by final artifacts                |
| Demo               | Six-scene exact-build rehearsal retained                      | Final video and timestamped clean-room playback check      |
| Pitch deck         | Draft in [`pitch-deck.md`](./pitch-deck.md)                   | Export/freeze only after receipts and paired numbers exist |
| Submission copy    | Evidence-backed draft in [`submission.md`](./submission.md)   | Final copy plus authoritative entry receipt                |

## Red-team narration rules

- Never say “live agent” when only the endpoint is live; say “public analyzer, BSC identity pending.”
- Never say “Altana-secured” without grant, execution, revoke, and negative-authority evidence.
- Never say “Pancake benefit” from a read-only boundary warning; separate decision usefulness from realized economics.
- Never say “faster,” “cheaper,” or “better” before all three TermiX pairs pass the preregistered rubric.
- Never show a hash without the chain, environment, explorer/source, status, and meaning.
- If a final path fails, demo the fail-closed state and remove the unsupported claim rather than substituting a fixture.

## Final go/no-go

Run `pnpm submission:require-ready` on the clean, published release. A nonzero exit is a no-go for any “submission complete” or “all evidence verified” statement, even if the product build and public endpoints are green.
