# Grid Trading agent constraints

This subtree is a deterministic, read-only reference analyzer. It accepts
caller-supplied evidence and exposes the same bounded analysis through A2A and
MCP adapters.

- Do not add wallets, keystores, signing, approvals, transaction submission,
  commerce rails, outbound fetches, or autonomous execution.
- Keep every input schema strict and every numeric amount exact. Prices use
  canonical decimal strings; token-like amounts use canonical integer minor
  units and `bigint` arithmetic.
- Missing, stale, or future-dated evidence must produce
  `insufficient_evidence`. It must never be replaced by a fixture or estimate.
- Realized fills, PnL, win rate, maximum drawdown, and performance remain
  unknown until receipts and outcome observations exist.
- `executionEnabled` is always `false`.
- A2A accepts exactly one structured data part; never choose the first of an
  ambiguous multipart request.
- Keep the Studio server read-only: 256 KiB maximum JSON, 16 KiB maximum HTTP
  headers, at most 64 active/pending MCP sessions and 64 initializations per
  minute, cryptographically random capability IDs, explicit idle cleanup,
  bounded timeouts, and sanitized errors.
- The Agent Card is honestly unauthenticated. Do not advertise an auth scheme
  until matching enforcement exists.
- Do not add Studio wallet, LLM, storage, payment, x402 seller, or commerce
  configuration.

Run checks from this directory with `pnpm verify` and `pnpm audit:prod`.
