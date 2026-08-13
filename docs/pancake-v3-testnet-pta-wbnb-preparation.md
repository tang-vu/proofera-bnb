# PancakeSwap V3 BSC testnet PTA/WBNB pool readiness

Updated: 2026-08-13. Decision: **read-only preparation recorded; no pool or write is
approved**.

Machine record:
[`evidence/development/bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json`](../evidence/development/bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json)

## Scope

This is a BNB Smart Chain testnet and PancakeSwap V3 preparation milestone. The observation used local
ProofEra tooling and two official credential-free BNB Chain RPC endpoints. Capture created only the
fixed public evidence file; it made no onchain RPC write, approval, signature, broadcast, pool
creation, token wrapping, liquidity mint, swap, or mainnet action.

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

The candidate is deterministic only if the retained pool creation-code hash and deployer derivation
are the exact deployed construction path. That compiler/artifact proof has not yet been independently
bound, so ProofEra does **not** promote the candidate to a verified pool address. The factory returned
zero for fee `500`, and the candidate returned empty code and account nonce zero at the checkpoint; no
receipt or `PoolCreated` event is claimed for it.

Before any initializer submission, an independent retained compiler/artifact reproduction must bind
the init code hash, then the predicted address, factory `getPool`, candidate code, deployer lineage,
and eventual `PoolCreated` receipt must all agree.

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

## Separate proposed liquidity envelope

A later test-only LP mint may be designed with desired-amount caps of at most `1,000 PTA` and
`0.001 WBNB`. This is a **proposal, not an approval**. It is not a balance claim, spend authorization,
valuation, guaranteed consumption amount, position range, minimum amount, or mint request. No WBNB
funding/wrapping, token approval, LP calldata, recipient, ticks, deadline, slippage minima, gas cap, or
position authority is approved by this document.

The two write decisions stay separate:

1. Pool initialization requires its own fresh simulation, exact sender/nonce/gas/cost envelope, short
   broadcast window, durable one-shot claim, explicit user confirmation, receipt, `PoolCreated` log,
   and exact post-state reconciliation.
2. Only after the pool is independently re-reviewed may an LP mint be prepared. It requires separate
   bounded token approvals, explicit ticks/amounts/minima/deadline/slippage, owner/revoke authority,
   simulation, user confirmation, and receipt evidence.

## Remaining blockers

- Independently reproduce and bind the pool compiler artifact, creation bytecode, init-code hash, and
  deployed CREATE2 derivation.
- Refresh all five runtime identities, manager/factory/deployer relationships, fee configuration,
  factory owner, LM controls, pair lookup, nonce, fee, gas, and balance at one fresh finalized block.
- Publish and independently retrieve the exact initializer selector-path attestation.
- Bind the intended sender and enforce one nonce, a maximum tBNB cost, a short external broadcast
  window, pending/replacement reconciliation, and an immediate abort on any state drift.
- Establish post-initialization observation cardinality and elapsed oracle history before using the
  pool for analysis; a new pool has no decision-useful history merely because it exists.
- Review actual liquidity depth, price-manipulation exposure, token funding, LP range, ownership,
  bounded approvals, Altana policy/authority, and revoke behavior before activation.

Until those gates close and explorer-verifiable receipts exist, the truthful state remains: PTA and
WBNB identities are evidenced, a read-only initialization scenario is prepared, and **no PTA/WBNB
pool, liquidity, oracle, position, Pancake write, or autonomous execution is evidenced**.

The machine record is linked to the retained
[bounded public-result RPC transcript](../evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json)
by collector-source and canonical-body SHA-256. That transcript preserves exact request parameters,
both providers' normalized public block, runtime-code and scalar result payloads, and the EIP-1898
selector. It deliberately omits JSON-RPC envelopes, request IDs and headers. Offline tests validate
retained provider equality, selected runtime/scalar state, cross-file integrity and non-authorization
boundaries; they do not authenticate a public RPC. It is historical capture evidence, not reusable
freshness, execution authority or permission to write.
