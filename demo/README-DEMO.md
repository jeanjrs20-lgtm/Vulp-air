# VULP AIR Demo (Sem VSCode)

Este pacote permite rodar a aplicacao em outro PC para demonstracao.

## Requisitos no PC de destino

- Docker Desktop
- Node.js 20+
- pnpm 10+ (`npm i -g pnpm`)

## Como iniciar

1. Extraia o arquivo `.zip`.
2. Entre na pasta extraida.
3. Execute `demo\start-demo.bat` (duplo clique).
4. Aguarde a mensagem de sucesso no terminal.

URLs:

- Web: `http://localhost:3000`
- API Health: `http://localhost:3001/api/v1/health`
- MailHog: `http://localhost:8025`

## Como parar

- Execute `demo\stop-demo.bat`.

## Observacoes

- O script restaura o backup `demo\database\vulp_demo.sql` para subir com os mesmos dados da demo.
- Se quiser iniciar sem restaurar backup, rode no terminal:
  - `powershell -ExecutionPolicy Bypass -File demo\start-demo.ps1 -NoRestore`
