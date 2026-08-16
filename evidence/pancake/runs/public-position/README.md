# Pancake public-position benefit runs

This directory contains create-only, exact-block captures made by
`scripts/capture-pancake-public-position-benefit.mjs`. Each record preserves
the raw BSC JSON-RPC requests/responses and the public LP agent A2A request and
response.

These are public third-party positions. A record may demonstrate read-only
decision value, but it never establishes ProofEra ownership, authorization,
performance, registration, hiring, execution, or a transaction receipt.

The runner is deliberately fixed to BSC mainnet, the official Pancake V3
position manager/factory, ProofEra's production LP endpoint, and the reviewed
USDT/WBNB fee-500 scope. It accepts a position only when the NFT is live at one
canonical block and the factory/pool token, fee, tick, liquidity, and code
relations pass. Run it only with a freshly discovered public position ID:

```powershell
pnpm capture:pancake:public-position -- --capture-public-position-benefit --position-id <id>
```

The command performs reads and an analyzer call only. It has no wallet,
signer, approval, broadcast, or transaction method.
