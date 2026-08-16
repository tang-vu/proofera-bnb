# Pancake LP TermiX captures

The production agent CLI writes one create-only canonical capture per run ID
to this directory. No run exists yet. A capture is unreachable until the
shared declaration is release-bound, the repository is clean and published,
the LP agent has a registered ERC-8004 identity, and a hire receipt has been
independently verified.

The runner rechecks the frozen Pancake `slot0` state at the exact block hash,
then invokes the fixed public LP A2A endpoint. It has no wallet, signer,
approval, transaction, broadcast, or evidence-overwrite path.
