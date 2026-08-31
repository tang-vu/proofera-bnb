# ProofEra final demo runbook

Updated: 2026-08-31. The exact narrated demo and automated playback artifacts now exist; this
runbook records their gate and the remaining owner playback/submission boundaries.

## Gate order

The final capture deliberately avoids circular proof. The exact committed
`evidence/submission/readiness.json` must have verified production release, agent registration,
Altana lifecycle and all three TermiX pairs. Pancake may be either verified or the exact retained
`controlled_outcome_observed` state, but that negative path is admitted only when the gate includes
the transaction receipt, before/after metrics, manual baseline, a blocker, and explicit statements
that no fee income, price movement, liquidity change, realized benefit or autonomous-agent advantage
was observed. The final manifest records `pancakeBenefitClaimVerified: false` on that path.

Before the first create-only final capture, the demo had to be `not_recorded`, submission `draft`,
and top-level readiness false. That retained capture required all of the following:

- clean `HEAD`, equal to `origin/main` and the exact public `/api/health` build;
- a narration file committed under `evidence/submission/narration/` at that same release;
- six fixed public browser scenes at 1440x900;
- one video stream and one audio stream in the final MP4;
- a duration from 240 through 330 seconds;
- successful full video/audio decoding by FFmpeg;
- create-only output and a byte-level SHA-256 manifest.

The final manifest still says `hackathonEntrySubmitted: false` and `submissionReady: false`. A
timestamped clean-room playback check and authoritative submission receipt are separate artifacts.

## Current exact boundary

The evidence-backed narration source and a 303.918-second synthesized timing track are retained under
`evidence/submission/narration/`. The timing track SHA-256 is
`aea3992fb2badedf8e52c7a5dbbaf57c6400d0a1190a7355e09b8cf3c31939bf`.

The base public UI release has an exact 11-check final probe and an exact-path rollback/restoration
exercise. Current public product commit `9f32dda65d8123f6f37a58fa869daef6340fd1be` has a separate
read-only rehearsal observation with two-resolver agreement, five authorized TLS hosts, eleven
exact responses and honest readiness `503`.

That exact public commit also has a retained six-scene narrated MP4: duration `297.080` seconds,
1440x900 H.264 video, mono AAC audio, media SHA-256
`b93515b52ad29d811f3cc6fd38cc2ddb3ecb54a312e7fac5534a9a5dcca6558f`. A separate process copied
the media, verified byte identity, completed another full decode and rechecked the six public scene
assertions. It did not attest human-perceived narration quality or organizer submission.

## Commands

Generate the create-only timing track on a Windows host with the reviewed SAPI voice and local FFmpeg:

```powershell
& .\scripts\generate-demo-narration.ps1
```

Use rehearsal mode to validate a published exact release without closing the demo gate:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:demo:video $releaseCommit --mode rehearsal
```

The retained final mode invocation was:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:demo:video $releaseCommit --mode final `
  --voiceover evidence/submission/narration/proofera-final-demo.mp3
```

Final output is create-only. Do not rerun or overwrite the retained `ad03498` directory.

## Five-minute narration map

The exact spoken source is
`evidence/submission/narration/proofera-final-demo-script.txt`; it contains no bracketed placeholder.
Its six paragraphs map to the fixed scenes in this order:

1. trust gap and the rule that missing evidence stays missing;
2. job-first marketplace and ERC-8004 IDs 1825 through 1828;
3. Pancake exact-block refusal plus the controlled no-benefit LP outcome;
4. bounded Altana grant, execute, revoke and final authority absence;
5. three task-specific TermiX pairs, mixed timings and reviewer limitations;
6. Proof Room, eleven public checks, honest not-ready state and closing thesis.

Use `docs/demo-script.md` as the canonical visual shot list. Do not improvise a benefit, performance,
execution or readiness claim beyond the retained narration bytes.

## Clean-room playback

After committing the final video and manifest, copy or download the exact retained MP4 on a separate
viewer boundary, recompute SHA-256, play it from beginning to end, verify audio intelligibility and
all explorer/source links, and retain the timestamped result. This check may validate presentation;
it cannot add a missing receipt or repair unsupported narration.

The automated portion is retained at
`evidence/submission/demo-videos/ad0349811df96f39b110a505f0c6d9ded6d4746b/playback/manifest.json`.
It verifies copy identity, structure, full decode and current public scenes. The owner still needs to
listen/watch once on a separate viewer and retain a timestamped statement about intelligibility and
presentation; that owner statement is not independent review.
