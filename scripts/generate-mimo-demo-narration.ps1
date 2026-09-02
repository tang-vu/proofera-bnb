[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$nodeScript = Join-Path $repositoryRoot "scripts/generate-mimo-demo-narration.mjs"
$keyWasPresent = -not [string]::IsNullOrWhiteSpace($env:MIMO_API_KEY)
$plainKey = $null

try {
  if (-not $keyWasPresent) {
    $secureKey = Read-Host "Enter the MiMo API key (input hidden)" -AsSecureString
    $plainKey = [System.Net.NetworkCredential]::new("", $secureKey).Password
    if ([string]::IsNullOrWhiteSpace($plainKey)) {
      throw "A MiMo API key is required."
    }
    $env:MIMO_API_KEY = $plainKey
  }

  & node $nodeScript --generate-exact-mimo-demo-narration
  if ($LASTEXITCODE -ne 0) {
    throw "MiMo narration generator failed with exit code $LASTEXITCODE."
  }
}
finally {
  $plainKey = $null
  if (-not $keyWasPresent) {
    Remove-Item Env:MIMO_API_KEY -ErrorAction SilentlyContinue
  }
}
