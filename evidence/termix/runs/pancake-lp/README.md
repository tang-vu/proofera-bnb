# Pancake LP TermiX captures

The production agent CLI writes one create-only canonical capture per run ID
to this directory. No run exists yet. A capture is unreachable until the
shared declaration is release-bound, the repository is clean and published,
the LP agent has a registered ERC-8004 identity, and a hire receipt has been
independently verified.

The runner rechecks the frozen Pancake `slot0` state at the exact block hash,
then invokes the fixed public LP A2A endpoint. It has no wallet, signer,
approval, transaction, broadcast, or evidence-overwrite path.

The matching manual runner writes separately under `manual/`; it consumes a
bounded operator NDJSON stream and makes no network or agent request itself.

The first invocation bound to the valid `125722978` agent-first order produced
no capture: its exact-hash PublicNode replay failed closed because that provider
had pruned the historical state. A separate read-only probe reproduced the
provider error. The source evidence remains bound to the endpoint that captured
it; a later declaration must separately bind a reviewed archive replay endpoint
before retrying the timed method.

The replacement candidate is OnFinality's documented, rate-limited public BNB
endpoint, `https://bnb.api.onfinality.io/public`. The provider's BNB support page
at `https://documentation.onfinality.io/support/bnb-chain` explicitly lists
archive access and `eth_call`; a bounded probe returned the expected canonical
`slot0` ABI result for the frozen block hash. This is capability evidence, not
an uptime guarantee or a completed timed run.

`pancake-lp-agent-20260818-v3.json` is a real create-only agent-first capture,
but it is excluded from the final pair. Its exact endpoint URL and response body
are OnFinality while the human-readable provider label incorrectly remained
`PublicNode BSC mainnet JSON-RPC`. The run performed no write and returned
`executionEnabled: false`, but ProofEra does not silently repair immutable
evidence or publish a mislabeled receipt as the final method result. A later
release must bind the provider label into its lane configuration and re-freeze.
