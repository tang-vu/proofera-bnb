# ProofEra testnet product surface

Updated: 2026-08-31. This document defines the product surface deployed at public commit
`9f32dda65d8123f6f37a58fa869daef6340fd1be` that can be used end to end without a wallet on BSC
testnet. Its deployment is separately bound by the retained release observation and does not change
the activation-readiness or transaction evidence gates.

## Product promise

A user can choose one of four DeFi jobs, inspect its registered testnet identity and evidence
limits, define a chain-97 mandate where that surface exists, run a bounded analyzer scenario, and
inspect the decision, rationale, violations, methodology, provenance, latency, limitations, and raw
result. Missing evidence remains missing. Analysis never becomes transaction authority.

## Shipped journey

1. `/` explains the evidence-first product and offers a direct Studio entry.
2. `/marketplace` preserves one of four category intents while registry ingress streams
   independently.
3. `/reference-analyzers/[category]` exposes exact BSC-testnet identity, implemented/not-run
   metrics, missing calculators, endpoint scope, and an analysis CTA.
4. `/configure/[category]` accepts only allowlisted BSC-testnet values and reports exact readiness
   blockers. Its Studio CTA starts a separate preset; configuration values do not become evidence.
5. `/studio` runs LP range, grid trading, yield optimisation, or health-factor analysis through one
   first-party proxy. The browser renders running, completed, rejected, and fail-closed states.
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

| Criterion                                                                                                               | Verification                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| All four shipped presets satisfy their exact analyzer schemas                                                           | Server integration test invokes all four local handler implementations  |
| Public endpoint contracts still match exact skill/testnet/non-execution scope                                           | Bounded no-wallet HTTP smoke against all four existing analyzer origins |
| Invalid JSON, oversized input, wrong chain/skill, secrets, malformed upstream data, and weakened boundaries fail closed | Route unit tests                                                        |
| Desktop and mobile users can select every analyzer, run a scenario, inspect a result, and retain only summary history   | Playwright Studio journey                                               |
| Shared navigation is stable, keyboard reachable, responsive, and reduced-motion safe                                    | Existing header, accessibility, responsive, and Studio browser suites   |
| Configuration rejects mainnet and non-allowlisted protocol values                                                       | Configuration parser/unit/browser tests                                 |
| Formatting, lint, secret scan, strict types, tests, production build, and full E2E pass                                 | Root verification gates before commit                                   |

## Explicitly incomplete

The current public carrier includes this product slice and has passed the exact-build 11-check
release probe. Production activation, authenticated current portfolio ingestion, durable
distributed rate limiting, an autonomous strategy worker, live execution readiness, and any new
transaction remain outside this product slice. Existing historical testnet receipts remain evidence
only for their exact recorded actions.
