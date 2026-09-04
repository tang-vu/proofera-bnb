import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildAsrRequest,
  buildTtsRequest,
  exactMimoBaseUrl,
  normalizeNarrationText,
  planNarrationTiming,
  parseAsrResponse,
  parseTtsResponse,
  sequenceSimilarity
} from "./generate-mimo-demo-narration.mjs";

const scriptUrl = new URL("./generate-mimo-demo-narration.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const generatorSource = await readFile(scriptUrl, "utf8");
const wrapper = await readFile(
  new URL("./generate-mimo-demo-narration.ps1", import.meta.url),
  "utf8"
);
const source = JSON.parse(
  await readFile(
    new URL(
      "../evidence/submission/narration/proofera-final-demo-mimo-v2.5-script.json",
      import.meta.url
    ),
    "utf8"
  )
);

function minimalWav() {
  const bytes = Buffer.alloc(44);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  return bytes;
}

test("MiMo request bodies match the official TTS and ASR chat schemas", () => {
  assert.deepEqual(
    buildTtsRequest({
      stylePrompt: "Calm and precise.",
      text: "Proof before permission.",
      voice: "Dean"
    }),
    {
      model: "mimo-v2.5-tts",
      messages: [
        { role: "user", content: "Calm and precise." },
        { role: "assistant", content: "Proof before permission." }
      ],
      audio: { format: "wav", voice: "Dean" },
      stream: false
    }
  );
  const wav = minimalWav();
  const asr = buildAsrRequest(wav);
  assert.equal(asr.model, "mimo-v2.5-asr");
  assert.equal(asr.messages[0].content[0].type, "input_audio");
  assert.equal(
    asr.messages[0].content[0].input_audio.data,
    `data:audio/wav;base64,${wav.toString("base64")}`
  );
  assert.deepEqual(asr.asr_options, { language: "en" });
});

test("MiMo response parsing accepts bounded WAV and rejects malformed media", () => {
  const wav = minimalWav();
  assert.deepEqual(
    parseTtsResponse({ choices: [{ message: { audio: { data: wav.toString("base64") } } }] }),
    wav
  );
  assert.throws(
    () => parseTtsResponse({ choices: [{ message: { audio: { data: "bm90LXdhdg==" } } }] }),
    /MIMO_TTS_AUDIO_INVALID/u
  );
  assert.equal(
    parseAsrResponse({ choices: [{ message: { content: "  Proof before permission.  " } }] }),
    "Proof before permission."
  );
});

test("MiMo endpoint is exact-allowlisted and cannot carry credentials in the URL", () => {
  assert.equal(
    exactMimoBaseUrl("https://token-plan-sgp.xiaomimimo.com/v1/"),
    "https://token-plan-sgp.xiaomimimo.com/v1"
  );
  assert.equal(exactMimoBaseUrl("https://api.xiaomimimo.com/v1"), "https://api.xiaomimimo.com/v1");
  assert.throws(() => exactMimoBaseUrl("https://example.com/v1"), /MIMO_BASE_URL_NOT_ALLOWED/u);
  assert.throws(
    () => exactMimoBaseUrl("https://key@api.xiaomimimo.com/v1"),
    /MIMO_BASE_URL_NOT_ALLOWED/u
  );
});

test("ASR similarity is punctuation-insensitive but remains sequence-sensitive", () => {
  assert.deepEqual(normalizeNarrationText("Proof-before permission!"), [
    "proof",
    "before",
    "permission"
  ]);
  assert.equal(sequenceSimilarity("Proof before permission", "Proof, before permission."), 1);
  assert.equal(
    sequenceSimilarity(
      "E R C eight thousand four on B N B with S H A two fifty-six",
      "ERC-8004 on BNB with SHA-256"
    ),
    1
  );
  assert.ok(sequenceSimilarity("proof before permission", "permission before proof") < 0.7);
});

test("ASR keeps review quality explicit and blocks only catastrophic divergence", () => {
  assert.match(generatorSource, /REVIEW_ASR_SEQUENCE_SCORE = 0\.78/u);
  assert.match(generatorSource, /CATASTROPHIC_ASR_SEQUENCE_SCORE = 0\.4/u);
  assert.match(generatorSource, /asrReviewedThresholdPassed/u);
  assert.match(generatorSource, /MIMO_ASR_SEQUENCE_CATASTROPHIC_/u);
  assert.doesNotMatch(generatorSource, /MIMO_ASR_SEQUENCE_MISMATCH/u);
});

test("narration timing stays unchanged in range and safely fits short or long speech", () => {
  assert.match(generatorSource, /proofera-mimo-demo-narration-v1\.1\.0/u);
  assert.deepEqual(planNarrationTiming(280), {
    adjusted: false,
    sourceDurationSeconds: 280,
    targetDurationSeconds: 280,
    tempoFactor: 1
  });
  assert.deepEqual(planNarrationTiming(210), {
    adjusted: true,
    sourceDurationSeconds: 210,
    targetDurationSeconds: 250,
    tempoFactor: 0.84
  });
  assert.deepEqual(planNarrationTiming(350), {
    adjusted: true,
    sourceDurationSeconds: 350,
    targetDurationSeconds: 325,
    tempoFactor: 1.07692308
  });
  assert.throws(() => planNarrationTiming(100), /MIMO_NARRATION_TEMPO_ADJUSTMENT_UNSAFE/u);
  assert.throws(() => planNarrationTiming(Number.NaN), /MIMO_NARRATION_SOURCE_DURATION_INVALID/u);
  assert.match(generatorSource, /atempo=\$\{tempoFactor\.toFixed\(8\)\}/u);
});

test("premium source has exact visual chapter order and a bounded reviewed voice", () => {
  assert.equal(source.model, "mimo-v2.5-tts");
  assert.equal(source.voice, "Dean");
  assert.deepEqual(
    source.chapters.map(({ key }) => key),
    [
      "intro",
      "home",
      "marketplace",
      "lp-passport",
      "lp-configuration",
      "proof-room",
      "mission-control",
      "outro"
    ]
  );
  assert.match(source.stylePrompt, /Calm, authoritative, warm, and precise/u);
});

test("interactive wrapper hides the key and the generator fails before network without one", () => {
  assert.match(wrapper, /Read-Host .* -AsSecureString/u);
  assert.doesNotMatch(wrapper, /ROTATED|rotationConfirmation/u);
  assert.match(wrapper, /Remove-Item Env:MIMO_API_KEY/u);
  const environment = { ...process.env };
  delete environment.MIMO_API_KEY;
  delete environment.MIMO_BASE_URL;
  const result = spawnSync(process.execPath, [scriptPath, "--generate-exact-mimo-demo-narration"], {
    encoding: "utf8",
    env: environment,
    timeout: 10_000,
    windowsHide: true
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^MIMO_API_KEY_REQUIRED\r?\n$/u);
});

test("retained MiMo narration binds exact generated bytes, ASR and decoded media", async () => {
  const narrationUrl = new URL(
    "../evidence/submission/narration/proofera-final-demo-mimo-v2.5.mp3",
    import.meta.url
  );
  const asrUrl = new URL(
    "../evidence/submission/narration/proofera-final-demo-mimo-v2.5-asr.json",
    import.meta.url
  );
  const manifestUrl = new URL(
    "../evidence/submission/narration/proofera-final-demo-mimo-v2.5-manifest.json",
    import.meta.url
  );
  const [narrationBytes, asrBytes, manifestBytes, sourceBytes] = await Promise.all([
    readFile(narrationUrl),
    readFile(asrUrl),
    readFile(manifestUrl),
    readFile(
      new URL(
        "../evidence/submission/narration/proofera-final-demo-mimo-v2.5-script.json",
        import.meta.url
      )
    )
  ]);
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(narrationBytes.length, 7_801_965);
  assert.equal(
    digest(narrationBytes),
    "017adf5ca85588da4be7c447b1cd02def705b8cd144665b8952413348f1cf81e"
  );
  assert.equal(
    digest(asrBytes),
    "144893d776b478d6cd206923ed3a585f1a6fe9719ecbb07f4e59ceaa943e503d"
  );
  assert.equal(
    digest(manifestBytes),
    "3ad50d739e93565bddb4a0618abf476813096013d2cb72ea2e85f816893c4ed1"
  );

  const asr = JSON.parse(asrBytes.toString("utf8"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.equal(manifest.schemaVersion, "proofera-mimo-demo-narration-v1.1.0");
  assert.equal(manifest.classification.asrChecked, true);
  assert.equal(manifest.classification.asrReviewedThresholdPassed, true);
  assert.equal(manifest.classification.humanIntelligibilityAttested, false);
  assert.equal(manifest.classification.providerCredentialRetained, false);
  assert.equal(manifest.source.sha256, digest(sourceBytes));
  assert.equal(manifest.asr.evidenceSha256, digest(asrBytes));
  assert.equal(manifest.output.sha256, digest(narrationBytes));
  assert.deepEqual(manifest.timing, {
    adjusted: true,
    sourceDurationSeconds: 397.03,
    targetDurationSeconds: 325,
    tempoFactor: 1.22163077
  });
  assert.equal(asr.reviewedThresholdPassed, true);
  assert.deepEqual(
    asr.chapters.map(({ key, reviewedThresholdPassed }) => ({ key, reviewedThresholdPassed })),
    source.chapters.map(({ key }) => ({ key, reviewedThresholdPassed: true }))
  );
  assert.ok(
    asr.chapters.every(
      ({ sequenceSimilarity }) => sequenceSimilarity >= asr.reviewedSequenceSimilarity
    )
  );

  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,sample_rate,channels",
      "-of",
      "json",
      fileURLToPath(narrationUrl)
    ],
    { encoding: "utf8", timeout: 30_000, windowsHide: true }
  );
  assert.equal(probe.status, 0, probe.stderr);
  const media = JSON.parse(probe.stdout);
  assert.equal(Number.parseFloat(media.format.duration).toFixed(3), "325.014");
  assert.deepEqual(media.streams, [
    { channels: 1, codec_name: "mp3", codec_type: "audio", sample_rate: "48000" }
  ]);
  const decode = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", fileURLToPath(narrationUrl), "-map", "0:a:0", "-f", "null", "-"],
    { encoding: "utf8", timeout: 60_000, windowsHide: true }
  );
  assert.equal(decode.status, 0, decode.stderr);
});
