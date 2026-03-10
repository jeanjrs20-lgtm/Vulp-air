"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  FileDown,
  Filter,
  LifeBuoy,
  List,
  MessageSquareReply,
  RefreshCcw,
  TicketPlus
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";

type DeskTicketStatus =
  | "OPEN"
  | "TRIAGE"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";

type DeskTicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type DeskTicketChannel = "PORTAL" | "PHONE" | "EMAIL" | "WHATSAPP" | "INTERNAL";

type DeskOptionsPayload = {
  statuses: DeskTicketStatus[];
  priorities: DeskTicketPriority[];
  channels: DeskTicketChannel[];
  customers: Array<{ id: string; name: string }>;
  sites: Array<{ id: string; name: string; customerId: string }>;
  technicians: Array<{ id: string; name: string; email: string }>;
  serviceOrders: Array<{ id: string; code: string; title: string; status: string; customerId?: string | null }>;
  quotes: Array<{ id: string; code: string; status: string; customerId?: string | null }>;
};

type DeskSummaryPayload = {
  total: number;
  overdue: number;
  dueToday: number;
  unread: number;
  open: number;
  waiting: number;
  paused: number;
  unassigned: number;
  closingToday: number;
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

type DeskTicket = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  status: DeskTicketStatus;
  priority: DeskTicketPriority;
  channel: DeskTicketChannel;
  dueAt?: string | null;
  createdAt: string;
  customer: { id: string; name: string };
  siteLocation?: { id: string; name: string } | null;
  serviceOrder?: { id: string; code: string; title: string; status: string } | null;
  quote?: { id: string; code: string; status: string } | null;
  assignedTechnician?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
};

type DeskTicketEvent = {
  id: string;
  type: string;
  note?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
  actor?: { id: string; name: string; role?: string | null } | null;
};

type DeskThreadMessage = {
  id: string;
  senderType: "USER" | "CUSTOMER" | "SYSTEM";
  senderName?: string | null;
  message: string;
  createdAt: string;
  senderUser?: { id: string; name: string; role?: string | null } | null;
  senderCustomer?: { id: string; name: string } | null;
};

type DeskThread = {
  id: string;
  code: string;
  subject: string;
  channel: "INTERNAL" | "WHATSAPP" | "PORTAL" | "EMAIL" | "PHONE";
  status: "OPEN" | "CLOSED" | "ARCHIVED";
  createdAt: string;
  messages: DeskThreadMessage[];
};

type DeskTicketDetail = DeskTicket & {
  events: DeskTicketEvent[];
  chatThreads: DeskThread[];
};

const STATUS_META: Record<DeskTicketStatus, { label: string; className: string }> = {
  OPEN: { label: "Aberto", className: "bg-slate-100 text-slate-700" },
  TRIAGE: { label: "Triagem", className: "bg-cyan-100 text-cyan-700" },
  IN_PROGRESS: { label: "Em atendimento", className: "bg-brand-highlight/70 text-brand-primary" },
  ON_HOLD: { label: "Pausado", className: "bg-amber-100 text-amber-700" },
  RESOLVED: { label: "Resolvido", className: "bg-emerald-100 text-emerald-700" },
  CLOSED: { label: "Fechado", className: "bg-slate-200 text-slate-700" },
  CANCELLED: { label: "Cancelado", className: "bg-rose-100 text-rose-700" }
};

const PRIORITY_META: Record<DeskTicketPriority, { label: string; className: string }> = {
  LOW: { label: "Baixa", className: "bg-slate-100 text-slate-600" },
  MEDIUM: { label: "Media", className: "bg-sky-100 text-sky-700" },
  HIGH: { label: "Alta", className: "bg-orange-100 text-orange-700" },
  URGENT: { label: "Urgente", className: "bg-rose-100 text-rose-700" }
};

const CHANNEL_LABEL: Record<DeskTicketChannel, string> = {
  PORTAL: "Portal",
  PHONE: "Telefone",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  INTERNAL: "Interno"
};

const toDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "-";

const EVENT_LABEL: Record<string, string> = {
  DESK_TICKET_CREATED: "Ticket criado",
  DESK_TICKET_UPDATED: "Ticket atualizado",
  DESK_TICKET_STATUS_UPDATED: "Status alterado",
  DESK_TICKET_NOTE: "Resposta registrada",
  DESK_TICKET_CONVERTED_TO_SERVICE_ORDER: "Convertido em OS",
  DESK_TICKET_LINKED: "Vinculado a OS",
  CHAT_THREAD_CREATED_FROM_PORTAL: "Conversa iniciada pelo portal",
  CHAT_MESSAGE_POSTED_FROM_PORTAL: "Mensagem do cliente no portal",
  CHAT_MESSAGE_POSTED: "Mensagem da equipe"
};

const toLongDate = (value: Date) =>
  value.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

const toCsvCell = (value: string | number | null | undefined) => {
  const normalized = `${value ?? ""}`.replace(/"/g, "\"\"");
  return `"${normalized}"`;
};

const toSlaLabel = (ticket: DeskTicket) => {
  if (!ticket.dueAt) {
    return "Sem SLA";
  }

  const dueAt = new Date(ticket.dueAt).getTime();
  const now = Date.now();
  const diffMs = dueAt - now;
  const hours = Math.max(1, Math.round(Math.abs(diffMs) / 3_600_000));

  if (["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.status)) {
    return "Encerrado";
  }

  if (diffMs < 0) {
    return `Expirou ha ${hours}h`;
  }

  return `Expira em ${hours}h`;
};

const isOverdue = (ticket: DeskTicket) =>
  Boolean(
    ticket.dueAt &&
      new Date(ticket.dueAt).getTime() < Date.now() &&
      !["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.status)
  );

type ConversationItem =
  | {
      id: string;
      at: string;
      source: "TICKET";
      by: string;
      title: string;
      body: string;
    }
  | {
      id: string;
      at: string;
      source: "EVENT";
      by: string;
      title: string;
      body?: string | null;
    }
  | {
      id: string;
      at: string;
      source: "MESSAGE";
      by: string;
      title: string;
      body: string;
      mine: boolean;
    };

export default function DeskPage() {
  const queryClient = useQueryClient();
  const currentUserId = authStorage.getUser()?.id ?? "";

  const [statusFilter, setStatusFilter] = useState<DeskTicketStatus | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<DeskTicketPriority | "ALL">("ALL");
  const [channelFilter, setChannelFilter] = useState<DeskTicketChannel | "ALL">("PORTAL");
  const [search, setSearch] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const [openCreate, setOpenCreate] = useState(false);
  const [openNoteFor, setOpenNoteFor] = useState<DeskTicket | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<DeskTicketPriority>("MEDIUM");
  const [channel, setChannel] = useState<DeskTicketChannel>("PORTAL");
  const [customerId, setCustomerId] = useState("");
  const [siteLocationId, setSiteLocationId] = useState("");
  const [serviceOrderId, setServiceOrderId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [assignedTechnicianId, setAssignedTechnicianId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["desk-options"],
    queryFn: () => api.get<DeskOptionsPayload>("/desk/options")
  });

  const summaryQuery = useQuery({
    queryKey: ["desk-summary"],
    queryFn: () => api.get<DeskSummaryPayload>("/desk/summary")
  });

  const ticketsQuery = useQuery({
    queryKey: [
      "desk-list",
      statusFilter,
      priorityFilter,
      channelFilter,
      search,
      onlyOverdue,
      onlyUnassigned
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (priorityFilter !== "ALL") params.set("priority", priorityFilter);
      if (channelFilter !== "ALL") params.set("channel", channelFilter);
      if (search.trim()) params.set("search", search.trim());
      if (onlyOverdue) params.set("onlyOverdue", "true");
      if (onlyUnassigned) params.set("onlyUnassigned", "true");
      return api.get<DeskTicket[]>(`/desk${params.toString() ? `?${params.toString()}` : ""}`);
    }
  });

  const ticketDetailQuery = useQuery({
    queryKey: ["desk-ticket-detail", openNoteFor?.id],
    queryFn: () => api.get<DeskTicketDetail>(`/desk/${openNoteFor?.id}`),
    enabled: Boolean(openNoteFor?.id)
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["desk-list"] });
    queryClient.invalidateQueries({ queryKey: ["desk-summary"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<DeskTicket>("/desk", {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        channel,
        customerId: customerId || undefined,
        siteLocationId: siteLocationId || undefined,
        serviceOrderId: serviceOrderId || undefined,
        quoteId: quoteId || undefined,
        assignedTechnicianId: assignedTechnicianId || undefined,
        dueAt: dueAt ? new Date(`${dueAt}:00`).toISOString() : undefined
      }),
    onSuccess: () => {
      setOpenCreate(false);
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setChannel("PORTAL");
      setCustomerId("");
      setSiteLocationId("");
      setServiceOrderId("");
      setQuoteId("");
      setAssignedTechnicianId("");
      setDueAt("");
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DeskTicketStatus }) =>
      api.post<DeskTicket>(`/desk/${id}/status`, { status }),
    onSuccess: refresh,
    onError: (error) => setErrorMsg(error.message)
  });

  const noteMutation = useMutation({
    mutationFn: ({ id, noteValue }: { id: string; noteValue: string }) =>
      api.post<DeskTicket>(`/desk/${id}/note`, { note: noteValue }),
    onSuccess: () => {
      setErrorMsg(null);
      refresh();
      queryClient.invalidateQueries({ queryKey: ["desk-ticket-detail", openNoteFor?.id] });
      setNote("");
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => api.post<DeskTicket>(`/desk/${id}/convert-to-service-order`, {}),
    onSuccess: refresh,
    onError: (error) => setErrorMsg(error.message)
  });

  const options = optionsQuery.data;
  const tickets = ticketsQuery.data ?? [];
  const ticketDetail = ticketDetailQuery.data;
  const summary = summaryQuery.data;
  const todayLabel = useMemo(() => toLongDate(new Date()), []);
  const appliedFiltersCount =
    Number(statusFilter !== "ALL") +
    Number(priorityFilter !== "ALL") +
    Number(channelFilter !== "ALL") +
    Number(Boolean(search.trim())) +
    Number(onlyOverdue) +
    Number(onlyUnassigned);

  const filteredSites = useMemo(() => {
    if (!customerId) return options?.sites ?? [];
    return (options?.sites ?? []).filter((site) => site.customerId === customerId);
  }, [customerId, options?.sites]);

  const conversationItems = useMemo<ConversationItem[]>(() => {
    if (!ticketDetail) {
      return [];
    }

    const items: ConversationItem[] = [];

    if (ticketDetail.description?.trim()) {
      items.push({
        id: `${ticketDetail.id}-created`,
        at: ticketDetail.createdAt,
        source: "TICKET",
        by: ticketDetail.createdBy?.name ?? "Cliente",
        title: "Abertura do ticket",
        body: ticketDetail.description
      });
    }

    for (const event of ticketDetail.events ?? []) {
      items.push({
        id: event.id,
        at: event.createdAt,
        source: "EVENT",
        by: event.actor?.name ?? "Sistema",
        title: EVENT_LABEL[event.type] ?? event.type,
        body: event.note ?? null
      });
    }

    for (const thread of ticketDetail.chatThreads ?? []) {
      for (const message of thread.messages ?? []) {
        const by =
          message.senderUser?.name ??
          message.senderCustomer?.name ??
          message.senderName ??
          (message.senderType === "CUSTOMER" ? "Cliente" : "Equipe");

        const mine = Boolean(currentUserId && message.senderUser?.id === currentUserId);
        items.push({
          id: `${thread.id}-${message.id}`,
          at: message.createdAt,
          source: "MESSAGE",
          by,
          title: `Conversa ${thread.code} (${CHANNEL_LABEL[thread.channel as DeskTicketChannel] ?? thread.channel})`,
          body: message.message,
          mine
        });
      }
    }

    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [currentUserId, ticketDetail]);

  const exportCsv = () => {
    if (!tickets.length) {
      return;
    }

    const headers = [
      "Codigo",
      "Titulo",
      "Cliente",
      "CriadoEm",
      "AtribuidoA",
      "Status",
      "Prioridade",
      "Canal",
      "SLA",
      "OS"
    ];

    const rows = tickets.map((ticket) => [
      ticket.code,
      ticket.title,
      ticket.customer.name,
      toDateTime(ticket.createdAt),
      ticket.assignedTechnician?.name ?? "Nao atribuido",
      STATUS_META[ticket.status].label,
      PRIORITY_META[ticket.priority].label,
      CHANNEL_LABEL[ticket.channel],
      toSlaLabel(ticket),
      ticket.serviceOrder?.code ?? "-"
    ]);

    const csv = [
      headers.map((header) => toCsvCell(header)).join(";"),
      ...rows.map((row) => row.map((cell) => toCsvCell(cell)).join(";"))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <RequireAuth>
      <AppShell>
        <section className="mb-5 overflow-hidden rounded-3xl border border-brand-primary/15 bg-white shadow-[0_10px_25px_rgba(7,56,77,0.12)]">
          <div className="bg-gradient-to-r from-brand-primary via-[#0a516f] to-[#127194] px-4 py-4 text-white">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-black uppercase tracking-wide">
              <LifeBuoy className="h-3.5 w-3.5" />
              VULP Desk Tickets
            </p>
            <h1 className="mt-2 text-2xl font-black">Central de tickets dos clientes</h1>
            <p className="text-sm text-white/90">
              Tickets abertos pelos clientes, resposta rapida e controle de SLA.
            </p>
          </div>
          <div className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold capitalize text-brand-primary">{todayLabel}</p>
            </div>
            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  <TicketPlus className="mr-1 h-4 w-4" />
                  Novo ticket
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Abrir ticket</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setErrorMsg(null);
                    createMutation.mutate();
                  }}
                >
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Titulo</label>
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Descricao</label>
                    <textarea
                      className="w-full rounded-xl border px-3 py-2"
                      rows={4}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Prioridade</label>
                      <select
                        className="w-full rounded-xl border px-3 py-2"
                        value={priority}
                        onChange={(event) => setPriority(event.target.value as DeskTicketPriority)}
                      >
                        {options?.priorities.map((item) => (
                          <option key={item} value={item}>
                            {PRIORITY_META[item].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Canal</label>
                      <select
                        className="w-full rounded-xl border px-3 py-2"
                        value={channel}
                        onChange={(event) => setChannel(event.target.value as DeskTicketChannel)}
                      >
                        {options?.channels.map((item) => (
                          <option key={item} value={item}>
                            {CHANNEL_LABEL[item]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Cliente</label>
                      <select
                        className="w-full rounded-xl border px-3 py-2"
                        value={customerId}
                        onChange={(event) => setCustomerId(event.target.value)}
                      >
                        <option value="">Selecione</option>
                        {(options?.customers ?? []).map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Unidade</label>
                      <select
                        className="w-full rounded-xl border px-3 py-2"
                        value={siteLocationId}
                        onChange={(event) => setSiteLocationId(event.target.value)}
                      >
                        <option value="">Sem unidade</option>
                        {filteredSites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold">OS vinculada</label>
                      <select
                        className="w-full rounded-xl border px-3 py-2"
                        value={serviceOrderId}
                        onChange={(event) => setServiceOrderId(event.target.value)}
                      >
                        <option value="">Nenhuma</option>
                        {(options?.serviceOrders ?? []).map((order) => (
                          <option key={order.id} value={order.id}>
                            {order.code} - {order.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Orcamento vinculado</label>
                      <select
                        className="w-full rounded-xl border px-3 py-2"
                        value={quoteId}
                        onChange={(event) => setQuoteId(event.target.value)}
                      >
                        <option value="">Nenhum</option>
                        {(options?.quotes ?? []).map((quote) => (
                          <option key={quote.id} value={quote.id}>
                            {quote.code} - {quote.status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Tecnico responsavel</label>
                      <select
                        className="w-full rounded-xl border px-3 py-2"
                        value={assignedTechnicianId}
                        onChange={(event) => setAssignedTechnicianId(event.target.value)}
                      >
                        <option value="">Nao atribuido</option>
                        {(options?.technicians ?? []).map((technician) => (
                          <option key={technician.id} value={technician.id}>
                            {technician.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Prazo (SLA)</label>
                      <Input
                        type="datetime-local"
                        value={dueAt}
                        onChange={(event) => setDueAt(event.target.value)}
                      />
                    </div>
                  </div>

                  {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                  <Button className="w-full" type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "Criar ticket"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-10 items-center justify-center rounded-xl border border-brand-primary/30 bg-brand-primary px-3 text-white"
                type="button"
              >
                <List className="h-4 w-4" />
              </button>
              <span className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
                <Filter className="mr-1 h-4 w-4" />
                Filtros: {appliedFiltersCount} aplicados
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={exportCsv} type="button" variant="outline">
                <FileDown className="mr-1 h-4 w-4" />
                Exportar CSV
              </Button>
              <Button onClick={refresh} type="button" variant="outline">
                <RefreshCcw className="mr-1 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </div>
          </div>
        </section>

        <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <article className="card p-3 text-center">
            <p className="text-sm font-semibold text-slate-600">Nao lidos</p>
            <p className="mt-1 text-4xl font-black text-brand-primary">{summary?.unread ?? 0}</p>
          </article>
          <article className="card p-3 text-center">
            <p className="text-sm font-semibold text-slate-600">Abertos</p>
            <p className="mt-1 text-4xl font-black text-brand-primary">{summary?.open ?? 0}</p>
          </article>
          <article className="card p-3 text-center">
            <p className="text-sm font-semibold text-slate-600">Em espera</p>
            <p className="mt-1 text-4xl font-black text-brand-primary">{summary?.waiting ?? 0}</p>
          </article>
          <article className="card border-rose-200 bg-rose-50 p-3 text-center">
            <p className="text-sm font-semibold text-rose-700">Em atraso</p>
            <p className="mt-1 text-4xl font-black text-rose-700">{summary?.overdue ?? 0}</p>
          </article>
          <article className="card border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-sm font-semibold text-amber-700">Pausados</p>
            <p className="mt-1 text-4xl font-black text-amber-700">{summary?.paused ?? 0}</p>
          </article>
          <article className="card p-3 text-center">
            <p className="text-sm font-semibold text-slate-600">Nao atribuidos</p>
            <p className="mt-1 text-4xl font-black text-brand-primary">{summary?.unassigned ?? 0}</p>
          </article>
          <article className="card border-emerald-200 bg-emerald-50 p-3 text-center">
            <p className="text-sm font-semibold text-emerald-700">Encerram hoje</p>
            <p className="mt-1 text-4xl font-black text-emerald-700">{summary?.closingToday ?? 0}</p>
          </article>
        </section>

        <section className="mb-4 card p-4">
          <div className="grid gap-3 md:grid-cols-6">
            <Input placeholder="Buscar por codigo/titulo/cliente" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select
              className="rounded-xl border px-3 py-2"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as DeskTicketStatus | "ALL")}
            >
              <option value="ALL">Todos status</option>
              {(options?.statuses ?? []).map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border px-3 py-2"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as DeskTicketPriority | "ALL")}
            >
              <option value="ALL">Todas prioridades</option>
              {(options?.priorities ?? []).map((item) => (
                <option key={item} value={item}>
                  {PRIORITY_META[item].label}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border px-3 py-2"
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value as DeskTicketChannel | "ALL")}
            >
              <option value="ALL">Todos canais</option>
              {(options?.channels ?? []).map((item) => (
                <option key={item} value={item}>
                  {CHANNEL_LABEL[item]}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-slate-700">
              <input checked={onlyOverdue} onChange={(event) => setOnlyOverdue(event.target.checked)} type="checkbox" />
              Somente atrasados
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-slate-700">
              <input
                checked={onlyUnassigned}
                onChange={(event) => setOnlyUnassigned(event.target.checked)}
                type="checkbox"
              />
              Somente nao atribuidos
            </label>
          </div>
        </section>

        {errorMsg ? <p className="mb-3 text-sm text-red-600">{errorMsg}</p> : null}

        <section className="mb-4 card overflow-auto">
          <table className="min-w-[1280px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-3 py-3">
                  <input type="checkbox" />
                </th>
                <th className="px-3 py-3">Codigo</th>
                <th className="px-3 py-3">Titulo</th>
                <th className="px-3 py-3">Cliente</th>
                <th className="px-3 py-3">Criado em</th>
                <th className="px-3 py-3">Atribuido a</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Prioridade</th>
                <th className="px-3 py-3">Tarefas</th>
                <th className="px-3 py-3">Prazo SLA</th>
                <th className="px-3 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr className={`border-b ${isOverdue(ticket) ? "border-l-4 border-l-rose-500" : ""}`} key={ticket.id}>
                  <td className="px-3 py-3">
                    <input type="checkbox" />
                  </td>
                  <td className="px-3 py-3 font-bold text-brand-primary">{ticket.code}</td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-800">{ticket.title}</p>
                    <p className="text-xs text-slate-500">
                      {CHANNEL_LABEL[ticket.channel]} | {ticket.siteLocation?.name ?? "Sem unidade"}
                    </p>
                  </td>
                  <td className="px-3 py-3">{ticket.customer.name}</td>
                  <td className="px-3 py-3">{toDateTime(ticket.createdAt)}</td>
                  <td className="px-3 py-3">{ticket.assignedTechnician?.name ?? "Nao atribuido"}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_META[ticket.status].className}`}>
                      {STATUS_META[ticket.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY_META[ticket.priority].className}`}>
                      {PRIORITY_META[ticket.priority].label}
                    </span>
                  </td>
                  <td className="px-3 py-3">{ticket.serviceOrder ? ticket.serviceOrder.code : "-"}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      {isOverdue(ticket) ? <AlertTriangle className="h-4 w-4 text-rose-600" /> : null}
                      <span className={isOverdue(ticket) ? "font-semibold text-rose-700" : "text-slate-700"}>
                        {toSlaLabel(ticket)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="rounded-lg border px-2 py-1 text-xs"
                        value={ticket.status}
                        onChange={(event) =>
                          statusMutation.mutate({
                            id: ticket.id,
                            status: event.target.value as DeskTicketStatus
                          })
                        }
                      >
                        {(options?.statuses ?? []).map((status) => (
                          <option key={`${ticket.id}-table-${status}`} value={status}>
                            {STATUS_META[status].label}
                          </option>
                        ))}
                      </select>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setOpenNoteFor(ticket);
                          setNote("");
                          setErrorMsg(null);
                        }}
                      >
                        <MessageSquareReply className="mr-1 h-3.5 w-3.5" />
                        Responder
                      </Button>

                      {!ticket.serviceOrder ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => convertMutation.mutate(ticket.id)}
                          disabled={convertMutation.isPending}
                        >
                          Converter em OS
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ticketsQuery.isLoading && tickets.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">
              Nenhum ticket encontrado para os filtros selecionados.
            </div>
          ) : null}
        </section>

        <Dialog
          open={Boolean(openNoteFor)}
          onOpenChange={(value) => {
            if (!value) {
              setOpenNoteFor(null);
              setNote("");
            }
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Responder ticket</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!openNoteFor) return;
                noteMutation.mutate({ id: openNoteFor.id, noteValue: note.trim() });
              }}
            >
              <p className="text-sm text-slate-600">
                {openNoteFor?.code} - {openNoteFor?.title}
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-brand-primary">Historico da conversa</p>
                  {ticketDetailQuery.isLoading ? (
                    <span className="text-xs text-slate-500">Carregando...</span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {conversationItems.length} registro(s)
                    </span>
                  )}
                </div>

                <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                  {ticketDetailQuery.isLoading ? (
                    <p className="text-xs text-slate-500">Buscando historico...</p>
                  ) : null}

                  {ticketDetailQuery.isError ? (
                    <p className="text-xs text-rose-600">Falha ao carregar historico do ticket.</p>
                  ) : null}

                  {!ticketDetailQuery.isLoading &&
                  !ticketDetailQuery.isError &&
                  conversationItems.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Ainda nao ha mensagens anteriores para este ticket.
                    </p>
                  ) : null}

                  {conversationItems.map((item) => (
                    <article
                      className={`rounded-xl border p-2 ${
                        item.source === "MESSAGE"
                          ? item.mine
                            ? "border-brand-primary/30 bg-brand-primary/5"
                            : "border-cyan-200 bg-cyan-50"
                          : item.source === "EVENT"
                            ? "border-slate-200 bg-slate-50"
                            : "border-amber-200 bg-amber-50"
                      }`}
                      key={item.id}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-brand-primary">{item.title}</p>
                        <span className="text-[11px] text-slate-500">{toDateTime(item.at)}</span>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-600">{item.by}</p>
                      {"body" in item && item.body ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{item.body}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
              <textarea
                className="w-full rounded-xl border px-3 py-2"
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Digite a resposta para o cliente"
              />
              <Button
                className="w-full"
                type="submit"
                disabled={noteMutation.isPending || !note.trim()}
              >
                {noteMutation.isPending ? (
                  <>
                    <RefreshCcw className="mr-1 h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  "Salvar resposta"
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </AppShell>
    </RequireAuth>
  );
}

