# Frozen Pancake LP declarations

Each JSON artifact is create-only and binds one published source release, the retained canonical
input, ERC-8004 identity and a future BSC-testnet block used for run-order randomness. The block
hash is intentionally unknown when the declaration is committed. A later two-provider capture
must prove the finalized hash and resolve its least-significant bit before either timed run.

These artifacts do not prove a hire, a run, a result, position ownership or execution authority.
