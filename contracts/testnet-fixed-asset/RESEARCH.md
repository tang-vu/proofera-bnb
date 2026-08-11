# Test asset research record

Checked on 2026-08-11 UTC. Only primary project and chain documentation was
used for implementation decisions.

## Findings and decisions

- [BNB Chain JSON-RPC documentation](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/)
  identifies BSC testnet as chain ID `0x61`, decimal `97`. The preparation gate
  accepts only the explicit decimal string `97`, and the constructor separately
  rejects every other chain ID; there is no configured RPC or remote network.
- [Hardhat 3 Solidity-test documentation](https://hardhat.org/docs/guides/testing/using-solidity)
  says Solidity tests are built in and require no plugin. That is the smallest
  test surface for this package. Hardhat is exact-pinned to stable release
  [`3.11.1`](https://github.com/NomicFoundation/hardhat/releases/tag/hardhat%403.11.1),
  which fixed overlapping Solidity source/test classification. The July 30,
  2026 `3.12.0` feature release is newer but its negative filtering and
  experimental Amsterdam additions are unnecessary for this isolated package.
- [Hardhat's Node.js support policy](https://hardhat.org/docs/reference/nodejs-support)
  requires Node.js `22.13.0` or later and supports maintained even-numbered
  releases. The package declares that minimum; validation used Node.js 24.
- [Hardhat compiler configuration documentation](https://hardhat.org/docs/guides/writing-contracts/configuring-the-compiler)
  supports exact compiler and optimizer settings. Solidity is exact-pinned to
  `0.8.36`, optimizer enabled with 200 runs, `viaIR: false`, IPFS metadata, and
  conservative `paris` EVM output.
- [Solidity 0.8.36's official announcement](https://www.soliditylang.org/blog/2026/07/09/solidity-0.8.36-release-announcement/)
  describes two medium-severity compiler security fixes. The exact pragma and
  compiler avoid affected earlier releases and prevent silent compiler drift.
- [OpenZeppelin's fixed-supply ERC-20 guide](https://docs.openzeppelin.com/contracts/5.x/erc20-supply)
  recommends creating supply with `_mint` in construction. The exact-pinned
  audited-release package is `@openzeppelin/contracts@5.7.0`; only its base
  `ERC20` implementation is inherited.
- [OpenZeppelin Contracts v5.7.0](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.7.0)
  is a stable signed release, not an RC. OpenZeppelin also warns that library
  use is not a substitute for a contract-specific audit.
- [Hardhat's artifact reference](https://hardhat.org/docs/reference/artifacts)
  documents the ABI, bytecode, and split build-info inputs used by the offline
  preparation manifest and digest checks.
- [Etherscan API V2 source verification](https://docs.etherscan.io/api-reference/endpoint/verifysourcecode)
  supports Solidity standard JSON input and requires chain ID, the
  source-qualified contract name, compiler long version, optimization settings,
  EVM version, license, and encoded constructor arguments.
- Etherscan's current [supported-chains table](https://docs.etherscan.io/supported-chains)
  marks BNB Smart Chain Testnet chain `97` as available on the paid tier and not
  available on the free tier. API verification could therefore incur a charge;
  no API key, plan, or submission is configured, and any such action requires
  explicit approval.
- `prettier-plugin-solidity` is exact-pinned to mature release `2.4.0`; the
  isolated workspace's one-day maturity policy rejected same-day patch `2.4.1`.

## Retained Pancake V3 preparation bindings

These bindings come from ProofEra's retained primary-source review; the offline
preparation command itself never contacts GitHub, an explorer, or an RPC.

An offline retention and reproducibility pass was completed on 2026-08-12 UTC
from an already present detached official checkout; it did not fetch network
data. Exact LF Git blob bytes are retained under `vendor/pancake-v3/` under
their upstream GPL-2.0-or-later license. The provenance manifest SHA-256 is
`8f8cf45cae3d3a8cc51bfb27f6602a7cd43220d4793f1c7a8801a42250758dc1`.

- Pancake's retained BSC-testnet deployment JSON at commit
  [`986847948755cba528324d41be19480731c36c2a`](https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscTestnet.json)
  identifies the factory, pool deployer, and Position Manager used by the
  preparation plan. The separately reconstructed core at reviewed commit
  [`ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57`](https://github.com/pancakeswap/pancake-v3-contracts/tree/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57)
  binds the exact initializer/factory declarations and factory fee-tier
  implementation. Five exact retained Git blobs carry independent byte length,
  recomputed Git blob SHA-1, and SHA-256 pins in
  `vendor/pancake-v3/PROVENANCE.json`; runtime parsing derives the addresses,
  declarations, indexed `PoolCreated` layout, and factory fee tiers from those
  bytes rather than from a copied local ABI.
- The repository-retained WBNB proof at
  `evidence/development/pancake-v3-testnet-wbnb-source-verification-2026-08-11.json`
  has file SHA-256
  `4bc0a265a26d48501877318299a5d4688fb5f939491c391aacad273dd386e53a`.
  It closes the historical source/creation/runtime reconstruction only. A fresh
  exact-block runtime and proxy-slot binding remains mandatory.
- A local Keccak-256 implementation derives
  `0x13ead562` for
  `createAndInitializePoolIfNecessary(address,address,uint24,uint160)`,
  `0x1698ee82` for `getPool(address,address,uint24)`, and `0x22afcccb`
  for `feeAmountTickSpacing(uint24)` from declarations parsed out of the exact
  retained source. Solidity 0.8.36 independently compiles the same retained
  official interfaces, while a separate manual static-ABI encoder/decoder
  checks the emitted words.
- The retained initializer implementation has no `deadline` parameter and no
  onchain time check. A later execution bundle must therefore bind sender,
  nonce, gas and total-tBNB caps, a short offchain broadcast window, a durable
  one-shot claim, pending/double-submit reconciliation, and same-nonce
  replacement/cancellation policy. Offchain expiry cannot make already signed
  calldata expire onchain; stale, duplicate, or ambiguous mining is unsafe.
- An ordinary successful transaction receipt contains logs and status, not the
  Solidity function return value. When this new-pool-only transaction is the
  creator, its receipt must contain exactly one matching factory `PoolCreated`
  log. The decoded pool address must agree with an independently proven CREATE2
  prediction plus fresh factory and pool getters. Return data from `eth_call` or
  an explicitly retained trace is optional corroboration only.
- For fee tier `500`, retained Pancake configuration expects tick spacing `10`.
  The plan does not treat that constant as fresh chain state: its exact
  preflight read must decode the factory result to signed `int24(10)`.
- `sqrtPriceX96 = 2^96` represents a raw token1/token0 ratio of exactly `1` and
  initial tick `0`. Because PTA has no economic value, this is only a technical
  initialization seed. It supplies no market or oracle evidence.
- Pool address prediction is withheld. It requires an independently bound pool
  creation-code hash, CREATE2 salt derivation, exact deployer, and subsequent
  factory/immutable agreement. A familiar or remembered init-code hash is not
  acceptable evidence.
- A newly initialized V3 pool does not have decision-useful observation history
  or liquidity. Observation cardinality/history and manipulation resistance
  must mature and be evidenced before the pool can support LP analysis, and a
  separate bounded plan is required before any approval or liquidity mint.
- Fixture-only golden outputs cover a PTA address below and above WBNB. The
  retained evidence file SHA-256 is
  `2b0e40632d8704672304d38c64c9583b722a56618d07a5ee3f13cc199cd8a455`;
  tests pin canonical plan/calldata digests and the exact bytes emitted by the
  real CLI without treating either fixture as deployed or authorized.

## Explicit limitations

- No deployment, RPC read, transaction, signing, explorer verification, or
  external audit was performed.
- Local generic EVM tests do not prove behavior of a future BSC testnet
  deployment. A deployed address and receipt are unknown until an explicitly
  approved deployment occurs.
- `PTA` has no peg, redemption promise, market value, price source, liquidity,
  governance, or economic rights. It is strictly a disposable test asset.
- The ABI test covers exact ERC-20 signatures, selectors, input/output types,
  and mutability, and the runtime scanner rejects external-call, creation,
  proxy, and destruction opcodes. These checks are not formal verification of
  every bytecode property or of OpenZeppelin's upstream implementation.
