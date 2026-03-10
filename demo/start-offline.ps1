param(
  [switch]$RestoreFromDump,
  [switch]$ForceReinstall,
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

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

function Invoke-Checked {
  param(
    [string]$Step,
    [scriptblock]$Command
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Step falhou (codigo $LASTEXITCODE)."
  }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root "demo\runtime-offline"
$toolsDir = Join-Path $root "tools"
$nodeExe = Join-Path $toolsDir "node\node.exe"
$pnpmCli = Join-Path $toolsDir "pnpm\package\bin\pnpm.cjs"
$pgRootCandidates = @(
  (Join-Path $toolsDir "postgres\pgsql"),
  (Join-Path $toolsDir "postgres2\pgsql")
)
$pgRoot = $pgRootCandidates | Where-Object { Test-Path (Join-Path $_ "share\postgres.bki") } | Select-Object -First 1
if (-not $pgRoot) {
  throw "PostgreSQL portatil invalido: share/postgres.bki nao encontrado."
}

$pgBin = Join-Path $pgRoot "bin"
$pgShare = (Resolve-Path (Join-Path $pgRoot "share")).Path
$pgCtlExe = Join-Path $pgBin "pg_ctl.exe"
$initDbExe = Join-Path $pgBin "initdb.exe"
$psqlExe = Join-Path $pgBin "psql.exe"
$createdbExe = Join-Path $pgBin "createdb.exe"
$pgIsReadyExe = Join-Path $pgBin "pg_isready.exe"
$dumpFile = Join-Path $root "demo\database\vulp_demo.sql"
$pgData = Join-Path $runtimeDir "pgdata"
$pgLog = Join-Path $runtimeDir "postgres.log"

if (-not (Test-Path $nodeExe)) { throw "Node portatil nao encontrado em $nodeExe" }
if (-not (Test-Path $pnpmCli)) { throw "pnpm embutido nao encontrado em $pnpmCli" }
if (-not (Test-Path $pgCtlExe)) { throw "PostgreSQL portatil nao encontrado em $pgCtlExe" }

New-Item -ItemType Directory -Force $runtimeDir | Out-Null

Stop-ListenerOnPort -Port 3000
Stop-ListenerOnPort -Port 3001
Stop-ListenerOnPort -Port 5433
Start-Sleep -Seconds 1

Set-Location $root

$env:PATH = "$toolsDir\node;$pgBin;$env:PATH"
$env:PGSHARE = $pgShare
$env:NODE_ENV = "production"

$installMarker = Join-Path $runtimeDir "install.done"
$buildMarker = Join-Path $runtimeDir "build.done"

if ($ForceReinstall) {
  Remove-Item -Force -ErrorAction SilentlyContinue $installMarker
  Remove-Item -Force -ErrorAction SilentlyContinue $buildMarker
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $root "node_modules")
}

if (-not (Test-Path $installMarker)) {
  Write-Host "==> Instalando dependencias em modo offline..."
  Invoke-Checked "pnpm install offline" { & $nodeExe $pnpmCli install --offline --frozen-lockfile }

  Write-Host "==> Rebuild de dependencias nativas..."
  Invoke-Checked "pnpm rebuild nativo" {
    & $nodeExe $pnpmCli rebuild @prisma/client @prisma/engines esbuild prisma protobufjs sharp
  }

  Set-Content -Path $installMarker -Value (Get-Date).ToString("s") -Encoding ASCII
}

if (-not (Test-Path $pgData)) {
  Write-Host "==> Inicializando PostgreSQL portatil..."
  Invoke-Checked "initdb" { & $initDbExe -D $pgData -U vulp -A trust --encoding=UTF8 -L $pgShare }
}

Write-Host "==> Iniciando PostgreSQL portatil na porta 5433..."
Invoke-Checked "pg_ctl start" { & $pgCtlExe -D $pgData -l $pgLog -o "-p 5433" start }

for ($i = 0; $i -lt 30; $i++) {
  & $pgIsReadyExe -h localhost -p 5433 -U vulp -d postgres | Out-Null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Milliseconds 500
}
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL nao respondeu na porta 5433."
}

$dbExistsRaw = & $psqlExe -h localhost -p 5433 -U vulp -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='vulpdb';"
$dbExists = "$dbExistsRaw".Trim()
if ($dbExists -ne "1") {
  Invoke-Checked "createdb vulpdb" { & $createdbExe -h localhost -p 5433 -U vulp vulpdb }
}

if ($RestoreFromDump -and (Test-Path $dumpFile)) {
  Write-Host "==> Restaurando base da demo via dump..."
  try {
    Invoke-Checked "drop/create schema" { & $psqlExe -h localhost -p 5433 -U vulp -d vulpdb -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" }
    Get-Content -Raw $dumpFile | & $psqlExe -h localhost -p 5433 -U vulp -d vulpdb
    if ($LASTEXITCODE -ne 0) {
      throw "Falha no restore do dump."
    }
  } catch {
    Write-Warning "Restore do dump falhou; continuando com db:push + seed."
    Invoke-Checked "reset schema apos falha do restore" {
      & $psqlExe -h localhost -p 5433 -U vulp -d vulpdb -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
    }
  }
}

Write-Host "==> Aplicando schema Prisma..."
Invoke-Checked "prisma db:push" { & $nodeExe $pnpmCli --filter @vulp/api db:push }

Write-Host "==> Gerando dados da demo..."
Invoke-Checked "prisma db:seed" { & $nodeExe $pnpmCli --filter @vulp/api db:seed }

if ($Rebuild -or -not (Test-Path $buildMarker)) {
  Write-Host "==> Build da WEB para modo demo..."
  Invoke-Checked "web build" { & $nodeExe $pnpmCli --filter @vulp/web build }
  Set-Content -Path $buildMarker -Value (Get-Date).ToString("s") -Encoding ASCII
}

$apiOut = Join-Path $runtimeDir "api.out.log"
$apiErr = Join-Path $runtimeDir "api.err.log"
$webOut = Join-Path $runtimeDir "web.out.log"
$webErr = Join-Path $runtimeDir "web.err.log"

Write-Host "==> Iniciando API..."
$apiProc = Start-Process -FilePath $nodeExe -ArgumentList "`"$pnpmCli`"", "--filter", "@vulp/api", "dev" -WorkingDirectory $root -PassThru -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr
Set-Content -Path (Join-Path $runtimeDir "api.pid") -Value $apiProc.Id -Encoding ASCII

Write-Host "==> Iniciando WEB..."
$webProc = Start-Process -FilePath $nodeExe -ArgumentList "`"$pnpmCli`"", "--filter", "@vulp/web", "start" -WorkingDirectory $root -PassThru -RedirectStandardOutput $webOut -RedirectStandardError $webErr
Set-Content -Path (Join-Path $runtimeDir "web.pid") -Value $webProc.Id -Encoding ASCII

Write-Host ""
Write-Host "Demo offline iniciada."
Write-Host "Web:  http://localhost:3000"
Write-Host "API:  http://localhost:3001/api/v1/health"
Write-Host ""
Write-Host "Credenciais:"
Write-Host " - superadmin@vulp.local / 123456"
Write-Host " - tecnico@vulp.local / 123456"
Write-Host ""
Write-Host "Logs:"
Write-Host " - $apiOut"
Write-Host " - $webOut"
