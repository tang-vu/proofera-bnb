# ProofEra pitch deck draft

Updated: 2026-08-17. Ten-slide narrative for the BNB Chain Smart Money Era submission. Bracketed fields and statements marked pending must be replaced only by final retained evidence. This Markdown file is not the exported deck or proof that it was submitted.

## Slide 1 — ProofEra

### Hire agents by proof, not promises.

The risk-aware marketplace for autonomous DeFi agents on BNB Smart Chain.

- Discover by financial job.
- Verify identity, evidence, downside, and cost.
- Grant narrow, expiring authority.
- Observe receipts and revoke.

Live product: `https://proofera.tangvu.dev`

Speaker note: “Agent registries prove an identity exists. ProofEra answers whether that identity deserves authority over capital.”

## Slide 2 — The trust gap

Agent marketplaces optimize for supply and descriptions. Capital owners need answers that a profile cannot provide:

- Did this agent actually perform the advertised job?
- What happened after gas, fees, slippage, and downside?
- Is the evidence fresh and independently traceable?
- Exactly what may the agent call, spend, and for how long?
- Can the user verify that authority is gone?

ProofEra's governing rule: missing evidence remains missing; it never becomes a score, receipt, or success claim.

## Slide 3 — The product loop

1. Start with a job: LP management, grid trading, yield optimisation, or health monitoring.
2. Discover ERC-8004 identities and ProofEra reference analyzers.
3. Inspect a category-specific Passport and comparable trust factors.
4. Configure capital, risk, horizon, and execution bounds.
5. Review targets, selectors, spend caps, expiry, and enforcement owner.
6. Activate only after identity, authority, and evidence gates pass.
7. Reconcile receipts in Mission Control and revoke with negative authority proof.

Current truth: steps 1–4 and the honest empty/rehearsal states are public. Steps 5–7 require the final receipt-backed lifecycle.

## Slide 4 — Proof, not a leaderboard

Each metric carries:

- value or explicit null;
- source URL or contract;
- source observation time and ingestion time;
- methodology version;
- environment and freshness state;
- receipt when the claim depends on execution.

Proof Score separates common trust factors from category economics. LP range time, grid drawdown, yield exit liquidity, and health-factor alert latency are not collapsed into a misleading universal return ranking.

Visual: public `/proof` room plus one Passport evidence card.

## Slide 5 — Four jobs, equal scrutiny

| Job                | Public skill                  | Decision contract                                                      |
| ------------------ | ----------------------------- | ---------------------------------------------------------------------- |
| LP rebalancing     | `analyze_lp_range`            | Range state, tick buffer, economics completeness, bounded decision     |
| Grid trading       | `analyze_grid_trading`        | Configured range, fills/PnL evidence, drawdown, turnover, costs        |
| Yield optimisation | `analyze_yield_opportunities` | Net APY, gas impact, liquidity, withdrawal and exposure constraints    |
| Health monitoring  | `analyze_venus_health_factor` | Current/minimum health factor, thresholds, market joins, alert latency |

The LP endpoint also exposes `audit_altana_permission_bundle` for the preregistered security task.

Current truth: four durable public analyzers and five exact Agent Card skills are live. Finalized BSC-testnet ERC-8004 receipts bind Agent IDs `1825` through `1828`; marketplace eligibility, authority, execution, and performance remain unverified.

## Slide 6 — One bounded authority model

ProofEra combines:

- an exact Altana session policy for targets, selectors, spend, and expiry;
- code/selector attestation and canonical calldata validation;
- a public-only session descriptor crossing the browser boundary;
- one-shot PostgreSQL claim/reservation ledgers;
- no blind retry when SDK grant outcome is unknown;
- revoke completion only after a fresh authority read proves absence.

Pending evidence: `[ALTANA ACCOUNT]`, `[KEY]`, `[GRANT RECEIPT]`, `[EXECUTE RECEIPT]`, `[REVOKE RECEIPT]`, and `[NEGATIVE AUTHORITY PROBE]`.

## Slide 7 — PancakeSwap: from signal to measurable benefit

Current retained proof:

- exact-block public USDT/WBNB V3 position state;
- 12 read-only RPC exchanges and public A2A response;
- position one tick above its lower bound;
- explicit `insufficient_evidence` result because gas, slippage, and projected fees were absent.

Why this matters: the agent found a decision boundary and refused to manufacture economics.

Final partner proof must add one controlled bounded operation, before/after metrics, and a manual baseline net of gas, fees, slippage, and estimated IL: `[PANCAKE RECEIPT + RESULT]`.

## Slide 8 — TermiX: measure the agent advantage

Three preregistered pairs share fixed inputs and rubrics:

1. Pancake LP decision.
2. Altana permission-security audit.
3. Venus health-factor decision.

Each pair reports wall time, operator-active time, sourced cost, output SHA-256, receipt joins, and predeclared quality scoring. Publication is rejected when either lane is incomplete or declarations differ.

Pending chart: `[THREE PAIRED RESULTS — TIME / COST / QUALITY / LIMITATIONS]`.

Current truth: harness and runners exist; every method remains `NOT RUN`.

## Slide 9 — Defensibility and business model

Defensibility:

- category-specific evidence contracts instead of self-reported profiles;
- receipt-linked authority and outcome history;
- versioned scoring/methodology with explicit missing-data penalties;
- typed adapters and runtime parsing for replaceable data/protocol sources;
- one trust layer reusable across first-party and third-party ERC-8004 agents.

Proposed business model—not current revenue:

- free discovery and public evidence pages;
- agent-provider subscription for verified evidence ingestion and operational tooling;
- usage fee on successfully reconciled marketplace hires;
- institutional risk/policy API and audit exports;
- no pay-to-improve Proof Score and no hidden ranking boost.

## Slide 10 — Why ProofEra should become the marketplace

BNB Agent Studio makes agents easier to build. ProofEra makes them safer to choose and control.

- Goal-first UX for users who do not know Agent Studio.
- Equal first-class coverage across four required financial jobs.
- Real BSC identity and partner integrations only when explorer-verifiable.
- Transparent failure, stale data, unknown outcomes, and revoke state.
- A measurable path from discovery to economic value.

Close with the final live loop: `[REGISTERED AGENT] → [BOUNDED ALTANA AUTHORITY] → [PANCAKE RECEIPT] → [TERMIX RESULT] → [REVOKE PROOF]`.

Call to action: open `https://proofera.tangvu.dev/proof` and verify every claim directly.
