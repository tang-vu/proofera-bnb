# ProofEra paired benchmark harness

This package validates and summarizes paired TermiX experiments. Its generic
schemas and timing core do not execute shell commands, read chains, generate
receipts, or fill missing values. The separately exported Venus agent lane can
make one fixed public A2A request only after the caller supplies all outer
eligibility evidence.

Each agent and manual run carries its own immutable declaration. A pair is rejected unless the exact task, inputs, constraints, environment, receipt expectations, and pre-declared quality rubric match after canonical normalization. Costs stay in integer minor units and are grouped by denomination; the harness never performs exchange-rate conversion.

Evidence states are explicit:

- `incomplete`: required timing, cost, output, assessment, or receipt evidence is absent and named.
- `unverified`: the record is structurally complete, but independent verification is not claimed.
- `verified`: the record is structurally complete, required receipts are present and verified, and verification evidence is identified.

The summary exposes raw paired deltas only when the underlying fields are complete and sets `publishableClaim` only when both runs are verified. It never declares a winner.

`runTermixTimedMethod` is the fail-closed timing core for the six fixed ProofEra lanes (three preregistered tasks × agent/manual). It accepts no shell command. Before invoking a lane adapter it requires a clean commit matching the normalized declaration digest; agent lanes additionally require a registered ERC-8004 reference and a SHA-256-bound, independently verified hire receipt. Captures retain UTC and monotonic wall time, bounded non-overlapping active segments, raw output/API response bytes and hashes, and the raw public hire receipt. This runner does not bind a preregistration, hire an agent, score output, or make a run publishable by itself.

`runVenusHealthAgentTermixMethod` implements only the fixed public Health
Guardian agent lane. Its endpoint, A2A method, safety limits and redirect policy
are configuration-digest bound; the canonical request digest, endpoint and
configuration must also appear in the shared declaration. It captures the raw
A2A response and rejects malformed envelopes, mismatched IDs, agent errors,
oversized responses or any output that widens the analyzer's five false trust
and execution flags. The outer runner still rejects missing ERC-8004 identity
or verified hire receipt before this lane can make its HTTP request. The A2A
receipt does not independently authenticate the frozen Venus RPC evidence.

The root `pnpm run:termix:venus-agent` CLI is the create-only production entry
for that lane. It accepts the public invocation on standard input, requires a
canonical Health request already committed under
`evidence/termix/frozen/venus-health/`, verifies a clean `HEAD` equal to
`origin/main`, and writes only a new capture under
`evidence/termix/runs/venus-health/`. The exact final invocation remains
unbound until the real declaration, ERC-8004 identity and hire receipt exist.

```bash
pnpm --filter @proofera/benchmarks typecheck
pnpm --filter @proofera/benchmarks test
```
