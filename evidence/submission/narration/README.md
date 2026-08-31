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
It does not claim that MiMo audio already exists.

Run `pnpm generate:demo:narration:mimo` interactively only after rotating any credential previously
shared in chat or logs. The wrapper accepts a new API key through hidden console input, passes it to
one child process, removes it afterward, and never creates a `.env` file. The Node generator
allowlists the official pay-as-you-go endpoint and the Singapore Token Plan endpoint, makes
create-only chapter TTS calls, and checks each WAV with `mimo-v2.5-asr`. Domain spellings such as
`BNB`, `ERC-8004`, and `SHA-256` are normalized before comparison. A reviewed similarity miss stays
visible in evidence; only catastrophic transcript divergence blocks asset creation. The generator
normalizes the final mono MP3 and stores no request headers, raw provider responses, or credential
material.

The output MP3, ASR record, and generation manifest remain absent until that interactive run
succeeds. Their absence must not be described as completed premium narration.
