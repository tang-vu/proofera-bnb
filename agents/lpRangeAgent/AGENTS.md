# LP Range Agent guide

This subtree is a deterministic PancakeSwap V3 LP range evidence analyzer. It
is not a seller, wallet, execution worker, or free-form model agent.

- Preserve `analyze_lp_range` inputs, calculations, decisions, and deterministic
  tests unless a separately reviewed methodology change is requested.
- Never add negotiation, ERC-8183, x402 commerce, model calls, chain tools,
  wallet loading, signing, approvals, storage, budget automation, or onchain
  writes to this deployed package.
- Keep the production graph free of the commerce-capable Studio runtime. The
  local Studio HTTP-envelope adapter stays route/header allowlisted, bounded,
  recursion-safe, and covered by loopback tests.
- Caller-supplied snapshots are recorded but not independently fetched or
  attested. Missing or stale evidence must not become a live claim.
- `executionEnabled` remains `false` in every success and input-error result.
- Any future rebalance execution belongs to ProofEra's separate scoped worker,
  with its own permission preview, limits, receipt verification, and revoke path.
- The application layer is deliberately unauthenticated. Never advertise an
  auth scheme without enforcing it; `OAUTH_TOKEN_URL` and `OAUTH_SCOPE` must
  fail startup while this contract remains unauthenticated.
- Preserve UUID MCP session IDs, global admission limiting, bounded capacity,
  idle disposal, security headers, sanitized JSON errors, body/header limits,
  and production server timeouts.
- Run from this subtree with the pinned Corepack version:
  `corepack pnpm install --frozen-lockfile`, `corepack pnpm verify`, and
  `corepack pnpm audit:prod`. Also repeat the frozen install from `app/agent`
  because it is the Studio deployment context.

Never inspect `.studio`, `.env`, wallet, or keystore paths and never deploy or
fund an agent during routine verification.
