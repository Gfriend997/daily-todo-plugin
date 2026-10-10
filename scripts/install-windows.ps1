[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Vault,
    [string]$ConfigPath,
    [string]$PluginRoot,
    [string]$NodePath,
    [switch]$Preview
)
$ErrorActionPreference = 'Stop'
$taskName = 'DailyTodo-GWBrain'
$taskOwner = 'daily-todo-plugin: managed morning rollover v1'

function AbsolutePath([string]$Value) {
    if (-not [IO.Path]::IsPathRooted($Value) -or $Value -match '["\r\n]') { throw 'Use an absolute path without quotes or line breaks.' }
    return [IO.Path]::GetFullPath($Value).TrimEnd('\', '/')
}
function Inside([string]$Child, [string]$Parent) {
    return $Child.Equals($Parent, [StringComparison]::OrdinalIgnoreCase) -or $Child.StartsWith($Parent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}
function PlainPath([string]$Value) {
    $cursor = $Value
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                # OneDrive cloud tags do not redirect paths; junctions and unknown tags remain blocked.
                $tagOutput = & "$env:SystemRoot/System32/fsutil.exe" reparsepoint query $cursor 2>$null
                $tag = [regex]::Match(($tagOutput -join "`n"), '0x[0-9a-fA-F]{8}').Value
                if ($LASTEXITCODE -ne 0 -or $tag -notmatch '^0x9000[0-9a-f]01a$') { throw 'Redirecting or unknown reparse-point paths are not supported.' }
            }
        }
        $parent = Split-Path $cursor -Parent
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
}
function EscapeXml([string]$Value) { return [Security.SecurityElement]::Escape($Value) }

if (-not $PluginRoot) { $PluginRoot = Split-Path $PSScriptRoot -Parent }
$PluginRoot = AbsolutePath $PluginRoot
$Vault = AbsolutePath $Vault
if (-not $ConfigPath) {
    $codexDirectory = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
    $ConfigPath = Join-Path $codexDirectory 'daily-todo/config.json'
}
$ConfigPath = AbsolutePath $ConfigPath
$sourceRoot = AbsolutePath (Split-Path $PSScriptRoot -Parent)
if ((Inside $ConfigPath $PluginRoot) -or (Inside $ConfigPath $sourceRoot) -or (Inside $Vault $PluginRoot) -or (Inside $Vault $sourceRoot)) {
    throw 'Private configuration and vault must live outside the public plugin repository.'
}
PlainPath $Vault
PlainPath $ConfigPath
PlainPath $PluginRoot
if (-not (Test-Path -LiteralPath $Vault -PathType Container)) { throw 'Vault directory is missing.' }
if (-not (Test-Path -LiteralPath (Join-Path $PluginRoot 'scripts/morning.ps1') -PathType Leaf)) { throw 'Plugin morning script is missing.' }
if (-not $NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
$NodePath = AbsolutePath $NodePath
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node executable is missing.' }
$nodeVersion = & $NodePath --version
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw 'Node.js 22 or newer is required.' }
$config = [ordered]@{
    vault = $Vault
    timezone = 'America/Los_Angeles'
    todoDirectory = '01 Daily/To-do'
    workingDirectory = '07 System/Working'
    retentionDays = 14
}
$configExists = Test-Path -LiteralPath $ConfigPath
if ($configExists) {
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { throw 'Config path is not a regular file.' }
    $existingConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    foreach ($key in $config.Keys) {
        if ($existingConfig.$key -ne $config[$key]) { throw 'Existing config differs. Review it privately; installer will not overwrite it.' }
    }
}
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $PluginRoot 'scripts/morning.ps1') + '" -ConfigPath "' + $ConfigPath + '" -NodePath "' + $NodePath + '"'
$powershellPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$escapedArguments = EscapeXml $arguments
$escapedPowerShell = EscapeXml $powershellPath
$escapedOwner = EscapeXml $taskOwner
# UTC repetition plus the Pacific gate keeps 06:00 correct across host zones and DST.
$taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>$escapedOwner</Description></RegistrationInfo>
  <Triggers>
    <TimeTrigger><Repetition><Interval>PT5M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>2020-01-01T00:00:00Z</StartBoundary><Enabled>true</Enabled></TimeTrigger>
    <LogonTrigger><Enabled>true</Enabled><UserId>$sid</UserId></LogonTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>$sid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT2M</ExecutionTimeLimit><Enabled>true</Enabled></Settings>
  <Actions Context="Author"><Exec><Command>$escapedPowerShell</Command><Arguments>$escapedArguments</Arguments></Exec></Actions>
</Task>
"@
if ($Preview) {
    [ordered]@{ configPath = $ConfigPath; config = $config; taskName = $taskName; taskXml = $taskXml; configExists = [bool]$configExists } | ConvertTo-Json -Depth 6
    exit 0
}

# Read the exact name only. Never replace another owner's task or touch unrelated tasks.
$existingTask = Get-ScheduledTask -TaskPath '\' -ErrorAction Stop | Where-Object { $_.TaskName -eq $taskName }
if ($existingTask -and $existingTask.Description -ne $taskOwner) { throw 'Scheduled-task name belongs to another task. No changes made.' }
if (-not $configExists) {
    $configDirectory = Split-Path $ConfigPath -Parent
    [IO.Directory]::CreateDirectory($configDirectory) | Out-Null
    PlainPath $ConfigPath
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($config | ConvertTo-Json))
    $temporaryConfig = Join-Path $configDirectory (([Guid]::NewGuid().ToString()) + '.tmp')
    try {
        $stream = [IO.File]::Open($temporaryConfig, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
        [IO.File]::Move($temporaryConfig, $ConfigPath)
    } finally {
        if (Test-Path -LiteralPath $temporaryConfig) { Remove-Item -LiteralPath $temporaryConfig -Force }
    }
}
Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Xml $taskXml -Force:([bool]$existingTask) | Out-Null
[ordered]@{ configPath = $ConfigPath; taskName = $taskName; installed = $true; loggedOnUserRequired = $true } | ConvertTo-Json
