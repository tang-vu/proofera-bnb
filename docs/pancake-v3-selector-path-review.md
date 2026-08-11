# PancakeSwap V3 PositionManager selector-path review

Checked: 2026-08-11 UTC
Review timestamp: `2026-08-11T15:55:00.907Z`
Target: BSC testnet (`chainId 97`) `NonfungiblePositionManager`
`0x427bf5b37357632377ecbec9de3626c71a5396c1`

## Decision

The four frozen direct selectors have distinct, deterministic local source-path, bytecode-path,
and whole-artifact digests. None of their manager-local compiled path closures maps to a
`DELEGATECALL`, `CALLCODE`, `SELFDESTRUCT`, or `Multicall.multicall` definition. The compiled
runtime does contain one self-`DELEGATECALL`, at program counter `10522`, reachable through
`multicall(bytes[])` (`0xac9650d8`). ProofEra must deny that selector, both known multicall
overloads, nested calldata, and every unlisted selector.

This package is **not formal proof and is not activation-ready evidence**. It is local static
analysis support. The exact bytes have no stable public HTTPS/IPFS locator and have not been
independently re-fetched or approved. Pool and token code, callback-time token behavior, current
position authority, fresh chain code, and session-policy enforcement remain separate gates.

## Exact bindings

Every artifact binds the same reviewed inputs:

| Binding                     | Exact value                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| Official source commit      | `ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57`                           |
| `git archive` SHA-256       | `0xb3cd0b3fd4563287f587c2776eac78e5b5a4ad98f6c805a005df10727bee782d` |
| Compiler                    | `0.7.6+commit.7338295f`                                              |
| Canonical compiler input    | `0x086382b3301a745dae7d0b66878cd1c1a4433cf7b1d7725efc546511811b3c38` |
| Canonical compiler settings | `0xa1af16a691f74364a753be9855c4f0865f1fef27a515a65ee0a866c991a6c1a1` |
| Manager artifact SHA-256    | `0x9e5bca807e38e9e8acadd81c5dec6668f847a7e3397d91b3afed74b066cfbb2a` |
| Local build-info SHA-256    | `0xff2166c707d60e451ff80e6096d9b2e792eb23a27d27964299ec203fb8d763b7` |
| Runtime length              | `24,466` bytes                                                       |
| Runtime-template Keccak-256 | `0x91d390a2f85270716bdc52a7782842724fee537f3f8c4e282ce31b98eea7807b` |
| Linked-runtime Keccak-256   | `0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7` |
| Direct write-scope SHA-256  | `0x3a80eb853ccea37b7a1d04430a015d22941fd7a7cd2d8ab9d31b896fc74d5218` |

The source-tree archive binds the official repository. The compiler-input digest separately
binds dependency source content resolved during the build. The linked runtime is reconstructed
from compiler immutable references using the retained BSC-testnet deployer, factory, WBNB,
descriptor, EIP-712 name hash, and version hash. Its Keccak-256 matches the retained historical
runtime observation; a fresh EIP-1898 observation is still required before a write.

The manager address is deliberately serialized in lowercase because the canonical integration
write scope hashes the exact `JSON.stringify` bytes, including address case. Substituting the
checksummed spelling produces a different digest and is rejected by a regression test. This is a
serialization binding, not a claim that differently cased address strings identify different EVM
accounts.

The compile-only configuration is committed at
`scripts/pancake-selector-review/hardhat.proofera.config.cjs`, SHA-256
`0xceeccf77dc8340ca344ad99bf12f710cf864c02f99400beb88e247d4191c1f5b`. The analysis timestamp
is a pinned record of when this review was performed, not the regeneration time. The generator
always emits `2026-08-11T15:55:00.907Z`, so repeated `--check` runs cannot change content merely
because the clock advanced.

### Build-info provenance difference

The earlier bounded research record reported raw manager build-info SHA-256
`0x72adeccd4f25257a89d95d3e0f1d8b9b0e5ab8400b2b828bab236b786ae2c7aa`; this selector review's
locally reproduced raw build-info is
`0xff2166c707d60e451ff80e6096d9b2e792eb23a27d27964299ec203fb8d763b7`. A Hardhat build-info file
is a larger compiler input/output container, not the contract artifact itself. The earlier raw
bytes were not retained, so the byte-level cause of the differing container digest cannot be
established and is deliberately not guessed.

The older digest is kept as provenance only and is not used as this package's build-info binding.
What is independently checkable and agrees is the manager artifact SHA-256, compiler version,
runtime-template hash/length, and immutable-linked runtime hash/length. This reproduction also
binds and rechecks the canonical compiler input and settings hashes shown above. A future reviewer
must not substitute either build-info hash for those narrower bindings.

## Direct selector results

The bytecode figures below are source-map closure findings, not claims that every listed opcode is
executed in one transaction. Optimizer-shared code may appear in more than one closure.

| Operation           | Selector     | Wrapper / body PC | Source definitions | Branch nodes | Mapped effects           | Path result            |
| ------------------- | ------------ | ----------------: | -----------------: | -----------: | ------------------------ | ---------------------- |
| `mint`              | `0x88316456` |   `1458` / `7743` |                 28 |           37 | 5 `CALL`, 2 `STATICCALL` | no mapped delegatecall |
| `increaseLiquidity` | `0x219f5d17` |   `1072` / `4362` |                 17 |           34 | 5 `CALL`, 2 `STATICCALL` | no mapped delegatecall |
| `decreaseLiquidity` | `0x0c49ccbe` |    `978` / `2414` |                 16 |            1 | 1 `CALL`, 1 `STATICCALL` | no mapped delegatecall |
| `collect`           | `0xfc6f7865` |  `1880` / `11644` |                 14 |            5 | 2 `CALL`, 1 `STATICCALL` | no mapped delegatecall |

`mint` and `increaseLiquidity` are not manager-only straight-line actions. Their reviewed closure
includes the synchronous continuation from `IPancakeV3Pool.mint` into
`pancakeV3MintCallback`. The callback recomputes and validates the pool from the pinned deployer
and pool key before paying token amounts, then reaches token calls through `pay` and
`TransferHelper`. That is why both artifacts contain additional `CALL` sites. A malicious or
unreviewed pool/token can still invalidate transaction-level safety, so an eligible exact pool
and exact token-code review remains mandatory.

Other decision-critical findings:

- `mint` has no existing-position authorization check. The token pair, fee, ticks, amounts,
  minima, recipient, and deadline must all be bound by policy and preview.
- `increaseLiquidity` does not require the caller to own the position; the callback payer funds
  the increase. Token ID, amount bounds, and deadline must be fixed before authorization.
- `decreaseLiquidity` uses `isAuthorizedForToken` and a deadline, then calls the pool derived from
  the stored pool key. Liquidity and minimum output amounts remain mandatory bounds.
- `collect` uses `isAuthorizedForToken` but has no deadline. Its recipient and maximum amounts
  must be exact; a zero recipient is converted to the manager address.

## Multicall boundary

The current compiler method table and runtime dispatcher expose only:

- `multicall(bytes[])` → `0xac9650d8`, wrapper PC `1653`, body PC `10371`;
- its caller-controlled loop reaches `address(this).delegatecall(data[i])` at PC `10522`.

The following are absent from this exact runtime but remain denied as defense in depth against a
different overload or future target:

- `multicall(uint256,bytes[])` → `0x5ae401dc`;
- `multicall(bytes32,bytes[])` → `0x1f0464d1`.

The denied-boundary artifact distinguishes “observed reachable self-delegatecall” from “absent
here but policy-denied.” It does not pretend all three overloads were observed.

## Canonical artifacts

The [manifest](../evidence/development/pancake-v3-selector-paths/manifest.json) binds each exact
UTF-8/LF canonical JSON file:

Each whole-file SHA-256 is over the raw file bytes, including exactly one final LF. Tests remove
that LF in memory and confirm the digest changes; the digest is not merely over a parsed object.

| Artifact                 | Whole-file SHA-256                                                   | Source-path SHA-256                                                  | Bytecode-path SHA-256                                                |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `mint.json`              | `0x0741664264ff3a4e86fe2077a1ad03a412487309f3634025fa5c43dc7ece7f65` | `0xdddb7ad83aa59bbb306f007d8435c7a4615fa83066035d53ff26d30727974e0b` | `0x68a21ced45b73b37bd89e8ad6421973320e1bf3b9efb492cedbe86bcd5b12d92` |
| `increaseLiquidity.json` | `0x6e2a6b333f7ff6de165ac2395760f5c1d45c690d84080501e968104d7544e82c` | `0x2c1339710ad758c07126f5124f400cdaf1fc3f1fd15d0217d5c3f5656c4d303d` | `0xd808d574ec35eca703fb9887cfa4ebdfd00f6f0c5e170554e8e824cf8b9d36d5` |
| `decreaseLiquidity.json` | `0x18aaede8efa67561ce9e8b4371d5f0b39a5e6370a7bedcf4da16ef2487b92ac9` | `0x3c3816ac37e1aab3ec55b6b670d17b4e742773eb5587488bcabd96053e949aab` | `0x35005375f912263e702bd734114abaa6b8f67454d8a34e52d707bc83c9964982` |
| `collect.json`           | `0xf44d33f64e296a8c094b064bd6c09c9ec0fd75956be816447c80302c2b19e71e` | `0x2eb7bb2c824cbc2e89ddd2e2de0daffee875eb43aed00d730741555e16d04740` | `0xfcc26666a7296f25b9508305e81f96ee3f71cd1bed48cf3d5e52297ebecc3c57` |
| `denied-multicalls.json` | `0xb202c17f6ad5fa598a30039b84bc334c832ee67a2df03a1cc711e7786e065707` | `0x95db52d6f8db01ebb90b259db6fea01c3a4120f47f97e594e1bb4a4ebfb68ba5` | `0xc1ccf2af8df00a47c2490812343681ec5c55a458f1101acfcaf3dddc53deac29` |

Each direct artifact records the exact AST definition closure, source slices and hashes, call
edges, branch inventory, low-level calls, compiled dispatcher entry, ABI decoder and body jump,
source-map/opcode intersection, mapped effect instructions, and the runtime-wide delegatecall
boundary.

## Reproduction

Use Node.js `16.19.1` (the official repository pin), Git, and Corepack Yarn `1.22.22`. From
PowerShell, create a fresh checkout and compile with the committed network/account-free config:

```powershell
git clone --no-checkout https://github.com/pancakeswap/pancake-v3-contracts.git <clean-source-root>
git -C <clean-source-root> checkout --detach ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57
Push-Location <clean-source-root>
corepack yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive
Pop-Location
Copy-Item -LiteralPath <proofera-root>/scripts/pancake-selector-review/hardhat.proofera.config.cjs -Destination <clean-source-root>/projects/v3-periphery/hardhat.proofera.config.js
Push-Location <clean-source-root>/projects/v3-periphery
corepack yarn@1.22.22 hardhat compile --config hardhat.proofera.config.js
Pop-Location
```

The first uncached compile requires read access to Hardhat's official Solidity compiler
distribution. No deployment or wallet is involved. Then run from the ProofEra root:

```powershell
node scripts/pancake-selector-review/generate.mjs --source-root <clean-source-root> --check
node --test scripts/pancake-selector-review/review.test.mjs
```

Intentional regeneration uses `--write`. The generator verifies the committed compile-config
digest, source commit, deterministic Git archive, compiled local source against the commit
(allowing only line-ending normalization), raw artifact/build-info digests, canonical compiler
input/settings, immutable-linked runtime, signature selectors, method table, dispatcher, source
map, and forbidden opcodes before writing. It performs no network, wallet, deployment, or
user environment or machine-configuration access; it reads only the committed compile-only
configuration named above.

Before these files can satisfy the domain evidence locator, publish the exact bytes at stable
content-addressed HTTPS/IPFS locations, independently re-fetch each file, verify the whole-file
digest, and bind an authenticated reviewer approval to this exact runtime and write scope. Until
then, activation remains blocked.
