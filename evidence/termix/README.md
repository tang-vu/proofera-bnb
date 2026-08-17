# TermiX evidence boundary

Status: **NOT RUN**. Nothing in this directory is a benchmark result or a publishable agent-advantage claim.

`preregistrations/` contains exactly three schema-validated ProofEra-versus-manual protocols:

| File                            | Task                             | Definition SHA-256                                                 | State                             |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| `task-01-lp-range-v2.json`      | PancakeSwap V3 LP range decision | `9ac77645f2dd0ade20203b911cba18ce52b7b016fae8d9e73aa2919440b572ab` | agent `NOT RUN`; manual `NOT RUN` |
| `task-02-permission-audit.json` | Altana/Pancake permission audit  | `1191c85c4f36881be0736ced51fc6c23e24286101543bf0838346b0e2ed95645` | agent `NOT RUN`; manual `NOT RUN` |
| `task-03-venus-health.json`     | Venus health-factor replay       | `c15ed1089fdeb75eab7db3134f08c011fd71bfe02ec2c3dbf3052592973c8c55` | agent `NOT RUN`; manual `NOT RUN` |

Task 01 v1 required a ProofEra-controlled PTA/WBNB testnet position that never
existed. It was never run and remains byte-for-byte preserved under
`superseded-preregistrations/`; v2 is a new digest rather than a rewrite. V2
uses the retained public USDT/WBNB mainnet position strictly for read-only
decision support, with source chain 56 separated from ERC-8004/hire chain 97.

The digest covers the exact task, required input-binding rules, fixed constraints, environment-binding rules, rubric, hard-fail rules, parity controls, measurements, artifacts, receipts and reproduction plan. It is local tamper evidence, not an external timestamp or proof that a run occurred. Changing a definition requires a new version and digest; it must not overwrite the protocol used by a started run.

Exact final declarations, registered agent identities, hire receipts, release commit, run-order seeds and timed invocation commands remain deliberately `UNBOUND`. A compact LP input candidate and both LP lanes now exist, and the Venus endpoint is code-fixed, but neither fact creates a run. Treating candidate values as final run evidence would create false evidence. A protocol stays non-publishable until all bindings are frozen once into one `BenchmarkDeclaration` and that byte-equivalent declaration is used by both runs.

Task 02's deterministic `audit_altana_permission_bundle` skill is live on the public LP A2A endpoint and its Agent Card advertises that exact ID. A valid synthetic local/public smoke on 2026-08-17 returned matching bundle digests and `executionPerformed: false`. This is capability availability/parity only: it is not a frozen Task 02 input, registered identity, verified hire, timed run, raw benchmark transcript, receipt, scored finding or advantage claim. Both create-only Task 02 CLIs exist; all final bindings remain absent.

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
or public A2A request can occur. No final invocation or LP benchmark run exists.

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

It accepts only a tracked, byte-exact canonical bundle and a bounded standard-input invocation. It requires a clean published commit, chain-97 registration and verified hire receipt before the fixed read-only RPC plan or public A2A request can occur. It writes one new immutable capture beneath `runs/permission-audit/agent/`. No final bundle, invocation or Task 02 run exists.

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
