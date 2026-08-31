import { spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const EXECUTE_FLAG = "--generate-exact-mimo-demo-narration";
const DEFAULT_BASE_URL = "https://token-plan-sgp.xiaomimimo.com/v1";
const ALLOWED_BASE_URLS = new Set(["https://api.xiaomimimo.com/v1", DEFAULT_BASE_URL]);
const TTS_MODEL = "mimo-v2.5-tts";
const ASR_MODEL = "mimo-v2.5-asr";
const EXPECTED_CHAPTERS = Object.freeze([
  "intro",
  "home",
  "marketplace",
  "lp-passport",
  "lp-configuration",
  "proof-room",
  "mission-control",
  "outro"
]);
const MAXIMUM_RESPONSE_BYTES = 24_000_000;
const MAXIMUM_MEDIA_TOOL_OUTPUT_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 180_000;
const MINIMUM_ASR_SEQUENCE_SCORE = 0.78;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const narrationRoot = resolve(repositoryRoot, "evidence", "submission", "narration");
const sourcePath = resolve(narrationRoot, "proofera-final-demo-mimo-v2.5-script.json");
const outputPath = resolve(narrationRoot, "proofera-final-demo-mimo-v2.5.mp3");
const asrPath = resolve(narrationRoot, "proofera-final-demo-mimo-v2.5-asr.json");
const manifestPath = resolve(narrationRoot, "proofera-final-demo-mimo-v2.5-manifest.json");

function fail(code) {
  throw new Error(code);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function pathDoesNotExist(path) {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

export function exactMimoBaseUrl(candidate) {
  const value = (candidate ?? DEFAULT_BASE_URL).trim().replace(/\/$/u, "");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("MIMO_BASE_URL_INVALID");
  }
  if (
    !ALLOWED_BASE_URLS.has(value) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail("MIMO_BASE_URL_NOT_ALLOWED");
  }
  return value;
}

function exactApiKey(candidate) {
  if (
    typeof candidate !== "string" ||
    candidate.length < 24 ||
    candidate.length > 256 ||
    !/^[\x21-\x7e]+$/u.test(candidate)
  ) {
    fail("MIMO_API_KEY_REQUIRED");
  }
  return candidate;
}

export function buildTtsRequest({ stylePrompt, text, voice }) {
  return {
    model: TTS_MODEL,
    messages: [
      { role: "user", content: stylePrompt },
      { role: "assistant", content: text }
    ],
    audio: { format: "wav", voice },
    stream: false
  };
}

export function buildAsrRequest(wavBytes) {
  return {
    model: ASR_MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: {
              data: `data:audio/wav;base64,${wavBytes.toString("base64")}`
            }
          }
        ]
      }
    ],
    asr_options: { language: "en" },
    stream: false
  };
}

export function parseTtsResponse(value) {
  const data = value?.choices?.[0]?.message?.audio?.data;
  if (
    typeof data !== "string" ||
    data.length === 0 ||
    data.length > MAXIMUM_RESPONSE_BYTES * 2 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(data)
  ) {
    fail("MIMO_TTS_RESPONSE_INVALID");
  }
  const bytes = Buffer.from(data, "base64");
  if (
    bytes.length < 44 ||
    bytes.length > MAXIMUM_RESPONSE_BYTES ||
    bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
    bytes.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    fail("MIMO_TTS_AUDIO_INVALID");
  }
  return bytes;
}

export function parseAsrResponse(value) {
  const content = value?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0 || content.length > 20_000) {
    fail("MIMO_ASR_RESPONSE_INVALID");
  }
  return content.trim();
}

export function normalizeNarrationText(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

export function sequenceSimilarity(expectedText, observedText) {
  const expected = normalizeNarrationText(expectedText);
  const observed = normalizeNarrationText(observedText);
  if (expected.length === 0 || observed.length === 0) return 0;
  const previous = new Uint16Array(observed.length + 1);
  const current = new Uint16Array(observed.length + 1);
  for (const expectedWord of expected) {
    for (let index = 1; index <= observed.length; index += 1) {
      current[index] =
        expectedWord === observed[index - 1]
          ? previous[index - 1] + 1
          : Math.max(previous[index], current[index - 1]);
    }
    previous.set(current);
    current.fill(0);
  }
  return previous[observed.length] / Math.max(expected.length, observed.length);
}

function parseSource(bytes) {
  let source;
  try {
    source = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("MIMO_NARRATION_SOURCE_INVALID");
  }
  if (
    source?.schemaVersion !== "proofera-demo-narration-script-v1.0.0" ||
    source.language !== "en" ||
    source.model !== TTS_MODEL ||
    source.voice !== "Dean" ||
    typeof source.stylePrompt !== "string" ||
    source.stylePrompt.length < 80 ||
    source.stylePrompt.length > 1_000 ||
    !Array.isArray(source.chapters) ||
    source.chapters.length !== EXPECTED_CHAPTERS.length
  ) {
    fail("MIMO_NARRATION_SOURCE_INVALID");
  }
  for (const [index, chapter] of source.chapters.entries()) {
    if (
      chapter?.key !== EXPECTED_CHAPTERS[index] ||
      typeof chapter.text !== "string" ||
      chapter.text.length < 40 ||
      chapter.text.length > 2_500
    ) {
      fail("MIMO_NARRATION_SOURCE_INVALID");
    }
  }
  return source;
}

async function requestJson({ apiKey, baseUrl, body, failureCode, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: controller.signal
    });
  } catch {
    fail(`${failureCode}_UNAVAILABLE`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) fail(`${failureCode}_HTTP_${response.status}`);
  const responseText = await response.text();
  if (Buffer.byteLength(responseText, "utf8") > MAXIMUM_RESPONSE_BYTES * 2) {
    fail(`${failureCode}_TOO_LARGE`);
  }
  try {
    return JSON.parse(responseText);
  } catch {
    fail(`${failureCode}_JSON_INVALID`);
  }
}

function runMediaTool(command, args, failureCode, timeout = 180_000) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: MAXIMUM_MEDIA_TOOL_OUTPUT_BYTES,
    timeout,
    windowsHide: true
  });
  if (result.status !== 0 || result.error) fail(failureCode);
  return result.stdout;
}

function probeAudio(path, minimumSeconds, maximumSeconds) {
  const output = runMediaTool(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size:stream=codec_type,codec_name,sample_rate,channels",
      "-of",
      "json",
      path
    ],
    "MIMO_NARRATION_FFPROBE_FAILED"
  );
  let media;
  try {
    media = JSON.parse(output);
  } catch {
    fail("MIMO_NARRATION_FFPROBE_INVALID");
  }
  const durationSeconds = Number.parseFloat(media?.format?.duration ?? "");
  const streams = Array.isArray(media?.streams)
    ? media.streams.filter((stream) => stream.codec_type === "audio")
    : [];
  if (
    streams.length !== 1 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < minimumSeconds ||
    durationSeconds > maximumSeconds
  ) {
    fail("MIMO_NARRATION_MEDIA_INVALID");
  }
  return Object.freeze({
    bytes: Number.parseInt(media.format.size, 10),
    channels: streams[0].channels,
    codecName: streams[0].codec_name,
    durationSeconds: durationSeconds.toFixed(3),
    sampleRate: streams[0].sample_rate
  });
}

function assembleNarration(segmentPaths, temporaryOutputPath) {
  const inputs = segmentPaths.flatMap((path) => ["-i", path]);
  const filters = [];
  const sequence = [];
  for (const [index] of segmentPaths.entries()) {
    filters.push(
      `[${index}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono[a${index}]`
    );
    sequence.push(`[a${index}]`);
    if (index < segmentPaths.length - 1) {
      filters.push(`aevalsrc=0:d=0.65:s=48000,aformat=channel_layouts=mono[p${index}]`);
      sequence.push(`[p${index}]`);
    }
  }
  filters.push(
    `${sequence.join("")}concat=n=${sequence.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=9[out]`
  );
  runMediaTool(
    "ffmpeg",
    [
      "-v",
      "error",
      "-n",
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "1",
      temporaryOutputPath
    ],
    "MIMO_NARRATION_ASSEMBLY_FAILED",
    300_000
  );
}

async function generate() {
  if (process.argv.length !== 3 || process.argv[2] !== EXECUTE_FLAG) {
    fail("MIMO_NARRATION_EXACT_INVOCATION_REQUIRED");
  }
  const apiKey = exactApiKey(process.env.MIMO_API_KEY);
  const baseUrl = exactMimoBaseUrl(process.env.MIMO_BASE_URL);
  for (const path of [outputPath, asrPath, manifestPath]) {
    if (!(await pathDoesNotExist(path))) fail("MIMO_NARRATION_OUTPUT_EXISTS");
  }

  const sourceBytes = await readFile(sourcePath);
  const source = parseSource(sourceBytes);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "proofera-mimo-narration-"));
  const createdOutputs = [];
  try {
    const chapterResults = [];
    const segmentPaths = [];
    for (const [index, chapter] of source.chapters.entries()) {
      const ttsResponse = await requestJson({
        apiKey,
        baseUrl,
        body: buildTtsRequest({
          stylePrompt: source.stylePrompt,
          text: chapter.text,
          voice: source.voice
        }),
        failureCode: "MIMO_TTS"
      });
      const wavBytes = parseTtsResponse(ttsResponse);
      const segmentPath = resolve(temporaryDirectory, `chapter-${index}.wav`);
      await writeFile(segmentPath, wavBytes, { flag: "wx" });
      const segmentProbe = probeAudio(segmentPath, 1, 100);
      const asrResponse = await requestJson({
        apiKey,
        baseUrl,
        body: buildAsrRequest(wavBytes),
        failureCode: "MIMO_ASR"
      });
      const transcript = parseAsrResponse(asrResponse);
      const similarity = sequenceSimilarity(chapter.text, transcript);
      if (similarity < MINIMUM_ASR_SEQUENCE_SCORE) fail("MIMO_ASR_SEQUENCE_MISMATCH");
      segmentPaths.push(segmentPath);
      chapterResults.push({
        key: chapter.key,
        sourceTextSha256: sha256(Buffer.from(chapter.text, "utf8")),
        ttsAudioSha256: sha256(wavBytes),
        ttsProbe: segmentProbe,
        asrTranscript: transcript,
        asrTranscriptSha256: sha256(Buffer.from(transcript, "utf8")),
        asrSequenceSimilarity: Number.parseFloat(similarity.toFixed(6))
      });
    }

    const temporaryOutputPath = resolve(temporaryDirectory, "proofera-final-demo-mimo-v2.5.mp3");
    assembleNarration(segmentPaths, temporaryOutputPath);
    const outputProbe = probeAudio(temporaryOutputPath, 220, 330);
    const outputBytes = await readFile(temporaryOutputPath);
    const observedAtUtc = new Date().toISOString();
    const asrEvidence = {
      schemaVersion: "proofera-mimo-asr-verification-v1.0.0",
      classification: {
        artifact: "automated_narration_transcript_check",
        humanIntelligibilityAttested: false,
        independentHumanReviewer: false,
        sourceClaimVerification: false
      },
      observedAtUtc,
      provider: "Xiaomi MiMo",
      model: ASR_MODEL,
      language: "en",
      minimumSequenceSimilarity: MINIMUM_ASR_SEQUENCE_SCORE,
      chapters: chapterResults.map(
        ({ key, sourceTextSha256, asrTranscript, asrTranscriptSha256, asrSequenceSimilarity }) => ({
          key,
          sourceTextSha256,
          transcript: asrTranscript,
          transcriptSha256: asrTranscriptSha256,
          sequenceSimilarity: asrSequenceSimilarity
        })
      ),
      limitations: [
        "MiMo ASR checks that generated speech remains machine-transcribable; it is not a human intelligibility or presentation-quality attestation.",
        "Transcript similarity does not verify the truth of narrated product claims; those claims remain bound to repository evidence.",
        "No API key, request header or raw provider response is retained."
      ]
    };
    const asrBytes = Buffer.from(`${JSON.stringify(asrEvidence, null, 2)}\n`, "utf8");
    const manifest = {
      schemaVersion: "proofera-mimo-demo-narration-v1.0.0",
      classification: {
        artifact: "create_only_mimo_tts_narration",
        asrChecked: true,
        humanIntelligibilityAttested: false,
        providerCredentialRetained: false
      },
      observedAtUtc,
      provider: "Xiaomi MiMo",
      apiBaseUrl: baseUrl,
      tts: {
        model: TTS_MODEL,
        voice: source.voice,
        formatRequested: "wav",
        stylePrompt: source.stylePrompt
      },
      asr: {
        model: ASR_MODEL,
        evidencePath: relative(repositoryRoot, asrPath).replaceAll("\\", "/"),
        evidenceSha256: sha256(asrBytes)
      },
      source: {
        path: relative(repositoryRoot, sourcePath).replaceAll("\\", "/"),
        sha256: sha256(sourceBytes),
        chapters: chapterResults.map(({ key, sourceTextSha256, ttsAudioSha256, ttsProbe }) => ({
          key,
          sourceTextSha256,
          ttsAudioSha256,
          ttsProbe
        }))
      },
      output: {
        path: relative(repositoryRoot, outputPath).replaceAll("\\", "/"),
        sha256: sha256(outputBytes),
        probe: outputProbe
      },
      limitations: [
        "The retained audio proves exact generated bytes and media properties, not human-perceived narration quality.",
        "Generation is a one-off interactive development action, not an application backend or production runtime dependency.",
        "The API credential is process-local, is not written to repository files and is removed by the interactive wrapper."
      ]
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await copyFile(temporaryOutputPath, outputPath, fsConstants.COPYFILE_EXCL);
    createdOutputs.push(outputPath);
    await writeFile(asrPath, asrBytes, { flag: "wx" });
    createdOutputs.push(asrPath);
    await writeFile(manifestPath, manifestBytes, { flag: "wx" });
    createdOutputs.push(manifestPath);
    return Object.freeze({
      asr: relative(repositoryRoot, asrPath).replaceAll("\\", "/"),
      asrSha256: sha256(asrBytes),
      chapters: chapterResults.length,
      durationSeconds: outputProbe.durationSeconds,
      manifest: relative(repositoryRoot, manifestPath).replaceAll("\\", "/"),
      manifestSha256: sha256(manifestBytes),
      output: relative(repositoryRoot, outputPath).replaceAll("\\", "/"),
      outputSha256: sha256(outputBytes)
    });
  } catch (error) {
    for (const path of createdOutputs.reverse()) {
      await rm(path, { force: true });
    }
    throw error;
  } finally {
    await rm(temporaryDirectory, { force: true, maxRetries: 20, recursive: true, retryDelay: 250 });
  }
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = await generate();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code =
      typeof error?.message === "string" && /^[A-Z0-9_]+$/u.test(error.message)
        ? error.message
        : "MIMO_NARRATION_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
