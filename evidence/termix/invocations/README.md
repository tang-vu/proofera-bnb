# Frozen TermiX invocation envelopes

These one-line canonical JSON files bind exact timed agent requests to previously published declarations, agent-first run-order resolutions and independently finalized paid-hire receipts. They are stdin inputs, not benchmark outputs or evidence that a lane ran.

- `pancake-lp-agent-20260818-v1.canonical-json`: SHA-256 `b1f998af1fe21ee4e23cadd9aeac884dbe70b3f1a4418107608c8e41c315de6d`.
- `venus-health-agent-20260818-v1.canonical-json`: SHA-256 `3cbbaf5ae6edb93f8efd64283540b6ba13971dc367391293a4106f8ccfeda8be`.

The exact runners schema-parse these envelopes before release-state or network access. While the files were still uncommitted, both runners accepted their schemas and stopped at the expected dirty-repository gate. A run exists only after the corresponding create-only output is retained and independently reviewed.
