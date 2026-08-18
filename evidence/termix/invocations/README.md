# Frozen TermiX invocation envelopes

These one-line canonical JSON files bind exact timed agent requests to previously published declarations, agent-first run-order resolutions and independently finalized paid-hire receipts. They are stdin inputs, not benchmark outputs or evidence that a lane ran.

- `pancake-lp-agent-20260818-v1.canonical-json`: SHA-256 `b1f998af1fe21ee4e23cadd9aeac884dbe70b3f1a4418107608c8e41c315de6d`.
- `pancake-lp-agent-20260818-v2.canonical-json`: SHA-256 `7a487729eccf1e1198dece262a053a7c218f3ecb0f516a5901c8152c0d7dd6b5`; this is the executable replacement bound to the valid `125722978` agent-first resolution.
- `pancake-lp-agent-20260818-v3.canonical-json`: SHA-256 `7c92b324843b1bfa9478cb767ba4ded8784195218aa7ecbff761088859f0cbd8`; this binds the archive replay release and `125727528` agent-first resolution.
- `venus-health-agent-20260818-v1.canonical-json`: SHA-256 `3cbbaf5ae6edb93f8efd64283540b6ba13971dc367391293a4106f8ccfeda8be`.

The exact runners schema-parse these envelopes before release-state or network access. The v1 LP envelope was superseded after protected release-scope drift; v2 reached the timed lane but produced no capture because its fixed replay provider had pruned the historical state. A run exists only after the corresponding create-only output is retained and independently reviewed.
