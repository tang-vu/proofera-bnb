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

The `development/` subdirectory may contain clearly labelled toolchain/readiness records such as the Agent Studio doctor result, local verification summaries, and read-only cross-provider observations. For example, `pancake-testnet-code-observation-2026-08-11.json` records matching runtime-code observations while explicitly withholding reviewed-manifest status, `pancake-testnet-eip1898-capability-2026-08-11.json` records exact-block-selector provider support without treating it as an uptime or safety claim, and `pancake-testnet-position-authority-observation-2026-08-11.json` records an exact-block ownership/approval read for a third-party testnet NFT while explicitly denying ProofEra ownership or authority. Its SHA-256-bound raw replay record preserves the exact block header and ABI words; replay with the recorded clock establishes reproducibility, not current freshness. `pancake-testnet-static-context-observation-2026-08-11.json` similarly retains manager immutable and token-decimal words while explicitly withholding token trust and code-identity claims. `pancake-liquidity-quote-rounding-regressions-2026-08-11.json` records two deterministic SDK-compatible rounding cases that ProofEra blocks before activation; it is calculator regression evidence, not a live quote, pool observation, simulation, transaction, or performance claim. `pancake-v3-selector-paths/` contains deterministic local static-analysis artifacts for four direct manager selectors plus the denied multicall dispatcher; no file there has a qualifying public locator or reviewer approval. `pancake-v3-testnet-pool-candidates-2026-08-11.json` records a bounded 14-pool rejection with an explicit archive-history gap; it is not an exhaustive inventory or eligible-pool proof. `pancake-v3-testnet-wbnb-source-verification-2026-08-11.json` records the exact WBNB source/creation/runtime reproduction and its narrow token-component admission; it does not establish PTA, pool, price, liquidity, oracle, position, or authority evidence. The PTA build record and deterministic pool-preparation logic remain inside the isolated contract subtree. Its `pool-preparation-golden-digests-2026-08-12.json` uses inert undeployed address fixtures and pins only offline review-tuple serialization; it is not a complete transaction request, token deployment, pool, transaction, price, liquidity or authority record. Development records never count as transaction, deployment, performance, or live-agent evidence.

`bsc-testnet-deployer-wallet-2026-08-12.json` records only the public address and local custody/verification properties of a dedicated chain-97 deployment key. Its encrypted keystore and DPAPI-wrapped random password remain outside the repository. No RPC, balance lookup, funding, signature publication, transaction or deployment occurred, so the record is not onchain evidence and does not replace the separate Altana passkey/session-wallet ceremony.
