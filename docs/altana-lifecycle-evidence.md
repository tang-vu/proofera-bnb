# Altana lifecycle evidence runbook

Updated: 2026-08-17. This runbook prepares read-side evidence capture; it does not authorize or send a
transaction.

## Boundary

The collector is fixed to Altana SDK `0.7.0`, BSC testnet chain `97`, the SDK-pinned KeyStore and
controller, the testnet relay, and two public RPC providers. It accepts one reviewed public-only grant
intent plus the finalized grant, execute and revoke transaction identifiers. It never accepts or reads
a private key, passkey, KMS credential, signer or wallet password.

The public grant intent belongs under `evidence/altana/intents/` and must be committed in a clean,
published release before the ceremony. It contains only the wallet address, curve-valid session public
descriptor, exact target/signature allowlist, spend caps, expiry and `registerInKeystore: true`.

After the three transactions, the collector:

1. joins each transaction and successful receipt on both RPCs;
2. joins the execute and revoke Altana `wallet_getCallsStatus` results to their BscScan receipts;
3. uses EIP-1898 canonical block-hash calls to require the session in both KeyStore and the Altana
   account at the grant and execute blocks;
4. requires it absent at the revoke block and again at a common checkpoint at least 12 blocks later;
5. rejects wrong order, duplicate hashes, expiry before execution, provider disagreement, missing
   finality or any altered public key/permission binding; and
6. writes one new artifact with `wx`; it never overwrites evidence.

## Capture

From the exact clean, published release that contains the grant intent and collector:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:altana:lifecycle $releaseCommit `
  --preparation evidence/altana/preparations/125493138-bsc-testnet-readiness.json `
  --grant-intent evidence/altana/intents/<reviewed-intent>.json `
  --grant-tx <0x64-hex> `
  --execute-calls-id <0x-even-hex> --execute-tx <0x64-hex> `
  --revoke-calls-id <0x-even-hex> --revoke-tx <0x64-hex>
```

SDK `0.7.0` does not return the grant `callsId`, so the grant is joined by its two-provider transaction
receipt and exact authority appearance. Execute and revoke retain their calls IDs and must also join the
relay's confirmed receipt.

## Non-claims

This lifecycle artifact proves the observed receipt/order/authority state only. The public transaction
surface does not by itself directly decode which session key signed the relayed execute intent. The
collector also does not decode the application call or prove a PancakeSwap effect. Submission closure
therefore additionally requires the application-specific receipt, exact call/effect join and retained
before/after evidence. Missing or ambiguous material remains missing; it is never inferred from a relay
status or successful receipt.
