# Pancake V3 initializer publication evidence

This directory verifies the retained public-publication and no-redirect retrieval records for the
direct BSC-testnet initializer review. The published artifact is exactly the existing immutable JSON;
its whole-file SHA-256 is the public Gist filename, and the raw URL is pinned to the Gist revision.

The routine verifier is offline and performs no HTTP request:

```powershell
node --test scripts/pancake-initializer-publication/publication.test.mjs
```

It binds the source bytes, Git blob OID, public locator shape, retained HTTP/TLS observation,
retrieval-record digest, and fail-closed decision boundary. It does not republish or refresh the
Gist, access credentials, load a wallet, request a signature, call an RPC, or broadcast a
transaction.

Publication and exact no-redirect re-fetch do not authenticate a reviewer. The retained manifest
therefore keeps reviewer identity `null` and activation/execution false. A future reviewer approval
must be independently authenticated and bound to the exact public bytes and direct-only scope; it
must not rewrite these historical records.
