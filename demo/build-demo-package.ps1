$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$targetRoot = Join-Path $root "exports"
$target = Join-Path $targetRoot "vulp-air-demo-package-$stamp"
$zipPath = "$target.zip"

New-Item -ItemType Directory -Force $targetRoot | Out-Null
New-Item -ItemType Directory -Force $target | Out-Null

function Copy-Tree {
  param(
    [string]$Source,
    [string]$Destination
  )

  robocopy $Source $Destination /E /NFL /NDL /NJH /NJS /NP /XD node_modules .next .turbo dist logs .git > $null
  if ($LASTEXITCODE -gt 7) {
    throw "Falha ao copiar: $Source"
  }
}

Write-Host "==> Copiando arquivos base..."
Copy-Item -Path (Join-Path $root "package.json") -Destination (Join-Path $target "package.json")
Copy-Item -Path (Join-Path $root "pnpm-lock.yaml") -Destination (Join-Path $target "pnpm-lock.yaml")
Copy-Item -Path (Join-Path $root "pnpm-workspace.yaml") -Destination (Join-Path $target "pnpm-workspace.yaml")
Copy-Item -Path (Join-Path $root "turbo.json") -Destination (Join-Path $target "turbo.json")
Copy-Item -Path (Join-Path $root "tsconfig.base.json") -Destination (Join-Path $target "tsconfig.base.json")
Copy-Item -Path (Join-Path $root "docker-compose.yml") -Destination (Join-Path $target "docker-compose.yml")
Copy-Item -Path (Join-Path $root "README.md") -Destination (Join-Path $target "README.md")

Write-Host "==> Copiando apps e packages..."
Copy-Tree (Join-Path $root "apps\api") (Join-Path $target "apps\api")
Copy-Tree (Join-Path $root "apps\web") (Join-Path $target "apps\web")
Copy-Tree (Join-Path $root "packages") (Join-Path $target "packages")

if (Test-Path (Join-Path $root "storage")) {
  Write-Host "==> Copiando storage..."
  Copy-Tree (Join-Path $root "storage") (Join-Path $target "storage")
}

Write-Host "==> Copiando pasta demo..."
Copy-Tree (Join-Path $root "demo") (Join-Path $target "demo")

Write-Host "==> Compactando ZIP..."
Compress-Archive -Path (Join-Path $target "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Pacote criado com sucesso:"
Write-Host $zipPath
