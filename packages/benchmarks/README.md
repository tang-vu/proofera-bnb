# ProofEra paired benchmark harness

This package validates and summarizes paired TermiX experiments. It does not run agents, execute reproduction commands, contact APIs, read chains, generate receipts, or fill missing values.

Each agent and manual run carries its own immutable declaration. A pair is rejected unless the exact task, inputs, constraints, environment, receipt expectations, and pre-declared quality rubric match after canonical normalization. Costs stay in integer minor units and are grouped by denomination; the harness never performs exchange-rate conversion.

Evidence states are explicit:

- `incomplete`: required timing, cost, output, assessment, or receipt evidence is absent and named.
- `unverified`: the record is structurally complete, but independent verification is not claimed.
- `verified`: the record is structurally complete, required receipts are present and verified, and verification evidence is identified.

The summary exposes raw paired deltas only when the underlying fields are complete and sets `publishableClaim` only when both runs are verified. It never declares a winner.

```bash
pnpm --filter @proofera/benchmarks typecheck
pnpm --filter @proofera/benchmarks test
```
