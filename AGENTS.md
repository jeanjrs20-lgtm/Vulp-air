# Regras operacionais do projeto

## Alinhamento obrigatorio de entrega

Toda alteracao concluida neste projeto deve seguir este fluxo, salvo instrucao explicita em contrario:

1. Implementar e validar localmente o que foi alterado.
2. Atualizar os arquivos de infraestrutura e deploy quando a mudanca impactar ambiente publicado.
3. Deixar o repositorio Git alinhado:
   - revisar `git status`
   - criar commit objetivo
   - publicar no GitHub (`origin/main`)
4. Quando a mudanca afetar servicos publicados, alinhar tambem os destinos de deploy aplicaveis:
   - Render
   - Vercel

## Regra pratica para deploy

- Mudancas apenas locais ou exploratorias nao exigem deploy.
- Mudancas que afetem frontend publicado exigem alinhamento com Vercel.
- Mudancas que afetem API, banco, proxy, variaveis de ambiente ou topologia exigem alinhamento com Render.
- Quando existir auto deploy ligado, o push para o GitHub e parte obrigatoria da entrega.
- Quando existir passo manual em painel externo, isso deve ser informado claramente ao final.

## Forma de resposta esperada

Ao concluir mudancas relevantes, informar sempre:

1. o que mudou
2. qual commit foi publicado
3. se Render e/ou Vercel precisam de redeploy ou ajuste manual
4. qualquer risco de configuracao, dado ou ambiente
