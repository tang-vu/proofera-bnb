# ProofEra LP Range Agent — read-only A2A + MCP

`analyze_lp_range` deterministically evaluates a bounded caller-supplied
PancakeSwap V3 position snapshot on BSC 56 or 97. Inputs include exact
block/time/source identity, pool and position-manager addresses, tick range,
capital constraints, and optional fee/gas/slippage values in common decimal
minor units.

The result preserves exact tick buffers and bigint economics and returns
`hold`, `review_rebalance`, or `insufficient_evidence`. The agent never fetches
or independently attests a snapshot, and never negotiates, signs, approves,
rebalances, submits a transaction, or holds a wallet. `executionEnabled` is
always `false`. `review_rebalance` means human review only. ProofEra's separate
scoped worker owns any future execution, receipt reconciliation, and revoke
flow.

## Runtime contract

`studio.toml` declares only an AgentCore runtime with A2A and MCP faces on BSC
testnet by default. It contains no wallet, LLM, payment, storage, or budget
section. The server exposes:

- `GET /ping`;
- `GET /.well-known/agent-card.json`;
- A2A JSON-RPC at `/`; and
- stateful streamable HTTP MCP at `/mcp`.

The production graph does not include the commerce-capable Studio runtime. A
local route- and header-allowlisted adapter supports Studio's bounded HTTP
envelope format, prevents recursive dispatch, and returns sanitized bounded
errors without adding a seller or payment surface.

M1 has no application-layer authentication, so the Agent Card omits `security`
and `securitySchemes`. Setting `OAUTH_TOKEN_URL` or `OAUTH_SCOPE` fails startup
until enforcement exists. Public deployment still requires platform ingress
controls.

Requests use a 256 KiB JSON-body limit and 16 KiB HTTP-header limit. Responses
set no-store, no-sniff, no-frame, no-referrer, content-security, permissions,
and cross-origin-resource headers. Malformed, oversized, and internal errors
return bounded JSON without internal details. Production timeouts are 10
seconds for headers, 30 seconds for the full request/socket, and 5 seconds for
keep-alive.

MCP uses cryptographically random UUID session IDs, a 64-session bound,
five-minute idle expiry with transport disposal, and a global 64-per-minute
initialization limit. It never trusts forwarded identity headers. A trusted
deployment may inject a server-authenticated admission identity and limiter.

## Verify and run

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm audit:prod
corepack pnpm start
```

`verify` runs formatting, strict lint, typecheck, deterministic domain and
loopback HTTP tests, then a production build. No command above deploys or
performs a wallet action.
