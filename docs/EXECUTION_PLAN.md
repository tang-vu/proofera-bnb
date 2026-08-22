# ProofEra execution plan

Updated: 2026-08-21
Deadline: 2026-09-09 12:00 UTC
Operating principle: complete and verify the highest-value unblocked judge journey before expanding breadth.

## Winner path

The official page was rechecked on 2026-08-16. The main prize remains winner-takes-all: $30,000 equivalent plus adoption as the canonical BNB Agent Studio marketplace. The explicit rubric is the end-to-end journey, decision-useful live data, and equal first-class coverage of all four agent categories. Work is therefore ordered as follows:

1. Make the zero-instruction `land → choose a job → discover → understand → activate` journey coherent across all four categories.
2. Deploy four durable Agent Studio endpoints and record BSC registrations before treating deeper LP execution as judge-eligible breadth.
3. Attach comparable, source/time/methodology-bound evidence and category-specific configuration to every live agent.
4. Complete one bounded Altana session lifecycle and one real PancakeSwap benefit receipt without weakening the other three categories.
5. Run the three preregistered TermiX pairs, publish only complete results, then freeze the public judge build and submission evidence.

The first UX correction removes diagnostic-route clutter from the landing hero and makes every category card a direct, query-bound marketplace entry. Playwright verifies that the selected financial job survives navigation without instructions. Local verification remains authoritative until GitHub Actions can start jobs; runs are currently rejected before step execution because the repository owner's account reports a failed payment or spending-limit condition.

The marketplace and four read-only analyzers now have durable HTTPS endpoints on the owner's always-on Windows host, supervised by PM2 behind a named Cloudflare Tunnel. Repeatable local/public probes cover marketplace health, analyzer health, exact Agent Card URLs, and the exact advertised skill IDs for each agent. Finalized BSC-testnet ERC-8004 receipt evidence binds Agent IDs `1825` through `1828`; it proves identity publication only. All analyzers still declare execution disabled, and evidence-backed live data, marketplace eligibility, activation authority, and execution receipts remain required.

The Windows release topology now fails closed without an immutable build identifier. Its release probe binds the public health response to the exact published commit and requires readiness to be honestly `not_ready`, never `misconfigured`; a PM2 monitor repeats the same marketplace/agent/Card/readiness checks every five minutes. The public `/proof` route renders the exact build, four endpoint skill contracts and the committed seven-gate submission ledger, including blockers and digest-bound artifacts. External alert delivery, rollback exercise, deployed data/worker probes, final release freeze, and a genuinely ready activation path remain open.

## Status legend

- `DONE`: acceptance criteria and evidence exist.
- `ACTIVE`: current implementation focus.
- `READY`: unblocked and specified.
- `BLOCKED`: requires a user-only secret/account/irreversible action.
- `PLANNED`: depends on an earlier milestone.

## Milestone 0 — ground truth and guardrails (`DONE`)

Acceptance criteria:

- Repository, git state, tools, and governing instructions inspected.
- Official hackathon page and linked primary documentation reviewed.
- Current APIs/packages/chains/contracts/rate limits recorded with uncertainties.
- Root `AGENTS.md`, this plan, and requirements traceability exist.
- No architecture depends on an invented endpoint or undocumented contract.

Evidence:

- [`research.md`](./research.md)
- [`requirements-traceability.md`](./requirements-traceability.md)
- Root [`AGENTS.md`](../AGENTS.md)

Completed evidence includes the exact Studio CLI compatibility/scaffold/doctor spike, dependency compatibility checks, Venus/Lista reads, deployment constraints and verification requirements. The implementation record was updated on 2026-08-16; official competition facts were last checked on 2026-08-16. Fast-moving packages and official competition pages remain re-check items before deployment/submission rather than blockers to implementation.

## Milestone 1 — winning marketplace journey (`ACTIVE`)

Goal: one coherent four-category marketplace journey, with LP rebalancing as the deepest bounded execution proof rather than the only first-class product path.

Acceptance criteria defined before implementation:

1. A user can start from “automate a CAKE/BNB LP” intent and see risk/capital/horizon inputs.
2. Discovery consumes a typed real registry adapter; outage, empty, stale, testnet, simulation, and unverified states are visually distinct.
3. At least two comparable records can be selected, but activation is enabled only for a genuinely executable curated agent.
4. Passport identity and every performance field have source/time/methodology or explicit unknown.
5. Proof Score is deterministic, versioned, category-aware, and penalizes missing/stale evidence; tests cover boundaries and monotonic penalties.
6. Configuration validates capital, assets, range/risk policy, slippage, minimum capital, and expiry. A server context becomes ready only when the atomic position/pool snapshot, exact-block runtime hashes, manager immutable relations, token decimals, ERC-721 controller authority, and SDK-equivalent liquidity/minimum calculation all bind the same BSC testnet block and a separately approved manifest. Client data cannot supply or widen those facts.
7. Permission preview names network, wallet, contract/function allowlist, token cap, period, expiry, slippage/deadline, emergency behavior, and revoke path in plain language.
8. Altana grant uses BSC testnet, explicit calls+spend, Keystore registration, and handles confirmed/rejected/failed/unknown-outcome states without double submit. Because SDK 0.7.0 discards the grant `callsId` when its internal wait returns pending, unknown outcomes are never retried until exact onchain authority is probed.
9. A bounded PancakeSwap operation is simulated before signature and, when funded, submitted through the session. Receipt and explorer URL are stored without fabrication.
10. Mission Control shows session scope/state, allocation/outcome, Proof Stream, pending reconciliation, and immediate revoke. A confirmed revoke disables action and is explorer-verifiable.
11. Keyboard/mobile/error/loading/stale paths are exercised in Playwright.
12. `pnpm format:check`, `lint`, `typecheck`, `test`, `test:e2e`, and `build` pass; traceability/evidence are updated.

Planned slices:

| Slice                        | Status                          | Output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace and CI foundation  | DONE                            | Exact-pinned pnpm workspace, Next app, strict TS, Vitest, isolated Playwright, security-safe env policy, plus SHA-pinned root/PostgreSQL/four-agent/fixed-asset/E2E CI jobs; a hosted green run remains evidence to collect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Evidence/domain model        | DONE                            | Four-category schema, provenance, Proof Score 1.1-draft and hardened policy are tested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Live identity ingress        | DONE                            | Live 8004scan list/detail paths, explicit outage/empty/not-found states, and identity Passport work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Evidence-first LP UX         | ACTIVE                          | Intent, streamed marketplace, Passport, 2–4 comparison, configuration, strict permission renderer and honest Mission Control empty state pass; live registry latency no longer blocks the intent/analyzer shell, while the connected activation route remains                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Altana state machine         | ACTIVE / EXECUTE FAILED         | Public-descriptor/authority, exact-SDK grant, canonical same-pool PostgreSQL grant-claim, and execute/revoke lifecycle tests pass; both ledgers are host-local deployed and schema/app-verified. A 25-call read-only capture at finalized block `125493138` proves the pinned SDK 0.7.0 chain-97 surface and registration fee across two RPCs. The final-origin operator has a concrete wallet-bound DPAPI worker signer, exact PTA amount-0/value-0 grant UI, public-state API, dual-RPC authority gate, create-only execution claim and calls-ID/receipt reconciliation. The first live grant finalized successfully, but execute calls ID `0x0ea636cf51453205913e4b941cd4c01972754e2f0ffef4ef3ff88c6110331975` reached terminal relay failure status `300` without a receipt. The claim was not retried; the session expired and active authority is absent. No complete lifecycle or application effect exists. This bounded proof path does not replace the production LP bootstrap/ledger/KMS path |
| Pancake read/execute adapter | ACTIVE / RECOVERY GATED         | Atomic reads, source/selector/calldata validation, release pinning and QuickEdit-off bootstrap pass. A create-only mainnet public-position capture now retains exact RPC+A2A evidence of one-tick boundary-risk detection while denying ownership/performance/execution claims. Recovery generation 5 binds the exact generation-4 `failed_before_worker` terminal, requires a fresh distinct envelope, TTY v6 policy admission, and separate owner-v8 confirmation. Policy admission and owner confirmation remain distinct runtime gates and cannot be inferred from this plan                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Fixed test-asset fallback    | DONE / DEPLOYED ON CHAIN 97     | Chain-97-only fixed-supply PTA plus deterministic PTA/WBNB review-call preparation pass the isolated contract gates. Exact nonce-`0` deployment transaction `0x0852f32bf54aeac58815d93a64a5d38cda2f8615f2a997b4a601a06b380168c7` is finalized at `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc`; two official RPCs agree on its 1,826-byte runtime, single mint and 1,000,000-PTA state. Exact offline source/compiler/artifact reproduction now binds the conditional fee-500 CREATE2 address for the retained construction path. No pool, price, liquidity, position or activation receipt exists                                                                                                                                                                                                                                                                                                                                                                                                        |
| Testnet deployer custody     | DONE / ONE-SHOT DEPLOYMENT USED | Dedicated address `0x997cD959798F7c925076eaeFF5855C5C2c1e5A49`; Web3 v3 keystore plus DPAPI-wrapped random password remain outside the repo. A durable one-shot journal, isolated signer and exact transaction recovery produced only the reviewed nonce-`0` deployment. Windows journal setup now verifies that each existing path is already owned by the current SID, then replaces only the protected DACL; it neither requests `WRITE_OWNER` nor changes ownership. The deployer is now nonce `1`; repository evidence contains no secret/password/raw signed transaction and grants no further signing authority                                                                                                                                                                                                                                                                                                                                                                                   |
| Explainable recommendation   | DONE                            | Versioned same-category mandate matcher rejects partial assets, risk/capital/protocol/chain/horizon mismatch, duplicates and insufficient evidence without using returns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Runtime release signals      | ACTIVE                          | Liveness is separate from readiness; canonical PostgreSQL is CI-proven, while activation remains unavailable until its deployed instance, eligible write target, signer handoff, authority and passkey ceremony all probe ready                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Real testnet proof           | PTA DONE / ALTANA FUNDING GATED | PTA deployment is reconciled; the pool is not. The bounded Altana lifecycle worker and final-origin controls are ready but the configured passkey wallet has zero tBNB, no onchain admin/session key and no lifecycle receipt. Historical pool-initializer generations remain separately recovery-gated; the Altana PTA zero-approval is not a Pancake pool, liquidity, position, performance or economic-effect claim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Primary risks and mitigations:

- Sparse trustworthy agent metrics: publish unknowns and low confidence; create a reference agent with reproducible evidence.
- Runtime-code hashes do not establish source or proxy safety: M1 stays non-executable until every write target is independently reviewed as non-proxy, or its implementation and admin state are pinned at the same canonical block and exposed to the user.
- Passkey RP-ID drift: use environment-configured stable RP ID and collect final receipts only on the judging hostname.
- Relay/registry outages: explicit stale/unavailable UI, bounded cache, no mock substitution.
- Session custody/handoff: the passkey admin never leaves the browser; the final-origin onboarding control retains only its public descriptor on that device. The bounded proof signer is now DPAPI CurrentUser-protected outside the repository and its worker exposes no listener or secret-bearing state. It executes only after two-RPC KeyStore/account agreement and a create-only claim; the production autonomous signer still belongs in an authenticated encrypted worker/KMS behind the canonical PostgreSQL claim/handoff. Browser local storage is not that durable ledger. SDK 0.7.0 can discard a grant `callsId` on pending/failed waits, so an uncertain grant becomes `outcome_unknown` and cannot be retried until authority resolves it. Never persist either private key in the marketplace database/general web runtime.
- Durable reservation: the handoff can return ready only after the nominal server-only PostgreSQL `consumeOrRead` capability yields the identical immutable receipt for the exact context/quote/user/policy/write-target/window binding. Policy and attestation also join on the exact block timestamp; final monotonic validation rechecks receipt expiry and target freshness and cannot leak a nested ready bootstrap after a veto. The versioned PostgreSQL 17 schema, canonical catalog/ACL verifier, nominal verification capability, least-privilege runtime pool and 10-case real-17.9 suite pass. The host-local staging instance also passes catalog and direct-login binding, but no worker consumes it, so activation readiness remains unavailable.
- Testnet pool eligibility: a bounded exact-lineage review rejected all 14 reviewed WBNB pools. The exact CAKE pair and configured mocks have unsafe mint/burn surfaces; recent counterparties lack source/control proof and have one-observation pools. Blocks `28,488,223–124,399,999` remain an explicitly uncovered archive interval, so the result is not a factory-lifetime inventory. Canonical WBNB has exact source/creation/runtime/control proof and PTA now has finalized exact-runtime/fixed-supply proof. At finalized block `124767685`, both official RPCs observed no PTA/WBNB pool at fee tiers `100`, `500`, `2500`, or `10000`; the bounded public-result transcript and offline replay are retained, but that historical absence must still be refreshed before any confirmation. Keep every candidate read-only and require a separately reviewed new PTA/WBNB pool, or another independently admissible pair, before enabling writes.
- Testnet fallback asset: PTA is a verified non-economic ERC-20 with no admin or later-mint surface, not a stablecoin or execution guard. Its exact chain-97 runtime and fixed supply are independently confirmed at `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc`. Exact offline solc/source-blob/compiler-input/artifact reproduction now binds the fee-500 CREATE2 address for the retained construction path; it remains conditional because no pool or current state follows from that reproduction. Its intended `1 PTA = 0.000001 WBNB` seed is an arbitrary test scenario, not a market/peg/oracle/valuation claim. The factory owner and unadmitted LM-deployer surface remain mutable-control risks. No pool, price, liquidity, oracle, position ownership or execution authority is established.
- Pool-initialization preflight, signing and submission: the authoritative entry is `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\Users\tangm\Documents\GitHub\proofera-bnb\scripts\run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1 --release-commit <AUDITED40> --release-tree <AUDITED40> --runtime-manifest-sha256 <AUDITED0x64>`, run with cwd exactly `C:\Users\tangm\Documents\GitHub\proofera-bnb`. Phase minus one hardcodes/requires that root, its own absolute path, and the absolute phase-zero path. Direct Node is unsupported: ordinary ambient invocation is exact-env rejected, but phase zero cannot prove parent provenance against malicious preload/same-user code; the configured `pnpm initialize:pta-wbnb:testnet` is a fail-only nonzero wrapper. Phase minus one clears Process environment and sets exactly 13 pinned non-secret values—11 real-host values plus two WebSocket native-addon disable guards—before Node. Phase zero requires that exact environment, validates the audit triplet, pinned Node/direct-Git executable files, clean `HEAD == origin/main`/tree, release-source blobs including phase minus one, pinned dependency trees, and ignored runtime topology before spawning the exact child. Phase zero is read-only, so recovery is phase one's first application-stateful/external action. The TCB includes both phase-minus-one bytes before their later manifest check and phase-zero bytes before/during self-check, PowerShell 5.1/.NET startup and ambient environment until scrub, OS/filesystem/process, pinned executables, and loaded runtime/DLL; those later checks are evidence, not a root of trust, and no active same-user/preload or comprehensive concurrent-tamper defense exists. Custody preactivation remains metadata-only until durable `worker_started`. Terminal confirmation still requires receipt-block post-state and the fixed receipt-plus-128 `F1 -> C1/ancestry -> C2 -> F2 -> EIP-1898(C)` provider-semantic sandwich, not cryptographic `C -> F`/Byzantine proof. Every release containing this path requires a committed and pushed identity, new exact audits/policy, and separate owner TTY confirmation; this plan itself supplies no signature, send, receipt, pool, or liquidity.
- Policy-TTY transport uses nonce-bound exact-order ASCII `BEGIN`/`CHUNK`/`END`; generation 5 uses challenge/frame v6. Limits remain line `4,096`, valid worst case `2,618`, total `102,400`, policy `1..65,536`, payload `2,304`, `N <= 38`, and one five-minute deadline. Retired v1-v5 domains, truncation, duplicate/missing/reordered/control/trailing/buffered input reject before policy, RPC, custody, or authority.
- Runtime timing caps are exactly `300/240/120/60/60/20/30` seconds for envelope, owner-entry cap, execution authority, minimum remaining at claim, maximum post-confirmation preclaim, post-recheck reserve, and freshness. The owner-entry deadline is further bounded by preserving the full 120-second authority reserve. Generation 5 binds the exact generation-4 terminal through owner-v8; only an exact match captures `confirmedAt`.
- Provenance boundary for that v2 exercise: it was a one-off local terminal observation. Its raw output and harness were not retained, so the policy/journal/RPC/challenge/error-code observations are not reproducible repository evidence or a gate. The negative custody/sign/send statements combine the observed fail-closed result with code ordering; they are not a retained artifact.
- QuickEdit post-claim incident: in a one-off local operational observation, audited release `336af2967286795dc7703fff85034c71b8e84b5c`, tree `86cc383388982dac1a2bea430f54d54e56bb6cf9`, and runtime manifest `0xa1cda6fcf00f8a7d2b9a679cfb9b3fc28aa60674dae89c7dbfc032bdbcff5bdd` admitted the `8,826`-byte canonical policy with digest `0x8ddae3b13ee64ff5f983ce30d06c84d671e0a0ca029f75b5482de6b34b18ba54` and raw-byte SHA-256 `0x87de481e35a0d8fe6c503f4a7c832d665699ac9f20aa79eb5c40471d79e71a45`. The exact owner-v4 response was accepted and only the `1,123`-byte legacy claim slot 1 was durably written. QuickEdit/selection froze the console while the post-claim RPC recheck was pending; releasing it after authority expiry produced the observed `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN` result with no transaction hash. Exact journal inspection and code ordering show no worker authorization/start, custody artifact, DPAPI/unlock, signature, send, receipt, pool, or liquidity, and submission state was exact-empty. The exact legacy raw SHA-256 is `0xf10e90eb836a94446ace100bbc9a6fc5de6cc35b1d82e4d10fb4736ef8559e32`. Raw console output and the operational harness were not retained, so the owner/terminal observation is not reproducible repository evidence or a gate. A later live dual-RPC no-effect observation was also not retained and is not reusable evidence.
- Incident-only recovery generation 5: phase minus one scrubs/pins Process environment and disables QuickEdit before Node. It directly binds the immutable generation-4 terminal and separately requires exact-empty submission-v3; there is no Invocation A, no no-effect fence, and no reusable predecessor snapshot. Exact two-slot local-journal ordering proves no generation-4 worker authorization/start/signature; separate exact-empty submission-v3 plus code ordering proves no submission/send. It rereads eight namespaces and requires a fresh distinct envelope after the terminal. Policy/runtime-instantiation is v5, TTY is v6, owner command/text/confirmation is v8, signing/intent/broadcast are v5, submission-v2/v3 are read-only, and active submission-v4 uses v6 records.
- Selector-path publication and technical review: four liquidity-path artifacts, the locally reviewed direct initializer path, and the denied-multicall boundary are deterministic and locally bound to the exact manager source/artifact/runtime scope. They are manual static analysis, not formal proof. The initializer's exact immutable review bytes are published at a revision-pinned, digest-named public Gist and the retained separate unauthenticated no-redirect retrieval matches the exact whole-file SHA-256. The old deterministic request is unsent, has null reviewer/Sigstore evidence, and covers only eight files at `00f21c4`. Its generator, test, and retained artifact pin the historical 45-second envelope cap and are not a producer or evidence source for the revised timing contract. The repository owner separately designated two distinct internal subagent reviews whose deterministic decision binds all 21 pool-prefixed files at nonexecuting commit `bc7000e`. This closes only that owner-designated internal technical gate and claims no external/Sigstore/third-party authentication. Any changed production release needs a new distinct-agent decision; exact owner authorization and fresh source/nonproxy/full-attestation evidence remain separate.
- Altana licensing: the published 0.7.0 artifact ships GPL-3.0-or-later while repository metadata has appeared Apache-2.0. Record an SBOM and resolve distribution/source obligations with Altana before public release; do not assume the root MIT declaration settles bundled client code.

## Milestone 2 — equal four-category marketplace (`ACTIVE`)

Acceptance criteria:

- Four reference/live agents exist with equal passport, discovery, comparison, configuration, activation-policy, Mission Control, and evidence depth.
- Category metrics match `docs/data-methodology.md`; cross-category comparison never presents unlike returns as equivalent.
- Reference agents are registered under ERC-8004 when feasible and clearly labeled BSC testnet/mainnet.
- Critical routes and state variants pass responsive/accessibility E2E checks.

Dependencies: milestone-1 primitives and testnet agent deployment path.

Current breadth evidence: deterministic, non-executing analyzers now exist for LP Range (17 tests), Grid Trading (24), Yield Optimisation (33), and Health-Factor Guardian (42). Each fails closed on missing/stale evidence and keeps unverified execution or realized outcomes unavailable. All four have exact-pinned hardened public A2A/MCP HTTP runtimes with honest authentication declarations, bounded unpredictable sessions, resource limits, full local verification/audit gates, and fail-independent CI matrix entries. Studio 0.0.5 accurately reports these TypeScript runtimes as non-Studio/deploy-ready; they are self-hosted rather than AgentCore deployments. A create-only two-provider collector now binds eight finalized BSC-testnet ERC-8004 receipts, exact prepared calldata, final URI, owner and Agent IDs `1825`–`1828` at block `125541239`. This proves testnet identity publication only: marketplace eligibility, hiring, activation, execution and performance remain false. Calculator coverage is metric-specific: LP `current_range_state`; Grid `configured_range`; Yield `net_apy` and `gas_impact`; and Health `current_health_factor`, `minimum_health_factor`, and `alert_latency` are implemented but not run, while all other dossier fields identify a documented definition with no calculator and a null methodology version. LP keeps its separate bounded configuration route; Grid, Yield, and Health have strict GET-only mandate routes that preserve exact raw values and explicit chain selection while all readiness and side-effect flags remain false. None of these routes selects an agent, previews permissions, connects a wallet, reads a source, creates authority, or activates anything.

## Milestone 3 — data and trust advantage (`PLANNED`)

Acceptance criteria:

- Fresh protocol/onchain ingestion covers executions, outcomes, costs, freshness, and failures.
- Proof Score v1 methodology, sample warnings, confidence bands, and deterministic fixtures are public and tested.
- Proof Stream links raw source/transaction evidence; provider outage and stale cache behavior is observable.
- Rate limiting, cache policy, retention, and optional PostgreSQL/indexer need are load-tested before infrastructure expansion.

## Milestone 4 — partner-track proof (`PLANNED`)

Acceptance criteria:

- Altana explorer contains real grant/session execute/revoke transactions; wallet addresses and links are captured.
- PancakeSwap LP benefit has a reproducible baseline/agent comparison net of known gas/slippage/fees.
- Three TermiX agent-vs-manual tasks have raw outputs, timers, costs, quality rubric, receipts, reproduction, and limitations; at least one is trading/security.
- ERC-8183 hiring and/or x402/B402 is added only if the core session journey is stable and the official SDK path remains current.

Current TermiX execution capability: the strict timed core plus fixed LP and
Venus agent/manual lanes and all four corresponding create-only CLIs are
implemented. Both agent CLIs accept no shell
command or secret, require a clean published commit plus byte-exact committed
canonical input, preserve raw API/A2A responses and cannot reach network access
without a registered ERC-8004 identity and independently verified hire
receipt. The matching manual CLIs consume bounded LF-only UTF-8 NDJSON, perform
no network or agent request themselves, timestamp positive operator work and
write only new immutable captures. LP v2 also separates its mainnet source-data chain from testnet
identity/hire receipts and preserves the never-run v1 definition. No final
invocation or paired run exists. Task 02 now has a strict deterministic,
read-only permission-audit engine that rejects unbound evidence, reports each
seeded authority defect independently, emits all three required enforcement
layers, requires distinct role-bound proposal/corpus/lifecycle/code/SDK and
database-deployment evidence, exact code-policy parity, ordered distinct
grant/revoke receipts, and explicitly records that it performed no execution.
A fixed read-only RPC plan additionally binds chain ID 97, both successful
lifecycle receipt joins, and every attested target's runtime bytes at the exact
block hash; it exposes no arbitrary RPC method. Its public agent/manual lanes
are now partially closed: the manual lane requires positive timed work, every
digest-bound artifact exactly once, the complete fixed RPC plan, the five
preregistered declaration input joins, no hire receipt and a canonical
`agentInvoked: false` output. The fixed agent lane is implemented and its
deterministic, non-executing A2A skill is live on the public LP endpoint:
registration
and verified hire are outer pre-network gates, the complete RPC plan runs before
the one fixed A2A skill, declaration endpoint/component/input drift fails
closed, and the response must bind the exact bundle with no execution. A valid
synthetic bundle produced matching canonical digests through the local and
public endpoint on 2026-08-17. This is an availability/parity smoke only, not a
TermiX invocation, registered identity, hire receipt, final-bundle audit or
performance result. Both create-only Task 02 CLIs are now implemented. The
agent entry rejects missing exact invocation before Git, network or output
access. The manual entry consumes bounded LF-only UTF-8 NDJSON so active work
is timestamped as the operator emits each artifact/RPC/output event; it has no
agent or network call. The final frozen bundle, real manual transcript, sourced
cost and second-review artifacts remain required.

The Windows-host owner can start `Start ProofEra Ceremony.cmd` once to open a
loopback-only guided worksheet. A root request on the loopback-only listener
bootstraps an HttpOnly, SameSite-strict local session, rejects non-loopback hosts and cross-origin or
missing-CSRF writes, and never exposes its write surface through the public
marketplace. It feeds the already frozen LP and Venus manual CLIs incrementally
so positive operator review time and exact read-only RPC exchanges remain in
their normal create-only captures. The LP worksheet opens automatically, derives
only the bounded conclusion supported by its displayed facts, and asks for one
owner acceptance; after the isolated capture is published, Venus opens
automatically and follows the same one-acceptance flow. No typing, terminal
command, decision selection or rationale composition is required. The captures
state that the owner accepted a prepared conclusion and do not claim independent
authorship or cryptographic operator identity. The launcher refuses unrelated
worktree changes and publishes only each capture before the next release-gated
lane starts. The wrapper is transport and worksheet presentation, not an agent,
passkey ceremony or authority receipt. Independent evidence review remains a
separate final-report gate.

The isolated `contracts/testnet-hire-receipt` package now supplies the missing
receipt mechanism without weakening the runner schema. Its chain-97-only,
no-admin contract resolves `ownerOf(agentId)` from the immutable ERC-8004
registry, atomically forwards a bounded tBNB payment, prevents engagement-ID
reuse and emits a task/expiry-bound receipt hash. Six Solidity tests and ten
preparation/execution-boundary tests pass, and CI defines the offline gate. This is
deployment preparation only: no contract or hire transaction exists, and a
successful future event would prove a paid testnet engagement—not task
completion, execution authority or agent performance.

The bounded operator runner is now implemented but remains non-invoked. Its
exact flag and approval ID gate precede preparation, Git, RPC and custody
access. It accepts only a digest-bound committed preparation, a clean published
HEAD and unchanged contract scope; regenerates the full manifest; compares two
fixed BSC-testnet RPCs; and rechecks nonce, balance and gas before every
signature. The short-lived worker decrypts only the pinned current-user DPAPI
keystore, journals public transaction fields before one-provider broadcast,
requires two-provider receipt agreement, checks exact deployed runtime bytes
and decodes every hire event. Unknown broadcast/receipt outcomes halt all later
transactions. These controls are execution capability, not authorization or
receipt evidence.

The exact V2 approval was exercised once on 2026-08-17. Its two-provider
preflight passed at nonce `5`, balance `87934297300000000 wei`, deployment gas
estimate `355696`, and empty predicted address, but custody loading failed
before any `signed` event or journal existed. The cause was a runner-only byte
boundary: a random 48-byte DPAPI password was converted through UTF-8 before
ethers decrypted the keystore. The independent live custody probe still passed
address, ACL, digest, DPAPI, MAC and unlock checks. Release `c80cae5` now passes
the exact bytes directly to ethers and adds a regression test. V2 is closed and
cannot authorize the changed runner. No signature, broadcast, nonce
consumption, deployment or hire receipt resulted from the V2 attempt.

The exact V3 approval was also exercised once on 2026-08-17, but its preparation
named a syntactically valid 40-hex source commit that did not exist. The runner
failed at its source-ancestry boundary before RPC, custody, signing or broadcast.
Release `3b119f9d053054ac34b4b74e039c2c1bd4640437` now requires `git cat-file`
commit existence during preparation and adds a regression test. V3 is closed;
its approval cannot authorize V4. The V4 preparation/proposal is new and
unapproved. No transaction resulted from the V3 attempt.

The exact V4 approval reached broadcast on 2026-08-17. Deployment transaction
`0x7fa5ad3e7b33dfb6dfccdfd06c6e54cc2d833d5aa005ec3f01c98cf72be3ddcf`
confirmed successfully at block `125583149` and created
`0x052fd2940Aa46F0Ae6660e0bf9eBDEdb6F610b1A`; both fixed providers agree on
the receipt and 1,355-byte runtime. The runner then stopped before any hire
signature because it compared the deployed runtime against artifact bytecode
whose two identity-registry immutable slots were still zero placeholders. V4
is closed after exactly one transaction. The V5 recovery runner materializes
the reviewed immutable layout, requires the exact finalized V4 deployment and
three unused engagement IDs, starts at nonce `6`, and can send only the three
bounded hires after separate approval.

The exact V5 approval confirmed the LP hire at block `125587411` and the
permission-audit hire at block `125587418`. Immediately afterward, one provider
lagged the new nonce, so the per-transaction two-provider nonce gate stopped
before signing the Venus hire. Both providers subsequently agree on nonce `8`,
both successful receipts and their stored engagement receipt hashes; the Venus
engagement remains unused. V5 is closed after exactly two transactions. V6 is a
separately approved final-recovery boundary with no deploy path, two immutable
completed-hire prerequisites, only the Venus hire at nonce `8`, and a maximum
total spend of `50000000000000 wei`.

The create-only `capture:termix:hires` collector is also implemented and still
non-invoked. Given the exact deployment and three hire hashes, it requires a
clean published release, then joins normalized transactions, receipts and
canonical blocks across the same two RPCs. At one common block at least 12 deep
it verifies exact runtime bytes, ERC-8004 owners, decoded event fields, the
contract's receipt-hash formula and each stored engagement receipt. Its output
contains three byte-hashed `verifiedHireReceipt` objects accepted by the timed
runner while keeping task completion, performance, execution authority and
TermiX completion false. Four deterministic collector/validator tests pass;
no receipt output exists before the approved transactions finalize.

The Venus lane now has a real frozen public-replay input and fair order rather
than placeholders. Source release `3ba85859ced39b457da819d27637d3fc02101c5d`
binds the retained two-provider window, non-authority account selection,
read-only guardian policy, agent `1828`, endpoint/configuration and manual
procedure. Declaration commit `e5c48b9` predates committed randomness block
`125568071`; both RPCs agreed on the finalized block hash and LSB `0`, forcing
agent-first. The retained declaration/order verifier passes. This closes only
input and order preparation: hire, agent run, manual run, scoring, intervention
and result claims remain false, and the forced manual run cannot legally start
before the agent hire gate closes.

## Milestone 5 — submission-grade product (`PLANNED`)

Acceptance criteria:

- Public judging URL, uptime/error telemetry, deployment/rollback runbook, and evidence URLs are verified.
- Security threat model, focused adversarial tests, dependency/secret scans, accessibility, performance, and all CI gates pass.
- README, architecture, methodology, security, deployment, demo, submission copy, and evidence package are complete.
- No judged route has dead controls, hidden mocks, fake receipts, placeholder copy, or unlabeled simulation.

## User-only blockers

The first bounded Altana attempt obtained faucet tBNB and completed its passkey grant. Two RPCs now agree that grant transaction `0xcdd3f4b4da56af34ca636e067fb0e26aae8bf6ce209b0691dde8d5e7b331071e` succeeded and is finalized. The worker created one durable zero-action execute claim and retained calls ID `0x0ea636cf51453205913e4b941cd4c01972754e2f0ffef4ef3ff88c6110331975`; the relay returned terminal failure status `300` without a transaction hash or receipt. The worker did not retry, and the one-hour session expired with no active authority. A fresh attempt requires a new versioned session signer, a resolved relay failure cause and a separately reviewed grant; the consumed claim and calls ID must remain immutable. Missing execute/revoke receipts remain missing. Pancake pool initialization/LP mint are separate user-authorized transactions and are not implied by this ceremony.

## Decision log

| Date       | Decision                                                                              | Rationale                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-11 | First slice is PancakeSwap LP range control through an Altana BSC-testnet session     | One flow produces judge-visible main-track, PancakeSwap, and Altana evidence while establishing reusable controls                                                                                                                                       |
| 2026-08-11 | Direct V3 calls and narrowed enforcement claims before a custom guard                 | Altana enforces target/selector, spend and expiry, but not calldata semantics; runtime validates recipient/token ID/ticks/slippage. Add a small audited guard if those guarantees must survive worker compromise                                        |
| 2026-08-21 | Use a non-economic PTA zero approval for the first bounded Altana lifecycle receipt   | It exercises a real stateful session call without token value or a false Pancake/LP claim. The UI discloses that selector scope does not constrain arguments; a one-hour session and immediate revoke limit the test-only exposure                      |
| 2026-08-11 | No silent live-to-fixture fallback                                                    | The product thesis and data-quality rubric require outages and missing data to reduce confidence visibly                                                                                                                                                |
| 2026-08-11 | Registry identity is not capability verification                                      | ERC-8004 itself warns metadata cannot prove advertised behavior; activation needs independent evidence                                                                                                                                                  |
| 2026-08-17 | Use Python Studio 0.0.5 and separate hosting provenance from ERC-8004 identity        | Official `bag 0.0.5` is now the current single-agent toolchain; self-hosted TypeScript analyzers are not claimed as AgentCore deployments, while registration metadata and wallets remain separately auditable                                          |
| 2026-08-11 | Treat main-track testnet eligibility as unresolved                                    | Only Altana explicitly says testnet qualifies; prepare but do not execute a minimal-value mainnet path without approval                                                                                                                                 |
| 2026-08-11 | Keep Studio Altana 0.5.1 and marketplace Altana 0.7.0 behind an explicit handoff seam | The generated Studio runtime and current marketplace SDK resolve different minor versions; authority must be verified onchain rather than inferred from SDK object compatibility                                                                        |
| 2026-08-13 | Keep PTA/WBNB initialization and LP mint as separately approved BSC-testnet writes    | A historical empty-pool snapshot and conditional CREATE2 candidate are preparation evidence only; initialization fixes arbitrary state but adds no liquidity, while minting introduces separate funding, approval, ownership, slippage and oracle risks |
| 2026-08-14 | Historical generation-2 recovery exercise                                             | It fenced generation 1, then later stopped at exact generation-2 claim-only state; neither historical owner confirmation authorizes generation 3                                                                                                        |
