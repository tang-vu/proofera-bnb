# ProofEra evidence

This directory holds reproducible, non-secret evidence for judged claims. It must never contain fabricated transaction hashes, invented benchmark output, private keys, session signers, wallet passwords, API keys, or encrypted keystores.

Each evidence run will use a manifest containing:

- stable run ID and task definition;
- environment and git commit;
- source URLs/contracts, chain ID, wallet/agent public addresses;
- UTC start/end and source-observed timestamps;
- exact inputs, constraints, and software versions;
- raw output file hashes;
- transaction/API receipt identifiers;
- calculation methodology and quality rubric;
- known limitations and whether the result is live, testnet, simulation, or fixture.

Nothing is submission evidence until its manifest validates and its external links have been manually checked.

The `termix/preregistrations/` subdirectory contains exactly three local, schema-validated experiment protocols. Every real input, identity, endpoint, release commit and timed runner that does not yet exist is explicitly `UNBOUND`; both agent and manual states are `NOT RUN`, and publication is false. Their SHA-256 definition digests detect local edits but are not public timestamps, results, receipts or proof of agent advantage. Future runs use new run-ID directories and may not overwrite a protocol after either method starts.

The `development/` subdirectory contains clearly labelled toolchain/readiness records, read-only cross-provider observations, and narrowly scoped testnet transaction evidence. Each file's own `recordType`, status, boundaries and limitations control what it proves. Most development records are not transaction, deployment, performance or live-agent evidence. The sole current deployment exception is `bsc-testnet-pta-deployment-2026-08-12.json`, which records the finalized chain-97 PTA receipt/runtime/token state and explicitly does not prove a pool, price, liquidity, oracle, position, activation, performance result or mainnet action.

For example, `pancake-testnet-code-observation-2026-08-11.json` records matching runtime-code observations while explicitly withholding reviewed-manifest status, `pancake-testnet-eip1898-capability-2026-08-11.json` records exact-block-selector provider support without treating it as an uptime or safety claim, and `pancake-testnet-position-authority-observation-2026-08-11.json` records an exact-block ownership/approval read for a third-party testnet NFT while explicitly denying ProofEra ownership or authority. Its SHA-256-bound raw replay record preserves the exact block header and ABI words; replay with the recorded clock establishes reproducibility, not current freshness. `pancake-testnet-static-context-observation-2026-08-11.json` similarly retains manager immutable and token-decimal words while explicitly withholding token trust and code-identity claims. `pancake-liquidity-quote-rounding-regressions-2026-08-11.json` is calculator regression evidence, not a live quote, transaction, or performance claim. `pancake-v3-selector-paths/` contains deterministic local static-analysis artifacts and no qualifying public locator or reviewer approval. `pancake-v3-testnet-pool-candidates-2026-08-11.json` records a bounded 14-pool rejection with an explicit archive-history gap. `pancake-v3-testnet-wbnb-source-verification-2026-08-11.json` records the exact WBNB source/creation/runtime reproduction. The PTA build record and deterministic pool-preparation logic remain inside the isolated contract subtree; their inert golden fixtures are not the live deployment or pool evidence.

`bsc-testnet-deployer-wallet-2026-08-12.json` records only the public address and local custody/verification properties of a dedicated chain-97 deployment key. Its encrypted keystore and DPAPI-wrapped random password remain outside the repository. The server-only readiness probe's focused suite and one opt-in local Windows unlock/address check pass, but the probe creates no signer, signature, transaction, or RPC result. No balance lookup, funding, signature publication, transaction or deployment occurred, so the record is not onchain evidence and does not replace the separate Altana passkey/session-wallet ceremony.

`bsc-testnet-pta-deployment-observation-2026-08-12.json` is the earlier read-only state record. At its timestamp, two official BNB testnet endpoints agreed on chain `97`, the finalized block, zero balance and nonce, empty signer/target code, unused predicted CREATE address, gas price/estimate, and the exact 1,826-byte PTA runtime returned by `eth_call`. The record remains `blocked` with `INSUFFICIENT_BALANCE`, contains no secret or raw signed transaction, and is not authenticated provider provenance, signing approval, a broadcast, deployment, or receipt. Its envelope hash is null because no funded envelope was validated. The later deployment does not retroactively turn this historical record into an envelope or transaction.

`bsc-testnet-pta-funding-2026-08-12.json` records the later finalized `0.1 tBNB` transfer, corroborated transaction/receipt/block data, and the then-unused deployer nonce and CREATE target from two official BNB testnet RPCs. The BscScan URL is retained only as a public reference because its Cloudflare challenge prevented automated page parsing. This historical record proves funding at that time, not the subsequent deployment, pool, activation or any mainnet action.

`bsc-testnet-pta-deployment-2026-08-12.json` records the subsequent exact nonce-`0` contract creation. Two official BNB testnet RPCs agree on the finalized receipt and canonical block; code, balance and token state are independently bound to an exact common finalized block with EIP-1898 `blockHash + requireCanonical` because the public endpoints had pruned historical state at the deployment block. The record includes no private key, password or raw signed transaction. It proves the chain-97 PTA deployment and fixed token state only—not an eligible pool, liquidity, price, oracle, LP position, Altana authority, performance result or mainnet action.
