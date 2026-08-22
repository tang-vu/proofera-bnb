# Altana lifecycle evidence runbook

Updated: 2026-08-22. This runbook prepares read-side evidence capture; it does not authorize or send a
transaction.

## Boundary

The collector is fixed to Altana SDK `0.7.0`, BSC testnet chain `97`, the SDK-pinned KeyStore and
controller, the testnet relay, the bounded PTA zero-approval policy, and two public RPC providers. It
accepts the source commit that contained the unchanged static ceremony policy, the session expiry
observed onchain, and the finalized grant, execute and revoke transaction identifiers. It never accepts
or reads a private key, passkey, KMS credential, signer or wallet password.

For this bounded worker, expiry is generated when the owner starts the browser ceremony. The exact
expiry-bearing grant intent therefore was not separately committed before the live v2 run. The
collector does not invent that provenance: it reconstructs the public intent from the unchanged
`deploy/windows/altana-test-action.v2.json` policy at the ceremony source commit and requires the
supplied expiry to equal the account key expiry independently read at both the grant and execute
canonical blocks. Future flows may still preregister a complete public grant intent under
`evidence/altana/intents/` when the protocol makes that possible.

After the three transactions, the collector:

1. joins each transaction and successful receipt on both RPCs;
2. joins the execute and revoke Altana `wallet_getCallsStatus` results to their BSC-testnet receipts;
3. requires both providers to find the exact PTA `Approval(wallet, session, 0)` event in the execute
   receipt;
4. uses EIP-1898 canonical block-hash calls to require the session in both KeyStore and the Altana
   account, with the exact reconstructed expiry, at the grant and execute blocks;
5. requires it absent at the revoke block and again at a common checkpoint at least 12 blocks later;
6. rejects wrong order, duplicate hashes, expiry before execution, provider disagreement, missing
   finality, policy drift or any altered public key/permission binding; and
7. writes one new artifact with `wx`; it never overwrites evidence.

## Capture

From the exact clean, published release that contains the grant intent and collector:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:altana:lifecycle $releaseCommit `
  --ceremony-source-commit <published-40-hex-commit> `
  --preparation evidence/altana/preparations/125493138-bsc-testnet-readiness.json `
  --policy-config deploy/windows/altana-test-action.v2.json `
  --session-expiry <decimal-uint40> `
  --grant-tx <0x64-hex> `
  --execute-calls-id <0x-even-hex> --execute-tx <0x64-hex> `
  --revoke-calls-id <0x-even-hex> --revoke-tx <0x64-hex>
```

SDK `0.7.0` does not return the grant `callsId`, so the grant is joined by its two-provider transaction
receipt and exact authority appearance. Execute and revoke retain their calls IDs and must also join the
relay's confirmed receipt.

## Non-claims

This lifecycle artifact proves the observed receipt/order/authority state and the exact PTA zero
Approval event. It does not directly decode which session key signed the relayed execute intent. A zero
approval can leave allowance unchanged, so the event is not a nonzero state transition, economic
benefit, PancakeSwap/LP action or performance result. The ceremony source commit timestamp is Git
provenance, not an external trusted timestamp or deployment attestation. The artifact explicitly marks
the exact grant intent as not precommitted. Missing or ambiguous material remains missing; it is never
inferred from a relay status or successful receipt.
