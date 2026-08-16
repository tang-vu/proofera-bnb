# TermiX evidence boundary

Status: **NOT RUN**. Nothing in this directory is a benchmark result or a publishable agent-advantage claim.

`preregistrations/` contains exactly three schema-validated ProofEra-versus-manual protocols:

| File                            | Task                             | Definition SHA-256                                                 | State                             |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| `task-01-lp-range.json`         | PancakeSwap V3 LP range decision | `edc4ae168600c9de5008adb59bf6cd2b6bd85333713c9b17afc76116fc13239d` | agent `NOT RUN`; manual `NOT RUN` |
| `task-02-permission-audit.json` | Altana/Pancake permission audit  | `1191c85c4f36881be0736ced51fc6c23e24286101543bf0838346b0e2ed95645` | agent `NOT RUN`; manual `NOT RUN` |
| `task-03-venus-health.json`     | Venus health-factor replay       | `c15ed1089fdeb75eab7db3134f08c011fd71bfe02ec2c3dbf3052592973c8c55` | agent `NOT RUN`; manual `NOT RUN` |

The digest covers the exact task, required input-binding rules, fixed constraints, environment-binding rules, rubric, hard-fail rules, parity controls, measurements, artifacts, receipts and reproduction plan. It is local tamper evidence, not an external timestamp or proof that a run occurred. Changing a definition requires a new version and digest; it must not overwrite the protocol used by a started run.

Exact account, position, blocks, policies, endpoints, registered agent identities, configurations, release commit and timed runner commands are deliberately `UNBOUND`. Treating placeholder values as exact benchmark inputs would create false evidence. A protocol stays non-publishable until those fields are frozen once into one `BenchmarkDeclaration` and that byte-equivalent declaration is used by both runs.

Validate the preregistrations and paired-run harness:

```bash
pnpm --filter @proofera/benchmarks typecheck
pnpm --filter @proofera/benchmarks test
```

The tests perform no network request, agent invocation, wallet operation, transaction, timing measurement or result generation. Task-specific prerequisite commands are recorded inside each JSON file. Their timed runner commands remain `null` until a real reproducible runner and exact inputs exist.

Future raw run material belongs in a new run-ID directory, never inside `preregistrations/`. It must include the frozen declaration, raw inputs and outputs, UTC and monotonic timing, active-time segments, sourced integer costs, API/transaction receipts when required, rubric-complete second review, hashes, reproduction logs and limitations. Secrets and signer material are forbidden.

The read-only Venus preparation collector can be run against two fixed public BSC-testnet RPC origins without changing a preregistration:

```text
pnpm collect:termix:venus -- --account <address> --latest-finalized
```

It enumerates the official Core Pool's complete `getAllMarkets` set, binds one finalized block/hash, retains exact account snapshots, market parameters, runtime code and oracle prices, and requires both providers to agree before deriving health-factor evidence with Venus's integer truncation order. It rejects VAI debt because the current Health Guardian input cannot represent that debt. The default command prints only a non-publishable summary. `--write-development-evidence` writes a new immutable development capture only from a clean commit; that capture remains `NOT_RUN` and is not a hire receipt, alert receipt, frozen benchmark declaration or TermiX result.
