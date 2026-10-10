[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [string]$NodePath = 'node.exe',
    [switch]$Preview,
    [DateTimeOffset]$NowUtc = [DateTimeOffset]::UtcNow
)
$ErrorActionPreference = 'Stop'
try {
    if (-not $Preview -and $PSBoundParameters.ContainsKey('NowUtc')) {
        throw 'Clock injection is allowed only in preview mode.'
    }
    $pacificZone = [TimeZoneInfo]::FindSystemTimeZoneById('Pacific Standard Time')
    $localTime = [TimeZoneInfo]::ConvertTime($NowUtc, $pacificZone)
    $due = $localTime.Hour -ge 6
    if ($Preview) {
        [ordered]@{ date = $localTime.ToString('yyyy-MM-dd'); due = $due; timezone = 'America/Los_Angeles' } | ConvertTo-Json -Compress
        exit 0
    }
    if (-not $due) { exit 0 }
    if (-not [IO.Path]::IsPathRooted($ConfigPath)) { throw 'Config path must be absolute.' }
    # The shared helper owns locking, idempotency, rollover, and verified cleanup.
    & $NodePath (Join-Path $PSScriptRoot 'daily-todo.mjs') startup --config $ConfigPath --json | Out-Null
    exit $LASTEXITCODE
} catch {
    Write-Error 'Daily To-do morning run failed. Check the private config and shared helper directly.' -ErrorAction Continue
    exit 1
}
