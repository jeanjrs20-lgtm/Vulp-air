# VULP AIR FieldOps

Monorepo com Web, API e Mobile para operacao, atendimento, financeiro e administracao da VULP AIR.

## Stack

- Monorepo: Turborepo + pnpm workspaces
- API: Fastify + TypeScript + Prisma + Zod + JWT
- Web: Next.js App Router + Tailwind + TanStack Query + Recharts
- Mobile: Expo + React Native + NativeWind + TanStack Query
- Banco local: PostgreSQL via Docker

## Estrutura

```text
apps/
  api/
  web/
  mobile/
packages/
  shared/
  api-client/
  ui-tokens/
  rbac/
  pdf-templates/
```

## Pre-requisitos

- Node 20+
- pnpm 10+
- Docker Desktop

## Variaveis de ambiente

- API: [apps/api/.env.example](apps/api/.env.example)
- Web: [apps/web/.env.local.example](apps/web/.env.local.example)
- Mobile: [apps/mobile/.env.example](apps/mobile/.env.example)

Copie os exemplos para os arquivos locais antes de rodar:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

No Windows, faca a copia manualmente se preferir.

## Instalacao

```bash
pnpm install
```

## Setup local

```bash
pnpm setup
```

O setup executa:

1. `pnpm docker:up`
2. `pnpm db:migrate`
3. `pnpm db:seed`

## Rodar ambiente

```bash
pnpm dev
```

Endpoints locais:

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/api/v1/health`
- MailHog: `http://localhost:8025`

## Scripts principais

```bash
pnpm dev
pnpm dev:api
pnpm dev:web
pnpm dev:mobile
pnpm docker:up
pnpm docker:down
pnpm db:migrate
pnpm db:deploy
pnpm db:push
pnpm db:seed
pnpm typecheck
pnpm lint
```

## Banco de dados

- Fluxo versionado: `pnpm db:migrate`
- Fluxo de deploy: `pnpm db:deploy`
- Uso rapido local, sem criar migration nova: `pnpm db:push`

As migrations ficam em `apps/api/prisma/migrations`.

## Usuarios seed

Senha padrao: `123456`

- `superadmin@vulp.local`
- `admin@vulp.local`
- `supervisor@vulp.local`
- `tecnico@vulp.local`
- `leitor@vulp.local`

## Mobile

Configure `apps/mobile/.env` de acordo com o ambiente:

- Android emulator: `http://10.0.2.2:3001/api/v1`
- iOS simulator: `http://localhost:3001/api/v1`
- Device fisico: `http://SEU_IP_LAN:3001/api/v1`

Para descobrir o IP de LAN sugerido:

```bash
pnpm --filter @vulp/mobile lan:url
```

## Observacoes

- Storage local: `./storage`
- Artefatos de demo offline, exports e logs locais ficam fora do Git
- API versionada em `/api/v1`

## Deploy na Vercel

- Projeto Vercel: `apps/web`
- Framework: `Next.js`
- Variavel recomendada na Vercel: `API_PROXY_TARGET=https://api.seudominio.com`
- Guia detalhado: [docs/deploy-vercel.md](docs/deploy-vercel.md)

Observacao:

- O `apps/web` esta preparado para Vercel
- A API atual deve ficar em host Node persistente com Postgres e storage externo/local dedicado
