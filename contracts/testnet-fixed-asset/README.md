# ProofEra Test Asset (PTA)

`ProofEra Test Asset` (`PTA`) is a deliberately boring, non-economic ERC-20
fallback for ProofEra's BSC testnet integration work. It is not a stablecoin,
has no peg or redemption promise, has no market value, and must never be shown
as a mainnet or live economic asset.

The constructor mints exactly **1,000,000 PTA** (`1,000,000 * 10^18` base
units) once to an explicit nonzero recipient. The contract has 18 decimals and
no owner, admin, proxy, upgrade, mint-after-construction, burn, pause,
blacklist, transfer fee, hook override, permit, or recovery function. Its only
callable functions are OpenZeppelin's base ERC-20 interface. The constructor
itself rejects every chain ID except BSC testnet `97`, independently of the
offline preparation gate.

## Local verification

Requirements: Node.js `>=22.13.0` and Corepack-provided pnpm `11.20.0`.

```sh
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` checks formatting and JavaScript syntax, performs a clean exact-
settings compile, runs local Solidity behavior/fuzz tests, validates the
compiled ABI surface, tests the offline chain gate, and audits production
dependencies. Tests make no RPC calls.

For a strict no-network review, run `pnpm verify:offline`. It performs every
local gate above but intentionally omits the registry-backed dependency audit;
the full `pnpm verify` remains the package release gate when registry access is
authorized.

## Offline deployment preparation

Compile first, then provide the future supply recipient explicitly:

```sh
pnpm compile
pnpm prepare:deployment -- --chain-id 97 --recipient 0x1111111111111111111111111111111111111111
```

The script accepts only decimal chain ID `97` (BSC testnet), rejects zero or
malformed recipients, and rejects all signer, private-key, RPC, broadcast, and
unknown flags. It never reads environment variables, connects to a network,
signs, writes a transaction, or deploys. It prints deterministic unsigned
deployment data plus SHA-256 digests for the source, config, lockfile, Hardhat
artifact, build info, compiler settings, deployment bytecode, and recipient-
bound deployment data.

The last clean local result is retained as
[`evidence/local-build-2026-08-11.json`](./evidence/local-build-2026-08-11.json).
The test suite recomputes and compares every recorded digest, so source,
configuration, dependency, artifact, or bytecode drift fails verification.

The example recipient is a format example only. It is not an authorized future
recipient and must not be used without explicit confirmation.

## Offline PTA/WBNB pool preparation

Only after a separately approved PTA deployment has produced a real address,
prepare the narrow Pancake V3 BSC-testnet bootstrap review:

```sh
pnpm compile:pool-abi
pnpm prepare:pool -- --chain-id 97 --pta-address 0x1111111111111111111111111111111111111111
```

The address above remains a format example, not a deployed PTA claim. The tool
accepts only decimal chain ID `97` and an explicit nonzero PTA address distinct
from the pinned protocol addresses. It performs no RPC or filesystem write,
uses no environment or signer, and reads only six exact hash-pinned public
files retained under `vendor/pancake-v3/`. Its JSON is canonical-digest-bound
and always says `executionReady: false` and `signatureRequested: false`.

The JSON includes a review-only call tuple containing chain, target, calldata,
and zero native value. This is deliberately not a complete or serialized
transaction request and is neither an unsigned nor signed transaction
envelope; each distinction is represented by a separate boolean. Sender,
nonce, gas, fee, access list, broadcast window, and idempotency claim remain
unbound blockers rather than silently implied transaction fields.

The plan pins the retained official BSC-testnet deployment tuple:

- factory `0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865`;
- pool deployer `0x41ff9aa7e16b8b1a8a8dc4f0efacd93d02d071c9`;
- Nonfungible Position Manager
  `0x427bf5b37357632377ecbec9de3626c71a5396c1`; and
- WBNB `0xae13d989dac2f0debff460ac112a837c89baa7cd`.

The factory, deployer, and manager are parsed from the exact retained official
deployment Git blob. Initializer/factory signatures, indexed event layout, and
fee-tier spacing are separately parsed from exact retained official Solidity
Git blobs, hashed with a local Keccak implementation, and cross-checked by the
pinned compiler. The provenance manifest SHA-256 is
`8f8cf45cae3d3a8cc51bfb27f6602a7cd43220d4793f1c7a8801a42250758dc1`;
the five source/deployment byte hashes and Git blob IDs are recorded in
[`vendor/pancake-v3/PROVENANCE.json`](./vendor/pancake-v3/PROVENANCE.json).
These retained bytes are reproducible provenance, not fresh runtime identity.

It sorts PTA/WBNB by their exact address bytes and encodes only
`createAndInitializePoolIfNecessary(address,address,uint24,uint160)` at selector
`0x13ead562`, fee `500`, tick spacing `10`, zero native value, and
`sqrtPriceX96 = 2^96`. That square-root ratio means exactly one raw token1 unit
per raw token0 unit. Both reviewed token definitions expect 18 decimals, but
the ratio is still an arbitrary non-economic seed: it is not a market price,
peg, quote, valuation, oracle observation, or expected return.

The package separately compiles the exact retained official Solidity interfaces
and a narrow local pool-read interface, then tests compiler-derived selectors
against the independent source parser, Keccak implementation, and manual ABI
encoder. It also independently decodes every emitted initializer argument and
property-tests canonical address ordering. Generated validation artifacts stay
under `artifacts/pool-abi/` and `cache/pool-abi/`, so root lint and package
formatting never inspect generated declaration files.

Two inert, explicitly undeployed PTA address fixtures exercise both sides of
WBNB ordering. Their canonical plan digests, calldata digests, exact CLI byte
lengths, and CLI-output SHA-256 values are pinned in
[`evidence/pool-preparation-golden-digests-2026-08-12.json`](./evidence/pool-preparation-golden-digests-2026-08-12.json)
(file SHA-256
`2b0e40632d8704672304d38c64c9583b722a56618d07a5ee3f13cc199cd8a455`).
Tests run the real CLI with an empty child environment and require byte-for-byte
equality with in-process serialization. The runtime-source gate exact-
allowlists ordinary and bare static imports plus named/wildcard re-exports,
recursively resolves every reachable local module, and rejects dynamic imports,
filesystem writes, subprocess/DNS/datagram/network clients, WebSockets, and
direct or bracketed environment access.

No pool address is predicted. This package does not yet bind the exact Pancake
pool creation-code hash and deployer derivation, so guessing a CREATE2 address
would be unsafe. The manifest instead keeps separate open blockers for fresh
WBNB and Pancake code, deployed PTA code/source, pool CREATE2/factory lineage,
oracle history, liquidity, ownership, selector publication, Altana policy and
authority, the initializer's missing-deadline submission lifecycle, exact-call
simulation, and user confirmation.

The manager call also has a race: if another party initializes the pair before
inclusion, it can return the existing pool without re-enforcing this plan's
requested seed price. A future approved run must require a fresh zero
`factory.getPool` read, same-state identity checks, exact-call simulation,
explicit wallet confirmation, and strict post-receipt verification. The
official initializer has no deadline parameter or onchain time check. Any later
submission must therefore bind an exact sender and nonce, gas/fee/total-tBNB
caps, a short externally enforced broadcast window, a durable atomic one-shot
claim, double-submit/pending reconciliation, and explicit same-nonce
replacement/cancellation handling. Stale, duplicate, unexpected-nonce, or
ambiguously replaced mining is unsafe; an unmined cancellation is not final.

Ordinary transaction receipts do not contain Solidity function return data.
Only if this exact transaction creates the pool, the post-receipt gate requires
exactly one decoded `PoolCreated` log from the pinned factory and agreement
among its pool field, an independently proven CREATE2 prediction, fresh
`factory.getPool`, and fresh pool immutable/state getters. A pre-submission
`eth_call` or retained execution-trace return value is optional corroboration,
never receipt evidence. Even a successful initialization creates no position,
liquidity, useful oracle history, or activation eligibility. Approvals and
liquidity calldata are intentionally omitted until amount, minimum, deadline,
slippage, capital, recipient, and authority invariants can be independently
bound.

## Exact build and future explorer-verification inputs

- Contract: `src/ProofEraTestAsset.sol:ProofEraTestAsset`
- License: MIT
- Solidity compiler: `0.8.36` (use the exact long version emitted in the
  preparation manifest)
- EVM version: `paris`
- Optimizer: enabled, 200 runs
- `viaIR`: false
- Metadata bytecode hash: IPFS
- Constructor type: `address`
- Constructor value: the exact approved nonzero deployment recipient
- ABI-encoded constructor arguments: emitted by the preparation manifest
- Standard JSON compiler input: retained in Hardhat's matching
  `artifacts/build-info/solc-0.8.36-*.json` after a clean compile

Future API verification should use the current
[Etherscan API V2 source-verification endpoint](https://docs.etherscan.io/api-reference/endpoint/verifysourcecode)
with chain ID `97`, Solidity standard JSON input, license type `3` (MIT), and the
exact source tree, OpenZeppelin `5.7.0`, source-qualified contract name,
compiler long version, settings, and constructor arguments. The current
[supported-chains table](https://docs.etherscan.io/supported-chains) marks BSC
testnet `97` as paid-tier available and free-tier unavailable, so API
verification could incur a charge and must not be attempted without explicit
approval. A deployment address, transaction hash, block number, onchain runtime
bytecode digest, and explorer URL do not exist yet and must not be fabricated.

## Sources and limitations

See [RESEARCH.md](./RESEARCH.md) for primary sources, version rationale, and
limitations. OpenZeppelin is a reviewed upstream library, but neither that fact
nor these tests constitute a contract-specific external audit.
