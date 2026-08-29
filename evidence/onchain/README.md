# Retained onchain execution evidence

This directory contains non-secret, create-only records emitted only after exact transaction receipts
and bounded post-state checks pass. A transaction hash alone is never sufficient, and no file here may
contain a private key, wallet password, keystore or raw signed transaction.

`bsc-testnet-pta-wbnb-first-lp-eed9c32a107b57735f45bd6246d967cb12fbb1579a05faa9f17e0ead46187d01.json`
records the controlled BSC-testnet PTA/WBNB first LP. Its SHA-256 is
`3fa80573ea8cd3ee85208670048bffed48d757c2e8674757ac3331077f121d6a`. Both fixed RPCs agreed on
the finalized approval and mint receipts and on EIP-1898 mint-block post-state for NFT ownership,
position fields, pool liquidity and zero residual PTA allowance.

The record proves one owner-executed test-fixture position only. It does not prove autonomous-agent
execution, price, oracle quality, fee income, profit, impermanent loss, realized economic benefit,
mainnet activity or reusable transaction authority.
