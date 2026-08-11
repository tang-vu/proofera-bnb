# BSC testnet WBNB source, runtime, and control verification

Checked: 2026-08-11 UTC

Contract: [`0xae13d989dac2f0debff460ac112a837c89baa7cd`](https://testnet.bscscan.com/address/0xae13d989dac2f0debff460ac112a837c89baa7cd#code)

Machine-readable evidence:
[`evidence/development/pancake-v3-testnet-wbnb-source-verification-2026-08-11.json`](../evidence/development/pancake-v3-testnet-wbnb-source-verification-2026-08-11.json)

Evidence SHA-256: `4bc0a265a26d48501877318299a5d4688fb5f939491c391aacad273dd386e53a`.

## Decision

**WBNB passes the strict token-component admission check.** Its exact compiler input reproduces both
the complete deployment transaction input and deployed runtime byte for byte, including Solidity's
metadata trailer. The authenticated code has no privileged or mutable control plane.

This closes the previously missing **WBNB side** of a prospective PTA/WBNB token-admission gate. It
does not admit a PTA token or a pool. A future pool still needs independent PTA source/control proof,
PancakeSwap factory and deployer lineage, usable liquidity, sufficient oracle cardinality/history,
and a fresh market-state review.

WBNB is a native-BNB wrapper, not a stablecoin. No stable-value or real-market-value claim is made
for Chapel testnet units.

## Canonical state anchor

The anchor was selected with `eth_getBlockByNumber("finalized", false)` at an official BNB Chain
Chapel endpoint. Code, balance, ERC-1967 storage, and core calls were immediately read with the
EIP-1898 object below:

```json
{
  "blockHash": "0xfaa9aafee29a16faaf49c1afb631218ef23cdb2e4530470d06a161bc73c04467",
  "requireCanonical": true
}
```

- Block: `124485947` (`0x76b813b`)
- Timestamp: `2026-08-11T16:17:28.000Z`
- Hash: `0xfaa9aafee29a16faaf49c1afb631218ef23cdb2e4530470d06a161bc73c04467`
- Header agreement: two named official seed endpoints, the official aggregate endpoint, and
  PublicNode all returned the same number, hash, and timestamp.
- The first official endpoint served the immediate EIP-1898 state reads. PublicNode repeated the
  pinned behavior reads and is also the archive source used to recover deployment history.

The official endpoint and chain/explorer values are documented in [BNB Chain wallet
configuration](https://docs.bnbchain.org/bnb-smart-chain/developers/wallet-configuration/) and the
[BNB Chain RPC endpoint list](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/).

## Exact source and creation lineage

A bounded historical search found the transition from no code at block `1,585,923` to code at
block `1,585,924`. The latter contains two transactions and one contract creation:

| Field                 | Value                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| Creation transaction  | `0x8df77b1ce87cfe5f8f35b77bf6946267dfe24ab94da2ec40d8fff1c6e1062d11`               |
| Creation block/hash   | `1,585,924` / `0x26b6b9ee92326823bb418cb469c38895b90aa9e89702c2dc41c9143e65e7a4d2` |
| Creation time         | `2020-09-03T07:49:11.000Z`                                                         |
| Deployer              | `0x4e656459ed25bf986eea1196bc1b00665401645d`                                       |
| Deployer nonce        | `1`                                                                                |
| Receipt / contract    | success / exact WBNB address                                                       |
| Transaction value     | `0`                                                                                |
| Creation input        | 3,504 bytes                                                                        |
| Constructor arguments | none                                                                               |

BscScan's indexed verified-source record identifies `WBNB`, compiler
`v0.4.18+commit.9cf6e910`, optimizer disabled with 200 runs, and default EVM. Direct scripted page
retrieval encountered HTTP 403, so the result was not accepted from the explorer label alone.

The source shape and whitespace were recovered with one finite matrix:

- six variants limited to the explorer-visible contract body, submission banners, and explorer
  license appendage;
- twelve plausible source-unit names, including the historical Remix `browser/` namespace;
- LF or CRLF; and
- final newline present or absent.

All 288 variants compiled to the same executable bytes. Exactly one reproduced the full metadata
and runtime:

| Input property                     | Exact value                                                          |
| ---------------------------------- | -------------------------------------------------------------------- |
| Source unit                        | `browser/WBNB.sol`                                                   |
| Target                             | `WBNB`                                                               |
| Source bytes                       | 1,793                                                                |
| Encoding                           | UTF-8, no BOM                                                        |
| Newline                            | LF                                                                   |
| Final newline                      | absent                                                               |
| Explorer banners/license appendage | absent                                                               |
| Source SHA-256                     | `0x5d5321f1058680235574f06826be8ab853d89538013c3144bb8f4ee32995d874` |
| Source Keccak-256                  | `0x6326feb0f89a7f5ba361a5abddae54f27e05657df4c260fda95c58f8ec80b6ae` |
| Optimizer                          | disabled, runs `200`                                                 |
| Libraries/remappings               | none / none                                                          |
| EVM version                        | compiler default                                                     |

The source bytes are embedded in
[`scripts/wbnb-source-verification/verify.mjs`](../scripts/wbnb-source-verification/verify.mjs).
A GitHub gist mirroring the explorer page was used only to accelerate whitespace discovery; it is
not an admission authority. The complete creation/runtime match authenticates the recovered bytes
under the compiler metadata and hash assumptions described by the [Solidity 0.4.18 metadata
documentation](https://docs.soliditylang.org/en/v0.4.18/metadata.html).

## Compiler and bytecode reproduction

The compiler came from the [official Solidity Windows manifest](https://binaries.soliditylang.org/windows-amd64/list.json):

| Artifact                     | Value                                                                |
| ---------------------------- | -------------------------------------------------------------------- |
| Archive                      | `solc-windows-amd64-v0.4.18+commit.9cf6e910.zip`                     |
| Manifest SHA-256             | `0xcdd99d6c9a43e87130e57ef44e03a55e38b9bb1ce4a1121b22815d5655c1653a` |
| Manifest Keccak-256          | `0x36749b20f7695b608e87d23db6f3750b150506da64262694b9ac6209a5542a04` |
| Extracted `solc.exe` SHA-256 | `0xf709c777ad5ba820200953e54b517ed1ec71542c47e9c98193d5a9c2fd3549d1` |
| Version output               | `0.4.18+commit.9cf6e910.Windows.msvc`                                |
| Invocation                   | `solc.exe --bin --bin-runtime --metadata browser/WBNB.sol`           |

| Output   | Bytes | Keccak-256                                                           | SHA-256                                                              | Onchain match |
| -------- | ----: | -------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------- |
| Creation | 3,504 | `0x7886a1cddc4249cd03bf41ce3f46b412732d7d7fd6e34a4a274a903df81f3594` | `0x1dd38a19dbc4ea04b114ee330b75aba1ccea7cccd4886a0a37e0e1d11aba696a` | Exact         |
| Runtime  | 3,124 | `0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6` | `0xe96eee25c3a063ffcfbe4ae2aa2c44e5c99ddf236adb7828676f6fd7f8605742` | Exact         |

The runtime is 3,081 executable bytes followed by this 43-byte Solidity 0.4.18 metadata trailer:

```text
0xa165627a7a72305820bcf3db16903185450bc04cb54da92f216e96710cce101fd2b4b47d5b70dc11e00029
```

Its `bzzr0` metadata hash is
`0xbcf3db16903185450bc04cb54da92f216e96710cce101fd2b4b47d5b70dc11e0`.
The generated metadata names the exact source unit, optimizer setting, empty libraries/remappings,
and source hash; the raw canonical metadata JSON is 3,203 bytes with SHA-256
`0x89ac26ab3eeba7f16f8b9872060e3cb509e13f4ffe801903f6a28513954cac6f`.

### Reproduce locally

Download the named compiler archive from the official manifest, verify the archive SHA-256 above,
extract `solc.exe`, then run:

```powershell
node scripts/wbnb-source-verification/verify.mjs --solc C:\absolute\path\to\solc.exe
```

The command must exit `0` and print `"pass": true`. It materializes the exact source only in a
uniquely named operating-system temporary directory, compiles it, checks source/compiler metadata,
creation/runtime hashes, metadata bytes, and opcode properties, then removes the three temporary
paths it created. It performs no RPC calls, signing, or transactions.

## Proxy and mutable-control review

The three standardized [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967) slots were all zero at
the canonical anchor:

- implementation: `0x360894…382bbc`;
- admin: `0xb53127…5d6103`; and
- beacon: `0xa3f0ad…133d50`.

The runtime is not an [ERC-1167](https://eips.ethereum.org/EIPS/eip-1167) minimal proxy. Linear
disassembly that skips PUSH immediate bytes found:

| Opcode/surface              | Count | Meaning                                                             |
| --------------------------- | ----: | ------------------------------------------------------------------- |
| `DELEGATECALL` / `CALLCODE` | 0 / 0 | No delegated implementation path                                    |
| `CREATE` / `CREATE2`        | 0 / 0 | No contract-spawning path                                           |
| `SELFDESTRUCT`              |     0 | No destruction path                                                 |
| `CALL`                      |     1 | Authenticated source maps it to native-BNB `transfer` in `withdraw` |
| `SSTORE`                    |     6 | Wrapper balances, allowances, and initial values                    |

The eleven dispatcher selectors are exactly `name`, `approve`, `totalSupply`, `transferFrom`,
`withdraw`, `decimals`, `balanceOf`, `symbol`, `transfer`, `deposit`, and `allowance`: six named
functions plus five public-variable getters. The fallback has no selector.
The extra pushed value `0xffffffff` is the unlimited-allowance sentinel, not a selector.

The authenticated source establishes these negative results:

| Surface         | Result | Note                                                    |
| --------------- | ------ | ------------------------------------------------------- |
| Owner/admin     | Absent | No privileged address or modifier                       |
| Arbitrary mint  | Absent | `deposit`/fallback issue only against `msg.value`       |
| Upgrade/proxy   | Absent | Exact source plus bytecode/slot checks                  |
| Pause/blacklist | Absent | No state or function surface                            |
| Transfer fee    | Absent | Transfers debit and credit the same `wad`               |
| Rebase          | Absent | No supply/balance scaling path                          |
| Recipient hook  | Absent | Token transfer has no external call                     |
| Asset recovery  | Absent | Unrelated BEP-20 sent to WBNB cannot be admin-recovered |

Unknown-selector calls such as `owner()`, `implementation()`, `paused()`, and `mint(address,uint256)`
return empty success because the payable fallback runs `deposit()` with zero value. That dynamic
result is deliberately **not** treated as proof of absence; exact source/runtime equality is the
proof.

## Pinned behavior and economics

Read-only calls at the canonical anchor returned:

| Probe                                                    | Result                        |
| -------------------------------------------------------- | ----------------------------- |
| `name()` / `symbol()` / `decimals()`                     | `Wrapped BNB` / `WBNB` / `18` |
| `totalSupply()`                                          | `274406463662505455475247`    |
| Native balance                                           | same raw value                |
| `approve(spender, 0)`                                    | `true`                        |
| `transfer(recipient, 0)`                                 | `true`                        |
| `transfer(recipient, 1)` from a zero-WBNB address        | reverted                      |
| `transferFrom(source, recipient, 0)`                     | `true`                        |
| Positive unapproved `transferFrom`                       | reverted                      |
| `deposit()` and fallback with 1 wei from a funded caller | succeeded in simulation       |
| `withdraw(0)` from a zero-WBNB EOA                       | succeeded in simulation       |
| `withdraw(1)` from the same EOA                          | reverted                      |

The wrapper mechanism is simple: `deposit` credits exactly `msg.value`; `withdraw` checks and
debits the caller before transferring the same native-BNB amount; transfers move equal ledger
amounts; and allowances are holder-controlled. It has no privileged monetary policy.

The economic caveats remain material:

- `totalSupply()` returns the contract's native balance, not a sum of `balanceOf`. Forced native-BNB
  transfers can therefore create surplus and make the reported total exceed issued ledger balances.
- `withdraw` uses Solidity `transfer` and its fixed gas stipend. A recipient contract with a costly
  or reverting receive path can be unable to redeem directly.
- The legacy `approve` interface has the familiar nonzero-to-nonzero allowance race. ProofEra should
  use exact, short-lived allowances and zero-before-change where applicable.
- The contract permits transfers to the zero address; those WBNB balances are economically
  unrecoverable.
- WBNB is denominated in volatile native BNB. On testnet, no monetary value is asserted.

## Evidence boundary

This review authenticates the code deployed at the WBNB address and its state at one finalized
anchor. It does not prove a historical sum-of-balances invariant, audit every possible chain/client
failure, price WBNB, or make any PTA/pool claim. Those are separate gates and must remain explicit.
