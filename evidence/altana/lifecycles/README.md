# Altana lifecycle evidence

The read-only collector writes one create-only two-provider grant/execute/revoke lifecycle artifact
here after all three receipts are finalized. It joins execute/revoke relay calls IDs, proves KeyStore
and account authority plus exact expiry at the grant and execute blocks, proves absence at revoke and
a later common finalized block, and joins the exact PTA `Approval(wallet, session, 0)` receipt event.
No lifecycle artifact exists yet.

For the v2 browser ceremony, the exact expiry-bearing grant intent was not committed beforehand. The
collector instead binds the unchanged static policy from the ceremony source commit to the expiry
independently observed at the canonical grant and execute blocks, and records that provenance limit.
It does not directly decode which key signed the relayed execute intent. The zero Approval event does
not prove a nonzero state transition, economic benefit, PancakeSwap/LP activity or performance.
