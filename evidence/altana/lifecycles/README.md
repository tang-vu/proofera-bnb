# Altana lifecycle evidence

The read-only collector writes one create-only two-provider grant/execute/revoke lifecycle artifact
here after all three receipts are finalized. Two RPCs join the transaction/receipt/block data, the
exact PTA `Approval(wallet, session, 0)` event and a later finalized negative-authority checkpoint.
PublicNode alone supplies canonical historical authority state at grant, execute and revoke because
the fixed BNB Chain public full node pruned those state tries. The artifact must expose that
single-provider historical limit. No lifecycle artifact exists yet.

For the v2 browser ceremony, the exact expiry-bearing grant intent was not committed beforehand. The
collector instead binds the unchanged static policy from the ceremony source commit to the expiry
independently observed at the canonical grant and execute blocks, and records that provenance limit.
It does not directly decode which key signed the relayed execute intent. The zero Approval event does
not prove a nonzero state transition, economic benefit, PancakeSwap/LP activity or performance.
