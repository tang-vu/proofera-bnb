[CmdletBinding()]
param(
  [string] $InputPath = "evidence/submission/narration/proofera-final-demo-script.txt",
  [string] $OutputPath = "evidence/submission/narration/proofera-final-demo.mp3"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$expectedNarrationRoot = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot "evidence/submission/narration")).Path
$resolvedInput = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot $InputPath)).Path
$resolvedOutput = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputPath))
$narrationPrefix = "$expectedNarrationRoot$([IO.Path]::DirectorySeparatorChar)"

if (-not $resolvedInput.StartsWith($narrationPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Narration input must stay under evidence/submission/narration."
}
if (-not $resolvedOutput.StartsWith($narrationPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Narration output must stay under evidence/submission/narration."
}
if ([IO.Path]::GetExtension($resolvedInput) -ne ".txt" -or [IO.Path]::GetExtension($resolvedOutput) -ne ".mp3") {
  throw "Narration generation requires a .txt input and .mp3 output."
}
if (Test-Path -LiteralPath $resolvedOutput) {
  throw "Narration output already exists; generation is create-only."
}

$null = Get-Command ffmpeg -ErrorAction Stop
$null = Get-Command ffprobe -ErrorAction Stop
$temporaryWave = Join-Path ([IO.Path]::GetTempPath()) ("proofera-final-demo-{0}.wav" -f [Guid]::NewGuid().ToString("N"))

try {
  Add-Type -AssemblyName System.Speech
  $synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $synthesizer.SelectVoice("Microsoft Zira Desktop")
    $synthesizer.Rate = 0
    $synthesizer.Volume = 100
    $synthesizer.SetOutputToWaveFile($temporaryWave)
    $synthesizer.Speak((Get-Content -LiteralPath $resolvedInput -Raw -Encoding UTF8))
  }
  finally {
    $synthesizer.Dispose()
  }

  & ffmpeg -hide_banner -loglevel error -n -i $temporaryWave -codec:a libmp3lame -b:a 192k $resolvedOutput
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed with exit code $LASTEXITCODE."
  }

  $probe = & ffprobe -v error -show_entries "format=duration,size:stream=codec_name,sample_rate,channels" -of json $resolvedOutput
  if ($LASTEXITCODE -ne 0) {
    throw "ffprobe failed with exit code $LASTEXITCODE."
  }
  $media = $probe | ConvertFrom-Json
  $durationSeconds = [double] $media.format.duration
  if ($durationSeconds -lt 240 -or $durationSeconds -gt 330) {
    throw "Narration duration $durationSeconds seconds is outside the required 240-330 second window."
  }

  [ordered]@{
    output = $OutputPath.Replace("\", "/")
    sha256 = "0x$((Get-FileHash -LiteralPath $resolvedOutput -Algorithm SHA256).Hash.ToLowerInvariant())"
    bytes = (Get-Item -LiteralPath $resolvedOutput).Length
    durationSeconds = $durationSeconds.ToString("F3", [Globalization.CultureInfo]::InvariantCulture)
    codec = $media.streams[0].codec_name
    sampleRate = $media.streams[0].sample_rate
    channels = $media.streams[0].channels
    voice = "Microsoft Zira Desktop"
    rate = 0
  } | ConvertTo-Json -Compress
}
catch {
  if (Test-Path -LiteralPath $resolvedOutput) {
    Remove-Item -LiteralPath $resolvedOutput -Force
  }
  throw
}
finally {
  if (Test-Path -LiteralPath $temporaryWave) {
    Remove-Item -LiteralPath $temporaryWave -Force
  }
}
