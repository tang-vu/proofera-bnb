# ProofEra final demo runbook

Updated: 2026-09-05. The exact narrated demo, automated playback artifact, public YouTube
observation and scoped owner audio/visual reviews now exist; this runbook records their verified
demo gate and the remaining submission boundary.

## Gate order

The final capture deliberately avoids circular proof. The exact committed
`evidence/submission/readiness.json` must have verified production release, agent registration,
Altana lifecycle and all three TermiX pairs. Pancake may be either verified or the exact retained
`controlled_outcome_observed` state, but that negative path is admitted only when the gate includes
the transaction receipt, before/after metrics, manual baseline, a blocker, and explicit statements
that no fee income, price movement, liquidity change, realized benefit or autonomous-agent advantage
was observed. The final manifest records `pancakeBenefitClaimVerified: false` on that path.

Before the first create-only final capture, the demo had to be `not_recorded`. A create-only
successor may also start from `recorded_pending_human_playback`, but only when the retained prior
gate still contains a video, demo manifest, automated playback check and an explicit blocker.
Submission must remain `draft` and top-level readiness false. A final capture requires all of the
following:

- clean `HEAD`, equal to `origin/main`;
- a valid public `/api/health` build that either equals `HEAD` or is its Git ancestor with no change
  under the public runtime path set (`apps`, `packages`, root package/lock/workspace/TypeScript
  configuration, and the Windows production process definition);
- a narration file committed under `evidence/submission/narration/` at `HEAD`;
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
exercise. Current public carrier `12829109f26b8f6d15fc2f7beda2008548ae9be0` has a separate
read-only rehearsal observation with two-resolver agreement, five authorized TLS hosts, eleven
exact responses and honest split readiness: analysis implemented, capital/judging false.

Retained video source commit `ad0349811df96f39b110a505f0c6d9ded6d4746b` separately has a
six-scene narrated MP4: duration `297.080` seconds, 1440x900 H.264 video, mono AAC audio, media SHA-256
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

The retained MiMo final mode invocation was:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
corepack pnpm capture:demo:video $releaseCommit --mode final `
  --voiceover evidence/submission/narration/proofera-final-demo-mimo-v2.5.mp3
```

Final output is create-only. Do not rerun or overwrite the retained `ad03498` or `89a99e8`
directories.

## Historical five-minute narration map

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

The current automated portion is retained at
`evidence/submission/demo-videos/89a99e84c62905fa77aed9c431e7cb730f2c342f/playback/manifest.json`.
It verifies copy identity, structure, full decode and current public scenes. The owner still needs to
listen/watch once on a separate viewer and retain a timestamped statement about intelligibility and
presentation; that owner statement is not independent review.

## Retained MiMo successor capture

The create-only successor capture is now retained. It adds a self-contained dark HTML/CSS intro and
outro, exact testnet/build labels, a black-to-scene
navigation curtain, eased continuous scrolling, and scene durations weighted to the narration.
The first second of browser-startup footage is removed during encoding, so the about-blank frame
cannot become a white opening. Editorial cards are recorded separately in the manifest and never
presented as public product pages.

The reviewed successor narration source has eight chapters and uses Xiaomi MiMo V2.5 TTS with the
built-in `Dean` voice. The official TTS contract puts delivery direction in a `user` message and the
exact spoken text in an `assistant` message; output is requested as WAV. Each chapter is then sent
to MiMo V2.5 ASR as one English WAV input. The ASR transcript is a machine-transcribability check,
not human playback, independent review, or evidence that narrated claims are true. Domain-equivalent
spellings are normalized; a miss against the reviewed threshold remains explicit, while only
catastrophic transcript divergence blocks asset creation. If MiMo's raw delivery falls outside the
240-to-330-second final-video envelope, one bounded local FFmpeg tempo filter targets 250 seconds for
a short read or 325 seconds for a long read. The manifest retains the raw-duration estimate, target
and exact factor; no extra remote synthesis is hidden behind this fit.

The create-only run completed at `2026-09-04T07:40:56.443Z`. All eight ASR chapter scores met the
reviewed 0.78 threshold. The retained MP3 is 325.014 seconds, mono 48 kHz at 192 kbps, and has
SHA-256 `017adf5ca85588da4be7c447b1cd02def705b8cd144665b8952413348f1cf81e`. FFmpeg completed a full
decode; an EBU R128 observation reported `-16.6 LUFS` integrated loudness and `-1.7 dBFS` true peak,
with no silence of at least two seconds at the reviewed `-45 dB` threshold. These machine checks do
not establish human-perceived narration quality.

Source commit `89a99e84c62905fa77aed9c431e7cb730f2c342f` produced a 325.014-second,
68,211,573-byte MP4 with one 1440x900 H.264 stream and one mono 48 kHz AAC stream. Its SHA-256 is
`b78b364efc104aed35da4ed70af3a030bc7ded59a781af82a7a7499bf13a4c8b`. The manifest binds the
rendered pages to runtime-equivalent public ancestor `12829109f26b8f6d15fc2f7beda2008548ae9be0`,
lists all 29 changed paths, and records that the protected runtime path set did not change. FFmpeg
completed a full decode; contact-sheet review found the expected dark title cards and six public
scenes. The encoded audio had true peak `-1.6 dBFS` and no silence of at least two seconds at the
`-45 dB` threshold. Separate-process playback then copied and rehashed the media, completed another
full decode, and rechecked all six public scenes at HTTP 200. Its manifest SHA-256 is
`612add66becfc9fbbf962efde445dc9a6a6c8fbd1ae00c621c1a99edf2abda1f`.

On 2026-09-05, an anonymous oEmbed request and watch-page request both returned HTTP `200` for
[YouTube video `ron927GeVXI`](https://youtu.be/ron927GeVXI). The watch page reported playability
`OK`, `isPrivate: false`, `isUnlisted: false`, the expected title, and a rounded duration of 325
seconds. The retained [publication observation](../evidence/submission/youtube-publication-2026-09-05.json)
has SHA-256 `2315379f90bd1f04e3550054df0b7518980794f30bb2c4640c5a2232ab6bcdd0`.
This establishes timestamped anonymous YouTube availability only; it does not prove byte identity
with the retained MP4, human playback, narration intelligibility, entry submission or organizer
acceptance.

The repository owner subsequently confirmed that they listened and found the narration acceptable.
The retained [owner audio review](../evidence/submission/final/demo-owner-audio-review-2026-09-05.json)
has SHA-256 `3c1ff87f27ef7aa1de112ac7aa1bde8dfa1d776e1f58e065f6ce6063ea87291b`.
The owner then confirmed visual playback, scene order and evidence-link presentation. The retained
[owner visual review](../evidence/submission/final/demo-owner-visual-review-2026-09-05.json) has
SHA-256 `ab60da9467ebecc0c83493aef275bb156a3de2e24e87721ec2f6d0c288dee44a`.
These two scoped owner attestations close the human demo review. The playback surface and source
timestamp remain unspecified, and neither record is independent review, form submission or
organizer evidence.

The readiness verifier retains a 95,000,000-byte per-artifact ceiling. This admits the 68,211,573-byte
MP4 without removing the bounded-file guard and stays below GitHub's 100 MB hard per-file limit.

The historical generation command was:

```powershell
corepack pnpm generate:demo:narration:mimo
```

The output is create-only and must not be regenerated or overwritten. The wrapper required hidden
entry of an API key, kept it process-local, and removed it on exit.
Credential rotation remains an account-owner decision and is not attested by this generator. It
deliberately did not read or create `.env`. After the MP3, ASR record and manifest are committed, a
published media-only descendant may be captured against its runtime-equivalent public ancestor. The
video manifest must name both commits, list every intervening changed path, and reject a difference
in the runtime path set. This does not claim that the media commit itself was deployed. No deployment,
wallet access, signature, transaction, or mainnet action was part of the narration generator.

Reviewed provider references:

- [MiMo V2.5 speech synthesis API](https://mimo.mi.com/docs/en-US/api/audio/tts)
- [MiMo V2.5 speech recognition API](https://mimo.mi.com/docs/en-US/api/audio/Speech-Recognition)
- [MiMo Token Plan quick access](https://mimo.mi.com/docs/en-US/tokenplan/Token%20Plan/quick-access)
