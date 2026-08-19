# ProofEra agent advantage report

Updated: 2026-08-19. Overall status: **PARTIAL RAW CAPTURE — NON-PUBLISHABLE**.

This is ProofEra's TermiX paired-experiment ledger. Exactly three ProofEra-versus-manual tasks are preregistered. The hire contract deployment and three paid BSC-testnet hires are independently finalized in [`125715654-7fa5ad3e.json`](../evidence/termix/hire-receipts/125715654-7fa5ad3e.json); they establish commerce prerequisites only. Task 01 and Task 03 each retain an agent and manual raw capture. Task 02 remains unbound because its final input requires the real Altana lifecycle receipts. No pair has independent adjudication or a compiler-accepted final report, so no performance or advantage is claimed.

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

| Preregistered task                       | ProofEra-hired agent | Without agent    | Publishable |
| ---------------------------------------- | -------------------- | ---------------- | ----------- |
| 01 — PancakeSwap LP range decision       | **RAW CAPTURED**     | **RAW CAPTURED** | No          |
| 02 — autonomous-session permission audit | **NOT RUN**          | **NOT RUN**      | No          |
| 03 — Venus health-factor replay          | **RAW CAPTURED**     | **RAW CAPTURED** | No          |

## Task 01 — PancakeSwap public-position LP range decision

Track alignment: trading, PancakeSwap, TermiX and the marketplace. Active preregistration: [`task-01-lp-range-v2.json`](../evidence/termix/preregistrations/task-01-lp-range-v2.json), definition SHA-256 `9ac77645f2dd0ade20203b911cba18ce52b7b016fae8d9e73aa2919440b572ab`. The never-run PTA/WBNB v1 protocol remains unchanged under [`superseded-preregistrations/`](../evidence/termix/superseded-preregistrations/task-01-lp-range-v1.json); v2 does not rewrite it.

Exact task: from one immutable BSC-mainnet public USDT/WBNB Pancake V3 position bundle, validate the retained source and an exact-hash `slot0` replay; calculate in-range and boundary state; and return exact tick buffers, policy violations, supplied known economics, explicitly unavailable economics, a bounded decision, rationale and limitations. Position `7152618` belongs to an unrelated public address. Both methods are read-only and may never infer ProofEra ownership, authority, performance or execution.

The shared candidate bundle is retained at [`116342186-7152618.canonical-json`](../evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json), logical SHA-256 `3459eb2566621c4d74acef68c84849e59b74214c7a21d7d20b8bbc6352dda945`. It binds the exact evidence-file digest, block/hash, pool, manager, position, expected tick and byte-equivalent agent request. The chain-97 registration, paid hire receipt, declaration and finalized agent-first order now exist. The bundle remains an input, not a result; both exact method invocations, manual transcript, second review and paired validation are still absent.

Fixed constraints separate source-data chain 56 from ERC-8004/hire chain 97; require identical bundle and exact-hash `slot0` access; forbid all timed wallet/write activity and undeclared network access; and preserve the third-party non-authority label.

Rubric (100): verified inputs 25; range/risk accuracy 25; economics/decision integrity 25; explanation/uncertainty 10; reproducibility 15. Wrong source/commerce chain, block/hash, contract, position, tick, evidence digest or RPC origin; any timed write/wallet use; any ownership/performance overclaim; fabricated value; undeclared access; or paired mismatch is a hard fail.

Both fixed lanes used declaration SHA-256 `776c41fd1043d0541f2c67d2cb6a7306bf7738def026bb78b36b868b6ca9edd3`. The retained agent capture is `pancake-lp-agent-20260818-v4`; the retained manual capture is `pancake-lp-manual-20260818-v1`. Both returned `insufficient_evidence` from the same exact-hash source and preserve their unedited outputs, timing, receipts and limitations. The manual no-agent declaration still requires independent tool-log review, rubric scoring and final paired validation.

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

Available release-gated manual command—also not currently runnable as a benchmark:

```bash
pnpm run:termix:pancake-lp-manual -- --execute-exact-pancake-lp-manual-run --input-bundle evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json
```

The manual CLI accepts only bounded LF-only UTF-8 NDJSON, makes no network or
agent request itself, timestamps each operator event as consumed, and writes a
new immutable capture beneath `evidence/termix/runs/pancake-lp/manual/`.

Raw lanes: **CAPTURED**. Independent adjudication and final paired result: **NOT RUN / NON-PUBLISHABLE**.

## Task 02 — Altana/Pancake autonomous-session permission audit

Track alignment: security, Altana, PancakeSwap and TermiX. Preregistration: [`task-02-permission-audit.json`](../evidence/termix/preregistrations/task-02-permission-audit.json), definition SHA-256 `1191c85c4f36881be0736ced51fc6c23e24286101543bf0838346b0e2ed95645`.

Exact task: audit one immutable, secret-free BSC testnet activation bundle containing the grant intent, decoded direct calls, code/selector attestation, spend/expiry policy, durable reservation/claim state, quote times, authority lifecycle receipts, pinned SDK behavior and a blind adversarial corpus. Return evidence-linked findings, severity/impact, safe reproduction and a corrected table that accurately labels Altana/onchain, ProofEra runtime and explicit-wallet enforcement.

Inputs still to bind: final activation proposal; exact block/code/authority evidence; deployed grant-claim database receipt; real grant/probe/revoke receipts; blind corpus and reviewer-held answer-key digest; pinned SDK/documentation artifacts; registered/hireable audit agent; manual procedure; release commit; and timed runner. No secret or signer material may enter the bundle.

Available implementation boundary: `@proofera/benchmarks` now includes a strict deterministic audit engine for the canonical secret-free bundle. It requires distinct role-bound proposal, corpus, lifecycle, code, SDK and database-deployment evidence; ordered distinct grant/revoke receipts; exact code-policy parity; and complete evidence joins. It rejects duplicate/unbound cases, compares direct targets/selectors/code/recipient/token, chain, expiry, quote age, spend bounds, retry, revoke and signer-exposure markers, and emits a corrected three-layer enforcement table. A separate fixed read-only RPC plan admits only chain ID, the two named lifecycle receipt reads, and exact-block runtime-code reads; raw responses must match chain 97, successful transaction/block joins and attested code bytes. The fixed manual lane additionally requires positive timed work, all artifact digests exactly once, every fixed RPC observation, all five preregistered declaration-input joins, no hire receipt and a canonical output with `agentInvoked: false`. The fixed agent lane cannot reach any network until the outer runner validates a registered ERC-8004 identity and verified hire receipt; it then completes the same RPC plan before one fixed A2A skill and accepts only an exact-bundle, explicitly non-executing output. The `audit_altana_permission_bundle` skill is live on the public LP endpoint, where a valid synthetic local/public smoke returned matching bundle digests and `executionPerformed: false` on 2026-08-17; 20 agent tests/build/audit pass and a benchmark parity test proves byte-identical canonical output. That smoke is availability/parity evidence only. These synthetic engine/RPC/lane/parity tests and probes are not a TermiX run, transcript, receipt, finding against the final bundle or performance evidence.

Rubric (100): true-positive coverage 35; false-positive discipline 15; impact/reproduction 15; least-authority correction 20; evidence/reproducibility 15. Missing a seeded generic dispatcher, session-signer leak, wrong target/recipient/token/chain, unbounded spend, unsafe unknown-outcome retry or revoke failure is a hard fail. A secret exposure or timed write is also a hard fail.

Required evidence: identical frozen proposal/corpus/source bundle; raw and normalized findings; timing/cost/tool log; post-run answer-key adjudication; the exact authority transaction and API receipt re-observed in each run; and real ProofEra hire evidence for the agent method. None exists yet.

Available prerequisite commands—not paired audit execution:

```bash
pnpm --filter @proofera/integrations exec vitest run src/altana-lp-activation-composition.server.test.ts src/altana-lp-handoff.test.ts src/altana-grant.test.ts
pnpm --filter @proofera/benchmarks test
```

The create-only agent entrypoint is `pnpm run:termix:permission-audit-agent -- --execute-exact-permission-audit-agent-run --input-bundle <tracked-canonical-bundle>`. It requires the byte-exact invocation on standard input, a clean published release, registered identity and verified hire before its fixed RPC/A2A lane can start. The create-only manual entrypoint is `pnpm run:termix:permission-audit-manual -- --execute-exact-permission-audit-manual-run --input-bundle <same-tracked-canonical-bundle>`; its first bounded NDJSON line binds the request and subsequent lines are timestamped operator events consumed by the no-agent/no-network lane. Both final invocations remain **UNBOUND** until the real declaration, identity, hire, bundle and run order are frozen. Agent result: **NOT RUN**. Manual result: **NOT RUN**; neither lane has been invoked with benchmark evidence.

## Task 03 — Venus health-factor replay and intervention decision

Track alignment: lending/health monitoring, TermiX and equal four-category depth. Preregistration: [`task-03-venus-health.json`](../evidence/termix/preregistrations/task-03-venus-health.json), definition SHA-256 `c15ed1089fdeb75eab7db3134f08c011fd71bfe02ec2c3dbf3052592973c8c55`.

This is the strongest third task because it is a high-stakes, objectively replayable safety decision: exact-block collateral, debt, price and threshold calculations can be independently recomputed, while stale-source handling and intervention bounds expose unsafe automation. This rationale is a design choice, not a performance claim.

Exact task: replay one frozen BSC testnet Venus account window; calculate health factor at every observation; identify the first warning/critical crossing, minimum health factor and alert latency; then choose no action, alert-only or a bounded unsigned intervention plan under one identical policy. The timed comparison never signs or broadcasts.

The final shared input is now frozen at [`3ba85859ced3-125563831-125564152.canonical-json`](../evidence/termix/frozen/venus-health/3ba85859ced3-125563831-125564152.canonical-json), SHA-256 `2aae6eb07730c2dc6bd6333261e57a6d352fc7ea21572ef5f71c3652b194c7ba`. It binds the three-observation, two-provider BSC-testnet window `125563831`-`125564152`, the official Core Pool Comptroller/oracle context, integer operands and policy. The selected account is explicitly an unrelated public replay subject: ownership and execution authority are false.

The normalized declaration SHA-256 is `987a9e2a728807d6fbd4d5f1d9bb066187288320fa48ec62ab214d89aebed472`, bound to source release `3ba85859ced39b457da819d27637d3fc02101c5d` and ERC-8004 agent `1828`. It was published in commit `e5c48b9` before BSC-testnet randomness block `125568071`. Both fixed RPCs later agreed on hash `0x64e197a460b7edc8e015d9e10110eff0be37158100feaa230708991fcdce5d0c`; LSB `0` forces `agent` then `manual`. Retained verifier tests prove the publication ordering, finality, provider agreement, request/declaration digests and non-authority claims.

The original frozen release was superseded after a manual-release scope drift was detected. The valid replacement declaration SHA-256 is `23e41675965eed45dbd876ab4fdb221c1d403f538b5088bc52dd5c722ab33924`, bound to source release `402edbeae429fd7c0a3d853b1e30208a26bba6f4`. Its valid retained lanes are `venus-health-agent-20260818-v2` and `venus-health-manual-20260818-v2`; both returned `hold`. Still missing: independent tool-log review, rubric scoring and final paired validation.

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

The fixed agent/manual Venus lanes and root create-only agent/manual CLIs are
implemented and tested. The agent path digest-binds the canonical request,
public endpoint and configuration; preserves the raw A2A response; verifies a
clean published source commit and committed input; and rejects malformed or
widened responses. The outer runner rejects an unregistered agent or missing
verified hire receipt before HTTP. The manual path calls neither agent nor
network: it timestamps positive operator-active segments, accepts only exact
read-only exchanges from two fixed BSC-testnet RPC origins inside active work,
and binds canonical output to the same request digest and procedure. Its
no-agent declaration is not self-authenticating and remains a second-review
gate. These runner capabilities produced the valid v2 raw captures; independent
review and final pairing remain separate gates.

Release-gated commands; the forced agent-first command remains blocked until a verified hire receipt is supplied through the exact stdin invocation:

```bash
pnpm run:termix:venus-agent -- --execute-exact-venus-health-agent-run --request-input evidence/termix/frozen/venus-health/3ba85859ced3-125563831-125564152.canonical-json
pnpm run:termix:venus-manual -- --execute-exact-venus-health-manual-run --request-input evidence/termix/frozen/venus-health/3ba85859ced3-125563831-125564152.canonical-json
```

The manual CLI consumes bounded LF-only UTF-8 NDJSON, makes no network or agent
request itself, and writes create-only beneath
`evidence/termix/runs/venus-health/manual/`.

Request paths, run order and the paid hire receipt are **BOUND**. The valid replacement lanes completed on 2026-08-18 and retained `venus-health-agent-20260818-v2.json` plus `manual/venus-health-manual-20260818-v2.json`. Their active durations are `852,940,800 ns` and `6,710,400 ns`; both produced the bounded decision `hold`. These raw values are not a publishable comparison: second review and paired validation are absent, so no advantage is claimed.

## Freeze, run and publication gates

For each task, in order:

1. Bind every exact input/environment value and timed command from real sources; add no placeholder.
2. Register and expose the real agent through ProofEra; capture identity and hire evidence without embedding secrets.
3. Generate one `BenchmarkDeclaration`, validate it and record its digest for both methods.
4. Freeze the manual procedure and agent configuration, then choose run order from the declared rule.
5. Execute both methods with injected timing and raw output/receipt capture; do not repair outputs after the fact.
6. Have a second reviewer reproduce calculations, verify receipts and score every rubric criterion.
7. Validate the complete pair with `PairedBenchmarkSchema`. Failed/inconclusive runs stay visible.
8. Commit all three verified pairs and independent adjudications, then use the exact-release final
   compiler to produce separate digest-bound `paired_report`, `raw_runs` and `adjudication`
   artifacts. The compiler rejects any missing task, unverified lane, null comparison or digest
   mismatch and never infers a universal winner.

After all six runs and three reviews—not before—the release-gated compilation command is:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
$canonicalInvocation | corepack pnpm compile:termix:final $releaseCommit
```

`$canonicalInvocation` must be one canonical JSON value containing exactly the three task IDs and
their committed pair/adjudication paths. The generated files are create-only under
`evidence/submission/final/termix/<releaseCommit>/`; their existence does not replace the required
manual opening of explorer links and source artifacts.

A task becomes publishable only when both complete runs are independently verified by the harness and every external receipt/source link is manually opened. “Agent advantage” is then reported per task and per measure only. Three experiments cannot support a universal productivity claim.
