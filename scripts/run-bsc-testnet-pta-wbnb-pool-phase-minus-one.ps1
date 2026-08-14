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

function Disable-ConsoleQuickEdit {
  # Use the console P/Invokes already present in the pinned .NET Framework runtime, with no runtime
  # source compilation, and change only ENABLE_EXTENDED_FLAGS/ENABLE_QUICK_EDIT_MODE.
  # It never reads, flushes, synthesizes, or writes console input bytes
  $bindingFlags = [System.Reflection.BindingFlags]::NonPublic -bor
    [System.Reflection.BindingFlags]::Static
  $nativeType = [Console].Assembly.GetType('Microsoft.Win32.Win32Native', $false, $false)
  if ($null -eq $nativeType) { throw 'console-native-type' }

  $getStdHandle = $nativeType.GetMethod(
    'GetStdHandle',
    $bindingFlags,
    $null,
    [Type[]]@([Int32]),
    $null
  )
  $getConsoleMode = $nativeType.GetMethod(
    'GetConsoleMode',
    $bindingFlags,
    $null,
    [Type[]]@([IntPtr], [Int32].MakeByRefType()),
    $null
  )
  $setConsoleMode = $nativeType.GetMethod(
    'SetConsoleMode',
    $bindingFlags,
    $null,
    [Type[]]@([IntPtr], [Int32]),
    $null
  )
  if ($null -eq $getStdHandle -or $null -eq $getConsoleMode -or $null -eq $setConsoleMode) {
    throw 'console-native-method'
  }

  $inputHandle = [IntPtr]$getStdHandle.Invoke($null, [object[]]@([Int32]-10))
  if ($inputHandle -eq [IntPtr]::Zero -or $inputHandle -eq [IntPtr](-1)) {
    throw 'console-input-handle'
  }
  $modeArguments = [object[]]@($inputHandle, [Int32]0)
  if (-not [bool]$getConsoleMode.Invoke($null, $modeArguments)) {
    throw 'console-input-mode'
  }

  $enableQuickEditMode = [Int32]0x0040
  $enableExtendedFlags = [Int32]0x0080
  $mutableMask = [Int32]($enableQuickEditMode -bor $enableExtendedFlags)
  $originalMode = [Int32]$modeArguments[1]
  $hardenedMode = [Int32](
    ($originalMode -band (-bnot $enableQuickEditMode)) -bor $enableExtendedFlags
  )
  if (-not [bool]$setConsoleMode.Invoke(
    $null,
    [object[]]@($inputHandle, $hardenedMode)
  )) {
    throw 'console-set-mode'
  }

  $verifiedArguments = [object[]]@($inputHandle, [Int32]0)
  if (-not [bool]$getConsoleMode.Invoke($null, $verifiedArguments)) {
    throw 'console-verify-mode'
  }
  $verifiedMode = [Int32]$verifiedArguments[1]
  if (
    ($verifiedMode -band $enableQuickEditMode) -ne 0 -or
    ($verifiedMode -band $enableExtendedFlags) -eq 0 -or
    ($verifiedMode -band (-bnot $mutableMask)) -ne
      ($originalMode -band (-bnot $mutableMask))
  ) {
    throw 'console-mode-mismatch'
  }
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

  # This runs before phase zero, policy admission, and owner TTY input. QuickEdit selection can no
  # longer suspend the guarded process while preserving the existing line/echo input semantics.
  Disable-ConsoleQuickEdit

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
