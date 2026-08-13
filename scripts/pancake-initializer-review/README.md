# Pancake V3 initializer selector review

This offline tool reproduces the local control-path review for the direct BSC-testnet Position
Manager call
`createAndInitializePoolIfNecessary(address,address,uint24,uint160)` (`0x13ead562`). It binds the
pinned official source commit, compiler input/settings, manager artifact, immutable-linked manager
runtime, retained two-provider runtime bytes, source/bytecode path, external write scope, mutable
dependencies, and the explicit denial of every multicall wrapper.

It does not contact a network, inspect environment configuration, load a wallet, construct a
transaction, request a signature, or broadcast. `--write` writes only the fixed local evidence path;
`--check` performs no writes.

From the repository root, with the already compiled clean PancakeSwap checkout used by the retained
selector review:

```powershell
node scripts/pancake-initializer-review/generate.mjs --source-root <clean-compiled-source-root> --check
node --test scripts/pancake-initializer-review/review.test.mjs
```

Use `--write` only to regenerate the canonical evidence intentionally. A local artifact remains
non-authorizing: it must be published at a stable content-addressed HTTPS/IPFS locator,
independently re-fetched byte-for-byte, and bound to an authenticated independent review before it
can satisfy the publication gate. Fresh exact-block preflight, a bounded execution envelope, and
separate explicit user confirmation also remain mandatory.
