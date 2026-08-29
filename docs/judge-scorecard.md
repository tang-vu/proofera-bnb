# ProofEra judge scorecard

Updated: 2026-08-30. This is an internal pre-submission control sheet derived from the official Smart Money Era page review recorded in [`research.md`](./research.md) and the current [score strategy](./hackathon-score-strategy.md). It is not a judging result, partner endorsement, or submission receipt. Every “current proof” item must remain independently inspectable; every open item blocks the corresponding claim.

## Top-1 thesis

ProofEra should win by demonstrating one coherent product loop rather than four disconnected integrations:

> Find an agent by financial job, inspect evidence and downside, grant narrowly bounded authority, observe the action and cost, compare agent value against a manual baseline, then revoke—with missing evidence remaining visible throughout.

The differentiator is not agent count. It is the evidence and authority layer between ERC-8004 identity and capital access. The strongest demo uses one Pancake LP journey to prove the full loop, then shows that the same trust model covers grid, yield, and health-factor agents without pretending their economic metrics are interchangeable.

## Main-track score control

| Judge signal                       | Current proof                                                                                                                                                                                       | Must close before final claim                                                                                       | Demo moment             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| End-to-end journey                 | Landing, marketplace, four registered dossiers, one-grant Session Control, LP mandate, historical receipt-backed Mission Control, `/proof`, and one controlled chain-97 LP position are implemented | Publish a final release that exposes the new receipt artifact; autonomous production activation remains separate    | 0:00–4:05               |
| Decision-useful live data          | Typed ERC-8004/8004scan ingestion; exact-block Pancake and Venus readers; explicit unavailable/stale/null states                                                                                    | Freeze current data timestamps and receipt-linked outcome/cost evidence for the judged action                       | 0:35–1:25 and 2:30–3:30 |
| Four first-class categories        | LP, grid, yield, and health each have a public analyzer, category contract, dossier, configuration surface, exact Agent Card skill, and finalized BSC-testnet ERC-8004 identity (`1825`–`1828`)     | Keep all four public through judging and show equal discovery depth without implying equal execution history        | 4:35–5:00               |
| Usability without Studio knowledge | Goal-first landing, one-grant copy, direct Session Control, plain-language mandate forms, permission ownership labels, and failure-safe states                                                      | Clean-room run with a new viewer; retain mobile/keyboard evidence for the frozen release                            | Throughout              |
| Trust and safety                   | Exact grant/execute/revoke receipts, PTA zero Approval, finalized negative-authority evidence, and no-re-sign mandate decisions are exposed without hiding historical provider limits               | Keep the PTA effect separate from Pancake economics and demonstrate the frozen public release                       | 1:25–4:05               |
| Production credibility             | Durable custom-domain deployment, PM2 supervision, current exact-build 11-check host-origin probe, proof room, six-scene rehearsal, and one historical rollback/restoration exercise                | Run the bounded rollback/restoration exercise for the current UI release; retain independent uptime/paging evidence | Before recording        |

## Partner-track score control

### Altana

Eligibility story: an agent uses its own Altana session identity; calls, spend, and expiry are real; Keystore registration and session transactions are explorer-verifiable; inspection and revoke live in the product.

| Required evidence                        | Current state                                                                                                              | Closure artifact                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Agent-controlled scoped session identity | V2 session authority was present for execute and is now absent                                                             | Lifecycle artifact plus public account/key observations                           |
| Real call allowlist, spend cap, expiry   | Static policy joins exact expiry and PTA zero Approval; exact intent not precommitted                                      | Ceremony source, onchain expiry, grant and execute receipt                        |
| Keystore registration                    | Grant receipt and PublicNode historical KeyStore/account reads retained                                                    | Single-archive historical authority; two-provider claim explicitly false          |
| Real session transaction                 | Calls ID joins successful PTA zero-Approval receipt                                                                        | `0xc09b…dfcb` plus transaction `0xad65…268e`                                      |
| In-product inspection and revoke         | Session Control exposes grant/revoke; Mission Control shows the receipt chain and finalized two-provider authority absence | Execute calls ID `0xc09b…dfcb`, revoke `0x72e7…ceb7`, finalized block `126543819` |

The five bounded lifecycle rows now have linked evidence. This closes only the testnet lifecycle gate: the session signature is not directly decoded, historical authority has one archive provider, and the action proves no Pancake/economic effect.

### PancakeSwap

Eligibility story: prove a real, measurable benefit to an LP or trader; a logo or read-only integration is insufficient.

| Required evidence               | Current state                                                                                                                                                     | Closure artifact                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Authentic Pancake product state | Exact-block public USDT/WBNB position capture and deterministic LP analysis retained                                                                              | Frozen controlled pool/position context                                                        |
| Real bounded operation          | Approval and direct mint have matching finalized receipts; two EIP-1898 providers agree on NFT `37109`, exact position/pool liquidity and zero residual allowance | Retained artifact plus explorer links are complete; keep owner-executed scope explicit         |
| Before/after value              | Initial controlled position state and exact gas/native/token consumption are retained; no performance claim is made                                               | Later range, fee, gas, slippage and estimated-IL outcome                                       |
| Fair alternative                | LP TermiX manual baseline and protected adjudication are retained; the controlled outcome explicitly records that this baseline is not an economic comparator     | Run a preregistered comparable autonomous/manual economic experiment before claiming advantage |

### TermiX

Recorded rubric: service value 30%, measured agent advantage 30%, high-stakes category/track record 20%, and marketplace quality 20%. At least three real agent-versus-manual tasks must report time, cost, output quality, and raw outputs; at least one must be trading, equities, or security.

| Weighted signal                  | ProofEra design                                                                                  | Missing evidence                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Service value — 30%              | Marketplace discovery, four verified registrations, three paid hires, and fixed hire-gated lanes | Final public-release availability remains open                        |
| Measured advantage — 30%         | Six retained lanes, protected three-pair bundle, exact timing/cost/rubric, no inferred winner    | External/cryptographic reviewer identity is unavailable               |
| High stakes / track record — 20% | Verified bounded Pancake LP analysis, permission security, and Venus health comparisons          | No live trading track record or realized financial outcome is claimed |
| Marketplace quality — 20%        | Public four-category UI, verified identity/hire layers, one-grant control model, and proof room  | Public zero-instruction hire journey and clean-room demo              |

The three frozen pairs are:

1. Pancake LP boundary decision versus manual analysis.
2. Altana/Pancake permission-security audit versus manual review.
3. Venus health-factor decision versus manual analysis.

All six methods and the protected final bundle are retained. Narration must remain task-specific: both lanes scored `100/100`, costs were explicit zero incremental native units, and timing directions differ. No universal advantage or financial guarantee may be claimed.

## Submission asset matrix

| Asset              | Current state                                                                                        | Final gate                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Public product     | Live on `proofera.tangvu.dev`; exact-build 11/11 probe passes                                        | Freeze final commit and retain independent probe           |
| Four public agents | A2A/MCP endpoints and five skill IDs live; BSC-testnet identities `1825`–`1828` are receipt-verified | Retain final-release availability and real hire evidence   |
| Source repository  | Public, strict verification and evidence manifests                                                   | Frozen release commit and hosted CI record                 |
| Proof room         | Public seven-gate ledger                                                                             | All seven gates verified by final artifacts                |
| Demo               | Six-scene exact-build rehearsal plus 303.918-second hashed timing track retained                     | Final video and timestamped clean-room playback check      |
| Pitch deck         | Draft in [`pitch-deck.md`](./pitch-deck.md)                                                          | Export/freeze only after receipts and paired numbers exist |
| Submission copy    | Evidence-backed draft in [`submission.md`](./submission.md)                                          | Final copy plus authoritative entry receipt                |

Submission-flow watch: as rechecked on 2026-08-30, both canonical calls to action still lead to a
registration-only Google Form with no final artifact fields. The build period closes at
`2026-09-09T12:00:00Z`; judging runs through 2026-09-23. The form's partner checkbox omits Altana
while the canonical page retains its eligibility section. Do not substitute that registration
response for the final-entry receipt or infer a partner-track decision from the inconsistent
checkbox.

## Red-team narration rules

- Never let “live agent” imply execution, hiring, or performance merely because its endpoint and BSC identity are live; name each proven layer separately.
- Never say “Altana-secured” without grant, execution, revoke, and negative-authority evidence.
- Never say “Pancake benefit” from a read-only boundary warning; separate decision usefulness from realized economics.
- Never say “faster,” “cheaper,” or “better” before all three TermiX pairs pass the preregistered rubric.
- Never show a hash without the chain, environment, explorer/source, status, and meaning.
- If a final path fails, demo the fail-closed state and remove the unsupported claim rather than substituting a fixture.

## Final go/no-go

Run `pnpm submission:require-ready` on the clean, published release. A nonzero exit is a no-go for any “submission complete” or “all evidence verified” statement, even if the product build and public endpoints are green.
