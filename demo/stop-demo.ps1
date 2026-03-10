$ErrorActionPreference = "Continue"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root "demo\runtime"

function Stop-FromPidFile {
  param(
    [string]$Name
  )

  $pidFile = Join-Path $runtimeDir "$Name.pid"
  if (-not (Test-Path $pidFile)) {
    return
  }

  try {
    $processId = [int](Get-Content -Raw $pidFile)
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      Write-Host "Processo $Name encerrado (PID $processId)."
    } else {
      Write-Host "Processo $Name ja estava encerrado."
    }
  } catch {
    Write-Host "Nao foi possivel ler PID de $Name."
  }

  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
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

Stop-FromPidFile -Name "api"
Stop-FromPidFile -Name "web"
Stop-ListenerOnPort -Port 3000
Stop-ListenerOnPort -Port 3001

Set-Location $root
pnpm.cmd docker:down | Out-Null

Write-Host "Demo finalizada."
