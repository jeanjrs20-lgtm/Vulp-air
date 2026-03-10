# Deploy full-stack no Render

Este repositorio agora tem um `render.yaml` preparado para subir o ambiente completo no Render, no mesmo projeto:

- `vulp-air-web` (`apps/web`)
- `vulp-air-api` (`apps/api`)
- `vulp-air-db` (PostgreSQL)

## Como publicar

1. No Render, clique em `New +` -> `Blueprint`.
2. Selecione o repositorio `jeanjrs20-lgtm/Vulp-air`.
3. O Render vai ler [render.yaml](../render.yaml).
4. Confirme a criacao do projeto `vulp-air`.
5. Aguarde a subida dos 3 recursos:
   - `vulp-air-db`
   - `vulp-air-api`
   - `vulp-air-web`

## Como ficou o fluxo

- O frontend usa `/api/v1` no browser.
- No Render, o `vulp-air-web` faz proxy interno para o `vulp-air-api` usando a rede privada do projeto.
- O banco e criado pelo proprio Blueprint.

Isso evita depender da Vercel para o fluxo completo.

## Credenciais demo

No primeiro deploy, o Blueprint sobe a API com:

```bash
RUN_DATABASE_SEED=true
```

Isso deixa o ambiente demo pronto com:

```bash
superadmin@vulp.local / 123456
tecnico@vulp.local / 123456
```

## Ajuste recomendado apos o primeiro deploy

Depois que o primeiro deploy terminar e o login funcionar:

1. Abra o servico `vulp-air-api` no Render.
2. Edite a variavel:

```bash
RUN_DATABASE_SEED=false
```

3. Salve e faça um novo deploy.

Assim o seed nao roda em toda publicacao futura.

## URL publica do frontend

O Blueprint define na API:

```bash
PUBLIC_WEB_URL=https://vulp-air-web.onrender.com
```

Se o Render criar outro hostname ou se voce usar dominio proprio, ajuste essa variavel no servico `vulp-air-api`.

Ela e usada em links do portal do cliente e fluxos que precisam montar URL publica do frontend.

## Testes apos publicar

1. Health da API:

```bash
https://vulp-air-api.onrender.com/api/v1/health
```

2. Login do frontend:

```bash
https://vulp-air-web.onrender.com/login
```

## Observacoes

- O primeiro build pode demorar mais por causa das dependencias do monorepo.
- A API usa disco persistente local no Render para arquivos e PDFs.
- Se depois quiser storage mais robusto, a API ja aceita `s3`.
