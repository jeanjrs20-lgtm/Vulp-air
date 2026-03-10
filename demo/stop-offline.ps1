$ErrorActionPreference = "Continue"

function Stop-FromPidFile {
  param(
    [string]$PidFile,
    [string]$Name
  )

  if (-not (Test-Path $PidFile)) {
    return
  }

  try {
    $processId = [int](Get-Content -Raw $PidFile)
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      Write-Host "Processo $Name encerrado (PID $processId)."
    }
  } catch {}

  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-ListenerOnPort {
  param([int]$Port)

  $lines = netstat -ano | Select-String ":$Port\s"
  if (-not $lines) {
    return
  }

  $pids = @()
  foreach ($line in $lines) {
    $raw = ($line.ToString() -replace "\s+", " ").Trim()
    $parts = $raw.Split(" ")
    if ($parts.Count -ge 5) {
      $pidText = $parts[$parts.Count - 1]
      $processId = 0
      if ([int]::TryParse($pidText, [ref]$processId)) {
        $pids += $processId
      }
    }
  }

  $pids = $pids | Sort-Object -Unique
  foreach ($processId in $pids) {
    if ($processId -gt 0) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root "demo\runtime-offline"
$pgRootCandidates = @(
  (Join-Path $root "tools\postgres\pgsql"),
  (Join-Path $root "tools\postgres2\pgsql")
)
$pgRoot = $pgRootCandidates | Where-Object { Test-Path (Join-Path $_ "share\postgres.bki") } | Select-Object -First 1
$pgBin = if ($pgRoot) { Join-Path $pgRoot "bin" } else { Join-Path $root "tools\postgres\pgsql\bin" }
$pgCtlExe = Join-Path $pgBin "pg_ctl.exe"
$pgData = Join-Path $runtimeDir "pgdata"

Stop-FromPidFile -PidFile (Join-Path $runtimeDir "api.pid") -Name "api"
Stop-FromPidFile -PidFile (Join-Path $runtimeDir "web.pid") -Name "web"

if ((Test-Path $pgCtlExe) -and (Test-Path $pgData)) {
  & $pgCtlExe -D $pgData stop | Out-Null
}

Stop-ListenerOnPort -Port 3000
Stop-ListenerOnPort -Port 3001
Stop-ListenerOnPort -Port 5433

Write-Host "Demo offline finalizada."
