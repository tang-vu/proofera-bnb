# ProofEra repository guide

This file applies to the whole repository. ProofEra is a risk-aware BNB Smart Chain agent marketplace. The governing product rule is: **never turn missing evidence into a claim**.

## Communication and delivery

- Always reply to the repository owner in Vietnamese, including progress reports, questions, blockers, and final handoffs.
- After every completed repository update, run the relevant verification, create a cohesive commit, and push the current branch to `origin`.
- Never force-push, rewrite published history, bypass a failing gate, or include secrets/generated local state merely to make a push succeed. If a commit or push is blocked, report the exact blocker in Vietnamese.

## Repository structure

- `apps/web/`: Next.js marketplace and server-side API routes.
- `packages/domain/`: framework-independent schemas, calculations, Proof Score, and policy validation.
- `packages/integrations/`: typed adapters for ERC-8004/8004scan, BSC, Altana, and DeFi protocols.
- `packages/benchmarks/`: strict paired-run evidence schemas and comparison logic for TermiX experiments.
- `agents/`: BNB Agent Studio reference agents; encrypted wallets and local environments stay untracked.
- `contracts/testnet-fixed-asset/`: isolated, fixed-supply BSC-testnet fixture; never an execution guard, stablecoin, or live asset claim.
- `docs/`: research, architecture, operations, methodology, security, and submission records.
- `evidence/`: reproducible manifests and non-secret raw outputs. Never add fabricated receipts.

## Development commands

Run commands from the repository root with the Corepack-provided pnpm version.

- `pnpm install --frozen-lockfile`: install the exact dependency graph.
- `pnpm dev`: run the marketplace locally.
- `pnpm format:check`: verify formatting.
- `pnpm lint`: run static lint checks.
- `pnpm security:secrets`: scan source boundaries without opening ignored secret locations.
- `pnpm typecheck`: run strict TypeScript checks.
- `pnpm test`: run deterministic unit and integration tests.
- `pnpm test:evidence`: verify selector artifacts and WBNB evidence consistency without network or transaction access.
- `pnpm test:e2e`: run critical Playwright journeys.
- `pnpm build`: create the production build.
- `pnpm verify`: run all judge-facing local gates.

Agent-specific commands are documented beside each agent and in `docs/deployment.md`. Use `bag doctor` and `bag deploy prepare` before any BNB Agent Studio deployment. Deployment, registration, or funding is never part of a routine test command.

The fixed test asset is intentionally outside the root pnpm workspace. Run `pnpm install --frozen-lockfile` and `pnpm verify` from `contracts/testnet-fixed-asset`; its isolated CI job is the authoritative routine gate. Its deployment-preparation script emits unsigned data only.

## Engineering conventions

- TypeScript is strict; avoid `any`, unchecked casts, and unvalidated external data.
- Keep protocol code behind typed adapters. Parse every remote response at runtime.
- Use integer base units (`bigint`) for onchain amounts. Keep token decimals and chain IDs explicit.
- Store timestamps in UTC ISO 8601. Preserve source timestamps separately from ingestion timestamps.
- Model unknown, stale, unavailable, simulated, testnet, and mainnet states explicitly.
- No production path may silently substitute fixtures after an integration failure.
- A metric needs a value or explicit null, source URL/contract, observed-at time, methodology, and freshness state.
- Keep domain calculations pure and deterministic. Add boundary and missing-data tests with every formula change.
- Sanitize untrusted names, descriptions, images, endpoints, and redirects before rendering or fetching.
- Prefer accessible semantic HTML, visible focus, reduced motion, and decision-useful charts only.

## Security constraints

- Never commit, print, log, or send private keys, wallet passwords, API keys, session signers, or keystores to the browser/server boundary incorrectly.
- Never dump process environments or package-manager configuration (`env`, `set`, `pnpm config list`, `npm config list`) into tool/CI output; those commands can reveal registry credentials. Query only a specifically reviewed non-secret key when necessary.
- The web app never custodies a user's admin key. Browser passkeys remain device-bound. An autonomous agent may hold only its scoped session signer in a dedicated encrypted worker secret/KMS after the exact grant handoff is verified; never store that signer in the browser, marketplace database, logs, or general web runtime.
- Default to BSC testnet. Mainnet writes, real token approvals, transfers, paid services, and public deployment require explicit user approval.
- Validate chain, target contract, function selector, token address, decimals, amount, spend cap, expiry, deadline, slippage, and quote age before requesting a signature.
- Use exact or bounded approvals, idempotency guards, pending-state reconciliation, and an immediate revoke path. Altana SDK 0.7.0 grant exceptions do not retain `callsId`; treat an uncertain grant as a non-retryable unknown outcome until onchain authority is probed.
- Treat registry metadata and reputation as untrusted signals, not proof that an advertised strategy works.
- Do not add remote URLs to an allowlist without an authoritative source and a recorded review.

## Definition of done

A change is done only when its acceptance criteria are met; formatting, lint, typecheck, relevant tests, and production build pass; error/empty/stale states are exercised; security and provenance are reviewed; and the execution plan plus traceability evidence are updated. A transaction-dependent feature is not “live” until a real explorer-verifiable receipt exists.
