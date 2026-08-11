# ProofEra LP Range reference agent

This workspace contains a deterministic, read-only PancakeSwap V3 LP range
evidence analyzer for BSC mainnet (56) and testnet (97). The deployed Studio
package is `app/agent` and exposes only `analyze_lp_range` over A2A and MCP.

It has no wallet, signer, Altana session, ERC-8183 or x402 seller, LLM, chain
tool, storage, or budget path. A future rebalance is owned by ProofEra's
separate scoped execution worker after explicit permission review; this
reference analyzer can only return decision support with
`executionEnabled:false`.

The production dependency graph excludes the commerce-capable Studio runtime.
A small local, route-allowlisted adapter preserves Agent Studio's bounded HTTP
envelope transport without importing its seller, payment, wallet, or signing
modules.

## Local verification

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm audit:prod
```

The Studio deployment context has its own lockfile. Verify it independently:

```sh
cd app/agent
corepack pnpm install --frozen-lockfile
```

Run locally with `corepack pnpm dev`. Before a testnet deployment, run the
current documented `bag doctor` and `bag deploy prepare` workflow from
`app/agent`. Verification here does not deploy, register, fund, or publish.
