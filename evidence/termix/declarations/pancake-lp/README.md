# Frozen Pancake LP declarations

Each JSON artifact is create-only and binds one published source release, the retained canonical
input, ERC-8004 identity and a future BSC-testnet block used for run-order randomness. The block
hash is intentionally unknown when the declaration is committed. A later two-provider capture
must prove the finalized hash and resolve its least-significant bit before either timed run.

These artifacts do not prove a hire, a run, a result, position ownership or execution authority.

`68dc21421c60-125719944.json` re-freezes the unchanged LP input on source release `68dc21421c60f5e9ec06e51948c1d7c7901c3191`, declaration SHA-256 `ecbf0b89674f9d5070ec23675fc3bbe3be91c8c4c559eb2a5e737bd35f39712b`, for future randomness block `125719944`. The earlier declaration remains immutable; its runner correctly refused execution after protected `package.json` and loader scope expanded to add later TermiX lanes. The re-freeze is not a run-order resolution or benchmark result.
