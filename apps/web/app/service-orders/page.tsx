"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import dynamicImport from "next/dynamic";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";
import { toApiAssetUrl } from "@/lib/public-api";

type OrderStatus = "OPEN" | "SCHEDULED" | "DISPATCHED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
type OrderPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type OrderItem = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  status: OrderStatus;
  priority: OrderPriority;
  serviceDate?: string | null;
  updatedAt: string;
  assignedTechnician?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
  siteLocation?: {
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    geofenceRadiusMeters?: number | null;
  } | null;
  equipment?: { id: string; brand: string | null; model: string | null } | null;
  checklistExecution?: { id: string; code: string; status: string; step: number } | null;
};

type OrderDetail = OrderItem & {
  locations: Array<{
    id: string;
    type: "CHECK_IN" | "CHECK_OUT" | "PING";
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    source?: string | null;
    note?: string | null;
    capturedAt: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    note?: string | null;
    payload?: unknown;
    createdAt: string;
    actor?: { id: string; name: string; role: string } | null;
  }>;
  latestDocument?: {
    id: string;
    title: string;
    storageKey: string;
    mimeType: string;
    size: number;
    createdAt: string;
    url: string;
  } | null;
};

type LocationTracePoint = {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT" | "PING";
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source?: string | null;
  capturedAt: string;
};

type OptionsPayload = {
  technicians: Array<{ id: string; name: string; email: string }>;
  customers: Array<{ id: string; name: string }>;
  sites: Array<{ id: string; name: string; customerId: string }>;
  equipments: Array<{ id: string; brand: string | null; model: string | null; siteLocationId: string }>;
  templateVersions: Array<{ id: string; version: number; template: { id: string; name: string; serviceType: string } }>;
};

const STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
  OPEN: { label: "Aberta", className: "bg-slate-100 text-slate-700" },
  SCHEDULED: { label: "Agendada", className: "bg-sky-100 text-sky-700" },
  DISPATCHED: { label: "Despachada", className: "bg-indigo-100 text-indigo-700" },
  IN_PROGRESS: { label: "Em execucao", className: "bg-amber-100 text-amber-700" },
  ON_HOLD: { label: "Em espera", className: "bg-orange-100 text-orange-700" },
  COMPLETED: { label: "Concluida", className: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "Cancelada", className: "bg-rose-100 text-rose-700" }
};

const PRIORITY_META: Record<OrderPriority, { label: string; className: string }> = {
  LOW: { label: "Baixa", className: "bg-slate-100 text-slate-700" },
  MEDIUM: { label: "Media", className: "bg-sky-100 text-sky-700" },
  HIGH: { label: "Alta", className: "bg-orange-100 text-orange-700" },
  URGENT: { label: "Urgente", className: "bg-rose-100 text-rose-700" }
};

const EVENT_LABELS: Record<string, string> = {
  SERVICE_ORDER_CREATED: "Ordem criada",
  SERVICE_ORDER_UPDATED: "Ordem atualizada",
  SERVICE_ORDER_STATUS_UPDATED: "Status atualizado",
  SERVICE_ORDER_SCHEDULE_UPDATED: "Agenda atualizada",
  SERVICE_ORDER_STARTED: "Atendimento iniciado",
  SERVICE_ORDER_COMPLETED: "Atendimento concluido",
  SERVICE_ORDER_CANCELLED: "Ordem cancelada",
  SERVICE_ORDER_CHECK_IN: "Check-in realizado",
  SERVICE_ORDER_CHECK_OUT: "Check-out realizado",
  SERVICE_ORDER_LOCATION_PING: "Posicao registrada",
  SERVICE_ORDER_DOCUMENT_EMITTED: "OS digital gerada",
  SERVICE_ORDER_CHECKLIST_LINKED: "Checklist vinculado",
  QUOTE_CREATED: "Orcamento criado",
  QUOTE_APPROVED: "Orcamento aprovado",
  QUOTE_REJECTED: "Orcamento reprovado",
  FINANCIAL_INVOICE_CREATED: "Fatura criada",
  ROUTE_PUBLISHED: "Roteiro publicado",
  ROUTE_STOP_STATUS_UPDATED: "Parada de roteiro atualizada",
  MATERIAL_CONSUMED: "Material consumido",
  CHAT_THREAD_CREATED: "Conversa criada",
  CHAT_MESSAGE_POSTED: "Mensagem registrada"
};

const MANAGER_ROLES = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const toDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "-");
const toDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "-");
const maybe = (value: string) => (value.trim() ? value.trim() : undefined);
const toNumberLabel = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : null;
const toTextLabel = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const buildEventDetailLines = (event: OrderDetail["events"][number]) => {
  if (!isRecord(event.payload)) {
    return [] as string[];
  }

  const payload = event.payload;
  const lines: string[] = [];

  const status = toTextLabel(payload.status);
  if (status) lines.push(`Status: ${status}`);

  const source = toTextLabel(payload.source);
  if (source) lines.push(`Fonte: ${source}`);

  const quantity = toNumberLabel(payload.quantity);
  if (quantity) lines.push(`Quantidade: ${quantity}`);

  const total = toNumberLabel(payload.total);
  if (total) lines.push(`Total: R$ ${total}`);

  const accuracy = toNumberLabel(payload.accuracy);
  if (accuracy) lines.push(`Acuracia: ${accuracy} m`);

  const latitude = toNumberLabel(payload.latitude);
  const longitude = toNumberLabel(payload.longitude);
  if (latitude && longitude) lines.push(`Coordenadas: ${latitude}, ${longitude}`);

  const scheduledStartAt = toTextLabel(payload.scheduledStartAt);
  if (scheduledStartAt) lines.push(`Inicio: ${toDateTime(scheduledStartAt)}`);

  const scheduledEndAt = toTextLabel(payload.scheduledEndAt);
  if (scheduledEndAt) lines.push(`Fim: ${toDateTime(scheduledEndAt)}`);

  const quoteCode = toTextLabel(payload.quoteCode);
  if (quoteCode) lines.push(`Orcamento: ${quoteCode}`);

  const geofence = payload.geofence;
  if (isRecord(geofence)) {
    const radiusMeters = toNumberLabel(geofence.radiusMeters);
    const distanceMeters = toNumberLabel(geofence.distanceMeters);
    if (radiusMeters && distanceMeters) {
      lines.push(`Geofence: ${distanceMeters}m de ${radiusMeters}m`);
    }
  }

  return lines;
};

const toEventLabel = (type: string) =>
  EVENT_LABELS[type] ?? type.toLowerCase().replaceAll("_", " ");

const getBrowserPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocalizacao nao disponivel neste dispositivo"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  });

const getGeoErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("denied")) {
      return "Permissao de geolocalizacao negada no navegador.";
    }
    return error.message;
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = Number((error as { code?: number }).code ?? 0);
    if (code === 1) {
      return "Permissao de geolocalizacao negada no navegador.";
    }
    if (code === 2) {
      return "Posicao indisponivel no momento.";
    }
    if (code === 3) {
      return "Tempo excedido ao obter geolocalizacao.";
    }
  }

  return "Nao foi possivel obter geolocalizacao.";
};

const resolveLocationPayload = async (
  order: OrderDetail | undefined,
  action: "check-in" | "check-out"
) => {
  try {
    const position = await getBrowserPosition();
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading ?? undefined,
      speed: position.coords.speed ?? undefined,
      source: "WEB_BROWSER"
    };
  } catch (error) {
    const geoMessage = getGeoErrorMessage(error);
    const fallbackLatitude = order?.siteLocation?.latitude ?? order?.locations?.[0]?.latitude ?? null;
    const fallbackLongitude =
      order?.siteLocation?.longitude ?? order?.locations?.[0]?.longitude ?? null;

    if (fallbackLatitude != null && fallbackLongitude != null) {
      return {
        latitude: fallbackLatitude,
        longitude: fallbackLongitude,
        accuracy: 80,
        source: "WEB_FALLBACK",
        note: `${action.toUpperCase()} com fallback de coordenadas. Motivo: ${geoMessage}`
      };
    }

    return {
      latitude: -23.55052,
      longitude: -46.633308,
      accuracy: 150,
      source: "WEB_DEFAULT",
      note: `${action.toUpperCase()} com fallback padrao. Motivo: ${geoMessage}`
    };
  }
};

const ServiceOrderTrailMap = dynamicImport(
  () =>
    import("@/components/service-order-trail-map").then((module) => ({
      default: module.ServiceOrderTrailMap
    })),
  {
    ssr: false,
    loading: () => <p className="text-sm text-slate-600">Carregando mapa...</p>
  }
);

function ServiceOrdersPageContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const user = authStorage.getUser();
  const managerView = MANAGER_ROLES.has(user?.role ?? "");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | OrderStatus>("ALL");
  const [priority, setPriority] = useState<"ALL" | OrderPriority>("ALL");
  const [technicianId, setTechnicianId] = useState("");
  const [customerFilterId, setCustomerFilterId] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newPriority, setNewPriority] = useState<OrderPriority>("MEDIUM");
  const [newTechnicianId, setNewTechnicianId] = useState("");
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newSiteId, setNewSiteId] = useState("");
  const [newEquipmentId, setNewEquipmentId] = useState("");
  const [newServiceDate, setNewServiceDate] = useState("");

  const [templateVersionId, setTemplateVersionId] = useState("");
  const [assignTechId, setAssignTechId] = useState("");

  useEffect(() => {
    if (!managerView) {
      return;
    }

    if (searchParams.get("new") === "1") {
      setCreateOpen(true);
      setErrorMsg(null);
    }
  }, [managerView, searchParams]);

  const optionsQuery = useQuery({
    queryKey: ["service-order-options"],
    queryFn: () => api.get<OptionsPayload>("/service-orders/options")
  });

  const ordersQuery = useQuery({
    queryKey: ["service-orders", search, status, priority, technicianId, customerFilterId, managerView],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status !== "ALL") params.set("status", status);
      if (priority !== "ALL") params.set("priority", priority);
      if (customerFilterId) params.set("customerId", customerFilterId);
      if (managerView && technicianId) params.set("technicianId", technicianId);
      const qs = params.toString();
      return api.get<OrderItem[]>(`/service-orders${qs ? `?${qs}` : ""}`);
    }
  });

  const detailQuery = useQuery({
    queryKey: ["service-order-detail", selectedId],
    queryFn: () => api.get<OrderDetail>(`/service-orders/${selectedId}`),
    enabled: Boolean(selectedId)
  });

  const traceQuery = useQuery({
    queryKey: ["service-order-trace", selectedId],
    queryFn: () => api.get<LocationTracePoint[]>(`/service-orders/${selectedId}/location-trace?limit=500`),
    enabled: Boolean(selectedId)
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["service-orders"] });
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["service-order-detail", selectedId] });
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["service-order-trace", selectedId] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<OrderItem>("/service-orders", {
        title,
        description: maybe(description),
        priority: newPriority,
        assignedTechnicianId: maybe(newTechnicianId),
        customerId: maybe(newCustomerId),
        siteLocationId: maybe(newSiteId),
        equipmentId: maybe(newEquipmentId),
        serviceDate: maybe(newServiceDate)
      }),
    onSuccess: () => {
      setErrorMsg(null);
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      setNewPriority("MEDIUM");
      setNewTechnicianId("");
      setNewCustomerId("");
      setNewSiteId("");
      setNewEquipmentId("");
      setNewServiceDate("");
      queryClient.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const startMutation = useMutation({
    mutationFn: () => api.post<OrderItem>(`/service-orders/${selectedId}/start`, {}),
    onSuccess: () => {
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const completeMutation = useMutation({
    mutationFn: () => api.post<OrderItem>(`/service-orders/${selectedId}/complete`, {}),
    onSuccess: () => {
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.post<OrderItem>(`/service-orders/${selectedId}/cancel`, { reason: maybe(reason) }),
    onSuccess: () => {
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      api.post<OrderItem>(`/service-orders/${selectedId}/assign-checklist`, {
        templateVersionId,
        assignedTechnicianId: maybe(assignTechId)
      }),
    onSuccess: () => {
      setTemplateVersionId("");
      setAssignTechId("");
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) {
        throw new Error("Nenhuma ordem selecionada");
      }
      if (!order) {
        throw new Error("Detalhes da ordem ainda nao carregados");
      }
      const payload = await resolveLocationPayload(order, "check-in");
      return api.post<OrderItem>(`/service-orders/${selectedId}/check-in`, {
        ...payload
      });
    },
    onSuccess: () => {
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) {
        throw new Error("Nenhuma ordem selecionada");
      }
      if (!order) {
        throw new Error("Detalhes da ordem ainda nao carregados");
      }
      const payload = await resolveLocationPayload(order, "check-out");
      return api.post<OrderItem>(`/service-orders/${selectedId}/check-out`, {
        ...payload
      });
    },
    onSuccess: () => {
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const emitDocumentMutation = useMutation({
    mutationFn: () => api.post<{ url: string }>(`/service-orders/${selectedId}/emit-document`, {}),
    onSuccess: (payload) => {
      setErrorMsg(null);
      window.open(toApiAssetUrl(payload.url), "_blank", "noopener,noreferrer");
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const orders = ordersQuery.data ?? [];
  const options = optionsQuery.data;
  const order = detailQuery.data;
  const trailPoints = traceQuery.data ?? [];

  const prioritizedOrders = useMemo(() => {
    const statusRank: Record<OrderStatus, number> = {
      OPEN: 0,
      SCHEDULED: 1,
      DISPATCHED: 2,
      IN_PROGRESS: 3,
      ON_HOLD: 4,
      COMPLETED: 5,
      CANCELLED: 6
    };

    return [...orders].sort((left, right) => {
      const byStatus = statusRank[left.status] - statusRank[right.status];
      if (byStatus !== 0) {
        return byStatus;
      }

      const leftDate = new Date(left.serviceDate ?? left.updatedAt).getTime();
      const rightDate = new Date(right.serviceDate ?? right.updatedAt).getTime();
      return leftDate - rightDate;
    });
  }, [orders]);

  const counters = useMemo(() => {
    const map: Record<OrderStatus, number> = {
      OPEN: 0,
      SCHEDULED: 0,
      DISPATCHED: 0,
      IN_PROGRESS: 0,
      ON_HOLD: 0,
      COMPLETED: 0,
      CANCELLED: 0
    };
    for (const item of orders) map[item.status] += 1;
    return map;
  }, [orders]);

  const sites = useMemo(() => {
    if (!options?.sites) return [];
    if (!newCustomerId) return options.sites;
    return options.sites.filter((site) => site.customerId === newCustomerId);
  }, [options?.sites, newCustomerId]);

  const equipments = useMemo(() => {
    if (!options?.equipments) return [];
    if (!newSiteId) return options.equipments;
    return options.equipments.filter((equipment) => equipment.siteLocationId === newSiteId);
  }, [options?.equipments, newSiteId]);

  const canStart = order && !["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(order.status);
  const canComplete = order && ["IN_PROGRESS", "ON_HOLD"].includes(order.status);
  const canCancel = order && managerView && !["COMPLETED", "CANCELLED"].includes(order.status);
  const canAssign = order && managerView && !order.checklistExecution;
  const canCheckInGps = order && !["COMPLETED", "CANCELLED"].includes(order.status);
  const canCheckOutGps = order && !["COMPLETED", "CANCELLED"].includes(order.status);
  const actionBlockedMessage =
    order?.status === "COMPLETED"
      ? "Ordem concluida: acoes de execucao ficam bloqueadas."
      : order?.status === "CANCELLED"
        ? "Ordem cancelada: acoes de execucao ficam bloqueadas."
        : null;

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Ordens de Servico</h1>
            <p className="text-sm text-slate-600">Criacao, despacho, execucao e timeline de eventos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary/10"
              href="/service-orders/schedule"
            >
              Agenda semanal
            </Link>
            {managerView ? (
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>Nova Ordem</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-auto">
                  <DialogHeader>
                    <DialogTitle>Criar Ordem de Servico</DialogTitle>
                  </DialogHeader>
                  <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); setErrorMsg(null); createMutation.mutate(); }}>
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Titulo</label>
                      <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Descricao</label>
                      <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <select className="w-full rounded-xl border px-3 py-2" value={newPriority} onChange={(event) => setNewPriority(event.target.value as OrderPriority)}>
                        <option value="LOW">Baixa</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option>
                      </select>
                      <select className="w-full rounded-xl border px-3 py-2" value={newTechnicianId} onChange={(event) => setNewTechnicianId(event.target.value)}>
                        <option value="">Tecnico</option>
                        {(options?.technicians ?? []).map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                      </select>
                      <select className="w-full rounded-xl border px-3 py-2" value={newCustomerId} onChange={(event) => { setNewCustomerId(event.target.value); setNewSiteId(""); setNewEquipmentId(""); }}>
                        <option value="">Cliente</option>
                        {(options?.customers ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                      </select>
                      <select className="w-full rounded-xl border px-3 py-2" value={newSiteId} onChange={(event) => { setNewSiteId(event.target.value); setNewEquipmentId(""); }}>
                        <option value="">Unidade</option>
                        {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                      </select>
                      <select className="w-full rounded-xl border px-3 py-2" value={newEquipmentId} onChange={(event) => setNewEquipmentId(event.target.value)}>
                        <option value="">Equipamento</option>
                        {equipments.map((equipment) => <option key={equipment.id} value={equipment.id}>{(equipment.brand ?? "-") + " " + (equipment.model ?? "-")}</option>)}
                      </select>
                      <Input type="date" value={newServiceDate} onChange={(event) => setNewServiceDate(event.target.value)} />
                    </div>
                    {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                    <Button className="w-full" type="submit">{createMutation.isPending ? "Criando..." : "Criar"}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        </div>

        <section className="card mb-4 grid gap-3 p-4 md:grid-cols-5">
          <Input className={managerView ? "md:col-span-2" : "md:col-span-3"} placeholder="Buscar por codigo/titulo" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="w-full rounded-xl border px-3 py-2" value={status} onChange={(event) => setStatus(event.target.value as "ALL" | OrderStatus)}>
            <option value="ALL">Todos os status</option>
            {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
          <select className="w-full rounded-xl border px-3 py-2" value={priority} onChange={(event) => setPriority(event.target.value as "ALL" | OrderPriority)}>
            <option value="ALL">Todas prioridades</option>
            <option value="LOW">Baixa</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option>
          </select>
          <select className="w-full rounded-xl border px-3 py-2" value={customerFilterId} onChange={(event) => setCustomerFilterId(event.target.value)}>
            <option value="">Todos clientes</option>
            {(options?.customers ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          {managerView ? (
            <select className="w-full rounded-xl border px-3 py-2 md:col-span-5" value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>
              <option value="">Todos tecnicos</option>
              {(options?.technicians ?? []).map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
            </select>
          ) : null}
        </section>

        <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <div className="card p-3" key={key}>
              <p className="text-xs font-semibold uppercase text-slate-500">{meta.label}</p>
              <p className="mt-2 text-2xl font-black text-brand-primary">{counters[key as OrderStatus]}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          {prioritizedOrders.map((item) => (
            <button className="card w-full p-4 text-left transition hover:border-brand-primary" key={item.id} onClick={() => { setSelectedId(item.id); setErrorMsg(null); }} type="button">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-brand-primary">{item.code}</p>
                  <p className="text-sm text-slate-700">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.customer?.name ?? "Sem cliente"}</p>
                </div>
                <div className="flex gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${PRIORITY_META[item.priority].className}`}>{PRIORITY_META[item.priority].label}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_META[item.status].className}`}>{STATUS_META[item.status].label}</span>
                </div>
              </div>
              <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                <p><strong>Tecnico:</strong> {item.assignedTechnician?.name ?? "-"}</p>
                <p><strong>Data:</strong> {toDate(item.serviceDate)}</p>
                <p><strong>Unidade:</strong> {item.siteLocation?.name ?? "-"}</p>
                <p><strong>Atualizado:</strong> {toDateTime(item.updatedAt)}</p>
              </div>
            </button>
          ))}
          {!ordersQuery.isLoading && prioritizedOrders.length === 0 ? <div className="card p-4 text-sm text-slate-600">Nenhuma ordem encontrada.</div> : null}
        </section>

        <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
          <DialogContent className="max-h-[90vh] overflow-auto">
            <DialogHeader><DialogTitle>Detalhes da Ordem</DialogTitle></DialogHeader>
            {order ? (
              <div className="space-y-4">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3 text-sm"><strong>Codigo:</strong> {order.code}</div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm"><strong>Status:</strong> {STATUS_META[order.status].label}</div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm"><strong>Prioridade:</strong> {PRIORITY_META[order.priority].label}</div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm"><strong>Tecnico:</strong> {order.assignedTechnician?.name ?? "-"}</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p><strong>Titulo:</strong> {order.title}</p>
                  <p><strong>Descricao:</strong> {order.description?.trim() ? order.description : "-"}</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="mb-1 font-semibold text-brand-primary">Checklist vinculado</p>
                  {order.checklistExecution ? (
                    <div className="space-y-2">
                      <p>
                        {order.checklistExecution.code} - {order.checklistExecution.status} (etapa{" "}
                        {order.checklistExecution.step})
                      </p>
                      <Link
                        className="inline-flex rounded-lg border border-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary/10"
                        href={`/checklists/executar/${order.checklistExecution.id}?serviceOrderId=${order.id}`}
                      >
                        {managerView ? "Abrir checklist" : "Preencher checklist"}
                      </Link>
                    </div>
                  ) : (
                    <p>Nenhum checklist vinculado.</p>
                  )}
                </div>

                {actionBlockedMessage ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    {actionBlockedMessage}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button disabled={!canStart || startMutation.isPending} onClick={() => startMutation.mutate()}>{startMutation.isPending ? "Iniciando..." : "Iniciar"}</Button>
                  <Button variant="outline" disabled={!canComplete || completeMutation.isPending} onClick={() => completeMutation.mutate()}>{completeMutation.isPending ? "Concluindo..." : "Concluir"}</Button>
                  <Button variant="outline" disabled={!canCheckInGps || checkInMutation.isPending} onClick={() => checkInMutation.mutate()}>{checkInMutation.isPending ? "Check-in..." : "Check-in GPS"}</Button>
                  <Button variant="outline" disabled={!canCheckOutGps || checkOutMutation.isPending} onClick={() => checkOutMutation.mutate()}>{checkOutMutation.isPending ? "Check-out..." : "Check-out GPS"}</Button>
                  <Button
                    variant="outline"
                    disabled={emitDocumentMutation.isPending}
                    onClick={() => emitDocumentMutation.mutate()}
                  >
                    {emitDocumentMutation.isPending
                      ? "Gerando OS digital..."
                      : "Gerar ordem de servico digital"}
                  </Button>
                  <Button variant="danger" disabled={!canCancel || cancelMutation.isPending} onClick={() => { const reason = window.prompt("Motivo do cancelamento (opcional):", "") ?? ""; cancelMutation.mutate(reason); }}>{cancelMutation.isPending ? "Cancelando..." : "Cancelar"}</Button>
                  <Button variant="ghost" onClick={refresh}>Atualizar</Button>
                </div>

                {canAssign ? (
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="mb-2 text-sm font-semibold text-brand-primary">Vincular checklist</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <select className="w-full rounded-xl border px-3 py-2" value={templateVersionId} onChange={(event) => setTemplateVersionId(event.target.value)}>
                        <option value="">Template versao</option>
                        {(options?.templateVersions ?? []).map((version) => <option key={version.id} value={version.id}>{version.template.name} (v{version.version})</option>)}
                      </select>
                      <select className="w-full rounded-xl border px-3 py-2" value={assignTechId} onChange={(event) => setAssignTechId(event.target.value)}>
                        <option value="">Usar tecnico da OS</option>
                        {(options?.technicians ?? []).map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                      </select>
                    </div>
                    <Button className="mt-3 w-full" disabled={!templateVersionId || assignMutation.isPending} onClick={() => assignMutation.mutate()}>{assignMutation.isPending ? "Vinculando..." : "Vincular checklist"}</Button>
                  </div>
                ) : null}

                {errorMsg ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p> : null}

                <section className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-2 text-sm font-bold text-brand-primary">OS digital</h3>
                  {order.latestDocument ? (
                    <div className="space-y-1 text-sm">
                      <p>
                        Ultimo documento: <strong>{order.latestDocument.title}</strong>
                      </p>
                      <p className="text-xs text-slate-500">
                        Gerado em {toDateTime(order.latestDocument.createdAt)}
                      </p>
                      <button
                        className="inline-flex rounded-lg border border-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary/10"
                        onClick={() =>
                          window.open(
                            toApiAssetUrl(order.latestDocument!.url),
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                        type="button"
                      >
                        Abrir ultimo PDF
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">Nenhum documento gerado para esta OS.</p>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-2 text-sm font-bold text-brand-primary">Mapa da trilha da visita</h3>
                  {trailPoints.length ? (
                    <div className="space-y-2">
                      <ServiceOrderTrailMap
                        points={trailPoints}
                        siteGeofence={
                          order.siteLocation
                            ? {
                                name: order.siteLocation.name,
                                latitude: order.siteLocation.latitude,
                                longitude: order.siteLocation.longitude,
                                geofenceRadiusMeters: order.siteLocation.geofenceRadiusMeters
                              }
                            : null
                        }
                      />
                      <p className="text-xs text-slate-600">
                        Geofence unidade:{" "}
                        {order.siteLocation?.latitude != null && order.siteLocation?.longitude != null
                          ? `${(order.siteLocation.geofenceRadiusMeters ?? 200).toFixed(0)}m`
                          : "nao configurado"}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">Sem trilha de localizacao para exibir.</p>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-2 text-sm font-bold text-brand-primary">Geolocalizacao recente</h3>
                  {order.locations?.length ? (
                    <ul className="space-y-2">
                      {order.locations.map((point) => (
                        <li className="rounded-lg bg-slate-50 p-2 text-sm" key={point.id}>
                          <p className="font-semibold text-brand-primary">{point.type}</p>
                          <p className="text-xs text-slate-700">
                            {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)} | acuracia{" "}
                            {point.accuracy != null ? `${point.accuracy.toFixed(1)}m` : "-"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {point.source ?? "N/A"} - {toDateTime(point.capturedAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-600">Sem pontos de geolocalizacao registrados.</p>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-2 text-sm font-bold text-brand-primary">Timeline</h3>
                  {order.events.length === 0 ? (
                    <p className="text-sm text-slate-600">Sem eventos.</p>
                  ) : (
                    <ul className="space-y-2">
                      {order.events.map((event) => {
                        const detailLines = buildEventDetailLines(event);

                        return (
                          <li className="rounded-lg bg-slate-50 p-2 text-sm" key={event.id}>
                            <p className="font-semibold text-brand-primary">{toEventLabel(event.type)}</p>
                            <p className="text-xs text-slate-500">
                              {event.actor?.name ?? "Sistema"} - {toDateTime(event.createdAt)}
                            </p>
                            {event.note ? <p className="text-xs text-slate-700">Obs: {event.note}</p> : null}
                            {detailLines.length ? (
                              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                                {detailLines.map((line, index) => (
                                  <li className="rounded bg-slate-100 px-2 py-1" key={`${event.id}-detail-${index}`}>
                                    {line}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {event.payload ? (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs font-semibold text-slate-500">
                                  Detalhes tecnicos
                                </summary>
                                <pre className="mt-2 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-100">
                                  {JSON.stringify(event.payload, null, 2)}
                                </pre>
                              </details>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Carregando...</p>
            )}
          </DialogContent>
        </Dialog>
      </AppShell>
    </RequireAuth>
  );
}

export default function ServiceOrdersPage() {
  return (
    <Suspense
      fallback={
        <RequireAuth>
          <AppShell>
            <div className="card p-4 text-sm text-slate-600">Carregando ordens de servico...</div>
          </AppShell>
        </RequireAuth>
      }
    >
      <ServiceOrdersPageContent />
    </Suspense>
  );
}
