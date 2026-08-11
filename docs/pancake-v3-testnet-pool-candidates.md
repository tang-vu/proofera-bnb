# PancakeSwap V3 BSC testnet pool-candidate review

Checked: 2026-08-11 UTC
Network: BNB Smart Chain testnet (`chainId` 97)
Decision: **no economically admissible existing pool was found in the bounded search**

The machine-readable record is
[`evidence/development/pancake-v3-testnet-pool-candidates-2026-08-11.json`](../evidence/development/pancake-v3-testnet-pool-candidates-2026-08-11.json).
It contains the exact addresses, raw values, block identities, CREATE2 salts, source results, and
per-component decisions summarized here.

## Activation decision

ProofEra must not add any candidate in this report to the Milestone 1 write allowlist.

All 14 candidate pools have exact Pancake V3 core lineage: the canonical
`factory.getPool(token0, token1, fee)` result, pool immutable getters, observed address, and CREATE2
address derived from the exact official pool-deployer and pool init-code hash agree. That proves
which Pancake V3 core created the pool. It does **not** prove that either token is safe, that the
liquidity has economic value, or that the oracle history is useful.

Every candidate then fails independently:

- The three configured mock counterparties have exact source/runtime matches, but their source
  exposes unrestricted minting. The mock USDT and mock BUSD contracts also expose an unrestricted
  `burnFrom` that directly burns from an arbitrary address.
- The official testnet CAKE address is documented as a dummy token, exposes an unguarded mint path,
  and has `uint256.max` supply.
- All six recently created pools have only one oracle observation. Their counterparty sources were
  unavailable, so admin, mint, upgrade, fee, blacklist, pause, hook, and rebase behavior remains
  unknown and fails closed. Four are EIP-1167 clones of the same unverified implementation.
- The configured MockA pool has zero active liquidity. Other pools have nonzero raw fields and
  balances, but raw quantities paired with freely mintable or unverified tokens are not usable
  liquidity.
- WBNB passed the retained static behavior review, but its raw explorer compiler input and an exact
  local runtime rebuild are still missing. It therefore remains strict-provenance non-ready.
- The Pancake core itself retains explicit fee-protocol and LM-pool control surfaces. These are
  disclosed protocol dependencies, not hidden behind the pool-lineage pass.

No wallet, signature, approval, transaction, deployment, or state change was used.

## Canonical observation

Two nodes independently agreed on the selected lower finalized head:

| Field          | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| Block          | `124480209` (`0x76b6ad1`)                                            |
| Hash           | `0xe8d54b7f796b123cd83f82c6e173d0111ed666d59e4754ad0b5546f5e560d21b` |
| Parent         | `0xf0b4bdcffb2a61fec3caf92897a7f78a03e04bcf0b38506163dc7dd402033d33` |
| Timestamp      | `2026-08-11T15:34:25.000Z`                                           |
| State selector | `{ blockHash, requireCanonical: true }`                              |
| State fallback | none; no `latest` or block-number fallback                           |

`https://bsc-testnet-rpc.publicnode.com` supplied the EIP-1898 state reads. The official
`https://bsc-testnet-dataseed.bnbchain.org` endpoint independently returned the same anchor and
start-block headers. The official BNB Chain documentation records chain ID 97, its public testnet
endpoints, public rate limits, and log-query limitations:
[BNB Chain JSON-RPC endpoints](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/).

## Exact search coverage

This is deliberately bounded and is not described as a factory-lifetime inventory.

### 1. Official configuration cross-product

The signed PancakeSwap repository commit
[`2f6248444994ff1c2a5f0b601324d1f531355ccf`](https://github.com/pancakeswap/exchange-v3-subgraphs/commit/2f6248444994ff1c2a5f0b601324d1f531355ccf)
contains the pinned
[`config/chapel.js`](https://github.com/pancakeswap/exchange-v3-subgraphs/blob/2f6248444994ff1c2a5f0b601324d1f531355ccf/config/chapel.js)
used as an address seed. It identifies WBNB, three configured stablecoin addresses, one additional
whitelisted token, and a configured WBNB/stable pool.

ProofEra crossed all four non-WBNB configured addresses with the four standard fee tiers `100`,
`500`, `2500`, and `10000`, then made 16 canonical `factory.getPool` reads. Seven mappings were
nonzero and nine were zero. Configuration membership and symbols were not treated as token safety
evidence.

### 2. Complete recent event interval

The public log provider retained history beginning near block `124391822` at probe time. To avoid a
moving retention boundary, ProofEra searched the fixed inclusive interval from block `124400000`
(`2026-08-11T05:32:28Z`) through the canonical anchor `124480209`
(`2026-08-11T15:34:25Z`): exactly 80,210 blocks.

The search queried the official factory and exact
`PoolCreated(address,address,uint24,int24,address)` topic in two contiguous at-most-50,000-block
windows, once with WBNB in each indexed token position. It returned six events. Each event was then
re-read with a `blockHash` log filter; each exact transaction was present once and `removed` was
false.

### 3. Previously reviewed official dummy pair

The known CAKE/WBNB fee-500 pool was included and refreshed at this report's canonical anchor. Its
deeper source reconstruction and token review are bound by SHA-256 in the JSON record and retained
at
[`pancake-v3-testnet-cake-wbnb-verification-2026-08-11.json`](../evidence/development/pancake-v3-testnet-cake-wbnb-verification-2026-08-11.json).

### Historical gap

The exact uncovered interval is factory deployment block `28488223` through block `124399999`.
PublicNode had pruned that log history. OnFinality's public archive endpoint accepted historical
queries but limited them to 100,000 blocks and rate-limited the attempted complete scan. Partial
responses were discarded rather than presented as complete. OnFinality itself describes its public
endpoint as rate-limited:
[BNB Testnet RPC](https://onfinality.io/en/networks/bnb-testnet).

The narrowest missing coverage proof is therefore an archive-complete pair of WBNB-indexed
`PoolCreated` result sets for that exact interval. It could reveal another candidate; it would not
repair any hard-rejected candidate below.

## Candidate decisions

Addresses and symbols are untrusted metadata. The table groups only identical failure modes; the
JSON evidence retains every pool separately.

| Candidate pool(s)                                                                       | Core lineage | Counterparty gate                                          | Liquidity/oracle gate                                         | Decision   |
| --------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| `0x6e43…f7ea` (MockA/WBNB, 500)                                                         | Pass         | Exact source; unrestricted public mint                     | Active liquidity `0`; one observation                         | Ineligible |
| `0xd936…5ec9`, `0x5147…6f6b` (mock USDT/WBNB, 100 and 2500)                             | Pass         | Exact source; unrestricted mint and arbitrary `burnFrom`   | Nonzero raw values; one observation                           | Ineligible |
| `0x586b…0ce0`, `0xef15…d11d`, `0xcbb1…6992`, `0x0e2c…1ac2` (mock BUSD/WBNB, four tiers) | Pass         | Exact source; unrestricted mint and arbitrary `burnFrom`   | Nonzero raw values; latest observations about 11–115 days old | Ineligible |
| `0xeaf7…5015` (dummy CAKE/WBNB, 500)                                                    | Pass         | Official dummy, unguarded mint surface, maximum supply     | Nonzero raw values; one observation                           | Ineligible |
| `0x9842…d1de` (recent pool)                                                             | Pass         | No verified counterparty source                            | Nonzero raw values; one observation                           | Ineligible |
| `0xf1cf…1b5a`, `0xfae6…abdf`, `0xb125…a513`, `0xb837…dd05` (recent pools)               | Pass         | EIP-1167 clones of unverified implementation `0x3112…1f93` | Nonzero raw values; one observation                           | Ineligible |
| `0x5c2f…b65f` (recent pool)                                                             | Pass         | No verified source; nonzero owner getter; decimals `0`     | Nonzero raw values; one observation                           | Ineligible |

The configured stablecoin-like symbols are particularly useful evidence for ProofEra's product
thesis: a familiar name and an official indexing configuration can coexist with economically unsafe
token code. The marketplace must show source-backed controls, not infer trust from a label.

## Component gates

### Pancake core

The official
[`bscTestnet.json`](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/deployments/bscTestnet.json)
pins the factory and deployer. The retained exact build review covers
[`PancakeV3Pool.sol`](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3Pool.sol),
[`PancakeV3Factory.sol`](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3Factory.sol),
and
[`PancakeV3PoolDeployer.sol`](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3PoolDeployer.sol).

At the new anchor, factory, deployer, and WBNB runtime hashes were unchanged from that retained
review. All candidate CREATE2 derivations matched. Core identity passes, with explicit owner and
LM-pool mutability disclosed.

### Configured mocks

Sourcify v2 returned exact source/runtime matches for MockA, mock USDT, and mock BUSD. A read-only
`eth_call` from an unrelated address to each zero-amount mint returned success. The two
`MockToken.sol` instances also accepted zero-amount `burnFrom` from the unrelated caller. These
zero-amount calls changed no state; they show that no caller-authorization branch rejected the
paths. The source itself establishes the unrestricted positive-amount behavior.

Sourcify's API and evidence meaning are documented at
[Sourcify API documentation](https://docs.sourcify.dev/docs/api/index.html). An exact runtime match
does not establish publisher identity, but publisher attribution cannot cure an unrestricted mint.

### Recent tokens

No source match was available for any of the six recent counterparties or for the implementation
used by the four minimal proxies. Zero EIP-1967 slots do not rule out custom dispatch or custom
admin mechanisms, and a missing `owner()` getter does not prove that control is absent. The review
therefore records sensitive behavior as unknown and rejects the tokens without inventing a safety
assessment.

### Oracle and liquidity

One initialized observation cannot support a historical TWAP. A cardinality of 1 is a hard failure
for the intended risk-aware rebalance policy even when the pool exposes nonzero active liquidity.

Four mock-BUSD pools have cardinality 1000, but their latest initialized observations were already
about 11, 83, 90, and 115 days old at the anchor. More importantly, their counterparty can be freely
minted and arbitrarily burned. Their raw WBNB/token balances are retained as onchain facts, not
presented as value, capacity, or exit liquidity.

## Recommended next move

Do not force an existing pool into Milestone 1. The smallest defensible path is:

1. Obtain archive-complete WBNB factory events for the exact historical gap and apply the same
   source/control/oracle gates to any additional candidate.
2. Complete WBNB's retained Standard JSON input and exact local runtime reconstruction.
3. If the archive search still yields no qualifying pair, prepare—but do not deploy without user
   approval—a first-party, fixed-supply, non-upgradeable, no-admin test token and a clearly labelled
   testnet pool. Grow oracle cardinality and real history before enabling the rebalance write path.

Until those conditions are satisfied, an honest read-only fixture is stronger evidence than an
unsafe “live” activation.

## Limitations

- This report does not claim an exhaustive factory-lifetime search.
- It does not inspect non-WBNB pools.
- It does not infer safety from PancakeSwap configuration, token lists, names, symbols, balances, or
  explorer labels.
- It does not claim USD value, slippage capacity, market depth, price integrity, or performance.
- It does not establish a ProofEra-owned position, allowance, wallet, session, or execution
  authority.
- Public RPC retention and rate limits are external state and must be rechecked when reproducing the
  historical search.
