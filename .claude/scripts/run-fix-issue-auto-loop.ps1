# Terminal loop runner for the fix-issue-auto skill. Run in a dedicated terminal:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .claude\scripts\run-fix-issue-auto-loop.ps1
#
# Processes one issue per claude run, sequentially, until:
#   - a run errors / exits non-zero (e.g. the usage limit is reached), OR
#   - the skill signals there are no eligible issues left, OR
#   - the optional -MaxRuns cap is reached (0 = unlimited).
# Sequential-by-construction, so the worktree reset in the skill is always safe.
param([int]$MaxRuns = 0)

$ErrorActionPreference = 'Stop'
$repo     = 'C:\Projects\staccato'
$worktree = 'C:\Projects\staccato-fix-issue-agent'
$logDir   = Join-Path $repo '.claude\tmp\fix-issue-auto'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

Set-Location $repo
$runs = 0
while ($true) {
    if ($MaxRuns -gt 0 -and $runs -ge $MaxRuns) {
        Write-Host "Reached MaxRuns=$MaxRuns; stopping."
        break
    }
    $runs++
    $stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
    $runJson = Join-Path $logDir "run-$stamp.json"
    Write-Host "[$stamp] Run #$runs starting..."

    & claude --print "/fix-issue-auto" `
        --model sonnet `
        --add-dir $worktree `
        --permission-mode bypassPermissions `
        --output-format json | Tee-Object -FilePath $runJson | Out-Null
    $exit = $LASTEXITCODE

    if ($exit -ne 0) {
        Write-Host "Run #$runs exited $exit (likely usage limit or fatal error). Stopping. See $runJson."
        break
    }

    try {
        $obj = Get-Content $runJson -Raw | ConvertFrom-Json
    } catch {
        Write-Host "Run #$runs output was not valid JSON; stopping. See $runJson."
        break
    }

    if ($obj.is_error) {
        Write-Host "Run #$runs reported is_error (likely usage limit). Stopping. See $runJson."
        break
    }

    if ([string]$obj.result -match 'FIA_STATUS=no-eligible-issues') {
        Write-Host "No eligible issues remain. Stopping."
        break
    }

    # Safety net: a successful run must emit one of the known FIA_STATUS lines. If none is
    # present (skill bug, truncated output), stop rather than spin forever with -MaxRuns 0.
    if ([string]$obj.result -notmatch 'FIA_STATUS=') {
        Write-Host "Run #$runs emitted no FIA_STATUS line (possible skill bug). Stopping to avoid an infinite loop. See $runJson."
        break
    }

    Write-Host "Run #$runs done. Continuing to next issue."
    Start-Sleep -Seconds 3   # brief pause; lets you Ctrl+C between runs
}
Write-Host "Loop finished after $runs run(s)."
