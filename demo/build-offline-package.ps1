$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$exportsDir = Join-Path $root "exports"
$target = Join-Path $exportsDir "vulp-air-offline-demo-$stamp"
$zipPath = "$target.zip"
$cacheDir = Join-Path $root "demo\offline-cache"

$nodeZipUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
$nodeZipPath = Join-Path $cacheDir "node-v20.18.0-win-x64.zip"

$pgZipUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip"
$pgZipPath = Join-Path $cacheDir "postgresql-16.4-1-windows-x64-binaries.zip"

$pnpmTgzUrl = "https://registry.npmjs.org/pnpm/-/pnpm-10.6.3.tgz"
$pnpmTgzPath = Join-Path $cacheDir "pnpm-10.6.3.tgz"

function Copy-Tree {
  param(
    [string]$Source,
    [string]$Destination
  )

  robocopy $Source $Destination /E /NFL /NDL /NJH /NJS /NP /XD node_modules .next .turbo dist logs .git exports demo\runtime demo\runtime-offline > $null
  if ($LASTEXITCODE -gt 7) {
    throw "Falha ao copiar: $Source"
  }
}

function Ensure-Download {
  param(
    [string]$Url,
    [string]$Path
  )

  if (Test-Path $Path) {
    return
  }
  Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing
}

New-Item -ItemType Directory -Force $exportsDir | Out-Null
New-Item -ItemType Directory -Force $cacheDir | Out-Null
New-Item -ItemType Directory -Force $target | Out-Null

Write-Host "==> Baixando runtimes portateis (cache local)..."
Ensure-Download -Url $nodeZipUrl -Path $nodeZipPath
Ensure-Download -Url $pgZipUrl -Path $pgZipPath
Ensure-Download -Url $pnpmTgzUrl -Path $pnpmTgzPath

Write-Host "==> Copiando projeto..."
Copy-Item -Path (Join-Path $root "package.json") -Destination (Join-Path $target "package.json")
Copy-Item -Path (Join-Path $root "pnpm-lock.yaml") -Destination (Join-Path $target "pnpm-lock.yaml")
Copy-Item -Path (Join-Path $root "pnpm-workspace.yaml") -Destination (Join-Path $target "pnpm-workspace.yaml")
Copy-Item -Path (Join-Path $root "turbo.json") -Destination (Join-Path $target "turbo.json")
Copy-Item -Path (Join-Path $root "tsconfig.base.json") -Destination (Join-Path $target "tsconfig.base.json")
Copy-Item -Path (Join-Path $root "docker-compose.yml") -Destination (Join-Path $target "docker-compose.yml")
Copy-Item -Path (Join-Path $root "README.md") -Destination (Join-Path $target "README.md")

Copy-Tree (Join-Path $root "apps\api") (Join-Path $target "apps\api")
Copy-Tree (Join-Path $root "apps\web") (Join-Path $target "apps\web")
Copy-Tree (Join-Path $root "packages") (Join-Path $target "packages")
if (Test-Path (Join-Path $root "storage")) {
  Copy-Tree (Join-Path $root "storage") (Join-Path $target "storage")
}
Copy-Tree (Join-Path $root "demo") (Join-Path $target "demo")

Write-Host "==> Extraindo Node, PostgreSQL e pnpm..."
$toolsDir = Join-Path $target "tools"
New-Item -ItemType Directory -Force $toolsDir | Out-Null

Expand-Archive -Path $nodeZipPath -DestinationPath $toolsDir -Force
New-Item -ItemType Directory -Force (Join-Path $toolsDir "node") | Out-Null
Move-Item -Force (Join-Path $toolsDir "node-v20.18.0-win-x64\*") (Join-Path $toolsDir "node")
Remove-Item -Recurse -Force (Join-Path $toolsDir "node-v20.18.0-win-x64")

New-Item -ItemType Directory -Force (Join-Path $toolsDir "postgres") | Out-Null
tar -xf $pgZipPath -C (Join-Path $toolsDir "postgres")

New-Item -ItemType Directory -Force (Join-Path $toolsDir "pnpm") | Out-Null
tar -xf $pnpmTgzPath -C (Join-Path $toolsDir "pnpm")

Write-Host "==> Preparando store offline do pnpm..."
Set-Location $target
Set-Content -Path (Join-Path $target ".npmrc") -Value "store-dir=.pnpm-store`n" -Encoding ASCII
& (Join-Path $toolsDir "node\node.exe") (Join-Path $toolsDir "pnpm\package\bin\pnpm.cjs") fetch

if (Test-Path (Join-Path $target "node_modules")) {
  $nodeModulesPath = Join-Path $target "node_modules"
  cmd /c "rmdir /s /q `"$nodeModulesPath`"" | Out-Null

  if (Test-Path $nodeModulesPath) {
    $emptyDir = Join-Path $target ".empty"
    New-Item -ItemType Directory -Force $emptyDir | Out-Null
    robocopy $emptyDir $nodeModulesPath /MIR /NFL /NDL /NJH /NJS /NP > $null
    cmd /c "rmdir /s /q `"$nodeModulesPath`"" | Out-Null
    Remove-Item -Force -ErrorAction SilentlyContinue $emptyDir
  }
}

Write-Host "==> Compactando pacote offline..."
if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Set-Location $exportsDir
tar -a -c -f $zipPath -C $target .

Write-Host ""
Write-Host "Pacote offline criado:"
Write-Host $zipPath
