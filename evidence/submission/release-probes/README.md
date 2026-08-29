# Production release probes

Exact-release, create-only probe manifests are written beneath `<source-commit>/<mode>/` by
`scripts/capture-production-release-evidence.mjs`.

Rehearsal output proves only a bounded observation from the production host. Final output is allowed
only after the exact prerequisite gates pass, including the complete truthful Pancake outcome without
promoting it to a benefit claim. The historical frozen `e6e55c1` probe and bounded
rollback/restoration exercise are summarized by `evidence/submission/final/production-release.json`.
The current public UI release `676ab79` has a retained rehearsal but remains explicitly unfrozen
until its evidence carrier, final capture and rollback/restoration exercise pass. Final demo,
independent uptime monitoring and an authoritative submission receipt remain separate.
