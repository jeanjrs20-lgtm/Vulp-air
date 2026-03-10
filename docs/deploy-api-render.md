# Deploy da API no Render

## O que este guia cobre

Publicacao da API `apps/api` em um Web Service Docker do Render, com:

- PostgreSQL externo ou Render Postgres
- storage local persistente em disco
- migrations automaticas no startup
- integracao com o frontend publicado na Vercel

## Arquivos prontos no repositorio

- [apps/api/Dockerfile](../apps/api/Dockerfile)
- [apps/api/docker-start.sh](../apps/api/docker-start.sh)
- [render.yaml](../render.yaml)
- [apps/api/.env.example](../apps/api/.env.example)

## Opcao 1: usar o blueprint `render.yaml`

1. No Render, clique em `New +` -> `Blueprint`.
2. Selecione o repositorio `Vulp-air`.
3. O Render vai ler [render.yaml](../render.yaml).
4. Preencha os valores pedidos:
   - `DATABASE_URL`
   - `PUBLIC_WEB_URL`
5. Confirme o deploy.

## Opcao 2: criar manualmente no painel

1. Crie um `Web Service`.
2. Conecte o repositorio `Vulp-air`.
3. Selecione:
   - `Runtime`: `Docker`
   - `Dockerfile Path`: `apps/api/Dockerfile`
   - `Docker Context`: `.`
4. Configure `Health Check Path`:
   - `/api/v1/health`
5. Adicione um `Persistent Disk`:
   - `Mount Path`: `/app/storage`
6. Defina as variaveis de ambiente abaixo.

## Variaveis obrigatorias

```bash
DATABASE_URL=postgresql://USER:PASS@HOST:PORT/DB
NODE_ENV=production
PORT=10000
JWT_SECRET=gere-um-segredo-forte
RUN_DATABASE_MIGRATIONS=true
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=../../storage
PUBLIC_WEB_URL=https://SEU-FRONTEND.vercel.app
```

## SMTP

Se ainda nao for usar e-mail transacional, pode deixar sem configurar SMTP.
Os defaults existem para desenvolvimento local, mas em producao o ideal e configurar um SMTP real depois.

## Storage

Este setup usa disco persistente no Render para uploads, PDFs e midias.

Se quiser storage mais robusto depois, a API ja aceita `STORAGE_DRIVER=s3` com:

```bash
STORAGE_S3_BUCKET=
STORAGE_S3_REGION=us-east-1
STORAGE_S3_ENDPOINT=
STORAGE_S3_ACCESS_KEY_ID=
STORAGE_S3_SECRET_ACCESS_KEY=
STORAGE_S3_FORCE_PATH_STYLE=false
```

## Banco

Se usar Render Postgres:

1. Crie o banco no painel.
2. Copie a `connection string`.
3. Cole em `DATABASE_URL`.

O container ja executa:

```bash
prisma migrate deploy
```

quando `RUN_DATABASE_MIGRATIONS=true`.

## Validacao apos subir

Teste:

```bash
https://SUA-API.onrender.com/api/v1/health
```

Esperado:

```json
{"data":{"status":"ok"}}
```

## Integracao com a Vercel

Depois que a API tiver URL publica, configure na Vercel:

```bash
API_PROXY_TARGET=https://SUA-API.onrender.com
```

Sem `/api/v1` no final.

## Observacoes praticas

- O primeiro deploy demora mais por causa do Chromium do Playwright.
- O healthcheck da API ja foi validado localmente em container Docker.
- Se quiser reduzir dependencia de disco local depois, troque para `s3`.
