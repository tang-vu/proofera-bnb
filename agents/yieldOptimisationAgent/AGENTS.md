# Yield Optimisation Agent guide

This subtree is a deterministic evidence analyzer. It is not a wallet or an
execution worker.

- Keep `analyze_yield_opportunities` read-only and deterministic.
- Never add fetch fallbacks, random financial values, signing, approvals,
  private keys, wallet/session loading, or onchain writes.
- Preserve raw amounts and rates as canonical decimal strings. Financial math
  uses `bigint`; a non-exact rate conversion must stay null.
- Never combine cost and capital raw units unless address, decimals, and exact
  valuation provenance prove they use the same asset. Reconcile withdrawal
  fee bps to its documented raw basis and rounding rule.
- Unknown, stale, future-dated, inconsistent, or unsupported-source evidence
  must produce `insufficient_evidence`, never a substituted fixture.
- Caller-supplied snapshots remain structurally marketplace-, activation-, and
  execution-ineligible even when they qualify for human review.
- `executionEnabled` remains `false` in every success and input-error result.
- M1 is intentionally unauthenticated at the application layer. Never advertise
  an authentication scheme without implementing and testing its enforcement;
  `OAUTH_TOKEN_URL` and `OAUTH_SCOPE` must fail startup while M1 is unauthenticated.
- Preserve the 256 KiB JSON limit, security headers, sanitized JSON errors,
  production HTTP timeouts, global MCP admission limiter, random session IDs,
  bounded capacity, and idle-session disposal.
- Run verification from `app/agent` with the pinned Corepack version:
  `corepack pnpm install --frozen-lockfile`, `corepack pnpm verify`, and
  `corepack pnpm audit:prod`.
