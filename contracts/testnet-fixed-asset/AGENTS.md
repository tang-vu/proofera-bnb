# ProofEra test asset package guide

This subtree is an isolated, BSC-testnet-only Solidity package. It must not be
added to a mainnet deployment path or represented as an economic asset.

## Commands

Run commands from `contracts/testnet-fixed-asset/`:

- `pnpm install --frozen-lockfile`: install the exact local dependency graph.
- `pnpm format:check`: check Markdown, JavaScript, JSON, YAML, and Solidity formatting.
- `pnpm lint`: syntax-check every JavaScript module.
- `pnpm compile`: compile with the pinned Solidity settings.
- `pnpm compile:pool-abi`: independently compile the narrow Pancake V3
  pool-read surface plus the exact retained official initializer/factory
  interfaces under ignored generated-output directories.
- `pnpm test`: compile, run local Solidity tests, and run offline Node.js tests.
- `pnpm verify:offline`: run every formatting, lint, clean-build, Solidity, ABI,
  and Node gate without contacting a registry or network.
- `pnpm verify`: run all local package gates and a production dependency audit.
- `pnpm prepare:deployment -- --chain-id 97 --recipient 0x...`: emit an
  unsigned, offline deployment-preparation manifest. It never connects to a
  network or reads a signer.
- `pnpm prepare:pool -- --chain-id 97 --pta-address 0x...`: after a separately
  approved PTA deployment, emit a deterministic, unsigned PTA/WBNB Pancake V3
  pool-creation/initialization review plan. It does not verify that address,
  request a signature, predict a pool address, or prepare approvals/liquidity.

## Boundaries

- Chain ID `97` is the only accepted preparation target and the only chain on
  which the constructor permits deployment.
- Never add an RPC URL, private key, mnemonic, account, signing plugin, or
  broadcast command to this package.
- Never read `.env`, `.studio`, wallets, keystores, or ignored secret state.
- Pool preparation may accept only chain ID `97` and an explicit deployed PTA
  address. Recipient/admin input is not applicable because initialization
  creates no position or ownership. Do not add RPC, sender, gas, nonce,
  approval, liquidity, deadline, signer, or broadcast CLI inputs. Because the
  official initializer has no deadline, a later separately reviewed execution
  bundle must bind exact sender/nonce, gas and tBNB caps, a short external
  broadcast window, an atomic one-shot claim, and replacement/cancellation
  reconciliation before this blocker can close.
- Runtime pool preparation may read only the six exact hash-pinned public files
  under `vendor/pancake-v3/` (the provenance manifest and five official Git
  blobs). Exact-allowlist every static import, bare import, named re-export, and
  wildcard re-export, and recursively scan every reachable local runtime
  module. Never add filesystem writes, dynamic imports, subprocesses,
  DNS/network clients, WebSockets, or direct/bracketed environment access.
- A plan emits a review-only `{ chainId, to, data, nativeValueBaseUnits }`
  tuple. It is not a complete or serialized transaction request and is neither
  an unsigned nor signed transaction envelope. Keep all four negative flags
  explicit in plan JSON and tests.
- Keep pool creation-code/CREATE2 output unresolved until an independently
  bound init-code hash and deployer derivation exist. A technical 1:1 raw-unit
  seed is non-economic and is never a price, peg, quote, oracle, or valuation.
- Never infer a returned address from an ordinary transaction receipt. For the
  new-pool-only plan, post-receipt evidence must reconcile the independently
  predicted address, fresh factory/pool getters, and exactly one decoded
  factory `PoolCreated` log from the creating transaction. An `eth_call` or
  retained trace return value is optional corroboration only.
- Keep all pool-preparation blockers explicit. In particular, a newly created
  pool has no decision-useful oracle history or liquidity and cannot be
  admitted to an activation path merely because initialization succeeded.
- The token has no owner, admin, proxy, upgrade, mint-after-construction, burn,
  pause, blacklist, fee, hook, permit, or recovery surface.
- Generated `artifacts/`, `cache/`, and `node_modules/` are local only.
- Any future deployment or explorer verification requires explicit user
  approval and must preserve the exact compiler inputs documented in README.

## Definition of done

Formatting, syntax checks, a clean exact-settings compile, Solidity behavior
tests, offline preparation tests, ABI-surface tests, and the production audit
must pass. The two fixture-only golden plans and actual CLI bytes must match
their pinned digests on both sides of WBNB address ordering. A prepared manifest
is not a deployment and must never be described as live or onchain evidence.
