# ProofEra Yield Optimisation Agent — A2A + MCP

`analyze_yield_opportunities` is a deterministic, read-only reference agent
for comparing explicitly sourced yield-vault snapshots on BSC mainnet (56) or
testnet (97). It never fetches data, connects a wallet, signs, approves, routes
capital, or submits a transaction. `executionEnabled` is always `false`.
The dimensioned evidence contract is schema version 2 and methodology
`proofera-yield-route-v2.0.0`.

All snapshots remain structurally marked `caller_supplied_unverified`. Every
result and opportunity is explicitly marketplace-, activation-, and
execution-ineligible. `humanReviewCandidateIds` identifies only inputs that
passed deterministic evidence and user-constraint checks; it never grants or
implies execution eligibility.

## Evidence contract

The caller supplies the source locator and observation time/block, documented
APY scale and annualization method, base/reward/gross APY, TVL and withdrawable
liquidity, withdrawal constraints, post-allocation protocol exposure, route
history, and complete cost evidence.

- Onchain snapshot locators include an exact block timestamp. It must match the
  observation timestamp.
- Every opportunity declares how its source relates to the exact vault. Direct
  reads must target the vault; adapter reads must name the adapter and relation.
- Every gas, route, slippage, and withdrawal-fee cost records its source asset,
  decimals, raw amount, source locator, observation time, and valuation method.
- A direct cost must already use the exact capital asset. A converted cost must
  provide an exact-only source/target raw-unit ratio whose arithmetic matches
  the claimed capital-asset amount. Unresolved or mismatched conversion makes
  net APY and gas impact null.
- Withdrawal `feeBps` is reconciled to the analyzed capital amount using an
  explicit `exact`, `floor`, or `ceil` rule and must exactly match the typed
  withdrawal-fee cost.

Missing, stale, future-dated, inconsistent, unknown-scale, non-exact,
cross-asset, or out-of-range evidence produces `insufficient_evidence`.
Complete evidence outside a user constraint produces `hold`; only complete
in-policy evidence produces a human-only `review_route` candidate.

Net APY uses `proofera-net-apy-simple-v1`: gross APY minus annual fee APY minus
known one-off capital-asset costs annualized over the caller's horizon. It is
returned only when bigint arithmetic is exactly representable at the documented
APY decimal scale and within the bounded output schema. Schema-valid extreme
inputs fail closed with null calculations; they do not throw.

Realized performance is always unknown because this agent does not fetch or
verify receipts, prices, flows, or cost basis.

## Bounded service

- 1–8 opportunities per request.
- 1–16 allowed protocols and 0–16 route-history records per opportunity.
- Source age limit: 1–604,800 seconds; future tolerance: 0–300 seconds.
- Horizon: 3,600–31,536,000 seconds.
- APY precision: at most 18 decimal places; exact raw values remain strings.
- Onchain amounts and blocks: canonical decimal strings bounded to `uint256`.
- HTTP sources: HTTPS only, no credentials/fragments, with publisher and SHA-256.
- JSON HTTP body limit: 256 KiB.
- Every response disables framework disclosure and sets a no-store,
  no-sniff, no-frame, no-referrer security-header baseline. Malformed and
  oversized JSON receive bounded JSON errors without internal details.
- The production server bounds header receipt to 10 seconds, the full request
  (including its body) to 30 seconds, socket inactivity to 30 seconds, and
  keep-alive idle time to 5 seconds. Headers are capped at 16 KiB.
- MCP capacity: 128 sessions with five-minute idle expiry and disposal.
- MCP initialization: global 64/minute default. It never trusts forwarded IP
  headers. A deployment behind a trusted authenticated ingress can inject a
  `McpInitializationLimiter` and a bounded server-authenticated identity
  resolver through `buildDualApp`; the resolver must never forward an
  unverified client header.

## Authentication boundary

M1 deliberately has no application-layer authentication. Its Agent Card omits
`security` and `securitySchemes`, matching the server's unauthenticated A2A
user builder. `OAUTH_TOKEN_URL` and `OAUTH_SCOPE` are reserved for a future
enforced implementation; setting either one makes configuration/startup fail
instead of publishing a security promise the server does not enforce. A public
deployment still requires platform ingress controls and rate limiting.

## Verify

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm audit:prod
```

Run locally with `corepack pnpm dev`, or run the compiled production entrypoint
with `corepack pnpm build && corepack pnpm start`. A2A is served through JSON-RPC, the AgentCard is at
`/.well-known/agent-card.json`, MCP streamable HTTP is at `/mcp`, and `/ping`
reports a read-only healthy state.
