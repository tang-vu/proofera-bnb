# ProofEra

**Hire agents by proof, not promises.**

**Target product:** ProofEra is the risk-aware marketplace where users discover, verify, compare, hire, control, and revoke autonomous DeFi agents on BNB Smart Chain.

This repository is under active development for BNB Chain's “The Smart Money Era: Build the Era” hackathon. A feature is labeled live only after its endpoint and onchain receipts are independently verifiable. Unknown evidence stays unknown.

## What ProofEra is building

- Goal-first discovery across LP rebalancing, grid trading, yield optimisation, and health-factor monitoring.
- Comparable Agent Passports with source-linked metrics, freshness, methodology, and explicit missing-data states.
- A transparent, versioned Proof Score that penalizes stale or incomplete evidence.
- Target activation model: scoped Altana sessions with contract/function allowlists, spend caps, expiry, and verified revoke. Local policy/bootstrap/lifecycle, one-shot SDK grant, and canonical append-only PostgreSQL grant-claim boundaries exist. The database is not deployed and no wallet grant is represented as complete.
- Target Mission Control and Proof Stream for source-linked actions, outcomes, permissions, and receipts. The current route is an intentionally empty verified-state surface until real authority exists.
- Reference BNB Agent Studio agents so the critical journey does not depend on unknown third-party supply.

The first vertical slice targets a bounded PancakeSwap LP range agent on BSC testnet. It is not yet an activated agent: local work currently covers strict intent, block-pinned read and authority primitives, exact quote math, policy/session lifecycle boundaries, and configuration/error UX. See the [execution plan](./docs/EXECUTION_PLAN.md) and [research record](./docs/research.md).

Current verified local slices include server-side 8004scan live-source identity discovery/detail, Passport comparison, judge-visible read-only Pancake, Venus, and Lista evidence routes, a configuration-only LP boundary, separate configuration-only Grid/Yield/Health mandate routes, strict four-category evidence and publication schemas, Proof Score 1.1 draft, a no-return-ranking intent matcher, and pure Altana policy/bootstrap/grant/execute/revoke lifecycle boundaries. The exact-0.7.0 grant adapter requires an explicit matching RP ID, a production WebAuthn P-256 signer shape, and an atomic one-shot claim before it invokes the SDK. The claim ledger now has a canonical PostgreSQL 17 migration, independent catalog/ACL/namespace/role-setting verifier, same-pool module-owned transaction gateway, 68 focused tests, and 18 real PostgreSQL cases. Its only package export is server-only, and its readiness still reports `deploymentConfigured: false` and `releaseReady: false`. Every grant outcome remains non-executable until authority is independently observed. Direct Pancake calldata is decoded canonically and checked against a separately injected server plan before it can be considered ready. Separate EIP-1898 readers validate runtime-code hashes and the intended controller's ERC-721 ownership/approval evidence at an already bound canonical block with no latest/block-number fallback; no ProofEra-controlled position or current authority is inferred.

LP activation context schema v3 binds the complete strict user intent and block-pinned quote payload into domain-separated context/quote IDs. Write-target attestation schema v2 separately models the Position Manager's four direct liquidity selectors and denies all three multicall dispatchers; the observed self-`DELEGATECALL` path is therefore disclosed instead of being hidden behind a whole-runtime safety claim. The exact manager source rebuild and four deterministic local selector-path artifacts now bind the same canonical lowercase-manager write scope as the production composition seam. A server-only intake accepts only corresponding canonical bytes at digest-named public HTTPS URLs after a fresh, independent no-redirect retrieval record and an out-of-band allowlisted review ID; it explicitly rejects the local package. Activation remains blocked until those artifacts are actually published/re-fetched and an economically eligible pool/token pair exists.

An isolated fallback token exists at `contracts/testnet-fixed-asset`: ProofEra Test Asset (`PTA`) is a chain-97-only, fixed-supply, non-economic ERC-20 with no admin or later-mint surface. Its compiler/build/ABI/bytecode preparation is reproducibly tested, and the exact artifact is now deployed on BSC Testnet with a finalized two-provider receipt. A later two-provider, exact-finalized-block readiness snapshot found no PTA/WBNB V3 pool at fee tiers `100`, `500`, `2500`, or `10000`. At capture time it recorded the fee-`500` CREATE2 candidate `0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE` only as a deterministic conditional result without an independently bound compiler/artifact proof. A subsequent offline provenance review closed that exact derivation blocker for the retained source/compiler/deployer path; it does not make the historical candidate a current observation, reservation, or pool. The offline initializer scenario now uses the arbitrary test ratio `1 PTA = 0.000001 WBNB` (`sqrtPriceX96 = 79228162514264337593543950`, expected tick `-138163`), not the old raw-unit `1:1` placeholder. It remains a zero-value review tuple, not a quote, pool, transaction, price, oracle, or approval. See the [PTA/WBNB preparation record](./docs/pancake-v3-testnet-pta-wbnb-preparation.md).

PTA remains unpriced and illiquid; deployment and read-only readiness alone make no pool or activation path eligible. Pool initialization and a later LP mint require separate explicit approvals. The provisional LP envelope of at most `1,000 PTA` plus `0.001 WBNB` is not approved and has no funding, wrapping, allowance, calldata, or receipt behind it. Creating or funding a pool, protocol execution, or paid explorer verification remains separately gated.

The dedicated PTA deployer uses a reviewed external Web3-v3/DPAPI custody boundary and a durable one-shot journal. The exact nonce-`0`, zero-value chain-`97` deployment landed at `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc` in finalized transaction `0x0852f32bf54aeac58815d93a64a5d38cda2f8615f2a997b4a601a06b380168c7`. Two official BNB testnet RPCs agree on the receipt, canonical block, 1,826-byte runtime, exact single mint, metadata, `1,000,000 PTA` supply and recipient balance. Public endpoints had pruned the deployment-block state trie, so code and token state are bound instead to an exact common finalized block through EIP-1898 `blockHash + requireCanonical`; this is recorded separately from the deployment block in the [public deployment record](./evidence/development/bsc-testnet-pta-deployment-2026-08-12.json). No secret, password or raw signed transaction is retained in repository evidence, and no mainnet action occurred.

A bounded exact-block search reviewed 14 factory-authenticated WBNB pools and admitted none. Configured counterparties had unrestricted mint/burn paths; recent tokens lacked source/control proof and their pools had one oracle observation; the retained CAKE pair remained unsafe. The search is not described as factory-lifetime complete: blocks `28,488,223–124,399,999` still require archive-complete WBNB-indexed event coverage. See the [candidate review](./docs/pancake-v3-testnet-pool-candidates.md).

The canonical testnet WBNB itself now passes strict token-component admission: one exact 1,793-byte source unit compiled with official solc `0.4.18+commit.9cf6e910` reproduces both the complete 3,504-byte creation transaction input and all 3,124 deployed runtime bytes. Together with the separately verified PTA deployment this closes both token-component identities for a prospective fixture; it still does not create or qualify a pool, establish price/liquidity/oracle quality, or authorize a write. See the [WBNB verification](./docs/pancake-v3-testnet-wbnb-source-verification.md).

The deterministic [external-review request bundle](./evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json) pins the direct-only initializer scope to source commit `00f21c405881a5dc320bddf3c757ba13599b1e71`, its exact eight-file implementation subject, and the revision-pinned, digest-named Gist. It has not been sent, identifies no recipient or reviewer, and contains no Sigstore authentication evidence. Its unkeyed hashes provide integrity only. It predates and excludes the later post-claim and submission/reconciliation files and is not used to claim an external or authenticated third-party review.

For the exact nonexecuting one-shot chain-97 scaffold, the repository owner instead designated two distinct read-only subagent tasks as an internal technical-review lane. Its deterministic [decision](./evidence/development/pancake-v3-pta-wbnb-owner-designated-internal-review-2026-08-13.json) binds commit `bc7000eee4d9698e272cc9deb7dda5748b34318b`, its complete 21-file pool-init subject and fixed transaction tuple. This closes only the owner-designated internal technical-review gate for that exact subject. It is not external review, Sigstore evidence, authenticated third-party identity or organizational-independence proof, and it supplies no owner transaction authorization, production composition, custody, signing, broadcast, receipt, pool or liquidity. Any changed implementation or production release requires a new distinct-agent decision.

A test-only post-claim recheck core now requires an already authenticated exact intent before it can compare the two fixed official RPCs, bind common-finalized EIP-1898 state, repeat nonce/pool/candidate/simulation/balance/gas checks, and issue a short-lived in-memory capability. Its 17 focused tests are implementation evidence only. Local fixed-RPC and journal/composition building blocks now exist but remain unwired; the production constructor, runner, native worker and broadcaster hard-block with `PRODUCTION_AUTHORIZATION_UNAVAILABLE` before custody/sign/send.

A separate submission/reconciliation scaffold specifies and validates the one exact signed transaction, a fresh dual-RPC pre-submission snapshot, winner-only durable `submission_started`, at-most-once send with no resend or replacement after ambiguity, and exact dual-provider finalized receipt/log/EIP-1898 post-state reconciliation. Fixed-RPC normalization, a durable submission journal and composition/reconciler code exist locally for review, but no executable production bridge exists: runner, native worker issuer and broadcaster hard-block. No send, receipt, pool, or LP position exists.

The Altana handoff rebuilds from recursively snapshotted raw intent/server evidence and accepts only a nominal PostgreSQL `consumeOrRead` capability produced after exact schema and application-access verification. Its atomic receipt binds context, quote, user, policy, write-target attestation, and expiry. Policy and attestation must agree on the exact block number, hash, and timestamp; a final monotonic sample rechecks both reservation expiry and target freshness, and a failed final check cannot retain a nested ready bootstrap. The concrete server-only PostgreSQL implementation has a versioned append-only schema, an externally pinned PostgreSQL 17 catalog digest, a nominal administrator-verification capability, a least-privilege application pool, bounded transaction outcomes, and 10 passing real-PostgreSQL 17.9 cases. It is CI-gated but not deployed or configured; there is still no live worker authority, grant, or transaction.

All four reference analyzers have exact-pinned, hardened, non-executing local A2A/MCP runtimes with realized performance withheld, bounded unpredictable sessions, honest unauthenticated cards, and independent CI matrix entries:

| Reference analyzer     | Local tests | Evidence boundary                                                        |
| ---------------------- | ----------: | ------------------------------------------------------------------------ |
| LP Range               |          17 | caller-supplied analysis; no wallet, public endpoint, registration/write |
| Grid Trading           |          24 | caller-supplied analysis; no wallet, market fetch, registration/write    |
| Yield Optimisation     |          33 | caller-supplied analysis; no source attestation, registration/write      |
| Health-Factor Guardian |          37 | caller-supplied analysis; publication/activation flags remain false      |

The development dossiers report calculator coverage per metric, not per agent. Only `current_range_state` (LP), `configured_range` (Grid), `net_apy` and `gas_impact` (Yield), and `current_health_factor`, `minimum_health_factor`, and `alert_latency` (Health) are marked `implemented_not_run` with their exact analyzer version. Every other dossier metric is `definition_documented_calculator_absent` with `methodologyVersion: null`. These are implementation statements, not measurements or performance claims.

The SHA-pinned CI workflow has root verification, a digest-pinned PostgreSQL 17.9 job for both activation ledgers, four fail-independent reference-agent matrix jobs, an isolated fixed-asset contract job, and an isolated Playwright job. A workflow definition and local passing gates are not a hosted green run. None of the analyzers is a public agent or BSC registration; PTA deployment is the sole ProofEra testnet write, and no ProofEra grant, Pancake operation, revoke, or performance transaction exists. The permission-preview model/renderer is not wired into `/lp-activate`; Mission Control remains an honest no-authority surface. `/api/health` is liveness only, while `/api/readiness` intentionally remains `503 not_ready` until the reviewed write target, eligible pool, deployed database, worker signer handoff, exact authority probe, and passkey ceremony are all configured and probed.

Useful local routes:

- `/marketplace` — immediate intent and four clearly non-live first-party analyzer records, with live ERC-8004 identity ingress streamed independently into explicit pending/empty/unavailable/available states;
- `/pancake-position` — user-supplied Pancake V3 position, pool, and atomic one-block evidence boundary;
- `/lp-activate` — testnet-only user configuration with every trusted activation artifact explicitly absent;
- `/configure/grid-trading`, `/configure/yield-optimisation`, and `/configure/health-factor-monitoring` — category-specific, GET-only mandate capture with explicit BSC network and exact financial strings; all nine readiness flags remain false and the configuration handler performs no RPC read, HTTP fetch, wallet access, application-environment lookup, or write;
- `/mission-control` — verified-state-first empty control surface; it exposes no action or revoke control before authority exists;
- `/venus-health` — raw Core Pool account liquidity with health factor held `UNKNOWN`;
- `/yield-sources` — bounded Lista vault-list fields with APY scale and net APY held `UNKNOWN`.

## Repository map

| Path                            | Purpose                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/web`                      | Marketplace UI and server routes                                                                                   |
| `packages/domain`               | Evidence schemas, Proof Score, intent matching, publication and activation policy                                  |
| `packages/integrations`         | Runtime-validated protocol and registry adapters                                                                   |
| `packages/benchmarks`           | Paired TermiX experiment validation, hashes, costs, rubrics, and receipt joins                                     |
| `agents`                        | Isolated reference-agent workspaces; pinning and Studio packaging are verified per agent                           |
| `contracts/testnet-fixed-asset` | Isolated fixed-supply BSC-testnet artifact/source package plus offline deployment and pool-initializer preparation |
| `docs`                          | Research, architecture, security, methodology, deployment, and submission records                                  |
| `evidence`                      | Reproducible non-secret raw outputs and receipt manifests                                                          |

## Local development

Requirements: Node 22+ with Corepack. The repository pins pnpm and exact dependency versions.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example apps/web/.env.local
pnpm dev
```

PowerShell equivalent: `Copy-Item .env.example apps/web/.env.local`. Next.js runs from `apps/web`, so a root `.env.local` is not the application environment file.

Open `http://localhost:3000`. An 8004scan API key is optional for anonymous development; the UI must show rate-limit/unavailable states when the upstream cannot be read.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm security:secrets
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm verify` runs the non-browser gates together. Onchain evidence is a separate explicit testnet workflow and is never generated by routine tests.

The root evidence test regenerates/checks the retained selector-path package and verifies the content-addressed WBNB machine record, script pins, and narrow human claim. Full selector recompilation uses the isolated instructions in `docs/pancake-v3-selector-path-review.md`; full WBNB recompilation additionally requires the SHA-pinned official Windows solc 0.4.18 binary described in `docs/pancake-v3-testnet-wbnb-source-verification.md`. None of these commands authorizes a write.

The isolated fixed-asset gate is separate from the root workspace:

```bash
cd contracts/testnet-fixed-asset
pnpm install --frozen-lockfile
pnpm verify
```

That command compiles and tests locally; it never reads a signer or RPC endpoint and never deploys.

The Pancake inspector also has an opt-in, read-only provider check. It is skipped by routine CI because a live position can be burned and public RPC availability is external state. The route publishes only the second of two reads: one unsplit latest Multicall3 snapshot, reconciled to its exact block identity. Supply a currently existing position and its factory-resolved pool when refreshing evidence:

```bash
PROOFERA_LIVE_READ_EVIDENCE=1 PROOFERA_LIVE_POSITION_ID=7115046 PROOFERA_LIVE_POOL_ADDRESS=0x27B5c411a43DEA7cA7e60632eA73fd9E74ED06A8 pnpm --filter @proofera/web exec playwright test tests/e2e/pancake-position-live.spec.ts --project=chromium
```

PowerShell uses separate prefixes such as `$env:PROOFERA_LIVE_READ_EVIDENCE="1";`.

This command never signs or sends a transaction. An unavailable result is not converted into a fixture.

The ownership/approval boundary has a separate opt-in live check. It discovers a block only in the test harness, then gives the production adapter that exact number/hash/timestamp. Every `ownerOf`, `getApproved`, and `isApprovedForAll` call uses `{blockHash, requireCanonical:true}`; the adapter itself has no latest or block-number fallback. Freshness and public provider identity are trusted reader configuration rather than request fields:

```powershell
$env:PROOFERA_RUN_LIVE_PANCAKE_TESTS="1"; $env:BSC_TESTNET_RPC_URL="https://bsc-testnet-rpc.publicnode.com"; pnpm --filter @proofera/integrations exec vitest run src/pancake-v3-authority.live.test.ts
```

The retained development observation uses a third-party NFT and proves no ProofEra control. A separate ProofEra-controlled minimal-value position is still required before activation evidence.

The observation record also contains a deterministic exact-block replay command and a SHA-256-bound raw response record. Its injected historical clock reproduces the original classification; it is not evidence that the position remains fresh or controlled now.

The isolated Studio reference agent uses its own pinned pnpm workspace:

```bash
cd agents/lpRangeAgent
pnpm --filter lpRangeAgent-agent build
pnpm --filter lpRangeAgent-agent test
pnpm audit --prod --audit-level high
```

Its `analyze_lp_range` A2A/MCP skill is deterministic and read-only. It analyzes caller-supplied, source-identified snapshots and always returns `executionEnabled: false`; this local capability is not a live-agent or performance claim.

The isolated Grid reference analyzer is also exact-pinned and read-only:

```bash
cd agents/gridTradingAgent
pnpm verify
pnpm audit:prod
```

Its arithmetic-grid screen uses exact decimal and minor-unit math, evaluates known fee-plus-gas cost against the narrowest highest-price interval, and returns only `hold`, `review_grid`, or `insufficient_evidence`. Realized PnL, fills, win rate, maximum drawdown, wallet authority, and execution remain explicitly absent.

The Yield Optimisation reference analyzer is likewise exact-pinned and non-executing:

```bash
cd agents/yieldOptimisationAgent/app/agent
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm audit --audit-level high
```

It preserves documented APY units, subtracts only fully sourced known costs with exact bigint/rational arithmetic, and withholds net APY when scale, annualization, economics, liquidity, withdrawal, exposure, route history, or exact representability is missing. Supplied route references never become realized performance.

The TermiX harness is also deliberately non-executing. It rejects mismatched paired declarations and enables a publishable comparison only after both runs carry complete, verified timing, cost, output, rubric, and receipt evidence. Exactly three local preregistrations bind the LP-trading, permission-security, and Venus-health protocols while leaving real inputs and runners `UNBOUND`; both methods remain `NOT RUN` and non-publishable:

```bash
pnpm --filter @proofera/benchmarks typecheck
pnpm --filter @proofera/benchmarks test
```

The current benchmark/preregistration suite has 22 tests. Its local SHA-256 definition digests detect edits; they are not public timestamps, agent results, receipts, or advantage claims.

## Data and environment labels

- **Live mainnet/testnet:** fetched or decoded from an identified live source with observed time.
- **Stale:** last valid evidence exists but exceeds its stated freshness policy.
- **Unavailable:** the source failed; this is not shown as “zero” or replaced with a fixture.
- **Simulation:** deterministic model output, never presented as realized performance.
- **Fixture:** test/development input that cannot enter strict production data paths.

Read [requirements traceability](./docs/requirements-traceability.md) to see how each competition requirement maps to features, tests, and receipts.

## Security posture

ProofEra does not custody user keys. Browser passkeys remain on the user's device; the four reference analyzers contain no signing keys or transaction path; any future autonomous signer must live only in a dedicated encrypted worker/KMS. A separate disposable chain-97 deployment key and no-secret custody probe were used only for the finalized PTA fixture deployment and are not part of the user journey. Server-only secrets never use `NEXT_PUBLIC_`. Default development targets BSC testnet. No mainnet deployment, token approval, transfer, or paid service is performed without explicit approval.

See [AGENTS.md](./AGENTS.md) for engineering invariants and `docs/security.md` as the threat model is completed.

## Project records

- [Architecture and enforcement boundaries](./docs/architecture.md)
- [Data methodology](./docs/data-methodology.md)
- [Proof Score methodology](./docs/proof-score.md)
- [Security threat model](./docs/security.md)
- [Deployment and testnet evidence runbook](./docs/deployment.md)
- [PTA/WBNB Pancake V3 read-only preparation](./docs/pancake-v3-testnet-pta-wbnb-preparation.md)
- [TermiX agent-advantage protocol](./docs/agent-advantage-report.md)
- [Demo script](./docs/demo-script.md) and [submission record](./docs/submission.md)

The generated LP reference workspace is under `agents/lpRangeAgent`. Its current local doctor record proves toolchain readiness only; no wallet, live endpoint, ERC-8004 registration or transaction exists yet.
