$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version 3.0

$expectedRepositoryRoot = 'C:\Users\tangm\Documents\GitHub\proofera-bnb'
$expectedScriptPath = 'C:\Users\tangm\Documents\GitHub\proofera-bnb\scripts\run-bsc-testnet-pta-wbnb-pool-phase-minus-one.ps1'
$expectedPhaseZeroPath = 'C:\Users\tangm\Documents\GitHub\proofera-bnb\scripts\run-bsc-testnet-pta-wbnb-pool-phase0.mjs'
$expectedLabels = @(
  '--release-commit',
  '--release-tree',
  '--runtime-manifest-sha256'
)

function Fail-Closed {
  [Console]::Out.WriteLine('{"status":"blocked","code":"PHASE_MINUS_ONE_BOOTSTRAP_FAILED","message":"The trusted Windows bootstrap failed closed before Node startup."}')
  exit 1
}

try {
  if (
    [System.IO.Path]::GetFullPath($PSCommandPath) -ine $expectedScriptPath -or
    [System.IO.Path]::GetFullPath([Environment]::CurrentDirectory) -ine $expectedRepositoryRoot -or
    $args.Count -ne 6 -or
    $args[0] -cne $expectedLabels[0] -or
    $args[2] -cne $expectedLabels[1] -or
    $args[4] -cne $expectedLabels[2] -or
    $args[1] -cnotmatch '^[0-9a-f]{40}$' -or
    $args[3] -cnotmatch '^[0-9a-f]{40}$' -or
    $args[5] -cnotmatch '^0x[0-9a-f]{64}$' -or
    $args[1] -ceq ('0' * 40) -or
    $args[3] -ceq ('0' * 40) -or
    $args[5] -ceq ('0x' + ('00' * 32))
  ) {
    Fail-Closed
  }

  $releaseCommit = [string]$args[1]
  $releaseTree = [string]$args[3]
  $runtimeManifestSha256 = [string]$args[5]

  foreach ($name in @([Environment]::GetEnvironmentVariables('Process').Keys)) {
    [Environment]::SetEnvironmentVariable([string]$name, $null, 'Process')
  }

  $fixedEnvironment = [ordered]@{
    HOMEDRIVE = 'C:'
    HOMEPATH = '\Users\tangm'
    LOGONSERVER = '\\DESKTOP-1A6OPC9'
    PATH = 'C:\Windows\System32'
    SYSTEMDRIVE = 'C:'
    SystemRoot = 'C:\Windows'
    TEMP = 'C:\Users\tangm\AppData\Local\Temp'
    USERDOMAIN = 'DESKTOP-1A6OPC9'
    USERNAME = 'tangm'
    USERPROFILE = 'C:\Users\tangm'
    WINDIR = 'C:\Windows'
    WS_NO_BUFFER_UTIL = '1'
    WS_NO_UTF_8_VALIDATE = '1'
  }
  foreach ($entry in $fixedEnvironment.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable(
      [string]$entry.Key,
      [string]$entry.Value,
      'Process'
    )
  }

  $childArguments = @(
    $expectedPhaseZeroPath,
    '--release-commit',
    $releaseCommit,
    '--release-tree',
    $releaseTree,
    '--runtime-manifest-sha256',
    $runtimeManifestSha256
  )
  & 'D:\Node\node.exe' @childArguments
  $childExitCode = $LASTEXITCODE
  if ($null -eq $childExitCode -or $childExitCode -lt 0 -or $childExitCode -gt 255) {
    Fail-Closed
  }
  exit $childExitCode
} catch {
  Fail-Closed
}
