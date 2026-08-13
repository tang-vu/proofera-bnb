# ProofEra deployment runbook

Updated: 2026-08-13. The PTA fixture is finalized on BSC Testnet; no public marketplace/agent hosting or mainnet deployment has been performed. None of the four local reference analyzers is publicly hosted or ERC-8004-registered, and no ProofEra grant, Pancake operation, or revoke transaction exists. Later PTA/WBNB work consists only of historical read-only evidence, exact offline provenance, an always non-authorizing two-RPC preflight boundary, an old-scope unsent request, an owner-designated internal technical decision for exact commit `bc7000e`, and production-unreachable signing/post-claim/submission/reconciliation scaffolds. This runbook separates the completed bounded testnet asset action from remaining actions requiring explicit approval or user-owned accounts.

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

The dedicated development deployer public address is `0x997cD959798F7c925076eaeFF5855C5C2c1e5A49`. Its Web3 Secret Storage v3 keystore and DPAPI `CurrentUser`-wrapped random password live outside the repository under a current-user-only Windows ACL. The public custody record is [`evidence/development/bsc-testnet-deployer-wallet-2026-08-12.json`](../evidence/development/bsc-testnet-deployer-wallet-2026-08-12.json). Independent local recovery, MAC, address and offline-signature checks pass. The initial read-only [pre-funding observation](../evidence/development/bsc-testnet-pta-deployment-observation-2026-08-12.json), finalized [funding record](../evidence/development/bsc-testnet-pta-funding-2026-08-12.json), and final [deployment record](../evidence/development/bsc-testnet-pta-deployment-2026-08-12.json) preserve the full public sequence. The exact nonce-`0` deployment succeeded on chain `97` in transaction `0x0852f32bf54aeac58815d93a64a5d38cda2f8615f2a997b4a601a06b380168c7`, producing `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc`.

This key is only for bounded BSC testnet work. Every consuming command fails closed unless the provider and transaction chain ID are exactly `97`; an EVM key itself is not chain-bound. It is not the browser Altana passkey, autonomous session signer, user capital wallet or a mainnet key. The deployment path combined a reviewed custody probe, fresh two-provider observation, canonical legacy EIP-155 serializer, durable append-only one-shot journal, isolated short-lived worker and exact signed-transaction recovery before submission. An initial post-receipt parser error and pruned historical trie did not trigger replacement signing: the committed transaction was reconciled by hash, then its receipt, canonical block, runtime, single mint and token state were verified through two official RPCs. State reads use an exact common finalized EIP-1898 block-hash selector rather than `latest`. The repository contains no private key, password or raw signed transaction.

M1 still uses direct reviewed protocol calls and has no ProofEra execution/guard contract. The isolated `contracts/testnet-fixed-asset` package is a different boundary: it produced the fixed-supply chain-97-only non-economic token now deployed at `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc`. PTA remains unpriced and illiquid. Its offline command emits only a canonical zero-value PTA/WBNB review-call tuple. A separate server-only coordinator can build a complete, short-lived unsigned observation envelope, but every readiness/authorization flag remains false and the coordinator exposes no signer, custody, journal, transport or broadcast dependency. A separate signing scaffold exists behind that boundary but is deliberately unreachable in production. The intended seed is the arbitrary test scenario `1 PTA = 0.000001 WBNB`, encoded for the deployed token order as `sqrtPriceX96 = 79228162514264337593543950` with expected tick `-138163`; it is not a quote, peg, oracle, or valuation.

The separate [PTA/WBNB readiness review](./pancake-v3-testnet-pta-wbnb-preparation.md) binds two official RPCs to finalized block `124767685` / `0x1657811b903d77aa58f2a6a78a9536a71e98e36d60c13a6098b75f8962e1fc7c`. At that historical checkpoint, all five PTA/WBNB/Pancake runtime identities matched their retained hashes, factory `getPool` was zero at fee tiers `100`, `500`, `2500`, and `10000`, and the conditional fee-500 candidate `0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE` had empty code and nonce zero. Exact request parameters and both providers' normalized public result payloads are retained in a digest-bound transcript and checked offline; JSON-RPC envelopes and request IDs are intentionally omitted. A later offline review binds the official source archive/blobs, exact native solc, complete compiler inputs/artifacts, pool init-code hash, retained deployer/factory runtimes, and CREATE2 cross-checks. This closes the compiler/artifact blocker for the retained construction path, not current state or pool existence. Factory-owner and LM-deployer controls are mutable and must be refreshed and reviewed.

The direct initializer selector is also locally bound to the exact Position Manager source/artifact/runtime and factory/deployer/pool call graph. Its exact bytes are now published at a revision-pinned, digest-named public Gist and a retained separate unauthenticated no-redirect GET matches all `33,327` bytes and the whole-file SHA-256. The original review remains immutable and its later publication/refetch are joined by `pancake-v3-initializer-selector-publication-manifest-2026-08-13.json`. This still authorizes nothing: no authenticated independent external reviewer is bound to the public direct-only scope, the exact owner authorization is absent, Gist publication is not reviewer authorization, and Gist availability is not guaranteed.

A deterministic [external-review request bundle](../evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json) pins the exact direct-call subject to source commit `00f21c405881a5dc320bddf3c757ba13599b1e71`, exactly its enumerated eight implementation files, the revision-pinned Gist, and retained evidence hashes. It has not been sent and has no recipient, reviewer, provisioned reviewer identity, or Sigstore authentication evidence. Its SHA-256 values provide unkeyed integrity only. It excludes the later post-claim and submission/reconciliation files and is not used to claim external or authenticated third-party review.

The owner-designated [internal multi-agent technical decision](../evidence/development/pancake-v3-pta-wbnb-owner-designated-internal-review-2026-08-13.json) separately binds commit `bc7000eee4d9698e272cc9deb7dda5748b34318b`, its tree, all 21 pool-prefixed files and the fixed chain-97 transaction tuple. It closes only that exact nonexecuting subject's internal technical-review gate. It is not an external review, Sigstore authentication, authenticated third-party identity, or organizational-independence claim. It supplies no exact owner transaction approval and no production authority or execution capability.

The fixed two-RPC coordinator uses a common finalized EIP-1898 checkpoint, verifies runtime/proxy slots/protocol bindings and latest/pending race state, and requires exact simulation plus balance/gas caps. A locally reviewed scaffold implements the fixed transaction protocol, authorization validator, signer core, Windows worker and append-only signing journal at `%LOCALAPPDATA%\ProofEra\operations\bsc-testnet-pta-wbnb-pool-v1`. Journal directory/files require protected current-user ACLs. Its receipt self-hash is integrity-only and cannot mint authority. The local native authority seam now performs a same-process two-phase ceremony over the process TTY: it prints the complete decoded release/review/envelope challenge, generates a fresh 32-byte OS-CSPRNG nonce, and accepts only the exact digest-bound confirmation bytes in the bounded window. A closure-private current-user capability, ceremony-command brand and one-consume execution capability stay inside the native authority/worker realm; test capabilities, copied JSON/digests and journal files cannot unlock custody. The public production worker factory and root runner remain hard-blocked.

The local production composition now reads the signing and submission journals before any new authorization or signing. The append-only submission journal v2 durably preserves the exact owner-v2 one-signature/one-broadcast policy and recovery binding: terminal states stop, `submission_started`/`unknown_outcome` states enter reconciliation only, a lone signed commit cannot recreate owner authority, and inconsistent restart state fails closed. For a fresh authorized attempt, the submission core requires winner-only durable `submission_started`, then performs a second fixed dual-RPC terminal reread after that acknowledgement and immediately before its one allowed send attempt. It never resends or creates a replacement after send begins. Reconciliation validates identical dual-provider transaction, receipt, expected logs and EIP-1898 post-state, plus a continuous receipt-to-common-finalized ancestry bounded to 128 blocks. These are locally implemented/reviewed controls, not an executable deployment: the root runner and raw broadcaster still hard-block with `PRODUCTION_AUTHORIZATION_UNAVAILABLE`, and the public worker issuer remains unavailable. No exact owner transaction approval, signature, send, receipt, pool or liquidity exists.

Pool initialization remains a separate write requiring fresh state, a new owner-designated distinct-agent technical decision bound to the exact current release, and exact owner authorization entered through the same-process ceremony before any executable root/broadcaster wiring could be considered. The retained decision covers only the nonexecuting `bc7000e` subject; the current changed code release has no final owner-designated decision, and the old-scope unsent request closes no production or owner-authorization gate. Initialization adds no liquidity. A later LP plan may propose caps of at most `1,000 PTA` plus `0.001 WBNB`, but that proposal has no approval, funding, wrapping, allowance, calldata, position, or receipt. LP minting requires its own review and separate explicit approval after pool, oracle, liquidity, ownership, slippage, deadline, authority, and revoke gates close.

The PTA deployment preserves the exact compiler, optimizer/runs, constructor arguments, empty link/immutable references, source path, artifact digests and runtime identity in local build evidence. Explorer source verification remains pending because the current supported-chains table marks chain `97` unavailable on the free API tier. If an eligible key is approved, use Etherscan API V2/Foundry with explicit chain ID `97` and require `Pass - Verified`; a submission GUID alone is not success. Chain `56` and any paid action still require separate mainnet/payment approval. Never place the explorer key in client code or command output.

## Testnet evidence sequence

After local policy/worker/browser readiness:

1. Create/recover an Altana passkey wallet on the final testnet evidence hostname.
2. Fund only with faucet/minimal test assets.
3. Select a Pancake testnet pool only after verifying source/runtime identity, token control surfaces, decimals, liquidity, oracle history and mutable protocol controls. The retained CAKE/WBNB candidate is explicitly ineligible, and a bounded search rejected all 14 reviewed factory-authenticated WBNB pools; the uncovered historical interval remains documented. Canonical WBNB has exact source/creation/runtime/control proof and PTA is independently deployed and runtime-verified. Exact offline provenance binds the conditional PTA/WBNB fee-500 CREATE2 address for the retained construction path, but no pool exists in retained evidence. The initializer artifact is published and byte-refetched; the deterministic old external-review request is unsent and limited to `00f21c4`. The owner-designated internal decision covers only the exact nonexecuting `bc7000e` subject and must not be represented as external, Sigstore-authenticated or third-party review. Obtain a new distinct-agent decision for the exact changed release and a separate exact owner authorization; neither exists now. The internal ceremony/worker bridge, v2 restart recovery, terminal reread and bounded ancestry logic do not authorize or execute anything while the root runner and raw broadcaster remain hard-blocked. Reconcile any separately authorized initializer receipt before preparing a second, separately approved minimal LP mint. Neither approval may be inferred from this runbook.
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
