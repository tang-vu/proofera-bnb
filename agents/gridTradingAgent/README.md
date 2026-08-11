# ProofEra Grid Trading reference analyzer

This package is a deterministic, read-only BSC 56/97 analyzer for a proposed
equal-price-step grid. It does not fetch data, hold a wallet, sign, trade, or
write files. The caller must provide current price, grid range, one-way trading
fee, estimated round-trip gas, capital bounds, risk constraints, timestamps,
and provenance.

The analyzer returns one of:

- `review_grid`: the supplied candidate passes the declared evidence and
  safety constraints and warrants human review.
- `hold`: current evidence is complete, but a declared safety constraint is
  violated.
- `insufficient_evidence`: required evidence is missing, stale, or
  future-dated.

`review_grid` is not a return forecast or authorization to trade.
`executionEnabled` is always `false`. Realized fills, PnL, win rate, maximum
drawdown, and performance are explicitly unknown until receipts and outcome
observations exist.

## BNB Agent Studio runtime

`app/agent/studio.toml` declares one AgentCore runtime with A2A and MCP faces.
The production entrypoint hosts both protocols on one bounded HTTP server:

- `GET /ping` reports `executionEnabled:false`;
- `GET /.well-known/agent-card.json` returns the honest unauthenticated card;
- A2A JSON-RPC is served at the application root; and
- stateful streamable-HTTP MCP is served at `/mcp`.

The server accepts at most 256 KiB of JSON and 16 KiB of request headers. It
uses security headers and bounded request/header/socket timers. MCP uses
256-bit cryptographically random capability IDs, admits at most 64 active or
pending sessions and 64 initializations per rolling minute, expires idle
sessions after at most 15 minutes, and rejects unknown, expired, guessed, or
colliding capabilities. A2A requires exactly one structured data part.

The Agent Card intentionally advertises no authentication scheme. Startup
rejects authentication-advertisement environment names until authentication is
actually enforced. No wallet, LLM, x402 seller, payment, storage, signer,
network fetch, trading, or write capability is configured.

Transport configuration is non-secret and fail-safe:

- `AGENT_PORT`: canonical decimal port, default `9000`;
- `AGENT_BIND_HOST`: validated listener host, default `0.0.0.0`;
- `AGENTCORE_RUNTIME_URL`: HTTPS public Agent Card URL; loopback HTTP is
  accepted only for local development; and
- `AGENT_HOST`: loopback-only fallback host for local development.

Before any testnet deployment, run `bag doctor` and `bag deploy prepare` from
`app/agent`. Those commands prepare deployment only; this package does not
deploy, register, fund, or publish an agent as part of verification.

## Local verification

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm audit:prod
```

The nested `app/agent` package owns all exact-pinned dependencies. Its exports
provide the pure analyzer, A2A executor and Agent Card, in-process MCP builder,
and the bounded dual-protocol production server. The runtime contains no
outbound network client or signing path.
