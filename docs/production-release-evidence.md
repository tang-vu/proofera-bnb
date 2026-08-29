# Production release evidence

Updated: 2026-08-17. This runbook prepares a frozen-release probe; it does not claim that the current
release is final or independently monitored.

## Evidence boundary

`scripts/capture-production-release-evidence.mjs` is a create-only, exact-release collector. It
requires clean `HEAD`, equality with `origin/main`, and public marketplace health reporting that exact
commit. It then retains:

- A-record answers from Google Public DNS and Cloudflare 1.1.1.1 DoH for all five hostnames, including
  each bounded raw-response digest and whether the resolver set the authenticated-data flag;
- authorized TLS observations for all five hostnames, including protocol, cipher, certificate
  fingerprint, issuer and validity period;
- exact, no-redirect, bounded HTTPS observations for marketplace health, honest readiness `503`,
  Proof Room, four analyzer pings and four Agent Cards;
- response byte counts and SHA-256 values without copying full dynamic bodies into evidence;
- explicit non-claims for external monitoring, onchain receipts, judging uptime and submission.

The two DoH origins are allowlisted from their primary documentation:

- Google JSON DoH: `https://developers.google.com/speed/public-dns/docs/doh/json`;
- Cloudflare JSON DoH:
  `https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/`.

Resolver agreement does not become a DNSSEC claim. HTTPS/TLS requests originate from the always-on
production host, so the artifact is independently reviewable but is not an independent network
vantage or uptime service.

## Modes

Rehearsal mode validates the pipeline but cannot freeze the release:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:production:release $releaseCommit --mode rehearsal
```

Final mode additionally requires registration, Altana and TermiX readiness gates to be verified.
Pancake must either be verified or retain the exact `controlled_outcome_observed` state, all three
required receipt/metrics/manual artifacts, an explicit open blocker, and the exact negative-benefit
claim. This allows a truthful release to freeze without converting a negative financial result into
a benefit claim. Production must remain `deployed_unfrozen`, demo `not_recorded`, and submission
`draft`. Certificate validity must cover the published judging window through 2026-09-23 UTC:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:production:release $releaseCommit --mode final
```

On 2026-08-29, commit `e6e55c161f324f03b401b1e9f0a17f5fbff2d373` was deployed and passed final
capture. Manifest SHA-256 `682fecefd8dd444fb52dfef5dbdc054b274f1416dbbd31666dae4b1a51c7c133`
retains two-resolver agreement, five authorized TLS hosts, eleven exact HTTP observations and the
exact public build. It records `pancakeBenefitClaimVerified: false` and the truthful
`controlled_outcome_observed` state; it does not close the Pancake benefit gate.

The bounded rollback exercise then ran web and monitor from detached commit
`c476b01b5eb01d9595232e90cca40dece564e91a`, passed all eleven public checkpoints, restored the
frozen commit, passed all eleven checkpoints again and saved PM2. Four analyzers, the tunnel and the
Altana worker were not restarted; the worker PID remained `40632`. Final release manifest SHA-256 is
`9bfd056576ebc62b4fb296b2a793965e3d6f3f0d6b3a2c8b006cb8140f2b3c88`. This is host-origin
operational evidence, not independent uptime, Windows reboot, DNS/tunnel rollback, database restore,
wallet, signing or transaction evidence. The next release work is the final narrated demo and
authoritative submission receipt; independent monitoring/paging remains open.
