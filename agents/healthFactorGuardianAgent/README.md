# ProofEra Health-Factor Guardian reference analyzer

This package is a deterministic, read-only health-factor analyzer for the
Venus Core Pool on BSC 56 and 97. It does not fetch data, hold a wallet, sign,
submit transactions, or write runtime state.

The caller supplies a complete same-block collateral/debt snapshot, raw vToken
balances, borrow balances, exchange-rate and oracle-price mantissas, effective
user liquidation thresholds, explicit fixed-point scales, the derived values,
observation history, alert-delivery receipts, optional execution receipts,
timestamps, and provenance. Every current source must bind the requested
account and exact block number/hash/timestamp to the chain-specific official
Venus Core Pool Comptroller, a closed typed read method, and the relevant
market/vToken set.
Collateral and debt must use one documented `usd` quote unit and one scale. An
unrelated contract or free-text read cannot produce a health factor.

The analyzer returns `hold`, `monitor`, `review_intervention`, or
`insufficient_evidence`; every response sets `sourceContentsVerified`,
`freshnessAttestedByAgent`, `marketplaceEligible`, `activationEligible`, and
`executionEnabled` to `false`.

Every result is explicitly marked `evidenceMode:
"caller_supplied_unverified"`. BSC chain selection describes the evidence's
claimed chain context; it is not a claim that a fixture, URL, transaction, or
receipt was independently verified. Evidence URLs must use non-loopback HTTPS,
and zero addresses, block/transaction hashes, and digests are rejected.

Health factor is represented as an exact rational after matching Venus's
per-market integer truncation and operand order. With `mulExp(a, b) =
floor(a * b / 10^18)`, each multiplication first rejects a uint256 overflow:

```text
sum(mulExp(mulExp(mulExp(effectiveThreshold, exchangeRate), oraclePrice), vTokenBalance))
-----------------------------------------------------------------------------------------
sum(mulExp(oraclePrice, borrowBalance))
```

The analyzer independently derives both supplied and adjusted USD-E18 values
from the raw operands and rejects either supplied derived value when it differs.
Each collateral market is truncated after every multiplication before the
adjusted values are summed, matching `ComptrollerLens`; reweighting an already
truncated collateral value is not accepted. Thresholds must use Venus Core
Pool's effective user-specific `USE_LIQUIDATION_THRESHOLD` result. A zero-debt
account is reported as not applicable, not infinity.

Every historical observation repeats complete raw collateral and debt
positions. The analyzer recomputes every position and aggregate, binds each
nested source to that observation's exact block, and requires the current
observation to equal the complete current snapshot. Historical minimum health
factor is withheld unless the series meets the configured count and duration.
Alert-latency status requires a complete, one-to-one set of receipts for every
threshold-crossing observation; duplicate receipts cannot increase evidence
count. Any evidenced latency breach remains a breach even if other receipt
coverage is missing.

Official methodology references checked 2026-08-11:

- https://docs-v4.venus.io/guides/liquidation
- https://docs-v4.venus.io/whats-new/e-mode
- https://github.com/VenusProtocol/venus-protocol/blob/develop/contracts/Lens/ComptrollerLens.sol#L291-L302

Venus documents forced-liquidation modes that can apply even when the ordinary
health rate is above one. This analyzer therefore reports ordinary threshold
risk only and never claims that a position is unconditionally non-liquidatable.
Caller-supplied execution receipt fields remain explicitly unverified: this
offline analyzer can check their internal context but cannot authenticate a
transaction hash, chain inclusion, or outcome.

`buildHealthFactorInputFromExactWindow` is the offline TermiX preparation
adapter. It accepts an explicitly authorized chain-97 account plus an ordered
window of two-provider-matched `proofera-venus-core-exact-block-evidence-v1.0.0`
artifacts. It independently rechecks every raw integer derivation, provider
identity/origin, observation time and window relationship, produces the strict
v1.3 input, and rejects any input that is not decision-ready under the frozen
policy. The returned manifest hashes every parsed evidence item. It never reads
the network or filesystem and does not turn its authorization reference into
an authenticated human identity, API receipt, hire receipt, alert receipt, or
TermiX run.

## BNB Agent Studio runtime

`app/agent/studio.toml` declares one AgentCore runtime with A2A and MCP faces.
The single-port server exposes:

- `GET /ping` with `executionEnabled:false`;
- `GET /.well-known/agent-card.json`;
- A2A JSON-RPC at the application root; and
- stateful streamable-HTTP MCP at `/mcp`.

The JSON body limit is 256 KiB. MCP is capped at 64 concurrent sessions and 64
initializations per rolling minute. Session identifiers are 256-bit random
capability values generated by Node's cryptographic RNG, not counters. Idle
sessions expire after at most 15 minutes and are explicitly closed by periodic
cleanup; deleted, expired, unknown, and guessed capabilities are rejected.
A2A accepts exactly one structured data part and rejects ambiguous envelopes.
The Studio envelope middleware is used only to transport A2A/MCP requests: no
x402 seller, payment, wallet, signer, or commerce route is configured.

Transport configuration is non-secret and fail-safe:

- `AGENT_PORT`: canonical decimal port, default `9000`;
- `AGENT_BIND_HOST`: validated listener host, default `0.0.0.0`;
- `AGENTCORE_RUNTIME_URL`: HTTPS public Agent Card URL; loopback HTTP is
  accepted only for local development; and
- `AGENT_HOST`: loopback-only fallback host for local development.

Run locally from this directory with `corepack pnpm dev`. Before a testnet
deployment, run `bag doctor` and `bag deploy prepare` from `app/agent`. These
commands prepare deployment only; this repository task does not deploy,
register, fund, or publish the agent.

## Local verification

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm audit:prod
```

The nested `app/agent` package exact-pins every dependency and exports the pure
analyzer, an A2A executor and Agent Card, and an in-process MCP server builder.
