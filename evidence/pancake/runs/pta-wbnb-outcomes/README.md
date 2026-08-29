# PTA/WBNB bounded outcome observations

This directory retains create-only, read-only outcome captures for the controlled BSC-testnet
PTA/WBNB position NFT `37109`. The collector fixes both public RPC providers, chooses one common
12-confirmation block, repeats every state read through EIP-1898 block-hash selectors, and preserves
the exact public transcripts.

Run only from a clean commit already published to `origin/main`:

```powershell
$sourceCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:pancake:pta-wbnb-outcome $sourceCommit
```

The collector reads owner, position, pool price/liquidity, global fee growth and boundary-tick fee
growth. The initial price comes from the Initialize receipt returned by both providers, while the
initial position comes from the digest-pinned first-LP artifact; this avoids pretending that public
RPCs provide archival state calls. It recomputes uncollected fees without poking or collecting the
position. It never loads custody, signs, approves, swaps, burns, collects, broadcasts or changes
liquidity.

An observation can establish a bounded unchanged/changed state and exact raw-unit costs. It cannot
turn fixture tokens into economic value, make an external-oracle claim, or compare an owner-executed
mint against an unrelated manual decision task as though it were autonomous-agent performance.

The captured RPC transcripts are public chain data only. A successful capture does not authorize or
perform a collect, withdrawal, rebalance, approval, swap, transfer, signature, or transaction.
