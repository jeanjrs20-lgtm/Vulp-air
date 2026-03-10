# Deploy do Web na Vercel

## Escopo

Este preparo deixa o `apps/web` pronto para deploy na Vercel.

O frontend agora suporta dois modos:

- `proxy/rewrite` recomendado: o browser fala com `/api/v1` e o Next encaminha para a API real
- `URL publica direta`: o browser fala direto com a URL publica da API

## Recomendacao

Use o modo `proxy/rewrite`.

Vantagens:

- evita expor a URL real da API no frontend
- reduz problemas de CORS
- mantem o frontend estavel entre preview e producao

## Como configurar na Vercel

1. Importe o repositorio na Vercel
2. Crie um projeto apontando para o diretorio `apps/web`
3. Framework: `Next.js`
4. Package manager: `pnpm`
5. Node.js: `20`
6. Configure a variavel de ambiente:

```bash
API_PROXY_TARGET=https://api.seudominio.com
```

Se a sua API publica estiver versionada em `/api/v1`, informe apenas a origem:

```bash
API_PROXY_TARGET=https://api.seudominio.com
```

Nao use:

```bash
API_PROXY_TARGET=https://api.seudominio.com/api/v1
```

## Modo alternativo

Se quiser que o browser fale direto com a API publica, configure:

```bash
NEXT_PUBLIC_API_URL=https://api.seudominio.com/api/v1
```

Nesse modo, `API_PROXY_TARGET` deixa de ser necessario.

## Desenvolvimento local

Para rodar o web local com proxy para a API local:

```bash
API_PROXY_TARGET=http://localhost:3001
```

Isso ja esta refletido em `apps/web/.env.local.example`.

## Observacao importante sobre a API

A API atual nao esta preparada para subir na Vercel como esta hoje.

Motivo tecnico:

- sobe como servidor Fastify persistente com `listen()`
- depende de PostgreSQL externo
- grava arquivos em storage local do servidor

Inferencia: esse backend se encaixa melhor em um host Node persistente, com banco externo e storage de arquivos fora do filesystem local.

Se no futuro voce quiser levar uploads para a stack Vercel, o caminho correto e trocar o storage local por object storage.
