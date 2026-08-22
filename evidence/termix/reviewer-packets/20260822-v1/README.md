# TermiX independent-review packet 20260822-v1

This packet is an input to a genuinely independent review, not evidence that the review happened.
All three current pairs remain `unverified`; their self-reviews explicitly record
`secondReviewerIndependent: false`.

Start with `manifest.json` and verify every listed file SHA-256 before reviewing content. For each
task, independently open the retained raw output and receipt evidence, reobserve external receipts,
recompute every rubric criterion, and inspect the manual tool boundary. The reviewer must not rely on
the implementation-adjacent score as their conclusion.

If every required check passes, create a new verified pair at the exact `verifiedPairPath` in the
manifest. Preserve all raw output, timing, cost and source bytes; replace the assessment and
verification metadata with the reviewer's own work, set both evidence states to `verified`, then
recompute the logical pair SHA-256. Next create a separate adjudication at `adjudicationPath` that
validates against `TermixIndependentAdjudicationSchema` and binds that new verified-pair digest.

If any check fails, record the failure and do not emit a verified pair or passing adjudication. A
missing reviewer, receipt reobservation, tool-log review, or recomputation can never be converted into
`true`.

The permission-audit answer key is published here only after both blind lanes completed. Its logical
payload SHA-256 is the digest preregistered in the declaration; its file SHA-256 additionally includes
the single final LF.

The repository operator may run the final three-pair compiler only after the six reviewer outputs are
committed and all three adjudications bind their corresponding verified pairs. Even then, the result
is three task-level comparisons, not a universal financial or productivity guarantee.
