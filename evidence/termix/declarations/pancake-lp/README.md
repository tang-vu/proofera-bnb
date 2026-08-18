# Frozen Pancake LP declarations

Each JSON artifact is create-only and binds one published source release, the retained canonical
input, ERC-8004 identity and a future BSC-testnet block used for run-order randomness. The block
hash is intentionally unknown when the declaration is committed. A later two-provider capture
must prove the finalized hash and resolve its least-significant bit before either timed run.

These artifacts do not prove a hire, a run, a result, position ownership or execution authority.

`68dc21421c60-125719944.json` was the first attempt to re-freeze after the earlier runner correctly refused protected release-scope drift. Full verification completed too slowly for BSC testnet's observed block rate: commit `6e65763` was published only after head `125720478`, so randomness block `125719944` was already known. This artifact is retained as failed preparation and must never select run order.

`6e657638c684-125722978.json` is the replacement commitment on source release `6e657638c6846e909171b3abd365c396da5f4d53`, declaration SHA-256 `811f485549e1894ed237d167d85cd17f33610fac951c13862e07f09daa815df9`, for randomness block `125722978`. It preserves the unchanged LP input and was published with the larger margin before that block. At 12 confirmations both fixed RPCs agreed on block hash `0xe297ebf26262cacf660ea90b5626c341c39c3df15b1ed71ac7cb16a4f37a46c6`; least-significant bit `0` fixes the order to agent then manual. The retained `.run-order.json` proves only that selection and claims no completed run or result.

The resulting agent-first attempt produced no capture because PublicNode had
pruned the frozen mainnet state. `fd5d0e54eb0f-125727528.json` is the next
replacement, source release `fd5d0e54eb0f61ce2aa411cf695fffbf17586798`,
declaration SHA-256
`8ceacb8b116af3e97873185888835bd48ed0862771db66aad0f93e3275769a4f`.
It preserves the input digest while binding the reviewed OnFinality archive
replay lane and future BSC-testnet randomness block `125727528`. It remains a
declaration only until publication ordering, finality and run order are proven.
The published commitment later resolved at 12 confirmations: both fixed RPCs
agreed on block hash
`0xb721583badb2d8de9a1dd6d1705644d646781259c811800a477d901fc30c80f4`;
least-significant bit `0` fixes the order to agent then manual. The retained
`.run-order.json` claims no completed run or result.
