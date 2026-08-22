# Altana lifecycle evidence

The read-only collector writes one create-only two-provider grant/execute/revoke lifecycle artifact
here after all three receipts are finalized. Two RPCs join the transaction/receipt/block data, the
exact PTA `Approval(wallet, session, 0)` event and a later finalized negative-authority checkpoint.
PublicNode alone supplies canonical historical authority state at grant, execute and revoke because
the fixed BNB Chain public full node pruned those state tries. The artifact must expose that
single-provider historical limit.

The retained v2 artifact is
[`126543819-72e7cf94-altana-lifecycle.json`](./126543819-72e7cf94-altana-lifecycle.json),
SHA-256 `e001d4f9eb8e87d95408206e72c937c1ff8cd68d9885898a4d02aabdfe661b19`. It binds
grant block `126539192`, execute block `126539214`, revoke block `126540157`, and the
two-provider negative-authority checkpoint at block `126543819`. The byte-identical final-gate copy is
`evidence/submission/final/altana-lifecycle.json`.

For the v2 browser ceremony, the exact expiry-bearing grant intent was not committed beforehand. The
collector instead binds the unchanged static policy from the ceremony source commit to the expiry
independently observed at the canonical grant and execute blocks, and records that provenance limit.
It does not directly decode which key signed the relayed execute intent. The zero Approval event does
not prove a nonzero state transition, economic benefit, PancakeSwap/LP activity or performance.
