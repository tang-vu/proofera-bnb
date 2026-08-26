# ProofEra

**Hire agents by proof, not promises.**

**Target product:** ProofEra is the risk-aware marketplace where users discover, verify, compare, hire, control, and revoke autonomous DeFi agents on BNB Smart Chain.

This repository is under active development for BNB Chain's “The Smart Money Era: Build the Era” hackathon. A feature is labeled live only after its endpoint and onchain receipts are independently verifiable. Unknown evidence stays unknown.

## What ProofEra is building

- Goal-first discovery across LP rebalancing, grid trading, yield optimisation, and health-factor monitoring.
- Comparable Agent Passports with source-linked metrics, freshness, methodology, and explicit missing-data states.
- A transparent, versioned Proof Score that penalizes stale or incomplete evidence.
- Target activation model: scoped Altana sessions with contract/function allowlists, spend caps, expiry, and verified revoke. The bounded chain-97 PTA zero-action worker completed one retained v2 grant/execute/revoke lifecycle; the general LP activation ledgers remain host-local, disconnected from a production worker, and not represented as production-ready authority.
- Target Mission Control and Proof Stream for source-linked actions, outcomes, permissions, and receipts. The current route is an intentionally empty verified-state surface until real authority exists.
- Reference BNB Agent Studio agents so the critical journey does not depend on unknown third-party supply.

The first vertical slice targets a bounded PancakeSwap LP range agent on BSC testnet. It is not yet an activated agent: local work currently covers strict intent, block-pinned read and authority primitives, exact quote math, policy/session lifecycle boundaries, and configuration/error UX. See the [execution plan](./docs/EXECUTION_PLAN.md) and [research record](./docs/research.md).

Current verified local slices include server-side 8004scan live-source identity discovery/detail, Passport comparison, judge-visible read-only Pancake, Venus, and Lista evidence routes, a configuration-only LP boundary, separate configuration-only Grid/Yield/Health mandate routes, strict four-category evidence and publication schemas, Proof Score 1.1 draft, a no-return-ranking intent matcher, and pure Altana policy/bootstrap/grant/execute/revoke lifecycle boundaries. The final-origin operator page can now create or recover an SDK 0.7.0 WebAuthn passkey wallet and retains only its public credential metadata on that device; this is onboarding, not a grant. The exact-0.7.0 grant adapter separately requires an explicit matching RP ID, a production WebAuthn P-256 signer shape, and an atomic one-shot claim before it invokes the SDK. The claim ledger now has a canonical PostgreSQL 17 migration, independent catalog/ACL/namespace/role-setting verifier, same-pool module-owned transaction gateway, 68 focused tests, and 18 real PostgreSQL cases. Its only package export is server-only, and its readiness still reports `deploymentConfigured: false` and `releaseReady: false`. Every grant outcome remains non-executable until authority is independently observed. Direct Pancake calldata is decoded canonically and checked against a separately injected server plan before it can be considered ready. Separate EIP-1898 readers validate runtime-code hashes and the intended controller's ERC-721 ownership/approval evidence at an already bound canonical block with no latest/block-number fallback; no ProofEra-controlled position or current authority is inferred.

LP activation context schema v3 binds the complete strict user intent and block-pinned quote payload into domain-separated context/quote IDs. Write-target attestation schema v2 separately models the Position Manager's four direct liquidity selectors and denies all three multicall dispatchers; the observed self-`DELEGATECALL` path is therefore disclosed instead of being hidden behind a whole-runtime safety claim. The exact manager source rebuild and four deterministic local selector-path artifacts now bind the same canonical lowercase-manager write scope as the production composition seam. A server-only intake accepts only corresponding canonical bytes at digest-named public HTTPS URLs after a fresh, independent no-redirect retrieval record and an out-of-band allowlisted review ID; it explicitly rejects the local package. Activation remains blocked until those artifacts are actually published/re-fetched and an economically eligible pool/token pair exists.

An isolated fallback token exists at `contracts/testnet-fixed-asset`: ProofEra Test Asset (`PTA`) is a chain-97-only, fixed-supply, non-economic ERC-20 with no admin or later-mint surface. Its compiler/build/ABI/bytecode preparation is reproducibly tested, and the exact artifact is now deployed on BSC Testnet with a finalized two-provider receipt. A later two-provider, exact-finalized-block readiness snapshot found no PTA/WBNB V3 pool at fee tiers `100`, `500`, `2500`, or `10000`. At capture time it recorded the fee-`500` CREATE2 candidate `0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE` only as a deterministic conditional result without an independently bound compiler/artifact proof. A subsequent offline provenance review closed that exact derivation blocker for the retained source/compiler/deployer path; it does not make the historical candidate a current observation, reservation, or pool. The offline initializer scenario now uses the arbitrary test ratio `1 PTA = 0.000001 WBNB` (`sqrtPriceX96 = 79228162514264337593543950`, expected tick `-138163`), not the old raw-unit `1:1` placeholder. It remains a zero-value review tuple, not a quote, pool, transaction, price, oracle, or approval. See the [PTA/WBNB preparation record](./docs/pancake-v3-testnet-pta-wbnb-preparation.md).

PTA remains unpriced and illiquid; deployment and read-only readiness alone make no pool or activation path eligible. Pool initialization and a later LP mint require separate explicit approvals. The provisional LP envelope of at most `1,000 PTA` plus `0.001 WBNB` is not approved and has no funding, wrapping, allowance, calldata, or receipt behind it. Creating or funding a pool, protocol execution, or paid explorer verification remains separately gated.

The dedicated PTA deployer uses a reviewed external Web3-v3/DPAPI custody boundary and a durable one-shot journal. The exact nonce-`0`, zero-value chain-`97` deployment landed at `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc` in finalized transaction `0x0852f32bf54aeac58815d93a64a5d38cda2f8615f2a997b4a601a06b380168c7`. Two official BNB testnet RPCs agree on the receipt, canonical block, 1,826-byte runtime, exact single mint, metadata, `1,000,000 PTA` supply and recipient balance. Public endpoints had pruned the deployment-block state trie, so code and token state are bound instead to an exact common finalized block through EIP-1898 `blockHash + requireCanonical`; this is recorded separately from the deployment block in the [public deployment record](./evidence/development/bsc-testnet-pta-deployment-2026-08-12.json). No secret, password or raw signed transaction is retained in repository evidence, and no mainnet action occurred.

A bounded exact-block search reviewed 14 factory-authenticated WBNB pools and admitted none. Configured counterparties had unrestricted mint/burn paths; recent tokens lacked source/control proof and their pools had one oracle observation; the retained CAKE pair remained unsafe. The search is not described as factory-lifetime complete: blocks `28,488,223–124,399,999` still require archive-complete WBNB-indexed event coverage. See the [candidate review](./docs/pancake-v3-testnet-pool-candidates.md).

The canonical testnet WBNB itself now passes strict token-component admission: one exact 1,793-byte source unit compiled with official solc `0.4.18+commit.9cf6e910` reproduces both the complete 3,504-byte creation transaction input and all 3,124 deployed runtime bytes. Together with the separately verified PTA deployment this closes both token-component identities for a prospective fixture; it still does not create or qualify a pool, establish price/liquidity/oracle quality, or authorize a write. See the [WBNB verification](./docs/pancake-v3-testnet-wbnb-source-verification.md).

The deterministic [external-review request bundle](./evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json) pins the direct-only initializer scope to source commit `00f21c405881a5dc320bddf3c757ba13599b1e71`, its exact eight-file implementation subject, and the revision-pinned, digest-named Gist. It has not been sent, identifies no recipient or reviewer, and contains no Sigstore authentication evidence. Its unkeyed hashes provide integrity only. Its generator, test, and retained artifact pin the historical 45-second envelope cap; they are not a producer or evidence source for the revised timing contract. The bundle predates and excludes the later post-claim and submission/reconciliation files and is not used to claim an external or authenticated third-party review.

For the exact nonexecuting one-shot chain-97 scaffold, the repository owner instead designated two distinct read-only subagent tasks as an internal technical-review lane. Its deterministic [decision](./evidence/development/pancake-v3-pta-wbnb-owner-designated-internal-review-2026-08-13.json) binds commit `bc7000eee4d9698e272cc9deb7dda5748b34318b`, its complete 21-file pool-init subject and fixed transaction tuple. This closes only the owner-designated internal technical-review gate for that exact subject. It is not external review, Sigstore evidence, authenticated third-party identity or organizational-independence proof, and it supplies no owner transaction authorization, production composition, custody, signing, broadcast, receipt, pool or liquidity. Any changed implementation or production release requires a new distinct-agent decision.

A local post-claim recheck core requires an already authenticated exact intent before it can compare the two fixed official RPCs, bind common-finalized EIP-1898 state, repeat nonce/pool/candidate/simulation/balance/gas checks, and issue a short-lived in-memory capability. The production path now includes a same-process two-phase native-TTY owner ceremony with a 32-byte OS-CSPRNG nonce and exact digest-bound confirmation, plus a closure-private native worker bridge whose execution capability can be reserved once and is consumed only after the signing journal durably starts the worker. Before that durable `worker_started` claim, the pool path checks only the fixed custody path, `lstat`/`realpath`, file kind, and current-user ACL; it does not open either custody artifact, invoke DPAPI, unlock the keystore, reconstruct a key, or claim that the ACL holder is the signer. The expected sender is verified only by the post-claim signed-transaction attestation.

The only supported production entry is the host/path-pinned Windows PowerShell 5.1 phase-minus-one command below, run with the working directory exactly `C:\Users\tangm\Documents\GitHub\proofera-bnb` and the exact triplet supplied by the completed release audit. The placeholders are deliberately not release values. Direct Node invocation is unsupported: an ordinary ambient invocation is rejected by the exact-environment check, but phase zero cannot prove parent provenance against malicious preload or same-user code that first installs the accepted environment. The configured `pnpm initialize:pta-wbnb:testnet` command is a fail-only wrapper that returns nonzero and points to this PowerShell entry.

```powershell
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\Users\tangm\Documents\GitHub\proofera-bnb\scripts\run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1 --release-commit <AUDITED40> --release-tree <AUDITED40> --runtime-manifest-sha256 <AUDITED0x64>
```

Phase minus one hardcodes and requires that exact repository root, its own exact absolute path, and the absolute phase-zero path. Before Node starts, it clears its Process environment and sets exactly 13 pinned, non-secret values—11 real-host values plus two WebSocket native-addon disable guards. It then uses the console methods already present in pinned .NET Framework to clear only `ENABLE_QUICK_EDIT_MODE`, set `ENABLE_EXTENDED_FLAGS`, and verify that every other input-mode bit is unchanged before starting the pinned Node executable. It never reads, flushes, synthesizes, or writes console input bytes; a missing/redirected/non-console input handle or any mode mismatch fails closed. Apart from those two console-mode bits and its own process environment, phase minus one performs no repository write, journal read, TTY ceremony, RPC call, custody-artifact access, signature, or send. Phase zero then requires that exact 13-name/value environment, verifies the audit triplet against the pinned Node executable and direct `D:\Git\mingw64\bin\git.exe`, exact clean `HEAD == origin/main`, requested tree, every release-source Git blob—including the phase-minus-one PowerShell file—pinned dependency trees and ignored runtime topology, and working directory before spawning phase one with the same minimal environment. Phase zero remains read-only; afterward, journal recovery is phase one's first application-stateful or external operational action, ahead of policy, TTY, RPC, custody-artifact access, signing, or send.

This is bootstrap hardening, not secure boot. The trusted computing base includes both the phase-minus-one bytes before their later manifest check and the phase-zero bytes that execute before and during their own checks, all Windows PowerShell 5.1/.NET startup behavior and ambient environment until the scrub completes, Windows and its filesystem/process semantics, the pinned Node/direct-Git executable files, and every OS/runtime/DLL component they load. The later self-check and Git-blob checks are evidence, not a root of trust, and the complete host installations are not hashed. These checks provide no active defense against malicious code running as the same user—including preload/parent-provenance substitution—or every concurrent-tamper race.

The first real policy-TTY exercise targeted audited release commit `1a89ddae5e1f575b39dda6134d3ccedaddda0adf`, tree `b28a12f78861183ece5ff1c3fce36c0abf094239`, and runtime-manifest SHA-256 `0xd5212c7563d5d3e3b10d461b5dedcc1552766262c1c87a7057b4dc2876ed0ce0`; its two exact-release audits returned `GO`. The canonical policy digest was `0x9357b560a91b1c41ef8ef84ea39001c206f50fc9839a55102f7916152160a189`. Its `8,670` policy bytes encoded to `11,560` unpadded-base64url characters, making the complete v1 single-line frame `11,713` characters. Windows Console truncated that line and admission failed closed. The policy was not admitted and owner confirmation was never reached. Beyond bootstrap, only read-only recovery/journal inspection may have occurred: this attempt made no fresh RPC call and did not access a custody artifact, invoke DPAPI, unlock custody, sign, derive a new transaction hash, send, receive a receipt, create a pool, or add liquidity. Once the TTY source changed to v2, that triplet and policy became historical evidence only and cannot authorize the changed source.

Current TTY policy admission uses v10 challenge/frame domains over the nonce-bound, bounded ASCII `BEGIN`/`CHUNK`/`END` state machine introduced in v2. Every line binds the challenge nonce, exact line index, chunk count, policy byte length, and lowercase raw policy-byte SHA-256; each `CHUNK` also binds its exact chunk index. Lines must arrive in exact order with no duplicate, gap, blank/control/trailing data, using only LF or CRLF. The reader retains a `4,096`-byte hard line cap, while valid worst-case construction has an exact `2,619`-byte maximum content line and a conservative tested bound of `2,700` bytes. The whole transport is at most `102,400` bytes and the policy is `1..65,536` bytes. Every non-final chunk carries exactly `2,304` base64url characters, `N` is derived from the canonical unpadded-base64url length, and `N` cannot exceed `38`. One absolute five-minute deadline covers the entire frame. The decoder reconstructs the bytes once, rechecks canonical base64url, declared length, and SHA-256, and rejects retired v1-v9 domains, truncation, reorder, missing/duplicate chunks, bad terminators, or buffered trailing input before policy admission, fresh RPC, custody access, or owner authority. These checks do not prove that the OS input queue had no earlier data and do not provide preload or malicious-same-user protection.

A later exact v2 exercise used release commit `36f6e5e7fa8b4b5ccf255a6210afa2d25c25afa5`, tree `54ed5c2a8f754e79080528a2ce25669a6532a66b`, runtime-manifest SHA-256 `0x25e5aedb6d73e6fff416803ce9d42737d9124e525e0b81bf906321f4d06258d4`, and canonical policy digest `0xd1a33479a607d744a51ff8d6d3df8772f41ec2f1363911d2655f926c754c3b38`. The strict TTY-v2 reader admitted that policy. Recovery probes found both signing and submission journals absent; a fresh read-only preflight against the two fixed official RPCs succeeded and the exact owner challenge was displayed. No exact owner confirmation was accepted. Subsequent attempts stopped fail-closed with `POLICY_FRAME_INVALID`, `CEREMONY_IO_FAILED`, and `OWNER_CONFIRMATION_INVALID`. Across those exercises there was no custody-artifact access, DPAPI operation, custody unlock, signature, new transaction hash, send or broadcast, receipt, pool, or liquidity. This is a one-off local terminal observation: its raw output and harness were not retained, so it is not reproducible repository evidence or a release gate. The negative custody/sign/send claims reflect the observed fail-closed result plus code ordering, not a retained artifact. The timing source then changed, so this exact release triplet and policy are historical and non-authorizing.

The generation-9 design separated a `300`-second coordinator envelope, at most `240` seconds for owner entry, an exact `120`-second execution-authority lifetime, and a `30`-second post-claim freshness limit. Before slot-1 claim it additionally required at least `60` seconds remaining and no more than `60` seconds since confirmation; a successful post-claim recheck had to leave `20` seconds for the remaining execution path. Generation 9 directly bound the exact generation-8 `GAS_POLICY_VIOLATION` terminal and attempt through owner-v12 domains, used policy TTY challenge/frame v10, and pinned the initializer transaction to sender nonce `9`. A fresh estimate had to be at most `5,500,000`; the signed gas limit was the fixed `6,600,000` cap. Only an exact owner-byte match permitted the internal clock to capture `confirmedAt`; persisted bytes, chat, clipboard content, predecessor records, and expired confirmations did not recreate authority.

The next one-off local operational exercise used audited release commit `336af2967286795dc7703fff85034c71b8e84b5c`, tree `86cc383388982dac1a2bea430f54d54e56bb6cf9`, runtime-manifest SHA-256 `0xa1cda6fcf00f8a7d2b9a679cfb9b3fc28aa60674dae89c7dbfc032bdbcff5bdd`, and canonical policy digest `0x8ddae3b13ee64ff5f983ce30d06c84d671e0a0ca029f75b5482de6b34b18ba54`. The `8,826` canonical policy bytes had raw SHA-256 `0x87de481e35a0d8fe6c503f4a7c832d665699ac9f20aa79eb5c40471d79e71a45`, encoded to `11,768` unpadded-base64url characters, and were admitted as six chunks. The owner entered the exact v4 confirmation; the legacy signing journal then durably wrote only slot 1. Windows QuickEdit/selection froze the console while the post-claim RPC recheck was pending. After selection was cancelled after the 45-second authority expired, the observed result was `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN` without a transaction hash. Exact journal inspection and code ordering show no `worker_authorized`, `worker_started`, signed, or terminal slot; the submission journal was exactly empty, and the operation did not open custody artifacts, invoke DPAPI, unlock custody, sign, send, receive a receipt, create the pool, or add liquidity. The raw console output and operational harness were not retained, so the owner/terminal observation is not reproducible repository evidence or a release gate. A later historical dual-RPC check observed nonce `1`, an absent factory pool, empty candidate code with nonce `0`, and the expected simulation result, but that check and its harness were not retained. On 2026-08-23 another non-retained dual-RPC observation found the same absent pool/candidate state and sender nonce `9`; it motivated the fail-closed generation-5 rebase but is neither reusable freshness evidence nor authority. The v4 confirmation and release policy are expired historical inputs and cannot authorize changed recovery code.

Recovery generation 2 successfully fenced the exact generation-1 incident and then became historical itself. A later one-off, non-retained exercise admitted release `655187f2b425c40839803950257e1d5a5c4f8d98`, accepted exact owner-v5 confirmation, and durably wrote only the `1,362`-byte generation-2 claim whose raw SHA-256 is `0x613df995936c3ccfff56e5da5588906f1bd28340ae8297eb08524274b9b8e1c3`. The post-claim dual-RPC step returned `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`; exact journal inspection and code ordering show no worker authorization/start, custody access, DPAPI, signature, submission, transaction hash, receipt, pool, or liquidity, and the submission directory remained empty. Raw console output and the harness were not retained, so this is not reproducible evidence or authority.

Generation 3 is now historical. In a one-off local operational run, owner-v6 confirmation produced only `%LOCALAPPDATA%\ProofEra\operations\bsc-testnet-pta-wbnb-pool-v3\01-claim.v3.json`: exactly `1,362` bytes with raw SHA-256 `0x7ff780a8f0ac1a1f8ff7bced5d858259f918cdb1891c684aa208b6bca31c9585`. No slot 2, worker authorization/start, custody access, signature, submission, transaction hash, receipt, pool, or liquidity exists. The exact proximate error was not durably retained, so this repository does not claim that expiry or any particular RPC failure was the cause.

Generation 4 is now historical. In a one-off local run whose raw console output and harness were not retained, owner-v7 confirmation was accepted and the journal durably recorded an exact `failed_before_worker` claim (`0xd5fc6da9f853c621f4f407c9d8a729f898c0297720bc50817e633fa538967f36`) plus terminal transition (`0x2e0570423b1217f1dab6fa8cdb91a0a75b2d78023bacc611a6c81017d0033bab`) with `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`. Exact two-slot local-journal ordering proves there was no worker authorization/start or signature. Separate exact-empty submission-v3 inspection plus code ordering proves there was no transaction submission/send; the same ordering supports no custody-secret access or DPAPI/unlock. No receipt, pool, or liquidity exists. This is an operational observation, not reproducible repository or chain evidence.

Generation 5 is now historical. A local-only exercise of audited release `e8f3f5b56a5a423094a77a679462f71baa7d6069` accepted owner-v8 confirmation and wrote exactly `01-claim.v5.json` (`1,364` bytes, raw SHA-256 `0x0d76c35b7d6cdec488b8b79dafcefacc597c79f057fe722a2202d284515017f1`) plus `02-transition.v5.json` (`1,383` bytes, raw SHA-256 `0x39a6295f3f816cb5bba6c8c3be11982bcafa45847608e1150de950738217c8c9`). The durable terminal is `failed_before_worker` with `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`. Neither record contains a serialized transaction or transaction hash; exact ordering and the absence of later signing/submission slots show no worker authorization/start, custody unlock, signature, or send. No receipt, pool, liquidity, or LP position was produced. These device-local records are retained operational history, not repository or explorer evidence and not authority for changed code.

Generation 6 is now historical. A local-only run of release `1655d39db63a636e7c66a007046c06eab65c55f1` accepted the exact owner-v9 confirmation and retained exactly `01-claim.v6.json` (`1,364` bytes, raw SHA-256 `0x2f7dffbe7fef710273206009a06c7e460fa9f289b2403d6760c805707467e2ed`) plus `02-transition.v6.json` (`1,383` bytes, raw SHA-256 `0x4a64cc2ef48529e271152004e31dfb7d35511d0a5691815838849c831638d6f7`). Its durable outcome is `failed_before_worker` / `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`. The records contain no serialized transaction or transaction hash; no worker authorization/start, custody unlock, signature, submission, receipt, pool, liquidity, or LP position was produced. These device-local records are operational history, not repository or explorer evidence and not authority for changed code.

Generation 7 is now historical. The owner entered exact owner-v10 bytes for release `dbd4950e62b469379dc9fc877668d247b38b6f93`. The local journal retained `01-claim.v7.json` (`1,364` bytes, raw SHA-256 `0xceec9b1e6de22bc8eb11c9f1bea3d6cec730e34e1ce8f306705fa4782c39c3bd`) and `02-transition.v7.json` (`1,383` bytes, raw SHA-256 `0x97bb22de4f86b517af0b517f6765d77896da7881708da6589d17703790abc3dc`). Its terminal is `failed_before_worker` / `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`, with no worker authorization/start, custody unlock, signature, submission, transaction hash, receipt, pool, liquidity, or LP position. These device-local records are operational history, not repository or explorer evidence and not authority for changed code.

Generation 8 is now historical. The owner entered exact owner-v11 bytes for release `08f0357f1281c2289a1a0db9637e8fb082cb6900`. The local journal retained `01-claim.v8.json` (`1,364` bytes, raw SHA-256 `0x5a85737428a4bbd06459ceab52d6096fba74aa1c002de31a24c942ff9f3954f6`) and `02-transition.v8.json` (`1,369` bytes, raw SHA-256 `0x3210fd8ab08c2282a5da1aeb426984592fed9a5b3a6832ac7d60991baaf4fc6d`). Its terminal is `failed_before_worker` / `GAS_POLICY_VIOLATION`, with outcome digest `0x15b8bd2046fdac833c932d21deea39e7901bb97398622ad03e7625167e19d469`. The retained terminal does not identify which exact fresh gas input drifted or retain its numeric value. No worker authorization/start, custody unlock, signature, submission, transaction hash, receipt, pool, liquidity, or LP position exists.

Generation 9 is now an immutable incident predecessor. Exact owner-v12 bytes were accepted for release `d8f406eb5031502dab55d183c4702a5f9f52d318`, and the host-local append-only journals contain one exact signed nonce-`9` transaction with hash `0xa24d1dfa3440de3fcb644d9b52847bcc8d54f43a2e29b425f50bbce4bd684022`. The run then failed closed with `CONFIGURATION_INVALID` because the richer five-method durable journal crossed a core boundary that accepts exactly three plain-data methods. This occurred before a durable `submission_started` record and before any RPC send; the returned `transactionHash` was null. No receipt, pool, liquidity, or LP position is claimed, and the raw signed bytes remain outside the repository.

Recovery generation 10 is the current append-only path. It independently validates and recovers only that exact existing generation-9 signature and requires zero additional signatures. The applicable entrypoint does not load the production signing worker or call custody unlock/signing; predecessor journal readers still reuse the reviewed Windows process/ACL helper. A newly committed/pushed generation-10 release, two new exact owner-designated internal reviews, policy/runtime-instantiation v10 through TTY challenge/frame v11, and separate owner-v13 confirmation are required. Before a single fixed-primary send, fresh dual-RPC state is checked, a new `bsc-testnet-pta-wbnb-pool-submission-v9` v11 `submission_started` record is created with exclusive-create semantics, and dual-RPC state is checked again. Only the process that created that record receives the one-use send token; after the record exists, every restart is reconciliation-only with no resend or replacement. Terminal confirmation still requires the provider-attested receipt-plus-128 sandwich and receipt-block EIP-1898 post-state/logs. This is bounded dual-provider RPC consistency, not cryptographic or Byzantine-independence proof. This document supplies no generation-10 release policy or owner authority and records no send, receipt, pool, liquidity, or LP position.

The production Altana handoff rebuilds from recursively snapshotted raw intent/server evidence and accepts only a nominal PostgreSQL `consumeOrRead` capability produced after exact schema and application-access verification. Its atomic receipt binds context, quote, user, policy, write-target attestation, and expiry. Policy and attestation must agree on the exact block number, hash, and timestamp; a final monotonic sample rechecks both reservation expiry and target freshness, and a failed final check cannot retain a nested ready bootstrap. The concrete server-only PostgreSQL implementation has a versioned append-only schema, an externally pinned PostgreSQL 17 catalog digest, a nominal administrator-verification capability, a least-privilege application pool, bounded transaction outcomes, and 10 passing real-PostgreSQL 17.9 cases. That production path remains disconnected from a worker. Separately, the deliberately narrower v2 proof worker completed a PTA amount-0 grant/execute/revoke lifecycle and now has no active authority; it does not activate the LP handoff.

All four reference analyzers have exact-pinned, hardened, non-executing local A2A/MCP runtimes with realized performance withheld, bounded unpredictable sessions, honest unauthenticated cards, and independent CI matrix entries:

| Reference analyzer     | Local tests | Evidence boundary                                                        |
| ---------------------- | ----------: | ------------------------------------------------------------------------ |
| LP Range               |          17 | caller-supplied analysis; no wallet, public endpoint, registration/write |
| Grid Trading           |          24 | caller-supplied analysis; no wallet, market fetch, registration/write    |
| Yield Optimisation     |          33 | caller-supplied analysis; no source attestation, registration/write      |
| Health-Factor Guardian |          37 | caller-supplied analysis; publication/activation flags remain false      |

The development dossiers report calculator coverage per metric, not per agent. Only `current_range_state` (LP), `configured_range` (Grid), `net_apy` and `gas_impact` (Yield), and `current_health_factor`, `minimum_health_factor`, and `alert_latency` (Health) are marked `implemented_not_run` with their exact analyzer version. Every other dossier metric is `definition_documented_calculator_absent` with `methodologyVersion: null`. These are implementation statements, not measurements or performance claims.

The SHA-pinned CI workflow has root verification, a digest-pinned PostgreSQL 17.9 job for both activation ledgers, four fail-independent reference-agent matrix jobs, an isolated fixed-asset contract job, and an isolated Playwright job. A workflow definition and local passing gates are not a hosted green run. The marketplace and four read-only analyzer endpoints are public and exact-build monitored. Retained ProofEra testnet writes now include PTA deployment, four chain-97 ERC-8004 registrations, and the bounded Altana v2 grant/execute/revoke receipts. The Altana execute action is only PTA `approve(session, 0)` and proves no Pancake operation or performance. The permission-preview model/renderer is not wired into `/lp-activate`; Mission Control remains an honest no-current-authority surface. `/api/health` is liveness only, while `/api/readiness` intentionally remains `503 not_ready` until the production LP write target, eligible pool, deployed database, authenticated signer handoff and exact production authority probe are configured.

Useful local routes:

- `/marketplace` — immediate intent and four clearly non-live first-party analyzer records, with live ERC-8004 identity ingress streamed independently into explicit pending/empty/unavailable/available states;
- `/pancake-position` — user-supplied Pancake V3 position, pool, and atomic one-block evidence boundary;
- `/lp-activate` — testnet-only user configuration with every trusted activation artifact explicitly absent;
- `/configure/grid-trading`, `/configure/yield-optimisation`, and `/configure/health-factor-monitoring` — category-specific, GET-only mandate capture with explicit BSC network and exact financial strings; all nine readiness flags remain false and the configuration handler performs no RPC read, HTTP fetch, wallet access, application-environment lookup, or write;
- `/mission-control` — verified-state-first empty control surface; it exposes no action or revoke control before authority exists;
- `/venus-health` — raw Core Pool account liquidity with health factor held `UNKNOWN`;
- `/yield-sources` — bounded Lista vault-list fields with APY scale and net APY held `UNKNOWN`.

## Repository map

| Path                             | Purpose                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/web`                       | Marketplace UI and server routes                                                                                   |
| `packages/domain`                | Evidence schemas, Proof Score, intent matching, publication and activation policy                                  |
| `packages/integrations`          | Runtime-validated protocol and registry adapters                                                                   |
| `packages/benchmarks`            | Paired TermiX experiment validation, hashes, costs, rubrics, and receipt joins                                     |
| `agents`                         | Isolated reference-agent workspaces; pinning and Studio packaging are verified per agent                           |
| `contracts/testnet-fixed-asset`  | Isolated fixed-supply BSC-testnet artifact/source package plus offline deployment and pool-initializer preparation |
| `contracts/testnet-hire-receipt` | Isolated chain-97 paid-hire receipt contract and unsigned deployment/calldata preparation                          |
| `docs`                           | Research, architecture, security, methodology, deployment, and submission records                                  |
| `evidence`                       | Reproducible non-secret raw outputs and receipt manifests                                                          |

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

The isolated paid-hire receipt gate is also offline and separate:

```bash
cd contracts/testnet-hire-receipt
pnpm install --frozen-lockfile
pnpm verify:offline
```

It verifies a no-admin, no-custody chain-97 contract that pays the current ERC-8004 owner atomically and records one immutable task-bound event per engagement. The preparation command emits unsigned bytes only. No contract is deployed and no hire exists until a separately approved transaction package is broadcast and independently re-observed.

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
- [Demo script](./docs/demo-script.md), [judge scorecard](./docs/judge-scorecard.md), [pitch deck draft](./docs/pitch-deck.md), and [submission record](./docs/submission.md)

The generated LP reference workspace is under `agents/lpRangeAgent`. Its current local doctor record proves toolchain readiness only; no wallet, live endpoint, ERC-8004 registration or transaction exists yet.
