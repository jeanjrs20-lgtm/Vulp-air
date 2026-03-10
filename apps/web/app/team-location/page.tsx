"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Battery,
  Building2,
  Filter,
  RefreshCcw,
  ShieldAlert,
  Users,
  X
} from "lucide-react";
import type {
  MonitoringMapRoutePoint,
  MonitoringMapTechnician
} from "@/components/team-monitoring-map";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";

const TeamMonitoringMap = dynamic(
  () =>
    import("@/components/team-monitoring-map").then((module) => ({
      default: module.TeamMonitoringMap
    })),
  {
    ssr: false,
    loading: () => <div className="h-[620px] w-full animate-pulse rounded-2xl bg-slate-200" />
  }
);

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type ConnectionFilter = "ALL" | "ONLINE" | "OFFLINE";
type FilterTab = "COLLABORATORS" | "CLIENTS";

type MonitoringPayload = {
  collectedAt: string;
  staleMinutes: number;
  items: Array<
    MonitoringMapTechnician & {
      alerts: string[];
      appVersion?: string | null;
      isCharging?: boolean | null;
      serviceOrder?: {
        id: string;
        code: string;
        title: string;
        status: string;
      } | null;
    }
  >;
};

type HistoryPoint = {
  id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  capturedAt: string;
};

const MANAGER_ROLES = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const RISK_META: Record<RiskLevel, { label: string; className: string }> = {
  LOW: { label: "Baixo", className: "bg-emerald-100 text-emerald-700" },
  MEDIUM: { label: "Medio", className: "bg-amber-100 text-amber-700" },
  HIGH: { label: "Alto", className: "bg-rose-100 text-rose-700" }
};

const ALERT_META: Record<string, string> = {
  NO_MONITORING_RECORD: "Sem registro do dispositivo",
  STALE_PING: "Sem ping recente",
  POSSIBLE_GPS_SPOOFING: "Possivel burla de GPS",
  GPS_UNAVAILABLE: "GPS indisponivel",
  INTERNET_OFFLINE: "Sem internet",
  BATTERY_CRITICAL: "Bateria critica",
  APP_OUTDATED: "App desatualizado"
};

const toDateInput = (value: Date) => {
  const offset = value.getTimezoneOffset();
  const adjusted = new Date(value.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

const toDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "N/A");

const toMetersDistance = (params: {
  latitudeA: number;
  longitudeA: number;
  latitudeB: number;
  longitudeB: number;
}) => {
  const radius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(params.latitudeB - params.latitudeA);
  const dLng = toRadians(params.longitudeB - params.longitudeA);
  const latA = toRadians(params.latitudeA);
  const latB = toRadians(params.latitudeB);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
};

const getBrowserPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocalizacao nao disponivel"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  });

export default function TeamLocationPage() {
  const queryClient = useQueryClient();
  const user = authStorage.getUser();
  const managerView = MANAGER_ROLES.has(user?.role ?? "");

  const [filterDrawerOpen, setFilterDrawerOpen] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>("COLLABORATORS");
  const [search, setSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [technicianFilterId, setTechnicianFilterId] = useState("");
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [dateFrom, setDateFrom] = useState(toDateInput(new Date()));
  const [dateTo, setDateTo] = useState(toDateInput(new Date()));
  const [staleMinutes, setStaleMinutes] = useState("30");
  const [latestAppVersion, setLatestAppVersion] = useState("11.00.58");
  const [riskFilter, setRiskFilter] = useState<"ALL" | RiskLevel>("ALL");
  const [connectionFilter, setConnectionFilter] = useState<ConnectionFilter>("ALL");
  const [showScheduledTasks, setShowScheduledTasks] = useState(true);
  const [showUnscheduledTasks, setShowUnscheduledTasks] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const staleMinutesValue = useMemo(() => {
    const parsed = Number(staleMinutes);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  }, [staleMinutes]);

  const monitoringQuery = useQuery({
    queryKey: ["team-location-monitoring", technicianFilterId, search, staleMinutes, latestAppVersion],
    queryFn: () => {
      const params = new URLSearchParams();
      if (technicianFilterId) params.set("technicianId", technicianFilterId);
      if (search.trim()) params.set("search", search.trim());
      if (staleMinutes.trim()) params.set("staleMinutes", staleMinutes.trim());
      if (latestAppVersion.trim()) params.set("latestAppVersion", latestAppVersion.trim());
      return api.get<MonitoringPayload>(
        `/team-location/monitoring${params.toString() ? `?${params.toString()}` : ""}`
      );
    },
    refetchInterval: 15_000
  });

  const historyTechnicianId = useMemo(() => {
    if (managerView) {
      return selectedTechnicianId || technicianFilterId || "";
    }
    return user?.id ?? "";
  }, [managerView, selectedTechnicianId, technicianFilterId, user?.id]);

  const historyQuery = useQuery({
    queryKey: ["team-location-history", historyTechnicianId, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams({
        dateFrom: new Date(`${dateFrom}T00:00:00`).toISOString(),
        dateTo: new Date(`${dateTo}T23:59:59`).toISOString(),
        limit: "500"
      });
      params.set("technicianId", historyTechnicianId);
      return api.get<HistoryPoint[]>(`/team-location/history?${params.toString()}`);
    },
    enabled: Boolean(historyTechnicianId)
  });

  const pingMutation = useMutation({
    mutationFn: async () => {
      const pingTechnicianId = managerView ? technicianFilterId || selectedTechnicianId : undefined;
      if (managerView && !pingTechnicianId) {
        throw new Error("Selecione um tecnico no filtro para enviar ping de teste.");
      }
      const position = await getBrowserPosition();
      const batteryApi = (navigator as Navigator & {
        getBattery?: () => Promise<{ level: number; charging: boolean }>;
      }).getBattery;
      const battery = batteryApi ? await batteryApi() : null;

      return api.post("/team-location/ping", {
        technicianId: pingTechnicianId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading ?? undefined,
        speed: position.coords.speed ?? undefined,
        source: managerView ? "WEB_MONITORING" : "WEB_BROWSER",
        gpsStatus: position.coords.accuracy <= 25 ? "HIGH_ACCURACY" : "LOW_ACCURACY",
        internetStatus: navigator.onLine ? "ONLINE" : "OFFLINE",
        batteryLevel: battery ? Math.round(battery.level * 100) : undefined,
        isCharging: battery?.charging ?? undefined,
        appVersion: latestAppVersion.trim() || undefined,
        deviceModel: navigator.platform,
        osVersion: navigator.userAgent.slice(0, 80),
        isMockLocation: false
      });
    },
    onSuccess: () => {
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["team-location-monitoring"] });
      queryClient.invalidateQueries({ queryKey: ["team-location-history"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const refreshAll = async () => {
    await Promise.all([monitoringQuery.refetch(), historyQuery.refetch()]);
  };

  const monitoringItems = useMemo(() => monitoringQuery.data?.items ?? [], [monitoringQuery.data]);
  const teamOptions = useMemo(
    () =>
      [...new Set(monitoringItems.map((item) => item.technician.team?.trim()).filter(Boolean))].sort((left, right) =>
        String(left).localeCompare(String(right), "pt-BR")
      ),
    [monitoringItems]
  );

  const filteredItems = useMemo(
    () =>
      monitoringItems.filter((item) => {
        if (selectedTeam && (item.technician.team ?? "") !== selectedTeam) {
          return false;
        }

        if (!showScheduledTasks && !showUnscheduledTasks) {
          return false;
        }

        const hasScheduledTasks = item.pendingTasks > 0 || Boolean(item.serviceOrder);
        if (showScheduledTasks !== showUnscheduledTasks) {
          if (showScheduledTasks && !hasScheduledTasks) {
            return false;
          }
          if (showUnscheduledTasks && hasScheduledTasks) {
            return false;
          }
        }

        if (riskFilter !== "ALL" && item.riskLevel !== riskFilter) {
          return false;
        }
        if (connectionFilter !== "ALL") {
          const stale = item.minutesWithoutPing == null || item.minutesWithoutPing > staleMinutesValue;
          const online = !stale && item.internetStatus === "ONLINE";
          if (connectionFilter === "ONLINE" && !online) {
            return false;
          }
          if (connectionFilter === "OFFLINE" && online) {
            return false;
          }
        }

        if (filterTab === "CLIENTS" && clientSearch.trim()) {
          const text = clientSearch.trim().toLowerCase();
          const target = `${item.serviceOrder?.title ?? ""} ${item.serviceOrder?.code ?? ""} ${item.lastKnownAddress ?? ""}`.toLowerCase();
          if (!target.includes(text)) {
            return false;
          }
        }

        return true;
      }),
    [
      clientSearch,
      connectionFilter,
      filterTab,
      monitoringItems,
      riskFilter,
      selectedTeam,
      showScheduledTasks,
      showUnscheduledTasks,
      staleMinutesValue
    ]
  );

  useEffect(() => {
    if (!filteredItems.length) {
      if (selectedTechnicianId) {
        setSelectedTechnicianId("");
      }
      return;
    }
    if (!selectedTechnicianId || !filteredItems.some((item) => item.technician.id === selectedTechnicianId)) {
      setSelectedTechnicianId(filteredItems[0].technician.id);
    }
  }, [filteredItems, selectedTechnicianId]);

  const selected = useMemo(
    () => filteredItems.find((item) => item.technician.id === selectedTechnicianId) ?? null,
    [filteredItems, selectedTechnicianId]
  );

  const routePoints = useMemo<MonitoringMapRoutePoint[]>(
    () =>
      [...(historyQuery.data ?? [])]
        .sort((left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime())
        .map((item) => ({
          id: item.id,
          latitude: item.latitude,
          longitude: item.longitude,
          capturedAt: item.capturedAt,
          accuracy: item.accuracy ?? null
        })),
    [historyQuery.data]
  );

  const routeStats = useMemo(() => {
    if (routePoints.length <= 1) {
      return { distanceKm: 0, avgPrecision: null as number | null };
    }
    let meters = 0;
    for (let index = 1; index < routePoints.length; index += 1) {
      meters += toMetersDistance({
        latitudeA: routePoints[index - 1].latitude,
        longitudeA: routePoints[index - 1].longitude,
        latitudeB: routePoints[index].latitude,
        longitudeB: routePoints[index].longitude
      });
    }
    const pointsWithAccuracy = routePoints.filter((point) => point.accuracy != null);
    const avgPrecision = pointsWithAccuracy.length
      ? pointsWithAccuracy.reduce((sum, point) => sum + (point.accuracy ?? 0), 0) / pointsWithAccuracy.length
      : null;
    return { distanceKm: meters / 1000, avgPrecision };
  }, [routePoints]);

  const selectedOnline =
    selected != null &&
    selected.minutesWithoutPing != null &&
    selected.minutesWithoutPing <= staleMinutesValue &&
    selected.internetStatus === "ONLINE";

  const clearDrawerFilters = () => {
    setSearch("");
    setClientSearch("");
    setSelectedTeam("");
    setTechnicianFilterId("");
    setRiskFilter("ALL");
    setConnectionFilter("ALL");
    setShowScheduledTasks(true);
    setShowUnscheduledTasks(true);
    setStaleMinutes("30");
    setLatestAppVersion("11.00.58");
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Mapa dedicado da equipe tecnica</h1>
            <p className="text-sm text-slate-600">
              Filtro lateral estilo operacao para acompanhar tecnico, status do celular e trilha.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => pingMutation.mutate()} disabled={pingMutation.isPending}>
              {pingMutation.isPending ? "Enviando ping..." : "Enviar ping"}
            </Button>
            <Button onClick={refreshAll} type="button" variant="outline">
              <RefreshCcw className="mr-1 h-4 w-4" />
              Atualizar
            </Button>
            <Button onClick={() => setFilterDrawerOpen((open) => !open)} type="button" variant="outline">
              <Filter className="mr-1 h-4 w-4" />
              Filtros
            </Button>
          </div>
        </div>

        {errorMsg ? <p className="mb-3 text-sm text-red-600">{errorMsg}</p> : null}

        <section className="card mb-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 py-3">
            <h2 className="text-lg font-black text-brand-primary">Mapa interativo de monitoramento</h2>
            <span className="rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white">
              {filteredItems.length} tecnicos
            </span>
          </div>
          <div className="relative p-3">
            <TeamMonitoringMap
              technicians={filteredItems}
              routePoints={routePoints}
              selectedTechnicianId={selectedTechnicianId}
              staleMinutes={staleMinutesValue}
              onSelectTechnician={setSelectedTechnicianId}
            />

            {!filterDrawerOpen ? (
              <Button
                className="absolute right-6 top-6 z-[401]"
                onClick={() => setFilterDrawerOpen(true)}
                type="button"
                variant="outline"
              >
                <Filter className="mr-1 h-4 w-4" />
                Filtros
              </Button>
            ) : null}

            {filterDrawerOpen ? (
              <button
                aria-label="Fechar filtros"
                className="absolute inset-0 z-[402] bg-slate-950/35 md:hidden"
                onClick={() => setFilterDrawerOpen(false)}
                type="button"
              />
            ) : null}

            <aside
              className={`absolute right-3 top-3 z-[403] flex h-[calc(100%-24px)] w-[min(420px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl border border-brand-primary/20 bg-white shadow-2xl transition-transform duration-300 ${
                filterDrawerOpen ? "translate-x-0" : "translate-x-[110%]"
              }`}
            >
              <div className="flex items-center justify-between bg-brand-primary px-4 py-3 text-white">
                <p className="text-xs font-black uppercase tracking-wide">Filtros do mapa</p>
                <button
                  className="rounded-full p-1 text-white/90 transition hover:bg-white/20"
                  onClick={() => setFilterDrawerOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50">
                <button
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold ${
                    filterTab === "COLLABORATORS"
                      ? "border-b-2 border-brand-primary text-brand-primary"
                      : "text-slate-500"
                  }`}
                  onClick={() => setFilterTab("COLLABORATORS")}
                  type="button"
                >
                  <Users className="h-4 w-4" />
                  Colaboradores
                </button>
                <button
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold ${
                    filterTab === "CLIENTS"
                      ? "border-b-2 border-brand-primary text-brand-primary"
                      : "text-slate-500"
                  }`}
                  onClick={() => setFilterTab("CLIENTS")}
                  type="button"
                >
                  <Building2 className="h-4 w-4" />
                  Clientes
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {filterTab === "COLLABORATORS" ? (
                  <>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        checked={showScheduledTasks}
                        className="h-4 w-4 rounded border-slate-400 text-brand-primary focus:ring-brand-primary"
                        onChange={(event) => setShowScheduledTasks(event.target.checked)}
                        type="checkbox"
                      />
                      Mostrar tarefas agendadas
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        checked={showUnscheduledTasks}
                        className="h-4 w-4 rounded border-slate-400 text-brand-primary focus:ring-brand-primary"
                        onChange={(event) => setShowUnscheduledTasks(event.target.checked)}
                        type="checkbox"
                      />
                      Mostrar sem agendamento
                    </label>

                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Periodo</label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                        <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Equipe</label>
                      <select
                        className="w-full rounded-xl border px-3 py-2"
                        onChange={(event) => setSelectedTeam(event.target.value)}
                        value={selectedTeam}
                      >
                        <option value="">Todas equipes</option>
                        {teamOptions.map((team) => (
                          <option key={team} value={team}>
                            {team}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Colaborador</label>
                      <select
                        className="w-full rounded-xl border px-3 py-2"
                        value={technicianFilterId}
                        onChange={(event) => setTechnicianFilterId(event.target.value)}
                        disabled={!managerView}
                      >
                        <option value="">Todos usuarios</option>
                        {monitoringItems.map((item) => (
                          <option key={item.technician.id} value={item.technician.id}>
                            {item.technician.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Pesquisar tecnico</label>
                      <Input
                        placeholder="Nome, email ou equipe"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Risco</label>
                        <select
                          className="w-full rounded-xl border px-3 py-2"
                          value={riskFilter}
                          onChange={(event) => setRiskFilter(event.target.value as "ALL" | RiskLevel)}
                        >
                          <option value="ALL">Todos</option>
                          <option value="HIGH">Alto</option>
                          <option value="MEDIUM">Medio</option>
                          <option value="LOW">Baixo</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Conexao</label>
                        <select
                          className="w-full rounded-xl border px-3 py-2"
                          value={connectionFilter}
                          onChange={(event) => setConnectionFilter(event.target.value as ConnectionFilter)}
                        >
                          <option value="ALL">Todos</option>
                          <option value="ONLINE">Online</option>
                          <option value="OFFLINE">Offline</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Stale (min)</label>
                        <Input value={staleMinutes} onChange={(event) => setStaleMinutes(event.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Versao app</label>
                        <Input value={latestAppVersion} onChange={(event) => setLatestAppVersion(event.target.value)} />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-brand-primary/15 bg-brand-primary/5 p-3 text-sm text-slate-700">
                      Filtro de clientes usa os dados das tarefas vinculadas aos tecnicos no mapa.
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Pesquisar cliente/endereco</label>
                      <Input
                        placeholder="Nome do cliente, codigo da OS ou endereco"
                        value={clientSearch}
                        onChange={(event) => setClientSearch(event.target.value)}
                      />
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      As tarefas exibidas no mapa seguem os filtros de periodo e equipe definidos na aba de colaboradores.
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2 border-t border-slate-200 p-3">
                <Button className="flex-1" onClick={refreshAll} type="button">
                  Aplicar
                </Button>
                <Button className="flex-1" onClick={clearDrawerFilters} type="button" variant="outline">
                  Limpar
                </Button>
              </div>
            </aside>
          </div>
        </section>

        <section className="mb-4 grid gap-4 xl:grid-cols-2">
          <article className="card p-4">
            {selected ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Tecnico selecionado</p>
                  <p className="text-xl font-black text-brand-primary">{selected.technician.name}</p>
                  <p className="text-xs text-slate-500">{selected.technician.email}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm">
                    <strong>Status:</strong> {selectedOnline ? "Online" : "Offline"}
                  </p>
                  <p className="text-sm">
                    <strong>Ultimo ping:</strong> {toDateTime(selected.lastPingAt)}
                  </p>
                  <p className="text-sm">
                    <strong>Endereco:</strong> {selected.lastKnownAddress ?? "Sem endereco vinculado"}
                  </p>
                  <p className="text-sm">
                    <strong>Bateria:</strong>{" "}
                    {selected.batteryLevel != null
                      ? `${selected.batteryLevel}%${selected.isCharging ? " (carregando)" : ""}`
                      : "N/A"}
                  </p>
                  <p className="text-sm">
                    <strong>Versao app:</strong> {selected.appVersion ?? "N/A"}
                  </p>
                  <p className="text-sm">
                    <strong>Check-ins hoje:</strong> {selected.todayCheckIns}
                  </p>
                  <p className="text-sm">
                    <strong>Tarefas em espera:</strong> {selected.pendingTasks}
                  </p>
                  <p className="text-sm">
                    <strong>Tarefas concluidas hoje:</strong> {selected.completedTasksToday}
                  </p>
                  <p className="text-sm">
                    <strong>Risco:</strong>{" "}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RISK_META[selected.riskLevel].className}`}>
                      {RISK_META[selected.riskLevel].label}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Nenhum tecnico encontrado com os filtros atuais.</p>
            )}
          </article>

          <article className="card space-y-3 p-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm">
                <strong>Distancia percorrida no dia:</strong> {routeStats.distanceKm.toFixed(2)} km
              </p>
              <p className="text-sm">
                <strong>Precisao media:</strong>{" "}
                {routeStats.avgPrecision != null ? `${routeStats.avgPrecision.toFixed(1)} m` : "N/A"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Alertas</p>
              {selected?.alerts.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {selected.alerts.map((alert) => (
                    <span
                      className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700"
                      key={`${selected.technician.id}-${alert}`}
                    >
                      {ALERT_META[alert] ?? alert}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                  Sem alertas
                </span>
              )}
            </div>
          </article>
        </section>

        <section className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-brand-primary" />
            <h2 className="text-lg font-bold text-brand-primary">Pesquisa de tecnicos</h2>
          </div>
          <div className="card overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2">Tecnico</th>
                  <th className="px-3 py-2">Ultimo ping</th>
                  <th className="px-3 py-2">Bateria</th>
                  <th className="px-3 py-2">Check-ins</th>
                  <th className="px-3 py-2">Pendentes</th>
                  <th className="px-3 py-2">Risco</th>
                  <th className="px-3 py-2">Mapa</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr className={item.technician.id === selectedTechnicianId ? "bg-brand-primary/5" : ""} key={item.technician.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-brand-primary">{item.technician.name}</p>
                      <p className="text-xs text-slate-500">{item.technician.team ?? "Sem equipe"}</p>
                    </td>
                    <td className="px-3 py-2">{toDateTime(item.lastPingAt)}</td>
                    <td className="px-3 py-2">
                      {item.batteryLevel != null ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          <Battery className="h-3.5 w-3.5" />
                          {item.batteryLevel}%
                        </span>
                      ) : (
                        "N/A"
                      )}
                    </td>
                    <td className="px-3 py-2">{item.todayCheckIns}</td>
                    <td className="px-3 py-2">{item.pendingTasks}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${RISK_META[item.riskLevel].className}`}>
                        {RISK_META[item.riskLevel].label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant={item.technician.id === selectedTechnicianId ? "default" : "outline"}
                        onClick={() => setSelectedTechnicianId(item.technician.id)}
                      >
                        Selecionar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </AppShell>
    </RequireAuth>
  );
}
