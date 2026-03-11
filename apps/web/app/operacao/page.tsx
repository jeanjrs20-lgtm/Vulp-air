"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BadgePlus,
  CalendarClock,
  MapPinned,
  Navigation,
  RefreshCcw,
  ShieldAlert,
  Truck,
  Warehouse
} from "lucide-react";
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
import { authStorage } from "@/lib/auth-storage";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type ServiceOrderStatus =
  | "OPEN"
  | "SCHEDULED"
  | "DISPATCHED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

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
  expensesAndKm: {
    totalAmount: number;
    totalKm: number;
  };
  inventory: {
    lowStockCount: number;
    movementByType: Array<{
      type: string;
      quantity: number;
    }>;
  };
  productivityByTechnician: Array<{
    technicianId: string;
    technicianName: string;
    completionRate: number;
    totalOrders: number;
  }>;
};

type MonitoringPayload = {
  staleMinutes: number;
  items: Array<{
    technician: {
      id: string;
      name: string;
    };
    minutesWithoutPing: number | null;
    internetStatus: "ONLINE" | "OFFLINE" | "UNAVAILABLE";
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    pendingTasks: number;
    completedTasksToday: number;
  }>;
};

type ScheduleItem = {
  id: string;
  code: string;
  title: string;
  status: ServiceOrderStatus;
  scheduledStartAt?: string | null;
  serviceDate?: string | null;
  customer?: { name: string } | null;
  siteLocation?: { name: string } | null;
};

type SchedulePayload = {
  items: ScheduleItem[];
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "SUPERADMIN" | "ADMIN" | "SUPERVISOR" | "TECNICO" | "LEITOR";
  team?: string | null;
  regional?: string | null;
  createdAt: string;
};

const WINDOW_DAYS = 30;
const CHART_COLORS = ["#14b8a6", "#f59e0b", "#ef4444"];

const toDateInput = (value: Date) => {
  const offset = value.getTimezoneOffset();
  const adjusted = new Date(value.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

const toMoney = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const toHour = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "-";

const STATUS_KEY_LABEL: Record<keyof ReportsOverviewPayload["serviceOrders"]["byStatus"], string> = {
  open: "Abertas",
  scheduled: "Agendadas",
  dispatched: "Despachadas",
  inProgress: "Execucao",
  onHold: "Espera",
  completed: "Concluidas",
  cancelled: "Canceladas"
};

export default function OperacaoDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = authStorage.getUser();
  const canManageTechnicians = user?.role === "SUPERADMIN" || user?.role === "ADMIN";
  const now = new Date();
  const dateFrom = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60_000);
  const weekStart = toDateInput(now);
  const weekEnd = toDateInput(new Date(now.getTime() + 6 * 24 * 60 * 60_000));
  const [technicianDialogOpen, setTechnicianDialogOpen] = useState(false);
  const [technicianName, setTechnicianName] = useState("");
  const [technicianEmail, setTechnicianEmail] = useState("");
  const [technicianPassword, setTechnicianPassword] = useState("");
  const [technicianTeam, setTechnicianTeam] = useState("");
  const [technicianRegional, setTechnicianRegional] = useState("");
  const [technicianError, setTechnicianError] = useState<string | null>(null);

  const reportQuery = useQuery({
    queryKey: ["operacao-dashboard-report"],
    queryFn: () =>
      api.get<ReportsOverviewPayload>(
        `/reports/overview?dateFrom=${encodeURIComponent(dateFrom.toISOString())}&dateTo=${encodeURIComponent(
          new Date().toISOString()
        )}`
      )
  });

  const monitoringQuery = useQuery({
    queryKey: ["operacao-dashboard-monitoring"],
    queryFn: () =>
      api.get<MonitoringPayload>("/team-location/monitoring?staleMinutes=30&latestAppVersion=11.00.58"),
    refetchInterval: 20_000
  });

  const scheduleQuery = useQuery({
    queryKey: ["operacao-dashboard-schedule", weekStart, weekEnd],
    queryFn: () =>
      api.get<SchedulePayload>(
        `/service-orders/schedule?dateFrom=${encodeURIComponent(
          new Date(`${weekStart}T00:00:00`).toISOString()
        )}&dateTo=${encodeURIComponent(new Date(`${weekEnd}T23:59:59`).toISOString())}`
      )
  });

  const usersQuery = useQuery({
    queryKey: ["operacao-dashboard-users"],
    queryFn: () => api.get<UserRow[]>("/users"),
    enabled: canManageTechnicians
  });

  const createTechnicianMutation = useMutation({
    mutationFn: () =>
      api.post<UserRow>("/users", {
        name: technicianName.trim(),
        email: technicianEmail.trim(),
        password: technicianPassword,
        role: "TECNICO",
        team: technicianTeam.trim() || undefined,
        regional: technicianRegional.trim() || undefined
      }),
    onSuccess: async () => {
      setTechnicianDialogOpen(false);
      setTechnicianError(null);
      setTechnicianName("");
      setTechnicianEmail("");
      setTechnicianPassword("");
      setTechnicianTeam("");
      setTechnicianRegional("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["operacao-dashboard-users"] }),
        queryClient.invalidateQueries({ queryKey: ["operacao-dashboard-monitoring"] }),
        queryClient.invalidateQueries({ queryKey: ["service-order-options"] }),
        queryClient.invalidateQueries({ queryKey: ["routing-options"] }),
        queryClient.invalidateQueries({ queryKey: ["desk-options"] })
      ]);
    },
    onError: (error) => {
      setTechnicianError(error.message);
    }
  });

  const report = reportQuery.data;
  const monitoring = monitoringQuery.data;
  const schedule = scheduleQuery.data?.items ?? [];
  const technicians = useMemo(
    () =>
      (usersQuery.data ?? [])
        .filter((item) => item.role === "TECNICO")
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [usersQuery.data]
  );

  const activeOrders = useMemo(() => {
    if (!report) {
      return 0;
    }
    return (
      report.serviceOrders.byStatus.open +
      report.serviceOrders.byStatus.scheduled +
      report.serviceOrders.byStatus.dispatched +
      report.serviceOrders.byStatus.inProgress +
      report.serviceOrders.byStatus.onHold
    );
  }, [report]);

  const techniciansOnline = useMemo(() => {
    if (!monitoring) {
      return 0;
    }

    return monitoring.items.filter((item) => {
      if (item.minutesWithoutPing == null) {
        return false;
      }

      return item.minutesWithoutPing <= monitoring.staleMinutes && item.internetStatus === "ONLINE";
    }).length;
  }, [monitoring]);

  const riskDistribution = useMemo(() => {
    const base = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0
    };

    for (const item of monitoring?.items ?? []) {
      base[item.riskLevel] += 1;
    }

    return [
      { name: "Baixo", value: base.LOW },
      { name: "Medio", value: base.MEDIUM },
      { name: "Alto", value: base.HIGH }
    ];
  }, [monitoring?.items]);

  const osByStatusChart = useMemo(
    () =>
      report
        ? (
            Object.entries(report.serviceOrders.byStatus) as Array<
              [keyof ReportsOverviewPayload["serviceOrders"]["byStatus"], number]
            >
          ).map(([status, value]) => ({
            status: STATUS_KEY_LABEL[status] ?? status,
            total: value
          }))
        : [],
    [report]
  );

  const stockMovementChart = (report?.inventory.movementByType ?? []).map((item) => ({
    type: item.type,
    quantidade: item.quantity
  }));

  const topAgenda = [...schedule]
    .sort((left, right) => {
      const leftTime = new Date(left.scheduledStartAt ?? left.serviceDate ?? 0).getTime();
      const rightTime = new Date(right.scheduledStartAt ?? right.serviceDate ?? 0).getTime();
      return leftTime - rightTime;
    })
    .slice(0, 8);

  const totalPendingTasks = (monitoring?.items ?? []).reduce((sum, item) => sum + item.pendingTasks, 0);
  const totalCompletedToday = (monitoring?.items ?? []).reduce((sum, item) => sum + item.completedTasksToday, 0);
  const averageCompletionRate =
    report?.productivityByTechnician.length
      ? report.productivityByTechnician.reduce((sum, item) => sum + item.completionRate, 0) /
        report.productivityByTechnician.length
      : 0;

  const refreshAll = async () => {
    await Promise.all([reportQuery.refetch(), monitoringQuery.refetch(), scheduleQuery.refetch(), usersQuery.refetch()]);
  };

  const isRefreshing = reportQuery.isRefetching || monitoringQuery.isRefetching || scheduleQuery.isRefetching;

  return (
    <RequireAuth>
      <AppShell>
        <DashboardHero
          actions={
            <>
              {canManageTechnicians ? (
                <Dialog open={technicianDialogOpen} onOpenChange={setTechnicianDialogOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline">
                      <BadgePlus className="mr-1 h-4 w-4" />
                      Cadastrar tecnico
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Novo tecnico de campo</DialogTitle>
                    </DialogHeader>
                    <form
                      className="space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setTechnicianError(null);
                        createTechnicianMutation.mutate();
                      }}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-sm font-semibold text-brand-primary">Nome completo</label>
                          <Input
                            required
                            value={technicianName}
                            onChange={(event) => setTechnicianName(event.target.value)}
                            placeholder="Ex.: Joao Silva"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-brand-primary">E-mail</label>
                          <Input
                            required
                            type="email"
                            value={technicianEmail}
                            onChange={(event) => setTechnicianEmail(event.target.value)}
                            placeholder="tecnico@empresa.com"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-brand-primary">Senha inicial</label>
                          <Input
                            required
                            minLength={6}
                            type="password"
                            value={technicianPassword}
                            onChange={(event) => setTechnicianPassword(event.target.value)}
                            placeholder="Minimo 6 caracteres"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-brand-primary">Equipe</label>
                          <Input
                            value={technicianTeam}
                            onChange={(event) => setTechnicianTeam(event.target.value)}
                            placeholder="Ex.: HVAC SP 01"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-brand-primary">Regional</label>
                          <Input
                            value={technicianRegional}
                            onChange={(event) => setTechnicianRegional(event.target.value)}
                            placeholder="Ex.: Sudeste"
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-brand-primary/10 bg-brand-background-soft/45 px-3 py-2 text-xs text-slate-600">
                        O tecnico sera criado com perfil operacional e passara a aparecer nas telas de monitoramento,
                        agenda, roteirizacao e ordens de servico.
                      </div>

                      {technicianError ? (
                        <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {technicianError}
                        </p>
                      ) : null}

                      <Button className="w-full" disabled={createTechnicianMutation.isPending} type="submit">
                        {createTechnicianMutation.isPending ? "Cadastrando..." : "Cadastrar tecnico"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : null}
              <Button onClick={() => router.push("/service-orders?new=1")} type="button">
                Nova OS
              </Button>
              <Button onClick={() => router.push("/team-location")} type="button" variant="outline">
                Monitoramento
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
                label="OS ativas"
                note="abertas, agendadas, despachadas e em execucao"
                value={activeOrders}
              />
              <DashboardPulseCard
                label="Tecnicos online"
                note={`ping valido em ate ${monitoring?.staleMinutes ?? 30} min`}
                value={techniciansOnline}
              />
              <DashboardPulseCard
                accentClassName="text-rose-600"
                label="Despesas de campo"
                note={`janela atual de ${WINDOW_DAYS} dias`}
                value={toMoney(report?.expensesAndKm.totalAmount ?? 0)}
              />
              <DashboardPulseCard
                accentClassName="text-teal-600"
                label="Km rodado"
                note="mesma janela operacional"
                value={(report?.expensesAndKm.totalKm ?? 0).toFixed(1)}
              />
            </>
          }
          description="Ordens, equipe em campo, agenda tecnica, risco operacional e estoque em uma leitura unica para decisao rapida."
          eyebrow={
            <>
              <Activity className="h-3.5 w-3.5" />
              Dashboard de operacao
            </>
          }
          footer="Graficos e indicadores abaixo seguem a leitura operacional dos ultimos 30 dias."
          title="Centro tatico da operacao em campo"
        />

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <DashboardMetricTile
            label="Ordens totais"
            note={dashboardScopeLabel(WINDOW_DAYS)}
            value={report?.serviceOrders.total ?? 0}
          />
          <DashboardMetricTile
            label="Tarefas pendentes"
            note="fila pendente no celular da equipe"
            value={totalPendingTasks}
          />
          <DashboardMetricTile
            accent="rose"
            label="Risco alto"
            note="tecnicos com sinal critico"
            value={riskDistribution[2]?.value ?? 0}
          />
          <DashboardMetricTile
            accent="amber"
            label="Estoque baixo"
            note="itens abaixo do minimo"
            value={report?.inventory.lowStockCount ?? 0}
          />
          <DashboardMetricTile
            accent="teal"
            label="Produtividade media"
            note={`${totalCompletedToday} concluidas hoje`}
            value={`${averageCompletionRate.toFixed(1)}%`}
          />
          {canManageTechnicians ? (
            <DashboardMetricTile
              accent="brand"
              label="Tecnicos cadastrados"
              note="base ativa de campo"
              value={technicians.length}
            />
          ) : null}
        </section>

        <section className="mb-5 grid gap-3 xl:grid-cols-3">
          <DashboardChartCard
            scope={dashboardScopeLabel(WINDOW_DAYS)}
            section="Ordens"
            title="Ordens por status"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={osByStatusChart} margin={{ top: 36, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(7,56,77,0.12)" strokeDasharray="4 4" />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: "#48616F" }} tickLine={false} />
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
            section="Estoque"
            title="Movimentacao de estoque"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={stockMovementChart} margin={{ top: 36, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(7,56,77,0.12)" strokeDasharray="4 4" />
                <XAxis dataKey="type" tick={{ fontSize: 11, fill: "#48616F" }} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  domain={[0, dashboardYAxisWithHeadroom]}
                  tick={{ fill: "#48616F" }}
                  tickLine={false}
                />
                <Tooltip />
                <Bar dataKey="quantidade" fill="#14b8a6" radius={[10, 10, 0, 0]}>
                  <LabelList content={dashboardBarValueLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>

          <DashboardChartCard
            footer={<DashboardLegend colors={CHART_COLORS} items={riskDistribution} getValue={(item) => item.value} />}
            scope="Leitura de risco da equipe conectada"
            section="Monitoramento"
            title="Risco da equipe tecnica"
          >
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={riskDistribution}
                  dataKey="value"
                  innerRadius={66}
                  label={dashboardPieValueLabel}
                  labelLine={false}
                  nameKey="name"
                  outerRadius={96}
                >
                  {riskDistribution.map((entry, index) => (
                    <Cell fill={CHART_COLORS[index % CHART_COLORS.length]} key={entry.name} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </DashboardChartCard>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <article className="app-surface card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.08em] text-brand-primary">
                  Agenda tecnica da semana
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Prioridade visual para as proximas ordens planejadas
                </p>
              </div>
              <Button onClick={() => router.push("/service-orders/schedule")} type="button" variant="outline">
                Agenda completa
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {topAgenda.map((item) => (
                <article className="rounded-[22px] border border-brand-primary/10 bg-white/80 p-4" key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-brand-primary">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.customer?.name ?? "Sem cliente"}</p>
                    </div>
                    <span className="rounded-full bg-brand-background-soft px-3 py-1 text-xs font-black text-brand-primary">
                      {toHour(item.scheduledStartAt ?? item.serviceDate)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-600">
                    {item.code} | {item.siteLocation?.name ?? "Sem unidade"}
                  </p>
                </article>
              ))}

              {!scheduleQuery.isLoading && topAgenda.length === 0 ? (
                <p className="rounded-[22px] border border-brand-primary/10 bg-white/80 p-4 text-sm text-slate-600">
                  Nenhuma atividade operacional encontrada para a janela atual da agenda.
                </p>
              ) : null}
            </div>
          </article>

          <aside className="app-surface card p-5">
            <div className="mb-4">
              <p className="text-sm font-black uppercase tracking-[0.08em] text-brand-primary">
                Atalhos operacionais
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Acesso rapido aos pontos mais usados pela operacao
              </p>
            </div>

            <div className="space-y-2">
              {canManageTechnicians ? (
                <Button className="w-full justify-start" onClick={() => setTechnicianDialogOpen(true)} type="button">
                  <BadgePlus className="mr-2 h-4 w-4" />
                  Cadastrar tecnico
                </Button>
              ) : null}
              <Button className="w-full justify-start" onClick={() => router.push("/service-orders")} type="button" variant="outline">
                <Truck className="mr-2 h-4 w-4" />
                Ordens de servico
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/service-orders/schedule")} type="button" variant="outline">
                <CalendarClock className="mr-2 h-4 w-4" />
                Agenda tecnica
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/team-location")} type="button" variant="outline">
                <MapPinned className="mr-2 h-4 w-4" />
                Mapa e monitoramento
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/routing")} type="button" variant="outline">
                <Navigation className="mr-2 h-4 w-4" />
                Roteirizacao
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/inventory")} type="button" variant="outline">
                <Warehouse className="mr-2 h-4 w-4" />
                Estoque de produto
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/checklists/templates")} type="button" variant="outline">
                <ShieldAlert className="mr-2 h-4 w-4" />
                Checklists e auditorias
              </Button>
            </div>
          </aside>
        </section>

        {canManageTechnicians ? (
          <section className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <article className="app-surface card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.08em] text-brand-primary">
                    Equipe tecnica cadastrada
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Base de tecnicos usada em ordens, agendas, roteiros e monitoramento.
                  </p>
                </div>
                <Button onClick={() => usersQuery.refetch()} type="button" variant="outline">
                  Atualizar equipe
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {technicians.slice(0, 6).map((technician) => (
                  <article className="rounded-[22px] border border-brand-primary/10 bg-white/80 p-4" key={technician.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-brand-primary">{technician.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{technician.email}</p>
                      </div>
                      <span className="rounded-full bg-brand-background-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-brand-primary">
                        Tecnico
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      <p>Equipe: {technician.team?.trim() || "Nao informada"}</p>
                      <p>Regional: {technician.regional?.trim() || "Nao informada"}</p>
                      <p>Criado em: {new Date(technician.createdAt).toLocaleDateString("pt-BR")}</p>
                    </div>
                  </article>
                ))}

                {!usersQuery.isLoading && technicians.length === 0 ? (
                  <p className="rounded-[22px] border border-brand-primary/10 bg-white/80 p-4 text-sm text-slate-600">
                    Nenhum tecnico cadastrado ainda. Use o botao acima para criar o primeiro.
                  </p>
                ) : null}
              </div>
            </article>

            <aside className="app-surface card p-5">
              <p className="text-sm font-black uppercase tracking-[0.08em] text-brand-primary">Fluxo do cadastro</p>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>1. Cadastra nome, e-mail, senha inicial, equipe e regional.</p>
                <p>2. O tecnico entra na base oficial de usuarios com papel operacional.</p>
                <p>3. O nome passa a aparecer em OS, agenda, roteirizacao, despesas e monitoramento.</p>
                <p>4. Depois voce pode acompanhar o dispositivo dele na tela de mapa e monitoramento.</p>
              </div>
            </aside>
          </section>
        ) : null}
      </AppShell>
    </RequireAuth>
  );
}
