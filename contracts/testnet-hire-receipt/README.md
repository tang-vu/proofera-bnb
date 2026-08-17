# ProofEra BSC-testnet hire receipt

This isolated contract produces paid, task-bound receipts for already registered ERC-8004 agents on chain 97. A successful `hire` transfers the complete bounded tBNB payment to the registry's current `ownerOf(agentId)` and emits an immutable `AgentHired` event. It has no administrator and retains no funds.

The receipt proves only that a named testnet engagement was paid and recorded. It is not escrow, execution authority, reputation, economic performance, mainnet availability, or proof that the agent completed the task.

Routine commands are offline:

```text
pnpm install --frozen-lockfile
pnpm verify:offline
```

`pnpm prepare:deployment --deployer ... --nonce ... --expires-at ... --source-commit ...` emits unsigned deployment and hire calldata only. Deployment and hire transactions require a separate exact approval covering chain, signer, nonce, bytecode, predicted address, task hashes, agent IDs, expiries, values, gas, and retry policy.

The operator-only `scripts/execute-approved.mjs` entry is intentionally absent from routine package scripts. It requires the exact approval ID, a digest-bound preparation committed under `evidence/termix/hire-preparations`, a clean published HEAD and no contract-scope drift from the preparation's source commit. Before every signature it rechecks both fixed RPCs, nonce, gas price and balance. It decrypts only the pinned current-user DPAPI custody artifact in a short-lived process, writes a public recovery journal before broadcast, sends through one fixed RPC, requires two-provider receipt agreement, checks deployed runtime bytes and validates every `AgentHired` event. An uncertain broadcast or receipt stops the sequence; it never blindly replaces or retries a transaction.
