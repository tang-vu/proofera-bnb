# ProofEra BSC-testnet hire receipt

This isolated contract produces paid, task-bound receipts for already registered ERC-8004 agents on chain 97. A successful `hire` transfers the complete bounded tBNB payment to the registry's current `ownerOf(agentId)` and emits an immutable `AgentHired` event. It has no administrator and retains no funds.

The receipt proves only that a named testnet engagement was paid and recorded. It is not escrow, execution authority, reputation, economic performance, mainnet availability, or proof that the agent completed the task.

Routine commands are offline:

```text
pnpm install --frozen-lockfile
pnpm verify:offline
```

`pnpm prepare:deployment -- ...` emits unsigned deployment and hire calldata only. Deployment and hire transactions require a separate exact approval covering chain, signer, nonce, bytecode, predicted address, task hashes, agent IDs, expiries, values, gas, and retry policy.
