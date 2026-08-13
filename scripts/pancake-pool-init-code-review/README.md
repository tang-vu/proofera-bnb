# Pancake V3 pool init-code review

This directory contains the offline, fail-closed reproduction used to bind PancakeSwap V3 pool
creation code and the BSC-testnet pool deployer path. It performs no RPC call, wallet operation,
signature, simulation or transaction.

The retained Standard JSON inputs include the exact Solidity source contents and settings consumed by
the pinned compiler. PancakeSwap V3 source is GPL-2.0-or-later and remains attributed to the official
[`pancakeswap/pancake-v3-contracts`](https://github.com/pancakeswap/pancake-v3-contracts) repository at
commit `ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57`.

The official checkout used Windows CRLF line endings. The source-binding evidence covers all 61
distinct compiler sources and verifies that converting only CRLF to LF produces the exact named Git
blob bytes at that commit. This makes the checkout transformation explicit instead of treating a
line-ending-normalized source as an unexplained byte match.

## Offline verification

Run the deterministic tests from the ProofEra repository root:

```text
node --test scripts/pancake-pool-init-code-review/review.test.mjs
```

To independently rerun the retained inputs, obtain the official Windows Solidity compiler named
`solc-windows-amd64-v0.7.6+commit.7338295f.exe`. The verifier rejects it unless both its SHA-256 and
Keccak-256 match the pinned official release values:

```text
node scripts/pancake-pool-init-code-review/verify-solc.mjs \
  --verify-retained-standard-json <absolute-path-to-pinned-solc.exe>
```

`capture.mjs` is a maintainer-only, create-once reproduction command. It requires an installed clean
checkout of the exact official commit, re-archives the Git tree, invokes the compile-only Hardhat
configuration, independently reruns both Standard JSON inputs with the pinned compiler, and refuses
to overwrite committed evidence. Its checkout and compiler path arguments are local locators and are
not retained in evidence.

## Claim boundary

The result closes only the previously narrow compiler/artifact blocker: the exact pool creation-code
hash is reproducible, the compiled PoolDeployer runtime is byte-equal to the retained two-provider
chain-97 observation, the factory runtime becomes byte-equal after patching its compiler-reported
immutable deployer reference, and the same CREATE2 inputs reproduce the known factory-authenticated
CAKE/WBNB pool plus the conditional PTA/WBNB candidate.

It does not prove current chain state, create a PTA/WBNB pool, establish a market price, add liquidity,
or authorize a write. Fresh preflight, simulation, explicit transaction confirmation, receipt and
post-state reconciliation remain separate requirements.
