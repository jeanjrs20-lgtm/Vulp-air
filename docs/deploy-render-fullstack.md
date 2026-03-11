# Deploy full-stack no Render

Este repositorio agora tem um `render.yaml` preparado para subir o ambiente completo no Render, no mesmo projeto, em modo demo gratuito:

- `vulp-air-web` (`apps/web`, plano `free`)
- `vulp-air-api` (`apps/api`, plano `free`)
- `vulp-air-db` (PostgreSQL, plano `free`)

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
- O `vulp-air-web` faz proxy para a URL publica do `vulp-air-api`.
- O banco e criado pelo proprio Blueprint.

Isso evita depender da Vercel para o fluxo completo e remove o uso de recursos pagos do Render.

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

## Limites do modo gratuito

Este Blueprint foi ajustado para nao exigir cartao por causa de recurso pago. O tradeoff e este:

- sem `Persistent Disk`
- arquivos enviados ficam em storage local temporario do container
- em restart, redeploy ou reciclarem a instancia, esses arquivos podem ser perdidos
- os servicos `free` podem entrar em spin down por inatividade

Para demo e homologacao leve, isso atende. Para operacao real, o correto e migrar depois para:

- API com disco persistente ou `s3`
- banco e web em plano pago

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
- A API usa storage local temporario no plano gratuito.
- Se depois quiser storage robusto, a API ja aceita `s3`.
