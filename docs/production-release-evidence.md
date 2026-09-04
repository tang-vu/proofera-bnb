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

For a new first-time final capture, final mode additionally requires registration, Altana and TermiX readiness gates to be verified.
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

Later on 2026-08-29, the premium UI release
`676ab796bec729a734355737d6c0509a27c9d1d5` replaced only the marketplace and release monitor. The
four analyzer PIDs and Altana worker PID `40632` did not change. Its exact public release probe passed
all eleven checkpoints, and rehearsal manifest SHA-256
`fd1e13ad7c309267c67d705b6ad690d4ebd003fb32c51ff0e58219bd687cf618` retains two-resolver
agreement, five authorized TLS hosts and eleven exact HTTP observations. Final mode stopped before
network with `PRODUCTION_RELEASE_PREREQUISITES_OPEN` because the exact deployed source still carried
the prior `e6e55c1` verified-release ledger rather than a reopened `deployed_unfrozen` gate. This is a
fail-closed release-state transition, not an HTTP/TLS failure. The evidence carrier reopens the gate;
it must be separately deployed and then pass a fresh final capture and bounded rollback/restoration
exercise before the current UI release is called frozen.

On 2026-08-30 local time, header-stable release
`ad0cee11885b2131c27bfa14c3b0a27f2f8fee69` was deployed on the existing PM2/Cloudflare topology.
Its final host-origin capture passed two-resolver agreement for all five hosts, five authorized TLS
observations and all eleven exact HTTPS checks, including exact build identity and honest readiness
`503`. Manifest SHA-256 is
`3a296042cd9bd2ccbfba37c9c15ba8085e5ec82afd9d87d6042397df7ad70e68`.
The separately authorized exercise then moved the exact web and monitor runtime paths to
`676ab796bec729a734355737d6c0509a27c9d1d5`, passed all eleven checkpoints, restored exact release
`ad0cee11885b2131c27bfa14c3b0a27f2f8fee69`, passed all eleven checkpoints again and saved PM2. An
initial `startOrRestart` preflight changed only the environment while retaining old runtime paths; it
was rejected and is not counted. Four analyzers, the tunnel and Altana worker PID `37120` were not
restarted. Final production manifest SHA-256 is
`bf02e8d1df867baa64c1b7b237e4e71be60cacd0cc041263c727055787eb591f`.

Later on 2026-08-30, explicitly authorized evidence carrier
`1663e1f3a8755744739d4b63b32b7cb288221245` replaced only the web and monitor runtime. Its exact
host-origin probe passed all eleven HTTP/build/runtime checkpoints, readiness remained honestly
`503`, and PM2 state was saved. The four analyzer PIDs, tunnel PID and Altana-worker PID were
unchanged. This carrier probe did not repeat the two-resolver or TLS capture retained for the base
release. Independent uptime remains separate. The later `ad03498` demo observation and `9f32dda`
product observation below do not rewrite this frozen base-release record.

On 2026-08-31, retained demo source commit
`ad0349811df96f39b110a505f0c6d9ded6d4746b` passed a separate read-only rehearsal observation with
two-resolver agreement for five hosts, five authorized TLS observations and eleven exact responses,
including exact build identity and honest readiness `503`. Manifest SHA-256 is
`30fe670108738ca5f823d43f201317dba86d1ceaf974bac039c50d08290b90a3`. The observation did not
deploy, restart services, access a wallet, sign or broadcast, and it is not relabeled as a frozen
release. The same commit retains the historical 297.080-second demo. Published media descendant
`89a99e84c62905fa77aed9c431e7cb730f2c342f` now retains the primary 325.014-second MiMo demo; its
manifest binds rendered pages to runtime-equivalent public carrier `1282910`, and a separate process
copied, rehashed, fully decoded and rechecked all six scenes. Human playback, independent uptime and
the organizer receipt remain open.

Later on 2026-08-31, explicitly authorized current public product commit
`9f32dda65d8123f6f37a58fa869daef6340fd1be` replaced only the web and monitor runtime. The exact
release probe passed all eleven checkpoints and PM2 state was saved while the four analyzers,
tunnel and Altana worker were not restarted. A subsequent read-only rehearsal retained
two-resolver agreement for five hosts, five authorized TLS observations, eleven exact responses,
exact build identity and honest readiness `503`. Manifest SHA-256 is
`9d05a26b683c038d15137c05cbb8a89db3c9305b807e073cea4c1fc425d6818b`. The capture itself did not
restart a service, access a wallet, sign or broadcast, and it is not relabeled as a new frozen
release.

On 2026-09-01, public submission carrier `6c862265fa8da29fd2e82ca84ee54e8b273a2beb`
passed a fresh rehearsal with two-resolver agreement for five hosts, five authorized TLS
observations, eleven exact responses and exact build identity. Readiness remained HTTP `503` while
explicitly recording analysis activation as implemented and capital activation/judging readiness as
false. Raw manifest SHA-256 is
`6c36e5e129c55b522cd576d7718a0ef2c94aadd0e8873f43682adfc2020158e5`; the promoted derivative is
`evidence/submission/final/submission-public-release.json`. The collector ran after deployment and
did not itself restart services, access a wallet, sign or broadcast. It is rehearsal evidence, not a
new frozen release, independent uptime or rollback repetition.

Later on 2026-09-01, current public carrier
`12829109f26b8f6d15fc2f7beda2008548ae9be0` passed a fresh read-only rehearsal. Google and
Cloudflare agreed on public A records for all five hosts, all five TLS certificates were authorized
through the judging window, and all eleven bounded HTTPS checks returned the exact deployed build.
Readiness remained HTTP `503`, analysis activation implemented, capital execution unavailable and
judging readiness false. Manifest SHA-256 is
`7e89c2e3badf94e3fbf0ddbf8feafc6aa3492ad3da0f0883598dc961532ce6c6`. The collector did not
restart a service, access a wallet, sign or broadcast. This is host-origin rehearsal evidence, not
independent uptime, a new frozen release, rollback repetition, capital execution or organizer
acceptance.
