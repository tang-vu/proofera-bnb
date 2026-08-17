# Production release probes

Exact-release, create-only probe manifests are written beneath `<source-commit>/<mode>/` by
`scripts/capture-production-release-evidence.mjs`.

Rehearsal output proves only a bounded observation from the production host. Final output is allowed
only after the four receipt/paired-run prerequisite gates close and still requires a separate release
manifest, rollback evidence, demo and submission receipt.
