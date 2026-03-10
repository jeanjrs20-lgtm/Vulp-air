"use client";

import { type ReactNode, useMemo, useState } from "react";
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
  ArrowUpRight,
  BriefcaseBusiness,
  ChartSpline,
  Coins,
  LifeBuoy,
  RefreshCcw,
  ShieldCheck,
  Users2,
  Wrench
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type ReportsOverviewPayload = {
  serviceOrders: {
    total: number;
    byStatus: {
      open: number;
      scheduled: number;
      dispatched: number;
      inProgress: number;
      onHold: number;
      completed: number;
      cancelled: number;
    };
  };
  quotes: {
    conversionRate: number;
    totalValue: number;
  };
  satisfaction: {
    npsScore: number;
    feedbacks: number;
  };
  inventory: {
    products: number;
    lowStockCount: number;
  };
  desk: {
    total: number;
    overdue: number;
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
  finance: {
    overdue: number;
    byStatus: {
      draft: number;
      issued: number;
      partiallyPaid: number;
      paid: number;
      overdue: number;
      canceled: number;
    };
    amounts: {
      total: number;
      open: number;
      received: number;
    };
  };
  chat: {
    byStatus: {
      open: number;
    };
  };
};

type ProjectSummary = {
  total: number;
  active: number;
  overdue: number;
};

type CrmSummary = {
  total: number;
  open: number;
  won: number;
};

type CustomerSummary = {
  total: number;
  active: number;
  inactive: number;
};

type MetricTileProps = {
  label: string;
  value: ReactNode;
  note?: string;
  accent?: "brand" | "teal" | "rose" | "amber" | "emerald";
  className?: string;
  valueClassName?: string;
};

type PulseCardProps = {
  label: string;
  value: ReactNode;
  note?: string;
};

type ShortcutCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  tags: string[];
  onClick: () => void;
};

const COLORS = ["#14b8a6", "#0d5f80", "#f59e0b", "#ef4444", "#8b5cf6", "#22c55e"];

const TONE_MAP: Record<NonNullable<MetricTileProps["accent"]>, string> = {
  brand: "text-brand-primary",
  teal: "text-teal-600",
  rose: "text-rose-600",
  amber: "text-amber-600",
  emerald: "text-emerald-700"
};

const pieValueLabel = ({ value }: { value?: number }) =>
  typeof value === "number" && value > 0 ? `${value}` : "";

const yAxisWithHeadroom = (dataMax: number) => {
  const safeMax = Number.isFinite(dataMax) ? dataMax : 0;
  if (safeMax <= 0) {
    return 1;
  }
  return Math.ceil(safeMax + Math.max(1, safeMax * 0.25));
};

const toMoney = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const toMoneyParts = (value: number) => {
  const normalized = toMoney(value).replace(/\u00A0/g, " ");
  const [currency, amount] = normalized.split(" ");

  return {
    currency: currency ?? "R$",
    amount: amount ?? normalized
  };
};

const formatScopeLabel = (windowDays: number) => `Janela movel: ultimos ${windowDays} dias`;

const renderBarValue = (props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
}) => {
  const { value } = props;
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return (
    <text
      fill="#07384D"
      fontSize={12}
      fontWeight={800}
      textAnchor="middle"
      x={x + width / 2}
      y={Math.max(y - 10, 14)}
    >
      {numericValue}
    </text>
  );
};

function MetricTile({
  label,
  value,
  note,
  accent = "brand",
  className,
  valueClassName
}: MetricTileProps) {
  return (
    <article className={cn("app-surface card overflow-hidden p-4", className)}>
      <div className="mb-4 h-1.5 w-14 rounded-full bg-brand-background/60" />
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className={cn("metric-value mt-3 text-[clamp(1.4rem,1.8vw,2.35rem)] font-black", TONE_MAP[accent], valueClassName)}>
        {value}
      </div>
      {note ? <p className="mt-2 text-xs text-slate-500">{note}</p> : null}
    </article>
  );
}

function PulseCard({ label, value, note }: PulseCardProps) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/78 p-4 shadow-[0_18px_40px_rgba(7,56,77,0.08)] backdrop-blur">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className="metric-value mt-3 text-[clamp(1.2rem,1.5vw,1.95rem)] font-black text-brand-primary">{value}</div>
      {note ? <p className="mt-2 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

function ShortcutCard({ icon, title, description, tags, onClick }: ShortcutCardProps) {
  return (
    <article className="app-surface card overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-[20px] bg-brand-background-soft p-3 text-brand-primary">{icon}</div>
        <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
          Dashboard
        </span>
      </div>
      <h3 className="mt-4 text-xl font-black text-brand-primary">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            className="rounded-full border border-brand-primary/10 bg-white/75 px-3 py-1 text-xs font-semibold text-brand-primary"
            key={tag}
          >
            {tag}
          </span>
        ))}
      </div>
      <Button className="mt-5 w-full" onClick={onClick} type="button" variant="outline">
        Abrir dashboard
        <ArrowUpRight className="ml-1 h-4 w-4" />
      </Button>
    </article>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [windowDays, setWindowDays] = useState(30);

  const reportQuery = useQuery({
    queryKey: ["dashboard-overview", windowDays],
    queryFn: () => {
      const dateFrom = new Date(Date.now() - windowDays * 24 * 60 * 60_000).toISOString();
      const dateTo = new Date().toISOString();
      return api.get<ReportsOverviewPayload>(
        `/reports/overview?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
      );
    }
  });

  const projectSummaryQuery = useQuery({
    queryKey: ["dashboard-projects-summary"],
    queryFn: () => api.get<ProjectSummary>("/projects/summary")
  });

  const crmSummaryQuery = useQuery({
    queryKey: ["dashboard-crm-summary"],
    queryFn: () => api.get<CrmSummary>("/crm/summary")
  });

  const customerSummaryQuery = useQuery({
    queryKey: ["dashboard-customer-summary"],
    queryFn: () => api.get<CustomerSummary>("/customers/summary")
  });

  const report = reportQuery.data;
  const projectSummary = projectSummaryQuery.data;
  const crmSummary = crmSummaryQuery.data;
  const customerSummary = customerSummaryQuery.data;
  const receivable = toMoneyParts(report?.finance.amounts.open ?? 0);

  const moduleChart = useMemo(
    () => [
      { modulo: "Ordens", total: report?.serviceOrders.total ?? 0 },
      { modulo: "Tickets", total: report?.desk.total ?? 0 },
      { modulo: "CRM", total: crmSummary?.total ?? 0 },
      { modulo: "Projetos", total: projectSummary?.total ?? 0 },
      { modulo: "Clientes", total: customerSummary?.total ?? 0 },
      { modulo: "Estoque", total: report?.inventory.products ?? 0 }
    ],
    [
      crmSummary?.total,
      customerSummary?.total,
      projectSummary?.total,
      report?.desk.total,
      report?.inventory.products,
      report?.serviceOrders.total
    ]
  );

  const ordersChart = useMemo(
    () => [
      { status: "Abertas", total: report?.serviceOrders.byStatus.open ?? 0 },
      { status: "Agendadas", total: report?.serviceOrders.byStatus.scheduled ?? 0 },
      { status: "Despachadas", total: report?.serviceOrders.byStatus.dispatched ?? 0 },
      { status: "Execucao", total: report?.serviceOrders.byStatus.inProgress ?? 0 },
      { status: "Espera", total: report?.serviceOrders.byStatus.onHold ?? 0 },
      { status: "Concluidas", total: report?.serviceOrders.byStatus.completed ?? 0 }
    ],
    [report?.serviceOrders.byStatus]
  );

  const financeChart = useMemo(
    () => [
      { name: "Emitidas", value: report?.finance.byStatus.issued ?? 0 },
      { name: "Parciais", value: report?.finance.byStatus.partiallyPaid ?? 0 },
      { name: "Pagas", value: report?.finance.byStatus.paid ?? 0 },
      { name: "Vencidas", value: report?.finance.byStatus.overdue ?? 0 },
      { name: "Rascunho", value: report?.finance.byStatus.draft ?? 0 }
    ],
    [report?.finance.byStatus]
  );

  const visibleFinanceLegend = financeChart.filter((item) => item.value > 0);
  const financeTotal = financeChart.reduce((sum, item) => sum + item.value, 0);

  const refreshAll = async () => {
    await Promise.all([
      reportQuery.refetch(),
      projectSummaryQuery.refetch(),
      crmSummaryQuery.refetch(),
      customerSummaryQuery.refetch()
    ]);
  };

  const isRefreshing =
    reportQuery.isRefetching ||
    projectSummaryQuery.isRefetching ||
    crmSummaryQuery.isRefetching ||
    customerSummaryQuery.isRefetching;

  return (
    <RequireAuth>
      <AppShell>
        <section className="app-surface card dashboard-grid-hero mb-5 overflow-hidden p-5 md:p-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="eyebrow">
                <ChartSpline className="h-3.5 w-3.5" />
                Centro executivo
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-brand-primary md:text-5xl">
                Visao consolidada da plataforma VULP
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                Operacao, atendimento, comercial, financeiro e governanca em uma unica camada visual,
                com leitura mais rapida e decisao mais segura.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {[7, 30, 90].map((days) => (
                  <Button
                    className={days === windowDays ? "" : "border-slate-300 text-slate-700"}
                    key={days}
                    onClick={() => setWindowDays(days)}
                    type="button"
                    variant={days === windowDays ? "default" : "outline"}
                  >
                    {days} dias
                  </Button>
                ))}
                <Button onClick={refreshAll} type="button" variant="outline">
                  <RefreshCcw className={`mr-1 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  Atualizar leitura
                </Button>
              </div>

              <p className="mt-4 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                Todos os graficos abaixo seguem a janela selecionada.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[440px]">
              <PulseCard
                label="OS em execucao"
                note="atendimentos em campo agora"
                value={report?.serviceOrders.byStatus.inProgress ?? 0}
              />
              <PulseCard
                label="Tickets em atraso"
                note="fila que exige resposta"
                value={report?.desk.overdue ?? 0}
              />
              <PulseCard
                label="A receber aberto"
                note="valor pendente para faturamento"
                value={toMoney(report?.finance.amounts.open ?? 0)}
              />
              <PulseCard
                label="Conversao comercial"
                note="orcamentos convertidos no periodo"
                value={`${(report?.quotes.conversionRate ?? 0).toFixed(1)}%`}
              />
            </div>
          </div>
        </section>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <MetricTile
            label="Ordens"
            note="volume operacional"
            value={report?.serviceOrders.total ?? 0}
          />
          <MetricTile
            label="Tickets"
            note="desk e atendimento"
            value={report?.desk.total ?? 0}
          />
          <MetricTile
            label="Leads abertos"
            note="pipeline comercial vivo"
            value={crmSummary?.open ?? 0}
          />
          <MetricTile
            label="Projetos ativos"
            note="entregas em andamento"
            value={projectSummary?.active ?? 0}
          />
          <MetricTile
            label="Clientes ativos"
            note="base recorrente"
            value={customerSummary?.active ?? 0}
          />
          <MetricTile
            className="min-w-0"
            label="A receber"
            note="saldo em aberto"
            value={
              <div className="flex min-w-0 flex-col">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {receivable.currency}
                </span>
                <span className="truncate text-[clamp(1.15rem,1.25vw,1.8rem)] font-black text-brand-primary">
                  {receivable.amount}
                </span>
              </div>
            }
            valueClassName="leading-none"
          />
          <MetricTile
            accent="amber"
            label="Estoque baixo"
            note="itens abaixo do minimo"
            value={report?.inventory.lowStockCount ?? 0}
          />
          <MetricTile
            accent="teal"
            label="NPS"
            note={`${report?.satisfaction.feedbacks ?? 0} feedbacks no periodo`}
            value={(report?.satisfaction.npsScore ?? 0).toFixed(1)}
          />
        </section>

        <section className="mb-5 grid gap-3 xl:grid-cols-3">
          <article className="app-surface card p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.08em] text-brand-primary">
                  Volume por modulo
                </p>
                <p className="mt-1 text-xs text-slate-500">{formatScopeLabel(windowDays)}</p>
              </div>
              <span className="rounded-full bg-brand-background-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-brand-primary">
                Plataforma
              </span>
            </div>
            <div className="h-72">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={moduleChart} margin={{ top: 36, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(7,56,77,0.12)" strokeDasharray="4 4" />
                  <XAxis dataKey="modulo" tick={{ fontSize: 11, fill: "#48616F" }} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    domain={[0, yAxisWithHeadroom]}
                    tick={{ fill: "#48616F" }}
                    tickLine={false}
                  />
                  <Tooltip />
                  <Bar dataKey="total" fill="#0d5f80" radius={[10, 10, 0, 0]}>
                    <LabelList content={renderBarValue} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="app-surface card p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.08em] text-brand-primary">
                  Ordens por status
                </p>
                <p className="mt-1 text-xs text-slate-500">{formatScopeLabel(windowDays)}</p>
              </div>
              <span className="rounded-full bg-brand-background-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-brand-primary">
                Operacao
              </span>
            </div>
            <div className="h-72">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={ordersChart} margin={{ top: 36, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(7,56,77,0.12)" strokeDasharray="4 4" />
                  <XAxis dataKey="status" tick={{ fontSize: 11, fill: "#48616F" }} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    domain={[0, yAxisWithHeadroom]}
                    tick={{ fill: "#48616F" }}
                    tickLine={false}
                  />
                  <Tooltip />
                  <Bar dataKey="total" fill="#14b8a6" radius={[10, 10, 0, 0]}>
                    <LabelList content={renderBarValue} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="app-surface card p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.08em] text-brand-primary">
                  Faturas por status
                </p>
                <p className="mt-1 text-xs text-slate-500">{formatScopeLabel(windowDays)}</p>
              </div>
              <span className="rounded-full bg-brand-background-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-brand-primary">
                Financeiro
              </span>
            </div>
            <div className="relative h-72">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    data={financeChart}
                    dataKey="value"
                    innerRadius={66}
                    label={pieValueLabel}
                    labelLine={false}
                    nameKey="name"
                    outerRadius={96}
                  >
                    {financeChart.map((entry, index) => (
                      <Cell fill={COLORS[index % COLORS.length]} key={entry.name} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Faturas</p>
                  <p className="metric-value mt-2 text-3xl font-black text-brand-primary">{financeTotal}</p>
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(visibleFinanceLegend.length ? visibleFinanceLegend : financeChart).map((entry, index) => {
                const color = COLORS[index % COLORS.length];
                return (
                  <span
                    className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 text-xs font-semibold"
                    key={entry.name}
                    style={{ color }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    {entry.name}: {entry.value}
                  </span>
                );
              })}
            </div>
          </article>
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ShortcutCard
            description="Mapa, agenda, roteirizacao, equipes em campo, checklists e estoque em uma visao tatica."
            icon={<Wrench className="h-6 w-6" />}
            onClick={() => router.push("/operacao")}
            tags={[
              `${report?.serviceOrders.total ?? 0} OS`,
              `${report?.inventory.lowStockCount ?? 0} estoque baixo`,
              `${report?.serviceOrders.byStatus.inProgress ?? 0} em execucao`
            ]}
            title="Operacao"
          />
          <ShortcutCard
            description="Tickets, CRM, clientes, central do cliente, chat e acompanhamento de experiencia."
            icon={<LifeBuoy className="h-6 w-6" />}
            onClick={() => router.push("/atendimento")}
            tags={[
              `${report?.desk.total ?? 0} tickets`,
              `${crmSummary?.total ?? 0} leads`,
              `${customerSummary?.active ?? 0} clientes ativos`
            ]}
            title="Atendimento"
          />
          <ShortcutCard
            description="Recebiveis, faturamento, cobranca, despesas e resultado financeiro com leitura executiva."
            icon={<Coins className="h-6 w-6" />}
            onClick={() => router.push("/financeiro")}
            tags={[
              `${toMoney(report?.finance.amounts.open ?? 0)} aberto`,
              `${toMoney(report?.finance.amounts.received ?? 0)} recebido`,
              `${report?.finance.overdue ?? 0} vencidas`
            ]}
            title="Financeiro"
          />
          <ShortcutCard
            description="Projetos, padroes, POPs, midia, configuracoes e governanca da operacao inteira."
            icon={<ShieldCheck className="h-6 w-6" />}
            onClick={() => router.push("/administracao")}
            tags={[
              `${projectSummary?.total ?? 0} projetos`,
              `${projectSummary?.overdue ?? 0} atrasados`,
              `${report?.satisfaction.feedbacks ?? 0} feedbacks`
            ]}
            title="Administracao"
          />
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            accent="brand"
            label="Receita total"
            note="valor emitido no consolidado"
            value={toMoney(report?.finance.amounts.total ?? 0)}
            valueClassName="text-[clamp(1.15rem,1.45vw,1.95rem)]"
          />
          <MetricTile
            accent="emerald"
            label="Recebido"
            note="caixa confirmado no periodo"
            value={toMoney(report?.finance.amounts.received ?? 0)}
            valueClassName="text-[clamp(1.15rem,1.45vw,1.95rem)]"
          />
          <MetricTile
            accent="teal"
            label="Conversao comercial"
            note={`${crmSummary?.won ?? 0} oportunidades ganhas`}
            value={`${(report?.quotes.conversionRate ?? 0).toFixed(1)}%`}
          />
          <MetricTile
            accent="rose"
            label="Tickets em atraso"
            note="itens fora do SLA esperado"
            value={report?.desk.overdue ?? 0}
          />
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <Button
            className="h-auto justify-start gap-3 p-4 text-left"
            onClick={() => router.push("/projects")}
            type="button"
            variant="outline"
          >
            <Users2 className="h-5 w-5" />
            <span>
              <strong className="block text-sm">Projetos</strong>
              <span className="text-xs">
                Kanban, lista, calendario e progresso com visao de entrega.
              </span>
            </span>
          </Button>
          <Button
            className="h-auto justify-start gap-3 p-4 text-left"
            onClick={() => router.push("/reports")}
            type="button"
            variant="outline"
          >
            <ChartSpline className="h-5 w-5" />
            <span>
              <strong className="block text-sm">Relatorios completos</strong>
              <span className="text-xs">
                Analise consolidada com filtros, impressao e leitura por modulo.
              </span>
            </span>
          </Button>
          <Button
            className="h-auto justify-start gap-3 p-4 text-left"
            onClick={() => router.push("/crm")}
            type="button"
            variant="outline"
          >
            <BriefcaseBusiness className="h-5 w-5" />
            <span>
              <strong className="block text-sm">CRM e pipeline</strong>
              <span className="text-xs">
                Acompanhe leads, conversao comercial e relacionamento em andamento.
              </span>
            </span>
          </Button>
        </section>
      </AppShell>
    </RequireAuth>
  );
}
