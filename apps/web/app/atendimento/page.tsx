"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  BadgeHelp,
  Building2,
  LifeBuoy,
  MessageSquare,
  RefreshCcw,
  Smile,
  Target,
  Users2
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  DashboardChartCard,
  DashboardHero,
  DashboardLegend,
  DashboardMetricTile,
  DashboardPulseCard,
  dashboardBarValueLabel,
  dashboardPieValueLabel,
  dashboardScopeLabel,
  dashboardYAxisWithHeadroom
} from "@/components/dashboard-kit";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type DeskSummaryPayload = {
  total: number;
  overdue: number;
  dueToday: number;
  unread: number;
  open: number;
  waiting: number;
  paused: number;
  unassigned: number;
  byStatus: {
    open: number;
    triage: number;
    inProgress: number;
    onHold: number;
    resolved: number;
    closed: number;
    cancelled: number;
  };
};

type CrmSummaryPayload = {
  total: number;
  open: number;
  won: number;
  lost: number;
  overdue: number;
  activitiesToday: number;
  estimatedValue: number;
  byStatus: {
    new: number;
    qualified: number;
    proposal: number;
    negotiation: number;
    onHold: number;
    won: number;
    lost: number;
  };
};

type CustomerSummaryPayload = {
  total: number;
  active: number;
  inactive: number;
  withOpenTickets: number;
  withOverdueInvoices: number;
};

type FeedbackSummaryPayload = {
  totals: {
    feedbacks: number;
    avgNps: number;
    avgCsat: number;
    npsScore: number;
    promoters: number;
    passives: number;
    detractors: number;
  };
};

type ReportsOverviewPayload = {
  quotes: {
    conversionRate: number;
  };
  chat: {
    totalThreads: number;
    byStatus: {
      open: number;
      closed: number;
      archived: number;
    };
    byChannel: {
      internal: number;
      whatsapp: number;
      portal: number;
      email: number;
      phone: number;
    };
    messages: number;
  };
};

const WINDOW_DAYS = 30;
const COLORS = ["#14b8a6", "#0d5f80", "#a855f7", "#f59e0b", "#ef4444", "#64748b", "#22c55e"];

const toMoney = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

export default function AtendimentoDashboardPage() {
  const router = useRouter();
  const now = new Date();
  const dateFrom = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60_000);

  const deskSummaryQuery = useQuery({
    queryKey: ["atendimento-dashboard-desk-summary"],
    queryFn: () => api.get<DeskSummaryPayload>("/desk/summary")
  });

  const crmSummaryQuery = useQuery({
    queryKey: ["atendimento-dashboard-crm-summary"],
    queryFn: () => api.get<CrmSummaryPayload>("/crm/summary")
  });

  const customerSummaryQuery = useQuery({
    queryKey: ["atendimento-dashboard-customers-summary"],
    queryFn: () => api.get<CustomerSummaryPayload>("/customers/summary")
  });

  const feedbackSummaryQuery = useQuery({
    queryKey: ["atendimento-dashboard-feedback-summary"],
    queryFn: () => api.get<FeedbackSummaryPayload>("/feedback/summary")
  });

  const reportQuery = useQuery({
    queryKey: ["atendimento-dashboard-report"],
    queryFn: () =>
      api.get<ReportsOverviewPayload>(
        `/reports/overview?dateFrom=${encodeURIComponent(dateFrom.toISOString())}&dateTo=${encodeURIComponent(
          new Date().toISOString()
        )}`
      )
  });

  const deskSummary = deskSummaryQuery.data;
  const crmSummary = crmSummaryQuery.data;
  const customerSummary = customerSummaryQuery.data;
  const feedbackSummary = feedbackSummaryQuery.data;
  const report = reportQuery.data;

  const ticketStatusChart = useMemo(
    () => [
      { name: "Abertos", total: deskSummary?.byStatus.open ?? 0 },
      { name: "Triagem", total: deskSummary?.byStatus.triage ?? 0 },
      { name: "Em atendimento", total: deskSummary?.byStatus.inProgress ?? 0 },
      { name: "Em espera", total: deskSummary?.byStatus.onHold ?? 0 },
      { name: "Resolvidos", total: deskSummary?.byStatus.resolved ?? 0 },
      { name: "Fechados", total: deskSummary?.byStatus.closed ?? 0 }
    ],
    [deskSummary]
  );

  const crmFunnelChart = useMemo(
    () => [
      { etapa: "Novo", total: crmSummary?.byStatus.new ?? 0 },
      { etapa: "Qualificado", total: crmSummary?.byStatus.qualified ?? 0 },
      { etapa: "Proposta", total: crmSummary?.byStatus.proposal ?? 0 },
      { etapa: "Negociacao", total: crmSummary?.byStatus.negotiation ?? 0 },
      { etapa: "Em espera", total: crmSummary?.byStatus.onHold ?? 0 },
      { etapa: "Ganho", total: crmSummary?.byStatus.won ?? 0 },
      { etapa: "Perdido", total: crmSummary?.byStatus.lost ?? 0 }
    ],
    [crmSummary]
  );

  const chatChannelChart = useMemo(
    () => [
      { name: "WhatsApp", total: report?.chat.byChannel.whatsapp ?? 0 },
      { name: "Portal", total: report?.chat.byChannel.portal ?? 0 },
      { name: "Email", total: report?.chat.byChannel.email ?? 0 },
      { name: "Telefone", total: report?.chat.byChannel.phone ?? 0 },
      { name: "Interno", total: report?.chat.byChannel.internal ?? 0 }
    ],
    [report?.chat.byChannel]
  );

  const customerPieChart = useMemo(
    () => [
      { name: "Ativos", value: customerSummary?.active ?? 0 },
      { name: "Inativos", value: customerSummary?.inactive ?? 0 },
      { name: "Com ticket aberto", value: customerSummary?.withOpenTickets ?? 0 },
      { name: "Com fatura vencida", value: customerSummary?.withOverdueInvoices ?? 0 }
    ],
    [customerSummary]
  );

  const refreshAll = async () => {
    await Promise.all([
      deskSummaryQuery.refetch(),
      crmSummaryQuery.refetch(),
      customerSummaryQuery.refetch(),
      feedbackSummaryQuery.refetch(),
      reportQuery.refetch()
    ]);
  };

  const isRefreshing =
    deskSummaryQuery.isRefetching ||
    crmSummaryQuery.isRefetching ||
    customerSummaryQuery.isRefetching ||
    feedbackSummaryQuery.isRefetching ||
    reportQuery.isRefetching;

  return (
    <RequireAuth>
      <AppShell>
        <DashboardHero
          actions={
            <>
              <Button onClick={() => router.push("/desk?new=1")} type="button">
                Novo ticket
              </Button>
              <Button onClick={() => router.push("/crm")} type="button" variant="outline">
                Abrir CRM
              </Button>
              <Button onClick={refreshAll} type="button" variant="outline">
                <RefreshCcw className={`mr-1 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Atualizar leitura
              </Button>
            </>
          }
          aside={
            <>
              <DashboardPulseCard
                label="Tickets abertos"
                note="fila atual de atendimento"
                value={deskSummary?.open ?? 0}
              />
              <DashboardPulseCard
                accentClassName="text-amber-600"
                label="Nao lidos"
                note="itens que exigem triagem"
                value={deskSummary?.unread ?? 0}
              />
              <DashboardPulseCard
                accentClassName="text-teal-600"
                label="Leads abertos"
                note="pipeline comercial vivo"
                value={crmSummary?.open ?? 0}
              />
              <DashboardPulseCard
                accentClassName="text-brand-primary"
                label="Conversao"
                note={`orcamentos dos ultimos ${WINDOW_DAYS} dias`}
                value={`${(report?.quotes.conversionRate ?? 0).toFixed(1)}%`}
              />
            </>
          }
          description="Tickets, CRM, base de clientes, canais de conversa e satisfacao em uma leitura unica para atendimento e relacionamento."
          eyebrow={
            <>
              <Users2 className="h-3.5 w-3.5" />
              Dashboard de atendimento
            </>
          }
          footer="Graficos e indicadores abaixo seguem a mesma janela de leitura dos ultimos 30 dias."
          title="Relacionamento, suporte e comercial em uma so camada"
        />

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <DashboardMetricTile
            label="Tickets totais"
            note="desk no consolidado atual"
            value={deskSummary?.total ?? 0}
          />
          <DashboardMetricTile
            accent="rose"
            label="SLA em atraso"
            note="tickets fora do tempo esperado"
            value={deskSummary?.overdue ?? 0}
          />
          <DashboardMetricTile
            accent="amber"
            label="Nao atribuidos"
            note="esperando responsavel"
            value={deskSummary?.unassigned ?? 0}
          />
          <DashboardMetricTile
            accent="emerald"
            label="Clientes ativos"
            note="base ativa da plataforma"
            value={customerSummary?.active ?? 0}
          />
          <DashboardMetricTile
            accent="teal"
            label="NPS"
            note={`${feedbackSummary?.totals.feedbacks ?? 0} feedbacks`}
            value={(feedbackSummary?.totals.npsScore ?? 0).toFixed(1)}
          />
          <DashboardMetricTile
            label="Valor potencial"
            note="pipeline comercial em aberto"
            value={toMoney(crmSummary?.estimatedValue ?? 0)}
            valueClassName="text-[clamp(1.15rem,1.45vw,1.9rem)]"
          />
        </section>

        <section className="mb-5 grid gap-3 xl:grid-cols-3">
          <DashboardChartCard
            scope={dashboardScopeLabel(WINDOW_DAYS)}
            section="Desk"
            title="Status dos tickets"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={ticketStatusChart} margin={{ top: 36, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(7,56,77,0.12)" strokeDasharray="4 4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#48616F" }} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  domain={[0, dashboardYAxisWithHeadroom]}
                  tick={{ fill: "#48616F" }}
                  tickLine={false}
                />
                <Tooltip />
                <Bar dataKey="total" fill="#0d5f80" radius={[10, 10, 0, 0]}>
                  <LabelList content={dashboardBarValueLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>

          <DashboardChartCard
            scope={dashboardScopeLabel(WINDOW_DAYS)}
            section="CRM"
            title="Pipeline comercial"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={crmFunnelChart} margin={{ top: 36, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(7,56,77,0.12)" strokeDasharray="4 4" />
                <XAxis dataKey="etapa" tick={{ fontSize: 11, fill: "#48616F" }} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  domain={[0, dashboardYAxisWithHeadroom]}
                  tick={{ fill: "#48616F" }}
                  tickLine={false}
                />
                <Tooltip />
                <Bar dataKey="total" fill="#14b8a6" radius={[10, 10, 0, 0]}>
                  <LabelList content={dashboardBarValueLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>

          <DashboardChartCard
            footer={<DashboardLegend colors={COLORS} items={customerPieChart} getValue={(item) => item.value} />}
            scope="Saude da base e sinais de risco no relacionamento"
            section="Clientes"
            title="Base de clientes"
          >
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={customerPieChart}
                  dataKey="value"
                  innerRadius={66}
                  label={dashboardPieValueLabel}
                  labelLine={false}
                  nameKey="name"
                  outerRadius={96}
                >
                  {customerPieChart.map((entry, index) => (
                    <Cell fill={COLORS[index % COLORS.length]} key={entry.name} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </DashboardChartCard>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <DashboardChartCard
            footer={
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-[20px] border border-brand-primary/10 bg-white/80 p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Threads abertas</p>
                  <p className="mt-2 text-2xl font-black text-brand-primary">{report?.chat.byStatus.open ?? 0}</p>
                </div>
                <div className="rounded-[20px] border border-brand-primary/10 bg-white/80 p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Mensagens</p>
                  <p className="mt-2 text-2xl font-black text-brand-primary">{report?.chat.messages ?? 0}</p>
                </div>
                <div className="rounded-[20px] border border-brand-primary/10 bg-white/80 p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Encerram hoje</p>
                  <p className="mt-2 text-2xl font-black text-teal-600">{deskSummary?.dueToday ?? 0}</p>
                </div>
              </div>
            }
            scope={dashboardScopeLabel(WINDOW_DAYS)}
            section="Chat"
            title="Canais de conversa ativos"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={chatChannelChart} margin={{ top: 36, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(7,56,77,0.12)" strokeDasharray="4 4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#48616F" }} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  domain={[0, dashboardYAxisWithHeadroom]}
                  tick={{ fill: "#48616F" }}
                  tickLine={false}
                />
                <Tooltip />
                <Bar dataKey="total" fill="#a855f7" radius={[10, 10, 0, 0]}>
                  <LabelList content={dashboardBarValueLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>

          <aside className="app-surface card p-5">
            <div className="mb-4">
              <p className="text-sm font-black uppercase tracking-[0.08em] text-brand-primary">
                Atalhos de atendimento
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Fluxos mais usados por suporte, comercial e sucesso do cliente
              </p>
            </div>

            <div className="space-y-2">
              <Button className="w-full justify-start" onClick={() => router.push("/desk")} type="button" variant="outline">
                <LifeBuoy className="mr-2 h-4 w-4" />
                Desk tickets
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/crm")} type="button" variant="outline">
                <Target className="mr-2 h-4 w-4" />
                CRM
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/customers")} type="button" variant="outline">
                <Building2 className="mr-2 h-4 w-4" />
                Cadastro de clientes
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/quotes")} type="button" variant="outline">
                <BadgeHelp className="mr-2 h-4 w-4" />
                Orcamentos
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/chat")} type="button" variant="outline">
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat e conversas
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/feedback")} type="button" variant="outline">
                <Smile className="mr-2 h-4 w-4" />
                Satisfacao
              </Button>
            </div>
          </aside>
        </section>
      </AppShell>
    </RequireAuth>
  );
}
