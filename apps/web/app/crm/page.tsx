"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Plus, RefreshCcw, Search, Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type LeadStatus = "NEW" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "ON_HOLD" | "WON" | "LOST";
type LeadPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type ActivityType = "CALL" | "EMAIL" | "MEETING" | "WHATSAPP" | "NOTE" | "TASK";

type CrmOptions = {
  statuses: LeadStatus[];
  priorities: LeadPriority[];
  activityTypes: ActivityType[];
  owners: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string }>;
};

type CrmSummary = {
  total: number;
  open: number;
  won: number;
  lost: number;
  overdue: number;
  estimatedValue: number;
};

type Lead = {
  id: string;
  code: string;
  name: string;
  company?: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  estimatedValue?: number | null;
  expectedCloseAt?: string | null;
  owner?: { id: string; name: string } | null;
  _count: { activities: number };
};

type LeadDetail = Lead & {
  notes?: string | null;
  activities: Array<{
    id: string;
    type: ActivityType;
    subject?: string | null;
    note?: string | null;
    createdAt: string;
    actor?: { id: string; name: string } | null;
  }>;
};

type Filters = {
  search: string;
  status: "ALL" | LeadStatus;
  ownerId: string;
  priority: "ALL" | LeadPriority;
  includeClosed: boolean;
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Novo",
  QUALIFIED: "Qualificado",
  PROPOSAL: "Proposta",
  NEGOTIATION: "Negociacao",
  ON_HOLD: "Em espera",
  WON: "Ganho",
  LOST: "Perdido"
};

const initialFilters: Filters = {
  search: "",
  status: "ALL",
  ownerId: "",
  priority: "ALL",
  includeClosed: false
};

const toDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "-");
const toDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "-");
const toMoney = (value?: number | null) =>
  (value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CrmPage() {
  const queryClient = useQueryClient();
  const [draftFilters, setDraftFilters] = useState<Filters>(initialFilters);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [openCreateLead, setOpenCreateLead] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadCompany, setLeadCompany] = useState("");
  const [leadStatus, setLeadStatus] = useState<LeadStatus>("NEW");
  const [leadPriority, setLeadPriority] = useState<LeadPriority>("MEDIUM");
  const [leadOwnerId, setLeadOwnerId] = useState("");
  const [activityNote, setActivityNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["crm-summary"],
    queryFn: () => api.get<CrmSummary>("/crm/summary")
  });

  const optionsQuery = useQuery({
    queryKey: ["crm-options"],
    queryFn: () => api.get<CrmOptions>("/crm/options")
  });

  const leadsQuery = useQuery({
    queryKey: ["crm-leads", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.status !== "ALL") params.set("status", filters.status);
      if (filters.ownerId) params.set("ownerId", filters.ownerId);
      if (filters.priority !== "ALL") params.set("priority", filters.priority);
      if (filters.includeClosed) params.set("includeClosed", "true");
      return api.get<Lead[]>(`/crm${params.toString() ? `?${params.toString()}` : ""}`);
    }
  });

  const leadDetailQuery = useQuery({
    queryKey: ["crm-detail", selectedLeadId],
    queryFn: () => api.get<LeadDetail>(`/crm/${selectedLeadId}`),
    enabled: Boolean(selectedLeadId)
  });

  const createLeadMutation = useMutation({
    mutationFn: () =>
      api.post("/crm", {
        name: leadName.trim(),
        company: leadCompany.trim() || undefined,
        status: leadStatus,
        priority: leadPriority,
        ownerId: leadOwnerId || undefined
      }),
    onSuccess: () => {
      setOpenCreateLead(false);
      setLeadName("");
      setLeadCompany("");
      setLeadStatus("NEW");
      setLeadPriority("MEDIUM");
      setLeadOwnerId("");
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm-summary"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const updateLeadStatusMutation = useMutation({
    mutationFn: (params: { leadId: string; status: LeadStatus }) =>
      api.patch(`/crm/${params.leadId}`, { status: params.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm-detail", selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ["crm-summary"] });
    }
  });

  const addActivityMutation = useMutation({
    mutationFn: () =>
      api.post(`/crm/${selectedLeadId}/activities`, {
        type: "NOTE",
        note: activityNote.trim()
      }),
    onSuccess: () => {
      setActivityNote("");
      queryClient.invalidateQueries({ queryKey: ["crm-detail", selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm-summary"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const leads = leadsQuery.data ?? [];
  const options = optionsQuery.data;
  const selectedLead = leadDetailQuery.data ?? null;

  useEffect(() => {
    if (!leads.length) {
      setSelectedLeadId("");
      return;
    }
    if (!selectedLeadId || !leads.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(leads[0].id);
    }
  }, [leads, selectedLeadId]);

  const groupedLeads = useMemo(() => {
    const groups: Record<LeadStatus, Lead[]> = {
      NEW: [],
      QUALIFIED: [],
      PROPOSAL: [],
      NEGOTIATION: [],
      ON_HOLD: [],
      WON: [],
      LOST: []
    };
    for (const lead of leads) groups[lead.status].push(lead);
    return groups;
  }, [leads]);

  const statusOrder: LeadStatus[] = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "ON_HOLD", "WON", "LOST"];

  return (
    <RequireAuth>
      <AppShell>
        <section className="mb-5 rounded-3xl border border-brand-primary/20 bg-white p-4 shadow-[0_12px_30px_rgba(7,56,77,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-highlight/70 px-3 py-1 text-xs font-black uppercase tracking-wide text-brand-primary"><Target className="h-3.5 w-3.5" />CRM</p>
              <h1 className="mt-2 text-2xl font-black text-brand-primary">Pipeline comercial</h1>
              <p className="text-sm text-slate-600">Lista agrupada por etapa, com responsavel, vencimento e prioridade.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => { summaryQuery.refetch(); leadsQuery.refetch(); leadDetailQuery.refetch(); }} type="button" variant="outline"><RefreshCcw className="mr-1 h-4 w-4" />Atualizar</Button>
              <Dialog open={openCreateLead} onOpenChange={setOpenCreateLead}>
                <DialogTrigger asChild><Button type="button"><Plus className="mr-1 h-4 w-4" />Novo lead</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader>
                  <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); createLeadMutation.mutate(); }}>
                    <Input placeholder="Nome*" required value={leadName} onChange={(event) => setLeadName(event.target.value)} />
                    <Input placeholder="Empresa" value={leadCompany} onChange={(event) => setLeadCompany(event.target.value)} />
                    <div className="grid gap-3 md:grid-cols-3">
                      <select className="w-full rounded-xl border px-3 py-2" value={leadStatus} onChange={(event) => setLeadStatus(event.target.value as LeadStatus)}>{(options?.statuses ?? []).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select>
                      <select className="w-full rounded-xl border px-3 py-2" value={leadPriority} onChange={(event) => setLeadPriority(event.target.value as LeadPriority)}>{(options?.priorities ?? []).map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
                      <select className="w-full rounded-xl border px-3 py-2" value={leadOwnerId} onChange={(event) => setLeadOwnerId(event.target.value)}><option value="">Responsavel</option>{(options?.owners ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>
                    </div>
                    {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                    <Button className="w-full" disabled={createLeadMutation.isPending} type="submit">{createLeadMutation.isPending ? "Salvando..." : "Salvar lead"}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </section>

        <section className="mb-4 grid gap-3 md:grid-cols-6">
          <article className="card p-3"><p className="text-xs font-semibold uppercase text-slate-500">Leads</p><p className="mt-2 text-2xl font-black text-brand-primary">{summaryQuery.data?.total ?? 0}</p></article>
          <article className="card p-3"><p className="text-xs font-semibold uppercase text-slate-500">Abertos</p><p className="mt-2 text-2xl font-black text-brand-primary">{summaryQuery.data?.open ?? 0}</p></article>
          <article className="card p-3"><p className="text-xs font-semibold uppercase text-slate-500">Ganhos</p><p className="mt-2 text-2xl font-black text-emerald-700">{summaryQuery.data?.won ?? 0}</p></article>
          <article className="card p-3"><p className="text-xs font-semibold uppercase text-slate-500">Perdidos</p><p className="mt-2 text-2xl font-black text-rose-700">{summaryQuery.data?.lost ?? 0}</p></article>
          <article className="card p-3"><p className="text-xs font-semibold uppercase text-slate-500">Atrasados</p><p className="mt-2 text-2xl font-black text-amber-700">{summaryQuery.data?.overdue ?? 0}</p></article>
          <article className="card p-3"><p className="text-xs font-semibold uppercase text-slate-500">Valor</p><p className="mt-2 text-2xl font-black text-brand-primary">{toMoney(summaryQuery.data?.estimatedValue)}</p></article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="card p-4">
            {statusOrder.map((status) => (
              <div className="mb-4 last:mb-0" key={status}>
                <p className="mb-1 text-sm font-bold text-brand-primary">{STATUS_LABEL[status]} ({groupedLeads[status].length})</p>
                <div className="overflow-auto">
                  <table className="min-w-[980px] text-sm">
                    <thead><tr className="border-b bg-slate-50 text-left"><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Responsavel</th><th className="px-3 py-2">Vencimento</th><th className="px-3 py-2">Prioridade</th><th className="px-3 py-2">Etapa</th></tr></thead>
                    <tbody>
                      {groupedLeads[status].map((lead) => (
                        <tr className={`cursor-pointer border-b hover:bg-slate-50 ${lead.id === selectedLeadId ? "bg-brand-primary/5" : ""}`} key={lead.id} onClick={() => setSelectedLeadId(lead.id)}>
                          <td className="px-3 py-2"><p className="font-semibold text-brand-primary">{lead.name}</p><p className="text-xs text-slate-500">{lead.company ?? lead.code}</p></td>
                          <td className="px-3 py-2">{lead.owner?.name ?? "-"}</td>
                          <td className="px-3 py-2">{toDate(lead.expectedCloseAt)}</td>
                          <td className="px-3 py-2">{lead.priority}</td>
                          <td className="px-3 py-2"><select className="rounded-lg border px-2 py-1 text-xs" value={lead.status} onChange={(event) => updateLeadStatusMutation.mutate({ leadId: lead.id, status: event.target.value as LeadStatus })}>{(options?.statuses ?? []).map((item) => <option key={item} value={item}>{STATUS_LABEL[item]}</option>)}</select></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <aside className="space-y-4">
            <div className="card p-4">
              <div className="mb-2 flex items-center justify-between"><h2 className="text-xl font-black text-brand-primary">Filtros</h2><Filter className="h-4 w-4 text-brand-primary" /></div>
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-600"><Search className="mr-1 inline h-4 w-4" />Buscar<Input className="mt-1" value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} /></label>
                <label className="block text-sm font-semibold text-slate-600">Status<select className="mt-1 w-full rounded-xl border px-3 py-2" value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as "ALL" | LeadStatus }))}><option value="ALL">Todos</option>{(options?.statuses ?? []).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select></label>
                <label className="block text-sm font-semibold text-slate-600">Prioridade<select className="mt-1 w-full rounded-xl border px-3 py-2" value={draftFilters.priority} onChange={(event) => setDraftFilters((current) => ({ ...current, priority: event.target.value as "ALL" | LeadPriority }))}><option value="ALL">Todas</option>{(options?.priorities ?? []).map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
                <label className="block text-sm font-semibold text-slate-600">Responsavel<select className="mt-1 w-full rounded-xl border px-3 py-2" value={draftFilters.ownerId} onChange={(event) => setDraftFilters((current) => ({ ...current, ownerId: event.target.value }))}><option value="">Todos</option>{(options?.owners ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><input checked={draftFilters.includeClosed} onChange={(event) => setDraftFilters((current) => ({ ...current, includeClosed: event.target.checked }))} type="checkbox" />Incluir ganhos/perdidos</label>
                <Button className="w-full" onClick={() => setFilters(draftFilters)} type="button">Aplicar</Button>
              </div>
            </div>

            {selectedLead ? (
              <div className="card p-4">
                <h3 className="text-lg font-black text-brand-primary">{selectedLead.name}</h3>
                <p className="text-sm text-slate-600">{selectedLead.notes ?? "Sem notas"}</p>
                <div className="mt-2 space-y-2">
                  {selectedLead.activities.map((activity) => (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs" key={activity.id}>
                      <p className="font-semibold text-brand-primary">{activity.type} â€¢ {activity.actor?.name ?? "Sistema"}</p>
                      <p>{activity.note ?? activity.subject ?? "-"}</p>
                      <p className="text-slate-500">{toDateTime(activity.createdAt)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  <Input placeholder="Nova nota de atividade" value={activityNote} onChange={(event) => setActivityNote(event.target.value)} />
                  <Button className="w-full" disabled={!activityNote.trim() || addActivityMutation.isPending} onClick={() => addActivityMutation.mutate()} type="button">Adicionar atividade</Button>
                </div>
              </div>
            ) : null}
          </aside>
        </section>
      </AppShell>
    </RequireAuth>
  );
}

