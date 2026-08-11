# ProofEra execution plan

Updated: 2026-08-12
Deadline: 2026-09-09 12:00 UTC
Operating principle: complete and verify the highest-value unblocked judge journey before expanding breadth.

## Status legend

- `DONE`: acceptance criteria and evidence exist.
- `ACTIVE`: current implementation focus.
- `READY`: unblocked and specified.
- `BLOCKED`: requires a user-only secret/account/irreversible action.
- `PLANNED`: depends on an earlier milestone.

## Milestone 0 — ground truth and guardrails (`DONE`)

Acceptance criteria:

- Repository, git state, tools, and governing instructions inspected.
- Official hackathon page and linked primary documentation reviewed.
- Current APIs/packages/chains/contracts/rate limits recorded with uncertainties.
- Root `AGENTS.md`, this plan, and requirements traceability exist.
- No architecture depends on an invented endpoint or undocumented contract.

Evidence:

- [`research.md`](./research.md)
- [`requirements-traceability.md`](./requirements-traceability.md)
- Root [`AGENTS.md`](../AGENTS.md)

Completed evidence includes the exact Studio CLI compatibility/scaffold/doctor spike, dependency compatibility checks, Venus/Lista reads, deployment constraints and verification requirements. The implementation record was updated on 2026-08-12; official-source facts were last checked on 2026-08-11. Fast-moving packages and official competition pages remain re-check items before deployment/submission rather than blockers to implementation.

## Milestone 1 — winning LP vertical slice (`ACTIVE`)

Goal: one coherent PancakeSwap LP-range agent journey from discovery through revoke on BSC testnet.

Acceptance criteria defined before implementation:

1. A user can start from “automate a CAKE/BNB LP” intent and see risk/capital/horizon inputs.
2. Discovery consumes a typed real registry adapter; outage, empty, stale, testnet, simulation, and unverified states are visually distinct.
3. At least two comparable records can be selected, but activation is enabled only for a genuinely executable curated agent.
4. Passport identity and every performance field have source/time/methodology or explicit unknown.
5. Proof Score is deterministic, versioned, category-aware, and penalizes missing/stale evidence; tests cover boundaries and monotonic penalties.
6. Configuration validates capital, assets, range/risk policy, slippage, minimum capital, and expiry. A server context becomes ready only when the atomic position/pool snapshot, exact-block runtime hashes, manager immutable relations, token decimals, ERC-721 controller authority, and SDK-equivalent liquidity/minimum calculation all bind the same BSC testnet block and a separately approved manifest. Client data cannot supply or widen those facts.
7. Permission preview names network, wallet, contract/function allowlist, token cap, period, expiry, slippage/deadline, emergency behavior, and revoke path in plain language.
8. Altana grant uses BSC testnet, explicit calls+spend, Keystore registration, and handles confirmed/rejected/failed/unknown-outcome states without double submit. Because SDK 0.7.0 discards the grant `callsId` when its internal wait returns pending, unknown outcomes are never retried until exact onchain authority is probed.
9. A bounded PancakeSwap operation is simulated before signature and, when funded, submitted through the session. Receipt and explorer URL are stored without fabrication.
10. Mission Control shows session scope/state, allocation/outcome, Proof Stream, pending reconciliation, and immediate revoke. A confirmed revoke disables action and is explorer-verifiable.
11. Keyboard/mobile/error/loading/stale paths are exercised in Playwright.
12. `pnpm format:check`, `lint`, `typecheck`, `test`, `test:e2e`, and `build` pass; traceability/evidence are updated.

Planned slices:

| Slice                        | Status                             | Output                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace and CI foundation  | DONE                               | Exact-pinned pnpm workspace, Next app, strict TS, Vitest, isolated Playwright, security-safe env policy, plus SHA-pinned root/PostgreSQL/four-agent/fixed-asset/E2E CI jobs; a hosted green run remains evidence to collect                                                                                                                                                 |
| Evidence/domain model        | DONE                               | Four-category schema, provenance, Proof Score 1.1-draft and hardened policy are tested                                                                                                                                                                                                                                                                                      |
| Live identity ingress        | DONE                               | Live 8004scan list/detail paths, explicit outage/empty/not-found states, and identity Passport work                                                                                                                                                                                                                                                                         |
| Evidence-first LP UX         | ACTIVE                             | Intent, streamed marketplace, Passport, 2–4 comparison, configuration, strict permission renderer and honest Mission Control empty state pass; live registry latency no longer blocks the intent/analyzer shell, while the connected activation route remains                                                                                                               |
| Altana state machine         | ACTIVE                             | Public-descriptor/authority, 16 exact-SDK grant, 68 canonical same-pool PostgreSQL grant-claim, and execute/revoke lifecycle tests pass; the claim ledger also passes 18 real PostgreSQL 17 cases, while no deployed database, worker signer, real passkey ceremony, or live authority exists                                                                               |
| Pancake read/execute adapter | ACTIVE                             | Atomic reads, canonical-block identity, context-v3 binding, source reconstruction, selector-scoped attestation modeling and direct-calldata validation pass; corrected local selector evidence passes 10 tests and the server-only intake passes 19, while actual publication/retrieval and an eligible pool remain blocked                                                 |
| Fixed test-asset fallback    | DONE locally / UNDEPLOYED          | Chain-97-only fixed-supply PTA plus deterministic PTA/WBNB review-call preparation pass 11 Solidity tests including 256 fuzz runs and 25 Node tests; the plan emits no complete/serialized transaction request, signed/unsigned envelope, approval, liquidity call or guessed pool, keeps twelve gates open, and no token, pool, price, liquidity or onchain receipt exists |
| Explainable recommendation   | DONE                               | Versioned same-category mandate matcher rejects partial assets, risk/capital/protocol/chain/horizon mismatch, duplicates and insufficient evidence without using returns                                                                                                                                                                                                    |
| Runtime release signals      | ACTIVE                             | Liveness is separate from readiness; canonical PostgreSQL is CI-proven, while activation remains unavailable until its deployed instance, eligible write target, signer handoff, authority and passkey ceremony all probe ready                                                                                                                                             |
| Real testnet proof           | BLOCKED only after local readiness | tBNB/test assets and explicit wallet confirmations; no blocker for implementation/tests                                                                                                                                                                                                                                                                                     |

Primary risks and mitigations:

- Sparse trustworthy agent metrics: publish unknowns and low confidence; create a reference agent with reproducible evidence.
- Runtime-code hashes do not establish source or proxy safety: M1 stays non-executable until every write target is independently reviewed as non-proxy, or its implementation and admin state are pinned at the same canonical block and exposed to the user.
- Passkey RP-ID drift: use environment-configured stable RP ID and collect final receipts only on the judging hostname.
- Relay/registry outages: explicit stale/unavailable UI, bounded cache, no mock substitution.
- Session custody/handoff: the passkey admin never leaves the browser; the autonomous session signer belongs only in an encrypted worker secret/KMS. The exact-0.7.0 adapter validates a matching explicit RP ID, production WebAuthn P-256 shape, exact public-descriptor grant, and one-shot injected claim. The separate canonical PostgreSQL 17 grant ledger now enforces exact claim/replay binding through an independently verified same-pool gateway with sanitized prewrite, rollback, committed-unusable and unknown outcomes; 68 focused and 18 real PostgreSQL cases pass. It is still unconfigured and non-release-ready because no production database or final-origin ceremony exists. Independently verify exact permission/expiry/key state from the worker before activation is executable. SDK 0.7.0 throws away the grant `callsId` on pending/failed waits, so an uncertain grant becomes `outcome_unknown` and cannot be retried until the authority probe resolves it. Never persist either key in the marketplace database/general web runtime.
- Durable reservation: the handoff can return ready only after the nominal server-only PostgreSQL `consumeOrRead` capability yields the identical immutable receipt for the exact context/quote/user/policy/write-target/window binding. Policy and attestation also join on the exact block timestamp; final monotonic validation rechecks receipt expiry and target freshness and cannot leak a nested ready bootstrap after a veto. The versioned PostgreSQL 17 schema, canonical catalog/ACL verifier, nominal verification capability, least-privilege runtime pool and 10-case real-17.9 suite pass. No deployed instance exists, so production replay protection and activation readiness remain unavailable.
- Testnet pool eligibility: a bounded exact-lineage review rejected all 14 reviewed WBNB pools. The exact CAKE pair and configured mocks have unsafe mint/burn surfaces; recent counterparties lack source/control proof and have one-observation pools. Blocks `28,488,223–124,399,999` remain an explicitly uncovered archive interval, so the result is not a factory-lifetime inventory. Canonical WBNB now has exact source/creation/runtime/control proof and is eligible as one token component after a fresh code binding, but no pool is admitted. Keep every candidate read-only and require an approved PTA deployment plus a separately reviewed new pool, or another independently admissible pair, before enabling writes.
- Testnet fallback asset: PTA is a locally verified non-economic ERC-20 with no admin or later-mint surface, not a stablecoin or execution guard. Its offline pool tool binds the official chain-97 tuple, token order, fee-500 initializer selector, zero value and arbitrary raw-unit 1:1 seed while emitting no transaction envelope or pool prediction. All twelve submission/activation gates remain open. PTA remains undeployed and cannot satisfy pool eligibility until an explicitly approved minimal deployment/pool is independently observed and reviewed.
- Selector-path publication: four direct-path artifacts plus the denied-multicall boundary are deterministic, raw-byte content-addressed, bound to the canonical lowercase-manager write scope, and locally tested. They are manual static analysis, not formal proof. The server-only intake requires exact canonical bytes at digest-named public HTTPS locators, fresh independent no-redirect retrieval records, allowlisted reviewer/retriever identities, and a separately provisioned batch review ID; the local package is rejected. No real public artifacts or retrieval receipts are bound yet, and even a successful nested assessment still requires fresh source/nonproxy/full-attestation evidence.
- Altana licensing: the published 0.7.0 artifact ships GPL-3.0-or-later while repository metadata has appeared Apache-2.0. Record an SBOM and resolve distribution/source obligations with Altana before public release; do not assume the root MIT declaration settles bundled client code.

## Milestone 2 — equal four-category marketplace (`ACTIVE`)

Acceptance criteria:

- Four reference/live agents exist with equal passport, discovery, comparison, configuration, activation-policy, Mission Control, and evidence depth.
- Category metrics match `docs/data-methodology.md`; cross-category comparison never presents unlike returns as equivalent.
- Reference agents are registered under ERC-8004 when feasible and clearly labeled BSC testnet/mainnet.
- Critical routes and state variants pass responsive/accessibility E2E checks.

Dependencies: milestone-1 primitives and testnet agent deployment path.

Current breadth evidence: deterministic, non-executing analyzers now exist for LP Range (17 tests), Grid Trading (24), Yield Optimisation (33), and Health-Factor Guardian (37). Each fails closed on missing/stale evidence and keeps unverified execution or realized outcomes unavailable. All four have exact-pinned hardened Studio-shaped A2A/MCP HTTP runtimes with honest authentication declarations, bounded unpredictable sessions, resource limits, full local verification/audit gates, and fail-independent CI matrix entries. The marketplace renders immediately while live registry ingress resolves independently into pending, available, authoritative-empty, or unavailable state. It shows four validated development dossiers with every live, registration, hire, activation, and execution flag false. Calculator coverage is metric-specific: LP `current_range_state`; Grid `configured_range`; Yield `net_apy` and `gas_impact`; and Health `current_health_factor`, `minimum_health_factor`, and `alert_latency` are implemented but not run, while all other dossier fields identify a documented definition with no calculator and a null methodology version. LP keeps its separate bounded configuration route; Grid, Yield, and Health now have strict GET-only mandate routes that preserve exact raw values and explicit chain selection while all readiness and side-effect flags remain false. None of these routes selects an agent, previews permissions, connects a wallet, reads a source, creates authority, or activates anything. No analyzer is labelled live until it has a durable public endpoint, health probe, ERC-8004/BSC identity, and independently reproducible execution evidence; none has those live artifacts today.

## Milestone 3 — data and trust advantage (`PLANNED`)

Acceptance criteria:

- Fresh protocol/onchain ingestion covers executions, outcomes, costs, freshness, and failures.
- Proof Score v1 methodology, sample warnings, confidence bands, and deterministic fixtures are public and tested.
- Proof Stream links raw source/transaction evidence; provider outage and stale cache behavior is observable.
- Rate limiting, cache policy, retention, and optional PostgreSQL/indexer need are load-tested before infrastructure expansion.

## Milestone 4 — partner-track proof (`PLANNED`)

Acceptance criteria:

- Altana explorer contains real grant/session execute/revoke transactions; wallet addresses and links are captured.
- PancakeSwap LP benefit has a reproducible baseline/agent comparison net of known gas/slippage/fees.
- Three TermiX agent-vs-manual tasks have raw outputs, timers, costs, quality rubric, receipts, reproduction, and limitations; at least one is trading/security.
- ERC-8183 hiring and/or x402/B402 is added only if the core session journey is stable and the official SDK path remains current.

## Milestone 5 — submission-grade product (`PLANNED`)

Acceptance criteria:

- Public judging URL, uptime/error telemetry, deployment/rollback runbook, and evidence URLs are verified.
- Security threat model, focused adversarial tests, dependency/secret scans, accessibility, performance, and all CI gates pass.
- README, architecture, methodology, security, deployment, demo, submission copy, and evidence package are complete.
- No judged route has dead controls, hidden mocks, fake receipts, placeholder copy, or unlabeled simulation.

## User-only blockers

None block local implementation. Release additionally requires the npm-account owner to confirm revocation/rotation of the registry token exposed in prior local tool output and review the account's access/publication history; the token value is not retained here. Expected later requests are otherwise limited to: testnet faucet/account intervention if automated funding is insufficient; 8004scan Pro key if quota blocks ingestion validation; durable hosting credentials for judging uptime; and explicit approval before any mainnet or paid action. The current BNB-managed Studio trial lasts only 48 hours and is not a judging-uptime solution.

## Decision log

| Date       | Decision                                                                              | Rationale                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-11 | First slice is PancakeSwap LP range control through an Altana BSC-testnet session     | One flow produces judge-visible main-track, PancakeSwap, and Altana evidence while establishing reusable controls                                                                                                |
| 2026-08-11 | Direct V3 calls and narrowed enforcement claims before a custom guard                 | Altana enforces target/selector, spend and expiry, but not calldata semantics; runtime validates recipient/token ID/ticks/slippage. Add a small audited guard if those guarantees must survive worker compromise |
| 2026-08-11 | No silent live-to-fixture fallback                                                    | The product thesis and data-quality rubric require outages and missing data to reduce confidence visibly                                                                                                         |
| 2026-08-11 | Registry identity is not capability verification                                      | ERC-8004 itself warns metadata cannot prove advertised behavior; activation needs independent evidence                                                                                                           |
| 2026-08-11 | Use current Node Studio CLI, not the stale June Python quickstart                     | Current official product/npm surface is `@bnbagent/studio-cli@0.0.8`; exact pin and isolate generated agents                                                                                                     |
| 2026-08-11 | Treat main-track testnet eligibility as unresolved                                    | Only Altana explicitly says testnet qualifies; prepare but do not execute a minimal-value mainnet path without approval                                                                                          |
| 2026-08-11 | Keep Studio Altana 0.5.1 and marketplace Altana 0.7.0 behind an explicit handoff seam | The generated Studio runtime and current marketplace SDK resolve different minor versions; authority must be verified onchain rather than inferred from SDK object compatibility                                 |
