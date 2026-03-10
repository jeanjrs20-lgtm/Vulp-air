# VULP AIR Demo Offline Total

Roda sem instalar Node, pnpm, Docker ou VS Code no PC do cliente.

## O que ja vem no pacote

- Node.js portatil (embutido)
- pnpm embutido
- PostgreSQL portatil (embutido)
- Store offline de dependencias (`.pnpm-store`)
- Seed completo para gerar dados da demo automaticamente

## Como iniciar

1. Extraia o `.zip`.
2. Abra a pasta extraida.
3. Execute `demo\start-offline.bat` (duplo clique).
4. Aguarde a primeira inicializacao (instalacao offline + build local).

URLs:

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/api/v1/health`

## Como parar

- Execute `demo\stop-offline.bat`.

## Credenciais demo

- `superadmin@vulp.local` / `123456`
- `tecnico@vulp.local` / `123456`

## Opcional (via PowerShell)

- Reinstalar dependencias e rebuild: `demo\start-offline.ps1 -ForceReinstall -Rebuild`
- Tentar restaurar dump antes do seed: `demo\start-offline.ps1 -RestoreFromDump`
