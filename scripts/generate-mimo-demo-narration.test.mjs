import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildAsrRequest,
  buildTtsRequest,
  exactMimoBaseUrl,
  normalizeNarrationText,
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

test("interactive wrapper hides a new key and the generator fails before network without one", () => {
  assert.match(wrapper, /type ROTATED/u);
  assert.match(wrapper, /-cne "ROTATED"/u);
  assert.match(wrapper, /Read-Host .* -AsSecureString/u);
  assert.match(wrapper, /previously shared in chat is compromised/u);
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
