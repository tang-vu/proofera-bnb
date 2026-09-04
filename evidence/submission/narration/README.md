# Demo narration inputs

The final demo MP3 voice-over must be retained here before capture so its exact bytes are part of the
published source release. MP3 is the only accepted input because it stays inside the repository's
reviewed binary-evidence boundary.

`proofera-final-demo-script.txt` is the evidence-backed English narration source. Its rounded TermiX
timings derive from the retained protected paired report, and its Pancake/Altana statements preserve
the final artifacts' limitations. `proofera-final-demo.mp3` is a locally synthesized timing track for
the deterministic final-video pipeline; retaining it proves only its bytes and media properties, not
human narration quality, clean-room playback, final video capture, or hackathon submission.

The create-only generator is `scripts/generate-demo-narration.ps1`. The retained timing track was
generated with Microsoft Zira Desktop at rate 0 and has these bounded media properties:

- SHA-256: `aea3992fb2badedf8e52c7a5dbbaf57c6400d0a1190a7355e09b8cf3c31939bf`;
- byte length: `6080306`;
- duration: `303.918` seconds;
- audio: MP3, mono, 22,050 Hz.

## Premium MiMo successor pipeline

`proofera-final-demo-mimo-v2.5-script.json` is the reviewed eight-chapter successor source. It maps
an editorial intro, the same six public evidence scenes, and an editorial outro. The source pins
`mimo-v2.5-tts`, the built-in `Dean` voice, English, and a restrained product-film delivery prompt.
The retained generation completed at `2026-09-04T07:40:56.443Z`:

- `proofera-final-demo-mimo-v2.5.mp3` is 7,801,965 bytes, mono MP3 at 48 kHz, lasts 325.014 seconds,
  and has SHA-256 `017adf5ca85588da4be7c447b1cd02def705b8cd144665b8952413348f1cf81e`;
- `proofera-final-demo-mimo-v2.5-asr.json` has SHA-256
  `144893d776b478d6cd206923ed3a585f1a6fe9719ecbb07f4e59ceaa943e503d`; all eight chapters met the
  reviewed 0.78 sequence threshold;
- `proofera-final-demo-mimo-v2.5-manifest.json` has SHA-256
  `3ad50d739e93565bddb4a0618abf476813096013d2cb72ea2e85f816893c4ed1` and records a local tempo
  factor of 1.22163077 from the 397.030-second source estimate to the 325-second target.

Run `pnpm generate:demo:narration:mimo` interactively. The wrapper accepts an API key through hidden
console input, passes it to one child process, removes it afterward, and never creates a `.env`
file. Credential lifecycle remains an account-owner decision rather than a generator attestation.
The Node generator
allowlists the official pay-as-you-go endpoint and the Singapore Token Plan endpoint, makes
create-only chapter TTS calls, and checks each WAV with `mimo-v2.5-asr`. Domain spellings such as
`BNB`, `ERC-8004`, and `SHA-256` are normalized before comparison. A reviewed similarity miss stays
visible in evidence; only catastrophic transcript divergence blocks asset creation. The generator
fits an out-of-range raw delivery to a safe 250- or 325-second target with one bounded local FFmpeg
tempo filter, then normalizes the final mono MP3. The manifest records the source-duration estimate,
target and exact tempo factor. No additional provider call, request header, raw response, or
credential material is retained by this local timing step.

The retained MP3 is now bound into the create-only successor capture at
`evidence/submission/demo-videos/89a99e84c62905fa77aed9c431e7cb730f2c342f/final/`. That MP4 and
its manifest do not attest human-perceived intelligibility, source-claim truth, independent review,
or hackathon submission. A separate automated playback record now verifies copy identity, another
full decode and all six live scene assertions without upgrading those human or submission claims.
