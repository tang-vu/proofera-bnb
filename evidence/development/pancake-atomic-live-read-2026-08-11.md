# Pancake atomic live-read development record

Status: development verification only; not a transaction, performance result, or final submission snapshot.

## Claim checked

ProofEra can take a real BSC mainnet Pancake V3 position and pool supplied through the public inspector, read position/pool/factory state through the atomic-latest adapter, and render an available result without a wallet, signer, historical contract-state request, or fixture fallback.

## Inputs

- Checked: 2026-08-11
- Chain: BSC mainnet (`56`)
- Position manager: `0x46A15B0b27311cedF172AB29E4f4766fbE7F4364`
- Position NFT: `7115046`
- Pool: `0x27B5c411a43DEA7cA7e60632eA73fd9E74ED06A8`
- Read-only RPC used for this run: `https://bsc-rpc.publicnode.com`
- Browser project: Playwright Chromium

The position ID came from a zero-address `Transfer` event read. A separate official-factory `getPool(token0, token1, fee)` read resolved the pool before the browser run. The input is replaceable through `PROOFERA_LIVE_POSITION_ID` and `PROOFERA_LIVE_POOL_ADDRESS` because an NFT can later be removed.

## Reproduction

PowerShell:

```powershell
$env:PROOFERA_LIVE_READ_EVIDENCE='1'
$env:BSC_RPC_URL='https://bsc-rpc.publicnode.com'
$env:PROOFERA_LIVE_POSITION_ID='7115046'
$env:PROOFERA_LIVE_POOL_ADDRESS='0x27B5c411a43DEA7cA7e60632eA73fd9E74ED06A8'
pnpm --filter @proofera/web exec playwright test tests/e2e/pancake-position-live.spec.ts --project=chromium
```

Observed test result:

```text
1 passed (8.8s)
browser assertion body: 3.3s
```

The test required the available state, exact NFT ID, atomic-snapshot label, one-unsplit-batch statement, explicit `deployed-code hash not established` limitation, fixed BscScan pool link, and absence of unsupported Fee APR, net-performance, and impermanent-loss claims.

The same opt-in journey was then exercised against BSC testnet with `PROOFERA_LIVE_CHAIN_ID=97`, position `36761`, pool `0xe62112438bDC81d225bc35298d4829ac4fAc8945`, and `https://bsc-testnet-rpc.publicnode.com`. Chromium passed `1/1` in 8.0 seconds with a 2.8-second assertion body and required the fixed testnet BscScan origin. This was also read only; the position owner is unrelated to ProofEra and no execution authority was claimed.

## Failure evidence retained in methodology

The initially discovered NFT `7114961` later reverted with `Invalid token ID`. ProofEra rendered `Read unavailable` and did not substitute its earlier snapshot. The live test input was refreshed from current onchain events rather than changing the product to accept stale state.

## Limitations

- This record does not retain the successful run's exact block JSON or screenshot, so it is not final submission evidence.
- Successful contract calls establish callable presence, not a reviewed deployed-code hash or safe write allowlist.
- No price, token valuation, APR, PnL, impermanent loss, ownership suitability, recommendation, permission, approval, signature, or transaction was produced.
- Public RPC latency and NFT lifecycle are external state. Final evidence must pin the exact rendered block/hash/timestamp, raw adapter output, tool versions, artifact hash, and public source links.
