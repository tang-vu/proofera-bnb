# Altana lifecycle evidence

The read-only collector writes one create-only two-provider grant/execute/revoke lifecycle artifact
here after all three receipts are finalized. It joins execute/revoke relay calls IDs, proves KeyStore
and account authority at the grant and execute blocks, and proves absence at revoke and a later common
finalized block. No lifecycle artifact exists yet.

This evidence does not directly decode which key signed the relayed execute intent and does not prove
the application call or PancakeSwap state effect. Those claims require separately joined,
application-specific receipt and before/after evidence.
