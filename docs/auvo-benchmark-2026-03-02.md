# Benchmark competitivo: Auvo x Vulp Air

Data da varredura: 2026-03-02  
Escopo: páginas públicas de produto, funcionalidades, integrações e segmentos do site da Auvo.

## 1) Inventário funcional Auvo (público)

### Núcleo de operação de campo
- Gestão de equipes externas em tempo real.
- Jornada fim-a-fim cobrindo venda, planejamento, execução e financeiro.
- Ordem de serviço digital.
- Agendamento/gestão de visitas.
- Roteirização inteligente.
- Geolocalização e comprovação de visita.
- Controle de tempo de visita.
- Checklists e formulários de execução.
- Assinaturas e evidências (conforme módulos de execução).

### Gestão comercial e cliente
- Orçamentos/propostas no fluxo operacional.
- Central do Cliente (portal de relacionamento e acompanhamento).
- Pesquisa de satisfação (NPS/CSAT no pós-serviço).

### Backoffice financeiro e cobrança
- Módulo financeiro com contas a pagar/receber e fluxo operacional financeiro.
- Módulo de cobrança para contratos e gestão de inadimplência.

### Atendimento e comunicação
- AuvoChat (chat em canais digitais, incluindo WhatsApp/Messenger).
- AuvoDesk (service desk/help desk para atendimento e tickets).

### Inteligência e integrações
- BI com dashboards para operação e gestão.
- Marketplace de integrações (ex.: WhatsApp, Messenger, Tiny, Segware, NectarCRM e outros apps).
- API pública (documentação exposta).

### Segmentos atendidos
- Climatização, energia solar, segurança eletrônica, facilities, controle de pragas, telecom e outros nichos de field service.

## 2) Gap analysis: Vulp Air atual x Auvo

Legenda: `OK` (já temos), `PARCIAL` (base pronta), `GAP` (não implementado).

| Domínio | Auvo | Vulp Air hoje | Status |
|---|---|---|---|
| Autenticação/RBAC | Perfis e controle de acesso | JWT + RBAC + papéis corporativos | OK |
| Checklists em campo | Checklist operacional ponta a ponta | Templates versionados, atribuição, execução mobile em 5 passos, revisão, aprovação e PDF | OK |
| Evidências e assinaturas | Evidências de execução | Upload de mídia + assinaturas técnico/local/supervisor | OK |
| Analytics operacional | BI e dashboards | KPIs, taxa de reprovação, não conformidades, atividade recente | PARCIAL |
| Base de conhecimento | Fluxo documental operacional | POP upload/criação, busca híbrida e recibo "Li e entendi" | OK |
| Ordem de serviço digital (OS) | Produto central | Não existe entidade OS dedicada (usamos checklist execution) | GAP |
| Agenda e despacho | Planejamento/agenda de equipe | Sem calendário de agenda e sem despacho otimizado | GAP |
| Roteirização inteligente | Motor de rotas | Não existe motor de roteirização | GAP |
| Geolocalização/comprovação | Check-in/out e localização | Sem trilha geográfica, geofencing e prova de presença | GAP |
| Cliente/contratos | Central do cliente + contratos | Sem portal externo de cliente e sem contratos | GAP |
| Financeiro | Contas a pagar/receber | Sem módulo financeiro | GAP |
| Cobrança | Cobrança e régua | Sem cobrança/recorrência/inadimplência | GAP |
| Chat omnichannel | AuvoChat | Sem chat/WhatsApp nativo | GAP |
| Service desk | AuvoDesk | Sem gestão de tickets/SLA | GAP |
| Ecossistema de integrações | Marketplace amplo | Sem hub de integrações pronto | GAP |

## 3) Estratégia de espelhamento (paridade) + diferenciação

### Fase 1 (0-8 semanas): paridade operacional crítica
- Criar domínio de `Ordem de Serviço` separado de checklist.
- Implementar calendário de agendamento e despacho.
- Adicionar geolocalização básica no mobile (check-in, check-out, trilha simples).
- Ligar OS -> checklist -> evidências -> aprovação.
- KPIs de produtividade por técnico, equipe e SLA.

### Fase 2 (8-16 semanas): comercial, cliente e backoffice
- Portal do cliente para acompanhar OS, aprovar serviços e baixar relatórios.
- Módulo de contratos e SLA.
- Financeiro inicial: contas a receber, baixa manual e conciliação básica.
- Cobrança automática (régua por e-mail/WhatsApp via integração).
- Integrações iniciais: WhatsApp, ERP financeiro e CRM.

### Fase 3 (16-28 semanas): diferenciais "revolucionários"
- Copiloto IA técnico: sugere diagnóstico, checklist dinâmico e plano de ação.
- Score de risco de SLA em tempo real com alertas preditivos.
- Roteirização inteligente com restrições de SLA, habilidade técnica e janela.
- "Field Twin": histórico por equipamento com recomendação preditiva.
- Qualidade automática: auditoria de OS/checklist por regras e IA.

## 4) Backlog técnico inicial (implementável já)

### EPIC A: Ordem de Serviço
- Modelagem Prisma: `ServiceOrder`, `ServiceOrderEvent`, `ServiceOrderStatus`, `Contract`.
- Endpoints API: CRUD OS, atribuição, timeline, SLA, vínculo com checklist execution.
- Web: board/lista + detalhe com timeline.
- Mobile: lista "Minhas OS" + início/finalização.

### EPIC B: Agenda e despacho
- API de agenda por técnico/equipe.
- UI calendário (web) para drag-and-drop de visitas.
- Regras de conflito e capacidade diária.

### EPIC C: Geolocalização e prova de presença
- Coleta de localização no app (opt-in por política).
- Check-in georreferenciado por OS.
- Evidência com timestamp + coordenada + precisão.

### EPIC D: Financeiro/Cobrança v1
- Entidades: fatura, cobrança, recebimento.
- Geração de cobrança por OS concluída.
- Relatório de inadimplência.

## 5) Princípios para não copiar "igual", mas superar

- Espelhar capability, não copiar identidade visual/naming/funil comercial.
- Focar em vertical HVAC com profundidade (PMOC, ativos, compliance e eficiência energética).
- Priorizar produtividade real de campo (menos cliques, execução offline first).
- Produto guiado por métricas de tempo, retrabalho e SLA.

## 6) Fontes usadas na varredura

- https://www.auvo.com/
- https://www.auvo.com/gestao-de-equipes-externas
- https://www.auvo.com/controle-financeiro
- https://www.auvo.com/cobrancas
- https://www.auvo.com/auvochat
- https://www.auvo.com/auvodesk
- https://www.auvo.com/central-do-cliente
- https://www.auvo.com/bi
- https://www.auvo.com/integracoes
- https://www.auvo.com/integracoes/segware
- https://www.auvo.com/integracoes/tiny
- https://www.auvo.com/integracoes/nectarcrm
- https://www.auvo.com/segmento/climatizacao
- https://www.auvo.com/segmento/energia-solar
- https://www.auvo.com/segmento/seguranca-eletronica
- https://www.auvo.com/segmento/facilities
- https://www.auvo.com/segmento/controle-de-pragas
- https://www.auvo.com/segmento/telecom
