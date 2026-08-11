# PancakeSwap V3 testnet source-verification boundary

Checked: 2026-08-11 UTC
Target: BSC testnet (`chainId 97`) `NonfungiblePositionManager` at
`0x427bF5b37357632377eCbEC9de3626C71A5396c1`

## Outcome

The retained work is strong enough to freeze the official source, compiler, build-output,
deployment, immutable, and historical runtime facts below. It is **not** enough to call the
target activation-ready.

The research handoff omitted the source-archive capture format/command, canonical compiler-input
SHA-256, canonical compiler-settings SHA-256, hosted raw build proof, and an authenticated
independent approval. The canonical code observation is also historical and its provider evidence
was not retained in this reproduction record. ProofEra therefore keeps the static record at
`static_research_incomplete_not_activation_ready`.

The strict builder in
`packages/integrations/src/pancake-v3-source-review.ts` accepts those missing items only through a
server-owned authenticated review configuration, never through request data. It additionally
requires a fresh, independently evidenced EIP-1898 observation of the exact manager, factory,
deployer, immutables, EIP-1967 slots, block number, and block hash. The maximum block age is 120
seconds and neither `latest` nor block-number fallback is accepted.

Even after those conditions pass, the builder currently returns
`source_review_ready_attestation_blocked`: its `target` is shaped for the domain write-target
manifest, but it deliberately emits no `proxyAssessment` and does not authorize execution. Domain
attestation schema v2 can represent a selector-scoped non-proxy assessment around the manager's
reviewed self-`DELEGATECALL`; the source builder still requires four distinct published selector
artifacts and a separate dispatcher-boundary artifact before it may construct that branch.

## Official source and compiler pins

The initial deployment/source commit is
[`ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57`](https://github.com/pancakeswap/pancake-v3-contracts/tree/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57).
The relevant files were byte-identical at the later repository pin
[`986847948755cba528324d41be19480731c36c2a`](https://github.com/pancakeswap/pancake-v3-contracts/tree/986847948755cba528324d41be19480731c36c2a),
whose [BSC testnet deployment JSON](https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscTestnet.json)
names the manager, factory, and pool deployer used here.

The reviewed source paths are the official
[`NonfungiblePositionManager.sol`](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-periphery/contracts/NonfungiblePositionManager.sol),
[`Multicall.sol`](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-periphery/contracts/base/Multicall.sol),
[periphery build configuration](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-periphery/hardhat.config.ts),
and [deployment script](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-periphery/scripts/deploy2.ts).
The corresponding core sources are
[`PancakeV3Factory.sol`](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3Factory.sol),
[`PancakeV3PoolDeployer.sol`](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3PoolDeployer.sol),
[`PancakeV3Pool.sol`](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3Pool.sol),
and the [core build configuration](https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/hardhat.config.ts).

| Item                       | Frozen value                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Solidity build             | `0.7.6+commit.7338295f`                                                                       |
| Official compiler list     | `https://binaries.soliditylang.org/windows-amd64/list.json`                                   |
| Compiler binary SHA-256    | `9214e06741c5cb51a61d745697c905f37480c0c8da1d5ac69e3bacda0063dfa5`                            |
| Compiler binary Keccak-256 | `4fbd020496c3a9e02c1eeb825d23f4d83d9198c4e21fda19deccdb7e74435edf`                            |
| EVM / IR / metadata        | `istanbul` / `viaIR=false` / `bytecodeHash=none`                                              |
| Optimizer runs             | manager `2,000`; factory `1,000,000`; pool and deployer `400`                                 |
| Manager artifact SHA-256   | `9e5bca807e38e9e8acadd81c5dec6668f847a7e3397d91b3afed74b066cfbb2a`                            |
| Manager build-info SHA-256 | `72adeccd4f25257a89d95d3e0f1d8b9b0e5ab8400b2b828bab236b786ae2c7aa`                            |
| Creation bytecode          | 25,445 bytes; Keccak-256 `0x7d67b6a4c37bcd57f4daa2257fca238ed918cb6294d1e5e9b4eccf87e34e25e9` |
| Runtime template           | 24,466 bytes; Keccak-256 `0x91d390a2f85270716bdc52a7782842724fee537f3f8c4e282ce31b98eea7807b` |
| Immutable-linked runtime   | 24,466 bytes; Keccak-256 `0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7` |

An archive digest `fa9d8efea22eec90b3cffce9f47a602af3b3aef539d2c2258faf3b87ff510fe8`
was returned by the research run, but its archive format, locator, and capture command were not.
It is retained as an unclassified observation and is **not** used as the domain
`sourceTreeSha256`. The raw compiler input and canonical settings digests were also not returned;
the artifact/build-info digests are not substituted for them.

## Deployment and immutable identity

The historical canonical observation was BSC testnet block `124471044`, hash
`0x214d1b1b3f7c724d32812c6829034dff989ff7e61dc580e46c5134053fb5aca6`, timestamp
`2026-08-11T14:25:41.000Z`. It is a reproduction anchor, not current freshness evidence.

| Role             | Address                                      | Runtime bytes | Runtime Keccak-256                                                   |
| ---------------- | -------------------------------------------- | ------------: | -------------------------------------------------------------------- |
| Position manager | `0x427bF5b37357632377eCbEC9de3626C71A5396c1` |        24,466 | `0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7` |
| Factory          | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` |         5,151 | `0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c` |
| Pool deployer    | `0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9` |        24,556 | `0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b` |

The manager's constructor immutables were:

- pool deployer `0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9`;
- factory `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`;
- wrapped native token `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd`;
- token descriptor `0xb099b459887bC759dBF0293E12D3DFcD0C456cff`.

The retained domain hashes were name hash
`0xc8147ae4d95e1ae5d91d5822a926bbc8b3167bc4efcba3aad25887e8d7e1ada0` and version hash
`0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6`.

## Proxy and delegatecall findings

The manager is not an EIP-1967 or minimal proxy. Its implementation, admin, and beacon slots were
zero at the historical block. The review found no minimal-proxy pattern, upgrade selector,
`CALLCODE`, or `SELFDESTRUCT`.

It did find one reachable `DELEGATECALL` at program counter `10522`, mapped to the official
`Multicall` base's self-delegatecall. This does not make the manager an upgradeable proxy, but it
does mean the current domain `non_proxy` claim `no_reachable_delegatecall` would be false. ProofEra
therefore does not manufacture that proxy assessment.

The frozen direct-write scope permits only these top-level manager signatures:

- `collect((uint256,address,uint128,uint128))`
- `decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))`
- `increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))`
- `mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))`

It denies `multicall(bytes[])`, `multicall(bytes32,bytes[])`, `multicall(uint256,bytes[])`, nested
calldata, and every unlisted selector. The direct-scope SHA-256 is exported by the builder and must
match the authenticated control-path review. Domain schema v2 represents the bounded
self-delegatecall through four exact direct-entrypoint analyses and an explicit denied-dispatcher
boundary. Those artifacts must still be content-addressed, published, independently re-fetched and
joined by the source builder; the schema alone does not complete the attestation.

The token descriptor is a separate EIP-1967 proxy with implementation
`0x769449da49D1Eb1FF44A6B366BE46960fDF46Ad6` and admin
`0x2eebb51c4ee4f6013ecc9e60dca1be1603c555ea`. It is a `tokenURI` metadata dependency only. Its
metadata remains untrusted, and neither the proxy nor implementation is approved as a manager
write target.

## Third-party fixture exclusion

Position `36761` and pool `0xe62112438bDC81d225bc35298d4829ac4fAc8945` remain read-only
development fixtures. The pool runtime hash was
`0x9d143766c2b4fe625e47e468e615fcab0317131e4634b8c3993292de8a5fcffd`, but the pair's reported
`XYU` token (`0x3a4a356381d3061d5f29013e8e12acfed701dba6`) and reported `TestUSDT` token
(`0xddf6c57e618f267c135f0c56da88091b95c54057`) lack complete retained runtime hashes and source
proof. ProofEra does not control the position. The position, pool, and both tokens are therefore
ineligible for activation regardless of manager-source readiness.

## Required completion and reproduction evidence

The builder remains blocked until a server-owned authenticated record supplies all of:

1. a SHA-256 of a `git archive --format=tar` capture from a verified clean checkout of the exact
   source commit, with separately hosted evidence;
2. canonical compiler-input and compiler-settings SHA-256 values;
3. hosted evidence for the exact reproducible build and immutable linking;
4. an authenticated independent reviewer identity, time, evidence digest, and explicit approval
   of only the frozen direct-call scope; and
5. a separate fresh exact-block observation whose evidence is not reused from any build or review
   artifact; and
6. four distinct direct-selector analysis artifacts plus the denied-multicall boundary, each bound
   to the exact runtime, source tree, compiler artifact and write scope and served from an eligible
   HTTPS/IPFS evidence locator.

The fresh observer must independently return the exact manager/factory/deployer code hashes and
lengths, manager immutables and three zero EIP-1967 slots from one canonical block hash. Its block
must be no more than 120 seconds old. `latest`, block-number fallback, cross-block assembly,
credentials in evidence URLs, accessors, extra fields, stale data, reused evidence, and any drift
all fail closed.

The bounded machine-readable research summary is
[`evidence/development/pancake-v3-source-reproduction-2026-08-11.json`](../evidence/development/pancake-v3-source-reproduction-2026-08-11.json).
It records no wallet, signature, session, approval, deployment, or transaction.
