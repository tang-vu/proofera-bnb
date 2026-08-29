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

Final mode additionally requires registration, Altana, Pancake and TermiX readiness gates to be
verified while production remains `deployed_unfrozen`, demo remains `not_recorded`, and submission
remains `draft`. Its certificate validity must cover the published judging window through
2026-09-23 UTC:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:production:release $releaseCommit --mode final
```

On 2026-08-29, commit `c476b01b5eb01d9595232e90cca40dece564e91a` was deployed and passed the
exact public smoke probe. Rehearsal manifest SHA-256
`ba4e8fc1ddc31bdae7240457f1e5ae2029bc4f06fb5e24945e73c733f723becf` retains the bounded
DNS/TLS/HTTP observations. Final mode stopped before network with
`PRODUCTION_RELEASE_PREREQUISITES_OPEN`: the prerequisite still requires Pancake `verified`, while
the measured state is truthfully `controlled_outcome_observed` with no benefit. Do not promote that
negative outcome into a benefit claim merely to freeze a release; the prerequisite model must be
revised and reviewed first.

After final capture, retain a separate release manifest beneath `evidence/submission/final/`, perform
the documented rollback exercise, update the production readiness gate from exact artifacts, deploy
that evidence-bearing commit only when its relationship to the observed application release is
explicit, and run the final narrated demo pipeline.
