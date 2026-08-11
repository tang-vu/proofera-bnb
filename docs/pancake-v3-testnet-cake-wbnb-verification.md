# PancakeSwap V3 BSC-testnet CAKE/WBNB admission verification

Checked at: `2026-08-11T15:20:36.006Z`
Network: BNB Smart Chain testnet (`chainId 97`, RPC chain ID `0x61`)
Candidate pool: `0xeaf78e3AA2C19dF9495318Cd9EA2aD83Be7D5015`
Fee tier: `500` hundredths of a basis point (`0.05%`)

> Subsequent update: the dedicated [WBNB reproduction](./pancake-v3-testnet-wbnb-source-verification.md)
> now proves the exact WBNB source, creation input, runtime, and control surface. That supersedes
> only this report's WBNB provenance gap. CAKE's unrestricted mint, the one-observation pool, and
> the composed pool rejection remain unchanged.

## Decision

**`BLOCKED_NOT_M1_WRITE_ELIGIBLE`**. ProofEra must not admit this CAKE/WBNB pool as
the Milestone 1 reference write pool.

The pool, factory, and pool deployer are exact, direct deployments reproducible from an official
PancakeSwap source commit. That static identity result does not make the composed write target
safe. The CAKE contract is an official testnet **dummy token**, has `uint256.max` total supply, and
its exact verified source exposes `mint(address,uint256)` without an access-control modifier. The
pool also has only one oracle observation, so it has no decision-useful historical TWAP window.
These are independent fail-closed reasons.

| Component               | Source/compiler/runtime result                                                                                                                                                                                                                             | Owner, admin, and proxy result                                                                                                                                                                                          | ProofEra M1 decision                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fee-500 pool            | **Pass (static identity):** local build plus all six immutable patches matched all 22,962 deployed bytes                                                                                                                                                   | Direct contract; all three EIP-1967 slots zero; not EIP-1167; no opcode-level `DELEGATECALL`, `CALLCODE`, or `SELFDESTRUCT`. Pool control functions are reachable by the factory/factory owner.                         | **Blocked as a write pool:** CAKE fails, observation cardinality is `1`, and the factory owner can change fee protocol and LM-pool dependencies. Read-only fixture use only.             |
| WBNB                    | **Static behavior pass, strict provenance non-ready:** BscScan reports an exact-source match for Solidity `0.4.18`; the runtime and ABI were inspected, but the raw explorer compiler input was not retained and an exact local rebuild was not completed. | Direct contract; zero EIP-1967 slots; not EIP-1167; no opcode-level `DELEGATECALL`, `CALLCODE`, or `SELFDESTRUCT`; verified ABI/source expose no owner, mint, pause, blacklist, transfer-fee, or upgrade surface.       | **Non-ready under the strict source-retention rule.** No adverse runtime behavior was found, but this report does not elevate explorer metadata into a locally reproducible attestation. |
| CAKE                    | **Fail:** BscScan reports an exact-source match for Solidity `0.6.12`, but the raw compiler input was not retained; more importantly, exact source and read-only calls establish non-economic dummy-token behavior.                                        | Direct contract; zero EIP-1967 slots; not EIP-1167; no opcode-level `DELEGATECALL`, `CALLCODE`, or `SELFDESTRUCT`. `owner()` is nonzero, and a separate `mint(address,uint256)` overload is public without `onlyOwner`. | **Ineligible.** It cannot support capital, return, price, slippage, or LP-performance claims.                                                                                            |
| Composed CAKE/WBNB pool | Exact Pancake pool lineage is established, but one token fails economic eligibility and both token source inputs are not retained locally.                                                                                                                 | The pool is non-upgradeable, but mutable protocol-owner dependencies remain.                                                                                                                                            | **`BLOCKED_NOT_M1_WRITE_ELIGIBLE`.** No wallet request, approval, signature, manager call, or transaction is authorized by this record.                                                  |

Symbols and decimals below are retained only as untrusted metadata. None of these decisions was
inferred from a name, symbol, logo, or address-label match.

## Canonical observation anchor

All historical state in this report was read at one EIP-1898 block-hash selector:

| Field                                    | Value                                                                |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Block number                             | `124476377` (`0x76b5bd9`)                                            |
| Block hash                               | `0x19a4a9461ceee76a834868d94822f61e5a40b8f9ca48654ac85d6041d331f290` |
| Parent hash                              | `0x5c70407344d82fd9a62827138b876948bb5e301235627719e62310dd7d0b3482` |
| Block timestamp                          | `2026-08-11T15:05:41.000Z` (Unix `1786460741`)                       |
| Historical-state transport               | `https://bsc-testnet-rpc.publicnode.com`                             |
| Independent official header confirmation | `https://bsc-testnet.bnbchain.org`                                   |

The PublicNode endpoint returned this block for `eth_getBlockByNumber("finalized", false)`. Every
historical code, storage, balance, and `eth_call` query then used
`{"blockHash":"0x19a4...f290","requireCanonical":true}`; no numbered or `latest` fallback was
accepted. The official BNB Chain endpoint independently returned the same header and `0x61` chain
ID, but could not serve this historical state because its archive trie was unavailable. It is
therefore a header confirmation, not the source of the state values.

As a drift check, the official endpoint returned latest block `124478199`, hash
`0x97ca41416efef5ff18d0ef05689ce72d4c63de13ce0f11df422ecea6e71e100e`, timestamp
`2026-08-11T15:19:21.000Z`; the pool, factory, deployer, WBNB, and CAKE code hashes still matched
the pinned observation. This later check is supporting evidence only and is not mixed into the
canonical state snapshot.

## Official source and exact core reconstruction

The source pin is PancakeSwap's official
[`pancake-v3-contracts`](https://github.com/pancakeswap/pancake-v3-contracts) repository at commit
[`ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57`](https://github.com/pancakeswap/pancake-v3-contracts/tree/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57),
tree `a5f9c90fce18ca4cdb0716322f254881aa626ed0`, committed at
`2023-04-03T11:05:53Z`. GitHub reports the commit as unsigned (`verified=false`, reason
`unsigned`); its location under the official PancakeSwap organization is provenance, not a
cryptographic publisher signature.

The exact source capture command was:

```text
git archive --format=tar --output=<output.tar> ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57
```

The archive was `9,912,320` bytes with SHA-256
`b3cd0b3fd4563287f587c2776eac78e5b5a4ad98f6c805a005df10727bee782d`.
The isolated checkout was clean after compilation; generated outputs were ignored by that source
repository.

The official BSC-testnet deployment file at the same commit names the factory and pool deployer:

- factory: `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`;
- pool deployer: `0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9`;
- position manager, assessed separately: `0x427bF5b37357632377eCbEC9de3626C71A5396c1`.

The exact local build commands were:

```text
corepack yarn install --frozen-lockfile --ignore-scripts --non-interactive
corepack yarn workspace @pancakeswap/v3-core compile
```

The build used Node `24.14.1`, Yarn `1.22.22`, Hardhat `2.13.0`, and solc
`0.7.6+commit.7338295f`. Hardhat warned that the local Node release was unsupported; that warning
is retained as an environment limitation, while the exact deployed-byte comparison is the output
check. The official Solidity Windows compiler artifact was
`solc-windows-amd64-v0.7.6+commit.7338295f.exe`, SHA-256
`0x9214e06741c5cb51a61d745697c905f37480c0c8da1d5ac69e3bacda0063dfa5`, Keccak-256
`0x4fbd020496c3a9e02c1eeb825d23f4d83d9198c4e21fda19deccdb7e74435edf`.

Core compiler settings were `evmVersion=istanbul`, `viaIR=false`, metadata
`bytecodeHash=none`, optimizer enabled, with `400` runs for pool/deployer and `1,000,000` runs for
factory. Compiler-input and settings digests use SHA-256 of UTF-8 compact JSON with object keys
sorted recursively and array order preserved. This is an explicitly named local canonicalization,
not an RFC 8785 claim.

| Contract                | Artifact SHA-256                                                   | Build-info SHA-256                                                 | Canonical compiler-input SHA-256                                   | Canonical settings SHA-256                                         |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `PancakeV3Pool`         | `09fee2650f298c458f4b8b71ecc01f3e13ee0b7b38ab653de6168d6e3b5fd4de` | `abaaa7d5ebebfada61fa431bbcbbbbdfc922186e5979014ab00eadef0b85774e` | `3721ef156c7088f0f244e4625de97336dc64fc11fe63fceed8fe704be1a6b5ca` | `87a5fecad1294a4400cb04e12e79d584400d89527258d3a011f8e8e3a16b0680` |
| `PancakeV3Factory`      | `a075f3314718f871cfe2370090b553ed0efa3fe7061a4f8be468542d7e433731` | `683326f6490b1a9850d5e62f48b6b946b2aebd6b0c2ac6bcc084e33e6c5e4b2c` | `74bb2f58facb94e6f95b383dbb2c80a0ee5a7a54a11a03d287045b49354a1516` | `9e00cb07c6a848d7c90d9722f5fa9c5bbd777a06589906fad7ede013ed1786ef` |
| `PancakeV3PoolDeployer` | `80136db21993e3dcfe3326a61fedd290f86622fbf572ac1b5c71e52f29b9602a` | `e8b9d4ed4eb68b70523800e2c463e030e713130e463ad5fefe46300ad6f30274` | `56f4a6aa554a4480d46d359e49a3aa570bcc3d6e373b599f00591b456ff6d66c` | `87a5fecad1294a4400cb04e12e79d584400d89527258d3a011f8e8e3a16b0680` |

### Pool reconstruction

The local pool creation code is `23,566` bytes, Keccak-256
`0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2`.
The unlinked runtime template is `22,962` bytes, Keccak-256
`0x4ef16dfd4d3a1481e945e15d2579e8fb74f78cc27678875fdee9b06eed2e86ac`.
Patching every compiler-reported reference for the following six immutables reproduced the full
observed runtime byte-for-byte:

| Immutable             | Exact value                                  |
| --------------------- | -------------------------------------------- |
| `factory`             | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` |
| `token0`              | `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd` |
| `token1`              | `0xFa60D973F7642B748046464e165A65B7323b0DEE` |
| `fee`                 | `500`                                        |
| `tickSpacing`         | `10`                                         |
| `maxLiquidityPerTick` | `1917569901783203986719870431555990`         |

The patched and observed runtime is `22,962` bytes, Keccak-256
`0x829cb2fca10db13c6c7f0a1a576e7e5d812e1209a8c5aa516924de8d34bcc13f`.
The machine-readable evidence records every immutable byte offset.

The source deployer uses salt
`keccak256(abi.encode(token0,token1,fee)) =
0x9f4899b3fcc0331140c69ffc65ca544db9f89d1b2f889dfb1ed16c427cd7ad99`.
`CREATE2(0x41ff...71c9, salt, keccak256(pool creation code))` derives exactly
`0xeaf78e3AA2C19dF9495318Cd9EA2aD83Be7D5015`. At the canonical block:

- factory `getPool(WBNB, CAKE, 500)` returned the candidate pool;
- pool `factory()` returned the official factory;
- deployer `factoryAddress()` returned the official factory; and
- the deployer's transient `parameters()` tuple was fully cleared to zero.

The deployer's `setFactoryAddress` source is a one-time initializer with no caller restriction.
It is already initialized to the exact factory and cannot be changed through that function; this
is a historical initialization risk, not a current upgrade path.

### Runtime and proxy assessment

| Contract      | Runtime bytes | Observed runtime Keccak-256                                          | Result                                                             |
| ------------- | ------------: | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Pool          |        22,962 | `0x829cb2fca10db13c6c7f0a1a576e7e5d812e1209a8c5aa516924de8d34bcc13f` | Exact local source reconstruction after immutable linking          |
| Factory       |         5,151 | `0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c` | Exact local source reconstruction after deployer-immutable linking |
| Pool deployer |        24,556 | `0xedd527f11646c1912dfc51b57ffa0ee27972f8798bcaf7bc68ae6ad054b6022b` | Exact local runtime match                                          |

For all three contracts, the EIP-1967 implementation, admin, and beacon slots were zero; no
EIP-1167 minimal-proxy pattern was present. A linear EVM disassembly that skipped `PUSH0` through
`PUSH32` data found no executable `DELEGATECALL`, `CALLCODE`, or `SELFDESTRUCT`. This establishes
direct, non-upgradeable deployments for the exact observed code; it does not remove their external
token, LM-pool, or owner-controlled call dependencies.

## Pool state and administrative dependencies

All values are raw contract state at the canonical block.

| Field                                  | Observed value                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `fee` / `tickSpacing`                  | `500` / `10`                                                                                           |
| `liquidity`                            | `38646829250992288858564901`                                                                           |
| `sqrtPriceX96`                         | `509142844683514237961255732673170284`                                                                 |
| `tick`                                 | `313533`                                                                                               |
| observation index / cardinality / next | `0` / `1` / `1`                                                                                        |
| packed fee protocol                    | `222825800` (`3400` for each token-side field)                                                         |
| unlocked                               | `true`                                                                                                 |
| `lmPool()`                             | zero address                                                                                           |
| pool WBNB balance                      | `2322443369138505808` raw = `2.322443369138505808` with reported 18 decimals                           |
| pool CAKE balance                      | `19413749622293206442236079206181` raw = `19413749622293.206442236079206181` with reported 18 decimals |

Nonzero liquidity and balances establish only that state exists. They do not establish a fair
price, economic value, exit liquidity, sustainable fee yield, or safe execution capacity. With
cardinality `1`, the pool has no historical observation window suitable for ProofEra's quote,
slippage, manipulation, or performance evidence.

Factory state was:

- `owner()` = `0x261af0030618a52fa767997ed310174b3bc3b77f`;
- `lmPoolDeployer()` = `0x7f1745eb74d26877ec54dd9a317cc930ad01350c`;
- fee `500` tick spacing = `10`;
- fee extra info: whitelist requested `false`, enabled `true`.

Official source gives the factory owner `setFeeProtocol` and `collectProtocol` authority and gives
the owner or LM-pool deployer `setLmPool` authority. `lmPool()` was zero at the anchor, but it is a
mutable external dependency and must be rechecked immediately before any future action. A code
hash match alone cannot freeze this state.

## Token verification

### WBNB - static behavior pass, strict source provenance non-ready

Address: `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd`

- Reported metadata only: name `Wrapped BNB`, symbol `WBNB`, decimals `18`.
- Runtime: `3,124` bytes; Keccak-256
  `0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6`.
- BscScan exact-match record: `WBNB`, compiler `v0.4.18+commit.9cf6e910`, optimizer disabled
  (the explorer UI displays `200` runs), default EVM version.
- The verified ABI/source contains deposit, withdrawal, allowance, and plain transfer behavior.
  It exposes no owner/admin, arbitrary mint, pause, blacklist, transfer fee, external hook, or
  upgrade method.
- EIP-1967 implementation/admin/beacon slots are zero; the code is not EIP-1167; executable-code
  scanning found no `DELEGATECALL`, `CALLCODE`, or `SELFDESTRUCT`.
- At the anchor, `totalSupply()` was
  `274401811448479839890777` raw and exactly equaled the contract's native BNB balance, consistent
  with the wrapper invariant at that block.

The official solc archive entry is
`solc-windows-amd64-v0.4.18+commit.9cf6e910.zip`, SHA-256
`0xcdd99d6c9a43e87130e57ef44e03a55e38b9bb1ce4a1121b22815d5655c1653a`, Keccak-256
`0x36749b20f7695b608e87d23db6f3750b150506da64262694b9ac6209a5542a04`.

ProofEra still marks WBNB **non-ready under this report's strict provenance rule**: the raw
BscScan compiler input, source filename/metadata inputs, and locally rebuilt exact runtime were not
retained. Calling unlisted selectors such as `owner()` against this payable-fallback contract
returns empty bytes; that behavior must not be misrepresented as an implemented function or a
zero-valued owner.

### CAKE - economic/write eligibility fail

Address: `0xFa60D973F7642B748046464e165A65B7323b0DEE`

- Reported metadata only: name `PancakeSwap Token`, symbol `Cake`, decimals `18`.
- Runtime: `8,796` bytes; Keccak-256
  `0x6b9d0521473366d6a5e75ddacee104389f35f6f877fc08dc3aa339400e71a828`.
- BscScan exact-match record: `CakeToken`, compiler `v0.6.12+commit.27d51765`, optimizer enabled
  with `99,999` runs, default EVM version.
- EIP-1967 implementation/admin/beacon slots are zero; the code is not EIP-1167; executable-code
  scanning found no `DELEGATECALL`, `CALLCODE`, or `SELFDESTRUCT`.
- The exact source's normal transfer path has no transfer tax, blacklist, or pause branch and
  contains no upgrade surface. Those absences do not make the token economically suitable.
- `owner()` returned `0x1ED62c7b76AD29Bfb80F3329d1ce7e760aAD153d`.
- Exact source declares `mint(address _to, uint256 _amount) public` without `onlyOwner`.
  A read-only simulation from non-owner `0x000000000000000000000000000000000000dEaD`
  calling `mint(dead,0)` succeeded. `mint(dead,1)` reached arithmetic and reverted with
  `SafeMath: addition overflow`, rather than an access-control error.
- `totalSupply()` was
  `115792089237316195423570985008687907853269984665640564039457584007913129639935`, exactly
  `uint256.max`. Thus positive minting currently fails through saturation; the unguarded mint path
  and maximum pre-mint remain explicit design/economic-integrity failures, not evidence of active
  inflation at the anchor.
- PancakeSwap's current official MasterChef V2 migration documentation explicitly calls this
  address a **dummy token** and shows the same public mint surface.

The official solc archive entry is
`solc-windows-amd64-v0.6.12+commit.27d51765.zip`, SHA-256
`0x7a1874cff4cae30b9ee0509631ddae34a8aa573cb2a6104f25e4a6a63ab3ad5f`, Keccak-256
`0xd5642aecd13b6af819b70e1e2a4e642ad0b481356275d6ed5ff5b77f125d4fc4`.

As with WBNB, the raw explorer Standard JSON input was not retained. A local source hypothesis was
not an exact runtime match and is not used as evidence. CAKE is therefore both strict-source
non-ready and, independently, **economically ineligible**.

## Why M1 writes remain blocked

1. **CAKE is not an economic asset fixture.** Official documentation and verified code identify a
   dummy, maximum-supply token with an unguarded mint overload. Pool ratios, fees, APR, PnL,
   slippage, and impermanent-loss claims would be misleading.
2. **There is no robust oracle history.** Observation cardinality `1` cannot support a historical
   TWAP or the price-manipulation controls expected of a financial write path.
3. **Important runtime dependencies are mutable.** The protocol owner/LM deployer can change fee
   protocol and LM-pool state even though the pool bytecode is non-upgradeable.
4. **Token source retention is incomplete.** Explorer exact-match labels were not converted into
   locally reproduced, retained compiler inputs for WBNB or CAKE.
5. **This report does not authorize the position manager.** The separately reviewed manager has a
   bounded self-`DELEGATECALL` multicall model and still needs an authenticated, fail-closed
   write-target attestation for the exact allowed selectors.
6. **No ProofEra-controlled position or write evidence exists here.** No authority proof, scoped
   session, approval, quote, wallet confirmation, receipt, or revoke receipt was created.

Allowed use is limited to a clearly labeled, read-only **official PancakeSwap testnet dummy-pool
fixture**. It must not appear as a live economic agent result or benchmark input.

No official-source, economically suitable BSC-testnet alternative pair was established during
this bounded research. Other CAKE/WBNB fee tiers inherit the same CAKE failure. Previously observed
unrelated test-token pools lack complete token/runtime provenance. This report intentionally did
not expand into a broad pool search.

## Reproduction methodology and boundaries

The read-only procedure was:

1. Pin `eth_getBlockByNumber("finalized", false)` and independently confirm the exact header on the
   official BNB Chain endpoint.
2. Use EIP-1898 `blockHash` plus `requireCanonical=true` for every `eth_getCode`, `eth_getStorageAt`,
   `eth_getBalance`, and `eth_call` state query.
3. Capture the exact official Git tree with `git archive`, install the frozen dependency graph with
   lifecycle scripts disabled, and compile only the V3 core workspace.
4. Hash artifacts, build-info, compiler inputs, settings, creation code, runtime templates, and
   observed runtime. Link every compiler-reported immutable reference and require a byte-for-byte
   full-runtime match.
5. Recompute the deployer's CREATE2 address and cross-check the pool/factory/deployer getter graph.
6. Read EIP-1967 implementation, admin, and beacon slots and perform PUSH-aware opcode scans so
   opcode-looking bytes inside immediate data were not counted.
7. Inspect explorer-verified token source and ABI, probe only explicit getters and read-only call
   simulations, and separate metadata from behavior.

The raw JSON-RPC requests and local one-off analysis programs were not retained as standalone
files; their exact block selector, methods, arguments, outputs, build commands, digest algorithm,
and reconstruction values are preserved in this document and the accompanying JSON. This is a
reproducibility limitation and one reason the record grants no execution authority.

No wallet, private key, environment/configuration secret, signature, approval, deployment, funded
position, transaction, or paid API was used.

## Primary source URLs

- Deployment manifest:
  <https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/deployments/bscTestnet.json>
- Pool source:
  <https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3Pool.sol>
- Factory source:
  <https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3Factory.sol>
- Deployer source:
  <https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3PoolDeployer.sol>
- Core compiler configuration:
  <https://github.com/pancakeswap/pancake-v3-contracts/blob/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/hardhat.config.ts>
- GitHub commit verification endpoint:
  <https://api.github.com/repos/pancakeswap/pancake-v3-contracts/commits/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57>
- Official Solidity compiler manifest:
  <https://binaries.soliditylang.org/windows-amd64/list.json>
- WBNB explorer source:
  <https://testnet.bscscan.com/address/0xae13d989dac2f0debff460ac112a837c89baa7cd#code>
- CAKE explorer source:
  <https://testnet.bscscan.com/address/0xfa60d973f7642b748046464e165a65b7323b0dee#code>
- PancakeSwap dummy-token documentation:
  <https://docs.pancakeswap.finance/welcome-to-pancakeswap/how-to-guides/v3-v2-migration/migration/masterchef-v2>
- Official BNB Chain testnet RPC used for independent header/current-code confirmation:
  <https://bsc-testnet.bnbchain.org>
- PublicNode BSC-testnet RPC used for canonical historical state:
  <https://bsc-testnet-rpc.publicnode.com>

The bounded machine-readable record is
[`evidence/development/pancake-v3-testnet-cake-wbnb-verification-2026-08-11.json`](../evidence/development/pancake-v3-testnet-cake-wbnb-verification-2026-08-11.json).
