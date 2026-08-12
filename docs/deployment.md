# ProofEra deployment runbook

Updated: 2026-08-12. No public or mainnet deployment has been performed. None of the four local reference analyzers is publicly hosted or ERC-8004-registered, and no ProofEra grant, execution, or revoke transaction exists. This runbook separates safe local/testnet preparation from actions requiring explicit approval or user-owned accounts.

## Deployment topology

- One durable HTTPS Next.js marketplace with health/error monitoring.
- One stable hostname and explicit WebAuthn RP ID for the full evidence and judging window.
- Durable BNB Agent Studio reference-agent runtimes. The BNB-managed test deployment expires after 48 hours and is used only for a scheduled evidence window, not judging uptime.
- Dedicated encrypted worker/KMS secret boundary for each autonomous session signer.
- Server-only 8004scan/RPC credentials. No secret may use `NEXT_PUBLIC_`.

## Local production verification

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm test:e2e
pnpm audit --prod --audit-level moderate
```

Expected gates are formatting, zero-warning lint, strict typecheck, unit/integration tests, Next production build and isolated-port desktop/mobile Playwright. Routine commands never create wallets or send transactions.

## Required environment

| Variable                    | Boundary    | Requirement                                                                     |
| --------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_ORIGIN`    | public      | Final `https://` origin; no path                                                |
| `NEXT_PUBLIC_ALTANA_RP_ID`  | public      | Exact stable hostname compatible with the origin; never derived from `Host`     |
| `PROOFERA_BUILD_VERSION`    | server only | Immutable release tag or commit SHA exposed as a non-secret build label         |
| `PROOFERA_8004SCAN_API_KEY` | server only | Optional locally; recommended production quota                                  |
| `PROOFERA_DATA_MODE`        | server only | `strict`; production rejects `fixture`                                          |
| `BSC_RPC_URL`               | server only | Mainnet provider with reliable latest Multicall3 and exact-block identity reads |
| `BSC_TESTNET_RPC_URL`       | server only | Testnet provider with reliable latest Multicall3 and exact-block identity reads |

Worker/KMS credentials and session signers are intentionally absent from `.env.example`; their platform-specific secret names belong in the private deployment configuration, never the marketplace runtime.

Release prerequisite: the npm-account owner must revoke/rotate the registry token exposed by a prior local package-manager configuration diagnostic and review account access/publication history. The value is not recorded here. Do not replace it in repository or CI files, and do not run environment or package-manager configuration dumps as a verification step. Account-side completion must be confirmed separately because repository secret scans cannot prove revocation.

## PostgreSQL reservation gate

The activation replay ledger is deliberately separate from marketplace caching. Provision a PostgreSQL 17 UTF-8 database with two isolated roles before deploying the worker:

- `proofera_activation_owner`: `NOLOGIN`, `NOINHERIT`, no elevated attributes or role memberships;
- `proofera_activation_app`: direct `LOGIN`, `NOINHERIT`, no elevated attributes or role memberships.

As a separately authenticated migration administrator, apply `packages/integrations/migrations/0001_altana_lp_reservation_schema_v2.sql` once with `psql -X --set ON_ERROR_STOP=1 --file ...`. Never run it from application startup or as the application role. It is intentionally fail-on-existing and cannot bless or repair drift.

The same trusted startup ceremony must call `verifyAltanaLpReservationPostgresSchema` through the server-only `@proofera/integrations/server/altana-lp-reservation` subpath. Only that in-process verifier can issue the nominal capability accepted by `createAltanaLpPostgresPoolComposition(...).bindVerifiedSchema(...)`; copied or serialized lookalikes fail. The runtime connection must use the exact application role, explicit host/port/database/password, no URL query or fragment, and TLS `verify-full` in production. The application probe proves only direct-login USAGE/SELECT/INSERT access; it cannot replace the canonical administrator proof.

CI's digest-pinned PostgreSQL 17.9 service reruns the unmodified migration and 10 live cases on every change. That is implementation evidence, not production readiness. Record the deployed database version, migration and catalog digests, verification time, application probe time, backup/restore drill and operator without recording credentials.

## PostgreSQL grant-claim gate

The browser grant's one-shot claim is a separate ledger with separate roles, schema, and dedicated database. Do not colocate it with the LP reservation ledger: both canonical migrations own and verify the exact database ACL/owner boundary. Provision it only in a server/worker deployment; it is not a browser or general marketplace-database surface.

- Canonical owner role: `proofera_grant_claim_owner` (`NOLOGIN`, no elevated attributes).
- Canonical application role: `proofera_grant_claim_app` (direct `LOGIN`, no elevated attributes or role switching).
- Migration: `packages/integrations/migrations/0002_altana_grant_claim_schema_v1.sql`.
- Safe package surface: `@proofera/integrations/server/altana-grant-claim`.

Apply the fail-on-existing migration once as the database owner/administrator. The migration resets the exact database ACL, creates a nonzero deployment UUID receipt, and grants the application role only the reviewed receipt columns plus claim-table `SELECT`/`INSERT`. Application startup must construct `createAltanaGrantClaimPostgresServer` with the exact application-role connection, call `verifyReadiness`, and keep the returned server instance private. The same module-owned pool and checked-out transaction re-read the deployment UUID before every claim. Never expose the pool, verifier, raw SQL, transaction adapter, receipt capability, or connection string through an API response or client import.

Production configuration requires an explicit host, port, database, application-role username/password, and TLS `verify-full`; connection-string query/fragment overrides are rejected. Store that URL/CA only in the worker platform's server-side secret manager. The current marketplace has no environment reader or deployed worker for this composition, so `.env.example` intentionally does not imply that a database is configured.

The canonical migration artifact SHA-256 is `fced0c471135a969a726eb1e2233c9b18976c0a2d66377fa40a9d52a552d17cb`; the independent semantic-contract SHA-256 is `fc81399172bf962fe4d0b017d58846a3651ca5ccd850004e20d280ebdad9639a`. Sixty-eight focused tests and 18 real PostgreSQL 17 cases pass, including exact replay/concurrency, catalog/ACL/namespace/role-setting mutation rejection, restricted initial ACL restoration, deployment mismatch, verifier timeout destruction, no-commit, commit/rollback disconnect, and no SQL continuation after timeout. CI reruns that live suite after the LP reservation suite. The implementation readiness object still sets `deploymentConfigured: false` and `releaseReady: false`; do not change those values until a deployed database, authenticated worker endpoint, log-redaction proof, backup/restore drill, and final-origin ceremony are verified.

## Public marketplace checklist

1. Reserve the durable domain before creating passkeys/evidence wallets.
2. Configure origin/RP ID and verify create/recover behavior on the exact domain.
3. Configure server secrets, least-privilege service account, log redaction and rate limits.
4. Run dependency audit, SBOM/license inventory and secret scan. Resolve Altana GPL distribution obligations.
5. Deploy an immutable build; verify security headers, source-map policy, `/api/health`, `/api/readiness`, `X-ProofEra-Service: proofera-marketplace`, and the rollback artifact. Health is liveness only and must not claim data or activation readiness. Readiness returns a generic no-store `503` for invalid strict-mode/passkey/RPC/build configuration and remains `not_ready` until canonical database/application probes, an eligible write target, the signer handoff, exact authority and the passkey ceremony all pass; configured-but-unprobed adapters are never labelled live.
6. Run public smoke tests for home, all four categories, unavailable/stale states and external-source links.
7. Run virtual WebAuthn critical E2E and a real-device ceremony.
8. Enable monitoring through at least 2026-09-23 UTC, with alert owner and rollback procedure.

Public deployment requires the user's hosting/domain credentials or approval. It does not authorize mainnet writes.

## BNB Agent Studio runtime

Current toolchain is the exact Node CLI `@bnbagent/studio-cli@0.0.8`; the older June Python quickstart is not the deployment source of truth.

```bash
bag --version
bag doctor
bag deploy prepare
```

Before deployment, inspect generated manifests, endpoint health behavior, IAM/quota, region, secret injection and whether `--skip-register` is required. ProofEra's browser-passkey Altana session is not assumed equivalent to Studio's native/local Altana provisioning. The worker must receive the ProofEra-scoped signer through the reviewed KMS seam and pass independent authority verification.

All four local analyzers now have hardened Studio-shaped A2A/MCP runtimes and fail-independent CI matrix entries: LP Range 17 tests, Grid Trading 24, Yield Optimisation 33, and Health-Factor Guardian 37. These are local capability and packaging checks only. Each still needs a durable endpoint, public health probe, BSC/ERC-8004 registration, and independently reproducible evidence before it may be described as a live marketplace agent.

Prepare durable self-host/AWS hosting first. Start the 48-hour BNB-managed trial only when a testnet evidence capture window is scheduled. Agent ERC-8004 registration is a separate, custody-specific admin operation; do not assume Studio/Altana can sign it generically.

## Testnet asset and custom-contract verification gate

### Local chain-97 deployer

The dedicated development deployer public address is `0x997cD959798F7c925076eaeFF5855C5C2c1e5A49`. Its Web3 Secret Storage v3 keystore and DPAPI `CurrentUser`-wrapped random password live outside the repository under a current-user-only Windows ACL. The public custody record is [`evidence/development/bsc-testnet-deployer-wallet-2026-08-12.json`](../evidence/development/bsc-testnet-deployer-wallet-2026-08-12.json). Independent local recovery, MAC, address and offline-signature checks pass. A later read-only record at [`evidence/development/bsc-testnet-pta-deployment-observation-2026-08-12.json`](../evidence/development/bsc-testnet-pta-deployment-observation-2026-08-12.json) confirms two official testnet RPCs agreed on chain/block/account/target/simulation state; it also proves the wallet is unfunded and therefore blocked. No deployment signature, transaction, deployment or explorer receipt exists. Do not describe it as funded or active.

This key is only for bounded BSC testnet deployment preparation. Every consuming command must fail closed unless the provider and transaction chain ID are exactly `97`; an EVM key itself is not chain-bound. It is not the browser Altana passkey, autonomous session signer, user capital wallet or a mainnet key. A reviewed server-only custody probe pins chain `97`, the expected deployer address, both encrypted-artifact digests and the exact system PowerShell binary; checks path/file/ACL state before and after unlock; verifies strict Web3 v3/scrypt/AES/MAC/address binding; and returns no secret, signer, signature, transaction or RPC result. Its focused suite passes 30 tests and its opt-in local Windows probe passes once. The separate package subpath `@proofera/integrations/server/bsc-testnet-pta-deployment-observation` reads only two fixed official BNB endpoints and requires exact provider agreement before validating a non-authorizing envelope. The exact deployment is permanently bound to deployer nonce `0` and predicted CREATE address `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc`; any used nonce blocks. The 2026-08-12 observation returned `INSUFFICIENT_BALANCE`: gas estimate `561809`, 20% bounded gas limit `674171`, gas price `100000000` wei, maximum cost `67417100000000` wei, balance `0`. A pure helper revalidates the complete envelope and emits only its canonical nine-field EIP-155 signing payload with empty signature fields and `broadcastable: false`. Before first use, add a separate durable one-shot signer that internally re-reads fresh state and accepts only that exact reviewed payload; neither the envelope hash, serializer result nor unkeyed observation digest is a signing capability.

M1 still uses direct reviewed protocol calls and has no ProofEra execution/guard contract. The isolated `contracts/testnet-fixed-asset` package is a different boundary: it prepares a fixed-supply chain-97-only non-economic token solely as a fallback when no admissible existing pair exists. It is locally verified but undeployed, unpriced and illiquid. Its deployment command accepts no signer, RPC or broadcast input. A second offline command emits a canonical zero-value PTA/WBNB review call tuple but no complete or serialized transaction request, signed or unsigned envelope, approval, liquidity call, or guessed pool address; it keeps twelve submission/activation blockers open and is not deployment evidence. Those blockers now explicitly include sender, nonce, gas/fee/total-tBNB caps, a short external submission window, atomic one-shot claiming, pending/double-submit reconciliation and same-nonce replacement/cancellation. Any deployment, pool creation/funding or API verification is a separate explicitly approved testnet action.

If PTA is deployed or a later onchain calldata guard becomes necessary, preserve the exact compiler, optimizer/runs, constructor arguments, linked libraries, source path and contract name from deployment. Use Etherscan API V2/Foundry with explicit chain ID (`97` testnet; `56` only after mainnet approval), an eligible user-provided API key, and `forge verify-contract --watch`. The current supported-chains table marks chain 97 unavailable on the free API tier. A submission GUID is pending evidence, not success: capture `Pass - Verified`, the explorer source page, implementation verification for any proxy, and independently read runtime bytecode identity. Never place the explorer key in client code or command output.

## Testnet evidence sequence

After local policy/worker/browser readiness:

1. Create/recover an Altana passkey wallet on the final testnet evidence hostname.
2. Fund only with faucet/minimal test assets.
3. Select a Pancake testnet pool only after verifying source/runtime identity, token control surfaces, decimals, liquidity, oracle history and mutable protocol controls. The retained CAKE/WBNB candidate is explicitly ineligible, and a bounded search rejected all 14 reviewed factory-authenticated WBNB pools; the uncovered historical interval remains documented. Canonical WBNB now has exact source/creation/runtime/control proof, but must still receive a fresh exact-block code binding. If no separately admissible pair is established, request explicit approval to deploy PTA to the final recipient and create a minimal PTA/WBNB fixture; then verify the deployed PTA and resulting pool, oracle, liquidity, controls, ownership and authority before admitting any write.
4. Provision two dedicated PostgreSQL 17 databases with their respective isolated migration/application roles: one for LP context/quote reservations and one for grant-submission claims. Apply each reviewed versioned migration as its database owner. Require the LP administrator verifier plus direct-login application probe before binding `consumeOrRead`; separately require the grant server's same-pool `verifyReadiness` before accepting a grant claim. The local 10-case LP and 18-case grant suites and CI job are implementation evidence, not proof that either deployed database is ready.
5. Worker creates the scoped key; browser grants exact reviewed policy with Keystore registration.
6. Probe exact authority, then simulate and execute one bounded direct operation.
7. Capture Altana account/key links, `callsId` where exposed, BscScan transaction, decoded calldata and evidence manifest.
8. Revoke through the browser passkey; retain active state until invalidity is observed; capture receipt and negative execute proof.

Testnet transactions are labelled testnet. No fabricated or mainnet-looking hash is accepted.

## Mainnet and paid-action gate

Mainnet deployment, ERC-8004 registration, approvals, token transfers, paid APIs and public publishing require explicit user approval. Before requesting it, provide exact chain, wallet, contracts, functions, assets/amounts, gas estimate, rollback/revoke plan and testnet evidence. Use minimal value and never reuse a development private key.

## Rollback

- Marketplace: route traffic to the previous immutable build, keep a maintenance/data-unavailable banner, and preserve evidence/logs.
- Agent: suspend discovery and execution, then revoke active sessions with the passkey admin and verify invalidity onchain.
- Data provider: display last-good as stale with timestamp or unavailable; never switch to fixture mode.
- Compromised secret: revoke/rotate at its owning boundary, inspect operation/policy hashes and notify affected users.
