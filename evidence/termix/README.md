# TermiX evidence boundary

Status: **PARTIAL RAW CAPTURE / NON-PUBLISHABLE**. Task 01 and Task 03 each retain an agent and manual raw capture. Task 02 has a frozen published declaration and remains unrun while its public randomness is unresolved. Nothing in this directory is yet a final paired result or a publishable agent-advantage claim.

`preregistrations/` contains exactly three schema-validated ProofEra-versus-manual protocols:

| File                            | Task                             | Definition SHA-256                                                 | State                               |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| `task-01-lp-range-v2.json`      | PancakeSwap V3 LP range decision | `9ac77645f2dd0ade20203b911cba18ce52b7b016fae8d9e73aa2919440b572ab` | raw lanes captured; not adjudicated |
| `task-02-permission-audit.json` | Altana/Pancake permission audit  | `1191c85c4f36881be0736ced51fc6c23e24286101543bf0838346b0e2ed95645` | frozen; randomness unresolved       |
| `task-03-venus-health.json`     | Venus health-factor replay       | `c15ed1089fdeb75eab7db3134f08c011fd71bfe02ec2c3dbf3052592973c8c55` | raw lanes captured; not adjudicated |

Task 01 v1 required a ProofEra-controlled PTA/WBNB testnet position that never
existed. It was never run and remains byte-for-byte preserved under
`superseded-preregistrations/`; v2 is a new digest rather than a rewrite. V2
uses the retained public USDT/WBNB mainnet position strictly for read-only
decision support, with source chain 56 separated from ERC-8004/hire chain 97.

The digest covers the exact task, required input-binding rules, fixed constraints, environment-binding rules, rubric, hard-fail rules, parity controls, measurements, artifacts, receipts and reproduction plan. It is local tamper evidence, not an external timestamp or proof that a run occurred. Changing a definition requires a new version and digest; it must not overwrite the protocol used by a started run.

The LP and Venus declarations, registered identities, hire receipts, run-order seeds, exact inputs and timed invocations were bound before their retained raw captures. LP uses `pancake-lp-agent-20260818-v4` and `pancake-lp-manual-20260818-v1`; Venus uses `venus-health-agent-20260818-v2` and `venus-health-manual-20260818-v2`. These files preserve timing, exact outputs, receipts and limitations but do not self-prove the no-agent boundary or assign rubric scores. Independent adjudication and schema-valid paired artifacts are still required before either comparison is publishable. Task 02 now binds the retained Altana lifecycle, code observation, staging database receipt, public proof-worker state, blind corpus, Agent `1825`, verified hire and reviewer-held answer-key digest in [`38046f87b87c-126555555.json`](./declarations/permission-audit/38046f87b87c-126555555.json). Its run order and both runs remain absent.

Task 02's deterministic `audit_altana_permission_bundle` v1.1 skill is live on the public LP A2A endpoint and its Agent Card advertises that exact ID. A secret-free local/public smoke on 2026-08-22 returned byte-equivalent canonical output for the frozen bundle, exact bundle digest and `executionPerformed: false`. This is capability availability/parity only: it is not a timed run, raw benchmark transcript, adjudication, scored finding or advantage claim. Both create-only Task 02 CLIs and the run-order collector exist; invocations remain absent until randomness resolves.

Validate the preregistrations and paired-run harness:

```bash
pnpm --filter @proofera/benchmarks typecheck
pnpm --filter @proofera/benchmarks test
```

The tests perform no network request, wallet operation, transaction, real timing measurement or result generation. Subprocess tests prove the production CLIs fail before network/output access when exact invocation material is absent. Task-specific prerequisite commands are recorded inside each JSON file. Their final timed invocations remain `null` until the release, identity, hire and run-order bindings exist.

Future raw run material belongs in a new run-ID directory, never inside `preregistrations/`. It must include the frozen declaration, raw inputs and outputs, UTC and monotonic timing, active-time segments, sourced integer costs, API/transaction receipts when required, rubric-complete second review, hashes, reproduction logs and limitations. Secrets and signer material are forbidden.

The create-only Venus agent runner is available as:

```text
pnpm run:termix:venus-agent -- --execute-exact-venus-health-agent-run --request-input evidence/termix/frozen/venus-health/<bound-request>.canonical-json
```

It reads the public timed invocation from standard input. It requires a clean,
published source commit and byte-exact committed request, then writes one new
capture beneath `runs/venus-health/`. The command is not currently runnable as
a benchmark because no final request, registered agent identity or verified
hire receipt exists.

The create-only LP agent runner is available as:

```text
pnpm run:termix:pancake-lp-agent -- --execute-exact-pancake-lp-agent-run --input-bundle evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json
```

It requires a clean published commit, the tracked byte-exact bundle, chain-97
registration and verified hire receipt before its exact-hash mainnet RPC read
or public A2A request can occur. The valid retained agent capture is
`pancake-lp-agent-20260818-v4.json`.

The matching create-only LP manual runner is available as:

```text
pnpm run:termix:pancake-lp-manual -- --execute-exact-pancake-lp-manual-run --input-bundle evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json
```

Its bounded LF-only UTF-8 NDJSON input binds the timed request and bundle digest,
then timestamps operator-active segments, the one exact read-only `slot0`
exchange, and the unedited canonical worksheet output. It makes no network or
agent request itself and writes create-only under `runs/pancake-lp/manual/`.

The create-only Task 02 agent runner is available as:

```text
pnpm run:termix:permission-audit-agent -- --execute-exact-permission-audit-agent-run --input-bundle evidence/termix/frozen/permission-audit/<bound-bundle>.canonical-json
```

It accepts only a tracked, byte-exact canonical bundle and a bounded standard-input invocation. It requires a clean published commit, chain-97 registration and verified hire receipt before the fixed read-only RPC plan or public A2A request can occur. It writes one new immutable capture beneath `runs/permission-audit/agent/`. The active final bundle exists; no invocation or Task 02 run exists yet.

The matching create-only manual runner is available as:

```text
pnpm run:termix:permission-audit-manual -- --execute-exact-permission-audit-manual-run --input-bundle evidence/termix/frozen/permission-audit/<bound-bundle>.canonical-json
```

Its standard input is bounded, LF-only UTF-8 NDJSON: the first line binds the timed request and bundle digest; subsequent lines are the operator's active-segment, exact artifact-read, fixed RPC-exchange and canonical-output events. The lane timestamps events as they are consumed and makes no agent or network request. It writes only a new capture beneath `runs/permission-audit/manual/`. This interface does not prove operator identity or absence of unreported tools; independent log review remains required.

The read-only Venus preparation collector can be run against two fixed public BSC-testnet RPC origins without changing a preregistration:

```text
pnpm collect:termix:venus -- --account <address> --latest-finalized
```

It enumerates the official Core Pool's complete `getAllMarkets` set, binds one finalized block/hash, retains exact account snapshots, market parameters, runtime code and oracle prices, and requires both providers to agree before deriving health-factor evidence with Venus's integer truncation order. It rejects VAI debt because the current Health Guardian input cannot represent that debt. The default command prints only a non-publishable summary. `--write-development-evidence` writes a new immutable development capture only from a clean commit; that capture remains `NOT_RUN` and is not a hire receipt, alert receipt, frozen benchmark declaration or TermiX result.

The matching create-only Venus manual runner is available as:

```text
pnpm run:termix:venus-manual -- --execute-exact-venus-health-manual-run --request-input evidence/termix/frozen/venus-health/<bound-request>.canonical-json
```

Its bounded LF-only UTF-8 NDJSON input binds the same timed request and request
digest, then timestamps operator-active segments, fixed read-only RPC exchanges,
and the unedited canonical worksheet output. It makes no network or agent request
itself and writes create-only under `runs/venus-health/manual/`.
