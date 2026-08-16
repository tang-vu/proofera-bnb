# ProofEra agent advantage report

Updated: 2026-08-17. Overall status: **NOT RUN — NON-PUBLISHABLE**.

This is ProofEra's TermiX paired-experiment ledger. Exactly three ProofEra-versus-manual tasks are preregistered. No agent or manual run has started, and no benchmark time, cost, score, output, receipt, transaction hash or advantage is claimed. Public analyzer endpoints are availability evidence only, not experiment receipts.

## Harness audit and preregistration boundary

The existing `packages/benchmarks` paired-run schema is strict about evidence that already has exact values: it requires each run to carry the same normalized task, inputs, constraints, environment, receipt kinds and rubric; keeps timing and costs exact; joins receipts to hashed raw artifacts; distinguishes incomplete, unverified and verified records; and enables publication only when both runs are verified. It does not execute a task or infer a winner.

That run schema cannot honestly represent today's state because the judged blocks, accounts, positions, policies, release commit, live agent identities, final declarations and most fixed lane adapters do not exist. Encoding placeholders as final `BenchmarkDeclaration` values would misrepresent them as exact inputs. `BenchmarkPreregistrationSchema` therefore models only a pre-run protocol:

- both method states are exactly `NOT RUN` and `publishable` is exactly `false`;
- every not-yet-known input, environment parameter, release commit and timed runner command is explicitly `UNBOUND`/`null` with a reason;
- fixed task text, constraints, rubric, hard fails, receipt requirements and parity rules are bound by a canonical SHA-256 digest;
- all six parity controls require one final declaration for both runs: identical task, inputs, constraints, environment, rubric and source access;
- any changed definition needs a new version and digest before either run.

The three validated artifacts and their limitations are recorded in [`evidence/termix/README.md`](../evidence/termix/README.md). These local digests make edits detectable; they are not a public timestamp, commit attestation or result receipt.

Validate the evidence contract without running a benchmark:

```bash
pnpm --filter @proofera/benchmarks typecheck
pnpm --filter @proofera/benchmarks test
```

## Common paired protocol

Before either method starts, the operator must bind every `UNBOUND` field, produce one schema-valid `BenchmarkDeclaration`, record its canonical digest, and supply that same declaration to both runs. The registered agent must be hired through ProofEra; the manual operator must not invoke it. Method-specific configuration and hire evidence identify how the work was performed but cannot change the shared task or evidence access.

Run order is chosen from recorded public randomness only after declaration freeze. No input/window refresh is allowed between methods. Each run records:

- UTC start/end, monotonic wall duration and hashed monotonic active-time segments;
- API, agent, gas, protocol and labor costs as applicable in integer minor units, including evidence for zero values;
- unedited raw output and canonical parsed output with SHA-256 hashes;
- the same predeclared 100-point rubric, scored criterion-by-criterion by a second reviewer;
- required raw API/transaction receipts joined to their artifacts, plus ProofEra hire evidence for the agent method;
- commands, tool-use logs, failures and limitations.

Costs remain grouped by denomination; no hidden exchange-rate conversion or aggregate winner is inferred. A hard fail remains visible rather than being removed from the comparison.

| Preregistered task                       | ProofEra-hired agent | Without agent | Publishable |
| ---------------------------------------- | -------------------- | ------------- | ----------- |
| 01 — PancakeSwap LP range decision       | **NOT RUN**          | **NOT RUN**   | No          |
| 02 — autonomous-session permission audit | **NOT RUN**          | **NOT RUN**   | No          |
| 03 — Venus health-factor replay          | **NOT RUN**          | **NOT RUN**   | No          |

## Task 01 — PancakeSwap public-position LP range decision

Track alignment: trading, PancakeSwap, TermiX and the marketplace. Active preregistration: [`task-01-lp-range-v2.json`](../evidence/termix/preregistrations/task-01-lp-range-v2.json), definition SHA-256 `9ac77645f2dd0ade20203b911cba18ce52b7b016fae8d9e73aa2919440b572ab`. The never-run PTA/WBNB v1 protocol remains unchanged under [`superseded-preregistrations/`](../evidence/termix/superseded-preregistrations/task-01-lp-range-v1.json); v2 does not rewrite it.

Exact task: from one immutable BSC-mainnet public USDT/WBNB Pancake V3 position bundle, validate the retained source and an exact-hash `slot0` replay; calculate in-range and boundary state; and return exact tick buffers, policy violations, supplied known economics, explicitly unavailable economics, a bounded decision, rationale and limitations. Position `7152618` belongs to an unrelated public address. Both methods are read-only and may never infer ProofEra ownership, authority, performance or execution.

The shared candidate bundle is retained at [`116342186-7152618.canonical-json`](../evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json), logical SHA-256 `3459eb2566621c4d74acef68c84849e59b74214c7a21d7d20b8bbc6352dda945`. It binds the exact evidence-file digest, block/hash, pool, manager, position, expected tick and byte-equivalent agent request. It remains a candidate, not a final declaration or result. Still to bind: release commit, chain-97 registered/hireable agent, verified hire receipt, endpoint/configuration values, public run-order seed, exact method invocations and manual procedure transcript.

Fixed constraints separate source-data chain 56 from ERC-8004/hire chain 97; require identical bundle and exact-hash `slot0` access; forbid all timed wallet/write activity and undeclared network access; and preserve the third-party non-authority label.

Rubric (100): verified inputs 25; range/risk accuracy 25; economics/decision integrity 25; explanation/uncertainty 10; reproducibility 15. Wrong source/commerce chain, block/hash, contract, position, tick, evidence digest or RPC origin; any timed write/wallet use; any ownership/performance overclaim; fabricated value; undeclared access; or paired mismatch is a hard fail.

Both fixed lanes now bind the same input digest. The agent lane rechecks exact-hash `slot0` before calling the public LP A2A endpoint and cannot enter either network call without registration plus verified hire evidence. The manual lane accepts exactly one matching RPC exchange during positive operator-active time, retains the unedited canonical output, and leaves its no-agent declaration for independent tool-log review. Required final evidence remains: one frozen declaration; both raw/canonical outputs; wall/active time and sourced costs; both exact API receipts; chain-97 hire evidence for the agent method; and rubric-complete second review. None is a completed run yet.

Available prerequisite commands—not experiment commands:

From `agents/lpRangeAgent`:

```bash
pnpm verify
```

From the repository root:

```bash
pnpm --filter @proofera/benchmarks test
```

Available release-gated agent command—not currently runnable as a benchmark:

```bash
pnpm run:termix:pancake-lp-agent -- --execute-exact-pancake-lp-agent-run --input-bundle evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json
```

Timed reproduction command: **UNBOUND**. Agent result: **NOT RUN**. Manual result: **NOT RUN**.

## Task 02 — Altana/Pancake autonomous-session permission audit

Track alignment: security, Altana, PancakeSwap and TermiX. Preregistration: [`task-02-permission-audit.json`](../evidence/termix/preregistrations/task-02-permission-audit.json), definition SHA-256 `1191c85c4f36881be0736ced51fc6c23e24286101543bf0838346b0e2ed95645`.

Exact task: audit one immutable, secret-free BSC testnet activation bundle containing the grant intent, decoded direct calls, code/selector attestation, spend/expiry policy, durable reservation/claim state, quote times, authority lifecycle receipts, pinned SDK behavior and a blind adversarial corpus. Return evidence-linked findings, severity/impact, safe reproduction and a corrected table that accurately labels Altana/onchain, ProofEra runtime and explicit-wallet enforcement.

Inputs still to bind: final activation proposal; exact block/code/authority evidence; deployed grant-claim database receipt; real grant/probe/revoke receipts; blind corpus and reviewer-held answer-key digest; pinned SDK/documentation artifacts; registered/hireable audit agent; manual procedure; release commit; and timed runner. No secret or signer material may enter the bundle.

Available implementation boundary: `@proofera/benchmarks` now includes a strict deterministic audit engine for the canonical secret-free bundle. It requires distinct role-bound proposal, corpus, lifecycle, code, SDK and database-deployment evidence; ordered distinct grant/revoke receipts; exact code-policy parity; and complete evidence joins. It rejects duplicate/unbound cases, compares direct targets/selectors/code/recipient/token, chain, expiry, quote age, spend bounds, retry, revoke and signer-exposure markers, and emits a corrected three-layer enforcement table. A separate fixed read-only RPC plan admits only chain ID, the two named lifecycle receipt reads, and exact-block runtime-code reads; raw responses must match chain 97, successful transaction/block joins and attested code bytes. The fixed manual lane additionally requires positive timed work, all artifact digests exactly once, every fixed RPC observation, all five preregistered declaration-input joins, no hire receipt and a canonical output with `agentInvoked: false`. The fixed agent lane cannot reach any network until the outer runner validates a registered ERC-8004 identity and verified hire receipt; it then completes the same RPC plan before one fixed A2A skill and accepts only an exact-bundle, explicitly non-executing output. Its intended endpoint does not yet expose that audit skill, so the lane is implemented but not live or runnable. These synthetic engine/RPC/lane tests are not a TermiX run, transcript, receipt, finding against the final bundle or performance evidence.

Rubric (100): true-positive coverage 35; false-positive discipline 15; impact/reproduction 15; least-authority correction 20; evidence/reproducibility 15. Missing a seeded generic dispatcher, session-signer leak, wrong target/recipient/token/chain, unbounded spend, unsafe unknown-outcome retry or revoke failure is a hard fail. A secret exposure or timed write is also a hard fail.

Required evidence: identical frozen proposal/corpus/source bundle; raw and normalized findings; timing/cost/tool log; post-run answer-key adjudication; the exact authority transaction and API receipt re-observed in each run; and real ProofEra hire evidence for the agent method. None exists yet.

Available prerequisite commands—not paired audit execution:

```bash
pnpm --filter @proofera/integrations exec vitest run src/altana-lp-activation-composition.server.test.ts src/altana-lp-handoff.test.ts src/altana-grant.test.ts
pnpm --filter @proofera/benchmarks test
```

Timed reproduction command: **UNBOUND** until the create-only CLI and final bundle exist. Agent result: **NOT RUN**. Manual result: **NOT RUN**; the implemented lane has not been invoked with benchmark evidence.

## Task 03 — Venus health-factor replay and intervention decision

Track alignment: lending/health monitoring, TermiX and equal four-category depth. Preregistration: [`task-03-venus-health.json`](../evidence/termix/preregistrations/task-03-venus-health.json), definition SHA-256 `c15ed1089fdeb75eab7db3134f08c011fd71bfe02ec2c3dbf3052592973c8c55`.

This is the strongest third task because it is a high-stakes, objectively replayable safety decision: exact-block collateral, debt, price and threshold calculations can be independently recomputed, while stale-source handling and intervention bounds expose unsafe automation. This rationale is a design choice, not a performance claim.

Exact task: replay one frozen BSC testnet Venus account window; calculate health factor at every observation; identify the first warning/critical crossing, minimum health factor and alert latency; then choose no action, alert-only or a bounded unsigned intervention plan under one identical policy. The timed comparison never signs or broadcasts.

Inputs still to bind: authorized testnet account; reviewed markets/comptroller/oracle; exact block window; raw collateral/debt/price/config responses; integer scales; timestamps; warning/critical/liquidation thresholds; latency target; action/repay/spend/expiry/recipient/confirmation policy; registered/hireable guardian; manual worksheet; release commit; and timed runner.

Rubric (100): state/calculation 30; threshold/latency 20; safe policy compliance 25; explanation/uncertainty 10; evidence/reproducibility 15. Wrong network/account/market/scale/oracle/window, floating-point financial arithmetic, stale-source substitution, unsupported intervention or any timed write is a hard fail.

Required evidence: identical account/window/policy bundle; raw and canonical calculations/decision; timing/cost log; second-reviewer recomputation; an API receipt captured in each run; and real ProofEra hire evidence for the agent method. No intervention receipt is claimed because the scored task is read-only; any separately approved testnet intervention must remain outside the paired score and be labelled separately.

Available prerequisite commands—not experiment commands:

From `agents/healthFactorGuardianAgent`:

```bash
pnpm verify
```

From the repository root:

```bash
pnpm --filter @proofera/benchmarks test
```

The fixed agent/manual Venus lanes and root create-only agent CLI are
implemented and tested. The agent path digest-binds the canonical request,
public endpoint and configuration; preserves the raw A2A response; verifies a
clean published source commit and committed input; and rejects malformed or
widened responses. The outer runner rejects an unregistered agent or missing
verified hire receipt before HTTP. The manual path calls neither agent nor
network: it timestamps positive operator-active segments, accepts only exact
read-only exchanges from two fixed BSC-testnet RPC origins inside active work,
and binds canonical output to the same request digest and procedure. Its
no-agent declaration is not self-authenticating and remains a second-review
gate. These are runner capabilities only: the exact final invocations remain
unbound, and neither lane has been invoked as a TermiX run.

Timed reproduction command: **UNBOUND**. Agent result: **NOT RUN**. Manual result: **NOT RUN**.

## Freeze, run and publication gates

For each task, in order:

1. Bind every exact input/environment value and timed command from real sources; add no placeholder.
2. Register and expose the real agent through ProofEra; capture identity and hire evidence without embedding secrets.
3. Generate one `BenchmarkDeclaration`, validate it and record its digest for both methods.
4. Freeze the manual procedure and agent configuration, then choose run order from the declared rule.
5. Execute both methods with injected timing and raw output/receipt capture; do not repair outputs after the fact.
6. Have a second reviewer reproduce calculations, verify receipts and score every rubric criterion.
7. Validate the complete pair with `PairedBenchmarkSchema`. Failed/inconclusive runs stay visible.

A task becomes publishable only when both complete runs are independently verified by the harness and every external receipt/source link is manually opened. “Agent advantage” is then reported per task and per measure only. Three experiments cannot support a universal productivity claim.
