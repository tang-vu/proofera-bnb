# ProofEra testnet product surface

Updated: 2026-09-01. This document defines the product surface verified on public code release
`f25a67daa0292b5a04c142a42606888f7ec2b8e6` that can be used end to end without a wallet on BSC
testnet. Its retained four-category journey binds current marketplace evidence and analysis-service
activation separately. Capital activation, transaction authority and judging readiness remain false.

## Product promise

A user can choose one of four DeFi jobs, inspect its registered testnet identity and evidence
limits, define a chain-97 mandate where that surface exists, run a bounded analyzer scenario, and
inspect the decision, rationale, violations, methodology, provenance, latency, limitations, and raw
result. Missing evidence remains missing. Analysis never becomes transaction authority.

## Shipped journey

1. `/` explains the evidence-first product and offers a direct Studio entry.
2. `/marketplace` preserves one of four category intents while registry ingress and a selected
   current-evidence read stream independently. Each available category exposes five bounded facts,
   source/environment, observation or retrieval time, freshness, methodology and limitations.
3. `/reference-analyzers/[category]` exposes exact BSC-testnet identity, implemented/not-run
   metrics, missing calculators, endpoint scope, and an analysis CTA.
4. `/configure/[category]` accepts only allowlisted BSC-testnet values and reports exact readiness
   blockers. Its Studio CTA starts a separate preset; configuration values do not become evidence.
5. `/studio` runs LP range, grid trading, yield optimisation, or health-factor analysis through one
   first-party proxy. The browser renders running, completed, rejected, and fail-closed states plus a
   terminal service-run ID and observation time. Marketplace facts are not forwarded into presets.
6. Studio history stores at most twelve summaries and input digests in local storage. It does not
   store raw input, wallet data, or a server-side run ledger.
7. `/proof`, `/mission-control`, and `/session-control` remain separate evidence, observation, and
   bounded-authority surfaces. A completed Studio run does not unlock them.

## Scenario provenance

| Analyzer           | Supplied scenario                                     | Product meaning                                                                      |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| LP range           | Deterministic synthetic chain-97 range state          | Exercises range logic; not a pool observation or rebalance result                    |
| Grid trading       | Deterministic synthetic chain-97 market/risk state    | Exercises grid constraints; not a quote, fill, PnL, or price feed                    |
| Yield optimisation | Deterministic synthetic chain-97 route state          | Exercises route economics; not a current APY, deposit opportunity, or recommendation |
| Health factor      | Hash-checked retained Venus chain-97 canonical replay | Historical bounded replay; not current account state or liquidation protection       |

## Enforced boundary

- The API selects from four compiled HTTPS endpoints; callers cannot supply a URL.
- Category, exact skill, and chain ID 97 must agree before any network request.
- Credential-like field names, including private keys, mnemonics, keystores, session signers,
  authorization fields, passwords, API keys, cookies, and secrets, are rejected recursively.
- Requests are limited to 96 KiB, responses to 384 KiB, nesting/field counts are bounded by the
  analyzer schemas, redirects are denied, and upstream work has a 15-second timeout.
- A response is rejected unless its A2A request ID matches and `executionEnabled` remains false.
  Successful analysis must also return the exact skill, `bsc-testnet`, and chain ID 97.
- Public proxy capacity is bounded to 120 requests per minute per web process. This is an abuse
  guard, not a durable or distributed quota, and it retains no analyzer payload.
- The product route never connects a wallet, signs, grants, approves, transfers, swaps, mints,
  submits, retries, or replaces a transaction.

## Acceptance and evidence

| Criterion                                                                                                               | Verification                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| All four shipped presets satisfy their exact analyzer schemas                                                           | Server integration test invokes all four local handler implementations   |
| Public endpoint contracts still match exact skill/testnet/non-execution scope                                           | Bounded no-wallet HTTP smoke against all four existing analyzer origins  |
| Invalid JSON, oversized input, wrong chain/skill, secrets, malformed upstream data, and weakened boundaries fail closed | Route unit tests                                                         |
| Desktop and mobile users can select every analyzer, run a scenario, inspect a result, and retain only summary history   | Playwright Studio journey                                                |
| Shared navigation is stable, keyboard reachable, responsive, and reduced-motion safe                                    | Existing header, accessibility, responsive, and Studio browser suites    |
| Configuration rejects mainnet and non-allowlisted protocol values                                                       | Configuration parser/unit/browser tests                                  |
| Formatting, lint, secret scan, strict types, tests, production build, and full E2E pass                                 | Root verification gates before commit                                    |
| Four public current-evidence panels and four service runs are release-bound and visually inspectable                    | v2 journey manifest, 20 facts, eight PNG hashes and four response hashes |

## Explicitly incomplete

Public code release `f25a67d` passed the exact-build 11-check host-origin release probe and the
four-category v2 journey capture. Production activation, authenticated current portfolio ingestion, durable
distributed rate limiting, an autonomous strategy worker, live execution readiness, and any new
transaction remain outside this product slice. Existing historical testnet receipts remain evidence
only for their exact recorded actions.
