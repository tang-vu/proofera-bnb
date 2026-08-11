# Pancake V3 selector-path reproducer

This local-only tool regenerates ProofEra's four direct-selector review artifacts and the separate
multicall boundary artifact from the exact PancakeSwap V3 periphery source/build retained during
the 2026-08-11 review.

It performs read-only local source, Git, artifact, AST, source-map, dispatcher, immutable-linking,
and opcode checks. It never reads environment configuration, contacts a network, loads a wallet,
or submits a transaction.

Create the exact local build in PowerShell. Use a fresh destination and Node.js `16.19.1`, the
official repository pin:

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

The first uncached Hardhat compile needs read access to the official Solidity compiler
distribution. The generator fails unless the compiler version, input, settings, artifact,
immutable-linked runtime, source archive, and compile-only config all match their pinned digests.
It does not trust package names or compiler output merely because compilation succeeds.

Then, from the ProofEra repository root:

```powershell
node scripts/pancake-selector-review/generate.mjs --source-root <clean-source-root> --check
node --test scripts/pancake-selector-review/review.test.mjs
```

Use `--write` instead of `--check` only when intentionally regenerating the committed canonical
JSON. The committed compile-only config SHA-256 is
`0xceeccf77dc8340ca344ad99bf12f710cf864c02f99400beb88e247d4191c1f5b`.

The selector-review build-info SHA-256 is
`0xff2166c707d60e451ff80e6096d9b2e792eb23a27d27964299ec203fb8d763b7`, while an earlier bounded
research record retained `0x72adeccd4f25257a89d95d3e0f1d8b9b0e5ab8400b2b828bab236b786ae2c7aa`.
The earlier raw file was not retained, so this review does not invent a byte-level explanation
for the different Hardhat container hash. It uses the current exact local build-info and records
the older hash only as provenance. The manager artifact, runtime template, linked runtime, and
compiler version agree with the earlier retained facts; this run additionally binds the exact
compiler input and settings.

These artifacts are manual/static analysis support, not formal proofs. Local paths are
deliberately ineligible as domain evidence locators until the exact bytes are published at a
stable content-addressed HTTPS/IPFS URL, independently re-fetched, and bound into an authenticated
review.
