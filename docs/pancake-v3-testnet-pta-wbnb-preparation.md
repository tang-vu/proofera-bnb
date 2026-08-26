# PancakeSwap V3 BSC testnet PTA/WBNB pool readiness

Updated: 2026-08-26. Decision: **exact offline provenance, a non-authorizing read-only
preflight, an old-scope unsent request, an owner-designated internal multi-agent technical decision
for `bc7000e`, and the historical generation-4 through generation-8 operational outcomes are recorded.
Generation 8 accepted owner-v11 confirmation and durably ended `failed_before_worker` / `GAS_POLICY_VIOLATION`
with only an exact claim/terminal pair. It created no worker start, custody-secret access, signature,
send, receipt, pool, or liquidity and cannot authorize changed code. Current generation 9 requires a
new release policy, fresh envelope, and owner-v12 approval. This record supplies none and records no pool or
Pancake write**.

Machine record:
[`evidence/development/bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json`](../evidence/development/bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json)

Non-authorizing external-review request:
[`evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json`](../evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json)

Owner-designated internal technical-review decision:
[`evidence/development/pancake-v3-pta-wbnb-owner-designated-internal-review-2026-08-13.json`](../evidence/development/pancake-v3-pta-wbnb-owner-designated-internal-review-2026-08-13.json)

## Scope

This is a BNB Smart Chain testnet and PancakeSwap V3 preparation milestone. The historical observation
used local ProofEra tooling and two official credential-free BNB Chain RPC endpoints. Capture created
only fixed public evidence files. The later compiler and selector reviews and external-review-request
generator ran offline. The production path now begins with an absolute Windows PowerShell 5.1
phase-minus-one environment scrub, followed by read-only phase zero and recovery-first phase one,
exact-release policy admission, the native-TTY owner ceremony, a private one-consume authority/worker/
broadcaster bridge, fixed-RPC rechecks, durable restart recovery, and terminal reconciliation. Direct
Node, the pnpm initializer, and the public worker/generic raw sender remain hard-blocked. This update
made no onchain RPC write, owner approval, signature, broadcast, pool creation, token wrapping,
liquidity mint, swap, or mainnet action.

The evidence answers a narrow question: what exact chain-97 state and review inputs would a future
PTA/WBNB pool initializer have to bind? It does not answer whether the pair has a market price, is
economically useful, has safe oracle history, or is ready for an autonomous agent.

## Finalized checkpoint

The retained observation binds all reads to this exact finalized checkpoint:

| Field                 | Value                                                                |
| --------------------- | -------------------------------------------------------------------- |
| Chain                 | BNB Smart Chain Testnet (`97`)                                       |
| Block                 | `124767685`                                                          |
| Block hash            | `0x1657811b903d77aa58f2a6a78a9536a71e98e36d60c13a6098b75f8962e1fc7c` |
| Block timestamp       | `2026-08-13T03:30:31.000Z`                                           |
| Observation time      | `2026-08-13T03:30:36.176Z`                                           |
| PTA                   | `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc`                         |
| WBNB                  | `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd`                         |
| Canonical token order | PTA `token0`; WBNB `token1`                                          |
| Intended fee tier     | `500` (0.05%, tick spacing `10`)                                     |

At that checkpoint, the factory returned the zero address for this ordered pair at all four retained
standard fee tiers: `100`, `500`, `2500`, and `10000`. Therefore no PTA/WBNB PancakeSwap V3 pool was
observed at that block. This is a time-bounded exact-block statement, not a promise about later chain
state and not factory-lifetime history coverage.

## Runtime identities observed at the same block

| Component        | Address                                      | Runtime bytes | Keccak-256                                                           |
| ---------------- | -------------------------------------------- | ------------: | -------------------------------------------------------------------- |
| PTA              | `0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc` |         1,826 | `0x2f8caecd2e51f085ab11a67e5b8a89eeab7b667bd89ec708a481b66ed756e006` |
| WBNB             | `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd` |         3,124 | `0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6` |
| V3 factory       | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` |         5,151 | `0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c` |
| V3 pool deployer | `0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9` |        24,556 | `0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b` |
| Position Manager | `0x427bF5b37357632377eCbEC9de3626C71A5396c1` |        24,466 | `0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7` |

These exact-block runtime matches are necessary identity checks, but a hash match alone does not prove
safety, source equivalence, ownership, or future immutability. PTA and WBNB have separate retained
source/runtime reviews. Pancake core source and deployment provenance are reviewed separately in the
[source-verification boundary](./pancake-v3-source-verification.md).

All five addresses returned zero for the retained EIP-1967 implementation, admin, and beacon slots at
the checkpoint. That is a bounded proxy-slot observation, not a proof that arbitrary control flow is
absent: the reviewed Position Manager runtime includes the official Multicall self-`DELEGATECALL`.

The factory remains a mutable-control boundary. At the checkpoint, `owner()` returned
`0x261AF0030618a52FA767997ed310174b3Bc3B77F`, an empty-code account observation, and
`lmPoolDeployer()` returned `0x7F1745eb74D26877EC54dd9A317CC930Ad01350c`, whose 7,965-byte
runtime had Keccak-256 `0xa67e11e02fe13db93c99031a765ce45a1dd90dc020ef654ed3045b5a200766b5`.
The latter was observed but not source-admitted by this snapshot. Owner-governed fee, protocol and
liquidity-mining surfaces can change independently of this observation. A future submission must
re-read the owner and LM-related state, review any change, and re-bind the complete core relationship
at one fresh finalized block. Matching old hashes does not waive that control review.

## Conditional CREATE2 candidate

For PTA as `token0`, WBNB as `token1`, and fee `500`, the retained derivation inputs are:

| Field                      | Value                                                                |
| -------------------------- | -------------------------------------------------------------------- |
| Pool deployer              | `0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9`                         |
| Salt                       | `0x5c030acd8d38b759c124229312bdac56cbc3a78d527496a161966c188174d172` |
| Retained init-code hash    | `0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2` |
| Conditional pool candidate | `0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE`                         |

The exact compiler/artifact blocker is now closed for the retained construction path. The offline
[init-code provenance record](../evidence/development/pancake-v3-pool-init-code-provenance-2026-08-13.json)
binds official PancakeSwap commit `ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57`, its source archive and
individual source blobs, the complete standard-JSON compiler inputs, and the SHA-256-pinned native
`solc 0.7.6+commit.7338295f` binary. The exact native rerun matches the retained Hardhat artifacts. It
reproduces the 23,566-byte `PancakeV3Pool` creation code and its Keccak-256
`0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2`, matches the
24,556-byte pool-deployer runtime to the retained chain-97 runtime, matches the immutable-patched
factory runtime, and cross-checks the same CREATE2 formula against the retained CAKE/WBNB fee-500
pool.

That makes `0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE` the exact **conditional** address for
the retained source/compiler/deployer path. It does not turn the address into a reservation or an
existing pool. The historical factory result remained zero, and the candidate had empty code and
account nonce zero at that checkpoint. No current-state freshness, receipt, `PoolCreated` event, pool
runtime, or ownership claim follows from the offline reproduction. Before accepting any initializer
outcome, fresh factory/candidate state, deployed lineage, the receipt, event, and post-state must all
agree.

## Proposed non-economic initialization scenario

The old raw-unit `1:1` placeholder is removed from the intended review scenario. Because PTA is
`token0` and both token definitions use 18 decimals, the proposed technical seed is:

| Field                        | Proposed value                               |
| ---------------------------- | -------------------------------------------- |
| Human-readable ratio         | `1 PTA = 0.000001 WBNB`                      |
| Target raw `token1 / token0` | `1 / 1,000,000`                              |
| `sqrtPriceX96`               | `79228162514264337593543950`                 |
| Expected initialized tick    | `-138163`                                    |
| Initializer target           | `0x427bF5b37357632377eCbEC9de3626C71A5396c1` |
| Initializer selector         | `0x13ead562`                                 |
| Native transaction value     | `0`                                          |

This ratio is an arbitrary test scenario. The integer Q64.96 square-root encoding is floored, so its
squared encoded ratio is slightly below the declared `1 / 1,000,000` target. It is not a quote,
market price, peg, oracle, fair value, valuation, performance input, or recommendation. Pool
initialization fixes starting state but adds no liquidity and creates no LP NFT. Inclusion-time racing can also cause
`createAndInitializePoolIfNecessary` to observe a pool initialized by another party, so the requested
price cannot be treated as the mined outcome without receipt and post-state reconciliation.

## Local initializer selector review

The retained
[initializer selector review](../evidence/development/pancake-v3-initializer-selector-review-2026-08-13.json)
locally binds direct selector `0x13ead562` to
`createAndInitializePoolIfNecessary(address,address,uint24,uint160)` on the exact chain-97 Position
Manager. It connects the pinned source slice, ABI, compiler artifact, source map, dispatcher entry,
runtime instructions, and direct call graph through factory `getPool`/`createPool`, pool-deployer
CREATE2, and pool `slot0`/`initialize`. The review also records that the function is payable but the
ProofEra tuple requires native value zero, that it has no deadline, that an already initialized pool
can make the requested price irrelevant, and that every Multicall outer selector and nested
initializer encoding remains denied.

This is deterministic manual/static analysis support, not formal verification. Its exact `33,327`
bytes were later published unchanged as the digest-named file
[`2f78e23...f02.json`](https://gist.githubusercontent.com/tang-vu/e983c3801247685472889075c43e263b/raw/e26e1462df484725bbfb795a2a23aaebfc44ed9b/2f78e23ba4892194f2e55c99de479c5a5421329cc4cf992ed2253dd5c0512f02.json)
at a revision-pinned public Gist. The retained
[retrieval receipt](../evidence/development/pancake-v3-initializer-selector-public-retrieval-2026-08-13.json)
records a separate unauthenticated HTTPS GET with HTTP `200`, zero redirects, complete length and
whole-file SHA-256 equality; the
[publication manifest](../evidence/development/pancake-v3-initializer-selector-publication-manifest-2026-08-13.json)
joins that later event to the immutable review artifact. The raw endpoint served `text/plain`, which
is recorded rather than upgraded into an `application/json` claim, even though the exact bytes parse
as JSON. The Gist can be deleted, so the observation is not a permanent-availability guarantee.

The original review's embedded publication fields remain the historical pre-publication state and
are not rewritten. No authenticated independent reviewer is yet bound to the exact public
direct-only scope. Publication and exact re-fetch are therefore complete, but the artifact remains
ineligible for activation and authorizes no wallet use, signature, or transaction.

## Deterministic external-review request

The retained
[external-review request](../evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json)
pins the exact direct-only initializer subject to repository commit
`00f21c405881a5dc320bddf3c757ba13599b1e71`, exactly the eight implementation files enumerated in
that request, the revision-pinned digest-named Gist, the retained evidence/source blobs, calldata,
operation key, conditional CREATE2 construction, expected runtime, and explicit review checks. Its
deterministic generator performs no network call, environment read, wallet access, signing,
publication, delivery, or chain write.

This is a request package only. `delivery.status` is `not_sent_by_this_bundle`; recipient, reviewer,
exact accepted reviewer identity, and Sigstore authentication evidence remain null. The defined
Sigstore verification path would still have to bind a separately provisioned independent identity,
the exact canonical decision bytes, Fulcio certificate chain, and Rekor inclusion. Unkeyed request
hashes prove local integrity only. They do not authenticate a reviewer.

The request predates and excludes the post-claim recheck and submission/reconciliation files. It has
not been sent, accepted, or approved and is not used to claim an external, Sigstore-authenticated, or
third-party review. It cannot review the later subject, substitute for exact owner authorization, or
authorize custody access, signing, broadcast, or an onchain write. Its generator, test, and retained
artifact pin the historical 45-second envelope cap and are not a producer or evidence source for the
revised runtime timing contract.

## Owner-designated internal multi-agent technical review

For the exact nonexecuting one-shot chain-97 scaffold, the repository owner designated two distinct
read-only subagent tasks as the internal technical-review lane. The deterministic
[decision](../evidence/development/pancake-v3-pta-wbnb-owner-designated-internal-review-2026-08-13.json)
binds commit `bc7000eee4d9698e272cc9deb7dda5748b34318b`, tree
`c63821a1c7b035b0d40221ed8cd6066c69d33041`, all 21 pool-prefixed source/test files, retained context
files, and the one fixed sender/nonce/target/calldata/cost tuple. Both task summaries report technical
approval with no P0/P1; the decision retains the known post-claim parallel-snapshot limitation and
requires the separate fresh pre-submission snapshot.

This is explicitly an **owner-designated internal multi-agent technical review**. It is not an
external review, Sigstore verification, authenticated third-party attestation, public reviewer
identity, or claim of organizational independence. Task labels and unkeyed hashes do not authenticate
people. The decision closes only its internal technical-review gate for the exact pinned nonexecuting
subject. It leaves exact owner transaction approval, production authorization/RPC/custody/journal/
broadcaster/reconciler composition, signing, broadcast, receipt, pool and liquidity false or absent.
Any implementation, release commit, transaction, chain, policy, or production-composition change
requires a new owner-designated distinct-agent technical decision.

## Server-only non-authorizing preflight and signing scaffold

The integrations package now has a fixed-purpose, server-only coordinator that reads exactly two
official BNB Chain testnet RPC origins and fails closed. It finds their common finalized block and uses
EIP-1898 `{blockHash, requireCanonical: true}` selectors for finalized runtime, EIP-1967 proxy-slot,
factory/deployer/manager relationship, fee-tier, candidate, sender-code, and nonce checks. It then
requires matching latest/pending nonce and empty-pool state, candidate code/nonce absence, the exact
zero-value initializer simulation returning the conditional address, two-provider agreement, sender
balance, and fixed estimate/gas-price/total-cost caps.

On success it can create only an exact 300-second, digest-bound unsigned observation envelope whose
`signingReady`, `signingAuthorized`, and `executionAuthorized` flags are always false. The one-shot
boundary validates that envelope and still accepts no custody, journal, signer, transport, or
broadcast dependency.

### Authoritative phase-minus-one bootstrap

The only production entry is this host/path-pinned Windows PowerShell 5.1 command with the working directory exactly
`C:\Users\tangm\Documents\GitHub\proofera-bnb`
after a newly committed and pushed release receives exact audits. The audit supplies both nonzero
lowercase 40-hex Git objects and the nonzero lowercase `0x`-prefixed 64-hex runtime-manifest digest;
the placeholders below are not release values:

```powershell
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\Users\tangm\Documents\GitHub\proofera-bnb\scripts\run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1 --release-commit <AUDITED40> --release-tree <AUDITED40> --runtime-manifest-sha256 <AUDITED0x64>
```

Direct invocation of the phase-zero Node script is unsupported. An ordinary ambient invocation is
rejected by the exact-environment check, but phase zero cannot prove parent provenance against
malicious preload or same-user code that first installs the accepted environment. The configured
`pnpm initialize:pta-wbnb:testnet` command is a fail-only wrapper that returns nonzero. Phase minus one
hardcodes and requires the exact repository root, its own exact absolute path, and the absolute
phase-zero path. Before Node, it first clears its Process environment and installs exactly 13 pinned
non-secret name/value pairs (11 real-host values plus two WebSocket native-addon disable guards). It
then uses the console methods already present in pinned .NET Framework to clear only
`ENABLE_QUICK_EDIT_MODE`, set `ENABLE_EXTENDED_FLAGS`, and verify every other input-mode bit unchanged
before starting the pinned Node executable. It never reads, flushes, synthesizes, or writes console
input bytes; a missing, redirected, or non-console input handle and every mode mismatch fail closed.
Phase zero rejects any missing, additional, or changed entry. It then uses only
plain Node built-ins to verify the exact audit triplet, pinned Node executable and direct
`D:\Git\mingw64\bin\git.exe`, constrained Git behavior, clean `HEAD == origin/main`, requested tree,
enumerated release-source Git blobs—including the phase-minus-one PowerShell file—pinned dependency
trees, and repository root. It repeats the release checks, then spawns the exact phase-one CLI and
loader with the same 13-value environment.

Apart from those two console-mode bits and its own Process environment, phase minus one performs no
repository write, journal read, TTY ceremony, RPC access, custody-artifact access, DPAPI operation,
signature, or send. Phase zero is read-only; recovery is phase one's first application-stateful or
external operational action. This is bootstrap hardening, not secure boot. The trusted computing base
includes both the phase-minus-one
bytes before their later manifest check and the phase-zero bytes that execute before and during their
own checks, every Windows PowerShell 5.1/.NET startup path and ambient environment until scrub,
Windows/filesystem/process semantics, the pinned Node/direct-Git executable files, and the
OS/runtime/DLL installation they load. The later self-check and Git-blob checks are evidence rather
than a root of trust. Complete host installations are not hashed, and no active same-user,
preload/parent-provenance, or comprehensive concurrent-tamper defense exists.

The server-only signing scaffold now implements the exact fixed transaction
protocol, authorization-receipt validation, signer core, Windows signing worker, and append-only
operation journals. Signing generations 1 through 8 are immutable predecessors and recovery generation
9 uses `bsc-testnet-pta-wbnb-pool-v9`. Submission-v2 through v7 are read-only predecessors and active writes use
submission-v8 with v10 schema/files, for sixteen isolated namespaces in total. Journal creation is
restricted to the current Windows user with protected ACL checks, and every state transition is
append-only and exact-operation-bound. The journal receipt self-hash detects local mutation only; it
is **integrity evidence, not reviewer identity, owner authorization, signing authority, or permission
to submit**.

The local authority hardening now implements a two-phase ceremony in the same process: it writes the
complete decoded release/review/envelope challenge to a native TTY, adds a fresh 32-byte nonce from the
operating-system CSPRNG, and accepts only the exact digest-bound confirmation bytes before the bounded
window closes. The ceremony does not use argv, environment, temporary files, shell, logger, custody,
RPC writes, signer, or broadcaster. Challenge generation alone mints no authority.

The current generation-9 recovery timing contract uses exact caps `300/240/120/60/60/20/30` seconds for
the envelope, owner-entry cap, execution authority, minimum remaining before claim, maximum elapsed before
claim, post-recheck reserve, and freshness. The owner deadline is
`min(challengeIssuedAt + 240 seconds, envelopeExpiresAt - 120 seconds)`, so the 240-second cap is further
bounded by preserving the complete 120-second authority reserve.
The owner transaction-authorization and exact-byte-confirmation domains are v12.
The bytes bind `challengeIssuedAt`, `confirmationNotAfter`, the 120-second lifetime, and their
deterministic derivation rule; they did not claim future clock values. Only after an exact byte match
did the internal clock capture actual `confirmedAt`, and the `WeakMap`-branded
generation-9 command binds that timestamp and `executionExpiresAt = confirmedAt + 120 seconds`.
Generation 9 binds the exact generation-8 terminal and attempt identity through owner-v12 domains.

The native bridge holds a current-user fixed-custody-path/ACL capability, ceremony-command brand, and
execution-capability state inside one closure. Before durable `worker_started`, its custody probe checks
only fixed paths, `lstat`/file kind, `realpath`, and current-user ACL. It does not open the custody
artifacts, invoke DPAPI, unlock the keystore, or reconstruct secret/key material. The resulting authority
claim therefore identifies the ACL holder only; it does not claim key ownership or that the expected
sender has been recovered. A capability is reserved for one worker and consumed only after the signing
journal durably enters worker start; only then may bounded custody unlock occur, and the recovered signed
transaction must attest the expected signer before broadcast. Copied JSON/digests, test issuers, proxy
objects, and persisted journal bytes cannot unlock the native worker. The recovery-first phase-one child
wires these controls, while the public production worker factory remains fail-closed. Only a post-commit
exact-release policy, its private envelope instantiation, and the descriptor-bound owner ceremony can
activate the native bridge.

The first production policy-TTY exercise targeted exact audited release commit
`1a89ddae5e1f575b39dda6134d3ccedaddda0adf`, tree
`b28a12f78861183ece5ff1c3fce36c0abf094239`, and runtime-manifest SHA-256
`0xd5212c7563d5d3e3b10d461b5dedcc1552766262c1c87a7057b4dc2876ed0ce0`; both exact-release audits
returned `GO`. The canonical policy digest was
`0x9357b560a91b1c41ef8ef84ea39001c206f50fc9839a55102f7916152160a189`. Its `8,670` bytes encoded to
`11,560` unpadded-base64url characters, producing a complete `11,713`-character v1 line. Windows
Console truncated that line and the reader rejected it fail-closed. The policy was not admitted and
owner confirmation was not reached. Only read-only recovery/journal inspection may have occurred;
there was no fresh RPC, custody-artifact access, DPAPI operation, custody unlock, signature, new
transaction hash, send, receipt, pool, or liquidity. The source then changed, so this exact triplet and
policy are historical v1 evidence only and cannot authorize v2.

The current v10 challenge/frame domains retain the strict nonce-bound ASCII `BEGIN`/`CHUNK`/`END` state
machine introduced in v2 under one absolute five-minute deadline. Every line binds its exact line index, chunk count, policy byte
length, and lowercase raw policy-byte SHA-256; each `CHUNK` also binds its exact zero-based chunk
index. Lines must be exact-order LF or CRLF with no blank/control/trailing data. The hard content-line
cap is `4,096` bytes, while maximum valid worst-case construction is exactly `2,619` bytes and is
tested conservatively at no more than `2,700`. Total transport is capped at `102,400` bytes. Policy
length is `1..65,536` bytes; every non-final payload is exactly `2,304` unpadded-base64url characters,
and the derived chunk count is at most `38`. The historical `11,560`-character payload maps to six
chunks/eight total bounded lines without becoming authority. A one-off local Windows Console observation
motivated these conservative constants, but its harness and result are not retained and it is not
reproducible repository evidence. Repository unit tests establish only the transport arithmetic and
parser behavior. The reader reconstructs the policy once, verifies exact
count/order, declared length/hash, and canonical base64url, and rejects retired v1/v2/v3/v4/v5/v6/v7/v8/v9 domains, truncation,
missing/duplicate/reordered chunks, malformed terminators, and buffered trailing input before policy
admission, fresh RPC, custody access, or owner authority. This invariant does not
prove that the OS queue had no earlier input and does not protect against malicious same-user preload.

A later exact v2 exercise used audited release commit
`36f6e5e7fa8b4b5ccf255a6210afa2d25c25afa5`, tree
`54ed5c2a8f754e79080528a2ce25669a6532a66b`, runtime-manifest SHA-256
`0x25e5aedb6d73e6fff416803ce9d42737d9124e525e0b81bf906321f4d06258d4`, and canonical policy digest
`0xd1a33479a607d744a51ff8d6d3df8772f41ec2f1363911d2655f926c754c3b38`. The strict TTY-v2 reader
admitted the policy. Recovery probes found both signing and submission journals absent; fresh read-only
preflight against the two fixed official RPCs succeeded and the exact owner challenge was displayed.
No exact owner confirmation was accepted. Subsequent attempts stopped fail-closed with
`POLICY_FRAME_INVALID`, `CEREMONY_IO_FAILED`, and `OWNER_CONFIRMATION_INVALID`. Across those exercises
there was no custody-artifact access, DPAPI operation, custody unlock, signature, new transaction hash,
send or broadcast, receipt, pool, or liquidity. The timing source then changed, making this exact
triplet and policy historical and non-authorizing. This was a one-off local
terminal observation. Its raw output and harness were not retained, so it is not reproducible
repository evidence or a gate. The negative custody/sign/send statements reflect the observed
fail-closed result plus code ordering, not a retained artifact.

The next one-off local operational exercise used exact audited release commit
`336af2967286795dc7703fff85034c71b8e84b5c`, tree
`86cc383388982dac1a2bea430f54d54e56bb6cf9`, runtime-manifest SHA-256
`0xa1cda6fcf00f8a7d2b9a679cfb9b3fc28aa60674dae89c7dbfc032bdbcff5bdd`, and canonical policy digest
`0x8ddae3b13ee64ff5f983ce30d06c84d671e0a0ca029f75b5482de6b34b18ba54`. The `8,826` policy bytes
had raw SHA-256 `0x87de481e35a0d8fe6c503f4a7c832d665699ac9f20aa79eb5c40471d79e71a45`, encoded to `11,768`
unpadded-base64url characters, and were admitted across six chunks. The owner entered the exact v4
confirmation. The local legacy journal then durably wrote only its `1,123`-byte slot-1 claim, whose raw
SHA-256 is `0xf10e90eb836a94446ace100bbc9a6fc5de6cc35b1d82e4d10fb4736ef8559e32`.
Windows QuickEdit/selection froze the console while the post-claim RPC recheck was pending. After
selection was cancelled after authority expiry, the observed terminal code was
`POST_CLAIM_RECHECK_OUTCOME_UNKNOWN` and no transaction hash existed. Exact journal inspection and code
ordering show no `worker_authorized`, `worker_started`, signed, or terminal slot; submission state was
exact-empty, and there was no custody-artifact access, DPAPI operation, unlock, signature, send, receipt,
pool, or liquidity. The raw console output and operational harness were not retained, so the owner/terminal
observations are not reproducible repository evidence or a release gate. A later live dual-RPC no-effect
check observed sender nonce `1`, absent factory pool, empty candidate code/nonce `0`, and the expected
simulation result; that check also was not retained and cannot be reused as recovery proof.

Generation 2 later produced a second exact claim-only incident. Release `655187f2b425c40839803950257e1d5a5c4f8d98`
accepted owner-v5 confirmation and retained only the `1,362`-byte `01-claim.v2.json`, raw SHA-256
`0x613df995936c3ccfff56e5da5588906f1bd28340ae8297eb08524274b9b8e1c3`, before the post-claim RPC path
returned `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`. Journal inspection/code ordering show no worker,
custody/DPAPI, signature, submission, receipt, pool or liquidity. The one-off console/harness was not retained.

Generation 3 later produced a third exact claim-only incident. It retained only `01-claim.v3.json`,
exactly `1,362` bytes with raw SHA-256 `0x7ff780a8f0ac1a1f8ff7bced5d858259f918cdb1891c684aa208b6bca31c9585`.
There is no slot 2, worker authorization/start, custody access, signature, submission, transaction hash,
receipt, pool, or liquidity. The exact proximate error was not retained, so expiry is not asserted as fact.

Generation 4 is now historical. A one-off local run accepted owner-v7 and durably retained claim raw
SHA-256 `0xd5fc6da9f853c621f4f407c9d8a729f898c0297720bc50817e633fa538967f36` plus `failed_before_worker`
transition raw SHA-256 `0x2e0570423b1217f1dab6fa8cdb91a0a75b2d78023bacc611a6c81017d0033bab`, with
`POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`. Exact two-slot local-journal ordering proves no worker
authorization/start/signature. Separate exact-empty submission-v3 plus code ordering proves no
submission/send and supports no custody-secret access or DPAPI/unlock. Raw console output and the harness were not retained, so this is not
reproducible repository or chain evidence and supplies no receipt.

Generation 5 is now historical. Its local-only owner-v8 run wrote exactly `01-claim.v5.json` (`1,364`
bytes, raw SHA-256 `0x0d76c35b7d6cdec488b8b79dafcefacc597c79f057fe722a2202d284515017f1`)
and `02-transition.v5.json` (`1,383` bytes, raw SHA-256
`0x39a6295f3f816cb5bba6c8c3be11982bcafa45847608e1150de950738217c8c9`). The durable state is
`failed_before_worker` / `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`. Neither record contains a serialized
transaction or transaction hash, and there is no later worker/signature/submission slot or receipt.

Generation 6 is now historical. Its local-only owner-v9 run for release
`1655d39db63a636e7c66a007046c06eab65c55f1` wrote `01-claim.v6.json` (`1,364` bytes, raw SHA-256
`0x2f7dffbe7fef710273206009a06c7e460fa9f289b2403d6760c805707467e2ed`) and
`02-transition.v6.json` (`1,383` bytes, raw SHA-256
`0x4a64cc2ef48529e271152004e31dfb7d35511d0a5691815838849c831638d6f7`). The durable state is
`failed_before_worker` / `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`. There is no worker, custody unlock,
serialized transaction, transaction hash, signature, submission, receipt, pool, or liquidity.

Generation 7 is historical. Its local-only owner-v10 run for release
`dbd4950e62b469379dc9fc877668d247b38b6f93` wrote `01-claim.v7.json` (`1,364` bytes, raw SHA-256
`0xceec9b1e6de22bc8eb11c9f1bea3d6cec730e34e1ce8f306705fa4782c39c3bd`) and
`02-transition.v7.json` (`1,383` bytes, raw SHA-256
`0x97bb22de4f86b517af0b517f6765d77896da7881708da6589d17703790abc3dc`). The durable state is
`failed_before_worker` / `POST_CLAIM_RECHECK_OUTCOME_UNKNOWN`; there is no worker, custody unlock,
signature, submission, transaction hash, receipt, pool, or liquidity.

Generation 8 is historical. Its local-only owner-v11 run for release
`08f0357f1281c2289a1a0db9637e8fb082cb6900` wrote a claim whose raw SHA-256 is
`0x5a85737428a4bbd06459ceab52d6096fba74aa1c002de31a24c942ff9f3954f6` and a
`failed_before_worker` / `GAS_POLICY_VIOLATION` terminal whose raw SHA-256 is
`0x3210fd8ab08c2282a5da1aeb426984592fed9a5b3a6832ac7d60991baaf4fc6d`. Submission-v7 is exact-empty.
There is no worker authorization/start, custody access or unlock, signature, submission, transaction
hash, receipt, pool, or liquidity.

Recovery generation 9 directly binds that exact generation-8 terminal and its inherited generation-7
terminal, and separately requires submission-v7 to contain no retained transaction state. A fresh,
distinct envelope observed after the terminal is required. Policy/runtime-instantiation is v9, TTY is
v10, owner command/text/confirmation is v12, and signing/intent/broadcast are v9. The only permitted
transaction remains pinned to sender nonce `9`; every in-ceremony nonce check must agree exactly or stop
before signing. The active signing journal uses `bsc-testnet-pta-wbnb-pool-v9`. Signing v1-v8 and
submission-v2 through v7 remain immutable; active submission uses
`bsc-testnet-pta-wbnb-pool-submission-v8` with v10 durable records and owner policy v10. The fixed signed
gas limit is `6,600,000` whenever the fresh estimate is at most `5,500,000` and still satisfies the exact
20% margin; estimate drift within that bound no longer changes the signed transaction. Persisted bytes
never recreate owner authority.

A separate local post-claim recheck core requires the authorization gate's authenticated private
intent before making any read. It compares only the two fixed official RPC origins, finds a common
finalized block, uses EIP-1898 `requireCanonical`, and repeats chain, nonce, empty-pool, empty-candidate,
sender-code, simulation, balance, gas, cost, exact execution expiry, and 30-second refreshed-observation
freshness bounds. Its refreshed observation/authentication timestamp must be at or after actual
`confirmedAt` while preserving the same `executionExpiresAt`. Its
opaque in-memory capability is bound to the exact claim and intent; cloned or proxy values are not
accepted. The two endpoint requests in each pair run together, but pairs are ordered so each endpoint
has at most one request in flight; there is no transport retry. Known fail-closed results retain their
exact code and stage in the signer diagnostic, while truly ambiguous transport exceptions remain unknown.
accepted. Focused tests exercise that behavior and its failure boundaries.

The standalone public production recheck constructor remains fail-closed, while the root composition
binds the same strict recheck to its fixed official-RPC clients and private authenticated intent. No
short-lived envelope or recheck capability is retained as current evidence, and an expired
observation cannot be reused. Review policy and owner confirmation remain distinct gates.

## Gated submission and reconciliation path

The server-only submission core cannot accept caller-selected transaction bytes. It parses and
recovers the one exact legacy-typed EIP-155 signed
transaction, binds the sender, nonce, target, zero value, calldata, gas/cost caps and deterministic
transaction hash, and requires a fresh dual-RPC pre-submission snapshot with the exact transaction and
receipt still absent.

The test model requires the winner to durably commit the exact `submission_started` binding before a
send. Only that new-start winner may invoke the injected at-most-once send port. An already-started or
unknown outcome enters reconciliation only; an ambiguous return/transport failure, expired post-start
window, or any later retry never resends and never creates a replacement transaction.

Terminal reconciliation is content-validated only after both fixed providers agree on the exact
transaction and receipt, the receipt block is canonical below both finalized heads, and its transaction
index is bound. Success additionally requires exactly the expected factory `PoolCreated` and pool
`Initialize` logs plus matching EIP-1898 factory mapping, candidate runtime/immutables, `slot0`, zero
liquidity and initialized observation state. A reverted receipt is kept distinct and cannot retain
success logs or pool post-state.

The repository now locally implements those formerly pending controls. Its append-only submission
journal schema v10 persists the exact generation-9 owner authorization, recovery quartet,
one-signature/one-broadcast policy, and transaction binding. Submission-v2 through v7 are probed read-only while
new writes use submission-v8, so predecessor state is not hidden by a directory rename. The production root reads
signing generations 1 through 9 and submission v2 through v8 before any authorization or signing; composition
then rereads the generation-8 terminal, empty/absent submission-v7, active signing-v9, and active submission-v8: terminal state stops; durable
`submission_started`/`unknown_outcome` enters recovery-only reconciliation; a signed commit without a
durable start cannot recreate owner authority; and mismatched restart state fails closed. A fresh
attempt must win durable `submission_started`, after which a second fixed dual-RPC state snapshot is
required immediately before the sole send opportunity. Expiry or drift after the acknowledgement
forbids send, retry, and replacement.

Terminal reconciliation requires both fixed providers to return the identical exact transaction,
receipt and logs, plus identical EIP-1898 post-state at the receipt block. Per provider it samples the
first finalized head `F1`, reads the fixed receipt-plus-128 checkpoint `C1` and exactly 128 continuous,
exact-number, parent-hash-linked ancestry blocks, rereads that checkpoint as `C2`, samples a
non-regressing finalized head `F2`, and finally requires an EIP-1898 `requireCanonical` state read at
`C`. The finalized heads may differ, but both providers must agree on the checkpoint, ancestry,
receipt-block post-state, and canonical attestation. Missing, discontinuous, changed, or
timestamp-regressive evidence fails closed. The provider-attested sandwich order is:

`F1 -> C1/ancestry -> C2 -> F2 -> EIP-1898(C)`

It is RPC consistency, not cryptographic proof that `C` is an ancestor of `F1`/`F2`, provider
independence, or protection from two colluding/identically faulty Byzantine providers. The phase-one
child wires these controls to a closure-private sender; the public worker and generic raw sender remain
unavailable. Every release containing this path must have a committed and pushed identity, then its exact
commit/tree/full runtime manifest must receive new owner-designated audits and a matching policy before
the owner enters the separate exact generation-9 owner-v12 TTY confirmation. This document
records the historical admitted `36f6e5e7` policy and the later expired owner-v4 incident at
`336af296` and `655187f2`, plus the non-retained generation-4 terminal observation, but supplies no
matching policy or owner-v12 confirmation for generation 9; no generation-9 signature, send, transaction
receipt, pool, or LP position exists. These changed files are
not covered by the old external-review request, retained `bc7000e` decision, or any historical policy.

## Separate proposed liquidity envelope

A later test-only LP mint may be designed with desired-amount caps of at most `1,000 PTA` and
`0.001 WBNB`. This is a **proposal, not an approval**. It is not a balance claim, spend authorization,
valuation, guaranteed consumption amount, position range, minimum amount, or mint request. No WBNB
funding/wrapping, token approval, LP calldata, recipient, ticks, deadline, slippage minima, gas cap, or
position authority is approved by this document.

The two write decisions stay separate:

1. Pool initialization requires its own fresh simulation, exact sender/nonce/gas/cost envelope, short
   broadcast window, durable one-shot claim/submission journal, the exact generation-8 terminal, a new
   owner-designated distinct-agent technical decision and canonical policy for the exact generation-9
   release, exact owner-v12 authorization through the bounded TTY ceremony, receipt, exact logs, and
   post-state reconciliation. Historical confirmations cannot cross the terminal binding; this
   preparation record supplies none of those generation-9 authority or transaction outputs.
2. Only after the pool is independently re-reviewed may an LP mint be prepared. It requires separate
   bounded token approvals, explicit ticks/amounts/minima/deadline/slippage, owner/revoke authority,
   simulation, user confirmation, and receipt evidence.

## Remaining blockers

- Generation 9 must reread all sixteen namespaces, bind the exact generation-8 terminal and empty/absent
  submission-v7, then independently refresh all five runtime identities, manager/factory/deployer
  relationships, fee configuration, factory owner, LM controls, pair lookup, exact sender nonce `9`,
  fee, gas, and balance in a fresh distinct envelope after that terminal. Any nonce drift blocks; no
  Invocation A or no-effect fence applies.
- Preserve the owner-designated internal decision only for exact commit `bc7000e`. Obtain a final
  distinct-agent technical decision bound to the exact changed release, including the ceremony/bridge/
  journal/recovery/ancestry delta. Local implementation review does not replace that release-bound
  decision. Do not describe this lane as external, Sigstore-authenticated or third-party review. The
  old eight-file unsent request, public Gist and byte-exact re-fetch provide no review for later code.
  Its generator, test, and artifact remain pinned to the historical 45-second envelope and are not
  timing evidence for the revised `300`/`240`/`60`/`30` contract.
- Obtain a fresh exact generation-9 owner-v12 authorization. Expired owner-v4/v5/v6/v7/v8/v9/v10/v11 confirmations,
  requests, terminal records, or reviewer decisions cannot substitute for it.
- Generate the canonical generation-9 runtime policy only after the final commit is pushed and two
  designated read-only agents approve its exact commit/tree/full manifest. Use that exact triplet only with the
  absolute PowerShell phase-minus-one command; never substitute direct Node, the blocked pnpm wrapper,
  placeholder values, the historical v1 triplet/policy, the stale `36f6e5e7` triplet/policy, or the
  incident `336af296` triplet/policy/owner-v4 bytes.
  Admit the matching policy through the strict nonce-bound v10 `BEGIN`/ordered `CHUNK`/`END` TTY phase,
  run the fixed coordinator for the fresh envelope, and instantiate the admitted policy on it. Then
  require the owner's exact v12 second-phase confirmation; neither gate may be inferred from
  repository contents, chat, digests, or journal state. The public worker and generic raw sender stay
  hard-blocked even when the closure-private path is used.
- Re-run the fixed two-provider coordinator immediately before any generation-9 claim,
  then repeat the pending nonce, pool, candidate-code and simulation checks after the durable claim and
  abort on any drift.
- Establish post-initialization observation cardinality and elapsed oracle history before using the
  pool for analysis; a new pool has no decision-useful history merely because it exists.
- Review actual liquidity depth, price-manipulation exposure, token funding, LP range, ownership,
  bounded approvals, Altana policy/authority, and revoke behavior before activation.

Until those gates close and explorer-verifiable receipts exist, the truthful state remains: PTA and
WBNB identities are evidenced, the retained pool construction path is reproduced exactly offline,
and a read-only non-authorizing preflight plus a phase-minus-one/phase-zero, exact-policy/owner-gated
incident-only generation-9 recovery/signing/submission/reconciliation path is implemented. The
owner-designated internal technical-review gate is complete only for the exact `bc7000e` nonexecuting
subject, not this changed release until its final commit is pushed and receives new exact audits. **No
authenticated external/third-party review is claimed. The `36f6e5e7` policy and the `336af296`
policy/expired owner-v4 incident are historical, non-authorizing operational observations; this preparation
record contains no matching generation-9 policy, owner-v12 transaction approval, signature, send,
receipt, PTA/WBNB pool, liquidity, oracle, position, Pancake write, or autonomous-execution evidence**.

The machine record is linked to the retained
[bounded public-result RPC transcript](../evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json)
by collector-source and canonical-body SHA-256. That transcript preserves exact request parameters,
both providers' normalized public block, runtime-code and scalar result payloads, and the EIP-1898
selector. It deliberately omits JSON-RPC envelopes, request IDs and headers. Offline tests validate
retained provider equality, selected runtime/scalar state, cross-file integrity and non-authorization
boundaries; they do not authenticate a public RPC. It is historical capture evidence, not reusable
freshness, execution authority or permission to write.

The root `pnpm test:evidence` gate now has 68 offline tests covering the retained pool-readiness
transcript, init-code provenance, initializer review/publication, old request, owner-designated
internal-review decision, earlier selector-path package, PTA deployment evidence, and WBNB source
record. Passing those tests proves deterministic local consistency only; it neither sends the old
request, refreshes chain state, authenticates a reviewer identity, nor supplies a signer, owner
approval, transaction, or receipt. Full repository verification is only a local consistency gate; it
cannot extend the retained `bc7000e` decision to a changed release or authorize a transaction.
