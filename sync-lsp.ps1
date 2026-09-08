$ErrorActionPreference = 'Stop'

$Source = Join-Path $env:OneDrive '20251229_LSP管理.xlsx'
$Repository = Split-Path -Parent $PSCommandPath
$Destination = Join-Path $Repository 'data\20251229_LSP管理.xlsx'
$SpreadsheetPath = 'data/20251229_LSP管理.xlsx'

function Write-Info([string]$Message) { Write-Host "[INFO] $Message" }
function Stop-WithError([string]$Message) { Write-Host "[ERROR] $Message"; exit 1 }

try {
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        Stop-WithError "OneDrive Excel was not found: $Source"
    }
    Write-Info 'OneDrive Excel found'

    # Demand exclusive read access before touching the repository so a locked or syncing file stops here.
    try {
        $stream = [System.IO.File]::Open($Source, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
        try {
            $memory = New-Object System.IO.MemoryStream
            $stream.CopyTo($memory)
            $sourceBytes = $memory.ToArray()
        } finally {
            if ($stream) { $stream.Dispose() }
            if ($memory) { $memory.Dispose() }
        }
        if ($sourceBytes.Length -eq 0) { throw 'The source file is empty.' }
    } catch {
        Stop-WithError "OneDrive Excel cannot be read safely: $($_.Exception.Message)"
    }

    $sourceHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
    $destinationHash = if (Test-Path -LiteralPath $Destination -PathType Leaf) {
        (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
    } else {
        $null
    }
    if ($sourceHash -eq $destinationHash) {
        Write-Info 'No changes detected'
        exit 0
    }

    $staged = @(git -C $Repository diff --cached --name-only)
    $unexpectedStaged = @($staged | Where-Object { $_ -ne $SpreadsheetPath })
    if ($unexpectedStaged.Count -gt 0) {
        Stop-WithError "Other files are already staged: $($unexpectedStaged -join ', ')"
    }

    git -C $Repository fetch origin main | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'Could not fetch origin/main.' }
    $aheadBehind = (git -C $Repository rev-list --left-right --count HEAD...origin/main).Trim() -split '\s+'
    if ([int]$aheadBehind[1] -gt 0) {
        Stop-WithError 'origin/main is ahead of local HEAD. No merge, rebase, copy, commit, or push was performed.'
    }

    $temporaryDestination = "$Destination.syncing"
    $replacementBackup = "$Destination.sync-backup"
    try {
        if (Test-Path -LiteralPath $replacementBackup -PathType Leaf) {
            throw "Previous replacement backup remains: $replacementBackup"
        }
        [System.IO.File]::WriteAllBytes($temporaryDestination, $sourceBytes)
        $temporaryHash = (Get-FileHash -LiteralPath $temporaryDestination -Algorithm SHA256).Hash
        if ($temporaryHash -ne $sourceHash) { throw 'Temporary copy hash did not match the OneDrive source.' }
        if (Test-Path -LiteralPath $Destination -PathType Leaf) {
            [System.IO.File]::Replace($temporaryDestination, $Destination, $replacementBackup)
            Remove-Item -LiteralPath $replacementBackup -Force
        } else {
            [System.IO.File]::Move($temporaryDestination, $Destination)
        }
    } finally {
        if (Test-Path -LiteralPath $temporaryDestination -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryDestination -Force
        }
    }
    Write-Info 'Excel changed'
    Write-Info 'Copied Excel to repository'

    git -C $Repository add -- $SpreadsheetPath
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'Could not stage the spreadsheet.' }
    git -C $Repository commit -m 'Update LSP management spreadsheet' -- $SpreadsheetPath
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'Could not create the spreadsheet commit.' }
    Write-Info 'Created commit'

    git -C $Repository push origin main
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'Push failed.' }
    Write-Info 'Push completed'
} catch {
    Stop-WithError $_.Exception.Message
}
