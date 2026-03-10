param(
  [switch]$NoInstall,
  [switch]$NoRestore
)

$ErrorActionPreference = "Stop"

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando obrigatorio nao encontrado: $Name"
  }
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
$runtimeDir = Join-Path $root "demo\runtime"
$dumpFile = Join-Path $root "demo\database\vulp_demo.sql"

New-Item -ItemType Directory -Force $runtimeDir | Out-Null

Assert-Command "docker"
Assert-Command "pnpm.cmd"

Set-Location $root

Write-Host "==> Limpando processos antigos nas portas 3000 e 3001..."
Stop-ListenerOnPort -Port 3000
Stop-ListenerOnPort -Port 3001
Start-Sleep -Seconds 1

Write-Host "==> Iniciando infraestrutura Docker..."
pnpm.cmd docker:up

if (-not $NoInstall) {
  Write-Host "==> Instalando dependencias (pode levar alguns minutos)..."
  pnpm.cmd install --frozen-lockfile
}

Write-Host "==> Gerando cliente Prisma e aplicando schema..."
pnpm.cmd --filter @vulp/api prisma:generate
pnpm.cmd --filter @vulp/api db:push

if (-not $NoRestore) {
  if (Test-Path $dumpFile) {
    Write-Host "==> Restaurando base da demo a partir do backup..."
    docker exec vulp-postgres psql -U vulp -d vulpdb -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" | Out-Null
    Get-Content -Raw $dumpFile | docker exec -i vulp-postgres psql -U vulp -d vulpdb | Out-Null
  } else {
    Write-Host "==> Backup nao encontrado. Rodando seed padrao..."
    pnpm.cmd --filter @vulp/api db:seed
  }
}

$apiOut = Join-Path $runtimeDir "api.out.log"
$apiErr = Join-Path $runtimeDir "api.err.log"
$webOut = Join-Path $runtimeDir "web.out.log"
$webErr = Join-Path $runtimeDir "web.err.log"

Write-Host "==> Iniciando API..."
$apiProc = Start-Process -FilePath "pnpm.cmd" -ArgumentList "--filter", "@vulp/api", "dev" -WorkingDirectory $root -PassThru -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr
Set-Content -Path (Join-Path $runtimeDir "api.pid") -Value $apiProc.Id -Encoding ASCII

Write-Host "==> Iniciando Web..."
$webProc = Start-Process -FilePath "pnpm.cmd" -ArgumentList "--filter", "@vulp/web", "dev" -WorkingDirectory $root -PassThru -RedirectStandardOutput $webOut -RedirectStandardError $webErr
Set-Content -Path (Join-Path $runtimeDir "web.pid") -Value $webProc.Id -Encoding ASCII

Start-Sleep -Seconds 4

Write-Host ""
Write-Host "Demo iniciada com sucesso."
Write-Host "Web:  http://localhost:3000"
Write-Host "API:  http://localhost:3001/api/v1/health"
Write-Host "Mail: http://localhost:8025"
Write-Host ""
Write-Host "Logs:"
Write-Host " - $apiOut"
Write-Host " - $webOut"
