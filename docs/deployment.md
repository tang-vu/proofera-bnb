# ProofEra deployment runbook

Updated: 2026-08-16. The PTA fixture is finalized on BSC Testnet; no pool or mainnet action exists. Historical releases through generation 3 stopped at claim-only states. A later one-off local generation-4 run accepted owner-v7 confirmation and durably recorded `failed_before_worker`, still without worker start, custody-secret access, signature, submission, receipt, pool, or liquidity. Current recovery generation 5 requires its own committed/pushed identity, new exact audits and policy, a fresh envelope after the exact generation-4 terminal, and separate owner-v8 TTY confirmation.

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

### Durable Windows host

The owner's always-on Windows host serves the production build through a named Cloudflare Tunnel. PM2 supervises the loopback-only marketplace and four analyzers defined in `deploy/windows/ecosystem.config.cjs`; the tunnel credential and ingress configuration remain outside the repository. Public endpoints are:

- marketplace: `https://proofera.tangvu.dev`;
- LP Range: `https://proofera-lp.tangvu.dev`;
- Grid Trading: `https://proofera-grid.tangvu.dev`;
- Yield Optimisation: `https://proofera-yield.tangvu.dev`;
- Health-Factor Guardian: `https://proofera-health.tangvu.dev`.

Run `node scripts/check-local-production.mjs` for loopback liveness and `node scripts/check-local-production.mjs --public` for HTTPS liveness plus Agent Card identity. A release probe additionally requires the exact published commit and rejects both a mismatched health build and a `misconfigured` readiness response:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
if ((git rev-parse origin/main).Trim() -ne $releaseCommit) { throw "Release is not published" }
if ((git status --porcelain).Length -ne 0) { throw "Release worktree is not clean" }
$env:PROOFERA_BUILD_VERSION = $releaseCommit
pm2 start deploy/windows/ecosystem.config.cjs --update-env
node scripts/check-local-production.mjs --public "--expected-build=$releaseCommit"
if ($LASTEXITCODE -ne 0) { throw "Public release probe failed" }
pm2 save
Remove-Item Env:PROOFERA_BUILD_VERSION
```

`proofera-monitor` repeats that exact release probe every five minutes and records state changes in its bounded PM2 logs. This is host-local detection, not an independent uptime service or external paging channel. Public health is only an availability observation. Readiness remains `not_ready` until the real activation gates close. The analyzers intentionally report `executionEnabled: false`; public endpoints do not prove BSC/ERC-8004 registration, marketplace eligibility, live data provenance, transaction authority, or execution receipts.

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

### Host-local staging observation — 2026-08-17

The 24/7 Windows host now runs two isolated Docker volumes and containers from the exact pinned PostgreSQL image digest `sha256:47f917f7409eacd22fc5dfb1dee634e1b55cf0c01d1a7eb701be2227a03e0641`:

- `proofera-postgres-lp` / `proofera-postgres-lp-v1`, loopback only at `127.0.0.1:55431`, database `proofera_altana_lp`.
- `proofera-postgres-grant` / `proofera-postgres-grant-v1`, loopback only at `127.0.0.1:55432`, database `proofera_altana_grant_claim`.

Both use `restart=unless-stopped`; a `ProofEra WSL Keepalive` logon task keeps the Ubuntu WSL service boundary alive. Bootstrap and application passwords are independently random, stored only as current-user DPAPI ciphertext outside the repository, and are absent from container configuration after initialization. The unmodified migrations were applied once. `altana-production-postgres.readiness.test.ts` then passed both the LP administrator catalog plus direct-login application binding and the grant server's same-pool direct-login verifier.

This is a real host-local staging deployment, not production activation evidence. Connections currently use loopback without TLS, no worker endpoint consumes either capability, and log-redaction, retention, backup/restore, reboot recovery, final-origin/passkey, and signer/KMS ceremonies are still open. Therefore `deploymentConfigured` and `releaseReady` remain false and public `/api/readiness` must remain `503 not_ready`.

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

Current official toolchain is Python `bnbagent-studio 0.0.5` (`bag 0.0.5`) plus native npm `@aws/agentcore 0.27.0`. The earlier Node `@bnbagent/studio-cli@0.0.8` snapshot is retired. Studio 0.0.5 scaffolds a Python single-agent seller with one external protocol; ProofEra's existing dual-protocol TypeScript analyzers are self-hosted runtimes and are not represented as AgentCore deployments.

```bash
bag --version
bag doctor
bag deploy prepare
```

Before deployment, inspect generated manifests, endpoint health behavior, IAM/quota, region, secret injection and whether `--skip-register` is required. ProofEra's browser-passkey Altana session is not assumed equivalent to Studio's native/local Altana provisioning. The worker must receive the ProofEra-scoped signer through the reviewed KMS seam and pass independent authority verification.

All four analyzers have hardened public A2A/MCP runtimes and fail-independent CI matrix entries: LP Range 17 tests, Grid Trading 24, Yield Optimisation 33, and Health-Factor Guardian 37. Their durable endpoints and public health/Card probes pass. Dedicated registration wallets and current A2A identity metadata exist, but balances and ERC-8004 identities do not; see the [agent registration runbook](./agent-registration.md). Analyzer availability alone is not execution or outcome evidence.

Prepare durable self-host/AWS hosting first. Start the 48-hour BNB-managed trial only when a testnet evidence capture window is scheduled. Agent ERC-8004 registration is a separate, custody-specific admin operation; do not assume Studio/Altana can sign it generically.

## Testnet asset and custom-contract verification gate

### Local chain-97 deployer

The dedicated development deployer public address is `0x997cD959798F7c925076eaeFF5855C5C2c1e5A49`. Its Web3 Secret Storage v3 keystore and DPAPI `CurrentUser`-wrapped random password live outside the repository under a current-user-only Windows ACL. The public custody record is [`evidence/development/bsc-testnet-deployer-wallet-2026-08-12.json`](../evidence/development/bsc-testnet-deployer-wallet-2026-08-12.json). Independent local recovery, MAC, address and offline-signature checks pass. The initial read-only [pre-funding observation](../evidence/development/bsc-testnet-pta-deployment-observation-2026-08-12.json), finalized [funding record](../evidence/development/bsc-testnet-pta-funding-2026-08-12.json), and final [deployment record](../evidence/development/bsc-testnet-pta-deployment-2026-08-12.json) preserve the full public sequence. The exact nonce-`0` deployment succeeded on chain `97` in transaction `0x0852f32bf54aeac58815d93a64a5d38cda2f8615f2a997b4a601a06b380168c7`, producing `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc`.

This key is only for bounded BSC testnet work. Every consuming command fails closed unless the provider and transaction chain ID are exactly `97`; an EVM key itself is not chain-bound. It is not the browser Altana passkey, autonomous session signer, user capital wallet or a mainnet key. The deployment path combined a reviewed custody probe, fresh two-provider observation, canonical legacy EIP-155 serializer, durable append-only one-shot journal, isolated short-lived worker and exact signed-transaction recovery before submission. An initial post-receipt parser error and pruned historical trie did not trigger replacement signing: the committed transaction was reconciled by hash, then its receipt, canonical block, runtime, single mint and token state were verified through two official RPCs. State reads use an exact common finalized EIP-1898 block-hash selector rather than `latest`. The repository contains no private key, password or raw signed transaction.

M1 still uses direct reviewed protocol calls and has no ProofEra execution/guard contract. The isolated `contracts/testnet-fixed-asset` package is a different boundary: it produced the fixed-supply chain-97-only non-economic token now deployed at `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc`. PTA remains unpriced and illiquid. Its offline command emits only a canonical zero-value PTA/WBNB review-call tuple. A separate server-only coordinator can build a complete, short-lived unsigned observation envelope and exposes no signer, custody, journal, transport or broadcast dependency. Only the host/path-pinned Windows PowerShell 5.1 phase-minus-one entry is supported for the phase-zero/phase-one path; direct Node is unsupported and the configured pnpm command is fail-only. A fresh envelope can enter the private path only after exact clean-release policy admission and the owner's separate exact TTY confirmation. The intended seed is the arbitrary test scenario `1 PTA = 0.000001 WBNB`, encoded for the deployed token order as `sqrtPriceX96 = 79228162514264337593543950` with expected tick `-138163`; it is not a quote, peg, oracle, or valuation.

The separate [PTA/WBNB readiness review](./pancake-v3-testnet-pta-wbnb-preparation.md) binds two official RPCs to finalized block `124767685` / `0x1657811b903d77aa58f2a6a78a9536a71e98e36d60c13a6098b75f8962e1fc7c`. At that historical checkpoint, all five PTA/WBNB/Pancake runtime identities matched their retained hashes, factory `getPool` was zero at fee tiers `100`, `500`, `2500`, and `10000`, and the conditional fee-500 candidate `0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE` had empty code and nonce zero. Exact request parameters and both providers' normalized public result payloads are retained in a digest-bound transcript and checked offline; JSON-RPC envelopes and request IDs are intentionally omitted. A later offline review binds the official source archive/blobs, exact native solc, complete compiler inputs/artifacts, pool init-code hash, retained deployer/factory runtimes, and CREATE2 cross-checks. This closes the compiler/artifact blocker for the retained construction path, not current state or pool existence. Factory-owner and LM-deployer controls are mutable and must be refreshed and reviewed.

The direct initializer selector is also locally bound to the exact Position Manager source/artifact/runtime and factory/deployer/pool call graph. Its exact bytes are now published at a revision-pinned, digest-named public Gist and a retained separate unauthenticated no-redirect GET matches all `33,327` bytes and the whole-file SHA-256. The original review remains immutable and its later publication/refetch are joined by `pancake-v3-initializer-selector-publication-manifest-2026-08-13.json`. This still authorizes nothing: no authenticated independent external reviewer is bound to the public direct-only scope, the exact owner authorization is absent, Gist publication is not reviewer authorization, and Gist availability is not guaranteed.

A deterministic [external-review request bundle](../evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json) pins the exact direct-call subject to source commit `00f21c405881a5dc320bddf3c757ba13599b1e71`, exactly its enumerated eight implementation files, the revision-pinned Gist, and retained evidence hashes. It has not been sent and has no recipient, reviewer, provisioned reviewer identity, or Sigstore authentication evidence. Its SHA-256 values provide unkeyed integrity only. The generator, test, and retained artifact pin the historical 45-second envelope cap and are not a producer or evidence source for the revised timing contract. It excludes the later post-claim and submission/reconciliation files and is not used to claim external or authenticated third-party review.

The owner-designated [internal multi-agent technical decision](../evidence/development/pancake-v3-pta-wbnb-owner-designated-internal-review-2026-08-13.json) separately binds commit `bc7000eee4d9698e272cc9deb7dda5748b34318b`, its tree, all 21 pool-prefixed files and the fixed chain-97 transaction tuple. It closes only that exact nonexecuting subject's internal technical-review gate. It is not an external review, Sigstore authentication, authenticated third-party identity, or organizational-independence claim. It supplies no exact owner transaction approval and no production authority or execution capability.

The fixed two-RPC coordinator uses a common finalized EIP-1898 checkpoint, verifies runtime/proxy slots/protocol bindings and latest/pending race state, and requires exact simulation plus balance/gas caps. The fixed transaction protocol, authorization validator, signer core, Windows worker and append-only signing journal live at `%LOCALAPPDATA%\ProofEra\operations\bsc-testnet-pta-wbnb-pool-v1`; journal directories/files require protected current-user ACLs, and receipt self-hashes provide integrity only.

### Authoritative pool-initialization entry

Run only the following host/path-pinned Windows PowerShell 5.1 command with the working directory exactly `C:\Users\tangm\Documents\GitHub\proofera-bnb`, and only after the final release is committed, pushed, and the newly designated exact-release auditors provide the matching triplet. `<AUDITED40>` means the corresponding audited nonzero lowercase 40-hex Git object, and `<AUDITED0x64>` means the audited nonzero lowercase `0x`-prefixed 64-hex runtime-manifest digest; placeholders are not executable values.

```powershell
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\Users\tangm\Documents\GitHub\proofera-bnb\scripts\run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1 --release-commit <AUDITED40> --release-tree <AUDITED40> --runtime-manifest-sha256 <AUDITED0x64>
```

Direct invocation of the phase-zero Node script is unsupported. An ordinary ambient invocation is rejected by the exact-environment check, but phase zero cannot prove parent provenance against malicious preload or same-user code that first installs the accepted environment. The configured `pnpm initialize:pta-wbnb:testnet` command is a fail-only wrapper that returns nonzero and points to phase minus one; neither route is an alias for the production path. `-ExecutionPolicy Bypass` avoids policy-dependent launch drift; it is not an authentication or security guarantee.

Phase minus one begins before Node. It hardcodes and requires the exact repository root, its own exact absolute path, and the absolute phase-zero path. It first clears every variable from its Process environment and installs exactly 13 code-pinned non-secret name/value pairs—11 real-host values plus two WebSocket native-addon disable guards. Through the console methods already present in pinned .NET Framework, it then reads the input mode, clears only `ENABLE_QUICK_EDIT_MODE`, sets `ENABLE_EXTENDED_FLAGS`, and verifies that every other mode bit is unchanged before invoking the pinned Node executable with the exact phase-zero script and audit arguments. It never reads, flushes, synthesizes, or writes console input bytes; redirected/non-console input or any mode failure blocks startup. Phase zero rejects any missing, additional, or changed environment entry. It then uses plain Node built-ins to verify the exact argument grammar and audited triplet; pinned Node version/path/size/hash; direct `D:\Git\mingw64\bin\git.exe` path/size/hash and constrained Git configuration; repository root; exact `HEAD == origin/main`; requested commit tree; Git-clean tracked and unignored-untracked state plus explicit ignored runtime-topology/dependency checks; every enumerated release source—including `scripts/run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1`—as its Git blob; pinned runtime dependency trees; absence of a repository-local Git attribute override; and working directory. It repeats the Git identity, source-manifest, ignored-topology, and dependency checks, then spawns the exact phase-one CLI with the same 13-value environment and pinned loader. A failure emits a generic blocked result without echoing arguments, paths, environment, or file bytes.

Apart from the two verified console input-mode bits and its own Process environment, phase minus one performs no repository write, journal read, TTY ceremony, RPC call, custody-artifact access, signature, or send. Phase zero is read-only. After both complete, signing/submission recovery is phase one's first application-stateful or external operational action and happens before a fresh policy, TTY, RPC, or custody path. This narrows the bootstrap boundary; it is not secure boot. The trusted computing base includes both the phase-minus-one bytes before their later manifest check and the phase-zero bytes that execute before and during their own checks, all Windows PowerShell 5.1/.NET startup behavior and ambient environment until scrub, Windows and its filesystem/process semantics, the pinned Node/direct-Git executable files, and every OS/runtime/DLL component they load. The later self-check and Git-blob checks are evidence rather than a root of trust, and the complete host installations are not hashed. Stable-handle/repeat checks and a minimal child environment do not actively prevent malicious preload or code running as the same Windows user, prove parent provenance, or cover every concurrent mutation between checks and child execution.

There is no active same-user defense and no complete defense against concurrent mutation between checks and child execution.

On a fresh path, phase one accepts only a canonical policy for that exact clean published commit/tree/full runtime manifest, instantiates it for the fresh envelope, then prints the complete decoded owner challenge with a fresh 32-byte OS-CSPRNG nonce and accepts only the exact confirmation bytes. Preactivation custody inspection is intentionally metadata-only: fixed path, `lstat`/file kind, `realpath`, and current-user ACL. It does not open the encrypted keystore or DPAPI blob, invoke DPAPI, unlock the keystore, or reconstruct a key before the signing journal durably records `worker_started`. The closure-private capability therefore authenticates only the current Windows user's fixed-path ACL possession; it must not be described as custody-key ownership or expected-signer proof. After the durable claim, the worker unlocks inside its bounded path and the recovered signed transaction attests the exact expected sender before any broadcast capability can be used. The descriptor-bound ceremony command and one-consume signature/broadcast states remain inside the native bridge. The public worker factory and generic raw sender stay hard-blocked.

The historical v1 policy-entry attempt used audited commit `1a89ddae5e1f575b39dda6134d3ccedaddda0adf`, tree `b28a12f78861183ece5ff1c3fce36c0abf094239`, runtime-manifest SHA-256 `0xd5212c7563d5d3e3b10d461b5dedcc1552766262c1c87a7057b4dc2876ed0ce0`, and canonical policy digest `0x9357b560a91b1c41ef8ef84ea39001c206f50fc9839a55102f7916152160a189`; both exact-release audits returned `GO`. The `8,670` policy bytes became `11,560` unpadded-base64url characters and a complete `11,713`-character single-line v1 frame. Windows Console truncated the line. Admission rejected it fail-closed, so the policy was never admitted and owner confirmation was never displayed. Only read-only recovery/journal inspection may have occurred before rejection; there was no fresh RPC, custody-artifact access, DPAPI operation, custody unlock, signature, new transaction hash, send, receipt, pool, or liquidity. The v1 triplet and policy are historical only after the transport source changed and must never be passed as the audit identity or policy for v2.

For the current v6 challenge/frame domains, construct one nonce-bound ASCII `BEGIN` line, the exact ordered nonce-bound `CHUNK` lines, and one nonce-bound `END` line using the bounded state machine introduced in v2. Every line repeats the exact line index, chunk count, policy byte length, and lowercase raw policy-byte SHA-256; each chunk also has its zero-based chunk index. Use LF or CRLF only. The reader hard-rejects a content line above `4,096` bytes; the maximum valid worst-case line is exactly `2,618` content bytes and is tested against a conservative `2,700`-byte ceiling. Total transport must not exceed `102,400` bytes, policy length must be `1..65,536` bytes, and each non-final chunk payload must contain exactly `2,304` unpadded-base64url characters. Derive `N` from the canonical encoded length; `N` is at most `38`. The historical `11,560`-character payload would require six chunks and eight bounded lines, but it remains obsolete. A one-off local Windows Console observation motivated these conservative constants, but its harness and result are not retained and it is not reproducible repository evidence. Repository unit tests establish only the transport arithmetic and parser behavior. All lines share one absolute five-minute deadline. The reader rejects retired v1/v2/v3/v4/v5 domains, truncation, bad length/hash/encoding, control or blank input, missing/duplicate/reordered lines, and any trailing or buffered data before policy admission, fresh RPC, custody access, or owner authority. This protocol does not prove absence of data already queued by the OS and adds no preload or same-user isolation guarantee.

One later exact v2 exercise used release commit `36f6e5e7fa8b4b5ccf255a6210afa2d25c25afa5`, tree `54ed5c2a8f754e79080528a2ce25669a6532a66b`, runtime-manifest SHA-256 `0x25e5aedb6d73e6fff416803ce9d42737d9124e525e0b81bf906321f4d06258d4`, and canonical policy digest `0xd1a33479a607d744a51ff8d6d3df8772f41ec2f1363911d2655f926c754c3b38`. The v2 reader admitted the policy. Recovery probes found both signing and submission journals absent, fresh read-only preflight against the two fixed official RPCs succeeded, and the exact owner challenge was displayed. No exact owner confirmation was accepted. Subsequent attempts failed closed with `POLICY_FRAME_INVALID`, `CEREMONY_IO_FAILED`, and `OWNER_CONFIRMATION_INVALID`. They accessed no custody artifact, invoked no DPAPI operation or unlock, and produced no signature, new transaction hash, send or broadcast, receipt, pool, or liquidity. This is a one-off local terminal observation; no raw output or harness was retained, so it is not reproducible repository evidence or a release gate. The negative custody/sign/send statements combine the observed fail-closed result with code ordering rather than a retained artifact. Because the timing source then changed, that exact triplet and policy are historical and non-authorizing.

The incident release separated an exact `300`-second coordinator envelope, an owner-entry window of at most `240` seconds, an exact `45`-second execution-authority lifetime, and a `30`-second post-claim recheck freshness bound. The strict confirmation deadline was `min(challengeIssuedAt + 240 seconds, envelopeExpiresAt - 45 seconds)`, reserving the full execution lifetime. The v4 owner bytes bound `challengeIssuedAt`, `confirmationNotAfter`, the 45-second lifetime, and its deterministic derivation rule. Only after an exact byte match did the internal clock capture actual `confirmedAt`; the `WeakMap`-branded v4 command then bound `executionExpiresAt = confirmedAt + 45 seconds`. A refreshed post-claim timestamp had to be at or after `confirmedAt` and preserve that exact expiry. Generation 2 retains these timing limits under recovery-bound v5 domains. The five-minute frame deadline and numeric transport limits above are unchanged; those historical v4 domains are retired in favor of current v5.

The next production exercise was a one-off local operational observation. It used audited commit `336af2967286795dc7703fff85034c71b8e84b5c`, tree `86cc383388982dac1a2bea430f54d54e56bb6cf9`, runtime-manifest SHA-256 `0xa1cda6fcf00f8a7d2b9a679cfb9b3fc28aa60674dae89c7dbfc032bdbcff5bdd`, and canonical policy digest `0x8ddae3b13ee64ff5f983ce30d06c84d671e0a0ca029f75b5482de6b34b18ba54`. Its `8,826` bytes had raw SHA-256 `0x87de481e35a0d8fe6c503f4a7c832d665699ac9f20aa79eb5c40471d79e71a45` and `11,768` unpadded-base64url characters across six chunks. Policy admission and exact owner-v4 confirmation both succeeded. The legacy signing journal durably wrote only slot 1, then Windows QuickEdit/selection froze the console during the post-claim RPC recheck. Cancelling selection after the 45-second authority expired produced the observed `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN` result with no transaction hash. The exact `1,123`-byte legacy claim has raw SHA-256 `0xf10e90eb836a94446ace100bbc9a6fc5de6cc35b1d82e4d10fb4736ef8559e32`; exact journal inspection and code ordering show no worker authorization/start or later legacy slot, the submission namespace was exactly empty, and no custody artifact, DPAPI/unlock, signature, send, receipt, pool, or liquidity occurred. Raw console output and the operational harness were not retained, so the owner/terminal observation is not reproducible repository evidence or a release gate. A later live dual-RPC no-effect check was also not retained and cannot be reused as recovery proof. The release, policy, and expired v4 confirmation are historical and cannot authorize generation 2.

Generation 4 is a closed historical incident. Its one-off local owner-v7 run durably retained the exact claim hash `0xd5fc6da9f853c621f4f407c9d8a729f898c0297720bc50817e633fa538967f36` and `failed_before_worker` transition hash `0x2e0570423b1217f1dab6fa8cdb91a0a75b2d78023bacc611a6c81017d0033bab`, with code `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`. Exact two-slot local-journal ordering proves no worker authorization/start/signature. Separate exact-empty submission-v3 plus code ordering proves no submission/send and supports the observed absence of custody-secret access and DPAPI/unlock. Raw console output and its harness were not retained, so this is not reproducible repository or chain evidence and creates no transaction receipt.

Recovery generation 5 binds that exact terminal directly and separately requires exact-empty submission-v3. There is no Invocation A, no new no-effect proof, and no reusable fence snapshot. It admits only a fresh distinct envelope after the terminal through policy/runtime-instantiation v5, TTY v6, and owner-v8. Signing/authorized intent/broadcast are v5; active submission is v4 with schema/files v6. Its envelope/owner-cap/authority/preclaim/recheck caps are exactly `300/240/120/60/60/20/30` seconds; the owner deadline is further bounded by preserving the full 120-second authority reserve. Any durable evidence, contamination, path/ACL ambiguity, race, or unknown append blocks.

Generation 5 uses `%LOCALAPPDATA%\ProofEra\operations\bsc-testnet-pta-wbnb-pool-v5` for active signing. Generation-1 through generation-4 signing namespaces remain immutable predecessors. Submission-v2 and submission-v3 are strict read-only predecessor probes; active submission uses `bsc-testnet-pta-wbnb-pool-submission-v4` with v6 journal records. All eight namespaces are read before authority. Retained started/unknown state reconciles only; no resend/replacement is possible.

Terminal reconciliation requires both fixed providers to return identical normalized transaction, receipt, expected logs, receipt-block identity, and EIP-1898 post-state. For each provider, the fixed receipt-plus-128 finality sequence is the provider-attested sandwich `F1 -> C1/ancestry -> C2 -> F2 -> EIP-1898(C)`: first finalized-tag head `F1`; checkpoint `C1` at receipt block plus exactly 128 and the continuous exact-number parent-linked ancestry from receipt to `C1`; exact-number checkpoint reread `C2`; a non-regressing second finalized-tag head `F2`; then an EIP-1898 `requireCanonical` state read at checkpoint `C`. Both providers must agree on the checkpoint and attestations. These are fixed dual-RPC semantic checks: they are not a cryptographic proof that `C` is an ancestor of `F1`/`F2`, do not prove provider independence, and do not tolerate two colluding or identically faulty Byzantine providers.

This runbook supplies no triplet or canonical policy for generation 5. Historical triplets/policies and owner-v4/v5/v6/v7 confirmations are non-authorizing. It records no generation-5 owner-v8 confirmation, signature, send, receipt, pool, or liquidity.

The command exits successfully only after a validated durable `confirmed` result. `reconciliation_pending`, `reverted`, blocked and do-not-retry results exit nonzero. Generation 5 has no Invocation-A restart path; its exact generation-4 terminal is immutable predecessor evidence, not authority. For `reconciliation_pending`, rerun the same command only to invoke recovery-first receipt reconciliation; the journals ensure that this cannot resend or replace the transaction. A reverted or other terminal result must not be retried.

Pool initialization remains a separate write requiring fresh state, exact generation-5 release audits/triplet/policy, and owner-v8 authorization. Historical decisions and confirmations close no such gate. Initialization adds no liquidity; any LP mint remains a second separately reviewed and approved transaction.

The PTA deployment preserves the exact compiler, optimizer/runs, constructor arguments, empty link/immutable references, source path, artifact digests and runtime identity in local build evidence. Explorer source verification remains pending because the current supported-chains table marks chain `97` unavailable on the free API tier. If an eligible key is approved, use Etherscan API V2/Foundry with explicit chain ID `97` and require `Pass - Verified`; a submission GUID alone is not success. Chain `56` and any paid action still require separate mainnet/payment approval. Never place the explorer key in client code or command output.

## Testnet evidence sequence

After local policy/worker/browser readiness:

1. Create/recover an Altana passkey wallet on the final testnet evidence hostname.
2. Fund only with faucet/minimal test assets.
3. Commit and push generation 5, obtain new exact audits and commit/tree/runtime-manifest triplet, and invoke only the absolute PowerShell phase-minus-one command. Bind the exact generation-4 terminal, admit the matching policy through TTY v6 on a fresh later envelope, and require fresh owner-v8 authorization. Reconcile any initializer receipt before preparing a separately approved LP mint.
4. Promote the two host-local PostgreSQL 17 staging databases only after backup/restore and reboot drills. Preserve their isolated migration/application roles. Require the LP administrator verifier plus direct-login application probe before binding `consumeOrRead`; separately require the grant server's same-pool `verifyReadiness` before accepting a grant claim. The staging verifier and local 10-case LP/18-case grant suites prove schema/application boundaries, not worker or release readiness.
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
