# Production release probes

Exact-release, create-only probe manifests are written beneath `<source-commit>/<mode>/` by
`scripts/capture-production-release-evidence.mjs`.

Rehearsal output proves only a bounded observation from the production host. Final output is allowed
only after the exact prerequisite gates pass, including the complete truthful Pancake outcome without
promoting it to a benefit claim. The frozen `ad0cee1` probe and bounded exact-path
rollback/restoration exercise are summarized by `evidence/submission/final/production-release.json`;
the prior `e6e55c1` manifest remains historical evidence. Current public product commit `9f32dda`
has a separate retained rehearsal observation with two-resolver agreement, five authorized TLS
hosts and eleven exact responses; `evidence/submission/final/current-public-release.json` binds that
observation without relabeling it as a frozen release. Independent uptime monitoring and an
authoritative submission receipt remain separate.
