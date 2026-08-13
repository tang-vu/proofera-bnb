# PancakeSwap V3 BSC testnet PTA/WBNB pool readiness

Updated: 2026-08-13. Decision: **exact offline provenance, a non-authorizing read-only
preflight, an old-scope unsent review request, and production-blocked signing/post-claim/submission/
reconciliation scaffolds are recorded; no pool or write is approved**.

Machine record:
[`evidence/development/bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json`](../evidence/development/bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json)

Non-authorizing external-review request:
[`evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json`](../evidence/development/pancake-v3-pta-wbnb-external-review-request-2026-08-13.json)

## Scope

This is a BNB Smart Chain testnet and PancakeSwap V3 preparation milestone. The historical observation
used local ProofEra tooling and two official credential-free BNB Chain RPC endpoints. Capture created
only fixed public evidence files. The later compiler and selector reviews and external-review-request
generator run offline. The server-only coordinator cannot authorize signing or execution, and the
post-claim and submission production factories are deliberately unavailable. The submission core
accepts only injected test ports. None of these paths made an onchain RPC write, approval, signature,
broadcast, pool creation, token wrapping, liquidity mint, swap, or mainnet action.

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

The request predates and excludes the post-claim recheck and submission/reconciliation files. Any
future authenticated approval can close only the independent-review gate for the exact eight-file
request subject. It cannot review the current or a future activation release, substitute for exact
owner authorization, or authorize custody access, signing, broadcast, or an onchain write. Activation
requires a new request and authenticated independent decision pinned to the complete exact release.
The old request has not been sent, accepted, or approved, and execution readiness remains false.

## Server-only non-authorizing preflight and signing scaffold

The integrations package now has a fixed-purpose, server-only coordinator that reads exactly two
official BNB Chain testnet RPC origins and fails closed. It finds their common finalized block and uses
EIP-1898 `{blockHash, requireCanonical: true}` selectors for finalized runtime, EIP-1967 proxy-slot,
factory/deployer/manager relationship, fee-tier, candidate, sender-code, and nonce checks. It then
requires matching latest/pending nonce and empty-pool state, candidate code/nonce absence, the exact
zero-value initializer simulation returning the conditional address, two-provider agreement, sender
balance, and fixed estimate/gas-price/total-cost caps.

On success it can create only a 45-second, digest-bound unsigned observation envelope whose
`signingReady`, `signingAuthorized`, and `executionAuthorized` flags are always false. The one-shot
boundary validates that envelope and still accepts no custody, journal, signer, transport, or
broadcast dependency.

A separately reviewed, server-only signing scaffold now implements the exact fixed transaction
protocol, authorization-receipt validation, signer core, Windows signing worker, and an append-only
operation journal rooted at
`%LOCALAPPDATA%\ProofEra\operations\bsc-testnet-pta-wbnb-pool-v1`. Journal directory/file creation is
restricted to the current Windows user with protected ACL checks, and every state transition is
append-only and exact-operation-bound. The journal receipt self-hash detects local mutation only; it
is **integrity evidence, not reviewer identity, owner authorization, signing authority, or permission
to submit**.

This scaffold is deliberately unreachable for production use. The production authority gate,
production signer core, and production signing-worker factory each fail closed with
`PRODUCTION_AUTHORIZATION_UNAVAILABLE`. The eight earlier focused integration files pass 70 tests
across the coordinator, boundary, package-export barrier, exact protocol, authorization gate,
journal, signer core, and worker.

A separate test-only post-claim recheck core requires the authorization gate's authenticated private
intent before making any read. It compares only the two fixed official RPC origins, finds a common
finalized block, uses EIP-1898 `requireCanonical`, and repeats chain, nonce, empty-pool, empty-candidate,
sender-code, simulation, balance, gas, cost, authorization-expiry and 30-second completion bounds. Its
opaque in-memory capability is bound to the exact claim and intent; cloned or proxy values are not
accepted. Seventeen focused tests exercise that behavior and its failure boundaries.

The recheck production constructor also fails closed with `PRODUCTION_AUTHORIZATION_UNAVAILABLE` and
performs no production RPC call. It has no environment, filesystem/journal, custody, signer,
signature, submission, or broadcast path. No short-lived envelope or recheck capability is retained
as current evidence, and an expired observation cannot be reused.

## Test-only submission and reconciliation scaffold

The later server-only submission core accepts only injected test ports; callers of its one-shot method
cannot provide transaction bytes. It parses and recovers the one exact legacy EIP-155 signed
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

This scaffold does not supply any of those ports in production. Its production factory fails before
capability, journal, RPC or broadcast access with `PRODUCTION_AUTHORIZATION_UNAVAILABLE`. There is no
production authenticated submission-capability issuer, durable submission journal, RPC adapter,
broadcaster or reconciler. No send, transaction receipt, pool or LP position was created. The local
tests are specification/validation evidence only, and these files are not covered by the old external-
review request.

## Separate proposed liquidity envelope

A later test-only LP mint may be designed with desired-amount caps of at most `1,000 PTA` and
`0.001 WBNB`. This is a **proposal, not an approval**. It is not a balance claim, spend authorization,
valuation, guaranteed consumption amount, position range, minimum amount, or mint request. No WBNB
funding/wrapping, token approval, LP calldata, recipient, ticks, deadline, slippage minima, gas cap, or
position authority is approved by this document.

The two write decisions stay separate:

1. Pool initialization requires its own fresh simulation, exact sender/nonce/gas/cost envelope, short
   broadcast window, implemented and reviewed durable one-shot claim/submission journal, a new
   authenticated full-release external review, exact owner authorization, production signer/broadcaster/
   reconciler boundaries, receipt, exact logs, and post-state reconciliation.
2. Only after the pool is independently re-reviewed may an LP mint be prepared. It requires separate
   bounded token approvals, explicit ticks/amounts/minima/deadline/slippage, owner/revoke authority,
   simulation, user confirmation, and receipt evidence.

## Remaining blockers

- Refresh all five runtime identities, manager/factory/deployer relationships, fee configuration,
  factory owner, LM controls, pair lookup, nonce, fee, gas, and balance at one fresh finalized block.
- Generate a new deterministic request pinning the complete exact activation release, deliver it to a
  separately provisioned independent reviewer, then verify exact Sigstore identity/signature/
  transparency-log evidence and decision bindings. The old eight-file unsent request, public Gist and
  byte-exact re-fetch provide no review for the later post-claim/submission files or current release.
- Obtain a distinct exact owner authorization. Neither the request nor a future reviewer decision can
  substitute for it.
- Provision and independently review production authorization/RPC composition, a durable submission
  journal, broadcaster, receipt handling, and pending/replacement/unknown-outcome reconciliation. The
  signing, post-claim and submission/reconciliation scaffolds remain deliberately production-
  unreachable and non-authorizing.
- Re-run the fixed two-provider coordinator immediately before any claim, then repeat the pending nonce,
  pool, candidate-code and simulation checks after the durable claim and abort on any drift.
- Establish post-initialization observation cardinality and elapsed oracle history before using the
  pool for analysis; a new pool has no decision-useful history merely because it exists.
- Review actual liquidity depth, price-manipulation exposure, token funding, LP range, ownership,
  bounded approvals, Altana policy/authority, and revoke behavior before activation.

Until those gates close and explorer-verifiable receipts exist, the truthful state remains: PTA and
WBNB identities are evidenced, the retained pool construction path is reproduced exactly offline,
and a read-only non-authorizing preflight plus production-blocked signing/post-claim/submission/
reconciliation scaffolds exist, but **no authenticated full-release review, owner authority,
production submission path, PTA/WBNB pool, liquidity, oracle, position, Pancake write, or autonomous
execution is evidenced**.

The machine record is linked to the retained
[bounded public-result RPC transcript](../evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json)
by collector-source and canonical-body SHA-256. That transcript preserves exact request parameters,
both providers' normalized public block, runtime-code and scalar result payloads, and the EIP-1898
selector. It deliberately omits JSON-RPC envelopes, request IDs and headers. Offline tests validate
retained provider equality, selected runtime/scalar state, cross-file integrity and non-authorization
boundaries; they do not authenticate a public RPC. It is historical capture evidence, not reusable
freshness, execution authority or permission to write.

The root `pnpm test:evidence` gate now has 58 offline tests covering the retained pool-readiness
transcript, init-code provenance, initializer review/publication, deterministic external-review
request, earlier selector-path package, PTA deployment evidence, and WBNB source record. Passing those
tests proves deterministic local consistency only; it neither sends the request, refreshes chain
state, nor supplies a reviewer, signer, approval, transaction, or receipt. Full repository verification
for this non-executing milestone passed on 2026-08-13.
