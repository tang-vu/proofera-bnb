# ProofEra paired benchmark harness

This package validates and summarizes paired TermiX experiments. Its generic
schemas and timing core do not execute shell commands, read chains, generate
receipts, or fill missing values. Separately exported LP and Venus lanes make
only their fixed read-only API/A2A requests after the caller supplies all outer
eligibility evidence.

Each agent and manual run carries its own immutable declaration. A pair is rejected unless the exact task, inputs, constraints, environment, receipt expectations, and pre-declared quality rubric match after canonical normalization. Costs stay in integer minor units and are grouped by denomination; the harness never performs exchange-rate conversion.

Evidence states are explicit:

- `incomplete`: required timing, cost, output, assessment, or receipt evidence is absent and named.
- `unverified`: the record is structurally complete, but independent verification is not claimed.
- `verified`: the record is structurally complete, required receipts are present and verified, and verification evidence is identified.

The summary exposes raw paired deltas only when the underlying fields are complete and sets `publishableClaim` only when both runs are verified. It never declares a winner.

`runTermixTimedMethod` is the fail-closed timing core for the six fixed ProofEra lanes (three preregistered tasks × agent/manual). It accepts no shell command. Before invoking a lane adapter it validates the caller's clean-commit assertion against the declaration commit; production CLIs independently verify the actual worktree, `HEAD`, and `origin/main`. Agent lanes additionally require a registered ERC-8004 reference and a SHA-256-bound, independently verified hire receipt. A declaration may explicitly bind an agent-registry/hire chain distinct from its source-data chain; absent that parameter, the source chain remains the required commerce chain. Captures retain UTC and monotonic wall time, bounded non-overlapping active segments, raw output/API response bytes and hashes, and the raw public hire receipt. This runner does not bind a preregistration, hire an agent, score output, or make a run publishable by itself.

`runPancakeLpAgentTermixMethod` binds one canonical input-bundle digest, the
fixed BSC-mainnet PublicNode origin and the fixed public LP A2A endpoint. It
first replays `slot0` using the exact block hash and rejects tick drift, then
invokes the agent and rejects identity/tick drift or widened execution. The
matching `runPancakeLpManualTermixMethod` records exactly one equivalent RPC
exchange inside positive operator-active time and preserves one unedited
canonical output. It never contacts an agent. Its `agentInvoked: false` field
still requires independent tool-log review.

The root `pnpm run:termix:pancake-lp-agent` CLI requires a clean published
commit and byte-exact tracked bundle, and writes one create-only capture under
`evidence/termix/runs/pancake-lp/`. Registration and verified hire evidence
are checked before either the exact-hash source read or A2A call. No final LP
invocation or result exists.

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

The root `pnpm run:termix:permission-audit-agent` CLI applies the same clean,
published-release and byte-exact committed-input boundary to Task 02. It writes
only a new capture under `evidence/termix/runs/permission-audit/agent/` and the
lane cannot reach its fixed RPC/A2A calls until the request proves chain-97
registration and a verified hire receipt. This entrypoint does not create a
final bundle or benchmark result by itself.

`runVenusHealthManualTermixMethod` is the matching non-agent session state
machine. It consumes operator events without calling an agent or network:
positive monotonic active segments, exact read-only exchanges from either of
the two fixed BSC-testnet RPC origins, and one canonical output bound to the
same request digest and frozen manual procedure. Write RPCs, agent endpoints,
API events outside active work, nested/mismatched segments, post-output events
and identity drift fail closed. Its `agentInvoked: false` field remains an
unauthenticated method declaration requiring independent tool-log review.

```bash
pnpm --filter @proofera/benchmarks typecheck
pnpm --filter @proofera/benchmarks test
```
