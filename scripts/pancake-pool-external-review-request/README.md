# PTA/WBNB external-review request

This offline bundle prepares, but does not satisfy, ProofEra's authenticated independent-review
gate for the exact BSC-testnet PTA/WBNB Pancake V3 initializer. It pins the published initializer
Gist revision and byte digest, source commit `00f21c405881a5dc320bddf3c757ba13599b1e71`,
direct-only calldata, code identities, historical EIP-1967 slot observations, pool creation code,
CREATE2 address, and the expected immutable-linked pool runtime.

The committed request deliberately contains `reviewer: null` and status
`awaiting_authenticated_external_review`. A future reviewer must return the defined canonical JSON
decision and a Sigstore keyless bundle. The certificate identity and OIDC issuer must then be matched
to an exact reviewer identity provisioned out of band, with independence checked separately. A
self-hash, Gist ownership, repository identity, or internal agent label is not reviewer
authentication.

The review can close only the external-review gate for the exact pinned subject and source commit.
It does not cover later post-claim, submission, reconciler, broadcaster, or production-composition
code; any such release needs a new exact review request and authenticated decision. Exact owner
authorization remains separate and is not requested or recorded here. This tool does not inspect
environment configuration, call a network, access a wallet or custody material, sign, construct a
signed transaction, broadcast, or write onchain.

From the repository root:

```powershell
node scripts/pancake-pool-external-review-request/generate.mjs --check
node --test scripts/pancake-pool-external-review-request/review-request.test.mjs
```

Use `--write` only when intentionally regenerating the deterministic local artifact. Publication or
sending the request to an external reviewer is a separate action and is not performed by this tool.
