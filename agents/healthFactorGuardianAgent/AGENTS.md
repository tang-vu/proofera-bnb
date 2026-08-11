# Health-Factor Guardian constraints

This subtree is a deterministic, read-only Venus Core Pool evidence analyzer.
It accepts caller-supplied snapshots and exposes the same bounded analysis over
A2A and MCP.

- Do not add wallets, keystores, signing, approvals, transactions, outbound
  fetches, autonomous execution, or filesystem writes.
- Never inspect or copy `.studio`, wallet, environment, or secret state.
- All current collateral and debt evidence must be complete, fresh, same-block,
  and scale-compatible before computing a health factor.
- Use effective user liquidation thresholds with
  `USE_LIQUIDATION_THRESHOLD`; do not silently substitute collateral factors.
- Preserve decimal integer strings and calculate with exact `bigint` ratios.
- Model zero debt as `not_applicable_zero_debt`, never as infinity.
- Missing evidence produces `insufficient_evidence`; it is never replaced by a
  fixture or estimate.
- `sourceContentsVerified`, `freshnessAttestedByAgent`, `marketplaceEligible`,
  `activationEligible`, and `executionEnabled` are always `false`.
- Current evidence must bind the requested account and exact block identity and
  time to the official chain-specific Venus Core Pool Comptroller, a closed
  read-method schema, its market/vToken relations, and the common `usd` quote
  unit/scale. Generic contract or free-text read claims fail closed.
- A2A accepts exactly one structured data part; never choose the first of an
  ambiguous multi-part request.
- Keep the Studio server read-only: 256 KiB maximum JSON, at most 64 MCP
  sessions and 64 initializations per minute, cryptographically random MCP
  capability IDs, bounded idle lifetime with cleanup, validated
  host/port/public URL, and no wallet, signer, payment, x402 seller, or commerce
  route.

Run checks from this directory with `pnpm verify` and `pnpm audit:prod`.
