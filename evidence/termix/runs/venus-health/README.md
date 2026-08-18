# Venus Health timed captures

This directory accepts create-only output from the fixed Venus Health agent
runner. `venus-health-agent-20260818-v1.json` is the completed agent-first
capture, SHA-256 `6f3037fce19c42b6d6ee2eb8142fecc17febb3e07e1800476842939a2906540f`.
It records a `2,517,940,100 ns` wall duration, `2,513,993,700 ns` active A2A
segment, one hashed API response, exact hire receipt and bounded `hold`
decision. A JSON file is evidence only when its source commit, declaration,
registered ERC-8004 identity,
independently verified hire receipt, committed canonical request and public A2A
response all pass the runner gates. A runner failure must not create a capture.

This is one half-run only: no manual baseline, second-review score, paired
result or advantage claim exists.

No private key, wallet secret, session signer, environment value or bearer
credential belongs in this directory.

The matching manual runner writes separately under `manual/`; it consumes a
bounded operator NDJSON stream and makes no network or agent request itself.
