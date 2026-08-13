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

Use `--write` only to regenerate the canonical evidence intentionally. The retained artifact was
later published without modification at a revision-pinned, digest-named public Gist and separately
re-fetched byte-for-byte; those later facts are joined through the external publication manifest and
retrieval receipt so this historical file is not rewritten. The publication records remain
non-authorizing because no authenticated independent reviewer is bound to the exact public scope.
Fresh exact-block preflight, a bounded execution envelope, and separate explicit user confirmation
also remain mandatory.
